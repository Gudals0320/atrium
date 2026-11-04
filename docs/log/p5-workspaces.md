상태: 닫힘
날짜: 2026-10-30

## 지시

### P5 작업 지시: 리포지토리 워크스페이스(옛 `docs/briefs/P5.md`)

2026-10-30에 작업자 CLI 세션에 맡기려고 쓴 지시다. 이날 사용자가 "리포지토리 하나를 워크스페이스 하나로 보고, 그 안에 열린 CLI 세션을 처음부터 모두 보여주는 오버뷰"를 요청했다. 정한 내용은 `docs/BRIEF.md` 3절 "워크스페이스"·"일반 셸" 줄과 `docs/PLAN.md` 4절 G, 7절 P5에 있다.

#### 먼저 읽을 것

- `CLAUDE.md`, `docs/BRIEF.md`, `docs/PLAN.md`(특히 0절, 4절 F·G, 6절, 7절 P5, 8절, 9절)
- `docs/P4.md`(바로 앞 단계의 구성과 알려진 문제), 필요하면 `docs/P1.md`~`docs/P3.md`
- herdr 프로토콜 스키마 `experiments/p4/schema.json`: `pane.created`, `pane.closed`, `pane.exited`, `pane.list`, `pane.process_info` 등
- `backend/`와 `app/` 코드

#### 할 일

PLAN 7절의 P5를 만든다. 요약하면 다음과 같다.

- 리포지토리 하나가 워크스페이스 하나다. 기준은 세션을 시작한 폴더의 git 공통 폴더(`--git-common-dir`)라서 워크트리는 본 저장소와 같은 워크스페이스다. git 저장소가 아닌 폴더는 그 폴더가 워크스페이스다.
- 워크스페이스마다 판 하나를 둔다. 위쪽 워크스페이스 줄에서 고른다. 판에 들어가면 그 워크스페이스의 세션이 모두 화면에 들어오게 맞추고, 명령 바 위에 세션 줄을 늘 띄운다. 불러야 보이는 목록이 아니다.
- 판 전용 herdr 세션 안의 모든 패널을 보여준다. 에이전트 세션(판이 띄운 것, 에이전트가 띄운 것)과 에이전트 없는 일반 셸(PowerShell)이다. 판 밖에서 연 세션은 다루지 않는다.
- 내 차례 칩, `N`, OS 알림은 모든 워크스페이스를 가로지른다.

herdr 작업 공간은 지금처럼 세션마다 하나씩 쓴다. 리포지토리 단위로 바꾸지 않는다. 문서에서 "워크스페이스"는 판의 리포지토리 단위, "작업 공간"은 herdr의 것이다. 코드 이름이 헷갈리지 않게 한다(지금 코드의 `workspaceId`는 herdr 작업 공간 ID다).

#### 완료 기준

PLAN 7절 P5의 다섯 가지다. 개발용 프로필에서 실제 세션으로 확인한다. 시험할 수 없는 항목은 이유와 사람이 확인할 점검표를 남긴다.

1. **G1 워크스페이스로 묶기:** 세션이 시작 폴더의 리포지토리별 워크스페이스로 나뉘고, 위쪽 워크스페이스 줄에 세는 값(세션, 작업 중, 내 차례, 검토 대기)과 함께 보인다. 워크트리에서 띄운 세션은 본 저장소 워크스페이스에 있다. git 저장소가 아닌 폴더도 워크스페이스가 된다. 세션이 다른 저장소로 `cd`해도 워크스페이스는 그대로이고 노드 표시만 바뀐다. "+ 리포 열기"로 빈 워크스페이스를 만들고, 빈 워크스페이스는 닫을 수 있다.
2. **G3 늘 보이는 오버뷰:** 워크스페이스를 고르면 그 판으로 바뀌고 세션이 모두 화면에 들어온다. 세션 줄이 늘 보이고, 화면 밖에 있거나 새로 생긴 세션도 세션 줄에 있다. 새 세션이 생겨도 사람이 보는 화면을 저절로 옮기지 않는다.
3. **G2 일반 셸:** 새 세션 대화상자로 띄운 셸과, 에이전트가 `herdr pane split`만 하고 둔 빈 패널이 셸 노드로 보이고 실행 중인 명령이 보인다. 셸에서 에이전트를 띄우면 같은 노드의 종류가 바뀐다(새 노드가 생기지 않는다). 셸에 `@`로 보내면 `not_agent`로 거부된다. 셸의 터미널 입력과 끄기가 된다.
4. **G4 워크스페이스 가로지르기:** 내 차례 칩과 `N`이 다른 워크스페이스의 세션으로 데려간다(워크스페이스를 바꾸고 노드로 감). 다른 워크스페이스로 가는 연결(P4)이 노드에 표시되고, 누르면 그쪽으로 간다. `@all`은 지금 워크스페이스의 에이전트 세션에만 간다.
5. **이전 판 옮기기:** P4까지 쓰던 `board.db`가 워크스페이스로 옮겨지고 노드 자리, 그룹, 연결이 남는다. 창과 백엔드를 다시 띄워도 워크스페이스, 배치, 마지막에 본 워크스페이스가 남는다.

Codex 같은 다른 에이전트 종류의 턴은 따로 검증하지 않는다(2026-10-30 사용자 결정).

#### 시험 환경

- **따로 띄운 개발용 판을 쓴다.** 기본 개발용 판(herdr 세션 `multitask-dev`)에는 사용자가 직접 띄운 세션 `s1`이 있다. 그 판과 `s1`은 건드리지 않는다. 글 보내기, 답하기, 끄기, 이어 가기를 하지 않고, 그 herdr 서버를 끄거나 그 세션을 지우지 않는다.
- 시험은 `--dev`에 환경 변수를 더해 띄운다. 백엔드, `mtask`, 창 모두 같은 값을 쓴다.
  - `MTASK_HERDR_SESSION=multitask-dev-p5`
  - `MTASK_PORT=47812`
  - `MTASK_DATA_DIR=<저장소>/backend/.dev/p5/data`
  - 창은 `MTASK_APP_USERDATA`도 따로 준다(예: `backend/.dev/p5/app`).
