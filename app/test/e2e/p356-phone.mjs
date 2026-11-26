// P356 창 시험(P353 도구를 고쳐 씀): 휴대폰 화면 재기(전·후)와 그림. 따로 띄운 개발용 판(atrium-dev-p356, 48101)만 쓴다. 휴대폰 흉내 프록시 48201.
// 판: 세션 60개쯤(셸 14, haiku 살아 있는 것 몇, 잠든 haiku 여럿), 폴더 다섯, 할 일 카드 몇, 권한 질문 하나. 실제 대화는 쓰지 않는다.
// 실행: node app/test/e2e/p356-phone.mjs <setup|measure|shots|stop> [round]
//   measure: 390×844 터치(Chromium, CDP)로 처음 열기와 다시 붙기의 메서드·이벤트별 받은 바이트, 첫 내용까지 시간, JS 힙을 잰다.
//   P356_DIST=<dist 폴더>면 그 화면 빌드를 내준다(옛 빌드 견주기). 결과는 experiments/p356/<round>/(저장소 밖).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const WHAT = process.argv[2] || 'setup';
const TAG = process.argv[3] || 'round-1';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const DEV = path.join(REPO, 'backend', '.dev');
const OUT = path.join(REPO, 'experiments', 'p356', TAG);
const CONVOS = 'C:\\Workspace\\mtask-p356-projects';
const FOLDERS = ['a', 'b', 'c', 'd', 'e'].map((x) => 'C:\\Workspace\\mtask-p356-' + x);
const BOARD = 'atrium-dev-p356', PORT = '48101', SIM = 48201;
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_|HC_|MT_HERDR)/.test(k)) delete process.env[k];
for (const k of Object.keys(process.env)) if (/^(CLAUDECODE|CLAUDE_CODE_|CLAUDE_EFFORT|CLAUDE_PID|CLAUDE_AGENT_SDK|ELECTRON_RUN_AS_NODE)/.test(k)) delete process.env[k];
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
const L = await import('./p59-lib.mjs');
const { NAME, LOGIN, LAPTOP_A } = L;
const ENV = {
  ATRIUM_TERMINAL_SESSION: BOARD, ATRIUM_HERDR_SESSION: BOARD, ATRIUM_PORT: PORT,
  ATRIUM_DATA_DIR: path.join(DEV, 'data'), ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  ATRIUM_CLAUDE_PROJECTS: CONVOS, ATRIUM_CLAUDE_DESKTOP: 'none', ATRIUM_TEST_PREFIX: 'p356-none-',
  ATRIUM_TAILSCALE: path.join(REPO, 'app', 'test', 'e2e', 'p49-fake-tailscale.mjs'), P49_FAKE_TS_PORT: PORT,
  ATRIUM_WEB_HOSTS: NAME + ':' + SIM + ',localhost:' + SIM,
  ...(process.env.P356_DIST ? { ATRIUM_WEB_DIST: process.env.P356_DIST } : {}),
};
Object.assign(process.env, ENV);
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(CONVOS, { recursive: true });
const { logger, sleep, until } = await import('./harness.mjs');
const { assertTestBoard } = await import('./p9-guard.mjs');
assertTestBoard(ENV, { root: DEV });

const pwDir = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright');
const chromeExe = (() => { try { return fs.readdirSync(pwDir).filter((x) => /^chromium-\d+$/.test(x)).sort().reverse().map((x) => path.join(pwDir, x, 'chrome-win64', 'chrome.exe')).find((f) => fs.existsSync(f)); } catch { return null; } })();
const log = logger('p356-' + WHAT + '-' + TAG);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 120000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== '' ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 1600)) : '')); };
const SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

