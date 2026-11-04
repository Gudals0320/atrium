상태: 닫힘
날짜: 2026-11-04

## 지시

### 목표

판이 띄운 에이전트가 워커(하위 세션)를 상한 없이, 스스로 판단해 자유롭게 부리게 한다. 워크트리 하위 세션은 사람이 판 밖 터미널을 열지 않고 판 위에서 끝나게 한다. 사용자의 말은 다음과 같다.
- "하위 세션 수 최대 4개인데 이 제한 없애줘. 이 작업만 해도 worker 30개 넘게 운용 중. tree 단계 수 제한도 없애고."
- "atrium-herdr 같은 스킬 하나 만들까? worker 호출 등.. 작업 할때.. 자유롭게.. 그런느낌."

실제 판에서 생긴 일(사용자가 붙인 대화 요약):
1. 사용자가 시험 폴더 `C:\Workspace\atrium-test`의 세션에 "워크트리 하나 파고 거기에 worker 하나 배정하고 아무 작업이나 시켜봐"라고 했다.
2. 에이전트가 커밋이 없어 빈 커밋을 만든 뒤 `atrium child wt1 --worktree wt1`을 쳤고, `needs_trust`로 거부됐다.
3. 에이전트는 사용자에게 "새 터미널을 열고 그 폴더에서 claude를 띄워 신뢰하라"고 했다. 사용자는 "뭔소리임?", "너도 claude code야 임마"라고 답했다.
4. 에이전트는 직접 `git worktree add`로 판 밖 형제 폴더 `C:/Workspace/atrium-test-wt1`을 만들고 `--cwd`로 워커를 띄웠다. 그 워커는 신뢰 질문에서 멈췄고, 에이전트가 사람에게 노드에서 답해 달라고 했다.
5. 짐작: 그 폴더는 git 저장소가 되기 전에 부모 폴더의 신뢰로 열렸고, 지금 `predictTrust`는 git 최상위에서 신뢰 찾기를 멈춘다(`launch.mjs`). 사실인지 확인한다.

### 할 것

1. **상한 없애기(K3).**
   - 세션 하나의 하위 세션 수, 나무 깊이, 판 전체 하위 세션 수 상한을 모두 없앤다. 대상은 `checkLimits`, `too_many_children`, `too_deep`, `board_full`, 설정 `branchMaxChildren`·`branchMaxDepth`·`branchMaxTotal`, ⚙의 그 칸(`Branch.jsx`, `Settings.jsx`), `atrium children`과 `atrium` CLI의 상한 출력, 스킬과 짧은 안내의 상한 문장, 화면 글이다.
   - 저장된 설정에 옛 키가 남아 있어도 오류 없이 무시한다.
   - 고리 막기(`depthOf`의 max 같은 것)는 둔다.
   - 하위 세션 30개 이상, 깊이 6단계 이상에서 자리(`childSlot`, 빈자리 규칙)와 미션 맵이 겹치지 않고 읽히는지 본다. 깨지면 고친다.
2. **스킬을 넓힌다.**
   - 지금 플러그인 `atrium-herdr`의 `delegate` 스킬은 사용자가 "워커를 불러"라고 할 때만 쓰이고, 워크트리·모델·종류는 "사용자가 말한 경우에만"이다.
   - 이것을 판에서 일하는 법 전체를 담은 스킬로 다시 쓴다. 이름은 `atrium`(플러그인 안에서 `atrium-herdr:atrium`)으로 한다. 이미 돌고 있는 세션이 옛 이름 `delegate`를 불러도 새 스킬로 이어지게 한다.
   - 담을 것:
     - **쓰는 때.** 사용자가 워커, 하위 세션, 병렬, 워크트리를 말할 때. 그리고 일이 서로 기다리지 않는 조각 여럿으로 나뉠 때, 사용자가 말하지 않아도 에이전트가 판단해 쓴다.
     - **워크트리 흐름.** 코드를 고치는 조각마다 `--worktree`를 쓰고, 워커는 자기 브랜치에만 커밋하고, 부모가 합친다. 손으로 `git worktree add`를 하거나 판 밖 형제 폴더를 만들지 않는다.
     - **지시 쓰는 법.** 목표, 할 것, 완료 기준, 끝났음을 알리는 법.
     - **모아 보고 합치는 법.** 기다리기(`--wait`), 답 읽기, 모아 보고, 합치기.
     - **모델과 노력 수준.** 조각에 맞게 고른다. `atrium child`에 `--effort`가 없으면 더한다. 기본은 지금처럼 부모 것을 물려받는다.
     - **신뢰 질문.** 사람에게 하는 말은 한 문장이다. 예: "판에서 @wt1 노드의 신뢰 질문에 답해 주세요." 판 밖 터미널을 열라고 하지 않는다.
     - **지금 규칙.** 한 줄 명령, `$변수`·파이프 금지, 끝난 워커는 두기, 끄기는 사람이 말할 때만, 권한 질문은 대신 답하지 않기.
   - `launch.mjs`의 짧은 안내 문장도 맞춘다. 스킬 글은 짧고 분명하게 쓴다(사람이 아니라 에이전트가 읽는다). 길이는 지금 `delegate`의 두 배를 넘지 않는다.
