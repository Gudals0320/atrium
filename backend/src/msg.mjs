// 화면 글 코드(P16): 백엔드가 만들어 화면에 그대로 보이던 글(확인 문구, 자주 나오는 오류)에 열쇠와 값을 함께 준다.
// 창과 Electron main은 열쇠를 사전(app/src/renderer/locales/, 이름 앞에 backend.)으로 번역하고, 열쇠가 없으면 message(한국어)를 그대로 보인다.
// message는 지금처럼 한국어로 둔다. mtask CLI는 message를 찍는다.
// 값 안에 { key, vars }를 다시 넣을 수 있다(창이 그것부터 번역한다). 배열은 쉼표로 잇는다.
export const m = (key, vars = {}) => ({ key, vars });

// 확인을 받는 결과: { needsConfirm: true, message, msg: { key, vars } }
export const confirmResult = (message, msg, extra = {}) => ({ needsConfirm: true, message, msg, ...extra });

// 오류에 열쇠를 붙인다: throw keyed(apiError(...), 'nameTaken', { name })
export function keyed(err, key, vars = {}) { err.key = key; err.vars = vars; return err; }
