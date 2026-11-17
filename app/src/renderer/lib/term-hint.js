// P206: 터미널 노드 아래 힌트(복사됨, Ctrl+G 막음, 입력 실패). 글이 아니라 열쇠로 두고 그릴 때 번역해 언어를 바꾸면 따라간다.
// 입력 실패 힌트는 다시 연결되거나 다음 입력이 성공하면 지우고, 그렇지 않아도 INPUT_FAIL_MS 뒤 사라진다(P203에서 타이머 없이 남았다)

export const FLASH_MS = 2500; // 복사됨 같은 짧은 알림
export const INPUT_FAIL_MS = 8000; // 입력 실패는 읽을 시간을 조금 더 준다

let seq = 0;
// kind: 'flash' | 'inputFail'. err는 오류 객체(그릴 때 errText로 번역)
export function makeHint(kind, key, { vars = null, err = null } = {}) {
  return { id: ++seq, kind, key, vars, err, ms: kind === 'inputFail' ? INPUT_FAIL_MS : FLASH_MS };
}

// 사건에 따라 다음 힌트. ev: { type: 'show', hint } | { type: 'expire', id } | { type: 'input-ok' } | { type: 'connected' }
export function hintNext(hint, ev) {
  if (!ev) return hint;
  if (ev.type === 'show') return ev.hint || null;
  if (!hint) return null;
  if (ev.type === 'expire') return ev.id === hint.id ? null : hint; // 늦게 온 옛 타이머는 새 힌트를 지우지 않는다
  if (ev.type === 'input-ok' || ev.type === 'connected') return hint.kind === 'inputFail' ? null : hint;
  return hint;
}

// 그릴 글(지금 언어)
export function hintText(hint, t, errText) {
  if (!hint) return '';
  const vars = { ...(hint.vars || {}) };
  if (hint.err !== null && hint.err !== undefined) vars.error = errText(hint.err);
  return t(hint.key, vars);
}
