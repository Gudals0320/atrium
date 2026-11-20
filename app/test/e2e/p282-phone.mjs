// P282 창 시험: 판이 업데이트되면 원격 웹 화면이 새 화면 코드로 다시 불러오는지(한 번만, 쓰는 중이면 기다림, 보내지 않은 글·보던 화면·맵 시점 이어짐),
// 키보드가 열렸을 때 입력 줄 아래 빈칸이 없는지(iOS 홈 화면 앱처럼 창 높이도 함께 줄 때), 위쪽 상태 줄 자리 채움, P280 결과(입력 안내·맵 두 열)가 다시 불러온 뒤 그대로인지.
// 판: 따로 띄운 개발용 판(atrium-dev-p282, 48032, backend/.dev)만 쓴다. 휴대폰 흉내 프록시 9513. 한 번에 브라우저 하나(메모리).
// 업데이트 흉내: 판이 내보내는 app/dist의 build.json(과 renderer.js 안 표식)을 바꾼 뒤 웹소켓을 끊는다(판 재시작 뒤 다시 붙기와 같은 길). 끝나면 되돌린다.
// 실행: sh backend/.dev/clean-env.sh node app/test/e2e/p282-phone.mjs <setup|phone|stop> [round]
// 결과는 워크트리의 experiments/p282/<round>/(저장소 밖).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const WHAT = process.argv[2] || 'setup';
const TAG = process.argv[3] || 'round-1';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const DEV = path.join(REPO, 'backend', '.dev');
const OUT = path.join(REPO, 'experiments', 'p282', TAG);
const CONVOS = 'C:\\Workspace\\mtask-p282-projects';
const F = 'C:\\Workspace\\mtask-p282-a';
const BOARD = 'atrium-dev-p282', PORT = '48032', SIM = 9513;
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_|HC_|MT_HERDR)/.test(k)) delete process.env[k];
for (const k of Object.keys(process.env)) if (/^(CLAUDECODE|CLAUDE_CODE_|CLAUDE_EFFORT|CLAUDE_PID|CLAUDE_AGENT_SDK|ELECTRON_RUN_AS_NODE)/.test(k)) delete process.env[k];
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
const L = await import('./p59-lib.mjs');
const { NAME, LOGIN, LAPTOP_A } = L;
const ENV = {
  ATRIUM_TERMINAL_SESSION: BOARD, ATRIUM_HERDR_SESSION: BOARD, ATRIUM_PORT: PORT,
  ATRIUM_DATA_DIR: path.join(DEV, 'data'), ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  ATRIUM_CLAUDE_PROJECTS: CONVOS, ATRIUM_CLAUDE_DESKTOP: 'none', ATRIUM_TEST_PREFIX: 'p282-none-',
  ATRIUM_TAILSCALE: path.join(REPO, 'app', 'test', 'e2e', 'p49-fake-tailscale.mjs'), P49_FAKE_TS_PORT: PORT,
  ATRIUM_WEB_HOSTS: `${NAME}:${SIM},localhost:${SIM}`,
};
Object.assign(process.env, ENV);
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(CONVOS, { recursive: true });
const { logger, sleep, until } = await import('./harness.mjs');
const { assertTestBoard } = await import('./p9-guard.mjs');
assertTestBoard(ENV, { root: DEV });

const pwDir = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright');
const chromeExe = (() => { try { return fs.readdirSync(pwDir).filter((x) => /^chromium-\d+$/.test(x)).sort().reverse().map((x) => path.join(pwDir, x, 'chrome-win64', 'chrome.exe')).find((f) => fs.existsSync(f)); } catch { return null; } })();
const log = logger(`p282-${WHAT}-${TAG}`);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 120000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail !== '' ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 1600)}` : ''}`); };
const LIVE = 'atrium-head';

