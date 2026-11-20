// P262: 캔버스 자동 정렬이 rig를 한 덩어리로 놓는다(rig 2D 칸, 모두 같은 크기, 보통 세션과 넉넉히 떨어지게). 켤 때 놓기도 같은 크기.
//   rig 없는 판의 정리, 되돌리기는 그대로.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { Store } from '../src/store.mjs';
import { workspaceOf } from '../src/git.mjs';
import { Rig } from '../src/rig.mjs';
import { newRuntime } from '../src/state.mjs';
import { RigRoles, ROLE_SPAWN } from '../src/rig-roles.mjs';
import { placeRoles, rigNodeSize } from '../src/rig-map.mjs';
import { rigCluster, rigBeside, rigSep, RIG_ARRANGE, faceEnds, segHitsRect, rolePairs, GRID_BUILDER } from '../src/rig-map-layout.mjs';
import { BUILDER_ROLE } from '../src/rig-def.mjs';
import { NEW_NODE, overlaps, bbox } from '../src/canvas.mjs';
import * as ops from '../src/canvas-ops.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p262-'));
const DOC = (name) => ['# ' + name, '', '## 맡은 것', name + '의 일', '', '## 받는 것과 내는 것', '-', '', '## 기준', '- 기준', '', '## 요령', '- 요령'].join('\n');
const DEF3 = () => ({
  version: 3, name: 'p262', purpose: '.atrium/purpose.md',
  roles: { data: { owns: ['data/'] }, ideas: { owns: ['ideas/'] }, verify: { owns: ['verify/'] } },
  flows: [
    { item: 'snapshot', from: 'data', to: 'ideas' },
    { item: 'hypothesis', from: 'ideas', to: 'verify' },
    { item: 'result', from: 'verify', to: 'ideas', for: 'hypothesis' },
    { item: 'hint', from: 'human', to: 'ideas' },
  ],
});
const DEF5 = () => ({
  version: 3, name: 'p262b', purpose: '.atrium/purpose.md',
  beat: { every: '1d', at: '07:00', role: 'data' },
  roles: { data: { owns: ['data/'] }, ideas: { owns: ['ideas/'] }, news: { owns: ['news/'] }, verify: { owns: ['verify/'] }, report: { owns: ['report/'] } },
  flows: [
    { item: 'snapshot', from: 'data', to: ['ideas', 'news'] },
    { item: 'hypothesis', from: 'ideas', to: 'verify' },
    { item: 'result', from: 'verify', to: 'ideas', for: 'hypothesis' },
    { item: 'brief', from: 'news', to: 'report' },
    { item: 'finding', from: 'verify', to: 'report' },
  ],
});
let born = 1;
async function board(def = DEF3(), { builder = true } = {}) {
  const dir = tmp(); const outside = tmp();
  fs.mkdirSync(path.join(dir, '.atrium', 'roles'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.atrium', 'purpose.md'), '# 목적\nP262\n');
  for (const r of Object.keys(def.roles)) fs.writeFileSync(path.join(dir, '.atrium', 'roles', r + '.md'), DOC(r));
  fs.writeFileSync(path.join(dir, '.atrium', 'rig.json'), JSON.stringify(def, null, 2));
  const store = new Store(path.join(outside, 'board.db'));
  const ws = await workspaceOf(dir);
  store.insertWorkspace({ ...ws, createdAt: 1 });
  const casts = [];
  const settings = { language: 'ko', rig3SummaryModel: 'haiku' };
  const b = {
    cfg: { hookTimeoutSec: 2, sessionsDir: path.join(outside, 'sessions'), dataDir: path.join(outside, 'data-board'), rig3DeadGraceMs: 0, rig3ToolWaitMs: 20000 },
    store, sessions: new Map(), log: () => {}, api: { broadcast: (n, d) => casts.push({ n, d }) }, features: { settings: { get: () => settings } },
    nameOf: (sid) => (b.sessions.get(sid) || {}).name || sid,
    resolve: (ref) => [...b.sessions.values()].find((s) => s.name === ref || s.sessionId === ref),
  };
  b.rig = new Rig(b); b.rig3 = new RigRoles(b);
  b.resolveWorkspace = async () => ({ key: ws.key });
  b.queue = { enqueue: () => ({ deliveryId: 'd' + born++, status: 'queued' }), retext: () => null, cancel: () => null };
  let y = 0;
  const mk = (name, { key = ws.key, root = dir, rigRole = null, parent = null, w = 1440, h = 810, x = 0 } = {}) => {
    const s = { sessionId: crypto.randomUUID(), name, agentName: name, paneId: 'w1:p1', model: 'haiku', effort: 'low', permissionMode: 'acceptEdits', kind: 'claude', origin: 'board', parentSessionId: parent ? parent.sessionId : null, workspaceKey: key, cwd: root, rt: newRuntime({ kind: 'claude', hooked: true }), createdAt: born++, rigRole };
    store.insertSession({ ...s, settingsPath: '', hookToken: '', runtime: s.rt });
    b.sessions.set(s.sessionId, s);
    store.setNode({ session_id: s.sessionId, x, y, w, h, size: 'wide-normal' }); y += 300; // 처음에는 다닥다닥(겹치게) 놓는다
    if (parent) store.insertLink({ linkId: 'l' + crypto.randomBytes(4).toString('hex'), from: parent.sessionId, to: s.sessionId, role: '워커', spawned: true, observed: false, createdAt: born });
    return s;
  };
  b.spawn = async (p) => { const L = b.rig3.launchOf(ws.key, p[ROLE_SPAWN], { kind: 'claude', cwd: p.cwd }); const s = mk(p.name, { rigRole: L.role, w: 900 + 40 * born, h: 500 }); return { sessionId: s.sessionId, name: p.name }; };
  b.kill = async (p) => { b.sessions.delete(p.session); return { ok: true }; };
  b.sleeper = { isAsleep: (s) => !!s.rt.sleep, info: () => null, sleep: async (s) => { s.rt.sleep = { at: Date.now() }; return {}; }, wake: async (s) => { s.rt.sleep = null; return {}; } };
  store.setRigEnabled(ws.key, true);
  await b.rig3.onEnabled(ws.key, true);
  if (builder) mk('builder', { rigRole: BUILDER_ROLE, w: 1040, h: 585 });
  return { b, store, ws, dir, def, mk, casts };
}
const nodeOf = (B, s) => B.store.nodes().find((n) => n.session_id === s.sessionId);
const rigSessions = (B) => [...B.b.sessions.values()].filter((s) => s.rigRole);
const roleS = (B, r) => [...B.b.sessions.values()].find((s) => s.rigRole === r);
// 겹치는 노드 쌍(맞닿음은 괜찮다)
const overlapsOf = (rows) => { const out = []; for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) if (overlaps(rows[i], rows[j], -1)) out.push([rows[i].session_id, rows[j].session_id]); return out; };
// 역할 쌍 선(마주 보는 변 가운데끼리)이 다른 노드를 지나는 수
function linesThrough(B) {
  const rows = B.store.nodes();
  const at = (r) => rows.find((n) => n.session_id === roleS(B, r).sessionId);
  let hit = 0;
  for (const p of rolePairs(Object.keys(B.def.roles), B.def.flows.map((f) => ({ ...f, from: [].concat(f.from), to: [].concat(f.to) })))) {
    const a = at(p.a), c = at(p.b); const [s, e] = faceEnds(a, c);
    for (const n of rows) if (n !== a && n !== c && segHitsRect(s, e, n, 1)) hit++;
  }
  return hit;
}
// 두 사각형 사이 틈(겹치면 음수)
const gapOf = (a, c) => Math.max(c.x - (a.x + a.w), a.x - (c.x + c.w), c.y - (a.y + a.h), a.y - (c.y + c.h));

test('P262 rigBeside: 합친 바깥이 16:9에 가까운 쪽(아래·오른쪽), 같으면 아래, 나머지가 없으면 붙이지 않는다', () => {
  assert.deepEqual(rigBeside({ w: 1000, h: 1000 }, null, 100), { side: null, dx: 0, dy: 0 });
  assert.equal(rigBeside({ w: 6000, h: 2000 }, { w: 3000, h: 1000 }, 500).side, 'below');
  assert.equal(rigBeside({ w: 2000, h: 3000 }, { w: 2000, h: 3000 }, 500).side, 'right');
  const r = rigBeside({ w: 2000, h: 3000 }, { w: 2000, h: 3000 }, 500);
  assert.deepEqual([r.dx, r.dy], [2500, 0]);
  assert.equal(rigSep(1080, 787), Math.round(1080 * RIG_ARRANGE.SEP_F));
});

test('P262 rigNodeSize: 기본은 새 세션 크기, 사람이 손으로 정한 rig 노드가 있으면 가장 최근 것', () => {
  const rows = [{ session_id: 'a', w: 900, h: 500 }, { session_id: 'b', w: 1920, h: 1080, size: 'wide-large', aspect: '16:9' }, { session_id: 'c', w: 1000, h: 1000 }];
  assert.deepEqual([rigNodeSize(rows).w, rigNodeSize(rows).h, rigNodeSize(rows).size], [NEW_NODE.w, NEW_NODE.h, 'wide-normal']);
  const s = rigNodeSize(rows, { b: 5, c: 3 });
  assert.deepEqual([s.w, s.h, s.size, s.hand], [1920, 1080, 'wide-large', 'b']);
  assert.deepEqual([rigNodeSize(rows, { b: 1, c: 3 }).w, rigNodeSize(rows, { b: 1, c: 3 }).size], [1000, null]);
});

test('P262 켤 때 놓기: 역할과 빌더를 모두 같은 크기(새 세션 크기)로 rig 칸에', async () => {
  const B = await board();
  placeRoles(B.b, B.ws.key);
  const rows = rigSessions(B).map((s) => nodeOf(B, s));
  for (const n of rows) assert.deepEqual([n.w, n.h, n.size], [NEW_NODE.w, NEW_NODE.h, 'wide-normal']);
  assert.deepEqual(overlapsOf(rows), []);
  const cl = rigCluster(Object.keys(B.def.roles), B.def.flows.map((f) => ({ ...f, from: [].concat(f.from), to: [].concat(f.to) })), { W: NEW_NODE.w, H: NEW_NODE.h });
  const d0 = nodeOf(B, roleS(B, 'data')), c0 = cl.at.get('data');
  for (const r of ['ideas', 'verify']) { const n = nodeOf(B, roleS(B, r)), c = cl.at.get(r); assert.deepEqual([n.x - d0.x, n.y - d0.y], [c.x - c0.x, c.y - c0.y], r); }
  const bn = nodeOf(B, roleS(B, BUILDER_ROLE)), bc = cl.at.get(GRID_BUILDER);
  assert.deepEqual([bn.x - d0.x, bn.y - d0.y], [bc.x - c0.x, bc.y - c0.y], '빌더 칸');
  assert.equal(linesThrough(B), 0);
});

for (const [label, def] of [['3역할', DEF3], ['5역할', DEF5]]) {
  test(`P262 워크스페이스 정리(${label} + 빌더 + 보통 세션): rig는 한 덩어리 같은 크기, 선이 노드를 지나지 않고 겹침 없음, 보통 세션은 덩어리와 넉넉히 떨어진다. 되돌리기 그대로`, async () => {
    const B = await board(def());
    const lead = B.mk('lead'); B.mk('w1', { parent: lead, w: 1040, h: 585 }); B.mk('w2', { parent: lead, w: 1040, h: 585 }); B.mk('lone', { w: 1040, h: 585 });
    const before = B.store.nodes().map((n) => ({ ...n }));
    const r = ops.arrange(B.b, { workspace: B.ws.key, apply: true });
    assert.equal(r.applied, true);
    const rows = B.store.nodes();
    const rig = rigSessions(B).map((s) => nodeOf(B, s));
    for (const n of rig) assert.deepEqual([n.w, n.h], [NEW_NODE.w, NEW_NODE.h], '같은 크기');
    assert.deepEqual(overlapsOf(rows), [], '겹침 없음');
    assert.equal(linesThrough(B), 0, '역할 선이 노드를 지나지 않는다');
    // 덩어리 자리는 rigCluster 그대로(켤 때와 같은 칸)
    const cl = rigCluster(Object.keys(B.def.roles), B.def.flows.map((f) => ({ ...f, from: [].concat(f.from), to: [].concat(f.to) })), { W: NEW_NODE.w, H: NEW_NODE.h, beatRole: B.def.beat ? B.def.beat.role : null });
    const k0 = Object.keys(B.def.roles)[0], n0 = nodeOf(B, roleS(B, k0)), c0 = cl.at.get(k0);
    for (const k of [...Object.keys(B.def.roles), BUILDER_ROLE]) { const n = nodeOf(B, roleS(B, k)), c = cl.at.get(k === BUILDER_ROLE ? GRID_BUILDER : k); assert.deepEqual([n.x - n0.x, n.y - n0.y], [c.x - c0.x, c.y - c0.y], k); }
    // 보통 세션 무리와 덩어리 사이 ≥ rigSep
    const ids = new Set(rig.map((n) => n.session_id));
    const others = rows.filter((n) => !ids.has(n.session_id));
    assert.ok(gapOf(bbox(rig), bbox(others)) >= rigSep(cl.GX, cl.GY), '넉넉한 틈 ' + gapOf(bbox(rig), bbox(others)));
    // 보통 세션 나무는 지금 규칙 그대로: 부모 오른쪽에 하위 열
    const L = nodeOf(B, B.b.resolve('lead')), w1 = nodeOf(B, B.b.resolve('w1')), w2 = nodeOf(B, B.b.resolve('w2'));
    assert.ok(w1.x > L.x + L.w && w1.x === w2.x && w2.y > w1.y);
    assert.equal(L.y, w1.y, '부모 윗변 = 첫 자식 윗변');
    // 되돌리기
    ops.arrange(B.b, { workspace: B.ws.key, undo: true });
    const after = B.store.nodes();
    for (const n of before) { const m = after.find((x) => x.session_id === n.session_id); assert.deepEqual([m.x, m.y, m.w, m.h, m.size], [n.x, n.y, n.w, n.h, n.size]); }
  });
}

test('P262 사람이 손으로 키운 rig 노드가 있으면 그 크기로 rig 전체를 맞춘다(크기 열쇠 없는 자유 크기면 열쇠를 지운다)', async () => {
  const B = await board();
  const v = nodeOf(B, roleS(B, 'verify'));
  B.store.setNode({ ...v, w: 1700, h: 900 }); B.store.setNodeAspect(v.session_id, null, null);
  ops.markHandSize(B.b, v.session_id);
  ops.arrange(B.b, { workspace: B.ws.key, apply: true });
  for (const s of rigSessions(B)) { const n = nodeOf(B, s); assert.deepEqual([n.w, n.h, n.size || null], [1700, 900, null], s.rigRole); }
  assert.deepEqual(overlapsOf(B.store.nodes()), []);
  assert.equal(linesThrough(B), 0);
});

test('P262 rig가 꺼진 워크스페이스와 rig 없는 판의 정리는 그대로(rig 덩어리 없이 지금 규칙)', async () => {
  const B = await board();
  B.mk('lead');
  const on = ops.arrange(B.b, { workspace: B.ws.key });
  B.store.setRigEnabled(B.ws.key, false);
  const off = ops.arrange(B.b, { workspace: B.ws.key });
  const rigB = B.b.rig; B.b.rig = null;
  const none = ops.arrange(B.b, { workspace: B.ws.key });
  B.b.rig = rigB;
  assert.deepEqual(off.plan, none.plan, '꺼진 rig = rig 없는 판');
  assert.notDeepEqual(on.plan, off.plan);
});

test('P262 판 전체 정리: rig 덩어리 자리·크기를 지키고 영역끼리 겹치지 않는다. 되돌리기는 판 전체를 정리 전으로', async () => {
  const B = await board(DEF5());
  B.mk('lead'); B.mk('lone', { w: 1040, h: 585 });
  const dir2 = tmp(); const ws2 = await workspaceOf(dir2); B.store.insertWorkspace({ ...ws2, createdAt: 2 });
  const a = B.mk('other-a', { key: ws2.key, root: dir2 }); B.mk('other-b', { key: ws2.key, root: dir2, parent: a, w: 1040, h: 585 });
  const before = B.store.nodes().map((n) => ({ ...n }));
  const r = ops.arrange(B.b, { all: true, apply: true });
  assert.equal(r.applied, true);
  const rows = B.store.nodes();
  assert.deepEqual(overlapsOf(rows), []);
  assert.equal(linesThrough(B), 0);
  for (const s of rigSessions(B)) assert.deepEqual([nodeOf(B, s).w, nodeOf(B, s).h], [NEW_NODE.w, NEW_NODE.h]);
  const regs = [...ops.regions(B.b)].filter(([k]) => k === B.ws.key || k === ws2.key).map(([, x]) => x);
  assert.equal(regs.length, 2); assert.ok(!overlaps(regs[0], regs[1], -1), '영역 겹침 없음');
  ops.arrange(B.b, { all: true, undo: true });
  const after = B.store.nodes();
  for (const n of before) { const m = after.find((x) => x.session_id === n.session_id); assert.deepEqual([m.x, m.y, m.w, m.h], [n.x, n.y, n.w, n.h]); }
});
