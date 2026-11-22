// P268 단위 시험: 합치기 merger의 창 쪽 자료(lib/merger.js). 설정 칸 값, 묻는 카드 보이기·답하기·한 번만, 하위 → merger 선 자료.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MERGER_MODES, MERGER_DEFAULTS, mergerSettingsOf, mergerValueOf, mergerViewOf, askCards, askKey, withAsk, withoutAsk, mergerSessionIds, mergerLines, pendingMerges } from '../src/renderer/lib/merger.js';
import en from '../src/renderer/locales/en.js';
import ko from '../src/renderer/locales/ko.js';

test('설정 칸: 판에 키가 없으면(옛 판) null, 있으면 넷을 기본으로 채운다', () => {
  assert.equal(mergerSettingsOf(null), null);
  assert.equal(mergerSettingsOf({ tray: true }), null);
  assert.deepEqual(mergerSettingsOf({ mergerMode: 'on' }), { ...MERGER_DEFAULTS, mergerMode: 'on' });
  assert.deepEqual(mergerSettingsOf({ mergerMode: 'ask', mergerKind: 'codex', mergerModel: 'gpt-x', mergerEffort: '' }), { mergerMode: 'ask', mergerKind: 'codex', mergerModel: 'gpt-x', mergerEffort: '', mergerPermission: '' }); // P287: 승인 방식 칸(기본 빈 값)
  assert.equal(mergerSettingsOf({ mergerMode: 'weird', mergerEffort: 'ultra' }).mergerMode, 'ask');
  assert.equal(mergerSettingsOf({ mergerMode: 'weird', mergerEffort: 'ultra' }).mergerEffort, 'medium');
  assert.deepEqual(MERGER_MODES, ['on', 'ask', 'off']);
  assert.equal(MERGER_DEFAULTS.mergerMode, 'ask');
});

test('설정 칸: 보낼 값은 판의 schema와 같은 꼴만, 빈 칸은 기본', () => {
  assert.deepEqual(mergerValueOf('mergerMode', 'off'), { value: 'off' });
  assert.ok(mergerValueOf('mergerMode', 'maybe').error);
  assert.deepEqual(mergerValueOf('mergerEffort', ''), { value: '' });
  assert.deepEqual(mergerValueOf('mergerEffort', 'high'), { value: 'high' });
  assert.ok(mergerValueOf('mergerEffort', 'huge').error);
  assert.deepEqual(mergerValueOf('mergerKind', ' Claude '), { value: 'claude' });
  assert.deepEqual(mergerValueOf('mergerKind', ''), { value: 'claude' });
  assert.ok(mergerValueOf('mergerKind', 'bad kind').error);
  assert.deepEqual(mergerValueOf('mergerModel', 'claude-sonnet-5-5'), { value: 'claude-sonnet-5-5' });
  assert.deepEqual(mergerValueOf('mergerModel', 'opus[1m]'), { value: 'opus[1m]' });
  assert.deepEqual(mergerValueOf('mergerModel', ''), { value: 'claude-sonnet-5-5' });
  assert.ok(mergerValueOf('mergerModel', 'a b').error);
  assert.ok(mergerValueOf('other', 'x').error);
});

const card = (ws, at, extra = {}) => ({ workspace: ws, workspaceName: ws.toUpperCase(), root: 'C:/r/' + ws, at, child: 'w1', branch: 'worktree-w1', target: 'dev', ...extra });

test('묻는 카드: 보이기(오래된 것부터), 나중에로 닫은 것은 뺀다, 옛 판·빈 값', () => {
  assert.deepEqual(askCards(null), []);
  const v = mergerViewOf({ mode: 'ask', asks: [card('b', 20), card('a', 10), { at: 5 }] });
  assert.deepEqual(askCards(v).map((x) => x.workspace), ['a', 'b']);
  assert.deepEqual(askCards(v, new Set([askKey(card('a', 10))])).map((x) => x.workspace), ['b']);
  assert.equal(askKey(card('a', 10)), 'a|10');
  const empty = mergerViewOf(undefined);
  assert.deepEqual(empty.asks, []); assert.deepEqual(empty.jobs, []); assert.equal(empty.jobsMax, 5);
});