// ---- 흉내 모양(지어낸 이름, P202와 같고 이전 칸에 응답 필요 garam-2·오류 c10-c) ----
const WK = (k) => ({ key: k, root: k.replace(/\/\.git$/, '') });
const SHAPE = {
  folders: [
    { id: 'gz', name: 'zeta lab', members: ['d:/w/zl-web/.git', 'd:/w/zl-api/.git'] },
    { id: 'gr', name: '연구', members: ['d:/w/res-a/.git'] },
    { id: 'ga', name: 'Alpha', members: ['d:/w/alpha-2/.git', 'd:/w/alpha-10/.git', 'd:/w/alpha-1/.git'] },
    { id: 'g10', name: 'course 10', members: ['d:/w/c10/.git'] },
    { id: 'g2', name: 'Course 2', members: ['d:/w/c2/.git'] },
    { id: 'gk', name: '가람', members: ['d:/w/garam/.git'] },
  ],
  workspaces: ['d:/w/zl-web/.git', 'd:/w/zl-api/.git', 'd:/w/res-a/.git', 'd:/w/alpha-2/.git', 'd:/w/alpha-10/.git', 'd:/w/alpha-1/.git', 'd:/w/c10/.git', 'd:/w/c2/.git', 'd:/w/garam/.git', 'd:/w/old-box'].map(WK),
  // [이름, 워크스페이스 번호, 부모, 오늘?, 상태]
  sessions: [
    ['zl-lead', 0, null, 1, 'working'], ['zl-ui', 0, 'zl-lead', 1, 'working'], ['zl-test', 0, 'zl-lead', 0], ['zl-api', 1, null, 0], ['zl-api-2', 1, null, 0],
    ['res-head', 2, null, 1, 'ready'], ['res-read', 2, 'res-head', 0], ['res-notes', 2, 'res-head', 0],
    ['a1-solo', 5, null, 0], ['a2-lead', 3, null, 0], ['a2-kid', 3, 'a2-lead', 0], ['a2-kid2', 3, 'a2-lead', 0], ['a10', 4, null, 0], ['a10-b', 4, null, 0],
    ['c10-lead', 6, null, 0], ['c10-a', 6, 'c10-lead', 0], ['c10-b', 6, 'c10-lead', 0], ['c10-c', 6, 'c10-b', 0, 'error'],
    ['c2-x', 7, null, 0], ['c2-y', 7, null, 0], ['garam-1', 8, null, 0], ['garam-2', 8, 'garam-1', 0, 'waiting'], ['garam-3', 8, 'garam-1', 0], ['garam-4', 8, 'garam-1', 0],
    ['box-1', 9, null, 0], ['zl-helper', 7, 'zl-lead', 0],
  ],
};
const HOOK = ([shape]) => {
  const api = window.__mt.api, st = window.__mt.getState();
  if (!api.__p282orig) { api.__p282orig = api.call.bind(api); window.__p282st = { workspaces: st.workspaces, groups: st.groups }; }
  const now = Date.now(), mid = new Date(now); mid.setHours(0, 0, 0, 0);
  const todayAt = Math.max(mid.getTime() + 1000, now - 60e3), oldAt = now - 3 * 86400e3;
  const nameOf = (root) => root.split('/').filter(Boolean).pop();
  st.workspaces = [...shape.workspaces.map((w, i) => ({ key: w.key, name: nameOf(w.root), kind: 'repo', root: w.root, createdAt: 1e12 + i, counts: {}, worktrees: [] })), ...(window.__p282st.workspaces || [])];
  st.groups = shape.folders.map((f) => ({ id: f.id, name: f.name, members: [...f.members] }));
  const nodes = shape.sessions.map(([name, wi, parent, today, state], i) => ({ id: `s:${name}`, kind: 'session', sessionId: `fk-${name}`, name, agentKind: 'claude', state: state || 'sleeping', category: state === 'working' ? 'working' : 'idle', workspaceKey: shape.workspaces[wi].key,
    parentId: parent ? `s:${parent}` : null, lineageParent: parent ? `s:${parent}` : null, peers: [], createdAt: 1e12 + i, model: 'claude-opus-5-5', effort: 'high', activeAt: today ? todayAt : oldAt, turnAt: state === 'working' ? todayAt : null, lastPrompt: ['Merge the workers', 'Draft the notes', 'Collect the tables', 'Review the parser diff'][i % 4] }));
  const edges = shape.sessions.filter((s) => s[2]).map(([name, , parent]) => ({ from: `s:${parent}`, to: `s:${name}`, kind: 'spawn', count: 2, lastAt: now - 6e5 }));
  api.call = async (m, p) => (m === 'mission.graph' ? { nodes: [{ id: 'human', kind: 'human', name: 'you' }, ...nodes], edges, counts: { all: nodes.length }, at: now } : api.__p282orig(m, p));
};


