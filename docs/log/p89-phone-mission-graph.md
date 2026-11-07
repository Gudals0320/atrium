상태: 열림
날짜: 2026-11-07

## 지시

### 목표

휴대폰의 작업 관계도(P87, `PhoneMission.jsx`)를 들여쓴 목록이 아니라 노드와 선으로 된 그래프로 다시 그린다. 세로 화면에서 한눈에 관계와 일하는 세션이 보이고, 보기 좋아야 한다.

### 사용자의 말(2026-11-07, `v0.1.4`)

"모바일 화면의 미션맵 ui 개선좀 하자 graph 스타일로 예쁘게."

### 지금(P87)

- `mission.graph`만 받아 워크스페이스 무리마다 위 → 아래 나무를 줄로 그린다. 하위 세션은 들여쓰고, 역할 이름표, 나무 밖 연결, P85 강조 등급을 쓴다. 줄을 탭하면 세션 화면을 열고, 돌아오면 같은 자리다. 대화와 터미널은 받지 않는다.
- PC의 미션 맵(`Mission.jsx`, `lib/mission-layout.js`)은 왼쪽 → 오른쪽 나무 그래프다(ARCH 4절 I6).

### 할 것

1. **그래프 모양.** 세션은 노드 카드로, 관계는 선으로 그린다.
   - 노드 카드: 둥근 카드에 상태 점, 이름, 역할 칩, 종류 아이콘(claude·codex 등), 워크트리면 브랜치 표시
   - 선: 부모 → 하위 세션은 부드러운 곡선(화살표나 끝점)
   - 나무 밖 연결(역할 선, 알아챈 지시)은 다른 모양(점선 등)으로 구분하고, 범례를 작게 둔다
   - 무리: 워크스페이스 무리는 배경 영역이나 머리띠로 묶는다
   - 배치: 세로 화면에 맞게 위 → 아래로 내려가는 나무가 기본이다. 형제가 많아 넓어지면 줄바꿈이나 접기 등으로 화면 폭 안에 들게 한다
   - 생김새: 판의 다크 테마와 토큰(`lib/tokens.js`), 휴대폰 화면 말투에 맞춘다
2. **강조.** 일하는 세션은 P85처럼 초록 테두리와 빛으로 튀고, 응답 필요는 주황으로 따로 눈에 띄고, 쉬는·잠든·끝난 세션은 물러난다. 위쪽의 "작업 중 n · 응답 필요 n · 세션 n" 요약은 남긴다. 탭하면 그 등급만 강조하는 거르기를 둘지 근거를 들어 정한다.
3. **움직이기.** 그래프 안에서 한 손가락으로 옮기고 두 손가락으로 확대·축소한다(페이지 자체는 늘어나거나 튕기지 않게, P74). 처음에는 화면에 맞추고, "맞추기" 단추를 둔다. 노드를 탭하면 세션 화면을 열고, 돌아오면 같은 자리·배율이다. 가로 화면에서도 쓸 만해야 한다.
4. **가볍게.** iPhone Safari는 판 캔버스에서 페이지가 죽었다(P84·P86·P87). 같은 일이 생기지 않게 한다.
   - 자료는 지금처럼 `mission.graph`만 쓴다(대화·터미널 없음)
   - SVG나 DOM 크기를 적당히 두고, 큰 `filter`·`backdrop-filter`·`will-change`·끝없는 움직임을 피한다. 빛은 테두리·그림자 정도로, 움직임은 움직임 줄이기 설정을 따른다
   - 세션 50개 안팎에서도 부드러워야 한다

### 손대지 말 것

- PC 창과 데스크톱 웹의 미션 맵, 휴대폰 목록·세션 화면·알림(P88)의 동작은 바꾸지 않는다.
- 원격 연결(P82)과 tailscale·네트워크 설정. 실제 판으로 시험하지 않는다.

### 완료 기준

1. 단위 시험: 배치(무리, 위 → 아래 나무, 넓은 형제 처리, 나무 밖 연결, 노드 겹침 없음), 강조 등급, 옮기기·확대 범위.
2. 창 시험(개발용 판, 원격 흉내 `app/test/e2e/p59-lib.mjs`, iPhone 393×852 화면 배율 3, Playwright WebKit과 Chromium). 고치기 전과 뒤의 그림을 `experiments/p89/`에 둔다.
   - 판: 워크스페이스 3개, 부모 하나에 하위 세션 여럿(손자 포함), 역할 선, 일하는 세션, 응답 필요 세션, 쉬는 세션, 세션 30개 안팎의 큰 판 하나
   - 세로·가로, 맞추기, 옮기기·확대, 노드 탭 → 세션 화면 → 돌아오기
   - 그동안 `session.messages`·터미널 요청이 없고, WebKit 웹 프로세스 메모리가 크게 늘지 않는지
3. 보고에 사람이 iPhone으로 볼 순서를 적는다.
4. `cd backend && npm test`, `cd app && npm test`, `cd app && npm run build`가 통과한다.

### 읽을 파일

- `CLAUDE.md`, `docs/testing.md`(원격 창 시험, WebKit), ARCH 4절 I6, `docs/log/p87-phone-list-mission.md`, `docs/log/p85-overview-working.md`의 보고 절
- `app/src/renderer/PhoneMission.jsx`, `app/src/renderer/lib/phone-mission.js`, `app/src/renderer/Mission.jsx`, `app/src/renderer/lib/mission-layout.js`, `app/src/renderer/lib/overview.js`, `app/src/renderer/lib/tokens.js`, `app/src/renderer/phone.css`, `backend/src/mission.mjs`, 두 사전
- `app/test/e2e/p87-phone.mjs`(창 시험 틀)

### 시험 환경

- 이 작업은 `dev` 브랜치에서 시작한다. 워크트리를 연 뒤 먼저 `git fetch origin && git merge --ff-only origin/dev`를 한다(워크트리가 `main`에서 시작할 수 있다).
- 너는 사용자의 실제 판 위에서 도는 워커라 셸에 실제 판의 `ATRIUM_*`·`HERDR_*`가 있다. 시험, 개발용 판, herdr, `atrium`은 이 변수를 지운 셸(`backend/.dev/clean-env.sh`, `docs/testing.md`)로 부른다.
- 개발용 판은 너만의 판으로 띄운다(`docs/testing.md`).
  - `ATRIUM_HERDR_SESSION=atrium-dev-p89`, `ATRIUM_PORT=47897`, 창의 원격 디버깅 포트 9377
  - `ATRIUM_DATA_DIR=<워크트리>/backend/.dev/data`, `ATRIUM_APP_USERDATA=<워크트리>/backend/.dev/app`
- 실제 판(`atrium`, 47800)과 다른 판의 포트는 쓰지 않는다. 사용자의 기본 herdr 세션, 실제 판의 herdr 세션(`atrium`), 다른 판의 herdr 서버는 건드리지 않는다. 사용자의 실제 판은 열지도 캡처하지도 않는다. 스크린숏은 창 안만 찍는다(`page.screenshot`).
- 실제 판의 API(47800)와 `atrium` 명령으로 실제 판을 바꾸지 않는다. 시험의 `atrium` CLI는 늘 개발용 판 환경 변수(`ATRIUM_PORT` 등)를 주고 부른다.
- 실제 설치 폴더(`%LOCALAPPDATA%\atrium\versions`)와 실제 데이터 폴더(`%LOCALAPPDATA%\atrium`)는 읽지도 바꾸지도 않는다.
- 대화 목록은 시험 폴더의 대화만 읽는다(`ATRIUM_CLAUDE_PROJECTS`, `ATRIUM_CLAUDE_DESKTOP=none`). 시험 폴더는 `C:\Workspace\mtask-p89-*`처럼 새로 만든다.
- 세션은 `claude --model haiku`와 셸로 띄운다.
- 끝나면 시험 세션, 창, 브라우저, 백엔드, herdr 서버와 세션(`atrium-dev-p89`만), 시험 폴더를 끄고 지운다. 네가 띄운 프로세스가 남지 않았는지 포트로 확인한다.

### 지킬 것

- `CLAUDE.md`를 따른다. 프로세스는 직접 띄운 것만 PID로 끈다. 신뢰 질문은 대신 답하지 않는다.
- 이 저장소는 공개다. 작업 기록, 시험 코드, 커밋 메시지, 그림에 사용자 경로·메일·토큰, 실제 PC·tailnet 이름, IP, 실제 대화 내용을 쓰지 않는다. 커밋 전·푸시 전 검사를 건너뛰지 않는다.
- 화면 글은 영어와 한국어 사전 둘 다 고친다. 한국어 문구는 사전의 지금 말투(`docs/log/korean-copy-review.md`)를 따른다.
- 같은 때 다른 작업자는 없다. 맡은 일에 필요한 만큼만 고치고, `styles.css`와 두 사전은 끝에 더해 합치기 쉽게 한다.
- 자기 브랜치에만 커밋한다. 커밋 메시지에 `Co-Authored-By` 줄을 넣지 않는다. `main`이나 `dev`를 바꾸거나 푸시하지 않는다. `node_modules`는 워크트리 안에서 받는다(`npm ci`, 창은 그 뒤 `node node_modules/electron/install.js`).
- 문서는 이 작업 파일의 작업 기록 절과 보고 절만 고친다. 고쳐야 할 ARCH·BRIEF·testing·README 문장은 보고 절에 짧게 적는다. 살아 있는 문서 예산이 거의 찼으니(70,000자 중 69,995자) 문장은 바꾸는 문장보다 길지 않게 적는다.
- 끝나면 보고 절을 쓰고, 맨 마지막에 `<워크트리>/backend/.dev/p89.done`(브랜치 이름, 마지막 커밋 해시, 시험 수 세 줄)을 만든다.

## 작업 기록

## 보고
