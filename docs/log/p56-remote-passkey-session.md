상태: 열림
날짜: 2026-11-05

## 지시

### 목표

원격 강화 S2와 S3이다. 짝 맺은 브라우저가 들고 다니는 영구 bearer 토큰을 없애고, 패스키(WebAuthn, 노트북의 Windows Hello 등)로 확인한 뒤 받는 짧은 세션으로 바꾼다. 사용자의 말: "보안 강화 S1~S4 작업 진행해".

사용자와 정한 것(2026-11-05):
- 원격 판은 PC에 내 계정으로 셸을 여는 것과 같은 권한이다. 그러니 보안 기준은 SSH만큼이다.
- 지금 막는 문은 셋이다. tailnet 안에서만 열기(`tailscale serve`), 이 PC와 같은 Tailscale 사용자만 받기, PC에서 짝 맺기(6자리 코드나 허락).
- SSH보다 약한 곳: (1) 기기 토큰이 들고만 있으면 되는 bearer 토큰이고 브라우저 localStorage에 평문으로 있다. (2) Tailscale 사용자만 보고 기기는 보지 않는다. (3) 토큰이 영구이고 다시 확인하지 않는다. (4) PC에서 원격 연결을 보고 끊기가 약하다.
- 강화안 넷을 P56~P58로 나눠 맡긴다. S1 Tailscale 기기에 묶기(P57), S2 패스키(P56), S3 세션을 스크립트가 못 읽게(P56), S4 PC에서 보이고 끊기(P58).
- 사용자는 노트북에서 `https://<pc>.<tailnet>.ts.net:10000/`으로 실제 접속을 확인했다. 공개 저장소이므로 실제 PC 이름, tailnet 이름, 로그인, IP는 어디에도 쓰지 않는다.

### 할 것

1. **짝 맺기 → 패스키 등록.** 코드나 PC 허락으로 짝 맺기에 성공하면 기기 토큰을 내주지 않는다. 대신 몇 분 동안 한 번만 쓰는 등록 허가를 주고, 그 브라우저에서 패스키 등록을 마쳐야 기기가 생긴다.
   - `navigator.credentials.create`: RP ID는 그 페이지의 호스트 이름, `userVerification: 'required'`, `attestation: 'none'`, 알고리즘은 ES256(-7)과 RS256(-257)을 받는다(Windows Hello는 RS256을 쓸 수 있다). 노트북 내장 인증기를 먼저 쓰되 보안 키도 받는다.
   - 서버는 credential ID, 공개 키, signCount, RP ID를 기기 기록에 둔다.
2. **로그인.** 서버가 일회용 챌린지를 주고, 브라우저가 `navigator.credentials.get`으로 서명한다. credential ID는 비밀이 아니니 브라우저에 둬도 된다.
   - 서버는 다음을 모두 확인한다. 챌린지(한 번만, 짧은 수명), `clientDataJSON`의 type과 origin(허용 Host와 같은 출처), `authenticatorData`의 rpIdHash, 사용자 확인(UP·UV) 플래그, signCount(0이 아니면 되돌아가지 않음), 서명.
   - 검증은 검증된 라이브러리(예: `@simplewebauthn/server`)나 `node:crypto`로 한다. 의존성을 더하면 이유를 작업 기록에 적는다.
3. **세션(S3).** 로그인하면 서버가 무작위 세션 ID를 만들고 해시만 둔다. 브라우저에는 `HttpOnly; SameSite=Strict; Path=/` 쿠키로 준다(https면 `Secure`).
   - 웹 화면의 스크립트가 비밀을 읽을 수 없어야 한다. localStorage와 sessionStorage에 비밀을 두지 않는다.
   - WebSocket과 HTTP(`/web/me`, `/web/upload` 등)는 이 쿠키로 인증한다. `?device=` 쿼리와 `Authorization: Bearer` 기기 토큰은 없앤다. Origin 검사는 그대로 둔다(쿠키와 Origin 검사가 함께 CSRF를 막는다).
   - 기본 수명은 로그인 뒤 12시간이다. 연결이 모두 끊긴 채 30분이 지나도 끝난다(노트북 잠자기). 두 값은 판 설정(연결된 기기 탭)에서 바꿀 수 있다.
   - 기기를 끊거나 짝을 풀면 그 기기의 세션도 모두 끝난다.
