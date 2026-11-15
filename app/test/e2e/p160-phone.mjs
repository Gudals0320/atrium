// P160 창 시험: 휴대폰 세션 맵(PhoneLineage.jsx, 폴더 > 워크스페이스 > 단계 들여쓰기). P153 휴대폰 단계(타일 지도)를 갈음한다.
// 판: 따로 띄운 개발용 판(atrium-dev-p160, 47929, backend/.dev)만 쓴다. 휴대폰 흉내 프록시 47995. 한 번에 한 브라우저만(메모리).
//   셸 세션 하나(p160-a, 시험 폴더 C:\Workspace\mtask-p160-a)만 실제로 띄운다. 맵은 페이지 안에서 mission.graph 답과 판의 워크스페이스·폴더를 흉내로 바꾼다(P153과 같은 흉내).
//   흉내 모양: 아래 SHAPE_FAKE(지어낸 이름, 시안 B-phone과 같은 짜임 + 동료·독립·깊은 사슬·다른 워크스페이스). P160_SHAPE=<json>이면 그 모양(git 밖 실제 판 모양 흉내).
// 실행: sh backend/.dev/clean-env.sh node app/test/e2e/p160-phone.mjs <setup|phone|mock|stop> [폴더 이름]
//   phone: iPhone(Chromium)·Android(Chromium)·태블릿·iPhone(WebKit 한 번) 그림과 검사. mock: 시안 B-phone을 펴서 찍고 앱 그림과 나란히.
// 결과는 워크트리의 experiments/p160/<폴더>/(저장소 밖).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const WHAT = process.argv[2] || 'setup';
const TAG = process.argv[3] || 'fake';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const MAIN = /[\\/]\.claude[\\/]worktrees[\\/]/.test(REPO) ? path.resolve(REPO, '..', '..', '..') : REPO;
const DEV = path.join(REPO, 'backend', '.dev');
// P163: 다른 워커의 판에서 돌릴 때 P160_BOARD(atrium-dev-<이름>), P160_PORT, P160_SIM(휴대폰 흉내 프록시), P160_DIR(시험 폴더), P160_OUT(experiments 아래 결과 폴더 이름)로 덮는다
const OUTN = process.env.P160_OUT || 'p160';
const OUT = path.join(REPO, 'experiments', OUTN, TAG);
const CONVOS = path.join(REPO, 'experiments', OUTN, 'convos');
const DIR = process.env.P160_DIR || 'C:\\Workspace\\mtask-p160-a';
const BOARD = `atrium-dev-${process.env.P160_BOARD || 'p160'}`, PORT = process.env.P160_PORT || '47929', SIM = Number(process.env.P160_SIM || 47995);
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_|HC_)/.test(k)) delete process.env[k];
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
const L = await import('./p59-lib.mjs');
const { NAME, LOGIN, LAPTOP_A } = L;
const ENV = {
  ATRIUM_TERMINAL_SESSION: BOARD, ATRIUM_HERDR_SESSION: BOARD, ATRIUM_PORT: PORT,
  ATRIUM_DATA_DIR: path.join(DEV, 'data'), ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  ATRIUM_CLAUDE_PROJECTS: CONVOS, ATRIUM_CLAUDE_DESKTOP: 'none', ATRIUM_TEST_PREFIX: 'p160-none-',
  ATRIUM_TAILSCALE: path.join(REPO, 'app', 'test', 'e2e', 'p49-fake-tailscale.mjs'), P49_FAKE_TS_PORT: PORT,
  ATRIUM_WEB_HOSTS: `${NAME}:${SIM},localhost:${SIM}`,
};
Object.assign(process.env, ENV);
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(CONVOS, { recursive: true });
const { logger, sleep } = await import('./harness.mjs');
const { assertTestBoard } = await import('./p9-guard.mjs');
assertTestBoard(ENV, { root: DEV });

const pwDir = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright');
const chromeExe = (() => { try { return fs.readdirSync(pwDir).filter((x) => /^chromium-\d+$/.test(x)).sort().reverse().map((x) => path.join(pwDir, x, 'chrome-win64', 'chrome.exe')).find((f) => fs.existsSync(f)); } catch { return null; } })();
const chromiumOpts = () => ({ headless: true, ...(chromeExe ? { executablePath: chromeExe } : {}) });
const log = logger(`p160-${WHAT}-${TAG}`);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 120000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 1600)}` : ''}`); };

