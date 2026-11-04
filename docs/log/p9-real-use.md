상태: 닫힘
날짜: 2026-10-31

## 지시

### 목표

사용자가 이 앱을 매일 실제 일에 쓰기 시작할 수 있게 한다. P8까지 기능은 다 만들었지만 지금은 개발용 판(`cd app && npm start`, `--dev`)으로만 띄울 수 있고, 실제 판(herdr 세션 `multitask`, 포트 47800, 데이터 `%LOCALAPPDATA%\multitask`)은 한 번도 띄운 적이 없다. 실제로 쓰면 바로 거슬릴 화면 버그 하나도 함께 고친다. 사용자는 이 작업 뒤 며칠 써 보고 피드백을 준다.

### 시나리오

1. **실제 판 띄우기.** 사용자가 바탕화면 바로가기를 두 번 눌러 실제 판을 연다. 창이 실제 판 백엔드를 띄우고, 백엔드가 실제 판 herdr 세션(`multitask`)을 띄운다. 개발용 판(`multitask-dev`)과 섞이지 않는다. 지금 코드에서 `--dev` 없이 띄우면 실제 판 프로필이 된다(`backend/src/config.mjs`, `app/src/main/main.mjs`).
   - `app/package.json`에 실제 판 실행 스크립트(예: `npm run real`: 빌드한 뒤 `electron .`).
   - 바로가기가 부를 실행 파일(예: `app/scripts/real.cmd`). 콘솔 창이 남지 않거나 최소화로 뜬다. 소스가 바뀌었으면 빌드한 뒤 띄운다.
   - 바탕화면 바로가기를 만드는 스크립트(예: `app/scripts/make-shortcut.ps1`). 이름 "multitask", 아이콘이 있으면 쓴다. **작업자는 이 스크립트를 사용자 바탕화면에 실제로 돌리지 않는다.** 시험 폴더에 바로가기를 만들어 대상과 인자가 맞는지만 본다. 지휘 세션이 합친 뒤 사용자 동의를 받아 돌린다.
   - 실제 판과 개발용 판이 화면에서 구분된다. 개발용 판일 때 위쪽 줄과 창 제목에 "dev" 같은 표시가 보이고, 실제 판에는 없다.
   - 같은 프로필의 창을 두 번 열면 지금처럼 한 창만 남는다(단일 인스턴스). 실제 판 창과 개발용 판 창은 함께 떠도 된다.
2. **영역 겹침 버그.** P7 시험 판에서 리포 영역 두 개가 겹치고, 새 노드가 영역 아래로 좁고 길게 쌓였다(`experiments/p7/j5-2-open-repos-sessions-closed-convos.png`, `experiments/p7/j4-1-terminal-bound-cannot-open.png`). 단서: `backend/src/canvas.mjs`의 `slotInRegion`은 빈자리를 못 찾으면 "자기 영역 바로 아래"에 같은 x로 계속 쌓는다(75~110줄). 그래서 영역이 아래로 길어지며 옆 영역과 겹칠 수 있다. 판에 올린 패널, 되살리기(J1), 다시 열기(J2), 가지 펼치기(K4)가 이 함수를 거친다. 재현하고, 원인을 찾고, 고친다. 고친 뒤에는 새 노드가 영역 안의 빈자리나 영역 오른쪽으로 자라고, 영역끼리 겹치지 않는다. 이미 겹친 판은 다음에 뜰 때 겹치지 않게 펴 준다(사람이 정한 상대 자리는 지킨다).

### 완료 기준

1. `npm run real`과 `app/scripts/real.cmd`가 실제 판 프로필로 창을 띄운다. 시험은 실제 판의 값으로 하지 않는다(아래 "시험 환경"). 바로가기 스크립트로 시험 폴더에 만든 바로가기의 대상·인자·작업 폴더가 맞다.
2. 개발용 판에는 "dev" 표시가 보이고, 실제 판 프로필에는 없다(스크린숏).
3. 영역 겹침을 재현한 시험(단위 시험과 창 스크린숏)이 고친 뒤에는 겹치지 않는다. 판에 올린 패널, 다시 열기, 하위 세션이 여러 개 생겨도 영역이 서로 겹치지 않고 노드가 좁은 한 줄로 길게 쌓이지 않는다. 이미 겹친 판을 열면 펴진다.
4. 기존 단위 시험(백엔드 133개, 창 27개)이 계속 통과하고, 새 시험을 더한다.

### 시험 환경

