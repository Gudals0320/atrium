// P215 단위 시험: 일하는 세션에 줄 선 전달은 15분 상한(deliveryMaxWaitMs)에 걸리지 않고 턴이 끝나면 들어간다. 큰 상한(deliveryLongWaitMs),
// 다른 까닭의 상한, 끝내 못 들어간 글은 보낸 세션에 판 알림(보낸 쪽이 닫혔으면 없음), 맡긴 일에 붙는 글은 일이 done으로 닫힌 뒤에도 들어간다.
// 대기열 시험은 가짜 시계, 판 시험은 진짜 저장소·대기열·Branch와 가짜 에이전트(p180의 틀)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { Store } from '../src/store.mjs';
import { newRuntime, applyHook, applyTermStatus, deriveState } from '../src/state.mjs';
import { workspaceOf } from '../src/git.mjs';
import { DeliveryQueue, LONG_WAIT } from '../src/delivery.mjs';
import { Branch } from '../src/branch.mjs';
import { isBoardNotice } from '../src/text.mjs';

const MIN = 60000;
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p215-'));
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 3000) { const t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > ms) throw new Error('until: 시간 초과'); await tick(10); } }

// ---------- 대기열(가짜 시계) ----------
const qcfg = { submitConfirmMs: 30000, deliveryMaxWaitMs: 15 * MIN, deliveryLongWaitMs: 12 * 60 * MIN, inputQuietMs: 3000, submitRetryMs: 6000, submitRetries: 2 };
const flush = async (n = 3) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };
const fakeStore = () => ({
  rows: new Map(), activeDeliveries: () => [],
  insertDelivery(d) { this.rows.set(d.deliveryId, { ...d }); },
  updateDelivery(id, p) { const r = this.rows.get(id) || {}; Object.assign(r, { status: p.status, reason: p.reason ?? null }); },
  getDelivery(id) { return this.rows.get(id) || null; },
});
function qrig(t, view = {}, opts = {}) {
  t.mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
  const v = { state: 'working', agentPresent: true, termConnected: true, closed: false, lastUserInputAt: 0, ...view };
  const sent = [];
  const q = new DeliveryQueue({ store: fakeStore(), cfg: { ...qcfg, ...opts }, view: () => v, send: async (sid, text) => { sent.push(text); } });
  // 30초씩 n번 흘려 보낸다(판의 pump는 0.5초마다지만 나누는 시간은 pump 사이 길이와 상관없다)
  const run = async (ms, step = 30000) => { for (let left = ms; left > 0; left -= step) { t.mock.timers.tick(Math.min(step, left)); q.pump(); await flush(); } };
  return { q, v, sent, run };
}

test('P215 LONG_WAIT: 일하는 중(working)과 턴 안에서 사람의 답 기다림(waiting)', () => {
  assert.deepEqual([...LONG_WAIT].sort(), ['waiting', 'working']);
});

test('P215 일하는 중 15분 넘게 줄 서도 실패하지 않고, 턴이 끝나면 들어간다', async (t) => {
  const { q, v, sent, run } = qrig(t);
  const a = q.enqueue('s', '일하는 중에 보낸 글');
  await run(25 * MIN);
  assert.equal(a.status, 'queued'); assert.equal(a.reason, 'working');
  assert.deepEqual(sent, []);
  v.state = 'ready';
  await run(1000, 1000);
  assert.deepEqual(sent, ['일하는 중에 보낸 글']);
  assert.equal(a.status, 'sent');
});

test('P215 사람의 답을 기다리는(waiting) 동안도 15분에 넣지 않는다', async (t) => {
  const { q, v, sent, run } = qrig(t, { state: 'waiting' });
  const a = q.enqueue('s', 'x');
  await run(40 * MIN);
  assert.equal(a.status, 'queued'); assert.equal(a.reason, 'waiting');
  v.state = 'ready'; await run(1000, 1000);
  assert.deepEqual(sent, ['x']);
});

test('P215 큰 상한: 일하는 중이라도 deliveryLongWaitMs가 지나면 실패(timeout working)', async (t) => {
  const { q, run } = qrig(t, {}, { deliveryLongWaitMs: 2 * 60 * MIN });
  const a = q.enqueue('s', 'x');
  await run(119 * MIN, 5 * MIN);
  assert.equal(a.status, 'queued');
  await run(2 * MIN, MIN);
  assert.equal(a.status, 'failed'); assert.equal(a.reason, 'timeout (working)');
});

