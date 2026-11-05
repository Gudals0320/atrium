상태: 열림
날짜: 2026-11-05

## 지시

### 목표

연결된 기기 탭에 "패스키로 확인" 켜기·끄기를 둔다. 기본은 꺼짐이다. 사용자의 말: "패스키가 유의미할까? … 패스키 on/off 옵션 추가하면 좋겠는데. 연결된 기기? 인가 하는 그 설정에 기본값은 꺼짐".

지휘 세션과 사용자가 정한 것(2026-11-05):
- 개인 노트북에서는 P57(Tailscale 기기 묶기), HttpOnly 쿠키, Origin 포트 확인, 붙음 알림과 연결 기록만으로도 다른 기기에서 쓰기와 몰래 쓰기를 막는다.
- 패스키가 더 막는 것은 노트북을 손에 넣은 사람이나 노트북 안의 악성 프로그램이 세션이 끝난 뒤 새 세션을 여는 것이다. 이것은 노트북의 Windows 잠금과 많이 겹친다.
- 사용자는 Windows Hello가 아니라 iPhone 패스키를 써서 다시 확인할 때마다 QR을 찍어야 할 수 있다.
- 그래서 패스키는 고를 수 있게 하고 기본은 끈다.

이 작업은 P60(설정 창, 연결된 기기 탭 재편, 휴대폰 패스키 고르기)을 합친 main에서 시작한다. P60의 보고 절을 먼저 읽는다.

### 할 것

1. **판 설정 `remotePasskey`(기본 꺼짐).** 연결된 기기 탭의 보안 설정 묶음에 스위치와 한 줄 설명을 둔다. 바꾸는 것은 이 PC 창만 할 수 있다. `atrium remote status`와 진단에도 지금 값을 보인다.
2. **끔일 때.**
   - 짝 맺기(코드, 허락)가 성공하면 패스키 등록 없이 기기가 생기고 곧바로 세션 쿠키를 받는다. 등록 허가 단계는 건너뛰거나 같은 응답에서 끝낸다. 짝 맺기의 Tailscale 기기 묶기(P57: 허가·요청을 받은 곳과 같은 곳)는 그대로다.
   - 세션은 짝을 풀 때까지 이어진다(만료 없음, 또는 쓰는 동안 저절로 늘어나는 긴 수명). 쿠키는 그대로 HttpOnly, SameSite=Strict, https면 Secure다. 연결마다 확인하는 차례(원격 받기 → Host·Origin → Tailscale 로그인 → 세션 → Tailscale 기기)는 그대로다.
   - "끊기"는 지금 연결만 닫고 세션은 남는다(노트북은 곧 다시 붙는다). "원격 받기 끄기"는 막는 동안 거부하고 연결을 닫지만 세션은 남아, 켜면 다시 붙는다. "짝 풀기"는 세션을 끝낸다.
3. **켬일 때.** 지금(P56~P60)과 같다. 짝 맺기 뒤 패스키 등록, 12시간·끊긴 채 30분 세션, 끊기와 원격 받기 끄기가 세션을 끝냄.
4. **바꿀 때.**
   - 끔 → 켬: 패스키가 없는 기기는 다음 접속 때 "패스키 등록" 화면을 본다. 지금 살아 있는 세션(그 Tailscale 기기에 묶인 것)으로 한 번 등록할 수 있다. 등록하면 세션은 켬의 수명으로 바뀐다. 기기 목록에 "패스키 등록 필요"를 보인다.
   - 켬 → 끔: 살아 있는 세션은 끔의 수명으로 늘어난다. 패스키가 있는 기기는 세션이 없으면 패스키로 한 번 들어온 뒤 끔의 수명을 받는다. 패스키 기록은 지우지 않는다.
5. **화면 글.** 스위치 설명은 끔과 켬의 차이를 한두 문장으로 쓴다(끔: 짝 맺은 Tailscale 기기에서 바로 열림. 켬: 세션이 끝나면 휴대폰이나 이 기기의 패스키로 다시 확인). README 두 파일의 원격 접속 절도 이에 맞게 고친다.
6. 연결 기록(P58)에 설정 바꿈과 "패스키 없이 짝 맺음"을 남긴다.

### 완료 기준

