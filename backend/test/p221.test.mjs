// P221 단위 시험: rig 2의 R2 고리(docs research rig2-design.md 2·3·4·5절, 11.3·11.4의 2번)와 R1 후속(11.5의 2·5).
// loops 해석과 v1·loops 없는 v2의 그대로 읽기, rig check의 고리 검사, request·every 계기로 회 열림(고리 소속), 회 이름 뽑기와 고치기(권한),
// 고리 상태·다음 실행, 멈추기·잇기(고리·회, 권한, 일하는 세션 안 끊음, blocked와 글 가름), 장부 kind, rig.map·status의 고리, 바로가기 견본 둘,
// doc_changed의 data.basis 넷, doc_stale 한 번. 가짜 판은 p219 틀(진짜 저장소·전달 대기열·Branch·Rig, 가짜 에이전트)
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
import { Rig, validateRig } from '../src/rig.mjs';
import { RIG_EVENT_KINDS } from '../src/rig-ledger.mjs';
import { RigMap } from '../src/rig-map.mjs';
import { RigDocs, basisOf, changerLabel, HUMAN_GUESS, DOC_BASES } from '../src/rig-docs.mjs';
import { RIG_ADMIN_OPS } from '../src/rig-admin.mjs';
import { runNameOf, cleanRunName, LOOP_STATES, rigLoopHandlers, implicitCycleLoop } from '../src/rig-loops.mjs';
import { HUMAN_FROM } from '../src/rig-templates.mjs';
import { VERBS } from '../src/cli-contract.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FX = path.join(HERE, 'fixtures');
const GROW = path.join(FX, 'rig-loops-grow');
const CHECK = path.join(FX, 'rig-loops-check');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p221-'));
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 5000) { const t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > ms) throw new Error('until: 시간 초과'); await tick(10); } }
const defOf = (dir) => JSON.parse(fs.readFileSync(path.join(dir, '.atrium', 'rig.json'), 'utf8'));
const exists = (f) => { try { fs.statSync(f); return true; } catch { return false; } };
const ledger = (b, key, q = {}) => b.store.rigEvents({ ws: key, limit: 10000, ...q });
const kinds = (rows) => rows.map((r) => r.kind);
const DAY = 86400000;
// 고리 셋 견본: main keep(관리자·요청 입구) → worker fresh, worker ok → main. retro: 7d 개선 고리
const flowDef = () => ({
  version: 2, results: ['ok', 'failed'],
  seats: { main: { launcher: 'claude', session: 'keep' }, worker: { launcher: 'claude', session: 'fresh', max_live: 2 }, other: { launcher: 'claude', session: 'keep' } },
  loops: {
    work: { kind: 'work', trigger: { request: 'main' }, entry: 'main', flow: [{ from: 'main', on: 'assign', to: 'worker' }, { from: 'worker', on: 'ok', to: 'main' }] },
    side: { kind: 'work', trigger: { request: 'other' }, entry: 'other' },
    retro: { kind: 'improve', trigger: { every: '7d' }, entry: 'main' },
  },
  manager: 'main',
});

// ---------- 가짜 판(p219 틀) ----------
async function board({ dir = tmp(), from = GROW, def = null, enable = true, batchMs = 40 } = {}) {
  fs.cpSync(from, dir, { recursive: true });
  if (def) { const f = path.join(dir, '.atrium', 'rig.json'); fs.writeFileSync(f, JSON.stringify(def, null, 2)); const t = new Date(Date.now() + Math.floor(Math.random() * 100000)); fs.utimesSync(f, t, t); }
  const store = new Store(path.join(dir, 'board.db'));
  const ws = await workspaceOf(dir);
  if (!store.getWorkspace(ws.key)) store.insertWorkspace({ ...ws, createdAt: 1 });
  const cfg = { profile: 'dev', terminalSession: 'atrium-dev-p221test', port: 0, dataDir: dir, sessionsDir: path.join(dir, 'sessions'), inputQuietMs: 3000, submitConfirmMs: 3000, deliveryMaxWaitMs: 60000, submitRetries: 0, rigCycles: false };
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
  b.rigDocs = new RigDocs(b, { pollMs: 50 });
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
  const L = () => b.branch.flow.loops;
  const seat = (s, name) => F().setSeat(s, name);
  const by = (name) => [...b.sessions.values()].find((x) => x.name === name);
  return { b, dir, ws, add, F, L, seat, by, stop: async () => { b.stopped = true; b.queue.stop(); b.branch.notices.stop(); b.branch.units.stops.stop(); F().stopCycles(); await tick(200); store.close(); } };
}
const U = (b) => b.branch.units;
const human = { kind: 'human' };
const local = { auth: { kind: 'local' } };
const V = (b) => b.branch.verbs;
const gotUnit = (s) => until(() => s.texts.some((t) => t.includes('[Atrium 보드] 관계:')));

// ---------- 회 이름 ----------
test('P221 회 이름: 첫 요청의 첫 줄에서 규칙으로(판 알림 줄·꾸밈·끝 문장부호를 떼고 40자에서 낱말 경계)', () => {
  assert.equal(runNameOf('보고서 표 3을 고쳐 줘.\n자세한 것은…'), '보고서 표 3을 고쳐 줘');
  assert.equal(runNameOf('[Atrium 보드] 관계: x\n\n## 주간 점검: CI 실패 정리'), '주간 점검: CI 실패 정리');
  assert.equal(runNameOf('@main **이번 주 회의록** 요약'), '이번 주 회의록 요약');
  assert.equal(runNameOf('- "새 글 초안"'), '새 글 초안');
  const long = 'Translate the onboarding guide chapter seven into Korean and keep the glossary';
  const n = runNameOf(long);
  assert.ok(n.length <= 41 && n.endsWith('…') && !/\s…$/.test(n), n);
  assert.ok(long.startsWith(n.slice(0, -1)));
  assert.equal(runNameOf('\n\n   \n'), null);
  assert.equal(runNameOf('\x60\x60\x60\ncode\n\x60\x60\x60'), 'code');
  assert.equal(cleanRunName('  두   칸  '), '두 칸');
  assert.throws(() => cleanRunName(''), (e) => e.code === 'bad_request');
  assert.throws(() => cleanRunName('x'.repeat(81)), (e) => e.code === 'bad_request');
  assert.throws(() => cleanRunName('[Atrium 보드] 가짜'), (e) => e.code === 'bad_request');
});

