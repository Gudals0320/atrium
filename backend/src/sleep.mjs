// P21(ARCH 4절 D4 잠재우기) → P24: 리포(워크스페이스) 단위로 잠재우고 깨운다.
// - 잠재우기: 리포 하나에 sleepAfterMin(분, 0이면 끔) 동안 아무 일이 없으면 그 리포의 잠재울 수 있는 세션(판이 띄운 Claude Code)을 모두 잠재운다.
//   세션 하나는 claude를 /exit로 끝내고 그 터미널 패널(작업 공간)까지 닫는다(셸과 MCP 서버도 끝난다). 세션은 판에 남는 상태 sleeping이다
//   (노드, 자리, 덩어리, 연결, 부모·자식, 메모, 이름 그대로). 세션 하나만 잠드는 규칙은 없다(P24에서 뺌). 셸과 다른 종류는 그대로 둔다.
// - "아무 일"(sessionActivity): 그 리포의 어떤 세션이든 일하는 중·내 차례·신뢰 대기·시작 중, 전달 대기, 돌아가는 루프, 보내지 않은 초안,
//   화면에서 보는 노드(초점, 가까이 얼굴), 다른 리포에서 일하는 하위 세션이 있는 부모(그리고 P21처럼 일하는 부모의 하위 세션).
//   P159: 부모·하위는 일 관계(일 부모)로 센다. 동료·독립은 서로를 깨어 있게 하지 않는다.
//   사람이 손댄 때(보기·입력·보내기)는 쉬기 시작한 때(idleSince)로 센다. 마지막 일이 끝난 뒤 정한 시간이 지나야 잠재운다(일이 보인 때를 tick마다 기억한다).
//   P105: 도는 Claude Code 뒤 일(뒤 셸·뒤 하위 에이전트, backgroundOf)도 일이다. /exit에 뒤 일 확인 창이 뜨거나 claude가 끝나지 않으면 Esc로 화면을 돌리고
//   그 세션은 다음 활동까지(또는 SLEEP_RETRY_MS, 실패마다 두 배) 다시 잠재우지 않는다. 셸 세션과 같은 작업 공간의 다른 패널은 끄지 않는다(이 패널만 닫는다).
// - 깨우기: 잠든 리포의 노드 하나를 누르거나 그 리포의 세션 하나에 글을 보내면 그 리포에서 잠든 세션을 모두 깨운다.
//   부른 세션을 먼저 깨우고 나머지는 WAKE_STAGGER_MS 간격으로 차례로 띄운다(claude 여럿이 한꺼번에 뜨는 부담을 나눈다). 글은 그 세션이 준비된 뒤 대기열이 보낸다.
//   같은 대화 ID로 새 작업 공간을 만들어 판의 인자로 이어 간다(J1 recreate_resume과 같은 길, 갈라 열기 없음). 실패하면 까닭을 남기고 잠듦으로 둔다.
// - P111 세션 규칙: 리포가 바빠도(지휘 세션이 일하는 동안) sessionSleepAfterMin(분, 0이면 끔) 동안 쉰 세션은 혼자 잠재운다(sessionSleepPlan).
//   "쉼"은 sessionActivity를 그 세션 하나에 적용한 것이고, 일하는 자손(하위의 하위까지)이 있으면 잠재우지 않는다.
//   일하는 부모는 막지 않는다(늘 일하는 지휘 세션 아래 끝난 워커가 남지 않게. 부모가 atrium prompt로 부르면 판이 그 세션을 깨운다).
//   tick은 리포 규칙을 먼저 본다. 잠든 세션은 rt.sleep.scope에 까닭(repo | session)을 남긴다. 리포 규칙이 리포를 잠재워도 혼자 잠든 세션은 session 그대로다.
//   깨우기: 혼자 잠든 세션(scope session)은 그 세션만 깨운다. 리포째 잠든 세션을 깨우면 리포째 잠든 세션만 함께 깨운다(혼자 잠든 세션은 그대로).
//   이름표 메뉴의 "이 리포 깨우기"(workspace.wake)는 사람이 리포를 고른 것이라 둘 다 깨운다.
import fs from 'node:fs';
import { buildStartArgs, buildResumeArgs, transcriptPathFor } from './launch.mjs';
import { resumeModel } from './model-now.mjs'; // P227: 이어 갈 모델·노력 수준
import { deriveState } from './state.mjs';
import { waitClaudeExitOr } from './worktree-exit.mjs'; // P71, P105
import { startOpt } from './launchers.mjs'; // P97: 실행 명령
import { readProcessTable, descendants, mb, childCommands, isToolCommand, suspectTree, logOnce } from './resources.mjs';
import { workspaceNames } from './workspaces.mjs';
import { m, keyed } from './msg.mjs';
import { resumable, harnessResumable } from './harness.mjs'; // P170: 판이 이어 갈 수 있는 하네스(codex, opencode, pi)
import { readDraftBox } from './draft-aside.mjs'; // P170: 하네스 입력 칸에 보내지 않은 글이 있는가
import { innerWork, fileSignals, readerSignals, procsCpuMs } from './inner-work.mjs'; // P329: procsCpuMs(표의 CPU 100ns → ms) // P296: 자체 오케스트레이션 세션의 안 일(바쁨 신호)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function apiError(code, message) { return Object.assign(new Error(message), { code }); }
function pidAlive(pid) { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } }

export const SLEEP_TICK_MS = 30000;
const INNER_RESCAN_MS = 5000; // P296 // 저절로 잠재울 리포를 보는 간격
export const WAKE_READY_MS = 90000; // 깨운 claude가 준비될 때까지 기다리는 상한
export const WAKE_SETTLE_MS = 2500; // 준비된 뒤 입력 칸이 Enter를 받을 때까지 더 기다리는 시간(그동안 전달은 기다린다)
export const WAKE_STAGGER_MS = 1500;
const LEARN_MS = 30000; // P170: 하네스 대화 ID 찾기 간격(세션마다) // 리포를 깨울 때 세션 사이 간격
const BUSY = new Set(['working', 'waiting', 'trust_wait', 'starting']); // 하위·부모 세션이 "일하는 중"
// P105: 잠재우기가 실패한 세션(/exit 뒤에도 claude가 남음, 뒤 일 확인 창)은 다음 활동까지, 또는 이 간격(실패할 때마다 두 배, 상한 MAX)이 지나야 다시 해 본다
export const SLEEP_RETRY_MS = 30 * 60000;
export const SLEEP_RETRY_MAX_MS = 4 * 60 * 60000;
// P105: hook(Stop의 background_tasks)이 알려 준 뒤 일을 프로세스로 확인할 수 없을 때(뒤 하위 에이전트) 믿는 상한. 턴을 Esc로 끊어 Stop이 오지 않으면 기록이 낡는다
export const BG_HOOK_MAX_MS = 2 * 60 * 60000;
// 리포를 잠재우지 않는 까닭: 대상 없음(asleep, nothing), 일(sessionActivity), 시간(off, idle_short), terminal_down, 잠재우기 실패 뒤 기다림(sleep_failed, P105)
// P296: inner_work — 자체 오케스트레이션 세션이 안에서 일하는 중(바쁨 신호: 자손 프로세스·CPU·상태 파일). 손으로 잠재울 때도
export const SLEEP_REASONS = ['asleep', 'nothing', 'waking', 'working', 'needs_you', 'draft', 'delivering', 'loop', 'inner_work', 'background', 'child_busy', 'parent_busy', 'viewing', 'off', 'idle_short', 'terminal_down', 'sleep_failed'];
const ACTIVITY = new Set(['waking', 'working', 'needs_you', 'draft', 'delivering', 'loop', 'inner_work', 'background', 'child_busy', 'parent_busy', 'viewing']);
export const isActivity = (why) => ACTIVITY.has(why);

// P105: 세션에 도는 Claude Code 뒤 일(뒤 셸·뒤 하위 에이전트)이 있는가. 순수 함수. → { n, via: 'process'|'hook' } | null
// hook: rt.bg(마지막 Stop·SubagentStop의 background_tasks, P92), scan: claude 바로 아래 도구 명령을 센 것 { at, n } | null(모름)
// - 도구 명령 프로세스(Bash·PowerShell 도구, MCP 서버 빼고)가 있으면 뒤 일이다(hook이 없는 옛 Claude Code도).
// - hook 목록은 BG_HOOK_MAX_MS까지 믿는다. hook 뒤에 프로세스를 보았는데 도구 명령이 없으면 뒤 셸은 끝났다(목록이 낡음). 뒤 하위 에이전트는 프로세스가 따로 없어 hook만 본다.
//   뒤 일이 끝나면 Claude Code가 새 턴(<task-notification>)을 돌리고 그 Stop이 목록을 줄이므로, 보통은 그 턴이 끝난 때부터 다시 쉰 시간을 센다.
export function backgroundOf(hook, scan, now = Date.now()) {
  if (scan && scan.n > 0) return { n: scan.n, via: 'process' };
  const tasks = hook && Array.isArray(hook.tasks) ? hook.tasks : [];
  if (!tasks.length || now - (hook.at || 0) > BG_HOOK_MAX_MS) return null;
  const left = scan && scan.at >= (hook.at || 0) ? tasks.filter((t) => t.type !== 'shell') : tasks;
  return left.length ? { n: left.length, via: 'hook' } : null;
}

// P246: Claude Code가 아닌 하네스(codex, agy, opencode, pi …)의 뒤 일 세기. 그 하네스는 뒤 일 신호(hook)가 없고 명령줄 표시도 없어,
// 하네스 프로세스(root) 아래 나무에서 하네스가 뜬 뒤 HARNESS_SETTLE_MS가 지나 생긴 셸 프로세스(HARNESS_SHELL_RE)를 센다(셸 안의 셸은 하나로).
// 하네스의 셸 도구는 명령이 끝날 때까지 셸이 남으므로 뒤에서 도는 명령도 셸로 보인다. 띄울 때 함께 뜬 것(MCP 서버의 cmd /c npx, .cmd 실행 껍데기)은 빠진다.
// 한계: 셸이 끝나고 떨어져 나간 프로세스(Start-Process, start, nohup &, setsid)는 부모가 사라져 나무에 없다. 하네스가 늦게 띄운 셸 꼴 도우미(늦게 뜨는 LSP·MCP의 cmd /c)는 일로 센다.
// procs: readProcessTable의 Map(pid → { pid, ppid, name, created }), root: 하네스(또는 셸) PID, harness: root가 하네스 자신인가. 순수 함수 → 수
export const HARNESS_SHELL_RE = /^(powershell|pwsh|cmd|bash|sh|zsh|dash|fish|nu|wsl|busybox)(\.exe)?$/i;
export const HARNESS_SETTLE_MS = 30000;
export function harnessWork(procs, root, { harness = true, launchedAt = 0, settleMs = HARNESS_SETTLE_MS } = {}) {
  const tree = descendants(procs, Number(root));
  if (!tree.length) return 0;
  const top = tree[0];
  const born = harness && Number.isFinite(top.created) ? top.created : launchedAt || top.created || 0;
  const since = born + settleMs;
  const byPid = new Map(tree.map((p) => [p.pid, p]));
  const work = (p) => p !== top && HARNESS_SHELL_RE.test(String(p.name || '')) && Number.isFinite(p.created) && p.created >= since;
  let n = 0;
  for (const p of tree) {
    if (!work(p)) continue;
    let a = byPid.get(p.ppid), nested = false;
    while (a && a !== top) { if (work(a)) { nested = true; break; } a = byPid.get(a.ppid); }
    if (!nested) n++;
  }
  return n;
}

