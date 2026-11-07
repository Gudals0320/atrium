상태: 닫힘
날짜: 2026-11-07

## 지시

### 목표

세션이 자기 연결(부모, 하위 세션, 역할)을 판에서 언제든 읽게 하고, 부모 관계를 뗄 수 있게 한다. 판이 알림을 한 번 보내고 끝내는 지금 구조를 보완한다.

### 사용자의 말(2026-11-07)

"어떤 세션에서 다른 디렉토리에 워크스페이스를 하나 파서, 그 세션을 헤드로 새로 시작해 달라고 요청했다. 원래 켜져 있던 세션이 새로운 세션을 하나 만들었고 워크스페이스는 분리됐다. 그런데 처음에 지시를 내렸던 것 때문에 링크가 하나 연결되어 있다. (…) 근본적인 이유는 세션에 링크를 연결하면 메시지를 한 번 보내고 끝나기 때문이라고 생각한다. 그 메시지와 컨텍스트에만 의존하고, 이후에 연결 상태 등을 업데이트해 주지 않는다."

사용자는 리포 안 git 무시 파일(`.atrium`)에 연결을 적는 안도 물었다. 지휘 세션은 파일 대신 아래 안을 권했고 사용자가 진행을 정했다. 파일을 쓰지 않는 까닭: 진실이 판 SQLite와 둘이 되고, 관계가 리포를 넘고(이번 경우), 워크트리는 다른 체크아웃이고, 판이 사용자 리포에 쓰게 되고, 파일도 에이전트가 읽기로 해야 읽힌다.

### 지금(`v0.1.3`)

- 관계는 둘이다. 연결(표 `links`: 선, 역할, 오간 기록)과 부모 관계(`sessions.parent_session_id`, `sessions.branch`).
- 선 끊기(`link.delete`, `backend.mjs linkDelete`)는 선과 역할만 지우고, 역할이 있었으면 A에게 `unlinkNotice`를 보낸다. 부모 관계는 남는다. 그래서 B의 머리줄("@A의 워커 1"), 사이드바 들여쓰기, 미션 맵 나무, A의 `atrium children`, `atrium child-kill`이 닿는 범위(`branch.mjs killChild`, `isDescendant`), 잠재우기 묶임(`sleep.mjs info`의 `childBusy`·`parentBusy`)이 그대로다. A가 B에게 herdr로 다시 시키면 `ensureLink`가 선을 되살린다.
- 판이 세션에게 관계를 알리는 길은 대화에 넣는 알림뿐이다(`roleNotice`, `childNotice`는 부모에게만). 하위 세션은 자기 부모를 판에게 들을 수 없고, `atrium children`은 자기 아래만 보인다. 알림은 대화가 요약되면 흐려진다.

### 할 것

1. **재현.** 개발용 판에서 A가 `atrium child b --cwd <다른 폴더>`로 B를 띄운 뒤 선을 끊고, 위의 것(머리줄, 사이드바, `atrium children`, child-kill 범위, 잠재우기 묶임)이 남는 것을 재어 작업 기록에 적는다.
2. **`atrium me`.** 부르는 세션의 지금 연결을 판에서 읽어 준다(`/branch/me`, 세션 토큰, `bin/atrium-child.mjs`의 명령 목록). 담을 것:
   - 나: 이름, herdr 이름, 패널, 종류, 워크스페이스 이름, 워크트리·브랜치
   - 부모: 이름, herdr 이름, 역할과 순서, 상태(닫혔으면 닫힘). 없으면 "부모 없음"
   - 열린 하위 세션: 이름, 역할, 순서, 상태, 워크트리
   - 역할 연결 양쪽: "너의 리뷰어는 @y", "너는 @z의 리뷰어"
   - 연결마다 마지막으로 오간 일: 때와 지시 앞부분 한 줄
   - 쓸 명령(`herdr agent prompt`·`read`)

   사람이 읽기 쉬운 글이 기본이고 `--json`은 같은 내용이다. 보통 20줄 안으로 짧게. 닫힌 하위 세션과 끊긴 연결은 뺀다.
