// P306: 목표·마일스톤 레인의 창 쪽 셈(판 쪽 backend/src/plan-board.mjs, API plan.list | plan.get | plan.op | plan.owner | plan.status | plan.log, 이벤트 plan.changed).
// - 레인: { planId, wsKey, workspace, no, name, status(active|paused|done|archived), rev, summary, owner: { sessionId, name, open } | null, updatedAt, updatedBy, userItems, doc? }.
//   plan.list는 문서 없이 요약과 userItems(진행 중 레인의 focus 사용자 항목)를, plan.changed·plan.get은 문서까지 준다(문서가 있으면 요약·항목을 여기서 다시 센다).
// - 영역 머리 칩: 레인마다 "수집 M2 3/7"(사용자 항목이 남으면 청록 점, focus 마일스톤이 모두 체크면 녹색 테두리). 보관 레인은 칩에 없고 판의 탭에만,
//   멈춤·끝 레인은 흐리게. 칩이 CHIPS_MAX보다 많으면 "레인 n" 하나로 접고 누르면 목록.
// - 할 일 목록의 가상 "실행" 카드: 진행 중 레인마다 focus 마일스톤의 사용자 항목(체크 안 됨, 미루지 않음)을 레인당 CARDS_PER_LANE장, 넘치면 "n개 더" 한 줄.
//   판의 decisions 표에 줄이 없다(체크 상태의 원본은 레인 하나). 했음 = plan.op check(via foryou), 미루기 = plan.op snooze.
import { planSummary, focusUserItems } from '../../../../backend/src/plan.mjs';

export const CHIPS_MAX = 3;
export const CARDS_PER_LANE = 2;
export const LANE_STATUSES = ['active', 'paused', 'done', 'archived'];

