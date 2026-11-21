// P286 창 셈 시험: 자동 카드 표시(auto), 모은 답 수(held), 세션마다 첫 카드, 세션의 카드가 모두 자동인가, 두 사전의 새 말.
import test from 'node:test';
import assert from 'node:assert/strict';
import { decisionsOf, heldOf, firstCardIds, allAuto } from '../src/renderer/lib/decisions.js';
import ko from '../src/renderer/locales/ko.js';
import en from '../src/renderer/locales/en.js';

test('P286 자동 카드 표시와 모은 답 수', () => {
  const cards = decisionsOf([
    { id: 3, sessionId: 'a', question: 'q3', createdAt: 30, auto: 1 },
    { id: 1, sessionId: 'a', question: 'q1', createdAt: 10 },
    { id: 2, sessionId: 'b', question: 'q2', createdAt: 20, auto: true },
  ]);
  assert.deepEqual(cards.map((d) => [d.id, d.auto]), [[1, false], [2, true], [3, true]]);
  assert.deepEqual([...firstCardIds(cards)], [1, 2]);
  assert.equal(allAuto(cards, 'a'), false); assert.equal(allAuto(cards, 'b'), true); assert.equal(allAuto(cards, 'z'), false);
  assert.deepEqual(heldOf({ a: 2, b: 0, c: 'x', d: '3' }), { a: 2, d: 3 });
  assert.deepEqual(heldOf(null), {}); assert.deepEqual(heldOf([]), {});
});

test('P286 두 사전: autoDecisions 말이 같은 열쇠로 있다', () => {
  const K = (o) => Object.keys(o.autoDecisions || {}).sort();
  const k = ko.default || ko; const e = en.default || en;
  assert.ok(K(k).length >= 10);
  assert.deepEqual(K(k), K(e));
  assert.match(k.autoDecisions.held, /\{n\}/); assert.match(e.autoDecisions.held, /\{n\}/);
});
