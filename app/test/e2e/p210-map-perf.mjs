// P210 창 시험: 세션 맵(PC) 성능 재기. 개발용 판(atrium-dev-p210, 47984, 창 원격 디버깅 9464, backend/.dev)만. 한 번에 창 하나.
// - 판: 셸 세션 몇 개(p210-sh*, 시험 폴더 C:\Workspace\mtask-p210-a)가 계속 글을 찍는다(덮개 뒤 판·터미널 일).
// - 세션 맵: 페이지 안에서 mission.graph 답을 흉내(지어낸 이름: 폴더 3, 워크스페이스 10, 세션 33, 하위·동료)로 바꾸고,
//   흉내 세션의 session.updated를 초당 CHURN_HZ번 넣는다(일하는 세션의 활동 시각·턴, 1.5초마다 하나는 일함↔쉼).
//   흉내 답을 줄 때 판의 실제 mission.graph도 한 번 불러 왕복 시간을 잰다(백엔드 시간).
// - 재는 것(움직임 줄이기 reduce): 세션 맵 (가) 가만히 (나) 끌기·휠, 판 (다) 가만히 (라) 끌기·휠. CDP 추적의 프레임당 주 스레드 시간(중간값·p95),
//   긴 작업(50ms 넘는 작업) 수, 초당 배치 셈·mission.graph 호출·카드 그리기(window.__mapStats).
// 실행: sh backend/.dev/clean-env.sh node app/test/e2e/p210-map-perf.mjs <setup|perf|stop> [tag]   결과: experiments/p210/<tag>/(저장소 밖)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const WHAT = process.argv[2] || 'perf';
const TAG = process.argv[3] || 'run';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const DEV = path.join(REPO, 'backend', '.dev');
const OUT = path.join(REPO, 'experiments', 'p210', TAG);
const DIR = process.env.P210_DIR || 'C:\\Workspace\\mtask-p210-a';
const BOARD = 'atrium-dev-p210', PORT = '47984', DEBUG = '9464';
const SEC = Number(process.env.P210_SEC || 8), CHURN_HZ = Number(process.env.P210_HZ || 8), SHELLS = Number(process.env.P210_SHELLS || 4);
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_|HC_)/.test(k)) delete process.env[k];
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
const ENV = {
  ATRIUM_TERMINAL_SESSION: BOARD, ATRIUM_HERDR_SESSION: BOARD, ATRIUM_PORT: PORT,
  ATRIUM_DATA_DIR: path.join(DEV, 'data'), ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  ATRIUM_CLAUDE_PROJECTS: path.join(DEV, 'no-projects'), ATRIUM_CLAUDE_DESKTOP: 'none', ATRIUM_TEST_PREFIX: 'p210-none-',
};
Object.assign(process.env, ENV);
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(ENV.ATRIUM_CLAUDE_PROJECTS, { recursive: true });
const { logger, sleep, launch, closeApp } = await import('./harness.mjs');
const { assertTestBoard } = await import('./p9-guard.mjs');
assertTestBoard(ENV, { root: DEV });
const log = logger(`p210-${WHAT}-${TAG}`);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 120000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 1600)}` : ''}`); };
const AWAKE = ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'];

