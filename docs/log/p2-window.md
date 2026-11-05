상태: 닫힘
날짜: 2026-10-29

## 지시

### P2 작업 지시: 최소 화면(v0.1)(옛 `docs/briefs/P2.md`)

2026-10-29에 작업자 CLI 세션에 맡기려고 쓴 지시다.

#### 먼저 읽을 것

- `CLAUDE.md`, `docs/BRIEF.md`, `docs/PLAN.md`, `docs/P1.md`
- `docs/experiments/E4.md`, `E9.md`, `E10.md`
- `docs/research/reference.md`, `docs/research/opencove.md`
- `backend/` 코드

#### 할 일

PLAN 7절의 P2, 즉 BRIEF 5절의 v0.1 화면을 만든다.

- Electron 창 하나에 React, `@xyflow/react`, xterm.js로 판을 만든다. 코드는 새 최상위 폴더에 둔다.
- 창은 P1 백엔드의 WebSocket API에 붙는다. 필요한 백엔드 기능은 `backend/`에 더한다.
- PLAN 3절(상태), 4절(시나리오), 9절(무한 캔버스)을 따른다.

#### 완료 기준

개발용 프로필에서 실제 claude 세션으로 아래가 모두 되어야 한다.

1. `npm start`로 창 하나가 열리고, 판을 끌어 옮기고 확대·축소할 수 있다. 개발용 백엔드와 herdr가 없으면 창이 띄운다.
2. 창에서 claude 세션 4개를 시작한다. 노드마다 제어기 프레임을 xterm.js로 그리고, 노드에 글을 칠 수 있다.
3. 노드의 상태 필이 백엔드 상태(waiting, trust_wait, 검토 대기 포함)를 따른다. 위쪽 "내 차례" 줄에 내 답이 필요한 세션이 모두 나오고, `N`을 누르면 노드를 옮기지 않고 화면이 다음 세션으로 간다.
4. 아래쪽 명령 바에서 `@이름 글`을 보내고 전달 상태를 보여준다.
5. 승인 카드에서 권한 요청(승인과 거부 둘 다)과 단일 선택 질문에 답한다. 키와 보내기 전 확인은 PLAN 4절 A1을 따른다. 이를 위해 백엔드에 `session.answer`를 더한다.
6. E4와 PLAN 9.2의 터미널 입력 규칙을 지킨다: unicode11, 붙여넣기를 괄호 붙여넣기로 감싸기, 휠을 SGR 마우스 시퀀스로 바꾸기, 프레임 크기 맞추기.
7. 창을 닫았다 다시 열면 배치가 그대로이고, 세션은 계속 돌았고, 화면이 돌아온다(PLAN C1).
8. **E5:** 가까이 보이는 노드 8개에 제어기를 붙인 상태에서 메모리, CPU, 프레임 지연을 잰다. BRIEF 위험 2의 WebGL 상한과 DOM 대체를 적용한다. 결과를 `docs/experiments/E5.md`에 쓴다.
9. **E6:** 터미널 노드에서 한글 IME 입력을 확인한다. CDP 조합 이벤트처럼 자동화할 수 있는 것은 자동화하고, 사람이 확인할 짧은 점검표와 함께 `docs/experiments/E6.md`에 쓴다.

#### 확인 방법

- 창은 Playwright의 Electron 지원이나 CDP로 조작하고 스크린숏을 찍는다. 스크린숏과 로그는 `experiments/p2/`에 둔다.
- P1 단위 시험은 계속 통과해야 한다. 새 백엔드 코드에는 시험을 더한다.
- 시험용 claude 세션은 `--model haiku`로 띄우고 턴은 아주 짧게 한다.

#### 규칙

- `CLAUDE.md`를 따른다.
- 개발용 프로필(`--dev`)만 쓴다. 실제 판의 값으로는 띄우지 않는다. 창도 `mtask`와 같은 방법으로 프로필을 고른다.
- 참고 제품에서는 화면 구성과 동작만 참고한다. 코드, 이름, 로고, 에셋은 가져오지 않는다.
- OpenCove 파일을 가져오면 `CLAUDE.md`의 MIT 고지 규칙을 지킨다.
- 기본 herdr 세션, 데스크톱 앱 세션, 그 밖의 기존 세션은 건드리지 않는다.
- 직접 띄운 프로세스만 PID로 끈다.
- `~/.claude/settings.json`을 고치지 않는다.
- 끝나면 시험 세션을 끄고, 창을 닫고, 개발용 백엔드와 herdr 서버를 멈추고, 그 herdr 세션을 지운다.
- `docs/PLAN.md`와 `docs/BRIEF.md`는 고치지 않는다. 커밋하지 않는다.

#### 보고

마지막에 `docs/P2.md`를 한국어로 쓴다.

- 무엇을 만들었는지
- 돌리는 법
- 완료 기준마다의 증거(스크린숏 경로 포함)
- PLAN과 다르게 한 곳과 그 이유
- 사용자가 손으로 해 볼 것
- PLAN과 BRIEF에서 바꿀 것

### 지휘 세션이 정한 범위와 완료 기준(옛 `docs/PLAN.md` 7절)

