상태: 열림
날짜: 2026-11-05

## 지시

### 목표

원격 강화 P56·P57·P58을 한 브랜치에 합치고, 셋이 함께 맞게 동작하도록 잇는다. 사용자의 말: "보안 강화 S1~S4 작업 진행해 … worktree 터미널 워커에게 적절하게 분배".

세 작업은 따로 끝났고 시험도 각자 통과했다. 그런데 셋 다 `backend/src/web.mjs`의 같은 곳(기기 기록, 짝 맺기, `authorize`, `handleHttp`)을 크게 바꿨다.
- 지휘 세션이 시험 삼아 합쳐 보니 P56 다음 P57에서 `web.mjs`, `WebDevices.jsx`, 두 사전, `p49.test.mjs`가 충돌했다.
- P56 다음 P58에서는 `web.mjs`, `web.js`, `Pair.jsx`, `WebDevices.jsx`, `lib/reconnect.js`가 충돌했다.
- P57·P58의 시험은 옛 기기 토큰(Bearer, `?device=`)을 쓰는데, P56이 그 토큰을 없앴다.

세 작업 파일(`docs/log/p56-remote-passkey-session.md`, `p57-remote-tailscale-node.md`, `p58-remote-visibility.md`)의 보고 절, 특히 "합칠 때"를 먼저 읽는다.

### 할 것

1. **합치기.** 이 워크트리 브랜치에 `worktree-p56`, `worktree-p57`, `worktree-p58`을 이 차례로 합치고(`git merge --no-ff`) 충돌을 푼다. 어느 쪽 기능도 버리지 않는다.
2. **짝 맺기와 Tailscale 기기(P56+P57).**
   - 짝 맺기(코드, 허락)는 기기 대신 등록 허가를 준다(P56). 허가의 `extra`에 P57의 기기 기록(`nodeRecord(tsNode)`: `origin`, `tsNode`)을 넣는다. 그러면 패스키 등록 때 기기 기록에 들어간다.
   - 허락 요청은 `origin`과 `tsNode`를 함께 두고, `poll`은 요청을 보낸 곳(`sameNode`)에서만 허가를 내준다.
   - 패스키 등록(`/web/passkey/register/options`, `/web/passkey/register`)은 그 허가를 받은 곳에서만 된다. 같은 Tailscale 기기이거나, 이 PC 안이면 이 PC 안이어야 한다.
3. **로그인과 세션(P56+P57).**
   - 바깥 요청의 패스키 로그인(`/web/passkey/login/options`, `/web/passkey/login`)은 whois가 맞아야 한다.
   - 서명을 확인한 기기가 그 Tailscale 기기에 묶여 있지 않으면 세션을 만들지 않고 거부한다(세션을 만들고 나서 지우지 않는다).
   - 세션을 쓰는 모든 곳(WebSocket `authorize`, `/web/me`, `/web/upload`)은 이 차례로 확인한다: 원격 받기(P58) → Host·Origin → Tailscale 로그인(P49) → 세션(P56) → Tailscale 기기(P57). 바깥 연결의 `authorize`는 whois를 기다리는 약속을 돌려준다(P57의 `api.mjs`).
4. **기록과 끊기(P58+P56+P57).**
   - 거부는 모두 P58의 까닭 코드로 연결 기록에 남긴다. P56의 거부(세션 없음, 패스키 검증 실패의 각 코드, 허가 틀림)와 P57의 거부(`tailscale_node:<까닭>`)도 남긴다. `connect` 줄에는 Tailscale 기기 이름을 더한다.
   - P58의 "끊기"(`device.disconnect`)는 그 기기의 세션도 끝낸다. 다시 붙으려면 패스키로 다시 확인해야 한다. "짝 풀기"는 이미 그렇다(P56).
   - "원격 받기"를 끄면 모든 기기 세션도 끝낸다.
   - P56의 알려진 문제인 "끊긴 시각이 최대 15초 빨리 잡힘"은 P58의 `clientClosed`에서 세션의 끊긴 시각을 정확히 남겨 고친다.
5. **기기가 부를 수 있는 것 줄이기.** P48부터 짝 맺은 기기가 `device.revoke`와 `device.rename`을 불러 다른 기기를 끊거나 이름을 바꿀 수 있다. 이 둘을 이 PC만(`localOnly`) 부를 수 있게 한다. 웹 화면에 "이 브라우저 짝 풀기"가 필요하면 자기 자신만 풀 수 있는 길을 따로 둔다. `device.list`도 기기에게는 자기 기록만 준다. 웹 화면이 다른 기기 목록을 쓰는 곳이 있는지 먼저 본다.
6. **웹 화면.**
   - 거부 까닭에 따라 갈 화면을 맞춘다. 세션 끝(`login_required`, 4401) → 다시 확인. 짝 풀림·묶인 기기와 다름(`tailscale_node`의 401) → 짝 맺기 화면과 그 까닭. 원격 막음(403 `remote_blocked`, 4403) → 막음 화면. PC에서 끊음(4402) → 다시 확인.
   - 같은 까닭으로 다시 확인과 실패를 되풀이하는 고리가 없어야 한다.
7. **시험 고치기.** P57·P58의 단위 시험과 창 시험을 패스키 흐름으로 바꾼다. 단위 시험은 P56의 `backend/test/fake-authenticator.mjs`를, 창 시험은 CDP 가상 인증기를 쓴다. 시험의 뜻은 바꾸지 않는다.
8. **README.** P56이 고친 "원격 접속(Tailscale)" 절에 짧게 더한다: 짝 맺은 기기는 그 Tailscale 기기에서만 쓴다, PC에서 원격 연결을 보고 끊고 막는 법(알약, 원격 받기, `atrium remote block|allow|log`).

