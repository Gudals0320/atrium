// P372 개발용 판 격리 확인(시험 도구 공통). 개발용 판을 띄우거나 다시 띄우기 전에 판 값이 모두 시험 판을 가리키는지 본다.
// 빠졌거나 실제 판(atrium, 47800, %LOCALAPPDATA%\atrium)·기본 개발용 판(atrium-dev, 47811)·다른 판(47811~47820)을 가리키면 까닭과 고치는 법을 담아 던진다.
// 보는 값: 터미널 세션(ATRIUM_TERMINAL_SESSION, 옛 ATRIUM_HERDR_SESSION은 같은 값), 포트, 데이터 폴더, 창 프로필(창을 띄울 때),
//   대화 기록(ATRIUM_CLAUDE_PROJECTS: 실제 ~/.claude/projects가 아님), 데스크톱 앱 대화(ATRIUM_CLAUDE_DESKTOP=none), Codex 홈(ATRIUM_CODEX_HOME을 주면 실제 ~/.codex가 아님).
// 빠뜨리면 판이 실제 대화 기록을 색인하고 실제 리포 이름의 워크스페이스를 연다(사례: P360이 손으로 다시 띄울 때 4분).
// 쓰는 곳: harness.mjs launch(창), board-agent.mjs(에이전트 명령), scripts/clean-env.sh(손으로 판을 띄우는 명령).
// 명령줄: node app/test/e2e/lib/dev-board.mjs [env] [K=V]... <명령>   (scripts/clean-env.sh가 판 값을 지운 뒤 부른다)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// 판 값 이름. 실제 판 세션의 셸에 남는 값과 같은 이름이다
export const BOARD_KEYS = ['ATRIUM_TERMINAL_SESSION', 'ATRIUM_HERDR_SESSION', 'ATRIUM_PORT', 'ATRIUM_DATA_DIR', 'ATRIUM_APP_USERDATA', 'ATRIUM_CLAUDE_PROJECTS', 'ATRIUM_CLAUDE_DESKTOP', 'ATRIUM_CODEX_HOME'];
// 판 세션 env·부모 Claude Code 표시(지우는 것). clean-env.sh와 같은 꼴
export const STRIP_RE = /^(ATRIUM_|MTASK_|HERDR_|HC_|MT_HERDR|CLAUDECODE$|CLAUDE_CODE_|CLAUDE_EFFORT|CLAUDE_PID$|CLAUDE_AGENT_SDK|ELECTRON_RUN_AS_NODE$|XDG_CONFIG_HOME$)/;
export const REAL_PORT = 47800;
export const DEFAULT_DEV_PORT = 47811;
const localAppData = (env = process.env) => env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
const appData = (env = process.env) => env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
const same = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
const inside = (p, root) => { const r = path.relative(path.resolve(root), path.resolve(p)); return !!r && !r.startsWith('..') && !path.isAbsolute(r); };
const val = (env, name) => (env['ATRIUM_' + name] !== undefined && env['ATRIUM_' + name] !== '' ? env['ATRIUM_' + name] : env['MTASK_' + name] || undefined);
export const sessionOf = (env) => val(env, 'TERMINAL_SESSION') || val(env, 'HERDR_SESSION');

// 판 값을 하나라도 주었는가(없으면 기본 개발용 판으로 간다)
export const hasBoardValues = (env) => BOARD_KEYS.some((k) => env[k] != null && env[k] !== '') || ['HERDR_SESSION', 'PORT', 'DATA_DIR'].some((n) => env['MTASK_' + n]);

// 판 세션 env를 지운 사본
export function stripBoardEnv(env = process.env) { return Object.fromEntries(Object.entries(env).filter(([k]) => !STRIP_RE.test(k))); }

