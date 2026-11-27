// P384: 하위의 질문 창(Claude AskUserQuestion, OmO ask_user_question)은 사람 대신 일 부모가 받는다(child-asks.mjs).
//   가짜 판으로: 부모에게 가는 글 꼴(번호 보기·추천·답하는 법·기준·올리기 시간), 같은 질문은 한 번, 기다리는 부모에게는 안 보냄,
//   맨 위 세션·권한 질문은 그대로(길 없음), 시간 지나면 사람에게 올림(부모 카드가 있으면 미룸), 0분이면 올리지 않음,
//   atrium answer는 일 부모만, 번호·글이 질문 창에 들어감(Claude 답하기 길, OmO 키), 휴대폰 푸시는 부모 처리 중이면 안 보냄
import test from 'node:test';
import assert from 'node:assert/strict';
import { ChildAsks, askNoticeText, parseAnswers, claudeAnswerInput, omoAnswerSteps, routableAsk, escalateMsOf, NOTICE_HEAD } from '../src/child-asks.mjs';
import { newRuntime, applyTermStatus, deriveState } from '../src/state.mjs';
import crypto from 'node:crypto';
import { Pusher, b64u } from '../src/web-push.mjs';
import { VERB_NAMES, VERBS, CONTRACT_VERSION } from '../src/cli-contract.mjs';
import { orchPromptLines, permOf, opRefusal } from '../src/orchestration.mjs';
import { BOARD_SYSTEM_PROMPT } from '../src/launch.mjs';
import { HARNESS_PROMPT } from '../src/harness.mjs';
import { boardSkill } from '../src/branch.mjs';

const tick = (ms) => new Promise((r) => setTimeout(r, ms));
const fakeSub = () => { const ua = crypto.createECDH('prime256v1'); ua.generateKeys(); return { endpoint: `https://web.push.apple.com/3/device/${crypto.randomBytes(6).toString('hex')}`, keys: { p256dh: b64u(ua.getPublicKey()), auth: b64u(crypto.randomBytes(16)) } }; };
const Q = (o = {}) => ({ kind: 'question', tool: 'ask_user_question', toolUseId: 'toolu_A', since: 1000, questions: [{ question: 'Which color should the test button be?', header: 'Color', multiSelect: false, options: ['Red', 'Blue (Recommended)', 'Green'], recommended: 'Blue (Recommended)' }], source: 'record', waitingHuman: true, ...o });

// 가짜 판: 세션(rt), 일 부모, 대기열, 이벤트, 결정 카드, 답하기·키
function board({ minutes = 10 } = {}) {
  const sessions = new Map(); const events = []; const queued = []; const keys = []; const texts = []; const answers = []; const pushes = []; const broadcasts = []; const cards = [];
  const parentOf = new Map(); const waiters = new Map();
  const b = {
    sessions, parentOf,
    store: { addEvent: (sid, kind, data) => events.push({ sid, kind, data }), saveRuntime() {}, openTryOf: () => null, getUnit: () => null, decisionsSince: (sid, t) => cards.filter((c) => c.sessionId === sid && c.createdAt >= t) },
    queue: { enqueue: (sid, text) => { queued.push({ sid, text }); return { deliveryId: 'd' + queued.length }; } },
    workParentOf: (id) => parentOf.get(id) || null,
    hooked: (s) => s.kind === 'claude',
    broadcastSession: (s, o) => broadcasts.push({ name: s.name, cause: o && o.cause }),
    summary: (s) => ({ sessionId: s.sessionId, name: s.name, kind: s.kind, ...deriveState(s.rt), askRoute: b.childAsks.view(s) }),
    answer: async (p) => { answers.push(p); const s = sessions.get(p.session); s.rt.pendingAsk = null; applyTermStatus(s.rt, 'working', Date.now()); return { sent: true, steps: ['k'] }; },
    adapter: { paneKeys: async (pane, k) => { keys.push(k); const s = [...sessions.values()].find((x) => x.paneId === pane); if (s && s.closeOnKey) { s.rt.recordAsk = null; applyTermStatus(s.rt, 'working', Date.now()); } }, sendText: async (pane, t) => texts.push(t) },
    web: { push: { need: (sum) => pushes.push(sum) } },
    features: { settings: { get: () => ({ childAskEscalateMin: minutes }) } },
    branch: { units: { waiters }, verbs: { target: (caller, name) => { const t = [...sessions.values()].find((x) => x.name === name); if (!t) throw Object.assign(new Error('nf'), { code: 'not_found' }); return t; } } },
    log() {},
  };
  b.childAsks = new ChildAsks(b, { settleMs: 600, stepMs: 5 });
  const add = (name, { kind = 'claude', parent = null } = {}) => {
    const rt = newRuntime({ kind, hooked: kind === 'claude' }); rt.phase = 'running'; rt.term.present = true; applyTermStatus(rt, 'idle', 1);
    const s = { sessionId: 'id-' + name, name, kind, rt, paneId: 'p-' + name };
    sessions.set(s.sessionId, s); if (parent) parentOf.set(s.sessionId, parent.sessionId);
    return s;
  };
  // 질문 창을 띄운다(Claude는 hook 질문, OmO는 기록 질문)
  const ask = (s, a = Q()) => { if (s.kind === 'claude') s.rt.pendingAsk = { ...a, source: undefined }; else s.rt.recordAsk = a; applyTermStatus(s.rt, 'blocked', Date.now()); return b.childAsks.sync(s, deriveState(s.rt)); };
  return { b, add, ask, events, queued, keys, texts, answers, pushes, broadcasts, cards, waiters, stop: () => b.childAsks.stop() };
}

