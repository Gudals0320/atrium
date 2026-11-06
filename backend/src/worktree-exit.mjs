// P71: `claude -w` 세션의 워크트리 나가기 질문. 세션이 끝날 때 Claude Code가 "Exiting worktree session"을 묻는다(screen.mjs parseWorktreeExit).
// - 판이 세션을 끝낼 때(닫기, 잠재우기, 판 설정으로 다시 띄우기) /exit 뒤에 이 질문이 뜨면 고른 답을 보낸다. 사람이 지우기를 고르지 않았으면 남기기다.
// - 신뢰 질문과는 상관없다(신뢰는 지금처럼 대신 답하지 않는다).
// b는 backend.mjs의 Backend(adapter, store, cfg를 쓴다).
import { parseWorktreeExit } from './screen.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function visible(b, s) {
  try { return await b.adapter.readScreen(s.paneId, { source: 'visible' }); } catch { return ''; }
}

// `claude -w`로 띄운 세션인가. 하위 세션의 --worktree(info), 또는 작업 폴더가 <저장소>/.claude/worktrees/<이름> 안. → { name } | null
export function worktreeOf(s, info = null) {
  if ((s.kind || 'claude') !== 'claude') return null;
  if (info && info.worktree) return { name: info.worktree };
  const m = String((s.rt && s.rt.cwd) || s.cwd || '').match(/[\\/]\.claude[\\/]worktrees[\\/]([^\\/]+)/);
  return m ? { name: m[1] } : null;
}

// 화면에 질문이 있으면 고른 답(keep|remove)의 번호를 보낸다. → 보낸 선택지 | null
export async function answerWorktreeExitOnScreen(b, s, choice, by) {
  const w = parseWorktreeExit(await visible(b, s));
  if (!w) return null;
  const c = choice === 'remove' ? w.remove : w.keep;
  await b.adapter.paneKeys(s.paneId, [String(c.n)]);
  b.store.addEvent(s.sessionId, 'worktree_exit_answered', { choice, label: c.label, commits: w.commits, files: w.files, by });
  return c;
}

// /exit를 보낸 뒤 claude가 끝나기를 ms까지 기다린다. 그동안 질문이 뜨면 고른 답(기본 남기기)을 한 번 보낸다. → 기다린 시간(ms)
export async function waitClaudeExit(b, s, ms, { worktree = 'keep', by = 'close', steps = null } = {}) {
  const t0 = Date.now();
  let answered = (s.kind || 'claude') !== 'claude', readAt = 0;
  while (s.rt.herdr.present && Date.now() - t0 < ms) {
    if (!answered && Date.now() - readAt >= 400) {
      readAt = Date.now();
      const c = await answerWorktreeExitOnScreen(b, s, worktree === 'remove' ? 'remove' : 'keep', by);
      if (c) { answered = true; if (steps) steps.push(`worktree exit: ${c.n}. ${c.label}`); }
    }
    await sleep(200);
  }
  return Date.now() - t0;
}
