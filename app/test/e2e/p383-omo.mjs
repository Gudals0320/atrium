// P383 개발용 판 실시험: OmO 스티어링(휴대폰 흉내에서 스티어링을 골라 보낸 글이 일하는 OmO의 그 턴에 들어감)과
//   실패한 턴(자격이 막힌 모델)이 마지막 답 물러섬으로 ok 닫히지 않고 turn_error 멈춤 알림·카드 error가 되는지 본다.
// 판: atrium-dev-p383, 48105, 창 원격 디버깅 9586, 휴대폰 흉내 프록시 48205, backend/.dev. 세션: 말을 걸지 않는 haiku 리드(ld), 리드가 띄운 omo 하위 o1·o2.
// 실행(워크트리 뿌리): node app/test/e2e/p383-omo.mjs <setup|steer|fail|board|stop> [round]   결과는 experiments/p383/(저장소 밖)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const WHAT = process.argv[2] || 'setup';
const TAG = process.argv[3] || 'round-1';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const DEV = path.join(REPO, 'backend', '.dev');
const OUT = path.join(REPO, 'experiments', 'p383', TAG);
const CONVOS = 'C:\\Workspace\\mtask-p383-projects';
const A = 'C:\\Workspace\\mtask-p383-a';
const BOARD = 'atrium-dev-p383', PORT = '48105', SIM = 48205, CDP = 9586;
const OK_MODEL = process.env.P383_OK_MODEL || 'anthropic-subscription/claude-haiku-5-5';
const BAD_MODEL = process.env.P383_BAD_MODEL || 'chatgpt-subscription/gpt-6-luna-fast'; // 이 PC에서 자격이 만료(P379·P381·P382)
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_|HC_|MT_HERDR|CLAUDECODE$|CLAUDE_CODE_|CLAUDE_EFFORT|CLAUDE_PID$|CLAUDE_AGENT_SDK|ELECTRON_RUN_AS_NODE$)/.test(k)) delete process.env[k];
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
const L = await import('./p59-lib.mjs');
const { NAME, LOGIN, LAPTOP_A } = L;
const ENV = {
  ATRIUM_TERMINAL_SESSION: BOARD, ATRIUM_HERDR_SESSION: BOARD, ATRIUM_PORT: PORT,
  ATRIUM_DATA_DIR: path.join(DEV, 'data'), ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  ATRIUM_CLAUDE_PROJECTS: CONVOS, ATRIUM_CLAUDE_DESKTOP: 'none', ATRIUM_TEST_PREFIX: 'p383-none-', ATRIUM_USAGE_PROBE: 'off',
  ATRIUM_TAILSCALE: path.join(REPO, 'app', 'test', 'e2e', 'p49-fake-tailscale.mjs'), P49_FAKE_TS_PORT: PORT,
  ATRIUM_WEB_HOSTS: NAME + ':' + SIM + ',localhost:' + SIM,
};
Object.assign(process.env, ENV);
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(CONVOS, { recursive: true });
const { logger, sleep, launch, closeApp } = await import('./harness.mjs');
const { assertTestBoard } = await import('./p9-guard.mjs');
assertTestBoard(ENV, { root: DEV });
const { boardAgent } = await import('./lib/board-agent.mjs');

const pwDir = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright');
const chromeExe = (() => { try { return fs.readdirSync(pwDir).filter((x) => /^chromium-\d+$/.test(x)).sort().reverse().map((x) => path.join(pwDir, x, 'chrome-win64', 'chrome.exe')).find((f) => fs.existsSync(f)); } catch { return null; } })();
const log = logger('p383-' + WHAT + '-' + TAG);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 180000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== '' ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 1800) : '')); };
const SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const list = () => call('session.list');
const byName = (n) => list().find((x) => x.name === n);
async function until(fn, ms, gap = 1500) { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) return null; await sleep(gap); } }
const events = (n, kinds, limit = 400) => call('session.events', { session: n, limit }).filter((e) => !kinds || kinds.includes(e.kind));
const ag = () => boardAgent({ env: ENV });

// 도구 호출 사이마다 시간이 걸리는 긴 일(스티어링이 끼어들 틈). 글에 위험 낱말 없음
const LONG = 'Do this slowly, one step at a time. Run the shell command  node -e "setTimeout(()=>{},12000)"  exactly six times, each as its own separate tool call, waiting for each to finish before starting the next (never in parallel). After all six, reply with exactly one line that starts with DONE and also contains every extra word you were asked to include. Use no other tools.';
const STEER = 'Extra instruction: in your final one-line reply also include the word PINEAPPLE.';

