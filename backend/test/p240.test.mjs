// P240 단위 시험: 턴은 끝났고 뒤 일(뒤 셸·뒤 하위 에이전트)만 도는 Claude Code 세션에는 전달을 기다리지 않고 바로 보낸다(bgOnly).
// 턴 중(뒤 일이 있어도)은 기다림, 뒤 일이 끝나 Claude Code가 스스로 연 새 턴과 겹칠 때, Codex는 그대로, 판의 상태 표시는 그대로.
// P237 후속(rig2-design 11.18 답): "회 없이" 글은 개선 회의 사람 글 요약에서 뺀다, 거절 까닭은 코드, 멈춘 고리의 자리 터미널 요청은 장부 loop_skip
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import { Store } from '../src/store.mjs';
import { newRuntime, applyHook, applyTermStatus, deriveState } from '../src/state.mjs';
import { workspaceOf } from '../src/git.mjs';
import { DeliveryQueue, bgOnlyOf, blockReason } from '../src/delivery.mjs';
import { backgroundList } from '../src/sleep.mjs';
import { Branch } from '../src/branch.mjs';
import { Rig } from '../src/rig.mjs';
import { RigDocs } from '../src/rig-docs.mjs';
import { Backend } from '../src/backend.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FX = path.join(HERE, 'fixtures');
const GROW = path.join(FX, 'rig-loops-grow');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p240-'));
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 5000) { const t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > ms) throw new Error('until: 시간 초과'); await tick(10); } }
const ledger = (b, key, q = {}) => b.store.rigEvents({ ws: key, limit: 10000, ...q });

// ---------- 1. 판정(bgOnlyOf)과 전달이 쓰는 view(Backend.deliveryView) ----------
const SHELL_BG = [{ id: 'b1', type: 'shell', status: 'running', command: 'ping -n 60 127.0.0.1', description: '긴 ping' }];
const AGENT_BG = [{ id: 'a1', type: 'subagent', status: 'running', agent_type: 'Explore' }];
// 판이 띄운 Claude Code 세션 하나와 deliveryView만 쓰는 가짜 판. scan: claude 아래 도구 명령을 센 것(sleep.mjs bgScan)
function fakeBoard({ kind = 'claude', hooked = kind === 'claude' } = {}) {
  const rt = newRuntime({ kind, hooked });
  rt.term.present = true; rt.phase = 'running'; applyTermStatus(rt, 'idle');
  const s = { sessionId: 's1', name: 'main', kind, paneId: 'main:p1', rt, lastUserInputAt: 0 };
  const scan = new Map();
  const b = {
    sessions: new Map([[s.sessionId, s]]), adapter: { connected: true }, branch: null,
    hooked: (x) => x.rt.hooked !== false,
    sleeper: { going: new Set(), bgView: (x) => (x.kind !== 'claude' || !x.paneId || x.rt.sleep ? null : backgroundList(x.rt.bg, scan.get(x.sessionId) || null)) },
  };
  const view = () => Backend.prototype.deliveryView.call(b, s.sessionId);
  const prompt = (text = '일') => { applyHook(rt, { hook_event_name: 'UserPromptSubmit', prompt: text }); applyTermStatus(rt, 'working'); };
  // 턴 끝(Stop). hc는 뒤 일이 돌면 쉼으로 바꾸지 않는다(터미널 상태는 working 그대로)
  const stop = (bg = SHELL_BG) => applyHook(rt, { hook_event_name: 'Stop', last_assistant_message: '끝', ...(bg ? { background_tasks: bg } : {}) });
  return { b, s, rt, scan, view, prompt, stop };
}

