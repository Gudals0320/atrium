// P226 단위 시험: rig 2 설계 11.10(P225에서 돌아온 것). scoped 자리 보안.
// Claude scoped = 기본 모드(manual) + writes마다 Edit 규칙 + allow + 판의 고정 거절(셸 안의 셸), 셸로 감싼 셸 허용 규칙은 정의 오류,
// 자리 deny 칸, Codex 좁은 writes 경고, unattended 안내 문구(창 시험은 app/test/p226-lib), 승인 해시에 런처 값, close run 대기 저장(다시 떠도 닫음).
// 가짜 판은 p225 틀 그대로
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
import { RigAmp, seatPermitHash, nestedShell, NESTED_SHELL_REASON, claudeSettingsAmp, validateAmp, scopedEditRules, SHELL_IN_SHELL_DENY, wrappedShellRule, CLAUDE_PERMISSION_MODE, codexWritesWarning, rulePath, EDIT_ALL } from '../src/rig-amp.mjs';
import { RigFlow } from '../src/rig-flow.mjs';
import { writeSessionSettings } from '../src/launch.mjs';
import { proposalsFor } from '../src/rig-proposals.mjs';
import { sectorsFor } from '../src/rig-sectors.mjs';
import { draftWarnings } from '../src/rig-admin.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FX = path.join(HERE, 'fixtures');
const GROW = path.join(FX, 'rig-loops-grow');
const CHECK = path.join(FX, 'rig-loops-check');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p226-'));
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
  const cfg = { profile: 'dev', terminalSession: 'atrium-dev-p226test', port: 0, dataDir: dir, sessionsDir: path.join(dir, 'sessions'), inputQuietMs: 3000, submitConfirmMs: 3000, deliveryMaxWaitMs: 60000, submitRetries: 0, rigCycles: false, ...cfgExtra };
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
const base = { stopVerify: false, preTool: [], protectedFiles: [], root: 'C:/r', cwd: 'C:/r', allow: [], deny: [] };

// ---------- 1. Claude scoped = 기본 모드 + 허용 규칙 ----------
test('P226 Claude scoped: 권한 모드 manual(acceptEdits 아님), writes마다 Edit(//절대 경로/**) 허용, 자리 allow, 판의 고정 거절(셸 안의 셸), 범위 밖은 PreToolUse', () => {
  assert.equal(CLAUDE_PERMISSION_MODE.scoped, 'manual');
  assert.equal(CLAUDE_PERMISSION_MODE.unattended, 'bypassPermissions');
  assert.deepEqual(SHELL_IN_SHELL_DENY, ['Bash(cmd:*)', 'Bash(cmd.exe:*)', 'Bash(powershell:*)', 'Bash(powershell.exe:*)', 'Bash(pwsh:*)', 'Bash(pwsh.exe:*)']);
  const sc = claudeSettingsAmp({ ...base, permission: 'scoped', writes: ['reports/', 'items/{item}/', 'docs/rules.md'], allow: ['PowerShell(Get-ChildItem:*)', 'Bash(git log:*)'], deny: ['Bash(git push:*)'] });
  assert.deepEqual(sc.allow, ['Edit(//c/r/reports/**)', 'Edit(//c/r/items/**)', 'Edit(//c/r/docs/rules.md)', 'PowerShell(Get-ChildItem:*)', 'Bash(git log:*)']);
  assert.deepEqual(sc.deny, [...SHELL_IN_SHELL_DENY, 'Bash(git push:*)']);
  assert.ok(sc.hooks.PreToolUse, '쓰기 범위 밖(일마다 좁힌 {item})은 PreToolUse가 묻는다');
  assert.ok(!sc.allow.some((r) => /^(Bash|PowerShell)\(\*?\)$|^(Bash|PowerShell)$/.test(r)), '셸 쓰기·지우기를 통째로 허용하지 않는다');
  // writes 없음 = 세션 폴더, false = 편집 허용 없음(모든 Edit 거절)
  assert.deepEqual(scopedEditRules({ ...base, writes: null }), ['Edit(//c/r/**)']);
  const no = claudeSettingsAmp({ ...base, permission: 'scoped', writes: false });
  assert.equal(no.allow, undefined);
  assert.ok(no.deny.includes(EDIT_ALL));
  assert.ok(no.deny.includes('Bash(powershell:*)'));
  // unattended: 허용 규칙 없음, 고정 거절은 있음, PreToolUse(셸 안의 셸)
  const un = claudeSettingsAmp({ ...base, permission: 'unattended', writes: ['out/'], allow: ['Bash(git log:*)'] });
  assert.equal(un.allow, undefined);
  assert.deepEqual(un.deny, SHELL_IN_SHELL_DENY);
  assert.ok(un.hooks.PreToolUse);
  // ask: 고정 거절 없음. 자리 deny는 ask에서도 쓴다
  assert.equal(claudeSettingsAmp({ ...base, permission: 'ask', writes: null }), null);
  assert.deepEqual(claudeSettingsAmp({ ...base, permission: 'ask', writes: null, deny: ['Bash(rm:*)'] }).deny, ['Bash(rm:*)']);
  // 세션 설정 파일: 판의 allow(atrium) + Edit 규칙 + allow, deny
  const dir = tmp();
  const f = writeSessionSettings({ file: path.join(dir, 's.json'), hookUrl: 'http://127.0.0.1:1/hook', token: 't', sessionId: 'x', allow: ['Bash(atrium:*)'], amp: sc });
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  assert.deepEqual(j.permissions.allow, ['Bash(atrium:*)', ...sc.allow]);
  assert.deepEqual(j.permissions.deny, sc.deny);
  assert.equal(j.defaultMode, undefined, '모드는 --permission-mode로만');
  // Windows 경로 → //c/… 꼴
  assert.equal(rulePath('D:\\a\\b'), '//d/a/b');
});

