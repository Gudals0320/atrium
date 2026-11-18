// P176 창 시험: 음성 입력 중임이 늘 보이고, 사람이 모르는 녹음이 이어지지 않는다. 바깥 Soniox 대신 이 프로세스의 가짜 서버(ATRIUM_SONIOX_URL)에 붙는다.
// 마이크는 Chromium 가짜 장치(--use-fake-device-for-media-stream, 삑 소리)다. 가짜 서버는 talking이 켜진 동안 미확정 글을 보낸다.
// 판: 따로 띄운 개발용 판(atrium-dev-p176, 47945, backend/.dev)만 쓴다. 창의 원격 디버깅 포트 9425, 가짜 Soniox 47986, 휴대폰 흉내 프록시 47987. 한 번에 한 창만(메모리).
// 실행: sh backend/.dev/clean-env.sh node app/test/e2e/p176-voice-visible.mjs <setup|pc|phone|stop>
//   setup: 백엔드를 가짜 Soniox 주소·말 없음 5초로 띄우고 셸 세션 하나(휴대폰 입력칸용)
//   pc: 녹음 중 마우스를 치워도 명령줄이 보임, 세션 맵·검색을 연 채 녹음 표시, 말 없음 자동 멈춤과 알림, 창 숨김 멈춤, 판 기록의 까닭
//   phone: 휴대폰 폭 웹에서 녹음, 녹음 중 다른 화면(목록)으로 가면 멈춤
//   autotag(추가): 빈 명령줄에서 판의 세션 A를 누르면 @A, B를 누르면 @B, 글을 친 뒤 C를 누르면 그대로, 비우고 빈 판을 누르면 빈 채
// 결과는 워크트리의 experiments/p176/(저장소 밖).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const WHAT = process.argv[2] || 'setup';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const DEV = path.join(REPO, 'backend', '.dev');
const OUT = path.join(REPO, 'experiments', 'p176');
const CONVOS = path.join(OUT, 'convos');
const DIR = 'C:\\Workspace\\mtask-p176-a';
const NAME = 'p176-sh';
const TAGS = ['p176-ta', 'p176-tb']; // 자동 태그 시험의 세션(셋째는 NAME)
const PORT = '47945', FAKE = 47986, SIM = 47987, IDLE_MS = 5000;
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_|HC_)/.test(k)) delete process.env[k];
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
const L = await import('./p59-lib.mjs');
const ENV = {
  ATRIUM_TERMINAL_SESSION: 'atrium-dev-p176', ATRIUM_HERDR_SESSION: 'atrium-dev-p176', ATRIUM_PORT: PORT,
  ATRIUM_DATA_DIR: path.join(DEV, 'data'), ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  ATRIUM_CLAUDE_PROJECTS: CONVOS, ATRIUM_CLAUDE_DESKTOP: 'none', ATRIUM_TEST_PREFIX: 'p176-none-',
  ATRIUM_TAILSCALE: path.join(REPO, 'app', 'test', 'e2e', 'p49-fake-tailscale.mjs'), P49_FAKE_TS_PORT: PORT,
  ATRIUM_WEB_HOSTS: `${L.NAME}:${SIM},localhost:${SIM}`,
  // 가짜 Soniox(실제 키를 보내지 않는다), 말 없음 5초
  ATRIUM_SONIOX_URL: `ws://127.0.0.1:${FAKE}`, SONIOX_API_KEY: 'fake-p176', ATRIUM_VOICE_IDLE_MS: String(IDLE_MS),
};
Object.assign(process.env, ENV);
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(CONVOS, { recursive: true });
const { logger, sleep, launch, closeApp } = await import('./harness.mjs');
const { assertTestBoard } = await import('./p9-guard.mjs');
assertTestBoard(ENV, { root: DEV });

