상태: 열림
날짜: 2026-11-05

## 지시

### 목표

GitHub 첫 화면의 README를 다시 쓰고, 지금 화면으로 스크린숏을 새로 찍는다. 이 결과로 v0.1.0을 릴리즈한다. 사용자의 말: "github 메인페이지 README eng 좀 더 깔끔하게 수정하자. 지금 캡처한 사진은 구버전이잖아? 사진 캡쳐 너가 알아서 하는데 내 canvas를 캡쳐하지는 말고 적당히 재현해줘. 추가한 기능 ㅈㄴ 많잖아. README에 적절하게 구성해서 만들자".

### 할 것

1. **스크린숏 새로 찍기.** 지금 `docs/images/`의 board·dock·your-turn은 옛 화면이다(P11 무렵, 그 뒤 사이드바, 아래 바, 찾기, 원격 화면이 바뀌었다).
   - 개발용 판에 데모를 꾸며 찍는다. 사용자의 실제 판이나 캔버스는 절대 쓰지 않는다.
   - 데모 폴더는 새로 만든다. 그림의 경로가 깔끔하도록 `C:\Workspace\atrium-demo\<저장소>`를 써도 된다(옛 그림도 이 경로였다). 끝나면 지운다. 저장소 둘이나 셋(예: `web-app`, `api`)을 git으로 만들고 작은 파일을 둔다.
   - 세션은 `claude --model haiku`와 셸로 띄운다. 짧고 그럴듯한 영어 지시로 화면을 채운다. 리드 하나와 워커, 리뷰어를 역할 선으로 잇고, 하나는 질문으로 "Your turn" 상태를 만든다. 워크트리 상자 하나와 메모나 칸반 하나, 다른 저장소의 셸 몇 개를 둔다. 실제 대화 기록은 쓰지 않는다.
   - 찍을 장면(4~6장): (1) 판 전체(대표 그림), (2) 내 차례 카드(질문·승인), (3) 에이전트끼리(역할 선, 워커, 미션 맵이나 Thread), (4) 붙여 묶기·배치 틀, (5) 원격(노트북 브라우저 흉내: localhost 웹 화면이나 흉내 프록시, 그리고 PC 창의 연결된 기기 탭). 필요하면 사이드바·찾기 창 한 장을 더한다.
   - 1600×960 정도로 찍고 파일마다 1MiB 아래로 한다(공개 검사가 막는다). 화면 배율과 글자가 선명한지 본다.
   - 찍는 과정을 스크립트로 남긴다(예: `app/test/e2e/readme-shots.mjs`). 다시 찍을 수 있어야 한다.
   - 쓰지 않게 된 옛 그림은 지운다. `banner.png`(로고 글자)는 지금 것과 같으면 둔다.
2. **README.md(영어) 다시 쓰기.** 깔끔하고 훑어보기 쉽게 한다.
   - 첫 화면: 배너, 한 줄 소개, 배지(Electron 45, Node 24, Windows, MIT), 한국어 링크, 대표 그림.
   - "What it is"를 서너 줄로 쓴다.
   - **Features**는 묶음별로 짧은 글머리표와 그림을 둔다. 묶음 예: 판과 워크스페이스(무한 캔버스, 저장소별 영역, 워크트리 상자, 200개 넘는 세션의 사이드바와 가상 그룹, 찾기), 내 차례(상태, 질문·승인 카드, 알림), 에이전트끼리(역할 선, `atrium child` 워커, 말로 고르는 모델, 미션 맵, Thread), 터미널(실시간 xterm, 웹처럼 고르기·복사, 붙여넣기, 배율), 배치(붙여 묶기, 배치 틀, 정리, 메모, 칸반), 원격(Tailscale로 브라우저에서, 코드로 짝 맺기, 짝 맺은 기기 묶기, 패스키는 선택, 연결 기록, 원격 받기 스위치), CLI.
   - 기능은 코드와 `docs/ARCH.md`, `CHANGELOG.md`로 확인한 것만 쓴다. 없는 기능이나 옛 동작은 쓰지 않는다.
   - 그 뒤에 Requirements, Quick start, Remote access(짧게, 자세한 단계는 접기(`<details>`) 등으로), CLI 짧은 표, How it works(지금 다이어그램 다듬기), Development, Status, Acknowledgments, License를 둔다. Acknowledgments의 Qualop 번역 기여와 상표·글꼴 고지는 그대로 둔다. License 줄에 "제삼자 로고와 글꼴은 MIT가 아님, `app/THIRD_PARTY_NOTICES.txt`"를 더한다.
   - 지금 README의 원격 절은 P62까지 반영돼 있다(패스키 기본 끔). 그 내용을 지키며 짧게 다듬는다.