Electron 창, 판, 터미널 노드 4개, 상태 표시, 내 차례 목록과 `N` 이동, 명령 바, 승인 카드(답하기 포함). `docs/BRIEF.md`의 위험 1(한글 입력), 2(콘솔이 많을 때)를 확인한다. E4는 headless와 스크린숏 기준이었으므로, 실제 Electron 창에서 붙여넣기, 휠, 한글 IME(E6)를 함께 본다. 실제 턴의 프레임은 화면 차이분이라 세션당 수 KB였다(150줄 출력 턴에 약 5KB). 100~135KB는 한 세션 전체 기록이라 E5에서는 합성 부하로 따로 재현했다.

## 작업 기록

문서 규약(`docs/README.md`)을 도입하기 전(2026-10-31)의 작업이라 작업 기록을 따로 남기지 않았다. 작업하며 알아낸 것과 계획과 다르게 한 곳은 보고 절에 있다.

## 보고

### P2. 최소 화면(v0.1)(옛 `docs/P2.md`)

2026-10-29에 만들고 시험했다. 결론부터 적으면 **`docs/briefs/P2.md`의 완료 기준 9개를 개발용 프로필에서 실제 claude 세션으로 모두 확인했다.** 단 E6(한글 IME)은 CDP로 자동화할 수 있는 부분만 확인했고, 실제 IME는 사람이 점검표로 본다(`docs/experiments/E6.md` 4절). E5에서 WebGL 컨텍스트를 일부러 잃게 한 시험 네 번 중 한 번은 모든 터미널이 놓였고 원인을 찾지 못했다(7절).

창은 Electron 창 하나에 React, `@xyflow/react`, xterm.js로 판을 그리고, P1 백엔드의 WebSocket API에 붙는다. 시험 claude 세션은 모두 `--model haiku`였고 턴은 한 줄 답이나 150줄 출력처럼 짧았다. 개발용 herdr 세션 `multitask-dev`, 포트 47811, 데이터 폴더 `backend/.dev/data`만 썼다.

만들면서 백엔드의 P1 버그 하나를 고쳤다. 세션을 잇달아 띄우면 herdr 이벤트 구독을 바꾸는 사이에 `agent_detected`를 잃었고, 그 세션으로 보낸 글이 `queued(no_agent)`로 멈췄다(5절 1).

#### 1. 만든 것

새 최상위 폴더 `app/`에 두었다. JavaScript(ESM, JSX)이고, 창 화면은 esbuild로 한 파일로 묶는다.

| 구성 | 버전 |
|---|---|
| Electron | 45.1.0 |
| React | 19.3.1 |
| `@xyflow/react` | 12.12.0 |
| `@xterm/xterm` | 6.0.0(E4는 5.5.0이었다), `addon-webgl` 0.19.0, `addon-unicode11` 0.9.0, `addon-fit` 0.11.0 |
| 묶기, 시험 | esbuild 0.28.2, Playwright 1.64.1(Electron 지원) |

| 파일 | 하는 일 |
|---|---|
| `src/main/main.mjs` | Electron main. 프로필을 mtask와 같은 방법으로 고르고(`--dev`, `MTASK_*`), 백엔드가 없으면 띄운다. 창을 닫으면 앱만 끝나고 백엔드와 herdr는 계속 돈다 |
| `src/main/preload.cjs` | 창에 백엔드 주소와 토큰, Electron 프로세스 측정값(E5), 로그 한 줄만 넘긴다 |
| `src/renderer/api.js`, `store.js` | 백엔드 WebSocket 클라이언트(끊기면 1초 뒤 다시 붙음), 세션 요약·판 배치·전달 상태 |
| `src/renderer/Canvas.jsx` | 판(무한 캔버스). 끌기·크기 바꾸기·화면 이동을 저장하고, 가까이 보이는 노드에만 제어기를 붙인다. 노드를 옮기지 않고 화면만 옮기는 `navigateTo` |
| `src/renderer/SessionNode.jsx` | 세션 노드: 머리줄(이름, 상태 필, 기다린 시간, 검토 대기 등 표시, 끄기)과 세 얼굴, 승인 카드, 끄기 확인 |
| `src/renderer/TerminalView.jsx` | 가까이 얼굴. 제어기 프레임을 xterm.js로 그리고 입력 규칙(E4)을 지킨다. WebGL 예산과 DOM 대체 |
| `src/renderer/ChatView.jsx` | 중간 얼굴. 대화 기록의 지시, 답, 도구 사용 |
| `src/renderer/ApprovalCard.jsx` | 승인 카드. 권한 요청, 질문(단일 선택, 직접 입력, 여러 개, 여러 질문), 계획 승인, 신뢰 확인 안내 |
| `src/renderer/InboxBar.jsx` | 위쪽 "내 차례" 줄, 검토 대기, 문제, 연결 상태, 새 세션 버튼 |
| `src/renderer/CommandBar.jsx` | 아래쪽 명령 바. `@` 대상 메뉴, 최근 50개 다시 부르기, 전달 상태와 취소 |
| `src/renderer/SpawnDialog.jsx` | 새 세션. 신뢰 확인 예상을 미리 보여준다 |
| `src/renderer/lib/term-input.js` | 붙여넣기 감싸기, 휠 → SGR, 키 처리(순수 함수) |
| `src/renderer/lib/faces.js` | 얼굴 기준, 제어기 붙일 노드 고르기, WebGL 예산, 내 차례 순서(순수 함수) |
| `src/renderer/perf.js` | E5 측정값(프레임, 쓰기 시간, 화면 갱신 간격, 입력 → 프레임) |
| `test/renderer-lib.test.mjs` | 위 순수 함수의 단위 시험 9개 |
| `test/e2e/*.mjs` | Playwright로 실제 창을 띄워 조작하는 시험(3절의 증거) |

