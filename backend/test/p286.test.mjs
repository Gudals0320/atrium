// P286 단위 시험: 판 자동 결정 카드. 질문 찾기(auto-ask.mjs), 자동 카드 수명(만듦·바뀜·직접 글 닫힘·제외·끔), 안내문 한 줄, 설정.
// 진짜 저장소·전달 대기열(B1)·Branch, 가짜 에이전트(p284 시험의 틀). herdr·hc와 claude 없이 돈다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import { Store } from '../src/store.mjs';
import { newRuntime, applyHook, applyTermStatus, deriveState } from '../src/state.mjs';
import { workspaceOf } from '../src/git.mjs';
import { DeliveryQueue } from '../src/delivery.mjs';
import { Branch, boardSkill, ATRIUM_ALLOW } from '../src/branch.mjs';
import { CONTRACT_VERSION, VERB_NAMES, VERBS, shortHelp, ASK_OPEN_MAX, ASK_QUESTION_MAX, ASK_OPTIONS_MAX } from '../src/cli-contract.mjs';
import { BOARD_SYSTEM_PROMPT } from '../src/launch.mjs';
import { HARNESS_PROMPT } from '../src/harness.mjs';
import { findQuestion, isQuestion, optionOf } from '../src/auto-ask.mjs';
import { SETTINGS, DEFAULTS } from '../src/settings.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p286-'));
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 3000) { const t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > ms) throw new Error('until: 시간 초과'); await tick(10); } }

