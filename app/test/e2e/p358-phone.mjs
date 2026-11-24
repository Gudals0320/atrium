// P358 창 시험: 휴대폰 세션 화면은 터미널만, 오른쪽 아래 작은 단추(응답 필요/할 일), 겹친 카드(작은 글, 절반 상한, 넘기기),
// 홈 화면 앱 아래 잘림, 화면별 배치 값, 붙기 전 입력. 따로 띄운 개발용 판(atrium-dev-p358, 48103)만 쓴다. 휴대폰 흉내 프록시 48203. 실제 대화는 쓰지 않는다.
// 판: 셸 둘(sh0: ping으로 일하는 셸, sh1), haiku 둘(asker: 권한 질문에 멈춤, lead: 한 번 답함). 할 일 카드는 페이지 안 흉내(phone.cards).
// 흉내: 393x852 홈 화면 앱(display-mode standalone, navigator.standalone, 문서 높이 793), 393x793 Safari 탭(screen 852), 390x844.
//   홈 화면 앱의 iOS 값(창·보이는 높이·보이는 위치·문서 높이)은 페이지 안에서 덮어써(window.__p358Fake) 실기기 숫자로 맞춘다.
// 실행: node app/test/e2e/p358-phone.mjs <setup|shots|before|compare|stop> [round]
//   before: P358_DIST=<옛 dist>로 띄운 판에서 같은 흉내의 숫자와 그림(전). compare: 사용자 그림과 후 그림을 나란히
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const WHAT = process.argv[2] || 'setup';
const TAG = process.argv[3] || 'round-1';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const DEV = path.join(REPO, 'backend', '.dev');
const OUT = path.join(REPO, 'experiments', 'p358', TAG);
const CONVOS = 'C:\\Workspace\\mtask-p358-projects';
const F = 'C:\\Workspace\\mtask-p358-a';
const BOARD = 'atrium-dev-p358', PORT = '48103', SIM = 48203;
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_|HC_|MT_HERDR)/.test(k)) delete process.env[k];
for (const k of Object.keys(process.env)) if (/^(CLAUDECODE|CLAUDE_CODE_|CLAUDE_EFFORT|CLAUDE_PID|CLAUDE_AGENT_SDK|ELECTRON_RUN_AS_NODE)/.test(k)) delete process.env[k];
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
const L = await import('./p59-lib.mjs');
const { NAME, LOGIN, LAPTOP_A } = L;
const ENV = {
  ATRIUM_TERMINAL_SESSION: BOARD, ATRIUM_HERDR_SESSION: BOARD, ATRIUM_PORT: PORT,
  ATRIUM_DATA_DIR: path.join(DEV, 'data'), ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  ATRIUM_CLAUDE_PROJECTS: CONVOS, ATRIUM_CLAUDE_DESKTOP: 'none', ATRIUM_TEST_PREFIX: 'p358-none-',
  ATRIUM_TAILSCALE: path.join(REPO, 'app', 'test', 'e2e', 'p49-fake-tailscale.mjs'), P49_FAKE_TS_PORT: PORT,
  ATRIUM_WEB_HOSTS: NAME + ':' + SIM + ',localhost:' + SIM,
  ...(process.env.P358_DIST ? { ATRIUM_WEB_DIST: process.env.P358_DIST } : {}),
};
Object.assign(process.env, ENV);
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(CONVOS, { recursive: true });
const { logger, sleep, until } = await import('./harness.mjs');
const { assertTestBoard } = await import('./p9-guard.mjs');
assertTestBoard(ENV, { root: DEV });

