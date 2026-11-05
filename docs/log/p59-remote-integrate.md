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

2026-11-05, P59 작업자 세션(워크트리 `worktree-p59`).

합치기:
- `worktree-p56` → `worktree-p57` → `worktree-p58` 차례로 `git merge --no-ff`. P56은 충돌 없음. P57은 `web.mjs`, `WebDevices.jsx`, 두 사전, `p49.test.mjs`. P58은 `web.mjs`, `web.js`, `Pair.jsx`, `WebDevices.jsx`, `lib/reconnect.js`. 합칠 때마다 단위 시험을 고쳐 통과시킨 뒤 커밋했다(합치기 커밋 셋, 뒤이은 커밋 하나).

이은 방식:
- 짝 맺기: `Pairing.redeem/decide`는 `grants.issue({ ..., extra: nodeRecord(tsNode) })`. 허락 요청은 `origin`과 `tsNode`를 함께 둔다. `poll`은 `sameNode`로 거른다.
- 등록: `WebAuth.registerOptions/register`에 `allow(g)`를 더했다. web.mjs는 `sameNode(g.extra.tsNode, 지금 요청한 기기)`를 넘긴다. 다른 곳에서 쓴 허가는 버린다(`grant_node`, 막는 쪽).
- 로그인: `/web/passkey/login/options`·`/web/passkey/login`은 먼저 `pairNode`(whois와 로그인 머리글). `WebAuth.login`에 `check(device)`를 더해, 서명 확인 다음·세션 만들기 전에 `nodeCheck`를 부른다. 던지면 세션도 쿠키도 없다. 다시 짝 맺어야 하는 기기(`needsRepair`)도 여기서 막는다.
- 세션을 쓰는 곳: `authorize`는 원격 받기 → Host → Origin → Tailscale 로그인 → 세션 → Tailscale 기기 차례. 바깥 연결은 whois를 기다리는 약속을 돌려주고, 기다린 뒤 원격 받기와 세션을 한 번 더 본다. `/web/me`·`/web/upload`는 `sessionOf` 다음 `checkNode`.
- `devicePub`의 `needsRepair` = 패스키 없음 또는 P57의 묶이지 않음. `sessionOf`는 그런 기기의 세션이면 `login_required`가 아니라 `tailscale_node`(`not_bound`) 401을 준다(다시 확인 ↔ 거부 고리를 막으려고).
- 기록: `nodeErr`에 `reason`, `sessionOf`의 401에 `logReason`(`no_session`, `no_credentials`, `device_token`)을 달았다. `handleHttp`의 catch 한 곳에서 `reasonOf`로 남긴다. 짝 맺기·등록은 `pair.fail`, 나머지는 `deny`. 새 일 `pair.grant`(등록 허가), `login`, `logout`. 새 필드 `node`(Tailscale 기기 이름). `pair.ok`와 붙음 알림 `paired`는 패스키 등록을 마칠 때 난다.
- 끊기: 생성자에서 `onDisconnectDevice(({ id }) => auth.sessions.endDevice(id))`. 원격 받기를 끄면 `WebSessions.endAll()`. `clientClosed`가 `sessions.touch(c.auth.session)`로 끊긴 시각을 닫힌 때로 남긴다.
- 기기가 부를 수 있는 것: 웹 화면이 다른 기기 목록을 쓰는 곳은 설정 › 연결된 기기 탭뿐이었다(목록과 각 줄의 "짝 풀기"). `device.revoke`·`rename`은 `localOnly`, `device.list`와 기기에 가는 `device.updated`는 자기 기록만, 웹 화면의 짝 풀기는 새 `device.forget`(자기만). `device.forget`은 답을 보낸 뒤에 푼다(푸는 일이 그 연결을 닫아, 답이 가지 않고 시험이 멈췄다).
- 웹 화면: `webMe`가 401의 까닭을 `webDenied`에 둔다. `webGate`는 `tailscale_node`면 기억한 패스키를 지우고 짝 맺기 화면에 까닭을 보인다. 다시 확인 화면의 로그인이 `tailscale_node` 401이면 짝 맺기 화면으로 간다. 403 `remote_blocked`는 막음 화면, 그 밖의 403은 연결 오류(백오프)다.

