// P147 단위 시험: 미션 맵 "부대" 모양(lib/mission-roster.js)과 모양 고르기(lib/mission-style.js).
// - 섞은 판(폴더 둘·폴더 밖, 팀·혼자·쉬는 세션, 다른 워크스페이스 하위, 나무 밖 시킴)과 큰 판(세션 40개 안팎, 워크스페이스 10개)에서
//   줄·카드·판·폴더 틀이 겹치지 않고, 줄은 자기 부대 카드·판 안, 판은 폴더 틀 안, 기둥은 지도 칸 폭 안.
// - 팀 나무: 하위 줄은 부모보다 한 단 들여쓰고 아래, 관계 종류(spawn·role·prompt)가 선에 남고, 다른 워크스페이스 하위는 부모 부대 안(cross).
// - 기다리는 일 줄: 응답 필요·오류가 먼저, 그다음 작업 완료. 쉬는 하위가 많으면 알약 묶음. 키보드 차례는 모든 세션을 한 번씩.
// - 큰 판의 크기: 1584 폭에서 기둥 셋 이상, 높이가 한 기둥에 쌓을 때보다 훨씬 낮다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rosterLayout, dockOf, partition, foldHeight, linkPath, ROSTER } from '../src/renderer/lib/mission-roster.js';
import { missionStyleOf, DEFAULT_MISSION_STYLE, MISSION_STYLES } from '../src/renderer/lib/mission-style.js';
import { nodeTier } from '../src/renderer/lib/mission-model.js';

const R = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'renderer');
const read = (f) => fs.readFileSync(path.join(R, f), 'utf8');
let clock = 0;
const node = (id, ws, o = {}) => ({ id: `s:${id}`, kind: 'session', sessionId: id, name: id, agentKind: 'claude', state: 'ready', category: 'idle', workspaceKey: ws, parentId: null, role: null, order: null, createdAt: ++clock, loops: 0, ...o });
const work = { state: 'working', category: 'working' };
const E = (a, b, kind = 'spawn', o = {}) => ({ from: a === 'human' ? 'human' : `s:${a}`, to: `s:${b}`, kind, label: null, count: 1, ...o });
const hit = (a, b) => a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;
const inside = (a, o) => a.x >= o.x - 0.5 && a.y >= o.y - 0.5 && a.x + a.w <= o.x + o.w + 0.5 && a.y + a.h <= o.y + o.h + 0.5;
const tiersOf = (g) => new Map(g.nodes.filter((n) => n.kind === 'session').map((n) => [n.id, nodeTier(n)]));
const VG = [{ id: 'g1', name: 'work', members: ['app', 'api', 'docs'] }, { id: 'g2', name: 'side', members: ['notes', 'misc'] }];
const ORDER = ['app', 'api', 'docs', 'notes', 'misc', 'tools', 'scratch'];

