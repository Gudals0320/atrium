// P223 단위 시험: rig 2 R2 후속(docs research rig2-design.md 11.6의 12·3·6·4).
// 자리 permission 칸(ask | scoped | unattended)의 Claude Code·Codex 인자와 설정(쓰기 범위 안·밖, allow 목록), 사람만 고르는 unattended(켜기 확인·rig.permit, 승인 전 scoped),
// 장부의 권한 결정, 회 저절로 닫기(쉼 기준, 열린 일이 있으면 안 닫음, 닫힌 뒤 글은 새 회), 멈춘 고리에 온 요청 붙잡기(대기열 loop_paused, 실패로 남지 않음, 잇기에 넣기),
// task 칸 검사, "정기 점검" 견본(scoped). 가짜 판은 p221 틀(진짜 저장소·전달 대기열·Branch·Rig·RigAmp, 가짜 에이전트)
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
import { Rig, validateRig, rigHandlers } from '../src/rig.mjs';
import { RigDocs } from '../src/rig-docs.mjs';
import { RIG_EVENT_KINDS } from '../src/rig-ledger.mjs';
import { writeSessionSettings } from '../src/launch.mjs';
import { RigAmp, validateAmp, claudeSettingsAmp, applySettingsAmp, codexArgsAmp, seatAmpOf, effectivePermission, SEAT_PERMISSIONS, CLAUDE_PERMISSION_MODE } from '../src/rig-amp.mjs';
import { TASK_MAX, RUN_IDLE_MS } from '../src/rig-loops.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FX = path.join(HERE, 'fixtures');
const GROW = path.join(FX, 'rig-loops-grow');
const CHECK = path.join(FX, 'rig-loops-check');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p223-'));
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 5000) { const t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > ms) throw new Error('until: 시간 초과'); await tick(10); } }
const defOf = (dir) => JSON.parse(fs.readFileSync(path.join(dir, '.atrium', 'rig.json'), 'utf8'));
const exists = (f) => { try { fs.statSync(f); return true; } catch { return false; } };
const ledger = (b, key, q = {}) => b.store.rigEvents({ ws: key, limit: 10000, ...q });
const IDLE = 60000;
// 고리 둘: main keep(요청 입구) → worker fresh, worker ok → main. 자리 권한: main scoped(allow 둘, writes reports/), worker unattended(writes out/)
const permDef = (over = {}) => ({
  version: 2, results: ['ok', 'failed'],
  seats: {
    main: { launcher: 'claude', session: 'keep', permission: 'scoped', allow: ['Bash(git log:*)', 'Bash(gh pr list:*)'], writes: ['reports/'] },
    worker: { launcher: 'claude', session: 'fresh', max_live: 2, permission: 'unattended', writes: ['out/'] },
    cx: { launcher: 'codex', session: 'fresh', permission: 'scoped', writes: ['out/'] },
  },
  loops: {
    work: { kind: 'work', trigger: { request: 'main' }, entry: 'main', flow: [{ from: 'main', on: 'assign', to: 'worker' }, { from: 'worker', on: 'ok', to: 'main' }, { from: 'main', on: 'assign', to: 'cx' }] },
  },
  manager: 'main',
  ...over,
});

