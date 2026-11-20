// P274: 아래 명령 바 위 테두리에 걸친 띠(단위 시험 test/p274-lib.test.mjs).
// P248 스티어링 단추와 P142 받는 세션 칩이 글 칸 옆에 서서 글 칸이 좁아졌다(사용자 2026-11-20). 칩과 스티어링 상태는 바 위 띠로 옮기고,
// 스티어링 단추는 둥근 아이콘 토글로 줄였다. 스티어링 가능 판단은 lib/steer.js(steerTargets) 그대로이고 여기서는 보일 것만 고른다.
// recipients: lib/cmd-input.js recipients()의 답, steerTo: steerTargets()의 답, steer: 토글 켬, hasText: 입력에 글이 있음
// → { show, chips: 앞 세 받는 세션, more: 나머지 수, steer: 'on'(켬, 스티어링할 수 있는 받는 세션이 있음) | 'key'(꺼짐, Ctrl+Enter 안내) | null }
export const HEAD_CHIPS = 3;
export function cmdHead({ recipients, steerTo, steer, hasText } = {}) {
  const list = recipients || [];
  const chips = list.slice(0, HEAD_CHIPS);
  const can = !!(steerTo && steerTo.can && steerTo.can.length);
  const st = can && steer ? 'on' : can && hasText ? 'key' : null;
  return { show: chips.length > 0 || !!st, chips, more: list.length - chips.length, steer: st };
}
