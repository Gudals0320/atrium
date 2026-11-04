상태: 닫힘
날짜: 2026-11-02

## 지시

### 목표

쓰지 않는 기능 둘을 모두 빼고, 노드를 고른 채 Delete 키로 닫기를 넣는다. 사용자의 말은 다음과 같다.
- one-line 메모를 삭제한다.
- 그룹 기능을 모든 곳에서 삭제한다. 붙여 묶기(덩어리)는 남긴다.
- 세션을 클릭하고 Delete를 누르면 X를 누른 것과 똑같이, 보관·삭제·취소를 보인다.

### 정한 것

- **그룹 빼기.** 그룹과 그것에만 쓰이던 것을 모두 뺀다.
  - 화면: 그룹 영역(`GroupNode.jsx`), 그룹 만들기 대화상자, 왼쪽 레일의 그룹 칸, 아래 칩 "Group(묶기)", 새 세션 대화상자와 영역 이름표의 그룹 관련 부분, 미션 맵의 그룹 열, 사이드바·검색·바뀐 것의 그룹 표시, 그룹 색 후보.
  - 백엔드: `group.*` API, `@그룹` 전달(B2)과 그룹 동시 실행 상한, 묶음 실행(`batch.run`, 대기열, `batch_items`), 루프의 그룹 대상(세션 대상만 남김), `session.spawn`의 `group`, 하위 세션의 그룹 물려받기, 다시 열기의 그룹, 배치·영역 계산의 그룹 직사각형, `atrium` CLI의 그룹·묶음 명령.
  - 고른 노드 막대의 묶기·풀기 단추는 P23이 막대를 고치며 뺀다. 너는 막대(`Search.jsx`의 SelectionBar)를 고치지 않는다.
  - 판 기록 옮기기: 처음 뜰 때 기존 그룹을 지운다. 노드는 그 자리에 둔다. 그룹 대상 루프는 멈추고 지운다. 무엇을 지웠는지 판 이벤트로 남긴다. 표는 지우거나 쓰지 않게 둔다(고른 쪽과 까닭을 보고에 적는다).
- **한 줄 메모 빼기.** 손댄 세션에서 다른 세션으로 옮길 때 뜨던 한 줄 메모 칸(E2, `note.add`)과 그것을 쓰는 모든 곳을 뺀다: 브리핑의 메모 부분, 사이드바·검색·출력 보기·복귀 요약의 메모 표시, `atrium note`. 브리핑(돌아오면 마지막 지시·답·상태·질문을 보이는 것)은 남긴다. 캔버스의 메모 노드(I3, 마크다운 글 노드)는 그대로 둔다.
- **Delete 키.**
  - 세션 노드를 하나 고르고 Delete를 누르면 그 노드의 X와 같은 닫기 확인(보관·삭제·취소)을 연다.
  - 여럿을 고르면 한 확인창에 수를 보이고, 보관이나 삭제를 고른 세션 모두에 한다.
  - 터미널, 입력 칸, 메모 편집 중에는 Delete가 그대로 글자를 지운다(가로채지 않는다). 메모·칸반 노드는 지금 동작을 지킨다.

### 완료 기준

1. 개발용 판의 창 시험으로 다음을 확인하고 스크린숏을 남긴다.
   - 그룹을 만들 곳이 화면 어디에도 없다.
   - 그룹이 있던 판 기록(시험용으로 만든 것)을 띄우면 그룹이 지워지고 노드는 그 자리에 남는다.
   - 한 줄 메모 칸이 뜨지 않는다.
   - Delete로 하나·여럿 닫기(보관, 삭제, 취소). 터미널 안 Delete는 글자를 지운다.
2. `rg`로 화면과 백엔드에 그룹·한 줄 메모 코드가 남지 않았는지 보고에 적는다(옮기기 코드는 뺀다).
3. 단위 시험을 고치고 더한다. 기존 시험 가운데 그룹·묶음·한 줄 메모 시험은 지우거나 바꾼다. 지운 시험과 까닭을 적는다. 남은 단위 시험은 모두 통과한다.

### 시험 환경

