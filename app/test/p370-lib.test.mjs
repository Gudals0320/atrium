// P370 창 단위 시험: 메모리 알약 펼침 추이 그림의 모형(빈 고리, 값 하나, 끊긴 구간, 눈금, 가리킴, 표시 글), 사전 열쇠
import test from 'node:test';
import assert from 'node:assert/strict';
import { niceMax, runsOf, statOf, trendModel, nearestPoint, marksNear, markLine } from '../src/renderer/lib/trend.js';
import ko from '../src/renderer/locales/ko.js';
import en from '../src/renderer/locales/en.js';

const B = 30000;
const T0 = 1_800_000_000_000 - (1_800_000_000_000 % B);
const data = (points, marks = [], at = T0 + 59 * B + 1000) => ({ at, bucketMs: B, windowMs: 60 * B, from: Math.floor(at / B) * B - 59 * B, points, marks, totalMemMB: 16384 });
const pt = (i, memMB, cpuPct = 1, extra = {}) => ({ at: T0 + i * B, memMB, cpuPct, cpuMax: cpuPct, sysCpuPct: 20, sysMemPct: 60, n: 6, ...extra });

test('눈금 위끝: 1·2·2.5·5 × 10^k, 0·모름은 바닥값', () => {
  assert.equal(niceMax(0, 100), 100);
  assert.equal(niceMax(null, 5), 5);
  assert.equal(niceMax(3000), 5000);
  assert.equal(niceMax(1800), 2000);
  assert.equal(niceMax(2100), 2500);
  assert.equal(niceMax(9.5), 20);
});

test('빈 고리: empty, 그릴 것 없음', () => {
  const m = trendModel(data([]));
  assert.equal(m.empty, true);
  assert.deepEqual(m.mem.paths, []);
  assert.equal(m.mem.end, null);
  assert.equal(trendModel(null).empty, true);
  assert.equal(trendModel(data([pt(3, null, null)])).empty, true);
});

test('값 하나: 길이 아니라 점, 지금 = 최고', () => {
  const m = trendModel(data([pt(59, 1500, 4)]));
  assert.equal(m.empty, false);
  assert.equal(m.mem.paths.length, 0);
  assert.equal(m.mem.dots.length, 1);
  assert.equal(m.mem.now, 1500); assert.equal(m.mem.peak, 1500);
  assert.ok(Math.abs(m.mem.dots[0].x - (m.w - 4)) < 0.01, '맨 오른쪽(지금)');
});

test('끊긴 구간: 칸 사이가 1.5칸보다 넓거나 값이 없으면 줄기를 나눈다', () => {
  const pts = [pt(0, 100), pt(1, 110), pt(2, 120), pt(10, 300), pt(11, 310), pt(12, null), pt(13, 330), pt(14, 340)];
  const runs = runsOf(pts, 'memMB', B);
  assert.deepEqual(runs.map((r) => r.length), [3, 2, 2]);
  const m = trendModel(data(pts));
  assert.equal(m.mem.paths.length, 3);
  assert.equal(m.mem.areas.length, 3);
  assert.match(m.mem.paths[0], /^M[\d.]+ [\d.]+ L/);
  assert.deepEqual(statOf(pts, 'memMB'), { now: 340, peak: 340, peakAt: T0 + 14 * B });
});

test('CPU 칸: 최고는 칸 안 최고(cpuMax), 축은 PC 전체 기준선까지 담고 100%를 넘지 않는다', () => {
  const m = trendModel(data([pt(50, 1000, 2, { cpuMax: 9, sysCpuPct: 30 }), pt(51, 1000, 3, { cpuMax: 4, sysCpuPct: 35 })]));
  assert.equal(m.cpu.peak, 9);
  assert.equal(m.cpu.now, 3);
  assert.equal(m.cpu.max, 50);
  assert.equal(m.cpu.sys.paths.length, 1);
  assert.equal(trendModel(data([pt(1, 1, 95, { sysCpuPct: 99 })])).cpu.max, 100);
  assert.equal(m.sysMemPct, 60);
});

test('표시: 창 안의 것만, 시간 차례, x는 그림 안. 가리킴은 가장 가까운 칸과 8px 안 표시', () => {
  const marks = [{ at: T0 + 30 * B + 100, type: 'sleep', name: 's', memMB: 700, by: 'hand' }, { at: T0 + 10 * B, type: 'alert', kind: 'suspect', name: 'a', reasons: ['cpu', 'mem'], cpuPct: 10, memMB: 3100 }, { at: T0 - 50 * B, type: 'alert', kind: 'heavy', name: 'old' }];
  const pts = Array.from({ length: 60 }, (_, i) => pt(i, 1000 + i));
  const m = trendModel(data(pts, marks));
  assert.deepEqual(m.marks.map((k) => k.name), ['a', 's']);
  assert.ok(m.marks.every((k) => k.x >= 4 && k.x <= m.w - 4));
  const i = nearestPoint(m, m.marks[0].x + 1);
  assert.equal(m.points[i].at, T0 + 10 * B);
  assert.deepEqual(marksNear(m, m.marks[1].x + 3).map((k) => k.name), ['s']);
  assert.deepEqual(marksNear(m, 200 - 100), []);
  assert.equal(nearestPoint(trendModel(data([])), 10), -1);
});

test('표시 글: 사전 열쇠가 두 사전에 있고 값을 채운다(코어 하나 대비 CPU)', () => {
  const lookup = (dict) => (k, v = {}) => { const s = k.split('.').reduce((o, q) => (o && typeof o === 'object' ? o[q] : undefined), dict); return typeof s === 'string' ? s.replace(/\{(\w+)\}/g, (_, x) => String(v[x] ?? '')) : null; };
  const fmt = { mem: (x) => `${x}MB`, pct: (x) => `${x}%` };
  const a = markLine({ type: 'alert', kind: 'suspect', name: 'w1', reasons: ['cpu', 'mem', 'cpu'], cpuPct: 10, memMB: 3100 }, fmt, 8);
  assert.equal(a.key, 'p370.markSuspect');
  assert.deepEqual(a.what, ['cpu', 'mem']);
  assert.equal(a.vars.cpu, '80%');
  assert.equal(markLine({ type: 'alert', kind: 'heavy', name: 'w' }, fmt).key, 'p370.markHeavy');
  assert.equal(markLine({ type: 'sleep', name: 'z', memMB: 5, by: 'hand' }, fmt).key, 'p370.markSleepHand');
  assert.equal(markLine({ type: 'sleep', name: 'z', memMB: null, by: 'auto' }, fmt).vars.mem, '?');
  const keys = ['mem', 'cpu', 'cpuTitle', 'peak', 'pc', 'pcMemTitle', 'pcCpuTitle', 'empty', 'ago', 'collecting', 'now', 'tipAvg', 'tipCpu', 'markSuspect', 'markHeavy', 'markSleep', 'markSleepHand', 'what.cpu', 'what.mem', 'what.grow', 'legend.suspect', 'legend.heavy', 'legend.sleep', 'aria'];
  for (const d of [ko, en]) for (const k of keys) assert.ok(lookup(d)(`p370.${k}`), k);
  assert.equal(lookup(ko)('p370.markSuspect', { name: 'w1', what: 'CPU + 메모리', cpu: '80%', mem: '3.0GB' }), '@w1 폭주 의심 · CPU + 메모리 · CPU 80% · 3.0GB');
});
