// P361 창·판 시험: API 크레딧 장부. 따로 띄운 개발용 판(atrium-dev-p361, 48106, 창 원격 디버깅 9587)만 쓴다.
// 실행: node app/test/e2e/p361-credits.mjs <setup|shots|warn|phone|stop>
// - 진짜 API를 부르지 않는다: 위쪽은 가짜 서버(p361-fake-up.mjs, 127.0.0.1:48296), API 키·Admin 키는 시험용 가짜 값(sk-test-…)이다.
//   SDK 세션 sdk1은 띄우기만 하고 글을 보내지 않는다(프로세스 없음). 그 세션의 요청 기록은 중계기 기록 파일에 흉내 줄로 넣는다.
// - 붙여 넣기 글은 결제 페이지의 꼴로 지은 것이다(만료는 지금 + 2일·+32일, 실제 조직 정보가 아니다)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';

const WHAT = process.argv[2] || 'setup';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const DEV = path.join(REPO, 'backend', '.dev');
const OUT = path.join(REPO, 'experiments', 'p361', 'shots');
const CONVOS = 'C:\\Workspace\\mtask-p361-projects';
const F = 'C:\\Workspace\\mtask-p361-a';
const BOARD = 'atrium-dev-p361', PORT = '48106', DEBUG = 9587, UP = 48296, SIM = 48206;
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_|HC_|MT_HERDR)/.test(k)) delete process.env[k];
for (const k of Object.keys(process.env)) if (/^(CLAUDECODE|CLAUDE_CODE_|CLAUDE_EFFORT|CLAUDE_PID|CLAUDE_AGENT_SDK|ELECTRON_RUN_AS_NODE|ANTHROPIC_)/.test(k)) delete process.env[k];
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
const L = await import('./p59-lib.mjs');
const { NAME, LOGIN, LAPTOP_A } = L;
const ENV = {
  ATRIUM_TERMINAL_SESSION: BOARD, ATRIUM_HERDR_SESSION: BOARD, ATRIUM_PORT: PORT,
  ATRIUM_DATA_DIR: path.join(DEV, 'data'), ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  ATRIUM_CLAUDE_PROJECTS: CONVOS, ATRIUM_CLAUDE_DESKTOP: 'none', ATRIUM_TEST_PREFIX: 'p361-none-',
  ATRIUM_AUTH_RELAY_UPSTREAM: `http://127.0.0.1:${UP}`,
  ATRIUM_USAGE_PROBE: 'off', // 시험 판이 사용자 구독·잔액을 직접 묻지 않게
  ATRIUM_TAILSCALE: path.join(REPO, 'app', 'test', 'e2e', 'p49-fake-tailscale.mjs'), P49_FAKE_TS_PORT: PORT,
  ATRIUM_WEB_HOSTS: NAME + ':' + SIM + ',localhost:' + SIM,
};
Object.assign(process.env, ENV);
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(CONVOS, { recursive: true });
const { logger, sleep, until, launch, closeApp } = await import('./harness.mjs');
const { assertTestBoard } = await import('./p9-guard.mjs');
assertTestBoard(ENV, { root: DEV });
const log = logger('p361-' + WHAT);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 120000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== '' ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 1600)) : '')); };
const list = () => call('session.list');
const byName = (n) => list().find((x) => x.name === n);
const save = (name, v) => fs.writeFileSync(path.join(OUT, name), typeof v === 'string' ? v : JSON.stringify(v, null, 2));
const PIDFILE = path.join(DEV, 'p361-fake-up.pid');
const REQS = path.join(ENV.ATRIUM_DATA_DIR, 'auth-relay', 'requests.jsonl');

// 결제 페이지 꼴의 시험 글(한국어). 만료·부여는 지금 기준
const ko = (t, time = true) => { const d = new Date(t + 9 * 3600000); return `${d.getUTCFullYear()}년 ${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일${time ? ' 오전 9:00 GMT+9' : ''}`; };
const at9 = (days) => { const d = new Date(Date.now() + days * 86400000 + 9 * 3600000); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0); }; // 그날 09:00 KST
function samplePage() {
  const now = Date.now();
  const targets = 'Agent SDK, API, 배치 API, Playground, 관리형 에이전트';
  return ['결제', '크레딧 잔액', '-US$4.33', '미납 잔액', '프로모션 크레딧 US$327.11 사용 가능', '자동 충전', '꺼짐', '',
    '프로모션 크레딧', '이름\t잔액 / 총액\t적용 대상\t만료일\t부여 날짜',
    `API credit (Ultra)\tUS$127.11 / US$130.33\t${targets}\t${ko(at9(2))}\t${ko(now - 31 * 86400000, false)}`,
    `API credit (Ultra)\tUS$200.00 / US$200.00\t${targets}\t${ko(at9(32))}\t${ko(now - 86400000, false)}`,
    '청구서 내역', '날짜\t유형\t상태\t비용', `${ko(now - 86400000, false)}\tAPI credit (Ultra) (US$200.00)\t${ko(at9(32), false)} 만료 예정\tUS$0.00`].join('\n');
}

