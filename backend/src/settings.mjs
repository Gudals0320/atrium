// 판 설정(P6b, ARCH 4절 I7): 판 기록(meta 표의 `settings`)에 둔다. P16: 화면 언어(language, 기본 영어). 창과 Electron main이 settings.get으로 읽고 settings.updated 이벤트로 따라간다.
// 트레이 상주(tray, P14부터 기본 켜짐), P10의 보관 기간(archiveDays)과 리포 스스로 찾기(autoOpenRepos). 창 쪽 설정 화면은 P6c가 만들었다.
// P36: P8의 가지 펼치기 상한 셋(branchMaxChildren, branchMaxDepth, branchMaxTotal)을 없앴다. 판 기록에 남은 옛 값은 아래 옛 키처럼 읽지도 보이지도 않는다.
// P33: 옛 새 세션 기본값(claude*, codexArgs 등, launcher-migrate.mjs LEGACY_KEYS)은 호출자(launchers.mjs)로 옮겼다. 옛 키는 판 기록에 남지만(옛 코드로 돌아갈 때) 읽지도 보이지도 않는다.

export const EFFORTS = ['', 'low', 'medium', 'high', 'xhigh', 'max']; // claude --effort. 빈 값이면 넘기지 않는다
export const PERMISSION_MODES = ['manual', 'acceptEdits', 'plan', 'auto', 'dontAsk', 'bypassPermissions'];

export const LANGUAGES = ['en', 'ko']; // P16: 화면 언어. 새 판은 영어
export const WORK_LIGHT = ['on', 'system', 'off']; // P107: 작업 중 테두리 빛(app lib/work-light.js LIGHT_MODES와 같다)