// ---- 흉내 모양(지어낸 이름): 시안 B-phone 짜임(Product·Research·Personal 폴더 + 폴더 밖) + 동료·독립·깊은 사슬·다른 워크스페이스·셸 ----
const ws = (key, kind = 'repo') => ({ key, kind, root: key.replace(/\/\.git$/, '') });
const ss = (name, workspace, o = {}) => ({ name, workspace, parent: null, kind: 'claude', asleep: false, term: 'idle', model: 'claude-opus-5-5', effort: 'high', ...o });
const ln = (src, dst, o = {}) => ({ src, dst, role: null, spawned: true, observed: true, count: 3, ...o });
const APP = 'c:/work/atrium-app/.git', DOCS = 'c:/work/atrium-docs/.git', MKT = 'd:/lab/market-lab/.git', PAPER = 'd:/lab/paper-notes/.git', PIPE = 'd:/lab/data-pipe/.git', DOT = 'c:/home/dotfiles/.git', BLOG = 'c:/home/blog/.git', BOX = 'c:/tmp/sandbox';
const SHAPE_FAKE = {
  folders: [{ id: 'g1', name: 'Product', members: [APP, DOCS] }, { id: 'g2', name: 'Research', members: [MKT, PAPER, PIPE] }, { id: 'g3', name: 'Personal', members: [DOT, BLOG] }],
  workspaces: [ws(APP), ws(DOCS), ws(MKT), ws(PAPER), ws(PIPE), ws(DOT), ws(BLOG), ws(BOX, 'folder')],
  sessions: [
    ss('conductor', APP, { st: 'working', task: 'Merge worker branches and run the release check', ago: 36e5 }),
    ss('parser', APP, { parent: 'conductor', st: 'working', task: 'Port the parser to the new API', branch: 'wt/parser', ago: 13e5 }),
    ss('fixtures', APP, { parent: 'parser', st: 'done', model: 'claude-haiku-5-5', effort: null, task: 'Generate parser fixtures', branch: 'wt/fixtures', ago: 9e5 }),
    ss('tests', APP, { parent: 'conductor', st: 'needs', model: 'claude-sonnet-5-5', task: 'Allow npm install in the worktree?', branch: 'wt/tests', ago: 5e5 }),
    ss('reviewer', APP, { st: 'working', kind: 'codex', model: 'gpt-6', effort: 'medium', task: 'Review the release diff', ago: 4e5 }),
    ss('reviewer-2', APP, { st: 'ready', kind: 'codex', model: 'gpt-6', effort: 'medium', task: 'Second look at the migration notes', ago: 6e5 }),
    ss('spinoff', APP, { parent: 'conductor', indep: true, st: 'ready', task: 'Prototype the export dialog', ago: 7e6 }),
    ss('hotfix', APP, { st: 'ready', task: 'Patch the crash on resume', ago: 72e5 }),
    ss('old-spike', APP, { st: 'exited', model: 'claude-sonnet-5-5', task: 'Try a canvas renderer', ago: 2.6e8 }),
    ss('docs-sync', DOCS, { parent: 'conductor', st: 'working', model: 'claude-sonnet-5-5', task: 'Update the API reference pages', ago: 7e5 }),
    ss('copyedit', DOCS, { st: 'sleeping', model: 'claude-haiku-5-5', effort: null, task: 'Tidy the glossary', ago: 8.6e7 }),
    ss('analyst', MKT, { st: 'needs', task: 'Which quarter should the report cover?', ago: 24e5 }),
    ss('scraper', MKT, { parent: 'analyst', st: 'error', kind: 'codex', model: 'gpt-6', effort: 'medium', task: 'Fetch the pricing pages', err: 'Rate limited (HTTP 429). Retry after 60 seconds.', ago: 11e5 }),
    ss('charts', MKT, { parent: 'analyst', st: 'working', model: 'claude-sonnet-5-5', task: 'Draw the share-of-market charts', ago: 5e5 }),
    ss('summary', MKT, { parent: 'analyst', st: 'done', model: 'claude-sonnet-5-5', task: 'Write the executive summary', ago: 19e5 }),
    ss('d1', MKT, { parent: 'charts', st: 'ready', task: 'Split the chart data by region', ago: 3e6 }),
    ss('d2', MKT, { parent: 'd1', st: 'ready', task: 'Clean the region table', ago: 3e6 }),
    ss('d3', MKT, { parent: 'd2', st: 'sleeping', task: 'Normalize the currency column', ago: 9e6 }),
    ss('d4', MKT, { parent: 'd3', st: 'sleeping', task: 'Check the rounding', ago: 9e6 }),
    ss('d5', MKT, { parent: 'd4', st: 'sleeping', task: 'Write the rounding test', ago: 9e6 }),
    ss('reader', PAPER, { st: 'ready', task: 'Summarize three papers on caching', ago: 1.1e7 }),
    ss('cite', PAPER, { st: 'sleeping', model: 'claude-haiku-5-5', effort: null, task: 'Fix the citation format', ago: 1.7e8 }),
    ss('pipe-lead', PIPE, { st: 'ready', task: 'Split the backfill into batches', ago: 36e5 }),
    ss('backfill', PIPE, { parent: 'pipe-lead', st: 'ready', kind: 'codex', model: 'gpt-6', effort: 'medium', task: 'Write tests for the sync module', branch: 'wt/backfill', ago: 15e5 }),
    ss('etl-shell', PIPE, { parent: 'pipe-lead', st: 'working', kind: 'shell', model: null, effort: null, task: 'npm run backfill -- --day 14', ago: 24e4 }),
    ss('nvim', DOT, { st: 'sleeping', model: 'claude-sonnet-5-5', task: 'Move plugins to lazy loading', ago: 2.6e8 }),
    ss('draft', BLOG, { st: 'ready', model: 'claude-sonnet-5-5', task: 'Outline the November post', ago: 14e6 }),
    ss('scratch', BOX, { st: 'ready', kind: 'shell', model: null, effort: null, task: 'git log --oneline', ago: 36e5 }),
    ss('try-pi', BOX, { st: 'sleeping', model: 'claude-haiku-5-5', effort: null, task: 'Compare tool call formats', ago: 1.7e8 }),
  ],
  links: [],
  peers: [['reviewer', 'reviewer-2'], ['parser', 'tests']],
};
for (const s of SHAPE_FAKE.sessions) if (s.parent) SHAPE_FAKE.links.push(ln(s.parent, s.name, { role: s.name === 'summary' ? 'writer' : null, spawned: s.name !== 'charts', observed: s.name === 'charts' }));
SHAPE_FAKE.links.push(ln('conductor', 'reviewer', { role: 'reviewer', spawned: false }));
// reviewer는 conductor의 동료(reviewer-2)와 같은 칸이 되게 역할 연결을 지운다(동료 쌍은 relation 선)
SHAPE_FAKE.links = SHAPE_FAKE.links.filter((l) => !(l.src === 'conductor' && l.dst === 'reviewer'));
const SHAPE_FILE = process.env.P160_SHAPE || '';
const SHAPE = SHAPE_FILE ? JSON.parse(fs.readFileSync(SHAPE_FILE, 'utf8')) : SHAPE_FAKE;
const MIX = SHAPE_FILE ? { waiting: [15, 2], error: [11], done: [9] } : { waiting: [], error: [], done: [] };

