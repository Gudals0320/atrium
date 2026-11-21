// P289: 스티어링을 지금 턴에 넣지 못한 까닭의 창 쪽(대기 글 줄 글, 같은 까닭 알림 하나, 사전 두 벌)
import test from 'node:test';
import assert from 'node:assert/strict';
import { deliveryText, STEER_WHYS } from '../src/renderer/lib/labels.js';
import { steerNotice } from '../src/renderer/lib/delivery-queue.js';
import ko from '../src/renderer/locales/ko.js';
import en from '../src/renderer/locales/en.js';

test('P289 대기 글 줄: 못 넣은 까닭이 기다리는 까닭 대신 보인다', () => {
  const s = deliveryText({ status: 'queued', reason: 'working', steerWhy: 'no_box' });
  assert.ok(s.includes(en.steerWhy.no_box) || s.includes(ko.steerWhy.no_box), s);
  const plain = deliveryText({ status: 'queued', reason: 'working' });
  assert.ok(!plain.includes(en.steerWhy.no_box) && !plain.includes(ko.steerWhy.no_box));
  // 고치는 중이면 그 까닭이 먼저, 보낸 뒤에는 까닭을 보이지 않는다
  assert.ok(!deliveryText({ status: 'queued', reason: 'editing', steerWhy: 'no_box' }).includes(en.steerWhy.no_box));
  assert.ok(!deliveryText({ status: 'confirmed', reason: null, steerWhy: 'no_box' }).includes(en.steerWhy.no_box));
});

test('P289 같은 까닭으로 거듭 누르면 알림 하나', () => {
  assert.equal(steerNotice('d1', 'no_box'), true);
  assert.equal(steerNotice('d1', 'no_box'), false);
  assert.equal(steerNotice('d1', 'no_box'), false);
  assert.equal(steerNotice('d1', 'draft_in_box'), true);
  assert.equal(steerNotice('d2', 'no_box'), true);
  assert.equal(steerNotice('d3', null), false);
});

test('P289 사전: ko·en 까닭 열쇠가 같고 모든 까닭이 있다', () => {
  assert.deepEqual(Object.keys(ko.steerWhy).sort(), Object.keys(en.steerWhy).sort());
  for (const w of STEER_WHYS) { assert.ok(ko.steerWhy[w], w); assert.ok(en.steerWhy[w], w); }
  assert.ok(ko.steerWhy.toast.includes('{why}') && en.steerWhy.toast.includes('{why}'));
});
