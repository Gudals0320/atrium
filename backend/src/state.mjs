// 상태 계산기(ARCH 3절). 터미널 상태(hc: 프로그램이 OSC 7501로 알린 것, rt.term)를 패널 상태의 기준으로 쓰고, hook으로 상세와 오류를 더한다.
// 세션마다 runtime 객체 하나를 두고 아래 apply* 함수로 바꾼다. deriveState는 runtime만 보고 상태를 정한다(순수 함수).
// P4: hook이 없는 세션(판이 띄우지 않은 에이전트, Claude Code가 아닌 종류)은 터미널 상태만으로 정한다(ARCH 4절 F3·F5).
//   묻는 내용은 화면(pane.read)에서 읽고, 승인 카드는 "터미널에서 답하기"로 보낸다.
import { unwrapPasted, clip, isBoardNotice } from './text.mjs';
import { bgTasksOf } from './push-cycle.mjs'; // P92

// P41: Claude Code가 고른 모델을 쓰지 못할 때의 글("There's an issue with the selected model (x). It may not exist or you may not have access to it.")과 오류 종류
// 답 글로 볼 때는 그 글로 시작하는 것만(답 안에서 그 글을 인용한 것은 오류가 아니다)
export const MODEL_ERROR_ANSWER_RE = /^\s*There's an issue with the selected model\b/;
export const isModelError = (e) => !!e && (/model_not_found|invalid_model/i.test(String(e.type || '')) || /issue with the selected model|model_not_found|model not found/i.test(String(e.message || '')));

export const STATES = ['starting', 'trust_wait', 'ready', 'working', 'waiting', 'error', 'exited', 'shell_idle', 'shell_running', 'sleeping']; // 셸 상태 둘은 P5(G2), 잠듦은 P21(D4)
const ASK_TOOLS = { AskUserQuestion: 'question', ExitPlanMode: 'plan' };
const SHELL_TOOLS = new Set(['Bash', 'PowerShell']); // 같은 부류로 다룬다(E2 3절)

// P129: 업데이트 전에 저장한 세션 runtime을 지금 이름으로 읽는다(옛 이름 받기): 터미널 상태 칸 herdr → term, 종료 종류 herdr_stopped → terminal_stopped
const OLD_TERM_KEY = 'herdr', OLD_STOPPED = 'herdr_stopped';
export function upgradeRuntime(rt) {
  if (!rt || typeof rt !== 'object') return rt;
  if (rt[OLD_TERM_KEY] && !rt.term) rt.term = rt[OLD_TERM_KEY];
  delete rt[OLD_TERM_KEY];
  if (rt.exit && rt.exit.kind === OLD_STOPPED) rt.exit.kind = 'terminal_stopped';
  return rt;
}
export function newRuntime({ trustPredicted = false, now = Date.now(), kind = 'claude', hooked = true } = {}) {
  return {
    kind, // 에이전트 종류(claude, codex, …)
    hooked, // 판의 --settings hook이 붙은 세션인가(판이 띄운 Claude Code만)
    screenAsk: null, // hook이 없는 세션이 막혔을 때 화면 끝 { tail, at }
    answerSource: null, // 'hook' | 'screen'(hook이 없는 세션은 턴이 끝날 때 화면 끝을 마지막 답으로 둔다)
    phase: 'starting', // starting → running. 터미널 서버가 다시 뜨거나 claude가 이어 갈 때 다시 starting
    launchedAt: now,
    term: { status: null, launchPending: true, agentSessionId: null, present: false, at: null }, // 터미널이 아는 에이전트 상태(P129 전 이름 herdr)
    hooksSinceLaunch: 0,
    lastHookAt: null,
    lastActivityAt: now,
    pendingAsk: null,
    lastAskResolved: null,
    lastPre: null, // 마지막 PreToolUse { tool, toolUseId, input }
    lastPrompt: null,
    lastPromptAt: null,
    turn: { startedAt: null, endedAt: null },
    lastAnswer: null,
    lastAnswerAt: null,
    lastError: null,
    permissionMode: null,
    sessionEnd: null, // SessionEnd hook { reason, at }
    exit: null, // { kind: normal|terminal_stopped|trust_declined|other, reason, at }
    trustPredicted,
    trustScreen: null, // 화면에서 "Quick safety check"를 봤는지
    interruptedTurn: null, // C3: 터미널 서버가 꺼질 때 working/waiting이던 턴
    transcriptPath: null,
    claudeSessionId: null,
    sleep: null, // P21(D4): 잠듦 { at, by, memMB, convId, … }. 있으면 claude와 패널이 없고 상태는 sleeping
    workSince: null, // P173: 터미널이 working이 된 때(이번 일 구간의 시작)
    lastWork: null, // P173: 끝난 일 구간 { since, endedAt, turnless, compact } — turnless면 턴이 아니다(압축 등)
    compact: null, // P173: 대화 압축 { trigger: manual|auto|…, at, endedAt } (PreCompact·PostCompact hook)
    recordAsk: null, // P381: 하네스 기록에서 읽은 열린 질문(omo ask_user_question, omo-record.mjs omoAskOf). hook이 없는 세션의 응답 필요 본문
  };
}

