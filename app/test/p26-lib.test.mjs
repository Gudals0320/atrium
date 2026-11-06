// P26 단위 시험: 고른 노드 막대(크기 단계 찾기, 토글, 자리), 덩어리 안 연결선의 끝 자리(초점 세션의 테두리 가운데), 눌러서 보기(85% 채우기, 이미 보는 중)
import test from 'node:test';
import assert from 'node:assert/strict';
import { sizeTargets, layoutCount, placeBar } from '../src/renderer/lib/selbar.js';
import { dockFocus } from '../src/renderer/lib/dock-links.js'; // P30: 선 끝(borderAnchor, linkEnds)과 글 자리(placeLabels)는 다리·괄호로 바뀌어 없앴다(p30-lib.test.mjs)
import { enterView, isViewing, fullyVisible, dockRect, FILL, ZOOM_MAX } from '../src/renderer/lib/nav.js';

// P73: 크기 단계 찾기·불·토글은 방향 × 비율 × 단계로 바뀌었다(app/test/p73-lib.test.mjs)

test('크기 대상과 틀 세션 수: 덩어리 안 노드는 덩어리 하나, 구성 노드 모두', () => {
  const docks = [{ dockId: 'd1', members: ['a', 'b', 'c'] }];
  assert.deepEqual(sizeTargets(['a', 'b', 'x'], docks), [{ id: 'a', dockId: 'd1', members: ['a', 'b', 'c'] }, { id: 'x', dockId: null, members: ['x'] }]);
  assert.equal(layoutCount(['b'], docks), 3, '덩어리 안 노드 하나를 고르면 그 덩어리 세션 수');
  assert.equal(layoutCount(['b', 'x', 'y'], docks), 5);
  assert.equal(layoutCount(['x', 'y'], docks), 2);
});

test('막대 자리: 맨 위 줄 창 가운데, 두 묶음 사이로 밀고, 좁으면 단계별로 줄이고, 그래도 모자라면 아래 줄', () => {
  const widths = [700, 560, 480, 360]; // 다 펴짐, 이름 숨김, 짧게, 틀 접음
  // 넓은 창: 다 펴서 가운데
  assert.deepEqual(placeBar({ width: 1600, tlRight: 300, trLeft: 1300, widths }), { row: 'top', level: 0, x: 450, w: 700 });
  // 가운데에 두면 왼쪽 묶음과 겹친다 → 오른쪽으로 민다
  assert.deepEqual(placeBar({ width: 1600, tlRight: 500, trLeft: 1300, widths }), { row: 'top', level: 0, x: 512, w: 700 });
  // 사이가 좁으면 들어가는 가장 낮은 단계
  assert.deepEqual(placeBar({ width: 1584, tlRight: 503, trLeft: 1079, widths }), { row: 'top', level: 2, x: 552, w: 480 });
  assert.equal(placeBar({ width: 1584, tlRight: 503, trLeft: 900, widths }).level, 3);
  // 가장 줄인 막대도 안 들어간다 → 아래 줄(다 펴서)
  assert.deepEqual(placeBar({ width: 1000, tlRight: 400, trLeft: 495, widths }), { row: 'below', level: 0 });
});

test('초점 세션: 고름 > 눌러 들어감(보일 때) > 화면 가운데 > 없음', () => {
  const rects = { a: { x: 0, y: 0, w: 720, h: 460 }, b: { x: 720, y: 0, w: 720, h: 460 } };
  const view = { x: 800, y: 0, w: 600, h: 400 }; // 가운데 (1100, 200)는 b 안
  assert.equal(dockFocus({ rects, selected: ['x', 'a'], focusId: 'b', view }), 'a');
  assert.equal(dockFocus({ rects, selected: [], focusId: 'a', view: { x: 0, y: 0, w: 1440, h: 460 } }), 'a');
  assert.equal(dockFocus({ rects, focusId: 'a', view }), 'b', '눌러 들어간 노드가 화면 밖이면 가운데');
  assert.equal(dockFocus({ rects, focusId: 'zz', view }), 'b');
  assert.equal(dockFocus({ rects, view: { x: 5000, y: 0, w: 100, h: 100 } }), null);
  assert.equal(dockFocus({ rects }), null);
});

const screen = { width: 1600, height: 900 };
test('눌러서 보기: 노드나 덩어리가 화면의 85%를 채우고 배율은 1까지', () => {
  assert.equal(FILL, 0.85); assert.equal(ZOOM_MAX, 1);
  const r = { x: 0, y: 0, w: 1040, h: 585 };
  const v = enterView({ node: r, screen });
  assert.ok(Math.abs(v.zoom * r.w - 0.85 * 1600) < 1e-6 || Math.abs(v.zoom * r.h - 0.85 * 900) < 1e-6 || v.zoom === 1);
  assert.ok(Math.abs(v.zoom - Math.min(1360 / 1040, 765 / 585, 1)) < 1e-9);
  const big = { x: 0, y: 0, w: 2880, h: 1840 };
  const g = enterView({ node: { x: 0, y: 0, w: 1440, h: 920 }, dock: big, screen });
  assert.equal(g.mode, 'dock'); assert.ok(Math.abs(g.zoom - 765 / 1840) < 1e-9);
  assert.equal(g.cx, 1440); assert.equal(g.cy, 920);
});

test('이미 보는 중이면 다시 옮기지 않는다', () => {
  const node = { x: 0, y: 0, w: 720, h: 460 };
  const v = enterView({ node, screen }); // 배율 1, 가운데 (360, 230)
  const at = (zoom, cx, cy) => ({ x: screen.width / 2 - cx * zoom, y: screen.height / 2 - cy * zoom, zoom });
  assert.ok(isViewing({ node, view: v, viewport: at(1, 360, 230), screen }), '맞춘 그대로');
  assert.ok(isViewing({ node, view: v, viewport: at(0.8, 300, 200), screen }), '조금 작고 조금 비켜도 다 보이면');
  assert.ok(!isViewing({ node, view: v, viewport: at(0.5, 360, 230), screen }), '너무 멀면(맞출 배율의 3/4 아래) 옮긴다');
  assert.ok(!isViewing({ node, view: v, viewport: at(1, 1200, 230), screen }), '다 보이지 않으면 옮긴다');
  // 덩어리: 덩어리가 다 보이면 다른 구성 노드를 눌러도 그대로, 구성 노드를 크게 보고 있어도 그대로
  const a = { x: 0, y: 0, w: 720, h: 460 }, b = { x: 720, y: 0, w: 720, h: 460 }, c = { x: 1440, y: 0, w: 720, h: 460 };
  const dock = dockRect([a, b, c]);
  const dv = enterView({ node: b, dock, screen });
  assert.equal(dv.mode, 'dock');
  assert.ok(isViewing({ node: c, dock, view: enterView({ node: c, dock, screen }), viewport: at(dv.zoom, dv.cx, dv.cy), screen }));
  assert.ok(isViewing({ node: b, dock, view: dv, viewport: at(1.4, 1080, 230), screen }), '구성 노드를 더 크게 보는 중');
  assert.ok(!isViewing({ node: a, dock, view: enterView({ node: a, dock, screen }), viewport: at(1.4, 1080, 230), screen }), '크게 보는 노드가 아닌 쪽을 누르면 옮긴다');
  // 멀리서 덩어리가 다 보여도 터미널(가까이 얼굴)이 아니면 옮긴다
  assert.ok(!isViewing({ node: b, dock, view: dv, viewport: at(0.45, 1080, 230), screen }));
  assert.ok(fullyVisible(node, at(1, 360, 230), screen));
});
