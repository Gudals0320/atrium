// P174 창 시험: 정리 대상 Codex 대화를 사이드바에서 휴지통으로 보낸다(지우기 전 목록, 확인창, 결과 알림, 지운 뒤 목록).
// 개발용 판(atrium-dev-p174, 47943)과 시험 Codex 홈(ATRIUM_CODEX_HOME, 가짜 rollout)으로만 돈다. 결과는 experiments/p174(MT_E2E_OUT=p174)
import { launch, closeApp, shot, sleep } from './harness.mjs';

const ENV = { ATRIUM_TERMINAL_SESSION: 'atrium-dev-p174', ATRIUM_HERDR_SESSION: 'atrium-dev-p174', ATRIUM_PORT: '47943' };
for (const [k, v] of Object.entries(ENV)) if (process.env[k] !== v) throw new Error(`P174 시험은 개발용 판 p174에서만: ${k}`);
if (!/mtask-p174-/.test(process.env.ATRIUM_CODEX_HOME || '')) throw new Error('시험 Codex 홈(ATRIUM_CODEX_HOME=…mtask-p174-…)이 없다');

const out = {};
const { app, page } = await launch({ args: ['--remote-debugging-port=9423'] });
try {
  await page.setViewportSize?.({ width: 1400, height: 900 });
  if (!(await page.$('[data-action="missed-box"]'))) await page.click('[data-action="sidebar"]').catch(() => {});
  await page.waitForSelector('[data-action="missed-box"]', { timeout: 15000 });
  await page.click('[data-action="missed-box"]');
  await page.evaluate(() => { const l = document.querySelector('[data-role="sidebar-list"]'); if (l) l.scrollTop = l.scrollHeight; });
  await page.waitForSelector('[data-role="missed-box"] [data-folder]', { timeout: 20000 });
  await sleep(800);
  out.before = await page.evaluate(() => document.querySelector('[data-role="missed-box"]').innerText);
  await shot(page, 'p174-1-before');
  await page.click('[data-action="missed-all"]');
  await page.waitForSelector('[data-role="missed-confirm"]');
  out.confirm = await page.evaluate(() => document.querySelector('[data-role="missed-confirm"]').innerText);
  await shot(page, 'p174-2-confirm');
  await page.click('[data-action="missed-confirm"]');
  await page.waitForFunction(() => [...document.querySelectorAll('.mt-toast, [class*="toast"]')].some((e) => /휴지통|trash/i.test(e.innerText)), null, { timeout: 30000 });
  out.toast = await page.evaluate(() => [...document.querySelectorAll('.mt-toast, [class*="toast"]')].map((e) => e.innerText).join(' | '));
  await sleep(1200);
  out.after = await page.evaluate(() => document.querySelector('[data-role="missed-box"]').innerText);
  await shot(page, 'p174-3-after');
} catch (e) { out.error = e.message.slice(0, 400); await shot(page, "p174-err").catch(() => {}); } finally {
  console.log(JSON.stringify(out, null, 2));
  await closeApp(app);
  process.exit(0);
}