// ---- 흉내 그래프(지어낸 이름) ----
const FOLDERS = [
  { id: 'g1', name: 'Market', members: ['d:/work/market/web', 'd:/work/market/quant/.git'] },
  { id: 'g2', name: 'Hub', members: ['d:/hub/core/.git', 'd:/hub/rig/.git'] },
  { id: 'g3', name: 'Campus', members: ['c:/work/library/.git', 'd:/work/campus/pbl/.git', 'd:/work/campus/exam/.git'] },
];
const WS = ['c:/work/atrium/.git', 'd:/work/market/web', 'd:/work/market/quant/.git', 'd:/hub/core/.git', 'd:/hub/rig/.git', 'c:/work/library/.git', 'd:/work/campus/pbl/.git', 'd:/work/campus/exam/.git', 'c:/work/notes/.git', 'd:/work/garden/.git'];
// [id, name, ws, state, parent, peerOf]
const S = [
  ['conductor', 'conductor', 0, 'working'], ['old-1', 'atrium-old', 0, 'sleeping'],
  ['m1', 'm1', 1, 'idle'], ['res', 'researcher', 2, 'working', 'm1'], ['cf', 'coin-feed', 2, 'working', 'res'], ['ls', 'level-sets', 2, 'working', 'res'], ['ss', 'signal-scan', 2, 'idle', 'res'], ['bm', 'band-model', 2, 'sleeping', 'res'],
  ['hub', 'hub-head', 3, 'working'], ['hub-p', 'hub-peer', 3, 'idle', null, 'hub'], ['hub-w', 'hub-worker', 3, 'working', 'hub'],
  ['lib', 'lib-1', 5, 'idle'], ['scribe', 'scribe', 5, 'working', 'lib'],
  ['deck', 'deck-lead', 6, 'working'], ['dw', 'deck-writer', 6, 'working', 'deck'], ['dr', 'deck-reader', 6, 'idle', 'dw'], ['dr2', 'deck-reader-2', 6, 'sleeping', 'dw'],
  ['exam', 'exam-lead', 7, 'working'], ['e1', 'ex-set-01', 7, 'working', 'exam'], ['e2', 'ex-set-02', 7, 'working', 'exam'], ['e3', 'ex-set-03', 7, 'idle', 'exam'], ['e4', 'ex-qa-a', 7, 'sleeping', 'exam'], ['e5', 'ex-qa-b', 7, 'waiting', 'exam'],
  ['notes', 'notes-2', 8, 'idle'], ['rev', 'reviewer', 8, 'error'], ['g', 'g1', 9, 'idle'], ['media', 'media', 9, 'working', 'g'],
];
const RIGS = [['s-main', 'main', 'main', 'idle'], ['s-mgr', 'manager', 'manager', 'working'], ['s-w1', 'worker-1', 'worker', 'idle', 's-main'], ['s-w2', 'worker-2', 'worker', 'working', 's-main'], ['s-r1', 'reviewer-1', 'reviewer', 'sleeping', 's-main'], ['s-d1', 'docs-1', 'docs', 'working', 's-main']];
function mockGraph() {
  const now = Date.now(), base = now - 3 * 3600 * 1000;
  const T = (x) => (x == null ? x : base + Number(x) * 1000);
  const prompts = ['Merge the workers and run the release check', 'Draft the slide notes for the second section', 'Collect the source tables', 'Review the parser diff and report back'];
  const node = (sid, name, ws, state, parent, peer, i, seat) => ({ id: `s:fk-${sid}`, kind: 'session', sessionId: `fk-${sid}`, name, agentKind: 'claude', state, category: state === 'working' ? 'working' : state === 'waiting' || state === 'error' ? 'needs_you' : 'idle', workspaceKey: ws,
    parentId: parent ? `s:fk-${parent}` : null, lineageParent: parent ? `s:fk-${parent}` : null, peers: peer ? [`s:fk-${peer}`] : [], createdAt: base + i * 1000, model: 'claude-opus-5-5', effort: 'high',
    lastPrompt: prompts[i % 4], activeAt: now - i * 60000, turnAt: state === 'working' ? now - i * 30000 : null, ask: state === 'waiting' ? 'Allow npm ci in the worktree?' : null, error: state === 'error' ? 'API Error: 529 overloaded' : null, rigSeat: seat || null, closedKids: 0, assignAt: null, parentClosed: false, background: null });
  const nodes = S.map((s, i) => node(s[0], s[1], WS[s[2]], s[3], s[4], s[5], i));
  for (const s of S) if (s[5]) { const p = nodes.find((n) => n.sessionId === `fk-${s[5]}`); p.peers.push(`s:fk-${s[0]}`); }
  RIGS.forEach((s, i) => nodes.push(node(s[0], s[1], WS[4], s[3], s[4], null, 40 + i, s[2])));
  const edges = [];
  for (const n of nodes) if (n.parentId) { edges.push({ from: n.parentId, to: n.id, kind: 'spawn', count: 0, relation: 'sub' }); edges.push({ from: n.parentId, to: n.id, kind: 'role', label: 'worker', count: 3, relation: 'sub' }); }
  for (const s of S) if (s[5]) edges.push({ from: `s:fk-${s[5]}`, to: `s:fk-${s[0]}`, kind: 'relation', relation: 'peer', relationSource: 'user', count: 0 });
  return { nodes: [{ id: 'human', kind: 'human', name: 'you' }, ...nodes], edges, counts: { all: nodes.length }, at: now };
}