- **기본 개발용 `backend/.dev/data/board.db`는 복사해 쓰지 않는다.** 그 안의 `s1`을 판의 복구(C3)가 새 herdr 세션에서 이어 갈 수 있다. 완료 기준 5의 "이전 판"은 직접 만든다. 예: 커밋 `d2be610`(P4)을 `mtask-test/p4-base` 브랜치의 임시 워크트리로 꺼내 그 코드로 같은 시험 데이터 폴더에 세션 몇 개를 만들고 끈 뒤, 새 코드로 연다. 단위 시험에는 P4 스키마로 만든 고정 자료를 쓴다.
- **시험 폴더**
  - multitask 저장소 쪽 워크스페이스: `backend/.dev/p5/proj`(저장소 안, git이 무시하는 폴더). Claude Code를 띄워도 신뢰가 물려온다.
  - git 저장소가 아닌 워크스페이스: `C:\Workspace\mtask-p5-plain` 같은, 어떤 저장소에도 속하지 않는 폴더. `C:\Workspace`의 신뢰가 물려온다.
  - 다른 리포지토리와 그 워크트리: `backend/.dev/p5/repos/` 아래에 `git init`으로 만든다. 이런 폴더는 git 최상위라 Claude Code가 신뢰 대화상자를 띄운다. **신뢰 대화상자는 수락하지 않는다.** 그런 워크스페이스에는 셸 세션을 쓰고, Claude Code 세션은 신뢰 대기 카드가 뜨는 것까지만 본다.
  - 사용자의 다른 프로젝트 폴더에서는 세션을 띄우지 않는다.
- 시험용 Claude Code 세션은 `--model haiku`로 띄우고 턴은 "Reply with exactly: …" 수준으로 아주 짧게 한다.
- 창은 Playwright의 Electron 지원이나 CDP로 조작하고 스크린숏을 찍는다. 스크린숏과 로그는 `experiments/p5/`에 둔다. 따로 띄운 판이라 사용자의 세션은 화면에 나오지 않아야 한다. 나오면 가린다.
- 백엔드와 창의 기존 단위 시험은 계속 통과해야 한다. 새 코드(워크스페이스 키 정하기, 경로 대소문자, 워크트리, git이 아닌 폴더, 판 옮기기, 셸 거부, `@all` 범위)에는 시험을 더한다.

#### 규칙

- `CLAUDE.md`를 따른다. 실제 판의 값(`multitask`, 47800, `%LOCALAPPDATA%\multitask`)으로는 띄우지 않는다.
- 시험 에이전트에게 주는 지시에 `herdr --session`, `--machine`, `--remote`를 쓰게 하지 않는다. herdr 소켓 API의 `pane.split`은 `target_pane_id`로 대상을 준다.
- multitask 저장소에 워크트리나 브랜치를 만들어야 하면 이름을 `mtask-test/`로 시작하게 하고, 끝나면 워크트리와 브랜치를 모두 지운다. 커밋, 푸시, `main` 변경은 하지 않는다.
- 데스크톱 앱 세션과 기존 세션은 건드리지 않는다. 직접 띄운 프로세스만 PID로 끈다. `~/.claude/settings.json`, `~/.agents/skills`, `~/.codex`는 고치지 않는다.
- symvibe는 화면 구성과 동작만 참고한다. OpenCove 파일을 가져오면 `CLAUDE.md`의 MIT 고지 규칙을 지킨다.
- 끝나면 시험 세션을 끄고, 창을 먼저 닫고, 따로 띄운 백엔드와 herdr 서버(`multitask-dev-p5`)를 멈추고, 그 herdr 세션을 지운다. `backend/.dev/p5/`, `C:\Workspace\mtask-p5-plain`, 임시 워크트리와 `mtask-test/` 브랜치도 지운다. 기본 개발용 판(`multitask-dev`)은 그대로 둔다.
- `docs/PLAN.md`, `docs/BRIEF.md`, `CLAUDE.md`는 고치지 않는다. 커밋하지 않는다.

#### 보고

마지막에 `docs/P5.md`를 한국어로 쓴다.

- 무엇을 만들고 바꿨는지(백엔드, API, 창, 저장소 스키마와 옮기기)
- 돌리는 법
- 완료 기준마다의 증거(스크린숏 경로 포함)
- PLAN과 다르게 한 곳과 그 이유
- 확인하지 않은 것과 알려진 문제
- 사용자가 손으로 해 볼 것
- PLAN, BRIEF, CLAUDE.md에서 바꿀 것

### 지휘 세션이 정한 범위와 완료 기준(옛 `docs/PLAN.md` 7절)

2026-10-30에 정했다. 4절 G를 만든다.

완료 기준:

1. G1: 판의 세션이 시작 폴더의 리포지토리별 워크스페이스로 나뉘고, 위쪽 워크스페이스 줄에 세는 값과 함께 보인다. 워크트리에서 띄운 세션은 본 저장소의 워크스페이스에 있다. git 저장소가 아닌 폴더도 워크스페이스가 된다. 세션이 다른 저장소로 `cd`해도 워크스페이스는 그대로이고 표시만 바뀐다.
2. G3: 워크스페이스를 고르면 그 판으로 바뀌고 그 워크스페이스의 세션이 모두 화면에 들어온다. 세션 줄이 늘 보이고, 화면 밖에 있거나 새로 생긴 세션도 세션 줄에 있다.
3. G2: 판 전용 herdr 세션에 열린 일반 셸(대화상자로 띄운 셸, 에이전트가 나눠 둔 빈 패널)이 노드로 보이고 실행 중인 명령이 보인다. 셸에서 에이전트를 띄우면 같은 노드의 종류가 바뀐다. 셸에 `@`로 보내면 거부된다.
4. G4: 내 차례 칩, `N`, OS 알림이 다른 워크스페이스의 세션으로 데려간다. 다른 워크스페이스로 가는 연결이 노드에 표시된다. `@all`은 지금 워크스페이스의 에이전트 세션에만 간다.
5. P4까지 쓰던 판(`board.db`)이 워크스페이스로 옮겨지고 노드 자리, 그룹, 연결이 남는다. 창과 백엔드를 다시 띄워도 워크스페이스, 배치, 마지막에 본 워크스페이스가 남는다.

## 작업 기록

문서 규약(`docs/README.md`)을 도입하기 전(2026-10-31)의 작업이라 작업 기록을 따로 남기지 않았다. 작업하며 알아낸 것과 계획과 다르게 한 곳은 보고 절에 있다.

## 보고

### P5. 리포지토리 워크스페이스(옛 `docs/P5.md`)

2026-10-30에 만들고 시험했다. 작업 지시는 `docs/briefs/P5.md`다. **완료 기준 5개를 따로 띄운 개발용 판에서 실제 세션으로 모두 해 보았고, 모두 됐다.** 실제 Windows 알림 누르기와 폴더 고르기 창은 흉내만 냈다(5절).