function mixed() {
  clock = 0;
  const nodes = [{ id: 'human', kind: 'human', name: 'you' },
    node('lead', 'app', work), node('ui', 'app', { parentId: 's:lead', ...work }), node('tests', 'app', { parentId: 's:lead' }), node('build', 'app', { parentId: 's:lead', state: 'waiting', category: 'needs_you' }),
    node('ui-a', 'app', { parentId: 's:ui' }), node('ui-b', 'app', { parentId: 's:ui', ...work }), node('term', 'notes', { parentId: 's:lead', ...work }),
    node('app-notes', 'app'), node('app-try', 'app', work), node('app-old', 'app', { state: 'sleeping' }),
    node('lead2', 'api', work), node('schema', 'api', { parentId: 's:lead2' }), node('perf', 'api', { parentId: 's:lead2', state: 'error' }), node('port', 'api', { parentId: 's:lead2' }), node('p4', 'api', { parentId: 's:lead2' }), node('api-x', 'api'),
    node('docs-a', 'docs', { state: null, category: 'done' }), node('docs-b', 'docs', work),
    ...Array.from({ length: 7 }, (_, i) => node(`note${i}`, 'notes', i === 2 ? work : {})),
    node('misc-a', 'misc'), node('misc-b', 'misc', { state: 'exited', category: 'exited' }),
    node('lead3', 'tools'), node('t1', 'tools', { parentId: 's:lead3', role: 'reviewer' }), node('t2', 'tools', { parentId: 's:lead3' }),
    node('sc-a', 'scratch'), node('sc-b', 'scratch')];
  const edges = [E('lead', 'ui'), E('lead', 'tests'), E('lead', 'build', 'role', { label: 'builder' }), E('lead', 'term'), E('ui', 'ui-a'), E('ui', 'ui-b'), E('lead2', 'schema'), E('lead2', 'perf'), E('lead2', 'port'), E('lead2', 'p4'),
    E('lead3', 't1', 'role', { label: 'reviewer' }), E('lead3', 't2', 'prompt'),
    E('human', 'lead', 'bar', { count: 3, label: 'ship it' }), E('tests', 'perf', 'prompt', { label: 'check perf' })];
  // t1·t2는 부모(parentId)가 아니라 역할·시킴으로만 이었다 → 나무 부모를 그 선으로 고른다
  nodes.find((n) => n.id === 's:t1').parentId = null; nodes.find((n) => n.id === 's:t2').parentId = null;
  return { nodes, edges };
}

// 큰 판: 워크스페이스 10개(폴더 셋 + 폴더 밖), 팀 다섯, 세션 40개 안팎
function big() {
  clock = 0;
  const nodes = [], edges = [];
  const ws = Array.from({ length: 10 }, (_, i) => `ws${i}`);
  for (let t = 0; t < 5; t++) {
    const w = ws[t * 2];
    nodes.push(node(`lead${t}`, w, t % 2 ? work : {}));
    for (let k = 0; k < 3 + (t % 3); k++) { nodes.push(node(`w${t}-${k}`, w, { parentId: `s:lead${t}`, ...(k === 0 ? work : k === 1 && t === 2 ? { state: 'waiting', category: 'needs_you' } : {}) })); edges.push(E(`lead${t}`, `w${t}-${k}`)); }
  }
  nodes.push(node('w0-0-sub', 'ws0', { parentId: 's:w0-0', ...work })); edges.push(E('w0-0', 'w0-0-sub'));
  for (let i = 0; i < 10; i++) for (let j = 0; j < (i % 3) + 1; j++) nodes.push(node(`solo${i}-${j}`, ws[i], j === 2 ? { state: 'sleeping' } : {}));
  edges.push(E('w1-0', 'w3-1', 'prompt', { label: 'x' }));
  return { nodes, edges, vg: [{ id: 'A', name: 'alpha', members: ['ws0', 'ws1', 'ws2'] }, { id: 'B', name: 'beta', members: ['ws3', 'ws4', 'ws5', 'ws6'] }, { id: 'C', name: 'gamma', members: ['ws7'] }], order: ws };
}

