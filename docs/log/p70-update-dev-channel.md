상태: 열림
날짜: 2026-11-06

## 지시

### 목표

앱 안 업데이트(P69)에 dev 채널을 더한다. 사용자는 실제 판을 설치 폴더의 버전으로 쓰면서 dev 브랜치에 합친 기능도 바로 써야 한다. 사용자의 말: "앞으로 내가 실사용할때 dev 버전 사용도 해야하는데 dev 업데이트 같은것도 할 수 있어야하나". 지휘 세션이 추천한 방향(dev 채널, GitHub 사전 릴리즈)을 사용자가 골랐다.

- dev 빌드는 GitHub 사전 릴리즈(prerelease)로 낸다. 태그는 `v<주>.<부>.<수>-dev.<n>`(예: `v0.1.2-dev.1`)이고 dev 브랜치의 커밋을 가리킨다. 사전 릴리즈는 GitHub의 Latest를 바꾸지 않으므로 정식 채널은 지금처럼 정식 릴리즈만 본다.
- 판 설정에 업데이트 채널(정식/dev, 기본 정식)을 둔다. dev 채널이면 정식과 사전 릴리즈 가운데 가장 높은 버전을 알린다.
- 그 밖의 업데이트 흐름(사람이 눌러 업데이트, 백엔드와 창만 바꾸고 herdr 세션은 이어 감, 실패하면 되돌림)은 P69 그대로다.

### 할 것

1. **판 설정 `updateChannel`.** 값은 `stable`·`dev`, 기본 `stable`(`backend/src/settings.mjs`). 설정 › 일반 › 업데이트 묶음(`app/src/renderer/Update.jsx`)에 채널 고르기를 둔다. 채널을 바꾸면 바로 다시 확인한다.
   - dev 채널 설명: dev 브랜치에 합친 기능을 먼저 받는다. 정식보다 덜 다듬어졌을 수 있다.
   - 지금 dev 버전을 쓰면 묶음에 그렇게 보인다(예: "v0.1.2-dev.1 (dev)").
2. **확인.** 정식 채널은 지금처럼 `releases/latest`를 본다. dev 채널은 같은 저장소의 릴리즈 목록(`/repos/Gudals0320/atrium/releases?per_page=30`)을 읽는다.
   - 초안과 버전 꼴이 아닌 태그는 뺀다. 정식과 사전 릴리즈 가운데 `compareVersions`로 가장 높은 것을 고른다.
   - 시험의 `ATRIUM_UPDATE_API`(가짜 서버의 `.../releases/latest`)에서 목록 주소를 만든다(`/releases/latest` → `/releases?per_page=30`). 받기 주소 검사(`checkDownloadUrl`)는 그대로 쓴다.
   - 확인 결과에 어느 채널로 확인했는지 남긴다. 채널을 바꾼 뒤 앞 채널의 결과로 알리지 않는다.
3. **채널을 dev에서 정식으로 돌릴 때.** 지금 dev 버전보다 높은 정식 릴리즈가 나올 때만 알린다(낮은 버전으로 내려가지 않는다). 바로 앞 버전으로 되돌리기(`atrium update --rollback`)는 그대로 둔다.
4. **CLI.**
   - `atrium update --check`와 `atrium update`는 백엔드가 돌면 판 설정의 채널을 따른다.
   - `--channel stable|dev`는 그 한 번만 채널을 바꾼다.
   - `atrium install --channel dev`는 가장 높은 dev 빌드를 설치한다.
   - 도움말 줄을 고친다.
5. **릴리즈 확인 스크립트.** `scripts/release-check.mjs`가 dev 태그(`v<x.y.z>-dev.<n>`)도 받는다.
   - dev 태그에서는 main이 dev와 같지 않아도 된다. 대신 태그가 dev를 가리키는지, main이 dev의 조상인지 본다.
   - 두 package.json의 version이 태그와 같은지 본다.
   - 그 버전이 지금 정식 릴리즈(main의 version)보다 높은지 본다.
   - 정식 태그의 검사는 그대로다.
   - 머리 주석에 dev 빌드 절차를 더한다: dev에서 version을 `x.y.z-dev.n`으로 올려 커밋하고 푸시 → 확인 → dev 커밋에 태그 → 태그 푸시 → `gh release create <태그> --prerelease` → `--remote` 확인.
6. **README.** `README.md`와 `README.ko.md`에 설치와 업데이트를 짧게 더한다.
   - `node backend\bin\atrium.mjs install`로 설치 폴더(`%LOCALAPPDATA%\atrium\versions`)에 깔고 바로가기를 만든다.
   - 앱이 새 릴리즈를 알리고, 누르면 업데이트한다. herdr 세션은 이어 간다.
   - dev 채널이 있다.
   - 시작하기 절의 git 클론 방법은 그대로 둔다.

### 완료 기준

1. 단위 시험을 더하고 통과한다.
   - 목록 읽기: dev는 사전 릴리즈를 포함해 가장 높은 것을 고르고, 초안과 버전 꼴이 아닌 태그는 뺀다. 정식은 사전 릴리즈를 보지 않는다.
   - 목록 주소 만들기.
   - 채널을 바꾸면 결과를 다시 확인한다.
   - dev에서 정식으로 돌리면 낮은 버전을 알리지 않는다.
   - `release-check`의 dev 태그 검사(통과와 실패 모두).
