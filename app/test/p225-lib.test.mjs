// P225: 응답 필요 목록의 무인 자리 승인(워크스페이스 목록의 rigPermits)과 두 사전의 글
import test from 'node:test';
import assert from 'node:assert/strict';
import { permitNeeds } from '../src/renderer/lib/rig-permits.js';
import ko from '../src/renderer/locales/ko.js';
import en from '../src/renderer/locales/en.js';

test('P225 permitNeeds: 워크스페이스 차례, 자리 차례로 항목을 만들고 rigPermits가 없으면 건너뛴다', () => {
  assert.deepEqual(permitNeeds([{ key: 'a', rigPermits: ['w1', 'w2'] }, { key: 'b' }, { key: 'c', rigPermits: [] }, null, { key: 'd', rigPermits: ['m'] }]).map((x) => x.key), ['a|w1', 'a|w2', 'd|m']);
  assert.deepEqual(permitNeeds(undefined), []);
  assert.deepEqual(permitNeeds([{ key: 'a', rigPermits: 'w' }]), [], '배열이 아니면 무시');
});

test('P225 두 사전: rigPermitNeed 글이 같은 키와 같은 자리 표시', () => {
  const ks = Object.keys(ko.rigPermitNeed);
  assert.deepEqual(Object.keys(en.rigPermitNeed), ks);
  const marks = (s) => (s.match(/\{\w+\}/g) || []).sort().join(',');
  for (const k of ks) assert.equal(marks(en.rigPermitNeed[k]), marks(ko.rigPermitNeed[k]), k);
  assert.equal(ko.rigPermitNeed.line, '무인 자리 승인: {seat}');
});
