// P348 단위 시험: 전환 중·뒤 판정 없음, PC 잠듦 뒤 쉼, 곧바로 배지(카드 없음), 메모리 두 번 확인, CPU 짧은 내려감,
//   도우미 snapshot 해석·실패하면 PowerShell 길, 측정 간격, 기록 자르기, 실제 도우미 snapshot.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { judge, guardConfig, transitHold, transitOf, trimHist, mayCard, ResourceGuard, TRANSIT_GRACE_MS, SYSTEM_GAP_MS, DIP_MS } from '../src/resource-guard.mjs';
import { tableReader, ResourceMonitor } from '../src/resources.mjs';
import { parseSnapshot, ProcControl } from '../src/proc-control.mjs';
import { Store } from '../src/store.mjs';
import { normalizePatch, DEFAULTS } from '../src/settings.mjs';

const cfg = guardConfig({});
const MIN = 60_000;
const hist = (n, f, now = 10_000_000, step = 5_000) => Array.from({ length: n }, (_, i) => ({ at: now - (n - 1 - i) * step, spanMs: step, ...f(i) }));

function fakeBoard() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p348-'));
  const store = new Store(path.join(dir, 'board.db'));
  const decisions = { store: () => store, changed: () => {}, push: () => {} };
  const sessions = new Map([['s1', { sessionId: 's1', name: 'w1', kind: 'claude', paneId: 'p1' }]]);
  const logs = [];
  const b = { store, sessions, decisions, log: (m) => logs.push(m), api: { broadcast: () => {} }, adapter: { processInfo: async () => ({ shell_pid: 10 }) } };
  return { b, store, logs };
}
const row = (state, core, memMB, extra = {}) => ({ sessionId: 's1', name: 'w1', state, cpuPct: core / 8, memMB, shellPid: 10, claudePid: 10, kind: 'claude', topCpu: { pid: 30, created: 3000, name: 'node.exe', cpuPct: core / 8, memMB: 50 }, topMem: { pid: 10, created: 1000, name: 'claude.exe', cpuPct: 1, memMB }, ...extra });
const snapOf = (at, rows, span = 5_000) => ({ at, cpu: { cores: 8, spanMs: span }, sessions: rows });
const guard = (b, st = {}) => new ResourceGuard(b, { monitor: { trees: new Map(), readTable: async () => null }, proc: { available: () => false }, settings: () => st, setPriority: () => true });

test('기준: 곧바로 표시 배수 기본 2, 0이면 끔, 설정 칸', () => {
  assert.equal(cfg.instantX, 2);
  assert.equal(guardConfig({ guardInstantX: 0 }).instantX, 0);
  assert.equal(DEFAULTS.guardInstantX, 2);
  assert.equal(normalizePatch({ guardInstantX: '3' }).guardInstantX, 3);
  assert.throws(() => normalizePatch({ guardInstantX: 50 }));
});

test('전환: 판의 상태·runtime → transit·transitAt', () => {
  assert.deepEqual(transitOf({ state: 'starting' }, { rt: { launchedAt: 5 } }), { transit: 'starting', transitAt: 5 });
  assert.equal(transitOf({ state: 'starting', moving: 'hc' }, { rt: {} }).transit, 'moving');
  assert.equal(transitOf({ state: 'ready' }, { waking: { at: 1 }, rt: {} }).transit, 'waking');
  assert.equal(transitOf({ state: 'sleeping' }, { rt: { sleep: { at: 9, going: true } } }).transit, 'sleeping');
  assert.equal(transitOf({ state: 'working', estimate: 'compacting' }, { rt: {} }).transit, 'compacting');
  const t = transitOf({ state: 'ready' }, { wokeAt: 100, rt: { launchedAt: 50, compact: { at: 10, endedAt: 120 } } });
  assert.deepEqual(t, { transit: null, transitAt: 120 });
  assert.deepEqual(transitOf({ state: 'ready' }, { rt: {} }), { transit: null, transitAt: null });
});