function checkGeometry(lay, width) {
  const solid = lay.rows.filter((r) => r.kind !== 'head');
  for (let i = 0; i < lay.rows.length; i++) for (let j = i + 1; j < lay.rows.length; j++) assert.ok(!hit(lay.rows[i], lay.rows[j]), `줄 겹침 ${lay.rows[i].id} × ${lay.rows[j].id}`);
  for (const r of solid) {
    if (r.squad) assert.ok(inside(r, lay.squads.find((s) => s.root === r.squad)), `줄 ${r.id}은 자기 부대 카드 안`);
    assert.ok(inside(r, lay.blocks.find((b) => b.key === r.ws)), `줄 ${r.id}은 자기 워크스페이스 판 안`);
  }
  for (const s of lay.squads) assert.ok(inside(s, lay.blocks.find((b) => b.key === s.ws)), `부대 ${s.root}는 판 안`);
  for (let i = 0; i < lay.squads.length; i++) for (let j = i + 1; j < lay.squads.length; j++) assert.ok(!hit(lay.squads[i], lay.squads[j]), '부대 겹침');
  for (let i = 0; i < lay.blocks.length; i++) for (let j = i + 1; j < lay.blocks.length; j++) assert.ok(!hit(lay.blocks[i], lay.blocks[j]), `판 겹침 ${lay.blocks[i].key} × ${lay.blocks[j].key}`);
  for (let i = 0; i < lay.folders.length; i++) for (let j = i + 1; j < lay.folders.length; j++) assert.ok(!hit(lay.folders[i], lay.folders[j]), '폴더 틀 겹침');
  for (const b of lay.blocks) {
    if (b.folder) assert.ok(lay.folders.some((f) => f.id === b.folder && inside(b, f)), `폴더 안 판 ${b.key}은 그 폴더 틀 안`);
    else assert.ok(!lay.folders.some((f) => hit(b, f)), `폴더 밖 판 ${b.key}은 틀과 겹치지 않는다`);
  }
  assert.ok(lay.width <= Math.max(width, ROSTER.colMin + ROSTER.pad * 2) + 0.5, `지도 폭 ${lay.width} ≤ 칸 ${width}`);
}

test('섞은 판: 겹침 없음, 폴더 > 워크스페이스, 줄은 부대·판 안 (폭 여럿)', () => {
  const g = mixed();
  for (const width of [480, 900, 1300, 1584, 2560]) {
    const lay = rosterLayout(g, { order: ORDER, vgroups: VG, tiers: tiersOf(g), width });
    checkGeometry(lay, width);
    // 모든 세션이 한 번씩 읽는 차례에 있다(키보드)
    assert.equal(new Set(lay.order).size, g.nodes.length - 1, `차례에 세션 모두 (폭 ${width})`);
    assert.equal(lay.order.length, g.nodes.length - 1);
  }
});

test('팀 나무: 들여쓰기·차례·관계 종류·다른 워크스페이스 하위', () => {
  const g = mixed();
  const lay = rosterLayout(g, { order: ORDER, vgroups: VG, tiers: tiersOf(g), width: 1584 });
  const row = (n) => lay.byId.get(`s:${n}`);
  assert.equal(row('lead').kind, 'head');
  assert.equal(lay.teamNo.get('s:lead'), 1); assert.equal(lay.teamNo.get('s:lead2'), 2); assert.equal(lay.teamNo.get('s:lead3'), 3);
  for (const k of ['ui', 'tests', 'build', 'term']) { assert.equal(row(k).depth, 1); assert.ok(row(k).y > row('lead').y); assert.equal(row(k).squad, 's:lead'); }
  for (const k of ['ui-a', 'ui-b']) { assert.equal(row(k).depth, 2); assert.ok(row(k).x > row('ui').x, '손자는 한 단 더 들여쓴다'); assert.ok(row(k).y > row('ui').y); }
  assert.ok(row('ui-a').y < row('tests').y, '나무 차례(깊이 먼저)');
  // 다른 워크스페이스(notes)의 하위 세션 term은 부모 부대(app 판) 안, cross
  assert.equal(row('term').ws, 'app'); assert.ok(row('term').cross);
  assert.ok(lay.guides.find((g1) => g1.to === 's:term').cross);
  // 관계 종류: 띄움, 역할(build는 parentId + role 선 → 부모가 정해진 띄움), lead3 → t1 역할, t2 시킴
  const rel = (n) => lay.guides.find((x) => x.to === `s:${n}`).rel;
  assert.equal(rel('ui'), 'spawn'); assert.equal(rel('t1'), 'role'); assert.equal(rel('t2'), 'prompt');
  // 나무 밖 시킴(tests → perf)은 연결로 남고 곡선을 그릴 수 있다
  const l = lay.links.find((x) => x.from === 's:tests' && x.to === 's:perf');
  assert.ok(l && l.rel === 'prompt');
  assert.match(linkPath(row('tests'), row('perf')), /^M[\d.]+ [\d.]+ C/);
  // 혼자인 세션: 쉬는 것이 foldMin개 넘으면 알약 묶음
  const notes = lay.rows.find((r) => r.kind === 'fold' && r.id === 'fold:ws:notes');
  assert.ok(notes && notes.ids.length === 6, '노트 판의 쉬는 여섯은 한 묶음');
  assert.ok(lay.rows.some((r) => r.id === 's:note2' && r.kind === 'solo'), '일하는 혼자인 세션은 줄');
});

