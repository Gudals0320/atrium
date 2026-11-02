// P6a 완료 기준 4(H5): 노드를 끌어 붙이고 떼고, 분할선으로 크기를 바꾼다. 덩어리는 함께 움직인다. 에이전트가 나눈 패널은 처음부터 붙어 있다. MT_E2E_OUT=p6a
import { logger, closeApp } from './harness.mjs';
import { launch, atrium, atriumJson, sessionBy, idOf, rectOf, vp, dragBy, nodeText, until, sleep, shot, TWO, PROJ, PROJ_NAME } from './p6a-lib.mjs';

const log = logger('p6a-h5');
const { app, page } = await launch({ log });
await sleep(1500);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const docks = () => page.evaluate(() => [...window.__mt.getState().docks.values()].map((d) => ({ id: d.dockId, dir: d.dir, members: d.members.map((m) => (window.__mt.getState().sessions.get(m) || {}).name) })));
for (const d of atriumJson('call', 'dock.list')) atrium('call', 'dock.remove', JSON.stringify({ dock: d.dockId })); // 앞 실행이 남긴 것

// 1) 끌어 붙이기: sh2를 sh1 오른쪽 가장자리 가까이 끌면 붙을 자리가 보이고, 놓으면 붙는다
// P17: 셸 둘(sh1, sh2)이 없으면 띄운다(P17 판에서 다시 돌릴 때)
for (const n of ['sh1', 'sh2']) if (!(await sessionBy(page, n))) mtask('spawn', PROJ, '--kind', 'shell', '--name', n);
await until(async () => (await sessionBy(page, 'sh1')) && (await sessionBy(page, 'sh2')), 30000);
await sleep(1500);
await page.click(`.mt-wsbtn[data-name="${PROJ_NAME}"]`);
await sleep(900);
const z = (await vp(page)).zoom;
const r1 = await rectOf(page, 'sh1'), r2 = await rectOf(page, 'sh2');
log('붙이기 전', { sh1: r1, sh2: r2, zoom: +z.toFixed(3) });
const head2 = await page.locator('.mt-node[data-name="sh2"] .mt-node-head').boundingBox();
const want = { dx: (r1.x + r1.w - r2.x + 20) * z, dy: 50 * z }; // 오른쪽 가장자리에서 20(판 좌표) 떨어지게, 조금 아래로
const x0 = head2.x + 80, y0 = head2.y + head2.height / 2;
await page.mouse.move(x0, y0); await page.mouse.down();
for (let i = 1; i <= 12; i++) { await page.mouse.move(x0 + (want.dx * i) / 12, y0 + (want.dy * i) / 12); await sleep(16); }
await sleep(200);
const ghost = await page.evaluate(() => !!document.querySelector('[data-role=dock-ghost]'));
await shot(page, 'h5-1-drag-shows-dock-ghost', log);
await page.mouse.up();
await sleep(1500);
let d = await docks();
const a1 = await rectOf(page, 'sh1'), a2 = await rectOf(page, 'sh2');
log('놓은 뒤', '붙을 자리 보였나', ghost, '덩어리', d, 'sh1', a1, 'sh2', a2, '틈 없음', a1.x + a1.w === a2.x && a1.y === a2.y && a1.h === a2.h);
await shot(page, 'h5-2-docked', log);

// 2) 분할선을 끌면 이웃한 두 노드의 크기가 함께 바뀐다
const dockId = (await page.evaluate(() => [...window.__mt.getState().docks.values()][0].dockId));
const div = await page.locator(`.mt-divider[data-dock="${dockId}"]`).first().boundingBox();
await page.mouse.move(div.x + div.width / 2, div.y + div.height * 0.3); await page.mouse.down();
for (let i = 1; i <= 10; i++) { await page.mouse.move(div.x + div.width / 2 + 12 * i, div.y + div.height * 0.3); await sleep(16); }
await page.mouse.up();
await sleep(1200);
const b1 = await rectOf(page, 'sh1'), b2 = await rectOf(page, 'sh2');
const stored = atriumJson('board').nodes;
const sid1 = await idOf(page, 'sh1'), sid2 = await idOf(page, 'sh2');
log('분할선 +120px(화면)', 'sh1 폭', a1.w, '→', b1.w, 'sh2 폭', a2.w, '→', b2.w, '합 그대로', a1.w + a2.w === b1.w + b2.w, '저장', stored.find((n) => n.session_id === sid1).w === b1.w && stored.find((n) => n.session_id === sid2).w === b2.w);
await shot(page, 'h5-3-divider-resized', log);

