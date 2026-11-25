// P366 창·판 시험: API 크레딧 장부를 걷은 뒤. 따로 띄운 개발용 판(atrium-dev-p366, 48109, 창 원격 디버깅 9590)만 쓴다.
// 실행: node app/test/e2e/p366-sdk-key.mjs <seed|setup|shots|stop>
// - seed: 판을 띄웠다 끄고 옛 장부 흔적(meta apiCredits, 열린 판 카드 board, auth-relay/admin.bin)을 넣은 뒤 다시 띄워 한 번 지워지는지 본다
// - setup: 시험용 가짜 SDK 키(sk-test-…)와 SDK 세션 sdk1(띄우기만, 글 없음). 그 세션의 요청 기록은 중계기 기록 파일에 흉내 줄로 넣는다
// - shots: 설정 › 런처의 SDK 키 자리, 사용량 팝업(크레딧 칸 없음), SDK 노드·세션 맵 카드의 금액 칩
// 진짜 API를 부르지 않는다: 위쪽은 아무도 듣지 않는 127.0.0.1 포트이고, 키는 가짜다
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const WHAT = process.argv[2] || 'setup';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const DEV = path.join(REPO, 'backend', '.dev');
const OUT = path.join(REPO, 'experiments', 'p366', 'shots');
const CONVOS = 'C:\\Workspace\\mtask-p366-projects';
const F = 'C:\\Workspace\\mtask-p366-a';
const BOARD = 'atrium-dev-p366', PORT = '48109', DEBUG = 9590, UP = 48399;
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_|HC_|MT_HERDR)/.test(k)) delete process.env[k];
for (const k of Object.keys(process.env)) if (/^(CLAUDECODE|CLAUDE_CODE_|CLAUDE_EFFORT|CLAUDE_PID|CLAUDE_AGENT_SDK|ELECTRON_RUN_AS_NODE|ANTHROPIC_)/.test(k)) delete process.env[k];
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
const ENV = {
  ATRIUM_TERMINAL_SESSION: BOARD, ATRIUM_HERDR_SESSION: BOARD, ATRIUM_PORT: PORT,
  ATRIUM_DATA_DIR: path.join(DEV, 'data'), ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  ATRIUM_CLAUDE_PROJECTS: CONVOS, ATRIUM_CLAUDE_DESKTOP: 'none', ATRIUM_TEST_PREFIX: 'p366-none-',
  ATRIUM_AUTH_RELAY_UPSTREAM: `http://127.0.0.1:${UP}`, // 아무도 듣지 않는다(글을 보내지 않으므로 쓰이지 않는다)
  ATRIUM_USAGE_PROBE: 'off', // 시험 판이 사용자 구독·잔액을 직접 묻지 않게
};
Object.assign(process.env, ENV);
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(CONVOS, { recursive: true });
const { logger, sleep, launch, closeApp } = await import('./harness.mjs');
const { assertTestBoard } = await import('./p9-guard.mjs');
assertTestBoard(ENV, { root: DEV });
const log = logger('p366-' + WHAT);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 120000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== '' ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 1600)) : '')); };
const list = () => call('session.list');
const byName = (n) => list().find((x) => x.name === n);
const RELAY = path.join(ENV.ATRIUM_DATA_DIR, 'auth-relay');
const REQS = path.join(RELAY, 'requests.jsonl');
const DB = path.join(ENV.ATRIUM_DATA_DIR, 'board.db');

