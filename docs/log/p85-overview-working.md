상태: 닫힘
날짜: 2026-11-07

## 지시

### 목표

멀리 보기(줌 아웃한 판, 휴대폰 보드 화면 포함)에서 일하는 세션과 아닌 세션이 한눈에 갈라 보이게 한다.

### 사용자의 말(2026-11-07)

"줌 아웃 해서 전체 뷰 봐도 작업중인 세션이랑 아닌 세션 딱 시각적으로 분리되는 기능 필요"

### 지금

- 멀리 얼굴(ARCH 4절 H3)은 이름, 상태, 기다리는 질문, 마지막 요청·답을 보인다. 기다리는 노드는 테두리가 깜빡이고 오래 쉬는 노드는 흐리다. 상태 점과 글은 있지만 작업 중인 세션이 멀리서 튀어 보이지 않는다.

### 할 것

1. **재기.** 판(PC 창)과 휴대폰 보드 화면에서 세션 10개 안팎(일하는 것, 내 차례, 쉬는 것, 잠든 것, 셸 명령 실행 중, 끝난 것)을 배율 세 단계(가까이, 중간, 가장 멀리)로 찍어 지금 얼마나 갈라 보이는지 적는다.
2. **갈라 보이기.** 일하는 세션(`working`·`starting`, 명령이 도는 셸)은 멀리서도 튀게 하고, 쉬는 세션(`ready`, 잠듦, 끝남)은 뒤로 물러나게 한다. 예: 일하는 노드는 강조색 테두리·빛·움직이는 둘레, 쉬는 노드는 흐리게·채도 낮게. 내 차례(`waiting`)는 지금처럼 따로 눈에 띄고 일하는 것과 헷갈리지 않아야 한다. 덩어리 안 칸, 워크트리 상자, 대화 노드도 같은 규칙을 따른다. 색과 움직임은 지금 판의 생김새(토큰, 다크)에 맞추고, 움직임 줄이기 설정(`prefers-reduced-motion`)이면 움직이지 않는다.
3. **더 세게(고를 수 있게).** 위 칩이나 레일에 "작업 중" 강조 켜기·끄기(또는 "작업 중만 또렷하게")를 둘지 근거를 들어 정한다. 둔다면 상태를 창 프로필에 두고 단축키는 만들지 않는다.
4. **성능.** 세션 100개 안팎에서 움직이는 효과가 프레임을 떨어뜨리지 않게 한다(CSS만, 화면 밖 노드는 움직이지 않음 등). 잰 값을 적는다.

### 손대지 말 것

- 터미널을 붙이는 규칙과 터미널 그리기(`TerminalView.jsx`, `lib/faces.js`의 렌더러 예산, `lib/term-sharp.js`)는 바꾸지 않는다. 같은 때 P84 작업자가 그쪽과 휴대폰 화면(`Phone.jsx`, `PhoneFull.jsx`)을 고친다.

### 완료 기준

1. 단위 시험: 상태 → 강조 등급(일함·내 차례·쉼·잠듦·끝남, 셸 실행 중) 판단, 켜기·끄기 저장.
2. 창 시험(개발용 판, 셸과 `claude --model haiku` 세션)으로 1의 장면을 고치기 전과 뒤로 같은 배율에서 찍어 `experiments/p85/`에 둔다. 휴대폰 보드 화면은 원격 흉내(`app/test/e2e/p59-lib.mjs`, iPhone 흉내 Chromium)로 찍는다. 시험 저장소는 P75·P78과 같은 경로 `C:\Workspace\mtask-p75-repo`를 새로 만들어 쓴다(사용자가 그 경로의 신뢰를 이미 주었다). 신뢰 질문이 뜨면 `backend/.dev/p85-need-trust.txt`에 한 줄을 두고 기다린다.
3. `cd backend && npm test`, `cd app && npm test`, `cd app && npm run build`가 통과한다.

### 읽을 파일

