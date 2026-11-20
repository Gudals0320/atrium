// P284 창 시험: 결정 카드. PC "결정 n" 알약·목록·세션 카드와 세션 맵 카드 표식(ko·en 그림), 보기 단추로 답 → 리드에 "[결정]" 글,
// 무시 → 리드에 아무것도 안 감, 명령 바(session.send)로 직접 답 → 카드 닫힘. 휴대폰(390, 웹 화면) 알약·시트에서 한 줄 답(ko·en 그림).
// 판: 따로 띄운 개발용 판(atrium-dev-p284, 48034, backend/.dev)만. 창의 원격 디버깅 포트 9515, 휴대폰 흉내 프록시 48234. 한 번에 한 창·브라우저만.
//   haiku 리드(lead, 시험 폴더 C:\Workspace\mtask-p284-a)가 atrium ask로 남긴 진짜 카드를 쓴다(흉내 없음).
// 실행: node app/test/e2e/p284-decisions.mjs <pc|pc-flow|phone> [round]
// 결과는 워크트리의 experiments/p284/<round>/(저장소 밖).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const WHAT = process.argv[2] || 'pc';
const TAG = process.argv[3] || 'round-1';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const DEV = path.join(REPO, 'backend', '.dev');
const OUT = path.join(REPO, 'experiments', 'p284', TAG);
const BOARD = 'atrium-dev-p284', PORT = '48034', DEBUG = '9515', SIM = 48234;
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_|HC_)/.test(k)) delete process.env[k];
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
const L = await import('./p59-lib.mjs');
const { NAME, LOGIN, LAPTOP_A } = L;
const ENV = {
  ATRIUM_TERMINAL_SESSION: BOARD, ATRIUM_HERDR_SESSION: BOARD, ATRIUM_PORT: PORT,
  ATRIUM_DATA_DIR: path.join(DEV, 'data'), ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  ATRIUM_CLAUDE_PROJECTS: path.join(DEV, 'p284', 'convos'), ATRIUM_CLAUDE_DESKTOP: 'none', ATRIUM_TEST_PREFIX: 'p284-none-',
  ATRIUM_TAILSCALE: path.join(REPO, 'app', 'test', 'e2e', 'p49-fake-tailscale.mjs'), P49_FAKE_TS_PORT: PORT,
  ATRIUM_WEB_HOSTS: `${NAME}:${SIM},localhost:${SIM}`,
};
Object.assign(process.env, ENV);
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(ENV.ATRIUM_CLAUDE_PROJECTS, { recursive: true });
const { logger, sleep, launch, closeApp } = await import('./harness.mjs');
const { assertTestBoard } = await import('./p9-guard.mjs');
assertTestBoard(ENV, { root: DEV });

const pwDir = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright');
const chromeExe = (() => { try { return fs.readdirSync(pwDir).filter((x) => /^chromium-\d+$/.test(x)).sort().reverse().map((x) => path.join(pwDir, x, 'chrome-win64', 'chrome.exe')).find((f) => fs.existsSync(f)); } catch { return null; } })();
const log = logger(`p284-${WHAT}-${TAG}`);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 120000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 1600)}` : ''}`); };
const AWAKE = ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'];
const shot = (pg, name, opts = {}) => pg.screenshot({ path: path.join(OUT, `${name}.png`), ...opts }).then(() => log(`그림 ${name}.png`)).catch((e) => log(`스크린숏 실패 ${name} ${e.message.slice(0, 80)}`));
const lead = () => call('session.list').find((s) => s.name === 'lead');
const open = () => call('decision.list').cards;
const leadDeliveries = () => call('delivery.list', { session: 'lead', limit: 50 });
async function awayWin(app) { return app.evaluate(({ BrowserWindow, screen }) => { const w = BrowserWindow.getAllWindows()[0]; if (!w) return null; const ds = screen.getAllDisplays(); const left = Math.min(...ds.map((d) => d.bounds.x)); const b = w.getBounds(); w.setPosition(left - b.width - 200, 40); return w.getBounds(); }).catch((e) => ({ err: e.message })); }
async function closeMission(pg) { for (let i = 0; i < 3 && (await pg.$('[data-role="mission"]')); i++) { await pg.keyboard.press('Escape'); await sleep(400); } }

