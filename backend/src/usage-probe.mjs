// P314: 구독 사용량 탐침. 판 값(상태 줄·rollout)이 낡으면 하네스 자신의 사용량 명령을 한 번 불러 채운다(P311 조사).
// 자격 증명은 하네스가 쓰고 판은 출력만 읽는다(로그인·키 파일은 열지 않는다):
// - Codex: codex app-server(stdio JSON-RPC) initialize → initialized → account/rateLimits/read (약 1~2초, JSON)
// - Claude: claude -p "/usage" --output-format json(모델 턴 없음, 비용 0). 사용자 훅·플러그인·MCP를 끈 판 설정으로 띄우고
//   대화를 남기지 않는다(--no-session-persistence). 판 데이터 아래 고정 폴더를 작업 폴더로 쓰고, Claude Code가 만든 빈 프로젝트 폴더는 치운다
// - 키로만 읽히는 잔액(DeepSeek, OpenRouter): secret-run <grant> -- node bin/atrium-balance.mjs. 그 grant의 키만 읽개 프로세스가 받고 판은 잔액 숫자만 읽는다
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { toMs, windowIdOf } from './usage.mjs';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const num = (v) => typeof v === 'number' && Number.isFinite(v);
const pct = (v) => Math.max(0, Math.min(100, Math.round(v * 10) / 10));

// ---------- 출력 → 구독 값 ----------
// codex app-server account/rateLimits/read 결과 → 구독 값 | null(usage.mjs codexUsageOf와 같은 꼴, 키 이름만 camelCase)
export function codexProbeUsageOf(result, at = Date.now()) {
  const rl = isObj(result) && isObj(result.rateLimits) ? result.rateLimits : null;
  if (!rl) return null;
  const windows = [];
  for (const key of ['primary', 'secondary']) {
    const w = rl[key];
    if (!isObj(w) || !num(w.usedPercent)) continue;
    const minutes = num(w.windowDurationMins) ? w.windowDurationMins : null;
    windows.push({ id: windowIdOf(minutes), minutes, usedPct: pct(w.usedPercent), resetsAt: toMs(w.resetsAt) });
  }
  if (!windows.length) return null;
  const c = isObj(rl.credits) ? rl.credits : null;
  const credits = c ? { hasCredits: !!c.hasCredits, unlimited: !!c.unlimited, balance: c.balance == null ? null : String(c.balance) } : null;
  return { provider: 'codex', source: 'probe:codex', at, windows, credits, plan: typeof rl.planType === 'string' ? rl.planType : null, model: null };
}

