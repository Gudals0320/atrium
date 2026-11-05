상태: 열림
날짜: 2026-11-05

## 지시

### 목표

원격 작업(노트북에서 Tailscale로 이 PC의 보드 쓰기)의 첫 단계다. 한 백엔드에 창(클라이언트)이 둘 이상 붙어도 서로 방해하지 않게 한다. 원격은 세 단계로 한다.
- **R1(이 작업):** 동시 접속 바로잡기
- **R2(P48, 같은 때):** 웹 화면
- **R3(나중):** Tailscale

사용자와 정한 것(2026-11-05)은 다음과 같다.
- 노트북에서는 PC 화면이 아니라 보드를 옮겨 쓴다(브라우저 접속). PC 데스크톱 해상도는 건드리지 않는다.
- 동시에 쓰는 일은 드물지만 확답은 못 한다. 노트북만 써도 PC의 창은 트레이에 남거나 열려 있어 이미 다른 클라이언트로 붙어 있다. 그래서 동시 접속이 안전한 것을 기본으로 한다.
- 지연: 이 PC에서 글자 입력 → 화면은 중앙값 33ms(E5)이고, 노트북 → PC Tailscale 왕복은 직접 연결 7ms였다. 대역폭은 턴 하나에 세션당 수 KB(바뀐 부분만)다.

지금 깨지는 곳(지휘 세션이 코드에서 확인)은 다음과 같다.
- **화면 위치(viewport):** 보드에 하나로 저장된다(`board.viewport`, meta `viewport`). 한 창에서 움직이면 다른 창의 다음 화면이 바뀐다.
- **터미널:** 패널마다 herdr 제어기 하나에 클라이언트 하나만 붙는다(`relay.mjs`). 다른 클라이언트가 붙으면 앞 클라이언트가 놓인다(takeover). 패널 크기(열×행)도 하나다.
- **알림:** OS 알림이 붙은 모든 창에서 뜬다.

### 할 것

1. **클라이언트 알아보기.** 창마다 오래 가는 클라이언트 ID와 이름(예: 기기 이름)을 백엔드에 알린다. 백엔드는 붙은 클라이언트 목록과 마지막 입력 시각을 안다. 창 위쪽 알약 줄 같은 곳에 "다른 기기 n" 표시를 둔다.
2. **화면 위치는 클라이언트마다.** viewport를 클라이언트별로 저장한다. 처음 붙는 클라이언트는 지금의 보드 값(또는 전체 보기)에서 시작한다. 옛 판 값은 그대로 읽는다.
3. **터미널 나눠 보내기.**
   - 한 패널의 화면을 붙은 클라이언트 모두에게 보낸다. 새로 붙는 클라이언트는 지금 화면 전체를 먼저 받는다.
   - herdr 제어기를 패널마다 하나로 두고 나눌지, 클라이언트마다 따로 열 수 있는지(takeover 없이)는 먼저 짧게 실험해 고른다. 결과는 작업 기록에 적는다.
4. **크기 정하는 기기.**
   - 패널 크기(열×행)는 그 터미널에 마지막으로 입력했거나 초점을 준 클라이언트가 정한다(tmux의 latest와 같다).
   - 다른 클라이언트는 같은 열×행을 자기 노드 크기에 맞춰 비율로 줄이거나 늘려 그린다. 글이 잘리거나 겹치지 않는다.
   - 크기를 가진 클라이언트가 떠나면 남은 쪽이 가져간다.
5. **입력.** 두 클라이언트 모두 칠 수 있다. 다른 기기가 방금 친 터미널에는 노드에 짧게 표시한다(잠그지는 않는다).
6. **알림 고르기.**
   - OS 알림은 최근에 입력이 있었던 클라이언트(활성)에서만 띄운다. 활성이 없으면 지금처럼 PC에서 띄운다.
   - 트레이 배지는 PC에서 늘 보인다.
   - 승인 카드·질문에 한 쪽이 답하면 다른 쪽 카드도 닫힌다(지금 상태 흐름을 확인만 한다).
