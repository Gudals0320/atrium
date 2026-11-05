상태: 닫힘
날짜: 2026-10-30

## 지시

### P6b 작업 지시: 남은 기능의 백엔드(옛 `docs/briefs/P6b.md`)

2026-10-30에 작업자 CLI 세션에 맡기려고 쓴 지시다. 이날 사용자가 남은 기능을 모두 진행하되, 백엔드는 거의 다 만들고 화면은 초기 구현까지 한 번에 한 뒤 피드백을 주겠다고 했다.

P6은 작업자 셋이 나눠 만든다(`docs/PLAN.md` 7절 P6). 너는 **P6b**다. 같은 시각에 다른 작업자가 **P6a**(단일 캔버스와 관계 표현: 창 전체와 백엔드의 배치·영역·붙여 묶기·그룹·검색)를 다른 워크트리에서 만든다. 그 일은 하지 않는다. 네가 만든 백엔드의 화면은 나중에 **P6c** 작업자가 만든다.

#### 먼저 읽을 것

- `CLAUDE.md`, `docs/BRIEF.md`(3절, 5절, 7절), `docs/PLAN.md`(4절 B1·A1, **4절 I**, 6절, 7절 P6, 8절)
- `docs/research/reference.md`의 출력 보기, Thread, 루프, 미션 맵(동작만 참고)
- `docs/P5.md`, `docs/P4.md`, 필요하면 `docs/P3.md`(OS 알림, 그룹 상한)
- `backend/` 코드와 `app/src/main/`(Electron main)

#### 할 일

PLAN 4절 I(I1~I8)의 백엔드를 만든다. **창(renderer, `app/src/renderer/`)은 손대지 않는다.** 트레이(I7)만 Electron main(`app/src/main/`)에서 한다.

- **I1 출력 보기:** `output.get { session, turn? }`(지난 턴들 포함), `output.save`(판 데이터 폴더 `outputs/<워크스페이스 이름>/`에 `.md`. 사용자 저장소에는 쓰지 않는다). 긴 답인지(약 80자 또는 세 문단 넘음)를 세션 요약에 표시. hook이 없는 세션은 화면에서 고른 답.
- **I2 Thread:** 명령 바로 보낸 글과 결과(대상, 전달 상태, 완료 보고 = 마지막 답 최대 4,000자, 버려진 전달 포함), 최근 500개. `thread.list { before?, limit }`, 이벤트 `thread.item`.
- **I3 메모 노드:** `memo.create`, `memo.update`, `memo.delete`, `memo.list`. 자리, 크기, 마크다운 글, 워크스페이스 소속.
- **I4 칸반 노드:** `kanban.create`, `kanban.update`(열·카드 추가, 옮기기, 이름 바꾸기, 세션 잇기), `kanban.delete`, `kanban.list`. 이은 카드에 세션 상태가 따라오게 요약을 준다.
- **I5 루프:** 시작 조건(주기 1분~24시간, ready가 될 때, 마지막 답이나 화면에 특정 글), 멈춤 조건(횟수, 시간, 마지막 답에 특정 글, 사람), 내 차례 건너뛰기, B1 규칙과 그룹 상한 지키기, 셸 거부, 만들 때 `confirm`, 백엔드를 다시 띄우면 이어 가기. `loop.create`, `loop.pause`, `loop.resume`, `loop.delete`, `loop.list`, 이벤트 `loop.updated`. 루프가 보낸 지시도 Thread에 남긴다.
- **I6 미션 맵:** `mission.graph`. 노드(사람, 세션, 그룹)와 선(역할, 시킴, 띄움, 명령 바 전달, 루프).
- **I7 트레이 상주:** 설정 `settings.get`, `settings.set`(판 기록). 켜면 창을 닫아도 앱이 트레이에 남아 OS 알림을 계속 띄운다. 트레이 메뉴: 열기, 내 차례 수, 끝내기. 알림을 누르면 창을 다시 열고 그 노드로 간다. 기본은 꺼짐이고, 꺼져 있으면 지금처럼 창을 닫으면 끝난다. 창 쪽 설정 화면은 P6c가 만든다. 시험은 `settings.set`으로 켠다.
- **I8 복구 확인:** herdr를 다시 띄운 뒤 셸 노드와 판에 올린 패널이 어떻게 되는지 확인하고 맞춘다(`docs/P5.md` 5절 4번). 너의 개발용 판에서만 한다.
- 모든 새 API에 `mtask` 명령을 더한다(시험 도구이자 P6c가 볼 예시).

#### 완료 기준

PLAN 7절 P6의 "P6b" 세 가지다. 개발용 판에서 실제 세션으로 확인한다. 시험할 수 없는 항목은 이유와 사람이 확인할 점검표를 남긴다.

#### 워크트리와 합치기

