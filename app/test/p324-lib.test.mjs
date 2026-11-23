// P324: 판 글자 고정 크기 — 글이 읽히지 않는 배율의 틀 얼굴 경계, 움직이는 동안 멈춘 화면 값(앞·뒤 한 번씩), 테두리 --inv 띠
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tierFor, textReadable, pickAttached, TIER_TEXT_ZOOM, TIER_KEEP, TEXT_BASE_PX, TEXT_READ_PX } from '../src/renderer/lib/faces.js';
import { viewSettler, invBand, SETTLE_REST_MS } from '../src/renderer/lib/view-settle.js';

test('읽히는 배율: 배율 0.20 아래부터 틀(P327 0.46 → P332 0.20, 머리줄 13px가 화면 2.6px)', () => {
  assert.equal(TEXT_BASE_PX, 13);
  assert.ok(Math.abs(TEXT_READ_PX - 2.6) < 1e-9);
  assert.ok(Math.abs(TIER_TEXT_ZOOM - 0.2) < 1e-9);
  assert.equal(tierFor(1440, null, 1), 'term');
  assert.equal(tierFor(1440 * 0.21, null, 0.21), 'term');
  assert.equal(tierFor(1440 * 0.19, null, 0.19), 'frame'); // 노드는 화면 274px(터미널 단계 너비)이지만 배율이 경계 아래
  assert.equal(tierFor(1440 * 0.1, null, 0.1), 'frame');
  // 이력: 이미 글을 그리던 노드는 경계의 88%(0.176)까지 남는다
  assert.equal(tierFor(1440 * 0.18, 'term', 0.18), 'term');
  assert.equal(tierFor(1440 * 0.18, 'brief', 0.18), 'term'); // 요약에서도 글을 그리던 노드라 남고, 노드 너비(259px)로는 터미널 단계
  assert.equal(tierFor(1440 * 0.17, 'term', 0.17), 'frame');
  assert.equal(tierFor(1440 * 0.18, 'frame', 0.18), 'frame'); // 틀에서 올라가려면 0.20
  // zoom을 주지 않으면 예전(노드 화면 너비만)
  assert.equal(tierFor(1440 * 0.3), 'term');
  assert.equal(textReadable(undefined), true);
  assert.equal(textReadable(TIER_TEXT_ZOOM * TIER_KEEP - 0.001, 'term'), false);
});

test('pickAttached(textZoom): 글이 읽히지 않는 배율이면 붙이지 않고, 주지 않으면 예전 기준', () => {
  const nodes = [{ id: 'a', x: 0, y: 0, w: 1440, h: 810 }];
  const screen = { width: 1600, height: 900 };
  const tz = { textZoom: true };
  assert.deepEqual(pickAttached(nodes, { x: 0, y: 0, zoom: 0.8 }, screen, tz), ['a']);
  assert.deepEqual(pickAttached(nodes, { x: 0, y: 0, zoom: 0.19 }, screen, tz), []);
  assert.deepEqual(pickAttached(nodes, { x: 0, y: 0, zoom: 0.19 }, screen), ['a']);
  assert.deepEqual(pickAttached(nodes, { x: 0, y: 0, zoom: 0.18 }, screen, { ...tz, prev: new Set(['a']) }), ['a']); // 붙은 노드는 여유
  assert.deepEqual(pickAttached(nodes, { x: 0, y: 0, zoom: 0.18 }, screen, tz), []); // 새로 붙으려면 0.20
});

function clock() {
  let t = 0; const timers = new Map(); let id = 0;
  return {
    now: () => t,
    setT: (f, ms) => { timers.set(++id, { f, at: t + ms }); return id; },
    clearT: (i) => timers.delete(i),
    go(ms) { const end = t + ms; for (;;) { const due = [...timers].filter(([, x]) => x.at <= end).sort((a, b) => a[1].at - b[1].at)[0]; if (!due) break; t = due[1].at; timers.delete(due[0]); due[1].f(); } t = end; },
  };
}
const V = (z) => ({ transform: [0, 0, z], width: 100, height: 100 });

