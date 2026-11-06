상태: 열림
날짜: 2026-11-06

## 지시

### 목표

휴대폰 세로 화면에서 쓰기 좋은 원격 웹 화면을 만들고, 홈 화면에 웹앱으로 설치해 쓸 수 있게 한다.

### 사용자의 말

"핸드폰 세로화면에서 조작하기 쉬운 사용자 경험을 설계하자. 공유를 휴대폰에서 하는거야. 그리고 웹앱처럼 등록해서 사용할 수 있게 하고 싶어. 일단 너가 쭉 만들고 그 이후는 내가 내 실 사용 후기를 바탕으로 후속 지시할게"

사용자는 iPhone을 쓴다. 원격 접속은 Tailscale(`tailscale serve`, https)로 PC의 판에 붙는다(ARCH 원격 접속 절, P49~P62).

### 할 것

1. **세로 화면 설계.** 좁은 세로 화면(폭 430px 이하, 터치)에서는 무한 캔버스 대신 휴대폰에 맞는 화면을 보인다. 설계는 네가 정하고 근거를 보고에 적는다. 최소한 다음을 한 손으로 할 수 있어야 한다.
   - 세션 목록: 내 차례(질문, 승인)를 맨 위에, 그다음 일하는 중, 나머지. 저장소별로 접기. 상태 점과 마지막 한 줄.
   - 세션 하나 열기: 화면 전체 터미널(읽기와 스크롤), 아래쪽 입력 줄(글 보내기, 여러 줄), 자주 쓰는 키 줄(Enter, Esc, Ctrl+C, ↑↓, Tab, `/`).
   - 승인과 질문 카드에 답하기(큰 단추).
   - 세션 사이 옮기기(목록으로 돌아가기, 다음 내 차례로 가기).
   - 새 세션 띄우기(레일의 호출자 중 고르기, 저장소 고르기).
   - 연결 상태와 다시 붙기 표시.
   - 가로로 돌리거나 태블릿·노트북 폭이면 지금 화면을 그대로 쓴다.
2. **웹앱 설치(PWA).** iPhone Safari의 "홈 화면에 추가"와 Android Chrome 설치로 웹앱처럼 열리게 한다.
   - 매니페스트: 이름, 짧은 이름, 아이콘 여러 크기, `display: standalone`, 시작 주소, 색. P49가 이미 둔 `.webmanifest`가 있으면 그것을 고친다.
   - iOS용 `apple-touch-icon`과 meta, 노치 안전 영역(`env(safe-area-inset-*)`), 가상 키보드가 입력 줄을 가리지 않게.
   - 서비스 워커는 앱 껍데기(html·js·css·글꼴·아이콘)만 캐시한다. API, WebSocket, 세션 화면, 짝 맺기와 로그인 응답은 캐시하지 않는다. 새 버전이 오면 껍데기를 바꾼다.
   - iOS의 홈 화면 웹앱은 Safari와 쿠키를 나누지 않을 수 있다. 홈 화면에서 처음 열 때 짝 맺기(코드 입력)가 그 안에서 되는지 확인하고, 안 되면 길을 만든다. 패스키 켜짐·꺼짐 둘 다 본다.
3. **보안.** 원격 보안 규칙(Host·Origin 검사, Tailscale 기기 묶음, 세션 쿠키, 원격 기록과 PC 알림)은 그대로 지킨다. 서비스 워커와 매니페스트를 받는 길이 인증을 비켜 가지 않게 한다. 바꾼 점을 보고에 적는다.

### 완료 기준

1. 단위 시험을 더하고 통과한다: 좁은 화면 판단, 목록 순서, 서비스 워커가 캐시하지 않는 주소, 매니페스트 값.
2. 개발용 판의 원격 웹 화면에서 Playwright 휴대폰 흉내(iPhone 크기, 터치, 세로·가로)로 확인하고 스크린숏을 `experiments/p74/`에 둔다.
   - 가짜 Tailscale은 `app/test/e2e/p49-fake-tailscale.mjs`를 쓴다.
   - 짝 맺기 → 목록 → 세션 열기 → 글 보내기 → 승인 답하기 → 새 세션 → 다시 붙기.
   - 매니페스트와 서비스 워커가 등록되는 것(설치 조건).
   - 실제 휴대폰 시험은 사용자가 한다. 보고에 사용자가 iPhone에서 해 볼 순서를 짧게 적는다.