async function setup() {
  if (!fs.existsSync(PIDFILE)) {
    const p = spawn(process.execPath, [path.join(REPO, 'app', 'test', 'e2e', 'p361-fake-up.mjs'), String(UP), '90'], { detached: true, stdio: 'ignore', windowsHide: true });
    p.unref(); fs.writeFileSync(PIDFILE, String(p.pid)); log('fake upstream pid ' + p.pid);
  }
  log(atrium('backend', 'start').trim().slice(0, 300));
  await sleep(1500);
  fs.mkdirSync(F, { recursive: true }); fs.writeFileSync(path.join(F, 'README.md'), '# mtask-p361-a\n');
  call('workspace.open', { path: F, select: true });
  call('settings.set', { key: 'language', value: 'ko' });
  const r = call('relay.setKey', { key: 'sk-test-' + crypto.randomBytes(20).toString('hex') });
  check('시험용 가짜 API 키(위쪽은 가짜 서버)', r.keyPresent === true && !JSON.stringify(r).includes('sk-test-'), r);
  if (!byName('sdk1')) call('session.spawn', { cwd: F, launcher: 'claude-sdk', name: 'sdk1', model: 'claude-sonnet-5-5' });
  const s = byName('sdk1');
  check('SDK 세션 sdk1(글 없음, 프로세스 없음)', s && s.billing === 'sdk', s && { billing: s.billing, state: s.state });
  if (!byName('sh1')) call('session.spawn', { cwd: F, kind: 'shell', name: 'sh1' });
  const v = call('credits.get');
  check('처음: 장부 없음, 추정', v.ledger === false && v.basis === 'estimate', { ledger: v.ledger, basis: v.basis });
}