test('P384 하위 질문 → 부모에게 판 알림 한 번(번호 보기·추천·답하는 법·기준·올리기 시간), 요약 askRoute', async () => {
  const x = board();
  try {
    const ld = x.add('ld'); const w1 = x.add('w1', { kind: 'omo', parent: ld });
    const v = x.ask(w1);
    assert.equal(v.parent, 'ld'); assert.equal(v.escalated, null); assert.ok(v.escalateAt > Date.now());
    await tick(5);
    assert.equal(x.queued.length, 1);
    assert.equal(x.queued[0].sid, ld.sessionId);
    const t = x.queued[0].text;
    assert.ok(t.startsWith(NOTICE_HEAD + ': @w1'), t);
    assert.match(t, /질문: Which color should the test button be\?/);
    assert.match(t, /\n  1\. Red\n  2\. Blue \(Recommended\)\n  3\. Green\n  추천: 2/);
    assert.match(t, /atrium answer w1 <번호>/); assert.match(t, /atrium answer w1 "<글>"/);
    assert.match(t, /일상적인 구현·설계 질문이면 네가 정해 답한다/); assert.match(t, /atrium ask/);
    assert.match(t, /10분 안에 답하지 않으면 보드가 이 질문을 사람에게 올린다/);
    // 같은 질문: 다시 보내지 않는다(요약이 몇 번 불려도, 백엔드를 다시 켜도 rt에 남는다)
    for (let i = 0; i < 3; i++) x.b.childAsks.sync(w1, deriveState(w1.rt));
    const again = new ChildAsks(x.b); again.sync(w1, deriveState(w1.rt)); again.stop();
    await tick(5);
    assert.equal(x.queued.length, 1);
    assert.equal(x.b.childAsks.held(w1), true);
    assert.ok(x.events.some((e) => e.kind === 'child_ask_routed') && x.events.some((e) => e.kind === 'child_ask_notice'));
    // 다른 질문이면 새로 한 번
    x.ask(w1, Q({ toolUseId: 'toolu_B' }));
    await tick(5);
    assert.equal(x.queued.length, 2);
    assert.ok(x.events.some((e) => e.kind === 'child_ask_end' && e.data.how === 'replaced'));
    // 질문이 닫히면 길도 닫힌다
    w1.rt.recordAsk = null; applyTermStatus(w1.rt, 'working', Date.now());
    assert.equal(x.b.childAsks.sync(w1, deriveState(w1.rt)), null);
    assert.equal(w1.rt.askRoute, null);
  } finally { x.stop(); }
});