test('전환 쉼: 전환 중, 끝난 뒤 TRANSIT_GRACE_MS 안, 판이 본 때', () => {
  assert.deepEqual(transitHold({ transit: 'waking' }, 1000), { what: 'waking', until: null });
  assert.equal(transitHold({ transitAt: 1000 }, 1000 + TRANSIT_GRACE_MS - 1).what, 'after');
  assert.equal(transitHold({ transitAt: 1000 }, 1000 + TRANSIT_GRACE_MS), null);
  assert.equal(transitHold({}, 5000, 4000).until, 4000 + TRANSIT_GRACE_MS);
  assert.equal(transitHold({}, 5000, null), null);
  assert.equal(transitHold({ transitAt: 9000 }, 5000), null); // 앞날 값은 보지 않는다
});

test('흐름: 깨우는 중·잠드는 중에는 CPU·메모리가 튀어도 배지·카드 없음, 끝나고 쉼이 지나면 그때부터 센다', async () => {
  const { b, store } = fakeBoard();
  const g = guard(b);
  let t = 10_000_000;
  // 깨우기 2분: 코어 셋, 메모리 7GB
  for (let i = 0; i < 24; i++) { t += 5_000; const s = snapOf(t, [row('starting', 300, 7000, { transit: 'waking' })]); await g.step(s); assert.equal(s.sessions[0].guard, undefined); assert.equal(s.sessions[0].hold.what, 'waking'); }
  assert.equal(g.hist.get('s1').length, 0);
  // 깨어남(쉼): 쉼 시간 동안은 판정하지 않는다
  const woke = t;
  for (let i = 0; i < Math.floor(TRANSIT_GRACE_MS / 5_000) - 1; i++) { t += 5_000; const s = snapOf(t, [row('ready', 300, 7000, { transitAt: woke })]); await g.step(s); assert.equal(s.sessions[0].guard, undefined, `grace ${i}`); }
  // 쉼이 지나면 곧바로 배지(뚜렷함), 카드는 아직
  t = woke + TRANSIT_GRACE_MS + 1; let s = snapOf(t, [row('ready', 300, 7000, { transitAt: woke })]); await g.step(s);
  assert.equal(s.sessions[0].guard.kind, 'suspect');
  assert.ok(s.sessions[0].guard.reasons.every((r) => r.instant));
  assert.equal(store.openDecisions().length, 0);
  // 다음 측정: 메모리가 두 번 이어져 지속 기준 → 카드
  t += 5_000; s = snapOf(t, [row('ready', 300, 7000, { transitAt: woke })]); await g.step(s);
  assert.equal(store.openDecisions().length, 1);
  // 잠드는 중: 경보가 있으면 그대로 보이고, 새로 판정하지 않는다
  t += 5_000; s = snapOf(t, [row('sleeping', 300, 7000, { transit: 'sleeping' })]); await g.step(s);
  assert.equal(s.sessions[0].guard.kind, 'suspect');
  assert.equal(g.hist.get('s1').length, 0);
});

test('흐름: 잠드는 중(쉼처럼 보이는 sleeping)의 큰 메모리로 카드를 만들지 않는다', async () => {
  const { b, store } = fakeBoard();
  const g = guard(b);
  let t = 10_000_000;
  for (let i = 0; i < 10; i++) { t += 5_000; await g.step(snapOf(t, [row('sleeping', 150, 4000, { transit: 'sleeping' })])); }
  assert.equal(store.openDecisions().length, 0);
  assert.equal(g.alerts.size, 0);
  assert.equal(store.eventsAfter(0, ['resource_alert']).length, 0);
});

test('흐름: PC가 잠들었다 깨어나면(측정 사이가 김) 쉼 시간 동안 판 전체 판정 없음', async () => {
  const { b, logs } = fakeBoard();
  const g = guard(b);
  let t = 10_000_000;
  await g.step(snapOf(t, [row('ready', 1, 100)]));
  t += SYSTEM_GAP_MS + 60_000; let s = snapOf(t, [row('ready', 300, 7000)], SYSTEM_GAP_MS + 60_000); await g.step(s);
  assert.equal(s.sessions[0].guard, undefined); assert.equal(s.sessions[0].hold.what, 'system');
  assert.ok(logs.some((m) => /PC sleep/.test(m)));
  t += TRANSIT_GRACE_MS; s = snapOf(t, [row('ready', 300, 7000)]); await g.step(s);
  assert.ok(s.sessions[0].guard);
});

