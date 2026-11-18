// P185 단위 시험: rig 3단계 — 자리(seat), 건(case), 자리로 보내기, done 값에 따른 넘김, 되돌아감 상한(docs research harness-arch.md 14절).
// 진짜 저장소·전달 대기열(B1)·Branch·Rig·RigFlow, 가짜 에이전트(p182 시험의 틀). herdr·hc와 claude 없이 돈다. 견본 rig의 훅은 진짜 node 프로세스로 돈다.
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
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p185-'));
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
  const cfg = { profile: 'dev', terminalSession: 'atrium-dev-p185test', port: 0, dataDir: dir, sessionsDir: path.join(dir, 'sessions'), inputQuietMs: 3000, submitConfirmMs: 3000, deliveryMaxWaitMs: 60000, submitRetries: 0 };
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
const evs = (b, kind) => b.store.db.prepare('SELECT * FROM events WHERE kind = ? ORDER BY id').all(kind).map((e) => ({ ...e, data: JSON.parse(e.data || 'null') }));
const done = (b, s, result, text) => U(b).doneVerb(s, { result, text });
const lastText = (s) => s.texts[s.texts.length - 1] || '';
// 자리 세션이 받은 일이 들어갈 때까지
const gotUnit = (s) => until(() => s.texts.some((t) => /rig의 \w+ 자리다/.test(t)) && s.rt.term.status === 'idle', 4000);

// ---------- 정의 검사 ----------
test('P185 정의 검사: results·seats·flow·manager, 없는 자리를 가리키는 줄, 상한 없는 되돌아감은 경고, 견본은 맞다', () => {
  const root = SAMPLE;
  const v = validateRig(sampleDef(), { root });
  assert.equal(v.ok, true, v.reason);
  assert.deepEqual(v.def.results, ['ok', 'failed', 'rejected']);
  assert.deepEqual(Object.keys(v.def.seats), ['main', 'worker', 'reviewer']);
  assert.equal(v.def.seats.main.session, 'keep'); assert.equal(v.def.seats.worker.maxLive, 3); assert.equal(v.def.seats.reviewer.maxLive, 3, '기본 3');
  assert.deepEqual(v.def.flow[2], { index: 2, from: 'reviewer', on: 'rejected', to: ['worker'], max: 2, else: 'main' });
  assert.equal(v.def.manager, 'main');
  assert.deepEqual(v.def.warnings, []);
  // 자리 없는 정의(1~2단계)는 그대로
  const plain = validateRig({ hooks: [] }, { root });
  assert.equal(plain.def.seats, null); assert.deepEqual(plain.def.results, ['ok', 'failed']);
  const bad = (raw, re) => { const r = validateFlow(raw, { root }); assert.equal(r.ok, false, JSON.stringify(raw)); assert.match(r.reason, re); };
  const S = { a: { launcher: 'claude', session: 'keep' }, b: { launcher: 'codex' } };
  bad({ results: 'ok', seats: S }, /results/);
  bad({ results: ['ok', 'ok'], seats: S }, /같은 낱말/);
  bad({ results: ['assign'], seats: S }, /assign/);
  bad({ flow: [] }, /seats/);
  bad({ seats: { 'Bad-Name': { launcher: 'claude' } } }, /자리 이름/);
  bad({ seats: { a: { session: 'keep' } } }, /launcher/);
  bad({ seats: { a: { launcher: 'claude', session: 'sometimes' } } }, /keep 또는 fresh/);
  bad({ seats: { a: { launcher: 'claude', session: 'keep', worktree: true } } }, /fresh 자리에만/);
  bad({ seats: { a: { launcher: 'codex', worktree: true } } }, /Claude Code 자리에만/);
  bad({ seats: { a: { launcher: 'claude', tools: ['nope'] } } }, /없는 도구/);
  bad({ seats: { a: { launcher: 'claude', may: ['zz'] } } }, /may에 없는 자리/);
  bad({ seats: { a: { launcher: 'claude', session: 'keep', max_live: 2 } } }, /max_live/);
  bad({ seats: { a: { launcher: 'claude', guide: '.atrium/none.txt' } } }, /guide/);
  bad({ seats: S, flow: [{ from: 'zz', on: 'ok', to: 'b' }] }, /from이 없는 자리/);
  bad({ seats: S, flow: [{ from: 'a', on: 'ok', to: 'zz' }] }, /to가 없는 자리/);
  bad({ seats: S, flow: [{ from: 'a', on: 'shrug', to: 'b' }] }, /on은 assign 또는 results/);
  bad({ seats: S, flow: [{ from: 'a', on: 'assign', to: ['a', 'b'] }] }, /자리 하나/);
  bad({ seats: S, flow: [{ from: 'a', on: 'ok', to: 'b', else: 'a' }] }, /max와 함께/);
  bad({ seats: S, flow: [{ from: 'a', on: 'ok', to: 'b', max: 1, else: 'zz' }] }, /else가 없는 자리/);
  bad({ seats: S, manager: 'zz' }, /manager/);
  // 상한 없는 되돌아감은 경고(정의는 쓰인다)
  const w = validateFlow({ seats: S, flow: [{ from: 'a', on: 'assign', to: 'b' }, { from: 'b', on: 'ok', to: 'a' }, { from: 'a', on: 'ok', to: 'b' }] }, { root });
  assert.equal(w.ok, true);
  assert.equal(w.flow.warnings.length, 2);
  assert.match(w.flow.warnings[0], /되돌아가는 줄인데 max/);
  // 갈라짐(to 목록)
  const fork = validateFlow({ seats: { ...S, c: { launcher: 'claude' } }, flow: [{ from: 'a', on: 'ok', to: ['b', 'c'] }] }, { root });
  assert.deepEqual(fork.flow.flow[0].to, ['b', 'c']);
  assert.ok(HOOK_FROMS.includes('flow'), 'deliver 훅 from에 flow');
});

