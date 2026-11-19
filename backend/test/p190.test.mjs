// P190 단위 시험: rig 7단계 — 판 안에서 rig 만들기(16절). 틀 셋, rig.create·save·get·spawnSeat·describe, 제작 세션의 일(사람이 주인),
// atrium guide rig, atrium rig check 넓히기, 원격은 읽기만, rig 없는 워크스페이스는 그대로. 가짜 판은 p188 틀.
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
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p190-'));
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
  const cfg = { profile: 'dev', terminalSession: 'atrium-dev-p190test', port: 0, dataDir: dir, sessionsDir: path.join(dir, 'sessions'), inputQuietMs: 3000, submitConfirmMs: 3000, deliveryMaxWaitMs: 60000, submitRetries: 0 };
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
import { builderHeader, rigGuideText, HUMAN_FROM, BUILDER_ORIGIN } from '../src/rig-templates.mjs';
import { legacyTemplateFiles, legacyCreate, LEGACY_IDS } from './legacy-rig.mjs'; // P228: 옛 3자리 틀은 대화상자에서 내렸고 시험 도움으로만
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

test('P190·P228 옛 3자리 틀로 만든 정의는 그대로 검사를 통과한다(옮기기 없음)', () => {
  for (const id of LEGACY_IDS) {
    const dir = tmp();
    const { def, guides } = legacyTemplateFiles(id, { main: 'claude', worker: 'claude', reviewer: 'codex' });
    for (const [rel, text] of Object.entries(guides)) { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); }
    const v = validateRig(def, { root: dir });
    assert.ok(v.ok, `${id}: ${v.reason}`);
    assert.deepEqual(v.def.warnings, [], `${id}: 경고 없음`);
    assert.equal(v.def.manager, 'main');
    assert.equal(v.def.loops.work.implicit, true, 'loops 없는 정의는 작업 고리 하나로 읽는다');
  }
});