const pwDir = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright');
const chromeExe = (() => { try { return fs.readdirSync(pwDir).filter((x) => /^chromium-\d+$/.test(x)).sort().reverse().map((x) => path.join(pwDir, x, 'chrome-win64', 'chrome.exe')).find((f) => fs.existsSync(f)); } catch { return null; } })();
const log = logger('p358-' + WHAT + '-' + TAG);
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
  fs.mkdirSync(F, { recursive: true }); fs.writeFileSync(path.join(F, 'README.md'), '# mtask-p358-a\n');
  call('workspace.open', { path: F, select: true });
  call('settings.set', { key: 'language', value: 'ko' });
  const have = new Set(list().map((x) => x.name));
  for (const name of ['sh0', 'sh1']) if (!have.has(name)) { call('session.spawn', { cwd: F, kind: 'shell', name }); await sleep(600); }
  await until(() => list().filter((x) => x.kind === 'shell' && x.state !== 'starting').length >= 2, 90000, 2000).catch(() => log('셸 준비 기다림 넘김'));
  if (!have.has('lead')) call('session.spawn', { cwd: F, name: 'lead', model: 'haiku', prompt: 'Reply with one short sentence about mountains. Do not use tools.' });
  await sleep(1000);
  if (!have.has('asker')) call('session.spawn', { cwd: F, name: 'asker', model: 'haiku', prompt: 'Create a folder named p358-x in the current directory using the mkdir shell command.' });
  await until(() => { const a = byName('asker'); return a && a.state === 'waiting'; }, 180000, 3000).catch(() => log('권한 질문 기다림 넘김'));
  await sleep(2000);
  try { atrium('input', 'sh0', 'ping -n 100000 127.0.0.1\r'); } catch (e) { log('ping ' + e.message.slice(0, 120)); }
  const l = list();
  check('판: ' + l.map((s) => s.name + ':' + s.state).join(' '), l.length >= 4 && (byName('asker') || {}).state === 'waiting');
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
// 페이지 안 iOS 값 덮어쓰기: __p358Fake = { ih, vh, vt, ch } (없는 칸은 진짜 값)
const FAKE = (sa) => {
  const F = window.__p358Fake = window.__p358Fake || {};
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
  window.__p358Set = (o) => { Object.assign(F, o); for (const k of Object.keys(o)) if (o[k] == null) delete F[k]; window.visualViewport.dispatchEvent(new Event('resize')); window.dispatchEvent(new Event('resize')); };
};
const fakeCards = (ids) => {
  const now = Date.now();
  return [
    { id: 9101, kind: 'decide', sessionId: ids.asker, name: 'asker', question: '지식 구조 실험 3단계를 X7-작게(배정할 때 고르는 방식 오프라인 비교)와 X6(정성 카드 20단위 대 원문 검색)로 같은 방식으로 진행할까요?', options: ['두 가지로 진행', '하나만(X7-작게)', '범위를 고친 뒤 진행', '여기서 멈추고 정리'], why: null, createdAt: now - 6 * 60000, deferred: false },
    { id: 9102, kind: 'check', sessionId: ids.asker, name: 'asker', question: '휴대폰에서 첫 화면이 뜨는지 확인', options: [], why: null, createdAt: now - 3 * 60000, deferred: false },
    { id: 9103, kind: 'decide', sessionId: ids.lead, name: 'lead', question: '이대로 dev에 합칠까요?', options: ['합치기', '보류'], why: null, createdAt: now - 9 * 60000, deferred: false },
  ];
};