// ---- 세션 60개 판 ----
const list = () => call('session.list');
const byName = (n) => list().find((x) => x.name === n);
async function spawn(p) { const r = call('session.spawn', p); return r; }
async function setupBoard() {
  log(atrium('backend', 'start').trim().slice(0, 300));
  await sleep(1500);
  FOLDERS.forEach((f, i) => { fs.mkdirSync(f, { recursive: true }); fs.writeFileSync(path.join(f, 'README.md'), '# mtask-p356-' + 'abcde'[i] + '\n'); });
  for (const f of FOLDERS) call('workspace.open', { path: f, select: false });
  call('settings.set', { key: 'language', value: 'ko' });
  const have = new Set(list().map((x) => x.name));
  // 셸 14(폴더마다 둘셋, 몇은 다른 셸의 하위)
  const shells = [];
  for (let i = 0; i < 14; i++) {
    const name = 'sh' + i;
    if (have.has(name)) continue;
    const parent = i % 3 === 2 && shells.length ? shells[shells.length - 1] : null;
    const r = await spawn({ cwd: FOLDERS[i % 5], kind: 'shell', name, ...(parent ? { parentSessionId: parent } : {}) });
    shells.push(r.sessionId); await sleep(400);
  }
  await until(() => list().filter((x) => x.kind === 'shell' && x.state !== 'starting').length >= 14, 90000, 2000).catch(() => log('셸 준비 기다림 넘김'));
  // 잠든 haiku: 여섯씩 띄워 한 번 답하게 하고 그 폴더를 재운다
  const SLEEPERS = Number(process.env.P356_SLEEPERS || 42);
  for (let b = 0; b * 6 < SLEEPERS; b++) {
    const f = FOLDERS[1 + (b % 4)];
    const names = [];
    let lead = null;
    for (let k = 0; k < 6 && b * 6 + k < SLEEPERS; k++) {
      const name = 'h' + (b * 6 + k);
      names.push(name);
      if (have.has(name)) continue;
      const r = await spawn({ cwd: f, name, model: 'haiku', prompt: 'Reply with one short sentence about tidy desks. Do not use tools.', ...(lead && k % 2 ? { parentSessionId: lead } : {}) });
      if (k === 0) lead = r.sessionId;
      await sleep(500);
    }
    await until(() => { const l = list(); return names.every((n) => { const s = l.find((x) => x.name === n); return s && (s.state === 'sleeping' || (s.state === 'ready' && s.lastAnswer)); }); }, 180000, 3000).catch(() => log('답 기다림 넘김 ' + names.join(',')));
    try { call('workspace.sleep', { workspace: f }); } catch (e) { log('재우기 실패 ' + e.message.slice(0, 160)); }
    await until(() => { const l = list(); return names.every((n) => { const s = l.find((x) => x.name === n); return !s || s.state === 'sleeping'; }); }, 60000, 2000).catch(() => log('잠 기다림 넘김'));
    log('묶음 ' + b + ' 잠: ' + list().filter((x) => x.state === 'sleeping').length);
  }
  // 살아 있는 haiku 넷(폴더 a): 답한 것, 권한 질문에 멈춘 것, 하위 둘
  const F = FOLDERS[0];
  if (!have.has('lead')) await spawn({ cwd: F, name: 'lead', model: 'haiku', prompt: 'Reply with one short sentence about mountains. Do not use tools.' });
  await sleep(1000);
  const leadId = (byName('lead') || {}).sessionId;
  if (!have.has('asker')) await spawn({ cwd: F, name: 'asker', model: 'haiku', prompt: 'Create a folder named p356-x in the current directory using the mkdir shell command.', ...(leadId ? { parentSessionId: leadId } : {}) });
  if (!have.has('helper')) await spawn({ cwd: F, name: 'helper', model: 'haiku', prompt: 'Write a two line poem about rivers. Do not use tools.', ...(leadId ? { parentSessionId: leadId } : {}) });
  await until(() => { const a = byName('asker'); return a && a.state === 'waiting'; }, 180000, 3000).catch(() => log('권한 질문 기다림 넘김'));
  // 셸 하나는 오래 도는 명령
  try { atrium('input', 'sh0', 'ping -n 100000 127.0.0.1\r'); } catch (e) { log('ping ' + e.message.slice(0, 120)); }
  // 할 일 카드 셋: P372부터 리드 haiku 신원으로(lib/board-agent.mjs). 옛 길(셸 칸에 atrium ask)은 셸이 판 하위 명령을 못 써 카드가 0장이었다(P355)
  { const { boardAgent } = await import('./lib/board-agent.mjs'); const ag = boardAgent({ env: ENV });
    for (const q of ['Merge the parser branch now?', 'Ship the phone page to dev today?', 'Keep the old map behind a button?']) if (!(call('decision.list').cards || []).some((c) => c.question === q)) await ag.ask('lead', q, { options: ['yes', 'no'] });
    await ag.expectCards(3); }
  await sleep(3000);
  const l = list();
  const cards = call('decision.list').cards || [];
  const st = l.reduce((m, s) => ((m[s.state] = (m[s.state] || 0) + 1), m), {});
  check('판: 세션 수 ' + l.length + ' 상태 ' + JSON.stringify(st) + ' 카드 ' + cards.length, l.length >= 55, { n: l.length, st, cards: cards.length });
}

