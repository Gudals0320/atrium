// P189 단위 시험: rig 6단계 종류별 증폭(docs research harness-arch.md 15절 "6단계").
// 쓰기 범위 → Claude 설정 deny·Codex 인자, 보호 파일 → deny, pre-tool 기다려 답하기는 그 세션만(다른 세션은 먼저 200),
// deny 응답 모양, 시간 초과·실패는 통과(onFail block이면 막음), stopVerify는 시도마다 한 번, 증폭 칸 없는 정의는 그대로.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import { Store } from '../src/store.mjs';
import { workspaceOf } from '../src/git.mjs';
import { Rig, validateRig } from '../src/rig.mjs';
import { writeSessionSettings } from '../src/launch.mjs';
import { Backend } from '../src/backend.mjs';
import { RigAmp, validateAmp, claudeSettingsAmp, applySettingsAmp, codexArgsAmp, writesVerdict, rulePath, seatAmpOf, denyBody, SEAT_SPAWN, STOP_TIMEOUT_SEC } from '../src/rig-amp.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE = path.join(HERE, 'fixtures', 'rig-amp-sample');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p189-'));
const sampleDef = () => JSON.parse(fs.readFileSync(path.join(SAMPLE, '.atrium', 'rig.json'), 'utf8'));
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

function writeRig(root, def, extraHooks = {}) {
  fs.cpSync(path.join(SAMPLE, '.atrium'), path.join(root, '.atrium'), { recursive: true });
  for (const [n, text] of Object.entries(extraHooks)) fs.writeFileSync(path.join(root, '.atrium', 'hooks', n), text);
  const f = path.join(root, '.atrium', 'rig.json');
  fs.writeFileSync(f, JSON.stringify(def, null, 2));
  const t = new Date(Date.now() + Math.floor(Math.random() * 100000)); fs.utimesSync(f, t, t);
}

// 가짜 판: 진짜 저장소·Rig·RigAmp
async function board({ def = sampleDef(), enable = true, extraHooks = {}, protectedFiles = null } = {}) {
  const dir = tmp();
  if (def) writeRig(dir, def, extraHooks);
  const store = new Store(path.join(dir, 'board.db'));
  const ws = await workspaceOf(dir);
  if (!store.getWorkspace(ws.key)) store.insertWorkspace({ ...ws, createdAt: 1 });
  if (enable) store.setRigEnabled(ws.key, true);
  if (protectedFiles) { store.setRigProtected(ws.key, { pointers: [], files: protectedFiles.map((p) => ({ path: p, sha256: 'x', at: 1 })) }); } // P188: 사람만 고치는 목록
  const b = { cfg: { hookTimeoutSec: 2, sessionsDir: path.join(dir, 'sessions') }, store, sessions: new Map(), log: () => {} };
  b.rig = new Rig(b);
  b.rigAmp = new RigAmp(b);
  let n = 0;
  const add = (name, { seat = null, kind = 'claude', cwd = dir } = {}) => {
    const s = { sessionId: `sid-${name}-${++n}`, name, kind, cwd, workspaceKey: ws.key, rigSeat: seat, hookToken: `tok-${name}`, rt: { cwd } };
    b.sessions.set(s.sessionId, s);
    return s;
  };
  const openTry = (s) => { const unitId = `u${++n}`; store.insertUnit({ id: unitId, from: 'boss', to: s.sessionId, origin: 'agent', spec: 'do it', createdAt: Date.now() }); const id = `t${++n}`; store.insertTry({ id, unitId, sessionId: s.sessionId, startedAt: Date.now() }); return { id, unitId }; };
  return { dir, store, ws, b, add, openTry };
}

