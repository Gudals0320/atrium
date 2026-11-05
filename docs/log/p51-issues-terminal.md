상태: 열림
날짜: 2026-11-05

## 지시

### 목표

사용성 검증(ux1)이 올린 GitHub 이슈 가운데 터미널 이슈 #3, #7를 재현하고 고친다. 사용자의 말: "열려 있는 이슈 보고 재현-수정을 맡겨."

맡은 이슈:
- **#3** Multi-line paste into a shell node runs every line but the last without Enter (S2). 셸 노드에 여러 줄을 붙여 넣으면 마지막 줄 말고는 Enter 없이 곧바로 실행된다. 사용성 원칙 U8(마지막 Enter는 사람이)에 어긋난다. 괄호 붙여넣기(`lib/term-input.js` `wrapPaste`)가 셸(PowerShell, PSReadLine)에서 어떻게 받아들여지는지부터 본다. Claude 노드의 여러 줄 붙여넣기(입력칸에 여러 줄로 들어감)는 지금처럼 둔다.
- **#7** Shell node wheel scrolls about 2 lines per notch and a whole line per small touchpad step (S3). 셸 노드 휠(P42의 판 안 기록 스크롤)이 한 칸에 약 2줄, 터치패드의 작은 움직임마다 한 줄씩 움직인다. 보통 터미널(Windows Terminal)과 비슷한 줄 수와 작은 움직임의 모으기를 정하고 까닭을 적는다.

고칠 곳(짐작): `app/src/renderer/lib/term-input.js`, `term-selection.js`, `lib/term-select.js`, `TerminalView.jsx`(붙여넣기·휠 부분만, P49가 붙여넣기 업로드를 함께 고친다)

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
  - `ATRIUM_HERDR_SESSION=atrium-dev-p51`, `ATRIUM_PORT=47870`
  - `ATRIUM_DATA_DIR=<워크트리>/backend/.dev/data`, `ATRIUM_APP_USERDATA=<워크트리>/backend/.dev/app`
- 실제 판(`atrium`, 47800)과 다른 포트(47811~47872 가운데 네 것 말고)는 쓰지 않는다.
- 대화 목록은 시험 폴더의 대화만 읽는다(`ATRIUM_CLAUDE_PROJECTS`, `ATRIUM_CLAUDE_DESKTOP=none`). 시험 폴더는 `C:\Workspace\mtask-p51-*`처럼 새로 만든다.
- 세션은 되도록 셸 노드로 시험한다. claude가 꼭 필요하면 `--model haiku`, 턴은 짧게.
- 끝나면 시험 세션, 창, 백엔드, herdr 서버와 세션(`atrium-dev-p51`만), 시험 폴더, 시험 대화 기록을 끄고 지운다.

### 지킬 것

