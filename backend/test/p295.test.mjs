// P295 단위 시험: 답 실어 보내기. 보내는 때(timing)의 기본(마지막 턴·그 뒤 쉼 → now, 그 사이 새 턴 → next, 확인·할 일 → next, --no-wait·--wait, 사람이 바꿈),
// 모두 next면 붙잡음, now 하나면 곧바로, 다음 전달(사람·다른 세션·판 알림·스티어링) 앞에 붙음, 터미널 직접 입력은 지금 턴에 넣기(rideOnly),
// 지금 보내기, 실린 전달이 실패하면 되돌림, 세션 닫히면 버림, CLI --no-wait, 안내문.
// 진짜 저장소·전달 대기열(B1)·Branch, 가짜 에이전트(p292 시험의 틀). herdr·hc와 claude 없이 돈다.
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
import { timingArg } from '../src/decisions.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p295-'));
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 3000) { const t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > ms) throw new Error('until: 시간 초과'); await tick(10); } }

// ---------- 가짜 판: 진짜 저장소·전달 대기열·Branch, 가짜 에이전트 ----------
async function board({ dir = tmp() } = {}) {
  const store = new Store(path.join(dir, 'board.db'));
  const ws = await workspaceOf(dir);
  if (!store.getWorkspace || !store.getWorkspace(ws.key)) try { store.insertWorkspace({ ...ws, createdAt: 1 }); } catch {}
  const cfg = { profile: 'dev', terminalSession: 'atrium-dev-p295test', port: 0, dataDir: dir, sessionsDir: path.join(dir, 'sessions'), inputQuietMs: 3000, submitConfirmMs: 3000, deliveryMaxWaitMs: 60000, submitRetries: 0 };
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
  b.decisions.autoSetting = () => false; // 가짜 에이전트의 답("답: …?")으로 자동 카드가 생기지 않게
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


// ---------- P295 ----------
const events = (b, kind) => b.store.db.prepare('SELECT * FROM events WHERE kind = ? ORDER BY id').all(kind).map((e) => ({ ...e, data: JSON.parse(e.data || 'null') }));
const ask = (b, s, o) => b.branch.dispatch('ask', s, o);
const todo = (b, s, o) => b.branch.dispatch('todo', s, o);
const dl = (b, s) => b.store.db.prepare('SELECT * FROM deliveries WHERE session_id = ? ORDER BY created_at').all(s.sessionId);
const cardOf = (b, id) => b.branch.handlers['decision.list']().cards.find((d) => d.id === id);
const err = (fn) => { try { fn(); } catch (e) { return e; } return null; };

test('P295 보내는 때 기본: 마지막 턴에서 만든 결정(그 뒤 쉼) → now, 그 사이 새 턴 → next, 확인·할 일 → next, --no-wait·--wait, 사람이 바꿈', async () => {
  const { b, add, busy, rest, stop } = await board();
  const h = b.branch.handlers;
  const changed = [];
  b.api.broadcast = (ev, d) => { if (ev === 'decision.changed') changed.push(d); };
  try {
    const lead = add('lead');
    // 턴 안에서 묻고 쉰다 → now(답하면 곧바로)
    busy(lead); await tick(3);
    const a = ask(b, lead, { question: '마무리할까요?', options: ['예', '아니오'] });
    rest(lead);
    assert.equal(cardOf(b, a.id).timing, 'now'); assert.equal(cardOf(b, a.id).timingBy, 'board');
    const n0 = dl(b, lead).length;
    const ra = h['decision.answer']({ id: a.id, answer: '예' });
    assert.equal(ra.timing, 'now'); assert.ok(ra.deliveryId); assert.equal(dl(b, lead).length, n0 + 1);
    await until(() => lead.texts.includes('[결정] 마무리할까요? → 예'));
    await until(() => deriveState(lead.rt).state === 'ready');
    // 묻고 난 뒤 세션이 다른 일을 했다(새 턴) → next(붙잡음)
    busy(lead); await tick(3);
    const c = ask(b, lead, { question: '이름은?' });
    rest(lead); await tick(3);
    assert.equal(cardOf(b, c.id).timing, 'now');
    changed.length = 0;
    busy(lead);
    assert.equal(changed.at(-1).cards.find((d) => d.id === c.id).timing, 'next', '새 턴이 열리면 다시 알린다(now → next)');
    rest(lead);
    const n1 = dl(b, lead).length;
    const rc = h['decision.answer']({ id: c.id, answer: 'A' });
    assert.equal(rc.timing, 'next'); assert.equal(rc.held, true); assert.equal(rc.riding, true); assert.equal(rc.deliveryId, null);
    assert.equal(dl(b, lead).length, n1, '모두 next면 붙잡는다');
    assert.deepEqual(h['decision.list']().riding, { [lead.sessionId]: 1 });
    assert.deepEqual(changed.at(-1).riding, { [lead.sessionId]: 1 });
    assert.equal(b.store.getDecision(c.id).timing, 'next');
    assert.ok(events(b, 'decision_end').some((e) => e.data.id === c.id && e.data.timing === 'next' && e.data.timingBy === 'board'));
    h['decision.flush']({ sessionId: lead.sessionId });
    // 확인·--tell 할 일은 판의 기본 next
    const k = todo(b, lead, { text: '화면 확인', check: true });
    const t = todo(b, lead, { text: '키 등록', tell: true });
    assert.equal(cardOf(b, k.id).timing, 'next'); assert.equal(cardOf(b, t.id).timing, 'next');
    const n2 = dl(b, lead).length;
    assert.equal(h['decision.check']({ id: k.id, ok: true }).held, true);
    assert.equal(h['decision.done']({ id: t.id }).riding, true);
    assert.equal(dl(b, lead).length, n2);
    assert.equal(b.store.heldAnswers(lead.sessionId).length, 2);
    h['decision.flush']({ sessionId: lead.sessionId });
    // 에이전트가 정함: --no-wait(next)는 같은 턴이어도 next, --wait(now)는 확인이어도 now
    busy(lead); await tick(3);
    const nw = ask(b, lead, { question: '나중에 알려 줘도 되는 질문?', noWait: true });
    const wk = todo(b, lead, { text: '로그인 확인', check: true, wait: true });
    rest(lead);
    assert.equal(cardOf(b, nw.id).timing, 'next'); assert.equal(cardOf(b, nw.id).timingBy, 'agent');
    assert.equal(cardOf(b, wk.id).timing, 'now');
    assert.equal(b.store.getDecision(nw.id).timing, 'next');
    // 사람이 바꿈: next 카드를 now로 → 곧바로(now 하나라도 있으면 함께)
    const n3 = dl(b, lead).length;
    assert.equal(h['decision.answer']({ id: nw.id, answer: '좋아' }).held, true, '확인 카드가 남아 모은다');
    const rk = h['decision.check']({ id: wk.id, ok: false, note: '안 됨', timing: 'next' });
    assert.equal(rk.timing, 'next'); assert.equal(rk.held, true, '사람이 next로 바꿨다: 모두 next → 붙잡음');
    assert.equal(dl(b, lead).length, n3);
    const x = ask(b, lead, { question: '하나 더?', noWait: true });
    const rx = h['decision.answer']({ id: x.id, answer: '예', timing: 'now' });
    assert.equal(rx.timing, 'now'); assert.ok(rx.deliveryId, 'now 하나면 모은 답 모두 곧바로');
    assert.equal(dl(b, lead).at(-1).text, '[결정] 나중에 알려 줘도 되는 질문? → 좋아\n[확인] 로그인 확인 → 안 됐다: 안 됨\n[결정] 하나 더? → 예');
    const f = events(b, 'decision_flush').at(-1).data;
    assert.equal(f.why, 'all'); assert.equal(f.now, 1); assert.equal(f.next, 2);
    // 틀린 값
    assert.equal(err(() => h['decision.answer']({ id: ask(b, lead, { question: 'Z?' }).id, answer: 'z', timing: 'later' })).code, 'bad_request');
    assert.equal(err(() => ask(b, lead, { question: 'W?', wait: true, noWait: true })).code, 'bad_request');
    assert.equal(timingArg({}), null); assert.equal(timingArg({ noWait: true }), 'next'); assert.equal(timingArg({ wait: true }), 'now'); assert.equal(timingArg({ timing: 'next' }), 'next');
  } finally { await stop(); }
});

test('P295 실어 보내기: 붙잡은 답은 다음 전달(다른 세션의 atrium prompt·판 알림·사람의 스티어링) 앞에 한 덩어리로, 지금 보내기, 세션 닫히면 버림', async () => {
  const { b, add, busy, rest, stop } = await board();
  const h = b.branch.handlers;
  try {
    const lead = add('lead'); const other = add('other');
    const held = (s, q) => { const c = ask(b, s, { question: q, noWait: true }); h['decision.answer']({ id: c.id, answer: '예' }); return c; };
    // 다른 세션의 atrium prompt
    const c1 = held(lead, '첫째?'); const c2 = held(lead, '둘째?');
    assert.equal(b.store.heldAnswers(lead.sessionId).length, 2);
    const n0 = dl(b, lead).length;
    await b.branch.dispatch('prompt', other, { name: 'lead', text: '이 일을 해 줘' });
    await until(() => lead.texts.some((t) => t.endsWith('이 일을 해 줘')));
    assert.equal(dl(b, lead).length, n0 + 1, '한 전달');
    assert.equal(lead.texts.at(-1), '[결정] 첫째? → 예\n[결정] 둘째? → 예\n\n이 일을 해 줘');
    assert.equal(dl(b, lead).at(-1).text, lead.texts.at(-1), '전달 글도 바뀐다(제출 확인이 맞는다)');
    await until(() => dl(b, lead).at(-1).status === 'confirmed');
    assert.equal(b.store.heldAnswers(lead.sessionId).length, 0);
    const r = events(b, 'decision_flush').at(-1).data;
    assert.equal(r.why, 'ride'); assert.equal(r.origin, 'agent'); assert.deepEqual(r.ids, [c1.id, c2.id]); assert.equal(r.next, 2); assert.equal(r.now, 0);
    await until(() => deriveState(lead.rt).state === 'ready');
    // 판 알림(origin board)
    held(lead, '셋째?');
    b.queue.enqueue(lead.sessionId, '[Atrium 보드] 알림');
    await until(() => lead.texts.at(-1) === '[결정] 셋째? → 예\n\n[Atrium 보드] 알림');
    assert.equal(events(b, 'decision_flush').at(-1).data.origin, 'board');
    await until(() => deriveState(lead.rt).state === 'ready');
    // 사람의 스티어링(typeNow + aside): 일하는 중이면 그 턴에 넣는 글에 실린다
    busy(lead);
    held(lead, '넷째?');
    b.queue.inspect = async () => ({ box: 'empty' });
    const n1 = b.sent.length;
    b.queue.enqueue(lead.sessionId, '방향을 바꿔', { typeNow: true, aside: true, origin: { kind: 'human' } });
    await until(() => b.sent.length > n1);
    assert.equal(b.sent.at(-1).text, '[결정] 넷째? → 예\n\n방향을 바꿔');
    assert.equal(events(b, 'decision_flush').at(-1).data.steer, true);
    b.queue.inspect = null;
    await until(() => deriveState(lead.rt).state === 'ready', 4000);
    rest(lead);
    // 붙잡은 답이 없으면 그대로
    const n2 = events(b, 'decision_flush').length;
    b.queue.enqueue(lead.sessionId, '그냥 글');
    await until(() => lead.texts.at(-1) === '그냥 글');
    assert.equal(events(b, 'decision_flush').length, n2);
    await until(() => deriveState(lead.rt).state === 'ready');
    // 지금 보내기
    held(lead, '다섯째?');
    const f = h['decision.flush']({ sessionId: lead.sessionId });
    assert.ok(f.deliveryId); assert.equal(events(b, 'decision_flush').at(-1).data.why, 'now');
    await until(() => lead.texts.at(-1) === '[결정] 다섯째? → 예');
    // 세션이 닫히면 버린다
    held(lead, '여섯째?');
    b.closeSession(lead, 'test');
    await tick(20);
    assert.equal(b.store.heldAnswers(lead.sessionId).length, 0);
    assert.equal(events(b, 'decision_flush').at(-1).data.why, 'closed');
  } finally { await stop(); }
});

test('P295 실린 전달이 실패·취소되면 답을 다시 붙잡는다(decision_ride_back)', async () => {
  const { b, add, stop } = await board();
  const h = b.branch.handlers;
  try {
    const lead = add('lead');
    const c = ask(b, lead, { question: '실패할 글?', noWait: true }); h['decision.answer']({ id: c.id, answer: '예' });
    const send = b.queue.send;
    b.queue.send = async () => { throw Object.assign(new Error('boom'), { code: 'boom' }); };
    const d = b.queue.enqueue(lead.sessionId, '실어 갈 글', { origin: { kind: 'agent' } });
    await until(() => b.store.getDelivery(d.deliveryId).status === 'failed');
    assert.equal(b.store.getDelivery(d.deliveryId).text, '[결정] 실패할 글? → 예\n\n실어 갈 글');
    assert.deepEqual(b.store.heldAnswers(lead.sessionId).map((x) => x.id), [c.id], '다시 붙잡았다');
    assert.ok(events(b, 'decision_ride_back').some((e) => e.data.deliveryId === d.deliveryId && e.data.status === 'failed'));
    b.queue.send = send;
    // 다음 글에 다시 실린다
    b.queue.enqueue(lead.sessionId, '다음 글', { origin: { kind: 'agent' } });
    await until(() => lead.texts.at(-1) === '[결정] 실패할 글? → 예\n\n다음 글');
  } finally { await stop(); }
});

test('P295 터미널에 직접 친 글로 연 턴: 넣을 수 있는 세션은 그 턴에 스티어링(rideOnly), 못 넣고 턴이 끝나면 취소·되돌림, 넣지 못하는 종류는 다음 판 전달을 기다림', async () => {
  const { b, add, busy, rest, stop } = await board();
  const h = b.branch.handlers;
  try {
    const lead = add('lead');
    const held = (s, q) => { const c = ask(b, s, { question: q, noWait: true }); h['decision.answer']({ id: c.id, answer: '예' }); return c; };
    // 그 턴에 넣음
    held(lead, '터미널 하나?');
    b.queue.inspect = async () => ({ box: 'empty' });
    busy(lead);
    const n0 = b.sent.length;
    b.decisions.onHuman(lead.sessionId, 'terminal');
    const f = events(b, 'decision_flush').at(-1).data;
    assert.equal(f.why, 'ride_steer');
    await until(() => b.sent.length > n0);
    assert.equal(b.sent.at(-1).text, '[결정] 터미널 하나? → 예');
    const d0 = b.store.getDelivery(f.deliveryId);
    assert.ok(['sent', 'confirmed'].includes(d0.status)); assert.equal(d0.reason === 'typed' || d0.reason === null || d0.status === 'confirmed', true);
    await until(() => deriveState(lead.rt).state === 'ready', 4000);
    // 넣지 못하고 턴이 끝남(입력 칸을 못 읽음) → 취소하고 다시 붙잡는다. 턴을 새로 만들지 않는다
    b.queue.inspect = async () => ({ box: 'other' });
    const c2 = held(lead, '터미널 둘?');
    busy(lead);
    b.decisions.onHuman(lead.sessionId, 'terminal');
    const id2 = events(b, 'decision_flush').at(-1).data.deliveryId;
    await tick(100);
    const n1 = b.sent.length;
    rest(lead);
    await until(() => b.store.getDelivery(id2).status === 'cancelled');
    assert.equal(b.store.getDelivery(id2).reason, 'ride_missed');
    assert.equal(b.sent.length, n1, '턴이 끝난 뒤 보내지 않는다');
    await until(() => b.store.heldAnswers(lead.sessionId).length === 1);
    assert.equal(b.store.heldAnswers(lead.sessionId)[0].id, c2.id);
    assert.ok(events(b, 'decision_ride_back').some((e) => e.data.deliveryId === id2 && e.data.reason === 'ride_missed'));
    b.queue.inspect = null;
    // 일하는 중 입력을 받지 못하는 종류(hook 없는 Claude Code): 다음 판 전달을 기다린다
    const nh = add('nohook', { hooked: false });
    held(nh, '훅 없음?');
    const n2 = dl(b, nh).length;
    b.decisions.onHuman(nh.sessionId, 'terminal');
    assert.equal(dl(b, nh).length, n2); assert.equal(b.store.heldAnswers(nh.sessionId).length, 1);
    // 명령 바 글(bar)은 따로 보내지 않는다(그 글에 실린다)
    const n3 = dl(b, lead).length;
    b.decisions.onHuman(lead.sessionId, 'bar');
    assert.equal(dl(b, lead).length, n3); assert.equal(b.store.heldAnswers(lead.sessionId).length, 1);
  } finally { await stop(); }
});

test('P295 CLI: atrium ask --no-wait·todo --check --wait, 함께 쓰면 쓰임 틀림, 출력에 실려 옴 안내', async () => {
  const { b, add, stop } = await board();
  const srv = await serve(b);
  try {
    const lead = add('lead');
    const env = envOf(b, lead);
    const r1 = await runCli(['ask', '기다리지 않는 질문?', '--no-wait'], env);
    assert.equal(r1.code, 0, r1.stderr); assert.match(r1.stdout, /다음 글이 갈 때 그 앞에 실려 온다/);
    const r2 = await runCli(['todo', '배포 확인', '--check', '--wait', '--json'], env);
    assert.equal(r2.code, 0, r2.stderr); assert.equal(JSON.parse(r2.stdout).card.timing, 'now');
    const r3 = await runCli(['ask', '둘 다?', '--wait', '--no-wait'], env);
    assert.equal(r3.code, 2);
    const cards = b.store.openDecisions(lead.sessionId);
    assert.equal(cards[0].timing, 'next'); assert.equal(cards[1].timing, 'now');
    const h1 = await runCli(['help'], env);
    assert.match(h1.stdout, /atrium ask .*--no-wait \| --wait/);
  } finally { srv.close(); await stop(); }
});

test('P295 안내: 판·하네스 안내문 한 줄에 --no-wait, 스킬 본문, 계약 8 그대로', () => {
  for (const p of [BOARD_SYSTEM_PROMPT, HARNESS_PROMPT]) {
    const line = String(p).split('\n').find((l) => l.includes('atrium ask'));
    assert.ok(line && line.includes('기다리지 않는 질문·확인은 `--no-wait`'), '한 줄에 몇 낱말');
  }
  const sk = boardSkill();
  assert.match(sk, /--no-wait/); assert.match(sk, /실려 온다/);
  assert.equal(CONTRACT_VERSION, 13); // P364: know로 12. // P360: revive·fork로 11. // P346: docs init·on·off로 10. // P296으로 9
  assert.ok(VERBS.find((v) => v.name === 'ask').args.includes('[--no-wait | --wait]'));
  assert.ok(VERBS.find((v) => v.name === 'todo').args.includes('[--no-wait | --wait]'));
});