- 시험 판: herdr 세션 `multitask-dev-p5`, 포트 47812, 데이터 폴더 `backend/.dev/p5/data`, 창 프로필 `backend/.dev/p5/app`. 백엔드, `mtask`, 창 모두 같은 값을 썼다. 실제 판의 값(`multitask`, 47800, `%LOCALAPPDATA%\multitask`)으로는 띄우지 않았다.
- 기본 개발용 판(`multitask-dev`)과 그 안의 사용자 세션 `s1`은 건드리지 않았다. 그 herdr 서버는 지금도 돌고 있다.
- 시험 세션은 CLI에서 새로 띄운 `claude --model haiku`와 PowerShell 셸이었고, 턴은 "Reply with exactly: …" 수준이었다. 신뢰 대화상자는 수락하지 않았다.
- 이전 판(완료 기준 5)은 커밋 `d2be610`(P4)을 `mtask-test/p4-base` 브랜치의 임시 워크트리로 꺼내 그 코드로 만들었다. 세션 3개, 그룹 1개, 연결 2개를 만들고 P4 백엔드를 끈 뒤 새 코드로 열었다.

시험하면서 고친 것:

1. 셸이 쉴 때 상태 필과 종류 표시가 둘 다 "셸"이라 세션 줄에 "셸 셸"로 보였다. 쉬는 상태 글을 "쉼"으로 바꿨다.
2. 셸 노드 머리줄에 메모리 "0MB"가 보였다(자원 감시가 셸 자신은 세지 않는다). 1MB 미만이면 보이지 않게 했다.
3. P3의 "떠나며 한 줄 메모" 줄이 새 세션 줄을 덮었다. 그 줄을 위로 올렸다.

#### 1. 만든 것과 바꾼 것

말 정리: 문서에서 "워크스페이스"는 판의 리포지토리 단위, "작업 공간"은 herdr의 것이다. 코드에서는 워크스페이스를 키 `workspaceKey`로 가리키고, 지금까지 `workspaceId`라고 부르던 herdr 작업 공간 ID는 `herdrWorkspaceId`로 이름을 바꿨다(4절 1번).

##### 1.1 백엔드(`backend/`)

| 파일 | 하는 일 |
|---|---|
| `src/workspaces.mjs`(새) | 순수 함수만 둔다. 창도 그대로 묶어 쓴다. 경로 맞추기(`normPath`, `pathKey`: 역슬래시·끝 슬래시·대소문자), git 조사 결과 → 워크스페이스(`workspaceFromProbe`), 이름(`workspaceNames`: 폴더 이름, 겹치면 `부모/이름`, 그래도 겹치면 전체 경로), 세는 값(`workspaceCounts`), 다른 저장소에서 일하는 중(`elsewhereOf`), 옮길 때 그룹의 워크스페이스(`groupWorkspace`), 모두 보이게 맞추기(`boundsOf`, `fitViewport`), 화면 밖(`offscreen`) |
| `src/migrate.mjs`(새) | 이전 판(P4까지의 `board.db`)을 워크스페이스로 옮긴다(`migrateWorkspaces`). 백엔드가 뜰 때마다 부르고, 옮길 것이 없으면 아무것도 하지 않는다 |
| `src/git.mjs` | `workspaceOf(cwd)`: `rev-parse --path-format=absolute --show-toplevel --git-dir --git-common-dir`로 키를 정한다. 저장소가 아니거나 폴더가 없으면 그 폴더가 워크스페이스 |
| `src/store.mjs` | 표 `workspaces`(키, 종류, 폴더, 뷰포트, 만든 시각), 열 `sessions.workspace_key`, `groups.workspace_key`(이전 `board.db`에는 `ALTER TABLE`). 메타 `currentWorkspace`(마지막에 본 워크스페이스). `nodes()`에 `workspace_key`. 세션 행의 herdr 작업 공간 ID는 `herdrWorkspaceId`로 읽는다 |
| `src/backend.mjs` | 워크스페이스 목록·열기·닫기·고르기, 세션을 띄울 때 시작 폴더로 워크스페이스 정하기, 워크스페이스별 빈자리(`occupied(wsKey)`, `freeSlot(…, wsKey)`), 판 전용 herdr 세션의 모든 패널 올리기(`adoptPane`: 에이전트가 없으면 셸), 셸 ↔ 에이전트(`promoteShell`, `demoteToShell`), 셸 상태 보기(`pollShells`, `readShellProcs`), `pane_exited`·`workspace_closed` 처리, `@all` 범위와 셸 거부(`send`) |
| `src/screen.mjs` | `shellPromptState`: 화면 끝 줄이 프롬프트(PowerShell `PS …>`, cmd `C:\…>`, `$`·`#`)인지, 마지막 프롬프트 줄의 명령 글 |
| `src/resources.mjs` | `childProcesses(pids)`: 셸 PID 바로 아래 프로세스 이름(Win32_Process) |
| `src/state.mjs` | 상태 `shell_idle`(프롬프트에서 쉼), `shell_running`(명령 실행 중). 셸은 herdr 상태와 hook을 쓰지 않는다 |
| `src/herdr/adapter.mjs` | `pane_created`의 패널 ID를 `pane.pane_id`에서 읽는다(이 이벤트는 `pane_id` 대신 패널 정보를 준다) |
| `bin/mtask.mjs` | `ws`, `ws open|close|select`, `ls`를 워크스페이스별로, `spawn --kind shell`, `send … --ws`, `board --ws`. 셸과 "다른 저장소에서 일하는 중" 표시 |
| `test/p5.test.mjs`(새), `test/fixtures/p4-schema.sql`(새) | 단위 시험 9개. 고정 자료는 커밋 `d2be610`의 `store.mjs`가 만드는 스키마 |

**API(PLAN 6절)에 더하거나 바꾼 것**

| 판 API | 내용 |
|---|---|
| `workspace.list` | `{ workspaces: [{ key, name, kind: repo|folder, root, createdAt, counts: { sessions, working, needsYou, review, shells }, groups }], current }`. 순서는 처음 생긴 순서 |
| `workspace.open { path, select? }` | 폴더의 워크스페이스를 만든다(있으면 그대로). 기본으로 그 워크스페이스를 고른다 |
| `workspace.close { workspace, confirm }` | 세션이 없는 워크스페이스만 닫는다(`not_empty`). 그 판의 그룹 영역도 지운다. `confirm` 없이 부르면 확인 문구만 |
| `workspace.select { workspace }` | 창이 지금 보는 워크스페이스. 다시 열 때 여기로 들어가고, `@all`의 기본 범위다 |
| `board.get { workspace? }` | 응답에 `workspaces`, `current`. `workspace`를 주면 그 판의 노드·그룹·연결만. 노드마다 `workspace_key`, 그룹마다 `workspaceKey` |
| `board.setViewport { workspace?, x, y, zoom }` | 뷰포트를 워크스페이스마다 저장한다 |
| `session.spawn { kind: "shell" }` | `workspace.create`만 한다. 첫 지시는 받지 않는다(`not_agent`). 응답에 `workspaceKey`, `workspaceRoot`, `herdrWorkspaceId`(전의 `workspaceId`) |
| `session.send { …, workspace? }` | 셸이 대상이면 `not_agent`. `@all`은 `workspace`(없으면 `current`)의 에이전트 세션만. `@그룹`은 그룹 안의 셸을 뺀다 |
| `group.create { …, workspace? }` | 폴더가 있으면 그 폴더의 워크스페이스, 없으면 `workspace`, 그것도 없으면 지금 워크스페이스. 둘이 다르면 거부. `session.spawn`의 그룹과 폴더의 워크스페이스가 다르면 거부 |
| 이벤트 `workspace.updated` | `{ workspaces, current }`. 워크스페이스가 생기거나 닫힐 때 |
| 이벤트 `session.created` | `workspaceKey`를 더했다 |