// 3) 덩어리는 함께 움직인다(구성 노드 머리줄을 끌면)
await dragBy(page, '.mt-node[data-name="sh1"] .mt-node-head', 0, 90);
await sleep(800);
const c1 = await rectOf(page, 'sh1'), c2 = await rectOf(page, 'sh2');
log('알림', await page.evaluate(() => [...document.querySelectorAll('.mt-toast')].map((t) => t.innerText)), 'perf', await page.evaluate(() => window.__mt.perf.events.filter((e) => /drag/.test(e.kind)).slice(-3)));
log('덩어리째 옮기기', 'sh1 y', b1.y, '→', c1.y, 'sh2 y', b2.y, '→', c2.y, '함께', c1.y - b1.y === c2.y - b2.y && c1.y !== b1.y, '틈 없음', c1.x + c1.w === c2.x);
await shot(page, 'h5-4-dock-moves-together', log);

// 4) Alt를 누른 채 끌면 그 노드만 끌어낸다(덩어리에서 뗀다)
await dragBy(page, '.mt-node[data-name="sh2"] .mt-node-head', 0, 360, { alt: true });
await sleep(1200);
d = await docks();
log('Alt 끌어내기 뒤 덩어리', d, 'sh1 그대로', JSON.stringify(await rectOf(page, 'sh1')) === JSON.stringify(c1), 'sh2', await rectOf(page, 'sh2'));
await shot(page, 'h5-5-alt-drag-undocked', log);

// 5) 메뉴의 "떼기"
atrium('dock', 'sh2', 'sh1', '--side', 'bottom');
await until(async () => (await docks()).length === 1, 10000);
log('atrium dock sh2 sh1 --side bottom', await docks());
await page.click('.mt-node[data-name="sh2"] [data-action=node-menu]');
await shot(page, 'h5-6-node-menu', log);
await page.click('.mt-node[data-name="sh2"] [data-action=undock]');
await sleep(1200);
log('메뉴 떼기 뒤 덩어리', await docks(), 'sh2', await rectOf(page, 'sh2'));

// 6) 에이전트가 herdr로 나눈 패널은 나눈 방향대로 처음부터 붙는다(herdr 레이아웃은 판이 바꾸지 않는다)
if (!(await sessionBy(page, 'splitter'))) {
  atrium('spawn', TWO, '--name', 'splitter', '--model', 'haiku', '--allow-herdr');
  await until(async () => { const s = await sessionBy(page, 'splitter'); return s && s.state === 'ready'; }, 90000);
}
const before = new Set((await page.evaluate(() => [...window.__mt.getState().sessions.values()].map((s) => s.name))));
atrium('send', '@splitter', 'Run exactly this one shell command with the Bash tool and nothing else: herdr pane split --current --direction right --no-focus');
const newName = await until(async () => { const names = await page.evaluate(() => [...window.__mt.getState().sessions.values()].map((s) => s.name)); return names.find((n) => !before.has(n)); }, 120000, 1000);
await until(async () => (await docks()).some((x) => x.members.includes(newName)), 20000);
await sleep(1500);
d = await docks();
const sp = await rectOf(page, 'splitter'), nw = await rectOf(page, newName);
log('나눈 패널', newName, '덩어리', d, 'splitter', sp, newName, nw, '오른쪽에 틈 없이', sp.x + sp.w === nw.x && sp.y === nw.y);
const evs = atriumJson('events', newName, '--limit', '10').filter((e) => ['adopted', 'auto_docked', 'auto_dock_skipped'].includes(e.kind)).map((e) => ({ kind: e.kind, data: e.data }));
log('판 이벤트', evs);
await page.evaluate((id) => window.__mt.getState().navigateTo(id), await idOf(page, 'splitter'));
await sleep(1200);
await page.evaluate(() => { const st = window.__mt.getState(); st.setViewport({ ...st.vpNow, zoom: 0.5, x: st.vpNow.x * 0.5 + 400 }); });
await sleep(900);
const marks = await page.evaluate(() => [...document.querySelectorAll('.mt-divider-mark')].map((e) => e.innerText.replace(/\s+/g, ' ')));
log('분할선 위 연결 표시', marks, '선으로 그린 연결 수(덩어리 안 이웃은 빼야 함)', await page.evaluate(() => document.querySelectorAll('.react-flow__edge').length));
await shot(page, 'h5-7-agent-split-docked', log);
log('splitter 노드 글', await nodeText(page, 'splitter'));
log('창 오류', errors);
await closeApp(app);
process.exit(0);