// 권한 요청 상세 요약: 도구 이름과 명령 또는 파일
export function summarizeTool(tool, input = {}) {
  if (!input || typeof input !== 'object') return tool;
  if (SHELL_TOOLS.has(tool)) return `${tool}: ${clip(input.command || '', 300)}`;
  if (input.file_path) return `${tool}: ${input.file_path}`;
  if (input.url) return `${tool}: ${input.url}`;
  if (input.pattern) return `${tool}: ${input.pattern}`;
  return `${tool}: ${clip(JSON.stringify(input), 200)}`;
}

export function applyHook(rt, body, now = Date.now()) {
  const ev = body.hook_event_name;
  rt.hooksSinceLaunch++;
  rt.lastHookAt = now;
  rt.lastActivityAt = now;
  if (body.transcript_path) rt.transcriptPath = body.transcript_path;
  if (body.session_id) rt.claudeSessionId = body.session_id;
  if (body.permission_mode) rt.permissionMode = body.permission_mode;
  const tool = body.tool_name;
  switch (ev) {
    case 'UserPromptSubmit':
      if (!isBoardNotice(body.prompt)) { rt.lastPrompt = unwrapPasted(body.prompt); rt.lastPromptAt = now; } // P153 r13: 판 알림은 마지막 지시가 아니다. P159: 관계 줄 + 지시는 지시다(원문을 두고 보일 때 promptTask로 줄을 뗀다)
      rt.turn = { startedAt: now, endedAt: null };
      rt.lastError = null;
      break;
    case 'PreToolUse':
      if (!body.agent_id) rt.toolAt = now; // P240: 주 에이전트의 도구 hook(턴이 돈다는 흔적). 하위 에이전트(agent_id)의 것은 뒤 하위 에이전트일 수 있어 세지 않는다
      rt.lastPre = { tool, toolUseId: body.tool_use_id, input: body.tool_input };
      rt.recentPre = [...(rt.recentPre || []).slice(-7), { tool, toolUseId: body.tool_use_id || null, input: JSON.stringify(body.tool_input ?? null) }]; // P232: 권한 질문을 그 도구 호출에 잇는다
      if (ASK_TOOLS[tool]) rt.pendingAsk = askFrom(ASK_TOOLS[tool], tool, body.tool_input, body.tool_use_id, now);
      break;
    case 'PermissionRequest': {
      // P232(H18): 병렬 호출이면 PreToolUse가 여럿 먼저 올 수 있다. 같은 도구·같은 입력의 PreToolUse(아직 줄에 없는 것)로 잇는다
      const inJson = JSON.stringify(body.tool_input ?? null);
      const queued = new Set((rt.askQueue || []).map((a) => a.toolUseId).filter(Boolean));
      const pre = (rt.recentPre || []).find((p) => p.tool === tool && p.input === inJson && p.toolUseId && !queued.has(p.toolUseId));
      const toolUseId = body.tool_use_id || (pre ? pre.toolUseId : rt.lastPre && rt.lastPre.tool === tool ? rt.lastPre.toolUseId : null);
      const kind = ASK_TOOLS[tool] || 'permission';
      const prev = rt.pendingAsk && rt.pendingAsk.toolUseId === toolUseId ? rt.pendingAsk : null;
      const ask = { ...askFrom(kind, tool, body.tool_input, toolUseId, prev ? prev.since : now), suggestions: body.permission_suggestions || null, choices: prev ? prev.choices : null };
      // P232(H18): 병렬 도구 호출의 권한 질문은 hook이 한꺼번에 오고 화면은 "1 of 2", "2 of 2"로 차례로 묻는다.
      //   온 차례대로 줄에 세우고, 기다리는 ask는 줄의 첫째(화면의 지금 질문)다. 앞 질문이 풀리면 다음 것이 올라온다
      const q = (rt.askQueue || []).filter((a) => !(toolUseId && a.toolUseId === toolUseId));
      const at = (rt.askQueue || []).findIndex((a) => toolUseId && a.toolUseId === toolUseId);
      if (at >= 0) q.splice(at, 0, ask); else q.push(ask);
      rt.askQueue = q;
      rt.pendingAsk = q[0];
      break;
    }
    case 'Notification':
      if (rt.pendingAsk && body.notification_type === 'permission_prompt') rt.pendingAsk.notifiedAt = now;
      break;
    case 'PostToolUse':
    case 'PostToolUseFailure':
    case 'PermissionDenied':
      if (body.tool_use_id && rt.askQueue) rt.askQueue = rt.askQueue.filter((a) => a.toolUseId !== body.tool_use_id); // P232: 줄에서 뺀다
      if (rt.pendingAsk && (!rt.pendingAsk.toolUseId || rt.pendingAsk.toolUseId === body.tool_use_id)) { resolveAsk(rt, ev, now); nextAsk(rt); }
      break;
    case 'Stop':
      // P41: 모델 오류는 Stop으로 와도(답 글이 Claude Code의 오류 글) 오류로 본다
      if (MODEL_ERROR_ANSWER_RE.test(String(body.last_assistant_message || ''))) rt.lastError = { type: 'model_not_found', message: clip(body.last_assistant_message, 400), at: now };
      rt.lastAnswer = body.last_assistant_message ?? rt.lastAnswer;
      rt.lastAnswerAt = now;
      rt.turn.endedAt = now;
      if (rt.pendingAsk) resolveAsk(rt, 'Stop', now);
      rt.askQueue = null; rt.recentPre = null; // P232
      break;
    case 'StopFailure':
      rt.lastError = { type: body.error || body.error_type || 'unknown', message: body.message || body.error_message || body.error_details || null, at: now };
      rt.turn.endedAt = now;
      break;
    case 'PreCompact': // P173: 대화 압축이 시작됨(사람의 /compact, 자동, 쉬는 동안의 압축). 턴이 아니다
      rt.compact = { trigger: body.trigger || null, at: now, endedAt: null };
      break;
    case 'PostCompact':
      rt.compact = { ...(rt.compact || { trigger: body.trigger || null, at: now }), endedAt: now };
      break;
    case 'SessionEnd':
      rt.sessionEnd = { reason: body.reason || null, at: now };
      rt.bg = null;
      break;
    case 'SubagentStop': // 상태는 바꾸지 않는다(E2 2.4). P322: 끝난 서브에이전트(agent_id)를 적어 두어 칩이 바로 "끝"으로 본다
      if (body.agent_id) rt.subStops = [...(rt.subStops || []).slice(-31), String(body.agent_id)];
      break;
    default:
  }
  // P173: 턴 hook(지시, 턴 끝)이 일 구간이 끝난 직후에 왔다(늦게 온 hook). 그 구간은 턴이었다
  if ((ev === 'UserPromptSubmit' || ev === 'Stop' || ev === 'StopFailure') && rt.lastWork && rt.lastWork.turnless && now - rt.lastWork.endedAt <= LATE_TURN_HOOK_MS) {
    rt.lastWork = { ...rt.lastWork, turnless: false, late: true };
    if (ev !== 'UserPromptSubmit' && !rt.turn.endedAt) rt.turn.endedAt = now;
  }
  // P92: Stop·SubagentStop의 background_tasks = 지금 도는 뒤 일(뒤 셸, 뒤 하위 에이전트). 없으면(옛 Claude Code) 전 값을 둔다
  if (ev === 'Stop' || ev === 'SubagentStop') { const tasks = bgTasksOf(body); if (tasks) rt.bg = { tasks, at: now }; }
}

