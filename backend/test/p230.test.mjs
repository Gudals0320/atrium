// P230 단위 시험: rig2-design 11.12(P228에서 돌아온 것). 개선 고리 "새 회 없음" 건너뛰기, 고리 지금 한 번 돌리기(사람 API·관리자 명령·열린 회 건너뜀·관리자 아닌 자리 거절),
// scoped 자리 머리의 셸 안내 줄, 관리자 없는 rig의 상한 → 사람 카드(그대로 받기·한 번 더·회 멈추기)와 머리 줄, done 훅 seat(글·목록·없음, v1 그대로, rig check, rig.map 관문),
// 정기 점검의 일 글과 rig.presets의 git(저장소 아님 경고). 가짜 판은 p221 틀(진짜 저장소·전달 대기열·Branch·Rig, 가짜 에이전트)
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
import { seatExtraLines, SCOPED_SHELL_LINE, NO_MANAGER_LINE } from '../src/rig-flow.mjs';
import { buildRigMap } from '../src/rig-map.mjs';
import { rigLoopHandlers } from '../src/rig-loops.mjs';
import { HUMAN_FROM } from '../src/rig-templates.mjs';
import { VERBS } from '../src/cli-contract.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FX = path.join(HERE, 'fixtures');
const GROW = path.join(FX, 'rig-loops-grow');
const CHECK = path.join(FX, 'rig-loops-check');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p230-'));
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
  const cfg = { profile: 'dev', terminalSession: 'atrium-dev-p230test', port: 0, dataDir: dir, sessionsDir: path.join(dir, 'sessions'), inputQuietMs: 3000, submitConfirmMs: 3000, deliveryMaxWaitMs: 60000, submitRetries: 0, rigCycles: false };
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

// ---------- 1. 개선 고리 "새 회 없음" ----------
test('P230 개선 고리: 지난 개선 회 뒤로 끝난 작업 회가 없으면 건너뛴다(loop_skip no_new_runs, 다음 시각은 한 주기 뒤), 있으면 돈다', async () => {
  const { b, ws, add, L, seat, stop } = await board();
  try {
    const main = add('main'); seat(main, 'main');
    const t0 = Date.now();
    await L().tick(t0);
    assert.deepEqual(await L().tick(t0 + 7 * DAY + 1), [], '새 회 없음');
    const sk = ledger(b, ws.key, { kinds: ['loop_skip'] });
    assert.equal(sk.length, 1); assert.equal(sk[0].value, 'no_new_runs'); assert.match(sk[0].text, /새 회 없음/);
    assert.equal(L().view(ws.key, b.rig.active(ws.key).def).find((x) => x.name === 'retro').nextAt, t0 + 14 * DAY + 1);
    assert.equal(b.store.casesOf(ws.key).length, 0, '회를 열지 않았다');
    // 열린(끝나지 않은) 작업 회는 세지 않는다
    b.store.insertCase({ id: 'cw-open', workspaceKey: ws.key, owner: main.sessionId, state: 'open', createdAt: t0 + DAY, loop: 'work' });
    assert.deepEqual(await L().tick(t0 + 14 * DAY + 2), []);
    b.store.updateCase('cw-open', { state: 'done', closedAt: t0 + 15 * DAY });
    const f = await L().tick(t0 + 21 * DAY + 3);
    assert.equal(f.length, 1); assert.equal(f[0].loop, 'retro');
    // 그 개선 회 뒤로 새 작업 회가 없으면 다시 건너뛴다
    b.store.updateCase(f[0].caseId, { state: 'done', closedAt: t0 + 21 * DAY + 4 });
    assert.deepEqual(await L().tick(t0 + 28 * DAY + 4), []);
    assert.equal(ledger(b, ws.key, { kinds: ['loop_skip'] }).filter((r) => r.value === 'no_new_runs').length, 3);
  } finally { await stop(); }
});

