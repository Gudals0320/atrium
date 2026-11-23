// P341 단위 시험: 폭주 판정(쉼/일함/셸, 기준·시간), 카드를 거듭 만들지 않음, 동작 전 PID 확인, 우선순위 대상 고르기, 도우미 출력 읽기, 보고 모으기.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { judge, classify, guardConfig, sampleOf, nearAlert, topOf, mayCard, verifyTarget, priorityTargets, reportOf, cardText, ResourceGuard, FAST_MS } from '../src/resource-guard.mjs';
import { treeTops, procCpu, cpuKey } from '../src/resources.mjs';
import { parseProcOut, procArgs, ProcControl } from '../src/proc-control.mjs';
import { Store } from '../src/store.mjs';
import { normalizePatch, DEFAULTS } from '../src/settings.mjs';

const cfg = guardConfig({});
const MIN = 60_000;
// 30초마다 표본 n개(끝이 now)
const hist = (n, f, now = 10_000_000, step = 30_000) => Array.from({ length: n }, (_, i) => ({ at: now - (n - 1 - i) * step, spanMs: step, ...f(i) }));

test('기본 기준: CPU 90% 3분, 메모리 3GB, 증가 10분, 둘 다 켬', () => {
  assert.deepEqual(cfg, { detect: true, lower: true, cpuPct: 90, cpuMs: 3 * MIN, memMB: 3072, growMs: 10 * MIN });
  const c = guardConfig({ guardDetect: false, guardLowerPriority: false, guardCpuPct: 50, guardCpuMin: 1, guardMemGB: 2, guardGrowMin: 0 });
  assert.deepEqual(c, { detect: false, lower: false, cpuPct: 50, cpuMs: MIN, memMB: 2048, growMs: 0 });
  assert.equal(DEFAULTS.guardLowerPriority, true);
  assert.throws(() => normalizePatch({ guardCpuPct: 5 }));
  assert.equal(normalizePatch({ guardMemGB: '4' }).guardMemGB, 4);
});

test('표본: 줄의 PC 대비 CPU × 코어 수 = 코어 하나 대비', () => {
  const s = sampleOf({ cpuPct: 12.5, memMB: 300 }, { at: 5, cpu: { cores: 8, spanMs: 30000 } });
  assert.deepEqual(s, { at: 5, spanMs: 30000, core: 100, memMB: 300 });
  assert.equal(sampleOf({ cpuPct: null, memMB: null }, { at: 5, cpu: { cores: 8 } }).core, null);
});

test('CPU: 기준 이상이 3분 이어져야(측정 구간의 앞끝부터 센다), 한 번 내려가면 다시 센다', () => {
  // 30초 간격 5개 = 앞끝부터 2분 30초 → 아직
  assert.deepEqual(judge(hist(5, () => ({ core: 95, memMB: 200 })), cfg), []);
  const r = judge(hist(6, () => ({ core: 95, memMB: 200 })), cfg);
  assert.equal(r.length, 1); assert.equal(r[0].type, 'cpu'); assert.equal(r[0].pct, 95); assert.equal(r[0].ms, 3 * MIN);
  // 중간에 한 번 낮으면 그 뒤부터
  assert.deepEqual(judge(hist(10, (i) => ({ core: i === 6 ? 40 : 95, memMB: 200 })), cfg), []);
  // 모르는 값(첫 측정)도 끊는다
  assert.deepEqual(judge(hist(10, (i) => ({ core: i === 8 ? null : 99, memMB: 200 })), cfg), []);
  // 89%는 아니다
  assert.deepEqual(judge(hist(20, () => ({ core: 89, memMB: 200 })), cfg), []);
});

test('메모리: 3GB 이상이면 곧바로, 10분 내내 늘면(200MB 이상)', () => {
  assert.deepEqual(judge(hist(1, () => ({ core: 1, memMB: 3100 })), cfg).map((r) => r.type), ['mem']);
  // 10분 = 30초 × 20 구간 → 표본 21개, 줄지 않고 400MB 늘었다
  const grow = judge(hist(21, (i) => ({ core: 1, memMB: 500 + i * 20 })), cfg);
  assert.deepEqual(grow.map((r) => r.type), ['grow']);
  assert.equal(grow[0].fromMB, 500); assert.equal(grow[0].toMB, 900);
  // 9분 30초뿐이면 아직
  assert.deepEqual(judge(hist(20, (i) => ({ core: 1, memMB: 500 + i * 20 })), cfg), []);
  // 한 번 줄면 아니다
  assert.deepEqual(judge(hist(21, (i) => ({ core: 1, memMB: i === 10 ? 400 : 500 + i * 20 })), cfg), []);
  // 조금(200MB 아래) 늘면 아니다
  assert.deepEqual(judge(hist(21, (i) => ({ core: 1, memMB: 500 + i * 5 })), cfg), []);
  // 0분이면 끔
  assert.deepEqual(judge(hist(21, (i) => ({ core: 1, memMB: 500 + i * 20 })), { ...cfg, growMs: 0 }), []);
});

