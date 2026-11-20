// P259 창 단위 시험: 캔버스 rig 선을 보통 연결과 같은 곡선·같은 구성으로, 켤 때 배치 간격을 노드 크기에 비례해 넓게,
// 끝점은 모서리 중앙 기준 등간격(나감·들어옴 함께, 엇갈리지 않는 차례), 도착 끝 화살촉, 글 칩이 노드·칩·화살촉과 겹치지 않음.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getBezierPath, Position } from '@xyflow/system';
import { placeGap, PLACE_GAP, angleOk, lineAngle, ANGLE } from '../../backend/src/rig-map-layout.mjs';
import { facingSides } from '../../backend/src/links.mjs';
import { gridPlace, faceEnds, segHitsRect, rigEdges, rigSides, rigPorts, portStep, rigCurve, bezAt, rigCanvasLines, rigLabelSpots, rigLineActive, chipSize, RIG_EDGE, BUILDER_ROLE } from '../src/renderer/lib/rig-map.js';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'renderer');
const read = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');

// rig-trade 모양(역할 넷, 길 아홉)
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
const ROLES = ['data', 'ideas', 'verify', 'trade'];
const role = (name) => ({ name, docN: 1, session: { sessionId: 's-' + name, name: 'trade-' + name, state: 'ready', asleep: false }, sectors: [], tools: [], intake: [] });
const MAP = (roles = ROLES, flows = FLOWS, raises = [{ id: 'r1', role: 'verify' }, { id: 'r2', role: 'ideas' }]) => ({
  workspace: 'C:/w/trade', status: 'on', name: 'rig-trade', versionN: 1, head: { cycle: 1, beat: { every: '1d', role: roles[0] } },
  builder: { sessionId: 'b1' }, raises, roles: roles.map(role),
  flows: flows.map((f, i) => ({ i, ...f, for: f.for || null, waiting: f.item === 'strategy' ? 1 : 0, openReturns: f.item === 'hypothesis' ? 1 : 0, cycle: null, last: [] })),
});
const sessionsOf = (roles) => new Map([...roles.map((r) => 's-' + r), 'b1'].map((id) => [id, { sessionId: id, workspaceKey: 'C:/w/trade', rigRole: id === 'b1' ? BUILDER_ROLE : id.slice(2) }]));
// 켤 때 놓기(rig-map.mjs placeRoles와 같은 식): 칸 × (노드 + placeGap)
function placed(roles, flows, W = 1440, H = 810) {
  const { GX, GY } = placeGap(W, H);
  const g = gridPlace(roles, flows, { W, H, GX, GY, beatRole: roles[0] });
  const rects = new Map();
  for (const [k, c] of g.cells) rects.set(k === '@builder' ? 'b1' : 's-' + k, { x: Math.round(c.c * g.colStep), y: Math.round(c.r * g.rowStep), w: W, h: H });
  return { g, rects, GX, GY };
}
const boxHit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const cross = (p1, q1, p2, q2) => { const o = (a, b, c) => Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])); return o(p1, q1, p2) * o(p1, q1, q2) < 0 && o(p2, q2, p1) * o(p2, q2, q1) < 0; };
const samples = (P, n = 48) => Array.from({ length: n + 1 }, (_, i) => bezAt(P, i / n).p);
const curvesCross = (A, B) => { const a = samples(A), b = samples(B); for (let i = 0; i < a.length - 1; i++) for (let j = 0; j < b.length - 1; j++) if (cross(a[i], a[i + 1], b[j], b[j + 1])) return true; return false; };
const minDist = (A, B) => { const a = samples(A), b = samples(B); let m = Infinity; for (const p of a) for (const q of b) m = Math.min(m, Math.hypot(p[0] - q[0], p[1] - q[1])); return m; };

test('P259 placeGap: 노드 크기에 비례해 넓게(P254 600×600보다), 반 칸 비스듬한 선은 허용 각도 안, 작은 노드도 MIN 아래로 줄지 않는다', () => {
  const a = placeGap(1440, 810);
  assert.equal(a.GX, 1080, '가로 = 폭 × 0.75');
  assert.ok(a.GX > 600 && a.GY > 600, JSON.stringify(a));
  assert.ok(Math.atan(a.GY / ((1440 + a.GX) / 2)) * 180 / Math.PI <= PLACE_GAP.ANG + 1e-9);
  const b = placeGap(1920, 1080), c = placeGap(1040, 585);
  assert.ok(b.GX > a.GX && b.GY > a.GY && c.GX < a.GX, '노드가 크면 간격도 크다');
  const s = placeGap(300, 200);
  assert.deepEqual([s.GX, s.GY], [PLACE_GAP.MIN, PLACE_GAP.MIN]);
  assert.ok(PLACE_GAP.ANG < ANGLE.MAX);
});

