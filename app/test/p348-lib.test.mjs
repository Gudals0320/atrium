// P348 창 단위 시험: 메모리 알약 펼침 세션 목록 차례, 곧바로 배지 글, 설정 칸 자리, 사전 열쇠.
import test from 'node:test';
import assert from 'node:assert/strict';
import { resOrder, badgeParts, whyParts } from '../src/renderer/lib/guard.js';
import { navOf, pagesOf, searchItems, rowState } from '../src/renderer/lib/settings-nav.js';
import ko from '../src/renderer/locales/ko.js';
import en from '../src/renderer/locales/en.js';

const lookup = (dict) => (k, v = {}) => { const s = k.split('.').reduce((o, p) => (o && typeof o === 'object' ? o[p] : undefined), dict); return typeof s === 'string' ? s.replace(/\{(\w+)\}/g, (_, x) => String(v[x] ?? '')) : k; };

test('세션 목록 차례: 폭주 의심 → 무거움 → 나머지, 그 안에서 CPU 큰 순 → 메모리 큰 순, 잠든·메모리 없는 줄은 뺀다', () => {
  const rows = [
    { sessionId: 'a', name: 'a', cpuPct: 1, memMB: 900 },
    { sessionId: 'b', name: 'b', cpuPct: 20, memMB: 100 },
    { sessionId: 'c', name: 'c', cpuPct: 0.5, memMB: 300, guard: { kind: 'heavy' } },
    { sessionId: 'd', name: 'd', cpuPct: 0.1, memMB: 50, guard: { kind: 'suspect', paused: { at: 1 } } },
    { sessionId: 'e', name: 'e', cpuPct: 1, memMB: 1200 },
    { sessionId: 'f', name: 'f', cpuPct: null, memMB: 400 },
    { sessionId: 'z', name: 'z', cpuPct: 50, memMB: 0 },
    { sessionId: 's', name: 's', cpuPct: 50, memMB: 500 },
  ];
  const sessions = new Map([['s', { state: 'sleeping' }]]);
  assert.deepEqual(resOrder(rows, sessions).map((x) => x.sessionId), ['d', 'c', 'b', 'e', 'a', 'f']);
  assert.deepEqual(resOrder(null), []);
  assert.equal(rows[0].sessionId, 'a'); // 제자리 정렬 아님
});

test('곧바로 배지 글: CPU는 "지금", 메모리는 그대로', () => {
  assert.deepEqual(badgeParts({ reasons: [{ type: 'cpu', pct: 210, ms: 5000, instant: true }] }), [{ key: 'p348.badgeCpuNow', vars: { pct: 210 } }]);
  assert.deepEqual(badgeParts({ reasons: [{ type: 'mem', memMB: 7000, instant: true }] }).map((p) => p.key), ['guard.badge.mem']);
  assert.deepEqual(whyParts({ reasons: [{ type: 'cpu', pct: 210, instant: true }] }), [{ key: 'p348.whyCpuNow', vars: { pct: 210 } }]);
  assert.equal(lookup(ko)('p348.badgeCpuNow', { pct: 210 }), 'CPU 210% 지금');
  assert.equal(lookup(en)('p348.badgeCpuNow', { pct: 210 }), 'CPU 210% now');
});

test('설정: 곧바로 표시 배수는 자원 쪽 폭주 감지의 딸린 칸, 찾기에 걸린다', () => {
  const st = { sleepAfterMin: 30, guardDetect: true, guardLowerPriority: true, guardInstantX: 2 };
  assert.deepEqual(rowState('guardInstantX', { guardDetect: false }), { child: true, dim: true });
  const pages = pagesOf(navOf(st, { launchers: [] }, false));
  assert.equal(searchItems('곧바로', lookup(ko), pages)[0].id, 'guardInstantX');
  assert.equal(searchItems('at once', lookup(en), pages)[0].id, 'guardInstantX');
});

test('사전: p348 열쇠가 두 언어에 같고, 자리 표시도 같다', () => {
  const keys = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v, p + k + '.') : [p + k]));
  assert.deepEqual(keys(ko.p348).sort(), keys(en.p348).sort());
  for (const k of keys(en.p348)) {
    const ph = (s) => (s.match(/\{\w+\}/g) || []).sort().join();
    assert.equal(ph(lookup(ko)('p348.' + k)), ph(lookup(en)('p348.' + k)), k);
  }
});
