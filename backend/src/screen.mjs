// 화면 요약(ARCH 5절): pane.read 글자에서 마지막 줄, 권한 요청 선택지, 신뢰 대화상자를 읽는다.
// 상태는 화면 글자로 정하지 않는다(2.2). 여기 결과는 상세와 확인에만 쓴다.

export function tailLines(text, n = 12) {
  return String(text || '').split('\n').map((l) => l.trimEnd()).filter((l) => l.trim()).slice(-n);
}

// 신뢰 대화상자(E10 2.2)
export function isTrustDialog(text) { return /Quick safety check/i.test(text) && /trust this folder/i.test(text); }

// P71: 워크트리 나가기 질문. `claude -w`로 띄운 세션이 끝날 때 Claude Code가 묻는다(제목 "Exiting worktree session").
// "You have 13 commits on worktree-x. The branch will be deleted if you remove the worktree." 아래에 "1. Keep worktree", "2. Remove worktree"
// (tmux가 있으면 "Keep worktree and tmux session" 등)가 있다. 선택지 설명(Stays at <경로>)은 다음 줄이라 번호 줄만 읽는다.
// → null | { commits(모르면 null), files(커밋 안 한 파일 수, 없으면 0), branch, keep: { n, label }, remove: { n, label }, choices }
export function parseWorktreeExit(text) {
  const s = String(text || '');
  if (!/Exiting worktree session/i.test(s)) return null;
  const choices = [];
  for (const raw of s.split('\n')) {
    const m = raw.match(/^[\s│|]*(❯\s*)?(\d)\.\s+((?:Keep|Remove) worktree[^│|]*?)\s*[│|]?\s*$/);
    if (m) choices.push({ n: Number(m[2]), label: m[3].trim().split(/\s{2,}/)[0] }); // 같은 줄에 설명(Stays at …)이 붙으면 떼어 낸다
  }
  const keep = choices.find((c) => /^Keep worktree/i.test(c.label)) || null;
  const remove = choices.find((c) => /^Remove worktree/i.test(c.label)) || null;
  if (!keep || !remove) return null;
  const flat = s.replace(/[│|]/g, ' ').replace(/\s+/g, ' '); // 화면 폭에서 꺾인 문장을 잇는다
  const c = flat.match(/\b(\d+) commits?\b/i);
  const f = flat.match(/\b(\d+) uncommitted files?\b/i);
  const b = flat.match(/\bcommits? on (\S+?)\.?\s/i) || flat.match(/\bbranch (\S+?) (?:will be deleted|may hold)/i);
  return { commits: c ? Number(c[1]) : null, files: f ? Number(f[1]) : 0, branch: b ? b[1] : null, keep, remove, choices };
}

// 권한 요청 선택지(E9 2.1): "❯ 1. Yes", "  2. Yes, and …", "  3. No". 화면 아래쪽 마지막 번호 목록을 읽는다.
export function parseChoices(text) {
  const lines = String(text || '').split('\n');
  let block = [];
  let cur = [];
  for (const raw of lines) {
    const m = raw.match(/^\s*(❯\s*)?(\d+)\.\s+(.*\S)\s*$/);
    if (m) cur.push({ n: Number(m[2]), label: m[3], selected: !!m[1] });
    else if (cur.length && /^\s{3,}\S/.test(raw)) cur[cur.length - 1].label += ' ' + raw.trim(); // 화면 폭에서 줄바꿈된 선택지를 이어 붙인다(P2)
    else if (cur.length && raw.trim()) { block = cur; cur = []; }
  }
  if (cur.length) block = cur;
  // 1부터 이어지는 번호만 선택지로 본다
  return block.length && block[0].n === 1 && block.every((c, i) => c.n === i + 1) ? block : [];
}

// 대화상자의 질문 줄("Do you want to create e9-a.txt?")
export function parsePromptLine(text) {
  const m = String(text || '').match(/^\s*(Do you want[^\n]*\?)\s*$/m);
  return m ? m[1].trim() : null;
}


// G2(P5): 일반 셸이 프롬프트에서 쉬는가, 명령을 돌리는가. Windows에서 herdr pane.process_info는 셸 프로세스만 주고
// 셸 아래에서 도는 명령은 주지 않는다(P5에서 확인). 그래서 화면 마지막 줄이 프롬프트인지 보고, 마지막 프롬프트 줄의 명령 글을 읽는다.
// 프로세스 이름은 따로 프로세스 표(셸 PID의 자식)에서 얻는다. 이 결과는 셸의 표시에만 쓴다.
const PROMPTS = [/^PS [^>]*>\s?(.*)$/, /^[A-Za-z]:\\[^>]*>(.*)$/]; // PowerShell, cmd
export function shellPromptState(text) {
  const lines = String(text || '').split('\n').map((l) => l.trimEnd()).filter((l) => l.trim());
  if (!lines.length) return { atPrompt: false, command: null };
  const cmdOf = (l) => { for (const re of PROMPTS) { const m = l.match(re); if (m) return m[1].trim(); } return null; };
  const last = lines[lines.length - 1];
  const atPrompt = cmdOf(last) === '' || /[$#]$/.test(last); // 끝 줄이 빈 프롬프트(bash류는 $, #로 끝남)
  let command = null;
  for (let i = lines.length - (atPrompt ? 2 : 1); i >= 0; i--) { const c = cmdOf(lines[i]); if (c) { command = c; break; } }
  return { atPrompt, command };
}
