상태: 닫힘
날짜: 2026-11-04

## 지시

### 목표

같은 폴더가 판에서 영역 둘로 갈라지지 않게 한다. 사용자가 실제 판에서 워크트리를 시험하다 저장소 영역이 둘로 나뉘었다("결국에 만들긴 했는데 저장소 섹션이 나뉘어짐").

사용자의 스크린숏에 보인 것은 다음과 같다.
- 오른쪽 영역 `C:/WORKSPACE/ATRIUM-TEST 4 · 폴더`: 리드 세션 s12와 워커 w1~w3이 있다. 머리글은 "폴더"인데, 노드에는 `⎇ master`가 보인다.
- 왼쪽 영역 `C:/WORKSPACE/ATRIUM-TEST 1`: 노란 워크트리 상자 `⎇ wt1 (atrium-test-wt1)` 안에 워커 wt1 하나가 있다.

그때 생긴 일의 순서다.
1. 사용자가 git 저장소가 아닌 `C:\Workspace\atrium-test`를 판에서 열고 세션 넷을 띄웠다. 그 뒤 그 폴더는 git 저장소가 됐다(커밋 없음).
2. 리드 세션이 빈 커밋을 만들었다. 그다음 `git worktree add`로 판 밖 형제 폴더 `C:/Workspace/atrium-test-wt1`(브랜치 `wt1`)을 만들고, 거기서 워커를 띄웠다.

짐작하는 원인은 다음과 같다.
- 워크스페이스 키(`workspaces.mjs`)는 폴더면 폴더 경로이고, 저장소면 `.git` 공통 폴더 경로다. 세션의 키는 시작할 때 한 번 정한다.
- 그래서 앞의 넷은 폴더 키(`c:/workspace/atrium-test`)에 남고, 워크트리 워커는 저장소 키(`c:/workspace/atrium-test/.git`)로 새 영역을 만든 것으로 보인다.
- 사실인지 확인한다.

### 할 것

1. **재현.** 개발용 판에서 위 순서를 그대로 재현하고 스크린숏을 남긴다. 순서는 이렇다: git이 아닌 새 폴더를 열고 셸 세션을 띄운다 → `git init` → (커밋 없음, 그다음 커밋 하나) → 같은 폴더에서 새 세션 → `git worktree add`로 형제 폴더 워크트리 → 그 워크트리에서 세션. `.claude/worktrees/<이름>` 같은 저장소 안 워크트리도 본다.
2. **합치기.** 판이 아는 폴더 워크스페이스가 git 저장소(또는 저장소 안 폴더)가 되면, 그 폴더 워크스페이스를 저장소 워크스페이스로 옮긴다.
   - 옮길 것: 세션의 워크스페이스 키, 영역 자리와 이름표, 대화 노드, 메모, 칸반, 덩어리, 워크트리 상자, 잠들기·깨우기 상태, 그 밖에 워크스페이스 키를 쥔 것 전부.
   - 이미 저장소 영역이 따로 생겼으면 하나로 합친다. 노드 자리는 되도록 그대로 두고, 합친 영역이 감싸도록 하며, 겹치면 지금의 겹침 풀기 규칙을 쓴다.
   - 언제 알아챌지(새 세션을 띄울 때, hook이나 주기적인 git 조사 때, 영역을 그릴 때)는 네가 정하되, 사람이 아무것도 하지 않아도 몇 초 안에 하나로 보이게 한다.
   - 머리글의 종류 표시("폴더" → 저장소)도 맞게 바뀐다.
   - 반대로 `.git`을 지워 저장소가 폴더가 되는 경우는 갈라지지 않게만 하고, 그 밖의 동작은 네가 정해 보고에 적는다.
3. **이미 갈라진 판 고치기.** 실제 판에는 지금 위처럼 갈라진 영역이 있다. 백엔드가 켜질 때, 같은 폴더를 가리키는 폴더 키와 저장소 키가 함께 있으면 한 번 합친다. 여러 번 돌려도 같다. 실제 판에서는 시험하지 않는다. 개발용 판에 갈라진 상태를 만들어 확인한다.
4. **판 밖 형제 폴더 워크트리.** `git worktree add ../x`로 만든 워크트리도 본 저장소 영역 안의 노란 상자로 보이는지 확인한다(P35 규칙). 안 되면 고친다.

