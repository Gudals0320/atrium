상태: 열림
날짜: 2026-11-07

## 지시

### 목표

iPhone Safari에서 보드 화면만 열자마자 죽는다(P84의 가벼운 화면인 목록은 버틴다). 죽는 단계를 기기에서 바로 가려내는 기록을 남기고, 다시 열 때마다 기능을 하나씩 덜어 낸 보드로 열어 살아남는 단계를 찾아 그 단계로 보드를 쓰게 하고, 가장 유력한 원인을 고친다.

### 사용자의 말(2026-11-07, `v0.1.4-dev.5`)

"음 계속 닫혀서 canvas 말고 세션 목록으로 fallback 되는거같음"

### 지휘 세션이 알아낸 것(실제 판의 연결 기록과 판 기록의 개수를 읽기만 함)

- 보드로 열면 소켓이 열리고 0.25~1.05초 만에 1006(페이지 죽음)이다. 그사이 서버가 보낸 것은 메시지 15~23개, 41~250KB, 마지막 다섯 개가 `t2434 t62080 t40704 t47520 t57197`(글 메시지 바이트)이다.
- P84의 `boot` 줄: 다섯 번 모두 `view: board`, `terms 0, px 0, gl 0, inB 0`, `dpr 3`, `ago` 0.5~8초. 기록을 2초마다 적으므로 1초 안의 죽음 직전 값이 아니다. 0이라고 캔버스·터미널이 아니라고 볼 수 없다.
- 가벼운 화면(목록)은 3.5~7초 버티고 1001(사람이 "보드로 다시 열기")로 떠난다. 목록은 터미널을 붙이지 않고 받은 양이 41~46KB다.
- 전체 보기(터미널 하나, WebGL)는 `dev.2`에서 193초 버텼다. `dev.3`(WebGL, 터미널 여럿)의 보드는 약 6초 만에 죽었다. `dev.4` 이후(휴대폰 웹은 WebGL 없이 DOM, 터미널 3개까지) 보드는 1초 안에 죽는다.
- 실제 판의 크기: 열린 세션 4개(행 82개), 대화 노드 31개, 대화 색인 442개, 연결 73개, 워크스페이스 3개, 덩어리·메모·칸반 없음. 노드 수가 많지는 않다.
- 가설(확정하지 않음): 보드가 터미널을 붙이고 큰 전체 프레임(40~62KB)이 오자마자 죽는다. 축소된 판(React Flow 변환) 안의 xterm이 WebKit에서 글자 크기를 잘못 재 칸·줄 수가 크게 늘거나, DOM 렌더러가 많은 요소를 만들거나, 큰 합성 레이어(화면 배율 3)가 생기는 것이 후보다. 대화 노드, 판의 효과(그림자, 빛, P85의 도는 둘레, 필터), 뿌리 요소의 CSS `zoom`(P49)도 본다.

### 할 것

1. **단계 기록.** 웹 화면이 보드를 여는 단계마다 그 자리에서(동기로) `localStorage`의 P84 기록에 단계와 값을 적는다. P84의 2초 주기와 별도다. 단계 예: 소켓 열림, 큰 메시지 받음(종류 이름과 바이트, 내용 없음), 판 상태 적용(종류별 노드 수, 선 수), 첫 그리기, 화면 맞춤과 배율, 터미널 붙기마다(세션, 잰 글자 폭·높이, 칸·줄, DOM 셀 수), 첫 프레임 쓰기 전과 뒤. 다음 부팅의 `boot` 줄에 마지막 단계 몇 개가 남아 PC 연결 기록과 `atrium remote log`에 보인다.
2. **스스로 좁혀 가는 보드.** 보드가 죽은 뒤 "보드로 다시 열기"를 누르면 한 단계씩 가벼운 보드로 연다. 예:
   - L1: 보드에 터미널을 붙이지 않고 얼굴만 보인다(전체 보기는 그대로)
   - L2: L1에 더해 대화 노드·메모·칸반을 빼고, 선을 단순하게 그린다
   - L3: L2에 더해 효과를 끈다(그림자, 빛, 움직임, 필터, `will-change`, CSS `zoom`)
   - L4: L3에 더해 지금 워크스페이스의 세션만 보인다

   단계는 근거에 따라 바꿔도 된다. 살아남은 단계(1분 넘게 살거나 정상으로 떠남)를 그 기기에 기억하고 연결 기록에 남긴다. 화면 한쪽에 지금 단계를 작게 보이고, 한 단계 무겁게 다시 시도하기와 처음으로 되돌리기를 둔다. 두 사전, 지금 말투.
