// P238 단위 시험: Codex rig 자리 인자에서 --approve-for-me를 걷어 냄(Codex가 --sandbox·--ask-for-approval과 함께 받지 않아 종료 코드 2로 끝났다),
// 자리 세션이 띄운 지 곧바로 종료 코드 2로 끝나면 멈춤 알림·장부·그래프에 "띄우기 인자가 잘못됐을 수 있다"와 그 명령 줄. 가짜 판은 p216 틀을 옮겼다.
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
import { launchArgsSuspect, commandLine, badArgsText, QUICK_EXIT_MS } from '../src/unit-stops.mjs';
import { codexArgsAmp, RigAmp } from '../src/rig-amp.mjs';


const HERE = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE = path.join(HERE, 'fixtures', 'rig-flow-sample');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p238-'));
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
  name: 'p238', results: ['ok', 'failed'],
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
  const cfg = { profile: 'dev', terminalSession: 'atrium-dev-p238test', port: 0, dataDir: dir, sessionsDir: path.join(dir, 'sessions'), inputQuietMs: 3000, submitConfirmMs: 3000, deliveryMaxWaitMs: 60000, submitRetries: 0 };
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
const ledger = (b, key, q = {}) => b.store.rigEvents({ ws: key, limit: 10000, ...q });

const USER_ARGS = ['--approve-for-me', '-c', 'model_reasoning_effort=high'];

test('P238 codexArgsAmp: scoped·unattended면 --approve-for-me를 걷어 내고 -c는 남긴다. ask(rig 밖과 같음)는 그대로. writes false도 걷어 낸다', () => {
  assert.deepEqual(codexArgsAmp(USER_ARGS, null, 'scoped'), ['-c', 'model_reasoning_effort=high', '--sandbox', 'workspace-write', '--ask-for-approval', 'on-request']);
  assert.deepEqual(codexArgsAmp(USER_ARGS, ['out/'], 'unattended'), ['-c', 'model_reasoning_effort=high', '--sandbox', 'workspace-write', '--ask-for-approval', 'never']);
  assert.deepEqual(codexArgsAmp(USER_ARGS, false, 'scoped'), ['-c', 'model_reasoning_effort=high', '--sandbox', 'read-only', '--ask-for-approval', 'on-request']);
  assert.deepEqual(codexArgsAmp(USER_ARGS, null, 'ask'), USER_ARGS, 'ask + 쓰기 제한 없음: 판이 샌드박스를 붙이지 않으니 그대로');
  assert.deepEqual(codexArgsAmp(USER_ARGS, false, 'ask'), ['-c', 'model_reasoning_effort=high', '--sandbox', 'read-only'], 'ask + writes false: --sandbox read-only를 붙이니 걷어 낸다(승인을 건너뛰는 인자가 아니라 -a never는 붙이지 않는다)');
  // 이미 걷던 것들과 섞여도
  assert.deepEqual(codexArgsAmp(['--yolo', '--approve-for-me', '-m', 'gpt'], null, 'scoped'), ['-m', 'gpt', '--sandbox', 'workspace-write', '--ask-for-approval', 'on-request']);
});

test('P238 rig 밖 Codex 세션: launcherArgs는 호출자 인자 그대로', () => {
  const amp = new RigAmp({ rig: { active: () => null } });
  assert.deepEqual(amp.launcherArgs({ kind: 'codex', sessionId: 'x', workspaceKey: 'w' }, USER_ARGS), USER_ARGS, '자리 없음');
  assert.deepEqual(amp.launcherArgs({ kind: 'codex', sessionId: 'x', workspaceKey: 'w', rigSeat: 'checker' }, USER_ARGS), USER_ARGS, 'rig가 꺼짐');
});