const shot = (pg, name) => pg.screenshot({ path: path.join(OUT, `${name}.png`) }).then(() => log(`그림 ${name}.png`));
const FAKE = () => { for (const s of window.__mt.getState().sessions.values()) window.__mt.api.emit('session.updated', { ...s, kind: 'claude', hooked: true, state: 'ready' }); };

// ---- 업데이트 흉내: 판이 내보내는 dist ----
const DIST = path.join(REPO, 'app', 'dist');
const RJS = path.join(DIST, 'renderer.js'), BJ = path.join(DIST, 'build.json');
const ORIG = { js: fs.readFileSync(RJS, 'utf8'), build: fs.readFileSync(BJ, 'utf8') };
const MARK0 = JSON.parse(ORIG.build).build;
const restoreDist = () => { fs.writeFileSync(RJS, ORIG.js); fs.writeFileSync(BJ, ORIG.build); };
// code: 새 화면 코드도 내보낸다(표식이 바뀐 renderer.js). false면 build.json만(다시 불러와도 옛 코드가 오는 경우)
function fakeUpdate(mark, { code = true } = {}) {
  if (code) fs.writeFileSync(RJS, ORIG.js.split(MARK0).join(mark) + `\n// p282 fake update ${mark}\n`);
  fs.writeFileSync(BJ, JSON.stringify({ build: mark }) + '\n');
}

// iOS 홈 화면 앱 흉내(P83과 같은 길): standalone, visualViewport 바꾸기. window.__kb(px, shrinkInner)로 키보드(iOS 홈 화면 앱은 창 높이도 함께 준다)
const FAKE_IOS_APP = () => {
  try { const n = Number(sessionStorage.getItem('p282.loads') || 0) + 1; sessionStorage.setItem('p282.loads', String(n)); } catch {}
  try { Object.defineProperty(navigator, 'standalone', { configurable: true, get: () => true }); } catch {}
  const real = window.visualViewport;
  const realInner = Object.getOwnPropertyDescriptor(window, 'innerHeight') || Object.getOwnPropertyDescriptor(Window.prototype, 'innerHeight');
  const baseH = () => (realInner && realInner.get ? realInner.get.call(window) : 800);
  const ev = new EventTarget();
  let kb = 0, shrink = false;
  const vv = ev;
  Object.defineProperties(vv, {
    height: { get: () => baseH() - kb }, width: { get: () => window.innerWidth },
    offsetTop: { get: () => 0 }, offsetLeft: { get: () => 0 }, pageTop: { get: () => 0 }, pageLeft: { get: () => 0 },
    scale: { get: () => (real ? real.scale : 1) },
  });
  Object.defineProperty(window, 'visualViewport', { configurable: true, get: () => vv });
  Object.defineProperty(window, 'innerHeight', { configurable: true, get: () => baseH() - (shrink ? kb : 0) });
  window.__kb = (px, shrinkInner = true) => { kb = px; shrink = !!shrinkInner; ev.dispatchEvent(new Event('resize')); window.dispatchEvent(new Event('resize')); };
};
const loads = (pg) => pg.evaluate(() => Number(sessionStorage.getItem('p282.loads') || 0));
const loadedOpen = (pg, ms = 60000) => pg.waitForFunction(() => window.__mt && window.__mt.getState().boardLoaded && window.__mt.api.conn.phase === 'open', null, { timeout: ms })
  .then(() => pg.waitForFunction(() => !document.querySelector('[data-role=splash]'), null, { timeout: 15000 }).catch(() => {}));
