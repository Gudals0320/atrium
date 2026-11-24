// P354 창 시험: 시선 태그(판 가운데 세션을 명령줄 받는 이로). 장면별 그림과 판정.
// 1) 세션 하나가 가운데 → 태그, 2) 둘이 나란히(가운데 빈 틈) → 비움, 한쪽 안 → 그쪽, 3) 멀리 축소 → 비움, 4) 판을 옆으로 옮기면 멈춘 뒤 태그가 따라간다,
// 5) 누른 세션이 먼저(화면 밖으로 나가면 풀림), 6) 사람이 친 글은 바뀌지 않음, 7) 설정 끄면 태그 없음.
// 판: 따로 띄운 개발용 판(atrium-dev-p354, 48099, backend/.dev)만. 창의 원격 디버깅 포트 9580. 한 번에 한 창.
// 세션: claude haiku 셋(p354-a, p354-b, p354-c)과 셸 하나(p354-s, 받지 않으니 후보가 아니다).
// 실행: node app/test/e2e/p354-gaze.mjs <setup|shots|stop> [round]. 결과는 experiments/p354/<round>/(저장소 밖)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const WHAT = process.argv[2] || 'shots';
const ROUND = process.argv[3] || 'after';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const DEV = path.join(REPO, 'backend', '.dev');
const OUT = path.join(REPO, 'experiments', 'p354', ROUND);
const BOARD = 'atrium-dev-p354', PORT = '48099', DEBUG = '9580';
const DIR = 'C:\\Workspace\\mtask-p354-a';
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_|HC_|CLAUDECODE$|CLAUDE_CODE_)/.test(k)) delete process.env[k];
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
const ENV = {
  ATRIUM_TERMINAL_SESSION: BOARD, ATRIUM_HERDR_SESSION: BOARD, ATRIUM_PORT: PORT,
  ATRIUM_DATA_DIR: path.join(DEV, 'data'), ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  ATRIUM_CLAUDE_PROJECTS: path.join(DEV, 'p354', 'convos'), ATRIUM_CLAUDE_DESKTOP: 'none', ATRIUM_TEST_PREFIX: 'p354-none-',
};
Object.assign(process.env, ENV);
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(ENV.ATRIUM_CLAUDE_PROJECTS, { recursive: true });
const { logger, sleep, launch, closeApp } = await import('./harness.mjs');
const { assertTestBoard } = await import('./p9-guard.mjs');
assertTestBoard(ENV, { root: DEV });
const log = logger(`p354-${WHAT}-${ROUND}`);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 180000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 1600)}` : ''}`); };
const judge = ROUND.startsWith('after');
const AWAKE = ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'];
const shot = (pg, name, opts = {}) => pg.screenshot({ path: path.join(OUT, `${name}.png`), ...opts }).then(() => log(`그림 ${name}.png`)).catch((e) => log(`스크린숏 실패 ${name} ${e.message.slice(0, 80)}`));
async function awayWin(app) { return app.evaluate(({ BrowserWindow, screen }) => { const w = BrowserWindow.getAllWindows()[0]; if (!w) return null; const ds = screen.getAllDisplays(); const left = Math.min(...ds.map((d) => d.bounds.x)); const b = w.getBounds(); w.setPosition(left - b.width - 200, 40); return w.getBounds(); }).catch((e) => ({ err: e.message })); }


const NAMES = ['p354-a', 'p354-b', 'p354-c'];
async function setup() {
  fs.mkdirSync(DIR, { recursive: true });
  log(atrium('backend', 'start').trim().slice(0, 300));
  call('settings.set', { key: 'usageProbe', value: false });
  const have = new Set(call('session.list').map((s) => s.name));
  for (const n of NAMES) if (!have.has(n)) log(atrium('--json', 'spawn', DIR, '--model', 'haiku', '--name', n).slice(0, 160));
  if (!have.has('p354-s')) log(atrium('--json', 'spawn', DIR, '--kind', 'shell', '--name', 'p354-s').slice(0, 160));
  await sleep(8000);
  const list = call('session.list');
  check('세션 넷이 떴다', [...NAMES, 'p354-s'].every((n) => list.some((s) => s.name === n)), list.map((s) => [s.name, s.state]));
}

