상태: 닫힘
날짜: 2026-10-30

## 지시

### P4 작업 지시: 세션끼리 연결(옛 `docs/briefs/P4.md`)

2026-10-30에 작업자 CLI 세션에 맡기려고 쓴 지시다. 이날 사용자가 방향을 바꿨다. `docs/BRIEF.md` 2절의 "2026-10-30에 정한 방향"과 3절 "방향" 줄을 먼저 읽는다.

#### 먼저 읽을 것

- `CLAUDE.md`, `docs/BRIEF.md`, `docs/PLAN.md`(특히 0절, 4절 F, 7절 P4, 8절)
- `docs/P1.md`, `docs/P2.md`, `docs/P3.md`
- herdr 스킬: `~/.agents/skills/herdr/SKILL.md`. herdr 패널 안의 에이전트가 다른 패널에 일을 시키는 방법이 있다.
- `herdr agent`, `herdr pane`, `herdr worktree`의 도움말(하위 명령 없이 그룹만 실행)
- `backend/`와 `app/` 코드

#### 할 일

PLAN 7절의 P4를 만든다. 판의 역할은 세션을 띄우고, 세션끼리 연결해 주고, 그 연결을 보여주는 것이다. 일을 나누고 시키는 것은 에이전트가 herdr 스킬로 직접 한다. 워크트리 같은 작업 방식은 각 하네스의 규칙을 따른다. 판이 같은 일을 다시 만들지 않는다.

#### 완료 기준

개발용 프로필에서 실제 에이전트 세션으로 아래가 모두 되어야 한다. 시험할 수 없는 항목은 그 이유와 사람이 확인할 점검표를 남긴다.

1. **빼기:** E1(데스크톱 앱 세션)과 E3(기본 herdr 세션)의 읽기 전용 카드와 모듈을 뺀다. 백엔드(`desktop.mjs`, `herdr/reader.mjs`, API, 설정), 창(카드, 위쪽 칩), mtask 명령, 시험, 시험 도구, `MTASK_REDACT`처럼 그것 때문에 생긴 것을 모두 뺀다. D3 경고(판 전용 세션에 herdr 화면이 붙음)는 남긴다.
2. **herdr 스킬을 쓸 수 있게:** 판이 띄운 에이전트가 자기 패널 안에서 herdr 스킬을 쓸 수 있는지 확인한다. `HERDR_ENV=1`과 `HERDR_PANE_ID`가 들어오는지, `herdr` 명령이 판 전용 세션(`multitask-dev`)에 붙는지 본다. Claude Code가 `~/.agents/skills`의 스킬을 읽지 않으면, 사용자 설정을 고치지 않는 방법(예: 실행마다 넘기는 `--plugin-dir`, `--append-system-prompt`)으로 스킬을 쥐여 준다.
3. **F1 일 시키기를 선으로:** 판이 띄운 세션 A에게 "B에게 이걸 시키고 답을 받아 와"라고 하면, A가 herdr 스킬로 B에게 일을 시킨다. 판에 A → B 선이 생기고, 선 위에 지시 앞부분과 B의 상태가 보인다. 선을 누르면 오간 기록이 나온다. 알아채는 방법(PLAN 4절 F1의 후보 셋)을 실제로 비교해서 고르고 이유를 적는다.
4. **F2 판에서 잇기:** 판에서 A 노드에서 B 노드로 선을 끌어 역할을 적으면, 판이 A에게 B의 herdr 이름, 패널 ID, 역할을 알린다. 그 뒤 A에게 "리뷰어에게 맡겨"라고만 해도 A가 B에게 일을 시킨다. 연결은 창과 백엔드를 다시 띄워도 남는다. 연결을 끊는 동작도 만든다.
5. **F3 새 에이전트 올리기:** A가 herdr로 패널을 나누고 새 에이전트를 띄우면, 새 노드가 A 옆 빈자리에 저절로 생기고 A와 이어진다. 그 노드도 상태, 화면, 끄기가 된다. 같은 탭의 패널끼리 제어기가 패널 크기를 두고 다투지 않는지 본다.
6. **F4 워크트리:** 세션이 하네스의 방식으로 워크트리에서 일하면 노드에 워크트리 경로와 브랜치가 보이고, 같은 저장소의 세션끼리 관계가 보인다. 판은 워크트리를 만들지 않는다.
7. **F5 다른 에이전트 종류:** 새 세션 대화상자에서 herdr가 아는 종류를 고를 수 있다. 이 PC에는 `codex`가 깔려 있다. Claude Code가 아닌 종류는 herdr 상태와 화면으로 보여주고, 승인 카드는 "터미널에서 답하기"로 보낸다.

#### 확인 방법

- 창은 Playwright의 Electron 지원이나 CDP로 조작하고 스크린숏을 찍는다. 스크린숏과 로그는 `experiments/p4/`에 둔다.
- 백엔드와 창의 기존 단위 시험은 계속 통과해야 한다. 빼는 기능의 시험은 같이 뺀다. 새 코드에는 시험을 더한다.
- 시험용 Claude Code 세션은 `--model haiku`로 띄우고 턴은 아주 짧게 한다. 에이전트끼리 일을 시키는 시험도 "Reply with exactly: …" 수준의 짧은 일로 한다.
- codex는 이미 로그인되어 있을 때만 시험한다. 로그인이나 계정 설정은 하지 않는다. 턴은 한두 번만 짧게 한다. 다른 에이전트 CLI는 새로 설치하지 않는다.

#### 규칙

- `CLAUDE.md`를 따른다. 개발용 프로필(`--dev`)만 쓴다. 실제 판의 값으로는 띄우지 않는다.
- **에이전트가 부르는 `herdr` 명령도 판 전용 개발용 세션 안에서만 일하게 한다.** 사용자의 기본 herdr 세션에는 어떤 에이전트도 붙지 않게 한다. 시험 에이전트에게 주는 지시에 `--session`이나 `--machine`을 쓰게 하지 않는다.
- **신뢰 대화상자는 수락하지 않는다.** 워크트리 시험에 git 저장소가 필요한데 신뢰 대화상자가 뜨면, 수락하지 말고 다른 방법(herdr `worktree create`, 신뢰를 물려받는 위치)을 찾거나 사람이 할 점검표로 남긴다.
- **multitask 저장소에 워크트리나 브랜치를 만들어야 하면** 이름을 `mtask-test/`로 시작하게 하고, 끝나면 워크트리와 브랜치를 모두 지운다. 커밋, 푸시, `main` 변경은 하지 않는다.
- 데스크톱 앱 세션과 기존 세션은 건드리지 않는다. 직접 띄운 프로세스만 PID로 끈다. `~/.claude/settings.json`과 `~/.agents/skills`를 고치지 않는다.
- 참고 제품에서는 화면 구성과 동작만 참고한다. OpenCove 파일을 가져오면 `CLAUDE.md`의 MIT 고지 규칙을 지킨다.
- 끝나면 시험 세션을 끄고, 창을 먼저 닫고, 개발용 백엔드와 herdr 서버를 멈추고, 띄운 herdr 세션을 모두 지운다.
- `docs/PLAN.md`, `docs/BRIEF.md`, `CLAUDE.md`는 고치지 않는다. 커밋하지 않는다.

