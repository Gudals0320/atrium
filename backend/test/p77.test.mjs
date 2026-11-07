// P77 단위 시험: 덩어리의 크기 막대(방향·비율·단계)는 칸 하나에 쓴다(칸 하나 = 같은 값의 단독 세션). 바깥 크기는 배치 틀에서 나온다.
// dock-tree.mjs cellTree, canvas.mjs dockCellOf, canvas-ops.mjs(board.setSize, dock.attach·remove·layout·update). herdr와 claude 없이 돈다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { stepSize, dockCellOf, fitsAspect, DOCK_CELL } from '../src/canvas.mjs';
import { cellTree, presetTree, layout, dragOuter, normalize, leaves } from '../src/dock-tree.mjs';
import { newRuntime } from '../src/state.mjs';
import { Store } from '../src/store.mjs';
import * as ops from '../src/canvas-ops.mjs';

const R = (x, y, w = 1440, h = 810) => ({ x, y, w, h });
const area = (r) => r.w * r.h;
const near = (a, b, tol = 2) => Math.abs(a - b) <= tol;

function fakeBackend(file = null) {
  const dbFile = file || path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p77-')), 'board.db');
  const store = new Store(dbFile);
  const sessions = new Map();
  const b = { store, sessions, events: [], api: { broadcast: () => {} }, log: () => {}, nameOf: (sid) => (sessions.get(sid) || { name: sid }).name };
  b.resolve = (ref) => { const s = sessions.get(ref) || [...sessions.values()].find((x) => x.name === ref); if (!s) throw Object.assign(new Error(`없는 세션: ${ref}`), { code: 'not_found' }); return s; };
  if (!file) store.insertWorkspace({ key: 'ws', kind: 'folder', root: 'C:/ws', createdAt: 1 });
  const add = (name, rect, extra = {}) => {
    const s = { sessionId: `id-${name}`, name, kind: 'shell', workspaceKey: 'ws', cwd: 'C:/ws', rt: newRuntime({ kind: 'shell', hooked: false }), origin: 'board', createdAt: 1 };
    sessions.set(s.sessionId, s);
    if (!file) { store.insertSession({ ...s, permissionMode: 'manual', runtime: s.rt }); store.setNode({ session_id: s.sessionId, ...rect, z: 0, ...extra }); }
  };
  const node = (name) => store.nodes().find((x) => x.session_id === `id-${name}`);
  const at = (name) => { const n = node(name); return n && R(n.x, n.y, n.w, n.h); };
  const outer = (name) => ops.dockOuter(b, ops.dockOf(b, `id-${name}`));
  const cell = (name) => ops.dockCell(b, ops.dockOf(b, `id-${name}`));
  return { b, add, at, node, outer, cell, store, file: dbFile };
}
const four = (env) => { for (const [i, n] of ['a', 'b', 'c', 'd'].entries()) env.add(n, R(i * 2000, 0)); return ['a', 'b', 'c', 'd']; };

test('칸 기준 나무(cellTree): 고른 틀은 칸이 모두 같고 바깥은 칸을 모은 크기', () => {
  const ids = ['a', 'b', 'c', 'd'];
  const h = cellTree(presetTree('row', ids), stepSize('wide', '16:9', 'large'));
  assert.deepEqual([h.w, h.h], [7680, 1080], 'H 넷 가로형 16:9 크게: 바깥 7680×1080');
  for (const r of layout(h.tree, { x: 0, y: 0, w: h.w, h: h.h }).rects.values()) assert.deepEqual([r.w, r.h], [1920, 1080]);
  const v = cellTree(presetTree('col', ids), stepSize('tall', '4:3', 'normal'));
  assert.deepEqual([v.w, v.h], [900, 4800], 'V 넷 세로형 4:3 보통: 바깥 900×4800');
  for (const r of layout(v.tree, { x: 0, y: 0, w: v.w, h: v.h }).rects.values()) assert.deepEqual([r.w, r.h], [900, 1200]);
  const g = cellTree(presetTree('grid', ids), stepSize('wide', '16:9', 'normal'));
  assert.deepEqual([g.w, g.h], [2880, 1620], '2 × 2 가로형 16:9 보통: 바깥 2880×1620(바깥도 16:9)');
  for (const r of layout(g.tree, { x: 0, y: 0, w: g.w, h: g.h }).rects.values()) assert.deepEqual([r.w, r.h], [1440, 810]);
  assert.deepEqual(cellTree('a', { w: 1440, h: 810 }), { tree: 'a', w: 1440, h: 810 }, '잎 하나는 칸 그대로');
});