2. 끝까지 시험한다(개발용 판, `ATRIUM_INSTALL_DIR`는 시험 폴더, 가짜 릴리즈 서버). 결과는 `experiments/p70/`에 둔다.
   - 가짜 서버는 `releases/latest`(정식 중 가장 높은 것)와 `releases` 목록을 내준다.
   - 시험 흐름:
     1. v0.1.1 설치. 서버에 v0.1.2-dev.1(사전)만 더한다.
     2. 정식 채널에서는 알림이 없다.
     3. dev 채널로 바꾸면 v0.1.2-dev.1을 알리고, 창의 단추로 업데이트한다. 셸 세션의 herdr 패널과 터미널 글이 그대로 남는다.
     4. v0.1.2-dev.2를 더하면 알림이 오고 업데이트된다.
     5. 정식 채널로 바꾸면 알림이 없다.
     6. v0.1.2(정식)를 더하면 알림이 오고 업데이트된다.
   - 한국어 화면에서 설정 묶음을 한 번 찍는다.
3. `cd backend && npm test`, `cd app && npm test`, `cd app && npm run build`가 통과한다.

### 읽을 파일

- `CLAUDE.md`, `docs/testing.md`, `docs/log/p69-in-app-update.md`(설계와 시험 요령, 가짜 서버)
- `backend/src/update.mjs`(`parseRelease`, `checkDownloadUrl`, `compareVersions`, `runningVersion`), `backend/src/updater.mjs`(`check`, `view`), `backend/src/settings.mjs`
- `backend/bin/atrium-update.mjs`, `backend/bin/atrium.mjs`(도움말), `scripts/release-check.mjs`
- `app/src/renderer/Update.jsx`, `app/src/main/tray.mjs`(업데이트 줄), 두 사전(`app/src/renderer/locales/en.js`, `ko.js`)
- P69의 끝까지 시험 도구(가짜 릴리즈 서버 포함)는 git 밖에 있다: 저장소 폴더의 `experiments/p69/tools/`(워크트리에서 `../../../experiments/p69/tools/`). 읽기만 하고, 고칠 것은 `experiments/p70/`에 복사해 고친다.

### 시험 환경

- 이 작업은 `dev` 브랜치에서 시작한다. 워크트리를 연 뒤 먼저 `git fetch origin && git merge --ff-only origin/dev`를 한다(워크트리가 `main`에서 시작할 수 있다).
- 개발용 판은 너만의 판으로 띄운다(`docs/testing.md`).
  - `ATRIUM_HERDR_SESSION=atrium-dev-p70`, `ATRIUM_PORT=47896`
  - `ATRIUM_DATA_DIR=<워크트리>/backend/.dev/data`, `ATRIUM_APP_USERDATA=<워크트리>/backend/.dev/app`
  - 가짜 릴리즈 서버는 포트 47897을 쓴다.
- 실제 판(`atrium`, 47800)과 다른 판의 포트는 쓰지 않는다. 사용자의 기본 herdr 세션과 다른 판의 herdr 서버는 건드리지 않는다. 사용자의 실제 판은 열지도 캡처하지도 않는다.
- 실제 설치 폴더(`%LOCALAPPDATA%\atrium\versions`)에는 지금 사용자의 실제 판이 설치되어 있다. 읽지도 바꾸지도 않는다. 시험은 늘 `ATRIUM_INSTALL_DIR`로 시험 폴더를 준다.
- 진짜 GitHub 릴리즈와 태그를 만들거나 바꾸지 않는다. 시험은 가짜 서버로만 한다.
- 대화 목록은 시험 폴더의 대화만 읽는다(`ATRIUM_CLAUDE_PROJECTS`, `ATRIUM_CLAUDE_DESKTOP=none`). 시험 폴더는 `C:\Workspace\mtask-p70-*`처럼 새로 만든다.
- 세션은 셸로 띄운다(필요하면 `claude --model haiku`).
- 끝나면 시험 세션, 창, 백엔드, herdr 서버와 세션(`atrium-dev-p70`만), 가짜 서버, 시험 폴더를 끄고 지운다. 네가 띄운 프로세스가 남지 않았는지 포트로 확인한다.

### 지킬 것

- `CLAUDE.md`를 따른다. 프로세스는 직접 띄운 것만 PID로 끈다.
- 이 저장소는 공개다. 작업 기록, 시험 코드, 커밋 메시지, 그림에 사용자 경로·메일·토큰, 실제 PC·tailnet 이름, IP, 실제 대화 내용을 쓰지 않는다. 커밋 전·푸시 전 검사를 건너뛰지 않는다.
- 화면 글은 영어와 한국어 사전 둘 다 고친다. 한국어 문구는 사전의 지금 말투(`docs/log/korean-copy-review.md`)를 따른다.
- 자기 브랜치에만 커밋한다. 커밋 메시지에 `Co-Authored-By` 줄을 넣지 않는다. `main`이나 `dev`를 바꾸거나 푸시하지 않는다. `node_modules`는 워크트리 안에서 받는다(`npm ci`).
- 문서는 이 작업 파일의 작업 기록 절과 보고 절, 그리고 README 두 개만 고친다. 고쳐야 할 ARCH·BRIEF·testing 문장은 보고 절에 짧게 적는다.
- 끝나면 보고 절을 쓰고, 맨 마지막에 `<워크트리>/backend/.dev/p70.done`(브랜치 이름과 마지막 커밋 해시 두 줄)을 만든다.

## 작업 기록

## 보고
