// P296 단위 시험: 자체 오케스트레이션 세션. 권한 셈(성질 × 관계 4가지), 관계 바뀜에 다시 셈, 거절 코드(not_permitted), help·안내문에 허용 동사만,
// 스티어링 막음, 마지막 답 보고 물러섬, 바쁨 신호(가짜 프로세스 나무·CPU·파일 시각)로 잠재우기 거절, 런처 칸.
// 진짜 저장소·전달 대기열·Branch, 가짜 에이전트(p284 시험의 틀). herdr·hc와 claude 없이 돈다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import { Store } from '../src/store.mjs';
import { newRuntime, applyHook, applyTermStatus, deriveState } from '../src/state.mjs';
import { workspaceOf } from '../src/git.mjs';
import { DeliveryQueue, steerBlock, steerWhy, canTypeNow } from '../src/delivery.mjs';
import { Branch } from '../src/branch.mjs';
import { CONTRACT_VERSION, shortHelp, contractJson } from '../src/cli-contract.mjs';
import { permOf, opRefusal, orchOf, launcherOrch, normalizeOrchFields, orchPromptLines, ORCH_SUB_VERBS, ORCH_DEFAULTS } from '../src/orchestration.mjs';
import { innerWork, fileSignals, globTimes, expandPath, registerInnerReader, readerSignals } from '../src/inner-work.mjs';
import { Sleeper, sessionActivity, sessionSleepPlan, SLEEP_REASONS } from '../src/sleep.mjs';
import { normalizeLauncher, resolveLauncher } from '../src/launchers.mjs';
import { FALLBACK_MARK } from '../src/work-units.mjs';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p284-'));
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 3000) { const t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > ms) throw new Error('until: 시간 초과'); await tick(10); } }