**백엔드에 더하거나 고친 것(`backend/`)**

| 파일 | 내용 |
|---|---|
| `src/answer.mjs`(새 파일) | 답하기(PLAN 5절, 4절 A1). 카드의 답을 키 순서로 바꾸고, 허용한 키만 보낸다. 대화로 이어지는 선택지는 `answer_in_terminal`로 거부 |
| `src/backend.mjs` | `session.answer`: 보내기 직전에 `agent.get`으로 `blocked`인지, 카드의 요청(`tool_use_id`)이 아직 기다리는 요청인지 확인. 판이 보낸 키를 `answer` 이벤트로 남긴다. 계획 승인 선택지도 화면에서 읽는다. 놓친 `agent_detected`를 상태 이벤트로 메우는 안전망 |
| `src/herdr/adapter.mjs` | 이벤트 구독을 바꿀 때 이벤트를 잃던 버그 수정, 구독 바꾸기를 하나씩(5절 1) |
| `src/screen.mjs` | 화면 폭에서 줄바꿈된 권한 선택지를 이어 붙인다("…for this session (shift+tab)") |
| `src/relay.mjs` | 프레임과 `terminal.detached`에 `controllerPid`를 붙인다. 창이 옛 제어기의 늦은 이벤트를 가린다 |
| `src/client.mjs`(새 파일) | 백엔드 찾기·띄우기·끄기와 WebSocket 클라이언트. mtask와 창 main이 같이 쓴다(mtask에 있던 코드를 옮김) |
| `bin/mtask.mjs` | 위 모듈을 쓰고, `mtask answer <이름> <번호|reject|amend> [--text] [--picks]`를 더했다 |
| `test/unit.test.mjs` | 답하기 4개, 구독 바꾸기 1개를 더하고 줄바꿈 선택지 확인을 더했다. 모두 23개 |

OpenCove 코드는 가져오지 않았다. WebGL 예산 기본값 8과 "멀리서는 요약"이라는 생각만 참고했다. 참고 제품에서는 화면 구성과 동작(내 차례 칩, N, 명령 바, 상태 필)만 참고했다.

#### 2. 돌리는 법

```
cd backend && npm install && cd ..
cd app && npm install        # npm 12는 설치 스크립트를 막는다. package.json의 allowScripts에 electron, esbuild를 허용해 두었다
npm start                    # 화면을 묶고 개발용 프로필로 창을 띄운다. 개발용 백엔드와 herdr가 없으면 창이 띄운다
npm test                     # 창 쪽 단위 시험
cd ../backend && npm test    # 백엔드 단위 시험
```

- `npm start`는 `node scripts/build.mjs && electron . --dev`다. 프로필은 mtask와 같다: `--dev` 또는 `MTASK_PROFILE=dev`, 환경 변수 `MTASK_HERDR_SESSION`, `MTASK_PORT`, `MTASK_DATA_DIR`가 기본값을 덮는다. 실제 판 프로필(`electron .`)로는 띄우지 않았다.
- 창이 띄우는 백엔드는 시스템의 Node 24로 돈다(`node:sqlite`가 필요하다). 다른 Node를 쓰려면 `MTASK_NODE`에 경로를 준다.
- **창을 닫아도 백엔드와 herdr, claude 세션은 계속 돈다.** 끝내려면 창을 먼저 닫고 `node backend/bin/mtask.mjs --dev herdr stop --yes`, `... backend stop`을 한다. 창이 열린 채 백엔드를 끄면 창이 백엔드를 다시 띄운다(6절 7).
- 시험 스크립트: `cd app && node test/e2e/<이름>.mjs`. 결과와 스크린숏은 `experiments/p2/`에 쌓인다. 시험이 기대하는 세션 이름은 `a`~`d`(완료 기준 2~7), `a`~`h`(E5)다.

**화면 쓰는 법**

| 동작 | 방법 |
|---|---|
| 판 옮기기, 확대·축소 | 빈 곳 끌기, 휠. 오른쪽 아래 +, −, 전체 보기 |
| 노드 옮기기, 크기 바꾸기 | 머리줄을 끈다. 노드를 눌러 고르면 모서리 손잡이가 나온다(가까이 얼굴일 때) |
| 새 세션 | 오른쪽 위 "+ 새 세션". 개발용은 폴더 `backend/.dev/proj`, 모델 `haiku`가 기본값 |
| 내 차례로 가기 | 위쪽 칩을 누르거나 판에 초점이 있을 때 `N`(내 차례 → 문제 순서로 돈다) |
| 명령 | `Ctrl+K`, `@이름 글` Enter. Shift+Enter 줄바꿈, `@`를 치면 대상 메뉴, Tab으로 고름, ↑↓로 지난 명령 |
| 답하기 | 노드 위 승인 카드의 단추 |
| 세션 끄기 | 머리줄 × → 확인 문구 → "끄기" |

