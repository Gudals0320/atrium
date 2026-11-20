// P284: 결정 카드의 창 쪽 셈(lib/decisions.js)과 사전 두 벌
import test from 'node:test';
import assert from 'node:assert/strict';
import { decisionsOf, countBySession, answerReady, withoutCard } from '../src/renderer/lib/decisions.js';
import ko from '../src/renderer/locales/ko.js';
import en from '../src/renderer/locales/en.js';

test('P284 decisionsOf: 틀린 줄은 버리고 오래 기다린 것 먼저', () => {
  const cards = decisionsOf([
    { id: 3, sessionId: 'b', question: 'q3', createdAt: 30 },
    { id: '1', sessionId: 'a', question: 'q1', createdAt: 10, options: ['x', 2] },
    { id: 2, sessionId: 'a', question: 'q2', createdAt: 10 },
    { id: 4, question: '세션 없음' }, null, { id: 5, sessionId: 'c' },
  ]);
  assert.deepEqual(cards.map((d) => d.id), [1, 2, 3]);
  assert.deepEqual(cards[0].options, ['x', '2']); assert.deepEqual(cards[1].options, []);
  assert.deepEqual(decisionsOf(null), []);
  const m = countBySession(cards); assert.equal(m.get('a'), 2); assert.equal(m.get('b'), 1);
  assert.deepEqual(withoutCard(cards, 2).map((d) => d.id), [1, 3]);
  assert.equal(answerReady('  '), false); assert.equal(answerReady('진행'), true); assert.equal(answerReady(null), false);
});

test('P284 사전: ko·en 결정 카드 열쇠가 같다', () => {
  const k = (o) => Object.keys(o.decisions || {}).sort();
  assert.ok(k(ko).length >= 10);
  assert.deepEqual(k(ko), k(en));
  assert.equal(ko.decisions.pill, '결정');
});
