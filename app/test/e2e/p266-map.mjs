// P266 창 시험: 세션 맵 동료 선이 카드를 지나지 않는다(배치로 이웃하게, 남는 쌍은 칸 오른쪽 통로로 우회). 그림 ko·en, PC·휴대폰.
// 판: 따로 띄운 개발용 판(atrium-dev-p266, 48016, backend/.dev)만. 창의 원격 디버깅 포트 9497, 휴대폰 흉내 프록시 48216. 한 번에 한 창·브라우저만(메모리).
//   셸 세션 하나(p266-a, 시험 폴더 C:\Workspace\mtask-p266-a)만 실제로 띄운다. 맵은 페이지 안에서 mission.graph 답, 워크스페이스·폴더를 흉내로 바꾼다(P266과 같은 흉내).
//   흉내 모양(지어낸 이름): 하위 사이에 낀 동료 둘, 서로 다 동료인 셋, 뿌리 동료 사슬, 부모가 다른 같은 단계 동료.
// 실행: node app/test/e2e/p266-map.mjs <setup|pc|phone|stop> [round]  (round가 before면 확인 없이 그림만)
// 결과는 워크트리의 experiments/p266/<round>/(저장소 밖).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const WHAT = process.argv[2] || 'setup';
const TAG = process.argv[3] || 'round-1';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const DEV = path.join(REPO, 'backend', '.dev');
const OUT = path.join(REPO, 'experiments', 'p266', TAG);
const CONVOS = path.join(REPO, 'experiments', 'p266', 'convos');
const DIR = 'C:\\Workspace\\mtask-p266-a';
const BOARD = 'atrium-dev-p266', PORT = '48016', DEBUG = '9497', SIM = 48216;
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_|HC_)/.test(k)) delete process.env[k];
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
const L = await import('./p59-lib.mjs');
const { NAME, LOGIN, LAPTOP_A } = L;
const ENV = {
  ATRIUM_TERMINAL_SESSION: BOARD, ATRIUM_HERDR_SESSION: BOARD, ATRIUM_PORT: PORT,
  ATRIUM_DATA_DIR: path.join(DEV, 'data'), ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  ATRIUM_CLAUDE_PROJECTS: CONVOS, ATRIUM_CLAUDE_DESKTOP: 'none', ATRIUM_TEST_PREFIX: 'p266-none-',
  ATRIUM_TAILSCALE: path.join(REPO, 'app', 'test', 'e2e', 'p49-fake-tailscale.mjs'), P49_FAKE_TS_PORT: PORT,
  ATRIUM_WEB_HOSTS: `${NAME}:${SIM},localhost:${SIM}`,
};
Object.assign(process.env, ENV);
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(CONVOS, { recursive: true });
const { logger, sleep, launch, closeApp } = await import('./harness.mjs');
const { assertTestBoard } = await import('./p9-guard.mjs');
assertTestBoard(ENV, { root: DEV });

const pwDir = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright');
const chromeExe = (() => { try { return fs.readdirSync(pwDir).filter((x) => /^chromium-\d+$/.test(x)).sort().reverse().map((x) => path.join(pwDir, x, 'chrome-win64', 'chrome.exe')).find((f) => fs.existsSync(f)); } catch { return null; } })();
const log = logger(`p266-${WHAT}-${TAG}`);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 120000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 1600)}` : ''}`); };
const AWAKE = ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'];

