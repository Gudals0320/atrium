// P188 단위 시험: rig 5단계 — 정의 버전·누가, 건 버전 고정, atrium rig check·log·rollback·cleanup과 권한, 사람만 고치는 목록(포인터·파일), 느린 고리, 세 줄 머리(15절).
// 진짜 저장소·전달 대기열·Branch·Rig·RigFlow·RigAdmin, 가짜 에이전트(p185 틀). 견본 rig의 훅과 도구는 진짜 node 프로세스로 돈다.
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
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p188-'));
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
  const cfg = { profile: 'dev', terminalSession: 'atrium-dev-p188test', port: 0, dataDir: dir, sessionsDir: path.join(dir, 'sessions'), inputQuietMs: 3000, submitConfirmMs: 3000, deliveryMaxWaitMs: 60000, submitRetries: 0 };
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
const done = (b, s, result, text) => U(b).doneVerb(s, { result, text });
const lastText = (s) => s.texts[s.texts.length - 1] || '';
// 자리 세션이 받은 일이 들어갈 때까지
const gotUnit = (s) => until(() => s.texts.some((t) => /rig의 \w+ 자리다/.test(t)) && s.rt.term.status === 'idle', 4000);

// ---------- P188 ----------
import { RigAdmin, rigAdminHandlers } from '../src/rig-admin.mjs';
import { unitHeader } from '../src/work-units.mjs';
import { summarizeChanges, CHANGE_KINDS } from '../src/changes.mjs';
import { parseEvery, pointerGet, validateCycles, RIG_HEADER_TAIL } from '../src/rig.mjs';

const LOCAL = { auth: { kind: 'local' } };
const rigFile = (dir) => path.join(dir, '.atrium', 'rig.json');
// rig.json을 정한 수정 시각으로 다시 쓴다(누가 판정이 수정 시각을 본다)
function put(dir, def, at = Date.now()) {
  const f = rigFile(dir);
  fs.writeFileSync(f, JSON.stringify(def, null, 2));
  const t = new Date(at); fs.utimesSync(f, t, t);
}
const H = (b) => rigAdminHandlers(b);
const versions = (b, ws) => b.store.rigVersions(ws.key);
// 관리자 자리(main) 세션
async function withManager(o = {}) {
  const x = await board(o);
  const lead = x.add('lead', { kind: 'codex', hooked: false });
  x.seat(lead, 'main');
  return { ...x, lead };
}

test('P188 정의 검사: cycles(every 하한 1시간, to는 자리나 manager, run, stale), 포인터 읽기, 견본 rig는 맞다', () => {
  assert.equal(parseEvery('7d'), 7 * 86400000); assert.equal(parseEvery('90m'), 5400000); assert.equal(parseEvery('x'), null);
  assert.equal(pointerGet({ seats: { a: { b: 1 } } }, '/seats/a/b'), 1); assert.equal(pointerGet({ 'a/b': 2 }, '/a~1b'), 2); assert.equal(pointerGet({}, '/x'), undefined);
  const flow = { seats: { main: {}, w: {} }, manager: 'main' };
  assert.equal(validateCycles({ cycles: [{ every: '30m', to: 'manager' }] }, flow).ok, false, '1시간 미만');
  assert.equal(validateCycles({ cycles: [{ every: '30m' }] }, flow, { cycleMinMs: 1000 }).ok, true, '하한을 줄이면(개발용 판) 된다');
  assert.equal(validateCycles({ cycles: [{ every: '1h', to: 'nope' }] }, flow).ok, false);
  assert.equal(validateCycles({ cycles: [{ every: '1h', to: 'manager' }] }, { seats: { a: {} }, manager: null }).ok, false, 'manager 없음');
  assert.equal(validateCycles({ cycles: [{ every: '1h' }] }, { seats: null }).ok, false, '자리 없는 rig');
  const v = validateCycles({ cycles: [{ every: '1h' }] }, flow);
  assert.equal(v.cycles[0].to, 'main'); assert.equal(v.cycles[0].staleMs, 86400000);
  const s = validateRig(sampleDef(), { root: SAMPLE });
  assert.ok(s.ok, s.reason); assert.equal(s.def.manager, 'main'); assert.equal(s.def.cycles.length, 1); assert.ok(s.def.tools.summary);
});

