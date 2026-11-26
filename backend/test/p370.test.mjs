// P370: 메모리 알약 펼침 추이의 고리(30초 칸 60개) 묶기·자르기, 경보·잠재우기 표시 고르기, 창에 보낼 꼴, 판 API resources.trend
import test from 'node:test';
import assert from 'node:assert/strict';
import { addPoint, trimPoints, marksOf, trendView, sampleOfSnap, memPct, ResourceTrend, TREND_BUCKET_MS, TREND_POINTS } from '../src/resource-trend.mjs';

const B = TREND_BUCKET_MS;
const T0 = 1_800_000_000_000 - (1_800_000_000_000 % B); // 칸 경계

test('같은 칸의 측정은 묶는다: 메모리는 칸 안 최고, CPU는 평균과 최고, PC 메모리는 마지막 값', () => {
  const pts = [];
  addPoint(pts, { at: T0 + 1000, memMB: 1000, cpuPct: 2, sysCpuPct: 10, sysMemPct: 50 });
  addPoint(pts, { at: T0 + 6000, memMB: 1200, cpuPct: 4, sysCpuPct: 20, sysMemPct: 51 });
  addPoint(pts, { at: T0 + 11000, memMB: 1100, cpuPct: null, sysCpuPct: null, sysMemPct: null });
  assert.equal(pts.length, 1);
  assert.deepEqual({ at: pts[0].at, memMB: pts[0].memMB, cpuPct: pts[0].cpuPct, cpuMax: pts[0].cpuMax, sysCpuPct: pts[0].sysCpuPct, sysMemPct: pts[0].sysMemPct, n: pts[0].n }, { at: T0, memMB: 1200, cpuPct: 3, cpuMax: 4, sysCpuPct: 15, sysMemPct: 51, n: 3 });
  addPoint(pts, { at: T0 + B + 1, memMB: 900, cpuPct: 1 });
  assert.equal(pts.length, 2);
  assert.equal(pts[1].at, T0 + B);
});

test('고리: 60칸(30분)만 남기고 오래된 칸을 버린다. 끊긴 구간(칸이 빈 사이)은 그대로 비워 둔다. 거꾸로 온 측정은 버린다', () => {
  const pts = [];
  for (let i = 0; i < 100; i++) addPoint(pts, { at: T0 + i * B, memMB: i, cpuPct: 1 });
  assert.equal(pts.length, TREND_POINTS);
  assert.equal(pts[0].memMB, 100 - TREND_POINTS);
  // 20분 쉼(PC 잠듦) 뒤: 창 밖이 된 칸이 빠지고 칸 사이가 벌어진 채
  addPoint(pts, { at: T0 + 119 * B, memMB: 500 });
  assert.equal(pts[pts.length - 1].memMB, 500);
  assert.ok(pts.every((q) => q.at >= T0 + 119 * B - (TREND_POINTS - 1) * B));
  assert.ok(pts[pts.length - 1].at - pts[pts.length - 2].at > B);
  const n = pts.length;
  addPoint(pts, { at: T0 + 50 * B, memMB: 1 });
  assert.equal(pts.length, n);
  // 한 시간 넘게 쉬면 모두 빠지고 새 칸 하나
  addPoint(pts, { at: T0 + 300 * B, memMB: 7 });
  assert.equal(pts.length, 1);
  assert.deepEqual(trimPoints([], T0), []);
});

test('측정 → 칸 값: 판 합 메모리·CPU, PC CPU, PC 메모리 사용률', () => {
  const s = sampleOfSnap({ at: T0, sessionsMB: 2048, cpu: { sessionsPct: 3.5, systemPct: 22 } }, { total: 16 * 1073741824, free: 4 * 1073741824 });
  assert.deepEqual(s, { at: T0, memMB: 2048, cpuPct: 3.5, sysCpuPct: 22, sysMemPct: 75 });
  assert.equal(memPct(0, 0), null);
  assert.equal(sampleOfSnap({ at: T0, sessionsMB: 1 }).cpuPct, null);
});

