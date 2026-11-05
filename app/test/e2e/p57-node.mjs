// P57(원격 강화 S1) 창 시험: 짝 맺은 기기는 짝 맺은 Tailscale 기기에서만 쓴다.
//   브라우저(Playwright Chromium) → ts-sim(47976: Host pc.example.ts.net, Tailscale-User-Login, X-Forwarded-For=기기 주소) → 백엔드(47876)
// 판은 가짜 tailscale(p49-fake-tailscale.mjs: status, serve status, whois)을 읽는다. 따로 띄운 개발용 판(atrium-dev-p57, 47876, backend/.dev)만 쓴다.
// 결과는 experiments/p57/(git 밖).
//   1. 노트북 A(100.64.0.2)가 허락을 청하면 PC 창 카드에 Tailscale이 확인한 기기 이름(laptop-a)이 크게, 브라우저 이름이 작게 보인다
//   2. 허락 → A에서 보드를 쓴다
//   3. 같은 기기 토큰을 노트북 B(100.64.0.3) 주소로 보내면 거부(HTTP 401, WebSocket 거부, 브라우저는 짝 맺기 화면)
//   4. 연결된 기기 목록에 Tailscale 기기 이름과 별칭, 진단에 "Tailscale 기기에 묶임" 줄, atrium remote status 줄
// 실행: node app/test/e2e/p57-node.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const DEV = path.join(REPO, 'backend', '.dev');
const OUT = path.join(REPO, 'experiments', 'p57');
const CONVOS = path.join(OUT, 'convos');
const NAME = 'pc.example.ts.net';
const PROXY = 47976;
export const ENV = {
  ATRIUM_HERDR_SESSION: 'atrium-dev-p57', ATRIUM_PORT: '47876',
  ATRIUM_DATA_DIR: path.join(DEV, 'data'), ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  ATRIUM_CLAUDE_PROJECTS: CONVOS, ATRIUM_CLAUDE_DESKTOP: 'none', MT_E2E_OUT: 'p57',
  ATRIUM_TAILSCALE: path.join(REPO, 'app', 'test', 'e2e', 'p49-fake-tailscale.mjs'), P49_FAKE_TS_PORT: '47876',
};
Object.assign(process.env, ENV);
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(CONVOS, { recursive: true });
const { launch, logger, shot, sleep, until, closeApp } = await import('./harness.mjs');
const { assertTestBoard } = await import('./p9-guard.mjs');
assertTestBoard(ENV);
if (ENV.ATRIUM_PORT !== '47876' || ENV.ATRIUM_HERDR_SESSION !== 'atrium-dev-p57') throw new Error('P57 판만');
const toUrl = (p) => 'file:///' + p.replace(/\\/g, '/');
const { startTsSim } = await import(toUrl(path.join(REPO, 'backend', 'tools', 'ts-sim-proxy.mjs')));

const log = logger('p57-node');
const BASE = `http://${NAME}:${PROXY}`;
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: { ...process.env, ...ENV }, timeout: 120000 });
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 700)}` : ''}`); };
const wshot = async (page, name) => { await page.screenshot({ path: path.join(OUT, `${name}.png`) }); log(`스크린숏 experiments/p57/${name}.png`); };
const A = '100.64.0.2', B = '100.64.0.3';

