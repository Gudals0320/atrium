상태: 닫힘
날짜: 2026-11-01

## 지시

### 목표

프로젝트 이름을 `multitask`에서 `Atrium`으로 바꾼다. 사용자는 "모든 곳에서" 바꾸라고 했고, 범위는 다음으로 정했다.
- 화면, 문서, 패키지, CLI, 환경 변수, 데이터 폴더, herdr 세션, 앱 프로필까지 바꾼다.
- 처음 켤 때 옛 판 기록을 옮기고, 세션은 새 herdr에서 이어 가기로 돌아오게 한다. 진행 중이던 턴이 끊기는 것은 받아들였다.
- 저장소 폴더 `C:\Workspace\multitask`는 바꾸지 않는다.

지금 실제 판(herdr 세션 `multitask`, 포트 47800, `%LOCALAPPDATA%\multitask`, 창 프로필 `multitask-app-real`)에는 사용자의 claude 세션 9개가 돌고 있다. 옮기기는 사용자가 합친 코드를 처음 켤 때 일어난다. 너는 실제 판을 건드리지 않고, 시험용 이름으로 같은 옮기기를 시험한다.

같은 때 다른 작업자 둘이 renderer를 고친다.
- P16: 한/영 전환과 영어 기본
- P17: 2차원 붙여 묶기

renderer 화면 글은 P16이 사전으로 옮기므로, 화면 글 속 이름은 최소로만 고친다. 합칠 때 지휘 세션이 마지막으로 이름을 다시 훑는다.

### 정한 것

- **이름.**
  - 보이는 이름은 `Atrium`, 식별자는 소문자 `atrium`이다.
  - 실제 판: herdr 세션 `atrium`, 데이터 폴더 `%LOCALAPPDATA%\atrium`, 창 프로필 `atrium-app-real`, Windows 앱 ID `atrium.real`
  - 개발용 판: herdr 세션 `atrium-dev`, 창 프로필 `atrium-app-dev`, 앱 ID `atrium.dev`. 데이터 폴더 `backend/.dev/`는 그대로다.
  - 포트는 그대로다(실제 47800, 개발용 47811).
  - 창 제목, 트레이 툴팁, 알림 제목, 바로가기 이름도 `Atrium`이다.
  - package.json 이름은 `atrium-app`, `atrium-backend`다.
- **CLI.**
  - `backend/bin/atrium.mjs`(`atrium …`)가 본 명령이다.
  - `mtask.mjs`는 같은 명령을 부르는 얇은 별칭으로 당분간 둔다.
  - 판 플러그인이 에이전트에게 주는 명령도 `atrium child|children|child-kill`로 바꾼다. `mtask` 별칭 파일도 같이 둔다(지금 도는 세션의 스킬 글이 `mtask child`를 말한다).
- **환경 변수.**
  - `ATRIUM_*`가 본 이름이다(`ATRIUM_HERDR_SESSION`, `ATRIUM_PORT`, `ATRIUM_DATA_DIR`, `ATRIUM_APP_USERDATA`, `ATRIUM_CLAUDE_PROJECTS` 등).
  - 옛 `MTASK_*`도 받는다. 둘 다 있으면 `ATRIUM_*`가 이긴다. 한곳(`config.mjs`)에서 읽는다.
  - 시험 도구와 창 시험은 새 이름을 쓰되, 옛 이름으로 띄워도 되게 둔다.
- **에이전트에게 가는 글.**
  - 판 플러그인 이름 `atrium-herdr`
  - 짧은 안내와 연결 알림의 머리 `[Atrium 판]`
  - 하위 세션 스킬 글
  - 이 글들을 알아보는 코드(예: `[multitask 판]`으로 시작하는 줄 거르기)는 옛 머리도 함께 알아본다.
