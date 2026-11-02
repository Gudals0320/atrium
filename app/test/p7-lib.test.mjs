// P7 창 단위 시험: 사이드바 줄 고르기(마지막 활동 순, 거르기 글)
import test from 'node:test';
import assert from 'node:assert/strict';
import { matches, sidebarRows, SECTION_STEP } from '../src/renderer/lib/sidebar.js';

test('J5: 거르기는 빈칸으로 나눈 낱말이 모두 들어 있어야 맞고 대소문자를 가리지 않는다', () => {
  assert.equal(matches(['@s1', 'Fix login bug'], ''), true);
  assert.equal(matches(['@s1', 'Fix login bug'], 'LOGIN'), true);
  assert.equal(matches(['@s1', 'Fix login bug'], 'login s1'), true);
  assert.equal(matches(['@s1', 'Fix login bug'], 'login s2'), false);
  assert.equal(matches([null, undefined, '워크트리에서 연 대화'], '워크트리'), true);
});

test('J5: 판 세션·닫힌 세션·판 밖 대화를 각자 마지막 활동 순으로, 거르기 글로 고른다', () => {
  const sessions = [
    { sessionId: 'a', name: 'old', kind: 'claude', state: 'ready', lastActivityAt: 10, createdAt: 1 },
    { sessionId: 'b', name: 'new', kind: 'shell', state: 'shell_idle', lastActivityAt: 30, createdAt: 2 },
    { sessionId: 'c', name: 'ask', kind: 'claude', state: 'waiting', ask: { kind: 'question', questions: [{ question: '배포할까?' }] }, lastActivityAt: 20, createdAt: 3 },
  ];
  const closed = [{ sessionId: 'x', name: 'gone', closedAt: 5, reasonLabel: '패널이 없어짐' }, { sessionId: 'y', name: 'killed', closedAt: 50, reasonLabel: '판에서 끔' }];
  const convos = [{ convId: '1', title: '로그인 고치기', lastAt: 100 }, { convId: '2', title: '문서', lastAt: 200, branch: 'feat-x' }];
  const all = sidebarRows({ sessions, closed, convos });
  assert.deepEqual(all.sessions.map((s) => s.name), ['new', 'ask', 'old']);
  assert.deepEqual(all.closed.map((s) => s.name), ['killed', 'gone']);
  assert.deepEqual(all.convos.map((c) => c.convId), ['2', '1']);
  assert.deepEqual(sidebarRows({ sessions, closed, convos, filter: '배포' }).sessions.map((s) => s.name), ['ask']); // 내 차례 질문 글
  assert.deepEqual(sidebarRows({ sessions, closed, convos, filter: '패널' }).closed.map((s) => s.name), ['gone']);
  assert.deepEqual(sidebarRows({ sessions, closed, convos, filter: 'feat' }).convos.map((c) => c.convId), ['2']);
  assert.ok(SECTION_STEP >= 3);
});