let app, win, browser, tsim;
try {
  tsim = startTsSim({ listen: PROXY, target: 47876, name: NAME, login: 'me@example.com' });
  tsim.cfg.ip = A;
  await tsim.ready;
  ({ app, page: win } = await launch({ log, env: ENV }));
  await win.setViewportSize({ width: 1500, height: 900 }).catch(() => {});
  await win.waitForFunction(() => window.__mt && window.__mt.getState().boardLoaded, null, { timeout: 90000 });
  await until(async () => { const d = await win.evaluate(() => window.__mt.api.call('remote.status', { fresh: true })); return d && d.url ? d : null; }, 20000);
  // 앞선 시험에서 남은 기기를 끊는다
  for (const d of (await win.evaluate(() => window.__mt.api.call('device.list'))).devices) await win.evaluate((id) => window.__mt.api.call('device.revoke', { id }), d.id);
  // 브라우저 안에서 부르는 fetch(이름 풀이는 브라우저의 --host-resolver-rules를 쓴다)
  const getMe = (pg, t) => pg.evaluate(async (tk) => { const r = await fetch('/web/me', { headers: { authorization: `Bearer ${tk}` }, cache: 'no-store' }); return { status: r.status, body: await r.json().catch(() => null) }; }, t);

  browser = await chromium.launch({ headless: true, channel: 'chromium', args: [`--host-resolver-rules=MAP ${NAME} 127.0.0.1`, `--unsafely-treat-insecure-origin-as-secure=${BASE}`] });
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'ko-KR' });
  const page = await ctxA.newPage();
  page.on('pageerror', (e) => log(`[web pageerror] ${e.message}`));

  // ---- 1. 노트북 A에서 허락 요청 → PC 카드 ----
  await page.goto(`${BASE}/`);
  await page.waitForSelector('[data-role=pair]', { timeout: 20000 });
  await page.fill('[data-field=pair-name]', 'Chrome on laptop');
  await page.click('[data-action=pair-ask]');
  await page.waitForSelector('[data-role=pair-wait]', { timeout: 10000 });
  await win.waitForSelector('[data-role=pair-request-banner] [data-role=request-node]', { timeout: 10000 });
  const card = await win.evaluate(() => ({ node: document.querySelector('[data-role=pair-request-banner] [data-role=request-node]').textContent, alias: document.querySelector('[data-role=pair-request-banner] [data-role=request-alias]').textContent }));
  check('허락 카드에 Tailscale이 확인한 기기 이름(크게)과 브라우저 이름(작게)', /laptop-a/.test(card.node) && /Chrome on laptop/.test(card.alias) && !/Chrome on laptop/.test(card.node), card);
  await shot(win, '01-pc-request-card', log);

  // ---- 2. 허락 → A에서 사용 ----
  await win.click('[data-role=pair-request-banner] [data-action=device-allow]');
  await page.waitForFunction(() => window.__mt && window.__mt.getState().boardLoaded && window.__mt.getState().conn === 'open', null, { timeout: 60000 });
  const useA = await page.evaluate(async () => { const r = await window.__mt.api.call('device.list'); return { me: r.me, n: r.devices.length, node: r.devices[0] && r.devices[0].tsNode && r.devices[0].tsNode.name }; });
  check('노트북 A는 허락 뒤 보드를 쓴다', useA.me && useA.node === 'laptop-a', useA);
  await wshot(page, '02-laptop-a-board');
  const token = await page.evaluate(() => localStorage.getItem('atrium.deviceToken'));

  // ---- 3. 같은 자격을 노트북 B 주소로 ----
  tsim.cfg.ip = B;
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'ko-KR' });
  await ctxB.addInitScript((t) => { if (!sessionStorage.getItem('p57.once')) { sessionStorage.setItem('p57.once', '1'); localStorage.setItem('atrium.deviceToken', t); } }, token);
  const pageB = await ctxB.newPage();
  await pageB.goto(`${BASE}/`);
  const toPair = await pageB.waitForSelector('[data-role=pair]', { timeout: 20000 }).then(() => true, () => false);
  const cleared = await pageB.evaluate(() => localStorage.getItem('atrium.deviceToken'));
  check('노트북 B의 브라우저는 짝 맺기 화면으로 가고 토큰을 버린다', toPair && !cleared, { toPair, tokenLeft: !!cleared });
  const me = await getMe(pageB, token);
  check('노트북 B 주소로 보낸 같은 토큰은 HTTP 401(다시 짝 맺기)', me.status === 401 && me.body && me.body.error.code === 'tailscale_node', me);
  await wshot(pageB, '03-laptop-b-refused');
  const wsB = await pageB.evaluate((t) => new Promise((res) => { const ws = new WebSocket(`ws://${location.host}/api?device=${encodeURIComponent(t)}`); ws.onopen = () => { ws.close(); res('open'); }; ws.onerror = () => res('refused'); setTimeout(() => res('timeout'), 8000); }), token);
  check('노트북 B 주소의 WebSocket 연결도 거부', wsB === 'refused', { wsB });
  // A로 돌아가면 그대로 쓴다(기억한 whois 결과)
  tsim.cfg.ip = A;
  const meA = await getMe(page, token);
  check('노트북 A는 그대로 쓴다', meA.status === 200, { status: meA.status });

  // ---- 4. PC 창의 기기 목록과 진단, CLI ----
  await win.click('[data-action=settings-open]');
  await win.click('[data-tab=devices]');
  await win.waitForSelector('[data-role=device-list] [data-role=device-node]');
  await sleep(600);
  const row = await win.evaluate(() => { const r = document.querySelector('[data-role=device-list] .mt-wdev-row'); return { node: r.querySelector('[data-role=device-node]').textContent, bind: r.querySelector('[data-role=device-bind]').textContent, kind: r.querySelector('[data-role=device-bind]').dataset.bind }; });
  check('연결된 기기 목록: Tailscale 기기 이름(크게)과 브라우저 별칭(작게)', /laptop-a/.test(row.node) && /Chrome on laptop/.test(row.bind) && row.kind === 'tailscale', row);
  const nodesLine = await win.evaluate(() => { const li = document.querySelector('[data-check=nodes]'); return li ? { text: li.textContent, level: li.dataset.level } : null; });
  check('진단에 "Tailscale 기기에 묶임" 줄', nodesLine && nodesLine.level === 'ok' && /묶|bound to their Tailscale device/.test(nodesLine.text), nodesLine);
  await win.evaluate(() => document.querySelector('[data-role=device-list]').scrollIntoView());
  await shot(win, '04-pc-devices', log);
  const cli = atrium('remote', 'status');
  fs.writeFileSync(path.join(OUT, 'remote-status.txt'), cli);
  check('atrium remote status에 묶임 줄', /Tailscale 기기에 묶임/.test(cli), cli.split(/\r?\n/).find((l) => /묶임/.test(l)) || '');
  await win.click('[data-action=settings-close]').catch(() => {});
  // 기기 끊기(뒷정리)
  const devs = await win.evaluate(() => window.__mt.api.call('device.list'));
  for (const d of devs.devices) await win.evaluate((id) => window.__mt.api.call('device.revoke', { id }), d.id);
} catch (e) {
  log(`오류 ${e.stack}`);
  check('시험이 끝까지 돎', false, e.message);
} finally {
  if (browser) await browser.close().catch(() => {});
  if (app) await closeApp(app);
  if (tsim) await tsim.close().catch(() => {});
  fs.writeFileSync(path.join(OUT, 'p57-node-results.json'), JSON.stringify({ results }, null, 2));
  const bad = results.filter((r) => !r.ok);
  log(`결과 ${results.length - bad.length}/${results.length} 통과${bad.length ? ` 실패: ${bad.map((b) => b.name).join(', ')}` : ''}`);
  process.exit(bad.length ? 1 : 0);
}
