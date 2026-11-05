상태: 열림
날짜: 2026-11-05

## 지시

### 목표

원격 강화 S4다. PC에 앉은 사람이 원격 연결을 바로 보고, 끊고, 막을 수 있게 한다. SSH의 접속 기록에 해당하는 기록도 남긴다. 사용자의 말: "보안 강화 S1~S4 작업 진행해".

사용자와 정한 것(2026-11-05):
- 원격 판은 PC에 내 계정으로 셸을 여는 것과 같은 권한이다. 그러니 보안 기준은 SSH만큼이다.
- 지금 막는 문은 셋이다. tailnet 안에서만 열기(`tailscale serve`), 이 PC와 같은 Tailscale 사용자만 받기, PC에서 짝 맺기(6자리 코드나 허락).
- SSH보다 약한 곳: (1) 기기 토큰이 들고만 있으면 되는 bearer 토큰이고 브라우저 localStorage에 평문으로 있다. (2) Tailscale 사용자만 보고 기기는 보지 않는다. (3) 토큰이 영구이고 다시 확인하지 않는다. (4) PC에서 원격 연결을 보고 끊기가 약하다.
- 강화안 넷을 P56~P58로 나눠 맡긴다. S1 Tailscale 기기에 묶기(P57), S2 패스키(P56), S3 세션을 스크립트가 못 읽게(P56), S4 PC에서 보이고 끊기(P58).
- 사용자는 노트북에서 `https://<pc>.<tailnet>.ts.net:10000/`으로 실제 접속을 확인했다. 공개 저장소이므로 실제 PC 이름, tailnet 이름, 로그인, IP는 어디에도 쓰지 않는다.

### 할 것

1. **연결 기록.** 원격 관련 일을 판 데이터 폴더의 기록에 남긴다.
   - 남길 일: 짝 맺기 요청, 짝 맺기 성공·실패, 코드 틀림, 연결과 끊김, 거부(까닭: Host, Origin, 로그인, 자격 등), 짝 풀기, 원격 받기 끄기·켜기.
   - 남길 값: 시각, 기기 ID와 이름, 바깥 요청이면 Tailscale 로그인과 tailnet 주소, 브라우저 종류. 비밀(토큰, 코드, 세션 ID)은 남기지 않는다.
   - 크기에 상한을 둔다(예: 최근 2000개, 30일).
   - 새 모듈(예: `backend/src/remote-log.mjs`)에 두고, `web.mjs`에서는 `authorize` 결과(받음·거부와 까닭)와 짝 맺기·끊기 자리에서 한 줄로 부른다. P56(패스키 로그인)과 P57(Tailscale 기기 확인)이 같은 때 거부 까닭을 더하므로, 까닭은 문자열 코드로 받아 그대로 남긴다.
   - API는 `remote.log { limit }`(이 PC만)로 연다. 설정 → 연결된 기기 탭에 최근 기록을 보인다.
2. **붙으면 알리기.** 원격 기기가 새로 붙으면(그 기기의 연결이 없다가 생기면) PC 창에 토스트를 띄운다. 창이 숨어 있으면 OS 알림을 띄운다. 예: "노트북이 원격으로 붙었습니다". 짝 맺기 성공도 알린다. 같은 기기가 잠깐 끊겼다 다시 붙는 것(다시 연결)은 몇 분 안에는 다시 알리지 않는다.
3. **알약에서 끊기.** 위쪽 "다른 기기 n" 알약(`Peers.jsx`)의 원격 기기마다 두 버튼을 둔다.
   - "끊기": 지금 연결을 닫는다. 기기는 다시 붙을 수 있다.
   - "짝 풀기": 짝을 풀고 연결을 닫는다(확인 대화상자).
   - API는 `device.disconnect { id }`(이 PC만)를 더한다. P56이 합쳐지면 끊기가 그 기기의 세션도 끝내야 한다. 지휘 세션이 합칠 때 이을 수 있도록 끊기 처리에 걸림 고리(예: `onDisconnectDevice`)를 둔다.
4. **원격 받기 스위치.** 판 설정에 "원격 받기"(기본 켬)를 둔다.
   - 끄면 이 PC 밖에서 온 요청(바깥 요청과 기기 연결)을 모두 거부하고, 붙어 있는 원격 연결을 닫는다. 이 PC의 창과 CLI는 그대로다.
   - 스위치는 설정의 연결된 기기 탭, 트레이 메뉴, `atrium remote block|allow`에 둔다. Tailscale serve 설정은 건드리지 않는다.
   - 꺼져 있으면 웹 화면은 "PC에서 원격을 막았습니다"를 보인다. `remote status`도 그것을 보인다.

### 완료 기준

1. 단위 시험을 더하고 통과한다.
   - 기록: 남기기, 상한, 비밀 빠짐, 까닭 코드
   - 알림: 새로 붙음만 알림, 다시 연결은 다시 알리지 않음
   - 끊기: 그 기기의 연결만 닫힘
   - 원격 받기 끄기: 바깥 요청과 기기 연결 거부, 붙은 연결 닫힘, 이 PC의 창과 CLI는 됨
   - `device.disconnect`·`remote.log`는 이 PC만 부를 수 있음
2. 개발용 판, 창(Electron), 브라우저(Playwright Chromium, 짝 맺은 기기)로 확인하고 결과를 `experiments/p58/`(git 밖)에 둔다.
   - 흐름: 브라우저가 붙음 → PC 창에 알림 → 알약에서 끊기 → 브라우저가 다시 붙음 → 짝 풀기 → 거부 → 원격 받기 끄기 → 바깥(흉내 프록시) 요청 거부 → 켜기 → 다시 됨.
   - 그 과정이 연결 기록에 맞게 남는다.
3. `cd backend && npm test`, `cd app && npm test`, `cd app && npm run build`가 통과한다.

### 읽을 파일

- `CLAUDE.md`, `docs/testing.md`, `docs/log/p47-remote-r1-multiclient.md`·`p48-remote-r2-web.md`·`p49-remote-r3-tailscale.md`의 보고 절
- `backend/src/web.mjs`, `backend/src/peers.mjs`, `backend/src/multiclient.mjs`, `backend/src/settings.mjs`, `backend/bin/atrium-remote.mjs`, `backend/bin/atrium.mjs`(devices)
- `app/src/renderer/Peers.jsx`, `app/src/renderer/WebDevices.jsx`, `app/src/main/tray.mjs`, `app/test/e2e/p47-multi.mjs`, `app/test/e2e/p48-web.mjs`, `app/test/e2e/p49-remote.mjs`

### 시험 환경

- 개발용 판이 필요하면 너만의 판으로 띄운다(`docs/testing.md`).
  - `ATRIUM_HERDR_SESSION=atrium-dev-p58`, `ATRIUM_PORT=47877`
  - `ATRIUM_DATA_DIR=<워크트리>/backend/.dev/data`, `ATRIUM_APP_USERDATA=<워크트리>/backend/.dev/app`
- 실제 판(`atrium`, 47800)과 다른 포트(47811~47877 가운데 네 것 말고)는 쓰지 않는다. 사용자의 기본 herdr 세션과 다른 판의 herdr 서버는 건드리지 않는다.
- 대화 목록은 시험 폴더의 대화만 읽는다(`ATRIUM_CLAUDE_PROJECTS`, `ATRIUM_CLAUDE_DESKTOP=none`). 시험 폴더는 `C:\Workspace\mtask-p58-*`처럼 새로 만든다.
- **이 PC의 Tailscale 설정은 바꾸지 않는다.** `tailscale serve|funnel|set|up|down`과 `atrium remote enable|disable --yes`를 실행하지 않는다. 읽기 명령(`status --json`, `serve status --json`, `whois --json`)만 부른다. Tailscale은 P49의 가짜 tailscale(`app/test/e2e/p49-fake-tailscale.mjs`)과 흉내 프록시(`backend/tools/ts-sim-proxy.mjs`)로 시험한다. 실제 Tailscale 출력은 작업 기록에 붙이지 않고 `experiments/p58/`에만 둔다.
- 끝나면 시험 세션, 창, 백엔드, herdr 서버와 세션(`atrium-dev-p58`만), 시험 폴더를 끄고 지운다.

### 지킬 것

- `CLAUDE.md`를 따른다. 프로세스는 직접 띄운 것만 PID로 끈다.
- 이 저장소는 공개다. 작업 기록, 시험 코드, 커밋 메시지에 사용자 경로·메일·토큰, 실제 PC·tailnet 이름, IP를 쓰지 않는다. 예시는 `pc.example.ts.net`, `laptop.example.ts.net`, `user@example.com`, `100.64.0.x`를 쓴다. 커밋 전·푸시 전 검사를 건너뛰지 않는다.
- 보안 코드다. 막는 쪽이 기본이다(검사 실패, 시간 초과, 모르는 값은 거부). 비밀(토큰, 세션 ID, 챌린지)은 로그와 화면에 쓰지 않는다. 비교는 시간이 일정한 비교를 쓴다.
- 같은 때 다른 작업자(P56(패스키와 세션), P57(Tailscale 기기 묶기))가 같은 원격 코드(`backend/src/web.mjs` 등)를 고친다. 맡은 일에 필요한 만큼만 고치고, 새 동작은 되도록 새 모듈이나 작은 함수로 두어 `web.mjs`의 기존 함수는 몇 줄만 바꾼다. 기기 기록(`webDevices`)에서 네가 모르는 필드는 그대로 둔다.
- 자기 브랜치에만 커밋한다. 커밋 메시지에 `Co-Authored-By` 줄을 넣지 않는다. `main`을 바꾸거나 푸시하지 않는다. `node_modules`는 워크트리 안에서 받는다(`npm ci`).
- 문서는 이 작업 파일의 작업 기록 절과 보고 절만 고친다. 고쳐야 할 ARCH·BRIEF·testing 문장이 있으면 보고 절에 짧게 적는다.
- 끝나면 보고 절을 쓰고, 맨 마지막에 `<워크트리>/backend/.dev/p58.done`(브랜치 이름과 마지막 커밋 해시 두 줄)을 만든다.

## 작업 기록

## 보고