시험:
- 단위: P57·P58 시험을 가짜 인증기(`fake-authenticator.mjs`)로 바꿨다. P48·P56 시험의 기기 기록과 허가에는 `origin: 'local'`을 넣고, P56의 https 시험은 serve 흉내(가짜 whois)를 거치게 했다. P57 기준으로 이 PC 밖 Host의 기기 요청은 tailnet 주소가 있어야 하기 때문이다. 새 `backend/test/p59.test.mjs` 3개, `app/test/p59-lib.test.mjs` 3개.
- 창: `app/test/e2e/p59-lib.mjs`(흉내 프록시 keepOrigin, 노트북마다 브라우저 문맥과 CDP 가상 인증기, 보안 출처 플래그를 쉼표로 여럿), `p59-remote.mjs`(전체 흐름). P57·P58 창 시험도 패스키로 바꾸고 판 값을 `MT_E2E_HERDR_SESSION`·`MT_E2E_PORT`·`MT_E2E_SIM_PORT`·`MT_E2E_SIM2_PORT`로 덮게 해 내 판에서 돌렸다.
- 첫 창 시험은 13/14였다. 노트북 A 페이지를 닫았다 새로 열었는데, CDP 가상 인증기는 그 페이지에 붙어 있어 함께 사라졌다. 페이지를 닫지 않고 `about:blank`로 떠났다 돌아오게 고친 뒤 21/21.
- 실수 하나: 시험 로그 하나를 워크트리 밖(`.claude/` 아래)에 썼다가 곧바로 지웠다. 그 뒤로는 scratchpad에만 썼다.

## 보고

### 만든 것

- **합치기**: `worktree-p56`·`p57`·`p58`을 차례로 합쳤다. 어느 쪽 기능도 버리지 않았다. 세 브랜치는 바꾸지 않았다.
- **짝 맺기와 Tailscale 기기(P56+P57)**: 짝 맺기(코드, 허락)는 등록 허가를 주고, 허가의 `extra`에 `nodeRecord(tsNode)`(`origin`, `tsNode`)가 들어가 패스키 등록 때 기기 기록에 남는다. 허락 요청은 `origin`과 `tsNode`를 함께 두고 `poll`은 요청을 보낸 곳에서만 허가를 내준다. 패스키 등록(`register/options`, `register`)은 허가를 받은 곳(같은 Tailscale 기기, 또는 이 PC 안끼리)에서만 된다. 다른 곳에서 쓰면 403 `grant_node`이고 그 허가는 버린다.
- **로그인과 세션(P56+P57)**: 바깥의 패스키 로그인은 whois가 맞아야 한다. 서명을 확인한 기기가 지금 요청한 Tailscale 기기에 묶여 있지 않으면 401 `tailscale_node`이고 세션을 만들지 않는다(쿠키 없음, 판 기록의 세션 수 그대로). WebSocket `authorize`, `/web/me`, `/web/upload`는 원격 받기 → Host·Origin → Tailscale 로그인 → 세션 → Tailscale 기기 차례로 본다.
- **기록과 끊기(P58+P56+P57)**: 거부는 모두 까닭 코드로 연결 기록에 남는다. 새 까닭: `no_session`, `no_credentials`, `device_token`, `passkey:<코드>`, `bad_grant`, `grant_node`, `bad_origin`, `tailscale_node:<까닭>`. 새 일: `pair.grant`, `login`, `logout`. `connect`·`disconnect`·`pair.ok`·`unpair` 줄에 Tailscale 기기 이름(`node`). 끊기(`device.disconnect`)는 그 기기의 세션도 끝낸다. 원격 받기를 끄면 모든 기기 세션이 끝난다. 끊긴 시각은 `clientClosed`에서 닫힌 때로 남는다(P56의 "최대 15초 빨리 잡힘" 고침). 설정 탭과 `atrium remote log`가 새 일, 까닭 글, Tailscale 기기 이름을 보인다.
- **기기가 부를 수 있는 것**: `device.revoke`·`device.rename`은 이 PC만(기기는 `forbidden`). `device.list`와 기기에 가는 `device.updated`는 자기 기록만. 웹 화면의 "짝 풀기"는 새 `device.forget`(자기만, 넘긴 id는 보지 않음).
- **웹 화면**: 세션 끝(`login_required`, 4401)과 PC에서 끊음(4402)은 다시 확인. 짝 풀림은 짝 맺기 화면. 묶인 기기와 다름(`tailscale_node` 401: `other_node`, `other_user`, `local_only`, `not_bound`)은 짝 맺기 화면과 그 까닭(기억한 패스키를 지움). 원격 막음(403 `remote_blocked`, 4403)은 막음 화면. whois를 잠깐 못 읽는 403은 연결 오류로 다시 시도한다. 같은 까닭으로 다시 확인과 실패를 되풀이하는 길은 없다(다시 짝 맺어야 하는 기기의 세션·로그인은 `tailscale_node` 401로 짝 맺기 화면으로 간다).
- **README** 두 파일의 원격 접속 절: 짝 맺은 브라우저는 그 Tailscale 기기에서만, 끊기와 짝 풀기는 세션을 끝냄, 브라우저는 자기 짝만 풂, PC에서 보고 끊고 막는 법(알림, 알약, 원격 받기·트레이·`atrium remote block|allow|log`).