- 너만의 개발용 판으로 띄운다(`docs/testing.md`).
  - `ATRIUM_HERDR_SESSION=atrium-dev-p22`, `ATRIUM_PORT=47840`
  - `ATRIUM_DATA_DIR=<워크트리>/backend/.dev/data`, `ATRIUM_APP_USERDATA=<워크트리>/backend/.dev/app`
- 실제 판(`atrium`, 47800)과 기본 개발용 판(`atrium-dev`, 47811)은 사용자가 쓴다. 포트 47800, 47811~47839와 다른 작업자의 포트(47840~47843 중 네 것이 아닌 것)를 쓰지 않는다.
- 대화 목록은 시험 폴더의 대화만 읽는다(`ATRIUM_CLAUDE_PROJECTS`, `ATRIUM_CLAUDE_DESKTOP=none`).
- 시험 폴더는 `C:\Workspace\mtask-p22-*`처럼 새로 만든다. 시험 claude는 `--model haiku`, 턴은 짧게. 첫 지시는 준비된 뒤 `atrium send --wait`로 보낸다.
- 시험 창을 띄워 둔 동안 사람이 만지면 시험이 깨질 수 있다. 결과가 이상하면 다시 돌린다.
- 끝나면 다음을 끄고 지운다: 시험 세션, 창, 백엔드, herdr 서버와 세션, 시험 폴더, 시험 대화 기록.

### 지킬 것

- `CLAUDE.md`를 따른다. 프로세스는 직접 띄운 것만 PID로 끈다. 사용자의 `~/.claude/settings.json`과 opencodex 설정은 고치지 않는다.
- 같은 때 다른 작업자 셋이 돈다(P22 그룹·한 줄 메모 빼기와 Delete 키, P23 덩어리 다듬기, P24 리포 단위 잠재우기, P25 DeepSeek 바로 띄우기). 자기 범위 밖의 파일은 꼭 필요한 만큼만 고친다. 화면 글은 `locales/en.js`·`ko.js`에 둔다(겹침은 지휘 세션이 합칠 때 푼다).
- 자기 브랜치에만 커밋한다. 메시지 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. `main`을 바꾸거나 푸시하지 않는다. `node_modules`는 워크트리 안에서 받는다.
- 살아 있는 문서 합계가 예산(70,000자)에 차 있다. 이번에는 `docs/ARCH.md`도 고치지 않는다. 바뀐 구조와 고쳐야 할 ARCH 행은 보고 절에 적는다. 문서는 이 작업 파일의 작업 기록 절과 보고 절만 고친다.
- 끝나면 보고 절을 쓰고, 맨 마지막에 `<워크트리>/backend/.dev/p22.done`(브랜치 이름과 마지막 커밋 해시 두 줄)을 만든다.

### 읽을 파일

- `CLAUDE.md`, `docs/BRIEF.md`, `docs/testing.md`
- `docs/ARCH.md` 4절 B2·B4·E2·H6·I5·I6, 7.1 그룹 영역
- `backend/src/groups.mjs`, `backend.mjs`, `loops.mjs`, `canvas-ops.mjs`, `store.mjs`, `bin/atrium.mjs`
- `app/src/renderer/GroupNode.jsx`, `SessionExtras.jsx`, `Mission.jsx`, `Chrome.jsx`

## 작업 기록

### 2026-11-02 작업자 세션(P22, 워크트리 p22)

계획
1. 백엔드: 그룹·묶음·한 줄 메모 코드를 빼고, 옛 판 옮기기(`store.dropGroups`)를 백엔드 시작 맨 앞에 둔다.
2. 단위 시험: 그룹·묶음·메모 시험을 지우거나 바꾸고 `test/p22.test.mjs`를 더한다.
3. 창: 그룹 영역·대화상자·레일·칩·미션 맵 열·노드 머리 그룹 표시·새 세션 대화상자 그룹, 떠날 때 메모 줄과 노드의 메모 단추, 브리핑의 메모 줄을 뺀다. Delete 키 닫기를 넣는다.
4. 개발용 판(`atrium-dev-p22`, 47840)에서 창 시험과 스크린숏.