test('P384 맨 위 세션·권한 질문·셸 부모는 길이 없다(지금처럼 사람에게). 부모가 atrium wait로 기다리면 알림 대신 기다림이 받는다', async () => {
  const x = board();
  try {
    const top = x.add('top');
    assert.equal(x.ask(top), null, '부모 없는 세션');
    const ld = x.add('ld'); const w1 = x.add('w1', { parent: ld });
    w1.rt.pendingAsk = { kind: 'permission', tool: 'Bash', toolUseId: 't1', since: 1, summary: 'Bash: mkdir x' }; applyTermStatus(w1.rt, 'blocked', Date.now());
    assert.equal(x.b.childAsks.sync(w1, deriveState(w1.rt)), null, '권한 질문은 사람이 답한다');
    assert.equal(routableAsk({ state: 'trust_wait' }), false);
    assert.equal(routableAsk({ state: 'waiting', ask: { kind: 'plan' } }), false);
    const sh = x.add('sh', { kind: 'shell' }); const w2 = x.add('w2', { kind: 'omo', parent: sh });
    assert.equal(x.ask(w2), null, '셸은 부모가 아니다');
    const w3 = x.add('w3', { kind: 'omo', parent: ld });
    x.waiters.set(`${ld.sessionId}>${w3.sessionId}`, new Set([{}]));
    assert.ok(x.ask(w3));
    await tick(5);
    assert.equal(x.queued.length, 0);
    assert.ok(x.events.some((e) => e.kind === 'child_ask_notice' && e.data.via === 'wait'));
  } finally { x.stop(); }
});

test('P384 올리기: 정한 시간 안에 답이 없으면 사람에게(흐림 풀림, 휴대폰 푸시), 부모가 atrium ask 카드를 남겼으면 미룬다, 0분이면 올리지 않는다', async () => {
  const x = board({ minutes: 0.002 }); // 120ms
  try {
    const ld = x.add('ld'); const w1 = x.add('w1', { kind: 'omo', parent: ld });
    x.ask(w1);
    assert.equal(x.b.childAsks.held(w1), true);
    await tick(250);
    assert.ok(w1.rt.askRoute.escalated, '사람에게 올렸다');
    assert.equal(x.b.childAsks.held(w1), false);
    assert.equal(x.pushes.length, 1); assert.equal(x.pushes[0].name, 'w1');
    assert.ok(x.broadcasts.some((y) => y.cause === 'child_ask:escalated'));
    // 부모의 결정 카드가 있으면 그 카드로 사람이 답한다: 올리지 않고 미룬다
    const w2 = x.add('w2', { kind: 'omo', parent: ld });
    x.ask(w2);
    x.cards.push({ id: 7, sessionId: ld.sessionId, state: 'open', createdAt: Date.now() });
    await tick(200);
    assert.equal(w2.rt.askRoute.escalated, null);
    assert.equal(w2.rt.askRoute.viaCard, 7);
    assert.equal(x.pushes.length, 1);
    // 카드가 닫히면 다음 시계에 올린다
    x.cards[0].state = 'answered';
    await tick(250);
    assert.ok(w2.rt.askRoute.escalated);
  } finally { x.stop(); }
  const y = board({ minutes: 0 });
  try {
    const ld = y.add('ld'); const w1 = y.add('w1', { kind: 'omo', parent: ld });
    const v = y.ask(w1);
    assert.equal(v.escalateAt, null);
    await tick(5);
    assert.doesNotMatch(y.queued[0].text, /분 안에/);
  } finally { y.stop(); }
  assert.equal(escalateMsOf({}), 10 * 60000, '기본 10분');
  assert.equal(escalateMsOf({ childAskEscalateMin: 0 }), 0);
});

test('P384 부모가 닫히면(같은 질문이 남음) 사람에게: 길이 닫히고 푸시', async () => {
  const x = board();
  try {
    const ld = x.add('ld'); const w1 = x.add('w1', { kind: 'omo', parent: ld });
    x.ask(w1);
    x.b.sessions.delete(ld.sessionId);
    assert.equal(x.b.childAsks.sync(w1, deriveState(w1.rt)), null);
    await tick(5);
    assert.ok(x.events.some((e) => e.kind === 'child_ask_end' && e.data.how === 'parent_gone'));
    assert.equal(x.pushes.length, 1);
  } finally { x.stop(); }
});