### 시험 결과

- `cd backend && npm test` 442/442, `cd app && npm test` 199/199, `cd app && npm run build` 통과. 공개 검사(`check-public --tree HEAD`) 통과.
- 완료 기준의 더한 단위 시험: 노트북 A의 허가로 B에서 등록하면 거부(`p57` 첫 시험), A의 패스키 서명을 B 주소로 보내면 세션을 만들지 않음(`p57`), A의 세션 쿠키를 B 주소로 보내면 거부(`p57`), 끊기 뒤 세션이 끝남(`p58` 끊기 시험), 원격 받기를 끄면 세션이 끝남(`p58` 원격 받기 시험), 기기가 `device.revoke`·`rename`을 부르면 `forbidden`(`p59`), 거부가 까닭 코드와 함께 기록됨(`p59`), 끊긴 시각이 닫힌 때(`p59`).
- 창 시험(개발용 판 `atrium-dev-p59`, 47879, 흉내 프록시 47880=노트북 A·47881=노트북 B, 가짜 tailscale): `p59-remote.mjs` 21/21. 흐름은 지시대로다. 연결 기록은 `pair.grant → pair.ok → connect(node laptop-a) → pair.request → pair.fail:denied → … → deny:tailscale_node:other_node → kick → disconnect:pc → login → connect → remote.block → disconnect:blocked → deny:remote_blocked → remote.allow → login → connect → unpair → disconnect:revoked` 차례로 남았다. `document.cookie`는 빈 글, localStorage는 `mt.clientId`·`atrium.passkey`(credential ID)뿐, sessionStorage는 비어 있었다. 바꾼 `p57-node.mjs` 9/9, `p58-remote.mjs` 14/14(같은 판에서). 결과와 스크린숏은 `experiments/p59/`.
- 정리: 시험 세션, 창, 브라우저, 흉내 프록시, 백엔드, herdr 서버와 세션 `atrium-dev-p59`를 끄고 지웠다. 시험 워크스페이스를 판에서 닫고 시험 폴더를 지웠다. 47879~47881을 듣는 프로세스가 없음을 확인했다. 실제 판, 기본 herdr 세션, 다른 판, Tailscale 설정은 건드리지 않았고 tailscale 명령은 부르지 않았다(가짜 tailscale만). 개발용 판 데이터(`backend/.dev`, git 밖)는 남겼다.

### 계획과 다른 곳

- 다른 곳에서 쓴 등록 허가는 거부와 함께 버린다(지시에는 거부만 있다). 허가를 가진 쪽이 A라도 다시 짝 맺어야 한다.
- 다시 짝 맺어야 하는 기기(패스키 없음, 또는 Tailscale 기기 기록 없음)의 세션은 401 `login_required`가 아니라 401 `tailscale_node`(`not_bound`)로 답한다. 다시 확인 화면으로 보내면 로그인도 막혀 고리가 되기 때문이다.
- 401 `tailscale_node` 응답에 까닭(`reason`, 비밀 아님)을 싣는다. 웹 화면이 짝 맺기 화면에 그 까닭을 보이려고.
- 연결 기록에 일 셋(`pair.grant`, `login`, `logout`)과 필드 `node`를 더했다. P58의 `pair.ok`는 이제 패스키 등록을 마칠 때다.
- P56의 창 시험(`p56-passkey.mjs`)은 다시 돌리지 않았다. 그 판(47875)에 묶여 있고 새 데이터 폴더를 전제한다. 같은 흐름은 `p59-remote.mjs`가 덮는다(세션 만료 대기만 빠짐, 만료는 단위 시험이 본다).
- P57·P58 창 시험은 기본값(그 작업자의 판과 포트)을 그대로 두고, 환경 변수로 덮어 내 판에서 돌렸다.

