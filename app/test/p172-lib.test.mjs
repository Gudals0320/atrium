// P172 시험: 대기 글 묶기(queueView), 순서 옮기기(moveOrder), 바로 보내기 단추(steerOf), 두 사전
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { queueView, moveOrder, steerOf } from '../src/renderer/lib/delivery-queue.js';
import ko from '../src/renderer/locales/ko.js';
import en from '../src/renderer/locales/en.js';

const D = (id, sessionId, status, seq, extra = {}) => ({ deliveryId: id, sessionId, status, seq, createdAt: seq, name: sessionId, ...extra });

test('queueView: 대기 글이 있는 세션은 한 상자, 보낼 차례(seq)대로. 보내는 중인 글이 앞, 나머지는 칩', () => {
  const now = 10_000;
  const list = [
    D('a1', 'A', 'queued', 300), D('a0', 'A', 'sent', 100), D('a2', 'A', 'queued', 150),
    D('b1', 'B', 'sending', 200), // 대기 글이 없는 세션은 칩
    D('c1', 'C', 'confirmed', 50, { _at: now - 1000 }), D('c2', 'C', 'confirmed', 60, { _at: now - 60_000 }),
  ];
  const { groups, chips } = queueView(list, { now });
  assert.equal(groups.length, 1);
  assert.equal(groups[0].sessionId, 'A');
  assert.deepEqual(groups[0].items.map((d) => d.deliveryId), ['a0', 'a2', 'a1']);
  assert.equal(groups[0].queued, 2);
  assert.deepEqual(chips.map((d) => d.deliveryId).sort(), ['b1', 'c1'], '오래된 끝난 칩은 숨는다');
});

test('moveOrder: 대기 글끼리만 옮기고 끝에서는 null', () => {
  const items = [D('s', 'A', 'sent', 1), D('x', 'A', 'queued', 2), D('y', 'A', 'queued', 3), D('z', 'A', 'queued', 4)];
  assert.deepEqual(moveOrder(items, 'z', -1), ['x', 'z', 'y']);
  assert.deepEqual(moveOrder(items, 'x', 1), ['y', 'x', 'z']);
  assert.equal(moveOrder(items, 'x', -1), null);
  assert.equal(moveOrder(items, 'z', 1), null);
  assert.equal(moveOrder(items, 's', 1), null, '보낸 글은 옮기지 않는다');
});

test('steerOf: 일하는 Claude Code(hook)만 스티어링, 다른 종류가 일하는 중이면 끈다', () => {
  assert.deepEqual(steerOf({ state: 'working', kind: 'claude', hooked: true }), { ok: true, key: 'steer' });
  assert.deepEqual(steerOf({ state: 'working', kind: 'codex', hooked: false }), { ok: false, key: 'kindBusy' });
  assert.deepEqual(steerOf({ state: 'working', kind: 'claude', hooked: false }), { ok: false, key: 'kindBusy' });
  assert.equal(steerOf({ state: 'ready', kind: 'codex' }).key, 'now');
  assert.equal(steerOf({ state: 'sleeping' }).key, 'wake');
  assert.equal(steerOf({ state: 'waiting' }).key, 'afterBlock');
  assert.equal(steerOf(null).ok, false);
});

test('두 사전: deliveryQueue 열쇠가 같고 단추 까닭이 모두 있다', () => {
  assert.deepEqual(Object.keys(ko.deliveryQueue).sort(), Object.keys(en.deliveryQueue).sort());
  for (const k of ['steer', 'now', 'wake', 'afterBlock', 'kindBusy', 'gone']) assert.ok(ko.deliveryQueue[`now_${k}`] && en.deliveryQueue[`now_${k}`], k);
  const src = fs.readFileSync(new URL('../src/renderer/DeliveryQueue.jsx', import.meta.url), 'utf8');
  for (const k of src.match(/deliveryQueue\.(\w+)/g).map((x) => x.split('.')[1]).filter((k) => k !== 'now_')) assert.ok(k in ko.deliveryQueue, k);
});
