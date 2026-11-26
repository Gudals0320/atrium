// P377 창 시험: 세션 맵 이름표(폴더 기둥·워크스페이스 줄 머리)를 확대·축소하는 동안의 움직임.
// 고치기 전(P178 계단: 멈춘 뒤 계단을 바꾸고 배치를 다시 세며 보기를 옮김)과 고친 뒤(자리 고정, 글은 매 프레임 연속)를 같은 판·같은 손놀림으로 견준다.
// 판: 따로 띄운 개발용 판(atrium-dev-p377, 48105, backend/.dev)만. 창 원격 디버깅 포트 9586. 한 번에 한 창만.
// 실행(워크트리 뿌리): node app/test/e2e/p377-map.mjs <setup|shots|perf|stop> [round]   결과는 experiments/p377/<round>/(저장소 밖)
//   P377_DIST=<dist 폴더>면 app/dist 대신 그 빌드로 띄운다(고치기 전 견주기: 잠시 app/dist와 바꿔 끼우고 끝나면 되돌린다)
//   P377_SEC=6 P377_ROUNDS=2(perf)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const WHAT = process.argv[2] || 'shots';
const ROUND = process.argv[3] || 'after';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const DEV = path.join(REPO, 'backend', '.dev');
const OUT = path.join(REPO, 'experiments', 'p377', ROUND);
const BOARD = 'atrium-dev-p377', PORT = '48105', DEBUG = '9586';
const DIR = 'C:\\Workspace\\mtask-p377-a';
const SEC = Number(process.env.P377_SEC || 6), ROUNDS = Number(process.env.P377_ROUNDS || 2);
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_|HC_|CLAUDECODE$|CLAUDE_CODE_)/.test(k)) delete process.env[k];
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
const ENV = {
  ATRIUM_TERMINAL_SESSION: BOARD, ATRIUM_HERDR_SESSION: BOARD, ATRIUM_PORT: PORT,
  ATRIUM_DATA_DIR: path.join(DEV, 'data'), ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  ATRIUM_CLAUDE_PROJECTS: path.join(DEV, 'p377', 'convos'), ATRIUM_CLAUDE_DESKTOP: 'none', ATRIUM_TEST_PREFIX: 'p377-none-',
};
Object.assign(process.env, ENV);
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(ENV.ATRIUM_CLAUDE_PROJECTS, { recursive: true });
const { logger, sleep, launch, closeApp } = await import('./harness.mjs');
const { assertTestBoard } = await import('./p9-guard.mjs');
assertTestBoard(ENV, { root: DEV });
const log = logger('p377-' + WHAT + '-' + ROUND);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 180000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log((ok ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 1600)) : '')); };
const AWAKE = ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'];
const shot = (pg, name, opts = {}) => pg.screenshot({ path: path.join(OUT, name + '.png'), ...opts }).then((b) => { log('그림 ' + name + '.png'); return b; }).catch((e) => log('스크린숏 실패 ' + name + ' ' + e.message.slice(0, 80)));
async function awayWin(app) { return app.evaluate(({ BrowserWindow, screen }) => { const w = BrowserWindow.getAllWindows()[0]; if (!w) return null; const ds = screen.getAllDisplays(); const left = Math.min(...ds.map((d) => d.bounds.x)); const b = w.getBounds(); w.setPosition(left - b.width - 200, 40); return w.getBounds(); }).catch((e) => ({ err: e.message })); }