function askFrom(kind, tool, input, toolUseId, since) {
  const a = { kind, tool, toolUseId: toolUseId || null, since, notifiedAt: null };
  if (kind === 'question') a.questions = ((input && input.questions) || []).map((q) => ({ question: q.question, header: q.header, multiSelect: !!q.multiSelect, options: (q.options || []).map((o) => o.label) }));
  else if (kind === 'plan') a.plan = clip(input && input.plan, 2000);
  else a.summary = summarizeTool(tool, input);
  a.input = input;
  return a;
}
// P232(H18): 화면에서 읽은 권한 질문(screen.mjs parsePermissionDialog) → 응답 필요 ask. hook이 없던 둘째 질문("2 of 2")도 카드와 atrium answer가 답한다
const HEAD_TOOL = [[/^Bash command$/i, 'Bash'], [/^PowerShell command$/i, 'PowerShell'], [/^Edit file$/i, 'Edit'], [/^(Create|Write) file$/i, 'Write'], [/^Read file$/i, 'Read'], [/^Fetch$/i, 'WebFetch'], [/^Web ?Search$/i, 'WebSearch']];
export function screenPermissionAsk(p, now = Date.now()) {
  const hit = p.tool ? HEAD_TOOL.find(([re]) => re.test(p.tool)) : null;
  const tool = hit ? hit[1] : null;
  const what = p.detail || p.question || null;
  return { kind: 'permission', tool, toolUseId: null, since: now, notifiedAt: null, summary: tool ? `${tool}: ${what || '?'}` : what || 'permission', choices: p.choices, question: p.question || null, fromScreen: true, ...(p.step ? { step: p.step } : {}) };
}
function resolveAsk(rt, how, now) {
  const a = rt.pendingAsk;
  rt.lastAskResolved = { ...a, input: undefined, resolvedBy: how, resolvedAt: now }; rt.pendingAsk = null;
  if (rt.askQueue && a) rt.askQueue = rt.askQueue.filter((x) => x !== a && !(a.toolUseId && x.toolUseId === a.toolUseId)); // P232
}
// P232(H18): 줄에 남은 다음 권한 질문을 기다리는 ask로(화면이 다음 질문을 보일 때)
function nextAsk(rt) { if (!rt.pendingAsk && rt.askQueue && rt.askQueue.length) rt.pendingAsk = rt.askQueue[0]; }

