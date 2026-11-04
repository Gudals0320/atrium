상태: 닫힘
날짜: 2026-10-29

## 지시

### 지휘 세션이 정한 범위와 완료 기준(옛 `docs/PLAN.md` 7절)

5절에서 P1으로 표시한 모듈을 만든다. 완료 기준은 `mtask` CLI만으로 아래를 할 수 있는 것이다.

1. 판 전용 herdr 세션을 깨끗한 환경으로 띄우고 버전을 확인한다.
2. 세션 4개를 시작한다.
3. 상태 변화를 실시간으로 본다.
4. 권한 요청이 뜨면 waiting과 그 내용을 본다.
5. `@이름`으로 보낸 글이 제출되고, 제출 확인을 받는다. 막힌 세션에 보낸 글은 대기열에 남았다가 풀리면 간다.
6. 턴이 끝나면 마지막 답을 읽는다.
7. 제어기로 한 세션의 화면 프레임을 받는다.
8. 백엔드를 껐다 켜도 세션이 그대로이고, 상태를 다시 맞춘다.
9. 판이 띄운 세션만 끈다.
10. 판 전용 herdr 서버를 다시 띄워도 세션이 이어지고, 그 세션의 hook이 토큰과 함께 다시 온다(4절 C3).
11. 처음 쓰는 폴더에서 시작한 세션이 trust_wait로 보이고, 권한 요청의 waiting과 구분된다.

## 작업 기록

문서 규약(`docs/README.md`)을 도입하기 전(2026-10-31)의 작업이라 작업 기록을 따로 남기지 않았다. 작업하며 알아낸 것과 계획과 다르게 한 곳은 보고 절에 있다.

## 보고

### P1. 화면 없는 백엔드와 시험용 CLI `mtask`(옛 `docs/P1.md`)

2026-10-29에 만들고 시험했다. 결론부터 적으면 **PLAN 7절 P1 완료 기준 11개를 `mtask`만으로 모두 확인했다.** 실제 `claude` 세션(Claude Code 2.1.312, herdr 0.9.5)으로 했고, 개발용 herdr 세션 `multitask-dev`, 개발용 포트 47811, 개발용 데이터 폴더를 썼다. 실제 판의 값(세션 `multitask`, 포트 47800, `%LOCALAPPDATA%\multitask`)과는 겹치지 않는다. 시작 전 결정 하나(E8)는 `node:sqlite`로 정했다(`docs/experiments/E8.md`).

만들면서 PLAN과 크게 다르게 한 것이 넷 있다. 다른 점마다 실제 동작으로 확인했다.

1. **`resume_argv`는 `agent.start` 직후가 아니라 세션이 ready가 된 뒤에 등록한다.** 직후에는 herdr가 거부하고, 받아들인 등록은 신뢰 대화상자 신호 하나(E10의 "`agent_session` 없음")를 지운다.
2. **신뢰 예상은 git 저장소 루트에서 멈춘다.** 신뢰한 폴더 아래라도 따로 `git init`한 폴더에서는 대화상자가 떴다.
3. **신뢰 대화상자 확인에 화면 글자("Quick safety check")를 주 신호로 쓴다.**
4. **한 턴도 돌지 않은 세션은 herdr 재시작 뒤 이어 가기가 실패한다**(`No conversation found with session ID`). 백엔드가 같은 세션 ID와 설정 파일로 새로 띄운다.

자세한 내용은 5절에 있다.

#### 1. 만든 것

새 최상위 폴더 `backend/`에 두었다. Node 24의 JavaScript(ESM)이고, 의존성은 WebSocket 서버용 `ws` 하나다. SQLite는 Node 내장 `node:sqlite`를 쓴다(E8). 빌드 단계는 없다.

| 파일 | PLAN 5절 모듈 | 하는 일 |
|---|---|---|
| `src/herdr/adapter.mjs` | herdr 어댑터, 화면 중계의 제어기 | herdr 호출은 모두 이 파일 안에 있다. 이름 있는 세션 서버를 깨끗한 환경으로 띄우고 끈다. `ping`으로 버전 0.9.5, 프로토콜 22, `capabilities`를 확인한다. 요청마다 연결하고, `events.subscribe`를 열어 둔 채 끊기면 다시 붙는다. 살아 있는 패널만 구독한다. 제어기(`terminal session control`) 자식 프로세스를 띄우고 `session.json`의 `agent_resume`을 읽는다(읽기만 한다) |
| `src/launch.mjs` | 실행 계획 | 세션 설정 파일(http hook, 토큰과 세션 ID를 값으로, 시간 제한 2초), `--session-id`, `--settings`, `--no-chrome`, 권한 모드, 모델, `resume_argv`, 신뢰 예상(상위 폴더, git 루트) |
| `src/backend.mjs`의 `onHook` | hook 수신기 | `POST /hooks/claude`. 먼저 200을 돌려주고 처리한다. 본문 상한 8MB. 세션별 토큰을 확인한다 |
| `src/state.mjs` | 상태 계산기 | 3절의 일곱 상태와 검토 대기, 조용함, 전달 중 표시. 순수 함수라 단위 시험이 있다 |
| `src/relay.mjs` | 화면 중계 | 세션마다 제어기 하나. 프레임을 붙은 API 클라이언트로 넘기고 입력과 크기 조정을 제어기로 넘긴다 |
| `src/screen.mjs` | 화면 요약 | `pane.read` 글자에서 마지막 줄, 권한 요청 선택지, 질문 줄, 신뢰 대화상자를 읽는다 |
| `src/transcript.mjs` | 대화 기록 읽기 | JSONL을 지시, 답, 도구 사용, 도구 결과 목록으로 바꾼다(줄 번호가 seq). `<pasted_content>`를 벗긴다. C2에서 놓친 답을 메운다 |
| `src/delivery.mjs` | 전달 대기열 | 4절 B1 규칙, 제출 확인, 취소. 세션마다 하나씩 보내고 다른 세션은 막지 않는다 |
| `src/store.mjs` | 저장소 | SQLite(WAL, STRICT 표): 세션과 패널 연결, 판 배치, 그룹, 이벤트, 전달, 봤음, 백엔드 심장 박동 |
| `src/api.mjs` | API 서버 | `ws://127.0.0.1:<포트>/api?token=…`. 요청과 응답, 이벤트 방송 |
| `src/git.mjs` | git 조사 | 루트, 브랜치, 바뀐 파일 수, `git diff --stat` 마지막 줄 |
| `src/config.mjs` | (설정) | 실제 판과 개발용 프로필 |
| `bin/mtask.mjs` | 시험용 CLI | API만 부르는 얇은 클라이언트 |
| `test/unit.test.mjs` | | 단위 시험 18개 |

