// P182: rig 훅 실행기(하네스 1단계, docs research harness-arch.md 13절 "훅").
// - run은 인자 배열이고 셸 없이 띄운다. 첫 낱말은 경로 꼴(슬래시·역슬래시가 있거나 .으로 시작)이면 작업 폴더(워크스페이스 뿌리) 기준, 아니면 PATH에서 찾는다(Windows는 PATHEXT).
// - Windows에서 첫 낱말이 .cmd·.bat으로 풀리면(npx 등) Node가 셸 없이 띄우지 못한다. 그때만 cmd.exe /d /s /c로 띄우고 낱말마다 큰따옴표로 묶는다.
//   큰따옴표 안에서도 cmd.exe가 풀어 버리는 글자(", %, 줄바꿈)가 낱말에 있으면 띄우지 않고 실패로 돌려준다(인자는 정의에서만 온다).
// - 입력은 stdin JSON 한 덩어리, 출력은 stdout JSON 하나(1MB까지. 넘으면 끊고 실패). 시간 제한 기본 10초, 최대 60초(넘으면 프로세스 나무째 끈다).
// - 실패: 종료 코드가 0이 아님, JSON이 아님, 모르는 action, 시간 초과, 출력이 너무 큼, 첫 낱말을 못 찾음. 실패를 어떻게 다룰지(onFail)는 부르는 쪽(rig.mjs)이 정한다.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const HOOK_TIMEOUT_MS = 10000;
export const HOOK_TIMEOUT_MAX_MS = 60000;
export const HOOK_OUT_MAX = 1024 * 1024;
export const HOOK_ACTIONS = ['pass', 'rewrite', 'reject'];
const NOTE_MAX = 4000;
const REASON_MAX = 2000;
const ERR_TAIL = 400;

const isFile = (f) => { try { return fs.statSync(f).isFile(); } catch { return false; } };
const envGet = (env, name) => { const k = Object.keys(env || {}).find((x) => x.toUpperCase() === name); return k ? env[k] : undefined; };
export const pathish = (w) => /[\\/]/.test(w) || w.startsWith('.');

