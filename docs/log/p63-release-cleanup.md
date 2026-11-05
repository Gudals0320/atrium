상태: 열림
날짜: 2026-11-05

## 지시

### 목표

릴리즈(v0.1.0) 전 저장소 정리다. 사용자의 말: "(비공개 참고 제품) 언급 삭제. 나머지는 너가 알아서 작업".

지휘 세션이 릴리즈 전 점검에서 찾은 것과 정한 것(2026-11-05):
- 개인 정보와 비밀은 지금 파일과 공개 기록 모두에서 나오지 않았다.
- 판의 생김새를 참고한 비공개 제품의 이름이 23개 파일에 52번 나온다. 코드 주석, 사전 주석, `tokens.css`, BRIEF, CHANGELOG, CLAUDE.md, `.gitignore`, 닫힌 작업 기록, decisions, 실험 문서다. 그 이름은 프롬프트로 받는다. 이 파일에는 쓰지 않는다.
- 커밋 검사(`scripts/check-public.mjs`)는 GitHub noreply가 아닌 커미터 메일을 모두 막는다. Claude Code로 이 저장소를 연 외부 기여자는 SessionStart hook 때문에 이 검사를 받으므로 일반 메일로는 커밋하지 못한다.

### 할 것

1. **이름 지우기.** 지금 파일 전체(`git ls-files`)에서 그 이름을 모두 지운다. 닫힌 작업 기록, decisions, 실험 문서도 이번에만 예외로 고친다. docs-guard가 닫힌 기록 고치기를 막으면 스크립트로 바꾸고 그 사실을 작업 기록에 적는다.
   - 문장의 뜻은 남긴다. "참고한 데모 화면", "the reference demo"처럼 이름 없이 쓰거나, 이름이 든 구절만 뺀다. 값과 동작(코드)은 바꾸지 않는다.
   - CLAUDE.md의 규칙은 이름 없이 일반화한다. 예: "다른 제품의 화면을 참고할 때는 화면 구성, 동작, 생김새(색, 크기, 모양)만 따른다. 비공개 제품의 코드, 이름, 로고, 에셋(그림, 영상, 글꼴 파일)은 가져오지 않고 그 이름을 저장소에 쓰지 않는다. 데모 화면 캡처는 저장소에 넣지 않는다(`app/design/`은 git 밖)."
   - BRIEF "화면 모양" 행처럼 결정이 바뀌지 않고 낱말만 바꾸는 곳은 decisions로 옮기지 않는다(옮기면 이름이 다시 남는다).
   - git 기록은 다시 쓰지 않는다. 공개 fork가 있어서다.
   - 끝나면 `git grep -i`로 그 이름이 0번인 것을 보인다.
2. **다시 들어오지 않게.** `check-public`이 로컬 비공개 낱말 목록을 읽게 한다. 파일은 `<git 공통 폴더>/atrium-private-words`이고, 한 줄에 하나다. 이 파일은 git에 들어가지 않고 워크트리끼리 같은 파일을 본다(`git rev-parse --git-common-dir`). 지금의 `ATRIUM_PRIVATE_WORDS` 환경 변수도 그대로 받는다. 그 낱말이 스테이지된 글, 커밋 메시지, 푸시하는 커밋에 있으면 막는다. 단위 시험(임시 git 저장소, 임시 목록 파일)을 더한다. 실제 목록 파일은 만들지 않는다(지휘 세션이 만든다).
3. **기여자 메일.** 커미터 메일 검사를 작성자 검사와 같게 바꾼다. 관리자의 개인 메일(이 PC의 git 설정과 비공개 낱말 목록에서 읽은 것)만 막고, 다른 메일은 받는다. noreply는 그대로 받는다. 단위 시험을 고친다. 관리자 자신의 커밋이 noreply로 가는 것은 저장소 git 설정(`user.email`)이 이미 지킨다. `docs/README.md`나 `docs/testing.md`에 검사 설명이 있으면 맞게 고친다.
4. **작은 정리.** `app/package.json`에 `"license": "MIT"`를 더한다.

README 두 파일은 P64가 고치므로 손대지 않는다. 그 안에 그 이름이 있으면 보고 절에 적는다(지금은 없다).

### 완료 기준

1. `git grep -i <그 이름>`이 아무것도 찾지 않는다(대소문자 무시).
2. 단위 시험: 비공개 낱말 목록 파일(공통 폴더, 워크트리에서도 읽음), 스테이지·메시지·푸시에서 막기, 기여자 일반 메일은 받음, 관리자 개인 메일은 막음.
3. `cd backend && npm test`, `cd app && npm test`, `cd app && npm run build`가 통과한다.

### 읽을 파일

- `CLAUDE.md`, `docs/README.md`, `scripts/check-public.mjs`, `backend/test/check-public.test.mjs`, `.githooks/*`, `.claude/settings.json`

### 시험 환경

- 개발용 판이 필요하면 너만의 판으로 띄운다(`docs/testing.md`).
  - `ATRIUM_HERDR_SESSION=atrium-dev-p63`, `ATRIUM_PORT=47889`
  - `ATRIUM_DATA_DIR=<워크트리>/backend/.dev/data`, `ATRIUM_APP_USERDATA=<워크트리>/backend/.dev/app`
- 실제 판(`atrium`, 47800)과 다른 판의 포트는 쓰지 않는다. 사용자의 기본 herdr 세션과 다른 판의 herdr 서버는 건드리지 않는다. 사용자의 실제 판과 캔버스는 열지도, 캡처하지도 않는다.
- 대화 목록은 시험 폴더의 대화만 읽는다(`ATRIUM_CLAUDE_PROJECTS`, `ATRIUM_CLAUDE_DESKTOP=none`).
- 이 PC의 Tailscale 설정은 바꾸지 않는다. 읽기 명령만 부른다.
- 끝나면 시험 세션, 창, 브라우저, 프록시, 백엔드, herdr 서버와 세션(`atrium-dev-p63`만), 시험 폴더를 끄고 지운다. 네가 띄운 프로세스가 남지 않았는지 포트로 확인한다.

### 지킬 것

- `CLAUDE.md`를 따른다. 프로세스는 직접 띄운 것만 PID로 끈다.
- 이 저장소는 공개다. 작업 기록, 시험 코드, 커밋 메시지, 그림에 사용자 경로·메일·토큰, 실제 PC·tailnet 이름, IP, 실제 대화 내용을 쓰지 않는다. 커밋 전·푸시 전 검사를 건너뛰지 않는다.
- 같은 때 다른 작업자(P64(README와 스크린숏))가 돈다. 맡은 파일만 고친다.
- 자기 브랜치에만 커밋한다. 커밋 메시지에 `Co-Authored-By` 줄을 넣지 않는다. `main`을 바꾸거나 푸시하지 않는다. `node_modules`는 워크트리 안에서 받는다(`npm ci`).
- 끝나면 보고 절을 쓰고, 맨 마지막에 `<워크트리>/backend/.dev/p63.done`(브랜치 이름과 마지막 커밋 해시 두 줄)을 만든다.

## 작업 기록

## 보고
