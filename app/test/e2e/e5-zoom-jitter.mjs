// E5 2.5 방어 확인(P3): 얼굴 경계(노드 720px × 배율 0.5 = 360px)에서 배율이 조금 흔들려도 터미널이 놓이지 않는가
import { launch, shot, logger, sleep, until } from './harness.mjs';

const log = logger('e5-zoom-jitter');
const { app, page } = await launch({ log });
const nodes = await page.evaluate(() => [...window.__mt.getState().nodes.values()]);
const minX = Math.min(...nodes.map((n) => n.x)), minY = Math.min(...nodes.map((n) => n.y));
const setZoom = (zoom) => page.evaluate((vp) => window.__mt.getState().setViewport(vp), { x: 42 - minX * zoom, y: 174 - minY * zoom, zoom });
const snap = () => page.evaluate(() => ({ attached: window.__mt.getState().attached.length, terms: window.__mt.terms.size, faces: [...document.querySelectorAll('.mt-node')].map((n) => n.dataset.face[0]).join(''), unmounts: window.__mt.perf.events.filter((e) => e.kind === 'term_unmount').length }));
await setZoom(0.5);
await until(() => page.evaluate(() => window.__mt.terms.size >= 8), 30000);
await sleep(2000);
log('배율 0.5', await snap());
for (const z of [0.4999, 0.5, 0.4995, 0.49]) { await setZoom(z); await sleep(1800); log(`배율 ${z}(경계 아래 ${(360 - 720 * z).toFixed(2)}px)`, await snap()); }
await setZoom(0.47); await sleep(2500);
log('배율 0.47(338px, 이력 16px 밖)', await snap());
await shot(page, 'e5-zoom-jitter-047', log);
await app.close();