// ---------- 자리 정하기 ----------
test('P185 자리 정하기: 사람(판 API 토큰, local)만, 켜진 rig만, 정의에 있는 자리만, keep은 하나만. 떼기(null)', async () => {
  const { b, add, ws, stop } = await board();
  try {
    const h = rigFlowHandlers(b);
    const m = add('lead');
    const human = { auth: { kind: 'local' } };
    assert.throws(() => h['rig.seat']({ session: 'lead', seat: 'main' }, { auth: { kind: 'device' } }), (e) => e.code === 'forbidden');
    assert.throws(() => h['rig.seat']({ session: 'lead', seat: 'nope' }, human), /자리 nope가 없다/);
    const r = h['rig.seat']({ session: 'lead', seat: 'main' }, human);
    assert.equal(r.seat, 'main'); assert.equal(m.rigSeat, 'main');
    assert.equal(b.store.getSession(m.sessionId).rigSeat, 'main', '저장(sessions.rig_seat)');
    const other = add('other');
    assert.throws(() => h['rig.seat']({ session: 'other', seat: 'main' }, human), (e) => e.code === 'seat_taken');
    h['rig.seat']({ session: 'other', seat: 'worker' }, human); // fresh 자리는 여럿
    h['rig.seat']({ session: 'other', seat: null }, human);
    assert.equal(other.rigSeat, null);
    // 꺼진 rig에서는 못 정한다
    b.store.setRigEnabled(ws.key, false);
    assert.throws(() => h['rig.seat']({ session: 'other', seat: 'worker' }, human), (e) => e.code === 'rig_off');
    // 에이전트의 /branch/*에는 자리 명령이 없다(dispatch가 모른다)
    assert.throws(() => b.branch.dispatch('seat', m, { seat: 'worker' }), (e) => e.code === 'unknown_op');
    assert.equal(evs(b, 'rig_seat').length, 3);
  } finally { await stop(); }
});

