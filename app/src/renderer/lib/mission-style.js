// P147: 미션 맵 모양. squads = 새 "부대" 지도(MissionSquads.jsx, lib/mission-roster.js), classic = P95~P145의 왼쪽 → 오른쪽 열 지도(Mission.jsx ClassicMap).
// 판 설정 missionStyle(백엔드 settings.mjs)을 따른다. 값이 없거나 모르는 값이면 기본(DEFAULT_MISSION_STYLE). 옛 지도로 되돌리려면 이 기본을 'classic'으로 바꾸거나
// 미션 맵 머리의 모양 단추(또는 `atrium settings set missionStyle classic`)로 판 설정을 바꾼다.
export const MISSION_STYLES = ['squads', 'classic'];
export const DEFAULT_MISSION_STYLE = 'squads';
export const missionStyleOf = (settings) => (settings && MISSION_STYLES.includes(settings.missionStyle) ? settings.missionStyle : DEFAULT_MISSION_STYLE);