- **옮기기(실제 판 프로필에서만, 백엔드가 뜰 때 한 번).**
  1. 판 기록 옮기기.
     - 조건: 새 데이터 폴더가 없고 옛 폴더가 있다. 옛 `backend.json`의 pid가 살아 있으면 옛 백엔드를 끈다(`backend.shutdown`). 끄지 못하면 옮기지 않고 기다린다.
     - 폴더를 통째로 이름 바꾼다. 안 되면 복사하고, 옛 폴더에 옮겼다는 표시 파일을 둔다.
     - 세션 설정 파일, 플러그인 폴더 등 기록 속 경로(데이터 폴더 아래 절대 경로)를 새 폴더로 고친다. board.db 안의 `settings_path` 등을 포함한다.
     - 세션마다 `--settings` 경로가 바뀌므로, 이어 가기 인자(`resume_argv`)도 다시 만들어 등록한다.
  2. herdr 옮기기.
     - 조건: 옛 herdr 세션 서버가 돌고 새 세션이 없다.
     - 옛 서버를 끈다(그 안의 claude가 끝난다). 새 이름으로 띄운 뒤 지금의 되살리기(J1, `restoreGone`, `recreate_resume`)로 판 세션을 같은 대화 ID로 이어 간다.
     - 다 옮기면 옛 herdr 세션(멈춘 것)을 지운다.
     - 셸 노드는 되살리지 못하면 지금 규칙대로 닫힘이 된다. 보고에 적는다.
  3. 창 프로필 옮기기. `multitask-app-real` → `atrium-app-real`을 복사한다. 창 크기, 사이드바 접힘, localStorage를 지킨다.
  4. 바로가기. `app/scripts/make-shortcut.ps1`이 `Atrium` 바로가기를 만든다. 옛 `multitask` 바로가기는 지우지 않는다. 지휘 세션이 사용자에게 묻고 정리한다.
  - 옮기기는 단계마다 판 기록 이벤트와 로그를 남긴다. 다시 켜도 두 번 일어나지 않는다. 실패하면 옛 것을 그대로 두고 알린다(트레이 툴팁이나 창 알림).
  - **시험할 수 있게** 옛 이름과 새 이름을 환경 변수로 덮는다(예: `ATRIUM_LEGACY_HERDR_SESSION`, `ATRIUM_LEGACY_DATA_DIR`, `ATRIUM_LEGACY_APP_USERDATA`). 그래서 시험은 `atrium-dev-p18-old` → `atrium-dev-p18-new` 같은 시험 이름으로 실제 판 프로필의 옮기기 코드를 돈다.
  - 시험이 기본값(진짜 `multitask`, `%LOCALAPPDATA%\multitask`)을 가리키면 띄우지 않는 막이를 둔다(`app/test/e2e/p9-guard.mjs`처럼).
- **시험 막이.**
  - `p9-guard.mjs`는 `atrium-dev-<이름>`을 받고 옛 `multitask-dev-<이름>`도 받는다.
  - 실제 판 값은 새 것(`atrium`, `%LOCALAPPDATA%\atrium`, `atrium-app-real`)과 옛 것을 모두 막는다.
- **문서.**
  - 살아 있는 문서(`CLAUDE.md`, `README.md`, `docs/README.md`, `docs/BRIEF.md`, `docs/ARCH.md`, `docs/PLAN.md`, `docs/testing.md`)의 제품 이름, 판 이름, 명령, 환경 변수, 경로를 새 이름으로 고친다(이번 작업에 한해 허락한다).
  - 기록 문서(`docs/decisions.md`, `docs/log/`, `docs/experiments/`, `docs/research/`, `experiments/`)는 고치지 않는다(옛 이름 그대로가 기록이다).
  - BRIEF에 "이름" 결정 행이나 문장을 넣지 않는다. 지휘 세션이 넣는다.
- **코드 주석·로그·변수 이름.**
  - 제품 이름 `multitask`는 `Atrium`, `atrium`으로 바꾼다. `mt-` CSS 접두어와 `__mt` 같은 내부 짧은 이름은 그대로 둔다.
  - 바꾼 뒤 남은 `multitask`를 `rg`로 찾아 남긴 까닭(옛 이름 받기, 옮기기, 기록 문서)을 보고에 적는다.

### 완료 기준

