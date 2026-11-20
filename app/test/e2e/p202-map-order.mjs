// P202 창 시험: 세션 맵 폴더 차례(오늘 일한 폴더 먼저, 각각 이름순)와 PC 두 열, 휴대폰 구분 줄.
// 판: 따로 띄운 개발용 판(atrium-dev-p202, 47971, backend/.dev)만 쓴다. 창의 원격 디버깅 포트 9451, 휴대폰 흉내 프록시 47973. 한 번에 한 창·브라우저만(메모리).
//   셸 세션 하나(p202-a, 시험 폴더 C:\Workspace\mtask-p202-a)만 실제로 띄운다. 맵은 페이지 안에서 mission.graph 답과 판의 워크스페이스·폴더를 흉내로 바꾼다(P153과 같은 흉내).
//   흉내 모양: 지어낸 이름(한글·영문 섞인 폴더 여섯 + 폴더 밖). 오늘 활동한 세션이 있는 폴더 둘, 나머지는 사흘 전.
// 실행: sh backend/.dev/clean-env.sh node app/test/e2e/p202-map-order.mjs <setup|pc|phone|stop> [round]
// 결과는 워크트리의 experiments/p202/<round>/(저장소 밖).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const WHAT = process.argv[2] || 'setup';
const TAG = process.argv[3] || 'round-1';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const DEV = path.join(REPO, 'backend', '.dev');
const OUT = path.join(REPO, 'experiments', 'p202', TAG);
const CONVOS = path.join(REPO, 'experiments', 'p202', 'convos');
// P210: 다른 워커의 판에서 돌릴 때 P202_BOARD(atrium-dev-<이름>), P202_PORT, P202_DEBUG, P202_SIM, P202_DIR로 덮는다
const DIR = process.env.P202_DIR || 'C:\\Workspace\\mtask-p202-a';
const BOARD = `atrium-dev-${process.env.P202_BOARD || 'p202'}`, PORT = process.env.P202_PORT || '47971', DEBUG = process.env.P202_DEBUG || '9451', SIM = Number(process.env.P202_SIM || 47973);
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_|HC_)/.test(k)) delete process.env[k];
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
const L = await import('./p59-lib.mjs');
const { NAME, LOGIN, LAPTOP_A } = L;
const ENV = {
  ATRIUM_TERMINAL_SESSION: BOARD, ATRIUM_HERDR_SESSION: BOARD, ATRIUM_PORT: PORT,
  ATRIUM_DATA_DIR: path.join(DEV, 'data'), ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  ATRIUM_CLAUDE_PROJECTS: CONVOS, ATRIUM_CLAUDE_DESKTOP: 'none', ATRIUM_TEST_PREFIX: 'p202-none-',
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
const log = logger(`p202-${WHAT}-${TAG}`);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 120000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 1600)}` : ''}`); };
const AWAKE = ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'];

