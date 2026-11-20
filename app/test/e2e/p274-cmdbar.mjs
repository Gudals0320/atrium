// P274 창 시험: 아래 명령 바의 글 칸 폭(스티어링·마이크·보내기 단추 배치)과 긴 입력(여러 줄, 긴 붙여 넣기, 공백 없는 긴 줄), 휴대폰 입력 줄.
// 판: 터미널 세션 atrium-dev-p274, 포트 48024, 이 워크트리의 backend/.dev(data, app). 창의 원격 디버깅 포트 9505.
// 장면(새 폴더 C:\\Workspace\\mtask-p274-a, git 아님, 셸만 띄운다): 셸 셋. 스티어링이 되는 Claude Code(일하는 중)는 창 안에서만 흉내 낸다(session.updated).
// 단계: setup | shot <ko|en> [round] | clean. 결과는 experiments/p274/<round>/(git 밖).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const [STAGE = 'shot', LANG = 'ko', ROUND = 'after'] = process.argv.slice(2);
if (!['setup', 'shot', 'phone', 'clean'].includes(STAGE)) throw new Error('단계: setup | shot | phone | clean');
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const DEV = path.join(REPO, 'backend', '.dev');
const OUT = path.join(REPO, 'experiments', 'p274', ROUND);
const CONVOS = 'C:\\Workspace\\mtask-p274-projects';
const BOARD = { session: 'atrium-dev-p274', port: 48024, cdp: 9505 };
const ENV = {
  ATRIUM_TERMINAL_SESSION: BOARD.session, ATRIUM_HERDR_SESSION: BOARD.session, ATRIUM_PORT: String(BOARD.port),
  ATRIUM_DATA_DIR: path.join(DEV, 'data'), ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  ATRIUM_CLAUDE_PROJECTS: CONVOS, ATRIUM_CLAUDE_DESKTOP: 'none', MT_E2E_OUT: path.join('p274', ROUND),
};
// 휴대폰 단계: 웹 화면(가짜 tailscale과 흉내 프록시, P59·P256 방식)으로 휴대폰 입력 줄을 연다
const SIM = 48094;
if (STAGE === 'phone') Object.assign(ENV, { ATRIUM_TAILSCALE: path.join(REPO, 'app', 'test', 'e2e', 'p49-fake-tailscale.mjs'), P49_FAKE_TS_PORT: String(BOARD.port) });
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_|HC_|MT_HERDR)/.test(k)) delete process.env[k]; // 실제 판의 값을 물려받지 않는다
for (const k of Object.keys(process.env)) if (/^(CLAUDECODE|CLAUDE_CODE_|CLAUDE_EFFORT|CLAUDE_PID|CLAUDE_AGENT_SDK|ELECTRON_RUN_AS_NODE)/.test(k)) delete process.env[k];
Object.assign(process.env, ENV);
for (const d of [OUT, CONVOS]) fs.mkdirSync(d, { recursive: true });
const L = STAGE === 'phone' ? await import('./p59-lib.mjs') : null;
if (L) ENV.ATRIUM_WEB_HOSTS = `${L.NAME}:${SIM},localhost:${SIM}`;
Object.assign(process.env, ENV);
const { logger, sleep, until, launch, closeApp } = await import('./harness.mjs');
const { assertTestBoard } = await import('./p9-guard.mjs');
assertTestBoard(ENV, { root: DEV });

const log = logger(`p274-${STAGE}-${LANG}`);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 180000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const sessions = () => call('session.list');
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail !== '' ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 1600)}` : ''}`); };

const F = 'C:\\Workspace\\mtask-p274-a';
if (!/^C:\\Workspace\\mtask-p274-[a-z]+$/.test(F)) throw new Error('시험 폴더는 C:\\Workspace\\mtask-p274-*만');
const LIVE = ['worker', 'reviewer-with-a-long-name', 'notes'];

async function setup() {
  log('백엔드', atrium('backend', 'start').trim().slice(0, 200));
  for (const s of sessions()) { try { atrium('kill', s.sessionId, '--yes', '--delete'); } catch (e) { log('옛 세션 끄기 실패', s.name, e.message.slice(0, 120)); } }
  fs.mkdirSync(F, { recursive: true }); fs.writeFileSync(path.join(F, 'README.md'), '# mtask-p274-a\n');
  call('workspace.open', { path: F, select: true });
  for (const name of LIVE) { const r = call('session.spawn', { cwd: F, kind: 'shell', name }); log('띄움', name, r.sessionId); }
  await until(() => { const s = sessions(); return LIVE.every((n) => s.some((x) => x.name === n && /shell_/.test(x.state))); }, 120000, 1500).catch(() => log('셸 준비 기다림 넘김'));
  check('장면: 셸 셋', sessions().length === LIVE.length, { sessions: sessions().length });
}