// 문제 목록: [{ key, why, fix }]. window면 창 프로필도 본다. root면 데이터 폴더·창 프로필이 그 안이어야 한다. home은 시험에서 바꾼다
export function isolationProblems(env, { window = false, root = null, home = os.homedir() } = {}) {
  const out = [];
  const add = (key, why, fix) => out.push({ key, why, fix });
  const s = sessionOf(env);
  if (!s) add('ATRIUM_TERMINAL_SESSION', '터미널 세션 이름이 없다(기본 개발용 판 atrium-dev나 실제 판 atrium으로 간다)', 'ATRIUM_TERMINAL_SESSION=atrium-dev-<작업>(옛 ATRIUM_HERDR_SESSION도 같은 값)');
  else if (!/^(atrium|multitask)-dev-./.test(s)) add('ATRIUM_TERMINAL_SESSION', `터미널 세션 ${s}: 시험 판 이름이 아니다(실제 판 atrium, 기본 개발용 판 atrium-dev는 쓰지 않는다)`, 'ATRIUM_TERMINAL_SESSION=atrium-dev-<작업>');
  const a = val(env, 'TERMINAL_SESSION'), b = val(env, 'HERDR_SESSION');
  if (a && b && a !== b) add('ATRIUM_HERDR_SESSION', `ATRIUM_TERMINAL_SESSION(${a})과 옛 ATRIUM_HERDR_SESSION(${b})이 다르다`, '둘을 같은 값으로 주거나 옛 이름을 뺀다');
  const p = val(env, 'PORT');
  if (!p) add('ATRIUM_PORT', `포트가 없다(기본 개발용 판 ${DEFAULT_DEV_PORT}이나 실제 판 ${REAL_PORT}으로 간다)`, 'ATRIUM_PORT=<지시가 준 포트, 예: 481xx>');
  else { const n = Number(p); if (!Number.isInteger(n) || n < 1024 || n > 65535) add('ATRIUM_PORT', `포트 ${p}: 숫자가 아니다`, 'ATRIUM_PORT=<1024~65535>'); else if (n === REAL_PORT) add('ATRIUM_PORT', `포트 ${p}: 실제 판이다`, '지시가 준 개발용 판 포트를 쓴다'); else if (n >= 47811 && n <= 47820) add('ATRIUM_PORT', `포트 ${p}: 기본 개발용 판·다른 판(47811~47820)이다`, '지시가 준 개발용 판 포트를 쓴다'); }
  const d = val(env, 'DATA_DIR');
  if (!d) add('ATRIUM_DATA_DIR', '데이터 폴더가 없다(기본 개발용 판 backend/.dev나 실제 판 %LOCALAPPDATA%\\atrium을 쓴다)', 'ATRIUM_DATA_DIR=<워크트리>/backend/.dev/data');
  else { for (const id of ['atrium', 'multitask']) if (same(d, path.join(localAppData(env), id))) add('ATRIUM_DATA_DIR', `데이터 폴더 ${d}: 실제 판의 폴더다`, 'ATRIUM_DATA_DIR=<워크트리>/backend/.dev/data'); if (root && !inside(d, root)) add('ATRIUM_DATA_DIR', `데이터 폴더 ${d}가 시험 폴더(${root}) 밖이다`, `ATRIUM_DATA_DIR=${path.join(root, 'data')}`); }
  if (window) {
    const u = val(env, 'APP_USERDATA');
    if (!u) add('ATRIUM_APP_USERDATA', '창 프로필이 없다(기본 개발용 창 프로필을 쓴다)', 'ATRIUM_APP_USERDATA=<워크트리>/backend/.dev/app');
    else { for (const id of ['atrium', 'multitask']) for (const x of [`${id}-app-real`, `${id}-app-dev`]) if (same(u, path.join(appData(env), x))) add('ATRIUM_APP_USERDATA', `창 프로필 ${u}: ${x}다`, 'ATRIUM_APP_USERDATA=<워크트리>/backend/.dev/app'); if (root && !inside(u, root)) add('ATRIUM_APP_USERDATA', `창 프로필 ${u}가 시험 폴더(${root}) 밖이다`, `ATRIUM_APP_USERDATA=${path.join(root, 'app')}`); }
  }
  const realProjects = path.join(home, '.claude', 'projects');
  const cp = val(env, 'CLAUDE_PROJECTS');
  if (!cp) add('ATRIUM_CLAUDE_PROJECTS', '대화 기록 폴더가 없다: 판이 실제 ~/.claude/projects를 색인하고 실제 리포 이름의 워크스페이스를 연다', 'ATRIUM_CLAUDE_PROJECTS=C:\\Workspace\\mtask-<작업>-projects(새로 만든 빈 폴더)');
  else if (cp.split(';').filter(Boolean).some((x) => same(x, realProjects))) add('ATRIUM_CLAUDE_PROJECTS', `대화 기록 폴더 ${cp}에 실제 ~/.claude/projects가 있다`, '새로 만든 시험 폴더만 준다');
  const dk = val(env, 'CLAUDE_DESKTOP');
  if (dk !== 'none') add('ATRIUM_CLAUDE_DESKTOP', dk ? `ATRIUM_CLAUDE_DESKTOP=${dk}: 데스크톱 앱 대화 폴더를 읽는다` : '데스크톱 앱 대화를 막지 않았다: 판이 실제 데스크톱 앱 대화 목록을 읽는다', 'ATRIUM_CLAUDE_DESKTOP=none');
  const ch = val(env, 'CODEX_HOME');
  if (ch && ch !== 'none' && (same(ch, path.join(home, '.codex')) || (env.CODEX_HOME && same(ch, env.CODEX_HOME)))) add('ATRIUM_CODEX_HOME', `Codex 홈 ${ch}: 실제 Codex 기록이다`, 'ATRIUM_CODEX_HOME을 빼거나(대화 기록 폴더를 주면 읽지 않는다) none, 또는 시험 폴더');
  return out;
}

