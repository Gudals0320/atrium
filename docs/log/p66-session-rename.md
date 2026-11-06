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

2026-11-06, P66 작업자 세션.

- 지금 판에서 `name`은 판의 이름이자 에이전트 주소(대부분 herdr 이름과 같음)였다. 백엔드 안에서 `name`을 쓰는 곳이 200곳이 넘어 그 뜻은 그대로 두고, 세션 행에 `label` 열을 더했다. 요약(`summary`)의 `name`은 보이는 이름(`label`이 있으면 그것), 새 `address`는 주소, `label`은 사람이 정한 이름이다. 창과 원격 웹 화면은 요약의 `name`을 그대로 보이므로 노드 머리, 사이드바, 미션 맵, 찾기, 알림, 트레이가 손대지 않고 새 이름을 따른다.
- 에이전트에게 가는 글(하위 세션 응답, herdr 이름, 연결 알림)은 세션 객체의 `name`(주소)을 그대로 쓴다.
- 이름 풀기는 세션 ID → 주소(정확히) → 판 이름(정확히) → 판 이름(대소문자 무시) → 주소(대소문자 무시, 하나일 때) 차례다. herdr에서 붙은 이름이 남의 판 이름과 겹쳐도 주소가 이겨 일하던 에이전트의 명령이 깨지지 않는다.
- 새로 짓는 이름(spawn, `atrium child`, 올리기, 다시 열기, 데스크톱 가져오기)도 남의 판 이름을 대소문자 무시로 피한다. 그래서 spawn의 이름 겹침이 대소문자를 무시하게 됐다(`S1`과 `s1`은 함께 못 쓴다).
- herdr 0.9.5에 `herdr agent rename <대상> <이름>|--clear`가 있다. 개발용 판(`atrium-dev-p66`)에서 하위 세션 `kid`를 `kid2`로 바꾸니 `herdr agent get kid`가 `agent_not_found`였고, 판의 주소는 `kid`에 남았다(판이 띄운 세션은 따라가지 않는다). 바로 `kid`로 되돌렸다. 이번에는 쓰지 않았다.
- 창 시험 첫 실행은 사이드바가 닫혀 있어 2단계에서 멈췄고, 둘째 실행은 멈춘 herdr 세션이 옛 패널을 되살려 `s2`가 겹쳤다. 시험이 사이드바를 열고, 시작 전에 `atrium-dev-p66` herdr 세션만 지우게 고쳤다. 셋째 실행에서 22/22 통과했다.
- 정리: 시험 세션 넷을 `atrium kill --yes`로 끄고, 백엔드와 herdr 서버를 멈춘 뒤 herdr 세션 `atrium-dev-p66`을 지웠다. 시험 폴더 `C:\Workspace\mtask-p66-dir`, 그 폴더의 시험 대화 기록(이번 시험에서 만든 대화 셋뿐), 개발용 데이터 폴더를 지웠다. 47893 포트에는 TimeWait만 남았고 이 워크트리의 프로세스는 없다.

## 보고

### 만든 것

- **판의 이름(백엔드).** `backend/src/session-label.mjs`
  - 규칙은 지금 이름 규칙과 같다: 영문·숫자로 시작, 영문·숫자·`-`·`_`, 32자까지, `all` 아님. 앞의 `@`는 뗀다. 비우거나 원래 주소와 같으면 판 이름을 지운다(원래 이름으로 돌아감).
  - 겹침은 대소문자를 무시하고 남의 주소와 남의 판 이름을 모두 본다. 틀리면 `labelBad`, `labelTooLong`, `labelAll`, `labelTaken`(누가 쓰는지 포함) 열쇠로 이유를 준다.
  - `session.rename { session, name | clear, by: human | cli }`. 판 기록(`sessions.label`)에 쓰고 `renamed` 이벤트(`from`, `to`, `label`, `address`, `by`)를 남긴다. 그 세션과 하위 세션의 요약을 다시 보내 모든 창(원격 웹 포함)이 곧바로 받는다.
  - `resolve`, `@이름` 보내기, 닫힌 세션 다시 열기의 이름 풀기가 새 이름과 옛 주소를 둘 다 받는다. 찾기는 옛 주소로도 찾는다.
  - 오래 남기: 행에 있으니 백엔드·창·herdr를 다시 켜도, 잠재웠다 깨워도(같은 세션 객체), 이어 가기로 되살려도 남는다. 닫았다 다시 열면 그새 겹치지 않을 때만 되살린다. herdr 이름 동기화(`refreshAdoptedName`, `promoteShell`)는 `name`만 바꾸고 `label`은 덮지 않으며, 남의 판 이름과 겹치면 따라 바꾸지 않는다.
  - 요청 기록(`delivery`), 연결의 `fromName`/`toName`, `session.state` 이벤트, 하위 세션 요약의 부모 이름은 보이는 이름이다. 하위 세션 요약에 `parentAddress`를 더했다.
