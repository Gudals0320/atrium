// P379: 휴대폰 줄(rowOf)이 자체 오케스트레이션을 싣는다(휴대폰 steerBlock이 'orchestrates'를 보고 스티어링 단추를 흐리게 둔다)
import test from 'node:test';
import assert from 'node:assert/strict';
import { rowOf, PhoneFeed } from '../src/phone.mjs';
import { steerBlock } from '../src/delivery.mjs';

const sum = (o = {}) => ({ sessionId: 's1', name: 'a', kind: 'omo', state: 'working', ...o });

test('P379 rowOf: orch.on이면 orch { on: true }, 아니면 칸이 없다(줄이 커지지 않는다)', () => {
  assert.deepEqual(rowOf(sum({ orch: { on: true, via: 'kind', scope: 'free', allowed: ['help'], inner: { busy: true, why: ['proctree'] } } })).orch, { on: true });
  assert.ok(!('orch' in rowOf(sum())));
  assert.ok(!('orch' in rowOf(sum({ orch: null }))));
  assert.ok(!('orch' in rowOf(sum({ kind: 'claude', orch: { on: false } }))));
});

test('P379 휴대폰 줄의 판단이 백엔드 steerBlock과 같다(자체 오케스트레이션은 대기열만)', () => {
  const r = rowOf(sum({ kind: 'hermes', orch: { on: true } })); // P383: OmO는 스티어링을 받으므로 막히는 예는 Hermes
  assert.equal(steerBlock(r), 'orchestrates');
  assert.equal(steerBlock(rowOf(sum({ orch: { on: true } }))), null, 'P383: OmO는 자체 오케스트레이션이어도 받는다');
  assert.equal(steerBlock(rowOf(sum({ kind: 'claude', hooked: true, orch: { on: true } }))), 'orchestrates');
});

test('P379 PhoneFeed: orch가 켜지면 줄이 바뀐 것으로 보낸다', () => {
  const f = new PhoneFeed({ boot: 'b' });
  assert.ok(f.touch(sum({ kind: 'claude' })));
  assert.ok(f.touch(sum({ kind: 'claude', orch: { on: true } })), 'orch가 생기면 새 줄');
  assert.equal(f.touch(sum({ kind: 'claude', orch: { on: true, inner: { busy: true } } })), null, '안의 바쁨만 바뀌면 줄은 그대로');
});
