상태: 열림
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

## 보고
