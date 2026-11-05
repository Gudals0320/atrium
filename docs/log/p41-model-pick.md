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

2026-11-05 작업자 세션(P41 워크트리).

- 원인 확인. `branch.mjs spawnChild`는 `b.spawn`에 `model`만 넘기고 `launcher`를 넘기지 않는다. 그래서 `spawnPlanOf`가 호출자 없는 길로 가고 `env: null`이다. 세션 설정 파일에 `ANTHROPIC_BASE_URL`이 없어 Claude Code가 사용자 설정의 길(Anthropic)로 모델을 보내고, 게이트웨이 모델 이름은 `model_not_found`가 된다. 지휘 세션의 짐작이 맞다.
- 실제 판에서 실패한 하위 세션의 기록 파일을 읽기만 했다. 오류는 `isApiErrorMessage: true`, `error: "model_not_found"`, 모델 `<synthetic>`, 글 "There's an issue with the selected model (…)"로 남아 있었다. `deepseek-flash`, `ocx-claude-native--gpt-6.1-sol[1m]`, `ocx-claude-deepseek--deepseek-flash[1m]` 세 번이다.
- 게이트웨이(사용자가 띄워 둔 opencodex, 읽기만):
  - `/v1/models`를 머리글 없이 읽으면 OpenAI 모양 17개(`gpt-6.1-sol`, `deepseek/deepseek-flash` 등)다.
  - `anthropic-version` 머리글을 주면 Claude Code용 별칭 33개다. Claude Code의 게이트웨이 모델 찾기와 같은 모양이다. ID는 `claude-fable-5-p088`, 표시 이름은 `deepseek-flash (deepseek)`, 변형은 `· 1M`, `· Fast`다.
  - 짧은 요청(`max_tokens` 5)을 보냈다. 광고한 ID(`claude-fable-5-p088`)와 opencodex 모양(`ocx-claude-deepseek--deepseek-flash`) 둘 다 답했다. 없는 이름은 `not_found_error`였다.
  - opencodex 설정 파일은 열쇠 이름만 보았다(값은 가림). 고치지 않았다.
- 정한 것:
  - 목록은 세 곳에서 온다: 호출자, 하네스 모델, 게이트웨이 모델.
    - 하네스 모델에는 별칭 `fable` → `claude-fable-5-1`을 둔다. `opus`·`sonnet`·`haiku`는 Claude Code 별칭이라 그대로 넘긴다.
    - 게이트웨이 모델은 Claude Code가 보는 목록(`anthropic-version`)을 쓴다. 판이 게이트웨이 없이 띄우는 Anthropic 모델은 뺀다.
  - 같은 모델을 가리키는 줄은 하나로 본다(호출자 > 하네스 > 게이트웨이). 예를 들어 "deepseek flash"는 DeepSeek 호출자와 게이트웨이 `deepseek-flash` 줄에 함께 맞지만, 하나로 풀린다.
  - 변형(1M, fast)은 말에 있을 때만 고른다. 호출자 줄의 변형은 호출자가 정한 값이라 감점하지 않는다.
  - GPT의 기본 길은 게이트웨이 경유 Claude Code다(보고 5).
  - 모델 오류는 hook으로 알아챈다. 시험 판에서 `StopFailure { error: "model_not_found" }`가 글 없이 오는 것을 봤다. 화면 글은 읽지 않는다.
- 시험 판 1(게이트웨이 켜짐):
  - lead(haiku)는 스킬을 부르고 `atrium models`를 본 뒤, `atrium child ds-flash --model claude-fable-5-p088`과 `atrium child haiku-w --model haiku`를 한 응답에 냈다. 둘 다 `2`라고 답했다.
  - 모델 오류의 hook에 글이 없어서 부모가 까닭을 읽지 못했다. 그래서 판이 모델 이름으로 글을 채우게 했다.
- 시험 판 2(`P41_DOWN=1`): opencodex health 주소를 닫힌 포트 10199로 두고 다른 데이터 폴더를 썼다. 게이트웨이 모델은 띄우지 않았다. 가까운 후보에 "claude-fable-5-1"이 끼었다. 숫자 낱말 "1"이 겹침으로 세어졌기 때문이다. 숫자만인 낱말을 세지 않게 고쳤다.
- Python으로 고친 정규식 하나에 `\b`가 백스페이스 글자로 들어갔다. 단위 시험이 잡았고 고쳤다.