// ---------- 가짜 판: 진짜 저장소·전달 대기열·Branch, 가짜 에이전트 ----------
async function board({ dir = tmp() } = {}) {
  const store = new Store(path.join(dir, 'board.db'));
  const ws = await workspaceOf(dir);
  if (!store.getWorkspace || !store.getWorkspace(ws.key)) try { store.insertWorkspace({ ...ws, createdAt: 1 }); } catch {}
  const cfg = { profile: 'dev', terminalSession: 'atrium-dev-p284test', port: 0, dataDir: dir, sessionsDir: path.join(dir, 'sessions'), inputQuietMs: 3000, submitConfirmMs: 3000, deliveryMaxWaitMs: 60000, submitRetries: 0 };
  const b = {
    cfg, apiToken: 'board-api-token', store, sessions: new Map(), bus: new EventEmitter(), killing: new Set(), sent: [], spawned: [],
    api: { broadcast: () => {} }, log: () => {}, requireTerminal: () => {},
    adapter: { backend: 'hc', connected: true, readScreen: async () => '' },
    hooked: (s) => s.rt.hooked !== false,
    summary: (s) => { const d = deriveState(s.rt); return { state: d.state, ask: d.ask || null, error: d.error || null }; },
    ensureLink(from, to, patch = {}) {
      let l = store.linkByPair(from, to);
      if (!l) { l = { linkId: 'l' + crypto.randomBytes(4).toString('hex'), from, to, role: patch.role ?? null, spawned: !!patch.spawned, observed: !!patch.observed, createdAt: Date.now() }; store.insertLink(l); }
      return store.getLink(l.linkId);
    },
    linkEvent(l, kind, text = null, data = null) { return store.addLinkEvent(l.linkId, kind, text, data); },
    // 상태가 바뀌면 판처럼 bus로 알린다(Branch.onSession → WorkUnits.onSession)
    broadcastSession(s) { if (b.sessions.has(s.sessionId)) b.bus.emit('session', s, b.summary(s)); },
    async spawn(p) {
      const s = add(p.name, { parentSessionId: p.parentSessionId || null });
      if (p.branch) b.branch.noteChild(s.sessionId, p.branch);
      b.spawned.push(p);
      return { sessionId: s.sessionId, trust: { needsTrust: false } };
    },
    closeSession(s, reason) { b.sessions.delete(s.sessionId); store.updateSession(s.sessionId, { closedAt: Date.now() }); b.bus.emit('closed', s, reason); },
  };
  b.queue = new DeliveryQueue({
    store, cfg,
    view: (sid) => { const s = b.sessions.get(sid); if (!s) return { closed: true }; return { state: deriveState(s.rt).state, agentPresent: s.rt.term.present, termConnected: true, lastUserInputAt: 0, closed: false, kind: s.kind, hooked: b.hooked(s) }; },
    send: async (sid, text) => { if (b.stopped) return; b.sent.push({ sid, text }); const s = b.sessions.get(sid); if (s && s.agent) setTimeout(() => s.agent(text), 5); },
  });
  b.queue.start();
  b.branch = new Branch(b, { readyWaitMs: 30, submitWaitMs: 10, noticeBatchMs: 20, verbs: { pollMs: 15, settleMs: 800, turnGraceMs: 300, answerGraceMs: 200 } });
  b.queue.on('delivery', (d) => { if (['confirmed', 'unconfirmed', 'failed', 'cancelled'].includes(d.status)) b.branch.onDeliveryEnd(d); });
  // 가짜 에이전트: 글을 받으면 일하고(workMs) 쉰다. onText(text, s)는 일하는 중에 부른다(done을 치는 워커 등)
  const add = (name, { kind = 'claude', hooked = kind === 'claude', workMs = 80, onText = null, ...extra } = {}) => {
    const s = { sessionId: crypto.randomUUID(), name, cwd: dir, paneId: `${name}:p1`, agentName: name, permissionMode: 'manual', kind, origin: 'board', parentSessionId: null, workspaceKey: ws.key, rt: newRuntime({ kind, hooked }), createdAt: Date.now(), ...extra };
    idle(s);
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
  const busy = (s) => { applyHook(s.rt, { hook_event_name: 'UserPromptSubmit', prompt: '사람의 일' }); applyTermStatus(s.rt, 'working'); b.broadcastSession(s); };
  const rest = (s) => { applyHook(s.rt, { hook_event_name: 'Stop', last_assistant_message: '끝' }); applyTermStatus(s.rt, 'idle'); b.broadcastSession(s); };
  return { b, dir, ws, add, busy, rest, stop: async () => { b.stopped = true; b.queue.stop(); b.branch.notices.stop(); await tick(400); store.close(); } };
}
function idle(s) { s.rt.term.present = true; s.rt.phase = 'running'; applyTermStatus(s.rt, 'idle'); }
const U = (b) => b.branch.units;
const units = (b) => b.store.db.prepare('SELECT * FROM work_units').all();
const tries = (b) => b.store.db.prepare('SELECT * FROM unit_tries').all();
const toParent = (b, p) => b.store.db.prepare('SELECT * FROM deliveries WHERE session_id = ?').all(p.sessionId);
function serve(b) {
  const srv = http.createServer((req, res) => { if (!b.branch.handleHttp(req, res)) { res.writeHead(404); res.end(); } });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => { b.cfg.port = srv.address().port; r(srv); }));
}
function runCli(args, env) {
  return new Promise((resolve) => {
    const clean = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(MTASK_|ATRIUM_|HERDR_|HC_)/.test(k)));
    execFile(process.execPath, [path.join(HERE, '..', 'bin', 'atrium-child.mjs'), ...args], { env: { ...clean, ...env }, timeout: 30000 }, (err, stdout, stderr) => resolve({ code: err ? err.code : 0, stdout, stderr }));
  });
}
const envOf = (b, s) => ({ ATRIUM_PORT: String(b.cfg.port), ATRIUM_SESSION_ID: s.sessionId, ATRIUM_SESSION_TOKEN: b.branch.token(s.sessionId), ATRIUM_TERMINAL_SESSION: b.cfg.terminalSession });




