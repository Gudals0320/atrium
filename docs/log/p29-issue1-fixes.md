상태: 닫힘
날짜: 2026-11-02

## 지시

### 목표

공개 저장소 이슈 Gudals0320/atrium#1(보고자 Qualop, macOS 포팅 중 발견)의 버그 16개를 고친다. 지휘 세션이 이 저장소의 `main`(631188b, 공개 저장소 2ce4056과 소스가 같다)에서 16개 모두 재현했다. 재현 시험은 `%USERPROFILE%\AppData\Local\Temp\claude\C--Workspace-multitask\9c24478f-cdf8-4f41-be63-1bbffb78397f\scratchpad\issue1\repro.test.mjs`에 있다. 시험마다 맞는 동작을 단언하고, 지금은 16개가 모두 실패한다. 이 파일은 `file:///C:/Workspace/multitask/`(본 체크아웃)를 부르므로, 옮길 때 상대 경로로 바꾼다.

### 고칠 것과 방향

번호는 이슈의 번호다. 방향은 지휘 세션이 코드를 읽고 정한 것이다. 더 나은 길이 있으면 그렇게 하고 보고 절에 까닭을 적는다.

**전달 대기열(`backend/src/delivery.mjs`)**
1. 생성자가 `sending`을 `sent`로 복구할 때 `sentAt`이 없으면 복구 시각을 넣고 저장한다. 지금은 `pump()`의 `now - (d.sentAt || now)`가 늘 0이라 `unconfirmed`로 끝나지 않고, 그 세션의 다음 전달을 영영 막는다. `sentAt` 없는 `sent`가 다른 길로 생겨도 끝나게 한다.
2. `_deliver`의 catch에서 이미 최종 상태(`confirmed` 등)이거나 `sending`이 아니면 늦은 오류로 상태를 되돌리지 않는다. 지금은 hook으로 `confirmed`된 뒤 늦은 `unreachable`이 DB를 `queued`로 되돌리고, 메모리에는 없어 서로 어긋난다. 다시 켜면 같은 글을 또 보낼 수 있다.
3. 시도를 시작할 때 `workingSeen`을 지운다. 지금은 첫 시도(실패) 중의 working 신호가 다음 시도를 곧바로 `confirmed`로 만든다.

**대화 기록(`backend/src/transcript.mjs`)**

4. 줄바꿈으로 끝나지 않는 마지막 조각이 JSON으로 읽히지 않으면(아직 쓰는 중) `lastSeq`를 올리지 않는다. 이미 본 줄(`afterSeq` 이하)을 다시 파싱하지 않게 해서 지금의 비용을 지킨다.
5. 줄이 `null`이거나 객체가 아니면, 또 `message`나 `content` 요소가 객체가 아니면 그것만 건너뛴다. `textOf`도 같다.
6. `lastExchange`와 `userPromptsSince`(복구·확인용)는 개수 제한 없이 본다. `readMessages`는 이미 전체 목록을 만든 뒤 자르므로 비용이 늘지 않는다. 화면용 제한(`session.messages` 등)은 그대로 둔다.

**동시 요청**

7. `Backend.spawn`(`backend.mjs` 887행 근처): 이름 검사를 통과하면 바로 예약하고 끝나면 해제한다. 자동 이름도 예약된 이름을 피한다. `branch.mjs`의 `pendingNames`와 같은 방식으로 한다. 판에 올리는 이름 짓기(1357행 근처)도 예약된 이름을 피한다.
8. `Kanbans.update`(`kanban.mjs`): `await this.wsKey()` 뒤에 칸반을 읽고, 바꾸고, 저장한다(사이에 await 없음). `memos.mjs`의 update는 필드 덮어쓰기라 괜찮은지 확인만 한다.

**그 밖의 백엔드**

9. `normPath`(`workspaces.mjs`): UNC 경로(`\\Server\Share\Repo`)의 앞 `//`를 지킨다. 창도 이 파일을 그대로 쓴다. UNC 폴더를 쓰던 판의 워크스페이스 키가 바뀌는 영향은 보고 절에 적는다.
10. `ResourceMonitor`(`resources.mjs`): 첫 `setTimeout`도 저장했다가 `stop()`에서 취소한다. 멈춘 뒤 끝난 sample은 `onSample`을 부르지 않는다.
11. 같은 파일: `s.present` 조건 때문에 에이전트 없는 셸 세션이 늘 0MB다. 패널이 있으면 `processInfo`를 부른다. 실패는 지금처럼 null로 둔다.
12. `startBackend`(`client.mjs`): 자식 프로세스의 `error` 이벤트를 받아 시작 실패로 throw한다. 지금은 없는 nodePath에서 uncaught error로 프로세스(Electron main 포함)가 죽는다.
13. `ApiClient.open`(`client.mjs`): 연결 수립 제한 시간(ws의 `handshakeTimeout`, 기본 10초 안팎, 인자로 바꿀 수 있게)을 둔다.

