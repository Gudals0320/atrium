// P265 창 시험: 왼쪽 사이드바에서 접힌 그룹·워크스페이스 아래에 실행 중(작업 중·응답 필요)인 세션만 줄로 보인다.
// 판: 터미널 세션 atrium-dev-p315, 포트 48065, 이 워크트리의 backend/.dev(data, app). 창의 원격 디버깅 포트 9546.
// 장면(새 폴더 C:\\Workspace\\mtask-p315-*, git 아님, 셸만 띄운다): 워크스페이스 둘(alpha, gamma), alpha에 하위 둘. 상태와 활동은 창 안에서만 흉내 낸다(session.updated).
// 단계: setup | shot <ko|en> | clean. 결과는 experiments/p315/(git 밖).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const [STAGE = 'shot', LANG = 'ko'] = process.argv.slice(2);
if (!['setup', 'shot', 'clean'].includes(STAGE)) throw new Error('단계: setup | shot | clean');
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const DEV = path.join(REPO, 'backend', '.dev');
const OUT = path.join(REPO, 'experiments', 'p315');
const CONVOS = path.join(DEV, 'p315-projects');
const BOARD = { session: 'atrium-dev-p315', port: 48065, cdp: 9546 };
const ENV = {
  ATRIUM_TERMINAL_SESSION: BOARD.session, ATRIUM_HERDR_SESSION: BOARD.session, ATRIUM_PORT: String(BOARD.port),
  ATRIUM_DATA_DIR: path.join(DEV, 'data'), ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  ATRIUM_CLAUDE_PROJECTS: CONVOS, ATRIUM_CLAUDE_DESKTOP: 'none', ATRIUM_CLAUDE_SESSIONS: path.join(DEV, 'p315-claude-sessions'),
  ATRIUM_TEST_PREFIX: 'mtask-p315-x', MT_E2E_OUT: 'p315',
};
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_|HC_|MT_HERDR)/.test(k)) delete process.env[k]; // 실제 판의 값을 물려받지 않는다
for (const k of Object.keys(process.env)) if (/^(CLAUDECODE|CLAUDE_CODE_|CLAUDE_EFFORT|CLAUDE_PID|CLAUDE_AGENT_SDK|ELECTRON_RUN_AS_NODE)/.test(k)) delete process.env[k];
Object.assign(process.env, ENV);
for (const d of [OUT, CONVOS, ENV.ATRIUM_CLAUDE_SESSIONS]) fs.mkdirSync(d, { recursive: true });
const { logger, sleep, until, APP_ROOT } = await import('./harness.mjs');
const { assertTestBoard } = await import('./p9-guard.mjs');
assertTestBoard(ENV, { root: DEV });

const log = logger(`p315-${STAGE}-${LANG}`);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 180000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const sessions = () => call('session.list');
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail !== '' ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 1600)}` : ''}`); };

const W = 'C:\\Workspace';
const F = { alpha: `${W}\\mtask-p315-alpha`, gamma: `${W}\\mtask-p315-gamma` };
for (const d of Object.values(F)) if (!/^C:\\Workspace\\mtask-p315-[a-z]+$/.test(d)) throw new Error(`시험 폴더는 C:\\Workspace\\mtask-p315-*만: ${d}`);
const LIVE = [['zeta-lead', 'alpha'], ['p10', 'alpha'], ['P9', 'alpha'], ['build', 'alpha'], ['Alpha', 'alpha'], ['run-z', 'gamma'], ['run-a', 'gamma'], ['idle', 'gamma']];
const KIDS = [['w-b', 'zeta-lead'], ['w-a', 'zeta-lead']]; // 띄운 차례 b → a, 보이는 차례는 a → b
const SCENE = path.join(OUT, 'scene.json');

