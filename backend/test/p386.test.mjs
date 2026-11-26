// P386 단위 시험: 판 설정 "워크트리 위치"(worktreeRoot). 비우면 판이 만드는 워크트리는 지금처럼 <리포>/.claude/worktrees/<이름>,
//   채우면 <위치>/<리포 ID>/<이름>. 리포 ID는 사용자 WorktreeCreate hook과 같은 꼴(불변식: 같은 주 체크아웃이면 같은 ID).
//   다른 하네스의 atrium child --worktree(P382)와 빠른 워크트리 세션(P321)이 같은 자리를 쓰고, merger 판정·치우기가 새 자리에서도 된다.
//   진짜 git 저장소, 가짜 판(p382 시험의 틀). claude·hc 없이 돈다.
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
import { Branch } from '../src/branch.mjs';
import { mergeVerdict, workCwd } from '../src/merger.mjs';
import { childWtDir, childWtPlan, checkWtRoot, boardWtRoot } from '../src/child-worktree.mjs';
import { repoIdOf, cleanWtRoot, boardWtBase, boardWtPath, findClaudeWt } from '../src/worktree-names.mjs';
import { WorktreeSessions, launchPlan } from '../src/worktree-session.mjs';
import { normalizePatch, DEFAULTS } from '../src/settings.mjs';

const tmp = (p = 'mtask-p386-') => fs.mkdtempSync(path.join(os.tmpdir(), p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const G = (dir, ...a) => execFileSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'commit.gpgsign=false', ...a], { encoding: 'utf8', windowsHide: true }).trim();
const slash = (p) => String(p).split(path.sep).join('/');
const same = (a, b) => slash(path.resolve(a)).toLowerCase() === slash(path.resolve(b)).toLowerCase();
// 사용자 WorktreeCreate hook의 리포 ID 식(그 파일의 한 줄을 그대로 옮긴 것): resolve(repo).replace(/[:\\/]+/g, "_").replace(/^_+|_+$/g, "")
const hookRepoId = (repo) => path.resolve(repo).replace(/[:\\/]+/g, '_').replace(/^_+|_+$/g, '');

