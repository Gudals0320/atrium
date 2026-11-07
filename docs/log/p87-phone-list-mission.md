상태: 열림
날짜: 2026-11-07

## 지시

### 목표

휴대폰에서는 캔버스 보드를 쓰지 않고 세션 목록을 기본 화면으로 한다. 목록에서 미션 맵(누가 누구의 무슨 역할인지, 무엇이 일하는지)을 볼 수 있게 한다.

### 사용자의 말(2026-11-07, `v0.1.4-dev.7`)

"아이폰에서 열어봤는데 닫힘... 우야노? 이거 그냥 안해도 될듯? 그냥 세션 목록만 보여주는 방향도 좋아보인다. 세션 목록만 보여주던 안으로 롤백하는 대신, 미션 맵 보는 기능을 추가하자"

결정이 바뀐다. 지금 BRIEF "원격 보안" 행의 "휴대폰도 보드 화면이 기본이고 탭한 세션을 화면 가득 보며"(2026-11-06, P74·P76)가 "휴대폰은 세션 목록이 기본이고 미션 맵으로 관계를 본다"가 된다. BRIEF와 decisions는 지휘 세션이 닫을 때 고친다.

### 지휘 세션이 알아낸 것(실제 판의 연결 기록, 읽기만 함)

- `dev.7`에서도 iPhone Safari는 보드를 열면 죽었다. P86의 단계 기록은 죽기 직전에 이랬다.
  - `frame`: DOM 483개
  - `fit`: 배율 0.139, 저장한 자리
  - 그 뒤 1.1~1.2초 사이에 `msg session.messages`가 여섯 번 왔다(78KB, 36KB, 43KB, 42KB, 48KB, 95KB).
  - 터미널을 붙이기 전이다. 보드가 노드마다 대화(대화 보기)를 받아 그리다 죽은 것으로 보인다.
- 목록(가벼운 화면)은 버틴다.
- 같은 `boot` 줄(같은 단계, `up 14`)이 부팅마다 되풀이해 올라오고 매번 `light: true`였다. 그래서 "보드로 다시 열기" 뒤에도 가벼운 화면으로 돌아간 것으로 보인다. 한 번 알린 죽음 기록을 지우지 않는 것 같다.

### 할 것

1. **휴대폰은 목록.** 휴대폰 레이아웃(지금 `usePhoneLayout`이 휴대폰으로 보는 화면)은 늘 세션 목록으로 연다. 캔버스 보드와 보드 위 전체 보기(P76)로 가는 길을 휴대폰에서는 없앤다. 코드는 되돌리지 않는다. 태블릿(iPad)·데스크톱 웹과 PC 창은 지금처럼 보드를 쓴다.
   - 목록의 세션 화면(P74: 터미널 하나, 입력 줄, 특수 키 줄, P83의 글자 크기·나가기·높이 보정)은 그대로 쓴다.
   - 목록 머리줄의 "보드" 단추는 "미션 맵"으로 바꾼다.
   - 휴대폰에서는 P84·P86의 가벼운 보드 단계와 "보드로 다시 열기"를 보이지 않는다. 죽음 기록(`boot` 줄)은 남긴다.
2. **휴대폰 미션 맵.** 목록에서 미션 맵 화면을 연다. 자료는 `mission.graph`(이름, 역할, 상태, 부모·하위, 연결)만 쓰고 대화(`session.messages`)와 터미널은 받지 않는다.
   - 세로 휴대폰에 맞는 모양으로 그린다. 예: 워크스페이스 무리(접기)마다 위 → 아래 나무, 부모 아래 들여쓴 하위 세션, 역할 이름표, 연결 선이나 화살표.
   - 일하는 세션은 P85처럼 눈에 띄게, 내 차례는 따로 눈에 띄게, 쉬는 세션은 물러나게 한다. 움직임은 가볍게(정지 화면도 알아보게).
   - 노드를 탭하면 그 세션 화면을 연다. 돌아오면 미션 맵의 자리가 그대로다.
   - 두 손가락 확대가 필요하면 근거를 들어 넣는다. 페이지 자체가 늘어나거나 튕기지 않게 한다(P74).
   - 다크 테마와 지금 휴대폰 화면 말투를 따르고, 두 사전에 넣는다.
3. **죽음 기록 되풀이 고치기.** 한 번 알린 죽음 기록을 지워 다음 부팅이 같은 것을 다시 알리지 않게 한다. 웹 화면 모두에 해당한다. 되풀이가 가벼운 화면 판단을 잘못 이끌었는지 확인해 적는다.
4. **원인 기록.** 위 단계 기록(보드가 노드마다 `session.messages`를 받아 그리다 죽음)을 작업 기록에 적는다. 휴대폰이 아닌 웹 보드에서 대화 보기를 받는 양이 너무 많은지 재어 보고에 적는다. 고치지는 않는다.

### 손대지 말 것

- PC 창과 데스크톱 웹의 보드, 미션 맵(PC 덮개 화면)의 동작은 바꾸지 않는다.
- 원격 연결(P82)과 tailscale·네트워크 설정. 실제 판으로 시험하지 않는다.

### 완료 기준

1. 단위 시험: 휴대폰이면 늘 목록, 태블릿·데스크톱은 보드. 휴대폰 미션 맵 배치(무리, 나무, 들여쓰기, 강조 등급). 죽음 기록을 한 번만 알림.
2. 창 시험(개발용 판, 원격 흉내 `app/test/e2e/p59-lib.mjs`, iPhone 393×852 화면 배율 3, Playwright WebKit과 Chromium). 결과와 그림은 `experiments/p87/`에 둔다.
   - 판: 워크스페이스 3개, 부모·하위 세션(역할 있음), 일하는 세션, 내 차례 세션
   - 목록으로 열림, 보드로 가는 길 없음
   - 미션 맵 열기, 노드를 탭해 세션 화면을 열고 돌아오기
   - 미션 맵을 여는 동안 `session.messages`와 터미널 요청이 없는지
   - 페이지를 죽인 뒤 `boot` 줄이 한 번만 남는지
3. 보고에 사람이 iPhone으로 볼 순서를 적는다.
4. `cd backend && npm test`, `cd app && npm test`, `cd app && npm run build`가 통과한다.

### 읽을 파일

- `CLAUDE.md`, `docs/testing.md`(원격 창 시험, WebKit), ARCH 1절 원격 문단과 4절 I6(미션 맵), `docs/log/p74-mobile-web.md`, `docs/log/p76-phone-board-touch.md`, `docs/log/p86-phone-board-crash.md`의 보고 절
- `app/src/renderer/Phone.jsx`, `app/src/renderer/PhoneFull.jsx`, `app/src/renderer/main.jsx`(`usePhoneLayout`), `app/src/renderer/lib/phone.js`, `app/src/renderer/crash-watch.js`, `app/src/renderer/lib/crumbs.js`, `app/src/renderer/Mission.jsx`, `app/src/renderer/lib/mission-layout.js`, `app/src/renderer/lib/overview.js`(P85 강조 등급), `backend/src/mission.mjs`, 두 사전
- `app/test/e2e/p86-board.mjs`(창 시험 틀)

### 시험 환경

- 이 작업은 `dev` 브랜치에서 시작한다. 워크트리를 연 뒤 먼저 `git fetch origin && git merge --ff-only origin/dev`를 한다(워크트리가 `main`에서 시작할 수 있다).
- 너는 사용자의 실제 판 위에서 도는 워커라 셸에 실제 판의 `ATRIUM_*`·`HERDR_*`가 있다. 시험, 개발용 판, herdr, `atrium`은 이 변수를 지운 셸(`backend/.dev/clean-env.sh`, `docs/testing.md`)로 부른다.
- 개발용 판은 너만의 판으로 띄운다(`docs/testing.md`).
  - `ATRIUM_HERDR_SESSION=atrium-dev-p87`, `ATRIUM_PORT=47897`, 창의 원격 디버깅 포트 9377
  - `ATRIUM_DATA_DIR=<워크트리>/backend/.dev/data`, `ATRIUM_APP_USERDATA=<워크트리>/backend/.dev/app`
- 실제 판(`atrium`, 47800)과 다른 판의 포트는 쓰지 않는다. 사용자의 기본 herdr 세션, 실제 판의 herdr 세션(`atrium`), 다른 판의 herdr 서버는 건드리지 않는다. 사용자의 실제 판은 열지도 캡처하지도 않는다. 스크린숏은 창 안만 찍는다(`page.screenshot`).
- 실제 판의 API(47800)와 `atrium` 명령으로 실제 판을 바꾸지 않는다. 시험의 `atrium` CLI는 늘 개발용 판 환경 변수(`ATRIUM_PORT` 등)를 주고 부른다.
- 실제 설치 폴더(`%LOCALAPPDATA%\atrium\versions`)와 실제 데이터 폴더(`%LOCALAPPDATA%\atrium`)는 읽지도 바꾸지도 않는다.
- 대화 목록은 시험 폴더의 대화만 읽는다(`ATRIUM_CLAUDE_PROJECTS`, `ATRIUM_CLAUDE_DESKTOP=none`). 시험 폴더는 `C:\Workspace\mtask-p87-*`처럼 새로 만든다.
- 세션은 `claude --model haiku`와 셸로 띄운다.
- 끝나면 시험 세션, 창, 브라우저, 백엔드, herdr 서버와 세션(`atrium-dev-p87`만), 시험 폴더를 끄고 지운다. 네가 띄운 프로세스가 남지 않았는지 포트로 확인한다.

### 지킬 것

- `CLAUDE.md`를 따른다. 프로세스는 직접 띄운 것만 PID로 끈다. 신뢰 질문은 대신 답하지 않는다.
- 이 저장소는 공개다. 작업 기록, 시험 코드, 커밋 메시지, 그림에 사용자 경로·메일·토큰, 실제 PC·tailnet 이름, IP, 실제 대화 내용을 쓰지 않는다. 커밋 전·푸시 전 검사를 건너뛰지 않는다.
- 화면 글은 영어와 한국어 사전 둘 다 고친다. 한국어 문구는 사전의 지금 말투(`docs/log/korean-copy-review.md`)를 따른다.
- 같은 때 다른 작업자는 없다. 맡은 일에 필요한 만큼만 고치고, `styles.css`와 두 사전은 끝에 더해 합치기 쉽게 한다.
- 자기 브랜치에만 커밋한다. 커밋 메시지에 `Co-Authored-By` 줄을 넣지 않는다. `main`이나 `dev`를 바꾸거나 푸시하지 않는다. `node_modules`는 워크트리 안에서 받는다(`npm ci`, 창은 그 뒤 `node node_modules/electron/install.js`).
- 문서는 이 작업 파일의 작업 기록 절과 보고 절만 고친다. 고쳐야 할 ARCH·BRIEF·testing·README 문장은 보고 절에 짧게 적는다. 살아 있는 문서 예산이 거의 찼으니(70,000자 중 69,999자) 문장은 바꾸는 문장보다 길지 않게 적는다.
- 끝나면 보고 절을 쓰고, 맨 마지막에 `<워크트리>/backend/.dev/p87.done`(브랜치 이름, 마지막 커밋 해시, 시험 수 세 줄)을 만든다.

## 작업 기록

## 보고
