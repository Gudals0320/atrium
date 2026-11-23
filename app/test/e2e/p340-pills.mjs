// P340 창 시험: 위 왼쪽·오른쪽 알약 밑에 노드·터미널이 깔려도 알약 글이 읽히는지(불투명 바탕) 전·후 그림.
// 판: 따로 띄운 개발용 판(atrium-dev-p340, 48090, backend/.dev)만. 창의 원격 디버깅 포트 9571. 한 번에 한 창.
// 세션: 셸 하나(sh1, 글을 가득 찍는다). 알약은 창 안 흉내(session.updated·decision.changed)로 모두 띄운다.
// 실행: node app/test/e2e/p340-pills.mjs <setup|pc|stop> [round]   결과는 워크트리의 experiments/p340/<round>/(저장소 밖).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const WHAT = process.argv[2] || 'pc';
const TAG = process.argv[3] || 'after';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const DEV = path.join(REPO, 'backend', '.dev');
const OUT = path.join(REPO, 'experiments', 'p340', TAG);
const BOARD = 'atrium-dev-p340', PORT = process.env.P340_PORT || '48090', DEBUG = process.env.P340_DEBUG || '9571';
const FOLDER = 'C:\\Workspace\\mtask-p340-a';
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_|HC_|CLAUDECODE$|CLAUDE_CODE_)/.test(k)) delete process.env[k];
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
const ENV = {
  ATRIUM_TERMINAL_SESSION: BOARD, ATRIUM_HERDR_SESSION: BOARD, ATRIUM_PORT: PORT,
  ATRIUM_DATA_DIR: path.join(DEV, 'data'), ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  ATRIUM_CLAUDE_PROJECTS: path.join(DEV, 'p340', 'convos'), ATRIUM_CLAUDE_DESKTOP: 'none', ATRIUM_TEST_PREFIX: 'p340-none-',
};
Object.assign(process.env, ENV);
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(ENV.ATRIUM_CLAUDE_PROJECTS, { recursive: true });
const { logger, sleep, launch, closeApp } = await import('./harness.mjs');
const { assertTestBoard } = await import('./p9-guard.mjs');
assertTestBoard(ENV, { root: DEV });

const log = logger(`p340-${WHAT}-${TAG}`);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 180000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${JSON.stringify(detail).slice(0, 1600)}` : ''}`); };
const AWAKE = ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'];
const shot = (pg, name, opts = {}) => pg.screenshot({ path: path.join(OUT, `${name}.png`), ...opts }).then(() => log(`그림 ${name}.png`)).catch((e) => log(`스크린숏 실패 ${name} ${e.message.slice(0, 80)}`));
const sess = (n) => call('session.list').find((s) => s.name === n);
async function awayWin(app) { return app.evaluate(({ BrowserWindow, screen }) => { const w = BrowserWindow.getAllWindows()[0]; if (!w) return null; const ds = screen.getAllDisplays(); const left = Math.min(...ds.map((d) => d.bounds.x)); const b = w.getBounds(); w.setPosition(left - b.width - 200, 40); return w.getBounds(); }).catch((e) => ({ err: e.message })); }

async function setup() {
  fs.mkdirSync(FOLDER, { recursive: true });
  log(atrium('backend', 'start'));
  if (!sess('sh1')) log(atrium('spawn', FOLDER, '--name', 'sh1', '--kind', 'shell'));
  await sleep(6000);
}

// 알약이 모두 보이게 흉내 세션과 할 일 카드를 더한다(창 안 store만). quiet면 할 일 카드를 미뤄 둔 것(0)만 둔다
async function fakeInbox(page, quiet) {
  await page.evaluate((quiet) => {
    const st = window.__mt.getState();
    const base = [...st.sessions.values()].find((s) => s.name === 'sh1');
    if (!base) return;
    const mk = (id, name, more) => window.__mt.api.emit('session.updated', { ...base, sessionId: id, name, kind: 'shell', flavor: null, ...more });
    mk('p340-w', 'waiter', { state: 'waiting', waitingSince: Date.now() - 60000, unseen: false });
    mk('p340-r', 'finisher', { state: 'ready', unseen: true, lastAnswer: 'done' });
    mk('p340-e', 'broken', { state: 'error', unseen: false });
    mk('p340-k1', 'worker1', { state: 'working', unseen: false, lastPrompt: 'tests', lastActivityAt: Date.now() });
    const now = Date.now();
    window.__mt.api.emit('decision.changed', { cards: [
      { id: 93401, sessionId: base.sessionId, name: base.name, kind: 'decide', question: 'Finish?', options: ['yes', 'no'], createdAt: now - 30000, deferred: quiet || undefined },
    ], held: {}, riding: {} });
  }, quiet);
  await sleep(700);
}

