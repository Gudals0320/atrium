// P282: 판이 업데이트되면 원격 웹 화면(휴대폰·태블릿·PC 브라우저)도 새 화면 코드로 다시 불러온다(순수 함수, 단위 시험 app/test/p282-lib.test.mjs).
// - 화면 빌드 표식: build.mjs가 껍데기(renderer.js·renderer.css·index.html) 내용 해시를 renderer.js 안(__SHELL_BUILD__)과 dist/build.json에 함께 넣는다.
//   백엔드는 /web/me에 지금 내보내는 dist의 표식(build)을 싣는다. 화면은 다시 붙을 때(웹소켓을 다시 열 때마다 /web/me) 자기 표식과 견준다
// - 다르면 다시 불러온다. 같은 표식으로는 한 번만 한다(sessionStorage). 다시 불러와도 옛 코드가 오면(캐시) 그만 둔다(되풀이 없음)
// - 보내지 않은 입력 글은 sessionStorage에 두었다가 다시 불러온 뒤 같은 세션 입력 칸에 되살린다
export const SHELL_TRY_KEY = 'mt.shellReload';
export const DRAFT_KEY = 'mt.reloadDraft';
export const DRAFT_TTL_MS = 10 * 60 * 1000;
const MARK_RE = /^[0-9a-f]{8,64}$/;
export const validMark = (x) => typeof x === 'string' && MARK_RE.test(x);

// mine: 이 화면 코드의 표식, server: 판이 지금 내보내는 표식, tried: 이 탭이 이미 다시 불러 본 표식
// 'none' = 그대로, 'reload' = 다시 불러온다
export function shellReloadPlan({ mine, server, tried }) {
  if (!validMark(mine) || !validMark(server)) return 'none'; // 표식이 없는 옛 판·빌드, 개발 중 빌드 없음
  if (mine === server) return 'none';
  if (tried === server) return 'none'; // 이 표식으로 이미 한 번 했다(실패했으면 그만)
  return 'reload';
}

// 지금 다시 불러와도 되는가: 화면이 숨었거나, 사람이 글 칸에 글을 쓰는 중이 아니면 곧바로.
// 쓰는 중(초점이 글 칸에 있고 글이 있음)이면 글이 비거나 초점이 빠지거나 화면이 숨을 때까지 기다린다
export const reloadReady = ({ hidden = false, typing = false } = {}) => !!hidden || !typing;

// 보내지 않은 입력 글 → sessionStorage 값(없으면 null)
export function packDraft(sessionId, text, now = Date.now()) {
  const t = String(text == null ? '' : text);
  if (!sessionId || !t.trim()) return null;
  return JSON.stringify({ sessionId: String(sessionId), text: t.slice(0, 20000), at: now });
}
// 저장된 값 → 이 세션의 글(다른 세션이거나 오래됐거나 깨졌으면 null)
export function takeDraft(raw, sessionId, now = Date.now()) {
  if (!raw || !sessionId) return null;
  let d; try { d = JSON.parse(raw); } catch { return null; }
  if (!d || d.sessionId !== String(sessionId) || typeof d.text !== 'string' || !d.text.trim()) return null;
  if (!(Number(d.at) > 0) || now - Number(d.at) > DRAFT_TTL_MS || Number(d.at) > now + 60000) return null;
  return d.text;
}