- `CLAUDE.md`, `docs/testing.md`, ARCH 3절(상태와 표시), 4절 H3·H5·H7, `docs/research/board-mock.md` 4절, `docs/log/p11-board-look.md` 보고 절
- `app/src/renderer/SessionNode.jsx`, `app/src/renderer/Canvas.jsx`, `app/src/renderer/Docks.jsx`, `app/src/renderer/lib/tokens.js`, `app/src/renderer/styles.css`의 노드·얼굴 규칙, `app/src/renderer/Chrome.jsx`(위 칩, 레일), 두 사전

### 시험 환경

- 이 작업은 `dev` 브랜치에서 시작한다. 워크트리를 연 뒤 먼저 `git fetch origin && git merge --ff-only origin/dev`를 한다(워크트리가 `main`에서 시작할 수 있다).
- 너는 사용자의 실제 판 위에서 도는 워커라 셸에 실제 판의 `ATRIUM_*`·`HERDR_*`가 있다. 시험, 개발용 판, herdr, `atrium`은 이 변수를 지운 셸(`backend/.dev/clean-env.sh`, `docs/testing.md`)로 부른다.
- 개발용 판은 너만의 판으로 띄운다(`docs/testing.md`).
  - `ATRIUM_HERDR_SESSION=atrium-dev-p85`, `ATRIUM_PORT=47898`, 창의 원격 디버깅 포트 9378
  - `ATRIUM_DATA_DIR=<워크트리>/backend/.dev/data`, `ATRIUM_APP_USERDATA=<워크트리>/backend/.dev/app`
- 실제 판(`atrium`, 47800)과 다른 판의 포트는 쓰지 않는다. 사용자의 기본 herdr 세션, 실제 판의 herdr 세션(`atrium`), 다른 판의 herdr 서버는 건드리지 않는다. 사용자의 실제 판은 열지도 캡처하지도 않는다. 스크린숏은 창 안만 찍는다(`page.screenshot`).
- 실제 판의 API(47800)와 `atrium` 명령으로 실제 판을 바꾸지 않는다. 시험의 `atrium` CLI는 늘 개발용 판 환경 변수(`ATRIUM_PORT` 등)를 주고 부른다.
- 실제 설치 폴더(`%LOCALAPPDATA%\atrium\versions`)와 실제 데이터 폴더(`%LOCALAPPDATA%\atrium`)는 읽지도 바꾸지도 않는다.
- 대화 목록은 시험 폴더의 대화만 읽는다(`ATRIUM_CLAUDE_PROJECTS`, `ATRIUM_CLAUDE_DESKTOP=none`). 시험 폴더는 `C:\Workspace\mtask-p85-*`처럼 새로 만든다.
- 세션은 `claude --model haiku`와 셸로 띄운다.
- 끝나면 시험 세션, 창, 브라우저, 백엔드, herdr 서버와 세션(`atrium-dev-p85`만), 시험 폴더를 끄고 지운다. 네가 띄운 프로세스가 남지 않았는지 포트로 확인한다.

### 지킬 것

- `CLAUDE.md`를 따른다. 프로세스는 직접 띄운 것만 PID로 끈다. 신뢰 질문은 대신 답하지 않는다.
- 이 저장소는 공개다. 작업 기록, 시험 코드, 커밋 메시지, 그림에 사용자 경로·메일·토큰, 실제 PC·tailnet 이름, IP, 실제 대화 내용을 쓰지 않는다. 커밋 전·푸시 전 검사를 건너뛰지 않는다.
- 화면 글은 영어와 한국어 사전 둘 다 고친다. 한국어 문구는 사전의 지금 말투(`docs/log/korean-copy-review.md`)를 따른다.
- 같은 때 P84 작업자가 판 `atrium-dev-p84`(47897, CDP 9377)로 휴대폰 터미널 메모리와 죽음 기록을 고친다(`TerminalView.jsx`, `Phone.jsx`, `PhoneFull.jsx`, `web.mjs`). 그 포트와 세션은 쓰지 않는다. 맡은 일에 필요한 만큼만 고치고, `styles.css`와 두 사전은 끝에 더해 합치기 쉽게 한다.
- 자기 브랜치에만 커밋한다. 커밋 메시지에 `Co-Authored-By` 줄을 넣지 않는다. `main`이나 `dev`를 바꾸거나 푸시하지 않는다. `node_modules`는 워크트리 안에서 받는다(`npm ci`, 창은 그 뒤 `node node_modules/electron/install.js`).
- 문서는 이 작업 파일의 작업 기록 절과 보고 절만 고친다. 고쳐야 할 ARCH·BRIEF·testing·README 문장은 보고 절에 짧게 적는다. 살아 있는 문서 예산이 거의 찼으니(70,000자 중 69,991자) 문장은 바꾸는 문장보다 길지 않게 적는다.
- 끝나면 보고 절을 쓰고, 맨 마지막에 `<워크트리>/backend/.dev/p85.done`(브랜치 이름, 마지막 커밋 해시, 시험 수 세 줄)을 만든다.

