상태: 닫힘
날짜: 2026-11-02

## 지시

### 목표

세션을 띄우는 방법을 "호출자"로 일반화한다. 지금은 왼쪽 레일에 Claude·Codex·DeepSeek·셸 단추가 고정되어 있고, DeepSeek는 opencodex 게이트웨이가 있다고 가정한다. 사용자의 말은 다음과 같다.
- "우리는 지금 opencodex에 deepseek 연결까지 되어 있다는 가정 하에 작업시키고 있는 것 아니야? 범용성 좀 늘리자."
- "좌측에 있는 바는 즐겨찾는 호출자. 설정에서 하나의 tab에서 관리."
- "claude, codex는 하네스. opus-5-5, gpt-6-astra, deepseek 이런 건 모델."
- "호출자를 직접 작성하거나 하네스별로 선택하고 들어가서 드롭다운 조합해서 호출자 명령어 프리셋 만드는 기능. 그리고 그걸 좌측 즐겨찾기에 넣어서 바로 호출 가능하게 하는."

### 용어

- **하네스**: 세션을 돌리는 CLI 종류. `claude`(Claude Code), `codex`, 그 밖에 herdr가 아는 종류(`agent.kinds`), 그리고 셸.
- **모델**: 하네스에 넘기는 모델 이름(예: `claude-opus-5-5`, `gpt-6-astra`, DeepSeek 게이트웨이 모델).
- **호출자**: 하네스 + 모델 + 옵션(노력 수준, 권한 모드, herdr 자동 승인, 추가 인자, 환경 변수)의 조합, 또는 직접 쓴 명령 한 줄. 이름과 아이콘이 있다.
- **즐겨찾기**: 왼쪽 레일에 놓인 호출자. 순서가 있다.

### 할 것

1. **저장과 API.**
   - 호출자 목록을 판 설정 DB에 둔다.
   - 백엔드 API: 목록, 만들기, 고치기, 지우기, 즐겨찾기·순서. 이름은 네가 정하고 ARCH API 표에 넣을 행을 보고에 적는다.
   - `session.spawn { launcher }`: 호출자를 풀어 띄운다. 함께 준 인자(모델 등)가 호출자 값을 덮는다.
   - CLI: `atrium spawn <폴더> --launcher <이름>`, 호출자 목록 보기.
2. **하네스별로 풀기.** 하네스 정의 표를 한곳에 둔다.
   - `claude`: 모델, 노력 수준, 권한 모드, herdr 자동 승인은 지금처럼(`launch.mjs`). 환경 변수는 세션별 설정 파일의 `env`로 넘긴다. 지금 DeepSeek가 쓰는 길이다.
   - `codex`: 모델은 `-m <모델>`, 그 밖은 추가 인자.
   - herdr가 아는 다른 종류: 추가 인자만.
   - 셸: 에이전트 없는 셸.
   - 직접 명령: 셸 패널에 그 줄을 친다. P25 직접 명령과 같은 길이고, 에이전트가 나타나면 같은 노드의 종류를 바꾼다(`promoteShell`).
3. **설정 창의 "호출자" 탭 하나**로 관리한다. 지금의 "새 세션" 탭(Claude·Codex·DeepSeek 기본값)을 이 탭이 대신한다.
   - 목록: 이름, 하네스 아이콘, 명령 미리보기, 즐겨찾기 켜기, 순서 바꾸기, 고치기, 지우기.
   - 만들기는 두 길이다.
     - (a) 하네스를 고르고 드롭다운을 조합한다. 모델은 하네스별 알려진 목록에 직접 입력을 더한다. 노력 수준, 권한 모드 등을 고른다. 고르는 대로 실제 명령줄 미리보기가 바뀐다.
     - (b) 명령 한 줄을 직접 쓴다.
   - 고급: 추가 인자, 환경 변수(이름=값).
   - P28 원칙대로 창 최소 크기에서도 스크롤 없이 들어가게 한다. 영어·한국어 모두.