test('곧바로 배지: CPU가 기준 × 배수면 다음 측정에서(카드 없음), 지속 기준이 되면 카드', async () => {
  const { b, store, logs } = fakeBoard();
  const g = guard(b);
  let t = 10_000_000;
  t += 5_000; await g.step(snapOf(t, [row('ready', 1, 100)]));
  t += 5_000; let s = snapOf(t, [row('ready', 200, 100)]); await g.step(s);
  assert.equal(s.sessions[0].guard.reasons[0].type, 'cpu'); assert.equal(s.sessions[0].guard.reasons[0].instant, true); assert.equal(s.sessions[0].guard.reasons[0].pct, 200);
  assert.equal(store.openDecisions().length, 0);
  assert.equal(store.eventsAfter(0, ['resource_alert'])[0].data.instant, true);
  for (let i = 0; i < 36; i++) { t += 5_000; s = snapOf(t, [row('ready', 200, 100)]); await g.step(s); }
  assert.equal(s.sessions[0].guard.reasons[0].instant, undefined);
  assert.equal(store.openDecisions().length, 1);
  assert.equal(store.eventsAfter(0, ['resource_alert']).length, 2); // 곧바로 → 지속, 한 번 더 기록
  // 배수 0이면 곧바로 배지 없음
  const g2 = guard(fakeBoard().b, { guardInstantX: 0 });
  t += 5_000; await g2.step(snapOf(t, [row('ready', 1, 100)]));
  t += 5_000; s = snapOf(t, [row('ready', 400, 100)]); await g2.step(s);
  assert.equal(s.sessions[0].guard, undefined);
  // 기준 × 배수 아래(코어 하나 남짓)는 곧바로 배지 없음
  assert.deepEqual(judge(hist(2, () => ({ core: 170, memMB: 100 })), cfg), []);
});

test('곧바로 배지 판정: 메모리 두 배면 한 번에, 한 배면 두 번 이어져야', () => {
  assert.deepEqual(judge(hist(1, () => ({ core: 1, memMB: 6200 })), cfg), [{ type: 'mem', memMB: 6200, instant: true }]);
  assert.deepEqual(judge(hist(2, (i) => ({ core: 1, memMB: i ? 3200 : 2000 })), cfg), []);
  assert.deepEqual(judge(hist(2, () => ({ core: 1, memMB: 3200 })), cfg), [{ type: 'mem', memMB: 3200 }]);
  assert.equal(mayCard({ kind: 'suspect', reasons: [{ type: 'mem', instant: true }] }, { now: 1 }), false);
  assert.equal(mayCard({ kind: 'suspect', reasons: [{ type: 'mem', instant: true }, { type: 'cpu', ms: 1 }] }, { now: 1 }), true);
});

test('CPU 지속: 5초 표본의 짧은 내려감(DIP_MS 이하)은 끊지 않고, 길면 끊는다', () => {
  const n = 3 * 12 + 1; // 3분 + 1
  const r = judge(hist(n, (i) => ({ core: i === 20 || i === 21 ? 50 : 95, memMB: 100 })), cfg);
  assert.equal(r.length, 1); assert.equal(r[0].type, 'cpu'); assert.equal(r[0].pct, 95);
  const k = Math.floor(DIP_MS / 5_000) + 1;
  assert.deepEqual(judge(hist(n, (i) => ({ core: i >= 20 && i < 20 + k ? 50 : 95, memMB: 100 })), cfg), []);
  // 끝의 짧은 내려감 동안은 경보가 이어진다
  assert.equal(judge(hist(n, (i) => ({ core: i === n - 1 ? 40 : 95, memMB: 100 })), cfg)[0].type, 'cpu');
});

test('기록 자르기: 가장 긴 기준 시간 + 2분만', () => {
  const h = hist(400, () => ({ core: 1, memMB: 1 }), 10_000_000, 5_000);
  trimHist(h, cfg, 10_000_000);
  const keep = 15 * MIN + 2 * MIN;
  assert.ok(h[0].at >= 10_000_000 - keep);
  assert.equal(h.length, Math.floor(keep / 5_000) + 1);
});