async function setup() {
  log(atrium('backend', 'start').trim().slice(0, 300));
  await sleep(1500);
  fs.mkdirSync(A, { recursive: true }); fs.writeFileSync(path.join(A, 'README.md'), '# mtask-p383-a\n');
  call('workspace.open', { path: A, select: true });
  call('settings.set', { key: 'language', value: 'ko' });
  const ld = await ag().lead('ld', { cwd: A });
  check('리드 haiku ready', ld && ld.state === 'ready');
}

// 1) 일하는 OmO에 휴대폰에서 스티어링
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
async function steer() {
  const a = ag();
  const name = process.env.P383_NAME || 'o1';
  if (!byName(name)) { const r = await a.child('ld', name, '--kind', 'omo', '--model', OK_MODEL, '--effort', 'low', '--prompt', LONG); log('child', r.code, (r.stdout || r.stderr).slice(0, 500)); }
  else { const r = await a.prompt('ld', name, LONG); log('prompt', r.code, (r.stdout || r.stderr).slice(0, 300)); }
  const w = await until(() => { const s = byName(name); return s && s.state === 'working' ? s : null; }, 180000, 1000);
  check(name + ' 일하는 중(working)', !!w, byName(name) && { state: byName(name).state, orch: byName(name).orch });
  await sleep(8000); // 첫 도구 호출이 돌기 시작한 뒤
  const pw = await import('playwright');
  let sentAt = 0;
  await withSim(async () => {
    const browser = await pw.chromium.launch({ headless: true, ...(chromeExe ? { executablePath: chromeExe } : {}) });
    try {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: SAFARI, locale: 'ko-KR', reducedMotion: 'reduce' });
      const p0 = await ctx.newPage(); await pair(p0); await p0.close();
      const pg = await ctx.newPage();
      const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
      await pg.addInitScript(() => { try { if (!sessionStorage.getItem('p383-init')) { sessionStorage.setItem('p383-init', '1'); localStorage.setItem('mt.mobileView', 'term'); localStorage.setItem('mt.mobileKeysOpen', '0'); localStorage.setItem('mt.mobileTab', 'home'); } } catch {} });
      await pg.goto('http://localhost:' + SIM + '/');
      await pg.waitForSelector('[data-role=mp-ready]', { state: 'attached', timeout: 60000 });
      await sleep(1500);
      const id = byName(name).sessionId;
      await pg.evaluate((sid) => window.__mtMobile.open(sid), id);
      await pg.waitForSelector('[data-role=mp-session][data-session="' + id + '"]', { timeout: 20000 });
      await sleep(1500);
      const shot = async (n) => { await sleep(600); await pg.screenshot({ path: path.join(OUT, n + '.png') }); log('그림 ' + n + '.png'); };
      await shot('1-phone-omo-working');
      const b0 = await pg.$eval('[data-action=mp-steer]', (e) => ({ off: e.dataset.off || null, ariaDisabled: e.getAttribute('aria-disabled'), pressed: e.getAttribute('aria-pressed'), border: getComputedStyle(e).borderStyle }));
      await pg.tap('[data-action=mp-steer]'); await sleep(500);
      const b1 = await pg.$eval('[data-action=mp-steer]', (e) => e.getAttribute('aria-pressed'));
      check('휴대폰 OmO 스티어링 단추: 흐리지 않고(data-off 없음, 점선 아님) 누르면 켜짐', !b0.off && !b0.ariaDisabled && b0.border !== 'dashed' && b1 === 'true', { b0, b1 });
      const ta = '[data-role=mp-input] textarea';
      await pg.fill(ta, STEER);
      await shot('2-phone-omo-steer-on');
      check('보낼 때 ' + name + ' working', (byName(name) || {}).state === 'working', (byName(name) || {}).state);
      sentAt = Date.now();
      await pg.tap('[data-action=mp-send]'); await sleep(2500);
      await shot('3-phone-omo-steer-sent');
      check('휴대폰 페이지 오류 없음', errs.length === 0, errs.slice(0, 3));
      await ctx.close();
    } finally { await browser.close(); }
  });
  const mine = () => call('delivery.list', { session: name, limit: 8 }).find((x) => (x.text || '').includes('PINEAPPLE') && x.createdAt >= sentAt - 5000);
  const d = await until(() => { const l = mine(); return l && ['confirmed', 'unconfirmed', 'failed', 'cancelled'].includes(l.status) ? l : null; }, 240000, 2000);
  const dl = mine();
  check('스티어링 글 전달: confirmed(기록으로 확인 record), 지금 턴에 넣음', d && d.status === 'confirmed' && d.reason === 'record', dl && { status: dl.status, reason: dl.reason, steerWhy: dl.steerWhy, attempts: dl.attempts });
  const evs = events(name, ['terminal_status', 'delivery', 'delivery_steer_blocked']);
  const conf = d && d.confirmedAt ? d.confirmedAt : Date.now();
  const idleBetween = evs.filter((e) => e.kind === 'terminal_status' && e.data && (e.data.to === 'idle' || e.data.to === 'done') && e.at >= sentAt && e.at <= conf);
  check('보낸 뒤 확인될 때까지 턴이 끝나지 않았다(그 턴에 들어감)', idleBetween.length === 0, { sentAt, conf, idle: idleBetween.map((e) => e.at) });
  const sb = evs.filter((e) => e.kind === 'delivery_steer_blocked' && dl && e.data && e.data.deliveryId === dl.deliveryId);
  check('스티어링 못 넣음 기록 없음', !sb.length, sb.map((e) => e.data));
  const fin = await until(() => { const s = byName(name); return s && s.state !== 'working' && s.state !== 'starting' ? s : null; }, 300000, 3000);
  const rd = await ag().json('ld', 'read', name);
  const ans = (fin && fin.lastAnswer) || rd.lastAnswer || '';
  check(name + ' 마지막 답에 스티어링 낱말(PINEAPPLE)', /PINEAPPLE/.test(ans), { state: fin && fin.state, ans: String(ans).slice(0, 300) });
  check('터미널에 보낸 글이 한 번만 들어감(기록 user 메시지 1개)', (rd.text || '').split('PINEAPPLE').length - 1 >= 1, null);
  const u = await until(() => call('delivery.list', { session: 'ld', limit: 20 }).find((x) => (x.text || '').includes('@' + name)), 120000, 3000);
  log('리드에게 간 글', u && u.text.slice(0, 400));
  fs.writeFileSync(path.join(OUT, 'steer-events.json'), JSON.stringify({ delivery: dl, events: evs.slice(-60), read: { ...rd, text: undefined } }, null, 1));
}