4. **왼쪽 레일 = 즐겨찾기 호출자.**
   - 누르면 지금 빠른 띄우기(P12)처럼 바로 새 세션이 뜬다. Shift+누르기는 새 세션 창(`SpawnDialog`)에 그 호출자를 채워 연다.
   - 아이콘은 하네스 로고(`assets/kinds`의 Claude·Codex·DeepSeek 등)다. 직접 명령은 터미널 아이콘이나 첫 글자다. 마우스를 올리면 이름과 명령 미리보기가 보인다.
   - 즐겨찾기가 많아도 레일이 넘치지 않게 한다.
   - 새 세션 창(아래 "New session…" 칩)에서도 호출자를 고를 수 있다.
5. **옮기기**(한 번만, 여러 번 돌려도 같은 결과).
   - 지금 판: 옛 설정(`claudeModel`, `claudeEffort`, `claudePermissionMode`, `claudeAllowHerdr`, `codexArgs`, `deepseekModel`, `deepseekCommand`)을 처음 켤 때 호출자로 옮긴다. 지금 레일 네 단추(Claude, Codex, DeepSeek, 셸)를 그 순서로 즐겨찾기에 둔다. 옛 키를 남길지 지울지 정하고 보고에 적는다.
   - 새 판(옛 설정 없음): 즐겨찾기는 Claude Code, Codex, 셸이다. DeepSeek(게이트웨이를 거치는 Claude Code)는 즐겨찾기 밖 예시 호출자로만 둔다(사용자가 고름).
6. **DeepSeek를 일반화한다.**
   - P25의 `flavor: deepseek`과 opencodex 게이트웨이(`ANTHROPIC_BASE_URL`, `CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY`)를 "Claude Code + 환경 변수(게이트웨이)" 호출자의 한 예로 만든다.
   - 게이트웨이 주소가 있는 호출자는 띄우기 전에 닿는지 확인하고, 지금처럼 알린다.
   - 이미 띄운 DeepSeek 세션과 그 종류 아이콘은 그대로 동작해야 한다(기록된 flavor를 읽는다).
7. **비밀값.** 환경 변수 값은 판 DB에 평문으로 남는다. 설정 탭에 API 키 같은 비밀값을 넣지 말라는 풀이를 둔다. 기본·예시·시험 호출자에 키를 넣지 않는다.

### 완료 기준

1. 단위 시험.
   - 호출자 → spawn 인자 풀기(하네스별)와 명령 미리보기.
   - 옮기기: 옛 설정 → 호출자, 새 판 기본값, 두 번 돌려도 같음.
   - 검사: 이름 겹침, 잘못된 모델 글자, 줄바꿈 든 명령 등.
2. 개발용 판의 창 시험(e2e)으로 확인하고 스크린숏을 남긴다.
   - 설정 탭에서 하네스를 골라 호출자를 만들고(claude, 모델 haiku) 즐겨찾기에 넣는다. 레일에서 누르면 그 모델로 뜬다.
   - 직접 명령 호출자로 띄운다(예: 셸에서 끝나는 짧은 명령).
   - 즐겨찾기 순서 바꾸기와 빼기, Shift+누르기.
   - 옛 설정을 넣은 데이터 폴더로 켜서 옮기기를 확인한다.
   - 영어·한국어 탭에 스크롤이 없다.
   - codex가 깔려 있지 않으면 codex 실행은 건너뛰고 인자 풀기만 확인한다. DeepSeek 게이트웨이가 없으면 "닿지 않음" 알림까지만 본다.
3. 옛 e2e `p12-quick.mjs`, `p25-deepseek.mjs`(P28 설정 탭 때문에 이미 깨져 있음)를 새 구조에 맞게 고친다.
4. `cd backend && npm test`, `cd app && npm test`, `cd app && npm run build`가 통과한다.

### 시험 환경

- 너만의 개발용 판으로 띄운다(`docs/testing.md`).
  - `ATRIUM_HERDR_SESSION=atrium-dev-p33`, `ATRIUM_PORT=47851`
  - `ATRIUM_DATA_DIR=<워크트리>/backend/.dev/data`, `ATRIUM_APP_USERDATA=<워크트리>/backend/.dev/app`
