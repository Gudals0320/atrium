상태: 닫힘
날짜: 2026-11-07

## 지시

### 목표

휴대폰의 두 가지를 고친다. 세션이 일하는 중에 보낸 글이 판의 대기열에서 턴이 끝나기를 기다리지 않고, PC 터미널에서 Enter를 친 것처럼 바로 Claude Code 입력칸에 들어가게 한다. 휴대폰 목록의 순서가 활동마다 바뀌지 않게 한다.

### 사용자의 말(2026-11-07, `v0.1.4`)

"그리고 모바일에서 돌아가는 중에 메세지 한번 더 보내면 바로 등록해. btw 말고 그.. 컴퓨터에서 돌아갈 때 엔터 치면 일단 조금 기다렷다가 입력되잖아? 그걸 기본 형태로 해줘. / 그리고 모바일에서 세션 배열 순서. 그중에서도 돌아가고 있는 세션 순서가 마지막으로 갱신된 순서로 하는 거 같아서, 마구마구 바뀌어서 보는게 힘든데 그냥 시작한지 오래된 놈 순서대로 진행하는 걸로 해줘."

### 지금

- 휴대폰 입력 줄(목록의 세션 화면 `Phone.jsx`, 보드 전체 보기 `PhoneFull.jsx`)은 에이전트면 `session.send`(전달 대기열, ARCH 4절 B1)로 보낸다(`lib/phone.js sendPlan`). B1은 `working`이면 보내지 않고 `ready`가 될 때까지 기다린다. 그래서 일하는 중에 보낸 글은 턴이 끝난 뒤에야 들어간다.
- PC에서 Claude Code 터미널에 직접 치고 Enter를 누르면, Claude Code가 일하는 중에도 그 글을 입력칸 아래 대기 메시지로 받아 두었다가 알맞을 때 넣는다. 사용자는 이것을 휴대폰의 기본으로 원한다("btw"처럼 옆으로 묻는 것이 아니다).
- 휴대폰 목록(`lib/phone.js phoneList`)은 응답 필요 → 일하는 중 → 워크스페이스별 순서다. 일하는 중은 마지막 활동 시각의 최근 순(`recent(b) - recent(a)`)이라 활동마다 자리가 바뀐다. 워크스페이스별 목록도 `recent`가 섞여 있다.

### 할 것

1. **일하는 중에 보내기.** 휴대폰 입력 줄에서 Claude Code 세션이 `working`(또는 `starting` 뒤 턴 중)이면, 글을 판 대기열에 두지 않고 바로 그 터미널 입력칸에 넣고 Enter를 누른다.
   - Claude Code가 자기 대기 메시지로 받아 두게 하는 것이다. 여러 줄은 B1 (5)처럼 줄바꿈을 맞춰 한 번에 넣고, Enter는 마지막에 한 번 누른다.
   - 사람이 그 터미널에 치던 글이 있으면 덮지 않는다.
   - 제출되었는지(hook `UserPromptSubmit`이나 화면의 대기 표시)를 가능한 만큼 확인해 Thread·전달 기록에 남긴다. 판의 전달 기록이나 Thread에 이 글이 어떻게 보이는지 정해 적는다.
   - `waiting`·`trust_wait`(권한·질문·신뢰 대화상자)에서는 바로 넣지 않는다. 그 화면에 글을 치면 선택지가 눌릴 수 있으므로 지금처럼 대기열에 둔다.
   - `ready`에서는 지금처럼 `session.send`로 보낸다.
   - Claude Code가 아닌 종류(codex 등)와 셸은 지금 그대로다. 근거가 있으면 다르게 정해 적는다.
   - 실제 Claude Code에서 일하는 중에 넣은 글이 대기 메시지가 되는지 시험으로 확인한다(개발용 판, `claude --model haiku`). 대기 표시의 화면 모양은 작업 기록에 적는다.