// 고치기 전 빌드: app/dist를 잠시 바꿔 끼운다
const APPDIST = path.join(REPO, 'app', 'dist'), KEEP = path.join(DEV, 'p377-dist-keep');
function useDist(dir) { if (!dir) return () => {}; if (fs.existsSync(KEEP)) throw new Error(KEEP + '가 남아 있다(앞 실행이 되돌리지 못함)'); fs.renameSync(APPDIST, KEEP); fs.cpSync(dir, APPDIST, { recursive: true }); log('dist 바꿔 끼움 ' + dir); return () => { fs.rmSync(APPDIST, { recursive: true, force: true }); fs.renameSync(KEEP, APPDIST); log('dist 되돌림'); }; }

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
  if (!api.__p377orig) { api.__p377orig = api.call.bind(api); window.__p377st = { workspaces: st.workspaces, groups: st.groups }; }
  const now = Date.now();
  const nameOf = (root) => root.split('/').filter(Boolean).pop();
  st.workspaces = [...shape.workspaces.map((w, i) => ({ key: w.key, name: nameOf(w.root), kind: w.kind, root: w.root, createdAt: 1e12 + i, counts: {}, worktrees: [] })), ...(window.__p377st.workspaces || [])];
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
  api.call = async (m, p) => (m === 'mission.graph' ? { nodes: [{ id: 'human', kind: 'human', name: 'you' }, ...nodes], edges, counts: { all: nodes.length }, at: now } : api.__p377orig(m, p));
};


// 긴 이름 판: 아주 긴 폴더 이름·워크스페이스 이름(지어낸 이름)
const LONG = (() => {
  const A = 'c:/work/an-extremely-long-workspace-name-for-the-quarterly-planning-notes/.git', B = 'c:/work/short/.git';
  return { folders: [{ id: 'gl', name: 'A very long folder name that keeps going past the column', members: [A, B] }], workspaces: [ws(A), ws(B)],
    sessions: [ss('long-lead', A, 'working', null, 1), ss('long-w1', A, 'sleeping', 'long-lead', 30), ss('short-1', B, 'ready', null, 20)] };
})();

async function openMap(page, shape) {
  await page.evaluate(HOOK, [JSON.parse(JSON.stringify(shape))]);
  await page.click('[data-role=sessions-pill]'); await sleep(1500);
  await page.waitForSelector('[data-role="mission"] .mt-ta-card', { timeout: 20000 }); await sleep(2200);
}
async function closeMap(page) {
  await page.keyboard.press('Escape'); await sleep(900);
  if (await page.$('[data-role="mission"]')) { await page.click('[data-action=mission-close]').catch(() => {}); await sleep(700); }
}
async function boot(app, page, w = 1920, h = 1080) {
  await awayWin(app);
  await app.evaluate(({ BrowserWindow }, [w, h]) => { BrowserWindow.getAllWindows()[0].setContentSize(w, h); }, [w, h]); await sleep(800);
  await page.waitForFunction(() => window.__mt && window.__mt.getState().boardLoaded, null, { timeout: 60000 }); await sleep(1500);
  await page.evaluate(() => { localStorage.removeItem('atrium.sessionMap.plan'); localStorage.removeItem('atrium.sessionMap.aspect'); localStorage.setItem('atrium.sessionMap.summary', '0'); });
  await page.reload(); await page.waitForFunction(() => window.__mt && window.__mt.getState().boardLoaded, null, { timeout: 60000 }); await sleep(1500);
  if (await page.$('[data-role=sidebar]')) { await page.click('[data-role=top-left] [data-action=sidebar]').catch(() => {}); await sleep(600); }
}

// 화면에서 잰 이름표: 띠 이름·줄 이름의 화면 글 크기(px), 기둥 폭·줄 머리 폭(화면), 닻 카드·띠 이름의 화면 자리, 배치 값
const PROBE = ([bandId, rowKey, cardId]) => {
  const root = document.querySelector('[data-role="mission"]');
  const sf = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); const h = el.offsetHeight || r.height; return Math.round(parseFloat(getComputedStyle(el).fontSize) * (r.height / h) * 10) / 10; };
  const band = root.querySelector('[data-role="ln-band"][data-id="' + bandId + '"]');
  const bn = band && band.querySelector('[data-role="ln-band-name"]');
  const row = root.querySelector('[data-role="ta-isle"][data-key="' + rowKey + '"]');
  const rn = row && row.querySelector('[data-role="ta-isle-name"]');
  const card = root.querySelector('.mt-ta-slot[data-id="' + cardId + '"]');
  const L = window.__mtTa.lay(), v = window.__mtTa.view();
  const rc = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.left * 10) / 10, y: Math.round(r.top * 10) / 10, w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 }; };
  return { k: Math.round(v.k * 1000) / 1000, label: window.__mtTa.label(), spine: L.spine, headW: L.headW, W: L.W, bandH: (L.bands.find((b) => (b.id || 'none') === bandId) || {}).h,
    bandName: sf(bn), wsName: sf(rn && rn.closest('.wsn') || rn), bandNameRect: rc(bn), wsNameRect: rc(rn), card: rc(card), cardWorld: (() => { const b = L.cards.get(cardId); return b ? { x: b.x, y: b.y } : null; })() };
};

