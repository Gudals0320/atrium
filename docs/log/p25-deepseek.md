상태: 닫힘
날짜: 2026-11-02

## 지시

### 목표

왼쪽 레일에서 DeepSeek 세션을 바로 띄운다. 사용자의 말은 다음과 같다.
- 로고는 https://commons.wikimedia.org/wiki/File:DeepSeek-icon.svg 를 쓴다.
- Claude Code에서 opencodex의 DeepSeek 모델로 바로 불러 쓰는 길이 있다. 그것을 그대로 쓴다.
- 그 호출(`claude --…` 등)을 기본값으로 두고, 설정에서 바꾸거나 PowerShell 명령을 직접 치게 한다.

지휘 세션이 2026-11-02에 읽기만 해서 확인한 것은 다음과 같다.
- 사용자의 Claude Code는 `~/.claude/settings.json`의 env(`HTTPS_PROXY` 127.0.0.1:10200, `NODE_EXTRA_CA_CERTS`)로 로컬 opencodex 프록시를 거친다. 프록시는 `ocx status`로 볼 수 있고, 돌고 있었다.
- 사용자의 서브에이전트 `~/.claude/agents/ocx-deepseek-flash.md`는 모델 `ocx-claude-deepseek--deepseek-flash[1m]`이다. 프록시가 이 이름을 DeepSeek로 보낸다.
- `ocx claude [args]`(프록시에 붙인 Claude Code 띄우기)도 있다.

### 정한 것

- **기본 실행.**
  - DeepSeek 세션은 판이 띄우는 Claude Code 세션이다. 판의 hook, 이어 가기, 승인 줄, 잠재우기가 그대로 붙는다.
  - 모델만 `ocx-claude-deepseek--deepseek-flash[1m]`이다(`claude --model "<모델>"`).
  - 노드와 목록에서는 종류를 DeepSeek로 보인다(로고, 이름). 저장은 띄운 방법이 남게 한다(예: 종류 `claude`에 `flavor: 'deepseek'`, 또는 새 종류. 고른 쪽과 까닭을 보고에 적는다).
  - 시작 전에 프록시가 돌지 않으면 알기 쉬운 오류를 낸다(`ocx status`나 health 주소). 프록시를 대신 켜지 않는다.
- **설정**(새 세션 기본값 절).
  - DeepSeek 모델 이름: 기본 `ocx-claude-deepseek--deepseek-flash[1m]`. `[`, `]`, `-`를 받는다.
  - "직접 명령": PowerShell 명령 한 줄. 비우면 위 기본 실행이다.
  - 채우면 판이 새 셸 패널에서 그 명령을 그대로 쳐서 띄운다(예: `ocx claude --model …`, `pi …`).
  - 이 경우는 판의 hook이 없는 에이전트로 다룬다(F3 판에 올리기처럼). 종류 표시는 DeepSeek이다.
  - 명령 글은 실행 전에 길이·줄바꿈을 검사한다. 판이 덧붙이는 인자는 없다.
- **레일과 대화상자.**
  - 왼쪽 레일의 Codex 아래에 DeepSeek 단추를 둔다. 누르면 지금 워크스페이스에 바로 띄우고 그 터미널로 들어간다. Shift+누르기는 대화상자다(P12 방식).
  - 새 세션 대화상자의 종류에도 DeepSeek를 넣는다.
- **로고.**
  - 위 주소의 SVG(원본 파일 `https://upload.wikimedia.org/wikipedia/commons/…/DeepSeek-icon.svg`, 페이지에서 확인)를 받아 `app/src/renderer/assets/kinds/deepseek.svg`로 둔다. 받은 파일은 스크립트가 없는지 보고 쓴다.
  - 레일 단추용은 Claude처럼 바탕이 있는 그림을 만들어도 된다(색은 로고 파랑). 출처와 상표 고지는 `app/THIRD_PARTY_NOTICES.txt`에 더한다.
- **화면 글은 두 언어 사전에 둔다.**

### 완료 기준

