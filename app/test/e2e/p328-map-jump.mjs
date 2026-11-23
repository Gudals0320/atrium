// P328 창 시험: 세션 맵(Tab)이 열린 채 할 일 목록의 세션 이름을 누르면 맵이 닫히고 그 세션으로 움직임 없이 한 번에 간다.
// 캔버스에서 누를 때는 지금처럼(움직임 있음). 위쪽 알약 목록(응답 필요)도 같은 길(lib/go-session.js).
// 개발용 판에 셸 셋을 띄우고, 할 일 카드는 창 안에서 흉내(decision.changed)로 넣는다(판 데이터는 바꾸지 않는다).
// 판: 따로 띄운 개발용 판(atrium-dev-p328, 48078, backend/.dev)만. 창의 원격 디버깅 포트 9559. 한 번에 한 창만.
// 실행: node app/test/e2e/p328-map-jump.mjs <setup|pc|stop> [round]
// 결과는 워크트리의 experiments/p328/<round>/(저장소 밖).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const WHAT = process.argv[2] || 'pc';
const TAG = process.argv[3] || 'after';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const DEV = path.join(REPO, 'backend', '.dev');
const OUT = path.join(REPO, 'experiments', 'p328', TAG);
const BOARD = 'atrium-dev-p328', PORT = '48078', DEBUG = '9559';
const FOLDERS = ['C:\\Workspace\\mtask-p328-a', 'C:\\Workspace\\mtask-p328-b', 'C:\\Workspace\\mtask-p328-c'];
const NAMES = ['sh1', 'sh2', 'sh3'];
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_|HC_|CLAUDECODE$|CLAUDE_CODE_)/.test(k)) delete process.env[k];
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
const ENV = {
  ATRIUM_TERMINAL_SESSION: BOARD, ATRIUM_HERDR_SESSION: BOARD, ATRIUM_PORT: PORT,
  ATRIUM_DATA_DIR: path.join(DEV, 'data'), ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  ATRIUM_CLAUDE_PROJECTS: path.join(DEV, 'p328', 'convos'), ATRIUM_CLAUDE_DESKTOP: 'none', ATRIUM_TEST_PREFIX: 'p328-none-',
};
Object.assign(process.env, ENV);
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(ENV.ATRIUM_CLAUDE_PROJECTS, { recursive: true });
const { logger, sleep, launch, closeApp } = await import('./harness.mjs');
const { assertTestBoard } = await import('./p9-guard.mjs');
assertTestBoard(ENV, { root: DEV });

const log = logger(`p328-${WHAT}-${TAG}`);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 180000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 1600)}` : ''}`); };
const AWAKE = ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'];
const shot = (pg, name, opts = {}) => pg.screenshot({ path: path.join(OUT, `${name}.png`), ...opts }).then(() => log(`그림 ${name}.png`)).catch((e) => log(`스크린숏 실패 ${name} ${e.message.slice(0, 80)}`));
const sess = (n) => call('session.list').find((s) => s.name === n);
async function awayWin(app) { return app.evaluate(({ BrowserWindow, screen }) => { const w = BrowserWindow.getAllWindows()[0]; if (!w) return null; const ds = screen.getAllDisplays(); const left = Math.min(...ds.map((d) => d.bounds.x)); const b = w.getBounds(); w.setPosition(left - b.width - 200, 40); return w.getBounds(); }).catch((e) => ({ err: e.message })); }
async function waitFor(fn, ms = 120000, every = 1500) { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) return null; await sleep(every); } }

async function setup() {
  for (const f of FOLDERS) fs.mkdirSync(f, { recursive: true });
  log(atrium('backend', 'start'));
  for (const [i, f] of FOLDERS.entries()) if (!sess(NAMES[i])) log(atrium('spawn', f, '--name', NAMES[i], '--kind', 'shell'));
  const ok = await waitFor(() => NAMES.every((n) => sess(n)), 60000, 2000);
  check('셸 셋이 떴다', !!ok);
}

// 할 일 카드 흉내(창 안에서만): sh3의 결정 카드 하나
async function fakeCard(page) {
  await page.evaluate(() => {
    const st = window.__mt.getState();
    const s = [...st.sessions.values()].find((x) => x.name === 'sh3');
    window.__mt.api.emit('decision.changed', { cards: [{ id: 9001, sessionId: s.sessionId, name: 'sh3', question: '어느 안으로 갈까요?', options: ['A안', 'B안'], why: '시험 카드입니다', createdAt: Date.now() - 60000, state: 'open', auto: false, kind: 'decide', workspaceKey: s.workspaceKey }], held: {}, riding: {} });
  });
  await sleep(500);
}
// 누른 뒤 화면(뷰포트)이 어떻게 바뀌는지 16ms마다 적는다 → 서로 다른 값 수
const watchView = (page, ms = 700) => page.evaluate((ms) => new Promise((res) => {
  const vp = () => { const el = document.querySelector('.react-flow__viewport'); return el ? el.style.transform : null; };
  const seen = [vp()]; const t0 = performance.now();
  const tick = () => { const v = vp(); if (v !== seen[seen.length - 1]) seen.push(v); if (performance.now() - t0 < ms) requestAnimationFrame(tick); else res(seen); };
  requestAnimationFrame(tick);
}), ms);
const nodeInView = (page, name) => page.evaluate((name) => {
  const st = window.__mt.getState(); const s = [...st.sessions.values()].find((x) => x.name === name);
  const el = s && document.querySelector(`.react-flow__node[data-id="${s.sessionId}"]`); if (!el) return null;
  const r = el.getBoundingClientRect(); return { focus: st.focus && st.focus.id === s.sessionId || st.focusId === s.sessionId || null, inView: r.left >= -2 && r.top >= -2 && r.right <= innerWidth + 2 && r.bottom <= innerHeight + 2, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width) };
}, name);
const missionOpen = (page) => page.evaluate(() => !!window.__mt.getState().missionOpen);

