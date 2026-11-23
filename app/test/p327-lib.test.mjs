// P327: 로고(틀) 얼굴로 바뀌는 배율을 늦추고(0.615 → 0.46, 여유 0.41) 틀 얼굴 이름 글자를 노드 높이 1/8로 줄였다
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tierFor, textReadable, pickAttached, TIER_TEXT_ZOOM, TIER_KEEP } from '../src/renderer/lib/faces.js';

test('경계: 0.45 안팎에서 틀, 여유는 0.40 안팎', () => {
  assert.ok(TIER_TEXT_ZOOM > 0.44 && TIER_TEXT_ZOOM < 0.47, String(TIER_TEXT_ZOOM));
  assert.ok(TIER_TEXT_ZOOM * TIER_KEEP > 0.39 && TIER_TEXT_ZOOM * TIER_KEEP < 0.42);
  // 예전 경계(0.615·0.54) 사이에서는 이제 글을 그린다
  for (const z of [0.6, 0.55, 0.5, 0.47]) { assert.equal(textReadable(z), true, String(z)); assert.equal(tierFor(1440 * z, null, z), 'term'); }
  for (const z of [0.45, 0.3, 0.15]) assert.equal(tierFor(1440 * z, null, z), 'frame', String(z));
  assert.equal(textReadable(0.42, 'term'), true);
  assert.equal(textReadable(0.42, 'frame'), false);
  assert.equal(textReadable(0.4, 'brief'), false);
  // 머리줄 13px는 경계에서 화면 약 6px, 요약 15px는 약 7px
  assert.ok(Math.abs(13 * TIER_TEXT_ZOOM - 6) < 1e-9);
  assert.ok(15 * TIER_TEXT_ZOOM > 6.9);
});

test('터미널 붙이기도 같은 경계(0.5에서 붙고 0.44에서 새로 붙지 않는다)', () => {
  const nodes = [{ id: 'a', x: 0, y: 0, w: 1440, h: 810 }];
  const screen = { width: 1600, height: 900 };
  assert.deepEqual(pickAttached(nodes, { x: 0, y: 0, zoom: 0.5 }, screen, { textZoom: true }), ['a']);
  assert.deepEqual(pickAttached(nodes, { x: 0, y: 0, zoom: 0.44 }, screen, { textZoom: true }), []);
  assert.deepEqual(pickAttached(nodes, { x: 0, y: 0, zoom: 0.44 }, screen, { textZoom: true, prev: new Set(['a']) }), ['a']);
});

test('틀 얼굴 글자: 노드 높이 1/8(너비 1/12), 1440×810이면 101px', () => {
  const sn = fs.readFileSync(new URL('../src/renderer/SessionNode.jsx', import.meta.url), 'utf8');
  const m = /export const frameFontPx = \(w, h\) => (.*);/.exec(sn);
  const frameFontPx = new Function('w', 'h', 'return ' + m[1]);
  assert.equal(frameFontPx(1440, 810), 101.25);
  assert.equal(frameFontPx(720, 810), 60); // 좁은 노드는 너비 1/12
  assert.equal(frameFontPx(60, 40), 12); // 하한
  assert.ok(Math.abs(frameFontPx(1440, 810) * 0.44 - 44.55) < 0.01);
  // 로고·상태 표지는 em이라 이름 글자와 같은 비율로 준다
  const css = fs.readFileSync(new URL('../src/renderer/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.mt-frameface \.mt-frame-row \.mt-kind-icon \{ width: 1\.1em; height: 1\.1em;/);
  assert.match(css, /\.mt-frameface \.mt-frame-row \.mt-frame-mark \{ width: 1em;/);
});