test('P188 버전 남기기와 누가: 켤 때 첫 버전(unknown), 관리자 자리가 일하는 턴 중의 고침은 manager, 그 밖은 unknown, 사람의 되돌리기는 human. 내용은 데이터 폴더 rigs/에', async () => {
  const { b, ws, dir, lead, stop } = await withManager();
  try {
    assert.equal(b.rig.read(ws.key).n, 1);
    let v = versions(b, ws);
    assert.equal(v.length, 1); assert.equal(v[0].by, 'unknown'); assert.equal(v[0].note, 'first');
    assert.ok(fs.existsSync(path.join(dir, v[0].file)), '버전 내용 파일');
    // 관리자 자리 세션이 일하는 중에 고침
    const def = sampleDef();
    applyTermStatus(lead.rt, 'working'); b.broadcastSession(lead);
    assert.equal(b.summary(lead).state, 'working');
    put(dir, { ...def, name: 'by-manager' });
    assert.equal(b.rig.read(ws.key).n, 2);
    applyTermStatus(lead.rt, 'idle'); b.broadcastSession(lead);
    put(dir, { ...def, name: 'by-someone' }, Date.now() + 2000);
    assert.equal(b.rig.read(ws.key).n, 3);
    v = versions(b, ws);
    assert.deepEqual(v.map((x) => x.by), ['unknown', 'manager', 'unknown']);
    // 같은 내용을 다시 읽어도 새 버전이 아니다
    b.rig.cache.clear(); assert.equal(b.rig.read(ws.key).n, 3);
    // 사람의 되돌리기(판 API 토큰만)
    await assert.rejects(H(b)['rig.rollback']({ n: 1 }, {}), (e) => e.code === 'forbidden');
    const rb = await H(b)['rig.rollback']({ n: 1 }, LOCAL);
    assert.equal(rb.n, 4); assert.equal(rb.from, 1);
    v = versions(b, ws);
    assert.equal(v[3].by, 'human'); assert.equal(v[3].note, 'rollback 1'); assert.equal(v[3].hash, v[0].hash, '버전 1과 같은 내용');
    assert.equal(fs.readFileSync(rigFile(dir), 'utf8'), fs.readFileSync(path.join(dir, v[0].file), 'utf8'));
    // 판이 다시 떠도(새 Rig) 마지막 버전을 안다
    const r2 = new Rig(b); assert.equal(r2.read(ws.key).n, 4);
    assert.equal(evs(b, 'rig_version').length, 4);
  } finally { await stop(); }
});

test('P188 건 버전 고정: 열린 건은 만들 때의 흐름을 따르고 새 버전은 새 건부터. 훅은 지금 정의', async () => {
  const { b, ws, dir, lead, by, stop } = await withManager();
  try {
    const r1 = await V(b).prompt(lead, { name: 'worker', text: '첫 건' });
    const c1 = b.store.getCase(r1.unit.caseId);
    assert.equal(c1.versionN, 1);
    const w1 = by('worker-1'); await gotUnit(w1);
    // 관리자가 흐름을 바꾼다: worker ok → main(검토 없이)
    const def = sampleDef();
    def.flow = def.flow.map((l) => (l.from === 'worker' && l.on === 'ok' ? { ...l, to: 'main' } : l));
    put(dir, def, Date.now() + 1000);
    assert.equal(b.rig.read(ws.key).n, 2);
    // 열린 건 c1: 옛 흐름(worker ok → reviewer)
    const d1 = await done(b, w1, 'ok', '첫 건 했다');
    assert.equal(d1.flow[0].seat, 'reviewer', '건 1은 버전 1의 흐름');
    const rv1 = by('reviewer-1'); await gotUnit(rv1);
    assert.match(rv1.texts[0], /\[rig flow sample\] handoff from seat worker/, '훅은 지금 정의(같은 스크립트)');
    assert.equal(b.branch.flow.seatCtx(rv1).versionN, 1);
    // 새 건(주인이 열린 시도를 쥐지 않음): 버전 2
    const r2 = await V(b).prompt(lead, { name: 'worker', text: '둘째 건' });
    assert.notEqual(r2.unit.caseId, c1.id);
    assert.equal(b.store.getCase(r2.unit.caseId).versionN, 2);
    const w2 = by('worker-2'); await gotUnit(w2);
    const d2 = await done(b, w2, 'ok', '둘째 건 했다');
    assert.deepEqual(d2.reports, [{ seat: 'main', to: 'lead', escalated: false }], '건 2는 버전 2의 흐름(P194: 주인 lead에게는 일이 아니라 보고)');
    // rig.cases와 me가 버전을 보인다
    const cs = await rigFlowHandlers(b)['rig.cases']({}, null);
    assert.deepEqual(cs.cases.map((c) => c.version).sort(), [1, 2]);
    assert.equal(b.branch.me(rv1).rig.version, 1);
  } finally { await stop(); }
});

