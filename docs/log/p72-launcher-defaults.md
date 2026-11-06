상태: 닫힘
날짜: 2026-11-06

## 지시

### 목표

새로 받는 사람의 기본 호출자를 Claude Code, Codex, 셸 셋으로 하고, Codex 모델 목록을 Codex가 아는 모델로 채운다.

### 할 것

1. **새 판의 기본 호출자.** 사용자의 말: "지금 내 세팅은 claude code 에서 bypasspermissions 랑, ocx 가 깔려있다는 가정 하의 deekseek in claude code -bypasspermissions 옵션이 들어와있는데, 이 프로그램 처음 받아서 쓰는 사람은 그냥 claude 랑 codex 랑 shell만있게. 그렇게 설정하자. 이 세팅은 내 개인 세팅임."
   - 지금(`backend/src/launchers.mjs` `initialLaunchers`) 새 판은 Claude Code·Codex·셸이 즐겨찾기이고, DeepSeek 예시 호출자가 즐겨찾기 밖에 하나 더 있다.
   - 새 판에는 Claude Code(권한 방식 manual), Codex, 셸 셋만 둔다. DeepSeek 예시는 만들지 않는다. 설정 탭에서 게이트웨이 호출자를 직접 만드는 길과 풀이는 남긴다.
   - 빈 데이터 폴더로 판을 처음 켜서, 사용자 개인 설정으로 보이는 것이 더 없는지 본다. 예: DeepSeek·opencodex 게이트웨이를 묻거나 닿는지 보는 일, bypass 기본값, 개인 모델 이름. 있으면 새 판에서 빼고 보고에 적는다.
   - 이미 있는 판(호출자 목록이 판 기록에 있음)은 바꾸지 않는다. 사용자의 판에 있는 DeepSeek와 bypassPermissions 호출자는 그대로 남아야 한다.
2. **Codex 모델 목록.** 사용자의 말: "새 런쳐 만들때 codex에서 모델 설정이 gpt-6-astra 밖에 없는데 난 gpt-6.1-sol 같은 애들도 다 떴으면 좋겠는데. 어케하지 모델명 좀만 틀리면 호출 안되잖아. 그런거 어케 해줌?"
   - 지금은 `HARNESSES.codex.models = ['gpt-6-astra']` 하나로 굳어 있다.
   - Codex CLI가 쓸 수 있는 모델을 어디서 아는지 찾는다. 예: `CODEX_HOME`(기본 `~/.codex`) 아래의 모델 목록 캐시 파일, 설정 파일, `codex`의 명령. 공식 문서나 설치된 Codex 패키지 안을 읽어 근거를 찾는다. 사용자의 Codex 설정과 인증 파일은 읽기만 하고, 그 내용(토큰, 계정)을 기록이나 시험에 남기지 않는다.
   - 찾은 곳에서 모델 목록을 읽어(짧게 캐시, 읽지 못하면 지금 목록) 호출자 설정의 Codex 모델 고르기와 `atrium models`에 모두 보인다.
   - 직접 입력은 그대로 받는다. 목록에 없는 이름을 넣으면 "Codex 목록에 없는 모델입니다. 이름이 맞는지 확인하세요"를 보이되 막지는 않는다.
   - Claude Code 모델 목록도 같은 방법이 있으면 보고에 적는다(이번에는 바꾸지 않는다).
   - 시험은 가짜 `CODEX_HOME`(시험 폴더)으로 한다.

### 완료 기준

1. 단위 시험을 더하고 통과한다: 새 판의 호출자가 셋인 것, 옛 판은 그대로인 것, Codex 모델 목록 읽기(있음, 없음, 깨진 파일), 목록에 없는 이름의 경고.
2. 빈 데이터 폴더의 개발용 판에서 레일과 설정 › 호출자 탭을 찍고, 가짜 `CODEX_HOME`의 목록이 Codex 모델 고르기에 보이는 것을 찍어 `experiments/p72/`에 둔다.
3. `cd backend && npm test`, `cd app && npm test`, `cd app && npm run build`가 통과한다.