P2로 미룬 모듈은 "답하기"(`session.answer`)이고, P3 모듈은 만들지 않았다. P3의 C3 "재시작으로 끊긴 턴" 표시는 값이 싸서 표시만 넣었다(5절 7).

시험에 쓴 스크립트 결과와 실시간 로그는 `experiments/p1/`에 두었다(`watch-1~5.txt` 등). `.log` 확장자는 저장소에서 무시하므로 `.txt`로 바꿨다.

#### 2. 돌리는 법

```
cd backend
npm install
node bin/mtask.mjs --dev backend start     # 백엔드를 띄운다. 판 전용 herdr 서버가 없으면 깨끗한 환경으로 띄운다
node bin/mtask.mjs --dev status            # 백엔드, herdr 버전·프로토콜·capabilities
node bin/mtask.mjs --dev spawn .dev/proj --name a --model haiku --prompt "Reply with exactly: ok"
node bin/mtask.mjs --dev watch             # 상태, hook, 전달을 실시간으로(다른 창에서)
node bin/mtask.mjs --dev send @a @b "글" --wait
node bin/mtask.mjs --dev ls | inbox | get a | last a | messages a | screen a --text | attach a
node bin/mtask.mjs --dev kill a --yes
node bin/mtask.mjs --dev herdr restart --yes
node bin/mtask.mjs --dev herdr stop --yes
node bin/mtask.mjs --dev backend stop
npm test                                   # 단위 시험
```

전체 명령은 `node bin/mtask.mjs help`에 있다. 끄기와 herdr 서버 끄기·다시 띄우기는 `--yes`가 없으면 확인 문구만 보여주고 아무것도 하지 않는다(BRIEF 4절 "마지막 Enter는 사람이 누른다").

**설정.** `--dev`(또는 `MTASK_PROFILE=dev`)가 개발용 프로필을 고른다. 환경 변수가 프로필 기본값을 덮는다.

| 항목 | 실제 판(기본) | 개발용(`--dev`) | 환경 변수 |
|---|---|---|---|
| herdr 세션 이름 | `multitask` | `multitask-dev` | `MTASK_HERDR_SESSION` |
| 백엔드 포트 | 47800 | 47811 | `MTASK_PORT` |
| 데이터 폴더 | `%LOCALAPPDATA%\multitask` | `backend/.dev/data` | `MTASK_DATA_DIR` |

- 개발용 프로필이 실제 판의 세션 이름이나 데이터 폴더를 가리키면 시작하지 않는다. 이름 없는 기본 herdr 세션은 아예 받지 않는다.
- 데이터 폴더에는 `board.db`, `backend.json`(pid, 포트, API 토큰), `sessions/<세션 ID>.json`(세션 설정 파일), `logs/`가 생긴다.
- `backend/.dev/`는 저장소에서 무시한다(`.gitignore`에 더했다). 시험 프로젝트 폴더 `backend/.dev/proj`도 여기 있다.
- 포트는 고정이다. 이미 띄운 세션의 설정 파일 안에 hook 주소가 있기 때문이다(PLAN 1절).

**시험 세션.** 사용량을 아끼려고 시험 세션은 `--model haiku`로 띄웠고, 턴은 "Reply with exactly: …" 한 줄이나 작은 파일 쓰기 요청으로만 돌렸다. 일을 맡기는 작업자 세션이 아니므로 CLAUDE.md의 Opus 5.5 high 규칙은 해당하지 않는다.

#### 3. 완료 기준별 증거

시각은 UTC다(`mtask watch` 출력). 로그 원본은 `experiments/p1/`에 있다.

##### 1. 판 전용 herdr 세션을 깨끗한 환경으로 띄우고 버전을 확인한다

```
$ mtask --dev backend start   → started: true, herdr: { session: 'multitask-dev', running: true, connected: true, compat: { ok: true, version: '0.9.5', protocol: 22 } }
$ mtask --dev status
herdr 세션=multitask-dev 실행=true 연결=true 서버 pid=45228 CLI=herdr 0.9.5
  version=0.9.5 protocol=22 호환=true
  capabilities={"live_handoff":false,"detached_server_daemon":true,"endpoint_protocol_generation":1,"surface_interest":true,"health_check":true,"ssh_agent_registration":false}
```

- 백엔드는 herdr 서버가 없을 때 `herdr --session multitask-dev server`를 `CLAUDECODE`, `CLAUDE_CODE_*`, `CLAUDE_PID`, `CLAUDE_EFFORT`, `CLAUDE_AGENT_SDK_*`, `HERDR_*`, `MTASK_*`를 뺀 환경으로 띄운다. 이 시험은 Claude Code 세션 안에서 돌렸으므로 부모 변수가 실제로 있었다.
- 깨끗한지 확인하려고 판이 띄우지 않은 셸 패널을 같은 herdr 세션에 하나 만들어 출력했다. `CLAUDECODE=[] CHILD=[] ENTRY=[] MTASK=[]`가 나왔다. 판이 띄운 claude의 대화 기록도 정상으로 저장됐다(`CLAUDE_CODE_CHILD_SESSION`이 새면 저장이 꺼진다, E1 3.2).
- `ping`의 버전이나 프로토콜이 다르면 이벤트 구독을 시작하지 않고, `session.spawn` 같은 명령은 `herdr_incompatible`로 거부한다.

