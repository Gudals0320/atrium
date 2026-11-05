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

2026-11-05, P57 작업자 세션(워크트리 `worktree-p57`).

### 근거 다시 확인(tailscale/tailscale `main`, 2026-11-05에 읽음)

- `ipn/ipnlocal/serve.go`, `reverseProxy.ServeHTTP`: `httputil.ReverseProxy{Rewrite: ...}`를 쓰고, Rewrite 안에서 `addProxyForwardedHeaders(r)`와 `rp.lb.addTailscaleIdentityHeaders(r)`를 부른다. Director나 `SetXForwarded`는 없다.
- 같은 파일 `addProxyForwardedHeaders`: `X-Forwarded-Host`, `X-Forwarded-Proto`(TLS일 때), `X-Forwarded-For`를 모두 `Header.Set`으로 넣는다. `X-Forwarded-For` 값은 `c.SrcAddr.Addr().String()`(요청한 쪽 주소, 포트 없음)이다. serve 문맥(`serveHTTPContextKey`)이 있을 때만 넣는다.
- 같은 파일 `LocalBackend.addTailscaleIdentityHeaders`: 먼저 `delHeaderVariants`로 `Tailscale-User-Login`·`-Name`·`-Profile-Pic`·`Tailscale-Funnel-Request`·`Tailscale-Headers-Info`를 지운다(대소문자, `_`↔`-` 변형까지). 그 뒤 `b.WhoIs("tcp", c.SrcAddr)`로 채운다. funnel 요청, tailnet 밖, 태그 기기(`node.IsTagged()`)는 사용자 머리글을 넣지 않는다.
- `client/tailscale/apitype/apitype.go`, `WhoIsResponse`: `Node *tailcfg.Node`, `UserProfile *tailcfg.UserProfile`, `CapMap`. JSON 태그가 없어 키는 `Node`, `UserProfile`, `CapMap`이다.
- `tailcfg/tailcfg.go`, `Node`: `ID`(int64), `StableID`(문자열), `Name`(MagicDNS 이름, 끝에 점), `Tags`(비면 빠짐), `Addresses`, `ComputedName`. 판은 `StableID`를 기기 ID로 쓴다.
- 결론: 지휘 세션의 근거와 같다. 루프백에서 온 serve 요청의 `X-Forwarded-For`(한 값)와 `Tailscale-User-Login`은 믿는다.

### 설계

- `tailscale.mjs`: `isTailnetAddr`(100.64.0.0/10, fd7a:115c:a1e0::/48만, 앞 0·포트·영역·v4 섞인 v6 거부), `requestAddr`(루프백 소켓의 `X-Forwarded-For` 한 값만), `parseWhois`, `WhoisCache`(성공 60초, 실패 5초, 동시 요청 하나로, 256개 상한), 순수 함수 `whoisMatch`(whois 로그인 = 머리글 로그인)와 `nodeCheck(req, device, whois, port)`, `needsRepair`. `runTailscale`의 읽기 목록에 `whois --json <tailnet 주소>`를 더했다.
- `web.mjs`: 기기 기록에 `origin`(`tailscale`|`local`)과 `tsNode { id, name, login }`. 메서드 셋(`whoisOf`, `checkNode`, `pairNode`)을 더하고, `authorize`·`handleHttp`·`Pairing`은 몇 줄만 바꿨다. 순서는 "자격 확인(기기 토큰) → 기기 확인(`checkNode`)"이다.
- `authorize`는 바깥 기기 연결에서만 약속을 돌려준다(whois가 비동기). `ApiServer.handleUpgrade`가 약속이면 기다린다. 이 PC 안 연결은 예전처럼 바로 돌려준다.
- 허락 짝 맺기: 요청을 보낸 노드를 요청에 두고, 토큰을 받는 `poll`도 같은 노드에서만 준다(이 PC 안 요청은 이 PC 안에서만).
- 실패 응답: 묶인 기기와 다르면(`other_node`, `other_user`, `local_only`, `not_bound`) 401이다. 웹 화면은 401이면 토큰을 버리고 짝 맺기 화면으로 간다. whois를 못 읽거나 로그인이 맞지 않으면 403이다(토큰은 남는다. Tailscale이 잠깐 꺼진 경우).

### 진행

