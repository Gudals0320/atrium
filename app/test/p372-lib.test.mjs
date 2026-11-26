// P372 단위 시험: 시험 도구. 개발용 판 격리 확인(lib/dev-board.mjs, scripts/clean-env.sh 뒤의 명령줄), CSS 블록 자리 검사(scripts/check-css.mjs),
// 옛 앱 빌드(scripts/old-build.mjs: backend/src를 함께 풀고 빌드 뒤 확인). 판 명령 모듈(lib/board-agent.mjs)은 backend/test/p372.test.mjs가 가짜 판으로 본다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isolationProblems, assertIsolated, devBoardEnv, runChecked, startsBoard, stripBoardEnv, hasBoardValues } from './e2e/lib/dev-board.mjs';
import { cssProblems } from '../scripts/check-css.mjs';

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.resolve(APP, '..');
const { oldBuild, checkOldTree, checkOldBuild, cleanOld, treePaths } = await import(pathToFileURL(path.join(REPO, 'scripts', 'old-build.mjs')).href);
const HOME = path.join(os.tmpdir(), 'p372-home');
const ROOT = path.join(REPO, 'backend', '.dev');
const OK = devBoardEnv({ name: 'p372t', port: 48107, root: ROOT, convos: 'C:\\Workspace\\mtask-p372t-projects' });
const keys = (env, o = {}) => isolationProblems(env, { home: HOME, ...o }).map((x) => x.key);

test('격리: 한 벌을 모두 주면 통과, 하나라도 빠지면 그 값과 고치는 법', () => {
  assert.deepEqual(keys(OK, { window: true, root: ROOT }), []);
  assert.equal(assertIsolated(OK, { window: true, home: HOME }), true);
  for (const k of ['ATRIUM_PORT', 'ATRIUM_DATA_DIR', 'ATRIUM_CLAUDE_PROJECTS', 'ATRIUM_CLAUDE_DESKTOP', 'ATRIUM_APP_USERDATA']) {
    const e = { ...OK }; delete e[k];
    assert.ok(keys(e, { window: true }).includes(k), k);
  }
  const e = { ...OK }; delete e.ATRIUM_TERMINAL_SESSION; delete e.ATRIUM_HERDR_SESSION;
  assert.deepEqual(keys(e), ['ATRIUM_TERMINAL_SESSION']);
  assert.ok(keys({ ...OK, ATRIUM_HERDR_SESSION: undefined, MTASK_HERDR_SESSION: 'atrium-dev-p372t' }).length === 0, '옛 이름도 받는다');
  try { assertIsolated({ ...OK, ATRIUM_CLAUDE_DESKTOP: undefined }, { home: HOME }); assert.fail(); } catch (err) { assert.equal(err.code, 'not_isolated'); assert.match(err.message, /ATRIUM_CLAUDE_DESKTOP/); assert.match(err.message, /고치기: ATRIUM_CLAUDE_DESKTOP=none/); }
});

test('격리: 실제 판·기본 개발용 판·다른 판·실제 대화 기록을 가리키면 막는다', () => {
  assert.ok(keys({ ...OK, ATRIUM_PORT: '47800' }).includes('ATRIUM_PORT'));
  assert.ok(keys({ ...OK, ATRIUM_PORT: '47811' }).includes('ATRIUM_PORT'));
  for (const s of ['atrium', 'atrium-dev', 'default']) assert.ok(keys({ ...OK, ATRIUM_TERMINAL_SESSION: s, ATRIUM_HERDR_SESSION: s }).includes('ATRIUM_TERMINAL_SESSION'), s);
  assert.ok(keys({ ...OK, ATRIUM_HERDR_SESSION: 'atrium-dev-other' }).includes('ATRIUM_HERDR_SESSION'), '옛 이름과 짝이 다르면');
  const lad = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  assert.ok(keys({ ...OK, ATRIUM_DATA_DIR: path.join(lad, 'atrium') }).includes('ATRIUM_DATA_DIR'));
  assert.ok(keys({ ...OK, ATRIUM_DATA_DIR: 'C:\\elsewhere' }, { root: ROOT }).includes('ATRIUM_DATA_DIR'));
  assert.ok(keys({ ...OK, ATRIUM_CLAUDE_PROJECTS: 'C:\\x;' + path.join(HOME, '.claude', 'projects') }).includes('ATRIUM_CLAUDE_PROJECTS'));
  assert.ok(keys({ ...OK, ATRIUM_CLAUDE_DESKTOP: path.join(lad, 'Claude-Data') }).includes('ATRIUM_CLAUDE_DESKTOP'));
  assert.ok(keys({ ...OK, ATRIUM_CODEX_HOME: path.join(HOME, '.codex') }).includes('ATRIUM_CODEX_HOME'));
  assert.deepEqual(keys({ ...OK, ATRIUM_CODEX_HOME: 'none' }), []);
});

