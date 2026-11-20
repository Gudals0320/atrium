// 가지 펼치기(ARCH 4절 K, P8): 판이 띄운 세션이 부르는 하위 세션 명령(atrium child, atrium children, atrium child-kill. 옛 이름 mtask도 같다).
// backend.mjs에는 이 파일을 부르는 몇 줄만 둔다(attachBranch, onHttp, spawn의 설정 파일·자리·부모, summary).
//
// - 판을 찾아가기(K1): 판은 세션 설정 파일의 env로 판의 값(프로필, 터미널 세션, 포트, 데이터 폴더)과 그 세션의 ID, 그 세션만의 토큰을 넘긴다.
//   명령은 판 플러그인의 bin/atrium과 별칭 bin/mtask(Bash 도구 PATH에 오른다)이고, node로 backend/bin/atrium-child.mjs를 부른다. 사용자의 PATH와 설정 파일은 고치지 않는다.
// - 할 수 있는 일(보안): 명령은 판의 API 토큰(backend.json)을 쓰지 않는다. 세션 토큰(판 API 토큰과 세션 ID의 HMAC)으로 POST /branch/*만 부르고,
//   백엔드는 부르는 세션을 부모로 정해 그 세션의 하위 세션 만들기·목록·끄기만 한다. 다른 판 API는 지금처럼 승인 카드로 묻는 atrium CLI(판 API 토큰)로만 된다.
// - 하위 세션(K1): Backend.spawn으로 띄우는 정식 판 세션(hook, 스킬 플러그인, 짧은 안내, 권한 모드, 에이전트 이름). 부모의 폴더·모델·노력 수준·권한 모드·그룹을 물려받는다.
// - 상한(K3): P36에서 하위 세션 수, 깊이, 판 전체 상한을 없앴다(사용자 요청: 한 작업에 워커 30개 넘게). 자기 자손이 아니면 끄기를 not_parent로 거부한다. 고리는 depthOf가 끊는다.
// - 신뢰 관문(P36): 신뢰를 받지 않은 저장소의 --worktree는 claude -w가 신뢰 대화상자 없이 바로 끝난다. 그래서 먼저 그 저장소에서 claude를 띄워 신뢰 질문을 노드에 보이고,
//   사람이 답해 ready가 되면 같은 패널·같은 세션 ID로 claude -w를 다시 띄운다. 그동안 판의 전달(--prompt)은 멈춰 둔다(passGate).
// - 나무 자리(K4): 새 하위 세션은 부모 오른쪽 한 열의 끝에 띄운 순서대로 선다(새 노드를 놓을 때만, P75 tree-line.mjs). 다른 워크스페이스면 그 영역의 빈자리.
// - 연결 읽기·떼기(P81): atrium me는 부르는 세션의 지금 연결(부모, 하위 세션, 역할 연결, 마지막 지시)을 판에서 읽어 준다. detach는 부모 관계를 지운다
//   (부모 기록, 하위 세션 기록, 부모 → 하위 역할 선. 오간 기록은 남는다). --head는 띄운 뒤 첫 요청이 들어가면(못 들어갔다고 판정되면) 판이 저절로 뗀다.
//   연결이 바뀌면 받는 쪽에 짧게 알린다(link-notice.mjs: 사람이 뗌, 부모의 child-kill이 아닌 하위 세션 닫힘. 10초 안은 묶는다, 잠든 세션은 깨우지 않는다).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { workspaceOf, gitProbe } from './git.mjs';
import { uploadsReadRule } from './uploads.mjs'; // P162
import { ROLE_RE } from './links.mjs';
import { SIZE_STEPS } from './canvas.mjs';
import { canvasItems, areaOfNode, lineTree, dockOf, dockOuter } from './canvas-ops.mjs';
import { parseArea, isBoxKey } from './worktree-areas.mjs'; // P27
import { lineSlot, peerSlot, bandOf, boxFrame, frameInner, LINE_GAP_Y } from './tree-line.mjs'; // P75: 하위 세션 줄
import { deriveState, isModelError } from './state.mjs';
import { EFFORTS } from './settings.mjs';
import { clip, promptTask } from './text.mjs';
import { BACKEND_ROOT, terminalSessionEnv } from './config.mjs';
import { predictTrust, repoHasCommit, buildStartArgs, fillBoardHooks } from './launch.mjs';
import { harnessOf, splitArgs, joinArgs, startOpt, effortArgsOf, effortIgnoredLine } from './launchers.mjs'; // P41. P96: splitArgs. P97: 실행 명령
import { isModelName } from './model-name.mjs'; // P96
import { AGY_APPROVAL, AGY_APPROVAL_FLAGS } from './harness.mjs'; // P192
import { buildCatalog, resolveModel, candidateLines, describeEntry, launcherRef } from './models.mjs'; // P41
import { takenNames, shownName } from './session-label.mjs'; // P66
import { workspaceNames } from './workspaces.mjs';
import { NoticeBatcher, NOTICE_BATCH_MS, closeWhy, detachedParentLine, detachedChildLine, childClosedLine } from './link-notice.mjs'; // P81
import { AgentVerbs, verbLines } from './agent-verbs.mjs'; // P116: atrium prompt | wait | read
import { installRelations, relationHeader, RELATION_WORD } from './branch-relations.mjs'; // P156: 일 관계
import { WorkUnits, checkAgentText } from './work-units.mjs'; // P180: 일 단위와 시도
import { Merger, readMergerGuide } from './merger.mjs'; // P267: 합치기 merger
import { PEER_ROLE, workDescendantsOf, lineageKept } from './relations.mjs';
import { PEER_RULE } from './cli-contract.mjs'; // P204: 동료에게 보낼 때와 동료 소식
import { DocWatch } from './doc-watch.mjs'; // P257: 문서 점검(지휘 세션 턴 끝·done 알림)
import { PeerNews } from './peer-news.mjs'; // P204: 동료 소식(atrium log | news, 턴 끝·done 자동 기록)


export const DEFAULT_ROLE = '워커';
export const CHILD_NAME_RE = /^[a-z][a-z0-9_-]{0,31}$/; // 에이전트 이름 규칙(P8 때 터미널의 에이전트 이름 규칙과 같게 정했다)
export const WORKTREE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
export { isModelName } from './model-name.mjs'; // P96: 슬래시 든 이름(zai/glm-flash)도 받는다. 검사는 model-name.mjs 한 곳
export const CHILD_SIZE = 'wide-normal'; // P73: 새로 띄운 하위 세션도 16:9 가로 보통(1440×810. 전에는 정리처럼 작게 480×300). 사람이 크기를 바꾸면 그대로 둔다
const READY_WAIT_MS = 75000; // atrium child가 하위 세션이 준비되기를 기다리는 시간. Claude Code Bash 도구의 기본 시간 제한(2분) 안쪽
const SUBMIT_WAIT_MS = 20000; // --prompt를 준 경우 첫 지시가 들어가 일을 시작하기까지 더 기다리는 시간
const CHILD_WAIT_MS = 100000; // P36: atrium child-wait 한 번의 최대(Bash 도구 2분 안쪽). 더 기다리려면 다시 부른다
const GATE_TRUST_WAIT_MS = 5000; // P36: 신뢰를 받은 뒤 ~/.claude.json에 쓰이기까지 기다리는 시간
const BODY_MAX = 256 * 1024;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FINAL = new Set(['confirmed', 'unconfirmed', 'failed', 'cancelled']); // P81: 전달이 끝난 상태
export const HEAD_ROLE = '헤드'; // P81: --head로 띄운 세션의 역할(첫 요청 뒤 판이 떼기 전까지)
function apiError(code, message, extra = {}) { return Object.assign(new Error(message), { code }, extra); }

