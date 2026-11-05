상태: 열림
날짜: 2026-11-05

## 지시

### 목표

사용성 검증(ux1)이 올린 GitHub 이슈 가운데 크롬 이슈 #4, #5를 재현하고 고친다. 사용자의 말: "열려 있는 이슈 보고 재현-수정을 맡겨."

맡은 이슈:
- **#4** Sidebar workspace counts (working, needs you) do not update when sessions change state (S2). 이슈는 옛 사이드바에서 찾았다. P44가 사이드바를 다시 짰으니 새 사이드바의 머리줄 세는 값(응답 필요, 오류, 작업 중, 세션 수)이 상태가 바뀔 때 바로 맞는지 먼저 본다. 판 쪽 수(`atrium ws`, `counts`)와 어긋나면 고친다.
- **#5** UX polish: chrome (ux1) (S3), 체크리스트 셋:
  - Esc가 대부분의 대화상자·패널을 닫지 않고, 열 때 초점이 안으로 들어가지 않는다(새 세션, 프로젝트 열기, 변경 내역, 반복 작업, 데스크톱 가져오기 등). 공용 방법(초점 가두기, Esc로 닫기, 닫으면 초점 돌려주기)으로 고친다.
  - 전체 보기나 자동 정렬 뒤 맨 위 영역 이름표가 위 왼쪽 알약 밑에 깔린다. 맞춤 여백이 떠 있는 크롬을 비키게 한다.
  - 고른 워크스페이스 탭의 세션 수가 빨간 알약(`--badge-bg`)이라 오류처럼 읽힌다.

고칠 곳(짐작): `app/src/renderer/Sidebar.jsx`·`lib/sidebar-tree.js`(세는 값), `store.js`(필요한 만큼), 대화상자들(`SpawnDialog.jsx`, `Workspaces.jsx`, `ReturnSummary.jsx`, `Loops.jsx`, `DesktopImport.jsx`), `Canvas.jsx`의 전체 보기, `Workspaces.jsx`의 탭

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
  - `ATRIUM_HERDR_SESSION=atrium-dev-p52`, `ATRIUM_PORT=47871`
  - `ATRIUM_DATA_DIR=<워크트리>/backend/.dev/data`, `ATRIUM_APP_USERDATA=<워크트리>/backend/.dev/app`
- 실제 판(`atrium`, 47800)과 다른 포트(47811~47872 가운데 네 것 말고)는 쓰지 않는다.
- 대화 목록은 시험 폴더의 대화만 읽는다(`ATRIUM_CLAUDE_PROJECTS`, `ATRIUM_CLAUDE_DESKTOP=none`). 시험 폴더는 `C:\Workspace\mtask-p52-*`처럼 새로 만든다.
- 세션은 되도록 셸 노드로 시험한다. claude가 꼭 필요하면 `--model haiku`, 턴은 짧게.
- 끝나면 시험 세션, 창, 백엔드, herdr 서버와 세션(`atrium-dev-p52`만), 시험 폴더, 시험 대화 기록을 끄고 지운다.

### 지킬 것

