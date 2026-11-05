상태: 열림
날짜: 2026-11-05

## 지시

### 목표

개발용 판 CLI의 오류 둘을 재현하고 고친다. 사용자의 말: "이거 작업 ㄱㄱ".

P50 작업자가 개발용 판을 정리하다 본 것(`docs/log/p50-issues-canvas.md` 작업 기록 84줄):
- 백엔드를 띄운 직후 `atrium backend start`가 `Cannot read properties of undefined (reading 'stats')`를 냈다.
- `atrium herdr stop --yes`가 `herdr not found`를 돌려주었다. 그래서 그 판의 herdr 서버는 `herdr --session atrium-dev-p50 server stop`으로 직접 멈췄다.
- P40(herdr를 고정 경로 없이 찾기, `backend/src/herdr/discover.mjs`, 도는 서버의 실행 파일 쓰기)과 P49(원격, `backend.status`에 웹·원격 정보)가 이 길을 바꿨으니 둘 다 의심한다.

### 할 것

1. **재현.** 개발용 판(env로 띄움)에서 `atrium backend start`(백엔드가 이미 뜬 때와 꺼진 때), `atrium backend status`, `atrium herdr status|start|stop --yes|restart --yes`, `atrium status`를 차례로 쳐 보고 오류를 모두 적는다. 실제 판과 같은 조건(env 없이 기본 프로필)은 CLI 코드를 읽어 같은 길인지만 본다(실제 판으로는 시험하지 않는다).
2. **원인과 수정.** 오류마다 원인을 찾아 고친다. `herdr not found`는 어느 herdr 실행 파일을 찾지 못한 것인지(백엔드의 `cfg.herdrPath`, 찾기 결과, 도는 서버의 실행 파일, CLI 쪽)부터 밝힌다. 같은 계열의 다른 CLI 명령(`atrium herdr *`, `backend *`, `remote status`, `devices`)도 같은 문제가 없는지 본다.
3. **시험.** 재현한 경우마다 단위 시험(가짜 백엔드 응답, 가짜 herdr)을 더하고, 개발용 판에서 위 명령들이 오류 없이 도는 것을 보인다. 결과는 `experiments/p54/`(git 밖)에 둔다.
4. `cd backend && npm test`, `cd app && npm test`, `cd app && npm run build`가 통과한다.

### 읽을 파일

- `CLAUDE.md`, `docs/testing.md`, `docs/log/p40-herdr-discovery.md`·`p49-remote-r3-tailscale.md` 보고 절
- `backend/bin/atrium.mjs`(backend, herdr, status), `backend/src/backend.mjs`(`backend.status`, `herdr.status|start|stop|restart`, `ensureHerdr`, `herdrPath`), `backend/src/herdr/discover.mjs`, `backend/src/herdr/adapter.mjs`, `backend/src/config.mjs`

### 시험 환경

- 개발용 판이 필요하면 너만의 판으로 띄운다(`docs/testing.md`).
  - `ATRIUM_HERDR_SESSION=atrium-dev-p54`, `ATRIUM_PORT=47873`
  - `ATRIUM_DATA_DIR=<워크트리>/backend/.dev/data`, `ATRIUM_APP_USERDATA=<워크트리>/backend/.dev/app`
- 실제 판(`atrium`, 47800)과 다른 포트(47811~47874 가운데 네 것 말고)는 쓰지 않는다. 사용자의 기본 herdr 세션과 다른 판의 herdr 서버는 건드리지 않는다.
- 대화 목록은 시험 폴더의 대화만 읽는다(`ATRIUM_CLAUDE_PROJECTS`, `ATRIUM_CLAUDE_DESKTOP=none`). 시험 폴더는 `C:\Workspace\mtask-p54-*`처럼 새로 만든다.
- 끝나면 시험 세션, 창, 백엔드, herdr 서버와 세션(`atrium-dev-p54`만), 시험 폴더를 끄고 지운다.

### 지킬 것