## 보고

### 만든 것

1. **목록 `atrium models`**(새 모듈 `backend/src/models.mjs`, `branch.mjs listModels`, `POST /branch/models`, `bin/atrium-child.mjs`).
   - 호출자 줄: 이름, 하네스, 모델, 게이트웨이 경유 여부와 주소, 명령 `atrium child <이름> --launcher <호출자>`.
     - 이름에 빈칸이 있으면 명령에 ID(`claude`)를 쓴다.
     - 셸·직접 명령 호출자는 하위 세션이 될 수 없어 뺐다.
   - 하네스 모델과 별칭:
     - claude: `haiku`·`sonnet`·`opus`(Claude Code 별칭), 전체 ID, `claude-fable-5-1`(별칭 `fable`).
     - codex: `--kind codex --model <모델>`.
   - 게이트웨이 모델: 표시 이름과 명령을 줄마다 보인다.
     - 읽는 곳: 게이트웨이를 쓰는 claude 호출자(`ANTHROPIC_BASE_URL`)마다, 그리고 판 설정의 opencodex 주소(호출자가 없어도).
     - 읽는 법: `/v1/models`를 `anthropic-version` 머리글로 읽는다. 2초 안에 답이 없으면 안 닿은 것으로 보고, 읽은 목록은 20초 동안 기억한다.
     - `[1m]`이 든 ID는 큰따옴표로 묶는다. 안 닿으면 그 게이트웨이 줄에 까닭(`ECONNREFUSED` 등)을 적는다.
   - 승인 규칙(`BRANCH_ALLOW`)에 `atrium models`·`mtask models`(Bash, PowerShell)를 더했다. 이미 돌던 세션에는 `refreshSettings`가 더한다.
2. **호출자로 띄우기 `atrium child <이름> --launcher <호출자>`.**
   - 그 호출자를 `session.spawn { launcher }`로 그대로 넘긴다. 하네스, 모델, 노력 수준, 권한 모드, herdr 자동 승인, 추가 인자, env, 게이트웨이 확인, 노드 로고(flavor)가 레일과 같다. 준 `--effort`만 덮는다.
   - 없는 호출자면 `no_launcher`를 돌려주고 `atrium models`를 알려 준다.
   - 셸·직접 명령 호출자와, `--model`을 함께 준 것은 거부한다.
3. **말로 한 이름 풀기 `atrium child --model <말>`.**
   - 보는 순서:
     1. 정확한 ID: 호출자 이름·ID, 모델 ID. 같은 모델 ID가 여럿이면 게이트웨이 호출자 > 하네스 > 게이트웨이 모델 순으로 고른다.
     2. 별칭: `fable`, 게이트웨이 모델 이름(`gpt-6.1-sol`), `provider/모델`, opencodex 모양(`ocx-claude-<제공자>--<모델>[…]`), 호출자 모델의 알맹이(`deepseek-flash`).
     3. 느슨한 맞춤: 대소문자, 빈칸, 하이픈, 밑줄, 점을 무시하고 같은지 먼저 본다. 같은 것이 없으면 말의 낱말이 모두 들어 있는 줄을 본다.
   - 같은 모델을 가리키는 줄끼리는 하나로 본다. 변형(1M, fast)은 말에 있을 때만 고른다.
   - 하나로 정해지면 띄운다.
     - 응답에 `resolved { from, how, source, to, launcher, model, gateway, command }`가 있다.
     - CLI 첫 줄은 `모델 "deepseek flash" → 호출자 DeepSeek … (느슨한 맞춤)`이다.
     - 판 이벤트 `branch_child`에도 `resolved`를 남긴다.
   - 여럿이면 `model_ambiguous`다. 띄우지 않고, 서로 다른 모델마다 설명과 명령을 오류 글과 `candidates`에 넣는다.
   - 없으면 `model_unknown`이다. 띄우지 않고, 가까운 후보를 다섯까지(낱말 겹침, 글자 거리 순) 주고 `전체 목록: atrium models`를 붙인다. 게이트웨이가 안 닿았으면 그 까닭도 준다.
   - `--kind`를 주면 그 종류의 줄만 본다.
   - 따옴표 없이 친 여러 낱말(`--model deepseek flash`)은 띄우지 않고 따옴표로 묶으라고 한다.
