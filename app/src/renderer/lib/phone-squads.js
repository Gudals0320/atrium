// P148: 휴대폰 미션 맵의 "부대" 모양(PhoneSquads.jsx). PC 부대 지도(P147, lib/mission-roster.js rosterLayout)를 그대로 쓰고 치수만 손가락에 맞춘다.
// 순수 함수만 둔다(단위 시험 test/p148-lib.test.mjs).
// - 한 열: 기둥 폭의 최소·최대를 화면 폭으로 묶어 기둥이 늘 하나다(가로 화면에서도 한 열, 너무 넓으면 PHONE_MAX에서 멈추고 가운데).
// - 손가락 크기: 하위 줄·혼자인 줄·알약 묶음 줄 44px, 부대 머리(리드 두 줄) 64px, 워크스페이스 머리 40px(누르면 접기).
// - 나무 선의 자리는 rosterLayout이 정한다(머리 동그라미: 왼쪽 여백 10 + 9, 위 28에서 내려온다). phone.css가 이 자리에 동그라미를 둔다.
// - 위 "기다리는 일"은 PC와 같은 dockOf(응답 필요·오류 → 작업 완료).
import { rosterLayout, dockOf, ROSTER } from './mission-roster.js';

export const PHONE_MAX = 720; // 이보다 넓은 화면(가로 태블릿 등)은 이 폭에서 멈추고 가운데
export const PHONE_PAD = 10;
export const PHONE_SQ_SHUT_KEY = 'mt.phoneSquadsShut'; // 접은 워크스페이스(이 기기에만)

// 화면 폭 → 한 열 치수
export function phoneRosterR(width) {
  const w = Math.max(280, Math.min(PHONE_MAX, Math.floor(width || 375)));
  const inner = w - PHONE_PAD * 2;
  return { ...ROSTER, colMin: inner, colMax: inner, gap: 0, pad: PHONE_PAD, fHead: 38, fPad: 6, fGap: 12, wsHead: 40, wsPad: 6, head: 64, row: 44, fold: 44, chipW: 128, chipGap: 6, squadGap: 8, blockGap: 8, indent: 16 };
}

// graph: mission.graph, opt: { width, tiers, order, vgroups, collapsed } → rosterLayout 결과 + dock(기다리는 일 차례) + R
export function phoneSquads(graph, { width = 375, tiers = null, order = [], vgroups = [], collapsed = [] } = {}) {
  const R = phoneRosterR(width);
  const lay = rosterLayout(graph, { collapsed, order, vgroups, tiers, width: R.colMin + R.pad * 2, fit: 0 }, R);
  const tierOf = (id) => (tiers && tiers.get(id)) || null;
  return { ...lay, dock: dockOf(lay.order, tierOf), R };
}
