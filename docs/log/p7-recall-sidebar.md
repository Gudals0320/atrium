상태: 닫힘
날짜: 2026-10-31

## 지시

### P7 작업 지시: 세션 되찾기와 사이드바(옛 `docs/briefs/P7.md`)

2026-10-31에 작업자 CLI 세션에 맡기려고 쓴 지시다. 사용자는 P6을 써 보고 백엔드가 대체로 잘 돈다고 했고, 두 가지를 요청했다.

1. 앱을 꺼도 다음에 켰을 때 기존 세션을 다시 찾아와야 한다. "기존 세션"은 판에 있던 세션과, **열린 워크스페이스의 판 밖 Claude Code 대화 전부**다(사용자 답). 단, **데스크톱 앱이나 다른 터미널에 묶여 있는 대화는 가져오지 않고 어디에 묶여 있는지 표시만 한다.** 갈라 열기(`--fork-session`)로 대화가 저절로 불어나는 것은 원하지 않는다(사용자).
2. 평소에는 닫혀 있는 사이드바가 열린 리포와 그 안의 세션을 보여야 한다(사용자가 데스크톱 앱 사이드바처럼 리포마다 접히는 묶음과 그 아래 세션 목록을 예로 보였다).

정한 내용은 `docs/BRIEF.md` 3절 "범위 밖", "세션 되찾기", "사이드바" 줄과 `docs/PLAN.md` 4절 J, 7절 P7에 있다.

#### 먼저 읽을 것

- `CLAUDE.md`, `docs/BRIEF.md`, `docs/PLAN.md`(4절 C3·G1·H·I8, **4절 J**, 7절 P7, 8절)
- `docs/P6a.md`(단일 캔버스 구조), `docs/P6b.md`(API 문서, I8 복구), `docs/P6c.md`, 필요하면 `docs/P3.md`(C3 복구), `docs/P5.md`(워크스페이스 키)
- `docs/research/data-sources.md`(대화 기록 위치와 형식)
- `backend/`와 `app/` 코드

#### 할 일

PLAN 4절 J(J1~J5)를 백엔드와 창 모두 만든다.

- **J1 다시 켜도 판이 그대로:** 지금 되는 것과 안 되는 것을 실제로 확인한 뒤 빈 곳을 메운다. 판이 띄운 셸, 판에 올린 에이전트, 다른 종류가 다시 켠 뒤 어떻게 되는지 보고, 되살릴 수 있으면 같은 노드로 되살리고 못 하면 지우지 말고 "닫힘"으로 남긴다.
- **J2 닫힌 세션 다시 열기:** 판에서 빠진 세션을 판 기록에서 "닫힘"으로 보이고, "판으로 열기"로 claude는 같은 세션 ID로 이어 가고(새 설정 파일과 hook 토큰, 판의 실행 인자), 셸은 같은 폴더에 다시 띄운다. 목록에서 빼기도 둔다.
- **J3 판 밖 Claude Code 대화:** 열린 워크스페이스마다 `~/.claude/projects`의 대화 기록에서 그 리포의 대화를 찾는다. 리포에 속하는지는 대화 기록의 `cwd`를 워크스페이스 키 규칙으로 풀어 맞춘다. 머리와 꼬리만 읽고 캐시한다. 대화 기록 폴더는 환경 변수(예: `MTASK_CLAUDE_PROJECTS`)로 바꿀 수 있게 한다.
- **J4 묶여 있지 않은 대화만 이어 간다:** 판 밖 대화마다 다른 곳에 묶여 있는지 정한다. 데스크톱 앱의 대화(지금 돌지 않아도)와 지금 다른 터미널의 `claude`가 연 대화는 묶여 있다. 묶여 있지 않은 대화만 "판으로 열기"로 같은 대화 ID로 이어 간다(`--resume <ID>`). 묶인 대화는 "데스크톱 앱", "터미널 · pid n" 같은 표시만 하고 열지 않는다. **`--fork-session`은 쓰지 않는다. 판은 대화 ID를 새로 만들지 않는다.** 이미 판 세션인 대화는 그 노드로 갈 뿐 새로 띄우지 않는다. 묶여 있는지 알아내는 후보(대화 기록 안의 출처 표시, 데스크톱 앱의 세션 목록 읽기, `claude` 프로세스 명령줄, Claude Code가 남기는 세션 파일, 대화 기록 수정 시각)를 실제로 비교해 고르고 이유를 적는다. 확실하지 않으면 묶여 있다고 보고 열지 않는다. 데스크톱 앱 쪽 파일은 읽기만 한다.
- **J5 사이드바:** 왼쪽, 평소에 닫힘, 위쪽 줄 왼쪽 단추와 단축키, 리포 묶음(접힘), 판 세션·닫힌 세션·판 밖 대화, 거르기, 누르면 노드·영역으로 가거나 판으로 연다. 창이 상태를 기억한다.

새 기능은 새 파일(모듈, 컴포넌트)에 두고 공용 파일에는 연결하는 줄만 더한다. 저장소 스키마를 바꾸면 이전 `board.db`를 옮기는 코드를 함께 둔다.

#### 완료 기준

PLAN 7절 P7의 다섯 가지다. 개발용 판에서 실제 세션으로 확인한다. 시험할 수 없는 항목(실제 재부팅 등)은 이유와 사람이 확인할 점검표를 남긴다. 화면은 초기 구현이면 된다.

#### 대화 기록과 개인 정보(꼭 지킨다)

이 기능은 사용자의 실제 대화 기록을 읽는다. `~/.claude/projects`에는 사용자의 터미널 대화와 데스크톱 앱 대화(지금 진행 중인 것 포함)가 함께 있다.

- **실제 대화는 이어 가지도, 갈라 열지도 않는다.** 판으로 열기 시험은 이번 시험을 위해 새로 만든 대화로만 한다. 데스크톱 앱 대화와 기존 대화에는 `--resume`, `--continue`, `--fork-session`을 쓰지 않는다(`CLAUDE.md`).
- **시험 판에는 사용자의 실제 대화가 있는 워크스페이스를 열지 않는다.** multitask 저장소(이 워크트리의 `backend/.dev/proj`도 multitask 저장소의 워크스페이스가 된다)와 사용자의 다른 프로젝트 폴더는 열지 않는다. 시험 워크스페이스는 새로 만든 폴더만 쓴다. 그래야 사이드바, 스크린숏, 로그에 실제 대화 제목이나 내용이 나오지 않는다.
- 대화 기록 찾기를 시험하는 동안 실제 `~/.claude/projects` 전체를 훑어 수와 속도를 재는 것은 괜찮다. 그때도 제목, 지시, 답 같은 내용은 로그와 보고에 남기지 않는다(수, 시간, 파일 크기만).
- 단위 시험은 `MTASK_CLAUDE_PROJECTS`로 가리킨 고정 자료(직접 만든 가짜 대화 기록)를 쓴다.

#### 워크트리와 합치기