진행
- 시작 전 단위 시험: 백엔드 219 통과, 창 46 통과.
- 백엔드에서 뺀 것: `groups.mjs`(파일째), `group.*`·`batch.*`·`note.*` API, `@그룹` 전달과 `batch_limit`, `pumpBatch`와 2초 타이머, 루프의 그룹 대상(`loop.create { group }`은 이제 `bad_request`), `session.spawn`의 `group`, 하위 세션의 그룹 물려받기, 다시 열기의 그룹, `canvasItems`·`slotFor`·정리·영역 옮기기·`settleRegions`의 그룹 직사각형, `wrapGroupRect`·`GROUP_*`, `workspace.list`의 `groups` 수, 빈 워크스페이스 닫기의 그룹 지우기, 이름 겹침 검사의 그룹 이름, 검색의 `note` 자리, 브리핑의 `notes`, 미션 맵의 그룹 열(두 열이 됨), CLI의 `note`·`group`·`batch`·`spawn --group`·루프 `@그룹`.
- 옮기기 결정: `groups`, `batch_items` 표는 지운다(DROP). 열린 세션·닫힌 세션의 `sessions.group_id`는 NULL로 비우고 열은 둔다(`deliveries.group_id`, `thread_results.group_id`도 둔다). 새 판은 이 열을 만들지 않는다. `notes` 표(옛 한 줄 메모)는 사용자가 쓴 글이라 지우지 않고 새 판에는 만들지 않으며 아무도 읽지 않는다. 그룹 대상 루프 행은 루프 엔진이 읽기 전에 지운다. 판 이벤트 `groups_removed { groups, members, loops, batchItems }`.
- 고른 노드 막대(`Search.jsx` SelectionBar)는 P23 범위라 고치지 않는다. 막대가 쓰는 `group.create`·`group.ungroup`은 백엔드에서 없어지므로 누르면 오류 알림이 뜬다. 막대가 읽는 `st.groups`와 막대의 사전 열쇠(`chips.group*`, `selection.group*`, `selection.ungroup*`)는 P23이 막대를 고칠 때까지 남긴다.
- 창: `GroupNode.jsx`(그룹 영역, 그룹·묶음 대화상자)를 지우고 Canvas·Chrome·CommandBar·Loops·Mission·SessionNode·SpawnDialog·store·main·brief·SessionExtras·lib(items, labels, tokens, icons)·CSS·사전에서 그룹과 한 줄 메모를 뺐다. 영역 선 색 변수 `--group-line*`·`--group-dot`은 영역에만 쓰여 `--region-*`로 이름을 바꿨다.
- Delete 키: `main.jsx`의 keydown(버블)이 `editable`(입력 칸, textarea, contentEditable, `.xterm`)이 아닐 때 `lib/keys.js closeKeyTargets`로 대상을 고른다. 하나면 `store.killAsk`로 그 노드에 알리고, 노드는 머리줄 X가 보이는 크기(아이콘 얼굴이 아니고 배율 0.7 이상)면 X와 같은 `KillConfirm`을, 아니면 같은 확인을 창 가운데 `CloseDialog`로 연다. 여럿이면 `CloseDialog`(수, 이름, 보관·삭제·취소, 하나씩 `session.kill { confirm, after }`).
- 창 시험 `app/test/e2e/p22-remove.mjs`(판 `atrium-dev-p22`, 47840, `experiments/p22/tools/`). 1회차 22/23: 2c(노드 자리)가 실패했는데 시험이 창의 `nodes`(board.setNode는 board.changed를 보내지 않아 옛 값)로 "전" 자리를 읽은 탓이라 판 기록(`board.get`)으로 읽게 고쳤다. 2회차 22/23: 2b가 옛 한 줄 메모 행을 1개로 셌는데 1회차가 넣은 행이 남아 2개였다(표를 지우지 않는다는 것은 맞음). "1개 이상"으로 고쳤다. 3회차 23/23.

## 보고

### 만든 것

