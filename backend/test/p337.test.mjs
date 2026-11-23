// P337 시험: claude -w 워크트리가 저장소 폴더 밖(사용자 WorktreeCreate hook이 다른 드라이브에 만든 자리)에 있어도
// 판이 브랜치 worktree-<이름>으로 알아보고(영역·워커 자리·나가기 질문·대화 블록 이름·띄움 맞추기·이름 쓰임·시험 폴더), 띄우자마자 오류로 끝난 claude -w의
// 끝 화면 문장을 신뢰 거부로 짐작하지 않고 그대로 보인다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { NODE } from '../src/canvas.mjs';
import { Store } from '../src/store.mjs';
import { newRuntime, exitKind, applyAgentReleased, applyExitText, launchErrorOf } from '../src/state.mjs';
import { Backend } from '../src/backend.mjs';
import * as ops from '../src/canvas-ops.mjs';
import { Branch } from '../src/branch.mjs';
import { pathKey, normPath } from '../src/workspaces.mjs';
import { attachWorktrees } from '../src/worktrees.mjs';
import { areaKey, parseWorktreeList, worktreeOfPath } from '../src/worktree-areas.mjs';
import { claudeWtDirName, claudeWtName, isClaudeWt, findClaudeWt, wtFolderTaken } from '../src/worktree-names.mjs';
import { worktreeOf } from '../src/worktree-exit.mjs';
import { matchSpawns } from '../src/spawns.mjs';
import { codeRootsOf } from '../src/config.mjs';
import { testDirKind } from '../src/missed.mjs';
import { WorktreeSessions } from '../src/worktree-session.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-p337-'));
const R = (x, y, w = NODE.w, h = NODE.h) => ({ x, y, w, h });
const REPO = 'C:/repo';
const OUT = (n) => `E:/worktrees/C_repo/${n}`; // hook이 만든 자리(저장소 밖, 다른 드라이브)
const IN = (n) => `${REPO}/.claude/worktrees/${n}`;

test('P337 이름: 브랜치 worktree-<이름>이 먼저, 폴더 꼴(.claude/worktrees/<이름>)은 한 경우', () => {
  assert.equal(claudeWtDirName('C:/r/.claude/worktrees/a'), 'a');
  assert.equal(claudeWtDirName('C:\\r\\.claude\\worktrees\\a\\sub'), 'a');
  assert.equal(claudeWtDirName(OUT('a')), null);
  assert.equal(claudeWtName({ path: OUT('w1'), branch: 'worktree-w1' }), 'w1');
  assert.equal(claudeWtName({ path: OUT('w1'), branch: 'refs/heads/worktree-w1' }), 'w1');
  assert.equal(claudeWtName({ path: IN('x'), branch: 'feature' }), 'x', '사람이 만든 브랜치라도 기본 자리면 그 이름');
  assert.equal(claudeWtName({ path: 'D:/elsewhere/y', branch: 'feature' }), null);
  assert.ok(isClaudeWt({ key: pathKey(OUT('W1')), branch: 'worktree-W1' }, 'w1'));
  const list = parseWorktreeList([`worktree ${REPO}`, 'branch refs/heads/main', '', `worktree ${IN('w2')}`, 'branch refs/heads/other', '', `worktree ${OUT('w2b')}`, 'branch refs/heads/worktree-w2', ''].join('\n'));
  assert.equal(findClaudeWt(list, 'w2').path, OUT('w2b'), '브랜치로 맞는 것이 폴더 꼴보다 먼저');
  assert.equal(findClaudeWt(list, 'nope'), null);
  assert.ok(wtFolderTaken(list, 'W2B'));
  assert.ok(!wtFolderTaken(list, 'repo'), '본 저장소는 이름 쓰임에 넣지 않는다');
});

