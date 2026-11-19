// P245: rig 3 역할 줄의 정의서 판·조정 수(tuneBadge)와 조정 기록 줄(tuneLogRows)
import test from 'node:test';
import assert from 'node:assert/strict';
import { roleRows, tuneBadge, tuneLogRows } from '../src/renderer/lib/rig.js';
import en from '../src/renderer/locales/en.js';
import ko from '../src/renderer/locales/ko.js';

test('P245 역할 줄의 정의서 판과 조정 기록', () => {
  const r3 = { roles: [{ name: 'ideas', owns: ['h/'], tools: [], tune: { n: 4, tunes: 2, rollbacks: 1, material: 3, open: true, lines: 2, budget: 20 } }, { name: 'data', owns: ['d/'], tools: [] }] };
  const rows = roleRows(r3);
  assert.deepEqual(tuneBadge(rows[0].tune), { n: 4, tunes: 2, rollbacks: 1, material: 3, open: true, lines: 2, budget: 20 });
  assert.equal(tuneBadge(rows[1].tune), null);
  const info = { versions: [1, 3, 4], log: [
    { id: 1, kind: 'tune', state: 'applied', n: 3, prevN: 1, why: 'a', evidence: ['hypothesis-1'], added: 1, removed: 0 },
    { id: 2, kind: 'tune', state: 'rejected', reason: 'over_budget: x', evidence: [] },
    { id: 3, kind: 'none', state: 'noted', why: 'b' },
    { id: 4, kind: 'rollback', state: 'applied', n: 4, prevN: 3, fromN: 1, added: 0, removed: 1 },
  ] };
  const l = tuneLogRows(info);
  assert.deepEqual(l.map((x) => [x.key, x.undo]), [['rollback', 3], ['none', null], ['rejected', null], ['tune', 1]]);
  assert.deepEqual(tuneLogRows(null), []);
  for (const d of [en, ko]) for (const k of ['col', 'badge', 'material', 'turnOpen', 'head', 'empty', 'noLog', 'evidence', 'undo', 'undone', 'same']) assert.ok(d.rigTune[k], k);
  for (const d of [en, ko]) for (const k of ['tune', 'rejected', 'none', 'raise', 'rollback']) assert.ok(d.rigTune.k[k], k);
});