// ---------- P296 ----------
const ORCH = { on: true, via: 'launcher', reportFallback: null, busy: ['proctree', 'cpu'] };
const ev = (b, s, kind) => b.store.db.prepare('SELECT * FROM events WHERE session_id = ? AND kind = ? ORDER BY id').all(s.sessionId, kind);
const delivs = (b, s) => b.store.db.prepare('SELECT * FROM deliveries WHERE session_id = ? ORDER BY created_at').all(s.sessionId);
function subOf(b, add, parent, name, extra = {}) {
  const w = add(name, { parentSessionId: parent.sessionId, ...extra });
  b.store.updateSession(w.sessionId, { parentSessionId: parent.sessionId });
  b.branch.noteChild(w.sessionId, { role: '워커', depth: 2, by: parent.sessionId, at: Date.now(), kind: w.kind });
  return w;
}

test('P296 권한 셈(순수): 성질 × 관계 4가지, 거절 까닭', () => {
  const verbs = ['help', 'child', 'children', 'child-kill', 'child-wait', 'wake', 'models', 'me', 'prompt', 'wait', 'read', 'relate', 'done', 'item', 'items', 'ask', 'todo', 'usage'];
  const normSub = permOf({ orch: null, relation: 'sub', parentId: 'p', verbs });
  const normFree = permOf({ orch: null, relation: 'none', verbs });
  assert.equal(normSub.allowed, null); assert.equal(normFree.allowed, null); assert.equal(normSub.scope, 'normal');
  const sub = permOf({ orch: ORCH, relation: 'sub', parentId: 'p', verbs });
  assert.equal(sub.scope, 'sub'); assert.deepEqual(sub.allowed, [...ORCH_SUB_VERBS]); assert.equal(sub.parentOnly, 'p');
  const free = permOf({ orch: ORCH, relation: 'none', verbs });
  assert.equal(free.scope, 'free');
  for (const v of ['child', 'child-kill', 'child-wait', 'relate']) assert.ok(!free.allowed.includes(v), v);
  for (const v of ['ask', 'todo', 'prompt', 'read', 'done']) assert.ok(free.allowed.includes(v), v);
  // 관계 sub인데 부모를 모르면 독립처럼
  assert.equal(permOf({ orch: ORCH, relation: 'sub', parentId: null, verbs }).scope, 'free');
  assert.deepEqual(opRefusal(free, 'child'), { verb: 'child', why: 'spawn' });
  assert.deepEqual(opRefusal(free, 'wait'), { verb: 'child-wait', why: 'spawn' }); // /branch/wait는 child-wait
  assert.equal(opRefusal(free, 'turn'), null); // atrium wait
  assert.deepEqual(opRefusal(sub, 'ask'), { verb: 'ask', why: 'scope' });
  assert.deepEqual(opRefusal(sub, 'prompt', { targetId: 'other' }), { verb: 'prompt', why: 'target' });
  assert.equal(opRefusal(sub, 'prompt', { targetId: 'p' }), null);
  assert.equal(opRefusal(sub, 'perm'), null); assert.equal(opRefusal(sub, 'usage-report'), null);
  assert.equal(opRefusal(normSub, 'child'), null);
});