// ---------- 가짜 판: 진짜 저장소·전달 대기열·Branch, 가짜 에이전트 ----------
async function board({ dir = tmp() } = {}) {
  const store = new Store(path.join(dir, 'board.db'));
  const ws = await workspaceOf(dir);
  if (!store.getWorkspace || !store.getWorkspace(ws.key)) try { store.insertWorkspace({ ...ws, createdAt: 1 }); } catch {}
  const cfg = { profile: 'dev', terminalSession: 'atrium-dev-p286test', port: 0, dataDir: dir, sessionsDir: path.join(dir, 'sessions'), inputQuietMs: 3000, submitConfirmMs: 3000, deliveryMaxWaitMs: 60000, submitRetries: 0 };
  const b = {
    cfg, apiToken: 'board-api-token', store, sessions: new Map(), bus: new EventEmitter(), killing: new Set(), sent: [], spawned: [],
    api: { broadcast: () => {} }, log: () => {}, requireTerminal: () => {},
    adapter: { backend: 'hc', connected: true, readScreen: async () => '' },
    hooked: (s) => s.rt.hooked !== false,
    summary: (s) => { const d = deriveState(s.rt); return { state: d.state, ask: d.ask || null, error: d.error || null }; },
    ensureLink(from, to, patch = {}) {
      let l = store.linkByPair(from, to);
      if (!l) { l = { linkId: 'l' + crypto.randomBytes(4).toString('hex'), from, to, role: patch.role ?? null, spawned: !!patch.spawned, observed: !!patch.observed, createdAt: Date.now() }; store.insertLink(l); }
      return store.getLink(l.linkId);
    },
    linkEvent(l, kind, text = null, data = null) { return store.addLinkEvent(l.linkId, kind, text, data); },
    // 상태가 바뀌면 판처럼 bus로 알린다(Branch.onSession → WorkUnits.onSession)
    broadcastSession(s) { if (b.sessions.has(s.sessionId)) b.bus.emit('session', s, b.summary(s)); },
    async spawn(p) {
      const s = add(p.name, { parentSessionId: p.parentSessionId || null });
      if (p.branch) b.branch.noteChild(s.sessionId, p.branch);
      b.spawned.push(p);
      return { sessionId: s.sessionId, trust: { needsTrust: false } };
    },
    closeSession(s, reason) { b.sessions.delete(s.sessionId); store.updateSession(s.sessionId, { closedAt: Date.now() }); b.bus.emit('closed', s, reason); },
  };
  b.queue = new DeliveryQueue({
    store, cfg,
    view: (sid) => { const s = b.sessions.get(sid); if (!s) return { closed: true }; return { state: deriveState(s.rt).state, agentPresent: s.rt.term.present, termConnected: true, lastUserInputAt: 0, closed: false, kind: s.kind, hooked: b.hooked(s) }; },
    send: async (sid, text) => { if (b.stopped) return; b.sent.push({ sid, text }); const s = b.sessions.get(sid); if (s && s.agent) setTimeout(() => s.agent(text), 5); },
  });
  b.queue.start();
  b.branch = new Branch(b, { readyWaitMs: 30, submitWaitMs: 10, noticeBatchMs: 20, verbs: { pollMs: 15, settleMs: 800, turnGraceMs: 300, answerGraceMs: 200 }, decisions: { answerGraceMs: 150 } });
  b.queue.on('delivery', (d) => { if (['confirmed', 'unconfirmed', 'failed', 'cancelled'].includes(d.status)) b.branch.onDeliveryEnd(d); });
  // 가짜 에이전트: 글을 받으면 일하고(workMs) 쉰다. onText(text, s)는 일하는 중에 부른다(done을 치는 워커 등)
  const add = (name, { kind = 'claude', hooked = kind === 'claude', workMs = 80, onText = null, ...extra } = {}) => {
    const s = { sessionId: crypto.randomUUID(), name, cwd: dir, paneId: `${name}:p1`, agentName: name, permissionMode: 'manual', kind, origin: 'board', parentSessionId: null, workspaceKey: ws.key, rt: newRuntime({ kind, hooked }), createdAt: Date.now(), ...extra };
    idle(s);
    store.insertSession({ ...s, settingsPath: '', hookToken: '', runtime: s.rt });
    b.sessions.set(s.sessionId, s);
    s.texts = [];
    s.agent = (text) => {
      s.texts.push(text);
      if (hooked) { applyHook(s.rt, { hook_event_name: 'UserPromptSubmit', prompt: text }); b.queue.onUserPromptSubmit(s.sessionId, text); applyTermStatus(s.rt, 'working'); }
      else { applyTermStatus(s.rt, 'working'); b.queue.onAgentWorking(s.sessionId); }
      b.broadcastSession(s);
      const h = s.onText || onText;
      setTimeout(async () => {
        if (b.stopped) return;
        if (h) try { await h(text, s); } catch (e) { s.err = e; }
        if (b.stopped) return;
        if (hooked) applyHook(s.rt, { hook_event_name: 'Stop', last_assistant_message: `답: ${text.slice(-20)}` });
        applyTermStatus(s.rt, 'idle');
        b.broadcastSession(s);
      }, workMs);
    };
    b.broadcastSession(s);
    return s;
  };
  const busy = (s) => { applyHook(s.rt, { hook_event_name: 'UserPromptSubmit', prompt: '사람의 일' }); applyTermStatus(s.rt, 'working'); b.broadcastSession(s); };
  const rest = (s) => { applyHook(s.rt, { hook_event_name: 'Stop', last_assistant_message: '끝' }); applyTermStatus(s.rt, 'idle'); b.broadcastSession(s); };
  return { b, dir, ws, add, busy, rest, stop: async () => { b.stopped = true; b.queue.stop(); b.branch.notices.stop(); await tick(400); store.close(); } };
}
function idle(s) { s.rt.term.present = true; s.rt.phase = 'running'; applyTermStatus(s.rt, 'idle'); }
const U = (b) => b.branch.units;
const units = (b) => b.store.db.prepare('SELECT * FROM work_units').all();
const tries = (b) => b.store.db.prepare('SELECT * FROM unit_tries').all();
const toParent = (b, p) => b.store.db.prepare('SELECT * FROM deliveries WHERE session_id = ?').all(p.sessionId);
function serve(b) {
  const srv = http.createServer((req, res) => { if (!b.branch.handleHttp(req, res)) { res.writeHead(404); res.end(); } });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => { b.cfg.port = srv.address().port; r(srv); }));
}
function runCli(args, env) {
  return new Promise((resolve) => {
    const clean = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(MTASK_|ATRIUM_|HERDR_|HC_)/.test(k)));
    execFile(process.execPath, [path.join(HERE, '..', 'bin', 'atrium-child.mjs'), ...args], { env: { ...clean, ...env }, timeout: 30000 }, (err, stdout, stderr) => resolve({ code: err ? err.code : 0, stdout, stderr }));
  });
}
const envOf = (b, s) => ({ ATRIUM_PORT: String(b.cfg.port), ATRIUM_SESSION_ID: s.sessionId, ATRIUM_SESSION_TOKEN: b.branch.token(s.sessionId), ATRIUM_TERMINAL_SESSION: b.cfg.terminalSession });




