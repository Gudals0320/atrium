// P376 단위 시험: 세션 맵 배열 고정(열 나누기 기억, 새 워크스페이스에서만 다시 정함), 오래 쉰 하위의 얇은 줄(PC), 휠 = 확대.
// 사용자(2026-11-26): "확대 비율에 따라 왜 배열이 바뀌나? 배열은 고정. 새 워크스페이스가 생길 때에만 정렬을 점검하고 고친다."
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lineageLayout, labelStep, mapPlan, mapBands, planUnits, planMiss, sheetAspect, PLAN, LINE } from '../src/renderer/lib/mission-lineage.js';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'renderer');
const read = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');

// 폴더 7(띠 높이가 제각각) + 폴더 없음. 하위 7개(절전 5) 하나, 깊은 사슬 하나
function board({ extra = [] } = {}) {
  const nodes = [], edges = [], groups = [];
  let i = 0;
  const add = (name, ws, parent = null, state = 'sleeping') => { nodes.push({ id: 's:' + name, kind: 'session', sessionId: 'x-' + name, name, workspaceKey: ws, state, parentId: parent ? 's:' + parent : null, createdAt: ++i }); if (parent) edges.push({ from: 's:' + parent, to: 's:' + name, kind: 'spawn', count: 1 }); };
  const sizes = [1, 3, 2, 4, 1, 2, 3];
  sizes.forEach((nw, gi) => {
    const members = [];
    for (let w = 0; w < nw; w++) { const ws = 'd:/w/f' + gi + 'w' + w; members.push(ws); add('l' + gi + w, ws, null, w === 0 && gi % 3 === 0 ? 'working' : 'sleeping'); if ((gi + w) % 2) add('k' + gi + w, ws, 'l' + gi + w); }
    groups.push({ id: 'f' + gi, name: 'Folder ' + gi, members });
  });
  add('lone', 'd:/w/loose0'); add('lone2', 'd:/w/loose1');
  add('lead', 'd:/w/f1w0', null, 'ready');
  for (let j = 1; j <= 7; j++) add('w' + j, 'd:/w/f1w0', 'lead', j <= 2 ? 'working' : 'sleeping');
  const chain = ['d0', 'd1', 'd2', 'd3', 'd4', 'd5'];
  chain.forEach((n, j) => add(n, 'd:/w/f3w1', j ? chain[j - 1] : null));
  for (const x of extra) { add(x.name, x.ws, x.parent || null, x.state || 'sleeping'); if (x.folder) { let gr = groups.find((q) => q.id === x.folder.id); if (!gr) { gr = { id: x.folder.id, name: x.folder.name, members: [] }; groups.push(gr); } if (!gr.members.includes(x.ws)) gr.members.push(x.ws); } }
  return { graph: { nodes, edges }, groups };
}
const B = board();
const VIEW = { w: 1620, h: 860 };
const base = (b = B, o = {}) => ({ vgroups: b.groups, noFolder: 'No folder', view: VIEW, ...o });
const lay = (b, plan, o = {}) => lineageLayout(b.graph, { ...base(b, o), plan, columns: plan ? 1 : 'auto', routing: false, ...o });
// 배열 = 열마다 띠 id 차례
const arr = (L) => { const cols = []; for (const b of [...L.bands].sort((p, q) => (p.col || 0) - (q.col || 0) || p.y - q.y)) (cols[b.col || 0] ||= []).push(b.id == null ? '' : b.id); return JSON.stringify(cols); };
const KS = [0.15, 0.2, 0.3, 0.45, 0.6, 0.85, 1, 1.5];

test('원인 재현: 예전 auto는 열 수만 바탕 글로 정하고 띠 나누기(flowCols → splitUnits)는 배율 계단의 띠 높이로 해서, 배율에 따라 띠가 다른 열로 옮겨진다', () => {
  const seen = new Set(KS.map((k) => arr(lay(B, null, { label: labelStep(k) }))));
  const plan = mapPlan(null, B.graph, base());
  const fixed = new Set(KS.map((k) => arr(lay(B, plan, { label: labelStep(k) }))));
  assert.equal(fixed.size, 1, '기억한 배열은 하나');
  assert.ok(seen.size > 1, '예전 길은 배율 0.15~0.2에서 f3 띠가 다른 열로 옮겨졌다: ' + [...seen].join(' | '));
});

