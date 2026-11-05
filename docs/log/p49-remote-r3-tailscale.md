상태: 열림
날짜: 2026-11-05

## 지시

### 목표

원격 작업의 셋째 단계다. 노트북에서 Tailscale로 이 PC의 보드를 브라우저로 쓰게 한다. 그 전에 R1(P47, 여러 클라이언트)과 R2(P48, 웹 화면)를 이 브랜치에 합쳐 함께 맞춘다. 사용자는 이 작업이 합쳐진 뒤 노트북에서 실제로 써 본다.

사용자와 정한 것은 다음과 같다.
- 노트북에서 PC 화면이 아니라 보드를 브라우저로 쓴다.
- 노트북 → PC Tailscale 왕복은 직접 연결 7ms였다.
- 동시 사용은 드물지만 안전한 것을 기본으로 한다.
- R1·R2·R3을 합치고 푸시한 뒤 사용자가 노트북에서 실사용한다(2026-11-05).

### 할 것

1. **R1·R2 합치기.** 이 워크트리 브랜치에 `worktree-p47`과 `worktree-p48`을 합치고 충돌을 푼다. 두 보고 절의 "P48과 맞출 것"과 "P47과 맞출 것"을 따른다.
   - 웹 화면도 클라이언트다. 연결 주소의 `client`·`name`·`kind=web`와 기기 토큰(`device`)이 함께 간다. `client.auth`와 클라이언트 목록이 맞아야 한다.
   - 웹 화면의 OS 알림(Web Notifications)도 알림 받을 클라이언트 고르기(`notifyAllowed`)를 따른다.
   - PC 창과 브라우저가 같은 터미널을 함께 보며, 서로 뺏지 않고 크기 정하는 기기 규칙이 맞는지 확인한다.
   - P45의 화면 배율이 웹 화면에서는 적용되지 않는다(`window.mt.setZoom` 없음). 웹에서도 되게 한다.
2. **Tailscale 알아보기(읽기만).** `tailscale status --json`, `tailscale serve status --json`으로 이 PC의 Tailscale 이름(MagicDNS), tailnet, 로그인 사용자, serve 설정을 읽는다. Tailscale이 없거나 꺼져 있어도 판은 그대로 돈다.
3. **바깥 요청 규칙**
   - **Host 허용 목록:** 이 PC의 Tailscale 이름(`<pc>.<tailnet>.ts.net`)을 Host 허용 목록에 저절로 넣는다. `ATRIUM_WEB_HOSTS`도 그대로 받는다.
   - **hook과 하위 세션 명령:** `tailscale serve`를 거쳐 온 요청(Tailscale이 넣는 머리글, 전달 머리글)은 `/hooks/`와 `/branch/`를 부를 수 없다. P48의 "이 PC의 프로세스" 검사가 그것을 막는지 시험으로 확인한다. Tailscale serve가 넣는 머리글은 Tailscale 공식 문서에서 확인하고 작업 기록에 출처를 적는다.
   - **로그인 사용자 제한:** `Tailscale-User-Login`이 있으면, 이 PC에 로그인한 Tailscale 사용자와 같을 때만 짝 맺기와 연결을 받는다. 설정에서 허용 사용자를 더하거나 끌 수 있다. 기본은 같은 사용자만 받는다.
4. **`atrium remote` 명령**
   - `status`: 진단을 보인다. 확인할 것은 Tailscale 설치·로그인·실행, MagicDNS와 HTTPS 인증서 사용 여부, serve가 판 포트로 가는지, Host 허용 목록, 짝 맺은 기기 수, 노트북에서 열 주소다.
   - `guide`: 사용자가 따라 할 단계를 보인다.
   - `enable`·`disable`: `tailscale serve --bg --https=443 http://127.0.0.1:<판 포트>`와 그 끄기를 `--yes`가 있을 때만 실행한다. funnel(인터넷 공개)은 쓰지 않고, 쓰는 설정이 있으면 경고한다.
   - **이 작업에서는 이 PC에서 `enable`·`disable`이나 어떤 `tailscale` 설정 바꾸기도 실행하지 않는다.** 사용자가 노트북 시험 때 직접 한다. 읽기 명령(`status`, `serve status`)만 실제로 부른다.
   - 설정 화면(연결된 기기 탭)에도 같은 진단과 노트북 주소를 보인다.
5. **끊김과 다시 연결(웹 화면).**
   - WebSocket이 끊기면 백오프로 다시 붙는다. 위쪽에 "다시 연결 중" 띠를 보인다.
   - 다시 붙으면 구독, 보드 상태, 보이는 터미널을 다시 맞춘다.
   - 백엔드 다시 켜기, 노트북 잠자기에서 깨기, 네트워크 바뀜을 견딘다.
   - 기기 토큰이 끊겼으면(4401) 짝 맺기 화면으로 간다.