// ---- 페이지 안: 흉내 답, 폴더·워크스페이스, 흉내 세션 갱신 ----
const HOOK = ([g, folders, wsKeys]) => {
  const api = window.__mt.api, st = window.__mt.getState();
  if (!api.__p210orig) { api.__p210orig = api.call.bind(api); window.__p210st = { workspaces: st.workspaces, groups: st.groups }; }
  st.workspaces = [...wsKeys.map((k, i) => ({ key: k, name: k.replace(/\/\.git$/, '').split('/').pop(), kind: 'repo', root: k.replace(/\/\.git$/, ''), createdAt: 1e12 + i, counts: {}, worktrees: [] })), ...(window.__p210st.workspaces || [])];
  st.groups = folders.map((f) => ({ id: f.id, name: f.name, members: [...f.members] }));
  window.__p210 = { calls: 0, realMs: [] };
  api.call = async (m, p) => {
    if (m !== 'mission.graph') return api.__p210orig(m, p);
    window.__p210.calls++;
    const t0 = performance.now();
    await api.__p210orig('mission.graph').catch(() => null); // 판의 실제 그래프 왕복(백엔드 시간)
    window.__p210.realMs.push(performance.now() - t0);
    return JSON.parse(JSON.stringify(g));
  };
  // 흉내 세션(판 요약 모양)을 판 세션 표에 넣는다
  const now = Date.now();
  window.__p210sum = new Map();
  for (const n of g.nodes) if (n.kind === 'session') {
    const sum = { sessionId: n.sessionId, name: n.name, kind: 'claude', state: n.state === 'idle' ? 'ready' : n.state, workspaceKey: n.workspaceKey, lastActivityAt: now - 60000, createdAt: n.createdAt, model: n.model, effort: n.effort, lastPrompt: n.lastPrompt, turn: n.state === 'working' ? { startedAt: now - 30000 } : null, ask: n.ask ? { kind: 'permission', summary: n.ask } : null, rigSeat: n.rigSeat };
    window.__p210sum.set(n.sessionId, sum);
    api.emit('session.updated', sum);
  }
};
const CHURN = ([hz]) => {
  const api = window.__mt.api;
  clearInterval(window.__p210churn);
  let i = 0;
  const ids = [...window.__p210sum.keys()];
  window.__p210churn = setInterval(() => {
    i++;
    const now = Date.now();
    // 일하는 세션 하나의 활동 시각·턴 바뀜(상태는 그대로)
    const work = ids.filter((id) => window.__p210sum.get(id).state === 'working');
    const id = work[i % Math.max(1, work.length)];
    if (id) { const s = { ...window.__p210sum.get(id), lastActivityAt: now, turn: { startedAt: window.__p210sum.get(id).turn ? window.__p210sum.get(id).turn.startedAt : now, tokens: i } }; window.__p210sum.set(id, s); api.emit('session.updated', s); }
    // 1.5초마다 하나는 일함 ↔ 쉼(등급이 바뀐다)
    if (i % Math.max(1, Math.round(hz * 1.5)) === 0) { const fid = ids[(i / Math.round(hz * 1.5)) % ids.length | 0]; const o = window.__p210sum.get(fid); if (o && (o.state === 'working' || o.state === 'ready')) { const s = { ...o, state: o.state === 'working' ? 'ready' : 'working', turn: o.state === 'working' ? null : { startedAt: now }, lastActivityAt: now }; window.__p210sum.set(fid, s); api.emit('session.updated', s); } }
  }, 1000 / hz);
};
const UNCHURN = () => clearInterval(window.__p210churn);

