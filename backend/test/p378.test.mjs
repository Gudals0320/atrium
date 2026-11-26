// P378 시험: 신뢰 질문 단계에서 살아 있는 claude를 끝남(exited, other)으로 잘못 두던 것.
// Claude Code는 신뢰 질문 중에도 7501(blocked, "trust this folder")을 말하고, 답하면 그 상태를 지운 뒤 곧 idle을 말한다.
// hc 어댑터가 지움에서 나온 놓임을 들고 있는(300ms) 동안 다시 나타남이 먼저 나가고, 늦게 풀린 놓임이 끝남을 만들었다.
// 고침: (1) 같은 에이전트가 다시 말하면 들고 있던 놓임을 버린다, (2) 끝남으로 둔 세션에 같은 세션의 hook이나 터미널 working이 오면
// 터미널에서 에이전트를 확인하고 되살린다(이미 나간 끝남 알림은 exit_revoked에 적는다). 진짜 끝남은 그대로다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { HcAdapter } from '../src/hc/adapter.mjs';
import { LABEL } from '../src/hc/model.mjs';
import { startFakeHc } from './fake-hc.mjs';
import { Store } from '../src/store.mjs';
import { Backend } from '../src/backend.mjs';
import { newRuntime, applyHook, applyTermStatus, applyAgentDetected, applyAgentReleased, applyExitRevoked, deriveState } from '../src/state.mjs';
import { revocable, revokeExit } from '../src/exit-revoke.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 3000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await sleep(20); } throw new Error('timed out'); };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p378-'));
const TRUST = { app: 'claude-code', state: 'blocked', kind: 'permission', msg: 'trust this folder' };

async function rig() {
  const fake = await startFakeHc();
  fake.silent = (t) => t.argv[0] === 'claude'; // 아래에서 상태를 직접 말한다
  const a = new HcAdapter({ session: 'p378-unit', dataDir: null, pipe: fake.pipe, env: {}, moveWaitMs: 500, trustPollMs: 30 });
  const ev = [];
  a.on('event', (e) => ev.push(e));
  a.startEvents();
  await until(() => a.connected);
  const ws = await a.createWorkspace({ cwd: 'C:/w' });
  const r = await a.startAgent({ name: 'lead', paneId: ws.paneId, kind: 'claude' });
  return { fake, a, ev, addr: r.agent.paneId };
}

test('P378 hc: 신뢰 질문 상태(7501) → 지움 → 60ms 뒤 idle. 놓임을 내지 않고 idle만 낸다(판은 trust_wait → ready)', async () => {
  const { fake, a, ev, addr } = await rig();
  try {
    assert.equal(fake.terms.get(addr).labels[LABEL.agent], 'claude');
    fake.setStatus(addr, TRUST);
    await until(() => ev.find((e) => e.type === 'status' && e.paneId === addr && e.status === 'blocked'));
    fake.setStatus(addr, null); // 신뢰 질문이 닫히며 상태를 지움
    await sleep(60);
    fake.setStatus(addr, { app: 'claude-code', state: 'idle' });
    await until(() => ev.find((e) => e.type === 'status' && e.paneId === addr && e.status === 'idle'));
    await sleep(600); // 놓임을 들고 있는 시간(300ms)이 지나도
    assert.equal(ev.filter((e) => e.paneId === addr && e.type === 'agent_released').length, 0, '놓임이 늦게 풀리지 않는다');
    // 판 상태: 그 차례를 그대로 runtime에 넣는다
    const rt = newRuntime({ kind: 'claude' });
    for (const e of ev.filter((x) => x.paneId === addr)) {
      if (e.type === 'agent_detected') applyAgentDetected(rt);
      else if (e.type === 'status') { applyTermStatus(rt, e.status); if (e.status === 'blocked') rt.trustScreen = { at: Date.now() }; }
      else if (e.type === 'agent_released') applyAgentReleased(rt);
    }
    assert.equal(rt.exit, null);
    assert.equal(deriveState(rt).state, 'ready');
    // 그 뒤 일하는 상태도 그대로 들어온다
    fake.setStatus(addr, { app: 'claude-code', state: 'working' });
    await until(() => ev.find((e) => e.type === 'status' && e.paneId === addr && e.status === 'working'));
  } finally { a.stopEvents(); await fake.close(); }
});