// ---------- 승인 규칙(K2) ----------
// 판이 띄운 세션의 설정 파일에 넣어 묻지 않고 돌게 하는 것: 하위 세션 명령, 일 시키기(atrium prompt), 끝나기 기다리기(atrium wait), 화면 읽기(atrium read). 다른 atrium 명령은 넣지 않는다.
// P18: 새 이름 atrium과 옛 이름 mtask(P18 전에 띄운 세션의 스킬 글이 말한다)를 함께 넣는다
// Claude Code는 $변수, $(…) 같은 셸 확장이 든 명령은 규칙과 상관없이 묻는다(P4). 스킬은 그런 모양을 쓰지 말라고 한다
// 범위는 같은 판의 모든 세션이다(atrium prompt는 판의 어느 에이전트에게나 간다. 같은 사용자 계정이라 격리는 아니다)
export const ATRIUM_ALLOW = [
  ...['atrium', 'mtask'].flatMap((c) => [`Bash(${c} child:*)`, `Bash(${c} child *)`, `Bash(${c} children:*)`, `Bash(${c} children)`, `Bash(${c} child-kill:*)`, `Bash(${c} child-kill *)`, `Bash(${c} wake:*)`, `Bash(${c} wake *)`, `Bash(${c} child-wait:*)`, `Bash(${c} child-wait *)`, `Bash(${c} models)`, `Bash(${c} models:*)`, `Bash(${c} models *)`, `Bash(${c} me)`, `Bash(${c} me:*)`, `Bash(${c} me *)`, `Bash(${c} help)`, `Bash(${c} help:*)`, `Bash(${c} help *)`, // P21: wake, P36: child-wait, P41: models, P81: me, P115: help
    `Bash(${c} prompt:*)`, `Bash(${c} prompt *)`, `Bash(${c} wait:*)`, `Bash(${c} wait *)`, `Bash(${c} read:*)`, `Bash(${c} read *)`, `Bash(${c} relate:*)`, `Bash(${c} relate *)`, `Bash(${c} done:*)`, `Bash(${c} done *)`, `Bash(${c} item)`, `Bash(${c} item:*)`, `Bash(${c} item *)`, `Bash(${c} items)`, `Bash(${c} items:*)`, `Bash(${c} items *)`, `Bash(${c} guide)`, `Bash(${c} guide:*)`, `Bash(${c} guide *)`, `Bash(${c} log:*)`, `Bash(${c} log *)`, `Bash(${c} news)`, `Bash(${c} news:*)`, `Bash(${c} news *)`, `Bash(${c} docs)`, `Bash(${c} docs:*)`, `Bash(${c} docs *)`]), // P257: docs. P116. P156: relate. P180: done·item·items. P182: guide. P183: tool. P204: log·news. P269: rig 걷음
  ...['atrium', 'mtask'].flatMap((c) => [`PowerShell(${c} child *)`, `PowerShell(${c} children)`, `PowerShell(${c} children *)`, `PowerShell(${c} child-kill *)`, `PowerShell(${c} wake *)`, `PowerShell(${c} child-wait *)`, `PowerShell(${c} models)`, `PowerShell(${c} models *)`, `PowerShell(${c} me)`, `PowerShell(${c} me *)`, `PowerShell(${c} help)`, `PowerShell(${c} help *)`,
    `PowerShell(${c} prompt *)`, `PowerShell(${c} wait *)`, `PowerShell(${c} read *)`, `PowerShell(${c} relate *)`, `PowerShell(${c} done *)`, `PowerShell(${c} item)`, `PowerShell(${c} item *)`, `PowerShell(${c} items)`, `PowerShell(${c} items *)`, `PowerShell(${c} guide)`, `PowerShell(${c} guide *)`, `PowerShell(${c} log *)`, `PowerShell(${c} news)`, `PowerShell(${c} news *)`, `PowerShell(${c} docs)`, `PowerShell(${c} docs *)`]), // P257: docs. P116. P156: relate. P180: done·item·items. P182: guide. P183: tool. P204: log·news. P269: rig 걷음
];
// P129: 옛 터미널 명령 규칙(P4~P115의 일 시키기·답 읽기, P4의 자동 승인). 도는 세션의 설정 파일에서 뺀다(refreshSettings)
const OLD_TERMINAL_RULE = /^(Bash|PowerShell)\(herdr[ :]/;
export const branchAllow = () => ATRIUM_ALLOW;

// ---------- P96: 다른 종류 하위 세션(Claude → Codex 등) ----------
// 무엇으로 띄우는가: --launcher면 그 호출자, 아니면(--kind만, --model이 그 하네스 모델로 풀림) 판 레일의 그 종류 기본 호출자를 바탕으로 띄운다
// (추가 인자·모델. --model을 주면 모델만 덮는다). 그 종류의 호출자가 없으면 맨 명령. 그래서 사람이 레일 단추로 띄운 것과 같은 설정이 된다.
// 권한: 부모(Claude Code)의 권한 모드를 그 하네스의 승인 인자로 옮긴다. 호출자의 추가 인자에 승인·샌드박스 인자가 있으면 호출자 것이 이긴다.
// Codex(0.167 --help): manual·plan은 덧붙이지 않는다(Codex 사용자 설정의 approval_policy). acceptEdits·auto는 작업 폴더 쓰기 샌드박스 + 필요할 때 묻기
// (옛 --full-auto와 같은 뜻), dontAsk·bypassPermissions는 묻지 않고 샌드박스 없이. 표에 없는 종류(pi 등)는 옮기지 않는다
export const APPROVAL_ARGS = {
  codex: {
    manual: [], plan: [],
    acceptEdits: ['--sandbox', 'workspace-write', '--ask-for-approval', 'on-request'],
    auto: ['--sandbox', 'workspace-write', '--ask-for-approval', 'on-request'],
    dontAsk: ['--dangerously-bypass-approvals-and-sandbox'],
    bypassPermissions: ['--dangerously-bypass-approvals-and-sandbox'],
  },
  agy: AGY_APPROVAL, // P192: AGY(manual은 덧붙이지 않음, plan·acceptEdits·auto는 --mode, dontAsk·bypassPermissions는 --dangerously-skip-permissions)
};
const CODEX_APPROVAL_FLAGS = new Set(['-a', '--ask-for-approval', '-s', '--sandbox', '--approve-for-me', '--dangerously-bypass-approvals-and-sandbox', '--full-auto', '--yolo']);
const CODEX_APPROVAL_KEY = /^(approval_policy|sandbox_mode)\s*=/;
// 호출자의 추가 인자에 승인·샌드박스 인자가 있는가(-c approval_policy=…, -c sandbox_mode=…도 센다)
export function hasApprovalArgs(kind, args = []) {
  if (kind === 'agy') return args.some((a) => AGY_APPROVAL_FLAGS.has(String(a).split('=')[0])); // P192
  if (kind !== 'codex') return false;
  return args.some((a, i) => CODEX_APPROVAL_FLAGS.has(a.split('=')[0])
    || ((a === '-c' || a === '--config') && CODEX_APPROVAL_KEY.test(args[i + 1] || ''))
    || (a.startsWith('--config=') && CODEX_APPROVAL_KEY.test(a.slice(9))) || (a.startsWith('-c') && a.length > 2 && CODEX_APPROVAL_KEY.test(a.slice(2))));
}
// → { args, from: parent(옮김) | launcher(호출자 것이 이김) | harness(덧붙이지 않음, 그 하네스의 사용자 설정) | null(옮기지 않는 종류) }
export function approvalArgsOf(kind, mode, launcherArgs = []) {
  const table = APPROVAL_ARGS[kind];
  if (!table) return { args: [], from: null };
  if (hasApprovalArgs(kind, launcherArgs)) return { args: [], from: 'launcher' };
  const args = table[mode] || [];
  return { args: [...args], from: args.length ? 'parent' : 'harness' };
}
// 그 종류의 기본 호출자: 레일(즐겨찾기) 순서의 첫 것, 없으면 호출자 목록의 첫 것, 없으면 null
export function defaultLauncherOf(kind, { items = [], favorites = [] } = {}) {
  const ofKind = (l) => { const h = l && harnessOf(l.harness); return !!h && h.kind === kind && !['claude', 'shell', 'command'].includes(h.id); };
  for (const id of favorites) { const l = items.find((x) => x.id === id); if (ofKind(l)) return l; }
  return items.find(ofKind) || null;
}
// 모델을 덮을 때 호출자 인자의 -m·--model을 뺀다(Codex는 -m을 두 번 받지 않는다)
export function withoutModelArgs(args = []) {
  const out = [];
  for (let i = 0; i < args.length; i++) {
    const [k] = args[i].split('=');
    if (k === '-m' || k === '--model') { if (!args[i].includes('=')) i++; continue; }
    out.push(args[i]);
  }
  return out;
}
// 다른 종류 하위 세션의 띄울 값. route: routeOf의 값, lists: 호출자 목록 { items, favorites }
// P115: route.type 'inherit-harness'(다른 종류 부모가 종류를 주지 않고 부름)는 부모의 하네스 값(호출자, 모델, 추가 인자)을 그대로 물려받는다. 승인 인자는 옮기지 않는다(이미 그 인자에 있다)
export function otherKindPlan({ route, permissionMode = 'manual', lists = {} }) {
  const kind = route.kind;
  const inherit = route.type === 'inherit-harness';
  // P115: 연결 모델(route.type gateway)은 그 연결을 쓰는 런처를 바탕으로 모델만 덮는다
  const l = route.type === 'launcher' ? route.launcher : inherit || route.type === 'gateway' ? route.launcherDef : defaultLauncherOf(kind, lists);
  const h = l ? harnessOf(l.harness) : harnessOf(kind);
  const takesModel = !!h && h.fields.includes('model');
  const override = (route.type === 'model' || route.type === 'gateway') && route.model ? route.model : null;
  const model = override || (l && takesModel ? l.model || null : null);
  const largs = override ? withoutModelArgs(splitArgs(l ? l.args : '')) : splitArgs(l ? l.args : '');
  // P205: AGY 하위는 부모 권한 모드와 상관없이 권한 생략으로 띄운다(AGY 샌드박스가 판 명령 atrium을 막아 하위가 atrium done을 못 한다).
  // 호출자 추가 인자에 AGY 승인 인자가 있으면(approvalArgsOf의 launcher) 그것을 따른다
  const agyBypass = kind === 'agy' && !inherit;
  const approval0 = inherit ? { args: [], from: 'parent-harness' } : approvalArgsOf(kind, agyBypass ? 'bypassPermissions' : permissionMode, largs);
  const approval = agyBypass && approval0.from === 'parent' ? { ...approval0, from: 'agy-bypass' } : approval0;
  const args = [...largs, ...approval.args];
  return {
    launcher: l, model, args, argv: [...(model ? ['-m', model] : []), ...args],
    record: { base: route.type === 'launcher' ? 'launcher' : inherit ? 'parent' : l ? 'rail' : 'bare', launcher: l ? l.name : null, model, modelFrom: override ? 'model' : model ? 'launcher' : null, approvalArgs: approval.args, approvalFrom: approval.from, parentPermissionMode: permissionMode },
  };
}

// ---------- 나무 계산(순수 함수) ----------
// rowOf(id) → { parentSessionId } | null. 사람이 띄운 세션(부모 없음)이 1단계. 닫힌 중간 세션도 따라간다. 고리는 끊는다
export function depthOf(id, rowOf, max = 64) {
  let d = 1; const seen = new Set([id]);
  let cur = rowOf(id);
  while (cur && cur.parentSessionId && !seen.has(cur.parentSessionId) && d < max) { seen.add(cur.parentSessionId); d++; cur = rowOf(cur.parentSessionId); }
  return d;
}
// id가 ancestorId의 자손인가(자기 자신은 아니다)
export function isDescendant(id, ancestorId, rowOf) {
  if (!id || !ancestorId || id === ancestorId) return false;
  const seen = new Set([id]);
  let cur = rowOf(id);
  while (cur && cur.parentSessionId && !seen.has(cur.parentSessionId)) {
    if (cur.parentSessionId === ancestorId) return true;
    seen.add(cur.parentSessionId); cur = rowOf(cur.parentSessionId);
  }
  return false;
}
// rootId 아래의 자손(rows: [{ sessionId, parentSessionId }]). 깊은 것부터(끄는 순서). rel은 rootId에서 몇 단계 아래인지
export function descendantsOf(rootId, rows) {
  const kids = new Map();
  for (const r of rows) { if (!r.parentSessionId) continue; if (!kids.has(r.parentSessionId)) kids.set(r.parentSessionId, []); kids.get(r.parentSessionId).push(r); }
  const out = []; const seen = new Set([rootId]);
  const walk = (id, rel) => { for (const k of kids.get(id) || []) { if (seen.has(k.sessionId)) continue; seen.add(k.sessionId); out.push({ ...k, rel }); walk(k.sessionId, rel + 1); } };
  walk(rootId, 1);
  return out.sort((a, b) => b.rel - a.rel);
}
// 하위 세션 이름. want가 있으면 그대로(이름 규칙), 없으면 <부모>-w<n>(부모 이름이 규칙에 안 맞으면 w<n>)
export function childName({ want, parentName, taken }) {
  if (want) {
    if (!CHILD_NAME_RE.test(want) || want === 'all') throw apiError('bad_request', `하위 세션 이름은 영문 소문자로 시작해야 하며 소문자, 숫자, -, _를 사용해 32자까지 입력할 수 있습니다: ${want}`);
    if (taken.has(want)) throw apiError('name_taken', `보드에서 이미 사용 중인 이름입니다: ${want}. 다른 이름을 지정하세요.`);
    return want;
  }
  const p = String(parentName || '').toLowerCase();
  const base = CHILD_NAME_RE.test(`${p}-w`) ? `${p.slice(0, 26)}-w` : 'w';
  for (let i = 1; i < 1000; i++) if (!taken.has(`${base}${i}`)) return `${base}${i}`;
  throw apiError('name_taken', "이름을 지정하지 못했습니다.");
}
// K4 자리 계산은 P75부터 tree-line.mjs(lineSlot: 부모 오른쪽 열, 띄운 순서, P200: 상한을 넘으면 오른쪽 새 열). 옛 childSlot(열을 부모 높이 두 배에서 접어 격자로 쌓았다)은 뺐다
// P36: 하위 세션이 신뢰 질문에서 멈췄을 때 부모가 사람에게 할 한 문장
// P41: Claude Code의 StopFailure(model_not_found)는 글 없이 온다. 판이 부모에게 보일 까닭
export const modelErrorText = (model) => `사용할 수 없는 모델입니다: ${model || '(기본)'}. 모델이 없거나 현재 실행 설정으로 접근할 수 없습니다 (게이트웨이 환경 변수 누락 등).`;
export const trustSentence = (name) => `보드에서 @${name} 카드의 신뢰 질문에 답해 주세요.`;
// 부모가 받는 알림 글(명령의 응답에 넣는다. F2 연결 알림과 같은 내용)
// P116: 일 시키기·기다리기·읽기는 판의 atrium 명령(터미널 백엔드와 상관없다). 이름은 판의 세션 이름(주소)이다. paneId는 옛 호출 모양 때문에 받고 쓰지 않는다
export function childNotice({ role, agentName, name = agentName, kind = 'claude', depth }) {
  const v = verbLines(name);
  return [
    `[Atrium 보드] 하위 세션: \`@${name}\`(종류 ${kind}, ${depth}단계)가 너의 "${role}"이다.`,
    `일 맡기기: atrium prompt ${name} "<할 일>"(맡기고 턴을 끝내면 보드가 done 보고를 가져다준다) · 화면 읽기: ${v.read}`,
    `지금 답이 꼭 필요할 때만: ${v.prompt} · ${v.wait}`,
    `끄기(사람이 끄라고 할 때만): atrium child-kill ${name}`,
  ].join('\n');
}
// P81: --head로 띄운 세션. 부모의 워커가 아니다(첫 요청 뒤 판이 부모 관계를 뗀다)
export function headNotice({ agentName, name = agentName, kind = 'claude' }) {
  return [
    `[Atrium 보드] 헤드: \`@${name}\`(종류 ${kind})를 헤드로 띄웠다. 너의 워커가 아니다. 첫 요청 뒤 판이 부모 관계를 뗀다.`,
    '그 세션에는 첫 요청 뒤로 일을 시키거나 기다리지 않는다. 지금 연결은 `atrium me`.',
  ].join('\n');
}

// P156: --peer로 띄운 동료. 하위 워커가 아니다(child-kill 연쇄에서 빠진다). P204: 결과를 보내오지 않고 한 일은 동료 소식에 남는다
export function peerNotice({ role = PEER_ROLE, agentName, name = agentName, kind = 'claude' }) {
  return [
    `[Atrium 보드] 동료: \`@${name}\`(종류 ${kind})를 너의 "${role}"(동료)로 띄웠다. 하위 워커가 아니다.`,
    `필요한 것을 주고받기: atrium prompt ${name} "<할 일>" · 화면 읽기: atrium read ${name}`,
    `@${name}는 끝나도 결과를 보내오지 않는다. 한 일은 보드가 동료 소식에 남긴다(atrium news ${name}). 기다리지 말고 턴을 끝낸다. child-kill 연쇄에서 빠진다. 관계 바꾸기: atrium relate ${name} sub|peer|none|auto`,
    PEER_RULE, // P204
  ].join('\n');
}

// ---------- 플러그인에 넣는 것(K2) ----------
// P36: 일 맡기기 스킬(delegate)을 판에서 일하는 법 전체를 담은 atrium 스킬로 넓혔다. 이미 돌고 있는 세션은 시작 때 본 목록의 옛 이름 delegate를 부르므로
// skills/delegate/SKILL.md에도 같은 글을 이름만 바꿔 쓴다(그 세션은 새로 생긴 스킬 atrium을 목록에 갖고 있지 않다)
export const SKILL_NAME = 'atrium';
export const LEGACY_SKILL_NAME = 'delegate';
const SKILL_BODY = `# Atrium 보드에서 일하기: 워커로 나눠 맡기기

너는 \`atrium\` 명령으로 워커(하위 세션)를 만든다. 워커는 보드의 정식 세션이다. 보드에 카드로 보이고, 너와 역할 선으로 이어지고, 너의 폴더·모델·추론 수준·승인 방식를 물려받는다. 워커도 같은 방법으로 다시 펼친다. 수와 깊이에 상한은 없다.

## 쓰는 때

- 사용자가 워커, 하위 세션, 병렬, 나눠 맡기기, 워크트리를 말할 때.
- 사용자가 말하지 않아도, 일이 서로 기다리지 않는 조각 여럿(파일·모듈·조사 주제별)으로 나뉘면 네가 판단해 쓴다. 한 조각이 작거나 조각끼리 계속 맞춰야 하면 직접 한다.

## 관계 고르기

띄울 때 관계를 고른다(누가 띄웠는지는 어느 쪽이든 남는다).
- 하위 워커(기본): 워커·하위·맡겨·나눠·병렬, 또는 네 일의 한 조각. 끝나면 \`atrium done\`으로 너에게 보고하고 child-kill로 함께 꺼진다.
- 동료(\`--peer\`): 협력·동료·같이·파트너, 또는 같은 수준의 다른 일. child-kill에서 빠진다. ${PEER_RULE}
- 말이 없으면 첫 지시와 역할로 판단한다. 바꾸기: \`atrium relate <이름> sub|peer|none|auto\`.

## 순서

1. 만들기(조각 하나에 워커 하나): \`atrium child <이름> --prompt "<지시>"\`
   - 이름은 사람이 보드에서 보고 무슨 일을 맡은 워커인지 알 수 있게 네가 생각해서 짓는다. 맡긴 일이나 역할을 짧게 말한다(예: api-tests, reviewer, ko-copy, login-bug). w1·ds1 같은 번호 이름은 일이 정말 하찮을 때만 쓴다. 예를 외우지 말고 이번 일에 맞게 짓는다.
   - 규칙: 영문 소문자로 시작, 소문자·숫자·-·_ 만, 32자까지, 판 전체에서 하나. 겹친다는 답(\`name_taken\`)이 오면 다른 이름으로 다시 짓는다.
   - 워커가 준비되면 돌아온다.
   - 코드를 고치는 조각은 \`--worktree <이름>\`을 붙인다. Claude Code가 \`claude -w\`로 \`.claude/worktrees/<이름>\`과 브랜치 \`worktree-<이름>\`을 만든다. 직접 \`git worktree add\`를 하거나 보드 외부 형제 폴더를 만들지 않는다.
   - 다른 폴더는 \`--cwd C:/Workspace/x\`(슬래시로). 역할 이름 \`--role 리뷰어\`(기본 워커).
   - 모델과 추론 수준은 조각에 맞게 고른다: 찾기·요약·단순 수정은 \`--model haiku\`나 \`--effort low\`, 설계·어려운 디버깅은 \`--effort high\`. 빼면 너의 것을 물려받는다.
   - 사용자가 모델을 말로 하면("glm flash", "opus", "gpt-6.1-sol") \`atrium models\`로 목록을 보고 가장 맞는 줄의 명령으로 띄운다. \`--model "glm flash"\`처럼 들은 말을 줘도 보드가 푼다. 정확한 ID를 사용자에게 묻지 않고, 보드가 후보 여럿을 돌려줄 때만 묻는다. 보드의 워커 대신 너의 내부 하위 에이전트로 우회하지 않는다.
2. 지시 쓰는 법(\`--prompt\`나 \`atrium prompt\`의 글): 목표, 할 것, 손대지 말 것, 완료 기준, 보고에 담을 것(바꾼 파일과 결과 다섯 줄, 워크트리면 커밋 해시). 보고하는 길은 보드가 워커에게 알려 준다. 워커는 너의 대화를 모른다. 필요한 파일 경로와 사실을 글에 넣는다.
3. 맡기고 턴을 끝낸다: \`--prompt\`나 \`atrium prompt <이름> "<지시>"\`로 맡기고 턴을 끝낸다. 워커가 \`atrium done\`으로 닫으면 보드가 그 보고를 넣어 주고, 보고 없이 멈추면(쉼, 오류, 사람의 답, 닫힘) 한 번 알린다. 폴링하지 않는다.
   - 지금 답이 꼭 필요할 때만 \`atrium prompt <이름> "<지시>" --wait\`(한 번에 100초, 아직이면 \`atrium wait <이름>\`).
   - 여럿에게는 한 응답에 셸 호출을 여러 개 낸다. 일하는 중이거나 잠든 워커에게도 그냥 보낸다.
   - 받는 쪽이 지금 하는 일이 끝난 뒤 들어가면 될 글은 그냥 보낸다(대기열). 받는 쪽이 지금 하고 있는 일의 방향에 대한 추가 정보·정정이면 \`--steer\`(스티어링).
   - 하위로 받은 일은 끝나면 \`atrium done ok|failed "<보고>"\`로 닫고 쉰다(네 하위를 기다리는 동안은 done 없이 쉰다).
4. 응답: 화면은 \`atrium read <이름>\`, 목록·상태·마지막 응답은 \`atrium children\`(\`--all\`이면 그 아래까지).
5. 모아 보고, 합치기: 워커마다 답을 확인하고(완료 기준을 채웠는지, 시험이 통과했는지) 정리해 사용자에게 보고한다. 워크트리 브랜치는 보드의 merger가 켜진 프로젝트면 merger가 합치고(아래 "지킬 것"), 아니면 네가 합친다(\`git merge worktree-<이름>\`). 충돌이나 빠진 것은 그 워커에게 다시 시킨다.

- 연결: \`atrium me\`가 상위·동료·하위·독립과 역할 연결의 지금 기록이다. 판에서 잇거나 끊은 역할 연결은 알리지 않으니 모르는 이름·역할을 들으면 친다.
- 헤드: 다른 폴더에 따로 이끌 세션을 띄우라면 \`atrium child <이름> --head --cwd <폴더> --prompt "<지시>"\`. 첫 요청 뒤 보드가 떼므로 그 뒤로 시키거나 기다리지 않는다.
- 다른 종류(Codex 등): \`atrium child <이름> --kind codex --model "<모델>" --prompt "<지시>"\`. 레일의 Codex 설정과 너의 승인 방식을 따른다. 시키기·기다리기는 같다.

## 신뢰 질문

- 응답이 \`needs_trust\`(신뢰 질문에서 멈춤)면 사용자에게 응답에 적힌 한 문장만 말한다. 예: "보드에서 @wt1 카드의 신뢰 질문에 답해 주세요." 보드 외부 터미널을 열라고 하지 않고, 네가 키를 보내 답하지 않는다.
- 워크트리 워커는 사람이 답하면 보드가 그 카드에서 워크트리로 다시 띄우고, \`--prompt\`의 지시는 그 뒤에 들어간다. 그동안 그 워커에게 따로 시키지 말고 \`atrium child-wait <이름>\`으로 기다린다.
- \`needs_commit\`이면 저장소에 커밋이 없는 것이다. 사용자에게 알리고, 첫 커밋을 만들라고 한 경우에만 만든다.

## 지킬 것

- 명령은 위 모양 그대로 한 줄씩 친다. \`$변수\`, \`$(…)\`, 파이프, \`&&\`, \`;\`를 섞지 않는다(섞으면 사람의 승인을 기다린다).
- 다른 에이전트에게는 \`atrium prompt\`로만 보낸다(보드가 선과 기록을 남긴다).
- 브랜치에서 일한 워커가 \`atrium done ok\`로 닫으면 보드가 그 워커를 재우고 합치기를 merger에게 맡긴다. 합쳐지면 보드가 그 워커를 닫고 보관한다. 합치기가 실패했거나 고침이 필요하면 보드가 너에게 알리고 워커는 재운 채 둔다: 고칠 것을 그 워커에게 \`atrium prompt\`로 다시 시킨다. 그 밖의 끝난 워커는 끄지 않고 둔다(사람이 끄라고 할 때만 \`atrium child-kill <이름>\`. 하위 관계로 그 아래도 함께, 자기 하위만. 동료·독립은 남는다).
- 워커가 권한이나 질문으로 멈추면(보드의 멈춤 알림, \`atrium wait\`의 waiting) 대신 답하지 않는다. 사용자에게 "보드에서 @이름에 답해 주세요"라고 알린다.
- 오래 쉰 워커는 혼자 잠든다. 미리 깨우려면 \`atrium wake <이름>\`.
- 워커가 모델 오류로 답하지 못하면(\`atrium children\`의 오류 줄) 사용자에게 알리고 \`atrium models\`의 다른 줄로 다시 띄운다.
`;
export function boardSkill(name = SKILL_NAME) {
  const description = name === SKILL_NAME
    ? 'Atrium 보드에서 일하는 법: 워커(하위 세션)나 동료를 띄워 일을 나눠 맡기고, 코드 조각은 워크트리에서 시키고, 답을 모아 합친다. 사용자가 워커, 하위 세션, 병렬, 나눠 맡기기, 워크트리, 동료, 협력, spawn workers, sub-sessions를 말할 때, 그리고 일이 서로 기다리지 않는 조각 여럿으로 나뉠 때 사용자가 말하지 않아도 쓴다. Atrium 보드가 띄운 세션에서만 된다.'
    : 'atrium 스킬의 옛 이름(내용이 같다). 워커(하위 세션)를 만들어 일을 나눠 맡기고 답을 모아 온다. Atrium 보드가 띄운 세션에서만 된다.';
  // P169: 옛 이름은 모델이 보는 스킬 목록에서 뺀다(Claude Code 머리글 disable-model-invocation). 사람이 /atrium:delegate로 부르면 그대로 된다
  const hidden = name === SKILL_NAME ? '' : 'disable-model-invocation: true\n';
  return `---\nname: ${name}\ndescription: ${description}\n${hidden}---\n\n${SKILL_BODY}`;
}
export const delegateSkill = () => boardSkill(LEGACY_SKILL_NAME); // P8 이름(시험과 옛 호출)
// 플러그인 bin/: Git Bash(Bash 도구)용 sh와 PowerShell·cmd용 .cmd. 이 판의 node와 명령 파일을 절대 경로로 부른다
// P18: atrium이 본 이름이고, 옛 이름 mtask도 같은 명령이다(P18 전에 띄운 세션의 스킬 글이 mtask child를 말한다)
// P184: atrium 명령의 코드(bin/atrium-child.mjs와 그것이 부르는 src 파일들)를 { '<backend 안 상대 경로>': 글 }로 모은다.
//   판은 이것을 하네스 bin 폴더 안(lib/)에 함께 두고 거기를 부른다. 샌드박스 Codex(승인 모드)는 작업 폴더와 Codex가 권한을 준 폴더만 읽어서,
//   판 코드가 그 밖(개발용 판의 C:\Workspace 등)이면 atrium을 부르지 못했다. 이렇게 하면 판 데이터 폴더만 읽히면 된다
export function childBundle(root = BACKEND_ROOT, entry = 'bin/atrium-child.mjs') {
  const out = {};
  const walk = (rel) => {
    if (out[rel] != null) return;
    const text = fs.readFileSync(path.join(root, rel), 'utf8');
    out[rel] = text;
    for (const m of text.matchAll(/^\s*import\s[^'"]*?from\s+['"](\.{1,2}\/[^'"]+)['"]/gm)) walk(path.posix.normalize(path.posix.join(path.posix.dirname(rel), m[1])));
  };
  walk(entry);
  return out;
}
// P208: <이름>.target은 실행 파일 꾸러미(<이름>.exe, shim-exe.mjs)가 읽는 두 줄(node 경로, atrium-child.mjs 경로)이다.
//   PowerShell·cmd는 PATHEXT 순서로 .exe를 .cmd보다 먼저 찾는다. Git Bash는 확장자 없는 sh 꾸러미를 쓴다
export function childShims({ node = process.execPath, script = path.join(BACKEND_ROOT, 'bin', 'atrium-child.mjs') } = {}) {
  const fwd = (p) => p.split(path.sep).join('/');
  const out = {};
  for (const c of ['atrium', 'mtask']) {
    out[c] = `#!/bin/sh\n# Atrium 보드(P8, P116): 보드가 띄운 세션의 명령. 사용법: ${c} help\nexec "${fwd(node)}" "${fwd(script)}" "$@"\n`;
    out[`${c}.cmd`] = `@echo off\r\nrem Atrium 보드(P8, P116): 보드가 띄운 세션의 명령. 사용법: ${c} help\r\n"${node}" "${script}" %*\r\n`;
    out[`${c}.target`] = `${node}\r\n${script}\r\n`;
  }
  return out;
}

export function attachBranch(b, opts) { return new Branch(b, opts); }

export class Branch {
  constructor(b, { readyWaitMs = READY_WAIT_MS, submitWaitMs = SUBMIT_WAIT_MS, childWaitMs = CHILD_WAIT_MS, gateTrustWaitMs = GATE_TRUST_WAIT_MS, noticeBatchMs = NOTICE_BATCH_MS, verbs: verbOpts = {}, news: newsOpts = {}, merger: mergerOpts = {} } = {}) {
    this.b = b; this.readyWaitMs = readyWaitMs; this.submitWaitMs = submitWaitMs; this.childWaitMs = childWaitMs; this.gateTrustWaitMs = gateTrustWaitMs;
    this.modelErrors = new Map(); // P41: 세션 ID → 마지막으로 알린 모델 오류(rt.lastError 객체. P55: 시각으로 가리면 같은 밀리초의 다음 오류를 놓친다)
    this.passing = new Set(); // P36: 신뢰 관문을 지나는 중인 세션 ID(claude -w로 다시 띄우는 중)
    this.info = new Map(); // 세션 ID → 하위 세션 기록(sessions.branch)
    this.firstOf = new Map(); // P79: 첫 요청 전달 ID → 하위 세션 ID(들어가지 않으면 부모에게 알린다)
    this.lost = new Map(); // P79: 하위 세션 ID → 들어가지 않은 첫 요청 { status, reason, at, text }(atrium children에 보인다)
    this.closed = new Map(); // 닫힌 세션 ID → { parentSessionId, name }(깊이·자손을 셀 때 따라간다)
    this.pending = []; // 만드는 중인 하위 세션의 부모 ID(상한을 동시에 넘지 않게)
    this.pendingNames = new Set(); // 만드는 중인 하위 세션 이름(동시에 같은 이름을 짓지 않게)
    for (const r of b.store.branchRows()) {
      if (r.branch) this.info.set(r.sessionId, r.branch);
      if (r.closedAt) this.closed.set(r.sessionId, { parentSessionId: r.parentSessionId, name: r.name });
    }
    this.byParentKill = new Set(); // P81: 부모의 atrium child-kill로 끄는 세션 ID(닫힘 알림을 보내지 않는다)
    // P81: 연결이 바뀔 때 알림. 닫힘·닫는 중·잠든 세션에는 보내지 않는다(잠든 세션을 이 알림으로 깨우지 않는다)
    this.notices = new NoticeBatcher({
      batchMs: noticeBatchMs,
      canSend: (sid) => { const s = b.sessions.get(sid); return !!s && !(b.killing && b.killing.has(sid)) && !this.asleep(s); },
      send: (sid, text, lines) => { const d = b.queue.enqueue(sid, text); b.store.addEvent(sid, 'link_notice', { lines, deliveryId: d.deliveryId }); return d; },
      onDrop: (sid, lines) => { if (b.sessions.has(sid)) b.store.addEvent(sid, 'link_notice_dropped', { lines }); },
    });
    this.news = new PeerNews(b, this, newsOpts); // P204: 동료 소식(턴 끝·done 자동 기록, atrium log | news)
    this.docs = new DocWatch(b, this); b.docs = this.docs; // P257: 문서 점검(일 단위가 done·머리에서 부른다)
    this.units = new WorkUnits(b, this, { noticeBatchMs }); // P180: 일 단위와 시도(bus 처리보다 먼저 만든다). P181: 멈춤 알림도 같은 묶음 시간
    this.merger = new Merger(b, this.units, mergerOpts); b.merger = this.merger; // P267: 브랜치 하위의 done ok를 merger에게
    b.bus.on('closed', (s, reason) => {
      this.closed.set(s.sessionId, { parentSessionId: s.parentSessionId || null, name: s.name });
      const told = this.units.onClosed(s, { reason, byParent: this.byParentKill.has(s.sessionId) }); // P181: 열린 일이 있으면 그 상위에게 멈춤(closed) 알림
      this.onClosed(s, reason, told);
      this.news.onClosed(s); // P204
    });
    b.bus.on('session', (s, sum) => { this.onSession(s, sum); try { this.units.onSession(s, sum); } catch (e) { b.log('units session error', e.stack); } try { this.news.onSession(s, sum); } catch (e) { b.log('news session error', e.stack); } try { this.docs.onSession(s, sum); } catch (e) { b.log('docs session error', e.stack); } try { this.merger.onSession(s, sum); } catch (e) { b.log('merger session error', e.stack); } }); // P204: 동료 소식의 턴 끝 // P36: 신뢰 관문. P180: 시도의 턴 끝
    this.verbs = new AgentVerbs(b, this, verbOpts); // P116: atrium prompt | wait | read
    this.handlers = {
      'branch.tree': () => this.tree(),
    };
  }
  asleep(s) { return !!(s.rt && s.rt.sleep) || !!(this.b.sleeper && this.b.sleeper.isAsleep && this.b.sleeper.isAsleep(s)); }
  // P81: 하위 세션이 부모의 child-kill이 아닌 까닭(사람이 닫음, 스스로 끝남, 패널 사라짐)으로 닫혔으면 부모에게
  // P159: 받는 쪽은 일 부모(사람이 다른 세션 아래로 옮겼으면 그 세션). 일 부모가 없으면(동료·독립으로 둔 세션) 옛처럼 계보 부모(띄운 짝)에게
  // P181: told = 일 멈춤 알림(closed)을 이미 건 상위. 같은 상위에게 닫힘 알림을 두 번 보내지 않는다
  onClosed(s, reason, told = null) {
    if (this.byParentKill.delete(s.sessionId)) return;
    const pid = this.relIndex().workParentOf(s.sessionId) || s.parentSessionId;
    if (!pid || !this.b.sessions.has(pid) || pid === told) return;
    this.notices.add(pid, childClosedLine(s.name, closeWhy(reason)));
  }

  // ---------- 판을 찾아가기, 승인 규칙 ----------
  token(sessionId) { return crypto.createHmac('sha256', this.b.apiToken).update(`branch:${sessionId}`).digest('hex'); }
  // P115: token false면 토큰을 빼고 준다(패널에 치는 줄과 셸 기록에 남지 않게. atrium은 데이터 폴더 sessions/<ID>.token을 읽는다)
  envFor(sessionId, { token = true } = {}) {
    const c = this.b.cfg;
    return { ATRIUM_PROFILE: c.profile, ...terminalSessionEnv(c.terminalSession), ATRIUM_PORT: String(c.port), ATRIUM_DATA_DIR: c.dataDir, ATRIUM_SESSION_ID: sessionId, ...(token ? { ATRIUM_SESSION_TOKEN: this.token(sessionId) } : {}) };
  }
  allowRules() { return [...branchAllow(), uploadsReadRule(this.b.cfg.dataDir)]; } // P162: 업로드 자리(붙여 넣은 그림) 읽기
  // writeSessionSettings에 더할 값
  // P211: statusLine(판의 상태 줄 명령, 구독 사용량)
  settingsExtra(sessionId) { const sl = this.b.usage ? this.b.usage.claudeStatusLine() : null; return { env: this.envFor(sessionId), allow: this.allowRules(), ...(sl ? { statusLine: sl } : {}) }; }
  // writeBoardPlugin에 더할 것: 일 맡기기 스킬, atrium 명령(별칭 mtask)
  // P36: atrium 스킬과 옛 이름 delegate(같은 글)
  pluginExtra() { return { skills: { [SKILL_NAME]: boardSkill(SKILL_NAME), [LEGACY_SKILL_NAME]: boardSkill(LEGACY_SKILL_NAME) }, bin: childShims() }; }
  // P8 전에 띄운 판 세션의 설정 파일에도 env와 규칙을 더한다(이어 갈 때 다시 읽힌다). 다른 규칙은 그대로
  // P258: 빠진 판 hook만 더한다(fillBoardHooks). 있는 hook은 그대로
  // P18: 옛 이름의 env(MTASK_*)는 빼고 ATRIUM_*로 바꾼다(옛 데이터 폴더를 가리키는 값이 남지 않게)
  // P116: 판의 규칙(atrium prompt|wait|read)을 더한다. P129: 옛 터미널 명령 규칙은 뺀다
  refreshSettings() {
    let n = 0;
    const rules = this.allowRules();
    for (const s of this.b.sessions.values()) {
      if (!this.b.hooked(s) || !s.settingsPath || !fs.existsSync(s.settingsPath)) continue;
      try {
        const j = JSON.parse(fs.readFileSync(s.settingsPath, 'utf8'));
        const env = this.envFor(s.sessionId);
        const kept = Object.fromEntries(Object.entries(j.env || {}).filter(([k]) => !k.startsWith('MTASK_')));
        const before = (j.permissions && j.permissions.allow) || [];
        const allow = [...new Set([...before, ...rules])].filter((r) => !OLD_TERMINAL_RULE.test(r));
        const sl = this.b.usage ? this.b.usage.claudeStatusLine() : null; // P211: 판의 상태 줄 명령(이어 갈 때 다시 읽힌다)
        const added = fillBoardHooks(j); // P258: 그 뒤에 생긴 판 hook(P173 PreCompact·PostCompact 등)을 그 파일의 판 hook 값으로 채운다. 있는 hook은 그대로
        if (added.length) this.b.log(`branch: hooks added for ${s.name}: ${added.join(', ')}`);
        if (!added.length && JSON.stringify(j.env || {}) === JSON.stringify({ ...kept, ...env }) && allow.length === before.length && allow.every((r, i) => r === before[i]) && (!sl || JSON.stringify(j.statusLine || null) === JSON.stringify(sl))) continue;
        j.env = { ...kept, ...env }; j.permissions = { ...(j.permissions || {}), allow };
        if (sl) j.statusLine = sl; // 순서: 원래 규칙, 새 규칙(빠진 것 없이 같으면 쓰지 않는다)
        fs.writeFileSync(s.settingsPath, JSON.stringify(j, null, 2)); n++;
      } catch (e) { this.b.log(`branch settings refresh failed ${s.name}: ${e.message}`); }
    }
    if (n) this.b.log(`branch: settings refreshed for ${n} session(s)`);
    return n;
  }
  // backend.spawn이 하위 세션을 등록할 때(첫 요약을 보내기 전)
  noteChild(sessionId, info) { this.info.set(sessionId, info); this.b.store.setBranch(sessionId, info); }

  // ---------- 나무 ----------
  rowOf = (id) => {
    const s = this.b.sessions.get(id);
    if (s) return { parentSessionId: s.parentSessionId || null, name: s.name };
    return this.closed.get(id) || null;
  };
  depth(id) { return depthOf(id, this.rowOf); }
  openChildren(parentId) { return [...this.b.sessions.values()].filter((x) => x.parentSessionId === parentId && this.info.has(x.sessionId)); }
  openTotal() { return [...this.b.sessions.values()].filter((x) => this.info.has(x.sessionId)).length; }
  // 세션 요약에 붙인다(창의 머리줄·사이드바·미션 맵)
  // P159: 부모·단계·역할·하위 수는 일 관계(일 부모)를 따른다. 계보 부모는 lineageParentSessionId(relationSummary)에만
  summaryExtra(s) {
    const info = this.info.get(s.sessionId) || null;
    const idx = this.relIndex();
    const wp = idx.workParentOf(s.sessionId);
    const parent = wp ? this.rowOf(wp) : null;
    const child = this.isWorkChild(s.sessionId, wp, idx);
    return { branch: { depth: this.workDepth(s.sessionId, idx), parentSessionId: wp, parentName: shownName(parent), // P66: 보이는 이름
      parentAddress: parent ? parent.name : null, parentOpen: !!(wp && this.b.sessions.has(wp)), child, role: child ? this.workRole(s, wp, idx) : null, order: child && info && wp === (s.parentSessionId || null) ? this.orderOf(s.sessionId) : null, worktree: info ? info.worktree || null : null, gate: info && info.gate ? info.gate : null, children: this.workChildren(s.sessionId, idx).length,
      ...this.relationSummary(s, idx) } }; // P156: 일 부모(workParentSessionId), 계보 부모와의 관계(parentRelation), 동료(peers)
  }
  tree() {
    // P159: atrium tree는 일 관계 나무(하위는 일 부모 아래, 동료·독립은 맨 위에 서고 동료 이름을 붙인다). lineageParentSessionId는 사실
    const idx = this.relIndex();
    const rows = [...this.b.sessions.values()].map((s) => { const wp = idx.workParentOf(s.sessionId); const child = this.isWorkChild(s.sessionId, wp, idx); return { sessionId: s.sessionId, name: s.name, label: s.label || null, parentSessionId: wp, lineageParentSessionId: s.parentSessionId || null, depth: this.workDepth(s.sessionId, idx), child, adopted: !!wp && !child, role: child ? this.workRole(s, wp, idx) : null, order: child && wp === (s.parentSessionId || null) ? this.orderOf(s.sessionId) : null, peers: idx.peersOf(s.sessionId).map((p) => this.b.sessions.get(p.id)).filter(Boolean).map((x) => x.name), state: deriveState(s.rt).state, workspaceKey: s.workspaceKey || null }; });
    return { total: rows.filter((r) => r.child).length, rows }; // P159: 하위 세션 수도 일 관계
  }

  // P75: 띄운 순서(같은 부모 안에서 1, 2, 3…). 띄울 때 기록(info.order)에 남겨 형제가 닫혀도 번호가 겹치지 않는다. P75 전 기록은 띄운 때(at) 차례
  orderOf(sessionId) {
    const info = this.info.get(sessionId);
    if (!info) return null;
    if (info.order) return info.order;
    const sibs = [...this.info.entries()].filter(([, v]) => v.by === info.by && !v.order).sort(([a, x], [c, y]) => (x.at || 0) - (y.at || 0) || String(a).localeCompare(String(c)));
    return sibs.findIndex(([id]) => id === sessionId) + 1;
  }
  nextOrder(parentId) {
    let max = 0;
    for (const [id, v] of this.info) if (v.by === parentId) max = Math.max(max, this.orderOf(id) || 0);
    return max + 1;
  }

  // K4·P75: 하위 세션 노드 자리. backend.spawn이 부른다. 부모와 같은 워크스페이스면 부모 오른쪽 한 열의 끝(형제 띠의 맨 아래 다음), 아니면 null(그 워크스페이스의 빈자리 규칙).
  // P200: 부모에게 가까운 빈 칸, 상한(LINE_REACH) 밖이면 오른쪽 새 열(다른 노드를 옮기지 않는다. 부모 나무가 길어져 생기는 겹침은 spawn 뒤 reflowLines가 뒤 형제를 민다).
  // worktree를 주면(--worktree 워커) 상자가 들어설 테두리(이름표와 여백)까지 비워 두고 노드는 그 안에 놓는다. 노드는 본 저장소 쪽에 두고,
  // 워크트리가 생기면 상자가 그 노드 자리를 감싼다(worktrees.mjs). 그래서 상자도 줄에 선다
  // P175: peer(atrium child --peer)면 정리(arrangeTree P177)가 줄 자리와 크기: 짝(부모)과 같은 크기 단계, 짝의 나무 바로 아래(짝과 같은 x).
  //   짝이 누군가의 하위면 같은 줄의 형제 사이만큼, 뿌리면 나무 사이만큼 띄운다. 다른 노드는 옮기지 않는다(답에 peer: true → spawn이 줄 밀기를 하지 않는다)
  placeChild(parentId, wsKey, { worktree = null, peer = false } = {}) {
    const b = this.b;
    const parent = b.sessions.get(parentId);
    if (!parent || parent.workspaceKey !== wsKey) return null;
    const pn = b.store.nodes().find((n) => n.session_id === parentId);
    if (!pn) return null;
    const all = canvasItems(b);
    const ak = areaOfNode(b, parentId, all); // P27: 부모가 든 영역(워크트리 상자일 수 있다)
    const inBox = !worktree && isBoxKey(ak); // 워크트리 없는 하위 세션은 부모의 상자 안에 든다
    const pd = dockOf(b, parentId);
    const pRect = pd ? dockOuter(b, pd) : pn;
    const tree = lineTree(b, wsKey, all);
    const pid = tree.blockOf.get(parentId);
    if (peer) {
      const ps = { w: pn.w, h: pn.h }; // 짝의 크기 그대로(단계 열쇠와 비율도)
      const idx = this.relIndex();
      const wp = idx.workParentOf(parentId);
      const sib = !!(wp && wp !== parentId && b.sessions.has(wp) && (b.sessions.get(wp).workspaceKey || null) === wsKey);
      const frame = worktree ? boxFrame({ x: 0, y: 0, ...ps }) : ps;
      const obstacles = all.filter((i) => !(inBox && i.box === ak));
      const band = pid ? bandOf(tree, pid) : pRect;
      const at = peerSlot({ partner: pRect, band, size: frame, obstacles: [...obstacles, pRect], gap: sib ? LINE_GAP_Y : LINE_GAP_Y * 2 });
      if (!at) return null;
      const pos = worktree ? frameInner(at) : at;
      return { x: Math.round(pos.x), y: Math.round(pos.y), w: pn.w, h: pn.h, size: pn.size ?? null, aspect: pn.aspect ?? null, area: inBox ? parseArea(ak).wt : '', peer: true };
    }
    const size = SIZE_STEPS[CHILD_SIZE];
    // 이미 줄에 선 형제의 띠: 부모와 다른 블록이면 그 블록의 나무째, 부모 블록 안(부모 상자 안의 형제)이면 그 노드
    const kidIds = this.openChildren(parentId).map((x) => x.sessionId);
    const bands = [];
    const seen = new Set();
    for (const k of kidIds) {
      const bid = tree.blockOf.get(k);
      if (!bid || seen.has(bid)) continue;
      seen.add(bid);
      const r = bid === pid ? all.find((i) => i.kind === 'node' && i.id === k) : bandOf(tree, bid);
      if (r && r.x >= pRect.x + pRect.w - 1) bands.push(r);
    }
    const frame = worktree ? boxFrame({ x: 0, y: 0, ...size }) : { w: size.w, h: size.h };
    const obstacles = all.filter((i) => !(inBox && i.box === ak) && !(i.kind === 'node' && i.id === parentId)); // P35: 부모 상자 안에 놓을 때 그 상자 자신은 피하지 않는다
    const at = lineSlot({ parent: pRect, bands, size: frame, obstacles: [...obstacles, pRect] });
    if (!at) return null;
    const pos = worktree ? frameInner(at) : at;
    return { x: Math.round(pos.x), y: Math.round(pos.y), w: size.w, h: size.h, size: CHILD_SIZE, aspect: '16:9', area: inBox ? parseArea(ak).wt : '' };
  }

  // ---------- HTTP: 하위 세션 명령 ----------
  // POST /branch/child | /branch/children | /branch/kill. 머리글 X-MT-Session(부르는 세션 ID), Authorization: Bearer <세션 토큰>
  handleHttp(req, res) {
    const url = req.url.split('?')[0];
    if (req.method !== 'POST' || !url.startsWith('/branch/')) return false;
    const op = url.slice('/branch/'.length);
    // 2026-11-07: 답을 기다리는 요청(atrium child는 하위 세션이 준비될 때까지 붙잡는다)을 모아 두고, 백엔드가 끝날 때 바로 답한다(abortInflight)
    if (!this.inflight) this.inflight = new Set();
    this.inflight.add(res);
    res.once('close', () => this.inflight.delete(res));
    const chunks = []; let size = 0, tooBig = false;
    req.on('data', (d) => { size += d.length; if (size > BODY_MAX) tooBig = true; else chunks.push(d); });
    req.on('end', async () => {
      const send = (status, obj) => { if (!res.headersSent) { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); } };
      if (tooBig) return send(413, { error: { code: 'too_big', message: "요청 크기가 너무 큽니다." } });
      let body = {};
      try { body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}; } catch { return send(400, { error: { code: 'bad_json', message: "유효한 JSON 형식이 아닙니다." } }); }
      const caller = this.auth(req.headers, op);
      if (caller.error) return send(caller.status, { error: caller.error });
      try {
        const result = await this.dispatch(op, caller.s, body, res);
        send(200, { result, board: { terminalSession: this.b.cfg.terminalSession, port: this.b.cfg.port } });
      } catch (e) {
        if (!e.code) this.b.log(`branch ${op} failed: ${e.stack}`);
        send(['not_parent', 'not_sub', 'not_linked', 'user_set'].includes(e.code) ? 403 : e.code === 'not_found' ? 404 : 400, { error: { code: e.code || 'error', message: e.message, ...(e.limit ? { limit: e.limit, now: e.now } : {}), ...(e.candidates ? { candidates: e.candidates } : {}) } });
      }
    });
    return true;
  }
  // 백엔드가 끝날 때(업데이트, 다시 띄우기): 아직 답하지 않은 /branch 요청에 다시 시작한다고 답한다. 열린 연결이 http.close를 붙잡아
  // 업데이트의 바꾸기가 옛 백엔드를 기다리다 포기한 일이 있었다(2026-11-07)
  abortInflight() {
    const msg = '보드가 업데이트나 다시 시작으로 잠시 꺼집니다. 하위 세션은 만들어졌을 수 있으니 잠시 뒤 atrium children으로 확인한 뒤 다시 하세요.';
    let n = 0;
    for (const res of [...(this.inflight || [])]) {
      if (res.headersSent || res.writableEnded) continue;
      try { res.writeHead(503, { 'content-type': 'application/json; charset=utf-8', connection: 'close' }); res.end(JSON.stringify({ error: { code: 'backend_restarting', message: msg } })); n++; } catch {}
    }
    if (this.inflight) this.inflight.clear();
    return n;
  }
  auth(headers, op) {
    const sid = String(headers['x-mt-session'] || '');
    const s = this.b.sessions.get(sid);
    if (!s) return { status: 404, error: { code: 'not_on_board', message: `이 보드(${this.b.cfg.terminalSession})에서 찾을 수 없는 세션입니다. 보드에서 시작한 세션에서만 호출할 수 있습니다.` } };
    const given = String(headers.authorization || '').replace(/^Bearer /, '');
    const want = this.token(sid);
    const ok = given.length === want.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(want));
    if (!ok) { this.b.store.addEvent(sid, 'branch_rejected', { op, why: 'bad token' }); return { status: 401, error: { code: 'bad_token', message: "세션 토큰이 일치하지 않습니다." } }; }
    // P115: hook 유무가 아니라 세션 토큰으로 본다(판이 띄운 에이전트 세션이면 종류와 상관없이). 셸은 에이전트가 아니다
    if ((s.kind || 'claude') === 'shell') return { status: 403, error: { code: 'not_board_session', message: "보드에서 시작한 에이전트 세션에서만 호출할 수 있습니다." } };
    return { s };
  }
  dispatch(op, s, body, res) {
    try { this.units.stops.noteCommand(s.sessionId, op); } catch {} // P281: 그 턴의 마지막 판 명령(멈춤 알림 줄이기)
    if (op === 'child') return this.spawnChild(s, body, res);
    if (op === 'children') return this.listChildren(s, body);
    if (op === 'kill') return this.killChild(s, body);
    if (op === 'wake') return this.wakeAgent(s, body); // P21(D4)
    if (op === 'wait') return this.waitChild(s, body); // P36
    if (op === 'models') return this.listModels(s, body); // P41
    if (op === 'me') return this.me(s); // P81
    if (op === 'prompt') return this.verbs.prompt(s, body, res); // P116: atrium prompt
    if (op === 'turn') return this.verbs.wait(s, body, res); // P116: atrium wait(옛 /branch/wait는 child-wait)
    if (op === 'read') return this.verbs.read(s, body); // P116: atrium read
    if (op === 'relate') return this.relateVerb(s, body); // P156: atrium relate
    if (op === 'done') return this.units.doneVerb(s, body); // P180: atrium done ok|failed "<글>"
    if (op === 'guide') return this.guideVerb(s, body); // P182: atrium guide [주제]
    if (op === 'item') return this.units.item(s, body); // P180: atrium item
    if (op === 'items') return this.units.items(s, body); // P180: atrium items
    if (op === 'log') return this.news.logVerb(s, body); // P204: atrium log "<한 줄>"
    if (op === 'news') return this.news.newsVerb(s, body); // P204: atrium news [<이름>] [--all]
    if (op === 'docs') return this.docs.verb(s); // P257: atrium docs(문서 점검 결과)
    if (op === 'usage') return this.b.usage ? this.b.usage.get() : { providers: {}, alertsOn: false, at: Date.now() }; // P211: atrium usage
    if (op === 'usage-report') return this.b.usage ? this.b.usage.report(String(body.kind || ''), body.input) : { ok: false }; // P211: 판의 상태 줄 명령이 알린 사용량
    throw apiError('unknown_op', `알 수 없는 명령입니다: ${op}`);
  }

  // P182: atrium guide [주제]. 판의 일반 안내(help --long)는 CLI가 붙인다. P269: rig 안내는 걷어 냈다
  // P267: atrium guide merger는 merger 안내(merger-guide.md)
  guideVerb(s, o = {}) {
    if (o.topic === 'merger') return { merger: { text: readMergerGuide(), enabled: this.merger.enabledFor(s.workspaceKey), mode: this.merger.modeFor(s.workspaceKey).mode } };
    return {};
  }
  // K1: 하위 세션 만들기. o: { name, prompt, role, cwd(절대 경로), worktree, model, kind, wait }
  async spawnChild(parent, o = {}, res = null) {
    const b = this.b;
    b.requireTerminal();
    // P21(D4): 잠든 자기 하위 세션의 이름이면 새로 만들지 않고 깨운다(첫 지시가 있으면 깬 뒤 보낸다)
    const asleep = o.name && [...b.sessions.values()].find((x) => x.name === String(o.name).replace(/^@/, '') && x.parentSessionId === parent.sessionId && (x.rt.sleep || (b.sleeper && b.sleeper.wakes.has(x.sessionId))));
    if (asleep) return this.wakeAgent(parent, { name: asleep.name, prompt: o.prompt });
    // P81: --head는 부모의 워커가 아니라 따로 일을 이끄는 세션이다. 워크트리는 리드가 합칠 브랜치를 만드는 워커의 방식이라(합치는 것은 띄운 쪽) 함께 받지 않는다
    const head = !!o.head;
    if (head && o.worktree) throw apiError('bad_request', "--head와 --worktree는 함께 쓰지 않는다. 워크트리는 네가 합칠 브랜치를 만드는 워커의 방식이다. 헤드는 --cwd로 다른 폴더·저장소에 띄운다.");
    // P156: --peer는 동료로 띄운다(계보는 남고 일 관계는 동료). 헤드는 띄운 뒤 떼는 세션이라 함께 받지 않는다
    const peer = !!o.peer;
    if (head && peer) throw apiError('bad_request', "--head와 --peer는 함께 쓰지 않는다. 동료는 너와 이어져 결과를 주고받고, 헤드는 첫 요청 뒤 보드가 뗀다.");
    const relation = peer ? 'peer' : 'sub';
    const role = o.role == null || o.role === '' ? (head ? HEAD_ROLE : peer ? PEER_ROLE : DEFAULT_ROLE) : String(o.role).trim();
    if (!ROLE_RE.test(role)) throw apiError('bad_request', "역할은 1~40자로 입력하세요. 줄바꿈, 따옴표, $, \\는 사용할 수 없습니다.");
    if (o.kind === 'shell') throw apiError('bad_request', "하위 세션은 에이전트만 만들 수 있습니다. 셸은 사람이 보드에서 엽니다.");
    // P41: 무엇으로 띄우는가(호출자, 말로 한 모델 이름 풀기, 부모의 게이트웨이 물려받기)
    const route = await this.routeOf(parent, o);
    const kind = route.kind;
    const claude = kind === 'claude';
    if (kind === 'shell') throw apiError('bad_request', "하위 세션은 에이전트만 만들 수 있습니다. 셸은 사람이 보드에서 엽니다.");
    const pcwd = parent.rt.cwd && fs.existsSync(parent.rt.cwd) ? parent.rt.cwd : parent.cwd;
    const cwd = o.cwd ? path.resolve(pcwd, String(o.cwd)) : pcwd;
    if (!fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) throw apiError('bad_request', `폴더를 찾을 수 없습니다: ${o.cwd}. Windows 경로는 슬래시로 입력하세요 (--cwd C:/Workspace/x). 따옴표로 묶지 않은 백슬래시는 Bash에서 제거됩니다.`);
    const worktree = o.worktree ? String(o.worktree) : null;
    if (worktree && !WORKTREE_RE.test(worktree)) throw apiError('bad_request', `워크트리 이름에는 영문, 숫자, ., -, _만 사용할 수 있습니다: ${worktree}`);
    if (worktree && !claude) throw apiError('bad_request', "--worktree는 Claude Code(claude -w)에서만 사용할 수 있습니다.");
    if (worktree && !(await gitProbe(cwd)).isRepo) throw apiError('bad_request', `--worktree는 Git 저장소 안에서만 사용할 수 있습니다: ${cwd}`);
    // P36: 커밋이 없는 저장소는 워크트리를 만들 곳이 없다. 판과 명령은 빈 커밋을 대신 만들지 않는다
    if (worktree && !repoHasCommit(cwd)) throw apiError('needs_commit', `이 저장소(${cwd.split(path.sep).join('/')})에 커밋이 없어 워크트리를 만들 수 없습니다. 먼저 첫 커밋을 만드세요. 보드에서 대신 생성하지는 않습니다.`);
    // Claude Code는 신뢰를 받지 않은 저장소에서 -w를 신뢰 대화상자 없이 거부하고 바로 끝난다("Workspace trust not yet accepted", P8·P36 시험).
    // P36: 미리 거부하지 않고 신뢰 관문으로 띄운다(그 저장소에서 claude를 띄워 신뢰 질문을 노드에 보이고, 사람이 답하면 claude -w로 다시 띄운다)
    const gate = worktree && predictTrust(cwd, b.cfg.claudeJson).needsTrust ? worktree : null;
    // P41: 모델은 풀린 값(호출자면 호출자의 모델). 빼면 부모의 것
    // P96: 다른 종류(codex 등)는 판 레일의 그 종류 호출자를 바탕으로 띄우고, 부모의 권한 모드를 그 하네스의 승인 인자로 옮긴다
    const other = claude ? null : otherKindPlan({ route, permissionMode: parent.permissionMode || 'manual', lists: this.launchersData() });
    const model = other ? other.model : route.type === 'launcher' ? route.launcher.model || null : route.type === 'model' || route.type === 'gateway' ? route.model : claude && (parent.kind || 'claude') === 'claude' ? parent.model || null : null; // P185: 다른 종류 부모(codex)의 모델 이름을 Claude Code에 물려주지 않는다
    if (model && !isModelName(model)) throw apiError('bad_request', `모델: ${model}`);
    const launcherEffort = route.type === 'launcher' && harnessOf(route.launcher.harness).fields.includes('effort') ? route.launcher.effort || null : null;
    const effort = claude ? (o.effort ? String(o.effort) : route.type === 'launcher' ? launcherEffort : parent.effort || null) : null; // P36: --effort, 빼면 물려받는다. P41: 호출자면 호출자의 것
    if (effort && !EFFORTS.includes(effort)) throw apiError('bad_request', `추론 수준은 ${EFFORTS.filter(Boolean).join(', ')} 가운데 하나: ${effort}`);
    // P208: 다른 종류에 준 --effort는 판의 띄우기 길(backend spawn, effortArgsOf)이 그 하네스 인자로 옮긴다(Codex -c model_reasoning_effort, 호출자 인자를 이긴다).
    //   여기서는 띄우기 전에 값을 검사하고 응답에 보일 인자·"무시했다" 줄을 만든다
    const otherEffort = !claude && o.effort ? String(o.effort) : null;
    const effortPlan = otherEffort ? effortArgsOf(kind, otherEffort, other.args) : null;
    const prompt = o.prompt == null ? null : String(o.prompt);
    if (prompt != null && !prompt.trim()) throw apiError('bad_request', "첫 요청을 입력하세요.");
    if (prompt != null) checkAgentText(prompt, '첫 요청'); // P180: 판 알림 머리로 시작할 수 없다
    const taken = takenNames(b.sessions.values(), [...this.pendingNames]); // P66: 판의 이름(label)도 피한다
    const name = childName({ want: o.name ? String(o.name) : null, parentName: parent.name, taken });
    const promptText = prompt;

    // K3: P36에서 상한을 없앴다
    const parentDepth = this.depth(parent.sessionId);
    const ws = await workspaceOf(cwd);
    const depth = parentDepth + 1;
    const viaLauncher = route.type === 'launcher';
    const info = { role, depth, by: parent.sessionId, at: Date.now(), order: this.nextOrder(parent.sessionId), worktree, ...(worktree ? { wtHome: 1 } : {}), kind, via: 'atrium child', inherited: { cwd: !o.cwd, model: claude && !o.model && !o.launcher, effort: claude && !o.effort && !viaLauncher && !!parent.effort, permissionMode: other ? other.record.approvalFrom === 'parent' : !viaLauncher }, ...(viaLauncher || (other && other.launcher) ? { launcher: (viaLauncher ? route.launcher : other.launcher).name } : {}), ...(other ? { harness: other.record } : {}), ...(route.resolved ? { resolved: route.resolved } : {}), ...(gate ? { gate: 'trust' } : {}), ...(head ? { head: true } : {}), ...(peer ? { relation: 'peer' } : {}) };

    this.pending.push(parent.sessionId); this.pendingNames.add(name);
    let out;
    try {
      // 신뢰 관문이면 처음에는 -w 없이 띄운다(그 저장소의 신뢰 질문이 뜬다)
      // P41: 호출자면 그 호출자의 하네스·모델·옵션·env를 그대로 쓴다(준 --effort만 덮는다). 게이트웨이 모델과 게이트웨이 물려받기는 그 게이트웨이 호출자의 env로, 권한 모드는 부모의 것
      const base = { cwd, name, worktree: gate ? null : worktree, parentSessionId: parent.sessionId, branch: info };
      // P96: 다른 종류는 그 호출자 값(모델·추가 인자에 옮긴 승인 인자를 더한 것)으로, 호출자가 없으면 맨 명령에 같은 인자로. 권한 모드는 판 기록용으로 부모의 것
      const oe = effortPlan && effortPlan.applied ? { effort: otherEffort } : {}; // P208
      const sp = other ? (other.launcher ? { ...base, launcherDef: { ...other.launcher, model: other.model || '', args: joinArgs(other.args) }, permissionMode: parent.permissionMode, ...oe } : { ...base, kind, model: other.model, args: other.args, permissionMode: parent.permissionMode, ...oe }) // P115: 모델과 추가 인자를 따로(어댑터가 모양을 정한다)
        : viaLauncher ? { ...base, launcher: route.launcher.id, effort: o.effort ? effort : undefined }
        : route.launcherDef ? { ...base, launcherDef: route.launcherDef, model, effort, permissionMode: parent.permissionMode }
        : { ...base, kind, model, effort, permissionMode: parent.permissionMode, ...(route.args ? { args: route.args } : {}) };
      out = await b.spawn(sp);
    } finally { this.pending.splice(this.pending.indexOf(parent.sessionId), 1); this.pendingNames.delete(name); }
    const child = b.sessions.get(out.sessionId);
    if (!child) throw apiError('spawn_failed', "하위 세션이 보드에 등록되지 않았습니다.");

    // 부모와 역할 선(F2처럼), 띄움 기록
    const l = b.ensureLink(parent.sessionId, child.sessionId, { role, spawned: true });
    b.linkEvent(l, 'spawn', `atrium child ${name}${peer ? ' --peer' : ''}`, { by: 'atrium child', paneId: child.paneId, kind, depth, relation }, { quiet: true });
    // P156: 동료면 일 관계를 저장한다(출처 agent, 알림 없음: 띄운 쪽은 이 응답, 띄운 세션은 첫 요청 앞 줄로 안다)
    if (peer) this.setRelation(parent, child, 'peer', { source: 'agent', by: parent.name, quiet: true });
    const notice = head ? headNotice({ name: child.name, kind }) : peer ? peerNotice({ role, name: child.name, kind }) : childNotice({ role, name: child.name, kind, depth }); // P116: 판의 이름과 atrium 명령
    b.linkEvent(l, 'role', role, { notice, via: 'command' });
    b.store.addEvent(parent.sessionId, 'branch_child', { child: name, sessionId: child.sessionId, role, depth, cwd: cwd.split(path.sep).join('/'), workspace: ws.key, worktree, kind, model, ...(viaLauncher || (other && other.launcher) ? { launcher: (viaLauncher ? route.launcher : other.launcher).name } : {}), ...(route.resolved ? { resolved: route.resolved } : {}), ...(other ? { harness: { ...other.record, argv: other.argv } } : {}) });
    b.store.addEvent(child.sessionId, 'branch_parent', { parent: parent.name, parentSessionId: parent.sessionId, role, depth });
    b.log(`branch child ${parent.name} → ${name} (${kind}, ${depth}단계, ws=${ws.key}${worktree ? `, worktree ${worktree}` : ''})`);
    // 명령의 응답이 부모에게 닿지 않았으면(명령이 시간 제한으로 끊김 등) F2처럼 판이 알림을 보낸다
    if (res) res.once('close', () => { if (!res.writableFinished && b.sessions.has(parent.sessionId)) { const d = b.queue.enqueue(parent.sessionId, notice); b.linkEvent(l, 'notice', notice, { deliveryId: d.deliveryId, why: 'command response lost' }, { quiet: true }); } });

    let first = null;
    if (prompt) {
      // 첫 지시는 ready 뒤 B1 규칙으로 보낸다
      // P156: 첫 요청 앞에 관계 한 줄(하위는 지시의 보고 방법을, 동료는 보낼 때와 동료 소식을. P204). 헤드는 따로 이끄는 세션이라 붙이지 않는다
      // P180: 하위로 띄우면 첫 요청은 일 단위다(머리: 관계 + 일 + 약속). 동료·헤드는 옛 그대로
      const u = !head && !peer ? this.units.create(parent, child, promptText, 'child') : null;
      const header = head ? null : u ? u.header : relationHeader({ relation, parent: parent.name });
      const d = u ? u.d : b.queue.enqueue(child.sessionId, header ? `${header}\n\n${promptText}` : promptText, { origin: { kind: 'agent', session: parent.sessionId } });
      b.linkEvent(l, 'prompt', promptText, { via: 'board', deliveryId: d.deliveryId, ...(header ? { header, tag: 'assign' } : {}), ...(peer ? { tag: 'share' } : {}), ...(u ? { unitId: u.unit.id } : {}) });
      child.openPromptFrom = { linkId: l.linkId, at: Date.now(), text: promptText };
      first = { deliveryId: d.deliveryId, status: d.status, ...(u ? { unit: u.unit.id } : {}) };
      this.firstOf.set(d.deliveryId, child.sessionId);
      this.verbs.noteSent(parent, child, d.deliveryId); // P116: 부모의 atrium wait <이름>이 이 첫 요청의 턴을 기다린다
    }
    // P81: 헤드는 여기서부터 뗄 수 있다(첫 요청이 끝나면, 없으면 준비되면). 판이 다시 켜져도 기록으로 이어 간다
    if (head && this.info.has(child.sessionId)) { this.noteChild(child.sessionId, { ...this.info.get(child.sessionId), headArmed: true, ...(first ? { headPrompt: first.deliveryId } : {}) }); this.maybeHead(child); }
    const wait = o.wait === false ? null : await this.waitReady(child, first);
    if (head && b.sessions.has(child.sessionId)) this.maybeHead(child);
    const sum = b.sessions.has(child.sessionId) ? b.summary(child) : null;
    const state = sum ? sum.state : 'closed';
    // P36: 신뢰 질문에서 멈췄으면 needs_trust와 사람에게 할 한 문장(판 밖 터미널을 열라고 하지 않는다)
    const needsTrust = state === 'trust_wait' || (wait && wait.state === 'trust_wait') || (!!gate && !['exited', 'closed', 'error'].includes(state) && this.gated(child.sessionId));
    return {
      name, sessionId: child.sessionId, agentName: child.agentName, paneId: child.paneId, kind, role, depth,
      relation: head ? null : relation, relationText: head ? null : peer ? `동료(@${name}는 너의 하위 워커가 아니다. 결과를 보내오지 않고 한 일은 보드의 동료 소식에 남는다: atrium news ${name})` : `하위 워커(@${name}는 너의 워커다. 끝나면 너에게 보고한다)`, /* P156 */ cwd: cwd.split(path.sep).join('/'), workspaceKey: ws.key, worktree, model: child.model || model, effort: child.effort || effort || (effortPlan && effortPlan.applied ? otherEffort : null),
      effortNote: effortPlan && effortPlan.ignored ? effortIgnoredLine(kind, otherEffort) : null, // P208: 노력 수준을 받지 않는 종류
      launcher: viaLauncher ? route.launcher.name : other && other.launcher ? other.launcher.name : null, resolved: route.resolved || null,
      gateway: route.gateway || null, inheritedGateway: route.type === 'inherit-gateway' ? route.gateway : null, // P41
      harness: other ? { ...other.record, argv: effortPlan && effortPlan.applied ? [...(other.model ? ['-m', other.model] : []), ...effortPlan.args] : other.argv, ...(effortPlan && effortPlan.applied ? { effort: otherEffort } : {}) } : null, // P208: 옮긴 노력 수준 // P96: 다른 종류가 물려받은 것(바탕 호출자, 모델, 옮긴 승인 인자, 띄운 인자)
      permissionMode: child.permissionMode, state, trust: out.trust, waited: wait,
      status: needsTrust ? 'needs_trust' : state, needsTrust, tellHuman: needsTrust ? trustSentence(name) : null, gate: gate ? 'trust' : null,
      firstPrompt: first ? { ...first, status: (b.store.getDelivery(first.deliveryId) || {}).status || first.status } : null,
      notice, next: this.nextOf(child, { gated: !!gate && needsTrust }),
      counts: this.countsOf(parent),
      head: head ? { detached: !child.parentSessionId } : null, // P81
    };
  }
  // ---------- P41: 모델 목록과 말로 한 이름 풀기 ----------
  launchersList() { return this.launchersData().items; }
  launchersData() { const L = this.b.features && this.b.features.launchers; return L ? L.data() : { items: [], favorites: [] }; } // P96: 레일 순서(즐겨찾기)도
  findLauncher(ref) { const L = this.b.features && this.b.features.launchers; return L ? L.find(ref) : null; }
  // P255: 모델 연결(P115)을 걷어 내 게이트웨이 모델 목록은 없다(gateways는 빈 목록)
  async catalog() {
    const launchers = this.launchersData().items;
    const probed = [];
    const L = this.b.features && this.b.features.launchers;
    const lists = L && L.freshModelLists ? await L.freshModelLists() : L && L.modelLists ? L.modelLists() : {}; // P72: Codex 모델 목록(Codex 캐시). P192: AGY 목록은 잠깐 기다린다
    const harnessModels = Object.fromEntries(Object.entries(lists).map(([k, v]) => [k, v.models]));
    return { ...buildCatalog({ launchers, gateways: probed, harnessModels }), hosts: probed };
  }
  // atrium models: 띄울 수 있는 것과 그 명령
  async listModels(parent) {
    const cat = await this.catalog();
    const row = (e) => ({ source: e.source, harness: e.harness, kind: e.kind, launcher: e.launcher, model: e.model || null, label: e.label || null, aliases: e.aliases || [], gateway: e.gateway, connection: e.connection || null, host: e.host || null, variants: e.variants, text: describeEntry(e), command: e.command });
    const inherit = await this.routeOf(parent, {}).catch(() => null);
    return { entries: cat.entries.map(row), gateways: cat.gateways, parent: { name: parent.name, model: parent.model || null, effort: parent.effort || null, gateway: inherit && inherit.gateway ? inherit.gateway : null } };
  }
  // 풀지 못한 이름의 오류(후보와 고르는 명령을 글에 넣는다)
  modelError(query, r, cat) {
    const down = cat.gateways.filter((g) => !g.ok);
    const downLine = down.length ? `\n연결이 닿지 않아 그 모델 목록은 보지 못했다: ${down.map((g) => `${g.connection || g.url}(${g.url}, ${g.why})`).join(', ')}` : '';
    if (r.code === 'model_ambiguous') return apiError('model_ambiguous', `모델 "${query}"에 맞는 것이 여럿이다. 띄우지 않았다. 사용자에게 어느 것인지 묻거나 아래 명령 가운데 하나로 띄운다:\n${candidateLines(r.candidates)}`, { candidates: r.candidates.map((e) => ({ text: describeEntry(e), command: e.command })) });
    return apiError('model_unknown', `보드가 모르는 모델: "${query}". 띄우지 않았다.${r.candidates.length ? ` 가까운 것:\n${candidateLines(r.candidates)}` : ''}\n전체 목록: atrium models${downLine}`, { candidates: r.candidates.map((e) => ({ text: describeEntry(e), command: e.command })) });
  }
  // 무엇으로 띄우는가. type: launcher(호출자 그대로) | model(하네스 모델) | gateway(연결 모델, 그 연결을 쓰는 호출자로) | inherit-gateway(부모가 연결을 쓰는 claude) | inherit-harness(P115) | plain
  async routeOf(parent, o) {
    if (o.launcher) {
      const l = this.findLauncher(o.launcher);
      if (!l) throw apiError('no_launcher', `런처를 찾을 수 없습니다: ${o.launcher}. 런처와 모델 목록: atrium models`);
      const h = harnessOf(l.harness);
      if (!h || h.id === 'shell' || h.id === 'command') throw apiError('bad_request', `하위 세션에는 에이전트를 실행하는 런처만 사용할 수 있습니다: ${l.name}(${h ? h.label : l.harness})`);
      if (o.kind && o.kind !== h.kind) throw apiError('bad_request', `런처 ${l.name}은 종류 ${h.kind}다(--kind ${o.kind}와 다르다)`);
      if (o.model) throw apiError('bad_request', "--launcher와 --model은 함께 지정할 수 없습니다. 다른 모델을 사용하려면 atrium models에서 해당 모델의 실행 명령을 확인하세요.");
      const gw = h.id === 'claude' && l.env && l.env.ANTHROPIC_BASE_URL ? l.env.ANTHROPIC_BASE_URL : null;
      return { type: 'launcher', launcher: l, kind: h.kind, gateway: gw, resolved: null };
    }
    if (o.model) {
      const cat = await this.catalog();
      const r = resolveModel(String(o.model), cat, { kind: o.kind || null });
      if (!r.ok) throw this.modelError(String(o.model), r, cat);
      const e = r.entry;
      const resolved = { from: String(o.model), how: r.how, source: e.source, to: describeEntry(e), launcher: e.launcher || null, model: e.model || null, gateway: e.gateway || null, command: e.command };
      if (e.source === 'launcher') {
        const l = this.findLauncher(e.launcherId);
        return { type: 'launcher', launcher: l, kind: e.kind, gateway: e.gateway, resolved };
      }
      if (e.source === 'harness') return { type: 'model', kind: e.kind, model: e.model, args: e.kind === 'claude' ? null : ['-m', e.model], gateway: null, resolved };
      throw apiError('model_unknown', `보드가 모르는 모델: "${o.model}". 띄우지 않았다.`);
    }
    // P115: 다른 종류 부모(codex 등)가 종류를 주지 않으면 같은 하네스와 그 호출자 값(모델, 추가 인자, 실행 명령)을 물려준다. 권한 모드는 옮기지 않는다
    const pk = parent.kind || 'claude';
    if (!o.kind && pk !== 'claude' && pk !== 'shell') {
      const plan = parent.harnessPlan || {};
      const found = plan.launcherId ? this.findLauncher(plan.launcherId) : null;
      const def = found && harnessOf(found.harness) && harnessOf(found.harness).kind === pk ? found : { id: null, name: plan.launcher || pk, harness: pk, icon: '', model: '', effort: '', permissionMode: '', args: '', env: {}, command: '' };
      return { type: 'inherit-harness', kind: pk, launcherDef: { ...def, model: plan.model || '', args: (plan.args || []).join(' '), startCommand: parent.startCommand || '' }, gateway: null, resolved: null };
    }
    // 물려받기: 부모가 게이트웨이를 쓰는 claude 세션이면(spawn 이벤트의 env) 하위 세션도 같은 env로 띄운다. P255: 옛 연결 기록은 읽지 않는다
    const kind = o.kind ? String(o.kind) : 'claude';
    if (kind === 'claude' && this.b.hooked(parent)) {
      const sp = this.b.store.spawnInfo(parent.sessionId) || {};
      const url = sp.env && sp.env.ANTHROPIC_BASE_URL;
      if (url) {
        const found = sp.launcher ? this.findLauncher(sp.launcher) : null;
        const def = found && found.harness === 'claude' && found.env && found.env.ANTHROPIC_BASE_URL === url ? found
          : { id: null, name: sp.launcher || 'gateway', harness: 'claude', icon: parent.flavor || '', model: '', effort: '', permissionMode: 'manual', args: joinArgs(sp.extraArgs || []), env: sp.env, command: '' };
        return { type: 'inherit-gateway', kind, launcherDef: { ...def, icon: parent.flavor || '', model: parent.model || def.model || '' }, gateway: url, resolved: null };
      }
    }
    return { type: 'plain', kind, gateway: null, resolved: null };
  }

  nextOf(x, { gated = false } = {}) {
    const v = verbLines(x.name); // P116: 판의 atrium 명령(터미널 백엔드와 상관없다)
    return { prompt: v.prompt, wait: gated ? `atrium child-wait ${x.name}` : v.wait, read: v.read, ...(gated ? { childWait: `atrium child-wait ${x.name}` } : {}) };
  }
  // P156: 너의 하위 세션 수는 하위 관계(일 자식)만 센다(동료는 peers). total은 판 전체 atrium child 세션
  countsOf(parent) { const idx = this.relIndex(); return { children: this.workChildren(parent.sessionId, idx).length, peers: idx.peersOf(parent.sessionId).filter((p) => this.b.sessions.has(p.id)).length, total: this.openTotal() }; }

  // ---------- P36: 신뢰 관문 ----------
  gated(sessionId) { const i = this.info.get(sessionId); return !!(i && i.gate === 'trust'); }
  // backend.deliveryView가 부른다: 관문을 지나기 전에는 판의 전달(첫 지시 등)을 보내지 않는다(신뢰 질문이나 다시 띄울 claude에 글이 들어가지 않게)
  holds(sessionId) { return this.gated(sessionId); }
  // 상태가 바뀔 때(bus 'session'). 사람이 신뢰 질문에 답해 ready(또는 그 사이 들어간 지시로 working)가 되면 claude -w로 다시 띄운다
  onSession(s, sum) {
    this.noteModelError(s);
    this.maybeHead(s, sum.state); // P81
    if (!this.gated(s.sessionId) || this.passing.has(s.sessionId)) return;
    if (!['ready', 'working', 'waiting'].includes(sum.state)) return;
    this.passing.add(s.sessionId);
    this.passGate(s).catch((e) => { this.b.log(`trust gate failed ${s.name}: ${e.stack || e.message}`); this.b.store.addEvent(s.sessionId, 'trust_gate_failed', { error: e.code || e.message }); })
      .finally(() => this.passing.delete(s.sessionId));
  }
  // P41: 모델 오류(없는 모델, 닿지 않는 모델)로 턴이 끝났으면 판 이벤트로 남기고 부모에게도 남긴다(같은 오류는 한 번)
  noteModelError(s) {
    const e = s.rt && s.rt.lastError;
    if (!e || !isModelError(e) || this.modelErrors.get(s.sessionId) === e) return;
    this.modelErrors.set(s.sessionId, e);
    const data = { type: e.type, message: clip(e.message, 300) || modelErrorText(s.model), model: s.model || null };
    this.b.store.addEvent(s.sessionId, 'model_error', data);
    if (s.parentSessionId && this.info.has(s.sessionId)) this.b.store.addEvent(s.parentSessionId, 'branch_child_error', { child: s.name, sessionId: s.sessionId, ...data });
    this.b.log(`model error ${s.name}: ${e.type} ${clip(e.message, 120) || ''}`);
  }
  async passGate(s) {
    const b = this.b; const info = this.info.get(s.sessionId);
    const t0 = Date.now();
    // 신뢰가 ~/.claude.json에 쓰였는지(claude -w가 다시 묻지 않고 만들게)
    while (predictTrust(s.cwd, b.cfg.claudeJson).needsTrust && Date.now() - t0 < this.gateTrustWaitMs) await sleep(250);
    const trusted = !predictTrust(s.cwd, b.cfg.claudeJson).needsTrust;
    // 그 사이 터미널로 직접 들어간 지시(UserPromptSubmit)는 워크트리에서 다시 보낸다
    const slipped = s.rt.lastPromptAt && s.rt.lastPromptAt >= (info.at || 0) && s.rt.lastPrompt ? String(s.rt.lastPrompt) : null;
    const st = () => deriveState(s.rt).state;
    if (['working', 'waiting'].includes(st())) { await b.adapter.sendKeys(s.agentName, ['esc']).catch(() => {}); for (let i = 0; i < 25 && ['working', 'waiting'].includes(st()); i++) await sleep(200); }
    await b.adapter.sendText(s.paneId, '/exit'); await sleep(150); await b.adapter.paneKeys(s.paneId, ['enter']);
    for (const t = Date.now(); s.rt.term.present && Date.now() - t < (b.cfg.killWaitMs || 8000);) await sleep(200);
    if (!b.sessions.has(s.sessionId)) return;
    await b.adapter.waitShellReady(s.paneId, 8000);
    const args = buildStartArgs({ ...b.launchOf(s), worktree: info.worktree });
    await b.adapter.startAgent({ name: s.agentName, paneId: s.paneId, args, ...startOpt(s) }); // P97: 실행 명령
    s.rt.exit = null; s.rt.phase = 'starting'; s.rt.launchedAt = Date.now(); s.rt.hooksSinceLaunch = 0; s.rt.sessionEnd = null;
    s.rt.term.launchPending = true; s.rt.term.agentSessionId = null; s.rt.trustPredicted = false; s.rt.trustScreen = null;
    const next = { ...info, gate: null, gatePassedAt: Date.now() };
    this.noteChild(s.sessionId, next);
    b.store.addEvent(s.sessionId, 'trust_gate_passed', { worktree: info.worktree, trusted, slipped: !!slipped, ms: Date.now() - t0, args });
    b.log(`trust gate passed ${s.name}: relaunch with --worktree ${info.worktree} (trusted=${trusted})`);
    b.broadcastSession(s, { cause: 'trust_gate' });
    if (slipped) b.queue.enqueue(s.sessionId, slipped);
  }
  // atrium child-wait <이름>: 자기 자손이 지시를 받을 수 있게 될 때까지(ready, 관문을 지난 뒤). 신뢰 질문·승인 대기·끝남이면 그대로 돌려준다
  async waitChild(parent, o = {}) {
    const b = this.b;
    const ref = String(o.name || '').replace(/^@/, '');
    if (!ref) throw apiError('bad_request', "대기할 하위 세션 이름을 지정하세요: atrium child-wait <이름>");
    const t = [...b.sessions.values()].find((x) => x.name === ref || x.agentName === ref);
    if (!t) throw apiError('not_found', `보드에서 세션을 찾을 수 없습니다: ${ref}`);
    if (!isDescendant(t.sessionId, parent.sessionId, this.rowOf)) throw apiError('not_parent', `@${t.name}은 너(@${parent.name})의 하위 세션이 아닙니다.`);
    const limit = Math.min(Number(o.timeoutMs) || this.childWaitMs, this.childWaitMs);
    const t0 = Date.now();
    const st = () => (b.sessions.has(t.sessionId) ? deriveState(t.rt).state : 'closed');
    let s = st();
    while (Date.now() - t0 < limit) {
      s = st();
      if (['exited', 'closed', 'error'].includes(s)) break;
      if (!this.gated(t.sessionId) && !this.passing.has(t.sessionId) && ['ready', 'working', 'waiting'].includes(s)) break;
      if (s === 'trust_wait' && o.untilTrusted === false) break;
      await sleep(250);
    }
    const gated = this.gated(t.sessionId) || this.passing.has(t.sessionId);
    const v = b.sessions.has(t.sessionId) ? this.childView(t) : { name: t.name, state: 'closed' };
    const needsTrust = s === 'trust_wait';
    return { ...v, state: s, ms: Date.now() - t0, timeout: Date.now() - t0 >= limit, gated, needsTrust, status: needsTrust ? 'needs_trust' : s, tellHuman: needsTrust ? trustSentence(t.name) : null, next: this.nextOf(t, { gated }) };
  }
  // 하위 세션이 지시를 받을 수 있게 될 때까지(ready). 첫 지시를 줬으면 그것이 들어가 일을 시작할 때까지(그래야 부모의 atrium wait가 바로 끝나지 않는다)
  async waitReady(child, first) {
    const b = this.b; const t0 = Date.now();
    const st = () => (b.sessions.has(child.sessionId) ? deriveState(child.rt).state : 'closed');
    while (Date.now() - t0 < this.readyWaitMs) {
      const s = st();
      if (['trust_wait', 'waiting', 'error', 'exited', 'closed'].includes(s)) return { state: s, ms: Date.now() - t0 };
      if (s === 'ready' && !first && !this.gated(child.sessionId) && !this.passing.has(child.sessionId)) return { state: s, ms: Date.now() - t0 }; // P36: 관문을 지나 -w로 뜬 뒤가 ready다
      if (first) {
        const d = b.store.getDelivery(first.deliveryId);
        if (d && ['failed', 'cancelled', 'unconfirmed'].includes(d.status)) return { state: s, delivery: d.status, ms: Date.now() - t0 };
        if (d && d.status === 'confirmed' && (s === 'working' || child.rt.term.status === 'working' || (child.rt.turn && child.rt.turn.endedAt && child.rt.turn.endedAt > d.createdAt))) return { state: s, delivery: 'confirmed', ms: Date.now() - t0 };
        if (Date.now() - t0 > this.readyWaitMs - this.submitWaitMs && s === 'ready' && d && d.status === 'confirmed') return { state: s, delivery: 'confirmed', ms: Date.now() - t0 };
      }
      await sleep(250);
    }
    return { state: st(), timeout: true, ms: Date.now() - t0 };
  }

  // P21(D4)·P24: atrium wake <이름>(또는 잠든 하위 세션 이름으로 atrium child). 판의 어느 세션이든 그 리포째 깨운다
  async wakeAgent(caller, o = {}) {
    const b = this.b;
    const ref = String(o.name || '').replace(/^@/, '');
    if (!ref) throw apiError('bad_request', "작업을 재개할 세션 이름을 지정하세요: atrium wake <이름>");
    const t = [...b.sessions.values()].find((x) => x.name === ref || x.agentName === ref || x.sessionId === ref);
    if (!t) throw apiError('not_found', `보드에서 세션을 찾을 수 없습니다: ${ref}`);
    if (o.prompt != null && String(o.prompt).trim()) checkAgentText(String(o.prompt), '지시'); // P180
    const was = !!(t.rt.sleep || (b.sleeper && b.sleeper.wakes.has(t.sessionId)));
    const r = was ? await b.sleeper.wakeFor(t, `atrium:${caller.name}`) : null; // P24: 그 리포의 잠든 세션을 모두 깨우고 이 세션이 준비될 때까지. P111: 혼자 잠든 세션은 그 세션만
    let first = null;
    if (o.prompt != null && String(o.prompt).trim()) {
      const text = String(o.prompt);
      // P180: 깨우며 맡긴 일. 일 하위면 일 단위(이어지는 지시면 그 시도에 붙는 글), 아니면 옛 그대로
      const plan = this.units.plan(caller, t);
      const u = plan.kind === 'unit' ? this.units.create(caller, t, text, 'wake') : null;
      if (u && u.held) first = { deliveryId: null, status: 'queued', reason: 'unit_wait', unit: u.unit.id };
      else {
        const d = u ? u.d : b.queue.enqueue(t.sessionId, text, { origin: { kind: 'agent', session: caller.sessionId } });
        if (plan.kind === 'followup') this.units.noteFollowup(plan.tryRow, caller, d.deliveryId);
        first = { deliveryId: d.deliveryId, status: d.status, ...(u ? { unit: u.unit.id } : {}) }; this.firstOf.set(d.deliveryId, t.sessionId); this.verbs.noteSent(caller, t, d.deliveryId);
      }
    }
    b.store.addEvent(caller.sessionId, 'branch_wake', { target: t.name, woke: was, ms: r ? r.ms : null });
    const v = this.childView(t);
    return { ...v, woke: was, ms: r ? r.ms : null, firstPrompt: first, next: verbLines(t.name) }; // P116
  }

  childView(x) {
    const sum = this.b.summary(x);
    const info = this.info.get(x.sessionId) || {};
    return { name: x.name, sessionId: x.sessionId, agentName: x.agentName, paneId: x.paneId, kind: x.kind || 'claude', role: (() => { const i2 = this.relIndex(); return this.workRole(x, i2.workParentOf(x.sessionId), i2); })(), depth: this.workDepth(x.sessionId), parent: (() => { const p = this.relIndex().workParentOf(x.sessionId); return p ? (this.rowOf(p) || {}).name || null : null; })(), state: sum.state, ask: sum.ask ? clip(sum.ask.summary || sum.ask.kind, 160) : null, lastPrompt: clip(promptTask(x.rt.lastPrompt), 300), lastAnswer: clip(x.rt.lastAnswer, 1500), lastAnswerAt: x.rt.lastAnswerAt || null, error: sum.error ? { type: sum.error.type || null, message: clip(sum.error.message, 300) || (isModelError(sum.error) ? modelErrorText(x.model) : null) } : null, model: x.model || null, cwd: x.rt.cwd || x.cwd, worktree: info.worktree || null, gated: this.gated(x.sessionId), children: this.workChildren(x.sessionId).length, firstPromptLost: this.lost.get(x.sessionId) || null, deliveryStuck: sum.deliveryStuck || null, workParent: (() => { const p = this.relIndex().workParentOf(x.sessionId); return p ? shownName(this.rowOf(p)) : null; })() }; // P106. P156: workParent(일 부모): deliveryStuck(터미널이 오래 받지 않는 전달)
  }
  // P79: 하위 세션의 첫 요청이 끝내 들어가지 않았다(unconfirmed·failed). 판 이벤트로 남기고, 부모에게 그 사실과 다시 보낼 명령을 보낸다.
  //   첫 요청은 사람(리드)이 맡긴 일이라 조용히 사라지면 안 된다. 같은 전달은 한 번만 알린다
  onDeliveryEnd(d) {
    const sid = this.firstOf.get(d.deliveryId);
    if (this.verbs) this.verbs.onDeliveryEnd(d); // P116: atrium prompt가 들어갔으면 받는 쪽의 지금 지시로(연결 기록)
    if (!sid) this.senderLost(d); // P215: 첫 요청은 아래 firstPromptEnd가 부모에게 알린다
    const r = this.firstPromptEnd(d);
    // P81: 헤드의 첫 요청이 들어갔거나 못 들어갔다고 판정됐다(P79 알림 뒤) → 판이 부모 관계를 뗀다
    const s = sid && FINAL.has(d.status) ? this.b.sessions.get(sid) : null;
    if (s) this.maybeHead(s, null, d);
    return r;
  }
  // P215: 에이전트가 보낸 글(atrium prompt, 맡긴 일)이 끝내 들어가지 못했다(기다림 상한, 받는 세션이 닫힘·깨지 못함 등) → 보낸 세션에 판 알림 한 줄.
  //   사람이 지운 것(cancelled user)은 알리지 않는다. 보낸 세션이 이미 닫혔으면 알리지 않는다. 사람이 창에서 보낸 글은 창의 전달 줄이 실패를 보인다
  senderLost(d) {
    if (d.status !== 'failed' && !(d.status === 'cancelled' && d.reason && d.reason !== 'user')) return null;
    const b = this.b;
    const row = b.store.getDelivery(d.deliveryId);
    if (!row || row.origin !== 'agent' || !row.fromSession || row.fromSession === row.sessionId) return null;
    const from = b.sessions.get(row.fromSession);
    if (!from) return null;
    const to = b.sessions.get(row.sessionId);
    const old = to ? null : b.store.getSession(row.sessionId); // 닫힌 받는 쪽은 저장소의 이름
    const name = to ? to.name : (old && old.name) || String(row.sessionId).slice(0, 8);
    const body = String(row.text || '').replace(/^\[Atrium 보드\][^\n]*\n+/gm, '').replace(/\s+/g, ' ').trim(); // 일 머리는 떼고 본문 앞부분
    const again = to ? `다시 보내려면: atrium prompt ${name} "<글>"` : `@${name}는 닫혔다. 필요하면 새 세션에 맡긴다`;
    const text = `[Atrium 보드] @${name}에게 보낸 글("${clip(body, 80)}")이 들어가지 않았다(${d.status}: ${d.reason || '-'}). ${again}`; // P263: "알겠다" 줄을 뺐다(다시 보내라는 말과 어긋났다)
    const n = b.queue.enqueue(from.sessionId, text);
    b.store.addEvent(from.sessionId, 'delivery_lost_notice', { deliveryId: d.deliveryId, to: row.sessionId, status: d.status, reason: d.reason || null, noticeDeliveryId: n.deliveryId });
    b.log(`delivery lost ${name} (${d.deliveryId} ${d.status}: ${d.reason || '-'}) → notice to ${from.name}`);
    const l = to ? b.store.linkByPair(from.sessionId, to.sessionId) : null;
    if (l && !l.removedAt) b.linkEvent(l, 'notice', text, { deliveryId: n.deliveryId, why: 'delivery lost' }, { quiet: true });
    return n;
  }
  firstPromptEnd(d) {
    const sid = this.firstOf.get(d.deliveryId);
    if (!sid) return null;
    if (d.status === 'confirmed' || d.status === 'cancelled') { this.firstOf.delete(d.deliveryId); this.lost.delete(sid); return null; }
    if (d.status !== 'unconfirmed' && d.status !== 'failed') return null;
    this.firstOf.delete(d.deliveryId);
    const b = this.b;
    const child = b.sessions.get(sid);
    if (!child) return null;
    const row = b.store.getDelivery(d.deliveryId) || {};
    const lost = { deliveryId: d.deliveryId, status: d.status, reason: d.reason || null, at: Date.now(), text: clip(row.text || '', 300) };
    this.lost.set(sid, lost);
    b.store.addEvent(sid, 'first_prompt_lost', { deliveryId: d.deliveryId, status: d.status, reason: d.reason || null });
    b.log(`first prompt lost ${child.name} (${d.status}: ${d.reason || '-'})`);
    const parent = child.parentSessionId ? b.sessions.get(child.parentSessionId) : null;
    if (!parent) return lost;
    const text = `@${child.name}에게 보낸 첫 요청이 들어가지 않았다(${d.status}${d.reason ? `: ${d.reason}` : ''}). 화면을 보고(${this.readCmd(child)}) 필요하면 다시 보낸다: atrium prompt ${child.name} "<할 일>"`;
    const n = b.queue.enqueue(parent.sessionId, text);
    const l = b.ensureLink(parent.sessionId, child.sessionId, {});
    b.linkEvent(l, 'notice', text, { deliveryId: n.deliveryId, why: 'first prompt lost' }, { quiet: true });
    return lost;
  }
  // P258: 미확인으로 끝난 전달이 늦게 들어갔다(DeliveryQueue late_confirm). 첫 요청이었으면 부모에게 보낸 "들어가지 않았다" 알림(firstPromptEnd)을
  //   바로잡는다(다시 보내면 같은 일이 두 번 들어간다). atrium prompt의 보낸 쪽에는 미확인을 따로 알리지 않았으므로(senderLost는 failed·cancelled만) 다시 알리지 않는다
  onLateConfirm(r) {
    const b = this.b;
    for (const [sid, lost] of this.lost) {
      if (lost.deliveryId !== r.deliveryId) continue;
      this.lost.delete(sid);
      b.store.addEvent(sid, 'first_prompt_late', { deliveryId: r.deliveryId, afterMs: r.afterMs ?? null });
      const child = b.sessions.get(sid);
      const parent = child && child.parentSessionId ? b.sessions.get(child.parentSessionId) : null;
      if (!child || !parent) return null;
      const text = `@${child.name}에게 보낸 첫 요청은 늦게 들어갔다(앞 알림의 "들어가지 않았다"는 틀렸다). 다시 보내지 않는다.`;
      const n = b.queue.enqueue(parent.sessionId, text);
      const l = b.ensureLink(parent.sessionId, child.sessionId, {});
      b.linkEvent(l, 'notice', text, { deliveryId: n.deliveryId, why: 'first prompt late' }, { quiet: true });
      return n;
    }
    return null;
  }
  readCmd(x) { return `atrium read ${x.name} --lines 40`; } // P116
  // atrium children: 자기의 하위 세션(all이면 그 아래 모두, 나무 순서)
  // P156: 하위 관계(일 자식)만 내려간다. level은 부르는 세션에서 몇 단계 아래인지. 동료는 따로(peers)
  listChildren(parent, o = {}) {
    const b = this.b;
    const idx = this.relIndex();
    const list = []; const seen = new Set([parent.sessionId]);
    const walk = (id, level) => { for (const x of this.workChildren(id, idx).sort((a, c) => a.createdAt - c.createdAt)) { if (seen.has(x.sessionId)) continue; seen.add(x.sessionId); list.push({ ...this.childView(x), level, relation: 'sub' }); if (o.all) walk(x.sessionId, level + 1); } };
    walk(parent.sessionId, 1);
    const peers = idx.peersOf(parent.sessionId).map((p) => b.sessions.get(p.id)).filter(Boolean).map((x) => ({ name: shownName(x), address: x.name, state: b.summary(x).state, kind: x.kind || 'claude' }));
    return { parent: parent.name, depth: this.depth(parent.sessionId), children: list, peers, counts: this.countsOf(parent) };
  }
  // atrium child-kill <이름>: 자기 자손만. 그 아래 자손도 깊은 것부터 끈다(only면 그것 하나)
  async killChild(parent, o = {}) {
    const b = this.b;
    const ref = String(o.name || '').replace(/^@/, '');
    if (!ref) throw apiError('bad_request', "종료할 하위 세션 이름을 지정하세요.");
    const t = [...b.sessions.values()].find((x) => x.name === ref || x.agentName === ref || x.paneId === ref || x.sessionId === ref);
    if (!t) throw apiError('not_found', `보드에서 세션을 찾을 수 없습니다: ${ref}`);
    // P156: 하위 관계(일 부모를 따라)로만 내려간다. 계보 자손이라도 동료·독립으로 바꾼 세션은 끄지 않는다
    const idx = this.relIndex();
    if (t === parent || !idx.isWorkDescendant(t.sessionId, parent.sessionId)) {
      const rel = t !== parent && isDescendant(t.sessionId, parent.sessionId, this.rowOf) ? idx.between(this.lineageOf(t.sessionId), t.sessionId) : null;
      const msg = t === parent ? "atrium child-kill로 자기 세션을 종료할 수 없습니다."
        : rel && rel.relation !== 'sub' ? `@${t.name}은 너(@${parent.name})의 ${RELATION_WORD[rel.relation]}이라 하위 끄기로 끄지 않습니다. 사람이 끄라고 했으면 사람에게 보드에서 닫아 달라고 하거나, 하위로 바꾼 뒤(atrium relate ${t.name} sub) 끕니다.`
        : `@${t.name}은 너(@${parent.name})의 하위 세션이 아닙니다. 자신의 하위 세션과 그 하위 세션만 종료할 수 있습니다.`;
      const code = rel && rel.relation !== 'sub' ? 'not_sub' : 'not_parent';
      b.store.addEvent(parent.sessionId, 'branch_refused', { code, reason: msg, target: t.name });
      b.api.broadcast('branch.refused', { sessionId: parent.sessionId, name: parent.name, code, reason: msg, target: t.name });
      throw apiError(code, msg);
    }
    const ids = [...b.sessions.keys()];
    const order = o.only ? [] : workDescendantsOf(t.sessionId, ids, idx).map((x) => x.sessionId);
    order.push(t.sessionId);
    // 계보로는 아래지만 동료·독립으로 갈라져 남기는 세션(응답에 이름을 적는다)
    const keptIds = o.only ? [] : lineageKept(t.sessionId, ids, (id) => this.lineageOf(id), new Set(order));
    const kept = keptIds.map((id) => { const x = b.sessions.get(id); const p = this.lineageOf(id); const r = p ? idx.between(p, id) : null; return { name: x.name, relation: r ? r.relation : 'none' }; });
    const killed = [];
    for (const id of order) {
      const x = b.sessions.get(id);
      if (!x) continue;
      this.byParentKill.add(id); // P81: 부모가 끈 것이라 닫힘 알림을 보내지 않는다
      try { const r = await b.kill({ session: id, confirm: true }); killed.push({ name: x.name, closed: !!r.closed }); if (!r.closed) this.byParentKill.delete(id); }
      catch (e) { this.byParentKill.delete(id); killed.push({ name: x.name, closed: false, error: e.code || e.message }); }
    }
    b.store.addEvent(parent.sessionId, 'branch_kill', { target: t.name, killed, kept });
    return { killed, kept };
  }

  // ---------- P81: 부모에서 떼기 → P159: 사람은 독립으로 두기 ----------
  // by: user(사람이 판에서) | head(--head의 첫 요청 뒤).
  // P159: 사람이 떼면 계보는 사실로 남기고 일 부모와의 관계를 독립(relation none, 출처 user)으로 둔다(independent). 되돌리기는 relation.set auto.
  // --head는 처음부터 부모 없이 띄우는 것이라 옛처럼 계보를 지운다(아래)
  detach(s, { by = 'user', notify = by === 'user' } = {}) {
    if (by === 'user') return this.independent(s, { notify });
    const b = this.b;
    const pid = s.parentSessionId;
    if (!pid) throw apiError('no_parent', `@${s.name}에게는 부모가 없습니다.`);
    if (this.gated(s.sessionId) || this.passing.has(s.sessionId)) throw apiError('gated', `@${s.name}은 신뢰 질문을 지나 워크트리로 다시 뜨는 중입니다. 다 뜬 뒤에 떼세요.`);
    const parent = b.sessions.get(pid) || null;
    const pname = parent ? parent.name : (this.rowOf(pid) || {}).name || '?';
    const info = this.info.get(s.sessionId) || null;
    s.parentSessionId = null;
    b.store.updateSession(s.sessionId, { parentSessionId: null });
    if (info) { this.info.delete(s.sessionId); b.store.setBranch(s.sessionId, null); }
    this.lost.delete(s.sessionId);
    for (const [d, sid] of this.firstOf) if (sid === s.sessionId) this.firstOf.delete(d);
    const l = b.store.linkByPair(pid, s.sessionId);
    if (l && !l.removedAt) {
      b.linkEvent(l, 'unlink', l.role || null, { why: 'detach', by }, { quiet: true });
      b.store.updateLink(l.linkId, { role: null, removedAt: Date.now() });
      b.api.broadcast('link.removed', { linkId: l.linkId, reason: 'detach' });
    }
    // 이 세션 아래의 단계 수를 다시 센다(기록의 depth도 맞춘다)
    const rows = [...b.sessions.values()].map((x) => ({ sessionId: x.sessionId, parentSessionId: x.parentSessionId || null }));
    const below = descendantsOf(s.sessionId, rows).map((r) => b.sessions.get(r.sessionId)).filter(Boolean);
    for (const x of below) { const i = this.info.get(x.sessionId); if (i && i.depth !== this.depth(x.sessionId)) this.noteChild(x.sessionId, { ...i, depth: this.depth(x.sessionId) }); }
    b.store.addEvent(s.sessionId, 'detached', { from: pname, parentSessionId: pid, by, role: info ? info.role : null });
    if (parent) b.store.addEvent(pid, 'branch_detached', { child: s.name, sessionId: s.sessionId, by });
    b.log(`branch detach ${s.name} from ${pname} (${by})`);
    if (b.broadcastSession) for (const x of [s, ...below, parent].filter(Boolean)) b.broadcastSession(x, { cause: 'detach' });
    if (notify) {
      if (parent) this.notices.add(pid, detachedParentLine(s.name));
      this.notices.add(s.sessionId, detachedChildLine(pname));
    }
    return { detached: true, name: s.name, from: pname, by };
  }
  // P159: 사람이 판에서 "독립으로 두기"(session.detach, link.delete의 detach). 일 부모(명시한 하위 줄이나 계보 부모)와의 관계를 none으로 정한다.
  // 계보(parent_session_id)와 하위 세션 기록은 그대로다. 일 부모 → 이 세션 선의 역할 이름만 지운다(선은 독립 선으로 남는다)
  independent(s, { notify = true } = {}) {
    const b = this.b;
    const pid = this.relIndex().workParentOf(s.sessionId);
    if (!pid) throw apiError('no_parent', `@${s.name}에게는 부모(위 세션)가 없습니다.`);
    if (this.gated(s.sessionId) || this.passing.has(s.sessionId)) throw apiError('gated', `@${s.name}은 신뢰 질문을 지나 워크트리로 다시 뜨는 중입니다. 다 뜬 뒤에 독립으로 두세요.`);
    const parent = b.sessions.get(pid) || null;
    const row = this.rowOf(pid) || {};
    const pname = parent ? shownName(parent) : row.name || '?';
    const up = parent || { sessionId: pid, name: row.name || '?' }; // 닫힌 일 부모: 관계 줄만 남긴다(선은 열지 않는다, setRelation)
    this.setRelation(up, s, 'none', { source: 'user', by: 'user', quiet: true });
    const l = parent ? b.store.linkByPair(pid, s.sessionId) : null;
    if (l && l.role) b.ensureLink(pid, s.sessionId, { role: null });
    b.store.addEvent(s.sessionId, 'detached', { from: pname, parentSessionId: pid, by: 'user', relation: 'none' });
    if (parent) b.store.addEvent(pid, 'branch_detached', { child: s.name, sessionId: s.sessionId, by: 'user', relation: 'none' });
    b.log(`branch independent ${s.name} from ${pname} (user)`);
    if (notify) {
      if (parent) this.notices.add(pid, detachedParentLine(s.name));
      this.notices.add(s.sessionId, detachedChildLine(pname));
    }
    return { detached: true, name: s.name, from: pname, by: 'user', relation: 'none' };
  }
  // --head 세션: 첫 요청이 끝났으면(들어감, 못 들어감, 취소) 또는 첫 요청 없이 준비됐으면 뗀다. 신뢰 질문·관문 동안은 부모를 둔다
  maybeHead(s, state = null, delivery = null) {
    const info = this.info.get(s.sessionId);
    if (!info || !info.head || !info.headArmed || !s.parentSessionId) return false;
    if (this.gated(s.sessionId) || this.passing.has(s.sessionId)) return false;
    if (info.headPrompt) {
      const d = delivery && delivery.deliveryId === info.headPrompt ? delivery : this.b.store.getDelivery(info.headPrompt);
      if (d && !FINAL.has(d.status)) return false;
    } else {
      const st = state || (this.b.sessions.has(s.sessionId) ? this.b.summary(s).state : null);
      if (!['ready', 'working'].includes(st)) return false;
    }
    try { this.detach(s, { by: 'head', notify: false }); return true; } catch (e) { this.b.log(`head detach failed ${s.name}: ${e.message}`); return false; }
  }

  // ---------- P81: atrium me ----------
  // 부르는 세션의 지금 연결: 나, 부모, 열린 하위 세션, 역할 연결 양쪽, 연결마다 마지막 지시. 닫힌 하위 세션과 끊긴 연결은 뺀다
  // P263: 판의 잇기·끊기 알림이 없어졌으므로 그 알림이 주던 것(상대의 종류·패널)을 상대마다 싣는다
  me(s) {
    const b = this.b;
    const info = this.info.get(s.sessionId) || null;
    const links = b.store.links().filter((l) => !l.removedAt);
    const lastOf = (l) => {
      if (!l) return null;
      const st = b.store.linkPromptStats ? b.store.linkPromptStats(l.linkId) : { n: 0, at: null };
      if (!st.at && !l.lastText) return null;
      return { at: st.at || l.lastAt || null, text: clip(String(l.lastText || '').split('\n').find((x) => x.trim()) || '', 80) };
    };
    const stateOf = (x) => (b.sessions.has(x.sessionId) ? b.summary(x).state : 'closed');
    const wsName = (k) => { if (!k) return null; try { return workspaceNames(b.store.workspaces()).get(k) || k; } catch { return k; } };
    const g = s.git || null;
    const me = { name: shownName(s), agentName: s.agentName, paneId: s.paneId || null, kind: s.kind || 'claude', workspace: wsName(s.workspaceKey), cwd: String((s.rt && s.rt.cwd) || s.cwd || '').split(path.sep).join('/'),
      worktree: (info && info.worktree) || (g && g.isWorktree && g.root ? path.basename(g.root) : null), branch: g && g.branch ? g.branch : null, state: stateOf(s) };
    // P156: 상위(일 부모)·동료·하위(일 자식)·독립으로 나눈다. 계보(누가 띄웠나)는 lineage에 남긴다
    const idx = this.relIndex();
    const pairLink = (x, y) => links.find((l) => l.from === x && l.to === y) || links.find((l) => l.from === y && l.to === x) || null;
    const srcOf = (x, y) => { const r = idx.explicitOf(x, y); return r ? r.source || 'agent' : 'auto'; };
    let parent = null;
    const wp = idx.workParentOf(s.sessionId);
    if (wp) {
      const p = b.sessions.get(wp) || null;
      const row = this.rowOf(wp) || {};
      const l = links.find((x) => x.from === wp && x.to === s.sessionId);
      const lineage = wp === s.parentSessionId;
      parent = { name: p ? shownName(p) : row.name || '?', agentName: p ? p.agentName : null, kind: p ? p.kind || 'claude' : row.kind || null, paneId: p ? p.paneId || null : null, role: (lineage && info && info.role) || (l && l.role) || null, order: lineage && info ? this.orderOf(s.sessionId) : null, state: p ? stateOf(p) : 'closed', closed: !p, head: !!(info && info.head), last: lastOf(l), source: srcOf(wp, s.sessionId) };
    }
    const kids = this.workChildren(s.sessionId, idx).sort((x, y) => (this.orderOf(x.sessionId) || 0) - (this.orderOf(y.sessionId) || 0) || x.createdAt - y.createdAt);
    const kidIds = new Set(kids.map((x) => x.sessionId));
    const children = kids.map((x) => { const i = this.info.get(x.sessionId) || {}; const own = x.parentSessionId === s.sessionId; return { name: shownName(x), agentName: x.agentName, kind: x.kind || 'claude', paneId: x.paneId || null, role: (own && i.role) || ((links.find((l) => l.from === s.sessionId && l.to === x.sessionId) || {}).role) || null, order: own ? this.orderOf(x.sessionId) : null, state: stateOf(x), worktree: i.worktree || null, last: lastOf(links.find((l) => l.from === s.sessionId && l.to === x.sessionId)), source: srcOf(s.sessionId, x.sessionId) }; });
    // 동료·독립(명시한 관계). spawnedBy: 이 세션을 띄운 쪽이 상대인지(계보 부모), spawned: 내가 띄운 세션인지
    const sideOf = (list) => list.map((r) => b.sessions.get(r.id)).filter(Boolean).map((x) => ({ name: shownName(x), agentName: x.agentName, kind: x.kind || 'claude', paneId: x.paneId || null, state: stateOf(x), source: srcOf(s.sessionId, x.sessionId), spawnedBy: s.parentSessionId === x.sessionId, spawned: x.parentSessionId === s.sessionId, last: lastOf(pairLink(s.sessionId, x.sessionId)) }));
    const peers = sideOf(idx.peersOf(s.sessionId));
    const independent = sideOf(idx.independentOf(s.sessionId));
    const sideIds = new Set([...idx.peersOf(s.sessionId), ...idx.independentOf(s.sessionId)].map((r) => r.id));
    const lp = s.parentSessionId ? (b.sessions.get(s.parentSessionId) || this.rowOf(s.parentSessionId)) : null;
    const lineage = lp && s.parentSessionId !== wp ? { name: shownName(lp) || lp.name || '?', relation: (idx.between(s.parentSessionId, s.sessionId) || {}).relation || 'none' } : null;
    // 역할 연결 양쪽(상위 → 나, 나 → 하위, 동료·독립은 위에 있다)
    const roles = [];
    for (const l of links) {
      if (!l.role) continue;
      const out = l.from === s.sessionId, inn = l.to === s.sessionId;
      if (!out && !inn) continue;
      if (inn && l.from === wp) continue;
      if (out && kidIds.has(l.to)) continue;
      if (sideIds.has(out ? l.to : l.from)) continue;
      const o = b.sessions.get(out ? l.to : l.from);
      if (!o) continue;
      roles.push({ dir: out ? 'out' : 'in', role: l.role, name: shownName(o), agentName: o.agentName, kind: o.kind || 'claude', paneId: o.paneId || null, state: stateOf(o), last: lastOf(l) });
    }
    const news = this.news.meLine(s); // P204: 읽지 않은 동료 소식(없으면 칸이 없다)
    return { at: Date.now(), me, parent, peers, children, independent, lineage, roles, ...(news ? { news } : {}),
      commands: { prompt: 'atrium prompt <이름> "<할 일>" --wait', wait: 'atrium wait <이름>', read: 'atrium read <이름>' } }; // P116
  }
}
installRelations(Branch); // P156