test('P259 켤 때 2D 배치(rig-trade 3역할 삼각형 + 빌더, 4~5역할): 노드 사이 최소 간격, 겹침 없음, 선이 노드를 지나지 않고 허용 각도', () => {
  const cases = [
    [ROLES, FLOWS],
    [['data', 'ideas', 'verify', 'trade', 'risk'], [...FLOWS, { item: 'limit', from: ['risk'], to: ['trade'] }, { item: 'exposure', from: ['trade'], to: ['risk'] }]],
    [['data', 'ideas', 'verify'], FLOWS.filter((f) => !['strategy', 'live_report', 'halt'].includes(f.item))],
  ];
  for (const [roles, flows] of cases) {
    const { rects, GX, GY } = placed(roles, flows);
    const rs = [...rects.entries()];
    for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
      const [ia, a] = rs[i], [ib, b] = rs[j];
      const gx = Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w), gy = Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h);
      assert.ok(gx >= GX - 1 || gy >= GY - 1, `${ia}·${ib} 간격 ${gx}, ${gy}`);
    }
    const names = roles.map((r) => 's-' + r);
    const pairs = new Set(); for (const f of flows) for (const x of f.from) for (const y of f.to) if (roles.includes(x) && roles.includes(y)) pairs.add([x, y].sort().join('|'));
    for (const k of pairs) {
      const [x, y] = k.split('|').map((r) => 's-' + r);
      const [p, q] = faceEnds(rects.get(x), rects.get(y));
      assert.ok(angleOk(lineAngle(p, q)), k + ' 각도 ' + lineAngle(p, q).toFixed(1));
      for (const n of [...names, 'b1']) if (n !== x && n !== y) assert.ok(!segHitsRect(p, q, rects.get(n), 1), k + '가 ' + n + '을 지난다');
    }
  }
});

test('P259 rigCurve: 보통 연결(@xyflow getBezierPath)과 같은 곡선. 끝 방향은 도착 노드 안쪽(화살촉이 모서리에 수직으로 닿는다)', () => {
  const P = { t: Position.Top, r: Position.Right, b: Position.Bottom, l: Position.Left };
  const pts = [[[100, 200], [700, 260]], [[100, 200], [140, 900]], [[500, 500], [100, 120]]];
  for (const [s, t] of pts) for (const sp of 'trbl') for (const tp of 'trbl') {
    const [d] = getBezierPath({ sourceX: s[0], sourceY: s[1], sourcePosition: P[sp], targetX: t[0], targetY: t[1], targetPosition: P[tp] });
    assert.equal(rigCurve(s, sp, t, tp).d, d, sp + tp);
  }
  const c = rigCurve([0, 0], 'r', [600, 300], 'l');
  const end = bezAt(c.P, 1);
  assert.deepEqual(end.p, [600, 300]); assert.deepEqual(end.u.map((v) => Math.round(v * 1e6) / 1e6), [1, 0], '왼 모서리로 들어오는 선은 오른쪽(노드 안)을 향한다');
  // 보통 연결은 바꾸지 않는다: Links.jsx는 그대로 getBezierPath
  assert.ok(/getBezierPath\(\{ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition \}\)/.test(read('Links.jsx')));
});

