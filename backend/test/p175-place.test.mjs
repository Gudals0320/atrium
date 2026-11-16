// P175 시험: atrium child --peer로 띄운 세션의 첫 자리와 크기가 정리(P177 arrangeTree)와 같다.
// 짝(부모)과 같은 크기 단계, 짝의 나무 바로 아래(같은 x). 다른 노드는 옮기지 않는다. 판의 잇기 상자에서 동료를 골라도 아무것도 옮기거나 키우지 않는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { Store } from '../src/store.mjs';
import { newRuntime } from '../src/state.mjs';
import { Branch } from '../src/branch.mjs';
import { Backend } from '../src/backend.mjs';
import { workspaceOf } from '../src/git.mjs';
import { peerSlot, LINE_GAP_Y } from '../src/tree-line.mjs';
import * as ops from '../src/canvas-ops.mjs';

// ---------- peerSlot(순수) ----------
test('P175 peerSlot: 짝과 같은 x, 짝 나무 띠 바로 아래(gap), 막히면 그 아래로', () => {
  const partner = { x: 100, y: 0, w: 1440, h: 810 };
  const band = { x: 100, y: 0, w: 3000, h: 2000 };
  assert.deepEqual(peerSlot({ partner, band, size: { w: 1440, h: 810 }, gap: 160 }), { x: 100, y: 2160 });
  assert.deepEqual(peerSlot({ partner, size: { w: 1440, h: 810 }, gap: LINE_GAP_Y }), { x: 100, y: 890 }, '띠가 없으면 짝 아래');
  const block = { x: 0, y: 2100, w: 2000, h: 500 };
  assert.deepEqual(peerSlot({ partner, band, size: { w: 1440, h: 810 }, gap: 160, obstacles: [block] }), { x: 100, y: 2600 + LINE_GAP_Y }, '막히면 그 아래(다른 것은 옮기지 않는다)');
});

// ---------- 판 위에서(p177의 가짜 판 틀) ----------
async function fakeBoard() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p175p-'));
  const store = new Store(path.join(dir, 'board.db'));
  const ws = await workspaceOf(dir);
  store.insertWorkspace({ ...ws, createdAt: 1 });
  const b = {
    cfg: { profile: 'dev', terminalSession: 'atrium-dev-p175test', port: 0, dataDir: dir }, store, sessions: new Map(), bus: new EventEmitter(), broadcasts: [],
    api: { broadcast: (e, d) => b.broadcasts.push([e, d]) }, log: () => {},
    nameOf: (sid) => (b.sessions.get(sid) || {}).name || sid,
    resolve: (ref) => [...b.sessions.values()].find((s) => s.name === ref || s.sessionId === ref),
  };
  b.branch = new Branch(b, {});
  return { b, dir, ws };
}
let born = 1;
function mk(b, ws, name, parent = null, rect = null, { role = '워커' } = {}) {
  const s = { sessionId: crypto.randomUUID(), name, agentName: name, paneId: 'w1:p1', model: 'haiku', effort: 'low', permissionMode: 'acceptEdits', kind: 'claude', origin: 'board', parentSessionId: parent ? parent.sessionId : null, workspaceKey: ws.key, cwd: ws.root, rt: newRuntime({ kind: 'claude' }), createdAt: born++ };
  b.store.insertSession({ ...s, settingsPath: '', hookToken: '', runtime: s.rt });
  b.sessions.set(s.sessionId, s);
  if (rect) b.store.setNode({ session_id: s.sessionId, ...rect });
  if (parent) {
    b.store.insertLink({ linkId: 'l' + crypto.randomBytes(4).toString('hex'), from: parent.sessionId, to: s.sessionId, role, spawned: true, observed: false, createdAt: born });
    b.branch.info.set(s.sessionId, { role, depth: 2, by: parent.sessionId, at: s.createdAt });
  }
  return s;
}
const node = (b, s) => b.store.nodes().find((n) => n.session_id === s.sessionId);
const nodesSnap = (b) => JSON.stringify(b.store.nodes().map((n) => [n.session_id, n.x, n.y, n.w, n.h, n.size]).sort());
// backend.spawn의 순서: placeChild(peer) → 노드(동료는 줄 밀기 없음) → 관계 동료(atrium child --peer)
function spawnPeer(b, ws, parent, name) {
  const at = b.branch.placeChild(parent.sessionId, ws.key, { peer: true });
  assert.ok(at && at.peer, '동료 자리');
  const s = mk(b, ws, name, parent, { x: at.x, y: at.y, w: at.w, h: at.h, size: at.size, aspect: at.aspect, area: at.area }, { role: '동료' });
  b.store.setRelation(parent.sessionId, s.sessionId, 'peer', 'agent', born);
  b.branch._relRows = null;
  return { s, at };
}

