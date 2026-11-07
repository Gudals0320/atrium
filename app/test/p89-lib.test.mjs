// P89 단위 시험: 휴대폰 작업 관계도 그래프 배치(lib/phone-graph.js: 무리 상자, 위 → 아래 나무, 넓은 형제 처리(row·bus·col),
// 나무 밖 연결과 다른 무리 부모(점선), 노드 겹침 없음, 50개 판), 강조 등급(선의 등급, 요약 칩 거르기), 옮기기·확대 범위(fit·clamp·focus)
import test from 'node:test';
import assert from 'node:assert/strict';
import { phoneMission } from '../src/renderer/lib/phone-mission.js';
import { phoneGraph, PG, VIEW, colsFor, maxWOf, fitView, clampView, zoomRange, focusView, inFocus, vpKey } from '../src/renderer/lib/phone-graph.js';

const node = (id, ws, o = {}) => ({ id: `s:${id}`, kind: 'session', sessionId: id, name: id, agentKind: 'claude', state: 'ready', category: 'idle', workspaceKey: ws, parentId: null, role: null, order: null, createdAt: 0, loops: 0, ...o });
let clock = 0;
const kid = (id, ws, parent, o = {}) => node(id, ws, { parentId: `s:${parent}`, role: o.role || `r-${id}`, order: ++clock, createdAt: clock, ...o });
const P = { w: 393, h: 852 - 140 }, L = { w: 852, h: 393 - 110 }; // 세로·가로의 그래프 칸(머리줄·요약을 뺀 대략)

// 겹침 없음: 카드 사각형끼리 서로 닿지 않는다
function noOverlap(g) {
  const { W, H } = PG;
  for (let i = 0; i < g.nodes.length; i++) for (let j = i + 1; j < g.nodes.length; j++) {
    const a = g.nodes[i], b = g.nodes[j];
    if (a.x < b.x + W && b.x < a.x + W && a.y < b.y + H && b.y < a.y + H) return `${a.id} ↔ ${b.id}`;
  }
  return null;
}
const at = (g) => Object.fromEntries(g.nodes.map((n) => [n.row.name, n]));
const inGroup = (g) => g.nodes.every((n) => { const b = g.groups.find((x) => x.key === n.group); return n.x >= b.x && n.x + PG.W <= b.x + b.w + 0.5 && n.y >= b.y + PG.GROUP_HEAD && n.y + PG.H <= b.y + b.h + 0.5; });

function board() {
  clock = 0;
  const nodes = [
    { id: 'human', kind: 'human', name: 'you', column: 0 },
    node('lead', 'wa', { state: 'working', category: 'working', createdAt: 0 }),
    kid('rev', 'wa', 'lead', { role: 'reviewer' }), kid('test', 'wa', 'lead', { state: 'waiting', category: 'needs_you', ask: 'Bash: npm test' }),
    kid('help', 'wa', 'rev', { role: 'helper' }),
    kid('port', 'wc', 'lead', { role: 'porter' }), // 다른 무리의 하위 세션
    node('solo', 'wb', { state: 'sleeping', createdAt: 50 }), node('old', 'wc', { state: 'exited', category: 'exited', createdAt: 60 }),
  ];
  const edges = [
    { from: 's:lead', to: 's:rev', kind: 'role', label: 'reviewer', active: true },
    { from: 's:test', to: 's:help', kind: 'role', label: 'second opinion' }, // 나무 밖
    { from: 'human', to: 's:lead', kind: 'bar', count: 1 },
  ];
  return { nodes, edges };
}

