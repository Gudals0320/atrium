// P321: 빠른 워크트리 세션의 창 쪽 순수 함수(단위 시험 app/test/p321-lib.test.mjs). 판 쪽은 backend/src/worktree-session.mjs
// - head 판정(설계 P318 4.2): 그 리포 영역의 열린 세션 가운데 (1) 일 상위가 없고 (2) merger가 아니고 (3) 셸이 아니고 (4) 폴더가 리포 뿌리(워크트리 아님)인 것.
//   여럿이면 하위가 가장 많은 것, 같으면 최근에 사람이 만진 것(touchedAt). 빠른 창에서 다른 후보로 바꿀 수 있다.
// - 빈 곳 메뉴의 항목(리포 영역 안 / 폴더 영역 안 / 영역 밖).
export { WT_NAME_RE, wtBranch, wtRel, autoName, nameFromPrompt } from '../../../../backend/src/worktree-names.mjs';

const isWt = (s) => !!(s && s.git && s.git.isWorktree);
// head 후보(앞이 판정한 head). mergerIds: merger 세션 ID 모음
export function headCandidates(sessions, wsKey, { mergerIds = new Set() } = {}) {
  const list = [...(sessions || [])].filter((s) => s && s.workspaceKey === wsKey && (s.kind || 'claude') !== 'shell' && s.state !== 'exited' && !s.closedAt
    && !s.parentSessionId && !mergerIds.has(s.sessionId) && !isWt(s));
  const kids = (s) => (s.branch && s.branch.children) || 0;
  return list.sort((a, b) => kids(b) - kids(a) || (b.touchedAt || 0) - (a.touchedAt || 0) || String(a.name).localeCompare(String(b.name)));
}
export const pickHead = (sessions, wsKey, o) => headCandidates(sessions, wsKey, o)[0] || null;
// 다음 후보(바꾸기 단추). 끝이면 첫 후보
export function nextHead(cands, cur) {
  if (!cands.length) return null;
  const i = cands.findIndex((s) => s.sessionId === cur);
  return cands[(i + 1) % cands.length];
}
// 빈 곳 메뉴 → { head, items: [{ action, disabled?, title? }] }. ws: 누른 자리의 워크스페이스(없으면 영역 밖)
export function paneMenuItems(ws) {
  if (!ws) return { head: null, items: [{ action: 'ws-open' }] };
  const repo = ws.kind === 'repo';
  return { head: ws.label || ws.name, items: [{ action: 'worktree', disabled: !repo }, { action: 'spawn' }, { sep: true }, { action: 'arrange' }, { action: 'fit' }] };
}
// 병합 맡기기를 보일 세션인가(워크트리 브랜치에서 일하는 에이전트, merger 아님)
export const canAskMerge = (s, mergerIds = new Set()) => !!s && (s.kind || 'claude') !== 'shell' && isWt(s) && !!s.git.branch && !mergerIds.has(s.sessionId);
// merger 세션 ID 모음(창의 merger.status 상태)
export const mergerIdsOf = (merger) => new Set(((merger && merger.mergers) || []).map((m) => m.sessionId).filter(Boolean));
// 빠른 창의 이름 칸 검사 → null | 'bad' | 'taken'
export function nameIssue(name, taken = []) {
  const n = String(name || '').trim();
  if (!/^[a-z][a-z0-9-]{0,31}$/.test(n)) return 'bad';
  return [...taken].some((x) => String(x).toLowerCase() === n) ? 'taken' : null;
}
