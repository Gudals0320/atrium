// P247: rig 판의 빌더 보기(builderInfo)와 사전
import test from 'node:test';
import assert from 'node:assert/strict';
import { builderInfo } from '../src/renderer/lib/rig.js';
import en from '../src/renderer/locales/en.js';
import ko from '../src/renderer/locales/ko.js';

test('P247 빌더 보기: rig 3이나 rig 없는 워크스페이스에서만 말하기, 세션 상태는 창의 목록이 이긴다', () => {
  assert.deepEqual(builderInfo(null), { session: null, canTalk: false });
  assert.equal(builderInfo({ status: 'none', builder3: { session: null } }).canTalk, true);
  assert.equal(builderInfo({ status: 'off', format: 2 }).canTalk, false, 'rig 2 정의');
  const st = { status: 'on', format: 3, rig3: { builder: { session: { sessionId: 's1', name: 'builder', state: 'ready', asleep: false } } } };
  assert.deepEqual(builderInfo(st).session, { sessionId: 's1', name: 'builder', stateKey: 'ready' });
  assert.equal(builderInfo(st, new Map([['s1', { state: 'working' }]])).session.stateKey, 'working');
  assert.equal(builderInfo({ status: 'none', builder3: { session: { sessionId: 's2', name: 'builder-2', asleep: true } } }).session.stateKey, 'sleeping');
  for (const d of [ko, en]) for (const k of ['h', 'menu', 'talk', 'none', 'hint', 'placeholder', 'send', 'open', 'spawned', 'opened']) assert.ok(d.rigBuilder[k], k);
  assert.deepEqual(Object.keys(ko.rigBuilder).sort(), Object.keys(en.rigBuilder).sort());
});
