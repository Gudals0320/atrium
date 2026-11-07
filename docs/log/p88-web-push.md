상태: 닫힘
날짜: 2026-11-07

## 지시

### 목표

휴대폰(iPhone Safari의 홈 화면 앱)에 웹 푸시 알림을 보낸다. 세션의 일이 끝나거나 사람의 답이 필요하면 알린다. 질문 내용은 알림에 넣지 않는다.

### 사용자의 말(2026-11-07, `v0.1.4-dev.8`)

"업데이트함 적당히 잘 작동함. 이거 알람기능 추가좀. 세션 끝나거나 하면 알람.. 물어볼거 있으면 알람.;.(질문의 세부내용은 표기X) iphone safari web push 만들어"

### 전제

- iOS의 웹 푸시는 홈 화면에 추가한 웹 앱(`display: standalone`, iOS 16.4 이상)에서만 된다. 권한은 사람이 누른 동작 안에서만 물을 수 있다.
- 웹 화면은 tailscale serve의 HTTPS 출처라 보안 문맥이다. 서비스 워커(`sw.js`, P76)와 웹 앱 매니페스트가 이미 있다.
- 푸시는 브라우저의 푸시 서비스(iOS는 `web.push.apple.com`)를 거친다. 백엔드가 그 서버로 HTTPS 요청을 보낸다. 내용은 RFC 8291(aes128gcm)로 암호화하고, 백엔드는 VAPID(RFC 8292, ES256) 키로 서명한다.

### 할 것

1. **백엔드 보내기.**
   - VAPID 키 한 쌍을 처음 쓸 때 만들어 판 데이터 폴더에 둔다(저장소 밖, 파일 권한은 사용자만).
   - 기기의 구독(endpoint, keys)을 받아 짝 맺은 기기(P56 세션)마다 저장한다. 짝을 풀거나 기기를 막으면 그 구독도 지운다.
   - 푸시 서비스가 404·410을 주면 구독을 지운다.
   - 암호화와 서명은 `node:crypto`로 직접 하거나 잘 알려진 패키지를 버전 고정으로 쓴다. 고른 근거를 적는다. 직접 하면 RFC 8291 부록의 시험 벡터로 시험한다.
   - SSRF를 막는다. endpoint는 알려진 푸시 서비스의 https 주소만 받는다(`web.push.apple.com`, `fcm.googleapis.com`, `updates.push.services.mozilla.com`, `*.notify.windows.com` 등. 목록은 근거를 들어 정한다).
2. **무엇을 언제 알리나.** 세션(판의 에이전트 세션, 셸 빼고)마다 아래 때에 알린다.
   - 일이 끝남: 턴이 끝나 `working` → `ready`
   - 답이 필요함: `waiting`(권한·질문), `trust_wait`
   - 오류·끝남: `error`, 세션이 예기치 않게 끝남
   - 알림 글은 "@이름 · 끝남", "@이름 · 응답 필요"처럼 세션 이름과 종류만 넣는다. 질문, 요청, 답의 글은 넣지 않는다(사용자 요청). 워크스페이스 이름 정도는 넣어도 된다.
   - 같은 세션의 같은 종류는 짧은 사이(예: 30초)에 한 번만 보낸다. 여러 세션이 한꺼번에면 몇 개를 묶는다.
   - 그 기기가 지금 판 화면을 열어 보고 있으면(연결 열림, 보이는 상태) 보내지 않는다. PC를 쓰는 중에도 휴대폰에 보낼지는 기기 설정으로 고르게 하고 기본값을 근거를 들어 정한다.
3. **휴대폰 화면.**
   - 목록 머리줄이나 설정 시트에 "알림" 켜기·끄기를 둔다. 종류별(끝남, 응답 필요, 오류) 켜기·끄기도 둔다.
   - 홈 화면 앱이 아니면 "홈 화면에 추가한 앱에서 알림을 받을 수 있습니다"와 추가 방법을 보인다.
   - 권한 거절, 구독 실패, 지원 안 함은 알아듣게 알린다. "시험 알림 보내기"를 둔다.
   - 서비스 워커는 `push`에서 알림을 띄우고, `notificationclick`에서 앱을 열어 그 세션 화면으로 간다. 서비스 워커가 API·로그인·세션 데이터를 캐시하지 않는 규칙(P76, `sw-rules.js`)은 지킨다.
   - 두 사전, 지금 말투.