async function runCombos({ before = false } = {}) {
  const pw = await import('playwright');
  await withSim(async () => {
    const browser = await pw.chromium.launch({ headless: true, ...(chromeExe ? { executablePath: chromeExe } : {}) });
    try {
      const pick = (process.env.P358_COMBOS || (before ? 'sa852,tab793' : 'sa852,tab793,p390')).split(',');
      for (const name of pick) {
        const c = COMBOS[name];
        const tag = name;
        const ctx = await browser.newContext(ctxOpts(c));
        const p0 = await ctx.newPage(); await pair(p0); await p0.close();
        const pg = await ctx.newPage();
        const cdp = await ctx.newCDPSession(pg);
        if (c.sa) {
          await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'display-mode', value: 'standalone' }] });
          await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 59, left: 0, bottom: 34, right: 0 } }).catch((e) => log('안전 영역 흉내 없음 ' + e.message.slice(0, 80)));
        } else await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 0, left: 0, bottom: 0, right: 0 } }).catch(() => {});
        const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
        await pg.addInitScript(FAKE, c.sa);
        await pg.addInitScript(() => { try { if (!sessionStorage.getItem('p358-init')) { sessionStorage.setItem('p358-init', '1'); localStorage.setItem('mt.mobileView', 'term'); localStorage.setItem('mt.mobileKeysOpen', '0'); localStorage.setItem('mt.mobileTab', 'home'); } } catch {} });
        await pg.goto('http://localhost:' + SIM + '/');
        await pg.waitForSelector('[data-role=mp-ready]', { state: 'attached', timeout: 60000 });
        await sleep(1500);
        const ids = Object.fromEntries(list().map((s) => [s.name, s.sessionId]));
        const shot = async (n) => { await sleep(700); await pg.screenshot({ path: path.join(OUT, tag + '-' + n + '.png') }); };
        const box = (sel) => pg.evaluate((s) => [...document.querySelectorAll(s)].map((e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return { kind: e.dataset.kind || '', w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10, top: Math.round(r.top * 10) / 10, bottom: Math.round(r.bottom * 10) / 10, bg: cs.backgroundColor, fs: parseFloat(cs.fontSize), key: e.dataset.mpKey || e.dataset.action || e.dataset.kind || '' }; }), sel);
        const one = async (sel) => (await box(sel))[0] || null;
        const open = async (n) => { await pg.evaluate((id) => window.__mtMobile.open(id), ids[n]); await pg.waitForSelector('[data-role=mp-session][data-session="' + ids[n] + '"]', { timeout: 20000 }); await sleep(900); };
        const back = async () => { await pg.click('[data-action=mp-back]'); await pg.waitForSelector('[data-role=mp-session]', { state: 'detached', timeout: 10000 }).catch(() => {}); await sleep(400); };
        const xtermText = (re) => pg.waitForFunction((src) => { const r = document.querySelector('[data-role=mp-termbox] .xterm-rows'); return r && (src ? new RegExp(src).test(r.textContent) : r.textContent.trim().length > 0); }, re || null, { timeout: 30000 }).then(() => true, () => false);
        const page = c.sa ? 852 : c.h;
        const edge = async () => ({ root: await one('[data-role=mp]'), input: await one('[data-role=mp-input]'), keys: await one('[data-role=mp-keys]'), tabs: await one('.mt-mp-tabs'), html: await pg.evaluate(() => { const h = document.documentElement.getBoundingClientRect().height, b = document.body.getBoundingClientRect().height; return { h, b, tall: document.documentElement.classList.contains('mt-tall'), kb: document.documentElement.classList.contains('mt-kb-open') }; }) });
        if (before) {
          // 전: 같은 흉내(홈 화면 앱이 키보드를 닫은 뒤 창 793·보이는 위치 59)에서 옛 화면의 세션 화면 아래 끝
          await shot('before-1-home');
          const h0 = await edge();
          await open('asker');
          if (await pg.$('[data-action=mp-view-term]')) { await pg.click('[data-action=mp-view-term]'); await xtermText(); }
          await sleep(1200);
          const s0 = await edge();
          await shot('before-2-session');
          if (c.sa) { await pg.evaluate(() => window.__p358Set({ ih: 793, vh: 793, vt: 59 })); await sleep(900); }
          const s1 = await edge();
          await shot('before-3-session-after-kb');
          log('BEFORE ' + tag + ' ' + JSON.stringify({ home: h0, session: s0, afterKb: s1 }));
          fs.writeFileSync(path.join(OUT, tag + '-before.json'), JSON.stringify({ home: h0, session: s0, afterKb: s1 }, null, 1));
          await ctx.close();
          continue;
        }
        // 1 홈
        await shot('1-home');
        const h0 = await edge();
        check('[' + tag + '] 홈: 뿌리·아래 탭이 페이지 아래 끝(' + page + ')', Math.abs(h0.root.bottom - page) < 1 && Math.abs(h0.tabs.bottom - page) < 1, h0);
        // 2 일하는 셸: 터미널만
        await open('sh0');
        const xt = await xtermText('127\\.0\\.0\\.1');
        await sleep(1200);
        await shot('2-session-working');
        const noAnswer = !(await pg.$('[data-role=mp-viewpick]')) && !(await pg.$('[data-role=mp-sbody]')) && !(await pg.$('[data-role=mp-answer]'));
        check('[' + tag + '] 세션 화면은 터미널만(보기 고르기·답 보기 없음, 살아 있는 xterm)', xt && noAnswer && !!(await pg.$('[data-role=mp-termview] .xterm')), { xt, noAnswer });
        const s0 = await edge();
        check('[' + tag + '] 세션 화면: 입력 줄이 페이지 아래 끝(' + page + '), html·body도 같은 높이', Math.abs(s0.input.bottom - page) < 1 && Math.abs(s0.root.bottom - page) < 1 && s0.html.h >= page - 0.5 && s0.html.b >= page - 0.5, s0);
        check('[' + tag + '] 할 일·요청이 없으면 작은 단추 없음', !(await pg.$('[data-action=mp-over-show]')));
        check('[' + tag + '] 붙은 터미널 하나', (await pg.evaluate(() => window.__mtMobileTerm.terms.size)) === 1);
        await back();
        check('[' + tag + '] 떠나면 떼고 버린다(붙은 터미널 0)', (await pg.evaluate(() => window.__mtMobileTerm.terms.size)) === 0);
        // 3 응답 필요 세션: 노란 작은 단추, 숫자 키 노랑, 카드는 접혀 있다
        await pg.evaluate((cards) => window.__mt.api.emit('phone.cards', { cards }), fakeCards(ids));
        await open('asker');
        await xtermText();
        await sleep(1500);
        await shot('3-session-need');
        const ob = await one('[data-action=mp-over-show]');
        const k1 = await one('[data-mp-key="1"]');
        const tb = await one('[data-role=mp-termview]');
        check('[' + tag + '] 응답 필요: 오른쪽 아래 노란 작은 단추(카드는 접힘), 숫자 키 노랑', ob && ob.kind === 'need' && /255, 224, 61|rgb\(2[0-9]{2}, 2[0-9]{2}, [0-9]{1,2}\)/.test(ob.bg) && !(await pg.$('[data-role=mp-over]')) && /255, 224, 61/.test(k1.bg) && ob.bottom <= tb.bottom && ob.bottom >= tb.bottom - 20, { ob, k1: k1 && k1.bg, tb });
        // 4 카드 열기: 요청 쪽(1/3)
        await pg.click('[data-action=mp-over-show]');
        await sleep(600);
        await shot('4-over-ask');
        const ov = await one('[data-role=mp-over]');
        const q = await one('[data-role=mp-over] .mt-mp-q');
        const btns = await box('[data-role=mp-over] .mt-mp-btn');
        const pager = await pg.$eval('[data-role=mp-over-pager]', (e) => e.textContent).catch(() => null);
        check('[' + tag + '] 겹친 카드: 터미널 칸의 절반 아래, 질문 14px, 단추 13px, 넘기기 1/3', ov && ov.h <= tb.h * 0.5 + 1 && q && Math.abs(q.fs - 14) < 0.6 && btns.length && btns.every((b) => Math.abs(b.fs - 13) < 0.6) && pager === '1/3', { ov, tb: tb.h, q: q && q.fs, btns: btns.map((b) => b.fs + ':' + b.h), pager });
        // 5 할 일 쪽(2/3): 보기 단추 두 줄 안
        await pg.click('[data-action=mp-over-next]');
        await sleep(500);
        await shot('5-over-todo');
        const tbtn = await box('[data-role=mp-over] [data-action=mp-todo-answer], [data-role=mp-over] [data-action=mp-todo-snooze]');
        const rows = new Set(tbtn.map((b) => b.top)).size;
        const ov2 = await one('[data-role=mp-over]');
        check('[' + tag + '] 할 일 카드(2/3): 보기 단추는 짧은 글로 두 줄 안, 카드는 절반 아래', rows <= 2 && ov2.h <= tb.h * 0.5 + 1 && (await pg.$eval('[data-role=mp-over-pager]', (e) => e.textContent)) === '2/3', { rows, ov2, tbtn: tbtn.length });
        // 글자 크기(A+)를 따른다
        await pg.click('[data-action=mp-keys-more]'); await sleep(200);
        await pg.click('[data-action=mp-keys-font-up]'); await sleep(400);
        const q2 = await one('[data-role=mp-over] .mt-mp-q');
        await pg.click('[data-action=mp-keys-font-down]'); await sleep(300);
        check('[' + tag + '] 겹친 카드 글은 글자 크기(A+)를 따른다', q2 && q2.fs > 14.2, q2 && q2.fs);
        await shot('6-keys-open');
        const kOpen = await edge();
        check('[' + tag + '] 키 줄 펼침: 입력 줄은 그대로 아래 끝', Math.abs(kOpen.input.bottom - page) < 1, kOpen.input);
        await pg.click('[data-action=mp-keys-more]'); await sleep(200);
        await pg.click('[data-action=mp-over-hide]'); await sleep(300);
        check('[' + tag + '] 접으면 작은 단추로', !!(await pg.$('[data-action=mp-over-show]')) && !(await pg.$('[data-role=mp-over]')));
        await back();
        // 7 바로 치기 + 키보드 열림(보이는 높이 460), 붙기 전 입력(터미널 붙기를 2.5초 늦춘다)
        await pg.evaluate(() => { const api = window.__mt.api; const real = api.call.bind(api); api.call = (m, p, o) => (m === 'terminal.attach' && window.__p358Slow ? new Promise((r) => setTimeout(r, 2500)).then(() => real(m, p, o)) : real(m, p, o)); window.__p358Slow = true; });
        await open('sh1');
        await pg.waitForFunction(() => document.querySelector('[data-role=mp-termbox] .xterm-helper-textarea'), null, { timeout: 30000 });
        await pg.click('[data-action=mp-type-direct]');
        const mark = 'p358early' + tag;
        await pg.keyboard.type('echo ' + mark); await pg.keyboard.press('Enter');
        const hint = await pg.evaluate(() => { const h = document.querySelector('[data-role=mp-termbox] .mt-term-hint'); return h ? h.textContent : null; });
        await pg.evaluate(() => { window.__p358Slow = false; });
        const early = await xtermText(mark + '[\\s\\S]*' + mark);
        check('[' + tag + '] 붙기 전에 친 글: "터미널 연결 중" 한 줄, 붙은 뒤 보낸다(버리지 않는다)', !!hint && /연결/.test(hint) && early, { hint, early });
        await pg.setViewportSize({ width: c.w, height: 460 });
        await sleep(1200);
        await shot('7-keyboard-open');
        const kb = await edge();
        check('[' + tag + '] 키보드 열림(보이는 460): 키 줄이 보이는 칸 안 아래, 키보드 표시', kb.keys && kb.keys.bottom <= 460 + 0.5 && kb.keys.bottom >= 400 && kb.html.kb, kb);
        await pg.click('[data-action=mp-type-direct]'); await sleep(300);
        // 입력 줄 키보드(메시지 칸)
        await pg.focus('[data-field=mp-text]'); await sleep(600);
        const kb2 = await edge();
        check('[' + tag + '] 키보드 열림(입력 줄): 입력 줄이 보이는 칸 아래 끝', kb2.input && Math.abs(kb2.input.bottom - 460) < 1, kb2.input);
        await shot('8-keyboard-input');
        await pg.evaluate(() => document.activeElement && document.activeElement.blur());
        await pg.setViewportSize({ width: c.w, height: c.h });
        // 홈 화면 앱: 키보드를 닫은 뒤 iOS가 창 793·보이는 위치 59를 남긴다(실기기 그림의 그 상태를 숫자로 만든다)
        if (c.sa) await pg.evaluate(() => window.__p358Set({ ih: 793, vh: 793, vt: 59 }));
        await sleep(1500);
        await shot('9-keyboard-closed');
        const ka = await edge();
        const scrolls = await pg.evaluate(() => window.__p358Fake.scrolls || 0);
        check('[' + tag + '] 키보드를 닫은 뒤: 입력 줄이 다시 페이지 아래 끝(' + page + '), 키보드 표시 없음' + (c.sa ? ', 남은 스크롤(보이는 위치 59)을 되돌림' : ''), Math.abs(ka.input.bottom - page) < 1 && Math.abs(ka.root.h - page) < 1 && ka.root.top === 0 && !ka.html.kb && ka.html.h >= page - 0.5 && (!c.sa || scrolls >= 1), { ...ka, scrolls });
        if (c.sa) { await pg.evaluate(() => window.__p358Set({ ih: null, vh: null, vt: null })); await sleep(500); }
        await back();
        await sleep(3500);
        check('[' + tag + '] 화면 오류 없음', !errs.length, errs);
        await ctx.close();
      }
    } finally { await browser.close(); }
  });
  if (!before) {
    await sleep(2500);
    const rep = call('remote.errors', {});
    const by = rep.layoutBy || {};
    const devs = Object.entries(by).map(([d, x]) => d + ':' + Object.keys(x).join('/'));
    check('배치 값이 화면마다 남는다(홈·세션 화면·키보드 열림)', Object.values(by).some((x) => x.home && x.session && x.kb), devs);
    fs.writeFileSync(path.join(OUT, 'remote-errors.json'), JSON.stringify(rep, null, 1));
    try { fs.writeFileSync(path.join(OUT, 'remote-errors.txt'), atrium('remote', 'errors')); } catch (e) { log('remote errors ' + e.message.slice(0, 200)); }
  }
}

