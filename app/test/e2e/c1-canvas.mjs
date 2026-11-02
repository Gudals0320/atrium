// 완료 기준 1: 판을 끌어 옮기고 확대·축소한다. 노드를 끌어 2×2로 놓고, 자리가 판 배치(board.get)에 저장되는지 본다.
// 그 뒤 넷이 다 보이게 맞추면 네 노드가 모두 가까이 얼굴이 되어 터미널을 그린다(완료 기준 2).
import { launch, shot, logger, sleep } from './harness.mjs';

const log = logger('c1-canvas');
const { app, page } = await launch({ log });
const vp = () => page.evaluate(() => document.querySelector('.react-flow__viewport').style.transform);
const box = async (sel) => page.locator(sel).first().boundingBox();

await page.locator('.react-flow__controls-fitview').click();
await sleep(600);
log('맞춘 뒤', await vp());
await shot(page, 'c1-before', log);

// 빈 곳을 끌어 판 옮기기
const pane = await box('.react-flow__pane');
await page.mouse.move(pane.x + 30, pane.y + 30);
await page.mouse.down();
await page.mouse.move(pane.x + 230, pane.y + 130, { steps: 10 });
await page.mouse.up();
await sleep(300);
log('끌어 옮긴 뒤', await vp());
// 휠로 확대·축소
await page.mouse.move(pane.x + 40, pane.y + 40);
await page.mouse.wheel(0, -300);
await sleep(400);
log('휠 확대 뒤', await vp());
await page.mouse.wheel(0, 600);
await sleep(400);
log('휠 축소 뒤', await vp());
await shot(page, 'c1-pan-zoom', log);

// 노드 끌기: c를 a 아래로, d를 b 아래로(머리줄을 잡고 끈다)
await page.locator('.react-flow__controls-fitview').click();
await sleep(600);
async function dragNode(name, toName, dyPx) {
  const from = await box(`.mt-node[data-name="${name}"] .mt-node-head`);
  const to = await box(`.mt-node[data-name="${toName}"] .mt-node-head`);
  const node = await box(`.mt-node[data-name="${toName}"]`);
  const sx = from.x + 30, sy = from.y + from.height / 2;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(to.x + 30, to.y + to.height / 2 + node.height + dyPx, { steps: 20 });
  await page.mouse.up();
  await sleep(400);
}
const gap = await page.evaluate(() => { const m = document.querySelector('.react-flow__viewport').style.transform.match(/scale\(([\d.]+)\)/); return 40 * Number(m[1]); });
await dragNode('c', 'a', gap);
await dragNode('d', 'b', gap);
await sleep(800);
const board = await page.evaluate(() => window.__mt.api.call('board.get'));
const names = await page.evaluate(() => Object.fromEntries([...window.__mt.getState().sessions.values()].map((s) => [s.sessionId, s.name])));
log('저장된 배치', board.nodes.map((n) => `${names[n.session_id]}=(${n.x},${n.y}) ${n.w}x${n.h}`).join(' '), 'viewport', board.viewport);
await page.locator('.react-flow__controls-fitview').click();
await sleep(2500);
log('2x2로 맞춘 뒤', await vp(), '붙은 제어기', await page.evaluate(() => window.__mt.getState().attached.length));
log('터미널', await page.evaluate(() => window.__mt.perf.snapshot().terminals));
await shot(page, 'c1-2x2-four-terminals', log);
await app.close();