#### 보고

마지막에 `docs/P4.md`를 한국어로 쓴다.

- 무엇을 만들고 무엇을 뺐는지
- 돌리는 법
- 완료 기준마다의 증거(스크린숏 경로 포함)
- 에이전트끼리 오간 지시를 알아채는 방법을 무엇으로 골랐고 왜인지
- PLAN과 다르게 한 곳과 그 이유
- 확인하지 않은 것과 알려진 문제
- 사용자가 손으로 해 볼 것
- PLAN, BRIEF, CLAUDE.md에서 바꿀 것

### 지휘 세션이 정한 범위와 완료 기준(옛 `docs/PLAN.md` 7절)

2026-10-30에 다시 정했다. 예전 P4(B5 포워드, 루프, 플래너, 미션 맵) 중 포워드와 플래너는 에이전트가 herdr 스킬로 직접 하므로 판이 만들지 않는다. 루프와 미션 맵은 그 뒤 후보로 미룬다.

완료 기준:

1. E1·E3의 읽기 전용 카드와 모듈을 뺀다(백엔드, 창, API, mtask, 시험, 문서).
2. F1: 판이 띄운 세션 A가 herdr 스킬로 세션 B에게 일을 시키면, 판에 A → B 선이 생기고 지시 앞부분과 B의 상태가 보인다.
3. F2: 판에서 A에서 B로 선을 끌어 역할을 정하면 A가 B의 이름, 패널, 역할을 알게 되고, 그 뒤 A가 B에게 일을 시킬 수 있다. 연결은 창과 백엔드를 다시 띄워도 남는다.
4. F3: A가 herdr로 새 패널과 에이전트를 띄우면 새 노드가 A 옆에 저절로 생기고 A와 이어진다.
5. F4: 세션이 하네스의 방식으로 워크트리에서 일하면 노드에 워크트리 경로와 브랜치가 보이고, 같은 저장소의 세션끼리 관계가 보인다.
6. F5: 판에서 Claude Code가 아닌 에이전트 종류를 골라 띄울 수 있고, 상태가 보인다(이 PC에 깔린 종류로 시험).

## 작업 기록

문서 규약(`docs/README.md`)을 도입하기 전(2026-10-31)의 작업이라 작업 기록을 따로 남기지 않았다. 작업하며 알아낸 것과 계획과 다르게 한 곳은 보고 절에 있다.

## 보고

### P4. 세션끼리 연결(옛 `docs/P4.md`)

2026-10-30에 만들고 시험했다. 작업 지시는 `docs/briefs/P4.md`다. **완료 기준 7개를 개발용 프로필에서 실제 에이전트 세션으로 해 보았다. 1~6은 됐다. 7(F5)은 종류 고르기, 상태, 카드, 끄기까지 됐고, codex로 턴을 돌리는 것은 하지 못했다.** codex가 시작하자마자 자기 폴더 신뢰 대화상자를 띄웠고, 지시대로 수락하지 않았기 때문이다(3.7절, 7절 1번).

- 시험 세션은 모두 CLI에서 새로 띄운 `claude --model haiku`였고 턴은 "Reply with exactly: …" 수준이었다. codex는 로그인되어 있어(`codex login status`: Logged in using ChatGPT) 한 번 띄웠고 턴은 돌리지 않았다.
- 개발용 herdr 세션 `multitask-dev`, 포트 47811, 데이터 폴더 `backend/.dev/data`만 썼다. 실제 판의 값으로는 띄우지 않았다.
- 판 정하기: 에이전트끼리 오간 지시는 **판이 띄운 Claude Code의 hook(`PreToolUse`·`PostToolUse`)에서 셸 명령 글을 읽어** 알아챈다. 받는 쪽 상태와 새 에이전트는 herdr 이벤트로 본다. herdr 서버 로그는 쓰지 않는다(4절).

시험하면서 고친 것이 셋 있다.

1. 화면에서 읽은 답에 Claude Code 머리 그림, 턴 시간 줄(`✻ …`), 오른쪽 상태 줄(`◐ medium · /effort`)이 섞였다. 답 부분만 고르는 `screenAnswerText`를 넣었다.
2. 워크트리로 들어간 세션의 git 표시가 턴이 끝날 때마다 처음 폴더로 돌아갔다. P1의 `Stop` hook 처리가 시작 폴더로 git을 다시 읽어 덮었다. 지금 폴더(hook `cwd`)로 읽게 고쳤다.
3. 판판한 배치에서 선 위 글이 옆 노드에 가려졌다(노드 사이 틈 40px). 선 위 글을 노드 위에 그리고, 선을 두 노드가 마주 보는 쪽 손잡이에 붙였다.

#### 1. 만든 것과 뺀 것

##### 1.1 뺀 것(완료 기준 1)

E1(데스크톱 앱 세션)과 E3(기본 herdr 세션)의 읽기 전용 표시를 모두 뺐다. D3 경고(판 전용 세션에 herdr 화면이 붙음)는 그대로 둔다.

| 곳 | 뺀 것 |
|---|---|
| 백엔드 | `src/desktop.mjs`, `src/herdr/reader.mjs`, 설정 `otherHerdrSession`·`desktopRoot`(환경 변수 `MTASK_OTHER_HERDR_SESSION`, `MTASK_DESKTOP_ROOT`), `groups.mjs`의 `EXTRA_DEFAULTS`와 빈자리 계산의 카드 자리, `backend.status`의 `otherHerdr` |
| API | `desktop.list`, `other.herdr`, `board.setExtra`, 이벤트 `other.herdr`, `board.get`의 `extras` |
| mtask | `other` |
| 창 | `ExternalNodes.jsx`(카드 둘), 위쪽 칩 "앱 n"·"herdr …", 저장소의 `desktop`·`other`·`extras`, 30초마다 묻던 `desktop.list`, 카드 CSS, main의 `mt:openDesktop`(딥 링크 열기)와 preload의 `openDesktop` |
| 가림 | `MTASK_REDACT`, `?redact=1`, main이 넘기던 `redact` |
| 시험 | `backend/test/p3.test.mjs`의 E1 시험 2개, E3 시험 1개, 읽기 전용 대상 설정 시험 1개. `app/test/e2e/e3-other.mjs`. `d1-e1.mjs`는 E1 부분을 빼고 `d1-res.mjs`로 바꿨다. `p3-smoke.mjs`의 카드 확인 |
| 시험 도구 | `experiments/p3/tools/other.mjs`. D3 시험(`d3-clients.mjs`)이 쓰던 부분만 `experiments/p3/tools/tui-host.mjs`로 남겼다 |

`docs/P3.md`와 `experiments/p3/`의 E1·E3 기록(스크린숏, 로그)은 경위로 남겼다.

##### 1.2 백엔드(`backend/`)

