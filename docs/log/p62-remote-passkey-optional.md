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

## 보고
