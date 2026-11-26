// P355 창 시험: 휴대폰 세션 화면(답 | 터미널, 키 줄, 아래 끝) 그림과 재기(전·후). 따로 띄운 개발용 판(atrium-dev-p355, 48100)만 쓴다. 휴대폰 흉내 프록시 48200.
// 판은 P353과 같다: 세션 59개쯤(셸 14, 잠든 haiku 42, 살아 있는 haiku 셋: lead·helper·asker(권한 질문에 멈춤)), 폴더 다섯, 할 일 카드 셋. 실제 대화는 쓰지 않는다.
// 실행: node app/test/e2e/p355-phone.mjs <setup|measure|shots|stop> [round]
//   measure: 390×844 터치(Chromium, CDP)로 처음 열기·다시 붙기(P353과 같은 방법)와 터미널 단계(세션 화면 → 터미널 보기 → 답 보기)의
//   메서드·이벤트별 받은 바이트, JS 힙(GC 뒤), 붙은 터미널 수를 잰다. P355_DIST=<dist 폴더>면 그 화면 빌드를 내준다(옛 빌드 견주기).
//   shots: 390×844·393×793(iPhone 15 Safari 탭의 실제 부팅 값), 한국어·영어. 결과는 experiments/p355/<round>/(저장소 밖).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const WHAT = process.argv[2] || 'setup';
const TAG = process.argv[3] || 'round-1';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const DEV = path.join(REPO, 'backend', '.dev');
const OUT = path.join(REPO, 'experiments', 'p355', TAG);
const CONVOS = 'C:\\Workspace\\mtask-p355-projects';
const FOLDERS = ['a', 'b', 'c', 'd', 'e'].map((x) => 'C:\\Workspace\\mtask-p355-' + x);
const BOARD = 'atrium-dev-p355', PORT = '48100', SIM = 48200;
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_|HC_|MT_HERDR)/.test(k)) delete process.env[k];
for (const k of Object.keys(process.env)) if (/^(CLAUDECODE|CLAUDE_CODE_|CLAUDE_EFFORT|CLAUDE_PID|CLAUDE_AGENT_SDK|ELECTRON_RUN_AS_NODE)/.test(k)) delete process.env[k];
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
const L = await import('./p59-lib.mjs');
const { NAME, LOGIN, LAPTOP_A } = L;
const ENV = {
  ATRIUM_TERMINAL_SESSION: BOARD, ATRIUM_HERDR_SESSION: BOARD, ATRIUM_PORT: PORT,
  ATRIUM_DATA_DIR: path.join(DEV, 'data'), ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  ATRIUM_CLAUDE_PROJECTS: CONVOS, ATRIUM_CLAUDE_DESKTOP: 'none', ATRIUM_TEST_PREFIX: 'p355-none-',
  ATRIUM_TAILSCALE: path.join(REPO, 'app', 'test', 'e2e', 'p49-fake-tailscale.mjs'), P49_FAKE_TS_PORT: PORT,
  ATRIUM_WEB_HOSTS: NAME + ':' + SIM + ',localhost:' + SIM,
  ...(process.env.P355_DIST ? { ATRIUM_WEB_DIST: process.env.P355_DIST } : {}),
};
Object.assign(process.env, ENV);
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(CONVOS, { recursive: true });
const { logger, sleep, until } = await import('./harness.mjs');
const { assertTestBoard } = await import('./p9-guard.mjs');
assertTestBoard(ENV, { root: DEV });