- `CLAUDE.md`를 따른다. 프로세스는 직접 띄운 것만 PID로 끈다.
- 이 저장소는 공개다. 작업 기록, 시험 코드, 커밋 메시지에 사용자 경로·메일·토큰을 쓰지 않는다. 커밋 전·푸시 전 검사를 건너뛰지 않는다.
- 같은 때 다른 작업자(P55(가끔 실패하는 백엔드 시험 찾기))가 돈다. 맡은 일에 필요한 만큼만 작게 고친다.
- 자기 브랜치에만 커밋한다. 커밋 메시지에 `Co-Authored-By` 줄을 넣지 않는다. `main`을 바꾸거나 푸시하지 않는다. `node_modules`는 워크트리 안에서 받는다(`npm ci`).
- 문서는 이 작업 파일의 작업 기록 절과 보고 절만 고친다. 고쳐야 할 ARCH·testing 문장이 있으면 보고 절에 짧게 적는다.
- 끝나면 보고 절을 쓰고, 맨 마지막에 `<워크트리>/backend/.dev/p54.done`(브랜치 이름과 마지막 커밋 해시 두 줄)을 만든다.

## 작업 기록

- 시험 판: herdr 세션 `atrium-dev-p54`, 포트 47873, 데이터 `backend/.dev/data`, 창 프로필 `backend/.dev/app`, 대화 목록은 새로 만든 빈 폴더(`C:\Workspace\mtask-p54-ws`)와 `ATRIUM_CLAUDE_DESKTOP=none`. CLI는 판 값을 넣는 감싸개 `experiments/p54/tools/at.cjs`로 불렀다. 창과 claude 세션은 띄우지 않았다.
- 재현(고치기 전):
  - 꺼진 판에서 `backend start` 한 번만으로 `atrium: internal: Cannot read properties of undefined (reading 'stats')`가 났다(`cold1.txt`). 백엔드 자체는 뜬 채로 남는다.
  - 같은 때 `backend start`를 하나 더 치면 늦은 쪽이 `백엔드가 뜨지 않았다: listen EADDRINUSE`로 실패했다(`second.txt`).
  - herdr 서버가 도는 채로 백엔드만 멈춘 뒤 `backend start`를 띄우고 곧바로 `herdr stop --yes`를 치면, 앞은 `stats` 오류, 뒤는 10초 뒤 `{ stop: { stopped: false, out: 'herdr not found' } }`였고 서버는 그대로 돌았다(`cold2.txt`, `stop.txt`). P50 정리 순서(백엔드 멈춤 → 다시 띄움 → herdr 끄기)와 같다.
  - 백엔드가 다 뜬 뒤에는 `backend status`, `status`, `herdr status|start|stop --yes|restart --yes`, `remote status`, `devices`가 모두 오류 없이 돌았다.
- 원인: 백엔드 `start()`가 포트를 열고 `backend.json`을 쓴 뒤에도 herdr 실행 파일 고르기(`resolveHerdr`: `where herdr`, 후보마다 `--version`, 도는 서버의 실행 파일을 읽는 PowerShell, 수 초)를 기다리고, `relay`·`queue`·기능 처리기는 그 뒤에 만든다. 판 API는 그동안에도 요청을 처리했다.
  - `backend start`(`client.mjs startBackend`)는 `/health`가 답하면 바로 `backend.status`를 부르고, 그 처리기가 아직 없는 `this.relay.stats()`를 읽었다.
  - `herdr not found`는 백엔드 어댑터의 `herdrPath`가 아직 `null`(고르기 전, `ATRIUM_HERDR` 없음)일 때 `herdr.stop`이 `stopServer()`를 부른 것이다. `execText`가 파일이 없으면 `herdr not found`를 돌려준다. 찾기 결과, 도는 서버의 실행 파일, CLI 쪽 문제는 아니다(CLI는 herdr를 부르지 않는다). 다 뜬 뒤 찾기 결과는 installer 링크, 서버 실행 파일도 같은 경로였다.
  - P40이 `resolveHerdr`를 `listen` 뒤, `relay` 앞에 넣어 이 틈이 수 초로 벌어졌다. P49는 `backend.status`에 `web`을 더했을 뿐 이 틈과는 관계없다.
  - 실제 판(env 없는 기본 프로필)도 같은 `start()`와 같은 CLI 길이다. 옛 판 옮기기 때문에 `start()` 앞에서 찾기를 한 번 더 하지만 `listen` 뒤의 틈은 같다(코드로만 봄, 실제 판으로는 시험하지 않음).
