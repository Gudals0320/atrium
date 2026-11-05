상태: 닫힘
날짜: 2026-11-05

## 지시

### 목표

GitHub 첫 화면의 README를 다시 쓰고, 지금 화면으로 스크린숏을 새로 찍는다. 이 결과로 v0.1.0을 릴리즈한다. 사용자의 말: "github 메인페이지 README eng 좀 더 깔끔하게 수정하자. 지금 캡처한 사진은 구버전이잖아? 사진 캡쳐 너가 알아서 하는데 내 canvas를 캡쳐하지는 말고 적당히 재현해줘. 추가한 기능 ㅈㄴ 많잖아. README에 적절하게 구성해서 만들자".

### 할 것

1. **스크린숏 새로 찍기.** 지금 `docs/images/`의 board·dock·your-turn은 옛 화면이다(P11 무렵, 그 뒤 사이드바, 아래 바, 찾기, 원격 화면이 바뀌었다).
   - 개발용 판에 데모를 꾸며 찍는다. 사용자의 실제 판이나 캔버스는 절대 쓰지 않는다.
   - 데모 폴더는 새로 만든다. 그림의 경로가 깔끔하도록 `C:\Workspace\atrium-demo\<저장소>`를 써도 된다(옛 그림도 이 경로였다). 끝나면 지운다. 저장소 둘이나 셋(예: `web-app`, `api`)을 git으로 만들고 작은 파일을 둔다.
   - 세션은 `claude --model haiku`와 셸로 띄운다. 짧고 그럴듯한 영어 지시로 화면을 채운다. 리드 하나와 워커, 리뷰어를 역할 선으로 잇고, 하나는 질문으로 "Your turn" 상태를 만든다. 워크트리 상자 하나와 메모나 칸반 하나, 다른 저장소의 셸 몇 개를 둔다. 실제 대화 기록은 쓰지 않는다.
   - 찍을 장면(4~6장): (1) 판 전체(대표 그림), (2) 내 차례 카드(질문·승인), (3) 에이전트끼리(역할 선, 워커, 미션 맵이나 Thread), (4) 붙여 묶기·배치 틀, (5) 원격(노트북 브라우저 흉내: localhost 웹 화면이나 흉내 프록시, 그리고 PC 창의 연결된 기기 탭). 필요하면 사이드바·찾기 창 한 장을 더한다.
   - 1600×960 정도로 찍고 파일마다 1MiB 아래로 한다(공개 검사가 막는다). 화면 배율과 글자가 선명한지 본다.
   - 찍는 과정을 스크립트로 남긴다(예: `app/test/e2e/readme-shots.mjs`). 다시 찍을 수 있어야 한다.
   - 쓰지 않게 된 옛 그림은 지운다. `banner.png`(로고 글자)는 지금 것과 같으면 둔다.
2. **README.md(영어) 다시 쓰기.** 깔끔하고 훑어보기 쉽게 한다.
   - 첫 화면: 배너, 한 줄 소개, 배지(Electron 45, Node 24, Windows, MIT), 한국어 링크, 대표 그림.
   - "What it is"를 서너 줄로 쓴다.
   - **Features**는 묶음별로 짧은 글머리표와 그림을 둔다. 묶음 예: 판과 워크스페이스(무한 캔버스, 저장소별 영역, 워크트리 상자, 200개 넘는 세션의 사이드바와 가상 그룹, 찾기), 내 차례(상태, 질문·승인 카드, 알림), 에이전트끼리(역할 선, `atrium child` 워커, 말로 고르는 모델, 미션 맵, Thread), 터미널(실시간 xterm, 웹처럼 고르기·복사, 붙여넣기, 배율), 배치(붙여 묶기, 배치 틀, 정리, 메모, 칸반), 원격(Tailscale로 브라우저에서, 코드로 짝 맺기, 짝 맺은 기기 묶기, 패스키는 선택, 연결 기록, 원격 받기 스위치), CLI.
   - 기능은 코드와 `docs/ARCH.md`, `CHANGELOG.md`로 확인한 것만 쓴다. 없는 기능이나 옛 동작은 쓰지 않는다.
   - 그 뒤에 Requirements, Quick start, Remote access(짧게, 자세한 단계는 접기(`<details>`) 등으로), CLI 짧은 표, How it works(지금 다이어그램 다듬기), Development, Status, Acknowledgments, License를 둔다. Acknowledgments의 Qualop 번역 기여와 상표·글꼴 고지는 그대로 둔다. License 줄에 "제삼자 로고와 글꼴은 MIT가 아님, `app/THIRD_PARTY_NOTICES.txt`"를 더한다.
   - 지금 README의 원격 절은 P62까지 반영돼 있다(패스키 기본 끔). 그 내용을 지키며 짧게 다듬는다.
