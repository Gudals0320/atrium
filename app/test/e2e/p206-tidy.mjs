// P206 창 시험: (1) 세션 맵 두 열에서 열 사이 선이 열 머리(오늘·이전 이름표 칸)를 지나지 않는다(흉내 그래프, ko).
//   (2) 접힌 열과 손자: 부모(haiku, 1440×810)에 하위 다섯(haiku)이 [첫 열 w1·w2·w3][둘째 열 w4·w5]로 선 뒤 w2가 손자 g1을 띄우면 g1은 둘째 열 x의 빈 칸(w5 아래)에 선다.
//   고친 뒤에는 둘째 열 w5가 제자리다(고치기 전: w5가 손자 아래로 밀림). 같은 열 w3는 예전처럼 w2 나무 아래로 밀린다(P75 규칙).
// 판: 따로 띄운 개발용 판(atrium-dev-p206, 47978, backend/.dev)만. 창 원격 디버깅 포트 9458. 시험 폴더 C:\Workspace\mtask-p206-a(새로 만든다, git 저장소가 아니다: 신뢰 질문 없음).
// 실행: node app/test/e2e/p206-tidy.mjs <map|place|stop> [tag]. place의 tag가 before면 고치기 전 코드(사람이 두 파일을 잠시 되돌린 백엔드)로 본다. 결과 experiments/p206/(저장소 밖).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const WHAT = process.argv[2] || 'map';
const TAG = process.argv[3] || 'after';
if (!['map', 'place', 'stop'].includes(WHAT)) throw new Error('map|place|stop');
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const DEV = path.join(REPO, 'backend', '.dev');
const OUT = path.join(REPO, 'experiments', 'p206');
const CONVOS = path.join(OUT, 'convos');
const DIR = 'C:\\Workspace\\mtask-p206-a';
const BOARD = 'atrium-dev-p206', PORT = '47978', DEBUG = '9458';
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_|HC_)/.test(k)) delete process.env[k];
for (const k of Object.keys(process.env)) if (/^(CLAUDECODE|CLAUDE_CODE_|CLAUDE_EFFORT|CLAUDE_PID|CLAUDE_AGENT_SDK|ELECTRON_RUN_AS_NODE)/.test(k)) delete process.env[k];
const ENV = {
  ATRIUM_TERMINAL_SESSION: BOARD, ATRIUM_HERDR_SESSION: BOARD, ATRIUM_PORT: PORT,
  ATRIUM_DATA_DIR: path.join(DEV, 'data'), ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  ATRIUM_CLAUDE_PROJECTS: CONVOS, ATRIUM_CLAUDE_DESKTOP: 'none', MT_E2E_OUT: 'p206',
};
Object.assign(process.env, ENV);
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(CONVOS, { recursive: true }); fs.mkdirSync(DIR, { recursive: true });
const { logger, sleep, launch, closeApp, shot } = await import('./harness.mjs');
const { assertTestBoard } = await import('./p9-guard.mjs');
assertTestBoard(ENV, { root: DEV });
if (ENV.ATRIUM_PORT !== '47978' || ENV.ATRIUM_TERMINAL_SESSION !== 'atrium-dev-p206') throw new Error('P206 판(atrium-dev-p206, 47978)만');

const log = logger(`p206-${WHAT}-${TAG}`);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 180000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${JSON.stringify(detail).slice(0, 1200)}` : ''}`); };
const sessions = () => call('session.list');
const byName = (n) => sessions().find((s) => s.name === n);
const killAll = () => { for (const s of sessions()) { try { atrium('kill', s.sessionId, '--yes', '--delete'); log('끄기', s.name); } catch (e) { log('끄기 실패', s.name, e.message.slice(0, 160)); } } };
const AWAKE = ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'];
async function awayWin(app) { return app.evaluate(({ BrowserWindow, screen }) => { const w = BrowserWindow.getAllWindows()[0]; if (!w) return null; const ds = screen.getAllDisplays(); const left = Math.min(...ds.map((d) => d.bounds.x)); const b = w.getBounds(); w.setPosition(left - b.width - 200, 40); return w.getBounds(); }).catch((e) => ({ err: e.message })); }
const finish = (name) => { fs.writeFileSync(path.join(OUT, `${name}-results.json`), JSON.stringify(results, null, 2)); const bad = results.filter((r) => !r.ok); log(`결과 ${results.length - bad.length}/${results.length}${bad.length ? ` 실패: ${bad.map((b) => b.name).join(', ')}` : ''}`); return bad.length; };

