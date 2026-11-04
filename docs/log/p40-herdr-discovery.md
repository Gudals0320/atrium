상태: 열림
날짜: 2026-11-04

## 지시

### 목표

herdr의 경로와 버전에 덜 묶이게 한다. 사용자의 말은 다음과 같다.
- "README에 있는 이 내용, herdr 절대경로 의존성 아니야? herdr 업데이트 등.. 하면 백엔드 꼬이는거 아님?"
- "사용자별로 다를 수 있을 거 같은데, herdr 찾는 로직 같은 거 혹은 herdr 없을 때 프로그램이 어떻게 동작할지 등에 대해 생각해봐야 할 듯."

지휘 세션이 확인한 지금 상태는 다음과 같다.
- **찾기:** `config.mjs`는 `ATRIUM_HERDR`가 없으면 `~\.herdr\packages\standalone\releases\0.9.5-x86_64-pc-windows-msvc\herdr.exe` 하나만 본다. 버전 폴더 이름이 코드에 있다.
  - 이 PC의 herdr 설치기는 `~\.herdr\packages\standalone\current` 링크로 지금 버전 폴더를 가리킨다.
  - PATH에는 버전 폴더와 `%LOCALAPPDATA%\Programs\Herdr\bin\herdr.exe`가 함께 있다.
- **버전:** `adapter.checkCompat`는 서버 ping의 버전이 정확히 `0.9.5`이고 프로토콜이 `22`여야 한다. 다르면 세션 띄우기가 `herdr_incompatible`로 막힌다.
- **herdr가 없을 때:** `startServer`의 `spawn`에 `error` 처리가 없다. 실행 파일이 없으면 ENOENT를 전역 처리기(`main.mjs`)가 삼킨다. 그 뒤 15초를 기다리다 `start_failed`("server did not answer ping in 15s")로 백엔드 시작이 실패해, 창이 보드를 열지 못한다. 메시지에는 herdr를 못 찾았다는 말이 없다.
- **에이전트가 치는 herdr:** 패널 안의 에이전트가 치는 `herdr agent prompt` 등은 PATH의 herdr를 쓴다. 판 서버와 다른 버전일 수 있다.

사용자와 정한 방향은 아래 "할 것"과 같다. 버전은 **프로토콜이 같으면 붙고, 시험하지 않은 버전이면 경고**한다(사용자가 이 설계로 맡김).

### 할 것

1. **찾는 순서.** 차례로 본다.
   1. `ATRIUM_HERDR`
   2. 설정의 herdr 경로(새 설정 `herdrPath`, ⚙ 일반 탭에서 바꿈)
   3. herdr 설치기의 `current` 링크(`~\.herdr\packages\standalone\current\herdr.exe`)
   4. PATH(`where herdr`의 순서)
   5. 알려진 설치 폴더(`%LOCALAPPDATA%\Programs\Herdr\bin` 등)
   - 후보마다 `herdr --version`으로 버전을 읽어 확인한다. 고른 경로, 까닭, 본 후보와 결과를 진단(`herdr.status`, `atrium herdr status`)에 남긴다.
   - 찾기는 순수 함수로 두고, 파일 시스템·실행·환경 변수를 넘겨받아 단위 시험한다.
2. **도는 서버 우선.**
   - 이미 떠 있는 판의 herdr 서버에 붙을 때는 그 서버 프로세스의 실행 파일 경로를 쓴다(`resources.mjs`가 이미 herdr 프로세스의 명령 줄을 읽는다). 그래야 백엔드가 부르는 CLI, 제어기(`terminal session control`), `--skill` 글이 서버와 같은 버전이 된다.
   - 1의 결과는 새 서버를 띄울 때만 쓴다.
   - 서버 실행 파일을 못 읽으면 1의 결과를 쓰고, 진단에 그렇게 적는다.
