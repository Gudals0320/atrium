// P102: 미션 맵의 일하는 카드 번쩍임 박자 맞추기(PC Mission.jsx, 휴대폰 PhoneMission.jsx).
// - 카드가 언제 생겼든 모두 같은 박자로 번쩍이도록, 번쩍임 층의 CSS 움직임이 시작되면(animationstart) 그 시작 시각을 문서 시간 0에 맞춘다.
//   그리는 때와 움직임이 실제로 시작되는 때의 틈(첫 그림이 무거우면 수백 ms)에 흔들리지 않는다. 한 번만 바꾸므로 매 프레임 일은 없다.
// - 움직임 줄이기를 풀어 움직임이 다시 생겨도 animationstart가 다시 와서 맞춘다.
export function alignFlash(el) {
  const list = el && typeof el.getAnimations === 'function' ? el.getAnimations() : [];
  for (const a of list) if (a.startTime !== 0) { try { a.startTime = 0; } catch { /* 옛 브라우저: 박자만 어긋난다 */ } }
}
export const onFlashStart = (e) => alignFlash(e.currentTarget);