3. **원인 찾기와 고치기.** Playwright WebKit으로 실제 WebKit 엔진에서 재현해 본다. 이 PC의 Playwright 1.64.1에 맞는 WebKit이 없으면 `npx playwright install webkit`으로 받아도 된다(사용자 캐시에 새 폴더만 더한다. 다른 판은 지우지 않는다). 가설마다 잰다.
   - 축소한 판 안 xterm의 잰 글자 폭과 칸·줄, DOM 셀 수: WebKit과 Chromium, 판 배율 0.1·0.3·1
   - 합성 레이어 수와 가장 큰 레이어의 장치 픽셀: CDP `LayerTree`, Chromium
   - 큰 메시지 종류
   - 효과와 대화 노드를 뺄 때의 차이

   원인이 드러나면 고친다. 예: 칸·줄 상한, 글자 크기 재기를 변환 밖에서, 휴대폰 보드는 터미널 대신 얼굴. 고친 것으로 L0(전부 켬)이 WebKit 흉내에서 버티는지 본다.
4. **PC 창은 바꾸지 않는다.** 마우스 웹 화면도 바뀐다면 근거를 적는다.

### 손대지 말 것

- 원격 연결 처리(P82), tailscale·네트워크 설정. 실제 판으로 시험하지 않는다.

### 완료 기준

1. 단위 시험: 단계 기록(동기 적기, 크기 상한, 내용 없음), 단계 낮추기·기억·되돌리기 판단, 칸·줄 상한 같은 고친 것.
2. 창 시험(개발용 판, 원격 흉내 `app/test/e2e/p59-lib.mjs`, iPhone 393×852 화면 배율 3). 판은 실제 판과 비슷하게 꾸민다: 세션 4~8개, 그 가운데 긴 출력의 셸·에이전트, 대화 노드 30개 안팎(고정 자료 `ATRIUM_CLAUDE_PROJECTS`), 워크스페이스 3개.
   - WebKit(받을 수 있으면)과 Chromium으로 고치기 전과 뒤에 잰 값을 `experiments/p86/`에 둔다.
   - 페이지를 죽여(CDP `Page.crash` 등) 단계 기록이 `boot` 줄에 남는지, 다시 열기가 L1 → L2 …로 내려가고 기억되는지 본다.
3. 보고에 사람이 iPhone으로 할 순서를 적는다(몇 번 다시 열고 무엇을 알려 주면 되는지). 연결 기록의 어느 값으로 원인이 갈리는지도 적는다.
4. `cd backend && npm test`, `cd app && npm test`, `cd app && npm run build`가 통과한다.

### 읽을 파일

- `CLAUDE.md`, `docs/testing.md`(원격 창 시험, 페이지 죽음 흉내), `docs/log/p84-phone-crash.md`(작업 기록과 보고 전체), `docs/log/p76-phone-board-touch.md`, `docs/log/p85-overview-working.md`의 보고 절
- `app/src/renderer/crash-watch.js`, `app/src/renderer/lib/crumbs.js`, `app/src/renderer/TerminalView.jsx`, `app/src/renderer/Canvas.jsx`, `app/src/renderer/SessionNode.jsx`, `app/src/renderer/ConvoNode.jsx`, `app/src/renderer/Phone.jsx`, `app/src/renderer/lib/faces.js`, `app/src/renderer/lib/term-sharp.js`, `app/src/renderer/web.js`(CSS zoom), `app/src/renderer/api.js`
- `backend/src/web-crash.mjs`, `backend/src/remote-log.mjs`
- `app/test/e2e/p84-crash.mjs`(창 시험 틀)

### 시험 환경

- 이 작업은 `dev` 브랜치에서 시작한다. 워크트리를 연 뒤 먼저 `git fetch origin && git merge --ff-only origin/dev`를 한다(워크트리가 `main`에서 시작할 수 있다).
- 너는 사용자의 실제 판 위에서 도는 워커라 셸에 실제 판의 `ATRIUM_*`·`HERDR_*`가 있다. 시험, 개발용 판, herdr, `atrium`은 이 변수를 지운 셸(`backend/.dev/clean-env.sh`, `docs/testing.md`)로 부른다.
- 개발용 판은 너만의 판으로 띄운다(`docs/testing.md`).
  - `ATRIUM_HERDR_SESSION=atrium-dev-p86`, `ATRIUM_PORT=47897`, 창의 원격 디버깅 포트 9377
  - `ATRIUM_DATA_DIR=<워크트리>/backend/.dev/data`, `ATRIUM_APP_USERDATA=<워크트리>/backend/.dev/app`