3. **부모에서 떼기.** 판 API(이름은 기존 꼴을 따른다, 예: `session.detach { session, confirm }`)로 B의 부모 관계를 지운다. `parent_session_id`와 하위 세션 기록(`branch`)을 비우고 부모 → B 역할 선도 끊는다(오간 기록은 남긴다). B는 맨 위 세션이 되고, B 아래 하위 세션은 B의 것 그대로다(단계 수만 다시 센다). 다시 켜도 그대로다. 되돌리기는 없다. 창에서는 두 곳:
   - 노드 메뉴의 "부모에서 떼기"(부모가 있을 때만)
   - 부모 → 하위 세션 선의 끊기 확인에서 "선만 끊기"와 "부모에서도 떼기" 고르기

   확인 글은 무엇이 바뀌는지(머리줄, 사이드바, 끄기와 잠재우기 묶임) 한두 줄로. 두 사전, 지금 말투.
4. **처음부터 헤드로 띄우기.** `atrium child <이름> --head [--cwd …] [--prompt …]`. 띄운 세션의 워커가 아니라 따로 일을 이끄는 세션이다.
   - 띄우기, 준비 기다리기, 신뢰 질문(`needs_trust`, `child-wait`), 첫 요청 확인(P79)은 지금처럼 한다.
   - 첫 요청이 들어가면(`--prompt`가 없으면 준비되면), 또는 들어가지 못했다고 판정되면(P79의 알림 뒤) 판이 3과 같이 부모 관계를 저절로 뗀다. 이때 3의 알림은 보내지 않는다.
   - 자리는 하위 세션 줄이 아니라, 사람이 새 세션을 띄울 때처럼 그 워크스페이스 영역의 빈자리다.
   - 응답 글에 "헤드로 띄웠다. 너의 워커가 아니다. 첫 요청 뒤 판이 부모 관계를 뗀다(뗐다)"를 적는다.
   - `--worktree`와 같이 쓰면 받을지 거절할지 정하고 근거를 적는다.
5. **바뀔 때 알림.** 받는 쪽의 행동이 바뀌는 때만 짧게 알린다. 내용은 `atrium me`가 주고 알림은 신호다. 알림 끝에는 "지금 연결은 `atrium me`"와 "이 알림에는 "알겠다"고만 답해라"를 붙인다.
   - 사람이 부모에서 뗐을 때: 옛 부모에게 "@B는 이제 너의 하위 세션이 아니다. 일을 시키지 마라", B에게 "너는 이제 부모 없는 세션이다(@A에서 뗌)".
   - 하위 세션이 부모의 `child-kill`이 아닌 까닭(사람이 닫음, 스스로 끝남, 패널 사라짐)으로 닫혔을 때: 부모에게 "@B가 닫혔다(까닭)".
   - 같은 세션에 짧은 사이(10초 안팎) 생긴 알림은 하나로 묶는다. 하위 세션 여럿을 한꺼번에 닫아도 부모의 턴은 하나다.
   - 잠든 세션을 이 알림 때문에 깨우지 않는다(깨면 `atrium me`로 본다).
   - 다른 알림은 더하지 않는다. 더 필요해 보이면 보고에 적는다.
6. **안내와 스킬.**
   - `launch.mjs BOARD_SYSTEM_PROMPT`에 한 줄: 부모·하위 세션·역할 연결은 `atrium me`가 판의 지금 기록이다. 누구의 무엇인지, 누구에게 맡길지 헷갈리면 먼저 치고, 예전 알림과 다르면 이것을 믿는다. 매 턴 치지는 않는다.
   - atrium 스킬(`branch.mjs SKILL_BODY`)에 `atrium me`와 `--head`를 더한다. `--head`는 사용자가 다른 폴더·저장소에 새 헤드나 따로 이끌 세션을 만들어 달라고 할 때 쓰고, 그 세션에는 첫 요청 뒤로 일을 시키거나 기다리지 않는다.
   - 이미 떠 있는 세션은 다시 떠야 새 안내와 스킬을 읽는지 재어 보고에 적는다.

### 손대지 말 것

- herdr 스킬 글(고정한 `herdr --skill` 출력)은 고치지 않는다.
- 사용자 리포에 파일을 쓰지 않는다.
- 선만 끊을 때의 지금 동작(A에게 해제 알림, 기록 남김)은 그대로 둔다.
- hook 없는 종류(codex 등)에 `atrium me`를 열지는 정하지 않고 보고에만 적는다.

### 완료 기준