3. `cd backend && npm test`, `cd app && npm test`, `cd app && npm run build`가 통과한다.

### 읽을 파일

- `CLAUDE.md`, `docs/testing.md`, `docs/BRIEF.md`(원격 보안 행), ARCH의 원격 접속 절
- `docs/log/p49-*.md`, `p56-*.md`~`p62-*.md` 보고 절
- `backend/src/web.mjs`, `backend/src/web-auth.mjs`, `backend/src/passkey.mjs`
- 원격 웹 화면의 진입점과 `app/src/renderer/lib/remote.js`, `app/src/renderer/RemoteBar.jsx`, `app/src/renderer/Pair.jsx`, `app/src/renderer/WebDevices.jsx`, 빌드(`app/scripts/build.mjs`)

### 시험 환경

- 이 작업은 `dev` 브랜치에서 시작한다. 워크트리를 연 뒤 먼저 `git fetch origin && git merge --ff-only origin/dev`를 한다(워크트리가 `main`에서 시작할 수 있다).
- 개발용 판은 너만의 판으로 띄운다(`docs/testing.md`).
  - `ATRIUM_HERDR_SESSION=atrium-dev-p74`, `ATRIUM_PORT=47894`, 창의 원격 디버깅 포트 9374
  - `ATRIUM_DATA_DIR=<워크트리>/backend/.dev/data`, `ATRIUM_APP_USERDATA=<워크트리>/backend/.dev/app`
- 실제 판(`atrium`, 47800)과 다른 판의 포트는 쓰지 않는다. 사용자의 기본 herdr 세션, 실제 판의 herdr 세션(`atrium`), 다른 판의 herdr 서버는 건드리지 않는다. 사용자의 실제 판은 열지도 캡처하지도 않는다.
- 너는 사용자의 실제 판 위에서 도는 워커다. 실제 판의 API(47800)와 `atrium` 명령으로 실제 판을 바꾸지 않는다. 시험의 `atrium` CLI는 늘 개발용 판 환경 변수(`ATRIUM_PORT` 등)를 주고 부른다.
- 실제 설치 폴더(`%LOCALAPPDATA%\atrium\versions`)와 실제 데이터 폴더(`%LOCALAPPDATA%\atrium`)는 읽지도 바꾸지도 않는다.
- 대화 목록은 시험 폴더의 대화만 읽는다(`ATRIUM_CLAUDE_PROJECTS`, `ATRIUM_CLAUDE_DESKTOP=none`). 시험 폴더는 `C:\Workspace\mtask-p74-*`처럼 새로 만든다.
- 세션은 `claude --model haiku`와 셸로 띄운다.
- 끝나면 시험 세션, 창, 브라우저, 백엔드, herdr 서버와 세션(`atrium-dev-p74`만), 시험 폴더를 끄고 지운다. 네가 띄운 프로세스가 남지 않았는지 포트로 확인한다.

### 지킬 것

- `CLAUDE.md`를 따른다. 프로세스는 직접 띄운 것만 PID로 끈다.
- 이 저장소는 공개다. 작업 기록, 시험 코드, 커밋 메시지, 그림에 사용자 경로·메일·토큰, 실제 PC·tailnet 이름, IP, 실제 대화 내용을 쓰지 않는다. 커밋 전·푸시 전 검사를 건너뛰지 않는다.
- 화면 글은 영어와 한국어 사전 둘 다 고친다. 한국어 문구는 사전의 지금 말투(`docs/log/korean-copy-review.md`)를 따른다.
- 같은 때 다른 작업자(P71(작은 고침), P72(기본 호출자와 Codex 모델), P73(세션 크기와 덩어리))가 돈다. 맡은 일에 필요한 만큼만 고치고, `styles.css`와 두 사전은 끝에 더해 합치기 쉽게 한다.
- 자기 브랜치에만 커밋한다. 커밋 메시지에 `Co-Authored-By` 줄을 넣지 않는다. `main`이나 `dev`를 바꾸거나 푸시하지 않는다. `node_modules`는 워크트리 안에서 받는다(`npm ci`, 창은 그 뒤 `node node_modules/electron/install.js`).
- 문서는 이 작업 파일의 작업 기록 절과 보고 절만 고친다. 고쳐야 할 ARCH·BRIEF·testing·README 문장은 보고 절에 짧게 적는다.
- 끝나면 보고 절을 쓰고, 맨 마지막에 `<워크트리>/backend/.dev/p74.done`(브랜치 이름과 마지막 커밋 해시 두 줄)을 만든다.

