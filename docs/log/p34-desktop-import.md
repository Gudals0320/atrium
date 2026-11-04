상태: 닫힘
날짜: 2026-11-02

## 지시

### 목표

데스크톱 앱(Claude Code 데스크톱의 Code 탭)의 세션을 판으로 한 번에 가져온다. BRIEF "데스크톱 앱" 행이 말하는 "한 번 옮기기"다. 사용자는 앞으로 CLI(판)에서만 일하려고 하고, 지금 앱에 있는 세션을 판으로 옮기고 싶어 한다. 앱이 그 대화를 쥐고 있을 수 있으므로 같은 대화를 이어 가지 않고 **갈라 연다(포크)**.

먼저 `docs/experiments/E11.md`를 읽는다.
- 메시지 없이 띄운 `--fork-session` 갈래는 디스크에 남지 않는다.
- 원본 대화 기록의 줄마다 `sessionId`만 새 ID로 바꿔 새 파일로 쓰면(파일 갈래) `claude --resume <새 ID>`가 그 대화를 이어 간다.
- 원본 메시지 `uuid`는 그대로 남으므로, 원본의 마지막 답 `uuid`로 갈라 연 시점을 셀 수 있다.

### 사용자와 정한 것

1. 대상은 앱에서 **보관하지 않은** 세션뿐이다. 보관된 것(`isArchived`)은 지운 것과 같아서 목록에도 보이지 않는다.
2. 갈라 열기는 **파일 갈래**로 한다. 판이 원본을 읽어 새 ID 파일을 쓴다. 원본 파일과 앱 데이터는 고치지 않고, 모델도 부르지 않는다.
3. 가져온 세션은 **모두 캔버스**에, 그 리포 영역에 **잠든 노드**로 놓는다(프로세스 없음, P21). 누르면 새 ID로 깨어난다(`claude --resume <새 ID>`, 판의 세션 설정 파일과 hook 포함).
4. 워크트리가 지워진 세션은 **원본 저장소 폴더 쪽**에 갈래를 써서 거기서 이어 간다.
5. 모델, 노력 수준, 권한 모드는 **앱 세션에 기록된 값**을 쓴다. 판이 모르는 값이면 첫 즐겨찾기 Claude Code 호출자(P33)의 값으로 바꾼다.

### 지휘 세션이 정한 기본값

- 앱에서 지금 도는 세션(`~/.claude/sessions/<pid>.json`의 `entrypoint`가 claude-desktop이고 pid가 살아 있음)은 기본으로 고르지 않는다. 고르면 "진행 중인 턴은 빠질 수 있다"고 알린다.
- 장부: 판 DB에 가져오기 기록을 둔다. 열은 앱 세션 ID(`local_` 파일의 `sessionId`), 원본 대화 ID, 세대, 새 대화 ID, 판 세션 ID, 갈라 연 시점(원본 마지막 답 `uuid`, 시각, 줄 수), 제목, 만든 때다. 화면에 표로 보이는 것은 아니다.
- 원본 하나의 상태는 셋이다.
  - 새것
  - 이미 옮김
  - 옮긴 뒤 앱에서 더 씀: 원본에서 시점 `uuid` 뒤로 지시·답이 늘었다. 원본 대화 ID가 바뀌었으면(`priorCliSessionIds`에 옛 ID) 새 ID의 기록에서 센다.
- "이미 옮김"은 다시 옮기지 않는다. "더 씀"을 고르면 새 세대로 다시 갈라 열고, 옛 갈래는 그대로 둔다.
- CLI에서 시작했다가 앱이 가져간 대화(`adoptedFromOtherSurface`)도 같다. 그 대화 ID가 이미 판 세션이면 건너뛴다.
- 이름: 판 세션 이름은 영문·숫자·`-`·`_`만 된다. 워크트리 이름이나 브랜치가 그 글자로만 되어 있으면 그것을, 아니면 `<리포 이름>-<번호>`를 쓴다(겹치면 번호를 올린다). 앱의 제목은 노드에 따로 보인다.
- 대화 기록 파일을 찾지 못하면 "기록 없음"으로 보이고 가져오지 않는다.

