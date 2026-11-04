상태: 닫힘
날짜: 2026-11-04

## 지시

### 목표

터미널 노드에서 글을 끌어 고르고 복사하는 것이 보통 터미널처럼 되게 한다. 사용자의 말은 다음과 같다.
- "복사를 할 때 커서가 이상하게 끌어지는데."
- "그리고 컨트롤 V 하고 cli 창을 스크롤 하면 내가 선택한 영역도 이동함."

사용자는 판을 1보다 작은 배율로 놓고 쓰는 일이 많다. 터미널은 herdr가 다시 그린 화면이다. 휠은 SGR 마우스 시퀀스로 바뀌어 Claude Code가 스스로 화면을 다시 그린다(`lib/term-input.js`, ARCH 7.2, E4).

### 할 것

1. **재현.** 개발용 판에서 셸 노드와 claude 노드로 두 증상을 재현하고, 원인을 작업 기록에 적는다.
   - 배율 0.5, 0.75, 1, 1.5에서 본다. 덩어리 안과 밖, 노드가 골라진 때와 아닌 때를 견준다.
   - 짐작 하나: xterm.js는 마우스 위치를 칸으로 바꿀 때 판의 CSS 확대·축소(transform)를 모른다. 그래서 고른 영역이 마우스 밑 글자보다 뒤처지거나 앞선다.
   - 짐작 둘: 고르는 동안 노드 끌기나 판 이동이 함께 일어난다.
   - 짐작 셋: 휠로 화면이 다시 그려져도 xterm의 선택은 같은 칸에 남거나, 버퍼와 함께 밀린다. 그래서 다른 글 위로 옮겨 간다.
   - 셋 말고 다른 원인이 있으면 그것을 고친다.
2. **끌어 고르기.**
   - 어느 배율에서든 선택의 끝이 마우스 바로 밑 글자를 따라간다(한 칸도 어긋나지 않는다).
   - 고르는 동안 노드와 판은 움직이지 않는다. 마우스 포인터는 글 고르기 모양이다.
   - 두 번 눌러 낱말, 세 번 눌러 줄 고르기도 같은 배율 규칙을 따른다.
3. **복사·붙여넣기·스크롤 뒤의 선택.** Windows Terminal처럼 한다.
   - 고른 글을 복사하면(Ctrl+C, Ctrl+Shift+C) 선택을 지운다.
   - 붙여넣기(Ctrl+V, Shift+Insert)나 글 입력을 하면 선택을 지운다.
   - 휠로 화면이 다시 그려질 때 선택이 다른 글 위로 옮겨 가지 않는다. 글을 따라가게 할 수 없으면 지운다.
   - 고른 채로 휠을 굴려 고르는 범위를 넓히는 것은 하지 않아도 된다. 그 대신 선택이 엉뚱한 곳에 남지 않게 한다.
4. 지금의 규칙(괄호 붙여넣기, Ctrl+G 막기, 선택이 없을 때 Ctrl+C는 ^C, 휠 → SGR, 노드 밖으로 끌기 등)은 그대로 둔다.

### 완료 기준

1. 마우스 위치 → 칸 계산(배율 반영)과 선택을 지우는 때를 순수 함수로 두고 단위 시험한다(`lib/term-input.js` 쪽).
2. 개발용 판의 창 시험(e2e)으로 확인하고 스크린숏을 남긴다.
   - 셸 노드에 알려진 글 여러 줄을 찍는다. 배율 0.5, 0.75, 1, 1.5에서 정한 두 점 사이를 끌어 고른다. `getSelection()`이 기대한 글과 같다.
   - 고르는 동안 노드 자리와 판의 viewport가 바뀌지 않는다.
   - 복사 뒤, 붙여넣기 뒤, 휠 뒤에 선택이 3절대로 지워지거나 제자리다.
   - claude 노드(`--model haiku`)에서 휠 스크롤 뒤 선택이 다른 글 위에 남지 않는다.
3. `cd backend && npm test`, `cd app && npm test`, `cd app && npm run build`가 통과한다.

### 시험 환경