const pwDir = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright');
const chromeExe = (() => { try { return fs.readdirSync(pwDir).filter((x) => /^chromium-\d+$/.test(x)).sort().reverse().map((x) => path.join(pwDir, x, 'chrome-win64', 'chrome.exe')).find((f) => fs.existsSync(f)); } catch { return null; } })();
const log = logger('p355-' + WHAT + '-' + TAG);
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
  FOLDERS.forEach((f, i) => { fs.mkdirSync(f, { recursive: true }); fs.writeFileSync(path.join(f, 'README.md'), '# mtask-p355-' + 'abcde'[i] + '\n'); });
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
  const SLEEPERS = Number(process.env.P355_SLEEPERS || 42);
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
  if (!have.has('asker')) await spawn({ cwd: F, name: 'asker', model: 'haiku', prompt: 'Create a folder named p355-x in the current directory using the mkdir shell command.', ...(leadId ? { parentSessionId: leadId } : {}) });
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
  if (window.__p353) return;
  const P = window.__p353 = { phase: 'first', t0: performance.now(), first: null, by: { first: {}, re: {}, sess: {}, term: {}, after: {} }, ev: { first: {}, re: {}, sess: {}, term: {}, after: {} }, n: { first: 0, re: 0, sess: 0, term: 0, after: 0 }, ws: null, reAt: null, reFirst: null };
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
const ctxOpts = (lang = 'ko', w = 390, h = 844) => ({ viewport: { width: w, height: h }, screen: { width: w, height: h === 793 ? 852 : h }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: SAFARI, locale: lang === 'ko' ? 'ko-KR' : 'en-US' });
const kb = (n) => Math.round(n / 102.4) / 10;