- 실제 판(`atrium`, 47800)과 다른 판의 포트는 쓰지 않는다. 사용자의 기본 herdr 세션, 실제 판의 herdr 세션(`atrium`), 다른 판의 herdr 서버는 건드리지 않는다. 사용자의 실제 판은 열지도 캡처하지도 않는다. 스크린숏은 창 안만 찍는다(`page.screenshot`).
- 실제 판의 API(47800)와 `atrium` 명령으로 실제 판을 바꾸지 않는다. 시험의 `atrium` CLI는 늘 개발용 판 환경 변수(`ATRIUM_PORT` 등)를 주고 부른다.
- 실제 설치 폴더(`%LOCALAPPDATA%\atrium\versions`)와 실제 데이터 폴더(`%LOCALAPPDATA%\atrium`)는 읽지도 바꾸지도 않는다.
- 대화 목록은 시험 폴더의 대화만 읽는다(`ATRIUM_CLAUDE_PROJECTS`, `ATRIUM_CLAUDE_DESKTOP=none`). 시험 폴더는 `C:\Workspace\mtask-p86-*`처럼 새로 만든다.
- 세션은 `claude --model haiku`와 셸로 띄운다.
- 끝나면 시험 세션, 창, 브라우저, 백엔드, herdr 서버와 세션(`atrium-dev-p86`만), 시험 폴더를 끄고 지운다. 네가 띄운 프로세스가 남지 않았는지 포트로 확인한다.

### 지킬 것

- `CLAUDE.md`를 따른다. 프로세스는 직접 띄운 것만 PID로 끈다. 신뢰 질문은 대신 답하지 않는다.
- 이 저장소는 공개다. 작업 기록, 시험 코드, 커밋 메시지, 그림에 사용자 경로·메일·토큰, 실제 PC·tailnet 이름, IP, 실제 대화 내용을 쓰지 않는다. 커밋 전·푸시 전 검사를 건너뛰지 않는다.
- 화면 글은 영어와 한국어 사전 둘 다 고친다. 한국어 문구는 사전의 지금 말투(`docs/log/korean-copy-review.md`)를 따른다.
- 같은 때 다른 작업자는 없다. 맡은 일에 필요한 만큼만 고치고, `styles.css`와 두 사전은 끝에 더해 합치기 쉽게 한다.
- 자기 브랜치에만 커밋한다. 커밋 메시지에 `Co-Authored-By` 줄을 넣지 않는다. `main`이나 `dev`를 바꾸거나 푸시하지 않는다. `node_modules`는 워크트리 안에서 받는다(`npm ci`, 창은 그 뒤 `node node_modules/electron/install.js`).
- 문서는 이 작업 파일의 작업 기록 절과 보고 절만 고친다. 고쳐야 할 ARCH·BRIEF·testing·README 문장은 보고 절에 짧게 적는다. 살아 있는 문서 예산이 거의 찼으니(70,000자 중 69,970자) 문장은 바꾸는 문장보다 길지 않게 적는다.
- 끝나면 보고 절을 쓰고, 맨 마지막에 `<워크트리>/backend/.dev/p86.done`(브랜치 이름, 마지막 커밋 해시, 시험 수 세 줄)을 만든다.

## 작업 기록