6. **원격에 맞는 전송.**
   - 원격 클라이언트에게는 패널마다 프레임을 묶어 보낸다(예: 최대 초당 30번, 바뀐 부분을 합침).
   - WebSocket 압축(permessage-deflate)을 원격 연결에만 켠다.
   - 보이지 않는 노드는 지금처럼 화면을 보내지 않는다.
   - 웹 화면 구석에 왕복 지연(ms)을 작게 보인다.
7. **설치형 웹 앱(PWA).** 매니페스트와 아이콘을 둬서 노트북 브라우저에서 앱처럼 설치할 수 있게 한다(오프라인 동작은 필요 없다).
8. **문서.** `README.md`·`README.ko.md`에 "원격 접속(Tailscale)" 절을 더한다.
   - 내용: 양쪽 Tailscale 설치, tailnet 관리 화면에서 MagicDNS·HTTPS 켜기, `atrium remote enable --yes`, 노트북에서 주소 열기, 코드로 짝 맺기, 보안 주의(짝 맺은 기기는 이 PC 사용자 권한, funnel 금지, 끊는 법).
   - 공개 저장소이므로 PC 이름이나 tailnet 이름은 예시 이름으로 쓴다.

### 완료 기준

1. 단위 시험을 더하고 통과한다: R1·R2 합친 뒤의 인증과 클라이언트, Tailscale 상태 읽기(가짜 JSON), Host 자동 허용, 바깥 요청이 hook·branch를 못 부름, 로그인 사용자 제한, `atrium remote` 진단(가짜 상태들), 프레임 묶기, 다시 연결 상태 바꾸기.
2. 개발용 판으로 확인하고 결과를 `experiments/p49/`(git 밖)에 남긴다.
   - **함께 쓰기:** PC 창(Electron)과 브라우저(Playwright Chromium, 짝 맺은 기기)가 같은 셸·claude(`--model haiku`) 터미널을 함께 본다. 서로 뺏지 않고, 크기 정하는 기기가 바뀌어도 깨지지 않는다. 알림은 활성 쪽에서만 뜬다.
   - **Tailscale 흉내:** 시험용 역프록시를 둔다. Host를 가짜 `pc.example.ts.net`으로 바꾸고, Tailscale 머리글과 `X-Forwarded-For`를 넣는다. 이것으로 다음을 본다: 짝 맺기와 사용, 다른 로그인 사용자 거부, hook·branch 거부, 허용 목록에 없는 Host 거부.
   - **지연:** P47의 지연 프록시를 7·50·200ms로 두고 입력 → 화면 시간과 프레임 묶기 효과를 잰다.
   - **끊김:** 프록시나 백엔드를 끊었다 살리면 브라우저가 다시 붙고 터미널이 돌아온다.
   - **진단:** `atrium remote status`가 이 PC의 실제 Tailscale 상태를 읽어 보인다(바꾸지 않는다). 공개 저장소이므로 그 출력은 작업 기록에 붙이지 않고 결과 폴더에만 둔다.
3. `cd backend && npm test`, `cd app && npm test`, `cd app && npm run build`가 통과한다.

### 시험 환경

- 너만의 개발용 판으로 띄운다(`docs/testing.md`).
  - `ATRIUM_HERDR_SESSION=atrium-dev-p49`, `ATRIUM_PORT=47868`
  - `ATRIUM_DATA_DIR=<워크트리>/backend/.dev/data`, `ATRIUM_APP_USERDATA=<워크트리>/backend/.dev/app`
- 실제 판(`atrium`, 47800)과 다른 포트(47811~47867)는 쓰지 않는다.
- 대화 목록은 시험 폴더의 대화만 읽는다(`ATRIUM_CLAUDE_PROJECTS`, `ATRIUM_CLAUDE_DESKTOP=none`). 시험 폴더는 `C:\Workspace\mtask-p49-*`처럼 새로 만든다.
- 끝나면 시험 세션, 창, 브라우저, 프록시, 백엔드, herdr 서버와 세션(`atrium-dev-p49`만), 시험 폴더, 업로드 시험 파일, 시험 대화 기록을 끄고 지운다.

### 지킬 것