## 작업 기록

- 시작: `git fetch origin && git merge --ff-only origin/dev`(cddc586). 워크트리 안에서 `npm ci`(백엔드, 창)와 Electron 받기. 물려받은 판 변수를 지우는 `backend/.dev/clean-env.sh`와 이 판 값(atrium-dev-p85, 47898, `backend/.dev/data`·`app`)만 넣는 `backend/.dev/p85.sh`를 만들어 시험, CLI, herdr를 그것으로 불렀다(git 밖).
- 창 시험 `app/test/e2e/p85-overview.mjs`(전·뒤 같은 단계). 시험 저장소 `C:\Workspace\mtask-p75-repo`를 새로 만들고 워크트리 둘(`mtask-p85-wt1`·`wt2`), 잠재울 폴더 `mtask-p85-nap`(git 아님)을 더했다. 신뢰 예상은 둘 다 `needsTrust: false`였고 신뢰 질문은 뜨지 않았다.
  - 장면 11개: w-lead·w-coder(working), q-ask(waiting, Bash `mkdir` 권한), r-idle(ready, 봤음), r-review(ready, 안 봄), x-done(`/exit`, exited), z-nap(sleeping), sh-run·sh-idle(셸), 워크트리 상자의 wt-run(셸 실행)·wt-idle. 덩어리 w-coder + r-idle.
  - 일하는 턴을 오래 두는 법: `sleep 300`은 Claude Code가 뒤로 돌려 바로 ready가 되고, 단독 `sleep`은 막는다. `atrium spawn --args "--allowedTools …"`는 Claude Code 세션 명령줄에 넘어가지 않았다(프로세스 명령줄로 확인). 그래서 시험 저장소의 `.claude/settings.local.json`에 `Bash(ping:*)`만 허용하고 `ping -n 500`을 앞에서 돌게 했다.
  - 배율: 새 세션 노드는 월드 1440px 폭이라 얼굴 경계가 배율 0.25·0.139·0.097쯤이다. PC는 가까이 0.42, 중간 0.2, 멀리 0.12, 가장 멀리(아이콘) 0.07, 휴대폰(393pt, 원격 흉내 47908)은 0.26·0.12·0.06.
  - 재기: 스크린숏 픽셀에서 노드마다 바깥 1~7px 둘레와 테두리 2px의 바탕(#070705)과의 색 거리 평균. 등급별 평균과 일함/쉼 비율을 적었다(`p85-before.json`, `p85-after.json`).
- 전(옛 코드, `before-*.png`): 내 차례만 튄다(주황 고리 깜빡임). 일하는 노드는 테두리 색만 조금 다르다. 멀리(0.12) 그림에서 w-lead·sh-run과 sh-idle이 거의 같다.

| 둘레 대비(일함/쉼) | 가까이 | 중간 | 멀리 | 가장 멀리 | 휴대폰 중간 | 휴대폰 가장 멀리 |
|---|---|---|---|---|---|---|
| 전 | 1.40 | 0.73 | 1.52 | 1.05 | 1.46 | 1.36 |
| 뒤 | 2.09 | 3.18 | 2.86 | 1.81 | 1.98 | 2.10 |
| 뒤, 작업 중만 또렷하게 | | 4.50 | 3.32 | | 2.70 | |

- 고친 것:
  - `lib/overview.js`: `tierOf`(working·starting·shell_running·깨우는 중 = work, waiting·trust_wait = turn, error = alert, ready·shell_idle은 봤으면 rest·안 봤으면 review, sleeping = sleep, exited = done), `convoTier`(판 밖 대화는 도는지 모르니 열림 rest, 닫힘 done), `runsRing`, `ringDiag`, 켜기·끄기 저장(`mt.spotlight`)과 `html.mt-spot`.
  - `SessionNode.jsx`: `data-tier`, `t-<등급>` 클래스, 일하는 노드는 가까이가 아닌 얼굴에서 도는 둘레(`RunRing`). 회전판(원뿔 그라데이션)만 `transform: rotate`로 돈다. 판 크기는 노드 대각선이고 배율을 1.25배 계단으로 잡아 줌마다 다시 그리지 않는다. 창 하나에 IntersectionObserver 하나로 화면 밖 둘레는 `animation-play-state: paused`.
  - `styles.css` 끝: 일함은 상태 색 테두리, 화면 1px 고리와 24px 빛, 머리줄 13% 물듦(가까이 얼굴은 머리줄 물듦과 옅은 빛만), 아이콘 타일 9% 바탕. 셸은 셸 실행 색, Codex는 Codex 색. 덩어리 칸은 둘레를 칸 안쪽에 그린다. 쉼·끝남은 가까이가 아닌 얼굴에서 바로 쉬는 바탕·테두리(P28처럼 투명도는 쓰지 않음, 30분 기준은 가까이 얼굴에 그대로). 내 차례는 그대로이고 둘레가 없다. 움직임 줄이기: 둘레는 멈춘 고리, 내 차례 깜빡임과 아이콘 점 깜빡임도 멈춘다.
  - 워크트리 상자: `Canvas.jsx`가 일함 등급 수(`live`)를 더 넘기고 `Regions.jsx`가 `run`(셸 실행 포함)·`rest`를 단다. 도는 상자는 화면 기준 두께와 빛, 쉬는 상자는 점선.
  - 대화 노드: `ConvoNode.jsx`가 `t-rest`·`t-done`. 닫힌 대화는 쉬는 바탕.
  - 작업 중만 또렷하게: 왼쪽 레일 전체 보기 아래 단추(`data-action=spotlight`, 새 아이콘 `spot`). 켜면 가까이가 아닌 얼굴의 쉼·끝남·잠듦과 열린·닫힌 대화를 투명도 .3, 검토 대기 .7, 쉬는 영역 테두리 .45로 물린다. 마우스를 올리면 또렷해진다. 창 프로필 localStorage, 단축키 없음. 휴대폰 보드 화면도 왼쪽 레일에 있다.
  - 두 사전 끝에 `spotlight.on`·`off`.
- 둘을 고른 까닭(할 것 3): 기본 갈라 보기는 늘 켠다(사용자가 바란 것). 더 세게 물리는 것은 쉬는 노드의 마지막 답을 읽기 어렵게 하고 P28이 기본 화면의 흐림을 뺐으므로 고르는 것으로 둔다. 판마다가 아니라 화면(PC·휴대폰)마다 원하는 정도가 달라 창 프로필에 둔다.
- 성능(가짜 세션 100개를 창 상태에만 더함, 640×360, 그중 44개 일함): 같은 실행 안에서 움직임과 움직임 줄이기를 견줬다.

| 뒤 | 전체 보기 0.12(아이콘) | 0.3(멀리, 둘레 40개) | 휠 줌 |
|---|---|---|---|
| 움직임 | 143fps, p95 7.1ms | 139fps, p95 7.1ms | 110fps, p95 13.9ms, 50ms 넘는 프레임 10 |
| 움직임 줄이기 | 144fps, p95 7.0ms | 144fps, p95 7.0ms | 124fps, p95 7.1ms, 50ms 넘는 프레임 3 |

  멈춘 화면은 차이가 없다. 휠 줌은 둘레가 있으면 50ms 넘는 프레임이 조금 늘었다(얼굴이 바뀌며 둘레가 새로 생기는 때). 전 단계의 같은 잼은 그 실행 때 PC가 바빠 값이 낮아(휠 p95 69ms·62ms) 전·뒤로는 견주지 않는다.
- 창 시험 뒤 단계 13/13 통과(둘레, 쉬는 노드 둘레 없음, 내 차례 따로, 덩어리 칸, 워크트리 상자, 움직임 줄이기, 레일 단추, 저장, 다시 열어도 켜짐, 끄기, 성능 둘, 휴대폰 단추). 단위 시험 `app/test/p85-lib.test.mjs` 10개. 창 `npm test` 304개, 백엔드 `npm test` 586개, `npm run build` 통과.
- 정리: 시험 세션을 지우고 `atrium herdr stop --yes`, `atrium backend stop`, `herdr session delete atrium-dev-p85`. 시험 저장소, 워크트리 둘, 잠재울 폴더를 지웠다. 47898·47908·9378에 듣는 프로세스와 `atrium-dev-p85`·`mtask-p85`를 가진 프로세스가 남지 않았다.

## 보고

### 한 것

1. 멀리 보기에서 일하는 세션(working, starting, 명령이 도는 셸)은 초록 테두리·빛·물든 머리줄에 둘레를 도는 빛이 붙어 튄다. 쉬는·끝난 세션은 가까이가 아닌 얼굴에서 바로 어두운 바탕과 옅은 테두리로 물러난다. 잠듦은 지금의 푸른 점선 그대로다.
2. 내 차례는 지금처럼 주황 고리가 깜빡이고 둘레는 돌지 않아 일하는 것과 헷갈리지 않는다. 검토 대기는 연보라 테두리로 그 사이에 둔다.
3. 덩어리 칸, 워크트리 상자(도는 상자는 빛, 쉬는 상자는 점선), 판 밖 대화 카드(닫힌 대화는 물러남)도 같은 규칙을 따른다. 휴대폰 보드 화면은 같은 판이라 함께 바뀐다.
4. 왼쪽 레일 맨 아래 "작업 중만 또렷하게": 일함·내 차례·오류 밖을 투명하게 물린다. 창마다 남고 단축키는 없다.
5. 움직임은 회전판의 transform뿐이고 화면 밖이면 멈춘다. 세션 100개에서 멈춘 화면의 프레임은 움직임 줄이기와 같다. 움직임 줄이기 설정이면 멈춘 고리로 그린다.

### 사람이 볼 것

1. 실제 판을 이 빌드로 올리고 줌 아웃해 일하는 세션이 한눈에 보이는지, 도는 빛이 거슬리지 않는지 본다. 거슬리면 속도(2.6초 한 바퀴)나 밝기를 알려 준다.
2. 레일 맨 아래 단추로 "작업 중만 또렷하게"를 켜 보고 물리는 정도(.3)가 알맞은지 본다.
3. 휴대폰 보드 화면에서도 같은 것을 본다.

### 고칠 문서 문장(짧게)

- ARCH 4절 H3 끝 "기다리는 노드는 테두리가 깜빡이고 오래 쉬는 노드는 흐리다." → "기다리는 노드는 테두리가 깜빡이고, 일하는 노드는 둘레가 돌며(P85), 쉬는 노드는 물러난다."
- ARCH 7.2 멀리 끝 "쉬는·잠든 노드는 흐리게 하지 않고 바탕·테두리 명도와 점선으로 구분한다." → "쉬는·잠든 노드는 바탕·테두리 명도와 점선으로 물리고, 레일의 "작업 중만 또렷하게"(창 프로필)면 투명하게 물린다(P85)."
- testing.md 시험 자료 절: "오래 도는 턴은 시험 폴더의 `.claude/settings.local.json`으로 `ping`만 허용해 만든다(`spawn --args`는 Claude Code 세션에 넘어가지 않는다, P85)." 한 줄.
- BRIEF, README: 고칠 문장 없음.
- 따로 볼 것: `atrium spawn --args`가 Claude Code 세션(런처 없이)의 명령줄에 붙지 않는다. 의도인지 지휘 세션이 판단한다.