- 너만의 개발용 판으로 띄운다(`docs/testing.md`).
  - `ATRIUM_HERDR_SESSION=atrium-dev-p38`, `ATRIUM_PORT=47856`
  - `ATRIUM_DATA_DIR=<워크트리>/backend/.dev/data`, `ATRIUM_APP_USERDATA=<워크트리>/backend/.dev/app`
- 실제 판(`atrium`, 47800)과 47811~47855는 쓰지 않는다.
- 대화 목록은 시험 폴더의 대화만 읽는다(`ATRIUM_CLAUDE_PROJECTS`, `ATRIUM_CLAUDE_DESKTOP=none`). 시험 폴더는 `C:\Workspace\mtask-p38-*`처럼 새로 만든다.
- claude가 꼭 필요하면 `--model haiku`, 턴은 짧게.
- 시험이 시스템 클립보드를 쓰면, 시험 앞의 클립보드 글을 되돌려 놓는다.
- 끝나면 시험 세션, 창, 백엔드, herdr 서버와 세션, 시험 폴더, 시험 대화 기록을 끄고 지운다.

### 지킬 것

- `CLAUDE.md`를 따른다. 프로세스는 직접 띄운 것만 PID로 끈다.
- 같은 때 두 작업자가 돈다.
  - P36(하위 세션 상한 없애기, 스킬, 워크트리 하위 세션 신뢰)은 `branch.mjs`, `settings.mjs`, `launch.mjs`, `bin/atrium*.mjs`, `Branch.jsx`, `Settings.jsx`를 고친다.
  - P37(폴더가 저장소가 되면 영역 합치기)은 `workspaces.mjs`, `git.mjs`, 워크스페이스 키를 저장·옮기는 곳, `worktree-areas.mjs`, `Regions.jsx`를 고친다.
  - 너는 그 파일을 되도록 건드리지 않는다. 화면 글은 `locales/en.js`·`ko.js` 끝에 더한다.
- 자기 브랜치에만 커밋한다. 커밋 메시지에 `Co-Authored-By` 줄을 넣지 않는다. `main`을 바꾸거나 푸시하지 않는다. `node_modules`는 워크트리 안에서 받는다(`npm ci`).
- `docs/ARCH.md`, `docs/BRIEF.md`는 고치지 않는다. 고쳐야 할 ARCH 행(7.2 터미널 입력 등)은 보고 절에 새 문장으로 적는다. 문서는 이 작업 파일의 작업 기록 절과 보고 절만 고친다.
- 끝나면 보고 절을 쓰고, 맨 마지막에 `<워크트리>/backend/.dev/p38.done`(브랜치 이름과 마지막 커밋 해시 두 줄)을 만든다.

### 읽을 파일

- `CLAUDE.md`, `docs/testing.md`, `docs/ARCH.md` 7.2
- `docs/experiments/` 중 E4(터미널 입력)
- `app/src/renderer/TerminalView.jsx`, `lib/term-input.js`, `Canvas.jsx`(끌기, P31 먼 배율 끌기), `Docks.jsx`, `styles.css`

## 작업 기록

2026-11-04, P38 작업자 세션(워크트리 `p38`, 브랜치 `worktree-p38`).