// 사용자 그림(전)과 후 그림을 나란히
async function compare() {
  const pw = await import('playwright');
  const img = (f) => 'data:image/' + (f.endsWith('.png') ? 'png' : 'jpeg') + ';base64,' + fs.readFileSync(f).toString('base64');
  const U = process.env.P358_USER_SHOTS || path.join(REPO, 'experiments', 'p358'); // 사용자 그림(지휘 세션이 둔 곳, 주 체크아웃의 experiments/p358)
  const after = path.join(REPO, 'experiments', 'p358', process.env.P358_AFTER || 'shots');
  const pairs = [
    ['iphone-overlay-open.jpg', 'sa852-4-over-ask.png', 'sa852-5-over-todo.png', '할 일·질문 카드를 연 모습'],
    ['iphone-terminal-cut.jpg', 'sa852-3-session-need.png', 'sa852-9-keyboard-closed.png', '터미널 보기 아래 끝'],
  ];
  const browser = await pw.chromium.launch({ headless: true, ...(chromeExe ? { executablePath: chromeExe } : {}) });
  try {
    const pg = await browser.newPage({ viewport: { width: 1240, height: 900 } });
    for (let i = 0; i < pairs.length; i++) {
      const [u, a1, a2, title] = pairs[i];
      const cell = (src, cap) => '<figure><img src="' + src + '"><figcaption>' + cap + '</figcaption></figure>';
      const html = '<html><body style="margin:0;background:#222;color:#eee;font:15px system-ui;padding:14px"><h3 style="margin:0 0 10px">' + title + '</h3><div style="display:flex;gap:14px;align-items:flex-start">'
        + cell(img(path.join(U, u)), '전: 사용자 iPhone 15 홈 화면 앱') + cell(img(path.join(after, a1)), '후: 흉내 393x852 홈 화면 앱') + cell(img(path.join(after, a2)), '후: 같은 흉내') + '</div>'
        + '<style>figure{margin:0;width:393px}img{width:393px;display:block;border:1px solid #555}figcaption{margin-top:6px}</style></body></html>';
      await pg.setContent(html); await sleep(500);
      await pg.screenshot({ path: path.join(OUT, 'compare-' + (i + 1) + '.png'), fullPage: true });
    }
  } finally { await browser.close(); }
}

