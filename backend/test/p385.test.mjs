// P385 단위 시험: 자동 할 일 카드의 중복 막기. 하위 세션(일 상위가 있는 세션)의 글로는 자동 카드를 만들지 않는다(불변식, 할 일 정리도 부르지 않음),
// 이미 떠 있는 응답 필요 질문(훅 질문, OmO 기록의 열린 질문)이나 열린 손 카드와 같은 질문이면 만들지 않는다(다른 질문은 만든다),
// 자동 카드가 먼저 만들어지고 같은 질문이 뒤에 응답 필요로 뜨면 그 자동 카드를 닫는다, 맨 위 세션·손 카드는 그대로.
// 틀은 p316 시험(진짜 저장소, 가짜 할 일 정리). 표본은 모두 지어낸 글이다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { Store } from '../src/store.mjs';
import { newRuntime } from '../src/state.mjs';
import { Decisions, sameAsk, askQuestions } from '../src/decisions.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p385-'));
const fakeTidy = (result) => ({ asked: [], on: () => true, ask(sid, text) { this.asked.push(text); return Promise.resolve(typeof result === 'function' ? result(text) : result); } });
const recordAsk = (question, options = []) => ({ kind: 'question', tool: 'ask_user_question', toolUseId: 'call-' + crypto.randomBytes(3).toString('hex'), since: Date.now(), notifiedAt: null, questions: [{ question, header: null, multiSelect: false, options, notes: [], recommended: null }], deadline: null, async: true, more: 0, source: 'record', waitingHuman: false });

function board(tidy) {
  const dir = tmp();
  const store = new Store(path.join(dir, 'board.db'));
  const parents = new Map(); // 세션 ID → 일 상위
  const b = { store, sessions: new Map(), bus: new EventEmitter(), api: { broadcast: () => {} }, log: () => {}, hooked: () => true, todoTidy: tidy, refreshed: 0 };
  const branch = { relIndex: () => ({ workParentOf: (id) => parents.get(id) || null }) };
  const decisions = new Decisions(b, branch, {});
  decisions.autoSetting = () => true;
  const add = (name, { kind = 'claude', parent = null } = {}) => {
    const s = { sessionId: crypto.randomUUID(), name, kind, cwd: dir, rt: newRuntime({ kind, hooked: kind === 'claude' }) };
    b.sessions.set(s.sessionId, s);
    if (parent) parents.set(s.sessionId, parent.sessionId);
    return s;
  };
  // 턴 하나를 끝낸다(마지막 답 = text). hook이 있는 종류로 보고 곧바로 자동 카드 흐름을 탄다
  const endTurn = async (s, text) => { s.rt.turn.startedAt = Date.now() - 1000; s.rt.lastAnswer = text; s.rt.lastAnswerAt = Date.now(); decisions.turnEnded(s); await new Promise((r) => setTimeout(r, 20)); };
  const open = (s) => store.openDecisions(s.sessionId);
  const events = (kind) => store.db.prepare('SELECT data FROM events WHERE kind = ? ORDER BY id').all(kind).map((e) => JSON.parse(e.data || '{}'));
  return { b, decisions, add, endTurn, open, events, store, done: () => { try { store.close(); } catch {} try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} } };
}
const ASKING = '두 길을 정리했습니다.\n\n1. A안: 캐시를 둔다\n2. B안: 매번 읽는다\n\n어느 쪽으로 할까요?';
const CARD = { kind: 'decide', question: '캐시를 둘지 매번 읽을지 정하기', options: ['A안', 'B안'], context: '', cmds: [], timing: 'now' };

test('P385 불변식: 하위 세션의 글로는 자동 카드를 만들지 않고 할 일 정리도 부르지 않는다', async () => {
  const tidy = fakeTidy({ cards: [CARD] });
  const t = board(tidy);
  try {
    const lead = t.add('lead');
    const sub = t.add('sub', { parent: lead });
    const omoSub = t.add('omo-sub', { kind: 'omo', parent: lead });
    await t.endTurn(sub, ASKING);
    await t.endTurn(omoSub, ASKING);
    assert.equal(t.open(sub).length, 0, '하위 Claude Code 세션');
    assert.equal(t.open(omoSub).length, 0, '하위 OmO 세션');
    assert.equal(tidy.asked.length, 0, '할 일 정리를 부르지 않는다');
    assert.equal(t.decisions.autoAsk(sub, ASKING), null, '규칙 길도 만들지 않는다(autoEligible)');
    await t.endTurn(lead, ASKING);
    assert.equal(t.open(lead).length, 1, '맨 위 세션은 지금처럼 만든다');
    assert.equal(tidy.asked.length, 1);
  } finally { t.done(); }
});

