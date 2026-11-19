// P185: rig 3단계 — 자리(seat), 건(case), 자리로 보내기, done 값에 따른 넘김, 되돌아감 상한(docs research harness-arch.md 14절).
// rig를 "훅과 도구 묶음"에서 "흐름"으로 만든다. 정의 검사는 rig.mjs validateFlow, 표는 store-rig.mjs(rig_cases, rig_case_items, rig_seat_counters, sessions.rig_seat, work_units.case_id·seat·via).
// - 자리는 세션의 속성이다(sessions.rig_seat). 사람이 판 API rig.seat(이 PC의 창만)로 정하거나, 판이 자리를 위해 띄운다. 에이전트는 정하지 못한다.
//   켜진 rig의 정의에 그 자리가 있을 때만 자리 세션이다. 자리 없는 세션과 rig가 꺼진 워크스페이스는 0~2단계 그대로다.
// - keep 자리: 열린 세션 하나가 앉는다(없으면 판이 <자리> 이름으로 띄운다. 그 이름을 다른 열린 세션이 쓰면 <자리>-<n>).
//   fresh 자리: 일마다 새 세션 <자리>-<n>(n은 워크스페이스·자리마다 DB의 셈, 다시 쓰지 않는다). worktree면 일마다 <자리>-<일 ID> 워크트리.
//   max_live: 열린 시도를 쥔 그 자리 세션 수. 넘으면 일이 자리 줄에 선다(work_units.to_session ''). 끝난 fresh 세션은 판에 남고 수에 들지 않는다.
// - 자리 세션의 atrium prompt: 흐름에 { from: 내 자리, on: assign, to } 줄이 있으면 받는 자리에 일을 만들고(건이 이어진다), may에 있으면 일 없이 글만,
//   둘 다 아니면 거절하고 쓸 수 있는 자리를 알린다. 0단계의 이어지는 지시(내가 맡긴 열린 시도를 가진 세션에 다시 보냄)는 그대로다.
// - 자리 세션의 atrium done <값>: results의 낱말만 받는다. { from: 그 자리, on: 값 } 줄마다 받는 자리에 같은 건의 새 일(갈라짐). 넘김 글은 판이 만들고
//   deliver 훅(from flow)을 지난다. 맞는 줄이 없으면 done 값이 건의 주인에게 간다(0단계 보고와 같은 꼴).
// - 흐름이 만든 일의 상위(멈춤 알림을 받는 곳, work_units.from)는 건의 주인이고, 판이 자리를 위해 띄운 세션도 건의 주인의 하위로 띄운다(잠재우기 묶음·child-kill이 0단계 그대로).
// - 되돌아감 상한: 줄의 max를 건 안에서 센다(rig_cases.edge_counts). 넘으면 else → manager → 건 blocked + 건 주인에게 판 알림. 올릴 때 넘김 글에 건의 이력을 붙인다.
// - 건: 자리 세션이 일을 처음 맡기는 순간 생기고(그 세션이 어떤 건의 열린 시도를 쥐고 있으면 그 건을 잇는다), 열린 일이 없으면 done, 주인 세션이 닫히면 cancelled.
//   건이 띄운 세션과 워크트리를 rig_case_items에 적는다(판은 지우지 않는다. 5단계 관리자 자리가 정리한다).
// P188(5단계, 15절): 건은 만들어질 때의 정의 버전(rig_cases.version_n)을 쥐고 그 건의 자리·흐름·상한은 그 버전을 따른다(seatCtx·defOfCase).
//   느린 고리(cycles): 주기마다 받는 자리(보통 manager)에 새 건의 일 하나(판의 장부 요약 + run 출력). 다음 시각은 rig_cycles.
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { shownName } from './session-label.mjs';
import { clip } from './text.mjs';
import { SEAT_KINDS, mayReachOutside } from './rig.mjs';
import { spawnPlan, killTree } from './hook-runner.mjs'; // P188: 느린 고리의 run
import { rootedRun } from './tool-runs.mjs';
import { cleanEnv } from './proc-env.mjs';
import { SEAT_SPAWN, SEAT_RUN, effectivePermission, seatRunOf } from './rig-amp.mjs'; // P189. P231: 실제로 도는 권한
import { rigEvent, OWNER } from './rig-ledger.mjs'; // P217: 장부
import { seatDocsOf, docsTail, docLoadEvent } from './rig-docs.mjs'; // P219: 머리의 문서 목록
import { RigLoops, runNameOf, implicitCycleLoop } from './rig-loops.mjs'; // P221: 고리(계기, 회 이름, 멈추기·잇기)
import { sectorsFor } from './rig-sectors.mjs'; // P222: 산출물 섹터
import { deriveState } from './state.mjs'; // P225: 자리 세션 닫기(close run)는 턴이 끝난 뒤

function apiError(code, message, extra = {}) { return Object.assign(new Error(message), { code }, extra); }
const newId = (p, n = 3) => p + crypto.randomBytes(n).toString('hex');
const firstLine = (t, n = 100) => clip(String(t || '').split('\n').find((x) => x.trim()) || '', n);
export const CASE_STATES = ['open', 'done', 'blocked', 'waiting_owner', 'cancelled'];
// P194: 아직 끝나지 않은 건(흐름이 이어지고, 주인이 닫히면 cancelled). waiting_owner: 상한을 넘어 주인에게 보고로 올라가 주인의 다음 맡기기를 기다린다
const LIVE_CASE = new Set(['open', 'blocked', 'waiting_owner']);
const RUN_CLOSE_BOOT_MS = 5000; // P226: 판이 다시 뜬 뒤 close run 대기를 처음 볼 때(세션이 다 붙은 뒤)
const SPEC_HEAD_LINES = 6; // 넘김 글에 붙이는 건의 첫 할 일 줄 수
const GRAPH_LIVE = 50; // P197: 세션 맵 그래프에 담는 끝나지 않은 건 상한(17절)
const GRAPH_CLOSED = 3; // P197: 나이와 상관없이 담는 최근 끝난·취소된 건 수

// P197: 세션 맵 rig 띠의 열 순서(17절 "열과 행"): assign 줄의 출발 자리(정의 순서) → 흐름 줄의 받는 자리를 따라 너비 우선(줄 순서)
//   → 닿지 않는 자리, 주기·올림(else·manager)에만 쓰이는 자리(정의 순서). 지금 정의의 자리만(옛 자리는 graphOf가 뒤에 더한다)
export function seatColumns(def) {
  const seats = (def && def.seats) || {}; const flow = (def && def.flow) || [];
  const order = []; const seen = new Set();
  const push = (n) => { if (n && Object.prototype.hasOwnProperty.call(seats, n) && !seen.has(n)) { seen.add(n); order.push(n); } };
  for (const n of Object.keys(seats)) if (flow.some((l) => l.from === n && l.on === 'assign')) push(n);
  for (let i = 0; i < order.length; i++) for (const l of flow) if (l.from === order[i]) for (const t of l.to || []) push(t);
  for (const n of Object.keys(seats)) push(n);
  return order;
}