1. 시험 이름으로 옛 판을 만든다.
   - 옛 herdr 세션에 판이 띄운 claude(haiku) 둘과 셸 하나, 노드 자리, 덩어리, 그룹, 메모, 보관 표시, 창 프로필.
   - 새 코드를 실제 판 프로필 경로로 띄운다.
   - 확인할 것:
     - 판 기록, 노드 자리, 덩어리, 그룹, 메모, 보관이 그대로 옮겨진다.
     - claude 둘이 같은 대화 ID로 새 herdr에서 이어 간다.
     - 옛 herdr 세션이 없어진다.
     - 창 크기와 사이드바 상태가 남는다.
     - 다시 켜도 두 번 옮기지 않는다.
   - 옮기기 앞뒤 스크린숏과 로그를 남긴다.
2. 옛 백엔드가 떠 있을 때, 옛 폴더를 지울 수 없을 때(복사로 감), 옛 herdr가 없을 때(판 기록만 옮김)를 단위 시험이나 창 시험으로 본다.
3. 창 제목, 트레이, 알림, 설정 화면, 판 안내 글에 `multitask`가 보이지 않는다(스크린숏). `atrium` CLI와 `mtask` 별칭이 모두 된다.
4. 단위 시험(백엔드 170, 창 34)이 통과한다. 옮기기 단위 시험을 더한다. 대표 창 시험(`p12-quick.mjs`, `p14-tray.mjs`, `p15-close.mjs`)을 새 이름의 판으로 돌린다.

### 시험 환경

- 시험 이름: herdr 세션 `atrium-dev-p18`, `atrium-dev-p18-old`, `atrium-dev-p18-new`. 포트는 47834부터 쓴다.
- 데이터 폴더와 창 프로필은 `<워크트리>/backend/.dev/` 아래에 둔다.
- 실제 판(`multitask`, 47800, `%LOCALAPPDATA%\multitask`, `multitask-app-real`)과 기본 개발용 판(`multitask-dev`, 47811)은 사용자가 쓰고 있다. 읽기 외에는 건드리지 않는다. 포트 47800, 47811~47833을 쓰지 않는다.
- 대화 목록은 고정 자료만 읽는다. 시험 폴더는 `C:\Workspace\mtask-p18-*`처럼 새로 만든다.
- 시험 claude는 `--model haiku`, 턴은 짧게.
- 끝나면 다음을 끄고 지운다: 시험 세션, 창, 백엔드, 시험 herdr 서버와 세션, 시험 폴더, 시험 대화 기록.

### 지킬 것

- `CLAUDE.md`를 따른다.
  - 사용자의 `~/.claude/settings.json`을 고치지 않는다.
  - 프로세스는 직접 띄운 것만 PID로 끈다.
