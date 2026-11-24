// P357 창 시험: 할 일 카드의 종류 꼬리표(PC 할 일 목록, 세션 맵 미니 창, 캔버스 알약, 휴대폰 홈·세션 화면), 결정 카드 알림을 눌러 카드로 가기,
// 터미널에서 답함 줄(다시 열기). 따로 띄운 개발용 판(atrium-dev-p357, 48102)만 쓴다. 휴대폰·노트북 흉내 프록시 48202. 실제 대화는 쓰지 않는다.
// 판: 셸 둘(lead, ops)이 atrium ask·todo로 결정·확인·실행·나중에 카드를 남긴다. 자동 카드·폭주 카드·터미널에서 답함 줄은 페이지 안 흉내(decision.changed, phone.cards).
// 실행: node app/test/e2e/p357-todo.mjs <setup|shots|stop>
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const WHAT = process.argv[2] || 'setup';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const DEV = path.join(REPO, 'backend', '.dev');
const OUT = path.join(REPO, 'experiments', 'p357', 'shots');
const CONVOS = 'C:\\Workspace\\mtask-p357-projects';
const F = 'C:\\Workspace\\mtask-p357-a';
const BOARD = 'atrium-dev-p357', PORT = '48102', SIM = 48202;
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_|HC_|MT_HERDR)/.test(k)) delete process.env[k];
for (const k of Object.keys(process.env)) if (/^(CLAUDECODE|CLAUDE_CODE_|CLAUDE_EFFORT|CLAUDE_PID|CLAUDE_AGENT_SDK|ELECTRON_RUN_AS_NODE)/.test(k)) delete process.env[k];
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
const L = await import('./p59-lib.mjs');
const { NAME, LOGIN, LAPTOP_A } = L;
const ENV = {
  ATRIUM_TERMINAL_SESSION: BOARD, ATRIUM_HERDR_SESSION: BOARD, ATRIUM_PORT: PORT,
  ATRIUM_DATA_DIR: path.join(DEV, 'data'), ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  ATRIUM_CLAUDE_PROJECTS: CONVOS, ATRIUM_CLAUDE_DESKTOP: 'none', ATRIUM_TEST_PREFIX: 'p357-none-',
  ATRIUM_TAILSCALE: path.join(REPO, 'app', 'test', 'e2e', 'p49-fake-tailscale.mjs'), P49_FAKE_TS_PORT: PORT,
  ATRIUM_WEB_HOSTS: NAME + ':' + SIM + ',localhost:' + SIM,
};
Object.assign(process.env, ENV);
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(CONVOS, { recursive: true });
const { logger, sleep, until } = await import('./harness.mjs');
const { assertTestBoard } = await import('./p9-guard.mjs');
assertTestBoard(ENV, { root: DEV });
const pwDir = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright');
const chromeExe = (() => { try { return fs.readdirSync(pwDir).filter((x) => /^chromium-\d+$/.test(x)).sort().reverse().map((x) => path.join(pwDir, x, 'chrome-win64', 'chrome.exe')).find((f) => fs.existsSync(f)); } catch { return null; } })();
const log = logger('p357-' + WHAT);
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
  fs.mkdirSync(F, { recursive: true }); fs.writeFileSync(path.join(F, 'README.md'), '# mtask-p357-a\n');
  call('workspace.open', { path: F, select: true });
  call('settings.set', { key: 'language', value: 'ko' });
  const have = new Set(list().map((x) => x.name));
  for (const name of ['lead', 'ops']) if (!have.has(name)) { call('session.spawn', { cwd: F, kind: 'shell', name }); await sleep(600); }
  await until(() => list().filter((x) => x.kind === 'shell' && x.state !== 'starting').length >= 2, 90000, 2000).catch(() => log('셸 준비 기다림 넘김'));
  await sleep(2500);
  for (const n of ['lead', 'ops']) { try { atrium('input', n, 'cls\r'); } catch {} }
  const cards = call('decision.list').cards || [];
  log('판: 진짜 카드 ' + cards.length + '장(셸은 atrium ask를 쓸 수 없어 카드는 그림 단계에서 흉내로 넣는다)');
}