test('배율 0.15~1.5와 창 크기를 바꿔도 열 나누기가 같다(띠의 열·열 안 차례)', () => {
  const plan = mapPlan(null, B.graph, base());
  assert.ok(plan.cols.length >= 2, '이 판은 여러 열: ' + JSON.stringify(plan.cols));
  const want = arr(lay(B, plan));
  for (const k of KS) assert.equal(arr(lay(B, plan, { label: labelStep(k) })), want, 'k ' + k);
  for (const view of [{ w: 900, h: 700 }, { w: 2400, h: 900 }, { w: 1156, h: 690 }, null]) {
    assert.equal(arr(lay(B, plan, { view })), want, 'view ' + JSON.stringify(view));
    assert.equal(mapPlan(plan, B.graph, base(B, { view })), plan, '창 크기로는 다시 정하지 않는다');
  }
  // 열 순서 = plan 순서
  assert.equal(want, JSON.stringify(plan.cols));
});

test('세션 상태·카드 높이(얇은 줄·꼬리표)가 바뀌어도 같다. 같은 열 안 아래 띠는 밀릴 뿐 차례는 그대로', () => {
  const plan = mapPlan(null, B.graph, base());
  const want = arr(lay(B, plan));
  const woke = { ...B, graph: { ...B.graph, nodes: B.graph.nodes.map((n) => ({ ...n, state: n.state === 'sleeping' ? 'working' : 'sleeping' })) } };
  const tiers = new Map(woke.graph.nodes.map((n) => [n.id, n.state === 'working' ? 'work' : 'sleep']));
  const tags = new Map(B.graph.nodes.slice(0, 12).map((n) => [n.id, 2]));
  for (const o of [{ tiers }, { tags }, { tiers, tags, label: 0.3 }, { today: new Set(['d:/w/f6w0']) }, { today: new Set(['d:/w/loose0']) }]) {
    assert.equal(arr(lay(woke, plan, o)), want, JSON.stringify(Object.keys(o)));
    assert.equal(mapPlan(plan, woke.graph, base(woke, o)), plan, '상태로는 다시 정하지 않는다');
  }
  // 오늘·이전 구분 줄은 기억한 배열에서는 없다(띠 차례가 상태 따라 바뀌지 않게)
  assert.equal(lay(B, plan, { today: new Set(['d:/w/f6w0']) }).sections.length, 0);
});

test('새 워크스페이스(기존 폴더): 그 띠만 자라고 다른 띠의 열·차례는 그대로', () => {
  const plan = mapPlan(null, B.graph, base());
  const b2 = board({ extra: [{ name: 'nw', ws: 'd:/w/f2new', folder: { id: 'f2' } }] });
  const p2 = mapPlan(plan, b2.graph, base(b2));
  assert.notEqual(p2, plan);
  assert.ok(p2.ws.includes('d:/w/f2new'));
  assert.deepEqual(p2.cols, plan.cols, '이 정도로는 다시 나누지 않는다');
  assert.equal(arr(lay(b2, p2)), arr(lay(B, plan)));
});

test('새 워크스페이스(새 폴더): 가장 짧은 열 끝에 넣고 기존 띠는 움직이지 않는다', () => {
  const plan = mapPlan(null, B.graph, base());
  const b2 = board({ extra: [{ name: 'nf', ws: 'd:/w/new0', folder: { id: 'fz', name: 'New folder' } }] });
  const p2 = mapPlan(plan, b2.graph, base(b2));
  assert.equal(p2.why, 'insert');
  const m = planUnits(B.graph, base());
  const h = (c) => c.reduce((s, k, j) => s + m.units.get(k).h + (j ? m.units.get(k).lead : 0), 0);
  const short = plan.cols.reduce((a, c, i) => (h(c) < h(plan.cols[a]) ? i : a), 0);
  plan.cols.forEach((c, i) => assert.deepEqual(p2.cols[i], i === short ? [...c, 'fz'] : c));
});

test('새 워크스페이스로 판 비가 크게 어긋날 때만 다시 나눈다(차례는 지금 배열 그대로)', () => {
  const plan = mapPlan(null, B.graph, base());
  const extra = [];
  for (let f = 0; f < 14; f++) for (let w = 0; w < 3; w++) extra.push({ name: 'x' + f + w, ws: 'd:/w/x' + f + 'w' + w, folder: { id: 'x' + f, name: 'Extra ' + f } });
  const b2 = board({ extra });
  const p2 = mapPlan(plan, b2.graph, base(b2));
  assert.equal(p2.why, 'resplit');
  const m = planUnits(b2.graph, base(b2)), want = sheetAspect('view', VIEW);
  assert.ok(planMiss(p2.cols, m, want) <= Math.log(PLAN.DRIFT) + 1e-9 || p2.cols.length > plan.cols.length);
  // 다시 나눠도 띠 차례(열을 이어 읽은 차례)는 지금 배열 + 새 띠
  const flat = (p) => p.cols.flat().filter((k) => m.units.has(k));
  assert.deepEqual(flat(p2).slice(0, plan.cols.flat().length), plan.cols.flat());
});

