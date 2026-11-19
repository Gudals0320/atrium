// P244: rig 3 사이클 보기 자료(지금 사이클, 다음 박자, every 도구, 최근 꼭지)와 사전 두 벌
import test from 'node:test';
import assert from 'node:assert/strict';
import { cycleInfo, entryParts } from '../src/renderer/lib/rig.js';
import en from '../src/renderer/locales/en.js';
import ko from '../src/renderer/locales/ko.js';

test('P244 사이클 보기와 꼭지 나누기', () => {
  const r3 = { cycle: { n: 3, openedAt: 10, nextAt: 70, beat: { every: '1m', at: null, role: 'data' }, writing: [2], changelog: '.atrium/CHANGELOG.md',
    tools: [{ name: 'fetch', every: '5m', nextAt: 300, running: false }, { name: 'think', every: null }],
    entries: [{ n: 2, by: 'ai', at: 60, text: '## 사이클 2 · 2026-11-19 10:00 ~ 10:01\n\n**돈 것**\n- a' }] } };
  const c = cycleInfo(r3);
  assert.equal(c.n, 3); assert.equal(c.nextAt, 70); assert.deepEqual(c.writing, [2]);
  assert.deepEqual(c.tools, [{ name: 'fetch', every: '5m', nextAt: 300, running: false }]);
  assert.deepEqual(c.entries[0], { n: 2, by: 'ai', at: 60, title: '사이클 2 · 2026-11-19 10:00 ~ 10:01', body: '**돈 것**\n- a' });
  assert.equal(cycleInfo({}), null); assert.equal(cycleInfo(null), null);
  assert.deepEqual(entryParts('## x'), { title: 'x', body: '' });
  assert.deepEqual(Object.keys(en.rigCycle).sort(), Object.keys(ko.rigCycle).sort());
});