const toUrl = (p) => 'file:///' + p.replace(/\\/g, '/');
async function withSim(fn) {
  const { startTsSim } = await import(toUrl(path.join(REPO, 'backend', 'tools', 'ts-sim-proxy.mjs')));
  const sim = startTsSim({ listen: SIM, target: Number(PORT), name: NAME, login: LOGIN, keepOrigin: true }); sim.cfg.ip = LAPTOP_A;
  await sim.ready;
  try { return await fn(); } finally { sim.close && sim.close(); }
}
async function pair(pg) {
  await pg.goto('http://localhost:' + SIM + '/');
  await pg.waitForSelector('[data-role=pair]', { timeout: 30000 });
  await pg.fill('[data-field=pair-code]', call('device.code').code);
  await pg.click('[data-action=pair-submit]');
  await pg.waitForFunction(() => window.__mt && window.__mt.api && window.__mt.api.conn.phase === 'open', null, { timeout: 60000 });
  await sleep(1500);
}
const phoneCtx = { viewport: { width: 390, height: 844 }, screen: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: SAFARI, locale: 'ko-KR', reducedMotion: 'reduce' };
const pcCtx = { viewport: { width: 1500, height: 940 }, deviceScaleFactor: 1, locale: 'ko-KR', reducedMotion: 'reduce' };

// 흉내 카드: 진짜 카드 + 자동 카드(실행) + 폭주 카드 + 터미널에서 답함 한 줄
function fakeOf(real, ids) {
  const now = Date.now();
  const base = { options: [], why: null, cmds: [], deferred: false };
  real = [
    { ...base, id: 9010, sessionId: ids.lead, name: 'lead', question: 'P356 휴대폰 맵을 이대로 dev에 합칠까요?', options: ['합치기', '보류'], createdAt: now - 12 * 60000, kind: 'decide' },
    { ...base, id: 9011, sessionId: ids.lead, name: 'lead', question: '휴대폰에서 첫 화면이 뜨는지 확인', createdAt: now - 9 * 60000, kind: 'check' },
    { ...base, id: 9012, sessionId: ids.lead, name: 'lead', question: 'dev 빌드가 나오면 iPhone으로 열어 보기', createdAt: now - 30 * 60000, kind: 'later', cond: 'dev 빌드가 나오면', later: 'dev 빌드가 나오면', deferred: true },
    { ...base, id: 9013, sessionId: ids.ops, name: 'ops', question: '키 다시 만들기', cmds: ['secret-run set DEMO_KEY'], createdAt: now - 7 * 60000, kind: 'do' },
  ];
  const auto = { id: 9001, sessionId: ids.ops, name: 'ops', question: 'npm run build 다시 돌리기', options: [], why: null, createdAt: now - 4 * 60000, kind: 'do', auto: true, cmds: ['npm run build'], deferred: false };
  const guard = { id: 9002, sessionId: ids.ops, name: 'ops', question: 'guard', options: [], createdAt: now - 2 * 60000, kind: 'guard', guard: { kind: 'cpu', paused: false, cpu: 96, mem: 1200 }, deferred: false };
  const recent = [{ id: 9003, sessionId: ids.lead, name: 'lead', question: '이 방향(카드에 꼬리표)으로 갈까요?', options: ['예', '아니오'], createdAt: now - 40 * 60000, state: 'answered', via: 'terminal', answeredAt: now - 6 * 60000, kind: 'decide' }];
  return { cards: [...real, auto, guard], recent };
}

