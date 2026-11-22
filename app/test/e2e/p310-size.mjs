// P310 창 시험: 사람이 정한 세션 크기(노드 메뉴의 크기 단계, 테두리 끌기)를 자동 정렬이 지키는지, 노드 메뉴 "기본 크기로"가 자동 크기로 돌리는지(ko·en 그림).
// 판: 따로 띄운 개발용 판(atrium-dev-p310, 48060, backend/.dev)만. 창의 원격 디버깅 포트 9541. 셸 세션 셋(p310-lead, 그 하위 p310-w1·p310-w2, 시험 폴더 C:\Workspace\mtask-p310-a).
// 실행: node app/test/e2e/p310-size.mjs <setup|pc|stop> [round]
// 결과는 워크트리의 experiments/p310/<round>/(저장소 밖).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const WHAT = process.argv[2] || 'setup';
const TAG = process.argv[3] || 'round-1';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const DEV = path.join(REPO, 'backend', '.dev');
const OUT = path.join(REPO, 'experiments', 'p310', TAG);
const CONVOS = path.join(REPO, 'experiments', 'p310', 'convos');
const DIR = 'C:\\Workspace\\mtask-p310-a';
const BOARD = 'atrium-dev-p310', PORT = '48060', DEBUG = '9541';
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_|HC_)/.test(k)) delete process.env[k];
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
const ENV = {
  ATRIUM_TERMINAL_SESSION: BOARD, ATRIUM_HERDR_SESSION: BOARD, ATRIUM_PORT: PORT,
  ATRIUM_DATA_DIR: path.join(DEV, 'data'), ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  ATRIUM_CLAUDE_PROJECTS: CONVOS, ATRIUM_CLAUDE_DESKTOP: 'none', ATRIUM_TEST_PREFIX: 'p310-none-',
};
Object.assign(process.env, ENV);
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(CONVOS, { recursive: true });
const { logger, sleep, launch, closeApp } = await import('./harness.mjs');
const { assertTestBoard } = await import('./p9-guard.mjs');
assertTestBoard(ENV, { root: DEV });

const log = logger(`p310-${WHAT}-${TAG}`);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 120000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 1600)}` : ''}`); };
const AWAKE = ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'];
const shotTo = (pg, name) => pg.screenshot({ path: path.join(OUT, `${name}.png`) }).then(() => log(`그림 ${name}.png`)).catch((e) => log(`스크린숏 실패 ${name} ${e.message.slice(0, 80)}`));
const NAMES = ['p310-lead', 'p310-w1', 'p310-w2'];

async function setupBoard() {
  fs.mkdirSync(DIR, { recursive: true });
  log(atrium('backend', 'start').trim().slice(0, 300));
  const have = new Map(call('session.list').map((s) => [s.name, s.sessionId]));
  const sh = (name, extra = {}) => { if (have.has(name)) return have.get(name); const r = call('session.spawn', { cwd: DIR, name, kind: 'shell', ...extra }); log(`띄움 ${name} ${r.sessionId}`); return r.sessionId; };
  const lead = sh('p310-lead');
  sh('p310-w1', { parentSessionId: lead });
  sh('p310-w2', { parentSessionId: lead });
  await sleep(2500);
}
async function awayWin(app) { return app.evaluate(({ BrowserWindow, screen }) => { const w = BrowserWindow.getAllWindows()[0]; if (!w) return null; const ds = screen.getAllDisplays(); const left = Math.min(...ds.map((d) => d.bounds.x)); const b = w.getBounds(); w.setPosition(left - b.width - 200, 40); return w.getBounds(); }).catch((e) => ({ err: e.message })); }