세션 요약에 `workspaceKey`, `elsewhere`(`{ root, repo, name }` 또는 null), `shell`(`{ atPrompt, command, procs, since }`, 셸만), `fromShell`(셸 노드에서 시작한 에이전트)을 더했고, `workspaceId`를 `herdrWorkspaceId`로 바꿨다.

**판 옮기기(`migrate.mjs`)**

- 키가 없는 열린 세션: 시작 폴더(`sessions.cwd`)의 워크스페이스. 닫힌 세션은 건드리지 않는다.
- 워크스페이스 줄: 그 워크스페이스의 가장 오래된 세션 시각을 만든 시각으로 둔다(처음 생긴 순서).
- 그룹: 소속 세션의 워크스페이스(섞여 있으면 가장 많은 쪽, 같으면 먼저 나온 쪽), 비었으면 그룹 폴더의 워크스페이스, 둘 다 없으면 첫 워크스페이스.
- 노드 자리·크기, 연결(`links`)은 바꾸지 않는다. 판이 워크스페이스마다 나뉘므로 겹치지 않는다.
- 마지막에 본 워크스페이스: 없으면 세션이 가장 많은 워크스페이스. 옛 판 하나의 뷰포트(`meta.viewport`)는 그 워크스페이스로 옮긴다.

##### 1.2 창(`app/`)

| 파일 | 하는 일 |
|---|---|
| `src/renderer/Workspaces.jsx`(새) | 워크스페이스 줄(`WorkspaceBar`: 이름, 세션 수, 작업 중, 내 차례, 검토 대기, 빈 워크스페이스의 ×, "+ 리포 열기"), 리포 열기·닫기 대화상자, 세션 줄(`SessionStrip`) |
| `src/renderer/Canvas.jsx` | 지금 워크스페이스의 노드·그룹·선만 그린다. 들어갈 때 모두 보이게 맞춘다(`fitAll`, 배율 1까지). `navigateTo`가 다른 워크스페이스의 노드면 판을 바꾼 뒤 그 노드로 간다. 뷰포트를 워크스페이스마다 저장한다 |
| `src/renderer/store.js` | `workspaces`, `currentWs`, `selectWorkspace`, `pendingNav`, `vpNow`(세션 줄의 화면 밖 표시) |
| `src/renderer/SessionNode.jsx`, `ChatView.jsx` | 셸 표시(종류 "셸", 중간·멀리 얼굴에 명령과 프로세스), "셸에서 띄움", "다른 저장소에서 일하는 중(…)", 다른 워크스페이스로 가는 연결 표시(`→ @c(mtask-p5-plain) · 도우미`, 누르면 그쪽으로) |
| `src/renderer/InboxBar.jsx`, `notify.js` | 칩과 알림에 워크스페이스 이름. 누르면 워크스페이스를 바꾸고 노드로 간다 |
| `src/renderer/CommandBar.jsx` | `@` 메뉴에서 셸을 뺀다. `@all (이 워크스페이스 X의 에이전트 n개)`. 보낼 때 지금 워크스페이스를 넘긴다 |
| `src/renderer/SpawnDialog.jsx`, `GroupNode.jsx` | 폴더 기본값은 지금 워크스페이스의 폴더. 종류 "셸(PowerShell)". 다른 워크스페이스에 생기면 알림 글로 알린다 |
| `src/main/main.mjs`, `preload.cjs` | 폴더 고르기(`mt:pickFolder`) |
| `test/e2e/p5-*.mjs`(새) | P5 창 시험 7개와 공통 도구(`p5-lib.mjs`: 따로 띄운 판의 환경 변수를 강제한다) |

OpenCove와 symvibe의 코드는 가져오지 않았다.

#### 2. 돌리는 법

```
cd app && npm start                          # 개발용 프로필. 처음 뜰 때 board.db를 워크스페이스로 옮긴다
cd backend && npm test                       # 백엔드 단위 시험 53개(P1 23, P3 9, P4 12, P5 9)
cd app && npm test                           # 창 단위 시험 14개
node backend/bin/mtask.mjs --dev ws          # 워크스페이스와 세는 값
```

**화면 쓰는 법(P5에서 더한 것)**

| 동작 | 방법 |
|---|---|
| 워크스페이스 바꾸기 | 위쪽 두 번째 줄의 칸을 누른다. 지금 칸을 다시 누르면 모두 보이게 다시 맞춘다 |
| 빈 워크스페이스 만들기 | "+ 리포 열기" → 폴더(찾아보기 가능) → 열기 |
| 빈 워크스페이스 닫기 | 세션이 0인 칸의 × → 확인 |
| 세션으로 가기 | 아래쪽 세션 줄의 칸을 누른다. ↗와 점선 테두리는 화면 밖, "새"는 2분 안에 생겨 아직 가 보지 않은 세션 |
| 셸 띄우기 | "+ 새 세션" → 에이전트 종류 "셸(PowerShell)" |
| 다른 워크스페이스의 연결 따라가기 | 노드 위쪽 보라 칸(`→ @이름(워크스페이스)`)을 누른다 |

**따로 띄운 개발용 판으로 창 시험을 다시 돌리려면**(시험 폴더는 끝나고 지웠다)

1. `backend/.dev/p5/proj`(그 안에 `git init`한 `inner`), `backend/.dev/p5/repos/r1`(`git init`, 커밋 하나, 워크트리 `../r1-wt`), `C:\Workspace\mtask-p5-plain`을 만든다.
2. 환경 변수 `MTASK_HERDR_SESSION=multitask-dev-p5`, `MTASK_PORT=47812`, `MTASK_DATA_DIR=<저장소>/backend/.dev/p5/data`, `MTASK_APP_USERDATA=<저장소>/backend/.dev/p5/app`, `MT_HERDR_SESSION=multitask-dev-p5`.
3. `proj`에서 claude 세션 `a`, `b`(그룹 `grp`), `mtask-p5-plain`에서 `c`를 띄우고 `a → b`(리뷰어), `a → c`(도우미)를 잇는다(이번에는 P4 코드로 만들었다).
4. `cd app && npm run build && MT_E2E_OUT=p5 node test/e2e/p5-<이름>.mjs`. `p5-lib.mjs`가 위 환경 변수를 강제한다.

