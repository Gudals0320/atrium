// P331: 세션 맵 할 일 배지(수 기준·미룬 카드 뺌)와 그 자리 답하기 미니 창(열림 조건, 답한 뒤 닫힘, 자리, 초점 유지)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { todoCount, todoItems, opensTodo, todoAfter, todoStep, todoPlace, keepsFocus, POP_GAP } from '../src/renderer/lib/map-todo.js';
import { activeCards, decisionsOf, withoutCard, withDeferred } from '../src/renderer/lib/decisions.js';

const raw = [
  { id: 1, sessionId: 'a', question: '어느 안?', options: ['A', 'B'], createdAt: 10, kind: 'decide' },
  { id: 2, sessionId: 'a', question: '됐나요?', createdAt: 20, kind: 'check' },
  { id: 3, sessionId: 'b', question: '명령 치기', createdAt: 5, kind: 'do', cmds: ['npm i'] },
  { id: 4, sessionId: 'b', question: '미룬 것', createdAt: 1, kind: 'do', deferred: true, wakeAt: 9e12 },
  { id: 5, sessionId: 'c', question: '나중에', createdAt: 2, kind: 'later', deferred: true },
];
const cards = decisionsOf(raw);

test('배지 수: 할 일 알약과 같은 기준(미룬 카드 뺌), 세션마다', () => {
  assert.equal(todoCount(cards, 'a'), 2);
  assert.equal(todoCount(cards, 'b'), 1); // #4는 미뤘다
  assert.equal(todoCount(cards, 'c'), 0); // 나중 줄만 있으면 배지 없음
  assert.equal(todoCount(cards, 'zz'), 0);
  assert.equal(todoCount(cards, null), 0);
  // 세션별 수의 합 = 알약이 세는 지금 목록 수
  const sum = ['a', 'b', 'c'].reduce((s, id) => s + todoCount(cards, id), 0);
  assert.equal(sum, activeCards(cards).length);
});

test('배지 수: 관리하는 목표 레인의 사용자 항목도 더한다(알약과 같다)', () => {
  assert.equal(todoCount(cards, 'a', 3), 5);
  assert.equal(todoCount(cards, 'c', 1), 1);
  assert.equal(todoCount(cards, 'a', -2), 2);
  assert.equal(todoCount(cards, 'a', 'x'), 2);
});

test('미루면 배지에서 빠지고, 꺼내면 돌아온다', () => {
  const s1 = withDeferred(cards, 1, true, 9e12);
  assert.equal(todoCount(s1, 'a'), 1);
  assert.equal(todoCount(withDeferred(s1, 1, false), 'a'), 2);
});

test('창 카드: 그 세션의 지금 카드(오래 기다린 것 먼저) 뒤에 목표 레인 카드', () => {
  const plan = [{ key: 'plan:p1:U1', ownerId: 'a', itemId: 'U1' }, { key: 'plan:p2:U1', ownerId: 'b' }];
  assert.deepEqual(todoItems(cards, plan, 'a').map((x) => x.key), ['d:1', 'd:2', 'plan:p1:U1']);
  assert.deepEqual(todoItems(cards, plan, 'b').map((x) => x.key), ['d:3', 'plan:p2:U1']); // 미룬 #4 없음
  assert.deepEqual(todoItems(cards, null, 'c'), []);
  assert.deepEqual(todoItems(cards, plan, null), []);
});

test('창 열림 조건: 열린 할 일이 있고, 태그를 빼는 누르기·더블클릭 둘째·끌기 뒤가 아닐 때', () => {
  assert.equal(opensTodo({ count: 2 }), true);
  assert.equal(opensTodo({ count: 0 }), false);
  assert.equal(opensTodo({ count: 1, wasTagged: true }), false);
  assert.equal(opensTodo({ count: 1, detail: 2 }), false);
  assert.equal(opensTodo({ count: 1, dragged: true }), false);
  assert.equal(opensTodo(), false);
});

test('답한 뒤 닫힘: 보던 카드가 목록에서 빠지면 null(닫기), 남아 있으면 그대로', () => {
  const items = todoItems(cards, [], 'a');
  assert.equal(todoAfter(items, 'd:1'), 'd:1');
  const after = todoItems(withoutCard(cards, 1), [], 'a'); // 답·했음·됐다·무시 직후 창이 지운다
  assert.equal(todoAfter(after, 'd:1'), null);
  assert.equal(todoAfter(todoItems(withDeferred(cards, 2, true, 9e12), [], 'a'), 'd:2'), null); // 미루기도 닫힌다
  assert.equal(todoAfter([], 'd:1'), null);
  assert.equal(todoAfter(items, null), null);
});