### 읽을 파일

- `CLAUDE.md`, `docs/testing.md`, `docs/log/p33-launchers.md`(호출자를 만든 단계)
- `backend/src/launchers.mjs`, `backend/src/deepseek.mjs`, `backend/src/settings.mjs`, 모델 이름을 푸는 곳(`atrium models`)
- `app/src/renderer/Launchers.jsx`, `app/src/renderer/lib/launchers.js`, 두 사전

### 시험 환경

- 이 작업은 `dev` 브랜치에서 시작한다. 워크트리를 연 뒤 먼저 `git fetch origin && git merge --ff-only origin/dev`를 한다(워크트리가 `main`에서 시작할 수 있다).
- 개발용 판은 너만의 판으로 띄운다(`docs/testing.md`).
  - `ATRIUM_HERDR_SESSION=atrium-dev-p72`, `ATRIUM_PORT=47892`, 창의 원격 디버깅 포트 9372
  - `ATRIUM_DATA_DIR=<워크트리>/backend/.dev/data`, `ATRIUM_APP_USERDATA=<워크트리>/backend/.dev/app`
- 실제 판(`atrium`, 47800)과 다른 판의 포트는 쓰지 않는다. 사용자의 기본 herdr 세션, 실제 판의 herdr 세션(`atrium`), 다른 판의 herdr 서버는 건드리지 않는다. 사용자의 실제 판은 열지도 캡처하지도 않는다.
- 너는 사용자의 실제 판 위에서 도는 워커다. 실제 판의 API(47800)와 `atrium` 명령으로 실제 판을 바꾸지 않는다. 시험의 `atrium` CLI는 늘 개발용 판 환경 변수(`ATRIUM_PORT` 등)를 주고 부른다.
- 실제 설치 폴더(`%LOCALAPPDATA%\atrium\versions`)와 실제 데이터 폴더(`%LOCALAPPDATA%\atrium`)는 읽지도 바꾸지도 않는다.
- 대화 목록은 시험 폴더의 대화만 읽는다(`ATRIUM_CLAUDE_PROJECTS`, `ATRIUM_CLAUDE_DESKTOP=none`). 시험 폴더는 `C:\Workspace\mtask-p72-*`처럼 새로 만든다.
- 세션은 `claude --model haiku`와 셸로 띄운다.
- 끝나면 시험 세션, 창, 브라우저, 백엔드, herdr 서버와 세션(`atrium-dev-p72`만), 시험 폴더를 끄고 지운다. 네가 띄운 프로세스가 남지 않았는지 포트로 확인한다.

### 지킬 것

- `CLAUDE.md`를 따른다. 프로세스는 직접 띄운 것만 PID로 끈다.
- 이 저장소는 공개다. 작업 기록, 시험 코드, 커밋 메시지, 그림에 사용자 경로·메일·토큰, 실제 PC·tailnet 이름, IP, 실제 대화 내용을 쓰지 않는다. 커밋 전·푸시 전 검사를 건너뛰지 않는다.
- 화면 글은 영어와 한국어 사전 둘 다 고친다. 한국어 문구는 사전의 지금 말투(`docs/log/korean-copy-review.md`)를 따른다.
- 같은 때 다른 작업자(P71(작은 고침), P73(세션 크기와 덩어리), P74(휴대폰 화면과 웹앱))가 돈다. 맡은 일에 필요한 만큼만 고치고, `styles.css`와 두 사전은 끝에 더해 합치기 쉽게 한다.
- 자기 브랜치에만 커밋한다. 커밋 메시지에 `Co-Authored-By` 줄을 넣지 않는다. `main`이나 `dev`를 바꾸거나 푸시하지 않는다. `node_modules`는 워크트리 안에서 받는다(`npm ci`, 창은 그 뒤 `node node_modules/electron/install.js`).
- 문서는 이 작업 파일의 작업 기록 절과 보고 절만 고친다. 고쳐야 할 ARCH·BRIEF·testing·README 문장은 보고 절에 짧게 적는다.
- 끝나면 보고 절을 쓰고, 맨 마지막에 `<워크트리>/backend/.dev/p72.done`(브랜치 이름과 마지막 커밋 해시 두 줄)을 만든다.

