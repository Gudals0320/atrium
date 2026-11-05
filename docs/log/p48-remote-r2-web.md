상태: 닫힘
날짜: 2026-11-05

## 지시

### 목표

원격 작업의 둘째 단계다. 백엔드가 보드 화면을 웹으로 내줘서, Electron 앱 없이 브라우저로 보드를 쓰게 한다. R3(Tailscale)에서 노트북 브라우저가 이것을 쓴다. 이 작업에서는 아직 네트워크에 열지 않고, 이 PC의 브라우저(`127.0.0.1`)로만 시험한다.

사용자와 정한 것(2026-11-05)은 다음과 같다.
- 노트북에서는 브라우저로 보드를 쓴다. 지연만 괜찮으면 앱이 아니어도 된다. 측정 결과 Tailscale 직접 연결 7ms라 괜찮다.
- 화면 코드는 백엔드가 내주므로, 노트북 쪽 버전이 어긋날 일이 없게 한다.

지휘 세션이 확인한 것은 다음과 같다.
- 창이 Electron에 기대는 것은 preload(`app/src/main/preload.cjs`)의 여섯 가지뿐이다: `backend`(포트·토큰), `metrics`, `log`, `notify`, `pickFolder`, `onNavigate`. 나머지는 이미 백엔드 WebSocket으로 이야기한다.

### 할 것

1. **화면 내주기.** 백엔드가 빌드된 창(`app/dist`)을 같은 포트의 HTTP로 내준다(예: `/`). 캐시 머리글을 맞게 두어 다시 열 때 빠르게 한다. 빌드가 없으면 알기 쉬운 글을 보인다.
2. **웹 어댑터.** 창이 Electron 밖에서 돌면 `window.mt` 대신 웹 어댑터를 쓴다.
   - `backend`: 같은 출처의 WebSocket과 짝 맺은 기기 토큰
   - `log`: 콘솔이나 백엔드로 보내기
   - `metrics`: 없어도 되게
   - `notify`: Web Notifications(권한 묻기 포함)
   - `onNavigate`: 알림을 누르면 그 세션으로 가기
   - `pickFolder`: 4의 PC 폴더 탐색기
   - Electron 창은 지금과 같게 동작해야 한다.
3. **짝 맺기와 기기 토큰.**
   - 처음 여는 브라우저는 보드 API를 쓸 수 없다. 짝 맺기 화면에서 PC 보드(Electron 창)에 뜬 일회용 코드를 넣거나, PC 창에서 "이 기기 허락"을 누르면 기기 토큰을 받는다. 토큰은 브라우저에 저장한다.
   - 백엔드는 토큰을 해시로 저장한다. 설정에 "연결된 기기" 목록(이름, 마지막 접속, 끊기)을 둔다.
   - 짝 맺기 시도는 횟수를 제한한다. WebSocket과 HTTP는 Origin을 확인한다.
   - hook(`/hook`)과 하위 세션 명령(`/branch/*`)은 지금처럼 이 PC의 프로세스만 쓰고, 기기 토큰으로는 부를 수 없다.
   - 보드 API 토큰(`backend.json`)은 브라우저에 내주지 않는다.
4. **PC 폴더 탐색기.** 웹 화면에서 "+ 리포 열기"와 새 세션 창의 폴더 고르기가 PC 폴더를 보는 앱 안 탐색기를 쓴다(백엔드 API로 폴더 목록 읽기). 드라이브와 최근 폴더에서 시작한다. Electron 창은 지금처럼 OS 대화상자를 써도 된다.
5. **업로드.** 웹 화면에서 이미지나 파일을 터미널·명령 바에 붙여 넣거나 끌어 놓으면 백엔드로 올린다. PC의 판 데이터 폴더 아래(예: `uploads/`)에 저장하고, 그 PC 경로를 입력에 넣는다. 크기 상한과 정리(오래된 것 지우기)를 둔다.
6. **배포.** `npm run real`·바로가기로 띄운 판도 웹 화면을 내준다. 개발용 판도 같다. 화면 주소(`http://127.0.0.1:<포트>/`)를 `atrium status`에 보인다.

