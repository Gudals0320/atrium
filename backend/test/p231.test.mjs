// P231 단위 시험: rig2-design 11.13(P230에서 돌아온 것). 올라갈 곳이 상한에 걸린 그 자리 자신이면 사람 카드(올라갈 곳이 다른 자리면 그대로),
// 사람 카드를 기다리는 회에 주인이 --case로 손대면 까닭, 사람이 정하면 주인 세션에 한 번 알림(받음 · 한 번 더 · 멈춤), scoped 셸 줄은 실제로 도는 권한을 따른다.
// 가짜 판은 p230 틀을 그대로 옮겼다
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
import { rigProposalHandlers } from '../src/rig-proposals.mjs';
import { rigSetupHandlers } from '../src/rig-setup.mjs';
import { presetFiles, shortcutAnswers, CHECK_TASK } from '../src/rig-presets.mjs';
import { seatExtraLines, SCOPED_SHELL_LINE, NO_MANAGER_LINE, humanWaitText } from '../src/rig-flow.mjs';
import { buildRigMap } from '../src/rig-map.mjs';
import { rigLoopHandlers } from '../src/rig-loops.mjs';
import { HUMAN_FROM } from '../src/rig-templates.mjs';
import { VERBS } from '../src/cli-contract.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FX = path.join(HERE, 'fixtures');
const GROW = path.join(FX, 'rig-loops-grow');
const CHECK = path.join(FX, 'rig-loops-check');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p231-'));
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 5000) { const t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > ms) throw new Error('until: 시간 초과'); await tick(10); } }
const defOf = (dir) => JSON.parse(fs.readFileSync(path.join(dir, '.atrium', 'rig.json'), 'utf8'));
const exists = (f) => { try { fs.statSync(f); return true; } catch { return false; } };
const ledger = (b, key, q = {}) => b.store.rigEvents({ ws: key, limit: 10000, ...q });
const kinds = (rows) => rows.map((r) => r.kind);
const DAY = 86400000;

