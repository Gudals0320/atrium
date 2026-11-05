상태: 열림
날짜: 2026-11-05

## 지시

### 목표

원격 강화 S4다. PC에 앉은 사람이 원격 연결을 바로 보고, 끊고, 막을 수 있게 한다. SSH의 접속 기록에 해당하는 기록도 남긴다. 사용자의 말: "보안 강화 S1~S4 작업 진행해".

사용자와 정한 것(2026-11-05):
- 원격 판은 PC에 내 계정으로 셸을 여는 것과 같은 권한이다. 그러니 보안 기준은 SSH만큼이다.
- 지금 막는 문은 셋이다. tailnet 안에서만 열기(`tailscale serve`), 이 PC와 같은 Tailscale 사용자만 받기, PC에서 짝 맺기(6자리 코드나 허락).
- SSH보다 약한 곳: (1) 기기 토큰이 들고만 있으면 되는 bearer 토큰이고 브라우저 localStorage에 평문으로 있다. (2) Tailscale 사용자만 보고 기기는 보지 않는다. (3) 토큰이 영구이고 다시 확인하지 않는다. (4) PC에서 원격 연결을 보고 끊기가 약하다.
- 강화안 넷을 P56~P58로 나눠 맡긴다. S1 Tailscale 기기에 묶기(P57), S2 패스키(P56), S3 세션을 스크립트가 못 읽게(P56), S4 PC에서 보이고 끊기(P58).
- 사용자는 노트북에서 `https://<pc>.<tailnet>.ts.net:10000/`으로 실제 접속을 확인했다. 공개 저장소이므로 실제 PC 이름, tailnet 이름, 로그인, IP는 어디에도 쓰지 않는다.

### 할 것

1. **연결 기록.** 원격 관련 일을 판 데이터 폴더의 기록에 남긴다.
   - 남길 일: 짝 맺기 요청, 짝 맺기 성공·실패, 코드 틀림, 연결과 끊김, 거부(까닭: Host, Origin, 로그인, 자격 등), 짝 풀기, 원격 받기 끄기·켜기.
   - 남길 값: 시각, 기기 ID와 이름, 바깥 요청이면 Tailscale 로그인과 tailnet 주소, 브라우저 종류. 비밀(토큰, 코드, 세션 ID)은 남기지 않는다.
   - 크기에 상한을 둔다(예: 최근 2000개, 30일).
   - 새 모듈(예: `backend/src/remote-log.mjs`)에 두고, `web.mjs`에서는 `authorize` 결과(받음·거부와 까닭)와 짝 맺기·끊기 자리에서 한 줄로 부른다. P56(패스키 로그인)과 P57(Tailscale 기기 확인)이 같은 때 거부 까닭을 더하므로, 까닭은 문자열 코드로 받아 그대로 남긴다.
   - API는 `remote.log { limit }`(이 PC만)로 연다. 설정 → 연결된 기기 탭에 최근 기록을 보인다.
2. **붙으면 알리기.** 원격 기기가 새로 붙으면(그 기기의 연결이 없다가 생기면) PC 창에 토스트를 띄운다. 창이 숨어 있으면 OS 알림을 띄운다. 예: "노트북이 원격으로 붙었습니다". 짝 맺기 성공도 알린다. 같은 기기가 잠깐 끊겼다 다시 붙는 것(다시 연결)은 몇 분 안에는 다시 알리지 않는다.
3. **알약에서 끊기.** 위쪽 "다른 기기 n" 알약(`Peers.jsx`)의 원격 기기마다 두 버튼을 둔다.
   - "끊기": 지금 연결을 닫는다. 기기는 다시 붙을 수 있다.
   - "짝 풀기": 짝을 풀고 연결을 닫는다(확인 대화상자).
   - API는 `device.disconnect { id }`(이 PC만)를 더한다. P56이 합쳐지면 끊기가 그 기기의 세션도 끝내야 한다. 지휘 세션이 합칠 때 이을 수 있도록 끊기 처리에 걸림 고리(예: `onDisconnectDevice`)를 둔다.