### 완료 기준

1. 짝 맺기(코드, 허락, 만료, 횟수 제한), 기기 토큰 확인, 열린 경로와 막힌 경로(hook, branch, 보드 토큰), 업로드 경로 만들기, 폴더 목록은 단위 시험한다.
2. 개발용 판으로 확인하고 결과를 `experiments/p48/`(git 밖)에 남긴다.
   - Playwright Chromium으로 `http://127.0.0.1:<포트>/`를 연다.
   - 짝 맺기 전에는 보드가 안 보이고 API가 거부된다.
   - 코드로 짝을 맺으면 보드가 열린다. 셸 세션을 띄우고 터미널에 치고(글이 보임), 명령 바로 보내고, 노드를 옮긴다.
   - PC 폴더 탐색기로 시험 폴더를 연다. 이미지를 붙여 넣으면 PC 경로가 들어간다. 웹 알림이 뜬다(권한을 준 시험 브라우저에서).
   - "연결된 기기"에서 끊으면 그 브라우저가 바로 막힌다.
   - Electron 창은 지금처럼 된다.
3. `cd backend && npm test`, `cd app && npm test`, `cd app && npm run build`가 통과한다.

### 시험 환경

- 너만의 개발용 판으로 띄운다(`docs/testing.md`).
  - `ATRIUM_HERDR_SESSION=atrium-dev-p48`, `ATRIUM_PORT=47866`
  - `ATRIUM_DATA_DIR=<워크트리>/backend/.dev/data`, `ATRIUM_APP_USERDATA=<워크트리>/backend/.dev/app`
- 실제 판(`atrium`, 47800)과 다른 작업자의 포트(47811~47865, 47867)는 쓰지 않는다.
- 대화 목록은 시험 폴더의 대화만 읽는다(`ATRIUM_CLAUDE_PROJECTS`, `ATRIUM_CLAUDE_DESKTOP=none`). 시험 폴더는 `C:\Workspace\mtask-p48-*`처럼 새로 만든다.
- 끝나면 시험 세션, 창, 브라우저, 백엔드, herdr 서버와 세션(`atrium-dev-p48`만), 시험 폴더, 업로드 시험 파일, 시험 대화 기록을 끄고 지운다.

### 지킬 것

- `CLAUDE.md`를 따른다. 프로세스는 직접 띄운 것만 PID로 끈다.
- 이 저장소는 공개다. 작업 기록, 시험 코드, 커밋 메시지에 사용자 경로·메일·토큰을 쓰지 않는다. 커밋 전·푸시 전 검사를 건너뛰지 않는다.
- **네트워크에 열지 않는다.** 백엔드는 지금처럼 `127.0.0.1`에서만 받는다. `tailscale serve`나 다른 바깥 공개는 R3에서 사용자와 정한 뒤에 한다. 이 PC의 방화벽과 Tailscale 설정은 건드리지 않는다.
- 같은 때 다른 작업자들이 돈다. 남의 파일은 되도록 건드리지 않고, 꼭 고쳐야 하면 작게 고치고 보고에 적는다.
  - P44: 사이드바, 그룹, 정렬, 워크스페이스 지우기
  - P45: `Thread.jsx`, 브리핑, 터미널 글자 크기, 설정의 배율
  - P46: `Docks.jsx`, 작업 관계도, 스킬 글
  - P47(R1): 클라이언트 ID와 목록, viewport, 터미널 나눠 보내기, 알림 고르기. 클라이언트 ID를 넣는 방법은 P47과 맞아야 하니 단순하게(연결 첫 메시지나 연결 주소의 값) 하고 보고에 적는다.
  - ux1: 시험 스크립트만