1. 개발용 판에서 레일의 DeepSeek 단추로 띄운 세션이 실제로 답하는지 짧게 확인한다.
   - 한 마디 지시. DeepSeek API를 쓰므로 턴은 한두 번만 한다.
   - hook 상태, 승인 줄(권한 질문 하나), 이어 가기를 확인하고 노드·레일 스크린숏을 남긴다.
2. 설정의 "직접 명령"으로 띄우기를 셸 명령(예: `echo` 뒤 `claude --model haiku`)으로 확인한다.
3. 프록시가 꺼진 경우의 오류는 단위 시험으로 본다(프록시를 끄지 않는다). 단위 시험과 기존 `p12-quick.mjs`가 통과한다.

### 시험 환경

- 너만의 개발용 판으로 띄운다(`docs/testing.md`).
  - `ATRIUM_HERDR_SESSION=atrium-dev-p25`, `ATRIUM_PORT=47843`
  - `ATRIUM_DATA_DIR=<워크트리>/backend/.dev/data`, `ATRIUM_APP_USERDATA=<워크트리>/backend/.dev/app`
- 실제 판(`atrium`, 47800)과 기본 개발용 판(`atrium-dev`, 47811)은 사용자가 쓴다. 포트 47800, 47811~47839와 다른 작업자의 포트(47840~47843 중 네 것이 아닌 것)를 쓰지 않는다.
- 대화 목록은 시험 폴더의 대화만 읽는다(`ATRIUM_CLAUDE_PROJECTS`, `ATRIUM_CLAUDE_DESKTOP=none`).
- 시험 폴더는 `C:\Workspace\mtask-p25-*`처럼 새로 만든다. 시험 claude는 `--model haiku`, 턴은 짧게. 첫 지시는 준비된 뒤 `atrium send --wait`로 보낸다.
- 시험 창을 띄워 둔 동안 사람이 만지면 시험이 깨질 수 있다. 결과가 이상하면 다시 돌린다.
- 끝나면 다음을 끄고 지운다: 시험 세션, 창, 백엔드, herdr 서버와 세션, 시험 폴더, 시험 대화 기록.

### 지킬 것

- `CLAUDE.md`를 따른다. 프로세스는 직접 띄운 것만 PID로 끈다. 사용자의 `~/.claude/settings.json`과 opencodex 설정은 고치지 않는다.
- 같은 때 다른 작업자 셋이 돈다(P22 그룹·한 줄 메모 빼기와 Delete 키, P23 덩어리 다듬기, P24 리포 단위 잠재우기, P25 DeepSeek 바로 띄우기). 자기 범위 밖의 파일은 꼭 필요한 만큼만 고친다. 화면 글은 `locales/en.js`·`ko.js`에 둔다(겹침은 지휘 세션이 합칠 때 푼다).
- 자기 브랜치에만 커밋한다. 메시지 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. `main`을 바꾸거나 푸시하지 않는다. `node_modules`는 워크트리 안에서 받는다.
- 살아 있는 문서 합계가 예산(70,000자)에 차 있다. 이번에는 `docs/ARCH.md`도 고치지 않는다. 바뀐 구조와 고쳐야 할 ARCH 행은 보고 절에 적는다. 문서는 이 작업 파일의 작업 기록 절과 보고 절만 고친다.
- 끝나면 보고 절을 쓰고, 맨 마지막에 `<워크트리>/backend/.dev/p25.done`(브랜치 이름과 마지막 커밋 해시 두 줄)을 만든다.

### 읽을 파일

- `CLAUDE.md`, `docs/BRIEF.md`, `docs/testing.md`
- `docs/log/p12-quick-spawn.md`, `docs/log/p20-brand-green.md`(Claude 로고 다룬 방식)
- `backend/src/backend.mjs`(spawn), `settings.mjs`, `launch.mjs`
- `app/src/renderer/Chrome.jsx`, `SpawnDialog.jsx`, `Settings.jsx`, `lib/kinds.js`

## 작업 기록

2026-11-02, P25 작업자 세션(워크트리 `p25`, 브랜치 `worktree-p25`).

