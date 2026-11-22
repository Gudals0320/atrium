// P177 단위 시험: 정리가 동료 세션을 하위처럼 작게 만들지 않는다. 정리의 나무는 일 관계(P156 relations.mjs)를 따르고,
// 동료는 짝 옆에 같은 급으로 서고 크기는 묶음에서 가장 큰 단계, 사람이 손으로 정한 동료 크기는 지킨다. 하위는 옛 규칙 그대로.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { arrangeTree, SIZE_STEPS } from '../src/canvas.mjs';
import { Store } from '../src/store.mjs';
import { newRuntime } from '../src/state.mjs';
import { Branch } from '../src/branch.mjs';
import { workspaceOf } from '../src/git.mjs';
import * as ops from '../src/canvas-ops.mjs';

const B = (id, w = 1440, h = 810, y = 0) => ({ id, x: 0, y, w, h, members: [id], resizable: true });

// ---------- arrangeTree(순수) ----------
test('P177 arrangeTree: 뿌리끼리 동료면 둘 다 크게, 동료는 짝의 나무 바로 아래 뿌리로', () => {
  const blocks = [B('A', 1440, 810, 0), B('C', 1040, 585, 100), B('X', 1040, 585, 50), B('P', 1040, 585, 9000)];
  const out = arrangeTree(blocks, [['A', 'C']], { peers: [['A', 'P']] });
  assert.equal(out.get('A').size, 'large');
  assert.equal(out.get('P').size, 'large', '동료는 짝과 같은 단계(크게)');
  assert.equal(out.get('C').size, 'small', '하위는 그대로 작게');
  assert.equal(out.get('P').x, out.get('A').x, '동료는 하위 열이 아니라 짝과 같은 열');
  assert.ok(out.get('P').y > out.get('A').y && out.get('P').y < out.get('X').y, '짝 나무 바로 아래(연결 없는 줄보다 위)');
  assert.equal(out.get('X').size, null, '연결 없는 블록은 크기 그대로');
});

test('P177 arrangeTree: 하위의 동료는 그 부모 줄에서 짝 바로 아래 형제, 크기는 둘 중 큰 쪽', () => {
  // L → W1(자식 있음 = 보통), W1의 동료 Q(자식 없음 = 원래라면 작게)
  const blocks = [B('L', 1440, 810, 0), B('W1', 1440, 810, 10), B('G', 1040, 585, 20), B('W2', 1040, 585, 30), B('Q', 1040, 585, 40)];
  const out = arrangeTree(blocks, [['L', 'W1'], ['W1', 'G'], ['L', 'W2']], { peers: [['Q', 'W1']], wrapAspect: null });
  assert.equal(out.get('W1').size, 'normal');
  assert.equal(out.get('Q').size, 'normal', '짝(보통)에 맞춘다');
  assert.equal(out.get('Q').x, out.get('W1').x, '같은 열');
  assert.ok(out.get('Q').y > out.get('W1').y && out.get('Q').y < out.get('W2').y, '짝 바로 아래, 다음 형제보다 위');
  assert.equal(out.get('W2').size, 'small');
});

test('P177 arrangeTree: 사람이 손으로 정한 동료 크기는 지키고, 짝은 그보다 작으면 맞춘다', () => {
  const hand = { ...B('P', 1040, 585, 50), hand: true, handStep: 'wide-small' };
  const out = arrangeTree([B('A', 1440, 810, 0), B('C', 1040, 585, 10), hand], [['A', 'C']], { peers: [['A', 'P']] });
  assert.deepEqual([out.get('P').w, out.get('P').h, out.get('P').size], [1040, 585, 'wide-small'], '손으로 정한 크기 그대로');
  assert.equal(out.get('A').size, 'large');
  // 동료 둘 다 하위 줄에 있을 때 손으로 키운 쪽이 크면 다른 쪽이 따라간다
  const big = { ...B('Q', 1920, 1080, 40), hand: true, handStep: 'wide-large' };
  const o2 = arrangeTree([B('L', 1440, 810, 0), B('W', 1040, 585, 10), big], [['L', 'W'], ['L', 'Q']], { peers: [['W', 'Q']] });
  assert.equal(o2.get('Q').size, 'wide-large');
  assert.equal(o2.get('W').size, 'large', '짝이 손으로 정한 크게에 맞춘다');
});