async function setup() {
  log('백엔드', atrium('backend', 'start').trim().slice(0, 200));
  for (const s of sessions()) { try { atrium('kill', s.sessionId, '--yes', '--delete'); } catch (e) { log('옛 세션 끄기 실패', s.name, e.message.slice(0, 120)); } }
  for (const d of Object.values(F)) { fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, 'README.md'), `# ${path.basename(d)}\n`); }
  const key = {};
  for (const [k, d] of Object.entries(F)) { const r = call('workspace.open', { path: d, select: false }); key[k] = r.workspace.key; log('워크스페이스', k, r.workspace.key); }
  const ids = {};
  for (const [name, ws] of LIVE) { const r = call('session.spawn', { cwd: F[ws], kind: 'shell', name }); ids[name] = r.sessionId; log('띄움', name, r.sessionId); }
  for (const [name, parent] of KIDS) { const r = call('session.spawn', { cwd: F.alpha, kind: 'shell', name, parentSessionId: ids[parent] }); ids[name] = r.sessionId; log('하위', name, r.sessionId); await sleep(500); }
  await until(() => { const s = sessions(); return [...LIVE, ...KIDS].every(([n]) => s.some((x) => x.name === n && /shell_/.test(x.state))); }, 120000, 1500).catch(() => log('셸 준비 기다림 넘김'));
  fs.writeFileSync(SCENE, JSON.stringify({ key, ids }, null, 1));
  check('장면: 워크스페이스 둘, 세션 열', sessions().length === LIVE.length + KIDS.length, { sessions: sessions().length });
}

// 상태와 활동 흉내. round마다 활동 시각을 뒤집어 예전 규칙이면 차례가 바뀌게 한다
async function fake(page, round) {
  await page.evaluate(({ round }) => {
    const st = window.__mt.getState();
    const now = Date.now();
    const F1 = { 'p10': 'waiting', 'run-z': 'working', 'run-a': 'working', 'P9': 'error' };
    const F2 = { 'build': 'waiting', 'run-z': 'working', 'w-b': 'working', 'zeta-lead': 'waiting' };
    const F = round === 1 ? F1 : F2;
    const list = [...st.sessions.values()].sort((a, b) => String(a.name).localeCompare(String(b.name)));
    list.forEach((s, i) => {
      const state = F[s.name] || 'ready';
      const ask = state === 'waiting' ? { kind: 'permission', tool: 'Bash', summary: 'npm run deploy', since: now - 90000 } : null;
      const at = round === 1 ? now - i * 47000 : now - (list.length - i) * 47000;
      window.__mt.api.emit('session.updated', { ...s, kind: 'claude', state, ask, error: null, unseen: false, lastActivityAt: at });
    });
  }, { round });
  await sleep(500);
}
const sideRect = (page) => page.evaluate(() => { const r = document.querySelector('[data-role="sidebar"]').getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(Math.min(r.height, 560)) }; });
const shotSide = async (page, name) => { const clip = await sideRect(page); const f = path.join(OUT, `${LANG}-${name}.png`); await page.screenshot({ path: f, clip }); log('스크린숏', path.relative(REPO, f)); };
const rowsOf = (page) => page.evaluate(() => [...document.querySelectorAll('[data-role="sidebar-rows"] [data-row]')].map((r) => ({ id: r.dataset.row, sb: r.dataset.sb || r.dataset.action || null, name: r.dataset.name || null, indent: Number(r.dataset.indent || 0), pinned: r.dataset.pinned === '1' })));
const scene = () => JSON.parse(fs.readFileSync(SCENE, 'utf8'));
const wsFold = (k) => `[data-sb="ws"][data-ws="${scene().key[k]}"] [data-action="fold"]`;
const click = async (page, sel) => { const el = await page.waitForSelector(sel, { timeout: 10000 }); await el.click(); await sleep(300); };
const sess = (rows) => rows.filter((r) => r.sb === 'session').map((r) => r.name);

