// P328: 판 위 목록(할 일 목록의 세션 이름, 위쪽 알약 목록)에서 세션을 눌러 그 세션으로 갈 때.
// 세션 맵(I6, Tab)이 열려 있으면 맵을 닫고 캔버스에서 그 세션이 보이는 자리로 움직임 없이 한 번에 옮긴다
// (세션 맵 카드를 두 번 누를 때 MissionLineage.jsx go와 같은 길: 닫고 MAP_CLOSE_WAIT 뒤 navigateTo instant). 캔버스에서는 지금처럼(navigateTo 기본 움직임).
// 순수 함수: 부르는 쪽이 판 상태(st)와 맵 닫기(closeMap)를 넘긴다(단위 시험 app/test/p328-lib.test.mjs).
export const MAP_CLOSE_WAIT = 30;
// → 'map' | 'canvas' | null(갈 수 없음)
export function goSession(id, { st, closeMap, later = setTimeout, opts = {} } = {}) {
  if (!id || !st || typeof st.navigateTo !== 'function') return null;
  if (st.missionOpen) {
    if (closeMap) closeMap();
    later(() => { if (typeof st.navigateTo === 'function') st.navigateTo(id, { ...opts, instant: true }); }, MAP_CLOSE_WAIT);
    return 'map';
  }
  st.navigateTo(id, opts);
  return 'canvas';
}
