// P11 창 시험(시나리오 9): 사이드바, 대화상자(새 세션, 설정), 미션 맵, 검색, Thread, 루프 목록, 토스트가 패널 토큰으로 그려지는지 찍는다.
// 또 패널 글이 12px 아래로 내려가지 않는지(상태 알약과 아이콘 얼굴 빼고) 잰다. p11-scene.mjs setup 뒤의 판에서 돈다.
// 사용(app 폴더에서): MT_E2E_BOARD=p11 MT_E2E_OUT=p11 node test/e2e/p11-panels.mjs
import path from 'node:path';
import { launch, closeApp, logger, sleep, writeJson, OUT } from './p10-lib.mjs';

const log = logger('p11-panels');
const shot = async (page, name) => { const f = path.join(OUT, `${name}.png`); await page.screenshot({ path: f }); log('찍음', f); };
// 패널 안 글 중 12px보다 작은 것(상태 알약, 키 표시 빼고)
const small = (page, sel) => page.evaluate((sel) => {
  const out = [];
  for (const root of document.querySelectorAll(sel)) for (const el of root.querySelectorAll('*')) {
    if (!el.childNodes.length || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
    if (el.closest('.mt-pill, .mt-kbd, kbd')) continue;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs < 11.95) out.push(`${el.className || el.tagName}:${fs}:${el.textContent.trim().slice(0, 20)}`);
  }
  return out.slice(0, 20);
}, sel);
const result = {};

const { app, page } = await launch({ log });
try {
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1528, 960));
  await page.evaluate(() => window.__mt.getState().setViewport({ x: 119, y: 158, zoom: 0.75 }));
  if (!(await page.$('[data-role="sidebar"]'))) await page.click('[data-action="sidebar"]');
  await sleep(2000);
  result.sidebar = await small(page, '[data-role="sidebar"]');
  await shot(page, 'p11-panel-sidebar');
  await page.click('[data-action="sidebar"]');
  await page.click('[data-action="spawn-codex"]'); await sleep(800);
  result.spawn = await small(page, '.mt-modal');
  await shot(page, 'p11-panel-spawn');
  await page.keyboard.press('Escape'); await page.mouse.click(5, 480); await sleep(300);
  await page.click('[data-action="settings-open"]'); await sleep(800);
  result.settings = await small(page, '.mt-modal');
  await shot(page, 'p11-panel-settings');
  await page.mouse.click(5, 480); await sleep(300);
  await page.click('[data-action="mission-rail"]'); await sleep(2000);
  result.mission = await small(page, '.mt-mission');
  await shot(page, 'p11-panel-mission');
  await page.keyboard.press('Escape'); await sleep(300);
  await page.click('[data-action="search"]'); await sleep(300);
  await page.keyboard.type('retry'); await sleep(1200);
  result.search = await small(page, '.mt-search');
  await shot(page, 'p11-panel-search');
  await page.keyboard.press('Escape'); await sleep(300);
  await page.click('[data-action="thread-toggle"]'); await sleep(1200);
  result.thread = await small(page, '.mt-thread');
  await page.click('[data-action="loops-open"]'); await sleep(500);
  await page.click('[data-role="review"]'); await sleep(500);
  result.review = await small(page, '.mt-dropdown');
  await shot(page, 'p11-panel-thread-loops-review');
  await page.keyboard.press('Escape');
  await page.click('[data-action="thread-toggle"]');
  await page.click('[data-action="loops-open"]');
  await page.click('[data-action="changes"]'); await sleep(1500);
  result.changes = await small(page, '[data-role="return-summary"]');
  await shot(page, 'p11-panel-changes');
  log('12px보다 작은 패널 글', result);
} finally { await closeApp(app); }
writeJson('p11-panels.json', result);
process.exit(0);