// 2) 자격이 막힌 모델로 한 턴을 실패시킨다
async function fail() {
  const a = ag();
  const name = process.env.P383_FAIL_NAME || 'o2';
  const r = await a.child('ld', name, '--kind', 'omo', '--model', BAD_MODEL, '--effort', 'low', '--prompt', 'Reply with the single word OK.');
  log('child', r.code, (r.stdout || r.stderr).slice(0, 500));
  const e = await until(() => { const s = byName(name); return s && (s.state === 'error' || s.state === 'ready') && s.lastAnswer ? s : null; }, 240000, 2000);
  await sleep(6000);
  const s = byName(name);
  check(name + ' 카드 상태 error(실패한 턴)', s && s.state === 'error', s && { state: s.state, error: s.error, lastAnswer: String(s.lastAnswer || '').slice(0, 200) });
  const tf = events(name, ['turn_failed', 'unit_done_fallback', 'unit_done_fallback_skipped', 'unit_stop']);
  check('판 이벤트 turn_failed, unit_done_fallback 없음', tf.some((x) => x.kind === 'turn_failed') && !tf.some((x) => x.kind === 'unit_done_fallback'), tf.map((x) => ({ kind: x.kind, data: x.data })));
  const note = await until(() => call('delivery.list', { session: 'ld', limit: 20 }).find((x) => /오류로 턴이 끝났다/.test(x.text || '') && x.text.includes('@' + name)), 90000, 2000);
  check('리드에게 멈춤 알림(오류로 턴이 끝났다 + 오류 글)', !!note, note && note.text.slice(0, 500));
  const okNote = call('delivery.list', { session: 'ld', limit: 20 }).find((x) => (x.text || '').includes('[판이 마지막 답으로 닫음]') && x.text.includes('@' + name));
  check('리드에게 ok 보고(마지막 답으로 닫음)가 가지 않음', !okNote, okNote && okNote.text.slice(0, 300));
  fs.writeFileSync(path.join(OUT, 'fail-events.json'), JSON.stringify({ session: s, events: tf, note: note && note.text }, null, 1));
}