### 할 것

1. **원본 읽기.** `convos.mjs`의 `readDesktopSessions`를 넓혀 `local_*.json`에서 필요한 필드를 읽는다.
   - 필드: `sessionId`, `cliSessionId`, `priorCliSessionIds`, `cwd`, `originCwd`, `title`, `model`, `effort`, `permissionMode`, `isArchived`, `isStarred`, `lastActivityAt`, `worktreePath`, `worktreeName`, `branch`, `lastAssistantUuid`, `adoptedFromOtherSurface`.
   - 대화 기록 위치는 `transcriptPathFor(claudeProjects, cwd, cliSessionId)`다.
2. **파일 갈래**(순수 함수와 쓰기 한 곳).
   - 줄마다 `sessionId`만 바꾼다. 줄바꿈으로 끝나지 않은 마지막 조각(쓰는 중)은 넣지 않는다(P29 4번).
   - 새 파일은 `wx`로 써서 있는 파일을 덮지 않는다.
   - 쓰는 곳은 그 세션의 폴더에 해당하는 `~/.claude/projects/<폴더>/`다.
   - 워크트리가 지워졌으면 원본 저장소 폴더의 프로젝트 폴더에 쓴다. 저장소 폴더는 `originCwd`나 git으로 찾는다. 이 경우 대화 기록 안의 `cwd` 값은 옛 워크트리 경로로 남는다. 이렇게 쓴 갈래를 저장소 폴더에서 `--resume`하면 이어지는지 **먼저 가짜 데이터로 시험**한다. 안 되면 방법을 바꾸거나 "폴더 없음"으로 빼고 보고에 적는다.
3. **판 세션 만들기.**
   - 가져온 것마다 판 세션(종류 claude)을 잠든 상태로 만든다. 패널은 없다.
   - 워크스페이스는 그 폴더로 정한다(G1). 지워진 워크트리는 저장소 폴더다.
   - 깨우기는 P21 깨우기 길을 그대로 탄다. 모델·노력 수준·권한 모드는 위 결정 5다.
   - 노드 자리는 리포 영역 안 빈자리이고, 제목을 보인다.
4. **API와 CLI.**
   - 가져올 후보 목록: 상태, 리포, 제목, 마지막 활동, 지금 도는지, 폴더·기록이 있는지.
   - 가져오기: 고른 것을 받고 결과를 돌려준다.
   - CLI: `atrium import-desktop --list`, `atrium import-desktop --all`(기본 고름만).
   - 이름은 네가 정하고 ARCH API 표 행을 보고에 적는다.
5. **창.** "데스크톱 앱에서 가져오기" 창을 둔다. 자리는 네가 정한다(예: 사이드바나 리포 열기 옆). 가져올 때마다 다시 연다.
   - 리포별 목록, 상태 글, 기본 고름(새것과 더 씀, 지금 도는 것은 뺌), 모두 고르기·풀기를 둔다.
   - 진행 표시와 결과 요약(가져옴, 건너뜀과 까닭)을 보인다.
   - 영어·한국어 모두, P28 원칙대로 창 최소 크기에서 스크롤 없이.

### 안전(반드시)

- 개발과 시험에서는 사용자의 **실제 데스크톱 앱 데이터와 실제 대화를 쓰지 않는다.** CLAUDE.md의 실험 규칙 그대로다.
- 가짜 앱 목록 폴더(`ATRIUM_CLAUDE_DESKTOP=<워크트리>/backend/.dev/desktop`)에 `local_*.json`을 만들어 쓴다. 원본 대화는 새 시험 폴더(`C:\Workspace\mtask-p34-*`)에서 `claude -p --model haiku`로 짧게 만든다. 부모 세션의 Claude 환경 변수는 빼고 띄운다.
- `ATRIUM_CLAUDE_DESKTOP`을 주지 않으면 기본값이 실제 앱 폴더라, 개발용 판에서 실제 세션이 목록에 뜨고 잘못 누르면 실제 대화의 갈래가 생긴다. 그래서 **개발용 프로필에서는 가져오기를 막는다.** `ATRIUM_CLAUDE_DESKTOP`을 따로 주었고 그 폴더가 데이터 폴더 안일 때만 허용한다. 이 막기를 단위 시험한다.
- 갈래 파일은 새로 쓰기만 한다. 기존 대화 기록과 앱 파일은 고치거나 지우지 않는다.