// ---------- 정의 검사 ----------
test('정의 검사: writes·pre-tool·stopVerify를 받고, 잘못된 값은 까닭과 함께 거절한다. 증폭 칸이 없으면 amp는 null', () => {
  const root = SAMPLE;
  const v = validateRig(sampleDef(), { root });
  assert.equal(v.ok, true, v.reason);
  assert.equal(v.def.amp.stopVerify, true);
  assert.deepEqual(v.def.amp.seats.ro, { writes: false, stopVerify: null });
  assert.deepEqual(v.def.amp.seats.scoped.writes, ['items/{item}/']);
  assert.deepEqual(v.def.amp.preTool, [{ index: 0, match: 'Bash', seats: ['main', 'gated'] }]);
  assert.equal(seatAmpOf(v.def, 'main').stopVerify, false, '자리의 stopVerify가 정의 전체 값을 이긴다');
  assert.equal(seatAmpOf(v.def, 'gated').stopVerify, true);
  assert.equal(seatAmpOf(v.def, 'ro').preTool.length, 0, 'seat 칸 밖의 자리에는 pre-tool 훅이 없다');
  assert.equal(seatAmpOf(v.def, 'gated').preTool[0].hook.run[1], '.atrium/hooks/pre-gate.mjs');

  const bad = (patch, re) => { const d = { ...sampleDef(), ...patch(sampleDef()) }; const r = validateRig(d, { root }); assert.equal(r.ok, false, JSON.stringify(patch(sampleDef()))); assert.match(r.reason, re); };
  bad((d) => ({ seats: { ...d.seats, ro: { ...d.seats.ro, writes: 'all' } } }), /writes는 false 또는 경로 배열/);
  bad((d) => ({ seats: { ...d.seats, ro: { ...d.seats.ro, writes: ['../up'] } } }), /상대 경로/);
  bad((d) => ({ seats: { ...d.seats, ro: { ...d.seats.ro, writes: ['C:/abs'] } } }), /상대 경로/);
  bad(() => ({ stopVerify: 'yes' }), /stopVerify는 true 또는 false/);
  bad((d) => ({ hooks: [{ ...d.hooks[0], match: '(' }] }), /정규식이 아니다/);
  bad((d) => ({ hooks: [{ ...d.hooks[0], seat: 'nobody' }] }), /없는 자리/);
  bad(() => ({ hooks: [{ at: 'done', match: 'Bash', run: ['node', '.atrium/hooks/pre-gate.mjs'] }] }), /pre-tool 훅에만/);
  // 자리 없는 정의의 pre-tool·stopVerify
  const noSeats = { hooks: [{ at: 'pre-tool', run: ['node', '.atrium/hooks/pre-gate.mjs'] }] };
  assert.match(validateRig(noSeats, { root }).reason, /seats\(자리\)와 함께/);
  assert.match(validateRig({ stopVerify: true }, { root }).reason, /seats\(자리\)와 함께/);
  // 증폭 칸이 없는 정의: amp null(그대로)
  const plain = sampleDef(); delete plain.stopVerify; plain.hooks = []; for (const s of Object.values(plain.seats)) { delete s.writes; delete s.stopVerify; }
  const p = validateRig(plain, { root });
  assert.equal(p.ok, true); assert.equal(p.def.amp, null);
  assert.deepEqual(validateAmp({}, { seats: null }), { ok: true, amp: null });
});

