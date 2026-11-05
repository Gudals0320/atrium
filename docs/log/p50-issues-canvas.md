상태: 열림
날짜: 2026-11-05

## 지시

### 목표

사용성 검증(ux1)이 올린 GitHub 이슈 가운데 캔버스 이슈 #2, #6를 재현하고 고친다. 사용자의 말: "열려 있는 이슈 보고 재현-수정을 맡겨."

맡은 이슈:
- **#2** Layout preset places the new group on top of another node and hides it (S2). 고른 두 노드에 배치 틀(예: 가로 2개)을 적용하면 새 창 그룹이 셋째 노드를 덮는다. 사용성 원칙 U1(새 것은 빈자리, 다른 노드를 가리지 않는다)에 어긋난다.
- **#6** UX polish: canvas (ux1) (S3), 체크리스트 셋:
  - 메모를 만든 직후 치면 메모가 또 생긴다(초점이 레일 단추에 남고 새 메모가 편집 상태가 아니다).
  - 전체 보기에서 만든 메모를 그 배율에서 고칠 수 없다(먼 얼굴이 ✎와 두 번 누르기를 숨긴다).
  - 빈 판에 첫 걸음 안내가 없다(+ 프로젝트 열기, 세션 띄우기).
  - 체크리스트 항목마다 고치고, 고치지 않기로 한 것은 까닭을 적는다.

고칠 곳(짐작): `app/src/renderer/Docks.jsx`, `backend/src/dock-tree.mjs`·`canvas-ops.mjs`(배치 틀 자리), `Memo.jsx`, `Chrome.jsx`의 메모 단추, `Canvas.jsx`(빈 판 안내)

### 할 일(이슈마다)

1. **읽기.** `gh issue view <번호> --repo Gudals0320/atrium`로 이슈 글(재현 단계, 측정값, 증거 그림 주소, 제안)을 읽는다. 사용성 검증 작업 파일 `docs/log/ux1-usability-audit.md` 보고 절과 재현 각본 `app/test/e2e/ux1-repro.mjs`(이슈별 사례)도 본다.
2. **재현.** 지금 `main`으로 띄운 개발용 판에서 이슈를 재현하고 결과를 작업 기록에 적는다. 이슈를 올린 뒤 다른 작업(P44~P46)이 합쳐졌으니, 재현되지 않으면 까닭을 확인하고 "이미 고쳐짐"으로 보고한다(억지로 고치지 않는다).
3. **원인과 수정.** 원인을 찾아 고친다. 이슈의 "Suggested direction"은 참고만 하고, 더 나은 방법이 있으면 그것을 쓰고 까닭을 적는다.
4. **시험.** 판단은 순수 함수로 두고 단위 시험을 더한다. 재현 각본의 그 사례(또는 새 창 시험)가 고친 뒤 통과하는 것을 보이고, 결과와 스크린숏을 `experiments/<작업 이름>/`(git 밖)에 남긴다.
5. **이슈 댓글 초안.** 이슈를 닫거나 댓글을 달지 않는다. 지휘 세션이 `main`에 합친 뒤 단다. 보고 절에 이슈마다 영어 댓글 초안(인사말 없이 2~4줄: 무엇이 원인이었고 무엇을 바꿨는지, 남은 것)을 적는다.

### 완료 기준

1. 맡은 이슈마다 재현(또는 이미 고쳐졌음), 원인, 수정, 시험 결과가 보고 절에 있다.
2. `cd backend && npm test`, `cd app && npm test`, `cd app && npm run build`가 통과한다.

### 시험 환경

- 너만의 개발용 판으로 띄운다(`docs/testing.md`).
  - `ATRIUM_HERDR_SESSION=atrium-dev-p50`, `ATRIUM_PORT=47869`
  - `ATRIUM_DATA_DIR=<워크트리>/backend/.dev/data`, `ATRIUM_APP_USERDATA=<워크트리>/backend/.dev/app`
- 실제 판(`atrium`, 47800)과 다른 포트(47811~47872 가운데 네 것 말고)는 쓰지 않는다.
- 대화 목록은 시험 폴더의 대화만 읽는다(`ATRIUM_CLAUDE_PROJECTS`, `ATRIUM_CLAUDE_DESKTOP=none`). 시험 폴더는 `C:\Workspace\mtask-p50-*`처럼 새로 만든다.
- 세션은 되도록 셸 노드로 시험한다. claude가 꼭 필요하면 `--model haiku`, 턴은 짧게.
- 끝나면 시험 세션, 창, 백엔드, herdr 서버와 세션(`atrium-dev-p50`만), 시험 폴더, 시험 대화 기록을 끄고 지운다.

### 지킬 것

