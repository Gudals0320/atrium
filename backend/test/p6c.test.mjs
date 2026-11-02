// P6c 단위 시험: P6a 단일 캔버스와 P6b 메모·칸반을 이은 곳(빈자리·영역이 메모·칸반을 안다, 새 메모·칸반 자리, 검색, board.get).
// herdr와 claude 없이 돈다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { NODE, GAP, overlaps, freeSlot, regionRect } from '../src/canvas.mjs';
import { searchItems } from '../src/search.mjs';
import { newRuntime } from '../src/state.mjs';
import { Store } from '../src/store.mjs';
import { Backend } from '../src/backend.mjs';
import { attachFeatures } from '../src/features.mjs';
import * as ops from '../src/canvas-ops.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p6c-'));
const R = (x, y, w = NODE.w, h = NODE.h) => ({ x, y, w, h });

// 진짜 Backend에 저장소와 가짜 전달 대기열을 넣고 P6b 기능을 붙인다(타이머 없이)
function rig() {
  const b = new Backend({ quietMs: 600000, port: 0, logDir: tmp() });
  b.store = new Store(path.join(tmp(), 'board.db'));
  b.sessions = new Map();
  const events = [];
  const queue = new EventEmitter();
  queue.items = new Map();
  queue.enqueue = (sessionId, text) => { const d = { deliveryId: 'q' + (queue.items.size + 1), sessionId, text, status: 'queued', createdAt: Date.now() }; queue.items.set(d.deliveryId, d); return d; };
  queue.cancel = () => {};
  queue.pending = () => 0;
  queue.list = () => [];
  b.queue = queue;
  b.api = { broadcast: (event, data) => events.push({ event, data }) };
  b.log = () => {};
  b.touch = () => {};
  b.events = events;
  b.store.insertWorkspace({ key: 'ws-a', kind: 'repo', root: 'C:/r/a', createdAt: 1 });
  b.store.insertWorkspace({ key: 'ws-b', kind: 'folder', root: 'C:/b', createdAt: 2 });
  b.features = attachFeatures(b, { timers: false });
  const add = (name, ws, rect) => {
    const s = { sessionId: 'id-' + name, name, kind: 'claude', workspaceKey: ws, cwd: `C:/${ws}`, rt: newRuntime({ kind: 'claude', hooked: true }), origin: 'board', createdAt: Date.now() };
    b.sessions.set(s.sessionId, s);
    b.store.insertSession({ ...s, permissionMode: 'manual', runtime: s.rt });
    b.store.setNode({ session_id: s.sessionId, ...rect, z: 0 });
    return s;
  };
  return { b, add, h: { ...b.handlers(), ...b.features.handlers } };
}

test('P6c: freeSlot — 원하는 자리가 비었으면 거기, 아니면 가장 가까운 빈자리. 어느 것과도 겹치지 않는다', () => {
  const size = { w: 360, h: 240 };
  assert.deepEqual(freeSlot({ size, rects: [], near: { x: 10, y: 20 } }), { x: 10, y: 20 });
  const rects = [R(0, 0), R(800, 0)];
  const at = freeSlot({ size, rects, near: { x: 100, y: 100 } });
  assert.ok(!rects.some((r) => overlaps({ ...at, ...size }, r, GAP - 1)), JSON.stringify(at));
  assert.ok(Math.hypot(at.x - 100, at.y - 100) < 900, '원하는 자리 가까이');
  const far = freeSlot({ size, rects });
  assert.ok(far.x >= 800 + NODE.w, 'near가 없으면 판 오른쪽');
});