### 완료 기준

1. 단위 시험.
   - 파일 갈래: `sessionId` 바꾸기, 쓰는 중인 마지막 줄 빼기, 덮지 않기.
   - 후보 상태: 새것, 옮김, 더 씀, 지금 돎, 기록 없음, 폴더 없음, 보관 제외.
   - 이름 짓기, 앱 설정 값 옮기기, 장부(중복 막기, 세대), 개발용 프로필 막기.
2. 개발용 판의 창 시험(e2e)으로 확인하고 스크린숏을 남긴다. 가짜 앱 세션 넷 이상을 쓴다: 같은 폴더, 워크트리 있음, 워크트리 지워짐, 보관됨.
   - 목록과 상태가 보이고, 보관됨은 보이지 않는다.
   - 가져오면 리포 영역에 잠든 노드와 제목이 놓인다.
   - 하나를 깨워 haiku로 "지금까지 한 답"을 물으면 원본 대화를 기억한다.
   - 원본을 `claude -p --resume`으로 한 턴 더 이어 가면 "더 씀"이 보이고, 다시 가져오면 2세대가 생긴다.
   - 지워진 워크트리 세션이 저장소 폴더에서 이어진다(안 되면 그 결과).
   - 개발용 프로필에서 `ATRIUM_CLAUDE_DESKTOP` 없이 가져오기를 부르면 거부된다.
3. `cd backend && npm test`, `cd app && npm test`, `cd app && npm run build`가 통과한다.

### 시험 환경

- 너만의 개발용 판으로 띄운다(`docs/testing.md`).
  - `ATRIUM_HERDR_SESSION=atrium-dev-p34`, `ATRIUM_PORT=47852`
  - `ATRIUM_DATA_DIR=<워크트리>/backend/.dev/data`, `ATRIUM_APP_USERDATA=<워크트리>/backend/.dev/app`
  - `ATRIUM_CLAUDE_PROJECTS`는 시험 폴더의 프로젝트 폴더만, `ATRIUM_CLAUDE_DESKTOP`은 위 가짜 폴더다.
- 실제 판(`atrium`, 47800)과 47811~47851은 쓰지 않는다.
- 끝나면 시험 세션, 창, 백엔드, herdr 서버와 세션, 시험 폴더, 시험 대화 기록(가져오기로 만든 갈래 파일 포함)을 끄고 지운다.

### 지킬 것

- `CLAUDE.md`를 따른다. 프로세스는 직접 띄운 것만 PID로 끈다. 신뢰 확인은 대신 수락하지 않는다.
- 자기 브랜치에만 커밋한다. 커밋 메시지에 `Co-Authored-By` 줄을 넣지 않는다. `main`을 바꾸거나 푸시하지 않는다. `node_modules`는 워크트리 안에서 받는다(`npm ci`).
- `docs/ARCH.md`, `docs/BRIEF.md`는 고치지 않는다. 바뀐 구조, 고쳐야 할 ARCH 행, BRIEF "데스크톱 앱" 행 새 문장은 보고 절에 적는다. 문서는 이 작업 파일의 작업 기록 절과 보고 절만 고친다.
- 끝나면 보고 절을 쓰고, 맨 마지막에 `<워크트리>/backend/.dev/p34.done`(브랜치 이름과 마지막 커밋 해시 두 줄)을 만든다.

### 읽을 파일

