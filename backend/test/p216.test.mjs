// P216 단위 시험: 종료된 자리 세션(exited) 감지와 다시 맡기기(F0-1). 에이전트만 끝나고 셸 패널이 남으면 열린 시도를 stop_reason exited로 닫고,
// 주인(위 세션)에게 한 줄 알리고, 자리 한도에서 빼고, 건은 blocked, 자리 줄의 다음 일을 띄운다. atrium rig retry(관리자 자리·사람)로 같은 일을 같은 자리의 새 세션에.
// 잠재우기·사람의 /exit·끄기·child-kill은 exited가 아니다. 가짜 판은 p209 틀을 옮겼다(진짜 저장소·전달 대기열·Branch·Rig, 가짜 에이전트).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import { Store } from '../src/store.mjs';
import { newRuntime, applyHook, applyTermStatus, applyAgentReleased, deriveState } from '../src/state.mjs';
import { workspaceOf } from '../src/git.mjs';
import { DeliveryQueue } from '../src/delivery.mjs';
import { Branch } from '../src/branch.mjs';
import { Rig } from '../src/rig.mjs';
import { STOP_REASONS, stopLine } from '../src/unit-stops.mjs';
import { agentExited } from '../src/work-units.mjs';
import { rigAdminHandlers, RIG_ADMIN_OPS } from '../src/rig-admin.mjs';
import { rigGuideText } from '../src/rig-templates.mjs';
import { VERBS } from '../src/cli-contract.mjs';
import { summarizeChanges } from '../src/changes.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE = path.join(HERE, 'fixtures', 'rig-flow-sample');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p216-'));
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 5000) { const t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > ms) throw new Error('until: 시간 초과'); await tick(10); } }
function writeRig(root, def) {
  fs.cpSync(path.join(SAMPLE, '.atrium'), path.join(root, '.atrium'), { recursive: true });
  const f = path.join(root, '.atrium', 'rig.json');
  fs.writeFileSync(f, JSON.stringify(def, null, 2));
  const t = new Date(Date.now() + Math.floor(Math.random() * 100000)); fs.utimesSync(f, t, t);
}
// 시험 rig: main keep(관리자) + reviewer fresh 한도 1. 훅 없음
const rigDef = ({ launcher = 'claude', session = 'fresh' } = {}) => ({
  name: 'p216', results: ['ok', 'failed'],
  seats: { main: { launcher: 'claude', session: 'keep' }, reviewer: { launcher, session, ...(session === 'fresh' ? { max_live: 1 } : {}) } },
  flow: [{ from: 'main', on: 'assign', to: 'reviewer' }, { from: 'reviewer', on: 'ok', to: 'main' }],
  manager: 'main',
});

// ---------- 가짜 판(p182 틀) + 자리 ----------
async function board({ dir = tmp(), def = rigDef(), enable = true, batchMs = 40 } = {}) {
  if (def) writeRig(dir, def);
  const store = new Store(path.join(dir, 'board.db'));
  const ws = await workspaceOf(dir);
  if (!store.getWorkspace(ws.key)) store.insertWorkspace({ ...ws, createdAt: 1 });
  const cfg = { profile: 'dev', terminalSession: 'atrium-dev-p216test', port: 0, dataDir: dir, sessionsDir: path.join(dir, 'sessions'), inputQuietMs: 3000, submitConfirmMs: 3000, deliveryMaxWaitMs: 60000, submitRetries: 0 };
  const b = {
    cfg, apiToken: 'board-api-token', store, sessions: new Map(), bus: new EventEmitter(), killing: new Set(), sent: [], spawned: [],
    api: { broadcast: () => {} }, log: () => {}, requireTerminal: () => {},
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
    // 판의 끄기처럼: 판이 끄라고 해(exitRequested) 에이전트가 끝난 뒤(normal) 닫는다
    async kill(p) { const s = b.sessions.get(p.session); if (!s) return { closed: false }; b.killing.add(s.sessionId); try { s.rt.exitRequested = true; applyAgentReleased(s.rt, Date.now(), { exitCode: 0 }); b.broadcastSession(s); b.closeSession(s, 'killed'); } finally { b.killing.delete(s.sessionId); } return { closed: true }; },
  };
  b.rig = new Rig(b);
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
  const seat = (s, name) => F().setSeat(s, name);
  const by = (name) => [...b.sessions.values()].find((x) => x.name === name);
  return { b, dir, ws, add, F, seat, by, stop: async () => { b.stopped = true; b.branch.flow.stopCycles(); b.queue.stop(); b.branch.notices.stop(); b.branch.units.stops.stop(); await tick(200); store.close(); } };
}
const U = (b) => b.branch.units;
const V = (b) => b.branch.verbs;
const evs = (b, kind) => b.store.db.prepare('SELECT * FROM events WHERE kind = ? ORDER BY id').all(kind).map((e) => ({ ...e, data: JSON.parse(e.data || 'null') }));

