// P225 단위 시험: rig 2 설계 11.8(P223에서 돌아온 것)의 여섯.
// 무인 승인을 자리 해시에 묶기(바뀌면 풀림, 승인 전 scoped, 응답 필요 항목, 관리자가 더한 자리), "정기 점검" 견본의 읽기 PowerShell 허용 목록,
// Codex 자리 allow 경고, 회 저절로 닫기의 try_stopped auto_closed, 멈춘 고리에 붙잡은 요청의 고리 저장(다시 떠도 [잇기]), 자리 close run | never.
// 가짜 판은 p223 틀(진짜 저장소·전달 대기열·Branch·Rig·RigAmp, 가짜 에이전트)에 kill·broadcastWorkspaces를 더했다
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
import { Rig, validateRig, rigHandlers, SEAT_CLOSES } from '../src/rig.mjs';
import { RigDocs } from '../src/rig-docs.mjs';
import { TRY_STOP_VALUES } from '../src/rig-ledger.mjs';
import { RigAmp, seatPermitHash } from '../src/rig-amp.mjs';
import { permitNeeds } from '../../app/src/renderer/lib/rig-permits.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FX = path.join(HERE, 'fixtures');
const GROW = path.join(FX, 'rig-loops-grow');
const CHECK = path.join(FX, 'rig-loops-check');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p225-'));
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 5000) { const t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > ms) throw new Error('until: 시간 초과'); await tick(10); } }
const defOf = (dir) => JSON.parse(fs.readFileSync(path.join(dir, '.atrium', 'rig.json'), 'utf8'));
const exists = (f) => { try { fs.statSync(f); return true; } catch { return false; } };
const ledger = (b, key, q = {}) => b.store.rigEvents({ ws: key, limit: 10000, ...q });
const IDLE = 60000;
let bump = 0;
const rewrite = (b, key, def) => { const f = path.join(b.rig.rootOf(key), '.atrium', 'rig.json'); fs.writeFileSync(f, JSON.stringify(def, null, 2)); const t = new Date(Date.now() + 5000 + (++bump) * 1000); fs.utimesSync(f, t, t); };
const permDef = (over = {}) => ({
  version: 2, results: ['ok', 'failed'],
  seats: {
    main: { launcher: 'claude', session: 'keep', permission: 'scoped', allow: ['Bash(git log:*)'], writes: ['reports/'] },
    worker: { launcher: 'claude', session: 'fresh', max_live: 2, permission: 'unattended', writes: ['out/'] },
  },
  loops: { work: { kind: 'work', trigger: { request: 'main' }, entry: 'main', flow: [{ from: 'main', on: 'assign', to: 'worker' }, { from: 'worker', on: 'ok', to: 'main' }] } },
  manager: 'main',
  ...over,
});
const clone = (x) => JSON.parse(JSON.stringify(x));

