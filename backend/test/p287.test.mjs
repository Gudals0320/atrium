// P287: 설정 mergerPermission(merger 승인 방식). 빈 값은 맡긴 부모의 방식, 값을 고르면 그 방식, 고른 종류가 받지 않는 값은 부모 따름과 판 로그
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { Store } from '../src/store.mjs';
import { Merger, mergerPermissionOf, permissionModesOf } from '../src/merger.mjs';
import { SETTINGS, DEFAULTS, normalizePatch, PERMISSION_MODES } from '../src/settings.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p287-'));
const BASE = { mergerMode: 'on', mergerKind: 'claude', mergerModel: 'claude-sonnet-5-5', mergerEffort: 'medium', mergerPermission: '' };

function board(set, { parentMode = 'manual', kinds = [{ kind: 'claude', installed: true }, { kind: 'codex', installed: true }] } = {}) {
  const dir = tmp();
  const store = new Store(path.join(dir, 'board.db'));
  const adapter = Object.assign(new EventEmitter(), { connected: true, agentKinds: async () => kinds });
  const logs = [];
  const b = {
    store, adapter, sessions: new Map(), spawned: [], log: (m) => logs.push(m), api: { broadcast: () => {} },
    async spawn(p) { const s = { sessionId: crypto.randomUUID(), name: p.name, kind: p.kind, cwd: p.cwd, permissionMode: p.permissionMode || 'manual' }; b.sessions.set(s.sessionId, s); b.spawned.push(p); return { sessionId: s.sessionId }; },
  };
  b.sessions.set('lead-id', { sessionId: 'lead-id', name: 'lead', kind: 'claude', permissionMode: parentMode });
  const units = { queued: new Set(), nameOf: (id) => (b.sessions.get(id) || {}).name || 'lead', dispatch: () => ({}), pump: () => null };
  const m = new Merger(b, units, { settings: () => ({ ...BASE, ...set }), termWaitMs: 500, kindsWaitMs: 100, recoverDelayMs: 10 });
  const ws = 'ws1'; const key = ws + '|dev';
  const u = { id: 'u' + crypto.randomBytes(3).toString('hex'), from: 'lead-id', to: '', origin: 'merge', spec: '합치기: @w1', status: 'open', createdAt: Date.now(), source: null, meta: { key, ws, root: dir.split(path.sep).join('/'), target: 'dev', child: 'w1', childId: 'w1-id' } };
  store.insertUnit(u);
  return { b, m, key, logs, stop: () => store.close() };
}

test('P287 설정: 기본은 빈 값(부모 따름), 목록은 세션 띄우기 창의 승인 방식', () => {
  assert.equal(DEFAULTS.mergerPermission, '');
  assert.deepEqual(SETTINGS.mergerPermission.options, ['', 'inherit', ...PERMISSION_MODES]);
  assert.deepEqual(normalizePatch({ mergerPermission: 'bypassPermissions' }), { mergerPermission: 'bypassPermissions' });
  assert.throws(() => normalizePatch({ mergerPermission: 'yolo' }), /mergerPermission/);
});

test('P287 고르기(순수): 부모 따름, 설정 값, 종류에 없는 값', () => {
  assert.deepEqual(mergerPermissionOf({ kind: 'claude', set: {}, parentMode: 'auto' }), { mode: 'auto', from: 'parent', dropped: null });
  assert.deepEqual(mergerPermissionOf({ kind: 'claude', set: { mergerPermission: 'inherit' }, parentMode: 'auto' }), { mode: 'auto', from: 'parent', dropped: null });
  assert.deepEqual(mergerPermissionOf({ kind: 'claude', set: { mergerPermission: 'bypassPermissions' }, parentMode: 'manual' }), { mode: 'bypassPermissions', from: 'setting', dropped: null });
  assert.deepEqual(mergerPermissionOf({ kind: 'codex', set: { mergerPermission: 'dontAsk' }, parentMode: 'manual' }), { mode: 'dontAsk', from: 'setting', dropped: null });
  assert.deepEqual(mergerPermissionOf({ kind: 'pi', set: { mergerPermission: 'dontAsk' }, parentMode: 'manual' }), { mode: 'manual', from: 'parent', dropped: 'dontAsk' });
  assert.deepEqual(mergerPermissionOf({ kind: 'pi', set: { mergerPermission: 'dontAsk' } }), { mode: null, from: null, dropped: 'dontAsk' });
  assert.deepEqual(permissionModesOf('claude'), PERMISSION_MODES);
  assert.deepEqual(permissionModesOf('dsh'), []);
});

test('P287 띄우기: 기본은 부모의 승인 방식', async () => {
  const x = board({}, { parentMode: 'acceptEdits' });
  try { await x.m.ensure(x.key); assert.equal(x.b.spawned[0].permissionMode, 'acceptEdits'); } finally { x.stop(); }
});

test('P287 띄우기: 값을 고르면 부모와 상관없이 그 방식', async () => {
  const x = board({ mergerPermission: 'bypassPermissions' }, { parentMode: 'manual' });
  try {
    const s = await x.m.ensure(x.key);
    assert.equal(x.b.spawned[0].permissionMode, 'bypassPermissions');
    assert.equal(s.permissionMode, 'bypassPermissions', '세션 표(카드·세션 맵)에도 그 방식');
    assert.ok(!x.logs.some((l) => /merger permission/.test(l)));
  } finally { x.stop(); }
});

test('P287 띄우기: 바뀌어 쓰인 종류(codex)도 받는 값이면 그 방식', async () => {
  const x = board({ mergerPermission: 'dontAsk' }, { kinds: [{ kind: 'claude', installed: false }, { kind: 'codex', installed: true }] });
  try { await x.m.ensure(x.key); assert.equal(x.b.spawned[0].kind, 'codex'); assert.equal(x.b.spawned[0].permissionMode, 'dontAsk'); } finally { x.stop(); }
});

test('P287 띄우기: 종류에 없는 값 → 부모 따름과 판 로그 한 줄', async () => {
  const x = board({ mergerKind: 'pi', mergerPermission: 'bypassPermissions' }, { parentMode: 'plan', kinds: [{ kind: 'pi', installed: true }] });
  try {
    await x.m.ensure(x.key);
    assert.equal(x.b.spawned[0].kind, 'pi');
    assert.equal(x.b.spawned[0].permissionMode, 'plan');
    assert.equal(x.logs.filter((l) => /merger permission bypassPermissions not for kind pi, using parent \(plan\)/.test(l)).length, 1);
  } finally { x.stop(); }
});