test('그래프: 무리 상자는 위에서 아래로 같은 폭, 나무는 위 → 아래, 선은 부모 아래에서 하위 위로', () => {
  const pm = phoneMission(board(), { order: ['wa', 'wb', 'wc'] });
  const g = phoneGraph(pm, { cols: 2 });
  assert.deepEqual(g.groups.map((x) => x.key), ['wa', 'wb', 'wc']);
  assert.ok(g.groups.every((x) => x.w === g.groups[0].w), '무리 폭이 같다');
  for (let i = 1; i < g.groups.length; i++) assert.ok(g.groups[i].y >= g.groups[i - 1].y + g.groups[i - 1].h + PG.GROUP_GAP - 0.5, '무리는 겹치지 않고 아래로 쌓인다');
  assert.equal(noOverlap(g), null); assert.ok(inGroup(g), '카드는 제 무리 상자 안');
  const n = at(g);
  assert.ok(n.rev.y > n.lead.y && n.test.y > n.lead.y && n.help.y > n.rev.y, '하위는 아래로');
  assert.equal(n.rev.y, n.test.y, '형제는 같은 높이(나란히)');
  assert.ok(Math.abs(n.lead.x + PG.W / 2 - (n.rev.x + n.test.x + PG.W) / 2) < 1, '부모는 하위들 가운데 위');
  const tree = g.edges.filter((e) => e.kind === 'tree').map((e) => e.id).sort();
  assert.deepEqual(tree, ['t:s:lead>s:rev', 't:s:lead>s:test', 't:s:rev>s:help']);
  const e = g.edges.find((x) => x.id === 't:s:lead>s:rev');
  assert.match(e.d, new RegExp(`^M${n.lead.x + PG.W / 2} ${n.lead.y + PG.H}C`), '부모 카드 아래 가운데에서 시작하는 곡선');
  assert.ok(e.d.endsWith(`${n.rev.x + PG.W / 2} ${n.rev.y}`), '하위 카드 위 가운데에서 끝난다');
  assert.equal(e.tier, 'rest'); assert.equal(e.active, true, '역할 선이 일하는 중'); assert.equal(e.role, 'reviewer');
  assert.equal(g.edges.find((x) => x.id === 't:s:lead>s:test').tier, 'turn', '선은 받는 쪽 등급');
  assert.ok(g.width <= P.w + 1, `세로 휴대폰 폭 안: ${g.width}`);
});

test('그래프: 나무 밖 연결과 다른 무리 부모는 점선(link·cross), 접은 무리의 카드로 가는 선은 없다', () => {
  const pm = phoneMission(board(), { order: ['wa', 'wb', 'wc'] });
  const g = phoneGraph(pm, { cols: 2 });
  const link = g.edges.find((e) => e.kind === 'link');
  assert.deepEqual([link.from, link.to, link.role], ['s:test', 's:help', 'second opinion']);
  const cross = g.edges.find((e) => e.kind === 'cross');
  assert.deepEqual([cross.from, cross.to, cross.role], ['s:lead', 's:port', 'porter']);
  const n = at(g);
  assert.ok(n.port.y > n.lead.y && n.port.group === 'wc');
  const right = g.groups[0].x + g.groups[0].w;
  for (const e of [link, cross]) { assert.match(e.d, /^M[\d.]+ [\d.]+H/); assert.ok(e.rot && e.lx > right && e.lx < g.width, '무리 상자 오른쪽 통로로'); assert.ok(Number.isFinite(e.ex) && Number.isFinite(e.ey) && Number.isFinite(e.lx) && Number.isFinite(e.ly)); }
  // 접기: wa를 접으면 그 카드와, 그 카드로 이어진 선이 모두 빠진다(머리띠는 남는다)
  const f = phoneGraph(phoneMission(board(), { order: ['wa', 'wb', 'wc'], folded: ['wa'] }), { cols: 2 });
  assert.equal(f.groups[0].folded, true); assert.equal(f.groups[0].h, PG.GROUP_HEAD); assert.equal(f.groups[0].count, 4);
  assert.ok(!f.nodes.some((x) => x.group === 'wa'));
  assert.ok(!f.edges.some((e) => e.from === 's:lead' || e.to === 's:lead'));
  assert.equal(noOverlap(f), null);
});