4. **원격 받기 스위치.** 판 설정에 "원격 받기"(기본 켬)를 둔다.
   - 끄면 이 PC 밖에서 온 요청(바깥 요청과 기기 연결)을 모두 거부하고, 붙어 있는 원격 연결을 닫는다. 이 PC의 창과 CLI는 그대로다.
   - 스위치는 설정의 연결된 기기 탭, 트레이 메뉴, `atrium remote block|allow`에 둔다. Tailscale serve 설정은 건드리지 않는다.
   - 꺼져 있으면 웹 화면은 "PC에서 원격을 막았습니다"를 보인다. `remote status`도 그것을 보인다.

### 완료 기준

1. 단위 시험을 더하고 통과한다.
   - 기록: 남기기, 상한, 비밀 빠짐, 까닭 코드
   - 알림: 새로 붙음만 알림, 다시 연결은 다시 알리지 않음
   - 끊기: 그 기기의 연결만 닫힘
   - 원격 받기 끄기: 바깥 요청과 기기 연결 거부, 붙은 연결 닫힘, 이 PC의 창과 CLI는 됨
   - `device.disconnect`·`remote.log`는 이 PC만 부를 수 있음
2. 개발용 판, 창(Electron), 브라우저(Playwright Chromium, 짝 맺은 기기)로 확인하고 결과를 `experiments/p58/`(git 밖)에 둔다.
   - 흐름: 브라우저가 붙음 → PC 창에 알림 → 알약에서 끊기 → 브라우저가 다시 붙음 → 짝 풀기 → 거부 → 원격 받기 끄기 → 바깥(흉내 프록시) 요청 거부 → 켜기 → 다시 됨.
   - 그 과정이 연결 기록에 맞게 남는다.
3. `cd backend && npm test`, `cd app && npm test`, `cd app && npm run build`가 통과한다.

### 읽을 파일

- `CLAUDE.md`, `docs/testing.md`, `docs/log/p47-remote-r1-multiclient.md`·`p48-remote-r2-web.md`·`p49-remote-r3-tailscale.md`의 보고 절
- `backend/src/web.mjs`, `backend/src/peers.mjs`, `backend/src/multiclient.mjs`, `backend/src/settings.mjs`, `backend/bin/atrium-remote.mjs`, `backend/bin/atrium.mjs`(devices)
- `app/src/renderer/Peers.jsx`, `app/src/renderer/WebDevices.jsx`, `app/src/main/tray.mjs`, `app/test/e2e/p47-multi.mjs`, `app/test/e2e/p48-web.mjs`, `app/test/e2e/p49-remote.mjs`

### 시험 환경

- 개발용 판이 필요하면 너만의 판으로 띄운다(`docs/testing.md`).
  - `ATRIUM_HERDR_SESSION=atrium-dev-p58`, `ATRIUM_PORT=47877`
  - `ATRIUM_DATA_DIR=<워크트리>/backend/.dev/data`, `ATRIUM_APP_USERDATA=<워크트리>/backend/.dev/app`
- 실제 판(`atrium`, 47800)과 다른 포트(47811~47877 가운데 네 것 말고)는 쓰지 않는다. 사용자의 기본 herdr 세션과 다른 판의 herdr 서버는 건드리지 않는다.
- 대화 목록은 시험 폴더의 대화만 읽는다(`ATRIUM_CLAUDE_PROJECTS`, `ATRIUM_CLAUDE_DESKTOP=none`). 시험 폴더는 `C:\Workspace\mtask-p58-*`처럼 새로 만든다.
- **이 PC의 Tailscale 설정은 바꾸지 않는다.** `tailscale serve|funnel|set|up|down`과 `atrium remote enable|disable --yes`를 실행하지 않는다. 읽기 명령(`status --json`, `serve status --json`, `whois --json`)만 부른다. Tailscale은 P49의 가짜 tailscale(`app/test/e2e/p49-fake-tailscale.mjs`)과 흉내 프록시(`backend/tools/ts-sim-proxy.mjs`)로 시험한다. 실제 Tailscale 출력은 작업 기록에 붙이지 않고 `experiments/p58/`에만 둔다.
- 끝나면 시험 세션, 창, 백엔드, herdr 서버와 세션(`atrium-dev-p58`만), 시험 폴더를 끄고 지운다.

