// P193 단위 시험: 자리를 얻을 때의 판 알림(rig.seat·rig.spawnSeat), 자리 이름이 세션 이름보다 먼저, 자리 이름과 같은 새 세션 이름
// (atrium child는 거절, 사람의 spawn은 <이름>-<n>), rig 없는 워크스페이스는 그대로. 가짜 판은 p190 틀.
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
import { rigFlowHandlers, seatHeader, handoffText } from '../src/rig-flow.mjs';
import { missionGraph } from '../src/mission.mjs';
import { promptTask } from '../src/text.mjs';
import { CONTRACT_VERSION, VERBS, shortHelp } from '../src/cli-contract.mjs';
import { attachFeatures } from '../src/features.mjs';
import { initialLaunchers } from '../src/launchers.mjs';
import { linkRelationPlan } from '../src/relations.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE = path.join(HERE, 'fixtures', 'rig-flow-sample');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p193-'));
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
  const cfg = { profile: 'dev', terminalSession: 'atrium-dev-p193test', port: 0, dataDir: dir, sessionsDir: path.join(dir, 'sessions'), inputQuietMs: 3000, submitConfirmMs: 3000, deliveryMaxWaitMs: 60000, submitRetries: 0 };
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
      if (p[SEAT_SPAWN]) { s.rigSeat = p[SEAT_SPAWN]; store.setSessionSeat(s.sessionId, p[SEAT_SPAWN]); } // 진짜 backend.spawn처럼 띄울 때 자리를 적는다(P193: 그래도 알림이 가야 한다)
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
const V = (b) => b.branch.verbs;
const evs = (b, kind) => b.store.db.prepare('SELECT * FROM events WHERE kind = ? ORDER BY id').all(kind).map((e) => ({ ...e, data: JSON.parse(e.data || 'null') }));

// ---------- P193 ----------
import { seatNotice, seatLeftNotice, seatNamed } from '../src/rig-flow.mjs';
import { rigSetupHandlers } from '../src/rig-setup.mjs';
import { legacyCreate } from './legacy-rig.mjs'; // P228: 옛 3자리 틀
import { isBoardNotice } from '../src/text.mjs';
import { SEAT_SPAWN } from '../src/rig-amp.mjs';
import { Backend } from '../src/backend.mjs';
import { DEFAULTS } from '../src/settings.mjs';
import { Launchers } from '../src/launchers.mjs';

const LOCAL = { auth: { kind: 'local' } };
const notices = (b) => evs(b, 'rig_seat_notice');
const boardLines = (t) => t.split('\n').filter((l) => l.startsWith('[Atrium 보드]'));

test('P193 자리 알림 모양: 세 줄, 모두 판 줄(카드의 지시가 아님), 자리·보낼 자리·done 값·atrium guide. 비울 때 한 줄', () => {
  const t = seatNotice({ seat: 'main', assign: ['worker'], may: [], results: ['ok', 'failed'], guide: true });
  const lines = t.split('\n');
  assert.equal(lines.length, 3);
  assert.deepEqual(boardLines(t), lines);
  assert.ok(isBoardNotice(t), '카드의 지시가 되지 않는다');
  assert.match(lines[0], /rig의 main 자리/);
  assert.match(lines[1], /`atrium child` 대신 `atrium prompt <자리> "<할 일>"`/);
  assert.match(lines[1], /일 맡기기: worker/);
  assert.match(lines[2], /`atrium done <값> "<보고>"`.*값: ok, failed/);
  assert.match(lines[2], /먼저 `atrium guide`/);
  const w = seatNotice({ seat: 'worker', assign: [], may: ['main'], results: ['ok'], guide: false });
  assert.match(w, /글만: main/); assert.match(w, /안내: `atrium guide`/);
  const none = seatNotice({ seat: 'solo', results: ['ok'] });
  assert.match(none, /다른 자리에 일을 맡기지 않는다/); assert.equal(none.split('\n').length, 3);
  const left = seatLeftNotice('main');
  assert.equal(left.split('\n').length, 1); assert.ok(isBoardNotice(left)); assert.match(left, /main 자리에서 뺐다/);
});

