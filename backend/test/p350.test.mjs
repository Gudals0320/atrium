// P350 시험: 새 세션·워크트리 상자가 멀리 생기거나 정렬이 깨지던 원인(재현 → 고친 뒤 자리). 가짜 판은 p337.test.mjs와 같은 꼴
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { NEW_NODE, NEW_NODE_STEP, DEFAULT_ASPECT, overlaps, nearRegionSlot, REGION_GAP } from '../src/canvas.mjs';
import { Store } from '../src/store.mjs';
import { newRuntime } from '../src/state.mjs';
import { Backend } from '../src/backend.mjs';
import * as ops from '../src/canvas-ops.mjs';
import { Branch } from '../src/branch.mjs';
import { pathKey, normPath } from '../src/workspaces.mjs';
import { attachWorktrees } from '../src/worktrees.mjs';
import { areaKey } from '../src/worktree-areas.mjs';
import { lineSlot, pushFrom, LINE_GAP_X, LINE_GAP_Y, boxFrame } from '../src/tree-line.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p350-'));
const REPO = 'C:/repo', FOLD = 'C:/folder';
const OUT = (n) => 'E:/worktrees/C_repo/' + n;
const NODE = { ...NEW_NODE, size: NEW_NODE_STEP, aspect: DEFAULT_ASPECT };

function board() {
  const b = new Backend({ quietMs: 600000, port: 0, logDir: tmp() });
  b.store = new Store(path.join(tmp(), 'board.db'));
  b.sessions = new Map(); b.api = { broadcast: () => {} }; b.log = () => {}; b.touch = () => {}; b.broadcastWorkspaces = () => {}; b.bus ??= new EventEmitter();
  const mk = (root, kind, at) => { const key = kind === 'repo' ? pathKey(root + '/.git') : pathKey(root); b.store.insertWorkspace({ key, kind, root: normPath(root), createdAt: 1 }); if (at) b.store.setWorkspaceAnchor(key, at.x, at.y); return { key, root }; };
  const ws = mk(REPO, 'repo', { x: 0, y: 0 });
  const state = { wts: [] };
  const porcelain = () => ['worktree ' + REPO, 'HEAD 1', 'branch refs/heads/main', '', ...state.wts.flatMap((n) => ['worktree ' + OUT(n), 'HEAD 2', 'branch refs/heads/worktree-' + n, ''])].join('\n');
  b.worktrees = attachWorktrees(b, { tickMs: 0, list: async (root) => (normPath(root) === normPath(REPO) ? porcelain() : null), exists: () => true });
  b.branch = new Branch(b);
  let clock = 1000;
  const reg = (name, w, extra = {}) => {
    const s = { sessionId: 'id-' + name, name, kind: 'claude', workspaceKey: w.key, cwd: w.root, rt: newRuntime({ kind: 'claude' }), origin: 'board', createdAt: clock++, ...extra };
    b.sessions.set(s.sessionId, s); b.store.insertSession({ ...s, permissionMode: 'manual', runtime: s.rt }); return s;
  };
  // backend.spawn의 자리 순서 그대로(placeSpawn → settleRegions)
  const spawn = (name, w, { parent = null, worktree = null, quick = null, cwd = null, kind = 'claude', rect = null } = {}) => {
    const branch = parent ? { role: '워커', depth: 2, by: parent.sessionId, at: clock, order: b.branch.nextOrder(parent.sessionId), worktree, ...(worktree ? { wtHome: 1 } : {}) } : null;
    const s = reg(name, w, { parentSessionId: parent ? parent.sessionId : null, cwd: cwd || (parent ? parent.cwd : w.root), kind });
    if (branch) b.branch.noteChild(s.sessionId, branch);
    if (quick) s.wtSpawn = quick;
    if (rect) b.store.setNode({ session_id: s.sessionId, ...rect, z: 0 });
    else ops.placeSpawn(b, s, { branch, worktree: quick || worktree, area: b.worktrees.areaOf(w.key, s.cwd) });
    ops.settleRegions(b, 'spawn');
    if (quick) s.quickWorktree = { name: quick, via: 'claude-w' };
    return s;
  };
  return { b, ws, mk, state, spawn, reg };
}
const nodeOf = (b, name) => b.store.nodes().find((n) => n.session_id === 'id-' + name);
const at = (b, name) => { const n = nodeOf(b, name); return [n.x, n.y]; };
// 노드끼리 겹친 쌍
const clashes = (b) => { const ns = b.store.nodes(); const out = []; for (let i = 0; i < ns.length; i++) for (let j = i + 1; j < ns.length; j++) if (overlaps(ns[i], ns[j], -1)) out.push(ns[i].session_id + '|' + ns[j].session_id); return out; };
const gap = (a, c) => Math.hypot(Math.max(0, Math.max(a.x, c.x) - Math.min(a.x + a.w, c.x + c.w)), Math.max(0, Math.max(a.y, c.y) - Math.min(a.y + a.h, c.y + c.h)));