##### 2. 세션 4개를 시작한다

```
$ mtask --dev spawn .dev/proj --name a --model haiku --prompt "Reply with exactly: alpha-ok"   (b, c, d는 prompt 없이)
시작: a (7630e855-…) 패널 w6:p1
  신뢰 대화상자 예상: 안 뜬다(신뢰한 폴더 C:/Workspace/multitask)
  실행: claude --session-id 7630e855-… --no-chrome --permission-mode manual --settings C:/Workspace/multitask/backend/.dev/data/sessions/7630e855-….json --model haiku
  이어 가기 등록: claude --resume 7630e855-… --no-chrome --permission-mode manual --settings …/7630e855-….json --model haiku
$ mtask --dev ls
a        ready       herdr=idle     w6:p1 [검토대기]
         ↳ 마지막 답: alpha-ok
b        ready       herdr=idle     w7:p1
c        ready       herdr=idle     w8:p1
d        ready       herdr=idle     w9:p1
```

- 시작부터 ready(첫 herdr `idle`)까지 4.2~5.2초였다.
- 첫 지시는 대기열에 들어가 `queued(starting)`로 기다리다가 ready가 되자 나갔다(B3 5번). `11:38:52.886 queued` → `11:38:56.672 a starting → ready`, `sending` → `11:38:57.289 confirmed`.
- `resume_argv` 등록: 이 네 세션을 띄울 때의 코드는 시작 중(약 1.5초 뒤)에 등록했고, 6~10초 뒤 `session.json`의 `agent_resume`으로 저장된 것을 확인했다(`experiments/p1/session-json-before.txt`). 그 뒤 등록 시점을 ready 뒤로 바꿨다(5절 1). 바꾼 코드로 띄운 세션 `r`은 ready 0.3초 뒤 등록, 그 6초 뒤 확인됐다(`11:50:53.534 starting → ready`, `11:50:53.859 resume_registered`, `11:50:59.886 resume_verified`).
- 판 배치에는 새 노드를 겹치지 않는 빈자리에 두었다(`board.get`: `0,0`, `760,0`, `1520,0` 크기 720×460).

##### 3. 상태 변화를 실시간으로 본다

`mtask watch`가 `events.subscribe`로 상태 변화, hook, 전달을 받아 찍는다. `experiments/p1/watch-2.txt` 일부:

```
11:38:56.672 a        starting → ready  (herdr:idle)
11:38:57.289 a          hook UserPromptSubmit auth=true prompt="Reply with exactly: alpha-ok"
11:38:57.305 a        ready → working  (herdr:working)
11:38:58.415 a          hook Stop auth=true 답="alpha-ok"
11:38:58.540 a        working → ready  (herdr:idle)
11:39:16.308 b          hook PermissionRequest(Write) auth=true  권한 요청 Write: C:\…\.dev\proj\perm-test.txt
11:39:16.309 b        working → waiting  (hook:PermissionRequest)
11:39:40.297 b        waiting → ready  (herdr:done)
```

모든 상태 변화와 hook은 SQLite `events` 표에도 남는다(`mtask events <이름>`).

##### 4. 권한 요청이 뜨면 waiting과 그 내용을 본다

```
$ mtask --dev send @b "Use the Write tool to create perm-test.txt containing hi. Use no other tool."
$ mtask --dev inbox
내 차례 1
  b        waiting     herdr=blocked  w7:p1
           ↳ 권한 요청 Write: C:\Workspace\multitask\backend\.dev\proj\perm-test.txt — "Do you want to create perm-test.txt?"
             선택지: 1.Yes | 2.Yes, and switch to accept edits (auto-approve file edits and common file commands) for this session (shift+tab) | 3.No (기다린 9.3s)
```

- 도구 이름과 파일은 hook(`PreToolUse`, `PermissionRequest`)에서 왔다. 질문 줄과 선택지 3개는 화면(`pane.read { source: "detection" }`)에서 읽었다(A1, E9).
- hook이 herdr `blocked`보다 먼저 와서, 그 사이에는 waiting에 추정 표시(`hook waiting, herdr working`)가 붙는다. herdr가 `blocked`를 주면 추정 표시가 없어진다.

##### 5. `@이름`으로 보낸 글이 제출되고 확인을 받는다. 막힌 세션에 보낸 글은 대기열에 남았다가 풀리면 간다

`b`가 위 권한 요청에서 막혀 있을 때 보냈다. 막힘은 사용자가 터미널에서 푸는 것처럼 제어기로 `esc`를 넣어 풀었다(`mtask input b '\e'`). `experiments/p1/send-blocked.txt`:

```
11:39:34.280 전달 b d5da778e35a queued
               (5초 뒤 deliveries: queued  waiting)
11:39:40.298 전달 b d5da778e35a queued(user_typing)     ← 터미널 입력 뒤 3초 기다린다(B1 규칙 4)
11:39:43.056 전달 b d5da778e35a sending
11:39:43.368 전달 b d5da778e35a sent
11:39:43.402 전달 b d5da778e35a confirmed               ← hook UserPromptSubmit의 prompt가 보낸 글과 맞음
```