- **그룹 빼기(백엔드).** `groups.mjs` 삭제. `group.*`, `batch.run`·`batch.cancel`(대기열, `pumpBatch`), `@그룹` 전달과 그룹 동시 실행 상한(`batch_limit`, `deliveryView.batchFull`), 루프의 그룹 대상(`loop.create`는 `session`만, 그룹을 주면 `bad_request`), `session.spawn`의 `group`, 하위 세션의 그룹 물려받기, 다시 열기의 그룹, 배치·영역 계산의 그룹 직사각형(`canvasItems`, `slotFor`, `arrange`, `workspaceMove`, `settleRegions`, `migrate-canvas`, `wrapGroupRect`), `workspace.list`의 `groups`, 이름 겹침 검사의 그룹 이름, 미션 맵 그룹 열(두 열), CLI `group`·`batch`·`spawn --group`·루프 `@그룹`·`atrium child` 출력의 그룹.
- **판 기록 옮기기.** `store.dropGroups()`를 백엔드 시작 맨 앞(워크스페이스 옮기기 전)에 부른다. `groups`, `batch_items` 표가 있으면 이름·소속 세션·그룹 대상 루프·묶음 항목 수를 모아 판 이벤트 `groups_removed`로 남기고, `sessions.group_id`를 NULL로 비우고, 그룹 대상 루프 행을 지우고(루프 엔진이 읽기 전), 두 표를 DROP한다. 노드 자리는 건드리지 않는다. 다음에 뜰 때는 할 일이 없다(null).
  - 고른 쪽과 까닭: 그룹·묶음 항목 **표는 지운다**. 남겨 두면 다시 쓰일 길이 없는 기록이 판에 남고, 옮기기가 이미 끝났는지를 표가 있는지로 알 수 있어 따로 표시가 필요 없다. **열은 둔다**(`sessions.group_id`, `deliveries.group_id`, `thread_results.group_id`): SQLite 열 지우기는 STRICT 표를 다시 만드는 일이 되어 위험이 값어치보다 크고, NULL로 비운 뒤 아무도 읽지 않는다. 새 판에는 이 열과 표를 만들지 않는다. 옛 한 줄 메모 **`notes` 표는 지우지 않는다**(사람이 쓴 글이라). 새 판에는 만들지 않고 아무도 읽지 않는다.
- **한 줄 메모 빼기.** `note.add`·`note.list`, `note.added` 이벤트, 저장소 `addNote`·`notes`, 검색의 `note` 자리, 브리핑의 `notes`, CLI `note`. 창은 떠날 때 메모 줄(`LeaveMemoBar`), 노드 머리의 메모 단추와 `MemoInput`, 브리핑의 "남긴 메모" 줄. 브리핑(마지막 지시·답·상태·질문)과 메모 노드(I3)는 그대로다.
- **그룹 빼기(창).** 그룹 영역, 그룹·묶음 대화상자, 왼쪽 레일 "그룹 만들기", 아래 칩 "묶기", 새 세션 대화상자의 그룹, 노드 머리 `@그룹` 표시, 명령 바 `@` 목록의 그룹, 루프 대화상자의 그룹 대상, 미션 맵 그룹 열·소속 선, 그룹 색 후보(`--group-1..6`, `groupColors`), 아이콘 `group`, 사전 열쇠. 영역 이름표와 정리 안내 글의 "그룹"도 뺐다.
- **Delete 키.** 위 작업 기록 참고. 터미널·입력 칸·메모 편집 중에는 가로채지 않는다. 메모·칸반 노드는 `selected`에 들지 않으므로 Delete가 아무것도 하지 않는다(지금 동작 그대로).
- **단위 시험.** 백엔드 219 → 217(지운 6, 더한 4), 창 46 → 48(지운 1, 더한 3). 모두 통과.
  - 지운 시험: `p3` "B4: 묶음 진행 개수", "B4: 동시 실행 상한", "B4: 그룹 전달은 상한에 막히면", "그룹 영역: 안의 빈자리, 영역 키우기, 저장"(옛 판에 열 더하기와 `addNote`도 이 시험 안), `p6a` "H6: 골라 묶기", `p6b` "I5: 그룹 루프", 창 `p3-lib` "B4: 그룹 상한에 막힌 전달의 이유". 시험할 기능이 없어졌다. 옛 판 옮기기는 `p22`가 대신 본다.
  - 바꾼 시험: `p5` 옮기기(P4 고정 자료에서 먼저 `dropGroups`, 그룹 폴더로 워크스페이스를 만들지 않음)와 `@그룹`(이제 `targetNotFound`), `p6a` 검색(메모 대신 보낸 글로 LIKE 특수 글자), P5 판 옮기기(그룹 없이), `p6b` 루프 시험대·`loop.create`(그룹은 `bad_request`)·미션 맵(두 열), `p7` 다시 열기, `p8` 하위 세션(그룹 물려받지 않음), `p9` 영역 펴기, `p16` 확인 글(그룹 열쇠 대신 일반 이름), 창 `p6c-lib` 미션 배치(두 열)·`loopsOfSession`, `p16-i18n` `wsClose`. 가짜 백엔드의 `groupId: null`, `groupMembers` 같은 흔적도 지웠다.
  - 더한 시험: `backend/test/p22.test.mjs`(옛 판 옮기기, 새 판에 표 없음, 대기열에 `batch_limit` 없음, 미션 맵 두 열), `app/test/p22-lib.test.mjs`(Delete 대상, 사전 열쇠).
