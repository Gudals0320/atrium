// P148 단위 시험: 휴대폰 미션 맵 "부대" 배치(lib/phone-squads.js = PC rosterLayout을 한 열·손가락 치수로).
// - 세로(375·393)·가로(852)·넓은 화면(1200) 모두 기둥 하나, 지도 폭은 화면 안(PHONE_MAX에서 멈춤), 줄끼리 겹치지 않는다.
// - 줄은 자기 부대 카드·워크스페이스 판 안, 판은 폴더 틀 안, 위 → 아래로 폴더 > 워크스페이스 차례.
// - 손가락 크기: 줄·알약 묶음 줄 44px 이상, 부대 머리 64px.
// - 기다리는 일 차례: 응답 필요·오류가 먼저, 그다음 작업 완료.
// - 화면 연결: PhoneMission이 missionStyle classic이면 옛 지도, 아니면 PhoneSquads.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { phoneSquads, phoneRosterR, PHONE_MAX } from '../src/renderer/lib/phone-squads.js';
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
const VG = [{ id: 'g1', name: 'work', members: ['app', 'api'] }, { id: 'g2', name: 'side', members: ['notes'] }];
const ORDER = ['app', 'api', 'notes', 'misc'];

function mixed() {
  clock = 0;
  const nodes = [{ id: 'human', kind: 'human', name: 'you' },
    node('lead', 'app', work), node('ui', 'app', { parentId: 's:lead', ...work }), node('tests', 'app', { parentId: 's:lead', state: null, category: 'done' }), node('build', 'app', { parentId: null, state: 'waiting', category: 'needs_you' }),
    node('ui-a', 'app', { parentId: 's:ui' }), node('term', 'notes', { parentId: 's:lead', ...work }), node('app-solo', 'app'),
    node('lead2', 'api'), node('perf', 'api', { parentId: 's:lead2', state: 'error' }), node('p2', 'api', { parentId: 's:lead2' }), node('p3', 'api', { parentId: 's:lead2' }), node('p4', 'api', { parentId: 's:lead2' }),
    ...Array.from({ length: 6 }, (_, i) => node(`note${i}`, 'notes', i === 1 ? work : {})), node('misc-a', 'misc', { state: 'waiting', category: 'needs_you' })];
  const edges = [E('lead', 'ui'), E('lead', 'tests'), E('lead', 'build', 'role', { label: 'builder' }), E('lead', 'term'), E('ui', 'ui-a'),
    E('lead2', 'perf'), E('lead2', 'p2'), E('lead2', 'p3'), E('lead2', 'p4'), E('tests', 'perf', 'prompt', { label: 'x' })];
  return { nodes, edges };
}
function big() {
  clock = 0;
  const nodes = [], edges = [];
  const ws = Array.from({ length: 8 }, (_, i) => `ws${i}`);
  for (let t = 0; t < 4; t++) {
    nodes.push(node(`lead${t}`, ws[t * 2], t % 2 ? work : {}));
    for (let k = 0; k < 3 + t; k++) { nodes.push(node(`w${t}-${k}`, ws[t * 2], { parentId: `s:lead${t}`, ...(k === 0 ? work : k === 1 && t === 2 ? { state: 'waiting', category: 'needs_you' } : {}) })); edges.push(E(`lead${t}`, `w${t}-${k}`)); }
  }
  for (let i = 0; i < 8; i++) for (let j = 0; j < (i % 3) + 1; j++) nodes.push(node(`solo${i}-${j}`, ws[i], j === 2 ? { state: 'sleeping' } : {}));
  return { nodes, edges, vg: [{ id: 'A', name: 'alpha', members: ['ws0', 'ws1', 'ws2'] }], order: ws };
}

function geometry(lay, width) {
  const R1 = lay.R;
  assert.equal(lay.cols, 1, '한 열');
  assert.ok(lay.width <= Math.min(width, PHONE_MAX) + 0.5, `지도 폭 ${lay.width} ≤ 화면 ${width}`);
  for (let i = 0; i < lay.rows.length; i++) for (let j = i + 1; j < lay.rows.length; j++) assert.ok(!hit(lay.rows[i], lay.rows[j]), `줄 겹침 ${lay.rows[i].id} × ${lay.rows[j].id}`);
  for (const r of lay.rows) {
    assert.ok(r.x >= R1.pad - 0.5 && r.x + r.w <= lay.width - R1.pad + 0.5, `줄 ${r.id}은 지도 폭 안`);
    if (r.kind !== 'head' && r.squad) assert.ok(inside(r, lay.squads.find((s) => s.root === r.squad)), `줄 ${r.id}은 자기 부대 카드 안`);
    assert.ok(inside(r, lay.blocks.find((b) => b.key === r.ws)), `줄 ${r.id}은 자기 워크스페이스 판 안`);
    if (r.kind === 'head') assert.equal(r.h, 64, '부대 머리 64');
    else assert.ok(r.h >= 44, `줄 ${r.id} 높이 ${r.h} ≥ 44(손가락)`);
  }
  for (const b of lay.blocks) if (b.folder) assert.ok(lay.folders.some((f) => f.id === b.folder && inside(b, f)), `판 ${b.key}은 폴더 틀 안`);
  for (let i = 0; i < lay.blocks.length; i++) for (let j = i + 1; j < lay.blocks.length; j++) assert.ok(!hit(lay.blocks[i], lay.blocks[j]), `판 겹침 ${lay.blocks[i].key} × ${lay.blocks[j].key}`);
  for (let i = 1; i < lay.blocks.length; i++) assert.ok(lay.blocks[i].y > lay.blocks[i - 1].y, '판은 위 → 아래로 한 줄');
}