3. **워크트리 하위 세션의 신뢰 흐름.**
   - 위 짐작을 확인한다. 신뢰 받은 부모 폴더 아래의 git 저장소와 git이 아닌 폴더를 견준다. 신뢰가 없는 저장소에서 `claude -w <이름>`이 무엇을 하는지(신뢰 질문을 띄우고 워크트리를 만드는지, 그냥 끝나는지)도 본다. 실험은 새로 만든 시험 폴더와 새로 띄운 `claude`로만 하고, 신뢰 질문에는 답하지 않는다. 결과는 작업 기록에 적는다.
   - 그 결과로, 사람이 판 위에서 한 번 답하면 워크트리 하위 세션이 만들어지는 흐름을 만든다.
     - `claude -w`가 신뢰 질문을 띄운다면, 미리 거부하지 말고 하위 세션을 띄운 채 `needs_trust` 상태와 사람에게 할 한 문장을 돌려준다.
     - 그렇지 않다면 네가 길을 정하고 까닭을 보고에 적는다.
   - 하위 세션이 신뢰 질문에 멈춰 있는 동안 `--prompt`의 첫 지시나 `herdr agent prompt`의 글이 신뢰 질문에 입력되면 안 된다. 그 글은 신뢰를 받은 뒤 들어가거나, 분명한 오류로 돌아와야 한다. 신뢰는 사람만 준다.
   - 커밋이 하나도 없는 저장소의 `--worktree`는 무엇이 필요한지 한 문장으로 알려 준다. 판이나 명령이 빈 커밋을 대신 만들지는 않는다.

### 완료 기준

1. 상한이 없어진 것, 이름 짓기, 30개 이상 형제의 자리, 깊이 6단계 이상, 옛 설정 키 무시, 신뢰 판단과 응답 모양을 단위 시험한다.
2. 개발용 판에서 확인하고 스크린숏을 남긴다.
   - 한 세션이 하위 세션 5개 이상, 깊이 4단계 이상을 만든다(종류는 가벼운 것으로 한다. claude가 꼭 필요하면 `--model haiku`).
   - ⚙에 상한 칸이 없다.
   - 판에 뜬 claude 세션이 새 스킬을 목록에서 보이고, 짧은 질문("워커 둘에게 나눠 시켜 봐")에 스킬대로 움직인다.
   - 신뢰 없는 시험 저장소에서 `atrium child x --worktree x`의 응답과 노드 상태가 위 흐름대로다. 신뢰 질문에는 답하지 않는다.
3. `cd backend && npm test`, `cd app && npm test`, `cd app && npm run build`가 통과한다. 이 작업 때문에 깨지는 옛 시험(`p8` 상한 등)은 새 동작에 맞게 고친다.

### 시험 환경

- 너만의 개발용 판으로 띄운다(`docs/testing.md`).
  - `ATRIUM_HERDR_SESSION=atrium-dev-p36`, `ATRIUM_PORT=47854`
  - `ATRIUM_DATA_DIR=<워크트리>/backend/.dev/data`, `ATRIUM_APP_USERDATA=<워크트리>/backend/.dev/app`
- 실제 판(`atrium`, 47800)과 47811~47853, 47855, 47856은 쓰지 않는다.
- 대화 목록은 시험 폴더의 대화만 읽는다(`ATRIUM_CLAUDE_PROJECTS`, `ATRIUM_CLAUDE_DESKTOP=none`). 시험 폴더는 `C:\Workspace\mtask-p36-*`처럼 새로 만든다. 사용자의 `C:\Workspace\atrium-test`와 그 형제 폴더는 건드리지 않는다.
- `~/.claude.json`은 읽기만 한다.
- 끝나면 시험 세션, 창, 백엔드, herdr 서버와 세션, 시험 폴더(워크트리는 `git worktree remove` 뒤), 시험 대화 기록을 끄고 지운다.