const log = logger(`p176-${WHAT}`);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 120000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 1600)}` : ''}`); };
const AWAKE = ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'];
const MIC = ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'];
const shotTo = (pg, name, clip) => pg.screenshot({ path: path.join(OUT, `${name}.png`), ...(clip ? { clip } : {}) }).catch((e) => log(`스크린숏 실패 ${name} ${e.message.slice(0, 80)}`));
async function awayWin(app) { return app.evaluate(({ BrowserWindow, screen }) => { const w = BrowserWindow.getAllWindows()[0]; if (!w) return null; const ds = screen.getAllDisplays(); const left = Math.min(...ds.map((d) => d.bounds.x)); const b = w.getBounds(); w.setPosition(left - b.width - 200, 40); return w.getBounds(); }).catch((e) => ({ err: e.message })); }
async function winSize(app, page, width, height) {
  await app.evaluate(({ BrowserWindow }, [w, h]) => { const win = BrowserWindow.getAllWindows()[0]; win.setContentSize(w, h); }, [width, height]).catch(() => {});
  await page.setViewportSize({ width, height }).catch(() => {});
  await sleep(700);
}
const sess = () => call('session.list').find((s) => s.name === NAME);
async function until(fn, ms, step = 1000) { const end = Date.now() + ms; for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) return null; await sleep(step); } }
const backendLog = () => { try { return fs.readFileSync(path.join(DEV, 'data', 'logs', 'backend.log'), 'utf8'); } catch { return ''; } };
const voiceLines = () => backendLog().split('\n').filter((l) => /voice v\d+ (start|end)/.test(l));

// 가짜 Soniox: talking이 켜진 동안 0.3초마다 미확정 글을 보낸다. 빈 글(소리 끝)이면 남은 글을 확정하고 끝낸다
async function fakeSoniox() {
  const { WebSocketServer } = await import('file:///' + path.join(REPO, 'backend', 'node_modules', 'ws', 'wrapper.mjs').replace(/\\/g, '/'));
  const st = { talking: false, conns: 0, n: 0 };
  const wss = new WebSocketServer({ port: FAKE, host: '127.0.0.1' });
  wss.on('connection', (ws) => {
    st.conns++;
    let n = 0;
    const tick = setInterval(() => { if (st.talking && ws.readyState === 1) ws.send(JSON.stringify({ tokens: [{ text: `시험 말 ${++n}`, is_final: false }] })); }, 300);
    ws.on('message', (d, bin) => {
      if (bin) return;
      if (String(d) === '') { clearInterval(tick); ws.send(JSON.stringify({ tokens: n ? [{ text: `시험 말 ${n}`, is_final: true }] : [], finished: true })); setTimeout(() => ws.close(), 5); }
    });
    ws.on('close', () => clearInterval(tick));
  });
  await new Promise((r) => wss.on('listening', r));
  return { st, close: () => new Promise((r) => { for (const c of wss.clients) c.terminate(); wss.close(r); }) };
}

async function setupBoard() {
  fs.mkdirSync(DIR, { recursive: true });
  log(atrium('backend', 'start').trim().slice(0, 300));
  for (const n of [NAME, ...TAGS]) if (!call('session.list').some((x) => x.name === n)) log(atrium('--json', 'spawn', DIR, '--name', n, '--kind', 'shell').slice(0, 120));
  const s = await until(() => sess(), 30000, 1000);
  check('준비: 셸 세션', !!s, s && s.state);
}

// 창의 녹음 표시 상태
const ui = (pg) => pg.evaluate(() => {
  const btn = document.querySelector('.mt-cmd [data-action="voice"]');
  const bottom = document.querySelector('[data-role="bottom"]');
  const pill = document.querySelector('[data-role="voice-pill"]');
  const r = btn && btn.getBoundingClientRect();
  const at = r ? document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) : null;
  const toasts = [...document.querySelectorAll('.mt-toast')].map((x) => x.textContent);
  return { state: btn && btn.dataset.state, barHidden: bottom && bottom.dataset.hidden === '1', btnHit: !!(at && btn && (at === btn || btn.contains(at))), pill: pill ? { text: pill.textContent, state: pill.dataset.state, top: Math.round(pill.getBoundingClientRect().top) } : null, toasts };
});