if (WHAT === 'stop') {
  try { killAll(); } catch (e) { log('목록 실패', e.message.slice(0, 160)); }
  try { log('터미널 멈춤', atrium('terminal', 'stop', '--yes').trim().slice(0, 200)); } catch (e) { log('터미널 멈춤 실패', e.message.slice(0, 200)); }
  try { log('백엔드 멈춤', atrium('backend', 'stop').trim().slice(0, 200)); } catch (e) { log('백엔드 멈춤 실패', e.message.slice(0, 200)); }
  process.exit(0);
}

// ---- (1) 두 열 맵: P202 흉내 모양(지어낸 이름). 오늘 = zeta lab·연구, 나머지는 이전. zl-lead(오늘 열) → zl-helper(이전 열 Course 2) ----
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
  sessions: [
    ['zl-lead', 0, null, 1, 'working'], ['zl-ui', 0, 'zl-lead', 1, 'working'], ['zl-test', 0, 'zl-lead', 0], ['zl-api', 1, null, 0], ['zl-api-2', 1, null, 0],
    ['res-head', 2, null, 1, 'ready'], ['res-read', 2, 'res-head', 0], ['res-notes', 2, 'res-head', 0],
    ['a1-solo', 5, null, 0], ['a2-lead', 3, null, 0], ['a2-kid', 3, 'a2-lead', 0], ['a2-kid2', 3, 'a2-lead', 0], ['a10', 4, null, 0], ['a10-b', 4, null, 0],
    ['c10-lead', 6, null, 0], ['c10-a', 6, 'c10-lead', 0], ['c10-b', 6, 'c10-lead', 0], ['c10-c', 6, 'c10-b', 0],
    ['c2-x', 7, null, 0], ['c2-y', 7, null, 0], ['garam-1', 8, null, 0], ['garam-2', 8, 'garam-1', 0], ['garam-3', 8, 'garam-1', 0], ['garam-4', 8, 'garam-1', 0],
    ['box-1', 9, null, 0], ['zl-helper', 7, 'zl-lead', 0], ['garam-x', 8, 'res-head', 0],
  ],
};
const HOOK = ([shape]) => {
  const api = window.__mt.api, st = window.__mt.getState();
  if (!api.__p206orig) { api.__p206orig = api.call.bind(api); window.__p206st = { workspaces: st.workspaces, groups: st.groups }; }
  const now = Date.now(), mid = new Date(now); mid.setHours(0, 0, 0, 0);
  const todayAt = Math.max(mid.getTime() + 1000, now - 60e3), oldAt = now - 3 * 86400e3;
  const nameOf = (root) => root.split('/').filter(Boolean).pop();
  st.workspaces = [...shape.workspaces.map((w, i) => ({ key: w.key, name: nameOf(w.root), kind: 'repo', root: w.root, createdAt: 1e12 + i, counts: {}, worktrees: [] })), ...(window.__p206st.workspaces || [])];
  st.groups = shape.folders.map((f) => ({ id: f.id, name: f.name, members: [...f.members] }));
  const nodes = shape.sessions.map(([name, wi, parent, today, state], i) => ({ id: `s:${name}`, kind: 'session', sessionId: `fk-${name}`, name, agentKind: 'claude', state: state || 'sleeping', category: state === 'working' ? 'working' : 'idle', workspaceKey: shape.workspaces[wi].key,
    parentId: parent ? `s:${parent}` : null, lineageParent: parent ? `s:${parent}` : null, peers: [], createdAt: 1e12 + i, model: 'claude-opus-5-5', effort: 'high', activeAt: today ? todayAt : oldAt, turnAt: state === 'working' ? todayAt : null, lastPrompt: ['Merge the workers', 'Draft the notes', 'Collect the tables', 'Review the parser diff'][i % 4] }));
  const edges = shape.sessions.filter((s) => s[2]).map(([name, , parent]) => ({ from: `s:${parent}`, to: `s:${name}`, kind: 'spawn', count: 2, lastAt: now - 6e5 }));
  api.call = async (m, p) => (m === 'mission.graph' ? { nodes: [{ id: 'human', kind: 'human', name: 'you' }, ...nodes], edges, counts: { all: nodes.length }, at: now } : api.__p206orig(m, p));
};
const UNHOOK = () => { const api = window.__mt.api; if (api.__p206orig) { api.call = api.__p206orig; const st = window.__mt.getState(); st.workspaces = window.__p206st.workspaces; st.groups = window.__p206st.groups; } };
// 열 사이 선과 열 머리: 판 좌표에서 선 토막이 머리 칸(과 그 위)을 지나는지, 화면에서 선 요소가 머리 이름표 사각형과 겹치는지
const READ = () => {
  const L = window.__mtTa.lay();
  const heads = L.sections.filter((s) => s.mode === 'head');
  const headH = heads.length ? Math.max(...heads.map((s) => s.y + s.h)) : 0;
  const cross = L.edges.filter((e) => { const a = L.cards.get(e.from), b = L.cards.get(e.to); return a && b && (a.x < L.colDx) !== (b.x < L.colDx); });
  const hits = cross.filter((e) => e.pts.slice(1).some(([bx, by], i) => Math.min(by, e.pts[i][1]) < headH));
  const secEls = [...document.querySelectorAll('[data-role=ln-section]')].map((el) => el.getBoundingClientRect());
  const domHits = [];
  for (const e of cross) {
    const el = document.querySelector(`[data-role=ta-edge][data-from="${CSS.escape(e.from)}"][data-to="${CSS.escape(e.to)}"]`);
    if (!el) { domHits.push({ id: e.id, missing: true }); continue; }
    const len = el.getTotalLength ? el.getTotalLength() : 0, m = el.getScreenCTM();
    for (let t = 0; t <= len; t += 6) { const p = el.getPointAtLength(t), x = m.a * p.x + m.c * p.y + m.e, y = m.b * p.x + m.d * p.y + m.f; if (secEls.some((r) => x > r.left && x < r.right && y > r.top && y < r.bottom)) { domHits.push({ id: e.id, x, y }); break; } }
  }
  return { ncol: L.ncol, headH, cross: cross.map((e) => ({ id: e.id, pts: e.pts })), hits: hits.map((e) => e.id), domHits, secs: secEls.length };
};

