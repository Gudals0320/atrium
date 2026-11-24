// P358: 터미널이 붙기 전에 친 글(휴대폰 세션 화면의 바로 치기). 버리지 않고 짧게 모았다가 붙은 뒤 한 번에 보낸다.
// 실기기 기록에 terminal.input not_attached 실패가 있었다(터미널이 붙기 전에 친 글). 모을 수 있는 양은 EARLY_MAX 글자(넘는 글은 받지 않는다)
export const EARLY_MAX = 4096;
export function earlyInput(max = EARLY_MAX) {
  let buf = '';
  return {
    // 모았으면 true(넘쳐서 못 모으면 false)
    push(data) { const d = String(data || ''); if (!d) return false; if (buf.length + d.length > max) return false; buf += d; return true; },
    // 모은 글을 꺼내고 비운다
    take() { const b = buf; buf = ''; return b; },
    get size() { return buf.length; },
  };
}