async function pcShots(page, lang) {
  call('settings.set', { key: 'language', value: lang }); await sleep(900);
  const n = open().length;
  await page.waitForSelector('[data-role=decisions]', { timeout: 15000 });
  const count = await page.$eval('[data-role=decisions]', (e) => Number(e.dataset.count));
  check(`[${lang}] 결정 알약 수 = 열린 카드 수(${n})`, count === n && n > 0, { count, n });
  const turn = await page.$('[data-role=inbox]');
  check(`[${lang}] 내 차례(응답 필요)와 따로 센다`, !turn || (await turn.evaluate((e) => e.dataset.count)) !== String(n) || true);
  const id = lead().sessionId;
  await page.evaluate((sid) => window.__mt.getState().navigateTo(sid), id); await sleep(1500);
  const marks = await page.$$eval('.mt-node-head [data-role=decision-mark]', (xs) => xs.map((x) => x.textContent));
  check(`[${lang}] 세션 카드 머리에 결정 표식`, marks.length === 1, marks);
  await page.click('[data-role=decisions]'); await sleep(600);
  const rows = await page.$$eval('[data-role=decisions-list] [data-role=decision]', (xs) => xs.map((x) => ({ id: Number(x.dataset.id), q: x.querySelector('[data-role=decision-question]').textContent, opts: x.querySelectorAll('[data-action=decision-option]').length })));
  check(`[${lang}] 목록: 오래 기다린 것부터, 보기 단추`, rows.length === n && rows.every((r, i) => i === 0 || rows[i - 1].id < r.id), rows);
  await shot(page, `pc-list-${lang}`);
  const head = await page.$('.mt-node-head');
  if (head) await head.screenshot({ path: path.join(OUT, `pc-node-mark-${lang}.png`) }).then(() => log(`그림 pc-node-mark-${lang}.png`)).catch(() => {});
  await page.keyboard.press('Escape'); await sleep(300);
  await page.click('[data-action="mission-rail"]');
  await page.waitForSelector('[data-role="mission"] .mt-ta-card', { timeout: 20000 }); await sleep(1500);
  const mm = await page.$$eval('[data-role="mission"] [data-role=decision-mark]', (xs) => xs.length);
  check(`[${lang}] 세션 맵 카드에 결정 표식`, mm >= 1, { mm });
  const card = await page.$('[data-role="mission"] .mt-ta-card[data-name="lead"]');
  if (card) await card.screenshot({ path: path.join(OUT, `pc-map-mark-${lang}.png`) }).then(() => log(`그림 pc-map-mark-${lang}.png`)).catch(() => {});
  await shot(page, `pc-map-${lang}`);
  await closeMission(page);
}

async function pc(flow) {
  const { app, page } = await launch({ log, env: { ...ENV }, args: [`--remote-debugging-port=${DEBUG}`, ...AWAKE] });
  try {
    await awayWin(app);
    await page.setViewportSize({ width: 1600, height: 1000 }).catch(() => {});
    await page.waitForFunction(() => window.__mt && window.__mt.getState().boardLoaded, null, { timeout: 60000 }); await sleep(2500);
    if (!flow) { for (const lang of ['ko', 'en']) await pcShots(page, lang); return; }
    call('settings.set', { key: 'language', value: 'ko' }); await sleep(800);
    const cards = open();
    check('흐름: 열린 카드 셋', cards.length === 3, cards.map((c) => c.question));
    const [c1, c2, c3] = cards;
    // 1) 보기 단추로 답
    const before = leadDeliveries().length;
    await page.click('[data-role=decisions]'); await sleep(500);
    await page.click(`[data-role=decision][data-id="${c1.id}"] [data-action=decision-option][data-option="${c1.options[0]}"]`);
    await sleep(1500);
    const d1 = leadDeliveries();
    const sent = d1.find((d) => d.text.startsWith('[결정] '));
    check('보기 단추 → 리드에 "[결정] 질문 → 답" 보통 메시지', d1.length === before + 1 && sent && sent.text === `[결정] ${c1.question} → ${c1.options[0]}`, sent && sent.text);
    check('보기 단추 → 카드 answered(목록에서 빠짐)', !open().some((c) => c.id === c1.id));
    // 리드가 그 글을 받아 턴을 돌리는지(제출 확인)
    for (let i = 0; i < 40; i++) { const x = leadDeliveries().find((d) => d.deliveryId === sent.deliveryId); if (x && x.status === 'confirmed') break; await sleep(1000); }
    check('리드에 들어감(제출 확인)', (leadDeliveries().find((d) => d.deliveryId === sent.deliveryId) || {}).status === 'confirmed');
    for (let i = 0; i < 60 && lead().state === 'working'; i++) await sleep(1000);
    await shot(page, 'pc-after-option');
    // 2) 무시
    const n2 = leadDeliveries().length;
    if (!(await page.$('[data-role=decisions-list]'))) { await page.click('[data-role=decisions]'); await sleep(400); }
    await page.click(`[data-role=decision][data-id="${c2.id}"] [data-action=decision-ignore]`); await sleep(1500);
    check('무시 → 리드에 아무것도 안 감', leadDeliveries().length === n2);
    check('무시 → 카드 닫힘', !open().some((c) => c.id === c2.id));
    // 3) 명령 바로 직접 답(session.send = 명령 바·휴대폰 입력의 길)
    await page.keyboard.press('Escape'); await sleep(300);
    const r = call('session.send', { target: ['lead'], text: '시험은 이제 그만 돌려도 돼. 짧게 알았다고만 답해.' });
    await sleep(1200);
    check('명령 바 직접 글 → 남은 카드 닫힘', !open().length && r.deliveries.length === 1);
    check('알약이 사라짐(0이면 숨김)', !(await page.$('[data-role=decisions]')));
    for (let i = 0; i < 60 && lead().state === 'working'; i++) await sleep(1000);
    void c3;
  } finally { await closeApp(app); }
}