// 두 리드 나무를 위아래로 쌓은 판(정리 뒤 모양): 리드 A의 하위 줄 바로 아래에 리드 B의 나무, 맨 아래 셸 한 줄
function twoTrees() {
  const t = board();
  const { b, ws, spawn } = t;
  const A = spawn('A', ws, { rect: { x: 40, y: 112, w: 1440, h: 810 } });
  const kids = [0, 1, 2].map((i) => spawn('a' + i, ws, { parent: A, rect: { x: 40 + 1440 + LINE_GAP_X, y: 112 + i * (585 + LINE_GAP_Y), w: 1040, h: 585 } }));
  const top = 112 + 3 * (585 + LINE_GAP_Y) + LINE_GAP_Y;
  const B = spawn('B', ws, { rect: { x: 40, y: top, w: 1440, h: 810 } });
  spawn('b0', ws, { parent: B, rect: { x: 40 + 1440 + LINE_GAP_X, y: top, w: 1040, h: 585 } });
  const sh = top + 810 + 2 * LINE_GAP_Y;
  for (let i = 0; i < 3; i++) spawn('sh' + i, ws, { kind: 'shell', rect: { x: 40 + i * 1080, y: sh, w: 1040, h: 585 } });
  return { ...t, A, B, kids, top };
}

test('P350 원인1(순수): 열이 모두 막혀도 판 끝으로 내려가지 않고 첫 열의 줄 끝(push)', () => {
  const P = { x: 0, y: 0, w: 1440, h: 810 };
  const X0 = P.w + LINE_GAP_X;
  const bands = [{ x: X0, y: 0, w: 1040, h: 585 }];
  const tall = [0, 1, 2, 3].map((i) => ({ x: X0 + i * 1500 - 50, y: i ? -100 : 700, w: 1400, h: 30000 })); // 열마다 길게 막는 것(옛 규칙은 그 아래 30000+로 내려갔다)
  const s = lineSlot({ parent: P, bands, size: { w: 1040, h: 585 }, obstacles: [P, ...bands, ...tall] });
  assert.deepEqual(s, { x: X0, y: 585 + LINE_GAP_Y, push: true });
});

test('P350 원인1(판): 줄 끝이 아래 나무에 막히고 오른쪽도 막히면 새 하위는 줄 끝에 서고, 아래 나무와 셸 줄이 통째로 그만큼 내려간다', () => {
  const { b, ws, A, spawn } = twoTrees();
  spawn('wall', ws, { kind: 'shell', rect: { x: 40 + 1440 + LINE_GAP_X + 1440 + LINE_GAP_X, y: 112, w: 3000, h: 6000 } }); // 하위 줄 오른쪽을 길게 막는 것(같은 영역, 새 하위 1440 너비 바로 오른쪽)
  const before = Object.fromEntries(['B', 'b0', 'sh0', 'sh1', 'sh2'].map((n) => [n, at(b, n)]));
  const c = spawn('a3', ws, { parent: A });
  const n = nodeOf(b, 'a3');
  assert.equal(n.x, nodeOf(b, 'a0').x, '첫 열');
  assert.equal(n.y, nodeOf(b, 'a2').y + 585 + LINE_GAP_Y, '형제 줄 끝');
  assert.ok(gap(n, nodeOf(b, 'A')) < 2000, '부모 가까이(옛 규칙은 판 끝)');
  const dy = nodeOf(b, 'B').y - before.B[1];
  assert.ok(dy > 0, '아래 나무가 내려갔다');
  for (const k of ['b0', 'sh0', 'sh1', 'sh2']) assert.deepEqual(at(b, k), [before[k][0], before[k][1] + dy], k + ' 같은 만큼(나무·줄 모양 그대로)');
  assert.deepEqual(clashes(b), []);
  assert.ok(c);
});

