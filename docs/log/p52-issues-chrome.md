상태: 열림
날짜: 2026-11-05

## 지시

### 목표

사용성 검증(ux1)이 올린 GitHub 이슈 가운데 크롬 이슈 #4, #5를 재현하고 고친다. 사용자의 말: "열려 있는 이슈 보고 재현-수정을 맡겨."

맡은 이슈:
- **#4** Sidebar workspace counts (working, needs you) do not update when sessions change state (S2). 이슈는 옛 사이드바에서 찾았다. P44가 사이드바를 다시 짰으니 새 사이드바의 머리줄 세는 값(응답 필요, 오류, 작업 중, 세션 수)이 상태가 바뀔 때 바로 맞는지 먼저 본다. 판 쪽 수(`atrium ws`, `counts`)와 어긋나면 고친다.
- **#5** UX polish: chrome (ux1) (S3), 체크리스트 셋:
  - Esc가 대부분의 대화상자·패널을 닫지 않고, 열 때 초점이 안으로 들어가지 않는다(새 세션, 프로젝트 열기, 변경 내역, 반복 작업, 데스크톱 가져오기 등). 공용 방법(초점 가두기, Esc로 닫기, 닫으면 초점 돌려주기)으로 고친다.
  - 전체 보기나 자동 정렬 뒤 맨 위 영역 이름표가 위 왼쪽 알약 밑에 깔린다. 맞춤 여백이 떠 있는 크롬을 비키게 한다.
  - 고른 워크스페이스 탭의 세션 수가 빨간 알약(`--badge-bg`)이라 오류처럼 읽힌다.

고칠 곳(짐작): `app/src/renderer/Sidebar.jsx`·`lib/sidebar-tree.js`(세는 값), `store.js`(필요한 만큼), 대화상자들(`SpawnDialog.jsx`, `Workspaces.jsx`, `ReturnSummary.jsx`, `Loops.jsx`, `DesktopImport.jsx`), `Canvas.jsx`의 전체 보기, `Workspaces.jsx`의 탭

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
  - `ATRIUM_HERDR_SESSION=atrium-dev-p52`, `ATRIUM_PORT=47871`
  - `ATRIUM_DATA_DIR=<워크트리>/backend/.dev/data`, `ATRIUM_APP_USERDATA=<워크트리>/backend/.dev/app`
- 실제 판(`atrium`, 47800)과 다른 포트(47811~47872 가운데 네 것 말고)는 쓰지 않는다.
- 대화 목록은 시험 폴더의 대화만 읽는다(`ATRIUM_CLAUDE_PROJECTS`, `ATRIUM_CLAUDE_DESKTOP=none`). 시험 폴더는 `C:\Workspace\mtask-p52-*`처럼 새로 만든다.
- 세션은 되도록 셸 노드로 시험한다. claude가 꼭 필요하면 `--model haiku`, 턴은 짧게.
- 끝나면 시험 세션, 창, 백엔드, herdr 서버와 세션(`atrium-dev-p52`만), 시험 폴더, 시험 대화 기록을 끄고 지운다.

### 지킬 것

- `CLAUDE.md`를 따른다. 프로세스는 직접 띄운 것만 PID로 끈다.
- 이 저장소는 공개다. 작업 기록, 시험 코드, 커밋 메시지, 댓글 초안에 사용자 경로·메일·토큰을 쓰지 않는다. 커밋 전·푸시 전 검사를 건너뛰지 않는다.
- 같은 때 다른 작업자들이 돈다. 맡은 이슈에 필요한 만큼만 작게 고치고, 남의 영역을 고쳤으면 보고에 적는다.
  - P49(원격 R3): P47·P48을 합치는 중이다. `relay.mjs`, `api.mjs`, `api.js`, `store.js`, 웹 화면(`web.js`, `web.mjs`), 짝 맺기, `SpawnDialog.jsx`의 폴더 찾아보기, `TerminalView.jsx`·`CommandBar.jsx`의 붙여넣기 업로드, 설정의 연결된 기기를 고친다.
  - P50(캔버스 #2·#6), P51(터미널 #3·#7), P52(크롬 #4·#5), P53(#8·#9·#10)
- 화면 글을 더할 때는 `locales/en.js`·`ko.js` 끝에 더한다(고치는 것은 그 자리). 한국어는 P39 말투(합니다체)와 용어를 따른다. `styles.css`에 더할 때는 끝에 더한다.
- 자기 브랜치에만 커밋한다. 커밋 메시지에 `Co-Authored-By` 줄을 넣지 않는다. `main`을 바꾸거나 푸시하지 않는다. `node_modules`는 워크트리 안에서 받는다(`npm ci`).
- 문서는 이 작업 파일의 작업 기록 절과 보고 절만 고친다. 고쳐야 할 ARCH 행이 있으면 새 문장을 보고 절에 짧게 적는다.
- 끝나면 보고 절을 쓰고, 맨 마지막에 `<워크트리>/backend/.dev/p52.done`(브랜치 이름과 마지막 커밋 해시 두 줄)을 만든다.

## 작업 기록

## 보고