### 지킬 것

- `CLAUDE.md`를 따른다. 신뢰 대화상자는 대신 수락하지 않는다. 프로세스는 직접 띄운 것만 PID로 끈다.
- 같은 때 두 작업자가 돈다.
  - P37(폴더가 저장소가 되면 영역 합치기)은 `workspaces.mjs`, `git.mjs`, 워크스페이스 키를 저장·옮기는 곳, `worktree-areas.mjs`를 고친다.
  - P38(터미널 고르기·복사)은 `TerminalView.jsx`, `lib/term-input.js`, 터미널 쪽 `Canvas.jsx`를 고친다.
  - 너는 그 파일을 되도록 건드리지 않는다. 화면 글은 `locales/en.js`·`ko.js` 끝에 더하거나, 지우는 키만 지운다.
- 자기 브랜치에만 커밋한다. 커밋 메시지에 `Co-Authored-By` 줄을 넣지 않는다. `main`을 바꾸거나 푸시하지 않는다. `node_modules`는 워크트리 안에서 받는다(`npm ci`).
- `docs/ARCH.md`, `docs/BRIEF.md`는 고치지 않는다. 고쳐야 할 ARCH 행(4절 K, K3, API·설정 표, 모듈 표)과 BRIEF 행은 보고 절에 새 문장으로 적는다. 문서는 이 작업 파일의 작업 기록 절과 보고 절만 고친다.
- 끝나면 보고 절을 쓰고, 맨 마지막에 `<워크트리>/backend/.dev/p36.done`(브랜치 이름과 마지막 커밋 해시 두 줄)을 만든다.

### 읽을 파일

- `CLAUDE.md`, `docs/testing.md`, `docs/ARCH.md` 4절 K
- `docs/log/p8-branch.md` 보고 절(신뢰 판단 `needs_trust`의 경위)
- `backend/src/branch.mjs`(checkLimits, delegateSkill, childSlot, child), `backend/bin/atrium-child.mjs`, `backend/bin/atrium.mjs`, `backend/src/settings.mjs`, `backend/src/launch.mjs`(predictTrust, writeBoardPlugin, 짧은 안내)
- `app/src/renderer/Branch.jsx`, `Settings.jsx`, `lib/mission-layout.js`

## 작업 기록

2026-11-04, P36 작업자 세션(워크트리 `p36`, 브랜치 `worktree-p36`). 처음 상태: 백엔드·창 시험 통과(옛 수), `npm ci`는 워크트리 안에서.

- 개발용 판 `atrium-dev-p36`(47854, `backend/.dev/data`)을 띄우고, 시험 폴더 `C:\Workspace\mtask-p36-{plain,repo,empty,gate,lead}`를 새로 만들었다. 감싸개는 `experiments/p36/tools/`(`env.cjs`, `mt.cjs`, `e2e.cjs`, 판 세션의 env로 하위 세션 명령을 부르는 `as.cjs`).
- 신뢰 실험(Claude Code 2.1.318, 셸 노드에서 `claude --model haiku`를 직접 침. 신뢰 질문은 Esc로만 나갔고 수락하지 않음). `C:/Workspace`는 신뢰됨, 시험 폴더는 자기 항목이 없거나 `false`.

  | 실험 | 폴더 | 결과 |
  |---|---|---|
  | A | 커밋 있는 저장소 `mtask-p36-repo`, `claude -w x` | 신뢰 질문 없이 `Error creating worktree: Workspace trust not yet accepted. Run claude once in this directory and accept the trust dialog, then retry with --worktree.`로 바로 끝남. 워크트리 안 생김 |
  | B | 같은 저장소, `claude` | 신뢰 질문이 뜸(상위 `C:/Workspace`의 신뢰를 물려받지 않음) |
  | C | git 아닌 `mtask-p36-plain`, `claude` → `/exit` → `git init` → `claude` → 빈 커밋 → `claude` | 처음 질문 없음(항목 `false`가 생김). `git init` 뒤에도 질문 없음. 첫 커밋 뒤에는 질문이 뜸 |
  | D | 커밋 없는 저장소 `mtask-p36-empty`, `claude -w x` | A와 같은 오류로 바로 끝남 |
  | E | 신뢰된 폴더 `mtask-p36-gate`, `claude --session-id <같은 값>` → `/exit`(지시 없음) → 같은 값으로 다시 | 첫 지시 전에는 대화 기록 파일이 없고, 같은 세션 ID로 다시 띄워도 된다 |

  - 짐작 확인: 신뢰는 **커밋이 있는** git 저장소의 루트에서 멈춘다. 사용자의 일(폴더를 신뢰 받은 뒤 git 저장소로 만들고 빈 커밋)은 C와 같다. 커밋을 만든 순간부터 그 폴더의 신뢰가 사라진 것처럼 보이고, `-w`는 거부된다.
  - `claude -w`는 신뢰 질문을 띄우지 않는다(A, D). 그래서 지시의 "그렇지 않다면" 갈래로, 길을 정했다(보고 "정한 것" 1).
  - `herdr agent prompt`는 막힌(blocked) 에이전트에 `agent_blocked`로 글을 넣지 않는다(`herdr agent prompt --help`, 실제로 확인).
