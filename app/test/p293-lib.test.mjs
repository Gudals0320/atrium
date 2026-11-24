// P293: 휴대폰 세션 맵의 빠른 죽음 → 가볍게 열림, 살아남으면 보통, 열기 계획(지연 그리기 순서), 다시 받을 열쇠
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCrumbs, bootDecide, crumbAlive, crumbLeave, crumbStep, reportOf, LITE_FAST_MS } from '../src/renderer/lib/crumbs.js';
import { openPlan, earlierIds, graphDepsKey, PM } from '../src/renderer/lib/phone-map.js';
import { crashInfo, crashLabel, CRASH_VIEWS } from '../../backend/src/web-crash.mjs';

const json = (s) => parseCrumbs(JSON.stringify(s));
// 휴대폰 페이지가 upMs 살다가 정상으로 떠나지 못함(iOS WebContent를 잃음)
function die(state, t, upMs, view = 'map') { const s = crumbStep(state, 'paint', {}, t + 100); return json(crumbAlive(s, { view }, t + upMs)); }
const boot = (s, t) => bootDecide(s, t, { touch: true, phone: true });

test('휴대폰: 열린 지 몇 초 만에 죽으면 다음 열기는 가볍게, 살아남으면 다시 보통', () => {
  let t = 1e6;
  let d = boot(null, t);
  assert.equal(d.lite, false); assert.equal(d.state.cur.phone, true);
  // 3초 만에 죽음 → 가볍게
  let s = die(d.state, t, 3000); t += 8000;
  d = boot(s, t);
  assert.equal(d.crashed, true); assert.equal(d.lite, true, '빠른 죽음 → 가볍게'); assert.equal(d.state.cur.lite, true);
  // 가볍게 연 페이지도 빨리 죽으면 또 가볍게(보고에 lite)
  s = die(d.state, t, 2000); t += 8000;
  d = boot(s, t);
  assert.equal(d.lite, true); assert.equal(d.report.lite, true);
  // 가볍게 연 페이지가 정상으로 떠나면 다음은 보통
  s = json(crumbLeave(json(crumbAlive(d.state, { view: 'map' }, t + 4000)), t + 5000)); t += 9000;
  d = boot(s, t);
  assert.equal(d.crashed, false); assert.equal(d.lite, false, '살아남음 → 보통');
});

test('휴대폰: 오래 쓰다 죽음(세션 화면 터미널 등)은 가볍게 열지 않는다, 가려진 채 죽음은 가벼운 보기를 잇지 않는다(P352)', () => {
  let t = 2e6;
  let d = boot(null, t);
  let s = die(d.state, t, LITE_FAST_MS + 60_000, 'session'); t += 200_000;
  d = boot(s, t);
  assert.equal(d.crashed, true); assert.equal(d.lite, false, '오래 산 뒤 죽음 → 보통');
  // 빠른 죽음 → 가볍게, 그 다음 페이지가 가려진 채 죽음 → 보통(P352: 예전에는 가볍게를 이어 가 풀리지 않았다)
  s = die(d.state, t, 1500); t += 5000;
  d = boot(s, t); assert.equal(d.lite, true);
  s = json({ ...d.state, cur: { ...d.state.cur, alive: t + 60_000, hidden: true } }); t += 120_000;
  d = boot(s, t);
  assert.equal(d.hidden, true); assert.equal(d.lite, false, '가려진 채 죽음은 가벼운 보기를 잇지 않는다'); assert.equal(d.why, 'hidden');
});

test('휴대폰: 보드 단계를 올리지 않고(맵에 끄는 것이 없다), 가벼운 화면 표시가 걸려 있으면 살아남을 때 푼다', () => {
  let t = 3e6;
  // 옛 기록: 단계 2, 가벼운 화면 표시(P87 뒤 휴대폰에는 "보드로 다시 열기"가 없어 풀리지 않던 것)
  let s = json({ v: 1, cur: { boot: t - 9000, alive: t - 7000, clean: false, light: true, mode: 'light', level: 2, phone: true }, crashes: [], light: true, retry: null, level: 2, ok: false, by: 'touch' });
  let d = boot(s, t);
  assert.equal(d.level, 2, '휴대폰 페이지의 죽음으로 단계를 올리지 않는다');
  assert.equal(d.lite, true, '빠른 죽음(2초) → 가볍게');
  s = die(d.state, t, 90_000); t += 100_000;
  d = boot(s, t);
  assert.equal(d.lite, false); assert.equal(d.light, false, '살아남은 휴대폰 페이지 → 가벼운 화면 표시를 푼다');
  assert.equal(d.level, 2);
  // 휴대폰이 아닌 페이지(태블릿 보드)는 지금 규칙(한 단계 가볍게)
  const tab = bootDecide(die(bootDecide(null, t, { touch: true }).state, t, 3000, 'board'), t + 9000, { touch: true });
  assert.equal(tab.lite, false); assert.equal(tab.level, 1);
});