### 알려진 문제

- 짝 맺기 화면을 열 때마다 `/web/me`가 쿠키 없이 불려 `deny:no_credentials`가 남는다. 30초 안의 되풀이는 `count`로 합쳐진다.
- 끊기(4402) 뒤 다시 확인 화면은 "PC에서 끊었습니다" 까닭을 따로 보이지 않는다(페이지를 다시 열어 화면을 고르므로 닫힘 코드를 잃는다).
- 패스키 서명은 맞고 Tailscale 기기가 다르면 그 서명의 signCount를 저장하지 않는다. 다음 정상 로그인의 값이 더 크므로 거부되지는 않는다.
- P57의 whois 기억(60초)과 실패 기억(5초)은 그대로다. 실제 Windows Hello와 진짜 `tailscale serve`(https)로는 시험하지 않았다. 사용자 점검이 필요하다.

### 살아 있는 문서에 고칠 문장(세 작업의 제안을 합친 결과에 맞게)

- BRIEF "정한 것" 원격 행: "원격 기기의 자격은 패스키와 HttpOnly 세션 쿠키(로그인 뒤 12시간, 끊긴 채 30분)다. 짝 맺은 기기는 짝 맺을 때 확인한 Tailscale 기기(whois 노드)에 묶이고 바깥에서는 그 기기에서만 쓴다. PC에서 원격 연결을 보고(알림, 연결 기록), 끊고(알약, 세션도 끝남), 막는다(원격 받기, 모든 세션 끝남)(2026-11-05, P56~P59)."
- ARCH 원격 절(연결 규칙): "기기 연결은 원격 받기 → Host·Origin → Tailscale 로그인 → 세션(쿠키) → Tailscale 기기(whois의 노드 = 기기 기록의 `tsNode`) 차례로 본다. 이 PC 안에서 짝 맺은 기기는 이 PC 안에서만. 짝 맺기는 등록 허가를 주고 패스키 등록이 같은 곳에서 끝나야 기기가 생긴다. 끊기·짝 풀기는 그 기기의 세션을, 원격 받기 끄기는 모든 세션을 끝낸다. 원격 받기를 끄면 기기 연결, `/web/*`, 바깥 화면 요청을 거부하고 붙은 연결을 4403으로 닫는다. 판 API 토큰 연결(이 PC의 창·CLI)은 그대로."
- ARCH 모듈 표: `passkey.mjs`(WebAuthn 확인, CBOR, 챌린지), `web-auth.mjs`(등록 허가, 세션, 쿠키), `remote-log.mjs`(연결 기록 `remote-log.jsonl`, 정한 필드만, 2000개·30일, 새로 붙음 판단), `tailscale.mjs` 행에 "whois 기기 확인(주소마다 기억)".
- ARCH API 표: `POST /web/passkey/register/options`·`/register`·`/login/options`·`/login`, `POST /web/logout`, `device.disconnect { id }`·`device.revoke`·`device.rename`(이 PC만), `device.forget`(기기 자신만), `device.list`(기기에는 자기 기록만), `remote.log { limit }`(이 PC만), 이벤트 `remote.connected`·`remote.logged`(PC 창에만), `remote.status`의 `accepting`·`connected`·`nodes`. 판 기록 `webSessions`, 판 설정 `remoteSessionHours`·`remoteIdleMinutes`·`remoteAccess`.
- testing.md: 원격 창 시험은 흉내 프록시를 `keepOrigin`으로 노트북마다 하나 띄운다(`cfg.ip` = 그 노트북의 tailnet 주소). 흉내 주소는 Chromium `--unsafely-treat-insecure-origin-as-secure`(쉼표로 여럿)와 `--host-resolver-rules`로 보안 출처로 맞추고, 인증기는 CDP 가상 인증기를 쓴다. 가상 인증기는 페이지에 붙으므로 그 페이지를 닫지 않는다(`app/test/e2e/p59-lib.mjs`). 가짜 tailscale은 whois도 낸다(100.64.0.2·3 노트북 A·B, 4 다른 사용자, 9 태그 기기). `ATRIUM_WEB_SESSION_TEST_SEC`(개발용 판만)로 세션 수명을, `ATRIUM_REMOTE_QUIET_MS`로 다시 연결 알림 간격을 줄인다. Playwright가 띄운 Electron 창에서 `document.hasFocus()`는 늘 참이라 창 상태는 main에서 본다.