- 막히지 않은 세션에서는 넣고 확인까지 약 0.38초였다(`agent.prompt` 응답 약 0.32초 + hook).
- 여러 대상: `mtask send @c @d "<5줄 글>"`은 두 세션에 따로 들어가 둘 다 확인됐다. 이 글은 4줄 이상이라 Claude Code가 `<pasted_content id="…">`로 감쌌고(대화 기록에서 확인), 감싸기를 벗기는 비교로 확인됐다. 모델은 감싼 글 안의 지시대로 `multi-ok`로 답했다(BRIEF 7절 열린 질문의 자료 하나).
- 취소: 신뢰 대화상자 때문에 `queued(trust_wait)`로 기다리던 전달을 `mtask cancel <ID>`로 취소했다(`cancelled(user)`).

##### 6. 턴이 끝나면 마지막 답을 읽는다

```
$ mtask --dev last b
b 마지막 답 (오후 8:39:44):
queued-ok
$ mtask --dev last c
c 마지막 답 (오후 8:40:08):
multi-ok
```

`Stop` hook의 `last_assistant_message`를 쓴다. `mtask messages c`는 대화 기록을 지시, 답, 도구 사용 목록으로 보여준다(`#5 user …`, `#30 assistant multi-ok`). `mtask get`에는 턴 시작·끝 시각, git 조사 결과(`root: C:/Workspace/multitask, branch: main, changedFiles: 5`), 화면 마지막 줄도 나온다.

##### 7. 제어기로 한 세션의 화면 프레임을 받는다

```
$ mtask --dev attach c --cols 100 --rows 30 --seconds 2
11:41:08.457 붙음: 제어기 pid=39072 패널 w8:p1 100x30
11:41:08.475 frame seq=1 full=true 100x30 5867B
--- 받은 프레임을 쌓아 그린 화면(대충) ---
 ▐▛███▛█   Claude Code v2.1.312
▝▜██████▀  Haiku 5.5 · Claude Max
 ▝▝   ▝▝   C:\Workspace\multitask\backend\.dev\proj
❯ Instruction: reply with exactly the word multi-ok and nothing else.
  line two … line five
● multi-ok
✻ Cooked for 2s · done 오 후  8:40
❯
  ⏸ manual mode on · ? for shortcuts
11:41:11.088 놓임: detach
```

- 첫 프레임이 전체 화면이다(E0, E4와 같다). 입력도 같은 통로로 갔다. 5번과 11번의 `esc`는 `terminal.input`으로 넣었다.
- "대충 그린 화면"은 `mtask`가 확인용으로 커서 위치만 따라 그린 것이다. 실제 화면은 P2에서 xterm.js가 그린다.

##### 8. 백엔드를 껐다 켜도 세션이 그대로이고 상태를 다시 맞춘다

`a`에 글을 보내고 0.8초 뒤 백엔드를 껐다. 턴은 백엔드가 꺼진 동안 끝났고, 화면에 `Stop hook error: connect ECONNREFUSED 127.0.0.1:47811`이 찍혔다(E2 2.3과 같다). 다시 켠 뒤:

```
$ mtask --dev status
  이전 실행: 정상 종료, 꺼져 있던 시간 14.8초(그동안 세션 화면에 hook 연결 오류 글이 찍혔을 수 있다)
$ mtask --dev ls
a        ready       herdr=idle     w6:p1 [검토대기]
         ↳ 마지막 답: while-backend-down
b, c, d  ready …
$ mtask --dev events a
11:41:40.288 state                {"from":"ready","to":"working",…}            ← 끄기 전 마지막 상태
11:41:55.872 recovered_from_transcript {"lastAnswer":"while-backend-down"}     ← 놓친 Stop hook을 대화 기록에서 메움
11:41:55.872 state                {"from":null,"to":"ready","cause":"resync:herdr connected"}
```

- 세션 목록은 SQLite에서 읽고, 상태는 herdr `agent.list`와 `session.snapshot`으로 맞췄다(C2).
- 백엔드 PID만 `taskkill /F`로 강제 종료한 경우도 봤다. 다시 켜자 "비정상 종료, 꺼져 있던 시간 4.2초"로 나왔고 세션 4개가 그대로 ready였다. 꺼진 백엔드의 `backend.json`이 남아 있어도 PID가 죽어 있으면 새로 뜬다.

##### 9. 판이 띄운 세션만 끈다

같은 herdr 세션에 판이 띄우지 않은 셸 작업 공간(`wC`, 이름 `foreign`)을 herdr CLI로 직접 만들어 두고 시험했다.

```
$ mtask --dev kill foreign --yes   → mtask: not_found: 판에 없는 세션: foreign
$ mtask --dev kill wC:p1 --yes     → mtask: not_found: 판에 없는 세션: wC:p1
$ mtask --dev kill d               → 확인 필요: d 세션의 claude를 끄고 패널을 닫는다. 대화 기록은 남는다. 계속하려면 --yes
$ mtask --dev kill d --yes
{ closed: true, name: 'd', exit: { kind: 'normal', reason: 'prompt_input_exit' }, steps: [ '/exit', 'claude exited in 1009ms', 'workspace w9 closed' ] }
herdr 작업 공간: w6(a) w7(b) w8(c) wC(foreign)
```

- `d`의 claude(PID 42352)만 끝났고 `a`, `b`, `c`의 claude(26404, 30888, 30704)는 살아 있었다. 시험 전부터 돌던 `claude.exe` 25개(데스크톱 앱 등)도 모두 살아 있었다.
- `d`의 세션 설정 파일을 지웠다(B3, D2).
- 끄는 순서: waiting, trust_wait, working이면 먼저 `esc`, 그다음 `/exit`(글과 Enter를 따로 넣는다), claude가 끝나기를 최대 10초 기다린 뒤 `workspace.close`. 프로세스를 이름으로 끄지 않는다.

##### 10. 판 전용 herdr 서버를 다시 띄워도 세션이 이어지고, 그 세션의 hook이 토큰과 함께 다시 온다

