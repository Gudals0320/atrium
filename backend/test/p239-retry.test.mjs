// P239 덧붙임(rig2-design 11.18): 다시 맡기기는 지금 정의에 그 자리가 있으면 자리 칸(launcher, model, effort, permission, allow, writes)만 지금 정의의 것으로 띄운다.
// 흐름 줄과 상한은 건이 쥔 버전 그대로, 장부 seat_spawn에 data.seatFrom. 지금 정의에 자리가 없으면 건의 버전 그대로.
// 그리고 loop가 null인 회(R2 전·v1 정의)는 done 훅에서 고리 work로 본다(P236 답 1).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.mjs';
import { workspaceOf } from '../src/git.mjs';
import { Rig } from '../src/rig.mjs';
import { RigFlow, SEAT_FROM_NOW } from '../src/rig-flow.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p239r-'));
// 건이 쥔 버전(v3): checker = codex, 흐름 상한 2. 지금 정의(v6): checker = claude sonnet, 상한 5
const PINNED = { seats: { main: { name: 'main', launcher: 'claude', session: 'keep' }, checker: { name: 'checker', launcher: 'codex', session: 'fresh', maxLive: 1, model: 'gpt-x', permission: 'scoped', writes: false, allow: [], worktree: false } }, flow: [{ index: 0, from: 'main', on: 'ok', to: ['checker'], max: 2 }] };
const NOW = { seats: { main: PINNED.seats.main, checker: { name: 'checker', launcher: 'claude', session: 'fresh', maxLive: 1, model: 'sonnet', effort: 'high', permission: 'scoped', writes: ['reports/'], allow: ['Bash(git status:*)'], worktree: true } }, flow: [{ index: 0, from: 'main', on: 'ok', to: ['checker'], max: 5 }] };

function fakeFlow({ now = NOW, pinned = PINNED } = {}) {
  const spawns = [];
  const owner = { sessionId: 'own', name: 'main' };
  const f = Object.create(RigFlow.prototype);
  Object.assign(f, {
    b: { sessions: new Map([['own', owner]]), log: () => {}, rig: { cachedN: () => 6 } },
    store: () => ({ updateTry: () => {}, addEvent: () => {}, setUnitTarget: () => {}, getUnit: (id) => ({ id }), setSessionSeat: () => {} }),
    defOfCase: () => pinned, liveCount: () => 0, retriedEvent: () => {}, units: () => ({ dispatch: () => {} }), nameOf: () => 'checker-1',
    spawnSeat: async (ctx, seatName, o, c, unitId, opts) => { spawns.push({ ctx, seatName, opts }); return { sessionId: 'new', name: 'checker-2' }; },
  });
  const r = { n: 6, def: now, root: 'C:/x' };
  const c = { id: 'c1', workspaceKey: 'k', owner: 'own', versionN: 3 };
  const u = { id: 'u1', seat: 'checker', to: 'gone' };
  const tr = { id: 't1', endedAt: 1 };
  return { f, r, c, u, tr, spawns };
}

test('P239 다시 맡기기: 자리 칸은 지금 정의(런처가 바뀌면 새 런처), 흐름 줄·상한과 그 밖의 칸은 건의 버전, seatFrom', async () => {
  assert.deepEqual(SEAT_FROM_NOW, ['launcher', 'model', 'effort', 'permission', 'allow', 'writes']);
  const x = fakeFlow();
  const out = await x.f.retryUnit(x.c, x.u, x.tr, x.r, { by: 'human', who: null });
  assert.equal(out.to, 'checker-2');
  const sp = x.spawns[0];
  const seat = sp.ctx.def.seats.checker;
  assert.deepEqual({ launcher: seat.launcher, model: seat.model, effort: seat.effort, writes: seat.writes, allow: seat.allow }, { launcher: 'claude', model: 'sonnet', effort: 'high', writes: ['reports/'], allow: ['Bash(git status:*)'] });
  assert.equal(seat.worktree, false, '자리 칸이 아닌 것(worktree)은 건의 버전');
  assert.equal(sp.ctx.seat, seat);
  assert.deepEqual(sp.ctx.def.flow, PINNED.flow, '흐름 줄과 상한은 건의 버전(max 2)');
  assert.equal(sp.ctx.def.flow[0].max, 2);
  assert.deepEqual(sp.opts, { seatFrom: 6 });
  assert.equal(PINNED.seats.checker.launcher, 'codex', '건의 정의를 바꾸지 않는다');
});