- 상한 없애기, 스킬, 신뢰 관문, `child-wait`, `--effort`를 만들고 단위 시험을 고치거나 더했다. 중간 커밋 `f0a83c3`.
- Git Bash에서 `atrium input <이름> "/exit\r"`은 MSYS 경로 바꾸기로 `C:/Program Files/Git/exit`가 되어 실험 claude에 지시로 들어갔다(한 번). `MSYS_NO_PATHCONV=1`로 고쳐 보냈다. 판 코드와는 상관없다.
- 개발용 판 확인(스크린숏 `experiments/p36/`), 창 시험 7/7. 정리까지 끝냈다.

## 보고

### 만든 것

1. **상한 없애기(K3)**
   - `branch.mjs`: `checkLimits`, `refuse`, `limits()`, 판 API `branch.limits`, 응답의 `maxChildren`·`maxTotal`·`maxDepth`를 지웠다. `counts`는 `{ children, total }`이다. 고리 막기(`depthOf`의 `max`, `isDescendant`의 `seen`)와 `not_parent`는 그대로다.
   - `settings.mjs`: `branchMaxChildren`, `branchMaxDepth`, `branchMaxTotal`을 지웠다. 판 기록에 남은 옛 값은 `get`·`describe`가 보이지 않고, 다른 키를 바꿀 때 오류가 없다. `settings set branchMax…`는 이제 `모르는 설정`이다.
   - 창: ⚙의 "가지 펼치기" 탭과 `BranchSettings`를 지웠다(`Branch.jsx`, `Settings.jsx`). 사전에서 상한 글(`branch.refusedCode`의 세 코드, `saved`, `settingError`, `settingsTitle`, `settingsHelp`, `key`, `range`, `settings.tab.branch`)을 지웠다.
   - CLI: `atrium tree` 첫 줄은 "하위 세션 n개(상한 없음)", `atrium child`·`children`의 끝 줄은 "너의 하위 세션 n개, 판 전체 m개(상한 없음)"이다.
   - 자리(`childSlot`): 열의 칸 수를 `max(옛 값, ⌈√(형제 수+1)⌉)`로, 열 수를 6에서 64로 늘렸다. 옛 규칙은 형제 24개(부모 460 높이면 4칸×6열) 뒤로 나무 밖 빈자리로 갔다. 이제 32개가 부모 오른쪽 6×6 안에 겹치지 않고 놓인다. 미션 맵(`mission-layout.js`)은 형제마다 한 줄, 단계마다 한 열이라 고칠 것이 없었다(32개·8단계 시험 통과).
2. **스킬 `atrium`(`atrium-herdr:atrium`)**
   - `boardSkill(name)`: 쓰는 때(사용자가 말하지 않아도 서로 기다리지 않는 조각이면), 순서(`atrium child <이름> --prompt`, 코드 조각은 `--worktree`, 손 `git worktree add`·판 밖 형제 폴더 금지, 모델·노력 수준 고르기), 지시 쓰는 법(목표, 할 것, 손대지 말 것, 완료 기준, 끝났음을 알리는 법), 기다리기·답 읽기·모아 보고·합치기(`git merge worktree-<이름>`), 신뢰 질문(한 문장, `atrium child-wait`, `needs_commit`), 지금 규칙을 담았다. 4,773바이트(P8 `delegate` 글 3,107바이트의 두 배 6,214 안).
   - 옛 이름: `skills/delegate/SKILL.md`에 같은 몸글을 `name: delegate`로 쓴다. 돌던 세션은 시작 때 본 목록에 `atrium`이 없어서, 옛 이름을 부르면 새 글을 읽게 하려는 것이다.
   - 짧은 안내(`BOARD_SYSTEM_PROMPT`) 한 줄을 바꿨다: 조각으로 나뉘거나 워커·하위 세션·병렬·워크트리를 들으면 atrium 스킬(옛 이름 delegate)대로 `atrium child`로 맡긴다. 수와 깊이에 상한은 없다.