// ---------- 흐름 전체(14절 "증거"의 모양) ----------
test('P185 흐름(P194 보고): 메인이 맡겨 건이 생김 → worker ok → reviewer → 반려 두 번 뒤 세 번째는 main에게 보고(waiting_owner) → main이 다시 맡겨 이음 → reviewer ok는 main에게 보고 → 건 done. 넘김 글, deliver 훅 from flow, 이름, 상위 = 건 주인', async () => {
  const { b, add, seat, by, F, stop } = await board();
  try {
    const main = add('lead', { kind: 'codex', hooked: false });
    seat(main, 'main');
    // 메인이 자리 이름으로 맡긴다 → 건, worker-1(claude) 띄움, 일
    const r = await V(b).prompt(main, { name: 'worker', text: '일: 목록을 세어 보고한다' });
    assert.equal(r.unit.kind, 'new'); assert.ok(r.unit.caseId); assert.equal(r.unit.seat, 'worker');
    const caseId = r.unit.caseId;
    const w1 = by('worker-1');
    assert.ok(w1, 'fresh 자리 세션 이름 <자리>-<n>');
    assert.equal(w1.rigSeat, 'worker'); assert.equal(w1.kind, 'claude'); assert.equal(w1.parentSessionId, main.sessionId, '건 주인의 하위로 띄운다');
    assert.equal(b.branch.relIndex().workParentOf(w1.sessionId), main.sessionId);
    await gotUnit(w1);
    const head = w1.texts[0];
    assert.match(head, /^\[Atrium 보드\] 관계: 너는 rig의 worker 자리다\. 아래 일은 건 c\w+의 일 u\w+이다\(@lead가 맡김/);
    // P188: 머리는 판 줄 세 줄 이하. 값과 보낼 수 있는 자리는 atrium me로
    assert.equal(head.split('\n\n')[0].split('\n').length, 3);
    assert.match(head, /끝나면 `atrium done <값> "<보고>"`로 닫고 쉰다\(값과 보낼 수 있는 자리는 `atrium me`\)/);
    assert.ok(head.includes('일을 시작하기 전에 `atrium guide`로 이 자리의 안내를 먼저 읽는다.'), '자리 안내가 있으면 먼저 읽으라고 한다');
    assert.ok(!head.includes(RIG_HEADER_LINE));
    assert.equal(promptTask(head), '일: 목록을 세어 보고한다', '카드에는 할 일만');
    const c0 = b.store.getCase(caseId);
    assert.equal(c0.owner, main.sessionId); assert.equal(c0.state, 'open');
    assert.equal(b.store.unitsOfCase(caseId)[0].from, main.sessionId, '일의 상위 = 건 주인');
    // worker done ok → reviewer-1(codex)에게 넘김
    let d = await done(b, w1, 'ok', '세었다: 3개');
    assert.equal(d.claimedBy, 'flow'); assert.equal(d.flow.length, 1); assert.equal(d.flow[0].seat, 'reviewer'); assert.equal(d.case.state, 'open');
    const rv1 = by('reviewer-1'); assert.ok(rv1); assert.equal(rv1.kind, 'codex');
    assert.equal(rv1.parentSessionId, main.sessionId);
    await gotUnit(rv1);
    const ht = rv1.texts[0];
    assert.match(ht, /@worker-1\(worker 자리\)가 done ok로 넘김/);
    assert.match(ht, /worker 자리\(@worker-1\)가 done ok로 넘긴 일이다/);
    assert.match(ht, /--- 넘긴 done 글 ---\n세었다: 3개/);
    assert.match(ht, /--- 건의 첫 할 일\(앞 1줄\) ---\n일: 목록을 세어 보고한다/);
    assert.match(ht, /\[rig flow sample\] handoff from seat worker to reviewer/, 'deliver 훅(from flow) 입력의 from.seat, session.name = 받는 자리');
    const hr = b.store.hookRuns({ limit: 5 }).find((x) => x.at === 'deliver');
    assert.equal(hr.decision, 'pass');
    assert.equal(main.texts.length, 0, '넘어간 done 값은 주인에게 가지 않는다');
    // reviewer rejected ×2 → worker-2, worker-3(같은 건), 세 번째는 main(올림, 이력)
    let rv = rv1;
    for (let i = 1; i <= 2; i++) {
      d = await done(b, rv, 'rejected', `고칠 것 ${i}`);
      assert.equal(d.flow[0].seat, 'worker');
      const w = by(`worker-${i + 1}`); assert.ok(w, `worker-${i + 1}`);
      await gotUnit(w);
      assert.match(w.texts[0], new RegExp(`--- 넘긴 done 글 ---\\n고칠 것 ${i}`));
      assert.equal(b.store.getCase(caseId).edgeCounts['2'], i);
      d = await done(b, w, 'ok', `고쳤다 ${i}`);
      rv = by(`reviewer-${i + 1}`); assert.ok(rv); await gotUnit(rv);
    }
    d = await done(b, rv, 'rejected', '고칠 것 3');
    // P194: else(main)의 앉은 세션이 건 주인이라 일이 아니라 보고이고, 건은 waiting_owner
    assert.deepEqual(d.flow, [], '주인에게는 일을 만들지 않는다');
    assert.deepEqual(d.reports, [{ seat: 'main', to: 'lead', escalated: true }]);
    assert.equal(d.case.state, 'waiting_owner');
    assert.equal(b.store.getCase(caseId).edgeCounts['2>else'], 1);
    await until(() => main.texts.length === 1);
    const up = main.texts[0];
    assert.match(up, /^\[Atrium 보드\] rig 건 c\w+\("일: 목록을 세어 보고한다"\): reviewer 자리\(@reviewer-3\)가 일 u\w+을 닫았다: rejected\n/);
    assert.match(up, /이것은 보고다\(atrium done으로 닫을 일이 아니다\)\. 되돌아감 상한을 넘어 너에게 올라왔다/);
    assert.match(up, /건은 waiting_owner다/);
    assert.match(up, /\n고칠 것 3/);
    assert.equal(U(b).item(main).item, null, '주인은 열린 일이 없다');
    assert.equal(evs(b, 'rig_case_waiting_owner').length, 1);
    assert.match(up, /flow\[2\]은 이 건에서 이미 2번 지났다/);
    assert.match(up, /--- 건의 이력\(자리, 세션, 값, done 글 첫 줄\) ---/);
    assert.match(up, /worker\(@worker-1\) ok: 세었다: 3개/);
    assert.match(up, /reviewer\(@reviewer-2\) rejected: 고칠 것 2/);
    assert.equal(evs(b, 'rig_escalate').length, 1);
    assert.equal(evs(b, 'unit_stop_notice').length, 0);
    // main이 이 건을 이어 다시 맡김(같은 건) → 새 worker → ok → reviewer ok → main → main done → 건 done
    await until(() => main.rt.term.status === 'idle');
    const r2 = await V(b).prompt(main, { name: 'worker', text: '다시: 끝까지' });
    assert.equal(r2.unit.caseId, caseId, 'P194: 주인의 waiting_owner 건이 하나면 다음 맡기기가 그 건을 잇는다');
    assert.equal(b.store.getCase(caseId).state, 'open');
    assert.equal(evs(b, 'rig_case_resume').at(-1).data.from, 'waiting_owner');
    const w4 = by('worker-4'); await gotUnit(w4);
    await done(b, w4, 'ok', '끝까지 했다');
    const rv4 = by('reviewer-4'); await gotUnit(rv4);
    d = await done(b, rv4, 'ok', '좋다');
    assert.deepEqual(d.reports, [{ seat: 'main', to: 'lead', escalated: false }]);
    assert.equal(d.case.state, 'waiting_owner', 'P194·P209: 주인에게 간 것은 보고라 일이 없다. 건은 그 보고를 받은 주인의 턴을 기다린다(주인이 done을 칠 필요 없음)');
    await until(() => main.texts.length === 2);
    assert.match(main.texts[1], /^\[Atrium 보드\] rig 건 c\w+\("일: 목록을 세어 보고한다"\): reviewer 자리\(@reviewer-4\)가 일 u\w+을 닫았다: ok\n\[Atrium 보드\] 이것은 보고다\(atrium done으로 닫을 일이 아니다\)\. 건에 열린 일이 없으면 건은 waiting_owner다: .*맡기지 않고 턴을 끝내면 건은 done이다\.\n좋다$/);
    await until(() => b.store.getCase(caseId).state === 'done', 4000); // P209: 주인의 턴이 맡기기 없이 끝났다
    assert.equal(evs(b, 'rig_case_done').length, 1);
    const c = b.store.getCase(caseId);
    assert.equal(c.state, 'done'); assert.ok(c.closedAt);
    // 건이 띄운 세션 기록(rig_case_items)과 rig.cases
    const items = b.store.caseItems(caseId);
    assert.deepEqual(items.map((x) => x.seat), ['worker', 'reviewer', 'worker', 'reviewer', 'worker', 'reviewer', 'worker', 'reviewer']);
    const cases = await rigFlowHandlers(b)['rig.cases']({}, null);
    assert.equal(cases.cases[0].id, caseId);
    assert.equal(cases.cases[0].items.length, 8);
    assert.equal(cases.cases[0].lines[0].passed, 0); // P194 뒤: 주인이 waiting_owner 건을 이어 맡기면 줄별 지난 횟수를 0으로 되돌린다(넘어간 이력은 남음)
    assert.equal(cases.cases[0].lines[0].escalated, 1);
    assert.ok(cases.cases[0].handoffs >= 6);
    // 이름: 다시 쓰지 않는 n(DB 셈)
    assert.equal(b.store.nextSeatN(c.workspaceKey, 'worker'), 5);
    // atrium me·items
    const me = b.branch.me(w1);
    assert.equal(me.rig.seat, 'worker'); assert.deepEqual(me.rig.may, ['main']); assert.deepEqual(me.rig.assign, []);
    const items2 = U(b).items(main);
    assert.ok(items2.items.every((x) => x.caseId === caseId));
  } finally { await stop(); }
});

// ---------- 자리로 보내기 규칙 ----------
test('P185 자리로 보내기: assign 줄 → 일, may → 글만(일 없음), 그 밖 거절과 쓸 수 있는 자리, --now, 이어지는 지시, 자리 없는 세션에 보내기', async () => {
  const { b, add, seat, by, stop } = await board();
  try {
    const main = add('lead'); seat(main, 'main');
    const outsider = add('outsider');
    await V(b).prompt(main, { name: 'worker', text: '할 일' });
    const w1 = by('worker-1'); await gotUnit(w1);
    // worker → reviewer: 흐름에도 may에도 없다
    await assert.rejects(V(b).prompt(w1, { name: 'reviewer', text: '봐 줘' }), (e) => e.code === 'rig_refused' && /쓸 수 있는 자리 — 일 맡기기: 없음 · 글만: main/.test(e.message));
    // 자리 없는 세션에도 못 보낸다
    await assert.rejects(V(b).prompt(w1, { name: 'outsider', text: 'x' }), (e) => e.code === 'rig_refused' && /자리 없는 세션/.test(e.message));
    // worker → main(may): 글만, 일 없음
    const units0 = b.store.db.prepare('SELECT COUNT(*) n FROM work_units').get().n;
    const q = await V(b).prompt(w1, { name: 'main', text: '질문: 몇 개를 세나?' });
    assert.equal(q.unit, null); assert.equal(q.name, 'lead');
    assert.equal(b.store.db.prepare('SELECT COUNT(*) n FROM work_units').get().n, units0);
    await until(() => main.texts.includes('질문: 몇 개를 세나?'));
    // main → worker-1(이름): 이어지는 지시(새 일 아님)
    const f = await V(b).prompt(main, { name: 'worker-1', text: '답: 셋' });
    assert.equal(f.unit.kind, 'followup');
    // main → worker --now: 일을 만들지 않으므로 거절(worker는 main의 may에 없다)
    await assert.rejects(V(b).prompt(main, { name: 'worker', text: 'x', now: true }), (e) => e.code === 'rig_refused' && /--now는 일을 만들지 않는다/.test(e.message));
    // main → reviewer: 거절
    await assert.rejects(V(b).prompt(main, { name: 'reviewer', text: 'x' }), (e) => e.code === 'rig_refused');
    // 자리 없는 세션(outsider)은 옛 그대로: 자리 세션에 보내도 거절 없음
    const o = await V(b).prompt(outsider, { name: 'worker-1', text: '안녕' });
    assert.equal(o.unit, null);
  } finally { await stop(); }
});

test('P185 done 값 검사: 자리 세션은 results 낱말만, 자리 없는 세션은 ok|failed. 맞는 줄이 없으면 건 주인에게(0단계 꼴)', async () => {
  const { b, add, seat, by, stop } = await board();
  try {
    const main = add('lead'); seat(main, 'main');
    await V(b).prompt(main, { name: 'worker', text: '할 일' });
    const w1 = by('worker-1'); await gotUnit(w1);
    await assert.rejects(done(b, w1, 'maybe', 'x'), (e) => e.code === 'bad_request' && /ok, failed, rejected/.test(e.message));
    // worker failed: flow에 줄이 없다 → 주인에게 done 알림
    const d = await done(b, w1, 'failed', '못 했다');
    assert.equal(d.claimedBy, 'queue'); assert.equal(d.case.state, 'done', '열린 일이 없으면 건 done');
    await until(() => main.texts.some((t) => /@worker-1가 일 u\w+.*을 닫았다: failed\n못 했다/.test(t)));
    // 자리 없는 세션
    const p = add('plainlead'); const kid = add('kid', { parentSessionId: p.sessionId });
    b.branch.noteChild(kid.sessionId, { role: '워커', depth: 2, by: p.sessionId });
    const r = await V(b).prompt(p, { name: 'kid', text: '일' });
    assert.ok(r.unit && !r.unit.caseId, '자리 없는 세션은 0단계 일(건 없음)');
    await until(() => kid.texts.length === 1 && kid.rt.term.status === 'idle');
    assert.match(kid.texts[0], /너는 @plainlead의 하위 워커다/);
    await assert.rejects(done(b, kid, 'rejected', 'x'), /결과는 ok 또는 failed다/);
  } finally { await stop(); }
});

test('P185 되돌아감 상한: else가 없으면 manager, manager도 없으면 건 blocked와 주인에게 판 알림(이력). 주인이 다시 맡기면 이어진다', async () => {
  const def = sampleDef();
  def.flow[2] = { from: 'reviewer', on: 'rejected', to: 'worker', max: 0 };
  delete def.manager; delete def.cycles; // P188: 견본의 느린 고리는 manager로 간다
  const { b, add, seat, by, stop } = await board({ def });
  try {
    const main = add('lead'); seat(main, 'main');
    const r = await V(b).prompt(main, { name: 'worker', text: '할 일' });
    const w1 = by('worker-1'); await gotUnit(w1);
    await done(b, w1, 'ok', '했다');
    const rv1 = by('reviewer-1'); await gotUnit(rv1);
    const d = await done(b, rv1, 'rejected', '틀렸다');
    assert.equal(d.case.state, 'blocked');
    assert.match(d.case.blockedReason, /상한 0번을 넘었고 else도 manager도 없다/);
    await until(() => main.texts.some((t) => t.startsWith('[Atrium 보드] rig 건')));
    const n = main.texts.find((t) => t.startsWith('[Atrium 보드] rig 건'));
    assert.match(n, /막혔다\(blocked\)/); assert.match(n, /reviewer\(@reviewer-1\) rejected: 틀렸다/);
    assert.equal(evs(b, 'rig_case_blocked').length, 1);
    // manager가 있으면 manager로
    def.manager = 'main';
    writeRig(b.store.getWorkspace(main.workspaceKey).root, def);
    await until(() => main.rt.term.status === 'idle');
    const r2 = await V(b).prompt(main, { name: 'worker', text: '새 일' });
    assert.notEqual(r2.unit.caseId, r.unit.caseId, '주인이 건의 시도를 쥐지 않았으면 새 건');
    const w2 = by('worker-2'); await gotUnit(w2);
    await done(b, w2, 'ok', '했다');
    const rv2 = by('reviewer-2'); await gotUnit(rv2);
    const d2 = await done(b, rv2, 'rejected', '또 틀림');
    assert.equal(d2.reports[0].seat, 'main', 'manager(main)의 앉은 세션이 주인이라 보고(P194)');
    assert.equal(d2.case.state, 'waiting_owner');
  } finally { await stop(); }
});

test('P185 max_live: 열린 시도를 쥔 fresh 자리 세션 수가 상한이면 자리 줄에 서고, 자리가 비면 판이 새 세션을 띄워 넣는다', async () => {
  const def = sampleDef(); def.seats.worker.max_live = 1;
  const { b, add, seat, by, stop } = await board({ def });
  try {
    const main = add('lead'); seat(main, 'main');
    await V(b).prompt(main, { name: 'worker', text: '첫 일' });
    const w1 = by('worker-1'); await gotUnit(w1);
    const r = await V(b).prompt(main, { name: 'worker', text: '둘째 일' });
    assert.equal(r.unit.seatWait, true); assert.equal(r.delivery.reason, 'seat_full');
    assert.equal(by('worker-2'), undefined);
    assert.equal(b.store.seatWaitingUnits(main.workspaceKey, 'worker').length, 1);
    // 첫 worker가 끝나면(끝난 fresh 세션은 판에 남고 수에 들지 않는다) 줄 선 일이 새 세션으로
    await done(b, w1, 'failed', '못 함');
    await until(() => !!by('worker-2'));
    const w2 = by('worker-2'); await gotUnit(w2);
    assert.match(w2.texts[0], /둘째 일/);
    assert.ok(b.sessions.has(w1.sessionId), '끝난 fresh 세션은 남는다');
    assert.equal(evs(b, 'rig_seat_dequeue').length, 1);
  } finally { await stop(); }
});

test('P185 keep 자리: 닫혔으면 다음 보내기가 <자리>로 새로 띄우고, 그 이름을 다른 열린 세션이 쓰면 <자리>-<n>. 주인이 닫히면 건 cancelled', async () => {
  const def = sampleDef();
  def.seats.helper = { launcher: 'claude', session: 'keep' };
  def.flow.push({ from: 'main', on: 'assign', to: 'helper' });
  const { b, add, seat, by, stop } = await board({ def });
  try {
    const main = add('lead'); seat(main, 'main');
    await V(b).prompt(main, { name: 'helper', text: '도와줘' });
    const h1 = by('helper'); assert.ok(h1, 'keep 자리 세션 이름은 자리 이름');
    await gotUnit(h1);
    // 다시 보내면 앉은 세션(같은 세션)에 줄 선다
    const again = await V(b).prompt(main, { name: 'helper', text: '하나 더' });
    assert.equal(again.name, 'helper');
    b.closeSession(h1, 'user');
    add('helper'); // 같은 이름을 다른 세션이 쥔다(자리 없음)
    await V(b).prompt(main, { name: 'helper', text: '셋째' });
    const h2 = [...b.sessions.values()].find((x) => x.rigSeat === 'helper');
    assert.match(h2.name, /^helper-\d+$/);
    // 주인이 닫히면 건 cancelled
    const cid = b.store.casesOf(main.workspaceKey)[0].id;
    b.closeSession(main, 'user');
    assert.equal(b.store.getCase(cid).state, 'cancelled');
    assert.ok(evs(b, 'rig_case_cancelled').length >= 1);
  } finally { await stop(); }
});

test('P185 상위 = 건 주인: 흐름 세션이 done 없이 쉬면 멈춤 알림이 건 주인에게, child-kill이 주인의 하위로 내려간다. 주인 자신의 일은 알리지 않는다', async () => {
  const { b, add, seat, by, stop } = await board();
  try {
    const main = add('lead'); seat(main, 'main');
    await V(b).prompt(main, { name: 'worker', text: '할 일' });
    const w1 = by('worker-1'); await gotUnit(w1);
    await done(b, w1, 'ok', '했다');
    const rv1 = by('reviewer-1'); await gotUnit(rv1); // reviewer는 done 없이 쉰다
    await until(() => main.texts.some((t) => /맡긴 일이 멈췄다: @reviewer-1의 일/.test(t)), 3000);
    // child-kill: 주인 아래에 worker-1, reviewer-1
    const kids = b.branch.workChildren(main.sessionId).map((x) => x.name).sort();
    assert.deepEqual(kids, ['reviewer-1', 'worker-1']);
  } finally { await stop(); }
});

test('P185 자리 없는 세션·꺼진 rig는 그대로: 자리를 정한 세션도 rig가 꺼지면 0단계, 정의에 자리가 없으면 0단계', async () => {
  const { b, add, ws, F, by, stop } = await board();
  try {
    const main = add('lead');
    F().setSeat(main, 'main');
    b.store.setRigEnabled(ws.key, false);
    assert.equal(F().seatCtx(main), null);
    const kid = add('kid', { parentSessionId: main.sessionId }); b.branch.noteChild(kid.sessionId, { role: '워커', depth: 2, by: main.sessionId });
    const r = await V(b).prompt(main, { name: 'kid', text: '일' });
    assert.ok(r.unit && !r.unit.caseId);
    await assert.rejects(V(b).prompt(main, { name: 'worker', text: 'x' }), (e) => e.code === 'rig_off' && /rig가 꺼져 있다/.test(e.message), '자리 이름은 세션 이름이 아니다(P195: 꺼진 rig의 자리 이름이면 그 까닭)');
    assert.equal(by('worker-1'), undefined);
    assert.deepEqual(b.store.casesOf(ws.key), []);
    assert.equal(b.branch.me(main).rig.active, false);
  } finally { await stop(); }
});

test('P185 자리의 도구(tools)와 안내(guide): 자리 세션은 그 자리의 도구만, atrium guide에 자리 안내', async () => {
  const def = sampleDef();
  def.tools = { count: { run: ['node', '.atrium/hooks/flow-stamp.mjs'] }, other: { run: ['node', '.atrium/hooks/flow-stamp.mjs'] } };
  def.seats.worker.tools = ['count'];
  const { b, add, seat, by, stop } = await board({ def });
  try {
    const main = add('lead'); seat(main, 'main');
    await V(b).prompt(main, { name: 'worker', text: '할 일' });
    const w1 = by('worker-1'); await gotUnit(w1);
    assert.deepEqual(b.branch.tools.list(w1).tools.map((x) => x.name), ['count']);
    await assert.rejects(b.branch.tools.run(w1, { tool: 'other' }), /worker 자리는 도구 other를 쓰지 못한다/);
    assert.deepEqual(b.branch.tools.list(main).tools.map((x) => x.name), ['count', 'other'], 'tools가 없는 자리는 모두');
    const g = b.branch.guideVerb(w1, {});
    assert.equal(g.seat.seat, 'worker');
    assert.match(g.seat.guide.text, /worker seat/);
    assert.equal(g.rig.state, 'on');
  } finally { await stop(); }
});

test('P185 worktree 자리: 일마다 <자리>-<일 ID> 워크트리로 띄우고(atrium child --worktree 길) 건에 워크트리를 적는다', async () => {
  const dir = tmp();
  const git = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'pipe' });
  git('init', '-q'); git('-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'commit', '-q', '--allow-empty', '-m', 'init');
  const def = sampleDef(); def.seats.worker.worktree = true;
  const { b, add, seat, stop } = await board({ dir, def });
  try {
    const main = add('lead'); seat(main, 'main');
    const r = await V(b).prompt(main, { name: 'worker', text: '할 일' });
    const sp = b.spawned.find((p) => p.name === 'worker-1');
    assert.equal(sp.worktree, `worker-${r.unit.id}`);
    const it = b.store.caseItems(r.unit.caseId)[0];
    assert.equal(it.worktree, `worker-${r.unit.id}`);
    assert.equal(path.resolve(it.worktreePath), path.resolve(dir, '.claude', 'worktrees', `worker-${r.unit.id}`));
  } finally { await stop(); }
});