// ---------- 가짜 판(p219 틀) ----------
async function board({ dir = tmp(), from = GROW, def = null, enable = true, batchMs = 40, cfgExtra = {} } = {}) {
  fs.cpSync(from, dir, { recursive: true });
  if (def) { const f = path.join(dir, '.atrium', 'rig.json'); fs.writeFileSync(f, JSON.stringify(def, null, 2)); const t = new Date(Date.now() + Math.floor(Math.random() * 100000)); fs.utimesSync(f, t, t); }
  const store = new Store(path.join(dir, 'board.db'));
  const ws = await workspaceOf(dir);
  if (!store.getWorkspace(ws.key)) store.insertWorkspace({ ...ws, createdAt: 1 });
  const cfg = { profile: 'dev', terminalSession: 'atrium-dev-p221test', port: 0, dataDir: dir, sessionsDir: path.join(dir, 'sessions'), inputQuietMs: 3000, submitConfirmMs: 3000, deliveryMaxWaitMs: 60000, submitRetries: 0, rigCycles: false, ...cfgExtra };
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
  b.rigAmp = new RigAmp(b);
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

// ---------- 정의 ----------
test('P223 permission 칸: 기본 ask, scoped·unattended와 allow를 받고, 잘못된 값·규칙은 까닭과 함께 거절, 쓰이지 않는 allow와 unattended는 경고', () => {
  assert.deepEqual(SEAT_PERMISSIONS, ['ask', 'scoped', 'unattended']);
  const v = validateRig(permDef(), { root: GROW, exists });
  assert.ok(v.ok, v.reason);
  assert.deepEqual(seatAmpOf(v.def, 'main').permission, 'scoped');
  assert.deepEqual(seatAmpOf(v.def, 'main').allow, ['Bash(git log:*)', 'Bash(gh pr list:*)']);
  assert.equal(seatAmpOf(v.def, 'worker').permission, 'unattended');
  assert.ok(v.def.warnings.some((w) => /seats\.worker\.permission "unattended"는 사람이 승인해야/.test(w)));
  // 칸이 없으면 ask(지금 그대로)이고 amp에 자리 줄을 만들지 않는다
  const plain = validateRig({ version: 2, seats: { a: { launcher: 'claude', session: 'keep' } } }, { root: GROW, exists });
  assert.ok(plain.ok); assert.equal(plain.def.amp, null); assert.equal(seatAmpOf(plain.def, 'a').permission, 'ask');
  const bad = (seat, why) => { const d = permDef(); Object.assign(d.seats.main, seat); const r = validateRig(d, { root: GROW, exists }); assert.equal(r.ok, false, JSON.stringify(seat)); assert.match(r.reason, why); };
  bad({ permission: 'yolo' }, /seats\.main\.permission은 ask, scoped, unattended/);
  bad({ allow: 'Bash' }, /allow는 Claude Code 권한 규칙 글의 배열/);
  bad({ allow: ['rm -rf /'] }, /권한 규칙 꼴/);
  bad({ allow: [''] }, /allow는/);
  // allow는 scoped에서만 쓰인다(경고), unattended인데 writes가 없으면 경고
  const d2 = permDef(); d2.seats.main.permission = 'ask'; delete d2.seats.worker.writes;
  const w2 = validateRig(d2, { root: GROW, exists });
  assert.ok(w2.ok, w2.reason);
  assert.ok(w2.def.warnings.some((w) => /seats\.main\.allow는 permission "scoped" 자리에서만/.test(w)));
  assert.ok(w2.def.warnings.some((w) => /seats\.worker\.permission "unattended"인데 writes/.test(w)));
  assert.equal(validateAmp({ seats: { a: { launcher: 'claude', permission: 'ask' } } }, { seats: { a: {} } }).amp, null);
});

test('P223 Claude Code: scoped는 acceptEdits + 설정 파일 allow(판의 allow와 합침), unattended는 bypassPermissions(승인한 자리만, 아니면 scoped), ask는 그대로', () => {
  assert.deepEqual(CLAUDE_PERMISSION_MODE, { scoped: 'acceptEdits', unattended: 'bypassPermissions' });
  assert.equal(effectivePermission('unattended', false), 'scoped');
  assert.equal(effectivePermission('unattended', true), 'unattended');
  assert.equal(effectivePermission('ask', true), 'ask');
  assert.equal(effectivePermission(undefined, false), 'ask');
  const base = { writes: ['reports/'], stopVerify: false, preTool: [], protectedFiles: [], root: 'C:/r', cwd: 'C:/r' };
  const sc = claudeSettingsAmp({ ...base, permission: 'scoped', allow: ['Bash(git log:*)'] });
  assert.deepEqual(sc.allow, ['Bash(git log:*)']);
  assert.ok(sc.hooks.PreToolUse, '쓰기 범위 밖은 PreToolUse가 본다');
  const un = claudeSettingsAmp({ ...base, permission: 'unattended', allow: ['Bash(git log:*)'] });
  assert.equal(un.allow, undefined, 'unattended는 allow를 쓰지 않는다(묻지 않는다)');
  assert.ok(un.hooks.PreToolUse);
  // 설정 파일: 판의 allow(atrium 명령)와 합친다
  const dir = tmp();
  const f = writeSessionSettings({ file: path.join(dir, 's.json'), hookUrl: 'http://127.0.0.1:1/hook', token: 't', sessionId: 'x', allow: ['Bash(atrium:*)'], amp: sc });
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  assert.deepEqual(j.permissions.allow, ['Bash(atrium:*)', 'Bash(git log:*)']);
  // 다시 맞추기: 판의 allow는 남기고 증폭 allow만 바꾼다
  applySettingsAmp(j, { deny: [], allow: ['Bash(gh pr list:*)'], hooks: {} }, 2, ['Bash(atrium:*)']);
  assert.deepEqual(j.permissions.allow, ['Bash(atrium:*)', 'Bash(gh pr list:*)']);
  applySettingsAmp(j, null, 2, ['Bash(atrium:*)']);
  assert.deepEqual(j.permissions.allow, ['Bash(atrium:*)']);
  applySettingsAmp(j, null, 2, []);
  assert.equal(j.permissions, undefined);
});

test('P223 Codex: scoped는 -s workspace-write -a on-request, unattended는 -a never(호출자의 샌드박스·승인 인자를 걷음), writes false면 read-only, ask는 그대로', () => {
  const given = ['--sandbox', 'danger-full-access', '-a', 'never', '-c', 'sandbox_mode=x', '-c', 'approval_policy=y', '--dangerously-bypass-approvals-and-sandbox', '-m', 'gpt'];
  assert.deepEqual(codexArgsAmp(given, ['out/'], 'scoped'), ['-m', 'gpt', '--sandbox', 'workspace-write', '--ask-for-approval', 'on-request']);
  assert.deepEqual(codexArgsAmp(given, null, 'unattended'), ['-m', 'gpt', '--sandbox', 'workspace-write', '--ask-for-approval', 'never']);
  assert.deepEqual(codexArgsAmp(['--full-auto'], false, 'scoped'), ['--sandbox', 'read-only', '--ask-for-approval', 'on-request']);
  assert.deepEqual(codexArgsAmp(['-m', 'gpt'], null, 'ask'), ['-m', 'gpt'], 'ask는 지금 그대로');
  assert.deepEqual(codexArgsAmp(['--sandbox=danger-full-access', '--ask-for-approval=never'], null, 'scoped'), ['--sandbox', 'workspace-write', '--ask-for-approval', 'on-request']);
});

// ---------- 판: 자리 권한 ----------
test('P223 자리 권한: 승인 전 unattended는 scoped로 돌고 경고, 켜기 확인(사람)이 승인하고 장부에 한 줄, 뒤에 에이전트가 넣은 unattended는 다시 승인 전', async () => {
  const { b, ws, add, seat, stop } = await board({ def: permDef(), enable: false });
  try {
    const A = b.rigAmp;
    assert.equal(A.seatPermission(ws.key, 'main'), null, '꺼진 rig는 권한을 바꾸지 않는다');
    // 켜기 확인 창의 상태: 자리마다 permission(창이 unattended 자리를 따로 보인다)
    const st0 = b.rig.status(ws.key);
    assert.deepEqual(st0.seats.map((x) => [x.name, x.permission, x.runsAs || null]), [['main', 'scoped', null], ['worker', 'unattended', 'scoped'], ['cx', 'scoped', null]]);
    assert.deepEqual(st0.seats.find((x) => x.name === 'main').allow, ['Bash(git log:*)', 'Bash(gh pr list:*)']);
    // 판 API: 켜기 확인 없이 부르면 켜지 않는다(확인 창이 보일 상태). 기기 토큰은 승인 못 함
    const H = rigHandlers(b);
    const ask = await H['rig.enable']({ workspace: ws.key }, local);
    assert.equal(ask.needsConfirm, true); assert.equal(b.rig.enabled(ws.key), false);
    await assert.rejects(H['rig.permit']({ workspace: ws.key }, { auth: { kind: 'device' } }), (e) => e.code === 'forbidden');
    await H['rig.enable']({ workspace: ws.key, confirm: true }, local);
    assert.equal(b.rig.permitted(ws.key, 'worker'), true, '켜기 확인이 unattended 자리를 승인했다');
    const ap = ledger(b, ws.key, { kinds: ['seat_permission'] });
    assert.deepEqual(ap.map((r) => [r.seat, r.value, r.actor]), [['worker', 'approved', 'human']]);
    const w = A.seatPermission(ws.key, 'worker');
    assert.deepEqual([w.permission, w.claudeMode, w.pending], ['unattended', 'bypassPermissions', false]);
    const m = A.seatPermission(ws.key, 'main');
    assert.deepEqual([m.permission, m.claudeMode, m.allow], ['scoped', 'acceptEdits', ['Bash(git log:*)', 'Bash(gh pr list:*)']]);
    assert.deepEqual(A.seatPermission(ws.key, 'cx').codex, { sandbox: 'workspace-write', approval: 'on-request' });
    // 자리 세션을 띄운 뒤 장부에 권한 결정 한 줄(ask 자리는 적지 않는다)
    const s = add('main'); seat(s, 'main'); s.permissionMode = 'acceptEdits';
    A.notePermission(s);
    const row = ledger(b, ws.key, { kinds: ['seat_permission'] }).at(-1);
    assert.equal(row.value, 'scoped'); assert.equal(row.seat, 'main'); assert.match(row.text, /--permission-mode acceptEdits, allow 2/);
    assert.equal(row.data.mode, 'acceptEdits');
    // 관리자 자리(에이전트)가 정의를 고쳐 새 unattended 자리를 넣었다: 승인 전이라 scoped, rig status·check에 경고
    const d = permDef(); d.seats.main.permission = 'unattended';
    const f = path.join(b.rig.rootOf(ws.key), '.atrium', 'rig.json');
    fs.writeFileSync(f, JSON.stringify(d, null, 2)); const t = new Date(Date.now() + 5000); fs.utimesSync(f, t, t);
    const p2 = A.seatPermission(ws.key, 'main');
    assert.deepEqual([p2.asked, p2.permission, p2.pending, p2.claudeMode], ['unattended', 'scoped', true, 'acceptEdits']);
    assert.ok(b.rig.status(ws.key).warnings.some((x) => /seats\.main\.permission "unattended"는 사람이 아직 승인하지 않아 scoped로 돈다/.test(x)));
    const chk = await b.branch.rigAdmin.run(ws.key, 'check');
    assert.ok(chk.warnings.some((x) => /seats\.main\.permission "unattended"는 사람이 아직 승인하지 않아/.test(x)));
    A.notePermission(s);
    const row2 = ledger(b, ws.key, { kinds: ['seat_permission'] }).at(-1);
    assert.equal(row2.value, 'scoped'); assert.equal(row2.data.pending, true); assert.match(row2.text, /사람의 승인 전이라 scoped/);
    // 사람이 이 PC의 창에서 승인(rig.permit) → unattended
    const r = await H['rig.permit']({ workspace: ws.key, seat: 'main' }, local);
    assert.deepEqual(r.approved, ['main']);
    assert.equal(A.seatPermission(ws.key, 'main').claudeMode, 'bypassPermissions');
    assert.deepEqual(r.warnings.filter((x) => /승인하지 않아/.test(x)), []);
    // unattended가 아닌 자리는 승인 목록에 들지 않는다
    assert.deepEqual((await H['rig.permit']({ workspace: ws.key, seat: 'cx' }, local)).approved, []);
  } finally { await stop(); }
});

test('P223 쓰기 범위 밖: scoped 자리는 묻고(ask, 응답 필요로 뜬다), unattended·ask 자리는 거부, 안은 통과. 장부 gate value ask', async () => {
  const { b, ws, add, seat, dir, stop } = await board({ def: permDef(), enable: false });
  try {
    b.rig.setEnabled(ws.key, true, 'human');
    const A = b.rigAmp;
    const m = add('main'); seat(m, 'main');
    const w = add('worker-1'); seat(w, 'worker');
    const out1 = await A.answer(m, 'PreToolUse', { tool_name: 'Write', tool_input: { file_path: path.join(dir, 'src', 'a.js') } });
    assert.equal(out1.hookSpecificOutput.permissionDecision, 'ask');
    assert.match(out1.hookSpecificOutput.permissionDecisionReason, /쓰기 범위 밖/);
    assert.equal(await A.answer(m, 'PreToolUse', { tool_name: 'Write', tool_input: { file_path: path.join(dir, 'reports', 'r.md') } }), null, '쓰기 범위 안은 통과');
    const out2 = await A.answer(w, 'PreToolUse', { tool_name: 'Edit', tool_input: { file_path: path.join(dir, 'src', 'a.js') } });
    assert.equal(out2.hookSpecificOutput.permissionDecision, 'deny');
    const gates = ledger(b, ws.key, { kinds: ['gate'] });
    assert.deepEqual(gates.map((g) => g.value), ['ask', 'reject']);
    assert.equal(gates[0].data.ask, true);
    // 설정 파일의 증폭: main은 allow 둘, worker는 allow 없음
    assert.deepEqual(A.claudeAmp(m).allow, ['Bash(git log:*)', 'Bash(gh pr list:*)']);
    assert.equal(A.claudeAmp(w).allow, undefined);
    // Codex 자리: 띄우는 인자
    const c = add('cx-1', { kind: 'codex' }); seat(c, 'cx');
    assert.deepEqual(A.launcherArgs(c, ['-m', 'gpt']), ['-m', 'gpt', '--sandbox', 'workspace-write', '--ask-for-approval', 'on-request']);
  } finally { await stop(); }
});

test('P223 장부 kind: seat_permission이 닫힌 목록에 있다', () => {
  assert.ok(RIG_EVENT_KINDS.includes('seat_permission'));
});

// ---------- 회 저절로 닫기 ----------
test('P223 회 저절로 닫기: 입구 세션이 쉼 기준만큼 쉬고 열린 일이 없으면 닫고(case_done auto, 주인의 일도 닫음), 그 전 글은 회를 잇고, 닫힌 뒤 글은 새 회', async () => {
  const { b, ws, add, L, seat, stop } = await board({ cfgExtra: { rigRunIdleMs: IDLE } });
  try {
    assert.equal(RUN_IDLE_MS, 30 * 60000);
    assert.equal(L().idleMs(), IDLE);
    const main = add('main'); seat(main, 'main');
    const o = L().onRequest(main, human, '보고서 표 3 고치기');
    await gotUnit(main);
    await until(() => deriveState(main.rt).state !== 'working');
    const r = b.rig.active(ws.key);
    // 쉼 기준 전: 닫지 않는다
    assert.deepEqual(L().autoClose(ws.key, r, Date.now() + IDLE / 2), []);
    // 그 사이 사람 글은 같은 회의 이어지는 지시(새 회를 열지 않는다)
    assert.equal(L().onRequest(main, human, '표 4도'), null);
    // 쉼 기준이 지나면 닫는다
    const closed = L().autoClose(ws.key, r, Date.now() + IDLE * 2);
    assert.deepEqual(closed, [o.caseId]);
    const c = b.store.getCase(o.caseId);
    assert.equal(c.state, 'done');
    const done = ledger(b, ws.key, { kinds: ['case_done'] }).at(-1);
    assert.equal(done.value, 'auto'); assert.equal(done.caseId, o.caseId); assert.match(done.text, /쉬고 열린 일이 없어 판이 닫음/);
    assert.equal(b.store.openTryOf(main.sessionId), null, '주인의 열린 일도 닫았다');
    assert.ok(b.store.unitsOfCase(o.caseId).every((u) => u.status === 'done'));
    // 닫힌 뒤 글은 새 회(일이 줄에 서지 않고 곧바로 간다)
    const n = L().onRequest(main, human, '새 일');
    assert.ok(n && n.caseId && n.caseId !== o.caseId);
    assert.equal(n.made.held, undefined, '줄에 서지 않았다');
    await until(() => main.texts.filter((t) => t.includes('[Atrium 보드] 관계:')).length === 2);
  } finally { await stop(); }
});

test('P223 회 저절로 닫기: 다른 자리의 열린 일·일하는 중·멈춘 고리·멈춘 회는 닫지 않는다. loops 없는 정의(지금 길)도 닫지 않는다', async () => {
  const flowDef = { version: 2, results: ['ok', 'failed'], seats: { main: { launcher: 'claude', session: 'keep' }, worker: { launcher: 'claude', session: 'fresh', max_live: 2 } }, loops: { work: { kind: 'work', trigger: { request: 'main' }, entry: 'main', flow: [{ from: 'main', on: 'assign', to: 'worker' }, { from: 'worker', on: 'ok', to: 'main' }] } }, manager: 'main' };
  const { b, ws, add, L, seat, by, stop } = await board({ def: flowDef, cfgExtra: { rigRunIdleMs: IDLE } });
  try {
    const main = add('main'); seat(main, 'main');
    const o = L().onRequest(main, human, '두 장 번역');
    await gotUnit(main);
    const a1 = await V(b).prompt(main, { name: 'worker', text: '1장' });
    const w1 = by(a1.name);
    await gotUnit(w1);
    await until(() => deriveState(main.rt).state !== 'working');
    const r = b.rig.active(ws.key);
    const later = Date.now() + IDLE * 3;
    assert.equal(L().autoCloseWhy(b.store.getCase(o.caseId), later, IDLE), 'open_work');
    assert.deepEqual(L().autoClose(ws.key, r, later), []);
    // 일하는 중이면 쉬는 것이 아니다
    applyTermStatus(main.rt, 'working');
    assert.equal(L().autoCloseWhy(b.store.getCase(o.caseId), later, IDLE), 'busy');
    applyTermStatus(main.rt, 'idle');
    // worker done → 주인에게 보고. 그 뒤 쉬면 닫힌다. 고리를 멈추면 닫지 않는다
    await U(b).doneVerb(w1, { result: 'ok', text: '1장 끝' });
    await until(() => main.texts.some((t) => t.includes('1장 끝')));
    await until(() => deriveState(main.rt).state !== 'working');
    L().pause(ws.key, 'work');
    assert.deepEqual(L().autoClose(ws.key, r, later), [], '멈춘 고리의 회는 닫지 않는다');
    await L().resume(ws.key, 'work');
    L().pause(ws.key, o.caseId);
    assert.equal(L().autoCloseWhy(b.store.getCase(o.caseId), later, IDLE), 'paused');
    await L().resume(ws.key, o.caseId);
    assert.deepEqual(L().autoClose(ws.key, r, later), [o.caseId]);
  } finally { await stop(); }
  // loops 없는 정의: 회(건)는 지금처럼 done이 닫는다
  const v1 = { results: ['ok', 'failed'], seats: { main: { launcher: 'claude', session: 'keep' }, worker: { launcher: 'claude', session: 'fresh' } }, flow: [{ from: 'main', on: 'assign', to: 'worker' }], manager: 'main' };
  const B2 = await board({ def: v1, cfgExtra: { rigRunIdleMs: IDLE } });
  try {
    const main = B2.add('main'); B2.seat(main, 'main');
    const a = await V(B2.b).prompt(main, { name: 'worker', text: '일' });
    assert.ok(a.unit.caseId);
    assert.deepEqual(B2.L().autoClose(B2.ws.key, B2.b.rig.active(B2.ws.key), Date.now() + IDLE * 3), []);
  } finally { await B2.stop(); }
});

// ---------- 멈춘 고리에 온 요청 ----------
test('P223 멈춘 고리의 요청: 전달 대기열에 loop_paused로 붙잡고(실패 아님, 보내지 않음, 다른 글의 차례를 막지 않음), 잇기에 그 전달로 회의 일이 들어간다', async () => {
  const { b, ws, add, L, seat, stop } = await board();
  try {
    const main = add('main'); seat(main, 'main');
    L().pause(ws.key, 'work', { by: 'human' });
    const h = L().onRequest(main, human, '첫 요청');
    assert.equal(h.held, true);
    assert.ok(h.d, '대기열의 전달');
    const d0 = b.queue.items.get(h.d.deliveryId);
    assert.deepEqual([d0.status, d0.reason, d0.parked], ['queued', 'loop_paused', 'loop_paused']);
    assert.equal(b.store.getDelivery(h.d.deliveryId).status, 'queued', '실패로 남지 않았다');
    // 다른 글은 붙잡힌 요청 뒤에 서지 않는다
    const n = b.queue.enqueue(main.sessionId, '판 알림 한 줄');
    await until(() => main.texts.includes('판 알림 한 줄'));
    await tick(80);
    assert.equal(main.texts.some((t) => t.includes('첫 요청')), false, '붙잡은 요청은 보내지 않는다');
    assert.equal(b.queue.items.get(h.d.deliveryId).status, 'queued');
    // 바로 보내기·고치기는 안 되고 취소는 된다(아래 둘째 요청)
    assert.throws(() => b.queue.sendNow(h.d.deliveryId), (e) => e.code === 'loop_paused');
    assert.throws(() => b.queue.hold(h.d.deliveryId), (e) => e.code === 'loop_paused');
    const h2 = L().onRequest(main, human, '둘째 요청(취소함)');
    b.queue.cancel(h2.d.deliveryId);
    // rig 밖 세션의 atrium prompt도 붙잡힌다(전달 ID를 돌려준다)
    const out = add('outsider');
    const p = await V(b).prompt(out, { name: 'main', text: '셋째 요청' });
    assert.equal(p.delivery.reason, 'loop_paused'); assert.ok(p.deliveryId);
    assert.equal(b.queue.items.get(p.deliveryId).parked, 'loop_paused');
    assert.equal(ledger(b, ws.key, { kinds: ['loop_skip'] }).at(-1).data.deliveryId, p.deliveryId);
    // 잇기: 붙잡은 첫 전달이 일 머리를 달고 들어간다(같은 전달 ID). 취소한 요청은 회를 열지 않는다
    const r = await L().resume(ws.key, 'work', { by: 'human' });
    assert.deepEqual(r.opened.map((x) => x.name), ['첫 요청', '셋째 요청']);
    await until(() => main.texts.some((t) => t.includes('첫 요청') && t.includes('[Atrium 보드] 관계:')));
    const d1 = b.store.getDelivery(h.d.deliveryId);
    assert.ok(['sent', 'confirmed'].includes(d1.status), d1.status);
    const tr = b.store.openTryOf(main.sessionId);
    assert.equal(tr.deliveryId, h.d.deliveryId, '일의 시도가 붙잡았던 전달이다');
    // 셋째는 첫 회가 끝날 때까지 줄에 선다(일이 입구 세션의 줄) → 붙잡았던 전달은 loop_unit_queued로 끝난다
    assert.equal(b.store.getDelivery(p.deliveryId).reason, 'loop_unit_queued');
    assert.equal(b.store.getDelivery(h2.d.deliveryId).status, 'cancelled');
    assert.equal(b.store.heldLoopRequests(ws.key, 'work').length, 0);
    await U(b).doneVerb(main, { result: 'ok', text: '첫째 끝' });
    await until(() => main.texts.some((t) => t.includes('셋째 요청') && t.includes('[Atrium 보드] 관계:')));
  } finally { await stop(); }
});

test('P223 멈춘 고리의 요청: 판이 다시 떠도 붙잡힌 채(대기열이 까닭으로 다시 붙잡음)', async () => {
  const dir = tmp();
  const store = new Store(path.join(dir, 'b.db'));
  const cfg = { inputQuietMs: 3000, submitConfirmMs: 3000, deliveryMaxWaitMs: 60000 };
  const sent = [];
  const mk = () => new DeliveryQueue({ store, cfg, view: () => ({ state: 'ready', agentPresent: true, termConnected: true, lastUserInputAt: 0, closed: false }), send: async (sid, text) => { sent.push(text); } });
  const q1 = mk();
  const d = q1.park('s1', '붙잡은 글');
  q1.stop();
  const q2 = mk(); q2.start();
  try {
    await tick(700);
    assert.deepEqual(sent, []);
    assert.equal(q2.items.get(d.deliveryId).parked, 'loop_paused');
    assert.ok(q2.unpark(d.deliveryId, '머리\n\n붙잡은 글'));
    await until(() => sent.length === 1);
    assert.equal(sent[0], '머리\n\n붙잡은 글');
    assert.equal(q2.unpark(d.deliveryId), null, '이미 놓였다');
  } finally { q2.stop(); store.close(); }
});

// ---------- task 칸 ----------
test('P223 task 칸: every 회의 첫 일 글. 빈 글·길이 초과는 거절, request 고리의 task와 task 없는 every 작업 고리는 경고, 고리 보기에 task', async () => {
  const base = defOf(CHECK);
  const ok = validateRig(base, { root: CHECK, exists });
  assert.ok(ok.ok, ok.reason);
  assert.match(ok.def.loops.check.task, /^Weekly check/);
  const v = (mut) => { const d = JSON.parse(JSON.stringify(base)); mut(d); return validateRig(d, { root: CHECK, exists }); };
  assert.match(v((d) => { d.loops.check.task = '  '; }).reason, /loops\.check\.task는 글이다/);
  assert.match(v((d) => { d.loops.check.task = 'x'.repeat(TASK_MAX + 1); }).reason, new RegExp(`task는 ${TASK_MAX}자까지`));
  assert.ok(v((d) => { delete d.loops.check.task; }).def.warnings.some((w) => /every 작업 고리에 task가 없다/.test(w)));
  const g = defOf(GROW); g.loops.work.task = '이건 안 쓰인다';
  assert.ok(validateRig(g, { root: GROW, exists }).def.warnings.some((w) => /loops\.work\.task는 every 고리의 회에만/.test(w)));
});

// ---------- 바로가기 견본 ----------
test('P223 "정기 점검" 견본: 입구 자리 scoped, allow는 읽기만 하는 git·gh 명령, writes는 보고서 폴더와 장부', async () => {
  const d = defOf(CHECK);
  const ck = d.seats.checker;
  assert.equal(ck.permission, 'scoped');
  assert.ok(ck.allow.length >= 6);
  for (const r of ck.allow) assert.match(r, /^Bash\((git (status|log|diff|show|branch)|gh (run (list|view)|issue (list|view)|pr (list|view|checks))):\*\)$/, r);
  assert.deepEqual(ck.writes, ['check-log', 'reports']);
  const { b, ws, stop } = await board({ from: CHECK });
  try {
    const p = b.rigAmp.seatPermission(ws.key, 'checker');
    assert.deepEqual([p.permission, p.claudeMode], ['scoped', 'acceptEdits']);
    assert.deepEqual(p.writes, ['ledger/checks.jsonl', 'reports/']);
    assert.match(b.branch.flow.loops.view(ws.key, b.rig.active(ws.key).def)[0].task, /^Weekly check/, '고리 보기에 task');
    // 판이 자리 세션을 띄울 때 권한 모드를 자리 권한으로 바꾼다(backend.spawn)
    const src = fs.readFileSync(path.join(HERE, '..', 'src', 'backend.mjs'), 'utf8');
    assert.match(src, /seatPerm = seatSpawn && this\.rigAmp && this\.rigAmp\.seatPermission \? this\.rigAmp\.seatPermission\(ws\.key, seatSpawn\)/);
    assert.match(src, /if \(claude && seatPerm && seatPerm\.claudeMode\) permissionMode = seatPerm\.claudeMode/);
    // 보드가 띄운 fresh 입구(every 회)
    const t0 = Date.now();
    await b.branch.flow.loops.tick(t0);
    const f = await b.branch.flow.loops.tick(t0 + 8 * 86400000);
    assert.equal(f.length, 1);
  } finally { await stop(); }
});