- `CLAUDE.md`를 따른다. 프로세스는 직접 띄운 것만 PID로 끈다.
- 이 저장소는 공개다. 작업 기록, 시험 코드, 커밋 메시지, 댓글 초안에 사용자 경로·메일·토큰을 쓰지 않는다. 커밋 전·푸시 전 검사를 건너뛰지 않는다.
- 같은 때 다른 작업자들이 돈다. 맡은 이슈에 필요한 만큼만 작게 고치고, 남의 영역을 고쳤으면 보고에 적는다.
  - P49(원격 R3): P47·P48을 합치는 중이다. `relay.mjs`, `api.mjs`, `api.js`, `store.js`, 웹 화면(`web.js`, `web.mjs`), 짝 맺기, `SpawnDialog.jsx`의 폴더 찾아보기, `TerminalView.jsx`·`CommandBar.jsx`의 붙여넣기 업로드, 설정의 연결된 기기를 고친다.
  - P50(캔버스 #2·#6), P51(터미널 #3·#7), P52(크롬 #4·#5), P53(#8·#9·#10)
- 화면 글을 더할 때는 `locales/en.js`·`ko.js` 끝에 더한다(고치는 것은 그 자리). 한국어는 P39 말투(합니다체)와 용어를 따른다. `styles.css`에 더할 때는 끝에 더한다.
- 자기 브랜치에만 커밋한다. 커밋 메시지에 `Co-Authored-By` 줄을 넣지 않는다. `main`을 바꾸거나 푸시하지 않는다. `node_modules`는 워크트리 안에서 받는다(`npm ci`).
- 문서는 이 작업 파일의 작업 기록 절과 보고 절만 고친다. 고쳐야 할 ARCH 행이 있으면 새 문장을 보고 절에 짧게 적는다.
- 끝나면 보고 절을 쓰고, 맨 마지막에 `<워크트리>/backend/.dev/p51.done`(브랜치 이름과 마지막 커밋 해시 두 줄)을 만든다.

## 작업 기록

- 판: herdr 세션 `atrium-dev-p51`, 포트 47870, 이 워크트리의 `backend/.dev`. 시험 폴더는 새로 만든 `mtask-p51-dir` 하나, 세션은 셸만 썼다(claude 없음). 판 값은 `experiments/p51/tools/env.cjs`(git 밖).
- #3 재현(CLI): 셸 패널에 지금 창이 보내는 모양(`ESC[200~echo bp-1 CR echo bp-2 CR echo bp-3 ESC[201~`)을 `atrium input`으로 넣으니 bp-1, bp-2가 곧바로 돌고 bp-3만 입력줄에 남았다. 셸은 Windows PowerShell 5.1(PSReadLine 2.0)이다.
- #3 실험: 줄바꿈 대신 win32-input-mode의 Shift+Enter 키 누름·뗌(`ESC[13;28;13;1;16;1_ ESC[13;28;13;0;16;1_`)을 넣으니 ConPTY가 Shift+Enter 키로 바꾸고 PSReadLine이 AddLine으로 받아 `>>` 이어 줄이 쌓였다. 아무것도 돌지 않았고, Enter 한 번에 세 줄이 차례로 돌았다. 괄호 붙여넣기 표시와 함께 보내도 같았다.
- #3 원인: 판은 붙여넣기를 괄호 붙여넣기로 감싸지만, PSReadLine 2.0은 괄호 붙여넣기를 모른다(2.2부터 안다). 그래서 글 안의 CR이 하나하나 Enter(제출)가 된다.
- #7 재현(창, 고치기 전 `main` 코드로 빌드): 한 칸(deltaY 100) 2줄, deltaY 10 열 번 23줄, 다섯 칸 11줄(rows 18). 이슈의 측정과 같다.
- #7 원인: 셸 노드는 xterm 자체 기록 스크롤에 맡겼다(`attachCustomWheelEventHandler`에서 `return true`). xterm 6의 기록 스크롤은 안쪽 스크롤 요소가 휠을 받아 작은 값마다 한 줄 이상 움직인다. 처음에는 사용자 휠 처리기에서 직접 굴리고 `false`를 돌려주게 고쳤지만 값이 그대로였다. xterm 6은 안쪽 스크롤 요소가 사용자 휠 처리기보다 먼저 휠을 받기 때문이다. 그래서 터미널 바깥 요소(host)에서 캡처 단계로 먼저 받게 했다.
- 고친 뒤 창 시험 `app/test/e2e/p51-terminal.mjs`: 4/4 통과. 붙여넣기 직후 실행된 줄 0개, 이어 줄 셋 쌓임, Enter 뒤 세 줄 돎. 휠 한 칸 3줄, deltaY 10 열 번 3줄, 다섯 칸 15줄, 아래로 굴리면 맨 아래로 돌아옴.
- 고치기 전 같은 시험: 2/4(붙여넣기 두 줄 실행, 휠 2·23·11줄). 결과와 스크린숏은 `experiments/p51/`(고치기 전 파일은 `-before`).
- 회귀 확인: P42 창 시험 `p42-select.mjs`의 셸 부분(`--no-claude`)을 이 판 값으로 바꾼 임시 사본으로 돌려 16개 모두 통과했다(고른 뒤 휠 300px에 선택이 9줄 따라 움직임, 끄는 중 휠로 선택이 늚, 배율 1과 0.75). 사본은 지웠다.
- 단위 시험 `app/test/p51-lib.test.mjs`(5개). 처음 돌릴 때 deltaY 10 열 번이 2줄로 나왔다. 0.03 × 10이 2.9999…가 되는 소수 오차라, 단계 수를 셀 때 아주 작은 값을 더해 버리게 고쳤다.
- 정리: 시험 세션 끔, 창 닫음, 백엔드와 herdr 서버 멈춤, herdr 세션 `atrium-dev-p51` 지움, 시험 폴더와 판 데이터(`backend/.dev/data`, `app`) 지움. 시험 대화 기록은 없다.

## 보고

### 바꾼 것

- `app/src/renderer/lib/term-input.js`
  - `wrapPaste(text, { shell })`: `shell`이면 줄바꿈을 `SHIFT_ENTER`(win32-input-mode Shift+Enter 누름·뗌)로 바꾼다. 아니면 지금처럼 CR.
  - `wheelSteps`: 휠 값을 단계 수로 바꾸고 소수 부분을 모은다(`wheelToSgr`와 셸 휠이 함께 쓴다. `wheelToSgr`의 동작은 그대로).
  - `shellWheelLines`, `SHELL_WHEEL_LINES = 3`: 셸 휠 100px에 3줄.
- `app/src/renderer/TerminalView.jsx`(붙여넣기·휠 부분만)
  - 붙여넣기: 그때의 세션 종류가 `shell`이면 `wrapPaste(text, { shell: true })`. 셸 안에서 띄운 에이전트로 종류가 바뀔 수 있어 마운트 때가 아니라 붙여넣을 때 본다. P49가 고치는 붙여넣기 업로드와 같은 처리기(`onPaste`)의 마지막 줄 하나만 바꿨다.
  - 휠: 셸이면 host에 캡처 단계 `wheel` 처리기(`onShellWheel`)를 달아 xterm보다 먼저 받고, 모은 줄 수만큼 `term.scrollLines`. 선택은 지금처럼 onScroll로 따라온다.
- 시험: `app/test/p51-lib.test.mjs`(단위), `app/test/e2e/p51-terminal.mjs`(창. 시스템 클립보드를 쓰고 끝에 앞의 글로 되돌린다).
- 남의 영역은 고치지 않았다.

### #3 여러 줄 붙여넣기

- 재현: 됨(고치기 전 코드, CLI와 창 둘 다).
- 원인: Windows PowerShell 5.1의 PSReadLine 2.0은 괄호 붙여넣기를 모른다. 감싼 글 안의 CR이 하나하나 제출된다.
- 수정: 셸 노드는 줄바꿈을 Shift+Enter로 보낸다. PSReadLine에서 Shift+Enter는 AddLine이라 여러 줄이 입력줄에 쌓이고, 사람이 Enter를 쳐야 돈다(U8). 이슈가 제안한 확인 창(Windows Terminal의 여러 줄 붙여넣기 경고)보다 이것을 고른 까닭: 묻기를 하나 더하지 않고, 붙여 넣은 글을 보고 고친 뒤 Enter를 칠 수 있으며, PSReadLine 2.2+(pwsh 7)에서도 같은 AddLine이라 똑같이 동작한다.
- 남은 것: 셸 노드 안에서 PSReadLine이 아닌 프로그램(cmd, python·node REPL 등)이 앞에 있으면 Shift+Enter는 Enter와 같아 지금처럼 줄마다 돈다(나빠지지는 않는다). 그 경우까지 막으려면 셸이 프롬프트가 아닐 때(`shell.atPrompt` false) 확인을 묻는 방법이 있다. Claude 노드 붙여넣기는 바꾸지 않았다. 붙여 넣은 글 속 탭은 PSReadLine에서 자동 완성이 되는 점도 그대로다.
- 시험: 단위 2개, 창 시험 2단계 통과(붙여넣기 뒤 실행 0줄·이어 줄 3, Enter 뒤 세 줄 돎).

### #7 셸 휠

- 재현: 됨(한 칸 2줄, deltaY 10 열 번 23줄, 다섯 칸 11줄).
- 원인: 셸 노드 휠을 xterm 6의 기록 스크롤에 맡겼는데, 그 스크롤은 휠 한 번마다 적어도 한 줄을 움직여 작은 값이 많은 터치패드에서 멀리 간다. xterm 6은 안쪽 스크롤 요소가 사용자 휠 처리기보다 먼저 휠을 받아, 처리기에서는 막을 수 없었다.
- 수정: 터미널 바깥 요소에서 캡처 단계로 휠을 먼저 받아, 픽셀 값을 모아 100px에 3줄로 `scrollLines`한다. 줄 단위 휠은 그 줄 수, 쪽 단위는 한 화면. 3줄로 정한 까닭: Windows Terminal의 기본이고, Windows의 "한 번에 스크롤할 줄 수" 기본값(3)과 같다. Chromium은 휠 한 칸을 그 설정에 비례한 픽셀(기본 100px)로 주므로, 사용자가 Windows 설정을 바꾸면 그 비율을 따라간다. 모으기는 소수 부분을 다음 휠에 넘기는 방식이라 같은 거리면 휠 값이 크든 작든 같은 줄 수가 간다.
- 남은 것: 디스플레이 배율이 1이 아닐 때 Chromium의 휠 픽셀 값은 확인하지 않았다(시험은 배율 1).
- 시험: 단위 3개, 창 시험 2단계 통과(한 칸 3줄, 작은 휠 열 번 3줄, 다섯 칸 15줄, 맨 아래로 돌아옴). P42 셸 선택 시험 16개 통과.

### 완료 기준 확인

- `cd backend && npm test`: 358 통과, 0 실패.
- `cd app && npm test`: 156 통과, 0 실패.
- `cd app && npm run build`: 성공.

### ARCH 7.2 고칠 문장(제안)

- 붙여넣기 줄: "붙여넣기는 가로채 `ESC[200~ … ESC[201~`로 감싸 보낸다. 감싸지 않으면 줄마다 따로 제출된다. 셸 노드는 줄바꿈을 Shift+Enter(win32-input-mode)로 보내 PSReadLine이 줄을 쌓기만 하고, 마지막 Enter는 사람이 친다(P51)."
- 휠 줄 끝: "셸 노드는 휠을 캡처 단계에서 먼저 받아 100px에 3줄로 판 안 기록을 스크롤한다(P51)."

### 이슈 댓글 초안

#3:

> Cause: Windows PowerShell 5.1 ships PSReadLine 2.0, which does not understand bracketed paste, so each CR inside the wrapped paste was a submit. Fix: shell nodes now send line breaks in a paste as Shift+Enter (win32-input-mode key sequence); PSReadLine treats that as AddLine, so all lines stack at the prompt (`>>`) and nothing runs until you press Enter. Claude Code nodes are unchanged. Remaining: if a non-PSReadLine program (cmd, a Python/Node REPL) is in the foreground of a shell node, Shift+Enter acts like Enter and lines still run one by one.

#7:

> Cause: shell nodes left wheel handling to xterm 6's own scrollback viewport, which moves at least one line per event and receives the wheel before the custom wheel handler. Fix: shell nodes now take the wheel in the capture phase, accumulate pixel deltas and scroll 3 lines per 100 px (Windows Terminal default; follows the Windows lines-per-notch setting through Chromium's deltas). Measured: one notch 3 lines, ten deltaY 10 events 3 lines, five notches 15 lines. Not checked: display scales other than 100%.