const toSession = (b, s) => b.store.db.prepare('SELECT * FROM deliveries WHERE session_id = ? ORDER BY created_at').all(s.sessionId);
const stopNotices = (b, s) => toSession(b, s).filter((d) => d.text.startsWith('[Atrium 보드] 맡긴 일이 멈췄다'));
const LOCAL = { auth: { kind: 'local' } };
const DEVICE = { auth: { kind: 'device' } };
// 에이전트만 끝나고 셸 패널이 남는다(hc agent_released). code: 종료 코드, reason: SessionEnd 까닭(Claude Code hook), requested: 판이 끄라고 함
function exitAgent(b, s, { code = 1, reason = null, requested = false } = {}) {
  s.rt.term.launchPending = false;
  if (reason) applyHook(s.rt, { hook_event_name: 'SessionEnd', reason });
  if (requested) s.rt.exitRequested = true;
  applyAgentReleased(s.rt, Date.now(), { exitCode: code });
  b.broadcastSession(s);
}
const gotUnit = (s) => until(() => s.texts.length > 0 && s.rt.term.status === 'idle', 4000);
// main을 자리에 앉히고 reviewer 자리에 일을 맡긴다 → { main, rv, unit, caseId }
async function startCase(t, text = '검토해라') {
  const main = t.add('main');
  t.seat(main, 'main');
  const r = await V(t.b).prompt(main, { name: 'reviewer', text });
  const rv = t.by('reviewer-1');
  await gotUnit(rv);
  return { main, rv, unit: r.unit.id, caseId: r.unit.caseId };
}

test('P216 판정: exited는 exit.kind other만(판이 끄라고 하지 않았다). normal·user·trust_declined·terminal_stopped는 아니다', () => {
  assert.equal(agentExited({ kind: 'other', code: 1 }), true);
  assert.equal(agentExited({ kind: 'other', requested: true }), false);
  for (const kind of ['normal', 'user', 'trust_declined', 'terminal_stopped']) assert.equal(agentExited({ kind }), false, kind);
  assert.equal(agentExited(null), false);
  assert.ok(STOP_REASONS.includes('exited'));
  const l = stopLine({ child: 'reviewer-1', unitId: 'u1', spec: '검토', why: 'exited', detail: '다시 맡기기: atrium rig retry c1 u1' });
  assert.match(l, /^@reviewer-1의 일 u1\("검토"\): 에이전트가 끝나 셸만 남았다\(종료\)\. 일은 끝나지 않은 채 멈췄다\(다시 맡기기: atrium rig retry c1 u1\)\.$/);
  assert.ok(RIG_ADMIN_OPS.includes('retry'));
  assert.match(VERBS.find((v) => v.name === 'rig').args[0], /retry <건> \[<일>\]/);
  assert.match(rigGuideText(), /atrium rig retry <건> \[<일>\]/, 'atrium guide rig 한 줄');
});

for (const kind of ['claude', 'codex', 'agy', 'pi', 'opencode']) {
  test(`P216 종류별 종료 감지(${kind}, 일반 하위): 셸만 남으면 시도 exited로 닫힘, 일 취소, 위 세션에 한 줄`, async () => {
    const { b, add, stop } = await board({ def: null, enable: false });
    try {
      const lead = add('lead');
      const w = add('w1', { kind, parentSessionId: lead.sessionId });
      const r = await V(b).prompt(lead, { name: 'w1', text: '로그를 정리해라' });
      await gotUnit(w);
      const tr0 = b.store.openTryOf(w.sessionId);
      assert.ok(tr0, '열린 시도');
      exitAgent(b, w, { code: kind === 'claude' ? 1 : 3221225477 });
      assert.equal(deriveState(w.rt).state, 'exited');
      const tr = b.store.getTry(tr0.id);
      assert.equal(tr.stopReason, 'exited'); assert.ok(tr.endedAt);
      assert.equal(b.store.getUnit(r.unit.id).status, 'cancelled', '일반 하위의 일은 다시 맡기기 대신 취소(위 세션에 알리기만)');
      await until(() => stopNotices(b, lead).length === 1);
      const n = stopNotices(b, lead)[0].text;
      assert.match(n, /@w1의 일 u\w+\("로그를 정리해라"\): 에이전트가 끝나 셸만 남았다/);
      assert.match(n, /atrium child/);
      assert.match(n, /셸만 남은\(종료\) 세션에는 다시 시키지 않는다/, '끝줄: 종료된 세션에 다시 시키지 않는다');
      assert.equal(evs(b, 'unit_stop').filter((e) => e.data.why === 'exited').length, 1);
      // 같은 상태를 다시 방송해도 한 번만
      b.broadcastSession(w); await tick(120);
      assert.equal(stopNotices(b, lead).length, 1);
    } finally { await stop(); }
  });
}

