상태: 열림
날짜: 2026-11-07

## 지시

### 목표

iPhone Safari가 판을 열자마자 다시 읽히다가 "문제가 반복적으로 발생했습니다"를 띄우고 닫혀 휴대폰으로 판을 쓸 수 없다. 페이지가 죽는 까닭을 기기에서 잡아 오고, 반복해서 죽으면 가벼운 화면으로 열어 쓸 수 있게 하고, 가장 유력한 원인(휴대폰의 터미널 메모리)을 줄인다.

### 사용자의 말(2026-11-07, `v0.1.4-dev.3`)

"지금 safari에서 딱 켰는데 키자마자 재부팅되더니 safari에서 "문제가 반복적으로 발생했습니다." 뜨면서 닫힘. 사용이 안됨"

### 지휘 세션이 알아낸 것(실제 판의 연결 기록을 읽기만 함)

- `v0.1.4-dev.3`(19:13): 연결 두 번이 각각 5.8초, 6.0초 만에 1006으로 끊기고 그 뒤로 기록이 없다. 6초 동안 보낸 메시지 27~33개, 230~350KB, 마지막 다섯 개에 40~58KB짜리 글 메시지가 여럿이다(`ws.last`).
- `v0.1.4-dev.2`(18:23): 전체 보기(터미널 하나)를 보던 연결은 193초 붙어 있다가 1006.
- 끊긴 뒤 다시 붙은 `connect`에 P82의 직전 닫힘(`prev`)이 한 번도 없다. 창이 살아서 다시 붙었다면 `pc`를 보냈을 것이므로, 1006 끊김은 소켓만이 아니라 페이지(WebContent)가 죽고 다시 읽힌 것일 수 있다. P82 전의 "몇 초마다 튕김"도 같은 것일 수 있다.
- 가설: 휴대폰 보드 화면이 터미널 여럿을 붙이고, iPhone의 화면 배율 3에서 xterm 캔버스(와 WebGL)가 Safari의 캔버스·GPU 메모리 한도를 넘어 페이지가 죽는다. 전체 보기(터미널 하나)는 버텼다. P83(`dev.3`)의 높이 보정(`useScreenFix`)은 Safari 탭에서는 아무것도 하지 않아 원인이 아니라고 보지만 확인한다. 확정하지 않았다.

### 할 것

1. **죽기 전 기록(기기에서).** 웹 화면이 짧은 간격으로 자기 상태를 `localStorage`에 적어 둔다. 적을 것: 부팅 시각과 횟수, 마지막으로 살아 있던 시각, 화면(보드·목록·전체 보기), 붙은 터미널 수, xterm 캔버스의 장치 픽셀 합, WebGL 컨텍스트 수, `devicePixelRatio`, 받은 바이트. 페이지가 정상으로 떠날 때(`pagehide`)는 그것도 적는다. 다음 부팅이 정상 떠남 없이 시작되면 직전 기록을 백엔드로 보내 연결 기록(`remote-log.jsonl`)에 남긴다(예: `boot` 줄에 `crashed: true`와 직전 상태). 내용(글, 화면)은 보내지 않는다. PC의 연결 기록과 `atrium remote log`에 보인다.
2. **반복해서 죽으면 가벼운 화면.** 짧은 사이(예: 1분 안)에 정상 떠남 없이 두 번 다시 읽히면, 다음 부팅은 가벼운 화면으로 연다. 휴대폰이면 목록 화면, 터미널은 사람이 고른 하나만, WebGL 없음. 위에 "화면이 반복해서 닫혀 가볍게 열었습니다"와 "보드로 다시 열기"를 보인다. 다시 열었는데 또 죽으면 다시 가벼운 화면으로 온다. 두 사전, 지금 말투.
3. **휴대폰의 터미널 메모리 줄이기.** 지금 휴대폰 보드 화면(손가락 포인터, 웹)에서 붙는 터미널 수, 캔버스 크기(CSS px와 장치 픽셀), WebGL 사용, 다시 그리기 횟수를 먼저 잰다. 그다음 근거를 들어 줄인다. 예:
   - 휴대폰 웹은 WebGL을 쓰지 않는다.
   - 터미널 캔버스의 장치 픽셀 배율에 상한을 둔다(화면 배율 3을 그대로 쓰지 않는다).
   - 멀리 보기에서는 터미널을 붙이지 않고 얼굴만 보인다.
   - 동시에 붙는 터미널 수를 휴대폰에서 더 적게 한다.

   PC 창은 바꾸지 않는다.
