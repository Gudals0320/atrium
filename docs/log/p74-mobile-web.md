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

## 보고