// P173: 턴 없는 일. Claude Code는 사람이 친 /compact와 쉬는 동안의 압축("Compacted while idle")에도 터미널을 working → done으로 바꾼다.
// 그 사이에 지시(UserPromptSubmit)도 턴 끝(Stop·StopFailure)도 오지 않는다(오는 것은 SubagentStop, PreCompact·PostCompact뿐).
// hook이 붙은 Claude Code의 일 구간이 그렇게 끝나면 턴이 아니다: 작업 완료·안 본 답·웹 푸시·연결 알림을 만들지 않는다.
// Stop·UserPromptSubmit hook은 Claude Code가 응답을 기다리는 hook이라 터미널 상태보다 먼저 온다. 지시가 터미널 working보다 조금 먼저 올 수 있어 TURN_HOOK_SLACK_MS만큼 앞을 본다
export const TURN_HOOK_SLACK_MS = 3000;
export const LATE_TURN_HOOK_MS = 2000;
export function turnlessWork(rt) {
  if (rt.hooked === false || (rt.kind && rt.kind !== 'claude') || rt.workSince == null || !rt.hooksSinceLaunch) return false; // hook이 하나도 오지 않은 세션은 판정하지 않는다
  const from = rt.workSince - TURN_HOOK_SLACK_MS;
  const err = rt.lastError && rt.lastError.at;
  return !((rt.turn.startedAt || 0) >= from || (rt.lastAnswerAt || 0) >= from || (err || 0) >= from);
}