async function stopBoard() {
  try { for (const s of call('session.list')) atrium('kill', s.sessionId, '--yes', '--delete'); } catch (e) { log('kill ' + e.message.slice(0, 120)); }
  try { log(atrium('terminal', 'stop', '--yes').slice(0, 200)); } catch (e) { log('terminal stop ' + e.message.slice(0, 120)); }
  try { log(atrium('backend', 'stop').slice(0, 200)); } catch (e) { log('backend stop ' + e.message.slice(0, 120)); }
}

try {
  if (WHAT === 'setup') await setupBoard();
  else if (WHAT === 'shots') await runCombos();
  else if (WHAT === 'before') await runCombos({ before: true });
  else if (WHAT === 'compare') await compare();
  else if (WHAT === 'stop') await stopBoard();
  else if (WHAT === 'restart') { log(atrium('backend', 'stop').slice(0, 200)); await sleep(1500); log(atrium('backend', 'start').slice(0, 200)); await sleep(2500); }
  else if (WHAT === 'status') log(list().map((s) => s.name + ':' + s.state).join(' '));
} catch (e) { check('도구 오류', false, String(e && e.stack || e).slice(0, 1500)); }
const fail = results.filter((r) => !r.ok);
log('결과 ' + (results.length - fail.length) + '/' + results.length);
fs.writeFileSync(path.join(OUT, WHAT + '-results.json'), JSON.stringify(results, null, 1));
process.exit(fail.length ? 1 : 0);
