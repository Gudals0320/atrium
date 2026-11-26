// P383 단위 시험: OmO 스티어링 허용(다른 자체 오케스트레이션은 그대로 막힘), 기록으로 제출 확인(다시 보내지 않음),
// 실패한 턴은 마지막 답 물러섬으로 ok 닫지 않고 turn_error 멈춤 알림(카드 상태 error), 성공 턴 물러섬은 그대로.
// 진짜 저장소·전달 대기열·Branch, 가짜 에이전트(p296 시험의 틀). hc와 omo 없이 돈다. omo 기록은 지어 만든 JSONL(키 이름만 실제와 같다)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { Store } from '../src/store.mjs';
import { newRuntime, applyHook, applyTermStatus, deriveState, applyAgentReleased } from '../src/state.mjs';
import { workspaceOf } from '../src/git.mjs';
import { DeliveryQueue, steerBlock, steerWhy, canTypeNow, STEER_ORCH_KINDS } from '../src/delivery.mjs';
import { Branch } from '../src/branch.mjs';
import { FALLBACK_MARK } from '../src/work-units.mjs';
import { turnErrorDetail } from '../src/unit-stops.mjs';
import { readOmoRecord, promptInRecord, omoTurnFailure, omoAskOf } from '../src/omo-record.mjs';
import { screenTurnFailure, promptOnScreen } from '../src/screen.mjs';
import { rowOf } from '../src/phone.mjs';
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p383-'));
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 3000) { const t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > ms) throw new Error('until: 시간 초과'); await tick(10); } }