// ---------- Claude Code 설정 파일 ----------
test('쓰기 범위 false → 설정 파일 permissions.deny에 Edit(//**). 보호 파일 → Edit(//경로)(Write(경로)는 Claude Code가 never matches로 본다). 증폭이 없으면 설정 파일은 지금과 같다', () => {
  const dir = tmp();
  const root = path.join(dir, 'repo');
  const ro = claudeSettingsAmp({ writes: false, stopVerify: false, preTool: [], protectedFiles: ['tools/judge.py'], root, cwd: root });
  assert.deepEqual(ro.deny.slice(0, 1), ['Edit(//**)']);
  const r = rulePath(path.join(root, 'tools', 'judge.py'));
  assert.ok(r.startsWith('//'), r);
  if (process.platform === 'win32') assert.match(r, /^\/\/[a-z]\//, '드라이브 글자는 /c/ 꼴(문서: Windows는 POSIX 꼴로 맞춘다)');
  assert.ok(ro.deny.includes(`Edit(${r})`) && !ro.deny.some((x) => x.startsWith('Write(')));
  // 워크트리 세션은 그 워크트리 안의 같은 파일도 막는다
  const wt = path.join(root, '.claude', 'worktrees', 'w1');
  const inWt = claudeSettingsAmp({ writes: null, stopVerify: false, preTool: [], protectedFiles: ['a.txt'], root, cwd: path.join(wt, 'sub') });
  assert.deepEqual(inWt.deny, [`Edit(${rulePath(path.join(root, 'a.txt'))})`, `Edit(${rulePath(path.join(wt, 'a.txt'))})`]);
  assert.deepEqual(inWt.hooks, {}, 'deny만 있으면 hook 시간은 그대로');
  assert.equal(claudeSettingsAmp({ writes: null, stopVerify: false, preTool: [], protectedFiles: [], root, cwd: root }), null);

  const base = { hookUrl: 'http://127.0.0.1:1/hooks/claude', token: 't', sessionId: 's', allow: ['Bash(atrium prompt:*)'] };
  const f0 = writeSessionSettings({ file: path.join(dir, 'a.json'), ...base });
  const f1 = writeSessionSettings({ file: path.join(dir, 'b.json'), ...base, amp: null });
  assert.equal(fs.readFileSync(f0, 'utf8'), fs.readFileSync(f1, 'utf8'), 'amp가 없으면 같은 파일');
  const j0 = JSON.parse(fs.readFileSync(f0, 'utf8'));
  assert.equal(j0.permissions.deny, undefined);
  const f2 = writeSessionSettings({ file: path.join(dir, 'c.json'), ...base, amp: ro });
  const j2 = JSON.parse(fs.readFileSync(f2, 'utf8'));
  assert.deepEqual(j2.permissions.allow, base.allow);
  assert.deepEqual(j2.permissions.deny, ro.deny);
  assert.equal(j2.hooks.PreToolUse[0].hooks[0].timeout, 2);
});

test('pre-tool 훅·쓰기 경로 목록 → PreToolUse hook 시간을 늘리고(훅 시간 + 여유), onFail block 훅이면 onFailure block. stopVerify → Stop 시간. 설정 파일을 다시 맞추면 원래대로', () => {
  const dir = tmp();
  const hook = (ms, onFail = 'pass') => ({ index: 0, match: null, seats: null, hook: { index: 0, timeoutMs: ms, onFail } });
  const a = claudeSettingsAmp({ writes: null, stopVerify: true, preTool: [hook(10000)], protectedFiles: [], root: dir, cwd: dir });
  assert.deepEqual(a.hooks, { PreToolUse: { timeout: 15 }, Stop: { timeout: STOP_TIMEOUT_SEC } });
  const b = claudeSettingsAmp({ writes: null, stopVerify: false, preTool: [hook(60000, 'block')], protectedFiles: [], root: dir, cwd: dir });
  assert.deepEqual(b.hooks, { PreToolUse: { timeout: 65, onFailure: 'block' } });
  const c = claudeSettingsAmp({ writes: ['x/'], stopVerify: false, preTool: [], protectedFiles: [], root: dir, cwd: dir });
  assert.deepEqual(c, { deny: [], hooks: { PreToolUse: { timeout: 10 } } });
  const f = writeSessionSettings({ file: path.join(dir, 's.json'), hookUrl: 'http://127.0.0.1:1/hooks/claude', token: 't', sessionId: 's', amp: { ...b, deny: ['Edit(//**)'] } });
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  assert.deepEqual({ t: j.hooks.PreToolUse[0].hooks[0].timeout, f: j.hooks.PreToolUse[0].hooks[0].onFailure }, { t: 65, f: 'block' });
  assert.equal(j.hooks.Stop[0].hooks[0].timeout, 2);
  assert.equal(j.hooks.PostToolUse[0].hooks[0].onFailure, undefined);
  // 자리를 떼면(증폭 없음) 판이 만든 그대로
  assert.equal(applySettingsAmp(j, null, 2), true);
  assert.equal(j.permissions, undefined);
  assert.equal(j.hooks.PreToolUse[0].hooks[0].timeout, 2); assert.equal(j.hooks.PreToolUse[0].hooks[0].onFailure, undefined);
  assert.equal(applySettingsAmp(j, null, 2), false, '같으면 바꾸지 않는다');
});

// ---------- Codex 인자 ----------
test('Codex: writes false → 샌드박스·승인 우회 인자를 걷고 --sandbox read-only(우회였으면 --ask-for-approval never). 그 밖은 그대로', () => {
  assert.deepEqual(codexArgsAmp([], false), ['--sandbox', 'read-only']);
  assert.deepEqual(codexArgsAmp(['--dangerously-bypass-approvals-and-sandbox'], false), ['--ask-for-approval', 'never', '--sandbox', 'read-only']);
  assert.deepEqual(codexArgsAmp(['--sandbox', 'workspace-write', '--ask-for-approval', 'on-request'], false), ['--ask-for-approval', 'on-request', '--sandbox', 'read-only']);
  assert.deepEqual(codexArgsAmp(['-s', 'danger-full-access', '-c', 'sandbox_mode=workspace-write', '--sandbox=workspace-write', '-m', 'x'], false), ['-m', 'x', '--sandbox', 'read-only']);
  assert.deepEqual(codexArgsAmp(['--yolo', '-a', 'untrusted'], false), ['-a', 'untrusted', '--sandbox', 'read-only']);
  assert.deepEqual(codexArgsAmp(['--full-auto'], false), ['--sandbox', 'read-only']);
  for (const w of [null, ['items/']]) assert.deepEqual(codexArgsAmp(['--dangerously-bypass-approvals-and-sandbox'], w), ['--dangerously-bypass-approvals-and-sandbox'], '경로 목록은 Codex가 좁히지 못해 그대로');
});

test('RigAmp: 자리 세션만 증폭한다(자리 없는 세션·꺼진 rig·증폭 칸 없는 자리는 그대로). Codex 자리는 인자, Claude 자리는 설정 파일', async () => {
  const B = await board({ protectedFiles: ['secret/keep.txt'] });
  const ro = B.add('ro-1', { seat: 'ro' });
  const cx = B.add('rocx-1', { seat: 'rocx', kind: 'codex' });
  const plain = B.add('loose');
  const gated = B.add('gated-1', { seat: 'gated' });
  assert.deepEqual(B.b.rigAmp.claudeAmp(ro).deny.slice(0, 1), ['Edit(//**)']);
  assert.ok(B.b.rigAmp.claudeAmp(ro).deny.some((r) => r.startsWith('Edit(') && r.endsWith('/secret/keep.txt)')), '보호 파일(rigProtected)');
  assert.ok(B.b.rigAmp.claudeAmp(gated).deny.every((r) => r.includes('secret/keep.txt')), '쓰기 제한 없는 자리도 보호 파일은 막는다');
  assert.equal(B.b.rigAmp.claudeAmp(plain), null);
  assert.equal(B.b.rigAmp.claudeAmp(cx), null, 'Codex는 설정 파일이 없다');
  assert.deepEqual(B.b.rigAmp.launcherArgs(cx, ['--dangerously-bypass-approvals-and-sandbox']), ['--ask-for-approval', 'never', '--sandbox', 'read-only']);
  assert.deepEqual(B.b.rigAmp.launcherArgs(plain, ['-m', 'x']), ['-m', 'x']);
  assert.equal(B.b.rigAmp.wants(plain, 'PreToolUse'), false);
  assert.equal(B.b.rigAmp.wants(ro, 'PreToolUse'), false, 'writes false는 설정 파일 deny로 막고 기다리지 않는다');
  assert.equal(B.b.rigAmp.wants(gated, 'PreToolUse'), true);
  assert.equal(B.b.rigAmp.wants(gated, 'Stop'), true);
  assert.equal(B.b.rigAmp.wants(gated, 'PostToolUse'), false);
  // rig를 끄면 아무것도 없다
  B.store.setRigEnabled(B.ws.key, false);
  assert.equal(B.b.rigAmp.claudeAmp(ro), null);
  assert.equal(B.b.rigAmp.wants(gated, 'PreToolUse'), false);
  assert.deepEqual(B.b.rigAmp.launcherArgs(cx, ['--dangerously-bypass-approvals-and-sandbox']), ['--dangerously-bypass-approvals-and-sandbox']);
  // 증폭 칸이 없는 정의
  const def = sampleDef(); delete def.stopVerify; def.hooks = []; delete def.seats.ro.writes; delete def.seats.rocx.writes; delete def.seats.scoped.writes;
  const C = await board({ def });
  const g2 = C.add('g', { seat: 'gated' }); const r2 = C.add('r', { seat: 'ro' });
  assert.equal(C.b.rigAmp.claudeAmp(r2), null);
  assert.equal(C.b.rigAmp.wants(g2, 'PreToolUse'), false); assert.equal(C.b.rigAmp.wants(g2, 'Stop'), false);
});

test('RigAmp.syncSettings: 자리를 정한 뒤 설정 파일에 증폭을 넣고, 떼면 뺀다(바뀔 때만 쓴다)', async () => {
  const B = await board();
  const s = B.add('later');
  s.settingsPath = writeSessionSettings({ file: path.join(B.dir, 'sessions', 'later.json'), hookUrl: 'http://127.0.0.1:1/hooks/claude', token: 't', sessionId: s.sessionId });
  const before = fs.readFileSync(s.settingsPath, 'utf8');
  assert.equal(B.b.rigAmp.syncSettings(s), false);
  s.rigSeat = 'ro';
  assert.equal(B.b.rigAmp.syncSettings(s), true);
  assert.deepEqual(JSON.parse(fs.readFileSync(s.settingsPath, 'utf8')).permissions.deny, ['Edit(//**)']);
  assert.equal(B.b.rigAmp.syncSettings(s), false, '같은 증폭이면 다시 쓰지 않는다');
  s.rigSeat = null;
  assert.equal(B.b.rigAmp.syncSettings(s), true);
  assert.equal(fs.readFileSync(s.settingsPath, 'utf8'), before);
});

// ---------- PreToolUse ----------
test('pre-tool: 훅이 거절하면 permissionDecision deny와 까닭, 통과면 빈 답. match 밖의 도구는 훅을 돌리지 않는다', async () => {
  const B = await board();
  const g = B.add('gated-1', { seat: 'gated' });
  B.openTry(g);
  const deny = await B.b.rigAmp.answer(g, 'PreToolUse', { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'echo forbidden' } });
  assert.deepEqual(Object.keys(deny), ['hookSpecificOutput']);
  assert.equal(deny.hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.equal(deny.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(deny.hookSpecificOutput.permissionDecisionReason, /forbidden are not allowed/);
  assert.equal(await B.b.rigAmp.answer(g, 'PreToolUse', { tool_name: 'Bash', tool_input: { command: 'echo fine' } }), null);
  const runs0 = B.store.db.prepare("SELECT COUNT(*) AS n FROM rig_hook_runs WHERE at = 'pre-tool'").get().n;
  assert.equal(runs0, 2, '훅 실행은 기록된다(rig_hook_runs)');
  assert.equal(await B.b.rigAmp.answer(g, 'PreToolUse', { tool_name: 'Read', tool_input: { file_path: 'x' } }), null);
  assert.equal(B.store.db.prepare("SELECT COUNT(*) AS n FROM rig_hook_runs WHERE at = 'pre-tool'").get().n, 2, 'match 밖(Read)은 돌지 않는다');
  assert.deepEqual(denyBody('r'), { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: 'r' } });
});

test('pre-tool: 훅의 시간 초과·실패는 통과, onFail block이면 deny', async () => {
  const hooks = { 'slow.mjs': 'setTimeout(() => process.stdout.write("{}"), 5000);\n', 'boom.mjs': 'process.exit(3);\n' };
  const def = sampleDef();
  def.hooks = [{ at: 'pre-tool', match: 'Bash', seat: 'gated', run: ['node', '.atrium/hooks/slow.mjs'], timeoutMs: 200 }, { at: 'pre-tool', match: 'Bash', seat: 'gated', run: ['node', '.atrium/hooks/boom.mjs'] }];
  const B = await board({ def, extraHooks: hooks });
  const g = B.add('gated-1', { seat: 'gated' });
  assert.equal(await B.b.rigAmp.answer(g, 'PreToolUse', { tool_name: 'Bash', tool_input: { command: 'ls' } }), null);
  const rows = B.store.db.prepare("SELECT decision FROM rig_hook_runs WHERE at = 'pre-tool' ORDER BY id").all().map((r) => r.decision);
  assert.deepEqual(rows, ['failed', 'failed']);
  def.hooks[1].onFail = 'block';
  const C = await board({ def, extraHooks: hooks });
  const g2 = C.add('gated-1', { seat: 'gated' });
  const out = await C.b.rigAmp.answer(g2, 'PreToolUse', { tool_name: 'Bash', tool_input: { command: 'ls' } });
  assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /실패했다/);
  assert.equal(C.b.rigAmp.claudeAmp(g2).hooks.PreToolUse.onFailure, 'block', '판이 답하지 못해도 막는다(Claude Code onFailure)');
});

