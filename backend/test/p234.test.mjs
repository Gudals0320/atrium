// P234(rig2-design 11.16): rig 자리 설정 파일의 auto·bypass 끄기(1·2), 판이 연 회의 scoped 자리는 묻지 않고 거절(2, denyInsteadOfPrompting),
// 거절 → 장부 gate reject(PermissionDenied 훅, 2.1.328은 PermissionRequest), 받을 Yes가 없는 질문 → 판 로그와 gate blocked(3), 자리 머리 줄
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.mjs';
import { workspaceOf } from '../src/git.mjs';
import { Rig } from '../src/rig.mjs';
import { writeSessionSettings } from '../src/launch.mjs';
import { newRuntime, applyTermStatus } from '../src/state.mjs';
import { Backend } from '../src/backend.mjs';
import { RigAmp, claudeSettingsAmp, applySettingsAmp, seatRunOf, seatPermissionKeys, deniedTarget, PERMISSION_KEYS, NO_YES_WHY, SEAT_RUN } from '../src/rig-amp.mjs';
import { seatExtraLines, SCOPED_SHELL_LINE, DENY_SHELL_LINE, NO_MANAGER_LINE } from '../src/rig-flow.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p234-'));
const ALLOW = ['Bash(git status:*)'];
// 자리: checker(fresh, every 고리 check의 입구), reviewer(fresh, request 고리 work의 흐름 줄 받는 자리), main(keep, request 고리 입구),
//   watch(keep, every 고리 watch의 입구), dual(keep, request 고리 ask2와 every 고리 tick 둘의 입구), asker(keep, ask 권한, every 고리 poll의 입구), robot(keep, unattended, every 고리 sweep의 입구)
const DEF = () => ({
  version: 2, name: 'p234',
  seats: {
    main: { launcher: 'claude', session: 'keep', permission: 'scoped', allow: ALLOW },
    reviewer: { launcher: 'claude', session: 'fresh', permission: 'scoped', allow: ALLOW, writes: ['reports/'] },
    checker: { launcher: 'claude', session: 'fresh', permission: 'scoped', allow: ALLOW, writes: ['reports/'] },
    watch: { launcher: 'claude', session: 'keep', permission: 'scoped', allow: ALLOW },
    dual: { launcher: 'claude', session: 'keep', permission: 'scoped', allow: ALLOW },
    asker: { launcher: 'claude', session: 'keep' },
    robot: { launcher: 'claude', session: 'keep', permission: 'unattended', writes: ['out/'] },
  },
  loops: {
    work: { kind: 'work', trigger: { request: 'main' }, entry: 'main', flow: [{ from: 'main', on: 'assign', to: 'reviewer' }] },
    check: { kind: 'work', trigger: { every: '7d' }, entry: 'checker', task: 'check' },
    watch: { kind: 'work', trigger: { every: '7d' }, entry: 'watch', task: 'watch' },
    ask2: { kind: 'work', trigger: { request: 'dual' }, entry: 'dual' },
    tick: { kind: 'work', trigger: { every: '7d' }, entry: 'dual', task: 'tick' },
    poll: { kind: 'work', trigger: { every: '7d' }, entry: 'asker', task: 'poll' },
    sweep: { kind: 'work', trigger: { every: '7d' }, entry: 'robot', task: 'sweep' },
  },
});