// ---- 페이지 안 흉내(P153 창 시험과 같다): mission.graph 답과 판의 워크스페이스·폴더(store)를 바꾼다. real: 실제 셸 세션 id(첫 세션 카드에 쓴다) ----
const HOOK = ([shape, mix, real]) => {
  const api = window.__mt.api, st = window.__mt.getState();
  if (!api.__p160orig) { api.__p160orig = api.call.bind(api); window.__p160st = { workspaces: st.workspaces, groups: st.groups }; }
  const now = Date.now();
  const nameOf = (root) => root.split('/').filter(Boolean).pop();
  st.workspaces = shape.workspaces.map((w, i) => ({ key: w.key, name: nameOf(w.root), kind: w.kind, root: w.root, createdAt: 1e12 + i, counts: {}, worktrees: [] }));
  st.groups = shape.folders.map((f) => ({ id: f.id, name: f.name, members: [...f.members] }));
  const asks = ['Allow npm ci in the worktree?', 'Which section should the summary cover?'];
  const nodes = shape.sessions.map((s, i) => {
    let state = s.asleep ? 'sleeping' : s.term === 'working' ? 'working' : 'ready', category = state === 'working' ? 'working' : 'idle', ask = null, error = null;
    if (!s.asleep && s.term === 'done') category = 'done';
    if (mix.waiting.includes(i)) { state = 'waiting'; category = 'needs_you'; ask = asks[mix.waiting.indexOf(i) % 2]; }
    if (mix.error.includes(i)) { state = 'error'; category = 'needs_you'; error = 'API Error: 529 overloaded. The server is busy, retry later.'; }
    if (mix.done.includes(i)) { state = 'ready'; category = 'done'; }
    if (s.st) { [state, category] = { needs: ['waiting', 'needs_you'], error: ['error', 'needs_you'], working: ['working', 'working'], done: ['ready', 'done'], ready: ['ready', 'idle'], sleeping: ['sleeping', 'idle'], exited: ['exited', 'exited'] }[s.st]; ask = s.st === 'needs' ? s.task : null; error = s.err || null; }
    return { id: `s:${s.name}`, kind: 'session', sessionId: i === 0 && real ? real : `fk-${s.name}`, name: s.name, agentKind: s.kind || 'claude', state, category, workspaceKey: s.workspace,
      parentId: s.parent && !s.indep ? `s:${s.parent}` : null, lineageParent: s.parent ? `s:${s.parent}` : null, peers: (shape.peers || []).filter((p) => p.includes(s.name)).map((p) => `s:${p[0] === s.name ? p[1] : p[0]}`), role: null, order: null, createdAt: 1e12 + i, loops: 0, model: s.model, effort: s.effort, activeAt: now - (i + 1) * 9e5, turnAt: state === 'working' ? now - (i + 1) * 2e5 : null,
      closedKids: s.closedKids || 0, assignAt: s.assignAt || null, parentClosed: !!s.parentClosed,
      gitBranch: s.branch || null, ask, error, lastPrompt: s.task || ['Merge the workers and run the release check', 'Draft the slide notes', 'Collect the source tables', 'Review the parser diff'][i % 4], ...(s.ago ? { activeAt: now - s.ago, turnAt: state === 'working' ? now - s.ago : null } : {}) };
  });
  const edges = [];
  for (const l of shape.links) {
    const pairOf = (p) => (p[0] === l.src && p[1] === l.dst) || (p[1] === l.src && p[0] === l.dst);
    const isPeer = (shape.peers || []).some(pairOf);
    const isNone = shape.sessions.some((s) => s.indep && s.parent && pairOf([s.parent, s.name]));
    const relation = isPeer ? 'peer' : isNone ? 'none' : undefined;
    const b = { from: `s:${l.src}`, to: `s:${l.dst}`, count: l.count || 0, lastAt: now - 6e5, ...(relation ? { relation, relationSource: 'user' } : {}) };
    if (l.role) edges.push({ ...b, kind: 'role', label: l.role });
    if (l.observed) edges.push({ ...b, kind: 'prompt', label: 'report back when done' });
    if (l.spawned) edges.push({ ...b, kind: 'spawn' });
  }
  for (const p of shape.peers || []) if (!shape.links.some((l) => (l.src === p[0] && l.dst === p[1]) || (l.src === p[1] && l.dst === p[0]))) edges.push({ from: `s:${p[0]}`, to: `s:${p[1]}`, kind: 'relation', relation: 'peer', relationSource: 'user', count: 0 });
  api.call = async (m, p) => {
    if (m !== 'mission.graph') return api.__p160orig(m, p);
    return { nodes: [{ id: 'human', kind: 'human', name: 'you' }, ...nodes], edges, counts: { all: nodes.length }, at: now };
  };
};

