상태: 열림
날짜: 2026-11-05

## 지시

### 목표

사용성 검증(ux1)이 올린 GitHub 이슈 가운데 작은 이슈 #8, #9, #10를 재현하고 고친다. 사용자의 말: "열려 있는 이슈 보고 재현-수정을 맡겨."

맡은 이슈:
- **#8** Outside-conversation card shows "HEAD" branch for a folder that is not a git repository (S3). git 저장소가 아닌 폴더의 판 밖 대화 카드에 "⎇ HEAD"가 보인다.
- **#9** English UI uses "Prompt" both for the last request and for an idle shell (S3). 영어 화면에서 "Prompt"가 마지막 요청과 명령을 기다리는 셸 두 뜻으로 쓰인다. 영어 문구를 하나씩 정하고, 한국어(P39 용어표)와 뜻이 맞는지 본다.
- **#10** Changes panel counts the first backend start as a restart (S3). 변경 내역이 백엔드의 첫 시작을 재시작으로 센다. 그 줄의 이름표가 "herdr"인 것도 이슈에 적혀 있다.

고칠 곳(짐작): `backend/src/convos.mjs`·`recall.mjs`(대화 카드의 브랜치), `ConvoNode.jsx`, `locales/en.js`의 해당 값, 변경 내역(`backend.mjs`의 changes, `ReturnSummary.jsx`)

### 할 일(이슈마다)

1. **읽기.** `gh issue view <번호> --repo Gudals0320/atrium`로 이슈 글(재현 단계, 측정값, 증거 그림 주소, 제안)을 읽는다. 사용성 검증 작업 파일 `docs/log/ux1-usability-audit.md` 보고 절과 재현 각본 `app/test/e2e/ux1-repro.mjs`(이슈별 사례)도 본다.
2. **재현.** 지금 `main`으로 띄운 개발용 판에서 이슈를 재현하고 결과를 작업 기록에 적는다. 이슈를 올린 뒤 다른 작업(P44~P46)이 합쳐졌으니, 재현되지 않으면 까닭을 확인하고 "이미 고쳐짐"으로 보고한다(억지로 고치지 않는다).
3. **원인과 수정.** 원인을 찾아 고친다. 이슈의 "Suggested direction"은 참고만 하고, 더 나은 방법이 있으면 그것을 쓰고 까닭을 적는다.
4. **시험.** 판단은 순수 함수로 두고 단위 시험을 더한다. 재현 각본의 그 사례(또는 새 창 시험)가 고친 뒤 통과하는 것을 보이고, 결과와 스크린숏을 `experiments/<작업 이름>/`(git 밖)에 남긴다.
5. **이슈 댓글 초안.** 이슈를 닫거나 댓글을 달지 않는다. 지휘 세션이 `main`에 합친 뒤 단다. 보고 절에 이슈마다 영어 댓글 초안(인사말 없이 2~4줄: 무엇이 원인이었고 무엇을 바꿨는지, 남은 것)을 적는다.

### 완료 기준

1. 맡은 이슈마다 재현(또는 이미 고쳐졌음), 원인, 수정, 시험 결과가 보고 절에 있다.
2. `cd backend && npm test`, `cd app && npm test`, `cd app && npm run build`가 통과한다.

### 시험 환경

- 너만의 개발용 판으로 띄운다(`docs/testing.md`).
  - `ATRIUM_HERDR_SESSION=atrium-dev-p53`, `ATRIUM_PORT=47872`
  - `ATRIUM_DATA_DIR=<워크트리>/backend/.dev/data`, `ATRIUM_APP_USERDATA=<워크트리>/backend/.dev/app`
- 실제 판(`atrium`, 47800)과 다른 포트(47811~47872 가운데 네 것 말고)는 쓰지 않는다.
- 대화 목록은 시험 폴더의 대화만 읽는다(`ATRIUM_CLAUDE_PROJECTS`, `ATRIUM_CLAUDE_DESKTOP=none`). 시험 폴더는 `C:\Workspace\mtask-p53-*`처럼 새로 만든다.
- 세션은 되도록 셸 노드로 시험한다. claude가 꼭 필요하면 `--model haiku`, 턴은 짧게.
- 끝나면 시험 세션, 창, 백엔드, herdr 서버와 세션(`atrium-dev-p53`만), 시험 폴더, 시험 대화 기록을 끄고 지운다.

### 지킬 것

- `CLAUDE.md`를 따른다. 프로세스는 직접 띄운 것만 PID로 끈다.
- 이 저장소는 공개다. 작업 기록, 시험 코드, 커밋 메시지, 댓글 초안에 사용자 경로·메일·토큰을 쓰지 않는다. 커밋 전·푸시 전 검사를 건너뛰지 않는다.
- 같은 때 다른 작업자들이 돈다. 맡은 이슈에 필요한 만큼만 작게 고치고, 남의 영역을 고쳤으면 보고에 적는다.
  - P49(원격 R3): P47·P48을 합치는 중이다. `relay.mjs`, `api.mjs`, `api.js`, `store.js`, 웹 화면(`web.js`, `web.mjs`), 짝 맺기, `SpawnDialog.jsx`의 폴더 찾아보기, `TerminalView.jsx`·`CommandBar.jsx`의 붙여넣기 업로드, 설정의 연결된 기기를 고친다.
  - P50(캔버스 #2·#6), P51(터미널 #3·#7), P52(크롬 #4·#5), P53(#8·#9·#10)
- 화면 글을 더할 때는 `locales/en.js`·`ko.js` 끝에 더한다(고치는 것은 그 자리). 한국어는 P39 말투(합니다체)와 용어를 따른다. `styles.css`에 더할 때는 끝에 더한다.
- 자기 브랜치에만 커밋한다. 커밋 메시지에 `Co-Authored-By` 줄을 넣지 않는다. `main`을 바꾸거나 푸시하지 않는다. `node_modules`는 워크트리 안에서 받는다(`npm ci`).
- 문서는 이 작업 파일의 작업 기록 절과 보고 절만 고친다. 고쳐야 할 ARCH 행이 있으면 새 문장을 보고 절에 짧게 적는다.
- 끝나면 보고 절을 쓰고, 맨 마지막에 `<워크트리>/backend/.dev/p53.done`(브랜치 이름과 마지막 커밋 해시 두 줄)을 만든다.

## 작업 기록

## 보고