// 중계기 기록 흉내: sdk1이 지금 sonnet 5.5로 몇 번 부름(캐시 포함) → 추정 금액
function fakeRelay(sid) {
  const now = Date.now();
  const lines = [];
  for (let i = 0; i < 6; i++) lines.push({ at: now - (6 - i) * 150, method: 'POST', path: '/v1/messages?beta=true', session: sid, ep: 'sdk-cli', status: 200, model: 'claude-sonnet-5-5', in: 1200, out: 18000, cacheW: 60000, cacheR: 450000, ms: 9000 });
  fs.mkdirSync(path.dirname(REQS), { recursive: true });
  fs.appendFileSync(REQS, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  return lines.length;
}

async function shots() {
  const sid = byName('sdk1').sessionId;
  if (call('relay.status').adminKeyPresent) call('relay.removeAdminKey'); // 처음은 추정
  const { app, page } = await launch({ log, env: { ...ENV }, args: [`--remote-debugging-port=${DEBUG}`] });
  try {
    await page.setViewportSize?.({ width: 1500, height: 940 }).catch(() => {});
    await sleep(2500);
    // 1·2) 설정 › 런처: 붙여 넣기 → 읽기(미리 보기) → 저장
    if (!(await page.$('[data-role="settings"]'))) await page.click('[data-role="top-right"] [data-action="settings-open"]');
    await page.waitForSelector('[data-role="settings-tabs"]', { timeout: 8000 });
    await page.click('[data-role="settings-tabs"] [data-tab="launchers"]').catch(() => {});
    await page.waitForSelector('[data-role=credits-panel]', { timeout: 8000 });
    await page.fill('[data-role=credits-paste]', samplePage());
    await page.click('[data-role=credits-read]');
    await page.waitForSelector('[data-role=credits-preview]', { timeout: 8000 });
    await page.$eval('[data-role=credits-panel]', (e) => e.scrollIntoView({ block: 'start' }));
    const pv = await page.$$eval('[data-role=credits-preview-grant]', (els) => els.map((e) => e.textContent));
    check('미리 보기: 지급 둘(이름·잔액/총액·적용 대상·만료·부여), 구매 -$4.33 미납', pv.length === 2 && /\$127\.11 \/ \$130\.33/.test(pv[0]) && /\$200\.00/.test(pv[1]) && /미납/.test(await page.$eval('[data-role=credits-preview-purchased]', (e) => e.textContent)), pv);
    check('미리 보기는 아직 저장하지 않았다', call('credits.get').ledger === false);
    await (await page.$('[data-role=credits-panel]')).screenshot({ path: path.join(OUT, '1-settings-preview.png') });
    await page.click('[data-role=credits-save]');
    await page.waitForSelector('[data-role=credits-ledger-row]', { timeout: 8000 });
    await sleep(800);
    const v1 = call('credits.get');
    check('저장: 장부(지급 둘, 요금제 Ultra $200 결제일 추정, 다음 지급)', v1.ledger && v1.grants.length === 2 && v1.plan && v1.plan.amount === 200 && v1.nextGrant, { plan: v1.plan, next: v1.nextGrant });
    await (await page.$('[data-role=credits-panel]')).screenshot({ path: path.join(OUT, '2-settings-ledger.png') });
    await page.keyboard.press('Escape'); await sleep(600);
    if (await page.$('[data-role="settings"]')) { await page.click('[data-role="top-right"] [data-action="settings-open"]').catch(() => {}); await sleep(500); }
    // 붙여 넣은 뒤 sdk1이 쓴 양(중계기 기록 흉내) → 장부가 다시 알리도록 구매 잔액을 같은 값으로 다시 넣는다
    const n = fakeRelay(sid);
    call('credits.purchased', { balance: -4.33 });
    await sleep(1500);
    const v2 = call('credits.get');
    check(`붙여 넣은 뒤 쓴 양(흉내 ${n}번): 먼저 만료되는 월 크레딧에서 뺀다, 세션 금액(추정)`, v2.grants[0].spent > 0 && v2.grants[1].spent === 0 && v2.sessions[sid] > 0 && v2.basis === 'estimate', { spent: v2.grants.map((g) => g.spent), sdk1: v2.sessions[sid], totals: v2.totals });
    // 3) 사용량 팝업: API 크레딧 칸(추정)
    await page.click('[data-role=usage]');
    await page.waitForSelector('[data-role=api-credits]', { timeout: 8000 });
    await sleep(600);
    const pop = await page.$eval('[data-role=api-credits]', (e) => ({ grants: e.querySelectorAll('[data-role=credits-grant]').length, soon: e.querySelectorAll('[data-soon="1"]').length, basis: e.dataset.basis, text: e.textContent }));
    check('사용량 팝업: 합계·지급 줄 둘(곧 만료 하나)·다음 지급·오늘/이번 달·추정', pop.grants === 2 && pop.soon === 1 && pop.basis === 'estimate' && /다음 지급/.test(pop.text) && /오늘/.test(pop.text) && /이번 달/.test(pop.text), { ...pop, text: pop.text.slice(0, 400) });
    await (await page.$('[data-role=usage-list]')).screenshot({ path: path.join(OUT, '3-usage-popup-estimate.png') });
    await page.$eval('[data-role=api-credits]', (e) => e.scrollIntoView({ block: 'end' })); await sleep(300);
    await (await page.$('[data-role=api-credits]')).screenshot({ path: path.join(OUT, '3b-usage-credits-estimate.png') });
    await page.keyboard.press('Escape'); await sleep(500);
    // 4) 할 일: 만료 알림 "나중에" 카드
    const cards = call('decision.list').cards.filter((c) => c.sessionId === 'board');
    check('만료 3일 안 지급 하나 → 판 "나중에" 카드 한 장', cards.length === 1 && cards[0].kind === 'later' && /API credit \(Ultra\) \$127\.11이 \d+\/\d+ 09:00에 만료/.test(cards[0].question), cards.map((c) => c.question));
    const alerts = await page.evaluate(() => (window.__mtCreditAlerts || []).length).catch(() => null);
    void alerts;
    await page.click('[data-role=decisions]').catch(() => {});
    await sleep(800);
    await page.click('[data-action=later-toggle]').catch(() => {});
    await sleep(600);
    const later = await page.$$eval('[data-role=later-card]', (els) => els.map((e) => e.textContent));
    check('할 일 목록의 나중에 줄에 만료 카드(보드)', later.some((x) => /만료/.test(x) && /보드/.test(x)), later.map((x) => x.slice(0, 160)));
    const dd = await page.$('.mt-dropdown');
    await (dd || page).screenshot({ path: path.join(OUT, '4-todo-later-card.png') });
    await page.keyboard.press('Escape'); await sleep(500);
    // 5) SDK 노드의 금액, 6) 세션 맵 카드의 금액
    await page.evaluate((id) => { const st = window.__mt; if (st && st.focusSession) st.focusSession(id); }, sid).catch(() => {});
    await sleep(1500);
    const node = await page.$(`[data-session="${sid}"]`);
    const cost = await page.$eval(`[data-session="${sid}"] [data-role=sdk-cost]`, (e) => e.textContent).catch(() => null);
    check('SDK 노드에 그 세션이 쓴 금액(추정)', !!cost && /^\$\d/.test(cost), cost);
    if (node) await node.screenshot({ path: path.join(OUT, '5-sdk-node-cost.png') });
    await page.click('[data-role=sessions-pill]').catch(() => {});
    await sleep(2000);
    const mapCost = await page.$$eval('[data-role=ta-meta] [data-role=sdk-cost]', (els) => els.map((e) => e.textContent));
    check('세션 맵 카드에 SDK 금액', mapCost.length >= 1, mapCost);
    await page.screenshot({ path: path.join(OUT, '6-session-map-cost.png') });
    await page.keyboard.press('Escape'); await sleep(800);
    // 7) Admin 키(가짜) → 공식 비용(가짜 위쪽) → 팝업 "공식"
    const ar = call('relay.setAdminKey', { key: 'sk-test-admin-' + crypto.randomBytes(20).toString('hex') });
    check('Admin 키 넣기: 답에 값이 없다', ar.adminKeyPresent === true && !JSON.stringify(ar).includes('sk-test-admin-'), ar);
    await until(() => call('credits.get').basis === 'official', 30000, 1500).catch(() => {});
    const v3 = call('credits.get');
    check('공식 비용(1시간 칸) → 공식 표시, 반영 시각', v3.basis === 'official' && v3.basisAt && !v3.officialError, { basis: v3.basis, basisAt: v3.basisAt, err: v3.officialError, spend: v3.spend });
    await page.click('[data-role=usage]');
    await page.waitForSelector('[data-role=api-credits][data-basis=official]', { timeout: 10000 }).catch(() => {});
    await sleep(600);
    await page.$eval('[data-role=api-credits]', (e) => e.scrollIntoView({ block: 'end' })); await sleep(300);
    await (await page.$('[data-role=api-credits]')).screenshot({ path: path.join(OUT, '7-usage-credits-official.png') });
    await page.keyboard.press('Escape'); await sleep(400);
    // 8) atrium usage
    const txt = atrium('usage');
    save('8-atrium-usage.txt', txt);
    check('atrium usage에 API 크레딧 줄(합계, 지급마다 한 줄, 다음 지급, 지출, 공식)', /API 크레딧\(/.test(txt) && (txt.match(/API credit \(Ultra\)\[월\]/g) || []).length === 2 && /다음 지급 예정/.test(txt) && /지출 오늘/.test(txt) && /공식/.test(txt), txt.split('\n').filter((l) => /크레딧|credit|지급|지출/.test(l)).join(' | ').slice(0, 900));
    // 키 값이 판 폴더·로그에 평문으로 없는가
    const hits = [];
    const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (fs.statSync(p).size < 30 * 1024 * 1024) { const b = fs.readFileSync(p); if (b.includes('sk-test-admin-') || b.includes('sk-test-')) hits.push(path.relative(ENV.ATRIUM_DATA_DIR, p)); } } };
    walk(ENV.ATRIUM_DATA_DIR);
    check('판 데이터 폴더(기록·로그·board.db)에 키 평문 없음', hits.length === 0, hits);
  } finally { await closeApp(app); }
}