- 저장 방식: 새 종류 대신 종류 `claude`에 `flavor: 'deepseek'`(sessions 표의 새 열 `flavor`)을 골랐다. 백엔드에 `kind === 'claude'`로 hook, 이어 가기, 신뢰 예상, 끄기 키(`/exit`), 잠재우기, 다시 열기를 가르는 곳이 많아서, 새 종류로 두면 그 자리를 모두 고쳐야 했다. flavor는 표시와 띄우는 값(모델, 프록시 env)만 바꾼다. 창은 `lib/kinds.js shownKind(s)`(flavor가 먼저)로 로고와 이름을 고른다.
- 로고: 공용 API로 원본 주소(`.../9/95/DeepSeek-icon.svg`, 3,605바이트, SHA-1 `13a3eb70…f520f`, 라이선스 MIT, 저자 알 수 없음)를 확인하고 받았다. 경로 하나이고 `script`, 이벤트 속성, `href`가 없다(창 단위 시험도 본다). 레일 단추 그림은 같은 경로를 #4D6BFE 둥근 네모 위에 흰색으로 얹었다.
- 첫 창 시험에서 DeepSeek 세션이 `model_not_found`로 끝났다(hook의 StopFailure). 시험 폴더(`C:\Workspace\mtask-p25-exp`)에서 새 `claude -p`로 짧게 확인했다.
  - `claude --model "ocx-claude-deepseek--deepseek-flash[1m]"`(사용자 설정의 HTTPS_PROXY 길): 같은 오류. `ocx claude config status`의 `cliFirstParty: false`라서 이 길은 Anthropic 모델만 그대로 넘긴다.
  - `ocx claude -p … --model …`: 답했다.
  - 판과 같은 `claude --settings <파일>`에 env `ANTHROPIC_BASE_URL=http://127.0.0.1:10100`, `CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=1`만 넣어도 답했다. 사용자의 opencodex는 구독 방식이고 이 포트는 로컬 호출에 자격 증명을 받지 않는다(opencodex `buildClaudeEnv`, `localInferenceDestination`을 읽어 확인). 토큰은 넣지 않는다.
  - 그래서 DeepSeek 세션은 판의 세션 설정 파일 env에 이 두 값을 넣는다. 설정 파일은 이어 가기, 깨우기, 되살리기 인자에도 들어가므로 어느 길로 다시 떠도 같다. 다시 열기(`recall.bring`)도 같은 env로 새 설정 파일을 쓴다. 가지 펼치기의 `refreshSettings`는 있는 env를 지킨다.
- 직접 명령: 셸 패널을 만들고 셸 프롬프트를 기다린 뒤 글을 그대로 치고 Enter를 누른다(`command_typed` 이벤트). 에이전트가 나타나면 기존 `promoteShell`이 같은 노드를 hook 없는 종류로 바꾸고, flavor는 그대로 남는다. 첫 지시는 받지 않는다(준비된 때를 모른다).
- 개발용 판 `atrium-dev-p25`(47843, `backend/.dev`)에서 창 시험을 돌렸다.
  - `p25-deepseek.mjs` 전체 실행(실제 DeepSeek 턴 하나): 22개 중 21개 통과. 실패 하나는 직접 명령의 echo 줄을 화면에서 찾는 시험 방법이었다(claude가 뜨며 화면을 지운다). 시험을 echo가 시험 폴더에 파일을 쓰고 그 파일을 보는 방법으로 바꿨다.
  - DeepSeek API를 다시 쓰지 않으려고 `P25_SKIP_TURN=1`(지시와 이어 가기 단계 건너뜀)로 나머지를 다시 돌려 15/15 통과했다.
  - `p12-quick.mjs`(MT_E2E_OUT=p25 허용 한 줄 추가) 7/7.
- DeepSeek 호출은 다음과 같다: 판의 턴 하나(권한 질문 하나), 실험 `-p` 두 번(`ocx claude`, 설정 파일 env). 처음의 판 턴과 plain `-p`는 `model_not_found`라 DeepSeek에 가지 않았다.
- 정리: 시험 세션은 시험이 껐고, 창은 닫혔다. 백엔드는 `atrium backend stop`, herdr 서버는 내가 띄운 PID(`--session atrium-dev-p25 server`)만 껐다. herdr 세션 폴더, 시험 폴더 둘, 시험 대화 기록 폴더 둘(`C--Workspace-mtask-p25-ws-demo`, `C--Workspace-mtask-p25-exp`), 판 데이터(`backend/.dev/data`, `app`)를 지웠다.

