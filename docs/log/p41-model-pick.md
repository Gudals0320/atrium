상태: 열림
날짜: 2026-11-05

## 지시

### 목표

판 세션이 사용자가 말로 한 모델("deepseek flash", "opus", "gpt-6.1-sol")을 판이 아는 목록에서 스스로 골라 워커를 띄우고, 그 워커가 실제로 답하게 한다. 사용자의 말은 다음과 같다.
- "모델 호출할 때 이렇게 텍스트로 요청했을 때 알아서 선택해서 목록 중에 선택해야지. 수정해."
- 실패한 대화에서 사용자: "뭐야 그럼 알잘딱으로 ocx-deepseek-flash 선택해서 호출해야지."

실제 판에서 생긴 일(사용자가 붙인 대화 요약)은 다음과 같다.
1. "worker 하나 더 호출해봐. 모델은 deepseek flash." → 판 세션이 `atrium child ds1 --model deepseek-flash`로 띄웠다.
   - 띄울 때는 ready였다. 첫 지시에서 "There's an issue with the selected model (deepseek-flash). It may not exist or you may not have access to it."가 났다.
2. 판 세션은 사용자에게 정확한 모델 이름을 물었고, 판 워커 대신 자기 내부 하위 에이전트로 우회했다.
3. "deepseek, opus, gpt-6.1-sol 워커 셋" 요청에서는 판 세션이 opencodex 설정에서 이름을 찾았다. `ocx-claude-deepseek--deepseek-flash[1m]`, `ocx-claude-native--gpt-6.1-sol[1m]`, `claude-opus-5-5`였다. 그 이름으로 띄웠지만 opus만 답하고 나머지 둘은 같은 모델 오류로 실패했다.

지휘 세션이 본 원인 짐작은 다음과 같다.
- 레일의 DeepSeek 런처(P25, P33)는 세션 설정 env에 `ANTHROPIC_BASE_URL`(opencodex 게이트웨이, 기본 `127.0.0.1:10100`)과 `CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY`를 넣는다(`deepseek.mjs proxyEnv`, `launchers.mjs`).
- `atrium child --model`은 모델 이름만 넘기고 이 env를 넣지 않는다. 그래서 게이트웨이를 거쳐야 하는 모델은 닿지 않는다.
- 사실인지 확인한다.

### 할 것

1. **목록.** 판이 띄울 수 있는 모델의 목록을 판 세션이 볼 수 있게 한다(예: `atrium models`). 쓰는 사람은 에이전트다.
   - 담을 것: 런처(이름, 하네스, 모델, 게이트웨이 경유 여부), 하네스마다 아는 모델 ID와 짧은 별칭(opus, sonnet, haiku, fable 등), 게이트웨이가 알려 주는 모델(게이트웨이가 닿을 때).
   - 각 줄에 그 모델로 띄우는 정확한 `atrium child` 명령을 보인다.
   - 이 명령도 승인 규칙(`BRANCH_ALLOW`)에 넣어 묻지 않고 돌게 한다.
2. **런처로 띄우기.** `atrium child <이름> --launcher <런처>`로 그 런처의 하네스·모델·옵션·env·명령을 그대로 써서 하위 세션을 띄운다. 레일에서 띄운 것과 같게 동작해야 한다(게이트웨이 env 포함).
3. **말로 한 이름 풀기.** `atrium child --model <이름>`이 받은 이름을 목록에서 푼다.
   - 정확한 ID → 별칭 → 런처 이름·모델 이름의 느슨한 맞춤(대소문자, 띄어쓰기·하이픈, "deepseek flash" ↔ `deepseek-flash`) 순서로 본다.
   - 하나로 정해지면 그 런처나 모델(게이트웨이 env 포함)로 띄우고, 응답에 무엇으로 풀었는지 적는다.
   - 여럿이면 띄우지 않고 후보 목록과 고르는 명령을 돌려준다.
   - 없으면 띄우지 않고 가까운 후보와 `atrium models`를 알려 준다.
   - 모르는 모델 이름으로 조용히 띄우지 않는다.
4. **게이트웨이 모델.** `ocx-…` 같은 게이트웨이 경유 모델로 띄우면 런처처럼 게이트웨이 env를 넣는다. 띄우기 전에 게이트웨이가 닿는지 확인하고(지금 런처의 `checkGateway`), 안 닿으면 까닭과 함께 띄우지 않는다.
5. **GPT 같은 다른 회사 모델.** 사용자가 "gpt-6.1-sol"처럼 말하면 판이 가진 길 가운데 맞는 것을 고른다. 길은 게이트웨이 경유 Claude Code 모델, Codex 하네스(`--kind codex`) 런처 등이다. 어느 길을 기본으로 할지는 네가 정하고 보고에 적는다.
6. **스킬과 짧은 안내.** `atrium` 스킬(`branch.mjs` `SKILL_BODY`)의 모델 고르기 줄을 고친다.
   - 사용자가 모델을 말로 하면 `atrium models`로 목록을 보고 가장 맞는 것을 골라 띄운다.
   - 정확한 ID를 사용자에게 묻지 않는다. 여럿이 맞을 때만 묻는다.
   - 판의 워커 대신 내부 하위 에이전트로 우회하지 않는다.
   - 글 길이는 지금과 비슷하게 둔다.
