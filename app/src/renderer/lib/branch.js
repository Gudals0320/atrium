// P8(K4) 창 쪽 순수 규칙: 하위 세션 머리줄 글, 사이드바·미션 맵의 나무 순서(부모 아래에 자식, 들여 쓰기). 단위 시험이 있다(test/p8-lib.test.mjs).
// 세션 요약의 branch(백엔드 branch.mjs summaryExtra): { depth, parentSessionId, parentName, parentOpen, child, role, worktree, children }

import { t } from './i18n.js';

// 머리줄 글. atrium child로 만든 하위 세션만 "@lead의 워커 · 2단계". 판에 올린 에이전트(F3)는 지금처럼 "@x가 띄움"으로 둔다
export function branchLabel(s) {
  const b = s && s.branch;
  if (!b || !b.child) return null;
  const role = b.role || t('branch.child');
  const who = b.parentName ? t('branch.who', { parent: b.parentName, role }) : t('branch.whoOrphan', { role });
  const depth = t('branch.depth', { n: b.depth });
  return { text: `${who} · ${depth}`, short: depth, title: `${who}${t('branch.title')}${b.parentOpen ? '' : t('branch.parentClosed')}${b.worktree ? t('branch.worktree', { wt: b.worktree }) : ''}` };
}

// 나무 순서: 부모가 목록에 있으면 그 바로 아래에(형제끼리는 cmp 순서), 없으면 뿌리. → [{ item, indent }]
// idOf·parentOf로 요약(sessionId, parentSessionId)과 미션 맵 노드(id, parentId) 모두에 쓴다. 고리는 끊는다
export function treeOrder(list, { cmp = () => 0, idOf = (x) => x.sessionId, parentOf = (x) => x.parentSessionId || null } = {}) {
  const ids = new Set(list.map(idOf));
  const kids = new Map();
  const roots = [];
  for (const x of list) {
    const p = parentOf(x);
    if (p && ids.has(p) && p !== idOf(x)) { if (!kids.has(p)) kids.set(p, []); kids.get(p).push(x); } else roots.push(x);
  }
  const out = []; const seen = new Set();
  const walk = (x, indent) => {
    if (seen.has(idOf(x))) return;
    seen.add(idOf(x)); out.push({ item: x, indent });
    for (const k of (kids.get(idOf(x)) || []).sort(cmp)) walk(k, indent + 1);
  };
  for (const r of roots.sort(cmp)) walk(r, 0);
  for (const x of list) if (!seen.has(idOf(x))) walk(x, 0); // 고리에 든 것
  return out;
}