test('후보(기준의 80%)면 측정을 당긴다', () => {
  assert.equal(nearAlert(hist(1, () => ({ core: 75, memMB: 100 })), cfg), true);
  assert.equal(nearAlert(hist(1, () => ({ core: 10, memMB: 2500 })), cfg), true);
  assert.equal(nearAlert(hist(1, () => ({ core: 10, memMB: 100 })), cfg), false);
});

test('종류: 쉼·기다림·잠듦·끝남은 폭주 의심, 일하는 중과 셸 패널은 무거움', () => {
  for (const st of ['ready', 'waiting', 'trust_wait', 'sleeping', 'exited']) assert.equal(classify(false, st), 'suspect', st);
  for (const st of ['working', 'starting']) assert.equal(classify(false, st), 'heavy', st);
  assert.equal(classify(true, 'ready'), 'heavy');
  assert.equal(classify(false, 'shell_running'), 'heavy');
});

test('가장 무거운 프로세스: CPU가 걸리면 CPU 맨 위, 뿌리·에이전트면 agent', () => {
  const row = { shellPid: 10, claudePid: 10, topCpu: { pid: 30, name: 'node.exe', cpuPct: 12, memMB: 50 }, topMem: { pid: 10, name: 'claude.exe', cpuPct: 1, memMB: 400 } };
  assert.equal(topOf(row, [{ type: 'cpu' }]).pid, 30);
  assert.equal(topOf(row, [{ type: 'cpu' }]).agent, false);
  assert.equal(topOf(row, [{ type: 'mem' }]).pid, 10);
  assert.equal(topOf(row, [{ type: 'mem' }]).agent, true);
});

test('나무의 CPU·메모리 맨 위(첫 측정이면 CPU 모름)', () => {
  const tree = [{ pid: 1, name: 'a', created: 1, cpu: 100, ws: 10 * 1048576 }, { pid: 2, name: 'b', created: 2, cpu: 900, ws: 5 * 1048576 }];
  const prev = new Map([[cpuKey(tree[0]), 50], [cpuKey(tree[1]), 100]]);
  const t = treeTops(tree, prev, 0, 1000, 1);
  assert.equal(t.topCpu.pid, 2); assert.equal(t.topMem.pid, 1); assert.equal(t.topMem.memMB, 10);
  assert.equal(treeTops(tree, null, 0, 0, 1).topCpu, null);
  assert.equal(procCpu({ pid: 9, created: 500, cpu: 30 }, new Map(), 400), 30); // 앞 측정 뒤에 생긴 프로세스는 쓴 시간 전부
});

test('카드는 한 번의 폭주에 한 장: 이미 만들었거나 열린 카드가 있거나 묻지 않기 중이면 만들지 않는다', () => {
  const a = { kind: 'suspect', carded: false };
  assert.equal(mayCard(a, { now: 1 }), true);
  assert.equal(mayCard({ ...a, carded: true }, { now: 1 }), false);
  assert.equal(mayCard(a, { now: 1, open: true }), false);
  assert.equal(mayCard(a, { now: 1, mutedUntil: 5 }), false);
  assert.equal(mayCard({ ...a, kind: 'heavy' }, { now: 1 }), false);
  assert.equal(mayCard(a, { now: 1, detect: false }), false);
});

test('동작 전 확인: 나무 안·생성 시각이 맞을 때만', () => {
  const tree = [{ pid: 10, created: 1000 }, { pid: 20, created: 2000 }, { pid: 30, created: null }];
  assert.equal(verifyTarget(tree, 20, 2000).proc.pid, 20);
  assert.equal(verifyTarget(tree, 20, 2003).proc.pid, 20); // 반올림 차이
  assert.equal(verifyTarget(tree, 20, 9000).why, 'pid_reused');
  assert.equal(verifyTarget(tree, 99, null).why, 'not_in_session');
  assert.equal(verifyTarget(tree, 30, null).why, 'no_created');
  assert.equal(verifyTarget([], 20).why, 'no_tree');
});