// 동작 띠: 휠로 판을 줄이는(또는 키우는) 동안과 멈춘 뒤를 같은 자리로 잘라 한 장에 잇는다
async function strip(page, name, { from, to, dy, at }) {
  const vp = await page.$eval('[data-role="ta-viewport"]', (e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  // 시작: 띠 g3(Campus)의 기둥 왼쪽 위를 보기 칸 왼쪽 위에
  await page.evaluate(([k]) => { const L = window.__mtTa.lay(), b = L.bands.find((x) => x.id === 'g3'); window.__mtTa.set({ k, x: window.__mtTa.rail + 16 - (b.x || 0) * k, y: window.__mtTa.top + 8 - b.y * k }); }, [from]);
  await sleep(1600);
  await page.evaluate(([k]) => { const L = window.__mtTa.lay(), b = L.bands.find((x) => x.id === 'g3'); window.__mtTa.set({ k, x: window.__mtTa.rail + 16 - (b.x || 0) * k, y: window.__mtTa.top + 8 - b.y * k }); }, [from]);
  await sleep(1600);
  const P = ['g3', 'c:/work/library/.git', 's:lib-1'];
  const cx = vp.x + at.x, cy = vp.y + at.y;
  const clip = { x: vp.x, y: vp.y + 40, width: Math.min(1100, vp.w), height: Math.min(720, vp.h - 150) };
  const frames = [];
  const grab = async (tag) => { const t = Date.now(); const buf = await page.screenshot({ clip }); const pr = await page.evaluate(PROBE, P); frames.push({ tag, t, buf, pr }); };
  await page.mouse.move(cx, cy);
  await grab('전');
  const t0 = Date.now();
  // 배율이 to를 지날 때까지 휠(30ms마다). 가운데쯤(로그 배율 반) 한 번 찍는다
  const mid = Math.sqrt(from * to);
  let midDone = false;
  for (let i = 0; i < 60; i++) {
    await page.mouse.wheel(0, dy); await sleep(28);
    const k = await page.evaluate(() => window.__mtTa.view().k);
    if (!midDone && (dy > 0 ? k <= mid : k >= mid)) { midDone = true; await grab('중 1'); }
    if (dy > 0 ? k <= to : k >= to) break;
  }
  await grab('중 2(마지막 휠 직후)');
  await sleep(120); await grab('멈춤 +0.12초');
  await sleep(330); await grab('멈춤 +0.45초');
  await sleep(1300); await grab('멈춤 +1.8초');
  // 멈춘 뒤 움찔: 마지막 휠 직후 → +1.8초 사이 띠 이름·줄 이름·닻 카드의 화면 자리 변화
  const a = frames[2].pr, z = frames[5].pr;
  const d = (p, q) => (p && q ? Math.round(Math.hypot(p.x - q.x, p.y - q.y) * 10) / 10 : null);
  const jump = { card: d(a.card, z.card), bandName: d(a.bandNameRect, z.bandNameRect), wsName: d(a.wsNameRect, z.wsNameRect), font: [a.bandName, z.bandName, a.wsName, z.wsName], layout: [a.spine, z.spine, a.headW, z.headW], k: [a.k, z.k] };
  // 한 장에 잇기: 창 안에 그림을 늘어놓고 찍는다
  const imgs = frames.map((f) => ({ tag: f.tag + ' · ' + Math.round(f.pr.k * 100) + '% · 폴더 ' + f.pr.bandName + 'px · 기둥 ' + f.pr.spine, src: 'data:image/png;base64,' + f.buf.toString('base64') }));
  await page.evaluate(([imgs, title]) => {
    const o = document.createElement('div'); o.id = 'p377-strip';
    o.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#111;color:#eee;font:14px sans-serif;padding:10px;display:grid;grid-template-columns:repeat(3,1fr);gap:8px;align-content:start';
    const h = document.createElement('div'); h.textContent = title; h.style.cssText = 'grid-column:1/-1;font-size:16px;font-weight:600'; o.appendChild(h);
    for (const im of imgs) { const c = document.createElement('div'); const t = document.createElement('div'); t.textContent = im.tag; const i = document.createElement('img'); i.src = im.src; i.style.cssText = 'width:100%;display:block;border:1px solid #444'; c.append(t, i); o.appendChild(c); }
    document.body.appendChild(o);
  }, [imgs, name]);
  await sleep(600);
  await shot(page, name);
  await page.evaluate(() => document.getElementById('p377-strip').remove());
  log(name + ' ' + JSON.stringify(frames.map((f) => ({ tag: f.tag, ms: f.t - t0, ...f.pr }))));
  return { frames: frames.map((f) => ({ tag: f.tag, ms: f.t - t0, ...f.pr })), jump };
}

async function setup() {
  fs.mkdirSync(DIR, { recursive: true });
  log(atrium('backend', 'start').trim().slice(0, 300));
  const have = new Set(call('session.list').map((s) => s.name));
  if (!have.has('p377-a')) log(atrium('--json', 'spawn', DIR, '--kind', 'shell', '--name', 'p377-a').slice(0, 160));
  await sleep(2000);
  check('셸 하나가 떴다', call('session.list').some((s) => s.name === 'p377-a'));
}

async function shots() {
  call('settings.set', { key: 'missionStyle', value: 'territories' });
  call('settings.set', { key: 'language', value: 'ko' });
  const seen = {};
  const undo = useDist(process.env.P377_DIST);
  const { app, page } = await launch({ log, env: { ...ENV }, args: ['--remote-debugging-port=' + DEBUG, ...AWAKE] });
  try {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await boot(app, page);
    await openMap(page, BIG);
    // 1) 동작 띠: 줄이기(60% → 약 18%), 키우기(18% → 60%)
    seen.out = await strip(page, '01-strip-zoom-out', { from: 0.6, to: 0.2, dy: 40, at: { x: 420, y: 360 } });
    seen.in = await strip(page, '02-strip-zoom-in', { from: 0.2, to: 0.6, dy: -40, at: { x: 420, y: 360 } });
    for (const [k, s] of [['줄이기', seen.out], ['키우기', seen.in]]) {
      log('멈춘 뒤 움직임(' + k + ') ' + JSON.stringify(s.jump));
      check(k + ': 멈춘 뒤 카드·이름표가 그 자리(1px 안), 배치 그대로', s.jump.card <= 1 && s.jump.bandName <= 1 && s.jump.wsName <= 1 && s.jump.layout[0] === s.jump.layout[1] && s.jump.layout[2] === s.jump.layout[3], s.jump);
      const f = s.frames.map((x) => x.bandName), up = k === '키우기';
      check(k + ': 폴더 이름 화면 크기가 배율과 같은 쪽으로만 바뀐다(키우면 커지기만, 줄이면 작아지기만)', f.every((v, i) => !i || (up ? v >= f[i - 1] - 0.15 : v <= f[i - 1] + 0.15)), f);
    }
    // 2) 배율 세 단계(같은 자리)
    seen.levels = {};
    for (const [tag, k] of [['18', 0.18], ['24', 0.24], ['30', 0.3], ['68', 0.68], ['near', 1]]) {
      for (let i = 0; i < 2; i++) { await page.evaluate(([k]) => { const L = window.__mtTa.lay(), b = L.bands.find((x) => x.id === 'g3'); window.__mtTa.set({ k, x: window.__mtTa.rail + 16 - (b.x || 0) * k, y: window.__mtTa.top + 8 - b.y * k }); }, [k]); await sleep(1600); }
      seen.levels[tag] = await page.evaluate(PROBE, ['g3', 'c:/work/library/.git', 's:lib-1']);
      log(tag + ' ' + JSON.stringify(seen.levels[tag]));
      seen.levels[tag].lfit = await page.evaluate(() => (window.__mtTa.lfit ? window.__mtTa.lfit() : null));
      await shot(page, '03-zoom-' + tag + '-' + Math.round(k * 100));
    }
    const lv = Object.values(seen.levels);
    check('배율 18·24·30·68·100%에서 기둥 폭·줄 머리 폭·띠 높이가 같다', lv.every((x) => x.spine === lv[0].spine && x.headW === lv[0].headW && x.bandH === lv[0].bandH), lv.map((x) => [x.k, x.spine, x.headW, x.bandH]));
    await closeMap(page);
    // 3) 긴 이름: 멀리서 말줄임과 title
    await openMap(page, LONG);
    for (const [tag, k] of [['far', 0.2], ['near', 0.8]]) {
      for (let i = 0; i < 2; i++) { await page.evaluate(([k]) => { const L = window.__mtTa.lay(), b = L.bands[0]; window.__mtTa.set({ k, x: window.__mtTa.rail + 16 - (b.x || 0) * k, y: window.__mtTa.top + 8 - b.y * k }); }, [k]); await sleep(1600); }
      seen['long-' + tag] = await page.evaluate(() => { const fn = document.querySelector('[data-role="ln-band-name"]'), wn = document.querySelector('[data-role="ta-isle-name"]'); const cut = (e) => !!e && e.scrollWidth > e.clientWidth + 1; return { k: window.__mtTa.view().k, band: { cut: cut(fn), title: fn && (fn.title || (fn.closest('[title]') || {}).title || null) }, ws: { cut: cut(wn), title: wn && (wn.title || (wn.closest('[title]') || {}).title || null) } }; });
      log('long ' + tag + ' ' + JSON.stringify(seen['long-' + tag]));
      await shot(page, '04-long-' + tag + '-' + Math.round(k * 100));
    }
    await closeMap(page);
  } finally { await closeApp(app); undo(); }
  fs.writeFileSync(path.join(OUT, 'measure.json'), JSON.stringify(seen, null, 2));
}

// ---- 추적과 rAF 간격 ----
const q = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return Math.round(s[Math.min(s.length - 1, Math.floor(p * s.length))] * 100) / 100; };
const r1 = (v) => Math.round(v * 10) / 10;
async function traced(page, cdp, fn) {
  const events = [];
  const onData = (e) => { for (const x of e.value) events.push(x); };
  cdp.on('Tracing.dataCollected', onData);
  const anim = false;
  await cdp.send('Tracing.start', { traceConfig: { includedCategories: ['devtools.timeline', 'toplevel', 'disabled-by-default-devtools.timeline.frame', ...(anim ? ['blink.animations', 'disabled-by-default-devtools.timeline', 'cc', 'disabled-by-default-devtools.timeline.layers'] : [])], recordMode: 'recordContinuously' }, transferMode: 'ReportEvents' });
  await page.evaluate(() => { const g = window.__p349raf = { gaps: [], last: 0, on: true }; const f = (t) => { if (!g.on) return; if (g.last) g.gaps.push(t - g.last); g.last = t; requestAnimationFrame(f); }; requestAnimationFrame(f); });
  const t0 = Date.now();
  await fn();
  const sec = (Date.now() - t0) / 1000;
  const gaps = await page.evaluate(() => { const g = window.__p349raf; g.on = false; return g.gaps; });
  const done = new Promise((r) => cdp.once('Tracing.tracingComplete', r));
  await cdp.send('Tracing.end'); await done;
  cdp.off('Tracing.dataCollected', onData);
  const names = new Map();
  for (const e of events) if (e.ph === 'M' && e.name === 'thread_name') names.set(`${e.pid}:${e.tid}`, e.args.name);
  const mainKey = [...names.entries()].filter(([, n]) => n === 'CrRendererMain').map(([k]) => k);
  let best = null;
  for (const k of mainKey) { const ms = events.filter((e) => `${e.pid}:${e.tid}` === k && e.ph === 'X' && /RunTask$/.test(e.name)).reduce((a, e) => a + (e.dur || 0), 0); if (!best || ms > best.ms) best = { k, ms }; }
  const onMain = (e) => best && `${e.pid}:${e.tid}` === best.k;
  if (anim) {
    const a = events.filter((e) => /Animation/.test(e.name) && e.args && JSON.stringify(e.args).length > 2).slice(0, 60);
    fs.writeFileSync(path.join(OUT, `anim-${Date.now()}.json`), JSON.stringify(a, null, 1));
  }
  const TASK = new Set(['RunTask', 'ThreadControllerImpl::RunTask']);
  const tasks = events.filter((e) => onMain(e) && e.ph === 'X' && TASK.has(e.name) && e.dur).sort((a, b) => a.ts - b.ts);
  const frames = events.filter((e) => onMain(e) && (e.name === 'BeginMainThreadFrame' || e.name === 'BeginFrame')).map((e) => e.ts).sort((a, b) => a - b);
  const per = [];
  let j = 0;
  for (let i = 1; i < frames.length; i++) {
    let ms = 0;
    while (j < tasks.length && tasks[j].ts < frames[i - 1]) j++;
    for (let k = j; k < tasks.length && tasks[k].ts < frames[i]; k++) ms += tasks[k].dur / 1000;
    per.push(ms);
  }
  const busy = tasks.reduce((a, e) => a + e.dur, 0) / 1000;
  const kinds = {};
  for (const e of events) if (onMain(e) && e.ph === 'X' && e.dur && ['FunctionCall', 'TimerFire', 'FireAnimationFrame', 'UpdateLayoutTree', 'Layout', 'PrePaint', 'Paint', 'Layerize', 'Commit', 'EventDispatch'].includes(e.name)) kinds[e.name] = (kinds[e.name] || 0) + e.dur / 1000;
  for (const k of Object.keys(kinds)) kinds[k] = r1(kinds[k] / sec);
  // GPU·합성 스레드(다른 프로세스)
  const thr = (nm) => { const ks = [...names.entries()].filter(([, n]) => n === nm).map(([k]) => k); return r1(events.filter((e) => ks.includes(`${e.pid}:${e.tid}`) && e.ph === 'X' && TASK.has(e.name) && e.dur).reduce((a, e) => a + e.dur, 0) / 1000 / sec); };
  return {
    sec: r1(sec), raf: { n: gaps.length, fps: r1(gaps.length / sec), avg: gaps.length ? r1(gaps.reduce((a, b) => a + b, 0) / gaps.length) : null, p95: q(gaps, 0.95), p99: q(gaps, 0.99), max: q(gaps, 1), over20: gaps.filter((x) => x > 20).length },
    mainFrames: per.length, perFrame: { p50: q(per, 0.5), p95: q(per, 0.95), max: q(per, 1) }, busyPct: r1(busy / (sec * 10)),
    msPerSec: kinds, gpuMainMsPerSec: thr('CrGpuMain'), vizMsPerSec: thr('VizCompositorThread'), compositorMsPerSec: thr('Compositor'),
  };
}


// 끌기 40걸음(16ms) 뒤 휠 30칸 줄이기·30칸 키우기(30ms)를 SEC초 동안 되풀이. 배율이 약 60%~15%를 오가 이름표 크기가 바뀌는 구간을 지난다
async function moveZoom(page, box) {
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
  const t0 = Date.now();
  while (Date.now() - t0 < SEC * 1000) {
    await page.mouse.move(cx, cy); await page.mouse.down();
    for (let i = 0; i < 40; i++) { await page.mouse.move(cx + Math.sin(i / 6) * 220, cy + Math.cos(i / 7) * 120); await sleep(16); }
    await page.mouse.up();
    for (let i = 0; i < 60; i++) { await page.mouse.wheel(0, i < 30 ? 40 : -40); await sleep(30); }
  }
}

async function perf() {
  const undo = useDist(process.env.P377_DIST);
  const { app, page } = await launch({ log, env: { ...ENV }, args: ['--remote-debugging-port=' + DEBUG, ...AWAKE] });
  const res = { at: new Date().toISOString(), sec: SEC, rounds: ROUNDS, runs: [] };
  try {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await boot(app, page, 1584, 921);
    call('settings.set', { key: 'workLight', value: 'off' });
    await openMap(page, BIG);
    const vb = await page.evaluate(() => { const r = document.querySelector('[data-role=ta-viewport]').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
    const cdp = await page.context().newCDPSession(page);
    for (let round = 1; round <= ROUNDS; round++) {
      await page.evaluate(() => { const L = window.__mtTa.lay(), b = L.bands.find((x) => x.id === 'g3'); const k = 0.6; window.__mtTa.set({ k, x: window.__mtTa.rail + 16 - (b.x || 0) * k, y: window.__mtTa.top + 8 - b.y * k }); }); await sleep(1500);
      const r = await traced(page, cdp, () => moveZoom(page, vb));
      res.runs.push(r);
      log('[#' + round + '] raf ' + JSON.stringify(r.raf) + ' perFrame ' + JSON.stringify(r.perFrame) + ' busy ' + r.busyPct + '% ' + JSON.stringify(r.msPerSec));
      // 멈춘 뒤 한 번 드는 값(고치기 전: 계단 바꾸기와 배치 다시 세기)
      const rs = await traced(page, cdp, () => sleep(1500));
      res.runs.push({ settle: true, ...rs });
      log('[#' + round + ' 멈춘 뒤 1.5초] perFrame ' + JSON.stringify(rs.perFrame) + ' busy ' + rs.busyPct + '% ' + JSON.stringify(rs.msPerSec));
    }
    check('잼이 끝났다', res.runs.length === ROUNDS * 2);
    await closeMap(page);
  } finally { await closeApp(app); undo(); }
  fs.writeFileSync(path.join(OUT, 'perf.json'), JSON.stringify(res, null, 2));
}

async function stopAll() {
  try { if (call('session.list').some((s) => s.name === 'p377-a')) log(atrium('kill', 'p377-a', '--yes')); } catch (e) { log('kill ' + e.message); }
  try { log(atrium('terminal', 'stop', '--yes')); } catch (e) { log('terminal stop ' + e.message); }
  try { log(atrium('backend', 'stop')); } catch (e) { log('backend stop ' + e.message); }
}

try {
  if (WHAT === 'setup') await setup();
  else if (WHAT === 'shots') await shots();
  else if (WHAT === 'perf') await perf();
  else if (WHAT === 'stop') await stopAll();
} catch (e) {
  check('시험이 끝까지 돌았다', false, e.stack || e.message);
} finally {
  fs.writeFileSync(path.join(OUT, 'p377-' + WHAT + '.json'), JSON.stringify({ results }, null, 2));
  const bad = results.filter((r) => !r.ok);
  log('결과 ' + (results.length - bad.length) + '/' + results.length + ' 통과' + (bad.length ? ' 실패: ' + bad.map((b) => b.name).join(', ') : ''));
  process.exit(bad.length ? 1 : 0);
}
