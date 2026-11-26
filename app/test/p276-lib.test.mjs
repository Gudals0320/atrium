// P276 단위 시험: 세션 맵에서 merger를 head → 하위 갈림 줄기 위에 얹는다(lib/merger.js mapMergers·rememberParents, lib/mission-lineage.js mergers 배치). PC·휴대폰 같은 규칙.
import test from 'node:test';
import assert from 'node:assert/strict';
import { lineageLayout, ptsHitBox, LINE } from '../src/renderer/lib/mission-lineage.js';
import { mapMergers, rememberParents, mergerViewOf } from '../src/renderer/lib/merger.js';

const A = 'd:/w/app', B = 'd:/w/other';
// S: [이름, 부모, 워크스페이스]. 만든 차례 = 목록 차례
const graph = (S) => ({
  nodes: S.map(([name, parent, ws = A], i) => ({ id: 's:' + name, kind: 'session', sessionId: 'x-' + name, name, workspaceKey: ws, state: 'sleeping', parentId: parent ? 's:' + parent : null, createdAt: i + 1, peers: [] })),
  edges: S.filter((x) => x[1]).map(([name, parent]) => ({ from: 's:' + parent, to: 's:' + name, kind: 'spawn', count: 1 })),
});
const job = (child, parent, merger, state = 'merging', at = 1) => ({ unit: 'u-' + child, state, childId: 'x-' + child, parentId: 'x-' + parent, mergerId: 'x-' + merger, createdAt: at, workspace: A });
const view = (jobs, mergers = ['mg']) => mergerViewOf({ mergers: mergers.map((m) => ({ sessionId: 'x-' + m, open: true, name: m })), jobs });
const lay = (S, mergers, o = {}) => lineageLayout(graph(S), { noFolder: 'No folder', routing: true, mergers, ...o });
const noHit = (l) => { for (const e of l.edges) for (const [id, c] of l.cards) if (id !== e.from && id !== e.to) assert.ok(!ptsHitBox(e.pts, c), `${e.id} 선이 ${id} 카드를 지난다`); };
const overlap = (l) => { const cs = [...l.cards.entries()]; for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) { const [p, a] = cs[i], [q, b] = cs[j]; assert.ok(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y, `${p}·${q} 카드가 겹친다`); } };
const S5 = [['head'], ['p1', 'head'], ['p2', 'head'], ['p3', 'head'], ['p4', 'head'], ['p5', 'head'], ['mg'], ['solo']];

test('P276 mapMergers: head = 열린 일이 가장 많은 부모, 상태는 합치는 중 > 실패 > 줄 섬', () => {
  const v = view([job('a', 'h1', 'mg', 'queued', 1), job('b', 'h2', 'mg', 'merging', 2), job('c', 'h2', 'mg', 'queued', 3)]);
  const [m] = mapMergers(v);
  assert.equal(m.parentId, 'x-h2');
  assert.equal(m.state, 'merging');
  assert.deepEqual(m.kids.map((k) => k.childId), ['x-b', 'x-c']);
  assert.equal(mapMergers(view([job('a', 'h1', 'mg', 'failed')]))[0].state, 'failed');
  assert.equal(mapMergers(view([job('a', 'h1', 'mg', 'queued')]))[0].state, 'queued');
  // 같은 수면 가장 최근 일의 부모
  assert.equal(mapMergers(view([job('a', 'h1', 'mg', 'queued', 5), job('b', 'h2', 'mg', 'queued', 2)]))[0].parentId, 'x-h1');
});

test('P276 열린 일이 없으면 마지막으로 합친 부모(기억)에 흐리게, 모르면 head 없음', () => {
  const v1 = view([job('a', 'h1', 'mg', 'merging', 3)]);
  const mem = rememberParents({}, v1);
  assert.deepEqual(mem['x-mg'], { parentId: 'x-h1', at: 3 });
  assert.equal(rememberParents(mem, v1), mem, '바뀐 것이 없으면 앞 객체');
  const idle = view([]);
  assert.deepEqual(mapMergers(idle, mem)[0], { mergerId: 'x-mg', parentId: 'x-h1', state: 'idle', kids: [], idle: true });
  assert.equal(mapMergers(idle, {})[0].parentId, null);
  assert.deepEqual(mapMergers(null), []);
});