- 너는 Claude Code가 만든 워크트리(`.claude/worktrees/…`)에서 너만의 브랜치로 일한다. 그 브랜치에 커밋한다. 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`를 붙인다. `main`을 바꾸거나, 합치거나, 푸시하지 않는다. 다른 워크트리는 건드리지 않는다.
- 나중에 지휘 세션이 P6a와 P6b를 `main`에 합친다. 겹침을 줄이도록 새 기능은 새 모듈(예: `backend/src/loops.mjs`, `outputs.mjs`, `thread.mjs`, `memos.mjs`, `kanban.mjs`, `mission.mjs`, `settings.mjs`)에 두고, `backend.mjs`(핸들러 연결), `store.mjs`(표 만들기), `bin/mtask.mjs`, `app/src/main/main.mjs`에는 연결하는 몇 줄만 더한다. P6a도 같은 규칙으로 일한다. 저장소 스키마를 바꾸면 이전 `board.db`를 옮기는 코드(`migrate.mjs` 방식)를 함께 둔다.
- `node_modules`는 워크트리 안에서 `npm install`로 받는다. 본 저장소의 `node_modules`에 정션을 걸지 않는다.

#### 시험 환경

- **너만의 개발용 판을 쓴다.** `--dev`에 환경 변수를 더해 백엔드, `mtask`, 창 모두 같은 값을 쓴다.
  - `MTASK_HERDR_SESSION=multitask-dev-p6b`
  - `MTASK_PORT=47814`
  - `MTASK_DATA_DIR=<워크트리>/backend/.dev/data`
  - `MTASK_APP_USERDATA=<워크트리>/backend/.dev/app`
- 다른 판은 건드리지 않는다: `multitask-dev`(사용자 세션 `s1`이 있다), `multitask`(실제 판), `multitask-dev-p6a`·`multitask-dev-p6c`(다른 작업자). 포트 47800, 47811, 47812, 47813, 47815도 쓰지 않는다.
- 시험 폴더: `<워크트리>/backend/.dev/proj`(저장소 쪽), `C:\Workspace\mtask-p6b-plain`(git이 아닌 폴더, 신뢰가 물려옴). Claude Code가 신뢰 대화상자를 띄우면 수락하지 말고 다른 폴더를 쓴다. 사용자의 다른 프로젝트 폴더에서는 세션을 띄우지 않는다.
- 시험용 Claude Code 세션은 `--model haiku`, 턴은 "Reply with exactly: …" 수준으로 아주 짧게 한다. **루프 시험은 횟수를 작게(2~3회), 주기를 짧게(1분) 두고, 끝나면 루프를 모두 지운다.** 토큰을 아끼기 위해서다.
- 트레이는 Playwright의 Electron 지원으로 창을 닫은 뒤 앱 프로세스가 남는지, 알림이 뜨는지 본다. 실제 트레이 아이콘 누르기와 알림 센터 누르기는 사람 점검표로 남겨도 된다.
- 스크린숏과 로그는 `experiments/p6b/`에 둔다.
- 기존 단위 시험은 계속 통과해야 한다. 새 모듈마다 단위 시험을 더한다(루프의 조건 판정과 이어 가기는 시간 흉내로도).

#### 규칙

- `CLAUDE.md`를 따른다. 실제 판의 값으로는 띄우지 않는다.
- 신뢰 대화상자는 수락하지 않는다. 시험 에이전트의 herdr 명령에 `--session`, `--machine`, `--remote`를 쓰게 하지 않는다. herdr 소켓 API의 `pane.split`은 `target_pane_id`로 대상을 준다.
- 데스크톱 앱 세션과 기존 세션은 건드리지 않는다. 직접 띄운 프로세스만 PID로 끈다. `~/.claude/settings.json`, `~/.agents/skills`, `~/.codex`는 고치지 않는다.
- `docs/PLAN.md`, `docs/BRIEF.md`, `CLAUDE.md`는 고치지 않는다.

#### 끝낼 때

1. `docs/P6b.md`를 한국어로 쓴다: 만든 것(모듈, 스키마와 옮기기, Electron main), **API 문서**(요청, 응답, 이벤트, 오류, `mtask` 예시. P6c가 이것만 보고 화면을 만들 수 있게), 돌리는 법, 완료 기준마다의 증거, PLAN과 다르게 한 곳과 이유, 확인하지 않은 것과 알려진 문제, 사용자가 손으로 해 볼 것, P6a와 합칠 때 겹칠 만한 곳, PLAN·BRIEF·CLAUDE.md에서 바꿀 것.
2. 정리한다: 루프 지우기, 시험 세션 끄기, 창 먼저 닫기, 너의 백엔드와 herdr 서버(`multitask-dev-p6b`) 멈추기, 그 herdr 세션 지우기, `C:\Workspace\mtask-p6b-plain` 지우기. 워크트리 안의 `backend/.dev/`는 git이 무시하므로 남겨도 된다.
3. 보고와 코드, 시험, 증거를 모두 네 브랜치에 커밋한다. 작업 트리가 깨끗해야 한다.
4. **맨 마지막에** `<워크트리>/backend/.dev/p6b.done` 파일을 만든다. 내용은 브랜치 이름과 마지막 커밋 해시 두 줄이다. 지휘 세션이 이 파일을 보고 합치기를 시작하므로, 모든 일이 끝난 뒤에만 만든다.

### 지휘 세션이 정한 범위와 완료 기준(옛 `docs/PLAN.md` 7절)

2026-10-30에 정했다. 사용자 요청: 백엔드는 남은 것을 거의 모두 만들고, 화면은 초기 구현까지 한 번에 진행한 뒤 피드백을 받는다. 4절 H와 I를 만든다.

**진행 방식.** 작업자 세션(`claude --model claude-opus-5-5 --effort high`)을 Claude Code의 워크트리(`claude -w <이름>`, 저장소의 `.claude/worktrees/`)에서 띄워 나눠 만들고, 지휘 세션이 `main`에 합친다. 작업자는 자기 워크트리 브랜치에 커밋해도 되고, `main`을 바꾸거나 푸시하지 않는다. 작업자마다 따로 띄운 개발용 판(herdr 세션 이름, 포트, 데이터 폴더, 창 프로필)을 쓴다.

| 차례 | 작업 | 지시 | 맡는 곳 | 개발용 판 |
|---|---|---|---|---|
| 1차(동시) | P6a 단일 캔버스와 관계 표현(4절 H) | `docs/briefs/P6a.md` | 창 전체, 백엔드의 배치·영역·덩어리·그룹·검색·`@all` | `multitask-dev-p6a`, 47813 |
| 1차(동시) | P6b 남은 기능의 백엔드(4절 I) | `docs/briefs/P6b.md` | 백엔드 새 모듈, `mtask`, Electron main의 트레이. 창(renderer)은 손대지 않는다 | `multitask-dev-p6b`, 47814 |
| 2차 | P6c 남은 기능의 화면 초기 구현 | `docs/briefs/P6c.md` | 1차를 합친 `main` 위에서 창 | `multitask-dev-p6c`, 47815 |
| 마지막 | 합치기와 확인 | 지휘 세션 | 전체 시험, 문서, 사용자 피드백 요청 | |

1차의 두 작업은 `backend/src/backend.mjs`, `store.mjs`, `bin/mtask.mjs`, `app/src/main/main.mjs`를 함께 고칠 수 있다. 둘 다 새 기능은 새 파일(모듈)에 두고 이 파일들에는 연결하는 몇 줄만 더해 합칠 때 겹침을 줄인다.

**완료 기준(P6b)**

1. I1~I6의 백엔드 API, 저장, 이벤트, `mtask` 명령, 단위 시험. 루프는 실제 haiku 세션으로 주기·쉴 때·글 조건, 멈춤 조건, 내 차례 건너뛰기, 백엔드를 다시 띄운 뒤 이어 가기를 확인한다.
2. I7: 설정을 켜면 창을 닫아도 앱이 트레이에 남고 알림이 뜬다. 끄면 지금처럼 창을 닫으면 끝난다.
3. I8: herdr를 다시 띄운 뒤 셸 노드와 판에 올린 패널이 맞게 남거나 정리된다.

## 작업 기록

문서 규약(`docs/README.md`)을 도입하기 전(2026-10-31)의 작업이라 작업 기록을 따로 남기지 않았다. 작업하며 알아낸 것과 계획과 다르게 한 곳은 보고 절에 있다.

## 보고

### P6b. 남은 기능의 백엔드(옛 `docs/P6b.md`)

2026-10-30~31에 만들고 시험했다. 작업 지시는 `docs/briefs/P6b.md`이고, 범위는 PLAN 4절 I(I1~I8)의 백엔드, `mtask` 명령, Electron main의 트레이다. 창(renderer, `app/src/renderer/`)은 손대지 않았다. 화면은 P6c가 이 문서의 3절(API)을 보고 만든다.

**완료 기준 세 가지(PLAN 7절 P6의 "P6b")를 따로 띄운 개발용 판에서 실제 haiku 세션으로 해 보았고, 모두 됐다.** 알림 센터에서 실제로 누르기와 트레이 아이콘 누르기는 흉내만 냈다(6절).

- 시험 판: herdr 세션 `multitask-dev-p6b`, 포트 47814, 데이터 폴더 `backend/.dev/data`(이 워크트리 안), 창 프로필 `backend/.dev/app`. 백엔드, `mtask`, 창 모두 같은 값을 썼다(`experiments/p6b/tools/`). 실제 판의 값과 다른 작업자의 판(`multitask-dev`, `multitask-dev-p6a`, `multitask-dev-p6c`, 포트 47800·47811·47812·47813·47815)은 쓰지 않았다.
- 시험 세션은 CLI에서 새로 띄운 `claude --model haiku`(s1~s4, helper)와 PowerShell 셸이었다. 턴은 "Reply with exactly: …" 수준이었다. 루프 시험은 횟수 1~3회, 주기 1분으로 했고 끝나면 모두 지웠다.
- 시험 폴더: `C:\Workspace\mtask-p6b-plain`(git이 아닌 폴더, `C:/Workspace` 신뢰가 물려옴). 지시에 있던 `backend/.dev/proj`는 이 워크트리가 git 저장소라 저장소 루트(워크트리 폴더)가 신뢰되지 않아 claude에 신뢰 대화상자가 뜬다(`trust.predict`로 확인). 그래서 claude는 띄우지 않고 셸 노드에만 썼다.

시험하면서 고친 것(P5 코드):

1. **좁은 패널의 셸이 늘 "명령 실행 중"으로 보였다.** 나눈 패널은 폭이 반이라 긴 프롬프트(`PS C:\…\backend\.dev\proj>`)가 두 줄로 접혀, 끝 줄이 프롬프트로 읽히지 않았다. 셸 화면을 `visible` 대신 `recent_unwrapped`(40줄)로 읽게 했다(`backend.mjs` `pollShells`).
2. **herdr를 다시 띄우면 셸에서 돌던 명령이 흔적 없이 사라졌다.** 에이전트의 끊긴 턴처럼 셸의 끊긴 명령을 남긴다(`state.mjs` `applyHerdrDisconnected`, 복귀 요약 글 "명령: …"). 새 명령을 돌리면 내린다.

#### 1. 만든 것

##### 1.1 백엔드(`backend/`)

새 기능은 새 모듈에 두고, 원래 파일에는 연결하는 몇 줄만 더했다(8절).

| 파일 | 하는 일 |
|---|---|
| `src/features.mjs`(새) | P6b 기능을 백엔드에 붙인다(`attachFeatures`). 모듈마다 필요한 것을 넘기고, 핸들러를 모으고, 백엔드의 내부 알림(`bus`)과 전달 대기열 이벤트를 각 모듈로 보낸다. 루프 만들기의 대상 확인(셸 거부), 확인(`confirm`)도 여기 있다 |
| `src/outputs.mjs`(새) | I1 출력 보기. 긴 답 판정(`isLongAnswer`: 앞뒤 공백을 뺀 80자 초과 또는 문단 3개 초과), 대화 기록 → 턴(`turnsFromMessages`), 화면 답 → 턴, 턴 고르기, 파일 이름, 문서 글. `Outputs.get/save` |
| `src/thread.mjs`(새) | I2 Thread. 보낸 글 한 줄과 대상별 결과, 결과 단계(`resultPhase`), 줄 단계(`itemPhase`), 완료 보고(`reportOf`, 4,000자), 최근 500개. `ThreadLog` |
| `src/memos.mjs`(새) | I3 메모 노드(`Memos`). 자리를 주지 않으면 판에 있는 것들의 오른쪽 끝 너머(`placeRight`) |
| `src/kanban.mjs`(새) | I4 칸반 노드. 열·카드 바꾸기는 순수 함수 `applyKanbanOp`, 이은 카드의 세션 요약(`Kanbans`) |
| `src/loops.mjs`(새) | I5 루프. 조건 풀기(`normalizeTrigger`, `normalizeStop`, `parseDuration`), 차례 판정(`decideTarget`), 멈춤 판정(`stopReason`, `goalReached`), 확인 글(`describeLoop`), 시계를 받는 `LoopEngine`(1초마다 `tick`, 화면 글은 5초마다 읽음) |
| `src/mission.mjs`(새) | I6 미션 맵. 순수 함수 `missionGraph`(창도 같이 쓸 수 있다), `categoryOf` |
| `src/settings.mjs`(새) | I7 설정(`Settings`). 지금은 `tray` 하나(기본 꺼짐). 판 기록 meta `settings` |
| `src/store-records.mjs`(새) | 저장소의 P6b 표와 메서드. `store.mjs`가 불러 표를 만들고 `Store`에 메서드를 붙인다. SQL은 `store.mjs`와 이 파일에만 있다 |
| `src/store.mjs` | 위 파일을 부르는 3줄(불러오기, 표 만들기, 메서드 붙이기) |
| `src/backend.mjs` | 연결하는 줄: `bus`(EventEmitter), `attachFeatures` 부르기와 핸들러 더하기, 끌 때 루프 저장, 세션 요약의 `output`·`loops`, 요약을 보낼 때 `bus.emit('session')`, 세션이 빠질 때 `bus.emit('closed')`, hook 없는 세션의 턴 끝 화면 답 `bus.emit('screenAnswer')`, `session.send`의 Thread 기록과 `source`. 그리고 위 "고친 것" 1·2(셸 화면 읽기, 끊긴 명령 내리기) |
| `src/state.mjs` | 고친 것 2(셸의 끊긴 명령) |
| `src/changes.mjs` | 끊긴 셸 명령의 복귀 요약 글("명령: …") |
| `bin/mtask-features.mjs`(새) | `mtask`의 P6b 명령. `bin/mtask.mjs`에는 부르는 5줄만 더했다 |
| `test/p6b.test.mjs`(새) | 단위 시험 23개(2.3절) |

**스키마와 옮기기.** 새 표 다섯 개(`thread_items`, `thread_results`, `memos`, `kanbans`, `loops`)를 `CREATE TABLE IF NOT EXISTS`로 만든다. 원래 표는 바꾸지 않았다. 그래서 P5까지의 `board.db`를 열면 빈 새 표가 생길 뿐 옮길 것이 없다. P4 스키마 고정 자료(`test/fixtures/p4-schema.sql`)로 만든 판을 새 코드로 열어 새 표가 생기고 이전 세션이 남는지 시험했다. 설정은 meta 표의 `settings` 줄, 루프가 마지막으로 살아 있던 시각은 meta `loopsAliveAt`이다.

| 표 | 열 |
|---|---|
| `thread_items` | `seq`(정수 순번), `item_id`, `t`, `source`(bar·output·loop·mtask), `text`, `targets`(JSON), `loop_id`, `updated_at` |
| `thread_results` | `delivery_id`(전달 ID, 키), `item_id`, `session_id`, `name`, `group_id`, `status`, `reason`, `sent_at`, `confirmed_at`, `report`, `report_at`, `report_state`, `report_source`, `report_clipped` |
| `memos` | `memo_id`, `workspace_key`, `x`, `y`, `w`, `h`, `text`, `color`, 시각 |
| `kanbans` | `kanban_id`, `workspace_key`, `title`, `x`, `y`, `w`, `h`, `columns`(열과 카드 JSON), 시각 |
| `loops` | `loop_id`, `target_kind`(session·group), `target_id`, `prompt`, `trig`(JSON), `stop`(JSON), `status`, `runs`, `skips`, `elapsed_ms`, `next_at`, `last_run_at`, `stop_reason`, `per`(세션별 상태 JSON), `history`(최근 50개 JSON), 시각 |

##### 1.2 Electron main(`app/src/main/`)

| 파일 | 하는 일 |
|---|---|
| `tray.mjs`(새) | I7 트레이 상주. main이 백엔드에 따로 WebSocket으로 붙어(`events.subscribe`, `settings.get`) 설정을 따른다. 트레이 아이콘(16px 동그라미 PNG를 코드로 만든다. 내 차례가 있으면 주황), 메뉴(열기, 내 차례 N과 그 세션들, 끝내기), 창이 없는 동안의 OS 알림. 백엔드가 없으면 띄우지 않고 2초마다 다시 붙는다 |
| `main.mjs` | 연결하는 줄: `startTray`, `showNode`(창이 없으면 다시 만들고 판을 다 읽은 뒤 그 노드로), 트레이가 켜져 있으면 창을 닫아도 끝내지 않음, 다시 실행하면 창을 다시 엶, 알림 누르기를 `showNode`로 |
| `preload.cjs` | 창이 뜰 때 트레이가 띄운 알림의 열쇠를 창의 "알린 대기" 기록(localStorage `mt.notified`)에 합친다. 창이 같은 대기에 다시 알리지 않게 |

창이 없는 동안의 알림 규칙은 창(`renderer/notify.js`)과 같다. 내 차례(waiting, trust_wait)가 되고 1.2초 뒤에도 같은 대기면 띄우고, 같은 대기(열쇠 `세션|상태|tool_use_id 또는 시작 시각`)에는 한 번만 띄운다. 창이 있으면 창이 정한다. 창을 닫는 순간 이미 기다리던 대기는 창이 정한 것으로 친다. 시험은 main의 `global.__mtTray.state()`와 `global.__mtNotifications`(`source: 'tray'`)를 읽는다.

#### 2. 돌리는 법

##### 2.1 개발용 판

```sh
# 이 워크트리의 P6b 판(herdr multitask-dev-p6b, 47814, backend/.dev/data)
sh experiments/p6b/tools/mt.sh backend start
sh experiments/p6b/tools/mt.sh spawn C:/Workspace/mtask-p6b-plain --name s1 --model haiku
sh experiments/p6b/tools/h.sh pane.list            # 그 판의 herdr 소켓 API(P4 도구)
```

다른 판에서 쓸 때는 `mtask --dev`에 `MTASK_HERDR_SESSION`, `MTASK_PORT`, `MTASK_DATA_DIR`(창은 `MTASK_APP_USERDATA`도)을 준다.

##### 2.2 실제 시험(이 순서로)

```sh
cd experiments/p6b
node live-1-thread-output.mjs     # I1·I2·I3·I4 (s1)
node live-2-loops.mjs             # I5 (s1~s4, sh1). 루프를 모두 지우고 끝난다
node live-3-restart.mjs           # I5 백엔드 다시 띄우기(약 3분)
node ../../app/test/e2e/p6b-tray.mjs   # I7 (창, s3이 있어야 한다. 먼저 cd app && node scripts/build.mjs)
node live-4-i8.mjs setup && node live-4-i8.mjs restart   # I8 정상 다시 띄우기
node live-5-i8-kill.mjs           # I8 명령 중 다시 띄우기, 새 패널 직후 강제 종료
node live-6-hookless.mjs          # hook 없는 세션의 Thread 보고와 출력 보기
```

결과는 `experiments/p6b/<이름>.txt`(시험이 쓴 기록)와 `<이름>.stdout.txt`, 스크린숏 `i7-*.png`에 있다.

##### 2.3 단위 시험

`cd backend && npm test`: 76개(원래 53개 + P6b 23개) 모두 통과. `cd app && npm test`: 14개 통과. P6b 시험(`backend/test/p6b.test.mjs`)은 herdr와 claude 없이 돈다. 루프는 시계를 흉내 내 주기, 내 차례 건너뛰기, 쉴 때, 글, 목표 글, 시간, 그룹, 멈춤·이어 가기, 백엔드 다시 띄우기(정상 종료와 강제 종료 둘 다)를 본다. `attachFeatures`를 가짜 백엔드에 붙여 `loop.create`의 셸 거부와 확인, Thread 기록도 본다.

#### 3. API

판 API의 공통 규칙은 그대로다(`docs/PLAN.md` 6절). WebSocket 요청 `{ id, method, params }` → `{ id, result }` 또는 `{ id, error: { code, message } }`. 이벤트는 `events.subscribe`를 부른 클라이언트에게 `{ event, data }`로 간다. `session`·`sessionId` 자리에는 세션 ID와 이름을 둘 다 받는다. 되돌릴 수 없는 명령은 `confirm` 없이 부르면 아무것도 하지 않고 `{ needsConfirm: true, message }`를 돌려준다. 오류 코드는 `bad_request`(값이 틀림), `not_found`(없는 세션·그룹·메모·칸반·카드·열·루프·턴), `not_agent`(셸), `not_active`·`not_paused`(루프 상태)다.

##### 3.1 세션 요약에 더한 값

`session.list`, `session.get`, `session.updated`, `session.state`의 `summary`에 두 값을 더했다.

```js
output: { long: true, chars: 99 },  // 마지막 답이 긴가(앞뒤 공백을 뺀 80자 초과 또는 문단 3개 초과). long이면 노드 머리줄에 "출력 보기"
loops: 1                            // 이 세션을 대상으로 켜져 있는 루프 수(그룹 루프 포함). 노드 배지
```

##### 3.2 I1 출력 보기

**`output.get { session, turn? }`** → 고른 턴의 문서와 지난 턴 목록. `turn`은 1부터 센 번호, 음수는 뒤에서(-1이 마지막). 없으면 답이 있는 마지막 턴.

```js
{
  sessionId, name, workspaceKey, workspace: 'mtask-p6b-plain',  // 워크스페이스 이름
  source: 'transcript' | 'screen' | 'hook' | null,              // 대화 기록, hook 없는 세션의 화면 답, 둘 다 없으면 지금 든 마지막 답
  turnCount: 2,
  turn: { turn: 2, prompt: '…', promptAt, answer: '…', answerAt, tools: 1, long: true, markdown: '…' } | null,
  turns: [{ turn: 1, prompt: '앞 120자', answerHead: '앞 160자', answerAt, chars: 5, long: false }, …],
}
```

- 판이 띄운 Claude Code는 대화 기록(`~/.claude/projects/…jsonl`)에서 읽는다. 턴은 사람이 쓴 지시 하나로 시작하고(`[Request interrupted …]` 같은 표시 줄은 지시가 아니다), 답은 그 턴의 마지막 assistant 줄이다(Stop hook의 `last_assistant_message`와 같다).
- hook이 없는 세션: Claude Code면 herdr가 아는 대화 ID로 대화 기록을 찾아 본다(판에 올린 claude에서 됐다). 없으면 턴이 끝날 때 화면에서 고른 답(판 이벤트 `answer_screen`)을 턴으로 쓴다. 지시는 그 세션에 마지막으로 제출된 전달이다.
- 오류: 없는 턴 `not_found`.

**`output.save { session, turn? }`** → `{ saved: true, file, dir, turn, bytes }`. 저장 위치는 `<판 데이터 폴더>/outputs/<워크스페이스 이름>/<세션>-t<턴>-<YYYYMMDD-HHMMSS>.md`다. 워크스페이스 이름의 `/` 같은 글자는 `_`로 바꾸고, 워크스페이스가 없으면 `board`다. 사용자 저장소에는 쓰지 않는다. 문서는 머리(세션, 워크스페이스, 폴더, 끝난 시각, 출처), 지시(인용), 답이다. 판 이벤트 `output_saved`를 남긴다.

**답장:** 출력 보기에서 바로 답장은 `session.send { target: [이름], text, source: 'output' }`로 보낸다(B1 규칙 그대로). `source`는 Thread에 남는 출처다.

```sh
mtask output s1                 # 마지막 턴 문서
mtask output s1 --list          # 턴 목록
mtask output s1 --turn 1
mtask output s1 --save          # outputs/<워크스페이스>/에 .md
```

##### 3.3 I2 Thread

**`session.send`의 바뀐 점:** `source?`(기본 `bar`, 출력 보기 답장은 `output`)를 받고, 응답에 `threadItemId`를 더했다. 명령 바(`session.send`)로 보낸 글은 모두 Thread에 남는다. 연결 알림, 새 세션의 첫 지시, 묶음 실행의 지시는 남지 않는다. 루프가 보낸 지시는 `source: 'loop'`로 남는다.

**`thread.list { before?, limit? }`** → `{ items, more, before }`. `items`는 시간순(오래된 것이 앞)이다. `limit`(기본 50, 최대 500)개를 최근 것부터 고른다. 더 앞의 것이 있으면 `more: true`이고, 그때 `before`(이 쪽의 맨 앞 `seq`)를 다음 요청에 넘긴다. 최근 500개만 남는다.

```js
// Thread 줄 하나(thread.list의 items, 이벤트 thread.item)
{
  seq: 3, itemId: 't…', t, source: 'bar' | 'output' | 'loop' | 'mtask', text: '보낸 글', targets: ['@s1'], loopId: null, updatedAt,
  phase: 'active' | 'done' | 'partial' | 'failed',   // 도는 결과가 있음 | 모두 보고 있음 | 보고 없이 끝난 것이 섞임 | 보고가 하나도 없음
  results: [{
    deliveryId, sessionId, name, groupId,            // @그룹으로 보냈으면 groupId
    status: 'queued' | 'sending' | 'sent' | 'confirmed' | 'unconfirmed' | 'failed' | 'cancelled', reason, sentAt, confirmedAt,
    phase: 'delivering' | 'running' | 'done' | 'failed' | 'abandoned' | 'cancelled',  // abandoned = 15분 기다리다 버려진 전달(failed + "timeout (…)")
    report: { text: '마지막 답(최대 4,000자)', at, state: 'ready' | 'error' | 'exited' | 'closed', source: 'hook' | 'screen' | null, clipped: false } | null,
  }],
}
```

- 완료 보고: 제출 확인(hook이 없는 세션은 herdr `working`) 뒤 그 세션의 턴이 끝나 ready나 error가 되면 붙인다. error면 "오류: <종류>"와 답. 세션이 끝나면 `exited`, 판에서 빠지면 `closed`로 빈 보고를 붙인다.
- **이벤트 `thread.item`**: 줄을 만들 때와 결과가 바뀔 때마다 줄 전체(위 모양)를 보낸다. 창은 `itemId`로 바꿔 끼운다.

```sh
mtask thread [--limit 20] [--before 41]
```

##### 3.4 I3 메모 노드

| 요청 | 응답 |
|---|---|
| `memo.create { text?, x?, y?, w?, h?, color?, workspace? }` | 메모 하나. 자리를 주지 않으면 판에 있는 것(세션 노드, 그룹, 메모, 칸반)의 오른쪽 끝 + 40px, 맨 위 줄. 기본 크기 360×240, 최소 120×80, 글 20,000자까지 |
| `memo.update { memo, text?, x?, y?, w?, h?, color?, workspace? }` | 바뀐 메모. `workspace: null`이면 어느 워크스페이스에도 속하지 않음 |
| `memo.delete { memo, confirm? }` | `{ deleted, memoId }`. 글이 있는 메모는 `confirm`이 없으면 `needsConfirm`. 빈 메모는 바로 지운다 |
| `memo.list { workspace?, q? }` | 메모 배열. `q`는 글에서 찾는다(대소문자 무시) |

```js
{ memoId: 'm…', workspaceKey: 'c:/workspace/mtask-p6b-plain' | null, x, y, w, h, text: '마크다운', color: null, createdAt, updatedAt }
```

- `workspace`는 키, 이름, 그 안의 폴더 경로를 받는다(`workspace.*`와 같다). 메모가 어느 워크스페이스 영역 안에 있는지는 창(P6a 영역 계산)이 정해 넘긴다. 백엔드는 자리로 소속을 계산하지 않는다(4절 3번).
- 이벤트: `memo.updated`(메모 전체), `memo.removed { memoId }`.

```sh
mtask memo add "# 할 일\n- 리뷰" --ws mtask-p6b-plain [--x 0 --y 0]
mtask memo set m1bdd5aef51 --body "새 글" --x 100
mtask memo rm m1bdd5aef51 --yes
mtask memo [--q 리뷰]
```

##### 3.5 I4 칸반 노드

| 요청 | 응답 |
|---|---|
| `kanban.create { title?, columns?: [이름…], x?, y?, w?, h?, workspace? }` | 칸반(아래 모양). 기본 열은 할 일·하는 중·끝. 열을 하나만 주면 체크리스트(제목 기본 "체크리스트"). 기본 크기 640×360 |
| `kanban.update { kanban, title?, x?, y?, w?, h?, workspace?, op?, ops?, confirm? }` | 바뀐 칸반 + `results`(바꾸기마다 만든 ID 등). `op`는 바꾸기 하나, `ops`는 여러 개를 차례로(하나라도 틀리면 아무것도 바꾸지 않는다) |
| `kanban.delete { kanban, confirm? }` | 카드가 있으면 `confirm` 없이 `needsConfirm`. 이은 세션은 그대로 |
| `kanban.list { workspace? }` | 칸반 배열(이은 카드에 세션 요약) |

바꾸기(`op`):

| `op` | 값 | `results` |
|---|---|---|
| `addColumn` | `name`, `index?` | `columnId` |
| `renameColumn` | `column`, `name` | `columnId` |
| `moveColumn` | `column`, `index` | `columnId` |
| `removeColumn` | `column`. 카드가 있으면 `confirm` 필요. 마지막 열은 지우지 않는다 | `columnId`, `removedCards` |
| `addCard` | `column?`(없으면 첫 열), `text`, `session?`, `index?` | `cardId`, `columnId` |
| `editCard` | `card`, `text` | `cardId` |
| `moveCard` | `card`, `column?`, `index?`(같은 열 안에서 순서 바꾸기도) | `cardId`, `columnId` |
| `removeCard` | `card` | `cardId` |
| `linkCard` | `card`, `session`(이름이나 ID, `null`이면 풀기) | `cardId`, `sessionId` |

`column`은 열 ID, 열 이름, 열 번호(0부터)를 받는다. 열 이름 1~40자, 열 12개, 카드 글 1~2,000자, 카드 500개까지다.

```js
{
  kanbanId: 'b…', workspaceKey, title: 'P6b 시험', x, y, w, h, createdAt, updatedAt,
  columns: [{ columnId: 'k…', name: '할 일', createdAt, cards: [{
    cardId: 'c…', text: 's1에게 답 받기', sessionId: '…' | null, createdAt, updatedAt,
    session: {   // 이은 카드에만
      open: true, sessionId, name: 's1', kind: 'claude', state: 'ready', unseen: true, workspaceKey,
      ask: '묻는 내용 한 줄' | null, lastAnswer: '앞 160자', lastAnswerAt,
    },          // 세션이 판에서 빠졌으면 { open: false, sessionId, name, closedAt }
  }] }],
}
```

- 이은 카드의 상태가 따라 바뀌는 것은 창이 `session.updated`를 카드의 `sessionId`로 맞춰 그린다. 백엔드는 세션이 판에서 빠질 때만 그 세션을 이은 칸반에 `kanban.updated`를 보낸다. 카드를 누르면 그 세션으로 가는 것은 창의 일이다(`navigateTo(sessionId)`).
- 이벤트: `kanban.updated`(칸반 전체, 세션 요약 포함), `kanban.removed { kanbanId }`.

```sh
mtask kanban add "이번 주" [--columns 할 일,하는 중,끝] [--ws 이름]
mtask kanban card b… "리뷰 맡기기" --column "할 일" --session s1
mtask kanban move b… c… 끝
mtask kanban link b… c… s2        # '-'면 풀기
mtask kanban op b… '[{"op":"addColumn","name":"보류"},{"op":"renameColumn","column":"보류","name":"막힘"}]'
mtask kanban rm b… --yes
mtask kanban
```

##### 3.6 I5 루프

**`loop.create { session | group, prompt, trigger, stop?, confirm }`**

- `trigger`(시작 조건):
  - `{ type: 'interval', every: '1m' | everyMs, immediate?: true }`: 1분~24시간 주기. `immediate`(기본 참)면 만들자마자 한 번 보내고 그다음부터 주기마다.
  - `{ type: 'idle' }`: 대상이 ready가 될 때마다. 처음에는 지금 ready면 바로 보낸다. 그 뒤로는 루프가 보낸 뒤 새 턴이 끝나야 다시 보낸다. 같은 세션에 5초 안에 두 번 보내지 않는다.
  - `{ type: 'text', text, source?: 'answer' | 'screen' | 'any', immediate?: false }`: 마지막 답(기본)이나 화면(5초마다 읽음)에 글이 새로 나오면. 만들기 전의 답과 화면은 보지 않는다(`immediate`면 본다). 같은 답, 이미 화면에 있던 글로는 다시 보내지 않는다.
  - 시간 글: `90s`, `1m`, `1.5h`, `1d` 또는 밀리초 숫자.
- `stop`(멈춤 조건, 모두 없어도 된다): `maxRuns`(보낸 차례 수, 1~10000), `maxMs`(돈 시간: 1초~30일, 시간 글도 받음), `untilText`(루프가 보낸 뒤 끝난 턴의 마지막 답에 이 글이 있으면 목표 달성). 사람은 언제든 `loop.pause`, `loop.delete`로 멈춘다.
- 대상: `session`(이름이나 ID) 또는 `group`(이름이나 ID). 셸이면 `not_agent`. 그룹은 셸을 빼고, 에이전트 세션이 없으면 `not_found`.
- `confirm`이 없으면 만들지 않고 `{ needsConfirm: true, message }`를 돌려준다. 메시지는 대상, 지시 앞부분, 시작·멈춤 조건, 토큰을 쓴다는 것, 내 차례 건너뛰기를 적는다(예: `@s1에 "Reply with exactly: TICK"를 1분마다(지금 한 번 먼저) 보낸다. 멈춤: 2번 보내면(언제든 멈출 수 있다). 루프가 보낼 때마다 토큰을 쓴다. 내 차례인 세션은 그 차례를 건너뛴다.`).
- 응답과 `loop.list`, 이벤트 `loop.updated`의 모양:

```js
{
  loopId: 'r…', target: { kind: 'session' | 'group', id }, targetName: 's1',
  targets: [{ sessionId, name, state }],                       // 지금 대상(그룹이면 에이전트 멤버들)
  prompt, trigger: { type: 'interval', everyMs: 60000, immediate: true }, stop: { maxRuns: 2 },
  status: 'active' | 'paused' | 'done' | 'stopped',            // done: 멈춤 조건에 닿음, stopped: 대상이 없어짐
  stopReason: null | 'max_runs' | 'max_time' | 'goal_text' | 'session_closed' | 'group_deleted',
  runs: 1, skips: 0, elapsedMs: 10055, nextAt, nextInMs: 49985, lastRunAt, createdAt, updatedAt,
  per: { [sessionId]: { deliveryId, lastRunAt, firedTurnEnd, answerAtSeen, screenSeen } },
  history: [{ t, kind: 'created' | 'run' | 'skip' | 'paused' | 'resumed' | 'resumed_after_restart' | 'stopped', n?, sessions?, deliveries?, reason?, name?, sessionId?, downMs?, nextInMs? }],  // 최근 20개
}
```

- 보내기: 전달 대기열(B1 규칙)로 넣는다. 그룹 대상이면 그룹 전달이라 그룹의 동시 실행 상한을 지킨다. 대상이 working이면 대기열이 ready를 기다린다.
- 건너뛰기: 차례가 됐을 때 대상이 내 차례(waiting, trust_wait)면 그 차례를 건너뛰고 `skips`를 센다(`history`의 `reason: needs_you`). 대기열에 넣은 루프 전달이 내 차례를 만나 기다리게 되면 취소하고 건너뛴 것으로 센다. 앞 차례의 전달이 아직 대기열에 있으면 쌓지 않고 건너뛴다(`busy`). 시작 중이거나 끝난 세션은 `not_ready`.
- 주기 루프에서 그룹은 한 차례에 에이전트 멤버 모두에게 보낸다(`runs` 1). 쉴 때·글 조건은 세션마다 한 차례다.
- 횟수로 끝나면 마지막 전달은 그대로 간다. 시간·목표 글·사람으로 끝나면 아직 대기열에 있는 루프 전달을 취소한다.
- **백엔드가 꺼지면 루프도 멈춘다.** 돈 시간(`elapsedMs`)은 백엔드가 돌고 루프가 켜져 있을 때만 센다. 다시 뜨면 다음 차례(`nextAt`)를 꺼져 있던 시간만큼 뒤로 민다. 그래서 남은 횟수와 남은 시간으로 이어 가고, 꺼진 동안 지난 차례를 몰아 보내지 않는다. 강제 종료라도 5초마다 남기는 `loopsAliveAt`으로 민다. herdr에 붙어 있지 않으면 보내지 않는다(시간은 센다).
- 루프가 보낸 지시는 Thread에 `source: 'loop'`, `loopId`로 남는다.

| 요청 | 응답 |
|---|---|
| `loop.pause { loop }` | 루프. 켜진 루프만(`not_active`). 대기열에 있는 루프 전달을 취소하고, 다음 차례까지 남은 시간을 기억한다 |
| `loop.resume { loop }` | 루프. 멈춘 루프만(`not_paused`). 주기 루프는 남은 시간부터 |
| `loop.delete { loop }` | `{ deleted, loopId }`. 대기열의 루프 전달을 취소한다. 확인은 받지 않는다 |
| `loop.list { session?, group? }` | 루프 배열(끝난 것 포함). `session`을 주면 그 세션이 대상에 든 루프 |

이벤트: `loop.updated`(루프 전체, 상태·횟수·기록이 바뀔 때), `loop.removed { loopId }`.

```sh
mtask loop add @s1 "Reply with exactly: TICK" --every 1m --runs 2 --yes
mtask loop add @s2 "continue" --idle --runs 3 --until "ALL DONE" --yes
mtask loop add @s2 "Reply with exactly: GOAL" --match NEXT [--source answer|screen|any] --until GOAL --yes
mtask loop add @gl "status?" --every 10m --for 2h --yes        # 그룹
mtask loop add @s1 "…" --every 1m --no-immediate --yes         # 첫 차례도 1분 뒤
mtask loop                                                      # 목록과 최근 기록
mtask loop pause r… | mtask loop resume r… | mtask loop rm r…
```

##### 3.7 I6 미션 맵

**`mission.graph`** → 판 데이터로 만든 그래프. 저장하지 않고 부를 때마다 만든다.

```js
{
  nodes: [
    { id: 'human', kind: 'human', name: '사람(명령 바)', column: 0 },
    { id: 'g:<groupId>', kind: 'group', groupId, name, color, workspaceKey, column: 1, members: [sessionId…], counts: { working, needs_you, idle, done, exited } },
    { id: 's:<sessionId>', kind: 'session', sessionId, name, agentKind: 'claude', state, category: 'working' | 'needs_you' | 'idle' | 'done' | 'exited',
      groupId, workspaceKey, column: 0 | 2, directs: 0, ask: '묻는 내용 한 줄' | null, since, lastPrompt, loops },
  ],
  edges: [{ id, from, to, kind: 'role' | 'prompt' | 'spawn' | 'bar' | 'loop' | 'member', label, count, lastAt, active, linkId?, loopId?, status? }],
  counts: { all, working, needs_you, idle, done, exited },
  at,
}
```

- 세 열: 0 = 사람과 다른 세션에게 지시를 내리는 세션(나가는 role·prompt·spawn 선이 있음), 1 = 그룹, 2 = 세션.
- 선: `role`(판에서 정한 역할, 라벨은 역할), `prompt`(알아챈 지시, 라벨은 마지막 지시 앞부분), `spawn`(띄움), `bar`(명령 바 전달. 사람 → 세션, `@그룹`으로 보낸 것은 사람 → 그룹. 같은 대상은 한 선으로 모아 `count`와 마지막 글), `loop`(사람 → 루프 대상, `status`), `member`(그룹 → 세션). `active`는 받는 쪽이 도는 중이거나 켜진 루프다.
- 거르기(`category`)는 참고 제품과 같다. needs_you에는 error가 들고, done은 끝났지만 아직 안 본 것(검토 대기)이다.
- 실시간 갱신용 이벤트는 따로 없다. 창은 미션 맵을 여는 동안 `session.updated`, `link.updated`, `thread.item`, `loop.updated`를 받으면 다시 부른다(한 번 부르는 데 1ms 안쪽).

```sh
mtask mission
```

##### 3.8 I7 설정과 트레이

| 요청 | 응답 |
|---|---|
| `settings.get` | `{ settings: { tray: false }, schema: { tray: { type: 'boolean', default: false, label } } }` |
| `settings.set { tray: true }` 또는 `{ key: 'tray', value: true }` | `{ settings }`. 참/거짓 대신 `on`·`off`·`1`·`0`·`yes`·`no`도 받는다. 모르는 키는 `bad_request` |

이벤트: `settings.updated`(설정 전체). 창의 설정 화면은 P6c가 만든다. Electron main은 이 이벤트로 트레이를 켜고 끈다. 끌 때 창이 없으면 앱이 끝난다.

```sh
mtask settings
mtask settings set tray on
```

##### 3.9 mtask watch

`mtask watch`가 `thread.item`, `loop.updated`, `loop.removed`, `settings.updated`, `memo.updated`, `kanban.updated`도 한 줄씩 찍는다.

#### 4. 완료 기준별 증거

##### 4.1 I1~I6의 API, 저장, 이벤트, mtask, 단위 시험(완료 기준 1)

API 19개(3절), 표 5개(1.1절), 이벤트 8개(`thread.item`, `memo.updated`, `memo.removed`, `kanban.updated`, `kanban.removed`, `loop.updated`, `loop.removed`, `settings.updated`), `mtask` 명령 7개(3절 예시), 단위 시험 23개.

**I1·I2·I3·I4** (`experiments/p6b/live-1-thread-output.txt`, s1):

- "Reply with exactly: ALPHA" → Thread 줄 `phase: done`, 결과 `confirmed`, 보고 `{ text: "ALPHA", state: "ready", source: "hook" }`. 요약 `output: { long: false, chars: 5 }`.
- 99자 문장 → 요약 `output: { long: true, chars: 99 }`. `output.get`은 `source: transcript`, 턴 2개(지난 턴 포함)와 마지막 턴 문서. `turn: 1`은 "ALPHA". `output.save`는 `backend/.dev/data/outputs/mtask-p6b-plain/s1-t2-20261030-234342.md`에 머리, 지시, 답을 썼다.
- 메모: 만들기(자리를 주지 않아 760,0), 고치기, `q`로 찾기, 글이 있는 메모 지우기는 `needsConfirm`.
- 칸반: 카드 둘(하나는 s1에 이음), 이은 카드에 `session: { name: s1, state: ready, unseen: true, lastAnswer: "REPLIED" }`, 카드를 "끝"으로 옮김.
- hook이 없는 세션(`live-6-hookless.txt`): 셸 노드에 herdr로 claude를 띄우자 같은 노드가 `claude/adopted/fromShell`이 되었고, 보낸 글은 herdr `working`으로 제출 확인, 보고는 화면 답(`source: screen`)으로 붙었다. `output.get`은 herdr가 아는 대화 ID로 대화 기록을 찾아 `source: transcript`였다.

**I5 루프** (`experiments/p6b/live-2-loops.txt`, s1~s4, 그룹 gl = s3·s4):

| 확인 | 결과 |
|---|---|
| 만들 때 확인 | `confirm` 없이 → `needsConfirm`과 설명 글 |
| 셸 거부 | `@sh1` → `not_agent` |
| 주기 범위 | 30초 → `bad_request: 주기는 1분~24시간` |
| 주기(1분, 2회) | 14:46:43 첫 차례, 14:47:44 둘째 차례, `max_runs`로 끝. 돈 시간 60.8초 |
| 쉴 때(2회) | 6초 안에 두 차례(턴이 끝날 때마다), `max_runs` |
| 내 차례 건너뛰기 | s3이 Write 권한 요청 중일 때 s3 주기 루프의 첫 차례는 `skip: s3:needs_you`. 판에서 거부(`esc`)한 뒤 다음 차례(1분 뒤)에 보냄 |
| 그룹 루프 | 한 차례에 s4에게 보내고(그룹 전달), 내 차례인 s3은 `skip: needs_you@s3` |
| 답 글 + 목표 글 | "NEXT"가 답에 나오자 "GOAL"을 보냄, 답에 GOAL → `goal_text`로 끝(1차례) |
| 화면 글 | 화면에 SCREENWORD가 새로 나타나자 한 번 보냄, s2의 답 "SEEN" |
| Thread | 루프 지시 8줄이 `source: loop`와 `loopId`로 남고 보고(TICK, IDLE, GROUP, GOAL, SEEN, AFTER)가 붙음 |
| 미션 맵 | `bar`(사람 → s1, s2, s3), `loop`(사람 → 세션 5개, 사람 → 그룹 gl), `member`(gl → s3, s4) |
| 지우기 | 끝에 루프 모두 지움(0개) |

**I5 백엔드를 다시 띄운 뒤 이어 가기** (`live-3-restart.txt`): 주기 1분, 3회. 첫 차례 10초 뒤 끔(그때 `elapsedMs` 10,055, 다음 차례까지 49,985ms) → 71초 뒤 다시 띄움 → `resumed_after_restart down=70372`, 다음 차례까지 49,353ms(끄기 전 값 그대로) → 다시 띄우고 49.8초 뒤 둘째 차례, 1분 뒤 셋째 차례, `max_runs`. 마지막 `elapsedMs`는 121.8초로 꺼진 70초를 세지 않았다. 메모, 칸반, Thread(16 → 18줄)도 남았다.

**I6 미션 맵**: 실제 판(`live-2-loops.txt` 끝)과 단위 시험(역할·지시 선, 사람 → 그룹 한 번 세기, 루프 줄은 bar가 아님, 지시하는 세션은 열 0).

##### 4.2 I7 트레이(완료 기준 2)

`app/test/e2e/p6b-tray.mjs`, 기록 `experiments/p6b/i7-tray.txt`, 스크린숏 `i7-1-window-with-tray-on.png`, `i7-2-reopened-at-s3.png`.

1. 처음에는 꺼짐(`hasTray: false`). `mtask settings set tray on` → 트레이가 생기고 메뉴 `열기 / 내 차례 0 / 끝내기`.
2. 창을 닫음 → 창 0개, main 프로세스 살아 있음.
3. s3이 Write 권한 요청으로 내 차례 → 약 1.2초 뒤 main이 알림 `@s3 내 차례 / Write: C:\Workspace\mtask-p6b-plain\p6b-tray.txt`를 띄움(`show` 이벤트 옴). 메뉴 `내 차례 1 [@s3 내 차례]`, 툴팁 `multitask (dev) · 내 차례 1`. 3초 더 기다려도 알림은 1개(같은 대기에 한 번).
4. 알림 객체에 `click`을 냄 → 창이 다시 열리고 판을 읽은 뒤 초점이 s3(스크린숏: s3 노드와 승인 카드가 가운데). 창의 알림 기록에 그 대기의 열쇠가 들어가 있음(창이 다시 알리지 않음).
5. 판에서 거부로 풀고 `tray off` → 트레이 없어짐. 창을 닫자 앱이 끝남(종료 코드 0).
6. 다시 띄워 `tray on`, 창 닫기(앱 남음) → `tray off` → 앱이 끝남.

##### 4.3 I8 복구 확인(완료 기준 3)

준비(`live-4-i8.txt`): 판이 띄운 셸 sh1(proj), sh1을 나눈 빈 패널 둘(sh-w5p2, sh-w5p3, 판에 올린 셸), s4를 나눈 빈 패널 sh-w4p2, s4를 나눈 패널에 `herdr agent start`로 띄운 claude helper(판에 올린 claude, 셸 노드에서 바뀜). claude 세션 s1~s4.

**herdr 정상 다시 띄우기**(`mtask herdr restart`):

- 셸 노드 넷은 같은 패널 ID로 남고 다시 뜬 셸에서 쉼(`shell_idle`). 판이 띄운 claude s1~s4는 판의 인자로 이어 가 ready(약 6초).
- helper: herdr가 이 claude를 이어 가지 않았다(패널만 셸로 돌아옴). 같은 노드가 셸로 돌아갔다(`ready → shell_idle`, G2 규칙). 띄운 지 1분이 안 되어 herdr가 그 에이전트의 대화를 저장하지 않았을 수 있다. herdr가 이어 가면 `agent_detected`로 다시 claude 노드가 된다(P5 코드 그대로).
- 고친 것: 셸에서 돌던 `ping -n 300`이 사라진 것이 보이지 않았다 → 끊긴 명령으로 남긴다. 다시 시험(`live-5-i8-kill.txt` (1)): sh-w5p2에 `끊김(shell_running: ping -n 300 127.0.0.1)`, 복귀 요약 `interrupted @sh-w5p2 명령: ping …`.

**새 패널을 나눈 직후 herdr 서버 강제 종료**(`live-5-i8-kill.txt` (2), 직접 띄운 서버만 PID로): sh1을 나눠 새 패널 w5:p4가 판에 오른 지 약 1초 뒤 종료 → `herdr.start` → herdr가 w5:p4를 되살리지 못했다(저장 전). 판은 그 노드를 `pane gone`으로 뺐다. 나머지 셸 노드는 남았고, 돌던 명령(sh-w5p3의 ping)은 끊긴 명령으로 남았다. claude s1~s4는 이어 가 ready.

정리하면 셸 노드와 판에 올린 패널은 "패널이 남으면 같은 노드로 남고(에이전트가 없으면 셸), 패널이 없어지면 판에서 뺀다"로 맞았다. 판이 띄운 셸이 패널째로 없어지면 판은 되살리지 않는다(5절 4번).

##### 4.4 회귀

`backend` 단위 시험 76개, `app` 단위 시험 14개 통과. 창은 P6b 판에서 떠서 판을 그렸다(트레이 시험의 두 스크린숏). P3~P5 창 시험은 다시 돌리지 않았다(5절 6번).

#### 5. PLAN과 다르게 한 곳

1. **SQL을 `store.mjs` 밖의 파일(`store-records.mjs`)에도 둔다.** PLAN 5절은 SQL을 저장소 모듈 안에만 두라고 했다. 지시는 `store.mjs`에 연결하는 몇 줄만 더하라고 했다. 둘을 함께 지키려고 `store-records.mjs`를 저장소 모듈의 일부로 두고 `store.mjs`가 불러 붙이게 했다. `node:sqlite` 호출은 여전히 `Store`(`this.st`, `this.db`)를 거친다.
2. **`mtask` 명령을 `bin/mtask-features.mjs`에 따로 두었다.** 같은 이유(겹침 줄이기)다. 루프의 글 조건은 `--text`가 아니라 `--match`, 메모 글 바꾸기는 `--body`다. `--text`는 이미 `mtask screen --text`의 참/거짓 플래그다.
3. **메모·칸반의 워크스페이스 소속은 창이 넘긴다.** PLAN I3은 "워크스페이스 영역 안에 두면 그 워크스페이스 소속"이다. 영역 계산은 P6a 몫이라 백엔드는 `workspace` 값을 받기만 한다. P6a의 영역 함수가 생기면 `memo.update { x, y }` 때 백엔드가 직접 정하게 바꿀 수 있다.
4. **메모·칸반의 기본 자리는 판 오른쪽 끝 너머다.** P6a의 단일 캔버스 빈자리 함수가 아직 없어서, 겹치지 않는 가장 단순한 자리로 두었다. 창은 보통 화면 가운데를 `x`, `y`로 넘긴다.
5. **루프의 "횟수"는 보낸 차례 수다.** 주기 루프에서 그룹은 한 차례에 멤버 모두에게 보내 1로 세고, 쉴 때·글 조건은 세션마다 1로 센다. 그룹의 목표 글은 멤버 중 하나의 답에 나오면 달성이다.
6. **쉴 때 조건은 처음에 지금 ready면 바로 보낸다.** "ready가 될 때"를 글자 그대로 하면 쉬고 있는 세션에 건 루프가 시작하지 않는다. 주기 조건도 기본으로 만들자마자 한 번 보낸다(`immediate`). 글 조건은 만든 뒤에 새로 나온 것만 본다.
7. **Thread에는 `session.send`로 보낸 모든 글이 남는다.** 창의 명령 바와 `mtask send`를 가르지 않는다(`source`로 가를 수 있다). 연결 알림, 새 세션의 첫 지시, 묶음 실행 지시는 명령 바에서 보낸 글이 아니라 남기지 않는다.
8. **트레이 상주 중에는 main이 백엔드를 띄우지 않는다.** 창은 백엔드가 꺼지면 다시 띄운다. 트레이까지 그러면 개발 정리 순서(창 닫기 → 백엔드 끄기)가 트레이에 막히므로, main은 붙기만 하고 2초마다 다시 붙어 본다. 백엔드가 꺼져 있는 동안은 툴팁에 "백엔드 연결 안 됨"이 붙고 알림이 없다.
9. **셸의 끊긴 명령(I8)을 더했다.** PLAN에는 없다. 셸 노드도 herdr가 다시 뜨면 돌던 명령을 잃는데, 화면만으로는 알 수 없어서 에이전트의 "재시작으로 끊긴 턴"과 같은 값(`interruptedTurn`, `state: 'shell_running'`, `prompt`에 명령)으로 남긴다. 창은 지금 그대로 "재시작으로 끊긴 턴"으로 보인다(P6c가 셸이면 "끊긴 명령"으로 바꾸면 좋다).

#### 6. 확인하지 않은 것과 알려진 문제

1. **실제 알림 센터 누르기와 트레이 아이콘·메뉴 누르기.** 알림은 main의 알림 객체에 `click`을 내서, 메뉴는 main이 들고 있는 메뉴 글로 확인했다. Windows 알림 센터에서 실제로 눌렀을 때 창이 앞으로 오는지는 사람이 본다(7절 1번).
2. **15분 기다리다 버려진 전달의 Thread 표시**는 단위 시험으로만 봤다(실제로 15분을 기다리지 않았다).
3. **4,000자를 넘는 완료 보고**도 단위 시험으로만 봤다.
4. **판이 띄운 셸이 herdr 재시작으로 패널째 없어지면 되살리지 않는다.** 판이 띄운 claude는 P3 규칙으로 되살리지만, 셸은 잃을 것이 없어 노드를 뺀다(시험은 판에 올린 셸 w5:p4로 했다). 되살려야 하면 같은 폴더로 셸을 다시 띄우면 된다.
5. **herdr가 판에 올린 claude(helper)를 이어 가지 않았다.** 판은 그 에이전트를 이어 가지 않는다(P4 규칙). 노드는 셸로 돌아가고 이름은 helper로 남는다. 이름을 셸 이름(`sh-…`)으로 되돌릴지는 정하지 않았다.
6. **P3~P5 창 시험**은 다시 돌리지 않았다. 창(renderer)은 바꾸지 않았고, main의 바뀐 곳(알림 누르기를 `showNode`로, 다시 실행하면 창 열기)은 트레이 시험으로 지났다.
7. **화면 글 조건은 입력칸의 글도 본다.** 화면에 보이는 글을 찾으므로, 그 세션에 보낸 지시 자체에 찾는 글이 있으면 답이 나오기 전에 맞는다(시험의 SCREENWORD가 그랬다). 답만 보려면 `source: 'answer'`를 쓴다.
8. **루프 시험의 첫 시도**(`live-2-loops.txt` 앞부분)는 `echo`가 권한을 묻지 않아 내 차례가 되지 않아 멈췄다. Write 도구로 바꿔 다시 돌렸다. 시험 claude가 `p6b-skip.txt`, `p6b-tray.txt`를 만들려 했지만 거부해 파일은 생기지 않았다.
9. **시험이 남긴 것.** 시험 claude 세션의 대화 기록은 `~/.claude/projects` 아래에 남았다. 시험 폴더의 claude가 `~/.claude.json`에 프로젝트 항목을 남겼을 수 있다(판은 읽기만 했다).
10. **정리.** 루프를 모두 지우고, 시험 세션 8개(claude 4, 셸 4)를 판에서 끄고, herdr 서버(`multitask-dev-p6b`)와 백엔드를 멈추고, `herdr session delete multitask-dev-p6b`로 지우고, `C:\Workspace\mtask-p6b-plain`(비어 있었다)을 지웠다(`experiments/p6b/cleanup.txt`). 시험 창은 시험이 끝날 때 앱째로 끝났다. 정리할 때 돌던 `electron.exe`는 P6a 워크트리의 시험 창이라 건드리지 않았다. 기본 개발용 판(`multitask-dev`)과 P6a 판은 그대로다. 워크트리 안의 `backend/.dev/`(데이터, 저장한 출력, 창 프로필)는 git이 무시하므로 남겼다.

#### 7. 사용자가 손으로 해 볼 것

1. **트레이와 알림.** 창 설정이 생기기 전에는 `mtask settings set tray on`으로 켠다. 창을 닫고 트레이 아이콘이 보이는지, 세션이 내 차례가 되면 Windows 알림이 뜨는지, 알림 센터에서 누르면 창이 다시 열리고 그 노드로 가는지, 트레이 메뉴의 "내 차례"에서 세션을 고르면 그 노드로 가는지, "끝내기"로 앱이 끝나는지 본다. 끝나도 백엔드와 세션은 계속 돈다.
2. **트레이를 끈 채 창 닫기.** 지금처럼 앱이 끝나는지 본다(기본값).
3. **루프를 실제 일에.** 예: 테스트가 통과할 때까지 "다음 실패를 고쳐"를 쉴 때마다 보내고 `--until "ALL TESTS PASS"`로 멈추기. 토큰을 쓰므로 횟수나 시간 멈춤을 함께 둔다.
4. **출력 저장 위치.** `%LOCALAPPDATA%\multitask\outputs\<워크스페이스 이름>\`에 저장된 `.md`가 쓰기 좋은지 본다.

#### 8. P6a와 합칠 때 겹칠 만한 곳

| 파일 | P6b가 더한 것 | P6a와 겹칠 수 있는 것 |
|---|---|---|
| `backend/src/backend.mjs` | 불러오기 2줄, 생성자 `this.bus`, `start()`의 `attachFeatures` 2줄(전달 대기열 이벤트 블록 바로 뒤), `stop()` 1줄, `summary()` 끝 1줄, `broadcastSession` 1줄, `closeSession` 1줄, `readScreenAnswer` 1줄, `send()` 끝 3줄(`return`이 `{ deliveries, threadItemId }`로 바뀜), `pollShells` 2곳 | P6a가 `send()`의 `@all` 범위를 바꾼다(같은 함수의 앞쪽). `summary()`에 필드를 더하면 같은 줄 근처. `handlers()`는 P6b가 고치지 않았다(핸들러는 `Object.assign(this.api.handlers, …)`로 더함) |
| `backend/src/store.mjs` | 불러오기 1줄, 생성자 1줄, 파일 끝 1줄(`installRecords(Store)`) | P6a가 표나 메서드를 더하면 파일 끝이 겹칠 수 있다(한 줄이라 풀기 쉽다) |
| `backend/bin/mtask.mjs` | 불러오기 1줄, 도움말 1줄, 값 없는 플래그 목록, `default:` 1줄, `watch` 1줄 | P6a가 명령을 더하면 도움말 끝, `switch`의 `call` 근처 |
| `app/src/main/main.mjs` | 불러오기 1줄, `tray`·`showNode`(창 만들기 바로 위), 알림 누르기 1줄, `second-instance` 1줄, `whenReady` 1줄, `window-all-closed` | P6a가 main을 고친다면 같은 곳 |
| `app/src/main/preload.cjs` | 트레이 알림 열쇠 합치기 5줄 | 창에 새 IPC를 넘기면 같은 파일 |

- **검색(P6a H2)**은 메모(`store.memos()`, `Memos.list { q }`)와 출력(`Outputs.turnsOf`)도 찾아야 한다(PLAN H2 "메모"). P6a의 `search.query`에서 `store.memos()`를 부르면 된다.
- **빈자리(P6a H1)**: 메모·칸반의 기본 자리(`memos.mjs placeRight`)를 P6a의 단일 캔버스 빈자리 함수로 바꾸면 좋다. 반대로 P6a의 빈자리 계산은 메모와 칸반(`store.memos()`, `store.kanbans()`)도 차지한 자리로 봐야 새 세션이 그 위에 놓이지 않는다.
- **골라 묶는 그룹(P6a H6)**: 루프의 그룹 대상은 `groupMembers(groupId)`로 멤버를 그때그때 읽으므로 그룹 소속이 바뀌어도 따라간다. 그룹을 지우면 그 그룹 루프는 `group_deleted`로 멈춘다.
- **`board.get`**: P6b는 메모와 칸반을 `board.get`에 넣지 않았다(P6a가 고치는 함수라). 창은 `memo.list`, `kanban.list`를 따로 부른다. 합칠 때 `board.get`에 `memos`, `kanbans`를 더해도 된다.

#### 9. PLAN, BRIEF, CLAUDE.md에서 바꿀 것

이번 작업에서는 세 문서를 고치지 않았다. 아래를 제안한다.

**`docs/PLAN.md`**

- 4절 I1: 긴 답 판정(앞뒤 공백을 뺀 80자 초과 또는 문단 3개 초과), 턴 나누기(사람이 쓴 지시 하나 = 턴, 답 = 마지막 assistant 줄), hook이 없는 claude는 herdr의 대화 ID로 대화 기록을 찾고 없으면 화면 답, 저장 파일 이름 `<세션>-t<턴>-<시각>.md`, 답장은 `session.send { source: 'output' }`.
- 4절 I2: Thread에 남는 것(모든 `session.send`, 루프), 남지 않는 것(연결 알림, 첫 지시, 묶음 실행), 결과 단계(`delivering`, `running`, `done`, `failed`, `abandoned`, `cancelled`), 보고 붙이는 때(제출 확인 뒤 턴이 끝나 ready·error).
- 4절 I3·I4: 워크스페이스 소속은 창이 넘긴다(영역 계산은 H1), 지울 때 확인(글이 있는 메모, 카드가 있는 칸반·열), 칸반 바꾸기 목록(3.5절).
- 4절 I5: 차례 세기(5절 5번), 쉴 때·주기 조건의 첫 차례(5절 6번), 건너뛰기 이유(`needs_you`, `busy`, `not_ready`), 다시 띄운 뒤 이어 가기(돈 시간은 백엔드가 도는 동안만, 다음 차례는 꺼진 시간만큼 밂).
- 4절 I7: 트레이 상주 중 main은 백엔드를 띄우지 않는다(5절 8번), 창이 없는 동안의 알림 규칙은 창과 같다.
- 4절 I8: 결과(4.3절)와 셸의 끊긴 명령.
- 5절 모듈 표: "출력·Thread"는 `outputs.mjs`, `thread.mjs`, "메모·칸반"은 `memos.mjs`, `kanban.mjs`, "루프"는 `loops.mjs`, "미션 맵"은 `mission.mjs`, 그리고 `settings.mjs`, `features.mjs`(붙이기), `store-records.mjs`(저장소의 일부), Electron main `tray.mjs`. 단계 P6(P6b 끝남). "저장소" 줄의 "SQL은 이 모듈 안에만"을 "`store.mjs`와 `store-records.mjs` 안에만"으로.
- 6절 API: 3절의 `output.*`, `thread.list`, `memo.*`, `kanban.*`, `loop.*`, `mission.graph`, `settings.*`, `session.send`의 `source`와 `threadItemId`, 요약의 `output`·`loops`, 이벤트 8개를 표로 옮긴다.
- 7절 P6: P6b "끝났다"와 결과 요약(`docs/P6b.md`).
- 8절 열린 결정: 트레이 상주의 기본값(지금 꺼짐), 루프의 목표 판정 넓히기(그대로), 판이 띄운 셸이 herdr 재시작으로 없어지면 되살릴지, 셸로 돌아간 판에 올린 에이전트의 이름.

**`docs/BRIEF.md`**

- 1절 첫 문단과 5절: P6b(남은 기능의 백엔드)를 했다고 적고 `docs/P6b.md`를 가리킨다.
- 3절 "OS 알림" 줄: 트레이 상주를 켜면 창이 없어도 main이 같은 규칙으로 알린다(기본 꺼짐, `settings.set { tray }`).
- 7절 열린 질문의 트레이 항목: "P6에서 만듦, 기본값은 써 보고 정한다".
- 8절 참고 문서에 `docs/P6b.md`.

**`CLAUDE.md`**

- 첫 문단에 P6b(남은 기능의 백엔드: 출력 보기, Thread, 메모, 칸반, 루프, 미션 맵, 트레이)를 더한다.
- 더할 규칙 제안: "트레이 상주를 켠 창은 창을 닫아도 앱(Electron main)이 남는다. 시험 정리 때는 트레이 메뉴의 끝내기나 `mtask settings set tray off`로 앱을 끝낸 뒤 백엔드를 끈다." "루프 시험은 횟수를 작게, 주기를 짧게 두고 끝나면 `mtask loop rm`으로 모두 지운다."

### 지휘 세션의 합치기 기록(옛 `docs/PLAN.md` 7절)

끝났다(2026-10-31). 아래 차례대로 했다. 1차 P6a(`worktree-p6a`)와 P6b(`worktree-p6b`)를 따로 만들어 `main`에 합쳤다(충돌은 `mtask.mjs`와 `backend.mjs`의 같은 자리 덧붙임 네 곳). 합칠 때 두 작업이 서로 모른 채 둔 이음매 다섯 가지(검색의 메모·출력, 빈자리·영역의 메모·칸반, `board.get`의 메모·칸반, 셸의 끊긴 명령 표시, 트레이 설정)를 P6c 지시에 넘겼다. 2차 P6c(`worktree-p6c`)가 그것과 화면을 만들었고 다시 합쳤다. 합친 `main`에서 백엔드 단위 시험 98개, 창 단위 시험 22개가 통과하고 창이 빌드된다. 완료 기준은 작업자마다 따로 띄운 개발용 판에서 실제 haiku 세션으로 모두 확인했다(`docs/P6a.md` 3절, `docs/P6b.md` 4절, `docs/P6c.md` 3절). 실제 알림 센터·트레이 아이콘 누르기, 한글 IME, P2~P5 창 시험 대부분은 다시 보지 않았다. 사용자 피드백을 기다린다.