2. **목록 순서 고정.** 휴대폰 목록의 일하는 중 세션은 시작한 지 오래된 순(세션을 띄운 시각 `createdAt`이 이른 것부터)으로 둔다. 워크스페이스별 목록도 활동 시각 대신 같은 기준으로 둔다. 응답 필요는 묻기 시작한 순서(지금 그대로)다. 같은 상태 안에서는 활동이 생겨도 순서가 바뀌지 않아야 한다. 상태가 바뀌어 다른 칸으로 옮기는 것은 그대로다.
3. **PC 창은 바꾸지 않는다.** PC의 명령 바와 판 전달 규칙(B1)은 그대로 둔다.

### 손대지 말 것

- 같은 때 P89 작업자가 휴대폰 작업 관계도(`PhoneMission.jsx`, `lib/phone-mission.js`)를 고친다. 그 파일은 건드리지 않고, `phone.css`·두 사전은 끝에 더한다.
- 원격 연결(P82)과 tailscale·네트워크 설정. 실제 판으로 시험하지 않는다.

### 완료 기준

1. 단위 시험:
   - 보내기 판단: Claude Code `working`이면 바로 넣기, `waiting`·`trust_wait`·`ready`·셸·다른 종류는 지금대로
   - 넣는 바이트: 여러 줄, 끝 줄바꿈, Enter 한 번
   - 목록 순서: 일하는 중은 `createdAt` 오름차순, 활동 시각이 바뀌어도 그대로, 워크스페이스별 목록도 같은 기준
2. 창 시험(개발용 판, 원격 흉내 `app/test/e2e/p59-lib.mjs`, iPhone 흉내 Chromium. 흉내 프록시는 47895·47896을 쓴다). 결과는 `experiments/p90/`에 둔다.
   - haiku 세션에 오래 도는 턴을 시키고(시험 폴더의 `.claude/settings.local.json`, testing.md), 그동안 휴대폰에서 글을 보내 바로 Claude Code 대기 메시지가 되고 턴 뒤에 처리되는지 본다.
   - 권한을 묻는 중에는 대기열에 남는지 본다.
   - 일하는 세션 셋의 활동이 바뀌어도 목록 순서가 그대로인지 본다.
3. 보고에 사람이 iPhone으로 볼 순서를 적는다.
4. `cd backend && npm test`, `cd app && npm test`, `cd app && npm run build`가 통과한다.

### 읽을 파일

- `CLAUDE.md`, `docs/testing.md`(원격 창 시험, 오래 도는 턴), ARCH 4절 B1, `docs/log/p74-mobile-web.md`, `docs/log/p87-phone-list-mission.md`의 보고 절
- `app/src/renderer/Phone.jsx`, `app/src/renderer/PhoneFull.jsx`, `app/src/renderer/lib/phone.js`(`sendPlan`, `phoneList`), `backend/src/delivery.mjs`, `backend/src/screen.mjs`(입력칸 읽기, P79), `backend/src/backend.mjs`(`session.send`, `terminal.input`)
- `app/test/e2e/p87-phone.mjs`(창 시험 틀)

### 시험 환경

- 이 작업은 `dev` 브랜치에서 시작한다. 워크트리를 연 뒤 먼저 `git fetch origin && git merge --ff-only origin/dev`를 한다(워크트리가 `main`에서 시작할 수 있다).
- 너는 사용자의 실제 판 위에서 도는 워커라 셸에 실제 판의 `ATRIUM_*`·`HERDR_*`가 있다. 시험, 개발용 판, herdr, `atrium`은 이 변수를 지운 셸(`backend/.dev/clean-env.sh`, `docs/testing.md`)로 부른다.
- 개발용 판은 너만의 판으로 띄운다(`docs/testing.md`).
  - `ATRIUM_HERDR_SESSION=atrium-dev-p90`, `ATRIUM_PORT=47898`, 창의 원격 디버깅 포트 9378
  - `ATRIUM_DATA_DIR=<워크트리>/backend/.dev/data`, `ATRIUM_APP_USERDATA=<워크트리>/backend/.dev/app`