### 완료 기준

1. 폴더 → 저장소 판단, 키 옮기기, 이미 갈라진 키 합치기는 순수 함수로 두고 단위 시험한다. 합치기는 여러 번 돌려도 같은지 시험한다.
2. 개발용 판의 창 시험(e2e)으로 확인하고 스크린숏을 남긴다.
   - 할 것 1의 순서 끝에 영역이 하나다. 앞의 세션, 뒤의 세션, 형제 폴더 워크트리 상자가 한 저장소 영역 안에 있다.
   - 메모 하나와 대화 노드 하나가 합친 뒤에도 그 영역 안에 있다.
   - 갈라진 상태로 백엔드를 다시 켜면 하나로 합쳐진다.
   - 앞의 세션을 다시 띄워도(이어 가기) 합친 영역에 남는다.
3. `cd backend && npm test`, `cd app && npm test`, `cd app && npm run build`가 통과한다.

### 시험 환경

- 너만의 개발용 판으로 띄운다(`docs/testing.md`).
  - `ATRIUM_HERDR_SESSION=atrium-dev-p37`, `ATRIUM_PORT=47855`
  - `ATRIUM_DATA_DIR=<워크트리>/backend/.dev/data`, `ATRIUM_APP_USERDATA=<워크트리>/backend/.dev/app`
- 실제 판(`atrium`, 47800)과 47811~47854, 47856은 쓰지 않는다.
- 대화 목록은 시험 폴더의 대화만 읽는다(`ATRIUM_CLAUDE_PROJECTS`, `ATRIUM_CLAUDE_DESKTOP=none`). 시험 폴더는 `C:\Workspace\mtask-p37-*`처럼 새로 만든다. 사용자의 `C:\Workspace\atrium-test`와 `atrium-test-wt1`은 읽지도 고치지도 않는다.
- 세션은 셸 노드로 시험한다. claude가 꼭 필요하면 `--model haiku`, 턴은 짧게.
- 끝나면 시험 세션, 창, 백엔드, herdr 서버와 세션, 시험 폴더(워크트리는 `git worktree remove` 뒤), 시험 대화 기록을 끄고 지운다.

### 지킬 것

- `CLAUDE.md`를 따른다. 프로세스는 직접 띄운 것만 PID로 끈다.
- 같은 때 두 작업자가 돈다.
  - P36(하위 세션 상한 없애기, 스킬, 워크트리 하위 세션 신뢰)은 `branch.mjs`, `settings.mjs`, `launch.mjs`, `bin/atrium*.mjs`, `Branch.jsx`, `Settings.jsx`를 고친다.
  - P38(터미널 고르기·복사)은 `TerminalView.jsx`, `lib/term-input.js`, 터미널 쪽 `Canvas.jsx`를 고친다.
  - 너는 그 파일을 되도록 건드리지 않는다. 화면 글은 `locales/en.js`·`ko.js` 끝에 더한다.
- 자기 브랜치에만 커밋한다. 커밋 메시지에 `Co-Authored-By` 줄을 넣지 않는다. `main`을 바꾸거나 푸시하지 않는다. `node_modules`는 워크트리 안에서 받는다(`npm ci`).
- `docs/ARCH.md`, `docs/BRIEF.md`는 고치지 않는다. 고쳐야 할 ARCH 행(4절 G, H1, 모듈 표)과 BRIEF "워크스페이스" 행 새 문장은 보고 절에 적는다. 문서는 이 작업 파일의 작업 기록 절과 보고 절만 고친다.
- 끝나면 보고 절을 쓰고, 맨 마지막에 `<워크트리>/backend/.dev/p37.done`(브랜치 이름과 마지막 커밋 해시 두 줄)을 만든다.

### 읽을 파일