test('P385 응답 필요 질문(OmO 기록의 열린 질문)과 같은 질문이면 만들지 않고, 다른 질문은 만든다', async () => {
  let next = [CARD];
  const t = board(fakeTidy(() => ({ cards: next })));
  try {
    const omo = t.add('omo', { kind: 'omo' });
    omo.rt.recordAsk = recordAsk('캐시를 둘지 매번 읽을지 정해 주세요', ['A안 (추천)', 'B안']);
    await t.endTurn(omo, ASKING);
    assert.equal(t.open(omo).length, 0, '같은 질문: 할 일 카드가 두 번 뜨지 않는다');
    assert.deepEqual(t.events('decision_dup').at(-1), { ask: 1, card: 0, tidy: true, kind: 'omo' });
    next = [{ ...CARD, question: '배포 전에 로그인 화면을 직접 확인', kind: 'check', options: [] }];
    await new Promise((r) => setTimeout(r, 5));
    await t.endTurn(omo, '로그인 화면도 바꿨습니다. 배포 전에 로그인 화면을 직접 확인해 주세요.');
    assert.deepEqual(t.open(omo).map((d) => d.question), ['배포 전에 로그인 화면을 직접 확인'], '다른 질문은 만든다');
  } finally { t.done(); }
});

test('P385 훅 질문(AskUserQuestion)과 같은 질문, 규칙 길(할 일 정리 끔)도 같다', async () => {
  const t = board(null);
  try {
    const lead = t.add('lead');
    lead.rt.pendingAsk = { kind: 'question', tool: 'AskUserQuestion', toolUseId: 'tu1', since: Date.now(), questions: [{ question: '어느 쪽으로 할까요?', header: '길', multiSelect: false, options: ['A안', 'B안'] }] };
    await t.endTurn(lead, ASKING);
    assert.equal(t.open(lead).length, 0);
    assert.equal(t.events('decision_dup').at(-1).tidy, false);
    lead.rt.pendingAsk = null;
    await t.endTurn(lead, ASKING);
    assert.equal(t.open(lead).length, 1, '질문이 닫힌 뒤에는 지금처럼 만든다');
  } finally { t.done(); }
});

test('P385 OmO는 자동 카드를 만들기 전에 기록을 한 번 더 읽는다(기록이 늦게 적힌 경우)', async () => {
  const t = board(fakeTidy({ cards: [CARD] }));
  try {
    const omo = t.add('omo', { kind: 'omo' });
    t.b.refreshOmoRecord = (s) => { t.b.refreshed++; s.rt.recordAsk = recordAsk('캐시를 둘지 매번 읽을지 정해 주세요', ['A안', 'B안']); return true; };
    await t.endTurn(omo, ASKING);
    assert.ok(t.b.refreshed >= 1, '기록을 다시 읽었다');
    assert.equal(t.open(omo).length, 0);
  } finally { t.done(); }
});