**창(`app/src/renderer`)**

14. `api.js`: 연결 세대를 둔다. 옛 `connect()`의 늦은 `backend()` 응답과 옛 소켓의 open·message·close를 무시한다. 지금 코드에는 `connect()`가 겹쳐 불리는 길이 없지만 방어로 고친다.
15. `api.js`: 소켓이 CONNECTING에서 기한(10초 안팎) 안에 열리지 않으면 정리하고 `retry()`한다.
16. `lib/faces.js` `pickAttached`: 앞세울 노드(고른 노드, 초점 노드)를 받는 인자를 더한다. 그 노드가 보이고 가까이 얼굴이면 상한 안에 먼저 넣는다. `Canvas.jsx`의 `recompute`가 넘기고, 고름이나 초점이 바뀌면 다시 계산한다.

### 완료 기준

1. 재현 시험 16개를 저장소 시험으로 옮긴다.
   - 백엔드: `backend/test/p29.test.mjs`
   - 창: `app/test/p29-lib.test.mjs`(14~16번)
   - 고치기 전에 실패하고 고친 뒤 통과하는지 확인하고, 작업 기록에 적는다.
   - 12번은 자식 프로세스로 돌려 본다. 13번은 짧은 제한 시간을 인자로 준다.
2. `cd backend && npm test`, `cd app && npm test`, `cd app && npm run build`가 통과한다.
3. 창을 띄워 보는 시험은 꼭 하지 않아도 된다. 하려면 아래 시험 환경을 따르고, 판이 뜨는지와 셸 세션 하나 띄우기 정도만 본다.

### 시험 환경

- 시험은 가짜 전송기, 임시 폴더, 로컬 소켓만 쓴다. 실제 판, 사용자 세션, 실제 대화 기록(`~/.claude/projects`)을 읽거나 쓰지 않는다.
- 창을 띄운다면 너만의 개발용 판을 쓴다(`docs/testing.md`).
  - `ATRIUM_HERDR_SESSION=atrium-dev-p29`, `ATRIUM_PORT=47848`
  - `ATRIUM_DATA_DIR=<워크트리>/backend/.dev/data`, `ATRIUM_APP_USERDATA=<워크트리>/backend/.dev/app`
  - 대화 목록은 시험 폴더의 대화만 읽는다(`ATRIUM_CLAUDE_PROJECTS`, `ATRIUM_CLAUDE_DESKTOP=none`). 시험 폴더는 `C:\Workspace\mtask-p29-*`처럼 새로 만든다.
  - 실제 판(`atrium`, 47800)과 다른 포트(47811~47847)는 쓰지 않는다.
  - 끝나면 시험 세션, 창, 백엔드, herdr 서버와 세션, 시험 폴더를 끄고 지운다.

### 지킬 것

- `CLAUDE.md`를 따른다. 프로세스는 직접 띄운 것만 PID로 끈다.
- 고칠 곳만 고친다. 다른 동작이나 화면은 바꾸지 않는다.
- 자기 브랜치에만 커밋한다. 메시지 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. `main`을 바꾸거나 푸시하지 않는다. `node_modules`는 워크트리 안에서 받는다(`npm ci`).
- GitHub에는 아무것도 쓰지 않는다(이슈 답글, PR 포함). 보고자의 수정 코드는 공개되지 않았으니 찾거나 가져오지 않는다.
- `docs/ARCH.md`는 고치지 않는다. 바뀐 동작과 고쳐야 할 ARCH 행은 보고 절에 적는다. 문서는 이 파일의 작업 기록 절과 보고 절만 고친다.
- 끝나면 보고 절을 쓰고, 맨 마지막에 `<워크트리>/backend/.dev/p29.done`(브랜치 이름과 마지막 커밋 해시 두 줄)을 만든다.

### 읽을 파일

- `CLAUDE.md`, `docs/testing.md`
- `backend/src/delivery.mjs`, `transcript.mjs`, `kanban.mjs`, `workspaces.mjs`, `resources.mjs`, `client.mjs`, `backend.mjs`(spawn, 판에 올리기), `branch.mjs`(pendingNames)
- `app/src/renderer/api.js`, `lib/faces.js`, `Canvas.jsx`(recompute)
- 위 재현 시험 파일

## 작업 기록

