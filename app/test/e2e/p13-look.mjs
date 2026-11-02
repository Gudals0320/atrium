// P13: 판을 띄워 지금 모습을 찍는다(전체, repoA, repoB). 시험이 아니라 생김새 확인용. 사용: node experiments/p13/tools/e2e.cjs p13-look.mjs [이름]
import { launch, closeApp, shot, logger, sleep, until, convos, lookAt } from './p13-lib.mjs';
const log = logger('p13-look');
const tag = process.argv[2] || 'look';
const { app, page } = await launch({ log });
try {
  await until(async () => (await convos(page)).length > 20, 60000, 500);
  await sleep(1500);
  await page.evaluate(() => window.__mt.getState().fitAll(0));
  await sleep(800);
  await shot(page, `p13-${tag}-all`, log);
  const cs = await convos(page);
  for (const k of ['repoA', 'repoB']) {
    const r = await page.evaluate((name) => { const s = window.__mt.getState(); const w = s.workspaces.find((x) => x.name.endsWith(name)); return w ? s.regionOf(w.key) : null; }, k);
    if (r) { await lookAt(page, r); await shot(page, `p13-${tag}-${k}`, log); }
  }
  log('대화 노드', cs.length);
} finally { await closeApp(app); process.exit(0); }