test('묻는 카드: 워크스페이스마다 하나(이벤트가 두 번 와도), 답하면 사라진다', () => {
  let v = withAsk(null, card('a', 10));
  v = withAsk(v, card('a', 11, { child: 'w2' }));
  v = withAsk(v, card('b', 12));
  v = withAsk(v, { at: 1 }); // 워크스페이스 없는 값은 무시
  assert.equal(v.asks.length, 2);
  assert.equal(v.asks.find((x) => x.workspace === 'a').child, 'w2');
  v = withoutAsk(v, 'a');
  assert.deepEqual(askCards(v).map((x) => x.workspace), ['b']);
  assert.deepEqual(askCards(withoutAsk(v, 'b')), []);
});

const job = (o) => ({ unit: 1, state: 'queued', workspace: 'a', target: 'dev', branch: 'worktree-w1', child: 'w1', childId: 'c1', mergerId: 'm1', merger: 'merger-a-dev', createdAt: 1, ...o });

test('선 자료: 열린 합치기 일의 childId → mergerId, 한 쌍에 하나, 보이지 않는 끝·띄우는 중·취소는 뺀다', () => {
  const v = mergerViewOf({ jobs: [
    job({ unit: 1, state: 'queued', createdAt: 1 }),
    job({ unit: 2, state: 'merging', createdAt: 2 }),
    job({ unit: 3, childId: 'c2', child: 'w2', branch: 'worktree-w2', state: 'failed' }),
    job({ unit: 4, childId: 'c3', mergerId: null }),
    job({ unit: 5, childId: 'c4', state: 'cancelled' }),
    job({ unit: 6, childId: 'c5' }),
  ] });
  const lines = mergerLines(v, (id) => id !== 'c5');
  assert.equal(lines.length, 2);
  const a = lines.find((l) => l.source === 'c1');
  assert.deepEqual({ id: a.id, target: a.target, state: a.state, unit: a.unit, n: a.n, branch: a.branch, to: a.target_branch }, { id: 'merge:c1>m1', target: 'm1', state: 'merging', unit: 2, n: 2, branch: 'worktree-w1', to: 'dev' });
  assert.equal(lines.find((l) => l.source === 'c2').state, 'failed');
  assert.deepEqual(mergerLines(null), []);
  assert.deepEqual([...pendingMerges(v)], [['a', 1]]);
});

test('꼬리표: 열린 merger 세션만', () => {
  const v = mergerViewOf({ mergers: [{ key: 'k1', sessionId: 'm1', open: true, target: 'dev', jobs: 2, jobsMax: 5 }, { key: 'k2', sessionId: null, open: false }, { key: 'k3', sessionId: 'm3', open: false }] });
  const ids = mergerSessionIds(v);
  assert.deepEqual([...ids.keys()], ['m1']);
  assert.equal(ids.get('m1').jobs, 2);
  assert.equal(mergerSessionIds(null).size, 0);
});

test('사전: en·ko 둘 다 같은 merger 낱말(카드 글은 계약의 제안 그대로)', () => {
  const keys = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v, p + k + '.') : [p + k])).sort();
  assert.deepEqual(keys(en.merger), keys(ko.merger));
  assert.equal(ko.merger.card.title, '이 프로젝트에서 병합을 merger에게 맡길까요?');
  assert.equal(en.merger.card.title, 'Let a merger session merge branch work in this project?');
  assert.match(ko.merger.card.body, /@\{child\}가 \{branch\}에서/);
  assert.match(en.merger.card.body, /\{target\}/);
  for (const m of MERGER_MODES) { assert.ok(en.merger.modes[m]); assert.ok(ko.merger.modes[m]); }
});
