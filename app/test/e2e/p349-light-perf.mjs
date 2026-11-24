// P349 창 시험: 작업 중 빛(세션 맵 카드 .mt-mm-light, 판 노드 둘레 .mt-node-run)이 움직이는 동안 드는 값을 잰다.
// 개발용 판(atrium-dev-p349, 48096, 창 원격 디버깅 9577, backend/.dev)만. 한 번에 창 하나.
// - 세션 맵: 페이지 안에서 mission.graph 답을 흉내(지어낸 이름, 세션 36: 일하는 카드 W개, 나머지 쉼·잠듦·응답 필요)로 바꾼다(p210-map-perf.mjs와 같은 방법).
// - 판(캔버스): 시험 폴더에 셸 SHELLS개를 띄우고 창 안에서 그 세션을 일함으로 흉내(session.updated)낸다. 판 전체가 보이게(둘레가 도는 얼굴).
// - 재는 것(움직임 줄이기 reduce, 빛 켬 / 끔): 끌기·휠 동안 rAF 간격(평균·p95·최대)·fps, CDP 추적의 스타일·레이아웃·페인트·Layerize ms/초, 프레임당 주 스레드 p95.
// 실행: node app/test/e2e/p349-light-perf.mjs <setup|perf|stop> [tag]   결과: experiments/p349/<tag>/(저장소 밖)
//   P349_W=10,20 (일하는 카드 수들)  P349_SEC=6  P349_ROUNDS=2  P349_CANVAS=1  P349_ANIM=1(빛 애니메이션의 합성 실패 까닭을 적는다)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const WHAT = process.argv[2] || 'perf';
const TAG = process.argv[3] || 'run';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const DEV = path.join(REPO, 'backend', '.dev');
const OUT = path.join(REPO, 'experiments', 'p349', TAG);
const DIR = process.env.P349_DIR || 'C:\\Workspace\\mtask-p349-a';
const BOARD = 'atrium-dev-p349', PORT = '48096', DEBUG = '9577';
const SEC = Number(process.env.P349_SEC || 6), SHELLS = Number(process.env.P349_SHELLS || 10), ROUNDS = Number(process.env.P349_ROUNDS || 2);
const WS_N = (process.env.P349_W || '10,20').split(',').map(Number);
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_|HC_|CLAUDECODE$|CLAUDE_CODE_)/.test(k)) delete process.env[k];
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
const ENV = {
  ATRIUM_TERMINAL_SESSION: BOARD, ATRIUM_HERDR_SESSION: BOARD, ATRIUM_PORT: PORT,
  ATRIUM_DATA_DIR: path.join(DEV, 'data'), ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  ATRIUM_CLAUDE_PROJECTS: path.join(DEV, 'no-projects'), ATRIUM_CLAUDE_DESKTOP: 'none', ATRIUM_TEST_PREFIX: 'p349-none-',
};
Object.assign(process.env, ENV);
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(ENV.ATRIUM_CLAUDE_PROJECTS, { recursive: true });
const { logger, sleep, launch, closeApp } = await import('./harness.mjs');
const { assertTestBoard } = await import('./p9-guard.mjs');
assertTestBoard(ENV, { root: DEV });
const log = logger(`p349-${WHAT}-${TAG}`);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 120000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 1600)}` : ''}`); };
const AWAKE = ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'];