- 이 PC의 실제 `tailscale status --json`, `tailscale whois --json <이 PC 자신의 주소>`(v4, v6)를 읽기만 했다. 출력과 비교는 `experiments/p57/`에만 둔다(`real-*.json`, `real-vs-fake.json`, `real-lookup.json`).
- 가짜 tailscale(`p49-fake-tailscale.mjs`)에 whois를 더했다(주소 넷: 노트북 A·B, 다른 사용자, 태그 기기). 실제 출력과 견주니 판이 쓰는 키(`Node.StableID`, `Node.Name`, `Node.ComputedName`, `Node.Tags`, `UserProfile.LoginName`)가 양쪽에 같은 형식으로 있고, 가짜에만 있는 키는 없다.
- P49 단위 시험의 가짜 runner에 whois를 더했다. 허용 목록 사용자 시험은 "다른 사용자도 자기 기기로 짝 맺고 쓴다, 남의 기기 토큰은 못 쓴다"로 바꿨다.
- 셸의 heredoc과 `export`가 워크트리 막이에 걸려, 편집은 scratchpad의 작은 node 스크립트로 했다(파일은 CRLF 그대로).

## 보고

### 만든 것

- **기기 확인(whois)**(`backend/src/tailscale.mjs`): 바깥 요청(Tailscale 이름 Host, `Tailscale-*`, `X-Forwarded-*`)은 `tailscale whois --json <X-Forwarded-For>`로 요청한 기기(노드 StableID, 이름, 로그인, 태그)를 읽고 주소마다 60초 기억한다. 주소는 tailnet 형식만 받고(쉼표 여럿, 빈 값, 포트, 범위 밖은 whois를 부르지 않고 거부), whois 로그인과 `Tailscale-User-Login`이 다르면, whois가 실패하면(꺼짐, 시간 초과, 모르는 주소, `ATRIUM_TAILSCALE=none`) 거부한다.
- **짝 맺을 때 묶기**(`web.mjs` `Devices.add`, `Pairing`): 바깥에서 짝 맺으면(코드, 허락 둘 다) 기기 기록에 `origin: 'tailscale'`, `tsNode: { id, name, login }`, 이 PC 안이면 `origin: 'local'`. 허락 요청의 토큰은 요청을 보낸 노드에서만 받는다. 기기 기록의 모르는 필드는 그대로 둔다(시험함).
- **연결마다 확인**: WebSocket(`authorize`)과 HTTP(`/web/me`, `/web/upload`)는 지금 요청한 노드가 `tsNode.id`와 같을 때만 받는다(시간이 일정한 비교). 이 PC 안에서 짝 맺은 기기와 `tsNode`가 없는 옛 기기는 바깥에서 거부한다. 거부하면 `web <경로|connect> refused: tailscale node <까닭> (device <기기 ID>)`를 로그에 남긴다(토큰, 주소는 남기지 않는다).
- **화면**(`WebDevices.jsx`): 허락 카드와 연결된 기기 목록에 Tailscale 기기 이름을 크게, 브라우저가 보낸 이름은 "브라우저 이름: …"으로 작게 보인다(카드에는 Tailscale 사용자도). 이 PC 안 기기는 "이 PC 안에서만", 옛 기기는 "다시 짝 맺기 필요"(주의 색)로 보인다.
- **진단**: `remote.status`와 `atrium remote status`에 `nodes` 줄("짝 맺은 기기는 Tailscale 기기에 묶임")을 더했다. 묶이지 않은 옛 기기가 있으면 [주의]와 그 수, 백엔드 없이 읽으면 [-].
- **시험**: `backend/test/p57.test.mjs` 10개(whois 해석, 주소 형식, 읽기 명령 막이, 기억과 만료, 순수 기기 확인, 진단 줄, serve 흉내 HTTP·WebSocket 셋, Tailscale 읽기 끔). `app/test/e2e/p57-node.mjs`(개발용 판 창 시험 9개 확인). `cd backend && npm test` 419 통과, `cd app && npm test` 185 통과, `npm run build` 통과.

### 개발용 판 결과(experiments/p57)