1. 단위 시험을 더하고 통과한다:
   - `atrium me`: 부모 있음·없음·닫힘, 하위 세션, 역할 양쪽, 마지막 오간 일, `--json`
   - 떼기 뒤: 부모 기록, 하위 세션 기록, 역할 선, `atrium children`, `child-kill` 범위, 잠재우기 묶임, 단계 수, 다시 켬
   - `--head`: 첫 요청 뒤 떼기, 신뢰 기다리는 동안 부모 유지, 자리
   - 알림: 누구에게, 묶기, `child-kill`이면 안 보냄, 잠든 세션
   - 안내와 스킬 글
2. 창 시험(개발용 판)으로 고치기 전(`v0.1.3` 코드)과 고친 뒤를 같은 단계로 찍어 `experiments/p81/`에 둔다: A → B(다른 워크스페이스) 띄우기, 노드 메뉴로 떼기, 선 끊기 확인의 두 고르기, `--head`로 띄우기. 머리줄·사이드바·미션 맵 그림과 `atrium me` 출력을 남긴다.
   - 시험 저장소는 P75·P78과 같은 경로 `C:\Workspace\mtask-p75-repo`를 새로 만들어 쓴다(사용자가 그 경로의 신뢰를 이미 주었다). 다른 워크스페이스는 git이 아닌 새 폴더 `C:\Workspace\mtask-p81-head`를 쓴다. 신뢰 질문이 뜨면 `backend/.dev/p81-need-trust.txt`에 한 줄을 두고 기다린다.
3. `cd backend && npm test`, `cd app && npm test`, `cd app && npm run build`가 통과한다.

### 읽을 파일

- `CLAUDE.md`, `docs/testing.md`, ARCH 4절 D4·F(F1·F2)·K(K1·K4), `docs/log/p8-branch.md`, `docs/log/p79-first-prompt-delivery.md` 보고 절
- `backend/src/branch.mjs`(`handleHttp`, `dispatch`, `spawnChild`, `killChild`, `listChildren`, `childNotice`, `SKILL_BODY`, 첫 요청 추적), `backend/src/backend.mjs`(`linkCreate`, `linkDelete`, `ensureLink`, `setParent`, 세션 닫힘), `backend/src/links.mjs`(알림 글), `backend/src/sleep.mjs`(`info`), `backend/src/store-branch.mjs`, `backend/src/launch.mjs`(`BOARD_SYSTEM_PROMPT`), `backend/bin/atrium-child.mjs`
- `app/src/renderer/Links.jsx`(끊기 확인), `app/src/renderer/SessionNode.jsx`(노드 메뉴), 두 사전
- `backend/test/p8.test.mjs`, `app/test/e2e/p75-worker-line.mjs`(창 시험 틀)

### 시험 환경

- 이 작업은 `dev` 브랜치에서 시작한다. 워크트리를 연 뒤 먼저 `git fetch origin && git merge --ff-only origin/dev`를 한다(워크트리가 `main`에서 시작할 수 있다).
- 너는 사용자의 실제 판 위에서 도는 워커라 셸에 실제 판의 `ATRIUM_*`·`HERDR_*`가 있다. 시험, 개발용 판, herdr, `atrium`은 이 변수를 지운 셸(`backend/.dev/clean-env.sh`, `docs/testing.md`)로 부른다.
- 개발용 판은 너만의 판으로 띄운다(`docs/testing.md`).
  - `ATRIUM_HERDR_SESSION=atrium-dev-p81`, `ATRIUM_PORT=47898`, 창의 원격 디버깅 포트 9378
  - `ATRIUM_DATA_DIR=<워크트리>/backend/.dev/data`, `ATRIUM_APP_USERDATA=<워크트리>/backend/.dev/app`
- 실제 판(`atrium`, 47800)과 다른 판의 포트는 쓰지 않는다. 사용자의 기본 herdr 세션, 실제 판의 herdr 세션(`atrium`), 다른 판의 herdr 서버는 건드리지 않는다. 사용자의 실제 판은 열지도 캡처하지도 않는다. 스크린숏은 창 안만 찍는다(`page.screenshot`).
- 실제 판의 API(47800)와 `atrium` 명령으로 실제 판을 바꾸지 않는다. 시험의 `atrium` CLI는 늘 개발용 판 환경 변수(`ATRIUM_PORT` 등)를 주고 부른다.
- 실제 설치 폴더(`%LOCALAPPDATA%\atrium\versions`)와 실제 데이터 폴더(`%LOCALAPPDATA%\atrium`)는 읽지도 바꾸지도 않는다.
- 대화 목록은 시험 폴더의 대화만 읽는다(`ATRIUM_CLAUDE_PROJECTS`, `ATRIUM_CLAUDE_DESKTOP=none`). 시험 폴더는 `C:\Workspace\mtask-p81-*`처럼 새로 만든다.
- 세션은 `claude --model haiku`와 셸로 띄운다.
- 끝나면 시험 세션, 창, 브라우저, 백엔드, herdr 서버와 세션(`atrium-dev-p81`만), 시험 폴더를 끄고 지운다. 네가 띄운 프로세스가 남지 않았는지 포트로 확인한다.