| 스크립트 | 확인 |
|---|---|
| `p5-smoke.mjs` | 옮긴 판이 워크스페이스로 보임, 오류 없음 |
| `p5-g1.mjs` | 완료 기준 1 |
| `p5-g2.mjs` | 완료 기준 3 |
| `p5-g3.mjs` | 완료 기준 2 |
| `p5-g4.mjs` | 완료 기준 4 |
| `p5-restart.mjs` | 완료 기준 5(다시 띄우기) |

#### 3. 완료 기준별 증거

시각은 UTC다. 로그와 스크린숏은 `experiments/p5/`에 있다.

##### 3.1 G1 워크스페이스로 묶기(완료 기준 1)

`p5-g1.txt`, `m1-ws-after-migrate.txt`, `g1-1-r1-worktree-same-ws.png` ~ `g1-6-after-close.png`

- 처음 판: 옮긴 세션이 `multitask`(a, b, 저장소 `C:/Workspace/multitask`)와 `mtask-p5-plain`(c, git이 아닌 폴더)으로 나뉘었다. 워크스페이스 줄은 `⎇ multitask 2 검토 2`, `▢ mtask-p5-plain 1 검토 1`이었다. `⎇`는 저장소, `▢`는 폴더다.
- 대화상자로 `repos/r1`과 그 워크트리 `repos/r1-wt`에서 셸 `r1sh`, `wtsh`를 띄웠다. 둘 다 키 `c:/workspace/multitask/backend/.dev/p5/repos/r1/.git`(워크스페이스 `r1`)에 생겼고, `wtsh`의 git 줄은 `⎇ mtask-test/r1-wt 워크트리 …/repos/r1-wt`였다. 판에는 "같은 저장소 · 워크트리" 선이 그려졌다. 둘을 띄우는 동안 보고 있던 판(mtask-p5-plain)은 바뀌지 않았고 위쪽 줄에 `⎇ r1 2`가 더해졌다.
- 다른 저장소의 claude: `r1`(git 최상위)에서 띄운 `r1c`는 신뢰 대기 카드가 떴고(`g1-2-r1-trust-wait-card.png`), r1 칸에 `내 차례 1`이 붙었다. 수락하지 않고 끄기로 끝냈다(신뢰 대화상자에는 esc, 끝난 종류 `trust_declined`).
- 다른 저장소로 cd: multitask 워크스페이스에서 띄운 셸 `cdsh`에서 `cd inner`(proj 안에 따로 `git init`한 저장소)를 쳤다. 워크스페이스 키는 그대로 `c:/workspace/multitask/.git`이고 노드에 "다른 저장소에서 일하는 중(inner)", 세션 줄에 `↪ inner`가 붙었다(`g1-3-cd-elsewhere-badge.png`). claude `a`에게 `cd inner && git rev-parse --show-toplevel`을 시키자(권한 승인 한 번) hook `cwd`가 inner로 바뀌어 같은 표시가 붙었고, 워크스페이스 줄은 그대로였다(`g1-4-claude-cd-elsewhere.png`).
- "+ 리포 열기"로 `repos/r2`를 열자 빈 워크스페이스 `⎇ r2 0 ×`가 생기고 그 판으로 갔다. ×를 누르면 "빈 워크스페이스 r2(…)를 닫는다. 폴더와 저장소는 그대로다."를 묻고 닫았다. 세션이 있는 r1은 `not_empty`로 거부됐다.
- 키 정하기, 경로 대소문자, 워크트리, git이 아닌 폴더, 저장소 안의 따로 `git init`한 폴더, 없는 폴더, 이름 겹침은 단위 시험(`p5.test.mjs` 앞 세 개)에서 실제 git 저장소로 확인한다.

##### 3.2 G3 늘 보이는 오버뷰(완료 기준 2)

`p5-g3.txt`, `g3-1-enter-*.png` ~ `g3-5-refit.png`

- r1, mtask-p5-plain, multitask 칸을 차례로 누르자 판이 바뀌고 모든 노드가 판 영역 안에 들어왔다(`allInside: true`, 배율 0.99, 1, 0.336). 세션 줄에는 그 워크스페이스의 세션이 모두 있었다.
- `a`로 다가가자 세션 줄이 `a, b(화면 밖), cdsh(화면 밖)`이 됐다(`g3-2-strip-offscreen.png`).
- 그 상태에서 `mtask`로 multitask에 셸 `g3new`, r1에 셸 `g3r1`을 띄웠다. 뷰포트는 전후가 `{"x":-109,"y":997.5,"zoom":1}`로 같았다. 세션 줄에 `g3new(화면 밖)(새)`가 생겼고 r1 칸의 수는 3이 됐다(`g3-3-new-session-in-strip-view-unchanged.png`).
- 세션 줄의 `g3new`를 누르자 화면이 그 노드로 갔고 노드 자리는 그대로였다.
- 앱을 다시 열면 마지막에 본 워크스페이스로 들어가 모두 보이게 맞춘다(3.5절).

##### 3.3 G2 일반 셸(완료 기준 3)

`p5-g2.txt`(시험을 네 번 돌린 기록이 이어져 있다. 마지막 두 번이 끝까지 돈 것), `g2-1-shell-running-close.png` ~ `g2-8-kill-shell-confirm.png`