async function measure() {
  const pw = await import('playwright');
  const rows = [];
  await withSim(async () => {
    const browser = await pw.chromium.launch({ headless: true, ...(chromeExe ? { executablePath: chromeExe } : {}) });
    try {
      const ctx = await browser.newContext(ctxOpts());
      const p0 = await ctx.newPage(); await pair(p0); await p0.close();
      const ids = Object.fromEntries(call('session.list').map((s) => [s.name, s.sessionId]));
      for (let rep = 0; rep < Number(process.env.P355_REPS || 3); rep++) {
        const pg = await ctx.newPage();
        const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
        let phase = 'first'; const statics = { first: 0, re: 0, sess: 0, term: 0, after: 0 }; const files = {};
        pg.on('response', async (r) => { try { const u = new URL(r.url()); if (!/\.(js|css|woff2?)$/.test(u.pathname)) return; const b = await r.body(); statics[phase] += b.length; files[u.pathname] = b.length; } catch {} });
        await pg.addInitScript(INIT);
        const cdp = await ctx.newCDPSession(pg);
        await cdp.send('Performance.enable');
        const heap = async () => { await cdp.send('HeapProfiler.collectGarbage').catch(() => {}); await sleep(300); await cdp.send('HeapProfiler.collectGarbage').catch(() => {}); const m = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value])); return { heapMB: Math.round(m.JSHeapUsedSize / 1e5) / 10, nodes: m.Nodes }; };
        await pg.addInitScript(() => { try { localStorage.setItem('mt.mobileView', 'answer'); } catch {} });
        await pg.goto('http://localhost:' + SIM + '/');
        await pg.waitForFunction(() => window.__p353 && window.__p353.first, null, { timeout: 60000 });
        await sleep(6000);
        const h1 = await heap();
        const a = await pg.evaluate(() => { const P = window.__p353; return { first: P.first, n: P.n.first, by: P.by.first, ev: P.ev.first }; });
        phase = 're';
        await pg.evaluate(() => { const P = window.__p353; P.phase = 're'; P.reAt = performance.now(); P.ws.close(); });
        await pg.waitForFunction(() => window.__p353.reFirst != null, null, { timeout: 60000 }).catch(() => {});
        await sleep(6000);
        const h2 = await heap();
        const b = await pg.evaluate(() => { const P = window.__p353; return { reFirst: P.reFirst, n: P.n.re, by: P.by.re, ev: P.ev.re }; });
        const row = { rep, firstMs: a.first, firstKB: kb(a.n), firstBy: a.by, firstEv: a.ev, reMs: b.reFirst, reKB: kb(b.n), reBy: b.by, reEv: b.ev, heap1: h1, heap2: h2, staticKB: kb(statics.first), files, errors: errs };
        // 터미널 단계(새 화면만): 일하는 셸(sh0, ping이 돈다)의 세션 화면 → 터미널 보기 8초 → 답 보기 8초
        const TERM = process.env.P355_TERM || 'sh0';
        phase = 'sess';
        await pg.evaluate(() => { window.__p353.phase = 'sess'; });
        await pg.evaluate((id) => window.__mtMobile.open(id), ids[TERM]);
        await pg.waitForSelector('[data-role=mp-session]', { timeout: 20000 });
        await sleep(4000);
        row.heapSess = await heap();
        const hasTerm = await pg.$('[data-action=mp-view-term]');
        if (hasTerm) {
          phase = 'term';
          await pg.evaluate(() => { const P = window.__p353; P.phase = 'term'; P.termAt = performance.now(); });
          await pg.click('[data-action=mp-view-term]');
          await pg.waitForFunction(() => { const r = document.querySelector('[data-role=mp-termbox] .xterm-rows'); return r && r.textContent.trim().length > 0; }, null, { timeout: 30000 }).catch(() => {});
          row.termFirstMs = await pg.evaluate(() => Math.round(performance.now() - window.__p353.termAt));
          await sleep(8000);
          row.heapTerm = await heap();
          row.termsOpen = await pg.evaluate(() => (window.__mtMobileTerm ? window.__mtMobileTerm.terms.size : -1));
          phase = 'after';
          await pg.evaluate(() => { window.__p353.phase = 'after'; });
          await pg.click('[data-action=mp-view-answer]');
          await sleep(8000);
          row.heapAfter = await heap();
          row.termsAfter = await pg.evaluate(() => (window.__mtMobileTerm ? window.__mtMobileTerm.terms.size : -1));
          row.termDom = await pg.evaluate(() => document.querySelectorAll('.xterm').length);
        }
        const c = await pg.evaluate(() => { const P = window.__p353; return { sess: { n: P.n.sess, by: P.by.sess, ev: P.ev.sess }, term: { n: P.n.term, by: P.by.term, ev: P.ev.term }, after: { n: P.n.after, by: P.by.after, ev: P.ev.after } }; });
        row.sessKB = kb(c.sess.n); row.sessBy = c.sess.by; row.sessEv = c.sess.ev;
        row.termKB = kb(c.term.n); row.termBy = c.term.by; row.termEv = c.term.ev; row.termStaticKB = kb(statics.term);
        row.afterKB = kb(c.after.n); row.afterBy = c.after.by; row.afterEv = c.after.ev;
        await pg.evaluate(() => window.__mtMobile.open(null)).catch(() => {});
        rows.push(row);
        log('#' + rep + ' 처음 ' + row.firstKB + 'KB ' + row.firstMs + 'ms / 다시 ' + row.reKB + 'KB ' + row.reMs + 'ms / 힙 ' + h1.heapMB + '→' + h2.heapMB + 'MB / 정적 ' + row.staticKB + 'KB'
          + (hasTerm ? ' / 세션 ' + row.heapSess.heapMB + 'MB 터미널 ' + row.heapTerm.heapMB + 'MB(' + row.termKB + 'KB, 정적 ' + row.termStaticKB + 'KB, 붙음 ' + row.termsOpen + ', 첫 글 ' + row.termFirstMs + 'ms) 닫은 뒤 ' + row.heapAfter.heapMB + 'MB(' + row.afterKB + 'KB, 붙음 ' + row.termsAfter + ', xterm ' + row.termDom + ')' : ''));
        if (rep === 0) await pg.screenshot({ path: path.join(OUT, 'measure.png') }).catch(() => {});
        await pg.close();
      }
      await ctx.close();
    } finally { await browser.close(); }
  });
  fs.writeFileSync(path.join(OUT, 'measure.json'), JSON.stringify(rows, null, 2));
  const first = rows.flatMap((r) => Object.keys(r.firstBy || {}));
  check('처음 열기에 plan.list·merger.status가 없다', !first.includes('plan.list') && !first.includes('merger.status'), [...new Set(first)]);
  if (rows[0] && rows[0].heapTerm) check('터미널은 하나만 붙고 답 보기로 바꾸면 떼고 버린다', rows.every((r) => r.termsOpen === 1 && r.termsAfter === 0 && r.termDom === 0), rows.map((r) => [r.termsOpen, r.termsAfter, r.termDom]));
  check('측정 끝, 화면 오류 없음', rows.length > 0 && rows.every((x) => !x.errors.length), rows.map((x) => x.errors));
}

