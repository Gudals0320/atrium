// P269: rig를 통째로 걷어 냈다. 옛 판 DB에 남은 rig 역할 세션(sessions.rig_role, 빌더 포함)은 판이 뜰 때 한 번 보통 세션으로 바뀐다(P250 떼기 규칙):
//   권한 모드는 호출자 claude의 승인 방식(없으면 manual), 설정 파일에 rig 거절 규칙·PreToolUse 시간 제한·auto 끄기가 없고, 이어 가기 명령을 다시 만든다.
//   떠 있는 역할 세션은 끄지 않는다. 깨우기·판 재시작 뒤에도 bypass로 돌아오지 않는다. .atrium/rig.json이 있는 워크스페이스는 아무 일도 없다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Backend } from '../src/backend.mjs';
import { Store } from '../src/store.mjs';
import { workspaceOf } from '../src/git.mjs';
import { Sleeper } from '../src/sleep.mjs';
import { writeSessionSettings, buildResumeArgv, transcriptPathFor } from '../src/launch.mjs';
import { newRuntime, applyTermStatus } from '../src/state.mjs';
import { retireRigRoles, stripRigSettings, plainPermission } from '../src/old-roles.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, '..', 'src');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p269-'));
const flag = (args, f) => { const i = args.indexOf(f); return i < 0 ? null : args[i + 1]; };
const CFG = (dir) => ({ quietMs: 600000, port: 0, logDir: dir, dataDir: path.join(dir, 'data'), sessionsDir: path.join(dir, 'sessions'), claudeJson: path.join(dir, 'none.json'), claudeCommand: 'claude', hookTimeoutSec: 2 });
// 옛 rig 역할 세션의 설정 칸(P249~P262의 roleSettingsAmp 꼴): 정의 파일 Edit 거절 + 셸 안의 셸 거절, PreToolUse 시간 제한, auto 끄기
const SHELL_DENY = ['cmd', 'cmd.exe', 'powershell', 'powershell.exe', 'pwsh', 'pwsh.exe'].map((x) => `Bash(${x}:*)`);
const OLD_AMP = (root) => ({ deny: [`Edit(/${root.replace(/\\/g, '/').replace(/^([A-Za-z]):/, (m, d) => d.toLowerCase())}/.atrium/rig.json)`, ...SHELL_DENY], hooks: { PreToolUse: { timeout: 10 } }, permissions: { disableAutoMode: 'disable' } });