4. **PC에서 보기.** PC 설정의 연결된 기기에 기기마다 알림 켜짐과 마지막으로 보낸 때를 보인다. 연결 기록(`remote-log.jsonl`)에 구독·해지·보내기 실패를 남긴다. 알림 내용은 남기지 않는다. `atrium remote` CLI에 시험 알림 보내기를 둔다.

### 손대지 말 것

- PC 창의 OS 알림(지금 규칙)은 바꾸지 않는다.
- tailscale·네트워크·방화벽 설정은 바꾸지 않는다. 실제 판으로 시험하지 않는다. 진짜 Apple 푸시 서버로 보내는 시험은 하지 않는다(흉내 푸시 서비스로).

### 완료 기준

1. 단위 시험:
   - VAPID 서명(JWT 모양, 만료), aes128gcm 암호화(RFC 8291 시험 벡터 또는 같은 키로 풀기)
   - endpoint 허용 목록(내부 주소, http, 다른 호스트 거부)
   - 알릴 때 판단(상태 바뀜 → 종류, 셸 뺌, 묶기, 보는 중이면 안 보냄, 종류별 끔)
   - 알림 글에 질문·요청·답 글이 들어가지 않음
   - 404·410이면 구독 지움, 짝 풀기면 구독 지움
2. 창 시험(개발용 판, 원격 흉내 `app/test/e2e/p59-lib.mjs`). 결과는 `experiments/p88/`에 둔다.
   - Chromium(iPhone 흉내, 알림 권한 허용) 또는 WebKit으로 구독을 만든다. 흉내가 브라우저 푸시를 만들지 못하면 그 사실을 적고, 서비스 워커의 `push` 처리는 직접 보낸 이벤트로 시험한다.
   - 백엔드가 흉내 푸시 서비스(로컬 https나 시험용 허용 주소)로 보낸 요청을 받아, 머리글(VAPID, TTL, 암호화)과 풀어 본 내용(세션 이름과 종류만)을 확인한다.
   - 상태 바뀜(일 끝남, 응답 필요)마다 한 번씩 보내는지, 기기가 보고 있으면 안 보내는지 본다.
3. 보고에 사람이 iPhone으로 켜고 받는 순서를 적는다(홈 화면 앱, 알림 켜기, 시험 알림, 세션 끝남·응답 필요 받기, 알림 누르기).
4. `cd backend && npm test`, `cd app && npm test`, `cd app && npm run build`가 통과한다.

### 읽을 파일

- `CLAUDE.md`, `docs/testing.md`(원격 창 시험), ARCH 1절 원격 문단, 3절(상태), `docs/log/p56-remote-passkey-session.md`·`docs/log/p59-remote-integrate.md`(짝 맺기, 세션, 기기), `docs/log/p76-phone-board-touch.md`(서비스 워커, 매니페스트), `docs/log/p87-phone-list-mission.md`의 보고 절
- `backend/src/web.mjs`, `backend/src/web-auth.mjs`, `backend/src/remote-log.mjs`, `backend/src/state.mjs`(상태 바뀜), `backend/src/multiclient.mjs`(보는 기기), `backend/bin/atrium-remote.mjs`
- `app/src/renderer/sw.js`, `app/src/renderer/lib/sw-rules.js`, `app/src/renderer/lib/pwa.js`, `app/src/renderer/notify.js`(지금 알림), `app/src/renderer/Phone.jsx`, `app/src/renderer/WebDevices.jsx`, 두 사전

### 시험 환경

- 이 작업은 `dev` 브랜치에서 시작한다. 워크트리를 연 뒤 먼저 `git fetch origin && git merge --ff-only origin/dev`를 한다(워크트리가 `main`에서 시작할 수 있다).
- 너는 사용자의 실제 판 위에서 도는 워커라 셸에 실제 판의 `ATRIUM_*`·`HERDR_*`가 있다. 시험, 개발용 판, herdr, `atrium`은 이 변수를 지운 셸(`backend/.dev/clean-env.sh`, `docs/testing.md`)로 부른다.
- 개발용 판은 너만의 판으로 띄운다(`docs/testing.md`).
  - `ATRIUM_HERDR_SESSION=atrium-dev-p88`, `ATRIUM_PORT=47897`, 창의 원격 디버깅 포트 9377
  - `ATRIUM_DATA_DIR=<워크트리>/backend/.dev/data`, `ATRIUM_APP_USERDATA=<워크트리>/backend/.dev/app`
