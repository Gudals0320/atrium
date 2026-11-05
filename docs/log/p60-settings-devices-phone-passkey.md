상태: 열림
날짜: 2026-11-05

## 지시

### 목표

설정 창과 연결된 기기 탭을 다듬고, 휴대폰(iPhone) 패스키로 짝 맺기와 다시 확인을 쉽게 한다. 사용자의 말: "설정 창이 하단이 잘리는거같은데 설정 창 약간 키우고 스크롤도 추가하자", "일반에 배율설정에 updown 키 디자인이 안어울려", "노트북에서 열 주소 복사 버튼도 만들어주고 `연결된 기기` 탭 재편좀 해봐", "내가 windows hello 안쓰고 iphone passkey만 씀".

### 할 것

1. **설정 창 크기와 스크롤.** 창을 조금 키운다(너비와 높이 모두, 창 크기에 맞춰 상한을 둔다). 제목, 탭 줄, 아래 닫기 단추는 고정하고 탭 내용만 스크롤한다. 1366×768과 그보다 낮은 창 높이, 웹 화면에서도 아래가 잘리지 않아야 한다.
2. **배율 입력(일반 탭의 화면 배율, 터미널 글자 배율).**
   - 숫자 칸의 기본 위아래 화살표(브라우저 스핀 단추)를 숨긴다.
   - −·+ 단추는 판의 단추 모양에 맞춘다(같은 높이, 모서리, 정렬).
   - 칸 뒤의 "100%"가 무엇인지 확인한다. 기본값 표시라면 "기본으로" 되돌리기 단추로 바꾸고, 같은 값을 두 번 보이는 것이면 뺀다.
3. **연결된 기기 탭 재편.** 지금은 짝 맺기, 기기 목록, 원격 받기, 연결 기록, Tailscale 진단, 사용자 규칙, 세션 시간이 한 줄로 길게 이어진다. 다음 차례의 묶음으로 다시 짠다. 각 묶음에 제목과 한 줄 설명을 둔다.
   1. **요약.** 원격 받기 스위치, 상태(받는 중·막음, 지금 붙은 기기 n대), 노트북에서 열 주소. 주소 옆에 **복사 단추**를 두고, 누르면 "복사했습니다"를 잠깐 보인다. serve가 판으로 가지 않으면 켜는 명령을 보이고 그것도 복사 단추를 둔다. 명령은 PATH에 기대지 않는 `node backend\bin\atrium.mjs remote enable --yes …` 꼴이다. 같은 이름의 다른 serve 항목 때문에 관리자 권한이 필요하면 그 안내도 보인다.
   2. **짝 맺기.** 새 코드(큰 코드와 남은 시간), 허락 요청.
   3. **짝 맺은 기기.** 기기마다 Tailscale 기기 이름, 브라우저 별칭, 패스키 종류(휴대폰·이 기기, 아래 4번), 지금 연결 여부, 마지막 접속, 끊기·짝 풀기 단추. "다시 짝 맺기 필요" 기기는 따로 모은다.
   4. **보안 설정.** 세션 시간, 끊긴 뒤 유지 시간, Tailscale 사용자 규칙.
   5. **Tailscale 진단.** 기본으로 접혀 있고, 펼치면 점검 줄과 새로 고침이 있다. 문제가 있으면 요약에 경고 한 줄을 띄운다.
   6. **연결 기록.** 기본으로 최근 몇 줄만 보이고 "더 보기"로 늘린다.
   - 웹 화면(브라우저)에서 이 탭은 자기 기기 정보와 로그아웃, 이 브라우저 짝 풀기만 보인다.