- `CLAUDE.md`를 따른다. 프로세스는 직접 띄운 것만 PID로 끈다.
- 이 저장소는 공개다. 작업 기록, 시험 코드, 커밋 메시지, README에 사용자 경로·메일·토큰, 실제 PC 이름·tailnet 이름·Tailscale 주소를 쓰지 않는다. 커밋 전·푸시 전 검사를 건너뛰지 않는다.
- **이 PC의 네트워크 설정을 바꾸지 않는다.** `tailscale serve`·`funnel`·`up`·`set` 같은 바꾸기 명령, 방화벽, Windows 네트워크 설정은 실행하지 않는다. 백엔드는 지금처럼 `127.0.0.1`에서만 받는다.
- 자기 브랜치에만 커밋한다(P47·P48을 합친 것도 이 브랜치에). 커밋 메시지에 `Co-Authored-By` 줄을 넣지 않는다. `main`을 바꾸거나 푸시하지 않는다. `node_modules`는 워크트리 안에서 받는다(`npm ci`).
- 화면 글은 `locales/en.js`·`ko.js` 끝에 더한다. 한국어는 P39 말투(합니다체)와 용어를 따른다. `styles.css`는 끝에 더한다.
- 문서는 이 작업 파일의 작업 기록 절과 보고 절, README 두 개의 원격 절만 고친다. 고쳐야 할 ARCH·BRIEF 행의 새 문장은 보고 절에 적는다. P47·P48 보고 절의 제안도 함께 묶어, 원격 전체(R1~R3)로 짧게 정리한다.
- 보고 절에 "사용자가 노트북에서 할 일"을 단계별로 적는다(명령과 화면, 확인할 것, 되돌리는 법).
- 끝나면 보고 절을 쓰고, 맨 마지막에 `<워크트리>/backend/.dev/p49.done`(브랜치 이름과 마지막 커밋 해시 두 줄)을 만든다.

### 읽을 파일

- `CLAUDE.md`, `docs/testing.md`, `docs/ARCH.md` 1절·5절·6절
- `docs/log/p47-remote-r1-multiclient.md`, `docs/log/p48-remote-r2-web.md`의 보고 절 전부(이 두 파일은 각 브랜치에 있다. `git show worktree-p47:docs/log/p47-remote-r1-multiclient.md`)
- 두 브랜치의 바뀐 파일(`git diff main...worktree-p47`, `git diff main...worktree-p48`)
- Tailscale 공식 문서: `tailscale serve`(HTTPS, 넣는 머리글), MagicDNS, HTTPS 인증서

## 작업 기록

2026-11-05 P49 작업자 세션.

