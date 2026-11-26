// P376 창 시험: 세션 맵 배열 고정·얇은 줄·휠 확대. 같은 판(P374 BIG 모양, 지어낸 이름)을 배율 세 단계로 찍어 열 나누기가 같은 것,
// 오래 쉰 하위의 얇은 줄, 창 크기를 바꿔도 같은 것, 새 워크스페이스(새 폴더)를 하나 더한 전·후.
// 판: 따로 띄운 개발용 판(atrium-dev-p376, 48105, backend/.dev)만. 창 원격 디버깅 포트 9586. 한 번에 한 창만.
// 실행(워크트리 뿌리): node app/test/e2e/p376-map.mjs <setup|shots|stop> [round]   결과는 experiments/p376/<round>/(저장소 밖)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const WHAT = process.argv[2] || 'shots';
const ROUND = process.argv[3] || 'after';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const DEV = path.join(REPO, 'backend', '.dev');
const OUT = path.join(REPO, 'experiments', 'p376', ROUND);
const BOARD = 'atrium-dev-p376', PORT = '48105', DEBUG = '9586';
const DIR = 'C:\\Workspace\\mtask-p376-a';
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_|HC_|CLAUDECODE$|CLAUDE_CODE_)/.test(k)) delete process.env[k];
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
const ENV = {
  ATRIUM_TERMINAL_SESSION: BOARD, ATRIUM_HERDR_SESSION: BOARD, ATRIUM_PORT: PORT,
  ATRIUM_DATA_DIR: path.join(DEV, 'data'), ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  ATRIUM_CLAUDE_PROJECTS: path.join(DEV, 'p376', 'convos'), ATRIUM_CLAUDE_DESKTOP: 'none', ATRIUM_TEST_PREFIX: 'p376-none-',
};
Object.assign(process.env, ENV);
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(ENV.ATRIUM_CLAUDE_PROJECTS, { recursive: true });
const { logger, sleep, launch, closeApp } = await import('./harness.mjs');
const { assertTestBoard } = await import('./p9-guard.mjs');
assertTestBoard(ENV, { root: DEV });
const log = logger('p376-' + WHAT + '-' + ROUND);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 180000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log((ok ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 1600)) : '')); };
const AWAKE = ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'];
const shot = (pg, name, opts = {}) => pg.screenshot({ path: path.join(OUT, name + '.png'), ...opts }).then(() => log('그림 ' + name + '.png')).catch((e) => log('스크린숏 실패 ' + name + ' ' + e.message.slice(0, 80)));
async function awayWin(app) { return app.evaluate(({ BrowserWindow, screen }) => { const w = BrowserWindow.getAllWindows()[0]; if (!w) return null; const ds = screen.getAllDisplays(); const left = Math.min(...ds.map((d) => d.bounds.x)); const b = w.getBounds(); w.setPosition(left - b.width - 200, 40); return w.getBounds(); }).catch((e) => ({ err: e.message })); }