- 너의 파일: 화면 내주기와 짝 맺기·기기 토큰(새 모듈), 웹 어댑터(새 파일), 폴더 탐색기(새 창 부품과 API), 업로드 API, `preload.cjs`와 창 시작 부분, `TerminalView.jsx`·`CommandBar.jsx`의 붙여넣기·끌어 놓기 부분, 설정의 "연결된 기기" 칸.
- 화면 글은 `locales/en.js`·`ko.js` 끝에 더한다. 한국어는 P39 말투(합니다체)와 용어를 따른다. `styles.css`는 끝에 더한다.
- 자기 브랜치에만 커밋한다. 커밋 메시지에 `Co-Authored-By` 줄을 넣지 않는다. `main`을 바꾸거나 푸시하지 않는다. `node_modules`는 워크트리 안에서 받는다(`npm ci`).
- 원격 작업은 사용자가 따로 검토한 뒤 합친다. 보고에 바꾼 동작, 보안 모델(누가 무엇을 부를 수 있나), 남은 위험을 빠짐없이 적는다.
- 문서는 이 작업 파일의 작업 기록 절과 보고 절만 고친다. 고쳐야 할 ARCH 행(1절 프로세스·통신, 보안, API·모듈 표, 7절 화면)과 BRIEF 행의 새 문장은 보고 절에 적는다.
- 끝나면 보고 절을 쓰고, 맨 마지막에 `<워크트리>/backend/.dev/p48.done`(브랜치 이름과 마지막 커밋 해시 두 줄)을 만든다.

### 읽을 파일

- `CLAUDE.md`, `docs/testing.md`, `docs/ARCH.md` 1절, 6절 API, 7절
- `app/src/main/preload.cjs`, `main.mjs`, `app/src/renderer/main.jsx`(시작), `store.js`, `api.js`(WebSocket), `SpawnDialog.jsx`·`Workspaces.jsx`(폴더 고르기), `TerminalView.jsx`·`CommandBar.jsx`(붙여넣기), `backend/src/backend.mjs`(HTTP, `onHttp`, API 토큰), `backend/src/api.mjs`
- `app/scripts/build.mjs`(창 빌드)

## 작업 기록

2026-11-05 P48 작업자 세션

- 계획: 백엔드에 새 모듈 `web.mjs`(화면 파일, 짝 맺기, 기기 토큰, Host·Origin 검사, 폴더 목록, 업로드)를 두고, `ApiServer`에는 연결 허락 고리(`authorize`)만 더한다. 창은 `window.mt`가 없으면 웹 어댑터(`web.js`)가 대신하고, 짝을 맺기 전에는 짝 맺기 화면만 그린다.
- 판 API 토큰 연결도 이 PC의 프로세스로 좁혔다. Electron 창의 WebSocket은 Origin `file://`를 보내므로 그것만 더 받는다. 브라우저 출처로 판 API 토큰을 쓰면 막힌다.
- hook 수신기가 Claude Code의 요청을 막지 않는지 걱정했다. Node·Bun 클라이언트는 `Origin`·`Sec-Fetch-Site`를 보내지 않는다. 개발용 판에서 claude haiku 세션의 hook(Stop의 답)이 그대로 오는 것으로 확인했다.
- 드라이브 목록을 글자마다 `existsSync`로 보니 이 PC에서 21초 걸렸다(끊긴 네트워크 드라이브). `[System.IO.DriveInfo]::GetDrives()`를 PowerShell로 한 번 부르고 1분 동안 기억하게 바꿨다.
- `fetch`로는 Host 머리글을 바꿀 수 없어 DNS 다시 묶기 시험은 `http.get`으로 했다.
- 개발용 판 시험(`app/test/e2e/p48-web.mjs`)에서 겪은 것
  - Playwright 1.64의 Chromium이 없어 `npx playwright install chromium`, `chromium-headless-shell`을 받았다(사용자 캐시 `ms-playwright`).
  - headless shell은 알림 권한이 늘 denied다. 새 headless(`channel: 'chromium'`)로 바꾸니 권한을 준 시험 브라우저에서 알림이 떴다.
  - PC 창과 브라우저가 같은 셸 노드를 보면 한 패널에 제어기가 하나라 나중에 붙은 쪽이 가져간다(takeover). 지금 동작이고 P47 범위라 고치지 않았다. 시험은 "다시 붙기"를 눌러 넘어간다.
  - 같은 날 시험을 여러 번 돌리자 틀린 코드 시험이 쌓여 횟수 제한(한 곳에서 10분에 5번)이 실제로 걸렸다. 백엔드를 다시 띄워 비우고 돌렸다.
  - 설정의 연결된 기기 칸이 설정 격자(이름·값·풀이 세 칸)에 끼어 깨졌다. 한 줄씩 쌓는 칸으로 바꿨다.