1. 단위 시험을 더하고 통과한다.
   - 끔: 짝 맺기만으로 세션, 오래 지나도 세션 유지, 끊기 뒤 다시 붙음, 원격 받기를 껐다 켜면 다시 붙음, 짝 풀기는 세션 끝, 다른 Tailscale 기기에서 쿠키 거부
   - 켬: 지금의 P56~P59 시험이 그대로 통과
   - 끔→켬: 패스키 등록 필요 표시, 지금 세션으로 등록, 다른 기기의 세션으로는 등록 거부
   - 켬→끔: 세션 수명 늘어남
   - 설정은 이 PC만 바꿈
2. 창 시험(개발용 판, Electron과 Playwright Chromium, 가짜 tailscale, 흉내 프록시)으로 끔과 켬의 흐름을 한 번씩 보고 결과를 `experiments/p62/`에 둔다. P59의 `p59-remote.mjs`는 켬으로 돌려 그대로 통과한다.
3. `cd backend && npm test`, `cd app && npm test`, `cd app && npm run build`가 통과한다.

### 읽을 파일

- `CLAUDE.md`, `docs/testing.md`, `docs/log/p56-remote-passkey-session.md`·`p58-remote-visibility.md`·`p59-remote-integrate.md`·`p60-settings-devices-phone-passkey.md`의 보고 절
- `backend/src/web.mjs`, `backend/src/web-auth.mjs`, `backend/src/settings.mjs`, `backend/src/remote-log.mjs`, `backend/bin/atrium-remote.mjs`
- `app/src/renderer/WebDevices.jsx`, `app/src/renderer/Pair.jsx`, `app/src/renderer/web.js`, `app/src/renderer/lib/passkey.js`, 두 사전
- `backend/test/p56·p57·p58·p59.test.mjs`, `app/test/e2e/p59-remote.mjs`·`p59-lib.mjs`

### 시험 환경

- 개발용 판은 너만의 판으로 띄운다(`docs/testing.md`).
  - `ATRIUM_HERDR_SESSION=atrium-dev-p62`, `ATRIUM_PORT=47886`(흉내 프록시는 47887, 47888)
  - `ATRIUM_DATA_DIR=<워크트리>/backend/.dev/data`, `ATRIUM_APP_USERDATA=<워크트리>/backend/.dev/app`
- 실제 판(`atrium`, 47800)과 다른 판의 포트는 쓰지 않는다. 사용자의 기본 herdr 세션과 다른 판의 herdr 서버는 건드리지 않는다.
- 대화 목록은 시험 폴더의 대화만 읽는다(`ATRIUM_CLAUDE_PROJECTS`, `ATRIUM_CLAUDE_DESKTOP=none`).
- 이 PC의 Tailscale 설정은 바꾸지 않는다. 읽기 명령만 부른다.
- 끝나면 시험 세션, 창, 브라우저, 프록시, 백엔드, herdr 서버와 세션(`atrium-dev-p62`만), 시험 폴더를 끄고 지운다. 네가 띄운 프로세스가 남지 않았는지 포트로 확인한다.

### 지킬 것

- `CLAUDE.md`를 따른다. 프로세스는 직접 띄운 것만 PID로 끈다.
- 이 저장소는 공개다. 작업 기록, 시험 코드, 커밋 메시지에 사용자 경로·메일·토큰, 실제 PC·tailnet 이름, IP를 쓰지 않는다. 커밋 전·푸시 전 검사를 건너뛰지 않는다.
- 보안 코드다. 막는 쪽이 기본이다. 끔에서도 Tailscale 기기 묶기, HttpOnly 쿠키, Origin 확인, 원격 받기, 연결 기록은 그대로 둔다. 비밀(세션 ID, 허가, 코드)은 로그, 기록, 화면에 쓰지 않는다.
- 자기 브랜치에만 커밋한다. 커밋 메시지에 `Co-Authored-By` 줄을 넣지 않는다. `main`을 바꾸거나 푸시하지 않는다. `node_modules`는 워크트리 안에서 받는다(`npm ci`).
- 문서는 이 작업 파일의 작업 기록 절과 보고 절, README 두 파일의 원격 접속 절만 고친다. 고쳐야 할 ARCH·BRIEF·testing 문장은 보고 절에 짧게 적는다.
- 끝나면 보고 절을 쓰고, 맨 마지막에 `<워크트리>/backend/.dev/p62.done`(브랜치 이름과 마지막 커밋 해시 두 줄)을 만든다.

## 작업 기록