- 너만의 개발용 판: `MTASK_HERDR_SESSION=multitask-dev-p9`, `MTASK_PORT=47821`, `MTASK_DATA_DIR=<워크트리>/backend/.dev/data`, `MTASK_APP_USERDATA=<워크트리>/backend/.dev/app`. 감싸개로 부른다(`docs/testing.md`).
- **실제 판의 값(`multitask`, 47800, `%LOCALAPPDATA%\multitask`, 창 프로필 `multitask-app-real`)으로는 띄우지 않는다.** 실제 판 프로필의 실행 경로를 시험할 때는 `--dev` 없이 띄우되 위 환경 변수(세션 이름, 포트, 데이터 폴더, 창 프로필)를 모두 덮어 시험 판을 쓴다. 덮는 값이 빠지면 띄우지 않도록 시험 도구에서 막는다.
- 다른 판(`multitask-dev`: 사용자 세션 `s1`과 사용자가 띄운 백엔드가 있다), 포트 47800, 47811~47820은 건드리지 않는다.
- 시험 폴더는 `C:\Workspace\mtask-p9-*`처럼 새로 만든 폴더만 워크스페이스로 연다. 시험 claude는 `--model haiku`, 턴은 아주 짧게.
- 끝나면 시험 세션, 창, 백엔드, herdr 서버(`multitask-dev-p9`)를 끄고 그 herdr 세션과 시험 폴더를 지운다.

### 지킬 것

- `CLAUDE.md`를 따른다. 사용자 바탕화면, 시작 메뉴, 레지스트리, PATH, `~/.claude/settings.json`은 고치지 않는다.
- 자기 브랜치에만 커밋한다. 메시지 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. `main`을 바꾸거나 푸시하지 않는다.
- 문서는 이 작업 파일의 작업 기록 절과 보고 절, `docs/ARCH.md`의 자기 모듈 행만 고친다(`docs/README.md` 3절).
- 끝나면 보고 절을 쓰고, 맨 마지막에 `<워크트리>/backend/.dev/p9.done`(브랜치 이름과 마지막 커밋 해시 두 줄)을 만든다.

### 읽을 파일

- `CLAUDE.md`
- `docs/ARCH.md`
- `docs/testing.md`
- `docs/log/p7-recall-sidebar.md` "보고" 절(영역 겹침을 처음 본 곳)

## 작업 기록

### 2026-10-31 작업자 세션 시작

**기준.** 워크트리에 `node_modules`가 없어 본 저장소의 `backend/node_modules`, `app/node_modules`에 정션을 걸었다(끝에 끊는다). 기존 시험 백엔드 133, 창 27 통과.

**영역 겹침 재현(순수 함수).** scratchpad 스크립트로 `slotInRegion`을 돌렸다.

- a의 노드 하나가 이미 b 영역 안에 있는 판(겹친 판)에 a 노드 5개를 놓으면 `0,1100 | 0,1600 | 0,2100 | 0,2600 | 0,3100`. 모두 같은 x로 아래로 쌓이고 겹침은 그대로다. P7 스크린숏의 "좁고 긴 줄"과 같은 모양이다.
- a가 b, c에 둘러싸인 판은 왼쪽 위로 자라며 겹치지 않는다.

**원인.** `slotInRegion`의 `fits`는 "a 영역 + 후보"가 다른 영역과 겹치면 거부한다. a 영역이 이미 b와 겹쳐 있으면 영역은 커지기만 하므로 모든 후보(고리 9겹)가 거부되고, 마지막 대체 경로("자기 영역 바로 아래, 같은 x")로 떨어진다. 이 경로는 영역 겹침을 보지 않는다. 그래서 한 번 겹치면 그 뒤 모든 새 노드가 한 줄로 아래로 쌓이고, 영역이 아래로 길어져 다른 영역과 또 겹친다.

첫 겹침이 생기는 길(코드에서 찾음):
1. 다시 열기(J2) `recall.placeFor`는 마지막 자리를 노드·그룹과만 비교하고 영역 겹침을 보지 않는다. 닫힌 뒤 다른 영역이 그 자리로 오면 다시 열 때 겹친다.
2. 그룹 만들기(`groupCreate`)는 창이 준 화면 가운데를 노드와만 비교한다.
3. 크기 단계(`board.setSize`)로 노드가 커지면 영역이 옆 영역까지 커질 수 있다.
4. 고리 탐색이 다 막히면 위 대체 경로.

