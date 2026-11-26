// P382 단위 시험: 다른 하네스(omo 등)의 atrium child --worktree(판이 git worktree add로 만들고 그 폴더에서 띄운다), omo 주 체크아웃 경고,
//   OMO 브랜치 표시, 띄우기 실패 때 되돌리기, 그 하위의 done ok가 merger 판정에서 그 워크트리 브랜치로 가는지(mergeVerdict·branchProbe·workCwd).
//   진짜 git 저장소, 가짜 판(p208 시험의 틀). claude·hc 없이 돈다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { Store } from '../src/store.mjs';
import { newRuntime, deriveState, applyTermStatus } from '../src/state.mjs';
import { workspaceOf, branchProbe, worktreeList } from '../src/git.mjs';
import { DeliveryQueue } from '../src/delivery.mjs';
import { Branch, boardSkill } from '../src/branch.mjs';
import { mergeVerdict, workCwd } from '../src/merger.mjs';
import { childWtPlan, childWtDir, omoMainWarning, omoBranchNote, boardMakesWorktree } from '../src/child-worktree.mjs';
import { VERBS } from '../src/cli-contract.mjs';

const tmp = (p = 'mtask-p382-') => fs.mkdtempSync(path.join(os.tmpdir(), p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const G = (dir, ...a) => execFileSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'commit.gpgsign=false', ...a], { encoding: 'utf8', windowsHide: true }).trim();
const slash = (p) => String(p).split(path.sep).join('/');
const same = (a, b) => slash(path.resolve(a)).toLowerCase() === slash(path.resolve(b)).toLowerCase();