- 시작: `git fetch origin && git merge --ff-only origin/dev`(df0ec5f). 워크트리 안에서 `npm ci`(백엔드, 창)와 Electron 받기. 판 값을 지우는 `backend/.dev/clean-env.sh`, 이 판 값만 넣는 `backend/.dev/p86.sh`(둘 다 git 밖). 흉내 프록시는 47893.
- Playwright 1.64.1에 맞는 WebKit(2370)이 없어 `npx playwright install webkit`으로 받았다(사용자 캐시에 `webkit-2370`, `ffmpeg-1013`이 더해짐, 다른 판은 그대로). 이 PC에서 WebKit이 열리고 iPhone 흉내(393×852, 화면 배율 3, 손가락, Safari UA)로 판을 쓴다. 흉내 주소는 `localhost:47893`(WebKit은 Chromium 보안 출처 플래그가 없다).
- 창 시험 `app/test/e2e/p86-board.mjs`: 워크스페이스 3개(`C:\Workspace\mtask-p86-a·b·c`), 세션 6개(긴 출력의 셸 4, haiku 2), 연결 1개, 대화 노드 30개(고정 자료, `ATRIUM_TEST_PREFIX`를 바꿔 `mtask-` 시험 폴더의 대화도 판에 올림). PC가 남긴 화면 자리(배율 1)로 연다. 결과는 `experiments/p86/`.

### 고치기 전에 잰 것(`P86_STAGE=before`, WebKit과 Chromium)

| 자리 | 터미널 | 칸×줄(잰 글자 폭) | DOM 셀(span) | DOM 수 | WebKit 사적 MB | Chromium 사적 MB |
|---|---:|---|---:|---:|---:|---:|
| PC가 남긴 자리(배율 1) | 1 | 166×33(8.406) / 175×33(8.0) | 34 | 1141 | 395 | 430 |
| 전체 맞춤(배율 0.09) | 0 | - | 0 | 671 | 395 | 485 |
| 배율 0.1 | 0 | - | 0 | 671 | 382 | 446 |
| 배율 0.3 | 3 | 166×31 / 175×31 | 65 | 888 | 428 | 482 |
| 배율 1, 노드 둘 | 2 | 166×33 / 175×33 | 68 | 1231 | 423 | 481 |
| 배율 1, 효과 끔 | 2 | 같음 | 68 | 1232 | 420 | 470 |
| 배율 1, 효과·대화 노드 끔 | 2 | 같음 | 68 | 569 | 420 | 441 |

- 잰 글자 폭은 판 배율(0.1·0.3·1)과 상관없이 같다(xterm은 `offsetWidth`·`measureText`로 재 변환의 영향을 받지 않는다). 칸·줄이 크게 느는 일은 없다. DOM 렌더러는 줄마다 span 한두 개라 셀 수도 작다.
- WebKit 웹 프로세스 메모리는 첫 6초 395~408MB(빈 판 바탕이 약 350MB)로 터미널 하나에 약 10MB. 데스크톱 WebKit은 죽지 않는다. iOS의 WebContent 메모리 한도는 흉내 낼 수 없다.
- Chromium 합성 레이어(CDP LayerTree): 6~9개, 그리는 레이어 3개, 가장 큰 것 3M 장치 px. 효과 요소(will-change·움직임·필터)는 0(작업 중 세션이 없어 도는 둘레 없음), 그림자 15~21.
- 큰 메시지: `events.subscribe` 8KB, `board.get` 26KB(대화 노드 30개), `terminal.history` 132~164KB(셸 기록, 붙은 셸마다 하나), 첫 `terminal.frame` 6~8KB. 실제 판의 40~62KB 줄들(`t62080 t40704 t47520 t57197`)은 붙은 셸마다 오는 `terminal.history` 응답 모양과 맞는다.
- 큰 요소: 영역(워크스페이스) 노드가 3000×2260 CSS px, React Flow 뷰포트의 내용이 3672×4640 CSS px. 넘침 스크롤 요소는 없다(xterm 6은 VS Code 스크롤 요소로 가상 스크롤).
- 찾은 것: xterm 6의 스크롤 막대 손잡이는 `transform: translate3d(0,0,0)`(VS Code `setLayerHinting`)라 터미널마다 합성 레이어 하나를 만든다. 도는 둘레(P85)는 `will-change: transform`. WebKit은 합성된 자식을 가진 변환(노드의 translate, 뷰포트의 scale) 조상을 함께 합성 레이어로 올리므로, 보드에 터미널이 붙으면 축소한 판 전체(내용 3672×4640 CSS px, 화면 배율 3)가 레이어가 될 수 있다. 목록(터미널 없음)과 전체 보기(변환 밖 터미널 하나)는 버티고 보드만 죽는 것, `dev.4`에서 WebGL(그 자체가 합성 레이어)을 DOM으로 바꿔도 죽는 것과 맞는다. iOS에서 확인하지 못한 가설이다.

### 고친 것