### 지킬 것

- `CLAUDE.md`를 따른다. 프로세스는 직접 띄운 것만 PID로 끈다.
- 이 저장소는 공개다. 작업 기록, 시험 코드, 커밋 메시지에 사용자 경로·메일·토큰, 실제 PC·tailnet 이름, IP를 쓰지 않는다. 예시는 `pc.example.ts.net`, `laptop.example.ts.net`, `user@example.com`, `100.64.0.x`를 쓴다. 커밋 전·푸시 전 검사를 건너뛰지 않는다.
- 보안 코드다. 막는 쪽이 기본이다(검사 실패, 시간 초과, 모르는 값은 거부). 비밀(토큰, 세션 ID, 챌린지)은 로그와 화면에 쓰지 않는다. 비교는 시간이 일정한 비교를 쓴다.
- 같은 때 다른 작업자(P56(패스키와 세션), P57(Tailscale 기기 묶기))가 같은 원격 코드(`backend/src/web.mjs` 등)를 고친다. 맡은 일에 필요한 만큼만 고치고, 새 동작은 되도록 새 모듈이나 작은 함수로 두어 `web.mjs`의 기존 함수는 몇 줄만 바꾼다. 기기 기록(`webDevices`)에서 네가 모르는 필드는 그대로 둔다.
- 자기 브랜치에만 커밋한다. 커밋 메시지에 `Co-Authored-By` 줄을 넣지 않는다. `main`을 바꾸거나 푸시하지 않는다. `node_modules`는 워크트리 안에서 받는다(`npm ci`).
- 문서는 이 작업 파일의 작업 기록 절과 보고 절만 고친다. 고쳐야 할 ARCH·BRIEF·testing 문장이 있으면 보고 절에 짧게 적는다.
- 끝나면 보고 절을 쓰고, 맨 마지막에 `<워크트리>/backend/.dev/p58.done`(브랜치 이름과 마지막 커밋 해시 두 줄)을 만든다.

## 작업 기록

2026-11-05, 작업자 세션(워크트리 `worktree-p58`)

- 읽은 것: 지시의 파일 모두와 P47~P49 보고 절. 연결 허락은 `WebServer.authorize`(WebSocket), HTTP 막기는 `handleHttp`, 연결 열고 닫기는 `ApiServer`의 `onOpen`·`onClose`(backend.mjs에서 묶음)다. 판 설정 바꾸기는 backend.mjs의 `settings.set` 감싸개가 이미 `remote*` 키를 기기에서 막는다.
- 계획
  - 새 모듈 `backend/src/remote-log.mjs`: 기록(`RemoteLog`)과 알림 판단(`ConnectWatch`), 브라우저 종류(`browserOf`). 기록은 정한 필드만 받는 `logEntry`로 만들어 비밀이 들어갈 자리를 없앤다.
  - `web.mjs`에는 P58 함수 묶음을 `policy()` 뒤 한곳에 더하고, 기존 함수에서는 `return null`을 `return this.refuse(req, '<까닭>')`로 바꾸는 식으로 한 줄씩만 고친다(P56·P57과 합치기 쉽게).
  - 원격 받기는 판 설정 `remoteAccess`(기본 켬). 이름이 `remote`로 시작해 기기는 바꾸지 못한다(P49 막기 그대로).
