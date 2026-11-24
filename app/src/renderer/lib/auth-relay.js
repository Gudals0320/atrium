// P359: 판 중계기(API 키 과금 런처)를 창에서 보이는 순수 함수. 백엔드 auth-relay.mjs의 relay.status 값과 세션의 billing을 읽는다.
// 창은 키 값을 받지도 들고 있지도 않는다(있음/없음만). 넣은 키는 보내는 즉시 입력 칸에서 지운다.
export const RELAY_PLACEHOLDER = '{{authRelay}}';
// 런처 env의 자리표시가 있으면 API 런처
export const isApiLauncher = (l) => !!(l && l.harness === 'claude' && l.env && String(l.env.ANTHROPIC_BASE_URL || '').includes(RELAY_PLACEHOLDER));
// 세션 요약의 billing
export const isApiSession = (s) => !!(s && s.billing === 'api');
// 상태 줄: [열쇠, 값] 목록(창 사전 authRelay.*)
export function relayLine(st) {
  if (!st) return { key: 'authRelay.statusUnknown', vars: {} };
  if (!st.keyPresent) return { key: 'authRelay.statusNoKey', vars: {} };
  if (st.running) return { key: 'authRelay.statusRunning', vars: { port: st.port, n: st.requests || 0 } };
  if (st.starting) return { key: 'authRelay.statusStarting', vars: {} };
  return { key: 'authRelay.statusStopped', vars: {} };
}
// 마지막 오류 종류(값 없음) → 보일 글의 열쇠
export const lastErrorKind = (st) => (st && st.lastError && st.lastError.kind ? String(st.lastError.kind).slice(0, 60) : null);