// ---------- 가짜 판(p219 틀) ----------
async function board({ dir = tmp(), from = GROW, def = null, enable = true, batchMs = 40 } = {}) {
  fs.cpSync(from, dir, { recursive: true });
  if (def) { const f = path.join(dir, '.atrium', 'rig.json'); fs.writeFileSync(f, JSON.stringify(def, null, 2)); const t = new Date(Date.now() + Math.floor(Math.random() * 100000)); fs.utimesSync(f, t, t); }
  const store = new Store(path.join(dir, 'board.db'));
  const ws = await workspaceOf(dir);
  if (!store.getWorkspace(ws.key)) store.insertWorkspace({ ...ws, createdAt: 1 });
  const cfg = { profile: 'dev', terminalSession: 'atrium-dev-p231test', port: 0, dataDir: dir, sessionsDir: path.join(dir, 'sessions'), inputQuietMs: 3000, submitConfirmMs: 3000, deliveryMaxWaitMs: 60000, submitRetries: 0, rigCycles: false };
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

const done = (b, s, result, text) => U(b).doneVerb(s, { result, text });
const device = { auth: { kind: 'device' } };
// 관리자 자리 없는 rig: main(keep, 요청 입구) ok → reviewer(fresh, scoped), reviewer rejected → main(상한 0, else 없음)
const limitDef = () => ({
  version: 2, results: ['ok', 'failed', 'rejected'],
  seats: { main: { launcher: 'claude', session: 'keep' }, reviewer: { launcher: 'claude', session: 'fresh', max_live: 1, writes: false, permission: 'scoped' } },
  loops: { work: { kind: 'work', trigger: { request: 'main' }, entry: 'main', flow: [{ from: 'main', on: 'ok', to: 'reviewer' }, { from: 'reviewer', on: 'rejected', to: 'main', max: 0 }] } },
});
// 상한 카드까지: 요청 → main ok → reviewer rejected
async function toLimit() {
  const t = await board({ def: limitDef() });
  const main = t.add('main'); t.seat(main, 'main');
  t.L().onRequest(main, human, '짧은 글 하나 써 줘');
  await gotUnit(main);
  await until(() => main.rt.term.status === 'idle');
  await done(t.b, main, 'ok', '썼다');
  await until(() => t.by('reviewer-1'));
  const rv = t.by('reviewer-1'); await gotUnit(rv);
  await until(() => rv.rt.term.status === 'idle');
  const d = await done(t.b, rv, 'rejected', '둘째 문단이 길다');
  const c = t.b.store.getCase(d.case.id);
  return { ...t, main, rv, c };
}
const asks = async (b) => (await rigProposalHandlers(b)['rig.asks']({}, local)).asks;
const decide = (b, id, action, c = local) => rigProposalHandlers(b)['rig.decide']({ id, action }, c);


// 바로가기 keep 정의 꼴: manager = 입구 자리(main). 검토 반려가 상한을 넘으면 main에게 올라간다(= 반려당한 그 자리)
const selfDef = () => ({ ...limitDef(), manager: 'main' });
async function toLimitWith(def) {
  const t = await board({ def });
  const main = t.add('main'); t.seat(main, 'main');
  t.L().onRequest(main, human, '짧은 글 하나 써 줘');
  await gotUnit(main);
  await until(() => main.rt.term.status === 'idle');
  await done(t.b, main, 'ok', '썼다');
  await until(() => t.by('reviewer-1'));
  const rv = t.by('reviewer-1'); await gotUnit(rv);
  await until(() => rv.rt.term.status === 'idle');
  const d = await done(t.b, rv, 'rejected', '둘째 문단이 길다');
  return { ...t, main, rv, c: t.b.store.getCase(d.case.id) };
}
const deliveredTo = (b, s) => b.sent.filter((x) => x.sid === s.sessionId).map((x) => x.text);

// ---------- 1. 스스로에게 올라가는 상한 ----------
test('P231 상한: 올라갈 곳(manager)이 되돌려 받는 그 자리면 사람 카드(run_limit, self). 주인 보고로 올라가지 않는다', async () => {
  const { b, ws, main, c, stop } = await toLimitWith(selfDef());
  try {
    assert.equal(c.state, 'waiting_owner'); assert.equal(c.ownerWait, 'human');
    assert.equal(c.humanAsk.self, 'main'); assert.equal(c.humanAsk.seat, 'reviewer');
    const a = (await asks(b)).find((x) => x.kind === 'run_limit');
    assert.ok(a, 'run_limit 카드'); assert.equal(a.run.self, 'main'); assert.equal(a.run.reason, '둘째 문단이 길다');
    const esc = ledger(b, ws.key, { kinds: ['escalate'] }).at(-1);
    assert.equal(esc.data.human, true); assert.equal(esc.data.self, 'main'); assert.match(esc.text, /그 자리 자신/);
    assert.ok(ledger(b, ws.key, { kinds: ['case_waiting_owner'] }).some((r) => r.value === 'human'));
    assert.equal(ledger(b, ws.key, { kinds: ['case_waiting_owner'] }).some((r) => r.value === 'escalated'), false, '주인 보고(escalated)가 아니다');
    // 주인에게 미리 알리지 않는다(상한 보고도 판 알림도 없다)
    await tick(150);
    assert.equal(deliveredTo(b, main).some((x) => /상한|waiting_owner|사람이 정하는/.test(x)), false);
    assert.equal(b.store.waitingCasesOfOwner(main.sessionId, ws.key).length, 0, '주인의 다음 맡기기가 잇지 않는다');
  } finally { await stop(); }
});

test('P231 상한: else가 반려한 그 자리 자신이어도 사람 카드, else가 다른 자리면 지금처럼 그 자리에게', async () => {
  const selfElse = limitDef(); selfElse.loops.work.flow[1].else = 'reviewer';
  const t1 = await toLimitWith(selfElse);
  try {
    assert.equal(t1.c.ownerWait, 'human'); assert.equal(t1.c.humanAsk.self, 'reviewer');
  } finally { await t1.stop(); }
  const other = limitDef(); other.seats.boss = { launcher: 'claude', session: 'fresh', max_live: 1 }; other.loops.work.flow[1].else = 'boss';
  const t2 = await toLimitWith(other);
  try {
    assert.notEqual(t2.c.ownerWait, 'human');
    await until(() => t2.by('boss-1'));
    const bs = t2.by('boss-1'); await gotUnit(bs);
    assert.ok(bs.texts.some((x) => x.includes('둘째 문단이 길다')), '다른 자리(boss)가 넘김을 받는다');
    assert.equal((await asks(t2.b)).filter((x) => x.kind === 'run_limit').length, 0);
    const esc = ledger(t2.b, t2.ws.key, { kinds: ['escalate'] }).at(-1);
    assert.equal(esc.toSeat, 'boss');
  } finally { await t2.stop(); }
  // manager가 다른 자리(boss, keep)면 그대로 그 자리에게
  const mgr = limitDef(); mgr.seats.boss = { launcher: 'claude', session: 'keep' }; mgr.manager = 'boss';
  const t3 = await toLimitWith(mgr);
  try {
    assert.notEqual(t3.c.ownerWait, 'human');
    assert.equal(ledger(t3.b, t3.ws.key, { kinds: ['escalate'] }).at(-1).toSeat, 'boss');
  } finally { await t3.stop(); }
});

// ---------- 2. 사람 카드가 열린 동안 주인 세션 ----------
test('P231 --case: 사람 카드를 기다리는 회에 주인이 손대면 까닭(사람이 정하는 중, 새 회로 다시 열지 않는다). 회는 그대로', async () => {
  const { b, ws, main, c, F, stop } = await toLimitWith(selfDef());
  try {
    assert.equal(humanWaitText(c.id), `회 ${c.id}은 사람이 정하는 중(응답 필요 카드)이다. 이 회는 기다린다. 같은 일을 새 회로 다시 열지 않는다.`);
    assert.throws(() => F().caseFor(main, ws.key, { caseId: c.id, spec: '다시' }), (e) => e.code === 'rig_case' && e.message === humanWaitText(c.id));
    const c2 = b.store.getCase(c.id);
    assert.equal(c2.state, 'waiting_owner'); assert.equal(c2.ownerWait, 'human');
    // 다른 회(사람 카드가 아님)는 그대로 고른다
    assert.equal(b.store.casesOf(ws.key).length, 1);
  } finally { await stop(); }
});

test('P231 사람이 정하면 주인 세션에 한 번 알린다: 받음 · 한 번 더(주인 보고 머리에 붙여 한 번) · 멈춤', async () => {
  // 받음
  const t1 = await toLimitWith(selfDef());
  try {
    const n0 = deliveredTo(t1.b, t1.main).length;
    await decide(t1.b, `run:${t1.c.id}`, 'accept');
    await until(() => deliveredTo(t1.b, t1.main).length > n0);
    await tick(150);
    const got = deliveredTo(t1.b, t1.main).slice(n0);
    assert.equal(got.length, 1, '한 번');
    assert.match(got[0], /^\[Atrium 보드\] 사람이 회 c[0-9a-f]+\(.+\)의 상한 카드에서 \[그대로 받기\]를 골랐다\. 회는 done이다\(받음\)\.$/);
    assert.equal(t1.b.store.getCase(t1.c.id).state, 'done');
  } finally { await t1.stop(); }
  // 한 번 더: 그 줄이 주인(main)에게 가는 줄이라 주인 보고 하나에 알림 줄을 붙인다
  const t2 = await toLimitWith(selfDef());
  try {
    const n0 = deliveredTo(t2.b, t2.main).length;
    await decide(t2.b, `run:${t2.c.id}`, 'again');
    await until(() => deliveredTo(t2.b, t2.main).length > n0);
    await tick(150);
    const got = deliveredTo(t2.b, t2.main).slice(n0);
    assert.equal(got.length, 1, '한 번');
    assert.match(got[0], /\[한 번 더\]를 골랐다: flow\[1\]으로 main 자리에 한 번 더 넘겼다/);
    assert.match(got[0], /둘째 문단이 길다/, '같은 글에 반려 보고');
  } finally { await t2.stop(); }
  // 멈춤
  const t3 = await toLimitWith(selfDef());
  try {
    const n0 = deliveredTo(t3.b, t3.main).length;
    await decide(t3.b, `run:${t3.c.id}`, 'pause');
    await until(() => deliveredTo(t3.b, t3.main).length > n0);
    await tick(150);
    const got = deliveredTo(t3.b, t3.main).slice(n0);
    assert.equal(got.length, 1);
    assert.match(got[0], /\[회 멈추기\]를 골랐다\. 회는 멈췄다/); assert.match(got[0], /새 회로 다시 열지 않는다/);
  } finally { await t3.stop(); }
  // 관리자 없는 rig(P230 길)도 같다
  const t4 = await toLimitWith(limitDef());
  try {
    const n0 = deliveredTo(t4.b, t4.main).length;
    await decide(t4.b, `run:${t4.c.id}`, 'accept');
    await until(() => deliveredTo(t4.b, t4.main).length > n0);
    assert.match(deliveredTo(t4.b, t4.main).at(-1), /\[그대로 받기\]/);
  } finally { await t4.stop(); }
});

// ---------- 3. scoped 줄은 실제로 도는 권한을 따른다 ----------
test('P231 scoped 셸 줄: 승인 전 unattended에 있고, ask·승인된 unattended에는 없다. 판의 머리도 승인을 따른다', async () => {
  const mk = (permission) => { const d = { ...limitDef(), manager: 'main' }; d.seats = { ...d.seats, reviewer: { ...d.seats.reviewer, permission } }; const v = validateRig(d); assert.equal(v.ok, true, v.reason); return v.def; };
  assert.deepEqual(seatExtraLines(mk('unattended'), 'reviewer'), [SCOPED_SHELL_LINE], '승인 전 unattended는 scoped로 돈다');
  assert.deepEqual(seatExtraLines(mk('unattended'), 'reviewer', { approved: true }), []);
  assert.deepEqual(seatExtraLines(mk('scoped'), 'reviewer', { approved: true }), [SCOPED_SHELL_LINE]);
  assert.deepEqual(seatExtraLines(mk('ask'), 'reviewer'), []);
  const def = { ...limitDef(), manager: 'main' }; def.seats.reviewer = { ...def.seats.reviewer, permission: 'unattended' };
  const { b, ws, F, stop } = await board({ def });
  try {
    const d = b.rig.active(ws.key).def;
    assert.deepEqual(F().extraLinesOf(ws.key, d, 'reviewer'), [SCOPED_SHELL_LINE], '승인 전');
    b.rig.permit(ws.key, ['reviewer'], 'human');
    assert.equal(b.rig.permitted(ws.key, 'reviewer'), true);
    assert.deepEqual(F().extraLinesOf(ws.key, d, 'reviewer'), [], '승인 뒤');
    assert.deepEqual(F().extraLinesOf(ws.key, d, 'main'), []);
    assert.ok(!F().seatNoticeOf(d, 'reviewer', ws.key).includes(SCOPED_SHELL_LINE));
  } finally { await stop(); }
});
