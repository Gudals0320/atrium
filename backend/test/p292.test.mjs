// P292 단위 시험: 사용자 몫(결정 카드를 넓힌 종류 넷). 종류별 만들기·상한, 했음(--tell 있음/없음), 확인 결과 전달, 미루기·날짜 나중이 숨었다 뜸(가짜 시계),
// 조건 나중은 "나중"에, 답 모으기 줄 꼴, 자동 할 일·확인 뽑기(한국어·영어), 옛 decide 카드 그대로, CLI atrium todo.
// 진짜 저장소·전달 대기열(B1)·Branch, 가짜 에이전트(p286 시험의 틀). herdr·hc와 claude 없이 돈다.
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
import { findAsk, findRun, isCheck } from '../src/auto-ask.mjs';
import { parseLater, answerText } from '../src/decisions.mjs';
import { TODO_LATER_MAX, TODO_CMDS_MAX } from '../src/cli-contract.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p292-'));
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 3000) { const t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > ms) throw new Error('until: 시간 초과'); await tick(10); } }

// ---------- 가짜 판: 진짜 저장소·전달 대기열·Branch, 가짜 에이전트 ----------
async function board({ dir = tmp() } = {}) {
  const store = new Store(path.join(dir, 'board.db'));
  const ws = await workspaceOf(dir);
  if (!store.getWorkspace || !store.getWorkspace(ws.key)) try { store.insertWorkspace({ ...ws, createdAt: 1 }); } catch {}
  const cfg = { profile: 'dev', terminalSession: 'atrium-dev-p292test', port: 0, dataDir: dir, sessionsDir: path.join(dir, 'sessions'), inputQuietMs: 3000, submitConfirmMs: 3000, deliveryMaxWaitMs: 60000, submitRetries: 0 };
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




// ---------- P292 ----------
const D = (b) => b.store.db.prepare('SELECT * FROM decisions ORDER BY id').all();
const events = (b, kind) => b.store.db.prepare('SELECT * FROM events WHERE kind = ? ORDER BY id').all(kind).map((e) => ({ ...e, data: JSON.parse(e.data || 'null') }));
const ask = (b, s, o) => b.branch.dispatch('ask', s, o);
const todo = (b, s, o) => b.branch.dispatch('todo', s, o);
const err = (fn) => { try { fn(); } catch (e) { return e; } return null; };
const dl = (b, s) => b.store.db.prepare('SELECT * FROM deliveries WHERE session_id = ? ORDER BY created_at').all(s.sessionId);
function turn(b, s, answer, { prompt = '사람의 일' } = {}) {
  applyHook(s.rt, { hook_event_name: 'UserPromptSubmit', prompt }); applyTermStatus(s.rt, 'working'); b.broadcastSession(s);
  applyHook(s.rt, { hook_event_name: 'Stop', last_assistant_message: answer }); applyTermStatus(s.rt, 'idle'); b.broadcastSession(s);
}

test('P292 만들기: 종류 넷(할 일·확인·날짜 나중·조건 나중), 명령, 상한(종류 합쳐 10, 나중 따로), 거절(하위·틀린 날짜·--check와 --later)', async () => {
  const { b, add, stop } = await board();
  const pushed = [];
  b.web = { push: { decision: (it) => pushed.push(it) } };
  try {
    b.clock = new Date(2099, 0, 1, 8, 0).getTime();
    const lead = add('lead');
    const t1 = todo(b, lead, { text: '로그인해 주세요', cmds: ['! gcloud auth login', 'gcloud config list'] });
    assert.equal(t1.kind, 'do'); assert.deepEqual(t1.card.cmds, ['! gcloud auth login', 'gcloud config list']); assert.equal(t1.card.tell, false);
    const t2 = todo(b, lead, { text: '창에서 단추가 보이는지', check: true, why: '새 단추' });
    assert.equal(t2.kind, 'check'); assert.equal(t2.card.why, '새 단추');
    const t3 = todo(b, lead, { text: '내일 배포', later: '2099-01-02 10:30' });
    assert.equal(t3.kind, 'later'); assert.equal(t3.card.wakeAt, new Date(2099, 0, 2, 10, 30).getTime()); assert.equal(t3.card.later, '2099-01-02 10:30');
    const t4 = todo(b, lead, { text: '키가 오면 등록', later: '사용자가 API 키를 받으면' });
    assert.equal(t4.card.cond, '사용자가 API 키를 받으면'); assert.equal(t4.card.wakeAt, null);
    assert.equal(pushed.length, 2, '숨긴 카드(나중)는 만들 때 푸시하지 않는다');
    const list = b.branch.handlers['decision.list']().cards;
    assert.deepEqual(list.map((c) => [c.kind, c.deferred]), [['do', false], ['check', false], ['later', true], ['later', true]]);
    // 날짜만이면 그날 9시
    assert.equal(parseLater('2099-03-04', b.clock).wakeAt, new Date(2099, 2, 4, 9, 0).getTime());
    assert.ok(parseLater('2099-02-30', 0).bad); assert.ok(parseLater('2026-13-01', 0).bad); assert.equal(parseLater('다음 릴리즈 뒤', 0).cond, '다음 릴리즈 뒤');
    // 거절
    assert.equal(err(() => todo(b, lead, { text: 'x', later: '2099-02-30' })).code, 'bad_request');
    assert.equal(err(() => todo(b, lead, { text: 'x', check: true, later: '2099-01-01' })).code, 'bad_request');
    assert.equal(err(() => todo(b, lead, { text: '' })).code, 'bad_request');
    assert.equal(err(() => todo(b, lead, { text: 'x', cmds: Array.from({ length: TODO_CMDS_MAX + 1 }, (_, i) => 'c' + i) })).code, 'too_long');
    assert.equal(err(() => todo(b, lead, { text: 'x', cmds: ['y'.repeat(501)] })).code, 'too_long');
    // 상한: 나중이 아닌 열린 카드는 결정과 합쳐 10장
    for (let i = 0; i < 6; i++) todo(b, lead, { text: '할 일 ' + i });
    ask(b, lead, { question: '결정 하나?' }); ask(b, lead, { question: '결정 둘?' });
    assert.equal(err(() => todo(b, lead, { text: '열한째' })).code, 'too_many');
    assert.equal(err(() => ask(b, lead, { question: '열한째?' })).code, 'too_many');
    // 나중은 따로 넉넉히
    for (let i = 0; i < TODO_LATER_MAX - 2; i++) todo(b, lead, { text: '나중 ' + i, later: '조건 ' + i });
    assert.equal(err(() => todo(b, lead, { text: '나중 넘침', later: '조건' })).code, 'too_many');
    // 하위 워커
    const r2 = await b.branch.spawnChild(lead, { name: 'w1', prompt: '일', wait: false });
    const w1 = b.sessions.get(r2.sessionId);
    const e = err(() => todo(b, w1, { text: '사람에게' }));
    assert.equal(e.code, 'sub_worker'); assert.match(e.message, /atrium prompt lead/);
    // 이벤트
    assert.ok(events(b, 'decision_todo').some((x) => x.data.kind === 'later' && x.data.later === 'cond'));
  } finally { await stop(); }
});

test('P292 했음: 기본은 기록만(세션에 보내지 않음), --tell이면 [실행] 줄을 보냄. 확인은 늘 [확인] 줄로. 결정과 한 글로 모음', async () => {
  const { b, add, stop } = await board();
  const h = b.branch.handlers;
  try {
    const lead = add('lead');
    const n0 = dl(b, lead).length;
    const a = todo(b, lead, { text: '명령을 쳐 주세요', cmds: ['npm ci'] });
    const r = h['decision.done']({ id: a.id }, { kind: 'desktop' });
    assert.equal(r.sent, false); assert.equal(r.deliveryId, null); assert.equal(dl(b, lead).length, n0, '했음은 기록만');
    assert.equal(b.store.getDecision(a.id).state, 'answered'); assert.equal(b.store.getDecision(a.id).answer, '했음');
    // --tell
    const t = todo(b, lead, { text: '키를 등록', tell: true, wait: true }); // P295: 기본은 next(다음 글에 실림). 이 시험은 곧바로(--wait)
    const rt = h['decision.done']({ id: t.id });
    assert.ok(rt.deliveryId); assert.equal(dl(b, lead).at(-1).text, '[실행] 키를 등록 → 했음');
    // 종류가 틀리면 거절
    const c = todo(b, lead, { text: '로그인 화면 확인', check: true });
    assert.equal(err(() => h['decision.done']({ id: c.id })).code, 'wrong_kind');
    assert.equal(err(() => h['decision.answer']({ id: c.id, answer: 'x' })).code, 'wrong_kind');
    assert.equal(err(() => h['decision.check']({ id: c.id })).code, 'bad_request');
    // 확인 + 결정: 확인에 먼저 답하면 모으고, 결정에 답하면 한 글(답한 차례)
    const q = ask(b, lead, { question: '배포할까요?', options: ['예', '아니오'] });
    const rc = h['decision.check']({ id: c.id, ok: false, note: '단추가 안 보임' });
    assert.equal(rc.held, true); assert.equal(rc.waiting, 1);
    const n1 = dl(b, lead).length;
    h['decision.answer']({ id: q.id, answer: '아니오' });
    assert.equal(dl(b, lead).length, n1 + 1);
    assert.equal(dl(b, lead).at(-1).text, '[확인] 로그인 화면 확인 → 안 됐다: 단추가 안 보임\n[결정] 배포할까요? → 아니오');
    // 됐다(메모 없음)
    const c2 = todo(b, lead, { text: 'Check the page', check: true, wait: true }); // P295
    h['decision.check']({ id: c2.id, ok: true });
    assert.equal(dl(b, lead).at(-1).text, '[확인] Check the page → 됐다');
    // 기록만 하는 할 일은 모은 답을 막지 않는다(열려 있어도 확인 결과는 곧바로 간다). --tell 할 일은 막는다
    const d1 = todo(b, lead, { text: '파일 옮기기' }); const c3 = todo(b, lead, { text: '빌드 확인', check: true, wait: true }); // P295
    const n2 = dl(b, lead).length;
    h['decision.check']({ id: c3.id, ok: true, note: '좋음' });
    assert.equal(dl(b, lead).length, n2 + 1); assert.equal(dl(b, lead).at(-1).text, '[확인] 빌드 확인 → 됐다: 좋음');
    h['decision.done']({ id: d1.id });
    assert.equal(dl(b, lead).length, n2 + 1, '기록만');
    const d2 = todo(b, lead, { text: '키 넣기', tell: true }); const q2 = ask(b, lead, { question: '이름은?' });
    b.clock = Date.now();
    assert.equal(h['decision.answer']({ id: q2.id, answer: 'A' }).held, true, '--tell 할 일이 열려 있으면 모은다');
    b.clock += 1000;
    h['decision.done']({ id: d2.id });
    b.clock = null;
    assert.equal(dl(b, lead).at(-1).text, '[결정] 이름은? → A\n[실행] 키 넣기 → 했음');
    assert.equal(answerText('q', '했음', 'later'), '[실행] q → 했음');
  } finally { await stop(); }
});

test('P292 미루기·날짜 나중: 숨었다가 때가 되면 뜬다(가짜 시계, 푸시 한 번), 숨긴 카드는 모은 답을 막지 않음, 조건 나중은 꺼낼 때까지 나중', async () => {
  const { b, add, stop } = await board();
  const pushed = [];
  b.web = { push: { decision: (it) => pushed.push(it) } };
  const h = b.branch.handlers;
  try {
    b.clock = new Date(2099, 0, 1, 8, 0).getTime();
    const lead = add('lead');
    const l = todo(b, lead, { text: '오후에 배포 확인', later: '2099-01-01 15:00' });
    const view = () => h['decision.list']().cards;
    assert.equal(view().find((c) => c.id === l.id).deferred, true);
    assert.equal(b.decisions.wakeDue(), 0);
    b.clock = new Date(2099, 0, 1, 15, 0).getTime();
    assert.equal(b.decisions.wakeDue(), 1);
    const woke = view().find((c) => c.id === l.id);
    assert.equal(woke.deferred, false); assert.equal(woke.later, '2099-01-01 15:00', '날짜 글은 남는다');
    assert.equal(pushed.length, 1); assert.ok(pushed[0].wake);
    assert.equal(b.decisions.wakeDue(), 0, '한 번만');
    // 띄워진 나중은 할 일처럼 했음
    assert.equal(h['decision.done']({ id: l.id }).state, 'answered');
    // 미루기(결정 카드): 숨고, 남은 열린 카드가 없으면 모은 답을 곧바로 보낸다
    const q1 = ask(b, lead, { question: 'Q1?' }); const q2 = ask(b, lead, { question: 'Q2?' });
    h['decision.answer']({ id: q1.id, answer: 'a' });
    const n0 = dl(b, lead).length;
    assert.equal(err(() => h['decision.snooze']({ id: q2.id, until: b.clock - 1 })).code, 'bad_request');
    const s = h['decision.snooze']({ id: q2.id, until: b.clock + 3600e3 });
    assert.ok(s.deliveryId, '숨긴 카드는 열린 카드로 세지 않는다'); assert.equal(dl(b, lead).length, n0 + 1); assert.equal(dl(b, lead).at(-1).text, '[결정] Q1? → a');
    assert.equal(view().find((c) => c.id === q2.id).deferred, true);
    // 숨긴 결정 카드는 사람의 직접 글로 닫히지 않는다
    b.decisions.onHuman(lead.sessionId, 'bar');
    assert.equal(b.store.getDecision(q2.id).state, 'open');
    b.clock += 3600e3;
    b.decisions.wakeDue();
    assert.equal(view().find((c) => c.id === q2.id).deferred, false);
    assert.equal(pushed.filter((p) => p.id === q2.id && p.wake).length, 1, '만들 때 한 번, 띄울 때 한 번');
    // 조건 나중: 꺼낼 때까지 나중, 꺼내면 지금 목록
    const c = todo(b, lead, { text: '키가 오면 등록', later: '키를 받으면' });
    b.clock += 400 * 24 * 3600e3 - 1;
    b.decisions.wakeDue();
    assert.equal(view().find((x) => x.id === c.id).deferred, true, '조건은 시간으로 뜨지 않는다');
    h['decision.raise']({ id: c.id });
    const raised = view().find((x) => x.id === c.id);
    assert.equal(raised.deferred, false); assert.equal(raised.cond, null); assert.equal(raised.later, '키를 받으면');
    // 깨우기 타이머가 걸린다(다음 때)
    todo(b, lead, { text: 'x', later: new Date(b.clock + 86400e3).toISOString().slice(0, 10) });
    assert.ok(b.store.nextWake() > b.clock);
    b.decisions.stop();
  } finally { await stop(); }
});

test('P292 직접 글: 손 카드(결정·할 일·확인)는 그대로(P303). 옛 decide 카드(kind 없음)는 결정 그대로', async () => {
  const { b, add, stop } = await board();
  try {
    const lead = add('lead');
    const q = ask(b, lead, { question: '마무리할까요?' });
    const d = todo(b, lead, { text: '명령 치기', cmds: ['ls'] });
    const c = todo(b, lead, { text: '보기', check: true });
    b.decisions.onHuman(lead.sessionId, 'bar');
    assert.equal(b.store.getDecision(q.id).state, 'open', 'P303: 손 결정 카드도 그대로');
    ask(b, lead, { done: q.id });
    assert.equal(b.store.getDecision(d.id).state, 'open'); assert.equal(b.store.getDecision(c.id).state, 'open');
    // 옛 카드: kind 열이 비어 있다
    b.store.db.prepare("INSERT INTO decisions (session_id, name, question, created_at, state) VALUES (?, 'lead', '옛 질문?', ?, 'open')").run(lead.sessionId, Date.now());
    const old = b.store.openDecisions(lead.sessionId).find((x) => x.question === '옛 질문?');
    assert.equal(old.kind, 'decide'); assert.deepEqual(old.cmds, []); assert.equal(old.wakeAt, null);
    assert.ok(ask(b, lead, { list: true }).cards.some((x) => x.id === old.id));
    assert.ok(!ask(b, lead, { list: true }).cards.some((x) => x.id === d.id), 'ask --list는 결정만');
    // 확인 카드는 끝나면 보낼 것이 있어 모은다. 확인 결과와 옛 결정의 답이 한 글로
    b.branch.handlers['decision.ignore']({ id: d.id });
    b.branch.handlers['decision.check']({ id: c.id, ok: true });
    const r = b.branch.handlers['decision.answer']({ id: old.id, answer: '예' });
    assert.ok(r.deliveryId);
    await until(() => lead.texts.some((t) => t === '[확인] 보기 → 됐다\n[결정] 옛 질문? → 예'));
  } finally { await stop(); }
});

test('P292 자동 카드 종류: 명령 실행 부탁 → 할 일(명령 뽑기), 확인 부탁 → 확인, 질문 → 결정(한국어·영어)', async () => {
  const k = (t) => { const f = findAsk(t); return f && [f.kind, f.question, f.cmds]; };
  assert.deepEqual(k('설치가 끝났습니다.\n\n다음 명령을 실행해 주세요:\n\n```\nnpm ci\nnpm run build\n```'), ['do', '다음 명령을 실행해 주세요', ['npm ci', 'npm run build']]);
  assert.deepEqual(k('로그인이 필요합니다. `! gcloud auth login`을 입력해 주세요.'), ['do', '`! gcloud auth login`을 입력해 주세요.', ['! gcloud auth login']]);
  assert.deepEqual(k('`npm test`를 돌려 주세요.')[2], ['npm test']);
  assert.deepEqual(k('Please run the following:\n\n```bash\n$ git push origin dev\n# done\n```\n\nThen tell me.'), ['do', 'Please run the following', ['git push origin dev']]);
  assert.deepEqual(k('You need to run this in PowerShell:\n\n```powershell\nPS> winget install foo\n```')[2], ['winget install foo']);
  assert.equal(k('고쳤습니다.\n\n창에서 단추가 보이는지 확인해 주세요.')[0], 'check');
  assert.equal(k('화면을 한번 봐 주세요.')[0], 'check');
  assert.equal(k('Fixed it. Please check the login page.')[0], 'check');
  assert.equal(k('Fixed it. Can you check whether it works?')[0], 'check');
  assert.equal(k('I fixed it. Let me know if it works.')[0], 'check');
  assert.equal(k('두 길이 있습니다.\n\n어느 쪽으로 할까요?')[0], 'decide');
  assert.equal(k('Should I push the branch?')[0], 'decide');
  assert.equal(k('명령을 실행해 주세요.')[0], 'decide', '명령을 못 뽑으면 결정(부탁 글로 질문)');
  assert.equal(findAsk('모든 시험이 통과했습니다. `npm test`를 돌렸습니다.'), null);
  assert.equal(findRun('Please run it.\n\nThen a lot of text.\nLine two.\nLine three.\nLine four.\nLine five.'), null, '부탁 뒤 글이 길면 아니다');
  assert.ok(!isCheck('어느 쪽을 확인할까요?'));
  // 판: 자동 할 일 카드(명령), 확인 카드
  const { b, add, stop } = await board();
  try {
    const lead = add('lead');
    turn(b, lead, '설정을 바꿨습니다.\n\n아래를 실행해 주세요:\n```\nnpm run build\nnpm start\n```');
    let open = b.store.openDecisions(lead.sessionId);
    assert.equal(open.length, 1); assert.equal(open[0].kind, 'do'); assert.equal(open[0].auto, true); assert.deepEqual(open[0].cmds, ['npm run build', 'npm start']);
    assert.equal(events(b, 'decision_auto').at(-1).data.card, 'do');
    turn(b, lead, '빌드를 고쳤습니다. 창이 뜨는지 확인해 주세요.');
    open = b.store.openDecisions(lead.sessionId);
    assert.equal(open.length, 1, '한 세션에 자동 카드는 하나(바꿈)'); assert.equal(open[0].kind, 'check');
    // 열린 손 할 일 카드는 자동 카드를 막지 않는다
    todo(b, lead, { text: '나중에 정리', cmds: ['git gc'] });
    await tick(5);
    turn(b, lead, 'Should I continue?');
    assert.ok(b.store.openDecisions(lead.sessionId).some((d) => d.auto && d.kind === 'decide'));
    // 사람의 직접 글은 자동 카드를 닫는다(종류 무관). P303: 만든 지 10초 안이면 남긴다
    b.decisions.onHuman(lead.sessionId, 'bar');
    assert.equal(b.store.openDecisions(lead.sessionId).length, 2, 'P303: 갓 만든 자동 카드는 남는다');
    b.store.db.prepare('UPDATE decisions SET created_at = created_at - 60000 WHERE auto = 1').run();
    b.decisions.onHuman(lead.sessionId, 'bar');
    assert.deepEqual(b.store.openDecisions(lead.sessionId).map((d) => d.kind), ['do']);
  } finally { await stop(); }
});

test('P292 CLI: atrium todo(--cmd 둘·--check·--later·--tell), --list(열린 것과 나중), --done, 하위 거절, 쓰임 틀림', async () => {
  const { b, add, stop } = await board();
  const srv = await serve(b);
  try {
    b.clock = new Date(2099, 0, 1, 8, 0).getTime();
    const lead = add('lead');
    const env = envOf(b, lead);
    let r = await runCli(['todo', '로그인해 주세요', '--cmd', '! gcloud auth login', '--cmd', 'gcloud config list', '--why', '배포 전'], env);
    assert.equal(r.code, 0, r.stderr); assert.match(r.stdout, /실행 카드 #\d+를 보드의 "할 일 목록"에 남겼다/); assert.match(r.stdout, /기록만/);
    r = await runCli(['todo', '단추가 보이는지', '--check', '--json'], env);
    const j = JSON.parse(r.stdout); assert.equal(j.kind, 'check');
    r = await runCli(['todo', '배포', '--later', '2099-01-02 10:00', '--tell'], env);
    assert.equal(r.code, 0, r.stderr); assert.match(r.stdout, /2099-01-02 10:00까지 숨겼다가/);
    r = await runCli(['todo', '키 등록', '--later', '키를 받으면'], env);
    assert.match(r.stdout, /꺼낼 때까지/);
    r = await runCli(['todo', '--list'], env);
    assert.match(r.stdout, /열린 카드 2장/); assert.match(r.stdout, /\[실행\].*명령: `! gcloud auth login`, `gcloud config list`/); assert.match(r.stdout, /나중 2장/); assert.match(r.stdout, /조건: 키를 받으면/);
    const cards = b.store.openDecisions(lead.sessionId);
    assert.equal(cards.find((d) => d.question === '배포').tell, true);
    r = await runCli(['todo', '--done', String(j.id)], env);
    assert.match(r.stdout, /닫았다/);
    assert.equal(b.store.getDecision(j.id).state, 'closed');
    assert.equal((await runCli(['todo'], env)).code, 2);
    assert.equal((await runCli(['todo', 'x', '--check', '--later', '2099-01-01'], env)).code, 2);
    assert.equal((await runCli(['todo', 'x', '--later', '2099-02-30'], env)).code, 2);
    const r2 = await b.branch.spawnChild(lead, { name: 'w1', prompt: '일', wait: false });
    const w = b.sessions.get(r2.sessionId);
    const rw = await runCli(['todo', '사람에게'], envOf(b, w));
    assert.equal(rw.code, 1); assert.match(rw.stderr, /sub_worker/);
  } finally { srv.close(); await stop(); }
});

test('P292 안내: 계약 8과 todo 동사, 허용 규칙, 판·하네스 안내문 한 줄(줄 수 그대로), 스킬 절', () => {
  assert.equal(CONTRACT_VERSION, 13); // P364: know로 12. // P360: revive·fork로 11. // P346: docs init·on·off로 10. // P296: 오케스트레이션 허용 동사로 9. assert.ok(VERB_NAMES.includes('todo'));
  assert.ok(ATRIUM_ALLOW.includes('Bash(atrium todo *)')); assert.ok(ATRIUM_ALLOW.includes('PowerShell(atrium todo *)'));
  const lines = BOARD_SYSTEM_PROMPT.split('\n').filter((l) => l.includes('atrium todo'));
  assert.equal(lines.length, 1); assert.match(lines[0], /atrium ask/, '결정 카드 줄에 더했다');
  assert.equal(BOARD_SYSTEM_PROMPT.split('\n').length, 9);
  assert.match(HARNESS_PROMPT, /atrium todo/); assert.doesNotMatch(HARNESS_PROMPT, /["\n]/);
  assert.match(boardSkill(), /## 사람에게 넘기기\(할 일 목록\)/); assert.match(boardSkill(), /--later/);
  assert.match(shortHelp(), /atrium todo/);
});