test('P148 섞은 판: 세로·가로·넓은 화면 모두 한 열, 겹침 없음, 손가락 크기', () => {
  const g = mixed();
  for (const w of [375, 393, 852, 1200]) {
    const lay = phoneSquads(g, { width: w, tiers: tiersOf(g), order: ORDER, vgroups: VG });
    geometry(lay, w);
    assert.deepEqual(lay.blocks.map((b) => b.key), ORDER, '폴더 차례대로(work: app·api, side: notes, 폴더 밖 misc)');
    assert.deepEqual(lay.folders.map((f) => f.name), ['work', 'side']);
  }
});

test('P148 팀 나무: 하위는 리드 아래 들여쓰기, 다른 워크스페이스 하위는 ↗(cross), 쉬는 하위 셋 이상은 알약 묶음', () => {
  const g = mixed();
  const lay = phoneSquads(g, { width: 393, tiers: tiersOf(g), order: ORDER, vgroups: VG });
  const row = (id) => lay.rows.find((r) => r.id === `s:${id}`);
  assert.equal(row('lead').kind, 'head');
  assert.ok(row('ui').y > row('lead').y && row('ui-a').x > row('ui').x && row('ui-a').y > row('ui').y);
  assert.equal(row('term').cross, true);
  const fold = lay.rows.find((r) => r.kind === 'fold' && r.parent === 's:lead2');
  assert.ok(fold && fold.ids.length === 3, '쉬는 잎 하위 셋 → 알약 묶음');
  assert.ok(lay.guides.some((x) => x.rel === 'role'), '역할 선');
  assert.equal(new Set(lay.order).size, g.nodes.length - 1, '모든 세션이 한 번씩');
});

test('P148 기다리는 일 차례: 응답 필요·오류 → 작업 완료', () => {
  const g = mixed();
  const tiers = tiersOf(g);
  const lay = phoneSquads(g, { width: 393, tiers, order: ORDER, vgroups: VG });
  const ts = lay.dock.map((id) => tiers.get(id));
  assert.deepEqual(lay.dock.map((id) => id.slice(2)), ['build', 'perf', 'misc-a', 'tests']);
  assert.ok(ts.lastIndexOf('turn') < ts.indexOf('review') && ts.lastIndexOf('alert') < ts.indexOf('review'));
});

test('P148 큰 판(세션 40개 안팎): 한 열, 겹침 없음, 접으면 짧아진다', () => {
  const g = big();
  assert.ok(g.nodes.length >= 30);
  const lay = phoneSquads(g, { width: 390, tiers: tiersOf(g), order: g.order, vgroups: g.vg });
  geometry(lay, 390);
  const shut = phoneSquads(g, { width: 390, tiers: tiersOf(g), order: g.order, vgroups: g.vg, collapsed: ['ws0', 'ws2'] });
  geometry(shut, 390);
  assert.ok(shut.height < lay.height - 100);
  assert.ok(shut.blocks.find((b) => b.key === 'ws0').collapsed);
});

test('P148 치수: 좁은 화면도 280 밑으로 줄지 않고, 넓은 화면은 PHONE_MAX에서 멈춘다', () => {
  assert.equal(phoneRosterR(320).colMin, 300);
  assert.equal(phoneRosterR(200).colMin, 260);
  assert.equal(phoneRosterR(2000).colMin, PHONE_MAX - 20);
});

test('P148 화면 연결: missionStyle classic이면 옛 휴대폰 지도, 기본은 부대', () => {
  const pm = read('PhoneMission.jsx');
  assert.match(pm, /style === 'classic' \? <PhoneClassic/);
  assert.match(pm, /missionStyleOf\(settings\)/);
  const sq = read('PhoneSquads.jsx');
  assert.match(sq, /phoneSquads\(/);
  assert.doesNotMatch(sq.replace(/^\s*\/\/.*$/gm, ''), /webgl|backdrop-filter|will-change/i, '가볍게(P84·P86)');
  const css = read('phone.css');
  const block = css.slice(css.indexOf('/* ---------- P148'));
  assert.doesNotMatch(block.replace(/\/\*[\s\S]*?\*\//g, ''), /backdrop-filter|will-change|filter:/, '휴대폰 CSS에 filter 없음');
});

test('P148 기둥 하나로 묶으면 틈이 쌓여도 둘로 넘치지 않는다(partition 위쪽 끝)', () => {
  clock = 0;
  const ws = Array.from({ length: 10 }, (_, i) => `w${i}`);
  const g = { nodes: [{ id: 'human', kind: 'human', name: 'you' }, ...ws.map((w) => node(`solo-${w}`, w))], edges: [] };
  for (const width of [393, 412, 915]) {
    const lay = phoneSquads(g, { width, tiers: tiersOf(g), order: ws });
    geometry(lay, width);
    assert.equal(new Set(lay.blocks.map((b) => b.x)).size, 1);
  }
});
