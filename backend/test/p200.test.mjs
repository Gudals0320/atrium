// P200 시험: 새 하위 세션(특히 --worktree 워커)이 열 끝이 막혔을 때 부모에게서 멀리 아래로 내려가지 않는다.
// 부모에게 가장 가까운 빈 칸(형제 띠 사이의 비운 자리 포함)을 먼저 쓰고, 상한(LINE_REACH) 안에 없으면 오른쪽에 새 열을 연다.
// 모든 열이 막히면 옛 자리(첫 열의 줄 끝, 그 아래로 잇기). 동료 자리도 같은 상한. spawn 뒤 줄 밀기가 새 자리를 다시 밀지 않는다.
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
import { workspaceOf } from '../src/git.mjs';
import { lineSlot, peerSlot, pushLine, boxFrame, LINE_GAP_X, LINE_GAP_Y, LINE_REACH, LINE_COLS } from '../src/tree-line.mjs';
import { overlaps } from '../src/canvas.mjs';
import * as ops from '../src/canvas-ops.mjs';

const P = { x: 0, y: 0, w: 1440, h: 810 }; // 부모
const S = { w: 1440, h: 810 }; // 새 하위(wide-normal)
const X0 = P.x + P.w + LINE_GAP_X; // 첫 열
const free = (at, size, rs) => !rs.some((r) => overlaps({ ...at, ...size }, r, LINE_GAP_Y - 1));
// 형제 n개(띄운 순서대로 첫 열에 쌓인 띠)
const sibs = (n, size = S) => Array.from({ length: n }, (_, i) => ({ x: X0, y: i * (size.h + LINE_GAP_Y), ...size }));

test('P200 (가) 빈 판: 지금과 같은 자리(부모 오른쪽, 부모 위 끝)', () => {
  assert.deepEqual(lineSlot({ parent: P, size: S, obstacles: [P] }), { x: X0, y: 0 });
  // 형제 뒤에는 줄 끝 바로 아래(막히지 않은 긴 줄은 접지 않는다: P9·P75)
  const bs = sibs(6);
  assert.deepEqual(lineSlot({ parent: P, bands: bs, size: S, obstacles: [P, ...bs] }), { x: X0, y: 6 * (S.h + LINE_GAP_Y) });
  assert.ok(LINE_REACH >= 1200 && LINE_COLS >= 2);
});

test('P200 (나) 줄 끝 바로 아래를 다른 나무가 길게 막으면 그 아래로 가지 않고 오른쪽 새 열(부모 위 끝 높이)', () => {
  const bs = sibs(2);
  const end = bs[1].y + bs[1].h;
  const other = { x: X0 - 300, y: end + LINE_GAP_Y, w: 2000, h: 5000 }; // 다른 세션 나무(띠)
  const os = [P, ...bs, other];
  const at = lineSlot({ parent: P, bands: bs, size: S, obstacles: os });
  assert.equal(at.x, other.x + other.w + LINE_GAP_X, '막은 것들 오른쪽 + LINE_GAP_X');
  assert.equal(at.y, P.y, '새 열의 가장 위 칸');
  assert.ok(free(at, S, os));
  assert.ok(at.y < other.y + other.h, '옛 규칙(막은 나무 아래)보다 위');
  // 짧게 막으면(상한 안) 같은 열에서 그 아래
  const memo = { x: X0, y: end + LINE_GAP_Y, w: 600, h: 400 };
  assert.deepEqual(lineSlot({ parent: P, bands: bs, size: S, obstacles: [P, ...bs, memo] }), { x: X0, y: memo.y + memo.h + LINE_GAP_Y });
  // 새 열의 위쪽도 막혀 있으면 새 열 안에서 상한 안의 가장 위 칸
  const top2 = { x: other.x + other.w + LINE_GAP_X, y: -50, w: 900, h: 700 };
  const at2 = lineSlot({ parent: P, bands: bs, size: S, obstacles: [...os, top2] });
  assert.deepEqual(at2, { x: top2.x, y: top2.y + top2.h + LINE_GAP_Y });
});