// sh1 노드의 터미널 몸통이 위 알약 줄 밑에 오게 화면을 옮긴다(dx: 노드 왼쪽 끝을 둘 x)
async function under(page, x0) {
  const id = await page.evaluate(() => { const s = [...window.__mt.getState().sessions.values()].find((x) => x.name === 'sh1'); return s && s.sessionId; });
  await page.evaluate((id) => window.__mt.getState().navigateTo(id), id); await sleep(1200);
  const r = await page.evaluate((id) => { const el = document.querySelector(`.react-flow__node[data-id="${id}"]`); if (!el) return null; const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; }, id);
  if (!r) return null;
  await page.evaluate(([dx, dy]) => window.__mt.getState().panBy(dx, dy, 0), [x0 - r.x, -80 - r.y]); await sleep(900);
  return r;
}

// 알약 바탕이 불투명인지 계산된 값으로 본다(바탕 겹 중 하나라도 불투명 색이면)
const pillBgs = (page) => page.evaluate(() => [...document.querySelectorAll('[data-role=top-left] .mt-cp, [data-role=top-left] .mt-dev-badge, [data-role=top-right] .mt-cp')].map((el) => {
  const cs = getComputedStyle(el);
  const solid = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return false; const p = m[1].split(',').map((x) => x.trim()); return p.length < 4 || +p[3] >= 1; };
  const img = cs.backgroundImage || '';
  return { role: el.dataset.role || el.dataset.action || el.className, bg: cs.backgroundColor, img: img.slice(0, 80), opaque: solid(cs.backgroundColor) };
}));

async function pc() {
  const { app, page } = await launch({ log, env: { ...ENV }, args: [`--remote-debugging-port=${DEBUG}`, ...AWAKE] });
  try {
    await awayWin(app);
    await page.waitForFunction(() => window.__mt && window.__mt.getState().boardLoaded, null, { timeout: 60000 }); await sleep(2500);
    call('settings.set', { key: 'language', value: 'ko' }); await sleep(900);
    await page.setViewportSize({ width: 1600, height: 1000 }).catch(() => {}); await sleep(600);
    // 셸 터미널을 글로 채운다(셸에는 atrium send가 안 되니 창에서 친다)
    {
      const id = await page.evaluate(() => { const s = [...window.__mt.getState().sessions.values()].find((x) => x.name === 'sh1'); return s && s.sessionId; });
      await page.evaluate((id) => window.__mt.getState().navigateTo(id, { focusTerminal: true }), id); await sleep(1500);
      await page.keyboard.type("1..80 | ForEach-Object { 'terminal text under the pills 0123456789 ' * 4 }"); await page.keyboard.press('Enter'); await sleep(2500);
      await page.mouse.click(800, 980).catch(() => {}); await sleep(300);
    }
    for (const quiet of [false, true]) {
      await fakeInbox(page, quiet);
      const tag = quiet ? 'quiet' : 'todo';
      for (const x0 of [40, 900]) {
        const r = await under(page, x0);
        log(`node ${JSON.stringify(r)}`);
        await shot(page, `top-${tag}-${x0 < 500 ? 'left' : 'right'}`, { clip: { x: 0, y: 0, width: 1600, height: 120 } });
      }
      const bgs = await pillBgs(page);
      log(`[${tag}] ${JSON.stringify(bgs)}`);
      if (TAG !== 'before') check(`[${tag}] 위 알약이 모두 불투명 바탕`, bgs.length && bgs.every((b) => b.opaque), bgs.filter((b) => !b.opaque));
    }
    await shot(page, 'board');
    // 세션 맵
    await page.click('[data-role=sessions-pill]'); await sleep(2500);
    await shot(page, 'map');
    await shot(page, 'map-top', { clip: { x: 0, y: 0, width: 1600, height: 160 } });
    await page.click('[data-role=sessions-pill]').catch(() => {}); await sleep(800);
  } finally { await closeApp(app); }
}

async function stopAll() {
  try { if (sess('sh1')) log(atrium('kill', 'sh1', '--yes')); } catch (e) { log('kill ' + e.message); }
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
  fs.writeFileSync(path.join(OUT, `p340-${WHAT}.json`), JSON.stringify({ results }, null, 2));
  const bad = results.filter((r) => !r.ok);
  log(`결과 ${results.length - bad.length}/${results.length} 통과${bad.length ? ` 실패: ${bad.map((b) => b.name).join(', ')}` : ''}`);
  process.exit(bad.length ? 1 : 0);
}
