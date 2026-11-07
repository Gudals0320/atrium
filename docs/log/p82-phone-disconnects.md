상태: 열림
날짜: 2026-11-07

## 지시

### 목표

휴대폰(iPhone Safari)에서 원격 판 연결이 몇 초마다 끊겨 쓸 수 없다. 끊는 쪽과 까닭을 기록으로 확정하고, 가장 유력한 원인(Safari와 WebSocket 압축)을 고치고, 짧은 끊김이 휴대폰 화면을 흔들지 않게 한다.

### 사용자의 말(2026-11-07, `v0.1.4-dev.1`)

"모바일 사용이 거의 불가능한데? 계속 틩겨요"

### 지휘 세션이 알아낸 것

실제 판의 원격 기록(`remote-log.jsonl`)과 백엔드 로그를 읽기만 해서 알아낸 것이다. 실제 판에서 시험하지는 않았다.

- iPhone(Safari 27, iOS)은 연결된 뒤 1.8~35초 만에 `disconnect`(까닭 `closed`)되고, 0.4~1초 뒤 다시 `connect`한다. 11-06(`v0.1.3-dev.*`)과 11-07(`v0.1.4-dev.1`)이 같다. 다시 붙는 간격이 창의 첫 재시도(0.5초 ±20%, `lib/reconnect.js`)와 같다. 그래서 페이지를 다시 읽는 것이 아니라 소켓이 끊기고 창이 다시 붙는 것으로 본다.
- 같은 tailscale serve를 거친 노트북 Chrome 157은 몇 분에서 한 시간씩 붙어 있다.
- 까닭 `closed`는 서버가 끊지 않았다는 뜻이다(`web.mjs clientClosed`, `closeReason` 없음). 그 시각 백엔드 로그에 오류가 없다. 창은 ping 시간 초과(15초 + 8초)와 열기 시간 초과 말고는 스스로 닫지 않는다(`api.js`). 그런데 2~3초 만에도 끊긴다.
- 원격 소켓은 늘 permessage-deflate를 켠다(`api.mjs REMOTE_DEFLATE`, 양쪽 context takeover, `_upgrade`는 브라우저를 보지 않는다).
- Safari(NSURLSession WebSocket)는 압축을 켠 연결에서 텍스트 프레임 뒤에 여러 프레임짜리 바이너리 메시지가 오면 끊긴다는 보고가 있다(https://developer.apple.com/forums/thread/744018, https://lists.webkit.org/pipermail/webkit-unassigned/2021-December/1012656.html). 서버에서 Safari만 압축을 끈 사례도 있다(https://git.janouch.name/p/xK/commit/9dc3dd02f397f83941fbcc7d5271a33857cb5df3).
- 가설은 "Safari + 원격 압축"이다. 끊김 코드가 기록에 없어 아직 확정하지 않았다.

### 할 것

1. **기록 더하기.** 원격 `disconnect`에 아래를 남긴다. 메시지 내용은 남기지 않는다.
   - 서버가 받은 닫힘 코드와 까닭 글
   - 붙어 있던 시간, 압축을 협상했는지
   - 주고받은 메시지 수와 바이트
   - 마지막으로 보낸 메시지 몇 개의 종류(글·바이너리)와 크기

   창은 다시 붙을 때 직전 닫힘(브라우저가 본 `CloseEvent.code`, `wasClean`, 붙어 있던 시간)을 연결 주소 값으로 알리고, 서버는 그것을 `connect` 기록에 남긴다. PC의 연결 기록 화면에 코드가 보이면 좋지만 꼭 하지 않아도 된다.
2. **WebKit은 압축하지 않는다.** 연결 요청의 User-Agent로 WebKit 브라우저를 가려 압축 없는 원격 소켓으로 받는다. WebKit 브라우저는 Safari(macOS·iOS), iOS·iPadOS의 모든 브라우저(CriOS, FxiOS, EdgiOS 등), 데스크톱 모드 iPad(Macintosh + Safari)다. 프레임 묶기 같은 원격의 다른 처리는 그대로 둔다. Chrome·Edge·Firefox(데스크톱, 안드로이드)와 Electron 창은 지금처럼 한다. 판별은 순수 함수로 둔다.
3. **끊겨도 화면은 그대로.** 휴대폰 보드와 전체 보기(`Phone.jsx`, `PhoneFull.jsx`, `TerminalView.jsx`)에서 몇 초 끊겼다 다시 붙어도 사람이 보는 화면이 흔들리지 않게 한다.
   - 전체 보기를 나가지 않는다.
   - 터미널을 비우지 않고, 다시 붙은 뒤 이어 그린다.
   - 입력 줄의 글과 키보드 초점을 지킨다.
   - "다시 연결 중" 띠는 짧은 끊김(예: 2초 안에 다시 붙음)에는 띄우지 않는다.

   고치기 전에 지금 어떻게 되는지 먼저 재어 적는다.
4. **다른 원인.** 압축 말고도 휴대폰만 끊기게 할 만한 것을 코드에서 살펴 작업 기록에 적는다(큰 메시지, 프레임 크기와 묶기, 서비스 워커, 화면 꺼짐과 백그라운드, HTTP/2 업그레이드 등). 고칠 만한 것이 있으면 근거를 들어 고치고, 아니면 보고에만 적는다.

### 손대지 말 것

- tailscale 설정(serve 포함), 방화벽, 네트워크 설정은 바꾸지 않는다. 실제 판으로 시험하지 않는다.
- PC 창(로컬 연결)의 압축 없음과 ping·재시도 값은 바꾸지 않는다. 바꿔야 한다면 근거를 보고에 적는다.

### 완료 기준

1. 단위 시험을 더하고 통과한다.
   - UA 판별: Safari(iOS·macOS), CriOS, FxiOS, EdgiOS, 데스크톱 모드 iPad, Chrome, Edge, Firefox, 안드로이드 Chrome, Electron 창, 빈 UA
   - 실제 `ws` 클라이언트로 원격 소켓에 붙어 Safari UA는 압축 없음, Chrome UA는 압축임을 확인(`extensions`)
   - 끊김 기록 필드와 직전 닫힘 전달
2. 창 시험(개발용 판, 원격 흉내 `app/test/e2e/p59-lib.mjs`). 결과는 `experiments/p82/`에 둔다.
   - Playwright WebKit(설치됨, iPhone 흉내)과 Chromium으로 원격 연결을 열어 응답 머리글 `Sec-WebSocket-Extensions`를 남긴다. WebKit이 흉내 원격 경로로 열리지 않으면 Chromium에 Safari UA를 주어 확인하고, 그 사실을 적는다.
   - 휴대폰 전체 보기에서 서버 쪽에서 소켓을 닫았을 때 화면, 입력 줄, 초점, 띠를 고치기 전과 뒤로 찍는다.
3. 보고에 사람이 확인할 순서를 적는다. 업데이트 뒤 iPhone으로 몇 분 쓰고, PC의 연결 기록에서 끊김 코드를 본다.
4. `cd backend && npm test`, `cd app && npm test`, `cd app && npm run build`가 통과한다.

### 읽을 파일

- `CLAUDE.md`, `docs/testing.md`(원격 창 시험), ARCH 1절 원격 문단, `docs/log/p49-remote-r3-tailscale.md`, `docs/log/p59-remote-integrate.md`, `docs/log/p74-mobile-web.md`, `docs/log/p76-phone-board-touch.md`의 보고 절
- `backend/src/api.mjs`(`REMOTE_DEFLATE`, `_upgrade`, `_connection`), `backend/src/web.mjs`(`clientOpened`·`clientClosed`, `note`), `backend/src/remote-log.mjs`, `backend/src/relay.mjs`(원격 묶기), `backend/src/multiclient.mjs`
- `app/src/renderer/api.js`, `app/src/renderer/lib/reconnect.js`, `app/src/renderer/Phone.jsx`, `app/src/renderer/PhoneFull.jsx`, `app/src/renderer/TerminalView.jsx`, `app/src/renderer/RemoteBar.jsx`
- `app/test/e2e/p59-remote.mjs`, `app/test/e2e/p76-touch.mjs`(창 시험 틀)

### 시험 환경

- 이 작업은 `dev` 브랜치에서 시작한다. 워크트리를 연 뒤 먼저 `git fetch origin && git merge --ff-only origin/dev`를 한다(워크트리가 `main`에서 시작할 수 있다).
- 너는 사용자의 실제 판 위에서 도는 워커라 셸에 실제 판의 `ATRIUM_*`·`HERDR_*`가 있다. 시험, 개발용 판, herdr, `atrium`은 이 변수를 지운 셸(`backend/.dev/clean-env.sh`, `docs/testing.md`)로 부른다.
- 개발용 판은 너만의 판으로 띄운다(`docs/testing.md`).
  - `ATRIUM_HERDR_SESSION=atrium-dev-p82`, `ATRIUM_PORT=47899`, 창의 원격 디버깅 포트 9379
  - `ATRIUM_DATA_DIR=<워크트리>/backend/.dev/data`, `ATRIUM_APP_USERDATA=<워크트리>/backend/.dev/app`
- 실제 판(`atrium`, 47800)과 다른 판의 포트는 쓰지 않는다. 사용자의 기본 herdr 세션, 실제 판의 herdr 세션(`atrium`), 다른 판의 herdr 서버는 건드리지 않는다. 사용자의 실제 판은 열지도 캡처하지도 않는다. 스크린숏은 창 안만 찍는다(`page.screenshot`).
- 실제 판의 API(47800)와 `atrium` 명령으로 실제 판을 바꾸지 않는다. 시험의 `atrium` CLI는 늘 개발용 판 환경 변수(`ATRIUM_PORT` 등)를 주고 부른다.
- 실제 설치 폴더(`%LOCALAPPDATA%\atrium\versions`)와 실제 데이터 폴더(`%LOCALAPPDATA%\atrium`)는 읽지도 바꾸지도 않는다.
- 대화 목록은 시험 폴더의 대화만 읽는다(`ATRIUM_CLAUDE_PROJECTS`, `ATRIUM_CLAUDE_DESKTOP=none`). 시험 폴더는 `C:\Workspace\mtask-p82-*`처럼 새로 만든다.
- 세션은 `claude --model haiku`와 셸로 띄운다.
- 끝나면 시험 세션, 창, 브라우저, 백엔드, herdr 서버와 세션(`atrium-dev-p82`만), 시험 폴더를 끄고 지운다. 네가 띄운 프로세스가 남지 않았는지 포트로 확인한다.

### 지킬 것

- `CLAUDE.md`를 따른다. 프로세스는 직접 띄운 것만 PID로 끈다. 신뢰 질문은 대신 답하지 않는다.
- 이 저장소는 공개다. 작업 기록, 시험 코드, 커밋 메시지, 그림에 사용자 경로·메일·토큰, 실제 PC·tailnet 이름, IP, 실제 대화 내용을 쓰지 않는다. 커밋 전·푸시 전 검사를 건너뛰지 않는다.
- 화면 글은 영어와 한국어 사전 둘 다 고친다. 한국어 문구는 사전의 지금 말투(`docs/log/korean-copy-review.md`)를 따른다.
- 같은 때 다른 작업자는 없다. 맡은 일에 필요한 만큼만 고치고, `styles.css`와 두 사전은 끝에 더해 합치기 쉽게 한다.
- 자기 브랜치에만 커밋한다. 커밋 메시지에 `Co-Authored-By` 줄을 넣지 않는다. `main`이나 `dev`를 바꾸거나 푸시하지 않는다. `node_modules`는 워크트리 안에서 받는다(`npm ci`, 창은 그 뒤 `node node_modules/electron/install.js`).
- 문서는 이 작업 파일의 작업 기록 절과 보고 절만 고친다. 고쳐야 할 ARCH·BRIEF·testing·README 문장은 보고 절에 짧게 적는다. 살아 있는 문서 예산이 거의 찼으니(70,000자 중 69,967자) 문장은 바꾸는 문장보다 길지 않게 적는다.
- 끝나면 보고 절을 쓰고, 맨 마지막에 `<워크트리>/backend/.dev/p82.done`(브랜치 이름, 마지막 커밋 해시, 시험 수 세 줄)을 만든다.

## 작업 기록

## 보고
