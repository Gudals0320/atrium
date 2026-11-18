// P209 단위 시험: rig 제작 세션의 check·log(제작 일을 닫은 뒤), 자리 effort·model(검사, 띄우기 인자, 해시·보호), atrium guide rig의 한계 줄.
// 가짜 판은 p190 틀을 옮겼다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { execFile, execFileSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import { Store } from '../src/store.mjs';
import { newRuntime, applyHook, applyTermStatus, deriveState } from '../src/state.mjs';
import { workspaceOf } from '../src/git.mjs';
import { DeliveryQueue } from '../src/delivery.mjs';
import { Branch, approvalArgsOf } from '../src/branch.mjs';
import { Rig, validateRig, validateFlow, RIG_HEADER_LINE, HOOK_FROMS } from '../src/rig.mjs';
import { rigFlowHandlers, seatHeader, handoffText, seatOverrides } from '../src/rig-flow.mjs';
import { missionGraph } from '../src/mission.mjs';
import { promptTask } from '../src/text.mjs';
import { CONTRACT_VERSION, VERBS, shortHelp } from '../src/cli-contract.mjs';
import { attachFeatures } from '../src/features.mjs';
import { initialLaunchers } from '../src/launchers.mjs';
import { linkRelationPlan } from '../src/relations.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE = path.join(HERE, 'fixtures', 'rig-flow-sample');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p209-'));
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 5000) { const t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > ms) throw new Error('until: 시간 초과'); await tick(10); } }
const sampleDef = () => JSON.parse(fs.readFileSync(path.join(SAMPLE, '.atrium', 'rig.json'), 'utf8'));
function writeRig(root, def) {
  fs.cpSync(path.join(SAMPLE, '.atrium'), path.join(root, '.atrium'), { recursive: true });
  const f = path.join(root, '.atrium', 'rig.json');
  fs.writeFileSync(f, JSON.stringify(def, null, 2));
  const t = new Date(Date.now() + Math.floor(Math.random() * 100000)); fs.utimesSync(f, t, t);
}