test('P226 판: scoped 자리는 manual로 띄우고 설정 파일에 Edit 규칙, unattended(승인)도 셸 안의 셸을 PreToolUse와 deny 규칙으로 거절', async () => {
  const { b, ws, add, seat, stop } = await board({ def: permDef(), enable: false });
  try {
    b.rig.setEnabled(ws.key, true, 'human');
    const A = b.rigAmp;
    const p = A.seatPermission(ws.key, 'main');
    assert.deepEqual([p.permission, p.claudeMode], ['scoped', 'manual']);
    const m = add('main'); seat(m, 'main');
    const am = A.claudeAmp(m);
    assert.equal(am.allow[0], `Edit(${rulePath(path.join(m.cwd, 'reports'))}/**)`);
    assert.ok(am.allow.includes('Bash(git log:*)'));
    assert.ok(SHELL_IN_SHELL_DENY.every((r) => am.deny.includes(r)));
    const w = add('worker-1'); seat(w, 'worker');
    assert.equal(A.seatPermission(ws.key, 'worker').permission, 'unattended');
    assert.equal(A.wants(w, 'PreToolUse'), true);
    assert.ok(SHELL_IN_SHELL_DENY.every((r) => A.claudeAmp(w).deny.includes(r)));
    const out = await A.answer(w, 'PreToolUse', { tool_name: 'Bash', tool_input: { command: 'pwsh -c "Remove-Item x"' } });
    assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
    assert.equal(await A.answer(w, 'PreToolUse', { tool_name: 'Bash', tool_input: { command: 'git status' } }), null);
    // 띄우는 길(backend.spawn)이 seatPerm.claudeMode를 쓴다
    const src = fs.readFileSync(path.join(HERE, '..', 'src', 'backend.mjs'), 'utf8');
    assert.match(src, /if \(claude && seatPerm && seatPerm\.claudeMode\) permissionMode = seatPerm\.claudeMode/);
  } finally { await stop(); }
});

// ---------- 2. 셸로 감싼 셸 허용 규칙, deny 칸 ----------
test('P226 정의: 셸로 감싼 PowerShell·cmd 허용 규칙은 오류, PowerShell(…) 규칙은 받는다. deny 칸(모양 검사, amp에 들어감, 해시에 들어감)', () => {
  const seats = { a: {} };
  const v = (x) => validateAmp({ seats: { a: { launcher: 'claude', ...x } } }, { seats });
  for (const r of ['Bash(powershell -Command Get-ChildItem:*)', 'Bash(powershell.exe -NoProfile -c ls:*)', 'Bash(cmd /c dir:*)', 'Bash(pwsh:*)', 'Bash(C:\\Windows\\System32\\cmd.exe /c dir:*)']) {
    const o = v({ permission: 'scoped', allow: [r] });
    assert.equal(o.ok, false, r);
    assert.match(o.reason, /셸로 감싼 (powershell|cmd|pwsh) 규칙/);
  }
  assert.equal(wrappedShellRule('Bash(git log:*)'), null);
  assert.equal(wrappedShellRule('PowerShell(Get-ChildItem:*)'), null);
  assert.equal(wrappedShellRule('Bash(echo cmd:*)'), null, '글 안의 낱말은 아니다');
  assert.ok(v({ permission: 'scoped', allow: ['PowerShell(Get-ChildItem:*)', 'Bash(git log:*)'] }).ok);
  // unattended·ask 자리의 allow도 같은 검사(정의 오류)
  assert.equal(v({ permission: 'unattended', allow: ['Bash(powershell -c x:*)'] }).ok, false);
  // deny 칸
  assert.match(v({ deny: 'Bash(rm:*)' }).reason, /deny는 Claude Code 권한 규칙 글의 배열/);
  assert.match(v({ deny: ['rm -rf'] }).reason, /deny의 규칙이 Claude Code 권한 규칙 꼴/);
  const ok = v({ permission: 'scoped', deny: ['PowerShell(Remove-Item:*)', 'Bash(git push:*)'] });
  assert.ok(ok.ok);
  assert.deepEqual(ok.amp.seats.a.deny, ['PowerShell(Remove-Item:*)', 'Bash(git push:*)']);
  assert.deepEqual(v({ deny: ['Bash(rm:*)'] }).amp.seats.a.deny, ['Bash(rm:*)'], 'ask 자리도 deny만 있으면 증폭 칸이 생긴다');
  const cx = validateAmp({ seats: { a: { launcher: 'codex', deny: ['Bash(rm:*)'] } } }, { seats });
  assert.ok(cx.warnings.some((w) => /seats\.a\.deny는 Claude Code 자리에서만/.test(w)));
  // 해시: deny가 바뀌면 바뀐다
  const d1 = { seats: { a: { launcher: 'claude' } }, amp: { seats: { a: { permission: 'unattended', writes: null, allow: [], deny: [] } } } };
  const d2 = clone(d1); d2.amp.seats.a.deny = ['Bash(rm:*)'];
  assert.notEqual(seatPermitHash(d1, 'a'), seatPermitHash(d2, 'a'));
});