- 판: `atrium-dev-p38`, 47856, `backend/.dev`(`experiments/p38/tools/env.cjs`). 시험 폴더 `C:\Workspace\mtask-p38-dir`(git init 안 함, `atrium trust`로 신뢰 대화상자 없음 확인). 셸은 PowerShell이다.
- **재현.** 고치기 전 코드로 창 시험(`p38-select.mjs`)을 돌렸다. 결과는 31/61이다(`experiments/p38/p38-before-claude.*`). 노드 1000×560, ROW1~ROW5 글을 찍고 정한 칸 사이를 끌었다.
  - 짐작 하나(맞음): xterm 6.0.0 `browser/input/Mouse.ts getCoords`는 `clientX - rect.left`(화면 px, 확대·축소 반영)를 `dimensions.css.cell.width`(확대·축소 전 px)로 나눈다.
    - 배율 0.5에서 5~22칸을 끌면 `" alpha br"`처럼 화면 거리의 절반 칸만 간다. 시작 칸도 왼쪽으로 밀린다.
    - 배율 0.75도 뒤처지고, 배율 1.5는 `"ha bravo charlie delta…"`처럼 앞선다. 줄도 같은 비율로 어긋난다.
    - 두 번 누르기와 세 번 누르기도 다른 낱말·줄을 고른다. 노드가 골라졌는지, 덩어리 안인지와 상관없다.
  - 짐작 둘(맞음, 배율 0.5에서): 고르는 동안에는 노드도 판도 움직이지 않는다. 그러나 놓을 때 나는 click이 `Canvas.onNodeClick`의 "터미널 안을 누르면 화면만 옮긴다"(`navigateTo viewOnly`)에 걸린다.
    - 그 노드가 들어가기 화면(`enterView`)에 맞지 않으면 판이 배율 1 쪽으로 옮겨진다(v0 zoom 0.5 → v1 zoom 1).
    - 두 번 누르기에서는 첫 click에 판이 움직이기 시작해, 두 번째 누르기가 다른 글을 고른다.
    - 배율 0.75~1.5에서는 이미 "보는 중"이라 옮기지 않았다.
  - 짐작 셋(맞음): 프레임은 herdr가 다시 그린 화면이고 scrollback이 0이라, xterm의 선택은 같은 칸에 남는다.
    - claude 노드에서 113~114를 고르고 휠을 굴리면 같은 칸의 108~109가 골라진 채로 남는다.
    - 셸에서 `cls` 뒤 다른 글을 찍어도 선택이 빈칸 위에 남는다.
    - 셸의 휠은 PowerShell이 SGR을 무시해 화면이 그대로라, 선택이 같은 글 위에 있다.
  - 그 밖: 복사(Ctrl+C, Ctrl+Shift+C)와 붙여넣기(Ctrl+V, Shift+Insert) 뒤에 선택이 남는다. 글을 치면 xterm이 스스로 지운다(`onUserInput`).
    - 여러 줄을 복사하면 줄 끝까지 빈칸이 붙는다. herdr가 줄을 빈칸으로 채워 그리기 때문이다.
  - 포인터: 터미널 위는 이미 `text`다. 노드 밖으로 끌어 나가면 밑에 있는 요소의 모양(grab 등)이 된다.
- **고친 방법.**
  - 칸 계산: xterm 내부 `_core._mouseService`의 `getCoords`와 `getMouseReportCoords`를 노드마다 감싼다. 선택, 링크, 마우스 보고가 함께 쓰는 곳이다.
    - 넘기는 점은 `unscalePoint`로 확대·축소 전 자리로 되돌린 점이다. 배율은 `getBoundingClientRect().width / offsetWidth`로 구한다.
    - 그러면 xterm의 칸 규칙(칸 절반 앞당김, 넓은 글자, 낱말·줄 고르기)이 그대로 맞는다.
    - 다른 길은 판 transform을 쓰지 않거나 이벤트의 clientX를 바꾸는 것이었다. xterm은 끄는 동안 mousemove를 document에서 받는다. 그래서 창 전체 이벤트를 고쳐야 해서 버렸다.
  - 화면 옮기기: 터미널 안 click은 `termClickNavigates`(한 번 누르기이고 선택이 없을 때)일 때만 `TERM_CLICK_WAIT`(450ms) 뒤에 옮긴다. 그때 다시 선택을 묻는다.
    - 기다리는 동안 다시 누르면(두 번째 누르기, 끌기 시작) 창 전체 mousedown(캡처)에서 취소한다.
  - 선택 지우기(`clearsSelection`): 복사, 붙여넣기, SGR을 보낸 휠에서 지운다.
    - 프레임을 쓴 뒤에는 고른 자리의 글이 고를 때(`onSelectionChange`로 적어 둔 글)와 다르면 지운다. 끄는 중에는 지우지 않는다.
  - 복사 글(`copyText`): 줄마다 끝 빈칸을 뺀다.
  - 포인터: 터미널에서 왼쪽 단추를 누르면 `body.mt-term-selecting`을 붙인다. 놓으면 뗀다. 그동안은 어디서나 `cursor: text`다.