- **창 시험** `app/test/e2e/p22-remove.mjs` 23/23(`experiments/p22/p22-remove.txt`·`.json`, 스크린숏 `p22-01`~`p22-15`). 시험 claude는 haiku 여섯, 시험 폴더 `C:\Workspace\mtask-p22-ws\demo`.
  - 그룹을 만들 곳이 없다: 레일·칩(01), 새 세션 대화상자(02), 미션 맵 두 열(03), 명령 바 `@` 목록(04), `group.*`·`batch.run`·`note.add`는 `unknown_method`.
  - 그룹이 있던 판 기록: 창과 백엔드를 끄고 board.db에 P21까지의 모양으로 그룹 둘(영역 있는 것, CLI 것), s1·s2 소속, 묶음 항목, 그룹 대상 루프, 옛 한 줄 메모를 넣고 다시 띄웠다. `groups_removed` 이벤트 하나, 표 지워짐, 소속 0, 그룹 루프 0, 노드 여섯 자리 그대로, 창에 그룹 배경·표시 없음(05).
  - 한 줄 메모 칸: s1 터미널에 친 뒤 s2로 옮겨도 뜨지 않음(06), 브리핑에 메모 줄 없음(07).
  - Delete: 터미널 안에서는 글자를 지움(`qwxyz` → `qwyz`, 08), 메모 노드는 그대로이고 편집 중에는 글자를 지움, 하나 → 그 노드의 확인(09) 취소·보관(10), 멀리 본 하나 → 대화상자(11), 여럿 → 한 확인창(12) 취소·보관(13), 여럿 삭제(14, 대화 기록 휴지통), 하나 삭제(15).
- **rg 확인**(옮기기 코드 뺌). `rg -i "group|batch|note\.add|addNote|\bnotes\b" backend/src backend/bin`: 남은 줄은 `store.dropGroups`와 그 호출, 옮기기 파일의 주석, 그룹과 상관없는 지역 변수(`links.mjs`의 명령 낱말 `group`, `recall.mjs`의 폴더별 묶음 `groups`)뿐. `rg -i "group|batch|note\.add|leaveMemo|MemoInput|\bnotes\b" app/src`: `Search.jsx` SelectionBar(P23 범위) 6줄과 그 사전 열쇠 `chips.group`·`groupMixed`·`groupMade`, `selection.groupTitle`·`ungrouped`·`ungroup`(두 언어 12줄)뿐.

### 계획과 다른 곳