- 마지막 실행 결과 19/19 통과(`experiments/p48/run11.txt`, `p48-web-results.json`, 스크린숏 01~10).
- 정리: 시험 세션(p48sh, p48c)을 끄고, 창·브라우저를 닫고, 백엔드와 herdr 서버를 끄고 herdr 세션 `atrium-dev-p48`을 지웠다. 시험 폴더(`C:\Workspace\mtask-p48-web`), 업로드 폴더, 시험 대화 기록(`~/.claude/projects`의 그 폴더 몫), 시험 기기를 지웠다. 개발용 판 데이터(`backend/.dev/data`, git 밖)는 남겼다.

## 보고

### 만든 것

- **화면 내주기**(`backend/src/web.mjs` `StaticFiles`): 백엔드가 판 포트에서 `app/dist`를 내준다(`GET /`). `index.html`·`renderer.*`는 `no-cache`와 ETag(바뀌지 않으면 304), `fonts/`는 이름에 해시가 있어 1년 `immutable`, 글 파일은 gzip. 빌드가 없으면 503과 "`cd app && npm run build`" 안내(영어·한국어). `X-Frame-Options: DENY`, `nosniff`, `no-referrer`. 경로 넘기(`..`, 숨김 파일)는 404. `ATRIUM_WEB_DIST`로 폴더를 바꿀 수 있다. 처음 화면까지 약 1.1~1.2초(시험 브라우저, 짝 맺기 화면).
- **웹 어댑터**(`app/src/renderer/web.js`): `window.mt`가 없을 때만 둔다. `backend`는 `GET /web/me`(기기 토큰)로 시작 값을 받고 같은 출처 WebSocket `/api?device=<토큰>`을 돌려준다(`api.js`는 `info.wsUrl`이 있으면 그것을 쓴다). `log`는 콘솔, `metrics`는 빈 목록, `notify`는 Web Notifications(권한은 처음 누를 때 묻는다, 누르면 창에 초점을 주고 그 세션으로), `onNavigate`, `pickFolder`는 PC 폴더 탐색기. 판 밖에 파일을 놓아도 페이지가 넘어가지 않게 막는다. Electron 창은 preload가 먼저 `window.mt`를 두므로 바뀌지 않는다. `index.html` CSP의 `connect-src`에 `'self'`를 더하고 아이콘 링크를 넣었다.
- **짝 맺기와 기기 토큰**(`Devices`, `Pairing`)
  - 코드: PC 창 설정 › 연결된 기기의 "새 코드"(또는 `atrium devices code`)가 6자리 일회용 코드를 만든다. 5분, 한 번만, 새 코드를 만들면 앞 코드는 버린다. 브라우저가 `POST /web/pair/code { code, name }`로 넣으면 기기 토큰을 받는다.
  - 허락: 브라우저가 `POST /web/pair/request { name }` → `{ requestId, secret, check }`. PC 창 위쪽에 카드가 뜨고(같은 4자리 확인 번호) "허락"을 누르면, 브라우저가 `GET /web/pair/poll`로 토큰을 한 번 받는다. 요청은 2분 뒤 만료.
  - 횟수 제한: 틀린 코드는 한 곳(IP)에서 10분에 5번, 모두 합쳐 20번까지(넘으면 429와 `retry-after`). 한 코드가 5번 틀리면 그 코드를 버린다. 허락 요청은 동시에 3개, 10분에 10개까지.
  - 토큰은 32바이트 무작위, 판 기록(meta `webDevices`)에는 sha256만 둔다. 브라우저는 `localStorage`(`atrium.deviceToken`)에 둔다.
  - 끊기: 설정의 "끊기"(또는 `atrium devices rm <id>`)는 기록을 지우고 그 기기의 열린 WebSocket을 곧바로 닫는다(4401). 브라우저는 다시 붙을 때 401을 받고 짝 맺기 화면으로 돌아간다(시험에서 약 1.4초).
  - 연결된 기기 목록: 이름, 짝 맺은 때, 마지막 접속(연결할 때와 `/web/me`, 1분 간격), 끊기. 바뀌면 `device.updated` 이벤트.
