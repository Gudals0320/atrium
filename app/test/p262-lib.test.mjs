// P262: 캔버스 rig 칩이 자리가 없으면 줄이거나 숨긴다(보통 연결처럼), 4~6역할 켤 때·정리 배치가 줄·열이 맞고 덩어리를 가로지르는 긴 선이 없다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { placeGap, GRID_TIDY, angleOk, lineAngle } from '../../backend/src/rig-map-layout.mjs';
import { gridPlace, faceEnds, segHitsRect, rigEdges, rigCanvasLines, rigCurve, rigHead, bezAt, RIG_EDGE, BUILDER_ROLE } from '../src/renderer/lib/rig-map.js';

const L = (f) => ({ ...f, from: [].concat(f.from), to: [].concat(f.to) });
const TRI = { roles: ['data', 'ideas', 'verify'], flows: [{ item: 'snapshot', from: 'data', to: 'ideas' }, { item: 'hypothesis', from: 'ideas', to: 'verify' }, { item: 'result', from: 'verify', to: 'ideas', for: 'hypothesis' }, { item: 'data_request', from: 'verify', to: 'data' }].map(L) };
const FIVE = { roles: ['data', 'ideas', 'news', 'verify', 'report'], flows: [{ item: 'snapshot', from: 'data', to: ['ideas', 'news'] }, { item: 'hypothesis', from: 'ideas', to: 'verify' }, { item: 'result', from: 'verify', to: 'ideas', for: 'hypothesis' }, { item: 'brief', from: 'news', to: 'report' }, { item: 'finding', from: 'verify', to: 'report' }].map(L) };
const FOUR = { roles: ['a', 'b', 'c', 'd'], flows: [{ item: 'x', from: 'a', to: 'b' }, { item: 'y', from: 'b', to: 'c' }, { item: 'z', from: 'c', to: 'd' }].map(L) };
const SIX = { roles: ['a', 'b', 'c', 'd', 'e', 'f'], flows: [{ item: 'x', from: 'a', to: ['b', 'c'] }, { item: 'y', from: 'b', to: 'd' }, { item: 'z', from: 'c', to: 'e' }, { item: 'w', from: 'd', to: 'f' }, { item: 'v', from: 'e', to: 'f' }].map(L) };
const W = 1440, H = 810;
function placed(c) {
  const { GX, GY } = placeGap(W, H);
  const g = gridPlace(c.roles, c.flows, { W, H, GX, GY });
  const rects = new Map();
  for (const [k, v] of g.cells) rects.set(k === '@builder' ? 'b1' : 's-' + k, { x: Math.round(v.c * g.colStep), y: Math.round(v.r * g.rowStep), w: W, h: H });
  return { g, rects };
}
const MAP = (c) => ({ workspace: 'w', status: 'on', name: 't', roles: c.roles.map((name) => ({ name, session: { sessionId: 's-' + name } })), flows: c.flows.map((f, i) => ({ i, ...f, for: f.for || null, waiting: 0, openReturns: 0, last: [] })), raises: [], builder: { sessionId: 'b1' } });
const SESS = (c) => new Map([...c.roles.map((r) => ['s-' + r, { sessionId: 's-' + r, workspaceKey: 'w', rigRole: r }]), ['b1', { sessionId: 'b1', workspaceKey: 'w', rigRole: BUILDER_ROLE }]]);

test('P262 gridPlace 4~6역할: 선이 노드를 지나지 않고 허용 각도, 덩어리를 가로지르는 긴 선 없음(≤ 칸 간격 하나), 역할 열이 맞는다. 3역할 삼각형은 그대로', () => {
  for (const [name, c] of Object.entries({ FOUR, FIVE, SIX })) {
    const t0 = Date.now();
    const { g, rects } = placed(c);
    assert.ok(Date.now() - t0 < 3000, name + ' 시간');
    const SX = g.colStep;
    const pairs = new Set(); for (const f of c.flows) for (const x of f.from) for (const y of f.to) pairs.add([x, y].sort().join('|'));
    for (const k of pairs) {
      const [x, y] = k.split('|').map((r) => 's-' + r);
      const [p, q] = faceEnds(rects.get(x), rects.get(y));
      assert.ok(angleOk(lineAngle(p, q)), name + ' ' + k + ' 각도');
      assert.ok(Math.hypot(q[0] - p[0], q[1] - p[1]) <= SX * GRID_TIDY.LONG + 1, name + ' ' + k + ' 긴 선');
      for (const n of rects.keys()) if (n !== x && n !== y) assert.ok(!segHitsRect(p, q, rects.get(n), 1), name + ' ' + k + '가 ' + n + '을 지난다');
    }
    const cols = new Set(c.roles.map((r) => g.cells.get(r).c));
    assert.ok([...cols].every((v) => Number.isInteger(v)), name + ' 역할은 반 칸 엇갈림 없이 열에 ' + JSON.stringify([...g.cells]));
  }
  const t = placed(TRI).g.cells;
  assert.deepEqual([...t].map(([k, v]) => [k, v.c, v.r]), [['data', 0, 0], ['ideas', 1, 0], ['verify', 0.5, 1], ['@builder', 1.5, 1]]);
});