// ---- 흉내 모양(지어낸 이름) ----
// 폴더: 오늘 = 'zeta lab'(zl-web), '연구'(res-a). 이전 = 'Alpha', 'course 10', 'Course 2', '가람', 폴더 밖(old-box)
const W = (k) => ({ key: k, root: k.replace(/\/\.git$/, '') });
const SHAPE = {
  folders: [
    { id: 'gz', name: 'zeta lab', members: ['d:/w/zl-web/.git', 'd:/w/zl-api/.git'] },
    { id: 'gr', name: '연구', members: ['d:/w/res-a/.git'] },
    { id: 'ga', name: 'Alpha', members: ['d:/w/alpha-2/.git', 'd:/w/alpha-10/.git', 'd:/w/alpha-1/.git'] },
    { id: 'g10', name: 'course 10', members: ['d:/w/c10/.git'] },
    { id: 'g2', name: 'Course 2', members: ['d:/w/c2/.git'] },
    { id: 'gk', name: '가람', members: ['d:/w/garam/.git'] },
  ],
  workspaces: ['d:/w/zl-web/.git', 'd:/w/zl-api/.git', 'd:/w/res-a/.git', 'd:/w/alpha-2/.git', 'd:/w/alpha-10/.git', 'd:/w/alpha-1/.git', 'd:/w/c10/.git', 'd:/w/c2/.git', 'd:/w/garam/.git', 'd:/w/old-box'].map(W),
  // [이름, 워크스페이스 번호, 부모, 오늘?, 상태]
  sessions: [
    ['zl-lead', 0, null, 1, 'working'], ['zl-ui', 0, 'zl-lead', 1, 'working'], ['zl-test', 0, 'zl-lead', 0], ['zl-api', 1, null, 0], ['zl-api-2', 1, null, 0],
    ['res-head', 2, null, 1, 'ready'], ['res-read', 2, 'res-head', 0], ['res-notes', 2, 'res-head', 0],
    ['a1-solo', 5, null, 0], ['a2-lead', 3, null, 0], ['a2-kid', 3, 'a2-lead', 0], ['a2-kid2', 3, 'a2-lead', 0], ['a10', 4, null, 0], ['a10-b', 4, null, 0],
    ['c10-lead', 6, null, 0], ['c10-a', 6, 'c10-lead', 0], ['c10-b', 6, 'c10-lead', 0], ['c10-c', 6, 'c10-b', 0],
    ['c2-x', 7, null, 0], ['c2-y', 7, null, 0], ['garam-1', 8, null, 0], ['garam-2', 8, 'garam-1', 0], ['garam-3', 8, 'garam-1', 0], ['garam-4', 8, 'garam-1', 0],
    ['box-1', 9, null, 0], ['zl-helper', 7, 'zl-lead', 0],
  ],
};
// 페이지 안 흉내: mission.graph 답과 판의 워크스페이스·폴더(store)를 바꾼다
const HOOK = ([shape]) => {
  const api = window.__mt.api, st = window.__mt.getState();
  if (!api.__p202orig) { api.__p202orig = api.call.bind(api); window.__p202st = { workspaces: st.workspaces, groups: st.groups }; }
  const now = Date.now(), mid = new Date(now); mid.setHours(0, 0, 0, 0);
  const todayAt = Math.max(mid.getTime() + 1000, now - 60e3), oldAt = now - 3 * 86400e3;
  const nameOf = (root) => root.split('/').filter(Boolean).pop();
  st.workspaces = [...shape.workspaces.map((w, i) => ({ key: w.key, name: nameOf(w.root), kind: 'repo', root: w.root, createdAt: 1e12 + i, counts: {}, worktrees: [] })), ...(window.__p202st.workspaces || [])];
  st.groups = shape.folders.map((f) => ({ id: f.id, name: f.name, members: [...f.members] }));
  const nodes = shape.sessions.map(([name, wi, parent, today, state], i) => ({ id: `s:${name}`, kind: 'session', sessionId: `fk-${name}`, name, agentKind: 'claude', state: state || 'sleeping', category: state === 'working' ? 'working' : 'idle', workspaceKey: shape.workspaces[wi].key,
    parentId: parent ? `s:${parent}` : null, lineageParent: parent ? `s:${parent}` : null, peers: [], createdAt: 1e12 + i, model: 'claude-opus-5-5', effort: 'high', activeAt: today ? todayAt : oldAt, turnAt: state === 'working' ? todayAt : null, lastPrompt: ['Merge the workers', 'Draft the notes', 'Collect the tables', 'Review the parser diff'][i % 4] }));
  const edges = shape.sessions.filter((s) => s[2]).map(([name, , parent]) => ({ from: `s:${parent}`, to: `s:${name}`, kind: 'spawn', count: 2, lastAt: now - 6e5 }));
  api.call = async (m, p) => (m === 'mission.graph' ? { nodes: [{ id: 'human', kind: 'human', name: 'you' }, ...nodes], edges, counts: { all: nodes.length }, at: now } : api.__p202orig(m, p));
};
const UNHOOK = () => { const api = window.__mt.api; if (api.__p202orig) { api.call = api.__p202orig; const st = window.__mt.getState(); st.workspaces = window.__p202st.workspaces; st.groups = window.__p202st.groups; } };
const TODAY_FOLDERS = ['gz', 'gr'];
const shotTo = (pg, name) => pg.screenshot({ path: path.join(OUT, `${name}.png`) }).then(() => log(`그림 ${name}.png`)).catch((e) => log(`스크린숏 실패 ${name} ${e.message.slice(0, 80)}`));