test('고르지 않은 틀과 Ctrl+끌기 나무: 모든 칸이 같은 모양, 가장 작은 칸이 고른 크기, 큰 칸은 작은 칸을 모은 크기', () => {
  const cell = stepSize('wide', '16:9', 'normal');
  const rectsOf = (t) => { const c = cellTree(t, cell); return { c, rs: [...layout(c.tree, { x: 0, y: 0, w: c.w, h: c.h }).rects.entries()] }; };
  const check = (t, name) => {
    const { c, rs } = rectsOf(t);
    for (const [id, r] of rs) assert.ok(fitsAspect(r, '16:9') && r.w >= r.h, `${name} ${id} ${r.w}×${r.h}는 16:9 가로형`);
    const small = rs.reduce((a, x) => (area(x[1]) < area(a[1]) ? x : a))[1];
    assert.ok(near(small.w, cell.w) && near(small.h, cell.h), `${name} 가장 작은 칸 ${small.w}×${small.h}`);
    return { c, rs: new Map(rs) };
  };
  // 1 + 2(main-left): 큰 칸이 작은 칸 2 × 2, 바깥 3 × 2칸
  let { c, rs } = check(presetTree('main-left', ['a', 'b', 'c']), 'main-left');
  assert.deepEqual([c.w, c.h], [3 * 1440, 2 * 810]);
  assert.deepEqual([rs.get('a').w, rs.get('a').h], [2880, 1620]);
  // 1 + 3(main-left-3): 큰 칸이 3 × 3, 바깥 4 × 3칸
  ({ c, rs } = check(presetTree('main-left-3', ['a', 'b', 'c', 'd']), 'main-left-3'));
  assert.deepEqual([c.w, c.h, rs.get('a').w], [4 * 1440, 3 * 810, 3 * 1440]);
  // 위 하나 아래 둘(main-top), 1 + 5(main-big5): 큰 칸 2 × 2
  ({ c } = check(presetTree('main-top', ['a', 'b', 'c']), 'main-top'));
  assert.deepEqual([c.w, c.h], [2 * 1440, 3 * 810]);
  ({ c, rs } = check(presetTree('main-big5', ['a', 'b', 'c', 'd', 'e', 'f']), 'main-big5'));
  assert.deepEqual([c.w, c.h, rs.get('a').w], [3 * 1440, 3 * 810, 2 * 1440]);
  // 왼쪽 둘·오른쪽 셋(cols-2-3): 높이가 같아야 하므로 왼쪽 칸이 작은 칸의 1.5배(모은 크기가 될 수 없는 틀은 모양을 지킨다)
  ({ rs } = check(presetTree('cols-2-3', ['a', 'b', 'c', 'd', 'e']), 'cols-2-3'));
  assert.ok(near(rs.get('a').w, 2160) && near(rs.get('a').h, 1215), JSON.stringify(rs.get('a')));
  // Ctrl+끌기로 반씩 번갈아 나눈 나무(소용돌이, 잎 다섯): 잎마다 모양은 그대로(납작한 잎이 없다). 대신 큰 칸이 커진다:
  // 반씩 나눈 넓이 비는 a : d = 8인데 칸 기준은 한 변 5배(넓이 25배). 깊이가 하나 늘 때마다 한 변이 대략 피보나치 수만큼 는다(보고 절)
  const spiral = normalize({ dir: 'row', kids: ['a', { dir: 'col', kids: ['b', { dir: 'row', kids: ['c', { dir: 'col', kids: ['d', 'e'] }] }] }] });
  ({ c, rs } = check(spiral, 'spiral'));
  assert.ok(near(rs.get('a').w, 5 * 1440, 3) && near(rs.get('a').h, 5 * 810, 3), JSON.stringify(rs.get('a')));
  assert.ok(near(rs.get('b').w, 3 * 1440, 3) && near(rs.get('c').w, 2 * 1440, 3), '큰 칸은 작은 칸을 모은 크기(5, 3, 2, 1, 1)');
  assert.deepEqual(leaves(c.tree), ['a', 'b', 'c', 'd', 'e'], '잎 차례는 그대로');
});