- `CLAUDE.md`, `docs/BRIEF.md`("데스크톱 앱", "판 밖 대화" 행), `docs/testing.md`, `docs/experiments/E11.md`
- `docs/ARCH.md` 4절 D4(잠재우기), G1, J3·J4·J6
- `backend/src/convos.mjs`(앱 목록, 묶임 판정), `recall.mjs`(다시 열기), `sleep.mjs`(깨우기), `launch.mjs`(`transcriptPathFor`, resume 인자), `launchers.mjs`, `missed.mjs`
- `app/test/e2e/p9-guard.mjs`(시험 판 막기)

## 작업 기록

2026-11-02, P34 작업자 세션(워크트리 `p34`, 브랜치 `worktree-p34`).

- 지시와 읽을 파일을 읽었다. 판 세션을 잠든 채로 만드는 길은 따로 없어서, `recall.mjs bring()`의 세션 행 만들기를 본떠 패널 없이 `rt.sleep`만 둔 세션을 만들기로 했다. 판 세션 ID를 새 대화 ID와 같게 두면 `sleep.mjs convoOf`가 그대로 `--resume <새 ID>`를 고른다(깨우기 길을 고치지 않는다).
- **먼저 한 시험(지워진 워크트리).** 새 시험 폴더 `C:\Workspace\mtask-p34-exp\.claude\worktrees\wt1`에서 `claude -p --model haiku --session-id A`로 "PINEAPPLE을 외워라"를 한 턴 했다. 줄마다 `sessionId`만 B로 바꿔 `~/.claude/projects/C--Workspace-mtask-p34-exp/B.jsonl`(저장소 폴더 쪽)에 `wx`로 쓰고, 워크트리 폴더를 지운 뒤 `C:\Workspace\mtask-p34-exp`에서 `claude -p --resume B`로 외운 말을 물었더니 "PINEAPPLE"이었다. 대화 기록 안의 `cwd`가 옛 워크트리 경로여도 이어진다. 시험 폴더와 대화 기록 폴더 둘은 바로 지웠다. 이 길로 정했다. 덧붙여, claude가 프로젝트 폴더마다 `memory` 폴더를 만든다.
- 부모 Claude 환경 변수를 빼고 claude를 띄우는 셸 명령(`env -u …`)은 워크트리 격리 검사가 막아서, 환경을 지운 뒤 `spawnSync('claude')`하는 작은 node 스크립트로 띄웠다(시험 도구 `fixtures.cjs`의 `claudeP`).
- 구현 순서: 장부 표(`store-imports.mjs`) → 앱 목록 필드(`convos.mjs desktopInfoOf`, `listDesktopSessions`) → `desktop-import.mjs`(순수 함수와 판 붙이기) → 단위 시험 → CLI → 창. 백엔드 단위 시험 295개, 창 87개 통과.
- 단위 시험 하나가 처음에 실패했다. 시험 자료가 서로 다른 대화에 같은 `uuid`(a0)를 써서 "대화 ID가 바뀌었을 때"를 잘못 흉내 냈다. 시험 자료를 고쳤다(코드는 그대로).
- 창 시험 자료: git이 아닌 시험 폴더 `C:\Workspace\mtask-p34-repo`와 그 아래 가짜 워크트리 폴더 둘(`wt-alive`, `wt-gone`). git 저장소로 만들면 신뢰 대화상자가 떠서(testing.md) 워크트리는 폴더로만 흉내 냈다. 그래서 git이 아닌 워크트리 폴더가 따로 워크스페이스가 되는 것을 막으려고, git이 아닌 폴더가 앱의 `originCwd` 아래면 그 원본 폴더의 워크스페이스로 놓게 했다(`wsFor`). 진짜 git 워크트리는 `workspaceOf`가 본 저장소로 푼다.
- 창 시험 1회차는 22개 모두 통과로 나왔지만 4·5번이 거짓 통과였다. 가져온 노드는 원본의 마지막 답("OK ALPHA")을 이미 보이므로, 새 답을 기다리지 않고 그 글에 걸렸다. 보낸 뒤의 답(`lastAnswerAt`)만 보게 고치고, 2세대가 더 쓴 턴(GOLF)을 아는지도 더해 다시 돌렸다(23개 통과). 1회차 기록은 `experiments/p34/p34-import-run1.txt`로 남겼다. 1회차가 원본 `same`에 GOLF 턴을 더했기 때문에 2회차의 1세대 답은 "ALPHA GOLF"다.
- 1회차 시험 프로세스는 창을 닫은 뒤에도 끝나지 않아(남은 핸들) 그 node PID 둘만 껐다. 시험 끝에 `process.exit`를 넣었다. 그때 떠 있던 electron 세 개는 시험보다 먼저 뜬 다른 판의 것이라 건드리지 않았다.