// Claude /usage 글의 리셋 시각("Nov 26, 6am (Asia/Seoul)", "3:50pm (Asia/Seoul)", "Nov 26 at 6:30pm") → 밀리초 | null
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
function wallOf(ms, tz) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' });
  const p = Object.fromEntries(f.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { y: Number(p.year), mo: Number(p.month) - 1, d: Number(p.day), h: Number(p.hour) % 24, mi: Number(p.minute) };
}
// 그 시간대의 벽시계 시각 → 밀리초(시간대를 모르면 이 PC 시각)
function zoned(y, mo, d, h, mi, tz) {
  const want = Date.UTC(y, mo, d, h, mi);
  if (!tz) return new Date(y, mo, d, h, mi).getTime();
  let g = want;
  try { for (let i = 0; i < 3; i++) { const w = wallOf(g, tz); g += want - Date.UTC(w.y, w.mo, w.d, w.h, w.mi); } } catch { return new Date(y, mo, d, h, mi).getTime(); }
  return g;
}
export function parseResetText(s, now = Date.now()) {
  const m = /^(?:([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:,|\s+at)?\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:\(([^)]+)\))?\s*$/i.exec(String(s || '').trim());
  if (!m) return null;
  let h = Number(m[3]); const mi = m[4] ? Number(m[4]) : 0;
  const ap = m[5] ? m[5].toLowerCase() : null;
  if (ap === 'pm' && h < 12) h += 12; if (ap === 'am' && h === 12) h = 0;
  if (h > 23 || mi > 59) return null;
  let tz = m[6] ? m[6].trim() : null;
  if (tz) { try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); } catch { tz = null; } }
  const today = tz ? wallOf(now, tz) : (() => { const d = new Date(now); return { y: d.getFullYear(), mo: d.getMonth(), d: d.getDate() }; })();
  if (m[1]) {
    const mo = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase());
    if (mo < 0) return null;
    let t = zoned(today.y, mo, Number(m[2]), h, mi, tz);
    if (t < now - 30 * 86400000) t = zoned(today.y + 1, mo, Number(m[2]), h, mi, tz); // 해가 바뀌는 때(12월에 본 1월 리셋)
    return t;
  }
  let t = zoned(today.y, today.mo, today.d, h, mi, tz);
  if (t < now - 60000) t += 86400000; // 시각만 오면 다음 그 시각
  return t;
}
// claude -p "/usage" 의 result 글 → 구독 값 | null. 줄 꼴: "Current session: 12% used · resets 3pm (Asia/Seoul)",
//   "Current week (all models): 55% used · resets Nov 26, 6am (Asia/Seoul)", "Current week (Fable): 13% used · …"(모델별 주간 → id week:<모델>)
export function claudeProbeUsageOf(text, at = Date.now()) {
  const windows = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    const m = /^\s*Current (session|week(?:\s*\(([^)]+)\))?)\s*:\s*(\d+(?:\.\d+)?)\s*% used(?:\s*[·•-]\s*resets\s+(.+?))?\s*$/i.exec(raw);
    if (!m) continue;
    const session = /^session$/i.test(m[1]);
    const model = !session && m[2] && !/^all models$/i.test(m[2].trim()) ? m[2].trim() : null;
    const id = session ? '5h' : model ? `week:${model}` : 'week';
    if (windows.some((w) => w.id === id)) continue;
    windows.push({ id, minutes: session ? 300 : 10080, usedPct: pct(Number(m[3])), resetsAt: m[4] ? parseResetText(m[4], at) : null });
  }
  if (!windows.length) return null;
  return { provider: 'claude', source: 'probe:claude', at, windows, credits: null, plan: null, model: null };
}

// 잔액 읽개(bin/atrium-balance.mjs) 출력(한 줄에 JSON 하나) → [구독 값]. 키 값은 읽개가 내지 않고 판도 받지 않는다(숫자·통화·오류 꼴만 받는다)
export const BALANCE_PROVIDERS = ['deepseek', 'openrouter'];
export function balanceEntriesOf(stdout, at = Date.now()) {
  const out = [];
  for (const line of String(stdout || '').split(/\r?\n/)) {
    let o; try { o = JSON.parse(line); } catch { continue; }
    if (!isObj(o) || !BALANCE_PROVIDERS.includes(o.provider)) continue;
    const total = Number(o.balance);
    if (!Number.isFinite(total)) continue;
    const cur = typeof o.currency === 'string' && /^[A-Z]{3}$/.test(o.currency) ? o.currency : null;
    out.push({ provider: o.provider, source: 'probe:balance', at, windows: [], credits: null, plan: null, model: null, balance: { total: Math.round(total * 100) / 100, currency: cur } });
  }
  return out;
}

// ---------- 부르개 ----------
// 탐침 자식의 환경: 판·세션 변수(ATRIUM_*, HC_*, Claude Code 세션 표시)와 API 키는 넘기지 않는다(하네스는 자기 로그인을 쓴다)
export function probeEnv(env = process.env) {
  const out = {};
  for (const [k, v] of Object.entries(env)) {
    if (/^(ATRIUM_|MTASK_|HC_|HERDR_|CLAUDECODE$|CLAUDE_CODE_ENTRYPOINT$|CLAUDE_CODE_SSE_PORT$|ANTHROPIC_API_KEY$|ANTHROPIC_AUTH_TOKEN$|OPENAI_API_KEY$)/.test(k)) continue;
    out[k] = v;
  }
  return out;
}
function killTree(p) {
  if (!p || p.exitCode != null) return;
  if (process.platform === 'win32' && p.pid) execFile('taskkill', ['/pid', String(p.pid), '/T', '/F'], { windowsHide: true }, () => {});
  else try { p.kill(); } catch {}
}
// 명령 하나를 돌려 표준 출력을 받는다(기한이 지나면 프로세스 나무째 끈다) → { code, out }
export function runOnce(file, args, { cwd, env, timeoutMs = 60000, shell = false, input = null } = {}) {
  return new Promise((resolve) => {
    // shell이면 명령과 인자를 한 글로 잇는다(인자는 판이 정한 고정 글뿐이다. Node가 셸 인자 배열을 경고한다)
    let p; try { p = shell ? spawn([file, ...args].join(' '), { cwd, env, shell: true, windowsHide: true, stdio: [input == null ? 'ignore' : 'pipe', 'pipe', 'pipe'] }) : spawn(file, args, { cwd, env, windowsHide: true, stdio: [input == null ? 'ignore' : 'pipe', 'pipe', 'pipe'] }); } catch (e) { resolve({ code: -1, out: '', err: e.message }); return; }
    let out = '', err = '', done = false;
    const end = (code) => { if (done) return; done = true; clearTimeout(timer); resolve({ code, out, err: err.slice(-2000) }); };
    const timer = setTimeout(() => { killTree(p); end(-2); }, timeoutMs);
    p.stdout.on('data', (d) => { if (out.length < 4 * 1024 * 1024) out += d; });
    p.stderr.on('data', (d) => { if (err.length < 64 * 1024) err += d; });
    p.on('error', (e) => { err += e.message; end(-1); });
    p.on('close', (c) => end(c));
    if (input != null) { p.stdin.on('error', () => {}); p.stdin.end(input); }
  });
}