async function pc() {
  const fake = await fakeSoniox();
  const { app, page } = await launch({ log, env: { ...ENV }, args: ['--remote-debugging-port=9425', ...AWAKE, ...MIC] });
  try {
    await awayWin(app);
    await winSize(app, page, 1584, 921);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await sleep(2500);
    const btn = '.mt-cmd [data-action="voice"]';
    const W = 1584;
    // 아래로 마우스를 옮겨 바를 띄우고 마이크를 누른다
    await page.mouse.move(W / 2, 900); await sleep(600);
    await page.click(btn);
    fake.st.talking = true;
    const lis = await until(async () => { const s = await ui(page); return s.state === 'listening' ? s : null; }, 10000, 100);
    check('녹음 시작: 듣는 중', !!lis, lis);

    // (1) 마우스를 위로 치워도 명령줄이 숨지 않는다(평소에는 0.7초 뒤 숨는다)
    await page.mouse.move(W / 2, 120); await sleep(2500);
    const held = await ui(page);
    check('녹음 중 마우스를 치워도 명령줄이 보인다(알약 없음)', !held.barHidden && held.btnHit && !held.pill, held);
    await shotTo(page, 'pc-1-bar-held');

    // (2) 세션 맵을 연 채: 녹음 표시가 보인다(명령줄의 마이크 단추나 위 알약)
    await page.click('[data-action="mission-rail"]'); await sleep(1500);
    const map = await ui(page);
    check('세션 맵을 연 채 녹음 표시가 보인다', map.state === 'listening' && (map.btnHit || !!map.pill), map);
    await shotTo(page, 'pc-2-mission-open');
    // 마이크 단추를 덮개 밑에 묻어 본다(대화상자·덮개가 가린 경우): 위 알약이 뜬다
    await page.evaluate(() => { const d = document.createElement('div'); d.id = 'p176-cover'; d.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(10,10,8,0.82)'; document.body.appendChild(d); });
    const covered = await until(async () => { const s = await ui(page); return s.pill ? s : null; }, 3000, 100);
    check('마이크 단추가 가리면 화면 위에 녹음 알약(빨간 점·지난 시간·끝내기)', covered && covered.pill.top < 40 && /\d:\d\d/.test(covered.pill.text), covered);
    await shotTo(page, 'pc-3-covered-pill');
    await page.evaluate(() => document.getElementById('p176-cover').remove());
    await page.keyboard.press('Escape'); await sleep(400);
    const mOpen = await page.evaluate(() => window.__mt.getState().missionOpen);
    if (mOpen) { await page.click('[data-action="mission-rail"]').catch(() => {}); await sleep(800); }

    // (3) 검색을 연 채
    await page.keyboard.press('Control+f') /* P214: 위 막대 검색 칸이 없어 Ctrl+F로 연다 */; await sleep(800);
    const srch = await ui(page);
    check('검색을 연 채 녹음 표시가 보인다', srch.state === 'listening' && (srch.btnHit || !!srch.pill), srch);
    await shotTo(page, 'pc-4-search-open');
    await page.keyboard.press('Escape'); await sleep(400);

    // (4) 알약을 누르면 멈춘다
    await page.evaluate(() => { const d = document.createElement('div'); d.id = 'p176-cover'; d.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(10,10,8,0.82)'; document.body.appendChild(d); });
    await until(async () => (await ui(page)).pill, 3000, 100);
    await page.click('[data-role="voice-pill"]');
    const byPill = await until(async () => { const s = await ui(page); return s.state === 'idle' && !s.pill ? s : null; }, 5000, 100);
    check('알약을 누르면 녹음을 끝낸다', !!byPill, byPill);
    await page.evaluate(() => document.getElementById('p176-cover').remove());

    // (5) 말 없음: 들은 글이 5초(시험 값) 동안 없으면 저절로 멈추고 알린다
    await page.mouse.move(W / 2, 900); await sleep(600);
    await page.click(btn);
    await until(async () => (await ui(page)).state === 'listening', 10000, 100);
    fake.st.talking = true; await sleep(1500); fake.st.talking = false;
    const t0 = Date.now();
    await page.mouse.move(W / 2, 120);
    const sil = await until(async () => { const s = await ui(page); return s.state !== 'listening' && s.state !== 'stopping' ? { ...s, ms: Date.now() - t0 } : null; }, IDLE_MS + 8000, 200);
    check('말 없음으로 저절로 멈추고 까닭을 알린다', sil && sil.ms >= IDLE_MS - 1500 && sil.toasts.some((x) => /30|말이 없|no speech/i.test(x)), sil);
    await shotTo(page, 'pc-5-silence-stopped');

    // (6) 창 숨김(최소화): 멈추고 알린다
    await page.mouse.move(W / 2, 900); await sleep(600);
    await page.click(btn);
    fake.st.talking = true;
    await until(async () => (await ui(page)).state === 'listening', 10000, 100);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].minimize());
    await sleep(2500);
    const vis = await page.evaluate(() => document.visibilityState);
    await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.restore(); });
    await awayWin(app);
    await sleep(1200);
    const hid = await ui(page);
    check('창을 최소화하면 녹음을 끝내고 알린다', hid.state === 'idle' && hid.toasts.some((x) => /숨어|hidden/i.test(x)), { vis, hid });
    await shotTo(page, 'pc-6-hidden-stopped');
    fake.st.talking = false;

    // (7) 판 기록: 끝 줄에 까닭
    await sleep(3500);
    const lines = voiceLines();
    check('판 기록의 끝 줄에 까닭(user·silence·hidden)', /end user /.test(lines.join('\n')) && /end silence /.test(lines.join('\n')) && /end hidden /.test(lines.join('\n')), lines.slice(-8));
    check('판 기록에 키·전사 글이 없다', !/fake-p176|Bearer|시험 말/.test(backendLog()), '');
  } finally { await closeApp(app); await fake.close(); }
}