## 보고

### 만든 것

**백엔드**

- `backend/src/desktop-import.mjs`(새 파일).
  - 순수 함수: `forkText`(줄마다 `sessionId`만 바꾸고 줄바꿈 없는 마지막 조각은 뺌, 시점 = 마지막 답 `uuid`·시각·줄 수), `countSince`(시점 뒤 지시·답 수. 같은 대화는 시점과 넣은 줄 수 가운데 뒤의 것부터, 대화 ID가 바뀌었으면 새 기록에서 시점 뒤, 시점이 없으면 처음부터), `candidateStatus`, `defaultPick`, `importName`, `launchValues`, `importAllowed`, `folderPlan`.
  - `DesktopImport`: `desktop.list`, `desktop.import`, 노드에 보일 `imported { from, title, gen, at }`(세션 요약에 더함). 가져오기는 한 번에 하나씩 돈다(장부 중복 막기). 갈래 파일은 `wx`로 쓰고, 판 세션을 만들지 못하면 방금 쓴 갈래만 지운다.
  - 판 세션: 종류 claude, `origin board`, 세션 ID = 새 대화 ID, 패널 없음, `rt.sleep = { by: 'import' }`, 마지막 지시·답은 갈래에서 읽어 둔다. 설정 파일·hook 토큰·이어 가기 인자는 다시 열기(`bring`)와 같다. `spawn` 이벤트에 `imported: true`를 남긴다(다시 열기가 `allowHerdr`를 읽는 곳).
  - 폴더: 대화 기록은 `cwd`, `worktreePath`, `originCwd` 순으로 그 폴더의 프로젝트 폴더에서 찾는다. 폴더가 없으면 `originCwd` → `<저장소>/.claude/worktrees/<이름>`의 저장소 → 남아 있는 위 폴더의 git 루트 순으로 저장소 폴더를 찾는다. 모두 없으면 "폴더 없음".
  - 이름: 워크트리 이름, 그다음 브랜치가 `^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$`이면 그것(겹치면 `-2`…), 아니면 `<리포 이름>-<번호>`(리포 이름의 다른 글자는 `-`로).
  - 앱 설정 값: 모델은 호출자 모델 목록이나 `claude-*`, `haiku|sonnet|opus|fable|opusplan`(`[1m]` 포함)이면 그대로, `default`면 지정하지 않는다. 노력 수준은 `EFFORTS`, 권한 모드는 `PERMISSION_MODES`(앱의 `default`는 `manual`). 그 밖의 값과 빈 값은 첫 즐겨찾기 Claude Code 호출자의 값을 쓴다. 바꾼 칸은 결과의 `replaced`에 적는다.
  - 상태 판정 순서: 판 세션인 대화(`onBoard`) → 기록 없음 → 옮긴 뒤 안 씀(`imported`) → 폴더 없음 → 옮긴 뒤 더 씀(`more`) / 새것(`new`). 보관된 것은 목록에서 뺀다. "도는 중"은 상태와 따로 둔 표시(`running`, `runningWhere`)다. 세션 파일의 살아 있는 pid가 앱이면 `desktop`, 아니면 `terminal`이다.
