// P321: 빠른 워크트리 세션의 이름 규칙(순수 함수, 창도 쓴다: app/src/renderer/lib/quick-worktree.js). 판 쪽은 worktree-session.mjs
// 이름: 세션 이름이자 워크트리 이름(영문 소문자로 시작, 소문자·숫자·-, 32자까지. 터미널의 에이전트 이름 규칙과 판 세션 이름 규칙을 함께 지킨다)
export const WT_NAME_RE = /^[a-z][a-z0-9-]{0,31}$/;
export const wtBranch = (name) => 'worktree-' + name;
export const wtRel = (name) => '.claude/worktrees/' + name;
// P386: 리포 ID(사용자 WorktreeCreate hook과 같은 꼴, 판의 유일한 정의). 주 체크아웃의 절대 경로에서 :·\·/ 묶음을 _로 바꾸고 앞뒤 _를 뺀다.
//   C:/Workspace/multitask → C_Workspace_multitask. hook은 path.resolve 뒤 같은 바꾸기를 한다(p386 시험이 두 값이 같은지 본다)
export const repoIdOf = (root) => String(root || '').replace(/[:\\/]+/g, '_').replace(/^_+|_+$/g, '');
// P386: 판 설정 "워크트리 위치"(worktreeRoot) 값 다듬기: 앞뒤 빈칸, 백슬래시 → 슬래시, 끝 슬래시를 뺀다(드라이브 뿌리 E:/는 그대로). 비면 ''
export function cleanWtRoot(v) {
  const t = String(v || '').trim().replace(/\\/g, '/').replace(/\/+$/, '');
  if (!t) return '';
  return /^[A-Za-z]:$/.test(t) ? t + '/' : t;
}
// P386: 판이 만드는 워크트리(Claude Code가 아닌 하네스)가 들 폴더(슬래시 꼴, 끝에 /). 위치가 비면 <리포>/.claude/worktrees/, 채우면 <위치>/<리포 ID>/
export function boardWtBase(root, wtRoot = '') {
  const r = cleanWtRoot(wtRoot);
  const s = String(root || '').replace(/\\/g, '/').replace(/\/+$/, '');
  if (!r) return s + '/.claude/worktrees/';
  return (r.endsWith('/') ? r : r + '/') + repoIdOf(s) + '/';
}
export const boardWtPath = (root, name, wtRoot = '') => boardWtBase(root, wtRoot) + name;
// P337: Claude Code 워크트리(claude -w <이름>)의 자리는 정해져 있지 않다. 기본은 <리포>/.claude/worktrees/<이름>이지만 사용자의 WorktreeCreate hook이
//   다른 곳(다른 드라이브 등)에 만들 수 있다. 그래서 워크트리는 git 워크트리 목록의 브랜치 worktree-<이름>으로 먼저 알아보고, 폴더 꼴(.claude/worktrees/<이름>)은 그중 한 경우로 둔다.
const segs = (p) => String(p || '').replace(/\\/g, '/').replace(/\/+$/, '').split('/').filter(Boolean);
const brName = (b) => String(b || '').replace(/^refs\/heads\//, '');
// 폴더 경로가 <어디든>/.claude/worktrees/<이름>(또는 그 아래)이면 그 이름, 아니면 null
export function claudeWtDirName(p) {
  const s = segs(p);
  for (let i = 0; i + 2 < s.length; i++) if (s[i].toLowerCase() === '.claude' && s[i + 1].toLowerCase() === 'worktrees') return s[i + 2];
  return null;
}
// 워크트리 목록 항목({ path | key, branch }) → Claude Code 워크트리 이름(브랜치 worktree-<이름>, 아니면 .claude/worktrees/<이름> 폴더) | null
export function claudeWtName(w) {
  if (!w) return null;
  const br = brName(w.branch);
  if (br.startsWith('worktree-') && br.length > 9) return br.slice(9);
  return claudeWtDirName(w.path || w.key);
}
// 워크트리 목록 항목이 이름 name의 Claude Code 워크트리인가(대소문자 무시)
export function isClaudeWt(w, name) {
  const n = claudeWtName(w);
  return !!n && !!name && n.toLowerCase() === String(name).toLowerCase();
}
// 목록에서 이름 name의 워크트리(브랜치로 맞는 것이 먼저, 그다음 폴더 꼴) | null
export function findClaudeWt(list, name) {
  if (!name) return null;
  const lower = String(name).toLowerCase();
  const all = (list || []).filter(Boolean);
  return all.find((w) => brName(w.branch).toLowerCase() === 'worktree-' + lower)
    || all.find((w) => (claudeWtDirName(w.path || w.key) || '').toLowerCase() === lower) || null;
}
// 폴더 이름이 name인 워크트리가 있나(이름 쓰임 검사: hook이 다른 곳에 만든 폴더도 같은 이름을 쓴다). 본 저장소는 빼고 본다
export const wtFolderTaken = (list, name) => (list || []).some((w) => w && !w.main && (segs(w.path || w.key).pop() || '').toLowerCase() === String(name).toLowerCase());
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