// 셸 셋을 일하는 중인 판의 Claude Code로 흉내(스티어링 단추가 보이게)
const FAKE = () => {
  for (const s of window.__mt.getState().sessions.values()) window.__mt.api.emit('session.updated', { ...s, kind: 'claude', hooked: true, state: s.name === 'notes' ? 'ready' : 'working' });
};

const LONG_PATH = 'C:\\' + Array.from({ length: 14 }, (_, i) => `very-long-folder-name-without-spaces-${i}`).join('\\') + '\\file.txt';
const MULTI = Array.from({ length: 30 }, (_, i) => `line ${i + 1}: 여러 줄 입력 시험 줄입니다.`).join('\n');
const PASTE = Array.from({ length: 40 }, (_, i) => `문단 ${i + 1}. 긴 붙여 넣기 시험입니다. The quick brown fox jumps over the lazy dog, ${'and keeps running '.repeat(6)}`).join('\n\n');

// 아래 바 주변 상자들과 넘침 판단
async function geo(page) {
  return page.evaluate(() => {
    const box = (sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), r: Math.round(r.right), b: Math.round(r.bottom) }; };
    const ta = document.querySelector('[data-role=command]');
    const vw = window.innerWidth, vh = window.innerHeight;
    return {
      vw, vh, bar: box('.mt-bottom .mt-cmd'), field: box('.mt-cmd-field'), ta: box('[data-role=command]'), mirror: box('.mt-cmd-mirror-in'),
      send: box('[data-action=send]'), steer: box('[data-action=cmd-steer]'), thread: box('.mt-cmd-thread'), voice: box('.mt-cmd .mt-voice-btn'), to: box('[data-role=cmd-to]'), head: box('[data-role=cmd-head]'),
      above: box('.mt-bottom-above'), chips: box('[data-role=chips]'),
      taScrollW: ta ? ta.scrollWidth : 0, taClientW: ta ? ta.clientWidth : 0, taScrollH: ta ? ta.scrollHeight : 0, taClientH: ta ? ta.clientHeight : 0,
      docScrollW: document.documentElement.scrollWidth, stageScroll: (() => { const s = document.querySelector('.mt-stage'); return s ? [s.scrollWidth, s.clientWidth, s.scrollHeight, s.clientHeight, s.scrollTop, s.scrollLeft] : null; })(),
    };
  });
}
async function barShot(page, file) {
  const box = await page.evaluate(() => {
    const els = ['.mt-bottom .mt-cmd', '.mt-bottom-above', '[data-role=cmd-head]', '.mt-mention'].map((s) => document.querySelector(s)).filter(Boolean);
    const rs = els.map((e) => e.getBoundingClientRect()).filter((r) => r.width && r.height);
    if (!rs.length) return null;
    const x = Math.min(...rs.map((r) => r.left)), y = Math.min(...rs.map((r) => r.top)), r2 = Math.max(...rs.map((r) => r.right)), b = Math.max(...rs.map((r) => r.bottom));
    return { x: Math.max(0, x - 16), y: Math.max(0, y - 16), width: Math.min(window.innerWidth, r2 + 16) - Math.max(0, x - 16), height: Math.min(window.innerHeight, b + 16) - Math.max(0, y - 16) };
  });
  await page.screenshot({ path: path.join(OUT, file), ...(box ? { clip: box } : {}) });
  log('그림', file);
}
async function put(page, text) {
  await page.waitForFunction(() => window.__mt.getState().sessions.size >= 3, null, { timeout: 30000 }).catch(() => {});
  await page.evaluate(FAKE); // 판의 새 상태가 흉내를 덮을 수 있어 매번 다시
  await page.focus('[data-role=command]');
  await page.fill('[data-role=command]', text);
  await sleep(350);
}
// 깨짐 판단: 바와 단추가 창 안, 글 칸이 가로로 넘치지 않음, 단추가 글 칸과 겹치지 않음
function sane(g, label) {
  const inView = (b) => !b || (b.x >= 0 && b.y >= 0 && b.r <= g.vw && b.b <= g.vh);
  check(`${label}: 바·단추가 창 안`, inView(g.bar) && inView(g.send) && inView(g.steer) && inView(g.voice), { bar: g.bar, send: g.send, vh: g.vh });
  check(`${label}: 글 칸 가로 넘침 없음`, g.taScrollW <= g.taClientW + 1, { sw: g.taScrollW, cw: g.taClientW });
  check(`${label}: 보내기 단추가 글 칸 밖 오른쪽`, !g.send || !g.field || g.send.x >= g.field.r - 1, { send: g.send, field: g.field });
  check(`${label}: 페이지 가로 스크롤 없음`, g.docScrollW <= g.vw + 1, { doc: g.docScrollW, vw: g.vw });
  check(`${label}: 글 칸 높이 상한(창 높이의 42%) 안`, !g.ta || g.ta.h <= Math.floor(g.vh * 0.42) + 1, { ta: g.ta, vh: g.vh });
}

