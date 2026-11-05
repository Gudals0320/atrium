// P58(원격 강화 S4) 창 시험: PC에서 원격 연결을 보고, 끊고, 막는다. PC 창(Electron)과 짝 맺은 브라우저(Playwright Chromium)가 한 판을 쓴다.
//   브라우저 → ts-sim(47878: Host를 pc.example.ts.net으로, Tailscale-User-Login·X-Forwarded-*를 넣음) → 백엔드(47877)
// 판은 가짜 tailscale(p49-fake-tailscale.mjs, 예시 이름)을 읽는다. 따로 띄운 개발용 판(atrium-dev-p58, 47877, backend/.dev)만 쓴다. 결과는 experiments/p58/(git 밖).
// 흐름: 브라우저가 붙음 → PC 창에 알림 → 알약에서 끊기 → 브라우저가 다시 붙음 → 짝 풀기 → 거부 → 원격 받기 끄기 → 바깥 요청 거부 → 켜기 → 다시 됨.
//       트레이 메뉴와 atrium remote block|allow|status|log도 본다. 끝에 그 과정이 연결 기록에 맞게 남았는지 본다.
// 실행: node app/test/e2e/p58-remote.mjs
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const DEV = path.join(REPO, 'backend', '.dev');
const OUT = path.join(REPO, 'experiments', 'p58');
const CONVOS = path.join(OUT, 'convos');
const NAME = 'pc.example.ts.net';
const LOGIN = 'me@example.com';
const QUIET_MS = 6000;
export const ENV = {
  ATRIUM_HERDR_SESSION: 'atrium-dev-p58', ATRIUM_PORT: '47877',
  ATRIUM_DATA_DIR: path.join(DEV, 'data'), ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  ATRIUM_CLAUDE_PROJECTS: CONVOS, ATRIUM_CLAUDE_DESKTOP: 'none', MT_E2E_OUT: 'p58',
  ATRIUM_TAILSCALE: path.join(REPO, 'app', 'test', 'e2e', 'p49-fake-tailscale.mjs'), P49_FAKE_TS_PORT: '47877',
  ATRIUM_REMOTE_QUIET_MS: String(QUIET_MS), // 다시 연결로 보는 시간(기본 3분)을 시험에서 줄인다
};
Object.assign(process.env, ENV);
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(CONVOS, { recursive: true });
const { launch, logger, shot, sleep, until, closeApp } = await import('./harness.mjs');
const { assertTestBoard } = await import('./p9-guard.mjs');
assertTestBoard(ENV);
if (ENV.ATRIUM_PORT !== '47877' || ENV.ATRIUM_HERDR_SESSION !== 'atrium-dev-p58') throw new Error('P58 판만');
const toUrl = (p) => 'file:///' + p.replace(/\\/g, '/');
const { startTsSim } = await import(toUrl(path.join(REPO, 'backend', 'tools', 'ts-sim-proxy.mjs')));

const log = logger('p58-remote');
const SIM = 47878;
const BASE = `http://${NAME}:${SIM}`;
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: { ...process.env, ...ENV }, timeout: 120000 });
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 700)}` : ''}`); };
const wshot = async (page, name) => { await page.screenshot({ path: path.join(OUT, `${name}.png`) }); log(`스크린숏 experiments/p58/${name}.png`); };
// 흉내 프록시를 거친 바깥 요청(브라우저 밖에서, Host 이름 그대로)
const viaSim = (p, { method = 'GET', headers = {}, body } = {}) => new Promise((res, rej) => {
  const r = http.request({ host: '127.0.0.1', port: SIM, path: p, method, headers: { host: `${NAME}:${SIM}`, ...headers } }, (resp) => { const ch = []; resp.on('data', (d) => ch.push(d)); resp.on('end', () => { const t = Buffer.concat(ch).toString(); let j = null; try { j = JSON.parse(t); } catch {} res({ status: resp.statusCode, body: j, text: t }); }); });
  r.on('error', rej); if (body) r.write(body); r.end();
});