3. **패널 PATH.** 판이 herdr 서버를 띄울 때, 그 herdr가 든 폴더를 서버 env의 PATH 맨 앞에 넣는다. 그러면 패널 안 에이전트가 치는 `herdr`가 서버와 같은 실행 파일이 된다. 개발용 판의 셸 패널에서 `where herdr`로 확인한다.
4. **버전 정책.**
   - 기준은 프로토콜이다. 지원하는 프로토콜 목록(지금 `[22]`)과 시험한 버전 목록(지금 `['0.9.5']`)을 `config.mjs`에 둔다.
   - 프로토콜이 지원 목록에 있으면 붙는다. 시험한 버전이 아니면 "검증하지 않은 herdr 버전 X(프로토콜 22)"를 판 이벤트, 진단, 창의 노란 표시로 알린다.
   - 프로토콜이 다르면 세션 띄우기만 막고 보드는 연다. 까닭과 할 일(맞는 herdr 설치, 경로 지정)을 보인다.
   - 버전마다 다를 수 있는 글 읽기(`herdr agent` 도움말의 종류 줄, `--skill`, 서버 로그)는 실패하면 기본값으로 넘어가고 오류로 멈추지 않는다.
5. **herdr가 없을 때.**
   - 실행 파일이 없거나 실행되지 않으면 백엔드는 15초를 기다리지 않고 바로 뜬다. `spawn` 오류를 받아 처리한다.
   - 보드는 연다. 메모, 칸반, 지난 대화, 설정은 쓸 수 있다.
   - 창 위에 "herdr를 찾지 못했습니다" 띠를 띄운다. 찾아본 곳, 설치 안내(`https://herdr.dev`), 경로 지정(설정으로 가기), 다시 찾기 단추를 보인다.
   - 세션 띄우기(레일, 새 세션 창, 런처, `atrium child`, CLI)는 까닭과 함께 막는다.
   - 다시 찾기나 설정 저장으로 herdr를 찾으면, 백엔드를 다시 켜지 않고 서버를 띄워 붙는다.
6. **업데이트 감지.**
   - 판 서버가 도는 동안 1의 결과가 다른(더 새) 버전을 가리키게 되면 알림만 한다. 예: "새 herdr 0.9.6이 설치됨. 판 서버는 0.9.5로 도는 중. 다시 띄우면 세션이 끝나므로 원할 때 트레이에서."
   - 저절로 다시 띄우지 않는다. 알아채는 때(뜰 때, 주기적으로, 진단 때)는 네가 정한다.
7. **화면 글과 문서.**
   - 새 화면 글은 `locales/en.js`·`ko.js`에 더한다. 한국어는 P39의 말투(합니다체)와 용어(보드, 앱 연결 서비스, herdr 서버 등)를 따른다(`docs/log/p39-korean-ui.md` 보고 절의 용어표).
   - `README.md`와 `README.ko.md`의 herdr 줄을 고친다. 뜻: PATH나 herdr 설치 폴더에서 찾는다, 0.9.5(프로토콜 22)로 시험했다, 다른 경로는 `ATRIUM_HERDR`나 설정으로 준다.

### 완료 기준

1. 단위 시험을 더하고 통과한다.
   - 찾는 순서와 후보 확인(각 단계가 있을 때·없을 때·실행 안 될 때)
   - 도는 서버의 실행 파일 고르기
   - 버전 정책(같은 버전, 프로토콜 같고 버전 다름, 프로토콜 다름, 응답 없음)
   - PATH 앞에 넣기
   - herdr 없음에서 세션 띄우기를 막는 응답
2. 개발용 판으로 확인하고 스크린숏을 `experiments/p40/`(git 밖)에 남긴다.
   - **없는 경로:** `ATRIUM_HERDR`를 없는 경로로 주고 다른 후보도 없게 하면(시험용 env로 PATH와 홈을 가린다), 백엔드가 몇 초 안에 뜨고, 보드가 열리고, 띠가 보이고, 새 세션이 까닭과 함께 막힌다.
   - **경로 지정:** 그 상태에서 설정으로 실제 herdr 경로를 주면 다시 켜지 않고 붙어 세션을 띄울 수 있다.
   - **패널 PATH:** 셸 패널에서 `where herdr`의 첫 줄이 판 서버의 실행 파일이다.
   - **시험하지 않은 버전:** 시험한 버전 목록을 시험용으로 바꿔 보면 노란 경고가 뜨고 세션은 띄울 수 있다.
   - **다른 프로토콜:** 지원 프로토콜 목록을 시험용으로 바꿔 보면 세션 띄우기가 까닭과 함께 막히고 보드는 열려 있다.
3. `cd backend && npm test`, `cd app && npm test`, `cd app && npm run build`가 통과한다.

### 시험 환경