test('P337 영역: 저장소 밖 워크트리 안의 폴더도 그 워크트리 상자다(가장 긴 경로)', () => {
  const wts = [{ key: pathKey(OUT('w1')) }, { key: pathKey(IN('w2')) }];
  assert.equal(worktreeOfPath(OUT('w1') + '/backend', wts, pathKey(REPO)), pathKey(OUT('w1')));
  assert.equal(worktreeOfPath(OUT('w10'), wts, pathKey(REPO)), '', '이름 앞부분만 같은 폴더는 아니다');
  assert.equal(worktreeOfPath(REPO + '/src', wts, pathKey(REPO)), '');
});

// 가짜 백엔드(p78.test.mjs와 같은 꼴). 워크트리는 hook 자리(E:/worktrees/C_repo/<이름>)에 생긴다
function board() {
  const b = new Backend({ quietMs: 600000, port: 0, logDir: tmp() });
  b.store = new Store(path.join(tmp(), 'board.db'));
  b.sessions = new Map();
  b.api = { broadcast: () => {} };
  b.log = () => {}; b.touch = () => {};
  b.broadcastWorkspaces = () => {};
  b.bus ??= new EventEmitter();
  const ws = { key: pathKey(`${REPO}/.git`), root: normPath(REPO) };
  b.store.insertWorkspace({ key: ws.key, kind: 'repo', root: ws.root, createdAt: 1 }); b.store.setWorkspaceAnchor(ws.key, 0, 0);
  const state = { wts: [] };
  const porcelain = () => [`worktree ${REPO}`, 'HEAD 1', 'branch refs/heads/main', '', ...state.wts.flatMap((n) => [`worktree ${OUT(n)}`, 'HEAD 2', `branch refs/heads/worktree-${n}`, ''])].join('\n');
  b.worktrees = attachWorktrees(b, { tickMs: 0, list: async (root) => (normPath(root) === normPath(REPO) ? porcelain() : null), exists: () => true });
  b.branch = new Branch(b);
  let clock = 1000;
  const add = (name, rect, extra = {}) => {
    const s = { sessionId: 'id-' + name, name, kind: 'claude', workspaceKey: ws.key, cwd: REPO, rt: newRuntime({ kind: 'claude' }), origin: 'board', createdAt: clock++, ...extra };
    b.sessions.set(s.sessionId, s);
    b.store.insertSession({ ...s, permissionMode: 'manual', runtime: s.rt });
    if (rect) b.store.setNode({ session_id: s.sessionId, ...rect, z: 0 });
    return s;
  };
  const kid = (parent, name, { worktree = null } = {}) => {
    const at = b.branch.placeChild(parent.sessionId, ws.key, { worktree });
    const s = add(name, null, { parentSessionId: parent.sessionId });
    b.branch.noteChild(s.sessionId, { role: '워커', depth: 2, by: parent.sessionId, at: s.createdAt, order: b.branch.nextOrder(parent.sessionId), worktree, ...(worktree ? { wtHome: 1 } : {}) });
    b.store.setNode({ session_id: s.sessionId, x: at.x, y: at.y, w: at.w, h: at.h, z: 0, size: at.size, aspect: at.aspect, area: at.area });
    ops.reflowLines(b, s.sessionId, 'spawn');
    ops.settleRegions(b, 'spawn');
    return s;
  };
  return { b, ws, add, kid, state };
}
const nodeOf = (b, name) => b.store.nodes().find((n) => n.session_id === 'id-' + name);

