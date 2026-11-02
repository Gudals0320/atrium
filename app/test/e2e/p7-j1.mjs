// P7 J1 창 시험: 창·백엔드·herdr를 끄고 다시 켜도 판의 세션(claude, 셸, 판에 올린 에이전트, 다른 종류)이 같은 자리·덩어리·그룹·연결로 돌아오는지.
// 단계(인자 하나): graceful(창 닫기 → atrium herdr stop → backend stop → 창 열기), kill(herdr와 백엔드를 PID로 강제 종료 → 창 열기),
//   lost(백엔드가 꺼진 동안 셸 하나와 판에 올린 claude 하나의 패널을 없애고 herdr를 끔 = herdr가 저장 전에 죽어 패널을 잃은 것과 같음 → 창 열기),
//   gone(herdr는 그대로, 백엔드가 꺼진 동안 셸 하나의 작업 공간을 판 밖에서 닫음 → 창 열기: 닫힘으로 남는다)
// 직접 띄운 이 판의 프로세스만 PID로 끈다. 사용(app 폴더에서): MT_E2E_OUT=p7 node test/e2e/p7-j1.mjs <단계>
import { execFileSync } from 'node:child_process';
import { launch, closeApp, shot, logger, sleep, until, atrium, tool, writeJson, sidebarRows } from './p7-lib.mjs';

const phase = process.argv[2];
if (!['graceful', 'kill', 'lost', 'gone'].includes(phase)) throw new Error('단계: graceful | kill | lost | gone');
const log = logger(`p7-j1-${phase}`);

const capture = (page) => page.evaluate(() => {
  const st = window.__mt.getState();
  const name = (id) => (st.sessions.get(id) || {}).name || id.slice(0, 8);
  const sessions = Object.fromEntries([...st.sessions.values()].map((s) => [s.name, { id: s.sessionId.slice(0, 8), kind: s.kind, origin: s.origin, state: s.state, exit: s.exit && s.exit.kind, pane: s.paneId, recovered: s.recovered && s.recovered.plan, interrupted: !!s.interruptedTurn }]));
  const nodes = Object.fromEntries([...st.nodes].filter(([id]) => st.sessions.has(id)).map(([id, r]) => [name(id), [Math.round(r.x), Math.round(r.y), Math.round(r.w), Math.round(r.h)]]));
  const docks = [...st.docks.values()].map((d) => `${d.dir}:${d.members.map(name).join('+')}`).sort();
  const groups = [...st.groups.values()].map((g) => `${g.name}:${(g.members || []).map(name).sort().join('+')}`).sort();
  const links = [...st.links.values()].map((l) => `${l.fromName}>${l.toName}:${l.role || (l.spawned ? 'spawned' : 'observed')}`).sort();
  return { sessions, nodes, docks, groups, links };
});
const settle = async (page, { minMs = 25000, maxMs = 120000 } = {}) => {
  const t0 = Date.now(); let calm = 0;
  while (Date.now() - t0 < maxMs) {
    const busy = await page.evaluate(() => [...window.__mt.getState().sessions.values()].filter((s) => s.state === 'starting').map((s) => s.name));
    calm = busy.length ? 0 : calm + 1;
    if (calm >= 5 && Date.now() - t0 >= minMs) return Date.now() - t0;
    await sleep(1000);
  }
  return Date.now() - t0;
};
const herdrPid = () => JSON.parse(tool('herdr-ctl.mjs', 'pid')).pid;
const backendPid = () => { try { return JSON.parse(atrium('backend', 'status', '--json')).pid; } catch { return null; } };
const h = (method, params) => JSON.parse(tool('mt.cjs', 'h', method, JSON.stringify(params)));

let { app, page } = await launch({ log });
let before;
const plan = {};
try {
  await page.evaluate(() => window.__mt.getState().fitAll(0));
  await sleep(1500);
  before = await capture(page);
  await shot(page, `j1-${phase}-1-before`, log);
  log('before', JSON.stringify(before));
  if (phase === 'lost') {
    plan.shell = Object.entries(before.sessions).find(([n, s]) => s.kind === 'shell' && s.origin === 'board' && n === 'sh2');
    plan.agent = Object.entries(before.sessions).find(([n, s]) => s.origin === 'adopted' && s.kind === 'claude' && n === 'helper2');
    if (!plan.shell || !plan.agent) throw new Error('sh2(판이 띄운 셸)와 helper2(판에 올린 claude)가 있어야 한다');
  }
  if (phase === 'gone') { plan.shell = Object.entries(before.sessions).find(([n, s]) => s.kind === 'shell' && n === 'sh3'); if (!plan.shell) throw new Error('sh3이 있어야 한다'); }
} finally { await closeApp(app); }

