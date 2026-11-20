// P284: 결정 카드의 창 쪽 셈(판 쪽 backend/src/decisions.mjs, API decision.list | decision.answer | decision.ignore, 이벤트 decision.changed { cards }).
// 카드: { id, sessionId, name, workspaceKey, question, options: [], why, createdAt }. 목록은 오래 기다린 것 먼저.

// 판이 준 열린 카드(틀린 줄은 버린다) → 오래 기다린 것 먼저
export function decisionsOf(cards) {
  if (!Array.isArray(cards)) return [];
  return cards.filter((d) => d && Number.isInteger(Number(d.id)) && d.sessionId && typeof d.question === 'string')
    .map((d) => ({ ...d, id: Number(d.id), options: Array.isArray(d.options) ? d.options.map(String) : [] }))
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0) || a.id - b.id);
}
// 세션마다 열린 카드 수
export function countBySession(cards) {
  const m = new Map();
  for (const d of cards || []) m.set(d.sessionId, (m.get(d.sessionId) || 0) + 1);
  return m;
}
// 한 줄 답 칸의 글이 보낼 만한가(빈 글은 아니다)
export const answerReady = (text) => typeof text === 'string' && text.trim().length > 0;
// 카드 하나를 목록에서 뺀다(답·무시 직후, 이벤트를 기다리지 않고 바로 지운다)
export const withoutCard = (cards, id) => (cards || []).filter((d) => d.id !== id);