7. **보드 편집.** 노드 옮기기, 덩어리, 메모처럼 이미 백엔드가 정하고 모두에게 알리는 것은 두 창에서 맞게 보이는지 확인만 한다. 어긋나면 고친다.
8. **지연 시험 도구.** WebSocket 사이에 지연(예: 50, 100, 200ms)과 흔들림을 넣는 시험용 프록시를 둔다. 그 위에서 입력 → 화면 시간을 잰다. R3에서도 쓴다.

### 완료 기준

1. 클라이언트별 viewport, 크기 정하는 기기 고르기, 알림 받을 클라이언트 고르기, 나눠 보내기의 상태 바꾸기는 순수 함수로 두고 단위 시험한다.
2. 한 PC에서 창(클라이언트) 둘로 시험하고 결과를 `experiments/p47/`(git 밖)에 남긴다.
   - 두 번째 창은 Electron 프로필을 따로 주거나, 시험 하네스에서 두 번째 클라이언트를 띄운다(R2 웹 화면을 기다리지 않는다).
   - 두 창이 같은 셸·claude(`--model haiku`) 노드를 함께 보고, 한쪽에서 친 글이 양쪽에 보인다. 뺏기 없이 둘 다 계속 화면을 받는다.
   - 한쪽에서 화면을 옮겨도 다른 쪽 화면 위치는 그대로다.
   - 크기가 다른 두 노드 크기에서, 크기 정하는 기기가 바뀔 때 화면이 깨지지 않는다.
   - 알림은 활성 창에서만 뜬다(시험용 알림 기록으로 확인).
   - 지연 프록시 0·50·100·200ms에서 입력 → 화면 시간을 잰다.
3. `cd backend && npm test`, `cd app && npm test`, `cd app && npm run build`가 통과한다.

### 시험 환경

- 너만의 개발용 판으로 띄운다(`docs/testing.md`).
  - `ATRIUM_HERDR_SESSION=atrium-dev-p47`, `ATRIUM_PORT=47865`
  - `ATRIUM_DATA_DIR=<워크트리>/backend/.dev/data`, `ATRIUM_APP_USERDATA=<워크트리>/backend/.dev/app`(두 번째 창은 `.../app2`)
- 실제 판(`atrium`, 47800)과 다른 작업자의 포트(47811~47864, 47866, 47867)는 쓰지 않는다.
- 대화 목록은 시험 폴더의 대화만 읽는다(`ATRIUM_CLAUDE_PROJECTS`, `ATRIUM_CLAUDE_DESKTOP=none`). 시험 폴더는 `C:\Workspace\mtask-p47-*`처럼 새로 만든다.
- 끝나면 시험 세션, 창, 백엔드, herdr 서버와 세션(`atrium-dev-p47`만), 시험 폴더, 시험 대화 기록을 끄고 지운다.

### 지킬 것

- `CLAUDE.md`를 따른다. 프로세스는 직접 띄운 것만 PID로 끈다.
- 이 저장소는 공개다. 작업 기록, 시험 코드, 커밋 메시지에 사용자 경로·메일·토큰을 쓰지 않는다. 커밋 전·푸시 전 검사를 건너뛰지 않는다.
- 이 작업은 백엔드를 네트워크에 열지 않는다. 백엔드는 지금처럼 `127.0.0.1`에서만 받는다.
- 같은 때 다른 작업자들이 돈다. 남의 파일은 되도록 건드리지 않고, 꼭 고쳐야 하면 작게 고치고 보고에 적는다.
  - P44: 사이드바, 그룹, 정렬, 워크스페이스 지우기
  - P45: `Thread.jsx`, 브리핑, 터미널 글자 크기, 설정의 배율
  - P46: `Docks.jsx`, 작업 관계도, 스킬 글
  - P48(R2): 백엔드가 화면을 내주기, 웹 쪽 `window.mt` 바꾸기, 짝 맺기와 기기 토큰, 폴더 탐색기, 업로드. API에 클라이언트 ID를 넣는 방법은 P48과 맞아야 하니 단순하게(연결 첫 메시지나 연결 주소의 값) 하고 보고에 적는다.
  - ux1: 시험 스크립트만