// ---- CDP 추적: 프레임당 주 스레드 시간 ----
const cpuOf = (app) => app.evaluate(({ app: a }) => { const o = {}; for (const m of a.getAppMetrics()) o[m.type] = (o[m.type] || 0) + (m.cpu.cumulativeCPUUsage || 0); return o; }).catch(() => ({}));
async function traced(page, cdp, fn, app = null) {
  const events = [];
  const onData = (e) => { for (const x of e.value) events.push(x); };
  cdp.on('Tracing.dataCollected', onData);
  await cdp.send('Tracing.start', { traceConfig: { includedCategories: ['devtools.timeline', 'toplevel', 'disabled-by-default-devtools.timeline.frame', ...(process.env.P210_ANIM ? ['blink.animations', 'disabled-by-default-devtools.timeline'] : [])], recordMode: 'recordContinuously' }, transferMode: 'ReportEvents' });
  const s0 = await page.evaluate(() => ({ ...window.__mapStats, calls: window.__p210 ? window.__p210.calls : 0, real: window.__p210 ? window.__p210.realMs.length : 0 }));
  const c0 = app ? await cpuOf(app) : {};
  const t0 = Date.now();
  await fn();
  const sec = (Date.now() - t0) / 1000;
  const c1 = app ? await cpuOf(app) : {};
  const cpu = {}; for (const k of Object.keys(c1)) cpu[k] = Math.round(((c1[k] - (c0[k] || 0)) / sec) * 1000) / 10; // 초당 CPU %(한 코어)
  const s1 = await page.evaluate(() => ({ ...window.__mapStats, calls: window.__p210 ? window.__p210.calls : 0, real: window.__p210 ? window.__p210.realMs.length : 0 }));
  const realMs = await page.evaluate((n) => (window.__p210 ? window.__p210.realMs.slice(n) : []), s0.real);
  const done = new Promise((r) => cdp.once('Tracing.tracingComplete', r));
  await cdp.send('Tracing.end'); await done;
  cdp.off('Tracing.dataCollected', onData);
  // 주 스레드
  const names = new Map();
  for (const e of events) if (e.ph === 'M' && e.name === 'thread_name') names.set(`${e.pid}:${e.tid}`, e.args.name);
  const mainKey = [...names.entries()].filter(([, n]) => n === 'CrRendererMain').map(([k]) => k);
  // 렌더러가 여럿이면 가장 바쁜 것
  let best = null;
  for (const k of mainKey) { const ms = events.filter((e) => `${e.pid}:${e.tid}` === k && e.ph === 'X' && /RunTask$/.test(e.name)).reduce((a, e) => a + (e.dur || 0), 0); if (!best || ms > best.ms) best = { k, ms }; }
  const onMain = (e) => best && `${e.pid}:${e.tid}` === best.k;
  if (process.env.P210_ANIM) fs.writeFileSync(path.join(OUT, 'anim.json'), JSON.stringify(events.filter((e) => e.name === 'Animation' && e.args && JSON.stringify(e.args).length > 2).slice(0, 40), null, 1));
  if (process.env.P210_NAMES) { const by = {}; for (const e of events) if (onMain(e)) by[`${e.ph}:${e.name}`] = (by[`${e.ph}:${e.name}`] || 0) + 1; fs.writeFileSync(path.join(OUT, 'names.json'), JSON.stringify(Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 80), null, 1)); }
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
  const q = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return Math.round(s[Math.min(s.length - 1, Math.floor(p * s.length))] * 100) / 100; };
  const busy = tasks.reduce((a, e) => a + e.dur, 0) / 1000;
  // 종류별 시간(겹친 이벤트라 합이 바쁨보다 크다, 견주기용)
  const kinds = {};
  for (const e of events) if (onMain(e) && e.ph === 'X' && e.dur && ['FunctionCall', 'TimerFire', 'FireAnimationFrame', 'UpdateLayoutTree', 'Layout', 'PrePaint', 'Paint', 'Layerize', 'EventDispatch', 'IntersectionObserverController::computeIntersections', 'V8.GC_MC_INCREMENTAL', 'MinorGC', 'Receive mojo message'].includes(e.name)) kinds[e.name] = (kinds[e.name] || 0) + e.dur / 1000;
  for (const k of Object.keys(kinds)) kinds[k] = Math.round(kinds[k] / sec * 10) / 10; // 초당 ms
  const r1 = (v) => Math.round(v * 10) / 10;
  return {
    sec: r1(sec), frames: per.length, fps: r1(per.length / sec), perFrame: { p50: q(per, 0.5), p95: q(per, 0.95), max: q(per, 1) }, busyPct: r1(busy / (sec * 10)),
    longTasks: tasks.filter((e) => e.dur > 50000).length, longMs: r1(tasks.filter((e) => e.dur > 50000).reduce((a, e) => a + e.dur, 0) / 1000),
    layoutPerSec: r1((s1.layout - s0.layout) / sec), layoutMs: r1((s1.layoutMs - s0.layoutMs) / Math.max(1, s1.layout - s0.layout)),
    graphPerSec: r1((s1.calls - s0.calls) / sec), graphRealMs: q(realMs, 0.5), graphRealMax: q(realMs, 1),
    cardsPerSec: r1((s1.cards - s0.cards) / sec),
    kindsMsPerSec: kinds, cpuPct: cpu,
  };
}