- **PC 폴더 탐색기**(`app/src/renderer/FolderPicker.jsx`, API `fs.roots`·`fs.list`): 드라이브·홈·최근 폴더(워크스페이스 뿌리, 최근 세션 폴더)에서 시작하고 폴더만 보인다(1000개까지, 숨김 폴더는 뒤로, 고르면 보인다). 경로를 쳐서 이동, 위로, 이 폴더 고르기. "+ 리포 열기"와 새 세션 창의 "찾아보기"가 쓴다. 새 세션 창에는 찾아보기 단추가 없어서 더했다(Electron 창은 OS 대화상자).
- **업로드**(`POST /web/upload?name=…`, 기기 토큰): 데이터 폴더 `uploads/`에 `YYYYMMDD-HHMMSS-<무작위>-<이름>`으로 저장하고 PC 경로를 돌려준다. 25MB 상한(넘으면 413, 쓰다 만 파일은 지운다), 7일 지난 것과 총 500MB를 넘는 만큼(오래된 것부터)을 올릴 때와 백엔드가 뜰 때 지운다. 웹 화면의 터미널(붙여넣기·끌어 놓기)은 경로를 괄호 붙여넣기로 넣고, 명령 바는 커서 자리에 넣는다. 빈칸이 든 경로는 따옴표로 감싼다(`lib/upload.js`). Electron 창의 붙여넣기는 그대로다.
- **배포**: `npm run real`·바로가기·개발용 판 모두 같은 백엔드라 화면을 내준다. `atrium status`에 `화면 주소=http://127.0.0.1:<포트>/`와 짝 맺은 기기 수를 보인다(`backend.status.web`). `atrium devices [code|rm <id>]`를 더했다.
- **시험**: `backend/test/p48.test.mjs`(11개: 기기 토큰, 코드·허락 짝 맺기와 만료·횟수 제한, 이 PC의 프로세스 판정과 Origin, 화면 파일, 연결 허락과 막힌 경로, 허락 HTTP, 업로드, 업로드 이름·정리, 폴더 목록, 드라이브 목록), `app/test/p48-lib.test.mjs`(4개), 개발용 판 시험 `app/test/e2e/p48-web.mjs`(19개 확인). `cd backend && npm test` 359 통과, `cd app && npm test` 128 통과, `npm run build` 통과.

### 보안 모델(누가 무엇을 부를 수 있나)