test('우선순위 대상: 낮추기는 보통(8)만, 되돌리기는 보통 이하(6)만', () => {
  const trees = new Map([['a', [{ pid: 100, prio: 8 }, { pid: 101, prio: 6 }, { pid: 102, prio: 13 }, { pid: 103, prio: 10 }]], ['b', [{ pid: 200, prio: 8 }, { pid: 4, prio: 8 }]]]);
  assert.deepEqual(priorityTargets(trees, 'lower').map((p) => p.pid), [100, 200]);
  assert.deepEqual(priorityTargets(trees, 'restore').map((p) => p.pid), [101]);
});

test('도우미 출력 읽기와 인자(생성 시각 모르면 넘기지 않음)', () => {
  assert.deepEqual([...parseProcOut('10 ok\r\n20 mismatch\n30 open_failed:5\n')], [[10, 'ok'], [20, 'mismatch'], [30, 'open_failed:5']]);
  assert.deepEqual(procArgs([{ pid: 10, created: 1000.4 }, { pid: 20, created: null }, { pid: 0, created: 1 }]), ['10:1000']);
});

test('보고: 경보·끝·사람의 선택을 모은다', () => {
  const ev = [
    { t: 1, sessionId: 's1', kind: 'resource_alert', data: { kind: 'suspect', type: 'cpu', types: ['cpu'], cpuPct: 99, top: { name: 'node.exe', pid: 5 }, state: 'ready' } },
    { t: 2, sessionId: 's1', kind: 'resource_action', data: { action: 'kill', ok: true } },
    { t: 3, sessionId: 's1', kind: 'resource_alert_end', data: { kind: 'suspect', ms: 4000, by: 'resolved' } },
    { t: 4, sessionId: 's2', kind: 'resource_alert', data: { kind: 'heavy', type: 'mem', types: ['mem', 'grow'], memMB: 4000, top: { name: 'node.exe', pid: 7 } } },
    { t: 5, sessionId: 's2', kind: 'resource_action', data: { action: 'pause', ok: false, why: 'no_helper' } },
  ];
  const r = reportOf(ev, (id) => (id === 's1' ? 'w1' : null));
  assert.equal(r.alerts, 2); assert.deepEqual(r.byKind, { suspect: 1, heavy: 1 }); assert.deepEqual(r.byType, { cpu: 1, mem: 1, grow: 1 });
  assert.deepEqual(r.top, { 'node.exe': 2 }); assert.deepEqual(r.actions, { 'kill:ok': 1, 'pause:no_helper': 1 });
  assert.equal(r.medianEndMs, 4000); assert.equal(r.rows[0].session, 'w1'); assert.equal(r.rows[1].session, 's2');
});

test('카드 글(영어·한국어)', () => {
  const g = { reasons: [{ type: 'cpu', pct: 97, ms: 4 * MIN }], top: { name: 'node.exe', pid: 42 } };
  assert.match(cardText('w', g, 'en'), /@w may be running away: idle but CPU 97% for 4 min · heaviest process node\.exe \(PID 42\)/);
  assert.match(cardText('w', g, 'ko'), /@w 폭주 의심: 쉬는 중인데 CPU 97% · 4분/);
});

// ---------- ResourceGuard: 가짜 판으로 카드 흐름 ----------
function fakeBoard() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p341-'));
  const store = new Store(path.join(dir, 'board.db'));
  const changed = [];
  const decisions = { store: () => store, changed: () => changed.push(1), push: () => {} };
  const sessions = new Map([['s1', { sessionId: 's1', name: 'w1', kind: 'claude', paneId: 'p1' }], ['s2', { sessionId: 's2', name: 'sh', kind: 'shell', paneId: 'p2' }]]);
  const logs = [];
  const prio = [];
  const b = { store, sessions, decisions, log: (m) => logs.push(m), api: { broadcast: () => {} }, adapter: { processInfo: async () => ({ shell_pid: 10 }) } };
  return { b, store, logs, prio, changed, dir };
}
const row = (sid, state, core, memMB, extra = {}) => ({ sessionId: sid, name: sid, state, cpuPct: core / 8, memMB, shellPid: 10, claudePid: 10, kind: sid === 's2' ? 'shell' : 'claude', topCpu: { pid: 30, created: 3000, name: 'node.exe', cpuPct: core / 8, memMB: 50 }, topMem: { pid: 10, created: 1000, name: 'claude.exe', cpuPct: 1, memMB }, ...extra });
const snapOf = (at, rows) => ({ at, cpu: { cores: 8, spanMs: 30_000 }, sessions: rows });