4. **게이트웨이 모델.**
   - 띄우는 법: 그 게이트웨이를 쓰는 호출자의 값(env, 확인 주소, 추가 인자)에서 모델만 바꾼 임시 호출자로 띄운다. `session.spawn`에 새 값 `launcherDef`를 더했다.
   - 권한 모드, 노력 수준, herdr 자동 승인은 부모의 것을 물려받는다. `--model`로 띄우는 다른 하위 세션과 같다.
   - 띄우기 전에 지금의 `checkGateway`/`checkProxy`로 게이트웨이가 닿는지 본다. 안 닿으면 패널을 만들기 전에 주소와 까닭을 담아 `gateway_down`을 돌려준다. DeepSeek 호출자의 health 주소면 `deepseek_proxy_down`이다.
   - 로고: 제공자가 deepseek일 때만 DeepSeek 로고다. 그 밖에는 Claude Code 로고다.
   - 함께 고친 것(물려받기): 게이트웨이 세션이 `--model` 없이 `atrium child`를 부르면, 하위 세션도 같은 env와 부모 모델로 뜬다(응답 `inheritedGateway`). 게이트웨이 세션은 spawn 이벤트의 env에 `ANTHROPIC_BASE_URL`이 있는 세션이다. 예전에는 모델만 물려받아 같은 실패가 났다.
5. **GPT 같은 다른 회사 모델의 기본 길은 게이트웨이 경유 Claude Code다.** 까닭은 셋이다.
   - Claude Code 하네스라 hook, 승인 카드, 이어 가기, 잠재우기, 하위 세션 명령이 그대로 붙는다. codex는 F5(hook 없음)다.
   - 게이트웨이가 Claude Code에 알려 주는 목록에 사용자의 GPT 모델이 모두 있다. 판의 codex 모델 목록은 `gpt-6-astra` 하나뿐이다.
   - 사용자가 실제 판에서 처음 시도한 길(opencodex 모델 이름)과 같다.
   - codex로 띄우려면 `--kind codex --model …`(codex 하네스 목록만) 또는 Codex 호출자를 쓴다.
6. **스킬과 짧은 안내.**
   - `SKILL_BODY` 순서 1에 한 줄을 더했다. 사용자가 모델을 말로 하면 `atrium models`로 보고 가장 맞는 줄의 명령으로 띄운다. 들은 말을 `--model`에 그대로 줘도 판이 푼다. 정확한 ID를 묻지 않고, 후보 여럿일 때만 묻는다. 판의 워커 대신 내부 하위 에이전트로 우회하지 않는다.
   - "지킬 것"에 한 줄을 더했다. 모델 오류면 사용자에게 알리고 다른 줄로 다시 띄운다.
   - 스킬 몸글은 약 4,390바이트에서 4,970바이트가 되었다(SKILL.md 전체 5,346바이트).
   - `BOARD_SYSTEM_PROMPT`의 워커 줄에 "워커의 모델을 말로 들으면 `atrium models`에서 골라 띄운다"를 더했다.
   - `atrium` 도움말, 명령 shim의 주석, "모르는 명령" 글에 `models`를 더했다.
7. **띄운 뒤 모델 오류.**
   - 알아채기(hook):
     - Claude Code는 `StopFailure { error: "model_not_found" }`를 글 없이 보낸다(시험 판에서 확인). 지금의 `rt.lastError`로 상태가 `error`가 된다.
     - `Stop`의 답 글이 "There's an issue with the selected model"로 시작해도 오류로 본다(`state.mjs MODEL_ERROR_ANSWER_RE`). 그 글을 답 안에서 인용한 것은 오류가 아니다.
   - 판 이벤트(`branch.mjs noteModelError`): 그 세션에 `model_error`, 부모에 `branch_child_error { child, type, message, model }`를 남긴다. 같은 오류는 한 번만 남긴다.
   - `atrium children`(`childView`): `error { type, message }`와 `model`을 더했다.
     - hook에 글이 없으면 판이 "쓰지 못한 모델: <모델>. 없는 모델이거나, 이 길(게이트웨이 env 없이 등)로는 닿지 않는 모델이다"로 채운다.
     - CLI 줄은 `error — 오류 model_not_found: … · 모델 …`과 "모델을 쓰지 못했다. 다른 모델로 다시 띄운다(atrium models)"다.
   - 창: 노드는 지금처럼 오류 상태로 보이고, 상세 줄에 `model_not_found`가 보인다. 창 코드는 고치지 않았다.

