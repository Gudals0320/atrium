상태: 열림
날짜: 2026-11-07

## 지시

### 목표

`atrium child --prompt`(와 `--worktree`)로 띄운 워커의 첫 요청이 사라지지 않게 한다. 리드가 맡긴 첫 일이 조용히 없어지면 사람은 워커가 왜 놀고 있는지 모른다.

### 발견

P78 작업자가 창 시험에서 찾았다(`docs/log/p78-worktree-handoff-line.md` 작업 기록·알려진 문제). `claude -w` 워커에서 `--prompt`의 첫 요청이 가끔 들어가지 않는다. 판이 ready를 보고 보내지만 hook `UserPromptSubmit`이 오지 않아 전달이 `unconfirmed: no UserPromptSubmit hook`(`backend/src/delivery.mjs`)으로 끝나고 다시 보내지 않는다. 한 판 기록에서 haiku 워커 넷 가운데 둘(w3·w4), 다른 회에는 하나였다. 지휘 세션이 P75 창 시험을 다시 돌렸을 때 w5가 4분 동안 상자에 들지 않은 것도 같은 원인으로 보인다(기록은 git 밖 `C:\Workspace\multitask\experiments\p75\merged\`, `C:\Workspace\multitask\experiments\p78\worker\run1`·`run2`). P78 작업자의 짐작: 워크트리를 만드는 동안 ready로 잘못 본다.

### 할 것

1. **재현과 원인.** 개발용 판에서 리드의 env로 `atrium child --worktree <이름> --prompt '...'`를 여럿(예: 여덟, haiku) 띄워 첫 요청이 들어가는 비율과 실패한 때의 상태(herdr 상태, 화면, hook 시각, 전달 기록)를 잰다. `--worktree` 없이 띄운 워커도 같은 수로 잰다. 왜 들어가지 않는지 적는다. 예: 워크트리를 만드는 동안 입력 칸이 보이기 전에 ready로 봄, 글이 입력 칸에 들어갔지만 Enter가 먹지 않음, 신뢰·권한 화면.
2. **고치기.** 첫 요청은 사람이 맡긴 일이므로 사라지면 안 된다. 원인에 맞게 고친다. 예: `claude -w` 워커의 ready 판정을 입력 칸이 실제로 보일 때로 늦추기, 확인 못 함이면 화면을 보고 입력 칸에 글이 남았으면 Enter를, 비었으면 한 번 다시 보내기(같은 글이 두 번 들어가지 않게), 끝내 못 넣으면 부모에게 오류 상태와 판 이벤트로 알리기. 사람의 B1 규칙(사람이 3초 안에 친 터미널은 기다림 등)은 지킨다.
3. **`atrium child`의 답.** `첫 요청 confirmed`가 아니면 그 사실과 다음에 칠 명령(`herdr agent prompt` 등)을 답에 적는다. `atrium children`에도 보인다.

### 완료 기준

1. 단위 시험을 더하고 통과한다: 확인 못 함 뒤 다시 보내기·Enter, 두 번 들어가지 않기, 끝내 못 넣었을 때 부모에게 알리기, 사람 입력이 있을 때 기다리기.
2. 창 시험(개발용 판)으로 고치기 전과 고친 뒤에 워크트리 워커 여덟을 `--prompt`로 띄워 첫 요청이 모두 들어가는지(hook `UserPromptSubmit`) 잰다. 결과를 `experiments/p79/`에 둔다. 시험 저장소는 P75·P78과 같은 경로 `C:\Workspace\mtask-p75-repo`를 새로 만들어 쓴다(사용자가 그 경로의 신뢰를 이미 주었다). 신뢰 질문이 뜨면 `backend/.dev/p79-need-trust.txt`에 한 줄을 두고 기다린다.
3. `cd backend && npm test`, `cd app && npm test`, `cd app && npm run build`가 통과한다.

### 읽을 파일

- `CLAUDE.md`, `docs/testing.md`, ARCH 2절 상태 모델, 4절 B1·K1, `docs/log/p78-worktree-handoff-line.md`
- `backend/src/delivery.mjs`, `backend/src/branch.mjs`(첫 요청), 상태 판정(`backend/src/screen.mjs` 등 ready를 정하는 곳), `app/test/e2e/p78-worktree-handoff.mjs`

### 시험 환경

- 이 작업은 `dev` 브랜치에서 시작한다. 워크트리를 연 뒤 먼저 `git fetch origin && git merge --ff-only origin/dev`를 한다(워크트리가 `main`에서 시작할 수 있다).
- 너는 사용자의 실제 판 위에서 도는 워커라 셸에 실제 판의 `ATRIUM_*`·`HERDR_*`가 있다. 시험, 개발용 판, herdr, `atrium`은 이 변수를 지운 셸(`backend/.dev/clean-env.sh`, `docs/testing.md`)로 부른다.
- 개발용 판은 너만의 판으로 띄운다(`docs/testing.md`).
  - `ATRIUM_HERDR_SESSION=atrium-dev-p79`, `ATRIUM_PORT=47899`, 창의 원격 디버깅 포트 9379
  - `ATRIUM_DATA_DIR=<워크트리>/backend/.dev/data`, `ATRIUM_APP_USERDATA=<워크트리>/backend/.dev/app`
- 실제 판(`atrium`, 47800)과 다른 판의 포트는 쓰지 않는다. 사용자의 기본 herdr 세션, 실제 판의 herdr 세션(`atrium`), 다른 판의 herdr 서버는 건드리지 않는다. 사용자의 실제 판은 열지도 캡처하지도 않는다. 스크린숏은 창 안만 찍는다(`page.screenshot`).
- 실제 판의 API(47800)와 `atrium` 명령으로 실제 판을 바꾸지 않는다. 시험의 `atrium` CLI는 늘 개발용 판 환경 변수(`ATRIUM_PORT` 등)를 주고 부른다.
- 실제 설치 폴더(`%LOCALAPPDATA%\atrium\versions`)와 실제 데이터 폴더(`%LOCALAPPDATA%\atrium`)는 읽지도 바꾸지도 않는다.
- 대화 목록은 시험 폴더의 대화만 읽는다(`ATRIUM_CLAUDE_PROJECTS`, `ATRIUM_CLAUDE_DESKTOP=none`). 시험 폴더는 `C:\Workspace\mtask-p79-*`처럼 새로 만든다.
- 세션은 `claude --model haiku`와 셸로 띄운다.
- 끝나면 시험 세션, 창, 브라우저, 백엔드, herdr 서버와 세션(`atrium-dev-p79`만), 시험 폴더를 끄고 지운다. 네가 띄운 프로세스가 남지 않았는지 포트로 확인한다.

### 지킬 것

- `CLAUDE.md`를 따른다. 프로세스는 직접 띄운 것만 PID로 끈다. 신뢰 질문은 대신 답하지 않는다.
- 이 저장소는 공개다. 작업 기록, 시험 코드, 커밋 메시지, 그림에 사용자 경로·메일·토큰, 실제 PC·tailnet 이름, IP, 실제 대화 내용을 쓰지 않는다. 커밋 전·푸시 전 검사를 건너뛰지 않는다.
- 화면 글은 영어와 한국어 사전 둘 다 고친다. 한국어 문구는 사전의 지금 말투(`docs/log/korean-copy-review.md`)를 따른다.
- 같은 때 지휘 세션이 판 `atrium-dev-p77`(47897)·`atrium-dev-p78`(47898)로 합친 코드를 시험한다. 그 포트와 세션은 쓰지 않는다. 맡은 일에 필요한 만큼만 고치고, `styles.css`와 두 사전은 끝에 더해 합치기 쉽게 한다.
- 자기 브랜치에만 커밋한다. 커밋 메시지에 `Co-Authored-By` 줄을 넣지 않는다. `main`이나 `dev`를 바꾸거나 푸시하지 않는다. `node_modules`는 워크트리 안에서 받는다(`npm ci`, 창은 그 뒤 `node node_modules/electron/install.js`).
- 문서는 이 작업 파일의 작업 기록 절과 보고 절만 고친다. 고쳐야 할 ARCH·BRIEF·testing·README 문장은 보고 절에 짧게 적는다. 살아 있는 문서 예산이 거의 찼으니(70,000자 중 70,000자) 문장은 바꾸는 문장보다 길지 않게 적는다.
- 끝나면 보고 절을 쓰고, 맨 마지막에 `<워크트리>/backend/.dev/p79.done`(브랜치 이름, 마지막 커밋 해시, 시험 수 세 줄)을 만든다.

## 작업 기록

## 보고