// ---- 그림(새 화면) ----
async function shots() {
  const pw = await import('playwright');
  await withSim(async () => {
    const browser = await pw.chromium.launch({ headless: true, ...(chromeExe ? { executablePath: chromeExe } : {}) });
    try {
      const combos = (process.env.P355_COMBOS || 'ko:390x844,en:393x793,ko:393x793').split(',');
      for (let ci = 0; ci < combos.length; ci++) {
        const [lang, size] = combos[ci].split(':'); const [W, H] = size.split('x').map(Number);
        const last = ci === combos.length - 1;
        const tag = lang + '-' + W + 'x' + H;
        call('settings.set', { key: 'language', value: lang });
        const ctx = await browser.newContext(ctxOpts(lang, W, H));
        const p0 = await ctx.newPage(); await pair(p0); await p0.close();
        const pg = await ctx.newPage();
        const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
        await pg.addInitScript(() => { try { if (!sessionStorage.getItem('p355-init')) { sessionStorage.setItem('p355-init', '1'); localStorage.setItem('mt.mobileView', 'answer'); localStorage.setItem('mt.mobileKeysOpen', '0'); localStorage.setItem('mt.mobileTab', 'home'); } } catch {} });
        await pg.goto('http://localhost:' + SIM + '/');
        await pg.waitForSelector('[data-role=mp-ready]', { state: 'attached', timeout: 60000 });
        await sleep(1500);
        const shot = async (n) => { await sleep(700); await pg.screenshot({ path: path.join(OUT, tag + '-' + n + '.png') }); };
        const box = (sel) => pg.evaluate((s) => [...document.querySelectorAll(s)].map((e) => { const r = e.getBoundingClientRect(); return { w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10, top: Math.round(r.top * 10) / 10, bottom: Math.round(r.bottom * 10) / 10, left: Math.round(r.left), bg: getComputedStyle(e).backgroundColor, key: e.dataset.mpKey || e.dataset.action || '' }; }), sel);
        const ids = Object.fromEntries(call('session.list').map((s) => [s.name, s.sessionId]));
        const open = async (name) => { await pg.evaluate((id) => window.__mtMobile.open(id), ids[name]); await pg.waitForSelector('[data-role=mp-session][data-session="' + ids[name] + '"]', { timeout: 20000 }); await sleep(900); };
        const back = async () => { await pg.click('[data-action=mp-back]'); await pg.waitForSelector('[data-role=mp-session]', { state: 'detached', timeout: 10000 }).catch(() => {}); };
        const xtermText = (re) => pg.waitForFunction((src) => { const r = document.querySelector('[data-role=mp-termbox] .xterm-rows'); return r && (src ? new RegExp(src).test(r.textContent) : r.textContent.trim().length > 0); }, re || null, { timeout: 30000 }).then(() => true, () => false);
        // 아래 끝: 홈의 아래 탭이 화면 안(잘리지 않음)
        await shot('1-home');
        const ih = await pg.evaluate(() => window.innerHeight);
        const homeEdge = { root: (await box('[data-role=mp]'))[0], tabs: (await box('.mt-mp-tabs'))[0], ih };
        check('[' + tag + '] 아래 끝: 페이지 뿌리와 아래 탭이 화면 안(잘리지 않음)', homeEdge.root.bottom <= ih + 0.01 && homeEdge.tabs.bottom <= ih + 0.01 && homeEdge.root.bottom >= ih - 1, homeEdge);
        // 답 보기(응답 필요 세션): 보기 고르기와 키 줄(접힘)
        await open('asker');
        await pg.waitForSelector('[data-role=mp-ask]', { timeout: 20000 }).catch(() => {});
        await shot('2-answer-need');
        const seg = await box('[data-role=mp-viewpick] [role=tab]');
        check('[' + tag + '] 세션 화면 위에 "답 | 터미널"(한 번 누르기), 누를 곳 36px 이상', seg.length === 2 && seg.every((x) => x.h >= 36), seg);
        let keys = await box('.mt-mp-key');
        const one = await box('[data-mp-key="1"]');
        check('[' + tag + '] 키 줄 접힘: 한 줄 8칸(펼침 + Esc ⏎ ↑ ↓ 1 2 3), 칸 40px 이상, 기다리면 숫자 노랑', keys.length === 8 && new Set(keys.map((k) => k.top)).size === 1 && keys.every((k) => k.w >= 40 && k.h >= 40) && /255, 224, 61/.test(one[0].bg), keys.map((k) => k.key + ':' + k.w + 'x' + k.h));
        const edgeS = { input: (await box('[data-role=mp-input]'))[0], ih };
        check('[' + tag + '] 아래 끝: 세션 화면의 입력 줄이 화면 안', edgeS.input && edgeS.input.bottom <= ih + 0.01, edgeS);
        await pg.click('[data-action=mp-keys-more]');
        await sleep(300);
        keys = await box('.mt-mp-key');
        const rowsTop = [...new Set(keys.map((k) => k.top))];
        const want = ['esc', 'enter', 'backspace', 'tab', 'shift+tab', 'ctrl+c', 'left', 'up', 'down', 'right', '1', '2', '3', '4', 'y', 'n', 'space', 'slash'];
        check('[' + tag + '] 키 줄 펼침: 세 줄, 사용자가 말한 키 모두, 칸 40px 이상', rowsTop.length === 3 && want.every((k) => keys.some((x) => x.key === k)) && keys.every((k) => k.w >= 40 && k.h >= 40), { rows: rowsTop.length, keys: keys.map((k) => k.key + ':' + k.w + 'x' + k.h) });
        await shot('3-keys-open');
        // 터미널 보기(응답 필요 세션): 질문 카드가 터미널 위에 겹친다
        await pg.click('[data-action=mp-view-term]');
        const xt = await xtermText();
        await pg.waitForSelector('[data-role=mp-term-ask]', { timeout: 15000 }).catch(() => {});
        await sleep(1200);
        await shot('4-term-need');
        const ask = await box('[data-role=mp-term-ask] [data-mp-choice]');
        const ov = (await box('[data-role=mp-term-ask]'))[0]; const tbx = (await box('[data-role=mp-termbox]'))[0];
        check('[' + tag + '] 터미널 보기: 살아 있는 터미널(xterm) + 작은 질문 카드(보기 모두 + Esc가 카드 안, 터미널의 절반 아래)', xt && ask.length >= 5 && ask.every((x) => x.bottom <= ov.bottom + 0.5) && ov.h <= tbx.h * 0.5, { xt, ask: ask.map((x) => x.key + ':' + x.bottom), ov, term: tbx && tbx.h });
        await pg.click('[data-action=mp-ask-hide]'); await sleep(300); await shot('5-term-need-hidden');
        check('[' + tag + '] 질문 카드를 접으면 알약이 남는다', !!(await pg.$('[data-action=mp-ask-show]')));
        await pg.click('[data-action=mp-keys-more]'); // 접기(이 기기에 기억)
        await back();
        // 기억: 다시 열면 터미널 보기. 일하는 셸(sh0, ping)
        await open('sh0');
        check('[' + tag + '] 마지막에 고른 보기(터미널)를 기억한다', !!(await pg.$('[data-role=mp-termview]')));
        await xtermText('127\\.0\\.0\\.1');
        await sleep(1500);
        await shot('6-term-working-shell');
        const tcount = await pg.evaluate(() => window.__mtMobileTerm.terms.size);
        check('[' + tag + '] 붙은 터미널은 하나', tcount === 1, tcount);
        // 손가락으로 끌어 스크롤(휠로 바뀐다): 오류 없이
        const tb = (await box('[data-role=mp-termbox]'))[0];
        const cdp = await ctx.newCDPSession(pg);
        const touch = (type, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: 150, y }] });
        await touch('touchStart', tb.top + 60); for (let y = tb.top + 70; y < tb.top + 200; y += 15) await touch('touchMove', y); await touch('touchEnd', 0);
        await sleep(300);
        // 일하는 에이전트(lead)를 터미널 보기로: 지시를 보내고 일하는 동안 찍는다
        await back();
        await open('lead');
        await xtermText();
        if (lang === 'ko' && W === 390) {
          await pg.fill('[data-field=mp-text]', 'Count from 1 to 30, one number per line, then say done. Do not use tools.');
          await pg.click('[data-action=mp-send]');
          const working = await until(() => (call('session.list').find((x) => x.name === 'lead') || {}).state === 'working', 60000, 500).then(() => true, () => false);
          await sleep(2500);
          await shot('7-term-working-agent');
          check('[' + tag + '] 일하는 에이전트를 터미널 보기로 본다', working);
          await until(() => (call('session.list').find((x) => x.name === 'lead') || {}).state !== 'working', 120000, 1000).catch(() => {});
          await sleep(1500);
        }
        await shot('8-term-agent');
        // 바로 치기: 화면 키보드를 터미널에. 셸(sh4)에 친다
        await back();
        await open('sh4');
        await pg.waitForFunction(() => document.querySelector('[data-role=mp-termbox] .xterm-helper-textarea'), null, { timeout: 30000 });
        await sleep(800);
        await pg.click('[data-action=mp-type-direct]');
        const focused = await pg.evaluate(() => !!document.activeElement && document.activeElement.classList.contains('xterm-helper-textarea') && document.activeElement.getAttribute('inputmode') === 'text');
        await pg.setViewportSize({ width: W, height: 500 }); await sleep(800);
        const mark = 'p355-' + lang + W;
        await pg.keyboard.type('echo ' + mark); await pg.keyboard.press('Enter');
        const typed = await pg.waitForFunction((m) => { const r = document.querySelector('[data-role=mp-termbox] .xterm-rows'); return r && r.textContent.split(m).length > 2; }, mark, { timeout: 15000 }).then(() => true, () => false);
        await sleep(600);
        const kbBox = { keys: (await box('[data-role=mp-keys]'))[0], seg: (await box('[data-role=mp-viewpick]'))[0], term: (await box('[data-role=mp-termbox]'))[0] };
        await shot('9-keyboard-direct');
        check('[' + tag + '] 바로 치기: 터미널 입력 칸에 초점(키보드), 친 글이 셸에 들어간다, 키 줄이 보이는 칸 안', focused && typed && kbBox.keys && kbBox.keys.bottom <= 500 + 0.01, { focused, typed, kbBox });
        await pg.click('[data-action=mp-type-direct]'); await sleep(300);
        // 답 보기 + 키보드(입력 칸)
        await pg.click('[data-action=mp-view-answer]'); await sleep(800);
        const tAfter = await pg.evaluate(() => ({ n: window.__mtMobileTerm.terms.size, dom: document.querySelectorAll('.xterm').length }));
        check('[' + tag + '] 답 보기로 바꾸면 터미널을 떼고 버린다', tAfter.n === 0 && tAfter.dom === 0, tAfter);
        await pg.focus('[data-field=mp-text]'); await sleep(500);
        const kb2 = { keys: (await box('[data-role=mp-keys]'))[0], input: (await box('[data-role=mp-input]'))[0] };
        check('[' + tag + '] 키보드 흉내(보이는 높이 500): 키 줄과 입력 줄이 화면 안 아래', kb2.keys && kb2.input && kb2.input.bottom <= 500 + 0.01 && kb2.keys.bottom <= kb2.input.top + 1 && kb2.input.bottom >= 460, kb2);
        await shot('10-keyboard-answer');
        await pg.setViewportSize({ width: W, height: H }); await sleep(500);
        await back();
        if (ci === 0) {
          await sleep(3000);
          const rep = call('remote.errors', {});
          const lay = rep && rep.layout ? Object.values(rep.layout)[0] : null;
          check('[' + tag + '] 배치 값이 원격 기록에 한 번 남는다(atrium remote errors)', !!(lay && lay.lay && lay.lay.ih && lay.lay.rb != null), lay);
        }
        // 마지막: 겹친 질문 카드로 답한다(1 = 예)
        if (last) {
          await open('asker');
          await pg.click('[data-action=mp-view-term]').catch(() => {});
          await pg.waitForSelector('[data-role=mp-term-ask] [data-mp-choice="1"]', { timeout: 20000 });
          await pg.click('[data-role=mp-term-ask] [data-mp-choice="1"]');
          const answered = await until(() => (call('session.list').find((x) => x.name === 'asker') || {}).state !== 'waiting', 60000, 1000).then(() => true, () => false);
          await sleep(1500);
          await shot('11-term-answered');
          check('[' + tag + '] 터미널 위에 겹친 질문 카드의 번호 단추로 답한다', answered);
        }
        check('[' + tag + '] 그림, 화면 오류 없음', !errs.length, errs);
        await ctx.close();
      }
    } finally { await browser.close(); }
  });
}