test('P188 atrium rig 권한: 관리자 자리만(자리 없는 세션·다른 자리·꺼진 rig는 거절과 까닭), 사람은 판 API 토큰만. check·log', async () => {
  const { b, ws, dir, lead, add, by, stop } = await withManager();
  try {
    const A = b.branch.rigAdmin;
    const plain = add('plain');
    await assert.rejects(A.verb(plain, { op: 'log' }), (e) => e.code === 'forbidden' && /관리자 자리\(main\)에 앉은 세션만/.test(e.message) && /자리 없는 세션/.test(e.message));
    await V(b).prompt(lead, { name: 'worker', text: '일' });
    const w1 = by('worker-1'); await gotUnit(w1);
    await assert.rejects(A.verb(w1, { op: 'log' }), (e) => e.code === 'forbidden' && /너는 worker 자리/.test(e.message));
    await assert.rejects(A.verb(lead, { op: 'nope' }), (e) => e.code === 'bad_request');
    // check: 지금 파일, 후보 글(잘못됨, 맞음)
    let c = await A.verb(lead, { op: 'check' });
    assert.equal(c.ok, true); assert.equal(c.same, true); assert.deepEqual(c.summary.cycles, ['1h → main']);
    c = await A.verb(lead, { op: 'check', text: '{"seats": 1}' });
    assert.equal(c.ok, false); assert.match(c.reason, /seats/);
    c = await A.verb(lead, { op: 'check', text: JSON.stringify({ ...sampleDef(), name: 'next' }) });
    assert.equal(c.ok, true); assert.equal(c.same, false);
    assert.equal(b.rig.read(ws.key).n, 1, 'check는 적용하지 않는다');
    // log: 버전마다 건·반려·훅 거절·상한 초과
    const lg = await A.verb(lead, { op: 'log' });
    assert.equal(lg.current, 1); assert.equal(lg.versions[0].cases, 1); assert.equal(lg.versions[0].current, true);
    // 사람(판 API 토큰)
    await assert.rejects(H(b)['rig.log']({}, { auth: { kind: 'device' } }), (e) => e.code === 'forbidden');
    assert.equal((await H(b)['rig.log']({}, LOCAL)).current, 1);
    assert.equal((await H(b)['rig.check']({}, LOCAL)).ok, true);
    // 꺼진 rig: 관리자 자리도 거절
    b.store.setRigEnabled(ws.key, false);
    await assert.rejects(A.verb(lead, { op: 'log' }), (e) => e.code === 'forbidden' && /켜진 rig가 없다/.test(e.message));
    // 계약: rig 동사, 승인 규칙
    assert.ok(VERBS.find((v) => v.name === 'rig')); assert.equal(CONTRACT_VERSION, 4);
  } finally { await stop(); }
});