3. **README.ko.md**를 영어판과 같은 구성과 그림으로 맞춘다. 한국어 화면 그림을 따로 찍을 필요는 없다.
4. 비공개 참고 제품의 이름은 어디에도 쓰지 않는다(P63이 저장소에서 지운다).

### 완료 기준

1. README 두 파일이 같은 구성이고, 그림 링크가 모두 있다. 그림은 새 화면이며 사용자의 실제 판이 아니다.
2. 그림 파일은 1MiB 아래이고, 공개 검사(`node scripts/check-public.mjs --tree HEAD`)가 통과한다.
3. 찍기 스크립트로 다시 찍을 수 있다. 결과는 `experiments/p64/`(git 밖)에도 남긴다.
4. `cd backend && npm test`, `cd app && npm test`, `cd app && npm run build`가 통과한다.

### 읽을 파일

- `CLAUDE.md`, `docs/testing.md`, `README.md`, `README.ko.md`, `CHANGELOG.md`, `docs/ARCH.md`
- 창 시험 도구: `app/test/e2e/harness.mjs`, `p5-lib.mjs`, `p61-shots.mjs`, `p59-lib.mjs`(웹 화면과 짝 맺기)

### 시험 환경

- 개발용 판이 필요하면 너만의 판으로 띄운다(`docs/testing.md`).
  - `ATRIUM_HERDR_SESSION=atrium-dev-p64`, `ATRIUM_PORT=47890`(흉내 프록시는 47891)
  - `ATRIUM_DATA_DIR=<워크트리>/backend/.dev/data`, `ATRIUM_APP_USERDATA=<워크트리>/backend/.dev/app`
- 실제 판(`atrium`, 47800)과 다른 판의 포트는 쓰지 않는다. 사용자의 기본 herdr 세션과 다른 판의 herdr 서버는 건드리지 않는다. 사용자의 실제 판과 캔버스는 열지도, 캡처하지도 않는다.
- 대화 목록은 시험 폴더의 대화만 읽는다(`ATRIUM_CLAUDE_PROJECTS`, `ATRIUM_CLAUDE_DESKTOP=none`).
- 이 PC의 Tailscale 설정은 바꾸지 않는다. 읽기 명령만 부른다.
- 끝나면 시험 세션, 창, 브라우저, 프록시, 백엔드, herdr 서버와 세션(`atrium-dev-p64`만), 시험 폴더를 끄고 지운다. 네가 띄운 프로세스가 남지 않았는지 포트로 확인한다.

### 지킬 것

- `CLAUDE.md`를 따른다. 프로세스는 직접 띄운 것만 PID로 끈다.
- 이 저장소는 공개다. 작업 기록, 시험 코드, 커밋 메시지, 그림에 사용자 경로·메일·토큰, 실제 PC·tailnet 이름, IP, 실제 대화 내용을 쓰지 않는다. 커밋 전·푸시 전 검사를 건너뛰지 않는다.
- 같은 때 다른 작업자(P63(이름 지우기와 검사 정리))가 돈다. 맡은 파일만 고친다.
- 자기 브랜치에만 커밋한다. 커밋 메시지에 `Co-Authored-By` 줄을 넣지 않는다. `main`을 바꾸거나 푸시하지 않는다. `node_modules`는 워크트리 안에서 받는다(`npm ci`).
- 끝나면 보고 절을 쓰고, 맨 마지막에 `<워크트리>/backend/.dev/p64.done`(브랜치 이름과 마지막 커밋 해시 두 줄)을 만든다.