// ---- 흉내 그래프(지어낸 이름, p210과 같은 모양에 몇 개 더) ----
const FOLDERS = [
  { id: 'g1', name: 'Market', members: ['d:/work/market/web', 'd:/work/market/quant/.git'] },
  { id: 'g2', name: 'Hub', members: ['d:/hub/core/.git', 'd:/hub/tools/.git'] },
  { id: 'g3', name: 'Campus', members: ['c:/work/library/.git', 'd:/work/campus/pbl/.git', 'd:/work/campus/exam/.git'] },
];
const WS = ['c:/work/atrium/.git', 'd:/work/market/web', 'd:/work/market/quant/.git', 'd:/hub/core/.git', 'd:/hub/tools/.git', 'c:/work/library/.git', 'd:/work/campus/pbl/.git', 'd:/work/campus/exam/.git', 'c:/work/notes/.git', 'd:/work/garden/.git'];
// [id, name, ws, parent, peerOf]
const S = [
  ['conductor', 'conductor', 0], ['old-1', 'atrium-old', 0],
  ['m1', 'm1', 1], ['res', 'researcher', 2, 'm1'], ['cf', 'coin-feed', 2, 'res'], ['ls', 'level-sets', 2, 'res'], ['ss', 'signal-scan', 2, 'res'], ['bm', 'band-model', 2, 'res'],
  ['hub', 'hub-head', 3], ['hub-p', 'hub-peer', 3, null, 'hub'], ['hub-w', 'hub-worker', 3, 'hub'], ['hub-w2', 'hub-worker-2', 3, 'hub'],
  ['lib', 'lib-1', 5], ['scribe', 'scribe', 5, 'lib'], ['scribe2', 'scribe-2', 5, 'lib'],
  ['deck', 'deck-lead', 6], ['dw', 'deck-writer', 6, 'deck'], ['dr', 'deck-reader', 6, 'dw'], ['dr2', 'deck-reader-2', 6, 'dw'],
  ['exam', 'exam-lead', 7], ['e1', 'ex-set-01', 7, 'exam'], ['e2', 'ex-set-02', 7, 'exam'], ['e3', 'ex-set-03', 7, 'exam'], ['e4', 'ex-qa-a', 7, 'exam'], ['e5', 'ex-qa-b', 7, 'exam'],
  ['notes', 'notes-2', 8], ['rev', 'reviewer', 8], ['g', 'g1', 9], ['media', 'media', 9, 'g'], ['trial', 'trial', 9, 'g'],
  ['t1', 'tools-head', 4], ['t2', 'tools-w1', 4, 't1'], ['t3', 'tools-w2', 4, 't1'], ['t4', 'tools-w3', 4, 't1'], ['t5', 'tools-docs', 4, 't1'], ['t6', 'tools-review', 4, 't1'],
];
// 일하는 카드를 고르는 차례(여러 워크스페이스에 고루). 나머지는 쉼·잠듦, 둘은 응답 필요·오류
const WORK_ORDER = ['conductor', 'res', 'hub', 'scribe', 'deck', 'exam', 'media', 't1', 'cf', 'dw', 'e1', 'hub-w', 'ls', 'e2', 't2', 'notes', 'dr', 'scribe2', 't3', 'e3', 'm1', 'hub-w2', 't4', 'g'];
function mockGraph(W) {
  const now = Date.now(), base = now - 3 * 3600 * 1000;
  const work = new Set(WORK_ORDER.slice(0, W));
  const prompts = ['Merge the workers and run the release check', 'Draft the slide notes for the second section', 'Collect the source tables', 'Review the parser diff and report back'];
  const stOf = (sid, i) => (work.has(sid) ? 'working' : sid === 'e5' ? 'waiting' : sid === 'rev' ? 'error' : i % 3 === 0 ? 'sleeping' : 'idle');
  const node = (sid, name, ws, parent, peer, i) => { const state = stOf(sid, i); return { id: `s:fk-${sid}`, kind: 'session', sessionId: `fk-${sid}`, name, agentKind: 'claude', state, category: state === 'working' ? 'working' : state === 'waiting' || state === 'error' ? 'needs_you' : 'idle', workspaceKey: ws,
    parentId: parent ? `s:fk-${parent}` : null, lineageParent: parent ? `s:fk-${parent}` : null, peers: peer ? [`s:fk-${peer}`] : [], createdAt: base + i * 1000, model: 'claude-opus-5-5', effort: 'high',
    lastPrompt: prompts[i % 4], activeAt: now - i * 60000, turnAt: state === 'working' ? now - i * 30000 : null, ask: state === 'waiting' ? 'Allow npm ci in the worktree?' : null, error: state === 'error' ? 'API Error: 529 overloaded' : null, closedKids: 0, assignAt: null, parentClosed: false, background: null }; };
  const nodes = S.map((s, i) => node(s[0], s[1], WS[s[2]], s[3], s[4], i));
  for (const s of S) if (s[4]) { const p = nodes.find((n) => n.sessionId === `fk-${s[4]}`); p.peers.push(`s:fk-${s[0]}`); }
  const edges = [];
  for (const n of nodes) if (n.parentId) { edges.push({ from: n.parentId, to: n.id, kind: 'spawn', count: 0, relation: 'sub' }); edges.push({ from: n.parentId, to: n.id, kind: 'role', label: 'worker', count: 3, relation: 'sub' }); }
  for (const s of S) if (s[4]) edges.push({ from: `s:fk-${s[4]}`, to: `s:fk-${s[0]}`, kind: 'relation', relation: 'peer', relationSource: 'user', count: 0 });
  return { nodes: [{ id: 'human', kind: 'human', name: 'you' }, ...nodes], edges, counts: { all: nodes.length }, at: now };
}

