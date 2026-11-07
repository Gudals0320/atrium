상태: 열림
날짜: 2026-11-07

## 지시

### 목표

iPhone Safari가 판을 열자마자 다시 읽히다가 "문제가 반복적으로 발생했습니다"를 띄우고 닫혀 휴대폰으로 판을 쓸 수 없다. 페이지가 죽는 까닭을 기기에서 잡아 오고, 반복해서 죽으면 가벼운 화면으로 열어 쓸 수 있게 하고, 가장 유력한 원인(휴대폰의 터미널 메모리)을 줄인다.

### 사용자의 말(2026-11-07, `v0.1.4-dev.3`)

"지금 safari에서 딱 켰는데 키자마자 재부팅되더니 safari에서 "문제가 반복적으로 발생했습니다." 뜨면서 닫힘. 사용이 안됨"

### 지휘 세션이 알아낸 것(실제 판의 연결 기록을 읽기만 함)

- `v0.1.4-dev.3`(19:13): 연결 두 번이 각각 5.8초, 6.0초 만에 1006으로 끊기고 그 뒤로 기록이 없다. 6초 동안 보낸 메시지 27~33개, 230~350KB, 마지막 다섯 개에 40~58KB짜리 글 메시지가 여럿이다(`ws.last`).
- `v0.1.4-dev.2`(18:23): 전체 보기(터미널 하나)를 보던 연결은 193초 붙어 있다가 1006.
- 끊긴 뒤 다시 붙은 `connect`에 P82의 직전 닫힘(`prev`)이 한 번도 없다. 창이 살아서 다시 붙었다면 `pc`를 보냈을 것이므로, 1006 끊김은 소켓만이 아니라 페이지(WebContent)가 죽고 다시 읽힌 것일 수 있다. P82 전의 "몇 초마다 튕김"도 같은 것일 수 있다.
- 가설: 휴대폰 보드 화면이 터미널 여럿을 붙이고, iPhone의 화면 배율 3에서 xterm 캔버스(와 WebGL)가 Safari의 캔버스·GPU 메모리 한도를 넘어 페이지가 죽는다. 전체 보기(터미널 하나)는 버텼다. P83(`dev.3`)의 높이 보정(`useScreenFix`)은 Safari 탭에서는 아무것도 하지 않아 원인이 아니라고 보지만 확인한다. 확정하지 않았다.

### 할 것

1. **죽기 전 기록(기기에서).** 웹 화면이 짧은 간격으로 자기 상태를 `localStorage`에 적어 둔다. 적을 것: 부팅 시각과 횟수, 마지막으로 살아 있던 시각, 화면(보드·목록·전체 보기), 붙은 터미널 수, xterm 캔버스의 장치 픽셀 합, WebGL 컨텍스트 수, `devicePixelRatio`, 받은 바이트. 페이지가 정상으로 떠날 때(`pagehide`)는 그것도 적는다. 다음 부팅이 정상 떠남 없이 시작되면 직전 기록을 백엔드로 보내 연결 기록(`remote-log.jsonl`)에 남긴다(예: `boot` 줄에 `crashed: true`와 직전 상태). 내용(글, 화면)은 보내지 않는다. PC의 연결 기록과 `atrium remote log`에 보인다.
2. **반복해서 죽으면 가벼운 화면.** 짧은 사이(예: 1분 안)에 정상 떠남 없이 두 번 다시 읽히면, 다음 부팅은 가벼운 화면으로 연다. 휴대폰이면 목록 화면, 터미널은 사람이 고른 하나만, WebGL 없음. 위에 "화면이 반복해서 닫혀 가볍게 열었습니다"와 "보드로 다시 열기"를 보인다. 다시 열었는데 또 죽으면 다시 가벼운 화면으로 온다. 두 사전, 지금 말투.
3. **휴대폰의 터미널 메모리 줄이기.** 지금 휴대폰 보드 화면(손가락 포인터, 웹)에서 붙는 터미널 수, 캔버스 크기(CSS px와 장치 픽셀), WebGL 사용, 다시 그리기 횟수를 먼저 잰다. 그다음 근거를 들어 줄인다. 예:
   - 휴대폰 웹은 WebGL을 쓰지 않는다.
   - 터미널 캔버스의 장치 픽셀 배율에 상한을 둔다(화면 배율 3을 그대로 쓰지 않는다).
   - 멀리 보기에서는 터미널을 붙이지 않고 얼굴만 보인다.
   - 동시에 붙는 터미널 수를 휴대폰에서 더 적게 한다.

   PC 창은 바꾸지 않는다.