// ---------- 2. 지금 한 번 돌리기 ----------
test('P230 지금 돌리기: 사람(rig.run)은 every 고리의 회를 지금 열고 다음 시각은 그대로, 열린 회가 있으면 건너뛰고 까닭, 요청 고리는 거절', async () => {
  const { b, ws, add, L, seat, stop } = await board();
  try {
    const main = add('main'); seat(main, 'main');
    const t0 = Date.now();
    await L().tick(t0);
    const nextAt = L().view(ws.key, b.rig.active(ws.key).def).find((x) => x.name === 'retro').nextAt;
    const H = rigLoopHandlers(b);
    const r = await H['rig.run']({ loop: 'retro' }, local);
    assert.equal(r.ran, true); assert.equal(r.loop, 'retro'); assert.equal(r.to, 'main'); assert.equal(r.by, 'human');
    const c = b.store.getCase(r.case);
    assert.equal(c.loop, 'retro'); assert.match(c.name, /^retro \d{4}-/);
    await gotUnit(main);
    const txt = main.texts.find((x) => x.includes('[Atrium 보드] 관계:'));
    assert.match(txt, /사람이 retro 고리를 지금 한 번 돌려 연 회/); assert.match(txt, /사람이 retro 고리\(7d마다\)를 지금 한 번 돌려 연 회다/);
    const trig = ledger(b, ws.key, { kinds: ['loop_trigger'] });
    assert.equal(trig.length, 1); assert.equal(trig[0].value, 'now'); assert.equal(trig[0].actor, 'human');
    assert.equal(L().view(ws.key, b.rig.active(ws.key).def).find((x) => x.name === 'retro').nextAt, nextAt, '다음 every 시각은 그대로');
    // 열린 회가 있으면 건너뛴다(every처럼)
    const r2 = await H['rig.run']({ loop: 'retro' }, local);
    assert.equal(r2.ran, false); assert.equal(r2.skipped, 'running'); assert.match(r2.text, /끝나지 않은 회/); assert.deepEqual(r2.live, [c.id]);
    const sk = ledger(b, ws.key, { kinds: ['loop_skip'] }).at(-1);
    assert.equal(sk.value, 'running'); assert.equal(sk.data.trigger, 'now');
    // 멈춘 고리는 건너뛴다
    b.store.updateCase(c.id, { state: 'done', closedAt: Date.now() });
    L().pause(ws.key, 'retro', { by: 'human' });
    assert.equal((await H['rig.run']({ loop: 'retro' }, device)).skipped, 'paused');
    await L().resume(ws.key, 'retro', { by: 'human' });
    // 요청 고리·없는 고리는 거절, 에이전트 토큰은 거절
    await assert.rejects(H['rig.run']({ loop: 'work' }, local), (e) => e.code === 'bad_request' && /요청으로 도는 고리/.test(e.message));
    await assert.rejects(H['rig.run']({ loop: 'nope' }, local), (e) => e.code === 'not_found');
    await assert.rejects(H['rig.run']({ loop: 'retro' }, { auth: { kind: 'session' } }), (e) => e.code === 'forbidden');
  } finally { await stop(); }
});

test('P230 지금 돌리기: 관리자 자리는 atrium rig run <고리>, 관리자 아닌 세션은 거절. 계약과 rig 동사에 run', async () => {
  const { b, ws, add, L, seat, stop } = await board();
  try {
    const main = add('main'); seat(main, 'main');
    const x = add('stranger');
    await assert.rejects(b.branch.rigAdmin.verb(x, { op: 'run', target: 'retro' }), (e) => e.code === 'forbidden' && /관리자 자리/.test(e.message));
    const r = await b.branch.rigAdmin.verb(main, { op: 'run', target: 'retro' });
    assert.equal(r.ran, true); assert.equal(r.by, 'manager');
    const trig = ledger(b, ws.key, { kinds: ['loop_trigger'] }).at(-1);
    assert.equal(trig.actor, 'agent'); assert.equal(trig.data.by, 'manager');
    await gotUnit(main);
    assert.ok(main.texts.some((t) => /관리자 자리가 retro 고리를 지금 한 번 돌려 연 회/.test(t)));
    const r2 = await b.branch.rigAdmin.verb(main, { op: 'run', target: 'retro' });
    assert.equal(r2.ran, false); assert.equal(r2.skipped, 'running');
    assert.ok(RIG_ADMIN_OPS.includes('run'));
    const rig = VERBS.find((v) => v.name === 'rig');
    assert.match(rig.args[0], /run <고리>/);
    assert.ok(L());
  } finally { await stop(); }
});

