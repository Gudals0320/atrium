// P190: rig 7단계 — 판에 내장한 rig 틀 셋과 판 내장 안내 `atrium guide rig`(docs research harness-arch.md 16절 "만들기").
// - 틀: (1) 메인 keep + 워커 fresh, (2) + 검토자 fresh(반려 되돌아감 최대 2, 넘으면 메인), (3) (2)에서 워커가 일마다 워크트리.
//   자리마다 런처는 사람이 고른다(rig.create의 launchers). 판이 .atrium/rig.json과 자리 안내 .atrium/seats/<자리>.txt를 쓴다.
// - 자리 안내 글은 일반 말이다(분야 낱말 없음). 그 자리의 할 일과 done 값을 짧게 말한다.
// - 안내(RIG_GUIDE)는 제작 세션(rig-builder)이 읽는다: 정의 형식, 틀 셋의 예, atrium rig check로 검사하는 법, 끝나면 atrium done.

// 제작 세션(rig.describe)의 일: 상위 세션이 없고 사람이 주인이다(work_units.from_session = HUMAN_FROM, origin = BUILDER_ORIGIN).
//   done 값은 판 이벤트 rig.builder로 창에 가고, 멈춤은 응답 필요 목록(판 이벤트 rig_builder_stop)으로 간다(rig-setup.mjs)
export const HUMAN_FROM = 'human';
export const BUILDER_ORIGIN = 'rig_builder';
export const BUILDER_NAME = 'rig-builder';
// 제작 세션의 일 머리(판 줄 세 줄, 관계 줄 꼴이라 카드에는 할 일만 보인다)
export function builderHeader({ unitId }) {
  return [
    `[Atrium 보드] 관계: 사람이 보드에서 맡긴 rig 만들기 일 ${unitId}이다(상위 세션 없음. 보고는 보드가 사람에게 보인다).`,
    '[Atrium 보드] 먼저 `atrium guide rig`를 읽는다. 정의를 쓰고 `atrium rig check`로 검사한 뒤 `atrium done ok "<요약>"`(못 했으면 `atrium done failed "<까닭>"`)로 닫고 쉰다. atrium 명령은 cd·&&·echo를 붙이지 않고 그대로 친다. rig는 켜지 않는다(사람이 켠다). 빌더는 rig를 짓고 읽기만 한다: atrium child와 자리 세션에 보내는 atrium prompt는 보드가 거절한다(일은 사람이 rig를 켜고 manager 자리에 맡긴다).',
    '[Atrium 보드] 사람이 직접 다르게 시키면 그것을 따른다.',
  ].join('\n');
}

export const TEMPLATE_IDS =['main-worker', 'main-worker-reviewer', 'main-worker-reviewer-worktree'];
export const SEAT_GUIDE_DIR = '.atrium/seats';
export const seatGuidePath = (seat) => `${SEAT_GUIDE_DIR}/${seat}.txt`;

// 자리 안내(일반 말). results: 그 틀의 done 값
const GUIDES = {
  main: (t) => [
    'main 자리: 사람의 요청을 받아 일을 나누고, 결과를 모아 사람에게 답한다.',
    '- 일을 맡길 때: atrium prompt worker "<할 일>". 할 일에는 무엇을, 어디까지, 끝났음을 어떻게 확인하는지를 적는다.',
    '- 맡긴 일의 결과는 보드가 가져다준다. 기다리며 폴링하지 않는다.',
    t.reviewer ? '- 워커의 결과는 reviewer 자리가 먼저 본다. reviewer가 두 번 넘게 반려하면 그 건이 이 자리로 올라온다. 그때는 할 일을 다시 나누거나 사람에게 묻는다.' : '- 워커가 failed로 닫으면 까닭을 읽고 다시 맡기거나 사람에게 묻는다.',
    '- 사람이 맡긴 일이면 끝나면 사람에게 결과를 답한다. 보드가 맡긴 일이면 atrium done ok "<요약>"(못 했으면 failed)로 닫는다.',
  ],
  worker: (t) => [
    'worker 자리: 맡은 일 하나를 끝까지 한다.',
    t.worktree ? '- 이 자리는 일마다 새 워크트리에서 돈다. 자기 브랜치에만 커밋하고, 합치는 것은 main 자리의 일이다.' : '- 맡은 일에 필요한 것만 고친다.',
    '- 끝나면 확인한 방법과 결과를 적어 닫는다: atrium done ok "<한 것, 확인한 것>".',
    '- 하지 못했으면 까닭과 막힌 곳을 적어 닫는다: atrium done failed "<까닭>".',
    t.reviewer ? '- ok로 닫으면 reviewer 자리가 그 결과를 본다. 반려되어 다시 받으면 반려 글의 지적을 먼저 고친다.' : '',
  ],
  reviewer: () => [
    'reviewer 자리: worker 자리가 끝낸 일을 확인한다. 직접 고치지 않는다.',
    '- 넘겨받은 글의 할 일과 보고를 읽고, 결과가 할 일을 채우는지 실제로 확인한다.',
    '- 채우면: atrium done ok "<확인한 것>". main 자리로 간다.',
    '- 고칠 것이 있으면: atrium done rejected "<고칠 것을 하나씩>". 새 worker가 그 글을 받는다(같은 건에서 두 번까지, 그 뒤는 main으로).',
    '- 확인할 수 없으면(필요한 것이 없음 등): atrium done failed "<까닭>". main 자리로 간다.',
  ],
};

