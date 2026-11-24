// P353 창 시험: 휴대폰 화면 재기(전·후)와 그림. 따로 띄운 개발용 판(atrium-dev-p353, 48098)만 쓴다. 휴대폰 흉내 프록시 48198.
// 판: 세션 60개쯤(셸 14, haiku 살아 있는 것 몇, 잠든 haiku 여럿), 폴더 다섯, 할 일 카드 몇, 권한 질문 하나. 실제 대화는 쓰지 않는다.
// 실행: node app/test/e2e/p353-phone.mjs <setup|measure|shots|stop> [round]
//   measure: 390×844 터치(Chromium, CDP)로 처음 열기와 다시 붙기의 메서드·이벤트별 받은 바이트, 첫 내용까지 시간, JS 힙을 잰다.
//   P353_DIST=<dist 폴더>면 그 화면 빌드를 내준다(옛 빌드 견주기). 결과는 experiments/p353/<round>/(저장소 밖).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const WHAT = process.argv[2] || 'setup';
const TAG = process.argv[3] || 'round-1';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const DEV = path.join(REPO, 'backend', '.dev');
const OUT = path.join(REPO, 'experiments', 'p353', TAG);
const CONVOS = 'C:\\Workspace\\mtask-p353-projects';
const FOLDERS = ['a', 'b', 'c', 'd', 'e'].map((x) => 'C:\\Workspace\\mtask-p353-' + x);
const BOARD = 'atrium-dev-p353', PORT = '48098', SIM = 48198;
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_|HC_|MT_HERDR)/.test(k)) delete process.env[k];
for (const k of Object.keys(process.env)) if (/^(CLAUDECODE|CLAUDE_CODE_|CLAUDE_EFFORT|CLAUDE_PID|CLAUDE_AGENT_SDK|ELECTRON_RUN_AS_NODE)/.test(k)) delete process.env[k];
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
const L = await import('./p59-lib.mjs');
const { NAME, LOGIN, LAPTOP_A } = L;
const ENV = {
  ATRIUM_TERMINAL_SESSION: BOARD, ATRIUM_HERDR_SESSION: BOARD, ATRIUM_PORT: PORT,
  ATRIUM_DATA_DIR: path.join(DEV, 'data'), ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  ATRIUM_CLAUDE_PROJECTS: CONVOS, ATRIUM_CLAUDE_DESKTOP: 'none', ATRIUM_TEST_PREFIX: 'p353-none-',
  ATRIUM_TAILSCALE: path.join(REPO, 'app', 'test', 'e2e', 'p49-fake-tailscale.mjs'), P49_FAKE_TS_PORT: PORT,
  ATRIUM_WEB_HOSTS: NAME + ':' + SIM + ',localhost:' + SIM,
  ...(process.env.P353_DIST ? { ATRIUM_WEB_DIST: process.env.P353_DIST } : {}),
};
Object.assign(process.env, ENV);
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(CONVOS, { recursive: true });
const { logger, sleep, until } = await import('./harness.mjs');
const { assertTestBoard } = await import('./p9-guard.mjs');
assertTestBoard(ENV, { root: DEV });