- **합치기.** `worktree-p47`을 먼저, `worktree-p48`을 그 위에 합쳤다(커밋 두 개). P47 충돌은 `TerminalView.jsx`(P45 글자 배율 + P47 ResizeObserver, 의존 값에 `termScale`), `backend.mjs`(`board.get`의 P44 `groups` + P47 클라이언트별 viewport, `groupHandlers`와 `peerHandlers` 둘 다), locales·styles 끝(둘 다 둠)이었다. P48 충돌은 `api.js`(웹은 `info.wsUrl` 뒤에 P47의 `client·name·kind` 값을 붙임), `api.mjs`(`authorize`와 `onOpen`, `_connection(ws, req, auth)`에서 P47 클라이언트 값과 P48 `auth`를 함께), `backend.mjs`(`WebServer`·`ApiServer`·`Peers` 만드는 순서), `TerminalView.jsx` 가져오기, locales·styles였다.
- **합친 뒤 맞춘 것.** 웹 어댑터의 `backend()`가 `clientKind: 'web'`과 기기 이름을 준다. 백엔드는 기기 토큰 연결을 연결 주소의 `kind`와 상관없이 늘 `web`으로 둔다(`bindAuth`, 브라우저가 `desktop`을 흉내 내 알림을 가져가지 않게). ID가 없으면 `web-<기기 ID>`, 이름이 없으면 짝 맺을 때의 이름. `client.hello`도 같다. 웹 화면의 OS 알림은 원래 `notify.js`의 `notifyAllowed`를 거쳐 `window.mt.notify`를 부르므로 따로 고치지 않았다(시험에서 확인). 웹 화면 배율은 `window.mt.setZoom` → 뿌리 요소의 CSS `zoom`.
- **Tailscale 문서(출처).** https://tailscale.com/kb/1312/serve: serve는 `Tailscale-User-Login`(로그인 이름), `Tailscale-User-Name`, `Tailscale-User-Profile-Pic`을 넣는다. 들어온 요청에 이 머리글이 있으면 지운다. 태그 기기와 funnel 요청에는 넣지 않는다. serve는 tailnet의 HTTPS 인증서가 켜져 있어야 한다. https://tailscale.com/kb/1242/tailscale-serve: `tailscale serve --https=<포트> <대상> [off]`, `--bg`는 끌 때까지 남는다(다시 켜기 뒤에도), 끄기는 같은 명령 끝에 `off`, 프록시 대상은 `http://127.0.0.1`만. https://tailscale.com/kb/1153/enabling-https: 관리 화면 DNS에서 MagicDNS와 HTTPS Certificates를 켠다. 기기 이름과 tailnet 이름이 Certificate Transparency 기록에 남는다. https://tailscale.com/kb/1081/magicdns: 2022-10-20 뒤 tailnet은 MagicDNS가 기본으로 켜져 있다. 문서에 `X-Forwarded-*`와 백엔드가 받는 Host는 적혀 있지 않다. 그래서 판은 Host가 Tailscale 이름인 경우와 전달 머리글이 붙은 경우를 모두 "바깥 요청"으로 다룬다(둘 다 hook·branch 403).
- **이 PC의 Tailscale 읽기(읽기 명령만).** `tailscale status --json`, `tailscale serve status --json`의 모양을 봤다(값은 적지 않는다). `Self.DNSName`(끝에 점), `Self.UserID` → `User[id].LoginName`, `CurrentTailnet.MagicDNSEnabled`, `CertDomains`, serve는 `Web["<이름>:<포트>"].Handlers["/"].Proxy`, funnel은 `AllowFunnel`. 이 PC는 https 443에 이미 다른 서비스의 serve가 걸려 있다. 그래서 `enable`은 그 포트를 덮어쓰지 않고 멈추고 빈 포트를 알려 주게 했다. 바꾸기 명령(`serve`, `funnel`, `up`, `set`)은 실행하지 않았다.
- **시험 판.** `atrium-dev-p49`, 47868, `backend/.dev/data`·`app`. 프록시는 47869(ts-sim), 47870(지연). 시험 폴더 `C:\Workspace\mtask-p49-remote`. 판은 가짜 tailscale(`ATRIUM_TAILSCALE=app/test/e2e/p49-fake-tailscale.mjs`, 예시 이름 `pc.example.ts.net`, `me@example.com`)을 읽는다. 브라우저는 `--host-resolver-rules`로 `pc.example.ts.net`을 127.0.0.1로 보고, ts-sim이 Host·Origin을 `https://pc.example.ts.net`으로 바꾸고 Tailscale 머리글과 `X-Forwarded-*`를 넣는다.
- **시험 중 고친 것.** 첫 실행에서 출력 덩어리 명령이 bash 문법이라 PowerShell 셸에서 실패했다(프레임 묶기 실패로 보임). PowerShell 문법으로 고쳤다. "크기 정하는 기기 바뀜"은 처음에 두 쪽 바라는 칸 수가 같아 바뀌는 것을 보지 못했다. 브라우저 글자 배율을 120%로 두고 번갈아 쳐서 다시 쟀다. 웹 화면 배율에서 html의 너비·높이를 배율로 나누는 고침을 넣었다가, 판이 창보다 작아져 되돌렸다(CSS zoom만으로 창에 맞게 들어간다, 수치로 확인).
- **결과 폴더.** `experiments/p49/`(이 워크트리 안, git 밖): `run2.out`·`run3.out`(claude 포함 22/22), `run5.out`(배율 확인을 더한 뒤 claude 없이 19/19), `p49-remote-results.json`, 스크린숏, `remote-status-real.txt`(이 PC의 실제 `atrium remote status`, 공개하지 않는다). 워크트리를 지우기 전에 옮겨야 남는다.
- **정리.** 시험 세션(p49sh, p49cl)을 끄고, 창·브라우저·프록시를 닫고, 백엔드와 herdr 서버를 끄고 herdr 세션 `atrium-dev-p49`를 지웠다. 시험 폴더와 시험 대화 기록(`~/.claude/projects`의 그 폴더 몫)을 지웠다. 업로드는 쓰지 않았다. 개발용 판 데이터(`backend/.dev/data`, git 밖)는 남겼다.

## 보고

### 만든 것