test('표시: 경보는 새로 생길 때와 무거움 → 폭주 의심일 때만, 멈춤·다시 돌림은 새 표시 없음, 잠재우기는 깨어 있다가 잠들 때(아낀 메모리는 앞 값)', () => {
  const row = (id, extra = {}) => ({ sessionId: id, name: id, state: 'ready', memMB: 800, cpuPct: 1, ...extra });
  let prev = new Map();
  let r = marksOf(prev, [row('a'), row('b', { guard: { kind: 'heavy', reasons: [{ type: 'cpu', instant: true }] } })], T0);
  assert.equal(r.marks.length, 1);
  assert.deepEqual({ ...r.marks[0] }, { at: T0, type: 'alert', kind: 'heavy', sessionId: 'b', name: 'b', reasons: ['cpu'], instant: true, cpuPct: 1, memMB: 800 });
  prev = r.next;
  r = marksOf(prev, [row('a'), row('b', { guard: { kind: 'heavy', reasons: [{ type: 'cpu' }] } })], T0 + 5000);
  assert.equal(r.marks.length, 0, '같은 경보가 이어지면 표시 없음');
  prev = r.next;
  r = marksOf(prev, [row('a'), row('b', { guard: { kind: 'suspect', reasons: [{ type: 'cpu' }, { type: 'mem' }] } })], T0 + 10000);
  assert.deepEqual(r.marks.map((m) => [m.kind, m.reasons.join()]), [['suspect', 'cpu,mem']]);
  prev = r.next;
  r = marksOf(prev, [row('a'), row('b', { guard: { kind: 'suspect', reasons: [], paused: { at: 1 } } })], T0 + 15000);
  assert.equal(r.marks.length, 0, '멈춤');
  prev = r.next;
  r = marksOf(prev, [row('a'), row('b', { guard: { kind: 'suspect', reasons: [{ type: 'cpu' }] } })], T0 + 20000);
  assert.equal(r.marks.length, 0, '다시 돌림');
  prev = r.next;
  r = marksOf(prev, [row('a', { state: 'sleeping', memMB: null }), row('b')], T0 + 25000, (sid) => (sid === 'a' ? { by: 'hand' } : null));
  assert.deepEqual(r.marks.map((m) => ({ type: m.type, name: m.name, memMB: m.memMB, by: m.by })), [{ type: 'sleep', name: 'a', memMB: 800, by: 'hand' }]);
  prev = r.next;
  r = marksOf(prev, [row('a', { state: 'sleeping', memMB: null }), row('b', { guard: { kind: 'heavy', reasons: [{ type: 'mem' }] } })], T0 + 30000);
  assert.deepEqual(r.marks.map((m) => [m.type, m.name]), [['alert', 'b']], '잠든 채로는 다시 표시 없음, 경보가 풀렸다 다시 걸리면 새 표시');
  // 판이 다시 떠 처음 본 잠든 세션은 표시하지 않는다
  assert.equal(marksOf(new Map(), [row('c', { state: 'sleeping' })], T0).marks.length, 0);
});

test('창에 보낼 꼴: 셈 칸을 빼고 창 안의 칸·표시만', () => {
  const pts = [];
  addPoint(pts, { at: T0, memMB: 10, cpuPct: 1 });
  const v = trendView(pts, [{ at: T0 - 31 * 60_000, type: 'alert' }, { at: T0, type: 'sleep' }], { now: T0 + 1000, totalMemMB: 16384 });
  assert.deepEqual(Object.keys(v.points[0]).sort(), ['at', 'cpuMax', 'cpuPct', 'memMB', 'n', 'sysCpuPct', 'sysMemPct']);
  assert.equal(v.marks.length, 1);
  assert.equal(v.windowMs, B * TREND_POINTS);
  assert.equal(v.from, T0 - (TREND_POINTS - 1) * B);
  assert.equal(v.totalMemMB, 16384);
});

test('ResourceTrend: 측정을 받아 고리와 표시를 쌓고, 빈 고리면 빈 꼴', () => {
  let now = T0;
  const tr = new ResourceTrend({ sys: () => ({ total: 8 * 1073741824, free: 2 * 1073741824 }), now: () => now });
  assert.deepEqual(tr.view().points, []);
  for (let i = 0; i < 12; i++) {
    now = T0 + i * 5000;
    tr.add({ at: now, sessionsMB: 1000 + i, cpu: { sessionsPct: i, systemPct: 30 }, sessions: [{ sessionId: 'x', name: 'x', state: 'working', memMB: 1000 + i, ...(i >= 6 ? { guard: { kind: 'heavy', reasons: [{ type: 'cpu' }] } } : {}) }] });
  }
  const v = tr.view();
  assert.equal(v.points.length, 2);
  assert.equal(v.points[1].memMB, 1011);
  assert.equal(v.points[0].sysMemPct, 75);
  assert.equal(v.totalMemMB, 8192);
  assert.equal(v.marks.length, 1);
  tr.add(null); tr.add({}); // 값 없는 측정은 넘긴다
  assert.equal(tr.view().points.length, 2);
});