// ---- 흉내 모양(지어낸 이름) ----
const W = (k) => ({ key: k, root: k.replace(/\/\.git$/, '') });
const SHAPE = {
  folders: [{ id: 'gd', name: 'studio', members: ['d:/w/studio/.git', 'd:/w/lib/.git'] }],
  workspaces: ['d:/w/studio/.git', 'd:/w/lib/.git'].map(W),
  // [이름, 워크스페이스 번호, 부모, 오늘?, 상태, 동료들]
  sessions: [
    ['lead', 0, null, 1, 'working'], ['ui', 0, 'lead', 1, 'working', ['api']], ['docs', 0, 'lead', 1], ['api', 0, 'lead', 1, 'ready', ['ui', 'test']], ['test', 0, 'lead', 1, 'ready', ['ui']], ['bench', 0, 'lead', 1],
    ['pair-a', 0, null, 1, 'ready', ['pair-b']], ['notes', 0, null, 1], ['pair-c', 0, null, 1, 'ready', ['pair-b']], ['pair-b', 0, null, 1, 'ready'],
    ['lib-head', 1, null, 1], ['port', 1, 'lib-head', 1, null, ['check']], ['parse', 1, 'lib-head', 1], ['lib-two', 1, null, 1], ['check', 1, 'lib-two', 1], ['fmt', 1, 'lib-two', 1],
  ],
};
// 동료는 양쪽에(판 계약)
{ const m = new Map(SHAPE.sessions.map((x) => [x[0], new Set(x[5] || [])])); for (const [n, ps] of m) for (const p of ps) m.get(p).add(n); for (const x of SHAPE.sessions) x[5] = [...m.get(x[0])]; }
const RIG = null;
// 페이지 안 흉내: mission.graph 답과 판의 워크스페이스·폴더(store)를 바꾼다
const HOOK = ([shape]) => {
  const api = window.__mt.api, st = window.__mt.getState();
  if (!api.__p266orig) { api.__p266orig = api.call.bind(api); window.__p266st = { workspaces: st.workspaces, groups: st.groups }; }
  const now = Date.now(), mid = new Date(now); mid.setHours(0, 0, 0, 0);
  const todayAt = Math.max(mid.getTime() + 1000, now - 60e3), oldAt = now - 3 * 86400e3;
  const nameOf = (root) => root.split('/').filter(Boolean).pop();
  st.workspaces = [...shape.workspaces.map((w, i) => ({ key: w.key, name: nameOf(w.root), kind: 'repo', root: w.root, createdAt: 1e12 + i, counts: {}, worktrees: [] })), ...(window.__p266st.workspaces || [])];
  st.groups = shape.folders.map((f) => ({ id: f.id, name: f.name, members: [...f.members] }));
  const nodes = shape.sessions.map(([name, wi, parent, today, state, peer], i) => ({ id: `s:${name}`, kind: 'session', sessionId: `fk-${name}`, name, agentKind: 'claude', state: state || 'sleeping', category: state === 'working' ? 'working' : 'idle', workspaceKey: shape.workspaces[wi].key,
    parentId: parent ? `s:${parent}` : null, lineageParent: parent ? `s:${parent}` : null, peers: (peer || []).map((p) => `s:${p}`), createdAt: 1e12 + i, model: 'claude-opus-5-5', effort: 'high', activeAt: today ? todayAt : oldAt, turnAt: state === 'working' ? todayAt : null, lastPrompt: ['Merge the workers', 'Draft the notes', 'Collect the tables', 'Review the parser diff'][i % 4] }));
  const edges = shape.sessions.filter((s) => s[2]).map(([name, , parent]) => ({ from: `s:${parent}`, to: `s:${name}`, kind: 'spawn', count: 2, lastAt: now - 6e5 }));
  api.call = async (m, p) => (m === 'mission.graph' ? { nodes: [{ id: 'human', kind: 'human', name: 'you' }, ...nodes], edges, counts: { all: nodes.length }, at: now } : api.__p266orig(m, p));
};
const UNHOOK = () => { const api = window.__mt.api; if (api.__p266orig) { api.call = api.__p266orig; const st = window.__mt.getState(); st.workspaces = window.__p266st.workspaces; st.groups = window.__p266st.groups; } };
const shotTo = (pg, name) => pg.screenshot({ path: path.join(OUT, `${name}.png`) }).then(() => log(`그림 ${name}.png`)).catch((e) => log(`스크린숏 실패 ${name} ${e.message.slice(0, 80)}`));
const BEFORE = TAG === 'before';