- 너의 파일: `relay.mjs`, 터미널 API, viewport 저장(`backend.mjs`의 그 부분, `Canvas.jsx`의 viewport 저장), 클라이언트 목록, 알림 고르기(`app/src/main`의 알림, 창의 알림 부르기).
- 화면 글은 `locales/en.js`·`ko.js` 끝에 더한다. 한국어는 P39 말투(합니다체)와 용어를 따른다. `styles.css`는 끝에 더한다.
- 자기 브랜치에만 커밋한다. 커밋 메시지에 `Co-Authored-By` 줄을 넣지 않는다. `main`을 바꾸거나 푸시하지 않는다. `node_modules`는 워크트리 안에서 받는다(`npm ci`).
- 원격 작업은 사용자가 따로 검토한 뒤 합친다. 이 작업 파일과 보고는 그 검토를 위한 것이니, 바꾼 동작과 위험을 빠짐없이 적는다.
- 문서는 이 작업 파일의 작업 기록 절과 보고 절만 고친다. 고쳐야 할 ARCH 행(1절 통신, 5절 중계, H1 viewport, A1 알림, API·모듈 표)과 BRIEF 행의 새 문장은 보고 절에 적는다.
- 끝나면 보고 절을 쓰고, 맨 마지막에 `<워크트리>/backend/.dev/p47.done`(브랜치 이름과 마지막 커밋 해시 두 줄)을 만든다.

### 읽을 파일

- `CLAUDE.md`, `docs/testing.md`, `docs/ARCH.md` 1절·5절·7.4, 4절 A1·H1
- `docs/experiments/E5.md`(지연과 프레임 양), `docs/experiments/E12.md`(프레임 이어 붙이기)
- `backend/src/relay.mjs`, `backend/src/herdr/adapter.mjs`(제어기), `backend/src/backend.mjs`(API, viewport, 알림 이벤트), `app/src/renderer/Canvas.jsx`, `TerminalView.jsx`, `store.js`, `app/src/main/main.mjs`, `tray.mjs`, `preload.cjs`

## 작업 기록

2026-11-05, 작업자 세션(p47 워크트리).

### 계획

1. herdr 제어기를 클라이언트마다 열 수 있는지 먼저 실험한다.
2. 상태 바꾸기를 순수 함수(`backend/src/multiclient.mjs`)로 두고 중계(`relay.mjs`)를 그 위에 다시 쓴다.
3. 클라이언트 알아보기(연결 주소), 클라이언트별 viewport, 알림 고르기, "다른 기기 n"을 붙인다.
4. 창 쪽 터미널은 크기를 갖지 않은 창에서 비율로 그린다.
5. 지연 프록시를 만들고 창 둘 시험(`app/test/e2e/p47-multi.mjs`)으로 확인한다.

### 실험: 제어기를 나눌지, 클라이언트마다 열지

개발용 판(`atrium-dev-p47`, 47865)의 셸 패널 하나에 `herdr terminal session control`을 둘 붙였다(herdr 0.9.5). 스크립트는 git 밖 `experiments/p47/tools/probe-two.cjs`, `probe-refresh.cjs`이고, 결과는 `experiments/p47/e-plain.json`, `e-takeover.json`이다.

| 시험 | 결과 |
|---|---|
| A `--takeover`, 1.2초 뒤 B `--takeover` 없이 | B가 바로 끝남: `terminal.closed`, "already has an attached client; retry with --takeover". A는 계속 받음 |
| A `--takeover`, 1.2초 뒤 B `--takeover` | A가 끝남("terminal attach taken over"). B만 받음. 크기는 B의 값 |
| 붙은 제어기에 같은 크기 `terminal.resize` | 2ms 뒤 `full: true` 프레임이 옴 |
| `terminal.refresh`, `terminal.redraw` | 없는 명령(받는 것은 `input`, `resize`, `scroll`, `mouse`, `release`) |
| 다른 크기로 resize | 바로 `full: true` 프레임 |

