import { KNOW_RULE_PLAIN } from './cli-contract.mjs'; // P364: 작업 지식 찾기 한 줄
// P296: 자체 오케스트레이션 하네스(안에서 DAG·팀·하위 에이전트를 스스로 돌리는 무거운 하네스)를 판이 받친다. 순수 함수와 표.
// - 두 축이 세션의 실제 권한을 정한다.
//   (a) 오케스트레이션 성질은 런처의 것이다(종류가 아니다: 무거운 플러그인이 보통 claude 위에 얹힐 수 있다). 런처 칸 orchestrates,
//       없으면 종류의 기본(ORCH_DEFAULTS, 예: hermes는 true). 켜지면 atrium child·child-kill·relate·child-wait가 없다(안의 일은 하네스가 나눈다).
//   (b) 소통 범위는 판의 관계: 하위면 부모하고만 말한다(부모에게 prompt, done, item, 읽기 전용 me·usage). 독립(사람과 직접 일함·동료)이면
//       ask·todo도 되고 child는 여전히 없다.
// - 제한은 오케스트레이션 세션에만 건다. 보통 세션은 지금 그대로(allowed null = 모두).
// - 백엔드(branch.mjs)가 /branch/* 앞에서 막고(not_permitted), help·안내문은 허용 동사만 보인다.
// - 입력은 대기열만(스티어링 없음, delivery.mjs steerBlock 'orchestrates'). 보고는 atrium done, 하네스가 atrium을 못 돌리면
//   런처 칸 reportFallback 'last_answer'로 판이 턴 끝 마지막 답을 그 일의 보고로 닫는다(work-units.mjs).
// - 잠재우기: 안의 에이전트는 화면이 조용해도 돈다. 바쁨 신호(busy: proctree·cpu·{ files })를 sleep.mjs가 보고 바쁘면 재우지 않는다.

// 종류의 기본값(런처 칸이 없을 때). 하네스 어댑터를 붙이면(P297 Hermes) 이 표에 그 종류를 둔다
// P297 측정(Hermes 0.23 + OMH): 안의 일(에이전트 고리, 모델 호출, 도구, delegate_task)은 패널 나무 밖 프로필 공유 gateway 데몬에서 돈다.
//   그래서 proctree·cpu는 아무것도 보지 못한다.
// P298: Hermes는 상태 파일의 고친 때 대신 그 세션만 보는 읽개(hermes.mjs hermesBusyOf: state.db의 도는 하위 에이전트·턴 임대)를 쓴다(공용 파일의 고친 때는 사람이 따로 쓰는 Hermes도 바쁨으로 보였다).
//   보고는 atrium done(세션별 감싸개로 닿는다)이 먼저이고, done 없이 턴이 끝나면 마지막 답으로 닫는다(reportFallback, 하위가 도는 동안은 기다린다)
// P329: omo(OmO)도 안에서 하위 에이전트(task 도구의 분류별 에이전트, ulw·DAG)를 스스로 돌린다. 하위 에이전트는 omo 프로세스 안(in-process)에서 돌고
//   셸 도구는 omo 프로세스 나무에 붙으므로 기본 바쁨 신호(proctree·cpu)가 닿는다. 보고는 atrium done(판 env가 셸 도구까지 간다)이 먼저, 없으면 마지막 답
export const ORCH_DEFAULTS = { hermes: { orchestrates: true, reportFallback: 'last_answer', busy: [{ reader: 'hermes' }] }, omo: { orchestrates: true, reportFallback: 'last_answer' } };
export const REPORT_FALLBACKS = ['last_answer', 'none']; // P298: none = 종류의 기본(hermes last_answer)을 런처에서 끈다
export const BUSY_SIGNALS = ['proctree', 'cpu'];
export const DEFAULT_BUSY = Object.freeze(['proctree', 'cpu']);
export const BUSY_GLOB_MAX = 300;
export const BUSY_FILES_MAX = 4;