4. **휴대폰 패스키.** 사용자는 Windows Hello가 아니라 iPhone 패스키(iCloud 키체인)를 쓴다. 노트북 브라우저에서 휴대폰으로 확인하는 길(하이브리드, QR과 블루투스)을 먼저 보이게 한다.
   - 지금 등록·로그인 선택 사항의 `hints`는 `['client-device', 'security-key']`라서 브라우저가 노트북 내장 인증기를 먼저 띄울 수 있다(`backend/src/passkey.mjs`).
   - 짝 맺기와 다시 확인 화면에 "휴대폰으로(iPhone·Android)"와 "이 기기로(Windows Hello·보안 키)"를 둔다. 고른 것은 브라우저에 기억한다(비밀 아님). 서버는 고른 것에 따라 `hints`를 준다: 휴대폰이면 `['hybrid']`, 이 기기면 `['client-device', 'security-key']`, 고르지 않았으면 주지 않는다.
   - iCloud 키체인 패스키와 맞는지 확인한다: signCount가 늘 0, 백업 플래그(BE·BS)가 켜짐, ES256. 가짜 인증기로 그 모양을 흉내 낸 단위 시험을 더한다. 등록 때 받은 transports(`hybrid` 등)로 기기 목록에 패스키 종류를 보인다.
   - 사용자 화면에 짧게 알린다: 휴대폰으로 확인할 때는 노트북 블루투스가 켜져 있어야 하고, 노트북 화면의 QR을 휴대폰 카메라로 찍는다.

### 완료 기준

1. 단위 시험을 더하고 통과한다: `hints` 고르기, iCloud 모양(signCount 0, BE·BS) 등록과 로그인, transports로 패스키 종류.
2. 창 시험(개발용 판, Electron과 Playwright Chromium)으로 확인하고 결과를 `experiments/p60/`에 둔다.
   - 설정 창이 두 화면 크기와 낮은 창 높이에서 잘리지 않고 탭 내용이 스크롤된다.
   - 배율 칸에 기본 스핀 단추가 보이지 않는다.
   - 주소 복사 단추가 클립보드에 주소를 넣는다.
   - 연결된 기기 탭이 새 차례로 보인다(전후 스크린숏).
   - CDP 가상 인증기(가능하면 transport `cable`/`hybrid`)로 휴대폰 선택이 `hints`에 실리는 것을 본다.
3. `cd backend && npm test`, `cd app && npm test`, `cd app && npm run build`가 통과한다.

### 읽을 파일

- `CLAUDE.md`, `docs/testing.md`, `docs/log/p56-remote-passkey-session.md`·`p59-remote-integrate.md`의 보고 절
- `app/src/renderer/Settings.jsx`, `app/src/renderer/WebDevices.jsx`, `app/src/renderer/Pair.jsx`, `app/src/renderer/lib/passkey.js`, `app/src/renderer/styles.css`, 두 사전
- `backend/src/passkey.mjs`, `backend/src/web-auth.mjs`, `backend/test/fake-authenticator.mjs`, `app/test/e2e/p59-remote.mjs`·`p59-lib.mjs`

### 시험 환경

- 개발용 판은 너만의 판으로 띄운다(`docs/testing.md`).
  - `ATRIUM_HERDR_SESSION=atrium-dev-p60`, `ATRIUM_PORT=47882`(흉내 프록시가 필요하면 47884)
  - `ATRIUM_DATA_DIR=<워크트리>/backend/.dev/data`, `ATRIUM_APP_USERDATA=<워크트리>/backend/.dev/app`
- 실제 판(`atrium`, 47800)과 다른 판의 포트는 쓰지 않는다. 사용자의 기본 herdr 세션과 다른 판의 herdr 서버는 건드리지 않는다.
- 대화 목록은 시험 폴더의 대화만 읽는다(`ATRIUM_CLAUDE_PROJECTS`, `ATRIUM_CLAUDE_DESKTOP=none`). 시험 폴더가 필요하면 `C:\Workspace\mtask-p60-*`처럼 새로 만든다.
- 이 PC의 Tailscale 설정은 바꾸지 않는다. 읽기 명령만 부르고, 원격 시험은 가짜 tailscale(`app/test/e2e/p49-fake-tailscale.mjs`)과 흉내 프록시(`backend/tools/ts-sim-proxy.mjs`)로 한다.
- 끝나면 시험 세션, 창, 브라우저, 프록시, 백엔드, herdr 서버와 세션(`atrium-dev-p60`만), 시험 폴더를 끄고 지운다. 47879 같은 다른 판 포트를 듣는 네 프로세스가 남지 않았는지 확인한다.

### 지킬 것