- 실제 판(`atrium`, 47800)과 기본 개발용 판(`atrium-dev`, 47811)은 사용자가 쓴다. 47800, 47811~47847과 다른 작업자의 포트(47848~47850)를 쓰지 않는다.
- 대화 목록은 시험 폴더의 대화만 읽는다(`ATRIUM_CLAUDE_PROJECTS`, `ATRIUM_CLAUDE_DESKTOP=none`). 시험 폴더는 `C:\Workspace\mtask-p33-*`처럼 새로 만든다.
- claude는 `--model haiku`(호출자 모델도 haiku), 턴은 짧게.
- 끝나면 시험 세션, 창, 백엔드, herdr 서버와 세션, 시험 폴더, 시험 대화 기록을 끄고 지운다.

### 지킬 것

- `CLAUDE.md`를 따른다. 프로세스는 직접 띄운 것만 PID로 끈다. 사용자의 `~/.claude/settings.json`과 opencodex 설정을 고치지 않는다.
- 같은 때 다른 작업자 셋이 돈다.
  - P30: 덩어리 안 연결, 덩어리 고른 뒤 버그. `Docks.jsx`, `Search.jsx` 막대, `Canvas.jsx` 고름.
  - P31: 줌 아웃 얼굴 끌기, 정리에 영역 재배열, 워크트리 화살표. `SessionNode.jsx`, `Canvas.jsx` 끌기, `canvas-ops.mjs`.
  - P32: 미션 맵 디자인. `Mission.jsx`, `Chrome.jsx` 연결 알약.
  - `Chrome.jsx`는 P32와 함께 고친다. 레일 부분만 고친다. 화면 글은 `locales/en.js`·`ko.js` 끝에 더한다.
- `settings.mjs`의 설정 정의에 `sleepAfterMin`이 두 번 있다(뒤의 것이 이긴다). 고치는 김에 하나로 정리한다.
- 자기 브랜치에만 커밋한다. 메시지 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. `main`을 바꾸거나 푸시하지 않는다. `node_modules`는 워크트리 안에서 받는다(`npm ci`).
- `docs/ARCH.md`, `docs/BRIEF.md`는 고치지 않는다(예산). 바뀐 구조와 고쳐야 할 ARCH 행·BRIEF "에이전트 종류" 행은 보고 절에 적는다. 문서는 이 작업 파일의 작업 기록 절과 보고 절만 고친다.
- 끝나면 보고 절을 쓰고, 맨 마지막에 `<워크트리>/backend/.dev/p33.done`(브랜치 이름과 마지막 커밋 해시 두 줄)을 만든다.

### 읽을 파일

- `CLAUDE.md`, `docs/BRIEF.md`("에이전트 종류" 행), `docs/testing.md`, `docs/ARCH.md` 4절 B3·F5·F6·I7
- `docs/log/p12-quick-spawn.md`, `docs/log/p25-deepseek.md`, `docs/log/p28-polish.md` 보고 절
- `backend/src/settings.mjs`, `deepseek.mjs`, `backend.mjs`(spawn), `launch.mjs`, `backend/bin/atrium.mjs`(spawn)
- `app/src/renderer/Settings.jsx`, `Chrome.jsx`(레일), `SpawnDialog.jsx`(quickSpawn), `lib/kinds.js`

## 작업 기록

2026-11-02, 작업자 세션(Opus 5.5, 워크트리 `worktree-p33`).

계획
- 저장은 판 기록 meta 표의 `launchers` 열쇠 하나(`{ v, items, favorites }`). 설정(`settings`)과 같은 길이라 표를 새로 만들지 않는다. 즐겨찾기는 ID 배열이라 순서 바꾸기가 배열 하나다.
- 하네스 정의 표와 풀기·미리보기·검사·옮기기는 `backend/src/launchers.mjs` 한곳. `session.spawn`은 `spawnPlanOf(b, p)`로 띄울 값을 얻고, 나머지(이름, hook, 패널, 직접 명령 치기)는 옛 코드 그대로 쓴다.
- 미리보기는 창이 백엔드 `launcher.preview`를 부른다(같은 검사기를 쓰려고). `launchers.mjs`는 `node:crypto`를 써서 창 묶음에 넣을 수 없다.

