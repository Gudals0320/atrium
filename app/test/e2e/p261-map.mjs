// P261 창 시험: 세션 맵 rig 묶음이 보통 세션 카드·선과 한 가족(같은 카드 꼴·글 크기, 세션 맵 선 말투), 배치 구조 그대로, 휴대폰 rig 시트. 그림 ko·en.
// 판: 따로 띄운 개발용 판(atrium-dev-p261, 48010, backend/.dev)만. 창의 원격 디버깅 포트 9491, 휴대폰 흉내 프록시 48211. 한 번에 한 창·브라우저만(메모리).
//   셸 세션 하나(p261-a, 시험 폴더 C:\Workspace\mtask-p261-a)만 실제로 띄운다. 맵은 페이지 안에서 mission.graph 답, 워크스페이스·폴더, rig 지도 자료를 흉내로 바꾼다(P202와 같은 흉내).
//   흉내 모양(지어낸 이름, P153_SHAPE 꼴): 오늘 폴더(나무 셋 깊이·동료 둘·솔로 셋·rig 묶음 워크스페이스), 이전 폴더(나무·다른 워크스페이스에서 온 하위·솔로), 폴더 밖.
// 실행: sh backend/.dev/clean-env.sh node app/test/e2e/p261-map.mjs <setup|pc|phone|stop> [round]  (round가 before면 확인 없이 그림만)
// 결과는 워크트리의 experiments/p261/<round>/(저장소 밖).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const WHAT = process.argv[2] || 'setup';
const TAG = process.argv[3] || 'round-1';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const DEV = path.join(REPO, 'backend', '.dev');
const OUT = path.join(REPO, 'experiments', 'p261', TAG);
const CONVOS = path.join(REPO, 'experiments', 'p261', 'convos');
const DIR = 'C:\\Workspace\\mtask-p261-a';
const BOARD = 'atrium-dev-p261', PORT = '48011', DEBUG = '9492', SIM = 48211;
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_|HC_)/.test(k)) delete process.env[k];
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
const L = await import('./p59-lib.mjs');
const { NAME, LOGIN, LAPTOP_A } = L;
const ENV = {
  ATRIUM_TERMINAL_SESSION: BOARD, ATRIUM_HERDR_SESSION: BOARD, ATRIUM_PORT: PORT,
  ATRIUM_DATA_DIR: path.join(DEV, 'data'), ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  ATRIUM_CLAUDE_PROJECTS: CONVOS, ATRIUM_CLAUDE_DESKTOP: 'none', ATRIUM_TEST_PREFIX: 'p261-none-',
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
const log = logger(`p261-${WHAT}-${TAG}`);
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
const RSTATE = { data: 'working', ideas: 'waiting', verify: 'ready', trade: 'sleeping' };
const role = (name, docN = 1) => ({ name, docN, session: { sessionId: 'fk-r-' + name, name: 'trade-' + name, state: RSTATE[name] || 'ready', asleep: RSTATE[name] === 'sleeping' }, sectors: [], tools: [], intake: [] });
// 판 그래프의 rig 세션 노드(트리에서는 빠지고 묶음 카드의 사실이 된다)
const RIGNODES = [['data', 'Pull the daily snapshot and check the gaps'], ['ideas', 'Which window should the next test use?'], ['verify', 'Checked hypothesis 12 against the dataset'], ['trade', 'Wait for the next strategy']];
const RIG = { workspace: 'd:/w/rig-trade/.git', status: 'on', name: 'rig-trade', versionN: 1, head: { cycle: 2, beat: { every: '1d', at: '07:30', role: 'data' } },
  builder: { sessionId: 'fk-b1', name: 'trade-builder', state: 'sleeping', asleep: true }, raises: [{ id: 'r1', role: 'trade', reason: 'no baseline', t: 1 }],
  roles: [role('data', 2), role('ideas', 4), role('verify', 3), role('trade', 1)],
  flows: FLOWS.map((f, i) => ({ i, ...f, for: f.for || null, waiting: f.item === 'strategy' ? 1 : 0, openReturns: f.item === 'hypothesis' ? 1 : 0, cycle: null, last: [] })), intake: [], cycleItems: [], entry: null, __nodes: RIGNODES };
// 페이지 안 흉내: mission.graph 답과 판의 워크스페이스·폴더·rig 지도(store)를 바꾼다
const HOOK = ([shape, rig]) => {
  const api = window.__mt.api, st = window.__mt.getState();
  if (!api.__p261orig) { api.__p261orig = api.call.bind(api); window.__p261st = { workspaces: st.workspaces, groups: st.groups, rigMaps: st.rigMaps }; }
  const now = Date.now(), mid = new Date(now); mid.setHours(0, 0, 0, 0);
  const todayAt = Math.max(mid.getTime() + 1000, now - 60e3), oldAt = now - 3 * 86400e3;
  const nameOf = (root) => root.split('/').filter(Boolean).pop();
  st.workspaces = [...shape.workspaces.map((w, i) => ({ key: w.key, name: nameOf(w.root), kind: 'repo', root: w.root, createdAt: 1e12 + i, counts: {}, worktrees: [] })), ...(window.__p261st.workspaces || [])];
  st.groups = shape.folders.map((f) => ({ id: f.id, name: f.name, members: [...f.members] }));
  if (rig) st.rigMaps = new Map([[rig.workspace, rig]]);
  const nodes = shape.sessions.map(([name, wi, parent, today, state, peer], i) => ({ id: `s:${name}`, kind: 'session', sessionId: `fk-${name}`, name, agentKind: 'claude', state: state || 'sleeping', category: state === 'working' ? 'working' : 'idle', workspaceKey: shape.workspaces[wi].key,
    parentId: parent ? `s:${parent}` : null, lineageParent: parent ? `s:${parent}` : null, peers: peer ? [`s:${peer}`] : [], createdAt: 1e12 + i, model: 'claude-opus-5-5', effort: 'high', activeAt: today ? todayAt : oldAt, turnAt: state === 'working' ? todayAt : null, lastPrompt: ['Merge the workers', 'Draft the notes', 'Collect the tables', 'Review the parser diff'][i % 4] }));
  if (rig) for (const [n, lp] of rig.__nodes || []) { const r = rig.roles.find((x) => x.name === n); nodes.push({ id: 's:' + r.session.sessionId, kind: 'session', sessionId: r.session.sessionId, name: r.session.name, agentKind: 'claude', state: r.session.state, category: r.session.state === 'working' ? 'working' : 'idle', workspaceKey: rig.workspace, rigRole: n, peers: [], createdAt: 1e12, model: 'claude-haiku-5-5', effort: 'medium', activeAt: todayAt, turnAt: r.session.state === 'working' ? todayAt : null, lastPrompt: lp, ask: r.session.state === 'waiting' ? lp : null }); }
  if (rig) nodes.push({ id: 's:fk-b1', kind: 'session', sessionId: 'fk-b1', name: 'trade-builder', agentKind: 'claude', state: 'sleeping', category: 'idle', workspaceKey: rig.workspace, rigRole: '@builder', peers: [], createdAt: 1e12, model: 'claude-opus-5-5', effort: 'high', activeAt: todayAt, lastPrompt: 'Add a baseline check to trade' });
  const edges = shape.sessions.filter((s) => s[2]).map(([name, , parent]) => ({ from: `s:${parent}`, to: `s:${name}`, kind: 'spawn', count: 2, lastAt: now - 6e5 }));
  api.call = async (m, p) => (m === 'mission.graph' ? { nodes: [{ id: 'human', kind: 'human', name: 'you' }, ...nodes], edges, counts: { all: nodes.length }, at: now } : api.__p261orig(m, p));
};
const UNHOOK = () => { const api = window.__mt.api; if (api.__p261orig) { api.call = api.__p261orig; const st = window.__mt.getState(); st.workspaces = window.__p261st.workspaces; st.groups = window.__p261st.groups; st.rigMaps = window.__p261st.rigMaps; } };
const shotTo = (pg, name) => pg.screenshot({ path: path.join(OUT, `${name}.png`) }).then(() => log(`그림 ${name}.png`)).catch((e) => log(`스크린숏 실패 ${name} ${e.message.slice(0, 80)}`));
const BEFORE = TAG === 'before';
const SOLOS = { studio: ['notes', 'scratch', 'review-1'], res: ['old-solo'], lib: ['lib-solo'], box: ['box-1', 'box-2'] };

async function setupBoard() {
  fs.mkdirSync(DIR, { recursive: true });
  log(atrium('backend', 'start').trim().slice(0, 300));
  const have = new Set(call('session.list').map((s) => s.name));
  if (!have.has('p261-a')) log(atrium('--json', 'spawn', DIR, '--kind', 'shell', '--name', 'p261-a').slice(0, 160));
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

// 지금 맵 읽기: rig 묶음 카드와 보통 카드
const READ = () => {
  const L = window.__mtTa.lay(), v = window.__mtTa.view();
  const cs = (el, sel) => { const x = el && el.querySelector(sel); if (!x) return null; const s = getComputedStyle(x); return { fs: s.fontSize, fw: s.fontWeight, color: s.color }; };
  const rigSlots = [...document.querySelectorAll('.mt-ta-slot.rig')];
  const tree = document.querySelector('.mt-ta-slot[data-role=ta-slot]');
  const box = (e) => ({ x: parseFloat(e.style.left), y: parseFloat(e.style.top), w: parseFloat(e.style.width), h: parseFloat(e.style.height) });
  const map = document.querySelector('[data-role=rig-map]');
  const edgeCs = (sel) => { const x = document.querySelector(sel); if (!x) return null; const s = getComputedStyle(x); return { sw: s.strokeWidth, stroke: s.stroke }; };
  const lab = document.querySelector('[data-role=rm-line-label]');
  return { k: v.k, cw: L.cw, rigs: (L.rigs || []).map((r) => ({ key: r.key, x: r.x, y: r.y, w: r.w, h: r.h })),
    rig: rigSlots.map((e) => ({ role: e.dataset.role, name: e.dataset.name, state: e.dataset.state, ...box(e), tag: (e.querySelector('[data-role=rm-tag]') || {}).textContent, light: !!e.querySelector('[data-role=ta-light]') })),
    treeBox: tree ? box(tree) : null, rigName: cs(rigSlots[0], '.cname'), treeName: cs(tree, '.cname'), rigTask: cs(rigSlots[0], '.c3'), treeTask: cs(tree, '.c3'),
    mapTransform: map ? map.style.transform || '' : null, mapOrigin: map ? { x: parseFloat(map.style.left), y: parseFloat(map.style.top) } : null,
    lines: document.querySelectorAll('[data-role=rm-line].k-rig').length, lit: document.querySelectorAll('[data-role=rm-line].lit').length, open: document.querySelectorAll('[data-role=rm-open-return]').length,
    raise: document.querySelectorAll('[data-role=rm-raise].k-raise').length, rigEdge: edgeCs('[data-role=rm-line]'), treeEdge: edgeCs('.mt-ta-edge.k-spawn'),
    labFs: lab ? getComputedStyle(lab).fontSize : null, treeLabFs: (() => { const x = document.querySelector('[data-role=ta-edge-label]'); return x ? getComputedStyle(x).fontSize : null; })(),
    labels: [...document.querySelectorAll('[data-role=rm-line-label]')].map((x) => x.textContent), wait: [...document.querySelectorAll('[data-role=rm-wait]')].map((x) => x.textContent) };
};
const near = async (page, k) => { await page.evaluate((kk) => { const L = window.__mtTa.lay(), r = (L.rigs || []).find((x) => /rig-trade/.test(x.key)); window.__mtTa.set({ k: kk, x: window.__mtTa.rail + 30 - (r.x - 20) * kk, y: window.__mtTa.top + 30 - (r.y - 20) * kk }); }, k); await sleep(1100); };

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
      // rig 묶음과 그 위 보통 카드(gen)가 함께 보이게, 보통 거리·가까이
      await page.evaluate(() => { const L = window.__mtTa.lay(), row = L.rows.find((x) => /rig-trade/.test(x.key)); const k = 0.5; window.__mtTa.set({ k, x: window.__mtTa.rail + 20 - (row.x - 10) * k, y: window.__mtTa.top + 10 - row.y * k }); }); await sleep(1100);
      await shotTo(page, `pc-rig-row-${lang}`);
      await near(page, 0.85);
      await shotTo(page, `pc-rig-near-${lang}`);
      const r = await page.evaluate(READ);
      log(`[${lang}] ${JSON.stringify(r).slice(0, 1500)}`);
      if (!BEFORE) {
        const roles = r.rig.filter((x) => x.role === 'rm-role'), b = r.rig.find((x) => x.role === 'rm-builder');
        check(`[${lang}] rig 카드 다섯(역할 넷 + 빌더)이 보통 카드(.mt-ta-slot)로`, roles.length === 4 && !!b, r.rig.map((x) => x.name));
        check(`[${lang}] 카드 폭 = 보통 카드 폭, 역할마다 같은 크기`, r.rig.every((x) => x.w === r.cw && x.h === r.rig[0].h) && r.treeBox && r.treeBox.w === r.cw, { cw: r.cw, rig: r.rig.map((x) => [x.w, x.h]) });
        check(`[${lang}] 글 크기 = 보통 카드(이름·일 줄), 묶음 확대 없음`, r.rigName && r.treeName && r.rigName.fs === r.treeName.fs && r.rigTask && r.treeTask && r.rigTask.fs === r.treeTask.fs && !r.mapTransform, { rn: r.rigName, tn: r.treeName, rt: r.rigTask, tt: r.treeTask, tr: r.mapTransform });
        check(`[${lang}] 꼬리표: 역할 · <역할> · v<판>, rig 빌더`, roles.every((x) => x.tag && x.tag.includes(x.name)) && b.tag === (lang === 'ko' ? 'rig 빌더' : 'rig builder'), r.rig.map((x) => x.tag));
        check(`[${lang}] 상태: 일함(빛)·응답 필요·쉼·잠`, roles.find((x) => x.name === 'data').light && roles.find((x) => x.name === 'ideas').state === 'waiting', r.rig.map((x) => x.name + ':' + x.state));
        check(`[${lang}] 배치 그대로: 역할 한 줄, 빌더는 오른쪽 끝 역할 아래`, new Set(roles.map((x) => x.y)).size === 1 && b.x === Math.max(...roles.map((x) => x.x)) && b.y > roles[0].y + roles[0].h, r.rig);
        check(`[${lang}] 줄: 세션 맵 선 말투(나무 선과 같은 굵기), 이웃한 쌍만, 밝은 쌍, 붉은 점, 노랑 올림`, r.lines === 6 && r.lit >= 2 && r.open === 1 && r.raise === 1 && r.rigEdge && r.treeEdge && r.rigEdge.sw === r.treeEdge.sw, { lines: r.lines, lit: r.lit, open: r.open, raise: r.raise, e: r.rigEdge, t: r.treeEdge });
        check(`[${lang}] 줄 글 = 세션 맵 선 이름표 크기(11.5px)`, r.labFs === '11.5px' && r.labels.length === 6 && r.wait.length === 1, { labFs: r.labFs, tree: r.treeLabFs, labels: r.labels, wait: r.wait });
        // 카드 누르기 = 명령줄 @태그(보통 카드와 같은 길)
        await page.click('[data-role=rm-role][data-name=verify] .mt-ta-card'); await sleep(500);
        const tg = await page.evaluate(() => window.__mtTa.tags());
        check(`[${lang}] 역할 카드 누르기 = 명령줄 @태그`, tg.includes('trade-verify'), tg);
        await page.click('[data-role=rm-role][data-name=verify] .mt-ta-card'); await sleep(400);
        // 미리 보기(보통 카드와 같은 Peek)
        await page.hover('[data-role=rm-role][data-name=data] .mt-ta-card'); await sleep(1100);
        const pk = await page.evaluate(() => (document.querySelector('[data-role=ln-peek]') || {}).textContent || null);
        check(`[${lang}] 미리 보기(Peek)`, !!pk && pk.includes('trade-data'), pk && pk.slice(0, 120));
        await shotTo(page, `pc-rig-peek-${lang}`);
        await page.mouse.move(5, 500); await sleep(300);
      }
      // 멀리(타일)
      await near(page, 0.22);
      await shotTo(page, `pc-rig-far-${lang}`);
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
        for (const tab of ['today']) {
          await pg.evaluate((t) => window.__mtPm.setTab(t), tab); await sleep(900);
          await pg.evaluate(() => window.__mtPm.fit()); await sleep(700);
          const r = await pg.evaluate(() => { const L = window.__mtPm.lay(); return { div: document.querySelectorAll('[data-role=pm-solo-div]').length, solos: [...L.cards.values()].filter((b) => b.depth === -1).map((b) => ({ n: b.node.name, x: b.x, y: b.y, ws: b.ws })), x0: L.cols[0].x, tree: [...L.cards.values()].filter((b) => b.depth >= 0).map((b) => ({ x: b.x, y: b.y, h: b.h, ws: b.ws })) }; });
          await pg.screenshot({ path: path.join(OUT, `phone-${tab}-${lang}.png`) });
          log(`그림 phone-${tab}-${lang}.png`);
        }
        await pg.click('[data-role=pl-rig]'); await sleep(900);
        const rs = await pg.evaluate(() => ({ cards: document.querySelectorAll('[data-role=pm-rig-card]').length, roles: [...document.querySelectorAll('[data-role=pm-rig-role]')].map((e) => e.className + ':' + e.textContent) }));
        log(`[phone ${lang}] rig 시트 ${JSON.stringify(rs)}`);
        if (!BEFORE) check(`[phone ${lang}] rig 시트: 카드 하나, 역할 넷`, rs.cards === 1 && rs.roles.length === 4, rs);
        await pg.screenshot({ path: path.join(OUT, `phone-rig-${lang}.png`) }); log(`그림 phone-rig-${lang}.png`);
        await ctx.close();
      }
    } finally { await browser.close(); }
  } finally { sim.close && sim.close(); }
}

async function stopBoard() {
  for (const s of call('session.list').filter((x) => /^p261-/.test(x.name))) { try { atrium('kill', s.name, '--yes'); } catch (e) { log(`kill ${s.name} ${e.message.slice(0, 100)}`); } }
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
  fs.writeFileSync(path.join(OUT, `p261-${WHAT}.json`), JSON.stringify({ results }, null, 2));
  const bad = results.filter((r) => !r.ok);
  log(`결과 ${results.length - bad.length}/${results.length} 통과${bad.length ? ` 실패: ${bad.map((b) => b.name).join(', ')}` : ''}`);
  process.exit(bad.length ? 1 : 0);
}