- `CLAUDE.md`를 따른다. 프로세스는 직접 띄운 것만 PID로 끈다.
- 이 저장소는 공개다. 작업 기록, 시험 코드, 커밋 메시지에 사용자 경로·메일·토큰, 실제 PC·tailnet 이름, IP를 쓰지 않는다. 커밋 전·푸시 전 검사를 건너뛰지 않는다.
- 생김새는 지금 판의 색, 크기, 모양 토큰(`app/src/renderer/styles.css`)을 따른다. 바꾸기 전과 뒤 스크린숏을 1584×921과 1366×768에서 `experiments/p60/`(git 밖)에 남긴다. 움직임은 짧고 가볍게(약 150~200ms) 하고, `prefers-reduced-motion`이면 움직이지 않는다.
- 화면 글은 영어와 한국어 사전 둘 다 고친다.
- 같은 때 다른 작업자(P61(명령 바와 찾기 창))가 돈다. 맡은 일에 필요한 만큼만 고친다. `styles.css`와 두 사전은 끝에 더해 합치기 쉽게 한다.
- 자기 브랜치에만 커밋한다. 커밋 메시지에 `Co-Authored-By` 줄을 넣지 않는다. `main`을 바꾸거나 푸시하지 않는다. `node_modules`는 워크트리 안에서 받는다(`npm ci`).
- 문서는 이 작업 파일의 작업 기록 절과 보고 절만 고친다. 고쳐야 할 ARCH·testing 문장이 있으면 보고 절에 짧게 적는다.
- 끝나면 보고 절을 쓰고, 맨 마지막에 `<워크트리>/backend/.dev/p60.done`(브랜치 이름과 마지막 커밋 해시 두 줄)을 만든다.

## 작업 기록

- 읽은 것: 지시 파일, `docs/testing.md`, P59 보고 절, 설정 창·기기 탭·짝 맺기 화면·패스키 코드(창과 백엔드), 가짜 인증기, P59 창 시험 도구.
- 옛 화면에서 찾은 것: 설정 창의 탭 내용(`.mt-set-body`)이 `overflow: hidden`이라 기기 탭(내용 1214px, 보이는 칸 385px)의 아래가 잘렸다. 배율 칸 뒤의 "100%"는 100%로 되돌리는 단추였다(값을 두 번 보이는 것이 아니다). 그래서 "기본으로" 단추로 바꿨다.
- 백엔드: 고른 인증기(`via`)를 hints로 바꾸는 함수, 등록 때 받은 transports·붙임·BS로 패스키 종류, 로그인 선택 사항의 allowCredentials에 transports, `remote.status`에 켜기 명령과 다른 serve 항목 수를 더했다. 가짜 인증기에 iCloud 모양(`icloud: true`)을 더했다.
- 창: 기기 탭을 여섯 묶음으로 다시 짰다(`WebDevices.jsx`, 순수 함수는 `lib/devices-tab.js`). 짝 맺기와 다시 확인 화면에 휴대폰·이 기기 고르기(`ViaChoice`)를 두었다. 설정 창을 키우고 탭 내용만 스크롤하게 했다. 배율 칸을 −·값·+ 한 덩어리로 바꿨다. 스타일과 두 사전은 끝에 더했다.
- 바꾸기 전 스크린숏: 첫 커밋 뒤 `app/src/renderer`만 `bef5e9a`로 잠깐 되돌려 빌드하고(`P60_PHASE=before`) 찍은 뒤 되돌렸다.
- 창 시험에서 고친 것: 가운뎃점(·)이 웹 화면 글꼴에서 거의 보이지 않아 고르기 칸의 작은 글을 쉼표로 바꿨다. 고른 칸에 마우스를 올리면 hover 배경이 고른 표시를 덮어 고쳤다. 켜기 명령이 말줄임으로 잘려 줄을 바꿔 다 보이게 했다.
- 기존 창 시험 둘(`p58-remote.mjs`, `p59-remote.mjs`)은 연결 기록이 이제 최근 몇 줄만 보이므로 "더 보기"를 누른 뒤 줄을 읽게 고쳤다.

## 보고

### 만든 것