- 자기 브랜치에만 커밋한다.
  - 메시지 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`를 붙인다.
  - `main`을 바꾸거나 푸시하지 않는다.
  - `node_modules`는 워크트리 안에서 받는다.
- 문서는 위 "문서"에 적은 범위와 이 작업 파일의 작업 기록·보고 절만 고친다.
- 끝나면 보고 절을 쓴다.
  - 사용자가 합친 뒤 할 일(실제 판 첫 실행 때 일어나는 일, 바로가기)을 순서대로 적는다.
  - 맨 마지막에 `<워크트리>/backend/.dev/p18.done`(브랜치 이름과 마지막 커밋 해시 두 줄)을 만든다.

### 읽을 파일

- `CLAUDE.md`
- `docs/ARCH.md` 1절, 4절 J1, 5절
- `docs/testing.md`
- `backend/src/config.mjs`, `client.mjs`, `launch.mjs`, `recall.mjs`(되살리기)
- `app/src/main/main.mjs`, `tray.mjs`
- `app/scripts/`
- `app/test/e2e/p9-guard.mjs`

## 작업 기록

2026-11-01 작업자 세션(워크트리 p18, 브랜치 worktree-p18)

- 시작 상태: 단위 시험 백엔드 170, 창 34 통과. `node_modules`는 워크트리 안에서 `npm ci`로 받았다.
- 이름 상수와 환경 변수는 `config.mjs` 한곳: `APP_NAME`, `APP_ID`, `LEGACY_ID`, `envVar(name)`(ATRIUM_ 먼저, 없으면 MTASK_). `atrium-child.mjs`, Electron main, `real.mjs`도 `envVar`로 읽는다.
- 옮길 옛 판을 고르는 규칙(`legacyOf`)이 안전장치다. 판 값(herdr 세션, 포트, 데이터 폴더)을 덮은 판은 `ATRIUM_LEGACY_HERDR_SESSION`과 `ATRIUM_LEGACY_DATA_DIR`을 둘 다 줘야 옮긴다. 기본 옛 판(진짜 multitask)은 덮지 않은 실제 판에서만 쓴다. 그래서 지금까지의 시험 판(실제 판 프로필 + 덮은 값)은 진짜 multitask를 끄지 않는다.
  - 걸림: 백엔드는 자식 프로세스로 뜨면서 `profileEnv`로 판 값을 받으므로 "덮은 판"이 된다. `profileEnv`가 옮길 옛 판도 함께 넘기게 했다(없으면 빈 글).
- 알아낸 것: 창(main)과 CLI는 백엔드를 띄우기 전에 새 데이터 폴더의 `logs`를 만들고 `backend.out`을 연다(백엔드가 그 파일을 쥔다). 그래서 실제 흐름에서는 폴더를 통째로 이름 바꿀 수 없다. 통째로 → 안 되면 항목마다 옮기기(같은 이름은 `x.legacy.ext`) → 그것도 안 되면 복사. 옮김 조건은 "새 폴더가 없다"가 아니라 "새 폴더에 board.db가 없다"로 했다.
- 알아낸 것: 옛 herdr 서버는 옛 폴더의 `logs/herdr-server-<세션>.out`을 쥔다. 옛 herdr를 옮길 차례면 폴더를 옮기기 전에 끈다.
- 알아낸 것: 열린 옛 창(renderer)은 백엔드가 끊기면 1초마다 다시 붙고, 그때 옛 백엔드를 다시 띄운다. 옮기는 사이에 옛 백엔드가 다시 뜨면 board.db를 잡는다. 옛 백엔드를 끄자마자 옛 `backend.json`을 새 백엔드 pid로 덮었다(옛 백엔드는 "이미 돈다"로 바로 끝난다). 새 백엔드가 뜬 뒤에는 그 파일에 새 토큰을 넣어, 열린 옛 창은 새 판에 붙는다.
- 새 herdr는 옛 패널 ID를 모르고, 같은 ID(w1:p1 등)를 새로 쓸 수 있다. 옮긴 판의 열린 세션 패널 ID에 `legacy:`를 붙여 되살리기(J1)로 보낸다. `herdrRestartedWhileDown`을 켜서 기존 흐름(`markHerdrStopped` → `resync` → `recoverAfterHerdr`의 `recreate_resume`, `restoreGone`)을 그대로 쓴다. `resync`가 되살리기 약속을 `recoveryDone`에 두고, `finishHerdrMigration`이 그것을 기다린 뒤 옛 herdr 세션을 지운다(되살리지 못한 세션이 있으면 남기고 알린다).
- 이어 가기 인자는 데이터 폴더를 옮긴 뒤 `launchOf`로 다시 만들어 저장한다. 되살릴 때 `registerResume`이 herdr에 다시 등록한다.
- 세션 설정 파일의 env는 `refreshSettings`가 ATRIUM_*로 바꾸고 MTASK_*는 뺀다. 이미 돌던 claude의 프로세스 env는 MTASK_*이므로 `atrium-child.mjs`는 둘 다 읽는다. 옛 플러그인 shim은 `bin/mtask-child.mjs`를 절대 경로로 부르므로 그 파일을 별칭으로 남겼다.
- `[multitask 판]` 줄을 알아보는 코드는 없었다(글을 만들기만 한다). 짧은 안내에 "예전 이름으로 시작하는 지난 알림도 같다"는 문장을 넣었다(옛 이름 글자는 넣지 않음).
- 창 크기는 앱이 저장하지 않는다(늘 1600×960). 창 프로필 복사로 지키는 것은 localStorage(사이드바 열림·접힘·거르기, 알린 대기)와 Chromium 설정이다.
- `p12-quick`, `p14-tray`, `p15-close`는 포트(47826, 47829, 47830)가 이번에 쓰지 않을 범위라, `MT_E2E_HERDR_SESSION`·`MT_E2E_PORT`·`MT_E2E_DEV`·`MT_E2E_DIR`로 덮을 수 있게 했다.
- 살아 있는 문서는 이번 지시가 허락했지만 `docs-guard.mjs` 훅이 작업자의 Edit를 막는다. 지시 범위의 이름 바꾸기만 node 치환 스크립트(`backend/.dev/p18/t/rep.mjs`, git 밖)로 했다.
- 옛 판은 P18 전 코드(main `f82d36e`의 `backend/`를 `git archive`로 `backend/.dev/p18/oldcode`에 풂)로 만든다. 옛 창 프로필은 새 창을 옛 판 값과 `ATRIUM_APP_USERDATA=oldapp`로 붙여 만든다.
- 1차 창 시험: 옛 CLI의 `trust`가 백엔드를 요구해 시작 전에 멈췄다(만든 것 없음). 순서를 바꿨다.
- 2차 창 시험 `p18-migrate` 21/21 통과. 옮기기는 항목마다 옮기기(merge)로 갔다(창이 새 `logs`를 먼저 만들었다). 새 창이 판을 읽기까지 3.4초, 세 세션이 되살아나기까지 약 10초.
- 대표 창 시험을 새 이름 판(atrium-dev-p18-q12·q14·q15, 포트 47836~47838)에서: p12-quick 7/7, p14-tray 10/10, p15-close 4/4.
- 마지막에 더한 것: 개발용 기본 판은 데이터 폴더가 그대로라 herdr 세션 이름만 바뀐다. 옛 `multitask-dev` 서버가 돌면 새 백엔드가 같은 대화를 새 herdr에서 한 번 더 이어 갈 수 있어, 그때는 뜨지 않고 까닭을 알리게 했다(`checkLegacyDevHerdr`). 지금 `multitask-dev`는 멈춰 있다.
- 정리: 시험 세션, 창, 백엔드, 시험 herdr 서버와 세션(atrium-dev-p18-*), `backend/.dev/p18`의 시험 판, `C:\Workspace\mtask-p18-*`, 그 폴더의 대화 기록을 지웠다. 남은 프로세스 없음. p15-close의 삭제 시험이 보낸 대화 기록 하나는 Windows 휴지통에 있다.

## 보고

### 만든 것

- **이름과 환경 변수.** `backend/src/config.mjs`에 `APP_NAME`(Atrium), `APP_ID`(atrium), `LEGACY_ID`(multitask), `envVar(name)`. 환경 변수는 `ATRIUM_*`가 본 이름이고 `MTASK_*`도 받는다(둘 다 있으면 `ATRIUM_*`). 실제 판 `atrium`·`%LOCALAPPDATA%\atrium`·`atrium-app-real`·`atrium.real`, 개발용 `atrium-dev`·`atrium-app-dev`·`atrium.dev`. 포트는 그대로. 개발용 프로필은 새 실제 판과 옛 실제 판 값을 모두 막는다.
- **CLI.** `backend/bin/atrium.mjs`(본 명령), `atrium-features.mjs`, `atrium-child.mjs`. `mtask.mjs`와 `mtask-child.mjs`는 한 줄 별칭이다. package.json `atrium-backend`(bin `atrium`, `mtask`), `atrium-app`.
- **에이전트에게 가는 글.** 플러그인 `atrium-herdr`, 알림 머리 `[Atrium 판]`, 짧은 안내와 일 맡기기 스킬의 `atrium child`. 플러그인 `bin/`에 `atrium`과 `mtask`(sh, cmd) 둘. 승인 규칙도 두 이름. 세션 설정 파일 env는 `ATRIUM_*`로 다시 쓰고 `MTASK_*`는 뺀다. 대화 기록의 띄움 찾기(`spawns.mjs`)는 `atrium`·`mtask` 둘 다 알아보고 via는 `atrium-child|spawn`(창은 옛 via도 같은 글로).
- **창.** 창 제목, 트레이 툴팁, 알림 기본 제목, 확인창 제목, `<title>`이 `Atrium`. 설정 화면과 하위 세션 글은 `atrium child`. 바로가기 `make-shortcut.ps1`의 기본 이름 `Atrium`.
- **옮기기.** `backend/src/rename-migrate.mjs`(판 기록, herdr 판단), `backend.mjs`(store 연 뒤 경로 고치기, 이어 가기 인자 다시 만들기, `finishHerdrMigration`), `app/src/main/profile.mjs`(창 프로필 복사). 결과는 판 이벤트 `rename_migrated`, `rename_herdr_migrated`, 로그, `backend.status`의 `migration`, 이벤트 `backend.migration`. 문제가 있으면 트레이 툴팁·메뉴 줄과 OS 알림 한 번. 백엔드가 뜨지 못하면(옛 백엔드를 끄지 못함 등) 그 까닭이 트레이 툴팁에 간다(`client.startBackend`가 `backend.out`의 까닭 줄을 붙인다).
- **시험 막이.** `p9-guard.mjs`가 두 이름의 값과 시험 판 이름(`atrium-dev-*`, `multitask-dev-*`)을 받고, 실제 판 값은 새 것과 옛 것을 모두 막는다. `assertLegacyTestBoard`는 `ATRIUM_LEGACY_*` 셋도 시험 판 값인지 본다. `experiments/*/tools/env.cjs`(기록)의 `MTASK_*`는 `atriumEnv`로 바꿔 넣는다.
- **시험.**
  - 단위: 백엔드 184(전 170 + 환경 변수 1 + 옮기기 13), 창 36(전 34 + 옮기기 막이 1, 창 프로필 복사 1). 옮기기 단위 시험(`backend/test/p18.test.mjs`)이 옛 백엔드가 떠 있을 때(가짜 옛 백엔드를 띄워 끔, 끄지 못하면 멈춤), 옛 폴더를 옮기지 못할 때(복사, 표시 파일로 다시 안 옮김), 판 기록을 옮기지 못할 때(되돌림), 옛 herdr가 없을 때(판 기록만)를 본다.
  - 창: `app/test/e2e/p18-migrate.mjs` 21/21. 확인한 것: 옛 백엔드가 꺼짐, claude 둘이 같은 대화 ID로 새 herdr에서 `recreate_resume`, 셸 새 패널, 옛 herdr 세션 지워짐, 자리·덩어리·그룹·메모·한 줄 메모·보관 그대로, 설정 파일과 이어 가기 인자가 새 폴더, c1에 새 지시를 보내 같은 대화 기록에 이어짐, 사이드바 열림·접힘 그대로, 창 제목·트레이·알림·창 글·짧은 안내에 multitask 없음, `atrium`과 `mtask` CLI가 같은 판, 다시 켜도 두 번 옮기지 않음.
  - 대표 창 시험 p12-quick 7/7, p14-tray 10/10, p15-close 4/4(새 이름 판). 덮기 값 `MT_E2E_HERDR_SESSION`·`MT_E2E_PORT`·`MT_E2E_DEV`·`MT_E2E_DIR`을 더했다.
  - 결과: `experiments/p18/`(`p18-migrate.txt`·`.json`, 스크린숏 `p18-1-old-board`, `p18-2-new-board`, `p18-3-settings`, `p18-4-restarted`, `p12-quick.txt`, `p14-tray.txt`, `p15-close.txt` 등). 정리 도구는 `app/test/e2e/p18-clean.mjs`.
- **문서.** `CLAUDE.md`, `README.md`, `docs/ARCH.md`(이름, 명령, 설정 표에 창 프로필·앱 ID, 모듈 표에 "이름 옮기기" 행, API 표의 `backend.status`·이벤트), `docs/BRIEF.md`, `docs/PLAN.md`(제목), `docs/testing.md`. `docs/README.md`에는 이름이 없었다.

### 계획과 다른 곳

- 판 기록을 옮기는 조건을 "새 데이터 폴더가 없다" 대신 "새 데이터 폴더에 board.db가 없다"로 했다. 창과 CLI가 백엔드를 띄우기 전에 새 폴더의 `logs/backend.out`을 만들고 백엔드가 그것을 쥐기 때문이다. 그래서 실제 첫 실행은 통째로 이름 바꾸기가 아니라 항목마다 옮기기(같은 이름의 로그는 `x.legacy.ext`)로 간다. 항목을 옮기지 못하면 복사하고, 판 기록(board.db, -wal, -shm)을 옮기지도 복사하지도 못하면 되돌리고 뜨지 않는다.
- 옛 폴더의 표시 파일(`MOVED-TO-ATRIUM.json`)은 복사할 때만이 아니라 늘 둔다. 옛 `backend.json`은 새 백엔드를 가리키게 둔다(열린 옛 창이 옛 백엔드를 다시 띄우지 않고 새 판에 붙는다).
- 옛 herdr는 데이터 폴더를 옮기기 전에 끈다(옛 폴더의 herdr 로그를 쥔다). herdr 옮기기는 옛 판 기록을 옮겼을 때만 한다(표시 파일). 옛 herdr 세션이 멈춰 있어도(재부팅 뒤) 옮기기 대상이다.
- 옮긴 판의 열린 세션 패널 ID에 `legacy:`를 붙인다. 새 herdr가 같은 패널 ID를 다시 쓸 수 있어서다.
- 창 크기는 앱이 저장하지 않는다(늘 1600×960). 창 프로필 복사가 지키는 것은 localStorage(사이드바 열림·접힘·거르기, 알린 대기)와 Chromium 설정이다.
- `[multitask 판]` 줄을 알아보는 코드는 원래 없었다. 짧은 안내에 "이 판의 예전 이름으로 시작하는 지난 알림도 같다"는 문장만 넣었다(판 안내 글에 옛 이름을 쓰지 않으려고).
- BRIEF의 "이름" 행(`multitask`, `mtask`)은 고치지 않았다(지시: 지휘 세션이 넣는다). README 변경 이력의 P1 줄은 "시험용 CLI(지금 `atrium`)"로 고쳤다.
- 개발용 기본 판 막이(`checkLegacyDevHerdr`)를 더했다. 지시에 없던 것이다.
- Thread 출처 ID `mtask`(옛 기록)는 받고, 새 출처 `atrium`을 더했다. 시험 폴더 접두어 기본값 `mtask-`는 그대로 두었다(옛 시험 폴더 이름과 이번 지시의 `mtask-p18-*`).
- 작은 고침: 대화 기록에 `node …/atrium-child.mjs child <이름>` 꼴로 남은 줄의 이름을 `child`로 읽던 것. 백엔드 띄우기 기다림을 30초에서 60초로(첫 실행에 옛 백엔드·herdr를 끈다).
- 살아 있는 문서는 `docs-guard.mjs`가 작업자의 Edit를 막아, 지시 범위의 치환만 node 스크립트로 했다.

### 남은 multitask·mtask와 까닭(`rg`, 기록 문서 밖)

- 옛 이름 받기와 옮기기: `config.mjs`(`LEGACY_ID`, `envVar`의 `MTASK_`), `launch.mjs`(`LEGACY_PLUGIN_NAME`), `rename-migrate.mjs`, `branch.mjs`(별칭 `mtask` shim·승인 규칙, env에서 `MTASK_*` 빼기), `spawns.mjs`, `thread.mjs`, `adapter.mjs`(`cleanEnv`), `bin/mtask.mjs`, `bin/mtask-child.mjs`, package.json의 bin `mtask`, 창의 `profile.mjs`·`main.mjs`·`tray.mjs` 주석, `ConvoNode.jsx`·`items.js`(옛 기록의 ID), `p9-guard.mjs`, 시험(`p18*`, `p9-real.test.mjs`, `unit.test.mjs`, `p8.test.mjs`).
- 저장소 폴더 이름 `C:\Workspace\multitask`(바꾸지 않음): 시험의 워크스페이스 이름(`p5-*`, `p6a-*`, `c3.mjs`, `p6a-fonts.mjs`, 단위 시험 `p3`·`p4`·`p5`·`p13`·`unit`), 목업(`mock.js`의 장면, `grab-frames.mjs` 경로), `launch.mjs` 주석.
- 시험 폴더 접두어 `mtask-`(`config.mjs`, `missed.mjs`, 시험 `mtask-p*`).
- 문서: ARCH·testing의 옛 이름 언급(옛 실제 판 막기, 옮기기, 별칭), BRIEF의 "이름" 행.
- 기록 문서(`docs/decisions.md`, `docs/log/`, `docs/experiments/`, `docs/research/`, `experiments/`)는 고치지 않았다.

### 알려진 문제

- 옛 앱(옛 코드의 Electron, 트레이 상주)이 떠 있는 채로 새 앱을 켜면: 창 프로필 복사가 잠긴 파일을 건너뛸 수 있다(트레이에 알린다). 옛 창은 새 백엔드에 붙지만, 새 백엔드가 꺼진 뒤 옛 창이 옛 백엔드를 다시 띄우면 옛 이름으로 빈 판(`%LOCALAPPDATA%\multitask`, herdr `multitask`)이 새로 생길 수 있다. 그래서 옛 앱을 먼저 끝낸다(아래 순서).
- 진행 중이던 턴은 끊긴다(받아들인 것). 셸에서 돌던 명령도 끝나고 셸은 새 패널로 돌아온다(끊긴 명령 표시). 판이 띄운 codex 등 다른 종류와, 대화 ID를 모르는 판에 올린 에이전트는 J1 규칙대로 닫힘이 된다. 되살리지 못한 세션이 있으면 옛 herdr 세션은 지우지 않고 남긴다.
- 실패 알림은 트레이(툴팁, 메뉴 줄, OS 알림)로만 한다. 창 안 표시는 없다(renderer는 P16이 고치는 중).
- 옮기기 중 옛 백엔드 끄기(최대 15초)와 옛 herdr 끄기(최대 10초) 때문에 첫 실행이 길어질 수 있다. 시험에서는 약 10초.
- 개발용 기본 판의 멈춘 옛 herdr 세션 `multitask-dev`는 지우지 않는다.

### 합친 뒤 사용자가 할 일(순서대로)

1. 옛 앱을 끝낸다: 트레이 아이콘 메뉴의 "앱 끝내기(백엔드와 세션은 계속)". 백엔드와 herdr, 그 안의 claude 9개는 계속 돈다.
2. 바로가기를 만든다: `powershell -ExecutionPolicy Bypass -File app\scripts\make-shortcut.ps1`(바탕화면에 `Atrium.lnk`). 옛 `multitask.lnk`도 같은 `real.cmd`를 부르므로 눌러도 새 앱이 뜬다. 지울지는 지휘 세션이 묻는다.
3. Atrium 바로가기로 연다. 처음 켤 때 일어나는 일:
   - 창 프로필 `%APPDATA%\multitask-app-real`을 `atrium-app-real`로 복사한다(옛 것은 남는다).
   - 새 백엔드가 옛 백엔드(포트 47800)를 끄고, 옛 `backend.json`을 자기로 덮는다.
   - 옛 herdr 세션 `multitask`를 끈다. 그 안의 claude 9개와 셸이 끝나고, 진행 중이던 턴은 끊긴다.
   - `%LOCALAPPDATA%\multitask`의 판 기록을 `%LOCALAPPDATA%\atrium`으로 옮기고, 옛 폴더에는 `MOVED-TO-ATRIUM.json`과 `backend.json`만 남긴다. 기록 속 설정 파일·플러그인 경로와 이어 가기 인자를 고친다.
   - 새 herdr 세션 `atrium`을 띄우고, 판의 claude 세션을 같은 대화 ID로 이어 간다(새 플러그인 `atrium-herdr`). 셸은 같은 폴더의 새 셸로 돌아온다.
   - 다 되살리면 옛 herdr 세션 `multitask`를 지운다.
4. 확인: `node backend\bin\atrium.mjs status`(또는 `mtask status`)에 `migration`과 문제 목록이 있다. 판 이벤트 `rename_migrated`, `rename_herdr_migrated`. 트레이 툴팁에 "옮기기 문제"가 없으면 다 된 것이다.
5. 옛 폴더 `%LOCALAPPDATA%\multitask`와 옛 창 프로필 `%APPDATA%\multitask-app-real`은 확인 뒤 손으로 지워도 된다(옮기기는 지우지 않는다).
6. 개발용 기본 판은 herdr 세션 이름만 `atrium-dev`로 바뀐다. 옛 `multitask-dev` 서버가 돌면 백엔드가 뜨지 않으니, 그 세션을 정리하고 서버를 끈 뒤 띄운다.
