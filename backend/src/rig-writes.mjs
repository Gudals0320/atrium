// 새 rig의 쓰기 범위와 세션 설정(P249: 옛 rig-amp.mjs에서 새 rig가 쓰는 것만 옮겼다).
// - 역할·빌더 세션은 모두 무인이다. Claude Code는 --permission-mode bypassPermissions로 띄우고, 세션 설정 파일에
//   permissions.deny(정의 파일의 Edit 규칙 + 셸 안의 셸) · hooks.PreToolUse(판이 기다려 답함) · permissions.disableAutoMode를 쓴다.
// - PreToolUse에서 판은 편집 도구(Edit·Write·MultiEdit·NotebookEdit)의 대상이 쓰기 범위 밖이면 묻지 않고 거절하고(writesVerdict),
//   Bash 안의 cmd·powershell·pwsh도 거절한다(nestedShell).
// - Codex는 샌드박스·승인 인자를 걷어 내고 -s workspace-write -a never(codexUnattendedArgs). 섹터 가둠(-C, --add-dir)은 rig-def.mjs codexRoleArgs.
import path from 'node:path';

export const EDIT_TOOLS = ['Edit', 'Write', 'MultiEdit', 'NotebookEdit'];
export const PRE_TOOL_WRITES_TIMEOUT_SEC = 10; // 쓰기 범위만 볼 때(판 안에서 끝난다)
// 판의 고정 거절. Bash 도구로 부르는 셸 안의 셸(PreToolUse의 nestedShell도 같은 것을 본다)
export const SHELL_IN_SHELL_DENY = ['cmd', 'cmd.exe', 'powershell', 'powershell.exe', 'pwsh', 'pwsh.exe'].map((x) => `Bash(${x}:*)`);
// 세션 설정 파일 permissions에 판이 쓰는 칸(Claude Code 2.1.328 설정 스키마). 무인 세션은 disableAutoMode만 쓴다
export const PERMISSION_KEYS = ['disableAutoMode', 'disableBypassPermissionsMode', 'denyInsteadOfPrompting'];

// 권한 규칙의 경로(Claude Code: //는 절대 경로. Windows 경로는 /c/… 꼴)
export function rulePath(abs) {
  let p = path.resolve(abs).split(path.sep).join('/');
  const m = /^([A-Za-z]):\/?(.*)$/.exec(p);
  if (m) p = `/${m[1].toLowerCase()}/${m[2]}`;
  return `/${p.replace(/^\/+/, '/')}`.replace(/\/+$/, '');
}

// 보호 파일의 기준 폴더: 뿌리와, 세션이 워크트리 안이면 그 워크트리
export function protectBases(root, cwd) {
  const out = [root];
  if (cwd) {
    const rel = path.relative(root, cwd).split(path.sep).join('/');
    const m = /^\.claude\/worktrees\/([^/]+)/.exec(rel);
    if (m) out.push(path.join(root, '.claude', 'worktrees', m[1]));
  }
  return out;
}

// 세션 설정 파일에 넣을 것 → { deny, hooks: { PreToolUse: { timeout } }, permissions: { disableAutoMode } }
//   x: { protectedFiles: [뿌리 기준 상대 경로], root, cwd }. 무인(bypassPermissions)이라 bypass 끄기는 쓰지 않는다
export function roleSettingsAmp(x) {
  if (!x) return null;
  const deny = [];
  // 경로 규칙은 Edit(…)만: Claude Code는 Edit 규칙을 파일을 고치는 모든 도구(Write·MultiEdit·NotebookEdit)에 쓴다
  for (const f of x.protectedFiles || []) for (const base of protectBases(x.root, x.cwd)) deny.push(`Edit(${rulePath(path.resolve(base, f))})`);
  deny.push(...SHELL_IN_SHELL_DENY);
  return { deny: [...new Set(deny)], hooks: { PreToolUse: { timeout: PRE_TOOL_WRITES_TIMEOUT_SEC } }, permissions: { disableAutoMode: 'disable' } };
}
// 설정 파일 JSON에 증폭을 덮어 쓴다(판이 만든 파일이라 deny는 모두 판의 것). 바뀌었으면 true
//   allow는 판의 기본 규칙(baseAllow, branch.settingsExtra의 allow) + 증폭의 allow. baseAllow를 주지 않으면 지금 allow에 더하기만 한다
export function applySettingsAmp(j, amp, baseTimeoutSec = 2, baseAllow = null) {
  const before = JSON.stringify(j);
  const deny = amp ? amp.deny : [];
  if (deny.length) j.permissions = { ...(j.permissions || {}), deny };
  else if (j.permissions && j.permissions.deny) { const { deny: _d, ...rest } = j.permissions; j.permissions = rest; if (!Object.keys(rest).length) delete j.permissions; }
  const extra = (amp && amp.allow) || [];
  const allow = [...new Set([...(baseAllow || ((j.permissions && j.permissions.allow) || [])), ...extra])];
  if (allow.length) j.permissions = { ...(j.permissions || {}), allow };
  else if (j.permissions && j.permissions.allow) { const { allow: _a, ...rest } = j.permissions; j.permissions = rest; if (!Object.keys(rest).length) delete j.permissions; }
  // P234: auto·bypass 끄기, 묻지 않고 거절(판의 칸이라 증폭에 없으면 뺀다)
  const want = (amp && amp.permissions) || {};
  for (const k of PERMISSION_KEYS) {
    if (want[k] != null) j.permissions = { ...(j.permissions || {}), [k]: want[k] };
    else if (j.permissions && k in j.permissions) { const { [k]: _x, ...rest } = j.permissions; j.permissions = rest; if (!Object.keys(rest).length) delete j.permissions; }
  }
  for (const [ev, list] of Object.entries(j.hooks || {})) {
    for (const g of list || []) for (const h of g.hooks || []) {
      if (h.type !== 'http') continue;
      const want = amp && amp.hooks[ev];
      h.timeout = want ? want.timeout : baseTimeoutSec;
      if (want && want.onFailure) h.onFailure = want.onFailure; else delete h.onFailure;
    }
  }
  return JSON.stringify(j) !== before;
}