// ---- 맵 읽기 ----
const PROBE = () => {
  const root = document.querySelector('[data-role=phone-mission]'), sc = document.querySelector('.mt-pl-scroll');
  if (!root || !sc) return null;
  const R = (e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; };
  const cards = [...root.querySelectorAll('[data-role=pl-card]')];
  return {
    style: root.dataset.style, sc: R(sc), scrollTop: sc.scrollTop, scrollH: sc.scrollHeight,
    folders: [...root.querySelectorAll('[data-role=pl-fhead]')].map((x) => ({ name: x.querySelector('.fn').textContent, ...R(x) })),
    ws: [...root.querySelectorAll('[data-role=pl-whead]')].map((x) => ({ name: x.innerText.split('\n')[0], ...R(x) })),
    cards: cards.map((c) => ({ id: c.dataset.id, name: c.dataset.name, depth: Number(c.dataset.depth), kind: c.dataset.kind, ...R(c) })),
    cut: cards.filter((c) => { const n = c.querySelector('.nm'); return n.scrollWidth > n.clientWidth + 1; }).map((c) => c.dataset.name),
    over: cards.filter((c) => { const b = c.getBoundingClientRect(); return [...c.children].filter((x) => !x.classList.contains('mt-mm-light') && !x.classList.contains('mt-mm-donetag')).some((x) => { const r = x.getBoundingClientRect(); return r.right > b.right + 1 || r.bottom > b.bottom + 1; }); }).map((c) => c.dataset.name),
    rails: root.querySelectorAll('[data-role=pl-rail]').length, peers: root.querySelectorAll('[data-role=pl-peer]').length, lights: root.querySelectorAll('[data-role=pl-light]').length,
    done: root.querySelectorAll('[data-role=pl-done]').length, from: [...root.querySelectorAll('[data-role=pl-from]')].map((x) => x.textContent), folds: root.querySelectorAll('[data-action=pl-fold]').length,
    pills: [...root.querySelectorAll('.mt-pl-pill')].map((x) => x.innerText.replace(/\s+/g, ' ')),
    sheet: !!root.querySelector('.mt-pt-sheet'), scrollX: document.documentElement.scrollWidth > innerWidth + 1,
  };
};
const shot = (pg, name) => pg.screenshot({ path: path.join(OUT, `${name}.png`) }).catch((e) => log(`스크린숏 실패 ${name} ${e.message.slice(0, 80)}`));
const realId = (pg) => pg.evaluate(() => ([...window.__mt.getState().sessions.values()].find((s) => s.name === 'p160-a') || {}).sessionId || null);

async function setupBoard() {
  fs.mkdirSync(DIR, { recursive: true });
  log(atrium('backend', 'start').trim().slice(0, 300));
  const have = new Set(call('session.list').map((s) => s.name));
  if (!have.has('p160-a')) log(atrium('--json', 'spawn', DIR, '--kind', 'shell', '--name', 'p160-a').slice(0, 160));
  await sleep(2000);
}

const SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const CHROME_A = 'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';
const IPAD = 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const DEVICES = {
  iphone: { viewport: { width: 393, height: 852 }, screen: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: SAFARI },
  android: { viewport: { width: 412, height: 915 }, screen: { width: 412, height: 915 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true, userAgent: CHROME_A },
  landscape: { viewport: { width: 852, height: 393 }, screen: { width: 852, height: 393 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: SAFARI },
  tablet: { viewport: { width: 820, height: 1180 }, screen: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: IPAD },
  mockw: { viewport: { width: 390, height: 844 }, screen: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: SAFARI },
};

async function openPhone(browser, dev, { reduce = false, locale = 'en-US' } = {}) {
  const ctx = await browser.newContext({ ...DEVICES[dev], locale, reducedMotion: reduce ? 'reduce' : 'no-preference' });
  const pg = await ctx.newPage();
  pg.on('pageerror', (e) => log(`[${dev} pageerror] ${e.message}`));
  await pg.goto(`http://localhost:${SIM}/`);
  await pg.waitForSelector('[data-role=pair]', { timeout: 30000 });
  await pg.fill('[data-field=pair-code]', call('device.code').code);
  await pg.click('[data-action=pair-submit]');
  await pg.waitForFunction(() => window.__mt && window.__mt.getState().boardLoaded && window.__mt.api.conn.phase === 'open', null, { timeout: 60000 });
  await sleep(1200);
  const real = await realId(pg);
  await pg.evaluate(HOOK, [JSON.parse(JSON.stringify(SHAPE)), MIX, real]);
  await pg.evaluate(() => { try { localStorage.removeItem('atrium.phoneMap.expanded'); } catch {} window.__mtPhone.mission(); });
  await pg.waitForSelector('[data-role=pl-card]', { timeout: 20000 });
  await sleep(1200);
  return { ctx, pg, real };
}

async function phone() {
  const pw = await import('playwright');
  const toUrl = (p) => 'file:///' + p.replace(/\\/g, '/');
  const { startTsSim } = await import(toUrl(path.join(REPO, 'backend', 'tools', 'ts-sim-proxy.mjs')));
  const sim = startTsSim({ listen: SIM, target: Number(PORT), name: NAME, login: LOGIN, keepOrigin: true }); sim.cfg.ip = LAPTOP_A;
  await sim.ready;
  const nSess = SHAPE.sessions.length;
  try {
    const browser = await pw.chromium.launch(chromiumOpts());
    try {
      for (const dev of ['iphone', 'android', 'landscape']) {
        const { ctx, pg } = await openPhone(browser, dev);
        const p = await pg.evaluate(PROBE);
        await shot(pg, `${dev}-open`);
        const loose = SHAPE.workspaces.some((w) => !SHAPE.folders.some((g) => g.members.includes(w.key)));
        check(`[${dev}] 목록: 폴더 머리 ${SHAPE.folders.length}${loose ? '+1' : ''}, 워크스페이스 머리 ${SHAPE.workspaces.length}, 카드 수(접힌 것 빼고), 시트 없음, 가로 넘침 없음`, p.style === 'lineage' && p.folders.length === SHAPE.folders.length + (loose ? 1 : 0) && p.ws.length === SHAPE.workspaces.length && p.cards.length <= nSess && p.cards.length >= nSess - 6 && !p.sheet && !p.scrollX, { folders: p.folders.map((x) => x.name), ws: p.ws.length, cards: p.cards.length, n: nSess, sheet: p.sheet, scrollX: p.scrollX });
        check(`[${dev}] 카드: 이름 잘림 없음, 내용이 카드 밖으로 넘치지 않음`, !p.cut.length && !p.over.length, { cut: p.cut, over: p.over });
        check(`[${dev}] 관계: 레일 ≥ 1, 작업 중 빛 ≥ 1, 단계 들여쓰기(깊이 ≥ 2 카드가 더 오른쪽)`, p.rails >= 1 && p.lights >= 1 && p.cards.some((c) => c.depth >= 2) && p.cards.filter((c) => c.depth >= 2).every((c) => c.x > Math.min(...p.cards.filter((d) => d.depth === 0).map((d) => d.x))), { rails: p.rails, lights: p.lights });
        if (!SHAPE_FILE) check(`[${dev}] 흉내 모양: 동료 괄호 2, 작업 완료 꼬리표 2, 다른 워크스페이스 표시(docs-sync), 깊이 접기 칩, 알약(응답 필요 둘·오류·작업 중·작업 완료)`, p.peers === 2 && p.done === 2 && p.from.some((x) => /conductor/.test(x)) && p.folds >= 1 && p.pills.length >= 5, { peers: p.peers, done: p.done, from: p.from, folds: p.folds, pills: p.pills });
        // 스크롤 중 붙는 머리: 절반쯤 내리면 폴더 머리가 맨 위, 워크스페이스 머리가 그 바로 아래
        await pg.evaluate(() => { const s = document.querySelector('.mt-pl-scroll'); s.scrollTop = Math.round(s.scrollHeight * 0.42); }); await sleep(500);
        const stick = await pg.evaluate(() => {
          const s = document.querySelector('.mt-pl-scroll').getBoundingClientRect();
          const at = (sel) => [...document.querySelectorAll(sel)].map((x) => x.getBoundingClientRect()).filter((r) => r.bottom > s.top + 1 && r.top < s.bottom);
          const f = at('[data-role=pl-fhead]').sort((a, b) => a.top - b.top)[0], w = at('[data-role=pl-whead]').sort((a, b) => a.top - b.top)[0];
          return { top: Math.round(s.top), f: f && Math.round(f.top), fb: f && Math.round(f.bottom), w: w && Math.round(w.top) };
        });
        await shot(pg, `${dev}-scrolled`);
        check(`[${dev}] 스크롤 중: 폴더 머리가 위에 붙고 워크스페이스 머리가 그 아래에 붙는다`, stick.f === stick.top && Math.abs(stick.w - stick.fb) <= 1, stick);
        if (dev === 'iphone') {
          // 알약 누르기: 그 카드로 스크롤하고 반짝인다
          await pg.evaluate(() => { document.querySelector('.mt-pl-scroll').scrollTop = 0; }); await sleep(300);
          const pill = await pg.$('[data-role=pl-attn]');
          if (pill) {
            const id = await pill.getAttribute('data-id');
            // 알약을 누르기 전 맨 아래로(그 카드가 화면 밖이 되게)
            await pg.evaluate(() => { const s = document.querySelector('.mt-pl-scroll'); s.scrollTop = s.scrollHeight; }); await sleep(300);
            const pb = await pill.boundingBox();
            await pg.touchscreen.tap(pb.x + pb.width / 2, pb.y + pb.height / 2); await sleep(1100);
            const r = await pg.evaluate((cid) => { const el = document.querySelector(`[data-role=pl-slot][data-id="${CSS.escape(cid)}"]`), s = document.querySelector('.mt-pl-scroll').getBoundingClientRect(); const b = el.getBoundingClientRect(); return { blink: el.classList.contains('blink'), inView: b.top >= s.top && b.bottom <= s.bottom, anim: getComputedStyle(el.querySelector('.mt-pl-card')).animationName }; }, id);
            await shot(pg, 'iphone-pill');
            check('[iphone] 알약을 누르면 그 카드로 스크롤하고 반짝인다', r.blink && r.inView && r.anim === 'mt-sm-blink', { id, ...r });
            // 수 알약: 누를 때마다 다음 작업 중 카드
            const cnt = await pg.$('[data-role=pl-count][data-tier=work]');
            const seen = [];
            for (let i = 0; i < 3 && cnt; i++) { await cnt.scrollIntoViewIfNeeded(); const b = await cnt.boundingBox(); await pg.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); await sleep(900); seen.push(await pg.evaluate(() => window.__mtPm.last())); }
            check('[iphone] 작업 중 수 알약: 누를 때마다 다음 작업 중 카드', seen.length === 3 && seen.every(Boolean) && new Set(seen).size >= Math.min(3, (await pg.evaluate(() => window.__mtPm.model().counts.work))), seen);
          }
          // 깊이 접기 칩을 누르면 그 가지만 편다
          const fold = await pg.$('[data-action=pl-fold]');
          if (fold) {
            const before = (await pg.evaluate(PROBE)).cards.length;
            await fold.scrollIntoViewIfNeeded(); const fb = await fold.boundingBox();
            await pg.touchscreen.tap(fb.x + fb.width / 2, fb.y + fb.height / 2); await sleep(800);
            const after = (await pg.evaluate(PROBE)).cards.length;
            await shot(pg, 'iphone-unfold');
            check('[iphone] "+n단계" 칩을 누르면 그 가지가 펴진다(카드 늘어남, 세션 화면으로 가지 않음)', after > before && (await pg.evaluate(() => document.querySelector('[data-role=phone]').dataset.view)) === 'mission', { before, after });
            const fold2 = await pg.$('[data-action=pl-fold].open'); if (fold2) { const b2 = await fold2.boundingBox(); await pg.touchscreen.tap(b2.x + b2.width / 2, b2.y + b2.height / 2); await sleep(500); }
          }
          // 길게 누르기 = 미리 보기(진짜 터치: CDP)
          const cdp = await ctx.newCDPSession(pg);
          const T = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
          await pg.evaluate(() => { document.querySelector('.mt-pl-scroll').scrollTop = 0; }); await sleep(300);
          const lp = await pg.evaluate(() => { const c = [...document.querySelectorAll('[data-role=pl-card]')].find((x) => x.dataset.name === 'tests' || x.dataset.kind === 'tree'); const r = c.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, name: c.dataset.name }; });
          await T('touchStart', [[lp.x, lp.y]]); await sleep(750); await T('touchEnd', []); await sleep(700);
          const pk = await pg.evaluate(() => ({ peek: !!document.querySelector('[data-role=pl-peek] [data-role=ln-peek]'), name: (document.querySelector('[data-role=pl-peek] .pk1 b') || {}).textContent || null, view: document.querySelector('[data-role=phone]').dataset.view }));
          await shot(pg, 'iphone-peek');
          check('[iphone] 길게 누르면 미리 보기(PC와 같은 내용), 세션 화면으로 가지 않는다', pk.peek && pk.name === lp.name && pk.view === 'mission', { ...pk, want: lp.name });
          await pg.click('[data-action=pl-peek-close]'); await sleep(400);
          check('[iphone] 미리 보기 닫기', !(await pg.$('[data-role=pl-peek]')));
          // 끌어 스크롤해도 열리지 않는다(진짜 터치로 위로 밀기)
          await T('touchStart', [[200, 600]]); for (let i = 1; i <= 8; i++) { await T('touchMove', [[200, 600 - i * 20]]); await sleep(16); } await T('touchEnd', []); await sleep(600);
          check('[iphone] 손가락으로 끌어 스크롤하면 세션이 열리지 않는다', (await pg.evaluate(() => document.querySelector('[data-role=phone]').dataset.view)) === 'mission');
          // 카드 한 번 누르기 = 그 세션 화면(첫 세션 카드 = 실제 셸 p160-a)
          await pg.evaluate(() => { document.querySelector('.mt-pl-scroll').scrollTop = 0; }); await sleep(300);
          const first = SHAPE.sessions[0].name;
          await pg.evaluate((n) => document.querySelector(`[data-role=pl-card][data-name="${n}"]`).scrollIntoView({ block: 'center' }), first); await sleep(400); const cb = await (await pg.$(`[data-role=pl-card][data-name="${first}"]`)).boundingBox();
          await pg.touchscreen.tap(cb.x + cb.width / 2, cb.y + Math.min(20, cb.height / 2)); await sleep(1500);
          const opened = await pg.evaluate(() => document.querySelector('[data-role=phone]').dataset.view);
          await shot(pg, 'iphone-session');
          check('[iphone] 카드를 한 번 누르면 그 세션 화면', opened === 'session', { opened });
          // 돌아오면 맵(같은 자리)
          await pg.goBack().catch(() => {}); await sleep(1200);
          check('[iphone] 뒤로 가면 세션 맵', (await pg.evaluate(() => document.querySelector('[data-role=phone]').dataset.view)) === 'mission');
        }
        await ctx.close();
      }
      // 태블릿(짧은 변 > 430px)은 휴대폰 목록이 아니라 판 화면이라 세션 맵도 PC 세션 맵(MissionLineage.jsx)이다. 모양만 본다
      {
        const ctx = await browser.newContext({ ...DEVICES.tablet, locale: 'en-US', reducedMotion: 'no-preference' });
        const pg = await ctx.newPage();
        pg.on('pageerror', (e) => log(`[tablet pageerror] ${e.message}`));
        await pg.goto(`http://localhost:${SIM}/`);
        await pg.waitForSelector('[data-role=pair]', { timeout: 30000 });
        await pg.fill('[data-field=pair-code]', call('device.code').code);
        await pg.click('[data-action=pair-submit]');
        await pg.waitForFunction(() => window.__mt && window.__mt.getState().boardLoaded && window.__mt.api.conn.phase === 'open', null, { timeout: 60000 });
        await sleep(1500);
        await pg.evaluate(HOOK, [JSON.parse(JSON.stringify(SHAPE)), MIX, await realId(pg)]);
        const view = await pg.evaluate(() => (document.querySelector('[data-role=phone]') ? 'phone' : 'board'));
        const rail = await pg.$('[data-action="mission-rail"]');
        if (rail) { await rail.click().catch(() => {}); await sleep(2000); }
        const map = await pg.evaluate(() => ({ pc: !!document.querySelector('[data-role=mission][data-layout=lineage]'), cards: document.querySelectorAll('.mt-ta-card').length, scrollX: document.documentElement.scrollWidth > innerWidth + 1 }));
        await shot(pg, 'tablet-map');
        log(`[tablet] 첫 화면 ${view}, 세션 맵 ${JSON.stringify(map)}`);
        check('[tablet] 판 화면이고 세션 맵은 PC 세션 맵(카드가 보인다, 가로 넘침 없음)', view === 'board' && map.pc && map.cards > 0 && !map.scrollX, { view, ...map });
        await ctx.close();
      }
      // 움직임 줄이기 한 장(iPhone)과 한국어 한 장
      { const { ctx, pg } = await openPhone(browser, 'iphone', { reduce: true }); await shot(pg, 'iphone-reduce'); const anim = await pg.evaluate(() => { const s = document.querySelector('[data-role=pl-light] .mt-mm-lspin'); return s ? getComputedStyle(s, '::before').animationName : null; }); log(`[reduce] 빛 animation ${anim}`); await ctx.close(); }
      { const { ctx, pg } = await openPhone(browser, 'iphone', { locale: 'ko-KR' }); await pg.evaluate(() => window.__mt.getState().setLanguage && window.__mt.getState().setLanguage('ko')).catch(() => {}); await sleep(600); await shot(pg, 'iphone-ko'); await ctx.close(); }
      // 시안과 나란히 볼 앱 그림(390×844)
      { const { ctx, pg } = await openPhone(browser, 'mockw'); await shot(pg, 'app-390'); await ctx.close(); }
    } finally { await browser.close(); }
    // WebKit 한 번(iPhone)
    let wk = null;
    try { wk = await pw.webkit.launch({ headless: true }); } catch (e) { check('[webkit] 브라우저를 띄웠다', false, e.message.slice(0, 300)); }
    if (wk) {
      try {
        const { ctx, pg } = await openPhone(wk, 'iphone');
        const p = await pg.evaluate(PROBE);
        await shot(pg, 'webkit-iphone-open');
        await pg.evaluate(() => { const s = document.querySelector('.mt-pl-scroll'); s.scrollTop = Math.round(s.scrollHeight * 0.42); }); await sleep(500);
        const stick = await pg.evaluate(() => { const s = document.querySelector('.mt-pl-scroll').getBoundingClientRect(); const f = [...document.querySelectorAll('[data-role=pl-fhead]')].map((x) => x.getBoundingClientRect()).filter((r) => r.bottom > s.top + 1).sort((a, b) => a.top - b.top)[0]; return { top: Math.round(s.top), f: f && Math.round(f.top) }; });
        await shot(pg, 'webkit-iphone-scrolled');
        check('[webkit] 목록·레일·빛, 이름 잘림 없음, 붙는 폴더 머리', p.cards.length >= nSess - 6 && p.rails >= 1 && p.lights >= 1 && !p.cut.length && !p.scrollX && stick.f === stick.top, { cards: p.cards.length, rails: p.rails, cut: p.cut, stick });
        const first = SHAPE.sessions[0].name;
        await pg.evaluate(() => { document.querySelector('.mt-pl-scroll').scrollTop = 0; }); await sleep(300);
        await pg.evaluate((n) => document.querySelector(`[data-role=pl-card][data-name="${n}"]`).scrollIntoView({ block: 'center' }), first); await sleep(400); const cb = await (await pg.$(`[data-role=pl-card][data-name="${first}"]`)).boundingBox();
        await pg.touchscreen.tap(cb.x + cb.width / 2, cb.y + 16); await sleep(1500);
        check('[webkit] 카드 한 번 누르면 세션 화면', (await pg.evaluate(() => document.querySelector('[data-role=phone]').dataset.view)) === 'session');
        await ctx.close();
      } finally { await wk.close(); }
    }
  } finally { await sim.close?.(); }
}

