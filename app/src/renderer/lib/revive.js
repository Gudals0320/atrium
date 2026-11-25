// P360: 되살리기·갈라 열기 화면의 순수 함수(창 시험이 node로 부른다)
// 갈라 열 수 있는 것: Claude Code 세션(대화형·SDK). 셸·다른 하네스는 아니다. s는 판 세션 요약이나 닫힌·보관된 줄
export const forkable = (s) => !!s && !!s.sessionId && (s.kind || 'claude') === 'claude';
// 단추 제목: 키가 없으면 까닭, 모르면(읽는 중) 보통 설명
export function forkTitle(t, keyPresent) {
  if (keyPresent === false) return t('revive.noKeyTitle');
  return t('revive.forkTitle');
}
// 1234567 → "1.2M", 23060 → "23k", 900 → "900"
export function fmtTokens(n) {
  const v = Number(n) || 0;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e4) return `${Math.round(v / 1e3)}k`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}k`;
  return String(Math.round(v));
}

// 갈라 온 계보 선 자료: 원래 세션과 갈라 연 세션이 둘 다 보이면 선 하나
export function forkLines(sessions, here = () => true) {
  const out = [];
  for (const s of sessions.values()) {
    const f = s.forkFrom;
    if (!f || !f.sessionId || f.sessionId === s.sessionId || !sessions.has(f.sessionId)) continue;
    if (!here(f.sessionId) || !here(s.sessionId)) continue;
    out.push({ id: `fork:${s.sessionId}`, source: f.sessionId, target: s.sessionId });
  }
  return out;
}