### 지킬 것

- `CLAUDE.md`를 따른다. 프로세스는 직접 띄운 것만 PID로 끈다. 신뢰 질문은 대신 답하지 않는다.
- 이 저장소는 공개다. 작업 기록, 시험 코드, 커밋 메시지, 그림에 사용자 경로·메일·토큰, 실제 PC·tailnet 이름, IP, 실제 대화 내용을 쓰지 않는다. 커밋 전·푸시 전 검사를 건너뛰지 않는다.
- 화면 글은 영어와 한국어 사전 둘 다 고친다. 한국어 문구는 사전의 지금 말투(`docs/log/korean-copy-review.md`)를 따른다.
- 같은 때 다른 작업자는 없다. 맡은 일에 필요한 만큼만 고치고, `styles.css`와 두 사전은 끝에 더해 합치기 쉽게 한다.
- 자기 브랜치에만 커밋한다. 커밋 메시지에 `Co-Authored-By` 줄을 넣지 않는다. `main`이나 `dev`를 바꾸거나 푸시하지 않는다. `node_modules`는 워크트리 안에서 받는다(`npm ci`, 창은 그 뒤 `node node_modules/electron/install.js`).
- 문서는 이 작업 파일의 작업 기록 절과 보고 절만 고친다. 고쳐야 할 ARCH·BRIEF·testing·README 문장은 보고 절에 짧게 적는다. 살아 있는 문서 예산이 거의 찼으니(70,000자 중 69,996자) 문장은 바꾸는 문장보다 길지 않게 적는다.
- 끝나면 보고 절을 쓰고, 맨 마지막에 `<워크트리>/backend/.dev/p81.done`(브랜치 이름, 마지막 커밋 해시, 시험 수 세 줄)을 만든다.

## 작업 기록

- 기준: `origin/dev` `1e20b7a`. 브랜치 `worktree-p81`. 셸에서 실제 판 변수를 지우는 `backend/.dev/clean-env.sh`와, 이 판의 값만 넣는 `backend/.dev/p81.sh`를 만들어(둘 다 git 밖) 시험·빌드·CLI를 모두 그것으로 불렀다.
- 창 시험 `app/test/e2e/p81-session-links.mjs`를 먼저 쓰고 v0.1.3 코드 그대로 "고치기 전"을 찍었다. 같은 파일로 고친 뒤를 찍었다. 결과와 그림은 `experiments/p81/`(git 밖). 창은 한국어로 바꿔 찍었다.
- 시험 판의 함정: 창이 띄운 백엔드와 herdr가 창의 원격 디버깅 포트(9378)를 물려받아, 창을 닫은 뒤에도 그 포트를 붙잡았다(다음 창이 `electron.launch` 시간 초과). 내가 띄운 herdr(PID)를 끄고, 시험이 백엔드를 창보다 먼저 CLI(`atrium backend start`)로 띄우게 고쳤다. 트레이 상주도 끈다.
- 재현(고치기 전, 1번): lead가 `atrium child bb --cwd C:/Workspace/mtask-p81-head`로 B를 띄우고 판에서 선을 끊었다. 끊은 뒤에도 B의 머리줄 "@lead의 워커 1 · 2단계", 사이드바 역할 "워커", `parentSessionId`, lead의 `atrium children`에 @bb, `atrium child-wait bb`(끄기와 같은 `isDescendant` 범위)가 그대로 됐다. 노드 메뉴에는 떼기가 없고, 끊기 확인 단추는 "연결 해제" 하나, `atrium me`는 "알 수 없는 명령", `--head`는 이름 자리 오류였다. 잠재우기 묶음은 창에서 재지 않고 단위 시험으로 쟀다(`sleep.mjs info`가 `parentSessionId`로 묶는다).
- 구현
  - `backend/src/link-notice.mjs`(새 파일): 알림 글, 닫힌 까닭(killed → 사람이 닫음, pane exited → 스스로 끝남, 그 밖 → 패널 사라짐), 세션마다 10초 묶기(`NoticeBatcher`). 넣을 때와 보낼 때 닫힘·닫는 중·잠듦이면 버리고 판 이벤트 `link_notice_dropped`로 남긴다.
  - `branch.mjs`: `me`(나·부모·열린 하위 세션·역할 연결 양쪽·연결마다 마지막 지시), `detach`(부모 기록, `branch` 기록, 부모 → 하위 역할 선. `unlink` 기록에 `why: detach`. 아래 하위 세션의 기록 depth를 다시 셈. 신뢰 관문 중이면 `gated`로 거부), `maybeHead`, 닫힘 알림(`onClosed`, child-kill로 끈 세션은 `byParentKill`로 뺀다). `--head`는 역할 "헤드", 기록 `head`·`headArmed`·`headPrompt`(다시 켜도 이어 감). 스킬에 두 줄, 승인 규칙에 `atrium me`.
  - `backend.mjs`: `session.detach { session, confirm }`, `link.delete`가 부모 선이면 확인에 `parentLink`·`parentMsg`를 주고 `detach: true`면 떼기(해제 알림 대신 떼기 알림), `closed` 이벤트에 까닭, 헤드는 하위 세션 줄 자리를 쓰지 않는다.
  - `launch.mjs` 짧은 안내에 한 줄. `bin/atrium-child.mjs`: `atrium me`(글, `--json`), `--head` 응답 글.
  - 창: 노드 메뉴 "부모에서 떼기"와 확인, 선 끊기 확인의 "선만 끊기"·"부모에서도 떼기", 두 사전(backend 절 세 줄, 끝에 `detach` 절), `styles.css` 끝 세 줄.