## 작업 기록

- 시작: `git fetch origin && git merge --ff-only origin/dev`(163781c). 워크트리 안에서 `npm ci`(백엔드, 창)와 Electron 받기.
- 실제 판의 환경 변수(`ATRIUM_*`, `HERDR_*`)를 물려받으므로 `backend/.dev/clean-env.sh`(그 이름의 변수를 모두 지우고 실행)와 `backend/.dev/p74.sh`(지운 뒤 이 판의 값만 넣음)를 만들어 모든 시험, 빌드, CLI, herdr 명령을 그것으로 불렀다. 둘 다 git 밖(`backend/.dev/`)이다.
- 한 번은 판 값을 `clean-env.sh` 앞에 두어 값이 지워진 채 CLI를 불렀다. 포트를 보니 이 판(47894)에 붙었고 다른 판은 뜨지 않았다. 그 뒤 `p74.sh`만 썼다.
- 설계와 구현: 순수 함수(`lib/phone.js`, `lib/sw-rules.js`) → 휴대폰 화면(`Phone.jsx`, `phone.css`) → 서비스 워커(`sw.js`, `build.mjs`) → 매니페스트·아이콘·`index.html` → 짝 맺기 화면 → 백엔드의 서비스 워커 스크립트 막이.
- 창 시험(`app/test/e2e/p74-mobile.mjs`)은 PC 창 없이 개발용 백엔드를 CLI로 띄우고, 짝 맺기 코드와 설정은 판 API 토큰 CLI(`atrium call device.code` 등)로 했다. 휴대폰은 Chromium 문맥(390×844, DPR 3, isMobile, hasTouch, iPhone UA) → ts-sim(47895) → 백엔드(47894).
- 이 PC의 Playwright는 전체 Chromium이 1234판만 있어(기대 판 1248은 headless shell만) 받아 둔 `chromium-*`을 `executablePath`로 쓴다. 새로 내려받지 않았다.
- 첫 실행에서 찾은 것과 고친 것:
  - iPhone UA에 "like Mac OS X"가 있어 기기 이름이 `Safari · macOS`로 잡혔다 → `guessDeviceName`이 iOS를 먼저 본다.
  - 스크린숏의 터미널이 비었다. 버퍼에는 글이 있었다(WebGL 캔버스). 휴대폰은 터미널 하나뿐이고 DPR이 높아 DOM 렌더러로 그린다(`TerminalView webgl={false}`).
  - 세션 화면에 연결 표시가 없었다 → 머리줄에 연결 점(끊기면 글).
  - PC에서 끊은 뒤 다시 붙으면 휴대폰이 패널 크기를 다시 가져가지 않아 글이 크게 늘어나 그려졌다 → `$open`마다 `terminal.focus`를 다시 한다.
  - "보냈습니다" 글이 키 줄 위에 겹쳤다 → 입력 줄 안의 한 줄로.
  - 글꼴 107개(5.8MB)를 설치 때 모두 받게 되어 있었다 → 글꼴은 쓸 때 캐시한다.
  - 시크릿 문맥은 설치 가능성 검사가 `in-incognito`로 막혀, 그 검사만 시험 폴더 안의 프로필(`launchPersistentContext`)로 하고 지웠다.
- 세 번째 실행에서 34/34 통과. 스크린숏과 결과는 `experiments/p74/`(git 밖).
- 정리: 시험 세션 지움, 브라우저 닫음, `atrium herdr stop --yes`, `atrium backend stop`, `herdr session delete atrium-dev-p74`, 시험 폴더 `C:\Workspace\mtask-p74-proj` 지움. 47894·47895·47896·9374에 듣는 프로세스와 Playwright 브라우저가 남지 않았다. 창의 원격 디버깅 포트(9374)는 PC 창을 띄우지 않아 쓰지 않았다.