- **R1·R2 합치기.** 위 작업 기록 절. 웹 화면은 연결 주소에 `client`·`name`·`kind=web`과 `device`를 함께 붙인다. 기기 연결은 늘 `web` 클라이언트다. 웹 화면 배율(설정 일반 탭의 화면 배율)은 CSS `zoom`으로 된다.
- **Tailscale 읽기**(`backend/src/tailscale.mjs`): 60초마다(진단 때는 바로) 읽기 명령 둘만 부른다(`runTailscale`은 다른 인자를 거부한다). 실행 파일은 `ATRIUM_TAILSCALE`(`none`이면 읽지 않음), Windows의 `Program Files\Tailscale\tailscale.exe`, `PATH` 순. 없거나 꺼져 있어도 판은 그대로 돈다.
- **Host 자동 허용**: 이 PC의 Tailscale 이름(`<pc>.<tailnet>.ts.net`, 포트 없이와 `:443`, serve가 다른 https 포트면 그 포트도)이 허용 목록에 저절로 들어간다. `ATRIUM_WEB_HOSTS`도 그대로.
- **바깥 요청 규칙**: Host가 Tailscale 이름이거나 `Tailscale-*`·`X-Forwarded-*`·`Forwarded`·`X-Real-IP`가 있으면 바깥 요청이다. P48의 `isLocalProcess`가 이것을 막아 `/hooks/`와 `/branch/`는 403이다(단위 시험과 개발용 판 시험). 판 API 토큰 연결도 바깥에서는 막힌다.
- **로그인 사용자 제한**: `Tailscale-User-Login`이 있으면 이 PC의 Tailscale 로그인 또는 설정의 허용 목록일 때만 `/web/*`(짝 맺기, 기기 정보, 업로드)와 WebSocket 연결을 받는다(대소문자 무시). Tailscale 이름으로 왔는데 머리글이 없으면(태그 기기, funnel) 막는다. 이 PC의 로그인을 모르면 막는다. 설정 `remoteSameUser`(기본 켬)와 `remoteAllowedLogins`(쉼표로)는 이 PC의 창·CLI만 바꾼다(기기가 `settings.set`으로 바꾸면 `forbidden`).
- **`atrium remote`**(`backend/bin/atrium-remote.mjs`): `status`는 백엔드의 `remote.status`(없으면 이 자리에서 읽기)로 설치, 실행, 로그인, MagicDNS, HTTPS 인증서, serve가 판 포트로 가는지, funnel, Host 허용 목록, 화면 빌드, 짝 맺은 기기 수, 사용자 제한과 노트북에서 열 주소·켜기 명령을 보인다. `guide`는 따라 할 단계. `enable`·`disable`은 `tailscale serve --bg --https=<포트> http://127.0.0.1:<판 포트>`와 `... off`를 `--yes`가 있을 때만 실행하고, 없으면 명령만 보인다. 그 https 포트를 다른 서비스가 쓰면 덮어쓰지 않고 멈춘 뒤 빈 포트를 알려 준다(`--https-port`). HTTPS 인증서가 꺼져 있으면 멈춘다. funnel은 쓰지 않고, 켜진 포트가 있으면 알린다. 이 작업에서 `enable`·`disable`은 이 PC에서 실행하지 않았다.
- **설정 › 연결된 기기**: 같은 진단(점 색: 됨·주의·안 됨), "준비됨" 표시, 노트북 주소, 켜기 명령, 다시 확인, 사용자 제한 칸(웹 화면에서는 보기만).
- **다시 연결**(`app/src/renderer/lib/reconnect.js`, `api.js`): 백오프 0.5초에서 두 배, 웹 15초·PC 창 2초까지, ±20%. 15초마다 `ping`(백엔드 새 API, 보낸 `t`를 돌려준다)으로 왕복 지연을 재고, 8초 안에 답이 없으면 죽은 연결로 닫고 다시 붙는다. `online`과 탭이 다시 보일 때는 곧바로. 다시 붙으면 기존 `$open` 흐름으로 구독, 보드, 보이는 터미널을 다시 맞춘다. 4401이면 곧바로 한 번 붙어 보고 401이면 짝 맺기 화면으로 간다(P48 흐름).
- **웹 화면**(`RemoteBar.jsx`): 열렸다가 끊긴 동안 위쪽 가운데에 "보드에 다시 연결하는 중입니다…" 띠와 "지금 다시 시도". 오른쪽 아래 구석에 왕복 지연(최근 5번의 가운데 값, ms).
- **원격 전송**: 원격 연결(`auth.remote`)에는 패널마다 프레임을 묶는다(`frame-batch.mjs`, 33ms 간격, 쉬다 온 첫 프레임은 바로, 바뀐 부분 바이트를 이음, full은 앞의 것을 덮음, 크기가 바뀌면 먼저 보냄). `ATRIUM_REMOTE_BATCH_MS`로 바꾸거나(0이면 끔) 끌 수 있다. WebSocket 압축(permessage-deflate, 수준 1, 512바이트 넘는 메시지)은 원격 연결에만 켠다(서버 둘). 보이지 않는 노드는 지금처럼 붙지 않는다.
- **PWA**: `assets/pwa/manifest.webmanifest`(standalone, 판 바탕색), 아이콘 192·512·maskable 512(브랜드 SVG에서 `app/scripts/make-pwa-icons.mjs`로 만듦), `index.html`의 manifest·theme-color·apple-touch-icon, 백엔드의 `.webmanifest` 형식. 오프라인 동작(서비스 워커)은 없다.
- **README**: `README.md`·`README.ko.md`의 "원격 접속(Tailscale)" 절(예시 이름만).
- **시험 도구**: `backend/tools/ts-sim-proxy.mjs`(serve 흉내), `app/test/e2e/p49-fake-tailscale.mjs`, `app/test/e2e/p49-remote.mjs`.
- **시험**: `backend/test/p49.test.mjs` 9개(Tailscale 읽기 가짜 JSON, Host 자동 허용, 바깥 요청·로그인 제한, serve 흉내 요청의 짝 맺기·연결·421·hook·branch 403·압축, 합친 뒤 클라이언트, 진단 가짜 상태 9가지, enable·disable 계획, 프레임 묶기, 중계에서 원격만 묶기), `app/test/p49-lib.test.mjs` 4개(백오프, 다시 연결 상태, ping·지연 표시, 배율·연결 값·알림 고르기). `cd backend && npm test` 390 통과, `cd app && npm test` 165 통과, `npm run build` 통과.