test('P190·P228 rig.create: 정의가 없을 때만, 세 질문의 답으로 rig.json(들여쓰기 2칸)과 자리 안내 파일, 버전 1은 누가 human. 원격·에이전트는 못 함', async () => {
  const { b, ws, dir, stop } = await empty();
  try {
    const got = listen(b);
    await assert.rejects(HS(b)['rig.create']({ answers: {} }, DEVICE), (e) => e.code === 'forbidden');
    await assert.rejects(HS(b)['rig.create']({}, LOCAL), /answers/);
    await assert.rejects(HS(b)['rig.create']({ answers: { seat: 'reviewer', review: { on: true } } }, LOCAL), /reviewer/);
    assert.equal(fs.existsSync(rigFile(dir)), false, '거절이면 쓰지 않는다');
    const r = await HS(b)['rig.create']({ answers: { launcher: 'codex', review: { on: true, launcher: 'claude' } } }, LOCAL);
    assert.equal(r.ok, true); assert.equal(r.path, '.atrium/rig.json'); assert.equal(r.version, 1); assert.equal(r.preset, 'custom');
    assert.deepEqual(r.launchers, { main: 'codex', reviewer: 'claude' });
    for (const s of ['main', 'reviewer']) assert.ok(fs.existsSync(path.join(dir, '.atrium', 'seats', `${s}.txt`)));
    const text = fs.readFileSync(rigFile(dir), 'utf8');
    assert.match(text, /^\{\n {2}"version": 2/); assert.equal(text, JSON.stringify(JSON.parse(text), null, 2) + '\n');
    const v = b.store.rigVersions(ws.key);
    assert.equal(v.length, 1); assert.equal(v[0].by, 'human'); assert.equal(v[0].note, 'create custom');
    assert.equal(b.rig.status(ws.key).state, 'off', '판은 켜지 않는다');
    await assert.rejects(HS(b)['rig.create']({ answers: {} }, LOCAL), (e) => e.code === 'rig_exists');
    // 켜면 같은 내용이라 같은 버전
    b.store.setRigEnabled(ws.key, true); assert.equal(b.rig.read(ws.key).n, 1);
    assert.equal(b.store.rigVersions(ws.key).length, 1);
    assert.ok(got.length >= 0);
  } finally { await stop(); }
});

test('P190 rig.create는 사람이 둔 자리 안내 파일을 덮지 않는다', async () => {
  const { b, dir, stop } = await empty();
  try {
    fs.mkdirSync(path.join(dir, '.atrium', 'seats'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.atrium', 'seats', 'main.txt'), 'mine');
    const r = await HS(b)['rig.create']({ answers: { launcher: 'claude' } }, LOCAL);
    assert.deepEqual(r.kept, ['.atrium/seats/main.txt']);
    assert.equal(fs.readFileSync(path.join(dir, '.atrium', 'seats', 'main.txt'), 'utf8'), 'mine');
  } finally { await stop(); }
});

test('P190 rig.save: seats·flow·results 세 칸만 바꾸고 다른 칸·칸 차례·들여쓰기는 그대로, 새 버전(human). 보호 포인터·검사 실패는 거절', async () => {
  const { b, ws, dir, stop } = await empty();
  try {
    legacyCreate(b, ws.key, 'main-worker-reviewer', { main: 'claude', worker: 'claude', reviewer: 'claude' });
    // 사람이 손으로 더한 다른 칸
    const def0 = readRig(dir); const withExtra = { custom: { keep: [1, 2] }, ...def0, guide: '.atrium/seats/main.txt' };
    fs.writeFileSync(rigFile(dir), JSON.stringify(withExtra, null, 2) + '\n');
    b.store.setRigEnabled(ws.key, true);
    assert.equal(b.rig.read(ws.key).n, 2);
    const seats = { main: { launcher: 'claude', session: 'keep' }, worker: { launcher: 'codex', session: 'fresh' }, reviewer: { launcher: 'claude', session: 'fresh' } };
    const flow = readRig(dir).flow.map((l) => (l.on === 'rejected' ? { ...l, max: 3 } : l));
    await assert.rejects(HS(b)['rig.save']({ seats, flow }, DEVICE), (e) => e.code === 'forbidden');
    const r = await HS(b)['rig.save']({ seats, flow }, LOCAL);
    assert.equal(r.ok, true); assert.equal(r.versionN, 3);
    const after = readRig(dir);
    assert.deepEqual(Object.keys(after), Object.keys(withExtra), '칸 차례 그대로');
    assert.deepEqual(after.custom, { keep: [1, 2] }); assert.equal(after.guide, '.atrium/seats/main.txt'); assert.equal(after.name, def0.name);
    assert.equal(after.seats.worker.launcher, 'codex');
    assert.equal(after.seats.worker.guide, '.atrium/seats/worker.txt', '표가 주지 않은 자리 칸(guide)은 그대로');
    assert.equal(after.flow.find((l) => l.on === 'rejected').max, 3);
    assert.deepEqual(after.results, def0.results);
    const text = fs.readFileSync(rigFile(dir), 'utf8'); assert.equal(text, JSON.stringify(after, null, 2) + '\n');
    let v = b.store.rigVersions(ws.key); assert.equal(v[2].by, 'human'); assert.equal(v[2].note, 'save');
    assert.equal(b.rig.read(ws.key).n, 3, '켜진 rig의 읽기도 같은 버전');
    // 검사 실패
    await assert.rejects(HS(b)['rig.save']({ flow: [{ from: 'main', on: 'assign', to: 'nobody' }] }, LOCAL), (e) => e.code === 'rig_invalid' && /없는 자리/.test(e.message));
    // null이면 그 칸을 뺀다
    const r2 = await HS(b)['rig.save']({ seats: { ...seats, worker: { launcher: 'claude', session: 'fresh', guide: null } } }, LOCAL);
    assert.equal(r2.versionN, 4); assert.equal(readRig(dir).seats.worker.guide, undefined);
    // 사람만 고치는 자리
    b.branch.rigAdmin.protect(ws.key, { pointer: '/seats/reviewer' });
    await assert.rejects(HS(b)['rig.save']({ seats: { ...seats, reviewer: { launcher: 'codex', session: 'fresh' } } }, LOCAL), (e) => e.code === 'rig_protected');
    const r3 = await HS(b)['rig.save']({ results: ['ok', 'failed', 'rejected', 'later'] }, LOCAL);
    assert.equal(r3.versionN, 5, '보호 밖의 칸은 저장된다');
    v = b.store.rigVersions(ws.key); assert.equal(v.length, 5);
    // 같은 내용은 새 버전이 아니다
    const r4 = await HS(b)['rig.save']({ results: ['ok', 'failed', 'rejected', 'later'] }, LOCAL);
    assert.equal(r4.unchanged, true); assert.equal(r4.versionN, 5);
  } finally { await stop(); }
});

test('P190 rig.get: 없는 워크스페이스는 none, 만든 뒤 off와 정의·버전·기본 런처, 켜면 on과 앉은 세션·열린 건·훅·도구. 원격도 읽는다', async () => {
  const { b, ws, dir, add, stop } = await empty();
  try {
    let g = await HS(b)['rig.get']({}, DEVICE);
    assert.equal(g.status, 'none'); assert.equal(g.definition, null); assert.equal(g.builder, null); assert.equal(g.defaultLauncher, 'claude');
    assert.equal((await HS(b)['rig.presets']({}, DEVICE)).shortcuts.length, 2, 'P228: 바로가기 둘(원격도 읽는다)');
    legacyCreate(b, ws.key, 'main-worker', { main: 'claude', worker: 'claude' });
    g = await HS(b)['rig.get']({}, LOCAL);
    assert.equal(g.status, 'off'); assert.equal(g.versionN, 1); assert.equal(g.definition.seats.main.session, 'keep');
    assert.deepEqual(g.locked, []); assert.equal(g.openCases, 0); assert.deepEqual(g.seated, { main: [], worker: [] });
    b.store.setRigEnabled(ws.key, true);
    const m = add('lead'); b.branch.flow.setSeat(m, 'main');
    b.branch.rigAdmin.protect(ws.key, { pointer: '/flow' });
    g = await HS(b)['rig.get']({}, LOCAL);
    assert.equal(g.status, 'on'); assert.deepEqual(g.locked, ['/flow']);
    assert.equal(g.seated.main.length, 1); assert.equal(g.seated.main[0].name, 'lead');
    // 잘못된 정의
    fs.writeFileSync(rigFile(dir), '{ nope'); const t = new Date(Date.now() + 5000); fs.utimesSync(rigFile(dir), t, t);
    g = await HS(b)['rig.get']({}, LOCAL);
    assert.match(g.why, /JSON이 아니다/); assert.equal(g.definition, null);
    assert.equal(g.status, 'on', '마지막 맞은 정의를 쓰는 중');
  } finally { await stop(); }
});

test('P190 rig.get: 훅·도구·주기는 이름과 명령만', async () => {
  const { b, stop } = await board();
  try {
    const g = await HS(b)['rig.get']({}, LOCAL);
    assert.equal(g.status, 'on');
    assert.ok(g.hooks.length && g.hooks.every((h) => h.at && Array.isArray(h.run)));
    assert.ok(g.tools.length && g.tools.every((x) => x.name && Array.isArray(x.run) && 'desc' in x));
    assert.ok(g.cycles.length && g.cycles.every((x) => x.every && x.to));
  } finally { await stop(); }
});

test('P190 rig.spawnSeat: keep 자리를 그 자리의 런처로 띄워 앉힌다(이름은 자리, 겹치면 <자리>-<n>). fresh·없는 자리·꺼진 rig·앉은 자리는 거절', async () => {
  const { b, ws, add, stop } = await empty();
  try {
    legacyCreate(b, ws.key, 'main-worker', { main: 'codex', worker: 'claude' });
    await assert.rejects(HS(b)['rig.spawnSeat']({ seat: 'main' }, LOCAL), (e) => e.code === 'rig_off');
    b.store.setRigEnabled(ws.key, true);
    await assert.rejects(HS(b)['rig.spawnSeat']({ seat: 'main' }, DEVICE), (e) => e.code === 'forbidden');
    await assert.rejects(HS(b)['rig.spawnSeat']({ seat: 'worker' }, LOCAL), /fresh 자리/);
    await assert.rejects(HS(b)['rig.spawnSeat']({ seat: 'nope' }, LOCAL), /자리 nope가 없다/);
    add('main'); // 이름이 겹친다
    const r = await HS(b)['rig.spawnSeat']({ seat: 'main' }, LOCAL);
    assert.equal(r.name, 'main-1'); assert.equal(r.launcher, 'codex');
    const p = b.spawned.at(-1);
    assert.equal(p.kind, 'codex'); assert.equal(p[SEAT_SPAWN], 'main'); assert.equal(p.cwd, b.rig.rootOf(ws.key));
    const s = b.sessions.get(r.session);
    assert.equal(s.rigSeat, 'main'); assert.equal(b.store.getSession(s.sessionId).rigSeat ?? b.store.db.prepare('SELECT rig_seat FROM sessions WHERE session_id = ?').get(s.sessionId).rig_seat, 'main');
    await assert.rejects(HS(b)['rig.spawnSeat']({ seat: 'main' }, LOCAL), (e) => e.code === 'seat_taken');
  } finally { await stop(); }
});

test('P190 rig.describe: 제작 세션 rig-builder를 띄우고 사람이 주인인 일을 준다. done 값은 판 이벤트 rig.builder로, 그 동안 쓴 정의는 누가 human', async () => {
  const { b, ws, dir, stop } = await empty();
  try {
    const got = listen(b);
    // 제작 세션: 첫 요청을 받으면 정의를 쓰고 검사한 뒤 done
    b.onSpawnText = async (text, s) => {
      if (!/rig 만들기 일/.test(text)) return;
      const { def, guides } = legacyTemplateFiles('main-worker', { main: 'claude', worker: 'claude' });
      for (const [rel, t] of Object.entries(guides)) { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), t); }
      fs.writeFileSync(rigFile(dir), JSON.stringify(def, null, 2));
      const c = await b.branch.rigAdmin.verb(s, { op: 'check' });
      assert.equal(c.ok, true, c.reason);
      s.doneOut = await U(b).doneVerb(s, { result: 'ok', text: '메인과 워커를 만들었다' });
    };
    await assert.rejects(HS(b)['rig.describe']({ text: 'x' }, DEVICE), (e) => e.code === 'forbidden');
    await assert.rejects(HS(b)['rig.describe']({ text: '  ' }, LOCAL), /글로 적는다/);
    const r = await HS(b)['rig.describe']({ text: '메인 하나와 워커 하나', launcher: 'claude' }, LOCAL);
    assert.equal(r.name, 'rig-builder'); assert.equal(r.spawned, true);
    const s = b.sessions.get(r.session);
    const u = b.store.getUnit(r.unit);
    assert.equal(u.from, HUMAN_FROM); assert.equal(u.origin, BUILDER_ORIGIN); assert.match(u.spec, /메인 하나와 워커 하나/);
    await until(() => s.doneOut, 4000);
    assert.equal(s.texts[0].startsWith(builderHeader({ unitId: u.id })), true, '제작 일 머리');
    assert.match(s.texts[0], /atrium guide rig/);
    assert.equal(s.doneOut.claimedBy, 'human'); assert.equal(s.doneOut.parent, 'human');
    const ev = got.filter((x) => x.kind === 'rig.builder');
    const last = ev.at(-1).data;
    assert.equal(last.workspace, ws.key); assert.equal(last.session, s.sessionId); assert.equal(last.result, 'ok'); assert.equal(last.text, '메인과 워커를 만들었다');
    assert.equal(last.definitionStatus, 'off'); assert.equal(last.state, 'done');
    // 꺼진 rig라도 맞는 정의는 버전으로(누가 human)
    const v = b.store.rigVersions(ws.key); assert.equal(v.length, 1); assert.equal(v[0].by, 'human');
    // 다른 세션에는 아무 글도 가지 않았다(상위가 없다)
    assert.ok(b.sent.every((x) => x.sid === s.sessionId));
    const g = await HS(b)['rig.get']({}, LOCAL);
    assert.equal(g.builder.state, 'done'); assert.equal(g.builder.result, 'ok'); assert.equal(g.builder.name, 'rig-builder');
    // 다시 설명(말로 고치기): 같은 제작 세션에 새 일, 고칠 내용으로
    b.onSpawnText = null; s.onText = null;
    const r2 = await HS(b)['rig.describe']({ text: '워커를 codex로' }, LOCAL);
    assert.equal(r2.session, s.sessionId); assert.equal(r2.spawned, false); assert.notEqual(r2.unit, r.unit);
    assert.match(b.store.getUnit(r2.unit).spec, /고칠 내용/);
    // 열린 제작 일에 다시 보내면 그 일에 붙는다
    const r3 = await HS(b)['rig.describe']({ text: '하나 더' }, LOCAL);
    assert.equal(r3.followup, true); assert.equal(r3.unit, r2.unit);
  } finally { await stop(); }
});

test('P190 켜진 rig의 말로 고치기: 제작 일이 열린 동안 바뀐 정의는 누가 human, 그 밖은 지금 규칙(unknown)', async () => {
  const { b, ws, dir, stop } = await empty();
  try {
    legacyCreate(b, ws.key, 'main-worker', { main: 'claude', worker: 'claude' });
    b.store.setRigEnabled(ws.key, true); assert.equal(b.rig.read(ws.key).n, 1);
    let builder = null;
    b.onSpawnText = async (text, s) => { builder = s; };
    const r = await HS(b)['rig.describe']({ text: '워커 상한을 2로' }, LOCAL);
    await until(() => builder && builder.texts.length && builder.rt.term.status === 'idle', 4000);
    // 제작 세션이 rig check를 쓴다(켜진 rig지만 제작 일을 쥐었다)
    assert.equal((await b.branch.rigAdmin.verb(builder, { op: 'check' })).ok, true);
    assert.ok(Array.isArray((await b.branch.rigAdmin.verb(builder, { op: 'log' })).versions), 'P209: 제작 세션은 log도(읽기만)');
    const def = readRig(dir); def.seats.worker.max_live = 2;
    fs.writeFileSync(rigFile(dir), JSON.stringify(def, null, 2)); const t1 = new Date(Date.now() + 1000); fs.utimesSync(rigFile(dir), t1, t1);
    assert.equal(b.rig.read(ws.key).n, 2);
    await U(b).doneVerb(builder, { result: 'ok', text: '고쳤다' });
    assert.equal(b.store.getUnit(r.unit).status, 'done');
    // 일이 닫히고 한참 뒤의 고침은 사람 것이 아니다
    def.seats.worker.max_live = 3;
    fs.writeFileSync(rigFile(dir), JSON.stringify(def, null, 2)); const t2 = new Date(Date.now() + 60000); fs.utimesSync(rigFile(dir), t2, t2);
    assert.equal(b.rig.read(ws.key).n, 3);
    assert.deepEqual(b.store.rigVersions(ws.key).map((x) => x.by), ['human', 'human', 'unknown']);
  } finally { await stop(); }
});

test('P190 제작 세션이 보고 없이 멈추면 응답 필요 목록(rig_builder_stop)과 rig.builder(stopped)로, 다른 세션에는 알리지 않는다', async () => {
  const { b, ws, add, stop } = await empty();
  try {
    const other = add('bystander');
    const got = listen(b);
    const r = await HS(b)['rig.describe']({ text: '메인과 워커' }, LOCAL);
    const s = b.sessions.get(r.session);
    await until(() => evs(b, 'rig_builder_stop').length, 4000);
    const e = evs(b, 'rig_builder_stop')[0];
    assert.equal(e.data.why, 'idle_no_done'); assert.equal(e.data.workspace, ws.key); assert.equal(e.session_id, s.sessionId);
    assert.ok(got.some((x) => x.kind === 'rig.builder' && x.data.state === 'stopped' && x.data.stopReason === 'idle_no_done'));
    const g = await HS(b)['rig.get']({}, LOCAL); assert.equal(g.builder.state, 'stopped'); assert.equal(g.builder.stopReason, 'idle_no_done');
    assert.ok(CHANGE_KINDS.includes('rig_builder_stop'));
    const lines = summarizeChanges(b.store.eventsAfter(0, CHANGE_KINDS), { nameOf: (id) => (b.sessions.get(id) || {}).name });
    const l = lines.find((x) => x.kind === 'needs_you' && x.sessionId === s.sessionId);
    assert.ok(l, '응답 필요 줄'); assert.equal(l.msg.key, 'chgRigBuilderStop'); assert.equal(l.stillOpen, true);
    await tick(150);
    assert.equal(other.texts.length, 0); assert.ok(b.sent.every((x) => x.sid === s.sessionId));
    assert.equal(evs(b, 'rig_builder_stop').length, 1, '한 번만');
  } finally { await stop(); }
});

test('P190 atrium guide rig: 판 내장 안내(정의 형식, 바로가기 둘, rig check, done)', async () => {
  const { b, add, stop } = await empty();
  try {
    const s = add('x');
    const r = b.branch.guideVerb(s, { topic: 'rig' });
    assert.equal(r.builtin.topic, 'rig');
    assert.equal(r.builtin.text, rigGuideText());
    for (const w of ['atrium rig check', 'atrium done ok', '"session": "keep"', '"max": 2', '"loops"', '"permission": "scoped"', 'results', 'flow', 'manager']) assert.ok(r.builtin.text.includes(w), w);
    assert.equal(b.branch.guideVerb(s, {}).builtin, undefined, '주제 없으면 그대로');
    assert.match(VERBS.find((v) => v.name === 'guide').does, /guide rig/);
  } finally { await stop(); }
});

test('P190 atrium rig check 넓히기: 꺼졌거나 없는 rig면 어느 세션이든, 켜진 rig에서는 관리자 자리만(지금 규칙). 다른 동작은 그대로', async () => {
  const { b, ws, dir, add, stop } = await empty();
  try {
    const s = add('anyone');
    let c = await b.branch.rigAdmin.verb(s, { op: 'check' });
    assert.equal(c.ok, false); assert.match(c.reason, /없다/);
    const def = legacyTemplateFiles('main-worker', { main: 'claude', worker: 'claude' }).def; delete def.seats.main.guide; delete def.seats.worker.guide;
    fs.mkdirSync(path.join(dir, 'cand'), { recursive: true });
    c = await b.branch.rigAdmin.verb(s, { op: 'check', text: JSON.stringify(def), file: 'cand.json' });
    assert.equal(c.ok, true, c.reason); assert.deepEqual(c.summary.seats, ['main', 'worker']);
    c = await b.branch.rigAdmin.verb(s, { op: 'check', text: JSON.stringify({ seats: { Bad: {} } }) });
    assert.equal(c.ok, false);
    await assert.rejects(b.branch.rigAdmin.verb(s, { op: 'log' }), (e) => e.code === 'forbidden');
    legacyCreate(b, ws.key, 'main-worker', { main: 'claude', worker: 'claude' });
    assert.equal((await b.branch.rigAdmin.verb(s, { op: 'check' })).ok, true, '꺼진 rig');
    b.store.setRigEnabled(ws.key, true);
    await assert.rejects(b.branch.rigAdmin.verb(s, { op: 'check' }), (e) => e.code === 'forbidden', '켜진 rig는 관리자 자리만');
    b.branch.flow.setSeat(s, 'main');
    assert.equal((await b.branch.rigAdmin.verb(s, { op: 'check' })).ok, true, '관리자 자리');
  } finally { await stop(); }
});

test('P190 rig 없는 워크스페이스는 그대로: 하위 일의 done은 상위로, 제작 일만 사람에게', async () => {
  const { b, add, stop } = await empty();
  try {
    const lead = add('lead');
    const kid = add('kid', { parentSessionId: lead.sessionId });
    const made = U(b).create(lead, kid, '할 일', 'prompt');
    assert.notEqual(made.unit.from, HUMAN_FROM);
    await until(() => kid.texts.length, 3000);
    assert.match(kid.texts[0], /@lead의 하위 워커/);
    const out = U(b).done(kid, { result: 'ok', text: '끝' });
    assert.equal(out.claimedBy, 'queue'); assert.equal(out.parent, 'lead');
    assert.equal(b.rig.status(lead.workspaceKey).state, 'none');
  } finally { await stop(); }
});