// ---------- 3. Codex scoped ----------
test('P226 Codex scoped: 그대로 -s workspace-write, 좁은 writes면 rig check가 "작업 폴더 전체가 쓰기 범위" 경고(종류 이름 자리와 Codex 런처 자리). writes false·Claude 자리는 경고 없음', async () => {
  const d = permDef(); d.seats.cx = { launcher: 'codex', session: 'fresh', permission: 'scoped', writes: ['out/'] };
  d.seats.cr = { launcher: 'codex', session: 'fresh', permission: 'scoped', writes: false };
  d.loops.work.flow.push({ from: 'main', on: 'assign', to: 'cx' }, { from: 'main', on: 'assign', to: 'cr' });
  const v = validateRig(d, { root: GROW, exists });
  assert.ok(v.ok, v.reason);
  assert.ok(v.def.warnings.includes(codexWritesWarning('seats.cx')));
  assert.match(codexWritesWarning('seats.cx'), /Codex에서는 작업 폴더 전체가 쓰기 범위다/);
  assert.ok(!v.def.warnings.some((w) => /seats\.(cr|main|worker)\.writes: Codex/.test(w)));
  const d2 = clone(d); d2.seats.cx.launcher = 'my-codex';
  const { b, ws, add, seat, stop } = await board({ def: d2 });
  try {
    b.rigSetup.findLauncher = (n) => (n === 'my-codex' ? { name: 'my-codex', harness: 'codex' } : null);
    const chk = await b.branch.rigAdmin.run(ws.key, 'check');
    assert.ok(chk.ok, chk.reason);
    assert.ok(chk.warnings.some((w) => /^seats\.cx\.writes: Codex에서는 작업 폴더 전체가 쓰기 범위다.*\(런처 my-codex\)$/.test(w)), JSON.stringify(chk.warnings));
    // Codex 인자는 그대로
    const c = add('cr-1', { kind: 'codex' }); seat(c, 'cr');
    assert.deepEqual(b.rigAmp.launcherArgs(c, []), ['--sandbox', 'read-only', '--ask-for-approval', 'on-request']);
  } finally { await stop(); }
});