test('P6c: 메모·칸반도 캔버스 자리를 차지한다 — 영역이 감싸고, 새 세션은 그 위에 놓이지 않는다', async () => {
  const { b, add, h } = rig();
  add('a1', 'ws-a', R(0, 0));
  // a1 오른쪽 바로 옆(새 세션이 갈 첫 자리)에 ws-a 메모를 둔다
  const m = await h['memo.create']({ text: '# 자리 시험', x: NODE.w + GAP, y: 0, w: NODE.w, h: NODE.h, workspace: 'ws-a' });
  const items = ops.canvasItems(b);
  assert.ok(items.some((i) => i.kind === 'memo' && i.id === m.memoId && i.ws === 'ws-a'));
  const reg = ops.regions(b).get('ws-a');
  assert.deepEqual(reg, regionRect([R(0, 0), R(NODE.w + GAP, 0)]), '영역이 메모까지 감싼다');
  const at = ops.slotFor(b, { wsKey: 'ws-a' });
  assert.ok(!overlaps({ ...at, ...NODE }, { x: m.x, y: m.y, w: m.w, h: m.h }, GAP - 1), `새 세션이 메모 위에 놓이지 않는다 ${JSON.stringify(at)}`);
  // 칸반도 같다
  const k = await h['kanban.create']({ title: '할 일판', workspace: 'ws-a', x: at.x, y: at.y });
  const at2 = ops.slotFor(b, { wsKey: 'ws-a' });
  assert.ok(!overlaps({ ...at2, ...NODE }, { x: k.x, y: k.y, w: k.w, h: k.h }, GAP - 1), '새 세션이 칸반 위에 놓이지 않는다');
  b.features.stop(); b.store.close();
});

test('P6c: 새 메모·칸반 자리 — 워크스페이스가 있으면 그 영역 안(원하는 자리부터), 없으면 어느 영역과도 겹치지 않게', async () => {
  const { b, add, h } = rig();
  add('a1', 'ws-a', R(0, 0));
  add('b1', 'ws-b', R(3000, 0));
  // 원하는 자리가 비었으면 그 자리
  const m1 = await h['memo.create']({ text: 'a', workspace: 'ws-a', near: { x: 0, y: 600 } });
  assert.deepEqual([m1.x, m1.y, m1.workspaceKey], [0, 600, 'ws-a']);
  // 원하는 자리가 a1 위면 겹치지 않는 가까운 자리
  const m2 = await h['memo.create']({ text: 'b', workspace: 'ws-a', near: { x: 10, y: 10 } });
  for (const r of ops.canvasItems(b).filter((i) => i.id !== m2.memoId)) assert.ok(!overlaps({ x: m2.x, y: m2.y, w: m2.w, h: m2.h }, r, GAP - 1), `겹치지 않는다 ${JSON.stringify([m2, r])}`);
  const regs = ops.regions(b);
  assert.ok(!overlaps(regs.get('ws-a'), regs.get('ws-b')), '영역끼리 겹치지 않는다');
  // 소속 없는 칸반: 어느 영역과도 겹치지 않는다
  const k = await h['kanban.create']({ title: '떠 있는 판', near: { x: 100, y: 100 } });
  assert.equal(k.workspaceKey, null);
  for (const r of ops.regions(b).values()) assert.ok(!overlaps({ x: k.x, y: k.y, w: k.w, h: k.h }, r), '영역 밖');
  // x·y를 주면 그대로(P6b 그대로)
  const m3 = await h['memo.create']({ text: 'c', x: 5, y: 5 });
  assert.deepEqual([m3.x, m3.y], [5, 5]);
  b.features.stop(); b.store.close();
});

test('P6c: 영역을 옮기면 그 워크스페이스의 메모·칸반도 함께 움직인다. 워크스페이스를 닫으면 소속만 푼다', async () => {
  const { b, add, h } = rig();
  add('a1', 'ws-a', R(0, 0));
  const m = await h['memo.create']({ text: 'move', workspace: 'ws-a', x: 0, y: 600 });
  const k = await h['kanban.create']({ workspace: 'ws-a', x: 800, y: 600 });
  const free = await h['memo.create']({ text: 'free', x: -2000, y: 0 });
  ops.workspaceMove(b, { workspace: 'ws-a', dx: 0, dy: 3000 });
  assert.deepEqual([b.store.getMemo(m.memoId).y, b.store.getKanban(k.kanbanId).y, b.store.getMemo(free.memoId).y], [3600, 3600, 0]);
  assert.ok(b.events.some((e) => e.event === 'memo.updated' && e.data.memoId === m.memoId));
  assert.ok(b.events.some((e) => e.event === 'kanban.updated' && e.data.kanbanId === k.kanbanId));
  // 빈 워크스페이스 닫기: 메모는 남고 소속만 풀린다
  await h['memo.create']({ text: 'in b', workspace: 'ws-b', x: 5000, y: 0 });
  await b.workspaceClose({ workspace: 'ws-b', confirm: true });
  assert.ok(b.store.memos().some((x) => x.text === 'in b' && x.workspaceKey === null));
  b.features.stop(); b.store.close();
});