2026-11-05 작업자 세션(워크트리 `worktree-p62`)

- 읽은 것: P56·P58·P59·P60 보고, `web.mjs`·`web-auth.mjs`·`settings.mjs`·`remote-log.mjs`·`atrium-remote.mjs`, `Pair.jsx`·`WebDevices.jsx`·`web.js`·`lib/passkey.js`, 백엔드 p56~p60 시험, 창 시험 `p59-remote.mjs`·`p59-lib.mjs`.
- 설계
  - 설정 값이 없거나 읽지 못하면 켬으로 본다(막는 쪽). 판 설정(`Settings.get`)은 늘 값이 있고 기본은 끔이다. 이렇게 하면 `settings: () => ({})`처럼 값 없이 띄우는 P48~P60 단위 시험이 손대지 않고 켬을 본다.
  - 세션 수명을 세션마다 고른다(`WebSessions.limits(s)`). 끔이면 끝이 없다(Infinity). 켬이어도 패스키 없이 짝 맺은 기기(`pairOnly`)의 세션은 끝나지 않는다. 그 세션은 패스키 등록에만 쓰이므로(WebSocket·`/web/me`·업로드는 401 `passkey_required`) "다음 접속 때 지금 세션으로 등록"이 며칠 뒤에도 된다.
  - 끔의 짝 맺기는 지금처럼 등록 허가를 만든 뒤 같은 응답에서 쓴다(`WebAuth.pairWithoutPasskey`). 그래서 허가의 확인(같은 출처, 같은 Tailscale 기기 = P57)을 그대로 거친다. 코드는 `/web/pair/code` 응답, 허락은 `/web/pair/poll` 응답이 쿠키를 준다.
  - 패스키 없는 기기와 옛 토큰 기기를 가르려고 기기 기록에 `pairOnly: true`를 둔다. 옛 기기(패스키도 `pairOnly`도 없음)는 끔에서도 `needsRepair`다. 패스키를 달면 `pairOnly`를 지운다.
  - 쿠키 수명은 세션의 남은 수명이다. 끝이 없으면 400일(브라우저 상한)이고 `/web/me`를 부를 때마다 다시 준다(쓰는 동안 늘어남). 켬 ↔ 끔을 바꾸면 웹 화면이 `settings.updated`를 보고 `/web/me`를 다시 불러 새 수명의 쿠키를 받는다.
  - 끔 → 켬: 모든 세션의 수명을 바꾼 때부터 센다(켬의 12시간·30분), 패스키 없는 기기의 연결은 4401로 닫는다. 웹 화면은 다시 열어 `/web/me` 401 `passkey_required`를 보고 "패스키 등록" 화면으로 간다. 등록(`/web/passkey/enroll/options`·`/enroll`)은 켬, 패스키 없는 기기, 살아 있는 세션, 그 세션이 묶인 Tailscale 기기일 때만이고, 챌린지는 그 기기와 세션 해시에 묶인다.
  - 켬 → 끔: 세션 수명은 `sessionLimits`가 따르므로 따로 할 일이 없다. 패스키 기록은 두고, 패스키 기기는 세션이 없으면 패스키 로그인으로 한 번 들어온다(로그인 화면은 그대로).
- 진행: 백엔드 → 단위 시험 `backend/test/p62.test.mjs` 8개 → 창(Pair, 기기 탭, 사전) → `app/test/p62-lib.test.mjs` 2개 → 창 시험 `app/test/e2e/p62-remote.mjs` → `p59-remote.mjs`(켬) → README.
- 막힌 곳
  - 워크트리에 `node_modules`가 없어 처음 시험이 모듈을 못 찾았다. `npm ci`로 받았다.
  - 가짜 인증기(`FakeAuthenticator`)는 첫 등록의 사용자 핸들을 기억하므로, 거부 시험에 쓰는 등록은 다른 인증기로 했다.
  - 연결 기록은 30일이 지나면 빠지므로, 시계를 40일 돌리는 시험은 `passkey.off` 줄을 돌리기 전에 읽는다.
  - 창 시험을 두 번째로 돌릴 때 `p59-remote.mjs`가 켜 둔 값이 남아 "처음 값이 끔" 확인이 실패했다. 처음 실행(새 데이터 폴더)에서는 끔을 확인했고, 그 확인은 기록만 하도록 고쳤다.

## 보고

### 만든 것