1. 단계 기록(`lib/crumbs.js` `stepOf`·`crumbStep`·`keepSteps`, `crash-watch.js` `step`): 그 자리에서 `localStorage mt.crumbs`의 지금 부팅에 단계를 더한다. 단계 = 이름, 부팅부터 ms, 숫자 값 8개까지와 종류 이름(`k`)만. 기기에 20개, boot 줄로 14개. 줄일 때도 이정표(boot, open, board, paint, fit의 처음 것)는 남기고 나머지는 마지막 것부터. 이름마다 한 부팅에 적는 수 상한(msg 8, term·fw0·fw1·hist 6 등).
   - `boot`(단계, 기억 여부, DPR, 창 크기), `open`(소켓 열림, 받은 바이트), `msg`(8KB 넘는 메시지: 이벤트·요청 이름과 바이트, 처리 전), `board`(판 적용: 노드·세션·대화 노드·띄움 선·메모·칸반·연결·워크스페이스 수, 그리기 전), `paint`(첫 그리기: 노드·세션·대화 노드·선·DOM 수), `frame`(그 다음 화면), `fit`(배율·자리, 저장한 자리인지), `att`(붙일 터미널 수·배율), `term`(터미널 붙기: 칸·줄, 잰 글자 폭·높이, 판 배율, DOM 렌더러, 글자 크기), `hist`(셸 기록 줄 수), `fw0`(첫 프레임과 16KB 넘는 프레임 쓰기 전: 바이트, 칸·줄), `fw1`(쓰고 그린 뒤: DOM 셀, DOM 수, 기록 줄).
   - 백엔드 `web-crash.mjs`가 `crash.steps`(14개)와 `crash.level`을 같은 규칙으로 고르고, CLI `atrium remote log`는 `마지막 단계=…`, PC 연결 기록 화면은 `마지막 단계 …`를 보인다.
2. 스스로 좁혀 가는 보드(`bootDecide`, `levelPlan`): 보드로 연 페이지가 죽으면(가려진 채, 목록에서, 가벼운 화면에서 죽음은 빼고) 다음 보드는 한 단계 가볍게(L0 → L1 … L4에서 멈춤). Safari가 다시 읽는 것이든 "보드로 다시 열기"든 같다. P84의 1분 안 두 번 → 목록은 그대로다.
   - L1 보드 터미널 없음(가까이 얼굴은 대화 보기, 전체 보기는 그대로), L2 대화 노드·메모·칸반 없음, 선은 일 시키기 연결만 이름표 없는 곧은 선, L3 효과 끔(`html.mt-lite`: 그림자, 빛, 움직임, 필터, will-change, 도는 둘레, 웹 화면 배율 CSS zoom), L4 지금 워크스페이스의 세션만.
   - 보드를 그린 뒤 1분 넘게 살거나 정상으로 떠나면 그 단계를 기억하고(`ok`) 연결 기록에 `level` 줄(`web.level`, 기기 연결 하나에 한 번)을 남긴다. 다음 부팅도 그 단계. 기억한 단계에서 또 죽으면 한 단계 더 내린다. boot 줄에는 이 부팅의 단계(`level`)와 죽은 페이지의 단계(`crash.level`).
   - 위 오른쪽 작은 알약 "가벼운 보드 · n단계": 누르면 무엇을 껐는지, 기억 여부, "한 단계 무겁게"(n−1, 기억 지움), "처음으로"(L0). 다시 읽기는 죽음으로 세지 않는다. 두 사전.
3. 원인 후보 고치기: 손가락 웹 보드(`html.mt-touch-board`)에서는 판 안 xterm 스크롤 손잡이의 `transform`을 없애고(자리는 `top`이라 그대로 보인다) 도는 둘레의 `will-change`를 뺀다. 전체 보기와 PC 창은 그대로.
4. 칸·줄 상한(`capDims`): 웹 화면 터미널은 400칸 × 150줄까지(잰 값과 프레임 크기 모두). PC 창은 그대로.
5. PC 창은 바뀌지 않는다(단계·기록은 웹 화면만, `bootState`가 Electron에서 `web: false`). 마우스 웹 화면도 단계 기록과 단계 내리기를 쓴다(죽은 뒤에만 바뀐다). 스크롤 손잡이 고침은 손가락 화면만.

### 고친 뒤에 잰 것(`P86_STAGE=after`)

