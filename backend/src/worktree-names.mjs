// P321: 빠른 워크트리 세션의 이름 규칙(순수 함수, 창도 쓴다: app/src/renderer/lib/quick-worktree.js). 판 쪽은 worktree-session.mjs
// 이름: 세션 이름이자 워크트리 이름(영문 소문자로 시작, 소문자·숫자·-, 32자까지. 터미널의 에이전트 이름 규칙과 판 세션 이름 규칙을 함께 지킨다)
export const WT_NAME_RE = /^[a-z][a-z0-9-]{0,31}$/;
export const wtBranch = (name) => 'worktree-' + name;
export const wtRel = (name) => '.claude/worktrees/' + name;
// 자동 이름 wt-<월일>-<a…z>(그 리포에서 겹치지 않게). taken: 쓰인 이름(세션 이름, 워크트리 폴더 이름). 다 차면 wt-<월일>-<수>
export function autoName(date = new Date(), taken = []) {
  const d = new Date(date);
  const mmdd = String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
  const has = new Set([...taken].map((x) => String(x).toLowerCase()));
  for (let c = 97; c <= 122; c++) { const n = 'wt-' + mmdd + '-' + String.fromCharCode(c); if (!has.has(n)) return n; }
  for (let i = 27; i < 1000; i++) { const n = 'wt-' + mmdd + '-' + i; if (!has.has(n)) return n; }
  return 'wt-' + Date.now().toString(36);
}
// 첫 지시의 앞 낱말(영문·숫자, 셋까지, 24자까지)로 짓기: "login bug 고치기" → login-bug. 영문 낱말이 없으면 null(자동 이름을 그대로 둔다)
export function nameFromPrompt(prompt) {
  const words = String(prompt || '').toLowerCase().match(/[a-z0-9]+/g) || [];
  if (!words.some((x) => /[a-z]/.test(x))) return null;
  let out = '';
  for (const x of words.slice(0, 3)) { const n = out ? out + '-' + x : x; if (n.length > 24) break; out = n; }
  if (!out) return null;
  if (!/^[a-z]/.test(out)) out = 'wt-' + out;
  return WT_NAME_RE.test(out) ? out : null;
}