// ---- 페이지 안: 흉내 답, 폴더·워크스페이스, 흉내 세션 ----
const HOOK = ([g, folders, wsKeys]) => {
  const api = window.__mt.api, st = window.__mt.getState();
  if (!api.__p349orig) { api.__p349orig = api.call.bind(api); window.__p349st = { workspaces: st.workspaces, groups: st.groups }; }
  st.workspaces = [...wsKeys.map((k, i) => ({ key: k, name: k.replace(/\/\.git$/, '').split('/').pop(), kind: 'repo', root: k.replace(/\/\.git$/, ''), createdAt: 1e12 + i, counts: {}, worktrees: [] })), ...(window.__p349st.workspaces || [])];
  st.groups = folders.map((f) => ({ id: f.id, name: f.name, members: [...f.members] }));
  api.call = async (m, p) => (m === 'mission.graph' ? JSON.parse(JSON.stringify(window.__p349g)) : api.__p349orig(m, p));
  window.__p349g = g;
  const now = Date.now();
  for (const n of g.nodes) if (n.kind === 'session') {
    api.emit('session.updated', { sessionId: n.sessionId, name: n.name, kind: 'claude', state: n.state === 'idle' ? 'ready' : n.state, workspaceKey: n.workspaceKey, lastActivityAt: now - 60000, createdAt: n.createdAt, model: n.model, effort: n.effort, lastPrompt: n.lastPrompt, turn: n.state === 'working' ? { startedAt: now - 30000 } : null, ask: n.ask ? { kind: 'permission', summary: n.ask } : null });
  }
};