// 첫 낱말을 실제 파일로 푼다 → 절대 경로 | null
export function findExe(word, { cwd, env = process.env, platform = process.platform } = {}) {
  const w = String(word || '');
  if (!w) return null;
  const win = platform === 'win32';
  const exts = win ? String(envGet(env, 'PATHEXT') || '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean).map((e) => e.toLowerCase()) : [];
  const cands = (base) => (!win ? [base] : path.extname(base) ? [base, ...exts.map((e) => base + e)] : exts.map((e) => base + e));
  if (path.isAbsolute(w) || pathish(w)) {
    for (const c of cands(path.resolve(cwd || '.', w))) if (isFile(c)) return c;
    return null;
  }
  const dirs = String(envGet(env, 'PATH') || '').split(path.delimiter).filter(Boolean);
  for (const d of dirs) for (const c of cands(path.join(d, w))) if (isFile(c)) return c;
  return null;
}

// .cmd·.bat을 cmd.exe로 띄울 한 줄. 낱말마다 큰따옴표로 묶고, 묶어도 풀리는 글자가 있으면 던진다
const CMD_BAD = /["%\r\n\0]/;
export function cmdLine(file, args) {
  for (const a of [file, ...args]) if (CMD_BAD.test(String(a))) throw Object.assign(new Error(`.cmd·.bat 훅의 인자에 쓸 수 없는 글자(", %, 줄바꿈)가 있다: ${String(a).slice(0, 80)}`), { code: 'cmd_arg' });
  return [file, ...args].map((a) => `"${a}"`).join(' ');
}
// 띄울 모양 → { file, args, verbatim }
export function spawnPlan(run, { cwd, env = process.env, platform = process.platform } = {}) {
  const exe = findExe(run[0], { cwd, env, platform });
  if (!exe) throw Object.assign(new Error(`실행 파일을 찾지 못했다: ${run[0]}`), { code: 'not_found' });
  const rest = run.slice(1).map(String);
  if (platform === 'win32' && /\.(cmd|bat)$/i.test(exe)) {
    const line = cmdLine(exe, rest);
    return { file: envGet(env, 'COMSPEC') || 'cmd.exe', args: ['/d', '/s', '/c', `"${line}"`], verbatim: true, exe, viaCmd: true };
  }
  return { file: exe, args: rest, verbatim: false, exe, viaCmd: false };
}

// 훅의 stdout → { ok: true, out } | { ok: false, error }
export function parseHookOutput(stdout) {
  const s = String(stdout ?? '').trim();
  if (!s) return { ok: true, out: { action: 'pass' } };
  let o;
  try { o = JSON.parse(s); } catch { return { ok: false, error: `JSON이 아니다: ${s.slice(0, 120)}` }; }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return { ok: false, error: 'JSON 객체가 아니다' };
  const action = o.action == null ? 'pass' : String(o.action);
  if (!HOOK_ACTIONS.includes(action)) return { ok: false, error: `모르는 action: ${action}` };
  const out = { action };
  if (o.text != null) { if (typeof o.text !== 'string') return { ok: false, error: 'text는 글이어야 한다' }; out.text = o.text; }
  if (o.args != null) { if (!Array.isArray(o.args)) return { ok: false, error: 'args는 배열이어야 한다' }; out.args = o.args.map(String); }
  if (o.append != null) { if (typeof o.append !== 'string') return { ok: false, error: 'append는 글이어야 한다' }; out.append = o.append; }
  if (o.reason != null) out.reason = String(o.reason).slice(0, REASON_MAX);
  if (o.note != null) out.note = (typeof o.note === 'string' ? o.note : JSON.stringify(o.note)).slice(0, NOTE_MAX);
  return { ok: true, out };
}

// 프로세스 나무째 끈다(Windows는 cmd.exe 아래 node 같은 손자도)
export function killTree(child, platform = process.platform) {
  if (!child || child.exitCode != null) return;
  if (platform === 'win32' && child.pid) {
    try { spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).on('error', () => {}); } catch {}
  }
  try { child.kill('SIGKILL'); } catch {}
}

// 훅 하나를 돌린다 → { ok, out?, error?, code, ms, argv }
export function runHook({ run, cwd, env = process.env, input, timeoutMs = HOOK_TIMEOUT_MS, maxOut = HOOK_OUT_MAX, platform = process.platform }) {
  const t0 = Date.now();
  const limit = Math.min(Math.max(Number(timeoutMs) || HOOK_TIMEOUT_MS, 1), HOOK_TIMEOUT_MAX_MS);
  return new Promise((resolve) => {
    let plan;
    try { plan = spawnPlan(run, { cwd, env, platform }); } catch (e) { resolve({ ok: false, error: e.message, code: null, ms: Date.now() - t0, argv: run }); return; }
    let child;
    try { child = spawn(plan.file, plan.args, { cwd, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], windowsVerbatimArguments: plan.verbatim }); }
    catch (e) { resolve({ ok: false, error: `띄우지 못했다: ${e.message}`, code: null, ms: Date.now() - t0, argv: run }); return; }
    const out = []; let outLen = 0; let err = ''; let why = null; let settled = false;
    const finish = (r) => { if (settled) return; settled = true; clearTimeout(timer); resolve({ ...r, ms: Date.now() - t0, argv: run, ...(plan.viaCmd ? { viaCmd: true } : {}) }); };
    const timer = setTimeout(() => { why = `시간 초과(${limit}ms)`; killTree(child, platform); }, limit);
    child.stdout.on('data', (d) => {
      if (why) return;
      outLen += d.length;
      if (outLen > maxOut) { why = `출력이 너무 크다(${maxOut}바이트 넘음)`; killTree(child, platform); return; }
      out.push(d);
    });
    child.stderr.on('data', (d) => { err = (err + d.toString('utf8')).slice(-ERR_TAIL); });
    child.on('error', (e) => finish({ ok: false, error: `띄우지 못했다: ${e.message}`, code: null }));
    child.stdin.on('error', () => {}); // 입력을 읽지 않고 끝난 훅(EPIPE)
    child.on('close', (code) => {
      if (why) return finish({ ok: false, error: why, code });
      if (code !== 0) return finish({ ok: false, error: `종료 코드 ${code}${err.trim() ? `: ${err.trim()}` : ''}`, code });
      const p = parseHookOutput(Buffer.concat(out).toString('utf8'));
      finish(p.ok ? { ok: true, out: p.out, code } : { ok: false, error: p.error, code });
    });
    try { child.stdin.end(JSON.stringify(input ?? {})); } catch {}
  });
}