4. **dev.3 변경 확인.** P83의 높이 보정, 명령 바 손잡이(`visualViewport` 이벤트), 휴대폰 글자, P82의 같은 xterm 다시 붙기가 휴대폰에서 되풀이 고리(크기 바꿈 → 전체 프레임 요청 → 다시 크기 바꿈)를 만들지 않는지 재어 적는다. 고리가 있으면 고친다.

### 손대지 말 것

- 원격 연결 처리(P82의 압축·기록)와 PC 창의 터미널 처리, tailscale·네트워크 설정은 바꾸지 않는다. 실제 판으로 시험하지 않는다.

### 완료 기준

1. 단위 시험: 기록 적기와 정상 떠남 판단, 죽음 판단과 가벼운 화면 판단, 기록 줄의 필드(내용 없음), 휴대폰 터미널 예산(수, 배율 상한, WebGL 끔).
2. 창 시험(개발용 판, 원격 흉내 `app/test/e2e/p59-lib.mjs`, iPhone 393×852 화면 배율 3 흉내 Chromium. P82·P83처럼 Playwright WebKit은 열리지 않으면 Chromium으로). 결과는 `experiments/p84/`에 둔다.
   - 세션 12개 안팎이 있는 판에서 휴대폰 보드 화면을 열어 고치기 전과 뒤의 터미널 수, 캔버스 장치 픽셀 합, WebGL 컨텍스트 수, 메모리(Chromium `performance.memory`나 CDP)를 잰다.
   - 페이지를 정상 떠남 없이 두 번 죽여(CDP `Page.crash` 등) 가벼운 화면으로 열리고 연결 기록에 `crashed` 줄이 남는지 본다.
3. 보고에 사람이 iPhone으로 확인할 순서와, 연결 기록에서 무엇을 보면 원인이 갈리는지 적는다.
4. `cd backend && npm test`, `cd app && npm test`, `cd app && npm run build`가 통과한다.

### 읽을 파일

- `CLAUDE.md`, `docs/testing.md`(원격 창 시험), ARCH 1절 원격 문단, `docs/log/p65-terminal-sharpness.md`, `docs/log/p76-phone-board-touch.md`, `docs/log/p82-phone-disconnects.md`, `docs/log/p83-phone-full-view.md`의 보고 절
- `app/src/renderer/TerminalView.jsx`, `app/src/renderer/lib/faces.js`(`RendererBudget`), `app/src/renderer/lib/term-sharp.js`, 노드에 터미널을 붙이는 쪽(`Canvas.jsx`, `SessionNode.jsx`), `app/src/renderer/Phone.jsx`, `app/src/renderer/PhoneFull.jsx`, `app/src/renderer/api.js`, `app/src/renderer/perf.js`
- `backend/src/web.mjs`, `backend/src/remote-log.mjs`, `backend/src/remote-ws.mjs`
- `app/test/e2e/p82-drops.mjs`, `app/test/e2e/p83-phone.mjs`(창 시험 틀)

### 시험 환경