test('멈춘 화면 값: 움직임의 첫 값은 바로, 움직이는 동안은 그대로, 멈춘 뒤 마지막 값을 한 번', () => {
  const c = clock(); const out = [];
  const s = viewSettler({ publish: (v) => out.push(v.transform[2]), now: c.now, setT: c.setT, clearT: c.clearT });
  assert.equal(SETTLE_REST_MS, 300);
  s.moved(V(1));
  assert.deepEqual(out, [1]);
  for (let i = 0; i < 20; i++) { c.go(16); s.moved(V(1 - i * 0.03)); }
  assert.deepEqual(out, [1]); // 움직이는 동안 바꾸지 않는다
  assert.equal(s.moving, true);
  c.go(SETTLE_REST_MS - 20);
  assert.deepEqual(out, [1]);
  c.go(40);
  assert.equal(out.length, 2);
  assert.ok(Math.abs(out[1] - (1 - 19 * 0.03)) < 1e-9); // 멈춘 뒤 마지막 값 한 번
  assert.equal(s.moving, false);
  c.go(2000);
  assert.equal(out.length, 2);
  // 다음 움직임은 다시 첫 값부터
  s.moved(V(0.2));
  assert.equal(out.length, 3);
  c.go(SETTLE_REST_MS + 10);
  assert.equal(out.length, 3); // 한 번만 움직였으면 뒤에 낼 것이 없다
});

test('멈춘 화면 값: 창 크기만 바뀌면 바로, 움직이는 중이면 멈춘 뒤에 함께', () => {
  const c = clock(); const out = [];
  const s = viewSettler({ publish: (v) => out.push(v.width), now: c.now, setT: c.setT, clearT: c.clearT });
  s.resized({ transform: [0, 0, 1], width: 200, height: 100 });
  assert.deepEqual(out, [200]);
  s.moved({ transform: [1, 0, 1], width: 200, height: 100 });
  s.resized({ transform: [1, 0, 1], width: 300, height: 100 });
  assert.deepEqual(out, [200, 200]);
  c.go(SETTLE_REST_MS + 5);
  assert.deepEqual(out, [200, 200, 300]);
  s.dispose();
});

test('테두리 --inv 띠: 1/배율을 2의 거듭제곱으로', () => {
  assert.equal(invBand(1), 1);
  assert.equal(invBand(0.8), 1);
  assert.equal(invBand(0.6), 2);
  assert.equal(invBand(0.3), 4);
  assert.equal(invBand(0.1), 8);
  assert.equal(invBand(2), 0.5);
  assert.equal(invBand(0.001), 64);
  assert.equal(invBand(NaN), 1);
  // 띠 안에서는 같은 값(움직이는 동안 쓰지 않아도, 멈춘 뒤 바뀌는 일이 드물다)
  assert.equal(invBand(0.75), invBand(0.9));
});

test('틀 얼굴은 로고와 이름(노드 높이 1/8, 판 단위)을, 영역 이름표는 멀리서 큰 이름을 고정 크기로 보인다', async () => {
  const fs = await import('node:fs');
  const read = (f) => fs.readFileSync(new URL('../src/renderer/' + f, import.meta.url), 'utf8');
  const sn = read('SessionNode.jsx');
  const ff = sn.slice(sn.indexOf('function FrameFace'), sn.indexOf('// 아주 멀리서(노드가'));
  assert.match(ff, /<KindIcon kind=\{shownKind\(s\)\}/);
  assert.match(ff, /data-role="frame-name">@\{s\.name\}/);
  assert.match(ff, /fontSize: frameFontPx\(w, h\)/);
  assert.ok(!/useFlowStore|useSettledFlow|transform/.test(ff), '틀 얼굴은 배율을 구독하지 않는다');
  const m = /export const frameFontPx = \(w, h\) => (.*);/.exec(sn);
  const frameFontPx = new Function('w', 'h', 'return ' + m[1]);
  assert.equal(frameFontPx(1440, 810), 101.25); // P327: 1/8
  assert.ok(frameFontPx(1440, 810) * 0.15 >= 15);
  const rg = read('Regions.jsx');
  assert.equal((rg.match(/<BigLabel /g) || []).length, 3, '영역·워크트리·묶음');
  const css = read('styles.css');
  assert.match(css, /\.mt-canvas\[data-text="far"\] \.mt-big-label \{ display: flex; \}/);
  assert.match(css, /\.mt-canvas\[data-band="4"\] \.mt-big-label:is\(\[data-fit="0"\], \[data-fit="1"\], \[data-fit="2"\], \[data-fit="3"\]\) \.mt-big-name/);
});