async function shots() {
  const pw = await import('playwright');
  const ids = Object.fromEntries(list().map((s) => [s.name, s.sessionId]));
  const real = call('decision.list').cards || [];
  const fake = fakeOf(real, ids);
  const realCards = fake.cards.filter((d) => d.id >= 9010);
  await withSim(async () => {
    const browser = await pw.chromium.launch({ headless: true, ...(chromeExe ? { executablePath: chromeExe } : {}) });
    try {
      // ---- PC(노트북 웹 = 창과 같은 화면) ----
      {
        const ctx = await browser.newContext(pcCtx);
        const p0 = await ctx.newPage(); await pair(p0); await p0.close();
        const pg = await ctx.newPage();
        const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
        await pg.goto('http://localhost:' + SIM + '/');
        await L.boardOpen(pg);
        await sleep(2000);
        await pg.evaluate((f) => window.__mt.api.emit('decision.changed', { cards: f.cards, held: {}, riding: {}, recent: f.recent }), fake);
        await sleep(600);
        await pg.screenshot({ path: path.join(OUT, 'pc-1-canvas.png') });
        await pg.click('[data-role=decisions]');
        await pg.waitForSelector('[data-role=decisions-list]');
        await pg.click('[data-action=later-toggle]').catch(() => {});
        await pg.click('[data-action=term-toggle]').catch(() => {});
        await sleep(500);
        const tags = await pg.$$eval('[data-role=decisions-list] [data-role=decision-kind]', (els) => els.map((e) => [e.dataset.kind, e.textContent]));
        check('PC 할 일 목록: 종류 꼬리표 글', tags.length >= 5 && tags.every(([, x]) => x && x.length), tags);
        const term = await pg.$$eval('[data-role=term-card]', (els) => els.map((e) => e.textContent));
        check('PC: 터미널에서 답함 줄과 다시 열기', term.length === 1 && term[0].includes('터미널에서 답함') && term[0].includes('다시 열기'), term);
        const listEl = await pg.$('[data-role=decisions-list]');
        await listEl.screenshot({ path: path.join(OUT, 'pc-2-todo-list.png') });
        await pg.keyboard.press('Escape');
        // 세션 맵 미니 창
        await pg.click('[data-role=sessions-pill]').catch(() => {});
        await sleep(1500);
        await pg.evaluate((f) => window.__mt.api.emit('decision.changed', { cards: f.cards, held: {}, riding: {}, recent: f.recent }), fake);
        await sleep(500);
        const badge = await pg.$('[data-role=map-todo][data-count]');
        if (badge) { await badge.click(); await pg.waitForSelector('[data-role=map-todo-pop]', { timeout: 5000 }).catch(() => {}); }
        await sleep(500);
        const pop = await pg.$('[data-role=map-todo-pop]');
        check('세션 맵 미니 창에 종류 꼬리표', !!pop && !!(await pop.$('[data-role=decision-kind]')));
        await pg.screenshot({ path: path.join(OUT, 'pc-3-map-pop.png') });
        check('PC 화면 오류 없음', !errs.length, errs);
        await ctx.close();
      }
      // ---- 휴대폰 ----
      {
        const ctx = await browser.newContext(phoneCtx);
        const p0 = await ctx.newPage(); await pair(p0); await p0.close();
        const pg = await ctx.newPage();
        const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
        await pg.goto('http://localhost:' + SIM + '/');
        await pg.waitForSelector('[data-role=mp-ready]', { state: 'attached', timeout: 60000 });
        await sleep(1500);
        const phoneCards = fake.cards.map((d) => ({ id: d.id, kind: d.kind, sessionId: d.sessionId, name: d.name, question: d.question, options: d.options || [], why: d.why || null, createdAt: d.createdAt, deferred: !!d.deferred, wakeAt: d.wakeAt || null, ...(d.auto ? { auto: true } : {}), ...(d.cond ? { cond: d.cond } : {}) }));
        await pg.evaluate((c) => window.__mt.api.emit('phone.cards', { cards: c }), phoneCards);
        await sleep(600);
        const kinds = await pg.$$eval('[data-role=mp-todo-kind]', (els) => els.map((e) => [e.dataset.k, e.textContent]));
        check('휴대폰 홈: 종류 꼬리표(PC와 같은 말)', kinds.some(([k, x]) => k === 'do' && x === '실행') && kinds.some(([k, x]) => k === 'guard' && x === '폭주') && !kinds.some(([, x]) => x === '할 일'), kinds);
        check('휴대폰 홈: 자동 표시', (await pg.$$('[data-role=mp-todo-auto]')).length === 1);
        await pg.screenshot({ path: path.join(OUT, 'phone-1-home.png'), fullPage: true });
        // 알림을 눌러 온 카드: 지금 목록의 결정 카드
        const decide = realCards.find((d) => d.kind === 'decide');
        await pg.evaluate((id) => window.__mtMobile.toCard(id), decide.id);
        await sleep(400);
        check('알림 누르기 → 그 카드 강조', await pg.$('[data-role=mp-todo][data-id="' + decide.id + '"][data-hot="1"]') != null);
        await pg.screenshot({ path: path.join(OUT, 'phone-2-push-to-card.png') });
        // 나중 카드
        const later = realCards.find((d) => d.deferred);
        if (later) {
          await pg.evaluate((id) => window.__mtMobile.toCard(id), later.id);
          await sleep(500);
          check('알림 누르기(나중 카드) → 나중 묶음을 펼쳐 그 카드', await pg.$('[data-role=mp-later] [data-role=mp-todo][data-id="' + later.id + '"][data-hot="1"]') != null);
          await pg.screenshot({ path: path.join(OUT, 'phone-3-later.png') });
        }
        // 이미 닫힌 카드
        await pg.evaluate(() => window.__mtMobile.toCard(424242));
        await sleep(400);
        const gone = await pg.$eval('[data-role=mp-card-gone]', (e) => e.textContent).catch(() => null);
        check('알림 누르기(닫힌 카드) → 한 줄', gone === '이미 답했거나 닫힌 카드입니다.', gone);
        await pg.evaluate(() => { const e = document.querySelector('[data-role=mp-card-gone]'); if (e) e.scrollIntoView({ block: 'center' }); });
        await pg.screenshot({ path: path.join(OUT, 'phone-4-gone.png') });
        // 세션 화면 위의 할 일
        await pg.evaluate((id) => window.__mtMobile.open(id), ids.lead);
        await pg.waitForSelector('[data-role=mp-session]');
        await pg.click('[data-action=mp-view-answer]').catch(() => {});
        await sleep(1200);
        const st = await pg.$$eval('[data-role=mp-session-todos] [data-role=mp-todo]', (els) => els.map((e) => e.dataset.kind));
        check('세션 화면: 그 세션의 열린 할 일 카드', st.includes('decide') && st.includes('check') && !st.includes('later'), st);
        await pg.click('[data-action=mp-view-answer]').catch(() => {});
        await sleep(600);
        await pg.screenshot({ path: path.join(OUT, 'phone-5-session.png') });
        // 터미널 보기: 기본은 작은 알약(터미널을 가리지 않는다), 누르면 겹친 작은 창
        await pg.click('[data-action=mp-view-term]');
        await pg.waitForSelector('[data-role=mp-termview]');
        await sleep(2500);
        check('터미널 보기: 할 일은 기본으로 알약만', (await pg.$('[data-action=mp-todos-show]')) != null && (await pg.$('[data-role=mp-term-todos]')) == null);
        await pg.screenshot({ path: path.join(OUT, 'phone-6-term-pill.png') });
        await pg.click('[data-action=mp-todos-show]');
        await sleep(500);
        const ov = await pg.$$eval('[data-role=mp-term-todos] [data-role=mp-todo-kind]', (els) => els.map((e) => e.textContent));
        check('터미널 보기: 누르면 겹친 할 일 창(꼬리표 포함)', ov.length === 2, ov);
        await pg.screenshot({ path: path.join(OUT, 'phone-7-term-overlay.png') });
        await pg.click('[data-action=mp-todos-hide]');
        await pg.click('[data-action=mp-view-answer]').catch(() => {});
        check('휴대폰 화면 오류 없음', !errs.length, errs);
        await ctx.close();
      }
    } finally { await browser.close(); }
  });
}

async function stopBoard() {
  try { for (const s of call('session.list')) atrium('kill', s.sessionId, '--yes', '--delete'); } catch (e) { log('kill ' + e.message.slice(0, 120)); }
  try { log(atrium('terminal', 'stop', '--yes').slice(0, 200)); } catch (e) { log('terminal stop ' + e.message.slice(0, 120)); }
  try { log(atrium('backend', 'stop').slice(0, 200)); } catch (e) { log('backend stop ' + e.message.slice(0, 120)); }
}

try {
  if (WHAT === 'setup') await setupBoard();
  else if (WHAT === 'shots') await shots();
  else if (WHAT === 'stop') await stopBoard();
} catch (e) {
  check('시험이 끝까지 돌았다', false, e.stack || e.message);
} finally {
  fs.writeFileSync(path.join(OUT, 'p357-' + WHAT + '.json'), JSON.stringify({ results }, null, 2));
  const bad = results.filter((r) => !r.ok);
  log('결과 ' + (results.length - bad.length) + '/' + results.length + ' 통과' + (bad.length ? ' 실패: ' + bad.map((b) => b.name).join(', ') : ''));
  process.exit(bad.length ? 1 : 0);
}