4. **dev.3 변경 확인.** P83의 높이 보정, 명령 바 손잡이(`visualViewport` 이벤트), 휴대폰 글자, P82의 같은 xterm 다시 붙기가 휴대폰에서 되풀이 고리(크기 바꿈 → 전체 프레임 요청 → 다시 크기 바꿈)를 만들지 않는지 재어 적는다. 고리가 있으면 고친다.

### 손대지 말 것

- 원격 연결 처리(P82의 압축·기록)와 PC 창의 터미널 처리, tailscale·네트워크 설정은 바꾸지 않는다. 실제 판으로 시험하지 않는다.

### 완료 기준

1. 단위 시험: 기록 적기와 정상 떠남 판단, 죽음 판단과 가벼운 화면 판단, 기록 줄의 필드(내용 없음), 휴대폰 터미널 예산(수, 배율 상한, WebGL 끔).
2. 창 시험(개발용 판, 원격 흉내 `app/test/e2e/p59-lib.mjs`, iPhone 393×852 화면 배율 3 흉내 Chromium. P82·P83처럼 Playwright WebKit은 열리지 않으면 Chromium으로). 결과는 `experiments/p84/`에 둔다.
   - 세션 12개 안팎이 있는 판에서 휴대폰 보드 화면을 열어 고치기 전과 뒤의 터미널 수, 캔버스 장치 픽셀 합, WebGL 컨텍스트 수, 메모리(Chromium `performance.memory`나 CDP)를 잰다.
   - 페이지를 정상 떠남 없이 두 번 죽여(CDP `Page.crash` 등) 가벼운 화면으로 열리고 연결 기록에 `crashed` 줄이 남는지 본다.
3. 보고에 사람이 iPhone으로 확인할 순서와, 연결 기록에서 무엇을 보면 원인이 갈리는지 적는다.
4. `cd backend && npm test`, `cd app && npm test`, `cd app && npm run build`가 통과한다.

### 읽을 파일

- `CLAUDE.md`, `docs/testing.md`(원격 창 시험), ARCH 1절 원격 문단, `docs/log/p65-terminal-sharpness.md`, `docs/log/p76-phone-board-touch.md`, `docs/log/p82-phone-disconnects.md`, `docs/log/p83-phone-full-view.md`의 보고 절
- `app/src/renderer/TerminalView.jsx`, `app/src/renderer/lib/faces.js`(`RendererBudget`), `app/src/renderer/lib/term-sharp.js`, 노드에 터미널을 붙이는 쪽(`Canvas.jsx`, `SessionNode.jsx`), `app/src/renderer/Phone.jsx`, `app/src/renderer/PhoneFull.jsx`, `app/src/renderer/api.js`, `app/src/renderer/perf.js`
- `backend/src/web.mjs`, `backend/src/remote-log.mjs`, `backend/src/remote-ws.mjs`
- `app/test/e2e/p82-drops.mjs`, `app/test/e2e/p83-phone.mjs`(창 시험 틀)

### 시험 환경

- 이 작업은 `dev` 브랜치에서 시작한다. 워크트리를 연 뒤 먼저 `git fetch origin && git merge --ff-only origin/dev`를 한다(워크트리가 `main`에서 시작할 수 있다).
- 너는 사용자의 실제 판 위에서 도는 워커라 셸에 실제 판의 `ATRIUM_*`·`HERDR_*`가 있다. 시험, 개발용 판, herdr, `atrium`은 이 변수를 지운 셸(`backend/.dev/clean-env.sh`, `docs/testing.md`)로 부른다.
- 개발용 판은 너만의 판으로 띄운다(`docs/testing.md`).
  - `ATRIUM_HERDR_SESSION=atrium-dev-p84`, `ATRIUM_PORT=47897`, 창의 원격 디버깅 포트 9377
  - `ATRIUM_DATA_DIR=<워크트리>/backend/.dev/data`, `ATRIUM_APP_USERDATA=<워크트리>/backend/.dev/app`