test('그래프: 넓은 형제 — 잎 여럿은 두 줄 격자(bus), 하위가 또 있으면 들여 세로로(col), 가로 화면은 더 넓게 나란히', () => {
  clock = 0;
  const leaves = [node('lead', 'w', { createdAt: 0 }), ...Array.from({ length: 9 }, (_, i) => kid(`w${i}`, 'w', 'lead'))];
  const g = phoneGraph(phoneMission({ nodes: leaves, edges: [] }), { cols: 2 });
  assert.equal(noOverlap(g), null); assert.ok(inGroup(g));
  assert.ok(g.edges.every((e) => e.mode === 'bus'));
  const xs = [...new Set(g.nodes.filter((n) => n.row.depth === 1).map((n) => n.x))];
  assert.equal(xs.length, 2, '두 줄');
  assert.ok(g.width <= P.w + 20, `세로 폭에 거의 맞다: ${g.width}`);
  assert.ok(fitView(g, P).zoom >= 0.95, '글을 줄이지 않고 폭에 든다');
  const n = at(g);
  assert.ok(n.w0.y < n.w2.y && n.w0.y === n.w1.y && n.w1.x > n.w0.x, '띄운 순서대로 왼쪽 → 오른쪽, 위 → 아래');
  // 가로(cols 4): 넷까지 나란히
  const four = phoneGraph(phoneMission({ nodes: leaves.slice(0, 5), edges: [] }), { cols: colsFor(L.w) });
  assert.equal(colsFor(L.w), 4); assert.equal(colsFor(393), 2);
  assert.ok(four.edges.every((e) => e.mode === 'row'));
  assert.equal(new Set(four.nodes.filter((x) => x.row.depth === 1).map((x) => x.y)).size, 1);
  // 하위에 손자가 있는 넓은 형제: 들여 세로로, 등뼈에서 카드 왼쪽으로
  clock = 0;
  const mixed = [node('lead', 'w'), kid('a', 'w', 'lead'), kid('b', 'w', 'lead'), kid('c', 'w', 'lead'), kid('a1', 'w', 'a'), kid('a2', 'w', 'a'), kid('c1', 'w', 'c'), kid('c1x', 'w', 'c1')];
  const m = phoneGraph(phoneMission({ nodes: mixed, edges: [] }), { cols: 2 });
  assert.equal(noOverlap(m), null); assert.ok(inGroup(m));
  const mn = at(m);
  assert.ok(m.edges.filter((e) => e.from === 's:lead').every((e) => e.mode === 'col'));
  assert.ok(mn.b.x === mn.lead.x + PG.INDENT && mn.b.x === mn.c.x && mn.a.x >= mn.b.x && mn.a.y < mn.b.y && mn.b.y < mn.c.y, '블록은 한 칸 들여 세로로(손자가 나란한 a는 그 가운데 위)');
  assert.ok(mn.a1.y > mn.a.y && mn.b.y > mn.a1.y, '손자는 자기 부모 블록 안');
  assert.ok(m.width <= P.w + 2 * PG.INDENT, `세로 폭 근처: ${m.width}`);
});

test('그래프: 뿌리 여럿은 폭 안에서 줄을 바꾸고, 깊은 사슬도 겹치지 않는다', () => {
  clock = 0;
  const loose = Array.from({ length: 7 }, (_, i) => node(`sh${i}`, 'w', { createdAt: i, agentKind: 'shell' }));
  const g = phoneGraph(phoneMission({ nodes: loose, edges: [] }), { cols: 2 });
  assert.equal(noOverlap(g), null);
  assert.equal(new Set(g.nodes.map((n) => n.y)).size, 4, '둘씩 네 줄');
  assert.ok(g.width <= P.w + 20);
  const chain = Array.from({ length: 9 }, (_, i) => node(`c${i}`, 'w', { parentId: i ? `s:c${i - 1}` : null, createdAt: i }));
  const c = phoneGraph(phoneMission({ nodes: chain, edges: [] }), { cols: 2 });
  assert.equal(noOverlap(c), null);
  assert.ok(c.nodes.every((n, i) => !i || n.y > c.nodes[i - 1].y));
  assert.deepEqual(phoneGraph(phoneMission(null)), { nodes: [], edges: [], groups: [], width: 2 * PG.PAD + PG.W + 2 * PG.GROUP_PAD + PG.GUTTER, height: 2 * PG.PAD });
});

