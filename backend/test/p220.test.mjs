// P220 단위 시험: rig 2 R3 빌더 역할 고정(제작 세션은 짓고 읽기만). child·자리 세션 보내기 거절, 그 밖은 그대로, 장부 줄.
// 가짜 판은 p209 틀을 옮겼다.
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
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p220-'));
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
  const cfg = { profile: 'dev', terminalSession: 'atrium-dev-p220test', port: 0, dataDir: dir, sessionsDir: path.join(dir, 'sessions'), inputQuietMs: 3000, submitConfirmMs: 3000, deliveryMaxWaitMs: 60000, submitRetries: 0 };
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


import { readEvents } from '../src/rig-ledger.mjs';
const gates = (b, key) => readEvents(b, key, { kinds: 'gate' }).rows.filter((r) => r.data && r.data.at === 'builder');

test('P220 빌더: 꺼진 rig에서 atrium child 거절(꺼짐 문구), 장부 줄, 다른 워크스페이스는 됨', async () => {
  const { b, ws, add, stop } = await empty();
  try {
    await HS(b)['rig.create']({ template: 'main-worker', launchers: { main: 'claude', worker: 'claude' } }, LOCAL);
    assert.equal(b.rig.enabled(ws.key), false);
    const { builder } = await setupBuilder(b);
    assert.equal(b.rigSetup.isBuilder(builder), true);
    await assert.rejects(b.branch.spawnChild(builder, { name: 'w1', prompt: '할 일', wait: false }), (e) => e.code === 'rig_builder' && /짓고 읽는다/.test(e.message) && /manager 자리에 맡긴다/.test(e.message) && /정의는 있지만 꺼져 있다\. 사람이 판에서 켠다/.test(e.message));
    assert.equal([...b.sessions.values()].some((x) => x.name === 'w1'), false, '띄우지 않았다');
    const g = gates(b, ws.key);
    assert.equal(g.length, 1); assert.equal(g[0].value, 'reject'); assert.equal(g[0].actor, 'board'); assert.equal(g[0].session, builder.sessionId); assert.equal(g[0].data.op, 'child'); assert.equal(g[0].data.off, true);
    assert.equal(evs(b, 'rig_builder_refused').length, 1);
    // 다른 워크스페이스(--cwd)는 막지 않는다
    const other = tmp();
    const ok = await b.branch.spawnChild(builder, { name: 'elsewhere', cwd: other, wait: false });
    assert.equal(ok.name, 'elsewhere');
    // 제작 일을 닫은 뒤에도 빌더다
    await U(b).doneVerb(builder, { result: 'ok', text: '만들었다' });
    assert.equal(b.rigSetup.isBuilder(builder), false);
    await assert.rejects(b.branch.spawnChild(builder, { name: 'w2', wait: false }), (e) => e.code === 'rig_builder');
    // 빌더가 아닌 세션은 그대로
    const loose = add('loose');
    const c = await b.branch.spawnChild(loose, { name: 'helper', wait: false });
    assert.equal(c.name, 'helper');
    assert.equal(gates(b, ws.key).length, 2);
  } finally { await stop(); }
});

test('P220 빌더: 켜진 rig에서 자리 세션에 보내기 거절(앉은 세션·자리 이름), rig 밖 세션은 됨, 읽기는 됨, 빌더 아닌 세션은 그대로', async () => {
  const { b, ws, add, seat, stop } = await empty();
  try {
    await HS(b)['rig.create']({ template: 'main-worker', launchers: { main: 'claude', worker: 'claude' } }, LOCAL);
    b.store.setRigEnabled(ws.key, true);
    const { builder } = await setupBuilder(b);
    await U(b).doneVerb(builder, { result: 'ok', text: '고쳤다' });
    const m = add('m1'); seat(m, 'main');
    assert.equal(m.rigSeat, 'main');
    // 켜진 rig: child 거절, 꺼짐 문구 없음
    await assert.rejects(b.branch.spawnChild(builder, { name: 'w1', wait: false }), (e) => e.code === 'rig_builder' && !/꺼져 있다/.test(e.message));
    // 앉은 자리 세션
    const sent0 = b.sent.length;
    await assert.rejects(V(b).prompt(builder, { name: 'm1', text: '일을 해라' }), (e) => e.code === 'rig_builder' && /자리 세션 @m1에 글을 보내지 않는다/.test(e.message) && /manager 자리에 맡긴다/.test(e.message));
    // 아직 앉지 않은 자리 이름
    await assert.rejects(V(b).prompt(builder, { name: 'worker', text: '일을 해라' }), (e) => e.code === 'rig_builder' && /@worker/.test(e.message));
    assert.equal(b.sent.length, sent0, '아무것도 넣지 않았다');
    const g = gates(b, ws.key).filter((r) => r.data.op === 'prompt');
    assert.deepEqual(g.map((r) => r.toSeat), ['m1', 'worker']);
    // rig 밖 세션에는 보낸다
    const out = add('outsider');
    const r = await V(b).prompt(builder, { name: 'outsider', text: '이 글을 읽어라' });
    assert.ok(r.deliveryId);
    // 읽기: atrium read, rig check·log·log --events, items
    const rd = await V(b).read(builder, { name: 'm1' });
    assert.ok(rd);
    assert.equal((await b.branch.rigAdmin.verb(builder, { op: 'check' })).ok, true);
    assert.ok((await b.branch.rigAdmin.verb(builder, { op: 'log' })).versions.length >= 1);
    const ev = await b.branch.rigAdmin.verb(builder, { op: 'log', events: true });
    assert.ok(ev.rows.some((x) => x.kind === 'gate' && x.data && x.data.at === 'builder'));
    assert.ok(U(b).items(builder));
    // 빌더가 아닌 세션(rig 밖)은 그대로: 자리 세션에 보낸다
    const r2 = await V(b).prompt(out, { name: 'm1', text: '참고' });
    assert.ok(r2.deliveryId);
    assert.equal(gates(b, ws.key).length, 3, 'child 1 + prompt 2');
  } finally { await stop(); }
});

test('P220 빌더 안내: 일 머리와 atrium guide rig에 한 줄', () => {
  assert.match(builderHeader({ unitId: 'u1' }), /빌더는 rig를 짓고 읽기만 한다/);
  assert.match(rigGuideText(), /빌더\(제작 세션\)는 rig를 짓고 읽기만 한다/);
});