- **CLI.** `atrium rename <세션> <새 이름>`, `atrium rename <세션> --clear`. `atrium ls`는 바꾼 세션을 `critic (주소 s2)`로, `atrium tree`는 `(보드 이름 …)`을 덧붙여 보인다.
- **창.**
  - 노드 머리: 이름을 두 번 누르기, ⋯ 메뉴 "이름 바꾸기", 고른 노드에서 F2. 바꾼 이름 옆에 주소를 작게 보이고, 툴팁에 "에이전트 주소: s2"를 보인다. 점 색은 주소로 정해 이름을 바꿔도 같다. 아이콘 얼굴(머리 없음)은 F2로 노드 위에 입력칸을 띄운다.
  - 사이드바 세션 줄: ⋯ 단추(마우스를 올리면)와 오른쪽 누르기 메뉴의 "이름 바꾸기", 목록에 초점이 있을 때 F2. 바꾸는 동안 줄을 단추가 아닌 칸으로 그린다.
  - 입력칸(`Rename.jsx`): Enter·칸 밖 누르기 = 저장, Esc = 취소, 비우면 원래 이름. 창이 먼저 규칙을 보고(`lib/session-name.js`), 틀리거나 겹치면 칸 옆과 알림에 이유를 보이며 칸을 닫지 않는다.
  - 명령 바 `@` 목록은 옛 주소를 쳐도 새 이름을 내놓고 옆에 주소를 작게 보인다.
  - 사전 두 개에 `rename.*`(끝에 더함)과 `backend.label*`(backend 묶음 안, `nameIsSession` 다음)을 더했다. 스타일은 `styles.css` 끝에 더했다.
- **시험.**
  - `backend/test/p66.test.mjs` 9개: 이름 규칙, 겹침(대소문자 무시, 하위 세션 이름 포함), 비우기, 이름 풀기 차례, 찾기, 판 위 이름 바꾸기와 이벤트, `@`·CLI의 새 이름과 옛 주소, herdr 이름 바뀜이 판 이름을 덮지 않음, 다시 연 판 기록과 닫힌 세션, spawn 겹침.
  - `app/test/p66-lib.test.mjs` 3개: 창 미리 보기, F2 대상, 두 사전의 이유 문구.
  - 창 시험 `app/test/e2e/p66-rename.mjs`(P66 판에서만 뜬다): 22/22 통과. 결과는 `experiments/p66/`(git 밖: `p66-rename.txt`, `p66-results.json`, 스크린숏 10장, `p66-ls.txt`, `p66-tree.txt`).
    - 두 번 눌러 `s2` → `reviewer`(머리에 주소 `s2`), 겹치는 이름·한글 이름의 이유, Esc.
    - 사이드바 메뉴로 `s1` → `shell-a`, F2로 → `shellb`, 다른 화면(`atrium watch`)이 같은 순간 받음.
    - CLI로 옛 주소 `s2` → `critic`, 겹침 실패 이유, `--clear`, `atrium ls`, `renamed` 이벤트의 `by: human`·`by: cli`.
    - 명령 바 `@critic`, CLI `atrium send @s2`(옛 주소) 모두 haiku 세션에 닿음. 요청 기록 이름은 `critic`.
    - 백엔드를 멈춘 뒤 창이 다시 띄운 백엔드에서 `critic`·`shellb`가 남고 `@critic`으로 보낼 수 있음.
    - haiku `lead`가 `atrium child kid`로 하위 세션을 띄우고, `kid`를 `helper`로 바꾼 뒤 `lead`가 `herdr agent prompt kid …`(옛 주소)로 시킨 일이 `helper`에 닿음(답 BANANA, 연결 기록 `toName: helper`, `toAgentName: kid`).
- **확인.** `cd backend && npm test` 472/472, `cd app && npm test` 217/217, `cd app && npm run build` 통과.

### 계획과 다른 곳

- 원격 웹 화면은 따로 띄우지 않았다. 웹 화면도 창과 같은 `session.updated` 방송을 받으므로, 다른 클라이언트(`atrium watch`)가 곧바로 받는 것으로 확인했다.
- 잠재웠다 깨우기는 창 시험에 넣지 않았다. 잠재우기는 세션 객체와 행을 그대로 두므로 백엔드 다시 켜기와 같은 길이다.

### 알려진 문제

- 하위 세션이나 다른 에이전트가 판 이름(`helper`)으로 `herdr agent prompt`를 부르면 herdr가 모른다. 판 이름은 `atrium send @helper`에서만 통한다. 노드 머리의 주소 표시로 알린다.
- 판 바깥에서 `herdr agent rename`으로 판이 띄운 세션의 herdr 이름을 바꾸면 판의 주소가 따라가지 않는다(지금과 같음).
- 명령 바의 보낸 요청 칩과 Thread 기록은 보낸 때의 이름을 그대로 보인다(예: 이름을 바꾸기 전의 `@kid`).

### 고칠 문서(지휘 세션)

- ARCH 상태 모델: 세션의 `label`(판의 이름)과 요약의 `name`(보이는 이름)·`address`(주소)·`label`. 이름 풀기 차례. API `session.rename`, 이벤트 `renamed`의 `by`.
- ARCH 화면: 노드 머리 두 번 누르기·F2·⋯ 메뉴, 사이드바 세션 줄 메뉴.
- BRIEF "정한 것": "세션 이름은 판에서 바꿀 수 있고, 에이전트 주소(herdr 이름)는 바꾸지 않는다" 행.
- testing.md: 창 시험 전에 그 판의 멈춘 herdr 세션을 지워야 옛 패널이 되살아나지 않는다(`herdr session delete atrium-dev-<이름>`).