- 실제 판(`atrium`, 47800)과 다른 판의 포트는 쓰지 않는다. 사용자의 기본 herdr 세션, 실제 판의 herdr 세션(`atrium`), 다른 판의 herdr 서버는 건드리지 않는다. 사용자의 실제 판은 열지도 캡처하지도 않는다. 스크린숏은 창 안만 찍는다(`page.screenshot`).
- 실제 판의 API(47800)와 `atrium` 명령으로 실제 판을 바꾸지 않는다. 시험의 `atrium` CLI는 늘 개발용 판 환경 변수(`ATRIUM_PORT` 등)를 주고 부른다.
- 실제 설치 폴더(`%LOCALAPPDATA%\atrium\versions`)와 실제 데이터 폴더(`%LOCALAPPDATA%\atrium`)는 읽지도 바꾸지도 않는다.
- 대화 목록은 시험 폴더의 대화만 읽는다(`ATRIUM_CLAUDE_PROJECTS`, `ATRIUM_CLAUDE_DESKTOP=none`). 시험 폴더는 `C:\Workspace\mtask-p90-*`처럼 새로 만든다.
- 세션은 `claude --model haiku`와 셸로 띄운다.
- 끝나면 시험 세션, 창, 브라우저, 백엔드, herdr 서버와 세션(`atrium-dev-p90`만), 시험 폴더를 끄고 지운다. 네가 띄운 프로세스가 남지 않았는지 포트로 확인한다.

### 지킬 것

- `CLAUDE.md`를 따른다. 프로세스는 직접 띄운 것만 PID로 끈다. 신뢰 질문은 대신 답하지 않는다.
- 이 저장소는 공개다. 작업 기록, 시험 코드, 커밋 메시지, 그림에 사용자 경로·메일·토큰, 실제 PC·tailnet 이름, IP, 실제 대화 내용을 쓰지 않는다. 커밋 전·푸시 전 검사를 건너뛰지 않는다.
- 화면 글은 영어와 한국어 사전 둘 다 고친다. 한국어 문구는 사전의 지금 말투(`docs/log/korean-copy-review.md`)를 따른다.
- 같은 때 P89 작업자가 판 `atrium-dev-p89`(47897, CDP 9377)로 휴대폰 작업 관계도를 고친다. 그 포트와 세션은 쓰지 않는다. 맡은 일에 필요한 만큼만 고치고, `styles.css`와 두 사전은 끝에 더해 합치기 쉽게 한다.
- 자기 브랜치에만 커밋한다. 커밋 메시지에 `Co-Authored-By` 줄을 넣지 않는다. `main`이나 `dev`를 바꾸거나 푸시하지 않는다. `node_modules`는 워크트리 안에서 받는다(`npm ci`, 창은 그 뒤 `node node_modules/electron/install.js`).
- 문서는 이 작업 파일의 작업 기록 절과 보고 절만 고친다. 고쳐야 할 ARCH·BRIEF·testing·README 문장은 보고 절에 짧게 적는다. 살아 있는 문서 예산이 거의 찼으니(70,000자 중 69,995자) 문장은 바꾸는 문장보다 길지 않게 적는다.
- 끝나면 보고 절을 쓰고, 맨 마지막에 `<워크트리>/backend/.dev/p90.done`(브랜치 이름, 마지막 커밋 해시, 시험 수 세 줄)을 만든다.

## 작업 기록