**계획.**
- `canvas.mjs`
  - `slotInRegion`: 이미 겹쳐 있는 영역은 후보 거부에 쓰지 않는다(겹침 풀기는 아래 함수가 한다). 대체 경로를 "같은 x로 아래"에서 "자기 영역 오른쪽 열, 영역 높이 안에서 위부터"로 바꾼다.
  - `separateRegions(regions)`: 겹친 영역 쌍마다 오른쪽(또는 아래)에 있는 쪽을 덜 옮기는 방향(오른쪽 또는 아래)으로 밀어 겹침을 푼다. 영역 안의 상대 자리와 영역끼리의 좌우·위아래 관계는 지킨다.
- `canvas-ops.mjs`: `settleRegions(b, cause)`가 위 함수의 결과대로 워크스페이스를 통째로 옮긴다(`workspace.move`와 같은 옮기기). 백엔드가 뜰 때(이미 겹친 판 펴기), 새 노드를 놓은 뒤(새 세션, 판에 올리기, 다시 열기·되살리기), 그룹 만들기, 크기 바꾸기, 덩어리 떼기 뒤에 부른다.
- `recall.placeFor`: 마지막 자리도 영역 겹침을 본다.
- K4 `childSlot`: 한 열에 12개까지 쌓던 것을 부모 높이의 약 두 배까지로 줄이고 열을 늘린다.
- 실제 판: `npm run real`, `app/scripts/real.cmd`(+ `real.mjs`: 바뀐 소스가 있으면 빌드, Electron을 떼어 띄우고 끝남), `app/scripts/make-shortcut.ps1`(대상 폴더 인자, 기본 바탕화면). 개발용 표시: 위쪽 줄 "dev" 꼬리표, 창 제목은 HTML `<title>`이 덮어쓰지 않게 막는다.
- 시험: 단위 시험(겹침 재현, 펴기, 대체 경로, 자식 배치), 창 시험(`p9-real.mjs`: 네 값을 모두 덮지 않으면 띄우지 않음).

**진행.**
- 위 계획대로 고친 뒤 재현 스크립트: 겹친 판에서 새 노드가 `0,500 | 0,1000 | -760,0 | -760,500 | -760,1000`으로 두 열에 놓인다. 남은 겹침은 `separateRegions`가 푼다.
- 창 제목: 개발용 창의 `BrowserWindow` 제목 "multitask (dev)"는 페이지가 뜰 때 `index.html`의 `<title>multitask</title>`로 덮어써지고 있었다. `page-title-updated`를 막았다.
- 창 시험 `p9-real.mjs` 첫 실행은 `spawnSync cmd.exe ENOENT`로 실패했다. 작업 폴더(`backend/.dev`)가 아직 없어서였다. 시험 도구가 먼저 만든다.
- 창 시험 `p9-regions.mjs` 첫 실행에서 겹침은 없었지만, `lead`의 하위 세션 w2~w4가 부모와 먼 a 영역 맨 위 줄에 보통 크기로 놓였다. `placeChild`의 `fits`가 "a 영역이 아래 c 영역과 REGION_GAP/2 안으로 가까워짐"을 거부해 `childSlot`이 null을 주고, 일반 빈자리 규칙으로 넘어갔기 때문이다. 둘째 판(노드끼리만 피함)을 더해 나무 모양을 지키고, 생기는 영역 겹침은 spawn 뒤 `settleRegions`가 c를 아래로 밀어 푼다. 다시 돌린 시험에서 w2~w4는 작게 부모 옆 아래 줄에 놓이고 c가 아래로 밀렸다.
- 시험 판을 두 번 정리했다(`p9-clean.mjs`: `mtask kill`, `herdr stop`, `backend stop`, `herdr session delete multitask-dev-p9`, 데이터·창 프로필 폴더 삭제, `--dirs`면 시험 폴더). 끝에 이 워크트리 경로가 명령줄에 든 프로세스가 없음을 확인했다.

## 보고

### 만든 것

**영역 겹침 고침(H1).** 원인은 작업 기록 절의 "원인"이다. 한 번 영역이 겹치면 `slotInRegion`의 모든 후보가 거부되어 새 노드가 "자기 영역 바로 아래, 같은 x"로 쌓였다.
- `backend/src/canvas.mjs`
  - `slotInRegion`: 자기 영역과 이미 겹친 영역은 후보를 거르는 데 쓰지 않는다. 고리 탐색이 다 막히면 자기 영역 오른쪽에 열을 더하고, 열마다 영역 높이 안에서 위부터 놓는다(같은 x로 아래로 늘이지 않는다).
  - `separateRegions(regions, { gap })`: 겹친(맞닿음은 제외) 두 영역 중 오른쪽·아래에 있는 쪽을 덜 옮기는 방향(오른쪽 또는 아래)으로 `REGION_GAP/2`만큼 띄운다. 오른쪽·아래로만 밀고, 겹침이 없을 때까지 되풀이한다.