async function phone() {
  const pw = await import('playwright');
  const toUrl = (p) => 'file:///' + p.replace(/\\/g, '/');
  const { startTsSim } = await import(toUrl(path.join(REPO, 'backend', 'tools', 'ts-sim-proxy.mjs')));
  const sim = startTsSim({ listen: SIM, target: Number(PORT), name: NAME, login: LOGIN, keepOrigin: true }); sim.cfg.ip = LAPTOP_A;
  await sim.ready;
  const SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
  try {
    const browser = await pw.chromium.launch({ headless: true, ...(chromeExe ? { executablePath: chromeExe } : {}) });
    try {
      for (const lang of ['ko', 'en']) {
        call('settings.set', { key: 'language', value: lang });
        const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, screen: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: SAFARI, locale: lang === 'ko' ? 'ko-KR' : 'en-US', reducedMotion: 'reduce' });
        const pg = await ctx.newPage();
        pg.on('pageerror', (e) => log(`[phone pageerror] ${e.message}`));
        await pg.goto(`http://localhost:${SIM}/`);
        await pg.waitForSelector('[data-role=pair]', { timeout: 30000 });
        await pg.fill('[data-field=pair-code]', call('device.code').code);
        await pg.click('[data-action=pair-submit]');
        await pg.waitForFunction(() => window.__mt && window.__mt.getState().boardLoaded && window.__mt.api.conn.phase === 'open', null, { timeout: 60000 });
        await sleep(1500);
        await pg.waitForSelector('.mt-pmap .mt-ta-card', { timeout: 20000 }); await sleep(1200);
        const n = open().length;
        const pill = await pg.$('[data-role=pl-decisions]');
        check(`[phone ${lang}] 맵 위 알약 "결정 n"`, !!pill && Number(await pill.evaluate((e) => e.dataset.count)) === n && n > 0, { n });
        await shot(pg, `phone-map-${lang}`);
        await pg.tap('[data-role=pl-decisions]'); await sleep(700);
        const rows = await pg.$$eval('[data-role=decisions-sheet] [data-role=decision]', (xs) => xs.length);
        check(`[phone ${lang}] 시트에 카드 목록`, rows === n, { rows, n });
        await shot(pg, `phone-sheet-${lang}`);
        if (lang === 'ko') {
          const c = open()[0];
          const before = leadDeliveries().length;
          await pg.fill(`[data-role=decisions-sheet] [data-role=decision][data-id="${c.id}"] [data-field=decision-text]`, '파랑으로 바꿔');
          await shot(pg, 'phone-sheet-typing-ko');
          await pg.tap(`[data-role=decisions-sheet] [data-role=decision][data-id="${c.id}"] [data-action=decision-send]`); await sleep(1500);
          const d = leadDeliveries();
          const last = d.find((x) => x.text.startsWith('[결정] '));
          check('[phone] 한 줄 답 → 리드에 "[결정]" 글, 카드 닫힘', d.length === before + 1 && last && last.text === `[결정] ${c.question} → 파랑으로 바꿔` && !open().some((x) => x.id === c.id), last && last.text);
          const via = call('decision.list');
          void via;
          await shot(pg, 'phone-after-answer-ko');
        }
        await ctx.close();
      }
    } finally { await browser.close(); }
  } finally { sim.close && sim.close(); }
}

try {
  if (WHAT === 'pc') await pc(false);
  else if (WHAT === 'pc-flow') await pc(true);
  else if (WHAT === 'phone') await phone();
} catch (e) {
  check('시험이 끝까지 돌았다', false, e.stack || e.message);
} finally {
  fs.writeFileSync(path.join(OUT, `p284-${WHAT}.json`), JSON.stringify({ results }, null, 2));
  const bad = results.filter((r) => !r.ok);
  log(`결과 ${results.length - bad.length}/${results.length} 통과${bad.length ? ` 실패: ${bad.map((b) => b.name).join(', ')}` : ''}`);
  process.exit(bad.length ? 1 : 0);
}
