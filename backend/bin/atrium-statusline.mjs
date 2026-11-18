#!/usr/bin/env node
// P211: 판이 띄운 Claude Code·AGY의 상태 줄 명령(statusLine command). 판 데이터 폴더 plugin/에 복사해 부른다(판 코드 폴더를 import하지 않는다).
// 1) 하네스가 표준 입력으로 준 JSON에서 사용량(Claude: rate_limits, AGY: quota·credit 칸)만 골라 판에 알린다(POST /branch/usage-report, 세션 토큰).
// 2) 같은 입력으로 사용자의 상태 줄 명령을 돌려 그 출력을 바이트 그대로 내보낸다. 사용자 명령이 없거나 실패하거나 시간을 넘기면 판의 짧은 기본 줄.
// 상태 줄은 자주 불린다. 늘 0으로 끝나고, 판에 알리기는 기다리되 짧게 끊는다(하네스를 막지 않는다).
// 쓰는 법: atrium-statusline.mjs <claude|agy> [--user-settings <파일>] [--user-cmd-b64 <base64>] [--default line|none]
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const kind = argv[0] === 'agy' ? 'agy' : 'claude';
const flags = {};
for (let i = 1; i < argv.length; i++) if (argv[i].startsWith('--')) { flags[argv[i].slice(2)] = argv[i + 1] ?? ''; i++; }
const env = process.env;
const USER_MS = Math.max(100, Number(env.ATRIUM_STATUSLINE_TIMEOUT_MS) || 2500);
const POST_MS = 700;

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const num = (v) => typeof v === 'number' && Number.isFinite(v);

// 사용자 상태 줄 명령: --user-cmd-b64(띄울 때 판이 정한 것)가 먼저, 없으면 --user-settings 파일의 statusLine(읽기만, 부를 때마다 읽어 사용자가 바꾼 것을 따른다)
export function userCommandOf(f = flags, read = (p) => fs.readFileSync(p, 'utf8')) {
  let cmd = '';
  if (f['user-cmd-b64']) { try { cmd = Buffer.from(f['user-cmd-b64'], 'base64').toString('utf8'); } catch { cmd = ''; } }
  else if (f['user-settings']) {
    try {
      const sl = JSON.parse(read(f['user-settings'])).statusLine;
      if (isObj(sl) && sl.enabled !== false && (!sl.type || sl.type === 'command') && typeof sl.command === 'string') cmd = sl.command;
    } catch { cmd = ''; }
  }
  cmd = String(cmd || '').trim();
  return cmd && !cmd.includes('atrium-statusline') ? cmd : null; // 판의 명령을 다시 부르지 않는다
}

// 판에 알릴 것(값 일부만): Claude는 rate_limits와 모델 이름, AGY는 quota·credit·plan 칸과 모델 이름
export function reportOf(k, j) {
  if (!isObj(j)) return null;
  const model = isObj(j.model) ? { id: j.model.id ?? null, display_name: j.model.display_name ?? null } : typeof j.model === 'string' ? { id: j.model, display_name: null } : null;
  if (k === 'claude') return isObj(j.rate_limits) ? { rate_limits: j.rate_limits, model } : null;
  const pick = Object.fromEntries(Object.entries(j).filter(([key]) => /quota|credit|plan|tier|limit/i.test(key) && !/mail|token|key/i.test(key))); // 계정 메일 등은 보내지 않는다
  return Object.keys(pick).length ? { ...pick, model } : null;
}

// 판의 짧은 기본 줄(사용자 상태 줄이 없을 때). 색 없이
export function defaultLine(k, j) {
  if (!isObj(j)) return '';
  const parts = [];
  const name = isObj(j.model) ? j.model.display_name || j.model.id : typeof j.model === 'string' ? j.model : null;
  if (name) parts.push(String(name));
  const rl = isObj(j.rate_limits) ? j.rate_limits : {};
  const u = [];
  if (isObj(rl.five_hour) && num(rl.five_hour.used_percentage)) u.push('5h ' + Math.round(rl.five_hour.used_percentage) + '%');
  if (isObj(rl.seven_day) && num(rl.seven_day.used_percentage)) u.push('1W ' + Math.round(rl.seven_day.used_percentage) + '%');
  if (u.length) parts.push(u.join(' '));
  return parts.join(' · ');
}