test('P188 rollback(관리자 = manager, 새 버전, 새 건부터)과 cleanup(끝난 건의 fresh 세션을 닫고 워크트리 목록, 열린 건은 거절)', async () => {
  const { b, ws, dir, lead, by, stop } = await withManager();
  try {
    const A = b.branch.rigAdmin;
    put(dir, { ...sampleDef(), name: 'v2' }, Date.now() + 1000);
    assert.equal(b.rig.read(ws.key).n, 2);
    const rb = await A.verb(lead, { op: 'rollback', n: 1 });
    assert.equal(rb.n, 3); assert.equal(versions(b, ws)[2].by, 'manager');
    await assert.rejects(A.verb(lead, { op: 'rollback', n: 9 }), (e) => e.code === 'not_found');
    const same = await A.verb(lead, { op: 'rollback', n: 1 });
    assert.equal(same.unchanged, true, '이미 그 내용');
    // cleanup
    const r = await V(b).prompt(lead, { name: 'worker', text: '정리할 건' });
    const w1 = by('worker-1'); await gotUnit(w1);
    await assert.rejects(A.verb(lead, { op: 'cleanup', caseId: r.unit.caseId }), (e) => e.code === 'case_open');
    await done(b, w1, 'failed', '못 했다'); // 맞는 줄이 없다 → 주인에게, 건 done
    await until(() => b.store.getCase(r.unit.caseId).state === 'done');
    b.store.insertCaseItem({ caseId: r.unit.caseId, sessionId: lead.sessionId, seat: 'main', worktree: 'worker-uX', worktreePath: path.join(dir, '.claude', 'worktrees', 'worker-uX') });
    const cl = await A.verb(lead, { op: 'cleanup', caseId: r.unit.caseId });
    assert.deepEqual(cl.closed.map((x) => x.name), ['worker-1']);
    assert.ok(!b.sessions.has(w1.sessionId), 'fresh 세션을 닫았다');
    assert.ok(cl.kept.some((x) => x.name === 'lead' && x.why === 'keep'), 'keep 자리 세션은 남긴다');
    assert.deepEqual(cl.worktrees, [{ name: 'worker-uX', path: path.join(dir, '.claude', 'worktrees', 'worker-uX'), exists: false }]);
    await assert.rejects(A.verb(lead, { op: 'cleanup', caseId: 'cnope' }), (e) => e.code === 'not_found');
    assert.equal(evs(b, 'rig_cleanup').length, 1);
  } finally { await stop(); }
});