3. **`atrium child --effort <노력>`**: `EFFORTS`(low~max) 가운데 하나다. 빼면 지금처럼 부모 것을 물려받는다(`branch.inherited.effort`).
4. **워크트리 하위 세션의 신뢰 관문**
   - 커밋이 없는 저장소의 `--worktree`는 띄우지 않고 `needs_commit`: "이 저장소(…)에 커밋이 하나도 없어 워크트리를 만들 수 없다. 첫 커밋이 있어야 한다(판은 대신 만들지 않는다)".
   - 신뢰를 받지 않은 저장소의 `--worktree`는 미리 거부하지 않는다. `-w` 없이 그 저장소에서 claude를 띄우고(신뢰 질문이 노드에 뜸), 하위 세션 기록에 `gate: 'trust'`를 둔다. 응답은 `status: 'needs_trust'`, `needsTrust: true`, `tellHuman: "판에서 @x 노드의 신뢰 질문에 답해 주세요."`, `gate: 'trust'`, `next.wait: "atrium child-wait x"`이다.
   - 관문 동안 판의 전달(`--prompt` 첫 지시)은 `deliveryView`가 `starting`으로 보아 멈춘다. `herdr agent prompt`는 신뢰 질문(blocked) 동안 herdr가 `agent_blocked`로 거부한다.
   - 사람이 답해 ready(또는 working·waiting)가 되면 `passGate`: `~/.claude.json`에 신뢰가 쓰이기를 5초까지 기다림 → (working이면 Esc) → `/exit` → 같은 패널에서 같은 세션 ID로 `claude --session-id … --worktree <이름> …` → 하위 세션 기록의 `gate`를 지움(판 이벤트 `trust_gate_passed`) → 이어 가기 등록 → 멈춰 둔 첫 지시가 나간다. 그 짧은 틈에 herdr로 직접 들어간 지시(UserPromptSubmit)가 있으면 다시 띄운 뒤 판 대기열로 다시 보낸다.
   - `atrium child-wait <이름>`(`POST /branch/wait`, 승인 규칙에 더함): 자기 자손이 관문을 지나 ready가 될 때까지 한 번에 100초 기다린다. 아직 신뢰 질문이면 `needs_trust`와 같은 한 문장, 끝났으면(거절 등) 그 상태를 돌려준다.
   - 세션 요약 `branch.gate`, `atrium children`의 줄("신뢰 질문(사람이 답한다)", "워크트리로 다시 띄울 차례")에도 보인다.
5. **신뢰 예상**(`predictTrust`): 저장소 루트에서 멈추는 것은 커밋이 있는 저장소일 때만이다(실험 C). `gitTop`, `repoHasCommit`을 `launch.mjs`에 두었다(P37이 고치는 `git.mjs`를 피했다).

### 정한 것과 까닭

1. **`-w`가 신뢰 질문을 띄우지 않으므로 신뢰 관문으로 간다.** 그 저장소에서 `-w` 없는 claude를 먼저 띄우는 것은 Claude Code 오류 글이 시키는 방법("Run claude once in this directory and accept the trust dialog, then retry with --worktree")을 판이 한 노드 안에서 대신 해 주는 것이다. 신뢰는 사람이 노드에서 답한다. 같은 세션 ID로 다시 띄울 수 있는 것은 실험 E로 확인했다(첫 지시 전에는 대화 기록이 없다). 다른 길(사람에게 판 밖에서 claude를 띄우게 하기, 판이 신뢰를 쓰기)은 지시와 `CLAUDE.md`에 어긋난다.
2. **관문 동안 하위 세션의 herdr 이름은 그대로 둔다.** 신뢰 질문 동안은 herdr가 `agent_blocked`로 막아 주고, 그 오류가 이름 바꾸기("agent not found")보다 분명하다. 수락과 다시 띄우기 사이의 짧은 틈은 들어간 지시를 다시 보내는 것으로 막았다. 스킬과 응답은 그동안 `atrium child-wait`를 쓰라고 한다.
3. **`child-wait`를 더했다.** 관문 동안 `herdr agent wait`는 관문 claude가 idle이 되는 순간(다시 띄우기 전) 끝나 버린다. 판이 관문을 아는 기다리기가 필요했다.
4. **옛 이름 `delegate`는 같은 글의 두 번째 스킬이다.** 새 세션의 목록에는 둘 다 보이지만, `delegate`의 설명이 "atrium 스킬의 옛 이름(내용이 같다)"이라 어느 것을 불러도 같다.

