상태: 열림
날짜: 2026-11-06

## 지시

### 목표

같은 저장소의 서로 다른 워크트리 세션도 붙여 묶을 수 있게 한다. 사용자의 말: "worktree 막 6개씩 호출하고 그러는데 얘네들끼리는 dock 이 안되잖아? 근데 얘네들을 그래도 좀 붙이고싶은데". 사용자가 고른 방향: "워크트리끼리도 붙이기".

지금은 리드가 `atrium child --worktree`로 워커를 여럿 띄우면 워크트리마다 노란 상자(ARCH 4절 G1·H5, `backend/src/worktrees.mjs`, `store-worktrees.mjs`)가 따로 생긴다. 상자가 다른 세션끼리는 붙여 묶을 수 없다.

### 할 것

1. **붙이기 허용.** 같은 워크스페이스(같은 저장소 키)라면 워크트리가 달라도 세션끼리 붙여 묶을 수 있다. 본 저장소 세션과 워크트리 세션을 붙이는 것도 된다. 다른 워크스페이스(다른 저장소) 세션끼리는 지금처럼 붙이지 않는다.
   - 방법은 지금 붙이기와 같다: `Ctrl`+끌기, 배치 틀(여럿 고르고 1 + 2, 2 × 2 등), 덩어리 바깥 가장자리 가까이 놓기.
2. **붙인 뒤의 자리.** 붙인 세션은 노란 워크트리 상자에서 빠지고, 덩어리는 그 저장소 영역 안에 놓인다. 세션이 빠져 빈 워크트리 상자는 숨긴다(워크트리 자체는 그대로). 덩어리에서 떼면 그 세션은 자기 워크트리 상자로 돌아간다. 세션의 워크트리 정보는 바뀌지 않는다.
3. **덩어리 안의 표시.** 덩어리 안 칸마다 그 세션의 브랜치·워크트리 이름을 머리에 작게 보인다(예: `⎇ feature/dark-mode`). 칸끼리 브랜치가 다르다는 것이 한눈에 보여야 한다. 색은 노란 워크트리 표시와 맞춘다.
4. **한 번에 붙이기.** 리드가 띄운 워크트리 워커들을 한 번에 붙이는 길을 둔다. 예: 워크트리 상자 머리나 리드 노드 메뉴의 "워커 붙여 묶기"가 그 리드의 하위 세션들을 세션 수에 맞는 배치 틀로 묶는다. 같은 일을 CLI(`atrium dock …` 같은 지금의 판 명령이 있으면 그것)로도 할 수 있게 한다.
5. **정리·저장·다시 켜기.** 판 정리(`board.arrange`), 영역 정리, 워크트리 상자 자리 정하기가 이런 덩어리를 깨지 않는다. 백엔드·창·herdr를 다시 켜도 덩어리와 상자 상태가 남는다. 워크트리를 지우거나 세션을 닫으면 지금처럼 잎을 빼고 나무를 정리한다.

### 완료 기준

1. 단위 시험을 더하고 통과한다: 같은 저장소의 다른 워크트리끼리 붙이기 허용, 다른 저장소는 거부, 붙이면 상자에서 빠짐과 빈 상자 숨김, 떼면 돌아감, 정리가 덩어리를 깨지 않음, 다시 켠 뒤 남음.
2. 창 시험(개발용 판, 리드 하나가 `atrium child --worktree`로 워커 셋을 띄움, haiku)으로 확인하고 전후 스크린숏을 `experiments/p68/`에 둔다: `Ctrl`+끌기로 둘 붙이기, 셋을 골라 배치 틀, "워커 붙여 묶기", 칸마다 브랜치 표시, 떼기, 백엔드를 다시 켠 뒤 그대로.
3. `cd backend && npm test`, `cd app && npm test`, `cd app && npm run build`가 통과한다.

### 읽을 파일

- `CLAUDE.md`, `docs/testing.md`, `docs/log/p17-dock-layout.md`·`p50-issues-canvas.md` 보고 절
- `backend/src/worktrees.mjs`, `backend/src/store-worktrees.mjs`, `backend/src/canvas-ops.mjs`, `backend/src/canvas.mjs`(`dockLayout`, `dockSpot`), `backend/src/dock-tree.mjs`, 붙이기를 거부하는 곳
- `app/src/renderer/Canvas.jsx`, `app/src/renderer/SessionNode.jsx`, `app/src/renderer/lib/dock-links.js`, 두 사전

### 시험 환경

- 이 작업은 `dev` 브랜치에서 시작한다. 워크트리를 연 뒤 먼저 `git fetch origin && git merge --ff-only origin/dev`를 한다(워크트리가 `main`에서 시작할 수 있다).
- 개발용 판은 너만의 판으로 띄운다(`docs/testing.md`).
  - `ATRIUM_HERDR_SESSION=atrium-dev-p68`, `ATRIUM_PORT=47895`
  - `ATRIUM_DATA_DIR=<워크트리>/backend/.dev/data`, `ATRIUM_APP_USERDATA=<워크트리>/backend/.dev/app`
- 실제 판(`atrium`, 47800)과 다른 판의 포트는 쓰지 않는다. 사용자의 기본 herdr 세션과 다른 판의 herdr 서버는 건드리지 않는다. 사용자의 실제 판은 열지도 캡처하지도 않는다.
- 대화 목록은 시험 폴더의 대화만 읽는다(`ATRIUM_CLAUDE_PROJECTS`, `ATRIUM_CLAUDE_DESKTOP=none`). 시험 폴더는 `C:\\Workspace\\mtask-p68-*`처럼 새로 만든다.
- 세션은 `claude --model haiku`와 셸로 띄운다.
- 끝나면 시험 세션, 창, 브라우저, 백엔드, herdr 서버와 세션(`atrium-dev-p68`만), 시험 폴더를 끄고 지운다. 네가 띄운 프로세스가 남지 않았는지 포트로 확인한다.

### 지킬 것

- `CLAUDE.md`를 따른다. 프로세스는 직접 띄운 것만 PID로 끈다.
- 이 저장소는 공개다. 작업 기록, 시험 코드, 커밋 메시지, 그림에 사용자 경로·메일·토큰, 실제 PC·tailnet 이름, IP, 실제 대화 내용을 쓰지 않는다. 커밋 전·푸시 전 검사를 건너뛰지 않는다.
- 화면 글은 영어와 한국어 사전 둘 다 고친다. 한국어 문구는 사전의 지금 말투(최근 문구 검토, `docs/log/korean-copy-review.md`)를 따른다.
- 같은 때 다른 작업자(P65(터미널 선명도), P66(세션 이름), P67(연결 이름표), P69(업데이트))가 돈다. 맡은 일에 필요한 만큼만 고치고, `styles.css`와 두 사전은 끝에 더해 합치기 쉽게 한다.
- 자기 브랜치에만 커밋한다. 커밋 메시지에 `Co-Authored-By` 줄을 넣지 않는다. `main`이나 `dev`를 바꾸거나 푸시하지 않는다. `node_modules`는 워크트리 안에서 받는다(`npm ci`).
- 문서는 이 작업 파일의 작업 기록 절과 보고 절만 고친다. 고쳐야 할 ARCH·BRIEF·testing 문장은 보고 절에 짧게 적는다.
- 끝나면 보고 절을 쓰고, 맨 마지막에 `<워크트리>/backend/.dev/p68.done`(브랜치 이름과 마지막 커밋 해시 두 줄)을 만든다.

## 작업 기록

## 보고
