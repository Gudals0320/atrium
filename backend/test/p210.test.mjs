// P210: 성능 기록이 세션 맵 묶음(map: 열림, 배치 셈·그래프 읽기 횟수와 ms 합·최대, 카드 그리기 수)을 받는다. 정한 숫자만, 글은 버린다
import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeReport } from '../src/perf-trace.mjs';

test('sanitizeReport: map 묶음은 정한 숫자 키만 남긴다', () => {
  const r = sanitizeReport({ sec: 30, map: { open: 1, layout: 12, layoutMs: 96.456, layoutMax: 11.2, graph: 3, graphMs: 9.9, graphMax: 4.1, cards: 140, name: 'secret', text: 'hello' } }, 'app');
  assert.deepEqual(r.map, { open: 1, layout: 12, layoutMs: 96.46, layoutMax: 11.2, graph: 3, graphMs: 9.9, graphMax: 4.1, cards: 140 });
});

test('sanitizeReport: map이 없거나 글뿐이면 넣지 않는다', () => {
  assert.ok(!('map' in sanitizeReport({ sec: 1 }, 'app')));
  assert.ok(!('map' in sanitizeReport({ sec: 1, map: { name: 'x' } }, 'app')));
});