- 정한 것
  - 끊기는 4402, 원격 막음은 4403으로 닫는다. 웹 화면은 4402를 보통 끊김으로 보고 다시 붙고(띠 글만 "PC에서 이 연결을 끊었습니다"), 4403과 `/web/me`의 `remote_blocked`는 막음 화면을 보이며 백오프로 계속 다시 붙어 본다. 켜면 저절로 돌아온다.
  - 원격 받기가 꺼진 동안 이 PC 안 브라우저의 화면 파일은 내준다(그 화면이 `/web/me` 거부를 보고 막음 화면을 보인다). 바깥에서 온 화면 요청은 막음 글만 담은 503 쪽이다.
  - 끄면 붙은 원격 연결을 닫을 때 짝 맺기 코드도 버린다.
  - 붙음 알림은 백엔드가 판단한다: 기기의 연결이 0에서 1이 될 때, 끊긴 지 3분 안이거나 3분 안에 이미 알렸으면 알리지 않는다. 짝 맺기 성공도 알리고, 바로 뒤의 첫 연결은 그 알림으로 친다.
  - OS 알림을 띄울지는 main이 실제 창 상태(보임, 내려 둠, 초점)로 정한다. 렌더러의 `document.hasFocus()`는 Playwright가 흉내 내어 늘 참이라 시험에서 처음에 실패했다. 창이 없으면 트레이가 띄운다.
- 진행
  - 백엔드 단위 시험 8개(`p58.test.mjs`)가 처음부터 통과. 전체 417 통과.
  - 창: 알약 목록(끊기·짝 풀기와 확인 대화상자), 토스트와 OS 알림, 설정 탭의 스위치와 기록, 웹 막음 화면, 트레이 체크 항목. 단위 시험 4개(`p58-lib.test.mjs`), 전체 189 통과.
  - 개발용 판 시험 첫 번째 돌림에서 OS 알림 하나가 실패(위 초점 흉내), 두 번째는 렌더러를 다시 빌드하지 않아 실패, 세 번째부터 14/14. 판 데이터를 지우고 깨끗한 판에서 다시 돌려 14/14.
  - 설정 탭의 체크 칸이 대화상자 `label`의 격자 규칙 때문에 글 위에 따로 떠 있었다(P49 사용자 제한 칸도 같음). `.mt-modal label.mt-remote-row`를 한 줄로 고쳤다.
- 흉내 프록시 포트는 47878을 썼다(47811~47877 밖).

## 보고

### 만든 것