## 작업 기록

- `origin/dev`를 받은 뒤 `backend/.dev/clean-env.sh`(ATRIUM_·MTASK_·HERDR_ 변수를 지우고 인자를 실행)를 만들었다. 시험, 빌드, 개발용 판, herdr, atrium CLI는 모두 이것을 거쳐 돌렸다(이 파일은 git 밖).
- Codex 모델 목록이 있는 곳을 찾았다. 설치된 Codex CLI 0.163.0의 `codex debug models`가 모델 카탈로그를 JSON으로 보이고(`--bundled`는 실행 파일에 든 목록), Codex는 받은 카탈로그를 `$CODEX_HOME/models_cache.json`(기본 `~/.codex`)에 둔다. 모양은 `{ fetched_at, client_version, models: [{ slug, display_name, visibility: list|hide, priority, … }] }`이고 `codex -m`의 이름이 `slug`다. 사용자 폴더에서는 이 파일의 칸 이름과 slug만 읽었고, 인증·설정 파일은 열지 않았다.
- 새 모듈 `backend/src/codex-models.mjs`: 캐시 파일을 읽는다. visibility가 list인 모델만 priority 순서로 보이고, hide인 모델은 "아는 이름"으로만 둔다. 파일이 크므로(모델마다 지시문) 5초에 한 번만 크기·시각을 보고, 바뀌었을 때만 다시 읽는다. 파일이 없거나 깨졌으면 지금 목록(`gpt-6-astra`)을 쓴다. 판은 `codex` 프로세스를 띄우지 않는다.
- `launchers.mjs`: 새 판은 Claude Code(manual)·Codex·셸 셋만 만든다. 옛 판(설정이나 세션 기록이 있던 판)은 예전처럼 DeepSeek를 옮기고, 이미 목록이 있는 판은 건드리지 않는다. 하네스 설명에 읽어 온 Codex 목록(`models`, `hiddenModels`, `modelLabels`, `modelSource`)을 싣고, Codex 모델이 목록 밖이면 미리보기에 경고(`launcherModels.unlisted`)를 단다. 저장은 막지 않는다.
- `models.mjs`·`branch.mjs`: `atrium models`의 Codex 줄이 같은 목록을 쓴다. 새 판에서 개인 설정으로 보이는 것 하나를 더 찾아 뺐다. 새 판에서도 `atrium models`가 opencodex 기본 주소(127.0.0.1:10100)를 물었고, 닿지 않으면 오류 글에 "게이트웨이가 닿지 않아…"가 붙었다. 이제 주소를 환경 변수(`ATRIUM_OCX_HEALTH`·`ATRIUM_OCX_BASE_URL`)로 줬거나 판에 DeepSeek 호출자가 있을 때만 묻는다(`cfg.ocxConfigured`).
- 창: 모델 칸의 브라우저 datalist를 창 안 목록(`ModelInput`)으로 바꿨다. datalist는 친 글자로 목록을 줄여서, 모델이 하나 들어 있으면 다른 모델이 보이지 않는다. 또 펼친 목록이 창 밖 그림이라 창 시험에 담기지 않는다. 새 목록은 누르면 전부 보이고, 고른 뒤에도 전부 보이며, 친 글자로 거르고, Esc는 목록만 닫는다. 모델 칸 아래에 목록 밖 경고 줄을 보인다. 두 사전과 `styles.css`는 끝에 더했다.
- 단위 시험: 백엔드 `test/p72.test.mjs`(7개)와 창 `test/p72-lib.test.mjs`(3개)를 더했다. 새 판에 DeepSeek가 있다고 보던 옛 시험(P25 하나, P33 둘, P41 아홉)은 "DeepSeek 호출자가 있는 판"(옛 판)을 만들어 돌게 고쳤다. 내용은 바꾸지 않았다.
- 창 시험: `app/test/e2e/p72-launchers.mjs`(개발용 판 atrium-dev-p72, 47892, 원격 디버깅 9372, 빈 `backend/.dev/data`, 가짜 CODEX_HOME). 19개 확인이 모두 통과했다. 결과는 `experiments/p72/`에 있다(git 밖).
- 사고 하나: 처음 돌릴 때 datalist 목록을 찍으려고 창 자리를 화면에서 찍었다(CopyFromScreen). 그런데 시험 창이 앞에 오지 않아서, 그 자리에 있던 사용자의 실제 판 창이 찍혔다. 그 그림은 바로 지웠다. 저장소, 커밋, 시험 결과 어디에도 남지 않았다. 그 뒤 화면 찍기는 시험에서 빼고 창 안만 찍는다(`page.screenshot`). 위의 datalist를 창 안 목록으로 바꾼 것도 이 때문이다.
- 정리: 창, 백엔드, herdr 서버를 끄고 herdr 세션 `atrium-dev-p72`를 지웠다. 시험 폴더 `C:\Workspace\mtask-p72-ws`, 개발용 판의 데이터와 가짜 CODEX_HOME도 지웠다. 47892·9372에서 듣는 프로세스가 없고, 띄운 창·백엔드 PID도 남지 않은 것을 확인했다.

