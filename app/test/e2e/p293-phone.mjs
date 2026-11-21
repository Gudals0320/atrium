// P293 창 시험: 휴대폰 세션 맵 열기 측정(빠른 죽음 재현)과 가볍게 열기(물러섬)·전부 보기.
// 판: 따로 띄운 개발용 판(atrium-dev-p293, 48043, backend/.dev)만 쓴다. 휴대폰 흉내 프록시 48044. 한 번에 브라우저 하나(메모리).
//   실제 판 모양(세션 72, 워크스페이스 16, 결정 카드, 일하는 세션 몇 개)은 지어낸 이름의 흉내 자료다. 페이지가 열리기 전에(addInitScript) 웹소켓 답
//   (events.subscribe, board.get, mission.graph, thread.list, delivery.list, resources.get, decision.list)을 실제 판 기록의 크기에 맞춘 흉내로 바꾸고,
//   일하는 세션의 session.updated를 1초마다 흉내 낸다. 실제 대화는 쓰지 않는다.
// 실행: sh backend/.dev/clean-env.sh node app/test/e2e/p293-phone.mjs <setup|measure|flow|stop> [round] [변형들(쉼표)]
//   measure: 변형마다 새 페이지로 열고 5초 동안 잰다(WebKit: DOM·받은 바이트·프레임 끊김·카드 수, Chromium: JS 힙·레이어·노드).
//   flow: 빠른 죽음 → 가볍게 열기 → 전부 보기 → 살아남으면 보통(그림).
// P293_DIST=<dist 폴더>로 setup하면 그 화면 빌드를 내준다(옛 빌드 견주기). 결과는 워크트리의 experiments/p293/<round>/(저장소 밖).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const WHAT = process.argv[2] || 'setup';
const TAG = process.argv[3] || 'round-1';
const VARS = (process.argv[4] || 'full').split(',').filter(Boolean);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const DEV = path.join(REPO, 'backend', '.dev');
const OUT = path.join(REPO, 'experiments', 'p293', TAG);
const CONVOS = 'C:\\Workspace\\mtask-p293-projects';
const F = 'C:\\Workspace\\mtask-p293-a';
const BOARD = 'atrium-dev-p293', PORT = '48043', SIM = 48044;
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_|HC_|MT_HERDR)/.test(k)) delete process.env[k];
for (const k of Object.keys(process.env)) if (/^(CLAUDECODE|CLAUDE_CODE_|CLAUDE_EFFORT|CLAUDE_PID|CLAUDE_AGENT_SDK|ELECTRON_RUN_AS_NODE)/.test(k)) delete process.env[k];
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
const L = await import('./p59-lib.mjs');
const { NAME, LOGIN, LAPTOP_A } = L;
const ENV = {
  ATRIUM_TERMINAL_SESSION: BOARD, ATRIUM_HERDR_SESSION: BOARD, ATRIUM_PORT: PORT,
  ATRIUM_DATA_DIR: path.join(DEV, 'data'), ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  ATRIUM_CLAUDE_PROJECTS: CONVOS, ATRIUM_CLAUDE_DESKTOP: 'none', ATRIUM_TEST_PREFIX: 'p293-none-',
  ATRIUM_TAILSCALE: path.join(REPO, 'app', 'test', 'e2e', 'p49-fake-tailscale.mjs'), P49_FAKE_TS_PORT: PORT,
  ATRIUM_WEB_HOSTS: `${NAME}:${SIM},localhost:${SIM}`,
  ...(process.env.P293_DIST ? { ATRIUM_WEB_DIST: process.env.P293_DIST } : {}),
};
Object.assign(process.env, ENV);
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(CONVOS, { recursive: true });
const { logger, sleep, until } = await import('./harness.mjs');
const { assertTestBoard } = await import('./p9-guard.mjs');
assertTestBoard(ENV, { root: DEV });