그래서 **패널마다 제어기 하나를 두고 백엔드가 나눠 보낸다**를 골랐다. herdr는 한 패널에 클라이언트 하나만 받으므로 클라이언트마다 여는 길은 없다. 새로 붙은 클라이언트에게는 같은 크기 resize로 full 프레임을 부르고, 그 전의 변경 프레임은 그 클라이언트에게 보내지 않는다.

### 진행

- `multiclient.mjs`: `parseClientHello`, `clientList`, `pickNotifyClient`, `viewportKey`·`viewportFor`, 나눠 보내기(`shareJoin`, `shareLeave`, `shareActive`, `shareWant`, `shareSize`, `shareFrame`, `shareNeedsFull`, `shareOwnerView`).
- `relay.mjs`를 다시 썼다. 제어기 하나에 붙은 클라이언트 목록을 두고, 입력·초점이 크기를 가져가고, 떠나면 남은 쪽이 가져간다.
- `peers.mjs`: 붙은 클라이언트 목록과 알림 받을 클라이언트(`clients.updated`).
- 창: `api.js`가 연결 주소에 `client`, `name`, `kind`를 붙인다. `store.js`가 `peers`를 들고 키·마우스·휠에 `client.active`를 보낸다(20초에 한 번). `notify.js`는 백엔드가 고른 클라이언트가 아니면 띄우지 않는다. 트레이도 `client.hello`로 알리고 같은 규칙을 따른다.
- 첫 창 시험에서 두 가지가 틀렸다. 크기를 가진 창도 `fitScale`이 칸 끝 여백(한 칸보다 작음)을 메우려고 1.02~1.03배로 그렸다. 크기를 가진 창은 늘 1배로 고쳤다. 승인 대기를 만들려던 `echo`는 Claude Code가 승인 없이 돌려서 `touch`로 바꿨다.
- 7번(보드 편집)을 보다가 `board.setNode`가 아무에게도 알리지 않는 것을 찾았다. 한 창에서 노드를 끌어 옮겨도 다른 창은 다음 `board.changed`까지 옛 자리에 그렸다. `board.node` 이벤트를 더하고, 보낸 창은 `by`로 무시하게 고쳤다. 메모·칸반은 원래 `memo.updated`·`kanban.updated`로 알렸고, 덩어리·크기 단계·정리·영역 옮기기는 `board.changed`로 알렸다.
- 시험에서 칸 크기를 다르게 하려고 창 B의 터미널 칸을 CSS로 줄였다. 노드 크기가 아니라 칸 크기가 바뀐 것도 다시 재도록 `TerminalView`에 `ResizeObserver`를 더했다(같은 크기면 아무것도 하지 않는다).

### 창 둘 시험

`node experiments/p47/tools/e2e.cjs p47-multi.mjs`(창 A 프로필 `backend/.dev/app`, 창 B `backend/.dev/app2`, 이름 PC-A·PC-B). 둘째 실행(`--tag p47-multi-2`)에서 20개가 모두 통과했다. 결과는 git 밖 `experiments/p47/p47-multi-2.json`, 로그 `p47-multi-2.txt`, 스크린숏 `p47-multi-2-*.png`, 지연 `p47-multi-2-latency.json`이다.