- `backend/src/canvas-ops.mjs`: `settleRegions(b, cause)`가 영역째(노드, 그룹, 메모·칸반, 영역 자리) 옮기고 판 이벤트 `regions_settled { cause, moved }`를 남긴다. `workspace.move`의 옮기기를 `shiftWorkspace`로 뽑아 같이 쓴다.
- 부르는 곳: 백엔드가 뜰 때(`backend.mjs` start, P6a 옮기기 뒤), 새 세션(`spawn`), 판에 올리기(`adoptPane`), 다시 열기(`recall.bring`), 그룹 만들기(`groupCreate`, `groupFromMembers`), 크기 단계(`setSize`), 덩어리 붙이기·떼기.
- `backend/src/recall.mjs` `placeFor`: 마지막 자리로 커진 영역이 다른 영역과 겹치면 마지막 자리를 쓰지 않고 빈자리로.
- `backend/src/branch.mjs`: `childSlot`의 한 열은 부모 높이의 약 두 배까지(보통 크기 부모에 작은 자식 3개), 열은 6개까지. `placeChild`는 둘째 판으로 노드끼리만 피한 자리를 찾는다.

**실제 판 실행.**
- `app/package.json` `npm run real`(빌드 뒤 `electron .`).
- `app/scripts/real.cmd` → `app/scripts/real.mjs`: 창 소스(`src/renderer`, 창이 같이 묶는 `backend/src`, `build.mjs`)가 `dist/renderer.js`보다 새로우면 빌드하고, `electron.exe .`을 떼어 띄운 뒤 끝난다. `--dev`는 빼고 넘긴다. `--dry-run`은 띄우지 않고 고른 값(빌드 여부, 실행 파일, 인자, 프로필, 세션, 포트, 데이터 폴더)을 찍는다. 실패하면 `pause`로 까닭을 보인다.
- `app/scripts/make-shortcut.ps1 [-Dest <폴더>] [-Name multitask] [-Icon ...]`: 대상 `real.cmd`, 인자 없음, 작업 폴더 `app`, 창 최소화(7). 아이콘은 `app\assets\icon.ico`가 있으면 그것, 없으면 Electron 실행 파일의 아이콘. `-Dest`를 빼면 바탕화면이다. 사용자 바탕화면에는 돌리지 않았다.
- 개발용 표시: 위쪽 줄 "multitask" 옆 `DEV` 꼬리표(`InboxBar.jsx`, `data-role="dev-badge"`, 풀이에 herdr 세션과 포트), 창 제목 "multitask (dev)"가 HTML 제목에 덮이지 않게(`main.mjs`). 실제 판 프로필에는 둘 다 없다.

**시험.**
- 단위: `backend/test/p9.test.mjs` 9개(겹친 판 재현, 여러 워크스페이스 번갈아 놓기, 오른쪽 열 대체 경로, `separateRegions` 무작위 판 200개, `settleRegions`로 펴기, `slotFor`·크기 키우기 뒤, 다시 열기 마지막 자리, K4 열 높이, K4 둘째 판). `app/test/p9-real.test.mjs` 2개(시험 판 막기, `real.mjs --dry-run`). 합계 백엔드 142, 창 29 통과.
- 창 시험 도구: `app/test/e2e/p9-guard.mjs`(네 값 중 하나라도 빠지거나 실제 판·다른 판 값이면 던짐), `p9-lib.mjs`, `p9-real.mjs`, `p9-regions.mjs`, `p9-clean.mjs`. 결과는 `experiments/p9/`.
- `p9-real.mjs` 판정 모두 참: real.cmd 창은 프로필 real, 꼬리표 없음, 창 제목 "multitask", 백엔드 `backend.json` 프로필 real(`real-1-real-profile-no-dev-badge.png`). 같은 프로필로 다시 띄운 둘째 프로세스는 끝나고 첫 창은 남음. 개발용 창은 `DEV` 꼬리표와 제목 "multitask (dev)"이고 실제 판 프로필 창과 함께 뜸(`real-2-dev-profile-badge.png`). `npm run real` 창도 real(`real-3-npm-run-real.png`). 시험 폴더에 만든 바로가기: 대상 `<워크트리>\app\scripts\real.cmd`, 인자 없음, 작업 폴더 `<워크트리>\app`, 창 스타일 7.
- `p9-regions.mjs` 판정 모두 참: 옛 판처럼 a·b, a·c가 겹친 판(`regions-1-old-overlapped-board.png`)을 백엔드를 다시 띄우자 b를 오른쪽으로 520 밀어 폈고, a와 b 안의 상대 자리는 그대로(`regions-2-spread-on-start.png`). 그 뒤 a에 셸 6개, 판에 올린 패널 2개(herdr `pane.split`), 닫고 다시 열기 1번, claude(haiku) `lead`의 하위 세션 4개(`/branch/child`, `mtask child`와 같은 HTTP 명령)를 놓는 동안 매번 영역 겹침 0, 노드 4개 이상인 영역 중 높이/너비 3 이상인 것 0(`regions-3`, `regions-4`, `regions-5`).