async function phone() {
  const fake = await fakeSoniox();
  const pw = await import('playwright');
  const toUrl = (p) => 'file:///' + p.replace(/\\/g, '/');
  const { startTsSim } = await import(toUrl(path.join(REPO, 'backend', 'tools', 'ts-sim-proxy.mjs')));
  const sim = startTsSim({ listen: SIM, target: Number(PORT), name: L.NAME, login: L.LOGIN, keepOrigin: true }); sim.cfg.ip = L.LAPTOP_A;
  await sim.ready;
  const pwDir = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright');
  const chromeExe = (() => { try { return fs.readdirSync(pwDir).filter((x) => /^chromium-\d+$/.test(x)).sort().reverse().map((x) => path.join(pwDir, x, 'chrome-win64', 'chrome.exe')).find((f) => fs.existsSync(f)); } catch { return null; } })();
  const browser = await pw.chromium.launch({ headless: true, ...(chromeExe ? { executablePath: chromeExe } : {}), args: MIC });
  try {
    const SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
    const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, screen: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: SAFARI, locale: 'ko-KR', reducedMotion: 'reduce' });
    await ctx.grantPermissions(['microphone'], { origin: `http://localhost:${SIM}` });
    const pg = await ctx.newPage();
    pg.on('pageerror', (e) => log(`[phone pageerror] ${e.message}`));
    await pg.goto(`http://localhost:${SIM}/`);
    await pg.waitForSelector('[data-role=pair]', { timeout: 30000 });
    await pg.fill('[data-field=pair-code]', call('device.code').code);
    await pg.click('[data-action=pair-submit]');
    await pg.waitForFunction(() => window.__mt && window.__mt.getState().boardLoaded && window.__mt.api.conn.phase === 'open', null, { timeout: 60000 });
    await sleep(1500);
    const id = sess().sessionId;
    await pg.evaluate((x) => window.__mtPhone.open(x), id);
    const vb = '[data-role=phone-input] [data-action=voice]';
    await pg.waitForSelector(vb, { timeout: 15000 });
    await sleep(800);
    const ph = () => pg.evaluate(() => { const b = document.querySelector('[data-role=phone-input] [data-action=voice]'); const p = document.querySelector('[data-role="voice-pill"]'); return { state: b ? b.dataset.state : null, pill: p ? p.textContent : null, toasts: [...document.querySelectorAll('.mt-toast')].map((x) => x.textContent) }; });
    await pg.tap(vb);
    fake.st.talking = true;
    const lis = await until(async () => { const s = await ph(); return s.state === 'listening' ? s : null; }, 15000, 100);
    check('[휴대폰] 녹음 중(입력칸이 보이면 알약 없음)', lis && !lis.pill, lis);
    await sleep(800);
    await pg.screenshot({ path: path.join(OUT, 'phone-1-listening.png') });
    // 녹음 중 다른 화면(목록)으로 간다: 입력칸이 사라지면 녹음을 끝낸다
    const before = voiceLines().length;
    await pg.evaluate(() => window.__mtPhone.list());
    await sleep(2500);
    const gone = await ph();
    const lines = voiceLines().slice(before);
    check('[휴대폰] 녹음 중 다른 화면으로 가면 녹음을 끝낸다(판 기록 end unmount)', !gone.pill && lines.some((l) => /end unmount /.test(l)), { gone, lines });
    await pg.screenshot({ path: path.join(OUT, 'phone-2-left-input.png') });
    // 말 없음은 휴대폰도 같다
    await pg.evaluate((x) => window.__mtPhone.open(x), id);
    await pg.waitForSelector(vb, { timeout: 15000 });
    fake.st.talking = false;
    await pg.tap(vb);
    const sil = await until(async () => { const s = await ph(); return s.state === 'error' || (s.state === 'idle' && s.toasts.length) ? s : null; }, IDLE_MS + 10000, 200);
    check('[휴대폰] 말 없음으로 저절로 멈추고 알린다', sil && sil.toasts.some((x) => /말이 없|no speech/i.test(x)), sil);
    await pg.screenshot({ path: path.join(OUT, 'phone-3-silence.png') });
    await ctx.close();
  } finally { await browser.close().catch(() => {}); await sim.close?.(); await fake.close(); }
}