- `CLAUDE.md`, `docs/testing.md`, `docs/ARCH.md` 4절 G·H1, 7.1
- `docs/log/p27-worktree-areas.md`, `docs/log/p35-worktree-inside.md` 보고 절
- `backend/src/workspaces.mjs`, `git.mjs`, `worktrees.mjs`, `worktree-areas.mjs`, `store.mjs`(workspaces, docks, sessions.workspace_key), `store-recall.mjs`, `store-records.mjs`, `store-worktrees.mjs`, `canvas-ops.mjs`, `backend.mjs`(워크스페이스를 정하는 곳)
- `app/src/renderer/Regions.jsx`

## 작업 기록

- 2026-11-04: 지시와 읽을 파일을 읽었다. 워크스페이스 키를 쥔 곳을 찾았다.
  - 표: `sessions`(닫힌 행 포함), `docks`, `memos`, `kanbans`, `convo_nodes`, `worktree_areas`, `workspaces`
  - meta: `currentWorkspace`, `autoOpenDeclined`, `arrangeUndo:<키>`
  - 메모리: `b.sessions[*].workspaceKey`, 잠재우기의 `busyAt`, 대화 목록의 `wsCache`(10분 기억)와 `views`
- 순수 함수 `workspace-merge.mjs`, 저장소 메서드 `store-merge.mjs`, 판 위 동작 `workspace-merge-ops.mjs`를 만들었다. `ensureWorkspace`, 뜰 때, `worktrees.mjs sync`에 붙였다. 단위 시험 10개를 더했다(`backend/test/p37.test.mjs`).
- 재현: 고치기 전 코드(`0ada984`의 `backend/src`를 작업 폴더에 잠시 꺼냄)로 창 시험 `repro`를 돌려 영역이 둘로 갈라지는 것을 보았다. 새 코드로 되돌린 뒤, 그 갈라진 판으로 `fix`를 돌리고 처음부터 `flow`를 돌렸다.
- 정리: 시험 셸을 끄고 백엔드와 herdr 서버를 멈췄다. herdr 세션 `atrium-dev-p37`을 지웠다. 워크트리 둘은 `git worktree remove`로 지운 뒤 시험 폴더 셋(`C:\Workspace\mtask-p37-a`, `-a-wt1`, `-b`)을 지웠다. `backend/.dev`의 시험 판, 창 프로필, 시험 대화 기록도 지웠다.

## 보고

### 원인(확인함)

짐작이 맞았다. 세션의 워크스페이스 키는 띄울 때 한 번 정하고, 폴더 키와 저장소 키는 서로 다른 문자열이다. 고치기 전 코드로 재현하면 다음처럼 갈라진다(`experiments/p37/p37-repro.txt`).

| 세션 | 띄운 때 | 키 |
|---|---|---|
| s1, s2 | git이 아닐 때, 폴더 `mtask-p37-a` | `c:/workspace/mtask-p37-a`(폴더) |
| s3 | git init과 커밋 뒤, 같은 폴더 | `c:/workspace/mtask-p37-a/.git`(저장소) |
| w1 | 형제 폴더 워크트리 `mtask-p37-a-wt1` | `c:/workspace/mtask-p37-a/.git`(저장소) |

같은 폴더에서 띄운 세션도 git init 뒤라면 저장소 영역으로 간다. 그래서 형제 폴더 워크트리가 아니어도 갈라진다. 사용자 판에서 폴더 영역 노드에 `⎇ master`가 보인 것은 노드의 git 조사(`s.git`)가 띄운 뒤에도 바뀌기 때문이다. 머리글의 종류는 워크스페이스 줄의 것이라 "폴더"로 남았다.

### 만든 것

1. **순수 함수**(`backend/src/workspace-merge.mjs`)
   - `twinWorkspace(rows, ws)`: 띄울 때 새로 만들 워크스페이스와 같은 폴더를 가리키는 다른 키의 줄을 고른다. git을 다시 부르지 않는다.
   - `planWorkspaceMerges(rows, probes)`: 다시 본 결과로 옮길 것을 고른다. 경우는 셋이다.
     - `repo`: 폴더가 저장소가 되었거나 저장소 안 폴더가 되었다.
     - `folder`: 저장소의 `.git`이 없어졌다.
     - `split`: 폴더를 다시 보지 못했지만, 폴더 키가 어떤 저장소의 본 폴더와 같다.
   - `mergedWorkspaceRow`, `rekeyBoard`(판 상태 모형), `rekeyKey`, `rekeyList`