- 1차(18/20): L0에서 WebKit·Chromium 모두 보드 터미널 2개, 판 안 스크롤 손잡이 4개의 transform 0, will-change 0. 첫 6초 메모리 WebKit 353~397MB, Chromium 436~455MB(고치기 전과 같은 범위. 데스크톱 엔진에서는 이 레이어가 메모리 차이를 만들지 않는다).
- 페이지 죽음: Chromium은 CDP `Page.crash`, WebKit은 이 시험이 띄운 WebKit 웹 프로세스를 PID로 꺼서 흉내 냈다. 죽음 1번 뒤 둘 다 L1 보드(터미널 0, 알약 "1단계"), boot 줄에 `level: 1`과 단계. `atrium remote log`에 `보드 단계=1  마지막 단계=term 166x33 cw 8.406 ch 18 z 1 … › msg terminal.history 164K 0.8s › hist lines 1000 … › fw1 cells 67 dom 1213 sb 1000 0.9s`.
- Chromium 사다리: 죽음 2번(1분 안) → 목록과 다음 보드 L2 → 보드로 다시 열기 L2(대화 노드 0, 터미널 0, 선 1개가 곧은 선) → 죽음 → 목록, L3 → L3(`mt-lite`, 판 안 움직임 0, 그림자 0, CSS zoom 1) → 죽음 → L4(세션 3/6, 지금 워크스페이스만) → 64초 뒤 `ok`와 `level` 줄 하나(level 4) → 다시 읽어도 L4와 "기억합니다" → 한 단계 무겁게 L3(기억 지움) → 처음으로 L0(알약 없음, 터미널 2) → 그 다시 읽기들은 boot 줄 없음. 모두 통과.
- 실패 2개: boot 줄에 마지막 10개만 가 이정표(board, paint)가 빠졌다(터미널 둘의 term·fw0·hist·fw1이 뒤를 채움). 기기에는 boot·open·msg(events.subscribe 8.8K, board.get 26.8K)·board·paint·frame·att·term…이 다 있었다. 이정표를 늘 남기고 boot 줄 14개로 고쳤다(`keepSteps`, 단위 시험).
- 2차: 고친 창으로 다시 돌렸으나 개발용 백엔드를 다시 띄우지 않아(옛 `STEP_MAX = 10`) WebKit boot 줄은 같았고, 그 뒤 PC 메모리가 모자라 Claude Code가 시험을 멈췄다(4/6에서 중단). 기기 쪽 기록(`mt.crumbs`)에는 이정표가 모두 있었다. 이 PC에서 다시 돌리지 않았다.
- 시험 수: 백엔드 600(새 5), 창 325(새 11), 창 시험 1차 18/20(실패 2는 위에서 고침), `npm run build` 통과.
- 정리: 시험 세션 6개 지움, `atrium backend stop`, `atrium herdr stop --yes`, `herdr session delete atrium-dev-p86`, 시험 폴더 `C:\Workspace\mtask-p86-a·b·c` 지움. 47893·47894·47897·9377에 듣는 프로세스와 `atrium-dev-p86`·Playwright 브라우저가 남지 않았다. PC 창은 띄우지 않았다.

## 보고

### 한 것

1. 보드를 여는 단계마다 그 자리에서(동기로) 단계와 값을 기기에 적고, 죽은 뒤의 `boot` 줄에 마지막 단계 14개(이정표 boot·open·board·paint·fit은 늘 포함)를 남긴다. 이름, ms, 숫자, 종류 이름만이라 내용은 없다. `atrium remote log`와 PC 연결 기록 화면에 `마지막 단계=…`, `보드 단계=n`이 보인다.
2. 보드가 죽을 때마다 다음 보드는 한 단계 가볍게 연다(L1 터미널 없음 → L2 대화 노드·메모·칸반 없음, 곧은 선 → L3 효과 끔 → L4 지금 프로젝트만). 1분 넘게 살거나 정상으로 떠난 단계는 기기에 기억하고 연결 기록에 `level` 줄. 위 오른쪽 알약에 지금 단계, "한 단계 무겁게", "처음으로". 두 사전.
3. WebKit(Playwright 2370)으로 iPhone 흉내를 처음 열었다. 데스크톱 WebKit은 죽지 않고(웹 프로세스 약 400MB), 잰 글자 폭·칸·줄·DOM 셀·메시지 크기에 이상한 값이 없었다. 가장 유력한 원인으로 판 안의 합성 레이어(xterm 6 스크롤 손잡이의 `translate3d`, 도는 둘레의 `will-change`)를 손가락 웹 보드에서 없앴고, 웹 터미널 칸·줄 상한(400×150)을 두었다.
4. PC 창은 바뀌지 않는다.