// 자리 세션의 일 머리(관계 줄 꼴이라 카드에는 아래 할 일만 지시로 보인다). 0단계 unitHeader 대신
// P188: 판 줄 세 줄 이하(15절). done 값과 보낼 수 있는 자리의 자세한 목록은 `atrium me`·`atrium guide`로 보내고 머리에는 가리킴만 남긴다
//   (머리가 길면 Claude Code가 첫 지시를 붙여 넣은 자료로 감싸는 경계를 더 자주 넘는다)
// guide: 그 자리의 안내 파일이 있으면 일을 시작하기 전에 읽으라고 한다(P185 개발용 판: 안내를 읽지 않은 모델이 자리의 일과 다르게 닫았다)
// P219: docs(seatDocsOf: 그 자리의 loads·reads)가 있으면 셋째 줄 끝에 늘 싣는 문서 경로와 `atrium item`(자세한 목록)을 붙인다(세 줄 그대로)
// P232: 사람 글의 본문(일 머리 판 알림 줄 "[Atrium …]"과 그 뒤 빈 줄을 뗀 것). 본문이 없으면 원문
export function bodyOf(text) {
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  let i = 0;
  while (i < lines.length && (/^\[Atrium/.test(lines[i].trim()) || (i > 0 && !lines[i].trim()))) i++;
  const rest = lines.slice(i).join('\n').trim();
  return rest || String(text || '');
}
// P230(rig2-design 11.12의 2·3): extra(판이 더하는 줄). scoped 자리는 셸 안내 한 줄, 관리자 자리가 없는 rig는 보고에 적으라는 한 줄(seatExtraLines)
export function seatHeader({ seat, unitId, caseId, by, guide = false, docs = null, extra = [] }) {
  const tail = docsTail(docs);
  return [
    `[Atrium 보드] 관계: 너는 rig의 ${seat} 자리다. 아래 일은 건 ${caseId}의 일 ${unitId}이다(${by}).`,
    '[Atrium 보드] 끝나면 `atrium done <값> "<보고>"`로 닫고 쉰다(값과 보낼 수 있는 자리는 `atrium me`). 보고는 done 글에만 넣는다.',
    `[Atrium 보드] 사람이 직접 다르게 시키면 그것을 따른다. ${guide ? '일을 시작하기 전에 `atrium guide`로 이 자리의 안내를 먼저 읽는다.' : '안내: `atrium guide`.'}${tail ? ` ${tail}` : ''}`,
    ...extra,
  ].join('\n');
}
// P232(rig2-design 11.14의 2): cd '<폴더>' && <명령>은 Claude Code가 나눠 규칙을 맞추므로 막지 않는다. 파이프와 셸 감싸기, git -C(허용 목록이 받지 않음)만 말한다
export const SCOPED_SHELL_LINE = '[Atrium 보드] Do not pipe shell commands or wrap them in another shell. Run git in the working folder without -C. A command that asks stops an unattended run. Read files with Read/Glob/Grep.';
// P231(rig2-design 11.13의 3): 사람 카드를 기다리는 회에 주인이 --case로 손댈 때의 까닭
export const humanWaitText = (caseId) => `회 ${caseId}은 사람이 정하는 중(응답 필요 카드)이다. 이 회는 기다린다. 같은 일을 새 회로 다시 열지 않는다.`;
// P231(11.13의 3): 사람이 상한 카드에 답한 결과를 주인 세션에 한 번 알리는 판 알림. action: accept | again | pause
export function humanDecidedText({ caseId, name = null, action, line = null, to = [] }) {
  const run = `회 ${caseId}${name ? `(${name})` : ''}`;
  if (action === 'accept') return `[Atrium 보드] 사람이 ${run}의 상한 카드에서 [그대로 받기]를 골랐다. 회는 done이다(받음).`;
  if (action === 'again') return `[Atrium 보드] 사람이 ${run}의 상한 카드에서 [한 번 더]를 골랐다: flow[${line}]으로 ${to.join(', ')} 자리에 한 번 더 넘겼다. 회는 다시 이어진다.`;
  return `[Atrium 보드] 사람이 ${run}의 상한 카드에서 [회 멈추기]를 골랐다. 회는 멈췄다(사람이 이을 때까지 기다린다). 같은 일을 새 회로 다시 열지 않는다.`;
}
// P234(rig2-design 11.16의 2): 판이 연 회(every 고리)의 scoped 자리는 허용 목록 밖 명령을 묻지 않고 거절한다(denyInsteadOfPrompting). 셸 줄의 "묻는 명령은 멈춘다"를 바꾼다
export const DENY_SHELL_LINE = '[Atrium 보드] Do not pipe shell commands or wrap them in another shell. Run git in the working folder without -C. Commands outside the allow list are refused without asking. Write what you could not run in your report. Read files with Read/Glob/Grep.';
export const NO_MANAGER_LINE = '[Atrium 보드] Write anything about pausing or changing the rig in your report; the human decides.';
// 정의와 자리 → 머리에 더할 줄. scoped: 실제로 도는 권한이 scoped. 관리자 자리가 없는 rig(자리가 있는 정의)는 모든 자리에
// P231(rig2-design 11.13의 5): approved(사람이 그 자리의 unattended를 승인했는가). 승인 전 unattended는 scoped로 돌므로 셸 줄을 단다. ask·승인된 unattended에는 달지 않는다
// P234: promptless(seatRunOf: 판이 연 회)면 scoped 자리의 셸 줄이 DENY_SHELL_LINE
export function seatExtraLines(def, seat, { approved = false, promptless = false } = {}) {
  const out = [];
  const sa = def && def.amp && def.amp.seats ? def.amp.seats[seat] : null;
  if (sa && effectivePermission(sa.permission, approved) === 'scoped') out.push(promptless ? DENY_SHELL_LINE : SCOPED_SHELL_LINE);
  if (def && def.seats && !def.manager) out.push(NO_MANAGER_LINE);
  return out;
}
// P193: 세션이 자리를 얻는 순간(사람의 rig.seat, rig.spawnSeat) 한 번 넣는 판 알림. 일 머리와 같이 세 줄 이하이고 모두 판 줄이라 카드의 지시가 되지 않는다.
//   흐름이 띄운 자리 세션은 첫 일의 머리(seatHeader)가 같은 것을 알려 이 알림을 받지 않는다. P191: 머리 없이 앉은 keep 자리(main)가
//   rig 흐름 대신 atrium child로 맡겨 건이 생기지 않았다
export function seatNotice({ seat, assign = [], may = [], results = [], guide = false, manager = false, docs = null, extra = [] }) { // P230: extra(seatExtraLines) // P219: docs(머리의 문서 목록)
  const where = [assign.length ? `일 맡기기: ${assign.join(', ')}` : null, may.length ? `글만: ${may.join(', ')}` : null, manager && !may.includes('*') ? 'rig 밖 세션에 글만' : null].filter(Boolean).join(' · '); // P195: 관리자 자리는 rig 밖 세션에 글을 보낸다
  return [
    `[Atrium 보드] 관계: 사람이 너를 rig의 ${seat} 자리에 앉혔다. 이 워크스페이스의 일은 rig 흐름(자리와 건)으로 나눈다.`,
    where
      ? `[Atrium 보드] 일을 맡길 때는 \`atrium child\` 대신 \`atrium prompt <자리> "<할 일>"\`로 자리에 보낸다(${where}). 받는 자리의 세션은 보드가 띄운다.`
      : '[Atrium 보드] 이 자리는 다른 자리에 일을 맡기지 않는다.',
    `[Atrium 보드] 자리로 받은 일은 \`atrium done <값> "<보고>"\`로 닫는다(값: ${results.join(', ') || 'ok, failed'}). ${guide ? '먼저 `atrium guide`로 이 자리의 안내를 읽는다.' : '안내: `atrium guide`.'}${docs ? ` ${docsTail(docs)}` : ''}`,
    ...extra,
  ].join('\n');
}
export const seatLeftNotice = (seat) => `[Atrium 보드] 관계: 사람이 너를 rig의 ${seat} 자리에서 뺐다. 이제 자리 없는 세션이다(\`atrium child\`·\`atrium prompt <세션>\`이 rig 밖 규칙대로 된다).`;

// P193: 그 워크스페이스의 켜진 rig에 이 이름의 자리가 있으면 그 자리 이름(없으면 null). 자리 이름은 소문자·숫자·_라 <이름>-<n>은 겹치지 않는다
export function seatNamed(rig, key, name) {
  const r = rig && typeof rig.active === 'function' && key && name ? rig.active(key) : null;
  const n = String(name || '').toLowerCase();
  return r && r.def && r.def.seats && Object.prototype.hasOwnProperty.call(r.def.seats, n) ? n : null;
}
// P194: 흐름 줄의 받는 곳이 건 주인 세션 자신일 때 일 대신 넣는 보고(0단계 done 보고 doneNotice와 같은 판 알림 꼴).
//   haiku 메인이 주인에게 돌아온 넘김 일을 done으로 닫지 않아 건이 열린 채 남았다(P193). 주인에게 가는 것은 일이 아니라 보고다
//   머리에는 건의 첫 할 일을 인용한다(닫은 일의 글은 판이 만든 넘김 글이라 주인이 알아보기 어렵다)
export function ownerReportText({ caseId, fromSeat, fromName, unitId, firstSpec, result, doneText, escalated = null, history = [] }) {
  const lines = [`[Atrium 보드] rig 건 ${caseId}("${clip(String(firstSpec || '').replace(/\s+/g, ' '), 60)}"): ${fromSeat} 자리(@${fromName})가 일 ${unitId}을 닫았다: ${result}`];
  lines.push(escalated
    ? `[Atrium 보드] 이것은 보고다(atrium done으로 닫을 일이 아니다). 되돌아감 상한을 넘어 너에게 올라왔다: flow[${escalated.line}]은 이 건에서 이미 ${escalated.max}번 지났다. 건은 waiting_owner다. 다음 \`atrium prompt <자리> "<할 일>"\`이 이 건을 잇는다(건이 여럿이면 --case ${caseId}).`
    : `[Atrium 보드] 이것은 보고다(atrium done으로 닫을 일이 아니다). 건에 열린 일이 없으면 건은 waiting_owner다: 이 턴에 \`atrium prompt <자리> "<할 일>"\`로 맡기면 같은 건을 잇고(흐름 줄의 지난 횟수도 이어 센다), 맡기지 않고 턴을 끝내면 건은 done이다.`);
  lines.push(String(doneText || '').replace(/\s+$/, ''));
  if (escalated && history.length) lines.push('', '--- 건의 이력(자리, 세션, 값, done 글 첫 줄) ---', ...history.map((h, i) => `${i + 1}. ${h.seat || '-'}(@${h.name}) ${h.result || h.status}${h.text ? `: ${h.text}` : ''}`));
  return lines.join('\n');
}
// 넘김 글(판이 만든다): 보낸 자리와 세션, 값, done 글, 건의 첫 할 일 앞 몇 줄, 올릴 때는 건의 이력
export function handoffText({ fromSeat, fromName, result, doneText, firstSpec, escalated = null, history = [] }) {
  const lines = [`${fromSeat} 자리(@${fromName})가 done ${result}로 넘긴 일이다.`];
  if (escalated) lines.push(`되돌아감 상한을 넘어 이 자리로 올라왔다: flow[${escalated.line}]은 이 건에서 이미 ${escalated.max}번 지났다.`);
  lines.push('', '--- 넘긴 done 글 ---', String(doneText || '').replace(/\s+$/, ''));
  if (firstSpec) {
    const head = String(firstSpec).split('\n');
    lines.push('', `--- 건의 첫 할 일(앞 ${Math.min(head.length, SPEC_HEAD_LINES)}줄) ---`, ...head.slice(0, SPEC_HEAD_LINES), ...(head.length > SPEC_HEAD_LINES ? ['…'] : []));
  }
  if (escalated && history.length) lines.push('', '--- 건의 이력(자리, 세션, 값, done 글 첫 줄) ---', ...history.map((h, i) => `${i + 1}. ${h.seat || '-'}(@${h.name}) ${h.result || h.status}${h.text ? `: ${h.text}` : ''}`));
  return lines.join('\n');
}

// P209: 자리의 effort·model → spawnChild 칸(atrium child --effort·--model과 같은 길. 호출자·주인의 값을 덮는다).
//   model은 종류 이름 자리만(validateFlow). 모델을 주면 종류도 준다: --model은 그 종류의 모델로 풀린다(주인과 같은 종류여도)
// P239(rig2-design 11.18): 다시 맡기기가 지금 정의에서 가져오는 자리 칸(그 밖의 칸과 흐름 줄·상한은 건이 쥔 버전)
export const SEAT_FROM_NOW = ['launcher', 'model', 'effort', 'permission', 'allow', 'writes'];
export function seatOverrides(seat) {
  const o = {};
  if (seat && seat.effort) o.effort = seat.effort;
  if (seat && seat.model) { o.model = seat.model; if (SEAT_KINDS.includes(seat.launcher)) o.kind = seat.launcher; }
  return o;
}

export class RigFlow {
  // b: 백엔드(store, sessions, rig, queue, log, linkEvent). branch: Branch(spawnChild, units, verbs)
  constructor(b, branch) {
    this.b = b; this.branch = branch;
    this.spawning = new Map(); // `${워크스페이스}|${자리}` → 띄우는 중인 수(max_live를 함께 넘지 않게)
    this.pumping = false;
    b.bus.on('closed', (s) => { try { this.onClosed(s); } catch (e) { b.log('rig flow closed error', e.stack); } });
    // P209: 주인 보고를 기다리는 건(owner_wait report)은 그 보고를 받은 주인의 턴이 맡기기 없이 끝나면 done
    this.prevState = new Map();
    b.bus.on('session', (s, sum) => { try { this.onSessionTurn(s, sum); } catch (e) { b.log('rig flow session error', e.stack); } });
    // 백엔드가 다시 뜬 뒤: 자리 줄(max_live)에 선 일을 다시 본다(세션이 다 붙은 뒤)
    if (b.store.seatWaitingAll && b.store.seatWaitingAll().length) { const t = setTimeout(() => this.pumpSoon(), 5000); if (t.unref) t.unref(); }
    // P188: 느린 고리. 다음 시각은 DB(rig_cycles)에 있고, 판이 꺼져 있던 동안 놓친 회는 한 번만 돈다
    this.cycleBusy = new Set(); this.cycleSkipNoted = new Set();
    this.loops = new RigLoops(b, this); // P221: 고리(every 계기는 같은 타이머가 돈다)
    this.runClose = new Map(); // P225: 닫을 fresh 자리 세션(close run) → { caseId, seat, key }. 턴이 끝나면 닫는다
    this.runClosing = false;
    // P226(11.10의 4): 대기는 표(rig_run_close)에도 둔다. 판이 다시 뜨면 읽어 세션이 다 붙은 뒤 닫는다
    try { for (const x of b.store.runCloseRows ? b.store.runCloseRows() : []) this.runClose.set(x.sessionId, { caseId: x.caseId, seat: x.seat, key: x.key }); } catch (e) { b.log('rig run close load error', e.message); }
    if (this.runClose.size) { const t = setTimeout(() => this.sweepRunClose().catch((e) => b.log('rig run close error', e.stack)), RUN_CLOSE_BOOT_MS); if (t.unref) t.unref(); }
    const tickMs = Math.max(1000, Math.min(30000, Math.floor((b.rig && b.rig.cycleMin ? b.rig.cycleMin() : 3600000) / 4)));
    if (b.cfg && b.cfg.rigCycles !== false) { this.cycleTimer = setInterval(() => { this.cycleTick().catch((e) => b.log('rig cycle error', e.stack)); }, tickMs); if (this.cycleTimer.unref) this.cycleTimer.unref(); }
  }
  store() { return this.b.store; }
  units() { return this.branch.units; }
  nameOf(id) { return this.units().nameOf(id); }

  // ---------- 자리 ----------
  // 세션의 자리 맥락. 켜진 rig 정의에 그 자리가 있을 때만 → { key, r, def, seat, name } | null
  // P188: 건은 만들어질 때의 정의 버전을 쥔다. 그 건의 자리·흐름·상한은 그 버전을 따른다(훅과 도구는 지금 정의).
  //   o.caseId: 그 건의 버전(null이면 지금 정의). 주지 않으면 세션이 쥔 열린 시도의 건
  seatCtx(s, o = {}) {
    if (!s || !s.rigSeat || !this.b.rig) return null;
    const r = this.b.rig.active(s.workspaceKey);
    if (!r) return null;
    const caseId = o.caseId !== undefined ? o.caseId : this.openCaseOf(s);
    const c = caseId ? this.store().getCase(caseId) : null;
    const def = this.defOfCase(c, r);
    if (!def.seats || !def.seats[s.rigSeat]) return null;
    return { key: s.workspaceKey, r, def, seat: def.seats[s.rigSeat], name: s.rigSeat, versionN: c && c.versionN != null ? c.versionN : r.n ?? null };
  }
  openCaseOf(s) { const st = this.store(); const tr = st.openTryOf(s.sessionId); const u = tr ? st.getUnit(tr.unitId) : null; return u && u.caseId ? u.caseId : null; }
  // 건의 버전 정의(없거나 읽지 못하면 지금 정의)
  defOfCase(c, r = null) {
    const rr = r || (c && this.b.rig ? this.b.rig.active(c.workspaceKey) : null);
    if (!c || c.versionN == null || !this.b.rig) return rr ? rr.def : null;
    return this.b.rig.versionDef(c.workspaceKey, c.versionN) || (rr ? rr.def : null);
  }
  assignTargets(ctx) { return [...new Set(ctx.def.flow.filter((l) => l.from === ctx.name && l.on === 'assign').map((l) => l.to[0]))]; }
  resultsFor(s) { const ctx = this.seatCtx(s); return ctx ? ctx.def.results : null; }
  seatedOf(key, seat) { return [...this.b.sessions.values()].filter((x) => x.workspaceKey === key && x.rigSeat === seat); }
  liveCount(key, seat) {
    const st = this.store();
    return this.seatedOf(key, seat).filter((x) => st.openTryOf(x.sessionId)).length + (this.spawning.get(`${key}|${seat}`) || 0);
  }

  // 판 API rig.seat(사람만, 이 PC의 창): 세션의 자리를 정하거나(seat) 뗀다(null)
  // P193: notify면 자리를 얻을 때 판 알림 한 번(seatNotice), 비울 때 한 줄(seatLeftNotice). 같은 자리로 다시 정하면 알리지 않는다.
  //   notify 'spawned'(rig.spawnSeat): 판이 띄울 때 이미 자리를 적었으므로(backend.spawn의 SEAT_SPAWN) 같은 자리여도 알린다
  setSeat(s, seat, { by = 'human', notify = false } = {}) {
    const b = this.b; const st = this.store();
    const r = b.rig ? b.rig.active(s.workspaceKey) : null;
    if (!r) throw apiError('rig_off', `@${shownName(s)}의 워크스페이스에는 켜진 rig가 없다. 자리는 rig가 켜진 워크스페이스에서만 정한다.`);
    if ((s.kind || 'claude') === 'shell') throw apiError('not_agent', '셸에는 자리를 정하지 않는다.');
    const want = seat == null || seat === '' ? null : String(seat);
    if (want) {
      if (!r.def.seats || !r.def.seats[want]) throw apiError('bad_request', `rig에 자리 ${want}가 없다. 자리: ${r.def.seats ? Object.keys(r.def.seats).join(', ') : '(없음)'}`);
      if (r.def.seats[want].session === 'keep') {
        const other = this.seatedOf(s.workspaceKey, want).find((x) => x.sessionId !== s.sessionId);
        if (other) throw apiError('seat_taken', `keep 자리 ${want}에는 이미 @${shownName(other)}가 앉아 있다. 먼저 그 세션의 자리를 뗀다.`);
      }
    }
    const before = s.rigSeat || null;
    st.setSessionSeat(s.sessionId, want);
    s.rigSeat = want;
    if (want && b.rigAmp && b.rigAmp.noteSeated) b.rigAmp.noteSeated(s); // P239(11.18 답 1): 떠 있는 세션을 앉히면 쉬는 때 자리 권한으로 다시 띄운다
    st.addEvent(s.sessionId, 'rig_seat', { workspace: s.workspaceKey, seat: want, before, by });
    rigEvent(b, { kind: 'seat_set', ws: s.workspaceKey, seat: want, session: s.sessionId, value: want, actor: by === 'human' ? 'human' : 'board', text: `@${shownName(s)}: ${before || '-'} → ${want || '-'}`, data: { before, by } });
    b.log(`rig seat ${s.name}: ${before || '-'} → ${want || '-'} (${by})`);
    if (b.broadcastSession) b.broadcastSession(s, { cause: 'rig_seat' });
    let noticeId = null;
    if (notify && (want !== before || (notify === 'spawned' && want)) && (want || before)) {
      const text = want ? this.seatNoticeOf(r.def, want, s.workspaceKey) : seatLeftNotice(before);
      const d = b.queue.enqueue(s.sessionId, text);
      noticeId = d.deliveryId;
      st.addEvent(s.sessionId, 'rig_seat_notice', { seat: want, before, deliveryId: d.deliveryId });
      if (want) docLoadEvent(b, { ws: s.workspaceKey, seat: want, session: s.sessionId, docs: seatDocsOf(r.def, want), where: 'seat', ref: d.deliveryId }); // P219
    }
    return { session: shownName(s), sessionId: s.sessionId, seat: want, before, workspace: s.workspaceKey, ...(noticeId ? { noticeId } : {}) };
  }
  seatNoticeOf(def, seat, key = null) {
    const x = def.seats[seat] || {};
    return seatNotice({ seat, assign: [...new Set(def.flow.filter((l) => l.from === seat && l.on === 'assign').map((l) => l.to[0]))], may: x.may || [], results: def.results || [], guide: !!x.guide, manager: def.manager === seat, docs: seatDocsOf(def, seat), extra: this.extraLinesOf(key, def, seat) });
  }
  // P231(11.13의 5): 머리에 더할 줄(실제로 도는 권한: 승인 전 unattended는 scoped)
  // P234: caseId(그 일의 회 → 고리의 계기). 없으면 keep 자리는 닿는 고리로, fresh 자리는 모름(묻는다)
  extraLinesOf(key, def, seat, { caseId = null } = {}) {
    const rig = this.b.rig;
    const approved = !!(key && rig && rig.permitted && rig.permitted(key, seat)); // 실제 권한(rig-amp ctxOf)과 같이 지금 정의의 승인으로 본다
    let loop = null;
    try { const c = caseId ? this.store().getCase(caseId) : null; loop = c ? c.loop : null; } catch {}
    return seatExtraLines(def, seat, { approved, promptless: seatRunOf(def, seat, { loop }).promptless });
  }

  // ---------- 건 ----------
  // P221: o { loop, name, trigger, spec } — 회의 고리(없으면 주인 자리로 고름)와 이름(없으면 spec의 첫 줄에서 뽑음)
  newCase(key, owner, actor = 'agent', o = {}) { // P217: actor(장부. 느린 고리가 만들면 cycle)
    const r = this.b.rig ? this.b.rig.active(key) : null;
    const loop = o.loop !== undefined ? o.loop : r ? this.loops.loopForSeat(r.def, owner.rigSeat || null) : null;
    const name = o.name || (o.spec ? runNameOf(o.spec) : null);
    const c = { id: newId('c'), workspaceKey: key, owner: owner.sessionId, state: 'open', createdAt: Date.now(), edgeCounts: {}, versionN: this.b.rig ? this.b.rig.currentN(key) : null, loop: loop || null, name: name || null, nameBy: name ? 'auto' : null, follows: o.follows || null }; // P188: 건이 쥐는 버전. P232: follows(이어진 회의 앞 회)
    this.store().insertCase(c);
    this.store().addEvent(owner.sessionId, 'rig_case_open', { caseId: c.id, workspace: key, version: c.versionN, ...(loop ? { loop } : {}) });
    rigEvent(this.b, { kind: 'case_open', ws: key, defN: c.versionN, caseId: c.id, seat: owner.rigSeat || null, session: owner.sessionId, actor, text: `주인 @${shownName(owner) || owner.name}`, data: { loop: loop || null, name: name || null, trigger: o.trigger || null, ...(o.follows ? { follows: o.follows } : {}) } }); // P221: run_open = case_open + data.loop. P232(11.14의 5): data.follows
    if (name) rigEvent(this.b, { kind: 'run_named', ws: key, defN: c.versionN, caseId: c.id, seat: owner.rigSeat || null, session: owner.sessionId, value: 'auto', actor: 'board', text: `"${name}"`, data: { name, before: null, by: 'auto', loop: loop || null } });
    this.b.log(`rig case ${c.id} open by ${owner.name}`);
    return this.store().getCase(c.id);
  }
  // 보낸 세션이 어떤 건의 열린 시도를 쥐고 있으면 그 건(blocked·waiting_owner였으면 다시 open).
  // P194: 아니면 보낸 세션이 주인인 waiting_owner 건이 정확히 하나일 때 그 건, 그 밖은 새 건.
  //   caseId(atrium prompt --case): 그 건을 고른다(이 워크스페이스, 끝나지 않은 건, 주인이거나 그 건의 열린 시도를 쥔 세션)
  caseFor(caller, key, { caseId = null, spec = null } = {}) { // P221: spec(새 건이면 회 이름을 뽑는다)
    const st = this.store();
    if (caseId) {
      const want = String(caseId).trim();
      const c = st.getCase(want);
      if (!c || c.workspaceKey !== key) throw apiError('rig_case', `이 워크스페이스에 건 ${want}이 없다. 내 건 보기: atrium me`);
      if (!LIVE_CASE.has(c.state)) throw apiError('rig_case', `건 ${c.id}은 이미 ${c.state}다. 새 건은 --case 없이 보낸다.`);
      if (c.owner !== caller.sessionId && this.openCaseOf(caller) !== c.id) throw apiError('rig_case', `건 ${c.id}의 주인(@${this.nameOf(c.owner)})이 아니라 이 건을 고를 수 없다.`);
      // P231(rig2-design 11.13의 3): 사람 카드(run_limit)를 기다리는 회는 사람이 정한다. 주인에게는 미리 알리지 않고, 손대면 까닭을 말한다
      if (c.state === 'waiting_owner' && c.ownerWait === 'human') throw apiError('rig_case', humanWaitText(c.id));
      return this.resumeCase(c, caller, 'case');
    }
    const tr = st.openTryOf(caller.sessionId);
    const u = tr ? st.getUnit(tr.unitId) : null;
    const c = u && u.caseId ? st.getCase(u.caseId) : null;
    if (c && LIVE_CASE.has(c.state)) return this.resumeCase(c, caller, 'held');
    const waiting = st.waitingCasesOfOwner ? st.waitingCasesOfOwner(caller.sessionId, key) : [];
    if (waiting.length === 1) return this.resumeCase(waiting[0], caller, 'waiting_owner');
    return this.newCase(key, caller, 'agent', { spec });
  }
  // 끝나지 않은 건을 다시 open으로(blocked·waiting_owner였으면 기록)
  resumeCase(c, caller, why) {
    const st = this.store();
    if (c.state !== 'open') {
      // P194 뒤(@fable-peer): 주인이 waiting_owner 건을 다시 맡기는 것은 새 결정이다. 줄별 지난 횟수를 0으로 되돌린다
      // (안 그러면 다음 반려 한 번에 곧바로 주인에게 돌아온다)
      // P209: 주인 보고를 기다리던 건(owner_wait report)은 되돌리지 않는다(주인을 지나는 반복도 흐름 줄 max가 센다). 상한을 넘어 올라온 건만 0으로
      const reset = c.state === 'waiting_owner' && c.owner === caller.sessionId && c.ownerWait !== 'report';
      // 지난 횟수(줄 번호 열쇠)만 0으로. 넘어간 이력(`<줄>>else`)은 남긴다(rig.cases의 escalated)
      const kept = reset ? Object.fromEntries(Object.entries(c.edgeCounts || {}).filter(([k]) => k.includes('>'))) : null;
      st.updateCase(c.id, { state: 'open', blockedReason: null, ownerWait: null, ownerWaitDelivery: null, ...(reset ? { edgeCounts: kept } : {}) });
      st.addEvent(caller.sessionId, 'rig_case_resume', { caseId: c.id, from: c.state, why, ...(c.ownerWait ? { ownerWait: c.ownerWait } : {}), ...(reset ? { countersReset: true } : {}) });
      rigEvent(this.b, { kind: 'case_resumed', caseId: c.id, seat: caller.rigSeat || null, session: caller.sessionId, value: why, actor: 'agent', text: `${c.state} → open`, data: { from: c.state, ...(c.ownerWait ? { ownerWait: c.ownerWait } : {}), ...(reset ? { countersReset: true } : {}) } });
      this.b.log(`rig case ${c.id} resumed (${c.state} → open, ${why}) by ${caller.name}`);
      this.changed(c.workspaceKey);
    } else if (c.ownerWait && c.owner === caller.sessionId) st.updateCase(c.id, { ownerWait: null, ownerWaitDelivery: null }); // P209: 열린 건에 주인이 맡겼다(받은 보고에 답했다)
    return st.getCase(c.id);
  }
  // 열린 일이 없으면 done. P209: 흐름 줄이 주인에게 보고를 넣었으면(owner_wait report) done 대신 waiting_owner(주인의 그 턴을 기다린다)
  caseCheck(caseId) {
    const st = this.store(); const c = st.getCase(caseId);
    if (!c || c.state !== 'open') return c;
    if (st.openUnitsOfCaseCount(caseId) > 0) return c;
    if (c.held && c.held.length) return c; // P221: 멈춘 동안 붙잡은 넘김이 있다(잇기가 넘긴다)
    if (c.ownerWait === 'report') {
      st.updateCase(caseId, { state: 'waiting_owner' });
      st.addEvent(c.owner, 'rig_case_waiting_owner', { caseId, why: 'report', deliveryId: c.ownerWaitDelivery });
      rigEvent(this.b, { kind: 'case_waiting_owner', caseId, session: c.owner, seat: this.seatOfSession(c.owner), value: 'report', actor: 'board', ref: c.ownerWaitDelivery });
      this.b.log(`rig case ${caseId} waiting_owner (owner report)`);
      this.changed(c.workspaceKey);
      return st.getCase(caseId);
    }
    return this.closeDone(c);
  }
  closeDone(c, why = null, value = null) { // P223: value(auto = 입구 세션이 쉬어 판이 닫음)
    const st = this.store(); const caseId = c.id;
    st.updateCase(caseId, { state: 'done', closedAt: Date.now(), ownerWait: null, ownerWaitDelivery: null });
    st.addEvent(c.owner, 'rig_case_done', { caseId, ...(why ? { why } : {}), ...(value ? { value } : {}) });
    // P225(rig2-design 11.9의 5): 개선 고리(kind improve)의 회가 산출물(제안 포함) 없이 끝나면 경고가 아니라 data.outcome "nothing"
    let outcome = null;
    try { const d = c.loop ? this.defOfCase(c) : null; const lp = d && d.loops ? d.loops[c.loop] : null; if (lp && lp.kind === 'improve' && st.artifacts && !st.artifacts({ ws: c.workspaceKey, caseId, limit: 1 }).length) outcome = 'nothing'; } catch {}
    const data = value || outcome ? { loop: c.loop || null, ...(value ? { by: value } : {}), ...(outcome ? { outcome } : {}) } : null;
    rigEvent(this.b, { kind: 'case_done', caseId, session: c.owner, seat: this.seatOfSession(c.owner), actor: 'board', ...(value ? { value } : {}), text: why || null, ...(data ? { data } : {}) });
    try { sectorsFor(this.b).onRunDone(st.getCase(caseId)); } catch (e) { this.b.log('rig artifacts run done error', e.stack); } // P222: 새 산출물은 받아들임, produces인데 없으면 경고
    try { this.queueRunClose(st.getCase(caseId)); } catch (e) { this.b.log('rig run close error', e.stack); } // P225: close run 자리 세션
    this.b.log(`rig case ${caseId} done${why ? ` (${why})` : ''}`);
    this.changed(c.workspaceKey);
    return st.getCase(caseId);
  }
  // ---------- P225: 자리 close(rig2-design 11.8의 8) ----------
  // 회가 닫히면 그 회가 띄운 fresh 자리 세션(rig_case_items) 가운데 close "run"인 자리의 세션을 닫는다. 대화 기록은 남는다(보관·삭제하지 않는다).
  //   회 도중에는 닫지 않는다(회가 닫힌 뒤에만). 세션이 일하는 중·사람의 답을 기다리는 중이면 턴이 끝난 뒤, 그 세션이 다른 일·회를 쥐면 남긴다
  queueRunClose(c) {
    if (!c || c.state !== 'done') return;
    const def = this.defOfCase(c);
    if (!def || !def.seats) return;
    let n = 0;
    for (const it of this.store().caseItems(c.id)) {
      const seat = def.seats[it.seat];
      if (!seat || seat.session !== 'fresh' || seat.close !== 'run' || !this.b.sessions.has(it.sessionId)) continue;
      this.runClose.set(it.sessionId, { caseId: c.id, seat: it.seat, key: c.workspaceKey }); n++;
      try { this.store().addRunClose && this.store().addRunClose({ sessionId: it.sessionId, key: c.workspaceKey, caseId: c.id, seat: it.seat }); } catch (e) { this.b.log('rig run close save error', e.message); } // P226
    }
    if (n) setImmediate(() => this.sweepRunClose().catch((e) => this.b.log('rig run close error', e.stack)));
  }
  dropRunClose(sid) { this.runClose.delete(sid); try { this.store().deleteRunClose && this.store().deleteRunClose(sid); } catch {} } // P226
  // 닫지 않는 까닭 | null(닫는다) | 'wait'(턴이 끝나기를 기다린다)
  runCloseWhy(s) {
    const st = this.store();
    const state = deriveState(s.rt || {}).state;
    if (['working', 'starting', 'waiting', 'trust_wait'].includes(state) || (this.b.killing && this.b.killing.has(s.sessionId))) return 'wait';
    if (st.openTryOf(s.sessionId) || (st.queuedUnitsOf && st.queuedUnitsOf(s.sessionId).length)) return 'busy';
    if (st.liveCasesOfOwner && st.liveCasesOfOwner(s.sessionId).length) return 'owner';
    if (this.b.queue && this.b.queue.list(s.sessionId).some((d) => !d.parked && d.status !== 'cancelled')) return 'wait'; // 갈 글이 남았다
    return null;
  }
  async sweepRunClose() {
    if (this.runClosing || !this.runClose.size) return [];
    this.runClosing = true; const closed = [];
    try {
      for (const [sid, x] of [...this.runClose]) {
        const s = this.b.sessions.get(sid);
        if (!s) {
          // P226: 판이 막 다시 떠 세션이 아직 붙지 않았으면(기록상 열린 세션) 기다린다. 닫혔거나 없으면 대기를 지운다
          const row = this.store().getSession ? this.store().getSession(sid) : null;
          if (row && !row.closedAt && !this.bootSwept) continue;
          this.dropRunClose(sid); continue;
        }
        const why = this.runCloseWhy(s);
        if (why === 'wait') continue;
        this.dropRunClose(sid);
        const name = shownName(s) || s.name;
        if (why) { rigEvent(this.b, { kind: 'cleanup', ws: x.key, caseId: x.caseId, seat: x.seat, session: sid, value: 'run', actor: 'board', text: `@${name} 남김(close run, ${why === 'owner' ? '다른 회의 주인' : '다른 일을 쥠'})`, data: { closed: [], kept: [`${name}:${why}`], by: 'run' } }); continue; }
        try {
          const r = typeof this.b.kill === 'function' ? await this.b.kill({ session: sid, confirm: true }) : null;
          const ok = !(r && r.closed === false);
          rigEvent(this.b, { kind: 'cleanup', ws: x.key, caseId: x.caseId, seat: x.seat, session: sid, value: 'run', actor: 'board', text: ok ? `@${name} 닫음(close run: 회가 끝남. 대화 기록은 남음)` : `@${name} 닫지 못함`, data: { closed: ok ? [name] : [], kept: ok ? [] : [`${name}:not closed`], by: 'run' } });
          if (ok) closed.push(x.key);
          this.b.log(`rig run ${x.caseId} close ${name}: ${ok ? 'closed' : 'not closed'}`);
        } catch (e) { this.b.log(`rig run ${x.caseId} close ${name} failed: ${e.code || e.message}`); }
      }
    } finally { this.runClosing = false; this.bootSwept = true; }
    for (const k of new Set(closed)) this.changed(k);
    return closed.length;
  }
  // P209: 주인의 턴 끝(working → ready·error). 주인 보고를 기다리는 건 가운데 그 보고가 이미 들어간 것(confirmed·unconfirmed)은 done.
  //   보고가 아직 줄에 있으면(다른 턴이 끝났다) 기다린다. 보고가 못 들어갔으면(failed·cancelled) 기다릴 턴이 없으니 done
  onSessionTurn(s, sum) {
    const sid = s.sessionId; const prev = this.prevState.get(sid);
    if (this.runClose.has(sid) && sum.state !== 'working' && sum.state !== 'starting') setImmediate(() => this.sweepRunClose().catch((e) => this.b.log('rig run close error', e.stack))); // P225
    this.prevState.set(sid, sum.state);
    if (prev === sum.state || sum.state === 'working' || sum.state === 'starting') return;
    const st = this.store();
    if (!st.liveCasesOfOwner) return;
    const turnEnded = prev === 'working' && (sum.state === 'ready' || sum.state === 'error');
    for (const c of st.liveCasesOfOwner(sid)) {
      if (c.state !== 'waiting_owner' || c.ownerWait !== 'report') continue;
      const d = c.ownerWaitDelivery && st.getDelivery ? st.getDelivery(c.ownerWaitDelivery) : null;
      const status = d ? d.status : null;
      if (status === 'failed' || status === 'cancelled' || (!d && turnEnded)) this.closeDone(c, 'owner report not delivered');
      else if (turnEnded && (status === 'confirmed' || status === 'unconfirmed')) this.closeDone(c, 'owner turn ended');
    }
  }
  // P216: notify false면 주인에게 막힘 알림을 넣지 않는다(종료 멈춤은 멈춤 알림 한 줄이 따로 간다)
  block(c, reason, { notify = true, why = null } = {}) {
    const b = this.b; const st = this.store();
    st.updateCase(c.id, { state: 'blocked', blockedReason: reason });
    st.addEvent(c.owner, 'rig_case_blocked', { caseId: c.id, reason, ...(why ? { why } : {}) });
    rigEvent(b, { kind: 'case_blocked', caseId: c.id, session: c.owner, seat: this.seatOfSession(c.owner), actor: 'board', text: reason, ...(why ? { value: why } : {}) });
    b.log(`rig case ${c.id} blocked: ${reason}`);
    if (notify && b.sessions.has(c.owner)) {
      const hist = this.history(c.id).map((h, i) => `${i + 1}. ${h.seat || '-'}(@${h.name}) ${h.result || h.status}${h.text ? `: ${h.text}` : ''}`);
      b.queue.enqueue(c.owner, [`[Atrium 보드] rig 건 ${c.id}이 막혔다(blocked): ${reason}`, ...(hist.length ? ['건의 이력:', ...hist] : []), '다음을 정해 일을 다시 맡기거나(atrium prompt <자리> "…") 사람에게 알린다.'].join('\n'));
    }
    this.changed(c.workspaceKey);
  }
  // 건의 이력: 일마다 받은 자리·세션·값·done 글 첫 줄
  history(caseId) {
    const st = this.store();
    return st.unitsOfCase(caseId).map((u) => {
      const tr = u.to ? st.lastTryOfUnit(u.id) : null;
      return { unit: u.id, seat: u.seat, sessionId: u.to || null, name: u.to ? this.nameOf(u.to) : '(줄)', status: u.status, result: tr ? tr.result : null, text: tr && tr.doneText ? firstLine(tr.doneText, 100) : null, via: u.via };
    });
  }
  // P217: 세션의 자리(닫힌 세션은 저장소에서)
  seatOfSession(sid) { const s = this.b.sessions.get(sid); if (s) return s.rigSeat || null; const r = this.store().getSession ? this.store().getSession(sid) : null; return r ? r.rigSeat || null : null; }
  changed(key) { if (this.b.api && this.b.api.broadcast) try { this.b.api.broadcast('rig.cases', { workspace: key }); } catch {} }

  // ---------- atrium prompt(자리 세션) ----------
  // → null(자리 세션이 아님: 0단계 그대로) | { kind: 'followup', t, tryRow, unit } | { kind: 'plain', t } | { kind: 'unit', ctx, seatName, t | null }
  planPrompt(caller, o, verbs) {
    const ctx = this.seatCtx(caller);
    if (!ctx) return null;
    const st = this.store();
    const ref = String(o.name ?? '').trim().replace(/^@/, '');
    const assign = this.assignTargets(ctx); const may = ctx.seat.may;
    let t = null, seatName = null;
    if (ref && Object.prototype.hasOwnProperty.call(ctx.def.seats, ref.toLowerCase())) seatName = ref.toLowerCase(); // P193: 자리 이름이 같은 이름의 세션보다 먼저
    else {
      t = verbs.target(caller, ref);
      const open = st.openTryOf(t.sessionId); const ou = open ? st.getUnit(open.unitId) : null;
      if (ou && (ou.from === caller.sessionId || (ou.via && ou.via.by === caller.sessionId))) return { kind: 'followup', t, tryRow: open, unit: ou };
      if (t.rigSeat && t.workspaceKey === ctx.key && ctx.def.seats[t.rigSeat]) seatName = t.rigSeat;
      // P195: rig 밖 세션(이 rig의 자리가 아님)에는 관리자 자리, 또는 may에 "@<이름>"·"*"를 둔 자리가 글만 보낸다(일은 만들지 않는다)
      else if (mayReachOutside(ctx.seat, ctx.def.manager, [shownName(t), t.name])) { if (t === caller) throw apiError('self', '자기 자신에게는 보낼 수 없다.'); return { kind: 'plain', t, outside: true }; }
    }
    if (seatName && assign.includes(seatName) && !o.now) return { kind: 'unit', ctx, seatName, t };
    if (seatName && may.includes(seatName)) {
      if (!t) {
        const sat = this.seatedOf(ctx.key, seatName).filter((x) => x !== caller);
        const myCase = (() => { const tr = st.openTryOf(caller.sessionId); const u = tr ? st.getUnit(tr.unitId) : null; return u ? u.caseId : null; })();
        const inCase = myCase ? sat.find((x) => { const tr = st.openTryOf(x.sessionId); const u = tr ? st.getUnit(tr.unitId) : null; return u && u.caseId === myCase; }) : null;
        t = inCase || sat.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0] || null;
        if (!t) throw apiError('rig_no_seat', `rig: ${seatName} 자리에 앉은 세션이 없다. 글만 보내는 자리(may)는 앉은 세션에게만 간다.`, { seat: seatName });
      }
      if (t === caller) throw apiError('self', '자기 자신에게는 보낼 수 없다.');
      return { kind: 'plain', t };
    }
    const where = `일 맡기기: ${assign.length ? assign.join(', ') : '없음'} · 글만: ${may.length ? may.join(', ') : '없음'}`;
    const what = seatName ? `${seatName} 자리` : `@${ref}${t && !t.rigSeat ? '(자리 없는 세션)' : ''}`;
    const why = seatName && assign.includes(seatName) && o.now ? ' --now는 일을 만들지 않는다. --now 없이 보낸다.' : '';
    // P195: rig 밖 세션이면 두 길을 알린다(정의의 may에 "@이름"·"*"를 넣기, 관리자 자리에서 보내기)
    const outside = !seatName && t ? ` rig 밖 세션에 글을 보내는 길은 둘이다: 사람이 정의의 seats.${ctx.name}.may에 "@${shownName(t) || ref}"(그 세션)나 "*"(자리 없는 세션 모두)를 넣거나, ${ctx.def.manager ? `관리자 자리(${ctx.def.manager})` : '관리자 자리(정의의 manager)'}에서 보낸다. rig 밖 세션에는 글만 가고 일은 만들지 않는다.` : '';
    throw apiError('rig_refused', `rig: ${ctx.name} 자리는 ${what}에 보낼 수 없다(보드가 넣지 않았다).${why} 쓸 수 있는 자리 — ${where}.${outside} 정의: .atrium/rig.json의 flow·may.`, { assign, may });
  }

  // 받는 자리에 일을 만든다(자리 세션의 prompt와 흐름의 넘김). → { unit, t, made } | { unit, t: null, seatWait: true, ahead }
  //   c: 건, by: 보낸 세션(이어지는 지시 판정·기록), t: 이름으로 고른 받는 세션(없으면 자리로)
  // P217: ledger — 넘김의 장부 줄(handoff·escalate). 없으면 assign 줄. 세션을 띄우기 전에 적는다(장부 차례: 넘김 → seat_spawn → try_start)
  async assign({ ctx, c, by, seatName, t = null, spec, origin, via = null, ledger = null }) {
    const b = this.b; const st = this.store(); const U = this.units();
    const owner = b.sessions.get(c.owner);
    if (!owner) throw apiError('closed', `건 ${c.id}의 주인 세션이 닫혀 일을 만들지 않는다.`);
    const paused = this.loops.pauseOf(c); // P221: 멈춘 회·고리는 새 넘김을 만들지 않는다(막힘 blocked과 다르다)
    if (paused) throw apiError('rig_paused', `rig: ${this.loops.pausedText(c, paused)}`, { caseId: c.id, loop: paused.loop || null });
    const seat = ctx.def.seats[seatName];
    const id = newId('u');
    const extra = { id, fromId: owner.sessionId, caseId: c.id, seat: seatName, via: { by: by.sessionId, fromSeat: this.seatCtx(by) ? by.rigSeat : null, ...(via || {}) } };
    if (!t && seat.session === 'keep') t = this.seatedOf(ctx.key, seatName)[0] || null;
    const queued = !t && seat.session === 'fresh' && this.liveCount(ctx.key, seatName) >= seat.maxLive;
    this.moveEvent({ ctx, c, by, seatName, unitId: id, origin, spec, t, queued, ledger });
    if (queued) {
      const unit = { id, from: owner.sessionId, to: '', origin, spec: String(spec), status: 'open', createdAt: Date.now(), caseId: c.id, seat: seatName, via: extra.via };
      st.insertUnit(unit);
      st.addEvent(owner.sessionId, 'unit_open', { unitId: id, from: by.name, origin, seat: seatName, seatWait: true, caseId: c.id, chars: unit.spec.length });
      rigEvent(b, { kind: 'seat_queue', caseId: c.id, unitId: id, seat: seatName, toSeat: seatName, actor: 'board', n: st.seatWaitingUnits(ctx.key, seatName).length, max: seat.maxLive, text: `${seatName} 자리 줄(max_live ${seat.maxLive})` });
      b.log(`unit ${id} → seat ${seatName} waits (max_live ${seat.maxLive})`);
      this.changed(ctx.key);
      return { unit: st.getUnit(id), t: null, seatWait: true, ahead: st.seatWaitingUnits(ctx.key, seatName).length - 1 };
    }
    if (!t) t = await this.spawnSeat(ctx, seatName, owner, c, id);
    const made = U.create(by, t, spec, origin, extra);
    this.changed(ctx.key);
    return { unit: made.unit, t, made };
  }
  // P217: 일이 자리로 가는 장부 줄. ledger가 있으면 넘김(handoff·escalate), 없으면 자리 세션의 assign 줄(흐름·주기의 일은 적지 않는다)
  moveEvent({ ctx, c, by, seatName, unitId, origin, spec, t = null, queued = false, ledger = null }) {
    const where = queued ? { queued: true } : t ? { to: t.sessionId } : {};
    if (ledger) return rigEvent(this.b, { ...ledger, caseId: c.id, unitId, toSeat: seatName, data: { ...(ledger.data || {}), ...where } });
    if (origin === 'flow' || origin === 'cycle') return null;
    const line = ctx.def.flow.find((l) => l.on === 'assign' && l.from === by.rigSeat && l.to[0] === seatName);
    rigEvent(this.b, { kind: 'assign', caseId: c.id, unitId, seat: by.rigSeat || null, session: by.sessionId, fromSeat: by.rigSeat || null, toSeat: seatName, line: line ? line.index : null, value: 'assign', actor: 'agent', text: firstLine(spec, 120), data: where });
  }

  // 자리를 위해 세션을 띄운다(건 주인의 하위로, atrium child와 같은 길: 런처·종류의 승인 방식, worktree면 claude -w)
  async spawnSeat(ctx, seatName, owner, c, unitId, { seatFrom = null } = {}) { // P239: seatFrom(다시 맡기기가 자리 칸을 가져온 지금 정의의 버전)
    const b = this.b; const st = this.store();
    const seat = ctx.def.seats[seatName];
    const taken = new Set([...b.sessions.values()].flatMap((x) => [x.name, shownName(x)]).filter(Boolean).map((x) => String(x).toLowerCase()));
    for (const n of this.branch.pendingNames || []) taken.add(String(n).toLowerCase());
    let name = seat.session === 'keep' && !taken.has(seatName) ? seatName : null;
    for (let i = 0; !name && i < 1000; i++) { const n = `${seatName}-${st.nextSeatN(ctx.key, seatName)}`; if (!taken.has(n)) name = n; }
    const worktree = seat.worktree ? `${seatName}-${unitId}` : null;
    const o = { name, role: seatName, cwd: ctx.r.root, wait: false, ...this.seatRoute(seat, seatName, owner), ...seatOverrides(seat), ...(worktree ? { worktree } : {}), [SEAT_SPAWN]: seatName, [SEAT_RUN]: { loop: c.loop || null } }; // P234: 그 회의 고리. P189: 띄울 때부터 자리의 증폭(설정 파일·Codex 인자)
    const k = `${ctx.key}|${seatName}`;
    this.spawning.set(k, (this.spawning.get(k) || 0) + 1);
    let r;
    try { r = await this.branch.spawnChild(owner, o); }
    finally { const n = (this.spawning.get(k) || 1) - 1; if (n > 0) this.spawning.set(k, n); else this.spawning.delete(k); }
    const s = b.sessions.get(r.sessionId);
    if (!s) throw apiError('spawn_failed', `${seatName} 자리 세션이 보드에 등록되지 않았다.`);
    st.setSessionSeat(s.sessionId, seatName); s.rigSeat = seatName;
    st.insertCaseItem({ caseId: c.id, sessionId: s.sessionId, seat: seatName, worktree, worktreePath: worktree ? path.join(ctx.r.root, '.claude', 'worktrees', worktree) : null });
    st.addEvent(s.sessionId, 'rig_seat_spawn', { seat: seatName, caseId: c.id, unitId, owner: owner.name, worktree, launcher: seat.launcher, session: seat.session, ...(seat.effort ? { effort: seat.effort } : {}), ...(seat.model ? { model: seat.model } : {}) });
    rigEvent(b, { kind: 'seat_spawn', caseId: c.id, unitId, seat: seatName, session: s.sessionId, toSeat: seatName, actor: 'board', text: `@${shownName(s) || s.name}${worktree ? ` · 워크트리 ${worktree}` : ''}`, data: { launcher: seat.launcher, session: seat.session, worktree, ...(seat.effort ? { effort: seat.effort } : {}), ...(seat.model ? { model: seat.model } : {}), ...(seatFrom != null ? { seatFrom } : {}) } });
    b.log(`rig seat ${seatName} spawned ${s.name} for case ${c.id}${worktree ? ` (worktree ${worktree})` : ''}`);
    if (b.broadcastSession) b.broadcastSession(s, { cause: 'rig_seat' });
    return s;
  }

  // P187: 자리 세션을 무엇으로 띄우는가(spawnChild에 넘길 launcher·kind).
  //   종류 이름(claude·codex·opencode·pi)이 먼저다. 새 판은 런처 목록에 id가 claude·codex인 런처를 만들어 두므로,
  //   런처를 먼저 찾으면 종류 이름이 그 런처(모델 없음 = 사용자 기본 모델, manual)로 풀려 건 주인의 것을 물려받지 않았다(P186).
  //   종류 이름이면 atrium child와 같이 건 주인에게서 물려받는다: 주인과 같은 종류면 --kind 없이(Claude Code는 주인의 모델·노력·권한 모드·연결,
  //   Codex 등은 주인의 호출자·모델·추가 인자(승인 인자 포함)), 다른 종류면 --kind(주인의 권한 모드를 그 하네스의 승인 인자로 옮긴다).
  //   런처 이름이면 그 런처의 모델·노력·승인 방식 그대로
  seatRoute(seat, seatName, owner) {
    const want = String(seat.launcher || '');
    if (SEAT_KINDS.includes(want)) return (owner.kind || 'claude') === want ? {} : { kind: want };
    const L = this.branch.findLauncher ? this.branch.findLauncher(want) : null;
    if (!L) throw apiError('rig_launcher', `rig ${seatName} 자리의 launcher "${want}"를 보드의 런처에서 찾지 못했다(런처 이름이나 ${SEAT_KINDS.join(', ')}).`);
    return { launcher: want };
  }

  // ---------- atrium done(자리 세션) ----------
  // 그 done이 흐름으로 넘어가는가 → { ctx, c, lines } | null(자리 세션이 아니거나, 건이 아니거나, 건이 끝났다)
  routeFor(caller, unit, result) {
    const ctx = this.seatCtx(caller);
    if (!ctx || !unit || !unit.caseId) return null;
    const c = this.store().getCase(unit.caseId);
    if (!c || !LIVE_CASE.has(c.state)) return null;
    return { ctx, c, lines: this.loops.linesOf(ctx.def, c, ctx.def.flow.filter((l) => l.from === ctx.name && l.on === result)) }; // P221: 고리가 있으면 그 회의 고리 줄만
  }
  // done이 닫힌 뒤: 맞는 줄마다 넘김(상한), 건 확인, 자리 줄 넣기
  async afterDone(caller, unit, result, doneText, route) {
    const st = this.store();
    const { ctx } = route;
    let c = st.getCase(route.c.id);
    // P221: 회나 그 고리가 멈췄으면 넘김을 회에 붙잡아 둔다(잇기가 넘긴다). 일은 이미 닫혔다
    const paused = this.loops.pauseOf(c);
    if (paused && route.lines.length) {
      st.updateCase(c.id, { held: [...(c.held || []), { unitId: unit.id, session: caller.sessionId, seat: ctx.name, result, text: String(doneText || '') }] });
      rigEvent(this.b, { kind: 'loop_skip', caseId: c.id, unitId: unit.id, seat: ctx.name, session: caller.sessionId, value: 'paused', actor: 'board', text: `${ctx.name} ${result}의 넘김을 붙잡음: ${this.loops.pausedText(c, paused)}`, data: { loop: c.loop, held: 'handoff', by: paused.by } });
      this.b.log(`rig handoff held (${paused.by} paused) ${ctx.name} ${result} case ${c.id}`);
      this.changed(ctx.key);
      return { reports: [], held: true, paused };
    }
    const firstSpec = (st.unitsOfCase(c.id)[0] || {}).spec || '';
    const reports = []; // P194: 건 주인에게 간 보고(일이 아니다)
    for (const line of route.lines) {
      c = st.getCase(c.id);
      let targets = line.to; let escalated = null; let passN = null; // P217: 장부의 n(이 건에서 그 줄을 지난 횟수)
      if (line.max != null) {
        const k = String(line.index); const counts = { ...c.edgeCounts };
        const n = counts[k] || 0;
        if (n >= line.max) {
          let alt = line.else || ctx.def.manager || null;
          // P231(rig2-design 11.13의 2): 올라갈 곳이 상한에 걸린 그 자리 자신(반려당한 일을 한 자리나 반려한 자리)이면 자기 일을 판정하게 된다. 관리자 없음처럼 사람 카드로.
          //   바로가기 keep 정의(manager = 입구 자리 main, main ok → reviewer, reviewer rejected → main). 주인이 일을 다른 자리에 맡겨 둔 흐름(worker의 일이 반려되어 main으로)은 지금처럼 주인 차례다
          const self = alt && (alt === ctx.name || alt === this.judgedSeatOf(unit)) ? alt : null;
          if (self) alt = null;
          counts[`${k}>else`] = (counts[`${k}>else`] || 0) + 1;
          st.updateCase(c.id, { edgeCounts: counts });
          escalated = { line: line.index, max: line.max, to: alt, n: counts[`${k}>else`], ...(self ? { self } : {}) };
          st.addEvent(caller.sessionId, 'rig_escalate', { caseId: c.id, line: line.index, max: line.max, to: alt, ...(self ? { self } : {}) });
          // P230(rig2-design 11.12의 3): else도 관리자 자리도 없으면 사람이 관리자의 일을 받는다(응답 필요 카드: 그대로 받기 · 한 번 더 · 회 멈추기)
          if (!alt) { rigEvent(this.b, { kind: 'escalate', caseId: c.id, unitId: unit.id, seat: ctx.name, session: caller.sessionId, fromSeat: ctx.name, toSeat: null, line: line.index, value: result, n: line.max, max: line.max, actor: 'board', text: self ? `상한 ${line.max}번을 넘었고 올라갈 곳(${self})이 그 자리 자신이라 사람에게 묻는다` : `상한 ${line.max}번을 넘었고 else도 manager도 없어 사람에게 묻는다`, data: { human: true, ...(self ? { self } : {}) } }); this.askHuman(st.getCase(c.id), { ctx, caller, unit, result, doneText, line, self }); continue; }
          targets = [alt];
        } else { counts[k] = n + 1; passN = n + 1; st.updateCase(c.id, { edgeCounts: counts }); }
      }
      for (const to of targets) { const rep = await this.handoff({ ctx, c: st.getCase(c.id), caller, unit, result, doneText, line, to, escalated, firstSpec, passN }); if (rep && rep.report) reports.push(rep); }
    }
    this.caseCheck(c.id);
    this.pumpSoon();
    this.changed(ctx.key); // P197: done마다(건 상태가 그대로여도 일이 닫혔다) 맵이 다시 읽는다
    return { reports };
  }
  async handoff({ ctx, c, caller, unit, result, doneText, line, to, escalated, firstSpec, passN = null, lead = null }) { // P231: lead(주인 보고 머리에 붙일 판 줄)
    const b = this.b; const st = this.store();
    const history = escalated ? this.history(c.id) : [];
    const text = handoffText({ fromSeat: ctx.name, fromName: shownName(caller), result, doneText, firstSpec, escalated, history });
    const tSeat = ctx.def.seats[to];
    const seated = tSeat.session === 'keep' ? this.seatedOf(ctx.key, to)[0] || null : null;
    // P194: 받는 곳이 건 주인 세션 자신이면 일이 아니라 보고다. 주인이 아닌 keep 자리로 가는 줄은 그대로 일이다
    if (seated && seated.sessionId === c.owner) return this.ownerReport({ ctx, c, caller, unit, result, doneText, line, to, escalated, owner: seated, firstSpec, passN, lead });
    const h = await b.rig.deliver({ target: seated || { workspaceKey: ctx.key, name: to, kind: null, model: null, cwd: ctx.r.root }, workspaceKey: ctx.key, from: { kind: 'flow', seat: ctx.name, session: caller }, text, ledger: { caseId: c.id, fromSeat: ctx.name, toSeat: to, line: line.index, seat: ctx.name } });
    const rowIds = (h.runs || []).map((x) => x.rowId).filter((x) => x != null);
    if (h.action === 'reject') return this.block(c, `넘김 글(${ctx.name} ${result} → ${to})을 deliver 훅이 거절했다: ${h.reason}`);
    let a;
    // P217: 넘김(상한을 넘어 올라간 넘김은 escalate 한 줄. else 변을 지난다). 세션을 띄우기 전에 적는다
    const ledger = { kind: escalated ? 'escalate' : 'handoff', seat: ctx.name, session: caller.sessionId, fromSeat: ctx.name, line: line.index, value: result, n: escalated ? escalated.n : passN, max: line.max, actor: 'board', text: firstLine(doneText, 120), data: { prevUnit: unit.id } };
    try { a = await this.assign({ ctx, c, by: caller, seatName: to, spec: h.text, origin: 'flow', via: { result, line: line.index, prevUnit: unit.id, ...(escalated ? { escalated: true } : {}) }, ledger }); }
    catch (e) { return this.block(st.getCase(c.id), `${to} 자리로 넘기지 못했다: ${e.message}`); }
    // P187: 훅은 받을 세션을 띄우기 전에 돌았다. 그 행에 받은 세션(자리 줄에 섰으면 pump가 띄운 뒤)과 이 일을 적는다(세션 맵 미리 보기)
    if (rowIds.length && st.fillHookRuns) st.fillHookRuns(rowIds, { sessionId: a.t ? a.t.sessionId : null, unitId: a.unit ? a.unit.id : null });
    st.addEvent(caller.sessionId, 'rig_handoff', { caseId: c.id, from: ctx.name, result, to, line: line.index, unitId: a.unit.id, target: a.t ? a.t.name : null, seatWait: !!a.seatWait, escalated: !!escalated });
    b.log(`rig handoff ${ctx.name}(${caller.name}) ${result} → ${to}${a.t ? ` @${a.t.name}` : ' (seat wait)'} case ${c.id}`);
    if (a.t) {
      const l = this.branch.verbs.link(caller, a.t);
      b.linkEvent(l, 'prompt', text, { via: 'flow', tag: 'flow', unitId: a.unit.id, caseId: c.id, result, ...(a.made && a.made.d ? { deliveryId: a.made.d.deliveryId } : {}) });
    }
  }

  // ---------- P230(11.12의 3): 관리자 자리가 없는 rig의 상한 → 사람 카드 ----------
  // 회는 waiting_owner(owner_wait human)로 두고 마지막 넘김(반려 글)을 human_ask에 적는다. rig.asks가 카드(kind run_limit)로 보인다
  // P231: self(올라갈 곳이 상한에 걸린 그 자리 자신이라 사람에게 온 것이면 그 자리 이름)
  askHuman(c, { ctx, caller, unit, result, doneText, line, self = null }) {
    const st = this.store();
    const ask = { line: line.index, unitId: unit.id, session: caller.sessionId, seat: ctx.name, result, text: String(doneText || ''), max: line.max, to: line.to.slice(), t: Date.now(), ...(self ? { self } : {}) };
    st.updateCase(c.id, { state: 'waiting_owner', ownerWait: 'human', ownerWaitDelivery: null, humanAsk: ask });
    st.addEvent(c.owner, 'rig_case_waiting_owner', { caseId: c.id, why: 'human', line: line.index, max: line.max, from: ctx.name, result, ...(self ? { self } : {}) });
    rigEvent(this.b, { kind: 'case_waiting_owner', caseId: c.id, session: c.owner, seat: this.seatOfSession(c.owner), line: line.index, value: 'human', max: line.max, actor: 'board', text: `${ctx.name} ${result}: flow[${line.index}] 상한 ${line.max}번, ${self ? `올라갈 곳(${self})이 그 자리 자신이라` : '관리자 자리가 없어'} 사람의 답을 기다린다`, ...(self ? { data: { self } } : {}) });
    this.b.log(`rig case ${c.id} waiting human (limit flow[${line.index}], ${self ? `self ${self}` : 'no manager'})`);
    if (this.b.api && this.b.api.broadcast) try { this.b.api.broadcast('rig.asks', { workspace: c.workspaceKey }); } catch {}
    this.changed(ctx.key);
  }
  // 사람 카드의 단추. action: accept(그대로 받기: 회를 닫는다) | again(한 번 더: 그 줄로 한 번 더 넘긴다) | pause(회 멈추기)
  async answerHuman(caseId, action, { by = 'human' } = {}) {
    const st = this.store(); const b = this.b;
    const c = st.getCase(String(caseId || ''));
    if (!c || c.state !== 'waiting_owner' || c.ownerWait !== 'human' || !c.humanAsk) throw apiError('not_found', `사람의 답을 기다리는 회가 아니다: ${caseId}`);
    const ask = c.humanAsk; const actor = 'human';
    if (action === 'pause') { const x = this.loops.pause(c.workspaceKey, c.id, { by }); this.tellOwnerDecided(c, 'pause'); if (b.api && b.api.broadcast) try { b.api.broadcast('rig.asks', { workspace: c.workspaceKey }); } catch {} return { ...x, action }; } // 멈춘 동안 카드는 숨는다(잇기에 다시 뜬다)
    if (action === 'accept') {
      st.updateCase(c.id, { state: 'open', ownerWait: null, humanAsk: null });
      rigEvent(b, { kind: 'case_resumed', caseId: c.id, value: 'human_accept', actor, text: 'waiting_owner → done(사람이 그대로 받음)', data: { from: 'waiting_owner', ownerWait: 'human', by, line: ask.line } });
      this.closeDone(st.getCase(c.id), '상한에 닿은 회를 사람이 그대로 받음', 'human');
      this.tellOwnerDecided(c, 'accept');
      if (b.api && b.api.broadcast) try { b.api.broadcast('rig.asks', { workspace: c.workspaceKey }); } catch {}
      return { case: c.id, state: 'done', action };
    }
    if (action !== 'again') throw apiError('bad_request', `accept, again, pause 가운데 하나다: ${action}`);
    const r = b.rig ? b.rig.active(c.workspaceKey) : null;
    const def = r ? this.defOfCase(c, r) : null;
    const line = def ? (def.flow || []).find((l) => l.index === ask.line) : null;
    if (!r || !def || !line || !def.seats || !def.seats[ask.seat]) throw apiError('rig_case', `회 ${c.id}의 흐름 줄 flow[${ask.line}]을 지금 정의에서 찾지 못했다`);
    const counts = { ...c.edgeCounts }; counts[`${ask.line}>human`] = (counts[`${ask.line}>human`] || 0) + 1;
    st.updateCase(c.id, { state: 'open', ownerWait: null, humanAsk: null, edgeCounts: counts });
    rigEvent(b, { kind: 'case_resumed', caseId: c.id, value: 'human_again', actor, text: `waiting_owner → open(사람이 한 번 더: flow[${ask.line}])`, data: { from: 'waiting_owner', ownerWait: 'human', by, line: ask.line } });
    const unit = st.getUnit(ask.unitId);
    const caller = b.sessions.get(ask.session) || { sessionId: ask.session, name: this.nameOf(ask.session), rigSeat: ask.seat, workspaceKey: c.workspaceKey };
    const ctx = { key: c.workspaceKey, r, def, seat: def.seats[ask.seat], name: ask.seat };
    const firstSpec = (st.unitsOfCase(c.id)[0] || {}).spec || '';
    // P231(11.13의 3): 넘김이 주인 보고면(주인 keep 자리로 가는 줄) 알림 줄을 그 보고 머리에 붙이고 따로 보내지 않는다(한 번)
    const lead = humanDecidedText({ caseId: c.id, name: c.name, action: 'again', line: ask.line, to: line.to });
    let told = false;
    for (const to of line.to) { const rep = await this.handoff({ ctx, c: st.getCase(c.id), caller, unit: unit || { id: ask.unitId, from: null, to: ask.session }, result: ask.result, doneText: ask.text, line, to, escalated: null, firstSpec, passN: null, lead: told ? null : lead }); if (rep && rep.report) told = true; }
    if (!told) this.tellOwnerDecided(c, 'again', { line: ask.line, to: line.to });
    this.caseCheck(c.id);
    this.pumpSoon();
    this.changed(c.workspaceKey);
    if (b.api && b.api.broadcast) try { b.api.broadcast('rig.asks', { workspace: c.workspaceKey }); } catch {}
    return { case: c.id, state: st.getCase(c.id).state, action };
  }

  // P231(11.13의 2): 이 일이 판정한 일을 한 자리(흐름이 넘긴 일이면 앞 일의 자리, 아니면 맡긴 세션의 자리)
  judgedSeatOf(unit) {
    const v = (unit && unit.via) || {};
    const prev = v.prevUnit ? this.store().getUnit(v.prevUnit) : null;
    if (prev) return prev.seat || null;
    return unit && unit.from ? this.seatOfSession(unit.from) : null;
  }
  // P231(11.13의 3): 사람이 상한 카드에 답한 결과를 주인 세션에 한 번 알린다(받음 · 한 번 더 · 멈춤). 주인 세션이 닫혔으면 넣지 않는다
  //   P232(11.14의 11): 받음·멈춤은 주인에게 지금 할 일이 없다. 주인 자리의 다음 회 머리에 붙인다(따로 보내지 않는다). 한 번 더(again)만 바로 보낸다
  tellOwnerDecided(c, action, o = {}) {
    const b = this.b;
    if (!c || !c.owner || !b.sessions.has(c.owner)) return null;
    const ow = b.sessions.get(c.owner);
    if (action !== 'again' && ow.rigSeat && this.noteForSeat(c.workspaceKey, ow.rigSeat, humanDecidedText({ caseId: c.id, name: c.name, action, ...o }), `decided_${action}`)) {
      try { this.store().addEvent(c.owner, 'rig_human_decided', { caseId: c.id, action, note: true }); } catch {}
      return { note: true };
    }
    const d = b.queue.enqueue(c.owner, humanDecidedText({ caseId: c.id, name: c.name, action, ...o }));
    try { this.store().addEvent(c.owner, 'rig_human_decided', { caseId: c.id, action, deliveryId: d.deliveryId }); } catch {}
    return d;
  }
  // P232(rig2-design 11.14의 11): 지금 할 일이 없는 판 알림은 그 자리의 다음 회 머리 글에 붙인다(쉬는 keep 세션의 턴을 쓰지 않는다) → 적었으면 true
  noteForSeat(key, seat, text, kind = null) {
    const st = this.store();
    if (!key || !seat || !st.addSeatNote) return false;
    const id = st.addSeatNote(key, seat, text, kind);
    try { st.addEvent(null, 'rig_seat_note', { workspace: key, seat, id, kind }); } catch {}
    this.b.log && this.b.log(`rig seat note ${key} ${seat} #${id} ${kind || ''}`);
    return true;
  }
  // 일 머리에 붙일 쌓인 알림(그 자리의 다음 일). 꺼낸 것은 다시 붙지 않는다 → 줄 배열
  takeSeatNotes(unit) {
    const st = this.store();
    if (!unit || !unit.caseId || !st.seatNotes) return [];
    const c = st.getCase(unit.caseId);
    const seat = unit.seat || null;
    if (!c || !seat) return [];
    const notes = st.seatNotes(c.workspaceKey, seat);
    if (!notes.length) return [];
    st.useSeatNotes(notes.map((n) => n.id), unit.id);
    try { st.addEvent(unit.to, 'rig_seat_note_used', { unitId: unit.id, seat, ids: notes.map((n) => n.id) }); } catch {}
    return notes.map((n) => n.text);
  }
  // P194: 주인에게 보고(일을 만들지 않는다). 상한을 넘어 올라온 것이면 건을 waiting_owner로 둔다(주인의 다음 맡기기가 잇는다)
  ownerReport({ ctx, c, caller, unit, result, doneText, line, to, escalated, owner, firstSpec, passN = null, lead = null }) {
    const b = this.b; const st = this.store();
    if (escalated) {
      st.updateCase(c.id, { state: 'waiting_owner', ownerWait: 'escalated', ownerWaitDelivery: null });
      st.addEvent(c.owner, 'rig_case_waiting_owner', { caseId: c.id, line: line.index, max: escalated.max, from: ctx.name, result });
      rigEvent(b, { kind: 'case_waiting_owner', caseId: c.id, session: c.owner, seat: owner.rigSeat || null, line: line.index, value: 'escalated', max: escalated.max, actor: 'board', text: `${ctx.name} ${result}: flow[${line.index}] 상한 ${escalated.max}번` });
    }
    const body = ownerReportText({ caseId: c.id, fromSeat: ctx.name, fromName: shownName(caller), unitId: unit.id, firstSpec, result, doneText, escalated, history: escalated ? this.history(c.id) : [] });
    const text = lead ? `${lead}\n${body}` : body;
    const d = b.queue.enqueue(owner.sessionId, text);
    // P209: 상한 아래의 주인 보고. 건은 열린 일이 없어지면 done 대신 waiting_owner(caseCheck), 이 보고를 받은 주인의 턴이 끝나면 done(onSessionTurn)
    if (!escalated) st.updateCase(c.id, { ownerWait: 'report', ownerWaitDelivery: d.deliveryId });
    const tr = st.lastTryOfUnit(unit.id);
    if (tr) st.updateTry(tr.id, { noticeDeliveryId: d.deliveryId });
    // 연결 기록: 위(주인) → 하위 선에 보고(답)로(0단계 done과 같다). 선이 없으면 보낸 쪽 → 주인 선
    const l0 = st.linkByPair(unit.from, unit.to);
    if (l0 && !l0.removedAt) b.linkEvent(l0, 'reply', doneText, { via: 'flow', verb: 'done', tag: 'report', result, unitId: unit.id, caseId: c.id, deliveryId: d.deliveryId });
    else { const l = this.branch.verbs.link(caller, owner); b.linkEvent(l, 'prompt', text, { via: 'flow', tag: 'report', unitId: unit.id, caseId: c.id, result, deliveryId: d.deliveryId }); }
    st.addEvent(caller.sessionId, 'rig_handoff', { caseId: c.id, from: ctx.name, result, to, line: line.index, unitId: null, report: true, target: owner.name, deliveryId: d.deliveryId, escalated: !!escalated });
    rigEvent(b, { kind: escalated ? 'escalate' : 'report', caseId: c.id, unitId: unit.id, seat: ctx.name, session: caller.sessionId, fromSeat: ctx.name, toSeat: OWNER, line: line.index, value: result, n: escalated ? escalated.n : passN, max: line.max, actor: 'board', ref: d.deliveryId, text: firstLine(doneText, 120), data: { ownerSeat: to, owner: owner.sessionId, report: true } });
    if (st.insertCaseReport) st.insertCaseReport({ caseId: c.id, seat: ctx.name, sessionId: caller.sessionId, unitId: unit.id, result, line: line.index, escalated: !!escalated, deliveryId: d.deliveryId }); // P197: 보낼 때 적는다(17절)
    b.log(`rig report ${ctx.name}(${caller.name}) ${result} → owner @${owner.name} case ${c.id}${escalated ? ' (waiting_owner)' : ''}`);
    this.changed(ctx.key);
    return { report: true, seat: to, to: shownName(owner), deliveryId: d.deliveryId, escalated: !!escalated };
  }

  // P197: 맞는 흐름 줄 없이 done 값이 건 주인에게 간 보고(0단계 done 알림 길, work-units doneVerb). 주인 자신의 일은 보고가 아니다
  doneToOwner(caller, unit, result) {
    const st = this.store();
    const c = unit && unit.caseId ? st.getCase(unit.caseId) : null;
    if (!c) return;
    if (unit.from === c.owner && caller.sessionId !== c.owner && st.insertCaseReport) {
      const tr = st.lastTryOfUnit(unit.id);
      st.insertCaseReport({ caseId: c.id, seat: caller.rigSeat || null, sessionId: caller.sessionId, unitId: unit.id, result, line: null, escalated: false, deliveryId: tr ? tr.noticeDeliveryId : null });
      rigEvent(this.b, { kind: 'report', caseId: c.id, unitId: unit.id, seat: caller.rigSeat || null, session: caller.sessionId, fromSeat: caller.rigSeat || null, toSeat: OWNER, value: result, actor: 'board', ref: tr ? tr.noticeDeliveryId : null, text: tr && tr.doneText ? firstLine(tr.doneText, 120) : null, data: { owner: c.owner, ownerSeat: this.seatOfSession(c.owner) } });
    }
    this.changed(c.workspaceKey);
  }

  // ---------- 자리 줄(max_live) ----------
  pumpSoon() { if (this.pumpTimer) return; this.pumpTimer = setImmediate(() => { this.pumpTimer = null; this.pump().catch((e) => this.b.log('rig pump error', e.stack)); }); }
  async pump() {
    if (this.pumping) { this.again = true; return; }
    this.pumping = true;
    try {
      do {
        this.again = false;
        const st = this.store(); const b = this.b;
        for (const u of st.seatWaitingAll()) {
          const c = st.getCase(u.caseId);
          const owner = c ? b.sessions.get(c.owner) : null;
          const r = b.rig ? b.rig.active(u.workspaceKey) : null;
          const cdef = r ? this.defOfCase(c, r) : null; // P188: 건의 버전
          const seat = cdef && cdef.seats ? cdef.seats[u.seat] : null;
          if (c && LIVE_CASE.has(c.state) && this.loops.pauseOf(c)) continue; // P221: 멈춘 회·고리는 자리 줄을 띄우지 않는다
          if (!c || !owner || !seat || !LIVE_CASE.has(c.state)) { st.updateUnit(u.id, { status: 'cancelled', closedAt: Date.now() }); st.addEvent(c ? c.owner : null, 'unit_cancelled', { unitId: u.id, why: !seat ? 'seat gone' : 'case closed' }); if (c) this.caseCheck(c.id); this.changed(u.workspaceKey); continue; }
          if (this.liveCount(u.workspaceKey, u.seat) >= seat.maxLive) continue;
          const ctx = { key: u.workspaceKey, r, def: cdef, seat, name: u.seat };
          let s;
          try { s = await this.spawnSeat(ctx, u.seat, owner, c, u.id); }
          catch (e) { st.updateUnit(u.id, { status: 'cancelled', closedAt: Date.now() }); this.block(st.getCase(c.id), `${u.seat} 자리 세션을 띄우지 못했다: ${e.message}`); continue; }
          st.setUnitTarget(u.id, s.sessionId);
          if (st.fillHookRunsOfUnit) st.fillHookRunsOfUnit(u.id, s.sessionId); // P187: 줄에 설 때 돈 훅 행에 세션
          const unit = st.getUnit(u.id);
          if (st.openTryOf(s.sessionId)) { this.units().queued.add(s.sessionId); continue; }
          this.units().dispatch(unit, { later: true });
          st.addEvent(s.sessionId, 'rig_seat_dequeue', { unitId: u.id, seat: u.seat, caseId: c.id });
          this.changed(u.workspaceKey); // P197: 줄 선 일이 세션을 얻었다
        }
      } while (this.again);
    } finally { this.pumping = false; }
  }

  // 세션이 닫혔다: 주인인 건은 cancelled(자리 줄에 선 일도 취소), 그 세션의 건은 확인, 자리 줄
  onClosed(s) {
    const st = this.store(); const now = Date.now();
    for (const c of st.liveCasesOfOwner(s.sessionId)) {
      for (const u of st.unitsOfCase(c.id)) if (u.status === 'open' && !u.to) st.updateUnit(u.id, { status: 'cancelled', closedAt: now });
      st.updateCase(c.id, { state: 'cancelled', closedAt: now });
      st.addEvent(s.sessionId, 'rig_case_cancelled', { caseId: c.id, why: 'owner closed' });
      rigEvent(this.b, { kind: 'case_cancelled', caseId: c.id, session: s.sessionId, seat: s.rigSeat || null, actor: 'board', value: 'owner closed', text: '주인 세션이 닫혔다' });
      this.changed(c.workspaceKey);
    }
    // 닫힌 세션의 일이 취소되었다(WorkUnits.onClosed가 먼저 돈다) → 그 건 확인
    for (const c of st.casesOf(s.workspaceKey || '', 200)) if (c.state === 'open') this.caseCheck(c.id);
    if (s.rigSeat && s.workspaceKey) this.changed(s.workspaceKey); // P197: 자리 세션의 일이 취소되었다
    this.pumpSoon();
  }

  // ---------- P216: 종료된 자리 세션(exited)과 다시 맡기기 ----------
  // 자리 세션의 에이전트가 끝나 셸만 남았다(work-units onExited가 시도를 stop_reason exited로 닫은 뒤). 일은 열린 채 남고,
  //   그 시도는 자리 한도(liveCount: 열린 시도를 쥔 앉은 세션)에서 빠진다. 건은 blocked("<세션> 종료"), 자리 줄에 선 일이 있으면 띄운다.
  //   주인에게는 막힘 알림 대신 멈춤 알림 한 줄(unit-stops exited)이 간다. → 그 줄에 붙일 다시 맡기는 길
  onTryExited(s, unit, tr) {
    const st = this.store();
    const c = st.getCase(unit.caseId);
    const name = shownName(s) || s.name;
    st.addEvent(s.sessionId, 'rig_try_stopped', { caseId: unit.caseId, unitId: unit.id, tryId: tr.id, seat: unit.seat, session: name, why: 'exited' });
    rigEvent(this.b, { kind: 'try_stopped', caseId: unit.caseId, unitId: unit.id, tryId: tr.id, seat: unit.seat, session: s.sessionId, value: 'exited', actor: 'board', text: `${name} 종료${s.rt && s.rt.launchSuspect ? '(띄우기 인자가 잘못됐을 수 있다)' : ''}`, data: s.rt && s.rt.exit ? { exit: s.rt.exit.kind, code: s.rt.exit.code ?? null, ...(s.rt.launchSuspect ? { badArgs: true, ms: s.rt.launchSuspect.ms, command: s.rt.launchSuspect.line } : {}) } : null }); // P217: 장부. P238: 띄우기 인자 의심
    this.b.log(`rig try ${tr.id} stopped (exited): ${unit.seat}(${name}) case ${unit.caseId}`);
    if (c && LIVE_CASE.has(c.state) && unit.status === 'open') this.block(c, `${name} 종료(일 ${unit.id})`, { notify: false, why: 'exited' });
    this.pumpSoon();
    if (c) this.changed(c.workspaceKey);
    return c ? `다시 맡기기: atrium rig retry ${c.id} ${unit.id}` : null;
  }
  // 다시 맡길 수 있는 일인가 → 그 일의 마지막 시도 | null. 열린 일이고, 마지막 시도가 exited로 닫혔거나,
  //   그 시도를 쥔 세션의 에이전트가 끝나 있다(사람이 /exit로 끝낸 것처럼 exited로 닫히지 않은 시도도 사람·관리자가 다시 맡길 수 있다)
  retryable(u) {
    if (!u || u.status !== 'open' || !u.to) return null;
    const tr = this.store().lastTryOfUnit(u.id);
    if (!tr || tr.result != null) return null;
    if (tr.endedAt) return tr.stopReason === 'exited' ? tr : null;
    const s = this.b.sessions.get(tr.sessionId);
    const exit = s && s.rt ? s.rt.exit : null;
    return exit && !s.rt.sleep && !s.rt.move && exit.kind !== 'terminal_stopped' ? tr : null;
  }
  // atrium rig retry <건> [<일>](관리자 자리·사람): 같은 일을 같은 자리의 새 세션으로. 일을 주지 않으면 그 건의 다시 맡길 수 있는 일 모두.
  //   fresh 자리가 한도에 차 있으면 자리 줄에 세운다(차례가 오면 판이 띄운다). keep 자리면 끝난 세션을 자리에서 떼고 새 세션을 띄운다.
  //   다시 맡길 일이 남지 않으면 건을 다시 open으로
  async retry(key, caseId, unitId = null, { by = 'human', who = null } = {}) {
    const b = this.b; const st = this.store();
    const id = String(caseId || '').trim();
    if (!id) throw apiError('bad_request', '건 ID를 준다: atrium rig retry <건> [<일>]');
    const c = st.getCase(id);
    if (!c || c.workspaceKey !== key) throw apiError('not_found', `이 워크스페이스의 건이 아니다: ${id}`);
    if (!LIVE_CASE.has(c.state)) throw apiError('case_closed', `건 ${id}은 이미 ${c.state}다. 끝나지 않은 건의 일만 다시 맡긴다.`);
    const owner = b.sessions.get(c.owner);
    if (!owner) throw apiError('closed', `건 ${id}의 주인 세션이 닫혀 다시 맡기지 않는다.`);
    const r = b.rig ? b.rig.active(key) : null;
    if (!r) throw apiError('rig_off', '이 워크스페이스에는 켜진 rig가 없다.');
    const open = st.unitsOfCase(id).filter((u) => u.status === 'open');
    const pick = open.map((u) => ({ u, tr: this.retryable(u) })).filter((x) => x.tr);
    let list = pick;
    if (unitId) {
      const want = String(unitId).trim();
      const x = pick.find((p) => p.u.id === want);
      if (!x) {
        const u = open.find((q) => q.id === want) || st.unitsOfCase(id).find((q) => q.id === want);
        const why = !u ? '이 건의 일이 아니다' : u.status !== 'open' ? `이미 ${u.status}다` : !u.to ? '자리 줄에서 차례를 기다린다' : '그 일을 쥔 세션이 아직 돈다(종료된 세션의 일만 다시 맡긴다)';
        throw apiError('not_retryable', `일 ${want}은 다시 맡길 수 없다: ${why}.`);
      }
      list = [x];
    } else if (!list.length) throw apiError('not_retryable', `건 ${id}에 다시 맡길 일이 없다(종료된 자리 세션이 쥔 열린 일이 없다).`);
    const out = [];
    for (const { u, tr } of list) out.push(await this.retryUnit(c, u, tr, r, { by, who }));
    const left = st.unitsOfCase(id).filter((u) => this.retryable(u));
    const c2 = st.getCase(id);
    if (!left.length && c2.state === 'blocked') {
      st.updateCase(id, { state: 'open', blockedReason: null });
      st.addEvent(who ? who.sessionId : c.owner, 'rig_case_resume', { caseId: id, from: 'blocked', why: 'retry', by });
      rigEvent(b, { kind: 'case_resumed', caseId: id, seat: who ? who.rigSeat || null : null, session: who ? who.sessionId : null, value: 'retry', actor: by === 'manager' ? 'agent' : 'human', text: 'blocked → open', data: { from: 'blocked', by } }); // P217
    }
    this.pumpSoon();
    this.changed(key);
    const c3 = st.getCase(id);
    return { workspace: key, caseId: id, case: { id, state: c3.state, blockedReason: c3.blockedReason }, retried: out };
  }
  // P217: 다시 맡기기의 장부 줄(retried, 18.1: data.from_try, to_session). 자리 줄에 서면 data.queued
  retriedEvent(c, u, tr, { by, who, oldName, to = null, queued = false }) {
    rigEvent(this.b, { kind: 'retried', caseId: c.id, unitId: u.id, tryId: tr.id, seat: u.seat, session: who ? who.sessionId : null, fromSeat: u.seat, toSeat: u.seat, actor: by === 'manager' ? 'agent' : 'human', text: to ? `@${oldName} → @${shownName(to) || to.name}` : `@${oldName} → ${u.seat} 자리 줄`, data: { from_try: tr.id, from_session: u.to, to_session: to ? to.sessionId : null, by, ...(queued ? { queued: true } : {}) } });
  }
  async retryUnit(c, u, tr, r, { by, who }) {
    const b = this.b; const st = this.store(); const now = Date.now();
    const key = c.workspaceKey;
    const old = b.sessions.get(u.to) || null;
    const oldName = old ? shownName(old) || old.name : this.nameOf(u.to);
    if (!tr.endedAt) {
      st.updateTry(tr.id, { endedAt: now, stopReason: 'exited' });
      st.addEvent(tr.sessionId, 'rig_try_stopped', { caseId: c.id, unitId: u.id, tryId: tr.id, seat: u.seat, session: oldName, why: 'exited', by: 'retry' });
      rigEvent(b, { kind: 'try_stopped', caseId: c.id, unitId: u.id, tryId: tr.id, seat: u.seat, session: tr.sessionId, value: 'exited', actor: by === 'manager' ? 'agent' : 'human', text: `${oldName} 종료(다시 맡기며 닫음)`, data: { by: 'retry' } }); // P217
    }
    const pinned = this.defOfCase(c, r);
    // P239(rig2-design 11.18): 지금 정의에 그 자리가 있으면 자리 칸(SEAT_FROM_NOW)만 지금 정의의 것으로 띄운다. 흐름 줄과 상한은 건이 쥔 버전 그대로.
    //   다시 맡기기는 대개 자리가 뜨지 못하거나 꺼졌을 때 하고, 그때 고친 자리로 띄우는 것이 목적이다. 지금 정의에 없으면 건의 버전 그대로
    const cur = r && r.def && r.def.seats ? r.def.seats[u.seat] : null;
    const old0 = pinned && pinned.seats ? pinned.seats[u.seat] : null;
    const seat = old0 && cur ? { ...old0, ...Object.fromEntries(SEAT_FROM_NOW.map((k) => [k, cur[k]])) } : old0;
    const cdef = seat && cur ? { ...pinned, seats: { ...pinned.seats, [u.seat]: seat } } : pinned;
    const seatFrom = seat && cur ? (r.n ?? (b.rig && b.rig.cachedN ? b.rig.cachedN(key) : null)) : null;
    if (!seat) throw apiError('rig_seat', `건 ${c.id}의 정의(버전 ${c.versionN ?? '-'})에 ${u.seat} 자리가 없다.`);
    // keep 자리: 끝난 세션을 자리에서 뗀다(keep 자리에는 세션 하나만 앉는다)
    if (seat.session === 'keep' && old && old.rigSeat === u.seat) {
      st.setSessionSeat(old.sessionId, null); old.rigSeat = null;
      st.addEvent(old.sessionId, 'rig_seat', { workspace: key, seat: null, before: u.seat, by: 'retry' });
      rigEvent(b, { kind: 'seat_set', ws: key, seat: null, session: old.sessionId, value: null, actor: 'board', text: `@${oldName}: ${u.seat} → -(다시 맡기기)`, data: { before: u.seat, by: 'retry' } }); // P217
      if (b.broadcastSession) b.broadcastSession(old, { cause: 'rig_seat' });
    }
    const base = { caseId: c.id, unitId: u.id, seat: u.seat, fromTry: tr.id, fromSession: u.to, by };
    if (seat.session !== 'keep' && this.liveCount(key, u.seat) >= seat.maxLive) {
      st.setUnitTarget(u.id, '');
      st.addEvent(who ? who.sessionId : c.owner, 'rig_unit_retried', { ...base, toSession: null, seatWait: true });
      this.retriedEvent(c, u, tr, { by, who, oldName, queued: true });
      b.log(`rig retry ${u.id} (${u.seat}) by ${by}: seat full, waits`);
      return { unit: u.id, seat: u.seat, from: oldName, to: null, seatWait: true };
    }
    const owner = b.sessions.get(c.owner);
    const s = await this.spawnSeat({ key, r, def: cdef, seat, name: u.seat }, u.seat, owner, c, u.id, { seatFrom });
    st.setUnitTarget(u.id, s.sessionId);
    this.retriedEvent(c, u, tr, { by, who, oldName, to: s }); // P217: 장부(새 시도의 try_start보다 먼저)
    this.units().dispatch(st.getUnit(u.id), { later: true });
    st.addEvent(s.sessionId, 'rig_unit_retried', { ...base, toSession: s.sessionId, to: shownName(s) || s.name });
    b.log(`rig retry ${u.id} (${u.seat}) by ${by}: ${oldName} → ${s.name}`);
    return { unit: u.id, seat: u.seat, from: oldName, to: shownName(s) || s.name, toSessionId: s.sessionId, seatWait: false };
  }

  // ---------- P188: 느린 고리(cycles, 15절) ----------
  // 정의의 cycles 줄마다: 다음 시각이 지났으면 그 자리(보통 관리자)에 일을 하나 만든다. 글은 판의 장부 요약 + run 출력.
  //   줄이 새로 생기거나 모양(every·to·run)이 바뀌면 지금부터 한 주기 뒤가 다음 시각이다. 돈 뒤에는 지금 + 주기(놓친 회는 한 번)
  stopCycles() { if (this.cycleTimer) clearInterval(this.cycleTimer); this.cycleTimer = null; }
  async cycleTick(now = Date.now()) {
    const b = this.b; const st = this.store();
    if (!b.rig || !st.workspaces || !st.getCycle) return [];
    const fired = [];
    for (const w of st.workspaces()) {
      const r = b.rig.active(w.key);
      if (!r) continue;
      const cycles = r.def.cycles || [];
      st.dropCyclesFrom(w.key, cycles.length);
      for (const cy of cycles) {
        const sig = JSON.stringify([cy.everyMs, cy.to, cy.run]);
        const row = st.getCycle(w.key, cy.index);
        if (!row || row.sig !== sig) { st.setCycle(w.key, cy.index, { nextAt: now + cy.everyMs, lastAt: row ? row.lastAt : null, sig }); continue; }
        if (now < row.nextAt) continue;
        const k = `${w.key}|${cy.index}`;
        // P221: cycles의 개선 고리(improve)가 멈췄으면 열지 않는다(다음 시각 그대로라 잇기 뒤 한 번 돈다)
        const ln = implicitCycleLoop(cy.index);
        if (this.loops.isPaused(w.key, ln)) { if (!this.cycleSkipNoted.has(`${k}|paused|${row.nextAt}`)) { this.cycleSkipNoted.add(`${k}|paused|${row.nextAt}`); rigEvent(b, { kind: 'loop_skip', ws: w.key, seat: cy.to, value: 'paused', actor: 'board', text: `${ln}: 고리가 멈춰 있어 이번 회를 열지 않는다(잇기 뒤 한 번 돈다)`, data: { loop: ln, trigger: 'every', cycle: cy.index } }); } continue; }
        if (this.cycleBusy.has(k)) continue;
        this.cycleBusy.add(k);
        try {
          const x = await this.fireCycle(w.key, r, cy, { since: row.lastAt || row.nextAt - cy.everyMs, now }); // 첫 회는 줄을 처음 본 때부터
          if (x) { st.setCycle(w.key, cy.index, { nextAt: now + cy.everyMs, lastAt: now, sig }); fired.push(x); this.cycleSkipNoted.delete(k); }
        } finally { this.cycleBusy.delete(k); }
      }
    }
    fired.push(...(await this.loops.tick(now))); // P221: loops의 every 고리
    return fired;
  }
  // 한 회: 받는 자리 세션에 새 건의 일. 앉은 세션이 없으면 돌지 않고(다음 시각은 그대로라 앉으면 돈다) 한 번 기록한다
  async fireCycle(key, r, cy, { since, now }) {
    const b = this.b; const st = this.store();
    const seat = r.def.seats[cy.to];
    const t = this.seatedOf(key, cy.to).sort((a, c) => (a.createdAt || 0) - (c.createdAt || 0))[0] || null;
    const k = `${key}|${cy.index}`;
    if (!t) {
      if (!this.cycleSkipNoted.has(k)) { this.cycleSkipNoted.add(k); st.addEvent(null, 'rig_cycle_skip', { workspace: key, line: cy.index, seat: cy.to, why: 'no seated session' }); b.log(`rig cycle ${key}[${cy.index}] skipped: no session at seat ${cy.to}`); }
      return null;
    }
    let text = this.cycleSummary(key, r, cy, { since, now });
    if (cy.run) {
      const out = await runCapture(cy.run, { root: r.root, env: cleanEnv(process.env), input: { v: 1, at: 'cycle', workspace: { key, root: r.root }, line: cy.index, since, until: now, rigHash: r.hash }, timeoutMs: cy.timeoutMs });
      text += `\n\n## run 출력(${cy.run.join(' ')})\n${out.ok ? out.text || '(출력 없음)' : `돌지 못했다: ${out.error}${out.text ? `\n${out.text}` : ''}`}`;
    }
    const ln = implicitCycleLoop(cy.index); // P221: cycles[i] = 개선 고리 improve(-n)
    const d0 = new Date(now); const p2 = (n) => String(n).padStart(2, '0');
    const c = this.newCase(key, t, 'cycle', { loop: ln, name: `${ln} ${d0.getFullYear()}-${p2(d0.getMonth() + 1)}-${p2(d0.getDate())} ${p2(d0.getHours())}:${p2(d0.getMinutes())}`, trigger: 'every' });
    const ctx = { key, r, def: this.defOfCase(c, r), seat, name: cy.to };
    const made = this.units().create(t, t, text, 'cycle', { caseId: c.id, seat: cy.to, via: { by: t.sessionId, cycle: cy.index } });
    st.addEvent(t.sessionId, 'rig_cycle', { workspace: key, line: cy.index, caseId: c.id, unitId: made.unit.id, since, until: now, chars: text.length });
    rigEvent(b, { kind: 'cycle', ws: key, caseId: c.id, unitId: made.unit.id, seat: cy.to, session: t.sessionId, toSeat: cy.to, value: cy.every, actor: 'cycle', ref: cy.index, text: `cycles[${cy.index}] ${cy.every} → ${cy.to}`, data: { cycle: cy.index, since, until: now } });
    b.log(`rig cycle ${key}[${cy.index}] → ${t.name} case ${c.id} unit ${made.unit.id}`);
    this.changed(key);
    return { line: cy.index, caseId: c.id, unitId: made.unit.id, to: t.name, seat: ctx.name };
  }
  // 판의 장부 요약(그 기간): 건 결과, 상한 초과, 훅 판정 수와 거절 까닭 상위, 도구 실패, 사람이 rig 자리에 보낸 글, 오래 열린 건
  cycleSummary(key, r, cy, { since, now }) {
    const st = this.store();
    const P = st.rigPeriod(key, since, now);
    const when = (t) => new Date(t).toISOString().replace('T', ' ').slice(0, 16);
    const ago = (ms) => (ms >= 86400000 ? `${Math.floor(ms / 86400000)}일` : ms >= 3600000 ? `${Math.floor(ms / 3600000)}시간` : `${Math.max(1, Math.floor(ms / 60000))}분`);
    const L = [`보드의 느린 고리(cycles[${cy.index}], ${cy.every}마다)가 만든 일이다. ${when(since)}부터 ${when(now)}까지(UTC)의 rig 장부 요약을 읽고, 정의(.atrium/rig.json)·안내·정본에 고칠 것이 있으면 고친다(고친 정의는 버전으로 남는다: atrium rig log, atrium rig check). 오래 열린 건은 닫거나 사람에게 묻는다. 끝나면 done으로 한 일을 보고한다.`];
    // 건 결과
    const byState = {}; for (const c of P.casesClosed) byState[c.state] = (byState[c.state] || 0) + 1;
    L.push('', '## 건 결과', `새 건 ${P.casesOpened.length}, 닫힌 건 ${P.casesClosed.length}${Object.keys(byState).length ? `(${Object.entries(byState).map(([k, v]) => `${k} ${v}`).join(', ')})` : ''}`);
    for (const c of P.casesClosed.slice(-10)) { const h = this.history(c.id); L.push(`- ${c.id} ${c.state}: 일 ${h.length}, 넘김 ${h.filter((u) => u.via && u.via.result).length}${c.blockedReason ? `, ${c.blockedReason}` : ''}`); }
    // 상한 초과
    const esc = [...new Map([...P.casesOpened, ...P.casesClosed, ...st.liveCasesWithLast(key)].map((c) => [c.id, c])).values()].map((c) => ({ c, n: Object.entries(c.edgeCounts || {}).filter(([kk]) => kk.endsWith('>else')).reduce((a, [, v]) => a + (Number(v) || 0), 0) })).filter((x) => x.n || x.c.state === 'blocked');
    L.push('', '## 상한 초과', esc.length ? esc.map((x) => `- ${x.c.id}: 올림 ${x.n}${x.c.state === 'blocked' ? `, blocked(${x.c.blockedReason || '?'})` : ''}`).join('\n') : '없음');
    // 훅 판정
    L.push('', '## 훅 판정', P.hooks.length ? P.hooks.map((h) => `${h.decision} ${h.n}`).join(', ') : '없음');
    if (P.rejectReasons.length) L.push('거절·실패 까닭 상위:', ...P.rejectReasons.map((x) => `- ${x.n}회: ${clip(x.reason.replace(/\s+/g, ' '), 160) || '(까닭 없음)'}`));
    // 도구
    L.push('', '## 도구 실패', `실행 ${P.toolRuns}, 실패 ${P.toolFails.length}`);
    for (const f of P.toolFails.slice(0, 10)) L.push(`- ${f.tool} ${f.status}${f.exitCode != null ? ` 종료 코드 ${f.exitCode}` : ''}${f.error ? `: ${clip(String(f.error).replace(/\s+/g, ' '), 120)}` : ''}`);
    // 사람이 rig 자리에 보낸 글
    // P232(11.14의 6): 글마다 그 글이 연 회와, 이어진 회면 앞 회와 그 결과("c… done 뒤 4분"). 판 알림 줄(일 머리)은 떼고 보인다
    L.push('', '## 사람이 rig 자리에 보낸 글', P.human.length ? P.human.slice(-20).map((x) => `- @${x.name}(${x.seat} 자리): ${clip(bodyOf(x.text).replace(/\s+/g, ' '), 200)}${this.followNote(x.caseId)}`).join('\n') : '없음');
    // 오래 열린 건
    const stale = st.liveCasesWithLast(key).filter((c) => now - (c.lastAt || c.createdAt) >= cy.staleMs);
    L.push('', `## 오래 열린 건(마지막 넘김 뒤 ${ago(cy.staleMs)} 넘음)`, stale.length ? stale.map((c) => { const open = this.history(c.id).filter((u) => u.status === 'open'); return `- ${c.id} ${c.state}: 주인 @${this.nameOf(c.owner)}, 마지막 넘김 ${ago(now - (c.lastAt || c.createdAt))} 전${open.length ? `, 열린 일 ${open.map((u) => `${u.seat || '-'}(@${u.name})`).join(', ')}` : ''}${c.blockedReason ? `, ${c.blockedReason}` : ''}`; }).join('\n') : '없음');
    return L.join('\n');
  }

  // P232(11.14의 6): 사람 글이 연 회의 이어짐 → " (회 c2, 이어진 회: 앞 회 c1 done 뒤 4분)" | " (회 c2)" | ''
  followNote(caseId) {
    if (!caseId) return '';
    const st = this.store();
    const c = st.getCase(caseId);
    if (!c) return '';
    const prev = c.follows ? st.getCase(c.follows) : null;
    if (!prev) return ` (회 ${c.id})`;
    const gap = prev.closedAt != null ? Math.max(0, c.createdAt - prev.closedAt) : null;
    const span = gap == null ? '' : gap >= 3600000 ? ` 뒤 ${Math.floor(gap / 3600000)}시간` : ` 뒤 ${Math.max(0, Math.round(gap / 60000))}분`;
    return ` (회 ${c.id}, 이어진 회: 앞 회 ${prev.id}${prev.name ? ` "${clip(prev.name, 40)}"` : ''} ${prev.state}${span})`;
  }

  // ---------- 보이기 ----------
  // 판 API rig.cases: 워크스페이스의 건(최근 것부터). 건마다 일(자리·세션·상태·값), 줄마다 지난 횟수, 띄운 세션·워크트리
  cases(key, { limit = 50 } = {}) {
    const st = this.store();
    const r = this.b.rig ? this.b.rig.read(key) : null;
    const def = r && r.def ? r.def : null;
    return st.casesOf(key, limit).map((c) => this.caseView(c, def));
  }
  caseView(c, def0 = null) {
    const st = this.store();
    const def = (c.versionN != null ? this.defOfCase(c) : null) || def0; // P188: 건의 버전
    const units = this.history(c.id);
    const open = units.filter((u) => u.status === 'open');
    return {
      id: c.id, name: c.name || null, nameBy: c.nameBy || null, loop: c.loop || null, paused: c.pausedAt ? { at: c.pausedAt, by: c.pausedBy } : null, held: (c.held || []).length, // P221
      version: c.versionN ?? null, workspace: c.workspaceKey, owner: this.nameOf(c.owner), ownerSessionId: c.owner, ownerOpen: this.b.sessions.has(c.owner), state: c.state, createdAt: c.createdAt, closedAt: c.closedAt, blockedReason: c.blockedReason,
      handoffs: units.filter((u) => u.via && u.via.result).length, edgeCounts: c.edgeCounts,
      lines: def ? def.flow.filter((l) => l.max != null).map((l) => ({ index: l.index, from: l.from, on: l.on, to: l.to, max: l.max, passed: c.edgeCounts[String(l.index)] || 0, escalated: c.edgeCounts[`${l.index}>else`] || 0 })) : [],
      activeSeats: [...new Set(open.map((u) => u.seat).filter(Boolean))],
      units, items: st.caseItems(c.id).map((x) => ({ ...x, name: this.nameOf(x.sessionId), open: this.b.sessions.has(x.sessionId) })),
    };
  }
  // 세션 맵 그래프의 rig 칸(P197, harness-arch 17절 "자료"): 켜진 rig마다
  //   { version, manager, results, seats(열 순서, 정의에서 빠진 자리는 old), flow(맵 전체 passed 없음), cases(정렬), openCount(끝나지 않은 건 전체), openMore(담지 못한 수), doneCount(끝난·취소된 건 전체, 담긴 것 포함) }
  //   cases: 끝나지 않은 건(최근 GRAPH_LIVE개) + 나이와 상관없이 최근 끝난·취소된 건 GRAPH_CLOSED개. 일과 마지막 시도, 보고는 건 묶음마다 한 질의
  //   (P197 전에는 일마다 lastTryOfUnit 한 번). 모양 견본: backend/test/fixtures/rig-band/graph-rig.json(p197.test.mjs가 실제 출력과 맞춰 본다)
  graph() {
    const out = {};
    const b = this.b; const st = this.store();
    if (!b.rig || !st.workspaces) return out;
    for (const w of st.workspaces()) {
      const r = b.rig.active(w.key);
      if (!r || !r.def.seats) continue;
      out[w.key] = this.graphOf(w.key, r);
    }
    return out;
  }
  graphOf(key, r) {
    const b = this.b; const st = this.store(); const def = r.def;
    const live = st.liveCasesOf(key, GRAPH_LIVE); const closed = st.closedCasesOf(key, GRAPH_CLOSED);
    const all = [...live.rows, ...closed.rows];
    const ids = all.map((c) => c.id);
    const unitsBy = st.unitsOfCasesWithTry(ids); const reportsBy = st.reportsOfCases(ids);
    const name = (sid) => (sid ? this.nameOf(sid) : null);
    const cases = all.map((c) => {
      const cdef = (c.versionN != null ? this.defOfCase(c, r) : null) || def; // 건의 버전(줄의 상한)
      const us = unitsBy[c.id] || [];
      const reports = (reportsBy[c.id] || []).map((x) => ({ seat: x.seat, sessionId: x.sessionId, name: name(x.sessionId), unit: x.unit, result: x.result, line: x.line, escalated: x.escalated, at: x.at }));
      // P216: stop = 마지막 시도의 멈춤 까닭(exited 등), retry = 다시 맡길 수 있다(종료된 자리 세션이 쥔 열린 일)
      const units = us.map((u) => ({ unit: u.id, seat: u.seat, sessionId: u.to || null, name: u.to ? name(u.to) : '(줄)', status: u.status, result: u.tryResult, queued: !u.to, createdAt: u.createdAt, closedAt: u.closedAt,
        stop: u.tryStop ?? null, retry: u.status === 'open' && !!u.to && !!u.tryId && u.tryResult == null && ((u.tryEnded != null && u.tryStop === 'exited') || (u.tryEnded == null && this.exitedSession(u.to))),
        badArgs: this.badArgsOf(u.to), // P238: 그 세션이 띄운 지 곧바로 종료 코드 2로 끝났으면 { line, ms, code }
        via: u.via && u.via.prevUnit ? { prevUnit: u.via.prevUnit, line: u.via.line ?? null, escalated: !!u.via.escalated, fromSeat: u.via.fromSeat ?? null, result: u.via.result ?? null } : null }));
      const first = us[0] || null;
      const lastHandoffAt = Math.max(c.createdAt, ...us.map((u) => u.createdAt || 0), ...reports.map((x) => x.at || 0));
      const ec = c.edgeCounts || {};
      return {
        id: c.id, state: c.state, owner: this.nameOf(c.owner), ownerSessionId: c.owner, ownerOpen: b.sessions.has(c.owner),        cycle: first && first.via && first.via.cycle != null ? first.via.cycle : null, version: c.versionN ?? null,
        firstTask: first ? firstLine(first.spec, 80) : '', createdAt: c.createdAt, closedAt: c.closedAt, lastHandoffAt,
        handoffs: us.filter((u) => u.via && u.via.result).length, blockedReason: c.blockedReason,
        // 줄별 지금 셈(주인이 이어 맡기면 0부터)과 올라간 횟수. 상한 있는 줄만
        lines: (cdef && cdef.flow ? cdef.flow : []).filter((l) => l.max != null).map((l) => ({ index: l.index, from: l.from, on: l.on, to: l.to, max: l.max, passed: ec[String(l.index)] || 0, escalated: ec[`${l.index}>else`] || 0 })),
        activeSeats: [...new Set(us.filter((u) => u.status === 'open').map((u) => u.seat).filter(Boolean))],
        units, reports,
      };
    });
    // 정렬: 주인 대기·막힘 → 열림(마지막 넘김이 최근인 것부터) → 끝난·취소된 건(최근에 닫힌 것부터)
    const rank = (c) => (c.state === 'waiting_owner' || c.state === 'blocked' ? 0 : c.state === 'open' ? 1 : 2);
    cases.sort((x, y) => rank(x) - rank(y) || (rank(x) < 2 ? y.lastHandoffAt - x.lastHandoffAt : (y.closedAt || y.createdAt) - (x.closedAt || x.createdAt)));
    // 열: 지금 정의의 자리(seatColumns) 뒤에 옛 자리(보이는 건의 일이 부르거나 세션이 아직 앉은, 지금 정의에 없는 자리)
    const seatSessions = (n) => this.seatedOf(key, n).map((s) => ({ sessionId: s.sessionId, name: shownName(s), open: true, busy: !!st.openTryOf(s.sessionId), exited: this.exitedSession(s.sessionId) })); // P216: exited = 에이전트가 끝나 셸만 남음(한도에 들지 않는다)
    const old = [];
    const addOld = (n) => { if (n && !Object.prototype.hasOwnProperty.call(def.seats, n) && !old.includes(n)) old.push(n); };
    for (const c of cases) for (const u of c.units) addOld(u.seat);
    for (const s of b.sessions.values()) if (s.workspaceKey === key && s.rigSeat) addOld(s.rigSeat);
    const seats = [
      ...seatColumns(def).map((n) => { const x = def.seats[n]; return { name: x.name || n, launcher: x.launcher ?? null, session: x.session ?? null, worktree: !!x.worktree, maxLive: x.maxLive ?? null, may: x.may || [], old: false, sessions: seatSessions(n), waiting: st.seatWaitingUnits(key, n).length }; }),
      ...old.map((n) => ({ name: n, launcher: null, session: null, worktree: false, maxLive: null, may: [], old: true, sessions: seatSessions(n), waiting: st.seatWaitingUnits(key, n).length })),
    ];
    return {
      version: r.n ?? null, manager: def.manager ?? null, results: def.results || [],
      seats,
      flow: def.flow.map((l) => ({ index: l.index, from: l.from, on: l.on, to: l.to, max: l.max ?? null, else: l.else ?? null })),
      cases, openCount: live.total, openMore: Math.max(0, live.total - live.rows.length), doneCount: closed.total, // P198과 정함: 끝난·취소된 건 전체 수(cases에 담긴 최근 것 포함). 접힌 줄 수 = doneCount - 담긴 끝난 건
    };
  }
  // P238: 그 세션의 에이전트가 띄운 지 곧바로 종료 코드 2로 끝났는가(띄우기 인자 의심) → { line, ms, code } | null
  badArgsOf(sid) { const s = sid ? this.b.sessions.get(sid) : null; const x = s && s.rt && s.rt.exit ? s.rt.launchSuspect : null; return x ? { line: x.line || null, ms: x.ms, code: x.code } : null; }
  // P216: 그 세션의 에이전트가 끝나 있는가(잠듦·옮김·터미널 서버 꺼짐은 아니다)
  exitedSession(sid) { const s = this.b.sessions.get(sid); return !!(s && s.rt && s.rt.exit && !s.rt.sleep && !s.rt.move && s.rt.exit.kind !== 'terminal_stopped'); }
  // atrium me의 rig 칸
  meOf(s) {
    const ctx = this.seatCtx(s);
    if (!ctx) return s.rigSeat ? { seat: s.rigSeat, active: false } : null;
    const st = this.store();
    const tr = st.openTryOf(s.sessionId); const u = tr ? st.getUnit(tr.unitId) : null;
    const c = u && u.caseId ? st.getCase(u.caseId) : null;
    return { seat: ctx.name, active: true, version: ctx.versionN ?? null, manager: !!(ctx.def.manager && ctx.def.manager === ctx.name), session: ctx.seat.session, worktree: ctx.seat.worktree, results: ctx.def.results, assign: this.assignTargets(ctx), may: ctx.seat.may, tools: ctx.seat.tools,
      case: c ? { id: c.id, state: c.state, owner: this.nameOf(c.owner), name: c.name || null, loop: c.loop || null, paused: !!this.loops.pauseOf(c) } : null, // P221
      owner: !!(c && c.owner === s.sessionId), // P221: 이 회의 주인(atrium rig name을 쓴다)
      owned: st.casesOf(ctx.key, 50).filter((x) => x.owner === s.sessionId && LIVE_CASE.has(x.state)).map((x) => ({ id: x.id, state: x.state })), // P194: 내가 주인인 끝나지 않은 건(--case로 고른다)
      next: ctx.def.flow.filter((l) => l.from === ctx.name && l.on !== 'assign').map((l) => ({ on: l.on, to: l.to, max: l.max, else: l.else })),
      docs: seatDocsOf(ctx.def, ctx.name), writesDocs: ((ctx.def.seatDocs || {})[ctx.name] || {}).writes || [] }; // P219
  }
  // atrium guide: 자리 안내 파일
  seatGuide(s) {
    const ctx = this.seatCtx(s);
    if (!ctx || !ctx.seat.guide) return ctx ? { seat: ctx.name, text: null } : null;
    try {
      const text = fs.readFileSync(path.resolve(ctx.r.root, ctx.seat.guide), 'utf8').replace(/^﻿/, '');
      return { seat: ctx.name, path: ctx.seat.guide, text: text.length > 20000 ? text.slice(0, 20000) : text, clipped: text.length > 20000 };
    } catch (e) { return { seat: ctx.name, path: ctx.seat.guide, text: null, error: e.message }; }
  }
}