- 실제 판(`atrium`, 47800)과 다른 판의 포트는 쓰지 않는다. 사용자의 기본 herdr 세션, 실제 판의 herdr 세션(`atrium`), 다른 판의 herdr 서버는 건드리지 않는다. 사용자의 실제 판은 열지도 캡처하지도 않는다. 스크린숏은 창 안만 찍는다(`page.screenshot`).
- 실제 판의 API(47800)와 `atrium` 명령으로 실제 판을 바꾸지 않는다. 시험의 `atrium` CLI는 늘 개발용 판 환경 변수(`ATRIUM_PORT` 등)를 주고 부른다.
- 실제 설치 폴더(`%LOCALAPPDATA%\atrium\versions`)와 실제 데이터 폴더(`%LOCALAPPDATA%\atrium`)는 읽지도 바꾸지도 않는다.
- 대화 목록은 시험 폴더의 대화만 읽는다(`ATRIUM_CLAUDE_PROJECTS`, `ATRIUM_CLAUDE_DESKTOP=none`). 시험 폴더는 `C:\Workspace\mtask-p84-*`처럼 새로 만든다.
- 세션은 `claude --model haiku`와 셸로 띄운다.
- 끝나면 시험 세션, 창, 브라우저, 백엔드, herdr 서버와 세션(`atrium-dev-p84`만), 시험 폴더를 끄고 지운다. 네가 띄운 프로세스가 남지 않았는지 포트로 확인한다.

### 지킬 것

- `CLAUDE.md`를 따른다. 프로세스는 직접 띄운 것만 PID로 끈다. 신뢰 질문은 대신 답하지 않는다.
- 이 저장소는 공개다. 작업 기록, 시험 코드, 커밋 메시지, 그림에 사용자 경로·메일·토큰, 실제 PC·tailnet 이름, IP, 실제 대화 내용을 쓰지 않는다. 커밋 전·푸시 전 검사를 건너뛰지 않는다.
- 화면 글은 영어와 한국어 사전 둘 다 고친다. 한국어 문구는 사전의 지금 말투(`docs/log/korean-copy-review.md`)를 따른다.
- 같은 때 P85 작업자가 판 `atrium-dev-p85`(47898, CDP 9378)로 멀리 보기 강조를 고친다(`SessionNode.jsx`, `Canvas.jsx`, 위 칩). 그 포트와 세션은 쓰지 않는다. 맡은 일에 필요한 만큼만 고치고, `styles.css`와 두 사전은 끝에 더해 합치기 쉽게 한다.
- 자기 브랜치에만 커밋한다. 커밋 메시지에 `Co-Authored-By` 줄을 넣지 않는다. `main`이나 `dev`를 바꾸거나 푸시하지 않는다. `node_modules`는 워크트리 안에서 받는다(`npm ci`, 창은 그 뒤 `node node_modules/electron/install.js`).
- 문서는 이 작업 파일의 작업 기록 절과 보고 절만 고친다. 고쳐야 할 ARCH·BRIEF·testing·README 문장은 보고 절에 짧게 적는다. 살아 있는 문서 예산이 거의 찼으니(70,000자 중 69,991자) 문장은 바꾸는 문장보다 길지 않게 적는다.
- 끝나면 보고 절을 쓰고, 맨 마지막에 `<워크트리>/backend/.dev/p84.done`(브랜치 이름, 마지막 커밋 해시, 시험 수 세 줄)을 만든다.

## 작업 기록