- 대화상자로 띄운 셸 `runsh`에서 `ping -n 25 127.0.0.1`을 돌리자 상태가 `shell_running`(명령 실행 중)이 되고 `command: "ping -n 25 127.0.0.1"`, `procs: ["PING.EXE"]`가 보였다. 중간 얼굴과 세션 줄에도 `ping -n 25 127.0.0.1 (PING.EXE)`가 보였다(`g2-2`). 끝나자 `shell_idle`(쉼)로 돌아왔다.
- 터미널 입력: 노드 터미널에 `echo typed-in-board`를 치자 화면에 `typed-in-board`가 찍혔다(`g2-3`).
- 에이전트가 나눈 빈 패널: `b`에게 "herdr로 오른쪽으로 나누고 빈 셸로 둬라"를 시키자(승인 두 번) `herdr pane split --current --direction right --cwd "$PWD" --no-focus`를 불렀다. 판이 `pane_created`를 받아 셸 노드 `sh-w4p3`(판에 올림, 워크스페이스 multitask, 부모 `b`)를 `b` 옆에 놓고 `b → sh-w4p3` "띄움" 선을 그었다(`g2-4`).
- 셸에 보내기: 명령 바에서 `@sh-w4p3 hi`는 "보내지 못했다: @sh-w4p3은 일반 셸이다. 명령 바로는 에이전트에게만 보낸다…"로 거부됐고(`g2-5`), `mtask send`도 `not_agent`로 거부됐다. `@` 메뉴에는 셸이 나오지 않는다.
- 셸 → 에이전트: 그 셸에 `claude --model haiku`를 치자 같은 노드(세션 ID 같음)의 종류가 `claude`로 바뀌고 "셸에서 띄움"이 붙었다. 세션 목록에 새 노드는 없었다(`g2-6`). 이제 에이전트라 `@sh-w4p3 Reply with exactly: from-shell`이 가서 `from-shell`로 답했다. `/exit`하자 같은 노드가 다시 셸이 됐고(`g2-7`), 셸에서 `exit`하자 패널이 없어지며 노드가 빠졌다(판 이벤트 `closed: pane exited`).
- 끄기: 명령을 돌리는 셸의 ×는 "셸 runsh의 패널을 닫는다. 돌고 있는 명령(ping -n 30 127.0.0.1)도 끝난다."를 묻고(`g2-8`) 패널을 닫았다.
- P4 F3 회귀(`f3-regress.txt`): `b`에게 "패널을 아래로 나누고 claude `helper5`를 띄워 hi5를 받아 와라"를 시켰다. 나눈 패널이 먼저 셸 노드 `sh-w4p5`로 올라오고, `herdr agent start helper5 --pane w4:p5`가 뜨자 같은 노드가 `helper5`(claude)로 이름과 종류가 바뀌었다. `b → helper5`는 띄움과 시킴 기록 6건, 답은 `hi5`였다.

##### 3.4 G4 워크스페이스 가로지르기(완료 기준 4)

`p5-g4.txt`, `g4-1-chip-other-workspace.png` ~ `g4-6-all-current-workspace.png`

- multitask 판을 보는 동안 mtask-p5-plain의 `c`가 권한 요청(내 차례)이 됐다. 위쪽 칩은 `@c mtask-p5-plain 권한: Bash: echo p5 > p5-g4.txt 3초`였다(`g4-1`). 다른 워크스페이스의 이름은 보라색이다.
- 칩을 누르자 판이 mtask-p5-plain으로 바뀌고 `c`가 화면 가운데에 왔다(`centered: true`, `g4-2`). multitask로 돌아가 `N`을 눌러도 같았다.
- OS 알림: 창 쪽 기록은 `notify: true, why: "node not visible"`(다른 판이라 노드가 그려지지 않음), main의 알림은 `shown: true`였다. 알림에 click을 내자 mtask-p5-plain으로 바꾸고 `c`로 갔다(`g4-3`). 실제 알림 센터에서 누르지는 않았다.
- 다른 워크스페이스로 가는 연결: multitask 판에는 `a → b`(리뷰어) 선만 그려졌고, `a` 노드에 `→ @c(mtask-p5-plain) · 도우미`가 붙었다(`g4-4`). 누르자 그쪽 판의 `c`로 갔고, `c` 노드의 `← @a(multitask) · 도우미`를 누르자 다시 `a`로 왔다(`g4-5`).
- `@all`: `@` 메뉴는 `@all (이 워크스페이스 multitask의 에이전트 2개)`였다. `@all Reply with exactly: p5all`은 `a`, `b`에만 가서 둘 다 제출 확인됐다. 같은 판의 셸 `cdsh`와 다른 워크스페이스의 `c`에는 가지 않았다. 범위와 셸 빼기는 단위 시험에도 있다.

##### 3.5 이전 판 옮기기(완료 기준 5)

`m0-p4-board-before.json`, `m0-p4-sessions-before.json`, `m1-board-after-migrate.json`, `m1-ws-after-migrate.txt`, `p5-restart.txt`, `m2-before-restart.png`, `m3-after-restart.png`, `smoke-1-multitask.png`

- P4 코드로 만든 판: 세션 a(proj, 자리를 (123, −345) 760×480으로 옮김), b(proj, 그룹 grp), c(mtask-p5-plain), 그룹 grp(proj 폴더), 연결 `a → b 리뷰어`, `a → c 도우미`. P4 백엔드를 끄고 새 코드로 띄웠다.
- 백엔드 로그: `workspaces migrated {"sessions":3,"groups":1,"workspaces":["c:/workspace/multitask/.git","c:/workspace/mtask-p5-plain"],"current":"c:/workspace/multitask/.git"}`.
- 노드 세 개의 자리와 크기는 옮기기 전과 같았다(`nodes same: true`). 그룹 grp는 multitask에, 연결 둘도 그대로였다. 세션은 herdr에서 계속 돌아 상태와 마지막 답도 이어졌다.
- 다시 띄우기(`p5-restart.mjs`): r1을 고른 채 창을 닫고 백엔드를 껐다가 창으로 다시 띄웠다. 지금 워크스페이스(r1), 워크스페이스 목록, 노드 6개의 자리, 그룹, 연결이 모두 같았고(`같은가: 모두 true`), r1 판으로 들어가 모든 노드가 보였다.
- 단위 시험은 P4 스키마 고정 자료(`test/fixtures/p4-schema.sql`)로 세션·그룹·노드·연결·뷰포트·닫힌 세션·소속 없는 그룹을 옮기고, 두 번 돌려도 바뀌지 않는 것을 본다.

##### 3.6 회귀

- 단위 시험: 백엔드 53개, 창 14개 모두 통과.
- 창: P4·P3 첫 확인(`p4-smoke.mjs`, `p3-smoke.mjs`)을 같은 시험 판에서 돌렸다(`regress/`). 오류 사건 0, 읽기 전용 카드 0.

#### 4. PLAN과 다르게 한 곳