// ---------- 가짜 판(p219 틀) ----------
async function board({ dir = tmp(), from = GROW, def = null, enable = true, batchMs = 40, cfgExtra = {} } = {}) {
  fs.cpSync(from, dir, { recursive: true });
  if (def) { const f = path.join(dir, '.atrium', 'rig.json'); fs.writeFileSync(f, JSON.stringify(def, null, 2)); const t = new Date(Date.now() + Math.floor(Math.random() * 100000)); fs.utimesSync(f, t, t); }
  const store = new Store(path.join(dir, 'board.db'));
  const ws = await workspaceOf(dir);
  if (!store.getWorkspace(ws.key)) store.insertWorkspace({ ...ws, createdAt: 1 });
  const cfg = { profile: 'dev', terminalSession: 'atrium-dev-p225test', port: 0, dataDir: dir, sessionsDir: path.join(dir, 'sessions'), inputQuietMs: 3000, submitConfirmMs: 3000, deliveryMaxWaitMs: 60000, submitRetries: 0, rigCycles: false, ...cfgExtra };
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
    killed: [], wsCasts: 0, broadcastWorkspaces() { b.wsCasts++; },
    async kill(p) { b.killed.push(p.session); const s = b.sessions.get(p.session); if (s) b.closeSession(s, 'killed'); return { closed: true }; },
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


// ---------- 1. 무인 승인을 해시에 묶기 ----------
test('P225 승인 해시: permission·writes·allow·tools·launcher가 바뀌면 해시가 바뀌고, 다른 칸(guide·max_live)은 그대로', () => {
  const v = (d) => validateRig(d, { root: GROW, exists }).def;
  const base = v(permDef());
  const h = seatPermitHash(base, 'worker');
  assert.match(h, /^[0-9a-f]{16}$/);
  const mut = (f) => { const d = permDef(); f(d); return seatPermitHash(v(d), 'worker'); };
  assert.notEqual(mut((d) => { d.seats.worker.writes = ['out/', 'more/']; }), h, 'writes');
  assert.notEqual(mut((d) => { d.seats.worker.permission = 'scoped'; }), h, 'permission');
  assert.notEqual(mut((d) => { d.seats.worker.launcher = 'codex'; }), h, 'launcher');
  assert.notEqual(mut((d) => { d.seats.worker.permission = 'scoped'; d.seats.worker.allow = ['Bash(ls:*)']; }), mut((d) => { d.seats.worker.permission = 'scoped'; }), 'allow');
  assert.equal(mut((d) => { d.seats.worker.max_live = 3; }), h, 'max_live는 권한 칸이 아니다');
  const tl = (tools) => { const d = permDef({ tools: { count: { run: ['node', '.atrium/tools/count.mjs'] } } }); if (tools) d.seats.worker.tools = tools; const v2 = validateRig(d, { root: path.join(FX, 'rig-sample'), exists }); assert.ok(v2.ok, v2.reason); return seatPermitHash(v2.def, 'worker'); };
  assert.notEqual(tl(['count']), tl(null), 'tools');
});

test('P225 승인 해시: 켜기 확인이 승인한 자리도 권한 칸이 바뀌면 승인이 풀려 scoped로 돌고, 응답 필요 항목·장부 pending(풀림)·창 알림, 다시 승인하면 unattended. 옛 칸으로 되돌아와도 되살아나지 않는다', async () => {
  const { b, ws, stop } = await board({ def: permDef(), enable: false });
  try {
    const H = rigHandlers(b);
    await H['rig.enable']({ workspace: ws.key, confirm: true }, local);
    assert.equal(b.rig.permitted(ws.key, 'worker'), true);
    assert.equal(b.rigAmp.seatPermission(ws.key, 'worker').permission, 'unattended');
    assert.deepEqual(b.rig.permitNeeds(), []);
    const row0 = b.store.rigPermitRows(ws.key)[0];
    assert.equal(row0.hash, seatPermitHash(b.rig.read(ws.key).def, 'worker'), '승인 줄에 해시');
    // 관리자 자리가 worker의 쓰기 범위를 넓혔다 → 승인 풀림
    const d1 = permDef(); d1.seats.worker.writes = ['out/', 'src/'];
    rewrite(b, ws.key, d1);
    assert.equal(b.rig.permitted(ws.key, 'worker'), false);
    const p = b.rigAmp.seatPermission(ws.key, 'worker');
    assert.deepEqual([p.asked, p.permission, p.pending, p.claudeMode], ['unattended', 'scoped', true, 'acceptEdits']);
    assert.deepEqual(b.rig.permitNeeds().map((x) => [x.workspace, x.seat]), [[ws.key, 'worker']]);
    assert.ok(b.rig.status(ws.key).warnings.some((w) => /seats\.worker\.permission "unattended"는 사람이 아직 승인하지 않아 scoped로 돈다\(승인한 뒤/.test(w)));
    // 주기: 장부 pending(풀림) 한 줄, 승인 줄을 지움, 창에 알림. 같은 상태로 다시 보면 아무것도 하지 않는다
    const casts = b.wsCasts;
    assert.equal(b.rig.watchPermits(ws.key), true);
    const pend = ledger(b, ws.key, { kinds: ['seat_permission'] }).filter((r) => r.value === 'pending');
    assert.equal(pend.length, 1);
    assert.deepEqual([pend[0].seat, pend[0].actor, pend[0].data.lapsed, pend[0].data.pending], ['worker', 'board', true, true]);
    assert.match(pend[0].text, /승인한 뒤 자리의 권한 칸이 바뀜/);
    assert.equal(b.store.rigPermitRows(ws.key).length, 0, '해시가 바뀐 승인 줄은 지운다');
    assert.equal(b.wsCasts, casts + 1);
    assert.equal(b.rig.watchPermits(ws.key), false);
    // 사람이 창에서 승인(응답 필요 항목의 [승인] = rig.permit)
    const r = await H['rig.permit']({ workspace: ws.key, seats: ['worker'] }, local);
    assert.deepEqual(r.approved, ['worker']);
    assert.equal(b.rigAmp.seatPermission(ws.key, 'worker').claudeMode, 'bypassPermissions');
    assert.deepEqual(b.rig.permitNeeds(), []);
    assert.equal(b.rig.watchPermits(ws.key), true, '목록이 비었다(창에 알림)');
    // scoped로 갔다가 같은 칸의 unattended로 되돌아와도 옛 승인은 되살아나지 않는다
    const d2 = clone(d1); d2.seats.worker.permission = 'scoped';
    rewrite(b, ws.key, d2); b.rig.watchPermits(ws.key);
    assert.equal(b.store.rigPermitRows(ws.key).length, 0, 'unattended가 아니게 된 자리의 승인은 지운다');
    rewrite(b, ws.key, d1); b.rig.watchPermits(ws.key);
    assert.equal(b.rig.permitted(ws.key, 'worker'), false);
    assert.equal(b.rigAmp.seatPermission(ws.key, 'worker').permission, 'scoped');
  } finally { await stop(); }
});

test('P225 승인 해시: 관리자가 정의에 더한 무인 자리도 응답 필요 항목. 꺼진 rig는 항목 없음(켜기 확인이 승인), 창 목록은 워크스페이스의 rigPermits로', async () => {
  const { b, ws, stop } = await board({ def: permDef(), enable: false });
  try {
    assert.deepEqual(b.rig.permitNeeds(), [], '꺼진 rig');
    b.rig.setEnabled(ws.key, true, 'human');
    const d = permDef(); d.seats.main.permission = 'unattended'; delete d.seats.main.allow;
    rewrite(b, ws.key, d);
    assert.deepEqual(b.rig.permitNeeds(ws.key).map((x) => x.seat), ['main']);
    b.rig.watchPermits(ws.key);
    const pend = ledger(b, ws.key, { kinds: ['seat_permission'] }).filter((r) => r.value === 'pending');
    assert.deepEqual(pend.map((r) => [r.seat, r.data.lapsed]), [['main', false]]);
    // 창: 워크스페이스 목록의 rigPermits → 응답 필요 항목
    assert.deepEqual(permitNeeds([{ key: ws.key, rigPermits: ['main'] }, { key: 'x' }]), [{ ws: ws.key, seat: 'main', key: `${ws.key}|main` }]);
    assert.deepEqual(permitNeeds(null), []);
    // 판(backend.mjs)의 inbox·워크스페이스 목록이 rig 항목을 싣는다
    const src = fs.readFileSync(path.join(HERE, '..', 'src', 'backend.mjs'), 'utf8');
    assert.match(src, /kind: 'seat_permit', \.\.\.x, text: `무인 자리 승인: \$\{x\.seat\}`/);
    assert.match(src, /rigPermits: l\.map\(\(x\) => x\.seat\)/);
    // 주기(rig 고리 tick)가 승인 기다림을 본다
    b.rig.permitSig.clear();
    await b.branch.flow.loops.tick(Date.now());
    assert.equal(b.rig.permitSig.get(ws.key), 'main');
  } finally { await stop(); }
});

// ---------- 2. 정기 점검 견본 ----------
test('P225 "정기 점검" 견본: allow에 읽기만 하는 PowerShell 규칙(목록·내용·찾기·있는지), close run, 경고 없이 scoped 자리 설정에 들어간다', async () => {
  const d = defOf(CHECK);
  const ck = d.seats.checker;
  for (const r of ['PowerShell(Get-ChildItem:*)', 'PowerShell(Get-Content:*)', 'PowerShell(Select-String:*)', 'PowerShell(Test-Path:*)']) assert.ok(ck.allow.includes(r), r);
  assert.ok(ck.allow.every((r) => !/Remove-|Set-|New-|Out-File|Add-Content|Invoke-/.test(r)), '쓰는 명령은 없다');
  assert.equal(ck.close, 'run');
  const v = validateRig(d, { root: CHECK, exists });
  assert.ok(v.ok, v.reason);
  assert.equal(v.def.seats.checker.close, 'run');
  assert.deepEqual(v.def.warnings.filter((w) => /allow/.test(w)), []);
  const { b, ws, stop } = await board({ from: CHECK });
  try {
    const p = b.rigAmp.seatPermission(ws.key, 'checker');
    assert.ok(p.allow.includes('PowerShell(Get-ChildItem:*)'));
    const s = { sessionId: 'S', workspaceKey: ws.key, rigSeat: 'checker', kind: 'claude', cwd: b.rig.rootOf(ws.key) };
    assert.ok(b.rigAmp.claudeAmp(s).allow.includes('PowerShell(Select-String:*)'), '세션 설정 파일의 allow');
  } finally { await stop(); }
});

// ---------- 3. Codex allow 경고 ----------
test('P225 Codex 자리의 allow: rig check가 "Codex에서는 쓰지 않는다" 경고(종류 이름 자리와 Codex 런처 자리), Claude Code 자리는 경고 없음', async () => {
  const d = permDef(); d.seats.cx = { launcher: 'codex', session: 'fresh', permission: 'scoped', allow: ['Bash(git log:*)'], writes: ['out/'] };
  d.loops.work.flow.push({ from: 'main', on: 'assign', to: 'cx' });
  const v = validateRig(d, { root: GROW, exists });
  assert.ok(v.ok, v.reason);
  assert.ok(v.def.warnings.some((w) => /^seats\.cx\.allow는 Codex 자리에서 쓰지 않는다/.test(w)));
  assert.ok(!v.def.warnings.some((w) => /seats\.main\.allow는 Codex/.test(w)));
  // 런처 이름 자리(그 런처의 종류가 codex)
  const d2 = clone(d); d2.seats.cx.launcher = 'my-codex';
  const { b, ws, stop } = await board({ def: d2 });
  try {
    b.rigSetup.findLauncher = (n) => (n === 'my-codex' ? { name: 'my-codex', harness: 'codex' } : null);
    const chk = await b.branch.rigAdmin.run(ws.key, 'check');
    assert.ok(chk.ok, chk.reason);
    assert.ok(chk.warnings.some((w) => /^seats\.cx\.allow는 Codex 자리에서 쓰지 않는다.*\(런처 my-codex\)$/.test(w)), JSON.stringify(chk.warnings));
  } finally { await stop(); }
});

// ---------- 4. 저절로 닫힘 시도 ----------
test('P225 회 저절로 닫기: 주인의 열린 시도에 try_stopped auto_closed(회는 case_done auto 그대로)', async () => {
  assert.ok(TRY_STOP_VALUES.includes('auto_closed'));
  const { b, ws, add, L, seat, stop } = await board({ cfgExtra: { rigRunIdleMs: IDLE } });
  try {
    const main = add('main'); seat(main, 'main');
    const o = L().onRequest(main, human, '표 고치기');
    await gotUnit(main);
    await until(() => deriveState(main.rt).state !== 'working');
    const tr = b.store.openTryOf(main.sessionId);
    assert.ok(tr);
    assert.deepEqual(L().autoClose(ws.key, b.rig.active(ws.key), Date.now() + IDLE * 2), [o.caseId]);
    const stp = ledger(b, ws.key, { kinds: ['try_stopped'] }).filter((r) => r.value === 'auto_closed');
    assert.equal(stp.length, 1);
    assert.deepEqual([stp[0].caseId, stp[0].tryId, stp[0].unitId, stp[0].session, stp[0].actor], [o.caseId, tr.id, tr.unitId, main.sessionId, 'board']);
    assert.equal(ledger(b, ws.key, { kinds: ['case_done'] }).at(-1).value, 'auto');
    const rows = ledger(b, ws.key, { caseIds: [o.caseId] }).map((r) => r.kind);
    assert.ok(rows.indexOf('try_stopped') < rows.lastIndexOf('case_done'), '시도가 먼저 닫히고 회가 닫힌다');
  } finally { await stop(); }
});

// ---------- 5. 붙잡은 요청 저장 ----------
test('P225 멈춘 고리에 붙잡은 요청: 고리를 전달 표에 저장해 판이 다시 떠도 [잇기]의 고리가 남고, 놓이면 지운다', async () => {
  const dir = tmp();
  const store = new Store(path.join(dir, 'b.db'));
  const cfg = { inputQuietMs: 3000, submitConfirmMs: 3000, deliveryMaxWaitMs: 60000 };
  const sent = [];
  const mk = () => new DeliveryQueue({ store, cfg, view: () => ({ state: 'ready', agentPresent: true, termConnected: true, lastUserInputAt: 0, closed: false }), send: async (sid, text) => { sent.push(text); } });
  const q1 = mk();
  const d = q1.park('s1', '붙잡은 글', 'loop_paused', { loop: 'work', workspace: 'W1' });
  const plain = q1.park('s1', '고리 없음');
  q1.stop();
  assert.deepEqual(store.getDelivery(d.deliveryId).parkLoop, { loop: 'work', workspace: 'W1' });
  const q2 = mk(); q2.start();
  try {
    await tick(600);
    assert.deepEqual(sent, []);
    const it = q2.items.get(d.deliveryId);
    assert.equal(it.parked, 'loop_paused');
    assert.deepEqual(it.parkLoop, { loop: 'work', workspace: 'W1' }, '다시 뜬 뒤에도 [잇기]의 고리');
    assert.equal(q2.items.get(plain.deliveryId).parkLoop, undefined);
    // 판의 delivery 이벤트(창의 대기열)도 고리를 싣는다
    const ev = []; q2.on('delivery', (x) => ev.push(x));
    q2._emit(it);
    assert.deepEqual(ev[0].parkLoop, { loop: 'work', workspace: 'W1' });
    assert.ok(q2.unpark(d.deliveryId, '머리\n\n붙잡은 글'));
    assert.equal(store.getDelivery(d.deliveryId).parkLoop, undefined, '놓이면 지운다');
    await until(() => sent.length === 1);
    q2.cancel(plain.deliveryId);
  } finally { q2.stop(); store.close(); }
});

test('P225 멈춘 고리에 붙잡은 요청: 판의 길(onRequest)도 고리를 저장한다', async () => {
  const { b, ws, add, L, seat, stop } = await board();
  try {
    const main = add('main'); seat(main, 'main');
    L().pause(ws.key, 'work', { by: 'human' });
    const o = L().onRequest(main, human, '멈춘 동안 온 요청');
    assert.equal(o.held, true);
    assert.deepEqual(b.store.getDelivery(o.d.deliveryId).parkLoop, { loop: 'work', workspace: ws.key });
  } finally { await stop(); }
});

// ---------- 6. 자리 close ----------
test('P225 자리 close: v2 fresh는 기본 run, v1 fresh는 never, keep은 없음. 잘못된 값·keep 자리의 close는 거절. rig check 요약과 rig status에 close', async () => {
  assert.deepEqual(SEAT_CLOSES, ['run', 'never']);
  const v2 = validateRig(permDef(), { root: GROW, exists });
  assert.ok(v2.ok, v2.reason);
  assert.equal(v2.def.seats.worker.close, 'run');
  assert.equal(v2.def.seats.main.close, undefined);
  const v1 = validateRig({ results: ['ok', 'failed'], seats: { main: { launcher: 'claude', session: 'keep' }, worker: { launcher: 'claude', session: 'fresh' } }, flow: [{ from: 'main', on: 'assign', to: 'worker' }], manager: 'main' }, { root: GROW, exists });
  assert.ok(v1.ok, v1.reason);
  assert.equal(v1.def.seats.worker.close, 'never', 'v1은 지금 그대로');
  const n = permDef(); n.seats.worker.close = 'never';
  assert.equal(validateRig(n, { root: GROW, exists }).def.seats.worker.close, 'never');
  const bad = permDef(); bad.seats.worker.close = 'turn';
  assert.match(validateRig(bad, { root: GROW, exists }).reason, /seats\.worker\.close는 run 또는 never다/);
  const bk = permDef(); bk.seats.main.close = 'run';
  assert.match(validateRig(bk, { root: GROW, exists }).reason, /seats\.main\.close는 fresh 자리에만/);
  const { b, ws, stop } = await board({ def: permDef() });
  try {
    const chk = await b.branch.rigAdmin.run(ws.key, 'check');
    assert.deepEqual(chk.summary.closes, [{ seat: 'worker', close: 'run' }]);
    assert.equal(b.rig.status(ws.key).seats.find((x) => x.name === 'worker').close, 'run');
  } finally { await stop(); }
});

// 회 하나: main(keep, 주인)과 그 회가 띄운 fresh 자리 세션 worker-1(rig_case_items)
async function runWith(def) {
  const B = await board({ def });
  const { b, ws, add, F, seat } = B;
  const main = add('main'); seat(main, 'main');
  const w = add('worker-1'); seat(w, 'worker');
  const c = F().newCase(ws.key, main, 'human', { loop: def.loops ? 'work' : null, name: '회' });
  b.store.insertCaseItem({ caseId: c.id, sessionId: w.sessionId, seat: 'worker' });
  return { ...B, main, w, c };
}

test('P225 자리 close run: 회 도중에는 닫지 않고, 회가 닫히면 그 회가 띄운 fresh 세션을 닫는다(일하는 중이면 턴이 끝난 뒤). keep 자리는 남는다. 장부 cleanup run', async () => {
  const { b, ws, F, main, w, c, stop } = await runWith(permDef());
  try {
    await F().sweepRunClose();
    assert.deepEqual(b.killed, [], '회 도중에는 닫지 않는다');
    applyTermStatus(w.rt, 'working');
    F().closeDone(b.store.getCase(c.id));
    await tick(30);
    assert.deepEqual(b.killed, [], '일하는 중이면 기다린다');
    assert.ok(F().runClose.has(w.sessionId));
    applyTermStatus(w.rt, 'idle'); b.broadcastSession(w);
    await until(() => b.killed.length === 1);
    assert.deepEqual(b.killed, [w.sessionId]);
    assert.ok(b.sessions.has(main.sessionId), 'keep 자리(주인)는 남는다');
    const cl = ledger(b, ws.key, { kinds: ['cleanup'] });
    assert.deepEqual([cl.at(-1).value, cl.at(-1).caseId, cl.at(-1).seat, cl.at(-1).actor], ['run', c.id, 'worker', 'board']);
    assert.match(cl.at(-1).text, /닫음\(close run: 회가 끝남\. 대화 기록은 남음\)/);
    assert.equal(F().runClose.size, 0);
  } finally { await stop(); }
});

test('P225 자리 close never와 v1 정의는 회가 닫혀도 세션을 닫지 않는다. 다른 회의 주인이 된 세션은 남긴다', async () => {
  const n = permDef(); n.seats.worker.close = 'never';
  const A = await runWith(n);
  try {
    A.F().closeDone(A.b.store.getCase(A.c.id));
    await tick(50); await A.F().sweepRunClose();
    assert.deepEqual(A.b.killed, []);
  } finally { await A.stop(); }
  const v1 = { results: ['ok', 'failed'], seats: { main: { launcher: 'claude', session: 'keep' }, worker: { launcher: 'claude', session: 'fresh' } }, flow: [{ from: 'main', on: 'assign', to: 'worker' }], manager: 'main' };
  const B1 = await runWith(v1);
  try {
    B1.F().closeDone(B1.b.store.getCase(B1.c.id));
    await tick(50); await B1.F().sweepRunClose();
    assert.deepEqual(B1.b.killed, [], 'v1은 지금 그대로');
  } finally { await B1.stop(); }
  const C = await runWith(permDef());
  try {
    C.F().newCase(C.ws.key, C.w, 'agent', { loop: 'work', name: '다른 회' }); // worker-1이 다른 회의 주인
    C.F().closeDone(C.b.store.getCase(C.c.id));
    await tick(50); await C.F().sweepRunClose();
    assert.deepEqual(C.b.killed, []);
    assert.match(ledger(C.b, C.ws.key, { kinds: ['cleanup'] }).at(-1).text, /남김\(close run, 다른 회의 주인\)/);
  } finally { await C.stop(); }
});

