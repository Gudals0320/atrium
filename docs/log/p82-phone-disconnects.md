상태: 닫힘
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

- 시작: `git fetch origin && git merge --ff-only origin/dev`(c4b0ec0). 워크트리 안에서 `npm ci`(백엔드, 창)와 Electron 받기. 물려받은 판 변수를 지우는 `backend/.dev/clean-env.sh`와 이 판의 값(atrium-dev-p82, 47899, `backend/.dev/data`·`app`)만 넣는 `backend/.dev/p82.sh`를 만들어 모든 시험, 빌드, CLI, herdr 명령을 그것으로 불렀다(git 밖).
- 기록(백엔드): 새 모듈 `backend/src/remote-ws.mjs`. `api.mjs`는 원격 연결마다 `WsStats`로 받은·보낸 메시지 수와 바이트, 마지막으로 보낸 5개의 종류와 크기(`t5798`, `b9`), 마지막으로 보낸 뒤 지난 ms를 센다(`ws.send`를 감싼다, 원격만). `close`의 코드와 까닭 글, `error`의 코드(예: `WS_ERR_UNEXPECTED_RSV_1`)를 받아 둔다. `web.mjs clientClosed`가 disconnect에 `ws`({code, why, err, ms, deflate, in, inB, out, outB, last, sinceOut})를, `clientOpened`가 connect에 `ws.deflate`와 `prev`를 남긴다. `remote-log.mjs logEntry`는 정한 필드만 고르고 모양이 다르면 버린다(내용은 받을 자리가 없다). CLI `atrium remote log`의 줄에도 나온다.
- 직전 닫힘(창): `api.js noteClose`가 `CloseEvent.code`, `wasClean`, 붙어 있던 ms를 적고(ping 시간 초과는 `timeout`, 열기 시간 초과는 `open_timeout`), 다음 연결 주소에 `pc=<코드>.<0|1>.<ms>`(`lib/reconnect.js prevCloseParam`)로 붙인다. 백엔드 `parsePrevClose`가 엄격히 읽는다. PC 연결 기록 화면(`WebDevices.jsx`)의 줄 끝에 `1006 · 3.4s · plain`과 `직전 끊김 1006 · 3.4s`가 작게 나온다(`lib/remote.js sockLabel`, 사전 `remoteSock.prevClose`를 끝에 더함).
- WebKit은 압축 없이: `isWebKitBrowser(ua)`(순수). iPhone·iPad·iPod이면 늘 WebKit, Electron·Android는 아님, CriOS·FxiOS·EdgiOS·OPiOS·OPT는 WebKit(데스크톱 모드 iPad의 Chrome 등이 Macintosh로 보이는 경우), 그 밖에는 `AppleWebKit`+`Version/x`+`Safari/`이고 Chrome·Chromium·Edg·OPR·Firefox·SamsungBrowser 이름이 없으면 WebKit(macOS Safari, 데스크톱 모드 iPad). `_upgrade`가 원격 + WebKit이면 압축 없는 세 번째 서버(`wssRemotePlain`)로 받는다. `client.remote`는 그대로라 프레임 묶기는 같다. 로컬 연결의 압축 없음, ping·재시도 값은 바꾸지 않았다.
- 끊겨도 화면은 그대로(고치기 전 잰 것, `experiments/p82/p82-drops-before.txt`, 그림 `before-*.png`). 흉내 프록시에서 브라우저 쪽 소켓만 끊었다(`ts-sim-proxy.mjs dropWs`, 브라우저는 1006).
  - 짧은 끊김(0.55초 뒤 다시 붙음): 전체 보기는 남고 입력 줄의 글과 초점도 남았다. 다시 연결 띠가 끊긴 즉시(2ms) 떴고, 다시 붙으면 터미널을 새로 만들었다(`TerminalView`가 `$open`에 `retry`를 올려 xterm을 버림).
  - 긴 끊김(4초 동안 받지 않음, 8초 뒤 다시 붙음): 끊긴 동안 ⏎를 누르면 입력 줄의 글이 지워지고 보내지 못한 채 "Not connected to the backend" 알림이 두 번 떴다. 다시 붙은 직후 터미널이 빈 화면(글 0자)이 된 순간이 잡혔다.
  - 에이전트 전체 보기도 터미널을 새로 만들었고 띠가 바로 떴다.
