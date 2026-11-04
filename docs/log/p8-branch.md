상태: 닫힘
날짜: 2026-10-31

## 지시

### P8 작업 지시: 가지 펼치기(옛 `docs/briefs/P8.md`)

2026-10-31에 작업자 CLI 세션에 맡기려고 쓴 지시다. 사용자는 세션 하나에게 "워커를 불러", "어디에 하위 세션을 띄워"라고 지시하면 그 세션이 하위 세션을 띄우고 herdr로 잇기까지 알아서 하기를 원한다. 사람이 하나하나 띄우고 잇지 않고, 지시하면 정해진 방법대로 가지처럼 펼쳐지는 구조다. 마크다운 뷰어 같은 화면 기능은 더 넣지 않는다.

정한 내용은 `docs/BRIEF.md` 1절 3번, 3절 "가지 펼치기" 줄, `docs/PLAN.md` 4절 K, 7절 P8에 있다.

#### 먼저 읽을 것

- `CLAUDE.md`, `docs/BRIEF.md`, `docs/PLAN.md`(4절 B1·B3·F·H7·J, **4절 K**, 7절 P8, 8절)
- `docs/P4.md`(herdr 스킬, 판에 올리기, 연결 알림), `docs/P7.md`(되살리기), 필요하면 `docs/P6a.md`(나무 배치), `docs/P6b.md`(API 문서)
- `backend/src/launch.mjs`(세션 설정 파일, 플러그인, 짧은 안내), `backend/src/backend.mjs`(`spawn`, `adoptPane`, `setParent`, `linkCreate`), `backend/bin/mtask.mjs`
- herdr 스킬(`herdr --skill`)

#### 할 일

PLAN 4절 K(K1~K4)를 백엔드와 창 모두 만든다.

- **K1 하위 세션 명령:** 판이 띄운 세션이 부르는 짧은 명령(예: `mtask child`, `mtask children`, `mtask child-kill`). 백엔드는 부르는 세션을 부모로 알아본다. 판은 세션 설정 파일의 `env`로 그 세션의 ID와 판을 찾아갈 값을 넘긴다. 하위 세션은 판이 띄운 정식 세션(hook, 스킬 플러그인, 짧은 안내, 권한 모드, herdr 이름, 이어 가기 등록)이고 부모의 폴더·모델·노력 수준·권한 모드·그룹을 물려받는다. 부모와 역할 선(기본 "워커")으로 잇고 부모에게 이름·패널·역할을 알린다(명령 응답에도). `--cwd`(다른 폴더), `--worktree`(`claude -w`), `--model`, `--kind`, `--prompt`, `--role`을 받는다.
- **K2 다시 펼치기와 스킬:** 하위 세션도 같은 명령을 쓴다. 플러그인에 일 맡기기 스킬을 더하고(만들기 → herdr로 시키기 → 답 읽기 → 모아 보고, 끝난 하위 세션은 두고 사람이 끄라고 할 때만 자기 자손을 끈다), 짧은 안내에 한 줄로 알린다. 세션 설정 파일에 이 명령과 herdr 일 시키기·답 읽기 명령의 승인 규칙을 넣어 묻지 않게 한다. 다른 `mtask` 명령은 넣지 않는다.
- **K3 상한:** 세션 하나의 하위 4개, 깊이 3단계, 판 전체 하위 16개(설정에 둔다). 넘으면 거부하고 까닭을 응답과 판 이벤트로 남긴다. 자기 자손이 아니면 끄기를 `not_parent`로 거부한다.
- **K4 나무 모양:** 하위 세션은 부모 오른쪽 빈자리, 형제는 위아래로 쌓인다(새 노드를 놓을 때만, 사람이 옮긴 자리는 지킨다). 다른 워크스페이스면 그 영역에 놓고 선으로 잇는다. 머리줄에 부모와 깊이 표시, 사이드바와 미션 맵에서 부모 아래 들여 보이기. 다시 켜도 관계와 선이 남는다.

새 기능은 새 파일(모듈, 컴포넌트)에 두고 공용 파일에는 연결하는 줄만 더한다. 저장소 스키마를 바꾸면 이전 `board.db`를 옮기는 코드를 함께 둔다. 판에 올리기(P4 F3)는 판 밖 방법으로 띄운 것을 위해 그대로 둔다.

#### 완료 기준

PLAN 7절 P8의 다섯 가지다. 개발용 판에서 실제 세션으로 확인한다. 시험할 수 없는 항목은 이유와 사람이 확인할 점검표를 남긴다. 화면은 초기 구현이면 된다.

#### 보안과 비용

- 하위 세션 명령은 판의 API 토큰을 쓴다. 에이전트가 이 명령으로 할 수 있는 일은 자기 하위 세션 만들기·목록·끄기뿐이게 한다. 승인 없이 도는 규칙에는 이 명령과 herdr 일 시키기·답 읽기만 넣는다. 다른 판 API(다른 세션 끄기, 설정 바꾸기 등)는 지금처럼 승인 카드로 묻는다.
- 시험 에이전트가 하위 세션을 만들 때 상한을 넘게 불어나지 않는지 늘 본다. 시험이 끝나면 하위 세션을 모두 끈다.
- 하위 세션은 같은 대화를 갈라 열지 않는다.

#### 워크트리와 합치기