// 판이 준 레인(목록 줄·이벤트) → 창이 쓰는 꼴. old: 같은 레인의 앞 값(문서를 이어 둔다)
export function laneOf(raw, old = null, now = Date.now()) {
  if (!raw || raw.planId == null) return null;
  const doc = raw.doc || (old && old.rev === raw.rev ? old.doc : null) || null;
  const status = LANE_STATUSES.includes(raw.status) ? raw.status : 'active';
  const summary = doc ? planSummary(doc, now) : raw.summary || null;
  const userItems = doc ? (status === 'active' ? focusUserItems(doc, now) : []) : Array.isArray(raw.userItems) ? raw.userItems : old && old.rev === raw.rev ? old.userItems : [];
  return { planId: raw.planId, wsKey: raw.wsKey, workspace: raw.workspace || raw.wsKey, no: Number(raw.no) || 0, name: String(raw.name || '?'), status, rev: Number(raw.rev) || 0,
    summary, owner: raw.owner || null, updatedAt: raw.updatedAt || raw.at || null, updatedBy: raw.updatedBy || raw.by || null, userItems, doc };
}
export const byNo = (a, b) => a.no - b.no;
// 워크스페이스의 레인(번호 차례). all이면 보관도
export function wsLanes(lanes, wsKey, { all = false } = {}) {
  return [...(lanes || [])].filter((l) => l && l.wsKey === wsKey && (all || l.status !== 'archived')).sort(byNo);
}
// 칩 하나의 셈
export function chipOf(l) {
  const f = l.summary && l.summary.focus;
  return { planId: l.planId, name: l.name, status: l.status, code: f ? f.code : null, done: f ? f.done : 0, total: f ? f.total : 0, userLeft: f ? f.userLeft : 0,
    allChecked: !!(f && f.allChecked), dim: l.status !== 'active' };
}
export const chipText = (c) => (c.code ? `${c.name} ${c.code} ${c.done}/${c.total}` : c.name);
// 영역 머리 칩들 → { chips, folded, n, userLeft, allChecked }
export function regionChips(lanes, wsKey, max = CHIPS_MAX) {
  const ls = wsLanes(lanes, wsKey).sort((a, b) => (a.status === 'active' ? 0 : 1) - (b.status === 'active' ? 0 : 1) || byNo(a, b));
  const chips = ls.map(chipOf);
  const userLeft = chips.filter((c) => !c.dim).reduce((s, c) => s + c.userLeft, 0);
  return { chips, folded: chips.length > max, n: chips.length, userLeft, allChecked: chips.some((c) => !c.dim && c.allChecked) };
}
// 세션이 관리하는 레인(보관 아닌 것)
export function managerLanes(lanes, sessionId) {
  if (!sessionId) return [];
  return [...(lanes || [])].filter((l) => l && l.owner && l.owner.sessionId === sessionId && l.status !== 'archived').sort(byNo);
}
// 할 일 목록의 가상 카드 → { cards, more, total }. total은 알약에 세는 수(미루지 않은 사용자 항목 모두)
export function planCards(lanes, now = Date.now(), per = CARDS_PER_LANE) {
  const cards = [], more = [];
  let total = 0;
  const ls = [...(lanes || [])].filter((l) => l && l.status === 'active').sort((a, b) => String(a.workspace).localeCompare(String(b.workspace)) || byNo(a, b));
  for (const l of ls) {
    const items = (l.userItems || []).filter((x) => !x.done && !(x.snoozeUntil && x.snoozeUntil > now));
    total += items.length;
    items.slice(0, per).forEach((x) => cards.push({ key: `plan:${l.planId}:${x.id}`, source: 'plan', planId: l.planId, lane: l.name, wsKey: l.wsKey, workspace: l.workspace,
      ownerId: l.owner ? l.owner.sessionId : null, ownerName: l.owner ? l.owner.name : null, itemId: x.id, text: x.text, note: x.note || null, ms: x.ms, msTitle: x.msTitle || '' }));
    if (items.length > per) more.push({ planId: l.planId, lane: l.name, wsKey: l.wsKey, workspace: l.workspace, ms: items[0].ms, n: items.length - per });
  }
  return { cards, more, total };
}
// 세션 카드 표식에 더할 수(그 세션이 관리하는 레인의 카드 수)
export function planCountFor(lanes, sessionId, now = Date.now()) {
  let n = 0;
  for (const l of managerLanes(lanes, sessionId)) if (l.status === 'active') n += (l.userItems || []).filter((x) => !x.done && !(x.snoozeUntil && x.snoozeUntil > now)).length;
  return n;
}
// 판의 체크 = 할 일 목록의 했음: 같은 항목 하나(어느 쪽에서 체크해도 같은 plan.op)
export const checkOp = (itemId, on = true) => ({ op: on ? 'check' : 'uncheck', ids: [itemId] });
export const snoozeOp = (itemId, until) => ({ op: 'snooze', id: itemId, until });
// 측정값 막대(둘 다 숫자일 때만): 지금이 목표 쪽으로 얼마나 왔나(0~1). 목표가 더 작으면(줄이기) 목표/지금
export function metricPct(m) {
  const n = parseFloat(String(m && m.now != null ? m.now : '').replace(/[^0-9.\-]/g, ''));
  const t = parseFloat(String(m && m.target != null ? m.target : '').replace(/[^0-9.\-]/g, ''));
  if (!Number.isFinite(n) || !Number.isFinite(t)) return null;
  if (t === n) return 1;
  if (t > n) return t > 0 ? Math.max(0, Math.min(1, n / t)) : null;
  return n > 0 ? Math.max(0, Math.min(1, (t + 1) / (n + 1))) : null;
}
// 판의 마일스톤 계단: 지금 펼칠 마일스톤(고른 것이 없거나 사라졌으면 focus, 그것도 없으면 첫 열린 것)
export function openMs(doc, picked) {
  if (!doc || !doc.milestones || !doc.milestones.length) return null;
  return doc.milestones.find((m) => m.code === picked) || doc.milestones.find((m) => m.code === doc.focus) || doc.milestones.find((m) => m.state !== 'done') || doc.milestones[0];
}