// ---------- 3. scoped 머리 줄, 4. 관리자 없는 rig ----------
test('P230 머리 안내: scoped 자리에 셸 줄, 관리자 자리가 없는 rig의 모든 자리에 보고 줄. 관리자가 있고 ask면 세 줄 그대로', async () => {
  assert.match(SCOPED_SHELL_LINE, /^\[Atrium 보드\] Do not pipe shell commands or wrap them in another shell\. Run git in the working folder without -C\. A command that asks stops an unattended run\. Read files with Read\/Glob\/Grep\.$/); // P232(11.14의 2)
  assert.match(NO_MANAGER_LINE, /pausing or changing the rig in your report; the human decides/);
  const v = validateRig(limitDef());
  assert.equal(v.ok, true, v.reason);
  assert.deepEqual(seatExtraLines(v.def, 'reviewer'), [SCOPED_SHELL_LINE, NO_MANAGER_LINE]);
  assert.deepEqual(seatExtraLines(v.def, 'main'), [NO_MANAGER_LINE]);
  const m = validateRig({ ...limitDef(), manager: 'main' });
  assert.deepEqual(seatExtraLines(m.def, 'main'), []);
  assert.deepEqual(seatExtraLines(m.def, 'reviewer'), [SCOPED_SHELL_LINE]);
  const { b, main, rv, stop } = await toLimit();
  try {
    const hm = main.texts.find((x) => x.includes('[Atrium 보드] 관계:'));
    assert.ok(hm.includes(NO_MANAGER_LINE)); assert.ok(!hm.includes(SCOPED_SHELL_LINE));
    const hr = rv.texts.find((x) => x.includes('[Atrium 보드] 관계:'));
    assert.ok(hr.includes(SCOPED_SHELL_LINE)); assert.ok(hr.includes(NO_MANAGER_LINE));
    assert.ok(b);
  } finally { await stop(); }
});

test('P230 관리자 없는 rig의 상한: 막지 않고 사람 카드(run_limit: 마지막 반려 까닭, 상한). [한 번 더]는 그 줄로 한 번 더 넘긴다', async () => {
  const { b, ws, main, c, stop } = await toLimit();
  try {
    assert.equal(c.state, 'waiting_owner'); assert.equal(c.ownerWait, 'human');
    assert.deepEqual({ seat: c.humanAsk.seat, result: c.humanAsk.result, text: c.humanAsk.text, max: c.humanAsk.max }, { seat: 'reviewer', result: 'rejected', text: '둘째 문단이 길다', max: 0 });
    assert.ok(ledger(b, ws.key, { kinds: ['case_waiting_owner'] }).some((r) => r.value === 'human'));
    const a = (await asks(b)).find((x) => x.kind === 'run_limit');
    assert.ok(a, 'run_limit 카드'); assert.equal(a.id, `run:${c.id}`);
    assert.equal(a.run.reason, '둘째 문단이 길다'); assert.equal(a.run.seat, 'reviewer'); assert.equal(a.run.max, 0); assert.deepEqual(a.run.to, ['main']);
    // 주인의 새 요청은 이 회를 잇지 않는다(사람이 정한다)
    assert.equal(b.store.waitingCasesOfOwner(main.sessionId, ws.key).length, 0);
    // 회 저절로 닫기도 하지 않는다
    assert.equal(b.branch.flow.loops.autoCloseWhy(b.store.getCase(c.id), Date.now() + 10 * DAY, 1), 'human');
    const n0 = main.texts.length;
    const r = await decide(b, a.id, 'again');
    assert.equal(r.action, 'again');
    const c2 = b.store.getCase(c.id);
    assert.equal(c2.ownerWait === 'human', false); assert.equal(c2.humanAsk, null); assert.equal(c2.edgeCounts['1>human'], 1);
    await until(() => main.texts.length > n0);
    assert.match(main.texts.at(-1), /둘째 문단이 길다/);
    assert.ok(ledger(b, ws.key, { kinds: ['case_resumed'] }).some((x) => x.value === 'human_again'));
    assert.equal((await asks(b)).filter((x) => x.kind === 'run_limit').length, 0, '카드가 사라진다');
    await assert.rejects(decide(b, a.id, 'again'), (e) => e.code === 'not_found');
  } finally { await stop(); }
});