### 사람이 iPhone으로 할 순서

1. PC를 이 빌드로 올리고 iPhone Safari로 보드를 연다. 보드가 그대로 쓰이면(1분 넘게) 끝이다. 위 오른쪽에 알약이 없으면 L0(전부 켬)이다.
2. 닫히면 Safari가 다시 열 때 위 오른쪽에 "가벼운 보드 · 1단계"가 보인다(또는 1분 안에 두 번이면 목록과 "보드로 다시 열기"). 닫힐 때마다 그대로 다시 열거나 "보드로 다시 열기"를 누른다. 많아야 네 번이면 L4까지 내려간다.
3. 살아남은 단계(알약의 숫자, 알약을 누르면 "이 기기는 이 단계를 기억합니다")를 알려 준다.
4. PC에서 `atrium remote log --limit 20`(또는 PC 창 › 설정 › 연결된 기기 › 연결 기록)의 "화면이 닫힌 뒤 다시 열림" 줄들(`보드 단계=`, `마지막 단계=`)과 "보드 단계 기억" 줄을 그대로 보내 준다. 내용은 들어 있지 않다.

### 연결 기록에서 원인을 가르는 법

- 살아남은 단계: L1이면 보드 터미널, L2면 대화 노드·메모·칸반이나 선, L3면 효과(그림자·움직임·필터·CSS zoom), L4면 판의 크기(노드 수)다. L4도 죽으면 보드 자체(React Flow 뷰포트, 영역)다.
- `마지막 단계`의 마지막 이름: `open`·`msg`에서 끝나면 그리기 전(큰 메시지 처리), `board`면 판 적용 뒤 첫 그리기, `paint`·`frame`·`fit`이면 그린 뒤(레이어·배율), `term`·`fw0`이면 터미널을 붙이거나 첫 프레임을 쓰는 중, `hist`면 셸 기록을 쓰는 중, `fw1`까지 있으면 터미널을 다 그린 뒤다. `t`(ms)로 소켓 열림부터 얼마 만인지 본다.
- `term`의 `cw`(잰 글자 폭)이 8 안팎이 아니거나 `c`·`r`(칸·줄)이 400·150에 붙으면 글자 재기 문제다. `fw1`의 `cells`·`dom`이 수천을 넘으면 DOM 렌더러, `msg`의 `b`가 크면(수백 KB) 그 메시지(`terminal.history` 등)다.
- L0에서 더는 죽지 않으면 이번 고침(판 안 합성 레이어 없애기)이 원인을 맞힌 것이다.

### 고칠 문서 문장(짧게)

- ARCH 1절 원격 문단의 "…반복해서 죽으면 가벼운 화면으로 연다(P84)."를 "…반복해서 죽으면 가벼운 화면으로 열고, 죽을 때마다 보드를 한 단계씩 덜어 연다(P86)."로.
- ARCH API 표의 `web.boot` 자리에 `web.level`을 더한다(같은 줄, "`web.boot`·`web.level`").
- testing.md 원격 창 시험 줄 끝: "WebKit은 Playwright 2370으로 연다(`localhost`, 웹 프로세스를 PID로 끄면 페이지 죽음, P86)."
- BRIEF, README: 고칠 문장 없음.

### 남은 것

- iOS의 WebContent 한도와 레이어 처리는 흉내 낼 수 없어 원인은 확정하지 않았다. 기기의 단계 기록과 살아남은 단계로 닫는다.
- 마우스 웹 화면도 죽은 뒤에는 단계를 내린다(단계 기록은 웹 화면 모두). 손가락이 아닌 화면의 레이어 고침은 하지 않았다.
- L3의 `html.mt-lite`는 가벼운 화면(목록)에도 걸린다(움직임이 꺼질 뿐).
- 이정표를 고친 뒤의 창 시험은 메모리 부족으로 끝까지 돌지 못했다. 메모리가 넉넉할 때 `P86_RESTART=1 sh backend/.dev/clean-env.sh node app/test/e2e/p86-board.mjs`로 한 번 더 돌린다(약 5분).
