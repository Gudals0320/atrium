// 승인 방식 목록(백엔드 settings.mjs PERMISSION_MODES와 같다). 호출자 창(Launchers.jsx)과 설정 › 합치기(P287 lib/merger.js)가 함께 쓴다.
// React·사전에 기대지 않는 따로 된 파일이라 순수 모듈 어디서나 가져다 쓴다
export const PERMISSION_MODES = ['manual', 'acceptEdits', 'plan', 'auto', 'dontAsk', 'bypassPermissions'];