- 시작: `git fetch origin && git merge --ff-only origin/dev`(cddc586). 워크트리 안에서 `npm ci`(백엔드, 창)와 Electron 받기. 물려받은 판 변수를 지우는 `backend/.dev/clean-env.sh`를 만들었다(저장소 밖). 창 시험은 스스로 `ATRIUM_*`·`HERDR_*`를 지우고 이 판 값(atrium-dev-p84, 47897, `backend/.dev/data`·`app`)만 넣는다. 흉내 프록시는 47893(P83의 47898은 P85 판이라 쓰지 않음).
- 창 시험 `app/test/e2e/p84-crash.mjs`: 셸 10개(글 120줄)와 haiku 에이전트 2개, iPhone 393×852 화면 배율 3 Safari UA Chromium(WebGL은 SwiftShader). PC가 남긴 화면 자리(배율 1)·전체 맞춤·노드 하나·배율 2·배율 1에서 붙은 터미널 수, 캔버스·글자 아틀라스 장치 픽셀, WebGL 수, JS 힙, DOM 수를 잰다. 결과는 `experiments/p84/`.

### 고치기 전에 잰 것(`P84_STAGE=before`)

| 자리 | 터미널 | WebGL | 캔버스 장치 픽셀 | 그림 메모리 추정 |
|---|---:|---:|---:|---:|
| PC가 남긴 자리(배율 1, 처음 여는 휴대폰) | 1 | 1 | 10.5M | 82MB |
| 노드 하나 맞춤(배율 0.26) | 6 | 6 | 7.0M | 56MB |
| 배율 2(두 손가락 최대) | 1 | 1 | 24.0M | 185MB |
| 배율 1, 노드 둘 | 2 | 2 | 21.0M | 162MB |
| 전체 보기(뒤의 보드 포함) | 6 | 5 | 5.9M | 47MB |

- 추정은 (캔버스 + 아틀라스) × 2(그리기·화면 버퍼) × 4바이트. JS 힙은 10~14MB, DOM 340~720개로 작다. 메모리는 캔버스가 쥔다.
- 까닭: 휴대폰 보드의 터미널은 PC가 정한 패널 크기(175칸)를 그대로 그리고, P65의 선명하게 그리기가 판 배율 × 화면 배율 3의 해상도로 WebGL 캔버스를 다시 만든다. 배율 1에서 한 장 4200×2244(9.4M px), 배율 2에서 상한(12M px)에 걸린 4725×2541 두 장. 글자 아틀라스는 512×512 한 장을 나눠 써 작다.
- 처음 여는 휴대폰은 PC가 남긴 화면 자리(배율 1)로 연다(`board.get` viewport). 휴대폰이 열자마자 82MB 넘는 그림 메모리를 잡고, 노드 둘이 보이면 160MB를 넘는다. iOS Safari의 WebContent 메모리 한도에 닿을 수 있는 크기다(지휘 세션의 "6초 만에 1006"과 맞다). 확정은 iPhone의 boot 줄로 한다.
- 전체 보기를 연 동안에도 뒤의 보드가 터미널 5개(WebGL)를 붙여 두었다.

### 고친 것

1. 죽기 전 기록: `lib/crumbs.js`(순수)와 `crash-watch.js`. 웹 화면만, 2초마다와 가려질 때 `localStorage mt.crumbs`에 화면·터미널 수·캔버스·아틀라스 픽셀·WebGL 수·DPR·받은 바이트와 살아 있던 시각을 적고, `pagehide`면 정상 떠남을 적는다. 다음 부팅이 정상 떠남 없이 시작되면 연결이 열릴 때 `web.boot`로 직전 상태를 보낸다. 백엔드는 기기 연결 하나에 한 번 `boot` 줄(`crashed`, `light`, `crash`)을 남긴다(`backend/src/web-crash.mjs`가 숫자와 짧은 코드만 고른다). PC 연결 기록 화면과 `atrium remote log`에 "화면이 닫힌 뒤 다시 열림"과 닫히기 전 값이 보인다.
2. 가벼운 화면: 1분 안에 두 번 죽으면(가려진 채 죽은 것은 세지 않음) 다음 부팅은 가벼운 화면이다. 휴대폰은 목록 화면(터미널은 고른 세션 하나, WebGL 없음), 그 밖의 웹은 터미널 하나·WebGL 없음 보드. 위에 안내와 "보드로 다시 열기". 다시 연 보드가 정상으로 떠나거나 3분 살기 전에 또 죽으면 다시 가벼운 화면. 목록 머리줄의 보드 단추도 다시 열기로 간다.
3. 터미널 메모리: 손가락 포인터의 웹 화면은 WebGL을 쓰지 않고(DOM으로 그린다, 휴대폰 전체 보기·목록과 같다) 동시에 붙는 터미널을 3개로. 전체 보기가 열린 동안 보드는 터미널을 붙이지 않는다. 마우스 웹 화면은 WebGL 캔버스 한 장의 장치 픽셀 상한을 4M px로(PC 창은 12M px 그대로). PC 창(Electron)은 바뀌지 않는다.
4. 시험 중 찾은 것: 정상으로 다시 읽을 때 `pagehide` 뒤에 `visibilitychange`(hidden)가 와서 정상 떠남을 덮었다. 떠나는 중에는 살아 있다는 기록을 적지 않게 했다.