test('P337 판: --worktree 워커는 저장소 밖에 생긴 자기 워크트리(브랜치 worktree-<이름>)의 상자에 hook 전에도 든다', async () => {
  const { b, ws, add, kid, state } = board();
  const lead = add('lead', R(40, 112));
  kid(lead, 'w1', { worktree: 'w1' });
  kid(lead, 'w2', { worktree: 'w2' });
  await b.worktrees.sync('t');
  assert.equal(nodeOf(b, 'w1').area || '', '', '워크트리가 생기기 전에는 옮기지 않는다');
  state.wts = ['w1', 'w2'];
  await b.worktrees.sync('t');
  assert.equal(nodeOf(b, 'w1').area, pathKey(OUT('w1')), 'w1은 E: 워크트리 상자');
  assert.equal(nodeOf(b, 'w2').area, pathKey(OUT('w2')), 'w2는 자기 상자(다른 워크트리에 들지 않는다)');
  const areas = b.worktrees.view(ws.key).map((a) => a.area);
  assert.ok(areas.includes(areaKey(ws.key, pathKey(OUT('w1')))) && areas.includes(areaKey(ws.key, pathKey(OUT('w2')))));
  // hook이 워크트리 안의 하위 폴더를 알려도 그 상자
  b.sessions.get('id-w1').rt.cwd = OUT('w1') + '/backend';
  await b.worktrees.sync('t');
  assert.equal(nodeOf(b, 'w1').area, pathKey(OUT('w1')));
  assert.equal(b.worktrees.areaOf(ws.key, OUT('w2') + '/app'), pathKey(OUT('w2')));
  // 워크트리를 치우면 상자도 없어진다
  state.wts = ['w2'];
  b.sessions.get('id-w1').rt.cwd = REPO;
  await b.worktrees.sync('t');
  assert.ok(!b.worktrees.view(ws.key).some((a) => a.wt === pathKey(OUT('w1'))), '지운 워크트리의 상자는 없다');
  assert.ok(b.worktrees.view(ws.key).some((a) => a.wt === pathKey(OUT('w2'))));
});

test('P337 나가기 질문: 저장소 밖 claude -w 세션도 워크트리 세션으로 본다(info·빠른 세션·git 브랜치·옛 폴더 꼴)', () => {
  const base = { kind: 'claude', rt: { cwd: OUT('w1') }, cwd: REPO };
  assert.deepEqual(worktreeOf(base, { worktree: 'w1' }), { name: 'w1' });
  assert.deepEqual(worktreeOf({ ...base, quickWorktree: { name: 'q1', via: 'claude-w' } }), { name: 'q1' });
  assert.equal(worktreeOf({ ...base, quickWorktree: { name: 'g1', via: 'git' } }), null, '판이 git으로 만든 것(다른 하네스)은 claude -w가 아니다');
  assert.deepEqual(worktreeOf({ ...base, git: { isWorktree: true, branch: 'worktree-w1' } }), { name: 'w1' });
  assert.equal(worktreeOf({ ...base, git: { isWorktree: true, branch: 'feature' } }), null);
  assert.equal(worktreeOf({ ...base, git: { isWorktree: false, branch: 'worktree-w1' } }), null);
  assert.deepEqual(worktreeOf({ kind: 'claude', rt: { cwd: IN('old') }, cwd: REPO }), { name: 'old' });
  assert.equal(worktreeOf({ kind: 'codex', rt: { cwd: OUT('w1') }, git: { isWorktree: true, branch: 'worktree-w1' } }), null);
});

test('P337 띄움 맞추기: --worktree 띄움의 자식 대화는 hook 자리(…/worktrees/<리포>/<이름>)의 대화도 된다', () => {
  const at = 1_000_000;
  const parent = { convId: 'P', cwd: REPO, startAt: at - 60000, spawns: [{ kind: 'start', at, worktree: 'w1', via: 'atrium-child', name: 'w1' }] };
  const kidOut = { convId: 'K', cwd: OUT('w1'), startAt: at + 3000 };
  const other = { convId: 'X', cwd: OUT('w2'), startAt: at + 2000 };
  const m = matchSpawns([parent, kidOut, other]);
  assert.equal(m.get('K') && m.get('K').by, 'worktree');
  assert.ok(!m.has('X'), '다른 이름의 워크트리는 아니다');
  const m2 = matchSpawns([parent, { convId: 'K2', cwd: IN('w1'), startAt: at + 3000 }]);
  assert.equal(m2.get('K2') && m2.get('K2').by, 'worktree', '기본 자리도 그대로');
  const m3 = matchSpawns([parent, { convId: 'K3', cwd: 'D:/proj/w1', startAt: at + 3000 }]);
  assert.ok(!m3.has('K3'), 'worktrees 마디가 없는 같은 이름 폴더는 아니다');
});