test('흐름: 쉬는 세션 CPU 폭주 → 카드 한 장, 계속돼도 한 장, 풀리면 닫힘. 셸·일하는 세션은 배지만', async () => {
  const { b, store, logs } = fakeBoard();
  let st = {};
  const set = [];
  const g = new ResourceGuard(b, { monitor: { trees: new Map(), readTable: async () => null }, proc: { available: () => false }, settings: () => st, setPriority: (pid, lv) => { set.push([pid, lv]); return true; } });
  let t = 10_000_000;
  let last = null;
  for (let i = 0; i < 8; i++) { t += 30_000; last = snapOf(t, [row('s1', 'ready', 98, 300), row('s2', 'shell_running', 98, 300)]); await g.step(last); }
  const open = store.openDecisions();
  assert.equal(open.length, 1);
  assert.equal(open[0].kind, 'guard'); assert.equal(open[0].sessionId, 's1');
  assert.equal(open[0].guard.top.pid, 30); assert.equal(open[0].guard.reasons[0].type, 'cpu');
  assert.equal(last.sessions[0].guard.kind, 'suspect'); assert.equal(last.sessions[0].guard.card, open[0].id);
  assert.equal(last.sessions[1].guard.kind, 'heavy');
  assert.equal(g.nextDelay(), FAST_MS);
  // 사람이 무시해도 같은 폭주 동안 다시 만들지 않는다
  store.endDecision(open[0].id, { state: 'ignored', via: 'pc' });
  for (let i = 0; i < 3; i++) { t += 10_000; await g.step(snapOf(t, [row('s1', 'ready', 98, 300)])); }
  assert.equal(store.openDecisions().length, 0);
  // 풀림 → 끝 기록. 다시 폭주하면 새 카드
  t += 10_000; await g.step(snapOf(t, [row('s1', 'ready', 5, 300)]));
  assert.equal(g.alerts.has('s1'), false);
  for (let i = 0; i < 8; i++) { t += 30_000; await g.step(snapOf(t, [row('s1', 'ready', 98, 300)])); }
  assert.equal(store.openDecisions().length, 1);
  // 일하기 시작하면(무거움) 카드는 닫힌다, 배지는 남는다
  t += 10_000; const s2 = snapOf(t, [row('s1', 'working', 98, 300)]); await g.step(s2);
  assert.equal(store.openDecisions().length, 0);
  assert.equal(s2.sessions[0].guard.kind, 'heavy');
  const kinds = store.eventsAfter(0, ['resource_alert', 'resource_alert_end']).map((e) => e.kind);
  assert.deepEqual(kinds.filter((k) => k === 'resource_alert').length >= 3, true);
  assert.ok(logs.some((m) => /resource alert s1 suspect cpu/.test(m)));
  // 감지 끔 → 경보 없음
  st = { guardDetect: false };
  t += 10_000; const s3 = snapOf(t, [row('s1', 'ready', 98, 300)]); await g.step(s3);
  assert.equal(s3.sessions[0].guard, undefined);
});

test('흐름: 30분 묻지 않기 동안은 카드를 만들지 않는다', async () => {
  const { b, store } = fakeBoard();
  let now = 10_000_000;
  const g = new ResourceGuard(b, { monitor: { trees: new Map() }, proc: { available: () => false }, now: () => now });
  for (let i = 0; i < 8; i++) { now += 30_000; await g.step(snapOf(now, [row('s1', 'ready', 98, 300)])); }
  assert.equal(store.openDecisions().length, 1);
  await g.act({ id: store.openDecisions()[0].id, action: 'mute' });
  assert.equal(store.openDecisions().length, 0);
  now += 10_000; await g.step(snapOf(now, [row('s1', 'ready', 5, 300)])); // 풀림
  for (let i = 0; i < 8; i++) { now += 30_000; await g.step(snapOf(now, [row('s1', 'ready', 98, 300)])); }
  assert.equal(store.openDecisions().length, 0);
  assert.equal(store.eventsAfter(0, ['resource_action'])[0].data.action, 'mute');
});