test('P240 판정: 턴 끝 + 뒤 셸(Stop의 background_tasks)이면 bgOnly, 판의 상태와 뒤 일 표시는 working 그대로', () => {
  const f = fakeBoard();
  f.prompt(); f.stop();
  const v = f.view();
  assert.equal(v.state, 'working'); assert.equal(v.bgOnly, true);
  assert.equal(blockReason(v, Date.now(), { inputQuietMs: 3000 }), null, '전달은 쉬는 세션처럼 보낸다');
  assert.equal(deriveState(f.rt).state, 'working', '카드·세션 맵 상태는 그대로');
  assert.equal(f.b.sleeper.bgView(f.s).n, 1, '"백그라운드 n" 알약도 그대로');
  // 뒤 하위 에이전트도 같다
  const g = fakeBoard(); g.prompt(); g.stop(AGENT_BG);
  assert.equal(g.view().bgOnly, true);
});

test('P240 판정: Stop에 목록이 없어도 claude 아래 도구 명령(bgScan)만 보이면 bgOnly', () => {
  const f = fakeBoard();
  f.prompt(); f.stop(null);
  assert.equal(f.view().bgOnly, false, '뒤 일을 모르면 턴 중처럼 기다린다');
  f.scan.set(f.s.sessionId, { at: Date.now(), n: 1 });
  assert.equal(f.view().bgOnly, true);
});

test('P240 판정: 턴 중(앞 셸, 뒤 일 있어도)은 기다린다', () => {
  const f = fakeBoard();
  f.prompt('첫 턴'); f.stop(); // 앞 턴이 뒤 셸을 남겼다
  f.prompt('둘째 턴'); // 새 턴(앞에서 셸이 돌 수도 있다)
  const v = f.view();
  assert.equal(v.bgOnly, false);
  assert.equal(blockReason(v, Date.now(), { inputQuietMs: 3000 }), 'working');
  // 뒤 일 없이 Stop이 오기 전(긴 앞 셸)
  const g = fakeBoard(); g.prompt();
  g.scan.set(g.s.sessionId, { at: Date.now(), n: 1 }); // 앞 셸도 claude 아래 도구 명령이다
  assert.equal(g.view().bgOnly, false, 'Stop이 없으면 턴 중');
});

test('P240 판정: 뒤 일이 끝나 Claude Code가 스스로 새 턴을 열면(UserPromptSubmit 없음) 첫 주 에이전트 도구 hook부터 기다린다. 하위 에이전트의 도구 hook은 세지 않는다', () => {
  const f = fakeBoard();
  f.prompt(); f.stop(AGENT_BG);
  applyHook(f.rt, { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'ls' }, agent_id: 'a1', agent_type: 'Explore' }, Date.now() + 3);
  assert.equal(f.view().bgOnly, true, '뒤 하위 에이전트의 도구 hook');
  applyHook(f.rt, { hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: { file_path: 'x' } }, Date.now() + 5); // Stop 뒤에 온 hook
  assert.equal(f.view().bgOnly, false, '주 에이전트가 도구를 쓴다 = 턴이 돈다');
  applyHook(f.rt, { hook_event_name: 'Stop', background_tasks: [] }, Date.now() + 10); // 그 턴이 끝나면 다시 판정(뒤 일이 없으면 bgOnly 아님)
  assert.equal(f.view().bgOnly, false);
  applyHook(f.rt, { hook_event_name: 'UserPromptSubmit', prompt: '다시' }, Date.now() + 20);
  applyHook(f.rt, { hook_event_name: 'Stop', background_tasks: SHELL_BG }, Date.now() + 30);
  assert.equal(f.view().bgOnly, true);
});

test('P240 판정: Codex·hook 없는 세션·압축 중·쉬는 세션은 bgOnly가 아니다', () => {
  const c = fakeBoard({ kind: 'codex' });
  applyTermStatus(c.rt, 'working');
  c.rt.bg = { tasks: SHELL_BG, at: Date.now() };
  assert.equal(c.view().bgOnly, false); assert.equal(c.view().state, 'working');
  const f = fakeBoard(); f.prompt(); f.stop();
  assert.equal(bgOnlyOf(f.rt, { state: 'working', estimate: 'compacting' }, { n: 1 }), false, '압축 중');
  assert.equal(bgOnlyOf(f.rt, { state: 'ready' }, { n: 1 }), false, '쉬면 보통 판정');
  assert.equal(bgOnlyOf(f.rt, { state: 'working' }, null), false, '뒤 일 없음');
  assert.equal(bgOnlyOf(f.rt, { state: 'working' }, { n: 1 }, { hooked: false }), false, 'hook 없음');
  applyHook(f.rt, { hook_event_name: 'StopFailure', error: 'x' }); // StopFailure도 턴 끝이다
  assert.equal(bgOnlyOf(f.rt, { state: 'working' }, { n: 1 }), true);
});