| 파일 | 하는 일 |
|---|---|
| `src/links.mjs`(새) | 순수 함수만 둔다. 창도 그대로 묶어 쓴다. 셸 명령 글 나누기(`splitCommands`, bash와 PowerShell 따옴표), herdr 호출 읽기(`parseHerdrCommands`: `agent prompt/read/wait/start/send-keys`, `pane split/run`, `worktree create` 등. `--session`·`--machine`·`--remote`로 다른 곳을 부른 호출은 `foreign`), herdr CLI 결과 읽기(`parseHerdrOutput`), 화면에서 답 고르기(`screenAnswerText`), 부모 옆 빈자리(`freeSlotNear`), 마주 보는 손잡이(`facingSides`), 같은 저장소 관계선(`repoEdges`), 연결 알림 글(`roleNotice`, `unlinkNotice`, `paneChangedNotice`) |
| `src/backend.mjs` | 연결(4절 F) 전부. hook의 셸 명령에서 herdr 호출 찾기(`onShellHook`), 받는 쪽 상태를 연결 기록에 붙이기(`onLinkTargetState`, `onLinkTargetPrompt`), 판이 띄우지 않은 에이전트 올리기(`adoptPane`, `setParent`), 판에서 잇기와 끊기(`linkCreate`, `linkDelete`), 패널 ID가 바뀌면 시킨 쪽에 알리기(`setPane`), git과 워크트리(`probeGit`, `pollCwd`). 다른 종류 띄우기와 끄기, hook이 없는 세션의 상태·마지막 답·제출 확인 |
| `src/launch.mjs` | herdr 스킬 플러그인 폴더 만들기(`writeBoardPlugin`), 실행 인자에 `--plugin-dir`와 `--append-system-prompt-file`, 세션 설정 파일의 "herdr 명령만 자동 승인"(`HERDR_ALLOW`, 고를 때만) |
| `src/state.mjs` | runtime에 `kind`·`hooked`. hook이 없는 세션은 herdr 상태만으로 정한다. 막히면 화면 끝을 묻는 내용(`ask.kind = 'screen'`)으로 둔다. 턴은 herdr `working`으로 센다 |
| `src/git.mjs` | `rev-parse --git-dir --git-common-dir`로 워크트리인지, 본 저장소가 어디인지(`parseRevParse`) |
| `src/herdr/adapter.mjs` | `agent.start`의 종류, `pane.moved` 구독, `pane.get`(foreground_cwd), 작업 공간의 패널, 종류 목록(`herdr agent` 도움말의 `kinds:` 줄 + `where.exe`), `herdr --skill` |
| `src/store.mjs` | 표 `links`, `link_events`. 열 `sessions.kind·origin·parent_session_id`(이전 board.db에는 `ALTER TABLE`) |
| `src/delivery.mjs` | hook이 없는 세션은 보낸 뒤 herdr `working`으로 제출 확인(`onAgentWorking`). `agent.prompt` 응답보다 `working`이 먼저 와도 된다 |
| `bin/mtask.mjs` | `links`, `link <A> <B> --role 역할`, `unlink <ID> [--yes]`, `linklog <ID>`, `kinds`, `spawn --kind --args --allow-herdr`. `ls`에 종류·판에 올림·워크트리, `watch`에 연결 기록 |
| `test/p4.test.mjs`(새) | 단위 시험 12개 |

**API(PLAN 6절)에 더한 것**

| 판 API | 내용 |
|---|---|
| `session.spawn { …, kind?, args?, allowHerdr? }` | `kind`는 herdr가 아는 종류(기본 `claude`). Claude Code가 아니면 hook·이어 가기 등록·신뢰 예상 없이 `args`를 그대로 넘긴다. `allowHerdr`면 세션 설정 파일에 herdr 명령만 자동 승인 규칙을 넣는다 |
| `agent.kinds` | `[{ kind, installed, path }]` |
| `link.list`, `link.log { link }` | 판에 보이는 연결(두 세션이 다 판에 있는 것), 오간 기록 |
| `link.create { from, to, role }` | F2. A → B를 잇고 A에게 알림을 B1 규칙으로 보낸다 |
| `link.delete { link, confirm }` | 끊기. `confirm` 없이 부르면 확인 문구만. 역할이 있었으면 A에게 알린다 |
| `board.get`의 `links` | 창이 처음 붙을 때 |
| 이벤트 `link.updated`, `link.removed`, `link.event` | 창과 `mtask watch`가 받는다 |
| `session.answer` | hook이 없는 세션에는 `answer_in_terminal` 오류로 거부한다 |

세션 요약(`session.list` 등)에 `kind`, `origin`(`board`·`adopted`), `parentSessionId`, `hooked`, `agentName`, `answerSource`(`hook`·`screen`), `cwdNow`, `git`(워크트리 정보)을 더했다.

##### 1.3 창(`app/`)

| 파일 | 하는 일 |
|---|---|
| `src/renderer/Links.jsx`(새) | 연결선(`LinkEdge`), 같은 저장소 선(`RepoEdge`), 잇기 역할 대화상자(`RoleDialog`), 오간 기록과 끊기(`LinkPanel`) |
| `src/renderer/Canvas.jsx` | 연결선과 같은 저장소 선을 그린다. 손잡이를 끌어 놓으면 역할을 묻는다(`connectionMode="loose"`). 읽기 전용 카드를 뺐다 |
| `src/renderer/SessionNode.jsx` | 네 변의 잇기 손잡이, 종류 표시(Claude Code가 아니면), "@A가 띄움", git 줄(브랜치, 워크트리 경로, 바뀐 파일 수) |
| `src/renderer/SpawnDialog.jsx` | 에이전트 종류 고르기(깔린 것 먼저, 없는 것은 고를 수 없음), 다른 종류의 실행 인자, "herdr 명령 자동 승인" |
| `src/renderer/ApprovalCard.jsx` | hook이 없는 세션의 카드: 화면 끝과 "터미널에서 답하기"만 |
| `src/renderer/ChatView.jsx` | hook이 없는 세션의 중간 얼굴은 대화 기록 대신 마지막 화면 끝 |
| `src/renderer/InboxBar.jsx`, `store.js`, `main.jsx` | 위쪽에 연결 수, 연결 저장과 이벤트, 대화상자 둘 |
| `test/e2e/p4-*.mjs`(새), `harness.mjs` | P4 창 시험 7개와 공통 도구(`p4-lib.mjs`). `closeApp`(6절 8번) |

OpenCove와 참고 제품의 코드는 가져오지 않았다.

#### 2. 돌리는 법

```
cd app && npm start                          # 개발용 프로필. 백엔드와 herdr가 없으면 띄운다
cd backend && npm test                       # 백엔드 단위 시험 44개(P1 23, P3 9, P4 12)
cd app && npm test                           # 창 단위 시험 14개
cd app && MT_E2E_OUT=p4 node test/e2e/<이름>.mjs   # P4 창 시험. 결과는 experiments/p4/
```

**화면 쓰는 법(P4에서 더한 것)**