| 항목 | 결과 |
|---|---|
| 다른 기기 | 두 창 모두 "1 other device". 목록은 PC-A, PC-B, tray |
| 함께 보기 | 셸 패널에 제어기 1개, 클라이언트 2. A에서 친 `echo AAA47`, B에서 친 `echo BBB47`이 두 창에 보임. B에 "PC-A is typing". 덮개(놓임) 없음 |
| 화면 위치 | A가 (-3000, -2000, 0.4)로 옮겨도 B는 (392, 118.5, 1) 그대로. `board.get`이 창마다 자기 값을 줌. B를 다시 읽어도 자기 값 |
| 크기 정하는 기기(셸) | B가 침 → 60×13, A는 1.454배. A가 초점 → 85×18, B는 0.728배. B가 다시 침 → 60×13. 매번 두 창의 열×행과 보이는 글이 같고, 크기를 갖지 않은 창의 화면이 칸 안에 들어감 |
| 크기 정하는 기기(claude haiku) | B 초점 → 61×13(A 1.43배), A 초점 → 87×18(B 0.711배). 답 1~25가 두 창에 같은 글로 보임 |
| 알림 | B가 최근에 씀 → B의 `notifyLog`만 `notify: true`, A는 `other-client`. main 알림 기록도 B에만. A가 최근에 씀 → 반대. 한쪽에서 거절로 답하면 두 창 모두 `waiting`과 카드가 0.3초 안에 풀림 |
| 보드 편집 | A의 `board.setNode`가 B에 바로 보임(고친 뒤). A가 만든 메모가 B에, B가 고친 글이 A에 보임 |
| 지연 | 아래 표. 하네스가 붙고 떨어진 뒤에도 두 창은 붙어 있음 |

지연은 지연 프록시(한 방향 지연, 왕복은 두 배) 위의 세 번째 클라이언트(Node 하네스, `kind=web`)가 셸 패널에 한 글자(`z`와 지우기를 번갈아)를 보내고 다음 프레임을 받을 때까지 잰 값이다. 화면에 그리는 시간은 들어가지 않는다(E5에서 수 ms). 16번씩 쟀고 빠진 것은 없었다.

| 한 방향 지연 ± 흔들림 | 붙기 | 중앙값 | p90 | 최소~최대 |
|---|---|---|---|---|
| 0 | 2ms | 31ms | 32ms | 18~33ms |
| 50 ± 5ms | 119ms | 145ms | 153ms | 130~160ms |
| 100 ± 10ms | 203ms | 242ms | 251ms | 229~257ms |
| 200 ± 20ms | 417ms | 443ms | 467ms | 397~479ms |

0ms의 31ms는 E5의 글자 입력 → 화면 중앙값 33ms와 맞는다. 지연이 있을 때는 대략 왕복 지연 + 31ms에, 프록시가 조각마다 순서를 지키느라 더한 10~15ms가 붙었다.

### 정리

시험 세션 sh1·cl1을 끄고, 창은 시험이 닫았고, 판 전용 herdr 서버(`atrium-dev-p47`)와 백엔드를 멈췄다. herdr 세션 폴더, 시험 폴더 `C:\Workspace\mtask-p47-dir`, 그 대화 기록 폴더를 지웠다. 남은 Electron·herdr 프로세스가 없는 것을 확인했다. `backend/.dev/`(git 밖)는 워크트리와 함께 지워진다.

## 보고

### 만든 것

