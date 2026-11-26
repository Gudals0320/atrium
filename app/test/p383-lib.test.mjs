// P383: 창·휴대폰의 스티어링 판단(lib/steer.js)이 OmO를 받는 세션으로 본다(백엔드 delivery.mjs steerBlock과 같다). Hermes 등은 그대로 막힌다
import test from 'node:test';
import assert from 'node:assert/strict';
import { steerBlock, steerTargets, steerParam, STEER_ORCH_KINDS } from '../src/renderer/lib/steer.js';
import { sendPlan } from '../src/renderer/lib/phone.js';
import { steerBlock as backendSteer } from '../../backend/src/delivery.mjs';

const omo = { name: 'o1', kind: 'omo', hooked: false, state: 'working', orch: { on: true } };
const hermes = { name: 'h1', kind: 'hermes', hooked: false, state: 'working', orch: { on: true } };
const claudeOrch = { name: 'c1', kind: 'claude', state: 'working', orch: { on: true } };

test('P383 steerBlock: OmO는 받고(자체 오케스트레이션이어도), Hermes·claude 위 오케스트레이션은 막힌다', () => {
  assert.ok(STEER_ORCH_KINDS.has('omo'));
  assert.equal(steerBlock(omo), null);
  assert.equal(steerBlock({ ...omo, orch: undefined }), null);
  assert.equal(steerBlock(hermes), 'orchestrates');
  assert.equal(steerBlock(claudeOrch), 'orchestrates');
  assert.equal(steerBlock({ kind: 'opencode' }), 'kind');
});

test('P383 불변식: 창의 판단은 백엔드 steerBlock과 늘 같다(종류 × 오케스트레이션 × hook)', () => {
  for (const kind of ['claude', 'codex', 'omo', 'hermes', 'pi', 'opencode', 'dsh', 'agy'])
    for (const orch of [undefined, { on: true }, { on: false }])
      for (const hooked of [true, false]) {
        const s = { kind, orch, hooked };
        assert.equal(steerBlock(s), backendSteer(s, hooked), JSON.stringify(s));
      }
});

test('P383 보내기 칸·휴대폰: OmO에 스티어링을 고르면 steer를 싣는다, Hermes는 대기열(steer 없이)', () => {
  const t = steerTargets([{ name: 'o1', state: 'agent' }, { name: 'h1', state: 'agent' }], [omo, hermes]);
  assert.deepEqual(t.can, ['o1']);
  assert.deepEqual(t.cannot, [{ name: 'h1', why: 'orchestrates' }]);
  assert.deepEqual(steerParam(true, t), { steer: true });
  assert.equal(sendPlan(omo, 'hi', { steer: true }).steer, true);
  assert.ok(!('steer' in sendPlan(hermes, 'hi', { steer: true })));
});
