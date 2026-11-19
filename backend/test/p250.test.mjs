// P250: 정의에서 빠져 rig에서 떼어진 옛 역할 세션은 깨울 때(사람, 글, 판 재시작 뒤) 보통 세션의 띄우기 값으로 돌아온다.
// 권한 모드는 사용자의 보통 값, 설정 파일에 rig 거절 규칙·PreToolUse 시간 제한·auto 끄기가 없고, 판 알림(역할 글)은 거둔다. Codex는 무인 인자 없이.
// 재우지 못하고 떠 있는 세션은 닫는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Backend } from '../src/backend.mjs';
import { Store } from '../src/store.mjs';
import { workspaceOf } from '../src/git.mjs';
import { Rig } from '../src/rig.mjs';
import { RigRoles, ROLE_PERMISSION_MODE } from '../src/rig-roles.mjs';
import { Sleeper } from '../src/sleep.mjs';
import { writeSessionSettings, buildResumeArgv, transcriptPathFor } from '../src/launch.mjs';
import { newRuntime, applyTermStatus, deriveState } from '../src/state.mjs';
import { SHELL_IN_SHELL_DENY } from '../src/rig-writes.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p250-'));
const flag = (args, f) => { const i = args.indexOf(f); return i < 0 ? null : args[i + 1]; };
const DOC = (name) => [`# ${name}`, '', '## 맡은 것', `${name}의 일`, '', '## 받는 것과 내는 것', '받는 것: 없음', '', '## 기준', '- 기준 하나', '', '## 요령', '- 요령 하나'].join('\n');
const DEF = () => ({
  version: 3, name: 'p250', purpose: '.atrium/purpose.md',
  roles: { data: { owns: ['data/'] }, ideas: { owns: ['hypotheses/'] }, cx: { owns: ['cx/'], launcher: 'codex' } },
  flows: [{ item: 'snapshot', from: 'data', to: 'ideas' }, { item: 'hint', from: 'human', to: 'cx' }],
});
const CFG = (dir) => ({ quietMs: 600000, port: 0, logDir: dir, dataDir: path.join(dir, 'data'), sessionsDir: path.join(dir, 'sessions'), claudeJson: path.join(dir, 'none.json'), claudeCommand: 'claude', hookTimeoutSec: 2 });