- **설정 창 크기와 스크롤**: 창을 760×540에서 860×680으로 키웠다(창 크기에서 32px를 뺀 값이 상한, 웹 화면은 `dvh`). 제목, 탭 줄, 닫기 단추는 그대로 두고 탭 내용만 스크롤한다. 창 높이가 600px 이하면 위아래 여백을 줄인다. 폭이 640px 이하면 설정 줄이 한 칸이 된다.
- **배율 칸**: 숫자 칸의 브라우저 스핀 단추를 숨겼다(`.mt-nospin`). −·값·%·+를 판 단추와 같은 높이 30px, 모서리 9px의 한 덩어리(`.mt-stepper`)로 만들었다. 뒤의 "100%" 단추는 "기본으로"(Reset)가 되었고 마우스를 올리면 "100%로 되돌립니다"가 보인다.
- **연결된 기기 탭**(PC 창): 요약 → 짝 맺기 → 짝 맺은 기기 → 보안 설정 → Tailscale 진단 → 연결 기록 차례다. 묶음마다 제목과 한 줄 설명이 있다.
  - 요약: 원격 받기 스위치, 받는 중·막음 알약, 지금 붙은 기기 수(판에 붙은 웹 클라이언트의 기기 ID로 셈), 노트북에서 열 주소와 복사 단추("복사했습니다"를 1.6초 보임). serve가 판으로 가지 않으면 켜는 명령과 복사 단추가 보인다. 명령은 `node <이 백엔드>\bin\atrium.mjs [--dev] remote enable --yes [--https-port n]`이다(경로에 공백이 있으면 따옴표). 같은 Tailscale 이름에 다른 서비스의 serve 항목이 있으면 관리자 권한 PowerShell 안내를 함께 보인다. 진단에 안 됨·주의가 있으면 경고 한 줄과 "진단 보기" 단추를 띄운다.
  - 짝 맺기: 큰 코드와 남은 시간, 허락 요청. 요청이 없으면 그렇게 적는다.
  - 짝 맺은 기기: 연결 점, Tailscale 기기 이름, 브라우저 별칭, 패스키 종류(휴대폰 패스키, 기기 내장 패스키, 보안 키), 연결됨 또는 마지막 접속, 로그인 수, 끊기(연결된 기기만)·짝 풀기. 지금 붙은 기기가 먼저 온다. "다시 짝 맺기 필요" 기기는 아래에 따로 모은다.
  - 보안 설정: 세션 시간, 끊긴 뒤 유지 시간, 내 Tailscale 사용자만, 더 받을 로그인.
  - Tailscale 진단: 기본으로 접혀 있다(`<details>`, 점검 줄은 접혀 있어도 DOM에 있음). 펼치면 점검 줄과 "다시 확인"이 있다.
  - 연결 기록: 최근 6줄, "n줄 더 보기"로 30줄씩 늘리고 "줄이기"로 되돌린다.
  - 웹 화면(브라우저)의 이 탭은 "이 브라우저" 묶음 하나다. 자기 기기 정보(이름, 별칭, 패스키 종류, 짝 맺은 때), 로그아웃, 이 브라우저 짝 풀기(`device.forget`)만 있다.
- **휴대폰 패스키**:
  - 짝 맺기의 패스키 만들기 화면과 다시 확인 화면에 "휴대폰으로(iPhone, Android)"와 "이 기기로(Windows Hello, 보안 키)"가 있다. 휴대폰이 먼저다. 처음에는 아무것도 고르지 않은 상태다. 고른 것은 `localStorage atrium.passkeyVia`에 둔다(비밀 아님). 휴대폰을 고르면 "노트북 블루투스를 켜 둡니다. 이 화면에 QR이 뜨면 휴대폰 카메라로 찍고 휴대폰에서 확인합니다"를 보인다.
  - 서버(`passkey.mjs passkeyHints`)는 `via`에 따라 hints를 준다. 휴대폰이면 `['hybrid']`, 이 기기면 `['client-device', 'security-key']`, 고르지 않았거나 모르는 값이면 주지 않는다. 등록 선택 사항은 휴대폰이면 `authenticatorSelection.authenticatorAttachment: 'cross-platform'`도 준다.
  - 로그인 선택 사항의 `allowCredentials`에 등록 때 받은 transports를 싣는다(브라우저가 그 길로 곧바로 간다).
  - 기기 기록에 transports, 붙임(platform·cross-platform), BE·BS를 둔다. 로그인 때 BS를 새로 적는다. 목록(`devicePub`)은 `passkey.kind`(`passkeyKind`: hybrid·cable이면 phone, internal·platform이면 device, usb·nfc·ble이면 key), `transports`, `backedUp`을 싣는다. 공개 키와 credential ID는 여전히 싣지 않는다.
  - iCloud 키체인 모양과 맞는지: signCount가 늘 0인 패스키는 원래 규칙(둘 다 0이면 받음)으로 여러 번 로그인된다. 한 번 0이 아닌 카운터를 본 뒤 0이 오면 여전히 거부한다. BE·BS 켜짐과 ES256은 그대로 받는다. 이것을 가짜 인증기(`FakeAuthenticator({ icloud: true })`)로 단위 시험했다.

