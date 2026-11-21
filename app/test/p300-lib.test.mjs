// P300: 안 진행 칩의 창 쪽(칩 글, 갈래 목록 줄, 걸린 시간, 사전 두 벌)
import test from 'node:test';
import assert from 'node:assert/strict';
import { sessionProgress, progressChip, progressRows, durText } from '../src/renderer/lib/orch.js';
import ko from '../src/renderer/locales/ko.js';
import en from '../src/renderer/locales/en.js';

const fill = (dict) => (k, v = {}) => { const s = k.split('.').reduce((o, x) => (o ? o[x] : undefined), dict); return String(s).replace(/\{(\w+)\}/g, (m, x) => (v[x] != null ? v[x] : m)); };
const P = (o = {}) => ({ kind: 'dag', key: 'dag:r', label: 'textkit', done: 2, total: 3, running: 1, failed: 0, finished: false, items: [
  { name: 'slug', state: 'done', startedAt: 1000, endedAt: 63000 },
  { name: 'count', state: 'done', startedAt: 1000, endedAt: 4000 },
  { name: 'wrap', state: 'running', startedAt: 10000, endedAt: null },
], ...o });

test('P300 칩 글: 도는 중 "DAG 2/3 · 하위 1", 실패 표시, 끝 "3/3 끝", 위임은 하위', () => {
  const k = fill(ko), e = fill(en);
  assert.equal(progressChip(P(), k).text, 'DAG 2/3 · 하위 1');
  assert.equal(progressChip(P(), e).text, 'DAG 2/3 · 1 running');
  assert.equal(progressChip(P({ failed: 1 }), k).text, 'DAG 2/3 · 하위 1 · 실패 1');
  assert.equal(progressChip(P({ failed: 1 }), k).failed, true);
  assert.equal(progressChip(P({ done: 3, running: 0, finished: true }), k).text, 'DAG 3/3 끝');
  assert.equal(progressChip(P({ done: 3, running: 0, finished: true }), e).text, 'DAG 3/3 done');
  assert.equal(progressChip(P({ kind: 'delegations', running: 2, done: 0 }), k).text, '위임 0/3 · 하위 2');
  assert.equal(progressChip(P({ kind: 'delegations', running: 2, done: 0 }), e).text, 'Tasks 0/3 · 2 running');
  assert.match(progressChip(P(), k).title, /읽기 전용/);
  assert.equal(progressChip(null, k), null);
});

test('P300 갈래 목록 줄: 이름·상태·걸린 시간(도는 갈래는 지금까지)', () => {
  const k = fill(ko);
  const rows = progressRows(P(), k, 70000);
  assert.deepEqual(rows.map((x) => [x.name, x.stateText, x.dur]), [['slug', '끝', '1m 2s'], ['count', '끝', '3s'], ['wrap', '도는 중', '1m 0s']]);
  assert.equal(durText(3 * 3600e3 + 5 * 60e3), '3h 5m');
  assert.equal(durText(NaN), '');
});

test('P300 세션 요약의 진행: 오케스트레이션 세션만, 빈 것은 없음', () => {
  assert.equal(sessionProgress({ orch: { on: true, progress: P() } }).done, 2);
  assert.equal(sessionProgress({ orch: { on: true, progress: null } }), null);
  assert.equal(sessionProgress({ orch: { on: true, progress: { total: 0, items: [] } } }), null);
  assert.equal(sessionProgress({}), null);
});

test('P300 사전: 두 벌 모두 같은 칸', () => {
  const keys = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v, p + k + '.') : [p + k]));
  assert.deepEqual(keys(ko.progress).sort(), keys(en.progress).sort());
  for (const s of ['pending', 'running', 'done', 'failed', 'cancelled']) { assert.ok(ko.progress.state[s]); assert.ok(en.progress.state[s]); }
});
