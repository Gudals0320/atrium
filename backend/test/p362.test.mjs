// P362 시험: 새 세션 겹침, 손 크기와 자리 떼기, 핀(도구는 p362-fuzz.mjs)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fuzz, board, violations, rng } from './p362-fuzz.mjs';
import * as ops from '../src/canvas-ops.mjs';
import { LINE_GAP_X, LINE_GAP_Y, boxFrame, lineSlot, peerSlot, looseSlot, pushFrom, pushLine } from '../src/tree-line.mjs';
import { overlaps } from '../src/canvas.mjs';
import { areaKey } from '../src/worktree-areas.mjs';
import { pathKey } from '../src/workspaces.mjs';

test('P362 무작위(판 API): 같은 영역 노드끼리 겹치지 않고, 상자는 남의 노드와 겹치지 않고, 핀은 그대로', async () => {
  const seeds = Number(process.env.P362_SEEDS || 40);
  const fails = [];
  for (let seed = 1; seed <= seeds; seed++) {
    const { log, bad } = await fuzz(seed, Number(process.env.P362_STEPS || 40));
    if (bad.length) fails.push({ seed, at: bad[0].step, op: bad[0].op, v: bad[0].v, log: log.slice(0, bad[0].step + 1) });
  }
  if (process.env.P362_DUMP) fs.writeFileSync(process.env.P362_DUMP, JSON.stringify(fails, null, 1));
  assert.deepEqual(fails.map((f) => `${f.seed}@${f.at} ${f.op}: ${f.v.join(', ')}`), []);
});

// ---------- 회귀: 찾은 원인마다 ----------
const nodeOf = (b, name) => b.store.nodes().find((n) => n.session_id === 'id-' + name);
const KID = { w: 1440, h: 810 };

// 리드 A와 하위 셋(정리 뒤 모양)
function lead() {
  const t = board();
  const A = t.spawn('A', t.ws, { rect: { x: 40, y: 112, w: 1920, h: 1080 } });
  for (let i = 0; i < 3; i++) t.spawn('a' + i, t.ws, { parent: A, rect: { x: 40 + 1920 + LINE_GAP_X, y: 112 + i * (KID.h + LINE_GAP_Y), ...KID } });
  return { ...t, A };
}

test('P362 원인1: 넓힌 노드(손 크기)는 하위 열을 덮지 않고 하위 열이 넓어진 만큼 오른쪽으로 간다. 하위는 줄에 남아 다음 밀기를 따른다', () => {
  const { b, ws, A, spawn } = lead();
  const h = b.handlers();
  const x0 = nodeOf(b, 'a0').x;
  h['board.setNode']({ session: A.sessionId, x: 40, y: 112, w: 1920 + 500, h: 1080, z: 0, cause: 'resize' }); // 창의 테두리 끌기
  assert.ok(ops.handSizes(b)[A.sessionId], '손 크기');
  assert.ok(!ops.pinnedIds(b).has(A.sessionId), '크기만 바꾼 노드는 핀이 아니다');
  for (let i = 0; i < 3; i++) assert.equal(nodeOf(b, 'a' + i).x, x0 + 500, 'a' + i + ' 오른쪽으로(넓어진 만큼)');
  assert.deepEqual(violations(b), []);
  // 크기 단계(노드 메뉴)로 넓혀도 같다
  ops.setSize(b, { session: A.sessionId, size: 'wide43-large' });
  const An = nodeOf(b, 'A');
  for (let i = 0; i < 3; i++) assert.ok(nodeOf(b, 'a' + i).x >= An.x + An.w + LINE_GAP_X - 1, 'a' + i + ' 줄(부모 오른쪽)');
  assert.deepEqual(violations(b), []);
  // 하위는 줄에 남는다: 새 하위가 줄 끝에 서고 겹치지 않는다
  spawn('a3', ws, { parent: A });
  assert.ok(nodeOf(b, 'a3').x >= nodeOf(b, 'a0').x, '줄의 열(같은 열이나 접은 다음 열, K4)');
  assert.deepEqual(violations(b), []);
});

