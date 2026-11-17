// P197 단위 시험: 세션 맵 rig 띠의 그래프 자료(docs research harness-arch.md 17절 "자료"). 건별 첫 할 일·마지막 넘김·이력과 via·주인 보고 기록·
// 줄별 지금 셈과 올림·줄 선 일·주기 건·취소·옛 자리, 담는 건(열린 50, 끝난 3, doneCount), 질의 묶음, rig.cases 이벤트. 모양 견본은 fixtures/rig-band/graph-rig.json(P198과 함께 쓴다).
// 가짜 판은 p194 틀. P197_GRAPH_OUT=<파일>이면 견본 시나리오의 그래프를 그 파일에 쓴다
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import { Store } from '../src/store.mjs';
import { newRuntime, applyHook, applyTermStatus, deriveState } from '../src/state.mjs';
import { workspaceOf } from '../src/git.mjs';
import { DeliveryQueue } from '../src/delivery.mjs';
import { Branch } from '../src/branch.mjs';
import { Rig } from '../src/rig.mjs';
import { seatColumns } from '../src/rig-flow.mjs';
import { missionGraph } from '../src/mission.mjs';


const HERE = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE = path.join(HERE, 'fixtures', 'rig-flow-sample');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p197-'));
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
  const cfg = { profile: 'dev', terminalSession: 'atrium-dev-p197test', port: 0, dataDir: dir, sessionsDir: path.join(dir, 'sessions'), inputQuietMs: 3000, submitConfirmMs: 3000, deliveryMaxWaitMs: 60000, submitRetries: 0 };
  const b = {
    cfg, apiToken: 'board-api-token', store, sessions: new Map(), bus: new EventEmitter(), killing: new Set(), sent: [], spawned: [],
    api: { broadcast: (n, d) => { (b.casts || (b.casts = [])).push({ n, d }); } }, log: () => {}, requireTerminal: () => {},
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
  return { b, dir, ws, add, F, seat, by, stop: async () => { b.stopped = true; b.queue.stop(); b.branch.notices.stop(); b.branch.units.stops.stop(); await tick(200); store.close(); } };
}

const U = (b) => b.branch.units;
const V = (b) => b.branch.verbs;
const done = (b, s, result, text) => U(b).doneVerb(s, { result, text });
const gotUnit = (s) => until(() => s.texts.some((t) => /rig의 \w+ 자리다/.test(t)) && s.rt.term.status === 'idle', 4000);
const FIXTURE = path.join(HERE, 'fixtures', 'rig-band', 'graph-rig.json');
const casts = (b) => (b.casts || []).filter((x) => x.n === 'rig.cases').length;

// 띠 견본과 같은 정의(v1에는 옛 자리 tester가 있다)
function bandDef({ tester = false } = {}) {
  const seats = {
    main: { launcher: 'claude', session: 'keep' },
    worker: { launcher: 'claude', session: 'fresh', may: ['main'], max_live: 3 },
    reviewer: { launcher: 'claude', session: 'fresh', may: ['main'] },
    docs: { launcher: 'claude', session: 'fresh', max_live: 1 },
    manager: { launcher: 'claude', session: 'keep' },
  };
  const flow = [
    { from: 'main', on: 'assign', to: 'worker' },
    { from: 'worker', on: 'ok', to: ['reviewer', 'docs'] },
    { from: 'reviewer', on: 'rejected', to: 'worker', max: 2, else: 'main' },
    { from: 'reviewer', on: 'ok', to: 'main' },
    { from: 'docs', on: 'ok', to: 'main' },
  ];
  if (tester) { seats.tester = { launcher: 'claude', session: 'fresh' }; flow.push({ from: 'tester', on: 'assign', to: 'reviewer' }); }
  return { name: 'band', results: ['ok', 'failed', 'rejected'], seats, flow, manager: 'manager', cycles: [{ every: '1h', to: 'manager' }] };
}

// 열쇠 모양(값의 종류)을 견본과 맞춘다. 배열은 첫 항목으로, null은 어떤 값과도 맞는다
function shapeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return v.length ? [shapeOf(v[0])] : [];
  if (typeof v === 'object') return Object.fromEntries(Object.keys(v).filter((k) => !k.startsWith('_')).sort().map((k) => [k, shapeOf(v[k])]));
  return typeof v;
}
function sameShape(a, f, at = '$') {
  if (a === 'null' || f === 'null') return;
  if (Array.isArray(f)) { assert.ok(Array.isArray(a), `${at}: 배열이어야 한다`); if (a.length && f.length) sameShape(a[0], f[0], `${at}[]`); return; }
  if (f && typeof f === 'object') { assert.deepEqual(Object.keys(a).sort(), Object.keys(f).sort(), `${at}: 열쇠`); for (const k of Object.keys(f)) sameShape(a[k], f[k], `${at}.${k}`); return; }
  assert.equal(a, f, `${at}: 종류`);
}
// 배열의 모든 항목을 견본의 첫 항목 모양과 맞춘다(via·reports처럼 null과 객체가 섞인 칸)
function allShapes(arr, f, at) { for (const x of arr) if (x !== null) sameShape(shapeOf(x), shapeOf(f), at); }

