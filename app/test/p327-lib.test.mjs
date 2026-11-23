// P327: 로고(틀) 얼굴로 바뀌는 배율을 늦추고(0.615 → 0.46, 여유 0.41) 틀 얼굴 이름 글자를 노드 높이 1/8로 줄였다
// P332: 경계를 다시 0.20(여유 0.176)으로 낮췄다. 경계 값 시험은 p332-lib.test.mjs, 여기서는 P327이 연 띠가 글로 남는지만 본다
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tierFor, textReadable, pickAttached, TIER_TEXT_ZOOM, TIER_KEEP } from '../src/renderer/lib/faces.js';

test('P327이 연 띠(0.46~0.615)와 그 아래 0.20까지는 글을 그린다', () => {
  assert.ok(TIER_TEXT_ZOOM * TIER_KEEP < 0.2);
  for (const z of [0.6, 0.55, 0.5, 0.47, 0.45, 0.3]) { assert.equal(textReadable(z), true, String(z)); assert.equal(tierFor(1440 * z, null, z), 'term'); }
  for (const z of [0.42, 0.4]) { assert.equal(textReadable(z, 'frame'), true, String(z)); assert.equal(textReadable(z, 'brief'), true, String(z)); }
});

test('터미널 붙이기는 0.44에서도 새로 붙는다(P332)', () => {
  const nodes = [{ id: 'a', x: 0, y: 0, w: 1440, h: 810 }];
  const screen = { width: 1600, height: 900 };
  assert.deepEqual(pickAttached(nodes, { x: 0, y: 0, zoom: 0.5 }, screen, { textZoom: true }), ['a']);
  assert.deepEqual(pickAttached(nodes, { x: 0, y: 0, zoom: 0.44 }, screen, { textZoom: true }), ['a']);
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
