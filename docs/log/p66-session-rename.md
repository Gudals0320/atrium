상태: 열림
날짜: 2026-11-06

## 지시

### 목표

세션 이름을 바꿀 수 있게 한다. 사용자의 말: "호출한 세션에 대해 이름 수정이 있으면 좋겠다. s12 네이밍으로 태어난 세션은 평생 s12임?".

지금은 세션 이름이 herdr 에이전트 이름을 따른다(`backend/src/backend.mjs`의 `renamed` 이벤트). 판이 정한 `s12`, 에이전트가 `atrium child`로 정한 `p1-wine-headless`가 그대로 평생 간다.

### 할 것

1. **판의 이름(표시 이름).** 세션마다 사람이 정한 이름을 판 기록에 둔다. 노드 머리, 사이드바, 미션 맵, 찾기, 요청 기록, 알림, `atrium ls`에 그 이름을 보인다. 이름을 비우면 원래 이름으로 돌아간다.
2. **에이전트가 쓰는 주소는 깨지지 않게.** 부모 에이전트는 하위 세션을 herdr 이름(`herdr agent prompt <이름>`, `atrium child`의 응답)으로 부른다. 이 이름을 바꾸면 일하던 에이전트의 명령이 깨진다.
   - 그래서 기본은 판의 이름만 바꾸고 herdr 이름은 그대로 둔다. 노드 머리의 툴팁이나 작은 글로 "에이전트 주소: s12"를 보인다.
   - herdr에 에이전트 이름 바꾸기가 있는지 확인한다(herdr 0.9.5, 프로토콜 22, 네 개발용 herdr 세션에서만 시험). 있어도 이번에는 쓰지 않고 보고 절에 적는다.
3. **이름으로 부르기.** 명령 바의 `@이름`, `atrium send @이름`, 판 CLI의 세션 지정은 새 이름과 옛 주소를 둘 다 받는다. 판 안에서 이름은 겹치지 않아야 한다(대소문자 무시). `@`로 부를 수 있는 글자만 받고(지금의 이름 규칙을 따른다), 길이 상한을 둔다. 겹치거나 틀리면 이유를 보인다.
4. **바꾸는 곳.** 노드 머리 이름을 두 번 누르기(또는 메뉴 "이름 바꾸기"), 사이드바 줄의 메뉴, `atrium rename <세션> <새 이름>`(`--clear`로 되돌리기). F2 키로도 고른 노드의 이름을 바꾼다. 화면에서 바꾼 것과 CLI로 바꾼 것이 모든 창(원격 웹 화면 포함)에 곧바로 보인다.
5. **오래 남기.** 이름은 백엔드, 창, herdr를 다시 켜도, 잠재웠다 깨워도, 이어 가기(`resume_argv`)로 되살아나도 남는다. herdr 이름이 바뀌어도(지금의 `renamed` 동기화) 판의 이름은 덮지 않는다. 이름을 바꾸면 판 이벤트(`renamed`, 누가: 사람·CLI)를 남긴다.

### 완료 기준

1. 단위 시험을 더하고 통과한다: 이름 규칙과 겹침, 비우기, `@`·CLI가 새 이름과 옛 주소를 둘 다 받음, herdr 이름 바뀜이 판의 이름을 덮지 않음, 다시 켠 뒤에도 남음.
2. 창 시험(개발용 판)으로 확인하고 결과를 `experiments/p66/`에 둔다: 노드에서 두 번 눌러 바꾸기, 사이드바 메뉴, F2, CLI, `@새이름`으로 보내기, 백엔드를 다시 켠 뒤에도 남음, 하위 세션(`atrium child`로 띄움)의 이름을 바꿔도 부모 에이전트가 옛 주소로 일을 시킬 수 있음.
3. `cd backend && npm test`, `cd app && npm test`, `cd app && npm run build`가 통과한다.

### 읽을 파일

- `CLAUDE.md`, `docs/testing.md`
- `backend/src/backend.mjs`(세션 이름, `renamed`), `backend/src/store.mjs`(`renameSession`), `backend/src/branch.mjs`, `backend/bin/atrium.mjs`, 이름 풀기(`@이름`)를 하는 곳
- `app/src/renderer/SessionNode.jsx`, `app/src/renderer/Sidebar.jsx`(묶음 이름 바꾸기가 쓰는 입력칸), `app/src/renderer/CommandBar.jsx`, 두 사전

### 시험 환경

- 이 작업은 `dev` 브랜치에서 시작한다. 워크트리를 연 뒤 먼저 `git fetch origin && git merge --ff-only origin/dev`를 한다(워크트리가 `main`에서 시작할 수 있다).
- 개발용 판은 너만의 판으로 띄운다(`docs/testing.md`).
  - `ATRIUM_HERDR_SESSION=atrium-dev-p66`, `ATRIUM_PORT=47893`
  - `ATRIUM_DATA_DIR=<워크트리>/backend/.dev/data`, `ATRIUM_APP_USERDATA=<워크트리>/backend/.dev/app`
- 실제 판(`atrium`, 47800)과 다른 판의 포트는 쓰지 않는다. 사용자의 기본 herdr 세션과 다른 판의 herdr 서버는 건드리지 않는다. 사용자의 실제 판은 열지도 캡처하지도 않는다.
- 대화 목록은 시험 폴더의 대화만 읽는다(`ATRIUM_CLAUDE_PROJECTS`, `ATRIUM_CLAUDE_DESKTOP=none`). 시험 폴더는 `C:\Workspace\mtask-p66-*`처럼 새로 만든다.
- 세션은 `claude --model haiku`와 셸로 띄운다.
- 끝나면 시험 세션, 창, 브라우저, 백엔드, herdr 서버와 세션(`atrium-dev-p66`만), 시험 폴더를 끄고 지운다. 네가 띄운 프로세스가 남지 않았는지 포트로 확인한다.

### 지킬 것

- `CLAUDE.md`를 따른다. 프로세스는 직접 띄운 것만 PID로 끈다.
- 이 저장소는 공개다. 작업 기록, 시험 코드, 커밋 메시지, 그림에 사용자 경로·메일·토큰, 실제 PC·tailnet 이름, IP, 실제 대화 내용을 쓰지 않는다. 커밋 전·푸시 전 검사를 건너뛰지 않는다.
- 화면 글은 영어와 한국어 사전 둘 다 고친다. 한국어 문구는 사전의 지금 말투(최근 문구 검토, `docs/log/korean-copy-review.md`)를 따른다.
- 같은 때 다른 작업자(P65(터미널 선명도), P67(연결 이름표))가 돈다. 맡은 일에 필요한 만큼만 고치고, `styles.css`와 두 사전은 끝에 더해 합치기 쉽게 한다.
- 자기 브랜치에만 커밋한다. 커밋 메시지에 `Co-Authored-By` 줄을 넣지 않는다. `main`이나 `dev`를 바꾸거나 푸시하지 않는다. `node_modules`는 워크트리 안에서 받는다(`npm ci`).
- 문서는 이 작업 파일의 작업 기록 절과 보고 절만 고친다. 고쳐야 할 ARCH·BRIEF·testing 문장은 보고 절에 짧게 적는다.
- 끝나면 보고 절을 쓰고, 맨 마지막에 `<워크트리>/backend/.dev/p66.done`(브랜치 이름과 마지막 커밋 해시 두 줄)을 만든다.

## 작업 기록

## 보고