// ---- 재기 ----
const INIT = () => {
  if (window.__p356) return;
  const P = window.__p356 = { phase: 'first', t0: performance.now(), first: null, by: { first: {}, re: {}, map: {}, move: {} }, ev: { first: {}, re: {}, map: {}, move: {} }, n: { first: 0, re: 0, map: 0, move: 0 }, ws: null, reAt: null, reFirst: null };
  const SEL = '.mt-pmap .mt-ta-card, [data-role=mp-ready]';
  const tick = () => { if (!P.first && document.querySelector(SEL)) P.first = Math.round(performance.now()); if (P.reAt && !P.reFirst && P.reOpen) P.reFirst = Math.round(performance.now() - P.reAt); requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  const Real = window.WebSocket;
  class Fake extends Real {
    constructor(...a) { super(...a); this.__m = new Map(); this.__fn = null; P.ws = this; }
    send(d) { try { const m = JSON.parse(d); if (m && m.id != null) this.__m.set(m.id, m.method); } catch {} return super.send(d); }
    set onmessage(fn) {
      this.__fn = fn;
      super.onmessage = fn ? (ev) => {
        const data = ev.data; const n = typeof data === 'string' ? data.length : 0;
        let key = '?', isEv = false;
        try { const m = JSON.parse(data); if (m.event) { key = m.event; isEv = true; } else { key = this.__m.get(m.id) || 'reply'; this.__m.delete(m.id); } } catch {}
        const ph = P.phase; const t = isEv ? P.ev[ph] : P.by[ph];
        t[key] = (t[key] || 0) + n; P.n[ph] += n;
        if (ph === 're' && !isEv && (key === 'events.subscribe' || key === 'phone.subscribe') && P.reFirst == null) P.reFirst = Math.round(performance.now() - P.reAt); // 다시 붙어 구독 답을 받기까지
        fn.call(this, ev);
      } : null;
    }
    get onmessage() { return this.__fn; }
  }
  window.WebSocket = Fake;
};

async function pair(pg) {
  await pg.goto('http://localhost:' + SIM + '/');
  await pg.waitForSelector('[data-role=pair]', { timeout: 30000 });
  await pg.fill('[data-field=pair-code]', call('device.code').code);
  await pg.click('[data-action=pair-submit]');
  await pg.waitForFunction(() => window.__mt && window.__mt.api && window.__mt.api.conn.phase === 'open', null, { timeout: 60000 });
  await sleep(1500);
}
const toUrl = (p) => 'file:///' + p.replace(/\\/g, '/');
async function withSim(fn) {
  const { startTsSim } = await import(toUrl(path.join(REPO, 'backend', 'tools', 'ts-sim-proxy.mjs')));
  const sim = startTsSim({ listen: SIM, target: Number(PORT), name: NAME, login: LOGIN, keepOrigin: true }); sim.cfg.ip = LAPTOP_A;
  await sim.ready;
  try { return await fn(); } finally { sim.close && sim.close(); }
}
const ctxOpts = (lang = 'ko') => ({ viewport: { width: 390, height: 844 }, screen: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: SAFARI, locale: lang === 'ko' ? 'ko-KR' : 'en-US' });
const kb = (n) => Math.round(n / 102.4) / 10;

async function measure() {
  const pw = await import('playwright');
  const rows = [];
  await withSim(async () => {
    const browser = await pw.chromium.launch({ headless: true, ...(chromeExe ? { executablePath: chromeExe } : {}) });
    try {
      const ctx = await browser.newContext(ctxOpts());
      const p0 = await ctx.newPage(); await pair(p0); await p0.close();
      for (let rep = 0; rep < Number(process.env.P356_REPS || 3); rep++) {
        const pg = await ctx.newPage();
        const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
        let statics = 0; const files = {};
        pg.on('response', async (r) => { try { const u = new URL(r.url()); if (!/\.(js|css|woff2?)$/.test(u.pathname)) return; const b = await r.body(); statics += b.length; files[u.pathname] = b.length; } catch {} });
        await pg.addInitScript(INIT);
        const cdp = await ctx.newCDPSession(pg);
        await cdp.send('Performance.enable');
        const heap = async () => { await cdp.send('HeapProfiler.collectGarbage').catch(() => {}); const m = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value])); return { heapMB: Math.round(m.JSHeapUsedSize / 1e5) / 10, nodes: m.Nodes }; };
        await pg.goto('http://localhost:' + SIM + '/');
        await pg.waitForFunction(() => window.__p356 && window.__p356.first, null, { timeout: 60000 });
        await sleep(6000);
        const h1 = await heap();
        const a = await pg.evaluate(() => { const P = window.__p356; return { first: P.first, n: P.n.first, by: P.by.first, ev: P.ev.first }; });
        await pg.evaluate(() => { const P = window.__p356; P.phase = 're'; P.reAt = performance.now(); P.ws.close(); });
        await pg.waitForFunction(() => window.__p356.reFirst != null, null, { timeout: 60000 }).catch(() => {});
        await sleep(6000);
        const h2 = await heap();
        const b = await pg.evaluate(() => { const P = window.__p356; return { reFirst: P.reFirst, n: P.n.re, by: P.by.re, ev: P.ev.re }; });
        const row = { rep, firstMs: a.first, firstKB: kb(a.n), firstBy: a.by, firstEv: a.ev, reMs: b.reFirst, reKB: kb(b.n), reBy: b.by, reEv: b.ev, heap1: h1, heap2: h2, staticKB: kb(statics), files, errors: errs };
        rows.push(row);
        log('#' + rep + ' 처음 ' + row.firstKB + 'KB ' + row.firstMs + 'ms / 다시 ' + row.reKB + 'KB ' + row.reMs + 'ms / 힙 ' + h1.heapMB + '→' + h2.heapMB + 'MB / 정적 ' + row.staticKB + 'KB');
        if (rep === 0) await pg.screenshot({ path: path.join(OUT, 'measure.png') }).catch(() => {});
        await pg.close();
      }
      await ctx.close();
    } finally { await browser.close(); }
  });
  fs.writeFileSync(path.join(OUT, 'measure.json'), JSON.stringify(rows, null, 2));
  check('측정 끝', rows.length > 0 && rows.every((x) => !x.errors.length), rows.map((x) => x.errors));
}

