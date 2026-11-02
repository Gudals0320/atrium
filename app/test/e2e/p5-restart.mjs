// P5 완료 기준 5(뒷부분): 창과 백엔드를 다시 띄워도 워크스페이스, 배치, 마지막에 본 워크스페이스가 남는다. MT_E2E_OUT=p5
// (앞부분, P4 board.db 옮기기는 atrium로 확인했다: experiments/p5/m1-*)
import { shot, logger, closeApp } from './harness.mjs';
import { launch, view, wsBar, clickWs, allInside, atrium, sleep } from './p5-lib.mjs';

const log = logger('p5-restart');
const snap = (page) => page.evaluate(() => {
  const st = window.__mt.getState();
  return {
    current: (st.workspaces.find((w) => w.key === st.currentWs) || {}).name,
    workspaces: st.workspaces.map((w) => w.name),
    nodes: [...st.nodes].map(([id, r]) => `${(st.sessions.get(id) || {}).name}@${(st.sessions.get(id) || {}).workspaceKey}:${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.w)}x${Math.round(r.h)}`).sort(),
    groups: [...st.groups.values()].map((g) => `${g.name}@${g.workspaceKey}:${g.x},${g.y}`),
    links: [...st.links.values()].map((l) => `${l.fromName}->${l.toName}:${l.role || ''}`).sort(),
  };
});

let { app, page } = await launch({ log });
await sleep(1200);
await clickWs(page, 'r1');
const before = await snap(page);
log('다시 띄우기 전', before);
await shot(page, 'm2-before-restart', log);
await closeApp(app);
log('창 닫음. 백엔드 끄기', atrium('backend', 'stop').replace(/\s+/g, ' '));
await sleep(1500);

({ app, page } = await launch({ log })); // 창이 백엔드를 다시 띄운다
await sleep(2500);
const after = await snap(page);
log('다시 띄운 뒤', after);
log('같은가', { current: before.current === after.current, workspaces: JSON.stringify(before.workspaces) === JSON.stringify(after.workspaces), nodes: JSON.stringify(before.nodes) === JSON.stringify(after.nodes), groups: JSON.stringify(before.groups) === JSON.stringify(after.groups), links: JSON.stringify(before.links) === JSON.stringify(after.links) });
log('들어간 판', await view(page), '모두 화면 안', (await allInside(page)).every((x) => x.inside));
log('워크스페이스 줄', await wsBar(page));
await shot(page, 'm3-after-restart', log);
await closeApp(app);
process.exit(0);