4. **화면.** 세션이 끝나면(4401) 웹 화면은 "다시 확인(Windows Hello)" 화면으로 간다. 짝이 풀린 기기면 짝 맺기 화면으로 간다. P49의 다시 연결(`lib/reconnect.js`)과 맞춘다. 패스키를 쓸 수 없는 브라우저(보안 출처가 아님, WebAuthn 없음)는 이유를 보이고 막는다. 토큰으로 되돌아가는 길은 만들지 않는다.
5. **옛 기기.** 이 작업 전에 토큰으로 짝 맺은 기기는 더 쓸 수 없다. 기기 목록에 "다시 짝 맺기 필요"로 보이고 PC에서 지울 수 있다. 옛 토큰으로 패스키를 등록하는 길은 만들지 않는다. 훔친 토큰으로 공격자의 패스키를 심을 수 있기 때문이다.
6. PC 창(Electron)과 CLI는 판 API 토큰을 그대로 쓴다. 바뀌지 않는다.
7. `README.md`·`README.ko.md`의 "원격 접속(Tailscale)" 절에서 짝 맺기와 보안 주의를 패스키 기준으로 고친다. 다른 작업자는 README를 고치지 않는다.

### 완료 기준

1. 단위 시험을 더하고 통과한다. 가짜 인증기(시험 안에서 ES256·RS256 키로 서명)로 다음을 본다.
   - 등록과 로그인이 된다.
   - 다음은 거부한다: 챌린지 재사용, 만료된 챌린지, origin 틀림, rpId 틀림, UV 없음, 다른 기기의 서명, signCount 되돌림, 옛 토큰, 만료 세션, 끊긴 뒤 30분 지난 세션, 짝 푼 기기의 세션.
   - 쿠키 속성(HttpOnly, SameSite=Strict, https일 때 Secure)이 맞다.
2. 개발용 판과 브라우저(Playwright Chromium)로 확인하고 결과를 `experiments/p56/`(git 밖)에 둔다.
   - Chromium의 CDP 가상 인증기(`WebAuthn.enable`, `WebAuthn.addVirtualAuthenticator`, `hasUserVerification`·`isUserVerified`)를 쓴다.
   - 흐름: 코드로 짝 맺기 → 패스키 등록 → 터미널 사용 → 새로 고침 후 다시 확인 → 세션 만료 후 다시 확인 → PC에서 짝 풀기 → 거부.
   - `document.cookie`와 localStorage에 비밀이 없음을 보인다.
   - WebAuthn은 보안 출처에서만 된다. `http://localhost`는 보안 출처다. 흉내 프록시(가짜 ts.net 이름)로 볼 때는 Chromium 플래그나 자체 서명 https로 맞추고 그 방법을 적는다.
3. `cd backend && npm test`, `cd app && npm test`, `cd app && npm run build`가 통과한다.

### 읽을 파일

- `CLAUDE.md`, `docs/testing.md`, `docs/log/p48-remote-r2-web.md`·`p49-remote-r3-tailscale.md`의 보고 절
- `backend/src/web.mjs`(Devices, Pairing, authorize, HTTP), `backend/src/api.mjs`, `backend/src/tailscale.mjs`
- `app/src/renderer/web.js`, `app/src/renderer/WebDevices.jsx`, `app/src/renderer/lib/reconnect.js`, `app/src/renderer/RemoteBar.jsx`
- `app/test/e2e/p48-web.mjs`, `app/test/e2e/p49-remote.mjs`, `backend/tools/ts-sim-proxy.mjs`, `backend/test/p48.test.mjs`·`p49.test.mjs`

### 시험 환경