// P164: 세션 맵에 보일 "지금 도는 뒤 일" 목록. 순수 함수. → { n, kinds, items: [{ kind, label }], at, via } | null
// hook·scan은 backgroundOf와 같다. 종류 kind: shell(뒤 셸) | agent(뒤 하위 에이전트) | other.
// - 셸 수: hook 뒤에 프로세스를 보았으면 그 수(0이면 hook의 셸 항목은 끝났다), 아니면 hook 셸 항목 수와 본 수 가운데 큰 것. 설명은 hook 항목 차례로 붙이고 모자라면 빈 줄(프로세스만 앎)
// - 셸이 아닌 항목(하위 에이전트)은 프로세스가 따로 없어 hook을 BG_HOOK_MAX_MS까지 믿는다. 끝나면 Claude Code가 새 턴을 돌리고 그 Stop이 목록을 줄인다
// - 있다/없다는 backgroundOf와 같게 나온다(절전 판정과 화면이 어긋나지 않게)
const BG_KIND = { shell: 'shell', subagent: 'agent' };
export function backgroundList(hook, scan, now = Date.now()) {
  const hat = (hook && hook.at) || 0;
  const tasks = hook && Array.isArray(hook.tasks) && now - hat <= BG_HOOK_MAX_MS ? hook.tasks : [];
  const after = !!(scan && scan.at >= hat);
  const shells = tasks.filter((t) => t.type === 'shell'), others = tasks.filter((t) => t.type !== 'shell');
  const seen = scan ? Math.max(0, Number(scan.n) || 0) : 0;
  const nShell = after ? seen : Math.max(shells.length, seen);
  const items = [];
  for (let i = 0; i < nShell; i++) items.push({ kind: 'shell', label: (shells[i] && shells[i].label) || null });
  for (const t of others) items.push({ kind: BG_KIND[t.type] || 'other', label: t.label || null });
  if (!items.length) return null;
  const kinds = [...new Set(items.map((x) => x.kind))];
  const via = seen > 0 ? (others.length || shells.length ? 'both' : 'process') : 'hook';
  return { n: items.length, kinds, items: items.slice(0, 20), at: Math.max(hat, after ? scan.at : 0) || null, via };
}

// P105: /exit에 Claude Code가 띄우는 "뒤 일이 돈다" 확인 창(Background work is running … 1. Exit and stop tasks 2. Move to background and exit 3. Stay).
// 그대로 두면 판이 "응답 필요"로 보이고, 사람이 Enter를 누르면 1번(뒤 일을 끄고 나감)이 골라진다. 순수 함수. → { tasks: 목록 줄 수 } | null
export function parseExitBackground(screen) {
  const t = String(screen || '');
  if (!/Background work is running|will stop when you exit/i.test(t)) return null;
  return { tasks: (t.match(/^\s*[a-z-]+ · /gim) || []).length };
}