async function setupBoard() {
  fs.mkdirSync(DIR, { recursive: true });
  log(atrium('backend', 'start').trim().slice(0, 300));
  const have = new Set(call('session.list').map((s) => s.name));
  if (!have.has('p202-a')) log(atrium('--json', 'spawn', DIR, '--kind', 'shell', '--name', 'p202-a').slice(0, 160));
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
  const sx = (x) => x * v.k + v.x;
  const cs = document.querySelector('[data-role=ln-cols]');
  const colh = [...(cs ? cs.querySelectorAll(':scope > .colh') : [])].map((e) => ({ col: e.dataset.col, c: Number(e.dataset.c), x: e.getBoundingClientRect().left, vis: getComputedStyle(e).visibility }));
  const vp = document.querySelector('[data-role=ta-viewport]').getBoundingClientRect();
  const lv0 = L.cols.filter((c) => c.key === 'lv' && c.level === 0).map((c) => ({ c: c.c, want: sx(c.x) + vp.left }));
  const secs = [...document.querySelectorAll('[data-role=ln-section]')].map((e) => { const r = e.getBoundingClientRect(); return { kind: e.dataset.kind, text: e.innerText.replace(/\s+/g, ' ').trim(), x: r.left, y: r.top, w: r.width, h: r.height, fs: parseFloat(getComputedStyle(e.querySelector('span')).fontSize) * v.k }; });
  return { ncol: L.ncol, k: v.k, bands: L.bands.map((b) => ({ id: b.id || 'none', today: b.today, x: b.x, y: b.y })), rows: L.rows.map((r) => r.key), colh, lv0, secs, order: L.order, cards: L.order.map((id) => ({ id, x: L.cards.get(id).x })), colDx: L.colDx, measure: L.measure };
};