test('흐름: 판이 다시 떠 남은 폭주 카드는 닫는다', async () => {
  const { b, store } = fakeBoard();
  store.addDecision({ sessionId: 's1', name: 'w1', question: 'x', createdAt: 1, kind: 'guard', guard: { kind: 'suspect', reasons: [] } });
  const g = new ResourceGuard(b, { monitor: { trees: new Map() }, proc: { available: () => false } });
  await g.step(snapOf(10_000_000, [row('s1', 'ready', 1, 300)]));
  assert.equal(store.openDecisions().length, 0);
});

test('끄기: 나무 밖·에이전트 본체는 거절, 나무 안 프로세스만 그 아래와 함께 도우미로', async () => {
  const { b, store } = fakeBoard();
  const procs = new Map([[10, { pid: 10, ppid: 1, created: 1000, name: 'claude.exe' }], [30, { pid: 30, ppid: 10, created: 3000, name: 'node.exe' }], [31, { pid: 31, ppid: 30, created: 3100, name: 'node.exe' }], [99, { pid: 99, ppid: 1, created: 50, name: 'other.exe' }]]);
  const calls = [];
  const proc = { available: () => true, ensure: async () => 'ready', call: async (verb, list) => { calls.push([verb, list.map((x) => x.pid)]); return new Map(list.map((x) => [x.pid, 'ok'])); } };
  const g = new ResourceGuard(b, { monitor: { trees: new Map(), readTable: async () => ({ procs, at: 1 }) }, proc });
  await assert.rejects(g.act({ session: 's1', action: 'kill', pid: 99 }), { code: 'not_in_session' });
  await assert.rejects(g.act({ session: 's1', action: 'kill', pid: 30, created: 7777 }), { code: 'pid_reused' });
  await assert.rejects(g.act({ session: 's1', action: 'kill', pid: 10 }), { code: 'agent_process' });
  assert.equal(calls.length, 0);
  const r = await g.act({ session: 's1', action: 'kill', pid: 30, created: 3000 });
  assert.equal(r.ok, true);
  assert.deepEqual(calls, [['kill', [31, 30]]]);
  const acts = store.eventsAfter(0, ['resource_action']).map((e) => `${e.data.action}:${e.data.ok ? 'ok' : e.data.why}`);
  assert.deepEqual(acts, ['kill:not_in_session', 'kill:pid_reused', 'kill:agent_process', 'kill:ok']);
});

test('일시정지·다시 돌리기: 나무 모두를 멈추고 기록, 카드에 표시, 잠재우기 전 다시 돌린다', async () => {
  const { b, store } = fakeBoard();
  const procs = new Map([[10, { pid: 10, ppid: 1, created: 1000, name: 'claude.exe' }], [30, { pid: 30, ppid: 10, created: 3000, name: 'node.exe' }]]);
  const calls = [];
  const proc = { available: () => true, ensure: async () => 'ready', call: async (verb, list) => { calls.push([verb, list.map((x) => x.pid)]); return new Map(list.map((x) => [x.pid, 'ok'])); } };
  const slept = [];
  b.sleeper = { sleep: async (s) => { slept.push(s.name); return {}; } };
  const monitor = { trees: new Map(), readTable: async () => ({ procs, at: 1 }) };
  const g = new ResourceGuard(b, { monitor, proc });
  let t = 10_000_000;
  for (let i = 0; i < 8; i++) { t += 30_000; await g.step(snapOf(t, [row('s1', 'ready', 98, 300)])); }
  const card = store.openDecisions()[0];
  await g.act({ id: card.id, action: 'pause' });
  assert.deepEqual(calls[0], ['suspend', [10, 30]]);
  assert.ok(store.getDecision(card.id).guard.paused);
  assert.ok(store.getMeta('guardPaused').s1);
  // 멈춘 동안 CPU가 0이어도 카드는 남고 줄에 paused
  t += 10_000; const s1 = snapOf(t, [row('s1', 'ready', 0, 300)]); await g.step(s1);
  assert.ok(s1.sessions[0].guard.paused);
  assert.equal(store.openDecisions().length, 1);
  // 판이 다시 떠도 멈춘 기록을 이어 받는다
  const g2 = new ResourceGuard(b, { monitor, proc });
  assert.equal(g2.paused.has('s1'), true);
  // 재우기: 먼저 다시 돌리고 잠재운다, 카드는 닫힌다
  await g2.act({ id: card.id, action: 'sleep' });
  assert.deepEqual(calls[1], ['resume', [10, 30]]);
  assert.deepEqual(slept, ['w1']);
  assert.equal(store.openDecisions().length, 0);
  assert.equal(g2.paused.has('s1'), false);
});