test('도우미 snapshot 해석: 머리 줄, 줄 모양(CIM과 같다), 잘못된 출력은 null', () => {
  const out = '#snapshot 1700000000000\r\n0\t0\t-1\t0\t8192\t0\tSystem Idle Process\r\n4\t0\t1699999990000\t5000\t4096\t8\tSystem\r\n1234\t4\t1699999999000\t123456\t1048576\t6\tnode.exe\r\nbad line\r\n';
  const t = parseSnapshot(out);
  assert.equal(t.via, 'native'); assert.equal(t.at, 1700000000000);
  assert.equal(t.procs.size, 3);
  assert.deepEqual(t.procs.get(1234), { pid: 1234, ppid: 4, ws: 1048576, name: 'node.exe', created: 1699999999000, cpu: 123456, prio: 6 });
  assert.equal(t.procs.get(0).created, null);
  assert.equal(parseSnapshot('no header\n1\t2\t3\t4\t5\t6\tx'), null);
  assert.equal(parseSnapshot(''), null);
  assert.equal(parseSnapshot('#snapshot 1\n'), null);
});

test('표 읽기: 도우미가 있으면 그것, 없거나 실패하면 PowerShell 길(한 번 기록)', async () => {
  const cim = async () => ({ procs: new Map([[1, {}]]), at: 1 });
  const logs = [];
  let native = { procs: new Map(), at: 2, via: 'native' };
  const proc = { available: () => true, snapshot: async () => native };
  const read = tableReader(proc, cim, (m) => logs.push(m));
  assert.equal((await read()).via, 'native');
  native = null;
  assert.equal((await read()).via, 'cim');
  assert.equal((await read()).via, 'cim');
  assert.equal(logs.length, 1);
  assert.equal((await tableReader({ available: () => false, snapshot: async () => { throw new Error('x'); } }, cim)()).via, 'cim');
  assert.equal((await tableReader(null, async () => null)()), null);
});

test('측정 간격: 도우미로 읽으면 5초, PowerShell이면 30초, 폭주 후보 간격은 그 안에서', async () => {
  const mk = (via) => new ResourceMonitor({ sessions: () => [], processInfo: async () => null, controllers: () => [], readTable: async () => ({ procs: new Map(), at: Date.now(), via }), cpus: () => [] });
  const a = mk('native'); await a.sample(); assert.equal(a.delay(), 5000); assert.equal(a.last.via, 'native'); assert.equal(a.last.intervalMs, 5000); assert.ok(a.last.readMs >= 0);
  const c = mk('cim'); await c.sample(); assert.equal(c.delay(), 30000);
  c.nextDelay = () => 10000; assert.equal(c.delay(), 10000);
  a.nextDelay = () => 10000; assert.equal(a.delay(), 5000);
});

test('측정 줄에 전환이 실린다(판이 준 transit·transitAt)', async () => {
  const procs = new Map([[10, { pid: 10, ppid: 1, ws: 1048576, name: 'claude.exe', created: 1, cpu: 0 }]]);
  const m = new ResourceMonitor({ sessions: () => [{ sessionId: 's1', name: 'w', paneId: 'p', state: 'starting', transit: 'waking', transitAt: 5 }], processInfo: async () => ({ shell_pid: 10 }), controllers: () => [], readTable: async () => ({ procs, at: Date.now(), via: 'native' }), cpus: () => [] });
  const s = await m.sample();
  assert.equal(s.sessions[0].transit, 'waking'); assert.equal(s.sessions[0].transitAt, 5);
});

// 실제 도우미(Windows + csc): snapshot이 이 프로세스를 부모·생성 시각과 함께 보인다
test('도우미 실제 snapshot', { skip: process.platform !== 'win32' }, async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p348-bin-'));
  const pc = new ProcControl({ dir });
  if ((await pc.ensure()) !== 'ready') return t.skip('csc 없음');
  const s = await pc.snapshot();
  assert.ok(s && s.procs.size > 10);
  const me = s.procs.get(process.pid);
  assert.ok(me, 'this process');
  assert.equal(me.ppid, process.ppid);
  assert.match(me.name, /node/i);
  assert.ok(me.cpu > 0 && me.ws > 0 && Number.isFinite(me.created) && me.created < Date.now());
  assert.ok(Math.abs(s.at - Date.now()) < 10_000);
});