test('P197 열 순서: assign 출발 → 흐름 너비 우선 → 나머지(주기·올림에만 쓰이는 자리)', () => {
  const def = { seats: { manager: {}, rev: {}, a: {}, lead: {}, docs: {}, lonely: {} }, flow: [
    { from: 'lead', on: 'assign', to: ['a'] }, { from: 'a', on: 'ok', to: ['rev', 'docs'] }, { from: 'rev', on: 'rejected', to: ['a'], else: 'manager' }] };
  assert.deepEqual(seatColumns(def), ['lead', 'a', 'rev', 'docs', 'manager', 'lonely']);
  assert.deepEqual(seatColumns({ seats: { x: {}, y: {} }, flow: [] }), ['x', 'y']);
});

test('P197 그래프 rig 띠 자료: 건별 첫 할 일·마지막 넘김·이력과 via·보고·횟수와 올림·줄 선 일·주기·취소·옛 자리, 견본과 같은 모양, 질의 묶음, 이벤트', async () => {
  const { b, dir, ws, add, F, seat, by, stop } = await board({ def: bandDef({ tester: true }) });
  try {
    const key = ws.key;
    // 1. 옛 자리 tester의 건: 주인(t1)이 닫혀 cancelled
    const t1 = add('t1'); seat(t1, 'tester'); const t2 = add('t2'); seat(t2, 'tester');
    const rX = await V(b).prompt(t1, { name: 'reviewer', text: 'Old tester case' });
    const X = rX.unit.caseId;
    await gotUnit(by(rX.name));
    let n0 = casts(b);
    b.closeSession(t1, 'test');
    assert.equal(b.store.getCase(X).state, 'cancelled');
    assert.ok(casts(b) > n0, 'cancelled에 이벤트');
    // 2. 정의 v2: tester 자리를 뺀다(t2는 자리를 쥔 채 남는다)
    writeRig(dir, bandDef());
    assert.ok(!b.rig.active(key).def.seats.tester);
    const main = add('lead'); seat(main, 'main');
    const mgr = add('manager'); seat(mgr, 'manager');
    // worker ok → reviewer + docs(갈라짐). 받은 세션 이름들
    const workerOk = async (wName) => { const w = by(wName); await gotUnit(w); const d = await done(b, w, 'ok', 'did it'); return d.flow; };
    const review = async (fl, result) => { const rv = by(fl.find((x) => x.seat === 'reviewer').to); await gotUnit(rv); return done(b, rv, result, result === 'ok' ? 'good' : 'wrong'); };
    // 3. 끝나는 건 Z: worker ok → reviewer ok(주인 보고) + docs ok(주인 보고) → done
    const rZ = await V(b).prompt(main, { name: 'worker', text: 'Finish quickly\nsecond line' });
    const Z = rZ.unit.caseId;
    let fl = await workerOk(rZ.name);
    assert.deepEqual(fl.map((x) => x.seat).sort(), ['docs', 'reviewer']);
    n0 = casts(b);
    await review(fl, 'ok');
    assert.ok(casts(b) > n0, '보고에 이벤트');
    const dz = by(fl.find((x) => x.seat === 'docs').to); await gotUnit(dz);
    n0 = casts(b);
    const dzr = await done(b, dz, 'ok', 'docs ok');
    assert.equal(dzr.case.state, 'done'); assert.ok(casts(b) > n0, 'done에 이벤트');
    // 4. 건 A: 반려 둘(2/2) 뒤 셋째 반려가 주인에게 올라감(waiting_owner) → --case로 이어 다시 2/2
    await until(() => main.rt.term.status === 'idle');
    const rA = await V(b).prompt(main, { name: 'worker', text: 'Add the export button' });
    const A = rA.unit.caseId;
    const loop = async (wName, k) => { let w = wName; let d; for (let i = 0; i < k; i++) { const f = await workerOk(w); d = await review(f, 'rejected'); if (d.flow && d.flow.length) w = d.flow[0].to; } return { d, w }; };
    n0 = casts(b);
    let x = await loop(rA.name, 3);
    assert.equal(x.d.case.state, 'waiting_owner');
    assert.ok(casts(b) > n0);
    // 5. --case로 A를 이어(줄별 셈이 0부터) 다시 2/2. 그 뒤 새 건 W도 셋째 반려에 올라감
    await until(() => main.rt.term.status === 'idle');
    const rA2 = await V(b).prompt(main, { name: 'worker', text: 'again', caseId: A });
    assert.equal(rA2.unit.caseId, A);
    x = await loop(rA2.name, 2);
    assert.equal(b.store.getCase(A).state, 'open');
    await until(() => main.rt.term.status === 'idle');
    const rW = await V(b).prompt(main, { name: 'worker', text: 'Fix the login retry bug' });
    const W = rW.unit.caseId; assert.notEqual(W, A);
    const y = await loop(rW.name, 3);
    assert.equal(y.d.case.state, 'waiting_owner');
    // 6. 주기 건(관리자가 주인)
    const r = b.rig.active(key);
    const cyc = await F().fireCycle(key, r, r.def.cycles[0], { since: Date.now() - 3600000, now: Date.now() });
    const C = cyc.caseId;

    // ---- 그래프 ----
    let calls = 0; const orig = b.store.lastTryOfUnit; b.store.lastTryOfUnit = function (...a) { calls++; return orig.apply(this, a); };
    let batch = 0; const origB = b.store.unitsOfCasesWithTry; b.store.unitsOfCasesWithTry = function (...a) { batch++; return origB.apply(this, a); };
    const g = F().graph()[key];
    b.store.lastTryOfUnit = orig; b.store.unitsOfCasesWithTry = origB;
    assert.equal(calls, 0, '일마다 lastTryOfUnit을 부르지 않는다');
    assert.equal(batch, 1, '일과 시도는 한 질의');
    if (process.env.P197_GRAPH_OUT) fs.writeFileSync(process.env.P197_GRAPH_OUT, JSON.stringify(g, null, 2));
    // 열: 지금 정의 + 옛 자리 tester
    assert.deepEqual(g.seats.map((s) => `${s.name}${s.old ? '(old)' : ''}`), ['main', 'worker', 'reviewer', 'docs', 'manager', 'tester(old)']);
    assert.deepEqual(g.seats.at(-1).sessions.map((s) => s.name), ['t2']);
    assert.ok(g.flow.every((l) => !('passed' in l)), '맵 전체 passed 없음');
    assert.equal(g.version, 2);
    // 정렬: waiting_owner(W) → open(마지막 넘김 최근 순) → 끝난 건(최근 닫힌 순: Z done, X cancelled)
    const ids = g.cases.map((c) => c.id);
    assert.equal(ids[0], W);
    assert.deepEqual(ids.slice(-2), [Z, X]);
    assert.deepEqual(ids.slice(1, -2).sort(), [A, C].sort());
    const opens = g.cases.filter((c) => c.state === 'open');
    assert.ok(opens[0].lastHandoffAt >= opens[1].lastHandoffAt);
    assert.equal(g.openCount, 3); assert.equal(g.openMore, 0); assert.equal(g.doneCount, 2);
    const cA = g.cases.find((c) => c.id === A); const cW = g.cases.find((c) => c.id === W); const cZ = g.cases.find((c) => c.id === Z);
    const cX = g.cases.find((c) => c.id === X); const cC = g.cases.find((c) => c.id === C);
    // 첫 할 일, 마지막 넘김
    assert.equal(cA.firstTask, 'Add the export button'); assert.equal(cZ.firstTask, 'Finish quickly');
    assert.equal(cA.lastHandoffAt, Math.max(...cA.units.map((u) => u.createdAt), ...cA.reports.map((x) => x.at)));
    // 줄별 지금 셈과 올림
    assert.deepEqual(cA.lines.map((l) => [l.index, l.passed, l.max, l.escalated]), [[2, 2, 2, 1]]);
    assert.deepEqual(cW.lines.map((l) => [l.index, l.passed, l.max, l.escalated]), [[2, 2, 2, 1]]);
    // 이력과 via: 첫 일 via 없음, 갈라짐은 같은 prevUnit 둘, 되돌아감은 line 2
    assert.equal(cA.units[0].via, null);
    const fan = cA.units.filter((u) => u.via && u.via.prevUnit === cA.units[0].unit);
    assert.deepEqual(fan.map((u) => u.seat).sort(), ['docs', 'reviewer']);
    assert.ok(fan.every((u) => u.via.line === 1 && u.via.fromSeat === 'worker' && u.via.result === 'ok' && u.via.escalated === false));
    assert.ok(cA.units.some((u) => u.via && u.via.line === 2 && u.seat === 'worker'));
    assert.ok(cA.units.every((u) => typeof u.createdAt === 'number' && (u.status === 'open') === (u.closedAt == null)));
    assert.ok(cA.units.some((u) => u.result === 'rejected'));
    // 줄 선 일(docs max_live 1)
    const queued = g.cases.flatMap((c) => c.units).filter((u) => u.queued && u.status === 'open');
    assert.ok(queued.length >= 1); assert.ok(queued.every((u) => u.name === '(줄)' && u.sessionId === null && u.seat === 'docs'));
    assert.ok(g.seats.find((s) => s.name === 'docs').waiting >= 1);
    // 보고: Z의 두 보고(줄 3·4), A의 올림 보고
    assert.deepEqual(cZ.reports.map((x) => `${x.seat} ${x.result} ${x.line} ${x.escalated}`).sort(), ['docs ok 4 false', 'reviewer ok 3 false']);
    const esc = cA.reports.filter((x) => x.escalated);
    assert.equal(esc.length, 1); assert.equal(esc[0].seat, 'reviewer'); assert.equal(esc[0].result, 'rejected'); assert.equal(esc[0].line, 2);
    assert.ok(esc[0].name && esc[0].sessionId && esc[0].unit && esc[0].at);
    // 주기 건, 취소, 옛 자리의 건
    assert.equal(cC.cycle, 0); assert.equal(cC.owner, 'manager'); assert.equal(cA.cycle, null);
    assert.equal(cX.state, 'cancelled'); assert.equal(cX.ownerOpen, false); assert.equal(cX.version, 1);
    // 견본과 같은 모양
    const fx = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
    sameShape(shapeOf(g), shapeOf(fx));
    const fxUnits = fx.cases.flatMap((c) => c.units);
    allShapes(g.cases.flatMap((c) => c.units), fxUnits[0], 'unit');
    allShapes(g.cases.flatMap((c) => c.units).map((u) => u.via), fxUnits.find((u) => u.via).via, 'via');
    allShapes(g.cases.flatMap((c) => c.reports), fx.cases.flatMap((c) => c.reports)[0], 'report');
    allShapes(g.cases, fx.cases[0], 'case'); allShapes(g.seats, fx.seats[0], 'seat');
    // 견본의 뜻: doneCount는 끝난 건 전체(담긴 것 포함)
    assert.ok(fx.doneCount >= fx.cases.filter((c) => c.state === 'done' || c.state === 'cancelled').length);
    // mission.graph 그대로 지나간다
    assert.deepEqual(missionGraph({ sessions: [], rig: F().graph() }).rig[key].seats.length, 6);
  } finally { await stop(); }
});