test('P200 (나) 실제 사례 모양: 부모 열 위 끝을 다른 나무가 막고 형제가 그 아래에 줄 선 경우', () => {
  // 부모 높이 1080, 열 맨 위에 다른 세션 둘(0~875), 형제가 955부터 890 간격. 상한은 줄 끝부터 재므로 형제 줄은 그대로 잇는다
  const p = { x: 0, y: 0, w: 1920, h: 1080 };
  const x = p.x + p.w + LINE_GAP_X;
  const others = [{ x, y: 0, w: 1440, h: 875 }];
  const bs = [0, 1, 2].map((i) => ({ x, y: 955 + i * 890, w: 1440, h: 810 }));
  const at = lineSlot({ parent: p, bands: bs, size: S, obstacles: [p, ...others, ...bs] });
  assert.deepEqual(at, { x, y: 955 + 3 * 890 });
});

test('P200 (다) 형제 띠 사이에 비운 자리(지워진 하위)가 있으면 그 자리', () => {
  const bs = sibs(4);
  const left = [bs[0], bs[2], bs[3]]; // 둘째가 지워졌다
  const at = lineSlot({ parent: P, bands: left, size: S, obstacles: [P, ...left] });
  assert.deepEqual(at, { x: X0, y: bs[1].y });
  // 첫째 자리가 비어도 그 자리(부모 위 끝부터 찾는다)
  const tail = bs.slice(1);
  assert.deepEqual(lineSlot({ parent: P, bands: tail, size: S, obstacles: [P, ...tail] }), { x: X0, y: 0 });
  // 비운 자리가 새 블록보다 작으면 쓰지 않는다
  const tight = [bs[0], { ...bs[1], y: bs[1].y + 400 }];
  assert.deepEqual(lineSlot({ parent: P, bands: tight, size: S, obstacles: [P, ...tight] }), { x: X0, y: tight[1].y + S.h + LINE_GAP_Y });
});

test('P200 (라) 워크트리 상자 테두리 크기로도 같다', () => {
  const F = boxFrame({ x: 0, y: 0, ...S });
  const fs_ = { w: F.w, h: F.h };
  const bs = sibs(2, fs_).map((r) => ({ ...r }));
  const end = bs[1].y + bs[1].h;
  const other = { x: X0, y: end + LINE_GAP_Y, w: 1600, h: 4000 };
  const at = lineSlot({ parent: P, bands: bs, size: fs_, obstacles: [P, ...bs, other] });
  assert.equal(at.x, Math.max(other.x + other.w, bs[0].x + bs[0].w) + LINE_GAP_X);
  assert.equal(at.y, 0);
  // 비운 자리는 상자 테두리 높이가 들어갈 때만
  const left = [bs[0], { ...bs[1], y: bs[1].y + F.h + LINE_GAP_Y }];
  assert.deepEqual(lineSlot({ parent: P, bands: left, size: fs_, obstacles: [P, ...left] }), { x: X0, y: bs[1].y });
  const short = [bs[0], { ...bs[1], y: bs[1].y + F.h - 10 }];
  assert.notEqual(lineSlot({ parent: P, bands: short, size: fs_, obstacles: [P, ...short] }).y, bs[1].y);
});

test('P200 (마) 모든 열이 막히면 옛 자리(첫 열의 줄 끝, 그 아래로 잇기)를 돌려준다(null 아님)', () => {
  const bs = sibs(1);
  const wall = { x: X0 - 100, y: -500, w: 40000, h: 9000 }; // 오른쪽으로도 멀리 막는 벽(그 너머로 건너지 않는다)
  const at = lineSlot({ parent: P, bands: bs, size: S, obstacles: [P, ...bs, wall] });
  assert.ok(at, '자리 없음으로 실패하지 않는다');
  assert.deepEqual(at, { x: X0, y: wall.y + wall.h + LINE_GAP_Y });
  // 열마다 막히는 벽이 LINE_COLS개
  let x = X0;
  const walls = [];
  for (let i = 0; i < LINE_COLS; i++) { walls.push({ x, y: -100, w: 1500, h: 6000 }); x += 1500 + LINE_GAP_X; }
  const at2 = lineSlot({ parent: P, size: S, obstacles: [P, ...walls] });
  assert.deepEqual(at2, { x: X0, y: 5900 + LINE_GAP_Y });
  // LINE_COLS - 1개면 마지막 열에 선다
  const at3 = lineSlot({ parent: P, size: S, obstacles: [P, ...walls.slice(0, -1)] });
  assert.deepEqual(at3, { x: walls[LINE_COLS - 1].x, y: 0 });
});