// ---------- 판에 붙인 흐름(가짜 판, p159 틀) ----------
async function fakeBoard() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p177-'));
  const store = new Store(path.join(dir, 'board.db'));
  const ws = await workspaceOf(dir);
  store.insertWorkspace({ ...ws, createdAt: 1 });
  const b = {
    cfg: { profile: 'dev', terminalSession: 'atrium-dev-p177test', port: 0, dataDir: dir }, store, sessions: new Map(), bus: new EventEmitter(), broadcasts: [],
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
  b.store.setNode({ session_id: s.sessionId, x: 0, y, w: parent ? 1040 : 1440, h: parent ? 585 : 810, size: parent ? 'wide-small' : 'wide-normal' });
  if (parent) b.store.insertLink({ linkId: 'l' + crypto.randomBytes(4).toString('hex'), from: parent.sessionId, to: s.sessionId, role: name.startsWith('peer') ? '동료' : '워커', spawned: true, observed: false, createdAt: born });
  return s;
}
const node = (b, s) => b.store.nodes().find((n) => n.session_id === s.sessionId);
const lvl = (n) => String(n.size || '').split('-').pop();

test('P177 정리: --peer로 띄운 동료와 사람이 정한 동료는 짝과 같은 단계, 하위는 그대로 작게', async () => {
  const { b, ws } = await fakeBoard();
  const A = mk(b, ws, 'lead', null, 0);
  const P = mk(b, ws, 'peer-b', A, 1000); // A가 --peer로 띄운 동료(계보 자식, 관계 동료)
  const C = mk(b, ws, 'worker-c', A, 2000); // 하위
  const D = mk(b, ws, 'peer-d', null, 3000); // 따로 띄운 세션, 사람이 A의 동료로 정한다
  b.store.setRelation(A.sessionId, P.sessionId, 'peer', 'agent', 1);
  b.store.setRelation(A.sessionId, D.sessionId, 'peer', 'user', 2);
  b.branch._relRows = null;
  ops.arrange(b, { workspace: ws.key, apply: true });
  const [na, np, nc, nd] = [A, P, C, D].map((s) => node(b, s));
  assert.equal(lvl(na), 'large');
  assert.equal(lvl(np), 'large', '--peer 동료도 크게');
  assert.equal(lvl(nd), 'large', '사람이 정한 동료도 크게');
  assert.equal(lvl(nc), 'small', '하위는 작게');
  assert.equal(np.x, na.x, '동료는 하위 열(오른쪽)이 아니라 짝과 같은 열');
  assert.equal(nd.x, na.x);
  assert.ok(nc.x > na.x + na.w, '하위는 부모 오른쪽 열');
  // 되돌리면 정리 전 크기
  ops.arrange(b, { workspace: ws.key, undo: true });
  assert.equal(lvl(node(b, P)), 'small');
});

test('P177 정리: 사람이 손으로 정한 동료 크기는 지킨다(atrium size·노드 메뉴), P310부터 하위도 지킨다', async () => {
  const { b, ws } = await fakeBoard();
  const A = mk(b, ws, 'lead', null, 0);
  const P = mk(b, ws, 'peer-b', A, 1000);
  const C = mk(b, ws, 'worker-c', A, 2000);
  b.store.setRelation(A.sessionId, P.sessionId, 'peer', 'agent', 1);
  b.branch._relRows = null;
  ops.setSize(b, { session: P.sessionId, size: 'wide-normal' });
  ops.setSize(b, { session: C.sessionId, size: 'wide-large' });
  assert.ok(ops.handSizes(b)[P.sessionId], '손으로 정한 크기를 적어 둔다');
  ops.arrange(b, { workspace: ws.key, apply: true });
  assert.equal(node(b, P).size, 'wide-normal', '동료의 손 크기는 그대로');
  assert.equal(lvl(node(b, A)), 'large');
  assert.equal(lvl(node(b, C)), 'large', 'P310: 하위도 사람이 정한 크기는 그대로(자리만 옮긴다)');
});

test('P177 정리: 동료를 하위로 바꾸면 다시 하위 줄, 독립으로 정한 계보 자식은 나무 밖', async () => {
  const { b, ws } = await fakeBoard();
  const A = mk(b, ws, 'lead', null, 0);
  const P = mk(b, ws, 'peer-b', A, 1000);
  const N = mk(b, ws, 'worker-n', A, 2000);
  b.store.setRelation(A.sessionId, P.sessionId, 'sub', 'user', 1);
  b.store.setRelation(A.sessionId, N.sessionId, 'none', 'user', 2);
  b.branch._relRows = null;
  ops.arrange(b, { workspace: ws.key, apply: true });
  const na = node(b, A), np = node(b, P), nn = node(b, N);
  assert.ok(np.x > na.x + na.w, '하위로 정하면 부모 오른쪽 열');
  assert.equal(lvl(np), 'small');
  assert.equal(nn.w, 1040, '독립은 나무 밖(크기 그대로)');
  // 줄(새 하위 자리, 밀기)도 일 부모를 따른다
  const tree = ops.lineTree(b, ws.key);
  assert.equal(tree.parent.get(tree.blockOf.get(N.sessionId)) || null, null, '독립은 줄의 자식이 아니다');
  assert.equal(tree.parent.get(tree.blockOf.get(P.sessionId)), tree.blockOf.get(A.sessionId));
});