// ---- 판 모양(지어낸 이름). 세션: { name, workspace, parent, st(needs|error|working|done|ready|sleeping), ago(ms) } ----
const ws = (key, kind = 'repo') => ({ key, kind, root: key.replace(/\/\.git$/, '') });
const MIN = 60e3;
const ss = (name, workspace, st = 'sleeping', parent = null, agoMin = 120, o = {}) => ({ name, workspace, parent, st, ago: agoMin * MIN, kind: 'claude', model: 'claude-opus-5-5', effort: 'high', task: null, ...o });
const k15 = (w) => 'c:/work/' + w + '/.git';
const S15 = (() => {
  const F = [['g1', 'Market', ['web', 'quant', 'feed']], ['g2', 'Hub', ['core', 'api', 'docs-site']], ['g3', 'Campus', ['library', 'pbl', 'exam', 'robot']], ['g4', 'Notes', ['notes', 'journal']]];
  const loose = ['garden', 'scratch', 'atrium-dev'];
  const S = [
    ss('m-lead', k15('web'), 'sleeping', null, 210), ss('m-site', k15('web'), 'sleeping', 'm-lead', 230),
    ss('researcher', k15('quant'), 'working', null, 1, { task: 'Compare the three signal models and write the summary table' }), ...['coin-feed', 'level-sets', 'signal-scan', 'band-model'].map((n) => ss(n, k15('quant'), 'working', 'researcher', 1)),
    ss('feed-1', k15('feed'), 'sleeping', null, 95),
    ss('hub-head', k15('core'), 'working', null, 1), ss('hub-w1', k15('core'), 'working', 'hub-head', 2), ss('hub-w2', k15('core'), 'sleeping', 'hub-head', 40), ss('hub-merger', k15('core'), 'ready', null, 30),
    ss('api-1', k15('api'), 'sleeping', null, 180), ss('api-2', k15('api'), 'sleeping', 'api-1', 185), ss('docs-1', k15('docs-site'), 'sleeping', null, 300),
    ss('lib-1', k15('library'), 'ready', null, 25), ss('scribe', k15('library'), 'done', 'lib-1', 12),
    ss('deck-lead', k15('pbl'), 'ready', null, 20), ss('deck-writer', k15('pbl'), 'working', 'deck-lead', 1), ss('deck-reader', k15('pbl'), 'sleeping', 'deck-writer', 60),
    ss('exam-lead', k15('exam'), 'ready', null, 15), ...['ex-notes', 'ex-set-03', 'ex-set-04'].map((n) => ss(n, k15('exam'), 'sleeping', 'exam-lead', 70)), ss('ex-qa-b', k15('exam'), 'needs', 'exam-lead', 4, { task: 'Allow npm ci in the worktree?' }),
    ss('robot-1', k15('robot'), 'sleeping', null, 150), ss('robot-codex', k15('robot'), 'sleeping', 'robot-1', 155, { kind: 'codex', model: 'gpt-6.1-sol' }),
    ss('notes-2', k15('notes'), 'sleeping', null, 120), ss('reviewer', k15('notes'), 'sleeping', null, 125), ss('journal', k15('journal'), 'sleeping', null, 400),
    ss('g1', k15('garden'), 'sleeping', null, 260), ss('media', k15('garden'), 'sleeping', 'g1', 265), ss('trial', k15('garden'), 'sleeping', 'g1', 270),
    ss('scratch', k15('scratch'), 'sleeping', null, 500), ss('conductor', k15('atrium-dev'), 'ready', null, 50), ss('p-old', k15('atrium-dev'), 'sleeping', 'conductor', 90),
  ];
  return { folders: F.map(([id, name, w]) => ({ id, name, members: w.map(k15) })), workspaces: [...F.flatMap((f) => f[2]), ...loose].map((w) => ws(k15(w))), sessions: S };
})();
const LIVE = (() => {
  const F = [{ id: 'g1', name: 'Market', members: ['d:/work/market/web', 'd:/work/market/quant/.git'] }, { id: 'g2', name: 'Hub', members: ['d:/hub/core/.git'] },
    { id: 'g3', name: 'Campus', members: ['c:/work/library/.git', 'd:/work/campus', 'c:/work/lab/robot/.git', 'd:/work/campus/pbl/.git'] }];
  const W = [ws('c:/work/atrium/.git'), ws('d:/work/campus', 'folder'), ws('d:/work/market/web', 'folder'), ws('d:/hub/core/.git'), ws('d:/work/garden/.git'), ws('c:/work/library/.git'), ws('c:/work/notes/.git'), ws('c:/work/lab/robot/.git'), ws('d:/work/campus/pbl/.git'), ws('d:/work/campus/exam/.git'), ws('d:/work/market/quant/.git')];
  const S = [
    ss('conductor', 'c:/work/atrium/.git', 'working', null, 1), ss('c1', 'd:/work/campus'), ss('m1', 'd:/work/market/web'), ss('hub-head', 'd:/hub/core/.git', 'error', null, 30), ss('g1', 'd:/work/garden/.git'),
    ss('lib-1', 'c:/work/library/.git'), ss('notes-2', 'c:/work/notes/.git', 'sleeping', null, 120, { model: 'claude-fable-5-2' }), ss('atrium-old', 'c:/work/atrium/.git'), ss('robot-1', 'c:/work/lab/robot/.git'),
    ss('robot-worker-codex', 'c:/work/lab/robot/.git', 'done', 'robot-1', 20, { kind: 'codex', model: 'gpt-6.1-sol' }), ss('scribe', 'c:/work/library/.git', 'done', 'lib-1', 25, { kind: 'codex', model: 'gpt-6-astra' }),
    ss('exam-init', 'd:/work/campus/exam/.git', 'ready', null, 40, { kind: 'codex', model: 'gpt-6.1-sol' }), ss('reviewer', 'c:/work/notes/.git'),
    ss('deck-lead', 'd:/work/campus/pbl/.git'), ss('deck-writer', 'd:/work/campus/pbl/.git', 'needs', 'deck-lead', 5, { task: 'Which section should the summary cover?' }), ss('deck-reader', 'd:/work/campus/pbl/.git', 'ready', 'deck-writer', 30, { kind: 'codex', model: 'gpt-6-astra' }),
    ss('deck-reader-2', 'd:/work/campus/pbl/.git', 'ready', 'deck-writer', 30, { kind: 'codex', model: 'gpt-6-astra' }), ss('exam-lead', 'd:/work/campus/exam/.git'),
    ...['ex-notes', 'ex-set-03', 'ex-set-04', 'ex-set-05', 'ex-qa-a', 'ex-qa-b', 'ex-qa-c'].map((n) => ss(n, 'd:/work/campus/exam/.git', 'sleeping', 'exam-lead')),
    ss('media', 'd:/work/garden/.git', 'sleeping', 'g1'), ss('trial', 'd:/work/garden/.git', 'sleeping', 'g1'), ss('researcher', 'd:/work/market/quant/.git', 'done', 'm1', 10),
    ...['coin-feed', 'level-sets', 'signal-scan', 'band-model'].map((n) => ss(n, 'd:/work/market/quant/.git', 'working', 'researcher', 1)),
  ];
  return { folders: F, workspaces: W, sessions: S };
})();
const DEEP = (() => {
  const A = 'c:/work/deep/.git', B = 'c:/work/wide/.git';
  const chain = ['d0', 'd1', 'd2', 'd3', 'd4', 'd5', 'd6'];
  return { folders: [{ id: 'g1', name: 'Lab', members: [A, B] }], workspaces: [ws(A), ws(B)],
    sessions: [...chain.map((n, i) => ss(n, A, i === 6 ? 'working' : 'sleeping', i ? chain[i - 1] : null, 30 + i)), ss('lead', B, 'ready', null, 20), ...[1, 2, 3, 4, 5, 6, 7].map((i) => ss('w' + i, B, i <= 2 ? 'working' : 'sleeping', 'lead', 40 + i))] };
})();
// BIG = S15 + LIVE(이름·키에 꼬리를 붙여 겹치지 않게): 폴더 8 · 워크스페이스 26. 목표 비(4:3 · 화면 비)에 따라 열 수가 갈린다
const BIG = (() => {
  const re = (k) => k.replace(/^([a-z]):\//, '$1:/b/');
  const L2 = { folders: LIVE.folders.map((f) => ({ id: 'b' + f.id, name: f.name + ' B', members: f.members.map(re) })), workspaces: LIVE.workspaces.map((w) => ws(re(w.key), w.kind)), sessions: LIVE.sessions.map((s) => ({ ...s, name: s.name + '-b', workspace: re(s.workspace), parent: s.parent ? s.parent + '-b' : null })) };
  return { folders: [...S15.folders, ...L2.folders], workspaces: [...S15.workspaces, ...L2.workspaces], sessions: [...S15.sessions, ...L2.sessions] };
})();
const SHAPES = { s15: S15, live: LIVE, deep: DEEP, big: BIG };

// ---- 페이지 안 흉내(p335 HOOK과 같은 틀): mission.graph 답과 판의 워크스페이스·폴더(store) ----
const HOOK = ([shape]) => {
  const api = window.__mt.api, st = window.__mt.getState();
  if (!api.__p376orig) { api.__p376orig = api.call.bind(api); window.__p376st = { workspaces: st.workspaces, groups: st.groups }; }
  const now = Date.now();
  const nameOf = (root) => root.split('/').filter(Boolean).pop();
  st.workspaces = [...shape.workspaces.map((w, i) => ({ key: w.key, name: nameOf(w.root), kind: w.kind, root: w.root, createdAt: 1e12 + i, counts: {}, worktrees: [] })), ...(window.__p376st.workspaces || [])];
  st.groups = shape.folders.map((f) => ({ id: f.id, name: f.name, members: [...f.members] }));
  const SC = { needs: ['waiting', 'needs_you'], error: ['error', 'needs_you'], working: ['working', 'working'], done: ['ready', 'done'], ready: ['ready', 'idle'], sleeping: ['sleeping', 'idle'] };
  const tasks = ['Merge the workers and run the release check', 'Draft the slide notes', 'Collect the source tables', 'Review the parser diff'];
  const nodes = shape.sessions.map((s, i) => {
    const [state, category] = SC[s.st];
    return { id: 's:' + s.name, kind: 'session', sessionId: 'fk-' + s.name, name: s.name, agentKind: s.kind, state, category, workspaceKey: s.workspace, parentId: s.parent ? 's:' + s.parent : null, lineageParent: s.parent ? 's:' + s.parent : null, peers: [], role: null, order: null,
      createdAt: 1e12 + i, loops: 0, model: s.model, effort: s.effort, activeAt: now - s.ago, turnAt: state === 'working' ? now - s.ago : null, closedKids: 0, assignAt: null, parentClosed: false, gitBranch: null,
      ask: s.st === 'needs' ? s.task : null, error: s.st === 'error' ? 'API Error: 529 overloaded. The server is busy, retry later.' : null, lastPrompt: s.task || tasks[i % 4] };
  });
  const edges = shape.sessions.filter((s) => s.parent).flatMap((s) => [{ from: 's:' + s.parent, to: 's:' + s.name, kind: 'spawn', count: 1, lastAt: now - 6e5 }, { from: 's:' + s.parent, to: 's:' + s.name, kind: 'prompt', label: 'report back when done', count: 3, lastAt: now - 6e5 }]);
  api.call = async (m, p) => (m === 'mission.graph' ? { nodes: [{ id: 'human', kind: 'human', name: 'you' }, ...nodes], edges, counts: { all: nodes.length }, at: now } : api.__p376orig(m, p));
};

// 잰 값: 열 수·배율·맵 높이(화면 수)·보이는 카드의 화면 글(이름·상태·모델 줄·지금 일)·접기 칩·얇은 줄 수
const MEASURE = () => {
  const root = document.querySelector('[data-role="mission"]'), vp = root.querySelector('[data-role="ta-viewport"]');
  const V = vp.getBoundingClientRect();
  const L = window.__mtTa.lay(), v = window.__mtTa.view();
  const TOPH = 52, BOTTOM = 112;
  const sum = root.querySelector('[data-role="ln-summary"]');
  const visH = V.height - TOPH - BOTTOM;
  const font = (el) => { if (!el || getComputedStyle(el).display === 'none') return null; const r = el.getBoundingClientRect(), cs = getComputedStyle(el); if (!r.height) return null; const k = r.height / (parseFloat(cs.height) || r.height); return Math.round(parseFloat(cs.fontSize) * k * 10) / 10; };
  const vis = [...root.querySelectorAll('.mt-ta-card')].filter((c) => { const r = c.getBoundingClientRect(); return r.bottom > V.top + TOPH && r.top < V.bottom - BOTTOM && r.right > V.left && r.left < V.right; });
  // 화면 글 하한(보이는 카드 중 가장 작은 것)과 그 사실이 보이지 않는 카드 수(얇은 줄·멀리 타일은 모델 줄·지금 일이 없다)
  const min = { name: Infinity, state: Infinity, meta: Infinity, task: Infinity }, hidden = { name: 0, state: 0, meta: 0, task: 0 };
  for (const c of vis) {
    const thin = c.querySelector('.mt-sm-thin');
    const f = { name: font(c.querySelector('.mt-ta-full .cname')) ?? font(c.querySelector('.mt-ta-tile .tn')) ?? font(thin && thin.querySelector('.cname')), state: font(c.querySelector('.mt-ta-full .cst')) ?? font(c.querySelector('.mt-ta-tile .ts')), meta: font(c.querySelector('.mt-ta-full .c2 > span:not(.hb):not(.dotsep)')), task: font(c.querySelector('.mt-ta-full .c3')) };
    for (const k of Object.keys(min)) { if (f[k] == null) hidden[k]++; else min[k] = Math.min(min[k], f[k]); }
  }
  for (const k of Object.keys(min)) if (min[k] === Infinity) min[k] = null;
  return { k: Math.round(v.k * 1000) / 1000, level: root.dataset.level || null, ncol: L.ncol || 1, bounds: { w: Math.round(L.bounds.w), h: Math.round(L.bounds.h) }, screens: Math.round((L.bounds.h * v.k) / visH * 10) / 10, mapW: Math.round(L.bounds.w * v.k), viewW: Math.round(V.width - (sum ? sum.getBoundingClientRect().width + 12 : 0)), cards: L.cards.size, visible: vis.length, minFont: min, hidden,
    folds: root.querySelectorAll('[data-action="ln-fold"]').length, thin: root.querySelectorAll('.mt-ta-slot.thin').length };
};

async function setup() {
  fs.mkdirSync(DIR, { recursive: true });
  log(atrium('backend', 'start').trim().slice(0, 300));
  const have = new Set(call('session.list').map((s) => s.name));
  if (!have.has('p376-a')) log(atrium('--json', 'spawn', DIR, '--kind', 'shell', '--name', 'p376-a').slice(0, 160));
  await sleep(2000);
  check('셸 하나가 떴다', call('session.list').some((s) => s.name === 'p376-a'));
}

// 배열 = 열마다 띠 id 차례(맵 배치에서)
const ARR = () => { const L = window.__mtTa.lay(); const cols = []; for (const b of [...L.bands].sort((p, q) => (p.col || 0) - (q.col || 0) || p.y - q.y)) (cols[b.col || 0] ||= []).push(b.id || 'none'); return JSON.stringify(cols); };
// 어제 이전에만 쓴 폴더(Notes·Hub B): 그 띠의 세션을 사흘 전 활동으로. 배열을 정할 때 오늘 띠가 먼저, 그 뒤 구분 줄
const OLD = ['g4', 'bg2'];
const DAY = 24 * 60 * MIN;
const oldify = (shape) => { const keys = new Set(shape.folders.filter((f) => OLD.includes(f.id)).flatMap((f) => f.members)); return { ...shape, sessions: shape.sessions.map((s) => (keys.has(s.workspace) ? { ...s, st: s.st === 'error' ? 'sleeping' : s.st, ago: 3 * DAY } : s)) }; };
// 나중 활동: Notes의 notes-2가 지금 일한다(띠는 제자리, 기둥에 오늘 표시)
const wake = (shape) => ({ ...shape, sessions: shape.sessions.map((s) => (s.name === 'notes-2' ? { ...s, st: 'working', ago: MIN } : s)) });
const NEWWS = (shape) => ({ ...shape, folders: [...shape.folders, { id: 'gnew', name: 'Fresh', members: ['c:/work/fresh/.git'] }], workspaces: [...shape.workspaces, ws('c:/work/fresh/.git')], sessions: [...shape.sessions, ss('fresh-1', 'c:/work/fresh/.git', 'working', null, 1), ss('fresh-2', 'c:/work/fresh/.git', 'sleeping', 'fresh-1', 30)] });

async function openMap(page, shape) {
  await page.evaluate(HOOK, [JSON.parse(JSON.stringify(shape))]);
  await page.click('[data-role=sessions-pill]'); await sleep(1500);
  await page.waitForSelector('[data-role="mission"] .mt-ta-card', { timeout: 20000 }); await sleep(2200);
}
async function closeMap(page) {
  await page.keyboard.press('Escape'); await sleep(900);
  if (await page.$('[data-role="mission"]')) { await page.click('[data-action=mission-close]').catch(() => {}); await sleep(700); }
}
// 배율 k로 판 왼쪽 위를 보기 칸 왼쪽 위에 두고(배율 계단이 바뀌면 배치를 다시 센다) 잰다
async function atZoom(page, k) {
  // 배율 계단이 바뀌면 창이 보던 카드를 제자리에 두려고 보기를 옮기므로(P178) 배치가 다시 선 뒤 한 번 더 둔다
  for (let i = 0; i < 2; i++) { await page.evaluate((k) => { window.__mtTa.set({ k, x: window.__mtTa.rail + 16, y: window.__mtTa.top + 8 }); }, k); await sleep(1800); }
  return page.evaluate(({ ARRs }) => { const ARR = eval(ARRs); const L = window.__mtTa.lay(); return { k: Math.round(window.__mtTa.view().k * 1000) / 1000, label: window.__mtTa.label(), ncol: L.ncol, arr: ARR(), thin: document.querySelectorAll('[data-role="mission"] .mt-ta-slot.thin').length, plan: localStorage.getItem('atrium.sessionMap.plan') }; }, { ARRs: '(' + ARR.toString() + ')' });
}

async function shots() {
  call('settings.set', { key: 'missionStyle', value: 'territories' });
  call('settings.set', { key: 'language', value: 'ko' });
  const seen = {};
  const { app, page } = await launch({ log, env: { ...ENV }, args: ['--remote-debugging-port=' + DEBUG, ...AWAKE] });
  try {
    await awayWin(app);
    const size = (w, h) => app.evaluate(({ BrowserWindow }, [w, h]) => { BrowserWindow.getAllWindows()[0].setContentSize(w, h); }, [w, h]);
    await size(1920, 1080); await sleep(800);
    await page.waitForFunction(() => window.__mt && window.__mt.getState().boardLoaded, null, { timeout: 60000 }); await sleep(2000);
    await page.evaluate(() => { localStorage.removeItem('atrium.sessionMap.plan'); localStorage.removeItem('atrium.sessionMap.aspect'); });
    // 세션 맵은 창이 뜰 때 기억을 읽으므로 지운 뒤 다시 읽힌다
    await page.reload(); await page.waitForFunction(() => window.__mt && window.__mt.getState().boardLoaded, null, { timeout: 60000 }); await sleep(2000);
    if (await page.$('[data-role=sidebar]')) { await page.click('[data-role=top-left] [data-action=sidebar]').catch(() => {}); await sleep(600); }
    const shape = oldify(BIG);
    await openMap(page, shape);
    // 1) 배율 세 단계(멀리 0.18 · 중간 0.4 · 읽히는 0.85): 같은 배열
    for (const [tag, k] of [['far', 0.15], ['mid', 0.3], ['near', 0.6]]) {
      seen[tag] = await atZoom(page, k); log(tag + ' ' + JSON.stringify({ ...seen[tag], plan: undefined }));
      await shot(page, '01-zoom-' + tag + '-' + Math.round(k * 100));
    }
    const base = seen.far.arr;
    check('배율 0.15·0.3·0.6에서 열 나누기가 같다', seen.mid.arr === base && seen.near.arr === base, { far: seen.far.arr, mid: seen.mid.arr, near: seen.near.arr });
    check('여러 열 판', seen.far.ncol >= 2, seen.far.ncol);
    const plan0 = JSON.parse(seen.far.plan || '{}');
    const secs = await page.evaluate(() => window.__mtTa.lay().sections.map((s) => ({ col: s.col, before: s.before, day: s.day })));
    check('구분 줄 하나, 오늘 띠 뒤 첫 이전 띠 위', secs.length === 1 && ['g4', 'bg2'].includes(plan0.split), { secs, split: plan0.split });
    seen.secs = secs;
    // 2) 휠 = 커서 둘레 확대
    const before = await page.evaluate(() => window.__mtTa.view());
    const vp = await page.$eval('[data-role="ta-viewport"]', (e) => { const r = e.getBoundingClientRect(); return { x: r.x + r.width * 0.4, y: r.y + r.height * 0.5 }; });
    await page.mouse.move(vp.x, vp.y); await page.mouse.wheel(0, -400); await sleep(900);
    const after = await page.evaluate(() => window.__mtTa.view());
    check('휠(Ctrl 없이)은 확대', after.k > before.k * 1.05, { before, after });
    await page.mouse.wheel(0, 400); await sleep(900);
    const back = await page.evaluate(() => window.__mtTa.view());
    check('휠 아래는 축소', back.k < after.k * 0.97, { after, back });
    seen.wheel = { before, after, back };
    // 3) 얇은 줄: exam-lead(하위 4, 절전 3)를 읽히는 배율로
    await page.evaluate(() => window.__mtTa.flyTo('s:exam-lead')); await sleep(1800);
    await page.evaluate(() => { const v = window.__mtTa.view(); window.__mtTa.set({ ...v }); }); await sleep(400);
    seen.thin = await page.evaluate(() => [...document.querySelectorAll('[data-role="mission"] .mt-ta-slot.thin')].map((e) => e.dataset.id));
    check('오래 쉰 하위가 얇은 줄로 보인다(이름이 보임)', seen.thin.length >= 3 && seen.thin.includes('s:ex-notes'), seen.thin);
    await shot(page, '02-thin-rows');
    // 4) 창 크기를 바꿔도 같다(1440×900, 요약 열 접기·펴기)
    await closeMap(page);
    await size(1440, 900); await sleep(1000);
    await openMap(page, shape);
    seen.small = await atZoom(page, 0.3); log('small ' + seen.small.arr);
    check('창 1440×900에서도 같은 배열', seen.small.arr === base, { small: seen.small.arr, base });
    await shot(page, '03-window-1440');
    await closeMap(page);
    await size(1920, 1080); await sleep(1000);
    // 5) 새 워크스페이스(새 폴더 Fresh) 전·후: 맞춤으로
    await openMap(page, shape);
    await page.evaluate(() => window.__mtTa.fit()); await sleep(1600);
    seen.pre = await page.evaluate(({ ARRs }) => eval(ARRs)(), { ARRs: '(' + ARR.toString() + ')' });
    await shot(page, '04-new-ws-before');
    await closeMap(page);
    await openMap(page, NEWWS(shape));
    await page.evaluate(() => window.__mtTa.fit()); await sleep(1600);
    seen.post = await page.evaluate(({ ARRs }) => eval(ARRs)(), { ARRs: '(' + ARR.toString() + ')' });
    seen.postPlan = await page.evaluate(() => localStorage.getItem('atrium.sessionMap.plan'));
    await shot(page, '05-new-ws-after');
    const pre = JSON.parse(seen.pre), post = JSON.parse(seen.post);
    const kept = pre.every((c, i) => JSON.stringify((post[i] || []).filter((x) => x !== 'gnew')) === JSON.stringify(c));
    check('새 워크스페이스: 새 띠만 더해지고 기존 띠의 열·차례는 그대로', kept && post.flat().includes('gnew'), { pre, post, why: JSON.parse(seen.postPlan || '{}').why });
    await closeMap(page);
    // 6) 나중 활동: Notes가 오늘 일해도 띠는 제자리, 기둥에 작은 오늘 표시
    await openMap(page, wake(NEWWS(shape)));
    seen.woke = await page.evaluate(({ ARRs }) => eval(ARRs)(), { ARRs: '(' + ARR.toString() + ')' });
    const marks = await page.evaluate(() => [...document.querySelectorAll('[data-role="ln-band"]')].filter((b) => b.querySelector('[data-role="ln-band-today"]')).map((b) => b.dataset.id));
    check('나중 활동: 배열 그대로, Notes 기둥에 오늘 표시', seen.woke === seen.post && marks.includes('g4') && !marks.includes('bg2'), { woke: seen.woke, marks });
    await page.evaluate(() => { const L = window.__mtTa.lay(), b = L.bands.find((x) => x.id === 'g4'); window.__mtTa.set({ k: 0.6, x: window.__mtTa.rail + 16 - (b.x || 0) * 0.6, y: window.__mtTa.top + 8 - (b.y - 160) * 0.6 }); }); await sleep(1800);
    await page.evaluate(() => { const L = window.__mtTa.lay(), b = L.bands.find((x) => x.id === 'g4'); window.__mtTa.set({ k: 0.6, x: window.__mtTa.rail + 16 - (b.x || 0) * 0.6, y: window.__mtTa.top + 8 - (b.y - 160) * 0.6 }); }); await sleep(900);
    const covers = await page.evaluate(() => { const m = document.querySelector('[data-role="ln-band"][data-id="g4"] [data-role="ln-band-today"]'); if (!m) return null; const r = m.getBoundingClientRect(); return [...document.querySelectorAll('[data-role="mission"] .mt-ta-slot')].some((c) => { const q = c.getBoundingClientRect(); return r.left < q.right && r.right > q.left && r.top < q.bottom && r.bottom > q.top; }); });
    check('오늘 표시는 카드를 덮지 않는다', covers === false, covers);
    await shot(page, '06-later-today-mark');
    await closeMap(page);
    // 7) 배열을 정한 날이 오늘이 아니면 구분 줄 이름표에 날짜
    await page.evaluate(() => { const p = JSON.parse(localStorage.getItem('atrium.sessionMap.plan')); p.day -= 86400000; localStorage.setItem('atrium.sessionMap.plan', JSON.stringify(p)); });
    await page.reload(); await page.waitForFunction(() => window.__mt && window.__mt.getState().boardLoaded, null, { timeout: 60000 }); await sleep(2000);
    if (await page.$('[data-role=sidebar]')) { await page.click('[data-role=top-left] [data-action=sidebar]').catch(() => {}); await sleep(600); }
    await openMap(page, wake(NEWWS(shape)));
    const lab = await page.evaluate(() => { const s = document.querySelector('[data-role="ln-section"] .up'); return s ? s.textContent : null; });
    check('지난 날 배열의 구분 줄은 "오늘(날짜 기준)"', /기준/.test(lab || ''), lab);
    seen.dated = lab;
    await page.evaluate(() => { const L = window.__mtTa.lay(), s = L.sections[0]; window.__mtTa.set({ k: 0.6, x: window.__mtTa.rail + 16 - s.x * 0.6, y: window.__mtTa.top + 8 - (s.y - 400) * 0.6 }); }); await sleep(1800);
    await page.evaluate(() => { const L = window.__mtTa.lay(), s = L.sections[0]; window.__mtTa.set({ k: 0.6, x: window.__mtTa.rail + 16 - s.x * 0.6, y: window.__mtTa.top + 8 - (s.y - 400) * 0.6 }); }); await sleep(900);
    await shot(page, '07-divider-dated');
    // 영어 사전 글도 본다
    call('settings.set', { key: 'language', value: 'en' }); await sleep(1500);
    seen.datedEn = await page.evaluate(() => { const s = document.querySelector('[data-role="ln-section"] .up'); return s ? s.textContent : null; });
    seen.markEn = await page.evaluate(() => { const m = document.querySelector('[data-role="ln-band-today"]'); return m ? m.textContent : null; });
    check('영어: Today (as of …)·Today 표시', /as of/.test(seen.datedEn || '') && seen.markEn === 'Today', { dated: seen.datedEn, mark: seen.markEn });
    await shot(page, '08-divider-dated-en');
    call('settings.set', { key: 'language', value: 'ko' });
    await closeMap(page);
  } finally { await closeApp(app); }
  fs.writeFileSync(path.join(OUT, 'measure.json'), JSON.stringify(seen, null, 2));
}

async function stopAll() {
  try { if (call('session.list').some((s) => s.name === 'p376-a')) log(atrium('kill', 'p376-a', '--yes')); } catch (e) { log('kill ' + e.message); }
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
  fs.writeFileSync(path.join(OUT, 'p376-' + WHAT + '.json'), JSON.stringify({ results }, null, 2));
  const bad = results.filter((r) => !r.ok);
  log('결과 ' + (results.length - bad.length) + '/' + results.length + ' 통과' + (bad.length ? ' 실패: ' + bad.map((b) => b.name).join(', ') : ''));
  process.exit(bad.length ? 1 : 0);
}