async function board({ def = DEF() } = {}) {
  const dir = tmp();
  fs.mkdirSync(path.join(dir, '.atrium'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.atrium', 'rig.json'), JSON.stringify(def, null, 2));
  const store = new Store(path.join(dir, 'board.db'));
  const ws = await workspaceOf(dir);
  if (!store.getWorkspace(ws.key)) store.insertWorkspace({ ...ws, createdAt: 1 });
  store.setRigEnabled(ws.key, true);
  const logs = [];
  const b = { cfg: { hookTimeoutSec: 2, sessionsDir: path.join(dir, 'sessions') }, store, sessions: new Map(), log: (...a) => logs.push(a.join(' ')) };
  b.rig = new Rig(b);
  b.rigAmp = new RigAmp(b);
  let n = 0;
  const add = (name, { seat = null, kind = 'claude', run = null } = {}) => {
    const s = { sessionId: `sid-${name}-${++n}`, name, kind, cwd: dir, workspaceKey: ws.key, rigSeat: seat, hookToken: `tok-${name}`, rt: newRuntime({ kind, hooked: true }), ...(run ? { rigRun: run } : {}) };
    s.rt.cwd = dir;
    s.settingsPath = writeSessionSettings({ file: path.join(dir, 'sessions', `${s.sessionId}.json`), hookUrl: 'http://127.0.0.1:1/hooks/claude', token: s.hookToken, sessionId: s.sessionId, amp: b.rigAmp.claudeAmp(s) });
    b.sessions.set(s.sessionId, s);
    return s;
  };
  const openCase = (s, loop) => {
    const id = `c${++n}`;
    store.insertCase({ id, workspaceKey: ws.key, owner: s.sessionId, state: 'open', createdAt: Date.now(), versionN: null, loop });
    store.insertCaseItem({ caseId: id, sessionId: s.sessionId, seat: s.rigSeat, worktree: null, worktreePath: null });
    return id;
  };
  const settings = (s) => JSON.parse(fs.readFileSync(s.settingsPath, 'utf8')).permissions || {};
  const gates = () => store.rigEvents({ ws: ws.key, limit: 1000 }).filter((e) => e.kind === 'gate');
  return { dir, store, ws, b, add, openCase, settings, gates, logs };
}

// ---------- 1. 회의 계기 ----------
test('P234 seatRunOf: fresh 자리는 그 회의 고리 계기, keep 자리는 닿는 고리(모두 every면 묻지 않음, request가 섞이면 묻는다)', async () => {
  const { b, ws } = await board();
  const def = b.rig.active(ws.key).def;
  assert.deepEqual(seatRunOf(def, 'checker', { loop: 'check' }), { promptless: true, why: 'every', loops: ['check'] });
  assert.deepEqual(seatRunOf(def, 'reviewer', { loop: 'work' }), { promptless: false, why: 'request', loops: ['work'] });
  assert.equal(seatRunOf(def, 'checker').why, 'unknown', '회를 모르면 묻는다');
  assert.equal(seatRunOf(def, 'checker', { loop: 'nope' }).promptless, false);
  assert.deepEqual(seatRunOf(def, 'main'), { promptless: false, why: 'request', loops: ['work'] });
  assert.deepEqual(seatRunOf(def, 'watch'), { promptless: true, why: 'every', loops: ['watch'] });
  assert.deepEqual(seatRunOf(def, 'dual'), { promptless: false, why: 'mixed', loops: ['ask2', 'tick'] }, 'request와 every 둘의 입구: 묻는다');
  assert.equal(seatRunOf(def, 'nobody').why, 'unknown');
});

// ---------- 2. 설정 파일 칸 ----------
test('P234 설정 파일 permissions: 모든 rig 자리 disableAutoMode, scoped·ask는 disableBypassPermissionsMode, 판이 연 회의 scoped만 denyInsteadOfPrompting', () => {
  assert.deepEqual(seatPermissionKeys({ permission: 'scoped', promptless: true }), { disableAutoMode: 'disable', disableBypassPermissionsMode: 'disable', denyInsteadOfPrompting: true });
  assert.deepEqual(seatPermissionKeys({ permission: 'scoped', promptless: false }), { disableAutoMode: 'disable', disableBypassPermissionsMode: 'disable' });
  assert.deepEqual(seatPermissionKeys({ permission: 'ask', promptless: true }), { disableAutoMode: 'disable', disableBypassPermissionsMode: 'disable' }, 'ask 자리는 그대로 묻는다');
  assert.deepEqual(seatPermissionKeys({ permission: 'unattended', promptless: true }), { disableAutoMode: 'disable' }, 'unattended는 bypassPermissions로 돈다');
  const base = { writes: null, stopVerify: false, preTool: [], protectedFiles: [], root: 'C:/r', cwd: 'C:/r', allow: ALLOW };
  assert.equal(claudeSettingsAmp({ ...base, permission: 'scoped', promptless: true }).permissions.denyInsteadOfPrompting, true);
  assert.equal(claudeSettingsAmp({ ...base, permission: 'scoped' }).permissions.denyInsteadOfPrompting, undefined);
  // 설정 파일에 쓰고, 다시 맞추면 빠지거나 더해진다
  const dir = tmp();
  const amp = claudeSettingsAmp({ ...base, permission: 'scoped', promptless: true });
  const f = writeSessionSettings({ file: path.join(dir, 's.json'), hookUrl: 'http://127.0.0.1:1/hooks/claude', token: 't', sessionId: 's', allow: ['Bash(atrium done:*)'], amp });
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  assert.equal(j.permissions.disableAutoMode, 'disable'); assert.equal(j.permissions.disableBypassPermissionsMode, 'disable'); assert.equal(j.permissions.denyInsteadOfPrompting, true);
  assert.ok(j.permissions.allow.includes('Bash(git status:*)') && j.permissions.allow.includes('Bash(atrium done:*)'));
  assert.equal(applySettingsAmp(j, claudeSettingsAmp({ ...base, permission: 'scoped' }), 2, ['Bash(atrium done:*)']), true);
  assert.equal(j.permissions.denyInsteadOfPrompting, undefined, '판이 연 회가 아니면 뺀다');
  assert.equal(applySettingsAmp(j, null, 2, []), true);
  assert.equal(j.permissions, undefined, '자리를 떼면 판의 칸이 모두 빠진다');
  for (const k of PERMISSION_KEYS) assert.ok(['disableAutoMode', 'disableBypassPermissionsMode', 'denyInsteadOfPrompting'].includes(k));
});

test('P234 판의 자리 세션 설정 파일: scoped·ask·unattended × request·every × fresh·keep', async () => {
  const B = await board();
  const { add, settings, openCase, b } = B;
  // fresh: 띄울 때 받은 고리(SEAT_RUN → s.rigRun)
  const chk = add('checker-1', { seat: 'checker', run: { loop: 'check' } });
  assert.deepEqual(settings(chk), { ...settings(chk), disableAutoMode: 'disable', disableBypassPermissionsMode: 'disable', denyInsteadOfPrompting: true });
  const rev = add('reviewer-1', { seat: 'reviewer', run: { loop: 'work' } });
  assert.equal(settings(rev).denyInsteadOfPrompting, undefined, 'request 고리의 fresh 자리는 묻는다');
  assert.equal(settings(rev).disableAutoMode, 'disable');
  // fresh: rigRun이 없어도(판이 다시 뜸) 그 세션의 회(rig_case_items)로 안다
  const chk2 = add('checker-2', { seat: 'checker' });
  assert.equal(settings(chk2).denyInsteadOfPrompting, undefined, '회를 모르면 묻는다');
  openCase(chk2, 'check');
  assert.equal(b.rigAmp.syncSettings(chk2), true);
  assert.equal(settings(chk2).denyInsteadOfPrompting, true);
  // keep
  assert.equal(settings(add('main', { seat: 'main' })).denyInsteadOfPrompting, undefined, 'request 입구는 묻는다');
  assert.equal(settings(add('watch', { seat: 'watch' })).denyInsteadOfPrompting, true, 'every 고리만 닿는 keep 자리');
  assert.equal(settings(add('dual', { seat: 'dual' })).denyInsteadOfPrompting, undefined, 'request와 every 둘의 입구는 묻는다');
  const asker = settings(add('asker', { seat: 'asker' }));
  assert.deepEqual([asker.disableAutoMode, asker.disableBypassPermissionsMode, asker.denyInsteadOfPrompting], ['disable', 'disable', undefined], 'ask 자리는 every여도 묻는다');
  const robot = add('robot', { seat: 'robot' });
  assert.deepEqual([settings(robot).disableAutoMode, settings(robot).disableBypassPermissionsMode, settings(robot).denyInsteadOfPrompting], ['disable', 'disable', true], '승인 전 unattended는 scoped로 돈다');
  // 자리 없는 세션은 그대로
  assert.deepEqual(settings(add('loose')), {});
  assert.equal(typeof SEAT_RUN, 'symbol');
});

// ---------- 3. 머리 줄 ----------
test('P234 자리 머리 줄: 판이 연 회의 scoped 자리는 "묻지 않고 거절, 보고에 적기", 그 밖은 그대로', async () => {
  assert.equal(DENY_SHELL_LINE, '[Atrium 보드] Do not pipe shell commands or wrap them in another shell. Run git in the working folder without -C. Commands outside the allow list are refused without asking. Write what you could not run in your report. Read files with Read/Glob/Grep.');
  const { b, ws } = await board();
  const def = b.rig.active(ws.key).def;
  assert.deepEqual(seatExtraLines(def, 'checker', { promptless: true }), [DENY_SHELL_LINE, NO_MANAGER_LINE]);
  assert.deepEqual(seatExtraLines(def, 'checker'), [SCOPED_SHELL_LINE, NO_MANAGER_LINE]);
  assert.deepEqual(seatExtraLines(def, 'asker', { promptless: true }), [NO_MANAGER_LINE], 'ask 자리에는 셸 줄이 없다');
  assert.deepEqual(seatExtraLines(def, 'robot', { approved: true, promptless: true }), [NO_MANAGER_LINE]);
});

// ---------- 4. 거절 → 장부 gate reject ----------
test('P234 거절 기록: PermissionDenied 훅(tool_name, tool_input, reason) → 장부 gate(data.at permission, value reject, target 명령). 같은 호출은 한 번', async () => {
  const { b, add, gates, store } = await board();
  const s = add('checker-1', { seat: 'checker', run: { loop: 'check' } });
  const r = b.rigAmp.onPermissionDenied(s, { hook_event_name: 'PermissionDenied', tool_name: 'Bash', tool_input: { command: 'mkdir zz', description: 'x' }, tool_use_id: 'tu1', reason: 'denyInsteadOfPrompting' });
  assert.deepEqual(r, { tool: 'Bash', target: 'mkdir zz' });
  assert.equal(b.rigAmp.onPermissionDenied(s, { tool_name: 'Bash', tool_input: { command: 'mkdir zz' }, tool_use_id: 'tu1' }, { via: 'PermissionRequest' }), null, '같은 호출');
  const g = gates();
  assert.equal(g.length, 1);
  assert.equal(g[0].value, 'reject'); assert.equal(g[0].seat, 'checker'); assert.equal(g[0].session, s.sessionId);
  assert.deepEqual({ at: g[0].data.at, tool: g[0].data.tool, target: g[0].data.target, reason: g[0].data.reason, promptless: g[0].data.promptless, via: g[0].data.via }, { at: 'permission', tool: 'Bash', target: 'mkdir zz', reason: 'denyInsteadOfPrompting', promptless: true, via: 'PermissionDenied' });
  assert.match(g[0].text, /^permission: Bash 묻지 않고 거절: mkdir zz$/);
  assert.ok(store.eventsOf ? true : true);
  assert.equal(deniedTarget('Write', { file_path: 'C:/x/y.md', content: 'a' }), 'C:/x/y.md');
  assert.equal(deniedTarget('mcp__x__y', { a: 1 }), '{"a":1}');
  // 자리 없는 세션은 적지 않는다
  assert.equal(b.rigAmp.onPermissionDenied(add('loose'), { tool_name: 'Bash', tool_input: { command: 'rm x' } }), null);
  assert.equal(gates().length, 1);
});

// 판(Backend.prototype)의 hook 받기: 판이 연 회의 scoped 자리(설정 파일에 denyInsteadOfPrompting)는 PermissionRequest가 질문이 아니라 거절이다
function hookBackend(B) {
  const be = Object.create(Backend.prototype);
  const casts = [];
  Object.assign(be, {
    sessions: B.b.sessions, store: B.store, rigAmp: B.b.rigAmp, log: () => {}, probeGit: () => {}, onLinkTargetPrompt: () => {}, rigDocs: null,
    api: { broadcast: (n, d) => casts.push({ n, d }) }, queue: { onUserPromptSubmit: () => {} }, readChoicesLater: () => {}, recheckBlockedLater: () => {}, refreshModelNow: () => {}, broadcastSession: () => {}, web: null,
  });
  return { be, casts };
}
const reqBody = (s, cmd, id) => JSON.stringify({ hook_event_name: 'PermissionRequest', session_id: s.sessionId, tool_name: 'Bash', tool_input: { command: cmd }, tool_use_id: id, permission_suggestions: [] });
const hdr = (s) => ({ 'x-mt-session': s.sessionId, authorization: `Bearer ${s.hookToken}` });

test('P234 판: 묻지 않고 거절하는 자리의 PermissionRequest는 응답 필요에 두지 않고 장부 gate reject. 묻는 자리는 그대로 질문', async () => {
  const B = await board();
  const { be, casts } = hookBackend(B);
  const chk = B.add('checker-1', { seat: 'checker', run: { loop: 'check' } });
  assert.equal(B.b.rigAmp.refusesPrompt(chk), true);
  be.processHook(hdr(chk), reqBody(chk, 'mkdir zz', 'tu1'));
  assert.equal(chk.rt.pendingAsk, null, '질문으로 두지 않는다');
  const h = casts.find((c) => c.n === 'session.hook');
  assert.equal(h.d.refused, true); assert.equal(h.d.ask, undefined);
  const g = B.gates();
  assert.equal(g.length, 1); assert.equal(g[0].data.via, 'PermissionRequest'); assert.equal(g[0].data.target, 'mkdir zz');
  // 뒤에 PermissionDenied가 와도(다음 판의 Claude Code) 같은 호출은 한 번
  be.processHook(hdr(chk), JSON.stringify({ hook_event_name: 'PermissionDenied', session_id: chk.sessionId, tool_name: 'Bash', tool_input: { command: 'mkdir zz' }, tool_use_id: 'tu1', reason: 'x' }));
  assert.equal(B.gates().length, 1);
  // 설정 파일에 칸이 없으면(아직 맞추지 않은 옛 세션) 질문으로 둔다
  const chk2 = B.add('checker-2', { seat: 'checker' }); chk2.rigRun = { loop: 'check' };
  assert.equal(B.b.rigAmp.refusesPrompt(chk2), false);
  // request 고리의 자리는 그대로 묻는다
  const main = B.add('main', { seat: 'main' });
  assert.equal(B.b.rigAmp.refusesPrompt(main), false);
  be.processHook(hdr(main), reqBody(main, 'mkdir yy', 'tu2'));
  assert.equal(main.rt.pendingAsk && main.rt.pendingAsk.kind, 'permission');
  assert.equal(B.gates().length, 1);
});

// ---------- 5. 받을 Yes가 없는 질문 ----------
test('P234 받을 Yes가 없는 rig 자리 권한 질문: 판 로그 한 줄과 장부 gate blocked(질문마다 한 번). 그냥 Yes가 있거나 rig 밖·unattended면 적지 않는다', async () => {
  const B = await board();
  const { be } = hookBackend(B);
  const main = B.add('main', { seat: 'main' });
  const logs = [];
  be.log = (...a) => logs.push(a.join(' ')); B.b.log = be.log;
  const ask = (labels) => ({ kind: 'permission', tool: 'Bash', toolUseId: 'tu', summary: 'Bash: mkdir x', since: 1, choices: labels.map((label, i) => ({ n: i + 1, label })) });
  const a1 = ask(['Yes, proceed this time', 'Yes, and switch to auto mode', 'No']);
  assert.equal(be.noteNoYes(main, a1), true);
  assert.equal(be.noteNoYes(main, a1), false, '같은 질문은 한 번');
  const g = B.gates();
  assert.equal(g.length, 1);
  assert.equal(g[0].value, 'blocked'); assert.equal(g[0].data.at, 'permission'); assert.equal(g[0].data.why, 'no_yes');
  assert.deepEqual(g[0].data.choices, ['1. Yes, proceed this time', '2. Yes, and switch to auto mode', '3. No']);
  assert.ok(g[0].text.startsWith(`permission: ${NO_YES_WHY}`));
  assert.equal(NO_YES_WHY, '받을 Yes가 없는 선택지 꼴');
  assert.ok(logs.some((l) => /rig permission ask without a plain Yes main \(main\)/.test(l)), logs.join('\n'));
  assert.equal(be.noteNoYes(main, ask(['Yes', 'Yes, and don\u2019t ask again for: mkdir x *', 'No'])), false, '그냥 Yes가 있다');
  assert.equal(be.noteNoYes(main, { ...ask(['Yes, once']), kind: 'plan' }), false, '권한 질문만');
  assert.equal(be.noteNoYes(B.add('loose'), ask(['Yes, once', 'No'])), false, 'rig 밖');
  assert.equal(be.noteNoYes(B.add('robot', { seat: 'robot' }), ask(['Yes, once', 'No'])), true, '승인 전 unattended는 scoped로 돌아 한 번만 받는다');
  assert.equal(B.gates().length, 2, '승인 전 unattended는 scoped라 적는다');
  // 화면에서 읽은 권한 질문(noteScreenPermission)에도 건다
  const s = B.add('main-2', { seat: 'main' });
  s.rt.term.present = true; applyTermStatus(s.rt, 'blocked');
  be.hooked = () => true;
  const screen = ['Bash command', '', '  mkdir q', '', 'Do you want to proceed?', '❯ 1. Yes, once', '  2. No', '', 'Esc to cancel'].join('\n');
  const put = be.noteScreenPermission(s, screen);
  assert.equal(put, true);
  assert.equal(B.gates().length, 3);
  assert.deepEqual(B.gates().find((e) => e.session === s.sessionId).data.choices, ['1. Yes, once', '2. No']);
});