export function applyTermStatus(rt, status, now = Date.now(), extra = {}) {
  const prev = rt.term.status;
  rt.term.status = status;
  rt.term.at = now;
  if (extra.launchPending !== undefined) rt.term.launchPending = extra.launchPending;
  if (extra.agentSessionId !== undefined) rt.term.agentSessionId = extra.agentSessionId;
  // 끝난 claude를 되살리는 것은 agent_detected만 한다. 해제 직후에도 idle 이벤트가 한 번 온다(E10 2.4).
  rt.lastActivityAt = now;
  // waiting은 hook이 아니라 터미널 상태가 blocked에서 벗어날 때 끝낸다. 거부·취소에는 hook이 없다(E9).
  if (prev === 'blocked' && status !== 'blocked' && rt.pendingAsk) resolveAsk(rt, `term:${status}`, now);
  // P232(H18): 턴이 끝나면(쉼) 줄을 비우고, 다시 막히면 줄의 다음 질문이 기다리는 ask다
  if (status === 'idle' || status === 'done') rt.askQueue = null;
  if (status === 'blocked') nextAsk(rt);
  if (status !== 'blocked') { rt.trustScreen = null; rt.screenAsk = null; rt.worktreeExit = null; }
  // hook이 없는 세션의 턴은 터미널 상태로 센다(검토 대기 표시에 쓴다)
  if (rt.hooked === false && status === 'working' && prev !== 'working') rt.turn = { startedAt: now, endedAt: null };
  if (rt.phase === 'starting' && (status === 'idle' || status === 'done' || status === 'blocked' || status === 'working')) rt.phase = 'running';
  // P173: 일 구간의 시작과 끝. 턴 없는 구간(압축)은 턴 끝(turn.endedAt)을 바꾸지 않는다
  let turnless = false;
  // 막힘(blocked: 승인 질문)은 구간을 끊지 않는다(같은 턴이 이어진다). 놓임(unknown 등)은 구간을 버린다
  if (status === 'working' && prev !== 'working') { if (prev !== 'blocked' || rt.workSince == null) rt.workSince = now; }
  else if (rt.workSince != null && (status === 'idle' || status === 'done')) {
    turnless = turnlessWork(rt);
    const c = rt.compact && rt.compact.at >= (rt.workSince ?? now) - TURN_HOOK_SLACK_MS ? rt.compact.trigger || 'compact' : null;
    rt.lastWork = { since: rt.workSince, endedAt: now, turnless, ...(c ? { compact: c } : {}) };
    rt.workSince = null;
  } else if (status !== 'working' && status !== 'blocked') rt.workSince = null;
  if (!turnless && (prev === 'working' || (rt.hooked === false && prev === 'blocked')) && (status === 'idle' || status === 'done') && !rt.turn.endedAt && rt.turn.startedAt) rt.turn.endedAt = now;
  return prev;
}

// 터미널이 패널에서 에이전트를 다시 찾음(처음 띄울 때, 서버 재시작 뒤 이어 갈 때)
export function applyAgentDetected(rt, now = Date.now()) {
  rt.term.present = true;
  if (rt.exit) rt.bg = null; // P92: 다시 뜬 claude에는 뒤 일이 없다
  if (rt.exit) { rt.exit = null; rt.phase = 'starting'; rt.launchedAt = now; rt.hooksSinceLaunch = 0; rt.sessionEnd = null; }
}

// P125: 사람이 스스로 끝낸 것으로 보는 SessionEnd 까닭(입력 칸의 Ctrl+C 두 번·Ctrl+D·/exit, /logout)과 종료 코드.
// 종료 코드는 hc가 준다(옛 터미널은 주지 않았다). 0, 130(SIGINT), 0xC000013A(STATUS_CONTROL_C_EXIT: Windows 콘솔 Ctrl+C로 끝남)
export const USER_END_REASONS = new Set(['prompt_input_exit', 'logout']);
export const USER_EXIT_CODES = new Set([0, 130, 0xC000013A, -1073741510]);
export const userExitCode = (code) => code != null && USER_EXIT_CODES.has(Number(code));

// P125: claude(또는 다른 하네스)가 끝난 까닭(exit.kind)
//   normal         판이 끄라고 했다(/exit, 끄기·잠재우기·옮기기)
//   user           판이 끄라고 하지 않았는데 사람이 끝냈다(사람이 닫음). 오류가 아니고, 사이드바·노드에서 다시 연다
//   terminal_stopped  터미널 서버가 꺼졌다(판이 되살린다)
//   trust_declined 신뢰 질문에서 거절해 끝났다
//   other          그 밖(오류 코드, 충돌, 까닭 모름)
export function exitKind({ reason = null, termStopping = false, before = null, hooked = true, hooksSinceLaunch = 0, launchPending = false, requested = false, exitCode = null } = {}) {
  if (termStopping) return 'terminal_stopped';
  if (reason && USER_END_REASONS.has(reason)) return requested ? 'normal' : 'user';
  if (reason === 'other') return !requested && userExitCode(exitCode) ? 'user' : 'other'; // 콘솔 Ctrl+C 신호 등으로 끝나면 까닭이 other다. 종료 코드가 사람의 끝이면 user
  if (before === 'trust_wait' || (hooked !== false && !reason && hooksSinceLaunch === 0 && launchPending)) return 'trust_declined';
  if (requested) return hooked === false ? 'normal' : 'other'; // hook이 없는 세션은 판이 끄라고 했을 때만 정상 종료로 본다(hook이 있는데 SessionEnd 없이 끝나면 지금처럼 other)
  return userExitCode(exitCode) ? 'user' : 'other'; // hook·까닭이 없으면 종료 코드로 가른다(hc). 코드를 모르면 지금처럼 other
}