### 시험 결과

- `cd backend && npm test` 451/451(새 `test/p60.test.mjs` 6개: hints 고르기, iCloud 모양 등록·로그인, WebAuth로 transports·백업·종류, 패스키 종류 표, 켜기 명령 글, HTTP로 via → hints와 기기 목록). `cd app && npm test` 206/206(새 `test/p60-lib.test.mjs` 7개). `cd app && npm run build` 통과. 공개 검사(`check-public --tree HEAD`) 통과.
- 창 시험 `app/test/e2e/p60-settings.mjs`(개발용 판 `atrium-dev-p60`, 47882, 흉내 프록시 47884, 가짜 tailscale, Electron과 Playwright Chromium) 36/36.
  - 설정 창: 1584×921, 1366×768, 1366×600, 1280×520에서 창이 화면 안에 들어오고 닫기 단추가 보인다. 탭 내용만 스크롤되고(`overflow-y: auto`), 끝까지 스크롤해도 제목·탭·닫기 자리는 그대로고 끝 묶음이 보인다. 웹 화면(1366×768, 1280×520)도 같다.
  - 배율 칸: `appearance: textfield`(스핀 단추 없음), 덩어리 30px, 기본으로 단추 30px, 모서리 둘 다 9px. +는 105%, 기본으로는 100%.
  - 복사: 주소 복사 단추로 Electron 클립보드에 `https://pc.example.ts.net/`이 들어가고 "Copied"가 보였다가 사라진다. 가짜 serve를 "다른 서비스가 443"으로 바꾸면 켜기 명령(`… --dev remote enable --yes --https-port 8443`), 관리자 권한 안내, 요약의 serve 경고 줄이 보이고, 명령 복사도 클립보드에 들어간다.
  - 기기 탭 차례(`summary,pair,devices,security,diagnostics,log`), 묶음마다 제목·설명, 진단 접힘(점검 줄 12개), 요약의 받는 중·붙은 기기 1대, 기기 줄의 휴대폰 패스키·연결됨·끊기·짝 풀기, 연결 기록 6줄 → 더 보기 30줄.
  - 패스키: CDP 가상 인증기 transport `cable`로 휴대폰을 고르면 등록 요청에 `via: phone`, 응답 hints `["hybrid"]`와 붙임 `cross-platform`. 가상 인증기가 낸 transports는 `["ble","hybrid"]`이고 목록의 종류는 phone이다. 로그아웃 뒤 다시 확인 화면에 휴대폰이 골라져 있고, 로그인 요청은 `via: phone`, 응답은 hints `["hybrid"]`, allowCredentials에 transports가 있다. transport `internal`로 이 기기를 고르면 hints `["client-device","security-key"]`, 종류 device.
  - 웹 화면 기기 탭은 `self` 묶음 하나와 로그아웃·짝 풀기만 있다.
  - 스크린숏: `experiments/p60/before-*`(옛 화면)와 `after-*`(새 화면), 1584×921·1366×768·낮은 창, 웹 화면. 기록은 `p60-settings-before.txt`·`after.txt`, 결과 JSON.
- 같은 판에서 기존 창 시험도 돌렸다: `p57-node.mjs` 9/9, `p58-remote.mjs` 14/14, `p59-remote.mjs` 21/21(앞의 두 시험은 연결 기록 미리보기에 맞게 고침, 결과는 `experiments/p60/p57`, `p60/p58`, `p59`).
- 정리: 창, 브라우저, 흉내 프록시, 백엔드, herdr 서버(`atrium-dev-p60`)를 끄고 그 herdr 세션 폴더를 지웠다. P59 시험이 연 워크스페이스(`mtask-p59-remote`)를 판에서 닫고 그 폴더를 지웠다. 시험이 띄운 셸 세션은 P59 시험이 스스로 껐다(`ls` 세션 없음). 47879~47885를 듣는 프로세스가 없다. 실제 판, 기본 herdr 세션, 다른 판, Tailscale 설정은 건드리지 않았고 tailscale 명령은 부르지 않았다(가짜 tailscale만). 개발용 판 데이터(`backend/.dev`, git 밖)는 남겼다.