test('P200 (바) 동료 자리도 상한: 짝 나무 아래가 길게 막히면 짝 나무 아래 높이에서 오른쪽 새 열', () => {
  const band = { x: 0, y: 0, w: 3500, h: 2000 };
  const block = { x: -200, y: 2100, w: 2000, h: 6000 };
  const at = peerSlot({ partner: P, band, size: S, gap: LINE_GAP_Y * 2, obstacles: [block] });
  assert.equal(at.x, block.x + block.w + LINE_GAP_X);
  assert.equal(at.y, band.y + band.h + LINE_GAP_Y * 2, '짝 나무 아래(짝의 하위 줄에 끼어들지 않는다)');
  // 짧게 막히면 같은 x에서 그 아래(P175 그대로)
  const short = { x: 0, y: 2100, w: 2000, h: 500 };
  assert.deepEqual(peerSlot({ partner: P, band, size: S, gap: 160, obstacles: [short] }), { x: 0, y: 2600 + LINE_GAP_Y });
  // 이미 선 동료 줄(line)은 상한을 그 줄 끝부터 잰다(막히지 않은 동료 줄은 접지 않는다)
  const line = [0, 1, 2].map((i) => ({ x: 0, y: 2160 + i * 890, ...S }));
  assert.deepEqual(peerSlot({ partner: P, band, line, size: S, gap: 160, obstacles: line }), { x: 0, y: 2160 + 3 * 890 });
  // 모두 막히면 옛 자리
  const wall = { x: -500, y: 1000, w: 40000, h: 9000 };
  assert.deepEqual(peerSlot({ partner: P, band, size: S, gap: 160, obstacles: [wall] }), { x: 0, y: 10000 + LINE_GAP_Y });
});

test('P200 (사) 줄 밀기(pushLine)는 새 열·비운 자리에 선 하위를 다시 밀지 않는다(순수)', () => {
  const bs = sibs(3);
  const left = [bs[0], bs[2]];
  const gapAt = lineSlot({ parent: P, bands: left, size: S, obstacles: [P, ...left] });
  const units = [...left.map((r, i) => ({ id: 's' + i, rect: r })), { id: 'new', rect: { ...gapAt, ...S } }];
  assert.equal(pushLine(units).size, 0);
  const other = { x: X0, y: bs[2].y + bs[2].h + LINE_GAP_Y, w: 1440, h: 5000 };
  const colAt = lineSlot({ parent: P, bands: bs, size: S, obstacles: [P, ...bs, other] });
  assert.notEqual(colAt.x, X0);
  assert.equal(pushLine([...bs.map((r, i) => ({ id: 's' + i, rect: r })), { id: 'new', rect: { ...colAt, ...S } }]).size, 0);
});

// ---------- 판 위에서(placeChild → 노드 → spawn 뒤 줄 밀기, backend.spawn의 순서) ----------
async function fakeBoard() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p200-'));
  const store = new Store(path.join(dir, 'board.db'));
  const ws = await workspaceOf(dir);
  store.insertWorkspace({ ...ws, createdAt: 1 });
  const b = {
    cfg: { profile: 'dev', terminalSession: 'atrium-dev-p200test', port: 0, dataDir: dir }, store, sessions: new Map(), bus: new EventEmitter(), broadcasts: [],
    api: { broadcast: (e, d) => b.broadcasts.push([e, d]) }, log: () => {},
    nameOf: (sid) => (b.sessions.get(sid) || {}).name || sid,
    resolve: (ref) => [...b.sessions.values()].find((s) => s.name === ref || s.sessionId === ref),
  };
  b.branch = new Branch(b, {});
  return { b, dir, ws };
}
let born = 1;
function mk(b, ws, name, parent = null, rect = null) {
  const s = { sessionId: crypto.randomUUID(), name, agentName: name, paneId: 'w1:p1', model: 'haiku', effort: 'low', permissionMode: 'acceptEdits', kind: 'claude', origin: 'board', parentSessionId: parent ? parent.sessionId : null, workspaceKey: ws.key, cwd: ws.root, rt: newRuntime({ kind: 'claude' }), createdAt: born++ };
  b.store.insertSession({ ...s, settingsPath: '', hookToken: '', runtime: s.rt });
  b.sessions.set(s.sessionId, s);
  if (rect) b.store.setNode({ session_id: s.sessionId, ...rect });
  if (parent) {
    b.store.insertLink({ linkId: 'l' + crypto.randomBytes(4).toString('hex'), from: parent.sessionId, to: s.sessionId, role: '워커', spawned: true, observed: false, createdAt: born });
    b.branch.info.set(s.sessionId, { role: '워커', depth: 2, by: parent.sessionId, at: s.createdAt });
  }
  return s;
}
const node = (b, s) => b.store.nodes().find((n) => n.session_id === s.sessionId);
function spawnChild(b, ws, parent, name) {
  const at = b.branch.placeChild(parent.sessionId, ws.key, {});
  assert.ok(at, '하위 자리');
  const s = mk(b, ws, name, parent, { x: at.x, y: at.y, w: at.w, h: at.h, size: at.size, aspect: at.aspect, area: at.area });
  const moved = ops.reflowLines(b, s.sessionId, 'spawn');
  return { s, at, moved };
}

