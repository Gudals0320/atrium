// P71: `claude -w` 세션의 워크트리 나가기 질문(ask.kind worktree_exit, 백엔드 screen.mjs parseWorktreeExit)과 닫기 확인의 워크트리 선택에 쓰는 글.
// t는 사전 함수(i18n.js t). 시험은 translate로 언어를 정해 넘긴다.

// 승인 줄의 한 줄: 브랜치 · 커밋 n개 · 커밋하지 않은 파일 n개
export function worktreeExitLine(ask, t) {
  if (!ask) return '';
  const parts = [];
  if (ask.branch) parts.push(ask.branch);
  if (ask.commits > 0) parts.push(t('wtExit.commits', { n: ask.commits }));
  if (ask.files > 0) parts.push(t('wtExit.files', { n: ask.files }));
  return parts.join(' · ');
}

// 지우기를 한 번 더 물을 때 함께 보이는 경고. 커밋이 있으면 "브랜치와 커밋 n개도 지워집니다"
export function removeWarning(ask, t) {
  if (!ask) return t('wtExit.removeWarn');
  const files = ask.files > 0 ? ` ${t('wtExit.removeWarnFiles', { n: ask.files })}` : '';
  if (ask.commits > 0) return t('wtExit.removeWarnCommits', { n: ask.commits }) + files;
  if (ask.commits == null) return t('wtExit.removeWarnUnknown') + files;
  return files ? files.trim() : t('wtExit.removeWarn');
}

// 닫기 확인에서 고른 워크트리 답 → session.kill에 넘길 값. 고르지 않았으면 남기기다(지우기는 사람이 고를 때만)
export const killWorktreeParam = (wt, choice) => (wt ? { worktree: choice === 'remove' ? 'remove' : 'keep' } : {});