// claude가 끝나 패널이 셸로 돌아감. exitCode: 끝난 프로그램의 종료 코드(hc만, 모르면 null)
export function applyAgentReleased(rt, now = Date.now(), { termStopping = false, exitCode = null } = {}) {
  const before = deriveState(rt).state;
  rt.term.present = false;
  rt.term.status = 'unknown';
  rt.pendingAsk = null;
  rt.recordAsk = null; // P381
  rt.worktreeExit = null;
  rt.bg = null; // P92: claude가 끝나면 뒤 일도 끝난다
  const reason = rt.sessionEnd && rt.sessionEnd.reason;
  const requested = !!(rt.exitRequested || rt.boardExit);
  const kind = exitKind({ reason, termStopping, before, hooked: rt.hooked, hooksSinceLaunch: rt.hooksSinceLaunch, launchPending: rt.term.launchPending, requested, exitCode });
  rt.exitRequested = false;
  rt.exit = { kind, reason: reason || null, at: now, ...(exitCode != null ? { code: exitCode } : {}), ...(requested ? { requested: true } : {}), ...(kind === 'trust_declined' && before !== 'trust_wait' ? { guessed: true } : {}) }; // P337: 신뢰 질문을 보지 못하고 짐작한 신뢰 거부
}

// P378: 잘못 둔 끝남(exited)을 거둔다. 터미널에 같은 에이전트가 살아 있다(같은 세션의 hook이나 터미널 working이 왔고 판이 터미널에서 확인했다).
//   끝남 전의 기록(hook 수, 턴, 마지막 답)은 그대로 둔다. 터미널 상태는 부른 쪽이 맞춘다 → 거둔 끝남 | null
export function applyExitRevoked(rt, now = Date.now()) {
  const was = rt && rt.exit;
  if (!was) return null;
  rt.exit = null; rt.sessionEnd = null; rt.exitRequested = false;
  rt.term.present = true; rt.phase = 'running'; rt.lastActivityAt = now;
  return was;
}