test('P296 런처 칸과 기본값: orchestrates·reportFallback·busy, 종류 기본(hermes), 띄울 값에 실림', () => {
  const l = normalizeLauncher({ name: 'heavy', harness: 'claude', orchestrates: true, reportFallback: 'last_answer', busy: ['cpu', { files: '%LOCALAPPDATA%/x/state.db*' }] });
  assert.equal(l.orchestrates, true); assert.equal(l.reportFallback, 'last_answer'); assert.deepEqual(l.busy, ['cpu', { files: '%LOCALAPPDATA%/x/state.db*' }]);
  const plain = normalizeLauncher({ name: 'plain', harness: 'claude' });
  assert.ok(!('orchestrates' in plain) && !('busy' in plain));
  assert.throws(() => normalizeLauncher({ name: 'bad', harness: 'claude', reportFallback: 'screen' }), /보고 물러섬/);
  assert.throws(() => normalizeLauncher({ name: 'bad', harness: 'claude', busy: ['gpu'] }), /바쁨 신호/);
  assert.throws(() => normalizeOrchFields({ orchestrates: 'yes' }), /true 또는 false/);
  const plan = resolveLauncher({ ...l, id: 'x' });
  assert.equal(plan.orchestrates, true);
  assert.deepEqual(orchOf('claude', plan), { on: true, via: 'launcher', reportFallback: 'last_answer', busy: ['cpu', { files: '%LOCALAPPDATA%/x/state.db*' }] });
  assert.equal(orchOf('claude', resolveLauncher({ ...plain, id: 'y' })), null);
  assert.equal(orchOf('claude', null), null);
  const h = orchOf('hermes', null);
  assert.equal(h.via, 'kind'); assert.ok(h.busy.some((x) => x.files && /hermes/.test(x.files)), 'Hermes는 상태 파일 신호(P297: 나무·CPU로는 안 보인다)');
  assert.equal(orchOf('hermes', { orchestrates: false }), null, '런처가 끄면 꺼진다');
  assert.deepEqual(launcherOrch({ harness: 'claude' }, 'claude'), { orchestrates: false, via: null });
  assert.deepEqual(launcherOrch({}, 'hermes'), { orchestrates: true, via: 'kind' });
  assert.ok(ORCH_DEFAULTS.hermes.orchestrates);
});

