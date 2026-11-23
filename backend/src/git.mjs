// git 조사(ARCH 5절, A2): 브랜치, 바뀐 파일 수, `git diff --stat`. 세션 폴더가 git 저장소일 때만.
// P4(F4): 워크트리인가, 본 저장소(공통 git 폴더)가 어디인가. 판은 워크트리를 만들지 않고 읽기만 한다.
// P5(G1): 세션을 시작한 폴더의 리포지토리 워크스페이스(workspaces.mjs)
import path from 'node:path';
import { execFile } from 'node:child_process';
import { workspaceFromProbe } from './workspaces.mjs';

function git(cwd, args) {
  return new Promise((res) => execFile('git', ['-C', cwd, ...args], { encoding: 'utf8', windowsHide: true, timeout: 5000 }, (err, out) => res(err ? null : String(out))));
}

const norm = (p) => path.resolve(p).split(path.sep).join('/');

// `git rev-parse --path-format=absolute --show-toplevel --git-dir --git-common-dir` 출력 → 워크트리 정보
export function parseRevParse(out) {
  const [top, gitDir, commonDir] = String(out || '').split(/\r?\n/).map((l) => l.trim());
  if (!top || !gitDir || !commonDir) return null;
  const isWorktree = norm(gitDir).toLowerCase() !== norm(commonDir).toLowerCase();
  const c = norm(commonDir);
  return { root: norm(top), gitDir: norm(gitDir), commonDir: c, isWorktree, mainRoot: /\/\.git$/i.test(c) ? c.slice(0, -5) : null };
}

const revParse = async (cwd) => parseRevParse(await git(cwd, ['rev-parse', '--path-format=absolute', '--show-toplevel', '--git-dir', '--git-common-dir']));

// 시작 폴더 → 워크스페이스 { key, kind, root }. 폴더가 없거나 git이 아니면 그 폴더가 워크스페이스다
export async function workspaceOf(cwd) {
  const rp = cwd ? await revParse(cwd) : null;
  return workspaceFromProbe(rp, path.resolve(String(cwd || '.')));
}

export async function gitProbe(cwd) {
  const rp = await revParse(cwd);
  if (!rp) return { isRepo: false, cwd: cwd ? norm(cwd) : null, at: Date.now() };
  const [branch, status, stat] = await Promise.all([
    git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']),
    git(cwd, ['status', '--porcelain']),
    git(cwd, ['diff', '--stat']),
  ]);
  return {
    isRepo: true,
    cwd: norm(cwd),
    ...rp,
    branch: branch ? branch.trim() : null,
    changedFiles: status ? status.split('\n').filter((l) => l.trim()).length : 0,
    diffStat: stat ? stat.trim().split('\n').slice(-1)[0] || '' : '',
    at: Date.now(),
  };
}

// ---------- P267: 합치기(merger.mjs)가 쓰는 git 읽기. 판은 읽기만 한다(합치기·지우기는 merger 에이전트) ----------
// `git worktree list --porcelain` 출력 → [{ path, head, branch(짧은 이름 | null), detached, bare }]
export function parseWorktreeList(out) {
  const rows = []; let cur = null;
  for (const l of String(out || '').split(/\r?\n/)) {
    if (l.startsWith('worktree ')) { cur = { path: norm(l.slice(9).trim()), head: null, branch: null, detached: false, bare: false }; rows.push(cur); continue; }
    if (!cur) continue;
    if (l.startsWith('HEAD ')) cur.head = l.slice(5).trim();
    else if (l.startsWith('branch ')) cur.branch = l.slice(7).trim().replace(/^refs\/heads\//, '');
    else if (l.trim() === 'detached') cur.detached = true;
    else if (l.trim() === 'bare') cur.bare = true;
  }
  return rows;
}
export async function worktreeList(root) { const out = await git(root, ['worktree', 'list', '--porcelain']); return out == null ? null : parseWorktreeList(out); }
// 브랜치·커밋 이름 → 커밋 해시 | null
export async function revOf(cwd, ref) { const out = await git(cwd, ['rev-parse', '--verify', '--quiet', String(ref) + '^{commit}']); return out ? out.trim() || null : null; }
// 지금 걸린 브랜치(떼어 둔 HEAD면 null)
export async function branchOf(cwd) { const out = await git(cwd, ['symbolic-ref', '--quiet', '--short', 'HEAD']); return out ? out.trim() || null : null; }
// 하위 폴더의 합칠 거리: 워크트리인가, 브랜치, 끝 커밋, 커밋 안 한 변경 수, 합칠 브랜치보다 앞선 커밋 수.
// → { repo, isWorktree, commonDir, root, branch, tip, dirty, ahead } | null(git이 아님). target이 없으면 ahead는 null
// P320: 그 폴더의 작업 트리 뿌리(--show-toplevel) → 경로 | null
export async function worktreeRootOf(cwd) { const rp = cwd ? await revParse(cwd) : null; return rp ? rp.root : null; }
export async function branchProbe(cwd, target = null) {
  const rp = cwd ? await revParse(cwd) : null;
  if (!rp) return null;
  const [branch, tip, status] = await Promise.all([branchOf(cwd), revOf(cwd, 'HEAD'), git(cwd, ['status', '--porcelain'])]);
  let ahead = null;
  if (target && tip) { const n = await git(cwd, ['rev-list', '--count', String(target) + '..HEAD']); ahead = n == null ? null : Number(n.trim()); }
  return { repo: true, isWorktree: rp.isWorktree, commonDir: rp.commonDir, root: rp.root, mainRoot: rp.mainRoot, branch, tip, dirty: status == null ? null : status.split('\n').filter((l) => l.trim()).length, ahead };
}
// a가 b의 조상인가(합친 뒤 하위의 끝 커밋이 합칠 브랜치에 들어갔나) → true | false | null(모름)
export function isAncestor(cwd, a, b) {
  return new Promise((res) => execFile('git', ['-C', cwd, 'merge-base', '--is-ancestor', String(a), String(b)], { windowsHide: true, timeout: 5000 }, (err) => res(!err ? true : err.code === 1 ? false : null)));
}
