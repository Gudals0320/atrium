// P334 창 시험: 일 기록(done --record) 단추와 보기 창. 따로 띄운 개발용 판(P334_* 환경 변수로 받은 터미널 세션·포트·데이터 폴더)에 w1(기록을 남긴 워커)이 있을 때.
// 사용: node test/e2e/p334-records.mjs <ko|en> <결과 폴더>
import path from 'node:path';
import fs from 'node:fs';
import { launch, closeApp, sleep } from './harness.mjs';

const [lang = 'ko', out = '.'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const log = (...a) => console.log(...a);
const shot = async (page, name) => { const f = path.join(out, `${name}-${lang}.png`); await page.screenshot({ path: f }); log('shot', f); };
const env = Object.fromEntries(['ATRIUM_TERMINAL_SESSION', 'ATRIUM_HERDR_SESSION', 'ATRIUM_PORT', 'ATRIUM_DATA_DIR', 'ATRIUM_APP_USERDATA', 'ATRIUM_CLAUDE_DESKTOP', 'ATRIUM_CLAUDE_PROJECTS'].filter((k) => process.env[k]).map((k) => [k, process.env[k]]));
if (!env.ATRIUM_PORT || env.ATRIUM_PORT === '47800') throw new Error('개발용 판에서만');
const { app, page } = await launch({ env, args: ['--remote-debugging-port=' + (process.env.P334_DEBUG_PORT || '9565')], log });
try {
  await page.setViewportSize({ width: 1500, height: 900 }).catch(() => {});
  await page.evaluate((l) => window.__mt.api.call('settings.set', { language: l }).catch(() => null), lang);
  await sleep(1500);
  const id = await page.evaluate(() => { const s = [...window.__mt.getState().sessions.values()].find((x) => x.name === 'w1'); return s ? s.sessionId : null; });
  if (!id) throw new Error('w1 없음');
  await page.waitForFunction((sid) => { const s = window.__mt.getState().sessions.get(sid); return s && s.records && s.records.count > 0; }, id, { timeout: 30000 });
  await page.evaluate((sid) => window.__mt.getState().navigateTo && window.__mt.getState().navigateTo(sid), id);
  await sleep(1500);
  const chip = page.locator(`.react-flow__node[data-id="${id}"] [data-role=record-chip]`);
  log('PC 카드 단추', await chip.count(), await chip.first().innerText().catch(() => ''));
  await shot(page, 'p334-card');
  await chip.first().click();
  await page.waitForSelector('[data-role=record-view] .mt-output-doc', { timeout: 15000 });
  await sleep(500);
  log('보기 창 파일', await page.getAttribute('[data-role=record-view]', 'data-file'));
  await shot(page, 'p334-view');
  await page.keyboard.press('Escape');
  await sleep(400);
  log('Esc 뒤 창', await page.locator('[data-role=record-view]').count());
  // 세션 맵 카드
  await page.click('[data-action=chip-mission]');
  await sleep(2500);
  log('맵 카드', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('[data-role=mm-node]')].map((e) => e.dataset.id + ':' + e.dataset.name))));
  await page.waitForSelector(`[data-role=mm-node][data-id="s:${id}"]`, { timeout: 15000 });
  await sleep(1200);
  const mchip = page.locator(`[data-role=ta-slot][data-id="s:${id}"] [data-role=record-chip]`);
  log('세션 맵 단추', await mchip.count());
  await shot(page, 'p334-map');
  await mchip.first().click();
  await page.waitForSelector('[data-role=record-view]', { timeout: 15000 });
  await sleep(600);
  await shot(page, 'p334-map-view');
} catch (e) { log('실패', e.message); } finally { await closeApp(app); process.exit(0); }