test('P296 help·안내문: 허용 동사만, 계약 9, 안내문은 줄바꿈·큰따옴표 없이', () => {
  assert.equal(CONTRACT_VERSION, 9);
  const sub = { orchestrates: true, scope: 'sub', allowed: [...ORCH_SUB_VERBS] };
  const h = shortHelp(sub);
  assert.doesNotMatch(h, /\n  atrium child /); assert.doesNotMatch(h, /atrium ask /); assert.match(h, /atrium done/); assert.match(h, /부모하고만/);
  const j = contractJson(sub);
  assert.deepEqual(j.verbs.map((v) => v.name).sort(), [...ORCH_SUB_VERBS].sort()); assert.equal(j.scope, 'sub'); assert.deepEqual(j.allowed, [...ORCH_SUB_VERBS]);
  assert.ok(contractJson().verbs.some((v) => v.name === 'child'), '보통 세션은 모두');
  assert.match(shortHelp(), /atrium child /);
  for (const sc of ['sub', 'free']) {
    const lines = orchPromptLines(sc);
    for (const l of lines) assert.doesNotMatch(l, /["\n]/);
    assert.doesNotMatch(lines.join(' '), /atrium child </);
  }
  assert.match(orchPromptLines('free').join(' '), /atrium ask/);
  assert.doesNotMatch(orchPromptLines('sub').join(' '), /atrium ask/);
});

test('P296 스티어링 막음: 오케스트레이션 세션은 대기열만', () => {
  assert.equal(steerBlock({ kind: 'claude', orch: ORCH }, true), 'orchestrates');
  assert.equal(steerBlock({ kind: 'claude' }, true), null);
  const view = { termConnected: true, agentPresent: true, state: 'working', kind: 'claude', hooked: true };
  assert.equal(canTypeNow(view), true);
  assert.equal(canTypeNow({ ...view, orch: ORCH }), false);
  assert.equal(steerWhy({ view: { ...view, orch: ORCH } }), 'orchestrates');
});

test('P296 보드가 막는다: 독립 오케스트레이션 세션(child 거절, ask 됨), 하위(부모에게만 prompt, done 됨), help는 허용 동사만', async () => {
  const { b, add, stop } = await board();
  const srv = await serve(b);
  try {
    const lead = add('lead', { orch: ORCH });
    const other = add('other');
    // 독립: child는 not_permitted(종료 코드 1), ask는 된다
    let r = await runCli(['child', 'w9', '--prompt', 'x'], envOf(b, lead));
    assert.equal(r.code, 1); assert.match(r.stderr, /not_permitted/); assert.match(r.stderr, /자체 오케스트레이션/);
    r = await runCli(['relate', 'other', 'peer', '--json'], envOf(b, lead));
    const j = JSON.parse(r.stdout); assert.equal(j.error.code, 'not_permitted'); assert.equal(j.error.reason, 'spawn'); assert.ok(Array.isArray(j.error.allowed));
    r = await runCli(['ask', 'p296 질문 하나?'], envOf(b, lead));
    assert.equal(r.code, 0, r.stderr);
    r = await runCli(['help'], envOf(b, lead));
    assert.doesNotMatch(r.stdout, /\n  atrium child /); assert.match(r.stdout, /atrium ask/);
    r = await runCli(['help', '--json'], envOf(b, lead));
    assert.equal(JSON.parse(r.stdout).scope, 'free');
    // 보통 세션은 그대로
    r = await runCli(['help'], envOf(b, other)); assert.match(r.stdout, /\n  atrium child /);
    // 하위 오케스트레이션 세션
    const w = subOf(b, add, lead, 'w1', { orch: ORCH });
    r = await runCli(['me', '--json'], envOf(b, w));
    const me = JSON.parse(r.stdout);
    assert.equal(me.permissions.scope, 'sub'); assert.equal(me.permissions.parent, 'lead'); assert.deepEqual(me.permissions.allowed, [...ORCH_SUB_VERBS]);
    r = await runCli(['me'], envOf(b, w)); assert.match(r.stdout, /권한: 자체 오케스트레이션 세션, @lead의 하위/);
    r = await runCli(['prompt', 'other', 'p296 옆에게'], envOf(b, w));
    assert.equal(r.code, 1); assert.match(r.stderr, /not_permitted/); assert.match(r.stderr, /부모에게만/);
    r = await runCli(['ask', 'p296 하위 질문?', '--json'], envOf(b, w));
    assert.equal(JSON.parse(r.stdout).error.code, 'not_permitted');
    r = await runCli(['read', 'lead', '--json'], envOf(b, w));
    assert.equal(JSON.parse(r.stdout).error.reason, 'scope');
    r = await runCli(['prompt', 'lead', 'p296 부모에게 질문'], envOf(b, w));
    assert.equal(r.code, 0, r.stderr);
    assert.ok(delivs(b, lead).some((d) => d.text.includes('p296 부모에게 질문')));
    r = await runCli(['help'], envOf(b, w));
    assert.doesNotMatch(r.stdout, /atrium read /); assert.match(r.stdout, /atrium done/);
    // 부모가 맡긴 일을 done으로 닫는다
    await b.branch.dispatch('prompt', lead, { name: 'w1', text: 'p296 일을 해라' });
    await until(() => b.store.openTryOf(w.sessionId));
    r = await runCli(['done', 'ok', 'p296 끝냄'], envOf(b, w));
    assert.equal(r.code, 0, r.stderr);
    assert.ok(ev(b, w, 'branch_rejected').filter((e) => JSON.parse(e.data).why === 'not_permitted').length >= 3);
  } finally { srv.close(); await stop(); }
});

test('P296 관계가 바뀌면 다시 센다: 하위 → 독립이면 ask가 되고 perm_set이 남는다', async () => {
  const { b, add, stop } = await board();
  try {
    const lead = add('lead');
    const w = subOf(b, add, lead, 'w2', { orch: ORCH });
    assert.equal(b.branch.permFor(w).scope, 'sub');
    assert.equal(b.branch.refusalOf(w, 'ask', {}).code, 'not_permitted');
    b.branch.setRelation(lead, w, 'none', { source: 'user', by: 'user' });
    assert.equal(b.branch.permFor(w).scope, 'free');
    assert.equal(b.branch.refusalOf(w, 'ask', {}), null);
    assert.equal(b.branch.refusalOf(w, 'child', {}).reason, 'spawn');
    const sets = ev(b, w, 'perm_set').map((e) => JSON.parse(e.data).scope);
    assert.deepEqual(sets, ['sub', 'free']);
    // 요약에 orch(카드 표)
    const sum = b.branch.summaryExtra(w);
    assert.equal(sum.orch.on, true); assert.equal(sum.orch.scope, 'free');
    assert.equal(b.branch.summaryExtra(lead).orch, undefined);
  } finally { await stop(); }
});

test('P296 마지막 답 보고 물러섬: atrium을 못 돌리는 하위는 턴 끝 마지막 답으로 판이 닫는다(멈춤 알림 없음)', async () => {
  const { b, add, stop } = await board();
  try {
    b.branch.units.fallbackMs = 600;
    const lead = add('lead');
    const w = subOf(b, add, lead, 'w3', { kind: 'pi', hooked: false, orch: { ...ORCH, reportFallback: 'last_answer' } });
    w.onText = async (text, s) => { s.rt.lastAnswer = 'p296 결과: 셋 다 고쳤다'; s.rt.lastAnswerAt = Date.now(); };
    await b.branch.dispatch('prompt', lead, { name: 'w3', text: 'p296 일을 해라' });
    await until(() => b.store.db.prepare("SELECT * FROM work_units WHERE status = 'done'").all().length === 1, 5000);
    const tr = b.store.db.prepare('SELECT * FROM unit_tries').all()[0];
    assert.equal(tr.result, 'ok'); assert.ok(tr.done_text.startsWith(FALLBACK_MARK)); assert.match(tr.done_text, /셋 다 고쳤다/);
    await until(() => delivs(b, lead).some((d) => d.text.includes('셋 다 고쳤다')), 3000);
    assert.equal(ev(b, w, 'unit_done_fallback').length, 1);
    assert.ok(!delivs(b, lead).some((d) => d.text.includes('맡긴 일이 멈췄다')), '멈춤 알림과 겹치지 않는다');
  } finally { await stop(); }
});

test('P296 안에서 일하는 중이면 멈춤 알림을 미루고, 조용해지면 한 번 알린다', async () => {
  const { b, add, stop } = await board();
  try {
    let busy = true;
    b.sleeper = { innerBusy: () => busy };
    const lead = add('lead');
    const w = subOf(b, add, lead, 'w4', { kind: 'pi', hooked: false, orch: ORCH });
    await b.branch.dispatch('prompt', lead, { name: 'w4', text: 'p296 일을 해라' });
    await until(() => ev(b, w, 'unit_stop_quiet').length === 1, 4000);
    assert.equal(JSON.parse(ev(b, w, 'unit_stop_quiet')[0].data).because, 'inner_work');
    busy = false;
    assert.equal(b.branch.units.stops.onInnerQuiet(w), 'idle_no_done');
    await until(() => delivs(b, lead).some((d) => d.text.includes('맡긴 일이 멈췄다')), 3000);
  } finally { await stop(); }
});

test('P296 바쁨 신호(순수): 자손 프로세스, CPU 증가, 파일 시각, 잠깐 유지', () => {
  const now = 1_000_000_000;
  const procs = (extra = [], cpu = 100) => new Map([[10, { pid: 10, ppid: 1, name: 'harness.exe', created: now - 600000, cpu }], ...extra.map((p) => [p.pid, p])]);
  // 띄울 때 함께 뜬 도우미는 세지 않는다
  let x = innerWork({ procs: procs([{ pid: 11, ppid: 10, name: 'node.exe', created: now - 599000, cpu: 5 }]), root: 10, now });
  assert.equal(x.busy, false); assert.equal(x.n, 0);
  // 뒤에 생긴 자손
  x = innerWork({ procs: procs([{ pid: 12, ppid: 10, name: 'node.exe', created: now - 10000, cpu: 5 }]), root: 10, now });
  assert.equal(x.busy, true); assert.deepEqual(x.why, ['proctree']);
  // CPU: 30초에 3초(10%) 늘었다
  const p0 = innerWork({ procs: procs([], 100), root: 10, now: now - 30000 });
  x = innerWork({ procs: procs([], 3100), root: 10, now, prev: p0, signals: ['cpu'] });
  assert.deepEqual(x.why, ['cpu']);
  x = innerWork({ procs: procs([], 200), root: 10, now, prev: p0, signals: ['cpu'] });
  assert.equal(x.busy, false, '1% 아래는 조용');
  // 신호를 고르면 그것만
  x = innerWork({ procs: procs([{ pid: 12, ppid: 10, name: 'node.exe', created: now - 10000, cpu: 5 }]), root: 10, now, signals: ['cpu'] });
  assert.equal(x.busy, false);
  // 파일 시각
  x = innerWork({ files: [{ glob: 'a', newest: now - 5000 }], now, signals: [] });
  assert.deepEqual(x.why, ['files']);
  x = innerWork({ files: [{ glob: 'a', newest: now - 600000 }], now, signals: [] });
  assert.equal(x.busy, false);
  // 바빴던 뒤 잠깐(HOLD) 유지
  const was = { busy: true, why: ['cpu'], lastBusyAt: now - 20000, at: now - 30000, cpu: new Map() };
  x = innerWork({ procs: procs(), root: 10, now, prev: was, signals: [] });
  assert.equal(x.busy, true); assert.deepEqual(x.why, []);
  x = innerWork({ procs: procs(), root: 10, now: now + 120000, prev: was, signals: [] });
  assert.equal(x.busy, false);
});

test('P296 파일 신호: %이름% 풀기와 glob, 내용은 읽지 않는다', () => {
  const dir = tmp();
  fs.mkdirSync(path.join(dir, 'runtime', 'deep'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'state.db'), 'x'); fs.writeFileSync(path.join(dir, 'state.db-wal'), 'x'); fs.writeFileSync(path.join(dir, 'runtime', 'deep', 'a.json'), 'x');
  const d = dir.split(path.sep).join('/');
  assert.equal(expandPath('%P296DIR%/state.db*', { env: { P296DIR: d } }), d + '/state.db*');
  assert.equal(globTimes(d + '/state.db*').length, 2);
  assert.equal(globTimes(d + '/**/*.json').length, 1);
  assert.equal(globTimes(d + '/state.db').length, 1);
  assert.equal(globTimes(d + '/none/*.db').length, 0);
  let read = 0;
  const fsx = { statSync: fs.statSync, readdirSync: fs.readdirSync, readFileSync: () => { read++; return ''; } };
  const f = fileSignals([{ files: '%P296DIR%/state.db*' }, 'cpu'], { env: { P296DIR: d }, fsx });
  assert.equal(f.length, 1); assert.ok(f[0].newest > Date.now() - 60000); assert.equal(read, 0);
  const rel = fileSignals([{ files: 'runtime/**/*.json' }], { cwd: d });
  assert.ok(rel[0].newest);
});

test('P296 잠재우기 거절: 안에서 일하는 중(inner_work)은 저절로·손으로 모두 재우지 않는다', async () => {
  assert.ok(SLEEP_REASONS.includes('inner_work'));
  const base = { kind: 'claude', state: 'ready', hooked: true, convKnown: true, idleSince: 0 };
  assert.equal(sessionActivity({ ...base, inner: true }, { mode: 'hand' }), 'inner_work');
  assert.equal(sessionActivity({ ...base, inner: true }, { mode: 'auto' }), 'inner_work');
  assert.equal(sessionSleepPlan({ ...base, inner: true }, { now: 10 ** 12, afterMs: 1 }).why, 'inner_work');
  // Sleeper.scanInner: 가짜 프로세스 표(자손이 생김) → 바쁨 → info.inner → 그 뒤 자손이 끝나면 조용
  const s = { sessionId: 'o1', name: 'o1', kind: 'pi', paneId: 'p1', cwd: '.', orch: { on: true, busy: ['proctree'] }, rt: { ...newRuntime({ kind: 'pi', hooked: false }), launchedAt: Date.now() - 600000 } };
  const now = Date.now();
  let table = new Map([[50, { pid: 50, ppid: 1, name: 'pi.exe', created: now - 600000, cpu: 1 }], [51, { pid: 51, ppid: 50, name: 'node.exe', created: now - 1000, cpu: 1 }]]);
  const events = [], casts = [];
  const quiet = [];
  const b = { sessions: new Map([[s.sessionId, s]]), store: { addEvent: (sid, kind, data) => events.push({ kind, data }), saveRuntime: () => {} }, log: () => {}, broadcastSession: (x, o) => casts.push(o.cause),
    adapter: { processInfo: async () => ({ shell_pid: 1, foreground_processes: [{ pid: 50, name: 'pi.exe' }] }) }, branch: { units: { stops: { onInnerQuiet: (x) => quiet.push(x.name) } } } };
  const sl = new Sleeper(b, { readTable: async () => ({ procs: table, at: Date.now() }), timers: false });
  await sl.scanInner();
  assert.equal(sl.innerBusy(s), true); assert.deepEqual(sl.innerView(s).why, ['proctree']);
  assert.deepEqual(casts, ['inner']); assert.equal(events[0].kind, 'inner_work');
  table = new Map([[50, table.get(50)]]);
  sl.inner.get('o1').at -= 10000; sl.inner.get('o1').lastBusyAt -= 120000; // 다시 재기(재는 간격)·유지 시간이 지났다
  await sl.scanInner();
  assert.equal(sl.innerBusy(s), false); assert.deepEqual(quiet, ['o1']);
  // 보통 세션은 재지 않는다
  const plain = { ...s, sessionId: 'n1', name: 'n1', orch: null };
  b.sessions.set('n1', plain);
  await sl.scanInner();
  assert.equal(sl.inner.has('n1'), false);
});

test('P296 하네스별 바쁨 읽개(꽂기)와 하네스 안 오케스트레이션 허락 안내(P297)', () => {
  assert.deepEqual(normalizeOrchFields({ busy: [{ reader: 'hermes' }, 'cpu'] }).busy, [{ reader: 'hermes' }, 'cpu']);
  assert.throws(() => normalizeOrchFields({ busy: [{ reader: 'Bad Name' }] }), /바쁨 신호/);
  assert.deepEqual(readerSignals([{ reader: 'p296x' }]), [{ reader: 'p296x', busy: null, why: 'not_registered' }]);
  const off = registerInnerReader('p296x', ({ session }) => ({ busy: session && session.name === 'a' }));
  try {
    const rs = readerSignals([{ reader: 'p296x' }, 'cpu'], { session: { name: 'a' } });
    assert.deepEqual(rs, [{ reader: 'p296x', busy: true }]);
    const x = innerWork({ readers: rs, signals: [], now: 1 });
    assert.equal(x.busy, true); assert.deepEqual(x.why, ['reader:p296x']);
  } finally { off(); }
  for (const sc of ['sub', 'free']) {
    const p = orchPromptLines(sc).join(' ');
    assert.match(p, /하네스 안에서 나눠 돌린다/); assert.match(p, /위임/); assert.match(p, /atrium 명령은 보드와 말할 때만/);
    assert.doesNotMatch(p, /atrium prompt로만/);
  }
  const h = shortHelp({ orchestrates: true, scope: 'free', allowed: ['help', 'prompt', 'done'] });
  assert.doesNotMatch(h, /atrium prompt로만 보낸다/); assert.match(h, /하네스의 방식대로/);
  assert.match(shortHelp(), /atrium prompt로만 보낸다/, '보통 세션은 그대로');
});
