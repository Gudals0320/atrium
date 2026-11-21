// P295 창 셈 시험: 답 실어 보내기. 카드의 보내는 때(timing) 읽기, 보내는 때 표시를 달 카드, 바꾸기, 붙잡은 답만 있는 세션, 두 사전의 새 말.
import test from 'node:test';
import assert from 'node:assert/strict';
import { decisionsOf, sendsAnswer, timingOf, flipTiming, heldOnly, heldTotal, heldOf } from '../src/renderer/lib/decisions.js';
import ko from '../src/renderer/locales/ko.js';
import en from '../src/renderer/locales/en.js';

test('P295 보내는 때 읽기와 표시', () => {
  const cards = decisionsOf([
    { id: 1, sessionId: 'a', question: 'q1', createdAt: 1, timing: 'now' },
    { id: 2, sessionId: 'a', question: 'q2', createdAt: 2, timing: 'next', kind: 'check' },
    { id: 3, sessionId: 'a', question: 'q3', createdAt: 3, timing: 'weird', kind: 'do' },
    { id: 4, sessionId: 'b', question: 'q4', createdAt: 4, kind: 'do', tell: true },
  ]);
  assert.deepEqual(cards.map((d) => d.timing), ['now', 'next', null, null], '모르는 값은 비운다');
  assert.deepEqual(cards.map(sendsAnswer), [true, true, false, true], '기록만 하는 할 일에는 표시를 달지 않는다');
  assert.equal(timingOf(cards[0]), 'now'); assert.equal(timingOf(cards[1]), 'next'); assert.equal(timingOf(cards[3]), 'now', '모르면 now');
  assert.equal(timingOf(cards[1], 'now'), 'now', '사람이 바꾼 값이 먼저');
  assert.equal(flipTiming('now'), 'next'); assert.equal(flipTiming('next'), 'now');
});

test('P295 붙잡은 답만 있는 세션', () => {
  const held = heldOf({ a: 2, b: 1, c: 0 });
  const cards = decisionsOf([{ id: 1, sessionId: 'a', question: 'q', createdAt: 1 }]);
  assert.deepEqual(heldOnly(held, cards), ['b']);
  assert.equal(heldTotal(held), 3); assert.equal(heldTotal({}), 0);
});

test('P295 두 사전', () => {
  for (const d of [ko, en]) {
    for (const k of ['now', 'next', 'nowTitle', 'nextTitle', 'line', 'lineTitle', 'toast', 'mark', 'markTitle']) assert.ok(d.riding && typeof d.riding[k] === 'string' && d.riding[k].length, k);
    assert.match(d.riding.line, /\{n\}/); assert.match(d.riding.mark, /\{n\}/); assert.match(d.riding.toast, /\{name\}/);
  }
  assert.equal(ko.riding.now, '바로 감'); assert.equal(ko.riding.next, '다음 메시지와');
  assert.match(ko.riding.line, /다음 메시지와 함께 갈 답/); assert.match(ko.riding.mark, /실어 보낼 답/);
});