다시 띄우기 전에 `session.json`에 네 세션의 `agent_resume`이 `--settings`를 포함해 저장된 것을 확인했고, `b`를 권한 요청에서 기다리게 했다. `experiments/p1/watch-3.txt`:

```
$ mtask --dev herdr restart        → 확인 필요: 판 전용 herdr 서버를 끄면 그 안의 claude가 모두 끝난다. 다시 띄우면 … 진행 중이던 턴은 끊긴다.
$ mtask --dev herdr restart --yes
11:42:40.236 a          hook SessionEnd auth=true reason=other          (b, c, d도)
11:42:42.404 b        waiting → exited  (herdr:disconnected)  {"kind":"herdr_stopped","reason":"other"}
11:42:43.421 herdr 연결됨
11:42:48.078 a        starting → ready  (herdr:idle)                    (b, c, d도 5초 안팎)
$ mtask --dev send @a @b "Reply with exactly: resumed-ok" --wait
11:43:05.853 b          hook UserPromptSubmit auth=true prompt="Reply with exactly: resumed-ok"
11:43:05.943 a          hook UserPromptSubmit auth=true …
11:43:06.762 a          hook Stop auth=true 답="resumed-ok"
```

- 다시 뜬 claude의 명령줄(`pane process-info`): `--resume 7630e855-… --no-chrome --permission-mode manual --settings C:/…/sessions/7630e855-….json --model haiku`. 등록한 `resume_argv`가 그대로 쓰였다(`experiments/p1/argv-after-restart.txt`).
- 다시 뜬 뒤 hook이 모두 `auth=true`였다. E7에서는 작업 공간 `env`로 넘긴 토큰이 되살아나지 않아 헤더가 비었다. 이번에는 토큰을 설정 파일 안에 값으로 두어 그 문제가 없다.
- 패널 ID(`w6:p1` …)와 세션 ID로 노드를 다시 찾았다.
- 권한 요청에서 기다리던 `b`에는 "재시작으로 끊긴 턴" 표시가 붙었다. 대화 기록에는 `tool_result: [Tool call interrupted: the session ended before this call's result was recorded, …]`로 남았다.
- **한 턴도 돌지 않은 세션.** 지시 없이 띄운 세션 `r2`는 herdr를 다시 띄우자 이어 가지 못했다. 패널에 `claude --resume 256cd11b-… --settings …`가 실행된 뒤 `No conversation found with session ID: 256cd11b-…`가 찍히고 셸로 돌아왔다(`experiments/p1/resume-empty-session.txt`). 대화 기록 파일이 아직 없기 때문이다. 고친 뒤 같은 시험(`r3`, `experiments/p1/watch-6.txt`):

  ```
  11:53:07.219 r3       ready → exited  (herdr:disconnected)  {"kind":"herdr_stopped"}
  11:53:08.329 r3       exited → starting  (resync:herdr connected)
  11:53:10.651 r3       starting → exited  (herdr:agent_released)        ← --resume 실패
  11:53:11.177 r3       exited → starting  (relaunch)                    ← 같은 --session-id, 같은 --settings로 새로 띄움
  11:53:14.977 r3       starting → ready  (herdr:idle)
  11:53:15.190 resume_registered, 11:53:17.193 resume_verified
  ```

##### 11. 처음 쓰는 폴더에서 시작한 세션이 trust_wait로 보이고, 권한 요청의 waiting과 구분된다

시스템 임시 폴더 아래에 새 폴더를 만들어 썼다. 비교하려고 `d`를 권한 요청에서 기다리게 해 두었다.

```
새 폴더: %USERPROFILE%\AppData\Local\Temp\mtask-trust-1793274262745
$ mtask --dev trust <폴더>  → { needsTrust: true, trustedBy: null }
$ mtask --dev spawn <폴더> --name e --model haiku --prompt "Reply with exactly: should-not-be-sent"
$ mtask --dev inbox
내 차례 2
  e        trust_wait  herdr=blocked  wA:p1 [전달1]
           ↳ 신뢰 대화상자 대기(예상 뜸, 화면 확인 됨). 터미널에서 답하기
  d        waiting     herdr=blocked  w9:p1
           ↳ 권한 요청 Write: …\trust-compare.txt — "Do you want to create trust-compare.txt?"  선택지: 1.Yes | 2.… | 3.No
$ mtask --dev screen e --text
 Quick safety check: Is this a project you created or one you trust? …
 ❯ No, exit
   Yes, I trust this folder
 Enter to confirm · Esc to cancel
```

- 둘 다 herdr 상태는 `blocked`이지만, `e`는 묻는 hook이 없고 화면에 "Quick safety check"가 있어 trust_wait, `d`는 `PermissionRequest` hook이 있어 waiting이다.
- `e`의 첫 지시는 `queued(trust_wait)`로 남았고 보내지 않았다(B1 규칙 3). 그 전달을 취소했다.
- 제어기로 `esc`를 넣어 나갔다. 신뢰는 누르지 않았다. 결과는 `trust_wait → exited`, `{"kind":"trust_declined"}`("신뢰하지 않아 끝남")였고, `~/.claude.json`의 `projects`에 그 폴더 키가 생기지 않았다. 폴더는 지웠다.
- 등록 시점을 고친 뒤(5절 1) 새 폴더 하나로 다시 해 보았다. 이때 `agent.get`은 `launch_pending: true`, `agent_session: null`이었다(E10과 같다). 이번에도 `mtask kill`이 `esc`로 나갔고 `trust_declined`가 됐다. 폴더는 지웠다.

#### 4. 자동 시험

`npm test`(`node --test test/*.test.mjs`)에 단위 시험 18개가 있고 모두 통과한다. herdr와 claude 없이 도는 규칙만 다룬다.