// ---------- 가짜 판: 진짜 저장소·전달 대기열·Branch, 가짜 에이전트 ----------
async function board({ dir = tmp() } = {}) {
  const store = new Store(path.join(dir, 'board.db'));
  const ws = await workspaceOf(dir);
  if (!store.getWorkspace || !store.getWorkspace(ws.key)) try { store.insertWorkspace({ ...ws, createdAt: 1 }); } catch {}
  const cfg = { profile: 'dev', terminalSession: 'atrium-dev-p383test', port: 0, dataDir: dir, sessionsDir: path.join(dir, 'sessions'), inputQuietMs: 3000, submitConfirmMs: 3000, deliveryMaxWaitMs: 60000, submitRetries: 0 };
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
  b.branch = new Branch(b, { readyWaitMs: 30, submitWaitMs: 10, noticeBatchMs: 20, verbs: { pollMs: 15, settleMs: 800, turnGraceMs: 300, answerGraceMs: 200 } });
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




// ---------- P296 ----------
const ORCH = { on: true, via: 'launcher', reportFallback: null, busy: ['proctree', 'cpu'] };
const ev = (b, s, kind) => b.store.db.prepare('SELECT * FROM events WHERE session_id = ? AND kind = ? ORDER BY id').all(s.sessionId, kind);
const delivs = (b, s) => b.store.db.prepare('SELECT * FROM deliveries WHERE session_id = ? ORDER BY created_at').all(s.sessionId);
function subOf(b, add, parent, name, extra = {}) {
  const w = add(name, { parentSessionId: parent.sessionId, ...extra });
  b.store.updateSession(w.sessionId, { parentSessionId: parent.sessionId });
  b.branch.noteChild(w.sessionId, { role: '워커', depth: 2, by: parent.sessionId, at: Date.now(), kind: w.kind });
  return w;
}

const ORCH_OMO = { on: true, via: 'kind', reportFallback: 'last_answer', busy: ['proctree', 'cpu'] };
const ORCH_HERMES = { on: true, via: 'kind', reportFallback: 'last_answer', busy: [{ reader: 'hermes' }] };

// ---------- 스티어링 판단 ----------
test('P383 steerBlock·canTypeNow: OmO는 자체 오케스트레이션이어도 스티어링을 받고, Hermes·claude 위 오케스트레이션 런처는 그대로 막힌다', () => {
  assert.ok(STEER_ORCH_KINDS.has('omo'));
  assert.equal(steerBlock({ kind: 'omo', orch: ORCH_OMO }, false), null);
  assert.equal(steerBlock({ kind: 'omo' }, false), null, 'orch가 없어도(옛 줄) 종류로 막지 않는다');
  assert.equal(steerBlock({ kind: 'hermes', orch: ORCH_HERMES }, false), 'orchestrates');
  assert.equal(steerBlock({ kind: 'claude', orch: { on: true } }, true), 'orchestrates');
  assert.equal(steerBlock({ kind: 'hermes' }, false), 'kind');
  assert.equal(steerBlock({ kind: 'pi' }, false), 'kind', '같은 pi 계열이어도 pi는 그대로');
  const v = (o) => ({ state: 'working', agentPresent: true, termConnected: true, closed: false, hooked: false, lastUserInputAt: 0, ...o });
  assert.equal(canTypeNow(v({ kind: 'omo', orch: ORCH_OMO })), true);
  assert.equal(canTypeNow(v({ kind: 'omo', orch: ORCH_OMO, state: 'ready' })), false, '쉬면 보통 보내기');
  assert.equal(canTypeNow(v({ kind: 'hermes', orch: ORCH_HERMES })), false);
  assert.equal(canTypeNow(v({ kind: 'claude', hooked: true, orch: { on: true } })), false);
  assert.equal(canTypeNow(v({ kind: 'claude', hooked: true })), true, 'Claude Code 그대로');
  assert.equal(canTypeNow(v({ kind: 'codex' })), true, 'Codex 그대로');
  assert.equal(steerWhy({ view: v({ kind: 'omo', orch: ORCH_OMO }) }), null);
  assert.equal(steerWhy({ view: v({ kind: 'hermes', orch: ORCH_HERMES }) }), 'orchestrates');
});

test('P383 휴대폰 줄 판단 = 백엔드: OmO 줄은 스티어링 단추가 켜지고 Hermes 줄은 흐리다', () => {
  const sum = (o) => ({ sessionId: 's', name: 'a', state: 'working', ...o });
  assert.equal(steerBlock(rowOf(sum({ kind: 'omo', hooked: false, orch: ORCH_OMO }))), null);
  assert.equal(steerBlock(rowOf(sum({ kind: 'hermes', hooked: false, orch: ORCH_HERMES }))), 'orchestrates');
});

// ---------- omo 기록: user 메시지·실패 ----------
const line = (o) => JSON.stringify(o) + '\n';
const T0 = Date.parse('2026-11-27T01:00:00.000Z');
const iso = (ms) => new Date(ms).toISOString();
function recFile(lines) {
  const f = path.join(tmp(), 'rec.jsonl');
  fs.writeFileSync(f, line({ type: 'session', id: 'omo-1', timestamp: iso(T0) }) + lines.map(line).join(''));
  return f;
}
const user = (text, at) => ({ type: 'message', timestamp: iso(at), message: { role: 'user', content: [{ type: 'text', text }], timestamp: at } });
const asst = (text, at, stopReason = 'stop', extra = {}) => ({ type: 'message', timestamp: iso(at), message: { role: 'assistant', content: text ? [{ type: 'text', text }] : [], stopReason, timestamp: at, ...extra } });
const life = (state, at) => ({ type: 'custom', customType: 'session-lifecycle', timestamp: iso(at), data: { state, sessionId: 'omo-1', waitingOn: {} } });

test('P383 omo 기록: 넣은 글(스티어링)은 보낸 뒤 user 메시지로 보이면 들어간 것이다', () => {
  const st = readOmoRecord(recFile([user('first task', T0 + 1000), asst('ok', T0 + 2000, 'toolUse'), user('also check the README spelling', T0 + 9000)]));
  assert.equal(st.ok, true);
  assert.equal(st.users.length, 2);
  assert.equal(promptInRecord(st, 'also check the README spelling', T0 + 5000), true);
  assert.equal(promptInRecord(st, 'also  check the README\nspelling', T0 + 5000), true, '공백·줄바꿈 차이는 같다');
  assert.equal(promptInRecord(st, 'first task', T0 + 5000), false, '보내기 전에 적힌 같은 글은 아니다');
  assert.equal(promptInRecord(st, 'something else', 0), false);
  assert.equal(promptInRecord({ ...st, ok: false }, 'also check the README spelling', 0), false, '못 읽는 기록이면 확인하지 않는다');
});

test('P383 omo 기록: assistant stopReason error·생명 주기 failed는 그 턴의 실패, 뒤에 성공한 답이 있으면 실패가 아니다', () => {
  const fail = readOmoRecord(recFile([user('do it', T0 + 1000), asst('', T0 + 1500, 'error', { errorMessage: 'Your authentication token has expired' }), life('failed', T0 + 1600)]));
  const f = omoTurnFailure(fail, T0 + 900);
  assert.equal(f.type, 'failed'); assert.equal(f.via, 'lifecycle'); assert.match(f.message, /token has expired/);
  assert.equal(omoTurnFailure(fail, T0 + 5000), null, '그 턴 뒤에 시작한 턴의 실패가 아니다');
  const msgOnly = readOmoRecord(recFile([user('do it', T0 + 1000), asst('', T0 + 1500, 'error', { errorMessage: 'provider_error: auth_error' })]));
  assert.deepEqual(omoTurnFailure(msgOnly, T0 + 900), { type: 'error', message: 'provider_error: auth_error', via: 'message' });
  const retried = readOmoRecord(recFile([user('do it', T0 + 1000), asst('', T0 + 1500, 'error', { errorMessage: 'overloaded' }), asst('done: all good', T0 + 4000, 'stop')]));
  assert.equal(omoTurnFailure(retried, T0 + 900), null, '다시 시도해 성공한 턴');
  const ok = readOmoRecord(recFile([user('do it', T0 + 1000), asst('done', T0 + 2000, 'stop'), life('done', T0 + 2100)]));
  assert.equal(omoTurnFailure(ok, T0 + 900), null);
  const aborted = readOmoRecord(recFile([user('do it', T0 + 1000), asst('', T0 + 2000, 'aborted')]));
  assert.equal(omoTurnFailure(aborted, T0 + 900), null, 'Esc로 멈춘 턴은 실패가 아니다');
  assert.equal(omoAskOf(fail), null, '질문 읽기(P381)는 그대로');
});

test('P383 화면: 상태 줄 "failed · provider_error"만 실패로 본다(답 글의 Error:만으로는 아니다)', () => {
  const scr = ['  Error: Your authentication token has expired', '', '────', '❯', '────', '(OmO Native · gpt) failed · provider_error'].join('\n');
  assert.deepEqual(screenTurnFailure(scr), { type: 'provider_error', message: 'Your authentication token has expired' });
  assert.equal(screenTurnFailure('Here is why: Error: x happens when y\n────\n❯\n────\n(OmO Native · gpt) idle'), null);
  assert.equal(screenTurnFailure(''), null);
});

test('P383 화면 입력 칸: omo는 "❯" 기호를 뗀 입력 칸으로 본다(스티어링 전에 비었는지)', () => {
  const rule = '─'.repeat(40);
  const empty = ['answer text', rule, '❯', rule, 'status'].join('\n');
  const ours = ['answer text', rule, '❯ check the spelling', rule, 'status'].join('\n');
  assert.equal(promptOnScreen(empty, 'check the spelling', 'omo').box, 'empty');
  assert.equal(promptOnScreen(ours, 'check the spelling', 'omo').box, 'ours');
  assert.equal(promptOnScreen(['x', rule, '❯ my own draft', rule].join('\n'), 'check the spelling', 'omo').box, 'other');
});

// ---------- 상태: 실패한 턴은 error, 다음 working에 내린다 ----------
test('P383 카드 상태: hook 없는 세션의 turnError는 쉼일 때 error, 다시 working이면 지운다(불변식: 일하는 중엔 error가 아니다)', () => {
  const rt = newRuntime({ kind: 'omo', hooked: false });
  rt.term.present = true; rt.phase = 'running';
  applyTermStatus(rt, 'working');
  rt.turnError = { type: 'provider_error', message: 'expired', via: 'screen' };
  assert.equal(deriveState(rt).state, 'working', '일하는 중에는 그대로');
  applyTermStatus(rt, 'idle');
  rt.turnError = { type: 'provider_error', message: 'expired', via: 'screen' };
  assert.equal(deriveState(rt).state, 'error');
  assert.equal(deriveState(rt).error.type, 'provider_error');
  applyTermStatus(rt, 'working');
  assert.equal(rt.turnError, null);
  applyTermStatus(rt, 'idle');
  assert.equal(deriveState(rt).state, 'ready');
  rt.turnError = { type: 'x' }; applyAgentReleased(rt);
  assert.equal(rt.turnError, null);
  assert.equal(turnErrorDetail({ type: 'provider_error', message: 'Your  authentication\n token has expired' }), 'provider_error: Your authentication token has expired');
  assert.equal(turnErrorDetail(null), null);
});

// ---------- 전달: 일하는 OmO에 스티어링 → 입력 칸이 비었을 때 넣고, 기록으로 확인, 다시 보내지 않는다 ----------
function omoQueue({ box = 'empty' } = {}) {
  const dir = tmp();
  const store = new Store(path.join(dir, 'board.db'));
  const st = { state: 'working', box, seen: false, sent: [], recorded: false };
  const view = () => ({ state: st.state, agentPresent: true, termConnected: true, closed: false, lastUserInputAt: 0, kind: 'omo', hooked: false, bgOnly: false, orch: ORCH_OMO });
  const q = new DeliveryQueue({
    store, cfg: { inputQuietMs: 3000, submitConfirmMs: 1500, deliveryMaxWaitMs: 60000, submitRetries: 2, submitEnterMs: 100, submitRetryMs: 200, typeCheckMs: 50, recordCheckMs: 50 },
    view, send: async (sid, text) => { st.sent.push(text); },
    inspect: async () => ({ box: st.box, seen: st.seen, noResend: true }),
    pressEnter: async () => { st.enter = (st.enter || 0) + 1; },
    recordSeen: (sid, text, since) => st.recorded && since > 0,
  });
  q.start();
  return { q, st, store, stop: () => { q.stop(); store.close(); } };
}

test('P383 전달: 일하는 OmO에 스티어링 글은 지금 넣고(typed), 기록에 user 메시지가 생기면 확인한다. 다시 보내지 않는다', async () => {
  const { q, st, store, stop } = omoQueue();
  try {
    const d = q.enqueue('o1', 'also check the README spelling', { typeNow: true, aside: true, origin: { kind: 'human' } });
    await until(() => st.sent.length === 1, 2000);
    await until(() => store.getDelivery(d.deliveryId).status === 'sent', 1000);
    assert.equal(store.getDelivery(d.deliveryId).reason, 'typed');
    await tick(600); // 일하는 동안 기록에 아직 없다: sent 그대로, Enter·다시 보내기 없음
    assert.equal(store.getDelivery(d.deliveryId).status, 'sent');
    st.recorded = true; // OmO가 도구 호출을 마치고 스티어링 글을 넣었다
    await until(() => store.getDelivery(d.deliveryId).status === 'confirmed', 2000);
    assert.equal(store.getDelivery(d.deliveryId).reason, 'record');
    assert.equal(st.sent.length, 1); assert.ok(!st.enter);
  } finally { stop(); }
});

test('P383 전달: 턴이 끝난 뒤 기록에서 확인돼도 confirmed, 기록에 없으면 다시 보내지 않고 unconfirmed', async () => {
  const a = omoQueue();
  try {
    const d = a.q.enqueue('o1', 'steer me', { typeNow: true, aside: true });
    await until(() => a.st.sent.length === 1, 2000);
    a.st.state = 'ready';
    await tick(400);
    a.st.recorded = true;
    await until(() => a.store.getDelivery(d.deliveryId).status === 'confirmed', 2000);
  } finally { a.stop(); }
  const b2 = omoQueue();
  try {
    const d = b2.q.enqueue('o1', 'steer me', { typeNow: true, aside: true });
    await until(() => b2.st.sent.length === 1, 2000);
    b2.st.state = 'ready';
    await until(() => b2.store.getDelivery(d.deliveryId).status === 'unconfirmed', 4000);
    assert.equal(b2.st.sent.length, 1, '두 번 넣지 않는다');
  } finally { b2.stop(); }
});

test('P383 전달: OmO 입력 칸에 사람이 쓰던 글이 있으면 비키지 않고 기다린다(draft_in_box), 비면 넣는다', async () => {
  const { q, st, store, stop } = omoQueue({ box: 'other' });
  try {
    const d = q.enqueue('o1', 'steer me', { typeNow: true, aside: true });
    await tick(500);
    assert.equal(st.sent.length, 0);
    assert.equal(store.getDelivery(d.deliveryId).status, 'queued');
    st.box = 'empty';
    await until(() => st.sent.length === 1, 2000);
  } finally { stop(); }
});

test('P383 전달: Hermes(자체 오케스트레이션)에 고른 스티어링은 그대로 일이 끝난 뒤 들어간다', async () => {
  const dir = tmp();
  const store = new Store(path.join(dir, 'board.db'));
  const st = { state: 'working', sent: [] };
  const q = new DeliveryQueue({ store, cfg: { inputQuietMs: 3000, submitConfirmMs: 3000, deliveryMaxWaitMs: 60000, typeCheckMs: 50 }, view: () => ({ state: st.state, agentPresent: true, termConnected: true, closed: false, lastUserInputAt: 0, kind: 'hermes', hooked: false, orch: ORCH_HERMES }), send: async (sid, t) => { st.sent.push(t); }, inspect: async () => ({ box: 'empty', seen: false, noResend: true }) });
  q.start();
  try {
    q.enqueue('h1', 'steer me', { typeNow: true, aside: true });
    await tick(400);
    assert.equal(st.sent.length, 0);
    st.state = 'ready';
    await until(() => st.sent.length === 1, 2000);
  } finally { q.stop(); store.close(); }
});

// ---------- 마지막 답 물러섬 ----------
test('P383 물러섬: 성공한 OmO 턴은 그대로 마지막 답으로 닫는다', async () => {
  const { b, add, stop } = await board();
  try {
    b.branch.units.fallbackMs = 600;
    const lead = add('lead');
    const w = subOf(b, add, lead, 'o1', { kind: 'omo', hooked: false, orch: ORCH_OMO });
    w.onText = async (text, s) => { s.rt.lastAnswer = 'p383 결과: README를 고쳤다'; s.rt.lastAnswerAt = Date.now(); };
    await b.branch.dispatch('prompt', lead, { name: 'o1', text: 'p383 일을 해라' });
    await until(() => units(b).some((u) => u.status === 'done'), 5000);
    const tr = tries(b)[0];
    assert.equal(tr.result, 'ok'); assert.ok(tr.done_text.startsWith(FALLBACK_MARK));
    assert.equal(ev(b, w, 'unit_done_fallback').length, 1);
    assert.equal(ev(b, w, 'unit_done_fallback_skipped').length, 0);
  } finally { await stop(); }
});

test('P383 물러섬: 실패한 턴(물러섬 직전에 실패를 앎)은 ok로 닫지 않고 turn_error 멈춤 알림, 일은 열린 채', async () => {
  const { b, add, stop } = await board();
  try {
    b.branch.units.fallbackMs = 600;
    const lead = add('lead');
    const w = subOf(b, add, lead, 'o2', { kind: 'omo', hooked: false, orch: ORCH_OMO });
    let failNow = false;
    b.turnFailure = (s) => (s === w && failNow ? { type: 'provider_error', message: 'Your authentication token has expired', via: 'record' } : null);
    w.onText = async (text, s) => { s.rt.lastAnswer = 'Error: Your authentication token has expired'; s.rt.lastAnswerAt = Date.now(); failNow = true; };
    await b.branch.dispatch('prompt', lead, { name: 'o2', text: 'p383 일을 해라' });
    await until(() => ev(b, w, 'unit_done_fallback_skipped').length === 1, 5000);
    const sk = JSON.parse(ev(b, w, 'unit_done_fallback_skipped')[0].data);
    assert.equal(sk.why, 'turn_failed'); assert.equal(sk.type, 'provider_error');
    assert.equal(ev(b, w, 'unit_done_fallback').length, 0);
    const tr = tries(b)[0];
    assert.equal(tr.result, null, 'ok로 닫지 않았다'); assert.equal(tr.stop_reason, 'turn_error');
    assert.equal(units(b)[0].status, 'open');
    await until(() => delivs(b, lead).some((d) => d.text.includes('오류로 턴이 끝났다')), 3000);
    const n = delivs(b, lead).find((d) => d.text.includes('오류로 턴이 끝났다'));
    assert.match(n.text, /provider_error: Your authentication token has expired/);
    assert.ok(!delivs(b, lead).some((d) => d.text.includes(FALLBACK_MARK)), '부모에게 ok 보고가 가지 않는다');
  } finally { await stop(); }
});

test('P383 실패한 턴이 쉬자마자 보이면(카드 error) 물러섬을 타지 않고 곧바로 turn_error 알림', async () => {
  const { b, add, stop } = await board();
  try {
    b.branch.units.fallbackMs = 600;
    const lead = add('lead');
    const w = subOf(b, add, lead, 'o3', { kind: 'omo', hooked: false, orch: ORCH_OMO });
    w.onText = async (text, s) => { s.rt.lastAnswer = 'Error: expired'; s.rt.lastAnswerAt = Date.now(); };
    const orig = w.agent;
    w.agent = (text) => { orig(text); setTimeout(() => { w.rt.turnError = { type: 'provider_error', message: 'token expired', via: 'record' }; }, 40); }; // 쉬기 전에 기록에서 실패를 읽었다
    await b.branch.dispatch('prompt', lead, { name: 'o3', text: 'p383 일을 해라' });
    await until(() => delivs(b, lead).some((d) => d.text.includes('오류로 턴이 끝났다')), 5000);
    assert.equal(deriveState(w.rt).state, 'error');
    assert.match(delivs(b, lead).find((d) => d.text.includes('오류로 턴이 끝났다')).text, /provider_error: token expired/);
    assert.equal(ev(b, w, 'unit_done_fallback').length, 0);
    assert.equal(units(b)[0].status, 'open');
  } finally { await stop(); }
});