1. **이름.** PLAN 6절은 세션 요약에 `workspaceId`를 더한다고 했지만 그 이름은 이미 herdr 작업 공간 ID였다. 헷갈리지 않게 herdr 쪽을 `herdrWorkspaceId`로 바꾸고(요약, `session.spawn` 응답, 백엔드 안), 판의 워크스페이스는 `workspaceKey`로 했다. `workspaceId`를 읽던 쪽은 바꿔야 한다. 이 저장소에서는 `app/test/e2e/p4-f3.mjs` 두 줄이 그 값을 써서 `herdrWorkspaceId`로 고쳤다(다시 돌리지는 않았다).
2. **셸의 실행 중 명령.** PLAN은 `pane.process_info`의 실행 중 프로세스 이름을 쓴다고 했다. 시험해 보니 Windows에서 herdr는 셸(`powershell.exe`)만 주고 셸 아래의 `ping` 같은 명령은 주지 않았다. 그래서 쉬는지·도는지는 화면 끝 줄이 프롬프트인지로(2초마다, 화면 읽기 하나), 명령 글은 마지막 프롬프트 줄에서, 프로세스 이름은 셸 PID의 자식(Win32_Process, 새 명령이 시작될 때와 도는 동안 30초마다)에서 얻는다. 처음에는 5초마다였는데, 검토 때 오래 도는 명령에 PowerShell을 자주 띄우지 않게 30초로 늘렸다. 셸 상태는 `shell_idle`, `shell_running` 두 개를 새로 뒀다. 작업 중 수와 검토 대기에는 셸을 세지 않는다.
3. **herdr 이벤트.** 셸에서 `exit`하면 `pane_exited`만 오고 `pane_closed`는 오지 않았다. 작업 공간을 닫아도 패널마다 `pane_closed`가 오지 않았다. 둘 다 처리한다(P4까지는 판 밖에서 작업 공간을 닫으면 다음 다시 맞추기까지 노드가 남았다).
4. **판에 올린 에이전트가 끝나면 셸로.** P4는 판에 올린 에이전트가 끝나면 exited로 두었다. "패널 하나가 노드 하나"(G2)에 맞춰, 판이 띄우지 않은 에이전트(판에 올린 것, 셸에서 띄운 것)가 끝나면 같은 노드를 셸로 되돌린다. 판이 띄운 에이전트는 PLAN대로 exited로 둔다.
5. **빈 워크스페이스 닫기.** "빈" 것은 세션이 없는 것이다. 그 판에 그룹 영역이 있으면 함께 지운다고 확인 문구에 적는다.
6. **뷰포트.** 워크스페이스마다 저장하지만, 들어갈 때는 늘 모두 보이게 맞추므로(G3) 저장한 뷰포트로 되돌리지는 않는다.
7. **그룹과 워크스페이스.** 그룹의 폴더와 다른 워크스페이스의 폴더로 그룹 안에서 띄우거나, 그룹 폴더를 다른 워크스페이스로 바꾸면 거부한다(그룹은 한 워크스페이스 안). `@그룹`은 그룹 안의 셸을 뺀다. `@셸`이 여러 대상 중 하나라도 있으면 전체를 보내지 않는다.
8. **옮기기의 빈 그룹.** 소속 세션도 폴더도 없는 그룹은 첫 워크스페이스에 둔다. PLAN에 정하지 않은 경우다.
9. **더한 것.** 워크스페이스 줄의 지금 칸을 다시 누르면 다시 맞춘다. 세션 줄에 "새"(2분 안에 생겨 아직 가 보지 않음)와 "↪ 다른 저장소"를 보인다. `workspace.select`를 더했다(PLAN 6절에 없음).
10. **워크스페이스 줄의 자리.** "내 차례" 줄 아래에 따로 한 줄로 두었다. 내 차례 칩이 많아도 워크스페이스 칸이 밀려나지 않게 하기 위해서다.

#### 5. 확인하지 않은 것과 알려진 문제

1. **실제 알림 누르기와 폴더 고르기 창.** 알림은 main의 알림 객체에 click을 내서, 리포 열기는 경로를 쳐서 시험했다(P3와 같은 방법). 6절 1, 2번.
2. **설명하지 못한 노드 이동 한 번.** 첫 G2 실행(13:50~13:54 사이)에 `a` 노드가 (123, −345)에서 (521, −893)으로 옮겨져 저장됐다. 그 뒤 G2를 자리 기록과 함께 다시 돌렸을 때와, 연결 표시·세션 줄·칩을 누르는 확인(`p5-dragcheck.txt`)에서는 움직이지 않았다. 창이 화면에 보이는 채로 돌았으므로 사람 손일 수도 있고, Playwright 누르기와 화면 이동 애니메이션이 겹친 끌기일 수도 있다. 원인을 찾지 못했다.
3. **셸 상태는 화면 추정이다.** 프롬프트 모양(PowerShell, cmd, `$`·`#`로 끝나는 줄) 말고는 모른다. 명령이 프롬프트처럼 생긴 줄을 찍으면 쉼으로 보인다. 출력이 화면을 넘기면 끝난 뒤 "마지막 명령"을 잃는다(G2의 `ping -n 25`에서 봄). 셸의 폴더는 herdr가 프롬프트 때 받는 폴더라 명령이 도는 동안 `cd`는 늦게 보인다.
4. **herdr 재시작과 재부팅.** 셸 노드와 판에 올린 패널이 herdr 재시작 뒤 어떻게 되는지 시험하지 않았다. 다시 맞출 때 판이 모르는 패널을 모두 올리도록 했지만 실제로 보지 않았다. 기본 개발용 서버(`s1`이 있음)를 끌 수 없어 P4에서처럼 따로 띄운 판에서 해야 한다.
5. **셸에서 띄운 claude**는 판의 hook, 스킬 플러그인, 권한 모드를 받지 않고 사용자 설정을 따른다(시험에서 auto mode로 떴다). 판에 올린 에이전트와 같다(P4 6절 2번).
6. **판에 올린 패널의 워크스페이스는 패널 폴더로 정한다(PLAN).** 다른 저장소로 cd한 에이전트가 `--cwd "$PWD"`로 나눈 패널은 그 다른 저장소의 워크스페이스에 생긴다. 그 경우는 시험하지 않았다. 부모와 다른 판에 생기면 연결은 노드 가장자리 표시로 보인다.
7. **셸 노드의 메모리**는 자원 감시가 셸 자신을 세지 않아 0이다. 1MB 미만이면 숨긴다.
8. **`mtask input`은 패널 제어기를 가져간다.** 창이 그 노드에 터미널을 붙인 상태면 창의 터미널이 놓인다. 시험에서는 herdr `pane.send_text`로 셸에 글을 넣었다.
9. **P3·P4의 다른 창 시험**(첫 확인 둘 말고)은 다시 돌리지 않았다. 대부분 기본 개발용 판(`multitask-dev`)을 쓰도록 짜여 있어, 시험 판 환경 변수를 주어야 한다.
10. **Codex 같은 다른 종류의 턴**은 따로 검증하지 않았다(2026-10-30 사용자 결정).
11. **시험이 남긴 것.** 시험 claude 세션의 대화 기록은 `~/.claude/projects` 아래에 남았다. 시험 폴더(`proj`, `inner`, `mtask-p5-plain`)의 claude가 `~/.claude.json`에 프로젝트 항목을 남겼을 수 있다. 판은 그 파일을 읽기만 했다.
12. **정리.** 시험 세션을 모두 끄고, 창을 닫고, 따로 띄운 백엔드와 herdr 서버를 멈추고 herdr 세션 `multitask-dev-p5`를 지웠다(`herdr session delete`). `backend/.dev/p5/`(데이터, 창 프로필, 시험 저장소, 임시 워크트리), `C:\Workspace\mtask-p5-plain`을 지웠다. 임시 워크트리는 `node_modules` 연결(정션)을 먼저 끊은 뒤 `git worktree remove`로 지우고 `mtask-test/p4-base` 브랜치를 지웠다. 기본 개발용 판과 그 herdr 서버는 그대로다. 커밋하지 않았다.