- 너는 Claude Code가 만든 워크트리(`.claude/worktrees/p7`)에서 너만의 브랜치로 일한다. 그 브랜치에 커밋한다. 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`를 붙인다. `main`을 바꾸거나, 합치거나, 푸시하지 않는다. 다른 워크트리는 건드리지 않는다.
- `node_modules`는 워크트리 안에서 `npm install`로 받는다. 본 저장소의 `node_modules`에 정션을 걸지 않는다.

#### 시험 환경

- **너만의 개발용 판을 쓴다.** `--dev`에 환경 변수를 더해 백엔드, `mtask`, 창 모두 같은 값을 쓴다(`experiments/p6c/tools/mt.cjs`처럼 감싸개로).
  - `MTASK_HERDR_SESSION=multitask-dev-p7`
  - `MTASK_PORT=47817`
  - `MTASK_DATA_DIR=<워크트리>/backend/.dev/data`
  - `MTASK_APP_USERDATA=<워크트리>/backend/.dev/app`
- 다른 판은 건드리지 않는다: `multitask-dev`(사용자 세션 `s1`이 있다), `multitask`(실제 판). 포트 47800, 47811~47816도 쓰지 않는다.
- 시험 폴더
  - git이 아닌 워크스페이스: `C:\Workspace\mtask-p7-plain`, `C:\Workspace\mtask-p7-plain2`. `C:\Workspace`의 신뢰가 물려와 claude를 띄울 수 있다.
  - 리포와 워크트리: `C:\Workspace\mtask-p7-repo`에 `git init`과 커밋 하나, 워크트리 `C:\Workspace\mtask-p7-repo-wt`. 이런 폴더는 git 최상위라 Claude Code가 신뢰 대화상자를 띄운다. **신뢰 대화상자는 수락하지 않는다.** 이 리포의 대화 묶기(워크트리 포함)는 고정 자료 대화 기록으로 단위 시험하고, 실제 세션은 셸로 시험한다.
- **판 밖 대화 만들기:** 판 밖에서 연 대화는 이름 있는 별도 herdr 세션(예: `multitask-dev-p7-outside`, 깨끗한 환경)이나 직접 띄운 프로세스에서 `claude --model haiku`를 시험 폴더에 띄워 "Reply with exactly: …" 한두 턴으로 만든다. "터미널에 묶임"은 그 claude를 열어 둔 채로 확인하고(열 수 없어야 한다), 그 claude를 끈 뒤 열 수 있게 되는지 본다. 데스크톱 앱 대화의 판정은 시험 판에 띄우지 않고 판정 함수만 실제 데이터에 돌려 수(데스크톱 묶임 n개)만 남긴다. 시험이 끝나면 시험 폴더의 대화 수와 `~/.claude/projects`에서 그 폴더들에 생긴 대화 ID를 세어, 갈라 열기로 생긴 대화가 없는지 보고에 적는다.
- 시험용 Claude Code 세션은 `--model haiku`, 턴은 아주 짧게 한다.
- J1의 끄고 다시 켜기는 너의 판(`multitask-dev-p7`)의 창, 백엔드, herdr만 끄고 켠다. herdr와 백엔드 강제 종료는 직접 띄운 프로세스만 PID로 한다.
- 창은 Playwright의 Electron 지원이나 CDP로 조작하고 스크린숏을 찍는다. 스크린숏과 로그는 `experiments/p7/`에 둔다.
- 기존 단위 시험은 계속 통과해야 하고, 새 코드(대화 기록 읽기와 캐시, 리포 맞추기, 묶여 있는지 판정, 닫힌 세션 다시 열기, 되살리기)에는 단위 시험을 더한다.

#### 규칙

- `CLAUDE.md`를 따른다. 실제 판의 값으로는 띄우지 않는다.
- 신뢰 대화상자는 수락하지 않는다. 시험 에이전트의 herdr 명령에 `--session`, `--machine`, `--remote`를 쓰게 하지 않는다. herdr 소켓 API의 `pane.split`은 `target_pane_id`로 대상을 준다.
- 데스크톱 앱 세션과 기존 세션은 건드리지 않는다. 직접 띄운 프로세스만 PID로 끈다. `~/.claude/settings.json`, `~/.agents/skills`, `~/.codex`, `~/.claude/projects` 안의 파일은 고치지 않는다(읽기만).
- symvibe는 화면 구성과 동작만 참고한다. OpenCove 파일을 가져오면 `CLAUDE.md`의 MIT 고지 규칙을 지킨다.
- `docs/PLAN.md`, `docs/BRIEF.md`, `CLAUDE.md`는 고치지 않는다.

#### 끝낼 때

1. `docs/P7.md`를 한국어로 쓴다: 만든 것과 바꾼 것(백엔드, API, 창, 스키마와 옮기기), 돌리는 법과 화면 쓰는 법, 완료 기준마다의 증거(스크린숏 경로), J1에서 확인한 지금 동작과 메운 곳, 묶여 있는지 알아내는 방법을 고른 이유와 실제 데이터에서의 판정 수(내용 없이), PLAN과 다르게 한 곳과 이유, 확인하지 않은 것과 알려진 문제, 사용자가 손으로 해 볼 것(실제 재부팅, 실제 대화로 사이드바 보기 포함), PLAN·BRIEF·CLAUDE.md에서 바꿀 것.
2. 정리한다: 시험 세션 끄기, 판 밖 시험 claude 끄기, 창 먼저 닫기, 너의 백엔드와 herdr 서버(`multitask-dev-p7`, 판 밖용 herdr 세션도) 멈추기, 그 herdr 세션들 지우기, `C:\Workspace\mtask-p7-*` 폴더와 그 워크트리 지우기.
3. 보고와 코드, 시험, 증거를 모두 네 브랜치에 커밋한다. 작업 트리가 깨끗해야 한다.
4. **맨 마지막에** `<워크트리>/backend/.dev/p7.done` 파일을 만든다. 내용은 브랜치 이름과 마지막 커밋 해시 두 줄이다. 모든 일이 끝난 뒤에만 만든다.

### 지휘 세션이 정한 범위와 완료 기준(옛 `docs/PLAN.md` 7절)

2026-10-31에 정했다. 4절 J를 만든다. 작업자 하나가 Claude Code 워크트리(`claude -w p7`)에서 백엔드와 창을 함께 만들고 지휘 세션이 `main`에 합친다. 지시는 `docs/briefs/P7.md`, 개발용 판은 `multitask-dev-p7`(포트 47817)이다.

완료 기준:

1. J1: 창·백엔드·herdr를 모두 끈 뒤 다시 켜면(그리고 herdr와 백엔드를 강제 종료한 뒤 다시 켜면) 판의 claude 세션, 셸, 판에 올린 에이전트가 같은 자리·덩어리·그룹·연결로 돌아온다. 돌아오지 못한 세션은 "닫힘"으로 남는다.
2. J2: 판에서 끈 세션과 사라진 세션이 사이드바에 "닫힘"으로 남고, "판으로 열기"로 claude는 같은 대화를 이어 가며, 셸은 같은 폴더에 다시 뜬다.
3. J3: 열린 워크스페이스마다 판 밖에서 연 지난 Claude Code 대화(시험용으로 새로 만든 것)가 사이드바에 보인다. 워크트리에서 연 대화도 본 저장소 묶음에 든다. 대화가 많아도 창이 느려지지 않는다.
4. J4: 묶여 있지 않은 판 밖 대화를 판으로 열면 같은 대화 ID로 이어 가는 판 세션이 된다. 다른 터미널에서 열려 있는 대화는 "터미널"로 표시되고 열 수 없으며, 그 claude가 끝나면 열 수 있다. 데스크톱 앱 대화는 "데스크톱 앱"으로 표시되고 열 수 없다. 시험 내내 새 대화 ID(갈라 열기)가 생기지 않는다. 알아내는 방법을 고르고 이유를 적는다.
5. J5: 사이드바가 평소에 닫혀 있고, 열면 리포 묶음과 그 안의 판 세션·닫힌 세션·판 밖 대화가 보이며, 누르면 그 노드·영역으로 가거나 판으로 연다. 창을 다시 열어도 사이드바 상태가 남는다.

## 작업 기록

문서 규약(`docs/README.md`)을 도입하기 전(2026-10-31)의 작업이라 작업 기록을 따로 남기지 않았다. 작업하며 알아낸 것과 계획과 다르게 한 곳은 보고 절에 있다.

## 보고

### P7(v0.6): 세션 되찾기와 사이드바(옛 `docs/P7.md`)

2026-10-31에 만들고 시험했다. 작업 지시는 `docs/briefs/P7.md`이고, 범위는 PLAN 4절 J(J1~J5)의 백엔드와 창이다. 개발용 판 `multitask-dev-p7`(포트 47817, 이 워크트리의 `backend/.dev/`)에서 실제 세션으로 확인했다. 판 밖 대화는 별도 herdr 세션 `multitask-dev-p7-outside`에서 `claude --model haiku`로 만들었다.

#### 1. 만든 것과 바꾼 것

##### 1.1 백엔드(`backend/`)

| 파일 | 하는 일 |
|---|---|
| `src/convos.mjs`(새) | 대화 기록 읽기와 묶임 판정. 대화 기록 머리 128KB와 꼬리(답이 나올 때까지 128KB씩, 최대 1MB)만 읽어 제목·첫 지시·마지막 지시·마지막 답·cwd·브랜치·출처(entrypoint)를 뽑는다. 세션 파일(`~/.claude/sessions/<pid>.json`), 데스크톱 앱 세션 목록, `claude` 명령줄을 읽고 `bindingOf`로 판정한다. 대화가 워크스페이스에 드는지(`inWorkspace`)도 여기 있다 |
| `src/recall.mjs`(새) | J1 되살리기(`restorable`, `restoreGone`, `recoverHookless`, `closeUnresumed`), J2 닫힌 세션 다시 열기(`reopen`, `dismiss`), J3 색인(`scan`, 바뀐 파일만), J4 판 밖 대화 열기(`openConvo`), 목록(`list`)과 알림(`recall.updated`) |
| `src/store-recall.mjs`(새) | 저장소의 P7 표와 열: `convo_index`(대화 기록 색인), `sessions`의 `close_reason`, `dismissed_at`, `reopened_as`. 닫힌 세션 목록, 판이 아는 대화 ID, 다시 열기 |
| `src/backend.mjs` | 연결하는 줄만: `attachRecall`, `closeSession`이 닫힌 까닭을 남김, 새 워크스페이스를 `bus`로 알림, `resync`에 `afterRestart`(herdr가 다시 떴는가)와 되살릴 목록 두 개, herdr를 다시 띄운 뒤 30초 안에 끝난 판 claude를 "이어 가기 실패"로 보는 한 줄(J1, 4절) |
| `src/store.mjs` | 연결하는 줄만: P7 표·열 만들기, `updateSession`이 새 열을 받음 |
| `src/config.mjs` | `convoRoots`(`MTASK_CLAUDE_PROJECTS`, `;`로 여럿), `claudeSessionsDir`(`MTASK_CLAUDE_SESSIONS`), `desktopSessionsDir`(`MTASK_CLAUDE_DESKTOP`, `none`이면 보지 않음), `convoScanMs`(`MTASK_CONVO_SCAN_MS`, 기본 15초) |
| `bin/mtask.mjs` | `closed`, `reopen`, `dismiss`, `convos`, `open-convo` |
| `test/p7.test.mjs`(새) | 단위 시험 18개(3.6절) |

대화 기록 폴더 바꾸기(`MTASK_CLAUDE_PROJECTS`)는 판 밖 대화 목록에만 쓴다. 판이 띄운 claude의 대화 기록 경로(`claudeProjects`)는 그대로다. Claude Code는 늘 `~/.claude/projects`에 쓰므로, 그것까지 바꾸면 판의 이어 가기 판정이 깨진다.

##### 1.2 API

모두 `mtask call <메서드> <JSON>`으로도 부른다.

| 메서드 | 받는 것 → 주는 것 |
|---|---|
| `recall.list { workspace? }` | `{ scannedAt, scan, workspaces: [{ key, name, closed: [닫힌 세션], convos: [판 밖 대화] }] }`. 열린 워크스페이스마다, 마지막 활동 순으로 칸마다 300개까지 |
| `recall.closed { workspace? }` | 닫힌 세션 `[{ sessionId, name, kind, origin, cwd, workspaceKey, closedAt, reason, reasonLabel, lastPrompt, lastAnswer, convId, binding, canReopen }]` |
| `recall.reopen { session, model?, permissionMode?, effort? }` | 닫힌 세션(ID나 이름)을 판으로 다시 연다 → `{ sessionId, name, kind, paneId, workspaceKey, resume, trust, place: last \| slot, argv }`. 묶여 있으면 오류 `bound`(`binding` 포함) |
| `recall.dismiss { session }` | 사이드바 목록에서만 뺀다(판 기록과 대화 기록 파일은 그대로) |
| `convo.list { workspace?, refresh? }` | 판 밖 대화 `[{ convId, cwd, folder, branch, worktree, title, titleSource, firstPrompt, lastPrompt, lastAnswer, lastAt, prompts, entrypoints, binding, canOpen, workspaceKey }]` |
| `convo.open { convo, model?, permissionMode?, effort?, name? }` | 묶여 있지 않은 대화를 그 대화 ID의 판 세션으로 → `bring`과 같은 결과. 이미 판 세션이면 `{ existing: true, sessionId, name }`, 닫힌 판 세션이면 다시 열기. 묶여 있으면 오류 `bound` |
| `convo.binding { convo }` | 그 자리에서 다시 읽은 묶임 판정(세션 파일, 명령줄, 데스크톱 목록) |
| `convo.scan` | 바로 다시 훑기 → `{ at, ms, files, read, failed, dropped, roots }` |
| 이벤트 `recall.updated { workspaces, scannedAt }` | 닫힌 세션이나 판 밖 대화가 바뀐 워크스페이스. 창은 사이드바가 열려 있을 때만 다시 읽는다 |

`binding`은 `{ bound: false }` 또는 `{ bound: true, where: desktop | terminal | unknown, sure, label, pid?, open?, archived? }`다. `label`은 "데스크톱 앱", "데스크톱 앱 · 보관됨", "데스크톱 앱 · 열려 있음", "터미널 · pid n", "묶여 있을 수 있음 · sdk-cli", "묶여 있을 수 있음 · 출처 모름", "묶여 있을 수 있음 · 방금 기록됨"이다.

닫힌 까닭(`reason`): `killed`(판에서 끔), `pane gone`(패널이 없어짐), `pane exited`(셸에서 나감), `pane closed outside board`, `workspace closed outside board`, `not resumed after herdr restart`(herdr를 다시 띄운 뒤 이어 가지 못함).

##### 1.3 창(`app/`)

| 파일 | 하는 일 |
|---|---|
| `src/renderer/Sidebar.jsx`(새) | 사이드바와 위쪽 단추(`SidebarToggle`). 자기 상태(연 상태, 접힘, 거르기 글)를 창 프로필의 `localStorage`(`mt.sidebar`)에 둔다 |
| `src/renderer/lib/sidebar.js`(새) | 줄 고르기(마지막 활동 순, 거르기 낱말이 모두 들어 있는 것) |
| `src/renderer/sidebar.css`(새) | 사이드바와 `mt-body`(사이드바와 캔버스를 한 줄에) |
| `src/renderer/main.jsx`, `InboxBar.jsx` | 연결하는 줄만: 캔버스를 `mt-body`로 감싸고 그 왼쪽에 사이드바, 위쪽 줄 맨 왼쪽에 ☰ 단추 |
| `test/p7-lib.test.mjs`(새) | 단위 시험 2개 |
| `test/e2e/p7-lib.mjs`, `p7-j1.mjs`, `p7-j2.mjs`, `p7-j4.mjs`, `p7-j5.mjs`(새) | 창 시험(이 판의 값을 강제, `MT_E2E_OUT=p7`가 아니면 멈춤) |

##### 1.4 저장소 스키마와 옮기기

- 새 표 `convo_index`(경로, 대화 ID, 크기, 수정 시각, cwd, 브랜치, 출처, 제목, 지시·답 앞부분, 시각, 지시 수, 글을 담았는지). 글(제목·지시·답)은 열린 워크스페이스의 대화만 담는다. 다른 대화는 cwd·출처·크기만 담는다. 워크스페이스를 새로 열면 그 대화의 글을 다시 읽어 채운다.
- `sessions`에 `close_reason`, `dismissed_at`, `reopened_as` 열을 더한다.
- 옮기기: P6까지의 `board.db`를 열면 `CREATE TABLE IF NOT EXISTS`와 `ALTER TABLE ADD COLUMN`(P3부터 쓰던 방법)으로 표와 열이 생긴다. 옮길 자료는 없다. 그 전에 닫힌 세션의 닫힌 까닭은 판 이벤트 `closed`에서 읽는다. P6 모양의 `board.db`로 확인했다(`p7.test.mjs` 마지막 시험).
- 대화 기록 요약 방법이 바뀌면 `convos.mjs`의 `CONVO_PARSER`를 올린다. 백엔드가 뜰 때 다르면 색인을 비우고 다시 읽는다(meta `convoParser`).

#### 2. 돌리는 법과 화면 쓰는 법

##### 2.1 돌리는 법

```sh
cd backend && npm test           # 116개(P6까지 98 + P7 18)
cd app && npm test               # 24개(22 + P7 2)
cd app && npm start              # 개발용 프로필(기본 개발용 판)
```

이 판을 다시 만들어 창 시험을 돌리려면(시험 폴더와 세션은 끝나고 지웠다):

1. 시험 폴더: `C:\Workspace\mtask-p7-plain`, `mtask-p7-plain2`, `mtask-p7-repo`(`git init`과 커밋 하나), 워크트리 `mtask-p7-repo-wt`(브랜치 `wt1`).
2. `node experiments/p7/tools/make-fixture.mjs`(고정 자료 403개: 데스크톱 출처 하나, 워크트리 cwd 둘, 많은 대화 400개), `node experiments/p7/tools/mt.cjs --fixture backend start`.
3. 판 세션: plain에 claude `s1`(첫 지시 하나), plain2에 claude `s2`, repo에 셸 `sh1`·`sh3`, plain에 셸 `sh2`, `s1`·`s2` 패널을 나눠 `herdr agent start`로 띄운 claude `helper`·`helper2`(판에 올린 claude, `mt.cjs h pane.split`·`h agent.start`), plain2에 codex `cx1`. `s1 → s2` 역할 연결, `s2`·`cx1` 그룹.
4. 판 밖 대화: `node experiments/p7/tools/outside.mjs start`, `new C:/Workspace/mtask-p7-plain2 o2`, `prompt o2 "Reply with exactly: outside-two"`.
5. `cd app && npm run build`, 그다음 `MT_E2E_OUT=p7 node test/e2e/p7-j5.mjs`, `p7-j2.mjs s2 sh1 cx1`, `p7-j4.mjs o2 <o2의 대화 ID>`, `p7-j1.mjs graceful|kill|lost|gone`.

도구(`experiments/p7/tools/`): `mt.cjs`(이 판의 mtask, `h`면 herdr 소켓 API, `--fixture`면 고정 자료를 더 읽는 백엔드), `outside.mjs`(판 밖 herdr 세션의 claude), `herdr-ctl.mjs`(백엔드 없이 이 판의 herdr 끄기·켜기·PID), `snap.mjs`(판 상태 요약), `count-convos.mjs`(시험 폴더의 대화 ID), `scan-real.mjs`(실제 대화 기록의 수·속도·판정 수만), `make-fixture.mjs`.

##### 2.2 화면 쓰는 법

| 동작 | 방법 |
|---|---|
| 사이드바 열고 닫기 | 위쪽 줄 맨 왼쪽 ☰, 또는 `Ctrl+Shift+E`(터미널에 초점이 있어도). 거르기 칸에서 Esc는 글을 지우고, 비었으면 닫는다 |
| 리포 묶음 | 이름 왼쪽 ▸/▾로 접고 편다. 이름을 누르면 그 영역으로 간다. 오른쪽에 세션·작업 중·내 차례·닫힘·대화 수 |
| 판 세션 | 상태 필, 이름, 종류, 마지막 활동, 내 차례면 묻는 것 한 줄(아니면 마지막 지시). 누르면 그 노드로 들어간다(터미널에 초점) |
| 닫힌 세션 | "닫힘", 닫힌 까닭, 마지막 지시. "판으로 열기"(claude는 같은 대화로 이어 감, 셸은 같은 폴더), "빼기"(목록에서만) |
| 판 밖 대화 | 제목(Claude Code가 남긴 이름·AI 제목, 없으면 첫 지시), 폴더·⎇ 브랜치, 마지막 지시. 묶여 있지 않으면 "판으로 열기", 묶여 있으면 흐리게 묶인 곳만("데스크톱 앱", "터미널 · pid n", "묶여 있을 수 있음 · …") |
| 많을 때 | 칸마다 5개, "더 보기"마다 5개 더. 거르기 중에는 칸마다 50개 |
| 거르기 | 이름, 제목, 지시·답, 묻는 것, 닫힌 까닭, 브랜치. 빈칸으로 나눈 낱말이 모두 들어 있어야 한다 |
| 다시 읽기 | ↻(대화 기록을 바로 다시 훑는다). 평소에는 15초마다, 묶임은 5초마다 |

#### 3. 완료 기준별 증거

스크린숏과 기록은 `experiments/p7/`에 있다.

##### 3.1 J1 다시 켜도 판이 그대로(완료 기준 1)

`p7-j1.mjs`가 창을 닫고 끈 뒤 창을 다시 열어(창이 백엔드를, 백엔드가 herdr를 띄움) 끄기 전과 비교한다(`p7-j1-<단계>.json`의 `cmp`).

| 단계(기록) | 끄기 전 | 결과 |
|---|---|---|
| graceful: `mtask herdr stop` + `backend stop`(`p7-j1-graceful.json`, `j1-graceful-*.png`) | 세션 9개(판 claude 3, 판에 올린 claude 2, 셸 3, codex 1), 덩어리 `s2+helper2`, 그룹 `grp`(`s2`, `cx1`), 연결 `s2>helper2`(띄움) | 8개가 같은 자리·덩어리·연결로 ready·쉼. codex `cx1`은 herdr가 이어 가지 않아 "닫힘(herdr를 다시 띄운 뒤 이어 가지 못함)"으로 사이드바에 남았고, 그래서 그룹이 `s2`만 남았다 |
| kill 1회차(`p7-j1-kill-run1.json`) | 세션 8개, 같은 덩어리·그룹·연결 | 덩어리·그룹·연결·자리는 같았지만 한 턴도 돌지 않은 `s2`가 `exited(other)`로 남았다(4절의 경합) |
| kill 2회차, 고친 뒤(`p7-j1-kill-run2.json`) | 세션 9개(막 띄운 `s5` 포함). J2 시험이 `s2`를 닫았다 다시 열어 덩어리·연결은 없음 | 모두 같은 자리로 ready. `s5`는 같은 `--session-id`로 새로 떴다(`relaunched_fresh`) |
| lost 1회차(`p7-j1-lost-run1.json`, `j1-lost-run1-*.png`) | 세션 8개, 덩어리·연결 없음 | `sh2`는 같은 폴더의 새 셸(`shell_new_pane`), `helper2`는 그 대화 ID로 새 패널에서 이어 감(`resume_new_pane`). 같은 노드, 같은 자리 |
| lost 2회차(`p7-j1-lost.json`, `j1-lost-*.png`): 백엔드가 꺼진 동안 셸 `sh2`의 작업 공간과 판에 올린 claude `helper2`의 패널을 없애고 herdr를 끔(herdr가 저장 전에 죽어 패널을 잃은 것과 같다) | 판을 다시 만들었다: claude `s2`, 그 패널을 나눠 띄운 `helper2`(덩어리 `s2+helper2`, 연결 `s2>helper2` 띄움), 셸 `sh2`, 그룹 `grp2`(`s2`, `sh2`), 역할 연결 `s2>sh2:runner` | `sh2`는 새 셸, `helper2`는 그 대화로 새 패널에서 이어 감. 자리, 덩어리, 그룹, 두 연결이 모두 같다 |
| kill 3회차(`p7-j1-kill.json`, `j1-kill-*.png`): herdr와 백엔드를 PID로 강제 종료 | lost 2회차 뒤의 같은 판 | 자리, 덩어리, 그룹, 두 연결이 같고 셋 모두 ready·쉼 |
| gone: herdr는 그대로, 백엔드가 꺼진 동안 `sh3`의 작업 공간을 판 밖에서 닫음(`p7-j1-gone.json`) | 세션 8개 | `sh3`은 판에서 빠지고 사이드바에 "닫힘 · 패널이 없어짐"(`j1-gone-3-sidebar.png`). J2로 다시 열 수 있다 |

kill 1·2회차의 화면 기록은 `p7-j1-kill-run1-2.txt`, 스크린숏은 `j1-kill-run2-*.png`(2회차)다.

실제 PC 재부팅은 시험하지 않았다(8절 1번).

##### 3.2 J2 닫힌 세션 다시 열기(완료 기준 2)

`p7-j2.mjs s2 sh1 cx1`(`p7-j2.json`):

- 판에서 끈 `s2`(claude)와 `sh1`(셸), 앞서 닫힌 `cx1`이 그 워크스페이스 아래 "닫힌 세션"에 보인다(`j2-1-closed-in-sidebar.png`). 끈 직후 1~2초는 끝나는 중인 claude 프로세스 때문에 `s2`가 "터미널 · pid n"으로 보였다가 풀린다(그동안은 열 수 없다).
- "판으로 열기": `s2`는 같은 세션 ID로 다시 떴고(새 설정 파일과 hook 토큰, 판의 실행 인자), 한 턴 보내니 대화 기록이 `<세션 ID>.jsonl` 그대로였다(`j2-2-claude-reopened.png`). `sh1`은 같은 세션 ID, 같은 폴더(`C:\Workspace\mtask-p7-repo`), 새 패널(`j2-3-shell-reopened.png`).
- "빼기": `cx1`이 목록에서 빠졌다(`j2-4-dismissed.png`). 판 기록에는 남는다.
- API로는 판에서 끈 `s1`(대화 기록 있음)을 `recall.reopen`으로 다시 열어 `--resume <같은 ID>`로 이어 갔다.

첫 실행에서는 셸의 "판으로 열기"를 누른 것이 백엔드에 닿지 않아 60초 기다리다 멈췄다. 같은 단추를 따로 눌러 보니 열렸고, 다시 돌린 시험은 모두 통과했다. 첫 실행의 기록 파일은 두 번째 실행 전에 지워져 남지 않았다(7절 2번).

##### 3.3 J3 판 밖 대화(완료 기준 3)

- 판 밖 herdr 세션에서 만든 대화 `o1`(plain), `o2`(plain2)가 각 리포 묶음의 "판 밖 대화"에 제목(`Outside-one`, `Outside-two`, AI 제목), 마지막 지시·답과 함께 보였다(`j5-2-open-repos-sessions-closed-convos.png`).
- 워크트리: `mtask-p7-repo`는 git 최상위라 실제 claude는 신뢰 대화상자가 떠서 띄우지 않았다. 워크트리 cwd(`mtask-p7-repo-wt`)의 고정 자료 대화가 본 저장소 묶음 `mtask-p7-repo`에 "⎇ wt1"과 함께 들었다(`j5-7-reopened-window-keeps-sidebar.png`). 단위 시험도 같은 것을 본다.
- 판이 아는 대화(판 세션, 닫힌 세션, 판에 올린 claude의 대화)는 판 밖 목록에 나오지 않는다.
- 많아도 느리지 않은가: 고정 자료 400개(8개는 300KB 줄 포함)를 더한 판에서 사이드바 열기 54ms, "더 보기" 열 번 208ms, 거르기 글을 바꾸는 1.5초 동안 가장 긴 프레임 7ms(50ms 넘는 프레임 0개)(`p7-j5.json`). 판 밖 대화는 워크스페이스마다 300개까지만 창에 보낸다.
- 훑기 속도(`j4-real-verdict.json`, 내용 없이): 실제 `~/.claude/projects` 398개(4.8GB) 머리·꼬리 읽기 0.43초, 세션 파일 2ms, 데스크톱 목록 처음 204ms·다시 3ms, 명령줄 315ms. 개발용 판에서는 실제와 고정 자료 799개를 처음 훑는 데(폴더 60여 개를 git으로 푸는 것 포함) 1.8초, 그 뒤는 바뀐 파일만 읽는다. 단위 시험의 2,000개는 약 1.2초.

##### 3.4 J4 묶여 있지 않은 대화만 이어 감(완료 기준 4)

`p7-j4.mjs o2 cbcff974-…`(`p7-j4.json`):

- 판 밖 herdr 세션의 claude가 `o2`를 연 동안 사이드바는 "터미널 · pid 28172"(그 claude의 실제 pid와 같음)이고 "판으로 열기"가 없다. API로 열어도 `bound`로 거부(`j4-1-terminal-bound-cannot-open.png`).
- 데스크톱 앱 출처의 대화(고정 자료)는 "데스크톱 앱"이고 열 수 없다(같은 스크린숏의 plain 묶음).
- 그 claude를 `/exit`로 끄자 33초 뒤(방금 기록됨 30초) 열 수 있게 됐다(`j4-2-free-after-terminal-exit.png`).
- "판으로 열기": 세션 ID가 대화 ID와 같은 판 세션 `s4`가 `claude --resume <ID> … --settings …`로 떴다(`j4-3-opened-as-board-session.png`). 한 턴을 보내니 같은 대화 기록 파일에 이어졌다(`j4-4-continued-same-conversation.png`). 같은 대화를 다시 열면 `{ existing: true }`로 그 노드로 갈 뿐이다.
- API로도 `o1`을 같은 방법으로 열었다(판 세션 `s3`).
- 갈라 열기 없음: 시험 폴더의 대화 ID는 처음 5개(`convos-0-baseline.json`), J4 열기 뒤 5개(`convos-1-after-j4-open.json`)였다. 본 시험이 끝났을 때 6개였고, 더 생긴 하나(`07409345…`)는 처음부터 `--session-id`로 띄운 판 세션 `s2`가 다시 열린 뒤 첫 턴을 돌며 생긴 그 세션 자신의 대화 기록이다. J1 증거를 위해 판을 다시 만들며 새 세션 둘(새 `s2`는 `mtask spawn`, 새 `helper2`는 `herdr agent start`)을 일부러 띄워 마지막에는 8개다(`convos-2-final.json`). 8개 모두 판 세션이나 판 밖에서 새로 띄운 대화의 ID이고, 이어 가기·되살리기·다시 열기가 만든 새 대화 ID는 없다. 판의 실행 인자에 `--fork-session`은 없다(단위 시험이 확인).
- 알아내는 방법과 실제 데이터 판정 수는 5절.

##### 3.5 J5 사이드바(완료 기준 5)

`p7-j5.mjs`(`p7-j5.json`):

- 처음에는 닫혀 있다(`j5-1-closed-by-default.png`). ☰로 열면 리포 묶음 셋과 그 안의 판 세션·닫힌 세션·판 밖 대화가 보이고, 캔버스는 1584px에서 1244px로 줄어들며 뷰포트(자리와 배율)는 그대로다(`j5-2-…png`).
- 판 세션 `s2`를 누르면 그 노드로 들어가 초점이 간다(`j5-3-…png`). 리포 이름을 누르면 그 영역으로 간다(`j5-4-…png`).
- 거르기(`j5-5-filter.png`), 접기(`j5-6-folded-plain2.png`), `Ctrl+Shift+E`로 닫고 열기.
- 창을 닫았다 다시 열어도 사이드바가 열린 채, plain2가 접힌 채다(`j5-7-reopened-window-keeps-sidebar.png`).
- 닫힌 세션의 "판으로 열기"는 3.2절, 판 밖 대화의 "판으로 열기"는 3.4절.

##### 3.6 단위 시험

`backend/test/p7.test.mjs` 18개: 대화 기록 요약(사람이 쓴 지시만, 제목 우선순위), 큰 첨부 줄 뒤의 마지막 답, 맨 위 `.jsonl`만 대화, 환경 변수, 세션 파일·데스크톱 목록(바뀐 파일만), 명령줄, 판정 순서, 리포 맞추기(워크트리, 폴더 아래), 색인(바뀐 파일만, 열린 워크스페이스의 글만, 판이 아는 대화 빼기, 지운 파일), 2,000개, 닫힌 세션 목록과 빼기, claude 다시 열기(같은 ID, `--resume`, 새 설정·토큰, 마지막 자리, 그룹 풀림), 대화 기록 없는 claude·셸·다른 종류 다시 열기(이름 겹침, 빈자리), 판에 올린 claude 다시 열기(묶여 있으면 거부, 옛 행은 옮겨 감), 판 밖 대화 열기(묶임 셋 거부, 이미 판 세션), 되살리기 두 가지, P6 `board.db` 옮기기. `app/test/p7-lib.test.mjs` 2개: 거르기, 칸마다 마지막 활동 순.

#### 4. J1: 확인한 지금 동작과 메운 곳

같은 판에서 끄고 켜기를 먼저 해 보았다(`j1-0-before.json`, `j1-A-after-graceful.json`, `j1-B-*.json`).

| 상황 | P6까지 | P7 |
|---|---|---|
| 창만 닫음, 트레이에서 끝내기 | 백엔드와 herdr가 그대로 돈다(P2, P6) | 그대로 |
| 판이 띄운 claude | herdr가 판의 인자로 이어 가고, herdr가 잃으면 판이 되살린다(P3) | 그대로 |
| 한 턴도 돌지 않은 판 claude, 강제 종료 | `claude --resume`이 잠깐 idle을 보인 뒤 "No conversation found"로 끝나 `exited`로 남는 경합이 있었다(이번 kill 1회차) | herdr를 다시 띄운 뒤 30초 안에 끝나면 이어 가기 실패로 보고 같은 `--session-id`로 새로 띄운다(P1 규칙을 넓힘) |
| 판에 올린 claude, 패널이 남음 | herdr가 기본 이어 가기(`claude --resume <ID>`)를 하면 돌아온다(이번 시험의 `helper`, `helper2`). 안 하면 셸이 됐다(P6b의 `helper`) | 15초 기다려도 돌아오지 않으면 herdr가 아는 대화 ID로 같은 패널에서 이어 간다(판의 hook 없이, herdr 기본 이어 가기와 같은 명령). 대화 ID가 없으면 지금처럼 셸 |
| 판에 올린 claude, 패널을 잃음 | `pane gone`으로 판에서 지웠다 | 같은 폴더에 새 작업 공간을 만들어 그 대화 ID로 이어 간다. 같은 노드 |
| 판이 띄운 셸, 판에 올린 셸, 패널을 잃음 | `pane gone`으로 지웠다(P6b "되살리지 않는다") | 같은 폴더의 새 셸로 같은 노드. 끊긴 명령 표시는 남긴다 |
| 다른 종류(codex) | herdr가 이어 가지 않아 `exited(herdr_stopped)` 노드와 빈 셸 패널이 남았다 | herdr가 이어 가지 않으면(그 종류가 herdr에 이어 가기 정보를 보고하지 않음) 닫힘으로 남기고 남은 패널을 닫는다. 다시 열면 같은 폴더에 같은 인자로 새로 뜬다 |
| herdr가 다시 뜨지 않았는데 패널이 없어짐 | 판에서 지웠다 | 닫힘으로 남아 다시 연다 |
| 이름과 자리 | 닫힌 세션의 행과 노드 자리는 판 기록에 남아 있었지만 보이지 않았다 | 다시 열 때 같은 이름(쓰이고 있으면 `-2`), 마지막 자리가 비어 있으면 그 자리 |

"herdr가 다시 떴는가"는 백엔드가 도는 동안 herdr 연결이 끊긴 적이 있거나(`herdrWasDown`), 백엔드가 꺼진 동안 herdr 서버 PID가 바뀐 것(`herdrRestartedWhileDown`, P3)으로 본다. herdr가 그대로인데 패널이 없어진 것은 사람이 판 밖에서 닫은 것으로 보고 되살리지 않는다.

#### 5. 묶여 있는지 알아내는 방법(J4)

##### 5.1 후보 비교(2026-10-31, 이 PC)

| 후보 | 알려 주는 것 | 한계 | 고름 |
|---|---|---|---|
| 대화 기록 안의 출처(줄마다 `entrypoint`: `cli`, `claude-desktop`, `claude-desktop-3p`, `sdk-cli`) | 데스크톱 앱 대화를 앱이 지금 돌리지 않아도, 앱 목록에서 지워졌어도 안다(앱 목록에 없는 데스크톱 출처 87개) | 지금 열려 있는지는 모른다. 터미널에서 연 대화를 앱이 가져간 것은 `cli`만 있다(9개) | 씀: 데스크톱 판정 |
| 데스크톱 앱 세션 목록(`%LOCALAPPDATA%\Claude-Data\<프로필>\claude-code-sessions\…\local_*.json`의 `cliSessionId`, `priorCliSessionIds`, `isArchived`) | 앱이 든 대화 ID(213개), 앱이 가져간 터미널 대화, 보관 여부 | 공개되지 않은 형식이라 앱 업데이트로 바뀔 수 있다. 처음 읽기 0.2초(그 뒤 바뀐 파일만, 3ms) | 씀: 데스크톱 판정 |
| `claude` 프로세스 명령줄(`--resume`, `--session-id`) | `-p`처럼 세션 파일이 없는 실행과 세션 파일을 쓰기 전의 틈 | 그냥 `claude`로 띄운 대화형 세션은 ID가 없다(claude 28개 중 13개만 ID). PowerShell 0.3초 | 보조: 열기 직전과 30초마다 |
| Claude Code의 세션 파일(`~/.claude/sessions/<pid>.json`: `pid`, `sessionId`, `entrypoint`, `kind`) | 지금 도는 대화형 claude 전부(터미널과 데스크톱)의 대화 ID와 pid. 2ms 안쪽 | 공개되지 않은 형식. 프로세스가 끝나는 1~2초는 남아 있다(안전한 쪽) | 씀: "터미널 · pid n"의 주 출처 |
| 대화 기록 수정 시각 | 최근에 쓰였는지 | 열려 있어도 쉬면 바뀌지 않고, 끝난 직후에도 최근이다. 혼자서는 못 쓴다 | 마지막 안전망: 다른 출처가 없는데 30초 안에 쓰였으면 "묶여 있을 수 있음 · 방금 기록됨" |

##### 5.2 판정 순서(`convos.mjs bindingOf`)

1. 세션 파일의 살아 있는 pid가 그 대화를 열고 있다 → 데스크톱 출처면 "데스크톱 앱 · 열려 있음", 아니면 "터미널 · pid n"
2. claude 명령줄에 그 대화 ID → "터미널 · pid n"
3. 데스크톱 앱 목록(지금 ID, 이전 ID)에 있다 → "데스크톱 앱"(보관한 것은 "데스크톱 앱 · 보관됨". PLAN 8절의 열린 결정은 묶인 쪽으로 정함)
4. 대화 기록 출처에 데스크톱이 있다 → "데스크톱 앱"(앱에서 지운 대화도)
5. 출처가 하나도 없다 → "묶여 있을 수 있음 · 출처 모름", `cli` 밖의 출처(`sdk-cli` 등)가 있다 → "묶여 있을 수 있음 · sdk-cli"(SDK를 쓰는 다른 앱이 쥐고 있을 수 있다)
6. 30초 안에 쓰였다 → "묶여 있을 수 있음 · 방금 기록됨"
7. 나머지(터미널에서 열었다가 끝난 `cli` 대화) → 묶여 있지 않음

판이 아는 대화(닫힌 판 세션의 대화)는 1~4만 본다. 판이 띄운 claude가 막 끝난 대화가 "방금 기록됨"으로 막히지 않게 하기 위해서다. 열기 직전에는 세션 파일, 데스크톱 목록, 명령줄을 다시 읽어 한 번 더 판정한다.

##### 5.3 실제 데이터의 판정 수

판정 함수만 실제 `~/.claude/projects`에 돌렸다(`experiments/p7/tools/scan-real.mjs`, 수만 남김, 2026-10-31 11:45 KST, `experiments/p7/j4-real-verdict.json`). 대화 기록 398개 중:

| 판정 | 수 |
|---|---|
| 데스크톱 앱 | 201 |
| 데스크톱 앱 · 보관됨 | 67 |
| 데스크톱 앱 · 열려 있음 | 5 |
| 터미널 · pid n | 10 |
| 묶여 있을 수 있음 · sdk-cli | 24 |
| 묶여 있지 않음 | 91 |

데스크톱 묶임은 모두 273개다. 터미널 10개에는 이 시험의 판 세션과 판 밖 claude가 들어 있다(그때 돌던 것). 지시가 하나도 없는 대화 기록 124개(메타 줄만 있음)는 목록에 나오지 않는다.

#### 6. PLAN과 다르게 한 곳

1. **판에 올린 claude를 다시 열면 새 행이 된다.** 판 세션은 세션 ID가 곧 대화 ID라야 hook·이어 가기·대화 기록 경로가 맞는다. 판에 올린 claude는 세션 ID와 대화 ID가 달라서, 다시 열면 그 대화 ID를 세션 ID로 하는 판 세션(판의 hook과 설정)을 만들고 옛 행에는 `reopened_as`를 남긴다. 이름과 노드 자리는 옛 것을 쓴다. J1의 되살리기(herdr 재시작)는 같은 노드를 hook 없이 이어 간다.
2. **다른 종류(codex)는 herdr가 이어 가지 않으면 닫힘으로 둔다.** PLAN은 "다른 종류는 herdr가 아는 이어 가기 정보가 있으면 그것으로"다. herdr는 이어 가기 정보(`report-agent-session`)를 받은 에이전트를 스스로 이어 가므로 판은 15초 기다릴 뿐이다. 판이 그 하네스의 이어 가기 명령을 따로 만들지는 않았다. 이 PC의 codex는 보고하지 않아 이어 가지지 않았다. 남은 빈 패널은 닫는다(두면 판 밖 셸로 다시 올라온다).
3. **"방금 기록됨" 30초.** 끝난 직후의 판 밖 대화는 30초 동안 열 수 없다. 다른 출처가 없는 짧은 틈(세션 파일을 쓰기 전 등)을 막는다.
4. **폴더 워크스페이스는 그 아래 폴더의 대화도 담는다.** 워크스페이스 키 규칙만 쓰면 git이 아닌 폴더의 하위 폴더 대화는 따로 떨어진다. 노드의 "다른 곳에서 일함"(`elsewhereOf`)과 같은 기준으로, 다른 git 저장소가 아닌 하위 폴더는 넣었다.
5. **대화 기록 폴더 환경 변수는 목록에만, `;`로 여럿.** 판 세션의 대화 기록 경로는 바꾸지 않는다(1.1절). 창 시험은 실제 폴더와 고정 자료를 함께 읽었다.
6. **글은 열린 워크스페이스의 대화만 저장한다.** 판 기록에 다른 프로젝트 대화의 제목·지시가 옮겨지지 않게 했다.
7. **단축키는 `Ctrl+Shift+E`.** `Ctrl+B`는 Claude Code(백그라운드 실행)와 셸이 쓴다.
8. **목록 상한.** 워크스페이스마다 닫힌 세션과 판 밖 대화를 각각 300개까지 창에 보낸다(마지막 활동 순). 얼마나 옛것까지 보일지는 PLAN 8절에서 열려 있다.
9. **덩어리도 되살리지 않는다(J2).** PLAN은 그룹·연결만 적었다. 덩어리에서 뺀 노드는 옛 짝과 맞닿은 자리라 "마지막 자리"에서 맞닿음은 겹침으로 보지 않는다.

#### 7. 확인하지 않은 것과 알려진 문제

1. **실제 PC 재부팅.** 강제 종료와 "herdr가 패널을 잃음" 흉내로 대신했다(8절 1번).
2. **J2 창 시험 첫 실행의 클릭.** 셸의 "판으로 열기"를 누른 것이 백엔드에 닿지 않은 적이 한 번 있었다. 따로 누르면 됐고 다시 돌린 시험은 통과했다. 원인은 찾지 못했다(클릭 순간 줄이 다시 그려졌을 수 있다). 기록 파일은 다시 돌리기 전에 지워졌다.
3. **판 밖 대화의 신뢰 대화상자.** git 최상위 폴더(워크트리 포함)의 대화를 판으로 열면 Claude Code가 신뢰를 묻는다. 지금처럼 "터미널에서 답하기"다. 시험에서는 수락하지 않으므로 리포·워크트리 대화를 실제로 열어 보지 않았다(고정 자료와 단위 시험으로만).
4. **실제 데스크톱 앱 대화를 사이드바에서 보기.** 시험 판에는 실제 워크스페이스를 열지 않았다. 판정 함수만 실제 데이터에 돌렸다(5.3절).
5. **세션 파일과 데스크톱 목록의 형식**은 공개된 것이 아니다. Claude Code나 앱이 바뀌면 읽지 못할 수 있고, 그때는 출처 표시와 수정 시각만 남는다(데스크톱 대화는 출처로 계속 잡힌다).
6. **같은 대화를 판 밖에서 다시 여는 경우.** 판 세션으로 연 대화를 사람이 다른 터미널에서 또 `--resume`하는 것은 판이 막지 못한다(판은 열기 전에만 확인한다).
7. **세션 파일의 pid 재사용.** 끝난 claude의 세션 파일이 남고 그 pid를 다른 프로세스가 받으면 묶인 것으로 보인다(안전한 쪽).
8. **판에 올린 claude를 되살릴 때 원래 인자**(예: `--model haiku`)는 모른다. herdr 기본 이어 가기처럼 `--resume <ID>`만 쓴다. 이번 시험에서 herdr가 이어 간 `helper`도 모델 인자 없이 떴다.
9. **P6 화면의 영역 겹침.** 이 판에서 plain과 plain2 영역이 겹치고 새 노드가 영역 아래로 길게 쌓였다(P6의 빈자리·도킹 동작). P7에서 고치지 않았다.
10. **P2~P6 창 시험**은 다시 돌리지 않았다. 백엔드 단위 시험 116개와 창 단위 시험 24개는 통과했고, P7 창 시험이 캔버스·영역·덩어리·그룹·연결을 함께 썼다.
11. **시험이 남긴 것.** 시험 claude와 판 밖 대화의 대화 기록 8개가 `~/.claude/projects/C--Workspace-mtask-p7-*` 아래에 남았다(판은 읽기만 한다). `backend/.dev/`(이 판의 데이터, 창 프로필)는 git이 무시하므로 남겼다. 고정 자료 폴더는 지웠다. 시험 폴더의 claude가 `~/.claude.json`에 프로젝트 항목을 남겼을 수 있다.

#### 8. 사용자가 손으로 해 볼 것

1. **실제 재부팅:** 판에 claude 둘(하나는 한 턴 돌림), 셸 하나, claude가 나눠 띄운 에이전트 하나를 두고 PC를 다시 켠다. 앱을 열면 같은 자리·덩어리·그룹·연결로 돌아오는지, 돌아오지 못한 것이 사이드바 "닫힌 세션"에 있는지 본다.
2. **실제 대화로 사이드바 보기:** 실제 판에서 자주 쓰는 리포를 연다. 그 리포의 지난 대화가 보이는지, 데스크톱 앱 대화가 "데스크톱 앱"으로 흐리게 보이는지, 터미널에서 열어 둔 대화가 "터미널 · pid n"인지, 터미널 대화를 끝낸 뒤 "판으로 열기"가 되는지, 연 대화가 같은 대화로 이어지는지 본다.
3. 목록이 너무 길거나 짧은지(칸마다 5개, 더 보기, 300개 상한), 제목이 알아볼 만한지, 닫힌 까닭이 이해되는지.
4. `Ctrl+Shift+E`가 손에 맞는지, 사이드바 폭(340px)과 위치.
5. 판 밖 대화를 판으로 열 때 모델과 권한 모드: 실제 판은 사용자의 기본 모델, 권한 모드 `manual`로 연다. 원래 대화의 모델로 열어야 하는지.
6. codex 같은 다른 종류를 herdr 재시작 뒤 닫힘으로 두는 것이 맞는지, 같은 폴더에 새로 띄우는 편이 나은지.

#### 9. 정리

- 시험 세션 9개(claude `s1`~`s5`, `helper`, `helper2`, 셸 `sh1`, `sh2`)를 `mtask kill`로 껐다. `sh3`과 `cx1`은 시험 중에 닫혔다. J1 증거를 위해 다시 만든 판의 세션 셋(`s2`, `helper2`, `sh2`)도 시험 뒤 `mtask kill`로 껐다.
- 판 밖 claude `o1`, `o2`는 시험 중에 `/exit`로 껐고, 판 밖 herdr 서버를 멈췄다.
- 창은 시험마다 닫혔고 남은 `electron.exe`가 없었다.
- 이 판의 herdr(`mtask herdr stop`)와 백엔드(`mtask backend stop`)를 멈추고 `herdr session delete multitask-dev-p7`, `multitask-dev-p7-outside`로 지웠다. 포트 47817·47818에 듣는 프로세스가 없다.
- `C:\Workspace\mtask-p7-plain`, `mtask-p7-plain2`, `mtask-p7-repo`, 워크트리 `mtask-p7-repo-wt`를 지웠다. `backend/.dev/fixture-projects`도 지웠다.
- 사용자의 `multitask-dev`(돌고 있음)와 실제 판, 기본 herdr 세션은 건드리지 않았다. 데스크톱 앱 쪽 파일, `~/.claude/projects`, `~/.claude/sessions`는 읽기만 했다.

#### 10. PLAN·BRIEF·CLAUDE.md에서 바꿀 것

- PLAN 4절 J: 1·4·5·6절의 정한 것(판정 순서와 출처, 30초, 판에 올린 claude의 다시 열기는 새 행, 다른 종류는 닫힘, 폴더 워크스페이스의 하위 폴더, `Ctrl+Shift+E`, 300개 상한)을 "만들며 정한 것"으로 옮긴다. J1의 "빈 곳"은 4절 표로 바꾼다.
- PLAN 5절 모듈 표: "대화 목록"을 `backend/src/convos.mjs`, `recall.mjs`, `store-recall.mjs`로 적고 단계를 P7(끝남)으로.
- PLAN 6절: P7 API는 `docs/P7.md` 1.2절을 기준으로 한다고 한 줄.
- PLAN 8절: "판 밖 대화가 묶여 있는지 알아내는 방법"과 "데스크톱 앱에서 보관한 대화"를 정해서 닫은 것으로(5절, 보관도 묶임). "닫힌 세션을 얼마나 오래 둘지, 판 밖 대화를 얼마나 옛것까지"는 열어 두되 지금 값(300개)을 적는다. 새로 열 것: 판 밖 대화를 열 때 모델, 다른 종류의 이어 가기.
- PLAN C3: "한 턴도 돌지 않은 세션"의 새로 띄우기가 herdr 재시작 뒤 30초 안의 해제에도 걸린다는 것.
- BRIEF 3절 "세션 되찾기"와 "사이드바" 줄에 P7 결과(되살리기 범위, 묶임 판정 방법, 단축키)를 덧붙이고, 머리말과 5절에 P7을 끝난 단계로 적는다. 8절 참고 문서에 `docs/P7.md`.
- CLAUDE.md: 첫 문단에 P7(v0.6)을 더하고, "시작할 때"의 문서 목록에 `docs/P7.md`. 시험 규칙에 "판 밖 대화 목록 시험은 `MTASK_CLAUDE_PROJECTS`로 고정 자료를 더하고, 시험 판에는 새로 만든 폴더만 연다"를 더할 만하다.

### 지휘 세션의 합치기 기록(옛 `docs/PLAN.md` 7절)

끝났다(2026-10-31). 결과와 증거는 `docs/P7.md`, 스크린숏과 기록은 `experiments/p7/`에 있다. 아래 다섯 가지를 실제 haiku 세션과 판 밖 herdr 세션의 claude로 해 보았고 모두 됐다. 충돌 없이 합쳤고 합친 `main`에서 백엔드 단위 시험 116개, 창 단위 시험 24개가 통과한다. 실제 재부팅, 실제 대화로 사이드바 보기, git 최상위 폴더의 대화를 판으로 열기(신뢰 대화상자)는 사람이 확인한다(`docs/P7.md` 7·8절).