- **판 설정 `remotePasskey`(기본 끔)**: `settings.mjs`. remote*라 이 PC의 창·CLI만 바꾼다. 그 검사를 `touchesRemoteRules`로 빼서 `backend.mjs`와 시험이 같은 함수를 쓴다. 바꾸면 `settings.set` 감싸개가 `web.passkeyChanged(on)`을 부른다. `remote.status`에 `passkey`, 진단 줄 `passkey_on`·`passkey_off`(백엔드 없이 읽으면 `passkey` skip), `atrium remote status`에 "패스키로 확인 켜짐/꺼짐", `atrium devices` 줄에 "패스키 등록 필요"·"패스키 없음".
- **끔**
  - 코드(`/web/pair/code`)와 허락(`/web/pair/poll`)의 성공 응답이 `{ paired: true, device }`와 세션 쿠키(HttpOnly, SameSite=Strict, https면 Secure와 `__Host-`)를 준다. 허가는 같은 응답에서 쓰고 남지 않는다. P57 기기 묶기는 그대로다.
  - 세션은 짝을 풀 때까지다. 쿠키 Max-Age는 400일이고 `/web/me`마다 다시 준다.
  - 끊기(`device.disconnect`)는 연결만 닫고(4402) 세션은 남는다. 원격 받기 끄기는 거부하고 연결을 닫지만(4403) 세션은 남는다. 짝 풀기는 세션을 끝낸다.
  - 연결마다 확인하는 차례(원격 받기 → Host·Origin → Tailscale 로그인 → 세션 → Tailscale 기기)는 그대로다. 그 뒤에 "켬이면 패스키가 있어야 함"을 더했다.
- **켬**: P56~P60과 같다. 기존 단위 시험과 `p59-remote.mjs`가 그대로 통과한다.
- **끔 → 켬**: 패스키 없는 기기의 연결을 4401로 닫고, 그 기기의 `/web/me`·WebSocket·업로드는 401 `passkey_required`다. 기기 목록(`device.list`, `device.updated`)에 `needsPasskey`, PC 창 줄에 "패스키 등록 필요". 웹 화면은 "이 브라우저의 패스키 등록"(휴대폰·이 기기 고르기 포함)에서 `POST /web/passkey/enroll/options`·`/web/passkey/enroll`로 한 번 등록한다. 등록하면 세션은 켬의 수명(지금부터 12시간)으로 바뀌고 쿠키도 그 수명으로 다시 준다. 두 번째 등록은 409 `has_passkey`.
- **켬 → 끔**: 살아 있는 세션은 끝이 없어진다. 붙어 있는 웹 화면은 `settings.updated`를 보고 `/web/me`로 400일 쿠키를 다시 받는다. 패스키 기록은 지우지 않는다.
- **화면**: 연결된 기기 › 보안 설정 맨 위에 "패스키로 확인" 스위치와 끔·켬 설명. 끔이면 세션 시간 두 칸을 흐리게 하고 입력을 막으며, 그 아래에 "위의 두 시간은 패스키로 확인이 켜져 있을 때만 씁니다"를 보인다. 기기 줄에 "패스키 없음" 또는 패스키 종류, "패스키 등록 필요". 웹 화면의 "이 브라우저" 묶음에 "패스키 없이 짝 맺음, 로그아웃하면 다시 짝 맺어야 함". 끔이면 패스키를 못 쓰는 브라우저(보안 출처 아님 등)도 짝 맺기 화면을 본다.
- **연결 기록**: `pair.ok`에 `passkey: false`(패스키 없이 짝 맺음, CLI "패스키 없이", 창 "짝 맺음 · 패스키 없이"), 새 일 `passkey.on`·`passkey.off`·`passkey.add`, 끊김·거부 까닭 `passkey_required`. 끔의 짝 맺기는 `pair.grant` 줄을 남기지 않는다.
- **README** 두 파일의 원격 접속 절: 짝 맺기 뒤 곧바로 열림, "패스키로 확인"의 끔·켬·바꿀 때, 쿠키, 끊기·원격 받기 끄기가 끔·켬에서 다른 점, 기록과 `remote status`.

### 시험 결과