- 스킬 글 크기 상한(P8 delegate의 두 배, 6214B)에 걸려 스킬 추가를 두 줄로 줄였다(5821B → 6180B). 짧은 안내 줄 수 시험(6 → 7)을 고쳤다.
- 고친 뒤 창 시험 24/24. 처음 돌릴 때 D의 선 이름표가 화면 밖이라 누르지 못해 23/24였고, 요소를 직접 누르게 고쳐 다시 돌렸다. 다시 돌릴 때 시험이 앞서 띄운 a* 세션을 `atrium kill`로 껐더니 lead가 묶인 알림 한 번("@ac가 닫혔다(사람이 닫음).", "@ad가 닫혔다(사람이 닫음).")을 받고 "알겠다"고 답했다(실제 판 흐름의 알림 묶기 확인).
- 정리: `atrium kill`로 시험 세션 모두, herdr 서버와 백엔드 멈춤, 창 닫음, 시험 폴더 `C:\Workspace\mtask-p75-repo`와 `C:\Workspace\mtask-p81-head` 지움. 이 워크트리 경로·`atrium-dev-p81`을 가진 프로세스와 9378·47898 듣기 포트가 남지 않은 것을 확인했다. 데스크톱 앱과 실제 판의 프로세스는 건드리지 않았다.

## 보고

### 결과

- 커밋 `564f443`(코드·시험). 백엔드 `npm test` 582/582(P81 새 시험 11), 창 `npm test` 278/278, `npm run build` 통과. 창 시험: 고치기 전 8/8(재현 기록), 고친 뒤 24/24. 공개 검사 통과.

### 고치기 전과 뒤(창 시험, 같은 단계)

| | 고치기 전(선만 끊음) | 고친 뒤(노드 메뉴로 뗌) |
|---|---|---|
| B 머리줄 | "@lead의 워커 1 · 2단계" | 없음 |
| 사이드바 역할 | 워커 | 없음 |
| `parentSessionId` | lead | 없음, 1단계 |
| lead의 `atrium children` | @bb 보임 | 안 보임 |
| child-wait·child-kill 범위 | 됨 | `not_parent` |
| 선 끊기 확인 | "연결 해제" 하나 | "선만 끊기"(부모 남음 확인), "부모에서도 떼기"(부모 없음 확인) |
| `atrium me` | 알 수 없는 명령 | 나·부모(역할과 순서)·하위 세션·마지막 지시, 5~7줄 |
| `--head` | 이름 자리 오류 | "헤드로 띄웠다 … 너의 워커가 아니다. 첫 요청 뒤 보드가 부모 관계를 뗐다", 부모 없음, 다른 워크스페이스 영역의 빈자리 |