2. **키 옮기기**(`backend/src/store-merge.mjs` `rekeyWorkspace`): 한 트랜잭션에서 옮긴다. from 줄이 없으면 null을 돌려주므로 여러 번 불러도 같다.
   - 옮기는 것: 세션 행(닫힌 세션도), 덩어리, 메모, 칸반, 대화 노드의 `workspace_key`, 워크트리 상자 자리, meta. 노드 자리와 `area`는 그대로 둔다.
   - 대상 줄이 없으면 옛 줄의 자리, 순서, 뷰포트로 새 줄을 만든다. 있으면 합친다. 자리는 대상 줄 것이고, 순서는 먼저 생긴 쪽이다. `auto`는 둘 다 저절로 열었을 때만 남는다.
3. **판 위 동작**(`backend/src/workspace-merge-ops.mjs`): `mergeWorkspace`가 표를 옮긴 뒤 판 상태도 맞춘다.
   - 메모리의 세션 키, `busyAt`, 대화 목록 기억(`wsCache`, `views`)을 맞춘다.
   - 겹침 풀기(`settleRegions`)를 돌리고, 판 이벤트 `workspace_merged`를 남긴다.
   - 창에 세션, 워크스페이스, `board.changed`를 알리고 워크트리 목록을 다시 읽는다(`kick`).
   - 본 저장소 쪽이 비어 있던 저장소 영역(워크트리 상자만 있음)에 폴더 쪽 것이 들어오면, 상자를 들어온 것의 오른쪽이나 아래로 다시 놓는다. 이때 P35의 `migrateBoxes`를 쓰고, 이를 위해 `canvas-ops.mjs`의 `reslotBoxes`로 뽑았다. 사용자 판처럼 상자가 왼쪽 멀리 남지 않는다.
4. **알아채는 때**
   - **띄울 때**(`backend.mjs ensureWorkspace`): 새 저장소 워크스페이스의 본 폴더가 폴더 워크스페이스로 열려 있으면, 새 줄을 만들지 않고 그 줄을 저장소 키로 옮긴다. 새 세션은 처음부터 그 영역 안 빈자리에 놓이고, 형제 폴더 워크트리 세션은 그 영역 안의 노란 상자에 놓인다. 띄우기, 받아들이기(adopt), 다시 열기, 가져오기, "+ 리포 열기", 리포 스스로 찾기가 모두 이 길을 지난다.
   - **주기적으로**(`worktrees.mjs sync`): 폴더 워크스페이스마다 그 폴더를 `workspaceOf`로 다시 본다. 10초 틱, 세션 git이 바뀔 때(`kick`), 뜰 때 돈다. 새 세션 없이 `git init`만 해도 6.3초 만에 머리글이 저장소로 바뀌었다. 저장소 안 폴더(부모 폴더가 저장소가 됨)도 이때 합친다.
   - **뜰 때 한 번**(`backend.mjs start`, `migrateDocks` 뒤, 겹침 풀기 앞): 같은 폴더를 가리키는 폴더 키와 저장소 키가 함께 있으면 합친다. 표시(meta)를 두지 않고 매번 돌린다. 옮길 것이 없으면 아무것도 하지 않는다.
5. **반대 경우(`.git`을 지워 저장소가 폴더가 됨)**: 본 폴더가 남아 있고 `.git`이 없으며 git도 저장소가 아니라고 할 때만, 저장소 워크스페이스를 폴더 키로 옮긴다. 워크트리 상자 자리는 지우고, 상자 안 노드는 자리 그대로 본 영역에 남는다. 띄울 때도 같은 규칙이다. `.git`이 남아 있는데 git 조사만 잠깐 실패하면 옮기지 않는다. 폴더가 아예 없어진 저장소도 그대로 둔다.
6. **판 밖 형제 폴더 워크트리**(할 것 4): P35 규칙대로 본 저장소 영역 안의 노란 상자로 보인다. 저장소 안 `.claude/worktrees/feat-x`도 같다. 고친 것은 없다.