- 고른 노드 막대의 "묶기"·"풀기"는 지시대로 남겼다. 백엔드 API가 없어져 누르면 `unknown_method` 오류 알림이 뜬다(P23이 뺄 때까지). 그 막대가 읽는 `st.groups`는 창 저장소에서 뺐지만 세션에 `groupId`가 없어 막대가 그 값을 읽는 줄까지 가지 않는다.
- 멀리 보아 머리줄의 X가 숨은 노드(아이콘 얼굴이거나 배율 0.7 아래)는 X와 같은 확인을 노드 안이 아니라 창 가운데 대화상자로 연다. 노드 안에 그리면 그 배율에서 글을 읽을 수 없다.
- 옛 단계 창 시험 가운데 그룹만 보던 `b4-group.mjs`는 지웠다. `group`·`batch`·`note.add`·한 줄 메모 선택자가 나오는 옛 창 시험(`e2-brief`, `p6a-h67`, `p6c-i5`, `p6c-i67`, `p10-archive`, `p11-extra`, `p13-convos`, `p18-migrate`, `p5-restart`, `p6a-h1`, `p7-j1`, `p9-lib`, `p3-smoke`, `d1-res`, `p16-lang`, `p6c-i34`)은 고치지 않았다. 하나씩 보지는 않았고, 그룹·한 줄 메모를 쓰는 단계는 다시 돌리면 실패한다.

### 알려진 문제

- **노드를 그냥 누른 뒤 Delete는 닫지 않는다.** 노드를 누르면(H4) 그 노드로 들어가 터미널에 초점이 가므로 Delete는 지시대로 터미널 글자를 지운다(누른 직후 터미널이 붙기 전에 친 Delete도 H4 대로 모았다가 터미널에 넣는다). Delete로 닫으려면 들어가지 않고 고른다: `Ctrl`+누르기, `Shift`+끌기 상자 고르기. 사용자의 말("세션을 클릭하고 Delete")과 어긋날 수 있어 지휘 세션이 정할 일이다(예: 머리줄 누르기는 고르기만).
- 옛 판의 `sessions.group_id` 등 쓰지 않는 열과 `notes` 표는 남는다(위 결정).

### ARCH에서 고칠 행(이번에는 고치지 않음)

- 4절 B2(`@그룹`, 상한 문장 빼기: 대상은 `@이름`과 `@all`), B4(행 지움), D2(노드의 X 또는 고른 노드에서 Delete, 여럿이면 한 확인창), E2(메모와 한 줄 메모 칸 문장 빼기), F3("그룹에 넣지 않는다" 빼기), G1("그룹은 한 워크스페이스 안" 빼기), H1·H7(감싸는 것과 정리 블록에서 그룹 빼기), H2(검색 대상의 "메모"는 메모 노드만), H6(행 지움), I2("묶음 실행 지시" 빼기), I5("그룹 상한" 빼기, 대상은 세션), I6(두 열: 명령 바와 지시하는 세션 → 세션), J1·J2(되살리는 것에서 그룹 빼기), K1(물려받는 것에서 그룹 빼기).
- 5절: 저장소 행(그룹, 메모 빼기), "그룹과 묶음" 행 지움, 배치 행("골라 묶는 그룹", 그룹 놓기 빼기), 화면 생김새 행("그룹 색 후보" 빼기).
- 6절: `session.spawn`의 `group?`, `note.add`·`note.list` 행, `group.*` 행, `batch.*` 행 지움, `board.get`의 "그룹", `workspace.list`의 `groups`, `loop.create { session }`·`loop.list { session? }`, 이벤트 목록에서 `note.added`·`group.updated`·`group.removed` 빼기.
- 7.1: "그룹 영역" 행 지움, 고정 요소에서 왼쪽 레일 "그룹"과 칩 "묶기" 빼기(고른 노드 막대의 "묶기"는 P23).

### 정리

시험 세션은 모두 시험 안에서 닫았다(보관·삭제). 창, 백엔드, herdr 서버와 세션 `atrium-dev-p22`, 시험 폴더 `C:\Workspace\mtask-p22-ws`, 시험 대화 기록 폴더(`~/.claude/projects/C--Workspace-mtask-p22-ws-demo`)를 지웠다. 삭제 시험이 휴지통으로 보낸 시험 대화 기록은 휴지통에 남았다. `backend/.dev`(git 밖, 시험 판 기록)는 남겼다. 남은 프로세스 없음, 포트 47840에 듣는 프로세스 없음.
