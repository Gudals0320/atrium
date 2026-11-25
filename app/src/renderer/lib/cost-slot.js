// P361: 세션 맵 카드(MapCard.jsx)의 SDK 금액 칩 자리. MapCard는 휴대폰 맵도 쓰므로 판 store를 끌어오지 않는다.
// PC 창은 SdkCost.jsx가 그리는 함수를 넣고, 휴대폰은 넣지 않아 아무것도 그리지 않는다
let render = () => null;
export const setCostRender = (fn) => { render = typeof fn === 'function' ? fn : () => null; };
export const costRender = (sessionId) => render(sessionId);