### 계획과 다른 곳

- 지시는 "새 노드가 영역 안의 빈자리나 영역 오른쪽으로 자란다"이다. 오른쪽 열로 자라는 것은 고리 탐색이 다 막혔을 때의 대체 경로다. 고리 탐색 자체는 그대로 두어, 자리가 있으면 영역이 덜 길쭉해지는 쪽(왼쪽·위 포함, 왼쪽·위는 벌점)을 고른다.
- 새 노드를 놓은 뒤 겹치면 옆 워크스페이스 영역을 통째로 민다. ARCH 4절 H7의 "저절로 옮기는 것은 새 노드를 놓을 때뿐이다"와 달리, 이제 옆 영역의 노드도 저절로 움직인다(판 이벤트 `regions_settled`). 4절은 고치지 않았다(작업자가 고칠 수 있는 곳이 아니다).
- K4: 한 열 상한(12 → 부모 높이의 약 두 배), 열 수(3 → 6), `placeChild`의 둘째 판은 지시에 없던 변경이다. 첫 창 시험에서 하위 세션이 부모와 먼 곳에 놓여서 더했다.
- 실행 파일은 `real.cmd` 하나가 아니라 `real.cmd` + `real.mjs`다. 빌드 판단과 떼어 띄우기를 node로 했다.
- 바로가기 아이콘: 앱 아이콘 파일이 없어 Electron 실행 파일의 아이콘을 쓴다.
- 창 시험에서 실제 판 프로필 창과 개발용 창은 같은 시험 판(세션, 포트, 데이터 폴더)을 쓰고 창 프로필만 따로 두었다(`backend/.dev/app`, `app-dev`, `app-npm`). 같은 창 프로필이면 단일 인스턴스 잠금으로 둘째 창이 뜨지 않기 때문이다.
- 하위 세션 창 시험은 claude에게 `mtask child`를 치게 하지 않고, 시험 도구가 그 세션의 토큰으로 `/branch/child`를 직접 불렀다. 턴을 돌리지 않으려고 했다.
- `node_modules`는 본 저장소의 것에 정션을 걸어 썼고, 끝에 끊었다.

### 알려진 문제

- 실제 판의 값(`multitask`, 47800, `%LOCALAPPDATA%\multitask`)으로는 한 번도 띄우지 않았다(지시대로). 사용자가 처음 띄울 때 실제 판 데이터 폴더와 herdr 세션 `multitask`가 새로 생긴다.
- `real.cmd`는 PATH의 `node`를 쓴다. 바로가기는 `make-shortcut.ps1`을 돌린 체크아웃의 `app\scripts\real.cmd`를 가리킨다. 워크트리에서 돌리면 워크트리를 가리킨다.
- 겹침 풀기가 옆 영역을 밀 때 화면(뷰포트)은 옮기지 않는다. 보고 있던 영역이 화면 밖으로 밀릴 수 있다.
- 메모·칸반 만들기(`placeItem`)와 창의 끌기(`board.setNode`), `workspace.move { force }` 뒤에는 겹침 풀기를 부르지 않는다. 창은 끌어서 새로 겹치면 되돌리고, 메모·칸반은 고리 탐색이 다 막힐 때만 겹칠 수 있다. 그런 겹침은 다음 배치나 다음 시작 때 풀린다.
- `separateRegions`는 오른쪽·아래로만 민다. 사람이 영역을 붙여 둔 판이 크게 겹쳐 있으면 영역 사이 거리가 원래보다 넓어진다.