| 항목 | 결과 |
|---|---|
| 허락 카드 | "laptop-a asks to connect" 크게, "browser name: Chrome on laptop · Tailscale user me@example.com" 작게 |
| 노트북 A 사용 | 허락 뒤 보드가 열리고 API를 쓴다. 기록의 `tsNode.name`은 laptop-a |
| 같은 토큰을 노트북 B 주소로 | `/web/me` 401(`tailscale_node`), WebSocket 거부, 브라우저는 짝 맺기 화면으로 가고 토큰을 버림 |
| 노트북 A로 돌아가면 | 200(기억한 whois 결과로) |
| 기기 목록·진단 | "laptop-a" 크게, 별칭 작게. 진단 `nodes` [ok], `atrium remote status`에 묶임 줄 |
| 실제 whois(이 PC 자신의 v4·v6 주소, 읽기만) | 둘 다 해석되고 노드 ID 형식, 로그인이 이 PC의 로그인과 같음. 처음 약 31ms, 기억한 뒤 0ms. 없는 주소는 `whois_failed` |

### 계획과 다른 곳

- 흉내 프록시는 47976 포트에서 띄웠다. 지시의 47811~47877에는 이 판의 포트(47876)만 있어서, 범위 밖 포트를 썼다(127.0.0.1에서만).
- 화면 파일(`GET /`, `/renderer.js` 등)에는 whois를 하지 않는다. 공개 저장소의 것과 같은 파일이고, P48부터 포트에 닿는 누구에게나 보였다. `/web/*`와 WebSocket은 모두 확인한다.
- `ATRIUM_WEB_HOSTS`로 Tailscale이 아닌 앞단을 쓰면, 그 요청은 tailnet 주소가 없어 바깥 기기 요청이 모두 거부된다(막는 쪽이 기본).
- 남의 파일을 작게 고쳤다: `api.mjs`(`handleUpgrade`가 약속을 기다림, `_upgrade`로 나눔), `atrium-remote.mjs`(`nodes` 줄 글), `locales/en.js`·`ko.js`, `styles.css`, `p49-fake-tailscale.mjs`(whois, 불러 쓸 때 출력 없음), `p49.test.mjs`(runner에 whois, 허용 목록 시험).

### 알려진 문제와 위험

- 옛 기기(이 작업 전에 바깥에서 짝 맺은 기기)는 바깥에서 막히고, 웹 화면은 401을 받아 짝 맺기 화면으로 간다. 사용자는 노트북에서 한 번 다시 짝 맺어야 한다. 옛 기기 기록은 이 PC 안에서 짝 맺었는지 알 수 없어 모두 "다시 짝 맺기 필요"로 보인다(이 PC 안에서는 그대로 쓴다).
- whois 결과는 60초 기억한다. 그 사이에 tailnet 주소가 다른 노드로 넘어가면(드묾) 최대 60초 동안 옛 노드로 판단한다. 실패는 5초 기억한다.
- whois가 실패하면 바깥의 모든 기기가 403이다(Tailscale이 꺼지면 serve도 꺼지므로 실제로는 함께 일어난다).
- 로그인 이름에 ASCII가 아닌 글자가 있으면 serve가 머리글을 인코딩해(`encTailscaleHeaderValue`) whois 로그인과 맞지 않아 거부한다. P49의 사용자 제한도 같다.
- P56과 합칠 때: 자격 확인(지금은 `Devices.verify`)이 세션으로 바뀌면, 그 다음 줄에서 `checkNode(req, device, what)`(HTTP)와 `authorize`의 `accept`/`checkNode` 줄만 잇는다. 기기 기록의 `origin`, `tsNode`는 짝 맺을 때 `Devices.add`가 넣는다.

### ARCH·BRIEF·testing에 고칠 문장

- BRIEF "정한 것" 원격 행 끝: "짝 맺은 기기는 짝 맺을 때 확인한 Tailscale 기기(whois 노드)에 묶이고, 바깥에서는 그 기기에서만 쓴다(2026-11-05, P57)."
- ARCH 1절 연결 규칙: "바깥 기기 요청은 `tailscale whois`로 요청한 노드를 확인해 기기 기록의 `tsNode`와 같을 때만 받는다. 이 PC 안에서 짝 맺은 기기는 이 PC 안에서만."
- ARCH 5절 `tailscale.mjs` 행: "…, whois 기기 확인(주소마다 기억)"을 더한다.
- testing.md: "가짜 tailscale(`p49-fake-tailscale.mjs`)은 whois도 낸다(100.64.0.2·3 노트북 A·B, 4 다른 사용자, 9 태그 기기). 흉내 프록시의 `cfg.ip`로 요청한 기기 주소를 바꾼다."
