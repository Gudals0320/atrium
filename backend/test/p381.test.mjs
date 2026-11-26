// P381: omo 세션 기록(JSONL)에서 열린 질문·할 일 단계·goal·생명 주기를 읽는다(omo-record.mjs).
//   지어 만든 기록(키 이름만 실제 omo 5.1.8x 기록과 같다)으로: 질문 열림 → 응답 필요와 본문·선택지·추천·마감, 답 → 닫힘·알림 없음,
//   할 일 단계, 꼴이 다르면 화면으로 물러남, 덧붙은 줄만 읽기, 일하는 중에는 응답 필요가 아님(불변식)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readOmoRecord, omoAskOf, omoRecordView, openQuestionIds, askDetailText, questionsOf, deadlineOf, RECOMMENDED_RE } from '../src/omo-record.mjs';
import { newRuntime, deriveState, needKey, applyTermStatus, applyAgentReleased } from '../src/state.mjs';
import { UnitStops } from '../src/unit-stops.mjs';

const SID = '11111111-2222-4333-8444-555555555555';
const T0 = Date.parse('2026-11-27T01:00:00.000Z');
const ts = (s) => new Date(T0 + s * 1000).toISOString();
let n = 0;
const id8 = () => (++n).toString(16).padStart(8, '0');
const L = {
  head: () => ({ type: 'session', version: 3, id: SID, timestamp: ts(0), cwd: 'C:/tmp/omo-test' }),
  user: (s, text) => ({ type: 'message', id: id8(), parentId: null, timestamp: ts(s), message: { role: 'user', content: [{ type: 'text', text }], timestamp: T0 + s * 1000 }, inputSource: 'interactive' }),
  ask: (s, callId, { waitForAnswer = true, extra = {} } = {}) => ({ type: 'message', id: id8(), timestamp: ts(s), message: { role: 'assistant', stopReason: 'toolUse', content: [{ type: 'text', text: 'need a choice' }, { type: 'toolCall', id: callId, name: 'ask_user_question', arguments: { questions: [{ header: 'Color', question: 'Which color should the button be?', multiSelect: false, options: [{ label: 'Red', description: 'warm' }, { label: 'Blue (Recommended)', description: 'matches the theme' }, { label: 'Green', description: 'calm' }] }], waitForAnswer, ...extra } }] } }),
  askReg: (s, callId) => ({ type: 'custom', customType: 'ask-user:question', data: { requestId: callId, headers: ['Color'] }, id: id8(), timestamp: ts(s) }),
  life: (s, state, human = [], { sessionId = SID, children = 0, sources = [] } = {}) => ({ type: 'custom', customType: 'session-lifecycle', data: { state, seq: s, sessionId, waitingOn: { children, background: [], human: human.map((h) => ({ kind: 'question', requestId: h, revision: 1, since: ts(s), originSessionId: SID })), childSources: sources } }, id: id8(), timestamp: ts(s) }),
  result: (s, callId) => ({ type: 'message', id: id8(), timestamp: ts(s), message: { role: 'toolResult', toolCallId: callId, toolName: 'ask_user_question', content: [{ type: 'text', text: 'answered' }], details: { resolvedBy: 'local_ui', status: 'answered', answers: { q: 'Blue (Recommended)' }, unanswered: [] }, isError: false } }),
  todo: (s, phases) => ({ type: 'custom', customType: 'senpi.todo-state', data: { schema: 'v2', phases }, id: id8(), timestamp: ts(s) }),
  goal: (s, name, args) => ({ type: 'message', id: id8(), timestamp: ts(s), message: { role: 'assistant', stopReason: 'toolUse', content: [{ type: 'toolCall', id: 'g' + s, name, arguments: args }] } }),
  answer: (s, text) => ({ type: 'message', id: id8(), timestamp: ts(s), message: { role: 'assistant', stopReason: 'stop', content: [{ type: 'text', text }] } }),
};
function tmpFile() { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'p381-')); return path.join(d, `2026-11-27T01-00-00-000Z_${SID}.jsonl`); }
const put = (file, rows) => fs.writeFileSync(file, rows.map((r) => (typeof r === 'string' ? r : JSON.stringify(r))).join('\n') + '\n');
const add = (file, rows) => fs.appendFileSync(file, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
const omoRt = () => { const rt = newRuntime({ kind: 'omo', hooked: false }); rt.phase = 'running'; rt.term.present = true; return rt; };

test('P381 질문 열림: 본문·선택지·추천(꼬리표의 추천 표시)·마감(없으면 null)·응답 필요', () => {
  const f = tmpFile();
  put(f, [L.head(), L.user(1, 'pick a color'), L.ask(2, 'toolu_A'), L.askReg(2, 'toolu_A'), L.life(3, 'waiting_human', ['toolu_A'])]);
  const st = readOmoRecord(f);
  assert.equal(st.ok, true);
  const a = omoAskOf(st);
  assert.equal(a.kind, 'question');
  assert.equal(a.toolUseId, 'toolu_A');
  assert.equal(a.questions[0].question, 'Which color should the button be?');
  assert.deepEqual(a.questions[0].options, ['Red', 'Blue (Recommended)', 'Green']);
  assert.equal(a.questions[0].recommended, 'Blue (Recommended)');
  assert.deepEqual(a.questions[0].notes, ['warm', 'matches the theme', 'calm']);
  assert.equal(a.deadline, null);
  assert.equal(a.waitingHuman, true);
  assert.equal(a.since, T0 + 3000);
  // 판 상태: hook 없는 omo가 막혔다 → 응답 필요(화면 끝이 아니라 기록의 질문)
  const rt = omoRt(); rt.recordAsk = a; applyTermStatus(rt, 'blocked', T0 + 3000);
  const d = deriveState(rt);
  assert.equal(d.state, 'waiting');
  assert.equal(d.ask.kind, 'question');
  assert.equal(needKey(d), 'ask:toolu_A');
  // 멈춤 알림 글
  const t = askDetailText(a);
  assert.match(t, /질문: Which color should the button be\?/);
  assert.match(t, /보기: Red \/ Blue \(Recommended\) \/ Green/);
  assert.match(t, /추천: Blue \(Recommended\)/);
  assert.doesNotMatch(t, /마감/);
});

test('P381 마감: 인자·생명 주기에 마감 칸이 있으면 읽는다(이 omo 판의 기록에는 없다)', () => {
  assert.equal(deadlineOf({ timeoutSeconds: 90 }, null, 1000), 91000);
  assert.equal(deadlineOf({}, { deadline: '2026-11-27T02:00:00.000Z' }, 0), Date.parse('2026-11-27T02:00:00.000Z'));
  assert.equal(deadlineOf({ timeoutMs: 0 }, null, 1000), null);
  const f = tmpFile();
  put(f, [L.head(), L.ask(2, 'toolu_D', { extra: { timeoutSeconds: 120 } }), L.askReg(2, 'toolu_D'), L.life(3, 'waiting_human', ['toolu_D'])]);
  const a = omoAskOf(readOmoRecord(f));
  assert.equal(a.deadline, T0 + 2000 + 120000);
  assert.match(askDetailText(a), /마감: 2026-11-27T01:02:02/);
  assert.ok(RECOMMENDED_RE.test('기본안 (추천)') && RECOMMENDED_RE.test('A (권장)') && !RECOMMENDED_RE.test('Recommendations'));
  assert.equal(questionsOf({ questions: [{ question: 'q', options: ['x', 'y (추천)'] }] })[0].recommended, 'y (추천)');
});

test('P381 멈춤 알림 글은 한 줄로 짧다: 질문·보기 길이와 보기 수 상한(Claude AskUserQuestion도 같은 글)', () => {
  const long = 'x'.repeat(900);
  const ask = { kind: 'question', questions: [{ question: long + '\nsecond line', options: Array.from({ length: 10 }, (_, i) => `opt${i} ${'y'.repeat(100)}`), multiSelect: false }] };
  const t = askDetailText(ask);
  assert.ok(t.length <= 440, String(t.length));
  assert.doesNotMatch(t, /\n/);
  assert.match(t, /외 4개/);
  assert.equal(askDetailText({ kind: 'permission', summary: 'Bash: ls' }), null);
  assert.equal(askDetailText({ kind: 'question', questions: [] }), null);
});

test('P381 답: 생명 주기가 running으로 바뀌면(도구 결과 전에도) 닫히고, 도구 결과가 오면 마지막 질문으로 남는다', () => {
  const f = tmpFile();
  put(f, [L.head(), L.ask(2, 'toolu_A'), L.askReg(2, 'toolu_A'), L.life(3, 'waiting_human', ['toolu_A'])]);
  let st = readOmoRecord(f);
  assert.ok(omoAskOf(st));
  add(f, [L.life(5, 'running', [])]);
  st = readOmoRecord(f, st);
  assert.equal(omoAskOf(st), null, '사람이 답하면 생명 주기가 그 질문을 뺀다');
  add(f, [L.result(5, 'toolu_A'), L.answer(6, 'Blue it is.'), L.life(7, 'done', [])]);
  st = readOmoRecord(f, st);
  assert.equal(omoAskOf(st), null);
  assert.deepEqual(openQuestionIds(st), []);
  const v = omoRecordView(st);
  assert.equal(v.state, 'done');
  assert.equal(v.question, null);
  assert.deepEqual(v.lastQuestion, { id: 'toolu_A', status: 'answered', at: T0 + 5000 });
  // 판: 질문이 닫히면 막힘이 풀린 뒤 응답 필요가 아니다
  const rt = omoRt(); rt.recordAsk = null; applyTermStatus(rt, 'idle', T0 + 7000);
  assert.equal(deriveState(rt).state, 'ready');
});

test('P381 생명 주기가 아직 질문을 모르면(질문보다 옛 줄) 질문은 열려 있다. 다른 세션(하위)의 생명 주기는 보지 않는다', () => {
  const f = tmpFile();
  put(f, [L.head(), L.life(1, 'running', []), L.ask(2, 'toolu_B'), L.askReg(2, 'toolu_B'), L.life(3, 'running', [], { sessionId: 'child-session' })]);
  const a = omoAskOf(readOmoRecord(f));
  assert.equal(a.toolUseId, 'toolu_B');
  assert.equal(a.waitingHuman, false);
});

test('P381 불변식: 기록이 사람을 기다려도 터미널이 일하는 중이면 응답 필요가 아니다. 쉬면(기다리지 않는 질문) 응답 필요다', () => {
  const f = tmpFile();
  put(f, [L.head(), L.ask(2, 'toolu_C', { waitForAnswer: false }), L.askReg(2, 'toolu_C'), L.life(3, 'waiting_human', ['toolu_C'])]);
  const a = omoAskOf(readOmoRecord(f));
  assert.equal(a.async, true);
  const rt = omoRt(); rt.recordAsk = a;
  for (const s of ['working']) { applyTermStatus(rt, s, T0); assert.equal(deriveState(rt).state, 'working'); }
  applyTermStatus(rt, 'idle', T0 + 1);
  const d = deriveState(rt);
  assert.equal(d.state, 'waiting');
  assert.equal(d.ask.toolUseId, 'toolu_C');
  // 생명 주기가 사람을 기다리지 않으면 쉼은 준비됨
  rt.recordAsk = { ...a, waitingHuman: false };
  assert.equal(deriveState(rt).state, 'ready');
  // 에이전트가 끝나면 질문도 지운다
  rt.recordAsk = a; applyAgentReleased(rt, T0 + 2);
  assert.equal(rt.recordAsk, null);
});

test('P381 꼴이 다르면 화면으로 물러난다: 머리 줄이 없거나 줄 대부분이 JSON이 아니면 ok=false, ask 없음 → 화면 끝 ask', () => {
  const f = tmpFile();
  put(f, ['not json', 'still not json', JSON.stringify(L.ask(2, 'toolu_X'))]);
  const st = readOmoRecord(f);
  assert.equal(st.ok, false);
  assert.equal(omoAskOf(st), null);
  assert.deepEqual(omoRecordView(st), { ok: false });
  const g = tmpFile();
  put(g, [{ kind: 'other-format', v: 9 }, { kind: 'question', text: 'x' }]);
  assert.equal(readOmoRecord(g).ok, false);
  const rt = omoRt(); rt.recordAsk = omoAskOf(readOmoRecord(g));
  rt.screenAsk = { tail: 'screen tail', at: T0 };
  applyTermStatus(rt, 'blocked', T0);
  rt.screenAsk = { tail: 'screen tail', at: T0 }; // 판의 checkBlocked가 막힘 뒤 화면 끝을 둔다
  const d = deriveState(rt);
  assert.equal(d.state, 'waiting');
  assert.equal(d.ask.kind, 'screen');
  assert.equal(d.ask.tail, 'screen tail');
  assert.equal(readOmoRecord(path.join(os.tmpdir(), 'p381-none', 'x.jsonl')), null, '파일이 없으면 null');
});

test('P381 할 일 단계·하위 작업·goal 요약', () => {
  const f = tmpFile();
  put(f, [L.head(), L.goal(1, 'create_goal', { objective: 'ship the widget' }),
    L.todo(2, [{ name: 'Wave 1', tasks: [{ content: 'task one', status: 'completed' }, { content: 'task two', status: 'completed' }] }, { name: 'Wave 2', tasks: [{ content: 'task three', status: 'in_progress' }, { content: 'task four', status: 'pending' }] }]),
    L.life(3, 'waiting_children', [], { children: 2, sources: [{ source: 'senpi-task', activeCount: 2, items: [{ id: 'k1', label: 'worker a', startedAt: ts(3) }, { id: 'k2', label: 'worker b', startedAt: ts(3) }] }] })]);
  let st = readOmoRecord(f);
  let v = omoRecordView(st);
  assert.equal(v.ok, true);
  assert.equal(v.state, 'waiting_children');
  assert.deepEqual(v.todo.phases, [{ name: 'Wave 1', done: 2, total: 2, now: null }, { name: 'Wave 2', done: 0, total: 2, now: 'task three' }]);
  assert.equal(v.todo.current, 'Wave 2');
  assert.equal(v.todo.now, 'task three');
  assert.deepEqual(v.subtasks, { count: 2, sources: [{ source: 'senpi-task', active: 2, items: ['worker a', 'worker b'] }] });
  assert.deepEqual(v.goal, { status: 'active', objective: 'ship the widget' });
  add(f, [L.goal(9, 'update_goal', { status: 'complete' }), L.life(10, 'done', [])]);
  st = readOmoRecord(f, st);
  v = omoRecordView(st);
  assert.equal(v.goal.status, 'complete');
  assert.equal(v.state, 'done');
});

test('P381 덧붙은 줄만 읽는다: 같은 파일이면 앞 위치부터, 끝나지 않은 마지막 줄은 다음에', () => {
  const f = tmpFile();
  put(f, [L.head(), L.ask(2, 'toolu_A'), L.askReg(2, 'toolu_A')]);
  const st1 = readOmoRecord(f);
  const pos1 = st1.pos;
  assert.equal(pos1, fs.statSync(f).size);
  const half = JSON.stringify(L.life(3, 'waiting_human', ['toolu_A']));
  fs.appendFileSync(f, half.slice(0, 20));
  const st2 = readOmoRecord(f, st1);
  assert.equal(st2.pos, pos1, '끝나지 않은 줄은 접지 않는다');
  fs.appendFileSync(f, half.slice(20) + '\n');
  const st3 = readOmoRecord(f, st2);
  assert.equal(st3.lifecycle.state, 'waiting_human');
  assert.equal(st3.lines, st1.lines + 1);
  assert.equal(st1.lifecycle, null, '앞 상태는 바뀌지 않는다');
});

test('P381 멈춤 알림: 질문 본문을 싣고, 보내기 전에 사람이 답했으면(다른 질문·쉼) 그 줄은 보내지 않는다', () => {
  const f = tmpFile();
  put(f, [L.head(), L.ask(2, 'toolu_A'), L.askReg(2, 'toolu_A'), L.life(3, 'waiting_human', ['toolu_A'])]);
  const ask = omoAskOf(readOmoRecord(f));
  const rt = omoRt(); rt.recordAsk = ask; applyTermStatus(rt, 'blocked', T0);
  const sent = [];
  const tries = { t1: { id: 't1', sessionId: 'kid', unitId: 'u1', header: true, deliveryId: 'd1', result: null } };
  const store = { getTry: (id) => tries[id], getUnit: () => ({ id: 'u1', from: 'lead', to: 'kid', status: 'open', spec: 'do it' }), getDelivery: () => ({ status: 'confirmed' }), addEvent() {}, updateTry() {}, openUnitsFromCount: () => 0 };
  const kid = { sessionId: 'kid', rt };
  const b = { store, sessions: new Map([['kid', kid], ['lead', { sessionId: 'lead', rt: omoRt() }]]), killing: new Set(), log() {}, queue: { enqueue: (sid, text) => { sent.push(text); return { deliveryId: 'x' }; } } };
  const units = { prev: new Map([['kid', 'waiting']]), waiters: new Map(), nameOf: (sid) => sid };
  const us = new UnitStops(b, units, { batchMs: 60000 });
  try {
    const sum = { state: 'waiting', ask: { ...ask } };
    assert.equal(us.onState(kid, sum, 'working', tries.t1), 'needs_human');
    // 사람이 답하고 새 질문이 열렸다(같은 막힘) → 옛 질문 줄은 보내지 않는다
    const ask2 = { ...ask, toolUseId: 'toolu_B' }; rt.recordAsk = ask2;
    us.batch.flush('lead');
    assert.equal(sent.length, 0);
    // 같은 질문을 아직 기다리면 보낸다(질문 본문·보기·추천 실림)
    rt.recordAsk = ask;
    assert.equal(us.onState(kid, sum, 'working', tries.t1), 'needs_human');
    us.batch.flush('lead');
    assert.equal(sent.length, 1);
    assert.match(sent[0], /사람의 답/);
    assert.match(sent[0], /질문: Which color should the button be\?; 보기: Red \/ Blue \(Recommended\) \/ Green; 추천: Blue \(Recommended\)/);
    // 답해서 쉬면(ready) 보내지 않는다
    assert.equal(us.onState(kid, sum, 'working', tries.t1), 'needs_human');
    units.prev.set('kid', 'ready'); rt.recordAsk = null; applyTermStatus(rt, 'idle', T0 + 5);
    us.batch.flush('lead');
    assert.equal(sent.length, 1);
  } finally { us.stop(); }
});