- **연결 기록**(`backend/src/remote-log.mjs`): 판 데이터 폴더의 `remote-log.jsonl`. 남기는 일은 `pair.request`, `pair.ok`(방법 code·approve), `pair.fail`(까닭 bad_code·no_code·rate_limited·denied 등), `connect`, `disconnect`(까닭 closed·pc·revoked·blocked), `deny`(까닭 코드), `unpair`, `kick`(PC에서 끊기, 닫은 연결 수), `remote.block`, `remote.allow`다. 값은 시각, 기기 ID·이름, Tailscale 로그인, tailnet 주소(바깥 요청만), 브라우저 종류(User-Agent 전체가 아니라 "Chrome 130 · Windows"), 바깥 요청인지다. 정한 필드만 받으므로 토큰·코드·세션 ID·챌린지는 남지 않는다(시험에서 기록 파일에 토큰·코드·판 API 토큰이 없음을 본다). 까닭은 `[A-Za-z0-9_.:-]{1,48}`이면 그대로, 아니면 `unknown`. 최근 2000개·30일. 같은 거부·실패가 30초 안에 되풀이되면 새 줄 대신 `count`를 올린다. 쓰기는 0.5초 모아 임시 파일에 쓰고 바꾼다.
- **web.mjs 고리**: 거부 자리는 모두 `this.refuse(req, '<까닭>')`(WebSocket) 또는 `this.note('deny', req, { reason })`(HTTP)를 부른다. 까닭: `path`, `api_token`, `not_local`, `no_credentials`, `remote_blocked`, `host`, `origin`, `login_<P49 까닭>`, `device_token`. 연결·끊김은 `clientOpened`·`clientClosed`(backend.mjs `onOpen`·`onClose`), 짝 맺기는 `/web/pair/*`와 `decide`(허락·거절)에서 남긴다.
- **붙으면 알리기**: 백엔드가 PC 창·트레이(판 API 토큰 연결)에만 `remote.connected { kind: 'paired'|'connected', device, remote, login, browser, at }`를 보낸다. 창은 토스트("노트북이(가) 원격으로 붙었습니다 (로그인 · 브라우저)")를 띄우고, 창이 내려가 있거나 초점이 없으면 OS 알림도 띄운다(`mt:notify`의 `ifHidden`). 창이 없으면 트레이가 OS 알림을 띄운다. 다시 연결은 3분 안에는 알리지 않는다(`ATRIUM_REMOTE_QUIET_MS`로 바꿀 수 있다, 시험용).
- **알약에서 끊기**: "다른 기기 n"을 누르면 목록이 펼쳐진다(마우스를 올리면 예전 설명도 그대로). PC 창에서는 짝 맺은 기기마다 "끊기"(`device.disconnect { id }`, 이 PC만, 그 기기의 연결만 4402로 닫음)와 "짝 풀기"(확인 대화상자 뒤 `device.revoke`, 4401). 클라이언트 목록(`clients.updated`)에 `deviceId`·`remote`를 더했다. 끊기 고리 `web.onDisconnectDevice(fn)`은 `{ id, reason: 'disconnect'|'revoke'|'blocked' }`로 불린다.
- **원격 받기 스위치**: 판 설정 `remoteAccess`(기본 켬). 끄면 기기 연결(바깥·이 PC 안 브라우저 모두)과 `/web/*`, 바깥에서 온 화면 요청을 거부하고, 붙은 기기·바깥 연결을 4403으로 닫고, 짝 맺기 코드를 버린다. 이 PC의 창과 CLI(판 API 토큰)는 그대로다. 스위치는 설정 › 연결된 기기 맨 위, 트레이 메뉴의 체크 항목, `atrium remote block|allow`. Tailscale serve는 건드리지 않는다. 설정을 읽지 못하면 막는다.
- **보이기**: 웹 화면은 "PC에서 원격을 막았습니다"(막음 화면, 켜지면 저절로 돌아옴), 짝 맺기 화면에서도 같은 글. `remote.status`에 `accepting`과 지금 붙은 기기 수 `connected`, 꺼져 있으면 `ready: false`. `atrium remote status` 첫 줄에 `[막음] …` 또는 `원격 받기 켜짐 (지금 붙은 기기 n대)`.
- **API·CLI**: `device.disconnect { id }`, `remote.log { limit }`(둘 다 이 PC만, 기기가 부르면 `forbidden`). 이벤트 `remote.connected`, `remote.logged`(PC 창에만). `atrium remote block|allow|log [--limit n]`, `atrium devices kick <id>`. 설정 탭에 최근 기록 100줄(새 줄이 오면 다시 읽음).
- **말 바꿈**: 설정 탭 기기 목록의 "끊기"(짝 풀기 동작)를 "짝 풀기"(en "Unpair")로 바꿨다. 이제 "끊기"는 지금 연결만 닫는 것이다. `atrium remote guide`의 끊기 줄도 고쳤다.
- **시험**
  - 단위: `backend/test/p58.test.mjs` 8개(기록 필드·비밀·까닭, 상한·합침·파일, 알림 판단, 붙음 알림 HTTP·WebSocket, 끊기는 그 기기만·다시 붙음·짝 풀기, 원격 받기 끄기와 켜기, 거부 기록, 클라이언트 목록), `app/test/p58-lib.test.mjs` 4개. `cd backend && npm test` 417, `cd app && npm test` 189, `npm run build` 통과.
  - 개발용 판(`atrium-dev-p58`, 47877, 가짜 tailscale, 흉내 프록시 47878) 창 시험 `app/test/e2e/p58-remote.mjs` 14/14. 결과·스크린숏·기록은 `experiments/p58/`(git 밖).

