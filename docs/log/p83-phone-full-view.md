상태: 열림
날짜: 2026-11-07

## 지시

### 목표

휴대폰(iPhone Safari) 화면의 다섯 가지를 고친다. 전체 보기(`PhoneFull.jsx`)는 위 띠가 흐리고, 글자를 가장 작게 해도 크고, 나가는 길을 모르면 못 나가고, 아래에 빈 띠가 남는다. 보드 화면은 아래 명령 줄을 열 수 없다.

### 사용자의 말(2026-11-07, `v0.1.4-dev.2`, iOS Safari)

"핸드폰에서 봤을 때 상단 부분에 뭔가 흐릿한데..ios 기능인가? 터미널 제목이 너무 상단에 붙어있어서 그런지 좀 흐리다. 그리고 글자 줄이고 키우는 옵션이 잇긴 한데 최대한 줄여도 좀 나한테 큼. 작아지는게 더 좋은거같음. 그리고 화면 나가기 할때 zoom out 하면 되던데 (특정 세션 클릭하면 해당 세션으로 줌 되는거) 뭔가 그걸 모르면 우야노? 나가기 버튼같은게 있으면 좋겠다. 그리고 아이폰에서 봤을 때 하단이 안채워져있는건데 이건 뭐임?"

사용자의 화면 그림은 git 밖 `C:\Workspace\multitask\experiments\p83\user-ios-full.png`에 있다(세로 iPhone, Safari, 전체 보기). 실제 대화 내용이 보이므로 그림을 옮기거나 저장소에 넣지 않고, 작업 기록에는 모양만 적는다. 그림에서 보이는 것:

- 위 띠(점, 세션 이름, "준비 완료", "탭하면 보드로", A−, A+)가 상태 표시줄 바로 아래에 붙어 있고, 띠 전체가 흐리게 번져 보인다.
- 터미널 글자가 커서 Claude Code가 "Resize your terminal to at least 110 columns to show the diff"를 띄운다.
- 키 줄 아래에 페이지 색 띠(약 45pt)가 있고, 그 아래 화면 맨 끝(약 70pt)은 더 검은 띠로 비어 있다.

### 할 것

1. **위 띠 흐림.** 원인을 찾아 적는다. 후보: iOS Safari가 상태 표시줄 아래(위 가장자리)에 그리는 흐림·색 띠, 판 CSS의 `backdrop-filter`·투명도·글자 색, `viewport-fit`과 `env(safe-area-inset-top)` 처리. 판 탓이면 고치고, Safari 탓이면 띠를 안전 영역 아래로 충분히 내리거나 위 가장자리 색을 맞춰 흐림 띠에 걸리지 않게 한다. 띠의 글이 또렷해야 한다.
2. **더 작은 글자.** 휴대폰 전체 보기의 A−로 지금 가장 작은 값(`lib/scale.js` 70%)보다 더 작게 줄일 수 있게 한다. 세로 iPhone(390pt 폭 안팎)에서 Claude Code가 110칸 안팎을 받을 수 있는 크기까지를 목표로, 읽을 수 있는 가장 작은 값을 재어 정한다. PC 창의 터미널 글자 배율(70~150%)은 바꾸지 않는다. 저장된 값과 새 하한이 맞지 않으면 안전하게 맞춘다.
3. **나가기 단추.** 전체 보기 위 띠에 보드로 돌아가는 단추를 눈에 띄게 둔다(예: 왼쪽 "← 보드"). 지금의 위 띠 누르기, 뒤로 쓸기, 오므리기는 그대로 둔다. "탭하면 보드로" 글은 단추가 생기면 줄이거나 뺀다. 두 사전, 지금 말투. 휴대폰 목록 화면이나 다른 웹 화면에서도 같은 길이 필요하면 보고에 적는다.
4. **아래 빈 띠.** 키 줄 아래가 비는 원인을 찾아 적는다. 후보: `innerHeight`·`visualViewport`·`100vh`/`dvh` 높이 차이, 홈 표시줄 안전 영역(`env(safe-area-inset-bottom)`)과 `mt-kb-open` 처리, `html`·`body` 배경, Safari 아래 도구 막대가 접힐 때의 높이. 화면이 아래 끝까지 판 색으로 차고, 키 줄은 홈 표시줄 바로 위에 붙고, 남는 높이는 터미널이 갖게 한다. 키보드가 올라올 때(P74·P76)의 동작은 그대로 지킨다.