- 고친 것(창):
  - `TerminalView.jsx`: 웹 화면은 `$open`에 같은 xterm으로 다시 붙는다(`attach(true)`, 요청 크기는 마지막에 보낸 크기, 초점과 모아 둔 입력은 건드리지 않음). 다시 붙은 뒤 첫 full 프레임 앞에 `ESC[0m ESC[H ESC[2J`를 붙여 같은 쓰기에서 지우고 다시 그린다(`lib/term-input.js REDRAW_PREFIX`, 기록은 그대로). 셸은 그림자 터미널에도 같은 바이트가 가서 바뀐 만큼만 다시 맞춘다. 붙기에 실패하면 예전처럼 덮개와 저절로 다시 붙기. PC 창(Electron)은 예전대로 다시 만든다.
  - `steady.js useConnSteady`(새 파일)와 `lib/reconnect.js bannerDue`: 끊긴 뒤 2초(`SHORT_DROP_MS`)가 지나도 붙지 않았을 때만 다시 연결 띠(`RemoteBar`), 휴대폰 연결 알약(`Phone.jsx`), 보드 연결 알약(`Chrome.jsx`, 웹만)을 바꾼다. 4402(PC에서 끊음)는 바로. 왕복 지연 표시도 그동안 그대로 둔다.
  - `PhoneFull.jsx`: 끊긴 동안 ⏎는 보내지 않고 글을 둔다. 끊김(`disconnected`) 오류는 알림을 띄우지 않는다(띠가 알린다). `Phone.jsx` 목록 화면의 보내기·키도 같다(보내기는 원래 성공해야 글을 지웠다).
- 고친 뒤(`p82-drops-after.txt`, `after-*.png`): 짧은 끊김에 같은 터미널, 글 그대로, 붙는 중 표시 없음, 입력 줄 글과 초점 그대로, 띠 없음. 긴 끊김에 띠는 2.08초에 떴다가 다시 붙자 사라졌고, 그동안 ⏎는 글을 두었으며 알림이 없었다. 다시 붙은 뒤 그 글을 보내자 같은 터미널에 나왔다. 에이전트 전체 보기도 같은 터미널, 끊기 전과 같은 화면.
- 압축 확인: Chromium(iPhone 흉내, Safari UA)은 응답 머리글 `Sec-WebSocket-Extensions`가 없고 `WebSocket.extensions`가 빈 글, 연결 기록 `ws.deflate=false`. Chromium(안드로이드 Chrome UA)은 `permessage-deflate`, `deflate=true`. Playwright WebKit은 열지 못했다. 설치된 Playwright 1.64.1은 `webkit-2370`을 찾는데 PC에는 `webkit-2083`만 있다. 그 판을 `executablePath`로 열어 보니 프로토콜이 달라(`Unknown setting: FixedBackgroundsPaintRelativeToDocument`) 10분 멈춘 뒤 실패해서 지시대로 Chromium + Safari UA로 갈음했다. 새 WebKit은 받지 않았다(사용자 PC의 Playwright 캐시를 바꾸지 않으려고).
- 연결 기록의 실제 모양(흉내, 고친 뒤): `disconnect {reason: closed, ws: {code: 1006, ms: 7373, in: 30, inB: 2422, out: 52, outB: 62307, sinceOut: 1927, deflate: false, last: [t136, t5798, t2431, t219, t30]}}`, 뒤이은 `connect {prev: {code: 1006, clean: false, ms: 7372}, ws: {deflate: false}}`. 서버가 끊지 않고 TCP가 끊기면 양쪽 모두 1006이다.
- 다른 원인 살핀 것(고치지 않음):
  - 메시지 종류: 서버가 보내는 것은 모두 JSON 글 프레임이다(터미널 프레임도 base64 글). 바이너리는 없다. 그래서 "글 뒤에 여러 프레임짜리 바이너리" 보고와 꼭 같지는 않다. 다만 압축 + 양쪽 context takeover의 Safari 문제는 같은 갈래라 압축을 끈 것으로 함께 덮는다. 기록의 `err`가 `WS_ERR_*`(프레임 오류)면 서버 쪽에서 프레임을 못 읽은 것이고, 1006 + `err` 없음이면 브라우저나 그 사이(tailscale serve)가 끊은 것이다.
  - 크기: 흉내에서 가장 큰 보낸 메시지가 약 6KB(board·session 목록), `maxPayload` 16MB. 프레임 묶기(33ms)는 한 메시지를 키울 뿐 쪼개지 않는다(`ws`는 메시지를 한 프레임으로 보낸다). 휴대폰만 끊길 크기 문제는 코드에서 찾지 못했다.
  - 서비스 워커: `sw-rules.js`가 `/api`를 늘 빼고, 서비스 워커는 WebSocket을 가로채지 못한다.
  - 화면 꺼짐·백그라운드: iOS는 숨은 탭의 소켓을 끊는다. 보이면 `visibilitychange`로 곧바로 다시 붙는다. 이번 기록의 1.8~35초 끊김은 화면을 보는 중이라 이것만으로는 설명되지 않는다. 기록의 `prev.ms`와 시각으로 가를 수 있다.
  - ping: 창만 15초마다 보내고(답 8초), 서버는 ping을 보내지 않는다. 2~3초 끊김의 원인이 될 수 없다.
  - HTTP/2: tailscale serve가 Safari와 HTTP/2로 말하고 확장 CONNECT(RFC 8441)로 WebSocket을 열면 WebKit 쪽 구현 차이가 끼어들 수 있다. 판 코드로는 알 수 없어 보고에만 적는다. 다음 기록에서 압축 없는 연결도 같게 끊기면 이쪽을 본다.