test('P216 exited가 아닌 끝남: 사람의 /exit(Claude Code·Codex 종료 코드 0), 잠재우기, 끄기, child-kill', async () => {
  const { b, add, stop } = await board({ def: null, enable: false });
  try {
    const lead = add('lead');
    const mk = async (name, kind = 'claude') => { const w = add(name, { kind, parentSessionId: lead.sessionId }); await V(b).prompt(lead, { name, text: `${name}의 일` }); await gotUnit(w); return w; };
    // 사람의 /exit(Claude Code: SessionEnd prompt_input_exit → user)
    const a = await mk('a');
    exitAgent(b, a, { code: 0, reason: 'prompt_input_exit' });
    assert.equal(a.rt.exit.kind, 'user');
    assert.ok(b.store.openTryOf(a.sessionId), '사람이 끝낸 것은 시도를 닫지 않는다(지금 까닭 그대로)');
    // Codex를 사람이 Ctrl+C로 끝냄(종료 코드 0·130 → user)
    const c = await mk('c', 'codex');
    exitAgent(b, c, { code: 130 });
    assert.equal(c.rt.exit.kind, 'user');
    assert.ok(b.store.openTryOf(c.sessionId));
    // 잠재우기(판이 끄라고 함 → normal, 잠듦)
    const s = await mk('s');
    s.rt.sleep = { at: Date.now(), by: 'test' };
    exitAgent(b, s, { code: 0, requested: true });
    assert.equal(deriveState(s.rt).state, 'sleeping'); assert.equal(s.rt.exit.requested, true);
    assert.ok(b.store.openTryOf(s.sessionId));
    // 끄기(사람의 atrium kill: 판이 끄라고 하고 닫는다 → closed)
    const k = await mk('k');
    const tk = b.store.openTryOf(k.sessionId);
    await b.kill({ session: k.sessionId, confirm: true });
    assert.equal(b.store.getTry(tk.id).stopReason, 'closed');
    // child-kill(위 세션이 끈다 → closed, 알림 없음)
    const ck = await mk('ck');
    const tc = b.store.openTryOf(ck.sessionId);
    await b.branch.killChild(lead, { name: 'ck' });
    assert.equal(b.store.getTry(tc.id).stopReason, 'closed');
    await tick(200);
    assert.equal(evs(b, 'unit_stop').filter((e) => e.data.why === 'exited').length, 0, 'exited는 하나도 없다');
    assert.ok(!stopNotices(b, lead).some((d) => /셸만 남았다/.test(d.text)));
  } finally { await stop(); }
});