- 너는 Claude Code가 만든 워크트리(`.claude/worktrees/p8`)에서 너만의 브랜치로 일한다. 그 브랜치에 커밋한다. 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`를 붙인다. `main`을 바꾸거나, 합치거나, 푸시하지 않는다. 다른 워크트리는 건드리지 않는다.
- `node_modules`는 워크트리 안에서 `npm install`로 받는다. 본 저장소의 `node_modules`에 정션을 걸지 않는다.

#### 시험 환경

- **너만의 개발용 판을 쓴다.** `--dev`에 환경 변수를 더해 백엔드, `mtask`, 창 모두 같은 값을 쓴다(`experiments/p6c/tools/mt.cjs`처럼 감싸개로).
  - `MTASK_HERDR_SESSION=multitask-dev-p8`
  - `MTASK_PORT=47820`
  - `MTASK_DATA_DIR=<워크트리>/backend/.dev/data`
  - `MTASK_APP_USERDATA=<워크트리>/backend/.dev/app`
- 다른 판은 건드리지 않는다: `multitask-dev`(사용자 세션 `s1`과 사용자가 띄운 백엔드가 있다), `multitask`(실제 판). 포트 47800, 47811~47819도 쓰지 않는다.
- 판이 띄운 세션이 부르는 하위 세션 명령이 반드시 이 시험 판(`multitask-dev-p8`)으로 가는지 확인한다. 기본 개발용 판이나 실제 판으로 가면 안 된다.
- 시험 폴더: `C:\Workspace\mtask-p8-plain`, `C:\Workspace\mtask-p8-plain2`(git이 아닌 폴더, `C:\Workspace`의 신뢰가 물려온다). 워크트리 시험용 리포 `C:\Workspace\mtask-p8-repo`(`git init`, 커밋 하나)에서는 Claude Code가 신뢰 대화상자를 띄울 수 있다. **신뢰 대화상자는 수락하지 않는다.** 뜨면 그 부분은 단위 시험과 점검표로 남긴다. multitask 저장소와 사용자의 다른 프로젝트 폴더는 워크스페이스로 열지 않는다(사이드바에 실제 대화가 보이지 않게).
- 시험용 Claude Code 세션은 `--model haiku`, 턴은 아주 짧게("Reply with exactly: …" 수준) 한다. 하위 세션도 haiku로 물려받게 한다. 나무 시험은 상한 시험에 필요한 만큼만 띄운다.
- 창은 Playwright의 Electron 지원이나 CDP로 조작하고 스크린숏을 찍는다. 스크린숏과 로그는 `experiments/p8/`에 둔다.
- 기존 단위 시험은 계속 통과해야 하고, 새 코드(부모 알아보기, 물려받기, 상한, 자손만 끄기, 나무 자리, 승인 규칙)에는 단위 시험을 더한다.

#### 규칙

- `CLAUDE.md`를 따른다. 실제 판의 값으로는 띄우지 않는다.
- 신뢰 대화상자는 수락하지 않는다. 시험 에이전트의 herdr 명령에 `--session`, `--machine`, `--remote`를 쓰게 하지 않는다. herdr 소켓 API의 `pane.split`은 `target_pane_id`로 대상을 준다.
- 데스크톱 앱 세션과 기존 세션은 건드리지 않는다. 직접 띄운 프로세스만 PID로 끈다. `~/.claude/settings.json`, `~/.agents/skills`, `~/.codex`, `~/.claude/projects`는 고치지 않는다. 사용자의 PATH와 환경 변수 설정도 고치지 않는다.
- symvibe는 화면 구성과 동작만 참고한다. OpenCove 파일을 가져오면 `CLAUDE.md`의 MIT 고지 규칙을 지킨다.
- `docs/PLAN.md`, `docs/BRIEF.md`, `CLAUDE.md`는 고치지 않는다.

#### 끝낼 때

1. `docs/P8.md`를 한국어로 쓴다: 만든 것과 바꾼 것(백엔드, API, 명령, 스킬, 승인 규칙, 창, 스키마와 옮기기), 돌리는 법과 쓰는 법(사람이 세션에게 주면 되는 지시의 예), 완료 기준마다의 증거(스크린숏 경로), 하위 세션 명령이 판을 찾아가는 방법과 보안상 한계, PLAN과 다르게 한 곳과 이유, 확인하지 않은 것과 알려진 문제, 사용자가 손으로 해 볼 것, PLAN·BRIEF·CLAUDE.md에서 바꿀 것.
2. 정리한다: 하위 세션과 시험 세션 끄기, 창 먼저 닫기, 너의 백엔드와 herdr 서버(`multitask-dev-p8`) 멈추기, 그 herdr 세션 지우기, `C:\Workspace\mtask-p8-*` 폴더와 그 워크트리 지우기.
3. 보고와 코드, 시험, 증거를 모두 네 브랜치에 커밋한다. 작업 트리가 깨끗해야 한다.
4. **맨 마지막에** `<워크트리>/backend/.dev/p8.done` 파일을 만든다. 내용은 브랜치 이름과 마지막 커밋 해시 두 줄이다. 모든 일이 끝난 뒤에만 만든다.

### 지휘 세션이 정한 범위와 완료 기준(옛 `docs/PLAN.md` 7절)

2026-10-31에 정했다. 4절 K를 만든다. 작업자 하나가 Claude Code 워크트리(`claude -w p8`)에서 백엔드와 창을 함께 만들고 지휘 세션이 `main`에 합친다. 지시는 `docs/briefs/P8.md`, 개발용 판은 `multitask-dev-p8`(포트 47820)이다.

완료 기준:

1. K1·K2: 판이 띄운 claude에게 "워커 둘을 만들어 각각 X, Y를 시키고 답을 모아 와"라고만 보내면, 그 claude가 판의 명령으로 하위 세션 둘을 만들고(사람의 승인 없이), herdr로 일을 시키고, 답을 모아 보고한다. 하위 세션은 정식 판 세션이다(상태, 마지막 답, 승인 카드가 판에서 된다).
2. K2: 하위 세션이 다시 하위 세션을 만들어 3단계 나무가 된다.
3. K3: 다섯 번째 하위 세션, 4단계, 판 전체 상한을 넘는 요청이 까닭과 함께 거부된다. 에이전트가 자기 자손이 아닌 세션을 끄려 하면 거부된다.
4. K1: 지시에 다른 폴더가 있으면 그 워크스페이스에, 워크트리가 있으면 `claude -w`로 띄워진다(신뢰 대화상자가 뜨는 곳은 점검표로).
5. K4: 하위 세션이 부모 오른쪽에 형제끼리 쌓여 놓이고, 역할 선과 머리줄 표시로 나무 모양이 보인다. 창·백엔드·herdr를 다시 켜도 나무가 남는다.

## 작업 기록

문서 규약(`docs/README.md`)을 도입하기 전(2026-10-31)의 작업이라 작업 기록을 따로 남기지 않았다. 작업하며 알아낸 것과 계획과 다르게 한 곳은 보고 절에 있다.

## 보고

### P8(v0.7): 가지 펼치기(옛 `docs/P8.md`)

2026-10-31에 만들고 시험했다. 작업 지시는 `docs/briefs/P8.md`이고, 범위는 PLAN 4절 K(K1~K4)의 백엔드와 창이다. 개발용 판 `multitask-dev-p8`(포트 47820, 이 워크트리의 `backend/.dev/`)에서 실제 haiku 세션으로 확인했다. 시험 폴더는 `C:\Workspace\mtask-p8-plain`, `mtask-p8-plain2`(git 아님), `mtask-p8-repo`(git, 커밋 하나)였고 시험 뒤 지웠다.

한 줄 요약: 판이 띄운 claude에게 "워커 둘을 만들어 각각 X, Y를 시키고 답을 모아 와"라고만 보내면, 그 claude가 사람의 승인 없이 `mtask child`로 하위 세션 둘을 만들고 `herdr agent prompt`로 시키고 `herdr agent read`로 답을 읽어 보고했다. 하위 세션도 같은 방법으로 다시 펼쳐 3단계 나무가 됐고, 상한과 남의 세션 끄기는 까닭과 함께 거부됐다.

#### 1. 만든 것과 바꾼 것

##### 1.1 백엔드(`backend/`)

| 파일 | 하는 일 |
|---|---|
| `src/branch.mjs`(새) | 가지 펼치기 전부. 세션 토큰과 env(`envFor`, `settingsExtra`), 승인 규칙(`BRANCH_ALLOW`), 일 맡기기 스킬 글(`delegateSkill`)과 `mtask` 명령 파일(`childShims`), `POST /branch/*` 받기(`handleHttp`, `auth`), 하위 세션 만들기(`spawnChild`, 물려받기, 상한, 역할 선, 판 이벤트, 준비 기다리기), 목록(`listChildren`), 자손만 끄기(`killChild`), 나무 자리(`placeChild`), 세션 요약의 `branch`(`summaryExtra`), P8 전 세션의 설정 파일에 env·규칙 더하기(`refreshSettings`). 순수 함수 `depthOf`, `isDescendant`, `descendantsOf`, `checkLimits`, `childName`, `childSlot`, `childNotice`는 단위 시험이 바로 부른다 |
| `src/store-branch.mjs`(새) | 저장소의 P8 열 `sessions.branch`(JSON)와 메서드 `setBranch`, `branchRows`. SQL은 이 파일과 `store.mjs`에만 있다 |
| `bin/mtask-child.mjs`(새) | 판이 띄운 세션 안에서 도는 하위 세션 명령(`mtask child`, `children`, `child-kill`). 판의 API 토큰(`backend.json`)을 읽지 않고 env의 세션 토큰으로 `POST /branch/*`만 부른다. 응답한 판의 herdr 세션이 env와 다르면 멈춘다 |
| `src/backend.mjs` | 연결하는 줄만: `attachBranch`, `onHttp`의 `/branch/*`, `spawn`에서 설정 파일의 env·규칙(`settingsExtra`), `--worktree`, `parentSessionId`, 나무 자리(`placeChild`), 요약의 `branch` |
| `src/launch.mjs` | `writeSessionSettings`가 `env`와 `allow`를 더 받는다. `buildStartArgs`가 `worktree`를 받아 `--worktree <이름>`을 넣는다(처음 띄울 때만, 이어 가기 명령에는 넣지 않는다). `writeBoardPlugin`이 스킬과 `bin/` 파일을 더 받는다. 짧은 안내(`BOARD_SYSTEM_PROMPT`)에 한 줄 |
| `src/settings.mjs` | 숫자 설정 셋(`branchMaxChildren` 기본 4, `branchMaxDepth` 기본 3, `branchMaxTotal` 기본 16)과 범위 검사 |
| `src/recall.mjs` | 닫힌 세션을 다시 열 때도 설정 파일에 env와 규칙을 넣는다(한 줄) |
| `src/mission.mjs` | 미션 맵 노드에 `parentId`, `depth`, `role` |
| `bin/mtask.mjs` | 사람용 `mtask tree`(나무와 상한) |

##### 1.2 API, HTTP, 명령

- `POST /branch/child | /branch/children | /branch/kill`(판 포트, JSON). 머리글 `X-MT-Session: <부르는 세션 ID>`, `Authorization: Bearer <세션 토큰>`. 세션 토큰은 `HMAC-SHA256(판 API 토큰, "branch:" + 세션 ID)`이다. 판에 없는 세션은 `not_on_board`(404), 토큰이 틀리면 `bad_token`(401, 판 이벤트 `branch_rejected`), hook이 없는 세션은 `not_board_session`.
  - `child { name?, prompt?, role?, cwd?, worktree?, model?, kind?, wait? }` → `{ name, sessionId, agentName, paneId, kind, role, depth, cwd, workspaceKey, worktree, model, group, permissionMode, state, trust, waited, firstPrompt, notice, next: { prompt, wait, read }, counts }`. 거부는 `too_many_children`, `too_deep`, `board_full`, `needs_trust`, `bad_request`, `name_taken`(오류에 `limit`, `now`).
  - `children { all? }` → `{ parent, depth, children: [{ name, agentName, paneId, role, depth, state, ask, lastPrompt, lastAnswer(1500자), worktree, children }], counts }`.
  - `kill { name, only? }` → `{ killed: [{ name, closed }] }`. 자기 자손이 아니거나 자기 자신이면 `not_parent`(403).
- 판 API(WebSocket): `branch.tree`(모든 열린 세션의 부모·깊이·역할과 상한), `branch.limits`. 이벤트 `branch.refused { sessionId, name, code, reason, limit, now, want|target }`.
- 세션 요약에 `branch { depth, parentSessionId, parentName, parentOpen, child, role, worktree, children }`. `child`는 판의 명령으로 만든 하위 세션일 때만 참(판에 올린 에이전트는 거짓, 깊이만 같이 센다).
- 판 이벤트: `branch_child`(부모 쪽), `branch_parent`(자식 쪽), `branch_refused`, `branch_rejected`, `branch_kill`. `spawn` 이벤트에 `parent`, `worktree`, `place`(`tree` | `slot`).
- 설정: `settings.set { key: "branchMaxChildren" | "branchMaxDepth" | "branchMaxTotal", value }`(범위 1~16, 2~6, 1~64).

##### 1.3 에이전트가 쓰는 명령, 스킬, 짧은 안내

판 플러그인(`<데이터 폴더>\plugin\multitask-herdr\`)에 둘을 더했다.

- `bin/mtask`(sh)와 `bin/mtask.cmd`: Claude Code는 플러그인의 `bin/`을 Bash 도구의 PATH에 올린다(이 PC의 Claude Code 2.1.314에서 새 `claude -p`와 판의 대화형 세션 둘 다 확인). 그래서 사용자의 PATH를 고치지 않고 짧은 `mtask child …`가 된다. 파일은 이 판의 node와 `backend/bin/mtask-child.mjs`를 절대 경로로 부른다.
  ```
  mtask child [이름] [--prompt "첫 지시"] [--role 역할] [--cwd 폴더] [--worktree 이름] [--model 모델] [--kind 종류] [--no-wait] [--json]
  mtask children [--all]
  mtask child-kill <이름> [--only]
  ```
- `skills/delegate/SKILL.md`(`multitask-herdr:delegate`): 만들기(`mtask child <이름>`) → 시키기(`herdr agent prompt <이름> "…" --wait --timeout 600000`) → 답 읽기(`herdr agent read <이름> --source recent-unwrapped --lines 80`) → 모아 보고. 지킬 것: 명령을 그 모양 그대로 한 줄씩(`$`, 파이프, `&&` 없이), 폴더는 슬래시로, herdr에 `--session`·`--machine`·`--remote` 없이, 끝난 하위 세션은 두고 사람이 끄라고 할 때만 `mtask child-kill`, 상한 숫자, 하위 세션이 권한을 물으면 대신 답하지 않고 사람에게 알리기.
- 짧은 안내(`--append-system-prompt-file`)에 한 줄: "워커·하위 세션을 만들어 일을 나누라는 말을 들으면 delegate 스킬대로 `mtask child`로 만들고 herdr로 시킨다."

##### 1.4 승인 규칙과 env(세션 설정 파일)

판이 띄우는 모든 Claude Code 세션의 설정 파일(`--settings`)에 넣는다.

- `env`: `MTASK_PROFILE`, `MTASK_HERDR_SESSION`, `MTASK_PORT`, `MTASK_DATA_DIR`, `MTASK_SESSION_ID`, `MTASK_SESSION_TOKEN`. 작업 공간 env는 herdr 재시작 뒤 되살아나지 않으므로(E7) 설정 파일에 둔다. 이어 갈 때 같은 파일을 다시 읽는다.
- `permissions.allow`: `mtask child`, `mtask children`, `mtask child-kill`, `herdr agent prompt`, `herdr agent wait`, `herdr agent read`(Bash는 `:*`와 ` *` 두 모양, PowerShell은 ` *` 모양). 다른 `mtask` 명령과 다른 herdr 명령(`pane split`, `agent start`, `send-keys`, `--session`을 붙인 호출, P4의 herdr 전체 허용)은 넣지 않는다. 새 세션 대화상자의 "herdr 명령 자동 승인"(P4)을 켠 세션은 그 규칙을 더 갖고, 하위 세션도 그것을 물려받는다.
- 백엔드가 뜰 때 이미 판에 있는 세션(P8 전에 띄운 것)의 설정 파일에도 env와 규칙을 더한다. hook과 다른 규칙은 그대로 둔다. 돌고 있는 claude는 다음에 이어 갈 때부터 쓴다.

##### 1.5 창(`app/`)

| 파일 | 하는 일 |
|---|---|
| `src/renderer/lib/branch.js`(새) | 머리줄 글(`branchLabel`: "@lead의 워커 · 2단계")과 나무 순서(`treeOrder`: 부모 바로 아래에 자식, 들여 쓰기 수). 단위 시험 `test/p8-lib.test.mjs` |
| `src/renderer/Branch.jsx`(새) | 노드 머리줄·멀리 얼굴의 하위 세션 표시(`BranchBadge`), 상한에 막힌 요청 알림(`branch.refused` → 노란 테두리 알림), 설정 대화상자의 "가지 펼치기 상한" 칸 |
| `SessionNode.jsx`, `Settings.jsx` | 위 컴포넌트를 부르는 줄 |
| `Sidebar.jsx` | 판 세션 칸을 나무 순서로, 하위 세션은 깊이만큼 들여 쓰고 "워커 · 2단계"를 붙인다 |
| `Mission.jsx`, `lib/items.js` | 미션 맵의 세션을 나무 순서(다른 열에 있는 부모의 자식도 부모 순서대로)로 놓고 깊이만큼 들여 쓴다. 상자에 "워커 · 2단계" |
| `styles.css` | 표시, 들여 쓰기, 알림 색 몇 줄 |

선은 P4의 역할 선 그대로다(역할 "워커", 띄움 표시, 받는 쪽 상태). 하위 세션을 만드는 단추는 창에 없다(세션이 명령으로 만든다).

##### 1.6 저장소 스키마와 옮기기

- `sessions`에 열 `branch TEXT`(JSON: `role`, `depth`, `by`, `at`, `worktree`, `kind`, `via`, `inherited`)를 더했다. 부모는 P4의 `parent_session_id` 그대로다.
- P7까지의 `board.db`에는 `ALTER TABLE`로 빈 열이 더해진다(`store.mjs`의 기존 방법). 그 전의 세션은 하위 세션이 아니다. 판에 올린 에이전트의 부모 관계는 그대로 두고 깊이를 셀 때만 따라간다. `backend/test/p8.test.mjs`가 P7 모양의 `board.db`로 확인한다.

#### 2. 돌리는 법과 쓰는 법

##### 2.1 돌리는 법

평소와 같다. 판(백엔드)을 새로 띄우면 플러그인에 스킬과 명령이 생기고, 그 뒤 판이 띄우는 세션은 바로 쓸 수 있다. 시험 판은 감싸개로 부른다.

```
node experiments/p8/tools/mt.cjs backend start        # multitask-dev-p8, 47820, backend/.dev
node experiments/p8/tools/mt.cjs spawn C:\Workspace\mtask-p8-plain --name lead --model haiku
node experiments/p8/tools/mt.cjs send @lead "워커 둘을 만들어 각각 X, Y를 시키고 답을 모아 와. …" --wait
node experiments/p8/tools/mt.cjs tree                  # 나무와 상한
node experiments/p8/tools/mt.cjs settings set branchMaxTotal 8
cd app && npm run build && MT_E2E_OUT=p8 node test/e2e/p8-k1.mjs        # 창 시험(나무, 승인 카드)
cd app && MT_E2E_OUT=p8 node test/e2e/p8-k4.mjs [접두어]               # 창 시험(나무, 사이드바, 미션 맵, 설정, 거부 알림)
```

##### 2.2 사람이 세션에게 주면 되는 지시의 예

- "워커 둘을 만들어 각각 X, Y를 시키고 답을 모아 와."
- "리뷰어 하나를 불러서 이 변경을 리뷰시키고 지적만 정리해 와." (역할은 `--role 리뷰어`가 된다)
- "C:/Workspace/other 폴더에 하위 세션을 띄워서 그쪽 테스트를 돌리게 하고 결과를 보고해." (그 폴더의 워크스페이스에 생기고 선으로 이어진다)
- "feat-a라는 워크트리로 워커를 띄워 이 기능을 만들게 해." (신뢰한 저장소에서만. 아니면 `needs_trust`로 거부된다)
- "워커 하나를 만들고, 그 워커에게 '너도 워커를 하나 만들어 Y를 시키고 보고해'라고 시켜." (3단계)
- "mid와 그 아래 하위 세션을 꺼." (자기 자손만, 그 아래까지 깊은 것부터)

끝난 하위 세션은 기본으로 판에 남는다. 사람이 결과와 나무를 본 뒤 끄라고 하거나 노드의 ×로 끈다.

##### 2.3 화면

- 하위 세션은 부모 오른쪽 열에 작게(480×300) 놓이고 형제는 위아래로 쌓인다. 다른 워크스페이스면 그 영역의 빈자리에 놓이고 선만 이어진다. 사람이 옮긴 자리는 그대로 둔다.
- 머리줄과 멀리 얼굴에 "@lead의 워커 · 2단계". 사이드바(☰)와 미션 맵에서는 부모 아래 들여 보인다.
- 상한에 막히거나 남의 세션을 끄려 하면 오른쪽 아래에 노란 알림이 뜬다.
- 설정(⚙)의 "가지 펼치기 상한"에서 세 숫자를 바꾼다.

#### 3. 완료 기준별 증거

스크린숏과 기록은 `experiments/p8/`에 있다. 하위 세션 명령이 이 판으로만 갔다는 증거: 세션 설정 파일의 env가 `MTASK_HERDR_SESSION=multitask-dev-p8`, `MTASK_PORT=47820`이고, 이 판 백엔드 로그에 모든 만들기·거부가 남았다(`branch-backend-log.txt`, 13줄). 세션 토큰은 이 판의 API 토큰에서 나오므로 다른 판에 가면 `bad_token`이나 `not_on_board`로 끝나고, 명령은 응답한 판의 herdr 세션이 env와 다르면 멈춘다(단위 시험).

##### 3.1 K1·K2 두 워커를 만들어 시키고 모으기(완료 기준 1)

- `mt.cjs send @lead '워커 둘을 만들어 각각 X, Y를 시키고 답을 모아 와. X: "Reply with exactly: ALPHA", Y: "Reply with exactly: BRAVO"'` 한 번. lead는 `Skill(multitask-herdr:delegate)`을 불러 `mtask child w1`, `mtask child w2`(각 약 5초), `herdr agent prompt w1/w2 … --wait`, `herdr agent read w1/w2`를 차례로 돌리고 "@w1 (X): ALPHA, @w2 (Y): BRAVO"로 보고했다. 지시부터 보고까지 22초.
- 사람의 승인 없음: lead의 판 이벤트에 `PermissionRequest` 0개, `waiting` 0번(`k1-lead-events.json`).
- 하위 세션이 정식 판 세션: hook이 붙어 상태와 마지막 답(ALPHA, BRAVO)이 hook으로 왔고, 이어 가기 등록이 확인됐다(`resume.verified`). 판이 w1에게 파일 쓰기를 시키자 승인 카드가 w1 노드에 떴고 카드의 "1. Yes"를 눌러 파일이 써졌다(`k1-2-child-approval-card.png`, `k1-3-card-answered.png`, `p8-k1.json`).
- 판의 나무: `k1-1-two-workers-tree.png`(lead 오른쪽에 w1, w2가 위아래, 역할 선 "띄움", 머리줄 "@lead의 워커 · 2단계").
- 승인 규칙 밖의 명령은 묻는다: w2에게 `mtask settings`를 시키자 판에 승인 카드가 떴고 판에서 거부했다(`k2-other-mtask-asks-w2-events.json`).

##### 3.2 K2 3단계 나무(완료 기준 2)

- lead에게 "워커 하나를 mid로 만들고, mid에게 '너도 워커를 하나 만들어 Reply with exactly: DEEP을 시키고 답을 보고해'라고 시켜"를 보냈다. mid가 `deep-worker`(3단계)를 만들어 DEEP을 받아 보고했고, lead가 그것을 모아 보고했다. mid도 승인 없이 돌았다(`k2-mid-events.json`: `PermissionRequest` 0).
- `mtask tree`: `@lead 1단계 → @mid 2단계 → @deep-worker 3단계`(`k4-restart-before-tree.txt`).

##### 3.3 K3 상한과 자손만 끄기(완료 기준 3)

판 이벤트 `branch_refused`(`k3-board-events.json`)와 에이전트가 받은 응답:

| 요청 | 결과 |
|---|---|
| lead에게 자연어로 "워커 둘(n4, n5)을 더 만들어" | n4 됨. n5 `too_many_children`(4/4). lead가 까닭을 그대로 보고했다 |
| deep-worker(3단계)가 `mtask child too-deep` | `too_deep`(3/3) |
| 상한을 5로 낮춘 뒤 w1이 `mtask child extra` | `board_full`(5/5). 상한은 16으로 되돌렸다 |
| w2가 `mtask child-kill w1`(형제) | `not_parent` |

거부는 창에도 알림으로 뜬다(`k4-5-refused-toast.png`). 사람이 끄라고 하면 끈다: lead에게 "mid와 그 아래 하위 세션을 꺼"를 보내자 `mtask child-kill mid`로 deep-worker, mid 차례로 껐다(`k3-lead-kill-subtree-events.json`).

##### 3.4 K1 다른 폴더와 워크트리(완료 기준 4)

- 다른 폴더: w1에게 "C:\Workspace\mtask-p8-plain2 폴더에 하위 세션 far를 띄워 FAR를 시키고 보고해". far는 `mtask-p8-plain2` 워크스페이스에 생겼고(3단계, 역할 선이 영역을 건너 이어짐) FAR를 받아 왔다(`k4-after-restart-1-tree-canvas.png`). 첫 시도는 따옴표 없는 `C:\…`의 백슬래시를 Bash가 지워 `폴더가 없다`로 실패했고, w1이 슬래시로 다시 해서 됐다. 그래서 스킬과 오류 글에 "폴더는 슬래시로"를 넣었다.
- 워크트리: `mtask-p8-repo`(git init, 커밋 하나)에서 w2가 `mtask child wt --cwd C:/Workspace/mtask-p8-repo --worktree feat-a`를 부르자 판은 `claude --worktree feat-a …`로 띄웠다. Claude Code가 "Error creating worktree: Workspace trust not yet accepted"를 내고 바로 끝났다(`k1-worktree-untrusted-screen.txt`). 신뢰는 수락하지 않았다. 그 뒤 신뢰 예상으로 미리 거부하게 고쳤고(`needs_trust`, 5절 5번), 다시 부르자 까닭과 함께 거부됐다. 워크트리 없이 같은 저장소에 띄운 하위 세션은 `trust_wait`로 멈췄고 명령 응답이 "신뢰 대화상자에서 멈췄다"를 알렸다. 수락하지 않고 껐다.
- 신뢰한 저장소에서 `claude -w`로 워크트리가 만들어지고 노드에 워크트리·브랜치가 보이는 것은 점검표(8절 1번)로 남긴다. 실행 인자(`--worktree feat-a`)는 위 화면 기록과 단위 시험으로 확인했다.

##### 3.5 K4 나무 모양과 다시 켜기(완료 기준 5)

- 캔버스: `k4-1-tree-canvas.png`. lead 오른쪽 열에 w1, w2, mid, n4가 위아래로, mid 오른쪽에 deep-worker. 역할 선 위에 "워커 · 마지막 지시 · 상태".
- 사이드바: `k4-2-sidebar-indent.png`(lead 아래 들여 쓴 2단계, 그 아래 deep-worker 3단계).
- 미션 맵: `k4-3-mission-map.png`(지시하는 세션 열에 lead와 들여 쓴 mid, 세션 열에 하위 세션이 부모 순서대로 들여 쓰임, "워커 · n단계").
- 설정: `k4-4-settings-limits.png`.
- 다시 켜기: 창을 닫은 상태에서 백엔드를 멈추고 이 판의 herdr 서버를 멈춘 뒤(claude도 모두 끝남) 백엔드를 다시 띄웠다(herdr도 다시 뜸). 모든 세션이 ready로 돌아왔고 나무(`k4-restart-before-tree.txt` = `…-after-tree.txt`), 역할 선 6개(`…-links.txt`), 노드 자리와 크기(`…-board.json` 비교 같음)가 그대로였다. 이어 간 far가 `mtask children`을 다시 승인 없이 돌렸다(설정 파일의 env가 이어 가기에도 쓰인다). 창을 다시 연 화면은 `k4-after-restart-*.png`(머리줄·사이드바·미션 맵이 같다. 첫 장은 "자리를 비운 동안" 요약이 오른쪽 위를 가렸다).
- 백엔드만 다시 띄운 것도 세 번 했고 나무가 그대로였다.

##### 3.6 단위 시험

- 백엔드 133개 통과(P7까지 116개 + P8 17개, `backend/test/p8.test.mjs`): 깊이·자손·끄는 순서, 상한 셋, 이름, 나무 자리, 승인 규칙(허용할 명령과 물을 명령), env와 hook 보존, `--worktree`는 처음 띄울 때만, 플러그인 스킬·명령 파일, 숫자 설정, P7 모양 `board.db` 옮기기, 물려받기(폴더·모델·노력 수준·권한 모드·그룹, 그룹 전달), 다른 폴더는 그 워크스페이스, 신뢰 안 된 저장소의 워크트리 거부, 3단계와 거부 이벤트, 자손만 끄기(닫힌 중간 세션 아래 포함), 실제 HTTP와 `mtask-child.mjs`(토큰, 다른 판, env 없음, 모르는 명령), P8 전 설정 파일 다시 쓰기. P6b 설정 시험 한 개는 설정이 늘어 `tray`만 보게 고쳤다.
- 창 27개 통과(P7까지 24개 + `app/test/p8-lib.test.mjs` 3개). 창은 빌드된다.

#### 4. 하위 세션 명령이 판을 찾아가는 방법과 보안상 한계

**찾아가는 방법.** 판은 claude를 띄울 때 세션 설정 파일의 `env`에 판의 값(프로필, herdr 세션, 포트, 데이터 폴더)과 그 세션의 ID, 세션 토큰을 쓴다. 판 플러그인의 `bin/mtask`가 Bash 도구 PATH에 오르고, 그 파일이 이 판의 node로 `backend/bin/mtask-child.mjs`를 부른다. 명령은 env의 포트로 `127.0.0.1`의 `POST /branch/*`를 부르고, 백엔드는 머리글의 세션 ID와 토큰으로 부르는 세션을 부모로 정한다. 응답에 판의 herdr 세션 이름이 와서 명령이 env와 맞춰 본다. 사용자의 PATH, `~/.claude/settings.json`, 사용자 환경 변수는 고치지 않았다.

**명령이 할 수 있는 일.** 자기 하위 세션 만들기·목록·끄기뿐이다. 세션 토큰은 그 세션 하나에만 맞고, 받는 쪽은 `/branch/*` 세 가지만 한다. 판의 API 토큰은 쓰지 않는다. 다른 판 API(다른 세션 끄기, 보내기, 설정 바꾸기 등)는 사람용 `mtask`(판 API 토큰)로만 되고, 에이전트가 그것을 부르면 지금처럼 승인 카드로 묻는다(3.1절).

**한계.**
1. 판은 사람의 계정으로 돈다. 에이전트는 같은 사용자라서 데이터 폴더의 `backend.json`(판 API 토큰)과 다른 세션의 설정 파일(그 세션의 hook 토큰과 세션 토큰)을 읽을 수 있다. 세션 토큰은 실수와 승인 규칙의 범위를 좁히는 장치이지 격리(샌드박스)가 아니다. 그런 파일 읽기(작업 폴더 밖)와 그 값을 쓴 호출은 승인 규칙에 없으므로 권한 모드가 `manual`이면 대개 묻는다. 직접 시험하지는 않았다.
2. `herdr agent prompt/wait/read`를 묻지 않게 했으므로, 판이 띄운 세션은 같은 판 herdr 세션 안의 어느 에이전트(자기 하위 세션이 아닌 것, 사람이 띄운 다른 세션 포함)에게도 묻지 않고 지시를 보내고 화면을 읽을 수 있다. herdr 명령은 대상을 가리지 않기 때문이다. 다른 herdr 세션(`--session`)이나 기계(`--machine`)는 규칙에 맞지 않아 묻는다. 이것을 하위 세션으로만 좁히려면 herdr를 감싼 명령(예: `mtask child-prompt`)으로 바꿔야 한다(9절 제안).
3. `bypassPermissions`나 `auto` 권한 모드로 띄운 부모는 모든 것을 묻지 않으므로 이 경계가 없다. 하위 세션은 그 권한 모드를 물려받는다.
4. 이 HTTP 끝점은 `127.0.0.1`에서만 듣는다(hook과 같은 서버).
5. 세션 토큰은 판 API 토큰과 세션 ID에서 만들어지므로 판 API 토큰이 바뀌면(데이터 폴더를 지움) 모두 바뀐다. 백엔드가 뜰 때 열린 세션의 설정 파일을 다시 쓰지만, 돌고 있는 claude는 env를 다시 읽지 않는다.

#### 5. PLAN과 다르게 한 곳

1. **판의 API 토큰 대신 세션 토큰.** 지시는 "하위 세션 명령은 판의 API 토큰을 쓴다"였다. API 토큰을 쓰면 명령이 판 API 전체를 부를 수 있으므로, 세션마다 따로 만든 토큰으로 `/branch/*`만 부르게 했다. 지시의 뜻(이 명령으로는 자기 하위 세션만)을 더 좁게 지킨다. 통로도 WebSocket API가 아니라 hook과 같은 HTTP 서버의 `POST`다.
2. **부모 알림은 명령의 응답으로.** F2처럼 판이 부모에게 "[multitask 판] … 이 알림에는 '알겠다'고만 답해라"를 따로 보내면, 부모가 보고를 마친 뒤 하위 세션 수만큼 턴이 더 돈다. 명령의 응답에 같은 내용(herdr 이름, 패널, 역할, 일 시키기·답 읽기·끄기 명령)을 넣고, 응답이 부모에게 닿지 않았을 때(명령이 시간 제한으로 끊김 등)만 F2처럼 대기열로 보낸다. 연결 기록에는 `role` 이벤트로 알림 글을 남긴다. 응답이 끊기는 경우는 실제로 시험하지 않았다.
3. **하위 세션 노드는 작게(480×300), 부모와 열 사이 200.** H7 정리처럼 받는 쪽을 작게 했다. 사이 120으로 시작했다가 선 위의 역할·상태 글이 접혀(창은 틈이 172보다 좁으면 점만 보인다) 200으로 넓혔다. 그래서 시험 판의 w1·w2(120)와 mid·n4(200)의 열이 조금 어긋나 보인다.
4. **`mtask child-kill`은 그 아래 자손까지 깊은 것부터 끈다.** 하나만 끄면 그 아래가 부모 없이 남는다. `--only`로 하나만 끌 수 있고, 그렇게 남은 세션도 할아버지가 끌 수 있다(닫힌 중간 세션을 따라간다).
5. **신뢰를 받지 않은 저장소의 `--worktree`는 띄우기 전에 거부한다(`needs_trust`).** Claude Code가 그런 저장소에서 `-w`를 거부하고 바로 끝나, 판에는 "시작 중"으로 남는 빈 패널만 생겼다(3.4절). 판은 신뢰를 대신 누르지 않으므로 신뢰 예상(B3)으로 미리 거부하고 까닭을 돌려준다. 워크트리 없이 같은 저장소에 띄우면 지금처럼 신뢰 대화상자에서 멈추고 응답이 알린다.
6. **`mtask child`는 하위 세션이 준비될 때까지(최대 75초) 기다린다.** 바로 돌아오면 부모의 `herdr agent prompt`가 아직 뜨지 않은 claude에 가거나, `--prompt`를 준 경우 `herdr agent wait`가 바로 끝난다. `--prompt`를 주면 그 지시가 제출되어 일을 시작할 때까지 기다린다. `--no-wait`로 끌 수 있다(시험에서 haiku가 스스로 한 번 썼다). Bash 도구의 기본 시간 제한(2분) 안쪽이다.
7. **`herdr agent wait`도 승인 규칙에 넣었다.** 여럿에게 함께 시키거나 `--prompt`로 시킨 뒤 끝을 기다리는 데 필요하다. 읽기 전용인 `herdr agent get`·`list`는 넣지 않았다(목록과 상태는 `mtask children`).
8. **이름은 herdr 에이전트 이름 규칙(영문 소문자로 시작, 32자).** 빼면 `<부모>-w<n>`(부모 이름이 규칙에 안 맞으면 `w<n>`).
9. **그룹은 같은 워크스페이스일 때만 물려받는다.** 그룹은 한 워크스페이스 안이다(P5). 물려받으면 첫 지시(`--prompt`)는 그룹 전달이라 동시 실행 상한(기본 4)을 지킨다. 부모가 herdr로 직접 보내는 지시는 판 대기열을 거치지 않아 그룹 상한을 보지 않는다.
10. **다른 종류(`--kind codex`)에는 모델을 넘기지 않는다.** 그 하네스의 인자 모양을 판이 모른다(F5). hook이 없으므로 그 하위 세션은 다시 펼치지 못한다.
11. **상한 숫자는 설정이지만 스킬 글의 숫자는 백엔드가 뜰 때 쓴다.** 설정을 바꾸면 거부는 바로 새 값으로 하고, 스킬 글은 다음에 백엔드를 띄울 때 바뀐다.

#### 6. 확인하지 않은 것과 알려진 문제

1. **신뢰한 저장소에서 `claude -w`로 띄운 하위 세션**(워크트리가 생기는지, 노드의 워크트리·브랜치 표시, 이어 가기). 시험 저장소는 신뢰하지 않았다(8절 1번).
2. **워크트리 하위 세션의 이어 가기.** 이어 가기 명령(`resume_argv`)에는 `--worktree`가 없고 herdr는 패널의 원래 폴더(본 저장소)에서 `claude --resume <ID>`를 돌린다. Claude Code가 본 저장소에서 워크트리 대화를 찾는지 확인하지 않았다. 대화 기록이 없는 상태에서 새로 띄우는 되살리기(`relaunchIfEmpty`, `recoverSession`의 새로 띄우기)도 `--worktree` 없이 띄운다.
3. **`--kind codex` 하위 세션**은 실제로 띄우지 않았다(P4 결정: codex 턴은 따로 검증하지 않는다). 단위 시험으로 종류 검사만 했다.
4. **PowerShell 도구와 `mtask.cmd`.** 시험의 claude는 모두 Bash 도구를 썼다. `.cmd` 파일과 PowerShell 규칙은 실제로 돌려 보지 않았다.
5. **명령 응답이 끊겼을 때의 대기열 알림**(5절 2번)과 **동시에 여러 `mtask child`가 상한을 넘지 않는지**는 단위 시험 수준이다(만드는 중인 것을 센다).
6. **P8 전에 띄운 세션.** 백엔드가 설정 파일에 env를 더해도 돌고 있는 claude는 다음 이어 가기 전까지 명령을 쓰지 못한다(`판이 띄운 세션이 아니다`). 이번 판은 새로 만들었으므로 실제로 보지 않았다.
7. **닫힌 하위 세션을 사이드바에서 다시 열면**(P7) 부모 관계와 역할 선이 돌아오지 않는다. `recall.bring`이 부모를 비운다. 하위 세션 기록(`branch`)은 남아 깊이 표시는 남을 수 있다.
8. **haiku의 흐름.** 두 워커에게 한 번에 시키지 않고 차례로 시켰다(스킬은 함께 시키라고 한다). 한 번은 스스로 `--no-wait`를 붙였다. 둘 다 결과에는 문제가 없었다.
9. **화면.** 다른 워크스페이스로 간 하위 세션의 선은 영역을 가로질러 길다. 미션 맵에서 잎 하위 세션은 부모와 다른 열에 있어 들여 쓰기가 같은 열 안에서만 보인다. 사이드바는 워크스페이스별이라 다른 워크스페이스의 하위 세션은 그 워크스페이스 묶음의 뿌리 줄(들여 쓰기 없음, "워커 · 3단계" 표시)로 보인다. 초기 구현이다.
10. **P2~P7 창 시험**은 다시 돌리지 않았다. 백엔드 133개와 창 27개 단위 시험은 통과했고, P8 창 시험이 캔버스·연결선·승인 카드·사이드바·미션 맵·설정을 함께 썼다.
11. **시험이 남긴 것.** 시험 claude의 대화 기록이 `~/.claude/projects/C--Workspace-mtask-p8-*` 아래에 남았다(판은 읽기만 한다). 처음에 플러그인 `bin/`과 설정 `env`를 확인하려고 `C:\Workspace\mtask-p8-plain`에서 새로 띄운 `claude -p --model haiku` 한 번의 기록도 거기 있다. `backend/.dev/`(이 판의 데이터와 창 프로필)는 git이 무시하므로 남겼다. 시험 폴더의 claude가 `~/.claude.json`에 프로젝트 항목을 남겼을 수 있다.

#### 7. 사용자가 손으로 해 볼 것

1. **워크트리:** 이미 신뢰한 저장소에서 띄운 판 세션에게 "feat-x라는 워크트리로 워커를 띄워 README에 한 줄을 더하게 해"라고 보낸다. `.claude/worktrees/feat-x`가 생기는지, 하위 세션 노드에 워크트리와 브랜치가 보이는지, 본 저장소 워크스페이스 영역에 놓이는지, herdr를 다시 띄운 뒤(`mtask herdr restart --yes`) 그 하위 세션이 같은 대화로 이어 가는지 본다.
2. **실제 일로 나무 보기:** 실제 판에서 세션 하나에게 "워커 셋을 만들어 각각 A, B, C를 조사시키고 정리해 와"처럼 시킨다. 나무 모양(부모 오른쪽, 작은 노드), 선 위 글, 사이드바·미션 맵의 들여 쓰기가 읽기 좋은지 본다.
3. **상한 숫자(4, 3, 16)**가 실제 일에 맞는지. 설정(⚙)에서 바꿔 본다.
4. **끝난 하위 세션을 둘지:** 지금은 두고 사람이 끄라고 할 때만 끈다. 판이 너무 차는지 본다.
5. **승인 규칙의 범위**(4절 2번): `herdr agent prompt`를 묻지 않는 것이 사람이 띄운 다른 세션에게도 적용되는 것을 받아들일지.
6. **PowerShell 도구를 쓰는 세션**에서 `mtask child`가 되는지.

#### 8. 정리

- 시험 세션(lead, w1, w2, n4, far)을 `mtask kill`로 껐다. mid와 deep-worker는 lead가 `mtask child-kill mid`로 껐다. wt와 repo-child는 시험 중에 껐다(신뢰는 수락하지 않음, repo-child는 `trust_declined`).
- 창은 시험마다 닫혔다(창 main PID 31100, 10988, 17052 모두 없음). 트레이 상주는 끈 채로 시험했다.
- 백엔드(마지막 PID 27324)를 `mtask backend stop`으로, 이 판의 herdr 서버를 `experiments/p8/tools/herdr-ctl.mjs stop`으로 멈추고 `herdr session delete multitask-dev-p8`로 지웠다. 직접 띄운 백엔드·herdr·창 PID가 모두 없다.
- `C:\Workspace\mtask-p8-plain`, `mtask-p8-plain2`, `mtask-p8-repo`를 지웠다. 워크트리는 만들어지지 않았다(`git worktree list`로 확인).
- 사용자의 `multitask-dev`(돌고 있음)와 실제 판, 기본 herdr 세션은 건드리지 않았다.

#### 9. PLAN·BRIEF·CLAUDE.md에서 바꿀 것

- PLAN 4절 K: "만들며 정한 것(P8)"을 더한다: 명령은 플러그인 `bin/mtask`와 세션 토큰·`POST /branch/*`(판 API 토큰을 쓰지 않음), 부모 알림은 명령의 응답(끊겼을 때만 대기열), 하위 세션 노드는 작게·열 사이 200, `child-kill`은 자손까지, 신뢰 안 된 저장소의 `--worktree`는 `needs_trust`, `mtask child`는 준비까지 기다림, `herdr agent wait`도 승인 규칙에, 이름 규칙, 그룹은 같은 워크스페이스만, 상한은 설정(`branchMax*`). 단계를 "P8(끝남)"으로.
- PLAN 5절 모듈 표: "가지 펼치기"를 `backend/src/branch.mjs`, `store-branch.mjs`, `bin/mtask-child.mjs`(창 `Branch.jsx`, `lib/branch.js`)로 적고 P8(끝남).
- PLAN 6절: P8 API는 `docs/P8.md` 1.2절을 기준으로 한다고 한 줄.
- PLAN 7절 P8: 결과 문단(다섯 가지를 실제 haiku 세션으로 확인, 워크트리는 Claude Code가 신뢰 안 된 저장소에서 거부해 점검표로, 단위 시험 133·27).
- PLAN 8절: "에이전트가 띄운 에이전트에 판의 설정을 물려줄지"는 판의 명령으로 띄운 하위 세션에 대해 닫는다(물려준다). 새로 열 것: `herdr agent prompt`를 하위 세션으로만 좁힐지(4절 2번), 워크트리 하위 세션의 이어 가기, 닫힌 하위 세션을 다시 열 때 부모 관계를 되살릴지.
- PLAN 4절 F3 끝의 "에이전트가 띄운 에이전트는 판의 설정을 받지 않는다"에 "판의 명령(`mtask child`)으로 띄운 것은 받는다(K)"를 덧붙인다.
- BRIEF 3절 "가지 펼치기" 줄: 명령이 판을 찾는 방법(플러그인 `bin/`, 설정 파일 env, 세션 토큰)과 보안 한계(같은 사용자라 격리가 아님, herdr 일 시키기는 판의 모든 에이전트에 묻지 않음)를 덧붙인다. 머리말과 5절에 P8을 끝난 단계로, 8절 참고 문서에 `docs/P8.md`.
- CLAUDE.md: 첫 문단에 P8(v0.7: 가지 펼치기)을 더하고 "시작할 때"의 문서 목록에 `docs/P8.md`. 시험 규칙에 "가지 펼치기 시험은 상한을 넘게 불어나지 않는지 보고, 끝나면 하위 세션을 모두 끈다. 하위 세션 명령이 시험 판으로 가는지 세션 설정 파일의 env로 확인한다"를 더할 만하다.

### 지휘 세션의 합치기 기록(옛 `docs/PLAN.md` 7절)

끝났다(2026-10-31, `docs/P8.md`). 아래 다섯 가지를 실제 haiku 세션으로 확인했다. 지시 한 번에 워커 둘을 승인 없이 만들고 시키고 모아 보고했고(22초), 3단계 나무, 상한 셋과 `not_parent` 거부, 다시 켠 뒤 나무 유지가 됐다. 워크트리 하위 세션은 시험 저장소를 신뢰하지 않아 Claude Code가 거부했고, 신뢰한 저장소에서의 확인은 사람이 한다. 합친 `main`에서 백엔드 단위 시험 133개, 창 27개가 통과한다.