test('clean-env 명령줄: 판을 띄울 수 있는 명령은 격리 값이 모두 맞아야 돌고, 다시 띄울 때도 같다', () => {
  const bare = stripBoardEnv({ PATH: 'x', ATRIUM_PORT: '47800', ATRIUM_SESSION_ID: 'real', HC_X: '1', CLAUDECODE: '1' });
  assert.deepEqual(bare, { PATH: 'x' }, '실제 판 env를 지운다');
  assert.equal(startsBoard(['node', 'backend/bin/atrium.mjs', '--dev', 'backend', 'start']), 'atrium');
  assert.equal(startsBoard(['node', 'experiments/p6c/tools/mt.cjs', 'ls']), 'atrium');
  assert.equal(startsBoard(['npm', 'start']), 'window');
  assert.equal(startsBoard(['node', 'app/test/e2e/p331-map-todo.mjs', 'setup']), null);
  // 판 값 없이 atrium(백엔드 다시 띄우기 포함) → 거절(사례 21: 손 감싸개로 다시 띄우며 대화 기록 격리를 빠뜨림)
  let r = runChecked(['node', 'backend/bin/atrium.mjs', '--dev', 'backend', 'start'], bare);
  assert.equal(r.code, 3); assert.match(r.err, /ATRIUM_CLAUDE_PROJECTS/); assert.match(r.err, /ATRIUM_PORT/);
  assert.match(r.err, /감싸개 뒤에 K=V로/, '사례 9: export한 값은 감싸개가 지운다');
  // 판 값 일부만 → 거절
  r = runChecked(['env', 'ATRIUM_TERMINAL_SESSION=atrium-dev-p372t', 'ATRIUM_PORT=48107', 'ATRIUM_DATA_DIR=' + OK.ATRIUM_DATA_DIR, 'node', 'backend/bin/atrium.mjs', '--dev', 'backend', 'start'], bare);
  assert.equal(r.code, 3); assert.match(r.err, /ATRIUM_CLAUDE_DESKTOP/);
  // 한 벌 → 돈다(값이 명령 env로 간다)
  const kv = Object.entries(OK).map(([k, v]) => k + '=' + v);
  r = runChecked(['env', ...kv, 'node', 'backend/bin/atrium.mjs', '--dev', 'backend', 'start'], bare);
  assert.equal(r.code, null); assert.equal(r.env.ATRIUM_PORT, '48107'); assert.deepEqual(r.cmd, ['node', 'backend/bin/atrium.mjs', '--dev', 'backend', 'start']);
  // 창(npm start)은 창 프로필도
  r = runChecked(['env', ...kv.filter((x) => !x.startsWith('ATRIUM_APP_USERDATA')), 'npm', 'start'], bare);
  assert.equal(r.code, 3); assert.match(r.err, /ATRIUM_APP_USERDATA/);
  // 판 값을 스스로 넣는 시험 스크립트는 그대로, 기본 개발용 판은 일부러 고를 때만
  assert.equal(runChecked(['node', 'app/test/e2e/p331-map-todo.mjs', 'setup'], bare).code, null);
  assert.equal(runChecked(['MT_DEFAULT_DEV_BOARD=1', 'node', 'backend/bin/atrium.mjs', '--dev', 'ls'], bare).code, null);
  assert.ok(!hasBoardValues(bare));
  // 셸 감싸개가 있고 이 명령줄을 부른다
  const sh = fs.readFileSync(path.join(REPO, 'scripts', 'clean-env.sh'), 'utf8');
  assert.match(sh, /app\/test\/e2e\/lib\/dev-board\.mjs/); assert.match(sh, /unset/);
});