#### 6. 사용자가 손으로 해 볼 것

1. **알림.** 다른 워크스페이스를 보는 동안 세션이 내 차례가 되면 Windows 알림에 워크스페이스 이름이 붙는지, 알림 센터에서 누르면 그 워크스페이스로 바뀌고 노드로 가는지 본다.
2. **리포 열기의 찾아보기.** "+ 리포 열기" → "찾아보기…"로 폴더를 골라 연다. 워크트리 폴더를 고르면 본 저장소의 워크스페이스가 되는지 본다.
3. **실제 판 옮기기.** 새 코드로 처음 띄우면 `%LOCALAPPDATA%\multitask\board.db`가 바로 옮겨진다. 띄우기 전에 그 파일을 복사해 두고, 띄운 뒤 세션이 맞는 워크스페이스에 있는지, 노드 자리·그룹·연결이 그대로인지 본다. 기본 개발용 판(`backend/.dev/data`, `s1`)도 개발용 창을 새 코드로 처음 열 때 옮겨진다.
4. **셸 쓰기.** 셸에서 `npm run dev`처럼 오래 도는 명령을 돌려 노드와 세션 줄에 명령과 프로세스(`node.exe` 등)가 보이는지, 터미널에서 `ctrl+c`로 멈추면 쉼으로 돌아오는지 본다.
5. **세션이 많을 때.** 한 워크스페이스에 세션이 10개 넘을 때 세션 줄이 읽기 좋은지(가로로 밀림), 들어갈 때 모두 보이게 맞춘 배율에서 노드가 너무 작지 않은지 본다.
6. **다른 저장소로 cd.** 실제 일하면서 세션이 다른 저장소로 cd했을 때 "다른 저장소에서 일하는 중" 표시가 도움이 되는지, 워크스페이스를 옮기지 않는 규칙이 맞는지 본다.

#### 7. PLAN, BRIEF, CLAUDE.md에서 바꿀 것

이번 작업에서는 세 문서를 고치지 않았다. 아래를 제안한다.

**`docs/BRIEF.md`**

- 1절 첫 문단과 5절: "그다음(P5)"을 "P5(v0.4)에서 한 것"으로 바꾸고 `docs/P5.md`를 가리킨다. 손 점검(알림, 리포 열기 찾아보기, 실제 판 옮기기)은 사용자 확인 대기로 적는다.
- 3절 "일반 셸" 줄: 셸의 실행 중 명령은 화면 끝 프롬프트와 셸 PID의 자식 프로세스로 본다(Windows의 herdr `pane.process_info`는 셸만 준다). 판이 띄우지 않은 에이전트가 끝나면 같은 노드가 셸로 돌아간다.
- 3절 "워크스페이스" 줄: 빈 워크스페이스를 닫으면 그 판의 그룹 영역도 지운다. 코드 이름은 `workspaceKey`, herdr 작업 공간은 `herdrWorkspaceId`.
- 8절 참고 문서에 `docs/P5.md`를 더한다.

**`docs/PLAN.md`**

- 0절 순서: P5(끝남, `docs/P5.md`).
- 4절 G1: 이름 겹침 규칙(`부모/이름`, 그다음 전체 경로), 빈 워크스페이스 닫기와 그룹, 옮길 때 소속도 폴더도 없는 그룹은 첫 워크스페이스. G2: 셸 상태 `shell_idle`·`shell_running`과 알아내는 방법(위), `pane_exited`·`workspace_closed` 처리, 판에 올린 에이전트가 끝나면 셸로. G3: 지금 칸을 다시 누르면 다시 맞춤, 세션 줄의 "새"와 "↪". G4: `@그룹`도 셸을 뺀다.
- 5절 모듈 표: "워크스페이스"는 `backend/src/workspaces.mjs`, `migrate.mjs`, `git.mjs workspaceOf`, 단계 P5(끝남). "패널 추적"은 `backend.mjs`(`adoptPane`, `promoteShell`, `pollShells`), P5(끝남).
- 6절 API: `workspace.list`·`open`·`close`·`select`, `board.get`의 `workspaces`·`current`, `board.setViewport { workspace }`, `session.send { workspace }`, `group.create { workspace }`, 오류 `not_agent`·`not_empty`, 요약의 `workspaceKey`·`elsewhere`·`shell`·`fromShell`, 그리고 `workspaceId` → `herdrWorkspaceId` 이름 바꿈.
- 7절 P5: "끝났다"와 결과 요약.
- 8절 열린 결정: 워크스페이스 줄 순서를 끌어 바꾸기와 오래 빈 워크스페이스 접기는 그대로 연다. 새로: 다른 저장소로 cd한 에이전트가 나눈 패널을 패널 폴더의 워크스페이스에 둘지 부모의 워크스페이스에 둘지.

**`CLAUDE.md`**

- 첫 문단에 P5(리포지토리 워크스페이스, `docs/P5.md`)를 더한다.
- 더할 규칙 제안: "따로 띄운 개발용 판(`MTASK_HERDR_SESSION`·`MTASK_PORT`·`MTASK_DATA_DIR`·`MTASK_APP_USERDATA`)으로 창 시험을 돌릴 때는 시험 스크립트가 그 값을 강제하게 한다(`app/test/e2e/p5-lib.mjs`). 다른 창 시험은 환경 변수가 없으면 기본 개발용 판에 붙는다." "multitask 저장소에 임시 워크트리를 만들고 그 안에 `node_modules` 정션을 걸었으면, 워크트리를 지우기 전에 정션부터 끊는다."

### 지휘 세션의 합치기 기록(옛 `docs/PLAN.md` 7절)

끝났다(2026-10-30). 결과와 증거는 `docs/P5.md`, 스크린숏과 로그는 `experiments/p5/`, 작업 지시는 `docs/briefs/P5.md`에 있다. 기본 개발용 판에 사용자 세션이 있어, 따로 띄운 개발용 판(herdr 세션 `multitask-dev-p5`, 포트 47812)에서 아래 다섯 가지를 실제 세션으로 해 보았고 모두 됐다. 이전 판은 P4 코드(`d2be610`)를 임시 워크트리로 꺼내 만들었다. 실제 Windows 알림 누르기와 폴더 고르기 창은 흉내만 냈다. herdr 재시작 뒤의 셸 노드는 보지 않았다(`docs/P5.md` 5~6절).