// 판 터미널에서 친 글이 입력 칸에 남아 있는지(보내지 않은 초안). 잠재우기의 /exit와 Enter가 그 글 뒤에 붙어 초안을 제출하지 않게 한다.
// 키 입력 덩어리 data를 차례로 본다: Enter(\r, \n)·Ctrl+C·Ctrl+U는 입력 칸을 비우거나 제출하므로 초안 없음,
// 글자(붙여 넣기 포함)는 초안 있음, 지우기·화살표·초점 알림 같은 이스케이프 열은 그대로. 순수 함수
// P120: 터미널(xterm.js)이 프로그램의 물음에 대신 답하는 열도 사람의 입력이 아니다. 배경색(OSC 11 → ESC ]11;rgb:… ST),
//   터미널 이름(XTVERSION → DCS ESC P>|… ST), 두 번째 장치 속성(DA2 → ESC [>0;276;0c), SGR 마우스(ESC [<0;3;4M), X10 마우스(ESC [M + 세 바이트)를
//   전에는 이스케이프 머리만 지우고 나머지 글자를 친 글로 세었다
export function draftAfterInput(prev, data) {
  let draft = !!prev;
  const s = String(data || '')
    .replace(/\x1b\[20[01]~/g, '') // 붙여 넣기 괄호(안의 글은 남긴다)
    .replace(/\x1b[\]P_^X][\s\S]*?(\x07|\x1b\\|\x9c|$)/g, '') // OSC·DCS·APC·PM·SOS 문자열(BEL이나 ST까지, 덩어리 끝에서 잘린 것도)
    .replace(/\x1b\[M[\s\S]{0,3}/g, '') // X10 마우스 보고
    .replace(/\x1b(\[[0-?]*[ -\/]*[@-~]|O.|.)/g, ''); // CSI(인자 0x30~0x3f: < = > ? 포함), SS3, 두 글자 이스케이프
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if (ch === '\r' || ch === '\n' || c === 0x03 || c === 0x15) draft = false;
    else if (c >= 0x20 && c !== 0x7f) draft = true;
  }
  return draft;
}

// P126: 입력 덩어리가 터미널이 대신 보낸 보고뿐인가(사람이 친 키가 아니다). 마우스 보고(SGR·X10: 휠, 누르기, 움직임), 초점 알림(ESC[I, ESC[O),
// 장치 속성·커서 자리 답(ESC[?…c, ESC[>…c, ESC[…R), OSC·DCS 답. 이런 입력은 전달 규칙 4("사람이 3초 안에 쳤으면 기다린다")의 사람 입력으로 세지 않는다.
// 노드 위에서 휠을 굴리는 동안 판의 전달이 user_typing으로 계속 미뤄졌다. 순수 함수
export function terminalReportsOnly(data) {
  const s = String(data || '');
  if (!s) return false;
  const rest = s
    .replace(/\x1b[\]P][\s\S]*?(\x07|\x1b\\|\x9c|$)/g, '') // OSC·DCS 답
    .replace(/\x1b\[M[\s\S]{3}/g, '') // X10 마우스
    .replace(/\x1b\[<\d+;\d+;\d+[Mm]/g, '') // SGR 마우스
    .replace(/\x1b\[[IO]/g, '') // 초점 알림
    .replace(/\x1b\[[?>=]?[\d;]*c/g, '') // 장치 속성 답(DA1·DA2·DA3)
    .replace(/\x1b\[\d+;\d+R/g, ''); // 커서 자리 답(CPR)
  return rest.length === 0;
}

// 세션 하나가 리포를 잠재울 때의 대상인가(null이면 대상, 아니면 빠지는 까닭). 순수 함수
// x: { kind, hooked, harness, convKnown, state, sleeping, waking, closing, blocked, idleSince }
// blocked(P105): 잠재우기가 실패해 다시 해 보기를 미룬 세션. 사람이 이 리포를 잠재울 때(hand)는 다시 해 본다
// P170: 판이 띄우고 하네스 이어 가기가 되는 종류(codex, opencode, pi: harnessResumable → x.harness)도 대상이다. 이어 갈 대화 ID(convKnown)를 알아야 한다.
//   그 종류는 뒤 일(뒤 셸·뒤 하위 에이전트)을 모르므로, 쉰 시간을 보지 않는 모두 잠재우기(bulk)에서도 쉬는 상태가 afterMs 동안 이어졌을 때만 넣는다
export function sleepTarget(x, { mode = 'auto', now = Date.now(), afterMs = 0 } = {}) {
  if (x.sleeping) return 'sleeping';
  const claude = x.kind === 'claude';
  if (!claude && !resumable(x.kind)) return 'not_claude'; // 셸, 표에 없는 종류
  if (claude ? !x.hooked : !x.harness) return 'not_board'; // 판에 올린 claude, 판이 띄우지 않았거나 이어 갈 값이 없는 하네스
  if (!x.convKnown) return 'no_convo';
  if (x.waking) return 'waking';
  if (x.closing) return 'closing';
  if (x.state !== 'ready' && x.state !== 'error') return 'not_ready'; // 오류로 끝난 턴도 쉬는 중이다(안 본 답은 검토 대기로 남는다)
  if (x.blocked && mode !== 'hand') return 'sleep_failed';
  if (!claude && mode === 'bulk' && afterMs && now - (x.idleSince || 0) < afterMs) return 'idle_short';
  return null;
}

// 세션 하나가 그 리포를 깨워 두는 일(없으면 null). 순수 함수.
// x: { kind, state, waking, draft, delivering, loops, bg, childBusy, parentBusy, viewed }
// mode: auto(저절로), bulk(쉬는 리포 모두), hand(사람이 이 리포를 잠재움. 메뉴를 누르면 늘 보고 있으므로 보는 노드는 보지 않는다)
export function sessionActivity(x, { mode = 'auto' } = {}) {
  if (x.waking) return 'waking';
  if (x.state === 'working' || x.state === 'starting') return 'working';
  if (x.state === 'waiting' || x.state === 'trust_wait') return 'needs_you';
  if (x.draft && x.kind !== 'shell') return 'draft'; // 손으로 잠재울 때도: /exit가 초안 뒤에 붙어 제출된다. P170: 하네스는 Ctrl+C가 초안을 지운다
  if (x.delivering) return 'delivering';
  if (x.loops) return 'loop';
  if (x.inner) return 'inner_work'; // P296: 안의 에이전트가 화면 없이 돈다(잠재우면 함께 끝난다)
  if (x.bg) return 'background'; // P105: 뒤 셸·뒤 하위 에이전트. 손으로 잠재울 때도(잠재우면 claude와 함께 끝난다)
  if (x.childBusy) return 'child_busy';
  if (x.parentBusy) return 'parent_busy';
  if (x.viewed && mode !== 'hand') return 'viewing';
  return null;
}

// P111: 세션 하나를 혼자 잠재울지(리포가 바빠도). 순수 함수.
// x: info()의 값(sleepTarget·sessionActivity의 값, idleSince, descBusy: 일하는 자손), busyAt: 그 세션에 마지막으로 일이 보인 때(보던 노드 등)
// → { why, since, target }. why가 null이면 잠재운다. 일하는 부모(parentBusy)는 보지 않는다(머리 주석)
export function sessionSleepPlan(x, { now = Date.now(), afterMs = 0, busyAt = 0 } = {}) {
  const since = Math.max(busyAt || 0, x.idleSince || 0);
  const a = sessionActivity({ ...x, childBusy: x.descBusy ?? x.childBusy, parentBusy: false }, { mode: 'auto' });
  if (a) return { why: a, since, target: null };
  const t = sleepTarget(x, { mode: 'auto', now, afterMs });
  if (t) return { why: t === 'sleeping' ? 'asleep' : t === 'sleep_failed' || t === 'waking' ? t : 'nothing', since, target: t };
  if (!afterMs) return { why: 'off', since, target: null };
  if (now - since < afterMs) return { why: 'idle_short', since, target: null };
  return { why: null, since, target: null };
}
// 잠든 세션이 왜 잠들었는가(P111). 옛 기록(scope 없음)과 손·모두 잠재우기는 리포째다
export const sleepScope = (s) => (s && s.rt && s.rt.sleep && s.rt.sleep.scope) || 'repo';

// 리포 하나를 지금 잠재울지. 순수 함수.
// list: 그 리포 세션들의 { name, ...sleepTarget·sessionActivity의 값, idleSince }, busyAt: 그 리포에 마지막으로 일이 보인 때
// → { why, who, targets, since }. why가 null이면 targets(이름)를 잠재운다. who는 일이 있는 세션 이름
export function repoSleepPlan(list, { mode = 'auto', now = Date.now(), afterMs = 0, busyAt = 0 } = {}) {
  const targets = list.filter((x) => !sleepTarget(x, { mode, now, afterMs })).map((x) => x.name);
  const since = Math.max(busyAt || 0, ...list.map((x) => x.idleSince || 0));
  const base = { targets, since, who: null };
  for (const x of list) { const a = sessionActivity(x, { mode }); if (a) return { ...base, why: a, who: x.name }; }
  if (!targets.length) {
    const blocked = list.find((x) => sleepTarget(x, { mode, now, afterMs }) === 'sleep_failed'); // P105: 실패한 잠재우기를 미루는 중
    if (blocked) return { ...base, why: 'sleep_failed', who: blocked.name };
    return { ...base, why: list.some((x) => x.sleeping) ? 'asleep' : 'nothing' };
  }
  if (mode === 'auto') {
    if (!afterMs) return { ...base, why: 'off' };
    if (now - since < afterMs) return { ...base, why: 'idle_short' };
  }
  return { ...base, why: null };
}

// 쉬기 시작한 때: 마지막 활동, 턴 끝, 사람이 손댄 때, 깬 때, 띄운 때 가운데 가장 늦은 것.
// 마지막 활동은 hook이 오는 세션이면 마지막 hook이다. 터미널 상태 알림은 같은 idle이어도 다시 오고(같은 서버의 다른 패널을 닫거나 구독을 고칠 때)
// 그때마다 lastActivityAt이 늘어나므로 쓰지 않는다(P24 창 시험: 한 세션을 잠재우면 리포의 다른 세션이 다시 1분을 기다렸다). 일하는 중은 busyAt이 따로 센다.
// 셸은 돌리는 명령(개발 서버 등)이 리포를 깨워 두지 않도록 사람이 손댄 때만 센다
export function idleSince(s) {
  if (s.kind === 'shell') return s.touchedAt || 0;
  const rt = s.rt || {};
  // P170: hook이 없는 하네스(codex 등)는 터미널 상태 알림마다 lastActivityAt이 늘어나므로 턴 끝(일하는 중 → 쉼, state.mjs applyTermStatus)만 센다
  const act = rt.lastHookAt != null ? rt.lastHookAt : (s.kind || 'claude') === 'claude' ? rt.lastActivityAt : 0;
  return Math.max(act || 0, (rt.turn && rt.turn.endedAt) || 0, s.touchedAt || 0, s.wokeAt || 0, rt.launchedAt || 0);
}

// 이어 갈 대화 ID와 대화 기록. hook이 알려 준 대화 ID(Claude Code 안에서 /clear하면 바뀐다)가 먼저다
export function convoOf(s, claudeProjects) {
  const convId = (s.rt && s.rt.claudeSessionId) || s.sessionId;
  const tx = (s.rt && s.rt.transcriptPath) || (s.cwd ? transcriptPathFor(claudeProjects, s.cwd, convId) : null);
  let exists = false; try { exists = !!tx && fs.statSync(tx).isFile(); } catch {}
  return { convId, transcript: tx, exists };
}

// 깨울 때의 실행 인자. 대화 기록이 있으면 그 대화로 이어 가고, 없으면(잠든 동안 지워짐) 같은 세션 ID로 새로 띄운다
// P227: 이어 갈 때 모델·노력 수준은 그 대화가 마지막으로 쓰던 값(now: s.rt.modelNow, resumeModel). 새로 띄울 때는 띄운 값
export function wakeArgs(launch, conv, now = null) {
  if (!conv.exists) return { plan: 'fresh', args: buildStartArgs(launch) };
  const rm = resumeModel('claude', launch, now);
  return { plan: 'resume', args: buildResumeArgs({ ...launch, model: rm.model, effort: rm.effort, sessionId: conv.convId }), model: rm };
}

// P170: 하네스 세션의 이어 갈 대화 ID(판 기록, 터미널이 아는 것). 값싼 것만 본다(Codex rollout 찾기는 잠재울 때만, backend.harnessSessionIdOf)
export const harnessConvId = (s) => ((s && s.harnessPlan) || {}).harnessSessionId || (s && s.rt && s.rt.term && s.rt.term.agentSessionId) || null;
// P170: 활동이 보는 중뿐이면 시계(busyAt)를 보는 창에서 사람이 마지막으로 손댄 때로 둔다(손대지 않으면 그때부터 쉰 시간을 센다). 다른 일이 있으면 지금. 순수 함수
export function busyMark(list, act, prev = 0, now = Date.now()) {
  let real = false, view = 0;
  for (const x of list) { const a = act(x); if (!a) continue; if (a === 'viewing') view = Math.max(view, x.viewAt || now); else real = true; }
  return real ? now : Math.max(prev || 0, view || now);
}

export function attachSleep(b, opts) { return new Sleeper(b, opts); }

const wsOf = (s) => s.workspaceKey || '';

export class Sleeper {
  constructor(b, { tickMs = SLEEP_TICK_MS, wakeReadyMs = WAKE_READY_MS, settleMs = WAKE_SETTLE_MS, staggerMs = WAKE_STAGGER_MS, readTable = readProcessTable, readChildren = childCommands, timers = true } = {}) {
    this.b = b; this.tickMs = tickMs; this.wakeReadyMs = wakeReadyMs; this.settleMs = settleMs; this.staggerMs = staggerMs; this.readTable = readTable; this.readChildren = readChildren;
    this.going = new Map(); // 세션 ID → 잠재우는 중인 Promise
    this.wakes = new Map(); // 세션 ID → 깨우는 중인 Promise
    this.focus = new Map(); // 창 연결 → 보는 노드 ID 목록(board.viewing: 초점 노드와 가까이 얼굴로 보이는 노드)
    this.inputAt = new Map(); // P170: 창 연결 → 그 창에서 사람이 마지막으로 손댄 때(board.viewing의 inputAgoMs). 알리지 않는 창(옛 창)은 늘 손대는 것으로 본다
    this.busyAt = new Map(); // 리포 키 → 마지막으로 일이 보인 때(마지막 일이 끝난 뒤부터 쉰 시간을 센다)
    this.sessBusyAt = new Map(); // P111: 세션 ID → 그 세션에 마지막으로 일이 보인 때(세션 규칙)
    this.bgScan = new Map(); // P105: 세션 ID → { at, n } claude 바로 아래 도구 명령(뒤 셸) 수를 센 때와 수
    this.blocked = new Map(); // P105: 세션 ID → { why, at, idle, n, until } 실패한 잠재우기를 미루는 중
    this.bgShown = new Map(); // P164: 세션 ID → 마지막으로 보낸 뒤 일 표시 키(수·종류)
    this.inner = new Map(); // P296: 세션 ID → 안 일 측정(inner-work.mjs innerWork 값)
    // 백엔드가 잠재우던 중에 꺼졌다: 패널이 남았으면 깨어 있는 것으로 돌리고(resync가 상태를 맞춘다), 없으면 잠든 것으로 둔다
    for (const s of b.sessions.values()) {
      if (!s.rt.sleep || !s.rt.sleep.going) continue;
      if (s.paneId) s.rt.sleep = null; else delete s.rt.sleep.going;
      b.store.saveRuntime(s.sessionId, s.rt);
    }
    this.handlers = {
      'workspace.sleep': (p) => this.sleepRepoHand(p),
      'workspace.wake': (p) => this.wakeRepoHand(p),
      'workspace.sleepIdle': () => this.sleepIdle(),
      'session.wake': (p) => this.wakeOne(p), // 노드를 누를 때: 그 세션의 리포를 깨운다
      'board.viewing': (p, c) => {
        if (c) {
          const now = Date.now();
          // P170: 창이 사람의 마지막 입력(누르기·키·휠·터치)이 몇 ms 전인지 함께 알린다. 시계가 다른 휴대폰도 같게 세려고 시각이 아니라 지난 시간을 받는다
          if (p.inputAgoMs != null && Number.isFinite(Number(p.inputAgoMs))) this.inputAt.set(c, now - Math.max(0, Number(p.inputAgoMs)));
          const prev = this.focus.get(c) || [];
          const ids = [...new Set([p.focus, ...(Array.isArray(p.close) ? p.close : [])].filter(Boolean).map(String))];
          if (ids.length) this.focus.set(c, ids); else this.focus.delete(c);
          this.touchViewed(c, [...prev, ...ids], now); // 보던 리포(와 세션)는 그 창에서 사람이 손댄 때까지 일이 있었다
        }
        return { ok: true };
      },
      'sleep.status': () => this.status(),
    };
    if (timers) this.timer = setInterval(() => this.tick().catch((e) => b.log('sleep tick error', e.stack)), tickMs);
  }
  stop() { clearInterval(this.timer); }
  dropClient(c) { this.touchViewed(c, this.focus.get(c) || []); this.focus.delete(c); this.inputAt.delete(c); }
  // P170: 창 c가 보던(보는) 노드의 리포·세션 시계를 그 창에서 사람이 마지막으로 손댄 때로 당긴다(손대지 않은 창의 보기가 시계를 늦추지 않게)
  touchViewed(c, ids, now = Date.now()) {
    const at = this.inputAt.has(c) ? Math.min(now, this.inputAt.get(c)) : now;
    for (const id of ids) {
      const s = this.b.sessions.get(id);
      if (!s) continue;
      const k = wsOf(s);
      this.busyAt.set(k, Math.max(this.busyAt.get(k) || 0, at)); this.sessBusyAt.set(id, Math.max(this.sessBusyAt.get(id) || 0, at));
    }
  }
  // P170: 판 터미널로 사람이 친 키(relay onInput, 터미널이 대신 보낸 보고는 빼고). 손대는 때를 알리는 창만 고친다
  noteInput(c, at = Date.now()) { if (c && this.inputAt.has(c)) this.inputAt.set(c, Math.max(this.inputAt.get(c), at)); }

  afterMs() { const st = this.b.features && this.b.features.settings ? this.b.features.settings.get() : {}; return Math.max(0, Number(st.sleepAfterMin ?? 30)) * 60000; }
  sessionAfterMs() { const st = this.b.features && this.b.features.settings ? this.b.features.settings.get() : {}; return Math.max(0, Number(st.sessionSleepAfterMin ?? 30)) * 60000; } // P111
  // P170: 보는 중의 시간 제한. 그 창에서 사람이 손대지 않은 지 이 시간(세션 절전 시간, 0이면 리포 절전 시간)이 지나면 그 창의 보기는 세지 않는다. 0이면 제한 없음
  viewLimitMs() { return this.sessionAfterMs() || this.afterMs(); }
  // 세션 sid를 보는 창(초점·가까이 얼굴, 붙은 터미널) 가운데 아직 세는 창에서 사람이 마지막으로 손댄 때. 세는 창이 없으면 0.
  // 손대는 때를 알리지 않는 창(옛 창, 시험의 가짜 중계)은 지금 손대는 것으로 본다
  viewAt(sid, now = Date.now()) {
    const lim = this.viewLimitMs();
    let at = 0;
    const see = (c) => { const t = c && this.inputAt.has(c) ? this.inputAt.get(c) : now; if (!lim || now - t < lim) at = Math.max(at, Math.min(t, now)); };
    for (const [c, ids] of this.focus) if (ids.includes(sid)) see(c);
    const r = this.b.relay;
    if (r && typeof r.clientsOf === 'function') for (const c of r.clientsOf(sid)) see(c);
    else if (r && r.stats && r.stats().some((x) => x.sessionId === sid)) see(null);
    return at;
  }
  viewed(sid, now = Date.now()) { return this.viewAt(sid, now) > 0; }
  members(key) { return [...this.b.sessions.values()].filter((s) => wsOf(s) === key); }
  repoKeys() { return [...new Set([...this.b.sessions.values()].map(wsOf))]; }
  repoName(key) {
    try { const rows = this.b.store.workspaces(); const n = workspaceNames(rows).get(key); if (n) return n; } catch {}
    return key ? key.split('/').filter(Boolean).pop() : '-';
  }
  // P159: 일 부모 찾기(판의 일 관계). 가지 기능이 없으면(시험) 계보 부모
  workParentFn() {
    const br = this.b.branch;
    if (br && br.relIndex) { const idx = br.relIndex(); return (id) => idx.workParentOf(id); }
    return (id) => { const x = this.b.sessions.get(id); return x ? x.parentSessionId || null : null; };
  }
  isAsleep(s) { return !!(s.rt.sleep || this.going.has(s.sessionId) || this.wakes.has(s.sessionId)); }
  // P170: 판이 띄우고 하네스 이어 가기가 되는 세션(codex, opencode, pi)
  harnessOk(s) { return typeof this.b.harnessResumable === 'function' ? !!this.b.harnessResumable(s) : harnessResumable(s); }
  // 잠재울 수 있는 종류인가(깨어 있는 패널의 판정과 상관없이): 판이 띄운 Claude Code, 이어 가기가 되는 하네스
  sleepKind(s) { return (s.kind || 'claude') === 'claude' ? this.b.hooked(s) : this.harnessOk(s); }
  // 이어 갈 대화. Claude Code는 대화 기록, 하네스는 하네스 세션 ID
  convFor(s) {
    if ((s.kind || 'claude') === 'claude') return convoOf(s, this.b.cfg.claudeProjects);
    const id = harnessConvId(s) || (typeof this.b.harnessSessionIdOf === 'function' ? this.b.harnessSessionIdOf(s) : null);
    return { convId: id || null, transcript: null, exists: !!id };
  }
  info(s) {
    const b = this.b;
    // P159: 묶음은 일 관계(일 부모·일 자식, relations.mjs workParentOf)를 따른다. 동료·독립은 혼자 잠들고 혼자 깬다. 사람이 하위로 둔 세션(계보 없음)은 묶음에 든다
    const wp = this.workParentFn();
    const kids = [...b.sessions.values()].filter((x) => wp(x.sessionId) === s.sessionId);
    const pid = wp(s.sessionId);
    const parent = pid ? b.sessions.get(pid) : null;
    const busy = (x) => BUSY.has(deriveState(x.rt).state) || this.wakes.has(x.sessionId) || (b.queue && b.queue.pending(x.sessionId) > 0);
    // P111: 일하는 자손(하위의 하위까지). 세션 규칙이 본다(잠들면 워커가 지휘 세션에 보낸 글이 깨울 때까지 기다린다)
    const desc = [], seen = new Set([s.sessionId]);
    for (const q = [s.sessionId]; q.length; ) { const id = q.shift(); for (const x of b.sessions.values()) if (wp(x.sessionId) === id && !seen.has(x.sessionId)) { seen.add(x.sessionId); desc.push(x); q.push(x.sessionId); } }
    const blk = this.blockOf(s);
    const kind = s.kind || 'claude', harness = kind !== 'claude' && this.harnessOk(s);
    const viewAt = this.viewAt(s.sessionId);
    return {
      name: s.name, kind, hooked: b.hooked(s), harness, convKnown: kind === 'claude' ? b.hooked(s) && convoOf(s, b.cfg.claudeProjects).exists : harness && !!harnessConvId(s),
      state: deriveState(s.rt).state, sleeping: !!s.rt.sleep, waking: this.wakes.has(s.sessionId), closing: b.killing.has(s.sessionId) || this.going.has(s.sessionId),
      draft: !!s.draft, delivering: b.queue ? b.queue.pending(s.sessionId) : 0, loops: b.features ? b.features.loops.activeCount(s.sessionId) : 0,
      bg: !s.rt.sleep && !!(this.bgOf(s) || (blk && blk.why === 'background')), blocked: blk && blk.why !== 'background' ? blk.why : null,
      inner: !s.rt.sleep && this.innerBusy(s), // P296
      childBusy: kids.some(busy), descBusy: desc.some(busy), parentBusy: !!(parent && busy(parent)), viewed: viewAt > 0, viewAt, idleSince: idleSince(s),
    };
  }

  // P170: 대화 ID를 아직 모르는 하네스 세션(Codex는 뜬 뒤 첫 지시가 rollout을 만든다)을 backend.harnessSessionIdOf(터미널이 아는 ID, 그 폴더의 rollout)로 찾아
  // 판 기록에 남긴다. 판 밖 대화 목록이 꺼진 판(recall.learnCodexIds가 돌지 않음)에서도 잠재울 수 있게. 세션마다 LEARN_MS에 한 번
  learnHarnessIds(now = Date.now()) {
    const b = this.b;
    if (typeof b.harnessSessionIdOf !== 'function') return 0;
    this.learnAt ||= new Map();
    let n = 0;
    for (const s of b.sessions.values()) {
      if ((s.kind || 'claude') === 'claude' || !s.paneId || s.rt.sleep || !s.harnessPlan || s.harnessPlan.harnessSessionId || !this.harnessOk(s)) continue;
      if (now - (this.learnAt.get(s.sessionId) || 0) < LEARN_MS) continue;
      this.learnAt.set(s.sessionId, now);
      let id = null; try { id = b.harnessSessionIdOf(s); } catch {}
      if (!id) continue;
      const lid = String(id).toLowerCase();
      if ([...b.sessions.values()].some((o) => o !== s && String(((o.harnessPlan || {}).harnessSessionId) || '').toLowerCase() === lid)) continue; // 같은 폴더의 다른 판 세션이 가진 대화
      s.harnessPlan = { ...s.harnessPlan, harnessSessionId: lid };
      b.store.updateSession(s.sessionId, { harnessPlan: s.harnessPlan });
      b.store.addEvent(s.sessionId, 'harness_session_learned', { harnessSessionId: lid, by: 'sleep' });
      n++;
    }
    return n;
  }

  // ---------- P105: 뒤 일과 실패한 잠재우기 ----------
  bgOf(s, now = Date.now()) {
    if (this.b.cfg && this.b.cfg.sleepBgPrecheck === false) return null;
    return this.bgAny(s, now);
  }
  // P246: 설정과 관계없이 지금 아는 뒤 일. Claude Code는 hook(rt.bg)과 도구 명령 수, 다른 하네스는 나무의 셸 수(harnessWork). 셸·잠든 세션은 null
  bgAny(s, now = Date.now()) {
    const kind = s.kind || 'claude';
    if (kind === 'shell' || !s.paneId || s.rt.sleep) return null;
    return backgroundOf(kind === 'claude' ? s.rt.bg : null, this.bgScan.get(s.sessionId) || null, now);
  }
  // P246: 세션 하나의 프로세스를 지금 보고 뒤 일을 돌려준다
  async backgroundNow(s) {
    await this.scanBackground([s]);
    return this.bgAny(s);
  }
  // P164: 세션 맵에 보일 뒤 일(깨어 있는 패널만). 절전 설정(sleepBgPrecheck)과 관계없이 보인다. P246: 다른 하네스도(프로세스로 본 셸만)
  bgView(s, now = Date.now()) {
    const kind = s.kind || 'claude';
    if (kind === 'shell' || !s.paneId || s.rt.sleep) return null;
    return backgroundList(kind === 'claude' ? s.rt.bg : null, this.bgScan.get(s.sessionId) || null, now);
  }
  // P164: 뒤 일이 보이는 세션은 tick마다(SLEEP_TICK_MS) 프로세스를 다시 보고, 보이는 수·종류가 바뀌면 요약을 다시 보낸다(뒤 셸이 끝나면 표시가 꺼진다).
  // 일하는 중인 세션은 턴 끝의 Stop이 목록을 새로 준다
  async refreshBackground(now = Date.now()) {
    const b = this.b;
    const key = (g) => (g ? `${g.n}|${g.kinds.join(',')}` : '');
    const list = [...b.sessions.values()].filter((s) => { const g = this.bgView(s, now); return g && deriveState(s.rt).state !== 'working'; });
    if (list.length) await this.scanBackground(list);
    for (const s of b.sessions.values()) {
      const k = key(this.bgView(s));
      if (k === (this.bgShown.get(s.sessionId) || '')) continue;
      if (k) this.bgShown.set(s.sessionId, k); else this.bgShown.delete(s.sessionId);
      if (list.includes(s)) b.broadcastSession(s, { cause: 'background' });
    }
  }
  // 세션들의 claude 바로 아래 도구 명령(MCP 서버 빼고)을 센다. 터미널의 process_info로 claude PID를 얻고 PowerShell 한 번으로 그 자식을 읽는다.
  // 읽지 못하면(null) 전 값을 둔다. claude가 없는 패널은 0으로 둔다
  // P246: 다른 하네스는 프로세스 표를 한 번 읽어 하네스 아래 셸을 센다(harnessWork). root는 셸이 아닌 앞쪽 프로세스(하네스), 없으면 셸
  // ---------- P296: 자체 오케스트레이션 세션의 안 일 ----------
  innerBusy(s) { const x = s && s.orch ? this.inner.get(s.sessionId) : null; return !!(x && x.busy); }
  // P298: 지금 바쁜가(턴이 막 끝난 때). 잰 값이 바쁨이 아니면 하네스별 읽개(busy 칸 { reader })를 곧바로 한 번 더 부른다(tick 사이에 하위 에이전트를 띄우고 턴이 끝날 수 있다)
  innerBusyNow(s) {
    if (!s || !s.orch) return false;
    if (this.innerBusy(s)) return true;
    const sig = Array.isArray(s.orch.busy) ? s.orch.busy : [];
    if (!sig.some((x) => x && typeof x === 'object' && x.reader)) return false;
    return readerSignals(sig, { session: s, now: Date.now() }).some((r) => r.busy);
  }
  innerView(s) { const x = s && s.orch && !s.rt.sleep ? this.inner.get(s.sessionId) : null; return x ? { busy: x.busy, why: x.why, n: x.n, at: x.at } : null; }
  // 깨어 있는 오케스트레이션 세션의 바쁨 신호를 잰다(tick마다, 손으로 잠재우기 전). 바쁨 → 조용이면 멈춤 알림을 다시 보고(unit-stops onInnerQuiet), 바뀌면 요약을 다시 보낸다
  async scanInner(list = [...this.b.sessions.values()]) {
    const b = this.b, now = Date.now();
    const fresh = (s) => { const x = this.inner.get(s.sessionId); return x && now - x.at < INNER_RESCAN_MS; };
    const mine = list.filter((s) => s.orch && s.orch.on && s.paneId && !s.rt.sleep && (s.kind || 'claude') !== 'shell' && !fresh(s)); // 방금 잰 세션은 다시 재지 않는다(CPU 차이 창이 너무 짧아진다)
    for (const id of [...this.inner.keys()]) { const s = b.sessions.get(id); if (!s || s.rt.sleep || !s.paneId) this.inner.delete(id); }
    if (!mine.length || !b.adapter) return;
    const sig = (s) => (Array.isArray(s.orch.busy) && s.orch.busy.length ? s.orch.busy : ['proctree', 'cpu']);
    const needTable = mine.some((s) => sig(s).some((x) => x === 'proctree' || x === 'cpu'));
    const table = needTable ? await Promise.resolve(this.readTable()).catch(() => null) : null;
    const procsMs = table ? procsCpuMs(table.procs) : null; // P329: innerWork는 CPU를 ms로 센다
    for (const s of mine) {
      let root = null, harness = false;
      if (table) {
        const info = await b.adapter.processInfo(s.paneId).catch(() => null);
        if (info) { const fg = (info.foreground_processes || []).find((p) => p.pid && Number(p.pid) !== Number(info.shell_pid)); root = Number(fg ? fg.pid : info.shell_pid) || null; harness = !!fg; }
      }
      let files = [];
      try { files = fileSignals(sig(s), { cwd: (s.rt && s.rt.cwd) || s.cwd }); } catch {}
      const prev = this.inner.get(s.sessionId) || null;
      const readers = readerSignals(sig(s), { session: s, now }); // P296: 하네스별 읽개(꽂기)
      const x = innerWork({ procs: procsMs, root, harness, launchedAt: s.rt.launchedAt || 0, signals: sig(s), files, readers, prev, now });
      this.inner.set(s.sessionId, x);
      const was = !!(prev && prev.busy);
      if (was !== x.busy) {
        b.store.addEvent(s.sessionId, 'inner_work', { busy: x.busy, why: x.why, n: x.n, cpuMs: Math.round(x.cpuMs) });
        b.log(`inner work ${s.name}: ${x.busy ? 'busy' : 'quiet'} (${x.why.join(',') || 'hold'})`);
        if (x.busy) this.sessBusyAt.set(s.sessionId, now);
        if (b.broadcastSession) b.broadcastSession(s, { cause: 'inner' });
        if (!x.busy && b.branch && b.branch.units && b.branch.units.stops && b.branch.units.stops.onInnerQuiet) { try { b.branch.units.stops.onInnerQuiet(s); } catch (e) { b.log(`inner quiet notice failed: ${e.message}`); } }
      }
    }
  }
  async scanBackground(list) {
    await this.scanInner(list).catch((e) => this.b.log(`inner scan failed: ${e.message}`)); // P296
    const b = this.b, now = Date.now(), pids = new Map(), roots = new Map();
    for (const s of list) {
      const kind = s.kind || 'claude';
      if (kind === 'shell' || !s.paneId || s.rt.sleep || !b.adapter) continue;
      const info = await b.adapter.processInfo(s.paneId).catch(() => null);
      if (!info) continue;
      if (kind !== 'claude') {
        const fg = (info.foreground_processes || []).find((p) => p.pid && Number(p.pid) !== Number(info.shell_pid));
        roots.set(s.sessionId, { pid: Number(fg ? fg.pid : info.shell_pid) || null, harness: !!fg, launchedAt: s.rt.launchedAt || 0 });
        continue;
      }
      const c = (info.foreground_processes || []).find((p) => /claude/i.test(p.name || ''));
      pids.set(s.sessionId, c ? Number(c.pid) : null);
    }
    if (pids.size) {
      const want = [...pids.values()].filter(Boolean);
      const kids = want.length ? await this.readChildren(want).catch(() => null) : [];
      if (kids) for (const [sid, pid] of pids) this.bgScan.set(sid, { at: now, n: pid ? kids.filter((k) => Number(k.ppid) === pid && isToolCommand(k)).length : 0 });
    }
    if (roots.size) {
      const table = await Promise.resolve(this.readTable()).catch(() => null);
      if (table && table.procs) for (const [sid, r] of roots) this.bgScan.set(sid, { at: now, n: r.pid ? harnessWork(table.procs, r.pid, { harness: r.harness, launchedAt: r.launchedAt }) : 0 });
    }
  }
  // 실패한 잠재우기를 미룬다. 같은 쉼(쉬기 시작한 때가 그대로)에서 또 실패하면 간격을 두 배로 늘린다
  block(s, why, now = Date.now()) {
    const prev = this.blocked.get(s.sessionId), idle = idleSince(s);
    const n = prev && prev.idle === idle ? prev.n + 1 : 1;
    const wait = Math.min(SLEEP_RETRY_MS * 2 ** (n - 1), SLEEP_RETRY_MAX_MS);
    const e = { why, at: now, idle, n, until: now + wait };
    this.blocked.set(s.sessionId, e);
    this.b.store.addEvent(s.sessionId, 'sleep_blocked', { why, n, retryMs: wait });
    this.b.log(`sleep blocked ${s.name} why=${why} n=${n} retry in ${Math.round(wait / 60000)}min`);
    return e;
  }
  // 미루는 중인 기록. 그 뒤로 새 활동(쉬기 시작한 때가 늦어짐)이 있었으면 풀고, 간격이 지났으면 다시 해 본다(n은 남긴다)
  blockOf(s, now = Date.now()) {
    const e = this.blocked.get(s.sessionId);
    if (!e) return null;
    if (idleSince(s) > e.idle) { this.blocked.delete(s.sessionId); return null; }
    return now < e.until ? e : null;
  }
  // 리포 하나의 판정. 일이 보이면 그 때를 기억한다(그 뒤로 쉰 시간을 센다)
  plan(key, mode = 'auto', now = Date.now()) {
    const list = this.members(key).map((s) => this.info(s));
    const p = repoSleepPlan(list, { mode, now, afterMs: this.afterMs(), busyAt: this.busyAt.get(key) || 0 });
    if (isActivity(p.why)) this.busyAt.set(key, busyMark(list, (x) => sessionActivity(x, { mode }), this.busyAt.get(key), now)); // P170: 보는 중뿐이면 손댄 때
    return p;
  }

  // P111: 세션 하나의 세션 규칙 판정. 일이 보이면 그 때를 기억한다
  sessionPlan(s, now = Date.now()) {
    const x = this.info(s);
    const p = sessionSleepPlan(x, { now, afterMs: this.sessionAfterMs(), busyAt: this.sessBusyAt.get(s.sessionId) || 0 });
    if (isActivity(p.why)) this.sessBusyAt.set(s.sessionId, p.why === 'viewing' ? Math.max(this.sessBusyAt.get(s.sessionId) || 0, x.viewAt || now) : now); // P170
    return p;
  }

  // 요약에 덧붙인다(창의 잠든 얼굴, 영역 이름표, 메모리 알약)
  summaryExtra(s) {
    const z = s.rt.sleep;
    return {
      sleep: z ? { at: z.at, by: z.by, scope: z.scope || 'repo', memMB: z.memMB ?? null, error: z.error || null } : null, // P111: scope(repo | session)
      waking: s.waking ? { at: s.waking.at, why: s.waking.why } : null,
      sleepable: !z && this.sleepKind(s), // P170: 이어 가기가 되는 하네스도
    };
  }
  status() {
    const now = Date.now();
    const all = [...this.b.sessions.values()];
    const list = all.filter((s) => s.rt.sleep);
    const repos = this.repoKeys().map((key) => {
      const mem = this.members(key), p = this.plan(key, 'auto', now);
      const asleep = mem.filter((s) => s.rt.sleep);
      const blocked = mem.map((s) => [s, this.blockOf(s, now)]).filter(([, e]) => e).map(([s, e]) => ({ name: s.name, why: e.why, n: e.n, retryInMs: e.until - now })); // P105
      const background = mem.map((s) => [s, this.bgOf(s, now)]).filter(([, g]) => g).map(([s, g]) => ({ name: s.name, ...g }));
      // P111: 세션 규칙의 판정(판이 띄운 Claude Code, P170: 이어 가기가 되는 하네스). 잠든 세션은 scope(repo | session)
      const each = mem.filter((s) => this.sleepKind(s)).map((s) => { const q = this.sessionPlan(s, now); return { name: s.name, why: q.why, idleMs: now - q.since, ...(s.rt.sleep ? { scope: sleepScope(s) } : {}) }; });
      return { key, name: this.repoName(key), sessions: mem.length, asleep: asleep.length, savedMB: Math.round(asleep.reduce((a, s) => a + (s.rt.sleep.memMB || 0), 0)), targets: p.targets, why: p.why, who: p.who, idleMs: now - p.since, blocked, background, each };
    });
    return { afterMin: this.afterMs() / 60000, sessionAfterMin: this.sessionAfterMs() / 60000, sleeping: list.length, savedMB: Math.round(list.reduce((a, s) => a + (s.rt.sleep.memMB || 0), 0)), sessions: list.map((s) => ({ name: s.name, workspace: wsOf(s), at: s.rt.sleep.at, scope: sleepScope(s), memMB: s.rt.sleep.memMB ?? null })), repos };
  }

  // ---------- 저절로 ----------
  async tick() {
    const b = this.b;
    if (!b.adapter || !b.adapter.connected || this._ticking) return;
    this._ticking = true;
    try {
      // 잠든 세션에 보낼 글이 남았는데 깨우는 중이 아니면 그 리포를 깨운다(백엔드가 다시 떠 대기열이 되살아난 경우)
      for (const s of [...b.sessions.values()]) if (s.rt.sleep && !this.wakes.has(s.sessionId) && b.queue.pending(s.sessionId) > 0 && !s.rt.sleep.error) this.wakeFor(s, 'delivery').catch(() => {});
      await this.scanInner().catch((e) => b.log(`inner scan failed: ${e.message}`)); // P296: 자체 오케스트레이션 세션의 바쁨 신호(CPU는 tick 사이 차이)
      await this.refreshBackground().catch((e) => b.log(`background refresh failed: ${e.message}`)); // P164: 세션 맵의 뒤 일 표시
      this.learnHarnessIds(); // P170: 대화 ID를 아직 모르는 하네스 세션
      // P105: 곧 잠들 리포와 뒤 일이 보이는 리포만 프로세스를 다시 본다(뒤 셸이 끝났는지, 쉬는 claude 아래 도구 명령이 도는지)
      const scan = this.repoKeys().filter((key) => { const w = this.plan(key, 'auto').why; return !w || w === 'background'; }); // P296: inner_work는 위 scanInner가 tick마다 잰다
      if (scan.length) await this.scanBackground(scan.flatMap((key) => this.members(key)));
      const busyRepos = [];
      for (const key of this.repoKeys()) {
        if (this.plan(key, 'auto').why) { busyRepos.push(key); continue; }
        await this.sleepRepo(key, { by: 'auto', mode: 'auto' }).catch((e) => b.log(`auto sleep repo ${key} failed: ${e.code || e.message}`));
      }
      // P111: 리포 규칙에 걸리지 않은 리포에서 오래 쉰 세션을 혼자 잠재운다(리포 규칙이 먼저)
      if (this.sessionAfterMs()) await this.sleepIdleSessions(busyRepos);
    } finally { this._ticking = false; }
  }
  // P111: 세션 규칙. 곧 잠들 세션과 뒤 일이 보이는 세션만 프로세스를 다시 보고, 판정을 다시 본 뒤 하나씩 잠재운다
  async sleepIdleSessions(keys) {
    const b = this.b, cand = [];
    for (const key of keys) {
      if (!this.plan(key, 'auto').why) continue; // 그새 리포가 쉬게 되었으면 다음 tick의 리포 규칙에 맡긴다
      for (const s of this.members(key)) { const w = this.sessionPlan(s).why; if (!w || w === 'background') cand.push(s); }
    }
    if (!cand.length) return [];
    await this.scanBackground(cand);
    const done = [];
    for (const s of cand) {
      if (!b.sessions.has(s.sessionId) || this.sessionPlan(s).why) continue;
      try { done.push(await this.sleep(s, { by: 'auto', mode: 'auto', scope: 'session' })); }
      catch (e) { b.log(`auto sleep session ${s.name} failed: ${e.code || e.message}`); }
    }
    return done;
  }

  // 리포 하나의 대상 세션을 차례로 잠재운다. 도중에 일이 들어오면 남은 세션은 그대로 둔다
  async sleepRepo(key, { by, mode }) {
    const done = [], skipped = [];
    const first = this.plan(key, mode);
    if (first.why) return { workspace: key, name: this.repoName(key), slept: 0, savedMB: 0, why: first.why, who: first.who, sessions: [], skipped };
    let stop = null;
    for (const name of first.targets) {
      const s = this.members(key).find((x) => x.name === name);
      if (!s) continue;
      if (stop) { skipped.push({ name, reason: stop }); continue; }
      const p = this.plan(key, mode === 'auto' ? 'bulk' : mode); // 리포는 이미 쉰 시간을 넘었다. 도중에 일이 들어왔는지만 본다
      if (p.why) { stop = p.why; skipped.push({ name, reason: p.why, who: p.who }); continue; }
      if (sleepTarget(this.info(s), { mode, afterMs: this.afterMs() })) continue;
      try { const r = await this.sleep(s, { by, mode }); done.push({ name: s.name, memMB: r.memMB }); }
      catch (e) { skipped.push({ name: s.name, reason: e.code || e.message }); }
    }
    // P111: 앞서 혼자 잠든 세션은 scope session 그대로 둔다(리포를 깨워도 함께 깨지 않는다. 오래전에 끝난 워커가 한꺼번에 깨어 메모리가 튀지 않게)
    const out = { workspace: key, name: this.repoName(key), slept: done.length, savedMB: Math.round(done.reduce((a, x) => a + (x.memMB || 0), 0)), sessions: done, skipped };
    if (done.length) { this.b.store.addEvent(null, 'repo_slept', { ...out, by }); this.b.log(`repo slept ${out.name} by=${by} n=${done.length} mem=${out.savedMB}MB`); }
    return out;
  }

  // ---------- 손으로 ----------
  async resolveKey(p) {
    if (p.session) return wsOf(this.b.resolve(p.session));
    if (p.workspace == null || p.workspace === '') throw apiError('bad_request', 'workspace required');
    if (this.b.resolveWorkspace) return (await this.b.resolveWorkspace(p.workspace)).key;
    return String(p.workspace);
  }
  // 영역 이름표 메뉴의 "이 리포 잠재우기". 보는 노드와 쉰 시간은 보지 않고, 그 밖의 일이 있으면 까닭을 돌려준다
  async sleepRepoHand(p) {
    const b = this.b;
    b.requireTerminal();
    const key = await this.resolveKey(p);
    await this.scanBackground(this.members(key)); // P105: 뒤 셸이 도는지 지금 본다
    const pl = this.plan(key, 'hand');
    if (pl.why) {
      const repo = this.repoName(key);
      // P105: 뒤 일은 사람이 골라 멈추게 한다(잠재우면 claude와 함께 끝나고, 깨워도 되살아나지 않는다). CLI는 message를 찍으므로 할 일을 함께 적는다
      const more = pl.why === 'background' ? ' (백그라운드 작업이 실행 중입니다. 작업이 끝난 뒤 다시 시도하거나 세션에서 작업을 먼저 중지하세요.)' : '';
      throw keyed(apiError(`sleep_${pl.why}`, `리포 ${repo} 프로젝트를 지금 절전 모드로 전환할 수 없습니다: ${pl.who ? `@${pl.who} ` : ''}${pl.why}${more}`), 'repoSleepRefused', { repo, name: pl.who ? `@${pl.who}` : '', reason: m(`sleepWhy_${pl.why}`) });
    }
    return this.sleepRepo(key, { by: 'hand', mode: 'hand' });
  }
  // 쉬는 리포 모두(트레이, 메모리 알약). 저절로와 같은 조건이되 쉰 시간은 보지 않는다
  async sleepIdle() {
    this.b.requireTerminal();
    const repos = [], skipped = [];
    await this.scanBackground([...this.b.sessions.values()]); // P105
    for (const key of this.repoKeys()) {
      const pl = this.plan(key, 'bulk');
      if (pl.why) { if (pl.why !== 'asleep' && pl.why !== 'nothing') skipped.push({ workspace: key, name: this.repoName(key), reason: pl.why, who: pl.who }); continue; }
      const r = await this.sleepRepo(key, { by: 'bulk', mode: 'bulk' });
      if (r.slept) repos.push(r);
      for (const x of r.skipped) skipped.push({ workspace: key, name: this.repoName(key), session: x.name, reason: x.reason });
    }
    const slept = repos.reduce((a, r) => a + r.slept, 0);
    return { repos: repos.length, slept, savedMB: Math.round(repos.reduce((a, r) => a + r.savedMB, 0)), workspaces: repos, skipped };
  }
  // 영역 이름표 메뉴의 "이 리포 깨우기": 잠든 세션을 모두 깨우고(wait면 모두 준비될 때까지) 결과를 돌려준다
  async wakeRepoHand(p) {
    const key = await this.resolveKey(p);
    const order = this.members(key).filter((s) => this.isAsleep(s));
    if (!order.length) return { workspace: key, name: this.repoName(key), woke: 0, sessions: [] };
    this.b.requireTerminal();
    const jobs = this.wakeRepo(key, null, p.why || 'hand', { all: true }); // P111: 혼자 잠든 세션도(사람이 리포를 골랐다)
    if (p.wait === false) { for (const j of jobs) j.job.catch(() => {}); return { workspace: key, name: this.repoName(key), waking: jobs.length }; }
    const rs = await Promise.all(jobs.map((j) => j.job.then((r) => ({ name: j.name, ok: true, ms: r.ms }), (e) => ({ name: j.name, ok: false, error: e.message }))));
    return { workspace: key, name: this.repoName(key), woke: rs.filter((r) => r.ok).length, sessions: rs };
  }
  // 노드를 누를 때(session.wake): 그 세션의 리포를 깨우고 그 세션이 준비될 때까지 기다린다. P111: 혼자 잠든 세션은 그 세션만
  async wakeOne(p) {
    const s = this.b.resolve(p.session);
    const key = wsOf(s);
    const others = this.wakeSet(key, s);
    if (!others.length) return { awake: true, name: s.name, state: deriveState(s.rt).state };
    this.b.requireTerminal();
    const job = this.wakeFor(s, p.why || 'hand');
    if (p.wait === false) { job.catch(() => {}); return { waking: true, name: s.name, repo: others.length }; }
    const r = await job;
    return { ...r, repo: { workspace: key, waking: others.length } };
  }

  // 리포 key에서 잠든 세션을 모두 깨운다. first(부른 세션)를 먼저, 나머지는 staggerMs 간격으로. → [{ name, job }]
  // P34: 데스크톱 앱에서 가져와 아직 한 번도 깨지 않은 세션(sleep.by import)은 리포를 깨울 때 함께 깨우지 않는다(수십 개가 한꺼번에 뜨지 않게). 그 노드를 누르거나 글을 보낼 때만 깬다
  // P111: 혼자 잠든 세션(scope session)은 리포를 깨울 때 함께 깨우지 않는다(all이면 함께). first가 혼자 잠들었으면 first만 깬다
  wakeSet(key, first, { all = false } = {}) {
    if (first && !all && this.isAsleep(first) && sleepScope(first) === 'session') return [first];
    return this.members(key).filter((s) => this.isAsleep(s) && (s === first || (!(s.rt.sleep && s.rt.sleep.by === 'import') && (all || sleepScope(s) !== 'session'))));
  }
  wakeRepo(key, first, why, { all = false } = {}) {
    const asleep = this.wakeSet(key, first, { all });
    const order = first && asleep.includes(first) ? [first, ...asleep.filter((x) => x !== first)] : asleep;
    const alone = asleep.length === 1 && asleep[0] === first && sleepScope(first) === 'session';
    if (!alone) this.busyAt.set(key, Date.now()); // 혼자 깨우는 세션은 리포의 시계를 다시 세지 않는다(그 세션의 깬 때가 센다)
    return order.map((s, i) => ({ name: s.name, sessionId: s.sessionId, job: this.wake(s, i === 0 ? why : `repo:${why}`, i * this.staggerMs) }));
  }
  // 세션 s의 리포를 깨우고 s의 깨우기(Promise)를 돌려준다. s가 깨어 있으면 리포의 나머지만 깨운다. P111: s가 혼자 잠들었으면 s만(wakeSet)
  wakeFor(s, why) {
    const jobs = this.wakeRepo(wsOf(s), s, why);
    let mine = null;
    for (const j of jobs) { if (j.sessionId === s.sessionId) mine = j.job; else j.job.catch(() => {}); }
    return mine || Promise.resolve({ awake: true, name: s.name, state: deriveState(s.rt).state });
  }

  // 패널 프로세스와 메모리(D1과 같은 셈: 셸과 그 아래 모든 프로세스)
  async measure(s) {
    const info = await this.b.adapter.processInfo(s.paneId).catch(() => null);
    const shell = info && info.shell_pid;
    const table = shell ? await this.readTable() : null;
    const tree = table ? descendants(table.procs, shell) : [];
    // P168: 다른 세션의 셸(마지막 자원 표본)이나 시스템 프로세스가 든 나무는 값을 버린다(null = 모름). 같은 까닭은 기록에 한 번만
    const others = ((this.b.resources && this.b.resources.last && this.b.resources.last.sessions) || []).filter((r) => r.sessionId !== s.sessionId).map((r) => r.shellPid);
    const bad = suspectTree(tree, others);
    if (bad) {
      if (!this.warn) this.warn = logOnce((msg) => this.b.log && this.b.log(msg));
      this.warn(`${s.sessionId}:${bad}`, `sleep: dropped memory of ${s.name} (shell ${shell}): ${bad}, ${tree.length} procs`);
      return { shellPid: shell || null, memMB: null, procs: [], suspect: bad };
    }
    return { shellPid: shell || null, memMB: tree.length ? mb(tree.reduce((a, x) => a + x.ws, 0)) : null, procs: tree.map((x) => ({ pid: x.pid, name: x.name })) };
  }

  // P105: /exit가 claude를 끝내지 못했을 때 화면을 원래대로 돌린다. 확인 창(뒤 일 확인, 그 밖의 "Esc to cancel" 창)이 보이면
  // Esc(그 창의 취소. 뒤 일 확인 창에서는 3. Stay와 같다)를 보내고 창이 사라질 때까지 잠깐 본다. Enter는 보내지 않는다(1번이 뒤 일을 끄고 나간다)
  async restoreAfterExit(s, bgSeen) {
    const b = this.b;
    const read = () => b.adapter.readScreen(s.paneId, { source: 'visible' }).catch(() => '');
    const open = (t) => !!parseExitBackground(t) || /Esc to cancel/i.test(t);
    let scr = await read();
    const background = bgSeen || !!parseExitBackground(scr);
    let esc = 0;
    for (let i = 0; i < 2 && s.rt.term.present && open(scr); i++) {
      await b.adapter.paneKeys(s.paneId, ['esc']).catch(() => {}); esc++;
      for (const t = Date.now(); Date.now() - t < 2000; ) { await sleep(200); scr = await read(); if (!open(scr)) break; }
    }
    return { background, esc, cleared: !open(scr) };
  }

  // scope(P111): repo(리포 규칙·손·모두) | session(세션 규칙, 혼자)
  sleep(s, { by, mode = by === 'hand' ? 'hand' : 'bulk', scope = 'repo' }) {
    if (this.going.has(s.sessionId)) return this.going.get(s.sessionId);
    const job = this._sleep(s, by, mode, scope).finally(() => this.going.delete(s.sessionId));
    this.going.set(s.sessionId, job);
    return job;
  }
  async _sleep(s, by, mode, scope = 'repo') {
    const b = this.b, rt = s.rt, t0 = Date.now();
    b.killing.add(s.sessionId); // 판이 닫는 패널: pane_closed·workspace_closed를 "판 밖에서 닫음"으로 보지 않는다
    try {
      const mem = await this.measure(s);
      await this.scanBackground([s]); // P105: /exit 바로 앞에서 뒤 셸이 도는지 다시 본다
      // 재는 동안 이 세션에 일이 들어왔으면 그만둔다(리포의 다른 세션은 sleepRepo가 세션마다 다시 본다)
      const x = { ...this.info(s), closing: false };
      // P111: 혼자 잠재울 때는 세션 규칙의 일(일하는 자손을 보고, 일하는 부모는 보지 않는다)
      const why = sleepTarget(x, { mode }) || sessionActivity(scope === 'session' ? { ...x, childBusy: x.descBusy, parentBusy: false } : x, { mode });
      if (why) throw keyed(apiError(`sleep_${why}`, `@${s.name} 세션을 지금 절전 모드로 전환할 수 없습니다: ${why}`), 'sleepRefused', { name: s.name, reason: m(`sleepWhy_${why}`) });
      const claude = (s.kind || 'claude') === 'claude';
      // P170: 하네스는 끝내는 키(Ctrl+C)가 입력 칸의 글을 지운다. 판 밖에서 들어온 글(붙여 넣기 등)도 있으므로 화면의 입력 칸을 한 번 더 본다
      if (!claude && rt.term.present) {
        const scr = await b.adapter.readScreen(s.paneId, { source: 'visible' }).catch(() => null);
        const box = scr != null ? readDraftBox(scr, s.kind) : null;
        if (box && box.found && box.text) { this.block(s, 'draft'); throw keyed(apiError('sleep_draft', `@${s.name} 세션을 지금 절전 모드로 전환할 수 없습니다: draft`), 'sleepRefused', { name: s.name, reason: m('sleepWhy_draft') }); }
      }
      const conv = this.convFor(s);
      if (!claude) {
        if (!conv.convId) throw keyed(apiError('sleep_no_convo', `@${s.name} 세션을 지금 절전 모드로 전환할 수 없습니다: no_convo`), 'sleepRefused', { name: s.name, reason: m('sleepWhy_no_convo') });
        // 잠들면 터미널이 아는 ID(rt.term.agentSessionId)가 지워진다. 깨울 때 같은 대화로 이어 가도록 판 기록에 남긴다
        if (!(s.harnessPlan || {}).harnessSessionId && s.harnessPlan) { s.harnessPlan = { ...s.harnessPlan, harnessSessionId: conv.convId }; b.store.updateSession(s.sessionId, { harnessPlan: s.harnessPlan }); }
      }
      const prev = { state: deriveState(rt).state, lastPrompt: rt.lastPrompt, lastAnswer: rt.lastAnswer };
      // 지금부터 sleeping으로 보인다(전달은 기다리고 깨우기를 부른다. claude가 끝나는 동안 exited로 깜빡이지 않는다)
      rt.sleep = { at: Date.now(), by, scope, going: true, convId: conv.convId };
      b.broadcastSession(s, { cause: `sleep:${by}` });
      const steps = [];
      if (rt.term.present && !claude) {
        // P170: 하네스는 그 종류의 끝내기(backend.stopHarnessAgent: Ctrl+C 두 번, pi는 Ctrl+D도)로 끝낸다. 끝나지 않으면 잠재우지 않고 미룬다
        rt.exitRequested = true;
        const t = Date.now();
        const gone = await b.stopHarnessAgent(s, steps);
        for (const tw = Date.now(); gone && rt.term.present && Date.now() - tw < 3000; ) await sleep(100); // 터미널의 에이전트 해제 알림을 잠깐 기다린다
        if (!gone) {
          rt.sleep = null; rt.exitRequested = false; b.broadcastSession(s, { cause: 'sleep:failed' });
          const e = this.block(s, 'sleep_failed');
          b.store.addEvent(s.sessionId, 'sleep_exit_screen', { background: false, harness: s.kind, steps, retryMs: e.until - e.at });
          throw apiError('still_running', `@${s.name} 세션의 ${s.kind} 프로세스가 종료 키 입력 후에도 종료되지 않았습니다.`);
        }
        steps.push(`${s.kind} exit ${Date.now() - t}ms`);
      } else if (rt.term.present) {
        rt.exitRequested = true;
        await b.adapter.sendText(s.paneId, '/exit'); await sleep(150); await b.adapter.paneKeys(s.paneId, ['enter']);
        const t = Date.now();
        // P71: `claude -w` 세션의 워크트리 나가기 질문에는 남기기로 답한다. P105: 뒤 일 확인 창이 뜨면 그 자리에서 멈춘다
        const w = await waitClaudeExitOr(b, s, b.cfg.killWaitMs, { by: 'sleep', steps, stopOn: parseExitBackground });
        const restored = w.stopped || rt.term.present ? await this.restoreAfterExit(s, !!w.stopped) : null;
        if (restored && rt.term.present) {
          // 확인 창을 Esc로 닫아(Stay) 원래 화면으로 돌렸다. 같은 세션을 곧바로 다시 잠재우지 않는다
          rt.sleep = null; rt.exitRequested = false; b.broadcastSession(s, { cause: 'sleep:failed' });
          const bg = !!(w.stopped || restored.background);
          const e = this.block(s, bg ? 'background' : 'sleep_failed');
          b.store.addEvent(s.sessionId, 'sleep_exit_screen', { background: bg, tasks: (w.stopped && w.stopped.tasks) || 0, esc: restored.esc, cleared: restored.cleared, retryMs: e.until - e.at });
          if (bg) throw keyed(apiError('sleep_background', `@${s.name} 세션을 지금 절전 모드로 전환할 수 없습니다: background`), 'sleepRefused', { name: s.name, reason: m('sleepWhy_background') });
          throw apiError('still_running', `@${s.name} 세션의 claude 프로세스가 /exit 후에도 종료되지 않았습니다.`);
        }
        steps.push(`/exit ${Date.now() - t}ms`);
      }
      // P105: 작업 공간의 패널 목록을 읽지 못하면 이 패널만 닫는다(같은 작업 공간에 나눈 패널의 명령이 함께 죽지 않게)
      const shared = await b.adapter.workspacePanes(s.termWorkspaceId).then((ps) => ps.filter((x) => x.paneId !== s.paneId)).catch(() => null);
      if (!shared || shared.length) await b.adapter.closePane(s.paneId).then(() => steps.push(`pane ${s.paneId} closed`)).catch((e) => steps.push(`pane.close failed ${e.code}`));
      else await b.adapter.closeWorkspace(s.termWorkspaceId).then(() => steps.push(`workspace ${s.termWorkspaceId} closed`)).catch((e) => steps.push(`workspace.close failed ${e.code}`));
      try { b.relay.detach(s.sessionId); } catch {}
      const pane = s.paneId;
      // 잠든 세션은 패널이 없다. resync·자원 감시·셸 확인은 paneId가 없는 세션을 건너뛴다
      s.paneId = null; s.termWorkspaceId = null; s.resumeVerified = false;
      rt.exit = null; rt.exitRequested = false; rt.sessionEnd = null; rt.pendingAsk = null; rt.interruptedTurn = null;
      rt.term = { status: null, launchPending: false, agentSessionId: null, present: false, at: Date.now() };
      rt.sleep = { at: rt.sleep.at, by, scope: rt.sleep.scope || scope, convId: conv.convId, memMB: mem.memMB, procs: mem.procs.length, prevState: prev.state, pane };
      b.store.updateSession(s.sessionId, { paneId: null, termWorkspaceId: null, resumeVerified: false, runtime: rt });
      await b.adapter.refreshSubscription();
      // 패널의 프로세스(claude, 셸, MCP 서버)가 끝났는지 본다
      let left = mem.procs;
      for (const tw = Date.now(); left.length && Date.now() - tw < 5000; ) { await sleep(250); left = left.filter((x) => pidAlive(x.pid)); }
      const out = { slept: true, name: s.name, by, scope: rt.sleep.scope, memMB: mem.memMB, procs: mem.procs.map((x) => x.name), left: left.map((x) => `${x.name}:${x.pid}`), convId: conv.convId, steps, ms: Date.now() - t0 };
      this.blocked.delete(s.sessionId); // P105
      b.store.addEvent(s.sessionId, 'slept', out);
      b.log(`slept ${s.name} by=${by} scope=${rt.sleep.scope} mem=${mem.memMB}MB procs=${mem.procs.length} left=${left.length} in ${out.ms}ms`);
      b.broadcastSession(s, { cause: `sleep:${by}` });
      if (b.resources && b.resources.sample) b.resources.sample().catch(() => {}); // 메모리 알약을 바로 줄인다(다음 30초 표본을 기다리지 않게)
      return out;
    } catch (e) {
      if (rt.sleep && rt.sleep.going && s.paneId) { rt.sleep = null; b.broadcastSession(s, { cause: 'sleep:failed' }); }
      b.store.addEvent(s.sessionId, 'sleep_failed', { by, error: e.code || e.message });
      throw e;
    } finally { b.killing.delete(s.sessionId); }
  }

  // 세션 하나를 깨운다. delayMs가 있으면(리포의 나머지) 그동안도 "깨우는 중"으로 보이고 전달은 기다린다
  wake(s, why, delayMs = 0) {
    if (this.wakes.has(s.sessionId)) return this.wakes.get(s.sessionId);
    if (!s.rt.sleep && !this.going.has(s.sessionId)) return Promise.resolve({ awake: true, name: s.name, state: deriveState(s.rt).state });
    if (delayMs) { s.waking = { at: Date.now(), why, queued: true }; this.b.broadcastSession(s, { cause: `wake:${why}` }); }
    const job = (async () => { if (delayMs) await sleep(delayMs); return this._wake(s, why); })().finally(() => { this.wakes.delete(s.sessionId); });
    this.wakes.set(s.sessionId, job);
    return job;
  }
  async _wake(s, why) {
    const b = this.b;
    if (this.going.has(s.sessionId)) await this.going.get(s.sessionId).catch(() => {});
    if (!s.rt.sleep || !b.sessions.has(s.sessionId)) { if (s.waking) { s.waking = null; if (b.sessions.has(s.sessionId)) b.broadcastSession(s, { cause: `wake:${why}` }); } return { awake: true, name: s.name, state: deriveState(s.rt).state }; }
    const t0 = Date.now();
    const z = { ...s.rt.sleep, error: undefined };
    s.waking = { at: t0, why };
    b.broadcastSession(s, { cause: `wake:${why}` });
    let created = null;
    try {
      b.requireTerminal();
      if (!s.cwd || !fs.existsSync(s.cwd)) throw keyed(apiError('no_folder', `폴더를 찾을 수 없습니다: ${s.cwd}`), 'noFolder', { path: s.cwd });
      const claude = (s.kind || 'claude') === 'claude';
      const conv = this.convFor(s);
      // P170: 하네스는 되살리기·다시 열기와 같은 하네스 이어 가기 값(연결·안내문·PATH의 atrium·토큰 파일, backend.startHarness)으로 같은 대화를 잇는다
      const { plan, args, model: rm } = claude ? wakeArgs(b.launchOf(s), conv, b.modelNowFor ? b.modelNowFor(s) : s.rt.modelNow) : { plan: conv.convId ? 'resume' : 'fresh', args: null };
      created = await b.withNewPane(() => b.adapter.createWorkspace({ cwd: s.cwd, label: s.name }), (r) => {
        s.paneId = r.paneId; s.termWorkspaceId = r.workspaceId;
        const rt = s.rt;
        rt.sleep = null; rt.exit = null; rt.phase = 'starting'; rt.launchedAt = Date.now(); rt.hooksSinceLaunch = 0; rt.sessionEnd = null; rt.pendingAsk = null; rt.lastError = null;
        rt.term = { status: null, launchPending: true, agentSessionId: null, present: false, at: Date.now() };
        b.store.updateSession(s.sessionId, { paneId: r.paneId, termWorkspaceId: r.workspaceId, runtime: rt });
      });
      await b.adapter.refreshSubscription();
      b.broadcastSession(s, { cause: `wake:${why}` });
      if (claude) {
        await b.adapter.waitShellReady(s.paneId, 8000);
        const st = await b.adapter.startAgent({ name: s.agentName, paneId: s.paneId, args, ...startOpt(s) }); // P97: 실행 명령
        if (st.agent && st.agent.launchPending !== undefined) s.rt.term.launchPending = st.agent.launchPending;
      } else await b.startHarness(s, { resume: true, why: 'wake' });
      // 준비될 때까지(ready, 또는 사람이 필요한 상태). claude가 끝나면(이어 가기 실패) 잠듦으로 되돌린다
      let state = deriveState(s.rt).state;
      for (const tw = Date.now(); Date.now() - tw < this.wakeReadyMs; ) {
        state = deriveState(s.rt).state;
        if (s.rt.exit) throw apiError('resume_failed', `대화를 재개한 직후 ${s.kind || 'claude'} 프로세스가 종료되었습니다 (${s.rt.exit.kind}${s.rt.exit.reason ? `: ${s.rt.exit.reason}` : ''})`);
        if (['ready', 'working', 'waiting', 'trust_wait', 'error'].includes(state)) break;
        if (!b.sessions.has(s.sessionId)) throw apiError('closed', "작업을 재개하는 동안 세션이 닫혔습니다.");
        await sleep(200);
      }
      if (!['ready', 'working', 'waiting', 'trust_wait', 'error'].includes(state)) throw apiError('timeout', `${Math.round(this.wakeReadyMs / 1000)}초 안에 준비되지 않았습니다.`);
      // 이어 간 직후 터미널이 idle을 알려도 Claude Code 입력 칸이 아직 Enter를 받지 않을 때가 있다(P21 창 시험: 깬 직후 보낸 글이 제출되지 않고 입력 칸에 남음).
      // 깨우는 중(s.waking)인 동안 전달은 starting으로 기다리므로 잠깐 더 둔다
      if (state === 'ready' && this.settleMs) await sleep(this.settleMs);
      if (s.rt.exit) throw apiError('resume_failed', `대화를 재개한 직후 ${s.kind || 'claude'} 프로세스가 종료되었습니다 (${s.rt.exit.kind})`);
      state = deriveState(s.rt).state;
      s.wokeAt = Date.now(); s.waking = null; s.draft = false;
      const out = { woke: true, name: s.name, why, plan, convId: conv.convId, state, ms: Date.now() - t0, sleptMs: t0 - (z.at || t0), paneId: s.paneId, ...(rm ? { model: rm } : {}) }; // P227: 이어 간 모델·노력 수준과 출처
      b.store.addEvent(s.sessionId, 'woke', out);
      b.log(`woke ${s.name} why=${why} plan=${plan} in ${out.ms}ms`);
      b.broadcastSession(s, { cause: `wake:${why}` });
      return out;
    } catch (e) {
      s.waking = null;
      const error = { code: e.code || 'error', message: e.message, at: Date.now() };
      if (created && b.sessions.has(s.sessionId)) {
        // 만든 패널을 닫고 잠듦으로 되돌린다
        b.killing.add(s.sessionId);
        try {
          if (s.rt.term.present && (s.kind || 'claude') !== 'claude' && typeof b.stopHarnessAgent === 'function') await b.stopHarnessAgent(s).catch(() => {}); // P170
          else if (s.rt.term.present) { await b.adapter.sendText(s.paneId, '/exit').catch(() => {}); await sleep(150); await b.adapter.paneKeys(s.paneId, ['enter']).catch(() => {}); for (const t = Date.now(); s.rt.term.present && Date.now() - t < 5000; ) await sleep(200); }
          await b.adapter.closeWorkspace(created.workspaceId).catch(() => {});
        } finally { b.killing.delete(s.sessionId); }
      }
      if (b.sessions.has(s.sessionId)) {
        const rt = s.rt;
        s.paneId = null; s.termWorkspaceId = null;
        rt.exit = null; rt.sessionEnd = null; rt.pendingAsk = null; rt.term = { status: null, launchPending: false, agentSessionId: null, present: false, at: Date.now() };
        rt.sleep = { ...z, error };
        b.store.updateSession(s.sessionId, { paneId: null, termWorkspaceId: null, runtime: rt });
        b.queue.cancelSession(s.sessionId, `wake failed: ${error.code}`); // 깨지 못한 세션에 보낼 글은 취소한다(Thread에 남는다)
        b.adapter.refreshSubscription().catch(() => {});
        b.broadcastSession(s, { cause: 'wake:failed' });
      }
      b.store.addEvent(s.sessionId, 'wake_failed', { why, error, ms: Date.now() - t0 });
      b.log(`wake ${s.name} failed: ${error.code} ${error.message}`);
      throw keyed(apiError(error.code === 'terminal_down' ? 'terminal_down' : 'wake_failed', `@${s.name} 세션의 작업을 재개하지 못했습니다: ${error.message}`), 'wakeFailed', { name: s.name, error: error.message });
    }
  }
}