// SDK 세션을 띄우기 전 바닥 경고: 지급을 모두 지우고 구매 잔액 -4.33 → session.spawn 답의 creditWarning, credits.alert
async function warn() {
  const v = call('credits.get');
  const keep = v.grants.map((g) => ({ name: g.name, total: g.total, remaining: g.remaining, expiresAt: g.expiresAt, grantedOn: g.grantedOn, appliesTo: g.appliesTo }));
  for (const g of v.grants) call('credits.grant', { op: 'remove', id: g.id });
  const r = call('session.spawn', { cwd: F, launcher: 'claude-sdk', name: 'sdk2' });
  check('바닥이면 SDK 세션을 띄우며 경고(creditWarning)', r.creditWarning && /바닥/.test(r.creditWarning.text), r.creditWarning);
  try { atrium('kill', 'sdk2', '--yes'); } catch {}
  for (const g of keep) call('credits.grant', { op: 'add', grant: g });
  check('지급을 되돌림', call('credits.get').grants.length === keep.length);
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
const SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
async function phone() {
  const pw = await import('playwright');
  const pwDir = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright');
  const chromeExe = (() => { try { return fs.readdirSync(pwDir).filter((x) => /^chromium-\d+$/.test(x)).sort().reverse().map((x) => path.join(pwDir, x, 'chrome-win64', 'chrome.exe')).find((f) => fs.existsSync(f)); } catch { return null; } })();
  const { startTsSim } = await import(toUrl(path.join(REPO, 'backend', 'tools', 'ts-sim-proxy.mjs')));
  const sim = startTsSim({ listen: SIM, target: Number(PORT), name: NAME, login: LOGIN, keepOrigin: true }); sim.cfg.ip = LAPTOP_A;
  await sim.ready;
  const browser = await pw.chromium.launch({ headless: true, ...(chromeExe ? { executablePath: chromeExe } : {}) });
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: SAFARI, locale: 'ko-KR', reducedMotion: 'reduce' });
    const p0 = await ctx.newPage(); await pair(p0); await p0.close();
    const pg = await ctx.newPage();
    await pg.addInitScript(() => { try { localStorage.setItem('mt.mobileTab', 'home'); } catch {} });
    await pg.goto('http://localhost:' + SIM + '/');
    await pg.waitForSelector('[data-role=mp-ready]', { state: 'attached', timeout: 60000 });
    await pg.waitForSelector('[data-role=mp-credits]', { timeout: 20000 });
    await pg.click('[data-action=mp-credits-toggle]');
    await sleep(800);
    const x = await pg.$eval('[data-role=mp-credits]', (e) => ({ basis: e.dataset.basis, rows: e.querySelectorAll('[data-role=mp-credits-grant]').length, usable: (e.querySelector('[data-role=mp-credits-usable]') || {}).textContent, text: e.textContent }));
    check('휴대폰 홈: API 크레딧 합계와 지급 줄', x.rows === 2 && /^\$\d/.test(x.usable || ''), { ...x, text: x.text.slice(0, 300) });
    await pg.$eval('[data-role=mp-credits]', (e) => e.scrollIntoView({ block: 'center' }));
    await sleep(500);
    await pg.screenshot({ path: path.join(OUT, '9-phone-home-credits.png') });
  } finally { await browser.close().catch(() => {}); sim.close && sim.close(); }
}