- `CLAUDE.md`를 따른다. 프로세스는 직접 띄운 것만 PID로 끈다.
- 이 저장소는 공개다. 작업 기록, 시험 코드, 커밋 메시지, 댓글 초안에 사용자 경로·메일·토큰을 쓰지 않는다. 커밋 전·푸시 전 검사를 건너뛰지 않는다.
- 같은 때 다른 작업자들이 돈다. 맡은 이슈에 필요한 만큼만 작게 고치고, 남의 영역을 고쳤으면 보고에 적는다.
  - P49(원격 R3): P47·P48을 합치는 중이다. `relay.mjs`, `api.mjs`, `api.js`, `store.js`, 웹 화면(`web.js`, `web.mjs`), 짝 맺기, `SpawnDialog.jsx`의 폴더 찾아보기, `TerminalView.jsx`·`CommandBar.jsx`의 붙여넣기 업로드, 설정의 연결된 기기를 고친다.
  - P50(캔버스 #2·#6), P51(터미널 #3·#7), P52(크롬 #4·#5), P53(#8·#9·#10)
- 화면 글을 더할 때는 `locales/en.js`·`ko.js` 끝에 더한다(고치는 것은 그 자리). 한국어는 P39 말투(합니다체)와 용어를 따른다. `styles.css`에 더할 때는 끝에 더한다.
- 자기 브랜치에만 커밋한다. 커밋 메시지에 `Co-Authored-By` 줄을 넣지 않는다. `main`을 바꾸거나 푸시하지 않는다. `node_modules`는 워크트리 안에서 받는다(`npm ci`).
- 문서는 이 작업 파일의 작업 기록 절과 보고 절만 고친다. 고쳐야 할 ARCH 행이 있으면 새 문장을 보고 절에 짧게 적는다.
- 끝나면 보고 절을 쓰고, 맨 마지막에 `<워크트리>/backend/.dev/p50.done`(브랜치 이름과 마지막 커밋 해시 두 줄)을 만든다.

## 작업 기록

- 이슈 #2, #6 본문과 재현 각본(`app/test/e2e/ux1-repro.mjs`의 `presetOverlap`, `memoKeys`)을 읽었다. ux1 각본은 ux1 판 값(`atrium-dev-ux1`)에 묶여 있어서, 같은 사례를 옮기고 먼 얼굴 편집·빈 판 안내 사례를 더해 `app/test/e2e/p50-repro.mjs`를 따로 만들었다. 판 값은 git 밖 `experiments/p50/tools/env.cjs`에 있다(herdr 세션 `atrium-dev-p50`, 포트 47869, 시험 폴더 `C:\Workspace\mtask-p50-dir`, 대화 목록은 빈 고정 자료 폴더, 데스크톱 대화 `none`). 세션은 셸만 썼다.
- 재현(고치기 전 `main`과 같은 소스로 빌드, `--fresh`로 새 판): `experiments/p50/p50-before.json`
  - 첫 실행에서는 재현 각본의 전제가 지금 화면과 달라 사례가 제대로 돌지 않았다. (1) 넓은 창에서는 배치 틀이 막대에 바로 보이고 `layout-more`(▾)가 숨는다(P44~P46 이후). (2) 워크스페이스가 하나뿐인 판은 전체 보기 배율이 0.77이라 새 메모가 먼 얼굴이 되지 않는다. 그래서 ▾는 보일 때만 누르고, 메모 사례는 배율을 0.25로 줄여 ux1 때와 같은 상황(먼 얼굴)을 만들었다.
  - #2: 처음 자리는 `pa 40,112 / pb 800,112 / pc 40,612`였다(지금은 셋째 노드가 pa 아래에 놓인다). pa·pc를 "가로 2개"로 짜면 pc가 `760,112`로 가서 pb(800,112)를 덮었다. 화면 겹침은 657×444px이고, pb 가운데에 있는 요소는 그룹의 것이다. 재현됨.
  - #6 메모 키: 메모 단추를 누르면 초점이 `BUTTON[memo-new]`에 남고 편집 상태가 아니다. Space·Enter와 글 입력 뒤 메모가 4개였다. 재현됨.
  - #6 먼 얼굴 편집: 배율 0.25에서 먼 얼굴을 두 번 눌러도 편집이 열리지 않았다. 재현됨.
  - #6 빈 판: 안내가 없었다. 재현됨.
- 원인
  - #2: `dockLayout`(`backend/src/canvas-ops.mjs`)은 첫 노드의 왼쪽 위에서 틀 크기(칸마다 보통 노드 크기)로 바깥을 정했고, 다른 것과 겹치는지 보지 않았다.
  - #6 메모 키: 빈 새 메모는 원래 편집 상태로 시작한다. 그러나 먼 얼굴(화면 220px 아래)은 입력칸을 그리지 않아서 초점을 줄 곳이 없다. 초점이 레일 단추에 남아 Space·Enter가 단추를 다시 눌렀다. 가까운 배율에서는 원래 문제가 없었다.
  - #6 먼 얼굴 편집: 먼 얼굴은 ✎를 숨기고 두 번 누르기도 받지 않았다.
- 수정
  - #2: 순수 함수 `dockSpot`(`backend/src/canvas.mjs`)을 더했다. 이 함수는 다음 조건을 지키는 자리 가운데 원하는 자리(첫 노드 자리)에서 가장 가까운 곳을 고른다. 바깥이 다른 노드·메모·칸반·대화 노드·상자와 `GAP` 넘게 떨어지고, 그만큼 커진 자기 영역이 다른 영역에 붙지 않아야 한다. 거리가 같으면 고른 노드들이 비우는 자리와 더 많이 겹치는 쪽을 먼저 보고, 그다음 위, 왼쪽을 본다. 원하는 자리가 비어 있으면 결과는 예전과 같다. `dockLayout`은 이미 있는 덩어리 하나를 제자리에서 다시 짤 때(바깥 그대로)만 빼고 이 자리를 쓴다(`presetSpot`).
    - 이슈가 제안한 방법 가운데 "덮일 것을 밀어내기"는 쓰지 않았다. 사용자가 고르지 않은 노드를 옮기면 그 노드가 어디 있는지 기억하기 어려워진다. 고른 노드는 어차피 새 자리로 옮겨 가므로, 그룹이 빈자리로 가는 편이 덜 놀랍다. 다른 노드를 옮기지 않으므로 새로 남길 `node_moved`도 없다(덩어리 이벤트 `dock_saved`는 그대로 남는다).
  - #6 메모 키: `createItem`이 먼저 누른 단추의 초점을 풀고, 새 메모를 만든 뒤 `editMemo`로 편집을 연다. 메모가 먼 얼굴이거나 화면 밖이면 화면을 그 메모로 옮겨, 편집할 수 있는 크기(화면 너비 360px 이상, 배율 상한 1)로 보인다(순수 함수 `memoEditView`, `app/src/renderer/lib/memo-edit.js`). 메모 노드는 입력칸이 생길 때(먼 얼굴에서 가까워질 때) 입력칸에 초점을 준다.
  - #6 먼 얼굴 편집: 먼 얼굴을 두 번 누르면 같은 `editMemo`가 화면을 옮기고 편집을 연다. ✎는 먼 얼굴에서 계속 숨긴다. 너비가 90px 남짓한 노드에 단추를 두면 첫 줄 글이 가려지기 때문이다. 먼 얼굴에 마우스를 올리면 편집 안내 글(`memo.editTitle`)이 뜬다.
  - #6 빈 판: 판을 다 읽었고 워크스페이스·세션·메모·칸반·대화 노드가 하나도 없으면, 캔버스 가운데에 안내를 띄운다(`Canvas.jsx`의 `EmptyHint`, 판단은 `lib/empty-board.js`의 `boardEmpty`). 단추는 "+ 프로젝트 열기"(위 왼쪽 +와 같은 대화상자)와 "세션 띄우기"(새 세션 대화상자)다. 단추 밖을 눌러도 캔버스 조작은 막히지 않는다. 화면 글은 `locales/en.js`·`ko.js` 끝의 `emptyBoard`에, 모양은 `styles.css` 끝에 더했다.
- 시험
  - 단위 시험: `backend/test/p50.test.mjs`(dockSpot 두 시험, dockLayout 네 시험: ux1 자리, 창 시험 자리, 메모가 자리를 막을 때, 자리가 비면 예전과 같음), `app/test/p50-lib.test.mjs`(memoEditView, memoFar, boardEmpty).
  - `cd backend && npm test` 364개 통과, `cd app && npm test` 156개 통과, `cd app && npm run build` 통과.
  - 창 시험(고친 뒤, 새 판): `experiments/p50/p50-after.json` 7/7 통과.
    - 배치 틀 뒤 `pa 40,612 / pc 760,612 / pb 800,112`: pc가 비운 아래 자리에 짰고 겹침은 0이다.
    - 메모 단추를 누른 뒤 초점은 `TEXTAREA`다. Space·Enter와 글이 메모에 들어가고 메모는 1개다.
    - 먼 얼굴을 두 번 누르면 배율 1에서 편집이 열리고 입력칸에 초점이 있다.
    - 빈 판에 안내와 단추가 있고, 워크스페이스를 열면 안내가 사라진다. 창 콘솔 오류는 없다.
    - 스크린숏: `experiments/p50/p50-before-*.png`, `experiments/p50/p50-after-*.png`.
- 정리: 시험 세션은 각본이 끝에서 껐다. 창을 닫고 백엔드를 멈춘 뒤, herdr 서버(`atrium-dev-p50`)를 멈추고 그 herdr 세션을 지웠다. 시험 폴더 `C:\Workspace\mtask-p50-dir`와 판 데이터·창 프로필(`backend/.dev/data`, `backend/.dev/app`, 고정 자료 폴더)도 지웠다. claude 세션은 띄우지 않았으므로 시험 대화 기록은 없다.
  - 정리 중에 본 것: 백엔드를 띄운 직후 `atrium backend start`가 `Cannot read properties of undefined (reading 'stats')`를 냈고, `atrium herdr stop --yes`가 `herdr not found`를 돌려주었다. 시험 판의 herdr 서버는 `herdr --session atrium-dev-p50 server stop`으로 직접 멈췄다. 이번 수정과 관계없는 곳이라 고치지 않았다.

## 보고

### 요약

| 이슈 | 재현 | 원인 | 수정 | 시험 |
| --- | --- | --- | --- | --- |
| #2 배치 틀이 셋째 노드를 덮음 | 재현됨(겹침 657×444px) | `dockLayout`이 첫 노드 자리에서 틀 크기로 펴고 겹침을 보지 않음 | 순수 함수 `dockSpot`으로 가장 가까운 빈자리(비우는 자리 먼저)에 짬 | 단위 시험 6개, 창 시험 통과 |
| #6 새 메모 뒤 친 키가 메모를 더 만듦 | 재현됨(메모 4개) | 먼 얼굴에는 입력칸이 없어 초점이 레일 단추에 남음 | 단추 초점을 풀고, 화면을 메모로 옮겨 편집을 열고 입력칸에 초점 | 단위 시험, 창 시험 통과 |
| #6 먼 얼굴 메모를 고칠 수 없음 | 재현됨 | 먼 얼굴이 두 번 누르기를 받지 않음 | 두 번 누르면 화면을 옮겨 편집. ✎는 먼 얼굴에서 계속 숨김(까닭은 작업 기록) | 창 시험 통과 |
| #6 빈 판에 첫 걸음 없음 | 재현됨 | 안내가 없었음 | 빈 판 가운데에 안내와 단추 둘 | 단위 시험, 창 시험 통과 |

- 커밋은 이 브랜치(`worktree-p50`)에만 했다. 남의 영역은 고치지 않았다. `Chrome.jsx`의 메모 단추는 그대로 두고 `createItem`(`Memo.jsx`)에서 초점을 풀었다(P52 크롬 영역과 겹치지 않게).
- 새 창 시험 `app/test/e2e/p50-repro.mjs`는 git 밖의 판 값 파일 `experiments/p50/tools/env.cjs`를 읽는다. 다른 곳에서 다시 돌리려면 그 파일을 같은 모양으로 만든다(작업 기록 첫 항목).

### ARCH에 고칠 문장(제안)

- H5 끝에 더한다: "배치 틀로 새로 짠 덩어리는 다른 노드·메모·칸반을 덮지 않는다. 첫 노드 자리가 막히면 가장 가까운 빈자리(고른 노드가 비우는 자리 먼저)에 짠다(`canvas.mjs` `dockSpot`)."
- I3·I4 끝에 더한다: "새 메모는 바로 편집 상태다. 새 메모가 먼 얼굴이거나 먼 얼굴의 메모를 두 번 누르면 화면을 그 메모로 옮겨 편집을 연다. 판이 비면 캔버스 가운데에 첫 걸음 안내(프로젝트 열기, 세션 띄우기)를 보인다."

### 이슈 댓글 초안(영어)

**#2**

> Cause: `dockLayout` laid the preset out from the first node's top-left at the preset size without checking other items, so the group covered the third node.
> Fix: a pure `dockSpot` (backend/src/canvas.mjs) now picks the nearest spot where the group clears every other node, memo, kanban and worktree box by the usual gap and keeps its region off other regions, preferring the space the picked nodes vacate. No other node is moved. Covered by backend/test/p50.test.mjs and the window case in app/test/e2e/p50-repro.mjs.
> Unchanged: re-laying an existing group in place keeps its outer rect.

**#6**

> New memo + typing: at far zoom the new memo had no textarea, so focus stayed on the rail button. `createItem` now blurs the button, opens the new memo in edit mode and, if it is in far face, zooms to it so the textarea exists and gets focus; click + Space + Enter now leaves one memo with the keys in it.
> Far memo editing: double-clicking the far face zooms to the memo and opens edit. The ✎ button stays hidden in far face because it would cover the title at that size.
> Empty board: a centered hint with "+ Open project" and "Start a session" shows while the board has no workspace, session, memo, kanban or conversation node.