## 보고

### 결과

휴대폰 세로 화면(폭 430px 이하, 세로, 터치)에서 원격 웹 화면이 캔버스 대신 휴대폰용 화면을 보이고, 홈 화면에 웹 앱으로 설치할 수 있다. 가로로 돌리거나 넓은 화면이면 지금 보드 화면을 그대로 쓴다. 완료 기준 세 가지를 모두 채웠다.

- 단위 시험: `app/test/p74-lib.test.mjs`(9개: 좁은 화면 판단, 목록 순서, 상태 점·마지막 한 줄, 키 바이트, 보내기·스크롤·키보드 높이·다음 응답 필요, 서비스 워커가 손대지 않는 주소, 캐시할 응답·미리 받을 목록, 매니페스트 값과 아이콘 크기, `index.html` meta), `backend/test/p74.test.mjs`(서비스 워커 스크립트 막이).
- `cd backend && npm test` 510개 통과, `cd app && npm test` 251개 통과, `cd app && npm run build` 통과.
- 창 시험 `p74-mobile.mjs` 34/34 통과. 짝 맺기 → 목록 → 셸 열기·글 보내기·키 줄 → 에이전트에게 보내기(답 옴) → 손가락 스크롤 → "다음" → 승인 카드 "허용"(명령이 실행됨) → 새 세션 → PC 끊기·오프라인 뒤 다시 붙기 → 서비스 워커·매니페스트(Chromium 설치 가능성 검사 오류 0) → 오프라인 껍데기 → 가로 보드 화면 → 홈 화면 앱 흉내(패스키 끔·켬).

### 설계(근거)

- **언제 휴대폰 화면인가**: 폭 ≤ 430px, 높이 > 폭, `pointer: coarse`, 웹 화면(Electron 창은 아님). 마우스 창을 좁힌 것과 태블릿·가로는 보드 화면이다. 휴대폰에서 머리줄의 네모 단추로 "보드 화면"을 고를 수 있고(이 브라우저에 기억), 그때는 왼쪽 아래 알약 "휴대폰 화면"으로 돌아온다.
- **세 화면, 한 손**: 누를 곳은 모두 44px 이상, 자주 누르는 것(다음 응답 필요, 새 세션, 보내기, 키 줄)은 엄지가 닿는 아래쪽에 둔다. 위쪽에는 읽는 것(이름, 상태, 연결)만 둔다.
  - 목록: "응답 필요"(오래 기다린 순, 프로젝트 이름표) → "작업 중"(명령이 도는 셸 포함, 최근 순) → 나머지(프로젝트별 묶음, 누르면 접힘, 기억). 줄마다 상태 점, 이름, 지난 시간, 마지막 한 줄(묻는 것 → 오류 → 셸 명령 → 마지막 답 → 마지막 지시). 응답 필요가 맨 위라 "무엇을 해야 하나"가 먼저 보이고, 아래쪽 주황 단추 "다음 응답 필요 (n)"로 바로 간다.
  - 세션: 화면 전체 터미널. 손가락으로 끌면 휠로 바꿔(33px쯤에 한 칸) 스크롤한다. 터미널을 눌러도 화면 키보드가 뜨지 않는다(한글 IME와 xterm의 충돌을 피하고, 입력은 아래 줄로 모은다). 응답이 필요하면 판의 승인 줄(`ApprovalCard`)을 그대로 쓰되 허용·거부를 48px 반반 폭으로 키운다. "터미널에서 답하기"는 카드를 접고 키 줄로 답하게 한다("응답 카드 다시 보기"로 다시 연다). 키 줄은 ⏎, Esc, Ctrl+C, ↑, ↓, Tab, ⇧Tab(Claude Code 모드 전환), `/`, 그리고 글자 크기 A−/A+(휴대폰만, 기본 0.8배 ≈ 50칸). 화살표는 터미널의 응용 커서 모드를 따른다. 입력 줄은 여러 줄 textarea(Enter는 줄바꿈, 보내기 단추나 Ctrl+Enter로 보냄)다. 에이전트는 전달 대기열(`session.send`, 일하는 중이면 끝난 뒤 보냄, 상태 글을 잠깐 보임), 셸은 터미널 입력이다. 머리줄의 "다음 n"은 응답이 필요한 다음 세션으로 가고, "목록"으로 돌아온다(Android 뒤로 단추·가장자리 밀기도 목록). 세션을 열면 이 휴대폰이 패널 크기를 가져간다(P47 규칙: 초점을 준 클라이언트). PC로 돌아가 입력하면 PC가 다시 가져간다. 잠든 세션은 "깨우기" 단추, 끝난 세션은 안내를 보인다.
  - 새 세션: 아래에서 올라오는 시트. 왼쪽 레일의 런처(즐겨찾기, 없으면 모두)와 프로젝트를 큰 줄로 고르고(지금 프로젝트가 기본) "시작"을 누르면 그 세션 화면으로 들어간다.
