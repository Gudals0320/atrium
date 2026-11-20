// P285: merger 종류 고르기에서 하네스 목록을 읽지 못한 것과 읽었는데 없는 것을 나눈다. 판이 막 떠 터미널 서버에 닿기 전이면 기다렸다 띄운다.
//   판이 다시 떴을 때 남은 합치기 일(맡은 merger가 없는 일)을 다시 맡긴다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { Store } from '../src/store.mjs';
import { Merger, pickMergerSpawn, readKinds, kindsLine, noKindWhy } from '../src/merger.mjs';
import { HcAdapter } from '../src/hc/adapter.mjs';

const tmp = (p = 'mtask-p285-') => fs.mkdtempSync(path.join(os.tmpdir(), p));
const tick = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(f, ms = 3000) { const t0 = Date.now(); while (!f()) { if (Date.now() - t0 > ms) throw new Error('시간 넘김'); await tick(10); } }
const SET = { mergerMode: 'on', mergerKind: 'claude', mergerModel: 'claude-sonnet-5-5', mergerEffort: 'medium' };
const K = (c, x) => [{ kind: 'claude', installed: c, path: c ? 'claude' : null }, { kind: 'codex', installed: x, path: x ? 'codex' : null }];

// 가짜 판: 진짜 Store, 띄우기는 세션 표에 넣기만, 일 넣기(dispatch)는 적기만
function board({ kinds = async () => K(true, true), connected = true, opts = {} } = {}) {
  const dir = tmp();
  const store = new Store(path.join(dir, 'board.db'));
  const adapter = Object.assign(new EventEmitter(), { connected, agentKinds: kinds });
  const logs = []; const events = [];
  const b = {
    store, adapter, sessions: new Map(), spawned: [], dispatched: [], log: (m) => logs.push(m), api: { broadcast: (e, v) => events.push([e, v]) },
    async spawn(p) {
      if (adapter.connected === false) throw Object.assign(new Error('터미널 없음'), { code: 'terminal_down' });
      const s = { sessionId: crypto.randomUUID(), name: p.name, kind: p.kind, cwd: p.cwd };
      b.sessions.set(s.sessionId, s); b.spawned.push(p);
      return { sessionId: s.sessionId };
    },
  };
  const units = { queued: new Set(), nameOf: (id) => (b.sessions.get(id) || {}).name || 'lead', dispatch: (u) => { b.dispatched.push(u.id); return {}; }, pump: () => null };
  const m = new Merger(b, units, { settings: () => SET, termWaitMs: 2000, kindsWaitMs: 100, recoverDelayMs: 10, ...opts });
  const ws = 'ws1'; const key = ws + '|dev';
  const job = (extra = {}) => { const u = { id: 'u' + crypto.randomBytes(3).toString('hex'), from: 'lead-id', to: '', origin: 'merge', spec: '합치기: @w1', status: 'open', createdAt: Date.now(), source: null, meta: { key, ws, root: dir.split(path.sep).join('/'), target: 'dev', child: 'w1', childId: 'w1-id' }, ...extra }; store.insertUnit(u); return u; };
  return { b, m, store, adapter, logs, events, key, job, stop: () => store.close() };
}

test('P285 고르기(순수): 읽지 못함은 설정 종류, 읽었는데 없음만 바꾼다', () => {
  assert.equal(pickMergerSpawn({ kinds: [], set: SET, read: false }).kind, 'claude');
  assert.equal(pickMergerSpawn({ kinds: K(false, false), set: SET, read: false }).picked, 'setting', '읽지 못했다고 하면 목록을 믿지 않는다');
  assert.deepEqual(pickMergerSpawn({ kinds: K(false, true), set: SET }), { kind: 'codex', model: null, effort: 'medium', picked: 'installed', wanted: 'claude' });
  assert.equal(pickMergerSpawn({ kinds: K(false, false), set: SET }), null);
  assert.equal(pickMergerSpawn({ kinds: K(null, false), set: SET }).picked, 'setting', 'where.exe가 답하지 못한 종류(null)는 있는 것으로');
});

test('P285 readKinds: 오류·빈 목록·시간 넘김은 read false와 까닭, 목록 줄', async () => {
  assert.deepEqual(await readKinds(null), { kinds: [], read: false, why: '판에 하네스 목록이 없다' });
  const e = await readKinds({ agentKinds: async () => { throw new Error('boom'); } });
  assert.equal(e.read, false); assert.match(e.why, /읽기 실패: boom/);
  assert.deepEqual(await readKinds({ agentKinds: async () => [] }), { kinds: [], read: false, why: '빈 목록' });
  const slow = await readKinds({ agentKinds: () => new Promise((r) => setTimeout(() => r(K(true, true)), 300)) }, { timeoutMs: 30 });
  assert.equal(slow.read, false); assert.match(slow.why, /답이 없다/);
  const ok = await readKinds({ agentKinds: async () => K(false, true) });
  assert.equal(ok.read, true); assert.equal(ok.why, null);
  assert.equal(kindsLine([...K(false, true), { kind: 'pi', installed: null }]), 'claude 없음, codex 있음, pi 모름');
  assert.match(noKindWhy({ set: SET, kinds: K(false, false) }), /판이 읽은 하네스 목록: claude 없음, codex 없음\)$/);
});