test('P185 그래프와 계약: mission graph의 rig { seats, flow, cases }와 노드 rigSeat, 계약 4, 머리·넘김 글 모양', async () => {
  const { b, add, seat, by, ws, stop } = await board();
  try {
    const main = add('lead'); seat(main, 'main');
    await V(b).prompt(main, { name: 'worker', text: '할 일' });
    const w1 = by('worker-1'); await gotUnit(w1);
    const g = missionGraph({ sessions: [...b.sessions.values()].map((s) => b.summary(s)), rig: b.branch.flow.graph() });
    const r = g.rig[ws.key];
    assert.deepEqual(r.seats.map((x) => x.name), ['main', 'worker', 'reviewer']);
    assert.deepEqual(r.seats[1].sessions.map((x) => x.name), ['worker-1']);
    assert.equal(r.seats[1].sessions[0].busy, true);
    assert.deepEqual(r.flow.map((l) => `${l.from}-${l.on}-${l.to.join('+')}`), ['main-assign-worker', 'worker-ok-reviewer', 'reviewer-rejected-worker', 'reviewer-ok-main']);
    assert.equal(r.flow[2].max, 2); assert.equal(r.flow[2].passed, undefined); assert.equal(r.cases[0].lines[0].passed, 0); // P197: 맵 전체 passed는 뺐다(건별 lines)
    assert.equal(r.cases.length, 1); assert.deepEqual(r.cases[0].activeSeats, ['worker']);
    assert.equal(g.nodes.find((n) => n.name === 'worker-1').rigSeat, 'worker');
    assert.deepEqual(missionGraph({ sessions: [] }).rig, {});
    assert.equal(CONTRACT_VERSION, 4);
    assert.ok(VERBS.find((v) => v.name === 'me').out.includes('rig'));
    assert.match(shortHelp(), /rig 자리 세션이면 받는 자리를 정의가 정한다/);
    const h = seatHeader({ seat: 's', unitId: 'u1', caseId: 'c1', by: '@x가 맡김', results: ['ok'], assign: ['a'], may: [] });
    assert.equal(promptTask(`${h}\n\n할 일`), '할 일');
    assert.match(handoffText({ fromSeat: 'a', fromName: 'a-1', result: 'ok', doneText: 'd', firstSpec: Array.from({ length: 9 }, (_, i) => `l${i}`).join('\n') }), /앞 6줄\) ---\nl0\nl1\nl2\nl3\nl4\nl5\n…/);
  } finally { await stop(); }
});

