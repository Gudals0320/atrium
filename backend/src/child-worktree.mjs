// P382: 다른 하네스(omo, codex 등)의 atrium child --worktree. Claude Code는 claude -w가 워크트리를 만들지만(사용자 WorktreeCreate hook도 거기에만 걸린다),
//   다른 하네스는 판이 git worktree add -b worktree-<이름> <리포>/.claude/worktrees/<이름> <부모 폴더의 HEAD>로 만들고 그 폴더(--cwd)에서 띄운다.
//   브랜치 이름과 자리가 빠른 워크트리 세션(P321 worktree-session.mjs launchPlan)과 같아 워크트리 상자·merger(mergeVerdict, workCwd)·치우기가 같은 길을 쓴다.
//   같은 이름의 워크트리(브랜치 worktree-<이름>)가 살아 있으면 다시 쓰고(claude -w와 hook이 같은 이름을 다시 여는 것과 같다), 브랜치만 남았으면 그 브랜치로 만든다.
//   띄우기가 실패하면 판이 만든 것(폴더, 새로 만든 브랜치)만 지운다.
// - OMO(/ulw-execute)는 체크아웃된 브랜치를 통합 브랜치로 보고 파동 워크트리를 그 브랜치에 직접 합친다. 그래서
//   · omo 하위를 주 체크아웃(연결 워크트리가 아닌 폴더)에서 띄우면 띄우기 응답과 판 알림에 경고 한 줄(막지는 않는다, omoMainWarning)
//   · omo 하위를 --worktree로 띄우면 그 브랜치를 OMO가 쓰는 동안 부모가 커밋·병합하지 말라는 한 줄(omoBranchNote. 새 잠금은 없다)
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { wtBranch, wtRel, findClaudeWt } from './worktree-names.mjs';
import { parseWorktreeList } from './worktree-areas.mjs';

function apiError(code, message, extra = {}) { return Object.assign(new Error(message), { code }, extra); }
const slash = (p) => (p ? String(p).split(path.sep).join('/') : p);
const clip = (s, n) => { const t = String(s || '').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
function gitRun(args, timeout = 30000) {
  return new Promise((res) => execFile('git', args, { encoding: 'utf8', windowsHide: true, timeout }, (err, out, errOut) => res({ ok: !err, out: String(out || ''), err: String(errOut || (err && err.message) || '') })));
}

// 판이 워크트리를 만드는 하네스인가(Claude Code는 claude -w)
export const boardMakesWorktree = (kind) => !!kind && kind !== 'claude';
// 워크트리 자리(빠른 워크트리 세션과 같다)
export const childWtDir = (root, name) => path.join(root, wtRel(name));

// 만드는 길(순수). live: 그 리포의 git 워크트리 목록(parseWorktreeList), branchExists: 브랜치 worktree-<이름>이 있나, dirExists: 기본 자리에 폴더가 있나
//   → { via: 'reuse', dir, branch } | { via: 'add', dir, branch, git, newBranch } | { via: 'blocked', why, dir, branch }
export function childWtPlan({ root, cwd = root, name, live = [], branchExists = false, dirExists = false }) {
  const branch = wtBranch(name);
  const hit = findClaudeWt((live || []).filter((w) => w && !w.main && !w.prunable), name);
  if (hit) return { via: 'reuse', dir: hit.path, branch: hit.branch || branch };
  const dir = childWtDir(root, name);
  if (dirExists) return { via: 'blocked', why: 'dir_exists', dir, branch };
  if (branchExists) return { via: 'add', dir, branch, newBranch: false, git: ['-C', cwd, 'worktree', 'add', dir, branch] };
  return { via: 'add', dir, branch, newBranch: true, git: ['-C', cwd, 'worktree', 'add', '-b', branch, dir, 'HEAD'] };
}

// 워크트리를 만든다(또는 있는 것을 다시 쓴다). probe: git.mjs gitProbe(cwd)
//   → { dir, branch, base, reused, made: { dir, branch } }
export async function makeChildWorktree({ cwd, name, probe }) {
  const root = (probe && (probe.mainRoot || probe.root)) || cwd;
  const [list, br] = await Promise.all([
    gitRun(['-C', root, 'worktree', 'list', '--porcelain'], 5000),
    gitRun(['-C', root, 'rev-parse', '--verify', '--quiet', 'refs/heads/' + wtBranch(name)], 5000),
  ]);
  const plan = childWtPlan({ root, cwd, name, live: list.ok ? parseWorktreeList(list.out) : [], branchExists: br.ok && !!br.out.trim(), dirExists: fs.existsSync(childWtDir(root, name)) });
  const base = (probe && probe.branch) || null;
  if (plan.via === 'reuse') return { dir: plan.dir, branch: plan.branch, base, reused: true, made: { dir: false, branch: false } };
  if (plan.via === 'blocked') throw apiError('name_taken', `같은 이름의 폴더가 이미 있지만 워크트리가 아닙니다: ${slash(plan.dir)}. 다른 --worktree 이름을 쓰세요.`, { why: plan.why });
  const r = await gitRun(plan.git);
  if (!r.ok) throw apiError('git_failed', 'git worktree add가 실패했습니다: ' + clip(r.err, 300));
  return { dir: plan.dir, branch: plan.branch, base, reused: false, made: { dir: true, branch: plan.newBranch } };
}

// 띄우기가 실패하면 판이 만든 것만 지운다
export async function undoChildWorktree(wt, root) {
  if (!wt || wt.reused) return;
  if (wt.made.dir) await gitRun(['-C', root, 'worktree', 'remove', '--force', wt.dir]);
  if (wt.made.branch) await gitRun(['-C', root, 'branch', '-D', wt.branch]);
}

// 주 체크아웃 경고(순수). probe: gitProbe(cwd). omo가 아니거나 --worktree면, 또는 git이 아니거나 이미 연결 워크트리면 null
export function omoMainWarning({ kind, worktree = null, probe = null }) {
  if (kind !== 'omo' || worktree || !probe || !probe.isRepo || probe.isWorktree) return null;
  return `경고: omo 하위가 주 체크아웃(${probe.branch || 'HEAD'})에서 뜬다. OMO의 /ulw-execute는 체크아웃된 브랜치에 파동 워크트리를 직접 합치므로 검토 없이 ${probe.branch || '그 브랜치'}에 합쳐진다. 코드를 고치는 일이면 --worktree <이름>으로 띄운다.`;
}
// --worktree omo 하위의 브랜치 표시(순수)
export function omoBranchNote({ kind, branch, name = null }) {
  if (kind !== 'omo' || !branch) return null;
  return `브랜치 ${branch}는 ${name ? '@' + name : '그 하위'}가 done으로 닫을 때까지 OMO가 쓴다(파동 워크트리를 이 브랜치에 합친다). 그동안 이 브랜치에 커밋하거나 병합하지 않는다. 닫으면 보드가 merger(꺼져 있으면 너)에게 병합을 맡긴다.`;
}
