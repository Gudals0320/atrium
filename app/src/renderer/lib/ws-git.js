// P195: 프로젝트 열기 대화상자의 "Git 저장소로 시작" 확인란(사용자 요청 2026-11-17). 판 API workspace.gitState·workspace.open(gitInit).

// 폴더의 git 상태(workspace.gitState의 state) → 확인란 { disabled, reasonKey }. 상태를 모르면(아직 묻는 중) 막지 않는다
export function gitBoxView(state) {
  if (state === 'nocommit' || state === 'ok') return { disabled: true, reasonKey: 'wsGit.inRepo' };
  if (state === 'missing') return { disabled: true, reasonKey: 'wsGit.noFolder' };
  return { disabled: false, reasonKey: null };
}

// 보낼 값: 확인란이 켜졌고 막히지 않았을 때만 gitInit
export const openParams = (dir, checked, state) => ({ path: String(dir || '').trim(), ...(checked && !gitBoxView(state).disabled ? { gitInit: true } : {}) });

// workspace.open 답의 git → 알림 { key, kind } | null
export function gitResultNote(git) {
  if (!git || !git.init) return null;
  if (git.commit) return { key: 'wsGit.done', kind: 'info' };
  return { key: git.why === 'identity' ? 'wsGit.noIdentity' : 'wsGit.commitFail', kind: 'error' };
}