// ---------- 6. 승인 해시에 런처 ----------
test('P226 승인 해시: 런처 이름 자리는 런처가 푼 종류·모델·인자가 해시에 들어가 런처를 고치면 승인이 풀린다. 종류 이름 자리는 model', async () => {
  const d = permDef(); d.seats.worker.launcher = 'my-claude';
  const { b, ws, stop } = await board({ def: d, enable: false });
  try {
    let L = { id: 'L1', name: 'my-claude', harness: 'claude', model: 'haiku', effort: '', permissionMode: 'manual', args: '--foo', env: { A: 'x' } };
    b.rigSetup.findLauncher = (n) => (n === 'my-claude' || n === 'L1' ? L : null);
    const launch = b.rig.seatLaunchOf(b.rig.read(ws.key).def, 'worker');
    assert.deepEqual([launch.kind, launch.model, launch.args, launch.env], ['claude', 'haiku', ['--foo'], ['A']], '환경 변수는 이름만');
    await rigHandlers(b)['rig.enable']({ workspace: ws.key, confirm: true }, local);
    assert.equal(b.rig.permitted(ws.key, 'worker'), true);
    assert.equal(b.store.rigPermitRows(ws.key)[0].hash, b.rig.permitHash(b.rig.read(ws.key).def, 'worker'));
    // 런처의 인자를 고쳤다 → 승인이 풀린다(정의는 그대로)
    L = { ...L, args: '--dangerously-skip-permissions' };
    assert.equal(b.rig.permitted(ws.key, 'worker'), false);
    assert.equal(b.rigAmp.seatPermission(ws.key, 'worker').permission, 'scoped');
    b.rig.watchPermits(ws.key);
    assert.deepEqual(b.rig.permitNeeds().map((x) => x.seat), ['worker']);
    assert.equal(b.store.rigPermitRows(ws.key).length, 0, '풀린 승인은 지운다');
    // 모델을 고쳐도
    b.rig.permit(ws.key, ['worker'], 'human');
    assert.equal(b.rig.permitted(ws.key, 'worker'), true);
    L = { ...L, model: 'sonnet' };
    assert.equal(b.rig.permitted(ws.key, 'worker'), false);
    // 런처를 찾지 못함도 값이다(같은 값이면 그대로)
    b.rigSetup.findLauncher = () => null;
    assert.deepEqual(b.rig.seatLaunchOf(b.rig.read(ws.key).def, 'worker'), { launcher: 'my-claude', missing: true });
  } finally { await stop(); }
  // 종류 이름 자리: model
  const k1 = { seats: { a: { launcher: 'claude', model: 'haiku' } }, amp: { seats: { a: { permission: 'unattended' } } } };
  const k2 = clone(k1); k2.seats.a.model = 'opus';
  assert.notEqual(seatPermitHash(k1, 'a', { kind: 'claude', model: 'haiku' }), seatPermitHash(k2, 'a', { kind: 'claude', model: 'opus' }));
  assert.notEqual(seatPermitHash(k1, 'a', { kind: 'claude', args: [] }), seatPermitHash(k1, 'a', { kind: 'claude', args: ['--x'] }));
});

// ---------- 7. close run 대기 저장 ----------
test('P226 close run 대기: 회가 닫히면 표(rig_run_close)에 두고, 판이 다시 떠도(새 RigFlow) 읽어 턴이 끝난 세션을 닫고 표에서 지운다. 없는 세션의 줄은 지운다', async () => {
  const { b, ws, F, main, w, c, stop } = await runWith(permDef());
  try {
    applyTermStatus(w.rt, 'working');
    F().closeDone(b.store.getCase(c.id));
    await tick(30);
    assert.deepEqual(b.killed, []);
    assert.deepEqual(b.store.runCloseRows().map((r) => [r.sessionId, r.caseId, r.seat, r.key]), [[w.sessionId, c.id, 'worker', ws.key]]);
    b.store.addRunClose({ sessionId: 'gone-session', key: ws.key, caseId: c.id, seat: 'worker' });
    // 판이 다시 떴다: 메모리의 대기는 사라지고 표에서 읽는다
    F().runClose.clear();
    const f2 = new RigFlow(b, b.branch);
    assert.ok(f2.runClose.has(w.sessionId), '표에서 읽었다');
    assert.ok(f2.runClose.has('gone-session'));
    await f2.sweepRunClose();
    assert.deepEqual(b.killed, [], '일하는 중이면 기다린다');
    assert.deepEqual(b.store.runCloseRows().map((r) => r.sessionId), [w.sessionId], '없는 세션의 줄은 지웠다');
    applyTermStatus(w.rt, 'idle');
    await f2.sweepRunClose();
    assert.deepEqual(b.killed, [w.sessionId]);
    assert.ok(b.sessions.has(main.sessionId));
    assert.deepEqual(b.store.runCloseRows(), []);
    assert.equal(f2.runClose.size, 0);
    assert.match(ledger(b, ws.key, { kinds: ['cleanup'] }).at(-1).text, /닫음\(close run/);
  } finally { await stop(); }
});

test('P226 close run 대기: 판이 막 다시 떠 아직 붙지 않은 열린 세션은 첫 쓸기에서 기다리고, 닫힌 세션은 지운다', async () => {
  const { b, ws, F, w, c, stop } = await runWith(permDef());
  try {
    b.store.addRunClose({ sessionId: w.sessionId, key: ws.key, caseId: c.id, seat: 'worker' });
    const s = b.sessions.get(w.sessionId); b.sessions.delete(w.sessionId); // 아직 붙지 않음(기록상 열림)
    const f2 = new RigFlow(b, b.branch);
    await f2.sweepRunClose();
    assert.deepEqual(b.store.runCloseRows().map((r) => r.sessionId), [w.sessionId], '첫 쓸기는 기다린다');
    b.sessions.set(w.sessionId, s);
    await f2.sweepRunClose();
    assert.deepEqual(b.killed, [w.sessionId]);
    assert.deepEqual(b.store.runCloseRows(), []);
  } finally { await stop(); }
});
