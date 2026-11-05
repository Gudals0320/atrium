상태: 열림
날짜: 2026-11-05

## 지시

### 목표

사용성 검증(ux1)이 올린 GitHub 이슈 가운데 작은 이슈 #8, #9, #10를 재현하고 고친다. 사용자의 말: "열려 있는 이슈 보고 재현-수정을 맡겨."

맡은 이슈:
- **#8** Outside-conversation card shows "HEAD" branch for a folder that is not a git repository (S3). git 저장소가 아닌 폴더의 판 밖 대화 카드에 "⎇ HEAD"가 보인다.
- **#9** English UI uses "Prompt" both for the last request and for an idle shell (S3). 영어 화면에서 "Prompt"가 마지막 요청과 명령을 기다리는 셸 두 뜻으로 쓰인다. 영어 문구를 하나씩 정하고, 한국어(P39 용어표)와 뜻이 맞는지 본다.
- **#10** Changes panel counts the first backend start as a restart (S3). 변경 내역이 백엔드의 첫 시작을 재시작으로 센다. 그 줄의 이름표가 "herdr"인 것도 이슈에 적혀 있다.

고칠 곳(짐작): `backend/src/convos.mjs`·`recall.mjs`(대화 카드의 브랜치), `ConvoNode.jsx`, `locales/en.js`의 해당 값, 변경 내역(`backend.mjs`의 changes, `ReturnSummary.jsx`)

### 할 일(이슈마다)

1. **읽기.** `gh issue view <번호> --repo Gudals0320/atrium`로 이슈 글(재현 단계, 측정값, 증거 그림 주소, 제안)을 읽는다. 사용성 검증 작업 파일 `docs/log/ux1-usability-audit.md` 보고 절과 재현 각본 `app/test/e2e/ux1-repro.mjs`(이슈별 사례)도 본다.
2. **재현.** 지금 `main`으로 띄운 개발용 판에서 이슈를 재현하고 결과를 작업 기록에 적는다. 이슈를 올린 뒤 다른 작업(P44~P46)이 합쳐졌으니, 재현되지 않으면 까닭을 확인하고 "이미 고쳐짐"으로 보고한다(억지로 고치지 않는다).
3. **원인과 수정.** 원인을 찾아 고친다. 이슈의 "Suggested direction"은 참고만 하고, 더 나은 방법이 있으면 그것을 쓰고 까닭을 적는다.
4. **시험.** 판단은 순수 함수로 두고 단위 시험을 더한다. 재현 각본의 그 사례(또는 새 창 시험)가 고친 뒤 통과하는 것을 보이고, 결과와 스크린숏을 `experiments/<작업 이름>/`(git 밖)에 남긴다.
5. **이슈 댓글 초안.** 이슈를 닫거나 댓글을 달지 않는다. 지휘 세션이 `main`에 합친 뒤 단다. 보고 절에 이슈마다 영어 댓글 초안(인사말 없이 2~4줄: 무엇이 원인이었고 무엇을 바꿨는지, 남은 것)을 적는다.

### 완료 기준

1. 맡은 이슈마다 재현(또는 이미 고쳐졌음), 원인, 수정, 시험 결과가 보고 절에 있다.
2. `cd backend && npm test`, `cd app && npm test`, `cd app && npm run build`가 통과한다.

### 시험 환경

- 너만의 개발용 판으로 띄운다(`docs/testing.md`).
  - `ATRIUM_HERDR_SESSION=atrium-dev-p53`, `ATRIUM_PORT=47872`
  - `ATRIUM_DATA_DIR=<워크트리>/backend/.dev/data`, `ATRIUM_APP_USERDATA=<워크트리>/backend/.dev/app`
- 실제 판(`atrium`, 47800)과 다른 포트(47811~47872 가운데 네 것 말고)는 쓰지 않는다.
- 대화 목록은 시험 폴더의 대화만 읽는다(`ATRIUM_CLAUDE_PROJECTS`, `ATRIUM_CLAUDE_DESKTOP=none`). 시험 폴더는 `C:\Workspace\mtask-p53-*`처럼 새로 만든다.
- 세션은 되도록 셸 노드로 시험한다. claude가 꼭 필요하면 `--model haiku`, 턴은 짧게.
- 끝나면 시험 세션, 창, 백엔드, herdr 서버와 세션(`atrium-dev-p53`만), 시험 폴더, 시험 대화 기록을 끄고 지운다.

### 지킬 것