- 너만의 개발용 판으로 띄운다(`docs/testing.md`).
  - `ATRIUM_HERDR_SESSION=atrium-dev-p40`, `ATRIUM_PORT=47858`
  - `ATRIUM_DATA_DIR=<워크트리>/backend/.dev/data`, `ATRIUM_APP_USERDATA=<워크트리>/backend/.dev/app`
- 실제 판(`atrium`, 47800)과 47811~47857은 쓰지 않는다.
- 대화 목록은 시험 폴더의 대화만 읽는다(`ATRIUM_CLAUDE_PROJECTS`, `ATRIUM_CLAUDE_DESKTOP=none`). 시험 폴더는 `C:\Workspace\mtask-p40-*`처럼 새로 만든다.
- 사용자가 설치한 herdr는 지우거나 옮기거나 업데이트하지 않는다. "없음"과 "다른 버전"은 env, 가짜 후보 폴더, 시험용 목록으로만 흉내 낸다. 기본 herdr 세션과 다른 판의 herdr 서버는 건드리지 않는다.
- 세션은 셸 노드로 시험한다. claude가 꼭 필요하면 `--model haiku`, 턴은 짧게.
- 끝나면 시험 세션, 창, 백엔드, herdr 서버와 세션(`atrium-dev-p40`만), 시험 폴더, 시험 대화 기록을 끄고 지운다.

### 지킬 것

- `CLAUDE.md`를 따른다. 프로세스는 직접 띄운 것만 PID로 끈다.
- 이 저장소는 공개다. 작업 기록, 커밋 메시지, 시험 코드에 사용자 경로·메일·토큰을 쓰지 않는다. 경로는 `%USERPROFILE%`, `~`, 시험용 가짜 이름으로 쓴다. 커밋 전·푸시 전 검사(`scripts/check-public.mjs`)를 건너뛰지 않는다.
- 자기 브랜치에만 커밋한다. 커밋 메시지에 `Co-Authored-By: Claude` 줄을 넣지 않는다. `main`을 바꾸거나 푸시하지 않는다. `node_modules`는 워크트리 안에서 받는다(`npm ci`).
- `docs/ARCH.md`, `docs/BRIEF.md`, `docs/testing.md`는 고치지 않는다. 고쳐야 할 행(ARCH 1절 herdr 호환, 4절의 herdr 시작, 설정·API 표, 모듈 표, BRIEF의 herdr 행, testing.md의 herdr 경로)은 보고 절에 새 문장으로 적는다. 문서는 이 작업 파일의 작업 기록 절과 보고 절, 그리고 README 두 개의 herdr 줄만 고친다.
- 끝나면 보고 절을 쓰고, 맨 마지막에 `<워크트리>/backend/.dev/p40.done`(브랜치 이름과 마지막 커밋 해시 두 줄)을 만든다.

### 읽을 파일

- `CLAUDE.md`, `docs/testing.md`, `docs/ARCH.md` 1절과 herdr 시작·복구 행
- `backend/src/config.mjs`, `backend/src/herdr/adapter.mjs`(checkCompat, startServer, cliVersion, skillText, kinds, 제어기), `backend/src/backend.mjs`(ensureHerdr, herdr.status, herdrOk를 보는 곳), `backend/src/resources.mjs`(herdr 프로세스 명령 줄), `backend/src/main.mjs`, `backend/src/settings.mjs`, `backend/bin/atrium.mjs`(herdr status)
- `app/src/main/main.mjs`, `app/src/main/tray.mjs`, `app/src/renderer/Settings.jsx`, `Chrome.jsx`(띠를 둘 곳)

## 작업 기록