// ---------- P286 ----------
const D = (b) => b.store.db.prepare('SELECT * FROM decisions ORDER BY id').all();
const openOf = (b, s) => b.store.openDecisions(s.sessionId);
const events = (b, kind) => b.store.db.prepare('SELECT * FROM events WHERE kind = ? ORDER BY id').all(kind).map((e) => ({ ...e, data: JSON.parse(e.data || 'null') }));
const ask = (b, s, o) => b.branch.dispatch('ask', s, o);
const err = (fn) => { try { fn(); } catch (e) { return e; } return null; };
// 한 턴: 지시(hook) → 일 → 답(Stop) → 쉼
function turn(b, s, answer, { prompt = '사람의 일', mid = null } = {}) {
  applyHook(s.rt, { hook_event_name: 'UserPromptSubmit', prompt }); applyTermStatus(s.rt, 'working'); b.broadcastSession(s);
  if (mid) mid();
  applyHook(s.rt, { hook_event_name: 'Stop', last_assistant_message: answer }); applyTermStatus(s.rt, 'idle'); b.broadcastSession(s);
}

test('P286 질문 찾기: 한국어·영어 묻는 글, 코드 덩어리 안 물음표 무시, 질문 없음, 번호 목록·굵은 이름 보기', () => {
  const q = (t) => findQuestion(t);
  // 한국어
  assert.equal(q('그림을 다 찍었습니다.\n\n이대로 마무리할까요?').question, '이대로 마무리할까요?');
  assert.equal(q('끝났습니다. 다음 단계로 넘어갈까').question, '다음 단계로 넘어갈까');
  assert.equal(q('두 길이 있습니다.\n\n어느 쪽으로 갈지 정해 주세요.').question, '어느 쪽으로 갈지 정해 주세요.');
  assert.equal(q('바꾼 파일은 셋입니다. 원하는 이름을 말씀해 주세요.').question, '원하는 이름을 말씀해 주세요.');
  assert.equal(q('배포 전에 화면을 확인해 주세요.').question, '배포 전에 화면을 확인해 주세요.');
  assert.equal(q('이 방법이 괜찮나요').question, '이 방법이 괜찮나요');
  assert.equal(q('정리했습니다.\n\n**어떤 방식으로 진행할까요?**').question, '어떤 방식으로 진행할까요?');
  // 영어
  assert.equal(q('Done. Should I push the branch?').question, 'Should I push the branch?');
  assert.equal(q('I updated the file.\n\nLet me know if you want changes.').question, 'Let me know if you want changes.');
  assert.equal(q('Which option do you prefer? I will wait.').question, 'Which option do you prefer?');
  assert.equal(q('Option A or B?\n\nI will wait for your answer.').question, 'Option A or B?');
  // 코드 덩어리 안 물음표, 줄 안 코드의 물음표는 무시
  assert.equal(q('Fixed the regex:\n\n```js\nconst re = /a?b?/;\nwhy?\n```'), null);
  assert.equal(q('Changed `x ?? y` to `x || y`.'), null);
  // 질문 없음, 질문이 끝이 아님
  assert.equal(q('모든 시험이 통과했습니다.'), null);
  assert.equal(q(''), null); assert.equal(q(null), null);
  assert.equal(q('왜 그럴까요? 원인은 캐시였습니다.\n\n고쳤고 시험도 통과했습니다. 브랜치에 커밋했습니다.\n그리고 기록을 남겼습니다.\n정리도 했습니다.\n끝입니다.'), null);
  assert.equal(q('Summary:\n- did x\n- did y\n\nAll tests pass.'), null);
  // 번호 목록 보기(질문 앞, 질문 뒤), 굵은 이름 보기
  const a = q('두 길이 있습니다.\n\n1. A안: 빠르게 고친다\n2. B안: 다시 만든다\n\n어느 쪽으로 할까요?');
  assert.deepEqual(a.options, ['1. A안: 빠르게 고친다', '2. B안: 다시 만든다']);
  assert.deepEqual(q('어느 쪽으로 할까요?\n\n1. 진행\n2. 멈춤\n3. 다시').options, ['1. 진행', '2. 멈춤', '3. 다시']);
  assert.deepEqual(q('Pick one:\n1. **Fast**: patch it\n2. **Clean**: rewrite\nWhich do you want?').options, ['Fast', 'Clean']);
  assert.deepEqual(q('- **A**: 하나\n- **B**: 둘\n\n어느 쪽으로 갈지 골라 주세요.').options, ['A', 'B']);
  assert.deepEqual(q('1. a\n2. b\n3. c\n4. d\n5. e\n\n어느 것으로 할까요?').options, [], '5개 넘으면 보기가 아니다');
  assert.deepEqual(q('- 그냥 목록\n- 둘째\n\n이대로 할까요?').options, [], '굵은 이름 없는 점 목록은 보기가 아니다');
  assert.equal(optionOf('3) 세 번째 길'), '3. 세 번째 길');
  // 개발용 판 haiku 답(굵은 머리가 설명 문단 위에 있고 그 이름이 질문에 나온다)과 이어진 질문 문장 묶기
  const h = q('**A: `check-auto.mjs`**\n동사 설명.\n\n**B: `auto-check.mjs`**\n수식어 설명.\n\n두 이름 모두 문제는 없습니다.\n\n어느 이름으로 할까요? **A(`check-auto.mjs`)와 B(`auto-check.mjs`) 중에서 선택해 주세요.**');
  assert.equal(h.question, '어느 이름으로 할까요? A(`check-auto.mjs`)와 B(`auto-check.mjs`) 중에서 선택해 주세요.');
  assert.deepEqual(h.options, ['A: check-auto.mjs', 'B: auto-check.mjs']);
  assert.deepEqual(q('**Fast**: patch\n\n**Clean**: rewrite\n\nShould I do it now?').options, [], '질문에 이름이 없으면 보기가 아니다');
  assert.deepEqual(q('**A: `tests-auto`**\n설명.\n\n**B: `auto-tests`**\n설명.\n\n**A(`tests-auto`)와 B(`auto-tests`) 중에서 선택해 주세요.**').options, ['A: tests-auto', 'B: auto-tests'], '굵게 쓴 질문 줄은 보기가 아니다');
  assert.ok(isQuestion('Shall we?')); assert.ok(!isQuestion('끝.'));
  // 긴 질문은 줄인다
  assert.ok(q('x'.repeat(400) + '?').question.length <= 200);
});