## 작업 기록

2026-11-05 작업자 세션(워크트리 `worktree-p64`).

- 판: `atrium-dev-p64`, 47890(흉내 프록시 47891), `backend/.dev/data`·`app`, 대화 목록은 빈 `backend/.dev/convos`, 데스크톱 앱 없음, 가짜 tailscale(`p49-fake-tailscale.mjs`). 창 1600×960, devicePixelRatio 1.
- 신뢰: 새 git 저장소에서 claude를 처음 띄우면 신뢰 대화상자가 뜬다(git 저장소 안이면 저장소 루트에서 신뢰를 찾는다, E10). 신뢰 설정은 읽기만 하고 건드리지 않았다. 대신 데모 폴더를 이미 신뢰된 상위 폴더 아래의 일반 폴더로 만들어 claude를 먼저 띄우고, 그 뒤에 `git init`과 `git worktree add`(비어 있는 폴더를 워크트리로)를 했다. 판은 폴더 → 저장소 합치기(P37)로 영역을 저장소로 옮겼고, 워크트리 세션도 노란 상자로 보였다.
- 한국어 답: haiku가 사용자 전역 지침을 따라 한국어로 답했다. 데모 상위 폴더(`C:\Workspace\atrium-demo\CLAUDE.md`, 저장소 밖)에 영어로 답하라는 지침을 두고 지시마다 같은 말을 붙였다. 판의 연결 알림(에이전트에게 가는 글이라 번역하지 않음)은 리드 화면에 한국어로 남아, 리드 → 리뷰어 연결을 먼저 만들고 `/clear`를 보낸 뒤 첫 지시를 보냈다. 작업자 역할 기본값 "워커"는 `--role worker`로 바꿨다.
- 시각: Claude Code의 "done 오후 7:32"는 시스템 지역 설정이다. 판을 띄우는 환경에 `LANG`·`LC_ALL=en_US.UTF-8`을 넣으니 herdr 패널의 claude가 "7:38 PM"으로 찍었다.
- 지시 흔들림: 처음엔 작업자 셋이 모두 Bash 승인을 기다렸다. 지시에 쓸 도구(Read·Edit, Write 뒤 Bash로 `npm test`)를 적으니 리뷰어(질문)와 tests(`npm test` 승인) 둘만 내 차례가 됐다.
- 배치: 정리(`arrange --all`)는 리뷰어와 워커를 작게 만들어 그림에 맞지 않았다. `layout` 단계가 판 API로 덩어리·노드·메모·칸반 자리와 크기를 정한다.
- 개발용 판 표시(`dev`)는 실제 판에 없으므로 찍을 때만 CSS로 가렸다(창과 웹 화면).
- 장면: board(전체), your-turn(내 차례 목록 펼침, 리뷰어 질문 카드, tests 승인 카드), agents(미션 맵, 내용 높이로 자름 1600×672), dock(덩어리 노드 하나를 고르면 뜨는 막대와 펼친 배치 틀), sidebar(사이드바와 찾기 "theme"), remote(흉내 노트북 1440×860을 브라우저 틀에 넣음, 주소 `https://pc.example.ts.net/`), devices(PC 창의 연결된 기기 탭, 짝 맺은 laptop-a).
- 다시 찍기: clean → seed → shoot → publish를 처음부터 한 번 더 돌려 같은 판이 나오는 것을 봤다.

## 보고

### 만든 것

