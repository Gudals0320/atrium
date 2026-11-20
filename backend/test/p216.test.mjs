// P216 단위 시험: 판이 띄운 세션의 에이전트만 끝나고 셸 패널이 남으면(exited) 열린 시도를 stop_reason exited로 닫고 위 세션에 한 줄 알린다.
// 잠재우기·사람의 /exit·끄기·child-kill은 exited가 아니다. P249: 옛 rig 자리 세션의 다시 맡기기 시험은 걷어냈다.
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
import { STOP_REASONS, stopLine } from '../src/unit-stops.mjs';
import { agentExited } from '../src/work-units.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p216-'));
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 5000) { const t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > ms) throw new Error('until: 시간 초과'); await tick(10); } }

// ---------- 가짜 판(p182 틀) + 자리 ----------
async function board({ dir = tmp(), batchMs = 40 } = {}) {
  const store = new Store(path.join(dir, 'board.db'));
  const ws = await workspaceOf(dir);
  if (!store.getWorkspace(ws.key)) store.insertWorkspace({ ...ws, createdAt: 1 });
  const cfg = { profile: 'dev', terminalSession: 'atrium-dev-p216test', port: 0, dataDir: dir, sessionsDir: path.join(dir, 'sessions'), inputQuietMs: 3000, submitConfirmMs: 3000, deliveryMaxWaitMs: 60000, submitRetries: 0 };
  const b = {
    cfg, apiToken: 'board-api-token', store, sessions: new Map(), bus: new EventEmitter(), killing: new Set(), sent: [], spawned: [],
    api: { broadcast: () => {} }, log: () => {}, requireTerminal: () => {},
    adapter: { backend: 'hc', connected: true, readScreen: async () => '' },
    hooked: (s) => s.rt.hooked !== false,
    summary: (s) => { const d = deriveState(s.rt); return { sessionId: s.sessionId, name: s.name, state: d.state, ask: d.ask || null, error: d.error || null }; },
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
  return { b, dir, ws, add, stop: async () => { b.stopped = true; b.queue.stop(); b.branch.notices.stop(); b.branch.units.stops.stop(); await tick(200); store.close(); } };
}
const U = (b) => b.branch.units;
const V = (b) => b.branch.verbs;
const evs = (b, kind) => b.store.db.prepare('SELECT * FROM events WHERE kind = ? ORDER BY id').all(kind).map((e) => ({ ...e, data: JSON.parse(e.data || 'null') }));

const toSession = (b, s) => b.store.db.prepare('SELECT * FROM deliveries WHERE session_id = ? ORDER BY created_at').all(s.sessionId);
const stopNotices = (b, s) => toSession(b, s).filter((d) => d.text.startsWith('[Atrium 보드] 맡긴 일이 멈췄다'));
// 에이전트만 끝나고 셸 패널이 남는다(hc agent_released). code: 종료 코드, reason: SessionEnd 까닭(Claude Code hook), requested: 판이 끄라고 함
function exitAgent(b, s, { code = 1, reason = null, requested = false } = {}) {
  s.rt.term.launchPending = false;
  if (reason) applyHook(s.rt, { hook_event_name: 'SessionEnd', reason });
  if (requested) s.rt.exitRequested = true;
  applyAgentReleased(s.rt, Date.now(), { exitCode: code });
  b.broadcastSession(s);
}
const gotUnit = (s) => until(() => s.texts.length > 0 && s.rt.term.status === 'idle', 4000);

test('P216 판정: exited는 exit.kind other만(판이 끄라고 하지 않았다). normal·user·trust_declined·terminal_stopped는 아니다', () => {
  assert.equal(agentExited({ kind: 'other', code: 1 }), true);
  assert.equal(agentExited({ kind: 'other', requested: true }), false);
  for (const kind of ['normal', 'user', 'trust_declined', 'terminal_stopped']) assert.equal(agentExited({ kind }), false, kind);
  assert.equal(agentExited(null), false);
  assert.ok(STOP_REASONS.includes('exited'));
  const l = stopLine({ child: 'w1', unitId: 'u1', spec: '검토', why: 'exited', detail: '다시 맡기려면 새 하위를 띄운다(atrium child)' });
  assert.match(l, /^@w1의 일 u1\("검토"\): 에이전트가 끝나 셸만 남았다\(종료\)\. 일은 끝나지 않은 채 멈췄다\(다시 맡기려면 새 하위를 띄운다\(atrium child\)\)\.$/);
});

for (const kind of ['claude', 'codex', 'agy', 'pi', 'opencode']) {
  test(`P216 종류별 종료 감지(${kind}, 일반 하위): 셸만 남으면 시도 exited로 닫힘, 일 취소, 위 세션에 한 줄`, async () => {
    const { b, add, stop } = await board();
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
  const { b, add, stop } = await board();
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