test('쓰기 경로 목록: 범위 밖 Write·Edit은 deny, 안({item}은 지금 일 ID)은 통과, 쓰기 도구가 아니면 보지 않는다', async () => {
  const B = await board();
  const s = B.add('scoped-1', { seat: 'scoped' });
  const { unitId } = B.openTry(s);
  assert.equal(B.b.rigAmp.wants(s, 'PreToolUse'), true);
  const out = await B.b.rigAmp.answer(s, 'PreToolUse', { tool_name: 'Write', tool_input: { file_path: path.join(B.dir, 'src', 'a.js') } });
  assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /쓰기 범위 밖/);
  assert.equal(await B.b.rigAmp.answer(s, 'PreToolUse', { tool_name: 'Edit', tool_input: { file_path: path.join(B.dir, 'items', unitId, 'notes.md') } }), null);
  assert.equal(await B.b.rigAmp.answer(s, 'PreToolUse', { tool_name: 'Bash', tool_input: { command: 'echo x > y' } }), null);
  assert.equal(writesVerdict({ writes: ['items/{item}/'], toolName: 'Write', toolInput: { file_path: 'items/x.md' }, base: B.dir, unitId: null }) != null, true, '일이 없으면 {item} 경로는 아무것도 열지 않는다');
});

// ---------- Stop ----------
test('stopVerify: 열린 시도를 쥔 자리 세션의 턴 끝을 시도마다 한 번만 막는다(stop_hook_active, 판의 셈, 판이 다시 떠도)', async () => {
  const B = await board();
  const g = B.add('gated-1', { seat: 'gated' });
  assert.equal(await B.b.rigAmp.answer(g, 'Stop', { stop_hook_active: false }), null, '열린 시도가 없으면 막지 않는다');
  const t1 = B.openTry(g);
  // stop_hook_active가 참이면 판의 셈과 상관없이 막지 않는다
  assert.equal(await B.b.rigAmp.answer(g, 'Stop', { stop_hook_active: true }), null);
  const out = await B.b.rigAmp.answer(g, 'Stop', { stop_hook_active: false });
  assert.deepEqual(Object.keys(out).sort(), ['decision', 'reason']);
  assert.equal(out.decision, 'block');
  assert.match(out.reason, /atrium done ok\|failed/);
  // 같은 시도의 다음 턴 끝(새 턴이라 stop_hook_active false)은 판의 셈으로 막지 않는다 → 0단계 멈춤 알림이 상위에게 간다
  assert.equal(await B.b.rigAmp.answer(g, 'Stop', { stop_hook_active: false }), null);
  // 판이 다시 떠도(새 RigAmp) 기록에서 센다
  const again = new RigAmp(B.b);
  assert.equal(await again.answer(g, 'Stop', { stop_hook_active: false }), null);
  // 새 시도는 다시 한 번
  B.store.updateTry(t1.id, { endedAt: Date.now(), result: 'ok' });
  B.openTry(g);
  assert.equal((await again.answer(g, 'Stop', { stop_hook_active: false })).decision, 'block');
  // stopVerify가 꺼진 자리(main)는 기다리지도 막지도 않는다
  const m = B.add('main', { seat: 'main' }); B.openTry(m);
  assert.equal(B.b.rigAmp.wants(m, 'Stop'), false);
});