- `cd backend && npm test` 459/459(새 `test/p62.test.mjs` 8개). `cd app && npm test` 214/214(새 `test/p62-lib.test.mjs` 2개). `cd app && npm run build` 통과.
- 단위 시험(완료 기준)
  - 끔: 코드로 짝 맺기만으로 세션과 쿠키 속성, 허락(poll)으로 짝 맺기와 다른 Tailscale 기기의 poll 404, 짝 맺은 뒤 200일·끊긴 채 90일에도 세션 유지, 끊기 뒤 다시 붙음, 원격 받기 끄기 뒤 거부·켜면 다시 붙음, 짝 풀기는 세션 끝, B 주소에서 A의 쿠키 거부(HTTP·WebSocket).
  - 켬: P56~P60 시험 그대로(설정 값 없음 = 켬).
  - 끔 → 켬: 등록 필요 표시와 PC 창 알림, 4401, `passkey_required`(me·WebSocket·업로드), 켬인데 등록을 기다리는 세션은 며칠 뒤에도 남음, B에서 A의 세션으로 등록 401 `tailscale_node`, A의 챌린지를 B의 세션으로 답하면 `bad_challenge`, A에서 등록 → 보드, 쿠키 12시간, 13시간 뒤 끝나고 패스키 로그인.
  - 켬 → 끔: 11시간 된 세션이 40일 뒤에도 살아 있고 `/web/me`가 400일 쿠키, 로그아웃 뒤 패스키로 한 번 들어오면 끝 없는 세션, 끔에서도 B 주소의 패스키 로그인 401. 켬 → 끔 → 켬은 다시 켠 때부터 12시간.
  - 설정은 이 PC만: 기기 연결의 `settings.set { remotePasskey }`·`{ key: 'remotePasskey' }`는 `forbidden`. 설정을 못 읽거나 값이 없으면 켬. 옛 토큰 기기는 끔에서도 다시 짝 맺기 필요.
- 창 시험(개발용 판 `atrium-dev-p62`, 47886, 흉내 프록시 47887 = laptop-a·47888 = laptop-b, 가짜 tailscale, Electron과 Playwright Chromium, CDP 가상 인증기)
  - `app/test/e2e/p62-remote.mjs` 24/24: 끔에서 코드와 허락으로 패스키 없이 보드, 쿠키 400일, 목록 "패스키 없음", 스위치 설명, 끊기 뒤 다시 붙음, 원격 받기 끄고 켜면 다시 붙음, A의 쿠키를 B 주소로 거부 → 스위치 켬 → A·B "패스키 등록" 화면, 목록 "패스키 등록 필요", A 등록 → 같은 쿠키로 보드, 쿠키 12시간 → 스위치 끔 → A 쿠키 400일, B는 다시 열면 보드 → 짝 풀기 → 짝 맺기 화면. 연결 기록 18단계 차례, 비밀 없음. 처음 실행(새 데이터 폴더)에서 설정의 처음 값이 끔인 것도 봤다.
  - `p59-remote.mjs`(시작에 `remotePasskey: true`를 넣음) 21/21, 같은 판에서 `MT_E2E_*`로 덮어 돌림.
  - 결과·스크린숏·기록: `experiments/p62/`(P59 시험은 `experiments/p62/p59/`).
- 정리: 창과 브라우저와 흉내 프록시는 시험이 닫았다. 시험 셸 세션은 P59 시험이 껐다. 시험 워크스페이스 `mtask-p59-remote`를 판에서 닫고 빈 시험 폴더를 지웠다. 백엔드(`atrium --dev backend stop`)와 herdr 서버(`atrium-dev-p62`)를 끄고 그 herdr 세션 폴더만 지웠다. 47886~47888은 TIME_WAIT만 남고 듣는 프로세스가 없다. 실제 판, 기본 herdr 세션, 다른 판, Tailscale 설정은 건드리지 않았고 tailscale 명령은 부르지 않았다(가짜 tailscale만). 개발용 판 데이터(`backend/.dev`, git 밖)는 남겼다.

### 계획과 다른 곳