test('P384 답 글 해석: 번호·글·여러 개 고르기·질문 여럿, 틀린 번호는 거절', () => {
  const a = Q();
  assert.deepEqual(parseAnswers(a, ['2']), [{ picks: [2], label: '2. Blue (Recommended)' }]);
  assert.deepEqual(parseAnswers(a, ['Purple please']), [{ text: 'Purple please', label: '글: Purple please' }]);
  assert.throws(() => parseAnswers(a, ['4']), /1~3번/);
  assert.throws(() => parseAnswers(a, ['1,2']), /하나만/);
  assert.throws(() => parseAnswers(a, ['1', '2']), /질문이 1개/);
  assert.throws(() => parseAnswers(a, []), /답을 준다/);
  assert.deepEqual(claudeAnswerInput(a, parseAnswers(a, ['3'])), { choice: 3 });
  assert.deepEqual(claudeAnswerInput(a, parseAnswers(a, ['Purple'])), { choice: 4, text: 'Purple' }, '글은 Type something(보기 수 + 1)');
  const m = Q({ questions: [{ ...Q().questions[0], multiSelect: true }] });
  assert.deepEqual(claudeAnswerInput(m, parseAnswers(m, ['1,3'])), { picks: [1, 3] });
  const two = Q({ questions: [Q().questions[0], { question: 'Size?', options: ['S', 'M'], multiSelect: false }] });
  assert.deepEqual(claudeAnswerInput(two, parseAnswers(two, ['2', '1'])), { picks: [2, 1] });
  assert.throws(() => claudeAnswerInput(two, parseAnswers(two, ['2', 'big'])), /글 답/);
  assert.deepEqual(omoAnswerSteps(a, parseAnswers(a, ['2'])), [{ keys: ['2'] }]);
  assert.deepEqual(omoAnswerSteps(a, parseAnswers(a, ['Purple'])), [{ text: 'Purple' }, { keys: ['enter'] }]);
  assert.deepEqual(omoAnswerSteps(two, parseAnswers(two, ['2', 'big'])), [{ keys: ['2'] }, { text: 'big' }, { keys: ['enter'] }]);
});

test('P384 atrium answer: 일 부모만, Claude는 답하기 길(번호·글), OmO는 질문 창에 키, 닫혔는지 돌려준다', async () => {
  const x = board();
  try {
    const ld = x.add('ld'); const other = x.add('other'); const top = x.add('top');
    const c1 = x.add('c1', { parent: ld });
    x.ask(c1, Q({ toolUseId: 'toolu_C', source: undefined }));
    await assert.rejects(x.b.childAsks.answerVerb(other, { name: 'c1', answers: ['2'] }), (e) => e.code === 'not_parent');
    await assert.rejects(x.b.childAsks.answerVerb(ld, { name: 'top', answers: ['2'] }), (e) => e.code === 'not_parent');
    const r = await x.b.childAsks.answerVerb(ld, { name: 'c1', answers: ['2'] });
    assert.equal(r.answered, true); assert.equal(r.label, '2. Blue (Recommended)');
    assert.equal(x.answers[0].choice, 2); assert.equal(x.answers[0].toolUseId, 'toolu_C');
    assert.ok(x.events.some((e) => e.kind === 'answer' && e.data.by === 'parent' && e.data.parent === 'ld'));
    // 질문이 없으면 거절
    await assert.rejects(x.b.childAsks.answerVerb(ld, { name: 'c1', answers: ['2'] }), (e) => e.code === 'no_question');
    // 글 답(Claude): Type something
    x.ask(c1, Q({ toolUseId: 'toolu_D', source: undefined }));
    await x.b.childAsks.answerVerb(ld, { name: 'c1', answers: ['Purple'] });
    assert.deepEqual([x.answers[1].choice, x.answers[1].text], [4, 'Purple']);
    // OmO: 번호 키, 닫힘 확인
    const o1 = x.add('o1', { kind: 'omo', parent: ld }); o1.closeOnKey = true;
    x.ask(o1);
    const r2 = await x.b.childAsks.answerVerb(ld, { name: 'o1', answers: ['3'] });
    assert.deepEqual(x.keys.at(-1), ['3']); assert.equal(r2.answered, true);
    assert.ok(x.events.some((e) => e.kind === 'child_ask_end' && e.data.how === 'parent') || o1.rt.askRoute, '답한 뒤 길은 부모가 닫은 것으로');
    // OmO 글 답: 글을 치고 enter. 닫히지 않으면 answered false
    const o2 = x.add('o2', { kind: 'omo', parent: ld });
    x.ask(o2);
    const r3 = await x.b.childAsks.answerVerb(ld, { name: 'o2', answers: ['make it purple'] });
    assert.equal(x.texts.at(-1), 'make it purple'); assert.deepEqual(x.keys.at(-1), ['enter']);
    assert.equal(r3.answered, false);
  } finally { x.stop(); }
});