let app, win, browser, tsim;
try {
  tsim = startTsSim({ listen: SIM, target: 47877, name: NAME, login: LOGIN });
  await tsim.ready;
  let mainPid;
  ({ app, page: win, mainPid } = await launch({ log, env: ENV }));
  await win.setViewportSize({ width: 1500, height: 900 }).catch(() => {});
  await win.evaluate(() => localStorage.setItem('mt.clientName', 'PC window'));
  await win.reload(); await win.waitForFunction(() => window.__mt && window.__mt.getState().boardLoaded, null, { timeout: 90000 });
  await win.evaluate(() => window.__mt.pinBottom && window.__mt.pinBottom(true));
  const rs = await until(async () => { const d = await win.evaluate(() => window.__mt.api.call('remote.status', { fresh: true })); return d && d.url ? d : null; }, 20000);
  check('판이 가짜 Tailscale 이름을 읽고 원격 받기가 켜져 있다', rs.url === `https://${NAME}/` && rs.accepting === true, { url: rs.url, accepting: rs.accepting });
  const notices = () => win.evaluate(() => window.__mt.remoteNotices.map((n) => ({ kind: n.kind, text: n.text, os: n.os, result: n.result })));
  const toasts = () => win.evaluate(() => [...document.querySelectorAll('.mt-toast')].map((e) => e.textContent));

  browser = await chromium.launch({ headless: true, channel: 'chromium', args: [`--host-resolver-rules=MAP ${NAME} 127.0.0.1`, `--unsafely-treat-insecure-origin-as-secure=${BASE}`] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 820 }, locale: 'ko-KR' });
  const openPage = async () => {
    const pg = await ctx.newPage();
    pg.on('pageerror', (e) => log(`[web pageerror] ${e.message}`));
    pg.on('console', (m) => { if (m.type() === 'error') log(`[web console.error] ${m.text().slice(0, 200)}`); });
    return pg;
  };
  const pairByCode = async (pg, name) => {
    await win.click('[data-action=settings-open]');
    await win.click('button[data-tab=devices]');
    await win.waitForSelector('[data-action=device-new-code]');
    await win.click('[data-action=device-new-code]');
    const code = (await win.textContent('[data-role=pair-code]')).trim();
    await win.click('[data-action=settings-close]').catch(() => {});
    await pg.goto(`${BASE}/`);
    await pg.waitForSelector('[data-role=pair]', { timeout: 20000 });
    await pg.fill('[data-field=pair-name]', name);
    await pg.fill('[data-field=pair-code]', code);
    await pg.click('[data-action=pair-submit]');
    await pg.waitForFunction(() => window.__mt && window.__mt.getState().boardLoaded && window.__mt.getState().conn === 'open', null, { timeout: 60000 });
    await pg.evaluate(() => localStorage.setItem('mt.clientName', 'Laptop browser'));
  };
  const webOpen = (pg) => pg.evaluate(() => window.__mt && window.__mt.getState().conn === 'open' && window.__mt.api.conn.phase === 'open').catch(() => false);

  // ---- 1. 짝 맺기와 붙음 알림 ----
  let page = await openPage();
  await pairByCode(page, 'p58 laptop');
  const n1 = await until(async () => { const n = await notices(); return n.length ? n : null; }, 10000).catch(() => []);
  check('짝 맺기 성공을 PC 창에 알린다(토스트)', n1.length === 1 && n1[0].kind === 'paired' && /짝을 맺었습니다|paired/.test(n1[0].text), n1);
  await shot(win, '01-pc-paired-toast', log);
  await sleep(1000);
  check('짝 맺은 바로 뒤 첫 연결은 다시 알리지 않는다', (await notices()).length === 1, await notices());
  // 잠깐 끊겼다 다시 붙음(새로 고침): 알리지 않는다
  await page.reload(); await until(() => webOpen(page), 30000);
  await sleep(800);
  check('다시 연결(새로 고침)은 알리지 않는다', (await notices()).length === 1);
  // 탭을 닫고 조용한 시간이 지난 뒤 다시 열면 "원격으로 붙었습니다"
  await page.close();
  await sleep(QUIET_MS + 1500);
  // 창을 내려 두면 OS 알림도 띄운다(초점 없음)
  await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.blur(); w.minimize(); });
  await sleep(600);
  page = await openPage();
  await page.goto(`${BASE}/`);
  await until(() => webOpen(page), 30000);
  const n2 = await until(async () => { const n = await notices(); return n.length >= 2 && n[1].os !== null ? n : null; }, 10000).catch(() => notices());
  const osNotes = await app.evaluate(() => (global.__mtNotifications || []).map((x) => ({ key: x.key, shown: x.shown })));
  check('조용한 시간 뒤 새로 붙으면 "원격으로 붙었습니다"를 알리고, 창이 숨어 있으면 OS 알림도', n2.length === 2 && n2[1].kind === 'connected' && /원격으로 붙었습니다|connected remotely/.test(n2[1].text) && n2[1].os === true && osNotes.some((x) => String(x.key).startsWith('remote|')), { n2, osNotes });
  await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.restore(); w.show(); w.focus(); });
  await sleep(800);
  const lastToast = await toasts();
  check('PC 창 토스트에 기기 이름·로그인·브라우저', lastToast.some((t) => t.includes('p58 laptop') && t.includes(LOGIN) && /Chrome|Chromium/.test(t)), lastToast);

  // ---- 2. 알약에서 끊기 → 다시 붙음 ----
  await win.waitForSelector('[data-role=peers]', { timeout: 15000 });
  await win.click('[data-role=peers]');
  await win.waitForSelector('[data-role=peers-list] [data-action=peer-kick]', { timeout: 5000 });
  await shot(win, '02-pc-peers-list', log);
  const before = (await notices()).length;
  const closeCodes = [];
  await page.exposeFunction('__p58close', (c) => closeCodes.push(c)).catch(() => {});
  await page.evaluate(() => { const ws = window.__mt.api.ws; ws.addEventListener('close', (e) => window.__p58close(e.code)); });
  const tKick = Date.now();
  await win.click('[data-role=peers-list] [data-action=peer-kick]');
  const kicked = await until(async () => (closeCodes.length ? closeCodes[0] : null), 5000).catch(() => null);
  const banner = await until(async () => (await page.$('[data-role=reconnect-banner]')) ? await page.textContent('[data-role=reconnect-banner]') : null, 3000).catch(() => null);
  const back = await until(() => webOpen(page), 30000).then(() => Date.now() - tKick, () => null);
  await sleep(600);
  check('알약에서 "끊기": 브라우저 연결이 4402로 닫히고, 브라우저가 저절로 다시 붙는다(다시 알리지 않음)', kicked === 4402 && back != null && (await notices()).length === before, { kicked, banner, backMs: back, notices: (await notices()).length });
  await wshot(page, '03-web-back-after-kick');

  // ---- 3. 짝 풀기 → 거부 ----
  await win.click('[data-role=peers]').catch(() => {});
  if (!(await win.$('[data-role=peers-list]'))) await win.click('[data-role=peers]');
  await win.waitForSelector('[data-role=peers-list] [data-action=peer-unpair]', { timeout: 10000 });
  await win.click('[data-role=peers-list] [data-action=peer-unpair]');
  await win.waitForSelector('[data-role=unpair-dialog]');
  await shot(win, '04-pc-unpair-confirm', log);
  const oldToken = await page.evaluate(() => localStorage.getItem('atrium.deviceToken'));
  await win.click('[data-action=unpair-confirm]');
  const toPair = await page.waitForSelector('[data-role=pair]', { timeout: 20000 }).then(() => true, () => false);
  const refused = await viaSim('/web/me', { headers: { authorization: `Bearer ${oldToken}` } });
  check('"짝 풀기"(확인 뒤): 브라우저는 짝 맺기 화면으로 가고, 옛 토큰은 거부된다', toPair && refused.status === 401, { toPair, status: refused.status });
  await wshot(page, '05-web-unpaired');

  // ---- 4. 원격 받기 끄기 → 바깥 요청 거부 → 켜기 → 다시 됨 ----
  await page.close();
  page = await openPage();
  await pairByCode(page, 'p58 laptop 2');
  const token2 = await page.evaluate(() => localStorage.getItem('atrium.deviceToken'));
  await win.click('[data-action=settings-open]');
  await win.click('button[data-tab=devices]');
  await win.waitForSelector('[data-role=remote-access] [data-field=remoteAccess]');
  await win.click('[data-role=remote-access] [data-field=remoteAccess]');
  await until(async () => (await win.getAttribute('[data-role=remote-access]', 'data-on')) === '0', 5000);
  const blockedShown = await page.waitForSelector('[data-role=remote-blocked]', { timeout: 10000 }).then(() => true, () => false);
  await wshot(page, '06-web-remote-blocked');
  await shot(win, '06-pc-remote-off', log);
  const me = await viaSim('/web/me', { headers: { authorization: `Bearer ${token2}` } });
  const pageBlocked = await viaSim('/');
  const pairBlocked = await viaSim('/web/pair/request', { method: 'POST', headers: { origin: `https://${NAME}`, 'content-type': 'application/json' }, body: '{}' });
  check('원격 받기 끄기(설정 탭): 브라우저에 "PC에서 원격을 막았습니다", 바깥 요청은 모두 거부', blockedShown && me.status === 403 && me.body && me.body.error.code === 'remote_blocked' && pageBlocked.status === 503 && /PC에서 원격을 막았습니다/.test(pageBlocked.text) && pairBlocked.status === 403, { blockedShown, me: me.status, page: pageBlocked.status, pair: pairBlocked.status });
  const pcStill = await win.evaluate(async () => (await window.__mt.api.call('ping', { t: 1 })).t === 1);
  const status = atrium('remote', 'status');
  const trayOff = await app.evaluate(() => global.__mtTray.state());
  check('이 PC의 창과 CLI는 그대로 되고, remote status와 트레이 메뉴가 막음을 보인다', pcStill && /\[막음\] PC에서 원격을 막았습니다/.test(status) && trayOff.remoteAccess === false && trayOff.menu.some((m) => /원격 받기 \[ \]|Accept remote connections \[ \]/.test(m)), { pcStill, status: status.split('\n')[0], menu: trayOff.menu });
  fs.writeFileSync(path.join(OUT, 'remote-status-blocked.txt'), status);
  // CLI로 켠다 → 브라우저가 저절로 다시 붙는다(백오프)
  log(atrium('remote', 'allow').trim());
  const tAllow = Date.now();
  const reopen = await until(async () => (await webOpen(page)) && !(await page.$('[data-role=remote-blocked]')), 30000).then(() => Date.now() - tAllow, () => null);
  const me2 = await viaSim('/web/me', { headers: { authorization: `Bearer ${token2}` } });
  check('켜기(atrium remote allow): 브라우저가 다시 붙고 바깥 요청이 다시 된다', reopen != null && me2.status === 200, { reopenMs: reopen, me: me2.status });
  await wshot(page, '07-web-back-after-allow');
  // 트레이 메뉴로 끄고 켠다, CLI block도
  await app.evaluate(() => global.__mtTray.run('remote-access'));
  const trayBlocked = await until(async () => (await page.$('[data-role=remote-blocked]')) && (await app.evaluate(() => global.__mtTray.state().remoteAccess)) === false, 10000).then(() => true, () => false);
  await app.evaluate(() => global.__mtTray.run('remote-access'));
  const trayBack = await until(async () => (await webOpen(page)) && (await app.evaluate(() => global.__mtTray.state().remoteAccess)) === true, 30000).then(() => true, () => false);
  const cliBlock = atrium('remote', 'block').trim();
  const cliBlocked = await page.waitForSelector('[data-role=remote-blocked]', { timeout: 10000 }).then(() => true, () => false);
  atrium('remote', 'allow');
  const cliBack = await until(() => webOpen(page), 30000).then(() => true, () => false);
  check('트레이 메뉴와 atrium remote block으로도 끄고 켠다', trayBlocked && trayBack && cliBlocked && cliBack && /원격을 막았습니다/.test(cliBlock), { trayBlocked, trayBack, cliBlocked, cliBack, cliBlock });

  // ---- 5. 연결 기록 ----
  await sleep(800);
  const entries = (await win.evaluate(() => window.__mt.api.call('remote.log', { limit: 500 }))).entries.reverse(); // 오래된 것부터
  const evs = entries.map((e) => `${e.event}${e.reason ? `:${e.reason}` : ''}`);
  const order = ['pair.ok', 'connect', 'kick', 'disconnect:pc', 'connect', 'unpair', 'disconnect:revoked', 'deny:device_token', 'pair.ok', 'remote.block', 'disconnect:blocked', 'deny:remote_blocked', 'remote.allow', 'connect', 'remote.block', 'remote.allow', 'remote.block', 'remote.allow'];
  let i = 0; for (const e of evs) if (i < order.length && e === order[i]) i++;
  const conn = entries.find((e) => e.event === 'connect');
  const text = JSON.stringify(entries);
  const noSecret = !text.includes(oldToken) && !text.includes(token2);
  check('흐름이 연결 기록에 차례대로 남고(기기·로그인·tailnet 주소·브라우저), 비밀은 없다', i === order.length && conn.remote === true && conn.login === LOGIN && /^100\.64\./.test(conn.addr || '') && !!conn.browser && noSecret, { matched: `${i}/${order.length}`, next: order[i], evs: evs.slice(-40), conn });
  fs.writeFileSync(path.join(OUT, 'remote-log.json'), JSON.stringify(entries, null, 2));
  fs.writeFileSync(path.join(OUT, 'remote-log-cli.txt'), atrium('remote', 'log', '--limit', '60'));
  if (!(await win.$('[data-role=settings]'))) await win.click('[data-action=settings-open]');
  await win.click('button[data-tab=devices]').catch(() => {});
  await win.waitForSelector('[data-role=remote-log] .mt-remote-log-row', { timeout: 10000 });
  await win.evaluate(() => document.querySelector('[data-role=remote-log]').scrollIntoView());
  const rows = await win.$$eval('[data-role=remote-log] .mt-remote-log-row', (els) => els.length);
  check('설정 › 연결된 기기 탭에 최근 기록이 보인다', rows >= 10, { rows });
  await shot(win, '08-pc-remote-log', log);
} catch (e) {
  log(`오류 ${e.stack}`);
  check('시험이 끝까지 돎', false, e.message);
} finally {
  if (browser) await browser.close().catch(() => {});
  if (app) await closeApp(app);
  if (tsim) await tsim.close().catch(() => {});
  fs.writeFileSync(path.join(OUT, 'p58-remote-results.json'), JSON.stringify({ results }, null, 2));
  const bad = results.filter((r) => !r.ok);
  log(`결과 ${results.length - bad.length}/${results.length} 통과${bad.length ? ` 실패: ${bad.map((b) => b.name).join(', ')}` : ''}`);
  process.exit(bad.length ? 1 : 0);
}