- **클라이언트 알아보기.** 창은 백엔드 연결 주소에 `client`(오래 가는 ID, 창 프로필 localStorage의 `mt.clientId`), `name`(기기 이름: main이 주는 호스트 이름, localStorage `mt.clientName`이 있으면 그것), `kind`(`desktop`·`web`·`tray`·`cli`)를 붙인다. 첫 메시지 `client.hello { client, name, kind }`로도 알릴 수 있다(P48 웹 화면용, 같은 이름). 값이 없거나 이상한 연결은 익명(`cli`)이고 목록에 넣지 않는다. 백엔드는 연결마다 `connectedAt`, `lastInputAt`을 들고, 바뀔 때 `clients.updated { clients, notify, activeMs }`를 보낸다. `events.subscribe`의 응답에도 `clients`가 있다. 새 API는 `client.hello`, `client.active`, `clients.list`, `terminal.focus`다.
- **다른 기기 n.** 위 오른쪽 알약 줄의 연결 알약 옆에, 다른 창·웹 클라이언트가 있을 때만 보인다(`Peers.jsx`). 마우스를 올리면 기기마다 이름, 종류, 마지막으로 쓴 때와 알림이 뜨는 기기가 보인다.
- **화면 위치는 클라이언트마다.** `board.setViewport`(워크스페이스 없이)는 meta `viewport:<client>`에 남기고 보드 값 meta `viewport`도 함께 고친다. `board.get`은 그 클라이언트 값, 없으면 보드 값을 준다. 처음 붙는 클라이언트는 가장 최근에 누가 옮긴 자리에서 시작한다. 옛 판 값과 익명 연결은 예전처럼 보드 값을 읽고 쓴다.
- **터미널 나눠 보내기.** 제어기는 패널마다 하나(`relay.mjs`)이고 프레임을 붙은 클라이언트 모두에게 보낸다. 다른 클라이언트가 붙어도 앞 클라이언트를 놓지 않는다. 새로 붙은 클라이언트에게는 같은 크기 resize로 full 프레임을 불러 보내고, 그 전 변경 프레임은 보내지 않는다. 마지막 클라이언트가 떠나면 제어기를 놓는다. 제어기가 끝나면(herdr 밖 화면의 takeover 등) 붙은 클라이언트 모두에게 `terminal.detached`를 보낸다.
- **크기 정하는 기기.** 패널 크기는 그 터미널에 마지막으로 입력했거나 초점을 준(`terminal.focus`, 창은 xterm 입력칸의 focus에서 부른다) 클라이언트의 열×행이다. 붙기만 해서는 가져가지 않는다. 처음 붙은 클라이언트가 처음 크기를 갖고, 크기를 가진 클라이언트가 떠나면 남은 쪽 가운데 가장 최근에 쓴 쪽(같으면 먼저 붙은 쪽)이 가져간다. 다른 클라이언트의 `terminal.resize`는 바라는 크기로만 기억한다. 백엔드는 `terminal.owner { owner, ownerName, ownerIsMe, cols, rows, shared, controllerPid }`를 붙은 클라이언트에게 보낸다. 크기를 갖지 않은 창은 같은 열×행을 노드 칸에 맞춰 가로·세로 가운데 작은 비율(0.2~3배)로 그리고 왼쪽 아래에 작은 모서리 표시를 둔다. 크기를 가진 창과 혼자 보는 창은 늘 1배다.
- **입력.** 붙은 클라이언트는 모두 칠 수 있다. 붙지 않은 클라이언트의 `terminal.input`·`resize`는 `not_attached`다. 한 클라이언트가 치면 다른 클라이언트에게 `terminal.input_by { clientId, name }`를 1초에 한 번까지 보내고, 창은 노드 오른쪽 위에 "<이름>에서 입력 중"을 2초 동안 보인다. 잠그지 않는다.
- **알림 고르기.** 백엔드가 알림 받을 클라이언트를 고른다(`pickNotifyClient`). 최근 5분 안에 입력이 있었던 창·웹 클라이언트 가운데 가장 최근 것, 없으면 PC 창(`desktop`) 가운데 가장 최근에 쓴 것(같으면 먼저 붙은 것), 창도 없으면 트레이다. 입력은 터미널 입력·초점, 화면 옮기기, 창 안의 키·마우스·휠(`client.active`, 20초에 한 번)이다. 창은 고른 클라이언트가 자기가 아니면 OS 알림을 띄우지 않고 `notifyLog`에 `why: 'other-client'`로 남긴다. 트레이는 고른 클라이언트가 트레이가 아니면 띄우지 않는다. 트레이 배지와 메뉴는 그대로 PC에서 늘 보인다. 승인 카드·질문은 지금 상태 흐름(`session.updated`)으로 한쪽에서 답하면 다른 쪽도 풀리는 것을 확인했다(고친 것 없음).
- **보드 편집.** `board.setNode`가 `board.node { sessionId, x, y, w, h, z, by }`를 보내고, 다른 창은 바로 그 자리에 그린다. 메모·칸반·덩어리·정리·영역 옮기기는 원래 모두에게 알렸고 맞게 보였다.
- **지연 시험 도구.** `backend/tools/delay-proxy.mjs --listen <포트> --target <백엔드 포트> --delay <ms> [--jitter <ms>]`. 127.0.0.1에서만 받고, TCP 조각마다 한 방향 지연 ± 흔들림을 넣되 방향마다 순서를 지킨다. 시험 안에서는 `startDelayProxy`로 띄우고 `setDelay`로 바꾼다.
- **시험.** 단위 시험은 `backend/test/p47.test.mjs`(12개), `app/test/p47-lib.test.mjs`(6개)다. 창 둘 시험은 `app/test/e2e/p47-multi.mjs`(20개, 작업 기록 절)다. `cd backend && npm test` 360개, `cd app && npm test` 130개가 통과했고 `npm run build`도 통과했다.