- 수정:
  - `backend/src/api.mjs`: `ApiServer`에 `ready`(약속)를 둔다. 요청은 `ready`가 풀린 뒤에 처리기를 찾아 부른다. 뜨는 동안 `Object.assign`으로 더하는 처리기(기능, 워크트리 등)를 그 전에 부르면 `unknown_method`이던 것도 함께 풀린다.
  - `backend/src/backend.mjs`: `start()`를 `startInner()`로 감싸 끝나면(실패해도) `ready`를 푼다. `herdr.stop|restart`는 실행 파일을 모르면 다시 찾고, 그래도 없으면 부르지 않고 `herdr_missing` 오류를 낸다(전에는 10초 기다린 뒤 `herdr not found`를 담아 돌려주었다).
  - `backend/src/client.mjs`: 띄운 백엔드가 끝났는데 같은 판의 다른 백엔드가 `/health`에 답하면 `{ already: true }`를 돌려준다(동시 시작의 EADDRINUSE).
  - `backend start`가 다 뜰 때까지 기다리므로 처음 시작이 몇 초 길어질 수 있다(시험에서 2.7초).
- 단위 시험 `backend/test/p54.test.mjs` 7개: `ready` 전에는 답하지 않고 뒤에 더한 처리기도 찾음, `ready` 없으면 전과 같음, `start()` 실패에도 `ready`가 풀림, `herdr stop`의 경로 없음·다시 찾음·이미 앎(가짜 어댑터), 동시 시작(가짜 `/health` 서버와 진짜 `main.mjs`가 포트를 못 열고 끝남).
- 고친 뒤 개발용 판(`after-*.txt`): 꺼진 판 `backend start`와 곧바로 친 `herdr stop --yes`가 둘 다 정상(`started`, `stopped: true`). 동시 `backend start` 셋은 `started` 하나와 `already` 둘. 명령 순서 `backend start → backend status → status → herdr status → herdr stop --yes ×2 → herdr start ×2 → herdr restart --yes → remote status → devices → backend stop ×2 → backend status → backend start → status`가 모두 exit 0이고, 꺼진 백엔드의 `backend status`만 뜻한 대로 "백엔드가 돌지 않는다"와 exit 1이다(`after-seq.txt`).
- `cd backend && npm test` 408개 통과, `cd app && npm test` 185개 통과, `cd app && npm run build` 통과(`backend-test.txt`, `app-test.txt`, `app-build.txt`).
- 정리: CLI로 herdr 서버와 백엔드를 멈추고 herdr 세션 `atrium-dev-p54`를 지웠다. `backend/.dev/data`, `backend/.dev/app`, 시험 폴더, 단위 시험 임시 폴더를 지웠다. 다른 판과 사용자의 herdr 세션은 건드리지 않았다.

## 보고

### 요약

| 오류 | 재현 | 원인 | 수정 | 시험 |
| --- | --- | --- | --- | --- |
| `backend start`의 `reading 'stats'` | 됨(꺼진 판에서 한 번만 쳐도) | 판 API가 `start()`가 끝나기 전 요청을 처리, `backend.status`가 아직 없는 `relay`를 읽음 | `ApiServer`가 `ready`까지 기다림 | `p54.test.mjs`, 개발용 판 |
| `herdr stop --yes`의 `herdr not found` | 됨(백엔드를 띄운 직후) | 같은 틈. 백엔드가 herdr 실행 파일을 고르기 전(`herdrPath` null)에 `stopServer` | 같은 수정. 경로를 모르면 다시 찾고, 없으면 `herdr_missing` | 같음 |
| 동시 `backend start`의 EADDRINUSE | 됨 | 늦은 백엔드가 포트를 못 열고 끝남 | 먼저 뜬 백엔드가 있으면 `already` | 같음 |

- 같은 계열 명령(`herdr status|start|restart`, `backend stop|status`, `status`, `remote status`, `devices`)은 다 뜬 뒤에는 문제가 없었고, 뜨는 중의 틈은 위 수정으로 함께 닫힌다.
- 다 뜬 판에서 서버가 이미 꺼져 있을 때 `herdr stop --yes`는 `stopped: true`와 herdr의 "server is not running" 글을 돌려준다. 오류는 아니라 두었다.

### 문서에 고칠 문장(제안)

- ARCH 판 API 절: "판 API는 백엔드가 다 뜬 뒤(`start()` 끝)에 요청을 처리한다. 그 전에 온 요청은 기다린다(P54)."
- ARCH 백엔드 수명 또는 CLI 절: "`backend start`는 다 뜰 때까지 기다리고, 같은 판을 함께 띄우면 먼저 뜬 백엔드를 쓴다(`already`)."