- `CLAUDE.md`를 따른다. 프로세스는 직접 띄운 것만 PID로 끈다.
- 이 저장소는 공개다. 작업 기록, 시험 코드, 커밋 메시지, 댓글 초안에 사용자 경로·메일·토큰을 쓰지 않는다. 커밋 전·푸시 전 검사를 건너뛰지 않는다.
- 같은 때 다른 작업자들이 돈다. 맡은 이슈에 필요한 만큼만 작게 고치고, 남의 영역을 고쳤으면 보고에 적는다.
  - P49(원격 R3): P47·P48을 합치는 중이다. `relay.mjs`, `api.mjs`, `api.js`, `store.js`, 웹 화면(`web.js`, `web.mjs`), 짝 맺기, `SpawnDialog.jsx`의 폴더 찾아보기, `TerminalView.jsx`·`CommandBar.jsx`의 붙여넣기 업로드, 설정의 연결된 기기를 고친다.
  - P50(캔버스 #2·#6), P51(터미널 #3·#7), P52(크롬 #4·#5), P53(#8·#9·#10)
- 화면 글을 더할 때는 `locales/en.js`·`ko.js` 끝에 더한다(고치는 것은 그 자리). 한국어는 P39 말투(합니다체)와 용어를 따른다. `styles.css`에 더할 때는 끝에 더한다.
- 자기 브랜치에만 커밋한다. 커밋 메시지에 `Co-Authored-By` 줄을 넣지 않는다. `main`을 바꾸거나 푸시하지 않는다. `node_modules`는 워크트리 안에서 받는다(`npm ci`).
- 문서는 이 작업 파일의 작업 기록 절과 보고 절만 고친다. 고쳐야 할 ARCH 행이 있으면 새 문장을 보고 절에 짧게 적는다.
- 끝나면 보고 절을 쓰고, 맨 마지막에 `<워크트리>/backend/.dev/p52.done`(브랜치 이름과 마지막 커밋 해시 두 줄)을 만든다.

## 작업 기록

- 판: herdr 세션 `atrium-dev-p52`, 포트 47871, 데이터 `backend/.dev/data`, 창 프로필 `backend/.dev/app`. 대화 목록은 `backend/.dev/p52-projects`만, 데스크톱 앱 목록 없음(`ATRIUM_CLAUDE_DESKTOP=none`). 시험 폴더 `C:\Workspace\mtask-p52-dir`, `mtask-p52-dir2`(새로 만듦, git 아님). 판 값은 `experiments/p52/tools/env.cjs`(git 밖), 창 시험은 `node experiments/p52/tools/e2e.cjs p52-chrome.mjs [--tag 이름] [--only 사례] [--no-claude]`.
- ux1 재현 각본(`ux1-repro.mjs`)은 ux1 판(47867)에 묶여 있어, 같은 사례(`sidebarCounts`, `escDialogs`, `fitUnderChrome`)와 탭 색 사례를 이 판에서 도는 `app/test/e2e/p52-chrome.mjs`로 옮겼다. 사이드바 사례는 옛 `.mt-sb-ws-head`가 아니라 새 사이드바(P44)의 워크스페이스 줄 `[data-count]`를 읽는다. 대화상자 사례는 Tab 가두기, 닫은 뒤 초점, 터미널에서 친 Esc도 잰다.
- 고치기 전(`873ca69`) 재현, 결과 `experiments/p52/before.json`, `before-counts.json`:
  - #4: 재현되지 않았다. 셸 `Start-Sleep 8` 동안 사이드바 줄 `working 1`, 끝난 뒤 0. haiku 한 턴 동안 `working 1`, 끝난 뒤 0(`atrium ws`는 `작업 중 0 … 검토 대기 1`). 창 상점의 `workspaces[].counts`는 여전히 낡았다(`working 0, review 0`)가, 창에서 그 값을 읽는 곳이 없다.
  - #5 Esc: `notClosed: [newSession, openProject, changes, loops, desktopImport]`. 열 때 초점 `BUTTON[launch]`(새 세션), `BUTTON[settings-open]`(설정), `BODY`(데스크톱 가져오기). 리포 열기는 칸에 초점이 가지만 Tab이 상자 밖(터미널)으로 나갔다.
  - #5 전체 보기: 1584×921과 1366×768에서 아래 왼쪽 영역 이름표와 노드 머리줄 둘이 왼쪽 레일 밑(겹침 46×27, 35×24px). 판 전체 정리 뒤 위쪽 영역 이름표가 위 왼쪽 알약 밑(230×8px).
  - #5 탭: 고른 탭 수 바탕 `rgba(229,72,77,0.22)`, 글자 `rgb(255,90,95)`(`--badge-bg`, `--badge-text`).
- 고친 뒤 결과 `experiments/p52/after.json`, `after-esc.json`, 스크린숏 `after-fit-*.png`, `after-tab-on.png`: 네 사례와 콘솔 오류 없음 모두 통과(아래 보고).
- 시험 세션(셸 `sc-sh`, `fa`, `fb`, `fc`, haiku `sc-cl`)은 각 실행 끝에 `atrium kill`로 껐다.

## 보고

### 이슈별

**#4 사이드바 세는 값(이미 고쳐짐).** P44가 사이드바를 다시 짜면서 워크스페이스 줄의 세는 값을 창의 세션 목록에서 바로 센다(`lib/sidebar-tree.js` `buildRows` → `countOf`). 이슈가 본 옛 사이드바는 백엔드가 워크스페이스 일 때만 보내는 `w.counts`를 읽었다. 지금 창에서 `w.counts`를 읽는 곳은 없다. 고치기 전 코드에서 셸과 haiku 모두 상태를 바로 따라갔다. 코드는 고치지 않고, 세는 값이 상태에서 바로 나오고 낡은 `counts`를 쓰지 않는다는 단위 시험만 더했다.
- 판과 다른 점 둘(고치지 않음): 사이드바의 "작업 중"은 `shell_running`과 `starting`도 센다(미션 지도와 같다). `atrium ws`와 위 탭 풀이의 "작업 중"은 Claude의 `working`만 센다. 사이드바 머리줄에는 "검토 대기"(unseen) 수가 없다(P44 설계, 세션 줄에 표시). 하나로 맞출지는 지휘 세션이 정한다.
- 백엔드는 여전히 `workspace.updated`에 그때의 `counts`를 실어 보낸다. 창과 원격 화면(`web.js`)은 그 값을 읽지 않고, `atrium ws`는 물을 때마다 새로 세므로 그대로 두었다.

**#5 크롬 셋(고침).**
1. Esc·초점: 공용 훅 `useDialog`(`app/src/renderer/dialog.js`, 판단은 `lib/dialog.js`)를 만들었다. 열린 것을 연 차례로 쌓고 Esc는 맨 위 하나만 닫는다.
   - 대화상자(새 세션, 리포 열기, 워크스페이스 닫기, 데스크톱 가져오기, 루프 만들기, 설정, 잇기 역할): 열면 첫 입력 칸에 초점(칸이 없으면 상자 자체. 확인 대화상자의 첫 단추에 주면 Enter 한 번에 지우기 같은 일이 생기므로 단추는 고르지 않는다), Tab·Shift+Tab은 안에서 돌고, 닫으면 연 단추로 초점이 돌아간다. 연 자리는 첫 렌더에서 기억한다(autoFocus가 효과보다 먼저 초점을 옮긴다). 가져오기·닫기를 하는 동안은 바깥 누르기와 같이 Esc로도 닫지 않는다. 설정의 따로 있던 Esc 처리는 훅으로 바꿨다.
   - 떠 있는 창(변경 내역, 오른쪽 레일의 루프 목록): 판을 막지 않으므로 초점을 가져가지 않는다. 변경 내역은 돌아왔을 때 저절로 뜨므로 치던 글을 뺏으면 안 된다. Esc는 창 안이거나 판·단추에 초점이 있을 때만 닫고, 터미널과 바깥 입력 칸(명령 바)의 Esc는 그쪽 몫으로 둔다(터미널의 Esc는 에이전트 끊기). 창 시험에서 터미널에 초점을 두고 Esc를 치면 변경 내역이 남는 것을 보았다.
   - 한글 조합 중(`isComposing`)이거나 안쪽 칸이 이미 Esc를 쓴(`preventDefault`) 경우는 닫지 않는다. 노드 닫기 확인(`SessionNode.jsx` `CloseDialog`)은 P22의 자기 키 처리가 있어 건드리지 않았다. 사이드바의 missed 지우기 확인도 그대로다.
   - 이슈 제안(대화상자마다 `autoFocus`)보다 훅 하나로 Esc·초점·Tab·돌려주기를 같이 한 것은, 대화상자가 아홉 군데라 따로 두면 다시 어긋나기 때문이다.
2. 전체 보기: `lib/chrome-inset.js`. `chromeInset`이 캔버스 가장자리에서 위 알약(왼쪽·오른쪽), 왼쪽·오른쪽 레일, 보이는 아래 바가 덮는 만큼(+12px, 한쪽 최대 30%)을 재고, `fitInset`이 그 남은 칸 안에 맞춘다. `fitAll`(전체 보기, 판 전체 정리 뒤, 처음 열 때)과 `navigateToRect`(영역·메모로 가기)가 쓴다. 세션으로 가기(`navigateTo`, P26 `enterView`)는 P50 영역이라 바꾸지 않았다. 이슈 제안의 고정 여백 대신 실제 크롬을 재는 것은, 레일 길이·탭 수·아래 바 표시에 따라 크기가 바뀌기 때문이다.
3. 탭 수 색: `.mt-ws-n.badge`(고른 탭의 세션 수)를 빨강(`--badge-bg`, `--badge-text`)에서 고른 탭의 초록(`--accent-soft`, `--accent-tab-text`)으로 바꿨다(`styles.css`의 그 자리).

### 시험

- 단위: `app/test/p52-lib.test.mjs` 8개(Esc 대상, 조합 중·이미 쓴 Esc, 떠 있는 창과 터미널, Tab 가두기, 첫 칸 고르기, 크롬 여백, 여백 안 맞추기, #4 세는 값). `cd backend && npm test` 358 통과, `cd app && npm test` 159 통과, `cd app && npm run build` 통과.
- 창(`p52-chrome.mjs`, 고친 뒤): `escDialogs` 통과(`notClosed: []`, 열 때 초점 `SELECT{launcher}`, `INPUT{path}`, `INPUT{setting-uiScale}`, 가져오기는 상자, Tab 25번 뒤에도 안, 닫은 뒤 초점 `BUTTON[launch]`, `BUTTON[ws-open]`, `BUTTON[settings-open]`, 터미널 Esc 뒤 변경 내역 남음), `fitUnderChrome` 통과(1584×921, 1366×768, 판 정리 뒤 겹침 0), `tabBadge` 통과(바탕 `rgba(28,182,109,0.16)`), `sidebarCounts` 통과, 콘솔 오류 없음. 고친 뒤에는 haiku 없이 셸로만 돌렸다(#4는 코드를 바꾸지 않았다).

### 남의 영역

- `Canvas.jsx`(P50 캔버스): `fitAll`과 `navigateToRect` 두 곳과 import만 바꿨다.
- `SpawnDialog.jsx`(P49 폴더 찾아보기): 훅 한 줄과 `<form ref={box}>`만 더했다.
- 그 밖에 `Chrome.jsx`(루프 목록 창), `Links.jsx`(역할 대화상자), `Loops.jsx`, `ReturnSummary.jsx`(카드를 안쪽 함수로 나눔), `Settings.jsx`, `Workspaces.jsx`, `DesktopImport.jsx`.

### ARCH에 넣을 문장

- 모듈 표: `app/src/renderer/dialog.js` | 대화상자·떠 있는 창의 공용 키보드(Esc로 맨 위 닫기, 초점 넣기·가두기·돌려주기). 판단은 `lib/dialog.js`.
- 모듈 표: `app/src/renderer/lib/chrome-inset.js` | 전체 보기·영역으로 가기가 떠 있는 크롬을 비키는 여백과 맞추기.

### 이슈 댓글 초안

#4:
> Not reproducible on current main. P44 rebuilt the sidebar, and its workspace rows now count sessions live from the window's session list (`buildRows`/`countOf` in `lib/sidebar-tree.js`) instead of the `counts` snapshot sent with `workspace.updated`; a fresh-board run showed the working count go 1 → 0 for both a shell command and a haiku turn. Added a unit test that pins this. Remaining difference: the sidebar's "working" also counts running shell commands, and the sidebar head has no review (unseen) count, while `atrium ws` counts Claude turns only and shows review.

#5:
> Fixed all three items. A shared `useDialog` hook (`app/src/renderer/dialog.js`) now gives every modal dialog Esc-to-close (topmost only), focus on the first field when it opens, a Tab trap, and focus back to the opener on close; the floating Changes and Loops panels close with Esc without taking focus, and Esc typed in a terminal stays with the terminal. Fit all and go-to-region now fit inside the area left free by the top pills, side rails and a visible bottom bar (`lib/chrome-inset.js`), measured with 0 overlaps at 1584×921 and 1366×768 and after auto arrange. The selected tab's session count uses the tab's neutral green instead of the red badge color.