export const SETTINGS = {
  language: { type: 'choice', default: 'en', options: LANGUAGES, label: '화면 언어 (en: 영어, ko: 한국어). 앱 창과 트레이 메뉴에 적용합니다.' },
  tray: { type: 'boolean', default: true, label: '창을 닫아도 트레이에서 실행하며 알림을 표시합니다. 트레이 메뉴에서 백엔드를 시작하거나 중지할 수 있습니다.' },
  // P10: 보관과 리포 스스로 찾기(archive.mjs, recall.mjs). 0일이면 저절로 보관을 끈다(손 보관은 그대로)
  archiveDays: { type: 'number', default: 14, min: 0, max: 365, label: '마지막 활동 이후 지정한 일수가 지난 보드 외부 대화와 닫힌 세션을 자동 보관합니다 (0: 사용 안 함).' },
  autoOpenRepos: { type: 'boolean', default: true, label: '터미널(Claude Code CLI)에서 작업한 Git 저장소를 프로젝트로 자동으로 엽니다.' },
  // P386: 워크트리 위치. 판이 git worktree add로 만드는 워크트리(Claude Code가 아닌 하네스의 atrium child --worktree, 빠른 워크트리 세션)의 자리.
  //   비면 <리포>/.claude/worktrees/<이름>(P321·P382), 채우면 <위치>/<리포 ID>/<이름>(worktree-names.mjs boardWtBase, 리포 ID는 사용자 hook과 같은 꼴). claude -w는 Claude Code·hook이 정한다
  worktreeRoot: { type: 'string', default: '', max: 200, pattern: /^([A-Za-z]:[\\/][^<>:"|?*\r\n]*)?$/, hint: '드라이브로 시작하는 절대 경로(예: E:/worktrees)', label: 'Claude Code가 아닌 하네스의 워크트리를 만들 폴더입니다. 비우면 저장소 안 .claude/worktrees에 만들고, 채우면 <위치>/<리포 ID>/<이름>에 만듭니다.' },
  // P49(R3): Tailscale로 온 요청의 로그인 사용자 제한. 켜져 있으면 이 PC에 로그인한 Tailscale 사용자와 허용 목록만 짝 맺고 연결한다. 이 PC의 창에서만 바꾼다
  remoteSameUser: { type: 'boolean', default: true, label: 'Tailscale을 통한 요청은 이 PC에 로그인한 사용자와 허용 목록의 사용자만 허용합니다.' },
  // P58(S4): 원격 받기. 끄면 이 PC 밖에서 온 요청(바깥 요청, 짝 맺은 기기 연결)을 모두 거부하고 붙은 원격 연결을 닫는다. 이 PC의 창과 CLI는 그대로. Tailscale serve 설정은 건드리지 않는다
  remoteAccess: { type: 'boolean', default: true, label: '원격 접속 허용: 끄면 등록된 기기와 Tailscale을 통한 요청을 모두 차단하고 현재 원격 연결을 종료합니다.' },
  remoteAllowedLogins: { type: 'string', default: '', max: 1000, pattern: /^[A-Za-z0-9._%+@,\s-]*$/, hint: '로그인 이름을 쉼표로 구분하세요', label: '추가로 허용할 Tailscale 로그인 이름입니다. 쉼표로 구분하세요.' },
  // P56(S3): 웹 화면 로그인 세션의 수명. remote*라서 이 PC의 창·CLI만 바꾼다(backend.mjs settings.set)
  remoteSessionHours: { type: 'number', default: 12, min: 1, max: 168, label: '패스키 로그인 후 다시 인증할 때까지의 시간입니다 (시간 단위).' },
  remoteIdleMinutes: { type: 'number', default: 30, min: 5, max: 1440, label: '브라우저 연결이 모두 종료된 뒤 다시 인증할 때까지의 시간입니다 (분 단위).' },
  // P62: 패스키로 확인. 끄면(기본) 짝 맺기만으로 세션을 받고 세션은 짝을 풀 때까지 이어진다(Tailscale 기기 묶기, 쿠키, Origin 확인은 그대로). 켜면 P56~P60처럼 패스키와 12시간·30분 세션
  remotePasskey: { type: 'boolean', default: false, label: '패스키 인증: 켜면 기기 등록 승인 후 패스키를 만들고 세션 종료 시 다시 인증합니다. 끄면 등록된 Tailscale 기기에서 바로 접속할 수 있습니다.' },
  // P69: 새 릴리즈 확인(GitHub, 몇 시간마다와 창을 켤 때). 알리기만 하고 업데이트는 사람이 누른다
  updateCheck: { type: 'boolean', default: true, label: '새 릴리즈를 몇 시간마다 확인하고 알립니다. 업데이트는 직접 눌러야 합니다.' },
  // P70: 업데이트 채널. stable은 정식 릴리즈만, dev는 dev 브랜치의 사전 릴리즈(v<x.y.z>-dev.<n>)도 알린다. 바꾸면 백엔드가 곧바로 다시 확인한다
  updateChannel: { type: 'choice', default: 'stable', options: ['stable', 'dev'], label: '업데이트 채널 (stable: 정식 릴리즈, dev: dev 브랜치에 합친 기능을 먼저 받는 사전 릴리즈).' },
  sleepAfterMin: { type: 'number', default: 30, min: 0, max: 1440, label: '프로젝트 전체에 지정한 시간(분) 동안 활동이 없으면 보드에서 시작한 Claude Code 세션을 모두 절전 모드로 전환합니다 (0: 사용 안 함).' },
  // P111: 세션 하나가 이 시간(분) 동안 쉬면 그 리포가 바빠도 그 세션만 잠재운다(sleep.mjs sessionSleepPlan). 리포 규칙(sleepAfterMin)이 먼저다
  sessionSleepAfterMin: { type: 'number', default: 30, min: 0, max: 1440, label: '세션 하나에 지정한 시간(분) 동안 활동이 없으면 프로젝트의 다른 세션이 작업 중이어도 그 세션만 절전 모드로 전환합니다 (0: 사용 안 함).' },
  // P107: 작업 중 테두리 빛. 보드의 작업 중 세션 노드 둘레와 미션 맵 카드 테두리를 따라 도는 빛. Windows "애니메이션 효과"가 꺼진 PC는 창이 늘 움직임 줄이기라
  // 운영체제 설정만 따르면 보이지 않아 기본은 켬. 창·휴대폰이 문서 뿌리 data-work-light로 받아 CSS가 정한다(app lib/work-light.js). 끔이면 멈춘 상태 색 테두리
  workLight: { type: 'choice', default: 'on', options: WORK_LIGHT, label: '보드의 작업 중 세션 노드와 세션 맵 카드의 테두리를 따라 빛을 돌립니다 (on: 항상, system: 운영체제의 동작 줄이기 설정을 따름, off: 멈춘 테두리만 표시).' },
  // P146: 성능 기록(진단). 켜면 창(데스크톱·웹)이 30초마다 판 움직임 요약(프레임 간격, 긴 작업, 휠 지연, 노드·터미널 수)을 백엔드 로그에 남긴다. 10분 뒤 저절로 꺼진다(perf-trace.mjs)
  perfTrace: { type: 'boolean', default: false, label: '성능 기록: 켜면 10분 동안 보드 움직임의 프레임·지연 요약(값만)을 백엔드 로그에 남깁니다. 시간이 지나면 저절로 꺼집니다.' },
  // P152: 미션 맵 모양(숨은 설정, 창의 설정 화면에 줄이 없다). territories = 영토 지도(기본, 무한 캔버스), classic = P149까지의 열 지도(되돌릴 길)
  // P211: 구독 사용량 알림. 한 한도 창이 90%를 넘으면 그 창이 리셋될 때까지 한 번 알린다(usage.mjs)
  usageAlerts: { type: 'boolean', default: true, label: '구독 사용량 알림: 한 한도 창(5시간·주간 등)이 90%를 넘으면 그 창이 리셋될 때까지 한 번 알립니다.' },
  // P314: 사용량 직접 묻기(usage-probe.mjs). 값이 이 간격보다 낡고 그 구독 세션이 일하지 않으면 하네스 명령으로 묻는다(Codex는 주기적으로, Claude·잔액은 알약을 펼칠 때)
  usageProbe: { type: 'boolean', default: true, label: '사용량 직접 묻기: 값이 낡으면 Codex는 주기적으로, Claude와 키로 읽는 잔액은 사용량 알약을 펼칠 때 각 도구의 사용량 명령으로 묻습니다.' },
  usageProbeMin: { type: 'number', default: 10, min: 2, max: 240, label: '사용량 직접 묻기 간격(분): 마지막 값이 이보다 오래되면 다시 묻습니다.' },
  // P347: Hermes 사용량(usageHermes)은 걷었다. 판 기록에 남은 옛 값은 get()이 읽지 않는다(SETTINGS에 없는 키)
  // P286: 자동 결정 카드. 사람과 직접 일하는 세션이 atrium ask 없이 사람에게 묻는 글로 턴을 끝내면 판이 그 질문으로 "자동" 결정 카드를 만든다(decisions.mjs)
  autoDecisions: { type: 'boolean', default: true, label: '자동 결정 카드: 에이전트가 결정 카드 없이 사람에게 묻는 글로 턴을 끝내면 보드가 그 질문으로 결정 카드를 만듭니다.' },
  // P306: 사람이 목표 레인을 바꾸면(체크·focus·측정값 등) 그 레인의 관리자에게 알리는 때(plan-notify.mjs). 마일스톤이 모두 체크되면 next여도 곧바로 한 번
  planNotify: { type: 'choice', default: 'next', options: ['next', 'now', 'off'], label: '목표 레인을 사람이 바꾸면 그 레인의 관리자 세션에 알립니다 (next: 다음 메시지와 함께, now: 곧바로, off: 알리지 않음).' },
  // P316: 할 일 정리(todo-tidy.mjs). 자동 할 일 카드 후보를 작은 모델(하네스의 헤드리스 실행, 구독)로 걸러 낸다. 끄면 규칙만
  todoTidyMode: { type: 'choice', default: 'on', options: ['on', 'off'], label: '할 일 정리 (on: 자동 할 일 카드 후보를 작은 모델로 걸러 냅니다, off: 규칙만 씁니다).' },
  todoTidyKind: { type: 'choice', default: 'claude', options: ['claude', 'codex'], label: '할 일 정리가 부르는 하네스입니다 (claude: Claude Code claude -p, codex: codex exec).' },
  todoTidyModel: { type: 'string', default: 'haiku', max: 80, pattern: /^([A-Za-z0-9][A-Za-z0-9._:\/\[\]-]{0,79})?$/, hint: '모델 이름(예: haiku)', label: '할 일 정리의 모델입니다. Codex에서 Claude 모델 이름이면 Codex 기본 모델을 씁니다. 런처를 골랐으면 비운 값은 런처의 모델입니다.' },
  todoTidyEffort: { type: 'choice', default: 'low', options: EFFORTS, label: '할 일 정리의 추론 수준입니다 (빈 값: 넘기지 않음).' },
  todoTidyPerHour: { type: 'number', default: 30, min: 0, max: 600, label: '할 일 정리를 한 시간에 부르는 상한입니다. 넘으면 규칙만 씁니다.' },
  // P338: 봇이 쓰는 런처(설정 › 런처의 ID). 비면 옛 키(종류·모델·노력)를 그대로 쓴다. 고르면 하네스·모델·노력이 런처를 따르고, 봇의 모델·노력 키가 비어 있지 않으면 그 값이 덮어쓴다(resolveBotSettings)
  mergerLauncher: { type: 'string', default: '', max: 40, pattern: /^[A-Za-z0-9_-]{0,40}$/, hint: '런처 ID', label: '병합 봇이 쓰는 런처 ID입니다 (빈 값: 아래 종류·모델·노력).' },
  todoTidyLauncher: { type: 'string', default: '', max: 40, pattern: /^[A-Za-z0-9_-]{0,40}$/, hint: '런처 ID', label: '할 일 정리 봇이 쓰는 런처 ID입니다 (빈 값: 아래 하네스·모델·노력). Claude Code·Codex 런처만 씁니다.' },
  missionStyle: { type: 'choice', default: 'territories', options: ['territories', 'classic'], label: '세션 맵 모양 (territories: 영토 지도, classic: 이전 열 지도).' },
  // P267: 합치기 merger(merger.mjs). 브랜치(워크트리)에서 일한 하위가 atrium done ok로 닫으면 판이 그 합치기를 부모 대신 merger 세션에게 맡긴다.
  //   on: 맡긴다, ask(기본): 워크스페이스마다 처음 한 번 사람에게 판 카드로 묻고 답을 기억한다(답이 올 때까지 지금처럼 부모에게), off: 지금처럼 부모에게
  mergerMode: { type: 'choice', default: 'ask', options: ['on', 'ask', 'off'], label: '병합 merger (on: 브랜치에서 일한 워커가 끝나면 보드가 병합을 merger 세션에 맡깁니다, ask: 프로젝트마다 처음 한 번 묻습니다, off: 지금처럼 맡긴 세션이 합칩니다).' },
  // merger의 종류·모델·노력. P275: 그 종류가 설치돼 있지 않으면 설치된 Claude Code(claude-sonnet-5-5, medium), 없으면 Codex(기본 모델, medium). 둘 다 없으면 띄우지 않는다(merger.mjs pickMergerSpawn)
  mergerKind: { type: 'string', default: 'claude', max: 40, pattern: /^[a-z][a-z0-9_-]{0,39}$/, hint: '에이전트 종류(예: claude)', label: 'merger 세션의 에이전트 종류입니다. 이 PC에 설치돼 있지 않으면 Claude Code를, 그것도 없으면 Codex를 씁니다.' },
  mergerModel: { type: 'string', default: 'claude-sonnet-5-5', max: 80, pattern: /^([A-Za-z0-9][A-Za-z0-9._:\/\[\]-]{0,79})?$/, hint: '모델 이름(예: claude-sonnet-5-5)', label: 'merger 세션의 모델입니다. 런처를 골랐으면 비운 값은 런처의 모델입니다.' },
  mergerEffort: { type: 'choice', default: 'medium', options: EFFORTS, label: 'merger 세션의 추론 수준입니다 (빈 값: 넘기지 않음).' },
  // P287: merger의 승인 방식. 빈 값·inherit는 그 합치기를 맡긴 부모의 방식(전과 같음). 목록은 세션 띄우기 창의 승인 방식(PERMISSION_MODES).
  //   고른 종류가 받지 않는 값이면 부모 따름으로 되돌린다(merger.mjs mergerPermissionOf)
  mergerPermission: { type: 'choice', default: '', options: ['', 'inherit', ...PERMISSION_MODES], label: 'merger 세션의 승인 방식입니다 (빈 값: 병합을 맡긴 세션의 방식을 따름).' },
  // P341: 자원 감시(resource-guard.mjs). 판이 띄운 세션의 우선순위 낮추기(자동, 되돌릴 수 있음)와 폭주 감지(배지·할 일 카드)와 그 기준값
  guardLowerPriority: { type: 'boolean', default: true, label: '보드에서 띄운 세션의 프로세스 우선순위를 "보통 이하"로 낮춰 PC의 다른 프로그램이 먼저 돌게 합니다. 끄면 되돌립니다.' },
  guardDetect: { type: 'boolean', default: true, label: '폭주 감지: 세션이 CPU를 오래 많이 쓰거나 메모리가 크거나 계속 늘면 배지를 달고, 쉬는 세션이면 할 일 카드로 알립니다.' },
  guardCpuPct: { type: 'number', default: 90, min: 10, max: 100, label: '폭주 감지 CPU 기준: 코어 하나의 이 비율(%) 이상을 쓰는 시간이 아래 분 이상 이어지면 봅니다.' },
  guardCpuMin: { type: 'number', default: 3, min: 1, max: 120, label: '폭주 감지 CPU 시간(분).' },
  guardMemGB: { type: 'number', default: 3, min: 1, max: 256, label: '폭주 감지 메모리 기준(GB): 세션 하나의 메모리가 이 값 이상이면 봅니다.' },
  guardGrowMin: { type: 'number', default: 10, min: 0, max: 240, label: '폭주 감지 메모리 증가 시간(분): 이 시간 내내 메모리가 늘면 봅니다 (0: 사용 안 함).' },
  guardInstantX: { type: 'number', default: 2, min: 0, max: 20, label: '곧바로 표시 배수: 세션의 CPU가 CPU 기준의 이 배(기본 2 = 코어 둘 가까이)를 넘거나 메모리가 메모리 기준의 이 배를 넘으면 지속 시간을 기다리지 않고 다음 측정에서 배지를 답니다(카드는 지속 기준대로). 0: 사용 안 함.' }, // P348
  guardBgCpuMin: { type: 'number', default: 15, min: 1, max: 240, label: '뒤 작업 CPU 시간(분): 턴이 끝나고 에이전트가 띄운 뒤 작업만 도는 세션은 CPU가 이 시간 동안 기준을 넘어야 폭주 카드를 만듭니다(그 전에는 노란 배지만).' },
  // P114의 숨은 설정 terminalBackend는 P117에서 없앴다. P129·P132: 터미널 백엔드는 herdr-core(hc) 하나다. 판 기록(meta terminalBackend)은 옛 판 옮기기(herdr-migrate)만 쓴다
};
// P313: 보조 에이전트 표(설정 › 에이전트 탭). 판이 쓰는 보조 에이전트마다 이름(id), 사전 묶음(dict), 칸 → 설정 키 묶음.
//   창은 settings.get의 agents(agentsTable)로 이 표를 받아 에이전트마다 같은 꼴의 칸(켬/물어봄/끔·하네스 종류·모델·노력·승인 방식)을 그린다(app lib/agents.js).
//   기본값과 고를 값은 위 SETTINGS에서 온다. 표에 없는 칸은 그리지 않는다. ready false는 자리만(창은 숨긴다, 기능은 다음 일).
//   새 보조 에이전트: SETTINGS에 키 묶음 + 여기 한 줄 + 창 사전 묶음(name·desc·…Hint) + (있으면) 창의 그만의 칸(Agents.jsx AGENT_EXTRAS).
export const AGENT_FIELDS = ['mode', 'launcher', 'kind', 'model', 'effort', 'permission']; // P338: launcher(봇이 쓰는 런처 ID)
export const HELPER_AGENTS = [
  { id: 'merge', dict: 'merger', keys: { mode: 'mergerMode', launcher: 'mergerLauncher', kind: 'mergerKind', model: 'mergerModel', effort: 'mergerEffort', permission: 'mergerPermission' }, ready: true },
  { id: 'todoTidy', dict: 'todoTidy', keys: { mode: 'todoTidyMode', launcher: 'todoTidyLauncher', kind: 'todoTidyKind', model: 'todoTidyModel', effort: 'todoTidyEffort' }, ready: true }, // P316: 할 일 정리(자동 할 일 카드 후보를 작은 모델로 걸러 냄). 시간당 상한은 창의 그만의 칸
];
export function agentsTable() {
  return HELPER_AGENTS.map((a) => ({
    id: a.id, dict: a.dict, ready: !!a.ready,
    fields: AGENT_FIELDS.filter((f) => a.keys[f] && SETTINGS[a.keys[f]]).map((f) => {
      const d = SETTINGS[a.keys[f]];
      return { field: f, key: a.keys[f], default: d.default, ...(d.type === 'choice' ? { options: d.options } : {}) };
    }),
  }));
}

// P338: 봇 설정 풀기(판이 merger·할 일 정리를 띄울 때). 봇의 런처 ID가 있고 그 런처가 있으며 봇이 받는 하네스면 종류 = 런처의 하네스,
//   모델·노력 = 봇 키 값(덮어쓰기)이 있으면 그것, 없으면 런처의 값. 런처가 없어졌거나 ID가 비면 옛 키 그대로(옮기기 걱정 없음). find(id) → 런처 | null
export const BOT_LAUNCHER_KEYS = [
  { launcher: 'mergerLauncher', kind: 'mergerKind', model: 'mergerModel', effort: 'mergerEffort', allowed: null },
  { launcher: 'todoTidyLauncher', kind: 'todoTidyKind', model: 'todoTidyModel', effort: 'todoTidyEffort', allowed: ['claude', 'codex'] },
];
export function resolveBotSettings(set, find) {
  const out = { ...(set || {}) };
  for (const k of BOT_LAUNCHER_KEYS) {
    const id = out[k.launcher];
    if (!id || typeof find !== 'function') continue;
    let l = null; try { l = find(id); } catch { l = null; }
    if (!l || !l.harness || l.harness === 'shell' || l.harness === 'command' || (k.allowed && !k.allowed.includes(l.harness))) continue;
    out[k.kind] = l.harness;
    out[k.model] = out[k.model] || l.model || '';
    out[k.effort] = out[k.effort] || l.effort || '';
  }
  return out;
}

export const DEFAULTS = Object.fromEntries(Object.entries(SETTINGS).map(([k, v]) => [k, v.default]));

// P49: 원격 접속 규칙(remote*: 원격 받기, 사용자 규칙, 세션 수명, P62 패스키로 확인)을 바꾸는 요청인가. 이 PC의 창·CLI만 바꾼다(backend.mjs settings.set)
export const touchesRemoteRules = (p) => !!p && typeof p === 'object' && (Object.keys(p).some((k) => k.startsWith('remote')) || String(p.key || '').startsWith('remote'));

const BOOL = { true: true, false: false, on: true, off: false, '1': true, '0': false, yes: true, no: false };
// 바꿀 값 확인: 모르는 키와 맞지 않는 값은 거부한다. 'on'/'off' 같은 글도 받는다(atrium CLI)
export function normalizePatch(patch) {
  if (!patch || typeof patch !== 'object') throw Object.assign(new Error("변경할 설정을 지정하세요."), { code: 'bad_request' });
  const out = {};
  for (const [k, v] of Object.entries(patch)) {
    const d = SETTINGS[k];
    if (!d) throw Object.assign(new Error(`알 수 없는 설정입니다: ${k}`), { code: 'bad_request' });
    if (d.type === 'boolean') {
      const b = typeof v === 'boolean' ? v : BOOL[String(v).toLowerCase()];
      if (b === undefined) throw Object.assign(new Error(`${k}에는 true 또는 false를 지정하세요.`), { code: 'bad_request' });
      out[k] = b;
    } else if (d.type === 'number') {
      const n = typeof v === 'number' ? v : Number(String(v).trim());
      if (!Number.isInteger(n) || n < d.min || n > d.max) throw Object.assign(new Error(`${k}: ${d.min}~${d.max} 범위의 정수를 입력하세요.`), { code: 'bad_request' });
      out[k] = n;
    } else if (d.type === 'choice') {
      const c = String(v ?? '').trim();
      if (!d.options.includes(c)) throw Object.assign(new Error(`${k}: ${d.options.map((o) => o || '(빈 값)').join(', ')} 중 하나를 지정하세요.`), { code: 'bad_request' });
      out[k] = c;
    } else if (d.type === 'string') {
      const t = String(v ?? '').trim();
      if (t.length > d.max || (d.pattern && !d.pattern.test(t))) throw Object.assign(new Error(`${k}: 유효하지 않은 값입니다 (${d.max}자까지${d.pattern ? `, ${d.hint || '영문·숫자·._:/[]-만'}` : ''})`), { code: 'bad_request' });
      out[k] = t;
    }
  }
  return out;
}

export class Settings {
  constructor({ store, broadcast }) { this.store = store; this.broadcast = broadcast; }
  // 정의에 있는 키만 보인다(옛 키 claude* 등은 판 기록에만 남는다)
  get() { const raw = this.store.getMeta('settings') || {}; return Object.fromEntries(Object.keys(SETTINGS).map((k) => [k, k in raw ? raw[k] : DEFAULTS[k]])); }
  describe() { return Object.fromEntries(Object.entries(SETTINGS).filter(([, v]) => !v.hidden).map(([k, v]) => [k, { type: v.type, default: v.default, label: v.label, ...(v.type === 'number' ? { min: v.min, max: v.max } : {}), ...(v.type === 'choice' ? { options: v.options } : {}), ...(v.type === 'string' ? { max: v.max } : {}) }])); }
  // settings.set { tray: true } 또는 { key: 'tray', value: true }
  set(p) {
    const patch = normalizePatch(p && p.key ? { [p.key]: p.value } : p);
    const next = { ...this.get(), ...patch };
    this.store.setMeta('settings', { ...(this.store.getMeta('settings') || {}), ...next }); // 옛 키는 지우지 않는다
    this.broadcast('settings.updated', next);
    return next;
  }
}