test('칸 상태(dockCellOf): 칸은 가장 작은 노드, 비율 불은 모든 칸이 기록한 비율일 때만', () => {
  const g = [R(0, 0, 1440, 810), R(1440, 0, 1440, 810)];
  assert.deepEqual(dockCellOf(g, '16:9'), { cell: { w: 1440, h: 810 }, dir: 'wide', aspect: '16:9', level: 'normal' });
  assert.equal(dockCellOf(g, null).aspect, null, '기록이 없으면 꺼짐');
  // P73 바깥 기준으로 짠 H 넷(바깥 1920×1080): 칸이 480×1080이라 16:9 불이 꺼지고 세로형으로 보인다
  const old = [0, 1, 2, 3].map((i) => R(i * 480, 0, 480, 1080));
  assert.deepEqual(dockCellOf(old, '16:9'), { cell: { w: 480, h: 1080 }, dir: 'tall', aspect: null, level: null });
  // 큰 칸과 작은 칸이 같은 모양이면 불, 작은 칸의 단계
  assert.deepEqual(dockCellOf([R(0, 0, 2880, 1620), R(2880, 0, 1440, 810), R(2880, 810, 1440, 810)], '16:9').level, 'normal');
  assert.equal(dockCellOf([R(0, 0, 1440, 810), R(1440, 0, 810, 1440)], '16:9').aspect, null, '방향이 섞이면 꺼짐');
});

test('API: 막대는 칸에 쓴다. H 넷 가로형 16:9 크게, V 넷 세로형 4:3 보통, 2 × 2 가로형 16:9 보통', () => {
  const env = fakeBackend();
  const { b, at, outer, cell } = env;
  const ids = four(env);
  const { dock } = ops.dockLayout(b, { members: ids, preset: 'row' });
  assert.deepEqual([outer('a').w, outer('a').h], [4 * DOCK_CELL.w, DOCK_CELL.h], '새 덩어리 칸은 960×540');
  assert.equal(cell('a').aspect, '16:9');
  const o0 = outer('a');
  const r = ops.setSize(b, { session: 'b', dir: 'wide', aspect: '16:9', level: 'large', scope: 'dock' });
  assert.deepEqual([r.w, r.h, r.outer.w, r.outer.h, r.level], [1920, 1080, 7680, 1080, 'large'], '칸 1920×1080, 바깥 7680×1080');
  for (const n of ids) assert.deepEqual([at(n).w, at(n).h], [1920, 1080]);
  assert.deepEqual([outer('a').x, outer('a').y], [o0.x, o0.y], '왼쪽 위 그대로');
  assert.deepEqual([cell('a').dir, cell('a').aspect, cell('a').level], ['wide', '16:9', 'large'], '막대 불: 가로형·16:9·크게');
  // V 넷 세로형 4:3 보통: 칸 900×1200, 바깥 900×4800
  ops.dockLayout(b, { members: ['a'], preset: 'col' });
  ops.setSize(b, { session: 'a', dir: 'tall', aspect: '4:3', level: 'normal', scope: 'dock' });
  assert.deepEqual([outer('a').w, outer('a').h], [900, 4800]);
  for (const n of ids) assert.deepEqual([at(n).w, at(n).h], [900, 1200]);
  // 2 × 2 가로형 16:9 보통: 칸 1440×810, 바깥 2880×1620
  ops.dockLayout(b, { members: ['a'], preset: 'grid' });
  ops.setSize(b, { session: 'a', size: 'wide-normal', scope: 'dock' });
  assert.deepEqual([outer('a').w, outer('a').h], [2880, 1620]);
  for (const n of ids) assert.deepEqual([at(n).w, at(n).h], [1440, 810]);
  assert.equal(ops.dockOf(b, 'id-a').dockId, dock.dockId);
  env.store.close();
});