- 시험: 백엔드 `npm test` 586개 통과(새 `p82.test.mjs` 4개: UA 표, 통계·필드·직전 닫힘 읽기, 실제 `ws` 클라이언트로 Safari·CriOS·데스크톱 모드 iPad는 압축 없음과 Chrome·안드로이드 Chrome·Firefox는 압축, 끊김 기록과 `pc` 전달과 4402). 창 `npm test` 282개 통과(새 `p82-lib.test.mjs` 4개), `npm run build` 통과. 창 시험 `app/test/e2e/p82-drops.mjs` 고친 뒤 10/10.
- 정리: 시험 세션은 시험이 지웠다. 브라우저 닫음, `atrium herdr stop --yes`, `atrium backend stop`, `herdr session delete atrium-dev-p82`, 시험 폴더 `C:\Workspace\mtask-p82-proj` 지움. 47899·47900·47901·9379에 듣는 프로세스, 이 워크트리·`atrium-dev-p82`를 가진 프로세스, Playwright 브라우저가 남지 않았다. PC 창을 띄우지 않아 9379는 쓰지 않았다.

## 보고

### 한 것

1. 원격 끊김 기록: disconnect에 서버가 받은 닫힘 코드·까닭 글·`ws` 오류 코드, 붙어 있던 ms, 압축 여부, 주고받은 수·바이트, 마지막으로 보낸 5개의 종류·크기. connect에 압축 여부와 창이 본 직전 닫힘(`pc`). PC 연결 기록 화면과 `atrium remote log`에 보인다.
2. WebKit 브라우저(Safari, iOS·iPadOS의 모든 브라우저, 데스크톱 모드 iPad)는 압축 없는 원격 소켓으로 받는다. 다른 원격 처리와 Chrome·Edge·Firefox·Electron은 그대로다.
3. 짧은 끊김에 휴대폰 화면이 흔들리지 않는다. 같은 터미널로 다시 붙어 이어 그리고, 띠와 연결 알약은 2초 뒤에만 바뀌고, 끊긴 동안 입력 줄의 글과 초점이 남는다.
4. 다른 원인은 위 작업 기록의 "다른 원인"에 적었다. 고친 것은 없다. HTTP/2 확장 CONNECT는 판 밖이라 기록으로 가린다.

### 사람이 확인할 순서

1. PC를 이 빌드로 업데이트하고, iPhone Safari(또는 홈 화면 웹 앱)로 보드를 연다.
2. 몇 분 동안 세션 하나를 전체 보기로 두고 가끔 입력한다. 전처럼 몇 초마다 튕기는지 본다.
3. PC 창 › 설정 › 연결된 기기 › 연결 기록에서 그 기기의 줄을 본다.
   - "연결" 줄 끝이 `plain`이 아니면(압축) 판별이 그 UA를 놓친 것이다. 브라우저 칸(예: `Safari 27 · iOS`)과 함께 알려 준다.
   - "연결 종료" 줄 끝의 코드와 시간(`1006 · 3.4s · plain`), 다음 "연결" 줄의 `직전 끊김 …`을 본다.
4. 끊김이 사라졌으면 압축이 원인이었다. 그래도 끊기면 그 코드를 알려 준다. 1006이고 `err`가 없으면 serve(HTTP/2)나 iOS 쪽을, `WS_ERR_*`가 있으면 프레임을, 1001이면 화면 꺼짐·페이지 떠남을 본다. 자세한 값은 `atrium remote log --json`.

### 고칠 문서 문장(짧게)

- ARCH 1절 원격 문단: "(원격은 묶고 압축)" → "(원격은 묶고 압축, WebKit은 압축 없이)". "원격 일은 `remote-log.jsonl`에 남고" → "원격 일과 끊김 코드는 `remote-log.jsonl`에 남고". 끝에 "끊겨도 웹 화면은 터미널을 두고 띠는 2초 뒤(P82)." 한 문장.
- ARCH 모듈 표: `backend/src/remote-ws.mjs`(WebKit 판별, 소켓 통계, 직전 닫힘 읽기), `app/src/renderer/steady.js`.
- BRIEF "정한 것"의 원격 압축 행이 있으면 "WebKit은 압축 없이"를 더한다. 옛 문장은 decisions로.
- testing.md 원격 창 시험 줄: "`ts-sim-proxy.mjs dropWs`로 서버 쪽 끊김을 흉내 낸다. 이 PC의 Playwright WebKit은 판이 맞지 않아 열리지 않는다(Chromium + Safari UA로 갈음)".
- README: 고칠 문장 없음.

### 남은 것

- Playwright WebKit 창 시험은 이 PC에서 돌지 않는다(`npx playwright install webkit`이 필요하다). 진짜 Safari로 확인한 것은 아니다.
- 압축을 끄면 휴대폰으로 가는 바이트가 는다(흉내에서 7초 동안 약 62KB). tailnet 안이라 크지 않다고 본다.
