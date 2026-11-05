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

## 보고