- 개발용 판이 필요하면 너만의 판으로 띄운다(`docs/testing.md`).
  - `ATRIUM_HERDR_SESSION=atrium-dev-p56`, `ATRIUM_PORT=47875`
  - `ATRIUM_DATA_DIR=<워크트리>/backend/.dev/data`, `ATRIUM_APP_USERDATA=<워크트리>/backend/.dev/app`
- 실제 판(`atrium`, 47800)과 다른 포트(47811~47877 가운데 네 것 말고)는 쓰지 않는다. 사용자의 기본 herdr 세션과 다른 판의 herdr 서버는 건드리지 않는다.
- 대화 목록은 시험 폴더의 대화만 읽는다(`ATRIUM_CLAUDE_PROJECTS`, `ATRIUM_CLAUDE_DESKTOP=none`). 시험 폴더는 `C:\Workspace\mtask-p56-*`처럼 새로 만든다.
- **이 PC의 Tailscale 설정은 바꾸지 않는다.** `tailscale serve|funnel|set|up|down`과 `atrium remote enable|disable --yes`를 실행하지 않는다. 읽기 명령(`status --json`, `serve status --json`, `whois --json`)만 부른다. Tailscale은 P49의 가짜 tailscale(`app/test/e2e/p49-fake-tailscale.mjs`)과 흉내 프록시(`backend/tools/ts-sim-proxy.mjs`)로 시험한다. 실제 Tailscale 출력은 작업 기록에 붙이지 않고 `experiments/p56/`에만 둔다.
- 끝나면 시험 세션, 창, 백엔드, herdr 서버와 세션(`atrium-dev-p56`만), 시험 폴더를 끄고 지운다.

### 지킬 것

- `CLAUDE.md`를 따른다. 프로세스는 직접 띄운 것만 PID로 끈다.
- 이 저장소는 공개다. 작업 기록, 시험 코드, 커밋 메시지에 사용자 경로·메일·토큰, 실제 PC·tailnet 이름, IP를 쓰지 않는다. 예시는 `pc.example.ts.net`, `laptop.example.ts.net`, `user@example.com`, `100.64.0.x`를 쓴다. 커밋 전·푸시 전 검사를 건너뛰지 않는다.
- 보안 코드다. 막는 쪽이 기본이다(검사 실패, 시간 초과, 모르는 값은 거부). 비밀(토큰, 세션 ID, 챌린지)은 로그와 화면에 쓰지 않는다. 비교는 시간이 일정한 비교를 쓴다.
- 같은 때 다른 작업자(P57(Tailscale 기기 묶기), P58(PC에서 보이고 끊기))가 같은 원격 코드(`backend/src/web.mjs` 등)를 고친다. 맡은 일에 필요한 만큼만 고치고, 새 동작은 되도록 새 모듈이나 작은 함수로 두어 `web.mjs`의 기존 함수는 몇 줄만 바꾼다. 기기 기록(`webDevices`)에서 네가 모르는 필드는 그대로 둔다.
- 자기 브랜치에만 커밋한다. 커밋 메시지에 `Co-Authored-By` 줄을 넣지 않는다. `main`을 바꾸거나 푸시하지 않는다. `node_modules`는 워크트리 안에서 받는다(`npm ci`).
- 문서는 이 작업 파일의 작업 기록 절과 보고 절만 고친다, 그리고 README 두 파일의 원격 접속 절. 고쳐야 할 ARCH·BRIEF·testing 문장이 있으면 보고 절에 짧게 적는다.
- 끝나면 보고 절을 쓰고, 맨 마지막에 `<워크트리>/backend/.dev/p56.done`(브랜치 이름과 마지막 커밋 해시 두 줄)을 만든다.

## 작업 기록

2026-11-05 작업자 세션(워크트리 `worktree-p56`).