- 2026-11-02 워크트리 안에서 `npm ci`(backend, app). 재현 시험을 둘로 나눠 옮겼다. 1~13번은 `backend/test/p29.test.mjs`, 14~16번은 `app/test/p29-lib.test.mjs`. 본 체크아웃을 부르던 `file:///C:/Workspace/multitask/` 경로는 상대 경로(`../src/...`, 12번 자식 프로세스는 `import.meta.url` 기준 URL)로 바꿨다.
- 고치기 전: 옮긴 시험 16개가 모두 실패했다(backend 13개, app 3개). 고친 뒤 커밋하고, `git checkout HEAD~1 -- backend/src app/src`로 옛 소스만 되돌려 최종 시험을 다시 돌려 16개 모두 실패하는 것을 확인했다. 소스는 다시 `HEAD`로 돌려 놓았다.
- 시험을 옮기며 바꾼 곳:
  - 13번: 제한 시간을 `open({ handshakeTimeoutMs: 1000 })` 인자로 준다(지시대로 짧은 기한).
  - 15번: Node의 가짜 시계는 `tick()` 한 번 안에서 새로 건 타이머를 돌리지 않는다(따로 확인함). 기한 → `retry()`(1초) → `connect()`가 이어지므로 `tick(60000)` 한 번 대신 1초씩 60번 나눠 간다. 단언(60초 안에 backend 조회 2번 이상)은 같다.
  - 14번, 15번: 시험 끝에 `api.gen++`와 타이머 정리를 더했다. 14번의 가짜 소켓은 열리지 않아 진짜 10초 기한이 돌고, 뒤 시험이 바꾼 `window.mt`로 다시 붙기를 끝없이 되풀이해 시험 파일이 끝나지 않았다.
- 고친 뒤: `cd backend && npm test` 265개 통과, `cd app && npm test` 69개 통과, `cd app && npm run build` 통과.
- 창을 띄워 보는 시험은 하지 않았다(완료 기준 3, 선택). herdr 세션, 개발용 판, 시험 폴더를 만들지 않았으므로 정리할 것이 없다.

## 보고

### 결과

이슈 #1의 16개를 모두 고쳤다. 커밋은 `worktree-p29` 브랜치 하나다. 시험 16개는 고치기 전 실패, 고친 뒤 통과를 확인했다(작업 기록).

### 고친 것

| 번호 | 파일 | 고친 내용 |
|---|---|---|
| 1 | `backend/src/delivery.mjs` | 생성자에서 `sending`→`sent`로 복구할 때, 또는 원래 `sent`인데 `sentAt`이 없으면 복구 시각을 넣고 저장한다. `pump()`도 `sentAt` 없는 `sent`를 만나면 그때부터 기한을 센다. |
| 2 | 같은 파일 | `_deliver`의 catch는 상태가 아직 `sending`이고 대기열에 남아 있을 때만 상태를 바꾼다. |
| 3 | 같은 파일 | 시도를 시작할 때 `workingSeen`을 지운다. |
| 4 | `backend/src/transcript.mjs` | 줄바꿈으로 끝나지 않은 마지막 조각이 JSON으로 읽히지 않으면 `lastSeq`에 넣지 않는다. `afterSeq` 이하 줄은 파싱하지 않는다(전에는 파싱 전에 건너뛰었으므로 비용이 같다). 마지막이 아닌 깨진 줄은 지금처럼 `lastSeq`에 넣는다. |
| 5 | 같은 파일 | 줄이 객체가 아니면(null, 수, 배열) 건너뛴다. `message`가 객체가 아니거나 `content` 요소가 객체가 아니면 그것만 건너뛴다. `textOf`도 같다. |
| 6 | 같은 파일 | `lastExchange`, `userPromptsSince`는 `limit: Infinity`로 읽는다. `session.messages`(200)와 `readMessages` 기본값(500)은 그대로다. |
| 7 | `backend/src/backend.mjs` | `spawn`이 이름 검사를 통과하면 `this.spawningNames`에 예약하고 `finally`에서 해제한다. 자동 이름(`s1`, `sh1`, `ds1`)과 판에 올리는 이름 짓기도 예약된 이름을 피한다. 예약은 `try`로 감싼 본문 전체에 걸려 들여쓰기가 바뀌었다(`git diff -w`로 보면 7줄). `spawningNames`는 처음 쓸 때 만든다(재현 시험이 생성자 없는 가짜 객체로 부르기 때문). |
| 8 | `backend/src/kanban.mjs` | `update`가 `await this.wsKey()`를 먼저 하고, 그 뒤에 칸반을 읽고, 바꾸고, 저장한다. `memos.mjs`의 `update`는 받은 필드만 덮어써 다른 요청의 변경을 지우지 않으므로 그대로 두었다(같은 필드를 동시에 바꾸면 나중 것이 이기는 것은 의도대로다). |
| 9 | `backend/src/workspaces.mjs` | `normPath`가 `//`로 시작하고 셋째 글자가 `/`가 아닌 경로(UNC)의 앞 `//`를 지킨다. 나머지 겹친 슬래시는 지금처럼 줄인다. |
| 10 | `backend/src/resources.mjs` | 첫 `setTimeout`을 `firstTimer`로 저장해 `stop()`에서 취소한다. `stop()` 뒤에 끝난 `sample()`은 `onSample`을 부르지 않는다(`last`와 반환값은 지금처럼 남긴다). |
| 11 | 같은 파일 | `present` 조건을 빼고 `paneId`가 있으면 `processInfo`를 부른다. 실패는 null이다. |
| 12 | `backend/src/client.mjs` | `startBackend`가 자식 프로세스의 `error`를 받아 두고, 기다리는 고리에서 보면 `백엔드를 띄우지 못했다(<nodePath>): <code>`로 throw한다. |
| 13 | 같은 파일 | `ApiClient.open({ handshakeTimeoutMs = 10000 })`. ws의 `handshakeTimeout`으로 넘긴다. 부르는 쪽(`connect`, `startBackend`)은 인자 없이 기본 10초를 쓴다. |
| 14 | `app/src/renderer/api.js` | `connect()`마다 세대(`gen`)를 올린다. 늦은 `backend()` 응답과 옛 소켓의 open·message·close는 무시한다. 새 소켓을 만들기 전에 옛 소켓은 처리기를 떼고 닫고(`drop`), 기다리던 요청은 `disconnected`로 끝낸다. |
| 15 | 같은 파일 | `CONNECT_TIMEOUT_MS`(10초) 안에 열리지 않고 CONNECTING이면 소켓을 정리하고, 닫힘과 같이 `closed` 상태와 `$close`를 낸 뒤 `retry()`한다. |
| 16 | `app/src/renderer/lib/faces.js`, `Canvas.jsx` | `pickAttached`에 `focus`, `selected` 인자를 더했다. 보이고 가까이 얼굴인 노드 가운데 초점 노드, 고른 노드, 나머지 순으로 놓고, 같은 무리 안에서는 거리 순이다. `recompute`가 `st.focusId`와 `st.selected`를 넘기고, 둘이 바뀌면 다시 계산한다. |