test('P175 --peer 첫 자리: 뿌리 짝이면 짝과 같은 크기 단계, 짝 나무 바로 아래 → 정리를 돌려도 그 자리와 크기 그대로, 다른 노드는 안 옮긴다', async () => {
  const { b, ws } = await fakeBoard();
  const A = mk(b, ws, 'lead', null, { x: 0, y: 0, w: 1440, h: 810, size: 'wide-normal' });
  const C = mk(b, ws, 'worker-c', A, { x: 3000, y: 0, w: 1040, h: 585, size: 'wide-small' });
  ops.arrange(b, { workspace: ws.key, apply: true }); // 정리된 판에서 시작
  const before = nodesSnap(b);
  const na = node(b, A);
  const { s: P, at } = spawnPeer(b, ws, A, 'peer-p');
  assert.deepEqual([at.w, at.h, at.size], [na.w, na.h, na.size], '짝과 같은 크기 단계');
  assert.equal(at.x, na.x, '하위 열이 아니라 짝과 같은 열');
  const nc = node(b, C);
  assert.ok(at.y >= Math.max(na.y + na.h, nc.y + nc.h), '짝의 나무 아래');
  const others = JSON.stringify(JSON.parse(nodesSnap(b)).filter(([id]) => id !== P.sessionId));
  assert.equal(others, before, '다른 노드는 옮기지 않는다');
  // 정리가 주는 자리와 같다
  ops.arrange(b, { workspace: ws.key, apply: true });
  const after = node(b, P);
  assert.deepEqual([after.x, after.y, after.w, after.h, after.size], [at.x, at.y, at.w, at.h, at.size], '정리해도 그대로');
});

test('P175 --peer 첫 자리: 하위인 짝이면 같은 줄에서 짝 나무 바로 아래(형제 사이), 크기는 짝과 같다 → 정리와 같다', async () => {
  const { b, ws } = await fakeBoard();
  const L = mk(b, ws, 'lead', null, { x: 0, y: 0, w: 1440, h: 810, size: 'wide-normal' });
  const W = mk(b, ws, 'worker-w', L, { x: 3000, y: 0, w: 1040, h: 585, size: 'wide-small' });
  ops.arrange(b, { workspace: ws.key, apply: true });
  const nw = node(b, W);
  const { s: Q, at } = spawnPeer(b, ws, W, 'peer-q');
  assert.deepEqual([at.x, at.y, at.w, at.h, at.size], [nw.x, nw.y + nw.h + LINE_GAP_Y, nw.w, nw.h, nw.size]);
  ops.arrange(b, { workspace: ws.key, apply: true });
  const nq = node(b, Q);
  assert.deepEqual([nq.x, nq.y, nq.w, nq.h, nq.size], [at.x, at.y, at.w, at.h, at.size], '정리해도 그대로');
});

test('P175 --peer 첫 자리: 짝 아래 자리가 막혀 있으면 그 아래로(다른 노드는 그대로), 두 번째 동료는 첫 동료 아래', async () => {
  const { b, ws } = await fakeBoard();
  const A = mk(b, ws, 'lead', null, { x: 0, y: 0, w: 1440, h: 810, size: 'wide-normal' });
  const X = mk(b, ws, 'solo-x', null, { x: 0, y: 900, w: 1040, h: 585, size: 'wide-small' });
  const before = nodesSnap(b);
  const { at: a1 } = spawnPeer(b, ws, A, 'peer-1');
  const nx = node(b, X);
  assert.equal(a1.x, 0); assert.ok(a1.y >= nx.y + nx.h, '막힌 자리 아래로');
  const { at: a2 } = spawnPeer(b, ws, A, 'peer-2');
  assert.ok(a2.y >= a1.y + a1.h, '두 번째 동료는 첫 동료 아래');
  assert.equal(JSON.stringify(JSON.parse(nodesSnap(b)).filter(([id]) => [A.sessionId, X.sessionId].includes(id))), before, '짝과 막은 노드는 그대로');
});

test('P175 하위 자리는 그대로(peer가 아니면 옛 줄 규칙)', async () => {
  const { b, ws } = await fakeBoard();
  const A = mk(b, ws, 'lead', null, { x: 0, y: 0, w: 1440, h: 810, size: 'wide-normal' });
  const at = b.branch.placeChild(A.sessionId, ws.key, {});
  assert.ok(!at.peer); assert.equal(at.x, 1440 + 200, '부모 오른쪽 열'); assert.equal(at.size, 'wide-normal');
});

test('P175 잇기 상자에서 동료를 골라도 노드를 옮기거나 키우지 않는다(정리가 맞춘다)', async () => {
  const { b, ws } = await fakeBoard();
  const A = mk(b, ws, 'alpha', null, { x: 0, y: 0, w: 1440, h: 810, size: 'wide-normal' });
  const Bs = mk(b, ws, 'beta', null, { x: 2000, y: 0, w: 1040, h: 585, size: 'wide-small' });
  b.queue = { enqueue: (sid, text) => ({ deliveryId: 'd1', sessionId: sid, text }) };
  b.ensureLink = (from, to, patch = {}) => { let l = b.store.linkByPair(from, to); if (!l) { l = { linkId: 'l' + crypto.randomBytes(4).toString('hex'), from, to, role: patch.role ?? null, spawned: false, observed: false, createdAt: Date.now() }; b.store.insertLink(l); } else if (patch.role !== undefined) b.store.updateLink(l.linkId, { role: patch.role }); return b.store.getLink(l.linkId); };
  b.linkEvent = (l, kind, text = null, data = null) => b.store.addLinkEvent(l.linkId, kind, text, data);
  b.broadcastSession = () => {};
  b.store.linkPromptStats = () => ({ n: 0, at: null });
  for (const k of ['linkCreate', 'linkView', 'linkPromptView']) b[k] = Backend.prototype[k].bind(b);
  const before = nodesSnap(b);
  const r = b.linkCreate({ from: A.sessionId, to: Bs.sessionId, role: '', relation: 'peer' });
  assert.equal(r.relationSet, 'peer');
  assert.equal(nodesSnap(b), before, '자리와 크기 그대로');
  b.branch.notices && b.branch.notices.stop && b.branch.notices.stop();
});