// 50개 판: 무리 4개, 리드 셋(하위·손자), 셸 여럿, 역할 선, 고리
function big(n = 50) {
  clock = 0;
  const nodes = [], edges = [];
  const ws = ['w1', 'w2', 'w3', 'w4'];
  for (let L = 0; L < 3; L++) {
    const lead = `lead${L}`;
    nodes.push(node(lead, ws[L], { createdAt: ++clock, state: L === 0 ? 'working' : 'ready' }));
    for (let i = 0; i < 6 + L * 2; i++) {
      const w = `${lead}-w${i}`;
      nodes.push(kid(w, i % 4 === 3 ? ws[(L + 1) % 4] : ws[L], lead, { state: i % 3 === 0 ? 'working' : i % 5 === 1 ? 'waiting' : 'ready' }));
      if (i % 3 === 1) nodes.push(kid(`${w}-h`, ws[L], w));
    }
  }
  while (nodes.length < n) nodes.push(node(`sh${nodes.length}`, ws[nodes.length % 4], { agentKind: 'shell', createdAt: ++clock, state: nodes.length % 6 ? 'ready' : 'sleeping' }));
  for (let i = 0; i < 8; i++) edges.push({ from: nodes[i * 5].id, to: nodes[(i * 7 + 3) % nodes.length].id, kind: 'role', label: `peer${i}` });
  edges.push({ from: 's:lead1', to: 's:lead2', kind: 'prompt' }, { from: 's:lead2', to: 's:lead1', kind: 'prompt' });
  return { nodes, edges };
}

test('그래프: 세션 50개 판 — 모두 한 번씩, 겹침 없음, 제 무리 안, 세로·가로 모두', () => {
  for (const [vp, label] of [[P, '세로'], [L, '가로']]) {
    const pm = phoneMission(big(), { order: ['w1', 'w2', 'w3', 'w4'] });
    const g = phoneGraph(pm, { cols: colsFor(vp.w) });
    assert.equal(g.nodes.length, 50, label);
    assert.equal(new Set(g.nodes.map((x) => x.id)).size, 50);
    assert.equal(noOverlap(g), null, label); assert.ok(inGroup(g), label);
    const ids = new Set(g.nodes.map((x) => x.id));
    assert.ok(g.edges.every((e) => ids.has(e.from) && ids.has(e.to)));
    assert.ok(g.edges.some((e) => e.kind === 'link') && g.edges.some((e) => e.kind === 'cross'));
    assert.ok(g.edges.every((e) => !/NaN|undefined/.test(e.d)));
    const f = fitView(g, vp);
    assert.ok(f.zoom >= Math.min(VIEW.READ_MIN, (vp.w - 2 * VIEW.PAD) / g.width) - 0.001, `${label}: 맞춘 배율 ${f.zoom}`);
    assert.ok(g.width * f.zoom <= vp.w + 0.5, `${label}: 폭에 든다`);
  }
});

test('강조: 요약 칩 거르기(일함·응답 필요는 오류도), 선은 받는 쪽 등급', () => {
  assert.equal(inFocus(null, 'rest'), true);
  assert.equal(inFocus('work', 'work'), true); assert.equal(inFocus('work', 'turn'), false);
  assert.equal(inFocus('turn', 'turn'), true); assert.equal(inFocus('turn', 'alert'), true); assert.equal(inFocus('turn', 'work'), false);
  const live = new Map([['help', { sessionId: 'help', name: 'help', state: 'working' }]]);
  const g = phoneGraph(phoneMission(board(), { live, order: ['wa', 'wb', 'wc'] }), { cols: 2 });
  assert.equal(g.edges.find((e) => e.id === 't:s:rev>s:help').tier, 'work', '판의 상태로 덧입힌 등급');
  assert.equal(at(g).solo.row.tier, 'sleep'); assert.equal(at(g).old.row.tier, 'done');
});