test('P185 함께 넣을 것: P175 사람이 이은 하위(Sub)에게 atrium prompt가 일을 만든다, 루프를 만들 때 deliver 훅 한 번, codex 승인 인자 표', async () => {
  // P175 Sub: 사람이 판에서 하위로 이으면 사람이 정한 하위 줄 → 일 부모
  assert.equal(linkRelationPlan('sub', null, 'a'), 'sub');
  const { b, add, stop } = await board({ def: null, enable: false });
  try {
    const A = add('alpha'); const B = add('beta');
    b.ensureLink(A.sessionId, B.sessionId, { role: '리뷰어' });
    let r = await V(b).prompt(A, { name: 'beta', text: '역할 선만' });
    assert.equal(r.unit, null, '역할 선만 있는 자동 하위는 일을 만들지 않는다(0단계)');
    await until(() => B.rt.term.status === 'idle' && B.texts.length === 1);
    b.branch.setRelation(A, B, 'sub', { source: 'user', by: 'user', quiet: true }); // linkCreate가 이제 저장하는 줄
    r = await V(b).prompt(A, { name: 'beta', text: '사람이 이은 하위' });
    assert.ok(r.unit && r.unit.kind === 'new', 'P185: 일이 생긴다');
  } finally { await stop(); }
  // 루프: deliver 훅이 고친 글을 저장, 거절이면 만들지 않음, 훅이 없으면 옛처럼 바로(동기)
  const store = new Store(path.join(tmp(), 'board.db'));
  const queue = new EventEmitter(); queue.items = new Map(); let n = 0;
  queue.enqueue = (sessionId, text) => { const d = { deliveryId: `q${++n}`, sessionId, text, status: 'queued', reason: null, createdAt: Date.now() }; queue.items.set(d.deliveryId, d); store.insertDelivery(d); return d; };
  const s = { sessionId: 'A', name: 'a', kind: 'claude', cwd: 'C:/x', workspaceKey: 'k', rt: Object.assign(newRuntime({ kind: 'claude', hooked: true }), { phase: 'running', term: { status: 'idle', present: true, launchPending: false } }) };
  const seen = [];
  const fb = {
    store, queue, sessions: new Map([['A', s]]), bus: new EventEmitter(), cfg: { dataDir: tmp(), claudeProjects: tmp() }, api: { broadcast: () => {} }, adapter: { connected: true }, termOk: true,
    log: () => {}, hooked: () => true, workspaceList: () => [], resolveWorkspace: async () => ({ key: 'k' }),
    resolve: (r) => { if (r === 'a' || r === 'A') return s; throw Object.assign(new Error(r), { code: 'not_found' }); },
    summary: (x) => ({ sessionId: x.sessionId, name: x.name, kind: x.kind, state: 'ready', unseen: false, workspaceKey: 'k' }), linksOpen: () => [],
    rig: { hooks: true, active() { return this.hooks ? { def: { hooks: [{ at: 'deliver' }] } } : null; }, async deliver({ from, text }) { seen.push(from.kind); return text.includes('금지') ? { action: 'reject', reason: '금지어' } : { action: 'pass', text: `${text} [고침]` }; } },
  };
  fb.features = attachFeatures(fb, { timers: false });
  const h = fb.features.handlers;
  const v = await h['loop.create']({ session: 'a', prompt: 'ping', trigger: { type: 'interval', every: '1m' }, confirm: true });
  assert.equal(store.loops().find((l) => l.loopId === v.loopId).prompt, 'ping [고침]');
  assert.deepEqual(seen, ['human']);
  await assert.rejects(h['loop.create']({ session: 'a', prompt: '금지', trigger: { type: 'interval', every: '1m' }, confirm: true }), (e) => e.code === 'rig_rejected');
  assert.equal(store.loops().length, 1);
  fb.rig.hooks = false;
  const v2 = h['loop.create']({ session: 'a', prompt: 'pong', trigger: { type: 'interval', every: '1m' }, confirm: true });
  assert.ok(v2.loopId && !(v2 instanceof Promise), '훅이 없으면 동기');
  fb.features.loops.tick(); // 되풀이는 훅을 지나지 않는다
  assert.equal(seen.length, 2);
  store.close();
  // codex 승인 인자(사람의 atrium spawn --kind codex --mode bypassPermissions가 쓰는 표)
  assert.deepEqual(approvalArgsOf('codex', 'bypassPermissions', []).args, ['--dangerously-bypass-approvals-and-sandbox']);
  assert.deepEqual(approvalArgsOf('codex', 'bypassPermissions', ['--sandbox', 'read-only']).args, [], '호출자 인자가 이긴다');
});

