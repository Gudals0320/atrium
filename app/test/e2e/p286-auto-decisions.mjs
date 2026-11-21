// P286 창 시험: 자동 결정 카드와 답 모아 보내기. PC "결정" 목록의 "자동" 표시·모은 답 줄(지금 보내기)·자동 카드 세션 표식(ko·en 그림),
// 휴대폰(390, 웹 화면) 시트의 같은 표시(ko·en 그림), 흐름: 리드의 열린 카드 둘에 모두 답하면 전달 하나.
// 판: 따로 띄운 개발용 판(atrium-dev-p286, 48036, backend/.dev)만. 창의 원격 디버깅 포트 9517, 휴대폰 흉내 프록시 48236. 한 번에 한 창·브라우저만.
//   haiku 리드(lead: atrium ask로 남긴 손 카드 둘 중 하나에 답해 둠, lead2: 묻는 글로 끝나 자동 카드)를 쓴다.
// 실행: node app/test/e2e/p286-auto-decisions.mjs <pc|phone|batch> [round]
// 결과는 워크트리의 experiments/p286/<round>/(저장소 밖).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const WHAT = process.argv[2] || 'pc';
const TAG = process.argv[3] || 'round-1';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const DEV = path.join(REPO, 'backend', '.dev');
const OUT = path.join(REPO, 'experiments', 'p286', TAG);
const BOARD = 'atrium-dev-p286', PORT = '48036', DEBUG = '9517', SIM = 48236;
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_|HC_)/.test(k)) delete process.env[k];
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
const L = await import('./p59-lib.mjs');
const { NAME, LOGIN, LAPTOP_A } = L;
const ENV = {
  ATRIUM_TERMINAL_SESSION: BOARD, ATRIUM_HERDR_SESSION: BOARD, ATRIUM_PORT: PORT,
  ATRIUM_DATA_DIR: path.join(DEV, 'data'), ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  ATRIUM_CLAUDE_PROJECTS: path.join(DEV, 'p286', 'convos'), ATRIUM_CLAUDE_DESKTOP: 'none', ATRIUM_TEST_PREFIX: 'p284-none-',
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
const log = logger(`p286-${WHAT}-${TAG}`);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 120000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 1600)}` : ''}`); };
const AWAKE = ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'];
const shot = (pg, name, opts = {}) => pg.screenshot({ path: path.join(OUT, `${name}.png`), ...opts }).then(() => log(`그림 ${name}.png`)).catch((e) => log(`스크린숏 실패 ${name} ${e.message.slice(0, 80)}`));
const lead = () => call('session.list').find((s) => s.name === 'lead');
const open = () => call('decision.list').cards;
const leadDeliveries = () => call('delivery.list', { session: 'lead', limit: 50 });
const held = () => call('decision.list').held || {};
async function awayWin(app) { return app.evaluate(({ BrowserWindow, screen }) => { const w = BrowserWindow.getAllWindows()[0]; if (!w) return null; const ds = screen.getAllDisplays(); const left = Math.min(...ds.map((d) => d.bounds.x)); const b = w.getBounds(); w.setPosition(left - b.width - 200, 40); return w.getBounds(); }).catch((e) => ({ err: e.message })); }
async function closeMission(pg) { for (let i = 0; i < 3 && (await pg.$('[data-role="mission"]')); i++) { await pg.keyboard.press('Escape'); await sleep(400); } }


// PC: 리드(lead)의 손 카드 둘 중 하나에 답해 모은 답 줄을 만들고, lead2의 자동 카드와 함께 ko·en 그림
async function pcShots(page, lang) {
  call('settings.set', { key: 'language', value: lang }); await sleep(900);
  const n = open().length;
  await page.waitForSelector('[data-role=decisions]', { timeout: 15000 });
  await page.click('[data-role=decisions]'); await sleep(700);
  const autos = await page.$$eval('[data-role=decisions-list] [data-role=decision-auto]', (xs) => xs.map((x) => x.textContent));
  check(`[${lang}] 목록에 자동 표시(작게)`, autos.length >= 1 && autos.length < n, { autos, n });
  const hl = await page.$$eval('[data-role=decisions-list] [data-role=decision-held]', (xs) => xs.map((x) => ({ n: x.dataset.count, t: x.textContent })));
  check(`[${lang}] 모은 답 줄과 지금 보내기(세션 이름)`, hl.length === 1 && hl[0].n === '1' && hl[0].t.startsWith('@lead:'), hl);
  await shot(page, `pc-list-${lang}`);
  const list = await page.$('[data-role=decisions-list]');
  if (list) await list.screenshot({ path: path.join(OUT, `pc-list-crop-${lang}.png`) }).then(() => log(`그림 pc-list-crop-${lang}.png`)).catch(() => {});
  await page.keyboard.press('Escape'); await sleep(300);
  const id2 = call('session.list').find((s) => s.name === 'lead2').sessionId;
  await page.evaluate((sid) => window.__mt.getState().navigateTo(sid), id2); await sleep(1500);
  const marks = await page.$$eval('[data-role=decision-mark][data-auto="1"]', (xs) => xs.length);
  check(`[${lang}] 자동 카드뿐인 세션 표식은 점선(data-auto)`, marks >= 1, { marks });
  const heads = await page.$$('.mt-node-head');
  for (const h of heads) { if (await h.$('[data-role=decision-mark][data-auto="1"]')) { await h.screenshot({ path: path.join(OUT, `pc-node-mark-auto-${lang}.png`) }).catch(() => {}); break; } }
  await shot(page, `pc-board-${lang}`);
}