test('P259 rigPorts: 모서리 고르기는 보통 연결과 같고, n개면 모서리 중앙이 가운데인 등간격(나감·들어옴 함께), 같은 쌍 두 선은 엇갈리지 않는다', () => {
  const R = { a: { x: 0, y: 0, w: 1440, h: 810 }, b: { x: 2520, y: 0, w: 1440, h: 810 }, c: { x: 2520, y: 1600, w: 1440, h: 810 }, d: { x: 0, y: 1700, w: 1440, h: 810 } };
  const lines = [
    { id: 'ab', from: 'a', to: 'b', rank: 0 }, { id: 'ba', from: 'b', to: 'a', rank: 1 },
    { id: 'ac', from: 'a', to: 'c', rank: 0 }, { id: 'ca', from: 'c', to: 'a', rank: 1 },
    { id: 'ad', from: 'a', to: 'd', rank: 0 },
  ];
  const ports = rigPorts(lines, (id) => R[id]);
  for (const l of lines) {
    const fs2 = facingSides(R[l.from], R[l.to]);
    assert.deepEqual([ports.get(l.id).sp, ports.get(l.id).tp], [fs2.sourceHandle, fs2.targetHandle], l.id);
  }
  // a의 오른 모서리: ab(나감)·ba(들어옴)·ac·ca 넷이 함께 센다 → 같은 간격, 가운데 = 모서리 중앙
  const rightA = lines.filter((l) => ports.get(l.id)[l.from === 'a' ? 'sp' : 'tp'] === 'r' && (l.from === 'a' || l.to === 'a')).map((l) => ports.get(l.id)[l.from === 'a' ? 's' : 't']);
  assert.equal(rightA.length, 4);
  const ys = rightA.map((p) => p[1]).sort((x, y) => x - y);
  const step = portStep(810, 4);
  for (let i = 1; i < ys.length; i++) assert.ok(Math.abs(ys[i] - ys[i - 1] - step) < 1e-9, '같은 간격');
  assert.ok(Math.abs((ys[0] + ys[3]) / 2 - 405) < 1e-9, '가운데 = 모서리 중앙');
  assert.ok(rightA.every((p) => p[0] === 1440));
  // 상대 노드 차례: b(위)로 가는 선이 c(아래)로 가는 선보다 위
  assert.ok(Math.max(ports.get('ab').s[1], ports.get('ba').t[1]) < Math.min(ports.get('ac').s[1], ports.get('ca').t[1]));
  // 하나뿐인 모서리는 중앙
  assert.deepEqual(ports.get('ad').s, [720, 810]); assert.deepEqual(ports.get('ad').t, [720, 1700]);
  // 같은 쌍 두 방향 선은 엇갈리지 않고 떨어져 있다(하나로 보이지 않게)
  const cv = (id) => { const o = ports.get(id); return rigCurve(o.s, o.sp, o.t, o.tp).P; };
  for (const [x, y] of [['ab', 'ba'], ['ac', 'ca'], ['ab', 'ac'], ['ba', 'ca']]) assert.ok(!curvesCross(cv(x), cv(y)), x + '·' + y + ' 엇갈림');
  assert.ok(minDist(cv('ab'), cv('ba')) >= step * 0.8, '두 방향 선 사이가 끝점 간격쯤 떨어진다: ' + minDist(cv('ab'), cv('ba')));
  assert.equal(portStep(810, 1), 0);
  assert.ok(portStep(810, 9) <= 810 / 10);
});

test('P259 rigCanvasLines(rig-trade 켤 때 자리): 방향마다 한 곡선, 같은 쌍은 엇갈리지 않고, 칩이 노드·다른 칩·화살촉과 겹치지 않는다(배율 1과 멀리)', () => {
  for (const [roles, flows] of [[ROLES, FLOWS], [['data', 'ideas', 'verify', 'trade', 'risk'], [...FLOWS, { item: 'limit', from: ['risk'], to: ['trade'] }, { item: 'exposure', from: ['trade'], to: ['risk'] }]]]) {
    const { rects } = placed(roles, flows);
    const edges = rigEdges([MAP(roles, flows)], sessionsOf(roles));
    for (const cs of [1, RIG_EDGE.CHIP_MIN / 0.25, RIG_EDGE.CHIP_MIN / 0.18]) {
      const out = rigCanvasLines(edges, (id) => rects.get(id), { nodes: [...rects.values()], cs, waitText: (n) => '대기 ' + n });
      const all = [...out.values()].flatMap((x) => x.lines);
      const want = edges.reduce((s, e) => s + (e.kind === 'raise' ? 1 : (e.lines.top ? 1 : 0) + (e.lines.bottom ? 1 : 0)), 0);
      assert.equal(all.length, want, '방향마다 한 선');
      for (const e of edges.filter((x) => x.kind === 'path')) {
        const ls = out.get(e.id).lines;
        if (ls.length === 2) { assert.ok(!curvesCross(ls[0].P, ls[1].P), e.id + ' 두 선 엇갈림'); assert.ok(minDist(ls[0].P, ls[1].P) > 60, e.id + ' 두 선이 붙었다'); }
      }
      const chips = all.map((l) => ({ key: l.key, x: l.lab.p[0] - l.w / 2, y: l.lab.p[1] - l.h / 2, w: l.w, h: l.h }));
      for (const c of chips) for (const r of rects.values()) assert.ok(!boxHit(c, r), `cs ${cs}: ${c.key} 칩이 노드 위`);
      for (let i = 0; i < chips.length; i++) for (let j = i + 1; j < chips.length; j++) assert.ok(!boxHit(chips[i], chips[j]), `cs ${cs}: ${chips[i].key}·${chips[j].key} 칩 겹침`);
      const A = RIG_EDGE.ARROW * cs;
      for (const c of chips) for (const l of all) { const u = bezAt(l.P, 1).u; const tip = { x: l.t[0] - u[0] * A / 2 - A / 2, y: l.t[1] - u[1] * A / 2 - A / 2, w: A, h: A }; assert.ok(!boxHit(c, tip), `cs ${cs}: ${c.key} 칩이 화살촉 위`); }
      assert.ok(all.every((l) => l.lab.free));
      // 같은 쌍 두 방향 칩은 곡선이 갈라지는 곳에 붙지 않고 칩 높이 × SIB_GAP 넘게 떨어진다
      for (const e of edges.filter((x) => x.kind === 'path')) {
        const ls = out.get(e.id).lines; if (ls.length < 2) continue;
        const [a, b] = ls.map((l) => ({ x: l.lab.p[0] - l.w / 2, y: l.lab.p[1] - l.h / 2, w: l.w, h: l.h }));
        // 칩이 틈보다 넓은 아주 먼 배율(마주 보는 가로 쌍, cs ≥ 4)에서는 갈 수 있는 만큼(맞닿지 않게) 떨어진다
        const g = (cs < 4 ? RIG_EDGE.CHIP_H * cs * RIG_EDGE.SIB_GAP : RIG_EDGE.GAP) - 1e-6;
        assert.ok(!(a.x - g < b.x + b.w && b.x - g < a.x + a.w && a.y - g < b.y + b.h && b.y - g < a.y + a.h), `cs ${cs}: ${e.id} 두 칩이 붙었다`);
      }
    }
  }
});