// 틀 하나의 모양(런처 빼고)
function shape(id) {
  const reviewer = id !== 'main-worker';
  const worktree = id === 'main-worker-reviewer-worktree';
  const seats = { main: { session: 'keep' }, worker: { session: 'fresh', ...(worktree ? { worktree: true } : {}) }, ...(reviewer ? { reviewer: { session: 'fresh' } } : {}) };
  const results = reviewer ? ['ok', 'failed', 'rejected'] : ['ok', 'failed'];
  const flow = reviewer
    ? [
      { from: 'main', on: 'assign', to: 'worker' },
      { from: 'worker', on: 'ok', to: 'reviewer' },
      { from: 'worker', on: 'failed', to: 'main' },
      { from: 'reviewer', on: 'rejected', to: 'worker', max: 2, else: 'main' },
      { from: 'reviewer', on: 'ok', to: 'main' },
      { from: 'reviewer', on: 'failed', to: 'main' },
    ]
    : [
      { from: 'main', on: 'assign', to: 'worker' },
      { from: 'worker', on: 'ok', to: 'main' },
      { from: 'worker', on: 'failed', to: 'main' },
    ];
  return { reviewer, worktree, seats, results, flow };
}
const TITLES = {
  'main-worker': { title: '메인 + 워커', desc: '메인 자리(계속 쓰는 세션)가 일을 나눠 워커 자리(일마다 새 세션)에 맡기고 결과를 받는다.', en: { title: 'Main + worker', desc: 'The main seat (one kept session) splits work and hands it to the worker seat (a new session per task), then gets the results.' } },
  'main-worker-reviewer': { title: '메인 + 워커 + 검토자', desc: '워커가 끝낸 일을 검토자가 확인한다. 반려되면 새 워커가 다시 하고, 두 번 넘게 반려되면 메인으로 올라간다.', en: { title: 'Main + worker + reviewer', desc: 'A reviewer checks what the worker finished. A rejection goes back to a new worker; after two rejections it goes up to main.' } },
  'main-worker-reviewer-worktree': { title: '메인 + 워커(워크트리) + 검토자', desc: '두 번째 틀과 같고, 워커가 일마다 새 워크트리에서 일한다(Claude Code 런처만).', en: { title: 'Main + worker (worktree) + reviewer', desc: 'Like the second template, but each worker task runs in its own new worktree (Claude Code launchers only).' } },
};

// rig.templates → [{ id, title, desc, en, seats: { 이름: { session, worktree? } }, flow, results }]
export function rigTemplates() {
  return TEMPLATE_IDS.map((id) => { const s = shape(id); return { id, ...TITLES[id], seats: s.seats, flow: s.flow, results: s.results, manager: 'main' }; });
}
export const isTemplate = (id) => TEMPLATE_IDS.includes(id);