test('P238 launchArgsSuspect: 띄운 지 곧바로 종료 코드 2만. 명령 줄은 빈칸 있는 낱말을 따옴표로', () => {
  const rt = { agentStartedAt: 10000, launchArgv: ['codex', '--approve-for-me', '-c', 'model_reasoning_effort=high', '--sandbox', 'workspace-write', 'a b'] };
  const x = launchArgsSuspect(rt, { kind: 'other', code: 2, at: 10800 });
  assert.equal(x.code, 2); assert.equal(x.ms, 800);
  assert.equal(x.line, 'codex --approve-for-me -c model_reasoning_effort=high --sandbox workspace-write "a b"');
  assert.match(badArgsText(x), /^띄우기 인자가 잘못됐을 수 있다\(launch arguments may be invalid\): 띄운 지 0\.8초 만에 종료 코드 2\. 명령 줄: codex --approve-for-me/);
  assert.equal(launchArgsSuspect(rt, { kind: 'other', code: 1, at: 10800 }), null, '코드 1');
  assert.equal(launchArgsSuspect(rt, { kind: 'other', code: 2, at: 10000 + QUICK_EXIT_MS + 1 }), null, '오래 돈 뒤');
  assert.equal(launchArgsSuspect(rt, { kind: 'other', at: 10800 }), null, '코드 모름');
  assert.equal(launchArgsSuspect({ launchedAt: 10000 }, { code: 2, at: 10500 }).line, null, '명령 줄을 모르면 글만');
  assert.equal(commandLine(['x', 'say "hi"']), 'x "say \\"hi\\""');
});

test('P238 rig Codex 자리가 띄운 지 곧바로 종료 코드 2: 주인의 멈춤 알림·장부·그래프에 인자 의심과 명령 줄. 늦게 끝난 코드 2는 아니다', async () => {
  const t = await board({ def: rigDef({ launcher: 'codex' }) });
  const { b, ws, F, stop } = t;
  try {
    const { main, rv, unit, caseId } = await startCase(t);
    assert.equal(rv.kind, 'codex');
    rv.rt.agentStartedAt = Date.now() - 400;
    rv.rt.launchArgv = ['codex', '--approve-for-me', '-c', 'model_reasoning_effort=high', '--sandbox', 'workspace-write', '--ask-for-approval', 'on-request'];
    exitAgent(b, rv, { code: 2 });
    await until(() => stopNotices(b, main).length === 1);
    const n = stopNotices(b, main)[0].text;
    assert.match(n, /launch arguments may be invalid/);
    assert.match(n, /명령 줄: codex --approve-for-me -c model_reasoning_effort=high --sandbox workspace-write --ask-for-approval on-request/);
    assert.match(n, new RegExp(`다시 맡기기: atrium rig retry ${caseId} ${unit}`));
    const ts = ledger(b, ws.key, { kinds: ['try_stopped'] });
    const tx = ts.filter((x) => x.value === 'exited' && x.data && x.data.exit);
    assert.equal(tx.length, 1); assert.match(tx[0].text, /띄우기 인자가 잘못됐을 수 있다/); assert.equal(tx[0].data.badArgs, true); assert.equal(tx[0].data.code, 2); assert.match(tx[0].data.command, /^codex --approve-for-me/);
    const gu = F().graph()[ws.key].cases.find((x) => x.id === caseId).units.find((x) => x.unit === unit);
    assert.equal(gu.retry, true); assert.equal(gu.badArgs.code, 2); assert.match(gu.badArgs.line, /^codex --approve-for-me/);
  } finally { await stop(); }
  // 오래 돈 뒤 코드 2: 의심하지 않는다
  const t2 = await board({ def: rigDef({ launcher: 'codex' }) });
  try {
    const { main, rv, unit, caseId } = await startCase(t2);
    rv.rt.agentStartedAt = Date.now() - 60000; rv.rt.launchArgv = ['codex'];
    exitAgent(t2.b, rv, { code: 2 });
    await until(() => stopNotices(t2.b, main).length === 1);
    assert.doesNotMatch(stopNotices(t2.b, main)[0].text, /launch arguments/);
    assert.equal(t2.F().graph()[t2.ws.key].cases.find((x) => x.id === caseId).units.find((x) => x.unit === unit).badArgs, null);
  } finally { await t2.stop(); }
});

test('P238 두 사전: rigRetry.badArgs', async () => {
  const en = fs.readFileSync(path.join(HERE, '..', '..', 'app', 'src', 'renderer', 'locales', 'en.js'), 'utf8');
  const ko = fs.readFileSync(path.join(HERE, '..', '..', 'app', 'src', 'renderer', 'locales', 'ko.js'), 'utf8');
  assert.match(en, /badArgs: 'Launch arguments may be invalid: .*\{cmd\}'/);
  assert.match(ko, /badArgs: '띄우기 인자가 잘못됐을 수 있습니다: .*\{cmd\}'/);
});