// codex app-server에 사용량을 묻는다 → 구독 값 | null. command는 Windows면 셸로 부른다(npm 꾸러미 codex.cmd)
export function probeCodex({ command = 'codex', env = probeEnv(), timeoutMs = 15000, now = () => Date.now() } = {}) {
  return new Promise((resolve) => {
    const win = process.platform === 'win32';
    let p; try { p = win ? spawn(`${command} app-server`, { shell: true, env, windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] }) : spawn(command, ['app-server'], { env, windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] }); } catch { resolve(null); return; }
    let buf = '', done = false;
    const end = (v) => { if (done) return; done = true; clearTimeout(timer); try { p.stdin.end(); } catch {} setTimeout(() => killTree(p), 300); resolve(v); };
    const timer = setTimeout(() => end(null), timeoutMs);
    const send = (o) => { try { p.stdin.write(JSON.stringify(o) + '\n'); } catch {} };
    p.stdin.on('error', () => {});
    p.on('error', () => end(null));
    p.on('close', () => end(null));
    p.stdout.on('data', (d) => {
      buf += d;
      for (let i; (i = buf.indexOf('\n')) >= 0;) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1);
        let o; try { o = JSON.parse(line); } catch { continue; }
        if (!isObj(o)) continue;
        if (o.id === 1) { if (o.error) { end(null); return; } send({ jsonrpc: '2.0', method: 'initialized' }); send({ jsonrpc: '2.0', id: 2, method: 'account/rateLimits/read', params: null }); }
        else if (o.id === 2) { end(o.error ? null : codexProbeUsageOf(o.result, now())); return; }
      }
    });
    send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { clientInfo: { name: 'atrium-usage', version: '1' } } });
  });
}