- **연결 상태**: 목록 머리줄의 알약(연결됨 · 지연, 다시 연결 중, 원격 차단), 세션 머리줄의 점(끊기면 글). 누르면 곧바로 다시 붙어 본다. 원격 막음 화면, 업데이트 띠, 다시 연결 띠는 RemoteBar를 그대로 쓰고 위치만 휴대폰에 맞췄다.
- **가상 키보드·노치**: viewport에 `viewport-fit=cover`, `interactive-widget=resizes-content`, 화면 높이는 `visualViewport`에 맞춰(iOS는 키보드가 레이아웃을 줄이지 않는다) 입력 줄이 키보드 위에 남는다. 위·아래·옆은 `env(safe-area-inset-*)`로 비키고, 키보드가 올라오면 아래 안전 영역을 비우지 않는다. 입력칸은 16px(iOS가 초점 때 확대하지 않게).

### 웹 앱 설치(PWA)

- 매니페스트(`assets/pwa/manifest.webmanifest`, P49 것을 고침): `id`·`start_url`·`scope` = 보드 뿌리(`/`), `display: standalone`, `orientation: any`(가로면 보드 화면), 색, 아이콘 96·144·180·192·512(any)와 maskable 192·512. 아이콘은 `make-pwa-icons.mjs`가 브랜드 SVG에서 그린다. apple-touch-icon(180)은 iOS가 모서리를 둥글리므로 투명 없는 네모.
- `index.html`: viewport, `apple-mobile-web-app-capable`·`-title`·`-status-bar-style`(black-translucent), `mobile-web-app-capable`, `apple-touch-icon` 180.
- 서비스 워커(`dist/sw.js`, 원본 `src/renderer/sw.js`, 규칙 `lib/sw-rules.js`): 범위 `/`. 설치 때 껍데기(index, renderer.js·css, 그림, 매니페스트)만 미리 받고, 글꼴은 처음 쓸 때 캐시한다(해시 이름이라 캐시 먼저). 껍데기는 늘 네트워크 먼저(새 버전이 있으면 그것, 오프라인일 때만 캐시)라 업데이트가 다음 열기에 바로 보인다. 빌드가 껍데기 내용의 해시를 버전으로 넣어, 바뀌면 브라우저가 새 서비스 워커를 받고 옛 캐시를 지운다. 등록은 웹 화면만 하고 Electron 창은 하지 않는다. Android Chrome의 설치 제안은 목록의 "앱 설치" 단추로, iOS Safari는 "공유 › 홈 화면에 추가" 안내(닫으면 다시 보이지 않음)로 보인다.
- **iOS 홈 화면 앱과 쿠키**: 홈 화면 앱은 Safari와 쿠키·저장소를 나누지 않는다. 그래서 홈 화면에서 처음 열면 짝 맺기 화면이 그 앱 안에서 뜨고, 그 안에서 짝을 맺는다(짝 맺기는 fetch와 HttpOnly 쿠키라 그 앱의 쿠키에 들어간다). 짝 맺기 화면에 홈 화면 앱일 때만 안내를 보이고, 기기 이름에 ` · App`을 붙여 PC 목록에서 Safari와 가린다.
  - 패스키 끔(기본): PC에서 새 코드를 받아 그 앱을 따로 등록한다(기기 기록이 하나 더 생긴다). 시험에서 새 문맥(쿠키 없음, standalone 흉내)이 새 코드로 짝 맺어 목록이 열렸다.
  - 패스키 켬: Safari에서 만든 패스키는 iCloud 키체인에 있어 홈 화면 앱에서도 쓸 수 있다. 짝 맺기 화면의 "이 브라우저에 보드의 패스키가 이미 있습니다"로 패스키 로그인을 하면, 같은 휴대폰(같은 Tailscale 기기)이라 그 기기 기록으로 새 세션이 생긴다. 새 짝 맺기가 필요 없다. 시험에서 Safari 문맥의 자격 증명을 홈 화면 앱 문맥의 가상 인증기로 옮겨(키체인 흉내) 기기 수가 늘지 않고 들어가는 것을 봤다.
  - 실제 iOS에서 홈 화면 앱의 WebAuthn과 쿠키 분리는 Chromium으로 흉내만 냈다. 아래 순서로 사용자가 확인해야 한다.

