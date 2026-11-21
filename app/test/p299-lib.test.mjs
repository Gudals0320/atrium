// P299: Hermes 노력 수준 칸의 창 쪽 순수 함수(하네스 표의 efforts로 목록, 하네스를 바꾸면 받지 않는 값은 비운다)
import test from 'node:test';
import assert from 'node:assert/strict';
import { harnessEfforts, DEFAULT_EFFORTS, withHarness } from '../src/renderer/lib/launchers.js';

const HE = ['', 'none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'];
const H = [{ id: 'claude', fields: ['model', 'effort'] }, { id: 'hermes', fields: ['model', 'effort', 'args'], efforts: HE }];

test('P299 노력 칸 목록: Hermes는 Hermes 값(빈 값 = 기본), 그 밖은 Claude Code 값', () => {
  assert.deepEqual(harnessEfforts(H, 'hermes'), HE);
  assert.deepEqual(harnessEfforts(H, 'claude'), DEFAULT_EFFORTS);
  assert.deepEqual(harnessEfforts(H, 'nope'), DEFAULT_EFFORTS);
  assert.deepEqual(harnessEfforts(null, 'hermes'), DEFAULT_EFFORTS);
  assert.equal(DEFAULT_EFFORTS[0], '');
});

test('P299 하네스 바꾸기: 새 하네스가 받지 않는 노력 값은 비우고, 받는 값은 둔다', () => {
  assert.equal(withHarness({ harness: 'hermes', effort: 'ultra', permissionMode: 'manual' }, 'claude', H).effort, '');
  assert.equal(withHarness({ harness: 'claude', effort: 'high', permissionMode: 'manual' }, 'hermes', H).effort, 'high');
  assert.equal(withHarness({ harness: 'claude', effort: '', permissionMode: 'manual' }, 'hermes', H).effort, '');
});
