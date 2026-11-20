// P260 창 시험: 세션 맵 칸 머리 띠 없음, 솔로는 시작 칸에서 나무 아래로, rig 묶음은 그 아래, 두 열, 휴대폰. 전(옛 빌드)·후 그림.
// 판: 따로 띄운 개발용 판(atrium-dev-p260, 48010, backend/.dev)만. 창의 원격 디버깅 포트 9491, 휴대폰 흉내 프록시 48210. 한 번에 한 창·브라우저만(메모리).
//   셸 세션 하나(p260-a, 시험 폴더 C:\Workspace\mtask-p260-a)만 실제로 띄운다. 맵은 페이지 안에서 mission.graph 답, 워크스페이스·폴더, rig 지도 자료를 흉내로 바꾼다(P202와 같은 흉내).
//   흉내 모양(지어낸 이름, P153_SHAPE 꼴): 오늘 폴더(나무 셋 깊이·동료 둘·솔로 셋·rig 묶음 워크스페이스), 이전 폴더(나무·다른 워크스페이스에서 온 하위·솔로), 폴더 밖.
// 실행: sh backend/.dev/clean-env.sh node app/test/e2e/p260-map.mjs <setup|pc|phone|stop> [round]  (round가 before면 확인 없이 그림만)
// 결과는 워크트리의 experiments/p260/<round>/(저장소 밖).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const WHAT = process.argv[2] || 'setup';
const TAG = process.argv[3] || 'round-1';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const DEV = path.join(REPO, 'backend', '.dev');
const OUT = path.join(REPO, 'experiments', 'p260', TAG);
const CONVOS = path.join(REPO, 'experiments', 'p260', 'convos');
const DIR = 'C:\\Workspace\\mtask-p260-a';
const BOARD = 'atrium-dev-p260', PORT = '48010', DEBUG = '9491', SIM = 48210;
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_|HC_)/.test(k)) delete process.env[k];
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
const L = await import('./p59-lib.mjs');
const { NAME, LOGIN, LAPTOP_A } = L;
const ENV = {
  ATRIUM_TERMINAL_SESSION: BOARD, ATRIUM_HERDR_SESSION: BOARD, ATRIUM_PORT: PORT,
  ATRIUM_DATA_DIR: path.join(DEV, 'data'), ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  ATRIUM_CLAUDE_PROJECTS: CONVOS, ATRIUM_CLAUDE_DESKTOP: 'none', ATRIUM_TEST_PREFIX: 'p260-none-',
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
const log = logger(`p260-${WHAT}-${TAG}`);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 120000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 1600)}` : ''}`); };
const AWAKE = ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'];

// ---- 흉내 모양(지어낸 이름) ----
const W = (k) => ({ key: k, root: k.replace(/\/\.git$/, '') });
const SHAPE = {
  folders: [
    { id: 'gd', name: 'studio', members: ['d:/w/studio/.git', 'd:/w/rig-trade/.git'] },
    { id: 'gr', name: '연구', members: ['d:/w/res/.git', 'd:/w/lib/.git'] },
  ],
  workspaces: ['d:/w/studio/.git', 'd:/w/rig-trade/.git', 'd:/w/res/.git', 'd:/w/lib/.git', 'd:/w/box'].map(W),
  // [이름, 워크스페이스 번호, 부모, 오늘?, 상태, 동료]
  sessions: [
    ['notes', 0, null, 1], ['st-lead', 0, null, 1, 'working'], ['st-ui', 0, 'st-lead', 1, 'working'], ['st-api', 0, 'st-lead', 1], ['st-api-test', 0, 'st-api', 0], ['st-review', 0, 'st-lead', 1, 'ready'],
    ['scratch', 0, null, 0], ['pair-a', 0, null, 1, 'ready', 'pair-b'], ['pair-b', 0, null, 1, 'ready', 'pair-a'], ['review-1', 0, null, 0],
    ['gen', 1, null, 1],
    ['res-head', 2, null, 0], ['res-read', 2, 'res-head', 0], ['res-notes', 2, 'res-head', 0], ['old-solo', 2, null, 0],
    ['lib-port', 3, 'st-lead', 0], ['lib-solo', 3, null, 0],
    ['box-1', 4, null, 0], ['box-2', 4, null, 0],
  ],
};
// rig 지도 자료(역할 넷, P254 시험의 rig-trade 꼴, 역할 세션은 지어낸 id)
const FLOWS = [
  { item: 'seed', from: ['human'], to: ['ideas'] }, { item: 'hypothesis', from: ['ideas'], to: ['verify'] }, { item: 'result', from: ['verify'], to: ['ideas'], for: 'hypothesis' },
  { item: 'data_request', from: ['ideas', 'human'], to: ['data'] }, { item: 'data_reply', from: ['data'], to: ['ideas'], for: 'data_request' }, { item: 'dataset', from: ['data'], to: ['verify'] },
  { item: 'strategy', from: ['verify'], to: ['trade'] }, { item: 'live_report', from: ['trade'], to: ['verify'], for: 'strategy' }, { item: 'halt', from: ['human'], to: ['trade'] },
];
const role = (name, docN = 1) => ({ name, docN, session: { sessionId: 'fk-r-' + name, name: 'trade-' + name, state: 'ready', asleep: false }, sectors: [], tools: [], intake: [] });
const RIG = { workspace: 'd:/w/rig-trade/.git', status: 'on', name: 'rig-trade', versionN: 1, head: { cycle: 2, beat: { every: '1d', at: '07:30', role: 'data' } },
  builder: { sessionId: 'fk-b1', name: 'trade-builder', state: 'sleeping', asleep: true }, raises: [{ id: 'r1', role: 'trade', reason: 'no baseline', t: 1 }],
  roles: [role('data', 2), role('ideas', 4), role('verify', 3), role('trade', 1)],
  flows: FLOWS.map((f, i) => ({ i, ...f, for: f.for || null, waiting: f.item === 'strategy' ? 1 : 0, openReturns: f.item === 'hypothesis' ? 1 : 0, cycle: null, last: [] })), intake: [], cycleItems: [], entry: null };