### 개발용 판 결과(experiments/p49)

| 항목 | 결과 |
|---|---|
| 함께 쓰기(셸) | 두 쪽에서 친 글이 두 쪽에 보임, 제어기 1개에 클라이언트 2, 덮개 없음 |
| 크기 정하는 기기 | 브라우저 → PC 창 → 브라우저로 번갈아 침. 주인이 그대로 바뀌고 칸 수 68×15 ↔ 85×18, 두 쪽 칸 수 같음, 주인 아닌 쪽은 비율(1.261, 0.821)로 그려 칸 안에 듦 |
| claude(haiku) | 답이 두 쪽에 보임, 제어기 1개 공유 |
| 알림 | 브라우저가 활성일 때 브라우저만 Web Notification, PC 창은 `other-client`로 건너뜀. PC 창에서 답하면 브라우저 대기도 풀림 |
| 바깥 요청 | hook·branch 403, 모르는 Host 421, 다른 로그인 사용자는 맞는 코드로도 403(코드는 남음), 사용자 머리글 없음 403, 같은 사용자는 짝 맺고 사용 |
| 지연(한 방향 0·7·50·200ms) | 글자 메아리 가운데 49·63·155·436ms, Enter → 출력 46·62·139·448ms, ping 왕복 1·31·123·415ms. 7ms에서 지연이 없는 것보다 약 15ms 늘었다 |
| 프레임 묶기 | 같은 출력 400줄: PC 창(묶지 않음) 236프레임, 원격 브라우저 148프레임(37% 적음), 끝 줄까지 같음 |
| 끊김 | 프록시를 끊으면 띠, 살리면 약 0.3~0.6초 뒤 다시 붙고 터미널에 다시 칠 수 있음, 띠 사라짐. 백엔드 다시 켜기 뒤 다시 붙고 터미널 돌아옴. 답 없는 연결은 약 8.4초에 알아채고 다시 붙음 |
| 4401 | PC에서 끊으면 약 0.1초에 짝 맺기 화면 |
| 배율 | 웹 화면 배율 120%에서 판이 창 안에 들고 넘침 없음, 터미널을 눌러 칠 수 있음 |
| 진단 | 이 PC의 실제 `atrium remote status`: [ok] 8, [주의] 1(https 443을 다른 serve 대상이 씀), [-] 2(백엔드 없이 읽어 기기 수·빌드 모름). 출력은 결과 폴더에만 |

### 계획과 다른 곳

- 지시는 `enable`을 `--https=443`으로 적었다. 이 PC는 443을 이미 다른 서비스가 serve로 쓰고 있어, 그대로 실행하면 그 설정을 덮어쓴다. 그래서 다른 대상이 그 포트를 쓰면 멈추고 `--https-port`를 받게 했다. 이 PC에서는 `remote status`가 알려 주는 빈 포트(읽은 때 10000)를 `--https-port`로 줘야 한다.
- serve가 넣는 `X-Forwarded-*`와 Host는 공식 문서에 없어 확인하지 못했다. 판은 둘 중 무엇이 오든(바깥 Host 또는 전달 머리글 또는 `Tailscale-*`) 바깥 요청으로 막는다. 실제 serve를 거친 요청 모양은 사용자의 노트북 시험에서 처음 본다.
- 시험은 실제 Tailscale이 아니라 흉내 프록시와 가짜 tailscale로 했다. 실제 HTTPS(보안 출처), 실제 MagicDNS, 노트북 잠자기는 보지 못했다(잠자기는 답 없는 연결로 흉내).
- 지연 시험은 지연을 한 방향 값으로 줬다(P47 도구 그대로). 7ms 왕복 실측에 가까운 것은 한 방향 3~4ms다.
- 남의 파일을 고쳤다: `api.js`(다시 연결, ping), `api.mjs`(원격 압축 서버, `bindAuth`), `peers.mjs`(`ping`, `bindAuth`), `relay.mjs`(원격 묶기), `web.mjs`(Host 목록 getter, 로그인 제한, `remote.status`, `.webmanifest`), `settings.mjs`(설정 둘), `backend.mjs`(Tailscale 읽기, `settings.set` 막기), `bin/atrium.mjs`(`remote`), `WebDevices.jsx`, `main.jsx`, `index.html`, `web.js`, `lib/scale.js`.

