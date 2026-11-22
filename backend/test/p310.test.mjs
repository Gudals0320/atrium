// P310 단위 시험: 사람이 한 번이라도 크기를 정한 세션(테두리 끌기, 크기 단계)은 판에 표(값과 때)를 남기고,
// 자동 정렬(워크스페이스 하나, 판 전체)은 그 크기를 지키고 자리만 옮긴다. 노드 메뉴 "기본 크기로"(board.autoSize)가 표를 지운다. 표는 다시 떠도 남는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { arrangeTree, NEW_NODE } from '../src/canvas.mjs';
import { Store } from '../src/store.mjs';
import { newRuntime } from '../src/state.mjs';
import { Branch } from '../src/branch.mjs';
import { workspaceOf } from '../src/git.mjs';
import * as ops from '../src/canvas-ops.mjs';

const B = (id, w = 1440, h = 810, y = 0) => ({ id, x: 0, y, w, h, members: [id], resizable: true });

test('P310 arrangeTree: 동료가 아닌 노드도 hand면 크기 그대로, 나머지는 자동 단계', () => {
  const kid = { ...B('K', 777, 999, 10), hand: true, handStep: null };
  const out = arrangeTree([B('L', 1440, 810, 0), kid, B('M', 1440, 810, 20)], [['L', 'K'], ['L', 'M']]);
  assert.deepEqual([out.get('K').w, out.get('K').h], [777, 999], '사람이 정한 크기 그대로');
  assert.equal(out.get('L').size, 'large');
  assert.equal(out.get('M').size, 'small', '정하지 않은 노드는 자동 크기');
  assert.ok(out.get('K').x > out.get('L').x, '자리는 옮긴다(부모 오른쪽 열)');
});

async function fakeBoard(dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p310-'))) {
  const store = new Store(path.join(dir, 'board.db'));
  const ws = await workspaceOf(dir);
  if (!store.getWorkspace(ws.key)) store.insertWorkspace({ ...ws, createdAt: 1 });
  const b = {
    cfg: { profile: 'dev', terminalSession: 'atrium-dev-p310test', port: 0, dataDir: dir }, store, sessions: new Map(), bus: new EventEmitter(), broadcasts: [],
    api: { broadcast: (e, d) => b.broadcasts.push([e, d]) }, log: () => {},
    nameOf: (sid) => (b.sessions.get(sid) || {}).name || sid,
    resolve: (ref) => [...b.sessions.values()].find((s) => s.name === ref || s.sessionId === ref),
  };
  b.branch = new Branch(b, {});
  return { b, dir, ws };
}
let born = 1;
function mk(b, ws, name, parent = null, y = 0) {
  const s = { sessionId: crypto.randomUUID(), name, agentName: name, paneId: 'w1:p1', model: 'haiku', effort: 'low', permissionMode: 'acceptEdits', kind: 'claude', origin: 'board', parentSessionId: parent ? parent.sessionId : null, workspaceKey: ws.key, cwd: ws.root, rt: newRuntime({ kind: 'claude' }), createdAt: born++ };
  b.store.insertSession({ ...s, settingsPath: '', hookToken: '', runtime: s.rt });
  b.sessions.set(s.sessionId, s);
  b.store.setNode({ session_id: s.sessionId, x: 0, y, w: 1440, h: 810, size: 'wide-normal' });
  if (parent) b.store.insertLink({ linkId: 'l' + crypto.randomBytes(4).toString('hex'), from: parent.sessionId, to: s.sessionId, role: '워커', spawned: true, observed: false, createdAt: born });
  return s;
}
const node = (b, s) => b.store.nodes().find((n) => n.session_id === s.sessionId);
// 창의 테두리 끌기와 같은 길(board.setNode, cause resize)
const drag = (b, s, w, h) => { const n = node(b, s); b.store.setNode({ ...n, w, h }); ops.markHandSize(b, s.sessionId, true, { w, h }); };

test('P310 표: 크기 단계와 끌기가 값과 때를 남긴다', async () => {
  const { b, ws } = await fakeBoard();
  const A = mk(b, ws, 'lead'), C = mk(b, ws, 'w1', A, 1000);
  const t0 = Date.now();
  ops.setSize(b, { session: C.sessionId, size: 'tall43-large' });
  const h = ops.handSizes(b)[C.sessionId];
  assert.ok(h && h.at >= t0, '때');
  assert.deepEqual([h.w, h.h], [node(b, C).w, node(b, C).h], '값');
  // 옛 표(때 숫자)도 읽는다
  b.store.setMeta('handSize', { [A.sessionId]: 123 });
  assert.deepEqual(ops.handSizes(b)[A.sessionId], { at: 123 });
});

test('P310 정리: 손 크기 둘은 그대로, 나머지는 자동 크기. 판 전체 정리도 같다', async () => {
  const { b, ws } = await fakeBoard();
  const A = mk(b, ws, 'lead', null, 0), C = mk(b, ws, 'w1', A, 1000), D = mk(b, ws, 'w2', A, 2000), E = mk(b, ws, 'w3', A, 3000);
  drag(b, C, 900, 1300); // 세로로 끌었다
  ops.setSize(b, { session: D.sessionId, size: 'wide43-large' }); // 메뉴·선택 막대
  const dSize = [node(b, D).w, node(b, D).h];
  ops.arrange(b, { workspace: ws.key, apply: true });
  assert.deepEqual([node(b, C).w, node(b, C).h], [900, 1300], '끌어 정한 크기 그대로');
  assert.deepEqual([node(b, D).w, node(b, D).h], dSize, '메뉴로 정한 크기 그대로');
  assert.equal(String(node(b, E).size).split('-').pop(), 'small', '정하지 않은 하위는 자동(작게)');
  assert.equal(String(node(b, A).size).split('-').pop(), 'large', '뿌리는 자동(크게)');
  assert.ok(node(b, C).x > node(b, A).x + node(b, A).w, '손 크기 노드도 자리는 옮긴다');
  ops.arrange(b, { all: true, apply: true });
  assert.deepEqual([node(b, C).w, node(b, C).h], [900, 1300], '판 전체 정리도 지킨다');
  assert.deepEqual([node(b, D).w, node(b, D).h], dSize);
});

test('P310 기본 크기로: 표를 지우고 기본 크기, 다음 정리부터 자동 크기', async () => {
  const { b, ws } = await fakeBoard();
  const A = mk(b, ws, 'lead', null, 0), C = mk(b, ws, 'w1', A, 1000);
  drag(b, C, 900, 1300);
  const r = ops.canvasHandlers(b)['board.autoSize']({ session: C.sessionId });
  assert.equal(r.hand, false);
  assert.equal(ops.handSizes(b)[C.sessionId], undefined, '표를 지운다');
  assert.deepEqual([node(b, C).w, node(b, C).h], [NEW_NODE.w, NEW_NODE.h], '기본 크기');
  ops.arrange(b, { workspace: ws.key, apply: true });
  assert.equal(String(node(b, C).size).split('-').pop(), 'small', '다시 자동 크기');
});

test('P310 다시 떠도 표가 남는다', async () => {
  const { b, ws, dir } = await fakeBoard();
  const A = mk(b, ws, 'lead', null, 0), C = mk(b, ws, 'w1', A, 1000);
  drag(b, C, 880, 1200);
  b.store.close();
  const again = new Store(path.join(dir, 'board.db'));
  const h = (again.getMeta('handSize') || {})[C.sessionId];
  assert.ok(h && h.w === 880 && h.h === 1200, '판 저장소에 남는다');
});
