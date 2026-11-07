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

## 보고