async function pair(pg) {
  await pg.goto(`http://localhost:${SIM}/`);
  await pg.waitForSelector('[data-role=pair]', { timeout: 30000 });
  await pg.fill('[data-field=pair-code]', call('device.code').code);
  await pg.click('[data-action=pair-submit]');
  await loadedOpen(pg);
  await sleep(1200);
}
const drop = (pg) => pg.evaluate(() => { const ws = window.__mt.api.ws; if (ws) ws.close(); });
const KB = () => {
  const inp = document.querySelector('[data-role=phone-input]'), ph = document.querySelector('[data-role=phone]');
  const r = inp.getBoundingClientRect(), cs = getComputedStyle(inp);
  return { open: document.documentElement.classList.contains('mt-kb-open'), padB: parseFloat(cs.paddingBottom), inputBottom: Math.round(r.bottom), vvH: Math.round(window.visualViewport.height), innerH: window.innerHeight, phoneH: Math.round(ph.getBoundingClientRect().height) };
};
const TOP = () => {
  const f = document.querySelector('.mt-ph-topfill'), h = document.querySelector('.mt-ph-head, .mt-ph-shead');
  const fr = f ? f.getBoundingClientRect() : null, hr = h ? h.getBoundingClientRect() : null;
  return { fill: fr && { top: fr.top, h: fr.height, bg: getComputedStyle(f).backgroundColor, z: getComputedStyle(f).zIndex }, head: hr && { top: hr.top, h: hr.height, bg: getComputedStyle(h).backgroundColor, padTop: parseFloat(getComputedStyle(h).paddingTop) }, theme: document.querySelector('meta[name=theme-color]').content };
};
const PH = () => { const ta = document.querySelector('[data-field=phone-text]'); return ta ? ta.placeholder : null; };

async function setupBoard() {
  log(atrium('backend', 'start').trim().slice(0, 300));
  await sleep(1500);
  for (const s of call('session.list')) { try { atrium('kill', s.sessionId, '--yes', '--delete'); } catch (e) { log('옛 세션 끄기 실패', e.message.slice(0, 120)); } }
  fs.mkdirSync(F, { recursive: true }); fs.writeFileSync(path.join(F, 'README.md'), '# mtask-p282-a\n');
  call('workspace.open', { path: F, select: true });
  const r = call('session.spawn', { cwd: F, kind: 'shell', name: LIVE }); log('띄움', r.sessionId);
  await until(() => call('session.list').some((x) => x.name === LIVE && /shell_/.test(x.state)), 60000, 1500).catch(() => log('셸 준비 기다림 넘김'));
  check('장면: 셸 하나', call('session.list').length === 1);
}

const T = { ko: { msg: '메시지', steer: '지금 일에 넣기', today: '오늘', earlier: '이전', draft: '아직 보내지 않은 글\n둘째 줄' }, en: { msg: 'Message', steer: 'Into this turn', today: 'Today', earlier: 'Earlier', draft: 'not sent yet\nsecond line' } };