for (const [name, kinds] of [
  ['오류', async () => { throw new Error('where failed'); }],
  ['빈 목록', async () => []],
  ['시간 넘김', () => new Promise((r) => setTimeout(() => r(K(false, false)), 400))],
]) {
  test('P285 agentKinds ' + name + ' → 설정 종류로 띄운다', async () => {
    const x = board({ kinds });
    try {
      const u = x.job();
      const s = await x.m.ensure(x.key);
      assert.ok(s, '띄웠다');
      assert.equal(x.b.spawned.length, 1);
      assert.equal(x.b.spawned[0].kind, 'claude');
      assert.equal(x.b.spawned[0].model, 'claude-sonnet-5-5');
      assert.equal(x.store.getUnit(u.id).to, s.sessionId, '일을 맡겼다');
      assert.equal(x.store.getUnit(u.id).status, 'open');
      assert.ok(x.logs.some((l) => /merger kinds unread/.test(l)));
    } finally { x.stop(); }
  });
}

test('P285 목록을 읽었고 claude 없음·codex 있음 → codex', async () => {
  const x = board({ kinds: async () => K(false, true) });
  try {
    x.job();
    const s = await x.m.ensure(x.key);
    assert.equal(s.kind, 'codex');
    assert.ok(x.logs.some((l) => /not installed, using codex \(read claude 없음, codex 있음\)/.test(l)));
  } finally { x.stop(); }
});

test('P285 목록을 읽었고 둘 다 없음 → no_kind: 부모에게 넘기고 까닭에 읽은 목록', async () => {
  const x = board({ kinds: async () => [...K(false, false), { kind: 'pi', installed: true, path: 'pi' }] });
  try {
    const u = x.job();
    assert.equal(await x.m.ensure(x.key), null);
    assert.equal(x.b.spawned.length, 0);
    assert.equal(x.store.getUnit(u.id).status, 'cancelled');
    const p = x.events.find(([e]) => e === 'merger.problem');
    assert.match(p[1].why, /설치돼 있지 않다.*판이 읽은 하네스 목록: claude 없음, codex 없음, pi 있음/);
    assert.ok(x.logs.some((l) => /merger no_kind .*read claude 없음, codex 없음, pi 있음/.test(l)));
  } finally { x.stop(); }
});

test('P285 터미널 서버 연결 전 → 기다렸다 띄운다(부모에게 넘기지 않는다)', async () => {
  const x = board({ connected: false });
  try {
    const u = x.job();
    const p = x.m.ensure(x.key);
    await tick(50);
    assert.equal(x.b.spawned.length, 0, '아직 띄우지 않았다');
    x.adapter.connected = true; x.adapter.emit('connected');
    const s = await p;
    assert.ok(s);
    assert.equal(x.b.spawned.length, 1);
    assert.equal(x.store.getUnit(u.id).to, s.sessionId);
    assert.equal(x.store.getUnit(u.id).status, 'open');
  } finally { x.stop(); }
});

test('P285 기다려도 닿지 않으면 일을 붙잡아 두고, 연결되면 띄운다', async () => {
  const x = board({ connected: false, opts: { termWaitMs: 30 } });
  try {
    const u = x.job();
    assert.equal(await x.m.ensure(x.key), null);
    assert.equal(x.store.getUnit(u.id).status, 'open', '취소하지 않는다');
    assert.equal(x.store.getUnit(u.id).to, '');
    assert.ok(!x.events.some(([e]) => e === 'merger.problem'), '부모에게 넘기지 않는다');
    assert.ok(x.m.termWaiting.has(x.key));
    x.adapter.connected = true; x.adapter.emit('connected');
    await until(() => x.b.spawned.length === 1);
    await until(() => x.store.getUnit(u.id).to);
    assert.ok(!x.m.termWaiting.has(x.key));
  } finally { x.stop(); }
});

test('P285 판이 다시 떴다: 맡은 merger가 없어진 합치기 일은 열린 시도를 닫고 새 merger에게, 살아 있는 merger의 일은 그대로', async () => {
  const x = board();
  try {
    const alive = { sessionId: 'alive-id', name: 'merger-ws1-main' };
    x.b.sessions.set(alive.sessionId, alive);
    const lost = x.job({ to: 'gone-id' });
    x.store.insertTry({ id: 't1', unitId: lost.id, sessionId: 'gone-id', header: true, startedAt: Date.now() });
    const kept = x.job({ to: alive.sessionId, meta: { key: 'ws1|main', ws: 'ws1', target: 'main', child: 'w2' } });
    const r = await x.m.recover('test');
    assert.deepEqual(r.keys, [x.key]);
    assert.equal(x.b.spawned.length, 1);
    assert.equal(x.store.lastTryOfUnit(lost.id).stopReason, 'closed');
    assert.ok(x.store.lastTryOfUnit(lost.id).endedAt);
    const now = x.store.getUnit(lost.id);
    assert.notEqual(now.to, 'gone-id'); assert.ok(x.b.sessions.has(now.to));
    assert.ok(x.b.dispatched.includes(lost.id));
    assert.equal(x.store.getUnit(kept.id).to, alive.sessionId);
  } finally { x.stop(); }
});

test('P285 hc where.exe가 답하지 못한 종류는 모름(null)이고 담아 두지 않는다', async () => {
  const a = Object.create(HcAdapter.prototype);
  let fail = true;
  a._where = async (k) => (k === 'claude' && fail ? undefined : k === 'claude' ? 'C:/bin/claude.exe' : null);
  const first = await a.agentKinds();
  const c = first.find((k) => k.kind === 'claude');
  assert.equal(c.installed, null); assert.equal(c.error, 'where_failed');
  assert.equal(first.find((k) => k.kind === 'codex').installed, false);
  fail = false;
  assert.equal((await a.agentKinds()).find((k) => k.kind === 'claude').installed, true, '다음 물음에 다시 찾는다');
});
