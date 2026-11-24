// P352 창 시험: 휴대폰 이상 동작 기록. 휴대폰 흉내(Chromium 390×844, 터치, iPhone UA)로 판 웹 화면을 열고 일부러 일을 낸 뒤
// `atrium remote errors`에 종류별 묶음과 그때 상황이 나오는지 본다.
// 내는 일: 보이는 채 빠르게 죽은 뒤 다시 열림(기기 기록을 깔고 다시 읽기 → boot 줄 why fast·lite, 상황 reload), 화면 오류(throw), 처리 안 된 거부,
// 같은 API 세 번 실패(없는 메서드 → 상황 api), 보내기 실패(소켓을 닫고 바로 보내기 → 상황 send), 다시 연결 고리(소켓을 다섯 번 닫음 → 상황 wsloop)
// 판: 따로 띄운 개발용 판(atrium-dev-p352, 48097, backend/.dev)만. 휴대폰 흉내 프록시 48352.
// 실행: node app/test/e2e/p352-phone.mjs <setup|phone|stop> [round]   결과는 워크트리의 experiments/p352/<round>/(저장소 밖).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const WHAT = process.argv[2] || 'phone';
const TAG = process.argv[3] || 'r1';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const DEV = path.join(REPO, 'backend', '.dev');
const OUT = path.join(REPO, 'experiments', 'p352', TAG);
const BOARD = 'atrium-dev-p352', PORT = '48097', SIM = 48352;
const FOLDER = 'C:\\Workspace\\mtask-p352-a';
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_|HC_|MT_HERDR)/.test(k)) delete process.env[k];
for (const k of Object.keys(process.env)) if (/^(CLAUDECODE|CLAUDE_CODE_|CLAUDE_EFFORT|CLAUDE_PID|CLAUDE_AGENT_SDK|ELECTRON_RUN_AS_NODE)/.test(k)) delete process.env[k];
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
const L = await import('./p59-lib.mjs');
const { NAME, LOGIN, LAPTOP_A } = L;
const ENV = {
  ATRIUM_TERMINAL_SESSION: BOARD, ATRIUM_HERDR_SESSION: BOARD, ATRIUM_PORT: PORT,
  ATRIUM_DATA_DIR: path.join(DEV, 'data'), ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  ATRIUM_CLAUDE_PROJECTS: path.join(DEV, 'p352', 'convos'), ATRIUM_CLAUDE_DESKTOP: 'none', ATRIUM_TEST_PREFIX: 'p352-none-',
  ATRIUM_TAILSCALE: path.join(REPO, 'app', 'test', 'e2e', 'p49-fake-tailscale.mjs'), P49_FAKE_TS_PORT: PORT,
  ATRIUM_WEB_HOSTS: `${NAME}:${SIM},localhost:${SIM}`,
};
Object.assign(process.env, ENV);
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(ENV.ATRIUM_CLAUDE_PROJECTS, { recursive: true });
const { logger, sleep } = await import('./harness.mjs');
const { assertTestBoard } = await import('./p9-guard.mjs');
assertTestBoard(ENV, { root: DEV });

const log = logger(`p352-${WHAT}-${TAG}`);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 180000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail !== '' ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 1600)}` : ''}`); };
const SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
// 이 PC에 받아 둔 Chromium(설치된 playwright가 찾는 판이 없을 때). P352_CHROME으로 바꾼다
const CHROME = (() => { const c = process.env.P352_CHROME || path.join(process.env.LOCALAPPDATA || '', 'ms-playwright', 'chromium-1234', 'chrome-win64', 'chrome.exe'); return fs.existsSync(c) ? c : undefined; })();
const sess = (n) => call('session.list').find((s) => s.name === n);
const shot = (pg, name, opts = {}) => pg.screenshot({ path: path.join(OUT, `${name}.png`), ...opts }).then(() => log(`그림 ${name}.png`)).catch((e) => log(`스크린숏 실패 ${name} ${e.message.slice(0, 80)}`));

async function setup() {
  fs.mkdirSync(FOLDER, { recursive: true }); fs.writeFileSync(path.join(FOLDER, 'README.md'), '# p352\n');
  log(atrium('backend', 'start').slice(0, 300));
  await sleep(1500);
  if (!sess('sh1')) log(atrium('spawn', FOLDER, '--name', 'sh1', '--kind', 'shell'));
  check('sh1이 떴다', !!sess('sh1'));
}

