// P356: 휴대폰 맵 탭의 가벼운 구조 답(phone.mjs mapOf·mapKeyOf·phone.map)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapOf, mapKeyOf, phoneHandlers, rowOf, MAP_TEXT_MAX } from '../src/phone.mjs';
import { missionGraph } from '../src/mission.mjs';

const long = (n) => 'x'.repeat(n);
// 판 요약 흉내(60개, 큰 칸 포함)
function sum(i, over = {}) {
  return {
    sessionId: 'id-' + String(i).padStart(4, '0') + '-aaaaaaaa-bbbb-cccc-dddddddddddd', name: 'session-' + i, workspaceKey: 'c:/w/ws' + (i % 5), kind: i % 4 ? 'claude' : 'shell', state: i % 3 ? 'sleeping' : 'working',
    createdAt: 1e12 + i, lastActivityAt: 1e12 + i * 10, lastAnswer: long(2000), lastPrompt: long(2000), parentSessionId: i > 5 && i % 2 ? 'id-0001-aaaaaaaa-bbbb-cccc-dddddddddddd' : null, lineageParentSessionId: i > 5 && i % 2 ? 'id-0001-aaaaaaaa-bbbb-cccc-dddddddddddd' : null,
    model: 'claude-haiku-5-5', effort: 'high', git: { isRepo: true, isWorktree: true, branch: 'worktree-p' + i }, turn: { startedAt: 5 }, ask: i === 3 ? { kind: 'permission', summary: long(500) } : null,
    branch: i > 5 && i % 2 ? { child: true, role: 'worker', order: i, depth: 2 } : null, background: i === 7 ? { n: 2, kinds: ['shell'], items: [{ kind: 'shell', label: long(300) }] } : null, ...over,
  };
}
const sums = Array.from({ length: 60 }, (_, i) => sum(i));
const links = sums.filter((s) => s.parentSessionId).map((s) => ({ from: s.parentSessionId, to: s.sessionId, linkId: 'l' + s.name, spawned: true, role: 'worker', observed: true, lastText: long(500), count: 3, lastAt: 9 }));
const graph = missionGraph({ sessions: sums, links, thread: [{ itemId: 'i1', t: 1, text: long(300), results: [{ sessionId: sums[0].sessionId, phase: 'done' }] }], loops: [] });

test('맵 답: 세션 노드만, 자주 바뀌는 값(상태·분류·시각·질문·오류)은 없다, 지시는 120자', () => {
  const m = mapOf(graph, [{ id: 'g1', name: 'Folder', members: ['c:/w/ws1'], auto: true, root: 'c:/w' }]);
  assert.equal(m.nodes.length, 60);
  for (const n of m.nodes) {
    for (const k of ['state', 'category', 'activeAt', 'turnAt', 'ask', 'error', 'since', 'column', 'directs', 'depth', 'name', 'workspaceKey', 'id']) assert.ok(!(k in n), k);
    assert.ok(!n.lastPrompt || n.lastPrompt.length <= MAP_TEXT_MAX + 1);
  }
  const bg = m.nodes.find((n) => n.bg);
  assert.deepEqual(bg.bg, { n: 2, kinds: ['shell'] }, '뒤 일은 수와 종류만');
  const kid = m.nodes.find((n) => n.p !== undefined);
  assert.equal(m.nodes[kid.p].s, 'id-0001-aaaaaaaa-bbbb-cccc-dddddddddddd', '일 부모는 nodes 차례 번호');
  assert.ok(m.nodes.find((n) => n.role && n.order), '역할·차례');
  assert.ok(m.nodes.every((n) => !('model' in n) && !('effort' in n) && !('gitBranch' in n)), '모델·노력 수준·브랜치는 줄에서');
  assert.deepEqual(m.groups, [{ id: 'g1', name: 'Folder', members: ['c:/w/ws1'] }], '폴더는 이름과 구성만');
});

test('맵 답: 사람·루프 선과 선의 횟수·시각·지시 글은 없다, 역할 이름은 역할 선에만', () => {
  const m = mapOf(graph);
  assert.ok(m.edges.length > 0);
  assert.ok(m.edges.every((e) => Number.isInteger(e.f) && Number.isInteger(e.t)), '세션끼리만(차례 번호)');
  assert.ok(m.edges.every((e) => !('count' in e) && !('lastAt' in e) && !('active' in e) && !('id' in e)));
  assert.ok(m.edges.filter((e) => e.label).every((e) => e.k === 'role'));
  assert.ok(!m.edges.some((e) => e.k === 'bar' || e.k === 'loop'));
});

test('맵 답 크기: 세션 60개(긴 지시·워크트리 브랜치·하위 선)에 mission.graph의 4분의 1 아래, 20KB 아래', () => {
  const full = JSON.stringify(graph).length;
  const small = JSON.stringify(mapOf(graph)).length;
  assert.ok(small < 20000, String(small));
  assert.ok(small * 4 < full, small + ' / ' + full);
});

test('맵 열쇠: 상태·활동·이름(줄에서 덧입힘)만 바뀌면 같고, 구조(부모)가 바뀌면 다르다', () => {
  const k0 = mapKeyOf(mapOf(graph));
  const g1 = missionGraph({ sessions: sums.map((s) => ({ ...s, state: 'ready', lastActivityAt: 7, turn: null, ask: null })), links, thread: [], loops: [] });
  assert.equal(mapKeyOf(mapOf(g1)), k0, '상태·시각·사람 선만 다름');
  const g1b = missionGraph({ sessions: sums.map((s, i) => (i === 9 ? { ...s, name: 'renamed' } : s)), links, thread: [], loops: [] });
  assert.equal(mapKeyOf(mapOf(g1b)), k0, '이름은 줄에서');
  const g2 = missionGraph({ sessions: sums.map((s, i) => (i === 8 ? { ...s, parentSessionId: sums[2].sessionId, lineageParentSessionId: sums[2].sessionId } : s)), links, thread: [], loops: [] });
  assert.notEqual(mapKeyOf(mapOf(g2)), k0);
});

test('phone.map: 처음은 모두, 같은 열쇠를 주면 same만', () => {
  const b = { api: { handlers: { 'mission.graph': () => graph } }, store: { getMeta: () => null, workspaces: () => [] }, workspaceList: () => [] };
  const h = phoneHandlers(b);
  const r1 = h['phone.map']({});
  assert.ok(r1.key && r1.nodes.length === 60);
  const r2 = h['phone.map']({ key: r1.key });
  assert.deepEqual(r2, { key: r1.key, same: true });
  assert.ok(JSON.stringify(r2).length < 60);
});

test('휴대폰 줄: 일하는 세션은 일 시작 시각(맵 카드의 일한 시간)', () => {
  assert.equal(rowOf(sum(0)).turnAt, 5);
  assert.equal(rowOf(sum(0)).effort, 'high');
  assert.ok(!('turnAt' in rowOf(sum(1))));
});