- 2026-11-04 코드를 읽었다. 실행 파일 경로는 `config.mjs`에 고정되어 있었다. `checkCompat`은 버전이 정확히 같아야 했고, `startServer`에는 `spawn` 오류 처리가 없었다. 지휘 세션이 적은 지금 상태와 같았다.
- 찾기, 버전 정책, 도는 서버의 실행 파일, PATH 앞에 넣기, 업데이트 감지를 순수 함수 모듈 `backend/src/herdr/discover.mjs`로 만들었다. 실제 파일 시스템과 실행을 붙이는 `findHerdr`, `readServerExe`, `registryPath`는 `adapter.mjs`에 두었다(herdr를 부르는 코드는 어댑터 안에만 둔다).
- 백엔드는 어댑터를 만든 직후 `resolveHerdr`로 실행 파일을 고른다. herdr가 없거나 서버가 뜨지 않으면 `ensureHerdr`는 던지지 않고 `missing` 상태로 둔다. `herdr.rediscover` API를 더했고, 설정 `herdrPath`를 저장해도 같은 길로 다시 찾는다.
- 창: 위 가운데 띠(`InboxBar.jsx` Warnings)에 herdr 띠 넷을 더했다. 연결 알약(`Chrome.jsx`)은 "herdr 없음"·"herdr 지원 안 됨"을 보이고 켜기 단추를 숨긴다. 설정 일반 탭에는 herdr 경로 칸을 더했다.
- 개발용 판 시험(`app/test/e2e/p40-herdr.mjs`)의 첫 실행에서 패널 PATH가 틀렸다. 셸 패널의 `where herdr` 첫 줄은 맞게 나왔지만, 패널 PATH의 첫 폴더는 JDK였다. 사용자 PATH의 순서 덕에 우연히 맞은 것이었다.
  - 따로 확인했다(`experiments/p40/tools/probe-env*.mjs`, 세션 `atrium-dev-p40`만). 서버 env에 넣은 표시 변수는 패널에 이어졌지만 PATH는 이어지지 않았다. herdr는 새 패널의 PATH를 레지스트리에서 다시 만든다(패널 PATH 62개 항목, 백엔드 PATH 45개 항목).
  - herdr 0.9.5의 소켓 API는 `workspace.create`·`pane.split`·`tab.create`에 `env`를 받는다. `workspace.create`에 `env.PATH`를 주면 그 패널에 그대로 들어갔다. env 없이 `pane.split`한 패널은 herdr가 만든 PATH를 받았다.
  - 그래서 판이 만드는 작업 공간(`adapter.createWorkspace`, 판의 모든 새 패널이 지나는 곳)에 `env.PATH`를 준다. 값은 레지스트리 Machine+User PATH 맨 앞에 판 서버의 herdr 폴더를 넣은 것이다. 서버 env의 PATH 앞에 넣기는 지시대로 남겼지만 패널에는 효과가 없다.
- 시험을 고친 뒤 다섯 경우가 모두 통과했다(아래 보고 2).
- 처음 스크린숏에서 두 가지를 고쳤다. 띠의 "프로토콜 ?"는 `herdr.status`가 프로토콜을 위 단계에 주지 않아서였다. 경로 저장 알림이 "연결했습니다" 대신 "저장했습니다"로 나온 것은 다시 찾기가 이벤트 구독이 붙기 전에 답해서였다. 다시 찾기는 이제 구독을 최대 5초 기다린다.

## 보고

### 한 일

1. **찾는 순서**(`herdr/discover.mjs` `herdrCandidates`, `discoverHerdr`)
   - 순서: `ATRIUM_HERDR` → 설정 `herdrPath` → `~\.herdr\packages\standalone\current\herdr.exe` → `where herdr`의 순서 → 알려진 폴더(`%LOCALAPPDATA%\Programs\Herdr\bin`, `~\.herdr\packages\standalone\releases\*` 새 버전부터, `~\.herdr\bin`).
   - 같은 경로는 한 번만 본다. 후보마다 `--version`을 읽어, 버전을 읽은 첫 후보를 고른다.
   - 후보마다 결과(`not_found`, `not_runnable`, `no_version`, 찾은 버전)를 남긴다. `herdr.status`의 `find`와 `atrium status`의 후보 줄에서 보인다.
   - `config.mjs`의 고정 경로를 없앴다. `cfg.herdrPath`는 뜰 때 고른 결과다.
2. **도는 서버 우선**(`resolveHerdr`, `readServerExe`, `herdrServerExe`)
   - 판 서버가 돌면 Win32_Process의 `ExecutablePath`(못 읽으면 명령 줄 첫 낱말)에서 `--session <판> server` 프로세스를 찾는다. 서버 PID가 있으면 그 PID를 먼저 본다.
   - 그 실행 파일을 CLI·제어기·`--skill`에 쓴다. 서버 실행 파일을 못 읽으면 찾기 결과를 쓰고 진단의 `note`에 적는다.
   - herdr가 다시 붙을 때(판 밖에서 다시 띄웠을 수 있다)도 다시 읽는다.
3. **패널 PATH.** 서버 env의 PATH 앞에 넣는다. 그리고 판이 만드는 작업 공간의 `env.PATH`(레지스트리 PATH 앞에 herdr 폴더)로 실제로 맞춘다. 까닭은 작업 기록에 있다. env를 거부하는 herdr면 env 없이 다시 만든다.
4. **버전 정책**(`herdrCompat`)
   - `config.mjs`에 `HERDR_PROTOCOLS = [22]`와 `HERDR_TESTED = ['0.9.5']`를 둔다. 시험용으로 `ATRIUM_HERDR_PROTOCOLS`와 `ATRIUM_HERDR_TESTED`(쉼표로 여럿)로 바꿀 수 있다.
   - 결과의 `level`은 `ok`, `untested`, `incompatible`, `none`, `missing` 가운데 하나다. `untested`는 붙고, 판 이벤트(`herdr_untested`)·진단(`warning`)·노란 띠로 알린다. `incompatible`은 세션 띄우기만 `herdr_incompatible`(까닭, 지원 프로토콜, 할 일)로 막고 보드는 연다.
   - 버전마다 다를 수 있는 글 읽기는 실패해도 멈추지 않는다. 종류 줄을 못 읽으면 빈 목록이라 종류를 막지 않는다. `--skill`은 기본 글로 넘어가고, 서버 로그는 이미 읽기 실패를 견딘다.
5. **herdr가 없을 때**
   - 고른 경로가 없으면 서버를 띄우지 않고 곧바로 `missing`이다. `startServer`는 `spawn` 오류와 0이 아닌 종료 코드를 받아 바로 실패한다(`spawn_failed`, `server_exited`). `ensureHerdr`는 그것을 받아 `missing`으로 두고 백엔드는 뜬다.
   - 창 위의 빨간 띠는 "herdr를 찾지 못했습니다", 찾아본 곳(펼침), herdr 설치(`https://herdr.dev`), 경로 지정(설정 열기), 다시 찾기를 보인다.
   - `requireHerdr`가 `herdr_missing`(열쇠 `herdrMissing`)으로 막는다. 레일, 새 세션 창, 런처, `atrium child`, CLI가 모두 이 길을 지난다.
   - 다시 찾기나 설정 저장으로 찾으면 같은 백엔드가 서버를 띄우고 구독을 붙인다. 플러그인의 herdr 스킬 글도 그 herdr 것으로 다시 쓴다.
   - `herdr.start`·`restart`도 다시 찾은 뒤 띄운다. 트레이의 다시 띄우기는 업데이트한 herdr로 뜬다.
6. **업데이트 감지**(`checkHerdrUpdate`, `updateNotice`)
   - 뜰 때, 30분마다(`ATRIUM_HERDR_UPDATE_MS`), 진단 때(1분에 한 번까지), 다시 붙을 때 본다.
   - 찾기 결과가 도는 서버보다 새 버전이면 판 이벤트 `herdr_update_available`과 노란 띠로 한 버전에 한 번 알린다. 저절로 다시 띄우지 않는다.
7. **화면 글과 문서**
   - `locales/en.js`·`ko.js`에 `backend.herdrMissing`·`herdrIncompatible`·`herdrStartFailed`를 더했다. `warn.herdr*`(띠), `top.herdrMissing`·`herdrIncompatible`(알약), `settings.herdrPath*`·`herdrFrom.*`(설정)도 더했다. 한국어는 합니다체이고 보드, herdr 서버, 설정을 썼다.
   - `README.md`·`README.ko.md`의 herdr 줄을 고쳤다.
8. CLI: `atrium status`가 실행 파일, 까닭, 경고, 알림을 보인다. 못 찾았으면 후보도 보인다. `atrium herdr rediscover`를 더했다.

### 완료 기준

1. **단위 시험** `backend/test/p40.test.mjs`: 14개, 모두 통과.
   - 찾는 순서와 같은 경로 빼기
   - 단계마다 있을 때 고르기, 없을 때·실행 안 될 때·버전이 없을 때 건너뛰기
   - 버전 읽기·비교, 도는 서버의 실행 파일 고르기
   - 버전 정책 넷(같음, 프로토콜 같고 버전 다름, 프로토콜 다름, 응답 없음)과 시험용 덮기
   - PATH 앞에 넣기, 작업 공간 env와 env 거부 때 다시 만들기
   - 업데이트 알림
   - herdr 없음: 바로 `missing`, `session.spawn`이 `herdr_missing`. 실행 안 됨: `spawn_failed`가 5초 안에 오고 던지지 않음
   - 다른 프로토콜에서 막힘, 시험하지 않은 버전에서 붙고 이벤트는 한 번
2. **개발용 판**(`atrium-dev-p40`, 47858): `MT_E2E_OUT=p40 node test/e2e/p40-herdr.mjs`. 스크린숏과 `p40-herdr.json`은 `experiments/p40/`에 있다.
   - **없는 경로:** 가린 env(없는 `ATRIUM_HERDR`, herdr 폴더를 뺀 PATH, 가짜 USERPROFILE·LOCALAPPDATA)에서 백엔드가 0.13~0.23초에 떴다. 보드가 열렸고 빨간 띠에 후보 4곳이 보였다. API와 새 세션 창의 띄우기가 `herdr_missing` 알림과 함께 막혔다(`p40-1-missing-band.png`, `p40-1-missing-spawn-blocked.png`).
   - **경로 지정:** 띠의 "경로 지정"에서 설정에 실제 경로를 저장하자 같은 백엔드 PID 그대로 0.46~0.66초 뒤 붙었다. 셸 세션이 떴다(`p40-2-settings-path.png`, `p40-2-settings-connected.png`).
   - **패널 PATH:** 셸 패널에서 `where.exe herdr` 첫 줄이 판 서버의 실행 파일과 같은 글자였다. `$env:Path`의 첫 폴더도 그 폴더였다(`p40-3-panel-where.png`는 시험 4의 화면에 함께 보인다).
   - **시험하지 않은 버전:** `ATRIUM_HERDR_TESTED=0.0.1`로 띄우니 노란 띠 "검증하지 않은 herdr 버전 0.9.5(프로토콜 22)"가 떴다. 새 셸 세션이 떴고, 이때 고른 까닭은 `server`(도는 서버의 실행 파일)였다(`p40-4-untested-band.png`).
   - **다른 프로토콜:** `ATRIUM_HERDR_PROTOCOLS=99`로 띄우니 빨간 띠가 떴다. 세션 띄우기는 `herdr_incompatible`로 막혔고 보드에 세션 둘이 보였다(`p40-5-protocol-band.png`).
3. `cd backend && npm test` 335 통과. `cd app && npm test` 100 통과. `cd app && npm run build` 성공.
4. 정리: 시험이 끝날 때마다 창, 백엔드(CLI로), herdr 서버와 세션 `atrium-dev-p40`(stop, `session delete`), 시험 폴더(`C:\Workspace\mtask-p40-proj`, `mtask-p40-probe`), `backend/.dev`의 시험 데이터를 지웠다. 시험 대화 기록은 만들지 않았다(셸만 씀). 포트 47858에는 TIME_WAIT만 남았다. 사용자가 설치한 herdr, 기본 세션, 다른 판은 읽기만 했다.

### 지시와 다르게 한 것, 남은 것

- **패널 PATH(지시 3):** 서버 env의 PATH 맨 앞에 넣는 방법으로는 패널 PATH가 바뀌지 않는다. herdr가 새 패널의 PATH를 레지스트리에서 다시 만든다. 그래서 작업 공간을 만들 때 `env.PATH`를 준다.
  - 남는 틈: 에이전트가 패널 안에서 `herdr pane split`·`tab create`·`workspace create`로 만든 패널은 herdr가 만든 PATH를 받는다. 그 패널의 `herdr`는 사용자 PATH의 첫 herdr다.
  - 메우려면 herdr 설정(`config.toml`, 사용자 공용이라 판이 고치지 않는다)이나 herdr 쪽 기능이 필요하다. 열린 결정으로 PLAN에 올릴 만하다.
- **레지스트리 PATH:** 판의 패널 PATH는 레지스트리 Machine+User PATH에 herdr 폴더를 더한 것이다. 사용자 셸 프로필이 PATH를 더하는 것은 그대로 된다. 레지스트리를 못 읽으면 백엔드의 PATH를 쓴다.
- **업데이트 감지**는 단위 시험으로만 확인했다. 진짜 새 버전 파일 없이 개발용 판에서 흉내 내려면 `--version`에 다른 버전을 답하는 실행 파일이 필요하다. `.cmd`는 `execFile`로 부를 수 없다.
- **이미 떠 있는 서버:** 판 밖에서 다른 경로로 띄운 서버에 붙으면, 그 서버가 띄운 패널의 PATH는 그 서버의 것이다. 새로 만드는 작업 공간은 서버 실행 파일의 폴더를 앞에 넣는다.
- 시험 4·5에서 패널에 사용자 PowerShell 프로필의 오류 줄이 찍혔다. 시험 1·2에서 가린 USERPROFILE로 띄운 서버가 그대로 남아 있어서다. 시험용 env의 결과이고, 판의 문제가 아니다.

### 살아 있는 문서에 넣을 새 문장(고치지 않았다)

- **ARCH 1절 "herdr 서버 띄우기"**
  - 35행을 바꾼다: "herdr는 프로토콜로 맞춘다. 붙을 때 `ping`의 `protocol`이 지원 목록(`config.mjs` `HERDR_PROTOCOLS`, 지금 [22])에 있고 `capabilities`가 있으면 붙는다. 버전이 시험한 목록(`HERDR_TESTED`, 지금 0.9.5)에 없으면 붙되 판 이벤트·진단·노란 띠로 경고한다. 프로토콜이 다르면 세션 띄우기만 막고 보드는 연다."
  - 새 문장: "herdr 실행 파일은 뜰 때 찾는다. 판 서버가 돌면 그 서버의 실행 파일을 쓴다. 아니면 `ATRIUM_HERDR` → 설정 herdr 경로 → herdr 설치기의 `current` 링크 → PATH → 알려진 설치 폴더 순서로 보고 `--version`으로 확인한다(`herdr/discover.mjs`). herdr를 못 찾거나 서버가 뜨지 않아도 백엔드는 뜨고 세션 띄우기만 막는다. 다시 찾기(`herdr.rediscover`)나 설정 저장으로 찾으면 백엔드를 다시 켜지 않고 서버를 띄워 붙는다."
  - 34행 뒤 새 문장: "herdr는 새 패널의 PATH를 레지스트리에서 다시 만들어 서버 env의 PATH를 잇지 않는다. 판은 작업 공간을 만들 때 `env.PATH`(레지스트리 PATH 맨 앞에 판 서버의 herdr 폴더)를 줘서 패널의 `herdr`를 판 서버와 같게 한다. 패널 안에서 herdr로 새로 나눈 패널은 그렇지 않다."
- **ARCH 4절(herdr 시작·복구 행):** "판 서버가 도는 동안 찾기 결과가 더 새 herdr를 가리키면 알리기만 한다(뜰 때, 30분마다, 진단 때). 다시 띄우기(트레이, `atrium herdr restart`)는 찾기 결과의 herdr로 띄운다."
- **ARCH 설정 표:** "`herdrPath` | 빈 글 | herdr 실행 파일 경로. 비우면 찾는다. 바꾸면 다시 찾는다(P40)."
- **ARCH API 표:** "`herdr.rediscover` | herdr를 다시 찾고, 못 붙어 있으면 서버를 띄워 붙는다. 답은 `herdr.status`와 같다." 그리고 "`herdr.status`에 `path`, `level`, `warning`, `version`, `protocol`, `protocols`, `tested`, `missing`, `update`, `find`(고른 경로와 까닭, 본 후보와 결과)를 더한다." 오류 코드: "`herdr_missing`(herdr를 못 찾음), `herdr_incompatible`(프로토콜이 다름)."
- **ARCH 모듈 표:** "`herdr/discover.mjs` | herdr 찾기 순서, 버전 정책, 도는 서버의 실행 파일, PATH 앞에 넣기, 업데이트 알림(순수 함수, P40)."
- **BRIEF "정한 것" 기술 구성 행:** "터미널은 herdr 0.9.5(버전 고정)"을 "터미널은 herdr(프로토콜 22, 0.9.5로 시험). 다른 버전은 프로토콜이 같으면 경고와 함께 쓴다(2026-11-04 사용자 결정, P40)"로 바꾼다. 옛 문장은 `docs/decisions.md`로 옮긴다.
- **testing.md:** "herdr 경로는 고정하지 않는다. 시험 판은 실제 herdr를 찾아 쓴다. herdr 없음은 가린 env(없는 `ATRIUM_HERDR`, herdr 폴더를 뺀 PATH, 가짜 `USERPROFILE`·`LOCALAPPDATA`)로, 다른 버전·프로토콜은 `ATRIUM_HERDR_TESTED`·`ATRIUM_HERDR_PROTOCOLS`로 흉내 낸다(`app/test/e2e/p40-herdr.mjs`). 사용자가 설치한 herdr는 바꾸지 않는다."