test('워크스페이스가 사라지면 그 자리만 빈다(다시 나누지 않고, 다시 생기면 제자리)', () => {
  const plan = mapPlan(null, B.graph, base());
  const gone = plan.cols.find((c) => c.length === 1) ? plan.cols.find((c) => c.length === 1)[0] : plan.cols[0][0];
  const keys = new Set((B.groups.find((x) => x.id === gone) || { members: [] }).members);
  const lose = (n) => (gone === '' ? n.workspaceKey.includes('loose') : keys.has(n.workspaceKey));
  const b2 = { ...B, graph: { nodes: B.graph.nodes.filter((n) => !lose(n)), edges: B.graph.edges.filter((e) => !lose(B.graph.nodes.find((n) => n.id === e.to))) } };
  assert.equal(mapPlan(plan, b2.graph, base(b2)), plan, '사라짐으로는 바꾸지 않는다');
  const L = lay(b2, plan);
  assert.ok(!L.bands.some((b) => (b.id == null ? '' : b.id) === gone));
  for (const b of L.bands) { const key = b.id == null ? '' : b.id; assert.equal(b.col, plan.cols.findIndex((c) => c.includes(key)), key + ' 열 그대로'); }
  assert.equal(L.ncol, plan.cols.length - (plan.cols[plan.cols.length - 1].every((k) => k === gone) ? 1 : 0), '빈 열은 끝이 아니면 자리를 지킨다');
  assert.equal(mapPlan(plan, B.graph, base()), plan, '다시 생기면 제자리(아는 워크스페이스)');
});

test('처음(기억 없음)·형식이 다름·목표 비 열쇠가 바뀜·손 정리(force)는 새로 정한다', () => {
  const plan = mapPlan(null, B.graph, base());
  assert.equal(plan.v, PLAN.V); assert.equal(plan.why, 'new');
  assert.deepEqual(plan.cols.flat().sort(), mapBands(B.graph, base()).map((b) => b.key).sort());
  assert.equal(mapPlan({ v: 0, cols: [], ws: [] }, B.graph, base()).why, 'new');
  assert.notEqual(mapPlan(plan, B.graph, base(B, { aspect: 4 / 3 })), plan);
  assert.equal(mapPlan(plan, B.graph, base(), { force: true }).why, 'force');
});

test('얇은 줄(PC, P376 되살림): 하위가 THINMIN개 이상이면 절전 하위만 얇은 줄로 깨어 있는 카드 아래, 깊이 접기는 없다', () => {
  const plan = mapPlan(null, B.graph, base());
  const L = lay(B, plan);
  assert.equal(LINE.THINMIN, 3);
  assert.deepEqual([...L.cards].filter(([, c]) => c.thin).map(([id]) => id).sort(), ['s:w3', 's:w4', 's:w5', 's:w6', 's:w7']);
  for (const id of ['s:w3', 's:w7']) assert.equal(L.cards.get(id).h, LINE.THIN);
  assert.deepEqual(L.vkids.get('s:lead'), ['s:w1', 's:w2', 's:w3', 's:w4', 's:w5', 's:w6', 's:w7']);
  for (const [id, c] of L.cards) assert.equal(c.fold, 0, id);
  assert.equal(L.cards.get('s:d5').depth, 5);
});

test('창: 휠 = 커서 둘레 확대만(Ctrl·Shift 갈래 없음), 열 나누기는 기기에 기억', () => {
  const ml = read('MissionLineage.jsx');
  const wheel = ml.slice(ml.indexOf('const wheel = (e) =>'), ml.indexOf('const click = (e) =>'));
  assert.match(wheel, /paint\(zoomAt\(v, p\.x, p\.y, wheelK\(v\.k, e\.deltaY, e\.deltaMode\)\)\)/);
  assert.ok(!/ctrlKey|metaKey|shiftKey|panBy/.test(wheel), wheel);
  assert.match(ml, /const PLAN_KEY = 'atrium\.sessionMap\.plan';/);
  assert.match(ml, /mapPlan\(prev, g2, baseOpts\)/);
  assert.match(ml, /columns: plan \? 1 : 'auto', plan/);
});