- 실제 판(`atrium`, 47800)과 다른 판의 포트는 쓰지 않는다. 사용자의 기본 herdr 세션, 실제 판의 herdr 세션(`atrium`), 다른 판의 herdr 서버는 건드리지 않는다. 사용자의 실제 판은 열지도 캡처하지도 않는다. 스크린숏은 창 안만 찍는다(`page.screenshot`).
- 실제 판의 API(47800)와 `atrium` 명령으로 실제 판을 바꾸지 않는다. 시험의 `atrium` CLI는 늘 개발용 판 환경 변수(`ATRIUM_PORT` 등)를 주고 부른다.
- 실제 설치 폴더(`%LOCALAPPDATA%\atrium\versions`)와 실제 데이터 폴더(`%LOCALAPPDATA%\atrium`)는 읽지도 바꾸지도 않는다.
- 대화 목록은 시험 폴더의 대화만 읽는다(`ATRIUM_CLAUDE_PROJECTS`, `ATRIUM_CLAUDE_DESKTOP=none`). 시험 폴더는 `C:\Workspace\mtask-p88-*`처럼 새로 만든다.
- 세션은 `claude --model haiku`와 셸로 띄운다.
- 끝나면 시험 세션, 창, 브라우저, 백엔드, herdr 서버와 세션(`atrium-dev-p88`만), 시험 폴더를 끄고 지운다. 네가 띄운 프로세스가 남지 않았는지 포트로 확인한다.

### 지킬 것

- `CLAUDE.md`를 따른다. 프로세스는 직접 띄운 것만 PID로 끈다. 신뢰 질문은 대신 답하지 않는다.
- 이 저장소는 공개다. 작업 기록, 시험 코드, 커밋 메시지, 그림에 사용자 경로·메일·토큰, 실제 PC·tailnet 이름, IP, 실제 대화 내용을 쓰지 않는다. 커밋 전·푸시 전 검사를 건너뛰지 않는다.
- 화면 글은 영어와 한국어 사전 둘 다 고친다. 한국어 문구는 사전의 지금 말투(`docs/log/korean-copy-review.md`)를 따른다.
- 같은 때 다른 작업자는 없다. 맡은 일에 필요한 만큼만 고치고, `styles.css`와 두 사전은 끝에 더해 합치기 쉽게 한다.
- 자기 브랜치에만 커밋한다. 커밋 메시지에 `Co-Authored-By` 줄을 넣지 않는다. `main`이나 `dev`를 바꾸거나 푸시하지 않는다. `node_modules`는 워크트리 안에서 받는다(`npm ci`, 창은 그 뒤 `node node_modules/electron/install.js`).
- 문서는 이 작업 파일의 작업 기록 절과 보고 절만 고친다. 고쳐야 할 ARCH·BRIEF·testing·README 문장은 보고 절에 짧게 적는다. 살아 있는 문서 예산이 거의 찼으니(70,000자 중 69,992자) 문장은 바꾸는 문장보다 길지 않게 적는다.
- 끝나면 보고 절을 쓰고, 맨 마지막에 `<워크트리>/backend/.dev/p88.done`(브랜치 이름, 마지막 커밋 해시, 시험 수 세 줄)을 만든다.

## 작업 기록