| 동작 | 방법 |
|---|---|
| 판에서 잇기(F2) | 노드 가장자리의 손잡이(점)를 끌어 다른 노드에 놓는다. 끌기 시작한 노드가 시키는 쪽(A)이다. 역할(예: 리뷰어)을 적고 "잇기" |
| 오간 기록 | 선 위 글을 누른다. 오른쪽에 기록이 뜬다 |
| 끊기 | 기록 창의 "연결 끊기"(역할이 있을 때) 또는 "선 빼기", 확인 |
| 다른 종류 띄우기 | "+ 새 세션" → 에이전트 종류 |
| herdr 명령 자동 승인 | 새 세션 대화상자의 체크 상자(Claude Code만). `herdr`, `test`, `printf`, `echo`로 시작하는 명령만 |

**선의 모양**

| 선 | 뜻 |
|---|---|
| 파란 실선 | 판에서 정한 역할이 있다(F2) |
| 보라 실선 | 판이 알아챈 지시가 오갔다(F1) |
| 초록 점선 | A가 띄웠다(F3). 지시가 오가면 보라가 된다 |
| 움직이는 점선 | 받는 쪽이 그 지시로 작업 중이다 |
| 회색 점선 "같은 저장소 · 워크트리" | 같은 저장소의 워크트리 세션과 본 저장소 쪽 세션(F4) |

선 위 글은 역할, 마지막 지시 앞부분, 받는 쪽 상태 필이다. 판에 올린 에이전트의 머리줄에는 "@A가 띄움", 다른 종류에는 종류 이름이 붙는다.

**P4 창 시험**

| 스크립트 | 확인 |
|---|---|
| `p4-smoke.mjs` | 카드 없이 그려짐, 연결선, 오류 없음 |
| `p4-f1.mjs [A B]` | F1 |
| `p4-f2.mjs`, `p4-f2-restart.mjs` | F2(새 세션 대화상자, 끌어 잇기, 역할 알림, "리뷰어에게 맡겨"), 다시 띄워도 남음, 끊기 |
| `p4-f3.mjs [A 이름]` | F3, 같은 탭 제어기, 이 패널만 끄기 |
| `p4-f4.mjs` | F4 |
| `p4-f5.mjs` | F5(codex) |

시험 도구: `experiments/p4/tools/h.mjs`(개발용 herdr 세션의 소켓 API를 직접 부름), `experiments/p4/tools/ctl-fight.mjs`(같은 탭의 두 패널에 제어기를 붙임).

#### 3. 완료 기준별 증거

시각은 UTC다. 로그와 스크린숏은 `experiments/p4/`에 있다.

##### 3.1 빼기(완료 기준 1)

- 1.1절 표의 파일과 코드를 뺐다. `grep -rnE "redact|openDesktop|other\.herdr|desktop\.list|setExtra|EXTRA_DEFAULTS|MTASK_OTHER" app/src app/test backend/src backend/bin backend/test`는 아무것도 찾지 않는다.
- 단위 시험은 모두 통과한다(백엔드 44, 창 14).
- 창: `p4-smoke.txt`의 "읽기 전용 카드 0", 오류 사건 없음. `p4-smoke.png`, `final/p4-smoke.png`. P3 첫 확인(`regress/p3-smoke.txt`)도 오류 없이 돈다.
- D3 경고 코드(백엔드 `checkClients`, 창 `Warnings`)는 그대로다. D3 창 시험은 다시 돌리지 않았다(6절 6번).

##### 3.2 herdr 스킬을 쓸 수 있게(완료 기준 2)

`c2-skill-in-pane.txt`