### 계획과 다른 곳

- 휴대폰을 고르면 hints 말고 등록의 `authenticatorAttachment: 'cross-platform'`도 준다. hints를 읽지 않는 브라우저와 Windows의 패스키 대화상자도 노트북 내장 인증기를 건너뛰게 하려는 것이다. 이 기기는 보안 키도 받으므로 붙임을 묶지 않는다.
- 로그인 선택 사항의 allowCredentials에 등록 때 받은 transports를 싣는다(지시에 없음). 휴대폰 패스키는 브라우저가 곧바로 하이브리드로 간다.
- 관리자 권한 안내는 조건이 "같은 Tailscale 이름에 판이 아닌 serve 항목이 있음"이다. 판은 명령을 실행하지 않으므로 실제 `Access denied`가 났는지는 모른다. 안내는 "Access denied로 멈추면 관리자 PowerShell에서 다시"라고 쓴다.
- 켜기 명령은 이 백엔드의 `atrium.mjs` 절대 경로로 만든다(백엔드 `enableCommand`). 개발용 판이면 `--dev`를 붙인다. `ATRIUM_PORT` 같은 환경 변수로 포트를 바꾼 시험 판에서는 명령에 그 값이 없다(실제 판과 기본 개발용 판은 맞다).
- 가짜 tailscale에 `P60_FAKE_SERVE_FILE`을 더했다. 그 파일에 `other`가 있으면 443을 다른 서비스가 쓰고 판으로 가는 serve가 없다.
- 설정 창 높이는 탭마다 같다(680). 내용이 짧은 일반 탭은 아래가 빈다. 탭을 바꿀 때 창 크기가 흔들리지 않게 하려고 그대로 두었다.
- "다시 짝 맺기 필요" 묶음은 단위 시험(`groupDevices`)으로만 봤다. 판 API로 옛 기기를 만들 수 없어 창 시험 화면에는 없다.

### 알려진 문제

- 실제 iPhone(iCloud 키체인), 실제 하이브리드(QR과 블루투스), Windows Hello로는 시험하지 않았다. 가상 인증기와 가짜 인증기만 썼다. 사용자 점검이 필요하다: 노트북 Chrome에서 휴대폰으로 짝 맺기, 다시 확인, 기기 목록의 "휴대폰 패스키" 표시.
- hints는 브라우저마다 지원이 다르다(읽지 않는 브라우저는 붙임과 transports만 본다). Windows 대화상자가 그래도 Windows Hello를 먼저 띄울 수 있다.
- 판의 고정폭 글꼴은 역슬래시를 ₩ 모양으로 그린다(켜기 명령 줄). 복사된 글은 역슬래시다(클립보드 시험으로 확인).
- 판에 붙은 기기 수는 판에 붙은 웹 클라이언트(`clients.updated`)로 센다. 옛 백엔드에서는 0으로 보일 수 있다.

### 살아 있는 문서에 고칠 문장

- ARCH API 표: `POST /web/passkey/register/options`·`/login/options`는 `via`(`phone`|`device`, 없으면 브라우저가 정함)를 받아 hints를 고른다. `remote.status`에 `enableCmd`(복사할 켜기 명령), `serveOthers`(판이 아닌 serve 항목 수). `device.list`의 `passkey`에 `kind`(phone·device·key·unknown), `transports`, `backedUp`.
- ARCH 원격 절: "짝 맺기와 다시 확인에서 휴대폰(하이브리드)과 이 기기(Windows Hello·보안 키) 가운데 고르고, 고른 것은 브라우저에 기억한다(비밀 아님)."
- testing.md 원격 창 시험 줄: 가짜 tailscale은 `P60_FAKE_SERVE_FILE`(내용 `other`)로 serve가 판으로 가지 않는 상태를 흉내 낸다. CDP 가상 인증기 transport `cable`은 휴대폰(transports `ble`, `hybrid`)을 흉내 낸다. 창 시험은 끝나도 백엔드가 남으므로, 환경 변수(`ATRIUM_WEB_HOSTS` 등)가 다른 시험을 같은 판에서 이어 돌리려면 먼저 `atrium --dev backend stop`을 한다.