test('API: 고르지 않은 틀로 바꾸면 가장 작은 칸이 지금 칸, 큰 칸은 작은 칸을 모은 크기', () => {
  const env = fakeBackend();
  const { b, at, outer, cell } = env;
  const ids = four(env);
  ops.dockLayout(b, { members: ids, preset: 'grid' });
  ops.setSize(b, { session: 'a', size: 'wide-normal', scope: 'dock' });
  ops.dockLayout(b, { members: ['a'], preset: 'main-left-3' });
  assert.deepEqual([at('b').w, at('b').h], [1440, 810], '작은 칸은 지금 칸');
  assert.deepEqual([at('a').w, at('a').h], [4320, 2430], '큰 칸은 작은 칸 3 × 3');
  assert.deepEqual([outer('a').w, outer('a').h], [5760, 2430]);
  assert.deepEqual([cell('a').aspect, cell('a').level], ['16:9', 'normal'], '불은 그대로');
  env.store.close();
});

test('API: 바깥 테두리로 바꾸면 칸이 함께 커지고 비율·단계 불이 꺼진다. 그 뒤 붙이기·떼기는 지금처럼', () => {
  const env = fakeBackend();
  const { b, at, outer, cell, add } = env;
  const ids = four(env);
  const { dock } = ops.dockLayout(b, { members: ids, preset: 'row' });
  ops.setSize(b, { session: 'a', size: 'wide-normal', scope: 'dock' });
  const o = outer('a');
  const g = dragOuter(ops.dockOf(b, 'id-a').tree, o, 'bottom', 200);
  ops.dockUpdate(b, { dock: dock.dockId, ...g });
  assert.deepEqual([at('a').w, at('a').h], [1440, 1010], '칸이 함께 커진다');
  assert.deepEqual([cell('a').aspect, cell('a').level], [null, null], '비율·단계 꺼짐');
  // 꺼진 덩어리에 붙이기: 지금처럼 붙는 노드 너비만큼 바깥이 는다(칸 크기를 맞추지 않는다)
  add('e', R(0, 6000, 1040, 585));
  ops.dockAttach(b, { session: 'e', to: 'd', side: 'right', at: 'dock' });
  assert.deepEqual([outer('a').w, outer('a').h, at('e').w], [o.w + 1040, 1010, 1040]);
  assert.deepEqual([at('a').w, at('a').h], [1440, 1010], '다른 칸 그대로');
  env.store.close();
});

test('API: 불이 든 덩어리에 붙이기·떼기는 칸 크기를 지키고 바깥이 늘거나 준다', () => {
  const env = fakeBackend();
  const { b, at, outer, cell, add } = env;
  add('a', R(0, 0)); add('b', R(2000, 0)); add('c', R(4000, 0));
  ops.dockLayout(b, { members: ['a', 'b', 'c'], preset: 'row' });
  ops.setSize(b, { session: 'a', size: 'wide-large', scope: 'dock' });
  const o = outer('a');
  assert.deepEqual([o.w, o.h], [5760, 1080]);
  // 오른쪽에 붙이기(붙는 노드는 작게): 칸 1920×1080이 되고 바깥이 7680
  add('d', R(0, 4000, 1040, 585));
  ops.dockAttach(b, { session: 'd', to: 'c', side: 'right', at: 'dock' });
  assert.deepEqual([outer('a').x, outer('a').y, outer('a').w, outer('a').h], [o.x, o.y, 7680, 1080]);
  for (const n of ['a', 'b', 'c', 'd']) assert.deepEqual([at(n).w, at(n).h], [1920, 1080], n);
  assert.deepEqual([cell('a').aspect, cell('a').level], ['16:9', 'large']);
  // 왼쪽에 붙이기: 오른쪽 변이 그대로
  add('e', R(0, 6000));
  ops.dockAttach(b, { session: 'e', to: 'a', side: 'left', at: 'dock' });
  assert.deepEqual([outer('a').x + outer('a').w, outer('a').w], [o.x + 7680, 9600]);
  // 칸 하나를 반으로(아래): 나뉜 둘이 칸 크기가 되고 나머지 칸은 그 2 × 2
  ops.dockAttach(b, { session: 'e', to: 'b', side: 'bottom', at: 'leaf' });
  assert.deepEqual([at('b').w, at('b').h, at('e').w, at('e').h], [1920, 1080, 1920, 1080]);
  assert.deepEqual([at('a').w, at('a').h], [3840, 2160]);
  // 떼기: 칸 크기는 그대로, 바깥이 준다(왼쪽 위 그대로)
  const before = outer('a');
  ops.dockRemove(b, { session: 'e' });
  for (const n of ['a', 'b', 'c', 'd']) assert.deepEqual([at(n).w, at(n).h], [1920, 1080], n);
  assert.deepEqual([outer('a').x, outer('a').y, outer('a').w, outer('a').h], [before.x, before.y, 7680, 1080]);
  ops.dockRemove(b, { session: 'd' });
  assert.deepEqual([outer('a').w, outer('a').h], [5760, 1080]);
  assert.equal(cell('a').level, 'large');
  env.store.close();
});