정한 것
- 옛 판 판정: meta에 `settings`가 있거나 세션 행이 하나라도 있으면 옛 판(레일 네 단추를 그대로 즐겨찾기로). 둘 다 없으면 새 판.
- 옛 설정 키(`claude*`, `codexArgs`, `deepseek*`)는 판 기록에서 지우지 않는다. 옛 빌드로 돌아가도 그 값을 쓰게 하려고. 설정 정의에서는 뺐으므로 `settings.get`이 보이지 않고 `settings.set`은 모르는 키로 거부한다. `settings.set`은 저장할 때 옛 키를 남긴다.
- 옮기기는 `launchers` 열쇠가 없을 때 한 번만. ID가 고정(`claude`, `codex`, `shell`, `deepseek`)이라 같은 입력이면 같은 결과다. 이미 있으면 아무것도 하지 않으므로 사용자가 바꾼 것을 덮지 않는다.
- 환경 변수: claude는 세션 설정 파일 `env`, 직접 명령은 PowerShell 앞머리(`$env:이름='값'; `). codex와 그 밖의 종류는 herdr `agent.start`에 환경 변수를 넘기는 길이 없어 받지 않는다(설정 탭에 칸이 없다).
- 게이트웨이 확인: 확인 주소(`checkUrl`)가 있으면 그 health(2xx, status ok), 없으면 `ANTHROPIC_BASE_URL`이 무슨 HTTP 답이든 주는지. DeepSeek 예시(아이콘 deepseek + health)는 옛 오류(`deepseek_proxy_down`, opencodex 안내)를 그대로 낸다.
- claude 추가 인자는 깨우기·되살리기·다시 열기에도 같아야 해서 세션 행에 `extra_args` 열을 더했다(`launchOf`가 넣는다). 판이 정하는 인자(`--settings`, `--model`, `--resume` 등)는 검사에서 거부한다. 판이 쓰는 환경 변수(`HERDR_*`, `ATRIUM_*`, `MTASK_*`)도 거부한다.
- 아이콘이 하네스 종류와 다르면(예: deepseek, grok) 세션에 `flavor`로 남긴다. P25의 flavor 표시 길을 그대로 쓴다.
- `kind: 'deepseek'`(옛 길)은 판의 DeepSeek 호출자(없으면 예시)로 푼다. 이미 띄운 DeepSeek 세션은 기록된 flavor로 보이고, 다시 열기는 띄울 때의 env(spawn 이벤트)가 있으면 그것, 없으면 옛 flavor 길로 env를 붙인다.
- 화면 글은 사전 끝의 새 절 `launchers`. 백엔드 오류 열쇠는 `launchers.err.*`이고 `errText`가 점 든 열쇠를 그대로 찾게 한 줄 더했다(`p16-i18n` 시험도 그에 맞췄다).
- 지우기 확인은 `window.confirm` 대신 두 번 누르기("Delete?")로 했다(창 시험이 대화상자를 다루지 않아도 된다).

진행
- 백엔드: `launchers.mjs`, `backend.mjs`(spawnPlanOf, extraArgs), `launch.mjs`(extraArgs), `store.mjs`(extra_args), `recall.mjs`(다시 열기 env·인자), `features.mjs`(API), `settings.mjs`(옛 키·`sleepAfterMin` 둘 정리), CLI. 단위 시험 `p33.test.mjs` 13개, `p25`·`new-session` 시험을 새 구조로.
- `p29` 시험 7(가짜 객체로 `Backend.prototype.spawn`을 부름)이 `this.spawnPlan`이 없어 깨져서, 풀기를 메서드가 아니라 모듈 함수 `spawnPlanOf`로 옮겼다.
- 창: `lib/launchers.js`, `Launchers.jsx`(설정 탭), `Chrome.jsx`(레일만 + 칩 "New session…"의 끊긴 핸들러 한 줄), `SpawnDialog.jsx`, `Settings.jsx`, `store.js`, `main.jsx`, `i18n.js`, `styles.css`·사전 끝. 단위 시험 `p33-lib.test.mjs`.
- 창 시험: 첫 실행은 25/25. 레일 넘침 검사(8a)를 더해 다시 돌릴 때 앞 실행의 판 데이터가 남아 실패해서, 시험이 시작할 때 이 판의 백엔드를 끄고 `backend/.dev/data`를 비우게 했다. 그 뒤 26/26.
- `p25-deepseek`: 첫 실행 10/12. 앞 시험이 Codex를 즐겨찾기에서 빼 둬서 "Codex 바로 아래" 검사가 실패했고(시험이 Codex를 먼저 즐겨찾기에 둔다), 줄바꿈 거부 검사는 오류 열쇠가 `page.evaluate`를 넘어오지 않아 글로 보게 고쳤다. 다시 12/12.
- 워크트리 막이가 긴 셸 명령(여러 파일에 heredoc, `/tmp` 쓰기)을 거부해서 파일로 나눠 돌렸다.