## 보고

### 한 것

1. **새 판의 기본 호출자.** 새 판(빈 데이터 폴더)에는 Claude Code(`claude --permission-mode manual`), Codex, 셸 셋만 생기고 모두 레일에 있다. DeepSeek 예시는 만들지 않는다. 설정 › 런처 탭의 "New launcher"(환경 변수, 게이트웨이 확인 주소, 풀이)로 게이트웨이 호출자를 만드는 길은 그대로다. 호출자 목록이 판 기록에 있는 판은 바꾸지 않는다. 그래서 사용자 판의 DeepSeek와 bypassPermissions 호출자는 그대로 남는다(시험으로 확인). P33 전의 옛 설정만 있는 판도 예전처럼 DeepSeek를 옮긴다.
2. **새 판에서 더 뺀 개인 설정.** 새 판의 `atrium models`가 opencodex 기본 주소(127.0.0.1:10100)를 묻던 것을 뺐다. 주소를 환경 변수로 줬거나 DeepSeek 호출자가 있는 판에서만 묻는다. 빈 판의 백엔드 기록에도 opencodex·10100·deepseek이 없다(창 시험). 그 밖의 것은 손대지 않았다.
   - bypass 기본값: 새 판의 Claude Code는 manual이다. 권한 방식 고르기에 bypassPermissions가 들어 있는 것은 고를 수 있는 값이라 그대로 두었다.
   - 개인 모델 이름: 새 판의 호출자에는 모델이 비어 있다(하네스 기본).
   - 남은 것(바꾸지 않음): 런처 환경 변수 칸의 자리 표시 글 `ANTHROPIC_BASE_URL=http://127.0.0.1:10100`은 opencodex 포트를 예로 든다. 옛 P25 DeepSeek 길(사전의 `deepseek*` 글, `spawn --kind deepseek`, 기본 health 주소)은 옛 판과 옛 명령을 위해 남겼다. README "Optional" 줄은 아직 DeepSeek 세션에 10100 게이트웨이가 필요하다고 적는다.