### 지시와 다르게 한 것

- 13번: 제한 시간 인자는 생성자(`info`, backend.json 내용)가 아니라 `open()`의 인자로 두었다. `info`는 백엔드가 쓴 파일 내용이라 섞지 않았다.
- 15번 시험: 위 작업 기록대로 가짜 시계를 1초씩 나눠 간다. 고치는 코드는 지시대로 `retry()`를 쓴다.

### 영향과 주의

- 9번: UNC 폴더(`\\Server\Share\...`)를 쓰던 판은 워크스페이스 키가 `/server/share/...`에서 `//server/share/...`로 바뀐다. 그 판의 옛 세션, 노드, 메모, 칸반은 옛 키에 남아 새 키의 워크스페이스와 따로 보인다. 옮기기는 하지 않았다. Windows 로컬 드라이브 경로(`C:/...`)는 바뀌지 않는다. `\\?\C:\...` 같은 장치 경로도 앞 `//`가 남는다(`//?/C:/...`). 전에는 `/?/C:/...`였다.
- 11번: 자원 감시가 에이전트 없는 셸 세션마다 `pane.process_info`를 30초에 한 번 더 부른다.
- 14번: 같은 소켓이 끊길 때 기다리던 요청을 끊김으로 끝내는 것은 전과 같다. 새 `connect()`가 옛 소켓을 대신할 때도 같게 끝낸다.
- 16번: 고른 노드가 많으면(상한 8 이상) 가운데에 가까운 고르지 않은 노드가 터미널을 놓는다.

### 고쳐야 할 ARCH 행(지휘 세션 몫)

- 4절 D1(119행): "셸 아래 프로세스의 메모리"는 에이전트 없는 셸 세션도 센다는 것을 적는다.
- 화면 얼굴(319행): "화면 가운데에 가까운 순서로 최대 8개"를 "초점 노드, 고른 노드를 먼저, 그다음 화면 가운데에 가까운 순서로 최대 8개"로 고친다.
- 전달 대기열(4절 B1): 복구한 `sent`는 복구 시각부터 확인 기한을 센다. 끝난 전달은 늦은 전송 오류로 되돌리지 않는다.
- 대화 기록(5절): 쓰는 중인 마지막 줄은 다음 읽기에서 읽는다. 복구·확인용 읽기는 개수 제한이 없다.
- 창 연결(백엔드 수명이나 화면 API 절): 소켓이 10초 안에 열리지 않으면 다시 붙는다. CLI 연결 수립 기한은 10초다.
- 경로 키: UNC 경로는 앞 `//`를 지킨다.

### 남은 것

- 창을 띄워 보는 시험은 하지 않았다.
- 7번 예약은 같은 백엔드 안의 동시 요청만 막는다. `branch.mjs`의 `pendingNames`와는 서로 보지 않는다. branch가 예약한 이름으로 `spawn`을 부르기 때문에 합치면 자기 이름에 걸린다. 그래서 따로 두었다.