// 판 API 처리기(backend.mjs handlers에 펼친다). rig.seat은 판 API 토큰으로 붙은 연결(이 PC의 창·사람의 atrium 명령)만. rig.cases는 보기
export function rigFlowHandlers(b) {
  const local = (c) => { if (!c || !c.auth || c.auth.kind !== 'local') throw apiError('forbidden', '자리 정하기는 이 PC의 보드 창에서만 한다(판 API 토큰).'); };
  return {
    'rig.seat': (p, c) => {
      local(c);
      if (!p || !p.session) throw apiError('bad_request', 'session이 필요하다');
      const s = b.resolve(p.session);
      return b.branch.flow.setSeat(s, p.seat ?? null, { by: 'human', notify: true }); // P193: 자리를 얻으면 판 알림
    },
    // P186: 세션 맵 미리 보기의 최근 훅 판정과 도구 실행(보기만). rig 밖 세션은 둘 다 빈 목록
    'rig.recent': (p) => {
      if (!p || !p.session) throw apiError('bad_request', 'session이 필요하다');
      const s = b.resolve(p.session);
      return recentOf(b.store, s.sessionId, Math.min(Math.max(Number(p.limit) || 5, 1), 20));
    },
    'rig.cases': async (p) => {
      const key = (await b.resolveWorkspace(p && p.workspace)).key;
      return { workspace: key, cases: b.branch.flow.cases(key, { limit: Math.min(Math.max(Number(p && p.limit) || 50, 1), 200) }) };
    },
  };
}

