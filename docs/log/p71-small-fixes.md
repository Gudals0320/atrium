상태: 닫힘
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

- 기준: `origin/dev` `163781c`. 브랜치 `worktree-p71`. 워커 셸은 실제 판의 `ATRIUM_*`·`HERDR_*` 변수를 물려받아서, 모든 npm·시험·CLI를 `backend/.dev/clean-env.sh`(그 변수를 지우고 실행, git 밖)로 돌렸다.
- 워크트리 나가기 질문 조사: Claude Code 2.1.319 실행 파일 안의 글로 질문 꼴을 확인했다(제목 "Exiting worktree session", 선택지 "Keep worktree"·"Remove worktree", tmux가 있으면 세 개). 변경 없이 커밋도 커밋 안 한 파일도 없으면 묻지 않고 지운다. 지우기를 고른 뒤에는 더 묻지 않는다.
- 판의 세션 닫기 길: 노드 X(`KillConfirm`)와 Delete 대화상자(`CloseDialog`) 모두 `session.kill`이고, 백엔드는 `/exit`+Enter를 보낸 뒤 `killWaitMs`(10초) 동안 claude가 끝나기를 기다린다. 워크트리 세션은 이 질문에서 멈춰 10초 뒤 작업 공간째 닫혔다(claude는 답 없이 죽고 워크트리는 남음). 잠재우기(`sleep.mjs`)와 판 설정으로 다시 띄우기(`restart_with_settings`)도 같은 `/exit` 길이라 같은 질문에서 멈춘다.
- 사이드바 단추: `more` 아이콘이 길이 0.01 선 셋(`M5 12h.01…`)이라 14px에서 둥근 끝이 1px 남짓이었다. 개발용 판 전 스크린숏에서 프로젝트 줄에 마우스를 올려도 오른쪽 끝에 아무것도 보이지 않았다. 반지름 1인 원 셋으로 바꿨다. 그룹·세션 줄과 노드 머리줄의 메뉴 단추도 같은 아이콘이라 함께 고쳐진다.
- 창 위쪽에는 Atrium 이름·로고가 없다(로고는 아래 명령 입력 칸 왼쪽, 글자 로고는 처음 화면과 기기 등록 화면). 그래서 창 안에는 버전을 더하지 않았다.
- 개발용 판(`atrium-dev-p71`, 47891, `backend/.dev`, 설치 폴더도 `backend/.dev/install`)에서 시험했다. 시험 저장소는 신뢰를 받지 않아 `atrium child w1 --worktree w1`이 신뢰 관문(P36)에서 멈췄다. 사용자에게 개발용 판의 @w1 노드에서 신뢰 질문에 답해 달라고 부탁했고, 사용자가 답한 뒤 판이 `claude -w`로 다시 띄웠다(시험은 신뢰에 답하지 않았다). 리드는 git이 아닌 시험 폴더에서 띄웠다.
- 전 단계는 고치기 전 코드(`163781c`의 `app/src`, `backend/src`, `backend/bin`을 잠시 꺼내 빌드)로 돌렸다. 워커 셋(w1~w3, haiku)이 각자 커밋 하나씩 만들었고(권한 질문은 시험이 1번으로 답함), w1에 `/exit`를 넣자 "유형을 알 수 없는 확인 창"이 떴다.
- 실제 화면에서 처음 모양과 다른 점을 찾았다: 노드 터미널이 낮으면 Claude Code는 고른 선택지 하나만 보인다("❯ 1. Keep worktree    Stays at …", 2번은 화면 밖, 설명은 같은 줄). 그래서 보이지 않는 쪽은 Claude Code의 선택지 순서(남기기 1, 지우기 2, tmux면 3)로 정하게 고쳤다. 화면 밖 선택지도 숫자 키 `2`로 골라지는 것을 실제 세션에서 확인했다.
- 후 단계는 고친 코드로 백엔드만 다시 띄웠다(herdr와 질문에 멈춘 w1은 그대로). 다시 붙으면서 w1의 질문을 다시 읽어 "워크트리를 남길까요?" 줄이 떴다.
- 전 단계 창의 원격 디버깅 포트 9371을 백엔드가 띄운 herdr 서버가 물려받아, 창을 닫은 뒤에도 9371이 듣는 채로 남았다(주인 PID는 이미 없음). 시험 세션을 쥔 서버라 끄지 않고 후 단계는 9371 없이 띄웠다. herdr 서버를 끈 뒤 9371은 풀렸다.
- 정리: 시험 세션(lead, w1)을 `atrium kill --delete`로, w2·w3는 시험이 닫았다. 백엔드와 herdr 서버(`atrium-dev-p71`)를 멈추고 그 herdr 세션 폴더만 지웠다. 시험 폴더 둘(`mtask-p71-repo`, `mtask-p71-lead`)과 그 폴더에서 생긴 시험 대화 기록 폴더 넷(`~/.claude/projects`의 `C--Workspace-mtask-p71-*`)을 지웠다. w1의 대화 기록은 `--delete`가 휴지통으로 보냈다. 47891·9371에 듣는 프로세스가 없고 이 워크트리에서 띄운 프로세스가 남지 않은 것을 확인했다. 실제 판, 기본 herdr 세션, 실제 설치·데이터 폴더는 건드리지 않았다.

