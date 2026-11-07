상태: 열림
날짜: 2026-11-07

## 지시

### 목표

워크트리 워커를 띄우고, 정리하고, 일을 넘기는 사이에 워커 줄이 다시 흩어지지 않게 한다. P75의 후속이다.

### 사용자의 말

"세션을 생성할 때에 정렬이 조금씩 되긴 하는데, 워크트리 워커를 호출하는 경우 세션 호출 -> 워크트리 호출 -> 인계 하면서 정렬을 해도 다시 배치되면서 정렬이 깨짐."

사용자가 본 판은 `v0.1.3-dev.2`라 P75가 없다. P75는 워커가 처음 워크트리에 들 때 상자를 워커 둘레로 옮기게 고쳤다. 그러나 P75 창 시험은 워커가 상자에 든 뒤에 정리를 눌렀고, "정리한 뒤에 일을 넘겨 상자가 생기는" 순서는 보지 않았다. P75 보고의 알려진 문제도 남아 있다: 첫 요청 없이 `--worktree`로 띄운 claude 워커는 hook이 돌 때까지 판이 워크트리 폴더를 몰라 상자에 들지 않는다. 지휘 세션이 합친 코드(P75와 P76)로 P75 창 시험을 다시 돌렸을 때는 10/12였다. `--prompt`를 받은 w5가 4분 안에 상자에 들지 않았다(`claude -w`는 워크트리를 만들었다). 기록은 git 밖 `C:\Workspace\multitask\experiments\p75\merged\`에 있다.

### 할 것

1. **재현.** 지금 `dev` 코드(P75 포함)로 사용자의 순서를 따라 한다. 리드가 `atrium child --worktree`로 워커 여럿을 띄운다(요청 없이 띄운 것과 `--prompt`로 띄운 것을 둘 다) → 사람이 정리를 누른다 → 리드가 `herdr agent prompt`로 일을 넘긴다 → 워커가 워크트리에 들고 상자가 생긴다. 고칠 것이 없으면 그 근거(재현 그림과 수치)를 보고에 적고 끝낸다.
2. **고치기.** 인계 뒤에도 워커와 상자가 정리한 줄의 자리와 띄운 순서를 지키게 한다. 바꾸어도 되는 것: `--worktree` 워커는 판이 워크트리 경로(`.claude/worktrees/<이름>`)를 띄울 때 이미 아니, 상자를 띄울 때 그 워커 둘레에 바로 만들어 나중에 옮기지 않기. 또는 첫 요청 전에도 herdr 패널 폴더를 보기(P75 보고의 제안). 더 나은 길이 있으면 근거를 들어 고른다.
3. **정리와의 관계.** 정리는 아직 상자가 없는 `--worktree` 워커에도 상자 틀만큼 자리를 잡아, 나중에 상자가 생겨도 뒤 형제가 밀리지 않게 한다.
4. 사람이 옮긴 노드와 상자는 다시 옮기지 않는다. 이미 있는 판은 사람이 정리하거나 새 워커를 띄우기 전에는 옮기지 않는다(P75와 같다).

### 완료 기준

1. 단위 시험을 더하고 통과한다: 정리 → 인계 → 상자 생김 뒤에도 자리와 순서 그대로, 요청 없이 띄운 워커도 상자에 듦(또는 처음부터 상자 안), 사람이 옮긴 것 그대로.
2. 창 시험(개발용 판)으로 위 순서를 찍어 `experiments/p78/`에 둔다. 고치기 전 코드(지금 `dev`)로도 같은 순서를 찍는다. 시험 저장소는 P75와 같은 경로 `C:\Workspace\mtask-p75-repo`를 새로 만들어 쓴다. 사용자가 그 경로의 신뢰를 이미 주었으므로 다시 묻지 않는다. 신뢰 질문이 뜨면 P75처럼 `backend/.dev/p78-need-trust.txt`에 한 줄을 두고 기다린다.
3. `cd backend && npm test`, `cd app && npm test`, `cd app && npm run build`가 통과한다.

### 읽을 파일

- `CLAUDE.md`, `docs/testing.md`, ARCH 4절 H7·K1·K4, `docs/log/p75-worker-line-layout.md`(작업 기록, 보고, 알려진 문제)
- `backend/src/tree-line.mjs`, `backend/src/branch.mjs`, `backend/src/worktrees.mjs`, `backend/src/worktree-areas.mjs`, `backend/src/canvas.mjs`(`arrangeTree`), `backend/src/canvas-ops.mjs`(`arrange`)
- `app/test/e2e/p75-worker-line.mjs`

### 시험 환경

- 이 작업은 `dev` 브랜치에서 시작한다. 워크트리를 연 뒤 먼저 `git fetch origin && git merge --ff-only origin/dev`를 한다(워크트리가 `main`에서 시작할 수 있다).
- 너는 사용자의 실제 판 위에서 도는 워커라 셸에 실제 판의 `ATRIUM_*`·`HERDR_*`가 있다. 시험, 개발용 판, herdr, `atrium`은 이 변수를 지운 셸(`backend/.dev/clean-env.sh`, `docs/testing.md`)로 부른다.
- 개발용 판은 너만의 판으로 띄운다(`docs/testing.md`).
  - `ATRIUM_HERDR_SESSION=atrium-dev-p78`, `ATRIUM_PORT=47898`, 창의 원격 디버깅 포트 9378
  - `ATRIUM_DATA_DIR=<워크트리>/backend/.dev/data`, `ATRIUM_APP_USERDATA=<워크트리>/backend/.dev/app`
- 실제 판(`atrium`, 47800)과 다른 판의 포트는 쓰지 않는다. 사용자의 기본 herdr 세션, 실제 판의 herdr 세션(`atrium`), 다른 판의 herdr 서버는 건드리지 않는다. 사용자의 실제 판은 열지도 캡처하지도 않는다. 스크린숏은 창 안만 찍는다(`page.screenshot`).
- 실제 판의 API(47800)와 `atrium` 명령으로 실제 판을 바꾸지 않는다. 시험의 `atrium` CLI는 늘 개발용 판 환경 변수(`ATRIUM_PORT` 등)를 주고 부른다.
- 실제 설치 폴더(`%LOCALAPPDATA%\atrium\versions`)와 실제 데이터 폴더(`%LOCALAPPDATA%\atrium`)는 읽지도 바꾸지도 않는다.
- 대화 목록은 시험 폴더의 대화만 읽는다(`ATRIUM_CLAUDE_PROJECTS`, `ATRIUM_CLAUDE_DESKTOP=none`). 시험 폴더는 `C:\Workspace\mtask-p78-*`처럼 새로 만든다.
- 세션은 `claude --model haiku`와 셸로 띄운다.
- 끝나면 시험 세션, 창, 브라우저, 백엔드, herdr 서버와 세션(`atrium-dev-p78`만), 시험 폴더를 끄고 지운다. 네가 띄운 프로세스가 남지 않았는지 포트로 확인한다.

### 지킬 것

- `CLAUDE.md`를 따른다. 프로세스는 직접 띄운 것만 PID로 끈다. 신뢰 질문은 대신 답하지 않는다.
- 이 저장소는 공개다. 작업 기록, 시험 코드, 커밋 메시지, 그림에 사용자 경로·메일·토큰, 실제 PC·tailnet 이름, IP, 실제 대화 내용을 쓰지 않는다. 커밋 전·푸시 전 검사를 건너뛰지 않는다.
- 화면 글은 영어와 한국어 사전 둘 다 고친다. 한국어 문구는 사전의 지금 말투(`docs/log/korean-copy-review.md`)를 따른다.
- 같은 때 P77 작업자(덩어리 칸 크기, 판 `atrium-dev-p77`, 47897·9377)가 `canvas.mjs`의 크기 함수·`dock-tree.mjs`·`Docks.jsx`를 고친다. 지휘 세션은 `atrium-dev-p75`(47896·9376)로 합친 코드를 시험한다. 그 포트와 세션은 쓰지 않는다. 맡은 일에 필요한 만큼만 고치고, `styles.css`와 두 사전은 끝에 더해 합치기 쉽게 한다.
- 자기 브랜치에만 커밋한다. 커밋 메시지에 `Co-Authored-By` 줄을 넣지 않는다. `main`이나 `dev`를 바꾸거나 푸시하지 않는다. `node_modules`는 워크트리 안에서 받는다(`npm ci`, 창은 그 뒤 `node node_modules/electron/install.js`).
- 문서는 이 작업 파일의 작업 기록 절과 보고 절만 고친다. 고쳐야 할 ARCH·BRIEF·testing·README 문장은 보고 절에 짧게 적는다. 살아 있는 문서 예산이 거의 찼으니(70,000자 중 69,997자) 문장은 바꾸는 문장보다 길지 않게 적는다.
- 끝나면 보고 절을 쓰고, 맨 마지막에 `<워크트리>/backend/.dev/p78.done`(브랜치 이름, 마지막 커밋 해시, 시험 수 세 줄)을 만든다.

## 작업 기록

2026-11-07 작업자 세션(워크트리 `p75`, 브랜치 `worktree-p75`, `origin/dev` `9bd4557`에서 시작)

- 시험·빌드·창 시험·herdr·atrium CLI는 모두 `backend/.dev/clean-env.sh`로 불렀다. 판 값은 `experiments/p78/tools/env.cjs`(git 밖): `atrium-dev-p78`, 47898, 창 디버깅 포트 9378, `backend/.dev/data`·`app`. 시험 저장소는 P75와 같은 경로 `C:\Workspace\mtask-p75-repo`를 새로 만들었다. 신뢰는 다시 묻지 않았다(`p78-need-trust.txt`를 만들 일이 없었다).
- 지휘 세션의 10/12(w5) 원인: 판은 워커의 폴더를 hook(첫 요청)으로만 안다. `claude -w`는 프로세스 안에서 워크트리로 들어가므로 herdr 패널 폴더는 끝까지 저장소 루트다(`herdr agent prompt` 결과의 `cwd`로 확인). 그리고 `--prompt`의 첫 요청이 가끔 들어가지 않는다. 판이 ready를 보고 보내지만 UserPromptSubmit이 오지 않아 `unconfirmed: no UserPromptSubmit hook`으로 끝나고 다시 보내지 않는다(이 판 기록에서 w3·w4 둘 다, 다른 회에는 하나). 그래서 `--prompt`를 줘도 상자에 들지 못한다.
- 재현(고치기 전, 지금 `dev`): 요청 없이 띄운 워커의 상자는 리포 영역 오른쪽 위 빈자리(3220, 3760 …)에 빈 채로 생기고 워커는 줄에 노드로 남는다. 정리는 그 노드를 상자 줄과 같은 x(2160)에 놓는다. 인계로 hook이 오면 빈 상자가 노드 둘레로 옮겨 오는데, 상자 틀이 노드보다 왼쪽 40·위 112 크므로 상자는 x 2120으로 비어져 나오고 뒤 형제가 아래로 밀린다. 사용자가 말한 "정렬해도 다시 배치되며 깨짐"이 이것이다.
- 고른 길: 지시의 두 안 가운데 "띄울 때 아는 워크트리 경로를 쓴다". 판은 `--worktree <이름>`을 알고 `claude -w`는 늘 `<저장소>/.claude/worktrees/<이름>`을 만든다. 그 워크트리가 `git worktree list`에 나타나면 hook 전에도 워커가 거기 있다고 본다(`worktrees.mjs placeOf`). herdr 패널 폴더 안은 위 확인대로 쓸모가 없다. 띄운 뒤 3초·8초에 워크트리 목록을 다시 읽어 상자가 10초 주기를 기다리지 않고 선다.
- 정리: 아직 상자가 없는 `--worktree` 워커 블록에 상자 틀만큼 테두리(`pad`, `tree-line.mjs BOX_PAD`)를 두어 줄이 틀까지 차지하고 노드는 그 안에 놓인다(`canvas.mjs arrangeTree`, `canvas-ops.mjs blocksOf`). 나중에 상자가 생겨도 정리한 틀 자리와 같다.
- 이미 있는 판: P78 전에 띄운 워커는 브랜치 정보에 새 표시(`wtHome`)가 없어 지금처럼 hook을 기다린다. 판을 다시 띄워도 저절로 옮기지 않는다.
- 떠나기: hook이 그 워크트리를 한 번 알린 뒤 본 저장소를 알리면 워커가 나간 것으로 보고 본 저장소 영역으로 옮긴다(P75의 `fitsWt`는 이것도 막고 있었다).
- 단위 시험 `backend/test/p78.test.mjs` 6개: 정리의 테두리(순수), 요청 없는 워커가 상자에 듦, 정리 → 인계 두 경우(상자 하나도 없음, 일부만 있음, 셸 형제 포함), 사람이 옮긴 노드·상자 그대로, 떠나기와 P78 전 기록.
- 창 시험 `app/test/e2e/p78-worktree-handoff.mjs`: 리드(haiku)의 env로 `atrium child --worktree` 넷(w1·w2 요청 없이, w3·w4 `--prompt`) → 띄운 직후 → 영역 정리 버튼 → `herdr agent prompt`로 넷에게 인계 → hook이 넷의 폴더를 알릴 때까지 기다린 뒤 잰다.
  - 1회: 인계를 리드에게 시켰더니(`atrium send`) 리드가 Bash 권한 질문에서 멈췄다. 대신 답하지 않았다. `--allow-herdr`로 띄운 2회에는 리드가 herdr 말고 `test "$HERDR_ENV" = 1`을 쳐서 다시 권한 질문에서 멈췄다. 또 hook이 오기 전에 재는 틈이 있었다. 기록은 `experiments/p78/run1`, `run2`.
  - 3회(최종): 인계는 리드가 칠 것과 같은 `herdr agent prompt`를 시험이 이 판의 herdr 세션에 직접 쳤다. 고치기 전 6/8, 고친 뒤 8/8.
- 정리: 시험 세션을 끄고, 창을 닫고, herdr 서버와 백엔드를 멈추고, `herdr session delete atrium-dev-p78`, 시험 워크트리(`claude -w`가 잠근 것이라 `--force --force`)·브랜치, 시험 판 데이터(`backend/.dev/data`, `app`, 고정 대화 폴더 둘), 시험 저장소를 지웠다. 포트 47898과 9378에 듣는 프로세스가 없다.

## 보고

### 만든 것

- `--worktree` 워커의 자리(`backend/src/worktrees.mjs`): `expectedWt`·`placeOf`. 워크트리 `.claude/worktrees/<이름>`이 목록에 있으면 hook 전에도 워커가 거기 있다고 본다. 상자는 처음부터 워커 둘레에 서고(P75 `homeNode`가 이 자리를 쓴다) 워커는 움직이지 않는다. hook이 그 워크트리를 알린 뒤 다른 곳을 알리면 따른다.
- 띄움(`backend.mjs`): `--worktree` 워커를 띄운 뒤 3초·8초에 워크트리 목록을 다시 읽는다. 브랜치 정보에 `wtHome: 1`(`branch.mjs`).
- 정리(`canvas.mjs arrangeTree`, `canvas-ops.mjs blocksOf`): 블록의 `pad`(둘레에 비울 테두리). 상자가 아직 없는 `--worktree` 워커는 `BOX_PAD`(왼쪽·오른쪽·아래 40, 위 112). 줄과 자식 열은 테두리 바깥 기준이다.

### 창 시험 결과(`experiments/p78/`)

| | 고치기 전(`p78-before-*`) | 고친 뒤(`p78-after-*`) |
|---|---|---|
| 띄운 직후 | 상자 넷이 오른쪽 위에 빈 채(3220·3760·4300·4840), 워커는 노드로 줄에 | 넷 다 자기 상자에, 상자 한 열(1680) |
| 정리 뒤 | 한 열(2160) | 한 열(2160) |
| 인계 뒤 상자 x | 2120 넷(정리한 자리에서 왼쪽 40) | 2160 넷 그대로 |
| 인계 뒤 상자 y | 112·777·1442·2107 → 0·817·1634·2451 | 112·1154·2196·3238 그대로 |
| 결과 | 6/8 | 8/8 |

- 같은 시험의 2회 고치기 전에는 첫 요청이 w4에만 들어가 w1~w3만 2120으로 비어져 나와 줄이 두 열이 됐다(`run2`).
- 시험: `cd backend && npm test` 552/552, `cd app && npm test` 275/275, `cd app && npm run build` 통과.

### 계획과 다른 곳

- 창 시험의 인계는 리드가 아니라 시험이 `herdr agent prompt`를 친다. 리드(haiku)는 시킨 명령 말고 다른 명령도 쳐서 권한 질문에서 멈췄다(대신 답하지 않았다). 판이 보는 것(워커에 요청이 들고 hook이 온다)은 같다.
- 지시의 다른 안(첫 요청 전에 herdr 패널 폴더 보기)은 쓰지 않았다. `claude -w`의 패널 폴더는 워크트리로 바뀌지 않는다.

### 알려진 문제

- `atrium child --prompt`의 첫 요청이 `claude -w` 워커에서 가끔 들어가지 않는다(`unconfirmed: no UserPromptSubmit hook`, 다시 보내지 않음). 줄은 이제 이것과 상관없지만 리드가 맡긴 첫 일이 사라진다. 워크트리를 만드는 동안 ready로 잘못 보는 것으로 보인다. 따로 고칠 일이다(전달 재시도나 ready 판정).
- P78 전에 띄운 워커(이미 있는 판)는 지금처럼 첫 요청 전까지 상자에 들지 않는다. 정리하면 테두리만큼 자리를 비우므로 나중에 상자가 생겨도 줄은 그대로다.
- 워커가 `claude -w` 말고 다른 길(손으로 `git worktree add`)로 다른 이름의 워크트리에 들면 지금처럼 hook을 기다린다.

### 고칠 문서 문장(지시에 따라 짧게)

- ARCH K4 끝: "`--worktree` 워커는 그 워크트리가 생기면 hook 전에도 상자에 든다(`placeOf`)."
- ARCH H7 끝: "상자가 아직 없는 `--worktree` 워커는 상자 틀만큼 자리를 잡는다."
- testing.md: 첫 요청과 워크트리 워커에 대한 P75 문장은 "인계는 `herdr --session <판> agent prompt`로 시험이 직접 친다(리드에게 시키면 권한 질문에서 멈출 수 있다)"로 바꾼다.
- BRIEF·README: 고칠 것 없음.