**얼굴 기준(P2에서 정함):** 노드가 화면에서 차지하는 너비로 정한다. 360px 이상이면 가까이(터미널), 200px 이상이면 중간(대화 보기), 그보다 작으면 멀리(요약). 기본 노드 720px이면 배율 0.5, 0.28이 경계다. 제어기는 가까이 얼굴이면서 화면에 보이는 노드에만, 화면 가운데에 가까운 순서로 최대 8개 붙인다. 화면 밖으로 나간 노드는 1.5초 기다렸다가 놓는다.

#### 3. 완료 기준별 증거

시각은 UTC다. 로그와 스크린숏은 `experiments/p2/`에 있다.

##### 1. `npm start`로 창이 열리고, 판을 끌어 옮기고 확대·축소한다. 개발용 백엔드와 herdr가 없으면 창이 띄운다

- **백엔드와 herdr가 없을 때:** 처음 띄운 창(`smoke.txt`, `smoke.png`)이 백엔드(pid 34760)를 띄웠고, 백엔드가 herdr 서버(`multitask-dev`)를 깨끗한 환경으로 띄웠다(`backend.log`: `12:46:53 herdr server started`). 마지막에 시험 세션을 모두 끄고 백엔드와 herdr를 멈추고 herdr 세션을 지운 뒤 `npm start`를 다시 돌렸다(`npm-start.txt`): 화면을 묶고, 창(pid 44152)이 백엔드(47380)를 띄우고, 백엔드가 herdr(48316, 0.9.5, protocol 22, 호환)를 띄웠다.
- **끌기와 확대·축소**(`c1-canvas.txt`, `c1-pan-zoom.png`): 빈 곳을 (200, 100)px 끌자 `translate(72, 303.6)` → `translate(272, 403.6)`. 휠 위로 `scale(0.48)` → `0.73`, 아래로 `0.32`.
- **노드 끌기와 저장:** c를 a 아래로, d를 b 아래로 끌었다. `board.get`에 `c=(74,475)`, `d=(836,475)`로 저장됐다(`c1-2x2-four-terminals.png`).

##### 2. 창에서 claude 세션 4개를 시작하고, 노드마다 제어기 프레임을 xterm.js로 그리고, 노드에 글을 친다

- "+ 새 세션" 대화상자로 a, b, c, d를 시작했다(`c2-spawn.txt`, `c2-spawn-dialog.png`). 넷 모두 5초 안에 ready였다.
- 넷이 가까이 얼굴이 되게 맞추자 제어기 4개가 붙고 넷 모두 WebGL로 Claude Code 화면을 그렸다(`c1-2x2-four-terminals.png`, 100×27, 첫 프레임 5.5KB).
- a의 터미널을 눌러 키보드로 "typed-from-node 한글"을 쳤다. a의 입력칸이 `❯ typed-from-node 한글`이 됐고(`c2-typed-in-node.png`), Backspace로 지웠다(제출하지 않음).

##### 3. 상태 필이 백엔드 상태를 따르고, "내 차례" 줄에 내 답이 필요한 세션이 모두 나오고, `N`으로 노드를 옮기지 않고 화면이 다음 세션으로 간다

`c345.txt`(마지막 빌드로 다시 돈 것. 처음 돈 것은 `c345-run1.txt`), `c3-trust.txt`.

- **waiting:** b, c에 Write 권한 요청, d에 AskUserQuestion을 시키자 셋의 필이 `waiting`("내 차례")이 됐다. 위쪽 줄: `@b 권한: Write: …perm-b.txt 5초`, `@c 권한: Write: …perm-c.txt 3초`, `@d 질문: Which color do you prefer? 1초`(오래 기다린 순서, `c3-needs-you-cards.png`).
- **검토 대기:** a가 턴을 끝내자 `ready` 필 옆에 "검토 대기" 표시가 붙고 위쪽 "검토 대기" 칩에 나왔다(`c3-review-pending.png`).
- **trust_wait:** 새 임시 폴더로 시작하자 대화상자가 미리 "처음 쓰는 폴더다…"를 보였고(`c3-trust-dialog-warning.png`), 시작한 뒤 필이 `trust_wait`("신뢰 확인"), 위쪽 칩이 `@t 처음 쓰는 폴더 신뢰 확인`, 카드가 "터미널에서 답하기"였다(`c3-trust-wait.png`). 머리줄 ×와 확인으로 껐다(`c3-trust-kill-confirm.png`). 백엔드가 esc로 나가 `trust_wait → exited`(`trust_declined`). 신뢰는 누르지 않았고, 폴더는 지웠다.
- **N:** 판을 누른 뒤 `N`을 네 번 눌렀다. 화면이 b → c → d → b로 갔고 배율은 1이었다(`c3-n-1-b.png`, `c3-n-2-c.png`, `c3-n-3-d.png`). 누르기 전후의 `board.get` 노드 배치가 같았다("노드 자리 그대로 true").

##### 4. 명령 바에서 `@이름 글`을 보내고 전달 상태를 보여준다