- 시작: `git fetch origin && git merge --ff-only origin/dev`(e4e11af). 워크트리 안에서 `npm ci`(백엔드, 창)와 Electron 받기. 물려받은 판 변수를 지우는 `backend/.dev/clean-env.sh`와 이 판의 값(atrium-dev-p88, 47897, `backend/.dev/data`·`app`)만 넣는 `backend/.dev/p88.sh`를 만들어 시험, 빌드, CLI를 그것으로 불렀다(git 밖). 처음 쓴 `p88.sh`는 경로 계산이 틀려 다른 데이터 폴더를 가리켰다. 그 판은 뜨지 않았고(“실행 중이 아닙니다”), 경로를 고정 값으로 고쳤다.
- RFC 8291 부록 A를 rfc-editor.org 원문에서 받아 시험 벡터로 썼다. 머리 86바이트와 암호문이 그대로 나온다.
- 백엔드: `backend/src/web-push.mjs`(VAPID 키·JWT, aes128gcm, 허용 목록, 주소 막기, 알릴 때 판단, 구독 기록, 보내기). `web.mjs`에 `push.*` API와 짝 풀기·원격 막기 고리, 기기 목록의 `push`. `backend.mjs` broadcastSession이 상태 바뀜마다 `push.onState`를 부른다. 연결 기록에 `push.on`·`push.off`·`push.fail`(+ `host` 필드). CLI `atrium remote push-test [기기]`.
- 창: `lib/push.js`(순수 함수), `push.js`(보이는 상태 알리기, 켜기·끄기, 누르면 그 세션), `PhonePush.jsx`(종 단추와 시트), `sw.js`의 `push`·`notificationclick`, `Phone.jsx`(종 단추, `?open=`, 서비스 워커 메시지), `WebDevices.jsx`(기기 줄의 알림 켜짐·마지막 알림, 기록 줄), `lib/remote.js`, `phone.css`·두 사전 끝에 더함.
- 창 시험 첫 번째(run1) 17/25: 판의 화면 말이 영어(기본)라 한국어 글을 기대한 검사가 틀렸고, CLI를 `execFileSync`로 불러 같은 프로세스의 흉내 푸시 서비스가 응답하지 못해(시간 초과) 그 뒤 검사가 따라 틀렸다. 시험이 판 말을 `ko`로 두고 CLI를 기다리지 않고 부르게 고쳤다. 화면 말을 바꾸면 알림 글의 말도 따라가게 했다(`onLanguage` → `push.prefs`).
- 창 시험 두 번째(run2) 25/25. 끝난 뒤 시험 세션, 백엔드, herdr 서버(`atrium-dev-p88`), 시험 폴더를 끄고 지웠다. 47897·47898·47899·9377과 `atrium-dev-p88` 프로세스가 남지 않은 것을 확인했다.

## 보고

### 한 것