function repo() {
  const dir = tmp();
  G(dir, 'init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(dir, 'a.txt'), 'a\n');
  G(dir, 'add', '.'); G(dir, 'commit', '-q', '-m', 'init');
  return dir;
}

async function board({ dir = repo(), spawnFail = false } = {}) {
  const store = new Store(path.join(tmp('mtask-p382db-'), 'board.db'));
  const ws = await workspaceOf(dir);
  try { store.insertWorkspace({ ...ws, createdAt: 1 }); } catch {}
  const cfg = { profile: 'dev', terminalSession: 'atrium-dev-p382test', port: 0, dataDir: dir, sessionsDir: path.join(dir, 'sessions'), inputQuietMs: 3000, submitConfirmMs: 3000, deliveryMaxWaitMs: 60000, submitRetries: 0 };
  const b = {
    cfg, apiToken: 't', store, sessions: new Map(), bus: new EventEmitter(), killing: new Set(), spawned: [], fail: spawnFail,
    api: { broadcast: () => {} }, log: () => {}, requireTerminal: () => {},
    adapter: { backend: 'hc', connected: true, readScreen: async () => '' },
    hooked: (s) => s.rt.hooked !== false,
    summary: (s) => { const d = deriveState(s.rt); return { state: d.state, ask: d.ask || null, error: d.error || null }; },
    ensureLink(from, to, patch = {}) { let l = store.linkByPair(from, to); if (!l) { l = { linkId: 'l' + crypto.randomBytes(4).toString('hex'), from, to, role: patch.role ?? null, spawned: !!patch.spawned, observed: false, createdAt: Date.now() }; store.insertLink(l); } return store.getLink(l.linkId); },
    linkEvent(l, kind, text = null, data = null) { return store.addLinkEvent(l.linkId, kind, text, data); },
    broadcastSession(s) { if (b.sessions.has(s.sessionId)) b.bus.emit('session', s, b.summary(s)); },
    async spawn(p) {
      b.spawned.push(p);
      if (b.fail) throw Object.assign(new Error('터미널이 띄우지 못했다'), { code: 'spawn_failed' });
      const s = add(p.name, { kind: p.kind || (p.launcherDef && p.launcherDef.harness) || 'claude', parentSessionId: p.parentSessionId || null, cwd: p.cwd });
      if (p.branch) b.branch.noteChild(s.sessionId, p.branch);
      return { sessionId: s.sessionId, trust: { needsTrust: false } };
    },
    closeSession(s) { b.sessions.delete(s.sessionId); },
  };
  b.queue = new DeliveryQueue({ store, cfg, view: (sid) => { const s = b.sessions.get(sid); if (!s) return { closed: true }; return { state: deriveState(s.rt).state, agentPresent: true, termConnected: true, lastUserInputAt: 0, closed: false, kind: s.kind, hooked: b.hooked(s) }; }, send: async () => {} });
  b.branch = new Branch(b, { readyWaitMs: 30, submitWaitMs: 10, noticeBatchMs: 20 });
  const add = (name, { kind = 'claude', ...extra } = {}) => {
    const s = { sessionId: crypto.randomUUID(), name, cwd: dir, paneId: name + ':p1', agentName: name, permissionMode: 'manual', kind, origin: 'board', parentSessionId: null, workspaceKey: ws.key, rt: newRuntime({ kind, hooked: kind === 'claude' }), createdAt: Date.now(), ...extra };
    s.rt.term.present = true; s.rt.phase = 'running'; applyTermStatus(s.rt, 'idle');
    store.insertSession({ ...s, settingsPath: '', hookToken: '', runtime: s.rt });
    b.sessions.set(s.sessionId, s);
    return s;
  };
  return { b, dir, ws, add, stop: async () => { b.queue.stop(); b.branch.notices.stop(); await sleep(50); store.close(); } };
}
const wtOf = async (dir, branch) => (await worktreeList(dir)).find((w) => w.branch === branch) || null;

// ---------- 순수 함수 ----------
test('P382 childWtPlan: 새 이름은 -b로 만들고, 살아 있는 같은 이름 워크트리는 다시 쓰고, 브랜치만 있으면 그 브랜치로, 워크트리 아닌 폴더는 막는다', () => {
  const root = path.join(os.tmpdir(), 'r382');
  const p = childWtPlan({ root, name: 'om' });
  assert.equal(p.via, 'add'); assert.equal(p.branch, 'worktree-om'); assert.equal(p.newBranch, true);
  assert.equal(p.dir, childWtDir(root, 'om'));
  assert.deepEqual(p.git, ['-C', root, 'worktree', 'add', '-b', 'worktree-om', childWtDir(root, 'om'), 'HEAD']);
  const c = childWtPlan({ root, cwd: path.join(root, 'sub'), name: 'om' });
  assert.equal(c.git[1], path.join(root, 'sub'), '기준은 부모 폴더의 HEAD(-C 부모 폴더)');
  const other = 'E:/elsewhere/om';
  assert.deepEqual(childWtPlan({ root, name: 'om', live: [{ path: slash(root), branch: 'main', main: true }, { path: other, branch: 'worktree-om' }] }), { via: 'reuse', dir: other, branch: 'worktree-om' });
  assert.equal(childWtPlan({ root, name: 'om', live: [{ path: other, branch: 'worktree-om', prunable: true }] }).via, 'add', '지워진(prunable) 워크트리는 다시 쓰지 않는다');
  const b = childWtPlan({ root, name: 'om', branchExists: true });
  assert.equal(b.newBranch, false); assert.deepEqual(b.git.slice(-2), [childWtDir(root, 'om'), 'worktree-om']);
  assert.equal(childWtPlan({ root, name: 'om', dirExists: true }).via, 'blocked');
  assert.equal(boardMakesWorktree('claude'), false); assert.equal(boardMakesWorktree('omo'), true); assert.equal(boardMakesWorktree('codex'), true);
});

test('P382 omoMainWarning·omoBranchNote: omo만, 주 체크아웃이고 --worktree가 없을 때만 경고. 브랜치 표시는 --worktree omo만', () => {
  const main = { isRepo: true, isWorktree: false, branch: 'main' };
  assert.match(omoMainWarning({ kind: 'omo', probe: main }), /^경고: omo 하위가 주 체크아웃\(main\)에서 뜬다\. .*체크아웃된 브랜치에 .*직접 합치므로 검토 없이 main에 합쳐진다\. .*--worktree <이름>/);
  assert.equal(omoMainWarning({ kind: 'omo', worktree: 'om', probe: main }), null);
  assert.equal(omoMainWarning({ kind: 'omo', probe: { ...main, isWorktree: true } }), null, '연결 워크트리(부모의 워크트리)는 경고하지 않는다');
  assert.equal(omoMainWarning({ kind: 'omo', probe: { isRepo: false } }), null);
  assert.equal(omoMainWarning({ kind: 'codex', probe: main }), null);
  assert.equal(omoMainWarning({ kind: 'claude', probe: main }), null);
  assert.match(omoBranchNote({ kind: 'omo', branch: 'worktree-om', name: 'om' }), /^브랜치 worktree-om는 @om가 done으로 닫을 때까지 OMO가 쓴다.*커밋하거나 병합하지 않는다/);
  assert.equal(omoBranchNote({ kind: 'codex', branch: 'worktree-cx' }), null);
});

// ---------- spawnChild ----------
test('P382 --kind omo --worktree: 판이 git worktree add로 <리포>/.claude/worktrees/<이름>(브랜치 worktree-<이름>)을 만들고 그 폴더에서 띄운다(claude -w 인자 없음)', async () => {
  const { b, dir, add, stop } = await board();
  try {
    const lead = add('lead');
    const r = await b.branch.spawnChild(lead, { name: 'om', kind: 'omo', worktree: 'om', prompt: '고쳐라', wait: false });
    const want = path.join(dir, '.claude', 'worktrees', 'om');
    assert.equal(b.spawned.length, 1);
    assert.ok(same(b.spawned[0].cwd, want), b.spawned[0].cwd);
    assert.equal(b.spawned[0].worktree, null, '다른 하네스에 claude -w 인자를 넘기지 않는다');
    assert.equal(b.spawned[0].branch.worktree, 'om', '가지 기록의 워크트리 이름(상자·자리 잡기)은 남는다');
    assert.equal(b.spawned[0].branch.wtVia, 'git');
    const w = await wtOf(dir, 'worktree-om');
    assert.ok(w && same(w.path, want), '브랜치 worktree-om의 워크트리가 생겼다');
    assert.equal(G(want, 'rev-parse', 'HEAD'), G(dir, 'rev-parse', 'HEAD'), '기준은 부모 폴더의 HEAD');
    assert.equal(r.worktreeVia, 'git'); assert.equal(r.worktreeBranch, 'worktree-om'); assert.equal(r.worktreeReused, false);
    assert.ok(same(r.cwd, want)); assert.ok(same(r.worktreePath, want));
    assert.equal(r.warning, null);
    assert.match(r.branchNote, /브랜치 worktree-om는 @om가 done으로 닫을 때까지 OMO가 쓴다/);
    assert.match(r.notice, /브랜치 worktree-om는 @om가 done으로/, '판 알림에도 같은 줄');
  } finally { await stop(); }
});

test('P382 같은 이름의 워크트리가 이미 있으면 다시 쓰고, 브랜치만 남았으면 그 브랜치로 만든다. 워크트리가 아닌 같은 이름 폴더는 띄우지 않는다', async () => {
  const { b, dir, add, stop } = await board();
  try {
    const lead = add('lead');
    const wt = path.join(dir, '.claude', 'worktrees', 'om');
    G(dir, 'worktree', 'add', '-q', '-b', 'worktree-om', wt, 'main');
    const r = await b.branch.spawnChild(lead, { name: 'om2', kind: 'omo', worktree: 'om', wait: false });
    assert.equal(r.worktreeReused, true); assert.ok(same(b.spawned[0].cwd, wt));
    // 브랜치만 남음
    G(dir, 'branch', 'worktree-cx', 'main');
    const c = await b.branch.spawnChild(lead, { name: 'cx', kind: 'codex', worktree: 'cx', wait: false });
    assert.equal(c.worktreeReused, false); assert.equal(c.worktreeVia, 'git');
    assert.ok(await wtOf(dir, 'worktree-cx'));
    assert.equal(c.branchNote, null, 'codex는 OMO 브랜치 표시가 없다');
    // 워크트리가 아닌 폴더
    fs.mkdirSync(path.join(dir, '.claude', 'worktrees', 'junk'), { recursive: true });
    const n = b.spawned.length;
    await assert.rejects(b.branch.spawnChild(lead, { name: 'jk', kind: 'omo', worktree: 'junk', wait: false }), (e) => e.code === 'name_taken');
    assert.equal(b.spawned.length, n);
  } finally { await stop(); }
});

test('P382 띄우기가 실패하면 판이 만든 워크트리와 새 브랜치를 지운다', async () => {
  const { b, dir, add, stop } = await board({ spawnFail: true });
  try {
    const lead = add('lead');
    await assert.rejects(b.branch.spawnChild(lead, { name: 'om', kind: 'omo', worktree: 'om', wait: false }), (e) => e.code === 'spawn_failed');
    assert.equal(await wtOf(dir, 'worktree-om'), null);
    assert.equal(fs.existsSync(path.join(dir, '.claude', 'worktrees', 'om')), false);
    assert.equal(G(dir, 'branch', '--list', 'worktree-om'), '');
  } finally { await stop(); }
});

test('P382 omo를 --worktree 없이 주 체크아웃에서 띄우면 띄우되 응답·판 알림에 경고. 부모의 워크트리 안이면 경고 없음. Claude Code --worktree는 지금처럼 claude -w', async () => {
  const { b, dir, add, stop } = await board();
  try {
    const lead = add('lead');
    const r = await b.branch.spawnChild(lead, { name: 'om', kind: 'omo', wait: false });
    assert.equal(b.spawned.length, 1, '막지 않는다');
    assert.match(r.warning, /^경고: omo 하위가 주 체크아웃\(main\)에서 뜬다/);
    assert.match(r.notice, /경고: omo 하위가 주 체크아웃/);
    assert.equal(r.worktreeVia, null);
    const wt = path.join(dir, '.claude', 'worktrees', 'lw');
    G(dir, 'worktree', 'add', '-q', '-b', 'worktree-lw', wt, 'main');
    const lead2 = add('lead2', { cwd: wt });
    const r2 = await b.branch.spawnChild(lead2, { name: 'om3', kind: 'omo', wait: false });
    assert.equal(r2.warning, null);
    const before = (await worktreeList(dir)).length;
    const c = await b.branch.spawnChild(lead, { name: 'cw', worktree: 'cw', wait: false });
    assert.equal(b.spawned.at(-1).worktree, 'cw', 'Claude Code는 claude -w 그대로');
    assert.ok(same(b.spawned.at(-1).cwd, dir));
    assert.equal(c.worktreeVia, 'claude-w'); assert.equal(c.warning, null);
    assert.equal((await worktreeList(dir)).length, before, 'Claude Code에는 판이 워크트리를 만들지 않는다');
  } finally { await stop(); }
});

test('P382 omo --worktree 하위가 커밋한 뒤 done ok: merger 판정의 작업 폴더가 그 워크트리이고 브랜치 worktree-<이름>이 합칠 대상이다', async () => {
  const { b, dir, add, stop } = await board();
  try {
    const lead = add('lead');
    await b.branch.spawnChild(lead, { name: 'om', kind: 'omo', worktree: 'om', wait: false });
    const child = [...b.sessions.values()].find((x) => x.name === 'om');
    const cwd = workCwd(child);
    fs.writeFileSync(path.join(cwd, 'omo.txt'), 'wave\n');
    G(cwd, 'add', '.'); G(cwd, 'commit', '-q', '-m', 'omo wave');
    const probe = await branchProbe(cwd, 'main');
    assert.equal(probe.branch, 'worktree-om'); assert.equal(probe.isWorktree, true); assert.equal(probe.ahead, 1);
    const commonDir = G(dir, 'rev-parse', '--path-format=absolute', '--git-common-dir');
    const v = mergeVerdict({ mode: 'on', probe, repoCommonDir: commonDir, target: 'main', parentRoot: slash(dir) });
    assert.deepEqual(v, { route: true, why: 'ok', ask: false });
  } finally { await stop(); }
});

// ---------- 안내 글 ----------
test('P382 atrium 스킬과 계약의 --worktree 설명은 하네스와 상관없다', () => {
  const skill = boardSkill();
  assert.match(skill, /Claude Code는 `claude -w`, 다른 종류는 보드가 만든다/);
  assert.match(skill, /omo는 체크아웃된 브랜치에 직접 합치니 늘 `--worktree`로/);
  assert.doesNotMatch(skill, /Claude Code가 `claude -w`로 브랜치/);
  const child = VERBS.find((v) => v.name === 'child');
  assert.ok(child.args.includes('[--worktree 이름]'));
});
