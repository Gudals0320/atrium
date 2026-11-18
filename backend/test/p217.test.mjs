// P217 단위 시험: rig 장부(F0-2, harness-arch 18.1·18.2)와 구조 지도 데이터(F0-3, 18.3).
// 장부에 쓰는 곳은 도움 함수 하나(소스 검사), 닫힌 kind 목록, 18.1 자리마다 장부 줄과 ref, atrium rig log --events 거르기·권한, 판 API rig.events,
// rig.map(복잡한 견본 정의 + 흉내 장부 → 마디·변·관문·passed 차례·now·next·others, 담아 두기와 무효화). 가짜 판은 p197 틀
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import { Store } from '../src/store.mjs';
import { newRuntime, applyHook, applyTermStatus, deriveState, applyAgentReleased } from '../src/state.mjs';
import { workspaceOf } from '../src/git.mjs';
import { DeliveryQueue } from '../src/delivery.mjs';
import { Branch } from '../src/branch.mjs';
import { Rig, validateRig } from '../src/rig.mjs';
import { RigAmp } from '../src/rig-amp.mjs';
import { RIG_EVENT_KINDS, rigEvent, humanMessage, parseSince, eventLine } from '../src/rig-ledger.mjs';
import { buildRigMap, defGraph, foldCases, RigMap, rigMapHandlers, MAP_NODE_TYPES, MAP_EDGE_TYPES, MAP_NOW_STATES, GATE_STATES, E } from '../src/rig-map.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE = path.join(HERE, 'fixtures', 'rig-flow-sample');
const COMPLEX = path.join(HERE, 'fixtures', 'rig-map-complex');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p217-'));
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
  const cfg = { profile: 'dev', terminalSession: 'atrium-dev-p217test', port: 0, dataDir: dir, sessionsDir: path.join(dir, 'sessions'), inputQuietMs: 3000, submitConfirmMs: 3000, deliveryMaxWaitMs: 60000, submitRetries: 0 };
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
const ledger = (b, key, q = {}) => b.store.rigEvents({ ws: key, limit: 10000, ...q });
const kinds = (rows) => rows.map((r) => r.kind);

// 설계 18.1의 kind 목록(지금 + 로드맵 0단계). 1단계 기능은 여기에 더한다
const DESIGN_KINDS = ['case_open', 'case_waiting_owner', 'case_resumed', 'case_blocked', 'case_done', 'case_cancelled', 'assign', 'handoff', 'report', 'escalate', 'try_start', 'done', 'try_stopped', 'retried', 'gate', 'tool_start', 'tool_end', 'seat_spawn', 'seat_queue', 'seat_set', 'human_message', 'rig_enabled', 'rig_disabled', 'rig_version', 'rig_invalid', 'rig_protected', 'rig_rollback', 'cycle', 'cleanup',
  'doc_load', 'doc_changed', 'doc_foreign_write', 'doc_stale', // P219: rig 2 문서(rig2-design 5절)
  'loop_trigger', 'loop_skip', 'loop_next', 'loop_paused', 'loop_resumed', 'run_paused', 'run_resumed', 'run_named', // P221: rig 2 고리(rig2-design 5절)
  'artifact_filed', 'artifact_superseded', 'artifact_accepted', 'artifact_warning']; // P222: rig 2 산출물 섹터(artifact_moved는 move가 들어올 때)

