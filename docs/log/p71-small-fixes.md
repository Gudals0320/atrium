상태: 열림
날짜: 2026-11-06

## 지시

### 목표

작은 고침 넷: 워크트리 세션을 닫을 때 뜨는 확인 창, 사이드바 메뉴 단추 아이콘, 창 이름 옆 버전, 손으로 하는 버전 되돌리기 빼기.

### 할 것

1. **워크트리 나가기 확인 창.** 사용자의 말: "이거 뭐임? 워크트리 닫을 때 이상한 알림 뜸".
   - 상황: `claude -w`로 띄운 워크트리 세션이 끝날 때 Claude Code가 "Exiting worktree session / You have 13 commits on worktree-… The branch will be deleted if you remove the worktree. / 1. Keep worktree (Stays at …) / 2. …(지우기)"를 묻는다.
   - 보드는 이것을 모르는 창으로 보고 노드 아래에 "유형을 알 수 없는 확인 창 … 터미널에서 답하기"를 띄운다.
   - 고칠 것 1: 이 질문을 알아보는 종류를 더한다. 카드 제목은 "워크트리를 남길까요?"로 하고, 화면에서 읽은 선택지(남기기, 지우기)를 단추로 보인다.
   - 지우기 단추는 커밋이 있으면 "브랜치와 커밋 n개도 지워집니다"를 함께 보이고 한 번 더 묻는다.
   - 고칠 것 2: 보드에서 워크트리 세션을 닫을 때(노드 X, Delete 등 지금 닫는 길) 어떻게 Claude를 끝내는지 먼저 찾는다. 닫기 대화상자에 "워크트리 남기기(기본)"와 "워크트리와 브랜치 지우기"를 두고, 고른 대로 이 질문에 답해 세션이 멈춰 있지 않게 한다.
   - 사람이 고르지 않았으면 지우기를 고르지 않는다. 신뢰 질문은 이 일과 상관없이 지금처럼 대신 답하지 않는다.
2. **사이드바 메뉴 단추 아이콘.** 사용자의 말: "좌측 사이드바에서 뭐 옵션 표기 하는 아이콘이 날라감 … 이런 표기라고 있어야되는데."
   - 사이드바의 프로젝트(워크스페이스) 줄 오른쪽 끝, 누르면 "프로젝트 영역으로 이동, 그룹으로 이동, 이 프로젝트로 새 그룹 만들기, 오래된 항목 보관, 보드에서 제거…" 메뉴가 뜨는 단추에 `⋯` 아이콘이 보이지 않고 빈 네모만 있다.
   - 까닭을 찾아 고친다(아이콘 이름, 글꼴, CSS). 다른 줄(그룹, 세션)의 같은 단추도 확인한다.
3. **창 이름 옆 버전.** 사용자의 말: "atrium 실행 프로그램에서 상위 프로그램 이름 옆에 버전이 뜨게 해줄 수 있어?"
   - 창 제목을 `Atrium 0.1.2`처럼 한다(개발용 판은 지금처럼 `(dev)`를 붙인다). 버전은 지금 도는 창의 `app/package.json` version이다. dev 빌드면 `0.1.3-dev.1`처럼 그대로 보인다.
   - 창 안 위쪽에 Atrium 이름이나 로고가 있으면 그 옆에도 작게 보인다. 트레이 풍선 글에도 넣는다.
4. **버전 되돌리기 빼기.** 사용자의 말: "버전 복원 기능은 삭제해도 될듯".
   - 사람이 하는 되돌리기를 뺀다: 설정 › 일반 › 업데이트의 "v…로 되돌리기" 단추와 풀이, 트레이에 있으면 그 줄, `atrium update --rollback`, API `update.rollback`, 그 사전 열쇠와 시험.
   - 업데이트 중 새 백엔드가 뜨지 못할 때의 자동 되돌리기는 그대로 둔다(안전장치).
   - `current.json`의 `previous`와 옛 버전 폴더 지우기는 자동 되돌리기에 필요한 만큼만 남긴다. 바꾼 규칙을 보고에 적는다.
   - README 두 개에서 되돌리기를 말하는 곳이 있으면 보고에 적는다.

### 완료 기준

1. 단위 시험을 더하고 통과한다: 워크트리 나가기 화면 알아보기(커밋 수 읽기 포함), 닫기에서 고른 답, 버전이 든 창 제목, 되돌리기 API가 없어진 것.
2. 개발용 판에서 `claude -w`(haiku) 워크트리 세션을 띄워 커밋을 하나 만들게 한다. 보드에서 닫아 "남기기"와 "지우기"를 각각 확인한다(지우기는 시험 저장소에서만). 카드, 사이드바 단추, 창 제목, 업데이트 묶음의 전후 스크린숏을 `experiments/p71/`에 둔다.
3. `cd backend && npm test`, `cd app && npm test`, `cd app && npm run build`가 통과한다.