test('P230 사람 카드: [그대로 받기]는 회를 닫고(case_done human), [회 멈추기]는 회를 멈추고 카드를 숨긴다(잇기에 다시 뜬다). 모르는 단추는 거절', async () => {
  const t1 = await toLimit();
  try {
    const id = `run:${t1.c.id}`;
    await assert.rejects(decide(t1.b, id, 'maybe'), (e) => e.code === 'bad_request');
    const r = await decide(t1.b, id, 'accept', device);
    assert.equal(r.state, 'done');
    assert.equal(t1.b.store.getCase(t1.c.id).state, 'done');
    const cd = ledger(t1.b, t1.ws.key, { kinds: ['case_done'] }).at(-1);
    assert.equal(cd.value, 'human'); assert.match(cd.text, /그대로 받음/);
    assert.equal((await asks(t1.b)).filter((x) => x.kind === 'run_limit').length, 0);
  } finally { await t1.stop(); }
  const t2 = await toLimit();
  try {
    const id = `run:${t2.c.id}`;
    const r = await decide(t2.b, id, 'pause');
    assert.equal(r.paused, true); assert.equal(r.action, 'pause');
    assert.ok(t2.b.store.getCase(t2.c.id).pausedAt);
    assert.equal((await asks(t2.b)).filter((x) => x.kind === 'run_limit').length, 0, '멈춘 동안 숨는다');
    await t2.L().resume(t2.ws.key, t2.c.id, { by: 'human' });
    assert.equal((await asks(t2.b)).filter((x) => x.kind === 'run_limit').length, 1, '잇기에 다시 뜬다');
  } finally { await t2.stop(); }
});