- 이 작업은 `dev` 브랜치에서 시작한다. 워크트리를 연 뒤 먼저 `git fetch origin && git merge --ff-only origin/dev`를 한다(워크트리가 `main`에서 시작할 수 있다).
- 너는 사용자의 실제 판 위에서 도는 워커라 셸에 실제 판의 `ATRIUM_*`·`HERDR_*`가 있다. 시험, 개발용 판, herdr, `atrium`은 이 변수를 지운 셸(`backend/.dev/clean-env.sh`, `docs/testing.md`)로 부른다.
- 개발용 판은 너만의 판으로 띄운다(`docs/testing.md`).
  - `ATRIUM_HERDR_SESSION=atrium-dev-p84`, `ATRIUM_PORT=47897`, 창의 원격 디버깅 포트 9377
  - `ATRIUM_DATA_DIR=<워크트리>/backend/.dev/data`, `ATRIUM_APP_USERDATA=<워크트리>/backend/.dev/app`
- 실제 판(`atrium`, 47800)과 다른 판의 포트는 쓰지 않는다. 사용자의 기본 herdr 세션, 실제 판의 herdr 세션(`atrium`), 다른 판의 herdr 서버는 건드리지 않는다. 사용자의 실제 판은 열지도 캡처하지도 않는다. 스크린숏은 창 안만 찍는다(`page.screenshot`).
- 실제 판의 API(47800)와 `atrium` 명령으로 실제 판을 바꾸지 않는다. 시험의 `atrium` CLI는 늘 개발용 판 환경 변수(`ATRIUM_PORT` 등)를 주고 부른다.
- 실제 설치 폴더(`%LOCALAPPDATA%\atrium\versions`)와 실제 데이터 폴더(`%LOCALAPPDATA%\atrium`)는 읽지도 바꾸지도 않는다.
- 대화 목록은 시험 폴더의 대화만 읽는다(`ATRIUM_CLAUDE_PROJECTS`, `ATRIUM_CLAUDE_DESKTOP=none`). 시험 폴더는 `C:\Workspace\mtask-p84-*`처럼 새로 만든다.
- 세션은 `claude --model haiku`와 셸로 띄운다.
- 끝나면 시험 세션, 창, 브라우저, 백엔드, herdr 서버와 세션(`atrium-dev-p84`만), 시험 폴더를 끄고 지운다. 네가 띄운 프로세스가 남지 않았는지 포트로 확인한다.

### 지킬 것

- `CLAUDE.md`를 따른다. 프로세스는 직접 띄운 것만 PID로 끈다. 신뢰 질문은 대신 답하지 않는다.
- 이 저장소는 공개다. 작업 기록, 시험 코드, 커밋 메시지, 그림에 사용자 경로·메일·토큰, 실제 PC·tailnet 이름, IP, 실제 대화 내용을 쓰지 않는다. 커밋 전·푸시 전 검사를 건너뛰지 않는다.
- 화면 글은 영어와 한국어 사전 둘 다 고친다. 한국어 문구는 사전의 지금 말투(`docs/log/korean-copy-review.md`)를 따른다.
- 같은 때 P85 작업자가 판 `atrium-dev-p85`(47898, CDP 9378)로 멀리 보기 강조를 고친다(`SessionNode.jsx`, `Canvas.jsx`, 위 칩). 그 포트와 세션은 쓰지 않는다. 맡은 일에 필요한 만큼만 고치고, `styles.css`와 두 사전은 끝에 더해 합치기 쉽게 한다.
- 자기 브랜치에만 커밋한다. 커밋 메시지에 `Co-Authored-By` 줄을 넣지 않는다. `main`이나 `dev`를 바꾸거나 푸시하지 않는다. `node_modules`는 워크트리 안에서 받는다(`npm ci`, 창은 그 뒤 `node node_modules/electron/install.js`).
- 문서는 이 작업 파일의 작업 기록 절과 보고 절만 고친다. 고쳐야 할 ARCH·BRIEF·testing·README 문장은 보고 절에 짧게 적는다. 살아 있는 문서 예산이 거의 찼으니(70,000자 중 69,991자) 문장은 바꾸는 문장보다 길지 않게 적는다.
- 끝나면 보고 절을 쓰고, 맨 마지막에 `<워크트리>/backend/.dev/p84.done`(브랜치 이름, 마지막 커밋 해시, 시험 수 세 줄)을 만든다.

## 작업 기록

## 보고