test('clean-env.sh: 판 값 없이 atrium을 부르면 3으로 끝나고 까닭을 보인다(실제 셸)', { skip: spawnSync('sh', ['-c', 'true']).status !== 0 && 'sh 없음' }, () => {
  const r = spawnSync('sh', [path.join(REPO, 'scripts', 'clean-env.sh'), 'node', path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', 'backend', 'start'], { encoding: 'utf8', env: { ...process.env, ATRIUM_PORT: '47800' } });
  assert.equal(r.status, 3, r.stderr); assert.match(r.stderr, /개발용 판을 띄우지 않는다/); assert.match(r.stderr, /ATRIUM_CLAUDE_PROJECTS/);
});

test('창 시험 실행기와 판 막기에 격리 확인이 걸려 있다', () => {
  const h = fs.readFileSync(path.join(APP, 'test', 'e2e', 'harness.mjs'), 'utf8');
  assert.match(h, /assertIsolated\(full, \{ window: true/);
  const g = fs.readFileSync(path.join(APP, 'test', 'e2e', 'p9-guard.mjs'), 'utf8');
  assert.match(g, /isolationProblems\(atriumEnv\(env\)/);
});

// ---------- CSS 블록 자리 ----------
const css = fs.readFileSync(path.join(APP, 'src', 'renderer', 'styles.css'), 'utf8');
test('check:css: 지금 styles.css는 통과', () => { assert.deepEqual(cssProblems(css), []); });
test('check:css: 끝에 reduce 블록을 더하면(사례 11) 그 줄과 "no-preference 안에" 고치는 법', () => {
  const p = cssProblems(css + '\n/* P999 */\n@media (prefers-reduced-motion: reduce) { .mt-x { opacity: 1; } }\n');
  const r = p.filter((x) => x.rule === 'reduce-last');
  assert.equal(r.length, 1); assert.match(r[0].msg, /P85·P107 reduce 블록\(줄 \d+\) 뒤/); assert.match(r[0].msg, /no-preference/);
  assert.equal(r[0].line, css.split('\n').length + 2);
});
test('check:css: P164 뒤에 animation·transition을 더하면(사례 12) "/* P164 블록 바로 앞으로"', () => {
  const p = cssProblems(css + '\n.mt-x { animation: mt-x 1s; }\n.mt-y { transition: color .2s; }\n');
  assert.equal(p.length, 2); assert.ok(p.every((x) => x.rule === 'still-tail'));
  assert.match(p[0].msg, /"\/\* P164" 블록\(줄 \d+\) 뒤/); assert.match(p[0].msg, /바로 앞\(줄 \d+ 위\)으로 옮긴다/); assert.match(p[0].msg, /p164-lib/);
  // P164 앞에 두면 통과
  const at = css.indexOf('/* P164');
  assert.deepEqual(cssProblems(css.slice(0, at) + '.mt-x { animation: mt-x 1s; }\n' + css.slice(at)), []);
  // 움직임 없는 규칙은 끝에 더해도 된다
  assert.deepEqual(cssProblems(css + '\n/* P999 */\n.mt-x { color: red; }\n'), []);
});
test('check:css: 순서(P349는 P107 빛 층 뒤), 머리 주석이 없어지면', () => {
  const at = css.indexOf('/* ---------- P349'), lr = css.indexOf('.mt-mm-lring { display: var(--mm-go, none)');
  const moved = css.slice(0, lr) + css.slice(at) + css.slice(lr, at); // P349 이후를 lring 앞으로
  assert.ok(cssProblems(moved).some((x) => x.rule === 'order' && /p349/.test(x.msg)));
  assert.ok(cssProblems(css.replace('/* P164', '/* P-164')).some((x) => /찾지 못했다/.test(x.msg)));
});

// ---------- 옛 앱 빌드 ----------
function fakeRepo({ withBackend = true } = {}) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p372-old-'));
  const w = (p, s) => { fs.mkdirSync(path.dirname(path.join(d, p)), { recursive: true }); fs.writeFileSync(path.join(d, p), s); };
  w('app/package.json', '{"type":"module"}');
  w('app/src/x.js', 'export const x = 1;\n');
  // 앱 빌드가 백엔드 소스를 상대 경로로 읽는다(진짜 앱처럼)
  w('app/scripts/build.mjs', "import fs from 'node:fs'; import { v } from '../../backend/src/v.mjs'; fs.mkdirSync('dist', { recursive: true }); fs.writeFileSync('dist/index.html', 'v' + v);\n");
  if (withBackend) w('backend/src/v.mjs', 'export const v = 7;\n');
  const g = (...a) => { const r = spawnSync('git', a, { cwd: d, encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
  g('init', '-q'); g('add', '-A'); g('-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'commit', '-qm', 'x');
  return { d, sha: g('rev-parse', 'HEAD') };
}
test('old-build: backend/src를 함께 풀어 빌드하고 빌드 뒤 확인, --clean은 표식 있는 폴더만', () => {
  const { d, sha } = fakeRepo();
  assert.deepEqual(treePaths(d, sha), ['app/src', 'app/scripts', 'app/package.json', 'backend/src']);
  const r = oldBuild({ repo: d, ref: sha, link: false });
  assert.ok(fs.existsSync(path.join(r.out, 'backend', 'src', 'v.mjs')));
  assert.equal(fs.readFileSync(path.join(r.dist, 'index.html'), 'utf8'), 'v7');
  assert.deepEqual(checkOldBuild(r.out), []);
  assert.throws(() => oldBuild({ repo: d, ref: sha, out: path.join(d, 'elsewhere'), link: false }), /backend\/\.dev 또는 app/);
  assert.throws(() => cleanOld(path.join(d, 'app')), /이 도구가 만든 폴더가 아니다/);
  assert.equal(cleanOld(r.out), true);
  fs.rmSync(d, { recursive: true, force: true });
});
test('old-build: backend/src가 없으면 실패하고 까닭(상대 경로로 가져온다)을 적는다', () => {
  const { d, sha } = fakeRepo({ withBackend: false });
  assert.throws(() => oldBuild({ repo: d, ref: sha, link: false }), /backend\/src가 없다/);
  const t = fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p372-tree-'));
  fs.mkdirSync(path.join(t, 'app', 'src'), { recursive: true }); fs.mkdirSync(path.join(t, 'app', 'scripts')); fs.writeFileSync(path.join(t, 'app', 'scripts', 'build.mjs'), '');
  const p = checkOldTree(t);
  assert.equal(p.length, 1); assert.match(p[0], /상대 경로/);
  assert.match(checkOldBuild(t).join('\n'), /index\.html가 없다/);
  fs.rmSync(d, { recursive: true, force: true }); fs.rmSync(t, { recursive: true, force: true });
});