// 오케스트레이션 세션에 없는 동사(하위 세션 만들기·끄기·관계 바꾸기)
export const ORCH_NO_SPAWN = Object.freeze(['child', 'child-kill', 'relate', 'child-wait', 'revive', 'fork']); // P360: 되살리기·갈라 열기도 세션을 띄운다
// 하위 오케스트레이션 세션이 쓰는 동사(help는 CLI가 답한다). prompt는 부모에게만.
// P346: docs(점검 결과와 init·on·off)는 없다. 문서를 시작·켜고 끄는 것은 지휘 세션의 일이다(free 범위 오케스트레이션 세션은 docs를 모두 쓰고,
//   보통 세션의 워커는 doc-watch.mjs mayWrite가 not_lead로 거절한다)
// P364: know(작업 지식 찾기)는 읽기만이라 하위 오케스트레이션 세션도 쓴다
export const ORCH_SUB_VERBS = Object.freeze(['help', 'prompt', 'done', 'item', 'me', 'usage', 'know']);
// P346: 지휘 세션만 쓰는 낱말(동사 → 낱말). 판이 막고(doc-watch.mjs mayWrite) help가 보인다
export const LEAD_ONLY_SUBS = Object.freeze({ docs: Object.freeze(['init', 'on', 'off']) });
// atrium 동사 → /branch 요청 이름(cli-contract의 동사와 atrium-child.mjs의 길)
export const VERB_OP = Object.freeze({ child: 'child', children: 'children', 'child-kill': 'kill', 'child-wait': 'wait', wake: 'wake', models: 'models', me: 'me', prompt: 'prompt', wait: 'turn', read: 'read', relate: 'relate', done: 'done', guide: 'guide', item: 'item', items: 'items', log: 'log', news: 'news', ask: 'ask', todo: 'todo', docs: 'docs', usage: 'usage', plan: 'plan', revive: 'revive', fork: 'fork', know: 'know' }); // P364: know // P360: revive·fork // P304: plan(하위 오케스트레이션 세션의 허용 동사에는 없다)
export const OP_VERB = Object.freeze(Object.fromEntries(Object.entries(VERB_OP).map(([v, o]) => [o, v])));
// 권한과 상관없이 늘 받는 요청: perm(CLI의 help가 허용 동사를 묻는다), usage-report(판의 상태 줄 명령)
export const ALWAYS_OPS = Object.freeze(['perm', 'usage-report']);

const err = (code, message, extra = {}) => Object.assign(new Error(message), { code }, extra);

// 런처 칸 → 저장할 값(없는 칸은 두지 않는다). input: { orchestrates, reportFallback, busy }
export function normalizeOrchFields(input = {}) {
  const out = {};
  if (typeof input.orchestrates === 'boolean') out.orchestrates = input.orchestrates;
  else if (input.orchestrates != null && input.orchestrates !== '') throw err('bad_request', '자체 오케스트레이션: true 또는 false', { key: 'orchestrates' });
  const rf = input.reportFallback == null ? '' : String(input.reportFallback).trim();
  if (rf && !REPORT_FALLBACKS.includes(rf)) throw err('bad_request', `보고 물러섬: ${REPORT_FALLBACKS.join(', ')}`, { key: 'reportFallback' });
  if (rf) out.reportFallback = rf;
  if (input.busy != null && input.busy !== '') {
    const busy = normalizeBusy(input.busy);
    if (busy) out.busy = busy;
  }
  return out;
}
// busy 칸: ['proctree', 'cpu', { files: '<glob>' }, { reader: '<이름>' }](reader는 inner-work.mjs에 꽂은 하네스별 읽개) → 같은 꼴(모르는 것은 거절). 빈 배열이면 null(기본)
export function normalizeBusy(v) {
  const arr = Array.isArray(v) ? v : [v];
  const out = [];
  let files = 0;
  for (const x of arr) {
    if (typeof x === 'string' && BUSY_SIGNALS.includes(x)) { if (!out.includes(x)) out.push(x); continue; }
    if (x && typeof x === 'object' && typeof x.files === 'string' && x.files.trim() && x.files.length <= BUSY_GLOB_MAX && !/[\r\n]/.test(x.files)) {
      if (++files > BUSY_FILES_MAX) throw err('bad_request', `바쁨 신호의 파일 묶음은 ${BUSY_FILES_MAX}개까지`, { key: 'busy' });
      out.push({ files: x.files.trim() }); continue;
    }
    if (x && typeof x === 'object' && typeof x.reader === 'string' && /^[a-z][a-z0-9_-]{0,31}$/.test(x.reader)) { out.push({ reader: x.reader }); continue; }
    throw err('bad_request', '바쁨 신호: proctree, cpu, { files: "<glob>" }, { reader: "<이름>" }', { key: 'busy' });
  }
  return out.length ? out : null;
}