async function seed() {
  log(atrium('backend', 'start').trim().slice(0, 300));
  await sleep(1500);
  log(atrium('backend', 'stop').trim().slice(0, 200));
  await sleep(1500);
  const { Store } = await import(pathToFileURL(path.join(REPO, 'backend', 'src', 'store.mjs')).href);
  const st = new Store(DB);
  st.setMeta('apiCredits', { ledger: { pastedAt: Date.now(), grants: [{ id: 'g1', name: 'API credit (Ultra)', kind: 'plan', remaining: 1, total: 2 }] }, alerted: {}, official: null });
  const card = st.addDecision({ sessionId: 'board', name: 'Atrium', question: 'API credit (Ultra) $1.00 expires 11/27 09:00', options: [], createdAt: Date.now(), kind: 'later' });
  st.close();
  fs.mkdirSync(RELAY, { recursive: true }); fs.writeFileSync(path.join(RELAY, 'admin.bin'), 'not-a-real-ciphertext');
  log(atrium('backend', 'start').trim().slice(0, 300));
  await sleep(2000);
  const st2 = new Store(DB);
  const meta = st2.getMeta('apiCredits'); const c = st2.getDecision(card.id);
  st2.close();
  check('옛 장부 흔적을 뜰 때 한 번 지움: meta apiCredits, admin.bin, 판 카드 닫힘', meta == null && !fs.existsSync(path.join(RELAY, 'admin.bin')) && c && c.state === 'closed', { meta, admin: fs.existsSync(path.join(RELAY, 'admin.bin')), card: c && c.state });
  const logs = (() => { try { return fs.readFileSync(path.join(ENV.ATRIUM_DATA_DIR, 'logs', 'backend.log'), 'utf8'); } catch { return ''; } })();
  check('판 로그에 지운 것 한 줄', /api credit ledger removed: meta=true adminKey=true cards=1/.test(logs));
  const u = call('usage.get');
  check('usage.get에 apiCredits 없음, sdkCosts 있음', !('apiCredits' in u) && u.sdkCosts && typeof u.sdkCosts.sessions === 'object', Object.keys(u));
  let gone = 0; for (const m of ['credits.get', 'relay.setAdminKey']) { try { call(m, {}); } catch { gone++; } }
  check('장부 처리기(credits.get, relay.setAdminKey)가 없다', gone === 2);
}