test('P286 안내문 한 줄과 설정: 턴을 끝낼 때 atrium ask, 자동 결정 카드 설정(기본 켬)', () => {
  const lines = BOARD_SYSTEM_PROMPT.split('\n').filter((l) => l.includes('atrium ask'));
  assert.equal(lines.length, 1); assert.match(lines[0], /턴을 끝낼 때는/); assert.match(lines[0], /--option/);
  assert.match(HARNESS_PROMPT, /턴을 끝낼 때는 글로 묻고 그 질문을 `atrium ask/); assert.doesNotMatch(HARNESS_PROMPT, /["\n]/);
  assert.equal(SETTINGS.autoDecisions.type, 'boolean'); assert.equal(DEFAULTS.autoDecisions, true);
});

test('P286 자동 카드: 묻는 글로 끝난 턴 → 자동 카드(보기·맥락·이벤트·푸시), 질문 없음 → 없음, 다음 질문이 바꿈, 같은 질문은 그대로', async () => {
  const { b, add, stop } = await board();
  const pushed = []; const changed = [];
  b.web = { push: { decision: (it) => pushed.push(it) } };
  b.api.broadcast = (ev, d) => { if (ev === 'decision.changed') changed.push(d); };
  try {
    const lead = add('lead');
    turn(b, lead, '그림 둘을 찍었습니다.\n\n1. A안\n2. B안\n\n어느 쪽으로 할까요?');
    let rows = D(b);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].auto, 1); assert.equal(rows[0].question, '어느 쪽으로 할까요?'); assert.deepEqual(JSON.parse(rows[0].options), ['1. A안', '2. B안']);
    assert.equal(rows[0].why, '그림 둘을 찍었습니다.');
    assert.equal(b.store.getDecision(rows[0].id).auto, true);
    assert.equal(pushed.length, 1); assert.equal(pushed[0].id, rows[0].id);
    assert.equal(changed.at(-1).cards[0].auto, true);
    assert.equal(events(b, 'decision_auto').length, 1);
    // 질문 없는 턴 → 새 카드 없음(옛 자동 카드는 그대로)
    turn(b, lead, '고쳤습니다. 시험이 통과했습니다.');
    assert.equal(D(b).length, 1); assert.equal(openOf(b, lead).length, 1);
    // 같은 질문 → 그대로(푸시도 없음)
    turn(b, lead, '아직 기다립니다.\n\n1. A안\n2. B안\n\n어느 쪽으로 할까요?');
    assert.equal(D(b).length, 1); assert.equal(pushed.length, 1);
    // 다른 질문 → 옛 자동 카드는 replaced로 닫고 새로
    turn(b, lead, 'Done. Should I push the branch?');
    rows = D(b);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].state, 'closed'); assert.equal(rows[0].via, 'replaced');
    assert.equal(rows[1].state, 'open'); assert.equal(rows[1].question, 'Should I push the branch?'); assert.equal(rows[1].why, null, '답이 한 줄이면 맥락은 비운다');
    assert.equal(openOf(b, lead).length, 1);
    assert.deepEqual(events(b, 'decision_auto').at(-1).data.replaced, [rows[0].id]);
    assert.ok(events(b, 'decision_end').some((e) => e.data.via === 'replaced' && e.data.auto === true));
    // 답하기 → 리드에 들어가고 끝난 자동 카드로 센다
    b.branch.handlers['decision.answer']({ id: rows[1].id, answer: 'push' }, { kind: 'desktop' });
    const end = events(b, 'decision_end').at(-1);
    assert.equal(end.data.state, 'answered'); assert.equal(end.data.auto, true);
    await until(() => lead.texts.some((t) => t.startsWith('[결정] Should I push the branch? → push')));
  } finally { await stop(); }
});

test('P286 자동 카드를 만들지 않음: 손 카드가 열려 있음, 이 턴에 손 카드를 만듦, 오류·응답 필요 턴, 하위 세션, merger, 끔', async () => {
  const { b, add, stop } = await board();
  try {
    const lead = add('lead');
    // 열린 손 카드
    const m = ask(b, lead, { question: '손으로 남긴 질문' });
    turn(b, lead, '이대로 할까요?');
    assert.equal(D(b).filter((r) => r.auto).length, 0);
    ask(b, lead, { done: m.id });
    // 이 턴에 손 카드를 만들고 닫았다(--done)
    turn(b, lead, '이대로 할까요?', { mid: () => { const x = ask(b, lead, { question: '이대로 할까요?' }); ask(b, lead, { done: x.id }); } });
    assert.equal(D(b).filter((r) => r.auto).length, 0);
    // 오류로 끝난 턴
    applyHook(lead.rt, { hook_event_name: 'UserPromptSubmit', prompt: '일' }); applyTermStatus(lead.rt, 'working'); b.broadcastSession(lead);
    applyHook(lead.rt, { hook_event_name: 'StopFailure', error: 'rate_limit' }); applyTermStatus(lead.rt, 'idle'); b.broadcastSession(lead);
    assert.equal(b.summary(lead).state, 'error');
    assert.equal(D(b).filter((r) => r.auto).length, 0);
    // 응답 필요(권한 질문)로 멈춘 턴
    const l2 = add('lead2');
    applyHook(l2.rt, { hook_event_name: 'UserPromptSubmit', prompt: '일' }); applyTermStatus(l2.rt, 'working'); b.broadcastSession(l2);
    applyHook(l2.rt, { hook_event_name: 'PermissionRequest', tool_name: 'Bash', tool_input: { command: 'ls' }, tool_use_id: 't1' }); applyTermStatus(l2.rt, 'blocked'); b.broadcastSession(l2);
    assert.equal(b.summary(l2).state, 'waiting');
    assert.equal(D(b).filter((r) => r.auto).length, 0);
    // 하위 세션
    const r2 = await b.branch.spawnChild(lead, { name: 'w1', prompt: '일', wait: false });
    const w1 = b.sessions.get(r2.sessionId) || [...b.sessions.values()].find((x) => x.name === 'w1');
    await tick(300);
    turn(b, w1, '부모님, 이대로 할까요?');
    // merger
    const mg = add('merger-1', { mergerKey: 'ws|dev' });
    turn(b, mg, '합칠까요?');
    // 끔
    const l3 = add('lead3');
    b.decisions.autoSetting = () => false;
    turn(b, l3, '이대로 할까요?');
    b.decisions.autoSetting = null;
    assert.equal(D(b).filter((r) => r.auto).length, 0);
    // 다시 켜면 만든다(같은 세션)
    turn(b, l3, '이대로 할까요?');
    assert.equal(D(b).filter((r) => r.auto).length, 1);
  } finally { await stop(); }
});

test('P286 직접 글 → 자동 카드 닫힘, 세션 닫힘 → closed, hook 없는 종류는 화면 답을 기다림', async () => {
  const { b, add, stop } = await board();
  try {
    const lead = add('lead');
    turn(b, lead, '어느 쪽으로 할까요?');
    assert.equal(openOf(b, lead).length, 1);
    b.decisions.onHuman(lead.sessionId, 'bar');
    const r = D(b)[0];
    assert.equal(r.state, 'answered'); assert.equal(r.via, 'session');
    assert.deepEqual(events(b, 'decision_end').at(-1).data.autoIds, [r.id]);
    // 다음 질문은 새 자동 카드
    turn(b, lead, 'Should I continue?');
    assert.equal(openOf(b, lead).length, 1);
    // hook 없는 종류: 턴이 끝난 뒤 판이 화면에서 답을 고르면 그 답으로
    const cx = add('cx', { kind: 'codex', hooked: false });
    applyTermStatus(cx.rt, 'working'); b.broadcastSession(cx);
    applyTermStatus(cx.rt, 'idle'); b.broadcastSession(cx);
    assert.equal(openOf(b, cx).length, 0, '화면 답 전에는 만들지 않는다');
    cx.rt.lastAnswer = '두 가지가 있습니다.\n1. **빠르게**\n2. **깔끔하게**\n어느 쪽으로 할까요?'; cx.rt.lastAnswerAt = Date.now(); cx.rt.answerSource = 'screen';
    b.bus.emit('screenAnswer', cx);
    const c = openOf(b, cx);
    assert.equal(c.length, 1); assert.deepEqual(c[0].options, ['빠르게', '깔끔하게']); assert.equal(c[0].auto, true);
    // 화면 답이 오지 않으면(시간 초과) 옛 답으로 만들지 않는다
    const cy = add('cy', { kind: 'codex', hooked: false });
    cy.rt.lastAnswer = '옛 질문일까요?'; cy.rt.lastAnswerAt = Date.now() - 60000;
    applyTermStatus(cy.rt, 'working'); b.broadcastSession(cy);
    applyTermStatus(cy.rt, 'idle'); b.broadcastSession(cy);
    await tick(300);
    assert.equal(openOf(b, cy).length, 0);
    // 세션 닫힘
    b.closeSession(lead, 'test');
    await tick(20);
    assert.equal(b.store.openDecisions(lead.sessionId).length, 0);
  } finally { await stop(); }
});

test('P286 답 모아 보내기: 열린 카드가 남으면 모으고, 모두 끝나면 한 글로(무시는 더하지 않음), 지금 보내기, 자동 카드도 같음', async () => {
  const { b, add, stop } = await board();
  const changed = [];
  b.api.broadcast = (ev, d) => { if (ev === 'decision.changed') changed.push(d); };
  const h = b.branch.handlers;
  const dl = (s) => b.store.db.prepare('SELECT * FROM deliveries WHERE session_id = ? ORDER BY created_at').all(s.sessionId);
  try {
    const lead = add('lead');
    const n0 = dl(lead).length;
    const c1 = ask(b, lead, { question: '첫째 질문?', options: ['가', '나'] });
    const c2 = ask(b, lead, { question: '둘째 질문?' });
    const c3 = ask(b, lead, { question: '셋째 질문?' });
    const r1 = h['decision.answer']({ id: c1.id, answer: '가' }, { kind: 'desktop' });
    assert.equal(r1.held, true); assert.equal(r1.waiting, 1); assert.equal(r1.deliveryId, null);
    assert.equal(dl(lead).length, n0, '열린 카드가 남으면 보내지 않는다');
    assert.deepEqual(changed.at(-1).held, { [lead.sessionId]: 1 });
    assert.deepEqual(h['decision.list']().held, { [lead.sessionId]: 1 });
    h['decision.ignore']({ id: c3.id });
    assert.equal(dl(lead).length, n0);
    const r2 = h['decision.answer']({ id: c2.id, answer: '직접 쓴 답' }, { kind: 'desktop' });
    assert.equal(r2.held, false); assert.ok(r2.deliveryId);
    const ds = dl(lead);
    assert.equal(ds.length, n0 + 1, '두 답이 한 전달로');
    assert.equal(ds.at(-1).text, '[결정] 첫째 질문? → 가\n[결정] 둘째 질문? → 직접 쓴 답');
    assert.equal(ds.at(-1).origin, 'human');
    assert.deepEqual(changed.at(-1).held, {});
    assert.ok(events(b, 'decision_flush').some((e) => e.data.why === 'all' && e.data.ids.length === 2));
    await until(() => lead.texts.some((t) => t.startsWith('[결정] 첫째 질문? → 가\n[결정] 둘째')));
    // 지금 보내기: 열린 카드가 남아도 모은 답만 보낸다
    const d1 = ask(b, lead, { question: 'A?' }); const d2 = ask(b, lead, { question: 'B?' });
    h['decision.answer']({ id: d1.id, answer: 'a' });
    const n1 = dl(lead).length;
    const f = h['decision.flush']({ sessionId: lead.sessionId });
    assert.deepEqual(f.ids, [d1.id]); assert.equal(dl(lead).length, n1 + 1); assert.equal(dl(lead).at(-1).text, '[결정] A? → a');
    assert.equal(err(() => h['decision.flush']({ sessionId: lead.sessionId })).code, 'nothing_held');
    assert.equal(b.store.openDecisions(lead.sessionId).length, 1);
    // 남은 카드 하나에 답하면 곧바로 보낸다
    h['decision.answer']({ id: d2.id, answer: 'b' });
    assert.equal(dl(lead).at(-1).text, '[결정] B? → b');
    // 손 카드 하나 + 자동 카드 하나도 같다(손 카드가 열려 있으면 자동 카드는 만들지 않으니, 자동 카드 뒤 손 카드)
    const l2 = add('lead2');
    turn(b, l2, '1. 왼쪽\n2. 오른쪽\n\n어느 쪽으로 할까요?');
    assert.equal(b.store.openDecisions(l2.sessionId)[0].why, null, '첫 줄이 보기 목록이면 맥락은 비운다');
    const auto = b.store.openDecisions(l2.sessionId)[0]; assert.equal(auto.auto, true);
    const m2 = ask(b, l2, { question: '손 질문?' });
    const n2 = dl(l2).length;
    h['decision.answer']({ id: auto.id, answer: '1. 왼쪽' });
    assert.equal(dl(l2).length, n2);
    h['decision.answer']({ id: m2.id, answer: '예' });
    assert.equal(dl(l2).length, n2 + 1); assert.equal(dl(l2).at(-1).text, '[결정] 어느 쪽으로 할까요? → 1. 왼쪽\n[결정] 손 질문? → 예');
  } finally { await stop(); }
});

test('P286 답 모아 보내기와 사람의 직접 글: 명령 바 글은 앞에 붙여 한 전달(takeHeld), 터미널 글은 그 뒤 한 글, 세션 닫힘은 버림, --done도 마무리', async () => {
  const { b, add, stop } = await board();
  const h = b.branch.handlers;
  const dl = (s) => b.store.db.prepare('SELECT * FROM deliveries WHERE session_id = ? ORDER BY created_at').all(s.sessionId);
  try {
    const lead = add('lead');
    // 명령 바(session.send)의 길: takeHeld로 꺼내 사람 글 앞에 붙인 뒤 onHuman → 남은 열린 카드만 닫고 따로 보내지 않는다
    const a1 = ask(b, lead, { question: 'Q1?' }); ask(b, lead, { question: 'Q2?' });
    h['decision.answer']({ id: a1.id, answer: 'x' });
    const held = b.decisions.takeHeld(lead.sessionId);
    assert.deepEqual(held, { ids: [a1.id], text: '[결정] Q1? → x', now: 1, next: 0 }); // P295: now·next 수
    const n0 = dl(lead).length;
    b.decisions.onHuman(lead.sessionId, 'bar');
    assert.equal(dl(lead).length, n0, '이미 앞에 붙였다');
    assert.equal(b.store.openDecisions(lead.sessionId).length, 0);
    // 터미널에 직접 친 글(이미 제출됨): 열린 카드를 닫고 모은 답은 그 턴에 스티어링으로(P295: rideOnly, 턴을 새로 만들지 않는다)
    const t1 = ask(b, lead, { question: 'T1?' }); const t2 = ask(b, lead, { question: 'T2?' }); ask(b, lead, { question: 'T3?' });
    h['decision.answer']({ id: t1.id, answer: '1' }); h['decision.answer']({ id: t2.id, answer: '2' });
    const n1 = dl(lead).length;
    b.cfg.rideGraceMs = 50; // P295: 턴을 못 본 채 이만큼 지나면 취소
    b.decisions.onHuman(lead.sessionId, 'terminal');
    assert.equal(dl(lead).length, n1 + 1); assert.equal(dl(lead).at(-1).text, '[결정] T1? → 1\n[결정] T2? → 2');
    assert.ok(events(b, 'decision_flush').some((e) => e.data.why === 'ride_steer'));
    await until(() => b.store.heldAnswers(lead.sessionId).length === 2); // 쉬는 세션이라 그 턴에 넣지 못하고 취소 → 다시 붙잡는다(P295)
    b.decisions.flushNow({ sessionId: lead.sessionId });
    // 에이전트가 --done으로 마지막 열린 카드를 닫으면 모은 답을 보낸다
    const e1 = ask(b, lead, { question: 'E1?' }); const e2 = ask(b, lead, { question: 'E2?' });
    h['decision.answer']({ id: e1.id, answer: 'y' });
    const n2 = dl(lead).length;
    ask(b, lead, { done: e2.id });
    assert.equal(dl(lead).length, n2 + 1); assert.equal(dl(lead).at(-1).text, '[결정] E1? → y');
    // 세션이 닫히면 모은 답은 버린다(보내지 않는다)
    const g1 = ask(b, lead, { question: 'G1?' }); ask(b, lead, { question: 'G2?' });
    h['decision.answer']({ id: g1.id, answer: 'z' });
    b.closeSession(lead, 'test');
    await tick(20);
    assert.equal(b.store.heldAnswers(lead.sessionId).length, 0);
    assert.ok(events(b, 'decision_flush').some((e) => e.data.why === 'closed'));
  } finally { await stop(); }
});