async function openWindow() {
  const { _electron: electron } = await import('playwright');
  const app = await electron.launch({ args: ['.', '--dev', `--remote-debugging-port=${BOARD.cdp}`], cwd: APP_ROOT, env: process.env, timeout: 60000 });
  const page = await app.firstWindow();
  page.on('pageerror', (e) => log(`[pageerror] ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') log(`[console.error] ${m.text().slice(0, 300)}`); });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1400, 860));
  await page.waitForFunction(() => window.__mt && window.__mt.getState().boardLoaded, null, { timeout: 90000 });
  await page.evaluate(() => { try { localStorage.removeItem('mt.sidebar'); } catch {} });
  await page.reload();
  await page.waitForFunction(() => window.__mt && window.__mt.getState().boardLoaded, null, { timeout: 90000 });
  await sleep(1500);
  return { app, page };
}

async function shots() {
  atrium('settings', 'set', 'language', LANG);
  const { app, page } = await openWindow();
  try {
    if (!(await page.$('[data-role="sidebar"]'))) await page.keyboard.press('Control+Shift+E');
    await page.waitForSelector('[data-role="sidebar"]');
    await sleep(1500);
    await fake(page, 1);
    await page.mouse.move(1000, 500);
    const r1 = await rowsOf(page);
    log('차례 1', JSON.stringify(r1.map((r) => `${r.sb}:${r.name || r.id}:${r.indent}`)));
    const got1 = sess(r1);
    check('펼친 목록은 이름 차례(대소문자 무시, 자연 숫자, 하위는 부모 아래 이름 차례)', got1.join() === ['Alpha', 'build', 'P9', 'p10', 'zeta-lead', 'w-a', 'w-b', 'idle', 'run-a', 'run-z'].join(), got1);
    check('하위는 부모 아래 한 단계', r1.filter((r) => r.name === 'w-a' || r.name === 'w-b').every((r) => r.indent === 1));
    await shotSide(page, '01-open');
    await fake(page, 2);
    await page.mouse.move(1000, 500);
    const got2 = sess(await rowsOf(page));
    check('활동·응답 필요가 바뀌어도 차례 그대로', got2.join() === got1.join(), got2);
    await shotSide(page, '02-open-after-activity');
    await fake(page, 1);
    await click(page, wsFold('gamma'));
    await page.mouse.move(1000, 500); await sleep(200);
    const g = await rowsOf(page);
    const pinned = g.filter((r) => r.pinned).map((r) => r.name);
    check('접힌 워크스페이스 아래 실행 중만, 이름 차례', pinned.join() === 'run-a,run-z', pinned);
    await shotSide(page, '03-ws-folded');
    await click(page, wsFold('gamma')).catch(() => {});
  } finally { await app.close().catch(() => {}); }
}

async function clean() {
  try { for (const s of sessions()) { try { atrium('kill', s.sessionId, '--yes', '--delete'); } catch (e) { log('끄기 실패', s.name, e.message.slice(0, 160)); } } } catch (e) { log('목록 실패', e.message.slice(0, 160)); }
  try { log('터미널 멈춤', atrium('terminal', 'stop', '--yes').trim().slice(0, 200)); } catch (e) { log('터미널 멈춤 실패', e.message.slice(0, 200)); }
  try { log('백엔드 멈춤', atrium('backend', 'stop').trim().slice(0, 200)); } catch (e) { log('백엔드 멈춤 실패', e.message.slice(0, 200)); }
  for (const d of Object.values(F)) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) { log('지우기 실패', d, e.message.slice(0, 120)); } }
}

try {
  if (STAGE === 'setup') await setup();
  else if (STAGE === 'shot') await shots();
  else await clean();
} catch (e) { check('예외', false, String(e && (e.stack || e.message)).slice(0, 800)); }
const pass = results.filter((r) => r.ok).length;
log(`결과 ${pass}/${results.length}`);
fs.writeFileSync(path.join(OUT, `p315-${STAGE}-${LANG}.json`), JSON.stringify({ at: new Date().toISOString(), pass, total: results.length, results }, null, 1));
process.exit(pass === results.length ? 0 : 1);