async function setup() {
  fs.mkdirSync(F, { recursive: true }); fs.writeFileSync(path.join(F, 'README.md'), '# mtask-p366-a\n');
  call('workspace.open', { path: F, select: true });
  call('settings.set', { key: 'language', value: 'ko' });
  const r = call('relay.setKey', { key: 'sk-test-' + crypto.randomBytes(20).toString('hex') });
  check('시험용 가짜 SDK 키 넣기: 답에 값이 없고 Admin 키 칸도 없다', r.keyPresent === true && !JSON.stringify(r).includes('sk-test-') && !JSON.stringify(call('relay.status')).includes('adminKey'), r);
  if (!byName('sdk1')) call('session.spawn', { cwd: F, launcher: 'claude-sdk', name: 'sdk1', model: 'claude-sonnet-5-5' });
  const s = byName('sdk1');
  check('SDK 세션 sdk1(글 없음), 띄우기 답에 creditWarning 없음', s && s.billing === 'sdk', s && { billing: s.billing, state: s.state });
  // 중계기 기록 흉내: sdk1이 sonnet 5.5로 6번(캐시 포함)
  const now = Date.now();
  const lines = [];
  for (let i = 0; i < 6; i++) lines.push({ at: now - (6 - i) * 150, method: 'POST', path: '/v1/messages?beta=true', session: s.sessionId, ep: 'sdk-cli', status: 200, model: 'claude-sonnet-5-5', in: 1200, out: 18000, cacheW: 60000, cacheR: 450000, ms: 9000 });
  fs.mkdirSync(RELAY, { recursive: true });
  fs.appendFileSync(REQS, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  const u = call('usage.get');
  check('usage.get의 sdkCosts에 sdk1 금액(추정)', u.sdkCosts.sessions[s.sessionId] > 0, u.sdkCosts);
}

async function shots() {
  const sid = byName('sdk1').sessionId;
  const want = call('usage.get').sdkCosts.sessions[sid];
  const usdOf = (v) => `$${v.toFixed(2)}`;
  const { app, page } = await launch({ log, env: { ...ENV }, args: [`--remote-debugging-port=${DEBUG}`] });
  try {
    await sleep(2500);
    // 1) 설정 › 런처: SDK 키 칸이 "Claude Code SDK" 런처 줄 바로 아래
    if (!(await page.$('[data-role="settings"]'))) await page.click('[data-role="top-right"] [data-action="settings-open"]');
    await page.waitForSelector('[data-role="settings-tabs"]', { timeout: 8000 });
    await page.click('[data-role="settings-tabs"] [data-tab="launchers"]').catch(() => {});
    await page.waitForSelector('[data-role=api-key-panel]', { timeout: 8000 });
    const place = await page.$eval('[data-role=api-key-panel]', (e) => { const prev = e.previousElementSibling; return { under: e.dataset.under, prevSdk: !!(prev && prev.querySelector('[data-role=sdk-tag]')), prevName: prev ? prev.dataset.name : null, title: (e.querySelector('.mt-apikey-title') || {}).textContent, note: (e.querySelector('.mt-apikey-note') || {}).textContent, state: (e.querySelector('[data-role=api-key-state]') || {}).textContent, n: document.querySelectorAll('[data-role=api-key-panel]').length, credits: !!document.querySelector('[data-role=credits-panel]') }; });
    check('SDK 키 칸: SDK 런처 줄 바로 아래 하나, 제목 "SDK 키", 설명 한두 줄, 크레딧 칸 없음', place.under === '1' && place.prevSdk && place.n === 1 && place.title === 'SDK 키' && /월 API 크레딧/.test(place.note) && !place.credits, place);
    const rows = await page.$('[data-role=launchers-list]');
    await page.$eval('[data-role=api-key-panel]', (e) => e.scrollIntoView({ block: 'center' }));
    await sleep(400);
    await (rows || page).screenshot({ path: path.join(OUT, '1-settings-launchers-sdk-key.png') });
    await page.keyboard.press('Escape'); await sleep(600);
    if (await page.$('[data-role="settings"]')) { await page.click('[data-role="top-right"] [data-action="settings-open"]').catch(() => {}); await sleep(500); }
    // 2) 사용량 팝업: 크레딧 칸 없음
    await page.click('[data-role=usage]');
    await page.waitForSelector('[data-role=usage-list]', { timeout: 8000 });
    await sleep(800);
    const pop = await page.$eval('[data-role=usage-list]', (e) => ({ credits: !!e.querySelector('[data-role=api-credits]'), text: e.textContent }));
    check('사용량 팝업에 API 크레딧 칸 없음', !pop.credits && !/API 크레딧/.test(pop.text), pop.text.slice(0, 300));
    await (await page.$('[data-role=usage-list]')).screenshot({ path: path.join(OUT, '2-usage-popup.png') });
    await page.keyboard.press('Escape'); await sleep(500);
    // 3) SDK 노드 금액 칩
    await page.evaluate((id) => { const st = window.__mt; if (st && st.focusSession) st.focusSession(id); }, sid).catch(() => {});
    await sleep(1500);
    const node = await page.$(`[data-session="${sid}"]`);
    const cost = await page.$eval(`[data-session="${sid}"] [data-role=sdk-cost]`, (e) => ({ text: e.textContent, title: e.title })).catch(() => null);
    check('SDK 노드 금액 칩 = usage.get sdkCosts, 툴팁에 가격표 날짜', cost && cost.text === usdOf(want) && /\d{4}-\d{2}-\d{2}/.test(cost.title), { cost, want });
    if (node) await node.screenshot({ path: path.join(OUT, '3-sdk-node-cost.png') });
    // 4) 세션 맵 카드 금액 칩
    await page.click('[data-role=sessions-pill]').catch(() => {});
    await sleep(2000);
    const mapCost = await page.$$eval('[data-role=ta-meta] [data-role=sdk-cost]', (els) => els.map((e) => e.textContent));
    check('세션 맵 카드에 SDK 금액 칩', mapCost.includes(usdOf(want)), mapCost);
    await page.screenshot({ path: path.join(OUT, '4-session-map-cost.png') });
    await page.keyboard.press('Escape'); await sleep(600);
    // 키 값이 판 폴더·로그에 평문으로 없는가
    const hits = [];
    const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (fs.statSync(p).size < 30 * 1024 * 1024 && fs.readFileSync(p).includes('sk-test-')) hits.push(path.relative(ENV.ATRIUM_DATA_DIR, p)); } };
    walk(ENV.ATRIUM_DATA_DIR);
    check('판 데이터 폴더(기록·로그·board.db)에 키 평문 없음', hits.length === 0, hits);
  } finally { await closeApp(app); }
}

async function stop() {
  for (const s of list()) { try { atrium('kill', s.name, '--yes'); } catch {} }
  await sleep(2000);
  try { log(atrium('terminal', 'stop', '--yes').trim().slice(0, 200)); } catch (e) { log('terminal stop: ' + e.message.slice(0, 200)); }
  try { log(atrium('backend', 'stop').trim().slice(0, 200)); } catch (e) { log('backend stop: ' + e.message.slice(0, 200)); }
}

const run = { seed, setup, shots, stop }[WHAT];
if (!run) { log('모르는 단계: ' + WHAT); process.exit(2); }
try { await run(); } catch (e) { log('ERROR ' + (e.stack || e.message).slice(0, 2000)); process.exitCode = 1; }
const failed = results.filter((r) => !r.ok);
log(`${WHAT}: ${results.length - failed.length}/${results.length} PASS`);
fs.appendFileSync(path.join(OUT, '..', 'results.jsonl'), results.map((r) => JSON.stringify({ step: WHAT, ...r })).join('\n') + (results.length ? '\n' : ''));
process.exit(process.exitCode || (failed.length ? 1 : 0));