## 보고

### 만든 것

- 왼쪽 레일에서 Codex 바로 아래에 DeepSeek 단추가 있다(로고 파랑 바탕에 흰 고래). 누르면 지금 워크스페이스에 바로 뜨고 그 터미널로 들어간다. Shift+누르기는 대화상자이고, 새 세션 대화상자의 종류에도 DeepSeek가 있다.
- 기본 실행:
  - 판이 띄우는 Claude Code에 `--model <설정의 DeepSeek 모델>`(기본 `ocx-claude-deepseek--deepseek-flash[1m]`)을 준다.
  - 세션 설정 파일 env로 프록시 주소(`ANTHROPIC_BASE_URL`, health 주소의 origin, 기본 `http://127.0.0.1:10100`)에 붙인다.
  - hook, 승인 줄, 이어 가기 등록, 잠재우기·깨우기, 다시 열기가 그대로 붙는다.
  - Claude Code 모델·노력 수준 기본값은 DeepSeek에 쓰지 않는다. 권한 모드와 herdr 자동 승인 기본값은 쓴다. 이름은 `ds1`, `ds2`…다.
- 프록시 확인: 기본 실행 전에 `http://127.0.0.1:10100/healthz`(`ATRIUM_OCX_HEALTH`로 바꿈)가 2초 안에 `status: ok`를 주지 않으면 패널을 만들기 전에 오류 `deepseek_proxy_down`를 낸다. 화면 글은 "`ocx status`로 보고 `ocx start`로 켠 뒤 다시"다. 판은 프록시를 켜지 않는다. 프록시 주소는 `ATRIUM_OCX_BASE_URL`로 따로 줄 수 있다.
- 설정(새 세션 기본값 절): DeepSeek 모델(영문·숫자·`._:/[]-`, 80자), DeepSeek 직접 명령(PowerShell 한 줄, 400자, 줄바꿈·탭·제어 글자 거부). 직접 명령을 채우면 판이 새 셸 패널에 그 글을 그대로 치고 인자를 덧붙이지 않는다. 그 세션은 hook 없는 에이전트(F3·G2 방식)이고 표시는 DeepSeek이다. 대화상자에서 친 명령이 설정보다 먼저다.
- 저장: sessions 표에 `flavor` 열을 더했다(ALTER로 옛 판에도 붙음). 요약(`session.summary`, 닫힌 목록)에 `flavor`가 나간다. spawn 이벤트에 `flavor`, `command`가 남는다.
- 창: 노드 머리줄·아이콘 얼굴·노드 클래스(`kind-deepseek`)는 DeepSeek 로고를 쓰고, 머리줄에 "DeepSeek" 표시를 둔다. 표시의 제목에 hook 있음 또는 직접 명령(hook 없음)을 적는다. 사이드바 줄과 닫힌 목록도 DeepSeek로 보인다. 화면 글은 `locales/en.js`·`ko.js`에 있다.
- 로고와 고지: `assets/kinds/deepseek.svg`(받은 그대로), `deepseek-badge.svg`. 출처, MIT 고지, 상표 고지를 `app/THIRD_PARTY_NOTICES.txt` 6번에 적었다.
- 시험:
  - 백엔드 단위 225개 통과. 그중 `test/p25.test.mjs` 6개(설정 값, 명령 검사, 프록시 health, 꺼진 프록시면 패널 전 오류, 띄우는 인자·설정 파일 env, 직접 명령).
  - 창 단위 50개 통과. 그중 `test/p25-deepseek.test.mjs` 4개(로고·스크립트 없음, shownKind, 두 사전).
  - 빌드 통과.
  - 창 시험 `app/test/e2e/p25-deepseek.mjs`(`experiments/p25/`):
    - 전체 실행(`p25-deepseek-full.*`)은 21/22다. 레일 위치, 대화상자 없이 뜸, 터미널 초점, 인자, 로고, 권한 질문, 승인 줄, 허용 뒤 답 `P25-DEEPSEEK`, hook 수와 토큰, 이어 가기 등록 확인, 잠재우기·깨우기를 봤다.
    - 실패 하나는 위 작업 기록의 시험 방법 문제다. 고친 시험을 턴 없이 다시 돌려(`p25-deepseek.*`) 15/15 통과했다.
    - 스크린숏 여덟 장: 노드, 레일, 승인 줄, 답, 깨운 뒤, 직접 명령, 대화상자, 설정.
  - `p12-quick` 7/7.

