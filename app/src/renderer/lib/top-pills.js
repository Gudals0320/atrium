// P294: 위 알약 두 무리의 접기 단계. 왼쪽 무리(사람이 볼 것)가 넓어도 오른쪽 무리(상태)를 덮지 않게 한다.
// 'full'    = 모두 글과 수
// 'compact' = 왼쪽 알약은 수만(글은 title에)
// 'tight'   = 오른쪽 알약의 흐린 글(메모리 등)도 숨긴다
// 'stack'   = 그래도 모자라면(사이드바를 연 좁은 창 등) 왼쪽 무리를 오른쪽 무리 아래 줄로 내린다(접은 모양 그대로)
// 잰 폭(px)이 아직 없으면(null) 그 단계를 먼저 그려 재게 한다: 펼친 폭을 모르면 'full', 펼쳐서 안 들어가고 접은 폭을 모르면 'compact',
// 접어서도 안 들어가고 오른쪽을 접은 폭을 모르면 'tight'.
// win: 창 폭, left: 왼쪽 무리의 왼쪽 끝(왼쪽 레일 자리), right: 오른쪽 무리 오른쪽 여백, gap: 두 무리 사이 최소 틈
export const PEOPLE_PILLS = ['inbox', 'decisions', 'review', 'problems', 'sessions-pill']; // 위 왼쪽(data-role)
export const STATUS_PILLS = ['conn', 'devices', 'resources', 'usage', 'changes', 'settings-open']; // 위 오른쪽(data-role 또는 data-action)

export function topFit({ win, left = 87, right = 15, gap = 16, fullL = null, compactL = null, fullR = null, compactR = null } = {}) {
  const room = (l, r) => left + l + gap + r + right <= win;
  if (fullL == null || fullR == null) return 'full';
  if (room(fullL, fullR)) return 'full';
  if (compactL == null) return 'compact';
  if (room(compactL, fullR)) return 'compact';
  if (compactR == null || room(compactL, compactR)) return 'tight';
  return 'stack';
}