test('P384 휴대폰 푸시: 부모 처리 중인 하위 질문은 보내지 않고(parent-handles), 올리면 need()가 하위 알림 규칙으로 보낸다', () => {
  const nodes = [{ sessionId: 'L', state: 'ready', parentSessionId: null }, { sessionId: 'W', state: 'waiting', parentSessionId: 'L' }];
  const p = new Pusher({ store: null, subject: 'https://github.com/x/y', batchMs: 60_000, timers: false, tree: () => nodes, transport: async () => ({ status: 201 }) });
  p.subscribe('dev', fakeSub(), 'en');
  const sum = { sessionId: 'W', name: 'W', kind: 'omo', state: 'waiting', workspaceKey: null, askRoute: { parent: 'L', escalated: null } };
  p.onState(sum, 'working');
  assert.ok(p.decisions.some((d) => d.sessionId === 'W' && d.why === 'parent-handles'));
  assert.equal(p.pending.size, 0);
  p.need({ ...sum, askRoute: { parent: 'L', escalated: 1 }, ask: { toolUseId: 'x' } });
  assert.equal(p.pending.size, 1, '올린 질문은 보낸다');
  // 맨 위 세션의 질문은 지금처럼 곧바로
  const p2 = new Pusher({ store: null, subject: 'https://github.com/x/y', batchMs: 60_000, timers: false, tree: () => nodes, transport: async () => ({ status: 201 }) });
  p2.subscribe('dev', fakeSub(), 'en');
  p2.onState({ sessionId: 'L', name: 'L', kind: 'claude', state: 'waiting', workspaceKey: null, askRoute: null }, 'working');
  assert.equal(p2.pending.size, 1);
});

test('P384 계약·안내: answer 동사(계약 14), 하위 오케스트레이션에는 없음, 안내문·스킬에 부모가 답하는 길과 기준', () => {
  assert.equal(CONTRACT_VERSION, 14);
  assert.ok(VERB_NAMES.includes('answer'));
  assert.deepEqual(VERBS.find((v) => v.name === 'answer').out, ['name', 'answered', 'label', 'state', 'next']);
  const sub = permOf({ orch: { on: true }, relation: 'sub', parentId: 'p' });
  assert.deepEqual(opRefusal(sub, 'answer'), { verb: 'answer', why: 'scope' });
  assert.equal(opRefusal(permOf({ orch: { on: true }, verbs: ['help', ...VERB_NAMES] }), 'answer'), null);
  assert.match(orchPromptLines('sub').join(' '), /질문 도구\(Ask user 등\) 대신 `atrium prompt <부모 이름>/);
  for (const t of [BOARD_SYSTEM_PROMPT, HARNESS_PROMPT]) { assert.match(t, /질문 창 대신 `atrium prompt <부모>`/); assert.match(t, /`atrium answer`로 답하고/); assert.match(t, /BRIEF와 다름이면 `atrium ask`/); }
  assert.ok(!/[\r\n"]/.test(HARNESS_PROMPT));
  const s = boardSkill();
  assert.match(s, /atrium answer <이름> <번호\|"글">/);
  assert.match(s, /권한 승인·신뢰 질문으로 멈추면 대신 답하지 않는다/);
  // 알림 글은 질문이 여럿이면 차례로 답하는 법을 말한다
  const two = askNoticeText({ child: 'w1', ask: Q({ questions: [Q().questions[0], { question: 'Size?', options: ['S', 'M'], multiSelect: true }] }) });
  assert.match(two, /질문 1\/2: /); assert.match(two, /질문 2\/2: Size\?/); assert.match(two, /여러 개 고르기/); assert.match(two, /차례로: atrium answer w1 2 1/);
});