test('P6c: 검색에 메모 노드, 칸반(제목, 열, 카드), hook이 없는 세션의 출력이 나온다', async () => {
  const items = searchItems({ q: 'merge', memos: [{ memoId: 'm1', workspaceKey: 'k', text: '# 확인\nmerge check memo' }], kanbans: [{ kanbanId: 'b1', workspaceKey: null, title: '이번 주', columns: [{ columnId: 'c', name: '할 일', cards: [{ cardId: 'x1', text: 'merge PR 41' }, { cardId: 'x2', text: '다른 일' }] }] }] });
  assert.deepEqual(items.map((r) => [r.kind, r.name, r.field]).sort(), [['kanban', '이번 주', 'card'], ['memo', '확인', 'memo']]);
  assert.equal(items.find((r) => r.kind === 'kanban').cardId, 'x1');
  const { b, add, h } = rig();
  const s = add('far', 'ws-a', R(0, 0));
  await h['memo.create']({ text: 'merge check memo', workspace: 'ws-a', x: 0, y: 600 });
  await h['kanban.create']({ title: 'merge board', x: 4000, y: 0 });
  b.store.addEvent(s.sessionId, 'answer_screen', { text: 'screen output zebra-77', prompt: 'p' });
  const r = h['search.query']({ q: 'merge' });
  assert.deepEqual(r.results.map((x) => x.kind).sort(), ['kanban', 'memo']);
  const o = h['search.query']({ q: 'zebra-77' });
  assert.deepEqual(o.results.map((x) => [x.kind, x.name, x.field]), [['session', 'far', 'output']]);
  b.features.stop(); b.store.close();
});

test('P6c: 정리는 그 워크스페이스의 메모·칸반도 블록으로 놓아 노드와 겹치지 않고, 되돌리면 제자리', async () => {
  const { b, add, h } = rig();
  add('lead', 'ws-a', R(0, 0)); add('rev', 'ws-a', R(760, 0)); add('help', 'ws-a', R(0, 500));
  b.store.insertLink({ linkId: 'l1', from: 'id-lead', to: 'id-rev', role: '리뷰어', createdAt: 1 });
  const m = await h['memo.create']({ text: 'memo', workspace: 'ws-a', x: 760, y: 500 });
  const k = await h['kanban.create']({ workspace: 'ws-a', x: 1520, y: 0 });
  const before = [b.store.getMemo(m.memoId), b.store.getKanban(k.kanbanId)].map((x) => [x.x, x.y]);
  const r = ops.arrange(b, { workspace: 'ws-a', apply: true });
  assert.ok(r.plan.some((x) => x.kind === 'memo') && r.plan.some((x) => x.kind === 'kanban'));
  const rects = ops.canvasItems(b).filter((i) => i.ws === 'ws-a');
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) assert.ok(!overlaps(rects[i], rects[j]), `겹치지 않는다 ${rects[i].kind}:${rects[i].id} ${rects[j].kind}:${rects[j].id}`);
  assert.ok(b.events.some((e) => e.event === 'memo.updated' && e.data.memoId === m.memoId));
  ops.arrange(b, { workspace: 'ws-a', undo: true });
  assert.deepEqual([b.store.getMemo(m.memoId), b.store.getKanban(k.kanbanId)].map((x) => [x.x, x.y]), before, '되돌리면 제자리');
  b.features.stop(); b.store.close();
});

test('P6c: board.get에 메모와 칸반(이은 카드의 세션 요약 포함)이 있다', async () => {
  const { b, add, h } = rig();
  add('s1', 'ws-a', R(0, 0));
  await h['memo.create']({ text: 'x', x: 0, y: 600 });
  const k = await h['kanban.create']({ title: 'k', x: 900, y: 600 });
  await h['kanban.update']({ kanban: k.kanbanId, op: { op: 'addCard', text: 'card', session: 's1' } });
  const bg = await h['board.get']({});
  assert.equal(bg.memos.length, 1);
  assert.equal(bg.kanbans[0].columns[0].cards[0].session.name, 's1');
  b.features.stop(); b.store.close();
});