const pwDir = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright');
const chromeExe = (() => { try { return fs.readdirSync(pwDir).filter((x) => /^chromium-\d+$/.test(x)).sort().reverse().map((x) => path.join(pwDir, x, 'chrome-win64', 'chrome.exe')).find((f) => fs.existsSync(f)); } catch { return null; } })();
const log = logger(`p293-${WHAT}-${TAG}`);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 120000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail !== '' ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 1600)}` : ''}`); };
const SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

// ---- 페이지보다 먼저 도는 흉내(웹소켓 답 바꾸기, 1초마다 일하는 세션 바뀜, 프레임 끊김 재기) ----
// cfg.v: 변형(full | nothread | nodec | nolight | todayonly | nochurn), cfg.size: 실제 판 기록의 답 크기(바이트)
const INIT = (cfg) => {
  if (!cfg || window.__p293) return;
  const P = window.__p293 = { calls: [], gaps: [], firstCard: null, t0: performance.now(), churn: 0 };
  // 프레임 끊김: rAF 사이가 50ms를 넘으면 긴 일로 센다
  let last = performance.now();
  const tick = (t) => { const d = t - last; last = t; if (d > 50) P.gaps.push([Math.round(t), Math.round(d)]); if (!P.firstCard && document.querySelector('.mt-pmap .mt-ta-card')) P.firstCard = Math.round(t); requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  const v = new Set(cfg.v || []);
  let seed = 42; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const words = 'merge parser review notes table phone map build test layout worker branch commit queue answer render cache budget plan check'.split(' ');
  const text = (n) => { let s = ''; while (s.length < n) s += words[Math.floor(rnd() * words.length)] + ' '; return s.slice(0, n); };
  const pad = (o, size) => { const n = JSON.stringify(o).length; if (n < size) o._pad = text(size - n - 10); return o; };
  const now = Date.now(), mid = new Date(now); mid.setHours(0, 0, 0, 0);
  const todayAt = Math.max(mid.getTime() + 1000, now - 60e3), oldAt = now - 3 * 86400e3;
  const N = cfg.n || 72, NW = 16;
  const ws = Array.from({ length: NW }, (_, i) => ({ key: `d:/w/ws${i}/.git`, root: `d:/w/ws${i}`, name: `ws${i}` }));
  const folders = Array.from({ length: 8 }, (_, f) => ({ id: `g${f}`, name: `folder ${f}`, members: ws.filter((_, i) => i % 8 === f).map((w) => w.key) }));
  const ss = [];
  for (let i = 0; i < N; i++) {
    const wi = i % NW, same = ss.filter((s) => s.wi === wi);
    const parent = same.length && rnd() < 0.7 ? same[Math.floor(rnd() * Math.min(2, same.length))] : null;
    const today = wi < 5;
    let state = today ? ['working', 'ready', 'working', 'ready', 'ready'][i % 5] : 'sleeping';
    if (i === 41) state = 'waiting'; if (i === 42) state = 'error'; if (i === 3) state = 'waiting';
    ss.push({ name: `s${i}`, id: `fk-${i}`, wi, parent, today, state });
  }
  const shown = v.has('todayonly') ? ss.filter((s) => s.today) : ss;
  const per = (k, n) => Math.floor((cfg.size[k] || 0) / Math.max(1, n));
  const sum = (s, i) => pad({ sessionId: s.id, name: s.name, cwd: ws[s.wi].root, paneId: `p${i}`, termWorkspaceId: 'w1', address: s.name, label: null, state: s.state, estimate: null, termStatus: s.state === 'sleeping' ? null : 'running',
    ask: s.state === 'waiting' ? { kind: 'permission', tool: 'Bash', command: text(120), since: now - 6e4, options: ['Yes', 'No'] } : null, waitingSince: s.state === 'waiting' ? now - 6e4 : null, error: s.state === 'error' ? { message: text(80) } : null,
    permissionMode: 'default', model: 'claude-opus-5-5', effort: 'high', launchModel: 'claude-opus-5-5', launchEffort: 'high', lastPrompt: text(300), lastAnswer: text(300), lastAnswerAt: now - i * 6e4,
    turn: { startedAt: s.today ? todayAt - 5e3 : oldAt, endedAt: s.state === 'working' ? null : (s.today ? todayAt : oldAt) }, work: null, exit: null, interruptedTurn: null, recovered: null, unseen: false, unseenSub: false, delivering: 0,
    trust: { predictedDialog: false, seenOnScreen: false }, resume: { registered: true }, hooks: { count: 40, lastAt: now, lastAuthOk: true }, createdAt: 1e12 + i, seenAt: now, touchedAt: now, lastActivityAt: s.today ? todayAt : oldAt, memMB: 300,
    kind: 'claude', origin: 'board', parentSessionId: s.parent ? s.parent.id : null, lineageParentSessionId: s.parent ? s.parent.id : null, hooked: true, agentName: s.name, flavor: null, background: null, answerSource: 'hook', cwdNow: ws[s.wi].root,
    git: { isRepo: true, root: ws[s.wi].root, commonDir: ws[s.wi].key, mainRoot: ws[s.wi].root, isWorktree: false, branch: 'dev', cwd: ws[s.wi].root, changedFiles: 3 }, workspaceKey: ws[s.wi].key, elsewhere: null, shell: null, fromShell: false,
    output: { long: false, chars: 300 }, loops: 0, branch: { depth: s.parent ? 1 : 0, parentName: s.parent ? s.parent.name : null }, sleep: s.state === 'sleeping' ? { at: oldAt, savedMB: 280 } : null, waking: false }, per('sub', N));
  const sums = new Map(shown.map((s, i) => [s.id, sum(s, i)]));
  const node = (s, i) => pad({ id: `s:${s.name}`, kind: 'session', sessionId: s.id, name: s.name, agentKind: 'claude', state: s.state, category: s.state === 'working' ? 'working' : s.state === 'waiting' ? 'needs' : 'idle', workspaceKey: ws[s.wi].key,
    parentId: s.parent ? `s:${s.parent.name}` : null, lineageParent: s.parent ? `s:${s.parent.name}` : null, peers: [], role: null, order: null, createdAt: 1e12 + i, loops: 0, model: 'claude-opus-5-5', effort: 'high',
    activeAt: s.today ? todayAt : oldAt, turnAt: s.state === 'working' ? todayAt : null, lastPrompt: text(200), lastAnswer: text(200) }, per('graph', N + 1));
  const graph = () => ({ nodes: [{ id: 'human', kind: 'human', name: 'you' }, ...shown.map(node)], edges: shown.filter((s) => s.parent && shown.includes(s.parent)).map((s) => ({ from: `s:${s.parent.name}`, to: `s:${s.name}`, kind: 'spawn', count: 2, lastAt: now - 6e5 })), counts: { all: shown.length }, at: Date.now() });
  const nodesBoard = shown.map((s, i) => ({ session_id: s.id, x: (i % 8) * 900, y: Math.floor(i / 8) * 700, w: 860, h: 640, z: i, size: null, area: '', aspect: null }));
  const wsRows = ws.map((w, i) => ({ key: w.key, name: w.name, kind: 'repo', root: w.root, createdAt: 1e12 + i, counts: {}, worktrees: [] }));
  const decisions = v.has('nodec') ? [] : [3, 7, 41].map((i, k) => ({ id: k + 1, sessionId: `fk-${i}`, name: `s${i}`, workspaceKey: ws[i % NW].key, question: text(140), options: ['A', 'B'], why: text(80), createdAt: now - (k + 1) * 6e5, kind: 'decide', auto: k === 2 }));
  const SUB = {
    'events.subscribe': (r) => pad({ ...r, sessions: [...(r.sessions || []), ...sums.values()] }, 0),
    'board.get': (r) => pad({ ...r, nodes: [...(r.nodes || []), ...nodesBoard], workspaces: [...wsRows, ...(r.workspaces || [])], groups: folders, links: r.links || [] }, cfg.size.board),
    'mission.graph': () => graph(),
    'thread.list': (r) => (v.has('nothread') ? { items: [], more: false, before: null } : { items: Array.from({ length: 50 }, (_, i) => ({ itemId: `t${i}`, seq: i + 1, kind: 'prompt', from: 'fk-0', to: `fk-${i % N}`, text: text(per('thread', 50) - 160), at: now - (50 - i) * 6e4 })), more: true, before: 1 }),
    'delivery.list': (r, p) => (p && p.active ? r : Array.from({ length: 10 }, (_, i) => ({ deliveryId: `d${i}`, sessionId: `fk-${i}`, status: 'confirmed', text: text(per('delivery', 10) - 200), at: now - i * 6e4, seq: i }))),
    'resources.get': (r) => pad({ ...r }, cfg.size.resources),
    'decision.list': () => ({ cards: decisions, held: {} }),
    'settings.get': (r) => (v.has('nolight') && r && r.settings ? { ...r, settings: { ...r.settings, workLight: 'off' } } : r),
  };
  const Real = window.WebSocket;
  class Fake extends Real {
    constructor(...a) { super(...a); this.__m = new Map(); this.__fn = null; P.ws = this; }
    send(d) { try { const m = JSON.parse(d); if (m && m.id != null) { this.__m.set(m.id, [m.method, m.params]); P.calls.push([m.method, Math.round(performance.now())]); } } catch {} return super.send(d); }
    set onmessage(fn) {
      this.__fn = fn;
      super.onmessage = fn ? (ev) => {
        let data = ev.data;
        try { const m = JSON.parse(data); const w = m && m.id != null ? this.__m.get(m.id) : null; if (w) { this.__m.delete(m.id); const sub = SUB[w[0]]; if (sub && !m.error) { m.result = sub(m.result, w[1]); data = JSON.stringify(m); } } } catch {}
        P.bytes = (P.bytes || 0) + data.length;
        fn.call(this, { data });
      } : null;
    }
    get onmessage() { return this.__fn; }
  }
  window.WebSocket = Fake;
  // 일하는 세션이 1초마다 바뀐다(실제 판의 session.updated 흐름)
  if (!v.has('nochurn')) {
    const working = shown.filter((s) => s.state === 'working');
    setInterval(() => {
      const ws0 = P.ws; if (!ws0 || !ws0.__fn || !working.length) return;
      const s = working[P.churn++ % working.length], cur = sums.get(s.id);
      const next = { ...cur, lastActivityAt: Date.now(), lastAnswer: text(300) };
      sums.set(s.id, next);
      const data = JSON.stringify({ event: 'session.updated', data: next });
      P.bytes = (P.bytes || 0) + data.length;
      try { ws0.__fn.call(ws0, { data }); } catch {}
    }, 1000);
  }
};
// 실제 판 기록(iPhone boot 줄)의 답 크기
const SIZE = { sub: 191000, board: 78000, graph: 119000, thread: 108000, delivery: 17000, resources: 13000 };

const READ = () => {
  const P = window.__p293, now = performance.now();
  const calls = P.calls.reduce((m, [k]) => ((m[k] = (m[k] || 0) + 1), m), {});
  const gaps = P.gaps.filter(([t]) => t <= now);
  return {
    t: Math.round(now), firstCard: P.firstCard, bytes: P.bytes || 0, inB: window.__mt && window.__mt.api ? window.__mt.api.inB || 0 : null,
    dom: document.getElementsByTagName('*').length, cards: document.querySelectorAll('.mt-pmap .mt-ta-card').length, tiles: document.querySelectorAll('.mt-pmap .mt-ta-tile').length,
    anims: document.getAnimations ? document.getAnimations().length : null, marks: document.querySelectorAll('.mt-pmap [data-role=decision-mark]').length,
    long: gaps.length, longMs: gaps.reduce((a, [, d]) => a + d, 0), maxGap: gaps.reduce((a, [, d]) => Math.max(a, d), 0),
    graphCalls: calls['mission.graph'] || 0, threadCalls: calls['thread.list'] || 0, calls,
    lite: document.querySelector('[data-role=pm-lite]') ? 1 : 0, earlier: document.querySelectorAll('.mt-pmap [data-role=ln-section][data-kind=earlier]').length,
  };
};

async function setupBoard() {
  log(atrium('backend', 'start').trim().slice(0, 300));
  await sleep(1500);
  for (const s of call('session.list')) { try { atrium('kill', s.sessionId, '--yes', '--delete'); } catch (e) { log('옛 세션 끄기 실패', e.message.slice(0, 120)); } }
  fs.mkdirSync(F, { recursive: true }); fs.writeFileSync(path.join(F, 'README.md'), '# mtask-p293-a\n');
  call('workspace.open', { path: F, select: true });
  call('settings.set', { key: 'language', value: 'ko' });
  const r = call('session.spawn', { cwd: F, kind: 'shell', name: 'p293-shell' }); log('띄움', r.sessionId);
  await until(() => call('session.list').some((x) => x.name === 'p293-shell' && /shell_/.test(x.state)), 60000, 1500).catch(() => log('셸 준비 기다림 넘김'));
  check('장면: 셸 하나', call('session.list').length === 1);
}

async function pair(pg) {
  await pg.goto(`http://localhost:${SIM}/`);
  await pg.waitForSelector('[data-role=pair]', { timeout: 30000 });
  await pg.fill('[data-field=pair-code]', call('device.code').code);
  await pg.click('[data-action=pair-submit]');
  await pg.waitForFunction(() => window.__mt && window.__mt.getState().boardLoaded && window.__mt.api.conn.phase === 'open', null, { timeout: 60000 });
  await sleep(800);
}
const toUrl = (p) => 'file:///' + p.replace(/\\/g, '/');
async function withSim(fn) {
  const { startTsSim } = await import(toUrl(path.join(REPO, 'backend', 'tools', 'ts-sim-proxy.mjs')));
  const sim = startTsSim({ listen: SIM, target: Number(PORT), name: NAME, login: LOGIN, keepOrigin: true }); sim.cfg.ip = LAPTOP_A;
  await sim.ready;
  try { return await fn(); } finally { sim.close && sim.close(); }
}
const ctxOpts = (engine) => ({ viewport: { width: 390, height: 844 }, screen: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: engine !== 'firefox', hasTouch: true, userAgent: SAFARI, locale: 'ko-KR' });

// 한 번 열기: 새 페이지, 흉내를 깐 뒤 열고 첫 카드 + 5초까지 잰다
async function openOnce(ctx, engine, v, { crumbs = null, keepCrumbs = false, wait = 5000, after = null } = {}) {
  const pg = await ctx.newPage();
  const errs = [];
  pg.on('pageerror', (e) => errs.push(e.message));
  await pg.addInitScript(INIT, { v: v.split('+'), size: SIZE });
  await pg.addInitScript(([c, keep]) => { try { if (!keep) { localStorage.removeItem('mt.crumbs'); } if (c) localStorage.setItem('mt.crumbs', c); localStorage.removeItem('atrium.phoneMap.view'); } catch {} }, [crumbs, keepCrumbs]);
  let cdp = null, layers = null;
  if (engine === 'chromium') {
    cdp = await ctx.newCDPSession(pg);
    await cdp.send('Performance.enable');
    await cdp.send('LayerTree.enable').catch(() => {});
    cdp.on('LayerTree.layerTreeDidChange', (e) => { if (e.layers) layers = e.layers.length; });
  }
  await pg.goto(`http://localhost:${SIM}/`);
  await pg.waitForFunction(() => window.__p293 && window.__p293.firstCard, null, { timeout: 30000 });
  const fc = await pg.evaluate(() => window.__p293.firstCard);
  await pg.waitForFunction((t) => performance.now() >= t, fc + wait, { timeout: wait + 20000, polling: 200 });
  if (after) await after(pg);
  const r = await pg.evaluate(READ);
  if (cdp) {
    const m = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
    r.heapMB = Math.round(m.JSHeapUsedSize / 1e5) / 10; r.nodes = m.Nodes; r.layouts = m.LayoutCount; r.styles = m.RecalcStyleCount; r.scriptMs = Math.round(m.ScriptDuration * 1000); r.taskMs = Math.round(m.TaskDuration * 1000); r.layers = layers;
  }
  r.errors = errs;
  return { pg, r };
}

async function measure() {
  const pw = await import('playwright');
  const rows = [];
  await withSim(async () => {
    for (const engine of (process.env.P293_ENGINES || 'webkit,chromium').split(',')) {
      const browser = engine === 'webkit' ? await pw.webkit.launch({ headless: true }) : await pw.chromium.launch({ headless: true, ...(chromeExe ? { executablePath: chromeExe } : {}) });
      try {
        const ctx = await browser.newContext(ctxOpts(engine));
        const p0 = await ctx.newPage(); await pair(p0); await p0.close();
        for (const v of VARS) for (let rep = 0; rep < Number(process.env.P293_REPS || 2); rep++) {
          let opt = {};
          if (v.startsWith('lite')) opt = { crumbs: fastCrash(), after: v.includes('all') ? async (pg) => { await pg.click('[data-action=pm-lite-all]'); await sleep(5000); } : null };
          const { pg, r } = await openOnce(ctx, engine, v.replace(/^lite\+?/, '').replace(/all\+?/, '') || 'full', opt);
          rows.push({ engine, v, rep, ...r });
          log(`${engine} ${v} #${rep}: ${JSON.stringify(r)}`);
          if (rep === 0) await pg.screenshot({ path: path.join(OUT, `${engine}-${v}.png`) }).catch(() => {});
          await pg.close();
        }
        await ctx.close();
      } finally { await browser.close(); }
    }
  });
  fs.writeFileSync(path.join(OUT, 'measure.json'), JSON.stringify(rows, null, 2));
  check('측정 끝', rows.length > 0 && rows.every((x) => !x.errors.length), rows.filter((x) => x.errors.length).map((x) => x.errors));
}
// 열린 지 3초 만에 죽은 페이지의 기록(세션 맵에서, pagehide 없이). 다음 부팅이 빠른 죽음으로 본다
const fastCrash = (up = 3000, view = 'map') => { const t = Date.now() - 20000; return JSON.stringify({ v: 1, cur: { boot: t, alive: t + up, clean: false, light: false, retryBoot: false, mode: 'board', level: 0, view, phone: true }, crashes: [], light: false, retry: null, level: 0, ok: false, sent: null, by: 'touch' }); };

async function flow() {
  const pw = await import('playwright');
  await withSim(async () => {
    const browser = await pw.webkit.launch({ headless: true });
    try {
      for (const lang of ['ko', 'en']) {
        call('settings.set', { key: 'language', value: lang });
        const ctx = await browser.newContext({ ...ctxOpts('webkit'), locale: lang === 'ko' ? 'ko-KR' : 'en-US' });
        const p0 = await ctx.newPage(); await pair(p0); await p0.close();
        // 1) 보통 열기
        let { pg, r } = await openOnce(ctx, 'webkit', 'full', { wait: 2500 });
        check(`[${lang}] 보통 열기: 가볍게 띠 없음, 두 칸(이전 칸 그림), mission.graph 한 번, thread.list 없음`, !r.lite && r.earlier === 1 && r.graphCalls === 1 && r.threadCalls === 0 && !r.errors.length, r);
        await pg.screenshot({ path: path.join(OUT, `normal-${lang}.png`) });
        const normal = r;
        await pg.close();
        // 2) 빠른 죽음 뒤: 가볍게 열기
        ({ pg, r } = await openOnce(ctx, 'webkit', 'full', { crumbs: fastCrash(), wait: 2500 }));
        const crumb = await pg.evaluate(() => window.__mt.crash());
        check(`[${lang}] 빠른 죽음 뒤 가볍게 열기: 띠, 오늘 칸만, 표식·빛 없음, 큰 답 안 받음`, r.lite === 1 && r.earlier === 0 && r.marks === 0 && r.threadCalls === 0 && r.cards < normal.cards && r.bytes < normal.bytes && crumb.lite === true, { r, crumb: { lite: crumb.lite, crashed: crumb.crashed } });
        await pg.screenshot({ path: path.join(OUT, `lite-${lang}.png`) });
        // 3) 전부 보기
        await pg.click('[data-action=pm-lite-all]'); await sleep(2500);
        r = await pg.evaluate(READ);
        check(`[${lang}] 전부 보기 뒤: 띠 없음, 두 칸, 표식, 미룬 답(전달·자원·결정) 받음, thread.list는 여전히 없음(휴대폰은 쓰지 않는다)`, r.lite === 0 && r.earlier === 1 && r.marks > 0 && r.calls['delivery.list'] >= 1 && r.calls['decision.list'] === 1 && r.threadCalls === 0, r);
        await pg.screenshot({ path: path.join(OUT, `lite-all-${lang}.png`) });
        await pg.close();
        // 4) 가볍게 연 페이지가 살아남아 정상으로 떠나면 다음은 보통
        ({ pg, r } = await openOnce(ctx, 'webkit', 'full', { crumbs: fastCrash(), wait: 1000 }));
        check(`[${lang}] (다시) 가볍게 열림`, r.lite === 1, r);
        await pg.goto('about:blank'); await pg.close();
        ({ pg, r } = await openOnce(ctx, 'webkit', 'full', { keepCrumbs: true, wait: 1500 }));
        check(`[${lang}] 정상으로 떠난 뒤 다음 열기는 보통`, r.lite === 0 && r.earlier === 1, r);
        await pg.close();
        await ctx.close();
      }
    } finally { await browser.close(); }
  });
}

async function stopBoard() {
  try { for (const s of call('session.list')) atrium('kill', s.sessionId, '--yes', '--delete'); } catch (e) { log(`kill ${e.message.slice(0, 120)}`); }
  try { log(atrium('terminal', 'stop', '--yes').slice(0, 200)); } catch (e) { log(`terminal stop ${e.message.slice(0, 120)}`); }
  try { log(atrium('backend', 'stop').slice(0, 200)); } catch (e) { log(`backend stop ${e.message.slice(0, 120)}`); }
}

try {
  if (WHAT === 'setup') await setupBoard();
  else if (WHAT === 'measure') await measure();
  else if (WHAT === 'flow') await flow();
  else if (WHAT === 'stop') await stopBoard();
  else if (WHAT === 'backend-stop') log(atrium('backend', 'stop').slice(0, 200));
  else if (WHAT === 'backend-start') log(atrium('backend', 'start').slice(0, 200));
} catch (e) {
  check('시험이 끝까지 돌았다', false, e.stack || e.message);
} finally {
  fs.writeFileSync(path.join(OUT, `p293-${WHAT}.json`), JSON.stringify({ results }, null, 2));
  const bad = results.filter((r) => !r.ok);
  log(`결과 ${results.length - bad.length}/${results.length} 통과${bad.length ? ` 실패: ${bad.map((b) => b.name).join(', ')}` : ''}`);
  process.exit(bad.length ? 1 : 0);
}