### 고친 뒤에 잰 것(`P84_STAGE=after`, 14/14 통과)

| 자리 | 터미널 | WebGL | 캔버스 장치 픽셀 | JS 힙 |
|---|---:|---:|---:|---:|
| PC가 남긴 자리 | 1 | 0 | 0 | 11MB |
| 노드 하나 맞춤 | 3 | 0 | 0 | 11MB |
| 배율 2 | 1 | 0 | 0 | 11MB |
| 배율 1, 노드 둘 | 2 | 0 | 0 | 14MB |
| 전체 보기 | 1 | 0 | 0 | 11MB |

- DOM은 607~742개로 조금 는다. 배율 0.26과 1에서 DOM 터미널 글이 읽힌다(`after-03`, `after-05`).
- 죽음: CDP `Page.crash` 뒤 새 페이지. 1번째는 보드 그대로와 boot 줄, 2번째(1분 안)는 가벼운 화면(목록, 터미널 0, WebGL 0)과 `light: true` 줄. 다시 열기 뒤 또 죽으면 가벼운 화면, 정상으로 다시 읽으면 보드와 boot 줄 없음. boot 줄의 필드는 정한 것만.

### dev.3 변경 확인(되풀이 고리)

- Safari 탭 흉내와 홈 화면 앱 흉내(높이 보정 켜짐, `mt-tall`) 모두, 가만히 둔 보드와 전체 보기 10초 동안 resize 0, `terminal.*` 요청 0, xterm 다시 그리기 0. 키보드(visualViewport)를 열고 닫아도 요청 0. 크기 바꿈 → 전체 프레임 → 크기 바꿈 고리는 없다.
- 창 높이 자체가 바뀌면(키보드 흉내 `setViewportSize`) 고치기 전에는 전체 보기 뒤의 보드가 터미널을 떼고 다시 붙였다(attach·detach 2번, history 4번). 고친 뒤에는 resize 2번과 그 터미널의 history 2번뿐이다(위 3번).
- P82의 같은 xterm 다시 붙기는 이번 시험의 죽음(새 페이지)에는 걸리지 않는다. 고친 것 없음.
- 시험 수: 백엔드 591(새 5), 창 304(새 10), 창 시험 14/14, `npm run build` 통과.
- 정리: 시험 세션 12개 지움, 브라우저 닫음, `atrium backend stop`, `atrium herdr stop --yes`, `herdr session delete atrium-dev-p84`, 시험 폴더 `C:\Workspace\mtask-p84-proj` 지움. 47893·47894·47897·9377에 듣는 프로세스와 `atrium-dev-p84`·`mtask-p84`를 가진 프로세스가 남지 않았다. PC 창은 띄우지 않았다.

## 보고

### 한 것