### 완료 기준 1: 단위 시험

`backend/test/p41.test.mjs`(13개, 새 파일)가 다루는 것:
- 모양 읽기: 게이트웨이 표시 이름, opencodex 모양, 변형 말.
- 이름 풀기: 정확, 별칭, 느슨한 맞춤, 여럿, 없음, 종류 거르기, 게이트웨이 꺼짐.
- `--launcher`의 인자와 env: 가짜 herdr 위의 실제 `Backend.spawn`으로 본다. 세션 설정 파일 env, flavor, `--effort` 덮기, 거부들, codex `-m`.
- `--model <말>`의 세 길: 호출자, 하네스, 게이트웨이 모델(env, 권한 모드, 로고).
- 게이트웨이 확인 실패(닫힌 주소): `model_unknown`과 까닭, `deepseek_proxy_down`, 패널을 만들지 않음.
- 게이트웨이 물려받기.
- `atrium models`: 응답, CLI 출력, 따옴표, 여러 낱말 거부, 무엇으로 풀었는지 알리는 줄.
- 승인 규칙, 스킬 글과 짧은 안내.
- 모델 오류: Stop 글, 인용한 답은 오류가 아님, StopFailure, 이벤트 한 번, `atrium children`, 글 없는 StopFailure.

`p8.test.mjs`는 "모르는 명령" 글의 정규식만 고쳤다.

### 완료 기준 2: 개발용 판

- 판: `atrium-dev-p41`(포트 47859).
- 시험 폴더: `C:\Workspace\mtask-p41-ws`(새로 만듦, git 저장소 아님).
- 기록: `experiments/p41/`. 도구: `experiments/p41/tools/`(`mt.cjs`, `as.cjs`, `down.cjs`).

1. **deepseek flash와 haiku**(기록 `lead-messages.txt`, `models-output.txt`).
   - lead(claude `--model haiku`)에게 "워커 둘을 띄워. 하나는 deepseek flash, 하나는 haiku. 각자 1+1을 답하게 해"를 보냈다.
   - lead는 `atrium-herdr:atrium` 스킬을 부르고 `atrium models`를 보았다. 그다음 `atrium child ds-flash --model claude-fable-5-p088 …`와 `atrium child haiku-w --model haiku …`를 한 응답에 냈다.
   - 두 워커 모두 `2`라고 답했고, lead가 모아 보고했다. 사용자에게 모델 이름을 묻지 않았고, 내부 하위 에이전트를 쓰지 않았다.
   - ds-flash의 spawn 이벤트: 모델 `claude-fable-5-p088`, env `ANTHROPIC_BASE_URL`·`CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY`.
2. **없는 모델 "gpt-99"**(기록 `lead-messages-gpt99.txt`).
   - lead의 `atrium child gpt99-w --model gpt-99`가 `model_unknown`으로 끝났다. 가까운 것은 gpt-6-sol, gpt-6.1-sol, gpt-6-luna, gpt-6-astra 등이고, `atrium models`를 함께 알렸다.
   - 판은 띄우지 않았다. lead는 후보를 보이고 사용자에게 골라 달라고 했다.
3. **GPT 길, 한 턴**(기록 `gpt-child.txt`, `children-1.txt`). `atrium child gp1 --model "gpt 6.1 sol"`은 게이트웨이 모델 `gpt-6.1-sol (native)`로 풀렸고(느슨한 맞춤), `2`라고 답했다.
4. **게이트웨이 꺼짐**(기록 `gateway-down.txt`). 시험용 env로 `ATRIUM_OCX_HEALTH`를 닫힌 포트로 두고 다른 데이터 폴더를 썼다.
   - `atrium models`: 게이트웨이 줄에 "닿지 않는다(ECONNREFUSED)".
   - `--model gpt-6.1-sol`: `model_unknown`과 "게이트웨이가 닿지 않아 그 모델 목록은 보지 못했다: …(ECONNREFUSED)".
   - `--model "deepseek flash"`와 `--launcher DeepSeek`: 주소와 까닭이 든 `deepseek_proxy_down`.
   - 세 경우 모두 패널을 만들지 않았다. 같은 판에서 `--model haiku`는 떴다.