test('P239 다시 맡기기: 지금 정의에 자리가 없으면 건의 버전 그대로(seatFrom 없음), 건의 버전에도 없으면 오류', async () => {
  const x = fakeFlow({ now: { seats: { main: NOW.seats.main }, flow: [] } });
  await x.f.retryUnit(x.c, x.u, x.tr, x.r, { by: 'human', who: null });
  const sp = x.spawns[0];
  assert.equal(sp.ctx.def, PINNED);
  assert.equal(sp.ctx.seat.launcher, 'codex');
  assert.deepEqual(sp.opts, { seatFrom: null });
  const y = fakeFlow({ pinned: { seats: { main: PINNED.seats.main }, flow: [] } });
  await assert.rejects(() => y.f.retryUnit(y.c, y.u, y.tr, y.r, { by: 'human', who: null }), /checker 자리가 없다/);
});

test('P239 seat_spawn 장부 줄의 data.seatFrom(다시 맡기기만)', async () => {
  const dir = tmp();
  const store = new Store(path.join(dir, 'board.db'));
  const ws = await workspaceOf(dir);
  store.insertWorkspace({ ...ws, createdAt: 1 });
  store.insertCase({ id: 'c1', workspaceKey: ws.key, owner: 'own', state: 'open', createdAt: Date.now(), versionN: 3, loop: 'work' });
  const sessions = new Map();
  const f = Object.create(RigFlow.prototype);
  let n = 0;
  Object.assign(f, {
    b: { sessions, log: () => {}, store },
    store: () => store, spawning: new Map(),
    branch: { pendingNames: [], findLauncher: () => null, spawnChild: async (owner, o) => { const s = { sessionId: `s${++n}`, name: o.name, workspaceKey: ws.key }; sessions.set(s.sessionId, s); return { sessionId: s.sessionId }; } },
  });
  const seat = NOW.seats.checker;
  const ctx = { key: ws.key, r: { root: dir }, def: NOW, seat, name: 'checker' };
  await f.spawnSeat(ctx, 'checker', { sessionId: 'own', name: 'main', kind: 'claude' }, { id: 'c1', loop: 'work' }, 'u1', { seatFrom: 6 });
  await f.spawnSeat(ctx, 'checker', { sessionId: 'own', name: 'main', kind: 'claude' }, { id: 'c1', loop: 'work' }, 'u2');
  const rows = store.rigEvents({ ws: ws.key, limit: 100 }).filter((e) => e.kind === 'seat_spawn');
  assert.deepEqual(rows.map((r) => r.data.seatFrom ?? null), [6, null]);
});

// ---------- loop가 null인 회 = work ----------
test('P239 done 훅 loop work: loop가 null인 회(R2 전·v1 정의)에서도 돈다. 다른 고리의 회와 회 없는 done에는 돌지 않는다', async () => {
  const hooks = [{ index: 0, at: 'done', loop: ['work'], run: ['node', 'x.mjs'] }];
  const ran = [];
  const cases = { c0: { id: 'c0', loop: null }, c1: { id: 'c1', loop: 'improve' }, c2: { id: 'c2', loop: 'work' } };
  const rig = Object.create(Rig.prototype);
  Object.assign(rig, {
    active: () => ({ def: { hooks } }),
    store: () => ({ getCase: (id) => cases[id] }),
    runAt: async (r, ctx) => { ran.push({ run: ctx.run, match: hooks.filter(ctx.match).length }); return { action: 'reject', reason: 'x', runs: [] }; },
  });
  const caller = { workspaceKey: 'k', rigSeat: 'main', name: 'main', sessionId: 's' };
  const go = (caseId) => rig.done({ caller, tryRow: null, unit: caseId ? { id: 'u', caseId } : { id: 'u' }, result: 'ok', text: 't' });
  assert.equal((await go('c0')).action, 'reject');
  assert.deepEqual(ran[0], { run: { id: 'c0', loop: 'work' }, match: 1 });
  assert.equal((await go('c1')).action, 'pass');
  assert.equal((await go(null)).action, 'pass');
  assert.equal((await go('c2')).action, 'reject');
  assert.equal(ran.length, 2);
});