// ---- 추적과 rAF 간격 ----
const q = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return Math.round(s[Math.min(s.length - 1, Math.floor(p * s.length))] * 100) / 100; };
const r1 = (v) => Math.round(v * 10) / 10;
async function traced(page, cdp, fn) {
  const events = [];
  const onData = (e) => { for (const x of e.value) events.push(x); };
  cdp.on('Tracing.dataCollected', onData);
  const anim = !!process.env.P349_ANIM;
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

async function closeMission(pg) { for (let i = 0; i < 3 && (await pg.$('[data-role="mission"]')); i++) { await pg.keyboard.press('Escape'); await sleep(400); } }
async function openMission(pg) {
  await closeMission(pg);
  await pg.click('[data-action="mission-rail"]');
  await pg.waitForSelector('[data-role="mission"] .mt-ta-card', { timeout: 20000 });
  await sleep(1500);
}
// 끌기(16ms마다 한 걸음, 40걸음) 뒤 휠 20칸(30ms마다)을 SEC초 동안 되풀이(p210과 같은 손놀림)
async function moveAround(page, box) {
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
  const t0 = Date.now();
  while (Date.now() - t0 < SEC * 1000) {
    await page.mouse.move(cx, cy); await page.mouse.down();
    for (let i = 0; i < 40; i++) { await page.mouse.move(cx + Math.sin(i / 6) * 220, cy + Math.cos(i / 7) * 120); await sleep(16); if (i === 20 && !moveAround.seen) moveAround.seen = await page.evaluate(() => ({ run: document.getAnimations().filter((a) => a.playState === 'running').length, paused: document.getAnimations().filter((a) => a.playState === 'paused').length, ringsShown: [...document.querySelectorAll('[data-role=mission] .mt-mm-lring')].filter((e) => getComputedStyle(e).display !== 'none').length })); }
    await page.mouse.up();
    for (let i = 0; i < 20; i++) { await page.mouse.wheel(0, i % 10 < 5 ? -60 : 60); await sleep(30); }
  }
}
// 판(캔버스)은 빈 판 자리에서 끈다
const panePoint = (page) => page.evaluate(() => {
  const el = document.querySelector('.mt-canvas'); const r = el.getBoundingClientRect();
  for (let yy = 0.2; yy <= 0.8; yy += 0.05) for (let xx = 0.2; xx <= 0.8; xx += 0.02) { const x = r.left + r.width * xx, y = r.top + r.height * yy; const t = document.elementFromPoint(x, y); if (t && t.classList && t.classList.contains('react-flow__pane')) return { x: x - 50, y: y - 50, w: 100, h: 100 }; }
  return null;
});
const lightState = (page) => page.evaluate(() => ({ light: document.documentElement.dataset.workLight, lights: document.querySelectorAll('[data-role=mission] .mt-mm-light').length, rings: document.querySelectorAll('.mt-node-run').length, run: document.getAnimations().filter((a) => a.playState === 'running').length, reduce: matchMedia('(prefers-reduced-motion: reduce)').matches }));

async function setupBoard() {
  fs.mkdirSync(DIR, { recursive: true });
  log(atrium('backend', 'start').trim().slice(0, 300));
  const have = new Set(call('session.list').map((s) => s.name));
  for (let i = 1; i <= SHELLS; i++) { const nm = `p349-sh${i}`; if (!have.has(nm)) log(atrium('--json', 'spawn', DIR, '--kind', 'shell', '--name', nm).slice(0, 160)); }
  await sleep(3000);
  check('셸이 떴다', call('session.list').filter((s) => /^p349-sh/.test(s.name)).length === SHELLS);
}

async function setLight(page, mode) { call('settings.set', { key: 'workLight', value: mode }); await page.waitForFunction((m) => document.documentElement.dataset.workLight === m, mode, { timeout: 10000 }); await sleep(800); }

async function perf() {
  const { app, page } = await launch({ log, env: { ...ENV }, args: [`--remote-debugging-port=${DEBUG}`, ...AWAKE] });
  const res = { at: new Date().toISOString(), sec: SEC, rounds: ROUNDS, map: {}, canvas: {} };
  try {
    await app.evaluate(({ BrowserWindow, screen }) => { const w = BrowserWindow.getAllWindows()[0]; const left = Math.min(...screen.getAllDisplays().map((d) => d.bounds.x)); const b = w.getBounds(); w.setPosition(left - b.width - 200, 40); }).catch(() => {});
    await page.setViewportSize({ width: 1584, height: 921 }).catch(() => {});
    await page.emulateMedia({ reducedMotion: process.env.P349_MOTION || 'reduce' });
    call('settings.set', { key: 'language', value: 'ko' });
    await sleep(2500);
    if (await page.$('[data-role="sidebar"]')) { await page.click('[data-action="sidebar"]').catch(() => {}); await sleep(500); }
    const cdp = await page.context().newCDPSession(page);
    // ---- 세션 맵 ----
    for (const W of WS_N) {
      const g = mockGraph(W);
      await page.evaluate(HOOK, [g, FOLDERS, WS]);
      await openMission(page);
      const vb = await page.evaluate(() => { const r = document.querySelector('[data-role=ta-viewport]').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
      const nCards = await page.evaluate(() => document.querySelectorAll('[data-role=mission] .mt-ta-card').length);
      for (let round = 1; round <= ROUNDS; round++) {
        for (const mode of ['on', 'off']) {
          await setLight(page, mode);
          const st = await lightState(page);
          if (round === 1) check(`맵 W=${W} 빛 ${mode}: 카드 ${nCards}, 빛 층 ${st.lights}`, nCards >= 30 && st.lights === W, st);
          if (process.env.P349_SHOTS && round === 1) {
            await page.screenshot({ path: path.join(OUT, `map-w${W}-${mode}.png`) });
            // 일하는 카드 둘의 가까운 그림(빛이 도는 중의 한 순간)
            const slots = await page.$$('[data-role=mission] .mt-ta-slot[data-tier=work]');
            for (const [i, el] of slots.slice(0, 2).entries()) await el.screenshot({ path: path.join(OUT, `card-w${W}-${mode}-${i + 1}.png`) }).catch(() => {});
          }
          moveAround.seen = null;
          const r = await traced(page, cdp, () => moveAround(page, vb));
          r.anim = moveAround.seen;
          // 멈춘 뒤 빛이 다시 돈다(켬이면 일하는 카드 수만큼, 같은 박자: 시작 시각 0)
          await sleep(700);
          const after = await page.evaluate(() => { const a = document.getAnimations().filter((x) => x.playState === 'running' && x.animationName === 'mt-mm-lturn'); return { run: a.length, aligned: a.every((x) => x.startTime === 0) }; });
          if (round === 1) check(`맵 W=${W} 빛 ${mode}: 멈춘 뒤 빛이 다시 돈다`, mode === 'on' ? after.run === W && after.aligned : after.run === 0, { ...after, during: r.anim });
          (res.map[`w${W}-${mode}`] ||= []).push(r);
          log(`[map W=${W} ${mode} #${round}] raf ${JSON.stringify(r.raf)} perFrame ${JSON.stringify(r.perFrame)} busy ${r.busyPct}% ${JSON.stringify(r.msPerSec)} gpu ${r.gpuMainMsPerSec} viz ${r.vizMsPerSec} anim ${JSON.stringify(r.anim)}`);
          if (process.env.P349_IDLE) {
            const ri = await traced(page, cdp, () => sleep(SEC * 1000));
            (res.map[`w${W}-${mode}-idle`] ||= []).push(ri);
            log(`[map idle W=${W} ${mode} #${round}] raf ${JSON.stringify(ri.raf)} busy ${ri.busyPct}% ${JSON.stringify(ri.msPerSec)} gpu ${ri.gpuMainMsPerSec}`);
          }
        }
      }
      await closeMission(page);
    }
    // ---- 판(캔버스): 셸 세션을 일함으로 흉내 ----
    if (process.env.P349_CANVAS !== '0') {
      const n = await page.evaluate(() => {
        const st = window.__mt.getState();
        const real = [...st.sessions.values()].filter((s) => /^p349-sh/.test(s.name));
        window.__p349work = () => { const now = Date.now(); for (const s of real) window.__mt.api.emit('session.updated', { ...s, state: 'working', turn: { startedAt: now - 30000 }, lastActivityAt: now }); };
        window.__p349work();
        const el = document.querySelector('.mt-canvas');
        const ns = real.map((s) => st.nodes.get(s.sessionId)).filter(Boolean);
        const x0 = Math.min(...ns.map((n) => n.x)), y0 = Math.min(...ns.map((n) => n.y)), x1 = Math.max(...ns.map((n) => n.x + n.w)), y1 = Math.max(...ns.map((n) => n.y + n.h));
        const zz = Math.min(0.5, Math.min(el.clientWidth / (x1 - x0), el.clientHeight / (y1 - y0)) * 0.7);
        st.setViewport({ x: el.clientWidth / 2 - ((x0 + x1) / 2) * zz, y: el.clientHeight / 2 - ((y0 + y1) / 2) * zz, zoom: zz });
        return { real: real.length, nodes: ns.length, zoom: zz };
      });
      await sleep(2500);
      const box = await panePoint(page);
      for (let round = 1; round <= ROUNDS; round++) {
        for (const mode of ['on', 'off']) {
          await setLight(page, mode);
          await page.evaluate(() => window.__p349work());
          await sleep(600);
          const st = await lightState(page);
          if (round === 1) check(`판 빛 ${mode}: 셸 ${n.real}, 둘레 ${st.rings}`, st.rings >= 1, { ...n, ...st });
          if (process.env.P349_SHOTS && round === 1) await page.screenshot({ path: path.join(OUT, `canvas-${mode}.png`) });
          const r = await traced(page, cdp, () => moveAround(page, box));
          (res.canvas[mode] ||= []).push(r);
          log(`[canvas ${mode} #${round}] raf ${JSON.stringify(r.raf)} perFrame ${JSON.stringify(r.perFrame)} busy ${r.busyPct}% ${JSON.stringify(r.msPerSec)} gpu ${r.gpuMainMsPerSec}`);
        }
      }
    }
    await setLight(page, 'on');
    check('재기를 끝까지 돌았다', true);
  } finally { await closeApp(app); }
  fs.writeFileSync(path.join(OUT, 'p349-numbers.json'), JSON.stringify(res, null, 2));
}

async function stopBoard() {
  for (const s of call('session.list').filter((x) => /^p349-/.test(x.name))) { try { atrium('kill', s.name, '--yes'); } catch (e) { log(`kill ${s.name} ${e.message.slice(0, 100)}`); } }
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
  fs.writeFileSync(path.join(OUT, `p349-${WHAT}.json`), JSON.stringify({ results }, null, 2));
  const bad = results.filter((r) => !r.ok);
  log(`결과 ${results.length - bad.length}/${results.length} 통과${bad.length ? ` 실패: ${bad.map((b) => b.name).join(', ')}` : ''}`);
  process.exit(bad.length ? 1 : 0);
}