// ---- 그림(새 화면) ----
async function shots() {
  const pw = await import('playwright');
  await withSim(async () => {
    const browser = await pw.chromium.launch({ headless: true, ...(chromeExe ? { executablePath: chromeExe } : {}) });
    try {
      for (const lang of (process.env.P356_LANGS || 'ko,en').split(',')) {
        call('settings.set', { key: 'language', value: lang });
        const ctx = await browser.newContext(ctxOpts(lang));
        const p0 = await ctx.newPage(); await pair(p0); await p0.close();
        const pg = await ctx.newPage();
        const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
        await pg.goto('http://localhost:' + SIM + '/');
        await pg.waitForSelector('[data-role=mp-ready]', { state: 'attached', timeout: 60000 });
        await sleep(1500);
        const shot = async (n) => { await sleep(700); await pg.screenshot({ path: path.join(OUT, lang + '-' + n + '.png') }); };
        const box = (sel) => pg.evaluate((s) => [...document.querySelectorAll(s)].map((e) => { const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), bottom: Math.round(r.bottom), bg: getComputedStyle(e).backgroundColor }; }), sel);
        const ids = Object.fromEntries(call('session.list').map((s) => [s.name, s.sessionId]));
        // 390 CSS px 폭(뷰포트 메타)
        const vw = await pg.evaluate(() => ({ w: document.documentElement.clientWidth, inner: window.innerWidth }));
        check('[' + lang + '] 페이지 폭이 390 CSS px(뷰포트 메타)', vw.w === 390, vw);
        await shot('1-home');
        const tabs = await box('.mt-mp-tab');
        check('[' + lang + '] 아래 탭 셋, 높이 52px 이상, 홈 배지(응답 필요 수)', tabs.length === 3 && tabs.every((x) => x.h >= 52) && (await pg.textContent('[data-role=mp-need-badge]')) === '1', tabs);
        await pg.click('[data-action=mp-tab-sessions]'); await shot('2-sessions');
        await pg.fill('[data-field=mp-search]', 'sh1'); await shot('3-search'); await pg.fill('[data-field=mp-search]', '');
        await pg.click('[data-role=mp-row][data-name=asker] .mt-mp-row-hit'); await pg.waitForSelector('[data-role=mp-session]'); await pg.waitForSelector('[data-role=mp-term]'); await sleep(800); await shot('4-session-ask');
        const keys = await box('.mt-mp-key');
        check('[' + lang + '] 빠른 키 아홉이 한 줄, 칸마다 40px 이상, 기다리면 숫자 키 노랑', keys.length === 9 && new Set(keys.map((k) => k.top)).size === 1 && keys.every((k) => k.w >= 40 && k.h >= 40) && /255, 224, 61/.test(keys[4].bg), keys);
        await pg.click('[data-action=mp-back]');
        await pg.click('[data-action=mp-tab-sessions]'); await pg.click('[data-role=mp-row][data-name=lead] .mt-mp-row-hit'); await pg.waitForSelector('[data-role=mp-answer]'); await sleep(800); await shot('5-session-answer');
        await pg.click('[data-action=mp-tail]').catch(() => {}); await sleep(800); await shot('6-session-tail');
        // 키보드가 열린 때(보이는 높이가 줄어듦): 빠른 키와 입력 줄이 보이는 칸 안
        await pg.focus('[data-field=mp-text]');
        await pg.setViewportSize({ width: 390, height: 500 }); await sleep(800);
        const kb = { keys: await box('[data-role=mp-keys]'), input: await box('[data-role=mp-input]') };
        check('[' + lang + '] 키보드 흉내(보이는 높이 500): 빠른 키와 입력 줄이 화면 안 아래', kb.keys[0] && kb.input[0] && kb.input[0].bottom <= 500 && kb.keys[0].bottom <= kb.input[0].top + 1 && kb.input[0].bottom >= 460, kb);
        await shot('7-keyboard');
        await pg.setViewportSize({ width: 390, height: 844 }); await sleep(500);
        // 작은 이벤트로 세션 화면이 바뀐다(새로 고침 단추 없이): 이 화면에서 lead에게 보내고 답을 기다린다
        if (lang === 'ko') {
          await pg.fill('[data-field=mp-text]', 'Reply with exactly one word: pineapple. Do not use tools.');
          await pg.click('[data-action=mp-send]');
          const ok = await pg.waitForFunction(() => /pineapple/i.test((document.querySelector('[data-role=mp-answer]') || {}).textContent || ''), null, { timeout: 120000 }).then(() => true, () => false);
          check('[ko] 보낸 뒤 답이 이벤트로 세션 화면에 들어온다(새로 고침 누르지 않음)', ok);
          await shot('8-session-live');
        }
        await pg.click('[data-action=mp-back]');
        await pg.click('[data-action=mp-tab-map]'); await shot('9-map-tree');
        await pg.click('[data-action=mp-fullmap]');
        const full = await pg.waitForSelector('[data-role=mp-fullmap-host] .mt-pmap, [data-role=mp-fullmap-host] [data-role=phone]', { timeout: 60000 }).then(() => true, () => false);
        await sleep(2500); await shot('10-fullmap');
        check('[' + lang + '] 전체 맵은 누를 때 읽는다(fullmap.js)', full, '');
        await pg.click('[data-action=mp-fullmap-close]').catch(() => {}); await sleep(800);
        await pg.click('[data-action=mp-new]'); await pg.waitForSelector('[data-role=mp-spawn] [data-action=mp-spawn-go]', { timeout: 20000 }); await shot('11-new-session'); await pg.mouse.click(195, 40); await sleep(300);
        // 알림을 누른 주소(?open=)는 그 세션 화면을 바로 연다
        const p2 = await ctx.newPage();
        await p2.goto('http://localhost:' + SIM + '/?open=' + ids.asker);
        const opened = await p2.waitForSelector('[data-role=mp-session][data-session="' + ids.asker + '"]', { timeout: 30000 }).then(() => true, () => false);
        check('[' + lang + '] 알림 주소(?open=)가 그 세션 화면을 연다', opened);
        await p2.close();
        check('[' + lang + '] 그림, 화면 오류 없음', !errs.length, errs);
        await ctx.close();
      }
    } finally { await browser.close(); }
  });
}