// P337: 띄우자마자(hook 하나 없이) 끝난 에이전트의 마지막 화면에서 오류 문장 한 줄을 찾는다(claude -w의 "Cannot create worktree: … is a symlink" 등).
//   오류 낱말(error, cannot, failed, fatal, not found, denied, invalid)이 든 줄 가운데 마지막 것. 셸 프롬프트·빈 줄·상자 테두리는 건너뛴다. 없으면 null
const ERR_WORD = /\b(error|errors|cannot|can't|could not|couldn't|failed|failure|fatal|not found|denied|invalid|unable)\b/i;
export function launchErrorOf(text) {
  const lines = String(text || '').split(/\r?\n/).map((l) => l.replace(/[\u2500-\u257f\u2580-\u259f]+/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i];
    if (/^(PS [^>]*>|[$#>%]\s*$)/.test(l)) continue;
    if (ERR_WORD.test(l)) return l.length > 300 ? l.slice(0, 299) + '…' : l;
  }
  return null;
}
// 끝난 에이전트의 마지막 화면 글을 끝남에 붙인다. 띄운 뒤 hook이 하나도 오지 않은 끝남(짐작한 신뢰 거부, 까닭 모름)만 본다.
//   오류 문장이 있으면 exit.error로 두고, 짐작한 신뢰 거부는 그 문장이 신뢰 얘기가 아니면 오류 끝남(other)으로 고친다. 바뀌면 true
export function applyExitText(rt, text) {
  const x = rt && rt.exit;
  if (!x || x.error || x.requested || !['trust_declined', 'other'].includes(x.kind) || (x.kind === 'trust_declined' && !x.guessed) || rt.hooked === false || rt.hooksSinceLaunch > 0) return false;
  const err = launchErrorOf(text);
  if (!err) return false;
  x.error = err;
  if (x.kind === 'trust_declined' && !/trust/i.test(err)) { x.kind = 'other'; delete x.guessed; }
  return true;
}

// P125: 놓임 뒤에 온 종료 코드(hc가 셸을 남기며 알림). 까닭을 몰라 other로 둔 끝남이 사람의 끝 코드면 user로 고친다. 바뀌면 true
export function applyExitCode(rt, code) {
  if (!rt.exit || code == null || rt.exit.code != null) return false;
  rt.exit.code = code;
  if (rt.exit.kind === 'other' && !rt.exit.requested && userExitCode(code)) rt.exit.kind = 'user';
  return true;
}

// 터미널 서버가 꺼짐(소켓 끊김). 진행 중이던 턴은 끊긴다(E7 2.4).
export function applyTermDisconnected(rt, now = Date.now()) {
  const st = deriveState(rt).state;
  if (st === 'working' || st === 'waiting') rt.interruptedTurn = { state: st, at: now, prompt: clip(rt.lastPrompt, 200) };
  // I8(P6b): 셸에서 돌던 명령도 셸과 함께 끝난다. 다시 띄운 셸은 프롬프트에서 쉬므로 끊긴 명령을 남긴다
  if (st === 'shell_running') rt.interruptedTurn = { state: st, at: now, prompt: clip((rt.shell && (rt.shell.command || (rt.shell.procs || []).join(', '))) || null, 200) };
  if (rt.term.present) applyAgentReleased(rt, now, { termStopping: true });
  rt.term.status = null;
}

// P71: 화면에서 읽은 워크트리 나가기 질문(screen.mjs parseWorktreeExit) → 승인 줄이 보일 ask
export function worktreeExitAsk(w) {
  return { kind: 'worktree_exit', commits: w.commits ?? null, files: w.files || 0, branch: w.branch || null, keep: w.keep, remove: w.remove, since: w.at };
}

// P119: 판이 닫는 세션(닫기, 다시 띄우기)의 /exit 뒤 막힘. rt.boardExit = { by, at, foreign? }은 판이 /exit를 보낼 때 두고 끝나면 지운다.
// 판이 답하는 워크트리 나가기 질문은 사람의 일이 아니라 응답 필요(알림, 목록, 푸시, 트레이)로 보이지 않는다.
// 판이 모르는 화면(foreign: 나가기 질문이 아닌 막힘)이면 지금처럼 응답 필요다.
export const boardClosing = (rt) => !!(rt.boardExit && !rt.boardExit.foreign);
const closingState = (rt) => ({ state: 'ready', closing: rt.boardExit.by || 'close', estimate: 'board closing' });

export function deriveState(rt) {
  const h = rt.term;
  if (rt.sleep) return { state: 'sleeping' }; // P21(D4): 판이 잠재움. 패널이 없다(J1·J2의 닫힘과 다르다)
  if (rt.move) return { state: 'starting', moving: rt.move.to }; // P117: 다른 터미널 백엔드로 옮기는 중(옛 claude를 끄고 새 자리에서 이어 감). 전달은 기다린다
  if (rt.exit) return { state: 'exited' };
  // G2(P5): 에이전트 없는 일반 셸. 프롬프트에서 쉬는가(shell_idle), 명령을 돌리는가(shell_running). hook도 승인 카드도 없다
  // P309: 화면을 차지한 채 조용한 프로그램(rt.shell.program)은 일하는 중으로 세지 않는다(셸에서 연 TUI가 영원히 "명령 실행 중"이던 것)
  if (rt.kind === 'shell') return { state: rt.shell && rt.shell.atPrompt === false && !rt.shell.program ? 'shell_running' : 'shell_idle' };
  const s = h.status;
  if (rt.hooked === false) {
    if (s === 'blocked') {
      if ((rt.kind === 'claude' || rt.kind === 'agy' || rt.kind === 'codex') && rt.trustScreen) return { state: 'trust_wait', confirmedByScreen: true }; // P192: AGY 신뢰 질문. P208: Codex
      if (boardClosing(rt)) return closingState(rt);
      if (rt.kind === 'claude' && rt.worktreeExit) return { state: 'waiting', ask: worktreeExitAsk(rt.worktreeExit) };
      if (rt.recordAsk) return { state: 'waiting', ask: rt.recordAsk }; // P381: 기록에서 읽은 질문(본문·선택지). 못 읽으면 아래 화면 끝
      return { state: 'waiting', ask: { kind: 'screen', tail: rt.screenAsk ? rt.screenAsk.tail : null, since: rt.screenAsk ? rt.screenAsk.at : h.at } };
    }
    if (s === 'working') return { state: 'working' };
    // P381: 턴은 쉬는데 기록의 생명 주기가 사람의 답을 기다린다(기다리지 않는 질문 waitForAnswer:false 등). 일하는 중에는 보지 않는다(기록이 늦게 닫힐 수 있다)
    if ((s === 'idle' || s === 'done') && rt.recordAsk && rt.recordAsk.waitingHuman) return { state: 'waiting', ask: rt.recordAsk, estimate: `record waiting_human, term ${s}` };
    if (s === 'idle' || s === 'done') return { state: 'ready' };
    if (s === 'unknown' && rt.phase === 'running' && h.present) return { state: 'ready', estimate: 'term unknown' };
    return { state: 'starting' };
  }
  if (s === 'blocked') {
    if (rt.pendingAsk) return { state: 'waiting', ask: rt.pendingAsk };
    // P119: 판이 스스로 닫는 중(/exit를 보내고 나가기 질문에 답한다)이면 응답 필요로 보이지 않는다. 신뢰 질문은 그대로다
    if (boardClosing(rt) && (rt.worktreeExit || !(rt.trustScreen || (h.launchPending && !h.agentSessionId && rt.hooksSinceLaunch === 0)))) return closingState(rt);
    if (rt.worktreeExit) return { state: 'waiting', ask: worktreeExitAsk(rt.worktreeExit) }; // P71: 워크트리 나가기 질문(화면에서 읽음)
    // 신뢰 대화상자: 화면의 "Quick safety check", 또는 hook 없음 + launch_pending + agent_session 없음(E10)
    if (rt.trustScreen || (h.launchPending && !h.agentSessionId && rt.hooksSinceLaunch === 0)) return { state: 'trust_wait', confirmedByScreen: !!rt.trustScreen };
    return { state: 'waiting', ask: { kind: 'unknown_dialog' }, estimate: 'term blocked, no ask hook' };
  }
  if (rt.pendingAsk && (s === 'working' || s === 'idle' || s === 'done')) return { state: 'waiting', ask: rt.pendingAsk, estimate: `hook waiting, term ${s}` };
  if (s === 'working') return rt.compact && !rt.compact.endedAt && rt.workSince != null && rt.compact.at >= rt.workSince - TURN_HOOK_SLACK_MS ? { state: 'working', estimate: 'compacting' } : { state: 'working' }; // P173: 압축 중
  if (s === 'idle' || s === 'done') return rt.lastError ? { state: 'error', error: rt.lastError } : { state: 'ready' };
  return { state: 'starting' };
}

// P141(#14): 응답 필요(waiting, trust_wait)가 시작된 때. rt.waitingSince = { key, at }로 runtime에 남아
// 백엔드·터미널 서버를 다시 켜도 같은 질문(같은 tool_use_id, 신뢰 질문, 화면 질문)이면 그 시각을 잇는다.
// 다시 켜는 사이의 중간 상태(starting, 터미널 서버가 꺼져 끝남)에서는 지우지 않는다. 다른 상태가 되면 지운다.
export function needKey(d) {
  if (d.state === 'trust_wait') return 'trust';
  if (d.state !== 'waiting') return null;
  const a = d.ask || {};
  if (a.toolUseId) return `ask:${a.toolUseId}`;
  if (a.kind === 'screen' || a.kind === 'unknown_dialog') return 'screen';
  return `ask:${a.kind || ''}:${a.tool || ''}:${a.summary || ''}`;
}
export function trackWaiting(rt, d = deriveState(rt), now = Date.now()) {
  const key = needKey(d);
  if (!key) {
    const between = d.state === 'starting' || (d.state === 'exited' && rt.exit && rt.exit.kind === 'terminal_stopped');
    if (!between) rt.waitingSince = null;
    return null;
  }
  const w = rt.waitingSince;
  if (!w || w.key !== key) rt.waitingSince = { key, at: Math.min(now, (d.ask && d.ask.since) || now) };
  return rt.waitingSince.at;
}

// 상태에 덧붙이는 표시(3절): 검토 대기, 조용함, 전달 중
export function flags(rt, { seenAt = null, delivering = 0, quietMs, now = Date.now() } = {}) {
  const st = deriveState(rt).state;
  return {
    unseen: !!(rt.turn.endedAt && (!seenAt || seenAt < rt.turn.endedAt) && (st === 'ready' || st === 'error' || st === 'sleeping')), // P21: 잠들어도 안 본 답은 검토 대기로 남긴다
    quiet: st === 'working' && quietMs ? now - rt.lastActivityAt > quietMs : false,
    delivering,
  };
}
