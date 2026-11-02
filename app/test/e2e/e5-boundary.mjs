// P3 완료 기준 3(노드 오류 경계): 한 노드를 그리다 오류가 나도 다른 노드와 그 터미널은 그대로다. "다시 그리기"로 되돌린다.
// 경계가 없던 P2에서는 잡지 못한 렌더링 오류가 판 전체(모든 터미널과 제어기)를 내렸다(React는 뿌리부터 내린다).
import { launch, shot, logger, sleep, until } from './harness.mjs';

const log = logger('e5-boundary');
const { app, page } = await launch({ log });
const nodes = await page.evaluate(() => ['a', 'b', 'c', 'd'].map((n) => [...window.__mt.getState().sessions.values()].find((s) => s.name === n)).map((s) => ({ id: s.sessionId, ...window.__mt.getState().nodes.get(s.sessionId) })));
const minX = Math.min(...nodes.map((n) => n.x)), minY = Math.min(...nodes.map((n) => n.y));
await page.evaluate((vp) => window.__mt.getState().setViewport(vp), { x: 30 - minX * 0.5, y: 120 - minY * 0.5, zoom: 0.5 });
await until(() => page.evaluate(() => window.__mt.terms.size >= 4), 30000);
await sleep(1500);
const snap = () => page.evaluate(() => ({ terms: window.__mt.terms.size, attached: window.__mt.getState().attached.length, flow: !!document.querySelector('.react-flow__viewport'), nodes: [...document.querySelectorAll('.react-flow__node-session')].map((n) => (n.querySelector('[data-error-boundary]') ? 'ERR' : n.querySelector('.mt-term') ? 'term' : '?')).join(','), errors: window.__mt.perf.events.filter((e) => /node_error|react_|app_error/.test(e.kind)).map((e) => `${e.kind}: ${e.message || ''}`) }));
log('오류 전', await snap());
const target = nodes[1].id;
await page.evaluate((id) => window.__mt.setDebugThrow(id), target);
await sleep(1500);
log('b 노드에서 오류', await snap());
await shot(page, 'e5-boundary-1-node-error', log);
// 다시 그리기
await page.evaluate(() => window.__mt.setDebugThrow(null));
await page.click('[data-error-boundary="session"] button');
await until(() => page.evaluate(() => window.__mt.terms.size >= 4), 20000).catch(() => {});
await sleep(1500);
log('다시 그린 뒤', await snap());
await shot(page, 'e5-boundary-2-redrawn', log);
await app.close();