async function stop() {
  for (const s of list()) { try { atrium('kill', s.name, '--yes'); } catch {} }
  await sleep(2000);
  try { log(atrium('terminal', 'stop', '--yes').trim().slice(0, 200)); } catch (e) { log('terminal stop: ' + e.message.slice(0, 200)); }
  try { log(atrium('backend', 'stop').trim().slice(0, 200)); } catch (e) { log('backend stop: ' + e.message.slice(0, 200)); }
  try { const pid = Number(fs.readFileSync(PIDFILE, 'utf8')); if (pid) { try { process.kill(pid); log('fake upstream stopped ' + pid); } catch (e) { log('fake upstream: ' + e.code); } } fs.rmSync(PIDFILE, { force: true }); } catch {}
}

const run = { setup, shots, warn, phone, stop }[WHAT];
if (!run) { log('모르는 단계: ' + WHAT); process.exit(2); }
try { await run(); } catch (e) { log('ERROR ' + (e.stack || e.message).slice(0, 2000)); process.exitCode = 1; }
const failed = results.filter((r) => !r.ok);
log(`${WHAT}: ${results.length - failed.length}/${results.length} PASS`);
fs.appendFileSync(path.join(OUT, '..', 'results.jsonl'), results.map((r) => JSON.stringify({ step: WHAT, ...r })).join('\n') + (results.length ? '\n' : ''));
process.exit(process.exitCode || (failed.length ? 1 : 0));