// 진짜 판(Backend: launchOf, harnessLaunchOf, Sleeper의 깨우기)과 판 DB, 가짜 터미널
async function boardOn(dir, root, projects) {
  const b = new Backend(CFG(dir));
  b.cfg.claudeProjects = projects;
  b.store = new Store(path.join(dir, 'board.db'));
  b.sessions = new Map();
  const ws = await workspaceOf(root);
  if (!b.store.getWorkspace(ws.key)) b.store.insertWorkspace({ ...ws, createdAt: 1 });
  b.api = { broadcast: () => {} };
  b.broadcastSession = () => {};
  b.requireTerminal = () => {};
  const starts = []; const harness = []; const killed = [];
  b.queue = { enqueue: () => ({ deliveryId: 'd1' }), cancel: () => {}, cancelSession: () => {} };
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
  b.kill = async (p) => { killed.push(p); return { ok: true }; };
  b.sleeper = new Sleeper(b, { timers: false, wakeReadyMs: 2000, settleMs: 0, staggerMs: 0 });
  return { b, ws, starts, harness, killed };
}
// 옛 판: sessions.rig_role 열이 있는 DB에 역할 세션 셋(Claude Code 데이터 역할·빌더, Codex 역할)과 닫힌 역할 세션 하나, 보통 세션 하나
async function oldBoard() {
  const dir = tmp(); const root = tmp(); const projects = tmp();
  fs.mkdirSync(path.join(root, '.atrium', 'roles'), { recursive: true });
  fs.writeFileSync(path.join(root, '.atrium', 'rig.json'), JSON.stringify({ version: 3, name: 'old', roles: { data: { owns: ['data/'] } } }, null, 2));
  const B = await boardOn(dir, root, projects);
  B.b.store.db.exec('ALTER TABLE sessions ADD COLUMN rig_role TEXT'); // 옛 판 DB(store-rig-roles.mjs가 더하던 열)
  let n = 10;
  const mk = (name, role, { kind = 'claude', mode = 'bypassPermissions', closed = false } = {}) => {
    const sessionId = `00000000-0000-4000-8000-0000000003${n++}`;
    const rt = newRuntime({ kind, hooked: kind === 'claude' });
    rt.term.present = true; rt.phase = 'running'; applyTermStatus(rt, 'idle');
    const s = { sessionId, name, cwd: root, paneId: 'w1:' + name, termWorkspaceId: 'w1', agentName: name, model: kind === 'claude' ? 'haiku' : 'gpt-x', effort: null, permissionMode: kind === 'claude' ? mode : 'manual', settingsPath: '', hookToken: 'tok', resumeArgv: null, resumeVerified: false, createdAt: Date.now(), closedAt: null, seenAt: null, touchedAt: null, rt, lastState: null, kind, origin: 'board', parentSessionId: null, workspaceKey: B.ws.key, flavor: null, extraArgs: [], startCommand: '', harnessPlan: kind === 'claude' ? null : { model: 'gpt-x', args: [], launcher: 'codex', harnessSessionId: 'h-' + name } };
    if (kind === 'claude') {
      s.settingsPath = writeSessionSettings({ file: path.join(dir, 'sessions', `${sessionId}.json`), hookUrl: 'http://127.0.0.1:1/hooks/claude', token: 'tok', sessionId, allow: ['Bash(atrium rig:*)'], amp: role ? OLD_AMP(root) : null });
      s.resumeArgv = buildResumeArgv({ claudeCommand: 'claude', ...B.b.launchOf(s, { launch: false }) });
      const tx = transcriptPathFor(projects, root, sessionId); fs.mkdirSync(path.dirname(tx), { recursive: true }); fs.writeFileSync(tx, '{}\n');
    }
    B.b.store.insertSession({ ...s, runtime: rt });
    if (role) B.b.store.db.prepare('UPDATE sessions SET rig_role = ? WHERE session_id = ?').run(role, sessionId);
    if (closed) { s.closedAt = Date.now(); B.b.store.updateSession(sessionId, { closedAt: s.closedAt }); } else B.b.sessions.set(sessionId, s);
    return s;
  };
  const data = mk('data', 'data'); const builder = mk('builder', '@builder'); const cx = mk('cx', 'cx', { kind: 'codex' });
  const gone = mk('ideas', 'ideas', { closed: true }); const plain = mk('plain', null, { mode: 'acceptEdits' });
  return { ...B, dir, root, projects, data, builder, cx, gone, plain };
}
async function woke(sl, s, why) {
  const r = await sl.wakeFor(s, why);
  for (const j of (r && r.jobs) || []) await j.job;
  for (const t0 = Date.now(); s.rt.sleep || s.waking; ) { if (Date.now() - t0 > 3000) throw new Error('not woken: ' + JSON.stringify(s.rt.sleep)); await new Promise((x) => setTimeout(x, 10)); }
}
const settingsOf = (s) => JSON.parse(fs.readFileSync(s.settingsPath, 'utf8'));
const plainSettings = (j) => {
  const p = j.permissions || {};
  assert.equal(p.deny, undefined, 'rig 거절 규칙이 없다');
  assert.equal(p.disableAutoMode, undefined, 'auto 끄기가 없다');
  for (const list of Object.values(j.hooks)) for (const g of list) for (const h of g.hooks) assert.equal(h.timeout, 2, '판 hook은 보통 시간 제한');
};
const roleCol = (B, sid) => B.b.store.db.prepare('SELECT rig_role FROM sessions WHERE session_id = ?').get(sid).rig_role;