async function map() {
  try { sessions(); } catch { log('백엔드 띄움', atrium('backend', 'start').trim().slice(-200)); await sleep(1500); }
  if (!byName('p206-a')) log(atrium('--json', 'spawn', DIR, '--kind', 'shell', '--name', 'p206-a').slice(0, 160));
  await sleep(1500);
  call('settings.set', { key: 'missionStyle', value: 'territories' });
  call('settings.set', { key: 'language', value: 'ko' });
  const { app, page } = await launch({ log, env: { ...ENV }, args: [`--remote-debugging-port=${DEBUG}`, ...AWAKE] });
  try {
    await awayWin(app);
    await page.evaluate(HOOK, [SHAPE]);
    await page.setViewportSize({ width: 2200, height: 1000 }).catch(() => {});
    await sleep(800);
    await page.click('[data-action="mission-rail"]');
    await page.waitForSelector('[data-role="mission"] .mt-ta-card', { timeout: 20000 });
    await sleep(1500);
    await page.evaluate(() => window.__mtTa.fit()); await sleep(900);
    const r = await page.evaluate(READ);
    check('[ko] 넓은 창은 두 열, 열 머리 이름표 둘', r.ncol === 2 && r.secs === 2, r);
    check('[ko] 열 사이 선이 있다(둘 이상)', r.cross.length >= 2, r.cross.map((c) => c.id));
    check('[ko] 열 사이 선이 머리 칸(과 그 위)을 지나지 않는다(판 좌표)', r.hits.length === 0, { hits: r.hits, headH: r.headH, cross: r.cross });
    check('[ko] 화면에서 선이 머리 이름표와 겹치지 않는다', r.domHits.length === 0, r.domHits);
    await shot(page, 'map-two-ko', log);
    // 왼쪽 위(머리 칸과 선이 열 사이를 건너는 곳) 가까이
    await page.evaluate(() => { const L = window.__mtTa.lay(); window.__mtTa.set({ k: 0.42, x: 40 - 0 * 0.42, y: 40 }); }); await sleep(800);
    await shot(page, 'map-two-ko-top', log);
    await page.evaluate(UNHOOK);
  } catch (e) { check('예외', false, e.stack); }
  finally { await closeApp(app); }
  return finish(`map-${TAG}`);
}