- 시작: `git fetch origin && git merge --ff-only origin/dev`(`fa4b78e`). 워크트리 안에서 `npm ci`(백엔드, 창)와 Electron 받기. 물려받은 판 변수를 지우는 `backend/.dev/clean-env.sh`와 이 판의 값(`atrium-dev-p90`, 47898, `backend/.dev/data`·`app`)만 넣는 `backend/.dev/p90.sh`를 만들어 시험, CLI, herdr를 모두 이것으로 불렀다(git 밖).
- 먼저 실제 Claude Code(v2.1.319, haiku)가 일하는 중에 받은 글을 어떻게 다루는지 개발용 판에서 보았다(`experiments/p90/tools/explore*.mjs`, git 밖).
  - 터미널에 글을 치고 Enter: 글이 스피너 위에 `❯ 글`과 그 아래 `ctrl+enter to send now`로 붙고, 입력 칸은 흐린 안내 `Press up to edit queued messages`가 된다. 대기 메시지가 둘이면 `❯` 줄이 둘 쌓이고 안내 줄은 마지막 아래에 하나다.
  - hook `UserPromptSubmit`은 턴이 끝날 때가 아니라 Enter 직후(17ms)에 그 글로 온다. 그래서 B1의 제출 확인(규칙 6)을 그대로 쓸 수 있다. Claude Code는 그 글을 지금 턴 안에서 읽어 답에 넣었다(`done` 다음 `banana`).
  - herdr `agent.prompt`도 working인 패널에 받아 같은 대기 메시지가 된다(여러 줄 그대로, 둘이면 쌓임). herdr 도움말: 패널이 막혔으면(blocked) 글을 넣기 전에 `agent_blocked`로 거부한다.
- 그래서 바로 넣기는 새 경로를 만들지 않고 B1 대기열 안에서 `agent.prompt`로 한다. 권한 화면에 글이 눌리는 것을 판(상태 working, 입력 칸이 비었음)과 herdr(blocked면 거부)가 두 번 막는다.
- 정한 것
  - `session.send`에 `whileWorking: 'type'`을 더했다. 휴대폰 목록의 세션 화면(`Phone.jsx`)만 Claude Code 세션에 붙인다(`sendPlan`). PC 명령 바와 다른 호출은 그대로다.
  - 백엔드 판단 `canTypeNow(view)`(`delivery.mjs`): 판이 띄운 Claude Code(hook 있음)이고 상태가 `working`, herdr 연결, 에이전트 있음. `waiting`·`trust_wait`·`starting`·`ready`, 셸, 다른 종류, hook 없는(판에 올린) Claude Code는 B1 그대로다. hook 없는 세션은 일하는 중에 넣으면 제출을 확인할 길이 없어(working으로 바뀌는 신호가 없다) 뺐다.
  - 넣기 전에 입력 칸을 읽는다(P79 `inspect`, 1.5초에 한 번). 비었을 때만 넣고, 글이 있으면(사람이 쓰던 글) `queued`(이유 `draft`), 못 읽으면 `queued`(이유 `working`)로 기다린다. 사람이 3초 안에 쳤으면 화면도 보지 않고 `user_typing`. 대기 안내 글 `Press up to edit queued messages`는 빈 칸으로 본다(`screen.mjs`). 그래야 두 번째 휴대폰 글도 바로 들어간다.
  - 넣는 글: 줄바꿈은 LF, 끝 줄바꿈은 뗀다(`typedText`). Enter는 `agent.prompt`가 마지막에 한 번 누른다.
  - 전달 기록과 Thread: 상태 흐름은 B1과 같다(sending → sent → confirmed). 이유 칸에 `typed`를 남기고 휴대폰 알림 줄·명령 바 전달 줄·Thread에 "제출 확인됨 (Claude Code 대기열에 추가됨)"으로 보인다. 기다리는 동안 입력 칸에 글이 있으면 "전송 대기 중 (입력란에 작성 중인 글 있음)"이다. 사전 두 개 끝에 `typeNow` 절을 더했다.
  - 대기열 순서는 지킨다. 앞에 기다리는 보통 전달(PC 명령 바 등)이 있으면 휴대폰 글은 그 뒤에서 기다린다(앞지르면 순서가 바뀐다).
  - 바로 넣기 표시는 저장하지 않는다. 백엔드가 다시 뜨면 남은 글은 B1 그대로 보낸다.
  - 보드 전체 보기(`PhoneFull.jsx`)의 입력 줄은 이미 터미널 입력(붙여 넣기 + Enter, `linePlan`)이라 일하는 중에도 바로 들어간다. 화면을 보며 치는 곳이라 고치지 않았다. 지시의 "지금" 절과 다르다.
  - 목록 순서(`phoneList`): 일하는 중 칸과 워크스페이스별 목록을 `createdAt` 오름차순(같으면 이름, ID)으로 바꿨다. 워크스페이스별 목록은 살아 있는 것 먼저(그대로). 응답 필요는 묻기 시작한 순 그대로다. P74 단위 시험의 기대(최근 순)를 새 기준으로 고쳤다.