test('P215 다른 까닭(에이전트 없음, 신뢰 대기)은 지금처럼 15분이면 실패', async (t) => {
  for (const view of [{ state: 'ready', agentPresent: false }, { state: 'trust_wait' }]) {
    const { q, run } = qrig(t, view);
    const a = q.enqueue('s', 'x');
    await run(14 * MIN);
    assert.equal(a.status, 'queued', JSON.stringify(view));
    await run(2 * MIN);
    assert.equal(a.status, 'failed', JSON.stringify(view)); assert.match(a.reason, /^timeout \((no_agent|trust_wait)\)$/);
    t.mock.timers.reset();
  }
});

test('P215 까닭이 섞이면 짧은 상한은 working·waiting이 아닌 시간만 더한다', async (t) => {
  const { q, v, run } = qrig(t, { state: 'ready', agentPresent: false });
  const a = q.enqueue('s', 'x');
  await run(10 * MIN); // 에이전트 없음 10분(센다)
  v.agentPresent = true; v.state = 'working';
  await run(30 * MIN); // 일하는 중 30분(세지 않는다)
  assert.equal(a.status, 'queued');
  v.agentPresent = false; v.state = 'ready';
  await run(4 * MIN);
  assert.equal(a.status, 'queued', '센 시간 14분');
  await run(2 * MIN);
  assert.equal(a.status, 'failed'); assert.equal(a.reason, 'timeout (no_agent)');
});

test('P215 앞 전달 뒤에 줄 선 시간도 세지 않는다: 둘째 글은 맨 앞이 된 뒤 곧바로 실패하지 않는다', async (t) => {
  const { q, v, sent, run } = qrig(t);
  const a = q.enqueue('s', 'one');
  const b = q.enqueue('s', 'two');
  await run(20 * MIN);
  v.state = 'ready'; await run(1000, 1000);
  assert.deepEqual(sent, ['one']);
  q.onUserPromptSubmit('s', 'one'); v.state = 'working';
  assert.equal(a.status, 'confirmed');
  await run(20 * MIN);
  assert.equal(b.status, 'queued', '둘째 글은 일하는 중이라 기다린다');
  v.state = 'ready'; await run(1000, 1000);
  assert.deepEqual(sent, ['one', 'two']);
});