async function autotag() {
  const { app, page } = await launch({ log, env: { ...ENV }, args: ['--remote-debugging-port=9425', ...AWAKE] });
  try {
    await awayWin(app);
    await winSize(app, page, 1584, 921);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await sleep(2500);
    const list = call('session.list');
    const idOf = (n) => list.find((x) => x.name === n).sessionId;
    const [A, B, C] = [TAGS[0], TAGS[1], NAME];
    // 판 전체를 보이게 하고 머리줄을 누른다(화면은 그 노드로 옮겨 가지만 머리줄 자리는 다시 찾는다)
    const fit = async () => { await page.keyboard.press('Escape'); await page.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur()); await page.click('[data-action="fit-all"], [data-chip="fit"]', { timeout: 1500 }).catch(() => {}); await sleep(900); };
    const head = async (n) => { await fit(); const sel = `.react-flow__node[data-id="${idOf(n)}"] .mt-node-head`; await page.waitForSelector(sel, { timeout: 5000 }); await page.click(sel, { position: { x: 60, y: 8 } }); await sleep(700); };
    const bar = () => page.$eval('[data-role="command"]', (el) => el.value);
    await head(A);
    const a = await bar();
    check('빈 명령줄에서 세션 A를 누르면 @A', a === `@${A} `, a);
    await shotTo(page, 'tag-1-click-a');
    await head(B);
    const b = await bar();
    check('세션 B를 누르면 태그가 @B로 옮겨 간다', b === `@${B} `, b);
    await shotTo(page, 'tag-2-click-b');
    // 사람이 글을 친다 → 보통 태그가 된다
    await page.click('[data-role="command"]'); await page.keyboard.press('End'); await page.keyboard.type('hello'); await sleep(300);
    await head(C);
    const c = await bar();
    check('글을 친 뒤 세션 C를 누르면 그대로', c === `@${B} hello`, c);
    await shotTo(page, 'tag-3-typed-click-c');
    // 비우고 세션 A → @A, 빈 판을 누르면 지운다
    await page.click('[data-role="command"]'); await page.keyboard.press('Control+A'); await page.keyboard.press('Delete'); await sleep(200);
    await head(A);
    const a2 = await bar();
    await fit();
    const spot = await page.evaluate(() => { for (let y = 120; y < 700; y += 37) for (let x = 120; x < 1500; x += 53) { const el = document.elementFromPoint(x, y); if (el && el.classList.contains('react-flow__pane')) return { x, y }; } return null; });
    if (spot) await page.mouse.click(spot.x, spot.y);
    await sleep(700);
    const e = await bar();
    check('비우고 A를 누르면 @A, 빈 판을 누르면 다시 빈 명령줄', a2 === `@${A} ` && !!spot && e === '', { a2, spot, e });
    await shotTo(page, 'tag-4-pane-cleared');
    // 손으로 넣은 태그는 건드리지 않는다
    await page.click('[data-role="command"]'); await page.keyboard.type(`@${C} `); await sleep(200);
    await head(A);
    const m = await bar();
    check('손으로 넣은 태그가 있으면 세션을 눌러도 그대로', m === `@${C} `, m);
  } finally { await closeApp(app); }
}

async function stopBoard() {
  for (const s of call('session.list').filter((x) => /^p176-/.test(x.name))) { try { atrium('kill', s.name, '--yes'); } catch (e) { log(`kill ${s.name} ${e.message.slice(0, 100)}`); } }
  await sleep(2000);
  try { log(atrium('terminal', 'stop', '--yes').slice(0, 200)); } catch (e) { log(`terminal stop ${e.message.slice(0, 120)}`); }
  try { log(atrium('backend', 'stop').slice(0, 200)); } catch (e) { log(`backend stop ${e.message.slice(0, 120)}`); }
}

try {
  if (WHAT === 'setup') await setupBoard();
  else if (WHAT === 'pc') await pc();
  else if (WHAT === 'phone') await phone();
  else if (WHAT === 'autotag') await autotag();
  else if (WHAT === 'stop') await stopBoard();
} catch (e) {
  check('시험이 끝까지 돌았다', false, e.stack || e.message);
} finally {
  fs.writeFileSync(path.join(OUT, `p176-${WHAT}.json`), JSON.stringify({ results }, null, 2));
  const bad = results.filter((r) => !r.ok);
  log(`결과 ${results.length - bad.length}/${results.length} 통과${bad.length ? ` 실패: ${bad.map((b) => b.name).join(', ')}` : ''}`);
  process.exit(bad.length ? 1 : 0);
}