test('P385 열린 손 카드(실행·나중에도)와 같은 질문이면 만들지 않는다. 손 카드는 그대로 만들어진다', async () => {
  let next = [{ kind: 'do', question: '키를 넣고 npm run setup 실행', options: [], context: '', cmds: [], timing: null }];
  const t = board(fakeTidy(() => ({ cards: next })));
  try {
    const lead = t.add('lead');
    const hand = t.decisions.todoVerb(lead, { text: '키를 넣고 npm run setup 실행' });
    assert.ok(hand.id, '손 실행 카드');
    lead.rt.turn.startedAt = Date.now() + 5; await new Promise((r) => setTimeout(r, 10)); // 다음 턴(이 턴에 만든 손 카드가 아니다)
    lead.rt.lastAnswer = '키를 넣고 npm run setup을 실행해 주세요.'; lead.rt.lastAnswerAt = Date.now();
    await t.decisions.autoTurn(lead, lead.rt.lastAnswer, lead.rt.turn.startedAt);
    assert.deepEqual(t.open(lead).map((d) => d.id), [hand.id], '자동 카드가 손 카드를 겹쳐 만들지 않는다');
    assert.deepEqual(t.events('decision_dup').at(-1), { ask: 0, card: 1, tidy: true, kind: 'claude' });
    next = [{ kind: 'check', question: '설정 화면에서 새 칸이 보이는지 확인', options: [], context: '', cmds: [], timing: null }];
    await new Promise((r) => setTimeout(r, 5)); lead.rt.lastAnswerAt = Date.now();
    await t.decisions.autoTurn(lead, '설정 화면에서 새 칸이 보이는지 확인해 주세요.', lead.rt.turn.startedAt);
    assert.equal(t.open(lead).length, 2, '다른 질문은 만든다');
    // 응답 필요 질문이 떠 있어도 에이전트의 손 카드(atrium ask)는 그대로
    lead.rt.recordAsk = recordAsk('어느 쪽으로 할까요?', ['A안', 'B안']);
    const q = t.decisions.askVerb(lead, { question: '어느 쪽으로 할까요?', options: ['A안', 'B안'] });
    assert.ok(q.id, '손 결정 카드는 막지 않는다');
  } finally { t.done(); }
});

test('P385 자동 카드가 먼저 만들어지고 같은 질문이 응답 필요로 뜨면 그 자동 카드를 닫는다(다른 질문의 카드는 남김)', async () => {
  const t = board(fakeTidy({ cards: [CARD, { kind: 'check', question: '로그인 화면을 직접 확인', options: [], context: '', cmds: [], timing: null }] }));
  try {
    const omo = t.add('omo', { kind: 'omo' });
    await t.endTurn(omo, ASKING + '\n\n로그인 화면도 직접 확인해 주세요.');
    assert.equal(t.open(omo).length, 2);
    omo.rt.recordAsk = recordAsk('캐시를 둘지 매번 읽을지 정해 주세요', ['A안', 'B안']);
    t.decisions.onSession(omo, { state: 'waiting' });
    assert.deepEqual(t.open(omo).map((d) => d.question), ['로그인 화면을 직접 확인']);
    const end = t.events('decision_end').at(-1);
    assert.equal(end.via, 'dup'); assert.equal(end.state, 'closed');
    t.decisions.onSession(omo, { state: 'waiting' });
    assert.equal(t.events('decision_end').filter((e) => e.via === 'dup').length, 1, '같은 질문은 한 번만 본다');
  } finally { t.done(); }
});

test('P385 이 턴의 질문이 모두 다른 자리에 떠 있으면 앞 턴의 자동 카드는 바뀐 것으로 닫는다', async () => {
  let next = [{ kind: 'decide', question: '이름을 바꿀까요?', options: ['예', '아니오'], context: '', cmds: [], timing: null }];
  const t = board(fakeTidy(() => ({ cards: next })));
  try {
    const omo = t.add('omo', { kind: 'omo' });
    await t.endTurn(omo, '이름을 바꿀까요?');
    assert.equal(t.open(omo).length, 1);
    next = [CARD];
    omo.rt.recordAsk = recordAsk('캐시를 둘지 매번 읽을지 정해 주세요', ['A안', 'B안']);
    t.decisions.askSeen.set(omo.sessionId, 'x'); // onAsk와 따로 본다
    await new Promise((r) => setTimeout(r, 5));
    await t.endTurn(omo, ASKING);
    assert.equal(t.open(omo).length, 0);
    assert.ok(t.events('decision_end').some((e) => e.via === 'replaced'));
  } finally { t.done(); }
});