- `CLAUDE.md`를 따른다. 프로세스는 직접 띄운 것만 PID로 끈다.
- 이 저장소는 공개다. 작업 기록, 시험 코드, 커밋 메시지, 댓글 초안에 사용자 경로·메일·토큰을 쓰지 않는다. 커밋 전·푸시 전 검사를 건너뛰지 않는다.
- 같은 때 다른 작업자들이 돈다. 맡은 이슈에 필요한 만큼만 작게 고치고, 남의 영역을 고쳤으면 보고에 적는다.
  - P49(원격 R3): P47·P48을 합치는 중이다. `relay.mjs`, `api.mjs`, `api.js`, `store.js`, 웹 화면(`web.js`, `web.mjs`), 짝 맺기, `SpawnDialog.jsx`의 폴더 찾아보기, `TerminalView.jsx`·`CommandBar.jsx`의 붙여넣기 업로드, 설정의 연결된 기기를 고친다.
  - P50(캔버스 #2·#6), P51(터미널 #3·#7), P52(크롬 #4·#5), P53(#8·#9·#10)
- 화면 글을 더할 때는 `locales/en.js`·`ko.js` 끝에 더한다(고치는 것은 그 자리). 한국어는 P39 말투(합니다체)와 용어를 따른다. `styles.css`에 더할 때는 끝에 더한다.
- 자기 브랜치에만 커밋한다. 커밋 메시지에 `Co-Authored-By` 줄을 넣지 않는다. `main`을 바꾸거나 푸시하지 않는다. `node_modules`는 워크트리 안에서 받는다(`npm ci`).
- 문서는 이 작업 파일의 작업 기록 절과 보고 절만 고친다. 고쳐야 할 ARCH 행이 있으면 새 문장을 보고 절에 짧게 적는다.
- 끝나면 보고 절을 쓰고, 맨 마지막에 `<워크트리>/backend/.dev/p53.done`(브랜치 이름과 마지막 커밋 해시 두 줄)을 만든다.

## 작업 기록

- 2026-11-05 이슈 #8·#9·#10 글과 재현 각본(`ux1-repro.mjs`의 `convoHead`·`enPrompt`·`firstStartAsRestart`)을 읽었다. 그 각본은 ux1 판(47867)과 지금 없는 `experiments/ux1/tools/env.cjs`에 묶여 있어, 같은 확인을 내 판(`atrium-dev-p53`, 47872)에서 하는 새 창 시험 `app/test/e2e/p53-issues.mjs`를 만들었다. 매번 판 데이터를 지운 빈 판에서 시작한다.
- #8 고정 자료: 저장소가 아닌 새 폴더 `C:\Workspace\mtask-p53-plain`을 cwd로, Claude Code가 저장소 밖에서 남기는 모양(`"gitBranch":"HEAD"`)의 대화 기록 한 개를 시험 대화 폴더(`ATRIUM_CLAUDE_PROJECTS`)에 두었다. claude는 띄우지 않았다.
- 처음에는 대화 카드가 뜨지 않았다. 기본 시험 접두어 `mtask-`가 그 폴더를 시험 폴더로 보아 대화를 missed로 뺐기 때문이다(`missed.mjs` `classifyConvo`). 창 시험에서 `ATRIUM_TEST_PREFIX`를 맞지 않는 값으로 주어 풀었다.
- 고치기 전 코드(`main` 873ca69의 소스)로 돌린 결과(`experiments/p53/p53-before.json`), 넷 다 재현됐다.
  - #10 빈 판: `herdr | 앱 연결 서비스가 1회 다시 시작되었습니다.`(backend_started 1개)
  - #8 카드: `p53 outside convo: say ok | 10분 0초 | ⎇ HEAD | 요청 …`
  - #9 영어, 22%: 셸 먼 얼굴 `@sp1 | Idle | Prompt`
  - #10 백엔드를 한 번 멈춘 뒤: `herdr | ×2 | 앱 연결 서비스가 2회 다시 시작되었습니다. (중단 시간: 1초)`
- 고친 뒤 같은 시험 4/4 통과(`experiments/p53/p53-after.json`, 스크린숏 `p53-after-*.png`). `backend` 363, `app` 153 시험 통과, `app` 빌드 통과.
- 정리: 시험 셸 끔, 판 백엔드와 herdr 서버(`atrium-dev-p53`) 끔, 시험 폴더와 `backend/.dev`의 시험 데이터 지움. 남은 프로세스 없음을 확인했다.

## 보고

### #8 저장소 밖 대화 카드의 "⎇ HEAD"

- **재현:** 됨(위 작업 기록).
- **원인:** Claude Code는 저장소 밖 폴더(와 분리된 HEAD)에서 대화 기록의 `gitBranch`에 `"HEAD"`를 쓴다. `convos.mjs`가 그 값을 그대로 `branch`로 담았고, 캔버스 카드 줄(`recall.mjs` 대화 노드)은 워크스페이스 종류를 보지 않고 `branch`를 내보냈다. 사이드바 목록(`convoRowView`)은 저장소 워크스페이스에서만 브랜치를 보여서 카드에만 나왔다.
- **수정:** 순수 함수 `branchName()`(`convos.mjs`)이 `HEAD`와 빈 값을 버린다. 대화 기록을 읽을 때, `convoView`, 캔버스 대화 노드에 쓴다. 제안("저장소 밖이면 버림")처럼 워크스페이스 종류로 가르지 않았다. 저장소가 아닌 폴더 워크스페이스 아래에 저장소인 하위 폴더가 있으면 진짜 브랜치를 보여야 하기 때문이다. 색인에 이미 `HEAD`로 남은 줄도 보여줄 때 거르므로 `CONVO_PARSER`는 올리지 않았다(전체 다시 읽기를 피함).
- **시험:** `backend/test/p53.test.mjs`(HEAD·빈 값, 기록 읽기, 색인에 남은 값), 창 시험 `#8` 통과.
- **댓글 초안:**
  > Cause: Claude Code writes `"gitBranch":"HEAD"` outside a repository (and on a detached HEAD), and the canvas card passed that value through as the branch.
  > Fix: a small `branchName()` in `backend/src/convos.mjs` drops `HEAD`/empty values when reading transcripts and when building the card and list views, so already-indexed rows are cleaned too. Verified on a fresh board with a non-git folder: the card has no branch badge.

### #9 영어 "Prompt" 두 뜻

- **재현:** 됨(셸 먼 얼굴 `Idle | Prompt`).
- **원인:** `en.js`에서 요청 이름표(`node.prompt`, `convo.prompt`)와 셸의 명령 대기(`workspaces.shellPrompt`, `chat.prompt`, `chat.promptLast`)가 모두 `Prompt`였다. 한국어는 `요청`과 `명령 입력 대기`로 나뉘어 있다.
- **수정:** 셸 쪽 영어를 한국어 뜻에 맞춰 `Waiting for command`(`chat.promptLast`는 `Waiting for command · last command: {cmd}`)로 바꿨다. 요청 이름표는 `Prompt` 그대로다. 제안의 `At prompt`는 셸 용어라서, 한국어 "명령 입력 대기"와 뜻이 바로 맞는 말을 골랐다. 한국어는 바꾸지 않았다. P39 용어표에 더할 짝: `요청` = `Prompt`, `명령 입력 대기` = `Waiting for command`.
- **시험:** `app/test/p53-lib.test.mjs`(두 뜻이 다른 말, 한국어 짝), 창 시험 `#9` 통과. 22%에서 먼 얼굴 줄 안에 들어간다(`p53-after-enprompt-1-far.png`).
- **댓글 초안:**
  > Cause: `en.js` used `Prompt` both for the request label and for a shell waiting at its prompt.
  > Fix: the shell wait text is now `Waiting for command` (`Waiting for command · last command: {cmd}` in the chat view), matching the Korean `명령 입력 대기`; `Prompt` stays only for the request label. The pair is noted for the P39 term table.

### #10 첫 시작을 재시작으로 셈, "herdr" 이름표

- **재현:** 됨(빈 판 1회, 한 번 멈춘 뒤 2회, 줄 이름표 `herdr`).
- **원인:** `changes.mjs`가 `backend_started`를 모두 재시작으로 셌다. 빈 데이터 폴더의 첫 시작에는 `previousRun`(앞선 실행의 마지막 심장 박동)이 없다. 또 herdr 꺼짐과 백엔드 재시작을 한 `herdr` 줄로 묶었다.
- **수정:** 순수 함수 `isRestart()`가 `previousRun.lastHeartbeatAt`이 있을 때만 재시작으로 본다. herdr 줄과 백엔드 줄을 나눠 백엔드 줄은 새 종류 `backend`(이름표 ko `앱 연결 서비스`, en `Backend`, `locales` 끝의 `changeSys.backend`)로 낸다. 줄이 하나씩이라 `chgList`로 묶지 않는다. 창의 `CHANGE_LABEL`(`lib/attention.js`)은 종류 → 열쇠 표로 바꿨다.
- **시험:** `backend/test/p53.test.mjs`(첫 시작, 1회 재시작, 줄 나눔), `p16.test.mjs`의 herdr 줄 열쇠 기대값을 `chgHerdrDown`으로 고침, `app/test/p53-lib.test.mjs`(이름표), 창 시험 `#10` 두 단계 통과.
- **댓글 초안:**
  > Cause: `summarizeChanges` counted every `backend_started` event, including a board's first start (no `previousRun`), and reported backend restarts in the `herdr` row.
  > Fix: only starts with a previous run's heartbeat count as restarts (`isRestart()` in `backend/src/changes.mjs`), and backend restarts get their own row labeled "Backend" / "앱 연결 서비스". Verified on a fresh board: no line at first, "1회" after one stop/start.

### 남의 영역, 문서

- 고친 파일: `backend/src/convos.mjs`, `recall.mjs`(대화 노드의 `branch` 한 줄), `changes.mjs`, `app/src/renderer/lib/attention.js`, `locales/en.js`(셸 문구 3개는 제자리, 새 열쇠는 끝), `locales/ko.js`(끝에 새 열쇠). P49가 고치는 파일은 건드리지 않았다.
- ARCH 201행(복귀 요약) 새 문장 제안: `판 이벤트를 "세션 × 종류" 한 줄로 모음. herdr 꺼짐과 백엔드 재시작(앞선 실행이 있을 때만)은 따로 한 줄(`changes.mjs`)`.
- 재현 각본 `ux1-repro.mjs`는 ux1 판 전용이라 돌리지 않고, 같은 판정을 `app/test/e2e/p53-issues.mjs`로 옮겼다(`MT_E2E_OUT=p53 node test/e2e/p53-issues.mjs --tag <이름>`, app에서).