3. **Codex 모델 목록.** 판은 Codex의 `$CODEX_HOME/models_cache.json`을 읽는다(5초 간격 확인, 바뀌면 다시 읽기, 읽지 못하면 `gpt-6-astra`). 런처 설정의 Codex 모델 칸을 누르면 그 목록이 뜨고, `atrium models`의 Codex 줄도 같은 목록이다. 직접 입력은 그대로 받는다. 목록 밖 이름(숨긴 모델 제외)을 넣으면 "Codex 목록에 없는 모델입니다. 이름이 맞는지 확인하세요."(영어 "This model is not in the Codex list. Check that the name is right.")를 보이되 저장은 된다.
4. **Claude Code 모델 목록(이번에는 바꾸지 않음).** Claude Code도 모델 카탈로그를 `~/.claude/cache/model-catalog/`에 캐시한다. 그러나 파일 이름에 계정·조직 식별자가 들어가고, 내용이 내부용 버전 형식(`version`, `catalog: { surface, config, state }`)이라 공개된 모양이 아니다. 게이트웨이 모델 찾기 결과는 `~/.claude/cache/gateway-models.json`(`baseUrl`, `fetchedAt`, `models`)에 있고, 판은 이미 게이트웨이의 `/v1/models`를 직접 읽는다(P41). Claude Code는 지금처럼 고정 목록과 별칭으로 두는 것이 낫다고 본다.

### 확인

- `cd backend && npm test` 516개 통과, `cd app && npm test` 245개 통과, `cd app && npm run build` 성공.
- 창 시험(`app/test/e2e/p72-launchers.mjs`) 19/19 통과. 그림은 `experiments/p72/`에 있다.
  - `p72-1-rail.png`: 레일의 런처 셋
  - `p72-2-launchers-tab.png`: 런처 탭의 셋
  - `p72-3-codex-models.png`: 가짜 CODEX_HOME의 다섯 모델이 Codex 모델 칸 아래에 보임(숨긴 모델은 없음)
  - `p72-4-codex-unlisted.png`, `p72-5-codex-unlisted-ko.png`: 목록 밖 이름 경고(영어, 한국어)
  - `p72-atrium-models.txt`: 판이 띄운 haiku 세션의 `atrium models` 출력(Codex 줄 다섯, 게이트웨이 줄 없음)

### 고칠 문서 문장(지휘 세션에)

- `docs/ARCH.md` F6: "DeepSeek(opencodex 게이트웨이)는 그 예시다" 뒤에 "새 판에는 만들지 않는다(P72, Claude Code·Codex·셸 셋). Codex 모델은 Codex의 `models_cache.json`을 읽는다(`codex-models.mjs`)."를 더한다. 모듈 표에 `codex-models.mjs`를 더한다.
- `docs/BRIEF.md` "에이전트 종류" 행: "DeepSeek(opencodex 게이트웨이)는 그 예시다(2026-11-02 사용자 요청, P33)"를 "새 판의 기본 호출자는 Claude Code·Codex·셸이고, DeepSeek(opencodex 게이트웨이) 같은 게이트웨이 호출자는 사용자가 만든다(2026-11-06 사용자 결정, P72)"로 바꾸고, 이전 문장은 `docs/decisions.md`로 옮긴다.
- `docs/testing.md`: "창 시험은 창 안만 찍는다(`page.screenshot`). 화면 영역 찍기(CopyFromScreen 등)는 다른 창, 곧 실제 판이 담길 수 있어 쓰지 않는다." 한 줄을 더한다. 가짜 `CODEX_HOME`으로 Codex 목록을 시험한다는 것도 적는다.
- `README.md` Optional 줄: DeepSeek 세션은 기본이 아니라 사용자가 게이트웨이 런처를 만들 때만 필요하다고 고친다.

### 남은 것

- 런처 환경 변수 칸의 자리 표시 글(127.0.0.1:10100)을 더 일반적인 예로 바꿀지는 정하지 않았다.
- 모델 목록에 화살표 키로 고르는 기능은 넣지 않았다(누르기와 직접 입력만).