// 진짜 판(Backend: launchOf, harnessLaunchOf, Rig, RigRoles, Sleeper의 깨우기)과 판 DB, 가짜 터미널
async function boardOn(dir, root, projects) {
  const b = new Backend(CFG(dir));
  b.cfg.claudeProjects = projects;
  b.store = new Store(path.join(dir, 'board.db'));
  b.sessions = new Map();
  const ws = await workspaceOf(root);
  if (!b.store.getWorkspace(ws.key)) b.store.insertWorkspace({ ...ws, createdAt: 1 });
  b.rig = new Rig(b); b.rig3 = new RigRoles(b);
  b.api = { broadcast: () => {} };
  b.broadcastSession = () => {};
  b.requireTerminal = () => {};
  const starts = []; const harness = []; const killed = []; const cancelled = [];
  b.queue = { enqueue: () => ({ deliveryId: 'd1' }), cancel: (id) => cancelled.push(id), cancelSession: () => {} };
  b.adapter = {
    connected: true,
    waitShellReady: async () => true,
    startAgent: async (o) => { starts.push(o); const s = [...b.sessions.values()].find((x) => x.paneId === o.paneId); if (s) { s.rt.term.present = true; s.rt.phase = 'running'; applyTermStatus(s.rt, 'idle'); } return { agent: { launchPending: false }, argv: ['claude', ...(o.args || [])] }; },
    createWorkspace: async () => ({ paneId: 'w9:p' + (starts.length + harness.length + 1), workspaceId: 'w9' }),
    closeWorkspace: async () => {},
    refreshSubscription: async () => {},
    getPane: async () => null,
  };
  b.startHarness = async (s, o) => { const hl = b.harnessLaunchOf(s, { resume: !!o.resume }); harness.push(hl); s.rt.term.present = true; s.rt.phase = 'running'; applyTermStatus(s.rt, 'idle'); return hl; };
  b.kill = async (p) => { killed.push(p); const s = b.sessions.get(p.session); if (s) { s.closedAt = Date.now(); b.sessions.delete(p.session); } return { ok: true }; };
  b.sleeper = new Sleeper(b, { timers: false, wakeReadyMs: 2000, settleMs: 0, staggerMs: 0 });
  // 재우기만 가짜(패널을 닫은 것처럼)
  b.sleeper.sleep = async (s) => { s.rt.sleep = { at: Date.now(), by: 'rig', scope: 'session', convId: s.sessionId }; s.paneId = null; s.rt.term.present = false; b.store.updateSession(s.sessionId, { paneId: null, runtime: s.rt }); return { slept: true }; };
  return { b, ws, starts, harness, killed, cancelled };
}
async function board() {
  const dir = tmp(); const root = tmp(); const projects = tmp();
  fs.mkdirSync(path.join(root, '.atrium', 'roles'), { recursive: true });
  fs.writeFileSync(path.join(root, '.atrium', 'purpose.md'), '# 목적\n');
  for (const r of Object.keys(DEF().roles)) fs.writeFileSync(path.join(root, '.atrium', 'roles', `${r}.md`), DOC(r));
  fs.writeFileSync(path.join(root, '.atrium', 'rig.json'), JSON.stringify(DEF(), null, 2));
  const B = await boardOn(dir, root, projects);
  B.b.rig.setEnabled(B.ws.key, true, 'human');
  // 역할 세션(backend.spawn의 역할 띄우기가 남기는 값): Claude Code 둘, Codex 하나
  const mk = (name, role, kind = 'claude') => {
    const sessionId = `00000000-0000-4000-8000-0000000002${String(B.b.sessions.size + 50)}`;
    const L = B.b.rig3.launchOf(B.ws.key, role, { kind, cwd: root });
    const rt = newRuntime({ kind, hooked: kind === 'claude' });
    rt.term.present = true; rt.phase = 'running'; applyTermStatus(rt, 'idle');
    const s = { sessionId, name, cwd: root, paneId: 'w1:' + name, termWorkspaceId: 'w1', agentName: name, model: kind === 'claude' ? 'haiku' : 'gpt-x', effort: null, permissionMode: kind === 'claude' ? L.permissionMode : 'manual', settingsPath: '', hookToken: 'tok', resumeArgv: null, resumeVerified: false, createdAt: Date.now(), closedAt: null, seenAt: null, touchedAt: null, rt, lastState: null, kind, origin: 'board', parentSessionId: null, workspaceKey: B.ws.key, flavor: null, extraArgs: [], startCommand: '', harnessPlan: kind === 'claude' ? null : { model: 'gpt-x', args: [], launcher: 'codex', harnessSessionId: 'h-' + name } };
    if (kind === 'claude') {
      s.settingsPath = writeSessionSettings({ file: path.join(dir, 'sessions', `${sessionId}.json`), hookUrl: 'http://127.0.0.1:1/hooks/claude', token: 'tok', sessionId, amp: L.amp });
      s.resumeArgv = buildResumeArgv({ claudeCommand: 'claude', ...B.b.launchOf({ ...s, rigRole: null }) });
      const tx = transcriptPathFor(projects, root, sessionId); fs.mkdirSync(path.dirname(tx), { recursive: true }); fs.writeFileSync(tx, '{}\n');
    }
    B.b.store.insertSession({ ...s, runtime: rt });
    s.rigRole = role; B.b.store.setSessionRole(sessionId, role);
    B.b.sessions.set(sessionId, s);
    return s;
  };
  const data = mk('data', 'data'); const ideas = mk('ideas', 'ideas'); const cx = mk('cx', 'cx', 'codex');
  return { ...B, dir, root, projects, data, ideas, cx };
}
function dropRoles(B, keep) {
  const def = DEF(); for (const r of Object.keys(def.roles)) if (!keep.includes(r)) delete def.roles[r];
  def.flows = def.flows.filter((f) => [f.from, f.to].flat().every((x) => x === 'human' || keep.includes(x)));
  if (!def.flows.length) def.flows = [{ item: 'hint', from: 'human', to: keep[0] }];
  fs.writeFileSync(path.join(B.root, '.atrium', 'rig.json'), JSON.stringify(def, null, 2));
  const t = new Date(Date.now() + 5000); fs.utimesSync(path.join(B.root, '.atrium', 'rig.json'), t, t);
}
// 깨우기(wakeFor는 리포 깨우기의 일을 돌려준다)를 끝까지 기다린다
async function woke(sl, s, why) {
  const r = await sl.wakeFor(s, why);
  for (const j of (r && r.jobs) || []) await j.job;
  for (const t0 = Date.now(); s.rt.sleep || s.waking; ) { if (Date.now() - t0 > 3000) throw new Error('not woken: ' + JSON.stringify(s.rt.sleep)); await new Promise((x) => setTimeout(x, 10)); }
}
const settingsOf = (s) => JSON.parse(fs.readFileSync(s.settingsPath, 'utf8'));
const plainSettings = (j) => {
  const p = j.permissions || {};
  assert.ok(!(p.deny || []).some((r) => SHELL_IN_SHELL_DENY.includes(r) || /^Edit\(/.test(r)), 'rig 거절 규칙이 없다');
  assert.equal(p.disableAutoMode, undefined, 'auto 끄기가 없다');
  assert.equal(j.hooks.PreToolUse[0].hooks[0].timeout, 2, 'PreToolUse는 보통 시간 제한');
};

test('P250 떼어진 Claude Code 역할 세션: 떼는 순간 보통 값(권한 모드·설정 파일·이어 가기 명령·DB), 사람이 깨우면 bypass 없이 이어 간다', async () => {
  const B = await board();
  assert.equal(B.ideas.permissionMode, ROLE_PERMISSION_MODE);
  assert.ok(settingsOf(B.ideas).permissions.deny.length, '역할 설정 파일에는 rig 거절 규칙');
  B.b.rig3.items.sent.set(B.ideas.sessionId, new Set(['dq1'])); // 아직 넣지 않은 판 알림
  dropRoles(B, ['data', 'cx']);
  const out = await B.b.rig3.detachRemoved();
  assert.deepEqual(out.map((x) => [x.role, x.slept]), [['ideas', true]]);
  assert.equal(B.ideas.rigRole, null);
  assert.equal(B.ideas.permissionMode, 'manual');
  assert.deepEqual(B.cancelled, ['dq1'], '판 알림(역할 글)을 거둔다');
  plainSettings(settingsOf(B.ideas));
  assert.equal(flag(B.ideas.resumeArgv, '--permission-mode'), 'manual');
  const row = B.b.store.getSession(B.ideas.sessionId);
  assert.equal(row.permissionMode, 'manual'); assert.equal(row.rigRole, null); assert.equal(flag(row.resumeArgv, '--permission-mode'), 'manual');
  // 사람이 깨운다
  await woke(B.b.sleeper, B.ideas, 'human');
  const a = B.starts.at(-1).args;
  assert.equal(a[0], '--resume');
  assert.equal(flag(a, '--permission-mode'), 'manual');
  assert.ok(!a.includes(ROLE_PERMISSION_MODE));
  assert.equal(flag(a, '--settings'), B.ideas.settingsPath.split(path.sep).join('/'));
  // 떼어진 세션의 PreToolUse에는 판이 답하지 않는다(rig 규칙 없음)
  assert.equal(B.b.rig3.wants(B.ideas, 'PreToolUse'), false);
  // 남은 역할(data)은 그대로 무인
  assert.equal(B.data.permissionMode, ROLE_PERMISSION_MODE); assert.equal(B.data.rigRole, 'data');
  B.b.store.close();
});

test('P250 글로 깨우기와 판 재시작 뒤 깨우기도 보통 값. Codex 역할은 무인 인자 없이 이어 간다', async () => {
  const B = await board();
  // 떼기 전 Codex 역할은 무인
  const before = B.b.harnessLaunchOf(B.cx, { resume: true }).args;
  assert.ok(before.includes('never'));
  // 잠든 채로 떼어진다(재우지 않고 떼기만)
  for (const s of [B.ideas, B.cx]) await B.b.sleeper.sleep(s);
  dropRoles(B, ['data']);
  const out = await B.b.rig3.detachRemoved();
  assert.deepEqual(out.map((x) => [x.role, x.slept]).sort(), [['cx', false], ['ideas', false]]);
  // 글이 와서 깬다(대기열의 깨우기와 같은 부름)
  await woke(B.b.sleeper, B.cx, 'delivery');
  const cxArgs = B.harness.at(-1).args;
  assert.equal(cxArgs[0], 'resume');
  for (const w of ['never', 'workspace-write', '--ask-for-approval', '--sandbox', '-C', '--add-dir']) assert.ok(!cxArgs.includes(w), w);
  // 판을 다시 띄운다: 판 DB의 행에서 세션을 만든다
  B.b.store.close();
  const C = await boardOn(B.dir, B.root, B.projects);
  for (const row of C.b.store.openSessions()) C.b.sessions.set(row.sessionId, { ...row, rt: row.runtime });
  const ideas = C.b.sessions.get(B.ideas.sessionId);
  assert.equal(ideas.rigRole, null); assert.equal(ideas.permissionMode, 'manual');
  assert.ok(ideas.rt.sleep);
  await woke(C.b.sleeper, ideas, 'delivery');
  const a = C.starts.at(-1).args;
  assert.equal(flag(a, '--permission-mode'), 'manual');
  plainSettings(settingsOf(ideas));
  // 재시작 뒤 Codex도 무인 인자 없음
  const cx = C.b.sessions.get(B.cx.sessionId);
  assert.ok(!C.b.harnessLaunchOf(cx, { resume: true }).args.includes('never'));
  // 남은 data는 재시작 뒤에도 역할(무인)
  assert.equal(C.b.sessions.get(B.data.sessionId).permissionMode, ROLE_PERMISSION_MODE);
  C.b.store.close();
});

test('P250 사용자의 보통 권한 모드: 호출자 claude의 승인 방식을 따른다', async () => {
  const B = await board();
  B.b.features = { launchers: { find: (r) => (r === 'claude' ? { id: 'claude', harness: 'claude', permissionMode: 'acceptEdits' } : null) } };
  dropRoles(B, ['data', 'cx']);
  await B.b.rig3.detachRemoved();
  assert.equal(B.ideas.permissionMode, 'acceptEdits');
  assert.equal(flag(B.ideas.resumeArgv, '--permission-mode'), 'acceptEdits');
  B.b.store.close();
});

test('P250 재우지 못하고 떠 있는 떼어진 세션은 닫는다(지키는 이 없는 bypass로 두지 않는다)', async () => {
  const B = await board();
  B.b.sleeper.sleep = async () => { throw Object.assign(new Error('busy'), { code: 'busy' }); };
  dropRoles(B, ['data', 'cx']);
  const out = await B.b.rig3.detachRemoved();
  assert.equal(out[0].closed, true);
  assert.deepEqual(B.killed.map((k) => k.session), [B.ideas.sessionId]);
  const rows = B.b.store.rigEvents({ ws: B.ws.key, kinds: ['role_removed'], limit: 10 });
  assert.equal(rows.at(-1).value, 'closed');
  B.b.store.close();
});