export function isolationMessage(problems, what = '개발용 판') {
  return [`${what}을 띄우지 않는다: 격리 값이 빠졌거나 실제 판·다른 판을 가리킨다(docs testing.md 개발용 판, P372).`,
    ...problems.map((x) => `  - ${x.key}: ${x.why}\n    고치기: ${x.fix}`),
    '  판 값은 시험 스크립트 머리에서 실제 판 env를 지운 뒤 모두 넣는다(app/test/e2e/lib/dev-board.mjs devBoardEnv). 손으로 띄울 때는 sh scripts/clean-env.sh env K=V… <명령>',
    '  기본 개발용 판(atrium-dev, 47811)을 일부러 쓸 때만 판 값 없이 MT_DEFAULT_DEV_BOARD=1(그 판은 실제 대화 기록을 읽는다)'].join('\n');
}

export function assertIsolated(env, opts = {}) {
  const problems = isolationProblems(env, opts);
  if (problems.length) { const e = new Error(isolationMessage(problems, opts.what)); e.code = 'not_isolated'; e.problems = problems; throw e; }
  return true;
}

// 판 값 한 벌. name: 작업 이름(p372), port: 백엔드 포트, root: 시험 데이터 뿌리(<워크트리>/backend/.dev), convos: 대화 기록 폴더(새로 만든 빈 폴더)
export function devBoardEnv({ name, port, root, convos, extra = {} }) {
  if (!name || !port || !root || !convos) throw new Error('devBoardEnv: name, port, root, convos를 모두 준다');
  const board = `atrium-dev-${name}`;
  return { ATRIUM_TERMINAL_SESSION: board, ATRIUM_HERDR_SESSION: board, ATRIUM_PORT: String(port), ATRIUM_DATA_DIR: path.join(root, 'data'), ATRIUM_APP_USERDATA: path.join(root, 'app'), ATRIUM_CLAUDE_PROJECTS: convos, ATRIUM_CLAUDE_DESKTOP: 'none', ATRIUM_TEST_PREFIX: `mtask-${name}-`, ...extra };
}

// ---------- 명령줄(scripts/clean-env.sh 뒤): [env] [K=V]... <명령> ----------
// 판을 띄울 수 있는 명령(atrium CLI, 창)은 판 값이 모두 맞아야 돌린다. 판 값 없이 부른 시험 스크립트(node x.mjs)는 그 스크립트가 스스로 판 값을 넣고 확인한다.
export function parseRun(argv) {
  const a = [...argv];
  if (a[0] === 'env') a.shift();
  const set = {};
  while (a.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(a[0])) { const s = a.shift(); const i = s.indexOf('='); set[s.slice(0, i)] = s.slice(i + 1); }
  return { set, cmd: a };
}
export function startsBoard(cmd) {
  const s = cmd.join(' ');
  if (/(^|[\\/\s])(atrium|mtask)(\.mjs|\.cmd)?(\s|$)/.test(s) || /\bmt\.cjs\b/.test(s)) return 'atrium';
  if (/(^|[\\/\s])electron(\.exe|\.cmd)?(\s|$)/.test(s) || /\bnpm(\.cmd)?\s+(run\s+)?(start|real)\b/.test(s)) return 'window';
  return null;
}
const WRAP_HINT = '  감싸개 앞에서 export했거나 감싸개 밖 env로 준 판 값은 감싸개가 지운다: 판 값은 감싸개 뒤에 K=V로 준다(sh scripts/clean-env.sh env ATRIUM_PORT=… <명령>)';
export function runChecked(argv, env = process.env) {
  const { set, cmd } = parseRun(argv);
  if (!cmd.length) return { code: 2, err: '사용: sh scripts/clean-env.sh [env] [K=V]... <명령>' };
  const merged = { ...env, ...set };
  const kind = startsBoard(cmd);
  if (kind && !hasBoardValues(merged) && merged.MT_DEFAULT_DEV_BOARD === '1') return { code: null, cmd, env: merged, note: '기본 개발용 판(47811)을 일부러 쓴다: 실제 대화 기록을 읽는다' }; // 사람이 고른 기본 판만
  if (kind) {
    const problems = isolationProblems(merged, { window: kind === 'window' });
    if (problems.length) return { code: 3, err: isolationMessage(problems) + '\n' + WRAP_HINT };
  } else if (hasBoardValues(set)) {
    const problems = isolationProblems(merged, {});
    if (problems.length) return { code: 3, err: isolationMessage(problems) + '\n' + WRAP_HINT };
  }
  return { code: null, cmd, env: merged };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = runChecked(process.argv.slice(2), stripBoardEnv(process.env));
  if (r.code != null) { console.error(r.err); process.exit(r.code); }
  if (r.note) console.error('clean-env: ' + r.note);
  const p = spawnSync(r.cmd[0], r.cmd.slice(1), { stdio: 'inherit', env: r.env, shell: process.platform === 'win32' && /^(npm|npx)$|\.(cmd|bat)$/i.test(r.cmd[0]) }); // npm.cmd 같은 것만 셸로(인자 따옴표를 지키려고)
  if (p.error) { console.error(String(p.error.message || p.error)); process.exit(127); }
  process.exit(p.status ?? 1);
}