7. **띄운 뒤 모델 오류.** 하위 세션이 모델 오류("issue with the selected model" 등)로 첫 답에 실패하면, 판이 그 세션을 오류 상태로 보이고 까닭을 부모가 읽을 수 있게 한다(`atrium children`, 판 이벤트). 알아채는 방법(hook, 화면 글)은 네가 정한다.

### 완료 기준

1. 단위 시험: 이름 풀기(정확, 별칭, 느슨한 맞춤, 여럿, 없음), 런처로 띄울 때의 인자와 env, 게이트웨이 확인 실패, 승인 규칙, 스킬 글.
2. 개발용 판에서 확인하고 결과를 `experiments/p41/`(git 밖)에 남긴다.
   - 판 세션(claude, `--model haiku`)에게 "워커 둘을 띄워. 하나는 deepseek flash, 하나는 haiku. 각자 1+1을 답하게 해"라고 보낸다. 판 세션이 `atrium models`를 보고 맞는 것을 골라 띄운다. 두 워커가 실제로 답하고, 사용자에게 모델 이름을 묻지 않는다.
   - 없는 모델("gpt-99")을 말하면 띄우지 않고 후보를 보인다.
   - 게이트웨이가 꺼진 것처럼 주소를 바꾸면(시험용 env) 게이트웨이 모델은 까닭과 함께 띄우지 않는다.
   - 실제 게이트웨이는 사용자가 띄워 둔 것만 쓰고, 끄거나 설정을 바꾸지 않는다. 사용 요금이 드니 시험 지시는 짧게(한 턴) 한다.
3. `cd backend && npm test`, `cd app && npm test`, `cd app && npm run build`가 통과한다.

### 시험 환경

- 너만의 개발용 판으로 띄운다(`docs/testing.md`).
  - `ATRIUM_HERDR_SESSION=atrium-dev-p41`, `ATRIUM_PORT=47859`
  - `ATRIUM_DATA_DIR=<워크트리>/backend/.dev/data`, `ATRIUM_APP_USERDATA=<워크트리>/backend/.dev/app`
- 실제 판(`atrium`, 47800)과 47811~47858, 47860, 47861은 쓰지 않는다. 실제 판에 떠 있는 시험 워커(@ds1, @dsk, @gpt, @opus)는 사용자 것이니 건드리지 않는다.
- 대화 목록은 시험 폴더의 대화만 읽는다(`ATRIUM_CLAUDE_PROJECTS`, `ATRIUM_CLAUDE_DESKTOP=none`). 시험 폴더는 `C:\Workspace\mtask-p41-*`처럼 새로 만든다.
- opencodex 설정과 키는 읽기만 하고, 값(키, 토큰)을 화면·로그·파일·커밋에 쓰지 않는다. opencodex 설정은 고치지 않는다.
- 끝나면 시험 세션, 창, 백엔드, herdr 서버와 세션(`atrium-dev-p41`만), 시험 폴더, 시험 대화 기록을 끄고 지운다.

### 지킬 것

- `CLAUDE.md`를 따른다. 신뢰 대화상자는 대신 수락하지 않는다. 프로세스는 직접 띄운 것만 PID로 끈다.
- 이 저장소는 공개다. 작업 기록, 시험 코드, 커밋 메시지에 사용자 경로·메일·토큰·키를 쓰지 않는다. 커밋 전·푸시 전 검사를 건너뛰지 않는다.
- 같은 때 두 작업자가 돈다.
  - P42(터미널 선택을 웹처럼)는 `TerminalView.jsx`, `lib/term-input.js`, 터미널 쪽 `Canvas.jsx`, 백엔드의 터미널 중계·글 읽기를 고친다.
  - P43(아래 바 자동 숨김과 방향키)은 `Chrome.jsx`, `CommandBar.jsx`, `Search.jsx`, `main.jsx`의 키 처리, `styles.css`를 고친다.
  - 너는 그 파일을 되도록 건드리지 않는다. 화면 글은 `locales/en.js`·`ko.js` 끝에 더하고, 한국어는 P39 말투(합니다체)와 용어를 따른다.
- 자기 브랜치에만 커밋한다. 커밋 메시지에 `Co-Authored-By` 줄을 넣지 않는다. `main`을 바꾸거나 푸시하지 않는다. `node_modules`는 워크트리 안에서 받는다(`npm ci`).
- 문서는 이 작업 파일의 작업 기록 절과 보고 절만 고친다. 고쳐야 할 ARCH 행(4절 K1·K2, F 런처, API·모듈 표)과 BRIEF 가지 펼치기 행의 새 문장은 보고 절에 적는다.
- 끝나면 보고 절을 쓰고, 맨 마지막에 `<워크트리>/backend/.dev/p41.done`(브랜치 이름과 마지막 커밋 해시 두 줄)을 만든다.

### 읽을 파일

- `CLAUDE.md`, `docs/testing.md`, `docs/ARCH.md` 4절 F(런처, DeepSeek)와 K
- `docs/log/p25-*.md`, `docs/log/p33-launchers.md`, `docs/log/p36-workers-skill.md` 보고 절
- `backend/src/branch.mjs`(child, SKILL_BODY, BRANCH_ALLOW), `backend/bin/atrium-child.mjs`, `backend/src/launchers.mjs`, `backend/src/deepseek.mjs`, `backend/src/backend.mjs`(spawn의 plan, 런처 풀기)

## 작업 기록

## 보고