// 띄울 때 세션에 남길 오케스트레이션 값 | null. kind: 판 종류, l: 런처(또는 resolveLauncher 값의 칸 { orchestrates, reportFallback, busy })
export function orchOf(kind, l = null) {
  const d = ORCH_DEFAULTS[kind] || {};
  const own = !!l && typeof l.orchestrates === 'boolean';
  const on = own ? l.orchestrates : !!d.orchestrates;
  if (!on || !kind || kind === 'shell') return null;
  return {
    on: true,
    via: own ? 'launcher' : 'kind',
    reportFallback: l && l.reportFallback === 'none' ? null : (l && l.reportFallback) || d.reportFallback || null, // P298: none은 끔
    busy: (l && Array.isArray(l.busy) && l.busy.length ? l.busy : d.busy) || [...DEFAULT_BUSY],
  };
}
// 런처의 실제 성질(창과 atrium models가 보인다): { orchestrates, via: launcher|kind|null }
export function launcherOrch(l, kind) {
  if (l && typeof l.orchestrates === 'boolean') return { orchestrates: l.orchestrates, via: 'launcher' };
  const d = ORCH_DEFAULTS[kind];
  return d && d.orchestrates ? { orchestrates: true, via: 'kind' } : { orchestrates: false, via: null };
}

// 실제 권한. orch: 세션의 orch 값(null이면 보통 세션), relation: 'sub'(일 부모가 있는 하위) | 'peer' | 'none'(독립·맨 위),
// verbs: 동사 전체(cli-contract VERB_NAMES와 help)
// → { orchestrates, scope: normal|sub|free, allowed: [동사] | null(모두), parentOnly: 부모 세션 ID | null }
export function permOf({ orch = null, relation = 'none', parentId = null, verbs = [] } = {}) {
  if (!orch || !orch.on) return { orchestrates: false, scope: 'normal', allowed: null, parentOnly: null };
  if (relation === 'sub' && parentId) return { orchestrates: true, scope: 'sub', allowed: [...ORCH_SUB_VERBS], parentOnly: parentId };
  const all = verbs.length ? verbs : ['help', ...Object.keys(VERB_OP)];
  return { orchestrates: true, scope: 'free', allowed: all.filter((v) => !ORCH_NO_SPAWN.includes(v)), parentOnly: null };
}
export const permKey = (p) => (p ? `${p.scope}|${p.parentOnly || ''}|${(p.allowed || []).join(',')}` : '');
// 그 요청을 받는가. → null(받는다) | { verb, why }(spawn: 오케스트레이션이라 없는 동사, scope: 하위라 없는 동사, target: 부모 아닌 곳에 prompt)
export function opRefusal(perm, op, { targetId = null } = {}) {
  if (!perm || !perm.allowed || ALWAYS_OPS.includes(op)) return null;
  const verb = OP_VERB[op] || op;
  if (!perm.allowed.includes(verb)) return { verb, why: ORCH_NO_SPAWN.includes(verb) ? 'spawn' : 'scope' };
  if (verb === 'prompt' && perm.parentOnly && targetId && targetId !== perm.parentOnly) return { verb, why: 'target' };
  return null;
}
// 거절 글(에이전트가 읽는다)
export function refusalText(r, { parentName = null, allowed = [] } = {}) {
  const list = allowed.filter((v) => v !== 'help').map((v) => `atrium ${v}`).join(', ');
  const p = parentName || '부모';
  if (r.why === 'spawn') return `이 세션은 자체 오케스트레이션 하네스라 보드가 atrium ${r.verb}을 주지 않는다(하위 세션 만들기·끄기·관계 바꾸기). 안의 일은 네 하네스가 나눈다. 쓸 수 있는 명령: ${list}`;
  if (r.why === 'target') return `너는 @${p}의 하위 오케스트레이션 세션이라 부모에게만 atrium prompt를 보낸다: atrium prompt ${p} "<글>"`;
  return `너는 @${p}의 하위 오케스트레이션 세션이라 보드와는 부모하고만 말한다. atrium ${r.verb}은 없다. 쓸 수 있는 명령: ${list}`;
}