### 보안(바꾼 점)

- 원격 보안 규칙(Host·Origin, Tailscale 로그인, 세션 쿠키, Tailscale 기기 묶음, 원격 기록과 PC 알림, 원격 받기 스위치)은 바꾸지 않았다. 휴대폰 화면도 같은 WebSocket·`/web/*`를 쓴다.
- 서비스 워커와 매니페스트는 지금까지의 껍데기 파일과 같은 길(Host 검사, 원격 받기가 꺼지면 503)로 나간다. 비밀이 없고 인증을 주지 않는다. 시험에서 원격 막음이면 `sw.js`와 매니페스트도 503인 것을 봤다.
- 서비스 워커는 `/api`, `/web/*`(짝 맺기, 로그인, 패스키, 업로드, 로그아웃, `/web/me`), `/hooks/*`, `/branch/*`, `/health`, `sw.js` 자신, 다른 출처, GET이 아닌 요청에 응답하지 않는다(브라우저가 그대로 백엔드에 묻는다). 캐시에는 쿠키를 주는 응답, no-store, 200이 아닌 응답(거절 쪽)을 넣지 않고, 백엔드가 거절한 응답을 캐시로 덮지 않는다. 시험에서 `/web/me`는 서비스 워커를 거치지 않고, 캐시에 껍데기만 있음을 봤다.
- 백엔드: `Service-Worker: script` 머리글이 붙은 요청은 `/sw.js`만 내준다(다른 화면 파일을 서비스 워커로 등록하지 못하게). `Service-Worker-Allowed`를 주지 않아 범위는 `/`보다 넓어지지 않는다.

### 사용자가 iPhone에서 해 볼 순서

1. PC에서 원격 접속을 켠 채(`tailscale serve`) iPhone Safari로 보드 주소를 연다. 짝 맺기 화면이 휴대폰 폭에 맞는지 본다.
2. PC의 설정 › 연결된 기기에서 코드를 받아 넣는다. 세션 목록이 뜬다. 응답 필요 세션이 맨 위인지, 프로젝트 묶음을 접고 펼 수 있는지 본다.
3. 세션 하나를 연다. 손가락으로 위아래로 끌어 스크롤하고, 터미널을 눌러도 키보드가 뜨지 않는지 본다. 아래 입력 줄에 글을 써 보내고, 키보드가 입력 줄을 가리지 않는지 본다. 키 줄(⏎, Esc, ↑↓, ⇧Tab, A−/A+)을 눌러 본다.
4. 승인을 기다리는 세션에서 큰 "허용"·"거부"로 답한다. 머리줄의 "다음"으로 다른 응답 필요 세션으로 간다.
5. 목록의 "새 세션"으로 런처와 프로젝트를 골라 띄운다.
6. 휴대폰을 가로로 돌려 보드 화면이 되는지, 다시 세로로 돌아오는지 본다.
7. Safari의 공유 › 홈 화면에 추가 → 홈 화면의 Atrium을 연다. 주소 막대 없이 열리는지, 노치·홈 막대를 비키는지 본다. 짝 맺기 화면이 다시 뜨면(정상) 패스키 끔은 PC의 새 코드로, 패스키 켬은 "이 브라우저에 보드의 패스키가 이미 있습니다"로 들어간다. PC의 기기 목록에 ` · App` 기기가 생기는지(패스키 끔) 본다.
8. 홈 화면 앱을 백그라운드로 보냈다가 돌아와 저절로 다시 붙는지(연결 알약), 비행기 모드로 열면 빈 브라우저 오류 대신 Atrium 첫 화면이 뜨는지 본다.