// ---- P356: 할 일 카드. P372부터 리드 haiku 신원으로 lib/board-agent.mjs(옛 길: 셸 칸에서 atrium-child ask → 셸은 not_board_session, 카드 0장) ----
async function cards() {
  const { boardAgent } = await import('./lib/board-agent.mjs');
  const ag = boardAgent({ env: ENV });
  for (const q of ['Merge the parser branch now?', 'Ship the phone page to dev today?', 'Keep the old map behind a button?']) if (!(call('decision.list').cards || []).some((c) => c.question === q)) await ag.ask('lead', q, { options: ['yes', 'no'] });
  const c = await ag.expectCards(3);
  check('할 일 카드 ' + c.length, c.length >= 3, c.map((x) => x.name + ':' + x.question));
}

// ---- P356: 시안·마무리 그림(휴대폰 390×844·393×793 실제 크기, PC 세션 맵) ----
const SIZES = (process.env.P356_SIZES || '390x844,393x793').split(',').map((x) => x.split('x').map(Number));
async function shots356() {
  const pw = await import('playwright');
  await withSim(async () => {
    const browser = await pw.chromium.launch({ headless: true, ...(chromeExe ? { executablePath: chromeExe } : {}) });
    try {
      const lang = process.env.P356_LANG || 'ko';
      call('settings.set', { key: 'language', value: lang });
      for (const [w, h] of SIZES) {
        const ctx = await browser.newContext({ ...ctxOpts(lang), viewport: { width: w, height: h }, screen: { width: w, height: h }, deviceScaleFactor: 1 });
        const p0 = await ctx.newPage(); await pair(p0); await p0.close();
        const pg = await ctx.newPage();
        const errs = []; pg.on('pageerror', (e) => errs.push(e.message)); pg.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push('console: ' + m.text().slice(0, 300)); });
        await pg.goto('http://localhost:' + SIM + '/');
        await pg.waitForSelector('[data-role=mp-ready]', { state: 'attached', timeout: 60000 });
        await sleep(1500);
        const tag = lang + '-' + w + 'x' + h;
        const shot = async (n) => { await sleep(600); await pg.screenshot({ path: path.join(OUT, tag + '-' + n + '.png') }); };
        await pg.click('[data-action=mp-tab-home]'); await shot('1-home');
        await pg.evaluate(() => { const b = document.querySelector('.mt-mp-body'); if (b) b.scrollTop = b.scrollHeight; }); await shot('2-home-end');
        await pg.click('[data-action=mp-tab-sessions]'); await shot('3-sessions');
        await pg.click('[data-action=mp-tab-map]');
        const okMap = await pg.waitForSelector('[data-role=mp-map] .mt-ta-card', { timeout: 30000 }).then(() => true, () => false);
        if (!okMap) { await shot('4-map-fail'); throw new Error('map'); }
        await sleep(1500); await shot('4-map-open');
        const info = await pg.evaluate(() => ({ cards: document.querySelector('[data-role=ta-world]').dataset.cards, drawn: document.querySelectorAll('[data-role=mp-map] .mt-ta-slot').length, view: window.__mtMap.view(), asker: !!document.querySelector('[data-role=mp-map] .mt-ta-card[data-name=asker]') }));
        log(tag + ' 처음 맵 ' + JSON.stringify(info));
        check('[' + tag + '] 처음 맵은 첫 응답 필요 카드를 읽히는 배율(0.9 이상)로, 화면 밖 카드는 그리지 않는다', info.asker && info.view.k >= 0.9 && Number(info.drawn) < Number(info.cards), info);
        await pg.click('[data-action=ta-fit]'); await sleep(900); await shot('5-map-fit');
        const fitV = await pg.evaluate(() => window.__mtMap.view());
        check('[' + tag + '] 맞춤은 폴더 띠 폭(읽히는 배율 0.26 이상)', fitV.k >= 0.26, fitV);
        await pg.evaluate(() => { const v = window.__mtMap.view(); window.__mtMap.set({ k: 0.12, x: 10, y: 10 }); }); await sleep(900); await shot('6-map-far');
        await pg.evaluate(() => window.__mtMap.set({ k: 0.3, x: 10, y: 10 })); await sleep(900); await shot('7-map-far30');
        await pg.click('[data-role=pl-count][data-tier=review]').catch(() => {}); await sleep(1300); await shot('8-map-chip-done');
        const went = await pg.evaluate(() => !!document.querySelector('[data-role=mp-map] .mt-ta-card[data-name=lead]'));
        check('[' + tag + '] 작업 완료 알약을 누르면 그 카드로 간다', went);
        await pg.click('[data-role=pl-attn]').catch(() => {}); await sleep(1300); await shot('9-map-chip-need');
        await pg.click('[data-role=mp-map] .mt-ta-card[data-name=asker]'); const opened = await pg.waitForSelector('[data-role=mp-session]', { timeout: 15000 }).then(() => true, () => false);
        check('[' + tag + '] 카드를 누르면 세션 화면', opened);
        await shot('10-session');
        check('[' + tag + '] 화면 오류 없음', !errs.length, errs);
        await ctx.close();
      }
      // PC 세션 맵(같은 판, 판 화면)
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: lang === 'ko' ? 'ko-KR' : 'en-US' });
      const p0 = await ctx.newPage(); await pair(p0); await p0.close();
      const pg = await ctx.newPage();
      await pg.goto('http://localhost:' + SIM + '/');
      await pg.waitForFunction(() => window.__mt && window.__mt.getState && window.__mt.getState().boardLoaded, null, { timeout: 60000 }); await sleep(2000);
      await pg.click('[data-role=sessions-pill]'); await pg.waitForSelector('[data-role="mission"] .mt-ta-card', { timeout: 30000 }); await sleep(2500);
      await pg.screenshot({ path: path.join(OUT, lang + '-pc-map.png') });
      await ctx.close();
    } finally { await browser.close(); }
  });
}

