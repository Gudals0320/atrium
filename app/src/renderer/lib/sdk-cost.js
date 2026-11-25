// P361·P366: SDK 세션이 쓴 금액(추정, 판 중계기 기록 × 가격표)을 창에서 보이는 순수 함수. 값은 백엔드 usage.get·usage.updated의 sdkCosts(backend/src/sdk-cost.mjs)
const num = (v) => typeof v === 'number' && Number.isFinite(v);

// 달러 글: 2.26 → $2.26. small이면 1센트보다 작은 양수는 <$0.01
export function usd(v, { small = false } = {}) {
  if (!num(v)) return '—';
  if (small && v > 0 && v < 0.01) return '<$0.01';
  return `${v < 0 ? '-' : ''}$${Math.abs(v).toFixed(2)}`;
}
// 세션 하나가 쓴 금액 | null. view는 usage.get 값(sdkCosts를 담은) 또는 sdkCosts 그 자체
export function sessionCost(view, sessionId) {
  const c = view && view.sdkCosts ? view.sdkCosts : view;
  const v = c && c.sessions ? c.sessions[sessionId] : null;
  return num(v) ? v : null;
}