// ---------- 판(진짜 저장소·대기열·Branch, 가짜 에이전트) ----------
// ---------- 가짜 판: 진짜 저장소·전달 대기열·Branch, 가짜 에이전트 ----------
async function board({ dir = tmp(), cfg: extra = {} } = {}) {
  const store = new Store(path.join(dir, 'board.db'));
  const ws = await workspaceOf(dir);
  if (!store.getWorkspace || !store.getWorkspace(ws.key)) try { store.insertWorkspace({ ...ws, createdAt: 1 }); } catch {}
  const cfg = { profile: 'dev', terminalSession: 'atrium-dev-p215test', port: 0, dataDir: dir, sessionsDir: path.join(dir, 'sessions'), inputQuietMs: 3000, submitConfirmMs: 3000, deliveryMaxWaitMs: 60000, submitRetries: 0, ...extra };
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
const noticesTo = (b, s) => b.store.db.prepare('SELECT * FROM deliveries WHERE session_id = ? ORDER BY created_at').all(s.sessionId).filter((r) => isBoardNotice(r.text) && /들어가지 않았다/.test(r.text));
const lostEvents = (b) => b.store.db.prepare("SELECT * FROM events WHERE kind = 'delivery_lost_notice'").all();

test('P215 끝내 못 들어간 글(받는 세션 닫힘)은 보낸 세션에 판 알림 한 줄: 누구에게, 글 앞부분, 까닭', async () => {
  const { b, add, busy, stop } = await board();
  try {
    const lead = add('lead'); const x = add('x');
    busy(x);
    const r = await b.branch.verbs.prompt(lead, { name: 'x', text: '이 글은 들어가지 못한다' });
    assert.equal(r.delivery.status, 'queued'); assert.equal(r.delivery.reason, 'working');
    b.closeSession(x, 'test');
    await until(() => noticesTo(b, lead).length === 1);
    const n = noticesTo(b, lead)[0].text;
    assert.ok(n.startsWith('[Atrium 보드] @x에게 보낸 글("이 글은 들어가지 못한다")이 들어가지 않았다(failed: session closed)'), n);
    assert.match(n, /@x는 닫혔다/);
    assert.equal(lostEvents(b).length, 1);
  } finally { await stop(); }
});

test('P215 상한으로 실패하면 다시 보내는 명령을 알린다. 보낸 쪽이 이미 닫혔으면 알리지 않는다', async () => {
  const { b, add, stop } = await board({ cfg: { deliveryMaxWaitMs: 300 } });
  try {
    const lead = add('lead'); const gone = add('gone'); const x = add('x');
    x.rt.term.present = false; // 에이전트 없음: 짧은 상한을 센다
    await b.branch.verbs.prompt(lead, { name: 'x', text: '첫째' });
    await until(() => noticesTo(b, lead).length === 1, 4000);
    const n = noticesTo(b, lead)[0].text;
    assert.match(n, /\(failed: timeout \(no_agent\)\)/); assert.match(n, /다시 보내려면: atrium prompt x "<글>"/);
    b.queue.enqueue(x.sessionId, '둘째', { origin: { kind: 'agent', session: gone.sessionId } }); // 상한(0.3초) 안에 보낸 쪽을 닫는다(prompt는 settle을 기다린다)
    b.closeSession(gone, 'test');
    await until(() => b.store.db.prepare("SELECT * FROM deliveries WHERE session_id = ? AND status = 'failed'").all(x.sessionId).length === 2, 4000);
    await tick(100);
    assert.equal(lostEvents(b).length, 1, '닫힌 보낸 쪽에는 알리지 않는다');
  } finally { await stop(); }
});

test('P215 사람이 지운 글(cancel user)과 판 알림·사람이 보낸 글은 보낸 세션 알림이 없다', async () => {
  const { b, add, busy, stop } = await board();
  try {
    const lead = add('lead'); const x = add('x');
    busy(x);
    const r = await b.branch.verbs.prompt(lead, { name: 'x', text: '지울 글' });
    b.queue.cancel(r.deliveryId);
    b.queue.enqueue(x.sessionId, '사람의 글', { origin: { kind: 'human' } });
    b.queue.enqueue(x.sessionId, '[Atrium 보드] 알림');
    b.closeSession(x, 'test');
    await tick(700);
    assert.equal(lostEvents(b).length, 0);
  } finally { await stop(); }
});

test('P215 일하는 하위에게 맡긴 일에 붙는 글은 상한보다 긴 턴 동안 줄에 있다가, 일이 done으로 닫힌 뒤에도 들어간다', async () => {
  const { b, add, stop } = await board({ cfg: { deliveryMaxWaitMs: 200 } });
  try {
    const lead = add('lead');
    const w1 = add('w1', { parentSessionId: lead.sessionId, workMs: 60 });
    const a = await b.branch.verbs.prompt(lead, { name: 'w1', text: '일 하나' });
    await until(() => w1.texts.length === 1 && deriveState(w1.rt).state === 'ready');
    // 둘째 턴(질문에 대한 답)을 오래 돌고, 그 턴 끝에 done으로 닫는다
    w1.onText = async (text) => { if (text === '답: 그렇게') { await tick(600); b.branch.units.done(w1, { result: 'ok', text: '다 했다' }); } };
    await b.branch.verbs.prompt(lead, { name: 'w1', text: '답: 그렇게' });
    await until(() => w1.texts.length === 2 && deriveState(w1.rt).state === 'working');
    const f = await b.branch.verbs.prompt(lead, { name: 'w1', text: '하나 더: 기록도 남겨라' });
    assert.equal(f.unit.kind, 'followup'); assert.equal(f.unit.id, a.unit.id);
    assert.equal(f.delivery.reason, 'working');
    await until(() => w1.texts.length === 3, 4000);
    assert.equal(w1.texts[2], '하나 더: 기록도 남겨라');
    assert.equal(b.store.getUnit(a.unit.id).status, 'done', '일은 그 전에 닫혔다');
    assert.equal(b.store.getDelivery(f.deliveryId).status, 'confirmed');
    assert.equal(noticesTo(b, lead).length, 0);
  } finally { await stop(); }
});
