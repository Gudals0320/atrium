상태: 열림
날짜: 2026-11-05

## 지시

### 목표

원격 강화 S1이다. 짝 맺은 기기를 짝 맺은 Tailscale 기기에 묶는다. 그러면 기기의 자격(토큰, 나중에는 P56의 세션)이 새어도 다른 Tailscale 기기에서는 쓸 수 없다. 지금은 Tailscale 사용자만 본다. 사용자의 말: "보안 강화 S1~S4 작업 진행해".

사용자와 정한 것(2026-11-05):
- 원격 판은 PC에 내 계정으로 셸을 여는 것과 같은 권한이다. 그러니 보안 기준은 SSH만큼이다.
- 지금 막는 문은 셋이다. tailnet 안에서만 열기(`tailscale serve`), 이 PC와 같은 Tailscale 사용자만 받기, PC에서 짝 맺기(6자리 코드나 허락).
- SSH보다 약한 곳: (1) 기기 토큰이 들고만 있으면 되는 bearer 토큰이고 브라우저 localStorage에 평문으로 있다. (2) Tailscale 사용자만 보고 기기는 보지 않는다. (3) 토큰이 영구이고 다시 확인하지 않는다. (4) PC에서 원격 연결을 보고 끊기가 약하다.
- 강화안 넷을 P56~P58로 나눠 맡긴다. S1 Tailscale 기기에 묶기(P57), S2 패스키(P56), S3 세션을 스크립트가 못 읽게(P56), S4 PC에서 보이고 끊기(P58).
- 사용자는 노트북에서 `https://<pc>.<tailnet>.ts.net:10000/`으로 실제 접속을 확인했다. 공개 저장소이므로 실제 PC 이름, tailnet 이름, 로그인, IP는 어디에도 쓰지 않는다.

### 근거(지휘 세션이 확인함)

- `tailscale serve`는 요청을 넘길 때 `X-Forwarded-For`를 요청한 tailnet 주소로 덮어쓴다(`tailscale/tailscale`의 `ipn/ipnlocal/serve.go`, `addProxyForwardedHeaders`가 `Header.Set`을 쓴다).
- `Tailscale-User-Login`은 같은 파일의 `addTailscaleIdentityHeaders`가 들어온 값을 지운 뒤 다시 채운다.
- 백엔드는 `127.0.0.1`에서만 받는다. 그러므로 serve를 거친 요청의 이 두 머리글은 믿을 수 있다. 이 PC의 다른 프로세스도 머리글을 꾸밀 수 있지만, 그 프로세스는 이미 판 API 토큰을 읽을 수 있다.
- 너도 소스에서 다시 확인하고 출처(파일, 함수)를 작업 기록에 적는다.

### 할 것

1. **기기 확인(whois).** 바깥 요청(serve를 거친 요청: Tailscale 이름 Host, `Tailscale-User-Login`, `X-Forwarded-For`)이면 `tailscale whois --json <주소>`로 요청한 기기를 읽는다.
   - `tailscale.mjs`의 읽기 명령 목록에 whois를 더한다. 주소는 tailnet 주소 형식(100.64.0.0/10, fd7a:115c:a1e0::/48)만 받는다.
   - 결과(노드 StableID, 노드 이름, 로그인 이름, 태그)는 주소마다 잠깐(예: 60초) 기억한다.
   - whois의 로그인과 `Tailscale-User-Login`이 다르면 거부한다.
   - whois가 실패하면(Tailscale 꺼짐, 시간 초과, 모르는 주소) 바깥 요청을 거부한다.
2. **짝 맺을 때 묶기.** 바깥에서 짝 맺으면 확인한 Tailscale 기기(`tsNode: { id, name, login }`)를 기기 기록에 둔다.
   - PC의 허락 카드와 연결된 기기 목록에 Tailscale이 확인한 기기 이름을 크게 보인다. 브라우저가 보낸 이름은 별칭으로 작게 보인다.
   - 코드로 짝 맺을 때도 같은 기록을 남긴다.
3. **연결마다 확인.** 바깥 요청(WebSocket, HTTP)은 지금 요청한 기기가 기록의 `tsNode.id`와 같을 때만 받는다. 다르면 거부하고 까닭을 로그에 남긴다(비밀은 빼고).
   - 이 PC 안(`127.0.0.1`, `localhost`)에서 짝 맺은 기기는 Tailscale 기기가 없다. 이런 기기는 이 PC 안에서만 쓸 수 있다.
   - 기록에 `tsNode`가 없는 기기(이 작업 전에 바깥에서 짝 맺은 기기)는 바깥에서 거부한다. 기기 목록에 "다시 짝 맺기 필요"로 보인다.
4. **함수 모양.** 확인은 `tailscale.mjs`(whois 읽기, 해석)와 작은 순수 함수(예: `nodeCheck(req, device, whois)`)로 둔다. `web.mjs`의 `authorize`와 짝 맺기 처리에서는 몇 줄로 부른다. P56이 같은 때 기기 자격을 패스키와 세션으로 바꾸므로, 지휘 세션이 합칠 때 "자격 확인 다음에 기기 확인"으로 잇기 쉽게 한다.
5. `atrium remote status`와 설정의 진단에 "짝 맺은 기기는 Tailscale 기기에 묶임" 줄과, 묶이지 않은 옛 기기 수를 보인다.

### 완료 기준