// ---------- P187: 자리 세션이 건 주인(또는 런처)의 모델·노력·승인 방식을 물려받는다, 띄우기 전 훅 행에 세션·일 ----------
// 새 판의 런처 목록(id claude = Claude Code manual 모델 없음, id codex)과 이름으로 고르는 런처를 판에 둔다
function withLaunchers(b, extra = []) {
  const items = [...initialLaunchers({ oldBoard: false }).items, ...extra];
  const find = (ref) => { const r = String(ref ?? '').trim().toLowerCase(); return items.find((l) => l.id.toLowerCase() === r) || items.find((l) => l.name.toLowerCase() === r) || null; };
  b.features = { launchers: { data: () => ({ items, favorites: ['claude', 'codex'] }), find } };
  return items;
}
const spawnedOf = (b, name) => b.spawned.find((p) => p.name === name);

test('P187 종류 이름 자리(claude): 같은 이름의 런처가 있어도 건 주인(haiku·low·acceptEdits)을 물려받는다. fresh·keep, 처음과 다시 띄울 때(keep 닫힘·자리 줄)', async () => {
  const def = sampleDef();
  def.seats.reviewer = { launcher: 'claude', session: 'fresh', may: ['main'] };
  def.seats.worker.max_live = 1;
  def.seats.helper = { launcher: 'claude', session: 'keep' };
  def.flow.push({ from: 'main', on: 'assign', to: 'helper' });
  const { b, add, seat, by, stop } = await board({ def });
  try {
    withLaunchers(b);
    const main = add('lead', { model: 'haiku', effort: 'low', permissionMode: 'acceptEdits' }); seat(main, 'main');
    const inherited = (sp, name) => {
      assert.ok(sp, name);
      assert.equal(sp.launcher, undefined, `${name}: 런처 claude 길이 아니다`);
      assert.equal(sp.kind, 'claude'); assert.equal(sp.model, 'haiku'); assert.equal(sp.effort, 'low'); assert.equal(sp.permissionMode, 'acceptEdits');
      assert.equal(sp.branch.inherited.model, true); assert.equal(sp.branch.inherited.permissionMode, true);
    };
    await V(b).prompt(main, { name: 'worker', text: '첫 일' });
    const w1 = by('worker-1'); await gotUnit(w1); inherited(spawnedOf(b, 'worker-1'), 'worker-1');
    // fresh 넘김(worker ok → reviewer)
    await done(b, w1, 'ok', '했다');
    const rv1 = by('reviewer-1'); assert.ok(rv1); await gotUnit(rv1); inherited(spawnedOf(b, 'reviewer-1'), 'reviewer-1');
    // 자리 줄(max_live 1)에 섰다가 판이 띄울 때도 같다
    await V(b).prompt(main, { name: 'worker', text: '둘째 일' });
    const w2 = by('worker-2'); assert.ok(w2); await gotUnit(w2); inherited(spawnedOf(b, 'worker-2'), 'worker-2');
    const q = await V(b).prompt(main, { name: 'worker', text: '셋째 일' });
    assert.equal(q.unit.seatWait, true);
    await done(b, w2, 'failed', '못 함');
    await until(() => !!by('worker-3')); inherited(spawnedOf(b, 'worker-3'), 'worker-3');
    // keep: 처음, 닫힌 뒤 다시
    await V(b).prompt(main, { name: 'helper', text: '도와줘' });
    const h1 = by('helper'); await gotUnit(h1); inherited(spawnedOf(b, 'helper'), 'helper');
    b.closeSession(h1, 'user');
    await V(b).prompt(main, { name: 'helper', text: '다시' });
    const again = b.spawned.filter((p) => p.name === 'helper');
    assert.equal(again.length, 2); inherited(again[1], 'helper(다시)');
  } finally { await stop(); }
});