계획과 정한 것:
- 새 동작은 새 모듈에 둔다. `backend/src/passkey.mjs`(WebAuthn 확인, CBOR 읽기, 챌린지), `backend/src/web-auth.mjs`(등록 허가, 세션, 쿠키, 등록·로그인 묶음). `web.mjs`에서는 `Devices`(토큰 → 패스키), `Pairing`(기기 대신 허가), `authorize`(쿠키), HTTP 경로 몇 줄만 바꿨다. P57·P58이 같은 함수를 고치므로 합칠 때 겹치는 곳은 `authorize`의 세션 확인 블록, `Pairing.redeem/decide`의 `grants.issue` 줄, `revoke`다.
- 의존성은 더하지 않았다. `@simplewebauthn/server` 대신 `node:crypto`(`createPublicKey` JWK, `crypto.verify`)로 했다. 이유: attestation `none`만 받으므로 증명서 검사가 없고, 필요한 것은 CBOR 일부(길이를 아는 항목만), authData 읽기, ES256·RS256 서명 확인뿐이라 300줄 안에 든다. 공개 저장소에 의존성 트리를 늘리지 않고, 막는 쪽 기본(모르는 CBOR 형식, 태그, 실수, 길이 모름, 중복 키 거부)을 직접 정할 수 있다.
- attestation 문(`attStmt`)은 읽지 않는다. 브라우저가 `attestation: 'none'`이면 형식을 none으로 바꾸고, 믿음은 PC에서 맺은 짝과 일회용 허가에서 온다.
- 기대 origin은 요청의 `Origin` 머리글이다(이미 `originOk`로 허용 Host와 같은 출처인지 본 값). `clientDataJSON.origin`이 그것과 글자까지 같아야 한다. RP ID는 그 출처의 호스트 이름이고, IP 주소면 거부한다(`ip_host`, WebAuthn은 IP를 RP ID로 받지 않는다). 그래서 웹 화면 주소 표시(`web.status` url)를 `http://localhost:<포트>/`로 바꿨다.
- 등록 허가는 짝 맺기를 청한 페이지의 출처에 묶는다. 다른 출처에서는 등록하지 못한다. 허가는 5분, 등록이 5번 틀리면 버린다. 허가 원문은 페이지 메모리에만 있다.
- 챌린지는 2분, 한 번 꺼내면(맞든 틀리든) 지운다. 64개가 넘으면 오래된 것부터 버린다. 등록 챌린지는 허가에, 로그인 챌린지는 출처에 묶는다.
- signCount: 저장 값과 새 값이 모두 0이면 받는다(동기화 패스키는 늘 0). 하나라도 0이 아니면 새 값이 커야 한다.
- 세션: 쿠키 이름에 판 포트를 넣었다(`atrium_<포트>`, https면 `__Host-atrium_<포트>`). 쿠키는 포트를 가리지 않아 같은 PC의 개발용 판과 실제 판이 서로 덮어쓰기 때문이다. 판 기록 `meta webSessions`에는 해시, 기기 ID, 만든 때만 둔다. 백엔드를 다시 켜면 세션은 남고 끊긴 시간은 그때부터 센다. 세션 찾기는 비밀의 sha256으로 Map에서 찾는다(원문 비교 없음).
- 끊긴 시간: 세션마다 `seenAt`을 두고, 그 세션의 WebSocket이 열려 있으면(api.clients에서 찾음) 확인할 때마다, 그리고 15초마다 돌리는 정리에서 새로 한다. `backend.mjs`의 onOpen·onClose는 고치지 않았다(P58과 겹치지 않게). 그래서 끊긴 시각은 최대 15초 빨리 잡힌다.
- 수명 설정은 `remoteSessionHours`(기본 12, 1~168), `remoteIdleMinutes`(기본 30, 5~1440)다. 이름이 `remote*`라 P49의 규칙대로 웹 화면에서는 바꾸지 못한다. 줄이면 이미 있는 세션에도 곧바로 걸린다.
- 세션이 끝나면 15초마다 도는 정리가 연결을 4401('session ended')로 닫는다. 화면은 P49의 흐름 그대로 `backend()`가 401을 보고 페이지를 다시 연다. 다시 연 페이지(`webGate`)는 기억한 credential ID로 `login/options`를 먼저 물어, 짝이 풀렸으면(`unpaired`) 짝 맺기 화면으로, 아니면 다시 확인 화면으로 간다.
- 옛 기기(hash만 있는 기록)는 `needsRepair: true`로 보인다. 옛 토큰으로 패스키를 등록하는 길은 없다. 웹 화면은 처음 뜰 때 localStorage의 `atrium.deviceToken`을 지운다.
- 다른 단계가 짝 맺기에서 더하는 기기 필드는 허가의 `extra`로 받아 기기 기록에 그대로 넣게 해 두었다(P57의 `tsNode` 자리).
- 창 시험의 세션 만료를 보려고 개발용 판에서만 읽는 `ATRIUM_WEB_SESSION_TEST_SEC`를 두었다(`cfg.profile === 'dev'`일 때만). 실제 판은 읽지 않는다.
- `backend/tools/ts-sim-proxy.mjs`에 `keepOrigin`을 더했다. 패스키의 `clientDataJSON.origin`은 브라우저 주소라서, 흉내 프록시가 Origin을 `https://<이름>`으로 바꾸면 맞지 않는다.