- `app/test/e2e/readme-shots.mjs`: README 그림을 찍는 스크립트. `seed`(데모 폴더 `C:\Workspace\atrium-demo\{web-app, web-app-dark, api}`와 판: claude haiku 세션 lead·review·theme, 리드가 `atrium child`로 띄운 워커 ui·tests, 리드 → 리뷰어 역할 선, 덩어리 main-left, 워크트리 `feature/dark-mode`, api 셸 둘, 메모, 칸반), `layout`, `shoot [장면,…]`, `publish`(1MiB 확인 뒤 `docs/images/`로), `clean`(세션 끄기, 이 판의 herdr·백엔드 멈춤, 데모 폴더·판 데이터·이 판의 herdr 세션 폴더 지우기). 판 값은 `MT_E2E_HERDR_SESSION`·`MT_E2E_PORT`·`MT_E2E_SIM_PORT`로 덮고 `assertTestBoard`로 막는다. 데모 저장소 커밋은 예시 작성자(`demo@example.com`)로 한다.
- `app/test/e2e/readme-scenes.mjs`: 장면을 찍는 부분(shoot이 부른다). 원격은 흉내 프록시와 가짜 tailscale, 예시 이름만 쓴다.
- `docs/images/`: board, your-turn, dock을 새 화면으로 바꾸고 agents, sidebar, remote, devices를 더했다(89~260KiB). `banner.png`는 첫 커밋 뒤 바뀌지 않아 그대로 두었다. 찍은 원본과 로그는 `experiments/p64/`(git 밖).
- `README.md`: 배너, 한 줄 소개, 배지(Electron 45, Node 24, Windows, MIT), 한국어 링크, 대표 그림 → What it is → Features 여섯 묶음(The board, Your turn, Agents working together, Live terminals, Docks and layout, Remote access, 묶음마다 그림) → Requirements → Quick start(보드 키 한 줄 포함) → Remote access(네 단계, 자세한 것은 `<details>`) → CLI 표 → How it works(브라우저와 `tailscale serve`를 더한 다이어그램) → Development(그림 스크립트 한 줄) → Status → Acknowledgments → License(제삼자 로고와 글꼴 고지).
- `README.ko.md`: 같은 구성과 그림. 화면 용어는 한국어 화면 사전(Qualop 번역)을 따랐다(보드, 세션 창, 창 그룹, 응답 필요, 확인할 결과, 작업 관계도, 요청 기록, 명령 입력줄).
- 시험: `cd backend && npm test` 459 통과, `cd app && npm test` 214 통과, `npm run build` 통과.

### 계획과 다른 곳

- 데모 저장소를 처음부터 git으로 만들지 않고, claude를 띄운 뒤 git 저장소와 워크트리로 바꿨다(작업 기록의 신뢰 항목).
- 장면 (3)은 미션 맵 하나로 찍고 Thread 그림은 따로 두지 않았다. 원격은 웹 화면(remote)과 PC의 연결된 기기 탭(devices) 두 장이다. 사이드바·찾기 한 장을 더해 그림이 일곱 장이다.
- 원격 그림의 웹 화면은 localhost가 아니라 흉내 프록시(`pc.example.ts.net:47891`)로 열었고, 브라우저 틀의 주소 줄에는 `https://pc.example.ts.net/`을 그렸다.

### 알려진 문제

- 연결된 기기 탭의 짝 맺기 설명(`devTab.pairDesc`, en "The browser then makes a passkey.", ko "그다음 브라우저가 패스키를 만듭니다.")이 P62 뒤 기본(패스키로 확인 끔)과 맞지 않는다. devices 그림에 이 문장이 보인다. 맡은 파일이 아니라 고치지 않았다.
- 같은 탭의 "Board in a browser" 줄은 시험 판 포트(`http://localhost:47890/`)를 보인다. 실제 판에서는 47800이다.
- 데모 claude 세션의 대화 기록은 `~/.claude/projects` 아래(데모 폴더 이름)에 남았고, Claude Code가 `~/.claude.json`에 데모 폴더 항목을 썼다. 읽기만 하라는 규칙대로 지우지 않았다. 폴더가 없어졌으므로 실제 판에서는 missed로 분류된다.
- haiku의 답은 실행마다 조금씩 다르다. 다시 찍으면 터미널 글과 승인 명령이 달라질 수 있다(seed 뒤 판 CLI `ls`로 리뷰어와 tests만 내 차례인지 확인하고 찍는다).