- **보내기(백엔드).** 암호화(RFC 8291 aes128gcm)와 서명(RFC 8292 VAPID, ES256, `ieee-p1363` 서명)은 `node:crypto`로 직접 했다. `web-push` 패키지는 의존성 넷(http_ece, asn1.js, jws, https-proxy-agent)을 데려오는데 쓰는 것은 함수 셋이다. 직접 한 것은 RFC 8291 부록 A 벡터와 같은 바이트로 확인했다. VAPID 키는 처음 쓸 때 `<데이터 폴더>/vapid.json`(0600, 데이터 폴더는 사용자 프로필 아래)에 만든다. JWT는 aud = endpoint 출처, exp = 12시간(24시간 이하), sub = 저장소 주소(`ATRIUM_PUSH_SUBJECT`로 바꿈). TTL 4시간, 응답 필요·오류·시험은 Urgency high, 끝남만이면 normal.
- **구독.** 기기(짝 맺은 기기)마다 하나를 판 기록(meta `webPush`)에 둔다. 짝을 풀면 기록째 지우고, 원격 접속을 막거나 푸시 서비스가 404·410을 주면 구독만 지운다(종류·PC 설정은 남는다). 500 등은 `push.fail`과 마지막 실패만 남기고 구독은 둔다.
- **SSRF.** endpoint는 https, 포트 443, 사용자 정보 없음, IP 아님, 그리고 `*.push.apple.com`(Apple이 허용하라고 안내하는 범위, iOS는 web.push.apple.com), `fcm.googleapis.com`(Chrome·Android), `updates.push.services.mozilla.com`(Firefox), `*.notify.windows.com`(Edge WNS)만 받는다. 보낼 때 이름이 사설·루프백·링크 로컬·100.64/10(Tailscale)·IPv4 매핑 주소로 풀리면 보내지 않는다. 리디렉션은 따르지 않는다. 개발용 판만 `ATRIUM_PUSH_TEST_ORIGINS`(정확한 출처)와 `ATRIUM_PUSH_TEST_CA`를 더 받는다.
- **알릴 때.** 셸이 아닌 세션의 `working → ready`(끝남), `waiting`·`trust_wait`(응답 필요), `error`, `exited`의 `other`(예기치 않은 끝남, 오류 설정을 따른다). 사람이 끄거나 판이 끈 것(`normal`, `herdr_stopped`)과 백엔드를 다시 켠 뒤 처음 보는 상태는 뺀다. 같은 세션·같은 종류는 30초에 한 번, 기기마다 1.5초 안에 생긴 것을 한 알림으로 묶는다(“세션 3개”, 이름 넷까지, 누르면 응답 필요 세션이 먼저). 글은 “@이름 · 끝남/응답 필요/오류/세션 꺼짐”과 프로젝트 이름뿐이다. 연결 기록에는 알림 내용이 남지 않는다(`push.on`의 푸시 서비스 이름만).
- **보내지 않는 때.** 그 기기가 판 화면을 보고 있으면(연결 열림, `push.visible` 참. 알리지 않은 화면은 연결이 열려 있으면 보는 것으로), 원격 접속을 막았으면, 그 종류를 껐으면. PC 사용 중에도 받기(기기 설정)의 기본은 **끔**이다: PC의 보드 창에 최근 5분 안에 입력했으면(P47의 활성 기준과 같다) 사람이 PC 앞에 있고 응답 필요는 PC OS 알림이 이미 띄운다. 휴대폰까지 울리면 같은 일을 두 번 알린다.
- **휴대폰 화면.** 목록 머리줄의 종 단추 → 알림 시트: 알림 받기, 종류별 셋, PC를 쓰는 중에도 받기, 시험 알림 보내기, 개인 정보 안내. iOS 탭이면 “홈 화면에 추가한 앱에서 알림을 받을 수 있습니다”와 세 단계. 권한 거절, 구독 실패, 허용하지 않은 푸시 서비스, 지원 안 함, 구독 만료를 각각 알린다. 권한은 단추를 누른 동작 안에서 첫 `await`로 묻는다(공개 키는 시트를 열 때 미리 받는다).
- **서비스 워커.** `push`는 본문을 다시 잘라(`lib/push.js`) 알림을 띄운다. 모르는 본문도 “Atrium”으로 띄운다(iOS는 푸시마다 알림이 있어야 한다). `notificationclick`은 열린 앱 창을 앞으로 가져와 `atrium-open` 메시지로 그 세션을 열고, 창이 없으면 `?open=<세션 ID>`로 연다. 캐시 규칙(`sw-rules.js`)은 바꾸지 않았다.
- **PC.** 설정 › 연결된 기기의 기기 줄에 “알림 켜짐 (마지막 알림 …)”과 마지막 실패. 연결 기록 줄(알림 켬·끔·보내기 실패와 까닭). CLI `atrium remote push-test [기기]`, `atrium remote log`에 같은 줄.

### 시험

- 단위: 백엔드 621개 통과(새 `p88.test.mjs` 16개: RFC 8291 벡터, JWT 모양·만료·서명, 키 파일, 허용 목록과 주소 막기, 상태 → 종류, 글, 머리글과 풀어 본 내용에 질문·요청·답·오류 글 없음, 묶기·30초, 보는 중·PC 사용 중·종류 끔·원격 막음, 404·410·500, 짝 풀기·원격 막기). 창 336개 통과(새 `p88-lib.test.mjs` 6개). `npm run build` 통과.
- 창(`app/test/e2e/p88-push.mjs`, 개발용 판, 흉내 원격, Chromium iPhone 흉내) 25/25. 결과 `experiments/p88/p88-push.json`, 스크린숏 `01-install-hint`~`05-gone`.
  - 구독: Playwright Chromium의 진짜 `subscribe`는 Google FCM에 등록하므로 부르지 않고, `PushManager.subscribe`를 흉내 내어 흉내 푸시 서비스(로컬 https 47899, 자체 서명 인증서) 주소와 시험이 쥔 키를 주었다. 화면이 받은 VAPID 공개 키가 그대로 subscribe에 들어갔다.
  - 흉내 푸시 서비스가 받은 요청: ES256 서명이 맞고, aud = 그 출처, exp 12시간, k = 공개 키, TTL 14400, aes128gcm. 풀어 본 내용은 “@p88-a · 끝남”/“@p88-a · 응답 필요”와 “mtask-p88-a”뿐이고 요청 글·답 낱말·명령이 없다.
  - 보이는 동안 끝남 → 0번, 가려짐 흉내 뒤 끝남 → 1번(normal), 응답 필요 → 1번(high). 시험 알림, CLI 시험 알림, 410 → 구독 지움(휴대폰 시트 “만료”), 짝 풀기 → `push.off unpair`.
  - 서비스 워커 `push`는 CDP `ServiceWorker.deliverPushMessage`로 받은 내용을 넣어 `getNotifications()`로 확인했다. `notificationclick`은 CDP로 누를 수 없어, 그 뒤 화면 쪽(서비스 워커 메시지 → 세션 화면, `?open=` 주소 → 세션 화면)과 주소 만들기(단위 시험)만 확인했다.