진행:
- 백엔드 단위 시험 `backend/test/p56.test.mjs`(12개)와 가짜 인증기 `backend/test/fake-authenticator.mjs`. P48·P49 시험의 토큰 짝 맺기를 패스키 등록으로 바꿨다.
- 창: `app/src/renderer/lib/passkey.js`, `Pair.jsx`(짝 맺기 → 패스키 만들기 → 다시 확인, 쓸 수 없는 페이지), `web.js`(토큰 없음, 쿠키), `WebDevices.jsx`(다시 짝 맺기 필요, 로그인 수, 수명 설정, 웹의 로그아웃), 사전 두 개. 창 단위 시험 `app/test/p56-lib.test.mjs`.
- 창 시험 `app/test/e2e/p56-passkey.mjs`. 흉내 프록시는 47895에 띄웠다. 47878에 다른 작업자의 연결 흔적(TIME_WAIT)이 있어 47811~47877 밖에서 고른 값이다.

- 창 시험 첫 실행은 20/21이었다. 실패는 시험의 잘못이었다. 쿠키의 Max-Age가 세션 수명과 같아 만료 뒤에는 브라우저가 쿠키를 이미 버렸고, 시험은 만료 뒤에 쿠키를 읽으려 했다. 값을 만료 전에 잡아 두도록 고친 뒤 새 데이터 폴더로 다시 돌려 23/23이 통과했다.

## 보고

