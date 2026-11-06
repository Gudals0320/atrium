상태: 열림
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

## 보고