### 알려진 문제와 위험

- 짝 맺은 기기는 이 PC 사용자의 권한이다(P48과 같다). 로그인 제한은 Tailscale을 거친 요청에만 걸린다. 이 PC 안의 브라우저(127.0.0.1)는 예전처럼 짝 맺기만으로 쓴다.
- Tailscale 상태는 60초마다 읽는다. PC의 Tailscale 이름이 바뀌거나 로그인 사용자가 바뀐 직후 최대 60초 동안 옛 값으로 판단한다(설정 탭의 "다시 확인"이나 `remote status`가 바로 읽는다).
- 이미 열린 원격 연결은 허용 목록이나 사용자 제한을 바꿔도 끊지 않는다(다음 연결부터). 끊으려면 기기를 끊는다.
- 프레임 묶기는 출력이 몰릴 때 최대 33ms 늦게 보인다. 셸 노드는 모은 프레임을 한 번에 받아 밀린 줄 계산(`findShift`)이 크게 바뀌면 화면을 다시 맞춘다(시험에서 깨짐은 보지 못했다).
- 원격 압축은 연결마다 zlib 상태를 둔다(메모리 조금). 이 PC 안 연결은 압축하지 않는다.
- 웹 화면 배율은 Chromium의 표준 CSS `zoom`(Chrome 128 뒤)에 기댄다. 더 오래된 브라우저에서는 마우스 좌표가 어긋날 수 있다.
- PWA는 설치만 된다. 판이 꺼져 있으면 설치한 앱도 빈 화면이다(오프라인 동작 없음).
- 웹 알림과 클립보드는 https(실제 serve 주소)에서만 된다. `http://100.x`로 열면 안 된다.
- 마지막 확인 때 `cd backend && npm test`가 한 번 1개 실패했고(이름을 남기지 못함), 그 뒤 7번 연달아 390개 모두 통과했다. 시간에 기대는 시험이 가끔 흔들리는 것으로 보지만 어느 시험인지 확인하지 못했다.
- `atrium remote status`는 로그인 이름과 Tailscale 이름을 화면에 보인다. 출력을 공개된 곳에 붙이지 않는다.

### 사용자가 노트북에서 할 일

1. **PC에서 상태 보기.** `cd backend` 뒤 `node bin\atrium.mjs remote status`. 확인할 것: [안 됨]이 없는지, "노트북에서 열 주소". 지금 이 PC는 https 443을 다른 서비스가 써서 serve 줄이 [주의]이고 다른 포트를 알려 준다.
2. **PC에서 serve 켜기.** `node bin\atrium.mjs remote enable --yes --https-port <포트>`(status가 알려 준 포트, 읽은 때 10000). 이 명령이 실행하는 것은 `tailscale serve --bg --https=<포트> http://127.0.0.1:47800`이다. 다시 `remote status`로 serve 줄이 [ok]이고 주소에 `:<포트>`가 붙는지 본다.
3. **노트북에서 열기.** 노트북의 Tailscale이 같은 계정으로 켜져 있는지 보고, 브라우저(Chrome·Edge)에서 그 주소를 연다. 짝 맺기 화면이 나와야 한다. 인증서 경고가 나오면 멈추고 알려 준다.
4. **짝 맺기.** PC 창 설정 › 연결된 기기 › "새 코드" → 노트북에 6자리 코드와 기기 이름을 넣는다. 같은 탭의 원격 접속 칸에 "준비됨"과 같은 주소가 보여야 한다.
5. **써 보기.** 노트북에서 세션 노드를 열고 셸에 친다. PC 창에서도 같은 노드가 같이 보이는지, 누른 쪽으로 크기가 바뀌는지, 오른쪽 아래 지연 ms(직접 연결이면 10ms 안팎), 노트북에서 쓰는 동안 알림이 노트북에만 뜨는지 본다. 브라우저 메뉴의 "앱 설치"로 따로 된 창이 되는지 본다.
6. **끊김 보기.** 노트북 Wi-Fi를 잠깐 끄거나 덮개를 닫았다 연다. 위쪽에 "다시 연결 중" 띠가 떴다가 사라지고 터미널이 돌아와야 한다.
7. **되돌리기.** 기기 끊기: PC 창 설정 › 연결된 기기의 "끊기"(또는 `node bin\atrium.mjs devices rm <ID>`). serve 끄기: `node bin\atrium.mjs remote disable --yes --https-port <포트>`(= `tailscale serve --https=<포트> http://127.0.0.1:47800 off`). 다른 서비스의 443 설정은 건드리지 않는다.