async function closeMission(pg) { for (let i = 0; i < 3 && (await pg.$('[data-role="mission"]')); i++) { await pg.keyboard.press('Escape'); await sleep(400); } }
async function openMission(pg) {
  if (await pg.$('[data-action="return-close"]')) { await pg.click('[data-action="return-close"]').catch(() => {}); await sleep(300); }
  await closeMission(pg);
  await pg.click('[data-action="mission-rail"]');
  await pg.waitForSelector('[data-role="mission"] .mt-ta-card', { timeout: 20000 });
  await sleep(1500);
}
async function moveAround(page, box) {
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
  const t0 = Date.now();
  while (Date.now() - t0 < SEC * 1000) {
    await page.mouse.move(cx, cy); await page.mouse.down();
    for (let i = 0; i < 40; i++) { await page.mouse.move(cx + Math.sin(i / 6) * 220, cy + Math.cos(i / 7) * 120); await sleep(16); if (i === 20 && !moveAround.seen) moveAround.seen = await page.evaluate(() => ({ moving: document.querySelector('[data-role=mission]') ? document.querySelector('[data-role=mission]').dataset.moving || null : null, run: document.getAnimations().filter((a) => a.playState === 'running').length, paused: document.getAnimations().filter((a) => a.playState === 'paused').length })); }
    await page.mouse.up();
    for (let i = 0; i < 20; i++) { await page.mouse.wheel(0, i % 10 < 5 ? -60 : 60); await sleep(30); }
  }
}

async function setupBoard() {
  fs.mkdirSync(DIR, { recursive: true });
  log(atrium('backend', 'start').trim().slice(0, 300));
  const have = new Set(call('session.list').map((s) => s.name));
  for (let i = 1; i <= SHELLS; i++) {
    const nm = `p210-sh${i}`;
    if (!have.has(nm)) log(atrium('--json', 'spawn', DIR, '--kind', 'shell', '--name', nm).slice(0, 160));
  }
  await sleep(4000);
  for (let i = 1; i <= SHELLS; i++) { try { atrium('input', `p210-sh${i}`, 'while ($true) { Get-Date -Format o; Start-Sleep -Milliseconds 150 }\r'); } catch (e) { log(`input ${e.message.slice(0, 120)}`); } }
  log(atrium('ls'));
}