// ---------- 2. 대기열: 바로 보내기, 턴 중 기다림, 겹침 ----------
const queues = [];
test.afterEach(() => { while (queues.length) queues.pop().stop(); });
function qBoard(f, cfg = {}) {
  const sent = [], events = [];
  const store = { rows: new Map(), activeDeliveries: () => [], insertDelivery(d) { this.rows.set(d.deliveryId, { ...d }); }, updateDelivery(id, p) { Object.assign(this.rows.get(id) || {}, p); }, getDelivery(id) { return this.rows.get(id) || null; } };
  const q = new DeliveryQueue({
    store, cfg: { inputQuietMs: 3000, submitConfirmMs: 400, deliveryMaxWaitMs: 60000, submitRetries: 2, submitEnterMs: 20, submitRetryMs: 40, submitLooks: 1, ...cfg },
    view: () => f.view(), send: async (sid, text) => { sent.push(text); },
    inspect: async () => ({ box: 'empty', seen: false }), pressEnter: async () => {},
  });
  q.on('bg_only', (r) => events.push(r));
  q.start(); queues.push(q);
  return { q, sent, events };
}

test('P240 대기열: 뒤 일만 돌면 곧바로 보내고(bg_only), Claude Code가 받으면(UserPromptSubmit) 확인된다', async () => {
  const f = fakeBoard(); f.prompt(); f.stop();
  const { q, sent, events } = qBoard(f);
  const d = q.enqueue(f.s.sessionId, '뒤 셸 도는 중에 보낸 글');
  await until(() => sent.length === 1);
  assert.equal(d.bgOnly, true); assert.equal(events.length, 1);
  assert.equal(d.status, 'sent');
  applyHook(f.rt, { hook_event_name: 'UserPromptSubmit', prompt: '뒤 셸 도는 중에 보낸 글' });
  q.onUserPromptSubmit(f.s.sessionId, '뒤 셸 도는 중에 보낸 글');
  assert.equal(d.status, 'confirmed');
  assert.equal(f.view().bgOnly, false, '이제 그 글의 턴이다');
});

test('P240 대기열: 턴 중(뒤 일 있어도)은 working으로 기다리고, 턴이 끝나 뒤 일만 남으면 곧바로 들어간다', async () => {
  const f = fakeBoard(); f.prompt('앞'); f.stop(); f.prompt('지금 턴');
  const { q, sent } = qBoard(f);
  const d = q.enqueue(f.s.sessionId, '기다릴 글');
  q.pump(); await tick(30);
  assert.equal(d.status, 'queued'); assert.equal(d.reason, 'working'); assert.deepEqual(sent, []);
  f.stop(); q.pump();
  await until(() => sent.length === 1);
  assert.equal(d.bgOnly, true);
});

test('P240 대기열(겹침): 새 턴의 첫 도구 hook 전에 넣은 글은 Claude Code 대기 메시지가 될 수 있어 다시 보내지 않는다(Enter만, 확인 못 함으로 끝남)', async () => {
  const f = fakeBoard(); f.prompt(); f.stop();
  const { q, sent } = qBoard(f);
  const d = q.enqueue(f.s.sessionId, '겹친 글');
  await until(() => sent.length === 1);
  await until(() => d.status === 'unconfirmed', 3000);
  assert.equal(sent.length, 1, '빈 입력 칸이어도 다시 보내지 않는다');
  // 비교: 쉬는 세션에 보낸 글은 빈 입력 칸이면 한 번 다시 보낸다(P79) — bgOnly만 다르다
  const g = fakeBoard(); g.prompt(); g.stop([]); applyTermStatus(g.rt, 'idle');
  const qg = qBoard(g);
  const e = qg.q.enqueue(g.s.sessionId, '쉬는 세션 글');
  await until(() => e.status === 'unconfirmed', 3000);
  assert.equal(e.bgOnly, false);
  assert.equal(qg.sent.length, 2, '쉬는 세션은 지금처럼 다시 보낸다');
});