### 완료 기준 1: 순수 함수와 단위 시험

`backend/test/p37.test.mjs` 10개:

- 띄울 때 판단
- 다시 보기 판단(폴더 → 저장소, 저장소 안 폴더, 저장소 → 폴더, 이미 갈라짐, 엇갈림, 고친 뒤 다시 돌리면 [])
- 키 옮기기 모형(여러 번 돌려도 같음)
- 합친 줄
- board.db 옮기기(다시 부르면 null)
- 이미 갈라진 판 합치기(노드 자리 그대로, 상자·메모·대화 노드가 리포 영역 안, 겹침 없음, 다시 돌리고 sync해도 바뀌지 않음)
- 같은 board.db를 다시 켜기
- 띄울 때 옮기기와 형제 워크트리 상자
- 주기적 다시 보기(git init만)
- 저장소 → 폴더

### 완료 기준 2: 창 시험(`app/test/e2e/p37-merge.mjs`, 판 `atrium-dev-p37`/47855)

| 단계 | 확인한 것 | 결과 | 스크린숏 |
|---|---|---|---|
| repro(고치기 전 코드) | 폴더 열기, 셸 둘, 메모, 대화 노드 → git init → 커밋 → 같은 폴더 셸 → 형제 폴더 워크트리 셸. 폴더 영역(s1, s2)과 저장소 영역(s3, w1 상자)으로 갈라짐 | 2/2 | `p37-repro-1-folder`, `p37-repro-2-split` |
| fix(그 갈라진 판으로 새 코드 다시 켜기) | 폴더 키가 없어지고 모든 세션이 저장소 키. 한 영역 안에 앞의 세션, 뒤의 세션, 형제 폴더 워크트리 상자, 메모, 대화 노드가 있고 머리글은 저장소. 워크트리 셸은 상자 안. 영역은 둘(합친 저장소, 다른 폴더). 앞의 세션 s1을 닫았다 다시 열면 합친 영역의 같은 자리(`place: last`). 한 번 더 켜도 자리가 그대로 | 6/6 | `p37-fix-3-merged`, `p37-fix-4-reopened` |
| flow(새 코드, 처음부터) | git init만 하고 6.3초 뒤 저장소 영역이 됨(머리글의 "폴더"가 빠짐, 메모·대화 노드도 안). 끝에 영역 하나: s1~s3, 형제 폴더 워크트리 상자(w1), 저장소 안 워크트리 상자(x1), 메모, 대화 노드. 워크트리 셸은 각자 상자 안 | 6/6 | `p37-flow-1-folder`, `p37-flow-2-git-init`, `p37-flow-3-one-region` |

스크린숏과 로그는 `experiments/p37/`에 있다. 시험 도구는 `experiments/p37/tools/`(env.cjs, e2e.cjs, mt.cjs)에 있다.

### 완료 기준 3: 시험과 빌드

| 시험 | 결과 |
|---|---|
| 백엔드 `npm test` | 312/312(P37 10개 포함) |
| 창 `npm test`, `npm run build` | 87/87, 빌드 됨 |

### 계획과 다른 곳, 범위 밖 수정

- 창 코드와 화면 글(`locales`)은 고치지 않았다. 창은 이미 오는 `session`, `workspace.updated`, `board.changed`로 다시 그린다. 머리글의 종류도 워크스페이스 줄을 따라 바뀐다.
- `canvas-ops.mjs`: `migrateBoxesInside`의 리포 하나 몫을 `reslotBoxes`로 뽑았다. 동작은 그대로다.
- P36·P38 파일(`branch.mjs`, `settings.mjs`, `launch.mjs`, `bin/atrium*.mjs`, `Branch.jsx`, `Settings.jsx`, `TerminalView.jsx`, `lib/term-input.js`, `Canvas.jsx`)은 건드리지 않았다.
- `backend.mjs`: import 한 줄, 뜰 때 한 줄, `ensureWorkspace` 한 줄, 메서드 `reconcileWorkspaces` 한 줄을 더했다.
- 재현은 고치기 전 코드를 작업 폴더에 잠시 꺼내 돌렸다(커밋하지 않음). 이 덕분에 `fix` 단계는 손으로 만든 갈라진 판이 아니라 실제로 갈라진 판으로 시험했다.