test('P378 hc 불변식: 상태를 지우고 다시 말하지 않으면 놓임은 그대로 나간다(들고 있다가). 진짜 끝남(finished)도 그대로', async () => {
  const { fake, a, ev, addr } = await rig();
  try {
    fake.setStatus(addr, { app: 'claude-code', state: 'idle' });
    await until(() => ev.find((e) => e.type === 'status' && e.paneId === addr && e.status === 'idle'));
    fake.setStatus(addr, null);
    const rel = await until(() => ev.find((e) => e.type === 'agent_released' && e.paneId === addr), 2000);
    assert.equal(rel.agent, 'claude');
    // 다른 터미널: 진짜 끝남
    const ws2 = await a.createWorkspace({ cwd: 'C:/w2' });
    const r2 = await a.startAgent({ name: 'w2', paneId: ws2.paneId, kind: 'claude' });
    const b2 = r2.agent.paneId;
    fake.setStatus(b2, { app: 'claude-code', state: 'working' });
    await until(() => ev.find((e) => e.type === 'status' && e.paneId === b2 && e.status === 'working'));
    fake.finish(b2, 'exited', 0);
    const rel2 = await until(() => ev.find((e) => e.type === 'agent_released' && e.paneId === b2));
    assert.equal(rel2.exitCode, 0);
  } finally { a.stopEvents(); await fake.close(); }
});

test('P378 hc: 들고 있는 동안 다른 에이전트가 나타나면 놓임을 먼저 낸다(차례 지킴)', async () => {
  const { fake, a, ev, addr } = await rig();
  try {
    fake.setStatus(addr, { app: 'claude-code', state: 'idle' });
    await until(() => ev.find((e) => e.type === 'status' && e.paneId === addr && e.status === 'idle'));
    ev.length = 0;
    fake.setStatus(addr, null);
    await sleep(30);
    fake.setStatus(addr, { app: 'codex', state: 'idle' });
    await until(() => ev.find((e) => e.type === 'agent_detected' && e.paneId === addr));
    const types = ev.filter((e) => e.paneId === addr).map((e) => e.type);
    assert.deepEqual(types.slice(0, 2), ['agent_released', 'agent_detected']);
    assert.equal(ev.find((e) => e.type === 'agent_detected').agent, 'codex');
  } finally { a.stopEvents(); await fake.close(); }
});

// 가짜 판(p337.test.mjs와 같은 꼴). 터미널은 getAgent만 흉내 낸다
function board(agentOf) {
  const b = new Backend({ quietMs: 600000, port: 0, logDir: tmp() });
  b.store = new Store(path.join(tmp(), 'board.db'));
  b.sessions = new Map();
  const sent = [];
  b.api = { broadcast: (k, d) => sent.push([k, d]) };
  b.log = () => {}; b.touch = () => {};
  b.broadcastWorkspaces = () => {};
  b.bus ??= new EventEmitter();
  b.adapter = { getAgent: async (pane) => agentOf(pane), on() {} };
  b.queue = { poke() {}, onUserPromptSubmit: () => true, onAgentWorking() {}, unsubmitted: () => false, list: () => [], pending: () => 0, stuckOf: () => null, pump() {} };
  b.refreshModelNow = () => {}; b.probeGit = () => {}; b.refreshAgent = () => {};
  const add = (name) => {
    const rt = newRuntime({ kind: 'claude' });
    const s = { sessionId: 'id-' + name, name, kind: 'claude', workspaceKey: null, cwd: 'C:/w', rt, origin: 'board', createdAt: 1, paneId: 'p-' + name, hookToken: 'tok-' + name };
    b.sessions.set(s.sessionId, s);
    b.store.insertSession({ ...s, permissionMode: 'manual', runtime: rt });
    return s;
  };
  const hook = (s, ev, extra = {}) => b.processHook({ 'x-mt-session': s.sessionId, authorization: `Bearer ${s.hookToken}` }, JSON.stringify({ hook_event_name: ev, session_id: s.sessionId, ...extra }));
  const kinds = (s) => b.store.events({ sessionId: s.sessionId, limit: 500 }).map((e) => e.kind);
  const last = (s, kind) => b.store.events({ sessionId: s.sessionId, limit: 500 }).filter((e) => e.kind === kind).pop();
  return { b, add, hook, kinds, last };
}
// 신뢰 단계에서 잘못 둔 끝남(옛 차례): 신뢰 막힘 → 다시 나타남·idle → 늦은 놓임
function falseExit(s) {
  applyAgentDetected(s.rt); applyTermStatus(s.rt, 'blocked', Date.now(), { launchPending: false }); s.rt.trustScreen = { at: Date.now() };
  applyAgentDetected(s.rt); applyTermStatus(s.rt, 'idle');
  applyAgentReleased(s.rt);
  assert.equal(s.rt.exit.kind, 'other');
}
const alive = (pane, status = 'working') => ({ name: pane, paneId: pane, agent: 'claude', status });