### 완료 기준 1: 단위 시험

- 백엔드 `backend/test/p8.test.mjs`(고침과 더함): 상한 검사 없음, 옛 설정 키 무시(`get`·`describe`에 없음, 다른 키 저장 됨, 옛 키 `set`은 `모르는 설정`), 32형제와 8단계 나무(거부 없음, 옛 설정이 판 기록에 있어도), 32형제 자리(모두 부모 오른쪽, 겹침 없음, 8×8 안), 이름 짓기(옛 시험 그대로), 스킬 글(두 이름, 같은 몸글, 담을 것, 길이), 짧은 안내, 승인 규칙의 `child-wait`, `--effort`, `needs_commit`(커밋을 만들지 않음), 신뢰 관문 응답 모양(`needs_trust`, 한 문장, `child-wait`, 전달 멈춤), 관문 지나기(가짜 herdr: 신뢰 질문에는 아무것도 안 보냄, ready면 `/exit` 뒤 같은 패널·같은 세션 ID로 `--worktree`, 두 번 와도 한 번, 틈에 들어간 지시 다시 보냄, `child-wait`의 needs_trust → ready, 남의 세션은 `not_parent`), 신뢰 예상(git 아님 / 커밋 없음 / 커밋 있음).
- 창 `app/test/p36-lib.test.mjs`(새): 미션 맵 32형제·8단계 겹침 없음, 단계마다 한 열, 부모는 자식 가운데. 사전에 상한 글 없음. `p28-lib`의 설정 탭 수를 다섯으로 고침.

### 완료 기준 2: 개발용 판

판 `atrium-dev-p36`(47854). 창 시험 `node experiments/p36/tools/e2e.cjs p36-board.mjs` **7/7**(`experiments/p36/p36-board.json`).

| 확인 | 결과 | 기록 |
|---|---|---|
| 하위 세션 5개 이상, 깊이 4단계 이상 | lead(haiku, 노력 low)의 env로 `atrium child`를 불러 하위 세션 6개(w1~w6), 사슬 w1 → g3 → g4 → g5(5단계, g5는 `--effort medium`). 거부 없음. 나중에 lead가 만든 둘을 더해 lead 아래 9개(+x) | `p36-1-tree-canvas.png`, `p36-tree-children.txt` |
| 캔버스·미션 맵 | 세션 노드 겹침 없음, 하위 세션은 부모 오른쪽, 머리줄 "@lead's 워커 · level 2"…"level 5". 미션 맵 상자 11개 겹침 없음 | `p36-1-tree-canvas.png`, `p36-3-mission-map.png` |
| ⚙에 상한 칸 없음 | 탭 general, launchers, sleep, recall | `p36-4-settings-no-limits.png` |
| 스킬 | lead에게 "워커 둘에게 나눠 시켜 봐. 하나는 1+1, 하나는 2+2…"를 보냄. lead가 `Skill atrium-herdr:atrium`을 부르고, `atrium child … --prompt`를 한 응답에 둘 냈다. 이름 w1·w2가 이미 있어 `name_taken`을 받고 다른 이름으로 다시 만들었다. 그 뒤 `herdr agent wait`, `herdr agent read`로 2와 4를 모아 보고하고 워커를 끄지 않았다 | `p36-skill-lead-messages.txt` |
| 신뢰 관문 | 커밋 있는 신뢰 안 된 저장소에서 `atrium child x --cwd C:/Workspace/mtask-p36-repo --worktree x --prompt "Reply with exactly: hi"` → `needs_trust`, "판에서 @x 노드의 신뢰 질문에 답해 주세요.", `atrium child-wait x`. 노드는 trust_wait("New folder: trust check"), 첫 지시는 `queued (starting)`, 화면은 신뢰 질문 그대로(글이 들어가지 않음). `herdr agent prompt x …`는 `agent_blocked`. `atrium child-wait x`는 100초 뒤 같은 한 문장. 신뢰 질문에는 답하지 않았다 | `p36-2-trust-gate-node.png`, `p36-trust-gate-x-events.txt` |
| 커밋 없는 저장소 | `atrium child y --cwd C:/Workspace/mtask-p36-empty --worktree y` → `needs_commit` 한 문장, 노드 안 생김 | 작업 기록 |

### 완료 기준 3: 시험과 빌드