async function shot() {
  const { app, page } = await launch({ log, args: [`--remote-debugging-port=${BOARD.cdp}`] });
  try {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    call('settings.set', { key: 'language', value: LANG });
    await page.waitForFunction((l) => document.documentElement.lang === l, LANG, { timeout: 10000 }).catch(() => {});
    await page.evaluate(FAKE); await sleep(400);
    const S = (n) => `${LANG}-${n}`;
    const steps = [
      ['01-empty', ''],
      ['02-one-line', '@worker 테스트 실패 원인을 찾아서 고쳐 줘'],
      ['03-two-tags', '@worker @reviewer-with-a-long-name 바뀐 것을 같이 봐 줘'],
      ['04-multi', '@worker ' + MULTI],
      ['05-paste', '@worker ' + PASTE],
      ['06-long-path', '@worker 이 파일을 봐 줘 ' + LONG_PATH],
    ];
    for (const [w, h] of process.env.P274_PHONE_ONLY ? [] : [[1600, 1000], [900, 760]]) {
      await page.setViewportSize({ width: w, height: h }).catch(() => {});
      await sleep(500);
      const tag = w < 1000 ? 'narrow-' : '';
      for (const [n, text] of steps) {
        await put(page, text);
        const g = await geo(page);
        log('geo', tag + n, g);
        if (text) sane(g, tag + n);
        await barShot(page, `${S(tag + n)}.png`);
        if (n === '04-multi' || n === '05-paste') await page.screenshot({ path: path.join(OUT, `${S(tag + n)}-window.png`) });
      }
      // 스티어링 켬
      await put(page, '@worker 지금 하던 일에 이 정보도 같이 넣어 줘');
      const st = await page.$('[data-action=cmd-steer]');
      check(`${tag}스티어링 토글이 보인다`, !!st);
      if (st) { await st.click(); await sleep(250); check(`${tag}스티어링 토글을 누르면 켜진다`, (await st.getAttribute('aria-pressed')) === 'true'); }
      const gs = await geo(page); log('geo', tag + 'steer-on', gs); sane(gs, tag + 'steer-on');
      await barShot(page, `${S(tag + '07-steer-on')}.png`);
      if (st) { await st.click(); await sleep(150); }
      await put(page, '');
    }
  } finally {
    await closeApp(app);
  }
}