- **패널 환경 변수:** 개발용 세션의 패널에는 `HERDR_ENV=1`, `HERDR_PANE_ID`, `HERDR_TAB_ID`, `HERDR_WORKSPACE_ID`, `HERDR_SESSION=multitask-dev`, `HERDR_SOCKET_PATH=…\sessions\multitask-dev\herdr.sock`, `HERDR_BIN_PATH`가 들어온다. 판은 백엔드 환경에서 `HERDR_*`를 빼고 herdr 서버를 띄우고, 이 값은 herdr 서버가 패널마다 넣는다.
- **어느 세션에 붙나:** 판이 띄운 claude `a`가 스킬 첫 단계로 부른 `test "${HERDR_ENV:-}" = 1 && echo ok; herdr agent list`의 결과는 `ok`와 개발용 세션의 에이전트 목록이었다. `herdr pane split --current`는 `a` 자신의 패널(w3:p1)을 나눠 w3:p2를 만들었다(`HERDR_PANE_ID`를 씀). 이 시험 동안 사용자의 기본 herdr 세션은 떠 있지 않았다.
- **다른 세션을 부르지 않음:** hook에서 본 herdr 호출 가운데 `--session`·`--machine`·`--remote`로 다른 곳을 부른 것(판 이벤트 `herdr_foreign_call`)은 0개다. 시험 지시에도 이 인자를 쓰지 않았다. 판은 짧은 안내(`--append-system-prompt-file`)로 "herdr 명령에 --session, --machine, --remote를 붙이지 않는다"를 준다.
- **스킬:** Claude Code는 `~/.agents/skills`를 읽지 않는다. `claude -p --model haiku`로 물으니 스킬 목록에 herdr가 없었다. `--plugin-dir <플러그인 폴더>`를 넘기자 `multitask-herdr:herdr`가 보였다. 판은 백엔드가 뜰 때 `<데이터 폴더>\plugin\multitask-herdr\`(`.claude-plugin/plugin.json`, `skills/herdr/SKILL.md`)를 만들고 판이 띄우는 claude마다 넘긴다. 스킬 글은 고정한 herdr의 `herdr --skill` 출력이다. 이 PC의 `~/.agents/skills/herdr/SKILL.md`와 글자까지 같았다. 이어 가기 명령(`resume_argv`)에도 같은 인자가 들어간다. 사용자 설정과 `~/.agents/skills`는 고치지 않았다.
- 실제로 `a`는 지시를 받자 `Skill(multitask-herdr:herdr)`를 먼저 불렀다(`f1-watch.txt` 07:46:31).

##### 3.3 F1 일 시키기를 선으로(완료 기준 3)

`f1-watch.txt`(mtask로 처음 확인), `p4-f1.txt`, `f1-0-before.png`, `f1-1-b-working-on-line.png`, `f1-2-done.png`, `f1-3-link-log.png`

- `a`에게 "Use herdr to ask the agent named b to write the numbers from 1 to 40, one per line, … read b's answer, and then tell me only the last number" 을 보냈다. `a`가 `herdr agent prompt b "Write the numbers …" --wait && herdr agent read b …`를 불렀다.
- 판에 `a → b` 선이 생겼다. `b`가 작업 중일 때 선 위 글은 `"Write the numbers from 1 to 40, one per line, w…" 작업 중`, 끝난 뒤 `… 준비`였다. `a`의 마지막 답은 `40`이다.
- 선을 누르면 기록이 뜬다. 한 번 시킨 일의 기록: 일 시킴(지시 글) → 받는 쪽 제출 확인 → 받는 쪽 작업 시작 → 지시 전달 끝(`done`) → 답을 읽음(`22 … 40`) → 받는 쪽 끝남(`1 … 40`). 받는 쪽 끝남의 글은 `b`의 `Stop` hook 답이다(`b`도 판이 띄운 claude라서).
- 처음 확인(07:46, mtask)은 "Reply with exactly: pong"이었다. 지시 글은 `a`의 `PreToolUse` 0초, `b`의 `UserPromptSubmit` +0.47초, herdr `working` +0.58초, `b`의 답 `pong` +2.4초였다.

##### 3.4 F2 판에서 잇기(완료 기준 4)

`p4-f2.txt`, `f2-0-spawn-dialog.png` ~ `f2-6-unlinked.png`, 확대 `f2-2-linked-crop.png`, `f2-3-delegated-crop.png`, `f2-4-after-restart-crop.png`

1. 새 세션 대화상자로 `lead`(herdr 명령 자동 승인)와 `rev`를 띄웠다.
2. `lead`의 손잡이를 마우스로 끌어 `rev`에 놓았다. 역할 대화상자에 "리뷰어"를 적고 "잇기"를 눌렀다.
3. 판이 `lead`에게 보낸 알림(B1 규칙, 제출 확인됨):
   ```
   [multitask 판] 연결 알림: herdr 에이전트 `rev`(패널 w6:p1, 종류 claude)가 너의 "리뷰어"이다.
   앞으로 "리뷰어에게 맡겨"처럼 이 역할을 부르면, herdr 스킬로 이 에이전트에게 일을 시키고 답을 받아 와라.
   일 시키기: herdr agent prompt rev "<할 일>" --wait
   답 읽기: herdr agent read rev --source recent-unwrapped --lines 80
   이 알림에는 "알겠다"고만 답해라.
   ```
   `lead`의 답은 "알겠다."였다.
4. `lead`에게 `리뷰어에게 맡겨: "Reply with exactly: LGTM". 리뷰어의 답을 받아 와서 알려 줘.`만 보냈다. `lead`가 `herdr agent prompt rev "Reply with exactly: LGTM" --wait`를 불렀다(셸 확장이 든 명령이라 한 번 물었고 판의 승인 카드로 승인함). 기록: 역할 → 일 시킴 → 제출 확인 → 작업 시작 → 끝남 `LGTM` → 지시 전달 끝 → 답을 읽음 `LGTM`. `lead`의 답: "리뷰어(`rev`)의 답은 `LGTM`이다."
5. 창을 닫고 백엔드를 끈 뒤 다시 띄웠다. 같은 연결(`lf3d0976657`, 역할 리뷰어, 기록 7건)이 그대로 있고 선도 그려졌다(`f2-4-after-restart*.png`). 연결은 SQLite `links`에 있다.
6. 선을 누르고 "연결 끊기"를 눌렀다. 확인 문구는 "@lead → @rev 연결("리뷰어")을 끊는다. @lead에게 끊겼다고 알린다. 오간 기록은 남는다."다. 끊자 선이 사라졌고 `lead`에게 "연결 해제: … 더 이상 너의 "리뷰어"가 아니다. 이 역할로 일을 시키지 마라."가 갔다. `lead`의 답은 "알겠다."였다. 기록은 남는다(마지막 줄 `unlink 리뷰어`).

##### 3.5 F3 새 에이전트 올리기(완료 기준 5)

`f3-watch.txt`(mtask), `p4-f3.txt`, `f3-1-new-node-next-to-parent.png` ~ `f3-5-after-kill.png`, `ctl-fight.txt`

- `a`에게 "Use herdr: split your own pane down, start a new claude agent named helper2 …, then ask helper2 to reply with exactly: hi2"를 보냈다. `a`가 `herdr pane split --current --direction down …`과 `herdr agent start helper2 --kind claude --pane w3:p3 -- --model haiku`를 불렀다.
- herdr `pane.agent_detected`(판이 모르는 패널)를 받아 판이 `helper2`를 올렸다. 부모는 `a`의 `PreToolUse`에서 본 `agent start` 명령으로 맞췄다(판 이벤트 `adopted … by: hook:agent.start`). 부모를 hook으로 못 찾으면 같은 작업 공간의 판 세션을 부모로 본다.
- 자리: `a`(1520, 0)의 오른쪽과 아래가 차 있어 위(1520, −500)에 놓였다. 다른 노드와 겹치지 않는다. 선은 "띄움"이고, 그 뒤 `a`가 보낸 지시 "Reply with exactly: hi2"도 같은 선에 붙었다. 머리줄은 "@helper2 준비 검토 대기 @a가 띄움 503MB".
- 상태는 herdr 상태로 바뀌었다(시작 중 → 준비 → 작업 중 → 준비). 마지막 답은 턴이 끝날 때 화면에서 읽은 "hi2"다.
- 화면: 같은 탭(w3:t1)의 `a`와 `helper2`에 창이 터미널을 붙였다. 두 제어기는 노드 크기대로 100×26이었고, herdr 레이아웃은 w3:p1=60×20, w3:p3=60×20, w3:p2=60×40 그대로였다. 따로 한 확인(`ctl-fight.txt`)에서도 한 탭의 두 패널에 제어기를 100×30과 70×20으로 붙이고 번갈아 크기를 바꿨지만, 각 제어기는 자기 크기의 프레임만 받았고 herdr 레이아웃(60×40, 60×40)은 바뀌지 않았다. herdr 화면(TUI)이 붙지 않은 헤드리스 서버에서는 같은 탭의 제어기끼리 다투지 않는다. 화면이 붙으면 D3 경고가 그대로 뜬다.
- 끄기: 확인 문구는 "helper2 세션의 claude를 끄고 패널 w3:p3만 닫는다(같은 작업 공간의 다른 패널 2개는 그대로)."였다. 끈 뒤 w3에는 `a`와 `helper`의 패널이 남았고 `a`는 준비 상태였다.

##### 3.6 F4 워크트리(완료 기준 6)

`p4-f4.txt`, `f4-live.txt`, `f4-1-worktree-node.png`, `f4-2-same-repo-line.png`, `f4-3-same-repo-label-crop.png`

- 세션 `wt`(개발용 시험 폴더 `backend/.dev/proj`, git 저장소로는 multitask 저장소 안)에게 "`git worktree add ./wt-p4 -b mtask-test/p4-wt`, cd into ./wt-p4, keep working inside"를 시켰다. 워크트리를 만든 것은 `wt`이고, 판은 git을 읽기만 한다(`rev-parse`, `status`, `diff --stat`).
- Claude Code는 셸에서 `cd`한 폴더를 hook `cwd`로 알린다. 판은 그 폴더로 git을 다시 읽는다. 노드의 git 줄: `⎇ mtask-test/p4-wt 워크트리 …/proj/wt-p4`(노랑), 풀이: "폴더 …/wt-p4, 저장소 …/wt-p4, 본 저장소 C:/Workspace/multitask".
- 같은 저장소(`C:/Workspace/multitask/.git`)의 본 저장소 쪽 세션 `rev`에서 `wt`로 "같은 저장소 · 워크트리 ⎇ mtask-test/p4-wt" 선이 그려졌다.
- 실시간 확인(`f4-live.txt`): `wt`가 `cd ..`하자 2초 안에 git 표시가 `main`(본 저장소)으로, 다시 `cd wt-p4`하자 워크트리로 돌아왔다.
- 처음 실행에서는 턴이 끝날 때 git 표시가 시작 폴더로 돌아갔다. 머리말의 고친 것 2번이다. 고친 뒤 위 결과를 얻었다.
- 신뢰 대화상자: `wt`는 이미 떠 있던 claude가 워크트리로 들어간 것이라 묻지 않았다. 워크트리 안에서 claude를 새로 띄우면 그 폴더가 git 최상위라 신뢰 대화상자가 뜰 것으로 본다(P1 규칙). 시험하지 않았다.
- 시험 뒤 `git worktree remove --force backend/.dev/proj/wt-p4`, `git branch -D mtask-test/p4-wt`로 지웠다. `git worktree list`에는 본 저장소만 남았다.

##### 3.7 F5 다른 에이전트 종류(완료 기준 7)

`p4-f5.txt`, `f5-0-spawn-dialog-codex.png`, `f5-1-codex-node.png`, `f5-2-codex-card-terminal-only.png`, `f5-kill.txt`

- 새 세션 대화상자의 종류 목록은 herdr 0.9.5가 아는 24종이고, 이 PC에서 찾은 `claude`, `pi`, `codex`, `agy`가 위에 온다. 없는 것은 고를 수 없다. codex를 고르면 모델·권한 모드 대신 실행 인자 칸과 "hook이 없다" 안내가 보인다.
- codex(`-c model_reasoning_effort=low`)를 띄웠다. 상태는 시작 중 → 준비(herdr idle, 약 8초) → 내 차례(herdr blocked)였다. codex가 "Folder access … Trust this folder? 1. Trust and continue 2. Quit"을 띄웠다. 저장소 루트(`c:\workspace\multitask`)에 신뢰를 저장한다는 대화상자라 수락하지 않았다.
- 승인 카드는 "codex가 묻는다"와 화면 끝, "터미널에서 답하기" 단추만 있다. 판의 답하기 API는 `answer_in_terminal`("cx(codex)는 판이 키 순서를 모른다. 터미널에서 답한다")로 거부한다. 위쪽 내 차례 칩에는 "codex: 화면에서 답하기"가 떴다.
- 끄기: `esc`(막혀 있어서) → `ctrl+c` → codex 끝남 → 작업 공간 닫음. 끝난 종류는 정상 종료(판이 끄라고 함)다.
- codex로 턴을 돌리는 것(제출 확인, 마지막 답)은 하지 못했다. 그 부분은 단위 시험(제출 확인은 herdr `working`, 마지막 답은 화면 끝)과 판에 올린 Claude Code(`helper`, `helper2`, 같은 경로)로만 확인했다. 사용자 점검표 7절 1번.

#### 4. 에이전트끼리 오간 지시를 알아채는 방법

PLAN 4절 F1의 후보 셋을 같은 사건("a가 b에게 Reply with exactly: pong")으로 비교했다(`f1-compare.txt`).

| 후보 | 이번에 얻은 것 | 누가 | 누구에게 | 무엇을 | 받는 쪽 상태 | 답 | 한계 |
|---|---|---|---|---|---|---|---|
| 1. Claude Code hook의 셸 명령 글 | `PreToolUse(Bash)`의 `herdr agent prompt b "Reply with exactly: pong" --wait`, `PostToolUse`의 결과 JSON(`agent_prompted`, `agent_status: done`), `agent read`의 화면 글 | 됨(hook을 보낸 세션) | 됨(명령의 대상) | 됨(글 그대로) | 결과의 상태만 | 됨(`agent read` 결과) | 판이 띄운 Claude Code만. 명령 치환·변수로 쓴 글은 못 푼다 |
| 2. herdr 서버 로그 | `api request received … request_id="cli:agent:prompt" method="agent.prompt"`와 끝 줄 두 개. `agent.read`는 남지 않았다 | 안 됨 | 안 됨 | 안 됨 | 안 됨 | 안 됨 | 형식이 버전에 묶임. 요청 ID가 호출마다 같다(`cli:agent:prompt`) |
| 3. herdr 이벤트 | b의 `pane.agent_status_changed` idle → working → done, 새 패널과 에이전트(`pane.agent_detected`) | 안 됨(시각 맞추기로 추정만) | 됨(상태가 바뀐 쪽) | 안 됨 | 됨(실시간) | 안 됨 | 누가 시켰는지 모른다. 사람이 친 글과 구분하지 못한다 |

**고른 것: 1을 기준으로 하고 3을 붙인다. 2는 쓰지 않는다.**

- 선을 긋는 데 필요한 것(누가, 누구에게, 무엇을)을 모두 주는 것은 1뿐이다. hook은 이미 판이 띄우는 Claude Code에 붙어 있고(`--settings`), 추측이 없다. 명령 글은 hook이 먼저 200을 받은 뒤 백엔드에서 읽으므로 에이전트를 늦추지 않는다.
- 받는 쪽 상태(작업 중, 끝남, 내 차례)와 새로 나타난 에이전트(F3)는 3으로 본다. 받는 쪽도 판이 띄운 Claude Code면 그쪽 hook(`UserPromptSubmit`, `Stop`)으로 제출과 답을 확인한다.
- 2는 누가, 누구에게, 무엇을 중 어느 것도 주지 않는다. 버전에 묶인 형식이라 D3처럼 꼭 필요할 때만 쓴다.
- 1이 못 하는 것: 판이 띄우지 않은 에이전트나 Claude Code가 아닌 종류가 일을 시키면 선이 생기지 않는다. 받는 쪽의 상태 변화는 그대로 보인다(6절 1번).

#### 5. PLAN과 다르게 한 곳

1. **F1 알아채기를 정했다.** PLAN은 P4에서 정한다고 했다. 4절대로 hook + herdr 이벤트다.
2. **F3 끄기.** PLAN은 "D2와 같은 규칙"(작업 공간 닫기)이다. A가 자기 작업 공간을 나눠 띄운 에이전트는 A와 같은 작업 공간에 있다. 작업 공간째로 닫으면 A까지 닫히므로, 같은 작업 공간에 다른 패널이 있으면 그 패널만 닫는다. 판이 띄운 세션에도 같다(A가 패널을 나눴으면 A를 꺼도 B는 남는다). Claude Code가 아닌 종류는 `/exit` 대신 `ctrl+c`를 두 번 보낸다.
3. **F3 부모 맞추기.** PLAN은 선이 "A가 띄움"이라고만 했다. 띄운 명령(hook의 `agent start` 이름이나 패널, `pane split` 결과 패널)으로 맞추고, 없으면 같은 작업 공간의 판 세션을 부모로 본다. 판에 올린 에이전트는 그룹에 넣지 않는다.
4. **F4 알아내기.** PLAN의 후보 중 hook `cwd`와 git 조사를 쓴다. hook이 없는 세션은 herdr `pane.get`의 `foreground_cwd`를 15초마다 본다. herdr 작업 공간의 워크트리 묶음(`workspace.worktree`)은 쓰지 않았다. 같은 저장소 선은 워크트리 세션이 있을 때만, 워크트리 세션마다 하나(이어진 세션, 없으면 가장 늦게 만든 본 저장소 쪽 세션)로 긋는다. 모든 개발용 세션이 multitask 저장소 안이라 선을 모두 그으면 판이 선으로 덮이기 때문이다.
5. **F5 제출 확인과 마지막 답.** hook이 없는 세션은 보낸 뒤 herdr `working`이면 제출 확인으로 친다. 마지막 답은 턴이 끝날 때 화면(`pane.read recent_unwrapped`)에서 고른다(`answerSource: screen`).
6. **더한 것: "herdr 명령 자동 승인".** 새 세션 대화상자의 선택이고 기본은 꺼짐이다. 켜면 세션 설정 파일에 `Bash(herdr:*)`, `Bash(herdr *)`, `PowerShell(herdr *)`, `Bash(test:*)`, `Bash(printf:*)`, `Bash(echo:*)`만 넣는다. 에이전트끼리 일을 시킬 때마다 사람이 승인해야 하는 수를 줄인다. Claude Code는 `${HERDR_ENV:-}`나 `$PWD` 같은 셸 확장이 든 명령은 규칙과 상관없이 묻는다(F2, F3 시험에서 한 번씩 물음).
7. **더한 것: 짧은 안내 글(`--append-system-prompt-file`).** "herdr 패널 안에서 돈다, 일을 시키라면 herdr 스킬로, --session·--machine·--remote를 붙이지 않는다, [multitask 판] 글은 판의 연결 알림이다" 네 줄이다. 지시가 허용한 방법이다.
8. **F2 알림 글의 모양과 끊을 때 알리는 것(PLAN 8절 열린 결정).** 3.4절의 글로 정했다. 끊으면 끊겼다고 알리고, 이어 가기나 `pane move`로 받는 쪽 패널 ID가 바뀌면 시킨 쪽에 새 패널을 알린다.

#### 6. 확인하지 않은 것과 알려진 문제

1. **판이 띄우지 않은 에이전트나 Claude Code가 아닌 종류가 일을 시키면 선이 생기지 않는다.** hook이 없기 때문이다. 받는 쪽이 판에 있으면 상태 변화는 보인다. 붙이려면 그 에이전트를 띄우는 쪽이 판의 설정 파일을 써야 한다(PLAN 8절 열린 결정, 그대로 열어 둠).
2. **에이전트가 띄운 에이전트는 판의 설정을 받지 않는다.** hook, herdr 스킬 플러그인, 권한 모드가 없다. 시험의 `helper`, `helper2`는 사용자의 기본 권한 모드로 떠 "auto mode on"이었다. 그 하네스의 규칙(사용자 설정)을 따른 결과다.
3. **codex 턴을 돌리지 않았다.** 신뢰 대화상자를 수락하지 않았기 때문이다. 제출 확인(herdr working), 마지막 답(화면), 실행 승인 카드는 codex에서 보지 못했다.
4. **패널 ID가 바뀔 때의 연결 갱신 알림은 시험하지 않았다.** herdr를 다시 띄우는 시험은 사용자 세션 `s1`이 있는 개발용 서버를 끄게 되어 하지 않았다(8번). 판에 올린 에이전트가 herdr 재시작 뒤 어떻게 되는지도 보지 않았다. 판은 그런 세션을 되살리지 않고 herdr의 이어 가기에 맡긴다.
5. **화면에서 읽은 답은 추정이다.** `agent read` 결과와 hook이 없는 세션의 마지막 답은 화면 글이다. Claude Code 화면은 입력칸 위, 마지막 사용자 줄 뒤를 고른다. 모르는 화면은 끝 20줄이다.
6. **D3 창 시험을 다시 돌리지 않았다.** 그 시험은 판 전용 세션에 herdr 화면을 붙인다. 이번 개발용 세션에는 사용자 세션 `s1`이 있어 그 패널 크기까지 바뀔 수 있다. D3 코드는 바꾸지 않았고 단위 시험은 통과한다.
7. **명령 글 해석의 한계.** `$(cat file)` 같은 명령 치환, 변수에 담은 대상, 스크립트 파일 안의 herdr 호출은 풀지 못한다. 대상이 아직 판에 없으면 120초 동안 기다렸다가 그 에이전트가 판에 오르면 잇는다.
8. **창이 띄운 백엔드와 Playwright.** 창이 백엔드를 띄우면 백엔드가 Electron 출력 파이프 핸들을 물려받아 Playwright의 `app.close()`가 끝나지 않는다(창은 닫힌다). 시험 도구에 `closeApp`(8초 기다림)을 두었고, F2의 다시 띄우기 시험은 백엔드를 mtask로 끄고 켰다. 실제 사용과는 상관없다.
9. **선 위 글은 노드 위에 그린다.** 노드 사이 틈이 40px라 글이 노드 가장자리 몇 칸을 덮을 수 있다.
10. **종류 목록은 처음 한 번 1초쯤 걸린다**(`where.exe` 24번). 그 전에 연 대화상자에는 claude만 보인다(`p4-f2.txt` 첫 대화상자).
11. **시험 중 실수 하나.** herdr `pane.split`의 인자 이름을 `pane_id`로 잘못 써서 herdr가 초점 패널, 곧 사용자 세션 `s1`의 탭(w1)을 나눴다(07:29). 만든 빈 셸 패널 w1:p2를 바로 닫았다. `s1`에는 입력을 보내지 않았고, 패널 폭만 잠깐 바뀌었다가 돌아왔다. 그 뒤로는 `target_pane_id`를 썼다.
12. **codex 설정 파일.** codex를 띄운 시각(17:10, 한국 시각)에 `~/.codex/config.toml`의 수정 시각이 바뀌었다. 이 저장소의 신뢰 항목은 생기지 않았다. 사용자 환경의 opencodex가 codex를 띄울 때 설정을 다시 쓰는 것으로 보이지만 확인하지 않았다.
13. **정리.** 띄운 시험 세션(`a`, `b`, `helper`, `helper2`, `lead`, `rev`, `wt`, `cx`)은 판으로 모두 껐고, 창과 개발용 백엔드를 껐다. **개발용 herdr 서버는 끄지 않았다.** 그 안에 이 작업 전 07:15에 사용자가 개발용 창에서 띄운 세션 `s1`(opus, "test")이 있다. 서버를 끄면 `s1`의 claude도 끝나므로 기존 세션 규칙에 따라 두었다. 같은 이유로 herdr 세션 `multitask-dev`도 지우지 않았다. 새로 만든 herdr 세션은 없다. 지금 서버에는 `s1`의 작업 공간 하나만 있다.

#### 7. 사용자가 손으로 해 볼 것

1. **codex 턴.** 판에서 codex를 띄우고, 터미널에서 직접 신뢰를 정한 뒤(사용자의 결정), 명령 바로 `@cx Reply with exactly: ok`를 보낸다. 확인할 것: 전달이 "제출 확인"이 되는가(이유 herdr working), 끝나면 노드의 마지막 답에 `ok`가 보이는가, codex가 실행 승인을 물을 때 카드가 화면 끝과 "터미널에서 답하기"만 보이는가.
2. **손으로 잇기.** 노드 가장자리의 점을 끌어 다른 노드에 놓고 역할을 적는다. 선 위 글을 눌러 기록을 보고, 끊는다. A에게 간 알림 글이 읽기 좋은지, A가 그 뒤 "○○에게 맡겨"를 알아듣는지 본다.
3. **에이전트가 띄운 노드.** A에게 "herdr로 옆에 claude를 하나 띄워"라고 한다. 새 노드가 A 옆에 생기는지, 그 노드 터미널에서 입력이 되는지, 그 노드의 권한 요청 카드가 "터미널에서 답하기"로 가는지 본다.
4. **패널 ID가 바뀔 때.** 역할을 정한 뒤 위쪽에서 herdr를 다시 띄우거나 B의 패널을 다른 작업 공간으로 옮긴다(`herdr pane move`). A에게 "연결 갱신" 알림이 가는지 본다.
5. **하네스의 워크트리 기능.** Claude Code의 워크트리 기능(`EnterWorktree`, `claude --worktree`)으로 들어간 세션이 판에 워크트리로 보이는지 본다. 이번 시험은 에이전트가 `git worktree add`와 `cd`로 한 것이다. Claude Code의 기능은 저장소 루트의 `.claude/worktrees/`에 `mtask-test/`가 아닌 이름의 브랜치를 만들어 지시의 규칙상 시험하지 않았다.
6. **D3 경고.** 판 전용 세션에 herdr 화면을 붙였을 때 위쪽 경고가 그대로 뜨는지 본다.
7. **남은 개발용 세션 `s1`.** 필요 없으면 개발용 창에서 `s1`을 끄거나 `node backend/bin/mtask.mjs --dev herdr stop --yes`로 개발용 herdr 서버를 끈다.

#### 8. PLAN, BRIEF, CLAUDE.md에서 바꿀 것

이번 작업에서는 세 문서를 고치지 않았다. 아래를 제안한다.

**`docs/BRIEF.md`**

- 3절 "정한 것"에 더할 줄
  - 알아채기: 에이전트끼리 오간 지시는 판이 띄운 Claude Code의 hook 셸 명령 글로 알아채고, 받는 쪽 상태와 새 에이전트는 herdr 이벤트로 본다. herdr 서버 로그는 쓰지 않는다(P4).
  - herdr 스킬: 판이 띄우는 claude에 `--plugin-dir`(스킬 글은 `herdr --skill`)과 짧은 안내(`--append-system-prompt-file`)를 넘긴다. 사용자 설정과 `~/.agents/skills`는 고치지 않는다(P4).
  - 판에 올린 에이전트: 판 전용 세션에 나타난 에이전트는 판에 올리고 부모와 잇는다. hook이 없어 상태는 herdr로만 보고, 승인 카드는 "터미널에서 답하기"로 보낸다. 끄면 그 패널만 닫는다(P4).
  - 연결: 순서 있는 쌍마다 연결 하나를 SQLite에 둔다. 판에서 이으면 A에게 B의 herdr 이름, 패널, 역할을 알리고, 끊으면 끊겼다고 알린다(P4).
- 5절 "그다음(P4)"을 "P4에서 한 것"으로 바꾸고 `docs/P4.md`를 가리킨다. codex 턴은 사용자 확인 대기로 적는다.
- 7절 열린 질문 "판이 어떻게 알아챌지"를 닫는다(위 알아채기).
- 8절 참고 문서에 `docs/P4.md`를 더한다.

**`docs/PLAN.md`**

- 0절 순서: P4(끝남, `docs/P4.md`).
- 4절 F1 백엔드: 알아채는 방법을 정한 것으로 바꾼다. F2: 알림 글, 끊김 알림, 패널 ID 갱신 알림. F3: 부모 맞추기(hook 명령, 없으면 같은 작업 공간), 같은 작업 공간이면 그 패널만 닫기, 같은 탭 제어기는 다투지 않음(헤드리스 서버). F4: hook `cwd` + git `--git-common-dir`, hook이 없으면 `foreground_cwd`, 같은 저장소 선은 워크트리마다 하나. F5: 제출 확인은 herdr `working`, 마지막 답은 화면, 끄기는 `ctrl+c` 두 번.
- 5절 모듈 표: "연결"을 `backend/src/links.mjs`와 백엔드로, 단계 P4(끝남). E1·E3 줄은 "P4에서 뺌(끝남)".
- 6절 API: `session.spawn`의 `kind`·`args`·`allowHerdr`, `agent.kinds`, `link.list`·`link.create`·`link.delete`·`link.log`, 이벤트 `link.*`. `desktop.list`, `other.herdr`, `board.setExtra`는 뺐다고 적는다.
- 7절 P4: "끝났다"와 결과 요약, 사용자 확인 대기(codex 턴).
- 8절 열린 결정: "알아챌지"와 "F2 알림 글의 모양"은 닫는다. "판이 띄우지 않은 에이전트에도 hook을 붙일지"는 그대로 연다. 새로: 에이전트가 띄운 에이전트에 판의 설정(hook, 스킬, 권한 모드)을 물려줄지.
- 9.1절: 읽기 전용 카드 줄을 지우고, 연결선 줄에 선 종류(역할, 시킴, 띄움, 같은 저장소)를 적는다.

**`CLAUDE.md`**

- "창 시험은 데스크톱 앱 세션 카드를 가린 채(`MTASK_REDACT=1`) 한다" 줄은 지운다. 카드와 `MTASK_REDACT`가 없어졌다.
- 첫 문단에 P4(세션끼리 연결, `docs/P4.md`)를 더한다.
- 더할 규칙 제안: "시험 에이전트가 부르는 herdr 명령에 `--session`·`--machine`을 쓰게 하지 않는다. 패널의 herdr는 판 전용 세션에 붙는다." "herdr 소켓 API의 `pane.split`은 `target_pane_id`로 대상을 준다. 빼면 초점 패널(사용자 세션일 수 있다)을 나눈다."

### 지휘 세션의 합치기 기록(옛 `docs/PLAN.md` 7절)

끝났다(2026-10-30). 결과와 증거는 `docs/P4.md`, 스크린숏과 로그는 `experiments/p4/`, 작업 지시는 `docs/briefs/P4.md`에 있다. 아래 완료 기준과 지시의 "herdr 스킬을 쓸 수 있게"를 실제 claude(haiku) 세션으로 해 보았다. F5는 종류 고르기, 상태, 카드, 끄기까지 됐고, codex로 턴을 돌리는 것은 codex의 저장소 신뢰 대화상자를 수락하지 않아 하지 못했다. codex 턴은 따로 검증하지 않기로 했다(2026-10-30 사용자 결정). 손으로 잇기, 패널 ID가 바뀔 때의 알림, Claude Code 워크트리 기능, D3 경고는 사람이 확인한다(`docs/P4.md` 7절).