test('P216 rig 자리 세션 종료: 시도 exited, 일은 열린 채, 한도에서 빠짐, 건 blocked, 주인에게 retry 한 줄, 자리 줄의 다음 일 띄움, 그래프', async () => {
  const t = await board({ def: rigDef({ launcher: 'codex' }) });
  const { b, ws, F, by, stop } = t;
  try {
    const { main, rv, unit, caseId } = await startCase(t);
    assert.equal(rv.kind, 'codex');
    assert.equal(F().liveCount(ws.key, 'reviewer'), 1);
    // 두 번째 건: 한도 1이라 자리 줄에 선다
    const r2 = await V(b).prompt(main, { name: 'reviewer', text: '둘째 검토', case: undefined });
    const u2 = b.store.getUnit(r2.unit.id);
    assert.equal(u2.to, '', '자리 줄');
    // reviewer-1의 에이전트가 죽는다(셸만 남음)
    const tr0 = b.store.openTryOf(rv.sessionId);
    exitAgent(b, rv, { code: 1 });
    assert.equal(b.store.getTry(tr0.id).stopReason, 'exited');
    assert.equal(b.store.getUnit(unit).status, 'open', 'rig 일은 열린 채(다시 맡긴다)');
    const c = b.store.getCase(caseId);
    assert.equal(c.state, 'blocked');
    assert.match(c.blockedReason, /^reviewer-1 종료/);
    const ts = evs(b, 'rig_try_stopped');
    assert.equal(ts.length, 1); assert.equal(ts[0].data.why, 'exited'); assert.equal(ts[0].data.unitId, unit);
    // 주인에게 멈춤 한 줄(다시 맡기는 명령), 막힘 알림은 따로 가지 않는다
    await until(() => stopNotices(b, main).length === 1);
    assert.match(stopNotices(b, main)[0].text, new RegExp(`@reviewer-1의 일 ${unit}.*셸만 남았다.*다시 맡기기: atrium rig retry ${caseId} ${unit}`));
    assert.equal(toSession(b, main).filter((d) => /이 막혔다\(blocked\)/.test(d.text)).length, 0);
    // 자리가 비어 줄 선 둘째 일이 reviewer-2로 뜬다
    await until(() => by('reviewer-2') && b.store.getUnit(u2.id).to === by('reviewer-2').sessionId);
    const rv2 = by('reviewer-2');
    await gotUnit(rv2);
    assert.equal(F().liveCount(ws.key, 'reviewer'), 1, 'reviewer-1은 세지 않고 reviewer-2만');
    // 그래프: 일 retry, 자리 세션 exited, busy는 reviewer-2만
    const g = F().graph()[ws.key];
    const gc = g.cases.find((x) => x.id === caseId);
    const gu = gc.units.find((x) => x.unit === unit);
    assert.equal(gu.retry, true); assert.equal(gu.stop, 'exited');
    const seat = g.seats.find((x) => x.name === 'reviewer');
    assert.deepEqual(seat.sessions.map((x) => [x.name, x.busy, x.exited]), [['reviewer-1', false, true], ['reviewer-2', true, false]]);
  } finally { await stop(); }
});

test('P216 다시 맡기기: 권한(관리자 자리·사람만), 한도가 차면 자리 줄, 자리가 비면 새 세션, 건이 다시 열림, 장부', async () => {
  const t = await board();
  const { b, ws, F, by, add, stop } = t;
  try {
    const { main, rv, unit, caseId } = await startCase(t);
    const tr0 = b.store.openTryOf(rv.sessionId);
    exitAgent(b, rv);
    assert.equal(b.store.getCase(caseId).state, 'blocked');
    // 권한: 자리 없는 세션·관리자가 아닌 자리는 거절, 창(사람)은 판 API 토큰만
    const other = add('other');
    await assert.rejects(b.branch.rigAdmin.verb(other, { op: 'retry', caseId }), (e) => e.code === 'forbidden');
    await assert.rejects(rigAdminHandlers(b)['rig.retry']({ caseId }, DEVICE), (e) => e.code === 'forbidden');
    // 다시 맡길 수 없는 것
    await assert.rejects(b.branch.rigAdmin.verb(main, { op: 'retry', caseId: 'cnope' }), (e) => e.code === 'not_found');
    await assert.rejects(b.branch.rigAdmin.verb(main, { op: 'retry', caseId, unitId: 'unope' }), (e) => e.code === 'not_retryable');
    // 관리자 자리(main)가 다시 맡긴다 → reviewer-2
    const r = await b.branch.rigAdmin.verb(main, { op: 'retry', caseId });
    assert.equal(r.retried.length, 1);
    assert.equal(r.retried[0].unit, unit); assert.equal(r.retried[0].from, 'reviewer-1'); assert.equal(r.retried[0].to, 'reviewer-2');
    assert.equal(r.case.state, 'open', '다시 맡길 일이 남지 않아 건이 다시 열림');
    const rv2 = by('reviewer-2');
    await gotUnit(rv2);
    assert.equal(b.store.getUnit(unit).to, rv2.sessionId);
    assert.equal(b.store.triesOfUnit(unit).length, 2);
    assert.match(rv2.texts[0], new RegExp(`건 ${caseId}의 일 ${unit}`));
    const ev = evs(b, 'rig_unit_retried');
    assert.equal(ev.length, 1); assert.equal(ev[0].data.fromTry, tr0.id); assert.equal(ev[0].data.toSession, rv2.sessionId); assert.equal(ev[0].data.by, 'manager');
    assert.ok(evs(b, 'rig_case_resume').some((e) => e.data.why === 'retry'));
    // 한 번 더: 그 일은 이제 돌고 있어 다시 맡길 수 없다
    await assert.rejects(b.branch.rigAdmin.verb(main, { op: 'retry', caseId }), (e) => e.code === 'not_retryable');
    // reviewer-2가 done하면 건이 이어진다(흐름 그대로)
    await U(b).doneVerb(rv2, { result: 'ok', text: '검토 끝' });
    assert.equal(b.store.getUnit(unit).status, 'done');
  } finally { await stop(); }
});

