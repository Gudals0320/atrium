// P307: 휴대폰의 목표 레인(세션 맵 폴더 머리 칩과 아래 시트, 화면은 PhonePlan.jsx). 셈은 PC와 같은 lib/plans.js를 쓴다.
// - 칩: 워크스페이스 머리 오른쪽 끝. 레인이 하나면 PC 칩 글("수집 M2 3/7"), 둘 이상이면 "레인 n"으로 접는다(휴대폰은 칩 하나 자리).
//   P293 가볍게 열림(빠른 죽음 뒤)에서는 그리지 않는다.
// - 시트: { wsKey, planId | null }. planId가 없으면 레인 목록(레인이 하나면 곧바로 그 레인), 있으면 그 레인. 사라진 레인이면 목록.
// - 사람이 휴대폰에서 고치는 것은 체크·지금 마일스톤(focus)·측정값 지금 값만. 항목 고치기·관리자 넘기기·상태는 PC 목표 판.
import { regionChips, wsLanes, openMs } from './plans.js';

// 폴더 머리 칩 하나 → { n, one, folded, userLeft, allChecked, dim } | null
export function phoneChip(lanes, wsKey, { lite = false } = {}) {
  if (lite || !wsKey) return null;
  const r = regionChips(lanes, wsKey, 1);
  if (!r.n) return null;
  const one = r.n === 1 ? r.chips[0] : null;
  return { n: r.n, one, folded: !one, userLeft: one ? (one.dim ? 0 : one.userLeft) : r.userLeft, allChecked: one ? one.allChecked && !one.dim : r.allChecked, dim: one ? one.dim : false };
}
// 시트가 보일 것 → { mode: 'list', wsKey, chips } | { mode: 'lane', wsKey, lane, back } | null
export function sheetPick(lanes, sheet) {
  if (!sheet) return null;
  const all = (lanes || []).filter(Boolean);
  const want = sheet.planId != null ? all.find((l) => String(l.planId) === String(sheet.planId)) : null;
  const wsKey = want ? want.wsKey : sheet.wsKey;
  const list = wsLanes(all, wsKey);
  const lane = want || (sheet.planId == null && list.length === 1 ? list[0] : null);
  if (!lane) return { mode: 'list', wsKey, chips: regionChips(all, wsKey, Infinity).chips };
  return { mode: 'lane', wsKey, lane, back: list.length > 1 || (list.length === 1 && list[0].planId !== lane.planId) };
}
// 펼친 마일스톤의 항목("사용자 것만"이면 who=user만)
export function sheetItems(ms, userOnly = false) {
  if (!ms || !Array.isArray(ms.items)) return [];
  return userOnly ? ms.items.filter((x) => x.who === 'user') : ms.items;
}
// 시트의 마일스톤 계단과 펼친 것(PC openMs와 같은 규칙)
export function sheetSteps(doc, picked = null) {
  const ms = openMs(doc, picked);
  const steps = doc && Array.isArray(doc.milestones) ? doc.milestones.map((m) => ({ code: m.code, title: m.title, done: m.items.filter((x) => x.done).length, total: m.items.length, state: m.state, focus: m.code === doc.focus, open: !!ms && ms.code === m.code })) : [];
  return { steps, ms };
}