test('P197 담는 건: 끝나지 않은 건 최대 50(openMore), 나이와 상관없는 최근 끝난 건 3, doneCount는 끝난 건 전체', async () => {
  const { b, ws, F, stop } = await board({ def: bandDef() });
  try {
    const key = ws.key; const st = b.store;
    const t0 = Date.now() - 30 * 86400000; // 한 달 전(옛 창은 1시간 안에 닫힌 것만 담았다)
    for (let i = 0; i < 55; i++) st.insertCase({ id: `co${i}`, workspaceKey: key, owner: 'x', state: i % 11 === 0 ? 'blocked' : 'open', createdAt: t0 + i });
    for (let i = 0; i < 7; i++) st.insertCase({ id: `cd${i}`, workspaceKey: key, owner: 'x', state: i === 6 ? 'cancelled' : 'done', createdAt: t0 + i, closedAt: t0 + 1000 + i });
    const g = F().graph()[key];
    const live = g.cases.filter((c) => !['done', 'cancelled'].includes(c.state));
    assert.equal(live.length, 50); assert.equal(g.openCount, 55); assert.equal(g.openMore, 5);
    assert.deepEqual(g.cases.filter((c) => ['done', 'cancelled'].includes(c.state)).map((c) => c.id), ['cd6', 'cd5', 'cd4']);
    assert.equal(g.doneCount, 7);
    assert.equal(g.cases[0].state, 'blocked', '막힘이 먼저');
    assert.equal(g.cases[0].firstTask, ''); assert.equal(g.cases[0].lastHandoffAt, g.cases[0].createdAt);
  } finally { await stop(); }
});

test('P197 주인에게 가는 맞는 줄 없는 done도 보고로 적는다(줄 null)', async () => {
  const def = bandDef(); def.flow = def.flow.filter((l) => !(l.from === 'docs')); // docs ok는 맞는 줄이 없다 → 0단계 done 알림으로 주인에게
  const { b, ws, add, F, seat, by, stop } = await board({ def });
  try {
    const main = add('lead'); seat(main, 'main');
    const r = await V(b).prompt(main, { name: 'worker', text: 'task' });
    const w = by(r.name); await gotUnit(w);
    const d = await done(b, w, 'ok', 'x');
    const dz = by(d.flow.find((x) => x.seat === 'docs').to); await gotUnit(dz);
    const n0 = casts(b);
    await done(b, dz, 'ok', 'docs done');
    assert.ok(casts(b) > n0);
    const c = F().graph()[ws.key].cases.find((x) => x.id === r.unit.caseId);
    assert.deepEqual(c.reports.map((x) => `${x.seat} ${x.result} ${x.line} ${x.escalated}`), ['docs ok null false']);
  } finally { await stop(); }
});