test('P216 다시 맡기기: 자리가 한도면 자리 줄에 서고 자리가 비면 판이 띄운다. 사람(창)의 rig.retry, 사람이 /exit로 끝낸 세션의 일도', async () => {
  const t = await board();
  const { b, ws, F, by, stop } = t;
  try {
    const { main, rv, unit, caseId } = await startCase(t);
    // 사람이 /exit로 끝냈다: exited로 닫히지 않지만(시도는 열린 채) 사람이 다시 맡길 수 있다
    exitAgent(b, rv, { code: 0, reason: 'prompt_input_exit' });
    assert.ok(b.store.openTryOf(rv.sessionId));
    assert.equal(F().graph()[ws.key].cases[0].units[0].retry, true, '그래프에도 다시 띄우기');
    // 그사이 다른 건이 reviewer 자리를 쥔다(reviewer-1은 열린 시도를 쥐어 아직 한도에 든다 → 자리 줄)
    const r2 = await V(b).prompt(main, { name: 'reviewer', text: '둘째' });
    assert.equal(b.store.getUnit(r2.unit.id).to, '');
    const h = await rigAdminHandlers(b)['rig.retry']({ workspace: ws.key, caseId, unitId: unit }, LOCAL);
    assert.equal(h.retried[0].to, 'reviewer-2', '다시 맡기기가 reviewer-1의 시도를 닫아 자리가 비었다');
    const ts = evs(b, 'rig_try_stopped');
    assert.equal(ts.length, 1); assert.equal(ts[0].data.by, 'retry');
    assert.equal(evs(b, 'rig_unit_retried')[0].data.by, 'human');
    // 이제 reviewer-2가 쥐어 둘째는 계속 줄
    const rv2 = by('reviewer-2'); await gotUnit(rv2);
    assert.equal(b.store.getUnit(r2.unit.id).to, '');
    // reviewer-2도 죽는다 → 둘째가 reviewer-3으로 뜨고, 다시 맡기면 한도라 줄에 선다
    exitAgent(b, rv2);
    await until(() => by('reviewer-3'));
    await gotUnit(by('reviewer-3'));
    const h2 = await rigAdminHandlers(b)['rig.retry']({ workspace: ws.key, caseId }, LOCAL);
    assert.equal(h2.retried[0].seatWait, true);
    assert.equal(b.store.getUnit(unit).to, '');
    // reviewer-3이 끝나면 줄 선 다시 맡긴 일이 reviewer-4로
    await U(b).doneVerb(by('reviewer-3'), { result: 'ok', text: '둘째 끝' });
    await until(() => by('reviewer-4') && b.store.getUnit(unit).to === by('reviewer-4').sessionId);
  } finally { await stop(); }
});

test('P216 keep 자리 종료와 다시 맡기기: 끝난 세션을 자리에서 떼고 새 세션', async () => {
  const t = await board({ def: rigDef({ session: 'keep' }) });
  const { b, F, by, add, stop } = t;
  try {
    const main = add('main'); t.seat(main, 'main');
    const r = await V(b).prompt(main, { name: 'reviewer', text: '검토' });
    const rv = by('reviewer'); await gotUnit(rv);
    exitAgent(b, rv);
    assert.equal(b.store.getCase(r.unit.caseId).state, 'blocked');
    const x = await b.branch.rigAdmin.verb(main, { op: 'retry', caseId: r.unit.caseId });
    assert.equal(rv.rigSeat, null, '끝난 keep 세션은 자리에서 뗀다');
    const nv = by(x.retried[0].to);
    assert.equal(nv.rigSeat, 'reviewer');
    await gotUnit(nv);
  } finally { await stop(); }
});

test('P216 복귀 요약: 제작 세션의 exited 멈춤 글', () => {
  const out = summarizeChanges([{ kind: 'rig_builder_stop', sessionId: 's1', t: 1, data: { why: 'exited', name: 'rig-builder' } }], { nameOf: () => 'rig-builder' });
  assert.match(out[0].text, /에이전트가 끝남/);
});
