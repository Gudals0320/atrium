// P5 5절 2번(설명하지 못한 노드 이동) 조사 도구: 혼자 끌기는 까닭(drag)과 함께 node_moved로 남고, 누르기(3px 안)는 자리를 바꾸지 않는다. MT_E2E_OUT=p6a
import { logger, closeApp } from './harness.mjs';
import { launch, atriumJson, rectOf, dragBy, sleep, shot } from './p6a-lib.mjs';

const log = logger('p6a-move');
const { app, page } = await launch({ log });
await sleep(1500);
await page.click('.mt-wsbtn[data-name="r1"]');
await sleep(900);
const r0 = await rectOf(page, 'r1sh');
// 누르기: 자리를 바꾸지 않는다(눌러서 들어가기만)
const b = await page.locator('.mt-node[data-name="r1sh"] .mt-node-head').boundingBox();
await page.mouse.move(b.x + 60, b.y + b.height / 2); await page.mouse.down(); await page.mouse.move(b.x + 61, b.y + b.height / 2 + 1); await page.mouse.up();
await sleep(1200);
const r1 = await rectOf(page, 'r1sh');
await page.click('.mt-wsbtn[data-name="r1"]');
await sleep(900);
// 끌기: 아래로 80px, 다시 위로 80px
await dragBy(page, '.mt-node[data-name="r1sh"] .mt-node-head', 0, 80);
const r2 = await rectOf(page, 'r1sh');
await dragBy(page, '.mt-node[data-name="r1sh"] .mt-node-head', 0, -80);
const r3 = await rectOf(page, 'r1sh');
const perf = await page.evaluate(() => window.__mt.perf.events.filter((e) => /^drag/.test(e.kind)).map((e) => `${e.kind}:${e.mode || ''}:${e.dist ?? ''}`));
const ev = atriumJson('events', 'r1sh', '--limit', '20').filter((e) => e.kind === 'node_moved').map((e) => `${e.data.cause} ${e.data.from.x},${e.data.from.y} → ${e.data.to.x},${e.data.to.y}`);
log('누르기(1px)', JSON.stringify(r0) === JSON.stringify(r1) ? '자리 그대로' : `바뀜 ${JSON.stringify(r1)}`, '끌기', r2.y - r0.y, '되끌기', r3.y - r0.y);
log('창 끌기 기록', perf);
log('판 이벤트 node_moved', ev);
await shot(page, 'fix-4-node-move-audit', log);
await closeApp(app);
process.exit(0);