// Claude Code 프로젝트 폴더 이름(작업 폴더 경로의 영문·숫자 밖 글자를 -로)
export const claudeProjectDirName = (cwd) => path.resolve(String(cwd)).replace(/[^A-Za-z0-9]/g, '-');
// 빈 폴더만(파일이 하나도 없으면) 지운다. 대화 기록이 생겼으면 남긴다(사람이 볼 수 있게) → 지웠나
export function removeIfEmptyTree(dir) {
  const hasFile = (d) => { let names = []; try { names = fs.readdirSync(d, { withFileTypes: true }); } catch { return false; } return names.some((n) => (n.isDirectory() ? hasFile(path.join(d, n.name)) : true)); };
  if (!fs.existsSync(dir) || hasFile(dir)) return false;
  try { fs.rmSync(dir, { recursive: true, force: true }); return true; } catch { return false; }
}
// 판이 Claude 탐침에 넘기는 설정(사용자 훅·상태 줄을 끈다). 사용자 설정 파일은 --setting-sources local로 읽지 않는다
export const CLAUDE_PROBE_SETTINGS = Object.freeze({ disableAllHooks: true });
export function claudeProbeArgs(settingsFile) {
  return ['-p', '/usage', '--output-format', 'json', '--setting-sources', 'local', '--settings', settingsFile, '--strict-mcp-config', '--no-session-persistence'];
}
// claude -p "/usage" → 구독 값 | null. dir = 판 데이터 아래 탐침 폴더(작업 폴더와 설정 파일), projectsDir = ~/.claude/projects(빈 프로젝트 폴더 치우기)
export async function probeClaude({ command = 'claude', dir, projectsDir = path.join(os.homedir(), '.claude', 'projects'), env = probeEnv(), timeoutMs = 90000, now = () => Date.now(), run = runOnce } = {}) {
  if (!dir) return null;
  const cwd = path.join(dir, 'claude');
  fs.mkdirSync(cwd, { recursive: true });
  const settingsFile = path.join(dir, 'claude-settings.json');
  fs.writeFileSync(settingsFile, JSON.stringify(CLAUDE_PROBE_SETTINGS));
  let r;
  try { r = await run(command, claudeProbeArgs(settingsFile), { cwd, env, timeoutMs, shell: false }); }
  finally { if (projectsDir) removeIfEmptyTree(path.join(projectsDir, claudeProjectDirName(cwd))); }
  if (!r || r.code !== 0) return null;
  let o; try { o = JSON.parse(r.out); } catch { return null; }
  if (!isObj(o) || o.is_error || (num(o.num_turns) && o.num_turns > 0)) return null; // 모델 턴이 돌았으면(/usage가 명령으로 읽히지 않음) 버린다
  return claudeProbeUsageOf(o.result, now());
}
// secret-run으로 잔액 읽개를 띄운다 → [구독 값] | null(grant가 없거나 실패). secretRun = { ps1 } 또는 { argv: [실행 파일, ...앞 인자] }(시험용 가짜)
//   Windows: powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File <secret-run.ps1> <grant> -- <node> <읽개>, 자식 env에서 PSModulePath를 뺀다
export function balanceArgv({ secretRun, grant, node = process.execPath, reader }) {
  if (!secretRun || !grant || !reader) return null;
  const tail = [grant, '--', node, reader];
  if (Array.isArray(secretRun.argv) && secretRun.argv.length) return [secretRun.argv[0], [...secretRun.argv.slice(1), ...tail]];
  if (secretRun.ps1) return ['powershell.exe', ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', secretRun.ps1, ...tail]];
  return null;
}
export async function probeBalance({ secretRun, grant, node = process.execPath, reader = defaultBalanceReader(), env = probeEnv(), timeoutMs = 30000, now = () => Date.now(), run = runOnce } = {}) {
  const a = balanceArgv({ secretRun, grant, node, reader });
  if (!a) return null;
  const e = { ...env }; for (const k of Object.keys(e)) if (k.toUpperCase() === 'PSMODULEPATH') delete e[k];
  const r = await run(a[0], a[1], { env: e, timeoutMs, shell: false });
  if (!r || r.code !== 0) return null;
  return balanceEntriesOf(r.out, now());
}
export const defaultBalanceReader = () => fileURLToPath(new URL('../bin/atrium-balance.mjs', import.meta.url));

// secret-run 찾기: ATRIUM_SECRET_RUN(ps1 경로, none이면 끔) → PATH의 secret-run.ps1(또는 secret-run.cmd 옆 ps1) → null
export function findSecretRun(env = process.env) {
  const v = env.ATRIUM_SECRET_RUN;
  if (v === 'none') return null;
  if (v) return fs.existsSync(v) ? { ps1: path.resolve(v) } : null;
  if (process.platform !== 'win32') return null;
  const dirs = String(env.PATH || env.Path || '').split(path.delimiter).filter(Boolean);
  for (const d of dirs) {
    const ps1 = path.join(d, 'secret-run.ps1');
    if (fs.existsSync(ps1)) return { ps1 };
    const cmd = path.join(d, 'secret-run.cmd');
    if (fs.existsSync(cmd)) {
      // PATH 꾸러미가 다른 곳의 secret-run.cmd·ps1을 부르면 그 폴더의 secret-run.ps1
      try { const m = /([A-Za-z]:[^"\r\n]*?)[\\/]secret-run\.(?:cmd|ps1)/i.exec(fs.readFileSync(cmd, 'utf8')); const p = m && path.join(m[1], 'secret-run.ps1'); if (p && fs.existsSync(p)) return { ps1: p }; } catch {}
    }
  }
  return null;
}