| 시험 | 결과 |
|---|---|
| 백엔드 `npm test` | 304/304 |
| 창 `npm test`, `npm run build` | 89/89, 빌드 됨 |
| 고친 옛 시험 | `p8.test.mjs`(상한 셋, 스킬, 설정, needs_trust, 모르는 명령 글), `p28-lib.test.mjs`(설정 탭), 창 시험 `e2e/p8-k4.mjs`(상한 칸 대신 탭이 없는지) |

### 확인하지 못한 것과 알려진 문제

- **사람이 수락한 뒤 실제로 `claude -w`가 워크트리를 만들고 첫 지시가 들어가는 것**은 신뢰를 대신 누를 수 없어 실제 판에서 보지 못했다. 다시 띄우는 순서는 가짜 herdr 단위 시험으로, 같은 세션 ID로 다시 띄우기는 실험 E로 확인했다. 사용자 점검: 신뢰 안 된 시험 저장소(커밋 하나)에서 판 세션에게 "워크트리 하나 파고 워커에게 아무 일이나 시켜"라고 하고, 노드에서 "Yes, I trust this folder"를 고르면 같은 노드가 `.claude/worktrees/<이름>`에서 다시 뜨고 첫 지시를 받는지 본다.
- 관문에서 기다리는 첫 지시도 판 대기열의 최대 대기(`deliveryMaxWaitMs`, 15분)를 따른다. 사람이 그보다 늦게 답하면 첫 지시는 `failed(timeout)`가 되고 하위 세션은 워크트리에서 빈 채로 뜬다. 부모는 `atrium child-wait` 뒤 다시 시키면 된다.
- 틈에 들어간 지시를 다시 보낼 때는 그 지시로 관문 claude에 대화 기록이 생긴 뒤다. 같은 세션 ID로 `-w`를 다시 띄울 수 있는지(기록이 다른 프로젝트 폴더에 있다)는 확인하지 못했다. 그 경우 노드가 exited로 보인다.
- 워크트리 하위 세션을 판이 다시 띄우는 다른 길(`relaunchIfEmpty`, herdr 복구의 새로 띄우기)은 `launchOf`에 워크트리가 없어 `-w` 없이 뜬다(P8부터 그대로, PLAN의 "워크트리 하위 세션의 이어 가기").
- 사전의 `top.settings`("Settings (tray, branching)", "설정(트레이 상주, 가지 펼치기)")에 옛 탭 이름이 남았다. 지시가 화면 글은 더하거나 지우기만 하라고 해서 고치지 않았다.
- 판 이름은 판 전체에서 하나라 스킬대로 `w1`, `w2`를 고르면 `name_taken`이 날 수 있다(시험에서 한 번, lead가 스스로 다른 이름으로 다시 함).
- `~/.claude.json`에 시험 폴더 항목(`C:/Workspace/mtask-p36-plain`, `-lead`, `-gate` 등, 모두 `hasTrustDialogAccepted: false`)이 Claude Code가 쓴 채 남았다. 읽기만 하라는 규칙대로 지우지 않았다.

### 고쳐야 할 ARCH·BRIEF 행(새 문장)