test('P187 런처 이름 자리: 그 런처의 모델·노력·승인 방식(주인 것을 물려받지 않음). 없는 이름은 막힘', async () => {
  const def = sampleDef();
  def.seats.worker.launcher = 'cheap';
  def.seats.reviewer = { launcher: 'nobody', session: 'fresh', may: ['main'] };
  const { b, add, seat, by, stop } = await board({ def });
  try {
    const [claudeL] = initialLaunchers({ oldBoard: false }).items;
    withLaunchers(b, [{ ...claudeL, id: 'lcheap', name: 'cheap', model: 'sonnet', effort: 'medium', permissionMode: 'auto' }]);
    const main = add('lead', { model: 'haiku', effort: 'low', permissionMode: 'acceptEdits' }); seat(main, 'main');
    await V(b).prompt(main, { name: 'worker', text: '일' });
    const w1 = by('worker-1'); await gotUnit(w1);
    const sp = spawnedOf(b, 'worker-1');
    assert.equal(sp.launcher, 'lcheap'); assert.equal(sp.model, undefined); assert.equal(sp.permissionMode, undefined, '모델·권한 모드는 판의 spawn이 런처에서 읽는다');
    assert.equal(sp.branch.launcher, 'cheap'); assert.equal(sp.branch.inherited.permissionMode, false); assert.equal(sp.branch.inherited.model, false);
    // 런처에도 종류에도 없는 이름: 넘김이 막히고 건이 blocked
    await done(b, w1, 'ok', '했다');
    const c = b.store.casesOf(main.workspaceKey)[0];
    await until(() => b.store.getCase(c.id).state === 'blocked');
    assert.match(b.store.getCase(c.id).blockedReason, /launcher "nobody"/);
  } finally { await stop(); }
});