// ---- P356: 맵 탭 재기(새 맵 탭 vs 옛 "전체 맵", P356_OLD=1이면 옛 빌드의 전체 맵 단추). 같은 59세션 판, 390×844 터치, CDP ----
async function mapMeasure() {
  const pw = await import('playwright');
  const OLD = process.env.P356_OLD === '1';
  const rows = [];
  await withSim(async () => {
    const browser = await pw.chromium.launch({ headless: true, ...(chromeExe ? { executablePath: chromeExe } : {}) });
    try {
      const ctx = await browser.newContext(ctxOpts());
      const p0 = await ctx.newPage(); await pair(p0); await p0.close();
      for (let rep = 0; rep < Number(process.env.P356_REPS || 3); rep++) {
        const pg = await ctx.newPage();
        const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
        let statics = 0; const files = {};
        let phase = 'first';
        pg.on('response', async (r) => { try { const u = new URL(r.url()); if (!/\.(js|css|woff2?)$/.test(u.pathname)) return; const b = await r.body(); if (phase === 'map') { statics += b.length; files[u.pathname] = b.length; } } catch {} });
        await pg.addInitScript(INIT);
        await pg.addInitScript(() => { try { localStorage.setItem('mt.mobileTab', 'home'); } catch {} });
        const cdp = await ctx.newCDPSession(pg);
        await cdp.send('Performance.enable');
        const heap = async () => { await cdp.send('HeapProfiler.collectGarbage').catch(() => {}); await sleep(300); const m = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value])); return { heapMB: Math.round(m.JSHeapUsedSize / 1e5) / 10, nodes: m.Nodes }; };
        await pg.goto('http://localhost:' + SIM + '/');
        await pg.waitForSelector('[data-role=mp-ready]', { state: 'attached', timeout: 60000 });
        await sleep(5000);
        const h0 = await heap();
        phase = 'map';
        await pg.evaluate(() => { const P = window.__p356; P.phase = 'map'; P.mapAt = performance.now(); P.mapFirst = null; const tick = () => { if (!P.mapFirst && document.querySelector('.mt-ta-card')) P.mapFirst = Math.round(performance.now() - P.mapAt); else if (!P.mapFirst) requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
        await pg.click('[data-action=mp-tab-map]');
        if (OLD) await pg.click('[data-action=mp-fullmap]');
        const okFirst = await pg.waitForFunction(() => window.__p356.mapFirst != null, null, { timeout: 60000 }).then(() => true, () => false);
        if (!okFirst) { await pg.screenshot({ path: path.join(OUT, 'map-fail-' + rep + '.png') }).catch(() => {}); throw new Error('맵 첫 카드 없음 ' + JSON.stringify({ errs, body: await pg.evaluate(() => ({ text: (document.querySelector('.mt-mp-body') || document.body).innerText.slice(0, 200), map: window.__mtMap && window.__mtMap.map() ? { n: (window.__mtMap.map().nodes || []).length, keys: Object.keys(window.__mtMap.map()), first: JSON.stringify((window.__mtMap.map().nodes || [])[0]) } : null, rows: window.__mtMobile.state().rows.size, row0: [...window.__mtMobile.state().rows.keys()][0] })) })); }
        await sleep(5000);
        const h1 = await heap();
        const a = await pg.evaluate(() => { const P = window.__p356; return { first: P.mapFirst, n: P.n.map, by: P.by.map, ev: P.ev.map, drawn: document.querySelectorAll('.mt-ta-slot').length, cards: (document.querySelector('[data-role=ta-world]') || {}).dataset ? document.querySelector('[data-role=ta-world]').dataset.cards || null : null }; });
        // 손가락 움직이기(CDP 터치): 끌기 60번(오래 끌기) → 힙, 두 손가락 확대·축소 16번. 그동안 rAF 간격(프레임 시간)을 잰다
        await pg.evaluate(() => { const P = window.__p356; P.phase = 'move'; });
        const vp = await pg.$('[data-role=ta-viewport]');
        const bx = await vp.boundingBox();
        const cx = Math.round(bx.x + bx.width / 2), cy = Math.round(bx.y + bx.height / 2);
        const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], i) => ({ x: Math.round(x), y: Math.round(y), id: i })) });
        const frames = async (fn) => {
          const met = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
          await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 }); // 휴대폰에 가깝게 CPU 4배 느리게
          const m0 = await met();
          await pg.evaluate(() => { window.__fr = []; window.__frOn = true; const f = (t) => { if (!window.__frOn) return; window.__fr.push(t); requestAnimationFrame(f); }; requestAnimationFrame(f); });
          await fn();
          const ts = await pg.evaluate(() => { window.__frOn = false; return window.__fr; });
          const m1 = await met();
          await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
          const per = (k) => (ts.length > 1 ? Math.round((m1[k] - m0[k]) * 1000 / (ts.length - 1) * 100) / 100 : null);
          const d = ts.slice(1).map((t, i) => t - ts[i]).sort((a, b) => a - b);
          const q = (p) => (d.length ? Math.round(d[Math.min(d.length - 1, Math.floor(d.length * p))] * 10) / 10 : null);
          return { n: d.length, p50: q(0.5), p95: q(0.95), max: d.length ? Math.round(d[d.length - 1]) : null, over20: d.length ? Math.round(d.filter((x) => x > 20).length / d.length * 1000) / 10 : null, taskMsPerFrame: per('TaskDuration'), scriptMsPerFrame: per('ScriptDuration'), styleLayoutMsPerFrame: Math.round(((m1.RecalcStyleDuration - m0.RecalcStyleDuration) + (m1.LayoutDuration - m0.LayoutDuration)) * 1000 / Math.max(1, ts.length - 1) * 100) / 100 };
        };
        const panF = await frames(async () => {
          for (let i = 0; i < 60; i++) {
            const dx = (i % 4 < 2 ? 1 : -1) * 150, dy = (i % 3 === 0 ? 1 : -1) * 220;
            await touch('touchStart', [[cx, cy]]);
            for (let s = 1; s <= 12; s++) { await touch('touchMove', [[cx + dx * s / 12, cy + dy * s / 12]]); await sleep(16); }
            await touch('touchEnd', []);
            await sleep(60);
          }
        });
        await sleep(1500);
        const hPan = await heap();
        const drawnPan = await pg.evaluate(() => document.querySelectorAll('.mt-ta-slot').length);
        const pinchF = await frames(async () => {
          for (let i = 0; i < 16; i++) {
            const out = i % 2 === 0, d0 = out ? 160 : 60, d1 = out ? 60 : 160;
            await touch('touchStart', [[cx - d0 / 2, cy], [cx + d0 / 2, cy]]);
            for (let s = 1; s <= 12; s++) { const d = d0 + (d1 - d0) * s / 12; await touch('touchMove', [[cx - d / 2, cy], [cx + d / 2, cy]]); await sleep(16); }
            await touch('touchEnd', []);
            await sleep(80);
          }
        });
        await pg.click('[data-action=ta-fit]').catch(() => {});
        await sleep(3000);
        const h2 = await heap();
        const b = await pg.evaluate(() => { const P = window.__p356; return { n: P.n.move, by: P.by.move, ev: P.ev.move, drawn: document.querySelectorAll('.mt-ta-slot').length }; });
        const row = { rep, old: OLD, mapFirstMs: a.first, mapKB: kb(a.n), mapBy: a.by, mapEv: a.ev, staticKB: kb(statics), files, drawnOpen: a.drawn, cards: a.cards, heap0: h0, heapMap: h1, heapAfterPan: hPan, drawnPan, panFrames: panF, pinchFrames: pinchF, heapAfterMove: h2, moveKB: kb(b.n), moveBy: b.by, moveEv: b.ev, drawnAfter: b.drawn, errors: errs };
        rows.push(row);
        log('#' + rep + (OLD ? ' 옛 전체 맵' : ' 맵 탭') + ' 첫 카드 ' + a.first + 'ms / 받은 ' + row.mapKB + 'KB(API·이벤트) + 정적 ' + row.staticKB + 'KB / 힙 ' + h0.heapMB + '→' + h1.heapMB + '→움직인 뒤 ' + h2.heapMB + 'MB / DOM ' + h1.nodes + '→' + h2.nodes + ' / 그린 카드 ' + a.drawn + '/' + a.cards + ' / 움직이는 동안 받은 ' + row.moveKB + 'KB / 오래 끈 뒤 힙 ' + hPan.heapMB + 'MB / 끌기 프레임 ' + JSON.stringify(panF) + ' / 두 손가락 ' + JSON.stringify(pinchF));
        if (rep === 0) await pg.screenshot({ path: path.join(OUT, (OLD ? 'old' : 'new') + '-map.png') }).catch(() => {});
        await pg.close();
      }
      await ctx.close();
    } finally { await browser.close(); }
  });
  fs.writeFileSync(path.join(OUT, (OLD ? 'old' : 'new') + '-map-measure.json'), JSON.stringify(rows, null, 2));
  check('맵 재기 끝', rows.length > 0 && rows.every((x) => !x.errors.length), rows.map((x) => x.errors));
}

