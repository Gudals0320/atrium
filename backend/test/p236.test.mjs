// P236 단위 시험: rig2-design 11.18. done 훅의 loop 칸(글·목록·없음, seat과 함께, 회 없는 done), rig check(없는 고리 오류, 요약),
// rig.map 관문(그 고리의 결과 선에만), 훅 입력의 run { id, loop }, 대화상자 기계 검사의 loop work. 가짜 판은 p230 틀
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
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p236-'));
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
  const cfg = { profile: 'dev', terminalSession: 'atrium-dev-p236test', port: 0, dataDir: dir, sessionsDir: path.join(dir, 'sessions'), inputQuietMs: 3000, submitConfirmMs: 3000, deliveryMaxWaitMs: 60000, submitRetries: 0, rigCycles: false };
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

// work·improve 두 고리의 입구인 keep 자리 main. 기계 검사(거절)는 main 자리 · work 고리의 done에서만
const twoLoops = (hook = {}) => ({
  version: 2, results: ['ok', 'failed', 'rejected'],
  seats: { main: { launcher: 'claude', session: 'keep' }, reviewer: { launcher: 'claude', session: 'fresh', max_live: 1, writes: false, permission: 'scoped' } },
  loops: {
    work: { kind: 'work', trigger: { request: 'main' }, entry: 'main', flow: [{ from: 'main', on: 'ok', to: 'reviewer' }, { from: 'reviewer', on: 'rejected', to: 'main', max: 1 }] },
    improve: { kind: 'improve', trigger: { every: '7d' }, entry: 'main' },
  },
  hooks: [{ at: 'done', seat: 'main', loop: 'work', run: ['node', '.atrium/hooks/seen.mjs'], onFail: 'block', ...hook }],
});
// 받은 입력을 seen.jsonl에 적고 거절하는 훅
const SEEN = "import fs from 'node:fs'; let s = ''; process.stdin.on('data', (d) => { s += d; }); process.stdin.on('end', () => { fs.appendFileSync('.atrium/hooks/seen.jsonl', s.trim() + '\\n'); process.stdout.write(JSON.stringify({ action: 'reject', reason: 'no guide changed' })); });\n";
const withHook = () => { const dir = tmp(); fs.mkdirSync(path.join(dir, '.atrium', 'hooks'), { recursive: true }); fs.writeFileSync(path.join(dir, '.atrium', 'hooks', 'seen.mjs'), SEEN); return dir; };
const seen = (dir) => { try { return fs.readFileSync(path.join(dir, '.atrium', 'hooks', 'seen.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };

test('P236 done 훅 loop: 글·목록·없음(v1 그대로), 없는 고리·다른 길목·꼴이 틀리면 거절', () => {
  const base = twoLoops();
  const ok = (hooks) => { const v = validateRig({ ...base, hooks }); assert.equal(v.ok, true, v.reason); return v.def.hooks; };
  assert.deepEqual(ok([{ at: 'done', loop: 'work', run: ['node', 'x.mjs'] }])[0].loop, ['work']);
  assert.deepEqual(ok([{ at: 'done', loop: ['work', 'improve', 'work'], run: ['node', 'x.mjs'] }])[0].loop, ['work', 'improve']);
  const both = ok([{ at: 'done', seat: 'main', loop: 'work', run: ['node', 'x.mjs'] }])[0];
  assert.deepEqual([both.seat, both.loop], [['main'], ['work']]);
  assert.equal('loop' in ok([{ at: 'done', run: ['node', 'x.mjs'] }])[0], false, 'loop 없으면 칸도 없다(모든 고리)');
  // loops 없는 정의(v1·암묵 고리): work와 improve(-n) 이름을 받는다
  const v1 = validateRig({ seats: { main: { launcher: 'claude', session: 'keep' } }, hooks: [{ at: 'done', loop: 'work', run: ['node', 'x.mjs'] }] });
  assert.equal(v1.ok, true, v1.reason); assert.deepEqual(v1.def.hooks[0].loop, ['work']);
  const bad = (hooks, re, def = base) => { const v = validateRig({ ...def, hooks }); assert.equal(v.ok, false); assert.match(v.reason, re); };
  bad([{ at: 'done', loop: 'zz', run: ['node', 'x.mjs'] }], /hooks\[0\]\.loop에 없는 고리가 있다: zz\. 고리: work, improve/);
  bad([{ at: 'done', loop: ['work', 'nope'], run: ['node', 'x.mjs'] }], /없는 고리가 있다: nope/);
  bad([{ at: 'done', loop: [], run: ['node', 'x.mjs'] }], /고리 이름 글이나 고리 이름 배열/);
  bad([{ at: 'done', loop: 3, run: ['node', 'x.mjs'] }], /고리 이름 글이나/);
  bad([{ at: 'deliver', loop: 'work', run: ['node', 'x.mjs'] }], /loop은 done 훅에만/);
  bad([{ at: 'done', loop: 'work', run: ['node', 'x.mjs'] }], /없는 고리가 있다: work\. 고리: \(없음\)/, {});
});

test('P236 done 훅 loop: 그 회의 고리가 맞을 때만 돈다(seat과 함께는 둘 다). 회 없는 done에는 돌지 않는다. 훅 입력에 run { id, loop }', async () => {
  const dir = withHook();
  const { b, ws, add, F, seat, stop } = await board({ dir, def: twoLoops() });
  try {
    const main = add('main'); seat(main, 'main');
    const rv = add('rv'); seat(rv, 'reviewer');
    const work = F().newCase(ws.key, main, 'agent', { loop: 'work' });
    const imp = F().newCase(ws.key, main, 'cycle', { loop: 'improve' });
    const call = (caller, caseId) => b.rig.done({ caller, tryRow: null, unit: caseId ? { id: 'u-' + caseId, from: main.sessionId, spec: 'x', origin: 'request', caseId } : null, result: 'ok', text: 'x' });
    const a = await call(main, work.id);
    assert.equal(a.action, 'reject'); assert.equal(a.runs.length, 1, '작업 회의 main done에는 돈다');
    const i = await call(main, imp.id);
    assert.equal(i.action, 'pass'); assert.equal(i.runs.length, 0, '개선 회의 main done에는 돌지 않는다');
    const n = await call(main, null);
    assert.equal(n.action, 'pass'); assert.equal(n.runs.length, 0, '회 없는 done(고리 밖)에는 돌지 않는다');
    const r = await call(rv, work.id);
    assert.equal(r.action, 'pass'); assert.equal(r.runs.length, 0, 'seat이 안 맞으면 고리가 맞아도 돌지 않는다');
    const s = seen(dir);
    assert.equal(s.length, 1);
    assert.deepEqual(s[0].run, { id: work.id, loop: 'work' }, '훅 입력의 run');
    assert.equal(s[0].at, 'done');
  } finally { await stop(); }
});

test('P236 훅 입력의 run: loop 없는 done 훅도 run을 받고, 회 없는 done이면 null. 목록 loop는 둘 다', async () => {
  const dir = withHook();
  const def = twoLoops({ seat: undefined, loop: undefined });
  delete def.hooks[0].seat; delete def.hooks[0].loop;
  def.hooks.push({ at: 'done', loop: ['work', 'improve'], run: ['node', '.atrium/hooks/seen.mjs'], onFail: 'pass' });
  const { b, ws, add, F, seat, stop } = await board({ dir, def });
  try {
    const main = add('main'); seat(main, 'main');
    const imp = F().newCase(ws.key, main, 'cycle', { loop: 'improve' });
    const r0 = await b.rig.done({ caller: main, tryRow: null, unit: null, result: 'ok', text: 'x' });
    assert.equal(r0.runs.length, 1, '회 없는 done: loop 없는 훅만(첫 훅이 거절해 멈춘다)');
    const r1 = await b.rig.done({ caller: main, tryRow: null, unit: { id: 'u1', caseId: imp.id }, result: 'ok', text: 'x' });
    assert.equal(r1.runs.length, 1);
    const s = seen(dir);
    assert.equal(s[0].run, null, '회가 없으면 run은 null');
    assert.deepEqual(s[1].run, { id: imp.id, loop: 'improve' });
  } finally { await stop(); }
});

test('P236 실제 길: 작업 회의 main done은 기계 검사가 막고, 개선 회(지금 돌리기)의 main done은 ok로 닫힌다', async () => {
  const dir = withHook();
  const { b, ws, add, L, seat, stop } = await board({ dir, def: twoLoops() });
  try {
    const main = add('main'); seat(main, 'main');
    L().onRequest(main, human, '안내서 하나 써 줘');
    await gotUnit(main);
    await until(() => main.rt.term.status === 'idle');
    await assert.rejects(done(b, main, 'ok', '썼다'), (e) => e.code === 'rig_rejected' && /no guide changed/.test(e.message));
    await done(b, main, 'failed', '산출물 없음').catch((e) => assert.equal(e.code, 'rig_rejected'));
    assert.equal(seen(dir).length, 2, '작업 회: failed도 work 회라 훅이 돈다');
    // 이 판의 작업 회는 열린 채라 개선 회는 새 판에서 본다
  } finally { await stop(); }
  const dir2 = withHook();
  const t = await board({ dir: dir2, def: twoLoops() });
  try {
    const main = t.add('main'); t.seat(main, 'main');
    const H = rigLoopHandlers(t.b);
    const r = await H['rig.run']({ workspace: t.ws.key, loop: 'improve' }, local);
    assert.ok(r && !r.skipped, JSON.stringify(r));
    await gotUnit(main);
    await until(() => main.rt.term.status === 'idle');
    const d = await done(t.b, main, 'ok', '제안 없음');
    assert.equal(seen(dir2).length, 0, '개선 회에는 기계 검사가 돌지 않는다');
    assert.ok(d.case && ['done', 'open'].includes(d.case.state), JSON.stringify(d.case));
    const c = t.b.store.getCase(d.case.id); assert.equal(c.loop, 'improve');
  } finally { await t.stop(); }
});

test('P236 rig check 요약(없는 고리 오류), rig.map 관문은 그 고리의 결과 선에만, 대화상자 기계 검사는 loop work', async () => {
  const def = twoLoops(); def.hooks = [{ at: 'done', loop: 'improve', run: ['node', 'x.mjs'] }, { at: 'done', seat: 'main', loop: 'work', run: ['node', 'y.mjs'] }, { at: 'done', run: ['node', 'z.mjs'] }];
  const { b, ws, stop } = await board({ def: { ...def, hooks: [] } });
  try {
    const x = b.branch.rigAdmin.check(ws.key, { text: JSON.stringify(def) });
    assert.equal(x.ok, true, x.reason);
    assert.deepEqual(x.summary.doneHooks, [{ index: 0, seats: null, loops: ['improve'] }, { index: 1, seats: ['main'], loops: ['work'] }, { index: 2, seats: null, loops: null }]);
    const y = b.branch.rigAdmin.check(ws.key, { text: JSON.stringify({ ...def, hooks: [{ at: 'done', loop: 'audit', run: ['node', 'x.mjs'] }] }) });
    assert.equal(y.ok, false); assert.match(y.reason, /loop에 없는 고리가 있다: audit/);
  } finally { await stop(); }
  // 개선 고리에 흐름 줄 하나를 더한 정의로 관문을 본다
  const d2 = twoLoops(); d2.loops.improve.flow = [{ from: 'main', on: 'failed', to: 'reviewer' }];
  d2.hooks = [{ at: 'done', loop: 'work', run: ['node', 'y.mjs'] }, { at: 'done', loop: 'improve', run: ['node', 'x.mjs'] }, { at: 'done', run: ['node', 'z.mjs'] }];
  const v = validateRig(d2); assert.equal(v.ok, true, v.reason);
  const m = buildRigMap({ ws: 'w', def: v.def });
  const gates = m.def.gates.filter((g) => g.at === 'done');
  const edge = (id) => m.def.edges.find((e) => e.id === id);
  const wl = new Set(v.def.loops.work.lines); const il = new Set(v.def.loops.improve.lines);
  const results = (g) => g.on.map(edge).filter((e) => e.type === 'result');
  assert.ok(results(gates[0]).length >= 2 && results(gates[0]).every((e) => wl.has(e.meta.line)), 'work 훅은 work 줄에만');
  assert.ok(results(gates[1]).length === 1 && il.has(results(gates[1])[0].meta.line), 'improve 훅은 improve 줄에만');
  assert.equal(results(gates[2]).length, results(gates[0]).length + results(gates[1]).length, 'loop 없으면 모든 고리');
  assert.deepEqual(gates[0].meta.loop, ['work']); assert.equal(gates[2].meta.loop, undefined);
  // 대화상자: 기계 검사는 seat과 함께 loop work
  const g = presetFiles({ ...shortcutAnswers('grow'), check: { on: true, script: 'scripts/check.mjs' } });
  assert.deepEqual(g.def.hooks, [{ at: 'done', seat: 'main', loop: 'work', run: ['node', 'scripts/check.mjs'], onFail: 'block' }]);
  const gv = validateRig(g.def); assert.ok(gv.ok || !/loop/.test(gv.reason), gv.reason);
});