test('P269 옛 역할 세션 → 보통 세션 한 번: 권한 모드·설정 파일·이어 가기 명령·DB, 떠 있는 세션은 끄지 않는다. 두 번째는 할 일이 없다', async () => {
  const B = await oldBoard();
  assert.ok(settingsOf(B.data).permissions.deny.length, '옛 설정 파일에는 rig 거절 규칙');
  assert.equal(flag(B.data.resumeArgv, '--permission-mode'), 'bypassPermissions');
  const out = retireRigRoles(B.b);
  assert.deepEqual(out.map((x) => [x.name, x.role]).sort(), [['builder', '@builder'], ['cx', 'cx'], ['data', 'data'], ['ideas', 'ideas']]);
  for (const s of [B.data, B.builder]) {
    assert.equal(s.permissionMode, 'manual');
    plainSettings(settingsOf(s));
    assert.equal(flag(s.resumeArgv, '--permission-mode'), 'manual');
    const row = B.b.store.getSession(s.sessionId);
    assert.equal(row.permissionMode, 'manual'); assert.equal(flag(row.resumeArgv, '--permission-mode'), 'manual');
    assert.equal(roleCol(B, s.sessionId), null);
    assert.equal(s.rigRole, undefined);
  }
  // 닫힌 역할 세션(판이 쥐지 않은 DB 줄)도 바뀐다(되살리기가 그 값을 읽는다)
  const g = B.b.store.getSession(B.gone.sessionId);
  assert.equal(g.permissionMode, 'manual'); plainSettings(settingsOf(B.gone)); assert.equal(roleCol(B, B.gone.sessionId), null);
  // 보통 세션은 그대로
  assert.equal(B.plain.permissionMode, 'acceptEdits'); assert.equal(B.b.store.getSession(B.plain.sessionId).permissionMode, 'acceptEdits');
  // 떠 있는 역할 세션은 끄지도 재우지도 않는다(다음 실행부터 보통)
  assert.deepEqual(B.killed, []); assert.ok(!B.data.rt.sleep);
  // 판 기록(이벤트)만 남기고 알림은 없다
  assert.ok(B.b.store.events({}).some((e) => e.kind === 'rig_role_retired' && e.sessionId === B.data.sessionId));
  assert.deepEqual(B.b.store.oldRigRoles(), []);
  assert.deepEqual(retireRigRoles(B.b), [], '두 번째는 할 일이 없다');
  B.b.store.close();
});

test('P269 바꾼 뒤 사람·글 깨우기와 판 재시작 뒤 깨우기도 bypass 없이. Codex 역할은 무인 인자 없이', async () => {
  const B = await oldBoard();
  retireRigRoles(B.b);
  // 재운 것처럼(패널을 닫음) → 사람이 깨운다
  const nap = (s) => { s.rt.sleep = { at: Date.now(), by: 'rig', scope: 'session', convId: s.sessionId }; s.paneId = null; s.rt.term.present = false; B.b.store.updateSession(s.sessionId, { paneId: null, runtime: s.rt }); };
  nap(B.data); nap(B.cx);
  await woke(B.b.sleeper, B.data, 'human');
  const a = B.starts.at(-1).args;
  assert.equal(a[0], '--resume'); assert.equal(flag(a, '--permission-mode'), 'manual'); assert.ok(!a.includes('bypassPermissions'));
  assert.equal(flag(a, '--settings'), B.data.settingsPath.split(path.sep).join('/'));
  await woke(B.b.sleeper, B.cx, 'delivery');
  const cxArgs = B.harness.at(-1).args;
  for (const w of ['never', 'workspace-write', '--ask-for-approval', '--sandbox', '-C', '--add-dir']) assert.ok(!cxArgs.includes(w), w);
  // 판을 다시 띄운다: 판 DB의 행에서 세션을 만든다(rig_role이 비었으니 옮기기는 할 일이 없다)
  nap(B.builder);
  B.b.store.close();
  const C = await boardOn(B.dir, B.root, B.projects);
  for (const row of C.b.store.openSessions()) C.b.sessions.set(row.sessionId, { ...row, rt: row.runtime });
  assert.deepEqual(retireRigRoles(C.b), []);
  const builder = C.b.sessions.get(B.builder.sessionId);
  assert.equal(builder.rigRole, undefined); assert.equal(builder.permissionMode, 'manual');
  // 재시작 뒤 판이 다시 띄울 값(깨우기·되살리기가 쓰는 launchOf와 저장된 이어 가기 명령)도 보통 값
  assert.equal(flag(buildResumeArgv({ claudeCommand: 'claude', ...C.b.launchOf(builder, { launch: false }) }), '--permission-mode'), 'manual');
  assert.equal(flag(builder.resumeArgv, '--permission-mode'), 'manual');
  plainSettings(settingsOf(builder));
  C.b.store.close();
});