- `backend/src/store-imports.mjs`(새 파일): 표 `desktop_imports`(앱 세션 ID, 세대, 원본 대화 ID, 새 대화 ID, 판 세션 ID, 시점 `uuid`·시각·줄 수, 제목, 만든 때). PK는 (앱 세션 ID, 세대)다.
- `convos.mjs`: `desktopInfoOf`(지시의 17개 필드, 없는 것은 null), `listDesktopSessions`(보관 포함 전부, `readDesktopSessions` 캐시를 그대로 씀). `readDesktopSessions`의 반환 모양은 그대로다.
- `config.mjs`: `desktopExplicit`(`ATRIUM_CLAUDE_DESKTOP`을 따로 주었는가, `none`은 아님).
- `sleep.mjs`: `wakeRepo`는 가져와서 한 번도 깨지 않은 세션(`sleep.by === 'import'`)을 함께 깨우지 않는다. 그 노드를 누르거나 그 세션에 글을 보낼 때만 깬다. 수십 개를 가져온 리포에서 노드 하나를 누르면 모두 뜨는 일을 막는다. 한 번 깬 뒤에는 보통 세션과 같다.
- `backend.mjs`: 붙이기 두 줄, 세션 요약에 `imported`.
- CLI: `atrium import-desktop --list`, `atrium import-desktop --all`, `atrium import-desktop <앱 세션 ID>...`(`--json`도 받는다).

**창**

- `DesktopImport.jsx`(새 파일): "데스크톱 앱에서 가져오기" 창. 리포 열기 창(위쪽 `+`)의 단추 "데스크톱 앱에서 가져오기…"로 열고, 열 때마다 목록을 새로 읽는다. 리포별 목록, 상태 글(옮긴 이름과 세대, 더 쓴 지시·답 수), 앱에서 도는 표시, "워크트리 없음 → 저장소 폴더" 표시, 마지막 활동, 기본 고름, 모두 고르기·풀기, 도는 것을 고르면 알림, 진행 표시(`desktop.import.progress` 이벤트), 결과 요약(가져옴·건너뜀과 까닭)을 보인다. 창은 고정 크기(최대 760×540)이고 목록 칸만 스크롤한다.
- `SessionNode.jsx`: 머리에 "앱에서 옴" 표시(마우스를 올리면 앱 제목과 세대), 잠든 얼굴에 앱 제목 한 줄.
- 사전: `desktopImport.*`, `node.imported*`, `backend.desktopImportBlocked`(영어·한국어).

**시험**

- 단위: `backend/test/p34.test.mjs` 13개(파일 갈래, 시점 세기, 후보 상태 일곱, 기본 고름, 이름, 앱 설정 값, 개발용 프로필 막기, 후보 목록, 가져오기·장부·중복 막기·2세대, 덮지 않기, 판 세션인 대화, 막힌 판, 앱 목록 읽기, 폴더 찾기). `cd backend && npm test` 295개, `cd app && npm test` 87개 통과, `npm run build` 통과.
- 창 시험: `app/test/e2e/p34-import.mjs`, `node experiments/p34/tools/e2e.cjs p34-import.mjs`. 23개 통과(`experiments/p34/p34-import.txt`, 스크린숏 `p34-*.png`). 가짜 앱 세션 다섯(같은 폴더, 워크트리 있음, 워크트리 지워짐, 보관됨, 앱에서 도는 중).
  - 목록에 넷이 보이고 보관됨은 없다. 기본 고름에서 도는 것은 빠진다.
  - 가져오면 한 리포 영역에 잠든 노드 셋이 놓이고 앱 제목이 보인다. 이름은 `wt-alive`, `wt-gone`, `mtask-p34-repo-1`이다.
  - 하나를 깨우면 그것만 깨고, 물으면 원본의 낱말(ALPHA)을 답한다. 지워진 워크트리 세션은 저장소 폴더에서 이어져 CHARLIE를 답한다.
  - 원본을 `claude -p --resume`으로 한 턴 이으면 "더 씀(+1 지시, 1 답)"으로 보인다. 다시 가져오면 2세대(`mtask-p34-repo-2`)가 생기고, 그 세션은 더 쓴 턴까지 안다. 옛 갈래와 1세대 세션은 그대로다.
  - 최소 창(900×600)에서 영어·한국어 모두 창 틀이 넘치지 않는다.
  - 데이터 폴더 밖의 앱 폴더로 켠 개발용 판은 목록과 가져오기를 거부하고, 창에 까닭이 보인다.