async function webkitRound(pw, lang, w, h, sid) {
  const tag = `${lang}-${w}`;
  restoreDist();
  call('settings.set', { key: 'language', value: lang });
  const b = await pw.webkit.launch({ headless: true });
  try {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, screen: { width: w, height: h }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: lang === 'ko' ? 'ko-KR' : 'en-US', reducedMotion: 'reduce' });
    await ctx.addInitScript(FAKE_IOS_APP);
    const pg = await ctx.newPage();
    globalThis.__p282pg = pg;
    const errs = [];
    pg.on('pageerror', (e) => { errs.push(e.message); log(`[${tag} pageerror] ${e.message}`); });
    await pair(pg);
    const base = await loads(pg);
    check(`[${tag}] 화면 코드 표식 = 판 표식(처음)`, await pg.evaluate(() => window.__mtShell.mine) === MARK0, MARK0);
    // 맵 시점을 옮겨 둔다
    await pg.waitForSelector('.mt-pmap .mt-ta-card', { timeout: 20000 }); await sleep(800);
    await pg.evaluate(() => { const v = window.__mtPm.view(); window.__mtPm.set({ x: v.x + 37, y: v.y + 53, k: v.k * 0.9 }); });
    await sleep(100); // 저장 모으기 시간보다 짧게: 다시 불러오기 전 저장(mt-before-reload)이 남겨야 한다
    const v0 = await pg.evaluate(() => window.__mtPm.view());
    // 세션을 열고 글을 쓰는 중(초점 있음)
    await pg.evaluate(FAKE); await pg.evaluate((id) => window.__mtPhone.open(id), sid);
    await pg.waitForSelector('[data-field=phone-text]', { timeout: 20000 }); await sleep(600);
    await pg.fill('[data-field=phone-text]', T[lang].draft);
    await pg.focus('[data-field=phone-text]');
    // 판 업데이트 흉내(새 코드) → 다시 붙음
    const MB = (lang === 'ko' ? 'b' : 'd') + String(w).padStart(3, '0') + 'b'.repeat(12);
    fakeUpdate(MB);
    await drop(pg);
    await sleep(3500);
    const s1 = await pg.evaluate(() => window.__mtShell.state());
    check(`[${tag}] 쓰는 중이면 다시 불러오지 않고 기다린다`, (await loads(pg)) === base && s1.pending === MB, { loads: await loads(pg), base, s1 });
    // 초점이 빠지면 곧바로 다시 불러온다
    await pg.evaluate(() => document.activeElement && document.activeElement.blur());
    await until(async () => (await loads(pg).catch(() => 0)) === base + 1, 20000, 300);
    await loadedOpen(pg); await sleep(1500);
    const after = await pg.evaluate(() => ({ mine: window.__mtShell.mine, st: window.__mtShell.state(), view: document.querySelector('[data-role=phone]').dataset.view, session: (document.querySelector('[data-role=phone-session]') || {}).dataset?.session, text: (document.querySelector('[data-field=phone-text]') || {}).value }));
    check(`[${tag}] 다시 불러온 뒤 새 화면 코드(표식 = 판 표식), 한 번`, after.mine === MB && after.st.tried === MB && (await loads(pg)) === base + 1, after);
    check(`[${tag}] 보던 세션 화면이 이어진다`, after.view === 'session' && after.session === sid, after);
    check(`[${tag}] 보내지 않은 글이 같은 세션 입력 칸에 되살아난다`, after.text === T[lang].draft, after.text);
    await pg.evaluate(FAKE); await sleep(300);
    await shot(pg, `1-after-update-${tag}`);
    // P280: 입력 안내(빈 칸)
    await pg.fill('[data-field=phone-text]', ''); await pg.evaluate(() => document.activeElement && document.activeElement.blur()); await sleep(300);
    const ph1 = await pg.evaluate(PH);
    await pg.click('[data-action=phone-steer]'); await sleep(300);
    const ph2 = await pg.evaluate(PH);
    await pg.click('[data-action=phone-steer]'); await sleep(200);
    check(`[${tag}] P280 입력 안내 글 그대로(${T[lang].msg} / ${T[lang].steer})`, ph1 === T[lang].msg && ph2 === T[lang].steer, { ph1, ph2 });
    // 같은 표식이면 다시 붙어도 다시 불러오지 않는다
    await drop(pg); await loadedOpen(pg); await sleep(2500);
    check(`[${tag}] 같은 표식이면 다시 붙어도 그대로`, (await loads(pg)) === base + 1, await loads(pg));
    // 맵 시점
    await pg.click('[data-action=phone-back]'); await sleep(900);
    const v1 = await pg.evaluate(() => window.__mtPm && window.__mtPm.view());
    check(`[${tag}] 맵 시점이 다시 불러온 뒤에도 이어진다`, v1 && Math.abs(v1.x - v0.x) < 1 && Math.abs(v1.y - v0.y) < 1 && Math.abs(v1.k - v0.k) < 1e-3, { v0, v1 });
    // P280: 맵 두 열(탭 없음)
    await pg.evaluate(HOOK, [SHAPE]); await pg.evaluate(() => { try { localStorage.removeItem('atrium.phoneMap.view'); } catch {} window.__mtPhone.mission(); });
    await pg.waitForSelector('.mt-pmap .mt-ta-card', { timeout: 20000 }); await sleep(1300);
    const m = await pg.evaluate(() => ({ ncol: window.__mtPm.lay().ncol, tabs: document.querySelectorAll('[data-role=pm-tab], .mt-pmap-tabs').length, secs: [...document.querySelectorAll('.mt-pmap [data-role=ln-section]')].map((e) => e.innerText.trim()) }));
    check(`[${tag}] P280 맵 두 열(${T[lang].today} | ${T[lang].earlier}), 탭 없음`, m.ncol === 2 && m.tabs === 0 && m.secs.includes(T[lang].today) && m.secs.includes(T[lang].earlier), m);
    await shot(pg, `1-after-update-map-${tag}`);
    // 새 표식인데 다시 불러와도 옛 코드가 오면(build.json만 바뀜): 한 번만 하고 그만
    const MC = 'c'.repeat(4) + String(w).padStart(4, '0') + (lang === 'ko' ? 'c' : 'e').repeat(8);
    fakeUpdate(MC, { code: false });
    const n0 = await loads(pg);
    await drop(pg);
    await until(async () => (await loads(pg).catch(() => 0)) === n0 + 1, 20000, 300).catch(() => {});
    await loadedOpen(pg).catch(() => {}); await sleep(5000);
    const st2 = await pg.evaluate(() => ({ mine: window.__mtShell.mine, st: window.__mtShell.state() }));
    check(`[${tag}] 다시 불러와도 옛 코드면 한 번만(되풀이 없음)`, (await loads(pg)) === n0 + 1 && st2.mine === MB && st2.st.tried === MC && !st2.st.pending, { loads: await loads(pg), n0, st2 });
    // 키보드: iOS 홈 화면 앱처럼 창 높이도 함께 준다
    restoreDist();
    await pg.evaluate(FAKE); await pg.evaluate((id) => window.__mtPhone.open(id), sid);
    await pg.waitForSelector('[data-field=phone-text]', { timeout: 20000 }); await sleep(500);
    await pg.focus('[data-field=phone-text]');
    const kh = Math.round(h * 0.42);
    await pg.evaluate((px) => window.__kb(px, true), kh); await sleep(500);
    const k1 = await pg.evaluate(KB);
    check(`[${tag}] 키보드 열림(창 높이도 줄어듦): 입력 줄 아래 여백 8px, 입력 줄이 보이는 높이 끝에 붙는다`, k1.open && k1.padB === 8 && Math.abs(k1.inputBottom - k1.vvH) <= 1 && k1.innerH === k1.vvH, k1);
    await shot(pg, `2-keyboard-${tag}`);
    await pg.evaluate(() => window.__kb(0, false)); await sleep(400);
    const k0 = await pg.evaluate(KB);
    check(`[${tag}] 키보드 닫힘: mt-kb-open 없음(홈 막대 여백 자리)`, !k0.open, k0);
    const top = await pg.evaluate(TOP);
    check(`[${tag}] 위쪽: 상태 줄 채움은 머리줄과 같은 색, theme-color도 같은 색`, top.fill && top.head && top.fill.bg === top.head.bg && top.theme.toLowerCase() === '#151510', top);
    await shot(pg, `3-top-${tag}`);
    check(`[${tag}] 페이지 오류 없음`, errs.length === 0, errs);
    await ctx.close();
  } finally { await b.close(); restoreDist(); }
}