test('P193 rig.seat: 자리를 얻으면 판 알림 한 번(정의의 보낼 자리·값·안내), 같은 자리로 다시 정하면 없음, 비우면 한 줄', async () => {
  const { b, add, stop } = await board();
  try {
    const h = rigFlowHandlers(b);
    const m = add('lead');
    const r = h['rig.seat']({ session: 'lead', seat: 'main' }, LOCAL);
    assert.ok(r.noticeId);
    await until(() => m.texts.length === 1);
    const t = m.texts[0];
    assert.ok(isBoardNotice(t)); assert.equal(t.split('\n').length, 3);
    assert.match(t, /rig의 main 자리/); assert.match(t, /일 맡기기: worker/); assert.match(t, /값: ok, failed, rejected/); assert.match(t, /먼저 `atrium guide`/);
    h['rig.seat']({ session: 'lead', seat: 'main' }, LOCAL); // 같은 자리
    assert.equal(notices(b).length, 1);
    h['rig.seat']({ session: 'lead', seat: null }, LOCAL);
    await until(() => m.texts.length === 2);
    assert.match(m.texts[1], /main 자리에서 뺐다/); assert.equal(m.texts[1].split('\n').length, 1);
    // 자리 없는 세션을 비우면 알림 없음
    const o = add('other');
    h['rig.seat']({ session: 'other', seat: null }, LOCAL);
    // 다른 자리(worker는 may main)
    h['rig.seat']({ session: 'other', seat: 'worker' }, LOCAL);
    await until(() => o.texts.length === 1);
    assert.match(o.texts[0], /rig의 worker 자리/); assert.match(o.texts[0], /글만: main/);
    assert.equal(notices(b).length, 3);
    await tick(100);
    assert.equal(o.texts.length, 1, '자리 없는 세션 비우기는 알림 없음');
  } finally { await stop(); }
});

test('P193 rig.spawnSeat: 띄운 keep 자리 세션에 판 알림 한 번(첫 요청 없이). 흐름이 띄운 자리 세션은 일 머리만(알림 없음)', async () => {
  const { b, ws, stop } = await board({ def: null, enable: false });
  try {
    const HS = rigSetupHandlers(b);
    legacyCreate(b, ws.key, 'main-worker', { main: 'claude', worker: 'claude' });
    b.store.setRigEnabled(ws.key, true);
    const r = await HS['rig.spawnSeat']({ seat: 'main' }, LOCAL);
    const s = b.sessions.get(r.session);
    await until(() => s.texts.length === 1);
    assert.ok(isBoardNotice(s.texts[0])); assert.match(s.texts[0], /rig의 main 자리/); assert.match(s.texts[0], /일 맡기기: worker/); assert.match(s.texts[0], /먼저 `atrium guide`/);
    assert.equal(notices(b).length, 1);
    // main이 자리로 맡기면 worker-1이 뜨고 일 머리를 받는다(알림 없음)
    await V(b).prompt(s, { name: 'worker', text: '파일 셋을 센다' });
    await until(() => [...b.sessions.values()].some((x) => x.name === 'worker-1' && x.texts.length));
    const w = [...b.sessions.values()].find((x) => x.name === 'worker-1');
    assert.match(w.texts[0], /rig의 worker 자리다. 아래 일은 건/);
    assert.equal(notices(b).length, 1, '흐름이 띄운 세션에는 알림이 없다');
  } finally { await stop(); }
});

test('P193 자리 이름이 세션 이름보다 먼저: 자리 세션의 atrium prompt worker는 같은 이름의 세션이 있어도 worker 자리로(건). 자리 없는 세션은 이름 그대로', async () => {
  const { b, add, seat, by, stop } = await board();
  try {
    const main = add('lead'); seat(main, 'main');
    const named = add('worker'); // 자리 없는 세션, 이름이 자리와 같다
    const outsider = add('outsider');
    const r = await V(b).prompt(main, { name: 'worker', text: '할 일 하나' });
    assert.ok(r.unit && r.unit.caseId, '건이 생긴다'); assert.equal(r.unit.seat, 'worker');
    assert.equal(r.name, 'worker-1');
    await until(() => by('worker-1') && by('worker-1').texts.length === 1);
    assert.equal(named.texts.length, 0, '같은 이름의 세션은 받지 않는다');
    // 대소문자·@도 자리
    const r2 = await V(b).prompt(main, { name: '@Worker', text: '할 일 둘' });
    assert.equal(r2.unit.seat, 'worker'); assert.notEqual(r2.name, 'worker');
    // 자리 없는 세션의 prompt worker는 그 세션으로(옛 그대로)
    const o = await V(b).prompt(outsider, { name: 'worker', text: '안녕' });
    assert.equal(o.name, 'worker'); assert.equal(o.unit, null);
    await until(() => named.texts.includes('안녕'));
  } finally { await stop(); }
});