## 보고

### 만든 것

1. **워크트리 나가기 질문**
   - 화면 읽기 `parseWorktreeExit`(`screen.mjs`): 제목, 남기기·지우기 번호, 커밋 수, 커밋하지 않은 파일 수, 브랜치. 보이지 않는 선택지는 순서로 정한다(`hidden: true`).
   - 상태(`state.mjs`): herdr `blocked`에 묻는 hook이 없고 화면이 이 질문이면 `waiting`, ask `{ kind: 'worktree_exit', commits, files, branch, keep, remove, since }`. hook이 없는 claude 세션도 같다. 신뢰 질문 판정은 그대로이고 먼저 본다.
   - 승인 줄(`ApprovalCard.jsx`): 제목 "워크트리를 남길까요?", 브랜치와 커밋 수, 단추 "남기기 1", "지우기 2", "터미널에서 답하기". 지우기를 누르면 "브랜치와 커밋 n개도 지워집니다."(커밋하지 않은 파일이 있으면 "커밋하지 않은 파일 n개도 사라집니다."도)를 보이고 "워크트리 지우기"·"취소"로 한 번 더 묻는다.
   - 답(`session.answer`): `{ choice: 'keep' }`, `{ choice: 'remove', confirm: true }`. 지우기는 `confirm` 없이는 `needs_confirm`으로 거부한다. 보내기 직전에 화면을 다시 읽어 질문이 없으면 보내지 않는다(`stale`).
   - 복귀 요약·내 차례 칩 글도 이 종류를 안다.
2. **판에서 닫을 때**
   - `session.kill`에 `worktree: keep | remove`를 더했다. 확인 결과에 `worktree: { name }`을 준다(하위 세션의 `--worktree`, 또는 폴더가 `.claude/worktrees/<이름>` 안).
   - 노드 X의 확인과 Delete 대화상자에 "워크트리 남기기(<이름>, 기본)"와 "워크트리와 브랜치 지우기"를 두었다. 지우기를 고르면 경고 한 줄이 붙는다. 여럿을 한꺼번에 닫을 때는 고르지 않고 남긴다.
   - `/exit` 뒤 기다리는 동안 화면에 질문이 뜨면 고른 번호를 한 번 보낸다(`worktree-exit.mjs` `waitClaudeExit`). 사람이 고르지 않았으면 늘 남기기다. 질문이 이미 떠 있으면 Esc로 취소하지 않고 바로 답한다.
   - 잠재우기와 판 설정으로 다시 띄우기의 `/exit`에도 같은 기다리기를 써서 남기기로 답한다(지시 밖이지만 같은 질문에서 멈춰 실패하던 길이다).
   - CLI `atrium kill <이름> --worktree keep|remove`.
3. **사이드바 메뉴 단추**: 원인은 아이콘 모양(길이 0.01 선)이었다. 글꼴·CSS 문제가 아니다. 원 셋으로 바꿔 프로젝트·그룹·세션 줄과 노드 머리줄의 `⋯`가 모두 보인다.
4. **창 제목의 버전**: `Atrium 0.1.2`, 개발용 판은 `Atrium 0.1.2 (dev)`, dev 빌드는 `Atrium 0.1.3-dev.1`(`update-notice.js` `windowTitle`, 지금 창의 `app/package.json` version). 트레이 풍선 글 앞부분도 같은 함수로 만든다.
5. **버전 되돌리기 빼기**
   - 뺀 것: 설정 › 일반 › 업데이트의 되돌리기 단추·풀이·확인 글, 사전 열쇠 `update.rollbackTo`·`rollback`·`rollbackTitle`·`rollbackHint`, 창의 `rollbackUpdate`, API `update.rollback`, `update.status`의 `previous`·`canRollback`, CLI `atrium update --rollback`(주면 없어졌다고 알리고 멈춤), `update.mjs`의 `rollbackCurrent`. 트레이에는 되돌리기 줄이 없었다.
   - 남긴 것: 새 백엔드가 건강 확인을 통과하지 못하면 옛 버전으로 돌리는 자동 되돌리기(`update-swap.mjs`)와 그 알림(`update.toastRolledBack`).
   - 바꾼 규칙: `current.json`은 `{ current, switchedAt }`만 쓴다(`previous`를 적지 않고, 옛 파일의 `previous`는 읽지 않는다). 자동 되돌리기는 바꾸기 작업 파일의 옛 코드 폴더(`fromRoot`)와 옛 `current.json`(`currentBefore`)으로 하므로 `previous`가 필요 없다. 옛 버전 폴더 지우기(`pruneVersions`)는 지금 버전만 남긴다(전에는 바로 앞 버전도 남겼다). 바꾸기 프로세스는 새 백엔드가 뜬 뒤나 옛 것으로 돌린 뒤에만 지우므로, 되돌리는 동안 옛 폴더가 지워지지 않는다.
   - README 두 개: 손으로 하는 되돌리기를 말하는 곳은 없다. 둘 다 143줄에서 자동 되돌리기("새 버전이 시작되지 않으면 이전 버전으로 돌아갑니다")만 말하므로 그대로 맞다.