// P186: 세션의 최근 훅 판정(rig_hook_runs)과 도구 실행(tool_runs), 최근 것부터
export function recentOf(store, sessionId, limit = 5) {
  const hooks = (store.hookRunsOfSession ? store.hookRunsOfSession(sessionId, limit) : []).map((h) => ({ t: h.t, at: h.at, hookIndex: h.hookIndex, run: (h.argv || []).slice(0, 3).join(' '), decision: h.decision, reason: h.reason, note: h.note, error: h.error, ms: h.ms, unitId: h.unitId }));
  const tools = (store.toolRunsOf ? store.toolRunsOf(sessionId, limit) : []).map((x) => ({ id: x.id, tool: x.tool, args: x.args, status: x.status, exitCode: x.exitCode, startedAt: x.startedAt, endedAt: x.endedAt, error: x.error, unitId: x.unitId }));
  return { session: sessionId, hooks, tools };
}

// P188: 느린 고리의 run. 셸 없이 띄우고(hook-runner와 같은 길) stdin에 JSON 하나, stdout(2만 자까지)을 글로 돌려준다 → { ok, text, error }
export function runCapture(run, { root, env, input, timeoutMs = 60000, max = 20000 }) {
  return new Promise((resolve) => {
    let plan; let child; let out = ''; let done = false; let timer = null;
    const end = (x) => { if (done) return; done = true; clearTimeout(timer); resolve({ ...x, text: out.length > max ? out.slice(0, max) + '\n…(잘림)' : out.replace(/\s+$/, '') }); };
    try { plan = spawnPlan(rootedRun(run, root), { cwd: root, env }); child = spawn(plan.file, plan.args, { cwd: root, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], windowsVerbatimArguments: plan.verbatim }); }
    catch (e) { return end({ ok: false, error: `띄우지 못했다: ${e.message}` }); }
    timer = setTimeout(() => { killTree(child); end({ ok: false, error: `시간 제한(${timeoutMs}ms)을 넘었다` }); }, timeoutMs);
    child.stdout.setEncoding('utf8'); child.stdout.on('data', (d) => { if (out.length <= max) out += d; });
    child.stderr.on('data', () => {});
    child.on('error', (e) => end({ ok: false, error: `띄우지 못했다: ${e.message}` }));
    child.on('close', (code) => end(code === 0 ? { ok: true } : { ok: false, error: `종료 코드 ${code}` }));
    try { child.stdin.on('error', () => {}); child.stdin.end(JSON.stringify(input)); } catch {}
  });
}