const toUrl = (p) => 'file:///' + p.replace(/\\/g, '/');
async function withSim(fn) {
  const { startTsSim } = await import(toUrl(path.join(REPO, 'backend', 'tools', 'ts-sim-proxy.mjs')));
  const sim = startTsSim({ listen: SIM, target: Number(PORT), name: NAME, login: LOGIN, keepOrigin: true }); sim.cfg.ip = LAPTOP_A;
  await sim.ready;
  try { return await fn(); } finally { sim.close && sim.close(); }
}
const open = (pg) => pg.waitForFunction(() => window.__mt && window.__mt.getState().boardLoaded && window.__mt.api.conn.phase === 'open', null, { timeout: 60000 });
// 열린 지 3초 만에 보이는 채 죽은 휴대폰 페이지의 기기 기록
const fastCrash = () => { const t = Date.now() - 20000; return JSON.stringify({ v: 1, cur: { boot: t, alive: t + 3000, clean: false, light: false, retryBoot: false, mode: 'board', level: 0, view: 'map', phone: true, steps: [{ s: 'boot', t: 30 }, { s: 'open', t: 160 }, { s: 'msg', t: 190, k: 'events.subscribe', b: 166000 }, { s: 'msg', t: 670, k: 'board.get', b: 71000 }] }, crashes: [], light: false, retry: null, level: 0, ok: false, sent: null, by: 'touch' }); };