async function pc() {
  const { app, page } = await launch({ log, env: { ...ENV }, args: [`--remote-debugging-port=${DEBUG}`, ...AWAKE] });
  try {
    await awayWin(app);
    await page.setViewportSize({ width: 1600, height: 1000 }).catch(() => {});
    await page.waitForFunction(() => window.__mt && window.__mt.getState().boardLoaded, null, { timeout: 60000 }); await sleep(2500);
    for (const lang of ['ko', 'en']) await pcShots(page, lang);
    // 설정 › 일반의 자동 결정 카드 스위치
    call('settings.set', { key: 'language', value: 'ko' }); await sleep(600);
  } finally { await closeApp(app); }
}

// 답 모아 보내기 흐름: lead의 남은 손 카드에 답하면 모은 답과 함께 한 전달
async function batch() {
  const mine = open().filter((c) => c.name === 'lead');
  const h0 = held()[mine[0] ? mine[0].sessionId : ''] || 0;
  check('흐름 시작: lead 열린 카드 1, 모은 답 1', mine.length === 1 && h0 === 1, { mine: mine.map((c) => c.question), h0 });
  const before = leadDeliveries().length;
  const r = call('decision.answer', { id: mine[0].id, answer: mine[0].options[0] });
  await sleep(1500);
  const d = leadDeliveries();
  const sent = d.find((x) => x.deliveryId === r.deliveryId);
  check('둘째 답 → 전달 하나(두 줄)', d.length === before + 1 && sent && sent.text.split('\n').length === 2 && sent.text.split('\n').every((l) => l.startsWith('[결정] ')), sent && sent.text);
  for (let i = 0; i < 60; i++) { const x = leadDeliveries().find((y) => y.deliveryId === r.deliveryId); if (x && x.status === 'confirmed') break; await sleep(1000); }
  check('리드에 들어감(제출 확인)', (leadDeliveries().find((y) => y.deliveryId === r.deliveryId) || {}).status === 'confirmed');
  check('모은 답 비움', !held()[mine[0].sessionId]);
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
        await pg.waitForSelector('[data-role=pl-decisions]', { timeout: 20000 }); await sleep(800);
        await pg.tap('[data-role=pl-decisions]'); await sleep(700);
        const autos = await pg.$$eval('[data-role=decisions-sheet] [data-role=decision-auto]', (xs) => xs.length);
        const hl = await pg.$$eval('[data-role=decisions-sheet] [data-role=decision-held]', (xs) => xs.map((x) => x.textContent));
        check(`[phone ${lang}] 시트에 자동 표시와 모은 답 줄(세션 이름)`, autos >= 1 && hl.length === 1 && hl[0].startsWith('@lead:'), { autos, hl });
        await shot(pg, `phone-sheet-${lang}`);
        await ctx.close();
      }
    } finally { await browser.close(); }
  } finally { sim.close && sim.close(); }
}

try {
  if (WHAT === 'pc') await pc();
  else if (WHAT === 'phone') await phone();
  else if (WHAT === 'batch') await batch();
} catch (e) {
  check('시험이 끝까지 돌았다', false, e.stack || e.message);
} finally {
  fs.writeFileSync(path.join(OUT, `p286-${WHAT}.json`), JSON.stringify({ results }, null, 2));
  const bad = results.filter((r) => !r.ok);
  log(`결과 ${results.length - bad.length}/${results.length} 통과${bad.length ? ` 실패: ${bad.map((b) => b.name).join(', ')}` : ''}`);
  process.exit(bad.length ? 1 : 0);
}
