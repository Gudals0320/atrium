상태: 열림
날짜: 2026-11-06

## 지시

### 목표

앱 안에서 새 릴리즈로 업데이트하는 기능을 만든다. 진행 중인 세션(herdr)은 그대로 두고 백엔드와 창만 새 버전으로 바꾼다. 사용자의 말: "릴리즈 자동으로 내려받는 업데이트 기능 만들자. 앞으로 작업은 main 보다 커밋이 같거나 앞서있는 dev 브랜치에서 진행하고 주기적으로 fast-forward 후 main 에서 릴리즈. 앱 내부에 업데이트 기능 만들어 근데 herdr 백엔드 닫지 않고(진행 중인 세션 유지하면서) 업데이트만 딱 할 수 있어야 됨".

사용자가 고른 방향:
- 설치 폴더를 따로 둔다. 실제 판은 설치 폴더의 버전에서 돌고, git 폴더(`C:\Workspace\multitask` 같은 개발용 클론)는 개발용으로만 남는다.
- 새 릴리즈가 나오면 알리고, 사람이 눌러서 업데이트한다. 자동 설치는 하지 않는다.

### 할 것

1. **설치 폴더.** 실제 판의 코드는 `%LOCALAPPDATA%\atrium\versions\<태그>\`(저장소 소스 전체, 백엔드와 창, 그 안의 `node_modules`와 `app/dist`)에 둔다. 지금 쓰는 버전은 `%LOCALAPPDATA%\atrium\versions\current.json` 같은 작은 파일이 가리킨다. 판 데이터(`%LOCALAPPDATA%\atrium`의 판 기록, 플러그인, 세션 설정 파일)는 버전 밖에 있고 그대로 쓴다.
   - 시험과 개발용 판은 `ATRIUM_INSTALL_DIR`로 설치 폴더를 바꾼다. 시험은 실제 설치 폴더를 건드리지 않는다.
2. **처음 설치.** git 폴더에서 `atrium install`(또는 같은 뜻의 스크립트)이 최신 릴리즈를 설치 폴더에 깔고, 바탕화면 바로가기(`app/scripts/make-shortcut.ps1`)가 설치 폴더의 지금 버전을 띄우게 한다. 바로가기는 작은 실행기를 부르고, 실행기가 `current.json`을 읽어 그 버전의 Electron을 띄운다. 업데이트 뒤에도 바로가기를 다시 만들 필요가 없어야 한다.
3. **새 릴리즈 확인.** GitHub API(`https://api.github.com/repos/Gudals0320/atrium/releases/latest`, 인증 없음)로 몇 시간마다(그리고 창을 켤 때) 확인한다. 정식 릴리즈만 본다(초안·사전 릴리즈 제외). 지금 버전은 설치 폴더의 버전 태그와 `app/package.json`의 `version`으로 안다. 판 설정에 "업데이트 확인"(기본 켬)을 둔다. 확인 결과와 마지막 확인 시각은 판 기록에 둔다.
4. **알림.** 새 버전이 있으면 창에 알린다(토스트 한 번, 그리고 설정 › 일반 아래 "업데이트" 묶음과 트레이 메뉴에 계속). 묶음에는 지금 버전, 새 버전, 릴리즈 노트 링크, "지금 확인", "업데이트" 단추가 있다. `atrium update [--check]`도 같은 일을 한다.
5. **업데이트(누를 때).**
   1. 받기: 릴리즈 태그의 소스 압축(zipball/tarball)을 HTTPS로 받아 `versions\<새 태그>.staging\`에 푼다. 받는 주소는 GitHub API가 준 이 저장소의 것만 쓴다.
   2. 준비: 그 폴더에서 `backend`·`app`에 `npm ci`(잠금 파일 그대로)와 `npm run build`를 돈다. 이동안 지금 판은 그대로 돈다. 진행을 창에 보인다. 실패하면 지우고 이유를 보인다.
   3. 확인: 새 백엔드가 뜰 수 있는지 미리 본다(예: 모듈 불러오기, Node 버전, herdr 프로토콜).
   4. 바꾸기: `current.json`을 새 버전으로 바꾸고, 지금 백엔드만 끈다(herdr 서버는 끄지 않는다). 새 버전의 백엔드를 띄우고, 창은 새 버전의 Electron으로 다시 뜬다(`app.relaunch` 또는 실행기). 백엔드는 다시 켤 때처럼 herdr의 세션에 다시 붙는다(ARCH 4절 C3). 판 플러그인(`<데이터>/plugin/atrium-herdr`)은 새 백엔드가 다시 만든다.
   5. 되돌리기: 새 백엔드가 정해진 시간 안에 건강 확인을 통과하지 못하면 `current.json`을 옛 버전으로 돌리고 옛 백엔드를 다시 띄운다. 바로 앞 버전 하나는 지우지 않고 남기고(`atrium update --rollback`), 그보다 옛 버전은 지운다.
   - 원격 웹 화면은 업데이트 중 "PC에서 업데이트 중" 띠를 보이고 끝나면 다시 붙는다.
6. **릴리즈 절차.** 앞으로 작업은 `dev`에서 하고, 릴리즈 때 `main`을 `dev`로 fast-forward한 뒤 태그를 단다. 태그와 `app/package.json`·`backend/package.json`의 `version`이 같아야 업데이트가 버전을 맞게 읽는다. 이를 확인하는 짧은 스크립트(예: `scripts/release-check.mjs`: 태그와 두 `version`이 같은지, main이 dev와 같은지)를 둔다. 절차는 보고 절에 적는다(지휘 세션이 문서에 옮긴다).

### 완료 기준

1. 단위 시험을 더하고 통과한다: 버전 비교, 릴리즈 API 응답 읽기(정식만), 받기 주소 검사, `current.json` 바꾸기와 되돌리기, 오래된 버전 지우기, 실패한 준비의 정리.
2. 끝까지 시험한다(개발용 판, `ATRIUM_INSTALL_DIR`는 시험 폴더). 결과는 `experiments/p69/`.
   - 가짜 릴리즈 서버(로컬 HTTP, 포트 47897)가 `releases/latest` JSON과 이 저장소의 지금 트리로 만든 압축(버전을 올린 것)을 내준다. 시험에서만 API 주소를 가짜 서버로 바꾼다(`ATRIUM_UPDATE_API` 등).
   - 설치 → 셸 세션과 claude(haiku) 세션 띄우기 → 새 버전 알림 → 업데이트 → 세션의 herdr 패널과 터미널이 그대로 이어지고(같은 패널 ID, 업데이트 전 친 글이 남음) 창과 백엔드가 새 버전임을 보인다.
   - 새 백엔드가 뜨지 못하는 가짜 버전으로 되돌리기를 보인다.
3. `cd backend && npm test`, `cd app && npm test`, `cd app && npm run build`가 통과한다.

### 읽을 파일

- `CLAUDE.md`, `docs/testing.md`, `README.md`(Quick start)
- `app/src/main/main.mjs`(`ensureBackend`), `app/src/main/tray.mjs`, `app/src/main/profile.mjs`, `app/scripts/make-shortcut.ps1`, `app/scripts/real.cmd`
- `backend/src/client.mjs`(`startBackend`, `stopBackend`), `backend/src/config.mjs`, `backend/src/backend.mjs`(시작과 herdr 붙기), `backend/bin/atrium.mjs`

### 시험 환경

- 이 작업은 `dev` 브랜치에서 시작한다. 워크트리를 연 뒤 먼저 `git fetch origin && git merge --ff-only origin/dev`를 한다(워크트리가 `main`에서 시작할 수 있다).
- 개발용 판은 너만의 판으로 띄운다(`docs/testing.md`).
  - `ATRIUM_HERDR_SESSION=atrium-dev-p69`, `ATRIUM_PORT=47896`
  - `ATRIUM_DATA_DIR=<워크트리>/backend/.dev/data`, `ATRIUM_APP_USERDATA=<워크트리>/backend/.dev/app`
- 실제 판(`atrium`, 47800)과 다른 판의 포트는 쓰지 않는다. 사용자의 기본 herdr 세션과 다른 판의 herdr 서버는 건드리지 않는다. 사용자의 실제 판은 열지도 캡처하지도 않는다.
- 대화 목록은 시험 폴더의 대화만 읽는다(`ATRIUM_CLAUDE_PROJECTS`, `ATRIUM_CLAUDE_DESKTOP=none`). 시험 폴더는 `C:\\Workspace\\mtask-p69-*`처럼 새로 만든다.
- 세션은 `claude --model haiku`와 셸로 띄운다.
- 끝나면 시험 세션, 창, 브라우저, 백엔드, herdr 서버와 세션(`atrium-dev-p69`만), 시험 폴더를 끄고 지운다. 네가 띄운 프로세스가 남지 않았는지 포트로 확인한다.

### 지킬 것

- `CLAUDE.md`를 따른다. 프로세스는 직접 띄운 것만 PID로 끈다.
- 이 저장소는 공개다. 작업 기록, 시험 코드, 커밋 메시지, 그림에 사용자 경로·메일·토큰, 실제 PC·tailnet 이름, IP, 실제 대화 내용을 쓰지 않는다. 커밋 전·푸시 전 검사를 건너뛰지 않는다.
- 화면 글은 영어와 한국어 사전 둘 다 고친다. 한국어 문구는 사전의 지금 말투(최근 문구 검토, `docs/log/korean-copy-review.md`)를 따른다.
- 같은 때 다른 작업자(P65(터미널 선명도), P66(세션 이름), P67(연결 이름표), P68(워크트리 붙이기))가 돈다. 맡은 일에 필요한 만큼만 고치고, `styles.css`와 두 사전은 끝에 더해 합치기 쉽게 한다.
- 자기 브랜치에만 커밋한다. 커밋 메시지에 `Co-Authored-By` 줄을 넣지 않는다. `main`이나 `dev`를 바꾸거나 푸시하지 않는다. `node_modules`는 워크트리 안에서 받는다(`npm ci`).
- 문서는 이 작업 파일의 작업 기록 절과 보고 절만 고친다. 고쳐야 할 ARCH·BRIEF·testing 문장은 보고 절에 짧게 적는다.
- 끝나면 보고 절을 쓰고, 맨 마지막에 `<워크트리>/backend/.dev/p69.done`(브랜치 이름과 마지막 커밋 해시 두 줄)을 만든다.

## 작업 기록

## 보고
