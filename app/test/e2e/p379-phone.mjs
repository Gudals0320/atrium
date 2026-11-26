// P379 창 시험: 휴대폰 입력칸 글자 바닥(16px, 글자 크기 최소에서도)과 스티어링을 받지 않는 세션(OmO)의 휴대폰 단추.
// 따로 띄운 개발용 판(atrium-dev-p379, 48106)만 쓴다. 휴대폰 흉내 프록시 48206. 실제 대화는 쓰지 않는다.
// 판: 셸 sh0, haiku c1(첫 요청 없음, 스티어링 받는 세션), omo o1(자체 오케스트레이션, 스티어링 없음).
// 흉내: 393x852 홈 화면 앱(display-mode standalone, navigator.standalone, 문서 높이 793), 390x844.
// 실행: node app/test/e2e/p379-phone.mjs <setup|shots|stop> [round]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const WHAT = process.argv[2] || 'setup';
const TAG = process.argv[3] || 'round-1';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const DEV = path.join(REPO, 'backend', '.dev');
const OUT = path.join(REPO, 'experiments', 'p379', TAG);
const CONVOS = 'C:\\Workspace\\mtask-p379-projects';
const F = 'C:\\Workspace\\mtask-p379-a';
const BOARD = 'atrium-dev-p379', PORT = '48106', SIM = 48206;
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_|HC_|MT_HERDR)/.test(k)) delete process.env[k];
for (const k of Object.keys(process.env)) if (/^(CLAUDECODE|CLAUDE_CODE_|CLAUDE_EFFORT|CLAUDE_PID|CLAUDE_AGENT_SDK|ELECTRON_RUN_AS_NODE)/.test(k)) delete process.env[k];
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
const L = await import('./p59-lib.mjs');
const { NAME, LOGIN, LAPTOP_A } = L;
const ENV = {
  ATRIUM_TERMINAL_SESSION: BOARD, ATRIUM_HERDR_SESSION: BOARD, ATRIUM_PORT: PORT,
  ATRIUM_DATA_DIR: path.join(DEV, 'data'), ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  ATRIUM_CLAUDE_PROJECTS: CONVOS, ATRIUM_CLAUDE_DESKTOP: 'none', ATRIUM_TEST_PREFIX: 'p379-none-',
  ATRIUM_TAILSCALE: path.join(REPO, 'app', 'test', 'e2e', 'p49-fake-tailscale.mjs'), P49_FAKE_TS_PORT: PORT,
  ATRIUM_WEB_HOSTS: NAME + ':' + SIM + ',localhost:' + SIM,
  ...(process.env.P379_DIST ? { ATRIUM_WEB_DIST: process.env.P379_DIST } : {}),
};
Object.assign(process.env, ENV);
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(CONVOS, { recursive: true });
const { logger, sleep, until } = await import('./harness.mjs');
const { assertTestBoard } = await import('./p9-guard.mjs');
assertTestBoard(ENV, { root: DEV });

const pwDir = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright');
const chromeExe = (() => { try { return fs.readdirSync(pwDir).filter((x) => /^chromium-\d+$/.test(x)).sort().reverse().map((x) => path.join(pwDir, x, 'chrome-win64', 'chrome.exe')).find((f) => fs.existsSync(f)); } catch { return null; } })();
const log = logger('p379-' + WHAT + '-' + TAG);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 120000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== '' ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 1600)) : '')); };
const SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';