만든 것:
- 짝 맺기 → 패스키 등록. 코드나 PC 허락에 성공하면 기기 토큰 대신 5분짜리 일회용 등록 허가(`grant`)를 준다. 같은 출처에서 `POST /web/passkey/register/options`·`/web/passkey/register`로 패스키를 등록해야 기기가 생긴다. 선택 사항: RP ID는 페이지 호스트 이름, `userVerification: 'required'`, `attestation: 'none'`, ES256(-7)·RS256(-257), `hints: ['client-device', 'security-key']`(인증기 종류는 묶지 않음), `residentKey: 'preferred'`. 기기 기록의 `passkey`에 credential ID, 공개 키(JWK), 알고리즘, signCount, RP ID, 사용자 핸들을 둔다.
- 로그인. `POST /web/passkey/login/options`(일회용 2분 챌린지)와 `/web/passkey/login`. 챌린지(한 번, 수명, 받은 출처), clientDataJSON의 type·origin(요청 Origin과 같아야 하고 그 Origin은 허용 Host여야 함), crossOrigin, rpIdHash, UP·UV, signCount, 사용자 핸들, 서명을 모두 본다. 기억한 credential ID가 모르는 것이면 `unpaired`를 돌려준다.
- 세션(S3). 32바이트 무작위 ID를 `HttpOnly; SameSite=Strict; Path=/; Max-Age` 쿠키로 주고, https 출처면 `Secure`와 `__Host-` 접두어를 붙인다. 판 기록에는 해시만 둔다. WebSocket `/api`, `/web/me`, `/web/upload`는 쿠키로만 인증한다. `?device=`와 `Authorization: Bearer`는 없앴다. Origin 검사와 P49의 Tailscale 사용자 검사는 그대로다. 수명은 로그인 뒤 12시간, 연결이 모두 끊긴 채 30분이다. 판 설정 `remoteSessionHours`·`remoteIdleMinutes`(연결된 기기 탭, 이 PC에서만)로 바꾼다. 끝난 세션의 연결은 15초 안에 4401로 닫힌다. 짝을 풀면 그 기기의 세션이 모두 끝나고 연결이 곧바로 닫힌다. `POST /web/logout`과 웹 화면의 "이 브라우저에서 로그아웃"을 더했다.
- 화면. 짝 맺기 → "패스키 만들기"(남은 시간 표시) → 보드. 세션이 끝나면 "다시 확인" 화면에서 패스키로 확인한다. 짝이 풀렸으면 짝 맺기 화면으로 가고 그 까닭을 보인다. 이 브라우저에 패스키가 이미 있으면 짝 맺기 화면에서 그것으로 확인할 수 있다. 보안 출처가 아님, WebAuthn 없음, IP 주소로 연 페이지는 이유를 보이고 막는다(IP면 localhost 주소를 걸어 준다). 브라우저에 두는 것은 `atrium.passkey`(credential ID, 기기 ID, 이름)뿐이다. 옛 `atrium.deviceToken`은 지운다.
- 옛 기기. 토큰 기기는 연결하지 못하고, PC 창 목록과 `atrium devices`에 "다시 짝 맺기 필요"로 보이며 지울 수 있다. 옛 토큰으로 패스키를 등록하는 길은 없다.
- PC 창(Electron)과 CLI의 판 API 토큰은 그대로다.
- README 두 파일의 "원격 접속(Tailscale)" 절에 패스키 단계, 다시 확인, 세션 수명, 보안 주의(토큰 없음, HttpOnly 쿠키, 끊으면 세션 끝, 옛 기기)를 넣었다.
- 시험. 백엔드 `backend/test/p56.test.mjs` 12개(가짜 인증기 `backend/test/fake-authenticator.mjs`, ES256·RS256), 창 `app/test/p56-lib.test.mjs` 7개, 창 시험 `app/test/e2e/p56-passkey.mjs` 23/23(결과 `experiments/p56/`, 첫 실행은 `experiments/p56/run1/`). `cd backend && npm test` 421/421, `cd app && npm test` 192/192, `npm run build` 통과.
  - 거부 시험: 챌린지 재사용, 만료된 챌린지, 다른 출처에서 받은 챌린지, origin 틀림(다른 포트 포함), rpId 틀림, UV 없음, UP 없음, type 틀림, 다른 기기의 키로 서명, 다른 기기의 credential, 서명 바이트 바꿈, 사용자 핸들 틀림, signCount 되돌림(같음, 작음, 0으로), 모르는 알고리즘, 모양 틀린 CBOR, 옛 토큰(Bearer, `?device=`), 쿠키 없음, 다른 출처, 만료 세션(12시간, 설정한 1시간), 끊긴 뒤 31분(설정한 5분), 짝 푼 기기의 세션, 같은 패스키 두 번 등록, 다 쓴 허가, 만료된 허가, 다른 출처의 허가, IP 주소 RP. 쿠키 속성(http와 https).
  - 창 시험의 보안 출처: `http://pc.example.ts.net:47895`(흉내 프록시)는 Chromium 플래그 `--unsafely-treat-insecure-origin-as-secure=<그 주소>`와 `--host-resolver-rules=MAP pc.example.ts.net 127.0.0.1`로 맞췄다. 자체 서명 https는 쓰지 않았다. 인증기는 CDP 가상 인증기(ctap2, internal, `hasUserVerification`·`isUserVerified`)다. 흐름: 코드로 짝 맺기 → 패스키 등록 → 셸 터미널에 치기 → 새로 고침(세션 그대로, 묻지 않음) → 쿠키를 지우고 새로 고침 뒤 다시 확인 → 세션 만료(시험 수명 150초) 뒤 저절로 다시 확인 화면 → 다시 확인 → PC에서 짝 풀기 → 짝 맺기 화면, HTTP·WebSocket·패스키 로그인 모두 거부. `document.cookie`는 빈 글이었고 localStorage는 `mt.clientId`와 `atrium.passkey`뿐, sessionStorage는 비어 있었다. 다른 Tailscale 사용자의 로그인 요청 403, 플래그 없는 브라우저는 "보안 출처 아님"으로 막혔다.