- `<pasted_content>` 벗기기와 제출 비교(E3), `@이름` 풀기
- 신뢰 예상: 상위 폴더, 대소문자, git 루트에서 멈추기
- 실행 인자와 `resume_argv`가 같은 설정을 쓰는지, 설정 파일에 토큰을 값으로 쓰는지(SessionStart 없음, `allowedEnvVars` 없음)
- 상태 계산: 시작 → ready → working → waiting(hook이 먼저 옴) → `esc` 거부로 풀림(E9), trust_wait와 해제 뒤 idle에 되살아나지 않음(E10), 알 수 없는 대화상자, 질문, StopFailure의 error, SubagentStop 무시, herdr 꺼짐과 끊긴 턴과 이어 가기(E7), `/exit` 정상 종료
- 전달 대기열: 기다리는 이유, 막힘 → 풀림 → 보냄 → 확인, `agent_blocked` 되돌림, 취소
- 화면에서 권한 선택지 읽기(줄바꿈된 선택지 포함), 대화 기록 읽기와 C2 보정
- dev 프로필이 실제 판과 겹치지 않는지, 깨끗한 환경

herdr와 claude를 쓰는 시험은 자동화하지 않았다. 사용량이 들고, 신뢰 대화상자처럼 사람이 화면을 보며 판단할 단계가 있기 때문이다. 3절의 절차가 그 시험이다.

#### 5. PLAN과 다르게 한 것과 이유

1. **`resume_argv` 등록 시점(B3 4번).** PLAN은 "`agent.start` 직후 바로"다. 직후에 부르자 herdr가 `resume_not_accepted: resume_argv requires the reporter to hold the pane; report its state with pane.report_agent first`로 거부했다. 약 1.5초 뒤(herdr가 패널에서 claude를 찾은 뒤)에는 받았다. 그런데 받아들인 등록은 `agent_session`도 채운다. 신뢰 대화상자 중에 등록하면 E10의 신호 "`agent_session` 없음"이 사라졌다(실제로 확인). 그래서 **세션이 ready, working, waiting, error 중 하나가 된 뒤에 등록하고, 거부되면 1초마다 다시 시도한다(최대 3분).** 등록 뒤 `session.json`에서 `agent_resume`을 읽어 확인한다. `pane.report_agent`로 직접 보고하는 방법은 상태 권한까지 가져갈 수 있어 쓰지 않았다. ready까지 약 4초 늦어지는 동안 herdr가 다시 뜨면 등록을 잃는다.
2. **신뢰 예상에 git 루트 규칙을 더했다(3절 trust_wait, E10).** 시험 프로젝트를 `git init`한 `backend/.dev/proj`에서 신뢰 대화상자가 떴다. `C:/Workspace/multitask`와 `C:/Workspace`가 신뢰돼 있었는데도 그랬다. git이 아닌 새 폴더 `C:/Workspace/mtask-trust-probe-…`에서는 뜨지 않았다(상위 폴더를 물려받음, 확인한 뒤 폴더를 지웠다). E10의 `experiments/proj` 사례는 그 git 루트(`C:/Workspace/multitask`)가 신뢰돼 있어서였다고 설명된다. 그래서 예상 규칙을 "폴더에서 위로 올라가며 찾되, git 저장소 안이면 저장소 루트에서 멈춘다"로 바꿨다. Claude Code의 정확한 규칙은 이 두 관찰에서 추론한 것이다. git 저장소 안에서 루트보다 아래 폴더에 따로 신뢰 기록이 있는 경우는 보지 않았다.
3. **trust_wait의 주 신호를 화면 글자로 했다.** 위 1 때문에 `agent_session` 신호는 깨지기 쉽다. 그래서 herdr가 `blocked`인데 묻는 hook이 없으면 바로 `pane.read`로 화면을 읽고, "Quick safety check"와 "trust this folder"가 있으면 trust_wait로 본다. E10 신호(`launch_pending`, `agent_session` 없음, hook 없음)도 함께 쓴다. 등록 시점을 고치기 전에는 화면 신호가 없어 "알 수 없는 대화상자"로 보였다(`experiments/p1/watch-1.txt`).
4. **working에도 보내지 않는다(B1).** PLAN B1에 working 규칙은 없다. working 중에 `agent.prompt`를 부르면 Claude Code 자체의 다음 입력 대기열과 섞이고, 제출 확인(UserPromptSubmit)이 언제 올지 모른다. 그래서 ready와 error에서만 보내고, 기다리는 이유에 `working`을 더했다. 규칙 4의 "최근 몇 초"는 3초로 두었다(`inputQuietMs`). 보낸 뒤 30초 안에 UserPromptSubmit이 없으면 `unconfirmed`로 끝낸다.
5. **herdr 재시작 직후 `agent.list`의 상태를 믿지 않는다(C3).** 다시 붙은 직후 `agent.list`는 이어 가기 전의 `idle`을 주었다. 그대로 쓰자 `exited → ready → starting → ready`로 잠깐 ready가 보였다. herdr가 꺼져서 끝난 세션은 새 상태 이벤트가 올 때까지 starting으로 둔다. 고친 뒤에는 `exited → starting → ready`였다(`experiments/p1/watch-4.txt`).
6. **API를 더했다(6절).** P1 검증과 C3, D2에 필요해서 다음을 더했다. 이름은 바뀔 수 있다.
   - `backend.status`, `backend.shutdown`
   - `herdr.status`, `herdr.start`, `herdr.stop { confirm }`, `herdr.restart { confirm }`
   - `session.events`, `delivery.list`, `terminal.detach`, `trust.predict`
   - `board.get`, `board.setNode`, `board.setViewport`

   `session.kill`도 `confirm`이 없으면 확인 문구만 돌려준다. `session` 인자에는 세션 ID와 이름을 둘 다 받는다. `session.spawn`에 `effort`를 더했다.