## 보고

### 만든 것

- **호출자 저장과 API**(`backend/src/launchers.mjs`, `features.mjs`). 판 기록 meta `launchers` = `{ v: 1, items: [호출자], favorites: [ID] }`. 호출자는 `{ id, name, harness, icon, model, effort, permissionMode, allowHerdr, args, env, command, checkUrl }`. 바뀌면 `launchers.updated` 이벤트.
- **하네스 정의 표**(`HARNESSES`): `claude`(모델, 노력 수준, 권한 모드, herdr 자동 승인, 추가 인자, 환경 변수, 게이트웨이 확인 주소), `codex`(`-m 모델` + 추가 인자), `shell`(에이전트 없음), `command`(셸 패널에 칠 한 줄 + 환경 변수 앞머리). herdr가 아는 그 밖의 종류는 추가 인자만.
- **`session.spawn { launcher }`**: 호출자를 풀고 함께 준 `model`, `effort`, `permissionMode`, `allowHerdr`, `args`, `command`가 덮는다(빈 값은 덮지 않는다). spawn 이벤트에 `launcher`(이름), `env`, `extraArgs`를 남긴다. 호출자 없이 부르면 준 값만 쓴다(설정의 기본값은 없어졌다).
- **CLI**: `atrium spawn <폴더> --launcher <이름|ID>`, `atrium launchers`(즐겨찾기 순서 ★n, 이름, ID, 하네스, 명령 미리보기, 환경 변수 이름).
- **설정 "호출자" 탭**(`Launchers.jsx`): 옛 "Claude Code"·"Codex · DeepSeek" 두 탭을 대신한다. 목록(별=즐겨찾기, 아이콘, 이름, 명령 미리보기, ↑↓ 레일 순서, 고치기, 두 번 눌러 지우기)과 틀(이름, 하네스, 모델 = 하네스별 목록 datalist + 직접 입력, 아이콘, 노력 수준, 권한 모드, herdr 자동 승인, 레일에 놓기, 고급: 추가 인자·게이트웨이 확인·환경 변수). 고르는 대로 백엔드가 확인하고 실제 명령줄을 미리 보이며, 맞지 않는 값은 그 칸에 오류 글. "Write a command"는 직접 명령 틀. 환경 변수 칸 아래에 비밀값을 넣지 말라는 풀이를 늘 보이고, 이름이 KEY·TOKEN·SECRET 등이면 경고 색으로 바꾼다. 최소 창(900×600) 영어·한국어에서 스크롤·잘림 없음(창 시험 8).
- **왼쪽 레일 = 즐겨찾기 호출자**(`Chrome.jsx`). 누르면 지금 워크스페이스에 바로 뜨고(P12와 같음), Shift+누르기는 그 호출자를 채운 새 세션 창. 아이콘은 고른 아이콘 → 하네스 로고(`logoBadge`), 셸은 터미널 그림, 직접 명령은 이름 첫 글자. 풍선은 이름, 명령, 환경 변수 이름(값은 보이지 않는다). 즐겨찾기가 많으면 즐겨찾기 칸만 넘긴다(최소 창에서 12개로 확인). 개발용 판은 모델을 비운 claude 호출자를 haiku로 띄운다(P12와 같음).
- **새 세션 창**: 맨 위에 호출자 고르기(즐겨찾기 ★ 먼저, 끝에 "직접 고르기…" = 옛 종류·모델·권한 모드 방식). 호출자를 고르면 명령 미리보기, 모델 칸(claude·codex, 바꾼 값만 덮는다), 첫 지시 칸(에이전트일 때). 칩 "New session…"과 영역 "+ 세션"은 첫 즐겨찾기를 고른 채로 연다. 옛 DeepSeek 종류 항목은 뺐다(DeepSeek는 호출자).
- **옮기기**: 옛 판은 Claude Code(옛 모델·노력 수준·권한 모드·herdr 자동 승인), Codex(옛 인자), DeepSeek(옛 모델, 옛 Claude 권한 모드·herdr 자동 승인, opencodex env와 health 주소. 옛 직접 명령이 있었으면 그 명령 호출자), 셸 순서로 즐겨찾기. 새 판은 Claude Code, Codex, 셸이 즐겨찾기이고 DeepSeek는 즐겨찾기 밖 예시. 기본·예시 호출자에 키는 없다.
- **정리**: `settings.mjs`의 `sleepAfterMin` 두 정의를 뒤의 것(P24 리포 단위) 하나로.
- **시험**: 백엔드 단위 277개(새 `p33.test.mjs` 13개), 창 단위 74개(새 `p33-lib.test.mjs` 5개), `npm run build` 통과. 창 시험 `app/test/e2e/p33-launchers.mjs` 26/26, 옛 `p12-quick.mjs` 7/7, `p25-deepseek.mjs` 12/12(P33 판에서). 결과와 스크린숏은 `experiments/p33/`(돌리기: `node experiments/p33/tools/e2e.cjs <파일>`).
  - codex는 이 PC에 깔려 있어 `-m gpt-6-astra`로 띄워 인자를 확인하고 바로 껐다(지시 없음).
  - DeepSeek 게이트웨이는 시험에서 닫힌 포트로 바꿔 "닿지 않음" 알림까지만 봤다. `p25-deepseek.mjs`의 실제 게이트웨이 턴(지시, 승인 줄, 잠재우기·깨우기)은 `P25_LIVE=1`일 때만 돈다.
