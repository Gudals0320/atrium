상태: 열림
날짜: 2026-11-06

## 지시

### 목표

하위 세션(워커)과 그 워크트리 상자가 부모 옆에 한 방향으로, 띄운 순서대로 늘어서게 한다. 누가 누구를 띄웠는지와 순서가 판에서 보이게 한다. 자동 정렬(정리)도 같은 규칙을 따른다.

### 사용자의 말

- 이슈 노트 셋: "자동 정렬 알고리즘을 좀 손보자. 뭔가 그닥 잘 작동하지 않는 거 같음."
- 무엇이 거슬리는지 물었을 때의 답: "워크트리 워커같은거 여러개 호출하면 한 방향에 딱 정렬이 되야 좋은데 사방팔방으로 흩어짐, 세션간 인과, order 이 식별이 잘안됨."

### 지금

- ARCH K4: 하위 세션은 부모 오른쪽 열의 빈자리에 놓이고 형제는 위아래로, 많으면 격자로 쌓인다(`backend/src/branch.mjs` `placeChild`, `childSlot`).
- `--worktree` 워커는 워크트리마다 노란 상자(영역)가 생긴다(`worktrees.mjs`, `store-worktrees.mjs`, `worktree-areas.mjs`). 상자 자리는 영역 겹침 풀기(`region-layout.mjs`, `settleRegions`·`separateRegions`)가 정한다. 그래서 워커 상자가 여기저기로 밀려 흩어진다.
- 정리(`board.arrange`, ARCH H7)는 영역 안을 나무 배치로 놓고 영역 묶음을 읽는 순서대로 줄 맞춘다. 워크트리 상자는 한 블록이지만 부모와의 관계와 띄운 순서는 보지 않는다.
- P73에서 새 세션과 하위 세션이 16:9 가로 보통(1440×810)으로 커졌다. 노드나 덩어리를 키워도 같은 영역의 옆 노드를 밀지 않아 겹치기 쉽다(P73 보고의 알려진 문제).

### 할 것

1. **한 방향 규칙.** 판의 나무는 왼쪽에서 오른쪽으로 자란다. 부모의 하위 세션은 부모 오른쪽에 위에서 아래로 한 열로, 띄운 순서(1, 2, 3…)대로 놓는다. 손자는 그 하위 세션 오른쪽에 같은 규칙으로 놓는다. 열이 아주 길어져도 격자로 접지 않는다. 화면에 맞추는 것은 사람이 확대·축소로 한다. 다른 규칙이 더 낫다고 보면 근거를 들어 보고에 적되, 한 방향과 띄운 순서는 지킨다.
2. **워크트리 상자도 그 줄에.** `--worktree` 워커의 상자는 그 워커가 놓일 자리에 놓는다. 형제 상자들은 같은 열에 띄운 순서대로 늘어선다. 영역 겹침 풀기가 이 줄을 흩지 않게 한다: 겹치면 그 줄 방향(아래)으로만 밀고, 줄의 순서를 바꾸지 않는다. 부모가 저장소 영역 안에 있고 워커가 워크트리 상자에 있어도 같은 줄이다. P68처럼 붙여 묶은 워커 덩어리는 한 블록으로 그 줄에 놓는다.
3. **새 워커를 띄울 때.** 형제 줄의 끝(마지막 형제 아래)에 놓는다. 줄 안에 다른 노드가 있으면 그 노드를 밀거나 줄을 그 아래로 잇는다. 사람이 이미 옮긴 노드는 다시 옮기지 않는다.
4. **정리 버튼.** 영역 정리와 판 전체 정리가 위 규칙을 쓴다: 부모 → 하위 세션 줄(띄운 순서) → 손자 줄. 연결이 없는 세션, 메모·칸반은 지금처럼 따로 놓는다. 정리 되돌리기는 그대로 한 번.
5. **크기가 바뀔 때.** 줄 안의 노드나 덩어리가 커지면 그 뒤의 형제를 줄 방향으로 밀어 겹치지 않게 한다. 작아지면 당기지 않는다(자리가 갑자기 움직이지 않게).
6. **순서와 인과 보이기.** 워커 노드 머리줄의 역할 칩(지금 "@s12의 워커·2단계")에 띄운 순서를 더한다. 예: "@s12의 워커 3". 같은 부모의 하위 세션끼리 같은 순서 번호가 겹치지 않게 한다. 부모 → 워커 선이 서로 엇갈리지 않게 줄 순서와 띄운 순서를 맞춘다. 사이드바와 미션 맵의 하위 세션 순서도 띄운 순서로 맞춘다(이미 그렇다면 그대로).
7. **이미 있는 판.** 사람이 정리를 누르거나 새 워커를 띄우기 전에는 지금 노드 자리를 옮기지 않는다.

### 완료 기준

1. 단위 시험을 더하고 통과한다.
   - 한 부모에 워커 다섯이 한 열로 띄운 순서대로 놓임. 손자는 오른쪽 열.
   - 워크트리 상자 다섯이 같은 줄에서 순서를 지키며, 영역 겹침 풀기 뒤에도 흩어지지 않음.
   - 붙여 묶은 워커 덩어리가 한 블록.
   - 정리가 같은 결과를 내고 한 번 되돌림.
   - 노드를 키우면 뒤 형제가 밀림.
   - 순서 번호.
   - 이미 있는 판의 자리가 그대로임.
