상태: 닫힘
날짜: 2026-11-01

## 지시

사용자 요청. 지휘 세션이 직접 고친다. 확정한 Atrium 로고(`app/design/brand/`)를 앱에 넣는다. 에셋 파일은 고치지 않고 가져다 쓴다.

1. 창 아이콘: `ico/atrium.ico`를 `app/assets/icon.ico`로 복사하고 BrowserWindow의 `icon`으로 준다.
2. 바로가기: `make-shortcut.ps1`이 `app\assets\icon.ico`를 이미 찾으므로 동작만 확인한다.
3. 트레이: 색 원 대신 로고. 평소는 16px(24·32px도 배율별로), 내 차례면 오른쪽 아래에 주황 점(#ff6b3d). 상태가 바뀔 때 그림을 바꾸는 동작은 그대로다.
4. 알림: `new Notification`에 256px PNG를 아이콘으로 준다.

범위 밖: 판 화면 안의 로고, 워드마크, 설치 패키징.

완료 기준:
- 개발용 판으로 띄운 창의 제목 표시줄, 작업 표시줄, Alt+Tab에 새 아이콘이 보인다.
- 트레이에 평소 로고가 보이고, 내 차례가 되면 주황 점 로고로 바뀌며, 차례가 끝나면 돌아온다.
- `make-shortcut.ps1 -Dest <임시 폴더>`로 만든 바로가기의 아이콘이 새 로고다.
- 기존 시험(트레이 포함)이 통과한다. 실제 판(`atrium`)으로는 시험하지 않는다.

## 작업 기록

- `app/assets/`에 `icon.ico`와 `atrium-icon-16|24|32|256.png`를 복사했다(원본 `app/design/brand/`는 그대로).
- `main.mjs`: BrowserWindow `icon`과 알림 `icon`. `tray.mjs`: `trayImage(turn)`이 16·24·32px을 배율 1·1.5·2로 한 그림에 넣는다. 내 차례 그림은 실행 중에 `toBitmap()`(Windows BGRA) 위에 어두운 고리와 주황 점을 그려 만든다. 로고 파일이 없으면 옛 색 원을 쓴다. 트레이 알림 둘(내 차례, 옮기기 문제)에도 아이콘을 준다.
- 개발용 판 `atrium-dev-p19`(포트 47835, `backend/.dev/p19`)에서 `app/test/e2e/p19-logo.mjs`를 돌렸다. 창 아이콘은 창 핸들의 `WM_GETICON`을 PNG로 저장해 봤다(`experiments/p19/tools/window-icon.ps1`).
  - 처음에는 내 차례가 생기지 않았다. 처음 두 번은 각각 `spawn --prompt`의 첫 지시가 입력칸에 남고 제출되지 않았고(`no UserPromptSubmit hook`), `echo`는 Claude Code가 묻지 않고 돌렸다.
  - 첫 지시를 준비 뒤 `send --wait`로 보내고 AskUserQuestion으로 묻게 바꾼 뒤 통과했다.
- 끝난 뒤 시험 세션, 백엔드, herdr 서버와 세션, 시험 폴더, 대화 기록을 지웠다.

## 보고

- 시험(`experiments/p19/p19-logo.json`): 5/5 통과. 창 아이콘(작은 16px, 큰 32px), 트레이 평소 로고, 내 차례 주황 점, 돌아옴, 바로가기 아이콘 `app\assets\icon.ico`. 그림 모음은 `experiments/p19/p19-icons.png`.
- 기존 트레이 창 시험 `p14-tray.mjs` 11/11, 창 단위 시험 44, 빌드 통과.
- 알려진 문제:
  - 알림 아이콘은 코드로만 넣었고 실제 알림 화면은 보지 않았다.
  - 작업 표시줄과 Alt+Tab의 모습은 사람이 확인한다.
  - `spawn --prompt`의 첫 지시가 막 준비된 Claude Code 입력칸에서 제출되지 않는 때가 한 번 있었다. 판은 `unconfirmed`로 남겼다. 따로 고치지 않았다.
