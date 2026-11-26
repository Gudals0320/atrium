// P373 단위 시험: 사람이 터미널에 직접 친 글로 닫는 손 결정·확인 카드는 에이전트에게 아무 글도 넣지 않는다(조용히 닫기).
// 카드에서 사람이 고른 답은 그대로 가고(한 번만), 다시 열기는 지금처럼 된다. 틀은 p357 시험(진짜 저장소·전달 대기열·Branch, 가짜 에이전트·시계).
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
import { AUTO_FRESH_MS } from '../src/decisions.mjs';
import { Pusher, pushPayload } from '../src/web-push.mjs';
import { TODO_LATER_MAX, TODO_CMDS_MAX } from '../src/cli-contract.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p373-'));
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 3000) { const t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > ms) throw new Error('until: 시간 초과'); await tick(10); } }

// ---------- 가짜 판: 진짜 저장소·전달 대기열·Branch, 가짜 에이전트 ----------
async function board({ dir = tmp() } = {}) {
  const store = new Store(path.join(dir, 'board.db'));
  const ws = await workspaceOf(dir);
  if (!store.getWorkspace || !store.getWorkspace(ws.key)) try { store.insertWorkspace({ ...ws, createdAt: 1 }); } catch {}
  const cfg = { profile: 'dev', terminalSession: 'atrium-dev-p373test', port: 0, dataDir: dir, sessionsDir: path.join(dir, 'sessions'), inputQuietMs: 3000, submitConfirmMs: 3000, deliveryMaxWaitMs: 60000, submitRetries: 0 };
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
const H = '[Atrium 보드]';
const delivered = (b, sid) => b.store.deliveries({ sessionId: sid, limit: 50 });

test('P373 터미널 글로 닫으면 전달이 생기지 않는다(대기열·전달 기록·보낸 글 모두 없음)', async () => {
  const { b, add, busy, rest, stop } = await board();
  try {
    b.clock = Date.now() - 60000;
    const lead = add('lead');
    const q = ask(b, lead, { question: '이대로 구현할까요?', options: ['예', '아니오'] });
    const c = todo(b, lead, { text: '화면 보기', check: true });
    b.clock = Date.now();
    b.queue.inspect = async () => ({ box: 'empty' }); // 그 턴에 넣을 수 있는 세션이어도
    busy(lead);
    assert.equal(b.decisions.onHuman(lead.sessionId, 'terminal'), 2);
    for (const x of [q, c]) { const r = b.store.getDecision(x.id); assert.equal(r.state, 'answered'); assert.equal(r.via, 'terminal'); }
    await tick(300);
    assert.equal(b.sent.filter((x) => x.sid === lead.sessionId).length, 0, '보낸 글 없음');
    assert.equal(delivered(b, lead.sessionId).length, 0, '전달 기록(delivery.list) 없음');
    assert.equal(b.queue.list(lead.sessionId).length, 0, '대기열 없음');
    assert.equal(events(b, 'decision_term_note').length, 0);
    assert.deepEqual(b.decisions.handlers()['decision.list']().recent.map((x) => x.id).sort(), [q.id, c.id].sort(), '사람 쪽 "터미널에서 답함"은 그대로');
    // 다음 판 전달에도 실려 가지 않는다
    rest(lead);
    b.queue.enqueue(lead.sessionId, '다른 일', { origin: { kind: 'human' } });
    await until(() => b.sent.some((x) => x.sid === lead.sessionId));
    await tick(100);
    assert.deepEqual(b.sent.filter((x) => x.sid === lead.sessionId).map((x) => x.text), ['다른 일']);
  } finally { await stop(); }
});

test('P373 카드에서 고른 답은 그대로 한 번 간다(곧바로·다음 글에 실어·터미널 글로 연 턴에 스티어링)', async () => {
  const { b, add, busy, rest, stop } = await board();
  try {
    b.clock = Date.now() - 60000;
    const lead = add('lead');
    const q = ask(b, lead, { question: '이대로 갈까요?', options: ['예', '아니오'] });
    b.clock = Date.now();
    // 곧바로(now): 한 글
    const r = b.decisions.handlers()['decision.answer']({ id: q.id, answer: '예', timing: 'now' }, {});
    assert.ok(r.deliveryId);
    await until(() => b.sent.some((x) => x.sid === lead.sessionId));
    await until(() => lead.rt.state !== 'working' && b.queue.list(lead.sessionId).length === 0, 3000).catch(() => {});
    await tick(300);
    const mine = () => b.sent.filter((x) => x.sid === lead.sessionId).map((x) => x.text);
    assert.deepEqual(mine(), ['[결정] 이대로 갈까요? → 예']);
    // 다음 글에 실어(next) + 터미널 글로 연 턴: 확인 답만 스티어링으로 그 턴에, 판 한 줄은 없다
    b.clock = Date.now() - 60000;
    const c = todo(b, lead, { text: '화면 보기', check: true });
    const q2 = ask(b, lead, { question: '배포할까요?' });
    b.clock = Date.now();
    b.decisions.handlers()['decision.check']({ id: c.id, ok: true, note: '잘 뜬다', timing: 'next' }, {});
    assert.equal(b.store.getDecision(c.id).held, true);
    b.queue.inspect = async () => ({ box: 'empty' });
    busy(lead);
    assert.equal(b.decisions.onHuman(lead.sessionId, 'terminal'), 1, 'q2만 터미널 글로 닫힌다');
    assert.equal(b.store.getDecision(q2.id).via, 'terminal');
    await until(() => mine().length === 2);
    await tick(200);
    assert.equal(mine()[1], '[확인] 화면 보기 → 됐다: 잘 뜬다');
    assert.ok(!mine().some((x) => x.includes(H)), '판 한 줄 없음');
    assert.equal(events(b, 'decision_flush').at(-1).data.why, 'ride_steer');
    rest(lead);
  } finally { await stop(); }
});

test('P373 조용히 닫은 카드도 다시 열 수 있다(사람 decision.reopen, 에이전트 --reopen)', async () => {
  const { b, add, busy, stop } = await board();
  try {
    b.clock = Date.now() - 60000;
    const lead = add('lead');
    const q = ask(b, lead, { question: '이대로 갈까요?' });
    const c = todo(b, lead, { text: '보기', check: true });
    b.clock = Date.now();
    busy(lead);
    b.decisions.onHuman(lead.sessionId, 'terminal');
    assert.equal(b.decisions.handlers()['decision.reopen']({ id: q.id }, {}).reopened, true);
    assert.equal(ask(b, lead, { reopen: String(c.id) }).reopened, true);
    for (const x of [q, c]) assert.equal(b.store.getDecision(x.id).state, 'open');
    assert.equal(b.decisions.handlers()['decision.list']().recent.length, 0);
    await tick(200);
    assert.equal(b.sent.filter((x) => x.sid === lead.sessionId).length, 0, '다시 열어도 세션에는 보내지 않는다');
  } finally { await stop(); }
});