// ---------- hook 수신기 ----------
function fakeReqRes(headers, body) {
  const req = new EventEmitter(); req.headers = headers;
  const res = { status: null, body: null, at: null, writableEnded: false, destroyed: false, headers: null,
    writeHead(c, h) { this.status = c; this.headers = h || null; this.at = this.at || Date.now(); },
    end(b) { this.body = b == null ? '' : String(b); this.writableEnded = true; this.endedAt = Date.now(); } };
  const send = () => { req.emit('data', Buffer.from(JSON.stringify(body))); req.emit('end'); };
  return { req, res, send };
}
function receiver(B) {
  const seen = [];
  const self = { rigAmp: B.b.rigAmp, sessions: B.b.sessions, log: () => {}, processHook: (h, raw) => seen.push(JSON.parse(raw).hook_event_name) };
  for (const k of ['onHook', 'ampTarget', 'answerHook']) self[k] = Backend.prototype[k].bind(self);
  return { self, seen };
}
test('hook 수신기: 증폭 자리 세션의 PreToolUse·Stop만 판단 뒤 답하고, 다른 세션·다른 이벤트·인증이 틀린 것은 먼저 빈 200', async () => {
  const B = await board();
  const g = B.add('gated-1', { seat: 'gated' }); B.openTry(g);
  const plain = B.add('loose'); B.openTry(plain);
  const { self, seen } = receiver(B);
  const hit = (s, body, token = s.hookToken) => { const x = fakeReqRes({ authorization: `Bearer ${token}`, 'x-mt-session': s.sessionId }, body); self.onHook(x.req, x.res); x.send(); return x.res; };

  // 다른 세션: end에서 바로 빈 200
  const r1 = hit(plain, { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'echo forbidden' } });
  assert.equal(r1.status, 200); assert.equal(r1.body, ''); assert.equal(r1.writableEnded, true, '같은 차례에 끝났다');
  // 같은 자리 세션의 다른 이벤트도 먼저 200
  const r2 = hit(g, { hook_event_name: 'PostToolUse', tool_name: 'Bash' });
  assert.equal(r2.writableEnded, true); assert.equal(r2.body, '');
  // 인증이 틀리면 기다리지 않는다
  const r3 = hit(g, { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'echo forbidden' } }, 'wrong');
  assert.equal(r3.writableEnded, true); assert.equal(r3.body, '');
  // 자리 세션의 PreToolUse: 아직 답하지 않았다 → 훅이 끝난 뒤 deny
  const r4 = hit(g, { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'echo forbidden' } });
  assert.equal(r4.writableEnded, false, '판단 전에는 답하지 않는다');
  const t0 = Date.now(); while (!r4.writableEnded && Date.now() - t0 < 10000) await tick(10);
  assert.equal(r4.status, 200); assert.equal(r4.headers['content-type'], 'application/json');
  assert.equal(JSON.parse(r4.body).hookSpecificOutput.permissionDecision, 'deny');
  // 통과면 빈 200
  const r5 = hit(g, { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'echo ok' } });
  const t1 = Date.now(); while (!r5.writableEnded && Date.now() - t1 < 10000) await tick(10);
  assert.equal(r5.body, '');
  // Stop: 한 번 막고 다음은 빈 200
  const r6 = hit(g, { hook_event_name: 'Stop', stop_hook_active: false });
  while (!r6.writableEnded) await tick(5);
  assert.equal(JSON.parse(r6.body).decision, 'block');
  const r7 = hit(g, { hook_event_name: 'Stop', stop_hook_active: false });
  while (!r7.writableEnded) await tick(5);
  assert.equal(r7.body, '');
  await tick(20);
  assert.deepEqual(seen, ['PreToolUse', 'PostToolUse', 'PreToolUse', 'PreToolUse', 'PreToolUse', 'Stop', 'Stop'], '모든 hook은 지금처럼 처리된다');
});

test('자리를 위해 띄우는 표시(SEAT_SPAWN)는 Symbol이라 JSON 본문으로 넣지 못한다', () => {
  const o = JSON.parse(JSON.stringify({ name: 'x', [SEAT_SPAWN]: 'ro', 'Symbol(atrium.rigSeatSpawn)': 'ro' }));
  assert.equal(o[SEAT_SPAWN], undefined);
  const spread = { ...{ [SEAT_SPAWN]: 'ro' } };
  assert.equal(spread[SEAT_SPAWN], 'ro', '판 안의 펼치기로는 넘어간다(branch.spawnChild → backend.spawn)');
});