1. 웹 화면이 죽기 전 상태를 기기에 적고, 정상 떠남 없이 다시 열리면 연결 기록에 `boot` 줄(직전 화면, 터미널 수, 캔버스·아틀라스 픽셀, WebGL 수, DPR, 받은 바이트, 살아 있던 시간)을 남긴다. 내용은 보내지 않는다.
2. 1분 안에 두 번 죽으면 가벼운 화면(휴대폰은 목록, 터미널 하나, WebGL 없음)과 "보드로 다시 열기". 다시 연 보드가 또 죽으면 다시 가벼운 화면.
3. 휴대폰(손가락 웹 화면)은 WebGL 없이 터미널 3개까지, 전체 보기 동안 보드 터미널 없음. 잰 값으로 그림 메모리 추정이 배율 1에서 82~162MB, 배율 2에서 185MB였던 것이 0이 되었다. 마우스 웹 화면은 캔버스 한 장 4M px 상한. PC 창은 그대로.
4. dev.3의 높이 보정·명령 바·글자·P82 다시 붙기에 되풀이 고리는 없었다.

### 사람이 iPhone으로 확인할 순서

1. PC를 이 빌드로 업데이트하고 iPhone Safari로 보드를 연다. 보드가 그대로 쓰이면 두 손가락으로 크게 해 보고, 세션 몇 개를 탭해 전체 보기를 열고 닫는다.
2. 터미널 글이 전보다 흐리거나 느리면 알려 준다(WebGL 대신 DOM으로 그린다).
3. 그래도 닫히면 Safari가 다시 열 때 가벼운 화면(목록)과 "화면이 반복해서 닫혀 가볍게 열었습니다"가 보이는지 본다. 목록에서 세션 하나를 열어 쓸 수 있는지 본다.
4. PC 창 › 설정 › 연결된 기기 › 연결 기록(또는 `atrium remote log`)에서 "화면이 닫힌 뒤 다시 열림" 줄을 본다.

### 연결 기록에서 원인을 가르는 법

- boot 줄이 있으면 페이지(WebContent)가 죽은 것이다. 없고 연결 종료(1006)만 있으면 소켓만 끊긴 것이다(P82 쪽).
- `닫히기 전=`의 픽셀(M px)과 gl이 크고 짧게(몇 초) 살았으면 캔버스 메모리다. 이 빌드에서는 휴대폰의 px·gl이 0이어야 한다. 0인데도 죽으면 캔버스가 아니다. 그때는 term 수, 받은 바이트(큰 프레임), 화면(board, full, list)을 본다.
- `hidden`이면 Safari가 뒤로 간 탭을 정리한 것이라 이 문제와 다르다.
- `dpr`이 3이 아니면 그 기기에서 본 값이 다르다. 그 줄 전체(`atrium remote log --json`)를 알려 준다.

### 고칠 문서 문장(짧게)

- ARCH 1절 원격 문단 끝 "…화면 높이로 채운다(P83)." 뒤에 "휴대폰 웹은 WebGL 없이 터미널 3개까지, 반복해서 죽으면 가벼운 화면으로 연다(P84)." 한 문장. 예산이 모자라면 같은 문단의 "(원격은 묶고 압축하되 WebKit은 압축 없이, P82)"를 "(원격은 묶고 압축, P82)"로 줄인다.
- ARCH 모듈 표: `app/src/renderer/crash-watch.js`(죽기 전 기록, 가벼운 화면), `backend/src/web-crash.mjs`는 `web*.mjs`에 든다. API 표의 `/web/*`·`device.*` 줄에 `web.boot`.
- testing.md 원격 창 시험 줄 끝: "페이지 죽음은 CDP `Page.crash` 뒤 같은 문맥의 새 페이지로 흉내 낸다(P84)."
- BRIEF, README: 고칠 문장 없음.

### 남은 것

- 진짜 iPhone에서 죽음의 원인이 캔버스 메모리였는지는 boot 줄로 확인해야 닫힌다. 흉내 Chromium은 메모리로 죽지 않는다.
- Playwright WebKit은 P82·P83에서 이 PC에서 열리지 않아 처음부터 Chromium으로 했다.
- 손가락 웹 화면의 DOM 터미널은 선명하게 그리기(P65)를 쓰지 않는다. 판 배율에서 글자가 조금 흐릴 수 있다.