async function setupBoard() {
  fs.mkdirSync(DIR, { recursive: true });
  log(atrium('backend', 'start').trim().slice(0, 300));
  const have = new Set(call('session.list').map((s) => s.name));
  if (!have.has('p266-a')) log(atrium('--json', 'spawn', DIR, '--kind', 'shell', '--name', 'p266-a').slice(0, 160));
  await sleep(2000);
}
async function closeMission(pg) { for (let i = 0; i < 3 && (await pg.$('[data-role="mission"]')); i++) { await pg.keyboard.press('Escape'); await sleep(400); } }
async function openMission(pg) {
  await closeMission(pg);
  await pg.click('[data-action="mission-rail"]');
  await pg.waitForSelector('[data-role="mission"] .mt-ta-card', { timeout: 20000 });
  await sleep(1500);
}
async function awayWin(app) { return app.evaluate(({ BrowserWindow, screen }) => { const w = BrowserWindow.getAllWindows()[0]; if (!w) return null; const ds = screen.getAllDisplays(); const left = Math.min(...ds.map((d) => d.bounds.x)); const b = w.getBounds(); w.setPosition(left - b.width - 200, 40); return w.getBounds(); }).catch((e) => ({ err: e.message })); }

// 지금 맵 읽기: 동료 선과 그 선이 지나는 카드(양끝 말고)
const READ = (sel) => {
  const L = (sel === 'pm' ? window.__mtPm : window.__mtTa).lay();
  const hit = (pts, b) => { for (let i = 1; i < pts.length; i++) { const [ax, ay] = pts[i - 1], [bx, by] = pts[i]; if (Math.max(ax, bx) > b.x + 0.5 && Math.min(ax, bx) < b.x + b.w - 0.5 && Math.max(ay, by) > b.y + 0.5 && Math.min(ay, by) < b.y + b.h - 0.5) return true; } return false; };
  const nm = (id) => (L.cards.get(id) || {}).node?.name || id;
  const peers = L.edges.filter((e) => e.peer).map((e) => ({ a: nm(e.from), b: nm(e.to), detour: !!e.detour, n: e.pts.length, through: [...L.cards.entries()].filter(([id, c]) => id !== e.from && id !== e.to && hit(e.pts, c)).map(([id]) => nm(id)) }));
  const all = L.edges.filter((e) => [...L.cards.entries()].some(([id, c]) => id !== e.from && id !== e.to && hit(e.pts, c))).map((e) => e.id);
  return { peers, all, dom: document.querySelectorAll('.mt-ta-edge.k-peer').length };
};
const zoomRow = async (page, re, k) => { await page.evaluate(([src, kk]) => { const L = window.__mtTa.lay(), row = L.rows.find((x) => new RegExp(src).test(x.key)); window.__mtTa.set({ k: kk, x: window.__mtTa.rail + 20 - (row.x - 10) * kk, y: window.__mtTa.top + 10 - row.y * kk }); }, [re, k]); await sleep(1100); };

async function pc() {
  call('settings.set', { key: 'missionStyle', value: 'territories' });
  const { app, page } = await launch({ log, env: { ...ENV }, args: [`--remote-debugging-port=${DEBUG}`, ...AWAKE] });
  try {
    await awayWin(app);
    await page.evaluate(HOOK, [SHAPE, RIG]);
    for (const lang of ['ko', 'en']) {
      call('settings.set', { key: 'language', value: lang }); await sleep(800);
      await page.setViewportSize({ width: 1600, height: 1000 }).catch(() => {});
      await openMission(page);
      await page.evaluate(() => window.__mtTa.fit()); await sleep(1000);
      await shotTo(page, `pc-fit-${lang}`);
      await zoomRow(page, 'studio', 0.42); await shotTo(page, `pc-studio-${lang}`);
      await zoomRow(page, 'lib', 0.42); await shotTo(page, `pc-lib-${lang}`);
      const r = await page.evaluate(READ, 'ta');
      log(`[${lang}] ${JSON.stringify(r).slice(0, 1800)}`);
      if (!BEFORE) {
        check(`[${lang}] 동료 선이 카드를 지나지 않는다`, r.peers.length >= 6 && r.peers.every((p) => !p.through.length), r.peers);
        check(`[${lang}] 어떤 선도 카드를 지나지 않는다`, !r.all.length, r.all);
        check(`[${lang}] 배치로 풀린 쌍은 곧은 선, 남는 쌍(서로 다 동료 셋의 한 쌍, 다른 부모 아래 동료)은 우회`, r.peers.filter((p) => p.detour).length === 2 && r.peers.filter((p) => !p.detour).every((p) => p.n === 2), r.peers);
      }
      await closeMission(page);
    }
    await page.evaluate(UNHOOK);
  } finally { await closeApp(app); }
}