// 사용자 명령을 돌린다(같은 입력, 시간 상한). Windows에서 Git Bash가 부른 것이면 그 bash로(Claude Code의 상태 줄 명령과 같은 셸), 아니면 기본 셸
function shellOf() {
  const sh = env.SHELL || '';
  if (process.platform === 'win32' && /bash(\.exe)?$/i.test(sh)) { try { if (fs.existsSync(sh)) return sh; } catch {} }
  return true;
}
export function runUser(cmd, input, ms = USER_MS) {
  return new Promise((resolve) => {
    let child;
    try { child = spawn(cmd, { shell: shellOf(), windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'], env }); } catch (e) { return resolve({ ok: false, why: 'spawn' }); }
    const out = [];
    let done = false;
    const finish = (r) => { if (done) return; done = true; clearTimeout(timer); resolve(r); };
    const timer = setTimeout(() => {
      // 시간을 넘김: 프로세스 나무째 끈다(셸 아래 node가 남지 않게)
      try { if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); else child.kill('SIGKILL'); } catch {}
      finish({ ok: false, why: 'timeout' });
    }, ms);
    child.stdout.on('data', (d) => out.push(d));
    child.on('error', () => finish({ ok: false, why: 'spawn' }));
    child.on('close', (code) => { const stdout = Buffer.concat(out); finish(code === 0 || stdout.length ? { ok: true, stdout, code } : { ok: false, why: 'exit', code }); });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}

function token() {
  if (env.ATRIUM_SESSION_TOKEN) return env.ATRIUM_SESSION_TOKEN;
  if (!env.ATRIUM_DATA_DIR || !env.ATRIUM_SESSION_ID) return null;
  try { return fs.readFileSync(path.join(env.ATRIUM_DATA_DIR, 'sessions', env.ATRIUM_SESSION_ID + '.token'), 'utf8').trim() || null; } catch { return null; }
}
function post(body) {
  return new Promise((resolve) => {
    const tok = token();
    if (!env.ATRIUM_PORT || !env.ATRIUM_SESSION_ID || !tok) return resolve(false);
    const data = Buffer.from(JSON.stringify(body));
    const req = http.request({ host: '127.0.0.1', port: Number(env.ATRIUM_PORT), path: '/branch/usage-report', method: 'POST', timeout: POST_MS,
      headers: { 'content-type': 'application/json', 'content-length': data.length, authorization: 'Bearer ' + tok, 'x-mt-session': env.ATRIUM_SESSION_ID } }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode === 200)); });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(false));
    req.end(data);
  });
}

// 입력 모양(키 이름과 값의 형만, 값은 남기지 않는다). ATRIUM_STATUSLINE_SHAPE=<파일>이면 그 파일에 쓴다(AGY 입력 확인용)
export function shapeOf(v, depth = 0) {
  if (v === null) return null;
  if (Array.isArray(v)) return depth > 5 ? 'array' : [v.length ? shapeOf(v[0], depth + 1) : 'empty'];
  if (isObj(v)) return depth > 5 ? 'object' : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shapeOf(x, depth + 1)]));
  return typeof v;
}

async function main() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  const raw = Buffer.concat(chunks);
  let j = null;
  try { j = JSON.parse(raw.toString('utf8')); } catch {}
  if (env.ATRIUM_STATUSLINE_SHAPE) { try { fs.writeFileSync(env.ATRIUM_STATUSLINE_SHAPE, JSON.stringify(shapeOf(j), null, 2)); } catch {} }
  const rep = reportOf(kind, j);
  const posting = rep ? post({ kind, input: rep }) : Promise.resolve(false);
  const cmd = userCommandOf();
  const r = cmd ? await runUser(cmd, raw) : null;
  if (r && r.ok) process.stdout.write(r.stdout);
  else if (flags.default !== 'none') process.stdout.write(defaultLine(kind, j));
  await Promise.race([posting, new Promise((res) => setTimeout(res, POST_MS))]);
}

if (path.resolve(process.argv[1] || '').toLowerCase() === path.resolve(fileURLToPath(import.meta.url)).toLowerCase()) {
  main().catch(() => {}).finally(() => process.exit(0));
}