- 정리. 시험 세션, 창, 브라우저, 백엔드, herdr 서버와 세션 `atrium-dev-p56`, 시험 폴더를 끄고 지웠다. 실제 판, 기본 herdr 세션, 다른 판, Tailscale 설정은 건드리지 않았다. tailscale 명령은 부르지 않았다(가짜 tailscale만).

계획과 다른 곳:
- 의존성을 더하지 않고 `node:crypto`로 했다(이유는 작업 기록). attestation 문은 읽지 않는다.
- 지시의 흐름 "새로 고침 후 다시 확인"은 두 가지로 봤다. 새로 고침만으로는 세션이 남아 묻지 않는다(12시간·30분 규칙에 맞음). 쿠키를 지운 뒤 새로 고침하면 다시 확인 화면이 나온다.
- 세션 만료를 창 시험에서 보려고 개발용 판에서만 읽는 `ATRIUM_WEB_SESSION_TEST_SEC`를 더했다.
- 웹 화면 주소 표시(`web.status`의 url)를 `http://127.0.0.1:<포트>/`에서 `http://localhost:<포트>/`로 바꿨다. 패스키는 IP 주소에서 쓸 수 없다.
- `backend/tools/ts-sim-proxy.mjs`에 `keepOrigin`을 더했다. 그리고 `atrium devices` 목록 줄에 "다시 짝 맺기 필요"와 로그인 수를 더했다.
- 흉내 프록시 포트는 47895다. 지시에 없는 값이지만, 다른 작업자 범위(47811~47877) 밖이다.

알려진 문제:
- 끊긴 시간은 15초 정리로 잡으므로, 끊긴 시각이 최대 15초 빨리 잡힌다. 정확히 하려면 `backend.mjs`의 onClose에서 `web`에 알려야 한다(P58과 겹쳐 고치지 않았다).
- `device.revoke`와 `device.rename`은 전부터 기기 클라이언트도 부를 수 있다(웹 화면에서 다른 기기를 끊을 수 있다). 이 작업에서는 바꾸지 않았다.
- 같은 브라우저라도 다른 주소(localhost와 Tailscale 이름)로 열면 RP ID가 달라 기기가 따로 생긴다.
- 실제 Windows Hello와 노트북의 진짜 `tailscale serve`(https)로는 시험하지 않았다. 사용자 점검이 필요하다. 짝 풀기 뒤 노트북에 남는 패스키는 판에서 지울 수 없으므로 Windows 설정에서 지운다.
- 합칠 때: P57은 `Pairing.redeem/decide`에서 기기를 만들던 자리에 `tsNode`를 넣는다. 이 작업에서는 그 자리가 `grants.issue`이므로, `extra: { tsNode }`로 넘기면 등록 때 기기 기록에 들어간다. `authorize`의 "자격 확인 다음 기기 확인"은 세션 확인 블록(`sessions.check` 다음 줄)에 이으면 된다. P58의 `device.disconnect`는 `closeSession`과 `auth.sessions.endDevice`를 부르면 된다.

살아 있는 문서에서 고칠 곳(짧게):
- ARCH: 원격 인증이 기기 토큰에서 패스키와 HttpOnly 세션 쿠키로 바뀐 것, `/web/passkey/*`·`/web/logout` 경로, 모듈 `passkey.mjs`·`web-auth.mjs`, 판 기록 `webSessions`, 설정 `remoteSessionHours`·`remoteIdleMinutes`.
- BRIEF "정한 것": 원격 기기 자격이 패스키와 12시간·30분 세션이라는 행.
- testing: 패스키 창 시험의 Chromium 플래그와 CDP 가상 인증기, `ATRIUM_WEB_SESSION_TEST_SEC`, 흉내 프록시 `keepOrigin`.