- 고친 뒤 창 시험 61/61(`experiments/p38/p38-select.*`), 창 단위 94/94(새 `p38-lib` 7개), 백엔드 302/302, 빌드 됨.
- 정리: 시험이 셸·claude 세션을 껐고 창을 닫았다. `mt.cjs herdr stop --yes`, `backend stop`, `herdr session delete atrium-dev-p38` 순서로 껐다.
  - 시험 폴더와 시험 대화 기록(`~/.claude/projects/C--Workspace-mtask-p38-dir`, 시험이 띄운 세 대화)을 지웠다. `backend/.dev`의 시험 데이터도 지웠다.
  - 클립보드는 시험마다 앞의 글로 되돌렸다(로그 "클립보드 되돌림 true").

## 보고

### 만든 것

1. **배율 아래 끌어 고르기**(`TerminalView.jsx fixMouseScale`, `lib/term-input.js unscalePoint`)
   - xterm 마우스 서비스의 `getCoords`와 `getMouseReportCoords`에 확대·축소 전 점을 넘긴다. 배율은 요소의 화면 크기 ÷ `offsetWidth`·`offsetHeight`다.
   - 배율 0.5, 0.75, 1, 1.5에서 한 줄·두 줄 끌기, 두 번 눌러 낱말, 세 번 눌러 줄이 마우스 밑 글자와 같다. 노드를 고른 때와 고르지 않은 때, 덩어리 안과 밖이 모두 같다.
   - 내부 API가 없으면(xterm을 올렸을 때) `window.mt.log`에 남기고 원래대로 둔다.
2. **고르는 동안 노드와 판이 그대로**(`Canvas.jsx onNodeClick`, `termClickNavigates`, `TERM_CLICK_WAIT` 450ms)
   - 끌어 고른 뒤의 click과 두세 번 누르기에서는 화면을 옮기지 않는다.
   - 끌지 않은 한 번 누르기는 지금처럼 그 노드로 화면을 옮긴다. 다만 450ms 늦게 옮긴다.
3. **포인터**: 끄는 동안 `body.mt-term-selecting`이 붙어, 노드 밖으로 나가도 글 고르기 모양이다(`styles.css` 끝).
4. **선택 지우기**(`clearsSelection`, Windows Terminal처럼)
   - 복사(Ctrl+C, Ctrl+Shift+C), 붙여넣기(Ctrl+V, Shift+Insert), SGR을 보낸 휠에서 지운다.
   - 프레임을 쓴 뒤 고른 자리의 글이 바뀌었으면 지운다(끄는 중은 빼고).
   - 글 입력은 지금처럼 xterm이 지운다.
5. **복사 글**(`copyText`): 줄마다 끝 빈칸을 뺀다. 줄바꿈은 xterm이 주는 대로(`\r\n`) 둔다.
6. 지금의 규칙(괄호 붙여넣기, Ctrl+G 막기, 선택이 없을 때 Ctrl+C는 ^C, 휠 → SGR, 노드 밖으로 끌기)은 그대로다. 단위 시험과 창 시험에 확인을 넣었다.

### 완료 기준

- 단위: `app/test/p38-lib.test.mjs` 7개.
  - `unscalePoint`을 xterm `getCoords`와 같은 계산에 넣으면 배율 0.25~2에서 칸이 맞는다. 넣지 않으면 어긋난다.
  - `clearsSelection`, `copyText`, `termClickNavigates`, 지금의 키 규칙도 본다.
  - `cd app && npm test` 94/94, `npm run build` 됨, `cd backend && npm test` 302/302.
- 창: `node experiments/p38/tools/e2e.cjs p38-select.mjs` **61/61**(`experiments/p38/p38-select.json`, `.txt`). 고치기 전 코드는 31/61이다(`p38-before-claude.*`).