### 계획과 다른 곳

- 지시는 "Claude Code가 이미 `~/.claude/settings.json` env로 프록시를 거치므로 `--model`만 바꾸면 된다"는 전제였다. 실제로는 그 길(HTTPS_PROXY, `cliFirstParty: false`)에서 DeepSeek 모델 이름이 `model_not_found`가 된다. 그래서 `ocx claude`가 하는 것 가운데 필요한 env 둘만 판의 세션 설정 파일에 넣었다. 사용자 설정과 opencodex 설정은 고치지 않았다.
- 직접 명령으로 띄운 세션에는 첫 지시를 받지 않는다(대화상자에서 첫 지시 칸을 숨기고, API는 `deepseekCommandNoPrompt` 오류).
- `p12-quick.mjs`는 `MT_E2E_OUT=p25`를 받도록 한 줄 고쳤다.

### 고쳐야 할 ARCH 행(이번에는 고치지 않음)

- 2절 모듈 표 "실행 계획": DeepSeek(flavor)는 세션 설정 파일 env에 프록시 주소를 더한다(`deepseek.mjs`). 새 모듈 행으로 둘 수도 있다: "DeepSeek | 모델·직접 명령 값 확인, 프록시 health, 설정 파일 env(`backend/src/deepseek.mjs`)".
- 2절 "노드 얼굴과 들어가기": 종류 아이콘에 DeepSeek 로고, 보여줄 종류는 `shownKind`(flavor가 먼저).
- 3절 또는 데이터 모델: sessions 표 `flavor` 열.
- API 표 `session.spawn`: 받는 것에 `kind: 'deepseek'`(또는 `flavor`), `command?`, 주는 것에 `flavor`, `command`. 오류 `deepseek_proxy_down`.
- 4절 F5 근처: DeepSeek 직접 명령은 셸 패널에 친 뒤 G2 승격으로 hook 없는 에이전트가 된다.
- 설정(I7): `deepseekModel`, `deepseekCommand`. 환경 변수 `ATRIUM_OCX_HEALTH`, `ATRIUM_OCX_BASE_URL`.

### 알려진 문제

- 직접 명령 세션을 닫았다 다시 열면 명령을 다시 치지 않는다. 닫힐 때 종류가 claude(hook 없음)였으면 다시 열기는 보통 Claude 다시 열기 길로 가고, 모델이 비어 있어 DeepSeek가 아닌 Claude Code 기본 모델로 이어 갈 수 있다. 시험하지 않았다.
- 직접 명령 세션의 에이전트가 끝나 셸로 돌아가도 노드는 DeepSeek 로고 그대로다(셸 표시는 함께 보인다).
- 프록시 주소는 health 주소의 origin으로 정한다. opencodex에서 `unauthenticatedLoopbackListener`를 다른 포트로 켜면 `ATRIUM_OCX_BASE_URL`로 맞춰야 한다. 사용자의 opencodex가 구독 방식이 아니면(토큰이 필요한 바인드) 이 env로는 거부될 수 있다.
- 대화상자의 이름 칸 안내는 "비우면 s1, s2…"이지만 DeepSeek는 `ds1`이다.
- 처음 로고 정보를 받을 때 위키미디어 API 요청의 User-Agent에 사용자 이메일을 넣었다(한 번). 그 뒤 요청에는 넣지 않았다.