5. **띄운 뒤 모델 오류**(기록 `bad-child.txt`, `children-model-error.txt`).
   - 없는 모델(`no-such-model-p41`)의 시험 호출자로 하위 세션을 띄우고 1+1을 시켰다(요금 없음).
   - hook `StopFailure model_not_found`가 오고 상태가 `error`가 되었다. 하위 세션에 `model_error`, 부모에 `branch_child_error` 이벤트가 남았다.
   - `atrium children` 줄: "error — 오류 model_not_found: 쓰지 못한 모델: no-such-model-p41. …".

실제 게이트웨이는 사용자가 띄워 둔 것만 썼다. 끄거나 설정을 바꾸지 않았다. 모델 턴은 lead 두 번(haiku)과 워커 세 번(deepseek flash, haiku, gpt-6.1-sol)이고, 모두 한 턴이다.

정리:
- 시험 세션은 모두 `atrium kill`로 껐다.
- 직접 띄운 백엔드 둘을 PID로 멈췄다.
- herdr 세션 `atrium-dev-p41`을 멈추고 지웠다.
- 시험 폴더와 시험 대화 기록 폴더(`~/.claude/projects` 아래 그 폴더)를 지웠다.
- 창은 띄우지 않았다. 백엔드와 CLI로만 확인했다.

### 완료 기준 3

| 시험 | 결과 |
|---|---|
| `cd backend && npm test` | 348/348 |
| `cd app && npm test` | 100/100 |
| `cd app && npm run build` | 빌드 됨 |

### 고쳐야 할 ARCH 행과 BRIEF 행(이번에는 고치지 않음)

`scripts/check-docs.mjs`로 보면 살아 있는 문서 합계가 지금 69,993/70,000자다. 아래 문장을 넣으려면 다른 곳을 그만큼 줄여야 한다.

- ARCH 4절 **K1**: 명령 목록에 `models`를 더한다. 끝에 다음 문장을 붙인다.
  > `--model`은 말로 한 이름도 받는다. 판은 그 이름을 판이 아는 목록(`atrium models`: 호출자, 하네스 모델·별칭, 게이트웨이가 알려 주는 모델)에서 정확한 ID → 별칭 → 느슨한 맞춤 순서로 푼다. 하나로 정해지면 띄우고 무엇으로 풀었는지 돌려준다. 여럿이 맞거나(`model_ambiguous`) 없으면(`model_unknown`) 띄우지 않고 후보와 명령을 돌려준다. `--launcher`는 그 호출자를 레일과 같게 쓴다. 게이트웨이 모델과 게이트웨이 세션의 하위 세션은 그 게이트웨이 호출자의 env로 띄우고, 띄우기 전에 게이트웨이가 닿는지 본다. 다른 회사 모델의 기본 길은 게이트웨이 경유 Claude Code다.
- ARCH 4절 **K2**: 두 곳을 고친다.
  - "세션 설정 파일의 승인 규칙은 이 명령과 …"의 "이 명령"에 `atrium models`가 들어간다.
  - 스킬 순서 1에 다음을 더한다: 사용자가 모델을 말로 하면 `atrium models`에서 골라 띄운다. 정확한 ID를 묻지 않고(후보 여럿일 때만 묻는다), 내부 하위 에이전트로 우회하지 않는다.
- ARCH 4절 **K**(새 줄 또는 A5 옆):
  > 띄운 뒤 모델 오류는 오류 상태가 된다. 알아채는 것은 hook `StopFailure model_not_found`, 또는 Claude Code의 오류 글로 시작하는 답이다. 부모는 판 이벤트 `model_error`·`branch_child_error`와 `atrium children`의 오류 줄로 까닭을 읽는다.
- ARCH 4절 **F6 호출자**: 끝에 다음 문장을 더한다.
  > 하위 세션은 `atrium child --launcher`로 같은 호출자를 쓴다. 게이트웨이 호출자의 `/v1/models`(Claude Code가 보는 목록)는 `atrium models`의 게이트웨이 모델이 된다.