- `@a Reply with exactly: alpha-ok`: 전달 칩이 `대기 중 → 보내는 중 → 보냄 → 제출 확인`으로 바뀌었다(`c4-delivery-confirmed.png`). a의 답은 `alpha-ok`.
- 권한 요청에 막힌 b에 `@b Reply with exactly: queued-ok`를 보내자 칩이 "대기 중(답 기다리는 중)"이 됐다(`c3-needs-you-cards.png` 아래쪽). 카드로 승인한 뒤 차례: `queued → queued(waiting) → queued(working) → sending → sent → confirmed`, 답 `queued-ok`.
- `@` 대상 메뉴: `@`를 치면 `@all (모두)`와 세션 이름, `@b`를 치면 `@b`만, Tab으로 `"@b "`가 됐다(`misc.txt`, `misc-mention-menu.png`).

##### 5. 승인 카드에서 권한 요청(승인, 거부)과 단일 선택 질문에 답한다

`c345.txt`, `c3-needs-you-cards.png`, `c5-answered.png`, `c5-after.png`.

- 권한 카드는 hook의 도구와 파일(`Write: …perm-b.txt`), 화면에서 읽은 질문("Do you want to create perm-b.txt?")과 선택지 3개를 보였다. 질문 카드는 hook의 질문과 선택지(Red, Green, Blue), "직접 입력", "질문 취소", "터미널에서 답하기"를 보였다.
- b "1. Yes" → 판이 보낸 키 `1`, hook `PostToolUse(Write)`, 파일 생김. c "3. No (Esc)" → 키 `esc`, hook 없이 herdr `blocked → working → idle`로 waiting이 풀림(E9와 같다). d "2. Green" → 키 `2`, `PostToolUse(AskUserQuestion)`, 답 "You prefer green."
- 판에서 답한 기록은 `answer` 이벤트로 남는다: `answer 1. Yes keys=1`, `answer 거부 keys=esc`, `answer 2. Green keys=2`.
- 보내기 전 확인: 백엔드가 `agent.get`으로 `blocked`인지, 카드의 `tool_use_id`가 아직 기다리는 요청인지 본다. 이미 풀린 요청이면 `stale`로 보내지 않고 창이 카드를 닫는다. hook은 왔지만 herdr가 아직 `blocked`가 아니면 `not_blocked`로 보내지 않고 카드를 둔다. 단위 시험에 있다.

##### 6. 터미널 입력 규칙: unicode11, 붙여넣기 감싸기, 휠 → SGR, 프레임 크기 맞추기

`c6-input.txt`(처음 돈 것은 시험 스크립트의 기다리기 오류로 지웠다), 세션 a에서 실제 창으로.

- **붙여넣기:** 클립보드에 세 줄을 넣고 a 터미널에서 Ctrl+V. 입력칸에 세 줄이 들어가고 제출은 0번이었다(`c6-paste-in-input.png`). Enter를 누르자 제출이 정확히 한 번, hook `prompt`가 `"Reply with exactly: paste-ok\nline two of the paste\nline three of the paste"`, 답 `paste-ok`.
- **휠:** 1~120을 출력하게 한 뒤 터미널 위에서 휠을 위로 5칸: 보이는 숫자 93~120 → 87~114. 그때 xterm 화면과 herdr 화면(`pane.read`)이 줄 단위로 같았다(다른 줄 0, `c6-wheel-up.png`). 아래로 굴리자 93~120으로 돌아왔다. 판 배율은 그대로였다(휠이 판을 확대하지 않음).
- **unicode11:** `한글 ✅ 🎉 끝|`을 답하게 했다. 이모지 줄을 포함해 xterm 화면과 herdr 화면의 다른 줄 0, `unicode.activeVersion = 11`(`c6-unicode11.png`).
- **크기 맞추기:** 노드 오른쪽 아래 손잡이를 끌어 키웠다. 요청 크기, 받은 프레임의 w·h, xterm 크기가 `126x35` → `151x43`으로 같이 바뀌었고 herdr 화면도 43줄이 됐다. 다른 줄 0(`c6-resized.png`). 새 노드 크기 1072×692가 저장됐다(그 뒤 720×460으로 되돌렸다).
- **Ctrl+G:** 노드 터미널에서 Ctrl+G를 누르면 아무것도 보내지 않고 "Ctrl+G(외부 편집기 열기)는 판에서 막았다"를 보인다. 메모장은 뜨지 않았다(`misc.txt`, `misc-ctrl-g-blocked.png`).

##### 7. 창을 닫았다 다시 열면 배치가 그대로이고, 세션은 계속 돌았고, 화면이 돌아온다(PLAN C1)

`c7-reopen.txt`, `c7-before-close.png`, `c7-after-reopen.png`.

- 닫기 전: 노드 `a=0,0 b=760,0 c=74,475 d=836,475`(모두 720×460), 뷰포트 `{x:207, y:35, zoom:0.752}`, 제어기 4개, 네 화면 모두 herdr 화면과 다른 줄 0.
- 창을 닫은 뒤 `mtask status`로 백엔드가 그대로 돌고 있음을 확인하고, `mtask send @b "Reply with exactly: while-window-closed" --wait`로 턴 하나를 돌렸다(`confirmed`).
- 다시 연 뒤: 배치와 뷰포트가 같고(`배치 같음 true 뷰포트 같음 true`), 세션 넷이 같은 패널로 ready, 제어기 4개가 다시 붙어 네 화면 모두 herdr 화면과 다른 줄 0. b의 마지막 답이 `while-window-closed`.