test('API: 혼자인 두 노드 붙이기는 대상의 비율 불을 덩어리로 옮긴다. 혼자인 세션의 크기 막대는 그대로', () => {
  const env = fakeBackend();
  const { b, at, outer, cell, add } = env;
  add('a', R(0, 0), { aspect: '16:9' }); add('b', R(3000, 0, 1040, 585));
  ops.setSize(b, { session: 'a', size: 'wide-large' });
  assert.deepEqual([at('a').w, at('a').h], [1920, 1080], '단독 세션: 1920×1080(P73 그대로)');
  ops.setSize(b, { session: 'b', size: 'tall43-small' });
  assert.deepEqual([at('b').w, at('b').h], [660, 880]);
  ops.setSize(b, { session: 'b', size: 'wide-small' });
  ops.dockAttach(b, { session: 'b', to: 'a', side: 'right' });
  assert.deepEqual([at('b').w, at('b').h, outer('a').w], [1920, 1080, 3840], '붙는 노드가 대상 칸 크기');
  assert.deepEqual([cell('a').aspect, cell('a').level], ['16:9', 'large']);
  env.store.close();
});

test('이미 있는 판: 뜰 때 덩어리 자리와 크기를 바꾸지 않고, 옛 덩어리 비율 값은 그대로 읽힌다', () => {
  const env = fakeBackend();
  const { b, add } = env;
  ['a', 'b', 'c', 'd'].forEach((n, i) => add(n, R(i * 480, 0, 480, 1080)));
  // P73 판: 바깥 1920×1080(16:9 크게)인 H 넷, 덩어리 비율 16:9
  env.store.insertDock({ dockId: 'dold', workspaceKey: 'ws', tree: presetTree('row', ['id-a', 'id-b', 'id-c', 'id-d']), origin: 'user', createdAt: 1 });
  env.store.setDockAspect('dold', '16:9');
  const file = env.file;
  const rects = env.store.nodes().map((n) => [n.session_id, n.x, n.y, n.w, n.h]);
  env.store.close();
  const again = fakeBackend(file);
  ['a', 'b', 'c', 'd'].forEach((n) => again.add(n));
  ops.migrateDocks(again.b);
  assert.deepEqual(again.store.nodes().map((n) => [n.session_id, n.x, n.y, n.w, n.h]), rects, '자리와 크기 그대로');
  assert.equal(again.store.getDock('dold').aspect, '16:9', '옛 값 그대로');
  assert.deepEqual([again.cell('a').aspect, again.cell('a').dir], [null, 'tall'], '칸이 16:9가 아니라 불은 꺼진다');
  // 사람이 막대를 누를 때부터 새 규칙: 16:9 가로형 크게 → 칸마다 1920×1080
  ops.setSize(again.b, { session: 'a', dir: 'wide', level: 'large', aspect: '16:9' });
  assert.deepEqual([again.at('c').w, again.at('c').h, again.outer('a').w], [1920, 1080, 7680]);
  again.store.close();
});
