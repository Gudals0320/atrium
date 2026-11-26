// P359: 판 중계기(API 키 과금 런처)를 창에서 보이는 순수 함수. 백엔드 auth-relay.mjs의 relay.status 값과 세션의 billing을 읽는다.
// 창은 키 값을 받지도 들고 있지도 않는다(있음/없음만). 넣은 키는 보내는 즉시 입력 칸에서 지운다.
export const RELAY_PLACEHOLDER = '{{authRelay}}';
// 런처 env의 자리표시가 있으면 API 런처
export const isApiLauncher = (l) => !!(l && l.harness === 'claude' && l.env && String(l.env.ANTHROPIC_BASE_URL || '').includes(RELAY_PLACEHOLDER));
// 세션 요약의 billing
export const isApiSession = (s) => !!(s && s.billing === 'api');
// P363: SDK 세션(claude -p, 판 중계기). 런처 하네스 claude-sdk. 옛 대화형 API 런처는 쓸 수 없음(unusable)으로 남는다
export const isSdkSession = (s) => !!(s && s.billing === 'sdk');
export const isSdkLauncher = (l) => !!(l && l.harness === 'claude-sdk');
export const isUnusableLauncher = (l) => !!(l && (l.unusable === 'authRelay' || isApiLauncher(l)));
// P373: 설정 › 런처의 "부가 연결" 절(일반 하네스 목록 아래 따로): SDK 런처와 쓸 수 없음으로 남은 옛 API 런처. 순서는 받은 그대로 나눈다
export const isExtraLauncher = (l) => isSdkLauncher(l) || isUnusableLauncher(l);
export const splitLaunchers = (rows) => ({ main: (rows || []).filter((l) => !isExtraLauncher(l)), extra: (rows || []).filter(isExtraLauncher) });
// P363: 판 노드 입력칸에서 Enter로 보낼 글(끝 공백만 뗀다, 빈 글은 null)
export const sdkDraft = (v) => { const s = String(v || '').replace(/\s+$/, ''); return s.trim() ? s : null; };
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