- 시험 판 정리: 세션 끔, 창·백엔드 끔, herdr 서버를 끄고 `atrium-dev-p33` 세션 지움, 시험 폴더 `C:\Workspace\mtask-p33-ws` 지움. 시험 claude에는 지시를 보내지 않아 대화 기록 폴더가 생기지 않았다.

### API 표에 넣을 행(ARCH 6절)

| API | 하는 일 |
|---|---|
| `launcher.list` → `{ launchers: [{ …호출자, favorite, preview: { line, env, board?, shell?, typed? } }], favorites, harnesses }` | 호출자 목록, 즐겨찾기 순서, 하네스 정의 표 |
| `launcher.create { launcher, favorite? }`, `launcher.update { id, patch }`, `launcher.delete { id }` | 만들기·고치기·지우기. 검사(이름 겹침, 모델 글자, 한 줄 명령, 환경 변수 이름, 판이 정하는 인자). `launchers.updated` |
| `launcher.favorite { id, favorite?, index? }`, `launcher.order { ids }` | 레일 즐겨찾기 켜기·끄기(자리), 순서(즐겨찾기 ID 전부) |
| `launcher.preview { launcher }` → `{ launcher, preview }` | 저장하지 않은 호출자의 검사와 명령 미리보기 |
| `session.spawn { cwd, launcher?, name?, prompt?, model?, effort?, permissionMode?, kind?, args?, allowHerdr?, command? }` | (고침) `launcher`를 주면 그 호출자로 띄우고 함께 준 값이 덮는다. 게이트웨이가 닿지 않으면 `gateway_down`(DeepSeek 예시는 `deepseek_proxy_down`) |
| `settings.get`, `settings.set` | (고침) 새 세션 기본값 키가 빠졌다 |

### 고쳐야 할 ARCH 행·BRIEF 행