test('P240 대기열: Codex는 뒤 일 정보가 없어 working이면 그대로 기다린다', async () => {
  const c = fakeBoard({ kind: 'codex' });
  applyTermStatus(c.rt, 'working'); c.rt.bg = { tasks: SHELL_BG, at: Date.now() };
  const { q, sent } = qBoard(c);
  const d = q.enqueue(c.s.sessionId, 'codex 글');
  q.pump(); await tick(30);
  assert.equal(d.reason, 'working'); assert.deepEqual(sent, []);
});

test('P240 바로 보내기(sendNow): 뒤 일만 돌면 how send', () => {
  const f = fakeBoard(); f.prompt(); f.stop();
  const { q } = qBoard(f);
  q.stop && q.stop();
  const d = q.enqueue(f.s.sessionId, 'x');
  d.status = 'queued';
  const r = q.sendNow(d.deliveryId);
  assert.equal(r.how, 'send');
});

// ---------- 3. P237 후속(rig 가짜 판, p237 틀) ----------
// ---------- 가짜 판(p219 틀) ----------
async function board({ dir = tmp(), from = GROW, def = null, enable = true, batchMs = 40 } = {}) {
  fs.cpSync(from, dir, { recursive: true });
  if (def) { const f = path.join(dir, '.atrium', 'rig.json'); fs.writeFileSync(f, JSON.stringify(def, null, 2)); const t = new Date(Date.now() + Math.floor(Math.random() * 100000)); fs.utimesSync(f, t, t); }
  const store = new Store(path.join(dir, 'board.db'));
  const ws = await workspaceOf(dir);
  if (!store.getWorkspace(ws.key)) store.insertWorkspace({ ...ws, createdAt: 1 });
  const cfg = { profile: 'dev', terminalSession: 'atrium-dev-p232test', port: 0, dataDir: dir, sessionsDir: path.join(dir, 'sessions'), inputQuietMs: 3000, submitConfirmMs: 3000, deliveryMaxWaitMs: 60000, submitRetries: 0, rigCycles: false };
  const b = {
    cfg, apiToken: 'board-api-token', store, sessions: new Map(), bus: new EventEmitter(), killing: new Set(), sent: [], spawned: [],
    api: { broadcast: (n, d) => { (b.casts || (b.casts = [])).push({ n, d }); } }, log: () => {}, requireTerminal: () => {},
    adapter: { backend: 'hc', connected: true, readScreen: async () => '' },
    hooked: (s) => s.rt.hooked !== false,
    summary: (s) => { const d = deriveState(s.rt); return { sessionId: s.sessionId, name: s.name, state: d.state, ask: d.ask || null, error: d.error || null, rigSeat: s.rigSeat || null }; },
    ensureLink(from, to, patch = {}) {
      let l = store.linkByPair(from, to);
      if (!l) { l = { linkId: 'l' + crypto.randomBytes(4).toString('hex'), from, to, role: patch.role ?? null, spawned: !!patch.spawned, observed: !!patch.observed, createdAt: Date.now() }; store.insertLink(l); }
      return store.getLink(l.linkId);
    },
    linkEvent(l, kind, text = null, data = null) { return store.addLinkEvent(l.linkId, kind, text, data); },
    broadcastSession(s) { if (b.sessions.has(s.sessionId)) b.bus.emit('session', s, b.summary(s)); },
    async spawn(p) {
      const kind = p.kind || (p.launcherDef && p.launcherDef.harness) || 'claude';
      const s = add(p.name, { parentSessionId: p.parentSessionId || null, kind, cwd: p.cwd, onText: b.onSpawnText || null });
      if (p.branch) b.branch.noteChild(s.sessionId, p.branch);
      b.spawned.push(p);
      return { sessionId: s.sessionId, trust: { needsTrust: false } };
    },
    pushTree() { const idx = b.branch.relIndex(); return [...b.sessions.values()].map((s) => ({ sessionId: s.sessionId, parentSessionId: idx.workParentOf(s.sessionId), kind: s.kind || 'claude', state: deriveState(s.rt).state, delivering: b.queue.pending(s.sessionId), loops: 0, bg: null })); },
    closeSession(s, reason) { b.sessions.delete(s.sessionId); store.updateSession(s.sessionId, { closedAt: Date.now() }); b.bus.emit('closed', s, reason); },
    resolve: (r) => { for (const s of b.sessions.values()) if (s.name === r || s.sessionId === r) return s; throw Object.assign(new Error('no ' + r), { code: 'not_found' }); },
    resolveWorkspace: async (k) => { const w = store.getWorkspace(k || ws.key); if (!w) throw Object.assign(new Error('no ws'), { code: 'not_found' }); return w; },
    touch: () => {}, features: null,
  };
  b.rig = new Rig(b);
  b.rigDocs = new RigDocs(b, { pollMs: 50 });
  b.queue = new DeliveryQueue({
    store, cfg,
    view: (sid) => { const s = b.sessions.get(sid); if (!s) return { closed: true }; return { state: deriveState(s.rt).state, agentPresent: s.rt.term.present, termConnected: true, lastUserInputAt: 0, closed: false, kind: s.kind, hooked: b.hooked(s) }; },
    send: async (sid, text) => { if (b.stopped) return; b.sent.push({ sid, text }); const s = b.sessions.get(sid); if (s && s.agent) setTimeout(() => s.agent(text), 5); },
  });
  b.queue.start();
  b.branch = new Branch(b, { readyWaitMs: 30, submitWaitMs: 10, noticeBatchMs: batchMs, verbs: { pollMs: 15, settleMs: 300, turnGraceMs: 300, answerGraceMs: 200 } });
  b.queue.on('delivery', (d) => { if (['confirmed', 'unconfirmed', 'failed', 'cancelled'].includes(d.status)) b.branch.onDeliveryEnd(d); });
  const add = (name, { kind = 'claude', hooked = kind === 'claude', workMs = 30, onText = null, ...extra } = {}) => {
    const s = { sessionId: crypto.randomUUID(), name, cwd: dir, paneId: `${name}:p1`, agentName: name, permissionMode: 'manual', kind, origin: 'board', parentSessionId: null, workspaceKey: ws.key, rt: newRuntime({ kind, hooked }), createdAt: Date.now(), ...extra };
    s.rt.term.present = true; s.rt.phase = 'running'; applyTermStatus(s.rt, 'idle');
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
  if (enable) store.setRigEnabled(ws.key, true);
  const F = () => b.branch.flow;
  const L = () => b.branch.flow.loops;
  const seat = (s, name) => F().setSeat(s, name);
  const by = (name) => [...b.sessions.values()].find((x) => x.name === name);
  return { b, dir, ws, add, F, L, seat, by, stop: async () => { b.stopped = true; b.queue.stop(); b.branch.notices.stop(); b.branch.units.stops.stop(); F().stopCycles(); await tick(200); store.close(); } };
}
const U = (b) => b.branch.units;
const human = { kind: 'human' };
const local = { auth: { kind: 'local' } };
const V = (b) => b.branch.verbs;
const gotUnit = (s) => until(() => s.texts.some((t) => t.includes('[Atrium 보드] 관계:')));

const gotN = (s, n = 1) => until(() => s.texts.filter((t) => t.includes('[Atrium 보드] 관계:')).length >= n);
const done = (b, s, result, text) => U(b).doneVerb(s, { result, text });
const heads = (s) => s.texts.filter((t) => t.includes('[Atrium 보드] 관계:'));
// 요청 하나를 열고 main이 ok로 닫을 때까지 → 회
async function oneRun(t, main, from, text) {
  const n = heads(main).length;
  const r = t.L().onRequest(main, from, text);
  await gotN(main, n + 1);
  await until(() => main.rt.term.status === 'idle');
  await done(t.b, main, 'ok', '했다');
  await until(() => t.b.store.getCase(r.caseId).state === 'done');
  return t.b.store.getCase(r.caseId);
}


const talks = (b, key) => ledger(b, key, { kinds: ['loop_skip'] }).filter((r) => r.value === 'talk');
const casesN = (b, key) => b.store.casesOf(key).length;
const humanSend = (b, p) => Backend.prototype.send.call(b, p); // 사람의 보내기 칸(session.send)

test('P240(P237 후속 3): "회 없이" 사람 글은 개선 회의 사람 글 요약(rigPeriod)에서 빠진다. 회를 연 글은 남는다', async () => {
  const t = await board();
  const { b, ws, add, seat, stop } = t;
  try {
    const main = add('main'); seat(main, 'main');
    await until(() => main.rt.term.status === 'idle');
    const h = await humanSend(b, { target: ['main'], text: 'rig 정의를 고치자(관리 말)', talk: true });
    assert.ok(h.deliveries[0].talk);
    await until(() => main.texts.some((x) => x.includes('rig 정의를 고치자')));
    await until(() => main.rt.term.status === 'idle');
    await humanSend(b, { target: ['main'], text: '안내서 써 줘(교정 아닌 일)' });
    await until(() => main.texts.some((x) => x.includes('안내서 써 줘')));
    const P = b.store.rigPeriod(ws.key, 0, Date.now() + 1);
    assert.ok(P.human.some((x) => x.text.includes('안내서 써 줘')), '회를 연 글은 남는다');
    assert.ok(!P.human.some((x) => x.text.includes('rig 정의를 고치자')), '회 없이 넣은 글은 뺀다');
  } finally { await stop(); }
});

test('P240(P237 후속 6): 사람의 "회 없이"가 열린 회 때문에 거절되면 까닭은 코드 rig_run_open(창이 사전 글로 보인다)', async () => {
  const t = await board();
  const { b, add, seat, stop } = t;
  try {
    const main = add('main'); seat(main, 'main');
    const other = add('other');
    await until(() => main.rt.term.status === 'idle');
    t.L().onRequest(main, { kind: 'agent', session: other }, '안내서 써 줘');
    await until(() => b.store.openTryOf(main.sessionId));
    const h = await humanSend(b, { target: ['main'], text: '회 밖 글', talk: true });
    assert.equal(h.deliveries[0].status, 'failed');
    assert.equal(h.deliveries[0].reason, 'rig_run_open');
    assert.equal(b.store.getDelivery(h.deliveries[0].deliveryId).reason, 'rig_run_open');
  } finally { await stop(); }
});

test('P240(P237 후속 8): 멈춘 고리의 입구 자리 터미널에 친 요청은 회를 열지 않고 장부 loop_skip(value paused, data.via terminal)', async () => {
  const t = await board();
  const { b, ws, add, seat, stop } = t;
  try {
    const main = add('main'); seat(main, 'main');
    await until(() => main.rt.term.status === 'idle');
    b.store.setLoopRow(ws.key, 'work', { pausedAt: Date.now(), pausedBy: 'human' });
    assert.equal(t.L().onTyped(main, '멈춘 동안 친 요청', null), null);
    const rows = ledger(b, ws.key, { kinds: ['loop_skip'] }).filter((r) => r.value === 'paused');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].data.via, 'terminal'); assert.equal(rows[0].data.loop, 'work'); assert.equal(rows[0].actor, 'human');
    assert.equal(b.store.casesOf(ws.key).length, 0);
  } finally { await stop(); }
});