test('P362 원인1: 손 크기 노드는 자리가 묶이지 않는다. 줄 밀기에 밀리고, 정리는 크기를 지키며 자리를 옮긴다', () => {
  const { b, ws, A, spawn } = lead();
  ops.setSize(b, { session: 'id-a1', size: 'wide-large' }); // 가운데 하위를 사람이 키운다
  const big = nodeOf(b, 'a1');
  assert.deepEqual(violations(b), [], 'a2가 밀렸다');
  assert.ok(nodeOf(b, 'a2').y >= big.y + big.h + LINE_GAP_Y - 1);
  // a0을 키우면 손 크기 a1도 아래로 밀린다(핀이 아니다)
  const y1 = nodeOf(b, 'a1').y;
  ops.setSize(b, { session: 'id-a0', size: 'wide-large' });
  assert.ok(nodeOf(b, 'a1').y > y1, '손 크기 노드도 밀린다');
  assert.deepEqual([nodeOf(b, 'a1').w, nodeOf(b, 'a1').h], [big.w, big.h], '크기는 그대로');
  // 사람이 a1을 끌어 옮기면 그때 핀(자리를 지킨다)
  const h = b.handlers();
  const n1 = nodeOf(b, 'a1');
  h['board.setNode']({ session: 'id-a1', x: n1.x + 3000, y: n1.y, w: n1.w, h: n1.h, z: 0, cause: 'drag' });
  assert.ok(ops.pinnedIds(b).has('id-a1'));
  // 정리: 크기는 지키고 자리는 옮긴다. 핀은 풀린다
  ops.canvasHandlers(b)['board.arrange']({ workspace: ws.key, apply: true });
  const after = nodeOf(b, 'a1');
  assert.deepEqual([after.w, after.h], [big.w, big.h], '정리는 손 크기를 지킨다');
  assert.ok(after.x < n1.x + 3000, '정리는 자리를 옮긴다(부모 줄로)');
  assert.equal(ops.pinnedIds(b).size, 0);
  assert.deepEqual(violations(b), []);
  spawn('a3', ws, { parent: A });
  assert.deepEqual(violations(b), []);
});

test('P362 원인2: 부모 상자 안의 하위가 둘 이상이어도 새 하위는 둘째 형제 위에 서지 않는다', async () => {
  const { b, ws, spawn, state } = board();
  const A = spawn('A', ws);
  const w = spawn('w', ws, { parent: A, worktree: 'w' });
  state.wts.push('w');
  w.rt.cwd = 'E:/worktrees/C_repo/w';
  await b.worktrees.sync('t');
  const box = areaKey(ws.key, pathKey('E:/worktrees/C_repo/w'));
  for (const k of ['k0', 'k1', 'k2', 'k3']) {
    spawn(k, ws, { parent: w, cwd: 'E:/worktrees/C_repo/w' });
    assert.equal(ops.areaOfNode(b, 'id-' + k), box, k + ' 상자 안');
    assert.deepEqual(violations(b), [], k);
  }
});

test('P362 원인3: 줄 끝이 핀 꽂힌 나무(사람이 옮긴 노드가 든 나무)나 줄 밖 노드에 닿아도 새 노드는 겹치지 않는다', () => {
  const { b, ws, spawn } = board();
  const A = spawn('A', ws, { rect: { x: 40, y: 112, w: 1440, h: 810 } });
  spawn('a0', ws, { parent: A, rect: { x: 1680, y: 112, ...KID } });
  // 사람이 A의 하위 a1을 부모 왼쪽 아래로 옮겨 두었다(줄 밖, 그 띠가 길다)
  spawn('a1', ws, { parent: A, rect: { x: 40, y: 1500, ...KID } });
  // 그 곁의 뿌리 나무 R: 하위 r0이 핀(사람이 끌어 옮긴 것)이라 나무째 밀리지 않는다
  const R = spawn('R', ws, { rect: { x: 1520, y: 2400, w: 1440, h: 810 } });
  spawn('r0', ws, { parent: R, rect: { x: 3160, y: 2400, ...KID } });
  b.handlers()['board.setNode']({ session: 'id-r0', x: 3200, y: 2400, w: KID.w, h: KID.h, z: 0, cause: 'drag' });
  const pin = [nodeOf(b, 'r0').x, nodeOf(b, 'r0').y];
  for (let i = 2; i < 6; i++) { spawn('a' + i, ws, { parent: A }); assert.deepEqual(violations(b), [], 'a' + i); }
  assert.deepEqual([nodeOf(b, 'r0').x, nodeOf(b, 'r0').y], pin, '핀은 그대로');
});

test('P362 원인4: 부모 없는 새 세션은 핀 꽂힌 뿌리의 나무째(하위까지) 피한다', () => {
  const { b, ws, spawn } = board();
  spawn('sh', ws, { kind: 'shell', rect: { x: 40, y: 112, w: 600, h: 810 } });
  const P = spawn('P', ws, { rect: { x: 3200, y: 112, w: 1440, h: 810 } });
  spawn('p0', ws, { parent: P, rect: { x: 1000, y: 112, ...KID } }); // 사람이 부모를 하위 오른쪽으로 옮겼다(하위는 셸 줄 끝 자리에)
  b.handlers()['board.setNode']({ session: P.sessionId, x: 3240, y: 112, w: 1440, h: 810, z: 0, cause: 'drag' });
  spawn('n', ws);
  assert.deepEqual(violations(b), []);
});