test('PC 브라우저는 가볍게 열지 않는다', () => {
  const s = json({ v: 1, cur: { boot: 1000, alive: 3000, clean: false, mode: 'board', level: 0, phone: true }, crashes: [], light: false, retry: null, level: 0, ok: false, by: 'touch' });
  const d = bootDecide(s, 10_000, { touch: false });
  assert.equal(d.lite, false);
});

test('죽음 보고: view map과 lite를 받는다', () => {
  assert.ok(CRASH_VIEWS.includes('map'));
  const r = reportOf({ boot: 1000, alive: 4000, view: 'map', lite: true, dpr: 3 }, 9000);
  const c = crashInfo(r);
  assert.equal(c.view, 'map'); assert.equal(c.lite, true); assert.equal(c.up, 3000);
  assert.match(crashLabel(c), /map .* lite/);
});

test('열기 계획: 오늘 칸 → 이전 칸 → 움직임, 가볍게면 오늘 칸만', () => {
  assert.deepEqual(openPlan({ stage: 0 }), { earlier: false, motion: false, tiles: true, marks: true, lite: false });
  assert.deepEqual(openPlan({ stage: 1 }), { earlier: true, motion: false, tiles: true, marks: true, lite: false });
  assert.deepEqual(openPlan({ stage: 2 }), { earlier: true, motion: true, tiles: true, marks: true, lite: false });
  for (const stage of [0, 1, 2]) assert.deepEqual(openPlan({ lite: true, stage }), { earlier: false, motion: false, tiles: false, marks: false, lite: true });
  assert.ok(PM.EARLY_MS < PM.CALM_MS, '이전 칸이 움직임보다 먼저');
});

test('earlierIds: 두 칸이면 오른쪽 칸 카드, 한 칸이면 없음', () => {
  const cards = new Map([['a', { x: 0 }], ['b', { x: 120 }], ['c', { x: 400 }], ['d', { x: 520 }]]);
  assert.deepEqual([...earlierIds({ ncol: 2, colDx: 400, cards })], ['c', 'd']);
  assert.equal(earlierIds({ ncol: 1, colDx: 400, cards }).size, 0);
  assert.equal(earlierIds(null).size, 0);
});

test('graphDepsKey: 같은 내용이 다시 채워지면 같은 열쇠(그래프를 다시 받지 않는다), 바뀌면 다른 열쇠', () => {
  const l1 = new Map([['k1', { linkId: 'k1', kind: 'prompt', count: 1 }]]);
  const a = graphDepsKey({ links: l1, thread: new Map(), loops: new Map() });
  assert.equal(graphDepsKey({ links: new Map([['k1', { linkId: 'k1', kind: 'prompt', count: 1 }]]), thread: new Map(), loops: new Map() }), a, '새 Map, 같은 내용');
  assert.notEqual(graphDepsKey({ links: new Map([['k1', { linkId: 'k1', kind: 'prompt', count: 2 }]]), thread: new Map(), loops: new Map() }), a);
  const th = new Map([['t1', { itemId: 't1', seq: 1 }], ['t2', { itemId: 't2', seq: 2 }]]);
  const b = graphDepsKey({ links: l1, thread: th, loops: new Map() });
  assert.notEqual(b, a, 'Thread 새 줄');
  assert.equal(graphDepsKey({ links: l1, thread: new Map(th), loops: new Map() }), b);
  assert.notEqual(graphDepsKey({ links: l1, thread: th, loops: new Map([['L', { loopId: 'L', status: 'active' }]]) }), b, '루프');
  assert.equal(graphDepsKey({}), graphDepsKey({ links: new Map(), thread: new Map(), loops: new Map() }));
});