2. 창 시험(개발용 판)으로 확인하고 전후 스크린숏을 `experiments/p75/`에 둔다.
   - 리드 하나가 `atrium child --worktree`로 워커 다섯을 띄운다(haiku). 시험 저장소의 신뢰가 필요하면 사람에게 개발용 판의 노드에서 답해 달라고 하고 기다린다(대신 답하지 않는다). P68의 창 시험 `app/test/e2e/p68-dock-worktrees.mjs`가 워크트리 워커를 띄운 방법을 먼저 본다.
   - 워커 하나가 다시 워커 둘을 띄운다.
   - 띄운 직후 배치, 정리 버튼 뒤, 워커 하나를 크게 바꾼 뒤를 찍는다.
   - 고치기 전 코드로도 같은 흐름을 찍어 비교한다.
3. `cd backend && npm test`, `cd app && npm test`, `cd app && npm run build`가 통과한다.

### 읽을 파일

- `CLAUDE.md`, `docs/testing.md`, ARCH 4절 H(H1, H5, H7)와 K4
- `docs/log/p68-worktree-dock.md`, `docs/log/p73-session-size-dock.md` 보고 절, `docs/log/p31-canvas-drag-arrange.md`(판 전체 정리)
- `backend/src/branch.mjs`(`placeChild`, `childSlot`), `backend/src/canvas.mjs`(`arrangeTree`, `regionsOf`, `separateRegions`), `backend/src/canvas-ops.mjs`(`arrange`, `arrangeBoard`), `backend/src/region-layout.mjs`, `backend/src/worktree-areas.mjs`, `backend/src/worktrees.mjs`, `backend/src/store-worktrees.mjs`
- `app/src/renderer/SessionNode.jsx`(역할 칩), `app/src/renderer/Sidebar.jsx`, `app/src/renderer/Mission.jsx`, 두 사전

### 시험 환경

- 이 작업은 `dev` 브랜치에서 시작한다. 워크트리를 연 뒤 먼저 `git fetch origin && git merge --ff-only origin/dev`를 한다(워크트리가 `main`에서 시작할 수 있다).
- 개발용 판은 너만의 판으로 띄운다(`docs/testing.md`).
  - `ATRIUM_HERDR_SESSION=atrium-dev-p75`, `ATRIUM_PORT=47896`, 창의 원격 디버깅 포트 9376
  - `ATRIUM_DATA_DIR=<워크트리>/backend/.dev/data`, `ATRIUM_APP_USERDATA=<워크트리>/backend/.dev/app`
- 실제 판(`atrium`, 47800)과 다른 판의 포트는 쓰지 않는다. 사용자의 기본 herdr 세션, 실제 판의 herdr 세션(`atrium`), 다른 판의 herdr 서버는 건드리지 않는다. 사용자의 실제 판은 열지도 캡처하지도 않는다.
- 너는 사용자의 실제 판 위에서 도는 워커다. 실제 판의 API(47800)와 `atrium` 명령으로 실제 판을 바꾸지 않는다. 시험의 `atrium` CLI는 늘 개발용 판 환경 변수(`ATRIUM_PORT` 등)를 주고 부른다.
- 실제 설치 폴더(`%LOCALAPPDATA%\\atrium\\versions`)와 실제 데이터 폴더(`%LOCALAPPDATA%\\atrium`)는 읽지도 바꾸지도 않는다.
- 대화 목록은 시험 폴더의 대화만 읽는다(`ATRIUM_CLAUDE_PROJECTS`, `ATRIUM_CLAUDE_DESKTOP=none`). 시험 폴더는 `C:\\Workspace\\mtask-p75-*`처럼 새로 만든다.
- 세션은 `claude --model haiku`와 셸로 띄운다.
- 끝나면 시험 세션, 창, 브라우저, 백엔드, herdr 서버와 세션(`atrium-dev-p75`만), 시험 폴더를 끄고 지운다. 네가 띄운 프로세스가 남지 않았는지 포트로 확인한다.

### 지킬 것

- `CLAUDE.md`를 따른다. 프로세스는 직접 띄운 것만 PID로 끈다.
- 이 저장소는 공개다. 작업 기록, 시험 코드, 커밋 메시지, 그림에 사용자 경로·메일·토큰, 실제 PC·tailnet 이름, IP, 실제 대화 내용을 쓰지 않는다. 커밋 전·푸시 전 검사를 건너뛰지 않는다.
- 화면 글은 영어와 한국어 사전 둘 다 고친다. 한국어 문구는 사전의 지금 말투(`docs/log/korean-copy-review.md`)를 따른다.
- 같은 때 지휘 세션이 다른 판(포트 47894·47895, herdr 세션 `atrium-dev-p74`)으로 합친 코드를 시험한다. 그 포트와 세션은 쓰지 않는다. 맡은 일에 필요한 만큼만 고치고, `styles.css`와 두 사전은 끝에 더해 합치기 쉽게 한다.
- 자기 브랜치에만 커밋한다. 커밋 메시지에 `Co-Authored-By` 줄을 넣지 않는다. `main`이나 `dev`를 바꾸거나 푸시하지 않는다. `node_modules`는 워크트리 안에서 받는다(`npm ci`, 창은 그 뒤 `node node_modules/electron/install.js`).
- 문서는 이 작업 파일의 작업 기록 절과 보고 절만 고친다. 고쳐야 할 ARCH·BRIEF·testing·README 문장은 보고 절에 짧게 적는다.
- 끝나면 보고 절을 쓰고, 맨 마지막에 `<워크트리>/backend/.dev/p75.done`(브랜치 이름과 마지막 커밋 해시 두 줄)을 만든다.

## 작업 기록

## 보고
