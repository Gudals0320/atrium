// P296 창 시험: 자체 오케스트레이션. 개발용 판(atrium-dev-p296, 48046)에 가짜 자체 오케스트레이션 하네스(backend/.dev/p296-fake-orch.cjs,
// 런처 fake-orch)를 띄워 둔 뒤(독립 solo가 INNER로 안에서 일하는 중) 판 카드 표, 리포 잠재우기 거절 알림, 런처 창 칸, 세션 맵 카드 표를 찍는다.
// 판: 따로 띄운 개발용 판만. 창의 원격 디버깅 포트 9527. 한 번에 한 창. 실행: node app/test/e2e/p296-orch.mjs [round]
// 결과는 experiments/p296/<round>/(저장소 밖).
import fs from 'node:fs';
import path from 'node:path';

const TAG = process.argv[2] || 'round-1';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const DEV = path.join(REPO, 'backend', '.dev');
const BOARD = 'atrium-dev-p296', PORT = '48046', DEBUG = '9527';
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_|HC_|CLAUDECODE$|CLAUDE_CODE_)/.test(k)) delete process.env[k];
process.env.MT_E2E_OUT = path.join('p296', TAG);
const ENV = { ATRIUM_TERMINAL_SESSION: BOARD, ATRIUM_HERDR_SESSION: BOARD, ATRIUM_PORT: PORT, ATRIUM_DATA_DIR: path.join(DEV, 'data'), ATRIUM_APP_USERDATA: path.join(DEV, 'app'), ATRIUM_CLAUDE_PROJECTS: path.join(DEV, 'claude-projects'), ATRIUM_CLAUDE_DESKTOP: 'none' };
Object.assign(process.env, ENV);
const { logger, sleep, launch, closeApp, shot } = await import('./harness.mjs');
const { assertTestBoard } = await import('./p9-guard.mjs');
assertTestBoard(ENV, { root: DEV });
const log = logger('p296-' + TAG);
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok: !!ok, extra }); log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ' ' + extra : '')); };

const { app, page } = await launch({ log, env: ENV, args: ['--remote-debugging-port=' + DEBUG] });
try {
  await page.setViewportSize({ width: 1600, height: 950 }).catch(() => {});
  await sleep(2500);
  // 1) 판 카드 머리의 표
  await page.waitForSelector('[data-role=orch-tag]', { timeout: 30000 });
  const tags = await page.$$eval('[data-role=orch-tag]', (els) => els.map((e) => ({ text: e.textContent, busy: e.dataset.busy, title: e.title })));
  log('tags', tags);
  check('카드 표가 오케스트레이션 세션에만 있다', tags.length === 2, JSON.stringify(tags.map((x) => x.text)));
  check('안에서 일하는 중 표(solo)', tags.some((x) => x.busy === '1'));
  const head = page.locator('.mt-node-head:has([data-role=orch-tag][data-busy="1"])').first();
  await head.scrollIntoViewIfNeeded().catch(() => {});
  await head.screenshot({ path: path.join(REPO, 'experiments', 'p296', TAG, 'card-head-busy.png') }).catch((e) => log('head shot failed ' + e.message));
  await shot(page, 'board', log);
  // 2) 리포 잠재우기 거절(이름표 단추)
  const label = page.locator('[data-role=region-label], .mt-region-label').first();
  if (await label.count()) { await label.hover(); await sleep(400); }
  const btn = page.locator('[data-action=region-sleep]').first();
  if (await btn.count()) {
    await btn.evaluate((e) => e.click()); // 이름표 단추는 마우스를 올려야 보인다(눌러지는 것은 같다)
    await sleep(1500);
    const toastText = await page.evaluate(() => [...document.querySelectorAll('.mt-toast, [data-role=toast]')].map((e) => e.textContent).join(' | '));
    log('toast', toastText);
    check('잠재우기 거절 까닭(안에서 일하는 중)', /안에서 일하고|inner/.test(toastText), toastText.slice(0, 200));
    await shot(page, 'sleep-refused', log);
  } else check('잠재우기 단추를 찾음', false);
  // 3) 런처 창: 새 런처 틀의 칸
  await page.click('[data-action=launcher-add]');
  await page.waitForSelector('[data-role=launcher-orch]', { timeout: 10000 });
  const off = await page.$eval('[data-field=launcher-orchestrates]', (e) => e.checked);
  check('새 claude 런처는 꺼짐', off === false);
  await page.click('[data-field=launcher-orchestrates]');
  await page.waitForSelector('[data-role=launcher-orch-fallback]', { timeout: 5000 });
  await page.locator('[data-role=launcher-form]').screenshot({ path: path.join(REPO, 'experiments', 'p296', TAG, 'launcher-form.png') });
  check('켜면 보고 물러섬 칸이 보인다', true);
  // 목록(취소 → 목록)
  const cancel = page.locator('[data-role=launcher-form] .mt-ln-foot button').filter({ hasText: /취소|Cancel/ }).first();
  if (await cancel.count()) await cancel.click(); else await page.keyboard.press('Escape');
  await sleep(800);
  if (await page.locator('[data-role=launcher-orch-tag]').count()) {
    check('런처 목록에 표', true);
    await page.locator('[data-role=launchers-list]').screenshot({ path: path.join(REPO, 'experiments', 'p296', TAG, 'launcher-list.png') });
  } else log('launcher list not shown');
  await page.keyboard.press('Escape'); await sleep(500);
  await page.keyboard.press('Escape'); await sleep(500);
  // 4) 세션 맵 카드 표
  await page.click('[data-action=mission-rail]').catch(() => {});
  await page.waitForSelector('[data-role=ta-orch]', { timeout: 15000 }).catch(() => {});
  const mapTags = await page.$$eval('[data-role=ta-orch]', (els) => els.map((e) => e.textContent));
  check('세션 맵 카드 표', mapTags.length >= 1, JSON.stringify(mapTags));
  await sleep(800);
  await shot(page, 'map', log);
} finally {
  fs.writeFileSync(path.join(REPO, 'experiments', 'p296', TAG, 'results.json'), JSON.stringify(results, null, 2));
  await closeApp(app);
}
log('결과', results.filter((r) => r.ok).length + '/' + results.length);
process.exit(results.every((r) => r.ok) ? 0 : 1);