// 페이지 안 흉내: mission.graph 답과 판의 워크스페이스·폴더·rig 지도(store)를 바꾼다
const HOOK = ([shape, rig]) => {
  const api = window.__mt.api, st = window.__mt.getState();
  if (!api.__p260orig) { api.__p260orig = api.call.bind(api); window.__p260st = { workspaces: st.workspaces, groups: st.groups, rigMaps: st.rigMaps }; }
  const now = Date.now(), mid = new Date(now); mid.setHours(0, 0, 0, 0);
  const todayAt = Math.max(mid.getTime() + 1000, now - 60e3), oldAt = now - 3 * 86400e3;
  const nameOf = (root) => root.split('/').filter(Boolean).pop();
  st.workspaces = [...shape.workspaces.map((w, i) => ({ key: w.key, name: nameOf(w.root), kind: 'repo', root: w.root, createdAt: 1e12 + i, counts: {}, worktrees: [] })), ...(window.__p260st.workspaces || [])];
  st.groups = shape.folders.map((f) => ({ id: f.id, name: f.name, members: [...f.members] }));
  if (rig) st.rigMaps = new Map([[rig.workspace, rig]]);
  const nodes = shape.sessions.map(([name, wi, parent, today, state, peer], i) => ({ id: `s:${name}`, kind: 'session', sessionId: `fk-${name}`, name, agentKind: 'claude', state: state || 'sleeping', category: state === 'working' ? 'working' : 'idle', workspaceKey: shape.workspaces[wi].key,
    parentId: parent ? `s:${parent}` : null, lineageParent: parent ? `s:${parent}` : null, peers: peer ? [`s:${peer}`] : [], createdAt: 1e12 + i, model: 'claude-opus-5-5', effort: 'high', activeAt: today ? todayAt : oldAt, turnAt: state === 'working' ? todayAt : null, lastPrompt: ['Merge the workers', 'Draft the notes', 'Collect the tables', 'Review the parser diff'][i % 4] }));
  const edges = shape.sessions.filter((s) => s[2]).map(([name, , parent]) => ({ from: `s:${parent}`, to: `s:${name}`, kind: 'spawn', count: 2, lastAt: now - 6e5 }));
  api.call = async (m, p) => (m === 'mission.graph' ? { nodes: [{ id: 'human', kind: 'human', name: 'you' }, ...nodes], edges, counts: { all: nodes.length }, at: now } : api.__p260orig(m, p));
};
const UNHOOK = () => { const api = window.__mt.api; if (api.__p260orig) { api.call = api.__p260orig; const st = window.__mt.getState(); st.workspaces = window.__p260st.workspaces; st.groups = window.__p260st.groups; st.rigMaps = window.__p260st.rigMaps; } };
const shotTo = (pg, name) => pg.screenshot({ path: path.join(OUT, `${name}.png`) }).then(() => log(`그림 ${name}.png`)).catch((e) => log(`스크린숏 실패 ${name} ${e.message.slice(0, 80)}`));
const BEFORE = TAG === 'before';
const SOLOS = { studio: ['notes', 'scratch', 'review-1'], res: ['old-solo'], lib: ['lib-solo'], box: ['box-1', 'box-2'] };