// 판 안내문(그 세션용). 줄바꿈·큰따옴표 없이(Codex -c 값, 하네스 안내문 한 줄). scope: sub | free
export function orchPromptLines(scope) {
  // P297 실시험: 보통 안내문의 "다른 에이전트에게는 atrium prompt로만" 줄이 하네스 안 위임(delegate_task)을 막았다. 그래서 하네스 안 오케스트레이션을 분명히 허락한다
  const head = '너는 Atrium 보드가 띄운 세션 안에서 돈다. 이 세션은 자체 오케스트레이션 하네스다: 일은 평소처럼 하네스 안에서 나눠 돌린다(하위 에이전트, 위임, DAG, 팀 모두 하네스의 방식대로 쓴다). atrium 명령은 보드와 말할 때만 쓴다(보드의 다른 세션에게 보내기, 맡은 일 보고 atrium done). 보드는 하위 세션을 만들어 주지 않는다(atrium child 없음). 하위로 내려가는 작업은 네가 하네스 안에서 서브에이전트를 만들어 나눠 맡긴다. 보드에서 하위 세션을 만들 필요가 없다.'; // P309: 사용자 요청 문장
  const tail = '[Atrium 보드]로 시작하는 글은 보드 알림이다. 지금 쓸 수 있는 atrium 명령은 `atrium help`가 보인다(관계가 바뀌면 달라진다). 보드에 없는 명령은 보드가 거절한다. ' + KNOW_RULE_PLAIN; // P364: 읽기만이라 어느 범위든
  if (scope === 'sub') return [head,
    '너는 보드에서 부모 세션의 하위다. 보드와는 셸의 atrium 명령으로 부모하고만 말한다: 맡은 일 보기 `atrium item`, 부모에게 묻거나 넘기기 `atrium prompt <부모 이름> <따옴표로 묶은 글>`(부모 이름은 `atrium me`), 끝나면 `atrium done ok|failed <따옴표로 묶은 보고>`로 닫는다. 읽기 전용 `atrium me`·`atrium usage`. 사람에게 물을 것도 부모에게 묻는다.',
    tail];
  return [head,
    '보드와는 셸의 atrium 명령으로 말한다. 다른 보드 세션에게 보낼 때는 `atrium prompt <이름> <따옴표로 묶은 글>`, 화면은 `atrium read <이름>`, 연결 기록은 `atrium me`. 맡은 일이 있으면 끝나면 `atrium done ok|failed <보고>`로 닫는다.',
    '사람에게 답을 받아야 하는 질문으로 턴을 끝낼 때는 글로 묻고 그 질문을 `atrium ask <따옴표로 묶은 질문>`로 남긴다. 사람에게 넘기는 일·명령·확인·미룬 일은 `atrium todo`로.',
    tail];
}