async function phone() {
  const pw = await import('playwright');
  const toUrl = (p) => 'file:///' + p.replace(/\\/g, '/');
  const { startTsSim } = await import(toUrl(path.join(REPO, 'backend', 'tools', 'ts-sim-proxy.mjs')));
  const sim = startTsSim({ listen: SIM, target: Number(PORT), name: NAME, login: LOGIN, keepOrigin: true }); sim.cfg.ip = LAPTOP_A;
  await sim.ready;
  const SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
  try {
    const browser = await pw.chromium.launch({ headless: true, ...(chromeExe ? { executablePath: chromeExe } : {}) });
    try {
      for (const lang of ['ko', 'en']) {
        call('settings.set', { key: 'language', value: lang });
        const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, screen: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: SAFARI, locale: lang === 'ko' ? 'ko-KR' : 'en-US', reducedMotion: 'reduce' });
        const pg = await ctx.newPage();
        pg.on('pageerror', (e) => log(`[phone pageerror] ${e.message}`));
        await pg.goto(`http://localhost:${SIM}/`);
        await pg.waitForSelector('[data-role=pair]', { timeout: 30000 });
        await pg.fill('[data-field=pair-code]', call('device.code').code);
        await pg.click('[data-action=pair-submit]');
        await pg.waitForFunction(() => window.__mt && window.__mt.getState().boardLoaded && window.__mt.api.conn.phase === 'open', null, { timeout: 60000 });
        await sleep(1200);
        await pg.evaluate(HOOK, [SHAPE, RIG]);
        await pg.evaluate(() => { try { localStorage.removeItem('atrium.phoneMap.view'); } catch {} window.__mtPhone.mission(); });
        await pg.waitForSelector('.mt-pmap .mt-ta-card', { timeout: 20000 }); await sleep(1500);
        await pg.evaluate(() => window.__mtPm.fit()); await sleep(700);
        await pg.screenshot({ path: path.join(OUT, `phone-${lang}.png`) }); log(`그림 phone-${lang}.png`);
        const r = await pg.evaluate(READ, 'pm');
        log(`[phone ${lang}] ${JSON.stringify(r).slice(0, 1800)}`);
        if (!BEFORE) check(`[phone ${lang}] 동료 선·모든 선이 카드를 지나지 않는다`, r.peers.length >= 6 && r.peers.every((p) => !p.through.length) && !r.all.length, r);
        await ctx.close();
      }
    } finally { await browser.close(); }
  } finally { sim.close && sim.close(); }
}

async function stopBoard() {
  for (const s of call('session.list').filter((x) => /^p266-/.test(x.name))) { try { atrium('kill', s.name, '--yes'); } catch (e) { log(`kill ${s.name} ${e.message.slice(0, 100)}`); } }
  await sleep(2000);
  try { log(atrium('terminal', 'stop', '--yes').slice(0, 200)); } catch (e) { log(`terminal stop ${e.message.slice(0, 120)}`); }
  try { log(atrium('backend', 'stop').slice(0, 200)); } catch (e) { log(`backend stop ${e.message.slice(0, 120)}`); }
}

try {
  if (WHAT === 'setup') await setupBoard();
  else if (WHAT === 'pc') await pc();
  else if (WHAT === 'phone') await phone();
  else if (WHAT === 'stop') await stopBoard();
} catch (e) {
  check('시험이 끝까지 돌았다', false, e.stack || e.message);
} finally {
  fs.writeFileSync(path.join(OUT, `p266-${WHAT}.json`), JSON.stringify({ results }, null, 2));
  const bad = results.filter((r) => !r.ok);
  log(`결과 ${results.length - bad.length}/${results.length} 통과${bad.length ? ` 실패: ${bad.map((b) => b.name).join(', ')}` : ''}`);
  process.exit(bad.length ? 1 : 0);
}