5. **휴대폰의 아래 명령 줄.** 사용자의 말(같은 날): "그리고 모바일 환경에서는 커서가 따로 없어서 하단 명령줄이 절대 안켜짐. 이건 그냥 고정해놓던지 알아서 해봐". 아래 명령 바(P43 자동 숨김)는 마우스가 아래 띠에 머물 때 나타나므로 손가락 포인터에서는 열 길이 없다. 손가락 포인터(`pointer: coarse`)나 휴대폰 보드 화면에서는 명령 바를 늘 보이게 두거나, 아래의 얇은 표시를 탭하면 열리게 하는 것 중 하나를 근거를 들어 고른다(보드를 가리는 높이, 키보드가 올라올 때 입력칸이 가려지지 않는지, 터치 규칙과 부딪히지 않는지를 잰다). 마우스가 있는 PC·노트북의 자동 숨김은 그대로 둔다.

### 손대지 말 것

- 휴대폰 보드 화면의 터치 규칙(P76)과 원격 연결 처리(P82)는 바꾸지 않는다.
- PC 창(Electron)과 데스크톱 브라우저 화면은 바꾸지 않는다.

### 완료 기준

1. 단위 시험을 더하고 통과한다: 새 글자 하한과 저장값 맞추기, 높이 계산(안전 영역, 도구 막대 접힘, 키보드 열림).
2. 창 시험(개발용 판, 원격 흉내 `app/test/e2e/p59-lib.mjs`, iPhone 흉내 Chromium. P82처럼 Playwright WebKit은 열리지 않으면 Chromium으로)으로 고치기 전과 뒤를 같은 단계로 찍어 `experiments/p83/`에 둔다: 위 띠, 가장 작은 글자에서 터미널 칸 수, 나가기 단추로 보드로 돌아가기, 아래 끝까지 찬 화면, 키보드가 열린 때, 휴대폰 보드 화면에서 명령 바를 열고 보내기. 흉내로 재현되지 않는 것(Safari의 흐림 띠 등)은 그 사실과 근거를 적는다.
3. 보고에 사람이 iPhone으로 확인할 순서를 적는다.
4. `cd backend && npm test`, `cd app && npm test`, `cd app && npm run build`가 통과한다.

### 읽을 파일

- `CLAUDE.md`, `docs/testing.md`(원격 창 시험), ARCH 1절 원격 문단, `docs/log/p74-mobile-web.md`, `docs/log/p76-phone-board-touch.md`, `docs/log/p82-phone-disconnects.md`의 보고 절
- `app/src/renderer/PhoneFull.jsx`, `app/src/renderer/Phone.jsx`(`readPhoneScale`, 안전 영역, `mt-kb-open`), `app/src/renderer/lib/phone.js`(`viewportBox`), `app/src/renderer/lib/touch-board.js`(`fullLayout`), `app/src/renderer/lib/scale.js`, `app/src/renderer/lib/bottom.js`와 `CommandBar.jsx`(P43 자동 숨김), `app/src/renderer/styles.css`의 전체 보기 규칙, 웹 화면의 HTML(`viewport` 메타, `theme-color`), 두 사전
- `app/test/e2e/p76-touch.mjs`, `app/test/e2e/p82-drops.mjs`(창 시험 틀)

### 시험 환경