test('P193 atrium child: rig가 켜진 워크스페이스에서 자리 이름과 같은 하위 세션 이름은 거절(자리 세션에는 atrium prompt <자리>를 알림). 다른 이름·자동 이름·rig 꺼짐은 그대로', async () => {
  const { b, ws, add, seat, stop } = await board();
  try {
    const main = add('lead'); seat(main, 'main');
    await assert.rejects(b.branch.spawnChild(main, { name: 'worker', prompt: '할 일', wait: false }), (e) => e.code === 'rig_seat_name' && e.seat === 'worker' && /`atrium prompt worker "<할 일>"`/.test(e.message));
    const loose = add('loose');
    await assert.rejects(b.branch.spawnChild(loose, { name: 'main', wait: false }), (e) => e.code === 'rig_seat_name' && !/atrium prompt/.test(e.message) && /다른 이름/.test(e.message));
    assert.equal(b.spawned.length, 0);
    const ok = await b.branch.spawnChild(main, { name: 'worker-a', wait: false });
    assert.equal(ok.name, 'worker-a');
    const auto = await b.branch.spawnChild(loose, { wait: false });
    assert.match(auto.name, /^loose-w\d+$/);
    // rig가 꺼지면 그대로
    b.store.setRigEnabled(ws.key, false);
    const off = await b.branch.spawnChild(loose, { name: 'worker', wait: false });
    assert.equal(off.name, 'worker');
  } finally { await stop(); }
});

test('P193 seatNamed: 켜진 rig의 자리 이름만(대소문자 무시), rig 없음·꺼짐은 null', async () => {
  const { b, ws, stop } = await board();
  try {
    assert.equal(seatNamed(b.rig, ws.key, 'worker'), 'worker');
    assert.equal(seatNamed(b.rig, ws.key, 'MAIN'), 'main');
    assert.equal(seatNamed(b.rig, ws.key, 'worker-1'), null);
    assert.equal(seatNamed(null, ws.key, 'worker'), null);
    b.store.setRigEnabled(ws.key, false);
    assert.equal(seatNamed(b.rig, ws.key, 'worker'), null);
  } finally { await stop(); }
  const e = await board({ def: null, enable: false });
  try { assert.equal(seatNamed(e.b.rig, e.ws.key, 'worker'), null); } finally { await e.stop(); }
});

// 사람의 spawn(창·atrium spawn): 자리 이름이면 <이름>-<n>. p33 틀(가짜 터미널)
function spawnBackend(seats) {
  const dir = tmp();
  const b = new Backend({ quietMs: 600000, port: 0, logDir: dir, sessionsDir: path.join(dir, 'sessions'), claudeJson: path.join(dir, 'none.json'), claudeCommand: 'claude', hookTimeoutSec: 2 });
  b.store = new Store(path.join(dir, 'board.db'));
  b.sessions = new Map(); b.termOk = true; b.hookUrl = 'http://127.0.0.1:1/hook'; b.plugin = {};
  b.branch = { settingsExtra: () => ({}), noteChild() {}, placeChild: () => null };
  b.features = { settings: { get: () => ({ ...DEFAULTS }) }, launchers: null };
  b.features.launchers = new Launchers({ store: b.store });
  b.queue = { enqueue() {}, pending: () => 0 };
  b.api = { broadcast() {} };
  b.broadcastSession = () => {}; b.broadcastWorkspaces = () => {}; b.probeGit = () => {};
  b.rig = seats ? { active: () => ({ def: { seats } }) } : null;
  b.rigAmp = { claudeAmp: () => undefined };
  let n = 0;
  b.adapter = {
    connected: true,
    agentKinds: async () => [{ kind: 'claude', installed: true }],
    createWorkspace: async () => { n++; return { paneId: `w${n}:p1`, workspaceId: `w${n}` }; },
    refreshSubscription: async () => {}, waitShellReady: async () => true,
    startAgent: async (o) => ({ agent: null, argv: [o.kind, ...o.args] }),
    sendText: async () => {}, paneKeys: async () => {},
  };
  return { b, cwd: dir, stop: () => b.store.close() };
}

test('P193 spawn(사람): rig가 켜진 워크스페이스에서 자리 이름이면 <이름>-<n>(renamedFrom). 판이 그 자리를 위해 띄우면 그대로, rig 없으면 그대로', async () => {
  const x = spawnBackend({ main: { session: 'keep' }, worker: { session: 'fresh' } });
  try {
    const r = await x.b.spawn({ cwd: x.cwd, name: 'worker', kind: 'claude' });
    assert.equal(r.name, 'worker-1'); assert.equal(r.renamedFrom, 'worker'); assert.equal(r.renamedWhy, 'rig_seat');
    const r2 = await x.b.spawn({ cwd: x.cwd, name: 'worker', kind: 'claude' });
    assert.equal(r2.name, 'worker-2');
    const k = await x.b.spawn({ cwd: x.cwd, name: 'main', kind: 'claude', [SEAT_SPAWN]: 'main' });
    assert.equal(k.name, 'main'); assert.equal(k.renamedFrom, undefined);
    const plain = await x.b.spawn({ cwd: x.cwd, name: 'helper', kind: 'claude' });
    assert.equal(plain.name, 'helper');
  } finally { x.stop(); }
  const y = spawnBackend(null);
  try { const r = await y.b.spawn({ cwd: y.cwd, name: 'worker', kind: 'claude' }); assert.equal(r.name, 'worker'); } finally { y.stop(); }
});