- 설정 값이 없거나 읽지 못하면 켬으로 본다(지시에는 기본 꺼짐만 있다). 판 설정에는 늘 값이 있으므로 실제 판의 기본은 끔이다.
- 끔 → 켬 때 패스키가 있는 기기의 세션도 바꾼 때부터 12시간·30분으로 센다(곧바로 끝내지 않는다). 패스키 없는 기기의 세션은 켬인 동안 끝나지 않지만 패스키 등록에만 쓴다.
- 패스키 등록(`enroll`)은 켬일 때만 된다(끔이면 409 `passkey_off`). 끔에서 패스키를 더하는 화면은 만들지 않았다.
- `/web/me`의 401에 `passkey`(지금 값, 비밀 아님)를 싣는다. 웹 화면이 끔일 때 패스키를 못 쓰는 브라우저도 짝 맺기 화면을 보이려고.
- 끔의 짝 맺기는 `pair.grant` 기록 줄이 없다(`pair.ok`에 `passkey: false`).
- 남의 파일을 고쳤다: `backend.mjs`(설정 감싸개), `tailscale.mjs`(진단 줄), `bin/atrium.mjs`(기기 줄), `store.js`(`settings.updated`에서 웹 쿠키 다시 받기), `styles.css`, `lib/remote.js`, `p59-remote.mjs`(시작에 켬).
- P57·P58 창 시험(`p57-node.mjs`, `p58-remote.mjs`)은 돌리지 않았다. 둘 다 패스키 등록을 거치므로 기본(끔) 판에서 돌리려면 `p59-remote.mjs`처럼 먼저 켜야 한다.

### 알려진 문제

- 끔에서 패스키 없이 짝 맺은 브라우저가 쿠키를 잃으면(쿠키 지우기, 로그아웃, 다른 프로필) 다시 짝 맺어야 한다. 옛 기기는 PC에서 짝 풀기 전까지 목록에 남는다.
- 끔에서는 노트북 안의 악성 프로그램이 브라우저 쿠키를 꺼내 같은 노트북에서 쓰는 것을 막지 못한다(지휘 세션과 사용자가 받아들인 위험). 다른 Tailscale 기기에서는 쿠키가 거부된다.
- 켬 → 끔 뒤 브라우저가 닫혀 있다가 12시간이 지나 열리면 옛 쿠키가 브라우저에서 이미 지워져 있다. 서버 세션은 살아 있지만 쓸 수 없어, 패스키 기기는 한 번 다시 확인하고 그 뒤 끔의 수명을 받는다.
- 실제 iPhone 패스키, 실제 하이브리드(QR), Windows Hello, 진짜 `tailscale serve`(https)로는 시험하지 않았다. 사용자 점검이 필요하다: 끔에서 노트북 짝 맺기와 다시 열기, 켜서 패스키 등록, 다시 끄기.

### 살아 있는 문서에 고칠 문장

- BRIEF "정한 것" 원격 행: "원격 기기는 짝 맺기만으로 HttpOnly 세션 쿠키를 받고 세션은 짝을 풀 때까지 이어진다. 판 설정 '패스키로 확인'(기본 끔)을 켜면 짝 맺은 뒤 패스키를 만들고 세션은 로그인 뒤 12시간, 끊긴 채 30분이다. 어느 쪽이든 짝 맺은 기기는 짝 맺을 때 확인한 Tailscale 기기에 묶인다(2026-11-05, P62)." 이전 문장(패스키 필수)은 `decisions.md`로.
- ARCH 원격 절: "패스키로 확인(`remotePasskey`, 기본 끔). 끔이면 짝 맺기 응답이 세션 쿠키를 주고 세션은 끝이 없으며(쿠키 400일, `/web/me`마다 다시 줌), 끊기·원격 받기 끄기는 연결만 닫는다. 켬이면 등록 허가 → 패스키 등록, 12시간·30분, 끊기·원격 막기가 세션을 끝낸다. 켬인데 패스키 없는 기기(`pairOnly`)는 패스키 등록만 할 수 있다(401 `passkey_required`)."
- ARCH API 표: `POST /web/passkey/enroll/options`·`/web/passkey/enroll`(패스키 없이 짝 맺은 기기, 켬일 때만). `/web/pair/code`·`/web/pair/poll`의 `paired: true`(끔). `/web/me`의 `passkey`. `device.list`의 `needsPasskey`·`passkey`(목록 전체 값). `remote.status`의 `passkey`. 판 설정 `remotePasskey`. 연결 기록 `passkey.on`·`passkey.off`·`passkey.add`, `pair.ok`의 `passkey: false`.
- testing.md 원격 창 시험 줄: 판의 기본은 패스키 끔이다. 패스키 흐름 시험(`p59-remote.mjs`)은 시작에 `remotePasskey`를 켜고, 끔 흐름은 `p62-remote.mjs`가 본다. 단위 시험의 `settings`에 `remotePasskey`가 없으면 켬으로 본다.