// ---------- 5. done 훅 seat ----------
test('P230 done 훅 seat: 글·목록·없음(v1 그대로), 없는 자리·다른 길목은 거절. 그 자리의 done에서만 돈다', async () => {
  const base = limitDef();
  const ok = (hooks) => { const v = validateRig({ ...base, hooks }); assert.equal(v.ok, true, v.reason); return v.def.hooks; };
  assert.deepEqual(ok([{ at: 'done', seat: 'main', run: ['node', 'x.mjs'] }])[0].seat, ['main']);
  assert.deepEqual(ok([{ at: 'done', seat: ['main', 'reviewer', 'main'], run: ['node', 'x.mjs'] }])[0].seat, ['main', 'reviewer']);
  assert.equal('seat' in ok([{ at: 'done', run: ['node', 'x.mjs'] }])[0], false, 'seat 없으면 칸도 없다(v1 그대로)');
  const v1 = validateRig({ hooks: [{ at: 'done', run: ['node', 'x.mjs'] }] });
  assert.equal(v1.ok, true); assert.equal('seat' in v1.def.hooks[0], false);
  const bad = (hooks, re) => { const v = validateRig({ ...base, hooks }); assert.equal(v.ok, false); assert.match(v.reason, re); };
  bad([{ at: 'done', seat: 'zz', run: ['node', 'x.mjs'] }], /seat에 없는 자리가 있다: zz/);
  bad([{ at: 'done', seat: [], run: ['node', 'x.mjs'] }], /자리 이름 글이나 자리 이름 배열/);
  bad([{ at: 'done', seat: 3, run: ['node', 'x.mjs'] }], /자리 이름 글이나/);
  bad([{ at: 'deliver', seat: 'main', run: ['node', 'x.mjs'] }], /seat은 pre-tool·done 훅에만/);
  // pre-tool의 seat은 그대로
  assert.equal(validateRig({ ...base, hooks: [{ at: 'pre-tool', seat: 'main', run: ['node', 'x.mjs'] }] }).ok, true);
  // 실제로: reviewer 자리 done에만 거절 훅
  const def = { ...limitDef(), manager: 'main', hooks: [{ at: 'done', seat: 'reviewer', run: ['node', '.atrium/hooks/no.mjs'], onFail: 'block' }] };
  const dir = tmp();
  fs.mkdirSync(path.join(dir, '.atrium', 'hooks'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.atrium', 'hooks', 'no.mjs'), "process.stdin.resume(); process.stdin.on('end', () => process.stdout.write(JSON.stringify({ action: 'reject', reason: 'no' })));\n");
  const { b, add, seat, stop } = await board({ dir, def });
  try {
    const main = add('main'); seat(main, 'main');
    const rv = add('rv'); seat(rv, 'reviewer');
    const a = await b.rig.done({ caller: main, tryRow: null, unit: null, result: 'ok', text: 'x' });
    assert.equal(a.action, 'pass'); assert.equal(a.runs.length, 0, 'main 자리 done에는 돌지 않는다');
    const r = await b.rig.done({ caller: rv, tryRow: null, unit: null, result: 'ok', text: 'x' });
    assert.equal(r.action, 'reject'); assert.equal(r.runs.length, 1);
  } finally { await stop(); }
});

test('P230 done 훅 seat: rig check 요약(doneHooks)과 rig.status 훅 줄, rig.map의 관문은 그 자리의 결과 선에만', async () => {
  const def = { ...limitDef(), manager: 'main', hooks: [{ at: 'done', seat: 'main', run: ['node', 'x.mjs'] }, { at: 'done', run: ['node', 'y.mjs'] }] };
  const { b, ws, stop } = await board({ def: { ...def, hooks: [] } });
  try {
    const x = b.branch.rigAdmin.check(ws.key, { text: JSON.stringify(def) });
    assert.equal(x.ok, true, x.reason);
    assert.deepEqual(x.summary.doneHooks, [{ index: 0, seats: ['main'] }, { index: 1, seats: null }]);
  } finally { await stop(); }
  const v = validateRig(def);
  const m = buildRigMap({ ws: 'w', def: v.def });
  const gates = m.def.gates.filter((g) => g.at === 'done');
  const edges = m.def.edges;
  const fromOf = (id) => edges.find((e) => e.id === id).from;
  assert.ok(gates[0].on.length > 0);
  assert.ok(gates[0].on.every((id) => fromOf(id) === 'seat:main'), JSON.stringify(gates[0].on));
  assert.deepEqual(gates[0].meta.seat, ['main']);
  assert.ok(gates[1].on.some((id) => fromOf(id) === 'seat:reviewer'), '없으면 모든 자리');
  assert.equal(gates[1].meta.seat, undefined);
});

// ---------- 6. 정기 점검 ----------
test('P230 정기 점검: 일 글에 "바뀐 것 없으면 한 줄", 기계 검사 훅은 작업 자리 seat. rig.presets는 워크스페이스의 git 상태', async () => {
  assert.match(CHECK_TASK, /If nothing changed since the last report, write one line: no change \+ path of the last report\./);
  const p = presetFiles(shortcutAnswers('check'));
  assert.match(p.def.loops.work.task, /no change \+ path of the last report/);
  const g = presetFiles({ ...shortcutAnswers('grow'), check: { on: true, script: 'scripts/check.mjs' }, review: { on: true } });
  assert.deepEqual(g.def.hooks, [{ at: 'done', seat: 'main', run: ['node', 'scripts/check.mjs'], onFail: 'block' }]);
  const { b, ws, dir, stop } = await board();
  try {
    const H = rigSetupHandlers(b);
    const none = await H['rig.presets']();
    assert.equal(none.git, undefined, '워크스페이스 없이 부르면 git 칸 없음');
    const r = await H['rig.presets']({ workspace: ws.key });
    assert.equal(r.git, 'norepo', dir);
    assert.ok(r.shortcuts.length === 2);
  } finally { await stop(); }
});