| 확인 | 결과 | 스크린숏 |
|---|---|---|
| 배율 0.5·0.75·1·1.5, 노드 고름/안 고름, 한 줄·두 줄 끌기 | `getSelection()`이 기대한 글과 같다. 노드 자리와 viewport가 바뀌지 않는다. 중간 포인터는 `text`다 | `p38-select-drag-z*.png` |
| 같은 배율의 두 번·세 번 누르기 | `juliet`, `ROW4 …` 줄. 판 그대로 | |
| 노드 밖으로 끌어 나감 | body 포인터 `text`, 놓으면 클래스가 빠진다 | |
| 덩어리 안 노드(배율 0.5, 1) | 두 줄 끌기가 맞고, 노드와 판이 그대로다 | `p38-select-dock-z*.png` |
| 복사 뒤 | 클립보드 = 고른 글, 선택 지움. 여러 줄은 줄 끝 빈칸 없음 | `p38-select-after-copy.png` |
| 붙여넣기 뒤 | 선택 지움, `p38paste`가 입력 줄에 들어감 | `p38-select-after-paste.png` |
| 글 입력 뒤, 셸 휠 뒤, 셸에서 고른 자리 글이 바뀐 뒤 | 선택 지움 | `p38-select-after-wheel-shell.png` |
| 선택 없이 Ctrl+C | 클립보드가 그대로다(^C) | |
| 끌지 않은 한 번 누르기 | 지금처럼 그 노드로 화면이 옮겨진다 | |
| claude 노드(`--model haiku`, 1~120 출력) 배율 1, 0.75에서 113~114를 고르고 휠 위로 | 화면이 다시 그려지고 선택이 지워진다. 고치기 전에는 108~109 위에 남았다 | `p38-select-claude-wheel-z*.png`, `p38-before-claude-claude-wheel-z*.png` |

### 계획과 다른 곳

- 고친 자리는 `TerminalView.jsx`, `lib/term-input.js`, `Canvas.jsx`(onNodeClick과 모듈 머리의 click 타이머), `styles.css` 끝이다. 화면 글은 더하지 않아 `locales`는 고치지 않았다. P36·P37의 파일은 건드리지 않았다.
- 터미널 안 한 번 누르기의 화면 옮기기가 450ms 늦어졌다. 두 번 누르기와 구별하려면 기다려야 한다.
- 지시에 없던 두 가지를 더했다.
  - 고른 자리의 글이 바뀌면 지운다(휠 말고도 Claude Code 출력이나 셸 `cls`로 글이 바뀔 때).
  - 복사할 때 줄 끝 빈칸을 뺀다.

### 알려진 문제

- 칸 보정은 xterm 내부(`_core._mouseService`)에 기댄다. `@xterm/xterm`을 6.0.0에서 올리면 `p38-lib` 시험의 계산식과 창 시험 `p38-select`로 다시 확인해야 한다.
- 고른 자리 안의 글이 저절로 바뀌면(예: 고른 범위에 Claude Code의 상태 줄이나 스피너가 들어감) 복사하기 전에 선택이 지워진다. 글을 따라갈 수 없어 지우는 쪽을 골랐다.
- 고른 채로 휠을 굴려 범위를 넓히는 것은 하지 않았다(지시대로). 휠을 굴리면 선택이 지워진다.
- 고르는 동안 노드 가장자리 아래로 끌어도 화면이 스크롤되지 않는다(scrollback 0, 지금과 같다).

### 고쳐야 할 ARCH 행(새 문장)

- 7.2 가까이 얼굴, 붙여넣기 줄 뒤에 다음을 더한다. "판의 확대·축소 아래에서도 끌어 고르기가 마우스 밑 글자를 따라가게, xterm의 마우스 → 칸 계산에 확대·축소 전 자리를 넘긴다. 복사, 붙여넣기, 휠 뒤와 고른 자리의 글이 바뀌면 선택을 지운다(Windows Terminal처럼). 복사는 줄 끝 빈칸을 뺀다."
- 7.2 가까이 얼굴: "터미널 안을 끌어 고르거나 두세 번 누르면 판은 움직이지 않는다. 끌지 않은 한 번 누르기만 그 노드로 화면을 옮긴다."
- 모듈 표에는 `lib/term-input.js` 행이 없어 고칠 행이 없다.
