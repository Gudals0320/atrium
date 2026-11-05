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

## 보고