### 읽을 파일

- `CLAUDE.md`, `docs/testing.md`
- 확인 창 알아보기: `unknownDialog` 사전 열쇠를 쓰는 곳에서 시작해 백엔드의 화면 읽기(질문 종류 정하기)까지, `app/src/renderer/ApprovalCard.jsx`
- 세션 닫기: `app/src/renderer/SessionNode.jsx`, 닫기 대화상자, 백엔드의 세션 닫기(`/exit`를 보내는 곳)
- `app/src/renderer/Sidebar.jsx`, `app/src/renderer/lib/icons.jsx`
- `app/src/main/main.mjs`(창 제목), `app/src/main/tray.mjs`, `app/src/renderer/Chrome.jsx`
- `app/src/renderer/Update.jsx`, `app/src/renderer/update.js`, `backend/src/updater.mjs`, `backend/src/update.mjs`, `backend/bin/atrium-update.mjs`, `backend/bin/atrium.mjs`

### 시험 환경

- 이 작업은 `dev` 브랜치에서 시작한다. 워크트리를 연 뒤 먼저 `git fetch origin && git merge --ff-only origin/dev`를 한다(워크트리가 `main`에서 시작할 수 있다).
- 개발용 판은 너만의 판으로 띄운다(`docs/testing.md`).
  - `ATRIUM_HERDR_SESSION=atrium-dev-p71`, `ATRIUM_PORT=47891`, 창의 원격 디버깅 포트 9371
  - `ATRIUM_DATA_DIR=<워크트리>/backend/.dev/data`, `ATRIUM_APP_USERDATA=<워크트리>/backend/.dev/app`
- 실제 판(`atrium`, 47800)과 다른 판의 포트는 쓰지 않는다. 사용자의 기본 herdr 세션, 실제 판의 herdr 세션(`atrium`), 다른 판의 herdr 서버는 건드리지 않는다. 사용자의 실제 판은 열지도 캡처하지도 않는다.
- 너는 사용자의 실제 판 위에서 도는 워커다. 실제 판의 API(47800)와 `atrium` 명령으로 실제 판을 바꾸지 않는다. 시험의 `atrium` CLI는 늘 개발용 판 환경 변수(`ATRIUM_PORT` 등)를 주고 부른다.
- 실제 설치 폴더(`%LOCALAPPDATA%\atrium\versions`)와 실제 데이터 폴더(`%LOCALAPPDATA%\atrium`)는 읽지도 바꾸지도 않는다.
- 대화 목록은 시험 폴더의 대화만 읽는다(`ATRIUM_CLAUDE_PROJECTS`, `ATRIUM_CLAUDE_DESKTOP=none`). 시험 폴더는 `C:\Workspace\mtask-p71-*`처럼 새로 만든다.
- 세션은 `claude --model haiku`와 셸로 띄운다.
- 끝나면 시험 세션, 창, 브라우저, 백엔드, herdr 서버와 세션(`atrium-dev-p71`만), 시험 폴더를 끄고 지운다. 네가 띄운 프로세스가 남지 않았는지 포트로 확인한다.

### 지킬 것

- `CLAUDE.md`를 따른다. 프로세스는 직접 띄운 것만 PID로 끈다.
- 이 저장소는 공개다. 작업 기록, 시험 코드, 커밋 메시지, 그림에 사용자 경로·메일·토큰, 실제 PC·tailnet 이름, IP, 실제 대화 내용을 쓰지 않는다. 커밋 전·푸시 전 검사를 건너뛰지 않는다.
- 화면 글은 영어와 한국어 사전 둘 다 고친다. 한국어 문구는 사전의 지금 말투(`docs/log/korean-copy-review.md`)를 따른다.
- 같은 때 다른 작업자(P72(기본 호출자와 Codex 모델), P73(세션 크기와 덩어리), P74(휴대폰 화면과 웹앱))가 돈다. 맡은 일에 필요한 만큼만 고치고, `styles.css`와 두 사전은 끝에 더해 합치기 쉽게 한다.
- 자기 브랜치에만 커밋한다. 커밋 메시지에 `Co-Authored-By` 줄을 넣지 않는다. `main`이나 `dev`를 바꾸거나 푸시하지 않는다. `node_modules`는 워크트리 안에서 받는다(`npm ci`, 창은 그 뒤 `node node_modules/electron/install.js`).
- 문서는 이 작업 파일의 작업 기록 절과 보고 절만 고친다. 고쳐야 할 ARCH·BRIEF·testing·README 문장은 보고 절에 짧게 적는다.
- 끝나면 보고 절을 쓰고, 맨 마지막에 `<워크트리>/backend/.dev/p71.done`(브랜치 이름과 마지막 커밋 해시 두 줄)을 만든다.

## 작업 기록

## 보고
