// P331: 세션 맵(I6, MissionLineage.jsx)의 할 일 배지와 그 자리 답하기 미니 창의 셈(순수 함수, 단위 시험 app/test/p331-lib.test.mjs).
// - 배지: 세션 카드 왼쪽 위(오른쪽 위는 작업 완료 꼬리표). 수는 할 일 알약이 세는 것과 같은 기준(미룬 카드 뺌, 목표 레인 사용자 항목 더함).
// - 미니 창: 카드를 한 번 누르면 명령줄 태그(지금 그대로)와 함께, 그 세션에 열린 할 일이 있으면 카드 옆에 뜬다. 할 일 목록 카드(Decisions.jsx)를 그대로 쓴다.
import { activeCards } from './decisions.js';

// 세션의 열린 할 일 수: 결정·실행·확인 카드 중 미루지 않은 것 + 그 세션이 관리하는 목표 레인의 사용자 항목(planN, lib/plans.js planCountFor)
export function todoCount(decisions, sessionId, planN = 0) {
  if (!sessionId) return 0;
  let n = 0;
  for (const d of decisions || []) if (d && d.sessionId === sessionId && !d.deferred) n++;
  return n + Math.max(0, Number(planN) || 0);
}

// 창에 보일 카드: 결정 카드(오래 기다린 것 먼저) 뒤에 목표 레인 카드(lib/plans.js planCards의 cards, ownerId가 그 세션). { key, d } | { key, c }
export function todoItems(decisions, planList, sessionId) {
  if (!sessionId) return [];
  const ds = activeCards(decisions).filter((d) => d.sessionId === sessionId).map((d) => ({ key: `d:${d.id}`, d }));
  const ps = (planList || []).filter((c) => c && c.ownerId === sessionId).map((c) => ({ key: c.key, c }));
  return [...ds, ...ps];
}

// 한 번 누르기가 창을 여는가: 열린 할 일이 있고, 끌기 뒤 누르기·더블클릭의 둘째 누르기·태그를 빼는 누르기가 아닐 때
export function opensTodo({ count = 0, dragged = false, detail = 1, wasTagged = false } = {}) {
  return count > 0 && !dragged && !(detail > 1) && !wasTagged;
}

// 지금 보던 카드(key)가 목록에 남아 있으면 그 key, 사라졌으면(답·했음·됐다·미루기·무시) null = 창을 닫는다
export function todoAfter(items, key) {
  return key != null && (items || []).some((x) => x.key === key) ? key : null;
}

// 1/n 넘기기: dir +1 다음, -1 앞(끝에서 돈다)
export function todoStep(items, key, dir) {
  const xs = items || [];
  if (!xs.length) return null;
  const i = xs.findIndex((x) => x.key === key);
  if (i < 0) return xs[0].key;
  return xs[(i + (dir < 0 ? -1 : 1) + xs.length) % xs.length].key;
}

// 창 자리(보기 칸 좌표). card = 화면의 카드 상자 { x, y, w, h }, pop = 창 크기 { w, h },
// area = 보기 칸 { w, h, top(위 줄), bottom(명령줄), right(오른쪽 요약 열) }.
// 위 → 아래 → 오른쪽 → 왼쪽 순으로 들어가는 자리. 카드가 보기 칸 밖이면 hidden(창은 카드를 따라가므로 끌어 되돌리면 다시 보인다)
export const POP_GAP = 10, POP_EDGE = 8;
export function todoPlace(card, pop, area, gap = POP_GAP) {
  const E = POP_EDGE;
  const top = (area.top || 0) + E, bottom = area.h - (area.bottom || 0) - E, right = area.w - (area.right || 0) - E;
  if (card.y + card.h < top || card.y > bottom || card.x + card.w < E || card.x > right) return { side: 'off', hidden: true, x: 0, y: 0 };
  const clampX = (x) => Math.max(E, Math.min(right - pop.w, x));
  const clampY = (y) => Math.max(top, Math.min(bottom - pop.h, y));
  let y = card.y - gap - pop.h;
  if (y >= top) return { side: 'top', hidden: false, x: clampX(card.x), y };
  y = card.y + card.h + gap;
  if (y + pop.h <= bottom) return { side: 'bottom', hidden: false, x: clampX(card.x), y };
  let x = card.x + card.w + gap;
  if (x + pop.w <= right) return { side: 'right', hidden: false, x, y: clampY(card.y) };
  x = card.x - gap - pop.w;
  if (x >= E) return { side: 'left', hidden: false, x, y: clampY(card.y) };
  return { side: 'over', hidden: false, x: clampX(card.x), y: clampY(card.y - gap - pop.h) }; // 어디에도 안 들면 카드 위에 겹친다
}

// 창 안을 눌러도 초점을 옮기지 않는다(명령줄에 바로 칠 수 있게): 입력칸이 아니면 mousedown 기본 동작(초점 옮기기)을 막는다
export const keepsFocus = (tagName) => !/^(INPUT|TEXTAREA|SELECT|OPTION)$/i.test(String(tagName || ''));