##### 8. E5: 가까이 보이는 노드 8개에 제어기를 붙인 상태의 메모리, CPU, 프레임 지연

`docs/experiments/E5.md`. 요약: 제어기 8개 127MB(하나 15.9MB), 창 약 420MB, 쉬는 동안 CPU 거의 0. 8개 동시 150줄 출력과 135KB × 8 합성 부하에서 50ms를 넘는 화면 프레임 0. 입력 → 프레임 중앙값 약 32ms. WebGL 예산(기본 8)과 DOM 대체, 제어기 상한(기본 8)을 넣었고, DOM은 같은 부하에서 renderer CPU가 약 3배였다.

##### 9. E6: 터미널 노드의 한글 IME

`docs/experiments/E6.md`. CDP 조합 이벤트로: 조합 중에는 보내지 않고, 음절마다 한 번씩 보내고, 받침 넘김·조합 중 지우기·조합 취소가 맞고, 배율 0.6에서도 같았다. 실제 IME 점검표는 E6.md 4절에 있다.

##### 시험

- 백엔드 단위 시험 23개 통과(`cd backend && npm test`). P1의 18개는 그대로 통과한다.
- 창 단위 시험 9개 통과(`cd app && npm test`).

#### 4. 시험 뒤 정리

- 시험 claude 세션 a~h는 `mtask kill --yes`로 `/exit` 정상 종료하고 작업 공간을 닫았다. t(신뢰 확인)는 창의 끄기로 esc → 끝났다. 시험이 만든 `backend/.dev/proj/perm-b.txt`를 지웠다(perm-c는 거부해서 생기지 않았다).
- 창을 닫고, `mtask --dev herdr stop --yes`, `mtask --dev backend stop`, `herdr session delete multitask-dev`를 했다. `npm start` 확인 뒤 같은 정리를 한 번 더 했다.
- 정리 중 실수가 하나 있었다. `npm start`로 띄운 창을 닫기 전에 백엔드를 껐더니 창이 백엔드를 다시 띄웠고, 백엔드가 지운 herdr 세션을 다시 만들었다. 창(내가 띄운 PID)을 끈 뒤 다시 정리했다. 그리고 앞서 멈춘 단위 시험 실행(`npm test`) 프로세스 셋이 남아 있어 시작 시각과 부모 명령으로 내가 띄운 것임을 확인하고 PID로 껐다.
- 끝난 뒤 `herdr.exe`, `electron.exe`, multitask 백엔드 `node.exe`는 없었다. `claude.exe`는 25개로, P1 정리 때 기록한 데스크톱 앱 쪽 개수와 같다. 판이 띄우지 않은 프로세스는 건드리지 않았다.
- 사용자의 기본 herdr 세션, 데스크톱 앱 세션, `~/.claude/settings.json`은 건드리지 않았다. 실제 판 프로필로는 띄우지 않았다.

#### 5. 고친 백엔드 버그

1. **세션을 잇달아 띄우면 `agent_detected`를 잃었다(P1 버그).** 새 세션마다 백엔드가 herdr 이벤트 구독을 새 패널 목록으로 바꾼다. 어댑터가 새 구독을 여는 순간부터 옛 구독의 이벤트를 버렸고, 새 구독이 받자마자 옛 구독을 닫아 파이프에 남은 이벤트까지 버렸다. 창에서 a~d를 1초 간격으로 띄우자 a의 `agent_detected`가 사라졌고, a로 보낸 글이 `queued(no_agent)`로 멈췄다. mtask로 e~h를 띄울 때도 e에서 같은 일이 있었다. P1에서는 세션을 몇 초 간격으로 띄워 드러나지 않았다.
   - 고침: 새 구독이 받은 뒤에도 옛 구독을 1.5초 더 열어 두고, 두 곳으로 온 같은 이벤트는 한 번만 낸다. 구독 바꾸기는 한 번에 하나씩 한다(늦게 끝난 옛 패널 목록이 새 구독을 덮지 않게). 옛 구독이 끊긴 것을 새 구독이 끊긴 것으로 보지 않게 했다.
   - 안전망: 끝난 적 없는 세션에 herdr 상태 이벤트가 오면 claude가 있다고 본다(`herdr_agent { by: "status" }`). 끝난 세션은 되살리지 않는다(E10의 해제 직후 idle).
   - 고친 뒤 8개를 동시에 돌린 E5에서 8개 모두 전달됐다. 단위 시험은 "잃지 않고 두 번 내지 않는다"와 "하나씩"을 가짜 herdr 파이프로 본다. 다만 "받자마자 닫아서 잃는" 경쟁은 어느 파이프를 먼저 읽느냐에 달려 단위 시험에서 늘 재현되지는 않았다.
2. **줄바꿈된 권한 선택지의 뒷부분이 잘렸다.** 100열 터미널에서 Write의 2번 선택지가 "…for this"로 끝났다. 들여 쓴 다음 줄을 앞 선택지에 이어 붙인다.