- 단위 시험: 백엔드 `test/p90.test.mjs` 10개(판단, 넣는 글, 대기 안내, 바로 넣기·확인, 쓰던 글, 못 읽음·사람 입력, 권한·신뢰 화면 뒤 B1, `agent_blocked`, PC 명령 바·셸·다른 종류·hook 없음, 순서). `test/p21.test.mjs`의 가짜 판에 `hooked`를 더했다(전달 판단이 본다). 창 `test/p90-lib.test.mjs` 3개.
- 결과: `cd backend && npm test` 630/630, `cd app && npm test` 339/339, `npm run build` 통과.
- 창 시험 `app/test/e2e/p90-phone-send.mjs`(iPhone 흉내 Chromium, 흉내 프록시 47895): 11/11 통과(첫 회는 10/11: 판 언어가 영어라 한국어 문구만 찾은 시험 쪽 잘못, Thread 결과 칸 이름도 고침). 결과는 `experiments/p90/`.
  - A: p90-lead가 `ping -n 110`을 도는 중에 휴대폰에서 보낸 글이 331ms 만에 제출 확인(이유 typed), 세션은 계속 working, 화면에 `❯ P90 phone note…`와 `ctrl+enter to send now`, 입력 칸은 대기 안내. 여러 줄 두 번째 글도 줄바꿈 그대로 두 번째 대기 메시지. Thread 두 줄 모두 confirmed·typed. 턴 끝 답: `done / mango / kiwi`.
  - B: p90-w2가 `mkdir` 권한을 묻는 중에 보낸 글은 6초 뒤에도 queued(이유 waiting), 선택지 4개 그대로, 폴더 생기지 않음. 거절로 풀자 B1로 보내 confirmed(이유 없음).
  - C: 일하는 셋(lead, w2, 셸 ping)이 시작 순으로 보이고 표본 52개 내내 순서가 같았다(상태가 바뀌어 빠질 때만 줄어듦). 같은 동안 활동 시각의 최근 순은 6번 바뀌었다.
- 정리: 시험 세션 셋을 `atrium kill`, 백엔드 멈춤, herdr 서버(`atrium-dev-p90`) 멈춤과 세션 지우기, 시험 폴더 지우기. 포트 47898·47895·47896·9378에 듣는 프로세스가 없고, 명령줄에 이 워크트리·`atrium-dev-p90`·시험 폴더가 든 프로세스도 없음을 확인했다. 신뢰 질문은 나오지 않았다.

## 보고

### 한 것

- 휴대폰 목록의 세션 화면에서 보낸 글은 Claude Code(판이 띄운 세션)가 일하는 중이고 입력 칸이 비었으면 판 대기열에서 기다리지 않고 바로 `agent.prompt`로 들어가, PC에서 Enter를 친 것처럼 Claude Code의 대기 메시지가 된다. 권한·질문·신뢰 화면, 시작 중, 쉬는 중, 셸, 다른 종류, hook 없는 세션은 전과 같다.
- 휴대폰 목록의 일하는 중 칸과 워크스페이스별 목록은 시작한 순으로 고정했다.
- PC 명령 바와 B1 규칙은 바꾸지 않았다(`whileWorking`을 주지 않으면 전과 같다).

