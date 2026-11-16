// P175 창 시험: 선의 관계 → 하위 / 동료 토글 값, 동료 선 이름표의 역할 자리
import test from 'node:test';
import assert from 'node:assert/strict';
import { peerView, relValue } from '../src/renderer/lib/link-relation.js';

test('P175 relValue: 동료, 이 선의 보낸 쪽이 위인 하위만 하위, 독립·거꾸로 된 하위·관계 없음은 꺼짐', () => {
  assert.equal(relValue({ from: 'a', to: 'b', relation: { relation: 'peer', source: 'user', up: null } }), 'peer');
  assert.equal(relValue({ from: 'a', to: 'b', relation: { relation: 'sub', source: 'auto', up: 'a' } }), 'sub');
  assert.equal(relValue({ from: 'a', to: 'b', relation: { relation: 'sub', source: 'user', up: 'b' } }), null);
  assert.equal(relValue({ from: 'a', to: 'b', relation: { relation: 'none', source: 'auto', up: null } }), null);
  assert.equal(relValue({ from: 'a', to: 'b' }), null);
  assert.equal(relValue(null), null);
});

test('P175 peerView: 동료 선은 역할 자리에 "동료", 띄울 때 역할(워커)은 동료로, 사람이 쓴 이름은 그대로, 하위 선은 그대로', () => {
  const peer = { relation: 'peer', source: 'user', up: null };
  assert.equal(peerView({ role: null, storedRole: '워커', relation: peer }).role, '동료');
  assert.equal(peerView({ role: null, storedRole: '동료', relation: peer }).role, '동료');
  assert.equal(peerView({ role: null, relation: peer }).role, '동료');
  assert.equal(peerView({ role: null, storedRole: '설계 짝', relation: peer }).role, '설계 짝');
  assert.equal(peerView({ role: null, storedRole: '설계 짝', relation: peer }).peer, true);
  const sub = { role: '리뷰어', relation: { relation: 'sub', source: 'auto', up: 'a' } };
  assert.equal(peerView(sub), sub);
  assert.equal(peerView(null), null);
});

test('P175 roleOnSwitch: 옛 관계의 기본 이름이면 새 관계의 기본 이름, 사람이 쓴 이름·역할 없음은 그대로', async () => {
  const { roleOnSwitch } = await import('../src/renderer/lib/link-relation.js');
  const { translate, LANGUAGES } = await import('../src/renderer/lib/i18n.js');
  const all = (key) => LANGUAGES.map((l) => translate(l, key));
  const d = (lang) => ({ sub: all('links.defaultRole'), subNew: translate(lang, 'links.defaultRole'), peer: ['동료', ...all('relations.peerRole')] });
  // 동료 → 하위: 동료 기본 이름(판의 낱말·어느 언어 글이든)은 하위 기본 이름(지금 언어)으로
  assert.equal(roleOnSwitch('동료', 'sub', d('ko')), '리뷰어');
  assert.equal(roleOnSwitch('동료', 'sub', d('en')), 'Reviewer');
  assert.equal(roleOnSwitch('peer', 'sub', d('en')), 'Reviewer');
  // 하위 → 동료: 하위 기본 이름(어느 언어든)은 판의 낱말 동료로
  assert.equal(roleOnSwitch('Reviewer', 'peer', d('en')), '동료');
  assert.equal(roleOnSwitch('리뷰어', 'peer', d('en')), '동료');
  // 사람이 쓴 이름, 역할 없음, 이미 새 관계의 기본 이름은 그대로
  assert.equal(roleOnSwitch('설계 짝', 'sub', d('ko')), null);
  assert.equal(roleOnSwitch('설계 짝', 'peer', d('ko')), null);
  assert.equal(roleOnSwitch(null, 'peer', d('ko')), null);
  assert.equal(roleOnSwitch('리뷰어', 'sub', d('ko')), null);
  assert.equal(roleOnSwitch('동료', 'peer', d('ko')), null);
});