test('P276 merger는 솔로 쌓음이 아니라 head 카드 바로 위(같은 칸)에 놓이고 줄기에 이어진다', () => {
  for (const phone of [false, true]) {
    const l = lay(S5, mapMergers(view([job('p3', 'head', 'mg', 'merging')])), { phone });
    const h = l.cards.get('s:head'), m = l.cards.get('s:mg');
    assert.equal(m.x, h.x, 'phone ' + phone);
    assert.ok(m.y + m.h <= h.y && m.y + m.h >= h.y - 60, '바로 위');
    assert.ok(!m.solo && m.merger && m.merger.head === 's:head');
    assert.ok(l.cards.get('s:solo').solo, '다른 솔로는 그대로');
    assert.ok(!l.seq.get(A).solos.includes('s:mg'));
    const e = l.edges.find((x) => x.merger);
    assert.equal(e.from, 's:mg'); assert.equal(e.to, 's:head'); assert.equal(e.state, 'merging');
    // 줄기 x = head 오른쪽 + GX/2
    const gx = phone ? 56 : LINE.GX;
    assert.equal(e.pts[1][0], h.x + h.w + gx / 2);
    assert.equal(e.pts[0][1], m.y + m.h / 2);
    // 합치는 하위로 가는 나무 선만 밝다
    assert.ok(l.edges.find((x) => x.tree && x.to === 's:p3').merging);
    assert.ok(!l.edges.find((x) => x.tree && x.to === 's:p1').merging);
    noHit(l); overlap(l);
  }
});

test('P276 하위 하나뿐이면 head 위 자리를 비워 가지째 내리고, 하위가 없으면 head 위 가운데로 세로 선', () => {
  for (const phone of [false, true]) {
    const l = lay([['x'], ['x1', 'x'], ['head'], ['p1', 'head'], ['mg']], mapMergers(view([job('p1', 'head', 'mg')])), { phone });
    const m = l.cards.get('s:mg'), h = l.cards.get('s:head');
    assert.ok(m.y + m.h <= h.y); assert.equal(m.x, h.x);
    const e = l.edges.find((x) => x.merger);
    assert.equal(e.pts.length, 3, '줄기 위 끝까지 세로'); assert.equal(e.pts[2][1], h.y + h.h / 2);
    noHit(l); overlap(l);
    // 하위 없음(head가 하위를 불렀던 세션)
    const g = graph([['head'], ['mg']]); g.nodes[0].closedKids = 2;
    const l2 = lineageLayout(g, { noFolder: 'n', mergers: mapMergers(view([], ['mg']), { 'x-mg': { parentId: 'x-head', at: 1 } }), phone });
    const e2 = l2.edges.find((x) => x.merger);
    assert.ok(e2.idle);
    assert.equal(e2.pts[0][0], e2.pts[1][0]);
    assert.ok(l2.cards.get('s:mg').y < l2.cards.get('s:head').y);
    overlap(l2);
  }
});

test('P276 head 둘: 열린 일이 많은 쪽, 각자 merger 둘이면 각자 위', () => {
  const S = [['h1'], ['a1', 'h1'], ['a2', 'h1'], ['h2'], ['b1', 'h2'], ['mg'], ['mg2']];
  const v = view([job('a1', 'h1', 'mg', 'queued', 1), job('b1', 'h2', 'mg2', 'merging', 2)], ['mg', 'mg2']);
  const l = lay(S, mapMergers(v));
  assert.equal(l.cards.get('s:mg').merger.head, 's:h1');
  assert.equal(l.cards.get('s:mg2').merger.head, 's:h2');
  assert.equal(l.cards.get('s:mg2').x, l.cards.get('s:h2').x);
  noHit(l); overlap(l);
});

test('P276 head가 맵에 없거나 다른 워크스페이스면 지금처럼 솔로, 꼬리표 자료는 남는다', () => {
  const l = lay([['head', null, B], ['p1', 'head', B], ['mg']], mapMergers(view([job('p1', 'head', 'mg')])));
  assert.ok(l.cards.get('s:mg').solo);
  assert.ok(!l.edges.some((e) => e.merger));
  const l2 = lay([['mg']], mapMergers(view([job('p1', 'gone', 'mg')])));
  assert.ok(l2.cards.get('s:mg').solo && l2.cards.get('s:mg').merger);
  // P374: PC는 깊은 가지도 접지 않으니 깊은 head(5단계) 위에도 얹는다
  const deep = [['r'], ['d1', 'r'], ['d2', 'd1'], ['d3', 'd2'], ['d4', 'd3'], ['d5', 'd4'], ['d6', 'd5'], ['mg']];
  const l3 = lay(deep, mapMergers(view([job('d6', 'd5', 'mg')])));
  assert.ok(l3.cards.has('s:d5') && l3.cards.has('s:d6'));
  assert.ok(!l3.cards.get('s:mg').solo);
  assert.equal(l3.cards.get('s:mg').x, l3.cards.get('s:d5').x, 'head 위 같은 칸');
  overlap(l3);
});

test('P276 merger가 없으면 배치는 그대로', () => {
  const a = lay(S5, null), b = lay(S5, []);
  for (const [id, c] of a.cards) { assert.equal(b.cards.get(id).x, c.x); assert.equal(b.cards.get(id).y, c.y); }
  assert.ok(a.cards.get('s:mg').solo && !a.cards.get('s:mg').merger);
});