test('P217 소스 검사: rig_events에 쓰는 곳은 rigEvent 하나(store.insertRigEvent는 rig-ledger.mjs만 부른다), SQL은 store-rig.mjs에만(키 옮기기는 store-merge.mjs)', () => {
  const dirs = [path.join(HERE, '..', 'src'), path.join(HERE, '..', 'bin')];
  const files = dirs.flatMap((d) => fs.readdirSync(d, { recursive: true }).filter((f) => /\.m?js$/.test(f)).map((f) => path.join(d, f)));
  const callers = []; const sql = [];
  for (const f of files) {
    const t = fs.readFileSync(f, 'utf8'); const base = path.relative(path.join(HERE, '..'), f).split(path.sep).join('/');
    if (/insertRigEvent\s*\(/.test(t.replace(/insertRigEvent\(x\) \{/, ''))) callers.push(base);
    if (/(INSERT\s+INTO|DELETE\s+FROM)\s+rig_events\b/i.test(t)) sql.push(base);
    if (/UPDATE\s+rig_events\b/i.test(t)) assert.equal(base, 'src/store-merge.mjs', '장부를 고치는 곳은 워크스페이스 키 옮기기뿐');
  }
  assert.deepEqual(callers.sort(), ['src/rig-ledger.mjs', 'src/store-rig.mjs'].filter((x) => x !== 'src/store-rig.mjs' || callers.includes(x)).sort());
  assert.ok(!callers.some((x) => x !== 'src/rig-ledger.mjs' && x !== 'src/store-rig.mjs'), `insertRigEvent를 부르는 곳: ${callers.join(', ')}`);
  assert.deepEqual(sql, ['src/store-rig.mjs']);
  const ledgerSrc = fs.readFileSync(path.join(HERE, '..', 'src', 'rig-ledger.mjs'), 'utf8');
  assert.equal((ledgerSrc.match(/insertRigEvent\(/g) || []).length, 1, 'rig-ledger.mjs 안에서도 rigEvent 한 곳');
});

test('P217 kind 목록은 닫혀 있다: 설계 18.1과 같고, 모르는 kind·actor는 거절, 쓰면 seq가 늘고 rig.events가 간다', async () => {
  assert.deepEqual([...RIG_EVENT_KINDS].sort(), [...DESIGN_KINDS].sort());
  const { b, ws, stop } = await board({ def: sampleDef() });
  try {
    assert.throws(() => rigEvent(b, { kind: 'case_named', ws: ws.key }), (e) => e.code === 'bad_kind');
    assert.throws(() => rigEvent(b, { kind: 'rig_case_open', ws: ws.key }), (e) => e.code === 'bad_kind');
    assert.throws(() => rigEvent(b, { kind: 'gate', ws: ws.key, actor: 'robot' }), (e) => e.code === 'bad_kind');
    assert.equal(ledger(b, ws.key).length, 0, '거절한 줄은 쓰지 않았다');
    const a = rigEvent(b, { kind: 'rig_enabled', ws: ws.key, actor: 'human', text: 'x'.repeat(500) });
    const c = rigEvent(b, { kind: 'rig_disabled', ws: ws.key, actor: 'human' });
    assert.ok(c.seq > a.seq);
    const rows = ledger(b, ws.key);
    assert.equal(rows[0].text.length <= 200, true);
    assert.deepEqual((b.casts || []).filter((x) => x.n === 'rig.events').map((x) => x.d.seq), [a.seq, c.seq]);
    assert.equal(rigEvent(b, { kind: 'cycle' }), null, '워크스페이스를 모르면 쓰지 않는다');
    // seq는 지운 뒤에도 다시 쓰지 않는다(AUTOINCREMENT)
    b.store.db.exec('DELETE FROM rig_events');
    const d = rigEvent(b, { kind: 'rig_enabled', ws: ws.key, actor: 'human' });
    assert.ok(d.seq > c.seq);
  } finally { await stop(); }
});

test('P217 보관: 워크스페이스 줄이 상한을 넘으면 열린 건이 아닌 줄의 오래된 것부터 지운다', async () => {
  const { b, ws, stop } = await board({ def: sampleDef() });
  try {
    b.cfg.rigEventsMax = 20;
    const key = ws.key;
    b.store.insertCase({ id: 'copen', workspaceKey: key, owner: 'x', state: 'open', createdAt: 1 });
    b.store.insertCase({ id: 'cdone', workspaceKey: key, owner: 'x', state: 'done', createdAt: 1 });
    for (let i = 0; i < 10; i++) rigEvent(b, { kind: 'handoff', ws: key, caseId: 'copen', actor: 'board' });
    for (let i = 0; i < 40; i++) rigEvent(b, { kind: 'handoff', ws: key, caseId: 'cdone', actor: 'board' });
    const rows = ledger(b, key);
    assert.ok(rows.length <= 20 + 2, `남은 줄 ${rows.length}`);
    assert.equal(rows.filter((r) => r.caseId === 'copen').length, 10, '열린 건의 줄은 지우지 않는다');
  } finally { await stop(); }
});

test('P217 18.1 자리마다 장부 줄: 켜기·버전·자리·건·맡김·넘김·보고·올림·시도·멈춤·관문(ref = rig_hook_runs.id)·도구(ref = tool_runs.id)·사람 글·주기·정리·되돌림·잘못된 정의·보호·끄기', async () => {
  const def = sampleDef();
  const { b, dir, ws, add, F, seat, by, stop } = await board({ def, enable: false });
  try {
    const key = ws.key;
    b.rig.setEnabled(key, true, 'human');
    let L = ledger(b, key);
    assert.deepEqual(kinds(L).slice(0, 2).sort(), ['rig_enabled', 'rig_version']);
    assert.equal(L.find((r) => r.kind === 'rig_version').data.changed_by, 'unknown');
    assert.equal(L.find((r) => r.kind === 'rig_enabled').actor, 'human');
    const main = add('main'); seat(main, 'main');
    assert.equal(ledger(b, key, { kinds: ['seat_set'] })[0].seat, 'main');
    // 건 1: main → worker(assign) → worker ok → reviewer(handoff) → reviewer ok → main(주인 보고)
    const r1 = await V(b).prompt(main, { name: 'worker', text: 'Build the thing' });
    const c1 = r1.unit.caseId;
    const w1 = by(r1.name); await gotUnit(w1);
    let d = await done(b, w1, 'ok', 'built');
    const rv = by(d.flow[0].to); await gotUnit(rv);
    await done(b, rv, 'ok', 'looks good');
    await until(() => b.store.getCase(c1).state === 'done', 4000);
    const C1 = ledger(b, key, { caseIds: [c1] });
    const k1 = kinds(C1);
    for (const k of ['case_open', 'assign', 'seat_spawn', 'try_start', 'try_stopped', 'done', 'gate', 'handoff', 'report', 'case_waiting_owner', 'case_done']) assert.ok(k1.includes(k), `건 1에 ${k}가 없다: ${k1.join(', ')}`);
    const as = C1.find((r) => r.kind === 'assign');
    assert.deepEqual([as.fromSeat, as.toSeat, as.line, as.actor, as.defN], ['main', 'worker', 0, 'agent', 1]);
    const ho = C1.find((r) => r.kind === 'handoff');
    assert.deepEqual([ho.fromSeat, ho.toSeat, ho.line, ho.value, ho.n, ho.max], ['worker', 'reviewer', 1, 'ok', null, null]);
    const rp = C1.find((r) => r.kind === 'report');
    assert.deepEqual([rp.fromSeat, rp.toSeat, rp.line, rp.value], ['reviewer', '@owner', 3, 'ok']);
    assert.ok(rp.ref && b.store.getDelivery(rp.ref), 'report ref = 전달 ID');
    const g = C1.find((r) => r.kind === 'gate');
    assert.equal(g.data.at, 'deliver'); assert.equal(g.value, 'pass'); assert.equal(g.toSeat, 'reviewer'); assert.equal(g.line, 1);
    const hr = b.store.hookRuns({ workspaceKey: key }).find((h) => String(h.id) === g.ref);
    assert.ok(hr, 'gate ref = rig_hook_runs.id'); assert.equal(hr.decision, 'pass');
    const ts = C1.find((r) => r.kind === 'try_start'); assert.ok(ts.data.queued_ms >= 0); assert.ok(ts.tryId);
    const stp = C1.find((r) => r.kind === 'try_stopped'); assert.equal(stp.value, 'idle_no_done');
    // 건 2: 반려 셋째에 else(main = 주인)로 올라감(escalate, waiting_owner) → --case로 잇기(case_resumed)
    await until(() => main.rt.term.status === 'idle');
    const r2 = await V(b).prompt(main, { name: 'worker', text: 'Fix the bug' });
    const c2 = r2.unit.caseId;
    let wName = r2.name;
    for (let i = 0; i < 3; i++) {
      const w = by(wName); await gotUnit(w);
      d = await done(b, w, 'ok', 'fixed');
      const r = by(d.flow[0].to); await gotUnit(r);
      d = await done(b, r, 'rejected', 'still broken');
      if (d.flow && d.flow.length) wName = d.flow[0].to;
    }
    assert.equal(b.store.getCase(c2).state, 'waiting_owner');
    const C2 = ledger(b, key, { caseIds: [c2] });
    const hs = C2.filter((r) => r.kind === 'handoff' && r.line === 2);
    assert.deepEqual(hs.map((r) => [r.n, r.max]), [[1, 2], [2, 2]]);
    const es = C2.find((r) => r.kind === 'escalate');
    assert.deepEqual([es.line, es.toSeat, es.n, es.max, es.value], [2, '@owner', 1, 2, 'rejected']);
    assert.ok(C2.some((r) => r.kind === 'case_waiting_owner' && r.value === 'escalated'));
    await until(() => main.rt.term.status === 'idle');
    await V(b).prompt(main, { name: 'worker', text: 'Try once more', caseId: c2 });
    assert.ok(ledger(b, key, { caseIds: [c2], kinds: ['case_resumed'] }).length === 1);
    // 막힘(block을 부르는 자리)
    F().block(b.store.getCase(c2), 'test block');
    assert.equal(ledger(b, key, { caseIds: [c2], kinds: ['case_blocked'] })[0].text, 'test block');
    // 자리 줄(seat_queue): worker max_live 1로 줄인 정의에서 맡김 둘
    // (건 2의 worker가 열린 시도를 쥐고 있다)
    // 도구: worker 자리 세션이 summary를 돌린다(건 2의 열린 일)
    const wOpen = [...b.sessions.values()].find((s) => s.rigSeat === 'worker' && b.store.openTryOf(s.sessionId));
    assert.ok(wOpen, '열린 worker');
    const tr = await b.branch.tools.run(wOpen, { tool: 'summary', args: [], waitMs: 10000 });
    assert.equal(tr.run.status, 'done');
    const T = ledger(b, key, { kinds: ['tool_start', 'tool_end'] });
    assert.deepEqual(kinds(T), ['tool_start', 'tool_end']);
    assert.ok(T.every((r) => r.ref === tr.run.id && r.caseId === c2 && r.seat === 'worker'), 'tool ref = tool_runs.id, 건과 자리');
    assert.equal(T[1].value, 'done'); assert.equal(T[1].data.exit, 0);
    // 사람 글(human_message)
    humanMessage(b, wOpen, 'd-test', 'please also add tests');
    const hm = ledger(b, key, { kinds: ['human_message'] })[0];
    assert.deepEqual([hm.caseId, hm.seat, hm.fromSeat, hm.toSeat, hm.actor, hm.ref], [c2, 'worker', '@human', 'worker', 'human', 'd-test']);
    // 관문(훅 아닌 것): stopVerify 돌려보냄
    const amp = new RigAmp(b);
    amp.stop(wOpen, { key, seat: 'worker', r: b.rig.active(key) }, {});
    const sv = ledger(b, key, { kinds: ['gate'] }).find((r) => r.data.at === 'stop-verify');
    assert.ok(sv && sv.caseId === c2 && sv.value === 'reject');
    // 세션 닫힘: 시도 멈춤(closed)
    b.closeSession(wOpen, 'test');
    assert.ok(ledger(b, key, { caseIds: [c2], kinds: ['try_stopped'] }).some((r) => r.value === 'closed'));
    // 주기
    const r = b.rig.active(key);
    const cy = await F().fireCycle(key, r, r.def.cycles[0], { since: Date.now() - 3600000, now: Date.now() });
    const cyc = ledger(b, key, { caseIds: [cy.caseId] });
    assert.ok(kinds(cyc).includes('cycle')); assert.equal(cyc.find((x) => x.kind === 'case_open').actor, 'cycle');
    // 정리(끝난 건 1)
    await b.branch.rigAdmin.cleanup(key, c1, { by: 'human' });
    assert.equal(ledger(b, key, { kinds: ['cleanup'] })[0].caseId, c1);
    // 주인이 닫히면 열린 건은 cancelled
    b.closeSession(main, 'test');
    assert.ok(ledger(b, key, { kinds: ['case_cancelled'] }).length >= 1);
    // 정의 바뀜(새 버전), 되돌림, 잘못된 정의, 보호
    const def2 = { ...def, name: 'v2' }; writeRig(dir, def2); b.rig.read(key);
    assert.equal(ledger(b, key, { kinds: ['rig_version'] }).length, 2);
    await b.branch.rigAdmin.rollback(key, 1, { by: 'human' });
    const rb = ledger(b, key, { kinds: ['rig_rollback'] })[0]; assert.equal(rb.value, '1'); assert.equal(rb.actor, 'human');
    fs.writeFileSync(path.join(dir, '.atrium', 'rig.json'), '{ not json'); const t2 = new Date(Date.now() + 500000); fs.utimesSync(path.join(dir, '.atrium', 'rig.json'), t2, t2);
    b.rig.read(key);
    assert.equal(ledger(b, key, { kinds: ['rig_invalid'] }).length, 1);
    b.branch.rigAdmin.protect(key, { pointer: '/seats/reviewer' });
    writeRig(dir, { ...def, seats: { ...def.seats, reviewer: { ...def.seats.reviewer, max_live: 1 } } }); b.rig.read(key);
    assert.equal(ledger(b, key, { kinds: ['rig_protected'] }).length, 1);
    b.rig.setEnabled(key, false, 'human');
    assert.equal(ledger(b, key, { kinds: ['rig_disabled'] }).length, 1);
    // 모든 줄의 kind는 목록 안
    assert.ok(ledger(b, key).every((x) => RIG_EVENT_KINDS.includes(x.kind)));
  } finally { await stop(); }
});

test('P217 자리 줄(seat_queue)과 줄에서 나온 시도(try_start data.queued_ms)', async () => {
  const def = sampleDef(); def.seats.worker.max_live = 1;
  const { b, ws, add, seat, by, stop } = await board({ def });
  try {
    const key = ws.key;
    const main = add('main'); seat(main, 'main');
    const r1 = await V(b).prompt(main, { name: 'worker', text: 'one' });
    await gotUnit(by(r1.name));
    await until(() => main.rt.term.status === 'idle');
    const r2 = await V(b).prompt(main, { name: 'worker', text: 'two' });
    assert.ok(r2.seatWait || r2.unit, 'two는 줄에 선다');
    const q = ledger(b, key, { kinds: ['seat_queue'] });
    assert.equal(q.length, 1); assert.equal(q[0].toSeat, 'worker'); assert.equal(q[0].max, 1);
    // 첫 일이 닫히면 줄 선 일이 세션을 얻는다
    await done(b, by(r1.name), 'failed', 'nope');
    await until(() => ledger(b, key, { kinds: ['try_start'] }).some((x) => x.unitId === q[0].unitId), 4000);
    const ts = ledger(b, key, { kinds: ['try_start'] }).find((x) => x.unitId === q[0].unitId);
    assert.ok(ts.data.later); assert.ok(ts.data.queued_ms >= 0);
  } finally { await stop(); }
});

test('P217 atrium rig log --events: 거르기(--case·--since·--kinds·--limit)와 권한(관리자·제작 세션 전체, 자리 세션 자기 건, 그 밖 거절), 판 API rig.events', async () => {
  const { b, ws, add, seat, by, stop } = await board({ def: sampleDef() });
  try {
    const key = ws.key;
    const main = add('main'); seat(main, 'main');
    const r1 = await V(b).prompt(main, { name: 'worker', text: 'A' });
    const w1 = by(r1.name); await gotUnit(w1);
    await until(() => main.rt.term.status === 'idle');
    const r2 = await V(b).prompt(main, { name: 'worker', text: 'B' });
    const w2 = by(r2.name); await gotUnit(w2);
    const [cA, cB] = [r1.unit.caseId, r2.unit.caseId];
    const A = b.branch.rigAdmin;
    // 관리자 자리(main = manager): 전체
    let x = await A.verb(main, { op: 'log', events: true });
    assert.ok(x.rows.some((r) => r.caseId === cA) && x.rows.some((r) => r.caseId === cB));
    assert.equal(x.last, b.store.lastRigSeq(key));
    assert.ok(x.rows.every((r) => typeof r.shown === 'string' && r.shown.startsWith('#')));
    // 장부 차례: 맡김 → 자리 세션 띄움 → 시도 시작
    const cAk = x.rows.filter((r) => r.caseId === cA).map((r) => r.kind);
    assert.ok(cAk.indexOf('assign') < cAk.indexOf('seat_spawn') && cAk.indexOf('seat_spawn') < cAk.indexOf('try_start'), cAk.join(','));
    // --case, --kinds, --since(seq와 시각), --limit
    x = await A.verb(main, { op: 'log', events: true, case: cA, kinds: 'assign,try_start' });
    assert.deepEqual([...new Set(x.rows.map((r) => r.kind))].sort(), ['assign', 'try_start']);
    assert.ok(x.rows.every((r) => r.caseId === cA));
    const mid = x.rows[0].seq;
    const after = await A.verb(main, { op: 'log', events: true, since: String(mid) });
    assert.ok(after.rows.every((r) => r.seq > mid) && after.rows.length > 0);
    const tAfter = await A.verb(main, { op: 'log', events: true, since: new Date(Date.now() + 60000).toISOString() });
    assert.equal(tAfter.rows.length, 0);
    const lim = await A.verb(main, { op: 'log', events: true, limit: 2 });
    assert.equal(lim.rows.length, 2); assert.equal(lim.more, true);
    assert.ok(lim.rows[1].seq > lim.rows[0].seq && lim.rows[0].seq > mid, '커서 없이 부르면 최근 줄(오래된 것부터)');
    await assert.rejects(A.verb(main, { op: 'log', events: true, kinds: 'nope' }), (e) => e.code === 'bad_request');
    // 자리 세션: --case 없이 지금 쥔 건만, 남의 건은 거절
    x = await A.verb(w1, { op: 'log', events: true });
    assert.ok(x.rows.length > 0 && x.rows.every((r) => r.caseId === cA));
    await assert.rejects(A.verb(w1, { op: 'log', events: true, case: cB }), (e) => e.code === 'forbidden');
    x = await A.verb(w2, { op: 'log', events: true, case: cB });
    assert.ok(x.rows.every((r) => r.caseId === cB));
    // 자리 없는 세션은 거절, 제작 세션은 전체
    const plain = add('plain');
    await assert.rejects(A.verb(plain, { op: 'log', events: true }), (e) => e.code === 'forbidden');
    const orig = b.rigSetup.isWorkspaceBuilder; b.rigSetup.isWorkspaceBuilder = (s) => s === plain;
    try { x = await A.verb(plain, { op: 'log', events: true }); assert.ok(x.rows.some((r) => r.caseId === cB) && x.rows.some((r) => r.caseId === cA)); }
    finally { b.rigSetup.isWorkspaceBuilder = orig; }
    // 판 API rig.events(사람)
    const H = rigMapHandlers(b);
    const y = await H['rig.events']({ workspace: key, case: cB, kinds: ['case_open'] });
    assert.equal(y.rows.length, 1); assert.equal(y.rows[0].caseId, cB);
    // since 꼴
    assert.deepEqual(parseSince('12'), { sinceSeq: 12 });
    assert.deepEqual(parseSince(String(Date.UTC(2026, 0, 1))), { sinceT: Date.UTC(2026, 0, 1) });
    assert.throws(() => parseSince('yesterday-ish'), (e) => e.code === 'bad_request');
    assert.match(eventLine({ seq: 3, t: 0, kind: 'handoff', caseId: 'c1', seat: 'w', fromSeat: 'w', toSeat: 'r', line: 1, value: 'ok', n: 1, max: 2 }), /#3 .* handoff · 건 c1 .* w → r · flow\[1\] · = ok · 1\/2번/);
  } finally { await stop(); }
});

// ---------- 구조 지도(견본 정의 + 흉내 장부) ----------
const complexDef = () => { const raw = JSON.parse(fs.readFileSync(path.join(COMPLEX, '.atrium', 'rig.json'), 'utf8')); const v = validateRig(raw, { root: COMPLEX }); assert.ok(v.ok, v.reason); return v.def; };
// 흉내 장부: 건 K1(결제 재시도 리팩터링 흐름)과 K2(자리 줄에 선 조사)
function mockLedger() {
  const rows = []; let seq = 0; let t = 1000;
  const ev = (kind, x = {}) => { rows.push({ seq: ++seq, t: (t += 1000), ws: 'w', defN: 7, kind, caseId: 'K1', unitId: null, tryId: null, seat: null, session: null, fromSeat: null, toSeat: null, line: null, value: null, n: null, max: null, actor: 'board', ref: null, text: null, data: null, ...x }); };
  ev('case_open', { seat: 'lead', session: 'S-lead', actor: 'agent' });
  ev('assign', { unitId: 'u1', fromSeat: 'lead', toSeat: 'researcher', line: 0, value: 'assign', data: { to: 'S-r1' } }); // 1
  ev('try_start', { unitId: 'u1', seat: 'researcher', session: 'S-r1' });
  ev('done', { unitId: 'u1', seat: 'researcher', session: 'S-r1', value: 'ok' });
  ev('report', { unitId: 'u1', fromSeat: 'researcher', toSeat: '@owner', value: 'ok', data: { ownerSeat: 'lead' } }); // 2
  ev('assign', { unitId: 'u2', fromSeat: 'lead', toSeat: 'implementer', line: 1, value: 'assign', data: { to: 'S-i1' } }); // 3
  ev('try_start', { unitId: 'u2', seat: 'implementer', session: 'S-i1' });
  ev('tool_start', { unitId: 'u2', seat: 'implementer', ref: 'trA', data: { tool: 'test' } });
  ev('gate', { unitId: 'u2', seat: 'implementer', value: 'pass', actor: 'hook', ref: '11', data: { at: 'tool-after', hook: 3, tool: 'test' } });
  ev('tool_end', { unitId: 'u2', seat: 'implementer', ref: 'trA', value: 'done', data: { tool: 'test', exit: 0 } });
  ev('gate', { unitId: 'u2', seat: 'implementer', value: 'pass', actor: 'hook', ref: '12', data: { at: 'done', hook: 1, result: 'ok' } });
  ev('done', { unitId: 'u2', seat: 'implementer', session: 'S-i1', value: 'ok' });
  ev('handoff', { unitId: 'u3', fromSeat: 'implementer', toSeat: 'reviewer', line: 2, value: 'ok', data: { to: 'S-rv1' } }); // 4
  ev('handoff', { unitId: 'u4', fromSeat: 'implementer', toSeat: 'security', line: 2, value: 'ok', data: { to: 'S-s1' } }); // 5
  ev('try_start', { unitId: 'u3', seat: 'reviewer', session: 'S-rv1' });
  ev('try_start', { unitId: 'u4', seat: 'security', session: 'S-s1' });
  ev('done', { unitId: 'u4', seat: 'security', value: 'ok' });
  ev('report', { unitId: 'u4', fromSeat: 'security', toSeat: '@owner', value: 'ok', data: { ownerSeat: 'lead' } }); // 6
  ev('done', { unitId: 'u3', seat: 'reviewer', value: 'rejected' });
  ev('handoff', { unitId: 'u5', fromSeat: 'reviewer', toSeat: 'implementer', line: 3, value: 'rejected', n: 1, max: 2, data: { to: 'S-i2' } }); // 7
  ev('try_start', { unitId: 'u5', seat: 'implementer', session: 'S-i2' });
  ev('done', { unitId: 'u5', seat: 'implementer', value: 'ok' });
  ev('handoff', { unitId: 'u6', fromSeat: 'implementer', toSeat: 'reviewer', line: 2, value: 'ok', data: { to: 'S-rv2' } }); // 8
  ev('handoff', { unitId: 'u7', fromSeat: 'implementer', toSeat: 'security', line: 2, value: 'ok', data: { to: 'S-s2' } }); // 9
  ev('try_start', { unitId: 'u6', seat: 'reviewer', session: 'S-rv2' });
  ev('try_start', { unitId: 'u7', seat: 'security', session: 'S-s2' });
  ev('done', { unitId: 'u6', seat: 'reviewer', value: 'ok' });
  ev('gate', { seat: 'reviewer', fromSeat: 'reviewer', toSeat: 'docs', line: 4, value: 'pass', actor: 'hook', ref: '20', data: { at: 'deliver', hook: 0, from: 'flow' } });
  ev('handoff', { unitId: 'u8', fromSeat: 'reviewer', toSeat: 'docs', line: 4, value: 'ok', data: { to: 'S-d1' } }); // 10
  ev('try_start', { unitId: 'u8', seat: 'docs', session: 'S-d1' });
  ev('done', { unitId: 'u8', seat: 'docs', value: 'ok' });
  ev('gate', { seat: 'docs', fromSeat: 'docs', toSeat: 'merger', line: 5, value: 'rewrite', actor: 'hook', ref: '21', data: { at: 'deliver', hook: 0, from: 'flow' } });
  ev('handoff', { unitId: 'u9', fromSeat: 'docs', toSeat: 'merger', line: 5, value: 'ok', data: { to: 'S-m1' } }); // 11
  ev('try_start', { unitId: 'u9', seat: 'merger', session: 'S-m1' });
  ev('gate', { unitId: 'u9', seat: 'merger', value: 'reject', actor: 'hook', ref: '22', data: { at: 'tool-before', hook: 2, tool: 'merge' } });
  ev('try_stopped', { unitId: 'u9', seat: 'merger', session: 'S-m1', value: 'idle_no_done' });
  ev('gate', { unitId: 'u5', seat: 'implementer', value: 'reject', actor: 'board', data: { at: 'pre-tool', hook: null, why: 'writes', target: 'src/outside.js' } });
  ev('human_message', { unitId: 'u7', seat: 'security', session: 'S-s2', fromSeat: '@human', toSeat: 'security', actor: 'human', text: 'check the token path too' });
  ev('tool_start', { seat: 'lead', session: 'S-lead', ref: 'trL', data: { tool: 'test' } });
  ev('gate', { seat: 'lead', session: 'S-lead', value: 'pass', actor: 'hook', ref: '30', data: { at: 'tool-after', hook: 3, tool: 'test' } });
  // 건 K2: 자리 줄에 선 조사
  ev('case_open', { caseId: 'K2', seat: 'lead', session: 'S-lead', actor: 'agent' });
  ev('assign', { caseId: 'K2', unitId: 'v1', fromSeat: 'lead', toSeat: 'researcher', line: 0, value: 'assign', data: { queued: true } });
  ev('seat_queue', { caseId: 'K2', unitId: 'v1', seat: 'researcher', toSeat: 'researcher', n: 1, max: 3 });
  // 건 K0: 끝난 건(목록에만)
  ev('case_open', { caseId: 'K0', seat: 'lead', session: 'S-lead' });
  ev('case_done', { caseId: 'K0' });
  return rows;
}

test('P217 rig.map 정의 그래프: 복잡한 견본(자리 7, 훅 5, 도구 2, 주기 1, 동시 갈래, 되돌림) → 마디·변·관문, 종류는 닫힌 목록', () => {
  const def = complexDef();
  const g = defGraph(def, { n: 7, hash: 'h7', protectedFiles: ['tests/', '.atrium/hooks/'] });
  assert.ok(g.nodes.every((n) => MAP_NODE_TYPES.includes(n.type)));
  assert.ok(g.edges.every((e) => MAP_EDGE_TYPES.includes(e.type)));
  const seats = g.nodes.filter((n) => n.type === 'seat');
  assert.deepEqual(seats.map((n) => n.label), ['lead', 'researcher', 'implementer', 'reviewer', 'security', 'docs', 'merger']);
  const lead = seats[0].meta; assert.equal(lead.manager, true); assert.equal(lead.session, 'keep');
  const impl = seats.find((n) => n.label === 'implementer').meta;
  assert.deepEqual([impl.worktree, impl.model, impl.writes, impl.tools], [true, 'sonnet', ['items/{item}/'], ['test']]);
  assert.equal(seats.find((n) => n.label === 'researcher').meta.maxLive, 3);
  assert.equal(seats.find((n) => n.label === 'reviewer').meta.writes, false);
  assert.deepEqual(g.nodes.filter((n) => n.type === 'tool').map((n) => n.id).sort(), ['tool:merge', 'tool:test']);
  assert.deepEqual(g.nodes.filter((n) => n.type === 'cycle').map((n) => n.id), ['cycle:0']);
  const files = g.nodes.filter((n) => n.type === 'file');
  assert.deepEqual(files.map((n) => n.meta.path).sort(), ['.atrium/hooks/', 'docs/', 'items/{item}/', 'tests/']);
  assert.ok(files.find((n) => n.meta.path === 'tests/').meta.protected);
  for (const id of ['human', 'builder', 'def']) assert.ok(g.nodes.some((n) => n.id === id));
  assert.deepEqual(g.nodes.find((n) => n.id === 'def').meta.seats, 7);
  const by = (t) => g.edges.filter((e) => e.type === t).map((e) => e.id).sort();
  assert.deepEqual(by('assign'), [E.assign(0), E.assign(1)].sort());
  // 동시 갈래: 한 줄의 to 둘은 결과 변 둘
  assert.ok(by('result').includes(E.result(2, 'reviewer')) && by('result').includes(E.result(2, 'security')));
  const back = g.edges.find((e) => e.id === E.result(3, 'implementer')); assert.deepEqual([back.meta.value, back.meta.max, back.meta.else], ['rejected', 2, 'lead']);
  assert.deepEqual(by('else'), [E.else(3), E.else(6)].sort());
  assert.equal(g.edges.find((e) => e.id === E.else(6)).to, 'seat:lead', 'else가 없으면 manager');
  // 주인 보고: 줄 없는 값이 있는 받는 자리마다 하나
  const rep = Object.fromEntries(g.edges.filter((e) => e.type === 'report').map((e) => [e.from, e.meta.values]));
  assert.deepEqual(rep['seat:researcher'], ['ok', 'failed', 'rejected']);
  assert.deepEqual(rep['seat:security'], ['ok', 'failed']);
  assert.ok(!rep['seat:lead'], '주인 자리 자신은 보고 변이 없다');
  // tools가 없는 자리(모든 도구)는 정적 uses 변이 없다(18.5 9)
  assert.deepEqual(by('uses'), [E.uses('implementer', 'test'), E.uses('merger', 'merge')].sort());
  assert.equal(seats.find((n) => n.label === 'lead').meta.toolsAll, true); assert.equal(impl.toolsAll, false);
  // 사람 → keep 자리(instruct), rig 밖 대상(outside)과 관리자의 암묵 변(18.5 1·2)
  assert.deepEqual(by('instruct'), [E.instruct('lead')]);
  assert.deepEqual(g.nodes.filter((n) => n.type === 'outside').map((n) => n.id).sort(), ['outside:*', 'outside:@release-bot']);
  assert.ok(g.edges.some((e) => e.type === 'may' && e.from === 'seat:merger' && e.to === 'outside:@release-bot'));
  const imp = g.edges.find((e) => e.id === E.may('lead', '*')); assert.equal(imp.to, 'outside:*'); assert.equal(imp.meta.implicit, true);
  assert.ok(by('writes').includes(E.writes('docs', 'docs/')));
  assert.deepEqual(by('cycle'), [E.cycle(0)]); assert.deepEqual(by('edits'), [E.edits()]);
  assert.ok(g.edges.some((e) => e.type === 'may' && e.from === 'seat:merger' && e.to === 'seat:lead'));
  // 관문: 변 위 이름표
  const gate = (i) => g.gates.find((x) => x.hook === i);
  assert.ok(gate(0).on.includes(E.result(5, 'merger')) && !gate(0).on.includes(E.assign(0)), 'deliver from flow는 결과·else 변');
  assert.ok(gate(1).on.includes(E.result(2, 'reviewer')) && gate(1).on.includes(E.report('researcher')), 'done은 결과·보고 변');
  assert.deepEqual(gate(2).on, [E.uses('merger', 'merge')]);
  assert.equal(gate(0).meta.notOnReports, true, 'result 변의 deliver 관문은 주인 보고에는 돌지 않는다');
  assert.deepEqual(gate(3).on, [E.uses('implementer', 'test')]);
  assert.deepEqual(gate(4).on, ['seat:implementer', 'seat:docs']);
  assert.equal(gate(4).label, 'pre-tool · guard-write.mjs');
  assert.deepEqual(g.gates.find((x) => x.at === 'stop-verify').on, ['seat:implementer']);
  const ids = new Set([...g.nodes.map((n) => n.id), ...g.edges.map((e) => e.id)]);
  for (const x of g.gates) for (const o of x.on) assert.ok(ids.has(o), `관문 ${x.label}의 ${o}`);
  for (const e of g.edges) { assert.ok(ids.has(e.from), e.id); assert.ok(ids.has(e.to), e.id); }
  // deliver from human은 instruct 변에
  const h = defGraph({ ...def, hooks: [{ index: 0, at: 'deliver', from: 'human', run: ['node', 'x.mjs'], onFail: 'pass' }] });
  assert.deepEqual(h.gates[0].on, [E.instruct('lead')]);
});

test('P217 rig.map 오버레이: 흉내 장부 → steps, passed(변마다 묶음), gates(변·마디, 상태·수), now, next, cases, others(state), 사람 차례, state', () => {
  const def = complexDef();
  const live = { stateOf: (sid) => (sid === 'S-s2' ? 'waiting' : 'working'), nameOf: (sid) => sid.replace('S-', '') };
  const m0 = buildRigMap({ ws: 'w', def, n: 7, hash: 'h7', events: mockLedger(), status: { enabled: true, defN: 7, valid: true }, live });
  assert.equal(m0.overlay.case, 'K2', '보는 건이 없으면 가장 최근에 넘김(assign 포함)이 있던 열린 건');
  const m = buildRigMap({ ws: 'w', def, n: 7, hash: 'h7', caseId: 'K1', events: mockLedger(), status: { enabled: true, defN: 7, valid: true }, live });
  assert.equal(m.overlay.case, 'K1');
  const P = Object.fromEntries(m.overlay.passed.map((p) => [p.edge, p]));
  assert.deepEqual(P[E.assign(0)].steps, [1]);
  assert.deepEqual(P[E.report('researcher')].steps, [2]);
  assert.deepEqual(P[E.result(2, 'reviewer')].steps, [4, 8]); assert.equal(P[E.result(2, 'reviewer')].count, 2);
  assert.deepEqual(P[E.result(2, 'security')].steps, [5, 9]);
  assert.deepEqual(P[E.result(3, 'implementer')].steps, [7]);
  assert.deepEqual(P[E.result(5, 'merger')].steps, [11]);
  assert.ok(!P[E.uses('merger', 'merge')], '지나지 않은 변은 passed에 없다(관문은 overlay.gates)');
  // 18.6 steps: 넘김을 차례로 펼친 것, 그 넘김 앞의 관문 판정
  const S = m.overlay.steps;
  assert.deepEqual(S.map((s) => s.n), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  assert.deepEqual([S[3].kind, S[3].edge, S[3].from, S[3].to, S[3].value], ['handoff', E.result(2, 'reviewer'), 'implementer', 'reviewer', 'ok']);
  assert.deepEqual(S[3].gates, [{ hook: 1, value: 'pass' }], 'done 훅은 그 자리에서 그 값으로 나간 변');
  assert.deepEqual(S[10].gates, [{ hook: 0, value: 'rewrite' }]);
  assert.ok(!S[0].gates);
  // 18.6 gates: (훅, 길목, 자리, 상태)마다 수. 변과 마디 모두
  const G = (on, at) => m.overlay.gates.filter((g) => g.on === on && (!at || g.at === at));
  assert.deepEqual(G(E.uses('merger', 'merge')).map((g) => [g.hook, g.state, g.count, g.label]), [[2, 'block', 1, 'tool-before · merge-gate.mjs']]);
  assert.deepEqual(G(E.result(2, 'reviewer'), 'done').map((g) => [g.state, g.count]), [['pass', 1]], '흉내 장부의 done 판정 한 번');
  assert.deepEqual(G(E.result(5, 'merger')).map((g) => [g.state, g.count]), [['pass', 1]], 'rewrite는 pass');
  const gw = G('seat:implementer', 'pre-tool');
  assert.deepEqual(gw.map((g) => [g.hook, g.state, g.count, g.target]), [[null, 'block', 1, 'src/outside.js']], '마디에 걸린 관문(쓰기 범위)');
  assert.ok(m.overlay.gates.every((g) => GATE_STATES.includes(g.state)));
  assert.ok(m.overlay.passed.every((p) => !('lastGate' in p)));
  assert.ok(m.overlay.passed.every((p) => p.known), '모든 변이 정의에 있다');
  const now = Object.fromEntries(m.overlay.now.map((x) => [x.node, x]));
  assert.deepEqual(Object.keys(now).sort(), ['seat:merger', 'seat:security']);
  assert.equal(now['seat:security'].state, 'human_turn', '세션이 사람의 답을 기다린다');
  assert.equal(now['seat:merger'].state, 'idle_no_done');
  assert.equal(now['seat:merger'].sessionName, 'm1');
  assert.ok(m.overlay.now.every((x) => MAP_NOW_STATES.includes(x.state)));
  const next = m.overlay.next.map((x) => x.edge).sort();
  assert.ok(next.includes(E.report('merger')) && next.includes(E.result(6, 'implementer')) && next.includes(E.report('security')));
  assert.ok(m.overlay.next.find((x) => x.edge === E.result(6, 'implementer')).label.startsWith('rejected → implementer'));
  assert.deepEqual(m.cases.map((c) => [c.id, c.state]), [['K0', 'done'], ['K2', 'open'], ['K1', 'open']]);
  assert.equal(m.cases.find((c) => c.id === 'K1').owner, 'lead');
  assert.deepEqual(m.others, [{ case: 'K2', name: null, state: 'queued', on: 'seat:researcher', label: '건 K2 · 자리 줄 대기 · researcher' }]);
  assert.deepEqual(m.state, { enabled: true, defN: 7, valid: true, openCases: 2, humanTurns: 1, stopped: 1, blocked: 0 });
  // 보는 건에서만 생긴 변(adhoc): keep이 아닌 security로 간 사람 글, tools 없는 lead가 부른 test
  const ad = m.def.edges.filter((e) => e.meta.adhoc).map((e) => e.id).sort();
  assert.deepEqual(ad, [E.instruct('security'), E.uses('lead', 'test')].sort());
  assert.ok(m.def.gates.find((x) => x.hook === 3).on.includes(E.uses('lead', 'test')), 'tool-after 관문이 adhoc 변에도');
  assert.deepEqual(G(E.uses('lead', 'test')).map((g) => g.state), ['pass']);
  // 18.6 사람 차례, others.state
  assert.deepEqual(m.def.nodes.find((n) => n.id === 'human').meta.turns.map((x) => [x.case, x.seat]), [['K1', 'security']]);
  assert.ok(!m0.def.edges.some((e) => e.meta.adhoc), '다른 건(K2)을 보면 adhoc 변이 없다');
  // 건을 고르면 그 건
  const m2 = buildRigMap({ ws: 'w', def, n: 7, events: mockLedger(), caseId: 'K2', live });
  assert.equal(m2.overlay.case, 'K2'); assert.deepEqual(m2.overlay.now.map((x) => [x.node, x.state]), [['seat:researcher', 'queued']]);
  assert.deepEqual(m2.overlay.next, [], '줄에 선 일은 다음 변이 없다');
  assert.equal(m2.others[0].case, 'K1');
  // 끝난 건: now 없음
  const m3 = buildRigMap({ ws: 'w', def, n: 7, events: mockLedger(), caseId: 'K0', live });
  assert.deepEqual(m3.overlay.now, []);
  // 장부가 없으면 오버레이 없음
  assert.equal(buildRigMap({ ws: 'w', def, events: [] }).overlay, null);
  // 접기: done이 일을 닫는다
  const f = foldCases(mockLedger());
  assert.deepEqual([...f.get('K1').units.keys()].sort(), ['u7', 'u9']);
});

test('P217 rig.map 판 API: 장부와 세션 상태로 만들고, (워크스페이스, 해시, 마지막 seq)로 담아 두며, 장부가 늘면 다시 만든다', async () => {
  const { b, ws, add, seat, by, stop } = await board({ def: sampleDef() });
  try {
    const key = ws.key;
    const main = add('main'); seat(main, 'main');
    const H = rigMapHandlers(b);
    let m = await H['rig.map']({ workspace: key });
    assert.equal(m.overlay, null); assert.equal(m.state.openCases, 0); assert.equal(m.state.enabled, true);
    assert.deepEqual(m.def.nodes.find((n) => n.id === 'seat:main').meta.sessions.map((s) => s.name), ['main']);
    const r1 = await V(b).prompt(main, { name: 'worker', text: 'Make it' });
    const w = by(r1.name); await gotUnit(w);
    const misses = b.rigMap.misses;
    m = await H['rig.map']({ workspace: key });
    assert.equal(b.rigMap.misses, misses + 1, '장부가 늘었다 → 다시 만든다');
    assert.equal(m.overlay.case, r1.unit.caseId);
    assert.deepEqual(m.overlay.passed.map((p) => [p.edge, p.steps]), [[E.assign(0), [1]]]);
    assert.ok(m.overlay.now.some((x) => x.node === 'seat:worker' && x.session === w.sessionId));
    assert.equal(m.seq, b.store.lastRigSeq(key));
    const hits = b.rigMap.hits;
    await H['rig.map']({ workspace: key });
    assert.equal(b.rigMap.hits, hits + 1, '같은 seq면 담아 둔 것');
    // 건을 고르면 그 건, 없는 건은 거절
    m = await H['rig.map']({ workspace: key, case: r1.unit.caseId });
    assert.equal(m.overlay.case, r1.unit.caseId);
    await assert.rejects(H['rig.map']({ workspace: key, case: 'cnope' }), (e) => e.code === 'not_found');
    // 넘김: worker ok → reviewer
    await done(b, w, 'ok', 'made');
    m = await H['rig.map']({ workspace: key });
    assert.ok(m.overlay.passed.some((p) => p.edge === E.result(1, 'reviewer') && p.steps[0] === 2));
    assert.ok(m.overlay.gates.some((g) => g.on === E.result(1, 'reviewer') && g.at === 'deliver' && g.state === 'pass' && g.count === 1));
    assert.deepEqual(m.overlay.steps.find((s) => s.n === 2).gates, [{ hook: 0, value: 'pass' }]);
    assert.ok((b.casts || []).some((x) => x.n === 'rig.events' && x.d.ws === key));
  } finally { await stop(); }
});

test('P217 P216 자리: 자리 세션 종료(try_stopped exited)와 다시 맡기기(retried, case_resumed) 장부 줄, 지도', async () => {
  const { b, ws, add, seat, by, stop } = await board({ def: sampleDef() });
  try {
    const key = ws.key;
    const main = add('main'); seat(main, 'main');
    const r1 = await V(b).prompt(main, { name: 'worker', text: 'Long job' });
    const c = r1.unit.caseId; const w = by(r1.name); await gotUnit(w);
    const tr0 = b.store.openTryOf(w.sessionId);
    // 에이전트만 끝나고 셸 패널이 남는다(hc agent_released, 판이 끄라고 하지 않음)
    w.rt.term.launchPending = false;
    applyAgentReleased(w.rt, Date.now(), { exitCode: 1 });
    b.broadcastSession(w);
    await until(() => ledger(b, key, { caseIds: [c], kinds: ['try_stopped'] }).some((x) => x.value === 'exited'));
    const st = ledger(b, key, { caseIds: [c], kinds: ['try_stopped'] }).filter((x) => x.value === 'exited');
    assert.equal(st.length, 1, 'exited는 한 줄(work-units와 rig-flow가 겹쳐 쓰지 않는다)');
    assert.deepEqual([st[0].tryId, st[0].unitId, st[0].seat, st[0].session], [tr0.id, r1.unit.id, 'worker', w.sessionId]);
    const bl = ledger(b, key, { caseIds: [c], kinds: ['case_blocked'] });
    assert.equal(bl.length, 1); assert.equal(bl[0].value, 'exited');
    let m = await rigMapHandlers(b)['rig.map']({ workspace: key, case: c });
    assert.ok(m.overlay.now.some((x) => x.node === 'seat:worker' && x.state === 'stopped' && x.reason === 'exited'), '자리 세션의 멈춤은 stopped');
    assert.ok(m.overlay.now.some((x) => x.node === 'seat:main' && x.state === 'blocked'), '건의 막힘은 blocked');
    // 다시 맡기기(사람)
    const res = await b.branch.flow.retry(key, c, null, { by: 'human' });
    assert.equal(res.retried.length, 1);
    const L = ledger(b, key, { caseIds: [c] });
    const rt = L.find((x) => x.kind === 'retried');
    assert.ok(rt, kinds(L).join(','));
    assert.deepEqual([rt.unitId, rt.data.from_try, rt.data.to_session, rt.actor], [r1.unit.id, tr0.id, res.retried[0].toSessionId, 'human']);
    const after = L.filter((x) => x.seq > rt.seq).map((x) => x.kind);
    assert.ok(after.includes('try_start'), '다시 맡긴 일의 새 시도');
    assert.ok(L.some((x) => x.kind === 'case_resumed' && x.value === 'retry'), '건이 다시 열림');
    m = await rigMapHandlers(b)['rig.map']({ workspace: key, case: c });
    assert.deepEqual(m.overlay.now.map((x) => [x.node, x.state, x.session]), [['seat:worker', 'working', res.retried[0].toSessionId]]);
  } finally { await stop(); }
});

test('P217 지도 접기: retried가 자리 줄에 서면 queued', () => {
  const rows = [
    { seq: 1, t: 1, kind: 'case_open', caseId: 'K', seat: 'lead', session: 'S' },
    { seq: 2, t: 2, kind: 'assign', caseId: 'K', unitId: 'u', fromSeat: 'lead', toSeat: 'researcher', line: 0, data: { to: 'A' } },
    { seq: 3, t: 3, kind: 'try_start', caseId: 'K', unitId: 'u', seat: 'researcher', session: 'A' },
    { seq: 4, t: 4, kind: 'try_stopped', caseId: 'K', unitId: 'u', seat: 'researcher', session: 'A', value: 'exited' },
    { seq: 5, t: 5, kind: 'retried', caseId: 'K', unitId: 'u', data: { from_try: 't', to_session: null, queued: true } },
  ];
  assert.equal(foldCases(rows).get('K').units.get('u').state, 'queued');
  assert.equal(foldCases(rows.slice(0, 4)).get('K').units.get('u').state, 'stopped');
});

test('P217 now blocked(18.5 6): 막힌 건은 주인 자리에 blocked, 자리 세션 멈춤만 stopped', () => {
  const rows = [
    { seq: 1, t: 1, kind: 'case_open', caseId: 'B', seat: 'lead', session: 'S' },
    { seq: 2, t: 2, kind: 'case_blocked', caseId: 'B', text: 'flow[3] 상한을 넘었고 else도 manager도 없다' },
  ];
  const m = buildRigMap({ ws: 'w', def: complexDef(), events: rows, caseId: 'B' });
  assert.deepEqual(m.overlay.now.map((x) => [x.node, x.state, x.reason]), [['seat:lead', 'blocked', 'flow[3] 상한을 넘었고 else도 manager도 없다']]);
  assert.equal(m.state.blocked, 1); assert.equal(m.state.stopped, 0);
  assert.deepEqual(m.def.nodes.find((n) => n.id === 'human').meta.turns.map((x) => x.label), ['건 B 막힘: flow[3] 상한을 넘었고 else도 manager도 없다']);
  assert.equal(buildRigMap({ ws: 'w', def: complexDef(), events: [{ ...rows[0], seat: null }, rows[1]], caseId: 'B' }).overlay.now[0].node, 'human', '주인 자리가 없으면 human');
});