test('1/n 넘기기는 끝에서 돈다', () => {
  const items = [{ key: 'x' }, { key: 'y' }, { key: 'z' }];
  assert.equal(todoStep(items, 'x', 1), 'y');
  assert.equal(todoStep(items, 'z', 1), 'x');
  assert.equal(todoStep(items, 'x', -1), 'z');
  assert.equal(todoStep(items, 'nope', 1), 'x');
  assert.equal(todoStep([], 'x', 1), null);
});

test('창 자리: 위 → 아래 → 오른쪽 → 왼쪽, 카드가 보기 칸 밖이면 숨김', () => {
  const area = { w: 1600, h: 900, top: 52, bottom: 112, right: 300 };
  const pop = { w: 380, h: 200 };
  // 위에 자리가 있다
  let p = todoPlace({ x: 400, y: 400, w: 300, h: 120 }, pop, area);
  assert.deepEqual([p.side, p.x, p.y, p.hidden], ['top', 400, 400 - POP_GAP - 200, false]);
  // 위가 모자라면 아래
  p = todoPlace({ x: 400, y: 100, w: 300, h: 120 }, pop, area);
  assert.equal(p.side, 'bottom'); assert.equal(p.y, 100 + 120 + POP_GAP);
  // 위·아래 다 모자라면 오른쪽
  p = todoPlace({ x: 400, y: 100, w: 300, h: 640 }, pop, area);
  assert.equal(p.side, 'right'); assert.equal(p.x, 400 + 300 + POP_GAP);
  // 오른쪽(요약 열 앞)도 모자라면 왼쪽
  p = todoPlace({ x: 820, y: 100, w: 300, h: 640 }, pop, area);
  assert.equal(p.side, 'left'); assert.equal(p.x, 820 - POP_GAP - 380);
  // 오른쪽 끝 카드는 창을 요약 열 앞으로 당긴다
  p = todoPlace({ x: 1200, y: 400, w: 100, h: 100 }, pop, area);
  assert.equal(p.side, 'top'); assert.ok(p.x + pop.w <= area.w - area.right - 8);
  // 보기 칸 밖(위 줄 위, 명령줄 아래, 왼쪽 밖)
  assert.equal(todoPlace({ x: 400, y: -300, w: 300, h: 120 }, pop, area).hidden, true);
  assert.equal(todoPlace({ x: 400, y: 880, w: 300, h: 120 }, pop, area).hidden, true);
  assert.equal(todoPlace({ x: -500, y: 400, w: 300, h: 120 }, pop, area).hidden, true);
});

test('초점 유지: 창 안 누르기는 입력칸이 아니면 초점을 옮기지 않는다', () => {
  for (const tag of ['BUTTON', 'DIV', 'SPAN', 'svg', 'path', undefined]) assert.equal(keepsFocus(tag), true, tag);
  for (const tag of ['INPUT', 'TEXTAREA', 'SELECT', 'input']) assert.equal(keepsFocus(tag), false, tag);
});

test('창·세션 맵 코드: 초점을 옮기지 않고(자동 초점 없음), 할 일 목록 카드를 그대로 쓰고, PC 맵에만 배지', () => {
  const pop = fs.readFileSync(new URL('../src/renderer/MapTodo.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(pop, /autoFocus|\.focus\(/);
  assert.match(pop, /onMouseDown=\{\(e\) => \{ if \(keepsFocus\(e\.target && e\.target\.tagName\)\) e\.preventDefault\(\); \}\}/);
  assert.match(pop, /<DecisionRow key=\{it\.key\} d=\{it\.d\}/);
  assert.match(pop, /<PlanCardRow key=\{it\.key\} c=\{it\.c\}/);
  const ml = fs.readFileSync(new URL('../src/renderer/MissionLineage.jsx', import.meta.url), 'utf8');
  assert.match(ml, /onFold=\{onFold\} todo \/>/); // PC 세션 맵 카드
  assert.match(ml, /commandDraft\.dispatchEvent\(new CustomEvent\('tag', \{ detail: b\.node\.name \}\)\);\r?\n  \}, \[\]\);/); // 태그는 지금 그대로(초점을 옮기지 않는 tag 사건)
  const pm = fs.readFileSync(new URL('../src/renderer/PhoneMap.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(pm, /<Card [^\n]*\btodo\b/); // 휴대폰 맵은 그대로
  const dj = fs.readFileSync(new URL('../src/renderer/Decisions.jsx', import.meta.url), 'utf8');
  assert.match(dj, /export function DecisionRow\(/);
  assert.match(dj, /if \(!n \|\| rideOnly\) return rideEl;/);
});
