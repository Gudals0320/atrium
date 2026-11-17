// P194 단위 시험: 주인에게 돌아오는 흐름은 보고(일 없음), 건 done 판정, 상한 넘어 주인에게 = 보고 + waiting_owner, 다음 맡기기가 그 건을 잇기·새 건, atrium prompt --case,
// 주인 아닌 keep 자리는 일(docs research harness-arch.md "7단계 결과와 8단계"). 가짜 판은 p185 틀.
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
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p194-'));
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
  const cfg = { profile: 'dev', terminalSession: 'atrium-dev-p194test', port: 0, dataDir: dir, sessionsDir: path.join(dir, 'sessions'), inputQuietMs: 3000, submitConfirmMs: 3000, deliveryMaxWaitMs: 60000, submitRetries: 0 };
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


test('P194 주인에게 돌아오는 흐름은 보고: 일을 만들지 않고 판 알림 꼴로 넣으며, 열린 일이 없으면 건이 done(주인이 done을 칠 필요 없음)', async () => {
  const { b, add, seat, by, stop } = await board();
  try {
    const main = add('lead'); seat(main, 'main');
    const r = await V(b).prompt(main, { name: 'worker', text: '일: 하나를 만든다' });
    const caseId = r.unit.caseId;
    const w1 = by('worker-1'); await gotUnit(w1);
    await done(b, w1, 'ok', '만들었다');
    const rv1 = by('reviewer-1'); await gotUnit(rv1);
    const unitsBefore = b.store.unitsOfCase(caseId).length;
    const d = await done(b, rv1, 'ok', '좋다\n둘째 줄');
    assert.equal(d.claimedBy, 'flow');
    assert.deepEqual(d.flow, []);
    assert.deepEqual(d.reports, [{ seat: 'main', to: 'lead', escalated: false }]);
    assert.equal(d.case.state, 'done');
    assert.equal(b.store.unitsOfCase(caseId).length, unitsBefore, '주인에게는 일이 없다');
    await until(() => main.texts.length === 1);
    const t = main.texts[0];
    const lines = t.split('\n');
    assert.match(lines[0], /^\[Atrium 보드\] rig 건 c\w+: reviewer 자리\(@reviewer-1\)가 일 u\w+\("[^"]+"\)을 닫았다: ok$/, '보낸 자리, 값, 건 ID');
    assert.ok(lines[0].includes(caseId));
    assert.match(lines[1], /^\[Atrium 보드\] 이것은 보고다/);
    assert.deepEqual(lines.slice(2), ['좋다', '둘째 줄'], 'done 글');
    assert.equal(U(b).item(main).item, null);
    // 기록: rig_handoff(report), 연결 기록은 주인 → 하위 선의 답(reply)
    const h = evs(b, 'rig_handoff').at(-1).data;
    assert.equal(h.report, true); assert.equal(h.to, 'main'); assert.equal(h.target, 'lead'); assert.equal(h.unitId, null);
    const tr = b.store.lastTryOfUnit(b.store.unitsOfCase(caseId).at(-1).id);
    assert.equal(tr.claimedBy, 'flow'); assert.ok(tr.noticeDeliveryId);
    const l = b.store.linkByPair(main.sessionId, rv1.sessionId);
    const le = b.store.db.prepare('SELECT * FROM link_events WHERE link_id = ? AND kind = ? ORDER BY rowid').all(l.linkId, 'reply');
    assert.ok(le.some((x) => /tag":"report/.test(x.data || '') || /report/.test(JSON.stringify(x))), '주인 선에 보고');
    // rig.cases·graph
    const cases = await rigFlowHandlers(b)['rig.cases']({}, null);
    assert.equal(cases.cases[0].state, 'done');
    // 주인이 그다음 맡기면 새 건
    await until(() => main.rt.term.status === 'idle');
    const r2 = await V(b).prompt(main, { name: 'worker', text: '다음 일' });
    assert.notEqual(r2.unit.caseId, caseId);
  } finally { await stop(); }
});

test('P194 상한 넘어 주인에게 = 보고 + waiting_owner. 다음 맡기기는 그런 건이 하나면 잇고, 둘이면 새 건. --case로 고른다', async () => {
  const def = sampleDef(); def.flow[2].max = 0; delete def.cycles; // 첫 반려가 바로 else(main)로
  const { b, add, seat, by, F, stop } = await board({ def });
  try {
    const main = add('lead'); seat(main, 'main');
    const reps = () => main.texts.filter((x) => x.startsWith('[Atrium 보드] rig 건')); // 하위의 멈춤 알림은 빼고 보고만
    // 한 건을 worker ok → reviewer rejected까지(그 건의 worker 세션 이름을 받는다)
    const reject = async (wName) => {
      const w = by(wName); await gotUnit(w);
      const d1 = await done(b, w, 'ok', '했다');
      const rv = by(d1.flow[0].to); await gotUnit(rv);
      return done(b, rv, 'rejected', '틀렸다');
    };
    const rA = await V(b).prompt(main, { name: 'worker', text: '건 A' });
    const rB = await V(b).prompt(main, { name: 'worker', text: '건 B' });
    const A = rA.unit.caseId; const B = rB.unit.caseId;
    assert.notEqual(A, B, '주인이 건의 시도를 쥐지 않고 waiting_owner 건도 없으면 새 건');
    let d = await reject(rA.name);
    assert.equal(d.case.state, 'waiting_owner');
    assert.deepEqual(d.reports, [{ seat: 'main', to: 'lead', escalated: true }]);
    assert.deepEqual(d.flow, []);
    assert.equal(evs(b, 'rig_case_waiting_owner').length, 1);
    await until(() => reps().length === 1);
    assert.match(reps()[0], /되돌아감 상한을 넘어 너에게 올라왔다: flow\[2\]은 이 건에서 이미 0번 지났다/);
    assert.match(reps()[0], /건은 waiting_owner다\. 다음 `atrium prompt <자리> "<할 일>"`이 이 건을 잇는다\(건이 여럿이면 --case c\w+\)/);
    assert.match(reps()[0], /--- 건의 이력/);
    assert.equal(U(b).item(main).item, null, '주인에게 일이 없다');
    // atrium me: 내가 주인인 끝나지 않은 건
    assert.deepEqual(b.branch.me(main).rig.owned.map((x) => `${x.id} ${x.state}`).sort(), [`${A} waiting_owner`, `${B} open`].sort());
    const g = F().graph()[main.workspaceKey];
    assert.ok(g.cases.some((c) => c.id === A && c.state === 'waiting_owner'), '세션 맵 그래프에 보인다');
    // waiting_owner가 하나 → 잇는다
    await until(() => main.rt.term.status === 'idle');
    const r1 = await V(b).prompt(main, { name: 'worker', text: '다시 A' });
    assert.equal(r1.unit.caseId, A);
    assert.equal(b.store.getCase(A).state, 'open');
    assert.deepEqual(evs(b, 'rig_case_resume').at(-1).data, { caseId: A, from: 'waiting_owner', why: 'waiting_owner' });
    d = await reject(r1.name); assert.equal(d.case.state, 'waiting_owner');
    d = await reject(rB.name); assert.equal(d.case.state, 'waiting_owner');
    // 둘 → 새 건
    await until(() => main.rt.term.status === 'idle');
    const r3 = await V(b).prompt(main, { name: 'worker', text: '새 일 C' });
    assert.ok(![A, B].includes(r3.unit.caseId), 'waiting_owner 건이 둘이면 새 건');
    assert.equal(b.store.getCase(A).state, 'waiting_owner'); assert.equal(b.store.getCase(B).state, 'waiting_owner');
    // --case로 고른다
    const r4 = await V(b).prompt(main, { name: 'worker', text: 'B를 잇는다', caseId: B });
    assert.equal(r4.unit.caseId, B);
    assert.equal(b.store.getCase(B).state, 'open');
    assert.equal(evs(b, 'rig_case_resume').at(-1).data.why, 'case');
    // 잘못 고름: 없는 건, 끝난 건, 일이 아닌 보내기에 --case
    await assert.rejects(V(b).prompt(main, { name: 'worker', text: 'x', caseId: 'cnope' }), (e) => e.code === 'rig_case' && /건 cnope이 없다/.test(e.message));
    b.store.updateCase(A, { state: 'done', closedAt: Date.now() });
    await assert.rejects(V(b).prompt(main, { name: 'worker', text: 'x', caseId: A }), (e) => e.code === 'rig_case' && /이미 done/.test(e.message));
    const loose = add('loose');
    await assert.rejects(V(b).prompt(loose, { name: 'lead', text: 'x', caseId: B }), (e) => e.code === 'bad_request' && /--case는 rig 자리 세션/.test(e.message));
    // 주인이 닫히면 waiting_owner 건도 cancelled
    b.store.updateCase(r3.unit.caseId, { state: 'waiting_owner' });
    b.closeSession(main, 'test');
    assert.equal(b.store.getCase(r3.unit.caseId).state, 'cancelled');
  } finally { await stop(); }
});

test('P194 --case: 주인이 아닌 세션은 그 건을 고를 수 없다. 계약·도움말에 --case', async () => {
  const def = sampleDef();
  def.seats.helper = { launcher: 'claude', session: 'keep' };
  def.flow.push({ from: 'helper', on: 'assign', to: 'worker' });
  delete def.cycles;
  const { b, add, seat, by, stop } = await board({ def });
  try {
    const main = add('lead'); seat(main, 'main');
    const helper = add('aide'); seat(helper, 'helper');
    const r = await V(b).prompt(main, { name: 'worker', text: '메인의 건' });
    await assert.rejects(V(b).prompt(helper, { name: 'worker', text: 'x', caseId: r.unit.caseId }), (e) => e.code === 'rig_case' && /주인\(@lead\)이 아니라/.test(e.message));
  } finally { await stop(); }
  const p = VERBS.find((v) => v.name === 'prompt');
  assert.ok(p.args.includes('[--case 건]'));
  assert.match(p.does, /--case는 이을 건을 고른다/);
  assert.ok(VERBS.find((v) => v.name === 'done').out.includes('reports'));
  assert.equal(CONTRACT_VERSION, 4, '더하기만이라 4 그대로');
  assert.match(shortHelp(), /\[--case 건\]/);
  const src = fs.readFileSync(path.join(HERE, '..', 'bin', 'atrium-child.mjs'), 'utf8');
  assert.match(src, /atrium prompt <이름> "<할 일>" \[--wait \| --now\] \[--timeout ms\] \[--file 경로\] \[--case 건\]/);
  assert.match(src, /caseId: String\(flags\.case\)\.trim\(\)/);
});

test('P194 주인이 아닌 keep 자리로 가는 줄은 그대로 일이다(메인이 아닌 세션이 건을 열었을 때의 메인)', async () => {
  const def = sampleDef();
  def.seats.helper = { launcher: 'claude', session: 'keep' };
  def.flow.push({ from: 'helper', on: 'assign', to: 'worker' });
  delete def.cycles;
  const { b, add, seat, by, stop } = await board({ def });
  try {
    const main = add('lead'); seat(main, 'main');
    const helper = add('aide'); seat(helper, 'helper');
    const r = await V(b).prompt(helper, { name: 'worker', text: '도우미의 건' });
    const caseId = r.unit.caseId;
    assert.equal(b.store.getCase(caseId).owner, helper.sessionId);
    const w1 = by('worker-1'); await gotUnit(w1);
    await done(b, w1, 'ok', '했다');
    const rv1 = by('reviewer-1'); await gotUnit(rv1);
    const d = await done(b, rv1, 'ok', '좋다');
    assert.equal(d.reports, undefined, '보고가 아니다');
    assert.equal(d.flow.length, 1); assert.equal(d.flow[0].seat, 'main'); assert.equal(d.flow[0].to, 'lead');
    assert.equal(d.case.state, 'open');
    await gotUnit(main);
    assert.match(main.texts[0], /reviewer 자리\(@reviewer-1\)가 done ok로 넘긴 일이다/);
    const md = await done(b, main, 'ok', '받았다');
    assert.equal(md.case.state, 'done');
  } finally { await stop(); }
});
