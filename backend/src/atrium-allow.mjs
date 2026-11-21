// P308: 따옴표 꼴 atrium 명령 허용(판 hook의 PreToolUse가 돌려주는 허용 결정).
// Claude Code의 Code Mode(실험 기능, CLAUDE_CODE_EXPERIMENTAL_CODE_MODE)는 셸 명령의 낱말을 하나씩 따옴표로 감싼다(atrium 'plan' 'new' '수집').
// 세션 설정의 허용 규칙(ATRIUM_ALLOW, Bash(atrium plan *) 꼴)은 따옴표 꼴에 맞지 않아 권한을 묻는 방식의 세션은 명령마다 승인 질문이 뜬다.
// 그래서 PreToolUse에 온 Bash·PowerShell 명령을 여기서 낱말로 풀어, 같은 atrium·mtask 동사(ATRIUM_ALLOW에 있는 것)만 허용을 돌려준다.
// 다른 명령이 함께 돌 수 있는 꼴은 모두 거절한다(따옴표 밖의 ; & | < > ( ) { } $ ` 백슬래시 줄바꿈 등, 큰따옴표 안의 $·`, 맨 앞 환경 변수, 전체 경로).
// 따옴표 안 글도 명령 잇기 기호(; & | < > ` $)가 들어 있으면 거절한다(지시). 그런 글은 허용 규칙과 질문으로 간다.
// 거절은 "판이 결정하지 않음"이다: 허용 규칙과 Claude Code의 질문이 그대로 간다.
import { ATRIUM_ALLOW } from './branch.mjs';

const CMDS = new Set(['atrium', 'mtask']);
// ATRIUM_ALLOW의 Bash·PowerShell 규칙에서 동사를 뽑는다(새 동사는 ATRIUM_ALLOW에만 넣으면 여기도 따라온다)
export const ALLOW_VERBS = new Set(ATRIUM_ALLOW.map((r) => /^(?:Bash|PowerShell)\((?:atrium|mtask) ([a-z][a-z-]*)/.exec(r)).filter(Boolean).map((m) => m[1]));
// 따옴표 밖에 그대로 둘 수 있는 글자(낱말 글자, 숫자, 몇 가지 기호). 그 밖은 셸이 다르게 읽을 수 있어 거절한다
const OPERATOR = /[;&|<>`$]/; // 풀린 낱말 안에 있으면 거절(따옴표 안이어도)
const PLAIN = /[\p{L}\p{N}\p{M}_\-.\/:=@%+,~]/u;

// 셸 명령 → 낱말 배열(따옴표를 푼 값). 위험한 꼴이면 null. shell: 'bash' | 'powershell'
export function shellWords(cmd, shell = 'bash') {
  if (typeof cmd !== 'string' || !cmd.trim() || cmd.length > 64 * 1024) return null;
  const ps = shell === 'powershell';
  let s = cmd.trim();
  if (ps && /^&[ \t]/.test(s)) s = s.slice(1).trimStart(); // PowerShell 호출 연산자(& atrium …, & 'atrium' …)
  const words = []; let cur = null; let i = 0;
  const push = () => { if (cur !== null) words.push(cur); cur = null; };
  while (i < s.length) {
    const c = s[i];
    if (c === ' ' || c === '\t') { push(); i++; continue; }
    if (c === "'") { // 작은따옴표: 글 그대로(PowerShell은 ''가 따옴표 하나)
      let j = i + 1; let v = '';
      for (;;) {
        if (j >= s.length) return null;
        if (s[j] === "'") { if (ps && s[j + 1] === "'") { v += "'"; j += 2; continue; } break; }
        v += s[j++];
      }
      cur = (cur ?? '') + v; i = j + 1; continue;
    }
    if (c === '"') { // 큰따옴표: $와 `는 거절(확장·명령 치환). bash는 \가 $ ` " \ 앞에서 빠지고, PowerShell은 ""가 따옴표 하나
      let j = i + 1; let v = '';
      for (;;) {
        if (j >= s.length) return null;
        const d = s[j];
        if (d === '$' || d === '`') return null;
        if (d === '"') { if (ps && s[j + 1] === '"') { v += '"'; j += 2; continue; } break; }
        if (!ps && d === '\\') { const n = s[j + 1]; if (n === undefined) return null; if ('$`"\\'.includes(n)) { v += n; j += 2; continue; } if (n === '\n') { j += 2; continue; } }
        if (ps && '\u201c\u201d\u201e'.includes(d)) return null; // PowerShell은 둥근 큰따옴표도 따옴표로 읽는다
        v += d; j++;
      }
      cur = (cur ?? '') + v; i = j + 1; continue;
    }
    if (!PLAIN.test(c)) return null;
    if (ps && c === '@' && cur === null) return null; // PowerShell 낱말 맨 앞 @(배열·펼치기)
    cur = (cur ?? '') + c; i++;
  }
  push();
  return words.length ? words : null;
}

// PreToolUse의 도구와 입력 → 판이 허용할 atrium 명령인가
export function atriumAllowed(toolName, input) {
  const shell = toolName === 'Bash' ? 'bash' : toolName === 'PowerShell' ? 'powershell' : null;
  if (!shell || !input || typeof input.command !== 'string') return false;
  const w = shellWords(input.command, shell);
  if (!w || w.length < 2 || w.some((x) => OPERATOR.test(x))) return false;
  return CMDS.has(w[0]) && ALLOW_VERBS.has(w[1]);
}

// PreToolUse hook 본문 → 돌려줄 hook 응답(허용) 또는 null(판이 결정하지 않음)
export function preToolUseDecision(body) {
  if (!body || body.hook_event_name !== 'PreToolUse') return null;
  if (!atriumAllowed(body.tool_name, body.tool_input)) return null;
  return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow', permissionDecisionReason: 'Atrium board command' } };
}