1. 단위 시험을 더하고 통과한다.
   - whois JSON 해석(가짜 출력)
   - 주소 형식 검사(tailnet 밖 주소, 쉼표 여럿, 빈 값 거부)
   - 로그인 불일치 거부, 다른 노드 거부, whois 실패 시 거부, `tsNode` 없는 옛 기기 바깥 거부
   - 이 PC 안 기기의 바깥 사용 거부, 같은 노드 허용, whois 결과 기억과 만료
2. 개발용 판으로 확인하고 결과를 `experiments/p57/`(git 밖)에 둔다.
   - 가짜 tailscale에 whois를 더하고, 흉내 프록시에 기기마다 다른 `X-Forwarded-For`를 넣어 본다.
   - 흐름: 노트북 A로 짝 맺기 → 사용 → 같은 자격을 노트북 B 주소로 보내면 거부 → 허락 카드에 Tailscale 기기 이름.
   - 이 PC의 실제 `tailscale whois --json`(이 PC 자신의 tailnet 주소로, 읽기만)으로 JSON 모양이 가짜와 같은지 확인한다. 출력은 결과 폴더에만 둔다.
3. `cd backend && npm test`, `cd app && npm test`, `cd app && npm run build`가 통과한다.

### 읽을 파일

- `CLAUDE.md`, `docs/testing.md`, `docs/log/p48-remote-r2-web.md`·`p49-remote-r3-tailscale.md`의 보고 절
- `backend/src/tailscale.mjs`, `backend/src/web.mjs`(authorize, Pairing, Devices), `backend/bin/atrium-remote.mjs`
- `app/src/renderer/WebDevices.jsx`, `app/test/e2e/p49-fake-tailscale.mjs`, `app/test/e2e/p49-remote.mjs`, `backend/tools/ts-sim-proxy.mjs`, `backend/test/p49.test.mjs`

### 시험 환경

- 개발용 판이 필요하면 너만의 판으로 띄운다(`docs/testing.md`).
  - `ATRIUM_HERDR_SESSION=atrium-dev-p57`, `ATRIUM_PORT=47876`
  - `ATRIUM_DATA_DIR=<워크트리>/backend/.dev/data`, `ATRIUM_APP_USERDATA=<워크트리>/backend/.dev/app`
- 실제 판(`atrium`, 47800)과 다른 포트(47811~47877 가운데 네 것 말고)는 쓰지 않는다. 사용자의 기본 herdr 세션과 다른 판의 herdr 서버는 건드리지 않는다.
- 대화 목록은 시험 폴더의 대화만 읽는다(`ATRIUM_CLAUDE_PROJECTS`, `ATRIUM_CLAUDE_DESKTOP=none`). 시험 폴더는 `C:\Workspace\mtask-p57-*`처럼 새로 만든다.
- **이 PC의 Tailscale 설정은 바꾸지 않는다.** `tailscale serve|funnel|set|up|down`과 `atrium remote enable|disable --yes`를 실행하지 않는다. 읽기 명령(`status --json`, `serve status --json`, `whois --json`)만 부른다. Tailscale은 P49의 가짜 tailscale(`app/test/e2e/p49-fake-tailscale.mjs`)과 흉내 프록시(`backend/tools/ts-sim-proxy.mjs`)로 시험한다. 실제 Tailscale 출력은 작업 기록에 붙이지 않고 `experiments/p57/`에만 둔다.
- 끝나면 시험 세션, 창, 백엔드, herdr 서버와 세션(`atrium-dev-p57`만), 시험 폴더를 끄고 지운다.

### 지킬 것

- `CLAUDE.md`를 따른다. 프로세스는 직접 띄운 것만 PID로 끈다.
- 이 저장소는 공개다. 작업 기록, 시험 코드, 커밋 메시지에 사용자 경로·메일·토큰, 실제 PC·tailnet 이름, IP를 쓰지 않는다. 예시는 `pc.example.ts.net`, `laptop.example.ts.net`, `user@example.com`, `100.64.0.x`를 쓴다. 커밋 전·푸시 전 검사를 건너뛰지 않는다.
- 보안 코드다. 막는 쪽이 기본이다(검사 실패, 시간 초과, 모르는 값은 거부). 비밀(토큰, 세션 ID, 챌린지)은 로그와 화면에 쓰지 않는다. 비교는 시간이 일정한 비교를 쓴다.
- 같은 때 다른 작업자(P56(패스키와 세션), P58(PC에서 보이고 끊기))가 같은 원격 코드(`backend/src/web.mjs` 등)를 고친다. 맡은 일에 필요한 만큼만 고치고, 새 동작은 되도록 새 모듈이나 작은 함수로 두어 `web.mjs`의 기존 함수는 몇 줄만 바꾼다. 기기 기록(`webDevices`)에서 네가 모르는 필드는 그대로 둔다.
- 자기 브랜치에만 커밋한다. 커밋 메시지에 `Co-Authored-By` 줄을 넣지 않는다. `main`을 바꾸거나 푸시하지 않는다. `node_modules`는 워크트리 안에서 받는다(`npm ci`).
- 문서는 이 작업 파일의 작업 기록 절과 보고 절만 고친다. 고쳐야 할 ARCH·BRIEF·testing 문장이 있으면 보고 절에 짧게 적는다.
- 끝나면 보고 절을 쓰고, 맨 마지막에 `<워크트리>/backend/.dev/p57.done`(브랜치 이름과 마지막 커밋 해시 두 줄)을 만든다.

## 작업 기록

## 보고