test('P378 판: 끝남(other)으로 둔 세션에 터미널 working이 오고 터미널에 claude가 있으면 되살린다(나간 일 멈춤 알림은 적는다)', async () => {
  const { b, add, kinds, last } = board((p) => alive(p));
  const s = add('dune');
  falseExit(s);
  b.store.addEvent(s.sessionId, 'unit_stop', { unitId: 7, tryId: 9, why: 'exited', exit: { kind: 'other', code: null } }); // 그때 나간 알림
  await b.onTermEvent({ type: 'status', paneId: s.paneId, status: 'working' });
  await until(() => !s.rt.exit);
  assert.equal(b.summary(s).state, 'working');
  const r = last(s, 'exit_revoked');
  assert.equal(r.data.by, 'term:working');
  assert.equal(r.data.exit.kind, 'other');
  assert.deepEqual(r.data.notices, [{ kind: 'unit_stop', unitId: 7, tryId: 9 }]);
  assert.ok(kinds(s).includes('exit_revoked'));
});

test('P378 판: 같은 세션의 hook(UserPromptSubmit)이 와도 되살린다. 터미널 상태는 터미널에서 읽은 것', async () => {
  const { b, add, hook, last } = board((p) => alive(p, 'idle'));
  const s = add('dune2');
  falseExit(s);
  hook(s, 'UserPromptSubmit', { prompt: 'hi' });
  await until(() => !s.rt.exit);
  assert.equal(last(s, 'exit_revoked').data.by, 'hook:UserPromptSubmit');
  assert.notEqual(b.summary(s).state, 'exited');
});

test('P378 판 불변식: 진짜 끝남은 그대로다(SessionEnd 뒤 늦은 hook, 판이 끈 것, 터미널에 에이전트 없음, 터미널 서버 꺼짐)', async () => {
  // 터미널에 에이전트가 없다(끝나 셸이 남음)
  {
    const { b, add, hook, kinds } = board(() => null);
    const s = add('gone');
    falseExit(s);
    hook(s, 'Stop', { last_assistant_message: 'x' });
    await b.onTermEvent({ type: 'status', paneId: s.paneId, status: 'working' });
    await until(() => kinds(s).includes('exit_revoke_skipped'));
    assert.equal(b.summary(s).state, 'exited');
    assert.ok(!kinds(s).includes('exit_revoked'));
  }
  // SessionEnd가 온 끝남: 늦게 온 Stop은 되살리지 않는다(터미널이 살아 있다고 해도)
  {
    const { b, add, hook, kinds } = board((p) => alive(p));
    const s = add('ended');
    applyAgentDetected(s.rt); applyTermStatus(s.rt, 'idle', Date.now(), { launchPending: false }); s.rt.hooksSinceLaunch = 3;
    applyHook(s.rt, { hook_event_name: 'SessionEnd', reason: 'other' });
    applyAgentReleased(s.rt);
    assert.equal(revocable(s), false);
    hook(s, 'Stop', { last_assistant_message: 'late' });
    await sleep(50);
    assert.equal(b.summary(s).state, 'exited');
    assert.ok(!kinds(s).some((k) => k.startsWith('exit_revoke')));
  }
  // 판이 끈 것(requested), 터미널 서버가 꺼진 것(terminal_stopped)
  {
    const { b, add } = board((p) => alive(p));
    const s = add('closed');
    applyAgentDetected(s.rt); applyTermStatus(s.rt, 'idle', Date.now(), { launchPending: false }); s.rt.exitRequested = true; applyAgentReleased(s.rt);
    assert.equal(revocable(s), false);
    assert.equal(await revokeExit(b, s, 'term:working'), false);
    const t = add('stopped');
    applyAgentDetected(t.rt); applyTermStatus(t.rt, 'idle', Date.now(), { launchPending: false }); applyAgentReleased(t.rt, Date.now(), { termStopping: true });
    assert.equal(t.rt.exit.kind, 'terminal_stopped');
    assert.equal(await revokeExit(b, t, 'term:working'), false);
  }
});

test('P378 applyExitRevoked: 끝남만 거두고 끝남 전 기록(hook 수, 턴, 마지막 답)은 둔다', () => {
  const rt = newRuntime({ kind: 'claude' });
  applyAgentDetected(rt); applyTermStatus(rt, 'idle');
  applyHook(rt, { hook_event_name: 'Stop', last_assistant_message: 'ans' });
  applyAgentReleased(rt);
  const was = applyExitRevoked(rt);
  assert.equal(was.kind, 'other');
  assert.equal(rt.exit, null);
  assert.equal(rt.hooksSinceLaunch, 1);
  assert.equal(rt.lastAnswer, 'ans');
  assert.equal(rt.term.present, true);
  assert.equal(applyExitRevoked(rt), null);
});
