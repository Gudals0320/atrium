// P357 단위 시험: 결정 카드 웹 푸시 규칙(나중·조건 카드는 깨어날 때 한 번, 같은 뜻으로 바뀐 자동 카드는 다시 알리지 않음, 세션마다 쿨다운, 누르면 갈 카드 번호)과
// 사람이 터미널에 직접 친 글로 손 결정·확인 카드를 닫기(via terminal, 다시 열기. P373: 에이전트에게 알리지 않는다, p373 시험). 틀은 p303 시험(진짜 저장소·전달 대기열·Branch, 가짜 에이전트·시계).
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
import { findAsk, findQuestion, isQuestion, isPolite, isCheck } from '../src/auto-ask.mjs';
import { AUTO_FRESH_MS, sameQuestion } from '../src/decisions.mjs';
import { Pusher, pushPayload } from '../src/web-push.mjs';
import { TODO_LATER_MAX, TODO_CMDS_MAX } from '../src/cli-contract.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p357-'));
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 3000) { const t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > ms) throw new Error('until: 시간 초과'); await tick(10); } }

// ---------- 가짜 판: 진짜 저장소·전달 대기열·Branch, 가짜 에이전트 ----------
async function board({ dir = tmp() } = {}) {
  const store = new Store(path.join(dir, 'board.db'));
  const ws = await workspaceOf(dir);
  if (!store.getWorkspace || !store.getWorkspace(ws.key)) try { store.insertWorkspace({ ...ws, createdAt: 1 }); } catch {}
  const cfg = { profile: 'dev', terminalSession: 'atrium-dev-p357test', port: 0, dataDir: dir, sessionsDir: path.join(dir, 'sessions'), inputQuietMs: 3000, submitConfirmMs: 3000, deliveryMaxWaitMs: 60000, submitRetries: 0 };
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
  b.branch = new Branch(b, { readyWaitMs: 30, submitWaitMs: 10, noticeBatchMs: 20, verbs: { pollMs: 15, settleMs: 800, turnGraceMs: 300, answerGraceMs: 200 }, decisions: { answerGraceMs: 150, now: () => b.clock || Date.now() } });
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
const ask = (b, s, o) => b.branch.dispatch('ask', s, o);
const todo = (b, s, o) => b.branch.dispatch('todo', s, o);
const events = (b, kind) => b.store.db.prepare('SELECT * FROM events WHERE kind = ? ORDER BY id').all(kind).map((e) => ({ ...e, data: JSON.parse(e.data || 'null') }));
const pushRec = (b) => { const got = []; b.web = { push: { decision: (it) => got.push(it) } }; return got; };

// ---------- 알림 규칙 ----------
test('P357 알림: 손 결정은 알리고, 나중·조건 카드는 만들 때 알리지 않고 깨어날 때 한 번', async () => {
  const { b, add, stop } = await board();
  try {
    b.clock = Date.now();
    const got = pushRec(b);
    const lead = add('lead');
    const q = ask(b, lead, { question: '이대로 구현할까요?', options: ['예', '아니오'] });
    assert.deepEqual(got.map((x) => x.id), [q.id], '손 결정 카드는 바로');
    todo(b, lead, { text: '키 받으면 넣기', later: '키를 받으면' });
    const when = new Date(b.clock + 2 * 86400000); const ymd = `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, '0')}-${String(when.getDate()).padStart(2, '0')}`;
    const l2 = todo(b, lead, { text: '날짜 일', later: ymd });
    assert.equal(got.length, 1, '조건·날짜 나중에는 만들 때 알리지 않는다');
    b.clock = b.store.getDecision(l2.id).wakeAt + 1;
    assert.equal(b.decisions.wakeDue(), 1);
    assert.equal(got.length, 2); assert.equal(got[1].id, l2.id); assert.ok(got[1].wake, '깨어날 때 한 번(wake)');
    assert.equal(b.decisions.wakeDue(), 0); assert.equal(got.length, 2, '다시 깨우지 않는다');
  } finally { await stop(); }
});

test('P357 알림: 자동 나중에 카드는 알리지 않고, 같은 뜻으로 바뀐 자동 카드는 다시 알리지 않으며, 새 질문은 알린다', async () => {
  const { b, add, stop } = await board();
  try {
    b.clock = Date.now();
    const got = pushRec(b);
    const s = add('worker-lead');
    b.decisions.autoCards(s, [{ kind: 'later', question: 'dev 빌드가 나오면 iPhone으로 열어 보기', when: 'dev 빌드가 나오면' }]);
    assert.equal(got.length, 0, '자동 나중에(조건) 카드');
    assert.equal(events(b, 'decision_quiet').at(-1).data.why, 'later');
    b.decisions.autoCards(s, [{ kind: 'decide', question: '이대로 배포할까요?', options: ['예', '아니오'] }]);
    assert.equal(got.length, 1, '새 결정 질문은 알린다');
    b.clock += 60000;
    b.decisions.autoCards(s, [{ kind: 'decide', question: '이대로 배포할까요', options: ['진행', '보류'] }]); // 보기만 바뀜 → replaced
    assert.equal(b.store.openDecisions(s.sessionId).filter((d) => d.auto && d.kind === 'decide').length, 1);
    assert.equal(got.length, 1, '같은 뜻으로 바뀐 카드는 다시 알리지 않는다');
    assert.equal(events(b, 'decision_quiet').at(-1).data.why, 'same');
    b.clock += 60000;
    b.decisions.autoCards(s, [{ kind: 'check', question: '첫 화면이 뜨는지 확인해 주세요' }]);
    assert.equal(got.length, 2, '실제로 새 질문이면 알린다');
  } finally { await stop(); }
});

test('P357 같은 뜻 판정', () => {
  assert.equal(sameQuestion('dev 빌드가 나오면 iPhone으로 열어 보기', 'dev 빌드가 나오면 iPhone으로 열어보기.'), true);
  assert.equal(sameQuestion('Push the branch?', 'push the branch'), true);
  assert.equal(sameQuestion('PR 올리기', '배포하기'), false);
  assert.equal(sameQuestion('', '배포하기'), false);
});

test('P357 웹 푸시: 같은 세션 결정 카드는 쿨다운 안에 한 번, 누르면 갈 카드 번호(decisionId)를 싣는다', () => {
  const p = new Pusher({ store: null, timers: false, batchMs: 60000, now: () => 1000 });
  try {
    p.mem = [{ deviceId: 'd1', endpoint: 'https://fcm.googleapis.com/x' }];
    p.decision({ id: 7, sessionId: 's1', name: 'lead' });
    p.decision({ id: 8, sessionId: 's1', name: 'lead' });
    assert.equal(p.decisions.at(-1).why, 'cooldown');
    const items = [...p.pending.get('d1').items.values()];
    assert.equal(items.length, 1); assert.equal(items[0].decisionId, 7);
    const one = pushPayload(items, 'ko', 5);
    assert.equal(one.kind, 'decision'); assert.equal(one.decisionId, 7);
    const many = pushPayload([{ sessionId: 'a', name: 'a', kind: 'done' }, { sessionId: 'b', name: 'b', kind: 'decision', decisionId: 9 }], 'en', 5);
    assert.equal(many.kind, 'batch'); assert.equal(many.decisionId, 9); assert.equal(many.sessionId, 'b');
    assert.equal(pushPayload([{ sessionId: 'a', name: 'a', kind: 'done' }], 'en', 5).decisionId, undefined);
  } finally { p.stop(); }
});

// ---------- 터미널 글로 손 카드 닫기(사용자 결정, P303을 갈음) ----------
test('P357 터미널 글: 손 결정·확인은 닫고(via terminal) 실행·나중에·갓 만든 카드는 남긴다. 명령 바 글은 손 카드를 닫지 않는다', async () => {
  const { b, add, busy, stop } = await board();
  try {
    b.clock = Date.now() - 60000;
    const lead = add('lead');
    const q = ask(b, lead, { question: '이대로 구현할까요?', options: ['예', '아니오'] });
    const c = todo(b, lead, { text: '화면 보기', check: true });
    const d = todo(b, lead, { text: '명령 치기', cmds: ['ls'] });
    const l = todo(b, lead, { text: '나중 일', later: '키를 받으면' });
    b.clock = Date.now();
    const fresh = ask(b, lead, { question: '방금 만든 질문?' });
    assert.equal(b.decisions.onHuman(lead.sessionId, 'bar'), 0, '명령 바·휴대폰 글은 지금처럼');
    for (const x of [q, c, d, l, fresh]) assert.equal(b.store.getDecision(x.id).state, 'open');
    b.queue.inspect = async () => ({ box: 'empty' }); // 입력 칸이 비어 있다(그 턴에 넣을 수 있다)
    busy(lead); // 사람이 터미널에 친 글로 턴이 열렸다
    assert.equal(b.decisions.onHuman(lead.sessionId, 'terminal'), 2);
    for (const x of [q, c]) { const r = b.store.getDecision(x.id); assert.equal(r.state, 'answered'); assert.equal(r.via, 'terminal'); assert.equal(r.answer, null); assert.equal(r.held, false); }
    for (const x of [d, l, fresh]) assert.equal(b.store.getDecision(x.id).state, 'open', x.id);
    const end = events(b, 'decision_end').filter((e) => e.data.via === 'terminal');
    assert.equal(end.length, 1); assert.deepEqual(end[0].data.ids, [q.id, c.id]);
    // 할 일 목록의 "터미널에서 답함" 줄
    const list = b.decisions.handlers()['decision.list']();
    assert.deepEqual(list.recent.map((x) => x.id).sort(), [q.id, c.id].sort());
    // P373: 에이전트에게는 아무 글도 넣지 않는다(p373 시험)
    await tick(200);
    assert.equal(b.sent.filter((x) => x.sid === lead.sessionId).length, 0);
  } finally { await stop(); }
});

test('P357 다시 열기: 에이전트(--reopen)와 사람(decision.reopen)', async () => {
  const { b, add, busy, stop } = await board();
  try {
    b.clock = Date.now() - 60000;
    const lead = add('lead');
    const q = ask(b, lead, { question: '이대로 갈까요?' });
    const c = todo(b, lead, { text: '보기', check: true });
    b.clock = Date.now();
    busy(lead);
    b.decisions.onHuman(lead.sessionId, 'terminal');
    const r = ask(b, lead, { reopen: String(q.id) });
    assert.equal(r.reopened, true); assert.equal(b.store.getDecision(q.id).state, 'open'); assert.equal(b.store.getDecision(q.id).via, null);
    assert.equal(ask(b, lead, { reopen: q.id }).reopened, false, '이미 열림');
    const h = b.decisions.handlers()['decision.reopen']({ id: c.id }, {});
    assert.equal(h.reopened, true); assert.equal(b.store.getDecision(c.id).state, 'open');
    assert.deepEqual(events(b, 'decision_reopen').map((e) => [e.data.id, e.data.by, e.data.from]), [[q.id, 'agent', 'terminal'], [c.id, 'pc', 'terminal']]);
    assert.equal(b.decisions.handlers()['decision.list']().recent.length, 0);
    const other = add('other');
    assert.throws(() => ask(b, other, { reopen: q.id }), /없다/);
  } finally { await stop(); }
});