### 바꾼 파일

- 백엔드: `src/delivery.mjs`(`canTypeNow`, `typedText`, `_typeNow`, 이유 `typed`·`draft`), `src/screen.mjs`(대기 안내 글은 빈 입력 칸), `src/backend.mjs`(`session.send`의 `whileWorking`, 전달 판단에 `kind`·`hooked`), 시험 `test/p90.test.mjs`, `test/p21.test.mjs`.
- 창: `lib/phone.js`(`sendPlan`, `phoneList` 순서), `Phone.jsx`(보낼 때 `whileWorking`), `lib/labels.js`(전달 표시), 사전 두 개 끝 `typeNow`, 시험 `test/p90-lib.test.mjs`, `test/p74-lib.test.mjs`, 창 시험 `test/e2e/p90-phone-send.mjs`. `PhoneMission.jsx`, `lib/phone-mission.js`, `phone.css`는 건드리지 않았다.

### 사람이 iPhone으로 볼 순서

1. 판(PC)에서 Claude Code 세션 하나에 오래 걸리는 일을 시킨다.
2. iPhone 홈 화면의 Atrium을 열고 목록 위쪽 "일하는 중"에서 그 세션을 누른다.
3. 입력 줄에 글을 쓰고 보낸다. 입력 줄 위 알림이 곧 "제출 확인됨 (Claude Code 대기열에 추가됨)"이 되고, 터미널에는 스피너 위에 `❯ 보낸 글`과 `ctrl+enter to send now`, 입력 칸에 `Press up to edit queued messages`가 보인다.
4. 한 번 더 보내면 대기 메시지가 하나 더 쌓인다. 턴이 끝나면(또는 그 전에 Claude Code가 읽으면) 답에 반영된다.
5. 권한을 묻는 세션에 글을 보내면 "전송 대기 중 (사용자 응답 대기 중)"으로 남고 선택지는 그대로다. 답한 뒤 보내진다.
6. 세션 여럿이 일하는 동안 목록을 보고 있으면, 일하는 중 칸의 순서가 띄운 순서 그대로이고 활동이 생겨도 움직이지 않는다.

### 고칠 문서 문장

- ARCH 4절 B1의 "(3) starting, trust_wait, working에서는 보내지 않고 ready와 error에서만 보낸다." → "(3) ready·error에서만 보낸다(휴대폰 글은 working이고 입력 칸이 비면 넣는다, P90)."
- ARCH API 표 `session.send` 행: "`session.send { target, text, workspace?, source? }` … 대상마다 `agent.prompt`(B1). 셸은 `not_agent`" → "`session.send { target, text, workspace?, source?, whileWorking? }` … `agent.prompt`(B1). 셸은 `not_agent`".
- BRIEF·testing·README: 바꿀 문장 없음. testing.md에 넣는다면 "일하는 중 대기 메시지는 화면의 `ctrl+enter to send now`와 즉시 오는 `UserPromptSubmit`으로 본다(P90)." 한 줄(대신 줄일 문장이 필요하다).

### 남은 것

- 휴대폰 글이 PC 명령 바에서 먼저 보내 기다리는 글을 앞지르지 않는다. 그런 글이 있으면 휴대폰 글도 턴 뒤에 간다.
- 판은 working인데 herdr는 blocked인 짧은 틈에는 `agent_blocked` → 대기(waiting) → 1.5초 뒤 다시 시도를 되풀이한다(글은 들어가지 않는다). 상태가 맞춰지면 멈춘다.
- 백엔드가 다시 뜨면 기다리던 휴대폰 글은 B1 그대로 턴 뒤에 간다(바로 넣기 표시를 저장하지 않는다).