test('P385 sameAsk: 같은 질문·줄여 쓴 질문·같은 보기는 같고, 짧은 다른 질문은 다르다', () => {
  assert.ok(sameAsk({ question: '어느 쪽으로 할까요?' }, { question: '어느 쪽으로 할까요' }));
  assert.ok(sameAsk({ question: '캐시를 둘지 매번 읽을지 정하기' }, { question: '캐시를 둘지 매번 읽을지 정해 주세요. 둘 다 장단점이 있습니다.' }), '짧은 쪽이 긴 쪽에 거의 다 있다');
  assert.ok(sameAsk({ question: '방식 고르기', options: ['A안', 'B안'] }, { question: '어느 방식으로 갈까요?', options: ['A안 (추천)', 'B안'] }), '보기가 모두 그 질문의 보기');
  assert.ok(!sameAsk({ question: '배포할까요?' }, { question: '진행할까요?' }));
  assert.ok(!sameAsk({ question: '로그인 화면을 직접 확인' }, { question: '캐시를 둘지 매번 읽을지 정해 주세요' }));
  assert.ok(sameAsk({ question: '이름 바꾸기', options: ['예', '아니오'] }, { question: '이름을 바꿀까요?', options: ['예', '아니오'] }));
  assert.ok(!sameAsk({ question: '로그 정리', options: ['진행'] }, { question: '배포', options: ['진행', '보류'] }), '보기 하나로는 같다고 보지 않는다');
  assert.deepEqual(askQuestions({ kind: 'permission', summary: 'Bash: ls' }), [], '권한 질문은 견주지 않는다');
  assert.deepEqual(askQuestions(recordAsk('질문', ['가', '나'])), [{ question: '질문', options: ['가', '나'] }]);
});

test('P385 OmO 기다리지 않는 질문: "받았다" 결과(status pending) 뒤에도 생명 주기가 기다리는 동안 열려 있고, 답하면 닫힌다', async () => {
  const { newOmoRecord, foldOmoLine, omoAskOf } = await import('../src/omo-record.mjs');
  const st = newOmoRecord('x.jsonl');
  let n = 0; const ts = () => new Date(Date.UTC(2026, 10, 27, 0, 0, n++)).toISOString();
  const life = (state, human) => ({ type: 'custom', customType: 'session-lifecycle', timestamp: ts(), data: { state, sessionId: 's1', waitingOn: { children: 0, human: human.map((id) => ({ kind: 'question', requestId: id, since: ts() })) } } });
  for (const o of [
    { type: 'session', id: 's1', timestamp: ts() },
    { type: 'message', timestamp: ts(), message: { role: 'assistant', content: [{ type: 'toolCall', id: 'q1', name: 'ask_user_question', arguments: { questions: [{ question: 'Which size?', header: 'Size', options: [{ label: 'Small' }, { label: 'Large' }] }], waitForAnswer: false } }] } },
    { type: 'custom', customType: 'ask-user:question', timestamp: ts(), data: { requestId: 'q1', headers: ['Size'] } },
    life('waiting_human', ['q1']),
    { type: 'message', timestamp: ts(), message: { role: 'toolResult', toolCallId: 'q1', toolName: 'ask_user_question', content: [{ type: 'text', text: 'Question accepted' }], details: { accepted: true, requestId: 'q1', status: 'pending' }, isError: false } },
  ]) foldOmoLine(st, o);
  st.ok = true;
  const a = omoAskOf(st);
  assert.ok(a, '받은 뒤에도 열린 질문');
  assert.equal(a.questions[0].question, 'Which size?'); assert.equal(a.async, true); assert.equal(a.waitingHuman, true);
  foldOmoLine(st, life('waiting_human', ['q1']));
  assert.ok(omoAskOf(st), '생명 주기가 아직 기다린다');
  foldOmoLine(st, life('running', []));
  assert.equal(omoAskOf(st), null, '답이 와서 생명 주기가 더는 기다리지 않으면 닫힌다');
  // 기다리는 질문의 답 결과(status answered)는 지금처럼 곧바로 닫는다
  const st2 = newOmoRecord('y.jsonl');
  for (const o of [
    { type: 'session', id: 's1', timestamp: ts() },
    { type: 'message', timestamp: ts(), message: { role: 'assistant', content: [{ type: 'toolCall', id: 'q2', name: 'ask_user_question', arguments: { questions: [{ question: 'Color?', options: ['Red', 'Blue'] }] } }] } },
    { type: 'message', timestamp: ts(), message: { role: 'toolResult', toolCallId: 'q2', toolName: 'ask_user_question', content: [], details: { status: 'answered' }, isError: false } },
  ]) foldOmoLine(st2, o);
  st2.ok = true;
  assert.equal(omoAskOf(st2), null);
});