test('P187 Codex 자리의 승인 방식: Codex 주인이면 주인의 호출자·모델·승인 인자를 물려받고, Claude 주인(acceptEdits)이면 그 권한 모드를 Codex 승인 인자로 옮긴다', async () => {
  const approval = ['--sandbox', 'workspace-write', '--ask-for-approval', 'on-request'];
  const { b, add, seat, by, stop } = await board();
  try {
    withLaunchers(b);
    // 견본: main keep codex, worker claude, reviewer codex
    const main = add('lead', { kind: 'codex', hooked: false, harnessPlan: { launcher: 'Codex', launcherId: 'codex', model: 'gpt-test', args: [...approval] } });
    seat(main, 'main');
    await V(b).prompt(main, { name: 'worker', text: '일' });
    const w1 = by('worker-1'); await gotUnit(w1);
    const ws = spawnedOf(b, 'worker-1');
    assert.equal(ws.kind, 'claude'); assert.equal(ws.model, null, 'Codex 주인의 모델 이름은 Claude Code에 물려주지 않는다');
    await done(b, w1, 'ok', '했다');
    const rv1 = by('reviewer-1'); assert.ok(rv1); assert.equal(rv1.kind, 'codex');
    const rs = spawnedOf(b, 'reviewer-1');
    assert.equal(rs.launcherDef.harness, 'codex'); assert.equal(rs.launcherDef.model, 'gpt-test');
    assert.deepEqual(rs.launcherDef.args.split(' '), approval, '주인의 승인 인자를 그대로');
    assert.equal(rs.branch.harness.base, 'parent');
  } finally { await stop(); }
  // Claude 주인(acceptEdits) → codex 자리: --kind codex 길(승인 인자 옮김)
  const def = sampleDef(); def.seats.worker.launcher = 'codex';
  const t = await board({ def });
  try {
    withLaunchers(t.b);
    const main = t.add('lead', { model: 'haiku', permissionMode: 'acceptEdits' }); t.seat(main, 'main');
    await V(t.b).prompt(main, { name: 'worker', text: '일' });
    const sp = spawnedOf(t.b, 'worker-1');
    assert.equal(sp.launcherDef.harness, 'codex');
    assert.deepEqual(sp.branch.harness.approvalArgs, approval);
    assert.equal(sp.branch.harness.approvalFrom, 'parent'); assert.equal(sp.branch.inherited.permissionMode, true);
  } finally { await t.stop(); }
});

test('P187 띄우기 전에 돈 deliver 훅 행에 띄운 세션과 일: 흐름 넘김(fresh), 자리 줄에 섰다가 띄운 세션, atrium child 첫 요청', async () => {
  const def = sampleDef();
  def.seats.reviewer.launcher = 'claude'; def.seats.reviewer.max_live = 1;
  def.hooks.push({ at: 'deliver', from: 'agent', run: ['node', '.atrium/hooks/flow-stamp.mjs'] });
  const { b, add, seat, by, stop } = await board({ def });
  try {
    const main = add('lead'); seat(main, 'main');
    await V(b).prompt(main, { name: 'worker', text: '일 하나' });
    await V(b).prompt(main, { name: 'worker', text: '일 둘' });
    const w1 = by('worker-1'); const w2 = by('worker-2'); await gotUnit(w1); await gotUnit(w2);
    await done(b, w1, 'ok', '하나 했다');
    const rv1 = by('reviewer-1'); assert.ok(rv1); await gotUnit(rv1);
    const u1 = b.store.db.prepare('SELECT id FROM work_units WHERE to_session = ?').get(rv1.sessionId);
    const r1 = b.store.hookRunsOfSession(rv1.sessionId, 5);
    assert.equal(r1.length, 1, 'reviewer-1의 미리 보기에 넘김 훅 줄'); assert.equal(r1[0].unitId, u1.id); assert.equal(r1[0].decision, 'pass');
    // 둘째 넘김은 자리 줄(max_live 1)에 선다 → 훅 행에 일만, 띄운 뒤 세션
    await done(b, w2, 'ok', '둘 했다');
    const waiting = b.store.seatWaitingUnits(main.workspaceKey, 'reviewer');
    assert.equal(waiting.length, 1);
    const row = b.store.hookRuns({ limit: 50 }).find((x) => x.unitId === waiting[0].id);
    assert.ok(row); assert.equal(row.sessionId, null);
    await done(b, rv1, 'ok', '좋다');
    await until(() => !!by('reviewer-2'));
    const rv2 = by('reviewer-2');
    await until(() => b.store.hookRunsOfSession(rv2.sessionId, 5).length === 1);
    assert.equal(b.store.hookRunsOfSession(rv2.sessionId, 5)[0].unitId, waiting[0].id);
    // atrium child 첫 요청(from agent): 띄운 세션과 그 일
    const out = await b.branch.spawnChild(main, { name: 'kid', prompt: '첫 요청', wait: false });
    const rk = b.store.hookRunsOfSession(out.sessionId, 5);
    assert.equal(rk.length, 1); assert.equal(rk[0].unitId, out.firstPrompt.unit);
  } finally { await stop(); }
});