test('P269 사용자의 보통 권한 모드: 호출자 claude의 승인 방식을 따른다', async () => {
  const B = await oldBoard();
  B.b.features = { launchers: { find: (r) => (r === 'claude' ? { id: 'claude', harness: 'claude', permissionMode: 'acceptEdits' } : null) } };
  assert.equal(plainPermission(B.b), 'acceptEdits');
  retireRigRoles(B.b);
  assert.equal(B.data.permissionMode, 'acceptEdits');
  assert.equal(flag(B.data.resumeArgv, '--permission-mode'), 'acceptEdits');
  B.b.store.close();
});

test('P269 stripRigSettings: rig 칸만 걷고 판의 allow·사용자 hook은 그대로', () => {
  const j = { hooks: { PreToolUse: [{ hooks: [{ type: 'http', url: 'u', timeout: 10, onFailure: 'block' }] }], Stop: [{ hooks: [{ type: 'command', command: 'mine', timeout: 30 }] }] }, permissions: { allow: ['Bash(atrium rig:*)', 'Bash(atrium prompt:*)'], deny: ['Bash(cmd:*)'], disableAutoMode: 'disable' }, env: { A: '1' } };
  assert.equal(stripRigSettings(j, 2, ['Bash(atrium prompt:*)']), true);
  assert.deepEqual(j.permissions, { allow: ['Bash(atrium prompt:*)'] });
  assert.deepEqual(j.hooks.PreToolUse[0].hooks[0], { type: 'http', url: 'u', timeout: 2 });
  assert.equal(j.hooks.Stop[0].hooks[0].timeout, 30, '사용자 hook은 그대로');
  assert.deepEqual(j.env, { A: '1' });
  assert.equal(stripRigSettings(j, 2, ['Bash(atrium prompt:*)']), false, '두 번째는 바뀐 것이 없다');
});

test('P269 rig 전 판·새 판(rig_role 열 없음)과 .atrium/rig.json이 있는 워크스페이스: 오류 없이 아무 일도 없다', async () => {
  const dir = tmp(); const root = tmp();
  fs.mkdirSync(path.join(root, '.atrium'), { recursive: true });
  fs.writeFileSync(path.join(root, '.atrium', 'rig.json'), '{ "version": 3, "roles": {} }');
  const B = await boardOn(dir, root, tmp());
  assert.deepEqual(B.b.store.oldRigRoles(), []);
  assert.deepEqual(retireRigRoles(B.b), []);
  // 새 판 DB에는 rig 표·열을 만들지 않는다
  const tables = B.b.store.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name);
  assert.ok(!tables.some((t) => /^(rig_|rig3_|tool_runs$)/.test(t)), tables.join(','));
  const cols = (t) => B.b.store.db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
  assert.ok(!cols('sessions').includes('rig_role')); assert.ok(!cols('workspaces').includes('rig_enabled'));
  assert.ok(cols('deliveries').includes('origin') && cols('deliveries').includes('from_session'), '전달 출처 열은 남는다');
  B.b.store.close();
});

test('P269 걷어 낸 것: rig 모듈·판 API·rig 동사가 없다', async () => {
  const names = fs.readdirSync(SRC);
  assert.deepEqual(names.filter((f) => /^(rig[-.]|store-rig|tool-exec)/.test(f)), []);
  const backendSrc = fs.readFileSync(path.join(SRC, 'backend.mjs'), 'utf8');
  assert.doesNotMatch(backendSrc, /rig[A-Z]\w*Handlers|'rig3?\.|rig3\b|\bRigRoles\b/);
  const { VERB_NAMES, CONTRACT_VERSION } = await import('../src/cli-contract.mjs');
  assert.ok(!VERB_NAMES.includes('rig')); assert.equal(CONTRACT_VERSION, 7); // P284: ask로 7
});