test('P337 대화 블록 이름: 저장소 밖 워크트리의 하위 폴더 대화는 그 워크트리 이름(브랜치)', async () => {
  const { b, ws, state } = board();
  state.wts = ['w1'];
  await b.worktrees.sync('t');
  const { Recall } = await import('../src/recall.mjs');
  const blockOf = Recall.prototype.blockOf;
  assert.ok(blockOf, 'recall의 blockOf');
  const self = { b };
  const w = { key: ws.key, kind: 'repo', root: REPO };
  assert.equal(blockOf.call(self, { cwd: OUT('w1') + '/backend' }, w), 'w1');
  assert.equal(blockOf.call(self, { cwd: IN('w9') + '/x' }, w), 'w9');
  assert.equal(blockOf.call(self, { cwd: REPO + '/src' }, w), '');
  assert.equal(blockOf.call(self, { cwd: 'D:/clone/thing' }, w), 'thing', '목록에 없는 밖의 폴더는 지금처럼 폴더 이름');
});

test('P337 이름 쓰임: hook 자리의 같은 이름 워크트리 폴더도 dir_exists, 미리 보기 자동 이름은 그것을 피한다', async () => {
  const root = tmp();
  const live = [{ path: 'E:/worktrees/x/wt-taken', key: 'e:/worktrees/x/wt-taken', branch: 'something', main: false }];
  const b = { sessions: new Map(), worktrees: { live: () => live }, store: { getWorkspace: () => ({ key: 'k', kind: 'repo', root }) }, resolveWorkspace: async () => ({ key: 'k', kind: 'repo', root }), log: () => {} };
  const w = new WorktreeSessions(b);
  assert.equal(await w.nameProblem(root, 'wt-taken', 'k'), 'dir_exists');
  assert.equal(await w.nameProblem(root, 'fresh', 'k'), null);
  const d = new Date(2026, 10, 23);
  live.push({ path: 'E:/worktrees/x/wt-1123-a', key: 'e:/worktrees/x/wt-1123-a', branch: 'worktree-wt-1123-a', main: false });
  const RealDate = Date;
  globalThis.Date = class extends RealDate { constructor(...a) { super(...(a.length ? a : [d.getTime()])); } static now() { return d.getTime(); } };
  try { const p = await w.preview({ workspace: 'k' }); assert.equal(p.name, 'wt-1123-b', '다른 자리에 있는 wt-1123-a를 피한다'); }
  finally { globalThis.Date = RealDate; }
});

test('P337 시험 폴더: 코드 저장소의 다른 체크아웃(저장소 밖 워크트리 포함)도 codeRoots에 든다', () => {
  const files = {
    'E:/wt/r/p1/.git': 'gitdir: C:/code/.git/worktrees/p1\n',
    'C:/code/.git/worktrees/p1/commondir': '../..\n',
    'C:/code/.git/worktrees/p1/gitdir': 'E:/wt/r/p1/.git\n',
    'C:/code/.git/worktrees/p2/gitdir': 'E:/wt/r/p2/.git\n',
    'C:/code/.git/worktrees/old/gitdir': 'C:/code/.claude/worktrees/old/.git\n',
  };
  const k = (p) => path.resolve(p).replace(/\\/g, '/').toLowerCase();
  const map = new Map(Object.entries(files).map(([p, v]) => [k(p), v]));
  const read = (p) => { const v = map.get(k(p)); if (v == null) throw new Error('ENOENT'); return v; };
  const list = (p) => { if (k(p) === k('C:/code/.git/worktrees')) return ['p1', 'p2', 'old']; throw new Error('ENOENT'); };
  const isDir = (p) => k(p) === k('C:/code/.git');
  const roots = codeRootsOf('E:/wt/r/p1', { read, list, isDir }).map(k);
  for (const want of ['E:/wt/r/p1', 'C:/code', 'E:/wt/r/p2', 'C:/code/.claude/worktrees/old']) assert.ok(roots.includes(k(want)), want + ' 가 codeRoots에 든다');
  const fromMain = codeRootsOf('C:/code', { read, list, isDir }).map(k);
  assert.ok(fromMain.includes(k('E:/wt/r/p2')), '본 저장소에서 띄운 판도 저장소 밖 워크트리를 안다');
  assert.equal(testDirKind('E:/wt/r/p2/backend/.dev/x', { codeRoots: codeRootsOf('C:/code', { read, list, isDir }) }), 'code');
  assert.deepEqual(codeRootsOf('Z:/none', { read: () => { throw new Error('x'); }, list: () => [], isDir: () => false }), ['Z:/none'], '못 읽으면 그 폴더만');
});