const list = () => call('session.list');
const byName = (n) => list().find((x) => x.name === n);
async function setupBoard() {
  log(atrium('backend', 'start').trim().slice(0, 300));
  await sleep(1500);
  fs.mkdirSync(F, { recursive: true }); fs.writeFileSync(path.join(F, 'README.md'), '# mtask-p379-a\n');
  call('workspace.open', { path: F, select: true });
  call('settings.set', { key: 'language', value: 'ko' });
  const have = new Set(list().map((x) => x.name));
  if (!have.has('sh0')) { call('session.spawn', { cwd: F, kind: 'shell', name: 'sh0' }); await sleep(600); }
  if (!have.has('c1')) { call('session.spawn', { cwd: F, name: 'c1', model: 'haiku' }); await sleep(800); }
  if (!have.has('o1')) call('session.spawn', { cwd: F, kind: 'omo', name: 'o1', model: 'chatgpt-subscription/gpt-6-luna-fast', effort: 'low' });
  await until(() => ['sh0', 'c1', 'o1'].every((n) => { const x = byName(n); return x && x.state !== 'starting'; }), 120000, 2000).catch(() => log('준비 기다림 넘김'));
  const l = list();
  check('판: ' + l.map((x) => x.name + ':' + x.kind + ':' + x.state + (x.orch ? ':orch' : '')).join(' '), l.length >= 3 && !!(byName('o1') || {}).orch);
}

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
// 흉내 셋: 홈 화면 앱(393x852, 문서 793), Safari 탭(393x793, 화면 852), 390x844
const COMBOS = { sa852: { w: 393, h: 852, sh: 852, sa: true }, tab793: { w: 393, h: 793, sh: 852, sa: false }, p390: { w: 390, h: 844, sh: 844, sa: false } };
const ctxOpts = (c) => ({ viewport: { width: c.w, height: c.h }, screen: { width: c.w, height: c.sh }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: SAFARI, locale: 'ko-KR', reducedMotion: 'reduce' });
// 페이지 안 iOS 값 덮어쓰기: __p379Fake = { ih, vh, vt, ch } (없는 칸은 진짜 값)
const FAKE = (sa) => {
  const F = window.__p379Fake = window.__p379Fake || {};
  const vp = VisualViewport.prototype;
  const dH = Object.getOwnPropertyDescriptor(vp, 'height'), dT = Object.getOwnPropertyDescriptor(vp, 'offsetTop');
  Object.defineProperty(vp, 'height', { configurable: true, get() { return F.vh != null ? F.vh : dH.get.call(this); } });
  Object.defineProperty(vp, 'offsetTop', { configurable: true, get() { return F.vt != null ? F.vt : dT.get.call(this); } });
  const dI = Object.getOwnPropertyDescriptor(window, 'innerHeight');
  Object.defineProperty(window, 'innerHeight', { configurable: true, get() { return F.ih != null ? F.ih : dI.get.call(window); } });
  const dC = Object.getOwnPropertyDescriptor(Element.prototype, 'clientHeight');
  Object.defineProperty(Element.prototype, 'clientHeight', { configurable: true, get() { return this === document.documentElement && F.ch != null ? F.ch : dC.get.call(this); } });
  if (sa) { Object.defineProperty(Navigator.prototype, 'standalone', { configurable: true, get: () => true }); F.ch = 793; }
  const realScroll = window.scrollTo.bind(window);
  window.scrollTo = (...a) => { if (F.vt) { F.vt = 0; F.scrolls = (F.scrolls || 0) + 1; setTimeout(() => window.visualViewport.dispatchEvent(new Event('scroll')), 30); } return realScroll(...a); };
  window.__p379Set = (o) => { Object.assign(F, o); for (const k of Object.keys(o)) if (o[k] == null) delete F[k]; window.visualViewport.dispatchEvent(new Event('resize')); window.dispatchEvent(new Event('resize')); };
};

// 휴대폰 페이지의 입력칸 종류를 그대로 만들어 실제 글자 크기를 잰다(바닥 규칙을 빼면 고치기 전 값)
const PROBE = () => {
  const host = document.createElement('div'); host.id = 'p379-probe'; host.style.cssText = 'position:fixed;left:-9999px;top:0;width:300px';
  host.innerHTML = '<form class="mt-mp-input"><textarea data-k="session-input"></textarea></form>'
    + '<div class="mt-mp-reply"><input data-k="answer-reply"></div>'
    + '<div class="mt-mp-search"><input type="search" data-k="search"></div>'
    + '<input class="mt-mp-field" data-k="spawn-name">'
    + '<div class="mt-ms-over"><div class="mt-mp-reply"><input data-k="over-reply"></div></div>'
    + '<div class="mt-dc-sheet"><input class="mt-dc-input" data-k="todo-line"></div>';
  document.body.appendChild(host);
  const read = () => Object.fromEntries([...host.querySelectorAll('[data-k]')].map((e) => [e.dataset.k, parseFloat(getComputedStyle(e).fontSize)]));
  const after = read();
  // 고치기 전: 바닥 규칙을 잠시 끈다
  const hit = [];
  for (const sh of document.styleSheets) { let rs; try { rs = sh.cssRules; } catch { continue; } for (let i = 0; i < rs.length; i++) if (rs[i].selectorText && rs[i].selectorText.startsWith('html.mt-mp-on :is(') && /16px/.test(rs[i].cssText)) hit.push([sh, i, rs[i].cssText]); }
  for (const [sh, i] of hit.reverse()) sh.deleteRule(i);
  const before = read();
  for (const [sh, i, txt] of hit.reverse()) sh.insertRule(txt, i);
  host.remove();
  return { after, before, floorRules: hit.length, rootPx: parseFloat(getComputedStyle(document.documentElement).fontSize) };
};

