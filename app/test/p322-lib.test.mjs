// P322: Claude Code 서브에이전트 칩의 창 쪽(칩 글 "서브 1/3 · 하위 2", 끝 "서브 3/3 끝", 겉판 머리·밑글, 요약의 subs, 사전 두 벌)
import test from 'node:test';
import assert from 'node:assert/strict';
import { sessionProgress, progressChip, progressRows, progressPopText } from '../src/renderer/lib/orch.js';
import ko from '../src/renderer/locales/ko.js';
import en from '../src/renderer/locales/en.js';

const fill = (dict) => (k, v = {}) => { const s = k.split('.').reduce((o, x) => (o ? o[x] : undefined), dict); return String(s).replace(/\{(\w+)\}/g, (m, x) => (v[x] != null ? v[x] : m)); };
const P = (o = {}) => ({ kind: 'subagents', key: 'sub:1', label: null, done: 1, total: 3, running: 2, failed: 0, finished: false, items: [
  { name: '결제 실패 경로 찾기', state: 'running', startedAt: 1000, endedAt: null },
  { name: '환불 시험 목록', state: 'running', startedAt: 2000, endedAt: null },
  { name: '로그 형식 확인', state: 'done', startedAt: 3000, endedAt: 24000 },
], ...o });

test('P322 칩 글: "서브 1/3 · 하위 2", 끝 "서브 3/3 끝", 영어', () => {
  const k = fill(ko), e = fill(en);
  assert.equal(progressChip(P(), k).text, '서브 1/3 · 하위 2');
  assert.equal(progressChip(P(), e).text, 'Sub 1/3 · 2 running');
  assert.equal(progressChip(P({ done: 3, running: 0, finished: true }), k).text, '서브 3/3 끝');
  assert.equal(progressChip(P({ done: 2, total: 2, running: 0, finished: true }), e).text, 'Sub 2/2 done');
  assert.equal(progressChip(P({ done: 3, running: 0, finished: true }), k).short, '서브 3/3 끝');
  assert.match(progressChip(P(), k).title, /이 세션 안의 서브에이전트/);
  assert.match(progressChip(P(), e).title, /inside this session/);
  // P300 칩은 그대로
  assert.equal(progressChip(P({ kind: 'dag' }), k).text, 'DAG 1/3 · 하위 2');
  assert.match(progressChip(P({ kind: 'dag' }), k).title, /하네스 안의 진행/);
});

test('P322 겉판: 머리 "서브에이전트 · 이번 턴", 밑글은 보드 세션이 아님, P300 겉판은 그대로', () => {
  const k = fill(ko), e = fill(en);
  assert.deepEqual(progressPopText(P(), k), { head: '서브에이전트', label: '이번 턴', note: '이 세션 안의 서브에이전트입니다. 보드 세션이 아니라 고르거나 메시지를 보낼 수 없습니다.' });
  assert.equal(progressPopText(P(), e).head, 'Subagents');
  assert.equal(progressPopText(P({ kind: 'dag', label: 'textkit' }), k).head, '안 진행');
  assert.equal(progressPopText(P({ kind: 'dag', label: 'textkit' }), k).label, 'textkit');
  const rows = progressRows(P(), k, 73000);
  assert.deepEqual(rows.map((x) => [x.name, x.stateText, x.dur]), [['결제 실패 경로 찾기', '도는 중', '1m 12s'], ['환불 시험 목록', '도는 중', '1m 11s'], ['로그 형식 확인', '끝', '21s']]);
  assert.equal(progressRows(P({ items: [{ name: 'x', state: 'cancelled', startedAt: 1, endedAt: 2001 }] }), k)[0].stateText, '취소');
});

test('P322 요약의 진행: 보통 세션은 subs, 오케스트레이션 세션은 orch.progress만', () => {
  assert.equal(sessionProgress({ subs: P() }).kind, 'subagents');
  assert.equal(sessionProgress({ subs: null }), null);
  assert.equal(sessionProgress({ subs: { total: 0, items: [] } }), null);
  assert.equal(sessionProgress({ orch: { on: true, progress: P({ kind: 'dag' }) }, subs: P() }).kind, 'dag');
  assert.equal(sessionProgress({ orch: { on: true, progress: null }, subs: P() }), null, '오케스트레이션 세션에 subs가 와도 보이지 않는다');
});

test('P322 사전: 두 벌 모두 같은 칸', () => {
  assert.deepEqual(Object.keys(ko.p322).sort(), Object.keys(en.p322).sort());
  for (const k of ['sub', 'list', 'turn', 'readOnly', 'note']) { assert.ok(ko.p322[k]); assert.ok(en.p322[k]); }
});