// ---- (2) 접힌 열과 손자 ----
const tokenOf = async (aId) => {
  const { DatabaseSync } = await import('node:sqlite');
  const crypto = await import('node:crypto');
  const db = new DatabaseSync(path.join(DEV, 'data', 'board.db'), { readOnly: true });
  const api = JSON.parse(db.prepare("SELECT value FROM meta WHERE key = 'apiToken'").get().value); db.close();
  return crypto.createHmac('sha256', api).update(`branch:${aId}`).digest('hex');
};
const asAgent = (id, tok, ...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium-child.mjs'), ...a], { encoding: 'utf8', env: { ...process.env, ATRIUM_PROFILE: 'dev', ATRIUM_SESSION_ID: id, ATRIUM_SESSION_TOKEN: tok }, timeout: 240000 });
const nodes = () => Object.fromEntries(call('board.get').nodes.map((n) => [n.session_id, { x: n.x, y: n.y, w: n.w, h: n.h }]));
const waitReady = async (name) => {
  for (const t0 = Date.now(); ;) {
    const st = (byName(name) || {}).state;
    if (st === 'trust_wait') { fs.writeFileSync(path.join(DEV, 'p206-need-trust.txt'), `trust question on ${DIR}\n`); throw new Error('신뢰 질문'); }
    if (st === 'ready') return;
    if (Date.now() - t0 > 150000) throw new Error(`${name} 준비 안 됨: ${st}`);
    await sleep(1000);
  }
};
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

async function place() {
  // 백엔드는 단계마다 새로 띄운다(고치기 전·뒤 코드가 다르다)
  try { sessions(); killAll(); log('백엔드 멈춤', atrium('backend', 'stop').trim().slice(0, 200)); await sleep(1000); } catch {}
  log('백엔드 띄움', atrium('backend', 'start').trim().slice(-200)); await sleep(1500);
  const L = call('session.spawn', { cwd: DIR, name: 'p206-lead', kind: 'claude', model: 'haiku' });
  const TOK = await tokenOf(L.sessionId);
  await waitReady('p206-lead');
  for (const n of ['p206-w1', 'p206-w2', 'p206-w3', 'p206-w4', 'p206-w5']) { log(n, asAgent(L.sessionId, TOK, 'child', n, '--model', 'haiku', '--no-wait').trim().slice(0, 200)); await sleep(800); }
  const id = (n) => byName(n).sessionId;
  const before = nodes();
  const pos = (N) => Object.fromEntries(['p206-lead', 'p206-w1', 'p206-w2', 'p206-w3', 'p206-w4', 'p206-w5', 'p206-g1'].filter((n) => byName(n)).map((n) => [n.replace('p206-', ''), N[id(n)]]));
  const b0 = pos(before);
  log('손자 전', b0);
  check('하위 다섯이 두 열로 접혔다([w1·w2·w3][w4·w5])', b0.w1.x === b0.w2.x && b0.w2.x === b0.w3.x && b0.w4.x === b0.w5.x && b0.w4.x > b0.w1.x && b0.w4.y === b0.w1.y && b0.w5.y === b0.w2.y, b0);
  const { app, page } = await launch({ log, env: ENV, args: [`--remote-debugging-port=${DEBUG}`, ...AWAKE] });
  try {
    await awayWin(app);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1584, 921));
    await sleep(800);
    await page.evaluate(() => window.__mt.getState().fitAll && window.__mt.getState().fitAll(0));
    await sleep(1500);
    await shot(page, `grand-${TAG}-1-before-g1`, log);
    await waitReady('p206-w2');
    const T2 = await tokenOf(id('p206-w2'));
    log('g1', asAgent(id('p206-w2'), T2, 'child', 'p206-g1', '--model', 'haiku', '--no-wait').trim().slice(0, 200));
    await sleep(1500);
    const after = nodes();
    const a0 = pos(after);
    log('손자 뒤', a0);
    fs.writeFileSync(path.join(OUT, `grand-${TAG}.json`), JSON.stringify({ before: b0, after: a0 }, null, 2));
    check('손자 g1은 w2 오른쪽 열(둘째 열과 같은 x)', a0.g1.x === a0.w2.x + a0.w2.w + 200 && a0.g1.x === a0.w5.x && a0.g1.y >= b0.w5.y + b0.w5.h, a0.g1);
    if (TAG === 'before') check('(고치기 전) 둘째 열 w5가 손자 아래로 밀렸다', a0.w5.y > b0.w5.y, { w5: [b0.w5, a0.w5] });
    else {
      check('둘째 열 w4·w5는 제자리(밀리지 않음)', JSON.stringify([a0.w4, a0.w5]) === JSON.stringify([b0.w4, b0.w5]), { w5: [b0.w5, a0.w5] });
      check('같은 열 w3는 w2 나무(손자) 아래로(P75 규칙 그대로)', a0.w3.x === b0.w3.x && a0.w3.y === a0.g1.y + a0.g1.h + 80, { w3: [b0.w3, a0.w3] });
      check('부모·w1·w2는 그대로', ['lead', 'w1', 'w2'].every((k) => JSON.stringify(a0[k]) === JSON.stringify(b0[k])));
    }
    const all = Object.values(after);
    check('노드가 겹치지 않는다', all.every((a, i) => all.every((b, j) => i >= j || !overlap(a, b))));
    await page.evaluate(() => window.__mt.getState().fitAll && window.__mt.getState().fitAll(0));
    await sleep(1500);
    await shot(page, `grand-${TAG}-2-after-g1`, log);
  } catch (e) { check('예외', false, e.stack); }
  finally { await closeApp(app); }
  return finish(`place-${TAG}`);
}

let bad = 0;
try { bad = WHAT === 'map' ? await map() : await place(); } catch (e) { check('시험이 끝까지 돌았다', false, e.stack || e.message); bad = finish(`${WHAT}-${TAG}`); }
process.exit(bad ? 1 : 0);