async function setupBoard() {
  fs.mkdirSync(DIR, { recursive: true });
  log(atrium('backend', 'start').trim().slice(0, 300));
  const have = new Set(call('session.list').map((s) => s.name));
  if (!have.has('p260-a')) log(atrium('--json', 'spawn', DIR, '--kind', 'shell', '--name', 'p260-a').slice(0, 160));
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

// 지금 맵 읽기
const READ = () => {
  const L = window.__mtTa.lay(), v = window.__mtTa.view();
  const lv0 = (c) => L.cols.find((x) => x.key === 'lv' && x.level === 0 && (x.c || 0) === c).x;
  const cards = [...L.cards.entries()].map(([id, b]) => ({ id: id.slice(2), x: b.x, y: b.y, h: b.h, depth: b.depth, ws: b.ws, col: L.ncol > 1 && b.x >= L.colDx ? 1 : 0 }));
  return { ncol: L.ncol, k: v.k, W: L.W, cols: L.cols.map((c) => c.key + (c.level ?? '')), lv0: [lv0(0)], colsBar: !!document.querySelector('[data-role=ln-cols]'), colh: document.querySelectorAll('.colh').length, divs: document.querySelectorAll('.mt-sm-div').length,
    cards, rigs: (L.rigs || []).map((r) => ({ key: r.key, x: r.x, y: r.y, w: r.w, h: r.h })), rigShown: !!document.querySelector('[data-role=rig-map]'), colDx: L.colDx };
};
const soloOk = (r) => {
  const bad = [];
  for (const c of r.cards.filter((x) => x.depth === -1)) {
    const col0 = r.lv0[0] + (c.col ? r.colDx : 0);
    if (Math.abs(c.x - col0) > 0.5) bad.push(c.id + ' x');
    for (const o of r.cards) if (o.ws === c.ws && o.depth !== -1 && o.y > c.y) bad.push(c.id + ' 위에 ' + o.id);
  }
  return bad;
};

async function pc() {
  call('settings.set', { key: 'missionStyle', value: 'territories' });
  const { app, page } = await launch({ log, env: { ...ENV }, args: [`--remote-debugging-port=${DEBUG}`, ...AWAKE] });
  try {
    await awayWin(app);
    await page.evaluate(HOOK, [SHAPE, RIG]);
    for (const lang of ['ko', 'en']) {
      call('settings.set', { key: 'language', value: lang }); await sleep(800);
      // ---- 보통 창 = 한 열 ----
      await page.setViewportSize({ width: 1600, height: 1000 }).catch(() => {});
      await openMission(page);
      await page.evaluate(() => window.__mtTa.fit()); await sleep(900);
      let r = await page.evaluate(READ);
      log(`[${lang}] 1600: ncol ${r.ncol} W ${r.W} cols ${r.cols.join()} rigs ${JSON.stringify(r.rigs)}`);
      await shotTo(page, `pc-fit-${lang}`);
      // studio 줄 가까이
      await page.evaluate(() => { const L = window.__mtTa.lay(), row = L.rows.find((x) => /studio/.test(x.key)), rig = (L.rigs || []).find((x) => /rig-trade/.test(x.key)); const k = 0.42; window.__mtTa.set({ k, x: window.__mtTa.rail + 20 - (row.x - 10) * k, y: window.__mtTa.top + 10 - row.y * k }); }); await sleep(900);
      await shotTo(page, `pc-studio-${lang}`);
      await page.evaluate(() => { const L = window.__mtTa.lay(), row = L.rows.find((x) => /rig-trade/.test(x.key)); const k = 0.42; window.__mtTa.set({ k, x: window.__mtTa.rail + 20 - (row.x - 10) * k, y: window.__mtTa.top + 10 - row.y * k }); }); await sleep(900);
      await shotTo(page, `pc-rig-${lang}`);
      if (!BEFORE) {
        check(`[${lang}] 칸 머리 띠·구분선 없음`, !r.colsBar && !r.colh && !r.divs, r);
        check(`[${lang}] 솔로는 시작 칸, 같은 줄 나무 아래`, !soloOk(r).length, soloOk(r));
        const tr = r.rigs.find((x) => /rig-trade/.test(x.key)), gen = r.cards.find((x) => x.id === 'gen');
        check(`[${lang}] rig 묶음은 시작 칸에서 그 줄 솔로(gen) 아래`, tr && Math.abs(tr.x - r.lv0[0]) < 0.5 && gen && tr.y >= gen.y + gen.h && r.rigShown, { tr, gen });
        check(`[${lang}] 나무: 깊이마다 같은 칸 x`, r.cards.filter((c) => c.depth >= 0).every((c) => Math.abs(c.x - (r.lv0[0] + (c.col ? r.colDx : 0) + c.depth * (r.cards.find((x) => x.id === 'st-ui').x - r.cards.find((x) => x.id === 'st-lead').x))) < 0.5));
      }
      // ---- 넓은 창 = 두 열 ----
      await page.setViewportSize({ width: 2400, height: 900 }).catch(() => {});
      await sleep(900); await page.evaluate(() => window.__mtTa.fit()); await sleep(1200);
      r = await page.evaluate(READ);
      log(`[${lang}] 2400×900: ncol ${r.ncol}`);
      await shotTo(page, `pc-wide-${lang}`);
      if (!BEFORE) {
        check(`[${lang}] 넓고 낮은 창은 두 열, 솔로는 그 열 시작 칸`, r.ncol === 2 && !soloOk(r).length, { ncol: r.ncol, bad: soloOk(r) });
        // 카드 찾아가기(요약 열·사이드바와 같은 flyTo): 오른쪽 열 솔로
        await page.evaluate(() => window.__mtTa.flyTo('s:lib-solo', 0.9)); await sleep(1000);
        const vis = await page.evaluate(() => { const e = document.querySelector('.mt-ta-card[data-id="s:lib-solo"]'); if (!e) return null; const b = e.getBoundingClientRect(); return b.left >= 0 && b.right <= innerWidth && b.top >= window.__mtTa.top && b.bottom <= innerHeight; });
        check(`[${lang}] 찾아가기: 오른쪽 열 솔로 카드가 화면 안`, vis === true, vis);
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
        await pg.evaluate(HOOK, [SHAPE, null]);
        await pg.evaluate(() => { try { localStorage.removeItem('atrium.phoneMap.view'); } catch {} window.__mtPhone.mission(); });
        await pg.waitForSelector('.mt-pmap .mt-ta-card', { timeout: 20000 }); await sleep(1500);
        for (const tab of ['today', 'earlier']) {
          await pg.evaluate((t) => window.__mtPm.setTab(t), tab); await sleep(900);
          await pg.evaluate(() => window.__mtPm.fit()); await sleep(700);
          const r = await pg.evaluate(() => { const L = window.__mtPm.lay(); return { div: document.querySelectorAll('[data-role=pm-solo-div]').length, solos: [...L.cards.values()].filter((b) => b.depth === -1).map((b) => ({ n: b.node.name, x: b.x, y: b.y, ws: b.ws })), x0: L.cols[0].x, tree: [...L.cards.values()].filter((b) => b.depth >= 0).map((b) => ({ x: b.x, y: b.y, h: b.h, ws: b.ws })) }; });
          if (!BEFORE) check(`[phone ${lang} ${tab}] 솔로는 시작 칸(왼쪽 끝)에서 나무 아래, 가름 점선 없음`, !r.div && r.solos.length && r.solos.every((s) => s.x === r.x0 && r.tree.filter((t) => t.ws === s.ws).every((t) => t.y + t.h <= s.y)), r);
          await pg.screenshot({ path: path.join(OUT, `phone-${tab}-${lang}.png`) });
          log(`그림 phone-${tab}-${lang}.png`);
        }
        await ctx.close();
      }
    } finally { await browser.close(); }
  } finally { sim.close && sim.close(); }
}

async function stopBoard() {
  for (const s of call('session.list').filter((x) => /^p260-/.test(x.name))) { try { atrium('kill', s.name, '--yes'); } catch (e) { log(`kill ${s.name} ${e.message.slice(0, 100)}`); } }
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
  fs.writeFileSync(path.join(OUT, `p260-${WHAT}.json`), JSON.stringify({ results }, null, 2));
  const bad = results.filter((r) => !r.ok);
  log(`결과 ${results.length - bad.length}/${results.length} 통과${bad.length ? ` 실패: ${bad.map((b) => b.name).join(', ')}` : ''}`);
  process.exit(bad.length ? 1 : 0);
}