test('쉬는 잎 하위가 많으면 부대 안에서 알약 묶음', () => {
  const g = mixed();
  const lay = rosterLayout(g, { order: ORDER, vgroups: VG, tiers: tiersOf(g), width: 1584 });
  const f = lay.rows.find((r) => r.kind === 'fold' && r.parent === 's:lead2');
  assert.ok(f, 'lead2 아래 쉬는 셋(schema, port, p4)은 묶음');
  assert.deepEqual(f.ids.sort(), ['s:p4', 's:port', 's:schema']);
  assert.ok(lay.byId.get('s:perf').kind === 'row', '오류인 perf는 줄로 남는다');
  assert.ok(lay.guides.some((x) => x.ids && x.ids.includes('s:port')), '묶음에도 나무 선');
  assert.equal(foldHeight(3, 400), ROSTER.fold); assert.equal(foldHeight(9, 240), ROSTER.fold * 5);
});

test('기다리는 일 줄: 응답 필요·오류가 먼저, 그다음 작업 완료', () => {
  const g = mixed();
  const tiers = tiersOf(g);
  const lay = rosterLayout(g, { order: ORDER, vgroups: VG, tiers, width: 1584 });
  const dock = dockOf(lay.order, (id) => tiers.get(id));
  assert.deepEqual(dock.map((id) => id.slice(2)), ['build', 'perf', 'docs-a']);
});

test('폴더가 두 기둥에 걸치면 다음 기둥에 머리를 다시 단다(이어짐)', () => {
  const b = big();
  const g = { nodes: b.nodes, edges: b.edges };
  const lay = rosterLayout(g, { order: b.order, vgroups: b.vg, tiers: tiersOf(g), width: 1584 });
  checkGeometry(lay, 1584);
  const ids = lay.folders.map((f) => f.id);
  for (const id of new Set(ids)) { const fs1 = lay.folders.filter((f) => f.id === id); assert.equal(fs1.filter((f) => !f.cont).length, 1, `폴더 ${id}의 첫 틀은 하나`); }
  // 읽는 차례는 판 차례 그대로(위 → 아래, 왼쪽 → 오른쪽)
  const seq = lay.blocks.map((x) => x.key);
  assert.deepEqual(seq, [...seq].sort((p, q) => b.order.indexOf(p) - b.order.indexOf(q)));
});

test('큰 판 크기: 넓은 칸에서 기둥 여럿, 고르게 나눈다', () => {
  const b = big();
  const g = { nodes: b.nodes, edges: b.edges };
  const tiers = tiersOf(g);
  const one = rosterLayout(g, { order: b.order, vgroups: b.vg, tiers, width: 440 });
  assert.equal(one.cols, 1);
  for (const [width, minCols, maxH] of [[1366 - 40, 3, 0.45], [1584 - 40, 3, 0.4], [2560 - 40, 5, 0.3]]) {
    const lay = rosterLayout(g, { order: b.order, vgroups: b.vg, tiers, width });
    checkGeometry(lay, width);
    assert.ok(lay.cols >= minCols, `폭 ${width}: 기둥 ${lay.cols} ≥ ${minCols}`);
    assert.ok(lay.height <= one.height * maxH, `폭 ${width}: 높이 ${lay.height} ≤ 한 기둥 ${one.height} × ${maxH}`);
    assert.equal(lay.order.length, g.nodes.length);
  }
  // 1584 칸(창 1584×921의 지도 칸)에서 세션 40개 안팎이 한 화면 높이 안에 든다(기다리는 일 줄과 머리를 뺀 ~700)
  const lay = rosterLayout(g, { order: b.order, vgroups: b.vg, tiers, width: 1544 });
  assert.ok(lay.height <= 720, `큰 판 높이 ${lay.height}`);
});