async function phone() {
  // 백엔드를 웹 허용 값으로 다시 띄운다(이 판만)
  try { atrium('backend', 'stop'); } catch {}
  log('백엔드', atrium('backend', 'start').trim().slice(0, 120));
  const pw = await import('playwright');
  const toUrl = (p) => 'file:///' + p.replace(/\\/g, '/');
  const { startTsSim } = await import(toUrl(path.join(REPO, 'backend', 'tools', 'ts-sim-proxy.mjs')));
  const sim = startTsSim({ listen: SIM, target: BOARD.port, name: L.NAME, login: L.LOGIN, keepOrigin: true }); sim.cfg.ip = L.LAPTOP_A;
  await sim.ready;
  const pwDir = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright');
  const chromeExe = (() => { try { return fs.readdirSync(pwDir).filter((x) => /^chromium-\d+$/.test(x)).sort().reverse().map((x) => path.join(pwDir, x, 'chrome-win64', 'chrome.exe')).find((f) => fs.existsSync(f)); } catch { return null; } })();
  const SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
  call('settings.set', { key: 'language', value: LANG });
  const browser = await pw.chromium.launch({ headless: true, ...(chromeExe ? { executablePath: chromeExe } : {}) });
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, screen: { width: 390, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: SAFARI, locale: LANG === 'ko' ? 'ko-KR' : 'en-US', reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => log(`[phone pageerror] ${e.message}`));
    await page.goto(`http://localhost:${SIM}/`);
    await page.waitForSelector('[data-role=pair]', { timeout: 30000 });
    await page.fill('[data-field=pair-code]', call('device.code').code);
    await page.click('[data-action=pair-submit]');
    await page.waitForFunction(() => window.__mt && window.__mt.getState().boardLoaded && window.__mt.api.conn.phase === 'open', null, { timeout: 60000 });
    await sleep(1200);
    const S = (n) => `${LANG}-${n}`;
      // 휴대폰 입력 줄: 일하는 중인 Claude Code(흉내)의 세션 화면
      await page.evaluate(FAKE); await sleep(400);
      const opened = await page.evaluate(() => { const s = [...window.__mt.getState().sessions.values()].find((x) => x.name === 'worker'); if (s && window.__mtPhone && window.__mtPhone.open) { window.__mtPhone.open(s.sessionId); return true; } return false; });
      log('휴대폰 세션 열기(__mtPhone.open)', opened, await page.evaluate(() => ({ w: innerWidth, h: innerHeight, coarse: matchMedia('(pointer: coarse)').matches, phone: !!document.querySelector('[data-role=phone]'), roles: [...new Set([...document.querySelectorAll('[data-role]')].map((e) => e.dataset.role))].slice(0, 30) })));
      
      await page.waitForSelector('[data-field=phone-text]', { timeout: 10000 }).catch(() => log('휴대폰 입력 줄을 찾지 못함'));
      const pbox = async () => page.evaluate(() => { const q = (s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height), r: Math.round(r.right), b: Math.round(r.bottom) }; }; const ta = document.querySelector('[data-field=phone-text]'); return { vw: innerWidth, vh: innerHeight, row: q('[data-role=phone-input]'), ta: q('[data-field=phone-text]'), steer: q('[data-action=phone-steer]'), send: q('[data-action=phone-send]'), voice: q('[data-role=phone-input] .mt-voice-btn'), sw: ta ? ta.scrollWidth : 0, cw: ta ? ta.clientWidth : 0 }; });
      for (const [n, text] of [['p1-empty', ''], ['p2-one', '테스트 실패 원인을 찾아서 고쳐 줘'], ['p3-multi', MULTI], ['p4-path', '이 파일을 봐 줘 ' + LONG_PATH]]) {
        const ta = await page.$('[data-field=phone-text]');
        if (!ta) break;
        await ta.fill(text); await page.evaluate(FAKE); await sleep(300);
        const g = await pbox(); log('phone', n, g);
        if (g.ta && g.row) check(`휴대폰 ${n}: 글 칸이 줄 폭의 절반 넘게`, g.ta.w > g.row.w * 0.5, g);
        if (text) check(`휴대폰 ${n}: 가로 넘침 없음`, g.sw <= g.cw + 1, { sw: g.sw, cw: g.cw });
        await page.screenshot({ path: path.join(OUT, `${S(n)}.png`) });
      }
      await page.evaluate(FAKE); await sleep(200);
      const pst = await page.$('[data-action=phone-steer]');
      if (pst) { await pst.click(); await sleep(200); check('휴대폰 스티어링 토글을 누르면 켜진다', (await pst.getAttribute('aria-pressed')) === 'true'); await page.screenshot({ path: path.join(OUT, `${S('p5-steer-on')}.png`) }); }
  
  } finally { await browser.close().catch(() => {}); try { sim.close && sim.close(); } catch {} }
}

async function clean() {
  for (const s of sessions()) { try { atrium('kill', s.sessionId, '--yes', '--delete'); } catch (e) { log('끄기 실패', s.name, e.message.slice(0, 120)); } }
  try { atrium('settings', 'set', 'tray', 'off'); } catch {}
  try { log(atrium('terminal', 'stop', '--yes').trim().slice(0, 200)); } catch (e) { log('terminal stop', e.message.slice(0, 200)); }
  try { log(atrium('backend', 'stop').trim().slice(0, 200)); } catch (e) { log('backend stop', e.message.slice(0, 200)); }
}

if (STAGE === 'setup') await setup();
else if (STAGE === 'shot') await shot();
else if (STAGE === 'phone') await phone();
else await clean();
const fail = results.filter((x) => !x.ok);
log(`결과 ${results.length - fail.length}/${results.length}`);
fs.writeFileSync(path.join(OUT, `results-${STAGE}-${LANG}.json`), JSON.stringify(results, null, 1));
process.exit(fail.length ? 1 : 0);