test('P262 rigCanvasLines: 멀리 볼 때 칩이 노드 사이에 안 들어가면 작은 칩, 그래도 안 되면 칩 없이 선만. 보이는 칩은 모두 겹치지 않는다. 가까이는 온 칩', () => {
  for (const c of [TRI, FIVE]) {
    const { rects } = placed(c);
    const edges = rigEdges([MAP(c)], SESS(c));
    const at = (cs) => [...rigCanvasLines(edges, (id) => rects.get(id), { nodes: [...rects.values()], cs }).values()].flatMap((x) => x.lines);
    const near = at(1);
    assert.ok(near.length && near.every((l) => l.fit === 'full' && l.lab && l.lab.free), '배율 1은 온 칩');
    for (const cs of [4, 8, 12, 24]) {
      const far = at(cs);
      assert.ok(far.every((l) => l.fit === 'hidden' ? !l.lab : l.lab && l.lab.free), 'cs ' + cs + ': 보이는 칩은 자리가 있다 ' + JSON.stringify(far.map((l) => [l.text, l.fit, l.lab && l.lab.free])));
      if (cs >= 24) assert.ok(far.some((l) => l.fit !== 'full'), 'cs ' + cs + ': 줄인 칩이 있다');
    }
  }
});

test('P262 rigHead: 화살촉은 그린 선의 끝 접선(화살촉 밑변 자리의 곡선 접선)을 따르고 모서리 수직이 아니다. 선은 화살촉 밑변에서 멈춘다. 화살촉은 작게(끝 점 크기 가까이)', () => {
  const c = rigCurve([0, 0], 'r', [600, 300], 'l'); // 끝 접선은 모서리 수직(1, 0)
  const len = RIG_EDGE.ARROW, h = rigHead(c.P, len, RIG_EDGE.ARROW_W);
  assert.ok(Math.hypot(h.tip[0] - 600, h.tip[1] - 300) < len * 0.2, '끝은 도착 모서리 자리 가까이');
  // 기대 방향: 그린 선(dLine)의 끝 접선 = 곡선 위 base 자리의 접선
  const tb = bezAt(c.P, h.t0).u, got = Math.atan2(h.u[1], h.u[0]), want = Math.atan2(tb[1], tb[0]);
  assert.ok(Math.abs(got) > 1e-3, '모서리 수직(0도) 그대로가 아니다');
  assert.ok(Math.abs(want - got) * 180 / Math.PI < 1, 'tangent ' + want + ' ' + got);
  // 머리 삼각형: 꼭짓점 → 밑변 가운데 방향 = u
  const n = h.d.match(/-?[\d.]+/g).map(Number), mid = [(n[2] + n[4]) / 2, (n[3] + n[5]) / 2];
  const ang = Math.atan2(n[1] - mid[1], n[0] - mid[0]);
  assert.ok(Math.abs(ang - got) * 180 / Math.PI < 1);
  // 그린 선의 끝 = 화살촉 밑변 가운데
  const e = h.dLine.match(/-?[\d.]+/g).map(Number).slice(-2);
  assert.ok(Math.hypot(e[0] - h.base[0], e[1] - h.base[1]) < 0.02);
  assert.ok(RIG_EDGE.ARROW <= 2.5 * RIG_EDGE.DOT && RIG_EDGE.ARROW_W <= 2 * RIG_EDGE.DOT, '작은 화살촉');
});