async function shots() {
  const pw = await import('playwright');
  await withSim(async () => {
    const browser = await pw.chromium.launch({ headless: true, ...(chromeExe ? { executablePath: chromeExe } : {}) });
    try {
      const pick = (process.env.P379_COMBOS || 'sa852,p390').split(',');
      const ids = Object.fromEntries(list().map((x) => [x.name, x.sessionId]));
      for (const name of pick) for (const sc of ['min', 'def']) {
        const c = COMBOS[name]; const tag = name + '-' + sc;
        const ctx = await browser.newContext(ctxOpts(c));
        const p0 = await ctx.newPage(); await pair(p0); await p0.close();
        const pg = await ctx.newPage();
        const cdp = await ctx.newCDPSession(pg);
        if (c.sa) {
          await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'display-mode', value: 'standalone' }] });
          await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 59, left: 0, bottom: 34, right: 0 } }).catch(() => {});
        }
        const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
        await pg.addInitScript(FAKE, c.sa);
        await pg.addInitScript((sc) => { try { if (!sessionStorage.getItem('p379-init')) { sessionStorage.setItem('p379-init', '1'); localStorage.setItem('mt.mobileView', 'term'); localStorage.setItem('mt.mobileKeysOpen', '0'); localStorage.setItem('mt.mobileTab', 'home'); if (sc === 'min') localStorage.setItem('mt.phoneTermScale', '0.3'); else localStorage.removeItem('mt.phoneTermScale'); } } catch {} }, sc);
        await pg.goto('http://localhost:' + SIM + '/');
        await pg.waitForSelector('[data-role=mp-ready]', { state: 'attached', timeout: 60000 });
        await sleep(1500);
        const shot = async (n) => { await sleep(600); await pg.screenshot({ path: path.join(OUT, tag + '-' + n + '.png') }); log('그림 ' + tag + '-' + n + '.png'); };
        const open = async (n) => { await pg.evaluate((id) => window.__mtMobile.open(id), ids[n]); await pg.waitForSelector('[data-role=mp-session][data-session="' + ids[n] + '"]', { timeout: 20000 }); await sleep(1200); };
        const back = async () => { await pg.click('[data-action=mp-back]'); await pg.waitForSelector('[data-role=mp-session]', { state: 'detached', timeout: 10000 }).catch(() => {}); await sleep(400); };
        // 1) 입력칸 글자 크기(모든 종류)
        const pr = await pg.evaluate(PROBE);
        const minAfter = Math.min(...Object.values(pr.after));
        check('[' + tag + '] 입력칸 글자 모두 16px 이상(페이지 글자 ' + pr.rootPx + 'px)', pr.floorRules === 1 && minAfter >= 16, pr);
        // 2) OmO 세션: 입력칸에 초점 → 확대 없음, 단추 흐림
        await open('o1');
        await shot('1-omo-session');
        const ta = '[data-role=mp-input] textarea';
        await pg.tap(ta); await sleep(500);
        const z = await pg.evaluate((s) => { const e = document.querySelector(s); return { focused: document.activeElement === e, fs: parseFloat(getComputedStyle(e).fontSize), vvScale: window.visualViewport.scale, iw: window.innerWidth }; }, ta);
        if (c.sa) { await pg.evaluate(() => window.__p379Set({ ih: 500, vh: 500 })); } else await pg.setViewportSize({ width: c.w, height: 500 });
        await sleep(900);
        await shot('2-omo-focus-kb');
        check('[' + tag + '] 입력 줄 초점: 글자 ' + z.fs + 'px ≥ 16, 확대 없음(visualViewport.scale 1)', z.focused && z.fs >= 16 && z.vvScale === 1, z);
        if (c.sa) await pg.evaluate(() => window.__p379Set({ ih: null, vh: null })); else await pg.setViewportSize({ width: c.w, height: c.h });
        await pg.evaluate(() => document.activeElement && document.activeElement.blur()); await sleep(700);
        const st = await pg.$eval('[data-action=mp-steer]', (e) => ({ border: getComputedStyle(e).borderStyle, off: e.dataset.off || null, ariaDisabled: e.getAttribute('aria-disabled'), pressed: e.getAttribute('aria-pressed'), color: getComputedStyle(e).color, bg: getComputedStyle(e).backgroundColor, opacity: getComputedStyle(e).opacity, title: e.title }));
        const sendBtn = await pg.$eval('[data-action=mp-send]', (e) => getComputedStyle(e).color);
        await pg.tap('[data-action=mp-steer]', { force: true }); await sleep(400); // aria-disabled라 Playwright가 기다린다: 사람은 누를 수 있다
        const toastText = await pg.$eval('.mt-mp-toast, [data-role=toast], .mt-toast', (e) => e.textContent).catch(() => null);
        await shot('3-omo-steer-tap');
        const st2 = await pg.$eval('[data-action=mp-steer]', (e) => e.getAttribute('aria-pressed'));
        check('[' + tag + '] OmO 스티어링 단추: 흐림(data-off orchestrates, aria-disabled, opacity 1), 눌러도 켜지지 않고 까닭', st.off === 'orchestrates' && st.ariaDisabled === 'true' && st.opacity === '1' && st2 === 'false' && /일이 끝난 뒤 들어갑니다/.test(toastText || ''), { st, st2, toastText, sendBtn });
        // 보내기: 실패하지 않고 대기열(쉬는 세션이면 바로 들어감)
        if (sc === 'def' && name === 'sa852') {
          await pg.fill(ta, 'p379 phone queue check: reply with the single word OK.');
          await pg.tap('[data-action=mp-send]'); await sleep(2500);
          await shot('4-omo-sent');
          const dl = call('delivery.list', { session: 'o1', limit: 3 });
          check('[' + tag + '] OmO에 보낸 글: 실패하지 않음(전달 기록)', dl.length && dl[0].status !== 'failed', dl.slice(0, 2).map((d) => ({ status: d.status, reason: d.reason, steerWhy: d.steerWhy })));
        }
        await pg.waitForSelector('.mt-mp-toast', { state: 'detached', timeout: 15000 }).catch(() => {}); // 알림이 다음 그림에 남지 않게
        await back();
        // 3) 받는 세션(c1): 단추는 보통, 누르면 켜진다
        await open('c1');
        const c1 = await pg.$eval('[data-action=mp-steer]', (e) => ({ off: e.dataset.off || null, ariaDisabled: e.getAttribute('aria-disabled'), color: getComputedStyle(e).color }));
        await pg.tap('[data-action=mp-steer]'); await sleep(400);
        const c1on = await pg.$eval('[data-action=mp-steer]', (e) => e.getAttribute('aria-pressed'));
        await shot('5-claude-steer-on');
        check('[' + tag + '] 받는 세션(c1) 단추: 보통, 누르면 켜짐', !c1.off && !c1.ariaDisabled && c1on === 'true', { c1, c1on });
        check('[' + tag + '] 페이지 오류 없음', errs.length === 0, errs.slice(0, 3));
        await ctx.close();
      }
    } finally { await browser.close(); }
  });
}

async function stopBoard() {
  for (const n of ['o1', 'c1', 'sh0']) { try { log(atrium('kill', n, '--yes').trim().slice(0, 200)); } catch (e) { log('kill ' + n + ' ' + e.message.slice(0, 160)); } }
  await sleep(3000);
  try { log(atrium('terminal', 'stop', '--yes').trim().slice(0, 200)); } catch (e) { log('terminal stop ' + e.message.slice(0, 160)); }
  try { log(atrium('backend', 'stop').trim().slice(0, 200)); } catch (e) { log('backend stop ' + e.message.slice(0, 160)); }
}

if (WHAT === 'setup') await setupBoard();
else if (WHAT === 'shots') await shots();
else if (WHAT === 'stop') await stopBoard();
const fail = results.filter((r) => !r.ok);
fs.writeFileSync(path.join(OUT, WHAT + '-results.json'), JSON.stringify(results, null, 1));
log('결과 ' + (results.length - fail.length) + '/' + results.length);
process.exit(fail.length ? 1 : 0);