// Chromium: 안전 영역(위 59, 아래 34)을 줄 수 있다(WebKit은 못 준다). 키보드 빈칸과 상태 줄 자리 채움을 그림으로 본다
async function chromiumRound(pw, lang, sid) {
  const tag = `chromium-${lang}-390`;
  call('settings.set', { key: 'language', value: lang });
  const b = await pw.chromium.launch({ headless: true, ...(chromeExe ? { executablePath: chromeExe } : {}) });
  try {
    const SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, screen: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: SAFARI, locale: lang === 'ko' ? 'ko-KR' : 'en-US', reducedMotion: 'reduce' });
    await ctx.addInitScript(FAKE_IOS_APP);
    const pg = await ctx.newPage();
    globalThis.__p282pg = pg;
    const cdp = await ctx.newCDPSession(pg);
    let safe = 'none';
    try { await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 59, bottom: 34, left: 0, right: 0 } }); safe = 'top 59, bottom 34'; } catch (e) { safe = `없음(${e.message.split('\n')[0].slice(0, 80)})`; }
    log(`[${tag}] 안전 영역 흉내: ${safe}`);
    await pair(pg);
    await pg.waitForSelector('.mt-pmap .mt-ta-card', { timeout: 20000 }).catch(() => {}); await sleep(600);
    const top = await pg.evaluate(TOP);
    check(`[${tag}] 상태 줄 자리 채움 높이 = 위 안전 영역, 머리줄 색`, safe === 'none' || (top.fill.h === 59 && top.fill.bg === top.head.bg), top);
    await shot(pg, `3-top-map-${tag}`);
    await pg.evaluate(FAKE); await pg.evaluate((id) => window.__mtPhone.open(id), sid);
    await pg.waitForSelector('[data-field=phone-text]', { timeout: 20000 }); await sleep(600); await pg.evaluate(FAKE); await sleep(300);
    const k0 = await pg.evaluate(KB);
    await shot(pg, `3-top-session-${tag}`);
    await pg.focus('[data-field=phone-text]');
    await pg.evaluate(() => window.__kb(336, true)); await sleep(500);
    const k1 = await pg.evaluate(KB);
    check(`[${tag}] 키보드 닫힘: 아래 여백 = 홈 막대(34)+8, 열림(창 높이도 줄어듦): 8, 입력 줄이 보이는 높이 끝`, (safe === 'none' || k0.padB === 42) && !k0.open && k1.open && k1.padB === 8 && Math.abs(k1.inputBottom - k1.vvH) <= 1, { k0, k1 });
    await shot(pg, `2-keyboard-${tag}`);
    await ctx.close();
  } finally { await b.close(); }
}