### 남은 것과 알려진 한계

- 실제 iPhone, iOS의 홈 화면 앱 WebAuthn·쿠키 분리, Android Chrome의 설치 제안 단추는 이 PC에서 보지 못했다(Chromium 흉내). 사용자 점검표로 남긴다.
- 휴대폰에서 세션을 열면 그 패널의 크기(줄·칸)가 휴대폰 폭(약 50칸)으로 바뀐다. PC가 같은 패널을 보면 P47처럼 비율로 줄여 그리고, PC에서 입력하거나 초점을 주면 PC 크기로 돌아온다.
- 휴대폰 터미널은 DOM 렌더러로 그린다. 출력이 아주 빠른 세션에서 느리면 후속으로 WebGL을 다시 볼 수 있다.
- 터미널 글 고르기·복사는 휴대폰에서 따로 만들지 않았다(손가락 끌기는 스크롤).
- 시험의 Claude Code 세션이 사용자의 `~/.claude/projects`에 시험 폴더 이름의 대화 기록을 남겼다(다른 단계 시험과 같다). 필요하면 `atrium missed`로 정리한다.
- 창 시험은 PC 창을 띄우지 않아 PC의 "새로 붙음" 알림 화면은 이번에 다시 보지 않았다(원격 기록에는 `pair.ok`, `login`, `kick`, `connect`, `disconnect`가 남았다).

### 고쳐야 할 문서 문장(제안)

- ARCH 원격 절에 한 줄: "웹 화면은 휴대폰 세로(폭 430px 이하, 터치)에서 캔버스 대신 휴대폰 화면(`Phone.jsx`: 목록, 세션 전체 화면, 새 세션 시트)을 보인다. 서비스 워커(`sw.js`, 규칙 `lib/sw-rules.js`)는 껍데기만 캐시하고 `/api`·`/web/*`에는 응답하지 않으며, 백엔드는 서비스 워커 스크립트 요청에 `/sw.js`만 내준다."
- BRIEF "원격 보안" 행에 덧붙일 것: "홈 화면 웹 앱(PWA)으로 설치할 수 있다. 서비스 워커는 인증을 거치지 않는 껍데기만 캐시한다(2026-11-06, P74)."
- testing.md 원격 창 시험 줄에: "휴대폰 시험(`p74-mobile.mjs`)은 PC 창 없이 CLI로 판을 띄우고, Chromium 휴대폰 문맥(isMobile, hasTouch)을 쓴다. 설치 가능성 검사는 시크릿 문맥에서 `in-incognito`로 막혀 `launchPersistentContext`로 한다. Playwright가 기대하는 전체 Chromium이 없으면 받아 둔 `chromium-*`을 `executablePath`로 준다."
- README(원격 접속 절)에: "iPhone은 Safari의 공유 › 홈 화면에 추가로 앱처럼 쓴다. 홈 화면 앱은 Safari와 로그인을 나누지 않아 처음 한 번 다시 등록한다(패스키 켬이면 같은 패스키로 들어간다)."

### 고친 파일

- 새 파일: `app/src/renderer/Phone.jsx`, `phone.css`, `sw.js`, `lib/phone.js`, `lib/pwa.js`, `lib/sw-rules.js`, `assets/pwa/` 아이콘 4개, `app/test/p74-lib.test.mjs`, `app/test/e2e/p74-mobile.mjs`, `backend/test/p74.test.mjs`.
- 고친 파일: `main.jsx`(화면 고르기), `web.js`(서비스 워커 등록), `TerminalView.jsx`(`fontScale`, `webgl` prop), `SpawnDialog.jsx`(`startedText`, `devModel` 내보내기), `Pair.jsx`(홈 화면 앱 안내, iOS 기기 이름), `index.html`, `manifest.webmanifest`, `build.mjs`, `make-pwa-icons.mjs`, 두 사전 끝의 `phone` 절, `backend/src/web.mjs`(`swScriptOk`). `styles.css`는 고치지 않았다(휴대폰 스타일은 `phone.css`).
