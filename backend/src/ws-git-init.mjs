// P195: 프로젝트 열기 대화상자의 "Git 저장소로 시작"(사용자 요청 2026-11-17). 폴더를 열 때 git init과 빈 첫 커밋을 한다.
// - 워크트리(rig의 worktree 자리, claude -w)는 커밋(HEAD)이 있어야 하므로 빈 커밋까지 한다.
// - 폴더가 이미 git 저장소 안이면 하지 않는다(창은 확인란을 까닭과 함께 막는다).
// - 사용자의 git 설정은 바꾸지 않는다. git 이름·메일이 없어 커밋이 실패하면 init은 두고 커밋만 건너뛰며 까닭(identity)을 돌려준다.
// - 판은 init 뒤에 워크스페이스 키를 잡으므로 처음부터 저장소 키다(열쇠 옮기기가 일어나지 않는다).
import { execFile } from 'node:child_process';

// git 한 번 → { ok, out, err }
export function runGit(cwd, args, { timeout = 15000 } = {}) {
  return new Promise((res) => execFile('git', ['-C', cwd, ...args], { encoding: 'utf8', windowsHide: true, timeout }, (e, out, err) => res({ ok: !e, out: String(out || ''), err: String(err || (e && e.message) || '') })));
}

// 커밋 실패 글이 git 이름·메일이 없어서인가
export const identityMissing = (err) => /Please tell me who you are|user\.email|user\.name|unable to auto-detect email|empty ident/i.test(String(err || ''));

// 폴더의 git 상태(창의 확인란): 'norepo' | 'nocommit' | 'ok'
export async function gitStateAt(dir, { run = runGit } = {}) {
  const r = await run(dir, ['rev-parse', '--is-inside-work-tree']);
  if (!r.ok || r.out.trim() !== 'true') return 'norepo';
  const h = await run(dir, ['rev-parse', '--verify', '-q', 'HEAD']);
  return h.ok ? 'ok' : 'nocommit';
}

// git init + 빈 첫 커밋. → { init: true, commit: bool, why?: 'identity' | 'error', error? }
// 이미 저장소 안이면 throw(code bad_request, 사전 열쇠 backend.wsGitInRepo)
export async function initRepo(dir, { run = runGit } = {}) {
  if ((await gitStateAt(dir, { run })) !== 'norepo') throw Object.assign(new Error(`이미 Git 저장소 안의 폴더라 git init을 하지 않았습니다: ${dir}`), { code: 'bad_request', key: 'wsGitInRepo', vars: { path: dir } });
  const i = await run(dir, ['init', '-q']);
  const why = i.err.trim().split('\n')[0];
  if (!i.ok) throw Object.assign(new Error(`git init이 실패했습니다: ${why}`), { code: 'git_failed', key: 'wsGitInitFail', vars: { error: why } });
  const c = await run(dir, ['commit', '--allow-empty', '-q', '-m', 'Initial commit']);
  if (c.ok) return { init: true, commit: true };
  return { init: true, commit: false, why: identityMissing(c.err) ? 'identity' : 'error', error: c.err.trim().split('\n')[0] || null };
}
