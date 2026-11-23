// P323: 가만히 있을 때 판을 바쁘게 하던 것 둘(P319 측정) — 위 알약 무리의 ResizeObserver 고리, perf.js의 늘 도는 rAF
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fitWatch } from '../src/renderer/lib/top-pills.js';

const read = (p) => fs.readFileSync(new URL(`../src/renderer/${p}`, import.meta.url), 'utf8');

// observe하면 곧바로 첫 알림이 오는 가짜 관찰자(브라우저 ResizeObserver와 같다)
function fakeRo() {
  const ro = { observed: new Set(), calls: 0, watch: null,
    observe(el) { ro.calls++; ro.observed.add(el); queueMicrotask(() => ro.watch && ro.watch.onResize([{ target: el, contentRect: { width: el.w } }])); },
    unobserve(el) { ro.observed.delete(el); } };
  return ro;
}
const tick = () => new Promise((r) => setTimeout(r, 0));

test('폭이 그대로면 다시 재지 않는다(observe 첫 알림, 같은 폭 알림)', async () => {
  const ro = fakeRo(); let kicks = 0;
  const w = ro.watch = fitWatch(ro, () => kicks++);
  const a = { w: 100 }, b = { w: 50 };
  w.sync([a, b]); await tick();
  assert.equal(kicks, 0);
  // 렌더마다 sync해도 이미 건 원소는 다시 observe하지 않는다(고리의 원인)
  for (let i = 0; i < 5; i++) w.sync([a, b]);
  await tick();
  assert.equal(ro.calls, 2); assert.equal(kicks, 0);
  assert.equal(w.onResize([{ target: a, contentRect: { width: 100.2 } }]), false);
  assert.equal(kicks, 0);
});

test('폭이 바뀌면 다시 잰다', async () => {
  const ro = fakeRo(); let kicks = 0;
  const w = ro.watch = fitWatch(ro, () => kicks++);
  const a = { w: 100 };
  w.sync([a]); await tick();
  assert.equal(w.onResize([{ target: a, contentRect: { width: 140 } }]), true);
  assert.equal(kicks, 1);
  assert.equal(w.onResize([{ target: a, contentRect: { width: 140 } }]), false);
  assert.equal(kicks, 1);
});

test('새 알약만 observe하고 빠진 알약은 놓는다. 놓은 원소의 늦은 알림은 무시한다', async () => {
  const ro = fakeRo(); let kicks = 0;
  const w = ro.watch = fitWatch(ro, () => kicks++);
  const a = { w: 10 }, b = { w: 20 }, c = { w: 30 };
  w.sync([a, b, null]); await tick();
  w.sync([a, c]); await tick();
  assert.deepEqual([...ro.observed], [a, c]);
  assert.equal(ro.calls, 3); assert.equal(w.size(), 2); assert.equal(kicks, 0);
  assert.equal(w.onResize([{ target: b, contentRect: { width: 99 } }]), false);
});

test('Chrome.jsx useTopFit: 관찰자를 한 번만 만들고 렌더마다 새로 걸지 않는다', () => {
  const src = read('Chrome.jsx');
  const body = src.slice(src.indexOf('function useTopFit()'), src.indexOf('function SessionsPill()'));
  assert.match(body, /fitWatch\(ro, kick\)/);
  assert.match(body, /new ResizeObserver\(\(entries\) => \{ if \(watch\.current\) watch\.current\.onResize\(entries\); \}\)/);
  assert.match(body, /\}, \[\]\);/); // 관찰자 만들기는 처음 한 번
  assert.doesNotMatch(body, /new ResizeObserver\(kick\)/);
});

// perf.js는 창 모듈이라 전역을 흉내 내고 읽는다
async function loadPerf() {
  const frames = new Map(); let id = 0;
  globalThis.location = { search: '' };
  globalThis.requestAnimationFrame = (f) => { id++; frames.set(id, f); return id; };
  globalThis.cancelAnimationFrame = (i) => frames.delete(i);
  const m = await import(`../src/renderer/perf.js?t=${Date.now()}`);
  const step = (now) => { const fs2 = [...frames.values()]; frames.clear(); for (const f of fs2) f(now); };
  return { m, frames, step };
}

test('perf: 불러오기만 해서는 rAF를 걸지 않는다(가만히 있을 때 그리지 않는다)', async () => {
  const { m, frames } = await loadPerf();
  assert.equal(frames.size, 0);
  assert.equal(m.recordingFrames(), false);
  assert.equal(m.snapshot().rafGapMs, null);
});

test('perf: 기록을 켤 때만 rAF로 간격을 재고, 끄면 멈춘다. reset()은 기록을 켠다', async () => {
  const { m, frames, step } = await loadPerf();
  m.reset();
  assert.equal(m.recordingFrames(), true); assert.equal(frames.size, 1);
  m.recordFrames(true); assert.equal(frames.size, 1); // 두 번 켜도 하나
  step(1000); step(1016); step(1040);
  assert.deepEqual(m.perf.rafGaps, [16, 24]); // 첫 프레임은 기준만
  assert.equal(m.snapshot().rafGapMs.n, 2);
  m.recordFrames(false);
  assert.equal(frames.size, 0); assert.equal(m.recordingFrames(), false);
  m.recordFrames(true); step(2000); step(2010);
  assert.deepEqual(m.perf.rafGaps, [16, 24, 10]); // 다시 켜면 꺼 둔 동안은 간격에 넣지 않는다
});
