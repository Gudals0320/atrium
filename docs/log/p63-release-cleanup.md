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

2026-11-05, P63 작업자 세션.

- 이름은 23개 파일 52곳이었다(지시와 같다). README 두 파일에는 없었다.
- docs-guard는 작업자가 CLAUDE.md, BRIEF, decisions를 고치는 것과 닫힌 작업 파일을 편집 도구로 고치는 것을 막는다. 그래서 23개 파일 모두 스크래치 폴더의 Node 스크립트로 한 번에 바꿨다(정확한 문장 몇 개를 먼저 바꾸고, 그다음 조사에 맞춰 `참고 제품과/이/은/을/의`로 바꿨다). 남은 것이 있으면 스크립트가 멈추게 했다. 스크립트는 저장소에 넣지 않았다.
- 닫힌 작업 파일 검사(`check-docs`의 "HEAD와 다르다")는 `--close`에서만 돌고, 커밋 전 검사(`--staged`)에서는 돌지 않는다. 그래서 `check-docs`는 고치지 않았다. 지휘 세션이 합친 뒤 `--close`를 돌릴 때는 HEAD에 이미 이 고침이 있으므로 걸리지 않는다.
- 닫힌 작업 파일 8개의 "(이름)는 화면 구성과 동작만 참고한다"는 "참고 제품은 … 참고한다"가 되면 어색해서 "참고 제품에서는 화면 구성과 동작만 참고한다"로 썼다.
- `docs/research/(이름).md`를 가리키던 곳 5개는 `docs/research/reference.md`로 바꿨다. 그 폴더는 git 밖이고 이 워크트리에는 없다.
- 살아 있는 문서 합계가 69,983/70,000자였다. CLAUDE.md 규칙 문장은 18자 늘었지만 BRIEF에서 이름(7자)이 "참고 제품"(5자)으로 바뀌며 줄어서, 합계는 69,979자다.
- `app/package.json`에는 이미 `"license": "MIT"`가 있었다(첫 커밋부터). 고치지 않았다.
- `docs/README.md`와 `docs/testing.md`에는 공개 검사의 메일 규칙 설명이 없어 고치지 않았다.
- 개발용 판은 띄우지 않았다(화면 동작이 바뀌지 않는다). herdr 세션과 서버, 백엔드, 창도 띄우지 않았다.
- 커밋은 `ATRIUM_PRIVATE_WORDS`에 그 이름을 넣고 훅을 그대로 거쳐 했다. 스테이지와 메시지 검사가 그 낱말로도 통과했고, `check-public --tree HEAD`도 같은 env로 통과했다.

## 보고

### 만든 것

- **이름 지우기.** `git grep -i`로 0번이다(종료 코드 1, 출력 없음). 코드 주석 6곳(`faces.js`, `en.js`, `tokens.css`, `mission.mjs`, `outputs.mjs`, `thread.mjs`), `.gitignore`, `CHANGELOG.md`, `CLAUDE.md`, `docs/BRIEF.md`, `docs/decisions.md`, 닫힌 작업 파일 12개다. 값과 동작은 바꾸지 않았다(주석만 바뀜). git 기록은 다시 쓰지 않았다.
  - CLAUDE.md 규칙: "다른 제품의 화면을 참고할 때는 화면 구성, 동작, 생김새(색, 크기, 모양)만 따른다. 비공개 제품의 코드, 이름, 로고, 에셋(그림, 영상, 글꼴 파일)은 가져오지 않고 그 이름을 저장소에 쓰지 않는다. 데모 화면 캡처는 저장소에 넣지 않는다(`app/design/`은 git 밖)."
  - BRIEF 행은 낱말만 바꿨고 decisions로 옮기지 않았다. 2절에서 "참고 제품(macOS 전용 유료 앱)"으로 처음 소개한다.
- **비공개 낱말 목록.** `scripts/check-public.mjs`
  - `privateWordsFile(cwd)`: `git rev-parse --git-common-dir`로 `<공통 폴더>/atrium-private-words`를 찾는다. 워크트리에서도 본 저장소의 같은 파일이다.
  - `readPrivateWords(file)`: 한 줄에 하나, 앞뒤 공백·빈 줄·`#` 줄·BOM은 건너뛴다. 파일이 없으면 빈 목록이다.
  - `localSecrets`가 목록 파일과 `ATRIUM_PRIVATE_WORDS`(쉼표)를 둘 다 받는다. 세 글자 미만은 무시한다(전과 같다). 대소문자는 무시하고 낱말 경계로 잡는다(전과 같다). `@`가 든 낱말은 관리자 개인 메일로도 본다.
  - 스테이지된 글, 커밋 메시지, 푸시하는 커밋의 파일과 메시지를 막는 길은 전과 같은 `scanText`다. 찾은 값은 가려서 보인다.
- **기여자 메일.** `committerOk`를 `authorOk`와 같게 했다(`committerOk = authorOk`, 둘째 인자로 secrets). 관리자의 개인 메일(`git config --global/--system user.email`과 목록의 `@` 낱말)만 막고 다른 메일과 noreply는 받는다. 오류 글은 "커미터 메일이 개인 메일이다"이다.
- **시험.** `backend/test/check-public.test.mjs`에 4개를 더하고 1개를 고쳤다(7 → 11개).
  - 작성자·커미터 같은 규칙(기여자 메일 받음, 관리자 메일 막음, 대소문자).
  - 목록 낱말과 env 낱말, `@` 낱말은 개인 메일.
  - 임시 git 저장소와 워크트리: 목록 파일 자리가 공통 폴더이고, 워크트리에서 부른 `--message`가 그 목록으로 막는다.
  - 임시 저장소에서 스크립트를 훅처럼 불러 `--staged`, `--message`, `--push`(파일, 메시지)가 막고, 고치면 통과하며, env만으로도 막는다.
  - 커미터·작성자 메일: 기여자 일반 메일과 noreply는 통과, git 설정(임시 `GIT_CONFIG_GLOBAL`)의 관리자 메일과 목록의 메일은 스테이지와 푸시 모두에서 막는다.
  - 시험은 실제 목록 파일, 실제 git 전역 설정, `ATRIUM_PRIVATE_WORDS`를 쓰지 않는다. 가짜 값은 실행할 때 만든다.
- **확인.** `cd backend && npm test` 463/463, `cd app && npm test` 214/214, `cd app && npm run build` 통과. `check-docs` 통과(합계 69,979/70,000). `check-public --tree HEAD` 통과.

### 계획과 다른 곳

- 할 것 4(`"license": "MIT"`)는 이미 있어서 바꾸지 않았다.
- `docs/research/(이름).md`를 가리키던 링크를 `docs/research/reference.md`로 바꿨다. git 밖의 본 저장소 파일은 이 이름이 아니므로 지휘 세션이 그 파일 이름을 `reference.md`로 바꿔야 링크가 맞는다.
- `check-docs`는 고치지 않았다(닫힌 기록 검사는 `--close`에서만 돈다).

### 알려진 문제

- 실제 목록 파일은 만들지 않았다. 지휘 세션이 `<공통 폴더>/atrium-private-words`를 만들 때까지는 `ATRIUM_PRIVATE_WORDS`가 없으면 그 이름이 다시 들어와도 막히지 않는다.
- git 기록과 공개 fork에는 그 이름이 남아 있다(지시대로 기록은 다시 쓰지 않았다).
- 목록 파일은 이 PC에만 있다. 다른 PC에서 관리자가 커밋하면 그곳에도 같은 파일을 두어야 한다.