// 끄기
const hp = herdrPid(), bp = backendPid();
log('down', phase, JSON.stringify({ herdrPid: hp, backendPid: bp }));
if (phase === 'graceful') {
  log(atrium('herdr', 'stop', '--yes').trim().replace(/\s+/g, ' '));
  log(atrium('backend', 'stop').trim().replace(/\s+/g, ' '));
} else if (phase === 'kill') {
  for (const pid of [hp, bp]) execFileSync('taskkill', ['/PID', String(pid), '/F'], { stdio: 'ignore' });
} else {
  log(atrium('backend', 'stop').trim().replace(/\s+/g, ' '));
  const panes = h('pane.list', {}).panes || [];
  const paneOf = (p) => panes.find((x) => x.pane_id === p);
  if (phase === 'lost') {
    const shPane = paneOf(plan.shell[1].pane), agPane = paneOf(plan.agent[1].pane);
    log('lose panes', JSON.stringify({ sh2: shPane && shPane.pane_id, helper2: agPane && agPane.pane_id }));
    h('workspace.close', { workspace_id: shPane.workspace_id });
    h('pane.close', { pane_id: agPane.pane_id });
    await sleep(800);
    log(tool('herdr-ctl.mjs', 'stop').trim());
  } else {
    const shPane = paneOf(plan.shell[1].pane);
    log('close sh3 workspace outside board', shPane.workspace_id);
    h('workspace.close', { workspace_id: shPane.workspace_id });
  }
}
await sleep(1500);

// 다시 켜기: 창이 백엔드를, 백엔드가 herdr를 띄운다
({ app, page } = await launch({ log }));
let after;
try {
  const ms = await settle(page, { minMs: phase === 'gone' ? 8000 : 25000 });
  await page.evaluate(() => window.__mt.getState().fitAll(0));
  await sleep(1500);
  after = await capture(page);
  log('after', `${ms}ms`, JSON.stringify(after));
  await shot(page, `j1-${phase}-2-after`, log);
  // 비교: 같은 이름의 세션이 같은 자리, 같은 덩어리·그룹·연결
  const gone = Object.keys(before.sessions).filter((n) => !after.sessions[n]);
  const moved = Object.keys(before.nodes).filter((n) => after.nodes[n] && JSON.stringify(after.nodes[n]) !== JSON.stringify(before.nodes[n]));
  const notReady = Object.entries(after.sessions).filter(([, s]) => !['ready', 'shell_idle', 'waiting', 'working'].includes(s.state)).map(([n, s]) => `${n}:${s.state}${s.exit ? `(${s.exit})` : ''}`);
  const cmp = { gone, moved, notReady, docksSame: JSON.stringify(before.docks) === JSON.stringify(after.docks), groupsSame: JSON.stringify(before.groups) === JSON.stringify(after.groups), linksSame: JSON.stringify(before.links) === JSON.stringify(after.links), recovered: Object.fromEntries(Object.entries(after.sessions).filter(([, s]) => s.recovered).map(([n, s]) => [n, s.recovered])), panesChanged: Object.keys(after.sessions).filter((n) => before.sessions[n] && before.sessions[n].pane !== after.sessions[n].pane) };
  // 닫힘으로 남은 세션(사이드바)
  if (!(await page.locator('.mt-sidebar').count())) await page.click('[data-action="sidebar"]');
  await page.waitForSelector('.mt-sb-row', { timeout: 20000 });
  for (const b of await page.locator('.mt-sb-ws.collapsed [data-action="fold"]').all()) await b.click(); // 접힌 묶음을 편다
  await sleep(1500);
  cmp.closedApi = (await page.evaluate(() => window.__mt.api.call('recall.closed'))).map((c) => `${c.name}:${c.reason}`);
  cmp.closedInSidebar = (await sidebarRows(page)).flatMap((w) => (w.sections.closed || []).map((r) => `${w.ws}/${r.name}`));
  await shot(page, `j1-${phase}-3-sidebar`, log);
  writeJson(`p7-j1-${phase}.json`, { before, after, cmp });
  log('비교', JSON.stringify(cmp));
} finally { await closeApp(app); }
process.exit(0);