function repo() {
  const dir = tmp();
  G(dir, 'init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(dir, 'a.txt'), 'a\n');
  G(dir, 'add', '.'); G(dir, 'commit', '-q', '-m', 'init');
  return dir;
}

async function board({ dir = repo(), spawnFail = false, worktreeRoot = '' } = {}) {
  const store = new Store(path.join(tmp('mtask-p386db-'), 'board.db'));
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
  b.features = { settings: { get: () => ({ ...DEFAULTS, worktreeRoot }) } };
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
const mainRootOf = (dir) => path.dirname(G(dir, 'rev-parse', '--path-format=absolute', '--git-common-dir'));

// ---------- 리포 ID 불변식 ----------
test('P386 repoIdOf: 사용자 hook의 리포 ID 식과 같다(이 저장소의 주 체크아웃, git이 주는 꼴, 백슬래시·끝 슬래시 꼴)', () => {
  const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
  const main = mainRootOf(here); // 이 저장소의 주 체크아웃(워크트리에서 돌아도 본 저장소)
  const top = G(main, 'rev-parse', '--show-toplevel'); // hook이 받는 꼴(git이 준 경로)
  assert.equal(repoIdOf(top), hookRepoId(top), 'git이 준 주 체크아웃 경로');
  assert.equal(repoIdOf(slash(main)), hookRepoId(main));
  assert.equal(repoIdOf(path.resolve(main)), hookRepoId(main), '백슬래시 꼴');
  assert.equal(repoIdOf(slash(main) + '/'), hookRepoId(main + '/'), '끝 슬래시');
  for (const p of ['C:/Work/app', 'C:\\Work\\app\\', 'D:/a b/c-d.e', 'E:/x//y']) assert.equal(repoIdOf(p), hookRepoId(p), p);
  assert.equal(repoIdOf('C:/Work/app'), 'C_Work_app');
  assert.doesNotMatch(repoIdOf(top), /[:\\/]/);
});

test('P386 자리: 위치가 비면 <리포>/.claude/worktrees/<이름>(지금 그대로), 채우면 <위치>/<리포 ID>/<이름>. Claude Code(claude -w)는 바뀌지 않는다', () => {
  const root = 'C:/Work/app';
  assert.equal(boardWtBase(root, ''), 'C:/Work/app/.claude/worktrees/');
  assert.equal(boardWtPath(root, 'w1', ''), 'C:/Work/app/.claude/worktrees/w1');
  assert.equal(boardWtPath(root, 'w1', 'E:/worktrees'), 'E:/worktrees/C_Work_app/w1');
  assert.equal(boardWtPath(root, 'w1', 'E:\\worktrees\\'), 'E:/worktrees/C_Work_app/w1', '백슬래시·끝 슬래시');
  assert.equal(boardWtPath(root, 'w1', 'E:/'), 'E:/C_Work_app/w1', '드라이브 뿌리');
  assert.equal(boardWtPath('C:\\Work\\app\\', 'w1', 'E:/wt'), 'E:/wt/C_Work_app/w1');
  assert.equal(cleanWtRoot('  '), ''); assert.equal(cleanWtRoot('E:'), 'E:/');
  const r = path.join(os.tmpdir(), 'r386');
  assert.equal(childWtDir(r, 'w1'), path.join(r, '.claude', 'worktrees', 'w1'), '비면 P382 자리 그대로');
  assert.equal(childWtDir(r, 'w1', ''), path.join(r, '.claude', 'worktrees', 'w1'));
  assert.ok(same(childWtDir(r, 'w1', 'E:/worktrees'), 'E:/worktrees/' + repoIdOf(r) + '/w1'));
  const p = childWtPlan({ root: r, name: 'w1', wtRoot: 'E:/worktrees' });
  assert.equal(p.via, 'add'); assert.deepEqual(p.git, ['-C', r, 'worktree', 'add', '-b', 'worktree-w1', childWtDir(r, 'w1', 'E:/worktrees'), 'HEAD']);
  // 빠른 워크트리 세션
  assert.deepEqual(launchPlan({ kind: 'claude', root: r, name: 'q1', wtRoot: 'E:/worktrees' }), { via: 'claude-w', cwd: r, worktree: 'q1' }, 'claude -w는 위치를 따르지 않는다');
  const q = launchPlan({ kind: 'codex', root: r, name: 'q1', base: 'dev', wtRoot: 'E:/worktrees' });
  assert.ok(same(q.cwd, 'E:/worktrees/' + repoIdOf(r) + '/q1')); assert.deepEqual(q.git, ['-C', r, 'worktree', 'add', '-b', 'worktree-q1', q.cwd, 'dev']);
  assert.ok(same(launchPlan({ kind: 'codex', root: r, name: 'q1' }).cwd, path.join(r, '.claude', 'worktrees', 'q1')), '비면 그대로');
});

test('P386 설정 worktreeRoot: 기본 빈 값, 드라이브로 시작하는 절대 경로만 받는다. 드라이브가 없으면 띄우기를 거절한다', () => {
  assert.equal(DEFAULTS.worktreeRoot, '');
  for (const v of ['', 'E:/worktrees', 'E:\\worktrees', 'D:/a b/wt', 'E:/']) assert.equal(normalizePatch({ worktreeRoot: v }).worktreeRoot, v.trim());
  for (const v of ['worktrees', '../wt', 'E:/a:b', '\\\\server\\share', 'E:/a"b', 'E:wt']) assert.throws(() => normalizePatch({ worktreeRoot: v }), { code: 'bad_request' }, v);
  assert.throws(() => checkWtRoot('Q:/wt', () => false), { code: 'bad_worktree_root' });
  assert.doesNotThrow(() => checkWtRoot('', () => false), '비면 묻지 않는다');
  assert.equal(boardWtRoot({ features: { settings: { get: () => ({ worktreeRoot: 'E:\\wt\\' }) } } }), 'E:/wt');
  assert.equal(boardWtRoot({}), '');
});

// ---------- atrium child --worktree (다른 하네스) ----------
test('P386 --kind codex --worktree w1: 위치를 채우면 <위치>/<리포 ID>/w1에 만들고(없는 폴더도) 그 폴더에서 띄운다 → 커밋 → merger 판정 ok → 치우기', async () => {
  const wtRoot = slash(path.join(tmp('mtask-p386root-'), 'wt')); // 아직 없는 폴더(git이 만든다)
  const { b, dir, add, stop } = await board({ worktreeRoot: wtRoot });
  try {
    const lead = add('lead');
    const r = await b.branch.spawnChild(lead, { name: 'w1', kind: 'codex', worktree: 'w1', prompt: '고쳐라', wait: false });
    const main = mainRootOf(dir);
    const want = path.join(wtRoot, hookRepoId(G(main, 'rev-parse', '--show-toplevel')), 'w1');
    assert.ok(same(b.spawned[0].cwd, want), b.spawned[0].cwd + ' vs ' + want);
    assert.equal(b.spawned[0].worktree, null);
    assert.ok(same(r.worktreePath, want)); assert.equal(r.worktreeBranch, 'worktree-w1');
    assert.equal(fs.existsSync(path.join(dir, '.claude', 'worktrees', 'w1')), false, '저장소 안에는 만들지 않는다');
    const w = await wtOf(dir, 'worktree-w1');
    assert.ok(w && same(w.path, want), '브랜치 worktree-w1의 워크트리가 위치 아래에');
    assert.ok(findClaudeWt(await worktreeList(dir), 'w1'), '판은 브랜치로 찾는다(상자·merger·치우기의 길)');
    // 커밋 → merger 판정
    const child = [...b.sessions.values()].find((s) => s.name === 'w1');
    const cwd = workCwd(child);
    assert.ok(same(cwd, want));
    fs.writeFileSync(path.join(cwd, 'w1.txt'), 'w1\n');
    G(cwd, 'add', '.'); G(cwd, 'commit', '-q', '-m', 'w1');
    const probe = await branchProbe(cwd, 'main');
    assert.equal(probe.branch, 'worktree-w1'); assert.equal(probe.isWorktree, true); assert.equal(probe.ahead, 1);
    const commonDir = G(dir, 'rev-parse', '--path-format=absolute', '--git-common-dir');
    assert.deepEqual(mergeVerdict({ mode: 'on', probe, repoCommonDir: commonDir, target: 'main', parentRoot: slash(dir) }), { route: true, why: 'ok', ask: false });
    // 합친 뒤(merger가 하는 기계적 일) 판의 치우기(removeDirect)가 그 자리를 지운다
    G(dir, 'merge', '--no-ff', '-q', '-m', 'merge w1', 'worktree-w1');
    const ws = new WorktreeSessions({ log: () => {} });
    const out = await ws.removeDirect({ root: slash(dir), path: slash(probe.root), branch: 'worktree-w1', keepBranch: false, force: false }, { tries: 3, waitMs: 200 });
    assert.deepEqual(out, { removed: true, branchDeleted: true, error: null });
    assert.equal(fs.existsSync(want), false); assert.equal(await wtOf(dir, 'worktree-w1'), null);
  } finally { await stop(); }
});

test('P386 위치를 비우면 다른 하네스의 --worktree는 지금처럼 저장소 안 .claude/worktrees', async () => {
  const { b, dir, add, stop } = await board({ worktreeRoot: '' });
  try {
    const r = await b.branch.spawnChild(add('lead'), { name: 'w2', kind: 'omo', worktree: 'w2', prompt: '고쳐라', wait: false });
    assert.ok(same(r.worktreePath, path.join(dir, '.claude', 'worktrees', 'w2')));
  } finally { await stop(); }
});

test('P386 위치의 드라이브가 없으면 띄우지 않고 까닭을 돌려준다(저장소 안으로 돌아가지 않는다)', async () => {
  const missing = ['Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y'].find((d) => !fs.existsSync(d + ':/'));
  if (!missing) return;
  const { b, dir, add, stop } = await board({ worktreeRoot: missing + ':/wt' });
  try {
    await assert.rejects(b.branch.spawnChild(add('lead'), { name: 'w3', kind: 'codex', worktree: 'w3', prompt: 'x', wait: false }), { code: 'bad_worktree_root' });
    assert.equal(b.spawned.length, 0);
    assert.equal(await wtOf(dir, 'worktree-w3'), null);
    assert.equal(fs.existsSync(path.join(dir, '.claude', 'worktrees', 'w3')), false);
  } finally { await stop(); }
});

// ---------- 빠른 워크트리 세션 ----------
test('P386 빠른 워크트리 세션(codex): 미리 보기의 boardBase, 위치 아래에 만들고 그 폴더에서 띄움, 같은 이름 폴더면 dir_exists', async () => {
  const dir = repo();
  const wtRoot = slash(path.join(tmp('mtask-p386qroot-'), 'wt'));
  const spawned = []; const sessions = new Map(); const events = [];
  const b = {
    sessions, spawned, cfg: {}, log: () => {}, bus: null, worktrees: null, branch: null,
    features: { settings: { get: () => ({ ...DEFAULTS, worktreeRoot: wtRoot }) } },
    store: { getWorkspace: () => null, addEvent: (...a) => events.push(a) },
    resolveWorkspace: async () => ({ key: 'k', kind: 'repo', root: dir }),
    async spawn(p) { spawned.push(p); const s = { sessionId: 's' + spawned.length, name: p.name, cwd: p.cwd, rt: {} }; sessions.set(s.sessionId, s); return { sessionId: s.sessionId }; },
  };
  const ws = new WorktreeSessions(b);
  const pv = await ws.preview({ workspace: 'k', name: 'q1' });
  const base = wtRoot + '/' + repoIdOf(dir) + '/';
  assert.equal(pv.boardBase, base); assert.equal(pv.problem, null);
  const r = await ws.create({ workspace: 'k', name: 'q1', kind: 'codex' });
  assert.equal(r.worktree.via, 'git');
  assert.ok(same(spawned[0].cwd, base + 'q1')); assert.ok(same(r.worktree.path, base + 'q1'));
  const w = await wtOf(dir, 'worktree-q1');
  assert.ok(w && same(w.path, base + 'q1'));
  // 같은 이름: 브랜치도 있고 폴더도 있다(세션 이름 쓰임은 빼고 본다)
  sessions.clear();
  assert.ok(['dir_exists', 'branch_exists'].includes(await ws.nameProblem(dir, 'q1')));
  fs.mkdirSync(base + 'q2', { recursive: true });
  assert.equal(await ws.nameProblem(dir, 'q2'), 'dir_exists', '위치 아래 같은 이름 폴더');
  const pv2 = await ws.preview({ workspace: 'k' });
  assert.notEqual(pv2.name, 'q2');
  // 위치를 비우면 미리 보기에 boardBase가 없다(창은 .claude/worktrees/<이름>을 보인다)
  b.features.settings.get = () => ({ ...DEFAULTS, worktreeRoot: '' });
  assert.equal((await ws.preview({ workspace: 'k', name: 'q3' })).boardBase, null);
  G(dir, 'worktree', 'remove', '--force', base + 'q1');
});