7. **"재시작으로 끊긴 턴" 표시를 P1에 넣었다(C3는 P3).** herdr가 끊길 때 working이나 waiting이던 세션에 `interruptedTurn`을 남기는 것뿐이라 값이 쌌다. 대화 기록 꼬리를 보여주는 화면은 P3다.
8. **hook 토큰은 세션마다 따로 만든다.** PLAN은 "hook 토큰"이라고만 적었다. 세션마다 다른 토큰을 그 세션 설정 파일 안에 두고, 수신기는 `X-MT-Session` 헤더(값으로 씀)나 본문 `session_id`로 세션을 찾은 뒤 그 세션의 토큰과 비교한다. 다른 세션의 설정 파일을 읽은 쪽이 남의 세션 이름으로 hook을 보낼 수 없다.
9. **백엔드는 herdr 서버를 시작할 때만 띄운다.** 백엔드가 도는 중에 herdr가 예기치 않게 죽으면 다시 붙기를 1초마다 시도하지만 서버를 스스로 띄우지는 않는다. 사람이 일부러 껐을 수도 있어서다. `mtask herdr start`로 띄운다.
10. **빈 세션 새로 띄우기(C3에 없음).** 한 턴도 돌지 않은 세션은 대화 기록이 없어 `claude --resume <ID>`가 `No conversation found`로 끝난다. herdr 재시작 뒤 이어 가던 세션의 claude가 끝났는데 대화 기록 파일이 없으면, 백엔드가 같은 패널에서 `agent.start`로 같은 `--session-id`와 `--settings`를 써서 새로 띄우고 `resume_argv`를 다시 등록한다. 잃을 대화가 없으므로 사람에게 묻지 않는다. 대화 기록이 있는데 이어 가기가 실패하면 손대지 않고 exited로 둔다. 이 판단은 herdr가 다시 붙은 뒤 첫 상태 이벤트가 오기 전까지만 한다. 그 뒤 사용자가 `/exit`한 빈 세션은 다시 띄우지 않는다.
11. **시험 프로젝트는 git 저장소가 아니다.** 위 2 때문에 `backend/.dev/proj`를 따로 git 저장소로 두면 신뢰 대화상자가 뜨고, 신뢰는 누르지 않는 규칙이라 시험을 할 수 없다. git 조사는 이 폴더가 속한 multitask 저장소를 보고한다.

#### 6. 새로 안 것

- **터미널에서 거부한 기록(A1의 "P1에서 확인").** 대화 기록에 `tool_result` "The user doesn't want to proceed with this tool use. The tool use was rejected …"(`is_error`), 그 줄의 `toolUseResult: "User rejected tool use"`, 이어서 user 줄 `[Request interrupted by user for tool use]`가 남았다. 판에서 거부하지 않은 거부도 이것으로 읽을 수 있다.
- **herdr 재시작으로 끊긴 권한 요청 턴.** 화면이 아니라 대화 기록에는 `[Tool call interrupted: the session ended before this call's result was recorded, so its outcome is unknown. …]`가 남고, 이어 간 뒤 모델이 "No response requested."로 답했다.
- **한 턴도 돌지 않은 세션은 이어 갈 수 없다.** `--session-id`로 띄운 세션의 대화 기록 파일은 첫 지시 때 생긴다. 그 전에 herdr가 다시 뜨면 `claude --resume`이 `No conversation found`로 끝난다. 이때도 설정 파일의 `SessionEnd` hook(`reason: "other"`)은 왔다.
- **턴이 끝나고 약 60초 뒤 `Notification` hook이 한 번 온다.** 상태는 바꾸지 않았다. 알림 종류(`notification_type`)는 이번 기록에 남기지 않았다.
- **초점이 없는 패널은 턴이 끝나면 herdr `done`이다.** PLAN대로 `idle`과 같이 ready로 본다. 검토 대기는 판의 봤음 기록(`session.markSeen`)으로 계산했다.
- **`agent.start`는 신뢰 대화상자에서도 바로 돌아오고, 첫 `blocked`는 시작 뒤 약 3.6~4초다**(E10과 같다).
- **수치:** 시작 → ready 4.2~5.2초, 막히지 않은 세션의 전달 확인 약 0.38초, herdr 다시 띄우기에서 서버 기동 106ms, 끊김부터 다시 ready까지 약 6초, `/exit`부터 claude 종료까지 0.8~1.0초.

#### 7. 확인하지 않은 것

- 실제 `StopFailure`(error 상태)와 조용함(quiet) 표시. 상태 계산은 단위 시험만 했다.
- 판을 거친 AskUserQuestion과 ExitPlanMode. hook 모양은 E2·E9를 따랐고 단위 시험만 했다.
- 100KB 같은 긴 글 전달. E3에서 확인한 경로(`agent.prompt`)를 그대로 쓰고, 이번에는 5줄 글만 보냈다.
- PC 재부팅, `session.json`이 저장되기 전 herdr 강제 종료(PLAN 8절 열린 결정).
- 판 전용 세션에 herdr TUI가 붙었는지 알아내는 방법(D3, P3).
- 실제 판 프로필(`multitask`, 포트 47800, `%LOCALAPPDATA%\multitask`)로는 띄우지 않았다. 값만 정해 두었다.

#### 8. PLAN과 BRIEF에 고칠 것

PLAN과 BRIEF는 이번에 고치지 않았다. 아래를 제안한다.

**PLAN**