async function pc() {
  const { app, page } = await launch({ log, env: { ...ENV }, args: [`--remote-debugging-port=${DEBUG}`, ...AWAKE] });
  try {
    await awayWin(app);
    await page.setViewportSize({ width: 1600, height: 1000 }).catch(() => {});
    await page.waitForFunction(() => window.__mt && window.__mt.getState().boardLoaded, null, { timeout: 60000 }); await sleep(2500);
    call('settings.set', { key: 'language', value: 'ko' }); await sleep(800);
    const side = await page.evaluate(() => !!document.querySelector('[data-role=sidebar]'));
    if (side) { await page.click('[data-role=top-left] [data-action=sidebar]'); await sleep(600); }
    await fakeCard(page);
    // 먼저 sh1로 가 둔다(sh3이 화면 밖이 되게 크게)
    await page.evaluate(() => { const st = window.__mt.getState(); const s = [...st.sessions.values()].find((x) => x.name === 'sh1'); st.navigateTo(s.sessionId, { instant: true }); });
    await sleep(800);

    // 1) 세션 맵에서 누르기
    await page.click('[data-role=sessions-pill]'); await sleep(1200);
    check('세션 맵이 열렸다', await missionOpen(page));
    await page.click('[data-role=decisions]'); await sleep(700);
    const listOpen = await page.$('[data-role=decisions-list]');
    check('세션 맵 위에서 할 일 목록이 열린다', !!listOpen);
    await shot(page, 'map-before-ko');
    const w1 = watchView(page, 900);
    await page.click('[data-role=decisions-list] [data-action=decision-go]');
    const seen1 = await w1;
    await sleep(300);
    check('세션 맵이 닫혔다', !(await missionOpen(page)));
    const v1 = await nodeInView(page, 'sh3');
    check('sh3이 화면 안', v1 && v1.inView, v1);
    check('움직임 없이 한 번에(뷰포트 바뀜 한 번)', seen1.length <= 2, { n: seen1.length, seen: seen1.slice(0, 6) });
    await shot(page, 'map-after-ko');

    // 2) 캔버스에서 누르기(지금 동작 그대로: 움직임 있음)
    await page.evaluate(() => { const st = window.__mt.getState(); const s = [...st.sessions.values()].find((x) => x.name === 'sh1'); st.navigateTo(s.sessionId, { instant: true }); });
    await sleep(800);
    await page.click('[data-role=decisions]'); await sleep(600);
    await shot(page, 'canvas-before-ko');
    const w2 = watchView(page, 900);
    await page.click('[data-role=decisions-list] [data-action=decision-go]');
    const seen2 = await w2;
    await sleep(300);
    check('캔버스에서는 맵이 열리지 않는다', !(await missionOpen(page)));
    const v2 = await nodeInView(page, 'sh3');
    check('캔버스에서도 sh3으로 간다', v2 && v2.inView, v2);
    check('캔버스에서는 지금처럼 움직인다(뷰포트 여러 번 바뀜)', seen2.length > 3, { n: seen2.length });
    await shot(page, 'canvas-after-ko');
  } finally { await closeApp(app); }
}

async function stopAll() {
  for (const n of NAMES) { try { if (sess(n)) log(atrium('kill', n, '--yes')); } catch (e) { log('kill ' + e.message); } }
  try { log(atrium('terminal', 'stop', '--yes')); } catch (e) { log('terminal stop ' + e.message); }
  try { log(atrium('backend', 'stop')); } catch (e) { log('backend stop ' + e.message); }
}

try {
  if (WHAT === 'setup') await setup();
  else if (WHAT === 'pc') await pc();
  else if (WHAT === 'stop') await stopAll();
} catch (e) {
  check('시험이 끝까지 돌았다', false, e.stack || e.message);
} finally {
  fs.writeFileSync(path.join(OUT, `p328-${WHAT}.json`), JSON.stringify({ results }, null, 2));
  const bad = results.filter((r) => !r.ok);
  log(`결과 ${results.length - bad.length}/${results.length} 통과${bad.length ? ` 실패: ${bad.map((b) => b.name).join(', ')}` : ''}`);
  process.exit(bad.length ? 1 : 0);
}