#### 6. PLAN과 다르게 한 것과 이유

1. **`session.answer`의 모양.** PLAN은 `{ sessionId, choice, text? }`다. 카드가 가리키는 요청을 확인하려고 `toolUseId`(없으면 `since`)를 받고, 여러 개 고르기와 여러 질문을 위해 `picks`를 더했다. `choice`는 번호, `'reject'`(esc), `'amend'`(tab, 글, enter)다. 돌려주는 값은 `{ sent: true, label, steps }` 또는 `{ sent: false, reason: stale | no_pending_ask | not_blocked }`다. `not_blocked`는 hook이 herdr `blocked`보다 먼저 온 짧은 틈이라 카드를 닫지 않는다.
2. **"No" 선택지도 esc로 보낸다.** A1의 "권한 거부는 esc"를 따라, 화면에서 읽은 선택지 글이 "No"로 시작하면 번호 대신 esc를 보낸다.
3. **Ctrl+G를 노드 터미널에서 막았다(PLAN 8절 열린 결정).** 누르면 메모장이 뜨고 Claude Code가 그 창을 기다린다(E9). 막고 안내 글을 보인다.
4. **`N`은 내 차례 다음에 문제(오류, 비정상 종료)까지 돈다.** 참고 제품의 needs you가 오류를 포함한다. 위쪽 줄에는 내 차례, 검토 대기, 문제를 따로 보인다.
5. **얼굴 기준을 배율이 아니라 노드의 화면 너비로 정했다(PLAN 9.2 "P2에서 정한다").** 노드 크기가 달라도 같은 기준이 된다. 기준은 2절에 있다.
6. **창은 백엔드가 꺼지면 다시 띄운다.** PLAN 1절의 "창이 백엔드가 없으면 띄우고"를 연결이 끊길 때마다 적용했다. 그래서 개발 중에 백엔드를 끄려면 창을 먼저 닫아야 한다(4절의 실수).
7. **승인 카드는 노드 본문 아래쪽에 겹쳐 띄운다.** PLAN은 "노드 위에 뜬다"다. 노드 위쪽 바깥에 띄우면 위 노드를 가린다(노드 사이 40px). 카드는 접을 수 있다.
8. **개발용 새 세션 대화상자의 모델 기본값은 `haiku`다.** P2 지시의 시험 규칙을 따랐다. 실제 판에서는 비워 둔다(사용자 기본 모델).
9. **xterm.js 6.0.0을 썼다(E4는 5.5.0).** 설치 시점의 최신이다. E4의 조건(unicode11, 붙여넣기, 휠, 크기)을 이 버전으로 3절 6에서 다시 확인했다.
10. **휠은 100px(한 칸)을 SGR 한 번으로 보내고, 한 이벤트에 최대 5번까지 보낸다.** 트랙패드의 작은 값은 모았다가 보낸다.
11. **E5의 부하 기준.** PLAN의 "턴 하나에 100~135KB"는 실제 턴의 양이 아니었다(턴당 수 KB). 실제 턴 측정과 함께, 그 양은 기록된 프레임을 창 안에서 다시 넣어 재현했다(E5 1절).
12. **mtask의 백엔드 찾기·띄우기 코드를 `backend/src/client.mjs`로 옮겼다.** 창 main이 같은 코드로 백엔드를 띄운다.

#### 7. 확인하지 않은 것과 알려진 문제

- **실제 한글 IME**(E6 4절 점검표), 특히 조합 중 Enter
- **WebGL 컨텍스트를 잃은 뒤 모든 터미널이 놓인 한 번**(E5 2.5). 다시 나오지 않았고 원인을 찾지 못했다. 노드마다 오류 경계를 두는 것을 제안한다.
- 카드로 답하기 중 "승인하면서 지시 덧붙이기", 여러 개 고르기, 여러 질문, 계획 승인은 단위 시험만 했다(키 순서는 E9를 따름).
- 배율이 1이 아닐 때 xterm.js의 마우스 글 고르기 위치. xterm.js는 CSS 확대를 모르므로 어긋날 것으로 본다. 휠은 화면 비율로 계산해 배율과 상관없다. `N`과 칩은 배율 1로 간다.
- 중간 얼굴(대화 보기)은 최소한으로 만들었다. 긴 답은 몇 줄만 보이고, 새 메시지가 오면 다시 읽는다.
- 터미널을 하나도 붙이지 않은 창의 기준 메모리, 노드 수십 개일 때 React Flow의 부담
- 실제 판 프로필, OS 알림(A1의 "OS 알림 이벤트"), 창 위치 기억
- 창 둘을 같은 프로필로 띄우는 경우: 한 번만 뜨게 막았다(`requestSingleInstanceLock`). 다른 창이 같은 세션에 제어기를 붙이면 앞 창의 터미널은 "화면 연결이 끊겼다"로 바뀐다.

#### 8. 사용자가 손으로 해 볼 것

`cd app && npm start`로 띄운다(개발용). 새 세션 두세 개를 띄워 본다.