test('P350 원인1(판): 오른쪽이 비면 P200처럼 부모 높이의 오른쪽 새 열(다른 것을 옮기지 않는다)', () => {
  const { b, ws, A, spawn } = twoTrees();
  const before = b.store.nodes().map((n) => [n.session_id, n.x, n.y]);
  spawn('a3', ws, { parent: A });
  assert.deepEqual(at(b, 'a3'), [40 + 1440 + LINE_GAP_X + 1040 + LINE_GAP_X, 112]);
  assert.deepEqual(b.store.nodes().filter((n) => n.session_id !== 'id-a3').map((n) => [n.session_id, n.x, n.y]), before);
});

test('P350 원인2: 상자 안 워커의 하위로 상자가 커져도 아래 나무는 나무째 내려가고(상자만 판 끝으로 밀리지 않는다) 겹침이 없다', async () => {
  const t = twoTrees();
  const { b, ws, A, spawn, state } = t;
  // A의 첫 하위를 워크트리 워커로(상자)
  const w = spawn('w', ws, { parent: A, worktree: 'w' });
  state.wts.push('w');
  await b.worktrees.sync('t');
  assert.ok(nodeOf(b, 'w').area, '상자에 들었다');
  const before = Object.fromEntries(['B', 'b0', 'sh0', 'sh2'].map((n) => [n, at(b, n)]));
  spawn('g', ws, { parent: w, cwd: OUT('w') });
  assert.equal(nodeOf(b, 'g').area, nodeOf(b, 'w').area, '같은 상자');
  assert.deepEqual(clashes(b), []);
  const dB = nodeOf(b, 'B').y - before.B[1], dB0 = nodeOf(b, 'b0').y - before.b0[1];
  assert.equal(dB, dB0, 'B 나무는 함께');
  assert.equal(nodeOf(b, 'sh0').y - before.sh0[1], nodeOf(b, 'sh2').y - before.sh2[1], '셸 줄은 함께');
});

test('P350 원인3: 빠른 워크트리 세션(claude -w)은 상자 틀만큼 비운 자리에 서고, 워크트리가 생기면 상자가 그 자리를 감싼다(옮기지 않는다)', async () => {
  const { b, ws, spawn, state } = twoTrees();
  const q = spawn('q', ws, { quick: 'q' });
  const n0 = nodeOf(b, 'q');
  const f = boxFrame(n0);
  for (const m of b.store.nodes()) if (m.session_id !== 'id-q') assert.ok(!overlaps(f, m, -1), '상자 틀 자리에 다른 노드가 없다 ' + m.session_id);
  state.wts.push('q');
  q.rt.cwd = OUT('q'); // worktree-session.mjs watchWorktree가 알아본 폴더
  await b.worktrees.sync('t');
  const n1 = nodeOf(b, 'q');
  assert.equal(n1.area, pathKey(OUT('q')));
  assert.deepEqual([n1.x, n1.y], [n0.x, n0.y], '제자리');
  assert.deepEqual(ops.regions(b).get(areaKey(ws.key, pathKey(OUT('q')))), f, '상자가 노드 둘레');
});

test('P350 원인3: 워크트리 폴더에서 띄운 셸도 상자가 생길 때 제자리에서 감싼다', async () => {
  const { b, ws, spawn, state } = twoTrees();
  spawn('s', ws, { kind: 'shell', cwd: OUT('h') });
  const n0 = nodeOf(b, 's');
  state.wts.push('h');
  await b.worktrees.sync('t');
  const n1 = nodeOf(b, 's');
  assert.equal(n1.area, pathKey(OUT('h')));
  assert.equal(n1.x, n0.x);
  assert.ok(n1.y - n0.y >= 0 && n1.y - n0.y < 300, '상자 틀이 위 노드에 닿은 만큼만 내려간다(옛 규칙은 리포 맨 오른쪽 새 상자로 옮겼다) ' + (n1.y - n0.y));
  assert.deepEqual(clashes(b), []);
});

