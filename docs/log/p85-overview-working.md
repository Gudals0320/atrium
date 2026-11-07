상태: 열림
날짜: 2026-11-07

## 지시

### 목표

멀리 보기(줌 아웃한 판, 휴대폰 보드 화면 포함)에서 일하는 세션과 아닌 세션이 한눈에 갈라 보이게 한다.

### 사용자의 말(2026-11-07)

"줌 아웃 해서 전체 뷰 봐도 작업중인 세션이랑 아닌 세션 딱 시각적으로 분리되는 기능 필요"

### 지금

- 멀리 얼굴(ARCH 4절 H3)은 이름, 상태, 기다리는 질문, 마지막 요청·답을 보인다. 기다리는 노드는 테두리가 깜빡이고 오래 쉬는 노드는 흐리다. 상태 점과 글은 있지만 작업 중인 세션이 멀리서 튀어 보이지 않는다.

### 할 것

1. **재기.** 판(PC 창)과 휴대폰 보드 화면에서 세션 10개 안팎(일하는 것, 내 차례, 쉬는 것, 잠든 것, 셸 명령 실행 중, 끝난 것)을 배율 세 단계(가까이, 중간, 가장 멀리)로 찍어 지금 얼마나 갈라 보이는지 적는다.
2. **갈라 보이기.** 일하는 세션(`working`·`starting`, 명령이 도는 셸)은 멀리서도 튀게 하고, 쉬는 세션(`ready`, 잠듦, 끝남)은 뒤로 물러나게 한다. 예: 일하는 노드는 강조색 테두리·빛·움직이는 둘레, 쉬는 노드는 흐리게·채도 낮게. 내 차례(`waiting`)는 지금처럼 따로 눈에 띄고 일하는 것과 헷갈리지 않아야 한다. 덩어리 안 칸, 워크트리 상자, 대화 노드도 같은 규칙을 따른다. 색과 움직임은 지금 판의 생김새(토큰, 다크)에 맞추고, 움직임 줄이기 설정(`prefers-reduced-motion`)이면 움직이지 않는다.
3. **더 세게(고를 수 있게).** 위 칩이나 레일에 "작업 중" 강조 켜기·끄기(또는 "작업 중만 또렷하게")를 둘지 근거를 들어 정한다. 둔다면 상태를 창 프로필에 두고 단축키는 만들지 않는다.
4. **성능.** 세션 100개 안팎에서 움직이는 효과가 프레임을 떨어뜨리지 않게 한다(CSS만, 화면 밖 노드는 움직이지 않음 등). 잰 값을 적는다.

### 손대지 말 것

- 터미널을 붙이는 규칙과 터미널 그리기(`TerminalView.jsx`, `lib/faces.js`의 렌더러 예산, `lib/term-sharp.js`)는 바꾸지 않는다. 같은 때 P84 작업자가 그쪽과 휴대폰 화면(`Phone.jsx`, `PhoneFull.jsx`)을 고친다.

### 완료 기준

1. 단위 시험: 상태 → 강조 등급(일함·내 차례·쉼·잠듦·끝남, 셸 실행 중) 판단, 켜기·끄기 저장.
2. 창 시험(개발용 판, 셸과 `claude --model haiku` 세션)으로 1의 장면을 고치기 전과 뒤로 같은 배율에서 찍어 `experiments/p85/`에 둔다. 휴대폰 보드 화면은 원격 흉내(`app/test/e2e/p59-lib.mjs`, iPhone 흉내 Chromium)로 찍는다. 시험 저장소는 P75·P78과 같은 경로 `C:\Workspace\mtask-p75-repo`를 새로 만들어 쓴다(사용자가 그 경로의 신뢰를 이미 주었다). 신뢰 질문이 뜨면 `backend/.dev/p85-need-trust.txt`에 한 줄을 두고 기다린다.
3. `cd backend && npm test`, `cd app && npm test`, `cd app && npm run build`가 통과한다.

### 읽을 파일

- `CLAUDE.md`, `docs/testing.md`, ARCH 3절(상태와 표시), 4절 H3·H5·H7, `docs/research/board-mock.md` 4절, `docs/log/p11-board-look.md` 보고 절
- `app/src/renderer/SessionNode.jsx`, `app/src/renderer/Canvas.jsx`, `app/src/renderer/Docks.jsx`, `app/src/renderer/lib/tokens.js`, `app/src/renderer/styles.css`의 노드·얼굴 규칙, `app/src/renderer/Chrome.jsx`(위 칩, 레일), 두 사전

### 시험 환경

- 이 작업은 `dev` 브랜치에서 시작한다. 워크트리를 연 뒤 먼저 `git fetch origin && git merge --ff-only origin/dev`를 한다(워크트리가 `main`에서 시작할 수 있다).
- 너는 사용자의 실제 판 위에서 도는 워커라 셸에 실제 판의 `ATRIUM_*`·`HERDR_*`가 있다. 시험, 개발용 판, herdr, `atrium`은 이 변수를 지운 셸(`backend/.dev/clean-env.sh`, `docs/testing.md`)로 부른다.
- 개발용 판은 너만의 판으로 띄운다(`docs/testing.md`).
  - `ATRIUM_HERDR_SESSION=atrium-dev-p85`, `ATRIUM_PORT=47898`, 창의 원격 디버깅 포트 9378
  - `ATRIUM_DATA_DIR=<워크트리>/backend/.dev/data`, `ATRIUM_APP_USERDATA=<워크트리>/backend/.dev/app`
- 실제 판(`atrium`, 47800)과 다른 판의 포트는 쓰지 않는다. 사용자의 기본 herdr 세션, 실제 판의 herdr 세션(`atrium`), 다른 판의 herdr 서버는 건드리지 않는다. 사용자의 실제 판은 열지도 캡처하지도 않는다. 스크린숏은 창 안만 찍는다(`page.screenshot`).
- 실제 판의 API(47800)와 `atrium` 명령으로 실제 판을 바꾸지 않는다. 시험의 `atrium` CLI는 늘 개발용 판 환경 변수(`ATRIUM_PORT` 등)를 주고 부른다.
- 실제 설치 폴더(`%LOCALAPPDATA%\atrium\versions`)와 실제 데이터 폴더(`%LOCALAPPDATA%\atrium`)는 읽지도 바꾸지도 않는다.
- 대화 목록은 시험 폴더의 대화만 읽는다(`ATRIUM_CLAUDE_PROJECTS`, `ATRIUM_CLAUDE_DESKTOP=none`). 시험 폴더는 `C:\Workspace\mtask-p85-*`처럼 새로 만든다.
- 세션은 `claude --model haiku`와 셸로 띄운다.
- 끝나면 시험 세션, 창, 브라우저, 백엔드, herdr 서버와 세션(`atrium-dev-p85`만), 시험 폴더를 끄고 지운다. 네가 띄운 프로세스가 남지 않았는지 포트로 확인한다.

### 지킬 것

- `CLAUDE.md`를 따른다. 프로세스는 직접 띄운 것만 PID로 끈다. 신뢰 질문은 대신 답하지 않는다.
- 이 저장소는 공개다. 작업 기록, 시험 코드, 커밋 메시지, 그림에 사용자 경로·메일·토큰, 실제 PC·tailnet 이름, IP, 실제 대화 내용을 쓰지 않는다. 커밋 전·푸시 전 검사를 건너뛰지 않는다.
- 화면 글은 영어와 한국어 사전 둘 다 고친다. 한국어 문구는 사전의 지금 말투(`docs/log/korean-copy-review.md`)를 따른다.
- 같은 때 P84 작업자가 판 `atrium-dev-p84`(47897, CDP 9377)로 휴대폰 터미널 메모리와 죽음 기록을 고친다(`TerminalView.jsx`, `Phone.jsx`, `PhoneFull.jsx`, `web.mjs`). 그 포트와 세션은 쓰지 않는다. 맡은 일에 필요한 만큼만 고치고, `styles.css`와 두 사전은 끝에 더해 합치기 쉽게 한다.
- 자기 브랜치에만 커밋한다. 커밋 메시지에 `Co-Authored-By` 줄을 넣지 않는다. `main`이나 `dev`를 바꾸거나 푸시하지 않는다. `node_modules`는 워크트리 안에서 받는다(`npm ci`, 창은 그 뒤 `node node_modules/electron/install.js`).
- 문서는 이 작업 파일의 작업 기록 절과 보고 절만 고친다. 고쳐야 할 ARCH·BRIEF·testing·README 문장은 보고 절에 짧게 적는다. 살아 있는 문서 예산이 거의 찼으니(70,000자 중 69,991자) 문장은 바꾸는 문장보다 길지 않게 적는다.
- 끝나면 보고 절을 쓰고, 맨 마지막에 `<워크트리>/backend/.dev/p85.done`(브랜치 이름, 마지막 커밋 해시, 시험 수 세 줄)을 만든다.

## 작업 기록

## 보고