test('P188 사람만 고치는 포인터: 바꾼 버전은 쓰지 않고(마지막 맞은 버전) 알림(관리자 자리에 판 알림, 사람에게 응답 필요), 다른 고침은 쓰인다, 빼면 쓰인다', async () => {
  const { b, ws, dir, lead, stop } = await withManager();
  try {
    await assert.rejects(H(b)['rig.protect']({ pointer: '/flow' }, {}), (e) => e.code === 'forbidden');
    await assert.rejects(H(b)['rig.protect']({ pointer: 'flow' }, LOCAL), (e) => e.code === 'bad_request');
    let pv = await H(b)['rig.protect']({ pointer: '/seats/reviewer' }, LOCAL);
    assert.deepEqual(pv.pointers, ['/seats/reviewer']);
    assert.deepEqual(b.rig.rigProtected(ws.key), { pointers: ['/seats/reviewer'], files: [] }, 'P189가 쓰는 읽기');
    const def = sampleDef();
    const bad = { ...def, seats: { ...def.seats, reviewer: { ...def.seats.reviewer, launcher: 'claude' } } };
    put(dir, bad, Date.now() + 1000);
    const r = b.rig.read(ws.key);
    assert.equal(r.n, 1, '마지막 맞은 버전'); assert.equal(r.def.seats.reviewer.launcher, 'codex');
    assert.deepEqual(r.protectedHits, ['/seats/reviewer']); assert.match(r.invalid, /사람만 고치는 자리/);
    assert.equal(versions(b, ws).length, 1, '버전으로 남기지 않는다');
    assert.equal(evs(b, 'rig_protected').length, 1);
    await until(() => lead.texts.some((t) => /사람만 고치는 자리\(\/seats\/reviewer\)/.test(t)));
    // 사람의 응답 필요: 복귀 요약의 needs_you 줄
    assert.ok(CHANGE_KINDS.includes('rig_protected'));
    const lines = summarizeChanges(b.store.eventsAfter(0, CHANGE_KINDS), { nameOf: (id) => (b.sessions.get(id) || {}).name });
    const ny = lines.find((l) => l.kind === 'needs_you' && l.rig);
    assert.ok(ny); assert.equal(ny.stillOpen, true); assert.equal(ny.msg.key, 'chgRigPointer');
    // check도 알려 준다
    assert.deepEqual((await b.branch.rigAdmin.verb(lead, { op: 'check' })).protectedHits, ['/seats/reviewer']);
    // 같은 고침을 다시 읽어도 알림은 한 번
    b.rig.read(ws.key); assert.equal(evs(b, 'rig_protected').length, 1);
    // 보호 자리를 그대로 두고 다른 곳을 고치면 쓰인다
    put(dir, { ...def, name: 'renamed' }, Date.now() + 2000);
    assert.equal(b.rig.read(ws.key).n, 2);
    // 판이 다시 떠도 보호는 마지막 버전과 비교한다
    put(dir, { ...bad, name: 'renamed' }, Date.now() + 3000);
    const r2 = new Rig(b); r2.b = b;
    assert.equal(r2.read(ws.key).n, 2); assert.deepEqual(r2.read(ws.key).protectedHits, ['/seats/reviewer']);
    // 빼면 쓰인다
    pv = await H(b)['rig.unprotect']({ pointer: '/seats/reviewer' }, LOCAL);
    assert.deepEqual(pv.pointers, []);
    assert.equal(b.rig.read(ws.key).n, 3); assert.equal(b.rig.read(ws.key).def.seats.reviewer.launcher, 'claude');
    assert.equal(b.rig.rigProtected(ws.key), null, '빈 목록은 null');
  } finally { await stop(); }
});

test('P188 사람만 고치는 파일: 해시가 다르면 도구 거절과 알림, 다시 승인하면 돈다. 목록 보기', async () => {
  const { b, ws, dir, lead, stop } = await withManager();
  try {
    const T = b.branch.tools;
    let x = await T.verb(lead, { op: 'run', tool: 'summary', args: ['a'] });
    assert.equal(x.run.status, 'done'); assert.match(x.run.tail, /\[rig flow sample\] summary: \.atrium files \d+, args a/);
    await assert.rejects(H(b)['rig.protect']({ file: '../x' }, LOCAL), (e) => e.code === 'bad_request');
    await assert.rejects(H(b)['rig.protect']({ file: 'nope.txt' }, LOCAL), (e) => e.code === 'not_found');
    let pv = await H(b)['rig.protect']({ file: '.atrium/guide.txt' }, LOCAL);
    assert.equal(pv.files[0].path, '.atrium/guide.txt'); assert.equal(pv.files[0].ok, true); assert.match(pv.files[0].sha256, /^[0-9a-f]{64}$/);
    fs.appendFileSync(path.join(dir, '.atrium', 'guide.txt'), '\n바뀐 줄\n');
    await assert.rejects(T.verb(lead, { op: 'run', tool: 'summary' }), (e) => e.code === 'rig_protected' && /\.atrium\/guide\.txt/.test(e.message));
    assert.equal(b.store.toolRunsOf(lead.sessionId, 5)[0].status, 'rejected');
    assert.equal(evs(b, 'rig_protected').at(-1).data.kind, 'file');
    await until(() => lead.texts.some((t) => /사람만 고치는 파일\(\.atrium\/guide\.txt\)/.test(t)));
    pv = await H(b)['rig.protected']({}, null);
    assert.equal(pv.files[0].ok, false); assert.ok(pv.alerts.length >= 1);
    assert.deepEqual(b.rig.status(ws.key).changedFiles, ['.atrium/guide.txt']);
    // 목록 보기는 된다
    assert.ok((await T.verb(lead, { op: 'list' })).tools.length);
    // 다시 승인
    pv = await H(b)['rig.protect']({ file: '.atrium/guide.txt' }, LOCAL);
    assert.equal(pv.files.length, 1); assert.equal(pv.files[0].ok, true);
    x = await T.verb(lead, { op: 'run', tool: 'summary' });
    assert.equal(x.run.status, 'done');
    pv = await H(b)['rig.unprotect']({ file: '.atrium/guide.txt' }, LOCAL);
    assert.equal(pv.files.length, 0);
  } finally { await stop(); }
});

