상태: 열림
날짜: 2026-11-06

## 지시

### 목표

세션 노드 터미널 글자가 흐린 것을 고친다. 사용자의 말: "CLI 창 안에 텍스트가 너무 흐린데 이거 화질 업 못하나? 내가 4k 환경이라 그런지 더 흐리다".

### 할 것

1. **원인 찾기.** 흐림이 어디서 오는지 재서 밝힌다. 의심은 다음과 같다.
   - 판 배율(React Flow viewport의 CSS `transform: scale`)이 xterm이 그린 캔버스(WebGL 또는 DOM)를 늘이거나 줄인다. 100%가 아닌 배율에서는 캔버스 픽셀과 화면 픽셀이 맞지 않는다.
   - 4K 모니터의 Windows 배율(150%, 200%, 175% 같은 분수 배율)에서 `devicePixelRatio`가 분수가 되고, WebGL 글자 아틀라스가 그 값과 맞지 않는다.
   - P45의 창 배율(`setZoom`)과 터미널 글자 배율이 DPR이나 글자 크기를 분수로 만든다.
   - 글꼴(JetBrains Mono, Nanum Gothic Coding), 굵기(500), 줄 높이가 어중간한 픽셀에 걸린다.
   - `will-change: transform` 같은 합성 레이어가 늘이기 전 해상도로 그려진다.
2. **재기.** Electron을 `--force-device-scale-factor=1`, `1.5`, `2`(4K 흉내)로 띄우고, 판 배율 50%·75%·100%·125%와 화면 배율 100%·125%에서 같은 터미널 글을 찍는다. 선명함을 숫자로 견준다(예: 글자 가장자리의 밝기 기울기, 또는 같은 글을 화면 픽셀에 맞춰 그린 기준과의 차이). 바꾸기 전과 뒤를 `experiments/p65/`에 남긴다.
3. **고치기.** 원인에 맞게 고친다. 예를 들면 다음과 같다.
   - 터미널을 판 배율 × DPR에 맞는 해상도로 그린다. 예: 노드 안 터미널 상자를 배율만큼 키우고 글자 크기를 곱한 뒤 역배율로 줄여, 캔버스 픽셀이 화면 픽셀과 1:1이 되게 한다. 확대·축소가 멈춘 뒤에만 다시 그려 움직이는 동안 느려지지 않게 한다.
   - DPR과 글자 크기, 셀 크기를 정수 픽셀에 맞춘다.
   - 레이어를 늘이기 전 해상도로 굳히는 CSS를 없앤다.
   - 지켜야 할 것: 웹처럼 글 고르기와 복사(P38·P42의 배율 보정), 붙여넣기, 휠 스크롤, 셸 기록, WebGL 예산(`RendererBudget`), 먼 배율의 얼굴(요약), 웹 화면(원격)도 같게 동작해야 한다.
4. 판 배율을 바꾸는 동안과 노드가 많을 때(예: 세션 노드 12개) 프레임 시간이 크게 늘지 않는지 잰다.

### 완료 기준

1. 세 DPR(1, 1.5, 2)과 여러 판 배율에서 바꾼 뒤가 바꾸기 전보다 선명하다는 것을 숫자와 스크린숏으로 보인다. 100% 배율·DPR 1에서는 나빠지지 않는다.
2. 고르기·복사·휠·붙여넣기 창 시험(P42·P51의 시험 또는 같은 뜻의 새 시험)이 통과한다.
3. 배율 바꾸기와 노드 12개에서 성능을 전후로 적는다.
4. `cd backend && npm test`, `cd app && npm test`, `cd app && npm run build`가 통과한다.

### 읽을 파일

- `CLAUDE.md`, `docs/testing.md`, `docs/log/p42-terminal-select-web.md`·`p45-thread-briefing-scale.md` 보고 절
- `app/src/renderer/TerminalView.jsx`, `app/src/renderer/term-selection.js`, `app/src/renderer/lib/term-select.js`, `app/src/renderer/lib/scale.js`, `app/src/renderer/lib/faces.js`, `app/src/renderer/SessionNode.jsx`, `app/src/renderer/styles.css`, `app/src/main/main.mjs`(창 배율)

### 시험 환경

- 이 작업은 `dev` 브랜치에서 시작한다. 워크트리를 연 뒤 먼저 `git fetch origin && git merge --ff-only origin/dev`를 한다(워크트리가 `main`에서 시작할 수 있다).
- 개발용 판은 너만의 판으로 띄운다(`docs/testing.md`).
  - `ATRIUM_HERDR_SESSION=atrium-dev-p65`, `ATRIUM_PORT=47892`
  - `ATRIUM_DATA_DIR=<워크트리>/backend/.dev/data`, `ATRIUM_APP_USERDATA=<워크트리>/backend/.dev/app`
- 실제 판(`atrium`, 47800)과 다른 판의 포트는 쓰지 않는다. 사용자의 기본 herdr 세션과 다른 판의 herdr 서버는 건드리지 않는다. 사용자의 실제 판은 열지도 캡처하지도 않는다.
- 대화 목록은 시험 폴더의 대화만 읽는다(`ATRIUM_CLAUDE_PROJECTS`, `ATRIUM_CLAUDE_DESKTOP=none`). 시험 폴더는 `C:\Workspace\mtask-p65-*`처럼 새로 만든다.
- 세션은 `claude --model haiku`와 셸로 띄운다.
- 끝나면 시험 세션, 창, 브라우저, 백엔드, herdr 서버와 세션(`atrium-dev-p65`만), 시험 폴더를 끄고 지운다. 네가 띄운 프로세스가 남지 않았는지 포트로 확인한다.

### 지킬 것

- `CLAUDE.md`를 따른다. 프로세스는 직접 띄운 것만 PID로 끈다.
- 이 저장소는 공개다. 작업 기록, 시험 코드, 커밋 메시지, 그림에 사용자 경로·메일·토큰, 실제 PC·tailnet 이름, IP, 실제 대화 내용을 쓰지 않는다. 커밋 전·푸시 전 검사를 건너뛰지 않는다.
- 화면 글은 영어와 한국어 사전 둘 다 고친다. 한국어 문구는 사전의 지금 말투(최근 문구 검토, `docs/log/korean-copy-review.md`)를 따른다.
- 같은 때 다른 작업자(P66(세션 이름 바꾸기), P67(연결 이름표))가 돈다. 맡은 일에 필요한 만큼만 고치고, `styles.css`와 두 사전은 끝에 더해 합치기 쉽게 한다.
- 자기 브랜치에만 커밋한다. 커밋 메시지에 `Co-Authored-By` 줄을 넣지 않는다. `main`이나 `dev`를 바꾸거나 푸시하지 않는다. `node_modules`는 워크트리 안에서 받는다(`npm ci`).
- 문서는 이 작업 파일의 작업 기록 절과 보고 절만 고친다. 고쳐야 할 ARCH·BRIEF·testing 문장은 보고 절에 짧게 적는다.
- 끝나면 보고 절을 쓰고, 맨 마지막에 `<워크트리>/backend/.dev/p65.done`(브랜치 이름과 마지막 커밋 해시 두 줄)을 만든다.

## 작업 기록

## 보고