// Codex 인자: 샌드박스·승인 인자를 걷어 내고 --sandbox workspace-write --ask-for-approval never
const SANDBOX_VALUE_FLAGS = new Set(['-s', '--sandbox']);
const SANDBOX_BARE_FLAGS = new Set(['--dangerously-bypass-approvals-and-sandbox', '--yolo', '--full-auto']);
// --approve-for-me는 Codex가 --sandbox·--ask-for-approval과 함께 받지 않는다(종료 코드 2). 걷어 낸다
const SANDBOX_CONFLICT_FLAGS = new Set(['--approve-for-me']);
const APPROVAL_FLAGS = new Set(['-a', '--ask-for-approval']);
const SANDBOX_KEY = /^sandbox_mode\s*=/;
const APPROVAL_KEY = /^approval_policy\s*=/;
export function codexUnattendedArgs(args = []) {
  const a = (args || []).map(String);
  const out = [];
  for (let i = 0; i < a.length; i++) {
    const w = a[i]; const flag = w.split('=')[0];
    if (SANDBOX_VALUE_FLAGS.has(flag) || APPROVAL_FLAGS.has(flag)) { if (!w.includes('=')) i++; continue; }
    if (SANDBOX_BARE_FLAGS.has(w) || SANDBOX_CONFLICT_FLAGS.has(w)) continue;
    if ((w === '-c' || w === '--config') && (SANDBOX_KEY.test(a[i + 1] || '') || APPROVAL_KEY.test(a[i + 1] || ''))) { i++; continue; }
    if ((w.startsWith('--config=') && (SANDBOX_KEY.test(w.slice(9)) || APPROVAL_KEY.test(w.slice(9)))) || (w.startsWith('-c') && w.length > 2 && (SANDBOX_KEY.test(w.slice(2)) || APPROVAL_KEY.test(w.slice(2))))) continue;
    out.push(w);
  }
  out.push('--sandbox', 'workspace-write', '--ask-for-approval', 'never');
  return out;
}

// 셸 안의 셸(Bash 도구로 cmd·powershell·pwsh를 부름). 명령의 앞이나 &&·||·;·|·&·( 뒤에 오는 cmd(.exe)·powershell(.exe)·pwsh(.exe)만 본다(경로·따옴표가 붙어도)
const NESTED_SHELL_RE = /(?:^|&&|\|\||[;|&\n(]|\$\()\s*["']?(?:[A-Za-z]:)?(?:[^\s;&|'"]*[\\/])?(cmd|powershell|pwsh)(?:\.exe)?["']?(?=\s|$)/i;
export function nestedShell(command) { const m = NESTED_SHELL_RE.exec(String(command || '')); return m ? m[1].toLowerCase() : null; }
// 쓰기 범위(경로 목록) 판정: 파일 쓰기 도구의 대상이 범위 밖이면 까닭, 안이면 null
export function writesVerdict({ writes, toolName, toolInput, base, unitId = null }) {
  if (!Array.isArray(writes) || !EDIT_TOOLS.includes(toolName)) return null;
  const file = toolInput && (toolInput.file_path || toolInput.notebook_path || toolInput.path);
  if (!file) return null;
  const abs = path.resolve(base, String(file));
  const norm = (p) => path.resolve(p).toLowerCase();
  const roots = writes.filter((p) => unitId || !p.includes('{item}')).map((p) => path.resolve(base, p.split('{item}').join(unitId || '')));
  const ok = roots.some((r) => { const rel = path.relative(norm(r), norm(abs)); return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel)); });
  return ok ? null : `쓰기 범위 밖이다: ${String(file)}. 쓸 수 있는 곳: ${writes.join(', ')}`;
}

// PreToolUse 응답 본문(거절)
export const denyBody = (reason) => ({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } });
