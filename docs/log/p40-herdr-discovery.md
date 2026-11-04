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

## 보고