- **ARCH 4절 K1** 끝 문장: "`--cwd`가 다른 폴더면 그 워크스페이스에, `--worktree`면 `claude -w <이름>`으로 띄운다. 커밋이 없는 저장소는 `needs_commit`으로 띄우지 않는다. 신뢰를 받지 않은 저장소는 먼저 `-w` 없이 띄워 신뢰 질문을 노드에 보이고(응답 `needs_trust`와 사람에게 할 한 문장), 사람이 답해 ready가 되면 같은 패널·같은 세션 ID로 `claude -w`를 다시 띄운다. 그동안 판의 전달은 멈춘다. `--model`, `--effort`는 물려받기를 덮고, `--kind`는 F5처럼 다룬다."
- **ARCH 4절 K2**: "일 맡기기 스킬은 판에서 일하는 법 전체를 담은 `atrium-herdr:atrium`(옛 이름 `delegate`, 같은 글)이다. 사용자가 워커·하위 세션·병렬·워크트리를 말할 때와, 일이 서로 기다리지 않는 조각으로 나뉠 때 세션이 스스로 쓴다. 순서는 만들기(`--prompt`, 코드 조각은 `--worktree`) → `herdr agent wait`(관문이면 `atrium child-wait`) → `herdr agent read` → 모아 보고·합치기다." 승인 규칙 문장에 `atrium child-wait`를 더한다.
- **ARCH 4절 K3**: 제목을 "끄기와 고리"로. "하위 세션 수, 깊이, 판 전체 수에 상한이 없다(P36). 에이전트는 자기 자손만 끌 수 있고(아니면 `not_parent`) 끄면 자손까지 깊은 것부터 끈다. 부모 관계의 고리는 깊이 계산이 끊는다. 하위 세션은 새 세션 ID로 띄운다."
- **ARCH 4절 K4**에 한 문장: "형제가 많으면 열의 칸 수를 √(형제 수)까지 늘려 부모 오른쪽에 격자로 쌓는다."
- **ARCH I7**: "설정(`settings`)은 트레이 상주, 보관(J), 호출자(F6), 잠재우기 시간이다." (가지 펼치기 상한을 뺀다.)
- **ARCH 4절 F 문단**(플러그인): "플러그인에는 herdr 스킬, 판에서 일하는 법 스킬(`atrium`, 옛 이름 `delegate`, K2), 하위 세션 명령 `bin/atrium`과 별칭 `bin/mtask`(K1)가 있다. 짧은 안내는 … 일을 조각으로 나누거나 워커를 들으면 atrium 스킬로 `atrium child`를 쓴다는 것(상한 없음)을 알린다."
- **ARCH API 표**: `POST /branch/child` 받는 것에 `effort`, 주는 것에 `status`, `needsTrust`, `tellHuman`, `gate`, `effort`를 더하고 `counts`는 `{ children, total }`. 거부 코드에서 `too_many_children`, `too_deep`, `board_full`, `needs_trust`를 빼고 `needs_commit`을 더한다. 새 행 `POST /branch/wait | { name } → { name, state, status, needsTrust, tellHuman, gated, timeout, next, … }`. 판 API `branch.tree`는 `{ total, rows }`, `branch.limits`는 지운다. 세션 요약 `branch`에 `gate`.
- **ARCH 설정 표**: `branchMaxChildren`, `branchMaxDepth`, `branchMaxTotal` 행을 지운다.
- **ARCH 모듈 표**: 가지 펼치기 행에 "신뢰 관문(`passGate`), `atrium child-wait`"를 더한다. 하위 세션 명령 행에 `child-wait`.
- **BRIEF "정한 것" 가지 펼치기 행**: "판이 띄운 세션은 판의 명령(`atrium child`)으로 하위 세션을 만든다. 하위 세션은 판이 띄운 정식 세션이고 부모의 모델, 노력 수준, 권한 모드를 물려받으며(조각에 맞게 바꿀 수 있다), 부모와 역할 선으로 이어져 오른쪽에 놓인다. 하위 세션도 같은 명령을 써서 나무처럼 펼쳐진다. 수와 깊이에 상한은 없고, 세션은 일이 조각으로 나뉘면 스스로 워커를 쓴다(atrium 스킬). 코드 조각은 워크트리 하위 세션으로 하고, 신뢰가 필요하면 사람이 그 노드에서 한 번 답한다. 이 명령과 `herdr agent prompt|wait|read`는 묻지 않고 돈다. 자기 자손만 끈다(2026-10-31 P8, 2026-11-04 P36)." 까닭 칸에 "한 작업에 워커 30개 넘게 쓴다(사용자, P36). 신뢰 받지 않은 저장소에서 `claude -w`는 신뢰 질문 없이 끝나, 에이전트가 사람에게 판 밖 터미널을 열라고 했다"를 더한다. 옛 문장(하위 4개, 깊이 3, 판 전체 16개)은 `decisions.md`로.

### 정리

- 시험 세션 14개(lead, w1~w6, g3~g5, calc-add11, calc-add22, x, 실험 셸 sha)를 `atrium kill`로 껐다. x는 신뢰 질문을 Esc로 닫았다(수락하지 않음).
- 백엔드를 `atrium backend stop`으로 멈추고, herdr 세션 `atrium-dev-p36`을 `herdr session stop`과 `delete`로 지웠다. 창은 창 시험이 닫았다. 47854에는 TIME_WAIT만 남았다.
- 시험 폴더 `C:\Workspace\mtask-p36-*` 다섯을 지웠다(워크트리는 만들어지지 않았다, `git worktree list`로 확인). 시험 대화 기록 `~/.claude/projects/C--Workspace-mtask-p36-lead`, `-plain`을 지웠다.
- 사용자의 `C:\Workspace\atrium-test`와 형제 폴더, 실제 판, 다른 작업자의 판, 기본 herdr 세션은 건드리지 않았다.
