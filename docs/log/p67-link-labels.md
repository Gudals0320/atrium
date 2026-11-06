상태: 열림
날짜: 2026-11-06

## 지시

### 목표

연결 선 위의 이름표가 겹치고 사라지지 않는 것을 고친다. 사용자의 말: "세션에 여러 메세지 보내게 되면 link에 표시자가 겹침. 근데 얘네 왜 계속 떠있고 사라지질 않음?".

사용자가 보인 화면(실제 판이라 그림은 저장소에 넣지 않는다): 리드 세션 s12가 `atrium child`로 워커 `p1-wine-headless`(워크트리)를 띄웠다. 두 노드 사이의 선 위에 이름표 둘이 같은 자리에 겹쳐 있다. 하나는 "세션 생성 · 워커 · "…" · 작업 중"(판의 띄움 선, `app/src/renderer/Links.jsx`)이고, 다른 하나는 "대화 생성 · atrium child p1-wine-headless …"(대화 노드의 띄움 선, `app/src/renderer/ConvoNode.jsx`, ARCH 4절 J6)다. 일이 끝나도 이름표는 남는다.

### 할 것

1. **같은 띄움을 두 번 긋지 않기.** 판이 띄운 하위 세션(K1, 판의 연결이 이미 있음)을 대화 기록 쪽(J6의 띄움 맞추기)이 또 맞춰 선을 하나 더 긋는지 확인하고, 그렇다면 막는다. 판 세션끼리의 띄움은 판의 연결 하나로만 보인다. 판 밖 대화에서 띄운 경우(J6 본래 목적)는 그대로 둔다.
2. **한 선에 이름표 하나.** 한 쌍 사이에 지시가 여럿 오가면 이름표를 겹쳐 놓지 않는다. 가장 최근 것 하나와 수(예: "+2")를 보이고, 누르면 지금처럼 연결 대화상자(지난 지시 목록)가 열린다. 서로 다른 선의 이름표가 한 자리에 겹치면 선을 따라 비켜 놓는다.
3. **이름표가 물러나기.** 이름표는 일이 도는 동안(작업 중, 보낸 지시를 받는 중)과 결과를 아직 보지 않은 동안에만 글을 다 보인다. 일이 끝나고 결과를 봤거나 몇 분(값은 써 보고 정한다)이 지나면 작은 칩(역할과 상태 점)으로 줄인다. 마우스를 올리거나 선을 고르면 다시 다 보인다. 연결 자체와 역할 선은 남는다. P46의 배율별 이름표(먼 배율에서 줄임)와 맞춘다.
4. 붙여 묶은 덩어리 안의 연결(다리, 괄호, 둘레 길, 머리줄 칩, `lib/dock-links.js`)도 같은 규칙을 따른다.

### 완료 기준

1. 단위 시험을 더하고 통과한다: 판 띄움과 대화 띄움의 중복 막기, 한 쌍의 이름표 합치기와 수, 물러나는 조건(도는 중, 안 본 결과, 시간).
2. 창 시험(개발용 판, 리드가 `atrium child`로 워커 둘을 띄우고 같은 워커에 지시를 셋 보냄)으로 확인하고 전후 스크린숏을 `experiments/p67/`에 둔다: 선 하나에 이름표 하나와 수, 일이 끝나고 결과를 보면 칩으로 줄어듦, 마우스를 올리면 다시 보임, 이름표끼리 겹치지 않음.
3. `cd backend && npm test`, `cd app && npm test`, `cd app && npm run build`가 통과한다.

### 읽을 파일

- `CLAUDE.md`, `docs/testing.md`, `docs/log/p46-dock-labels-mission-naming.md`·`p13-outside-convos.md` 보고 절
- `app/src/renderer/Links.jsx`, `app/src/renderer/ConvoNode.jsx`, `app/src/renderer/lib/labels.js`, `app/src/renderer/lib/dock-links.js`, 대화 띄움을 맞추는 백엔드 코드(`backend/src/` 아래 J6, 예: `convos.mjs`), 두 사전

### 시험 환경

- 이 작업은 `dev` 브랜치에서 시작한다. 워크트리를 연 뒤 먼저 `git fetch origin && git merge --ff-only origin/dev`를 한다(워크트리가 `main`에서 시작할 수 있다).
- 개발용 판은 너만의 판으로 띄운다(`docs/testing.md`).
  - `ATRIUM_HERDR_SESSION=atrium-dev-p67`, `ATRIUM_PORT=47894`
  - `ATRIUM_DATA_DIR=<워크트리>/backend/.dev/data`, `ATRIUM_APP_USERDATA=<워크트리>/backend/.dev/app`
- 실제 판(`atrium`, 47800)과 다른 판의 포트는 쓰지 않는다. 사용자의 기본 herdr 세션과 다른 판의 herdr 서버는 건드리지 않는다. 사용자의 실제 판은 열지도 캡처하지도 않는다.
- 대화 목록은 시험 폴더의 대화만 읽는다(`ATRIUM_CLAUDE_PROJECTS`, `ATRIUM_CLAUDE_DESKTOP=none`). 시험 폴더는 `C:\Workspace\mtask-p67-*`처럼 새로 만든다.
- 세션은 `claude --model haiku`와 셸로 띄운다.
- 끝나면 시험 세션, 창, 브라우저, 백엔드, herdr 서버와 세션(`atrium-dev-p67`만), 시험 폴더를 끄고 지운다. 네가 띄운 프로세스가 남지 않았는지 포트로 확인한다.

### 지킬 것

- `CLAUDE.md`를 따른다. 프로세스는 직접 띄운 것만 PID로 끈다.
- 이 저장소는 공개다. 작업 기록, 시험 코드, 커밋 메시지, 그림에 사용자 경로·메일·토큰, 실제 PC·tailnet 이름, IP, 실제 대화 내용을 쓰지 않는다. 커밋 전·푸시 전 검사를 건너뛰지 않는다.
- 화면 글은 영어와 한국어 사전 둘 다 고친다. 한국어 문구는 사전의 지금 말투(최근 문구 검토, `docs/log/korean-copy-review.md`)를 따른다.
- 같은 때 다른 작업자(P65(터미널 선명도), P66(세션 이름 바꾸기))가 돈다. 맡은 일에 필요한 만큼만 고치고, `styles.css`와 두 사전은 끝에 더해 합치기 쉽게 한다.
- 자기 브랜치에만 커밋한다. 커밋 메시지에 `Co-Authored-By` 줄을 넣지 않는다. `main`이나 `dev`를 바꾸거나 푸시하지 않는다. `node_modules`는 워크트리 안에서 받는다(`npm ci`).
- 문서는 이 작업 파일의 작업 기록 절과 보고 절만 고친다. 고쳐야 할 ARCH·BRIEF·testing 문장은 보고 절에 짧게 적는다.
- 끝나면 보고 절을 쓰고, 맨 마지막에 `<워크트리>/backend/.dev/p67.done`(브랜치 이름과 마지막 커밋 해시 두 줄)을 만든다.

## 작업 기록

## 보고
