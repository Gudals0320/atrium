// P266 단위 시험: 세션 맵 동료 선이 카드를 지나지 않는다. 먼저 배치(동료 묶음을 이웃한 사슬로), 남는 쌍은 칸 오른쪽 통로로 우회. PC·휴대폰 같은 규칙.
import test from 'node:test';
import assert from 'node:assert/strict';
import { lineageLayout, peerChain, peerDetours, ptsHitBox, peerPts, LINE, PEERDET } from '../src/renderer/lib/mission-lineage.js';

const A = 'd:/w/app';
// S: [이름, 부모, 동료들]. 만든 차례 = 목록 차례
const graph = (S, ws = A) => ({
  nodes: S.map(([name, parent, peers = []], i) => ({ id: 's:' + name, kind: 'session', sessionId: 'x-' + name, name, workspaceKey: ws, state: 'sleeping', parentId: parent ? 's:' + parent : null, createdAt: i + 1, peers: peers.map((p) => 's:' + p) })),
  edges: S.filter((x) => x[1]).map(([name, parent]) => ({ from: 's:' + parent, to: 's:' + name, kind: 'spawn', count: 1 })),
});
// 동료는 양쪽에 적는다(판 계약)
const sym = (S) => { const m = new Map(S.map((x) => [x[0], new Set(x[2] || [])])); for (const [n, ps] of m) for (const p of ps) m.get(p).add(n); return S.map(([n, p]) => [n, p, [...m.get(n)]]); };
const lay = (S, o = {}) => lineageLayout(graph(sym(S)), { noFolder: 'No folder', routing: true, ...o });
const ids = (l, xs) => xs.map((x) => l.cards.get('s:' + x));
const peerEdge = (l, a, b) => l.edges.find((e) => e.peer && [e.from, e.to].sort().join('|') === ['s:' + a, 's:' + b].sort().join('|'));
// 어떤 선(나무·동료·계보·다른 워크스페이스)도 양끝 아닌 카드를 지나지 않는다
const noHit = (l) => { for (const e of l.edges) for (const [id, c] of l.cards) if (id !== e.from && id !== e.to) assert.ok(!ptsHitBox(e.pts, c), `${e.id} 선이 ${id} 카드를 지난다`); };
const straight = (e) => e.pts.length === 2 && e.pts[0][0] === e.pts[1][0];
// 같은 칸에서 위아래로 바로 이웃(사이에 다른 카드 없음)
const adjacent = (l, a, b) => { const [p, q] = ids(l, [a, b]).sort((x, y) => x.y - y.y); return p.x === q.x && ![...l.cards.values()].some((c) => c !== p && c !== q && c.x === p.x && c.y > p.y && c.y < q.y); };
const yOrder = (l, xs) => xs.slice().sort((a, b) => l.cards.get('s:' + a).y - l.cards.get('s:' + b).y);

test('P266 peerChain: 묶음은 첫 세션 자리에 붙고, 안은 사슬, 나머지 차례는 그대로', () => {
  const P = (pairs) => { const s = new Set(pairs.flatMap(([a, b]) => [a + b, b + a])); return (a, b) => s.has(a + b); };
  assert.deepEqual(peerChain(['a', 'x', 'b', 'y'], P([['a', 'b']])), ['a', 'b', 'x', 'y']);
  // 사슬 a-c-b(만든 차례 a, b, c): a와 b는 동료가 아니므로 a, c, b
  assert.deepEqual(peerChain(['a', 'b', 'x', 'c'], P([['a', 'c'], ['c', 'b']])), ['a', 'c', 'b', 'x']);
  // 서로 다 동료: 만든 차례 그대로
  assert.deepEqual(peerChain(['a', 'b', 'c'], P([['a', 'b'], ['b', 'c'], ['a', 'c']])), ['a', 'b', 'c']);
  // 별(가운데 c): 이웃 쌍은 둘이 최대, 같은 점수면 만든 차례에 가까운 것(a, b, c, d: b-c, c-d)
  assert.deepEqual(peerChain(['a', 'b', 'c', 'd'], P([['a', 'c'], ['b', 'c'], ['d', 'c']])), ['a', 'b', 'c', 'd']);
  // 묶음 둘
  assert.deepEqual(peerChain(['a', 'x', 'b', 'c', 'y', 'd'], P([['a', 'b'], ['c', 'd']])), ['a', 'b', 'x', 'c', 'd', 'y']);
  // 큰 묶음(욕심): 긴 사슬도 모두 이웃
  const L = 'abcdefghijk'.split(''), pairs = L.slice(1).map((x, i) => [L[i], x]);
  const out = peerChain(L.slice().reverse(), P(pairs));
  assert.equal(out.length, L.length);
  for (let i = 1; i < out.length; i++) assert.ok(P(pairs)(out[i - 1], out[i]), out.join(''));
});

test('P266 동료 둘 사이에 다른 하위가 있으면 배치로 붙여 곧은 선(나무 차례·칸은 그대로)', () => {
  const S = [['lead'], ['a', 'lead', ['b']], ['x', 'lead'], ['b', 'lead'], ['y', 'lead']];
  for (const phone of [false, true]) {
    const l = lay(S, { phone });
    assert.deepEqual(yOrder(l, ['a', 'x', 'b', 'y']), ['a', 'b', 'x', 'y'], 'phone ' + phone);
    assert.ok(adjacent(l, 'a', 'b'));
    const e = peerEdge(l, 'a', 'b');
    assert.ok(straight(e) && !e.detour);
    for (const n of ['a', 'x', 'b', 'y']) assert.equal(l.cards.get('s:' + n).depth, 1);
    noHit(l);
  }
});