test('P259 칩: 대기 n·붉은 점이 칩 안에 들고 그만큼 넓다. 못 놓으면 가장 덜 겹치는 자리', () => {
  const a = chipSize('hypothesis'), b = chipSize('hypothesis', { open: true, wait: '대기 1' });
  assert.ok(b.w > a.w + 30 && a.h === RIG_EDGE.CHIP_H);
  const node = { x: -1000, y: -1000, w: 3000, h: 3000 };
  const s = rigLabelSpots([{ id: 'x', P: rigCurve([0, 0], 'r', [600, 0], 'l').P, w: 100, h: 24 }], [node]);
  assert.equal(s.get('x').free, false);
});

test('P259 그리기: 곡선 가족 클래스, 도착 끝 화살촉(userSpaceOnUse, 끝이 모서리), 출발 점, 칩 안 방향 화살, 직각 길·두 줄 걷어냄', () => {
  const src = read('RigLines.jsx');
  for (const s of ['mt-edge role rigc', "' active'", 'markerUnits="userSpaceOnUse"', 'refX={RIG_EDGE.ARROW}', 'markerEnd=', 'rig-line-start', 'rig-dir', 'mt-edge-label rigc']) assert.ok(src.includes(s), s);
  for (const s of ['twoLines', 'polyLines', 'labelSpots', 'V7.W1', 'pairLit', 'WLIT']) assert.ok(!src.includes(s), s);
  const cv = read('Canvas.jsx');
  assert.ok(/rigCanvasLines\(/.test(cv) && !/rigRoute|spreadEnds/.test(cv));
  const lib = read('lib/rig-map.js');
  for (const s of ['export function rigRoute', 'export function spreadEnds', 'export function polyLines', 'export function labelSpots']) assert.ok(!lib.includes(s), s);
  const css = read('styles.css');
  assert.ok(!/--wire-rig|\.rigc[^{]*\{[^}]*stroke: (?!var\(--attn\))/.test(css), 'rig 선만의 색이 없다(올림 노랑만)');
  assert.ok(/\.mt-edge\.active \{ stroke-dasharray: 9 6; animation: mt-dash/.test(css), '보통 연결의 흐름을 그대로 쓴다');
  assert.ok(/\.react-flow__edge-path\.mt-edge \{ stroke-width: 2\.6;/.test(css));
});

test('P259(2차) 흐름 규칙: 받는 역할이 일하고 그 방향 길로 30분 안에 항목이 오갔을 때만(보통 연결 ACTIVE_MS와 같은 규칙)', () => {
  const now = 10_000_000;
  const flows = [{ item: 'hypothesis', from: ['ideas'], to: ['verify'], last: [{ t: now - 60_000 }] }, { item: 'result', from: ['verify'], to: ['ideas'], last: [{ t: now - 3_600_000 }] }];
  assert.equal(rigLineActive({ from: 'ideas', to: 'verify' }, flows, 'working', now), true);
  assert.equal(rigLineActive({ from: 'ideas', to: 'verify' }, flows, 'ready', now), false, '받는 쪽이 쉬면 멈춤');
  assert.equal(rigLineActive({ from: 'verify', to: 'ideas' }, flows, 'working', now), false, '오래된 항목이면 멈춤');
  assert.equal(rigLineActive({ from: 'data', to: 'verify' }, flows, 'working', now), false, '오간 항목이 없으면 멈춤');
  assert.equal(RIG_EDGE.ACTIVE_MS, 30 * 60 * 1000);
  assert.ok(/to\.state === 'working' && link\.lastAt && Date\.now\(\) - link\.lastAt < ACTIVE_MS/.test(read('Links.jsx')), '보통 연결 규칙(견줄 것)');
});
