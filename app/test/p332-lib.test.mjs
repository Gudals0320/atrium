// P332: 세션 노드가 틀(로고) 얼굴로 바뀌는 배율을 0.46 → 0.20(여유 0.176)으로 낮췄다.
//   영역·워크트리·묶음 이름표의 큰 이름 전환(Canvas.jsx data-text)과 판의 터미널 붙이기(pickAttached textZoom)도 같은 경계다
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tierFor, textReadable, pickAttached, faceOfTier, TIER_TEXT_ZOOM, TIER_KEEP, TEXT_READ_PX } from '../src/renderer/lib/faces.js';

test('경계 0.20, 되돌림 여유 0.176(다른 단계와 같은 88%)', () => {
  assert.ok(Math.abs(TIER_TEXT_ZOOM - 0.2) < 1e-9);
  assert.ok(Math.abs(TIER_TEXT_ZOOM * TIER_KEEP - 0.176) < 1e-9);
  assert.ok(Math.abs(TEXT_READ_PX - 2.6) < 1e-9); // 머리줄 13px가 경계에서 화면 2.6px
  // 처음 그 배율로 오면: 0.20 이상은 글, 아래는 틀
  for (const z of [0.46, 0.35, 0.25, 0.21, 0.2]) assert.equal(textReadable(z), true, String(z));
  for (const z of [0.199, 0.19, 0.12]) assert.equal(textReadable(z), false, String(z));
  // 글을 그리던 노드는 0.176까지 남고, 틀이던 노드는 0.20까지 틀
  assert.equal(textReadable(0.19, 'term'), true);
  assert.equal(textReadable(0.177, 'brief'), true);
  assert.equal(textReadable(0.175, 'term'), false);
  assert.equal(textReadable(0.19, 'frame'), false);
  assert.equal(textReadable(0.2, 'frame'), true);
});

test('기본 노드(1440×810) 얼굴: 0.21은 터미널, 0.19는 처음이면 틀·글이던 노드면 터미널', () => {
  assert.equal(faceOfTier(tierFor(1440 * 0.21, null, 0.21), true), 'close');
  assert.equal(faceOfTier(tierFor(1440 * 0.21, null, 0.21), false), 'far');
  assert.equal(faceOfTier(tierFor(1440 * 0.19, null, 0.19), true), 'icon');
  assert.equal(faceOfTier(tierFor(1440 * 0.19, 'term', 0.19), true), 'close');
  // 좁은 노드는 예전처럼 노드 화면 너비 단계가 먼저 닿는다(720px 노드는 0.20에서 144px: 요약)
  assert.equal(tierFor(720 * 0.2, null, 0.2), 'brief');
  assert.equal(tierFor(720 * 0.16, null, 0.16), 'frame');
});

test('터미널 붙이기: 0.20까지 새로 붙고, 붙은 노드는 0.176까지 남는다', () => {
  const nodes = [{ id: 'a', x: 0, y: 0, w: 1440, h: 810 }];
  const screen = { width: 1600, height: 900 };
  const tz = { textZoom: true };
  assert.deepEqual(pickAttached(nodes, { x: 0, y: 0, zoom: 0.21 }, screen, tz), ['a']);
  assert.deepEqual(pickAttached(nodes, { x: 0, y: 0, zoom: 0.19 }, screen, tz), []);
  assert.deepEqual(pickAttached(nodes, { x: 0, y: 0, zoom: 0.19 }, screen, { ...tz, prev: new Set(['a']) }), ['a']);
  assert.deepEqual(pickAttached(nodes, { x: 0, y: 0, zoom: 0.17 }, screen, { ...tz, prev: new Set(['a']) }), []);
});

test('영역 이름표의 큰 이름 전환은 같은 textReadable을 쓴다', () => {
  const cv = fs.readFileSync(new URL('../src/renderer/Canvas.jsx', import.meta.url), 'utf8');
  assert.match(cv, /const f = !textReadable\(z, far \? 'frame' : 'term'\);/);
  assert.match(cv, /pickAttached\(list, vp, screen, \{[^}]*textZoom: true \}\)/);
});