// ---- 시안 B-phone을 펴서 찍고 앱 그림과 나란히(P153 mock과 같은 펴기) ----
async function mock() {
  const { chromium } = await import('playwright');
  const dir = path.join(MAIN, 'experiments', 'mm-concepts', 'project');
  const render = (file, W, H) => {
    const html = fs.readFileSync(path.join(dir, file), 'utf8');
    const style = (html.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || '';
    const tpl = html.split('</helmet>')[1].split('</x-dc>')[0];
    const src = html.match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/)[1];
    const C = new Function(`class DCLogic { constructor(p){ this.props = p || {}; } setState(o){ this.state = Object.assign({}, this.state, o); } }\n${src}\nreturn Component;`)();
    const vals = new C({ light: 'on' }).renderVals();
    const get = (scope, k) => k.split('.').reduce((o, x) => (o == null ? o : o[x]), scope);
    const fill = (s, scope) => s.replace(/\{\{\s*([\w$.]+)\s*\}\}/g, (_, k) => { const v = get(scope, k); return typeof v === 'function' || v == null ? '' : String(v); });
    const expand = (s, scope) => {
      let out = '', i = 0;
      const re = /<sc-(for|if)\b([^>]*)>/g;
      for (;;) {
        re.lastIndex = i;
        const m = re.exec(s);
        if (!m) { out += fill(s.slice(i), scope); break; }
        out += fill(s.slice(i, m.index), scope);
        const tag = m[1];
        let depth = 1, j = m.index + m[0].length, end = -1;
        const open = new RegExp(`<sc-${tag}\\b`, 'g'), close = new RegExp(`</sc-${tag}>`, 'g');
        while (depth) { open.lastIndex = j; close.lastIndex = j; const o = open.exec(s), c2 = close.exec(s); if (!c2) break; if (o && o.index < c2.index) { depth++; j = o.index + 4; } else { depth--; j = c2.index + c2[0].length; if (!depth) end = c2.index; } }
        const body = s.slice(m.index + m[0].length, end);
        const attr = m[2];
        if (tag === 'for') { const list = get(scope, (attr.match(/list="\{\{\s*([\w$.]+)\s*\}\}"/) || [])[1]) || []; const as = (attr.match(/as="(\w+)"/) || [])[1]; for (const it of list) out += expand(body, { ...scope, [as]: it }); }
        else { const v = get(scope, (attr.match(/value="\{\{\s*([\w$.]+)\s*\}\}"/) || [])[1]); if (v) out += expand(body, scope); }
        i = j;
      }
      return out;
    };
    const body = expand(tpl, vals).replace(/\son[A-Z]\w*="[^"]*"/g, '');
    return `<!doctype html><html><head><meta charset="utf-8"><style>${style}</style></head><body style="margin:0;width:${W}px;height:${H}px">${body}</body></html>`;
  };
  const browser = await chromium.launch(chromiumOpts());
  try {
    const pg = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await pg.setContent(render('B-phone.dc.html', 390, 844)); await sleep(800);
    await pg.screenshot({ path: path.join(OUT, 'mockB-phone.png') }); await pg.close();
    const pics = [['mockB-phone.png', 'mockup B-phone'], ['app-390.png', 'app (same window 390x844)'], ['iphone-scrolled.png', 'app, scrolled (sticky heads)'], ['iphone-peek.png', 'app, long press preview']].filter(([x]) => fs.existsSync(path.join(OUT, x)));
    const uri = (x) => `data:image/png;base64,${fs.readFileSync(path.join(OUT, x)).toString('base64')}`;
    const side = await browser.newPage({ viewport: { width: pics.length * 420, height: 900 } });
    await side.setContent(`<body style="margin:0;background:#222;color:#ddd;font:14px sans-serif;display:flex;gap:30px">${pics.map(([x, lab]) => `<div><div>${lab}</div><img src="${uri(x)}" width=390></div>`).join('')}</body>`);
    await sleep(600); await side.screenshot({ path: path.join(OUT, 'comparePhone.png'), fullPage: true }); await side.close();
    check('시안과 나란히 그림', pics.length >= 2, pics.map((x) => x[0]));
  } finally { await browser.close(); }
}