### 남은 것과 주의

1. 이미 갈라진 두 영역이 멀리 떨어져 있으면, 합친 영역이 그 사이 빈 곳까지 감싼다. 노드 자리를 지키라는 지시를 따른 것이다(`p37-fix-3-merged`에서 왼쪽 s1·s2·메모와 오른쪽 s3·상자 사이). 사이에 다른 영역이 있으면 겹침 풀기가 그 영역을 민다. 모으려면 사람이 "정리"를 누른다.
2. 실제 판은 이 브랜치를 합친 뒤 백엔드를 다시 켜야 고쳐진다. 사용자 판의 `atrium-test`(폴더, 세션 넷)와 `atrium-test/.git`(워크트리 상자만)은 하나의 저장소 영역이 되고, 순서는 폴더 쪽 자리를 따른다. 상자 `wt1`은 폴더 쪽 노드의 오른쪽이나 아래로 옮겨진다. 실제 판에서는 시험하지 않았다.
3. 띄울 때 바로 옮기는 것은 본 폴더 자체가 열려 있을 때뿐이다. 저장소 안 하위 폴더가 따로 폴더 워크스페이스로 열려 있으면 다음 다시 보기(10초 안)에 합친다. 그 사이에 띄운 세션은 새 영역에 잠깐 놓였다가, 합친 뒤 그 자리에서 리포 영역의 일부가 된다.
4. 폴더 워크스페이스마다 10초에 한 번 `git rev-parse`를 부른다. 폴더 워크스페이스가 많은 판이면 비용이 늘어난다.

### 고쳐야 할 ARCH 행(제안)

- **4절 G1 끝에 더할 문장**: "판이 연 폴더가 나중에 git 저장소(또는 저장소 안 폴더)가 되면 그 폴더 워크스페이스를 저장소 키로 옮긴다. 세션 행, 덩어리, 메모, 칸반, 대화 노드, 워크트리 상자, 영역 자리, meta를 옮기고 노드 자리는 그대로 둔다. 저장소 워크스페이스가 이미 있으면 합친다. 띄울 때(본 폴더가 폴더 워크스페이스로 열려 있으면 새 줄 대신 옮김), 주기적인 다시 보기(`worktrees.mjs sync`), 뜰 때 알아챈다. 본 폴더에서 `.git`이 없어지면 반대로 폴더 키로 옮기고 워크트리 상자는 지운다(`workspace-merge.mjs`, `workspace-merge-ops.mjs`, 표 옮기기 `store-merge.mjs`)."
- **H1 끝에 더할 문장**: "두 영역이 한 워크스페이스로 합쳐지면(G1) 노드 자리는 그대로 두고 합친 영역이 모두 감싼다. 겹치면 겹침 풀기 규칙을 쓴다. 본 저장소 쪽이 비어 있던 리포 영역의 워크트리 상자는 들어온 것의 오른쪽이나 아래로 다시 놓는다."
- **모듈 표 "워크스페이스" 행**: "4절 G1. 워크스페이스 키, 목록과 세는 값, 옛 판 옮기기, 폴더 ↔ 저장소 합치기(`workspaces.mjs`(창도 같이 씀), `migrate.mjs`, `git.mjs`의 `workspaceOf`, `workspace-merge.mjs`, `workspace-merge-ops.mjs`, `store-merge.mjs`)"

### BRIEF "워크스페이스" 행 새 문장(제안)

"워크스페이스" 행의 "…git이 아닌 폴더는 그 폴더다." 뒤에 다음 문장을 넣는다.

> 판에 연 폴더가 나중에 git 저장소가 되어도 영역은 하나로 남는다. 그 폴더 워크스페이스를 저장소 워크스페이스로 옮기고, 노드 자리는 그대로 둔다(2026-11-04 사용자 보고, P37).

이 행은 결정을 바꾸지 않고 덧붙이는 것이므로 `decisions.md`로 옮길 옛 문장은 없다.