async function pc() {
  call('settings.set', { key: 'missionStyle', value: 'territories' });
  const { app, page } = await launch({ log, env: { ...ENV }, args: [`--remote-debugging-port=${DEBUG}`, ...AWAKE] });
  try {
    await awayWin(app);
    await page.evaluate(HOOK, [SHAPE]);
    for (const lang of ['ko', 'en']) {
      call('settings.set', { key: 'language', value: lang }); await sleep(800);
      // ---- 넓은 창 = 두 열 ----
      await page.setViewportSize({ width: 2200, height: 1000 }).catch(() => {});
      await openMission(page);
      await page.evaluate(() => window.__mtTa.fit()); await sleep(900);
      let r = await page.evaluate(READ);
      const want = (() => { const nm = Object.fromEntries(SHAPE.folders.map((f) => [f.id, f.name])); const cmp = new Intl.Collator('en', { numeric: true, sensitivity: 'base' }); const t = TODAY_FOLDERS.slice().sort((a, b) => cmp.compare(nm[a], nm[b])), o = SHAPE.folders.map((f) => f.id).filter((x) => !TODAY_FOLDERS.includes(x)).sort((a, b) => cmp.compare(nm[a], nm[b])); return [...t, ...o, 'none']; })();
      check(`[${lang}] 폴더 차례: 오늘 일한 폴더(이름순) → 나머지(이름순) → 폴더 없음`, JSON.stringify(r.bands.map((b) => b.id)) === JSON.stringify(want), { got: r.bands.map((b) => b.id), want });
      check(`[${lang}] 넓은 창(2200×1000)은 두 열: 왼쪽 오늘, 오른쪽 이전`, r.ncol === 2 && r.bands.every((b) => (b.today ? b.x === 0 : b.x === r.colDx)), { ncol: r.ncol, bands: r.bands, measure: r.measure });
      const heads = r.secs.filter((s) => s.kind !== 'split');
      check(`[${lang}] 두 열 머리 이름표 "${lang === 'ko' ? '오늘·이전' : 'Today·Earlier'}"(맞춤 배율에서 읽히는 크기)`, heads.length === 2 && heads[0].text.startsWith(lang === 'ko' ? '오늘' : 'Today') && heads[1].text.startsWith(lang === 'ko' ? '이전' : 'Earlier') && heads.every((s) => s.fs >= 11), heads);
      const lvh = r.colh.filter((c) => c.col === 'lv0');
      check(`[${lang}] P260: 칸 머리 막대 없음(두 열)`, !lvh.length && !r.colh.length, { lvh, lv0: r.lv0 });
      await shotTo(page, `pc-two-${lang}`);
      if (lang === 'ko') {
        // ↑↓: 왼쪽 열 마지막 카드에서 ↓ = 오른쪽 열 첫 카드
        const ids = await page.evaluate(() => { const L = window.__mtTa.lay(); const ord = L.order.filter((id) => !L.cards.get(id).folded); const left = ord.filter((id) => L.cards.get(id).x < L.colDx), right = ord.filter((id) => L.cards.get(id).x >= L.colDx); return { last: left.at(-1), first: right[0], sorted: ord.indexOf(right[0]) === left.length }; });
        await page.evaluate((id) => { window.__mtTa.flyTo(id, 0.8); }, ids.last); await sleep(700);
        await page.focus(`.mt-ta-card[data-id="${ids.last}"]`); await page.keyboard.press('ArrowDown'); await sleep(800);
        const now1 = await page.evaluate(() => document.activeElement && document.activeElement.dataset.id);
        await page.keyboard.press('ArrowUp'); await sleep(800);
        const now2 = await page.evaluate(() => document.activeElement && document.activeElement.dataset.id);
        check('[ko] ↑↓ 차례: 왼쪽 열 위 → 아래, 그다음 오른쪽 열(↓ = 오른쪽 열 첫 카드, ↑ = 되돌아옴)', ids.sorted && now1 === ids.first && now2 === ids.last, { ...ids, now1, now2 });
        // 사이드바 누르기로 가기(워크스페이스 = 그 줄 맞춤): 오른쪽 열 줄
        const key = 'd:/w/garam/.git';
        await page.evaluate((k) => window.__mt.getState().mapFocus.ws(k), key); await sleep(900);
        const inView = await page.evaluate((k) => { const row = document.querySelector(`.mt-sm-row[data-key="${CSS.escape(k)}"]`), r = row.getBoundingClientRect(), vp = document.querySelector('[data-role=ta-viewport]').getBoundingClientRect(); return { l: r.left - vp.left, r: vp.right - r.right, t: r.top - vp.top, b: vp.bottom - r.bottom, blink: row.classList.contains('blink') }; }, key);
        check('[ko] 사이드바 워크스페이스로 가기: 오른쪽 열 줄이 화면 안에 맞춰진다', inView.l >= -2 && inView.r >= -2 && inView.t >= 0 && inView.b >= 0, inView);
        // 미리보기: 오른쪽 열 카드 위에 머물기
        await page.evaluate((id) => window.__mtTa.flyTo(id, 0.8), ids.first); await sleep(700);
        const b = await page.evaluate((id) => { const r = document.querySelector(`.mt-ta-card[data-id="${id}"]`).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + 20 }; }, ids.first);
        await page.mouse.move(b.x, b.y); await sleep(1400);
        check('[ko] 오른쪽 열 카드 미리보기', !!(await page.$('[data-role=ln-peek]')));
        await page.mouse.move(5, 500); await sleep(300);
        // 열 사이 선(zl-lead → zl-helper)
        const cross = await page.evaluate(() => { const L = window.__mtTa.lay(); const e = L.edges.find((x) => x.from === 's:zl-lead' && x.to === 's:zl-helper'); return e ? { d: e.d.slice(0, 80), el: !!document.querySelector('[data-role=ta-edge][data-from="s:zl-lead"][data-to="s:zl-helper"]') } : null; });
        check('[ko] 열 사이를 건너는 선(다른 폴더의 하위)을 그린다', !!cross && cross.el, cross);
        // 움직임 줄이기
        await page.emulateMedia({ reducedMotion: 'reduce' }); await page.evaluate(() => window.__mtTa.fit()); await sleep(700);
        const rr = await page.evaluate(READ);
        check('[ko] 움직임 줄이기에서도 두 열과 이름표가 보인다', rr.ncol === 2 && rr.secs.length === 2);
        await shotTo(page, 'pc-two-ko-reduce');
        await page.emulateMedia({ reducedMotion: 'no-preference' });
      }
      // ---- 좁은 창 = 한 열 + 구분 줄 ----
      await page.setViewportSize({ width: 1000, height: 1000 }).catch(() => {});
      await sleep(900); await page.evaluate(() => window.__mtTa.fit()); await sleep(900);
      r = await page.evaluate(READ);
      const sp = r.secs.find((s) => s.kind === 'split');
      check(`[${lang}] 좁은 창(1000×1000)은 한 열, 두 칸 사이 구분 줄(위 오늘, 아래 이전)`, r.ncol === 1 && r.secs.length === 1 && !!sp && sp.text.includes(lang === 'ko' ? '오늘' : 'Today') && sp.text.includes(lang === 'ko' ? '이전' : 'Earlier'), { ncol: r.ncol, secs: r.secs, measure: r.measure });
      const lvh1 = r.colh.filter((c) => c.col === 'lv0');
      check(`[${lang}] P260: 칸 머리 막대 없음(한 열)`, !lvh1.length && !r.colh.length, { lvh1, lv0: r.lv0 });
      // 구분 줄이 보이게 그 자리로
      await page.evaluate(() => { const L = window.__mtTa.lay(), s = L.sections[0], v = window.__mtTa.view(); window.__mtTa.set({ k: v.k, x: v.x, y: 360 - s.y * v.k }); }); await sleep(700);
      await shotTo(page, `pc-one-${lang}`);
      await page.evaluate(() => window.__mtTa.fit()); await sleep(500);
      await shotTo(page, `pc-one-fit-${lang}`);
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
        await pg.evaluate(HOOK, [SHAPE]);
        await pg.evaluate(() => { try { localStorage.removeItem('atrium.phoneMap.view'); } catch {} window.__mtPhone.mission(); });
        await pg.waitForSelector('.mt-pmap .mt-ta-card', { timeout: 20000 }); await sleep(1500);
        const r = await pg.evaluate(() => { const L = window.__mtPm.lay(); const s = document.querySelector('.mt-pmap [data-role=ln-section]'); const sr = s && s.getBoundingClientRect(); return { pages: L.pages || 1, rows: L.rows.map((x) => ({ key: x.key, today: x.today, y: x.y, page: x.page })), sec: L.sections[0] || null, text: s ? s.innerText.replace(/\s+/g, ' ') : null, vis: !!sr && sr.width > 40 && sr.height > 10, scrollX: document.documentElement.scrollWidth > innerWidth + 1 }; });
        const lastToday = r.rows.filter((x) => x.today).at(-1), firstOld = r.rows.find((x) => !x.today);
        check(`[phone ${lang}] 오늘 줄이 먼저, 이전 줄이 뒤(같은 규칙)`, r.rows.findIndex((x) => !x.today) === r.rows.filter((x) => x.today).length, r.rows.map((x) => `${x.today ? 'T' : '-'}${x.key}`));
        check(`[phone ${lang}] 오늘·이전 사이 구분 이름표(보인다, 두 칸 사이)`, r.vis && r.text && r.text.includes(lang === 'ko' ? '오늘' : 'Today') && r.text.includes(lang === 'ko' ? '이전' : 'Earlier') && r.sec && (r.pages > 1 || (r.sec.y >= lastToday.y && r.sec.y + r.sec.h <= firstOld.y + 0.5)) && !r.scrollX, r);
        await pg.evaluate(() => window.__mtPm.fit()); await sleep(600);
        await pg.screenshot({ path: path.join(OUT, `phone-fit-${lang}.png`) });
        // 구분 줄 가까이 확대
        await pg.evaluate(() => { const L = window.__mtPm.lay(), s = L.sections[0]; if (s) window.__mtPm.set({ k: 0.9, x: 195 - (s.x + 180) * 0.9, y: 420 - s.y * 0.9 }); }); await sleep(600);
        await pg.screenshot({ path: path.join(OUT, `phone-sep-${lang}.png`) });
        log(`그림 phone-*-${lang}.png`);
        await ctx.close();
      }
    } finally { await browser.close(); }
  } finally { sim.close && sim.close(); }
}

async function stopBoard() {
  for (const s of call('session.list').filter((x) => /^p202-/.test(x.name))) { try { atrium('kill', s.name, '--yes'); } catch (e) { log(`kill ${s.name} ${e.message.slice(0, 100)}`); } }
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
  fs.writeFileSync(path.join(OUT, `p202-${WHAT}.json`), JSON.stringify({ results }, null, 2));
  const bad = results.filter((r) => !r.ok);
  log(`결과 ${results.length - bad.length}/${results.length} 통과${bad.length ? ` 실패: ${bad.map((b) => b.name).join(', ')}` : ''}`);
  process.exit(bad.length ? 1 : 0);
}