async function pc() {
  const { app, page } = await launch({ log, env: { ...ENV }, args: [`--remote-debugging-port=${DEBUG}`, ...AWAKE] });
  try {
    await awayWin(app);
    await page.setViewportSize({ width: 1600, height: 1000 }).catch(() => {});
    const ids = Object.fromEntries(call('session.list').filter((s) => NAMES.includes(s.name)).map((s) => [s.name, s.sessionId]));
    const ws = call('session.list').find((s) => s.name === 'p310-lead').workspaceKey;
    const nodes = async () => { const b = await page.evaluate(() => window.__mt.api.call('board.get')); return Object.fromEntries(NAMES.map((n) => { const x = b.nodes.find((q) => q.session_id === ids[n]); return [n, { w: x.w, h: x.h, x: x.x, y: x.y, size: x.size, hand: !!x.hand }]; })); };
    const fitAll = async () => { await page.evaluate(() => window.__mtFlow.fitView({ padding: 0.12, duration: 0 })); await sleep(900); };
    const fitOne = async (n) => { await page.evaluate((id) => { const f = window.__mtFlow, q = f.getNode(id); const w = (q.measured && q.measured.width) || q.width, h = (q.measured && q.measured.height) || q.height; f.setCenter(q.position.x + w / 2, q.position.y + h / 2, { zoom: Math.max(0.8, Math.min(1, 1500 / w)), duration: 0 }); }, ids[n]); await sleep(900); };
    const sel = (n) => `.mt-node[data-name="${n}"]`;
    const openMenu = async (n) => { await fitOne(n); log('menu', n, JSON.stringify(await page.evaluate((s) => ({ zoom: window.__mtFlow.getViewport().zoom, cls: (document.querySelector(s) || {}).className }), sel(n)))); await page.click(`${sel(n)} [data-action="node-menu"]`); await page.waitForSelector('[data-role="node-menu"]', { timeout: 8000 }); await sleep(300); };
    const closeMenu = async () => { const c = await page.$('[data-role="node-menu"] [data-action="menu-close"]'); if (c) await c.click(); await sleep(300); };
    const arrange = async () => { await page.evaluate((w) => window.__mt.api.call('board.arrange', { workspace: w, apply: true }), ws); await sleep(1500); };
    call('settings.set', { key: 'language', value: 'ko' }); await sleep(800);
    // 처음 자리: 정리부터(셋 다 자동 크기)
    await arrange(); await fitAll();
    const n0 = await nodes(); log('처음', JSON.stringify(n0));
    await shotTo(page, 'ko-1-before');
    // 1) 메뉴: lead를 작게(자동이면 뿌리는 크게)
    await openMenu('p310-lead');
    await page.click('[data-role="node-menu"] [data-size="small"]'); await sleep(1200);
    // 2) 끌기: w1을 키운다
    await fitOne('p310-w1');
    await page.keyboard.down('Control'); await page.click(`${sel('p310-w1')} .mt-node-head .mt-node-name`); await page.keyboard.up('Control'); await sleep(500);
    const h = await page.locator(`.react-flow__node:has(${sel('p310-w1')}) .react-flow__resize-control.handle.bottom.right`).first().boundingBox();
    await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2); await page.mouse.down();
    await page.mouse.move(h.x + 60, h.y + 140, { steps: 12 }); await page.mouse.up(); await sleep(1500);
    const n1 = await nodes(); log('바꾼 뒤', JSON.stringify(n1));
    check('메뉴와 끌기가 사람 크기 표를 남긴다', n1['p310-lead'].hand && n1['p310-w1'].hand && !n1['p310-w2'].hand, n1);
    await fitAll(); await shotTo(page, 'ko-2-changed');
    // 3) 자동 정렬: 손 크기 둘은 그대로, w2는 자동(이미 작게였다면 그대로) 
    await arrange();
    const n2 = await nodes(); log('정렬 뒤', JSON.stringify(n2));
    const same = (a, b) => a.w === b.w && a.h === b.h;
    check('자동 정렬이 메뉴로 정한 lead 크기를 지킨다', same(n2['p310-lead'], n1['p310-lead']) && n2['p310-lead'].w < n0['p310-lead'].w, { before: n1['p310-lead'], after: n2['p310-lead'], auto: n0['p310-lead'] });
    check('자동 정렬이 끌어 정한 w1 크기를 지킨다', same(n2['p310-w1'], n1['p310-w1']), { before: n1['p310-w1'], after: n2['p310-w1'] });
    check('손대지 않은 w2는 자동 크기', same(n2['p310-w2'], n0['p310-w2']), { auto: n0['p310-w2'], after: n2['p310-w2'] });
    await fitAll(); await shotTo(page, 'ko-3-arranged');
    // 4) 메뉴 표시와 기본 크기로
    await openMenu('p310-w1');
    check('메뉴에 기본 크기로가 보인다(ko)', !!(await page.$('[data-role="node-menu"] [data-action="auto-size"]')), await page.textContent('[data-role="node-menu"] [data-role="hand-size"]').catch(() => ''));
    await shotTo(page, 'ko-4-menu');
    await closeMenu();
    const w2menu = await (async () => { await openMenu('p310-w2'); const x = !!(await page.$('[data-role="node-menu"] [data-action="auto-size"]')); await closeMenu(); return x; })();
    check('정하지 않은 w2 메뉴에는 없다', !w2menu);
    // en
    call('settings.set', { key: 'language', value: 'en' }); await sleep(900);
    await fitAll(); await shotTo(page, 'en-3-arranged');
    await openMenu('p310-w1');
    check('메뉴에 기본 크기로가 보인다(en)', /Default size/.test(await page.textContent('[data-role="node-menu"] [data-role="hand-size"]').catch(() => '')));
    await shotTo(page, 'en-4-menu');
    await page.click('[data-role="node-menu"] [data-action="auto-size"]'); await sleep(1200);
    await arrange();
    const n3 = await nodes(); log('기본 크기로 뒤 정렬', JSON.stringify(n3));
    check('기본 크기로 뒤에는 표가 없고 정렬이 자동 크기로', !n3['p310-w1'].hand && same(n3['p310-w1'], n0['p310-w1']) && n3['p310-lead'].hand && same(n3['p310-lead'], n1['p310-lead']), n3);
    await fitAll(); await shotTo(page, 'en-5-default');
    call('settings.set', { key: 'language', value: 'ko' }); await sleep(900);
    await fitAll(); await shotTo(page, 'ko-5-default');
  } finally { await closeApp(app); }
}

async function stopBoard() {
  for (const s of call('session.list').filter((x) => /^p310-/.test(x.name))) { try { atrium('kill', s.name, '--yes'); } catch (e) { log(`kill ${s.name} ${e.message.slice(0, 100)}`); } }
  await sleep(2000);
  try { log(atrium('terminal', 'stop', '--yes').slice(0, 200)); } catch (e) { log(`terminal stop ${e.message.slice(0, 120)}`); }
  try { log(atrium('backend', 'stop').slice(0, 200)); } catch (e) { log(`backend stop ${e.message.slice(0, 120)}`); }
}

try {
  if (WHAT === 'setup') await setupBoard();
  else if (WHAT === 'pc') await pc();
  else if (WHAT === 'stop') await stopBoard();
} catch (e) {
  check('시험이 끝까지 돌았다', false, e.stack || e.message);
} finally {
  fs.writeFileSync(path.join(OUT, `p310-${WHAT}.json`), JSON.stringify({ results }, null, 2));
  const bad = results.filter((r) => !r.ok);
  log(`결과 ${results.length - bad.length}/${results.length} 통과${bad.length ? ` 실패: ${bad.map((b) => b.name).join(', ')}` : ''}`);
  process.exit(bad.length ? 1 : 0);
}