- ARCH 5절 모듈 표 "가지 펼치기": 괄호에 `models.mjs`(모델 목록, 말로 한 이름 풀기)를 더한다.
- ARCH 6절 API 표:
  - `POST /branch/child`
    - 받는 것: `launcher?`를 더한다.
    - 주는 것: `launcher`, `resolved { from, how, source, to, model, launcher, gateway, command }`, `gateway`, `inheritedGateway`를 더한다.
    - 거부: `model_ambiguous`, `model_unknown`(오류에 `candidates [{ text, command }]`), `no_launcher`, `gateway_down`/`deepseek_proxy_down`을 더한다.
  - 새 행 HTTP `POST /branch/models`: 띄울 수 있는 호출자·모델과 그 명령. → `{ entries: [{ source, harness, kind, launcher, model, label, aliases, gateway, host, variants, text, command }], gateways: [{ url, host, ok, why, count }], parent }`.
  - `POST /branch/children`: 줄에 `error { type, message }`, `model`을 더한다.
  - `session.spawn`: 받는 것에 내부용 `launcherDef`(판 기록에 없는 호출자 값)를 더한다.
- BRIEF **가지 펼치기** 행:
  - 첫 문장 뒤에 넣을 새 문장:
    > 워커의 모델은 사용자가 말로 한 이름("deepseek flash", "opus", "gpt-6.1-sol")을 판이 아는 목록(호출자, 하네스 모델, 게이트웨이 모델)에서 골라 띄우고, 정확한 ID를 사용자에게 묻지 않는다. 여럿이 맞을 때만 묻고, 모르는 이름으로는 띄우지 않는다. 게이트웨이 모델은 그 게이트웨이의 env로 띄운다(2026-11-05 사용자 요청, P41).
  - 이유 칸에 더할 문장:
    > 판 워커에 모델 이름만 넘겨 게이트웨이 모델이 `model_not_found`로 실패했고, 판 세션은 ID를 묻거나 내부 하위 에이전트로 우회했다(사용자).

### 계획과 다른 곳

- 원인은 지시의 짐작대로 `atrium child --model`이 env를 넣지 않은 것이었다. 그 밖에 하나를 더 찾아 함께 고쳤다. 게이트웨이 세션의 하위 세션도 모델만 물려받아 같은 실패가 났다(만든 것 4).
- 게이트웨이 목록의 Anthropic 모델(`claude-opus-5-5 (anthropic)` 등)은 목록에서 뺐다. 이 모델은 판이 게이트웨이 없이 하네스 줄로 띄운다.
- 게이트웨이 모델은 게이트웨이가 광고한 ID(`claude-fable-5-p08e`)로 띄운다. opencodex 모양 이름(`ocx-claude-native--gpt-6.1-sol[1m]`)도 별칭으로 받아 같은 줄로 푼다. 그래서 Claude Code 머리줄에는 게이트웨이가 붙인 이름대로 "Fable 5"로 보인다.
- 권한 모드와 herdr 자동 승인을 누구에게서 받는지는 길마다 다르다.
  - `--launcher`: 부모가 아니라 호출자의 것이다("레일에서 띄운 것과 같게"). `--model`이 호출자 줄로 풀린 경우도 같다.
  - 게이트웨이 모델 줄과 하네스 줄: 지금처럼 부모의 것을 물려받는다.
- 창 코드와 사전(`locales`)은 고치지 않았다. 새 화면 글이 없다. 노드의 오류 표시는 지금 것 그대로다.
- 창 시험은 하지 않았다. 백엔드와 CLI로 확인했다.

### 알려진 문제

- `atrium models`가 길다. 이 PC에서는 게이트웨이 모델이 변형마다 한 줄이라 26줄이다. 판 세션이 한 번 읽는 데는 문제없었다.
- 느슨한 맞춤의 낱말 맞춤은 말의 낱말이 모두 들어 있으면 맞는다. 그래서 "flash"처럼 짧은 말은 여럿이 맞아 사용자에게 묻는다(의도한 동작). 말에 없는 제공자 이름까지 맞추지는 않는다.
- 게이트웨이 모델의 노드는 제공자가 deepseek일 때만 DeepSeek 로고다. GPT 등은 Claude Code 로고다.
- 모델 오류의 글은 Claude Code가 hook에 주지 않아 판이 지은 글이다. 게이트웨이를 거친 모델 오류(게이트웨이의 404)는 시험하지 않았다. 같은 `model_not_found`일 것으로 보지만 확인하지 않았다.
- codex 하위 세션이 첫 답에서 모델 오류를 내면 hook이 없어 알아채지 못한다.
- `--launcher`와 `--model`을 함께 주면 거부한다. 다른 모델이면 그 모델의 줄로 띄우게 한다.