test('P362 원인5: 상자의 마지막 세션을 닫으면 빈 상자는 닫기 전 상자 자리에 남는다(그사이 옛 자리에 선 노드와 겹치지 않는다)', async () => {
  const { b, ws, spawn, state, close } = board();
  const A = spawn('A', ws, { rect: { x: 40, y: 112, w: 1440, h: 810 } });
  const w = spawn('w', ws, { parent: A, worktree: 'w' });
  state.wts.push('w');
  w.rt.cwd = 'E:/worktrees/C_repo/w';
  await b.worktrees.sync('t');
  const was = boxFrame(nodeOf(b, 'w'));
  // 줄 밀기가 상자 안 노드만 아래로 옮긴 판(상자 자리 기록은 옛 자리)
  const n = nodeOf(b, 'w');
  b.store.setNode({ ...n, y: n.y + 3000 });
  spawn('x', ws, { kind: 'shell', rect: { x: was.x, y: was.y, w: 1440, h: 810 } });
  assert.deepEqual(violations(b), []);
  close(w);
  assert.deepEqual(violations(b), [], '빈 상자가 옛 자리로 돌아가 x와 겹치지 않는다');
  const r = ops.regions(b).get(areaKey(ws.key, pathKey('E:/worktrees/C_repo/w')));
  assert.ok(r && !overlaps(r, nodeOf(b, 'x'), -1));
});

// ---------- 순수 함수 속성(tree-line.mjs) ----------
const R = (r, lo, hi) => Math.round(lo + r() * (hi - lo));
const rect = (r) => ({ x: R(r, -3000, 6000), y: R(r, -2000, 6000), w: R(r, 400, 2000), h: R(r, 250, 1200) });
test('P362 순수 속성: 빈 칸 자리(push가 아닌 답)는 피할 것과 겹치지 않고, push 자리도 핀과는 겹치지 않는다(lineSlot, peerSlot, looseSlot)', () => {
  const bad = [];
  for (let seed = 1; seed <= 600; seed++) {
    const r = rng(seed);
    const parent = { x: 0, y: 0, w: 1440, h: 810 };
    const size = { w: 1040, h: 585 };
    const bands = Array.from({ length: R(r, 0, 4) }, (_, i) => ({ x: 1640, y: i * 665, ...size }));
    const obstacles = Array.from({ length: R(r, 0, 12) }, () => rect(r)).filter((o) => !overlaps(o, parent, 80));
    const pinned = obstacles.filter(() => r() < 0.3);
    const s = lineSlot({ parent, bands, size, obstacles: [...obstacles, parent], keep: r() < 0.7, pinned });
    const c = { x: s.x, y: s.y, ...size };
    if (!s.push && obstacles.some((o) => overlaps(c, o, LINE_GAP_Y - 1))) bad.push(`lineSlot ${seed}`);
    if (pinned.some((o) => overlaps(c, o, LINE_GAP_Y - 1))) bad.push(`lineSlot pin ${seed}`);
    const p = peerSlot({ partner: parent, size: { w: 1440, h: 810 }, obstacles });
    if (!p.push && obstacles.some((o) => overlaps({ x: p.x, y: p.y, w: 1440, h: 810 }, o, LINE_GAP_Y - 1))) bad.push(`peerSlot ${seed}`);
    const roots = [parent, ...obstacles.slice(0, 3)].map((x) => ({ ...x, lone: r() < 0.5 }));
    const l = looseSlot({ roots, size: { w: 1440, h: 810 }, pinned });
    if (pinned.some((o) => overlaps({ x: l.x, y: l.y, w: 1440, h: 810 }, o, 39))) bad.push(`looseSlot pin ${seed}`);
  }
  assert.deepEqual(bad, []);
});
test('P362 순수 속성: 줄 밀기는 핀 꽂힌 것을 옮기지 않고 아래로만 민다. 씨앗과 밀린 것은 핀·씨앗과 겹치지 않는다(pushFrom, pushLine)', () => {
  const bad = [];
  for (let seed = 1; seed <= 600; seed++) {
    const r = rng(seed);
    const units = Array.from({ length: R(r, 2, 10) }, (_, i) => { const x = rect(r); return { id: 'u' + i, rect: x, own: x, pinned: i > 0 && r() < 0.25 }; });
    const m = pushFrom(units, ['u0']);
    for (const [id, dy] of m) { if (units.find((u) => u.id === id).pinned) bad.push(`pushFrom moved pin ${seed}`); if (dy <= 0) bad.push(`pushFrom up ${seed}`); }
    const after = units.map((u) => ({ ...u, rect: { ...u.rect, y: u.rect.y + (m.get(u.id) || 0) } }));
    const moved = after.filter((u) => m.has(u.id));
    const fixed = after.filter((u) => u.pinned || u.id === 'u0');
    for (const a of moved) for (const c of fixed) if (overlaps(a.rect, c.rect, -1)) bad.push(`pushFrom overlap ${seed} ${a.id}|${c.id}`);
    const l = pushLine(units);
    for (const [id, dy] of l) { if (units.find((u) => u.id === id).pinned) bad.push(`pushLine moved pin ${seed}`); if (dy <= 0) bad.push(`pushLine up ${seed}`); }
  }
  assert.deepEqual(bad, []);
});