test('지도 칸 높이(fit)에 들면 기둥을 덜 쓴다', () => {
  const b = big();
  const g = { nodes: b.nodes, edges: b.edges };
  const tiers = tiersOf(g);
  const full = rosterLayout(g, { order: b.order, vgroups: b.vg, tiers, width: 2520 });
  const tall = rosterLayout(g, { order: b.order, vgroups: b.vg, tiers, width: 2520, fit: 1180 });
  const short = rosterLayout(g, { order: b.order, vgroups: b.vg, tiers, width: 2520, fit: 300 });
  assert.ok(tall.height <= 1180, `높이 ${tall.height} ≤ 칸`);
  assert.ok(!tall.folders.some((f) => f.cont), '높은 칸에서는 폴더를 두 기둥에 나누지 않는다');
  assert.ok(full.folders.some((f) => f.cont), '(칸 높이를 모르면 고르게 나누며 폴더가 걸칠 수 있다)');
  assert.ok(tall.cols >= 3, `기둥 하나로 길게 쌓지 않는다(${tall.cols})`);
  assert.equal(short.cols, full.cols, '들지 않으면 기둥을 모두 쓴다');
  checkGeometry(tall, 2520);
});

test('선형 분할: 가장 높은 기둥을 가장 낮게, 차례 유지', () => {
  const hs = [5, 5, 5, 5, 20, 5, 5];
  const parts = partition(hs, 3, (i) => hs[i]);
  assert.deepEqual(parts.flat(), hs.map((_, i) => i));
  assert.ok(parts.length <= 3);
  assert.ok(Math.max(...parts.map((p) => p.reduce((s, i) => s + hs[i], 0))) <= 25);
  assert.deepEqual(partition([], 3, () => 0), []);
});

test('접은 워크스페이스는 머리만', () => {
  const g = mixed();
  const lay = rosterLayout(g, { order: ORDER, vgroups: VG, tiers: tiersOf(g), width: 1584, collapsed: ['app'] });
  const b = lay.blocks.find((x) => x.key === 'app');
  assert.ok(b.collapsed && b.h === ROSTER.wsHead);
  assert.ok(!lay.rows.some((r) => r.ws === 'app'));
  checkGeometry(lay, 1584);
});

test('모양 고르기: 기본은 부대, 설정 missionStyle classic이면 옛 지도', () => {
  assert.equal(DEFAULT_MISSION_STYLE, 'squads');
  assert.deepEqual(MISSION_STYLES, ['squads', 'classic']);
  assert.equal(missionStyleOf(null), 'squads');
  assert.equal(missionStyleOf({ missionStyle: 'classic' }), 'classic');
  assert.equal(missionStyleOf({ missionStyle: 'nope' }), 'squads');
  const m = read('Mission.jsx');
  assert.match(m, /function ClassicMap\(/, '옛 지도 코드가 남아 있다');
  assert.match(m, /style === 'classic' \? <ClassicMap/);
  const s = read('MissionSquads.jsx');
  assert.match(s, /settings\.set', \{ key: 'missionStyle'/);
  for (const lang of ['en', 'ko']) assert.match(read(`locales/${lang}.js`), /mmSquad: \{[\s\S]*style_classic:/);
  // 일하는 줄의 고리는 P107과 같은 조건에서만 돈다(workLight, 움직임 줄이기, 가벼운 판)
  const css = read('styles.css');
  assert.match(css, /html:not\(\.mt-lite\):not\(\[data-work-light="off"\]\):not\(\[data-work-light="system"\]\) \.mt-sq-pulse/);
  assert.match(css, /prefers-reduced-motion: no-preference\) \{ html:not\(\.mt-lite\)\[data-work-light="system"\] \.mt-sq-pulse/);
});