test('P200 (사) 판: 다른 나무가 줄 끝을 길게 막으면 새 열에 서고, spawn 뒤 줄 밀기가 그 자리를 다시 밀지 않는다. 다음 하위는 그 아래', async () => {
  const { b, ws } = await fakeBoard();
  const A = mk(b, ws, 'lead', null, { x: 0, y: 0, w: 1440, h: 810, size: 'wide-normal' });
  const c1 = spawnChild(b, ws, A, 'w1');
  const c2 = spawnChild(b, ws, A, 'w2');
  assert.deepEqual([c1.at.x, c1.at.y, c2.at.x, c2.at.y], [X0, 0, X0, 890]);
  const end = c2.at.y + c2.at.h;
  const X = mk(b, ws, 'other', null, { x: X0 - 200, y: end + LINE_GAP_Y, w: 1920, h: 1080, size: 'wide-large' });
  mk(b, ws, 'other-kid', X, { x: X0 - 200, y: end + LINE_GAP_Y + 1160, w: 1920, h: 1080, size: 'wide-large' });
  mk(b, ws, 'other-kid2', X, { x: X0 - 200, y: end + LINE_GAP_Y + 2320, w: 1920, h: 1080, size: 'wide-large' });
  const before = b.store.nodes().filter((n) => n.session_id !== A.sessionId).map((n) => [n.session_id, n.x, n.y]).sort();
  const c3 = spawnChild(b, ws, A, 'w3');
  assert.equal(c3.at.x, X0 - 200 + 1920 + LINE_GAP_X, '막은 나무 오른쪽 새 열');
  assert.equal(c3.at.y, 0);
  assert.deepEqual(c3.moved, [], '줄 밀기가 아무것도 옮기지 않는다');
  const n3 = node(b, c3.s);
  assert.deepEqual([n3.x, n3.y], [c3.at.x, c3.at.y]);
  const after = b.store.nodes().filter((n) => before.some(([id]) => id === n.session_id)).map((n) => [n.session_id, n.x, n.y]).sort();
  assert.deepEqual(after, before, '다른 노드는 옮기지 않는다');
  // 다음 하위: 첫 열은 여전히 막혔다 → 새 열에서 w3 아래
  const c4 = spawnChild(b, ws, A, 'w4');
  assert.deepEqual([c4.at.x, c4.at.y], [c3.at.x, c3.at.y + c3.at.h + LINE_GAP_Y]);
  assert.deepEqual(c4.moved, []);
  const n3b = node(b, c3.s);
  assert.deepEqual([n3b.x, n3b.y], [c3.at.x, c3.at.y], 'w3도 그대로');
});

test('P200 (다·사) 판: 끝난 하위가 지워져 비운 자리에 서고, 줄 밀기가 밀지 않는다', async () => {
  const { b, ws } = await fakeBoard();
  const A = mk(b, ws, 'lead', null, { x: 0, y: 0, w: 1440, h: 810, size: 'wide-normal' });
  const c1 = spawnChild(b, ws, A, 'w1');
  const c2 = spawnChild(b, ws, A, 'w2');
  const c3 = spawnChild(b, ws, A, 'w3');
  // w2가 끝나 지워졌다(세션과 노드가 없다)
  b.sessions.delete(c2.s.sessionId);
  b.store.deleteNode ? b.store.deleteNode(c2.s.sessionId) : b.store.db.prepare('DELETE FROM nodes WHERE session_id = ?').run(c2.s.sessionId);
  const c4 = spawnChild(b, ws, A, 'w4');
  assert.deepEqual([c4.at.x, c4.at.y], [c2.at.x, c2.at.y], '비운 자리');
  assert.deepEqual(c4.moved, []);
  assert.deepEqual([node(b, c1.s).y, node(b, c3.s).y, node(b, c4.s).y], [c1.at.y, c3.at.y, c2.at.y]);
});
