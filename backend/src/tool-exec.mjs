// 새 rig의 도구 실행기(P249: 옛 tool-runs.mjs·hook-runner.mjs에서 새 rig가 쓰는 것만 옮겼다).
// - run은 인자 배열이고 셸 없이 띄운다. 첫 낱말은 경로 꼴(슬래시·역슬래시가 있거나 .으로 시작)이면 작업 폴더 기준, 아니면 PATH에서 찾는다(Windows는 PATHEXT).
// - Windows에서 첫 낱말이 .cmd·.bat으로 풀리면 cmd.exe /d /s /c로 띄우고 낱말마다 큰따옴표로 묶는다. 묶어도 풀리는 글자(", %, 줄바꿈)가 있으면 띄우지 않는다.
//   에이전트가 준 인자는 [A-Za-z0-9 _.,:=/@+-]만 받는다(badCmdArg).
// - execTool: stdout·stderr를 로그 파일에 logMax까지 쓰고(넘으면 그 뒤는 버리고 끝까지 돌린다), 쓴 바이트의 SHA-256을 돌려준다.
//   시간 제한(tool.timeoutMs)을 넘으면 프로세스 나무째 끈다(timeout). ctx.kill에 끄는 함수를 둔다(판이 꺼질 때 lost).
//   실행 장부는 tool_runs 표(rig-beat.mjs가 쓴다).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

// .cmd·.bat 도구에 줄 수 있는 인자 글자
export const CMD_SAFE_ARG = /^[A-Za-z0-9 _.,:=/@+\-]*$/;
export const TOOL_TAIL_LINES = 40;
export const TOOL_TAIL_CHARS = 4000;

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

export function killTree(child, platform = process.platform) {
  if (!child || child.exitCode != null) return;
  if (platform === 'win32' && child.pid) {
    try { spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).on('error', () => {}); } catch {}
  }
  try { child.kill('SIGKILL'); } catch {}
}

// 정의의 run 낱말 가운데 뿌리 기준 상대 경로(슬래시가 있고 뿌리 아래에 있는 파일)는 절대 경로로. 작업 폴더가 세션 폴더(워크트리)라도
// 도구 스크립트는 정의가 있는 본 체크아웃의 것을 쓴다(정의 검사와 같은 기준). 에이전트가 준 인자는 건드리지 않는다
export function rootedRun(run, root) {
  const isFile = (f) => { try { return fs.statSync(f).isFile(); } catch { return false; } };
  return run.map((w, i) => {
    if (path.isAbsolute(w) || w.startsWith('-') || !/[\\/]/.test(w)) return w;
    const f = path.resolve(root, w);
    if (isFile(f)) return f;
    if (i === 0) for (const e of ['.exe', '.cmd', '.bat', '.com']) if (isFile(f + e)) return f + e;
    return w;
  });
}
// 로그 파일 끝(마지막 줄들) → 글
export function readTail(file, { lines = TOOL_TAIL_LINES, chars = TOOL_TAIL_CHARS } = {}) {
  if (!file) return '';
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const size = fs.fstatSync(fd).size;
    const n = Math.min(size, chars * 4);
    const buf = Buffer.alloc(n);
    fs.readSync(fd, buf, 0, n, size - n);
    let s = buf.toString('utf8');
    if (n < size) s = s.replace(/^[^\n]*\n/, ''); // 잘린 첫 줄은 뺀다
    s = s.split(/\r?\n/).slice(-lines - 1).join('\n');
    return s.length > chars ? s.slice(-chars) : s;
  } catch { return ''; } finally { if (fd != null) try { fs.closeSync(fd); } catch {} }
}
// .cmd·.bat 도구의 인자 검사 → 걸린 인자 | null
export const badCmdArg = (args) => (args || []).find((a) => !CMD_SAFE_ARG.test(String(a))) ?? null;


// 띄우고 끝날 때까지 → { exitCode, status, error, bytes, cut, sha }. ctx: { logMax, platform, kill: Map }
export function execTool(ctx, { id, argv, cwd, env, tool, logPath }) {
  return new Promise((resolve) => {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    const fd = fs.openSync(logPath, 'w');
    const hash = crypto.createHash('sha256');
    let bytes = 0; let cut = false; let why = null; let closed = false; let timer = null;
    const write = (d) => {
      if (closed) return;
      if (bytes >= ctx.logMax) { cut = true; return; }
      const part = bytes + d.length > ctx.logMax ? d.subarray(0, ctx.logMax - bytes) : d;
      if (part.length < d.length) cut = true;
      try { fs.writeSync(fd, part); hash.update(part); bytes += part.length; } catch {}
    };
    const end = (x) => { if (closed) return; closed = true; clearTimeout(timer); try { fs.closeSync(fd); } catch {} resolve({ ...x, bytes, cut, sha: hash.digest('hex') }); };
    let plan;
    try { plan = spawnPlan(argv, { cwd, env, platform: ctx.platform }); }
    catch (e) { return end({ exitCode: null, status: 'error', error: e.message }); }
    let child;
    try { child = spawn(plan.file, plan.args, { cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], windowsVerbatimArguments: plan.verbatim }); }
    catch (e) { return end({ exitCode: null, status: 'error', error: `띄우지 못했다: ${e.message}` }); }
    timer = setTimeout(() => { why = 'timeout'; killTree(child, ctx.platform); }, tool.timeoutMs);
    child.stdout.on('data', write); child.stderr.on('data', write);
    child.on('error', (e) => end({ exitCode: null, status: 'error', error: `띄우지 못했다: ${e.message}` }));
    child.on('close', (code) => end(why === 'timeout' ? { exitCode: code ?? null, status: 'timeout', error: `시간 제한(${tool.timeoutMs}ms)을 넘어 껐다` } : why === 'stopped' ? { exitCode: code ?? null, status: 'lost', error: '보드가 꺼지며 끝냈다' } : { exitCode: code, status: 'done', error: null }));
    ctx.kill = ctx.kill || new Map(); ctx.kill.set(id, () => { why = 'stopped'; killTree(child, ctx.platform); });
  });
}