3. **README.ko.md**를 영어판과 같은 구성과 그림으로 맞춘다. 한국어 화면 그림을 따로 찍을 필요는 없다.
4. 비공개 참고 제품의 이름은 어디에도 쓰지 않는다(P63이 저장소에서 지운다).

### 완료 기준

1. README 두 파일이 같은 구성이고, 그림 링크가 모두 있다. 그림은 새 화면이며 사용자의 실제 판이 아니다.
2. 그림 파일은 1MiB 아래이고, 공개 검사(`node scripts/check-public.mjs --tree HEAD`)가 통과한다.
3. 찍기 스크립트로 다시 찍을 수 있다. 결과는 `experiments/p64/`(git 밖)에도 남긴다.
4. `cd backend && npm test`, `cd app && npm test`, `cd app && npm run build`가 통과한다.

### 읽을 파일

- `CLAUDE.md`, `docs/testing.md`, `README.md`, `README.ko.md`, `CHANGELOG.md`, `docs/ARCH.md`
- 창 시험 도구: `app/test/e2e/harness.mjs`, `p5-lib.mjs`, `p61-shots.mjs`, `p59-lib.mjs`(웹 화면과 짝 맺기)

### 시험 환경

- 개발용 판이 필요하면 너만의 판으로 띄운다(`docs/testing.md`).
  - `ATRIUM_HERDR_SESSION=atrium-dev-p64`, `ATRIUM_PORT=47890`(흉내 프록시는 47891)
  - `ATRIUM_DATA_DIR=<워크트리>/backend/.dev/data`, `ATRIUM_APP_USERDATA=<워크트리>/backend/.dev/app`
- 실제 판(`atrium`, 47800)과 다른 판의 포트는 쓰지 않는다. 사용자의 기본 herdr 세션과 다른 판의 herdr 서버는 건드리지 않는다. 사용자의 실제 판과 캔버스는 열지도, 캡처하지도 않는다.
- 대화 목록은 시험 폴더의 대화만 읽는다(`ATRIUM_CLAUDE_PROJECTS`, `ATRIUM_CLAUDE_DESKTOP=none`).
- 이 PC의 Tailscale 설정은 바꾸지 않는다. 읽기 명령만 부른다.
- 끝나면 시험 세션, 창, 브라우저, 프록시, 백엔드, herdr 서버와 세션(`atrium-dev-p64`만), 시험 폴더를 끄고 지운다. 네가 띄운 프로세스가 남지 않았는지 포트로 확인한다.

### 지킬 것

- `CLAUDE.md`를 따른다. 프로세스는 직접 띄운 것만 PID로 끈다.
- 이 저장소는 공개다. 작업 기록, 시험 코드, 커밋 메시지, 그림에 사용자 경로·메일·토큰, 실제 PC·tailnet 이름, IP, 실제 대화 내용을 쓰지 않는다. 커밋 전·푸시 전 검사를 건너뛰지 않는다.
- 같은 때 다른 작업자(P63(이름 지우기와 검사 정리))가 돈다. 맡은 파일만 고친다.
- 자기 브랜치에만 커밋한다. 커밋 메시지에 `Co-Authored-By` 줄을 넣지 않는다. `main`을 바꾸거나 푸시하지 않는다. `node_modules`는 워크트리 안에서 받는다(`npm ci`).
- 끝나면 보고 절을 쓰고, 맨 마지막에 `<워크트리>/backend/.dev/p64.done`(브랜치 이름과 마지막 커밋 해시 두 줄)을 만든다.

## 작업 기록

## 보고
