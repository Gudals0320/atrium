// P241 창 단위 시험: rig 3 판의 보기 자료(역할 줄, 길 줄, 켜기), 두 사전의 rig3 글
import test from 'node:test';
import assert from 'node:assert/strict';
import { isRig3, roleRows, flowRows, roleCount, canEnable3 } from '../src/renderer/lib/rig3.js';
import ko from '../src/renderer/locales/ko.js';
import en from '../src/renderer/locales/en.js';

const R3 = {
  purpose: '.atrium/purpose.md',
  roles: [
    { name: 'data', owns: ['data/'], tools: ['fetch'], launcher: 'claude', model: 'haiku', session: { name: 'data', state: 'ready', asleep: false } },
    { name: 'ideas', owns: ['hypotheses/'], tools: [], session: { name: 'ideas', state: 'ready', asleep: true } },
    { name: 'trade', owns: ['trading/'], tools: [], session: null, gaveUp: true, docMissing: ['요령'] },
    { name: 'verify', owns: ['verify/'], tools: [], session: null },
  ],
  flows: [{ item: 'snapshot', from: ['data'], to: ['ideas'] }, { item: 'hint', from: ['human'], to: ['ideas'] }, { item: 'result', from: ['verify'], to: ['ideas'], for: 'hypothesis' }],
};

test('P241 rig 3 판: 역할 줄의 상태(세션 상태, 잠듦, 다시 띄우기 멈춤, 세션 없음)와 길 줄', () => {
  assert.equal(isRig3({ format: 3 }), true); assert.equal(isRig3({ format: 2 }), false); assert.equal(isRig3(null), false);
  const rows = roleRows(R3);
  assert.deepEqual(rows.map((r) => [r.name, r.stateKey]), [['data', 'ready'], ['ideas', 'sleeping'], ['trade', 'gaveUp'], ['verify', 'none']]);
  assert.deepEqual(rows[2].docMissing, ['요령']);
  // 창의 세션 목록이 있으면 그 상태가 이긴다
  const live = new Map([['s1', { state: 'working' }], ['s2', { state: 'ready' }]]);
  const R = { roles: [{ name: 'a', owns: [], session: { sessionId: 's1', name: 'a', state: 'ready' } }, { name: 'b', owns: [], session: { sessionId: 's2', name: 'b', state: 'sleeping', asleep: true } }] };
  assert.deepEqual(roleRows(R, live).map((r) => r.stateKey), ['working', 'ready']);
  const f = flowRows(R3);
  assert.equal(f[1].human, true); assert.equal(f[2].for, 'hypothesis');
  assert.equal(roleCount({ rig3: R3 }), 4);
  assert.equal(canEnable3({ status: 'off' }), true);
  assert.equal(canEnable3({ status: 'off' }, { remote: true }), false);
  assert.equal(canEnable3({ status: 'on' }), false);
  assert.equal(canEnable3({ status: 'off', why: '잘못됨' }), false);
});

test('P241 사전: rig3 글이 두 사전에 같은 열쇠로 있다', () => {
  assert.deepEqual(Object.keys(ko.rig3).sort(), Object.keys(en.rig3).sort());
  assert.match(ko.rig3.confirmLine, /역할 \{n\}개가 무인으로 돌고, 각자 쥔 섹터에만 쓰며, 도구는 판이 돌립니다/);
  for (const k of ['ready', 'working', 'sleeping']) assert.ok(ko.state[k] && en.state[k], k);
});
