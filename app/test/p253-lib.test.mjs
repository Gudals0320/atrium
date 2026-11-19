// P253 창 단위 시험: 한 줄 차례(rowOrder), 줌(이름표 계단)에 따라 열이 바뀌지 않음(창 크기만), 주기 말과 사전.
// (지도 배치 mapLayout·placeMaps·접기·카드 줄·띠 글 시험은 P254가 세션 맵 rig를 시안 V7 꼴로 워크스페이스 줄 안에 옮기며 지웠다. 새 시험은 test/p254-lib.test.mjs)
import test from 'node:test';
import assert from 'node:assert/strict';
import { rowOrder, periodText } from '../src/renderer/lib/rig-map.js';
import { lineageLayout, pickColumns, todayWorkspaces } from '../src/renderer/lib/mission-lineage.js';
import ko from '../src/renderer/locales/ko.js';
import en from '../src/renderer/locales/en.js';

// rig-trade 모양(역할 넷, 길 아홉, 사람 입력 셋, 박자 data, trade는 따로 박자). 이름만 같고 모델 등은 시험 값
const FLOWS = [
  { item: 'seed', from: ['human'], to: ['ideas'] },
  { item: 'hypothesis', from: ['ideas'], to: ['verify'] },
  { item: 'result', from: ['verify'], to: ['ideas'], for: 'hypothesis' },
  { item: 'data_request', from: ['ideas', 'human'], to: ['data'] },
  { item: 'data_reply', from: ['data'], to: ['ideas'], for: 'data_request' },
  { item: 'dataset', from: ['data'], to: ['verify'] },
  { item: 'strategy', from: ['verify'], to: ['trade'] },
  { item: 'live_report', from: ['trade'], to: ['verify'], for: 'strategy' },
  { item: 'halt', from: ['human'], to: ['trade'] },
];
test('P253 rowOrder: 이웃한 쌍이 가장 많은 한 줄 차례, 같은 값이면 박자 역할 앞(rig-trade = data, ideas, verify, trade)', () => {
  const names = ['data', 'ideas', 'verify', 'trade'];
  assert.deepEqual(rowOrder(names, FLOWS, { beatRole: 'data' }), ['data', 'ideas', 'verify', 'trade']);
  // 정의 차례가 달라도 같다
  assert.deepEqual(rowOrder(['trade', 'verify', 'ideas', 'data'], FLOWS, { beatRole: 'data' }), ['data', 'ideas', 'verify', 'trade']);
  // 앞으로 가는 길이 왼쪽 → 오른쪽: 사슬 a → b → c는 박자 없이도 a, b, c
  assert.deepEqual(rowOrder(['c', 'b', 'a'], [{ item: 'x', from: ['a'], to: ['b'] }, { item: 'y', from: ['b'], to: ['c'] }]), ['a', 'b', 'c']);
});

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
  const view = { w: 1600, h: 800 };
  const old = LABELS.map((label) => pickColumns(lineageLayout(G, { ...BASE, columns: 1, label }).measure, view));
  assert.ok(new Set(old).size > 1, '버그를 다시 만든다: ' + old.join(''));
  const now = LABELS.map((label) => lineageLayout(G, { ...BASE, label, view }).ncol);
  assert.equal(new Set(now).size, 1, '고친 뒤: ' + now.join(''));
  // 여러 창 크기에서 줌을 바꿔도 열 수가 같다
  for (let w = 700; w <= 2600; w += 300) for (let h = 400; h <= 1800; h += 350) {
    const ns = LABELS.map((label) => lineageLayout(G, { ...BASE, label, view: { w, h } }).ncol);
    assert.equal(new Set(ns).size, 1, `${w}x${h}: ${ns.join('')}`);
  }
  // 창 크기가 바뀌면 다시 정한다(넓고 낮은 창 = 두 열, 좁은 창 = 한 열)
  assert.equal(lineageLayout(G, { ...BASE, view: { w: 2600, h: 600 } }).ncol, 2);
  assert.equal(lineageLayout(G, { ...BASE, view: { w: 700, h: 1800 } }).ncol, 1);
});

test('P253 주기 말(P252 periodText와 같은 꼴)과 두 사전의 rigMap2·rigPeriod 열쇠', () => {
  const t = (k, v = {}) => { const o = k.split('.').reduce((a, x) => (a ? a[x] : undefined), ko); return String(o).replace(/\{(\w+)\}/g, (_, x) => v[x]); };
  assert.equal(periodText('1d', '07:30', t), '매일 07:30');
  assert.equal(periodText('5m', null, t), '5분마다');
  assert.equal(periodText('1h', null, t), '매시간');
  assert.equal(t('rigMap2.beatCycle', { period: periodText('1d', '07:30', t) }), '매일 07:30에 사이클을 연다');
  const keys = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' && !('one' in v) ? keys(v, p + k + '.') : [p + k]));
  assert.deepEqual(keys(ko.rigMap2).sort(), keys(en.rigMap2).sort());
  assert.deepEqual(keys(ko.rigPeriod).sort(), keys(en.rigPeriod).sort());
});
