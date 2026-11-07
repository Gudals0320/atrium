// P77 창 단위 시험: 덩어리를 고르면 크기 막대의 불(방향·비율·단계)은 칸 하나(가장 작은 구성 노드)의 것이다. 혼자인 세션은 그대로
import test from 'node:test';
import assert from 'node:assert/strict';
import { blockState, dockState, litOf, levelSize } from '../src/renderer/lib/selbar.js';
import en from '../src/renderer/locales/en.js';
import ko from '../src/renderer/locales/ko.js';

const R = (x, y, w, h) => ({ x, y, w, h });

test('덩어리 막대 불: H 넷 가로형 16:9 크게는 칸 기준으로 가로형·16:9·크게', () => {
  const h4 = [0, 1, 2, 3].map((i) => R(i * 1920, 0, 1920, 1080));
  assert.deepEqual(dockState(h4, '16:9'), { dir: 'wide', aspect: '16:9', level: 'large', cell: { w: 1920, h: 1080 } });
  // 바깥(7680×1080)으로 재면 비율이 맞지 않는다: 칸 기준이어야 불이 든다
  assert.deepEqual(blockState(R(0, 0, 7680, 1080), '16:9'), { dir: 'wide', aspect: null, level: null });
  // V 넷 세로형 4:3 보통
  const v4 = [0, 1, 2, 3].map((i) => R(0, i * 1200, 900, 1200));
  assert.deepEqual(dockState(v4, '4:3'), { dir: 'tall', aspect: '4:3', level: 'normal', cell: { w: 900, h: 1200 } });
  // 고르지 않은 틀: 큰 칸(2 × 2)과 작은 칸. 단계는 작은 칸
  const ml = [R(0, 0, 2880, 1620), R(2880, 0, 1440, 810), R(2880, 810, 1440, 810)];
  assert.equal(dockState(ml, '16:9').level, 'normal');
  // 바깥 테두리로 바꾼 뒤(칸 모양이 어긋남): 비율·단계 꺼짐
  assert.deepEqual(dockState([R(0, 0, 1440, 1010), R(1440, 0, 1440, 1010)], '16:9'), { dir: 'wide', aspect: null, level: null, cell: { w: 1440, h: 1010 } });
  // P73 바깥 기준 H 넷(바깥 1920×1080): 칸 480×1080이라 세로형으로 보이고 불은 꺼진다
  assert.deepEqual(dockState([0, 1, 2, 3].map((i) => R(i * 480, 0, 480, 1080)), '16:9'), { dir: 'tall', aspect: null, level: null, cell: { w: 480, h: 1080 } });
  assert.equal(dockState([], '16:9'), null);
});

test('덩어리와 혼자인 세션을 함께 고르면 둘 다 같은 값일 때만 불. 단계 풀이 크기는 칸 하나', () => {
  const d = dockState([R(0, 0, 1440, 810), R(1440, 0, 1440, 810)], '16:9');
  const n = blockState(R(0, 2000, 1440, 810), '16:9');
  const { cell, ...ds } = d;
  assert.deepEqual(litOf([ds, n]), { dir: 'wide', aspect: '16:9', level: 'normal' });
  assert.deepEqual(levelSize('large', { dir: 'wide', aspect: '16:9', rect: cell }), { w: 1920, h: 1080 });
});

test('사전: 칸 기준 막대 글이 두 사전에 같은 열쇠로 있고, 덩어리 전체 비율이라는 옛 말이 없다', () => {
  const keys = ['label', 'title', 'dirTitle', 'aspectTitle', 'sizeTitle'];
  assert.deepEqual(Object.keys(en.dockCellBar).sort(), [...keys].sort());
  assert.deepEqual(Object.keys(ko.dockCellBar).sort(), [...keys].sort());
  assert.ok(!/그룹 전체의 종횡비/.test(ko.sizeBar.aspectTitle) && !/whole dock/.test(en.sizeBar.aspectTitle));
  assert.ok(ko.dockCellBar.sizeTitle.includes('{w}') && en.dockCellBar.sizeTitle.includes('{h}'));
});
