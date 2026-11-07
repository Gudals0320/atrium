상태: 열림
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

## 보고