1. **한글 입력:** `docs/experiments/E6.md` 4절 점검표 1~9. 특히 4번(조합 중 Enter)의 결과를 알려 준다.
2. **붙여넣기:** 여러 줄 글을 노드 터미널에 Ctrl+V로, 오른쪽 클릭 메뉴가 없으니 Shift+Insert로도 붙인다. 한 번만 제출되는가
3. **휠과 글 고르기:** 긴 답을 낸 노드에서 휠로 위아래로 굴린다. 배율 1과 0.6에서 마우스로 글을 골라 Ctrl+C로 복사한다(배율이 1이 아니면 고른 자리가 어긋날 수 있다)
4. **내 차례:** 두 세션에 권한 요청을 띄우고 `N`과 칩으로 오간다. 노드가 움직이지 않는가, 기다린 시간이 맞는가
5. **승인 카드:** 승인, 거부, "승인하면서 지시 덧붙이기"를 눌러 본다. 질문(단일, 여러 개)도 한다
6. **명령 바:** `@이름`, `@all`, 막힌 세션에 보낸 글이 기다렸다 가는지, 대기 중 취소
7. **닫았다 열기:** 노드를 옮기고 창을 닫았다 다시 연다
8. 끝나면 창을 닫고 `node backend/bin/mtask.mjs --dev herdr stop --yes`, `node backend/bin/mtask.mjs --dev backend stop`

#### 9. PLAN과 BRIEF에 고칠 것

PLAN과 BRIEF는 이번에 고치지 않았다(지시). 아래를 제안한다.

**PLAN**

1. 0절 순서와 7절: P2를 "끝남"으로, P0 표의 E5와 E6을 각 문서의 5절 문구로 바꾼다.
2. 7절 P2의 "E5의 부하 측정에는 턴 하나에 100~135KB인 프레임 양을 기준으로 쓴다": 실제 턴은 화면 차이분이라 세션당 수 KB였고, 100~135KB는 한 세션 전체 기록이다.
3. 6절 API: `session.answer { session, toolUseId?, since?, choice | picks, text? }`와 돌려주는 값(6절 1)으로 바꾼다. `relay`의 `terminal.frame`, `terminal.detached`에 `controllerPid`가 있다고 적는다.
4. 4절 A1: 카드를 닫는 조건(`stale`, `no_pending_ask`)과 두는 조건(`not_blocked`), "No" 선택지도 esc로 보낸다는 것을 적는다.
5. 8절 열린 결정에서 닫을 것: Ctrl+G(막음), 제어기 상한 기본값(8), 창을 닫아도 백엔드와 herdr를 계속 돌림(그렇게 함). 봤음 기록은 판 자체 기록(노드를 누르거나 칩·N으로 갈 때)으로 했다.
6. 9.2: 얼굴 기준(화면 너비 360px, 200px), 제어기를 붙이는 순서(화면 가운데에 가까운 순)와 놓기 전 1.5초를 적는다. Ctrl+G를 막는다는 줄을 더한다.
7. 9.1: 승인 카드는 노드 본문 아래쪽에 겹친다(6절 7).
8. 1절 백엔드 수명: "창이 열려 있으면 백엔드가 꺼질 때 다시 띄운다. 개발 중에 끌 때는 창을 먼저 닫는다"를 적는다.
9. 5절 herdr 어댑터: "구독을 바꿀 때 옛 구독을 잠깐 더 열어 두고 중복을 거른다. 구독 바꾸기는 하나씩"을 적는다(5절 1).
10. 10절 위험: 위 구독 문제를 "세션을 잇달아 띄우면 이벤트를 잃을 수 있다 → 겹쳐 열기와 상태 이벤트 안전망"으로 더한다.

**BRIEF**

1. 첫 문단과 CLAUDE.md 첫 문단의 "화면은 아직 없다"를 "P2 최소 화면(`app/`, `docs/P2.md`)까지 했다"로 바꾼다.
2. 3절 "정한 것"의 기술 구성: "Electron 45, React 19, `@xyflow/react` 12, xterm.js 6(WebGL, unicode11), esbuild. 창은 백엔드 WebSocket에 직접 붙는다"를 더한다.
3. 6절 위험 1(한글 입력): E6 결과(자동화 부분 됨, 실제 IME 점검표 대기)를 적는다.
4. 6절 위험 2(콘솔이 많을 때): E5 결과(8개에서 제어기 127MB, 창 약 420MB, 긴 프레임 0, WebGL 예산 8과 DOM 대체, 제어기 상한 8)를 적는다.
5. 5절 v0.1: 범위를 끝냈다고 적고, v0.2 후보 중 "저장과 다시 열기"는 P2에서 이미 됐다(C1)고 적는다.

### 지휘 세션의 합치기 기록(옛 `docs/PLAN.md` 7절)

끝났다(2026-10-29). 코드는 `app/`, 결과와 증거는 `docs/P2.md`, 스크린숏과 로그는 `experiments/p2/`에 있다. 작업 지시는 `docs/briefs/P2.md`의 완료 기준 9개였고, 실제 claude 세션으로 모두 확인했다. 실제 한글 IME, 카드의 "지시 덧붙이기"·여러 개 고르기·계획 승인(단위 시험만), 배율이 1이 아닐 때 마우스로 글 고르기는 사람이 확인한다(`docs/P2.md` 7~8절).