### 계획과 다른 곳

- 3번의 실험 결과, 클라이언트마다 제어기를 여는 길은 없다(herdr가 둘째 클라이언트를 거부한다).
- 두 번째 창은 Electron 프로필(`app2`)로 띄웠다. 지연은 그 창이 아니라 세 번째 클라이언트(Node 하네스)로 쟀다. 창의 백엔드 주소는 main이 `backend.json`에서 읽어 프록시로 돌릴 수 없었다. 그래서 지연 값은 프레임을 받을 때까지이고 그리는 시간은 들어가지 않는다.
- 같은 PC의 두 창은 노드 크기(보드 값)가 같아서, 크기가 다른 두 노드는 창 B의 터미널 칸을 CSS로 30% 줄여 만들었다.
- 지시에 없던 고침: `board.setNode`의 `board.node` 이벤트(7번에서 찾음), `TerminalView`의 `ResizeObserver`.
- 남의 파일을 작게 고쳤다. `Chrome.jsx`(가져오기 한 줄과 `<DevicesPill />` 한 줄), `store.js`(`peers`, `clients.updated`, `board.node`, `client.active`), `main.mjs`(`mt:backend`에 `deviceName`, `clientKind`), `tray.mjs`(트레이의 `client.hello`와 알림 건너뛰기), `backend.mjs`의 `events.subscribe`·`board.setNode`·`board.get`·`board.setViewport`와 처리기 두 줄.
- 실험 결과는 이 워크트리 안의 `experiments/p47/`(git 밖)에 두었다. 저장소 뿌리의 `experiments/`에 쓰는 명령은 워크트리 밖이라 막혔다. 워크트리를 지우기 전에 옮겨야 남는다.

### P48과 맞출 것

- 웹 화면은 연결 주소에 `client=<ID>&name=<기기 이름>&kind=web`을 붙이거나, 연결 뒤 첫 요청으로 `client.hello { client, name, kind: 'web' }`을 부른다. ID는 `[A-Za-z0-9_.:-]{4,80}`이다. 창 쪽 `api.js`는 `window.mt.backend()`가 주는 `clientKind`(없으면 `desktop`)와 `deviceName`을 쓰므로, 웹의 `window.mt`가 `clientKind: 'web'`과 기기 이름을 주면 된다.
- 웹 화면의 OS 알림(브라우저 Notification)은 같은 `notifyAllowed(peers)`를 따르면 된다.

### 알려진 문제와 위험

- 크기 정하는 기기는 초점만으로도 바뀐다. 다른 창의 터미널을 누르기만 해도 패널 크기가 바뀌고, 그때마다 Claude Code가 다시 그리고 셸 출력은 새 너비로 다시 감긴다. tmux latest와 같지만, 두 사람이 번갈아 누르면 화면이 자주 바뀐다.
- 새 클라이언트가 붙을 때 같은 크기 resize를 보낸다. herdr는 바로 full 프레임을 줬고 패널 크기는 바뀌지 않았지만, 안의 프로그램이 다시 그리는지는 보지 않았다. 이미 보던 클라이언트도 full 프레임을 한 번 더 받는다(수 KB).
- 비율로 그리는 것은 xterm 요소의 CSS `scale`이다. 1이 아닌 비율에서는 WebGL 글자가 조금 흐릴 수 있다. 3배보다 크게 키우지 않고 0.2배보다 작게 줄이지 않는다(그 너머에서는 비율이 노드에 맞지 않는다).
- `atrium attach --input`(CLI)도 붙은 클라이언트가 되어, 치는 동안 패널 크기를 CLI의 열×행(기본 120×40)으로 가져갔다가 떠날 때 돌려준다.
- 클라이언트별 viewport는 meta에 클라이언트 ID마다 한 줄씩 쌓이고 지우지 않는다(창 프로필이나 웹 브라우저가 바뀔 때마다 한 줄).
- 기기 이름은 호스트 이름이다. 같은 PC의 두 창은 이름이 같아 "다른 기기" 목록에서 구분되지 않는다(시험은 `mt.clientName`으로 이름을 줬다). 호스트 이름은 붙은 다른 클라이언트에게 보인다.
- 트레이의 클라이언트 ID는 `tray-main` 하나다. 앱 둘(프로필 둘)의 트레이는 목록에서 하나로 합쳐진다.
- 옛 창(클라이언트 ID 없음)과 새 창이 섞이면 옛 창은 고르기를 모르므로 예전처럼 띄운다. 그때만 알림이 두 번 뜰 수 있다.
- 활성은 5분이다. 노트북에서 쓰다가 5분 넘게 손을 놓으면 알림이 PC 창으로 돌아온다.