미션 맵에서 뗀 세션과 헤드는 "연결 없음"에 선다.

### 정한 것

- `--head`와 `--worktree`는 함께 받지 않는다(`bad_request`). 워크트리는 띄운 쪽이 합칠 브랜치를 만드는 워커의 방식인데, 헤드는 첫 요청 뒤 띄운 쪽과 관계가 끊겨 합칠 사람이 없다. 신뢰 관문(P36)도 부모의 `child-wait`에 기대는데 떼면 범위 밖이 된다. 헤드는 `--cwd`로 다른 폴더·저장소에 띄운다.
- 헤드의 역할 이름은 떼기 전까지 "헤드". 첫 요청이 confirmed·unconfirmed·failed·cancelled 가운데 하나가 되면 뗀다(못 들어가면 P79 알림이 부모에게 먼저 간다). 첫 요청이 없으면 ready·working이 되면 뗀다. 신뢰 질문·관문 동안은 부모를 둔다.
- 신뢰 관문을 지나는 중인 하위 세션은 떼지 않는다(`gated`). 관문 상태가 그 기록에 있다.
- `atrium me`의 "마지막으로 오간 일"은 열린 연결의 마지막 지시(때, 첫 줄 80자)다. 선만 끊은 하위 세션은 목록에 남고 마지막 지시는 빠진다.
- 알림 글: 한 줄이면 "[Atrium 보드] <줄>", 여럿이면 "연결이 바뀌었다." 아래 목록, 끝에 "지금 연결은 `atrium me`."와 "알겠다" 줄. 부모가 함께 닫히거나 닫는 중이면 버린다.

### 이미 떠 있는 세션(잰 것)

v0.1.3 코드로 띄운 lead를 둔 채 백엔드만 새 코드로 바꾸고 물었다. 새로 띄운 ab와 견줬다.

| | 이미 떠 있던 lead | 새로 띄운 ab |
|---|---|---|
| `atrium me` 실행 | 승인 카드를 띄움 | 묻지 않고 실행 |
| 짧은 안내에 `atrium me`가 있나 | 아니요 | 예 |
| atrium 스킬에 `atrium me`·`--head`가 있나 | 아니요 | 예 |

백엔드는 시작할 때 플러그인(스킬, 안내 파일)과 세션 설정 파일의 승인 규칙을 다시 쓰지만(설정 파일에 `Bash(atrium me)`가 들어간 것 확인), 돌고 있는 Claude Code는 셋 다 다시 읽지 않는다. `atrium` 명령 파일은 절대 경로라 승인하면 새 `me`가 돈다. 새 안내와 스킬을 쓰려면 세션을 다시 띄워야 한다(이어 가기 포함).

### 열어 둔 것

- hook 없는 종류(codex 등)에 `atrium me`: 지금은 세션 토큰 확인 뒤 `not_board_session`으로 거부한다(다른 하위 세션 명령과 같다). 열지는 정하지 않았다. 열려면 그 종류의 설정에 env(세션 ID·토큰)를 넣는 길이 먼저 있어야 한다.
- 더 알릴 만해 보인 것(더하지 않음): 부모가 닫혔을 때 하위 세션에게, 사람이 판에서 역할 선을 새로 이었을 때 받는 쪽(B)에게. 지금 B는 `atrium me`로만 안다.
- 닫힘 알림은 `closeSession`의 까닭으로 가른다. 판 밖에서 작업 공간을 닫은 것과 백엔드 복구 때 패널이 없던 것도 "패널 사라짐"이다.

### 고칠 문서 문장(짧게)

- BRIEF "정한 것": 세션은 자기 연결을 `atrium me`로 판에서 읽는다. 부모 관계는 판에서 뗄 수 있고(노드 메뉴, 선 끊기 확인), `atrium child --head`는 첫 요청 뒤 뗀다. 연결이 바뀌면 짧은 알림(10초 묶음, 잠든 세션은 깨우지 않음).
- ARCH K1: 명령 목록에 `me`, `child --head`. K: `session.detach`, `link.delete { detach }`, `link-notice.mjs`. F2: 부모 선 끊기 확인의 두 고르기. API 표에 `session.detach`.
- testing.md: 창 시험은 백엔드를 창보다 먼저 CLI로 띄운다(창이 띄운 백엔드·herdr가 원격 디버깅 포트를 물려받는다).
- README(단계 목록): P81 한 줄.