async function perf() {
  const { app, page } = await launch({ log, env: { ...ENV }, args: [`--remote-debugging-port=${DEBUG}`, ...AWAKE] });
  const res = { at: new Date().toISOString(), sec: SEC, hz: CHURN_HZ, shells: SHELLS, light: process.env.P210_LIGHT || 'on' };
  call('settings.set', { key: 'workLight', value: process.env.P210_LIGHT || 'on' });
  try {
    await app.evaluate(({ BrowserWindow, screen }) => { const w = BrowserWindow.getAllWindows()[0]; const left = Math.min(...screen.getAllDisplays().map((d) => d.bounds.x)); const b = w.getBounds(); w.setPosition(left - b.width - 200, 40); }).catch(() => {});
    await page.setViewportSize({ width: 1584, height: 921 }).catch(() => {});
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await sleep(3000);
    if (await page.$('[data-role="sidebar"]')) { await page.click('[data-action="sidebar"]'); await sleep(500); }
    const cdp = await page.context().newCDPSession(page);
    const g = mockGraph();
    await page.evaluate(HOOK, [g, FOLDERS, WS]);
    await page.evaluate(CHURN, [CHURN_HZ]);
    await sleep(1000);
    // 판(덮개 없음)
    const cv = await page.evaluate(() => { const r = document.querySelector('.mt-canvas').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
    res.boardIdle = await traced(page, cdp, () => sleep(SEC * 1000), app); log(`[board idle] ${JSON.stringify(res.boardIdle)}`);
    res.boardMove = await traced(page, cdp, () => moveAround(page, cv), app); log(`[board move] ${JSON.stringify(res.boardMove)}`);
    // 세션 맵
    if (process.env.P210_BOARDCSS) await page.addStyleTag({ content: process.env.P210_BOARDCSS }); // 실험: 덮개 뒤 판 숨기기
    await openMission(page);
    const n = await page.evaluate(() => window.__mtTa.lay().cards.size);
    check('세션 맵 배치의 카드 수(흉내 세션 전부)', n === g.nodes.length - 1, { n, want: g.nodes.length - 1 });
    const vb = await page.evaluate(() => { const r = document.querySelector('[data-role=ta-viewport]').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
    res.mapIdle = await traced(page, cdp, () => sleep(SEC * 1000), app); log(`[map idle] ${JSON.stringify(res.mapIdle)}`);
    moveAround.seen = null;
    res.mapMove = await traced(page, cdp, () => moveAround(page, vb), app); res.mapMove.anim = moveAround.seen; log(`[map move] ${JSON.stringify(res.mapMove)}`);
    // 갱신 없이(바닥 값)
    await page.evaluate(UNCHURN); await sleep(800);
    res.mapQuiet = await traced(page, cdp, () => sleep(Math.min(5, SEC) * 1000), app); log(`[map quiet] ${JSON.stringify(res.mapQuiet)}`);
    await closeMission(page);
    check('재기를 끝까지 돌았다', true);
  } finally { await closeApp(app); }
  fs.writeFileSync(path.join(OUT, 'p210-numbers.json'), JSON.stringify(res, null, 2));
}

async function stopBoard() {
  for (const s of call('session.list').filter((x) => /^p210-/.test(x.name))) { try { atrium('kill', s.name, '--yes'); } catch (e) { log(`kill ${s.name} ${e.message.slice(0, 100)}`); } }
  await sleep(2000);
  try { log(atrium('terminal', 'stop', '--yes').slice(0, 200)); } catch (e) { log(`terminal stop ${e.message.slice(0, 120)}`); }
  try { log(atrium('backend', 'stop').slice(0, 200)); } catch (e) { log(`backend stop ${e.message.slice(0, 120)}`); }
}

try {
  if (WHAT === 'setup') await setupBoard();
  else if (WHAT === 'perf') await perf();
  else if (WHAT === 'stop') await stopBoard();
} catch (e) {
  check('시험이 끝까지 돌았다', false, e.stack || e.message);
} finally {
  fs.writeFileSync(path.join(OUT, `p210-${WHAT}.json`), JSON.stringify({ results }, null, 2));
  const bad = results.filter((r) => !r.ok);
  log(`결과 ${results.length - bad.length}/${results.length} 통과${bad.length ? ` 실패: ${bad.map((b) => b.name).join(', ')}` : ''}`);
  process.exit(bad.length ? 1 : 0);
}