// ---------- 가짜 판(p182 틀) + 자리 ----------
async function board({ dir = tmp(), def = sampleDef(), enable = true, batchMs = 40 } = {}) {
  if (def) writeRig(dir, def);
  const store = new Store(path.join(dir, 'board.db'));
  const ws = await workspaceOf(dir);
  if (!store.getWorkspace(ws.key)) store.insertWorkspace({ ...ws, createdAt: 1 });
  const cfg = { profile: 'dev', terminalSession: 'atrium-dev-p209test', port: 0, dataDir: dir, sessionsDir: path.join(dir, 'sessions'), inputQuietMs: 3000, submitConfirmMs: 3000, deliveryMaxWaitMs: 60000, submitRetries: 0 };
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
    async kill(p) { const s = b.sessions.get(p.session); if (!s) return { closed: false }; b.closeSession(s, 'killed'); return { closed: true }; },
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

// ---------- P190 ----------
import { RigSetup, rigSetupHandlers } from '../src/rig-setup.mjs';
import { rigTemplates, templateFiles, TEMPLATE_IDS, builderHeader, rigGuideText, HUMAN_FROM, BUILDER_ORIGIN } from '../src/rig-templates.mjs';
import { summarizeChanges, CHANGE_KINDS } from '../src/changes.mjs';
import { SEAT_SPAWN } from '../src/rig-amp.mjs';

const LOCAL = { auth: { kind: 'local' } };
const DEVICE = { auth: { kind: 'device' } };
const rigFile = (dir) => path.join(dir, '.atrium', 'rig.json');
const HS = (b) => rigSetupHandlers(b);
const readRig = (dir) => JSON.parse(fs.readFileSync(rigFile(dir), 'utf8'));
// 판 이벤트(api.broadcast) 기록
function listen(b) { const got = []; b.api.broadcast = (kind, data) => got.push({ kind, data }); return got; }
// rig 없는 빈 판(켜지 않음)
const empty = (o = {}) => board({ def: null, enable: false, ...o });

const setupBuilder = async (b) => {
  let builder = null;
  b.onSpawnText = async (text, s) => { builder = s; };
  const r = await HS(b)['rig.describe']({ text: '워커 노력 수준을 낮게' }, LOCAL);
  await until(() => builder && builder.texts.length && builder.rt.term.status === 'idle', 4000);
  b.onSpawnText = null; builder.onText = null;
  return { builder, r };
};

test('P209 제작 세션: 제작 일을 닫은 뒤에도 켜진 rig에서 check·log를 쓴다. rollback·cleanup은 여전히 거절, 다른 자리 없는 세션은 거절', async () => {
  const { b, ws, add, stop } = await empty();
  try {
    await HS(b)['rig.create']({ template: 'main-worker', launchers: { main: 'claude', worker: 'claude' } }, LOCAL);
    b.store.setRigEnabled(ws.key, true);
    const { builder, r } = await setupBuilder(b);
    await U(b).doneVerb(builder, { result: 'ok', text: '고쳤다' });
    assert.equal(b.store.getUnit(r.unit).status, 'done');
    assert.equal(b.rigSetup.isBuilder(builder), false, '열린 제작 일은 없다');
    assert.equal(b.rigSetup.isWorkspaceBuilder(builder), true);
    assert.equal(b.rig.enabled(ws.key), true);
    const c = await b.branch.rigAdmin.verb(builder, { op: 'check' });
    assert.equal(c.ok, true, c.reason);
    const l = await b.branch.rigAdmin.verb(builder, { op: 'log' });
    assert.ok(l.versions.length >= 1); assert.equal(l.workspace, ws.key);
    await assert.rejects(b.branch.rigAdmin.verb(builder, { op: 'rollback', n: 1 }), (e) => e.code === 'forbidden');
    await assert.rejects(b.branch.rigAdmin.verb(builder, { op: 'cleanup', caseId: 'x' }), (e) => e.code === 'forbidden');
    // 다른 자리 없는 세션은 켜진 rig에서 check·log 모두 거절(까닭에 제작 세션 줄)
    const other = add('other');
    await assert.rejects(b.branch.rigAdmin.verb(other, { op: 'check' }), (e) => e.code === 'forbidden' && /제작 세션도/.test(e.message));
    await assert.rejects(b.branch.rigAdmin.verb(other, { op: 'log' }), (e) => e.code === 'forbidden');
    // 제작 세션이 닫히면 더는 아니다
    b.closeSession(builder, 'killed');
    assert.equal(b.rigSetup.isWorkspaceBuilder(builder), false);
  } finally { await stop(); }
});

test('P209 자리 effort·model 검사: 종류별 값, 틀린 값, model은 종류 자리만', () => {
  const ok = (seat) => validateFlow({ seats: { main: { launcher: 'claude', session: 'keep' }, w: seat } });
  for (const e of ['low', 'medium', 'high', 'xhigh', 'max']) assert.equal(ok({ launcher: 'claude', effort: e }).ok, true, e);
  for (const e of ['minimal', 'low', 'medium', 'high', 'xhigh']) assert.equal(ok({ launcher: 'codex', effort: e }).ok, true, e);
  assert.match(ok({ launcher: 'claude', effort: 'minimal' }).reason, /seats\.w\.effort/);
  assert.match(ok({ launcher: 'codex', effort: 'turbo' }).reason, /codex 자리의 effort/);
  assert.equal(ok({ launcher: 'codex', effort: 'max' }).ok, true, 'P208 Codex 표(none…ultra)');
  assert.match(ok({ launcher: 'opencode', effort: 'low' }).reason, /effort를 받지 않는다/);
  assert.match(ok({ launcher: 'claude', effort: 'turbo' }).reason, /effort/);
  assert.match(ok({ launcher: 'claude', effort: 3 }).reason, /effort/);
  assert.equal(ok({ launcher: 'my-launcher', effort: 'minimal' }).ok, true, '런처 자리는 둘을 합친 값(check가 종류로 다시 본다)');
  assert.match(ok({ launcher: 'my-launcher', effort: 'turbo' }).reason, /effort/);
  assert.equal(ok({ launcher: 'my-launcher', effort: 'ultra' }).ok, true, 'Codex 값');
  const m = ok({ launcher: 'claude', model: 'haiku', effort: 'low' });
  assert.equal(m.ok, true); assert.equal(m.flow.seats.w.model, 'haiku'); assert.equal(m.flow.seats.w.effort, 'low');
  assert.equal(ok({ launcher: 'claude' }).flow.seats.w.effort, null);
  assert.match(ok({ launcher: 'my-launcher', model: 'haiku' }).reason, /종류 이름/);
  assert.match(ok({ launcher: 'claude', model: '-x' }).reason, /모델 이름/);
  assert.match(ok({ launcher: 'claude', model: 'a b' }).reason, /모델 이름/);
});

test('P209 atrium rig check: 런처 자리의 effort는 런처 종류로, 앉은 keep 자리는 다음에 띄울 때부터라고 알린다', async () => {
  const { b, ws, dir, add, stop } = await empty();
  try {
    await HS(b)['rig.create']({ template: 'main-worker', launchers: { main: 'claude', worker: 'claude' } }, LOCAL);
    b.rigSetup.findLauncher = (ref) => (ref === 'cx' ? { id: 'cx', name: 'cx', harness: 'codex' } : ref === 'cl' ? { id: 'cl', name: 'cl', harness: 'claude' } : null);
    b.store.setRigEnabled(ws.key, true);
    const main = add('main'); b.branch.flow.setSeat(main, 'main');
    const def = readRig(dir);
    const chk = (d) => b.branch.rigAdmin.check(ws.key, { text: JSON.stringify(d) });
    def.seats.worker.launcher = 'cx'; def.seats.worker.effort = 'minimal';
    assert.equal(chk(def).ok, true, 'codex 런처는 minimal');
    def.seats.worker.launcher = 'cl';
    const bad = chk(def);
    assert.equal(bad.ok, false); assert.match(bad.reason, /seats\.worker\.effort: 런처 cl는 claude 자리의 effort/);
    def.seats.worker.effort = 'low'; def.seats.main.effort = 'medium';
    const c = chk(def);
    assert.equal(c.ok, true, c.reason);
    assert.ok(c.warnings.some((w) => /keep 자리 main의 effort medium는 다음에 띄울 때부터/.test(w) && /@main/.test(w)), c.warnings.join(' | '));
    assert.ok(!c.warnings.some((w) => /worker/.test(w) && /다음에 띄울 때/.test(w)), 'fresh 자리는 알리지 않는다');
    // 앉은 세션이 이미 그 값으로 떴으면 알리지 않는다
    main.effort = 'medium';
    assert.ok(!chk(def).warnings.some((w) => /keep 자리 main/.test(w)));
    main.effort = 'high';
    assert.ok(chk(def).warnings.some((w) => /띄울 때의 값\(effort high\)/.test(w)));
  } finally { await stop(); }
});

test('P209 fresh 자리 세션을 띄울 때 effort가 spawnChild로(Claude Code는 claude --effort), 이벤트에 남는다', async () => {
  const def = sampleDef();
  def.seats.worker.effort = 'low';
  const { b, add, seat, by, stop } = await board({ def });
  try {
    const calls = [];
    const orig = b.branch.spawnChild.bind(b.branch);
    b.branch.spawnChild = (owner, o) => { calls.push(o); return orig(owner, o); };
    const main = add('lead', { kind: 'codex', hooked: false }); seat(main, 'main');
    const r = await V(b).prompt(main, { name: 'worker', text: '할 일 하나' });
    assert.equal(r.unit.seat, 'worker');
    const o = calls.at(-1);
    assert.equal(o.effort, 'low'); assert.equal(o.kind, 'claude'); assert.equal(o.model, undefined);
    const p = b.spawned.at(-1);
    assert.equal(p.effort, 'low', 'Claude Code 자리는 claude --effort low로');
    assert.equal(evs(b, 'rig_seat_spawn').at(-1).data.effort, 'low');
    await until(() => by('worker-1') && by('worker-1').texts.length === 1);
  } finally { await stop(); }
});

test('P209 seatOverrides: model을 주면 종류도(주인과 같은 종류여도 그 종류의 모델로 풀린다), Codex 자리는 effort를 그대로 넘긴다', () => {
  assert.deepEqual(seatOverrides({ launcher: 'claude', effort: 'low', model: 'haiku' }), { effort: 'low', model: 'haiku', kind: 'claude' });
  assert.deepEqual(seatOverrides({ launcher: 'codex', effort: 'medium' }), { effort: 'medium' });
  assert.deepEqual(seatOverrides({ launcher: 'cx', effort: null, model: null }), {});
});

test('P209 keep 자리를 사람이 앉힐 때(rig.spawnSeat) 자리의 effort·model이 런처 값을 덮는다', async () => {
  const { b, ws, dir, stop } = await empty();
  try {
    await HS(b)['rig.create']({ template: 'main-worker', launchers: { main: 'claude', worker: 'claude' } }, LOCAL);
    const def = readRig(dir); def.seats.main.effort = 'medium'; def.seats.main.model = 'haiku';
    fs.writeFileSync(rigFile(dir), JSON.stringify(def, null, 2)); const t = new Date(Date.now() + 2000); fs.utimesSync(rigFile(dir), t, t);
    b.store.setRigEnabled(ws.key, true);
    await HS(b)['rig.spawnSeat']({ seat: 'main' }, LOCAL);
    const p = b.spawned.at(-1);
    assert.equal(p.effort, 'medium'); assert.equal(p.model, 'haiku'); assert.equal(p.kind, 'claude');
    assert.equal(evs(b, 'rig_seat_spawn').at(-1).data.effort, 'medium');
  } finally { await stop(); }
});

test('P209 정의 해시·버전: effort를 더하면 새 버전, 보호 포인터 /seats/worker는 effort 바꾸기도 막는다. rig 상태의 자리에 effort·model', async () => {
  const { b, ws, dir, stop } = await empty();
  try {
    await HS(b)['rig.create']({ template: 'main-worker', launchers: { main: 'claude', worker: 'claude' } }, LOCAL);
    b.store.setRigEnabled(ws.key, true);
    const h1 = b.rig.read(ws.key).hash; assert.equal(b.rig.read(ws.key).n, 1);
    await HS(b)['rig.save']({ seats: { main: {}, worker: { effort: 'low' } } }, LOCAL);
    const cur = b.rig.read(ws.key);
    assert.equal(cur.n, 2); assert.notEqual(cur.hash, h1);
    assert.equal(readRig(dir).seats.worker.effort, 'low');
    const w = b.rig.status(ws.key).seats.find((x) => x.name === 'worker');
    assert.equal(w.effort, 'low'); assert.equal(w.model, null);
    b.branch.rigAdmin.protect(ws.key, { pointer: '/seats/worker' });
    await assert.rejects(HS(b)['rig.save']({ seats: { main: {}, worker: { effort: 'high' } } }, LOCAL), (e) => e.code === 'rig_protected');
    const def = readRig(dir); def.seats.worker.effort = 'high';
    const c = b.branch.rigAdmin.check(ws.key, { text: JSON.stringify(def) });
    assert.equal(c.ok, false); assert.ok(c.protectedHits.length);
  } finally { await stop(); }
});

test('P209 atrium guide rig: 자리 effort·model 줄, 주인을 지나는 반복 설명(임시 한계 줄을 바꿈), 제작 세션의 check·log', () => {
  const t = rigGuideText();
  assert.ok(!t.includes('주인을 지나는 반복의 상한은 주인 자리 안내(guide)에 적는다'), '임시 줄은 없다');
  assert.match(t, /주인에게 가는 줄/); assert.match(t, /waiting_owner/); assert.match(t, /이어 센다/); assert.match(t, /done이다/);
  assert.match(t, /- effort: /); assert.match(t, /- model: /); assert.match(t, /minimal/);
  assert.match(t, /다음에 띄울 때부터/);
  assert.match(t, /제작 세션도 제작 일을 닫은 뒤 읽기만 하는 atrium rig check·log/);
});

// ---------- P209 뒤(@fable-peer): 주인을 지나는 반복을 흐름 줄 max가 센다 ----------
const loopDef = ({ withElse = true } = {}) => ({
  results: ['ok', 'failed', 'rejected'],
  seats: {
    main: { launcher: 'claude', session: 'keep' },
    worker: { launcher: 'claude', session: 'fresh' },
    reviewer: { launcher: 'claude', session: 'fresh' },
    judge: { launcher: 'claude', session: 'fresh' },
  },
  flow: [
    { from: 'main', on: 'assign', to: 'worker' },
    { from: 'worker', on: 'ok', to: 'reviewer' },
    { from: 'reviewer', on: 'rejected', to: 'main', max: 2, ...(withElse ? { else: 'judge' } : {}) },
    { from: 'reviewer', on: 'ok', to: 'main' },
  ],
  manager: 'main',
});
const gotUnit = (s) => until(() => s && s.texts.some((t) => /rig의 \w+ 자리다/.test(t)) && s.rt.term.status === 'idle', 4000);
const doneV = (b, s, result, text) => U(b).doneVerb(s, { result, text });
const isReport = (t) => t.startsWith('[Atrium 보드] rig 건');

test('P209 주인 보고: (a) 건은 done 대신 waiting_owner, (c) 그 턴에 맡기면 같은 건을 잇고 셈이 쌓인다, (d) 상한을 넘으면 else로', async () => {
  const { b, add, seat, by, stop } = await board({ def: loopDef() });
  try {
    const main = add('lead'); seat(main, 'main');
    const assigned = [];
    // 주인: 반려 보고를 받으면 그 턴 안에서 워커에게 다시 맡긴다
    main.onText = async (text) => { if (isReport(text) && /: rejected$/.test(text.split('\n')[0])) assigned.push(await V(b).prompt(main, { name: 'worker', text: `고쳐라 ${assigned.length + 1}` })); };
    const r = await V(b).prompt(main, { name: 'worker', text: '일: 단추' });
    const C = r.unit.caseId;
    let wName = r.name;
    const round = async () => {
      const w = by(wName); await gotUnit(w);
      const d1 = await doneV(b, w, 'ok', '했다');
      const rv = by(d1.flow[0].to); await gotUnit(rv);
      return doneV(b, rv, 'rejected', '틀렸다');
    };
    // 1회: 주인에게 보고 → waiting_owner(report) → 주인이 그 턴에 맡겨 같은 건, 셈 1 유지
    let d = await round();
    assert.deepEqual(d.reports, [{ seat: 'main', to: 'lead', escalated: false }]);
    assert.equal(d.case.state, 'waiting_owner', '(a)');
    await until(() => assigned.length === 1, 4000);
    assert.equal(assigned[0].unit.caseId, C, '(c) 같은 건');
    let c = b.store.getCase(C);
    assert.equal(c.state, 'open'); assert.equal(c.ownerWait, null); assert.equal(c.edgeCounts['2'], 1, '(c) 셈은 0으로 돌아가지 않는다');
    const res = evs(b, 'rig_case_resume').at(-1).data;
    assert.equal(res.ownerWait, 'report'); assert.equal(res.countersReset, undefined);
    // 2회: 셈 2
    wName = assigned[0].name;
    d = await round();
    assert.equal(d.case.state, 'waiting_owner');
    await until(() => assigned.length === 2, 4000);
    assert.equal(assigned[1].unit.caseId, C);
    assert.equal(b.store.getCase(C).edgeCounts['2'], 2);
    // 3회: 상한 2를 넘어 else(judge)로. 주인에게 보고가 가지 않는다
    wName = assigned[1].name;
    const before = main.texts.filter(isReport).length;
    d = await round();
    assert.deepEqual(d.reports || [], []);
    assert.deepEqual(d.flow.map((x) => x.seat), ['judge'], '(d) 주인을 지나는 반복이 상한에 걸린다');
    c = b.store.getCase(C);
    assert.equal(c.state, 'open'); assert.equal(c.edgeCounts['2>else'], 1);
    assert.ok(evs(b, 'rig_escalate').some((e) => e.data.caseId === C && e.data.to === 'judge'));
    await tick(150);
    assert.equal(main.texts.filter(isReport).length, before);
    assert.equal(assigned.length, 2);
  } finally { await stop(); }
});

test('P209 주인 보고 (b): 보고를 받은 주인의 턴이 맡기기 없이 끝나면 done. 보고가 들어가기 전에 끝난 턴으로는 닫지 않는다', async () => {
  const { b, add, seat, by, stop } = await board({ def: loopDef() });
  try {
    const main = add('lead'); seat(main, 'main');
    const r = await V(b).prompt(main, { name: 'worker', text: '일: 표' });
    const C = r.unit.caseId;
    const w = by(r.name); await gotUnit(w);
    const d1 = await doneV(b, w, 'ok', '했다');
    const rv = by(d1.flow[0].to); await gotUnit(rv);
    b.queue.stop(); // 보고가 줄에 머문다
    const d = await doneV(b, rv, 'ok', '좋다');
    assert.equal(d.case.state, 'waiting_owner');
    const flow = b.branch.flow;
    flow.prevState.set(main.sessionId, 'working');
    flow.onSessionTurn(main, { ...b.summary(main), state: 'ready' }); // 다른 턴이 끝났다
    assert.equal(b.store.getCase(C).state, 'waiting_owner', '보고가 아직 들어가지 않았다');
    b.queue.start();
    await until(() => b.store.getCase(C).state === 'done', 4000);
    assert.equal(evs(b, 'rig_case_done').at(-1).data.why, 'owner turn ended');
    await until(() => main.rt.term.status === 'idle');
    const r2 = await V(b).prompt(main, { name: 'worker', text: '다음' });
    assert.notEqual(r2.unit.caseId, C, '그 뒤 맡기기는 새 건');
  } finally { await stop(); }
});

test('P209 P194 상한을 넘어 올라온 waiting_owner(else 없음 → manager=주인)는 턴이 끝나도 닫히지 않고, 주인이 다시 맡기면 셈이 0으로(그대로)', async () => {
  const { b, add, seat, by, stop } = await board({ def: loopDef({ withElse: false }) });
  try {
    const main = add('lead'); seat(main, 'main');
    const r = await V(b).prompt(main, { name: 'worker', text: '일: 셈' });
    const C = r.unit.caseId;
    b.store.updateCase(C, { edgeCounts: { 2: 2 } }); // 이미 두 번 지났다
    const w = by(r.name); await gotUnit(w);
    const d1 = await doneV(b, w, 'ok', '했다');
    const rv = by(d1.flow[0].to); await gotUnit(rv);
    const d = await doneV(b, rv, 'rejected', '틀렸다');
    assert.deepEqual(d.reports, [{ seat: 'main', to: 'lead', escalated: true }]);
    assert.equal(d.case.state, 'waiting_owner'); assert.equal(b.store.getCase(C).ownerWait, 'escalated');
    await until(() => main.texts.some(isReport) && main.rt.term.status === 'idle', 4000);
    await tick(100);
    assert.equal(b.store.getCase(C).state, 'waiting_owner', '올라온 건은 다음 맡기기를 기다린다');
    const r2 = await V(b).prompt(main, { name: 'worker', text: '다시' });
    assert.equal(r2.unit.caseId, C);
    const c = b.store.getCase(C);
    assert.equal(c.edgeCounts['2'], undefined, '셈 0'); assert.equal(c.edgeCounts['2>else'], 1);
    assert.equal(evs(b, 'rig_case_resume').at(-1).data.countersReset, true);
  } finally { await stop(); }
});