async function cycles() {
  const pw = await import('playwright');
  const rows = [];
  await withSim(async () => {
    const browser = await pw.chromium.launch({ headless: true, ...(chromeExe ? { executablePath: chromeExe } : {}) });
    try {
      const ctx = await browser.newContext(ctxOpts());
      const p0 = await ctx.newPage(); await pair(p0); await p0.close();
      const ids = Object.fromEntries(call('session.list').map((s) => [s.name, s.sessionId]));
      const pg = await ctx.newPage();
      await pg.addInitScript(() => { try { localStorage.setItem('mt.mobileView', 'answer'); } catch {} });
      const cdp = await ctx.newCDPSession(pg);
      await cdp.send('Performance.enable');
      const heap = async () => { for (let i = 0; i < 3; i++) { await cdp.send('HeapProfiler.collectGarbage').catch(() => {}); await sleep(300); } const m = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value])); return Math.round(m.JSHeapUsedSize / 1e4) / 100; };
      await pg.goto('http://localhost:' + SIM + '/');
      await pg.waitForSelector('[data-role=mp-ready]', { state: 'attached', timeout: 60000 });
      await pg.evaluate((id) => window.__mtMobile.open(id), ids[process.env.P355_TERM || 'sh0']);
      await pg.waitForSelector('[data-role=mp-session]'); await sleep(3000);
      rows.push({ at: 'session', heap: await heap() });
      for (let i = 0; i < Number(process.env.P355_CYCLES || 6); i++) {
        if (!process.env.P355_NOTERM) {
          await pg.click('[data-action=mp-view-term]');
          await pg.waitForFunction(() => { const r = document.querySelector('[data-role=mp-termbox] .xterm-rows'); return r && r.textContent.trim().length > 0; }, null, { timeout: 30000 }).catch(() => {});
        }
        await sleep(4000);
        const open = await heap();
        if (!process.env.P355_NOTERM) await pg.click('[data-action=mp-view-answer]');
        await sleep(3000);
        rows.push({ i, open, closed: await heap(), terms: await pg.evaluate(() => (window.__mtMobileTerm ? window.__mtMobileTerm.terms.size : -1)) });
      }
      log(JSON.stringify(rows));
      await ctx.close();
    } finally { await browser.close(); }
  });
  fs.writeFileSync(path.join(OUT, 'cycles.json'), JSON.stringify(rows, null, 2));
  const closed = rows.filter((r) => r.closed != null).map((r) => r.closed);
  // 닫은 뒤 힙은 처음 몇 번 V8 컴파일 코드(code)만큼 늘다가 멈춘다(leak 모드의 스냅숏 견주기: 남는 객체는 몇 KB). 마지막 네 번 사이 0.2MB 안
  const tail = closed.slice(-4);
  check('터미널을 열고 닫기를 되풀이하면 닫은 뒤 힙이 멈춘다(마지막 네 번 사이 0.2MB 안)', closed.length < 8 || Math.max(...tail) - Math.min(...tail) <= 0.2, closed);
}