async function phone() {
  const pw = await import('playwright');
  const since = Date.now();
  await withSim(async () => {
    const browser = await pw.chromium.launch({ headless: true, executablePath: CHROME });
    try {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: SAFARI, locale: 'ko-KR' });
      const pg = await ctx.newPage();
      const cdp = await ctx.newCDPSession(pg);
      await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      const pageErrs = [];
      pg.on('pageerror', (e) => pageErrs.push(e.message));
      await pg.goto(`http://localhost:${SIM}/`);
      await pg.waitForSelector('[data-role=pair]', { timeout: 30000 });
      await pg.fill('[data-field=pair-code]', call('device.code').code);
      await pg.click('[data-action=pair-submit]');
      await open(pg);
      await sleep(1500);
      // 1. 보이는 채 빠르게 죽은 뒤 다시 열림: 다음 읽기 전에(페이지 스크립트보다 먼저) 기기 기록을 깐다
      await pg.addInitScript((c) => { try { if (!sessionStorage.getItem('p352')) { sessionStorage.setItem('p352', '1'); localStorage.setItem('mt.crumbs', c); } } catch {} }, fastCrash());
      await pg.reload();
      await open(pg);
      await sleep(2500);
      const tele = await pg.evaluate(() => !!(window.__mt && window.__mt.api.tap));
      check('휴대폰 화면에서 이상 동작 기록이 켜짐(api.tap)', tele);
      const bootLine = call('remote.log', { limit: 30 }).entries.find((e) => e.event === 'boot');
      check('boot 줄: why fast, lite', bootLine && bootLine.why === 'fast' && bootLine.lite === true, bootLine && { why: bootLine.why, lite: bootLine.lite, up: bootLine.crash && bootLine.crash.up });
      await shot(pg, '01-phone-lite-map');
      // 2. 화면 오류와 처리 안 된 거부
      await pg.evaluate(() => { setTimeout(() => { throw new Error('p352 provoked render error'); }, 0); Promise.reject(Object.assign(new Error('p352 provoked rejection'), { code: 'p352_test' })); });
      // 3. 같은 API 세 번 실패(상황 기록은 30초에 한 번이라 다시 열림 기록 뒤 기다린다)
      await sleep(31000);
      await pg.evaluate(async () => { for (let i = 0; i < 3; i++) await window.__mt.api.call('p352.nosuch', {}).catch(() => {}); });
      // 4. 보내기 실패: sh1 화면에서 글을 쓰고 소켓을 닫은 채 보낸다
      await sleep(31000);
      const id = sess('sh1').sessionId;
      await pg.evaluate((x) => window.__mtPhone.open(x), id);
      await pg.waitForSelector('[data-field=phone-text]', { timeout: 20000 });
      await pg.fill('[data-field=phone-text]', 'echo p352');
      await shot(pg, '02-phone-session-before-send');
      await pg.evaluate(() => { window.__mt.api.ws.close(); document.querySelector('[data-action=phone-send]').click(); });
      await sleep(1500);
      await shot(pg, '03-phone-send-failed');
      await open(pg);
      // 5. 다시 연결 고리: 붙을 때마다 닫기를 다섯 번
      await sleep(31000);
      for (let i = 0; i < 5; i++) { await open(pg); await sleep(300); await pg.evaluate(() => window.__mt.api.ws.close()); await sleep(400); }
      await open(pg);
      // 묶음 보내기(10초마다)를 기다린다
      await sleep(13000);
      check('페이지 오류(일부러 낸 것만)', pageErrs.every((m) => /p352 provoked/.test(m)), pageErrs);
      await ctx.close();
    } finally { await browser.close(); }
  });
  const mins = Math.ceil((Date.now() - since) / 60000) + 1;
  const text = atrium('remote', 'errors', '--since', `${mins}m`);
  const json = JSON.parse(atrium('remote', 'errors', '--since', `${mins}m`, '--json'));
  fs.writeFileSync(path.join(OUT, 'remote-errors.txt'), text);
  fs.writeFileSync(path.join(OUT, 'remote-errors.json'), JSON.stringify(json, null, 2));
  log(text);
  const g = (k, m) => json.groups.find((x) => x.k === k && (!m || x.m === m));
  check('묶음: 화면 오류', g('err') && /p352 provoked render error/.test(g('err').msg), g('err'));
  check('묶음: 처리 안 된 거부', g('rej') && g('rej').code === 'p352_test', g('rej'));
  check('묶음: API 실패 p352.nosuch ×3', g('api', 'p352.nosuch') && g('api', 'p352.nosuch').count === 3, g('api', 'p352.nosuch'));
  check('묶음: 보내기 실패 terminal.input disconnected', g('send', 'terminal.input') && g('send', 'terminal.input').code === 'disconnected', g('send', 'terminal.input'));
  check('묶음: 다시 연결', json.groups.some((x) => x.k === 'ws'), json.groups.filter((x) => x.k === 'ws'));
  const whys = json.snaps.map((s) => s.why);
  check('상황 기록: reload, api, send, wsloop', ['reload', 'api', 'send', 'wsloop'].every((w) => whys.includes(w)), whys);
  const sendSnap = json.snaps.find((s) => s.why === 'send');
  check('보내기 실패 상황: 화면 session, 세션 sh1, 받은 크기, 연결, 부팅 판단', sendSnap && sendSnap.view === 'session' && sendSnap.sess === 'sh1' && sendSnap.bytes && sendSnap.conn && sendSnap.boot && sendSnap.boot.why === 'fast', sendSnap);
  check('부팅 판단 까닭에 fast', json.boots.why.fast >= 1, json.boots);
  const all = JSON.stringify(call('remote.log', { limit: 400, tele: true }));
  check('기록에 보낸 글(echo p352)이 없다', !all.includes('echo p352'));
  // CLI 출력 그림
  const pw2 = await import('playwright');
  const b2 = await pw2.chromium.launch({ headless: true, executablePath: CHROME });
  try {
    const p2 = await b2.newPage({ viewport: { width: 1100, height: 900 } });
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    await p2.setContent(`<pre style="font:13px/1.45 Consolas,'Malgun Gothic',monospace;background:#111;color:#ddd;padding:16px;margin:0;white-space:pre-wrap">$ atrium remote errors --since ${mins}m\n${esc(text)}</pre>`);
    await p2.screenshot({ path: path.join(OUT, '04-cli-remote-errors.png'), fullPage: true });
    log('그림 04-cli-remote-errors.png');
  } finally { await b2.close(); }
}

async function stop() {
  try { const s = sess('sh1'); if (s) log(atrium('kill', 'sh1', '--yes')); } catch (e) { log(`kill: ${e.message.slice(0, 200)}`); }
  try { log(atrium('terminal', 'stop', '--yes')); } catch (e) { log(`terminal stop: ${e.message.slice(0, 200)}`); }
  try { log(atrium('backend', 'stop')); } catch (e) { log(`backend stop: ${e.message.slice(0, 200)}`); }
}

try {
  if (WHAT === 'setup') await setup();
  else if (WHAT === 'phone') await phone();
  else if (WHAT === 'stop') await stop();
} catch (e) { check(`${WHAT} 오류`, false, e.stack || e.message); }
fs.writeFileSync(path.join(OUT, `results-${WHAT}.json`), JSON.stringify(results, null, 2));
const bad = results.filter((r) => !r.ok);
log(`${results.length - bad.length}/${results.length} 통과`);
process.exitCode = bad.length ? 1 : 0;