test('우선순위: 켜면 나무의 보통만 낮추고, 끄면 보통 이하를 되돌린다(이상한 나무는 건드리지 않음)', async () => {
  const { b, store } = fakeBoard();
  let st = {};
  const set = [];
  const trees = new Map([['s1', [{ pid: 10, prio: 8 }, { pid: 30, prio: 6 }]], ['s2', [{ pid: 50, prio: 8 }]]]);
  const g = new ResourceGuard(b, { monitor: { trees }, proc: { available: () => false }, settings: () => st, setPriority: (pid, lv) => { set.push([pid, lv]); return true; } });
  await g.step(snapOf(1, [row('s1', 'ready', 1, 100), row('s2', 'ready', 1, 100, { suspect: 'system process' })]), { trees });
  assert.deepEqual(set, [[10, 'below']]);
  assert.equal(store.getMeta('guardLowered'), true);
  st = { guardLowerPriority: false };
  trees.set('s1', [{ pid: 10, prio: 6 }, { pid: 30, prio: 6 }]);
  set.length = 0;
  await g.step(snapOf(2, [row('s1', 'ready', 1, 100)]), { trees });
  assert.deepEqual(set, [[10, 'normal'], [30, 'normal']]);
  set.length = 0;
  await g.step(snapOf(3, [row('s1', 'ready', 1, 100)]), { trees }); // 한 번만 되돌린다
  assert.deepEqual(set, []);
});

test('새 패널의 뿌리를 곧바로 낮춘다(보통일 때만)', async () => {
  const { b } = fakeBoard();
  const set = [];
  let cur = 0;
  const g = new ResourceGuard(b, { monitor: { trees: new Map() }, proc: { available: () => false }, setPriority: (pid, lv) => { set.push([pid, lv]); return true; }, getPriority: () => cur });
  assert.equal(await g.onPane('p1'), true);
  cur = 10; assert.equal(await g.onPane('p1'), false);
  assert.deepEqual(set, [[10, 'below']]);
});

test('폭주 카드는 에이전트의 카드 상한·자동 카드 막기에 세지 않는다', async () => {
  const src = fs.readFileSync(new URL('../src/decisions.mjs', import.meta.url), 'utf8');
  assert.match(src, /d\.kind !== 'guard' && \(d\.kind === 'later'\) === later/);
  assert.match(src, /!d\.auto && d\.kind !== 'guard'/);
});

// 실제 도우미(Windows + csc): 멈춤·다시 돌리기·생성 시각이 다르면 손대지 않음·끄기
test('도우미 실제 빌드와 동작', { skip: process.platform !== 'win32' }, async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p341-bin-'));
  const pc = new ProcControl({ dir });
  if ((await pc.ensure()) !== 'ready') return t.skip('csc 없음');
  const ch = spawn(process.execPath, ['-e', 'let n=0;setInterval(()=>process.stdout.write(String(++n)+"\\n"),40);setTimeout(()=>process.exit(0),15000)']);
  let last = 0; ch.stdout.on('data', (d) => { last = Number(String(d).trim().split(/\s+/).pop()); });
  try {
    await new Promise((r) => setTimeout(r, 400));
    const created = Number(execFileSync('powershell.exe', ['-NoProfile', '-Command', `[int64]([DateTimeOffset](Get-CimInstance Win32_Process -Filter 'ProcessId=${ch.pid}').CreationDate).ToUnixTimeMilliseconds()`], { encoding: 'utf8' }).trim());
    assert.equal((await pc.call('suspend', [{ pid: ch.pid, created: created - 2000 }])).get(ch.pid), 'mismatch');
    assert.equal((await pc.call('suspend', [{ pid: ch.pid, created }])).get(ch.pid), 'ok');
    const a = last; await new Promise((r) => setTimeout(r, 400)); assert.equal(last, a);
    assert.equal((await pc.call('resume', [{ pid: ch.pid, created }])).get(ch.pid), 'ok');
    await new Promise((r) => setTimeout(r, 300)); assert.ok(last > a);
    assert.equal((await pc.call('kill', [{ pid: ch.pid, created }])).get(ch.pid), 'ok');
    await new Promise((r) => ch.exitCode != null ? r() : ch.once('exit', r));
  } finally { try { ch.kill(); } catch {} }
});
