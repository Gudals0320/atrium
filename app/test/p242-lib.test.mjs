// P242: rig 3 판의 보기 자료(길마다 수, 입력 창구 줄, 멈춘 역할, 반려된 입력)
import test from 'node:test';
import assert from 'node:assert/strict';
import { flowRows, intakeRows, stalledRows, returnedIntake } from '../src/renderer/lib/rig.js';
import en from '../src/renderer/locales/en.js';
import ko from '../src/renderer/locales/ko.js';

const R3 = {
  roles: [
    { name: 'ideas', items: { pending: 1, unanswered: 0, returned: 0, waitingOwn: 0, stalled: [] } },
    { name: 'verify', items: { pending: 1, unanswered: 1, returned: 0, waitingOwn: 0, stalled: ['hypothesis-1'] } },
    { name: 'data', items: null },
  ],
  flows: [
    { item: 'hypothesis', from: ['ideas'], to: ['verify'], for: null, counts: { put: 3, accepted: 1, returned: 1, waiting: 1, passed: 0 } },
    { item: 'hint', from: ['human'], to: ['ideas'], for: null, counts: null },
    { item: 'request', from: ['human', 'ideas'], to: ['data'], for: null },
  ],
  intake: { kinds: ['hint', 'request'], returned: [{ id: 'hint-1', path: '.atrium/intake/hint-1.md', by: [{ role: 'ideas', reason: '모호하다', late: false }] }] },
};

test('P242 길마다 수와 입력 창구 줄', () => {
  assert.deepEqual(flowRows(R3)[0].counts, { put: 3, accepted: 1, returned: 1, waiting: 1, passed: 0 });
  assert.equal(flowRows(R3)[1].counts, null);
  assert.deepEqual(intakeRows(R3), [{ item: 'hint', to: ['ideas'] }, { item: 'request', to: ['data'] }]);
  assert.deepEqual(intakeRows(null), []);
});

test('P242 멈춘 역할과 반려된 입력, 사전 두 벌', () => {
  assert.deepEqual(stalledRows(R3), [{ role: 'verify', items: ['hypothesis-1'] }]);
  assert.deepEqual(returnedIntake(R3), [{ id: 'hint-1', by: 'ideas', reason: '모호하다' }]);
  assert.deepEqual(returnedIntake({}), []);
  assert.deepEqual(Object.keys(en.rigItems).sort(), Object.keys(ko.rigItems).sort());
});