### 시험

- 단위: 백엔드 `test/p71.test.mjs` 8개(질문 알아보기와 커밋 수, 낮은 패널, 상태, 답, 복귀 요약, 세션 알아보기, 닫기에서 고른 답(가짜 판으로 `kill`), 기다리기, 되돌리기가 없어진 것), 창 `test/p71-lib.test.mjs` 5개(창 제목, 질문 글, 닫기 값, 아이콘, 되돌리기가 없어진 것). P69·P70 시험은 새 규칙(앞 버전 없음, 지금 버전만 남김)에 맞게 고쳤다.
- `cd backend && npm test` 517/517, `cd app && npm test` 247/247, `cd app && npm run build` 통과.
- 창 시험 `app/test/e2e/p71-wt.mjs`(`node experiments/p71/tools/e2e.cjs p71-wt.mjs before|after`): 전 6/6, 후 10/10.
  - 전: 창 제목 `Atrium (dev)`, 사이드바 단추 안 보임, 업데이트 묶음에 되돌리기 단추, `/exit` 뒤 "유형을 알 수 없는 확인 창".
  - 후: w1 승인 줄 "워크트리를 남길까요?"(커밋 1개), 지우기 → 경고 → 확인 → 워크트리와 브랜치가 지워지고 세션 끝남. w2를 X로 닫음(기본 남기기) → 세션만 닫히고 워크트리·브랜치·커밋이 남음. w3를 X로 닫으며 지우기 → 워크트리와 브랜치가 지워짐. 창 제목 `Atrium 0.1.2 (dev)`, 사이드바 `⋯` 보임, 업데이트 묶음에 되돌리기 없음.
  - 스크린숏은 `experiments/p71/`(git 밖): `p71-0-trust-gate`, `p71-before-{title,sidebar,update,card}`, `p71-after-{title,sidebar,update,card,card-remove-ask,close-keep,close-remove}`. 업데이트 묶음 그림에는 herdr 경로가 보이므로 저장소에 넣지 않는다.

### 계획과 다른 곳

- 창 안 위쪽에 Atrium 이름·로고가 없어 창 안에는 버전을 더하지 않았다(창 제목과 트레이 풍선 글만).
- 진짜 `claude -w` 세션은 시험 저장소의 신뢰가 있어야 떠서, 사용자가 개발용 판의 @w1 노드에서 신뢰 질문에 한 번 답했다. 그 시험 저장소 경로의 신뢰 기록은 사용자의 `~/.claude.json`에 남아 있다(폴더는 지웠다. 설정 파일은 고치지 않았다).
- 후 단계 창은 원격 디버깅 포트 9371 없이 띄웠다(위 작업 기록).

### 알려진 문제

- 질문의 번호를 순서로 정한 경우(`hidden: true`)는 Claude Code가 선택지 순서를 바꾸면 틀린다. 그래도 지우기는 사람이 두 번 고를 때만 보낸다.
- 화면 읽기는 영어 글("Exiting worktree session", "Keep worktree")에 기댄다. Claude Code가 글을 바꾸면 다시 "유형을 알 수 없는 확인 창"으로 보인다(닫기는 지금처럼 10초 뒤 작업 공간째 닫는다).
- 여럿을 한꺼번에 닫는 Delete 대화상자는 워크트리 선택을 보이지 않고 모두 남긴다.
- 잠재우기와 판 설정으로 다시 띄우기에서 워크트리 세션이 남기기로 답하는 것은 닫기와 같은 함수(`waitClaudeExit`)를 쓰지만, 그 두 길로는 실제 세션을 돌려 보지 않았다.

### 문서에 고칠 문장

- ARCH 82줄(waiting 판정): "…둘 다 아니면 화면이 워크트리 나가기 질문인지 보고(worktree_exit), 아니면 '알 수 없는 대화상자'로 화면을 보여준다."
- ARCH API 표 `session.kill`: `{ sessionId, confirm, after?, worktree?: keep | remove }`. `claude -w` 세션이면 확인에 `worktree`를 주고, `/exit` 뒤 워크트리 나가기 질문에 고른 답(기본 남기기)을 보낸다.
- ARCH 50줄(업데이트): "새 백엔드가 뜨지 않으면 되돌린다" 뒤에 "손으로 하는 되돌리기는 없고, 설치 폴더에는 지금 버전만 남긴다(P71)".
- BRIEF·testing·README: 고칠 문장 없음. testing에 더한다면 "진짜 `claude -w` 시험은 시험 저장소의 신뢰가 필요하다. 사람에게 개발용 판의 노드에서 답해 달라고 한다(P71)" 한 줄.