async function stopBoard() {
  try { for (const s of call('session.list')) atrium('kill', s.sessionId, '--yes', '--delete'); } catch (e) { log('kill ' + e.message.slice(0, 120)); }
  try { log(atrium('terminal', 'stop', '--yes').slice(0, 200)); } catch (e) { log('terminal stop ' + e.message.slice(0, 120)); }
  try { log(atrium('backend', 'stop').slice(0, 200)); } catch (e) { log('backend stop ' + e.message.slice(0, 120)); }
}

try {
  if (WHAT === 'setup') await setupBoard();
  else if (WHAT === 'measure') await measure();
  else if (WHAT === 'shots') await shots();
  else if (WHAT === 'stop') await stopBoard();
  else if (WHAT === 'cards') await cards();
  else if (WHAT === 'shots356') await shots356();
  else if (WHAT === 'mapmeasure') await mapMeasure();
  else if (WHAT === 'backend-stop') log(atrium('backend', 'stop').slice(0, 200));
  else if (WHAT === 'backend-start') log(atrium('backend', 'start').slice(0, 200));
  else if (WHAT === 'status') { const l = call('session.list'); log(JSON.stringify(l.reduce((m, s) => ((m[s.state] = (m[s.state] || 0) + 1), m), {})) + ' n=' + l.length); }
} catch (e) {
  check('시험이 끝까지 돌았다', false, e.stack || e.message);
} finally {
  fs.writeFileSync(path.join(OUT, 'p356-' + WHAT + '.json'), JSON.stringify({ results }, null, 2));
  const bad = results.filter((r) => !r.ok);
  log('결과 ' + (results.length - bad.length) + '/' + results.length + ' 통과' + (bad.length ? ' 실패: ' + bad.map((b) => b.name).join(', ') : ''));
  process.exit(bad.length ? 1 : 0);
}