1. 0절 순서와 7절 P0 표: E8을 "끝남. Node 24 내장 `node:sqlite`를 쓴다. 저장소 모듈 안에 가둔다"로 바꾼다(`docs/experiments/E8.md`). P1을 "끝남"으로 바꾼다.
2. 3절 trust_wait: 예상 규칙을 "폴더에서 위로 올라가며 `hasTrustDialogAccepted`를 찾되, git 저장소 안이면 저장소 루트에서 멈춘다"로 바꾼다. 확인 신호의 첫째를 화면의 "Quick safety check"로 두고, `launch_pending`과 `agent_session` 없음은 보조로 둔다. 판이 `resume_argv`를 등록하면 `agent_session`이 생긴다는 점을 적는다.
3. 4절 B3 4번: "`agent.start` 직후 바로"를 "세션이 ready가 된 뒤. 직후에는 `resume_not_accepted`로 거부되고, 신뢰 대화상자 중에 등록하면 trust_wait 신호가 사라진다. 거부되면 다시 시도한다"로 바꾼다.
4. 4절 B1: "working이면 보내지 않는다"를 규칙으로 넣는다. 규칙 4의 기본값 3초, 제출 확인 시간 제한 30초(넘으면 "확인 못 함")를 적는다.
5. 4절 C3: "다시 붙은 직후 `agent.list` 상태는 이어 가기 전 값이라 믿지 않고, 새 상태 이벤트까지 starting으로 본다"를 더한다. 끊긴 턴이 대화 기록에 남는 모양(`[Tool call interrupted: …]`)을 적는다. "한 턴도 돌지 않은 세션은 `--resume`이 실패하므로 같은 세션 ID와 설정 파일로 새로 띄운다"(5절 10)를 더한다.
6. 4절 A1 거부 기록: "대화 기록에 남는 모양은 P1에서 확인"을 6절의 모양으로 바꾼다.
7. 5절 hook 수신기: "토큰은 세션마다 따로, 설정 파일 안에 값으로. 수신기는 `X-MT-Session` 또는 본문 `session_id`로 세션을 찾고 그 토큰과 비교한다"를 적는다.
8. 6절 API: 5절 6의 명령을 더한다. 확인이 필요한 명령(`session.kill`, `herdr.stop`, `herdr.restart`)은 `confirm` 없이 부르면 확인 문구를 돌려준다는 규칙을 적는다.
9. 1절 herdr 서버 띄우기와 백엔드 수명: 포트 47800, 데이터 폴더, 개발용 프로필(`multitask-dev`, 47811, 저장소 안 무시 폴더)을 적는다. "백엔드는 시작할 때만 herdr를 띄우고, 도중에 죽으면 다시 붙기만 한다"를 적는다.
10. 7절 P0 앞의 실험 규칙: "시험 프로젝트 폴더는 신뢰된 폴더 아래이면서 따로 git 저장소가 아니어야 한다"를 더한다.
11. 8절 열린 결정의 `<pasted_content>` 영향: 5줄 지시를 감싼 채 보냈을 때도 모델이 따랐다는 자료를 더한다(두 번째 사례, E3에 이어).

**BRIEF**

1. 3절 "정한 것"의 기술 구성: SQLite를 "SQLite(Node 24 내장 `node:sqlite`, E8)"로 바꾼다.
2. 3절 "세션 ID": "시작 직후 herdr에 이어 가기 명령을 등록한다"를 "세션이 ready가 된 뒤 등록한다(P1)"로 바꾼다.
3. 7절 열린 질문의 `<pasted_content>` 항목에 P1 결과(감싼 5줄 지시를 따름)를 더한다.

#### 9. 시험 뒤 정리

- 시험 claude 세션 `a`, `b`, `c`, `r3`, 신뢰 예상 확인용 `probe`는 `mtask kill --yes`로 `/exit` 정상 종료했다. `d`는 9번 시험에서 같은 방법으로 껐다. `e`, `f`와, 시험 프로젝트를 git 저장소로 만들었다가 신뢰 대화상자에 걸린 첫 네 세션은 `esc`로 나갔다. 신뢰는 한 번도 누르지 않았다. `r`, `r2`는 이어 가기에 실패해 이미 셸로 돌아와 있었고, 작업 공간을 닫았다.
- 판이 띄우지 않은 `foreign` 작업 공간은 herdr CLI로 닫았다. 판 전용 herdr 서버는 `mtask --dev herdr stop --yes`로 끄고, `herdr session delete multitask-dev`로 세션을 지웠다. 백엔드는 `mtask --dev backend stop`으로 껐다.
- 시험에 쓴 임시 폴더 세 개(`C:/Workspace/mtask-trust-probe-…`, `%TEMP%\mtask-trust-…` 둘)는 지웠다.
- 끝난 뒤 `herdr.exe`와 multitask 백엔드 `node.exe`는 없었다. 시험 전부터 돌던 `claude.exe` 25개는 모두 살아 있었다. 새로 보인 `claude.exe` 하나(PID 41444)는 시험이 끝날 무렵 데스크톱 앱이 띄운 세션(데스크톱 앱 폴더의 실행 파일, `--resume`, stream-json)이라 건드리지 않았다.
- 사용자의 기본 herdr 세션, 데스크톱 앱 세션, `~/.claude/settings.json`은 건드리지 않았다. `~/.claude.json`은 읽기만 했다(Claude Code가 시험 세션을 띄우며 스스로 쓰는 것은 막지 않았다).
- 백엔드는 주어진 이름의 herdr 세션에만 붙는다. 개발 중 기본 세션에는 한 번도 붙지 않았다.

### 지휘 세션의 합치기 기록(옛 `docs/PLAN.md` 7절)

끝났다(2026-10-29). 코드는 `backend/`, 결과와 증거는 `docs/P1.md`, 로그는 `experiments/p1/`에 있다. 아래 11개를 실제 claude 세션과 `mtask`만으로 모두 확인했다. 실제 `StopFailure`, 조용함 표시, 판을 거친 질문과 계획 승인, 긴 글 전달, PC 재부팅은 실제로 보지 않았다(`docs/P1.md` 7절).