test('P350 원인4: 하위 자리는 이웃 영역의 노드를 막는 것으로 보지 않는다(이웃 영역은 영역째 밀린다)', () => {
  const t = board();
  const { b, ws, mk, spawn } = t;
  const A = spawn('A', ws, { rect: { x: 40, y: 112, w: 1440, h: 810 } });
  // 이웃 폴더 영역이 리드 오른쪽 열 자리에 바짝(사람이 옮겨 둔 판)
  const f = mk(FOLD, 'folder', { x: 40 + 1440 + 40 + REGION_GAP, y: 0 });
  for (let i = 0; i < 3; i++) spawn('f' + i, f, { kind: 'shell', rect: { x: 40 + 1440 + 40 + REGION_GAP + 40 + i * 1080, y: 112, w: 1040, h: 4000 } });
  const fBefore = at(b, 'f0');
  spawn('a0', ws, { parent: A });
  assert.deepEqual(at(b, 'a0'), [40 + 1440 + LINE_GAP_X, 112], '부모 오른쪽 첫 칸');
  const dx = nodeOf(b, 'f0').x - fBefore[0], dy = nodeOf(b, 'f0').y - fBefore[1];
  assert.ok(dx > 0 || dy > 0, '이웃 영역이 영역째 밀렸다(덜 옮기는 쪽)');
  for (let i = 0; i < 3; i++) assert.deepEqual(at(b, 'f' + i), [fBefore[0] + i * 1080 + dx, 112 + dy], '이웃 영역 안 모양 그대로');
  assert.deepEqual(clashes(b), []);
});

test('P350 새 워크스페이스: 다른 폴더에 띄운 하위의 새 영역은 부모 영역 곁(판 가장자리가 아니다)', () => {
  const t = board();
  const { b, ws, mk, spawn } = t;
  const A = spawn('A', ws, { rect: { x: 40, y: 112, w: 1440, h: 810 } });
  // 판 오른쪽 멀리 큰 영역(옛 규칙은 판 전체 기준이라 이쪽으로 갔다)
  const far = mk('C:/far', 'folder', { x: 20000, y: 0 });
  spawn('x', far, { kind: 'shell', rect: { x: 20040, y: 112, w: 1040, h: 9000 } });
  const n = mk('C:/new', 'folder', null);
  spawn('k', n, { parent: A, cwd: 'C:/new' });
  const r = ops.regions(b);
  assert.ok(gap(r.get(n.key), r.get(ws.key)) <= REGION_GAP + 1, '부모 영역 바로 곁 ' + JSON.stringify(r.get(n.key)));
  assert.deepEqual(clashes(b), []);
});

test('P350 nearRegionSlot(순수): near 곁의 빈자리, 다른 영역과 REGION_GAP 띄움', () => {
  const near = { x: 0, y: 0, w: 1000, h: 1000 };
  const right = { x: 1000 + REGION_GAP, y: 0, w: 800, h: 3000 };
  const s = nearRegionSlot(near, [near, right], { w: 800, h: 320 });
  assert.deepEqual(s, { x: 0, y: 1000 + REGION_GAP }, '오른쪽이 막혀 아래');
  assert.deepEqual(nearRegionSlot(near, [near], { w: 800, h: 320 }), { x: 1000 + REGION_GAP, y: 0 }, '비면 오른쪽');
});

test('P350 pushFrom(순수): 씨앗에 겹친 것만 아래로, 전부터 겹친 다른 것끼리는 그대로, 씨앗 위는 보지 않는다', () => {
  const u = (id, x, y, w = 100, h = 100) => ({ id, rect: { x, y, w, h }, own: { x, y, w, h } });
  const units = [u('up', 0, -500), u('seed', 0, 0, 100, 300), u('hit', 0, 200), u('old1', 1000, 0), u('old2', 1000, 50)];
  const m = pushFrom(units, ['seed']);
  assert.deepEqual([...m], [['hit', 300 + LINE_GAP_Y - 200]]);
  // 밀린 것이 다시 아래 것을 민다(같은 열)
  const m2 = pushFrom([...units, u('below', 0, 340)], ['seed']);
  assert.equal(m2.get('below'), (300 + LINE_GAP_Y + 100 + LINE_GAP_Y) - 340);
});