const W = 1600, H = 1000;
async function shots() {
  const { app, page } = await launch({ log, env: { ...ENV }, args: [`--remote-debugging-port=${DEBUG}`, ...AWAKE] });
  try {
    await awayWin(app);
    await page.emulateMedia({ reducedMotion: process.env.P354_MOTION === '1' ? 'no-preference' : 'reduce' });
    await page.setViewportSize({ width: W, height: H }).catch(() => {});
    await page.waitForFunction(() => window.__mt && window.__mt.getState().boardLoaded, null, { timeout: 60000 }); await sleep(2500);
    call('settings.set', { key: 'language', value: process.env.P354_LANG || 'ko' }); await sleep(800);
    const info = () => page.evaluate(() => {
      const st = window.__mt.getState();
      const ta = document.querySelector('[data-role=command]');
      const gz = [...document.querySelectorAll('.mt-node.gazed')].map((e) => e.dataset.name);
      const chip = document.querySelector('[data-role=cmd-to] .mt-cmd-to-chip');
      return { text: ta ? ta.value : null, gazeId: st.gazeId, gazeOn: st.gazeOn, gazed: gz, chipGaze: !!(chip && chip.dataset.gaze), vp: st.vpNow };
    });
    const rects = await page.evaluate(() => { const st = window.__mt.getState(); return [...st.nodes].map(([id, r]) => ({ id, name: (st.sessions.get(id) || {}).name, kind: (st.sessions.get(id) || {}).kind, x: r.x, y: r.y, w: r.w, h: r.h })); });
    log('노드 ' + JSON.stringify(rects));
    const R = Object.fromEntries(rects.map((r) => [r.name, r]));
    const nav = async (r, wait = 1100) => { await page.evaluate((r) => window.__mt.getState().navigateToRect(r, 0), r); await sleep(wait); };
    // 월드 점 (wx, wy)를 캔버스 가운데로(배율은 그대로)
    const centerOn = async (wx, wy, wait = 1100) => { await page.evaluate(({ wx, wy }) => { const st = window.__mt.getState(); const v = st.vpNow, c = st.canvasSize; st.panBy(c.width / 2 - (wx * v.zoom + v.x), c.height / 2 - (wy * v.zoom + v.y), 0); }, { wx, wy }); await sleep(wait); };
    const show = async () => { await page.mouse.move(800, 985); await sleep(700); };
    const off = async () => { await page.mouse.move(800, 400); };
    const a = R['p354-a'], b = R['p354-b'];
    const box = (r) => ({ x: r.x, y: r.y, w: r.w, h: r.h });
    // 1) 하나가 가운데
    await off(); await nav(box(a)); await show();
    let s = await info(); log('하나 가운데 ' + JSON.stringify(s));
    await shot(page, '1-one-center');
    check('하나가 가운데: 명령줄에 그 태그, 판 노드 표시, 칩이 저절로 모양', s.text === '@p354-a ' && s.gazed.includes('p354-a') && s.chipGaze, s);
    // 2) 둘이 나란히: a와 b를 함께 맞추고 가운데를 둘 사이 틈에
    const L = Math.min(a.x, b.x), Rr = Math.max(a.x + a.w, b.x + b.w), T = Math.min(a.y, b.y), B = Math.max(a.y + a.h, b.y + b.h);
    const vert = Math.abs(a.x - b.x) < Math.abs(a.y - b.y); // 판이 같은 폴더 세션을 세로로 쌓는다
    const gap = vert ? { x: a.x + a.w / 2, y: (Math.min(a.y + a.h, b.y + b.h) + Math.max(a.y, b.y)) / 2 } : { x: (Math.min(a.x + a.w, b.x + b.w) + Math.max(a.x, b.x)) / 2, y: a.y + a.h / 2 };
    await off(); await page.click('.react-flow__pane', { position: { x: 5, y: 500 } }).catch(() => {}); await sleep(200); // 빈 판 누르기 = 비움(그 뒤 판을 움직이면 다시 고른다)
    await nav({ x: L, y: T, w: Rr - L, h: B - T }, 300); await centerOn(gap.x, gap.y);
    await show(); s = await info(); log('둘 나란히 ' + JSON.stringify({ ...s, gap }));
    await shot(page, '2-two-side-gap');
    check('둘이 나란히 가운데 빈 틈: 태그하지 않는다', s.text === '' && !s.gazed.length, s);
    // 가운데를 b 쪽으로 조금 넣으면 b
    await off(); await centerOn(vert ? gap.x : gap.x + 140, vert ? gap.y + 140 : gap.y); await show(); s = await info(); log('둘 나란히, b 안 ' + JSON.stringify(s));
    await shot(page, '2b-two-side-in-b');
    check('둘이 나란히, 가운데가 b 안: b', s.text === '@p354-b ', s);
    // 3) 멀리 축소
    await off(); await nav({ x: L - 6000, y: T - 4000, w: (Rr - L) + 12000, h: (B - T) + 8000 }); await show();
    s = await info(); log('멀리 ' + JSON.stringify(s));
    await shot(page, '3-zoomed-out');
    check('멀리 축소(배율 0.2 아래): 태그하지 않는다', s.text === '' && s.vp && s.vp.zoom < 0.2, s);
    // 4) 판을 옆으로 옮기며: a 가운데 → 오른쪽으로 조금씩
    await off(); await nav(box(a)); await show();
    const frames = [];
    for (let i = 0; i < 6; i++) {
      s = await info(); frames.push({ i, text: s.text, gazed: s.gazed });
      await shot(page, `4-pan-${i}`);
      await off();
      const z = s.vp ? s.vp.zoom : 1;
      const dx = -((b.x + b.w / 2) - (a.x + a.w / 2)) * z / 6, dy = -((b.y + b.h / 2) - (a.y + a.h / 2)) * z / 6;
      await page.evaluate(({ dx, dy }) => window.__mt.getState().panBy(dx, dy, 200), { dx, dy });
      // 움직이는 동안(200ms) 바뀌지 않는다
      await sleep(250); const mid = await info(); frames[i].during = mid.text;
      await sleep(900); await show();
    }
    s = await info(); frames.push({ i: 6, text: s.text, gazed: s.gazed }); await shot(page, '4-pan-6');
    log('옮기기 ' + JSON.stringify(frames));
    check('판을 옆으로 옮기면 a → (틈에서 비움 또는 a 지킴) → b로 바뀐다', frames[0].text === '@p354-a ' && frames[frames.length - 1].text === '@p354-b ', frames);
    // 5) 누른 세션이 먼저: b 가운데에서 a 머리줄을 누르면 a, a가 화면에 있는 동안 시선이 바꾸지 않는다, 화면 밖으로 나가면 풀린다
    await off(); await nav({ x: L, y: T, w: Rr - L, h: B - T }); await sleep(300);
    const headA = await page.evaluate(() => { const e = document.querySelector('.mt-node[data-name="p354-a"] .mt-node-name'); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    if (headA) { await page.mouse.click(headA.x, headA.y); await sleep(1600); }
    s = await info(); log('누름 ' + JSON.stringify(s));
    await nav(box(b)); await show(); const s2 = await info(); log('누른 뒤 b 가운데 ' + JSON.stringify(s2));
    await shot(page, '5-click-holds');
    await off(); await nav({ x: b.x + b.w * 2, y: b.y, w: b.w, h: b.h }); await nav(box(b)); await show(); const s3 = await info(); log('a가 화면 밖으로 나간 뒤 ' + JSON.stringify(s3));
    check('누른 세션이 먼저: 누르면 @a, a가 보이는 동안은 그대로', s.text === '@p354-a ' && (s2.text === '@p354-a ' || !s2.gazed.length), { s, s2 });
    // 6) 명령줄을 열면(초점) 이미 태그, 사람이 친 글은 바뀌지 않는다
    await page.click('[data-role=command]'); await sleep(300);
    s = await info(); log('초점 ' + JSON.stringify(s));
    await page.keyboard.type('hello'); await sleep(200);
    await off(); await nav(box(a)); await show(); const s4 = await info(); log('친 뒤 a로 ' + JSON.stringify(s4));
    await shot(page, '6-typed-stays');
    check('사람이 친 글은 판을 옮겨도 그대로', /hello$/.test(s4.text || '') && !s4.gazed.length, s4);
    await page.click('[data-role=command]'); await page.keyboard.press('Control+A'); await page.keyboard.press('Backspace'); await page.evaluate(() => document.activeElement && document.activeElement.blur());
    // 7) 설정 › 일반의 켬·끔 줄. 끄면 태그 없음
    const openSet = async () => { if (!(await page.$('[data-role="settings"]'))) await page.click('[data-role="top-right"] [data-action="settings-open"]'); await page.waitForSelector('[data-role="settings-tabs"]', { timeout: 8000 }); await page.click('[data-role="settings-tabs"] [data-tab="general"]'); await sleep(400); };
    const closeSet = async () => { if (await page.$('[data-role="settings"]')) { await page.click('[data-action="settings-close"]').catch(() => {}); await sleep(300); } };
    await openSet();
    const row = await page.$('[data-role=gaze-setting]');
    if (row) { await row.scrollIntoViewIfNeeded().catch(() => {}); await sleep(300); const bx = await page.$eval('[data-role="settings"]', (e) => { const b = e.getBoundingClientRect(); return { x: Math.max(0, b.x - 4), y: Math.max(0, b.y - 4), width: Math.min(innerWidth, b.width + 8), height: Math.min(innerHeight, b.height + 8) }; }); await shot(page, '7-setting', { clip: bx }); }
    check('설정 › 일반에 켬·끔 줄(기본 켬)', !!row && (await page.evaluate(() => window.__mt.getState().gazeOn)));
    await page.click('[data-field="setting-gazeTag"]').catch((e) => log('끔 누르기 ' + e.message.slice(0, 80))); await sleep(300);
    await closeSet();
    await off(); await nav(box(b)); await show(); const s5 = await info(); log('끔 ' + JSON.stringify(s5));
    check('설정을 끄면 태그하지 않는다', s5.text === '' && !s5.gazed.length && s5.gazeOn === false, s5);
    await openSet(); await page.click('[data-field="setting-gazeTag"]').catch(() => {}); await sleep(300); await closeSet(); await sleep(800);
    const s6 = await info(); log('다시 켬 ' + JSON.stringify(s6));
    check('다시 켜면 바로 태그', s6.text === '@p354-b ', s6);
  } finally { await closeApp(app).catch(() => {}); }
}

async function stopAll() {
  for (const n of [...NAMES, 'p354-s']) { try { if (call('session.list').some((s) => s.name === n)) log(atrium('kill', n, '--yes')); } catch (e) { log('kill ' + e.message); } }
  try { log(atrium('terminal', 'stop', '--yes')); } catch (e) { log('terminal stop ' + e.message); }
  try { log(atrium('backend', 'stop')); } catch (e) { log('backend stop ' + e.message); }
}

try {
  if (WHAT === 'setup') await setup();
  else if (WHAT === 'shots') await shots();
  else if (WHAT === 'stop') await stopAll();
} catch (e) {
  check('시험이 끝까지 돌았다', false, e.stack || e.message);
} finally {
  fs.writeFileSync(path.join(OUT, `p354-${WHAT}.json`), JSON.stringify({ results }, null, 2));
  const bad = results.filter((r) => !r.ok);
  log(`결과 ${results.length - bad.length}/${results.length} 통과${bad.length ? ` 실패: ${bad.map((b) => b.name).join(', ')}` : ''}`);
  process.exit(bad.length ? 1 : 0);
}
