// 원격 기기(웹 화면)인가. web.js가 window.mt.web을 둔다
// P191: __mtViewOnly는 창 시험이 PC 창에서 원격의 보기만 화면을 흉내 낼 때 쓴다(할 수 있는 것을 줄이기만 한다)
export const remoteView = () => typeof window !== 'undefined' && (!!(window.mt && window.mt.web) || !!window.__mtViewOnly);