### ARCH·BRIEF에 고칠 문장(R1~R3 묶음, P47·P48 제안 포함)

- **BRIEF "정한 것" 원격 행:** "노트북에서는 PC 화면이 아니라 판을 브라우저로 쓴다. 백엔드가 같은 포트로 웹 화면을 내주고, 브라우저는 PC 창에서 짝을 맺은 기기 토큰으로만 붙는다. 바깥에서는 PC의 `tailscale serve`(tailnet 안, HTTPS)로만 열고 funnel은 쓰지 않는다. Tailscale로 온 요청은 PC의 Tailscale 사용자만 받는다. 한 백엔드에 창·웹 화면이 여럿 붙고, 터미널 화면은 모두에게 나눠 보내며 크기는 마지막으로 쓴 쪽이 정한다. 화면 위치는 클라이언트마다, 알림은 최근에 쓴 클라이언트에서만 뜬다(2026-11-05, P47~P49)."
- **BRIEF 프로세스 구조 행:** "창은 Electron 창이거나 백엔드가 같은 포트로 내주는 웹 화면을 연 브라우저다. 둘 다 백엔드에 WebSocket으로 붙는다."
- **ARCH 1절 그림·통신:** 창 줄 "[Electron 창 또는 웹 화면] ─ WebSocket(127.0.0.1, 판 API 토큰 또는 기기 토큰, 연결 주소의 client·name·kind)". 백엔드에 "화면 파일과 /web/*(짝 맺기, 기기 정보, 업로드)". 바깥 줄 "[노트북 브라우저] ─ https ─ [PC tailscale serve] ─ http://127.0.0.1:<판 포트>". 연결 규칙: 판 API 토큰은 이 PC의 프로세스만, 기기 토큰은 같은 출처 브라우저만, Host는 127.0.0.1·localhost·`ATRIUM_WEB_HOSTS`·이 PC의 Tailscale 이름, hook과 `/branch/*`는 이 PC의 프로세스만, Tailscale로 온 요청은 같은 Tailscale 사용자(또는 허용 목록)만. 화면 중계 줄 "가까이 보이는 노드마다 제어기 하나, 붙은 클라이언트 모두에게 나눠 보냄(원격 클라이언트는 묶고 압축)".
- **ARCH 4절:** H1 끝 "뷰포트는 클라이언트(창, 웹 화면)마다 하나다. 처음 붙는 클라이언트는 가장 최근에 누가 옮긴 자리에서 시작한다." A1의 OS 알림 뒤 "창이 여럿 붙었으면 최근 5분 안에 입력이 있었던 클라이언트에서만 띄우고(웹 화면은 Web Notifications), 없으면 PC 창, 창도 없으면 트레이에서 띄운다."
- **ARCH 5절 모듈 표:** 화면 중계 행은 P47 제안 문장 + "원격 클라이언트에는 패널마다 프레임을 묶어 보낸다(`frame-batch.mjs`)". 새 행: "클라이언트 | 붙은 창·웹·트레이 목록, 마지막 입력, 알림 받을 클라이언트, ping(`peers.mjs`, `multiclient.mjs`)", "`web.mjs` | 화면 파일, 짝 맺기·기기 토큰(해시), Host·Origin 검사, Tailscale 사용자 제한, 폴더 목록, 업로드", "`tailscale.mjs` | Tailscale 상태 읽기(읽기 명령만), Host 자동 허용, 로그인 사용자 판정, 원격 진단".
- **ARCH 6절 API 표:** P47 제안(`terminal.owner`, `terminal.input_by`, `terminal.focus`, `client.hello`, `client.active`, `clients.list`, 클라이언트별 viewport, 이벤트 `clients.updated`·`board.node`), P48 제안(`device.*`, `web.status`, `fs.roots`, `fs.list`, 이벤트 `device.updated`, HTTP `/web/me`·`/web/pair/*`·`/web/upload`)에 더해 `remote.status { fresh }` → `{ checks, ready, url, httpsPort, enable, login, sameUser, allowed }`, `ping { t }` → `{ t, at }`. 설정 `remoteSameUser`, `remoteAllowedLogins`(이 PC만 바꿈).
- **ARCH 7절 화면:** 웹 화면의 짝 맺기 화면, PC 폴더 탐색기, 다시 연결 띠, 왕복 지연 표시, 설정 연결된 기기 탭(기기 목록, 코드, 원격 접속 진단과 사용자 제한), PC 창 위쪽의 허락 요청 카드, 다른 기기 알약.