async function stopBoard() {
  for (const s of call('session.list').filter((x) => /^p160-/.test(x.name))) { try { atrium('kill', s.name, '--yes'); } catch (e) { log(`kill ${s.name} ${e.message.slice(0, 100)}`); } }
  await sleep(2000);
  try { log(atrium('terminal', 'stop', '--yes').slice(0, 200)); } catch (e) { log(`terminal stop ${e.message.slice(0, 120)}`); }
  try { log(atrium('backend', 'stop').slice(0, 200)); } catch (e) { log(`backend stop ${e.message.slice(0, 120)}`); }
}

try {
  if (WHAT === 'setup') await setupBoard();
  else if (WHAT === 'phone') await phone();
  else if (WHAT === 'mock') await mock();
  else if (WHAT === 'stop') await stopBoard();
} catch (e) {
  check('시험이 끝까지 돌았다', false, e.stack || e.message);
} finally {
  fs.writeFileSync(path.join(OUT, `p160-${WHAT}.json`), JSON.stringify({ results }, null, 2));
  const bad = results.filter((r) => !r.ok);
  log(`결과 ${results.length - bad.length}/${results.length} 통과${bad.length ? ` 실패: ${bad.map((b) => b.name).join(', ')}` : ''}`);
  process.exit(bad.length ? 1 : 0);
}