### 개발용 판 결과(experiments/p58)

| 항목 | 결과 |
|---|---|
| 짝 맺기 | PC 창 토스트 "짝을 맺었습니다", 바로 뒤 첫 연결과 새로 고침은 다시 알리지 않음 |
| 새로 붙음 | 조용한 시간(시험 6초) 뒤 다시 열면 "원격으로 붙었습니다(로그인 · Chrome · Windows)", 창을 내려 두면 OS 알림도 뜸. 창이 보이면 OS 알림은 `window-visible`로 건너뜀 |
| 알약에서 끊기 | 브라우저 연결 4402, 띠 "PC에서 이 연결을 끊었습니다", 약 0.65초 뒤 다시 붙음, 다시 알리지 않음 |
| 짝 풀기 | 확인 대화상자 → 브라우저는 짝 맺기 화면, 옛 토큰으로 `/web/me` 401 |
| 원격 받기 끄기 | 설정 탭에서 끔 → 브라우저 막음 화면, 프록시를 거친 `/web/me` 403 `remote_blocked`, 화면 503, 짝 맺기 요청 403. PC 창 ping과 CLI 그대로, `remote status`·트레이 메뉴에 막음 |
| 켜기 | `atrium remote allow` 뒤 약 0.3초에 브라우저가 다시 붙음, 바깥 요청 200. 트레이 메뉴와 `atrium remote block`으로도 끄고 켬 |
| 기록 | 흐름 18단계가 차례대로 남음(기기·로그인·tailnet 주소·브라우저), 토큰 없음. 설정 탭에 27줄 |

### 계획과 다른 곳

- 지시는 "창이 숨어 있으면 OS 알림"이다. 숨음(내려 둠·안 보임)과 함께 초점이 없을 때도 띄운다. 다른 창 뒤에 가려진 PC 창의 토스트는 보이지 않기 때문이다. 판단은 렌더러가 아니라 main이 실제 창 상태로 한다.
- 원격 받기가 꺼져 있어도 이 PC 안 브라우저(127.0.0.1)에는 화면 파일을 내준다. 그 브라우저도 기기 연결과 `/web/*`는 거부되고 막음 화면이 보인다.
- 원격 받기를 끄면 짝 맺기 코드도 버린다(지시에 없음).
- 지시에 없던 CLI `atrium remote log`, `atrium devices kick`을 더했다.
- 시험용 환경 변수 `ATRIUM_REMOTE_QUIET_MS`를 더했다.
- 남의 파일을 고쳤다: `backend.mjs`(onOpen·onClose 두 곳, `settings.set` 감싸개에 원격 받기 바뀜), `multiclient.mjs`(`clientList`에 `deviceId`·`remote`), `settings.mjs`(`remoteAccess`), `bin/atrium.mjs`(도움말, `devices kick`), `main.mjs`(`mt:notify`의 `ifHidden`), `tray.mjs`, `api.js`·`web.js`·`Pair.jsx`·`RemoteBar.jsx`·`lib/reconnect.js`(막음 상태), `Peers.jsx`(목록으로 바꿈), `WebDevices.jsx`, `main.jsx`, `styles.css`, 두 사전.

### P56·P57과 합칠 때

- 거부 까닭은 `this.refuse(req, '<코드>')`(WebSocket `authorize`) 또는 `this.note('deny', req, { reason: '<코드>' })`(HTTP)로 한 줄씩 남긴다. 코드는 그대로 기록되고, 화면 글은 사전 `remoteLog.reason_<코드>`가 있으면 그 글, 없으면 코드다.
- P56의 세션 끝내기는 `this.web.onDisconnectDevice(({ id, reason }) => …)`로 잇는다. 끊기·짝 풀기·원격 막음 셋 다 부른다.
- P56이 `/web/me`나 연결 방식(쿠키 세션)을 바꾸면 웹 화면의 막음 판단(`web.js webMe`의 403 `remote_blocked`, 연결 닫힘 4403)을 그대로 두어야 한다. `handleHttp`의 원격 막기 한 줄은 Host 검사 바로 뒤, 다른 `/web/*` 처리보다 앞이어야 한다.
- P57이 기기 연결에 Tailscale 기기 확인을 더하면 `authorize`의 원격 받기 검사(`remote_blocked`)보다 뒤에 둔다(꺼져 있으면 먼저 막는다).
- 연결 기록의 `connect` 줄에 P57의 기기(노드) 이름을 남기려면 `logEntry`에 필드를 하나 더한다(지금은 정한 필드만 받는다).

