// 세 얼굴(ARCH 7.2): 가까이(터미널), 중간(대화 보기), 멀리(요약)
import { launch, shot, logger, sleep } from './harness.mjs';

const log = logger('faces');
const { app, page } = await launch({ log });
for (const [zoom, x, y] of [[0.6, 40, 60], [0.4, 40, 80], [0.15, 60, 120]]) {
  await page.evaluate((vp) => window.__mt.getState().setViewport(vp), { x, y, zoom });
  await sleep(2500);
  log(`배율 ${zoom}`, await page.evaluate(() => ({ faces: [...document.querySelectorAll('.mt-node')].map((n) => `${n.dataset.name}:${n.dataset.face}`).join(' '), attached: window.__mt.getState().attached.length })));
  await shot(page, `faces-zoom-${String(zoom).replace('.', '')}`, log);
}
await app.close();