### 완료 기준

1. 세 작업의 단위 시험이 모두(고친 것 포함) 통과한다. 다음을 더한다.
   - 노트북 A의 허가로 노트북 B에서 등록하면 거부
   - A의 패스키 서명을 B 주소로 보내면 세션을 만들지 않음
   - A의 세션 쿠키를 B 주소로 보내면 거부
   - 끊기 뒤 세션이 끝남
   - 원격 받기를 끄면 세션이 끝남
   - 기기가 `device.revoke`·`device.rename`을 부르면 `forbidden`
   - 거부가 까닭 코드와 함께 기록됨
2. 개발용 판, 창(Electron), 브라우저(Playwright Chromium, CDP 가상 인증기, 흉내 프록시로 노트북 A·B)로 한 흐름을 확인한다. 결과는 `experiments/p59/`(git 밖)에 둔다.
   - 흐름: A가 코드로 짝 맺기 → 패스키 등록 → 허락 카드·목록에 Tailscale 기기 이름 → 셸에 치기 → PC 창에 붙음 알림 → A의 쿠키를 B 주소로 보내면 거부 → 알약에서 끊기 → A는 다시 확인 화면 → 다시 확인 → 원격 받기 끄기 → 막음 화면, 세션 끝 → 켜기 → 다시 확인 → 짝 풀기 → 짝 맺기 화면.
   - 그 과정이 연결 기록에 차례대로 남는다.
   - `document.cookie`와 localStorage에 비밀이 없다.
3. `cd backend && npm test`, `cd app && npm test`, `cd app && npm run build`가 통과한다.

### 읽을 파일

- `CLAUDE.md`, `docs/testing.md`
- 세 작업 파일의 작업 기록과 보고 절
- 세 브랜치의 `backend/src/web.mjs`, `backend/src/web-auth.mjs`, `backend/src/passkey.mjs`, `backend/src/tailscale.mjs`, `backend/src/remote-log.mjs`, `backend/src/api.mjs`, `backend/src/backend.mjs`
- `app/src/renderer/web.js`, `Pair.jsx`, `WebDevices.jsx`, `Peers.jsx`, `lib/reconnect.js`, `lib/passkey.js`
- 세 작업의 시험: `backend/test/p56·p57·p58.test.mjs`, `app/test/e2e/p56-passkey.mjs`, `p57-node.mjs`, `p58-remote.mjs`

### 시험 환경

- 개발용 판은 너만의 판으로 띄운다(`docs/testing.md`).
  - `ATRIUM_HERDR_SESSION=atrium-dev-p59`, `ATRIUM_PORT=47879`(흉내 프록시는 47880, 47881)
  - `ATRIUM_DATA_DIR=<워크트리>/backend/.dev/data`, `ATRIUM_APP_USERDATA=<워크트리>/backend/.dev/app`
- 실제 판(`atrium`, 47800)과 다른 판의 포트는 쓰지 않는다. 사용자의 기본 herdr 세션과 다른 판의 herdr 서버는 건드리지 않는다.
- 대화 목록은 시험 폴더의 대화만 읽는다(`ATRIUM_CLAUDE_PROJECTS`, `ATRIUM_CLAUDE_DESKTOP=none`). 시험 폴더가 필요하면 `C:\Workspace\mtask-p59-*`처럼 새로 만든다.
- **이 PC의 Tailscale 설정은 바꾸지 않는다.** `tailscale serve|funnel|set|up|down`과 `atrium remote enable|disable --yes`를 실행하지 않는다. 읽기 명령만 부른다. Tailscale은 가짜 tailscale(`app/test/e2e/p49-fake-tailscale.mjs`)과 흉내 프록시(`backend/tools/ts-sim-proxy.mjs`)로 시험한다.
- 끝나면 시험 세션, 창, 브라우저, 프록시, 백엔드, herdr 서버와 세션(`atrium-dev-p59`만), 시험 폴더를 끄고 지운다.

### 지킬 것

- `CLAUDE.md`를 따른다. 프로세스는 직접 띄운 것만 PID로 끈다.
- 이 저장소는 공개다. 작업 기록, 시험 코드, 커밋 메시지에 사용자 경로·메일·토큰, 실제 PC·tailnet 이름, IP를 쓰지 않는다. 예시는 `pc.example.ts.net`, `user@example.com`, `100.64.0.x`를 쓴다. 커밋 전·푸시 전 검사를 건너뛰지 않는다.
- 보안 코드다. 막는 쪽이 기본이다. 비밀(세션 ID, 허가, 챌린지, 코드)은 로그, 기록, 화면에 쓰지 않는다.
- 세 브랜치(`worktree-p56`, `worktree-p57`, `worktree-p58`)는 바꾸지 않는다. 이 워크트리 브랜치에서 합치고 고친다.
- 자기 브랜치에만 커밋한다. 커밋 메시지에 `Co-Authored-By` 줄을 넣지 않는다. `main`을 바꾸거나 푸시하지 않는다. `node_modules`는 워크트리 안에서 받는다(`npm ci`).
- 문서는 이 작업 파일의 작업 기록 절과 보고 절, 그리고 README 두 파일의 원격 접속 절만 고친다. 세 작업 파일의 보고 절에 있는 "살아 있는 문서에 고칠 문장"을 합친 결과에 맞게 정리해 이 파일의 보고 절에 적는다.
- 끝나면 보고 절을 쓰고, 맨 마지막에 `<워크트리>/backend/.dev/p59.done`(브랜치 이름과 마지막 커밋 해시 두 줄)을 만든다.

## 작업 기록

## 보고