async function phone() {
  const pw = await import('playwright');
  const toUrl = (p) => 'file:///' + p.replace(/\\/g, '/');
  const { startTsSim } = await import(toUrl(path.join(REPO, 'backend', 'tools', 'ts-sim-proxy.mjs')));
  const sim = startTsSim({ listen: SIM, target: Number(PORT), name: NAME, login: LOGIN, keepOrigin: true }); sim.cfg.ip = LAPTOP_A;
  await sim.ready;
  const sid = call('session.list').find((x) => x.name === LIVE).sessionId;
  try {
    for (const lang of ['ko', 'en']) for (const [w, h] of [[390, 844], [320, 640]]) await webkitRound(pw, lang, w, h, sid);
    for (const lang of ['ko', 'en']) await chromiumRound(pw, lang, sid);
  } finally { restoreDist(); sim.close && sim.close(); }
}

async function stopBoard() {
  try { for (const s of call('session.list')) atrium('kill', s.sessionId, '--yes', '--delete'); } catch (e) { log(`kill ${e.message.slice(0, 120)}`); }
  try { log(atrium('terminal', 'stop', '--yes').slice(0, 200)); } catch (e) { log(`terminal stop ${e.message.slice(0, 120)}`); }
  try { log(atrium('backend', 'stop').slice(0, 200)); } catch (e) { log(`backend stop ${e.message.slice(0, 120)}`); }
}

try {
  if (WHAT === 'setup') await setupBoard();
  else if (WHAT === 'phone') await phone();
  else if (WHAT === 'stop') await stopBoard();
} catch (e) {
  if (globalThis.__p282pg) await globalThis.__p282pg.screenshot({ path: path.join(OUT, 'error.png') }).catch(() => {});
  check('시험이 끝까지 돌았다', false, e.stack || e.message);
} finally {
  restoreDist();
  fs.writeFileSync(path.join(OUT, `p282-${WHAT}.json`), JSON.stringify({ results }, null, 2));
  const bad = results.filter((r) => !r.ok);
  log(`결과 ${results.length - bad.length}/${results.length} 통과${bad.length ? ` 실패: ${bad.map((b) => b.name).join(', ')}` : ''}`);
  process.exit(bad.length ? 1 : 0);
}