- ARCH 4절 **I7**: "새 세션 기본값(Claude Code 모델·…·DeepSeek 모델·직접 명령)"을 빼고 "새 세션을 띄우는 방법은 호출자(F6)"로.
- ARCH 4절 **F6 DeepSeek** → **F6 호출자**로 다시 쓰기 제안: "세션을 띄우는 방법은 호출자(`launchers.mjs`, 판 기록 meta `launchers`)다. 하네스(claude, codex, herdr가 아는 종류, 셸) + 모델 + 옵션이거나 셸 패널에 칠 명령 한 줄이다. 왼쪽 레일은 즐겨찾기 호출자이고 설정의 호출자 탭에서 관리한다. claude의 환경 변수는 세션 설정 파일 env로 넘기고, `ANTHROPIC_BASE_URL`이나 확인 주소가 있으면 띄우기 전에 닿는지 본다(`gateway_down`). 아이콘이 하네스와 다르면 `flavor`로 남긴다. DeepSeek는 opencodex 게이트웨이를 쓰는 claude 호출자의 예시다(`deepseek_proxy_down`)."
- ARCH 4절 **B3**: (1)의 실행 인자 끝에 "호출자의 추가 인자(세션 행 `extra_args`, 깨우기·다시 열기도 같음)", env에 "호출자의 환경 변수"를 더한다.
- ARCH 모듈 표 "설정·붙이기"에 `launchers.mjs`, 창 모듈에 `Launchers.jsx`, `lib/launchers.js`.
- ARCH 7절 "고정 요소": "왼쪽 도구 레일(선택과 손으로 잇기, Claude·DeepSeek·Codex·셸 새 세션 …)"을 "왼쪽 도구 레일(선택과 손으로 잇기, 즐겨찾기 호출자: 누르면 바로 띄우고 Shift+누르기는 그 호출자로 새 세션 창, 많으면 그 칸만 넘김, …)"으로. 아래쪽 칩의 "새 세션 대화상자"는 첫 즐겨찾기 호출자를 고른 채로 연다.
- ARCH 데이터 모델: sessions 표에 `extra_args`(P33), meta에 `launchers`.
- BRIEF "에이전트 종류" 행의 DeepSeek 문장 → "세션은 호출자로 띄운다. 호출자는 하네스(claude, codex 등)와 모델·옵션의 조합이거나 명령 한 줄이고, 왼쪽 레일은 즐겨찾기 호출자다(설정의 호출자 탭). DeepSeek(opencodex 게이트웨이)는 Claude Code + 환경 변수 호출자의 예시다(2026-11-02 사용자 요청, P33)." 옛 문장("DeepSeek는 왼쪽 레일에서 바로 띄우는 … P25")은 `decisions.md`로.

### 계획과 다른 곳

- 옛 설정 키는 지우지 않고 남겼다(위 "정한 것"). 지시가 정하라고 한 부분이다.
- 환경 변수는 claude와 직접 명령만 받는다. codex와 그 밖의 종류는 herdr에 넘길 길이 없어 칸을 두지 않았다.
- claude 호출자에도 추가 인자를 받게 했다(지시의 "고급: 추가 인자"). 그래서 세션 행에 `extra_args` 열을 더했다.
- 호출자 없이 `session.spawn`을 부르면(CLI `atrium spawn` 기본, `atrium child`) 이제 설정의 새 세션 기본값을 쓰지 않는다. 그 값이 호출자로 옮겨 갔기 때문이다. 레일·새 세션 창은 늘 호출자를 넘긴다.
- `Chrome.jsx`에서 레일 밖 한 줄을 고쳤다: 칩 "New session…"이 지운 `spawn('claude')` 함수를 불러서 `openDialog({ kind: 'spawn' })`로 바꿨다.
- `p28-polish.mjs`의 "텍스트 로고 없음" 검사가 설정 창의 모든 `img`를 잡아, 호출자 탭의 하네스 로고(`.mt-ln-ico img`)를 뺐다. `p16-i18n` 시험은 `launchers.err.*` 열쇠를 받게 했다.
- 사전의 옛 글(`settings.claudeModel`, `settings.deepseek*`, `rail.claude` 등)은 다른 작업자와 겹치지 않게 지우지 않았다. 쓰는 곳은 없다.

### 알려진 문제

- 레일의 즐겨찾기 칸이 넘칠 때 아래에 더 있다는 표시가 없다(휠로 넘긴다). 같은 하네스 로고가 여럿이면 레일에서 풍선으로만 구별된다(아이콘을 고를 수 있다).
- 판 밖 대화를 다른 대화 ID로 다시 연 세션(`reopened_as`)을 한 번 더 다시 열면 spawn 이벤트가 없어 호출자의 환경 변수를 잃는다. DeepSeek는 flavor 길로 붙는다.
- 환경 변수 값은 판 기록(`board.db`)과 spawn 이벤트, 세션 설정 파일에 평문으로 남는다. 설정 탭 풀이와 경고로만 막는다.
- 미리보기는 백엔드를 부르므로 백엔드가 꺼져 있으면 틀의 미리보기 칸이 오류를 보인다.