- 이 작업은 `dev` 브랜치에서 시작한다. 워크트리를 연 뒤 먼저 `git fetch origin && git merge --ff-only origin/dev`를 한다(워크트리가 `main`에서 시작할 수 있다).
- 너는 사용자의 실제 판 위에서 도는 워커라 셸에 실제 판의 `ATRIUM_*`·`HERDR_*`가 있다. 시험, 개발용 판, herdr, `atrium`은 이 변수를 지운 셸(`backend/.dev/clean-env.sh`, `docs/testing.md`)로 부른다.
- 개발용 판은 너만의 판으로 띄운다(`docs/testing.md`).
  - `ATRIUM_HERDR_SESSION=atrium-dev-p83`, `ATRIUM_PORT=47897`, 창의 원격 디버깅 포트 9377
  - `ATRIUM_DATA_DIR=<워크트리>/backend/.dev/data`, `ATRIUM_APP_USERDATA=<워크트리>/backend/.dev/app`
- 실제 판(`atrium`, 47800)과 다른 판의 포트는 쓰지 않는다. 사용자의 기본 herdr 세션, 실제 판의 herdr 세션(`atrium`), 다른 판의 herdr 서버는 건드리지 않는다. 사용자의 실제 판은 열지도 캡처하지도 않는다. 스크린숏은 창 안만 찍는다(`page.screenshot`).
- 실제 판의 API(47800)와 `atrium` 명령으로 실제 판을 바꾸지 않는다. 시험의 `atrium` CLI는 늘 개발용 판 환경 변수(`ATRIUM_PORT` 등)를 주고 부른다.
- 실제 설치 폴더(`%LOCALAPPDATA%\atrium\versions`)와 실제 데이터 폴더(`%LOCALAPPDATA%\atrium`)는 읽지도 바꾸지도 않는다.
- 대화 목록은 시험 폴더의 대화만 읽는다(`ATRIUM_CLAUDE_PROJECTS`, `ATRIUM_CLAUDE_DESKTOP=none`). 시험 폴더는 `C:\Workspace\mtask-p83-*`처럼 새로 만든다.
- 세션은 `claude --model haiku`와 셸로 띄운다.
- 끝나면 시험 세션, 창, 브라우저, 백엔드, herdr 서버와 세션(`atrium-dev-p83`만), 시험 폴더를 끄고 지운다. 네가 띄운 프로세스가 남지 않았는지 포트로 확인한다.

### 지킬 것

- `CLAUDE.md`를 따른다. 프로세스는 직접 띄운 것만 PID로 끈다. 신뢰 질문은 대신 답하지 않는다.
- 이 저장소는 공개다. 작업 기록, 시험 코드, 커밋 메시지, 그림에 사용자 경로·메일·토큰, 실제 PC·tailnet 이름, IP, 실제 대화 내용을 쓰지 않는다. 커밋 전·푸시 전 검사를 건너뛰지 않는다.
- 화면 글은 영어와 한국어 사전 둘 다 고친다. 한국어 문구는 사전의 지금 말투(`docs/log/korean-copy-review.md`)를 따른다.
- 같은 때 다른 작업자는 없다. 맡은 일에 필요한 만큼만 고치고, `styles.css`와 두 사전은 끝에 더해 합치기 쉽게 한다.
- 자기 브랜치에만 커밋한다. 커밋 메시지에 `Co-Authored-By` 줄을 넣지 않는다. `main`이나 `dev`를 바꾸거나 푸시하지 않는다. `node_modules`는 워크트리 안에서 받는다(`npm ci`, 창은 그 뒤 `node node_modules/electron/install.js`).
- 문서는 이 작업 파일의 작업 기록 절과 보고 절만 고친다. 고쳐야 할 ARCH·BRIEF·testing·README 문장은 보고 절에 짧게 적는다. 살아 있는 문서 예산이 거의 찼으니(70,000자 중 69,977자) 문장은 바꾸는 문장보다 길지 않게 적는다.
- 끝나면 보고 절을 쓰고, 맨 마지막에 `<워크트리>/backend/.dev/p83.done`(브랜치 이름, 마지막 커밋 해시, 시험 수 세 줄)을 만든다.

## 작업 기록

## 보고