const pwDir = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright');
const chromeExe = (() => { try { return fs.readdirSync(pwDir).filter((x) => /^chromium-\d+$/.test(x)).sort().reverse().map((x) => path.join(pwDir, x, 'chrome-win64', 'chrome.exe')).find((f) => fs.existsSync(f)); } catch { return null; } })();
const log = logger('p353-' + WHAT + '-' + TAG);
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
  FOLDERS.forEach((f, i) => { fs.mkdirSync(f, { recursive: true }); fs.writeFileSync(path.join(f, 'README.md'), '# mtask-p353-' + 'abcde'[i] + '\n'); });
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
  const SLEEPERS = Number(process.env.P353_SLEEPERS || 42);
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
  if (!have.has('asker')) await spawn({ cwd: F, name: 'asker', model: 'haiku', prompt: 'Create a folder named p353-x in the current directory using the mkdir shell command.', ...(leadId ? { parentSessionId: leadId } : {}) });
  if (!have.has('helper')) await spawn({ cwd: F, name: 'helper', model: 'haiku', prompt: 'Write a two line poem about rivers. Do not use tools.', ...(leadId ? { parentSessionId: leadId } : {}) });
  await until(() => { const a = byName('asker'); return a && a.state === 'waiting'; }, 180000, 3000).catch(() => log('권한 질문 기다림 넘김'));
  // 셸 하나는 오래 도는 명령, 셸 둘은 할 일 카드(atrium ask, 판이 준 셸 env)
  try { atrium('input', 'sh0', 'ping -n 100000 127.0.0.1\r'); } catch (e) { log('ping ' + e.message.slice(0, 120)); }
  for (const [n, q] of [['sh1', 'Merge the parser branch now?'], ['sh2', 'Ship the phone page to dev today?'], ['sh3', 'Keep the old map behind a button?']]) {
    try { atrium('input', n, 'atrium ask "' + q + '" --option yes --option no --no-wait\r'); } catch (e) { log('ask ' + e.message.slice(0, 120)); }
    await sleep(1500);
  }
  await sleep(3000);
  const l = list();
  const cards = call('decision.list').cards || [];
  const st = l.reduce((m, s) => ((m[s.state] = (m[s.state] || 0) + 1), m), {});
  check('판: 세션 수 ' + l.length + ' 상태 ' + JSON.stringify(st) + ' 카드 ' + cards.length, l.length >= 55, { n: l.length, st, cards: cards.length });
}

// ---- 재기 ----
const INIT = () => {
  if (window.__p353) return;
  const P = window.__p353 = { phase: 'first', t0: performance.now(), first: null, by: { first: {}, re: {} }, ev: { first: {}, re: {} }, n: { first: 0, re: 0 }, ws: null, reAt: null, reFirst: null };
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
      for (let rep = 0; rep < Number(process.env.P353_REPS || 3); rep++) {
        const pg = await ctx.newPage();
        const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
        let statics = 0; const files = {};
        pg.on('response', async (r) => { try { const u = new URL(r.url()); if (!/\.(js|css|woff2?)$/.test(u.pathname)) return; const b = await r.body(); statics += b.length; files[u.pathname] = b.length; } catch {} });
        await pg.addInitScript(INIT);
        const cdp = await ctx.newCDPSession(pg);
        await cdp.send('Performance.enable');
        const heap = async () => { await cdp.send('HeapProfiler.collectGarbage').catch(() => {}); const m = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value])); return { heapMB: Math.round(m.JSHeapUsedSize / 1e5) / 10, nodes: m.Nodes }; };
        await pg.goto('http://localhost:' + SIM + '/');
        await pg.waitForFunction(() => window.__p353 && window.__p353.first, null, { timeout: 60000 });
        await sleep(6000);
        const h1 = await heap();
        const a = await pg.evaluate(() => { const P = window.__p353; return { first: P.first, n: P.n.first, by: P.by.first, ev: P.ev.first }; });
        await pg.evaluate(() => { const P = window.__p353; P.phase = 're'; P.reAt = performance.now(); P.ws.close(); });
        await pg.waitForFunction(() => window.__p353.reFirst != null, null, { timeout: 60000 }).catch(() => {});
        await sleep(6000);
        const h2 = await heap();
        const b = await pg.evaluate(() => { const P = window.__p353; return { reFirst: P.reFirst, n: P.n.re, by: P.by.re, ev: P.ev.re }; });
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
      for (const lang of (process.env.P353_LANGS || 'ko,en').split(',')) {
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
  else if (WHAT === 'backend-stop') log(atrium('backend', 'stop').slice(0, 200));
  else if (WHAT === 'backend-start') log(atrium('backend', 'start').slice(0, 200));
  else if (WHAT === 'status') { const l = call('session.list'); log(JSON.stringify(l.reduce((m, s) => ((m[s.state] = (m[s.state] || 0) + 1), m), {})) + ' n=' + l.length); }
} catch (e) {
  check('시험이 끝까지 돌았다', false, e.stack || e.message);
} finally {
  fs.writeFileSync(path.join(OUT, 'p353-' + WHAT + '.json'), JSON.stringify({ results }, null, 2));
  const bad = results.filter((r) => !r.ok);
  log('결과 ' + (results.length - bad.length) + '/' + results.length + ' 통과' + (bad.length ? ' 실패: ' + bad.map((b) => b.name).join(', ') : ''));
  process.exit(bad.length ? 1 : 0);
}