- 하지 않은 것: 실제 iPhone과 Apple 푸시 서버(지시대로 보내지 않음), WebKit(Windows의 Playwright WebKit에는 웹 푸시가 없다), 두 세션 묶음의 창 시험(단위 시험만).

### 사람이 iPhone으로 받는 순서

1. PC 판이 원격 접속을 허용하고 휴대폰이 짝 맺어져 있다(Tailscale https 주소).
2. iPhone Safari에서 판 주소를 열고 공유 단추 → “홈 화면에 추가”. 홈 화면의 Atrium을 연다(iOS 16.4 이상).
3. 세션 목록 머리줄의 종 단추 → “알림 받기”를 켠다 → iOS가 묻는 알림 허용을 누른다. “이 기기에서 알림을 받습니다”가 보이고, PC 설정 › 연결된 기기의 그 기기 줄에 “알림 켜짐”이 보인다.
4. “시험 알림 보내기”(또는 PC에서 `atrium remote push-test`)를 누르고 홈 화면으로 나간다. “Atrium 시험 알림”이 온다.
5. 앱을 닫거나 홈 화면으로 나간 채 PC에서 세션에 일을 시킨다. 턴이 끝나면 “@이름 · 끝남”, 권한·질문에서 멈추면 “@이름 · 응답 필요”가 온다(앱을 보고 있는 동안에는 오지 않는다. PC 보드 창에 5분 안에 입력했으면 “PC를 쓰는 중에도 받기”를 켜야 온다).
6. 알림을 누르면 앱이 열리고 그 세션 화면으로 간다.
7. 안 오면: PC 설정 › 연결된 기기의 연결 기록에서 “알림 보내기 실패”의 까닭(예: `http_403`은 Apple이 서명을 거절함)을 본다. 구독이 만료되면 시트에 “다시 켜세요”가 보인다.

### 남은 것과 주의

- 실제 Apple 푸시 서버로는 보내 보지 않았다. Apple은 JWT `sub`가 올바르지 않으면 403(BadJwtToken)을 준다. 지금 `sub`는 저장소 https 주소다. 사람이 처음 받을 때 403이면 `ATRIUM_PUSH_SUBJECT`(mailto: 또는 https)로 바꿔 본다.
- 웹 화면은 원래(P48) 첫 터치에서 알림 권한을 묻는다(`web.js` askPermission). 홈 화면 앱에서 시트를 열기 전에 권한 대화상자가 먼저 뜰 수 있다. 바꾸지 않았다. 휴대폰에서는 빼는 것을 권한다.
- 원격 접속을 막았다가 다시 허용하면 휴대폰에서 알림을 다시 켜야 한다(지시의 “막으면 구독도 지운다”를 따름).

### 문서에 고칠 문장(예산이 차서 바꾸는 문장보다 짧게)

- BRIEF “정한 것” 원격 행 끝에 더함: “P88: 홈 화면 앱에 웹 푸시(끝남·응답 필요·오류, 이름과 종류만).” 그만큼 다른 문장을 줄인다.
- ARCH 1절 원격 문단: “웹 푸시(`web-push.mjs`): VAPID·aes128gcm을 node:crypto로, 알려진 푸시 서비스만, 보는 기기·PC 사용 중은 뺀다.”
- ARCH API 표: `push.key|status|subscribe|unsubscribe|prefs|visible|test`(기기, `push.test`는 PC도).
- testing.md 원격 줄 끝: “웹 푸시는 흉내 푸시 서비스(`ATRIUM_PUSH_TEST_ORIGINS`·`_CA`, 개발용 판만)와 흉내 subscribe로(P88).”
- README 원격 절: “휴대폰 홈 화면 앱에서 세션이 끝나거나 답이 필요하면 알림을 받는다.”