test('P188 느린 고리: 다음 시각은 DB, 놓친 회는 한 번, 요약(건·상한·훅·도구·사람의 글·오래 열린 건) + run 출력, 받는 자리가 없으면 돌지 않는다', async () => {
  const { b, ws, dir, add, seat, lead, by, stop } = await withManager();
  try {
    const F = b.branch.flow;
    const t0 = Date.now();
    assert.deepEqual(await F.cycleTick(t0), [], '처음에는 다음 시각만 정한다');
    const row = b.store.getCycle(ws.key, 0);
    assert.equal(row.nextAt, t0 + 3600000);
    assert.deepEqual(await F.cycleTick(t0 + 60000), []);
    // 그 사이의 장부: 건 하나(오래 열림), 사람이 자리에 보낸 글, 도구 실패
    await V(b).prompt(lead, { name: 'worker', text: '오래 걸리는 일' });
    const w1 = by('worker-1'); await gotUnit(w1);
    b.queue.enqueue(lead.sessionId, '사람이 메인에게: 우선순위를 바꿔라', { origin: { kind: 'human' } });
    await until(() => lead.texts.length >= 1 && lead.rt.term.status === 'idle');
    for (const decision of ['reject', 'reject', 'pass']) b.store.insertHookRun({ t: t0 + 1000, workspaceKey: ws.key, at: 'done', hookIndex: 0, argv: ['node', 'x'], decision, reason: decision === 'reject' ? 'evidence 없음' : null });
    for (const [i, code] of [[1, 0], [2, 3]]) b.store.insertToolRun({ id: `trx${i}`, sessionId: lead.sessionId, workspaceKey: ws.key, tool: 'summary', argv: [], args: [], status: 'done', exitCode: code, startedAt: t0 + 1000 + i, endedAt: t0 + 2000 });
    // 판이 꺼져 있다가 다섯 주기 뒤에 돈다 → 한 번만
    const t1 = t0 + 5 * 3600000 + 1000;
    const fired = await F.cycleTick(t1);
    assert.equal(fired.length, 1); assert.equal(fired[0].to, 'lead');
    assert.equal(b.store.getCycle(ws.key, 0).nextAt, t1 + 3600000, '놓친 회는 한 번, 다음은 지금 + 주기');
    assert.deepEqual(await F.cycleTick(t1 + 1000), []);
    await until(() => lead.texts.some((t) => /느린 고리/.test(t)) && lead.rt.term.status === 'idle');
    const got = lead.texts.find((t) => /느린 고리/.test(t));
    const [head, body] = [got.split('\n\n')[0], got.slice(got.indexOf('\n\n') + 2)];
    assert.equal(head.split('\n').length, 3);
    assert.match(head, /rig의 main 자리다\. 아래 일은 건 c\w+의 일 u\w+이다\(보드의 느린 고리 cycles\[0\]가 만듦\)/);
    for (const h of ['## 건 결과', '## 상한 초과', '## 훅 판정', '## 도구 실패', '## 사람이 rig 자리에 보낸 글', '## 오래 열린 건', '## run 출력']) assert.ok(body.includes(h), h);
    assert.match(body, /새 건 1/);
    assert.match(body, /@lead\(main 자리\): 사람이 메인에게: 우선순위를 바꿔라/);
    assert.match(body, /오래 열린 건\(마지막 넘김 뒤 1시간 넘음\)\n- c\w+ open: 주인 @lead, 마지막 넘김 5시간 전, 열린 일 worker\(@worker-1\)/);
    assert.match(body, /\[rig flow sample\] summary: \.atrium files \d+, called by cycle line 0/);
    assert.match(body, /## 훅 판정\nreject 2, pass 1\n거절·실패 까닭 상위:\n- 2회: evidence 없음/, '훅 판정 수와 거절 까닭');
    assert.match(body, /## 도구 실패\n실행 2, 실패 1\n- summary done 종료 코드 3/);
    const u = b.store.getUnit(fired[0].unitId);
    assert.equal(u.origin, 'cycle'); assert.equal(u.from, lead.sessionId); assert.equal(u.to, lead.sessionId);
    // 관리자가 done → 건 done(자기에게 다시 보내지 않는다)
    const d = await done(b, lead, 'ok', '읽었다');
    assert.equal(d.claimedBy, 'record'); assert.equal(b.store.getCase(fired[0].caseId).state, 'done');
    // 받는 자리에 앉은 세션이 없으면 돌지 않고 다음 시각도 그대로(앉으면 돈다)
    F.setSeat(lead, null);
    assert.deepEqual(await F.cycleTick(t1 + 3600000 + 1), []);
    assert.equal(b.store.getCycle(ws.key, 0).nextAt, t1 + 3600000);
    assert.equal(evs(b, 'rig_cycle_skip').length, 1);
    const m2 = add('m2', { kind: 'claude' }); seat(m2, 'main');
    assert.equal((await F.cycleTick(t1 + 3600000 + 2)).length, 1);
    // 줄의 모양이 바뀌면 다시 센다
    const def = sampleDef(); def.cycles = [{ every: '2h', to: 'manager' }];
    put(dir, def, Date.now() + 1000);
    await F.cycleTick(t1 + 3600000 + 3);
    assert.equal(b.store.getCycle(ws.key, 0).nextAt, t1 + 3600000 + 3 + 7200000);
    // 줄이 없어지면 지운다
    delete def.cycles; put(dir, def, Date.now() + 2000);
    await F.cycleTick(t1 + 3600000 + 4);
    assert.equal(b.store.getCycle(ws.key, 0), null);
  } finally { await stop(); }
});

test('P188 일 머리 세 줄 이하: 자리 머리, 0단계 머리(rig 켜짐·꺼짐)', () => {
  const s = seatHeader({ seat: 'w', unitId: 'u1', caseId: 'c1', by: '@x가 맡김', guide: true });
  assert.equal(s.split('\n').length, 3); assert.ok(s.split('\n').every((l) => l.startsWith('[Atrium 보드]')));
  assert.match(s, /`atrium me`/); assert.match(s, /`atrium guide`/);
  assert.equal(promptTask(`${s}\n\n할 일`), '할 일');
  const on = unitHeader({ parent: 'p', unitId: 'u1', rig: true });
  assert.equal(on.split('\n').length, 3); assert.ok(on.endsWith(RIG_HEADER_TAIL));
  assert.equal(unitHeader({ parent: 'p', unitId: 'u1' }).split('\n').length, 3);
  assert.equal(promptTask(`${on}\n\n할 일`), '할 일');
});

test('P188 꺼진 rig와 자리 없는 세션은 그대로: 버전도 고리도 없다. 켜면 그때 첫 버전', async () => {
  const { b, ws, add, stop } = await board({ enable: false });
  try {
    const a = add('a');
    assert.equal(b.rig.read(ws.key).n, null);
    assert.equal(versions(b, ws).length, 0);
    assert.deepEqual(await b.branch.flow.cycleTick(Date.now()), []);
    assert.equal(b.store.getCycle(ws.key, 0), null);
    await assert.rejects(b.branch.rigAdmin.verb(a, { op: 'log' }), (e) => e.code === 'forbidden');
    b.store.setRigEnabled(ws.key, true);
    assert.equal(b.rig.read(ws.key).n, 1);
    assert.equal(b.branch.me(a).rig, undefined, '자리 없는 세션의 me에는 rig 칸이 없다');
  } finally { await stop(); }
});
