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

## 보고