| 부르는 쪽 | 쓰는 것 | 부를 수 있는 것 |
|---|---|---|
| 이 PC의 프로세스(atrium CLI, Electron 창) | 판 API 토큰(`backend.json`) | WebSocket 판 API 전부와 `device.code`·`device.cancelCode`·`device.approve`·`device.deny`. 연결은 Host가 `127.0.0.1`·`localhost`(그 포트), 원격 주소가 루프백, 전달 머리글(`X-Forwarded-*`, `Forwarded`, `X-Real-IP`, `Tailscale-*`)이 없고, Origin이 없거나 `file://`·`null`일 때만 받는다 |
| 판이 띄운 claude의 hook | 세션 hook 토큰 | `POST /hooks/claude`. 위와 같은 "이 PC의 프로세스" 검사(Origin 허용 없음)를 먼저 하고, 걸리면 403 |
| 하위 세션(`atrium-child`) | 가지 토큰 | `POST /branch/*`. hook과 같은 검사 |
| 짝 맺은 브라우저 | 기기 토큰 | WebSocket 판 API(코드 만들기·허락·거절 빼고 전부, `device.list`는 기기 목록과 자기만), `GET /web/me`, `POST /web/upload`. Host가 허용 목록이고 Origin이 같은 출처여야 한다 |
| 짝 맺지 않은 브라우저 | 없음 | 화면 파일, `/web/pair/*`(횟수 제한), `/health`. Host 검사, 브라우저 요청은 같은 출처만 |

- 판 API 토큰은 브라우저에 내주지 않는다(`/web/me`는 기기 정보, 포트, 프로필, herdr 세션 이름, 기본 폴더·모델만).
- Host 허용 목록은 `127.0.0.1:<포트>`, `localhost:<포트>`와 `ATRIUM_WEB_HOSTS`(쉼표로 여럿, R3용)다. 다른 Host는 421(DNS 다시 묶기 막기).
- 백엔드는 지금처럼 `127.0.0.1`에서만 받는다. 방화벽과 Tailscale 설정은 건드리지 않았다.

### 남은 위험

- 기기 토큰은 이 PC 사용자의 권한과 같다. 짝 맺은 브라우저는 셸 세션을 띄워 무엇이든 실행할 수 있고, `backend.shutdown`, `herdr.stop`, 설정 바꾸기, 세션 끄기도 부른다. `session.get`은 설정 파일 경로도 준다. 막는 방법은 끊기뿐이다.
- 토큰이 `localStorage`와 WebSocket 주소(`?device=`)에 있다. 같은 출처에 스크립트를 넣을 수 있으면(CSP `script-src 'self'`가 막는다) 토큰을 읽는다. 앞단 프록시가 주소를 기록하면 거기 남는다.
- 코드 시도 제한은 IP별이다. 이 PC 안의 브라우저는 모두 `127.0.0.1`이고, R3의 `tailscale serve`를 거치면 `X-Forwarded-For`(루프백에서 온 것만 믿음)로 나눈다. 누군가 틀린 코드를 계속 넣으면 전체 한도(10분에 20번)에 걸려 10분 동안 아무도 코드로 짝 맺지 못한다(허락 방식은 된다). 코드, 허락 요청, 시도 횟수는 메모리에만 있어 백엔드를 다시 띄우면 비워진다.
- R3에서 바깥에 열 때: Tailscale 이름을 `ATRIUM_WEB_HOSTS`에 넣어야 한다(아니면 421). 웹 알림과 클립보드는 보안 출처(https 또는 localhost)에서만 되므로 `http://100.x`로는 안 된다. `tailscale serve`(https)가 hook·branch 요청에 전달 머리글을 넣지 않고 Host를 `127.0.0.1:<포트>`로 바꾸면 그 요청은 "이 PC의 프로세스"로 보인다. 그때도 세션 hook 토큰·가지 토큰이 있어야 하지만, R3에서 `/hooks/`와 `/branch/`를 프록시에서 빼는 것이 안전하다.
- 폴더 탐색기는 PC의 모든 폴더 이름을 보인다(파일 내용은 읽지 않는다). 업로드는 형식을 가리지 않는다(실행하지 않고 저장만 한다).
- 화면 파일과 짝 맺기 화면은 포트에 닿는 누구에게나 보인다(코드는 공개 저장소의 것과 같다).