test('보기: 맞추기(세로·가로), 옮기기·확대 범위, 고른 등급으로 맞추기', () => {
  const g = phoneGraph(phoneMission(board(), { order: ['wa', 'wb', 'wc'] }), { cols: 2 });
  const f = fitView(g, P);
  assert.ok(f.zoom > 0 && f.zoom <= VIEW.FIT_MAX);
  assert.ok(g.width * f.zoom <= P.w - 2 * VIEW.PAD + 0.5 && f.x >= VIEW.PAD - 0.5, '폭 안, 가운데');
  assert.ok(f.y >= VIEW.PAD - 0.5);
  // 아주 긴 그래프: 높이에 맞추면 글이 너무 작으니 READ_MIN에서 멈추고 위에 붙인다
  const tall = { width: 360, height: 6000 };
  const ft = fitView(tall, P);
  assert.equal(ft.zoom, VIEW.READ_MIN); assert.equal(ft.y, VIEW.PAD);
  // 아주 넓은 그래프: 폭에 맞춘다(READ_MIN 아래라도), 그래도 ZMIN 위
  const wide = fitView({ width: 4000, height: 300 }, P);
  assert.ok(wide.zoom < VIEW.READ_MIN && 4000 * wide.zoom <= P.w);
  // 범위: 배율은 [min(ZMIN, 맞춘 배율), ZMAX], 그래프는 늘 MARGIN px 이상 화면에 남는다
  const r = zoomRange(g, P);
  assert.equal(r.maxZoom, VIEW.ZMAX); assert.ok(r.minZoom <= VIEW.ZMIN);
  assert.equal(clampView({ x: 0, y: 0, zoom: 99 }, g, P).zoom, VIEW.ZMAX);
  assert.equal(clampView({ x: 0, y: 0, zoom: 0.001 }, g, P).zoom, r.minZoom);
  const far = clampView({ x: 99999, y: -99999, zoom: 1 }, g, P);
  assert.equal(far.x, P.w - VIEW.MARGIN); assert.equal(far.y, VIEW.MARGIN - g.height);
  const far2 = clampView({ x: -99999, y: 99999, zoom: 1 }, g, P);
  assert.equal(far2.x, VIEW.MARGIN - g.width); assert.equal(far2.y, P.h - VIEW.MARGIN);
  const ok = { x: 20, y: 30, zoom: 1.1 };
  assert.deepEqual(clampView(ok, g, P), ok, '범위 안이면 그대로');
  assert.deepEqual(clampView({ x: NaN, y: undefined, zoom: undefined }, g, P), { x: 0, y: 0, zoom: 1 });
  // 고른 등급으로 맞추기: 그 카드들이 화면 안, 배율은 FOCUS_MAX 이하
  const sel = g.nodes.filter((n) => inFocus('turn', n.row.tier));
  const fv = focusView(sel, P);
  for (const n of sel) { assert.ok(n.x * fv.zoom + fv.x >= 0 && (n.x + PG.W) * fv.zoom + fv.x <= P.w); assert.ok(n.y * fv.zoom + fv.y >= 0 && (n.y + PG.H) * fv.zoom + fv.y <= P.h); }
  assert.ok(fv.zoom <= VIEW.FOCUS_MAX);
  assert.equal(focusView([], P), null);
  assert.equal(vpKey({ w: 393.4, h: 700.6 }), '393x701');
  assert.equal(maxWOf(2), 2 * PG.W + PG.GX);
});