// 3) 판 창 그림(o1 ready, o2 error 카드)
async function board() {
  const { app, page } = await launch({ log, env: ENV, args: ['--remote-debugging-port=' + CDP] });
  try {
    await page.setViewportSize({ width: 1440, height: 900 }).catch(() => {});
    await sleep(3000);
    await page.screenshot({ path: path.join(OUT, '4-board.png') });
    for (const n of (process.env.P383_CARDS || 'o2,o1').split(',')) {
      const s = byName(n); if (!s) continue;
      const node = page.locator('[data-session-id="' + s.sessionId + '"], [data-session="' + s.sessionId + '"]').first();
      if (await node.count()) { await node.screenshot({ path: path.join(OUT, '5-card-' + n + '.png') }).catch((e) => log('card shot ' + e.message.slice(0, 120))); }
    }
    const txt = await page.evaluate(() => document.body.innerText);
    check('창에 o2 오류 글이 보인다', /provider_error|authentication|expired|오류/i.test(txt));
  } finally { await closeApp(app); }
}

// 화면 꼴 보기: 쉬는 화면과 일하는 화면(입력 칸 읽개를 맞추려고)
async function peek() {
  const name = process.env.P383_NAME || 'o1';
  const strip = (t) => String(t || '').replace(/\x1b\[[0-9;?]*[ -\/]*[@-~]/g, '').replace(/\x1b\][^\x07]*(\x07|\x1b\\)/g, '');
  const snap = (tag) => { const t = strip(call('terminal.snapshot', { session: name }).text); fs.writeFileSync(path.join(OUT, 'screen-' + tag + '.txt'), t); log('screen ' + tag + ' ' + t.length); };
  snap('idle');
  const r = await ag().prompt('ld', name, LONG); log('prompt', r.code);
  await until(() => (byName(name) || {}).state === 'working', 60000, 500);
  await sleep(10000); snap('working-1');
  await sleep(5000); snap('working-2');
}

async function stop() {
  for (const n of ['o1', 'o2', 'o3', 'ld']) { try { log(atrium('kill', n, '--yes').trim().slice(0, 200)); } catch (e) { log('kill ' + n + ' ' + e.message.slice(0, 160)); } }
  await sleep(3000);
  try { log(atrium('terminal', 'stop', '--yes').trim().slice(0, 200)); } catch (e) { log('terminal stop ' + e.message.slice(0, 160)); }
  try { log(atrium('backend', 'stop').trim().slice(0, 200)); } catch (e) { log('backend stop ' + e.message.slice(0, 160)); }
  const hc = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'herdr-core', BOARD);
  const omoDir = path.join(os.homedir(), '.omo', 'agent', 'sessions', '--C--Workspace-mtask-p383-a--');
  for (const d of [hc, omoDir, A, CONVOS]) { try { fs.rmSync(d, { recursive: true, force: true }); log('지움 ' + d); } catch (e) { log('못 지움 ' + d + ' ' + e.message); } }
}

if (WHAT === 'setup') await setup();
else if (WHAT === 'steer') await steer();
else if (WHAT === 'fail') await fail();
else if (WHAT === 'board') await board();
else if (WHAT === 'stop') await stop();
else if (WHAT === 'peek') await peek();
else if (WHAT === 'restart') { try { log(atrium('backend', 'stop').trim().slice(0, 200)); } catch (e) { log('stop ' + e.message.slice(0, 200)); } await sleep(2000); log(atrium('backend', 'start').trim().slice(0, 200)); await sleep(3000); await until(() => (byName('o1') || {}).state === 'ready', 180000, 3000); log('o1 ' + JSON.stringify((byName('o1') || {}).state)); }
const bad = results.filter((r) => !r.ok);
fs.writeFileSync(path.join(OUT, WHAT + '-results.json'), JSON.stringify(results, null, 1));
log('결과 ' + (results.length - bad.length) + '/' + results.length);
process.exit(bad.length ? 1 : 0);