### ARCH·BRIEF에 고칠 문장

- ARCH 1절 그림의 창 줄: "[Electron 창 또는 웹 화면: …] ─┬─ WebSocket(127.0.0.1, 토큰, 연결 주소의 client·name·kind)". 화면 중계 줄: "화면 중계: 가까이 보이는 노드마다 `herdr terminal session control` 자식 프로세스 하나, 붙은 클라이언트 모두에게 나눠 보냄".
- ARCH 5절 화면 중계 행: "패널마다 `herdr --session <판> terminal session control <pane> --takeover --cols --rows` 자식 프로세스 하나를 띄워 프레임을 붙은 클라이언트 모두에게 넘긴다. herdr는 패널 하나에 클라이언트 하나만 받는다. 새로 붙은 클라이언트에게는 같은 크기 resize로 full 프레임부터 준다. 패널 크기는 마지막으로 입력했거나 초점을 준 클라이언트가 정하고, 떠나면 남은 쪽이 가져간다. 마지막 클라이언트가 떠나면 놓는다(`relay.mjs`, 상태 바꾸기는 `multiclient.mjs`)". 새 행 "클라이언트 | 붙은 창·웹·트레이 목록, 마지막 입력 시각, 알림 받을 클라이언트(`peers.mjs`, `multiclient.mjs`)".
- ARCH 4절 H1 마지막 문장: "뷰포트는 클라이언트(창, 웹 화면)마다 하나다. 처음 붙는 클라이언트는 보드 값(가장 최근에 누가 옮긴 자리)에서 시작한다."
- ARCH 4절 A1의 OS 알림 문장 뒤: "창이 여럿 붙었으면 최근 5분 안에 입력이 있었던 클라이언트에서만 띄우고, 없으면 PC 창, 창도 없으면 트레이에서 띄운다. 트레이 배지는 PC에서 늘 보인다."
- ARCH 6절 API 표: `terminal.attach`·`terminal.detach` 행에 "붙은 클라이언트 모두가 같은 제어기의 프레임을 받는다. 이벤트 `terminal.owner`(크기 정하는 클라이언트, 열×행, 함께 보는 수), `terminal.input_by`(다른 클라이언트의 입력)". 새 행: `terminal.focus { session }`(그 클라이언트가 패널 크기를 가져간다), `client.hello { client, name, kind }`, `client.active`, `clients.list` → `{ clients, notify, me }`. `board.get`·`board.setViewport`의 viewport는 "그 클라이언트의 값(없으면 보드 값)". `events.subscribe`의 이벤트에 `clients.updated`, `board.node`를 더한다.
- BRIEF "정한 것"의 원격 행 새 문장: "한 백엔드에 창·웹 화면이 여럿 붙는다. 터미널 화면은 모두에게 나눠 보내고 크기는 마지막으로 쓴 쪽이 정한다. 화면 위치는 클라이언트마다, 알림은 최근에 쓴 클라이언트에서만 뜬다(2026-11-05, P47)."