- 시험 도구: `experiments/p34/tools/`(`env.cjs` 판 값, `mt.cjs` CLI, `e2e.cjs`, `fixtures.cjs`: 원본 대화와 가짜 앱 목록 만들기·이어 가기·지우기).

### API 표 행(ARCH 6절에 더할 것)

| 판 API | herdr 호출이나 출처 |
|---|---|
| `desktop.list` | 데스크톱 앱 세션 목록(`local_*.json`, 보관 제외)과 대화 기록, 장부. 리포별 후보(`status`: new·imported·more·onBoard·noTranscript·noFolder, `running`, `pick`, `folder`: same·repo·missing, `more`). 막힌 판은 `import_blocked` |
| `desktop.import { ids \| all }` | 고른 앱 세션(또는 기본 고름 전부)을 파일 갈래로 쓰고 잠든 판 세션으로 만든다 → `{ imported, skipped: [{ reason }] }`. 진행은 이벤트 `desktop.import.progress { done, total, name }` |

### 고쳐야 할 ARCH 행과 문장(제안이 아니라 바뀐 구조)

- 5절 모듈 표에 "데스크톱 앱 가져오기" 행이 필요하다: `desktop-import.mjs`(파일 갈래, 후보 상태, 이름, 앱 설정 값, 개발용 프로필 막기), 표 `desktop_imports`는 `store-imports.mjs`, 앱 목록 필드는 `convos.mjs listDesktopSessions`. 창은 `DesktopImport.jsx`.
- 4절 D4의 "잠든 리포의 노드를 누르거나 그 리포에 글을 보내면 리포 전체를 … 깨우고" 문장: 가져와서 한 번도 깨지 않은 세션은 리포를 깨울 때 빠진다(눌렀거나 글을 받은 그 세션만 깬다).
- 4절 J4의 "갈라 열기(`--fork-session`)는 하지 않는다" 문장: 판 밖 대화 이어 가기에는 그대로 맞다. 데스크톱 앱 가져오기만 파일 갈래로 갈라 연다.

### BRIEF "데스크톱 앱" 행의 새 문장(안)

> 판은 데스크톱 앱 세션을 캔버스에 보여주지 않는다. 대신 "데스크톱 앱에서 가져오기"로 앱에서 보관하지 않은 세션을 한 번에 판으로 옮긴다. 앱이 그 대화를 쥐고 있을 수 있으므로 같은 대화를 이어 가지 않고 갈라 연다. 판이 대화 기록을 새 ID로 복사하고(파일 갈래, E11), 원본과 앱 데이터는 고치지 않는다. 가져온 세션은 그 리포 영역의 잠든 노드가 되고, 누르면 새 ID로 깬다. 워크트리가 지워진 세션은 저장소 폴더에서 잇는다. 모델·노력 수준·권한 모드는 앱의 값을 쓰고, 판이 모르는 값은 첫 즐겨찾기 Claude Code 호출자의 값으로 바꾼다. 옮긴 뒤 앱에서 더 쓴 세션은 다시 가져오면 새 세대로 갈라 열린다(2026-11-02, P34).

### 계획과 다른 곳

