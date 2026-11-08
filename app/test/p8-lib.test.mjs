// P8(K4) 창 쪽 순수 규칙 시험: 하위 세션 머리줄 글, 사이드바·미션 맵의 나무 순서와 들여 쓰기
import test from 'node:test';
import assert from 'node:assert/strict';
import { branchLabel, treeOrder } from '../src/renderer/lib/branch.js';
import { missionLayout } from '../src/renderer/lib/mission-layout.js'; // P32: 나무 배치
import { setLanguage } from '../src/renderer/lib/i18n.js';

test('K4: 머리줄 — atrium child로 만든 하위 세션만 "@부모의 역할 · n단계"', () => {
  setLanguage('ko'); // P16: 한국어 글을 본다(기본은 영어)
  try {
    assert.equal(branchLabel({ branch: { child: true, parentName: 'lead', role: '워커', depth: 2, parentOpen: true } }).text, '@lead의 워커 · 2단계');
    assert.match(branchLabel({ branch: { child: true, parentName: null, role: '리뷰어', depth: 3, parentOpen: false } }).text, /리뷰어 \(상위 세션 닫힘\) · 3단계/);
  } finally { setLanguage('en'); }
  assert.equal(branchLabel({ branch: { child: false, depth: 2, parentName: 'lead' } }), null); // 판에 올린 에이전트는 지금 표시 그대로
  assert.equal(branchLabel({}), null);
});

test('K4: 나무 순서 — 부모 바로 아래에 자식(형제는 주어진 순서), 부모가 목록에 없으면 뿌리, 고리도 빠지지 않는다', () => {
  const S = (id, p, t) => ({ sessionId: id, parentSessionId: p, t });
  const list = [S('w2', 'lead', 3), S('lead', null, 1), S('g1', 'w1', 4), S('other', null, 2), S('w1', 'lead', 5), S('lost', 'gone', 6), S('x', 'y', 7), S('y', 'x', 8)];
  const out = treeOrder(list, { cmp: (a, b) => a.t - b.t });
  assert.deepEqual(out.map((o) => `${o.item.sessionId}:${o.indent}`), ['lead:0', 'w2:1', 'w1:1', 'g1:2', 'other:0', 'lost:0', 'x:0', 'y:1']);
});

test('K4: 미션 맵(P32 나무) — 하위 세션은 부모 오른쪽 열에, 형제는 위아래로 쌓이고 부모는 그 옆', () => {
  const sess = (id, name, depth, parentId, category = 'idle') => ({ id, kind: 'session', name, depth, parentId, category });
  const graph = { nodes: [{ id: 'human', kind: 'human', column: 0 }, sess('s:b', 'b-lead', 1, null), sess('s:a', 'a-lead', 1, null), sess('s:bw', 'zz', 2, 's:b'), sess('s:aw', 'yy', 2, 's:a'), sess('s:aw2', 'yz', 2, 's:a'), sess('s:solo', 'aaa', 1, null, 'working')], edges: [{ id: 'sp1', from: 's:a', to: 's:aw', kind: 'spawn' }, { id: 'sp2', from: 's:a', to: 's:aw2', kind: 'spawn' }, { id: 'sp3', from: 's:b', to: 's:bw', kind: 'spawn' }] };
  const lay = missionLayout(graph);
  const b = (id) => lay.boxes.get(id);
  assert.ok(b('s:a').y < b('s:b').y || b('s:a').x < b('s:b').x); // 이름 순(P100: 워크스페이스가 없는 판 하나 안에서 위 → 아래)
  assert.equal(b('s:aw').depth, b('s:a').depth + 1);
  assert.ok(b('s:aw').x > b('s:a').x);
  assert.ok(b('s:aw').y < b('s:aw2').y && b('s:aw2').y < b('s:bw').y, '부모 순서대로 모인다');
  assert.ok(b('s:a').y <= b('s:aw2').y && b('s:a').y + b('s:a').h >= b('s:aw').y, '부모는 하위들 옆(P95: 쉬는 하위는 한 줄이라 부모 카드가 더 높다)');
  assert.deepEqual(lay.loose, ['s:solo'], '선이 없는 뿌리는 연결 없음 칸');
});
