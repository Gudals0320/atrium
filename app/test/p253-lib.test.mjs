// P253 창 단위 시험: 줌(이름표 계단)에 따라 열이 바뀌지 않음(창 크기만).
// (rig 한 줄 차례·주기 말 시험은 P269가 rig를 걷어 내며 지웠다)
import test from 'node:test';
import assert from 'node:assert/strict';
import { lineageLayout, pickColumns, todayWorkspaces } from '../src/renderer/lib/mission-lineage.js';

// ---- 줌에 따라 열이 바뀌지 않는다(창 크기만) ----
const MID = new Date(2026, 10, 17, 0, 0, 0).getTime(), NOON = MID + 12 * 3600e3, OLD = MID - 3 * 86400e3;
const FOLDERS = [
  { id: 'gz', name: 'zeta', members: ['d:/w/z1', 'd:/w/z2'] }, { id: 'ga', name: 'Alpha', members: ['d:/w/a2', 'd:/w/a10', 'd:/w/a1'] },
  { id: 'gn', name: '나무', members: ['d:/w/n1'] }, { id: 'gb', name: 'beta', members: ['d:/w/b1'] }, { id: 'gk', name: '가람', members: ['d:/w/k1'] },
];
const S = [
  ['z-lead', 'd:/w/z1', null, MID + 3600e3], ['z-kid', 'd:/w/z1', 'z-lead', OLD], ['z2-solo', 'd:/w/z2', null, OLD],
  ['a1', 'd:/w/a1', null, OLD], ['a2', 'd:/w/a2', null, OLD], ['a10-lead', 'd:/w/a10', null, OLD], ['a10-kid', 'd:/w/a10', 'a10-lead', OLD], ['a10-kid2', 'd:/w/a10', 'a10-lead', OLD],
  ['n1', 'd:/w/n1', null, OLD, 'working'], ['n1-peer', 'd:/w/n1', null, OLD], ['b1', 'd:/w/b1', null, OLD], ['b1-x', 'd:/w/b1', 'z-lead', OLD],
  ['k1', 'd:/w/k1', null, OLD], ['k1-2', 'd:/w/k1', null, OLD], ['k1-3', 'd:/w/k1', null, OLD], ['loose1', 'd:/w/loose', null, MID + 10], ['old-loose', 'd:/w/old', null, OLD],
];
const G = { nodes: S.map(([name, ws, parent, activeAt, state], i) => ({ id: 's:' + name, kind: 'session', sessionId: 'x-' + name, name, workspaceKey: ws, state: state || 'sleeping', parentId: parent ? 's:' + parent : null, createdAt: i + 1, activeAt })), edges: S.filter((x) => x[2]).map(([name, , parent]) => ({ from: 's:' + parent, to: 's:' + name, kind: 'spawn', count: 1 })) };
const TODAY = todayWorkspaces(G.nodes, { now: NOON, tierOf: (n) => (n.state === 'working' ? 'work' : 'rest') });
const BASE = { vgroups: FOLDERS, today: TODAY, noFolder: 'No folder', routing: false, columns: 'auto' };
const LABELS = [1, 0.6, 0.35, 0.18];

test('P253 줌 버그: 열 수는 이름표 계단(줌)으로 바뀌지 않고 보기 칸(창 크기)으로만 바뀐다', () => {
  // 고치기 전 판단(그 계단의 한 열 배치로 잼)은 이 창에서 줌에 따라 한 열·두 열이 바뀌었다
  const view = { w: 1600, h: 1200 }; // P260: 솔로 칸이 빠져 한 열 폭이 줄었다(옛 1600×800은 더 버그를 만들지 않는다)
  // (P374: 옛 두 열 판단은 걷었다. 버그 재현 대신 지금 판단이 줌과 상관없는지만 본다)
  void pickColumns;
  const now = LABELS.map((label) => lineageLayout(G, { ...BASE, label, view }).ncol);
  assert.equal(new Set(now).size, 1, '고친 뒤: ' + now.join(''));
  // 여러 창 크기에서 줌을 바꿔도 열 수가 같다
  for (let w = 700; w <= 2600; w += 300) for (let h = 400; h <= 1800; h += 350) {
    const ns = LABELS.map((label) => lineageLayout(G, { ...BASE, label, view: { w, h } }).ncol);
    assert.equal(new Set(ns).size, 1, `${w}x${h}: ${ns.join('')}`);
  }
  // 창 크기가 바뀌면 다시 정한다(넓고 낮은 창 = 두 열, 좁은 창 = 한 열)
  // P374: 창 비가 바뀌면 다시 정한다(넓은 창 = 판도 넓적하게, 목표 비가 아주 길쭉하면 한 열)
  assert.ok(lineageLayout(G, { ...BASE, view: { w: 2600, h: 600 } }).ncol >= lineageLayout(G, { ...BASE, view: { w: 700, h: 1800 } }).ncol);
  assert.equal(lineageLayout(G, { ...BASE, view: { w: 700, h: 1800 }, aspect: 0.2 }).ncol, 1);
});