### 알려진 문제

- 기록의 로그인과 tailnet 주소는 `Tailscale-User-Login`과 `X-Forwarded-For`(루프백에서 온 것만 믿음)에서 온다. 실제 serve를 거친 요청 모양은 P49처럼 흉내로만 봤다.
- 같은 기기를 탭 둘로 열면 알약에는 클라이언트가 둘이고, "끊기"는 그 기기의 연결을 모두 닫는다.
- 다시 연결을 가리는 3분은 기기 단위다. 3분 넘게 끊겼던 기기가 다시 붙으면 다시 알린다(노트북 잠자기 뒤 등).
- 원격 받기는 판 설정이라 백엔드가 떠 있을 때만 바꾼다(`atrium remote block`은 백엔드가 없으면 실패를 알린다). 꺼진 동안 백엔드를 다시 켜도 꺼진 채다.
- 기록 파일은 매 쓰기마다 통째로 다시 쓴다(2000줄, 수백 KB). 거부가 몰리면 0.5초에 한 번까지 쓴다.
- 웹 화면의 막음 화면은 백오프(15초까지)로 다시 붙어 보므로, 켠 뒤 늦으면 15초쯤 걸린다("지금 다시 시도" 단추가 있다).
- `device.revoke`는 P48부터 기기도 부를 수 있다(기기가 다른 기기의 짝을 풀 수 있다). 이번에 바꾸지 않았다.

### 살아 있는 문서에 고칠 문장

- ARCH 5절 모듈 표: `remote-log.mjs` — 원격 연결 기록(데이터 폴더 `remote-log.jsonl`, 정한 필드만, 2000개·30일)과 새로 붙음 판단.
- ARCH 6절 API 표: `device.disconnect { id }`(이 PC만, 지금 연결만 4402로 닫음), `remote.log { limit }`(이 PC만), 이벤트 `remote.connected`, `remote.logged`(PC 창에만). `remote.status`에 `accepting`, `connected`. 판 설정 `remoteAccess`.
- ARCH 원격 절: "원격 받기를 끄면 기기 연결, `/web/*`, 바깥 화면 요청을 거부하고 붙은 연결을 4403으로 닫는다. 판 API 토큰 연결(이 PC의 창·CLI)은 그대로."
- BRIEF "정한 것" 원격 행 더할 문장: "PC에서 원격 연결을 보고(알림, 연결 기록), 끊고(알약), 막는다(원격 받기 스위치)(2026-11-05, P58)."
- testing.md: 원격 시험은 `ATRIUM_REMOTE_QUIET_MS`로 다시 연결 알림 간격을 줄인다. Playwright가 띄운 Electron 창에서 `document.hasFocus()`는 늘 참이라 창 상태는 main(`BrowserWindow`)에서 본다.

### 정리

- 창, 브라우저, 흉내 프록시를 닫고, `atrium-dev-p58`의 herdr 서버와 백엔드를 끈 뒤 herdr 세션을 지웠다. 시험 세션과 시험 폴더는 만들지 않았다(워크스페이스 없이 시험). 47877·47878을 듣는 프로세스가 없음을 확인했다. 개발용 판 데이터(`backend/.dev`, git 밖)는 남겼다.
- 이 PC의 Tailscale 명령은 부르지 않았다(가짜 tailscale만).