test('P266 동료 셋 사슬(동료의 동료)은 이웃한 차례, 선 둘 다 곧다', () => {
  const S = [['lead'], ['a', 'lead', ['c']], ['b', 'lead'], ['x', 'lead'], ['c', 'lead', ['b']]];
  for (const phone of [false, true]) {
    const l = lay(S, { phone });
    assert.deepEqual(yOrder(l, ['a', 'b', 'c', 'x']), ['a', 'c', 'b', 'x']);
    for (const [p, q] of [['a', 'c'], ['c', 'b']]) { assert.ok(adjacent(l, p, q)); assert.ok(straight(peerEdge(l, p, q))); }
    noHit(l);
  }
});

test('P266 셋이 서로 다 동료: 이웃 둘은 곧고, 남는 쌍은 칸 오른쪽 통로로 우회', () => {
  const S = [['lead'], ['a', 'lead', ['b', 'c']], ['x', 'lead'], ['b', 'lead', ['c']], ['c', 'lead']];
  for (const phone of [false, true]) {
    const l = lay(S, { phone });
    assert.deepEqual(yOrder(l, ['a', 'b', 'c', 'x']), ['a', 'b', 'c', 'x']);
    assert.ok(straight(peerEdge(l, 'a', 'b')) && straight(peerEdge(l, 'b', 'c')));
    const e = peerEdge(l, 'a', 'c'), a = l.cards.get('s:a');
    assert.ok(e.detour, '우회');
    assert.equal(e.pts.length, 4);
    const lx = e.pts[1][0];
    assert.ok(lx > a.x + a.w && lx < a.x + a.w + (phone ? 56 : LINE.GX) / 2, '통로는 칸 오른쪽 틈의 나무 줄기 안쪽');
    noHit(l);
  }
});

test('P266 뿌리끼리 동료 사슬(솔로가 섞여 있어도) — 시작 칸에서 이웃, 곧은 선', () => {
  const S = [['p1', null, ['p2']], ['s1'], ['p3', null, ['p2']], ['p2'], ['s2']];
  const l = lay(S);
  assert.deepEqual(yOrder(l, ['p1', 'p2', 'p3']), ['p1', 'p2', 'p3']);
  assert.ok(adjacent(l, 'p1', 'p2') && adjacent(l, 'p2', 'p3'));
  for (const n of ['s1', 's2']) assert.equal(l.cards.get('s:' + n).solo, true);
  noHit(l);
});

test('P266 부모가 다른 같은 단계 동료(사이에 다른 카드): 바깥 우회, 나무 차례 그대로', () => {
  const S = [['r1'], ['a', 'r1', ['d']], ['b', 'r1'], ['r2'], ['c', 'r2'], ['d', 'r2']];
  for (const phone of [false, true]) {
    const l = lay(S, { phone });
    assert.deepEqual(yOrder(l, ['a', 'b', 'c', 'd']), ['a', 'b', 'c', 'd'], '다른 부모 아래 차례는 그대로');
    assert.ok(peerEdge(l, 'a', 'd').detour);
    noHit(l);
  }
});

test('P266 같은 칸 우회 여럿: 세로 구간이 겹치면 다른 통로 줄, 끝점도 겹치지 않는다', () => {
  // a-b-c-d 모두 서로 동료: 사슬 a b c d, 남는 쌍 a-c, a-d, b-d 셋이 우회
  const S = [['lead'], ['a', 'lead', ['b', 'c', 'd']], ['b', 'lead', ['c', 'd']], ['c', 'lead', ['d']], ['d', 'lead']];
  for (const phone of [false, true]) {
    const l = lay(S, { phone });
    const det = l.edges.filter((e) => e.detour);
    assert.equal(det.length, 3);
    const span = (e) => [Math.min(e.pts[1][1], e.pts[2][1]), Math.max(e.pts[1][1], e.pts[2][1])];
    for (let i = 0; i < det.length; i++) for (let j = i + 1; j < det.length; j++) {
      const [p, q] = [span(det[i]), span(det[j])];
      if (p[0] < q[1] && q[0] < p[1]) assert.notEqual(det[i].pts[1][0], det[j].pts[1][0], '겹치는 우회는 다른 줄');
    }
    const ends = det.flatMap((e) => [e.pts[0].join(','), e.pts[3].join(',')]);
    assert.equal(new Set(ends).size, ends.length, '끝점이 겹치지 않는다');
    noHit(l);
  }
});

test('P266 peerDetours: 긴 우회가 바깥 줄, 짧은 것이 안쪽', () => {
  const box = (y) => ({ x: 100, y, w: 200, h: 80 });
  const [outer, inner] = peerDetours([{ u: box(0), d: box(400), ug: 4, dg: 4 }, { u: box(100), d: box(300), ug: 4, dg: 4 }]);
  assert.ok(outer[1][0] > inner[1][0]);
  assert.equal(inner[1][0], 300 + PEERDET.BASE);
  assert.deepEqual(outer[0], [304, PEERDET.TOP]);
});

test('P266 이웃 동료는 전처럼 peerPts 곧은 선', () => {
  const S = [['p1', null, ['p2']], ['p2']];
  const l = lay(S), [u, d] = ids(l, ['p1', 'p2']);
  assert.deepEqual(peerEdge(l, 'p1', 'p2').pts, peerPts(u, d, LINE.EDGEGAP));
});