- 개발용 프로필 막기의 허용 범위: 지시는 "데이터 폴더 안"이지만, 지시가 정한 가짜 폴더(`backend/.dev/desktop`)는 데이터 폴더(`backend/.dev/data`) 밖이다. 그래서 데이터 폴더 안 **또는** `backend/.dev` 안을 허용한다.
- 창 시험의 막기 확인은 `ATRIUM_CLAUDE_DESKTOP` **없이**가 아니라 데이터 폴더 **밖**의 폴더로 했다. 앱 폴더 값이 없으면 판의 기존 묶임 판정(`recall.mjs`)이 실제 앱 폴더를 읽는다. 이 작업은 실제 앱 데이터를 읽지 않기로 했으므로 그런 판을 띄우지 않았다. 환경 변수가 없을 때 막히는 것은 단위 시험(`loadConfig`에서 `dev_default_dir`)으로 확인했다.
- 지시의 장부 열 "판 세션 ID"와 "새 대화 ID"는 지금 같은 값이다(세션 ID = 새 대화 ID). 둘 다 적는다.
- 지시에 없던 것: 가져와서 한 번도 깨지 않은 세션은 리포 깨우기에서 빠진다(위 `sleep.mjs`). 그리고 git이 아닌 폴더가 앱의 원본 폴더 아래면 그 원본 폴더 워크스페이스에 놓는다(`wsFor`).
- 창의 자리는 리포 열기 창 안의 단추다. 사이드바에는 두지 않았다.

### 알려진 문제

- 앱 세션 파일의 필드 모양(특히 `worktreePath`, `worktreeName`, `branch`, `lastActivityAt`의 형식)은 실제 파일을 보지 않고 지시의 필드 이름과 `docs/research/data-sources.md`대로 읽었다. 숫자 시각과 ISO 글을 모두 받는다. 실제 앱 파일에서 이름이 다르면 그 칸은 비고, 폴더는 `cwd`·`originCwd`로 찾는다. 실제 판에서 처음 쓸 때 `atrium import-desktop --list`로 먼저 보는 것이 좋다.
- 시험은 git이 아닌 가짜 워크트리 폴더로만 했다. 진짜 git 워크트리(본 저장소 워크스페이스로 풀림, P27 워크트리 영역)와, 지워진 워크트리의 git 루트 찾기는 단위 시험(가짜 git 함수)으로만 확인했다.
- "더 씀" 판정은 원본 대화 기록을 통째로 읽는다. 앱 세션이 많고 기록이 크면 목록을 여는 데 시간이 걸릴 수 있다(이미 옮긴 세션만 읽는다).
- 창의 영어 "(+1 prompts, 1 answers)"는 복수형을 가리지 않는다.
- 창 시험에서 남은 1회차 갈래 파일이 2회차 판에 "판 밖 대화" 노드 하나로 보였다(데이터 폴더를 비우고 다시 켰기 때문). 시험 자료 정리로 모두 지웠다. 실제 판에서는 장부와 세션 행이 남아 생기지 않는다.
- `~/.claude.json`에 시험 폴더의 프로젝트 항목이 claude에 의해 생겼을 수 있다. 사용자 설정 파일이라 고치지 않았다.

### 정리

- 시험 세션 넷은 시험이 껐다(깬 둘은 `/exit`, 잠든 둘은 패널 없이 닫음). 창은 시험이 닫았다. 판을 다시 켜 `herdr stop --yes`, `backend stop`을 하고 `herdr session delete atrium-dev-p34`로 지웠다. 다른 herdr 세션(`atrium`, `atrium-dev-p35` 등)은 건드리지 않았다.
- `fixtures.cjs clean`으로 시험 폴더 `C:\Workspace\mtask-p34-repo`, `C:\Workspace\mtask-p34-desk-outside`, 대화 기록 폴더 셋(`C--Workspace-mtask-p34-repo`, `…-wt-alive`, `…-wt-gone`. 원본과 가져오기가 만든 갈래 파일이 모두 들어 있다), 가짜 앱 목록, 가짜 세션 파일을 지웠다. 먼저 한 시험의 폴더와 대화 기록은 그때 지웠다.
- 이 워크트리 경로, `atrium-dev-p34`, `mtask-p34`가 명령줄에 든 프로세스는 없다. `backend/.dev/data`, `backend/.dev/app`은 git이 무시하므로 남겼다.
