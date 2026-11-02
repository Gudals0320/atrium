// 보관(P10, ARCH 4절 J): 판 밖 대화와 닫힌 세션을 기본 목록에서 뺀다. 순수 함수만 둔다(저장은 store-recall.mjs의 archive 표).
// 보관은 지우기가 아니다. 대화 기록 파일과 판 기록은 그대로 두고, 사이드바 기본 목록·거르기·recall.list에서만 빠진다.
// - 손으로 보관: mark.archivedAt이 있으면 보관이다.
// - 저절로 보관: 마지막 활동(꺼낸 적이 있으면 꺼낸 시각과 둘 중 늦은 것)이 기간(일)보다 오래되면 보관으로 본다. days가 0이면 끈다.
// - 꺼내기: archivedAt을 지우고 restoredAt을 남긴다. 그때부터 다시 센다.
// - 리포 스스로 찾기(P10)의 기준 기간도 같은 설정을 쓴다(끄면 DISCOVER_DAYS).

export const DAY_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_ARCHIVE_DAYS = 14;
export const DISCOVER_DAYS = 14; // 저절로 보관을 껐을 때 리포 스스로 찾기가 보는 기간
export const OLD_DAYS = 1; // "오래된 것 보관"이 기본으로 보관하는 기준(마지막 활동이 이만큼 지난 것)

export const itemKey = (kind, id) => `${kind}:${String(id).toLowerCase()}`;

// lastAt: 마지막 활동 시각, mark: 저장된 표시 { archivedAt, restoredAt } 또는 null, days: 설정(0이면 저절로 보관 끔)
// → { archived: bool, why: 'manual' | 'auto' | null, since: 보관으로 본 시각 }
export function archiveState({ lastAt = 0, mark = null, now = Date.now(), days = DEFAULT_ARCHIVE_DAYS }) {
  if (mark && mark.archivedAt) return { archived: true, why: 'manual', since: mark.archivedAt };
  if (!days || days <= 0) return { archived: false, why: null, since: null };
  const from = Math.max(lastAt || 0, (mark && mark.restoredAt) || 0);
  if (!from) return { archived: false, why: null, since: null }; // 시각을 모르면 보관하지 않는다(안전한 쪽: 보이는 쪽)
  const limit = from + days * DAY_MS;
  return now > limit ? { archived: true, why: 'auto', since: limit } : { archived: false, why: null, since: null };
}

// "오래된 것 보관"의 대상: 손 보관이 아니고 아직 보관되지 않았고 마지막 활동이 olderThanDays보다 오래된 것
export function isOld({ lastAt = 0, mark = null, now = Date.now(), olderThanDays = OLD_DAYS }) {
  if (mark && mark.archivedAt) return false;
  const from = Math.max(lastAt || 0, (mark && mark.restoredAt) || 0);
  return !!from && now - from > olderThanDays * DAY_MS;
}

// 리포 스스로 찾기(P10)에 드는 대화인가: 지시가 있고, 출처에 cli가 있고(터미널), 기간 안에 활동했고, 손으로 보관하지 않았다.
// 데스크톱 앱 출처만 있는 대화는 들지 않는다
export function discoverable({ entrypoints = [], prompts = 0, lastAt = 0, mark = null, now = Date.now(), days = DISCOVER_DAYS }) {
  if (!prompts || !entrypoints.includes('cli')) return false;
  if (mark && mark.archivedAt) return false;
  const from = Math.max(lastAt || 0, (mark && mark.restoredAt) || 0);
  return !!from && now - from <= days * DAY_MS;
}
