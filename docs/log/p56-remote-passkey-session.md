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

## 보고