// 틀 + 자리마다 런처 → { def(rig.json 내용), guides: { <경로>: 글 } }
export function templateFiles(id, launchers = {}) {
  if (!isTemplate(id)) throw Object.assign(new Error(`모르는 틀: ${id}. 틀: ${TEMPLATE_IDS.join(', ')}`), { code: 'bad_request' });
  const s = shape(id);
  const seats = {}; const guides = {};
  for (const [name, x] of Object.entries(s.seats)) {
    const launcher = launchers[name];
    if (typeof launcher !== 'string' || !launcher.trim()) throw Object.assign(new Error(`${name} 자리의 런처를 준다(launchers.${name})`), { code: 'bad_request' });
    seats[name] = { launcher: launcher.trim(), session: x.session, ...(x.worktree ? { worktree: true } : {}), guide: seatGuidePath(name) };
    guides[seatGuidePath(name)] = GUIDES[name](s).filter(Boolean).join('\n') + '\n';
  }
  const def = { name: TITLES[id].en.title, results: s.results, seats, flow: s.flow.map((l) => ({ ...l })), manager: 'main' };
  return { def, guides };
}

// ---------- atrium guide rig(판 내장 안내) ----------
const example = (id) => JSON.stringify(templateFiles(id, { main: 'claude', worker: 'claude', reviewer: 'codex' }).def, null, 2);
export function rigGuideText() {
  return [
    'rig 만들기 안내(보드 내장). rig는 이 워크스페이스의 작업 규칙이다: 자리(seats), 흐름(flow), done 값(results), 훅(hooks), 도구(tools), 느린 고리(cycles).',
    '정의는 워크스페이스 뿌리의 .atrium/rig.json 한 파일(JSON 객체, 들여쓰기 2칸)이다. 자리 안내 글은 .atrium/seats/<자리>.txt에 둔다.',
    '사람이 보드에서 켜야 돈다. 너는 켜지 않는다. 다 쓰면 사람이 보드에서 미리보기를 보고 켠다.',
    '빌더(제작 세션)는 rig를 짓고 읽기만 한다. atrium child(하위 세션)와 자리 세션에 보내는 atrium prompt는 보드가 거절한다. 자리를 흉내 내지 말고, 일을 돌리려면 사람이 rig를 켜고 manager 자리에 맡긴다. 읽기(atrium read, atrium rig check·log --events, atrium items)는 된다.',
    '',
    '## 칸',
    '- results: 자리 세션이 atrium done에 쓰는 값. 영문 소문자 낱말 배열(assign은 못 씀). 없으면 ["ok", "failed"].',
    '- seats: { "<자리>": { ... } }. 자리 이름은 영문 소문자로 시작하고 소문자·숫자·_로 24자까지(-는 못 씀).',
    '  - launcher: 보드의 런처 id나 이름, 또는 종류(claude, codex, opencode, pi). 사람이 고른 런처를 쓴다. 모르면 사람의 설명에 적힌 것, 없으면 claude.',
    '  - session: "keep"(세션 하나를 계속 쓴다, 사람이 앉히거나 보드가 띄운다) 또는 "fresh"(일마다 새 세션 <자리>-<n>).',
    '  - worktree: true면 fresh 자리가 일마다 새 워크트리에서 돈다(Claude Code 런처만).',
    '  - guide: 그 자리의 안내 파일 경로(워크스페이스 안). 자리 세션은 일을 시작하기 전에 이것을 읽는다. 할 일과 쓸 done 값을 짧게 적는다.',
    '  - may: 일 없이 글만 보낼 수 있는 곳의 목록. 자리 이름, "@<세션 이름>"(rig 밖의 그 세션), "*"(자리 없는 세션 모두). rig 밖 세션에는 글만 가고 일은 만들지 않는다. manager 자리는 적지 않아도 rig 밖 세션에 글을 보낸다.',
    '  - max_live: fresh 자리에서 함께 도는 세션 수(기본 3). tools: 그 자리가 부를 수 있는 도구 이름.',
    '  - effort: 그 자리 세션의 노력 수준. 빼면 런처(또는 건 주인)의 것을 쓴다. Claude Code: low, medium, high, xhigh, max. Codex: none, minimal, low, medium, high, xhigh, max, ultra(model_reasoning_effort로 넘긴다). opencode·pi는 받지 않는다. 비용을 줄이려면 "medium"이나 "low".',
    '  - model: 그 자리 세션의 모델(예: "haiku", "gpt-6-astra"). launcher가 종류 이름(claude, codex 등)인 자리에만 쓴다. 런처 자리는 그 런처의 모델로 뜬다.',
    '  - effort·model은 자리 세션을 띄울 때 먹는다. 이미 앉아 있는 keep 자리 세션은 다음에 띄울 때부터 바뀐다(atrium rig check가 알린다).',
    '  - worktree 자리를 두면 워크스페이스가 git 저장소이고 첫 커밋이 있어야 한다(없으면 atrium rig check가 경고한다).',
    '- flow: 줄 배열 [{ "from": 자리, "on": "assign" | <results 값>, "to": 자리 | [자리…], "max"?: n, "else"?: 자리 }].',
    '  - on "assign": from 자리가 atrium prompt <to 자리>로 일을 맡길 수 있다(to는 자리 하나).',
    '  - on <값>: from 자리가 atrium done <값>으로 닫으면 보드가 to 자리에 같은 건의 새 일을 만든다. 맞는 줄이 없으면 건의 주인에게 간다.',
    '  - max: 같은 건에서 그 줄을 지날 수 있는 횟수. 넘으면 else 자리로(없으면 manager, 그것도 없으면 건이 막힌다). 되돌아가는 줄에는 max를 둔다.',
    '  - 건 주인에게 가는 줄(to가 주인이 앉은 keep 자리, 예: reviewer rejected → main): 주인에게는 일이 아니라 보고가 간다. 건은 열린 일이 없어지면 done 대신 waiting_owner가 되어 그 보고를 받은 주인의 턴을 기다린다. 주인이 그 턴에 atrium prompt로 맡기면 같은 건을 잇고 흐름 줄의 지난 횟수도 이어 센다. 맡기지 않고 턴을 끝내면 건은 done이다.',
    '  - 그래서 주인을 지나는 반복(반려 → 주인 → 다시 맡김)도 그 줄의 max가 센다. 예: { "from": "reviewer", "on": "rejected", "to": "main", "max": 2, "else": "<다른 자리>" }. 상한을 넘어 주인에게 올라온 건(else가 없어 manager가 주인)은 주인의 다음 맡기기를 기다리고, 그때는 셈을 0부터 다시 센다.',
    '- manager: 넘김이 풀지 못한 것을 받는 자리이자 관리자 자리(atrium rig check·log·rollback을 쓴다). 보통 메인 자리. rig를 만든 제작 세션도 제작 일을 닫은 뒤 읽기만 하는 atrium rig check·log를 쓴다.',
    '- 자리 세션의 에이전트가 끝나 셸만 남으면(exited) 보드가 그 시도를 닫고 자리 한도에서 빼고, 건을 막힘(blocked)으로 두고 건 주인에게 한 줄 알린다. 관리자 자리와 사람은 atrium rig retry <건> [<일>]로 같은 일을 같은 자리의 새 세션에 다시 맡긴다(사람은 보드의 [다시 띄우기]).',
    '- hooks, tools, cycles: 프로그램을 사용자 계정으로 돌리는 칸이다. 사람의 설명이 분명히 원할 때만 넣고, 스크립트도 .atrium/ 아래에 함께 쓴다.',
    '  - hooks: [{ "at": "deliver"|"done"|"tool-before"|"tool-after", "run": ["node", ".atrium/hooks/x.mjs"], "from"?, "tool"?, "onFail"?: "pass"|"block" }]. 입력은 stdin JSON, 출력은 stdout JSON { action: pass|rewrite|reject, text?, append?, reason? }.',
    '  - tools: { "<이름>": { "run": ["node", ".atrium/tools/x.mjs"], "desc": "…" } }. run에는 node, python, .exe를 바로 쓴다.',
    '  - cycles: [{ "every": "7d", "to": "manager" }]. 1시간 이상.',
    // P219: rig 2 R1 문서
    '- 문서(rig 2): 맨 위에 "version": 2를 두면 docs 칸을 쓴다. { "<이름>": { "path": "docs/rules.md" | "notes/", "role": "canon"(정본: 규칙·사실) | "ledger"(장부 파일) | "sector"(산출물 폴더), "load"?: "always", "stale"?: "30d" | { "after_change_of": "<문서>" }, "git"?: false } }. 경로는 워크스페이스 안이다.',
    '  - 자리의 loads(늘 싣는 문서: 자리 머리에 경로가 붙고 먼저 읽는다)·reads(필요할 때 읽는 문서)·writes(쓰는 문서 이름. 지금처럼 경로도 된다. 그 밖은 보드가 쓰기를 막는다), 훅·도구의 records(그것이 적는 장부 문서, role ledger).',
    '  - 보드가 문서의 바뀜과 누가 바꿨는지를 rig 장부에 적고, writes에 그 문서가 없는 자리가 쓰면 경고를 남긴다. 정본은 보통 사람이 고친다.',
    // P224: R6 제안과 승인
    '  - 정본(role canon)은 자리의 writes에 둘 수 없다(정의 오류). 정본·정의 고침은 제안으로 낸다: 새 내용 전체(또는 통합 diff)를 파일에 쓰고 atrium rig propose --target <문서|definition> --file <파일> --why "<까닭>". 정본 제안은 사람이 보드에서 승인하면 보드가 반영한다. 정의 제안은 고리의 "approve": "human"이면 사람, 아니면 관리자 자리가 정한다(관리자 자리가 낸 것은 바로 반영). 제안은 proposals 섹터(없으면 .atrium/proposals/)에 기록이 남고, 거절 까닭은 다음 개선 회의 첫 일 글에 붙는다. 승인 없이 바뀐 정본은 사람이 되돌리거나 받아들인다.',
    '  - 섹터의 "accept"?: "auto"(기본: 회가 done이면 받아들임) | "human"(사람이 응답 필요 목록에서 받아들임) | "gate"(done 훅 출력의 "accept": true | false | ["<경로>"]로 받아들임).',
    '  - 산출물 섹터(role "sector", 저장소 안 폴더): "intake"?: "register"(기본: 제자리에 두고 보드가 등록부에 적는다. move·copy는 아직 안 된다), "keep"?: 20 | "90d"(넘친 것은 등록부에서 밀려남으로 표시만 하고 파일은 지우지 않는다). 고리의 "produces": ["<섹터>"]는 그 고리의 회가 그 섹터에 산출물을 낸다는 뜻이다. 자리는 섹터를 writes에 두고, 만든 파일을 그 폴더에 쓴 뒤 atrium done ok "<보고>" --artifact <경로>로 낸다. 등록부: atrium rig artifacts.',
    '',
    '## 틀 셋(보드가 만드는 것과 같은 모양, 런처는 예)',
    '### 1. 메인 + 워커', example('main-worker'),
    '### 2. 메인 + 워커 + 검토자(반려 되돌아감 최대 2, 넘으면 메인)', example('main-worker-reviewer'),
    '### 3. 2에서 워커가 워크트리', example('main-worker-reviewer-worktree'),
    '',
    '## 차례',
    '1. 사람의 설명을 읽고 자리, done 값, 흐름을 정한다. 설명이 틀 하나와 같으면 그 틀에서 시작한다. 정말 모르는 것이 있을 때만 사람에게 묻는다.',
    '2. .atrium/rig.json과 자리마다 .atrium/seats/<자리>.txt(일반 말로 그 자리의 할 일과 done 값)를 쓴다. 이미 정의가 있으면 고칠 내용만 고치고 다른 칸은 그대로 둔다.',
    '3. 검사한다: atrium rig check(지금 .atrium/rig.json) 또는 atrium rig check <파일>. "맞지 않다"면 까닭을 고치고 다시 검사한다. 경고(상한 없는 되돌아감 등)도 고친다.',
    '4. 맞으면 atrium done ok "<만든 자리와 흐름 요약, 고친 것>"으로 닫고 쉰다. 못 했으면 atrium done failed "<까닭>". 보드가 그 보고를 사람에게 보이고 사람이 켠다.',
    '',
    'atrium 명령은 그대로 한 줄로 친다(cd, &&, ;, echo $? 같은 것을 붙이지 않는다. 붙이면 사람의 승인을 기다리게 된다). 작업 폴더가 이미 워크스페이스 뿌리다.',
    'PowerShell 셸은 종료 코드를 1로 바꿀 수 있으니 atrium 명령의 첫 줄 글을 본다.',
  ].join('\n');
}
