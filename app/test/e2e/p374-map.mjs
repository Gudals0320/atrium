// P374 창 시험: 세션 맵 세로 길이(폴더 띠 여러 열 흘리기, 접기 없음)의 전·후 그림과 잰 값.
// 판 세 가지(모두 지어낸 이름, 페이지 안 흉내 mission.graph): S15 = 워크스페이스 15(일하는 곳 3·응답 필요 1·작업 완료 1·나머지 오늘 쉼),
//   LIVE = 실제로 쓰는 크기의 판(p335와 같은 모양: 폴더 3·워크스페이스 11·세션 32), DEEP = 예전에 접히던 깊은 나무(7단계 사슬)와 하위 7개(절전 5)
// 화면 두 크기(1920×1080, 1440×900). 잰 값: 열 수, 처음 화면 배율, 맵 높이(화면 몇 장), 보이는 카드의 화면 글 크기(이름·상태·모델 줄·지금 일).
// 판: 따로 띄운 개발용 판(atrium-dev-p374, 48106, backend/.dev)만. 창 원격 디버깅 포트 9587. 한 번에 한 창만.
// 실행(워크트리 뿌리): node app/test/e2e/p374-map.mjs <setup|shots|stop> [round]   결과는 experiments/p374/<round>/(저장소 밖)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const WHAT = process.argv[2] || 'shots';
const ROUND = process.argv[3] || 'after';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const DEV = path.join(REPO, 'backend', '.dev');
const OUT = path.join(REPO, 'experiments', 'p374', ROUND);
const BOARD = 'atrium-dev-p374', PORT = '48106', DEBUG = '9587';
const DIR = 'C:\\Workspace\\mtask-p374-a';
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_|HC_|CLAUDECODE$|CLAUDE_CODE_)/.test(k)) delete process.env[k];
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
const ENV = {
  ATRIUM_TERMINAL_SESSION: BOARD, ATRIUM_HERDR_SESSION: BOARD, ATRIUM_PORT: PORT,
  ATRIUM_DATA_DIR: path.join(DEV, 'data'), ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  ATRIUM_CLAUDE_PROJECTS: path.join(DEV, 'p374', 'convos'), ATRIUM_CLAUDE_DESKTOP: 'none', ATRIUM_TEST_PREFIX: 'p374-none-',
};
Object.assign(process.env, ENV);
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(ENV.ATRIUM_CLAUDE_PROJECTS, { recursive: true });
const { logger, sleep, launch, closeApp } = await import('./harness.mjs');
const { assertTestBoard } = await import('./p9-guard.mjs');
assertTestBoard(ENV, { root: DEV });
const log = logger('p374-' + WHAT + '-' + ROUND);
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
  if (!api.__p374orig) { api.__p374orig = api.call.bind(api); window.__p374st = { workspaces: st.workspaces, groups: st.groups }; }
  const now = Date.now();
  const nameOf = (root) => root.split('/').filter(Boolean).pop();
  st.workspaces = [...shape.workspaces.map((w, i) => ({ key: w.key, name: nameOf(w.root), kind: w.kind, root: w.root, createdAt: 1e12 + i, counts: {}, worktrees: [] })), ...(window.__p374st.workspaces || [])];
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
  api.call = async (m, p) => (m === 'mission.graph' ? { nodes: [{ id: 'human', kind: 'human', name: 'you' }, ...nodes], edges, counts: { all: nodes.length }, at: now } : api.__p374orig(m, p));
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
  if (!have.has('p374-a')) log(atrium('--json', 'spawn', DIR, '--kind', 'shell', '--name', 'p374-a').slice(0, 160));
  await sleep(2000);
  check('셸 하나가 떴다', call('session.list').some((s) => s.name === 'p374-a'));
}

async function shots() {
  call('settings.set', { key: 'missionStyle', value: 'territories' });
  call('settings.set', { key: 'language', value: 'en' });
  const seen = {};
  for (const [VW, VH] of [[1920, 1080], [1440, 900]]) {
    const { app, page } = await launch({ log, env: { ...ENV }, args: ['--remote-debugging-port=' + DEBUG, ...AWAKE] });
    try {
      await awayWin(app);
      await app.evaluate(({ BrowserWindow }, [w, h]) => { const b = BrowserWindow.getAllWindows()[0]; b.setContentSize(w, h); }, [VW, VH]);
      await sleep(800);
      await page.waitForFunction(() => window.__mt && window.__mt.getState().boardLoaded, null, { timeout: 60000 }); await sleep(2000);
      // P374: 판 목표 비(숨은 조정 열쇠). P374_ASPECT = view | 1.3333 …
      if (process.env.P374_ASPECT) await page.evaluate((a) => localStorage.setItem('atrium.sessionMap.aspect', a), process.env.P374_ASPECT);
      if (await page.$('[data-role=sidebar]')) { await page.click('[data-role=top-left] [data-action=sidebar]').catch(() => {}); await sleep(600); }
      for (const [sn, shape] of Object.entries(SHAPES)) {
        await page.evaluate(HOOK, [JSON.parse(JSON.stringify(shape))]);
        await page.click('[data-role=sessions-pill]'); await sleep(1500);
        await page.waitForSelector('[data-role="mission"] .mt-ta-card', { timeout: 20000 }); await sleep(2200);
        const tag = sn + '-' + VW;
        const m = await page.evaluate(MEASURE); seen[tag] = { open: m }; log(tag + ' open ' + JSON.stringify(m));
        await shot(page, tag + '-open-' + ROUND);
        await page.evaluate(() => window.__mtTa.fit()); await sleep(1600);
        seen[tag].fit = await page.evaluate(MEASURE); log(tag + ' fit ' + JSON.stringify(seen[tag].fit));
        await shot(page, tag + '-fit-' + ROUND);
        await page.keyboard.press('Escape'); await sleep(900);
        if (await page.$('[data-role="mission"]')) { await page.click('[data-action=mission-close]').catch(() => {}); await sleep(700); }
      }
    } finally { await closeApp(app); }
  }
  fs.writeFileSync(path.join(OUT, 'measure-' + ROUND + '.json'), JSON.stringify(seen, null, 2));
  if (ROUND.startsWith('after')) judge(seen);
}

const FLOOR = Number(process.env.P374_FLOOR || 11);
function judge(seen) {
  for (const [tag, x] of Object.entries(seen)) {
    const m = x.open;
    check(tag + ': 접기 칩·얇은 줄 없음', m.folds === 0 && m.thin === 0, { folds: m.folds, thin: m.thin });
    for (const k of ['name', 'state', 'meta', 'task']) check(tag + ' 처음 화면: ' + k + ' 화면 글 ' + m.minFont[k] + 'px ≥ ' + FLOOR + ', 숨은 카드 ' + m.hidden[k], m.minFont[k] >= FLOOR - 0.05 && m.hidden[k] === 0, { min: m.minFont, hidden: m.hidden });
  }
}

async function stopAll() {
  try { if (call('session.list').some((s) => s.name === 'p374-a')) log(atrium('kill', 'p374-a', '--yes')); } catch (e) { log('kill ' + e.message); }
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
  fs.writeFileSync(path.join(OUT, 'p374-' + WHAT + '.json'), JSON.stringify({ results }, null, 2));
  const bad = results.filter((r) => !r.ok);
  log('결과 ' + (results.length - bad.length) + '/' + results.length + ' 통과' + (bad.length ? ' 실패: ' + bad.map((b) => b.name).join(', ') : ''));
  process.exit(bad.length ? 1 : 0);
}