### 계획과 다른 곳

- 한 패널에 제어기가 하나라 PC 창과 브라우저가 같은 터미널을 보면 나중에 붙은 쪽이 가져간다(takeover). 서로 저절로 되찾지 않으므로, 브라우저를 끊은 뒤 PC 창에서 그 노드의 "다시 붙기"를 눌러야 한다. P47(여러 클라이언트) 범위라 고치지 않았다.
- 드라이브 목록은 PowerShell을 한 번 부른다(1분 기억). 실패하면 홈 드라이브만 보인다.
- `preload.cjs`와 `main.mjs`는 바꿀 필요가 없었다.
- 남의 파일을 작게 고쳤다: `api.js`(`info.wsUrl` 한 줄), `SpawnDialog.jsx`(폴더 칸 옆 찾아보기 단추), `Settings.jsx`(탭 한 줄과 그 칸), `backend.mjs`(웹 모듈 묶기, hook·branch 검사, `recentDirs`, `backend.status.web`), `api.mjs`(`authorize` 고리, `client.auth`), `bin/atrium.mjs`(`devices`, 화면 주소 줄), `index.html`(CSP, 아이콘).
- P47과 맞출 것: 연결마다 `client.auth = { kind: 'local' | 'device', device?: { id, name } }`를 `ApiServer._connection`에서 붙인다. 정보는 연결 주소의 값(`?token=` 또는 `?device=`)에서 온다. 클라이언트 ID도 연결 주소의 값(`?client=`)으로 넣으면 `authorize(req)`가 같은 `req`를 보므로 함께 읽을 수 있다. 기기 클라이언트는 `c.auth.device`로 가린다.

### 알려진 문제

- 연결된 기기 목록의 마지막 접속은 연결할 때와 `/web/me`에서만 바뀐다(연결된 동안 계속 바뀌지 않는다).
- 웹 화면의 짝 맺기 화면 언어는 브라우저 언어(ko면 한국어)를 따르고, 짝을 맺은 뒤에는 판 설정의 언어를 따른다.
- Electron 창의 그림 붙여넣기는 지금처럼 하지 않는다(웹 화면만 올린다).

### 살아 있는 문서에 고칠 줄(지휘 세션이 반영)

- BRIEF "정한 것" 프로세스 구조 행: "창은 Electron 창이거나, 백엔드가 같은 포트로 내주는 웹 화면을 연 브라우저다. 둘 다 백엔드에 WebSocket으로 붙는다. 브라우저는 PC 창에서 짝을 맺은 기기 토큰으로만 붙는다."
- ARCH 1절 그림과 통신: 백엔드에 "화면 파일과 /web/*(짝 맺기, 기기 정보, 업로드)" 줄을 더하고, 연결 두 가지(판 API 토큰: 이 PC의 프로세스만, 기기 토큰: 같은 출처 브라우저)와 Host 허용 목록(`ATRIUM_WEB_HOSTS`)을 적는다. hook과 `/branch/*`는 이 PC의 프로세스만 부른다.
- ARCH 5절 모듈 표: `web.mjs` — 화면 파일, 짝 맺기·기기 토큰(해시), Host·Origin 검사, 폴더 목록, 업로드.
- ARCH 6절 API 표: `device.list`, `device.revoke`, `device.rename`, `device.code`·`device.cancelCode`·`device.approve`·`device.deny`(이 PC만), `web.status`, `fs.roots`, `fs.list { path }`, 이벤트 `device.updated`. HTTP: `GET /web/me`, `POST /web/pair/code`, `POST /web/pair/request`, `GET /web/pair/poll`, `POST /web/upload`.
- ARCH 7절 화면: 웹 화면의 짝 맺기 화면, PC 폴더 탐색기, 설정의 연결된 기기 탭, PC 창 위쪽의 허락 요청 카드.