test('P337 끝 화면 오류: 띄우자마자 끝난 claude -w의 오류 문장을 짐작한 신뢰 거부 대신 붙인다', () => {
  const screen = ['', ' ▐▛███▜▌', 'Cannot create worktree: E:\\worktrees\\r\\w1 is a symlink', '', 'PS C:\\repo>'].join('\n');
  assert.equal(launchErrorOf(screen), 'Cannot create worktree: E:\\worktrees\\r\\w1 is a symlink');
  assert.equal(launchErrorOf('Error: fatal: invalid reference: main\n$ '), 'Error: fatal: invalid reference: main');
  assert.equal(launchErrorOf('hello\nworld\n'), null);
  // 띄운 뒤 hook 없이 끝남 → 짐작한 신뢰 거부(guessed)
  const rt = newRuntime({ kind: 'claude' });
  rt.term.present = true; rt.term.launchPending = true; rt.hooksSinceLaunch = 0;
  applyAgentReleased(rt, 5000, { exitCode: 1 });
  assert.equal(rt.exit.kind, 'trust_declined');
  assert.equal(rt.exit.guessed, true);
  assert.ok(applyExitText(rt, screen));
  assert.equal(rt.exit.kind, 'other', '오류 문장이 있으면 오류 끝남');
  assert.equal(rt.exit.error, 'Cannot create worktree: E:\\worktrees\\r\\w1 is a symlink');
  assert.ok(!applyExitText(rt, screen), '한 번만');
  // 신뢰 얘기인 오류는 신뢰 거부로 두고 문장만 붙인다
  const rt2 = newRuntime({ kind: 'claude' }); rt2.term.present = true; rt2.term.launchPending = true;
  applyAgentReleased(rt2, 5000, {});
  assert.ok(applyExitText(rt2, 'Error: Workspace trust not yet accepted\n'));
  assert.equal(rt2.exit.kind, 'trust_declined'); assert.equal(rt2.exit.error, 'Error: Workspace trust not yet accepted');
  // 신뢰 질문을 본 뒤의 거부(trust_wait)는 그대로
  assert.equal(exitKind({ before: 'trust_wait' }), 'trust_declined');
  const rt3 = newRuntime({ kind: 'claude' }); rt3.term.present = true; rt3.term.status = 'blocked'; rt3.pendingAsk = { kind: 'trust' };
  rt3.exit = { kind: 'trust_declined', at: 1 };
  assert.ok(!applyExitText(rt3, screen), '짐작이 아닌 신뢰 거부는 고치지 않는다');
  // 일하던 세션(hook을 받은 뒤)의 끝남은 화면을 보지 않는다
  const rt4 = newRuntime({ kind: 'claude' }); rt4.exit = { kind: 'other', at: 1 }; rt4.hooksSinceLaunch = 3;
  assert.ok(!applyExitText(rt4, screen));
  // 판이 끄라고 한 끝남도 아니다
  const rt5 = newRuntime({ kind: 'claude' }); rt5.exit = { kind: 'other', at: 1, requested: true };
  assert.ok(!applyExitText(rt5, screen));
});