// ---------- 정의 ----------
test('P221 loops 해석: 바로가기 견본 둘이 맞고, 고리마다 계기·입구·줄·쥔 문서·받기만 하는 칸 경고', () => {
  const g = validateRig(defOf(GROW), { root: GROW, exists });
  assert.ok(g.ok, g.reason);
  const L = g.def.loops;
  assert.deepEqual(Object.keys(L), ['work', 'retro']);
  assert.deepEqual(L.work.trigger, { type: 'request', seat: 'main' });
  assert.equal(L.work.entry, 'main'); assert.equal(L.work.implicit, false);
  assert.equal(L.retro.kind, 'improve'); assert.equal(L.retro.trigger.every, '7d'); assert.equal(L.retro.trigger.everyMs, 7 * DAY); assert.equal(L.retro.trigger.notify, 'main');
  assert.deepEqual(L.retro.holds, ['corrections'], 'docs.corrections.owner retro → retro가 쥔다');
  assert.equal(L.retro.approve, 'human'); assert.deepEqual(L.retro.produces, ['proposals']);
  assert.ok(g.def.warnings.some((w) => /approve\(human\)는 R6/.test(w)) && g.def.warnings.some((w) => /produces\(proposals\)는 R5/.test(w)));
  assert.ok(!g.def.warnings.some((w) => /R2/.test(w)), 'owner는 이제 고리 이름이다(R2 받기만 경고 없음)');
  assert.equal(g.def.seats.main.session, 'keep');
  const c = validateRig(defOf(CHECK), { root: CHECK, exists });
  assert.ok(c.ok, c.reason);
  assert.deepEqual(Object.keys(c.def.loops), ['check']);
  assert.equal(c.def.loops.check.trigger.every, '7d'); assert.equal(c.def.seats.checker.session, 'fresh');
  assert.deepEqual(c.def.loops.check.holds, ['check-log']);
  assert.ok(/reports\//.test(c.def.loops.check.task));
  // 줄 번호: 고리 차례대로 이어 붙인다
  const f = validateRig(flowDef(), {});
  assert.ok(f.ok, f.reason);
  assert.deepEqual(f.def.flow.map((l) => [l.index, l.from, l.on]), [[0, 'main', 'assign'], [1, 'worker', 'ok']]);
  assert.deepEqual(f.def.loops.work.lines, [0, 1]); assert.deepEqual(f.def.loops.side.lines, []);
});

test('P221 v1과 loops 없는 v2는 그대로 돈다: seats+flow = 작업 고리 work(implicit), cycles[i] = 개선 고리 improve(-n)', () => {
  const v1root = path.join(FX, 'rig-flow-sample');
  const r1 = validateRig(defOf(v1root), { root: v1root });
  assert.ok(r1.ok, r1.reason);
  assert.equal(r1.def.flow.length, 4, '흐름 줄 그대로');
  assert.deepEqual(Object.keys(r1.def.loops), ['work', 'improve']);
  assert.equal(r1.def.loops.work.implicit, true); assert.equal(r1.def.loops.work.entry, 'main'); assert.deepEqual(r1.def.loops.work.lines, [0, 1, 2, 3]);
  assert.equal(r1.def.loops.improve.cycle, 0); assert.equal(r1.def.loops.improve.entry, 'main'); assert.equal(r1.def.loops.improve.trigger.every, '1h');
  const two = defOf(v1root); two.cycles.push({ every: '2h', to: 'worker' });
  assert.deepEqual(Object.keys(validateRig(two, { root: v1root }).def.loops), ['work', 'improve', 'improve-2']);
  assert.equal(implicitCycleLoop(1), 'improve-2');
  const v2root = path.join(FX, 'rig-docs-sample');
  const r2 = validateRig(defOf(v2root), { root: v2root, exists });
  assert.ok(r2.ok, r2.reason);
  assert.deepEqual(Object.keys(r2.def.loops), ['work', 'improve']);
  assert.equal(r2.def.loops.work.entry, 'keeper', 'manager가 입구');
  // 자리 없는 rig(훅만)는 고리가 없다
  assert.deepEqual(validateRig({ hooks: [] }, {}).def.loops, {});
});

test('P221 rig check의 고리 검사: 없는 자리·문서, 입구가 흐름에 없음, 같은 자리가 request 고리 둘의 입구, fresh 입구, 줄 번호 까닭, 다른 칸과 섞기', () => {
  const bad = (mut, re) => { const raw = flowDef(); mut(raw); const r = validateRig(raw, {}); assert.equal(r.ok, false, `통과하면 안 된다: ${re}`); assert.match(r.reason, re); };
  bad((d) => { d.loops.work.trigger = { request: 'nobody' }; }, /loops\.work\.trigger\.request가 없는 자리/);
  bad((d) => { d.loops.retro.entry = 'nobody'; }, /loops\.retro\.entry가 없는 자리/);
  bad((d) => { delete d.loops.retro.entry; }, /loops\.retro\.entry\(입구 자리\)가 필요하다/);
  bad((d) => { d.loops.work.entry = 'other'; d.loops.work.trigger = { request: 'other' }; delete d.loops.side; }, /입구 자리 other가 이 고리의 flow 줄에 없다/);
  bad((d) => { d.loops.side.trigger = { request: 'main' }; d.loops.side.entry = 'main'; }, /이미 request 고리 work의 입구/);
  bad((d) => { d.loops.side.trigger = { request: 'worker' }; d.loops.side.entry = 'worker'; }, /request 계기의 입구 자리\(worker\)는 keep/);
  bad((d) => { d.loops.work.trigger = { request: 'main', every: '1d' }; }, /하나만/);
  bad((d) => { d.loops.retro.trigger = { every: 'weekly' }; }, /every는 "7d"/);
  bad((d) => { d.loops.retro.trigger = { every: '10m' }; }, /60분 이상/);
  bad((d) => { d.loops.retro.kind = 'review'; }, /kind는 work 또는 improve/);
  bad((d) => { d.loops.retro.holds = ['ghost']; }, /holds에 docs에 없는 문서/);
  bad((d) => { d.loops.work.flow[0].to = 'ghost'; }, /loops\.work\.flow\[0\]\.to가 없는 자리/);
  bad((d) => { d.flow = []; }, /flow 줄은 고리 안/);
  bad((d) => { d.cycles = [{ every: '7d', to: 'main' }]; }, /cycles 대신 개선 고리/);
  bad((d) => { delete d.version; }, /loops는 rig 2 칸/);
  bad((d) => { d.loops = { 'Bad Name': { kind: 'work', trigger: { request: 'main' } } }; }, /고리 이름은/);
  bad((d) => { d.loops.retro.approve = 'boss'; }, /approve는 human, manager, none/);
  const g = defOf(GROW); g.docs.corrections.owner = 'nowhere';
  const r = validateRig(g, { root: GROW, exists }); assert.equal(r.ok, false); assert.match(r.reason, /owner가 없는 고리/);
  const p = defOf(GROW); p.loops.retro.produces = ['rules'];
  assert.match(validateRig(p, { root: GROW, exists }).reason, /produces는 role "sector"/);
  // event 계기는 받기만(경고), 고리 상태는 쉼
  const e = flowDef(); e.loops.retro.trigger = { event: 'doc_changed' };
  const re = validateRig(e, {}); assert.ok(re.ok, re.reason); assert.ok(re.def.warnings.some((w) => /event는 R2 뒤의 계기라 받기만/.test(w)));
});

// ---------- 판: request 계기 ----------
test('P221 request: 사람의 요청이 입구 자리에 새 회를 연다(고리·이름·사람의 일), 회를 쥔 동안의 글은 이어지는 지시, done이면 회가 끝나고 다음 요청은 새 회', async () => {
  const { b, ws, add, L, seat, stop } = await board();
  try {
    const main = add('main'); seat(main, 'main');
    const out = L().onRequest(main, human, '보고서 표 3의 숫자를 고쳐 줘.\n자료는 data/로');
    assert.ok(out && out.made && out.caseId, '새 회');
    assert.equal(out.loop, 'work'); assert.equal(out.name, '보고서 표 3의 숫자를 고쳐 줘');
    const c = b.store.getCase(out.caseId);
    assert.equal(c.loop, 'work'); assert.equal(c.name, '보고서 표 3의 숫자를 고쳐 줘'); assert.equal(c.nameBy, 'auto'); assert.equal(c.owner, main.sessionId, '입구 세션이 주인');
    const u = b.store.getUnit(out.made.unit.id);
    assert.equal(u.from, HUMAN_FROM); assert.equal(u.caseId, c.id); assert.equal(u.seat, 'main'); assert.equal(u.origin, 'request');
    await gotUnit(main);
    assert.match(main.texts.find((t) => t.includes('[Atrium 보드] 관계:')), /work 고리의 요청\(사람\)이 연 회/);
    const rows = ledger(b, ws.key, { case: c.id }).filter((r) => r.caseId === c.id);
    assert.deepEqual(kinds(rows).slice(0, 4), ['case_open', 'run_named', 'loop_trigger', 'try_start']);
    assert.equal(rows[0].data.loop, 'work'); assert.equal(rows[0].data.trigger, 'request'); assert.equal(rows[0].actor, 'human');
    assert.equal(rows[2].value, 'request'); assert.equal(rows[2].data.from, 'human'); assert.equal(rows[2].toSeat, 'main');
    // 회를 쥔 동안: 이어지는 지시(null → 보통 글)
    assert.equal(L().onRequest(main, human, '아 그리고 표 4도'), null);
    const r = await U(b).doneVerb(main, { result: 'ok', text: '고쳤다' });
    assert.equal(r.claimedBy, 'human');
    assert.equal(b.store.getCase(c.id).state, 'done', '열린 일이 없으면 회가 끝난다');
    const next = L().onRequest(main, human, '두 번째 요청');
    assert.notEqual(next.caseId, c.id); assert.equal(b.store.getCase(next.caseId).name, '두 번째 요청');
    // 입구가 아닌 자리·자리 없는 세션·rig 꺼짐은 지금 그대로(null)
    const plain = add('plain');
    assert.equal(L().onRequest(plain, human, 'x'), null);
  } finally { await stop(); }
});

test('P221 request: rig 밖 세션의 atrium prompt <입구 세션>은 새 회(그 세션에게 보고), loops 없는 정의는 지금 그대로(자리의 첫 맡기기가 건을 연다)', async () => {
  const { b, add, seat, stop } = await board();
  try {
    const main = add('main'); seat(main, 'main');
    const lead = add('lead');
    const res = await V(b).prompt(lead, { name: 'main', text: '용어집을 정리해라' });
    assert.ok(res.unit && res.unit.caseId, res);
    assert.equal(res.unit.loop, 'work'); assert.equal(res.unit.name, '용어집을 정리해라');
    const c = b.store.getCase(res.unit.caseId);
    assert.equal(c.owner, main.sessionId);
    assert.equal(b.store.getUnit(res.unit.id).from, lead.sessionId, '보고는 보낸 세션에게');
    await gotUnit(main);
    await U(b).doneVerb(main, { result: 'ok', text: '정리 끝' });
    await until(() => lead.texts.some((t) => t.includes('정리 끝')));
    assert.equal(b.store.getCase(c.id).state, 'done');
  } finally { await stop(); }
  // loops 없는 v2: 사람의 글은 회를 열지 않는다
  const t2 = await board({ from: path.join(FX, 'rig-docs-sample') });
  try {
    const k = t2.add('keeper'); t2.seat(k, 'keeper');
    assert.equal(t2.L().onRequest(k, human, '아무 글'), null);
    assert.equal(t2.b.store.casesOf(t2.ws.key).length, 0);
  } finally { await t2.stop(); }
});

test('P221 loops 없는 정의의 건도 고리(work)와 이름(첫 맡김 글)을 쥔다', async () => {
  const dir = tmp();
  const t = await board({ dir, def: { version: 2, results: ['ok', 'failed'], seats: { main: { launcher: 'claude', session: 'keep' }, worker: { launcher: 'claude', session: 'fresh' } }, flow: [{ from: 'main', on: 'assign', to: 'worker' }, { from: 'worker', on: 'ok', to: 'main' }], manager: 'main' } });
  try {
    const main = t.add('main'); t.seat(main, 'main');
    const r = await V(t.b).prompt(main, { name: 'worker', text: '## 첫 장 번역\n본문' });
    const c = t.b.store.getCase(r.unit.caseId);
    assert.equal(c.loop, 'work'); assert.equal(c.name, '첫 장 번역');
  } finally { await t.stop(); }
});

// ---------- 판: every 계기 ----------
test('P221 every: 판이 주기를 지켜 입구 자리에 회를 연다(fresh는 보드가 띄움), 끝나지 않은 회가 있으면 건너뛰고, 다음 실행을 적는다', async () => {
  const { b, ws, L, by, stop } = await board({ from: CHECK });
  try {
    const t0 = Date.now();
    assert.deepEqual(await L().tick(t0), [], '처음은 다음 시각만 잡는다');
    let v = L().view(ws.key, b.rig.active(ws.key).def)[0];
    assert.equal(v.state, 'waiting'); assert.equal(v.nextAt, t0 + 7 * DAY);
    assert.equal(ledger(b, ws.key, { kinds: ['loop_next'] }).length, 1);
    assert.deepEqual(await L().tick(t0 + DAY), [], '때가 아니다');
    const fired = await L().tick(t0 + 7 * DAY + 1);
    assert.equal(fired.length, 1);
    const f = fired[0];
    assert.equal(f.loop, 'check'); assert.equal(f.spawned, true); assert.match(f.to, /^checker-\d+$/);
    const c = b.store.getCase(f.caseId);
    assert.equal(c.loop, 'check'); assert.match(c.name, /^check \d{4}-\d\d-\d\d \d\d:\d\d$/);
    const s = by(f.to);
    assert.equal(s.rigSeat, 'checker');
    assert.equal(b.spawned.at(-1).parentSessionId, undefined, '위 세션 없이 띄운다');
    await gotUnit(s);
    const first = s.texts.find((x) => x.includes('[Atrium 보드] 관계:'));
    assert.match(first, /check 고리\(7d마다\)가 연 회/); assert.match(first, /Weekly check/); assert.match(first, /check-log\(ledger\/checks\.jsonl\)/);
    const trig = ledger(b, ws.key, { kinds: ['loop_trigger'] });
    assert.equal(trig.length, 1); assert.equal(trig[0].value, 'every'); assert.equal(trig[0].actor, 'cycle'); assert.equal(trig[0].caseId, c.id);
    v = L().view(ws.key, b.rig.active(ws.key).def)[0];
    assert.equal(v.state, 'running'); assert.equal(v.lastRun.id, c.id); assert.equal(v.nextAt, t0 + 14 * DAY + 1);
    // 다음 때에 회가 아직 돌면 건너뛴다(loop_skip running, 다음 시각은 한 주기 뒤)
    assert.deepEqual(await L().tick(t0 + 14 * DAY + 2), []);
    const skip = ledger(b, ws.key, { kinds: ['loop_skip'] });
    assert.equal(skip.length, 1); assert.equal(skip[0].value, 'running');
    assert.equal(L().view(ws.key, b.rig.active(ws.key).def)[0].nextAt, t0 + 21 * DAY + 2);
    await U(b).doneVerb(s, { result: 'ok', text: 'reports/2026-w47.md' });
    assert.equal(b.store.getCase(c.id).state, 'done');
    const again = await L().tick(t0 + 21 * DAY + 3);
    assert.equal(again.length, 1); assert.notEqual(again[0].to, f.to, 'fresh: 회마다 새 세션');
  } finally { await stop(); }
});

test('P221 every(keep 입구): 앉은 세션이 없으면 열지 않고 한 번 적는다. 개선 고리의 일은 장부 요약, notify 자리에 알림', async () => {
  const def = flowDef(); def.loops.retro.trigger.notify = 'other';
  const { b, ws, add, L, seat, stop } = await board({ def });
  try {
    const t0 = Date.now();
    await L().tick(t0);
    assert.deepEqual(await L().tick(t0 + 7 * DAY + 1), []);
    assert.deepEqual(await L().tick(t0 + 7 * DAY + 2), []);
    const sk = ledger(b, ws.key, { kinds: ['loop_skip'] });
    assert.equal(sk.length, 1); assert.equal(sk[0].value, 'no_session');
    const main = add('main'); seat(main, 'main');
    const other = add('other'); seat(other, 'other');
    const f = await L().tick(t0 + 7 * DAY + 3);
    assert.equal(f.length, 1); assert.equal(f[0].loop, 'retro'); assert.equal(f[0].to, 'main');
    await gotUnit(main);
    const txt = main.texts.find((x) => x.includes('[Atrium 보드] 관계:'));
    assert.match(txt, /retro 고리\(7d마다\)가 연 회/); assert.match(txt, /## 건 결과/);
    await until(() => other.texts.some((x) => /rig 고리 retro\(7d마다\)의 회 c[0-9a-f]+ "retro /.test(x)));
  } finally { await stop(); }
});

test('P221 loops 없는 정의의 cycles는 개선 고리 improve로 돈다(rig_cycles 그대로, 회에 고리와 이름)', async () => {
  const { b, ws, add, F, L, seat, stop } = await board({ from: path.join(FX, 'rig-docs-sample') });
  try {
    const k = add('keeper'); seat(k, 'keeper');
    const t0 = Date.now();
    await F().cycleTick(t0);
    const fired = await F().cycleTick(t0 + 7 * DAY + 1);
    assert.equal(fired.length, 1);
    const c = b.store.getCase(fired[0].caseId);
    assert.equal(c.loop, 'improve'); assert.match(c.name, /^improve \d{4}-/);
    const v = L().view(ws.key, b.rig.active(ws.key).def).find((x) => x.name === 'improve');
    assert.equal(v.implicit, true); assert.equal(v.state, 'running'); assert.equal(v.nextAt, t0 + 14 * DAY + 1);
  } finally { await stop(); }
});

// ---------- 멈추기·잇기 ----------
test('P221 고리 멈추기: 새 요청은 회를 열지 않고 줄에 서고(loop_skip), 일하는 세션은 그대로, 잇기에 그 차례대로 회가 열린다', async () => {
  const { b, ws, add, L, seat, stop } = await board();
  try {
    const main = add('main'); seat(main, 'main');
    const p = L().pause(ws.key, 'work', { by: 'human' });
    assert.equal(p.paused, true); assert.equal(p.loop, 'work');
    assert.equal(L().pause(ws.key, 'work').already, true);
    assert.equal(L().view(ws.key, b.rig.active(ws.key).def).find((x) => x.name === 'work').state, 'paused');
    const h1 = L().onRequest(main, human, '첫 요청');
    const h2 = L().onRequest(main, human, '둘째 요청');
    assert.equal(h1.held, true); assert.equal(h2.held, true);
    assert.equal(b.store.casesOf(ws.key).length, 0, '회가 열리지 않았다');
    assert.equal(L().view(ws.key, b.rig.active(ws.key).def).find((x) => x.name === 'work').held, 2);
    assert.deepEqual(ledger(b, ws.key, { kinds: ['loop_paused', 'loop_skip'] }).map((r) => [r.kind, r.value]), [['loop_paused', 'work'], ['loop_skip', 'paused'], ['loop_skip', 'paused']]);
    const r = await L().resume(ws.key, 'work', { by: 'human' });
    assert.equal(r.opened.length, 2);
    assert.deepEqual(r.opened.map((x) => x.name), ['첫 요청', '둘째 요청']);
    assert.equal(L().view(ws.key, b.rig.active(ws.key).def).find((x) => x.name === 'work').held, 0);
    assert.equal(ledger(b, ws.key, { kinds: ['loop_resumed'] }).length, 1);
    const trig = ledger(b, ws.key, { kinds: ['loop_trigger'] });
    assert.equal(trig.length, 2); assert.ok(trig.every((x) => x.data.held != null), '줄에 섰던 요청');
    // 두 회의 일은 입구 세션에 차례로(둘째는 첫째가 닫힐 때까지 붙잡힌다)
    await gotUnit(main);
    await U(b).doneVerb(main, { result: 'ok', text: '첫째 끝' });
    await until(() => main.texts.filter((t) => t.includes('[Atrium 보드] 관계:')).length === 2);
  } finally { await stop(); }
});

test('P221 every 고리 멈춤: 때가 지나도 열지 않고(한 번 적음), 다음 시각은 그대로라 잇기 뒤 한 번 돈다', async () => {
  const { b, ws, L, stop } = await board({ from: CHECK });
  try {
    const t0 = Date.now();
    await L().tick(t0);
    L().pause(ws.key, 'check');
    assert.deepEqual(await L().tick(t0 + 8 * DAY), []);
    assert.deepEqual(await L().tick(t0 + 9 * DAY), []);
    assert.deepEqual(ledger(b, ws.key, { kinds: ['loop_skip'] }).map((r) => r.value), ['paused']);
    assert.equal(L().view(ws.key, b.rig.active(ws.key).def)[0].nextAt, t0 + 7 * DAY);
    await L().resume(ws.key, 'check');
    const f = await L().tick(t0 + 9 * DAY + 1);
    assert.equal(f.length, 1);
    assert.equal(L().view(ws.key, b.rig.active(ws.key).def)[0].nextAt, t0 + 16 * DAY + 1);
  } finally { await stop(); }
});

test('P221 회 멈추기: 그 회의 새 넘김만 막고(붙잡음) 일하는 세션은 끊지 않는다. 자리의 맡기기는 rig_paused(막힘과 다른 글). 잇기가 붙잡은 넘김을 넘긴다', async () => {
  const { b, ws, add, L, seat, by, stop } = await board({ def: flowDef() });
  try {
    const main = add('main'); seat(main, 'main');
    const o = L().onRequest(main, human, '두 장 번역');
    await gotUnit(main);
    const a1 = await V(b).prompt(main, { name: 'worker', text: '1장 번역' });
    assert.equal(a1.unit.caseId, o.caseId, '회를 잇는다');
    const w1 = by(a1.name);
    await gotUnit(w1);
    const other = L().onRequest(add('x2'), human, 'y'); assert.equal(other, null);
    const p = L().pause(ws.key, o.caseId, { by: 'human' });
    assert.equal(p.case, o.caseId); assert.equal(p.name, '두 장 번역');
    const sentBefore = b.sent.filter((x) => x.sid === w1.sessionId).length;
    // 일하는 세션은 그대로: 열린 시도가 남고 아무 글도 가지 않는다
    assert.ok(b.store.openTryOf(w1.sessionId));
    // 멈춘 회에 새 맡기기는 거절(막힘이 아니라 멈춤 글)
    await assert.rejects(V(b).prompt(main, { name: 'worker', text: '2장 번역' }), (e) => e.code === 'rig_paused' && /멈춰 있다/.test(e.message) && /막힌 것이 아니다/.test(e.message) && /atrium rig resume/.test(e.message));
    // worker done ok → main 줄은 붙잡힌다(회는 열린 채, 주인 보고 없음)
    const reportsBefore = main.texts.length;
    const d = await U(b).doneVerb(w1, { result: 'ok', text: '1장 끝' });
    assert.equal(d.claimedBy, 'flow');
    const c1 = b.store.getCase(o.caseId);
    assert.equal(c1.held.length, 1); assert.equal(c1.state, 'open');
    await tick(100);
    assert.equal(main.texts.length, reportsBefore, '주인에게 아직 보고가 가지 않았다');
    assert.equal(b.sent.filter((x) => x.sid === w1.sessionId).length, sentBefore);
    const held = ledger(b, ws.key, { kinds: ['loop_skip'] }).at(-1);
    assert.equal(held.value, 'paused'); assert.equal(held.data.held, 'handoff');
    // status: 멈춤은 막힘과 가른다
    const st = await b.branch.rigAdmin.run(ws.key, 'status');
    const run = st.runs.find((x) => x.id === o.caseId);
    assert.equal(run.state, 'open'); assert.deepEqual([run.paused.by, run.held], ['run', 1]); assert.equal(run.blockedReason, null);
    const r = await L().resume(ws.key, o.caseId, { by: 'human' });
    assert.equal(r.released, 1);
    await until(() => main.texts.some((t) => t.includes('1장 끝')));
    assert.equal(b.store.getCase(o.caseId).held.length, 0);
    assert.deepEqual(kinds(ledger(b, ws.key, { kinds: ['run_paused', 'run_resumed'] })), ['run_paused', 'run_resumed']);
  } finally { await stop(); }
});

test('P221 고리 멈춤은 자리 줄 띄우기도 막는다(max_live에 선 일은 잇기 뒤에 띄운다)', async () => {
  const def = flowDef(); def.seats.worker.max_live = 1;
  const { b, ws, add, F, L, seat, stop } = await board({ def });
  try {
    const main = add('main'); seat(main, 'main');
    L().onRequest(main, human, '두 일'); await gotUnit(main);
    const a1 = await V(b).prompt(main, { name: 'worker', text: '일 하나' });
    const a2 = await V(b).prompt(main, { name: 'worker', text: '일 둘' });
    assert.equal(a2.unit.seatWait, true);
    L().pause(ws.key, 'work');
    const w1 = [...b.sessions.values()].find((s) => s.name === a1.name);
    await gotUnit(w1);
    const n0 = b.spawned.length;
    await U(b).doneVerb(w1, { result: 'failed', text: '못 함' }); // 맞는 줄 없음 → 자리 줄이 비지만 멈춤이라 띄우지 않는다
    await F().pump(); await tick(50);
    assert.equal(b.spawned.length, n0, '멈춘 동안 띄우지 않는다');
    await L().resume(ws.key, 'work');
    await until(() => b.spawned.length === n0 + 1);
  } finally { await stop(); }
});

test('P221 권한: pause·resume은 관리자 자리와 사람, name은 관리자 자리·회의 주인·사람, status는 누구나. 판 API rig.pause는 기기도, rig.resume·rig.name은 이 PC만', async () => {
  const { b, ws, add, L, seat, stop } = await board({ def: flowDef() });
  try {
    const main = add('main'); seat(main, 'main');
    const other = add('other'); seat(other, 'other');
    const plain = add('plain');
    const A = b.branch.rigAdmin;
    for (const op of ['status', 'pause', 'resume', 'name']) assert.ok(RIG_ADMIN_OPS.includes(op));
    await assert.rejects(A.verb(other, { op: 'pause', target: 'work' }), (e) => e.code === 'forbidden');
    await assert.rejects(A.verb(plain, { op: 'resume', target: 'work' }), (e) => e.code === 'forbidden');
    const st = await A.verb(plain, { op: 'status' });
    assert.deepEqual(st.loops.map((l) => l.name), ['work', 'side', 'retro']);
    const p = await A.verb(main, { op: 'pause', target: 'side' });
    assert.equal(p.paused, true);
    const ev = ledger(b, ws.key, { kinds: ['loop_paused'] }).at(-1);
    assert.equal(ev.actor, 'agent'); assert.equal(ev.seat, 'main'); assert.equal(ev.data.by, 'manager');
    await A.verb(main, { op: 'resume', target: 'side' });
    // 회 이름: 주인(other의 회)은 고치고, 다른 자리는 못 고친다. 관리자 자리는 고친다
    const o = L().onRequest(other, human, '옆 일');
    await assert.rejects(A.verb(plain, { op: 'name', caseId: o.caseId, name: '남의 회' }), (e) => e.code === 'forbidden');
    const n1 = await A.verb(other, { op: 'name', caseId: o.caseId, name: '옆 일(고침)' });
    assert.equal(n1.by, 'owner'); assert.equal(b.store.getCase(o.caseId).name, '옆 일(고침)'); assert.equal(b.store.getCase(o.caseId).nameBy, 'owner');
    const n2 = await A.verb(main, { op: 'name', caseId: o.caseId, name: '관리자가 고침' });
    assert.equal(n2.by, 'manager'); assert.equal(n2.before, '옆 일(고침)');
    const named = ledger(b, ws.key, { kinds: ['run_named'] }).filter((r) => r.caseId === o.caseId);
    assert.deepEqual(named.map((r) => r.value), ['auto', 'owner', 'manager']);
    // 판 API
    const H = rigLoopHandlers(b);
    const dev = { auth: { kind: 'device' } };
    const pz = await H['rig.pause']({ workspace: ws.key, target: 'work' }, dev);
    assert.equal(pz.by, 'remote');
    await assert.rejects(H['rig.resume']({ workspace: ws.key, target: 'work' }, dev), (e) => e.code === 'forbidden');
    await assert.rejects(H['rig.pause']({ workspace: ws.key, target: 'work' }, { auth: { kind: 'session' } }), (e) => e.code === 'forbidden');
    await H['rig.resume']({ workspace: ws.key, target: 'work' }, local);
    const nm = await H['rig.name']({ workspace: ws.key, case: o.caseId, name: '사람이 고침' }, local);
    assert.equal(nm.by, 'human');
    await assert.rejects(H['rig.name']({ workspace: ws.key, case: o.caseId, name: 'x' }, dev), (e) => e.code === 'forbidden');
    const lv = await H['rig.loops']({ workspace: ws.key }, dev);
    assert.ok(lv.loops.every((l) => LOOP_STATES.includes(l.state)));
    assert.throws(() => L().pause(ws.key, 'nope'), (e) => e.code === 'not_found');
    await assert.rejects(L().resume(ws.key, 'cnope'), (e) => e.code === 'not_found');
  } finally { await stop(); }
});

test('P221 고리 상태와 rig.status·rig.map: 돎·기다림·멈춤·쉼, 마지막 회, 회 이름과 멈춤이 지도에', async () => {
  const { b, ws, add, L, seat, stop } = await board({ def: flowDef() });
  try {
    const def = () => b.rig.active(ws.key).def;
    let v = L().view(ws.key, def());
    assert.deepEqual(v.map((l) => [l.name, l.state, l.why]), [['work', 'idle', 'no_session'], ['side', 'idle', 'no_session'], ['retro', 'idle', 'no_session']], 'keep 입구에 앉은 세션이 없으면 쉼');
    const main = add('main'); seat(main, 'main');
    v = L().view(ws.key, def());
    assert.deepEqual(v.map((l) => l.state), ['waiting', 'idle', 'waiting']);
    const o = L().onRequest(main, human, '지도 시험');
    v = L().view(ws.key, def());
    assert.equal(v[0].state, 'running'); assert.equal(v[0].lastRun.name, '지도 시험'); assert.deepEqual(v[0].runs, { live: 1, total: 1 });
    L().pause(ws.key, 'work');
    const s = b.rig.status(ws.key);
    assert.equal(s.loops.find((l) => l.name === 'work').state, 'paused');
    assert.ok(s.loops.find((l) => l.name === 'work').paused.at > 0);
    const m = new RigMap(b).get(ws.key);
    assert.deepEqual(m.loops.map((l) => l.name), ['work', 'side', 'retro']);
    const mc = m.cases.find((c) => c.id === o.caseId);
    assert.equal(mc.name, '지도 시험'); assert.equal(mc.loop, 'work'); assert.equal(mc.paused.by, 'loop');
    await L().resume(ws.key, 'work');
    L().name(ws.key, o.caseId, '지도 시험(고침)', { by: 'human' });
    assert.equal(new RigMap(b).get(ws.key).cases.find((c) => c.id === o.caseId).name, '지도 시험(고침)');
    const st = await b.branch.rigAdmin.run(ws.key, 'status');
    assert.equal(st.runs[0].name, '지도 시험(고침)'); assert.equal(st.runs[0].loop, 'work');
    // atrium me: 회 이름·고리·주인
    const me = b.branch.flow.meOf(main);
    assert.equal(me.case.name, '지도 시험(고침)'); assert.equal(me.case.loop, 'work'); assert.equal(me.owner, true);
  } finally { await stop(); }
});

test('P221 장부 kind와 계약: 고리·회 사건이 닫힌 목록에 있고, rig 동사에 status·pause·resume·name', () => {
  for (const k of ['loop_trigger', 'loop_skip', 'loop_next', 'loop_paused', 'loop_resumed', 'run_paused', 'run_resumed', 'run_named', 'doc_stale']) assert.ok(RIG_EVENT_KINDS.includes(k), k);
  const rig = VERBS.find((v) => v.name === 'rig');
  assert.match(rig.args.join(' '), /status \| pause <고리\|회> \| resume <고리\|회> \| name <회> "<이름>"/);
  assert.ok(rig.out.includes('loops') && rig.out.includes('runs'));
});

// ---------- R1 후속(11.5의 2·5) ----------
test('P221 doc_changed의 data.basis는 넷 가운데 하나, 일하던 에이전트가 없으면 "사람 또는 바깥 프로그램(추정)"', () => {
  assert.deepEqual(DOC_BASES, ['agent_working', 'case_run', 'no_agent_working', 'git_author']);
  assert.equal(basisOf({ by: 'human' }), 'no_agent_working');
  assert.equal(basisOf({ by: 'seat' }, { caseId: null }), 'agent_working');
  assert.equal(basisOf({ by: 'seat' }, { caseId: 'c1' }), 'case_run');
  assert.equal(basisOf({ by: 'hook' }, null), 'agent_working');
  assert.equal(basisOf({ by: 'unknown', signal: 'several_working' }), 'agent_working');
  assert.equal(basisOf({ by: 'unknown', signal: 'while_away' }, null, 'Some Author'), 'git_author');
  assert.equal(basisOf({ by: 'unknown', signal: 'while_away' }), 'no_agent_working');
  assert.equal(changerLabel({ by: 'human', basis: 'no_agent_working' }), HUMAN_GUESS);
  assert.equal(HUMAN_GUESS, '사람 또는 바깥 프로그램(추정)');
  assert.equal(changerLabel({ by: 'unknown', basis: 'git_author', signal: 'while_away' }, 'Some Author'), 'git 커밋 작성자 Some Author(추정)');
  assert.match(changerLabel({ by: 'unknown', basis: 'no_agent_working', signal: 'while_away' }), /보드가 꺼져 있던 동안/);
  assert.equal(changerLabel({ by: 'seat', seat: 'main', name: 'main' }), 'main 자리(@main)');
});

test('P221 판: 사람이 고친 문서는 basis no_agent_working과 "사람 또는 바깥 프로그램(추정)", 회를 쥔 자리가 쓰면 case_run', async () => {
  const { b, ws, dir, add, L, seat, stop } = await board();
  try {
    const D = b.rigDocs;
    const main = add('main'); seat(main, 'main');
    await D.scan();
    const rules = path.join(dir, 'docs', 'rules.txt'); const corr = path.join(dir, 'ledger', 'corrections.jsonl');
    fs.appendFileSync(rules, '- 사람이 더함\n');
    await D.scan();
    let row = ledger(b, ws.key, { kinds: ['doc_changed'] }).at(-1);
    assert.equal(row.data.doc, 'rules'); assert.equal(row.data.basis, 'no_agent_working'); assert.equal(row.data.signal, 'no_agent_working');
    assert.match(row.text, /사람 또는 바깥 프로그램\(추정\)/);
    L().onRequest(main, human, '장부에 적어라');
    await gotUnit(main);
    D.noteToolHook(main, { tool_name: 'Write', tool_input: { file_path: corr } });
    fs.appendFileSync(corr, '{"c":1}\n');
    await D.scan();
    row = ledger(b, ws.key, { kinds: ['doc_changed'] }).at(-1);
    assert.equal(row.data.doc, 'corrections'); assert.equal(row.data.basis, 'case_run'); assert.ok(row.caseId);
  } finally { await stop(); }
});

test('P221 doc_stale: 신선 → 오래됨으로 넘어갈 때 한 줄, 그 문서가 바뀌기 전에는 되풀이하지 않고(판이 다시 떠도), 바뀌면 다시 셈한다', async () => {
  const { b, ws, dir, stop } = await board();
  try {
    const D = b.rigDocs;
    const rules = path.join(dir, 'docs', 'rules.txt'); const facts = path.join(dir, 'docs', 'facts.txt');
    const at = (f, ms) => { const t = new Date(ms); fs.utimesSync(f, t, t); };
    const now = Date.now();
    at(facts, now - 60000); at(rules, now - 120000); // facts가 더 새로움: 신선
    await D.scan(); await D.scan();
    assert.equal(ledger(b, ws.key, { kinds: ['doc_stale'] }).length, 0);
    fs.appendFileSync(rules, '- 규칙 바뀜\n'); at(rules, now - 1000); // rules가 바뀜 → facts 오래됨
    await D.scan(); await D.scan(); await D.scan();
    let st = ledger(b, ws.key, { kinds: ['doc_stale'] });
    assert.equal(st.length, 1, '한 번만');
    assert.equal(st[0].data.doc, 'facts'); assert.equal(st[0].value, 'after_change_of'); assert.match(st[0].text, /facts\(docs\/facts\.txt\)가 오래됐다/);
    // 판이 다시 떠도(새 RigDocs) 같은 서명이면 다시 쓰지 않는다
    const D2 = new RigDocs(b, { pollMs: 50 });
    await D2.scan(); await D2.scan();
    assert.equal(ledger(b, ws.key, { kinds: ['doc_stale'] }).length, 1);
    // facts가 바뀌면 신선, rules가 다시 바뀌면 다시 한 줄
    fs.appendFileSync(facts, '- 사실 더함\n'); at(facts, now);
    await D.scan(); await D.scan();
    assert.equal(ledger(b, ws.key, { kinds: ['doc_stale'] }).length, 1);
    fs.appendFileSync(rules, '- 또 바뀜\n'); at(rules, now + 5000);
    await D.scan(); await D.scan();
    st = ledger(b, ws.key, { kinds: ['doc_stale'] });
    assert.equal(st.length, 2);
  } finally { await stop(); }
});
