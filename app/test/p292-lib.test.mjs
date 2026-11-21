// P292 창 셈 시험: 사용자 몫. 카드 종류·명령·나중 줄 나누기, 단추 모양, 미루기 때(1시간·내일 아침·고른 때), 나중 줄 때 글, 두 사전의 새 말.
import test from 'node:test';
import assert from 'node:assert/strict';
import { decisionsOf, activeCards, laterCards, actionOf, snoozeTimes, pickedTime, pickDefault, whenText, withDeferred, allAuto } from '../src/renderer/lib/decisions.js';
import ko from '../src/renderer/locales/ko.js';
import en from '../src/renderer/locales/en.js';

test('P292 카드 종류와 나중 줄', () => {
  const cards = decisionsOf([
    { id: 1, sessionId: 'a', question: 'q1', createdAt: 10 },
    { id: 2, sessionId: 'a', question: 'q2', createdAt: 20, kind: 'do', cmds: ['npm ci', 3] },
    { id: 3, sessionId: 'b', question: 'q3', createdAt: 30, kind: 'later', wakeAt: 500, deferred: true, later: '2099-01-01' },
    { id: 4, sessionId: 'b', question: 'q4', createdAt: 40, kind: 'later', cond: '키가 오면', deferred: true },
    { id: 5, sessionId: 'b', question: 'q5', createdAt: 50, kind: 'check', auto: true },
    { id: 6, sessionId: 'b', question: 'q6', createdAt: 5, kind: 'weird', deferred: true, wakeAt: 100 },
  ]);
  assert.deepEqual(cards.map((d) => d.kind), ['decide', 'decide', 'do', 'later', 'later', 'check'], '모르는 종류는 결정');
  assert.deepEqual(cards.find((d) => d.id === 2).cmds, ['npm ci', '3']);
  assert.deepEqual(activeCards(cards).map((d) => d.id), [1, 2, 5]);
  assert.deepEqual(laterCards(cards).map((d) => d.id), [6, 3, 4], '때가 이른 것 먼저, 조건은 끝');
  assert.deepEqual(cards.map(actionOf), ['decide', 'decide', 'do', 'do', 'do', 'check']);
  assert.equal(allAuto(activeCards(cards), 'b'), true, '지금 목록의 b 카드는 자동 확인뿐');
  const moved = withDeferred(cards, 1, true, 999);
  assert.equal(moved.find((d) => d.id === 1).deferred, true); assert.equal(moved.find((d) => d.id === 1).wakeAt, 999);
  const back = withDeferred(cards, 4, false);
  assert.equal(back.find((d) => d.id === 4).deferred, false); assert.equal(back.find((d) => d.id === 4).cond, null);
});

test('P292 미루기 때와 나중 때 글', () => {
  const now = new Date(2026, 10, 21, 14, 37).getTime();
  const s = snoozeTimes(now);
  assert.equal(s.hour, now + 3600e3);
  assert.equal(s.morning, new Date(2026, 10, 22, 9, 0).getTime());
  assert.equal(pickDefault(now), '2026-11-21T15:00');
  assert.equal(pickedTime('2026-11-21T15:00', now), new Date(2026, 10, 21, 15, 0).getTime());
  assert.equal(pickedTime('2026-11-21T14:00', now), null, '지난 때는 안 된다');
  assert.equal(pickedTime('', now), null);
  assert.equal(whenText(new Date(2026, 10, 21, 9, 5).getTime(), now), '11/21 09:05');
  assert.equal(whenText(new Date(2027, 0, 2, 9, 5).getTime(), now), '2027/1/2 09:05');
  assert.equal(whenText(null, now), '');
});

test('P292 두 사전: userTasks 말이 같은 열쇠로 있다', () => {
  const k = ko.default || ko; const e = en.default || en;
  const K = (o) => JSON.stringify(Object.keys(o.userTasks).sort()) + JSON.stringify(Object.keys(o.userTasks.kind).sort());
  assert.equal(K(k), K(e));
  assert.equal(k.userTasks.pill, '내 몫'); assert.equal(e.userTasks.pill, 'For you');
  for (const x of ['decide', 'do', 'check', 'later']) { assert.ok(k.userTasks.kind[x]); assert.ok(e.userTasks.kind[x]); }
  assert.match(k.userTasks.later, /\{n\}/); assert.match(e.userTasks.markN, /\{n\}/);
});