async function snapCounts(cdp) {
  for (let i = 0; i < 3; i++) { await cdp.send('HeapProfiler.collectGarbage').catch(() => {}); await sleep(200); }
  let buf = '';
  const on = (e) => { buf += e.chunk; };
  cdp.on('HeapProfiler.addHeapSnapshotChunk', on);
  await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
  cdp.off('HeapProfiler.addHeapSnapshotChunk', on);
  const s = JSON.parse(buf);
  const f = s.snapshot.meta.node_fields, types = s.snapshot.meta.node_types[0];
  const nf = f.length, ti = f.indexOf('type'), ni = f.indexOf('name'), si = f.indexOf('self_size');
  const counts = {};
  for (let i = 0; i < s.nodes.length; i += nf) {
    const t = types[s.nodes[i + ti]];
    const name = (t === 'object' || t === 'closure') ? t + ':' + s.strings[s.nodes[i + ni]] : 'T:' + t;
    const c = counts[name] || (counts[name] = { n: 0, size: 0 });
    c.n++; c.size += s.nodes[i + si];
  }
  return counts;
}
async function leakHunt() {
  const pw = await import('playwright');
  await withSim(async () => {
    const browser = await pw.chromium.launch({ headless: true, ...(chromeExe ? { executablePath: chromeExe } : {}) });
    try {
      const ctx = await browser.newContext(ctxOpts());
      const p0 = await ctx.newPage(); await pair(p0); await p0.close();
      const ids = Object.fromEntries(call('session.list').map((s) => [s.name, s.sessionId]));
      const pg = await ctx.newPage();
      await pg.addInitScript(() => { try { localStorage.setItem('mt.mobileView', 'answer'); } catch {} });
      const cdp = await ctx.newCDPSession(pg);
      await pg.goto('http://localhost:' + SIM + '/');
      await pg.waitForSelector('[data-role=mp-ready]', { state: 'attached', timeout: 60000 });
      await pg.evaluate((id) => window.__mtMobile.open(id), ids[process.env.P355_TERM || 'sh0']);
      await pg.waitForSelector('[data-role=mp-session]'); await sleep(2000);
      const cyc = async () => { await pg.click('[data-action=mp-view-term]'); await pg.waitForFunction(() => { const r = document.querySelector('[data-role=mp-termbox] .xterm-rows'); return r && r.textContent.trim().length > 0; }, null, { timeout: 30000 }).catch(() => {}); await sleep(2500); await pg.click('[data-action=mp-view-answer]'); await sleep(1500); };
      await cyc();
      const A = await snapCounts(cdp);
      for (let i = 0; i < 4; i++) await cyc();
      const B = await snapCounts(cdp);
      const diff = Object.keys(B).map((k) => ({ k, dn: B[k].n - ((A[k] || {}).n || 0), ds: B[k].size - ((A[k] || {}).size || 0) })).filter((x) => x.dn > 0).sort((a, b) => b.ds - a.ds).slice(0, 40);
      const byType = Object.keys(B).filter((k) => k.startsWith('T:')).map((k) => ({ k, dn: B[k].n - ((A[k] || {}).n || 0), ds: B[k].size - ((A[k] || {}).size || 0), total: B[k].size }));
      log('types ' + JSON.stringify(byType));
      const byN = Object.keys(B).map((k) => ({ k, dn: B[k].n - ((A[k] || {}).n || 0) })).filter((x) => x.dn >= 4).sort((a, b) => b.dn - a.dn).slice(0, 40);
      fs.writeFileSync(path.join(OUT, 'leak.json'), JSON.stringify({ diff, byN }, null, 2));
      log(JSON.stringify({ diff: diff.slice(0, 25), byN: byN.slice(0, 25) }));
      await ctx.close();
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
  else if (WHAT === 'cycles') await cycles();
  else if (WHAT === 'leak') await leakHunt();
  else if (WHAT === 'stop') await stopBoard();
  else if (WHAT === 'backend-stop') log(atrium('backend', 'stop').slice(0, 200));
  else if (WHAT === 'backend-start') log(atrium('backend', 'start').slice(0, 200));
  else if (WHAT === 'status') { const l = call('session.list'); log(JSON.stringify(l.reduce((m, s) => ((m[s.state] = (m[s.state] || 0) + 1), m), {})) + ' n=' + l.length); }
} catch (e) {
  check('시험이 끝까지 돌았다', false, e.stack || e.message);
} finally {
  fs.writeFileSync(path.join(OUT, 'p355-' + WHAT + '.json'), JSON.stringify({ results }, null, 2));
  const bad = results.filter((r) => !r.ok);
  log('결과 ' + (results.length - bad.length) + '/' + results.length + ' 통과' + (bad.length ? ' 실패: ' + bad.map((b) => b.name).join(', ') : ''));
  process.exit(bad.length ? 1 : 0);
}
