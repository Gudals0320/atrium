// P8 K4 창 시험: 3단계 나무가 캔버스(부모 오른쪽에 형제끼리 쌓임, 역할 선, 머리줄 표시), 사이드바(부모 아래 들여 쓰기), 미션 맵(부모 순서, 들여 쓰기)에 보이고,
// 설정에 상한 칸이 있으며, 상한에 막힌 요청은 창에도 알림이 뜬다. 앞 단계(lead → w1, w2, mid → deep-worker, n4)가 끝난 판에서 돈다.
// 사용(app 폴더에서): npm run build && MT_E2E_OUT=p8 node test/e2e/p8-k4.mjs [접두어]
import { launch, closeApp, shot, logger, sleep, until, atrium, writeJson, treeView, fitNames } from './p8-lib.mjs';

const tag = process.argv[2] || 'k4';
const log = logger(`p8-${tag}`);
const result = {};
const { app, page } = await launch({ log });
try {
  await page.evaluate(() => { try { localStorage.removeItem('mt.sidebar'); } catch {} });
  await page.evaluate(() => window.__mt.getState().fitAll(0));
  await sleep(1500);
  result.tree = await treeView(page);
  log('tree', JSON.stringify(result.tree));
  const names = result.tree.map((t) => t.name);
  await fitNames(page, names, 60);
  await shot(page, `${tag}-1-tree-canvas`, log);
  result.edges = await page.evaluate(() => [...document.querySelectorAll('.mt-edge-label')].map((e) => ({ kind: e.dataset.kind, text: e.innerText.replace(/\s+/g, ' ').trim() })));
  log('edge labels', JSON.stringify(result.edges));

  // 사이드바: 판 세션이 나무 순서로, 하위 세션은 들여 쓴다
  await page.click('[data-action="sidebar"]');
  await page.waitForSelector('.mt-sb-row[data-sb="session"]', { timeout: 20000 });
  await page.evaluate(() => { for (const b of document.querySelectorAll('[data-sec="sessions"] [data-action="more"]')) b.click(); });
  await sleep(800);
  result.sidebar = await page.evaluate(() => [...document.querySelectorAll('.mt-sb-row[data-sb="session"]')].map((r) => ({ name: r.dataset.name, indent: Number(r.dataset.indent), branch: (r.querySelector('[data-role="sb-branch"]') || {}).textContent || null })));
  log('sidebar', JSON.stringify(result.sidebar));
  await shot(page, `${tag}-2-sidebar-indent`, log);
  await page.click('[data-action="sidebar"]');

  // 미션 맵
  await page.click('[data-action="mission-open"]');
  await page.waitForSelector('[data-role="mm-node"][data-kind="session"]', { timeout: 20000 });
  await sleep(800);
  result.mission = await page.evaluate(() => [...document.querySelectorAll('[data-role="mm-node"][data-kind="session"]')].map((e) => ({ name: e.dataset.name, x: parseInt(e.style.left, 10), y: parseInt(e.style.top, 10), branch: (e.querySelector('[data-role="mm-branch"]') || {}).textContent || null })).sort((a, b) => a.x - b.x || a.y - b.y));
  log('mission', JSON.stringify(result.mission));
  await shot(page, `${tag}-3-mission-map`, log);
  await page.click('[data-action="mission-close"]');

  // 설정의 상한 칸
  await page.click('[data-action="settings-open"]');
  await page.waitForSelector('[data-role="branch-settings"]', { timeout: 10000 });
  result.settings = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-role="branch-settings"] input')].map((i) => [i.dataset.field, i.value])));
  log('settings', JSON.stringify(result.settings));
  await shot(page, `${tag}-4-settings-limits`, log);
  await page.keyboard.press('Escape');
  await page.evaluate(() => { const b = [...document.querySelectorAll('.mt-modal .mt-btn')].find((x) => x.textContent === '닫기'); if (b) b.click(); });

  // 상한에 막힌 요청: 창에도 알림
  if (names.includes('deep-worker')) {
    atrium('send', '@deep-worker', 'Run this exact Bash command and reply with its full output only: atrium child too-deep-2');
    await page.waitForSelector('.mt-toast.warn', { timeout: 60000 });
    result.toast = await page.evaluate(() => document.querySelector('.mt-toast.warn').textContent);
    log('toast', result.toast);
    await fitNames(page, ['mid', 'deep-worker'], 60);
    await shot(page, `${tag}-5-refused-toast`, log);
  }
  writeJson(`p8-${tag}.json`, result);
} catch (e) { log('FAIL', e.stack); await shot(page, `${tag}-fail`, log).catch(() => {}); process.exitCode = 1; }
await closeApp(app);
process.exit(process.exitCode || 0);
