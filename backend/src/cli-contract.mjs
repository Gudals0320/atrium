// P115: 판이 띄운 세션의 atrium 명령 계약(atrium help --json). 동사, 인자, 출력 모양, 종료 코드, 계약 버전.
// 하네스마다 스킬·hook을 맞추지 않고, 모델은 `atrium help` 하나로 쓸 수 있어야 한다(이슈 #11 4.1 1층). 동사와 출력은 P8~P81 그대로다.
// 버전: 동사·인자·출력 모양을 바꾸거나 빼면 올린다. 더하기만 하면 그대로 둔다.
// 2(P116): 에이전트끼리 일 시키기 prompt·wait·read를 더하고(전에는 터미널 명령), 하위 세션 응답의 다음 명령(next)이 atrium 명령이 되었다. 종료 코드 3(기다리는 시간이 끝남)
// 3(P156): 일 관계(하위·동료·독립). child --peer와 응답 relation, relate 동사, children은 하위 관계만(동료는 peers), child-kill은 하위 관계로만 내려가고 남긴 세션(kept),
//   me는 상위(parent)·동료(peers)·하위(children)·독립(independent)으로 나눈다(parent·children이 계보가 아니라 일 관계를 따른다)
// P180: done·item·items 동사와 prompt·wait 응답의 unit 칸을 더했다(더하기만이라 3 그대로)
// P182: guide 동사(판의 자세한 사용법 + 켜진 rig의 안내)와 rig 거절(rig_rejected, 종료 코드 1)을 더했다(더하기만이라 3 그대로)
// P183: tool 동사(rig 도구 실행, --wait, --runs)와 items의 toolRuns 칸을 더했다(더하기만이라 3 그대로)
// 4(P185): rig 자리(seat) 세션의 보내기와 끝내기가 정의를 따른다. 자리 세션의 prompt는 흐름의 assign 줄이면 받는 자리에 일, may면 글만, 그 밖은 거절(rig_refused, 종료 코드 1).
//   prompt <자리 이름>은 그 자리로 보낸다(keep은 앉은 세션, fresh는 새 세션, 상한이면 줄). done은 정의의 results 낱말을 받고 값에 따라 보드가 다음 자리로 넘긴다.
//   me·item·items·prompt·done 응답에 rig·case 칸을 더했다. 자리 없는 세션과 rig가 꺼진 워크스페이스는 3과 같다
// P188: rig 동사(check·log·rollback·cleanup, 관리자 자리만)와 me의 rig.version·rig.manager 칸을 더했다. 자리 세션의 일 머리가 세 줄로 줄었다(값과 자리 목록은 me). 더하기만이라 4 그대로
// P217: rig log --events(장부 읽기)를 더했다(더하기만이라 4 그대로)
// P190: guide rig(보드 내장 rig 만들기 안내, 응답 builtin 칸)와 rig check를 rig가 꺼진 워크스페이스의 어느 세션이든 쓰게 넓혔다(더하기만이라 4 그대로)
// P194: prompt --case <건>(rig 자리 세션이 이을 건을 고름), me의 rig.owned 칸, 건 상태 waiting_owner를 더했다. 건 주인 세션에게 돌아오는 흐름 줄은 일이 아니라 보고다(더하기만이라 4 그대로)
// P204: log 동사(동료 소식에 한 줄)와 news 동사(동료 소식 읽기), me의 news 칸을 더했다(더하기만이라 4 그대로)
// P211: usage 동사(구독 사용량 읽기)를 더했다(더하기만이라 4 그대로)
// P221: rig status·pause·resume·name(고리와 회), prompt 응답의 loop 칸, me의 rig.case.name·loop·paused와 rig.owner를 더했다. request 고리의 입구 자리 세션에 rig 밖 세션이 보낸 글은 새 회를 연다(더하기만이라 4 그대로)
// P216: rig retry <건> [<일>](종료된 자리 세션의 일을 같은 자리의 새 세션에 다시 맡김)와 멈춤 까닭 exited를 더했다(더하기만이라 4 그대로)
// P222: done --artifact(산출물 등록, done 응답의 artifacts 칸), item 응답의 produces 칸, rig artifacts를 더했다(더하기만이라 4 그대로)
// P224: rig propose|proposals|approve|reject(제안과 승인)를 더했다(더하기만이라 4 그대로)
// P230: rig run <고리>(관리자 자리가 every 고리를 지금 한 번 돌림)를 더했다(더하기만이라 4 그대로)
// P242: rig put|accept|return|pass|drop|inbox(rig 역할 세션의 항목 명령)를 더했다(더하기만이라 4 그대로)
// P244: rig tool(rig 역할의 도구)과 rig beat(사람만, 역할 세션은 거절)를 더했다(더하기만이라 4 그대로)
// P245: rig tune|raise|heard(rig 역할의 조정)와 rig role(정의서와 조정 기록 보기)을 더했다(더하기만이라 4 그대로)
// P252: rig answer <올림> "<까닭>"(빌더가 올림에 고치지 않고 답해 닫음)과 raise 응답의 id 칸을 더했다(더하기만이라 5 그대로)
// P248: prompt --steer(스티어링, --now와 같은 길)를 더했다(더하기만이라 4 그대로)
// P237: prompt --talk(rig 자리에 회 없이 글만)와 prompt 응답의 talk 칸, 거절 까닭 rig_run_open을 더했다(더하기만이라 4 그대로)
// P257: docs 동사(이 워크스페이스의 문서 점검 결과, 읽기만)를 더했다(더하기만이라 5 그대로)
// 5(P249): 옛 rig(1·2)를 걷어냈다. tool 동사, prompt --case·--talk, done --artifact와 rig 값, guide rig, rig의 rollback·cleanup·retry·status·pause·resume·name·artifacts·propose·proposals·approve·reject·run, 응답의 rig·case·flow·talk 칸이 없어졌다
// P263: me의 상위·동료·하위·독립·역할 연결마다 kind·paneId 칸을 더했다(판의 연결 알림을 없앤 대신. 더하기만이라 5 그대로)
// P267: guide merger(merger 안내), done 응답의 merge·mergeAsk·retire 칸과 claimedBy merger, items의 merge 칸, news의 kind merge를 더했다(더하기만이라 5 그대로)
// 6(P269): rig를 통째로 걷어냈다. rig 동사, guide 응답의 rig 칸이 없어졌다(옛 rig 역할 세션의 명령은 모르는 동사 오류)
// 7(P284): ask 동사(결정 카드: 사람이 정할 질문을 판에 남김, --done·--list)를 더하고, 하위 워커의 ask는 거절(sub_worker, 종료 코드 1)이다. 사람에게 글로 묻는 세션이 판의 결정 카드를 함께 남기는 새 약속이라 올렸다
// 8(P292): todo 동사(사용자 몫: 사람이 할 일·칠 명령·확인·나중에 할 일을 판에 남김, --cmd·--check·--later·--tell, --done·--list)를 더하고, 결정 카드가 종류(kind) 넷을 가진 "사용자 몫"이 되었다(ask --list 응답 카드에 kind 칸). 사람에게 넘기는 일을 판에 남기는 새 약속이라 올렸다
// 9(P296): 자체 오케스트레이션 세션(런처 칸 orchestrates)은 허용 동사만 가진다. 허용되지 않은 동사는 보드가 not_permitted(종료 코드 1, error.allowed·error.reason)로
//   거절하고, help(사람 글·--json)는 그 세션의 허용 동사만 보인다(--json의 allowed·orchestrates·scope 칸). 세션마다 쓸 수 있는 동사가 달라지는 새 약속이라 올렸다
// P295: ask·todo의 --no-wait·--wait(보내는 때)와 카드의 timing 칸을 더했다(더하기만이라 올리지 않는다)
// P334: done --record(일 기록 파일, 응답의 records 칸 { dir, files }, items의 records 칸)를 더했다(더하기만이라 9 그대로)
// P304: plan 동사(리포별 목표·마일스톤 레인: 레인마다 관리자, 관리자 아닌 쓰기는 막지 않고 표시)와 me의 plans 칸을 더했다(더하기만이라 9 그대로)
export const CONTRACT_VERSION = 9;
// P284: 결정 카드의 상한(질문·보기·맥락 글자 수, 보기 수, 세션당 열린 카드, 사람의 답 글자 수)
export const ASK_QUESTION_MAX = 300;
export const ASK_OPTION_MAX = 80;
export const ASK_OPTIONS_MAX = 6;
export const ASK_WHY_MAX = 300;
export const ASK_OPEN_MAX = 10;
export const ASK_ANSWER_MAX = 2000;
// P292: 사용자 몫(atrium todo)의 상한. 할 일 글·맥락은 ASK_QUESTION_MAX·ASK_WHY_MAX. 열린 카드는 종류 합쳐 ASK_OPEN_MAX(나중에 종류는 따로 TODO_LATER_MAX)
export const TODO_CMDS_MAX = 6;
export const TODO_CMD_MAX = 500;
export const TODO_LATER_MAX = 30;
export const TODO_LATER_TEXT_MAX = 200; // 조건 글
export const TODO_NOTE_MAX = 300; // 사람의 확인 메모
// P204: 동료 소식. atrium log 한 줄의 상한, atrium news가 한 번에 보이는 줄
export const NEWS_LOG_MAX = 300;
export const NEWS_LINES = 20;
// P204: 동료에게 보낼 때와 안 보낼 때(한 원본. 스킬·help·관계 알림·띄움 답이 이 글을 쓴다. 판 안내문은 짧은 PEER_RULE_SHORT)
export const PEER_RULE = '동료에게 `atrium prompt`로 보내는 것은 다섯 경우뿐이다: (1) 상대만 답하거나 정할 수 있는 질문, (2) 일·소유권 넘기기나 받기(넘길 때는 지금 상태와 다음 할 일을 함께), (3) 내 변경이 상대가 맡은 것(파일·설계·결정)이나 상대가 지금 하는 일을 깨거나 바꿀 때(바꾸기 전에), (4) 상대가 기다리는 답, (5) 사람이 전하라고 할 때. 끝날 때마다 결과 보고, 진행 알림, "받았다/알겠다" 답장, 상대 일과 상관없는 일은 보내지 않는다. 한 일은 보드가 동료 소식에 남긴다: 상대 일과 닿는 일을 시작할 때, 상대에게 묻기 전, 일을 넘겨받을 때 `atrium news`로 본다(남길 결정은 `atrium log "<한 줄>"`).';
export const PEER_RULE_SHORT = '동료에게는 다섯 경우(상대만 답할 질문, 일 넘기기·받기, 상대 일을 깨기 전, 기다리는 답, 사람이 시킨 전달)만 보내고 결과 보고·진행·답장은 안 보낸다. 최신 상태는 `atrium news`';

// out: --json일 때 result의 주요 칸. 사람이 읽는 출력(--json 없음)은 같은 내용의 글이다
export const VERBS = [
  { name: 'help', args: ['[--json]'], does: '이 사용법. --json은 이 계약(동사, 인자, 출력, 종료 코드, 버전)', out: ['contract', 'verbs', 'exit'] },
  { name: 'prompt', args: ['<이름>', '"<할 일>"', '[--wait | --steer]', '[--timeout ms]', '[--json]'], does: '다른 에이전트에게 일을 맡긴다. 보드가 받는 쪽 차례에 맞춰 넣고(일하는 중·응답 대기면 끝난 뒤, 잠들었으면 깨운 뒤) 연결을 판에 남긴다. 하위에게 맡겼으면 턴을 끝낸다: 하위가 atrium done으로 닫으면 보드가 그 보고를 너에게 넣고, 보고 없이 멈추면 알린다. --wait면 그 턴(또는 done)까지 기다려 답을 돌려준다(기본 100초, 지금 답이 꼭 필요할 때만). 기본은 대기열이다: 받는 쪽이 지금 하는 일이 끝난 뒤 들어가면 될 글은 그냥 보낸다. 받는 쪽이 지금 하고 있는 일의 방향에 대한 추가 정보·정정이면 --steer(스티어링, 옛 이름 --now): 일하는 중인 Claude Code에 기다리지 않고 대기 메시지로 넣는다(다른 종류는 대기열, --wait와 함께 쓰지 않는다). done 보고와 판 알림은 늘 대기열이다', out: ['name', 'agentName', 'kind', 'state', 'woke', 'deliveryId', 'delivery', 'turn', 'next', 'unit'] },
  { name: 'wait', args: ['<이름>', '[--timeout ms]', '[--json]'], does: '그 세션이 지금 턴(너의 글이 대기열에 있으면 그 글의 턴)을 끝낼 때까지 기다려 마지막 답을 돌려준다(기본 100초). 사람의 답을 기다리면 바로 돌아온다. 맡긴 일의 보고는 보드가 가져다주므로 되풀이해 치지 않는다', out: ['name', 'agentName', 'kind', 'status', 'state', 'ms', 'answer', 'ask', 'error', 'delivery', 'next', 'unit'] },
  { name: 'read', args: ['<이름>', '[--lines n]', '[--json]'], does: '그 세션 화면의 최근 줄(기본 80줄). 잠든 세션은 마지막 답', out: ['name', 'agentName', 'kind', 'state', 'lines', 'source', 'text', 'answer', 'next'] },
  { name: 'me', args: ['[--json]'], does: '너의 지금 연결: 상위(너를 하위로 둔 세션), 동료, 하위, 독립, 역할 연결, 상대마다 종류와 마지막 지시. 보드의 지금 기록. 사람이 판에서 잇거나 끊은 역할 연결은 알림 없이 여기에만 보인다', out: ['me', 'parent', 'peers', 'children', 'independent', 'lineage', 'roles', 'news', 'plans'] },
  { name: 'child', args: ['[이름]', '[--peer]', '[--prompt "첫 요청"]', '[--role 역할]', '[--cwd 폴더]', '[--worktree 이름]', '[--model 모델]', '[--launcher 런처]', '[--effort 수준]', '[--kind 종류]', '[--head]', '[--no-wait]', '[--json]'], does: '세션을 띄우고 준비될 때까지 기다린다. 기본은 하위 워커(--prompt의 일을 atrium done으로 너에게 보고), --peer면 동료(같은 위계의 협력자. 질문·넘기기·상대 일을 바꾸는 변경 때만 서로 보내고, 한 일은 보드의 동료 소식에 남는다). 응답 첫 줄이 관계다', out: ['name', 'agentName', 'paneId', 'kind', 'relation', 'role', 'depth', 'state', 'status', 'next'] },
  { name: 'relate', args: ['<이름>', 'sub|peer|none|auto', '[--json]'], does: '나와 그 세션의 관계를 바꾼다(그 세션이 나의 sub 하위, peer 동료, none 독립, auto 자동 = 띄움·역할 선을 따름). 너와 이어진 세션만, 사람이 정한 관계는 바꾸지 않는다', out: ['a', 'b', 'relation', 'source', 'effective', 'before'] },
  // P204: 동료 소식(보드가 남기는 기록. 동료끼리 결과를 보고하지 않고 필요할 때 읽는다)
  { name: 'log', args: ['"<한 줄>"', '[--json]'], does: `동료 소식에 너의 한 줄을 남긴다(${NEWS_LOG_MAX}자까지). 누구에게도 보내지 않고 누구도 깨우지 않는다. 동료가 알아 둘 결정·변경·상태를 남길 때`, out: ['id', 'at', 'chars'] },
  { name: 'news', args: ['[<이름>]', '[--all]', '[--json]'], does: '동료 소식(보드가 남긴 동료의 턴 끝 한 줄, done, atrium log). 기본은 너의 동료가 네가 마지막으로 본 뒤 남긴 것을 오래된 것부터 20줄 보이고 읽은 자리를 옮긴다. <이름>이면 그 세션의 최근 것(판의 어느 세션이든, 읽기만), --all은 읽은 자리와 상관없이 동료의 최근 것', out: ['rows', 'more', 'unread', 'peers', 'name'] },
  { name: 'children', args: ['[--all]', '[--json]'], does: '너의 하위 세션(--all이면 그 아래까지) 상태와 마지막 응답. 하위 관계만, 동료는 따로 한 줄', out: ['children', 'peers'] },
  { name: 'child-kill', args: ['<이름>', '[--only]', '[--json]'], does: '너의 하위 세션을 끈다(하위 관계로만 그 아래도 함께, --only면 그것만). 동료·독립은 끄지 않고 남긴 이름을 적는다. 사람이 끄라고 할 때만', out: ['killed', 'kept'] },
  { name: 'child-wait', args: ['<이름>', '[--json]'], does: '그 하위 세션이 지시를 받을 수 있게 될 때까지 기다린다(한 번에 100초)', out: ['name', 'state', 'timeout', 'next'] },
  { name: 'wake', args: ['<이름>', '[--json]'], does: '잠든 세션을 깨운다(같은 대화로 이어 간다). atrium prompt는 잠든 세션을 깨운 뒤 넣으므로 미리 깨울 때만', out: ['name', 'woke', 'state', 'next'] },
  { name: 'models', args: ['[--json]'], does: '띄울 수 있는 런처·모델과 각각을 띄우는 atrium child 명령', out: ['entries', 'gateways', 'parent'] },
  // P180: 일 단위. 첫 요청 앞에 "[Atrium 보드] … 맡긴 일 u…" 머리가 붙은 일을 받은 세션이 끝을 알린다
  { name: 'done', args: ['ok|failed', '"<보고>"', '[--file 경로]', '[--record 파일]…', '[--json]'], does: '보드가 맡긴 지금 일을 닫는다(ok 끝냈다, failed 못 했다). 값과 보고는 맡긴 세션에게 한 번 간다(그 세션이 기다리는 중이면 그 기다림이 받는다). 닫은 뒤 쉰다. 열린 일이 없으면 종료 코드 1. --record: 일의 결과 파일(조사·감사·제안·측정·인계)을 커밋하지 않고 붙인다(보드가 주 체크아웃의 .atrium/records/로 복사하고 보고에 경로를 붙인다. 저장소 안 파일만, 파일 2MB·20개까지)', out: ['unit', 'result', 'parent', 'claimedBy', 'next', 'queued', 'records'] },
  { name: 'item', args: ['[--json]'], does: '너의 지금 일: 맡긴 세션, 할 일, 시작, 뒤에 줄 선 일 수', out: ['item', 'queued'] },
  { name: 'items', args: ['[--json]'], does: '네가 맡긴 일들: 맡은 세션, 상태(open·done·failed·cancelled), 결과와 보고', out: ['items', 'open'] },
  // P182: 자세한 사용법. P267: merger 안내
  { name: 'guide', args: ['[merger]', '[--json]'], does: '자세한 사용법(help --long). merger면 병합 merger의 안내', out: ['merger'] },
  // P257: 문서 점검(보드가 지휘 세션의 턴 끝과 done 알림에 한 줄로 알리는 것의 자세한 결과)
  { name: 'docs', args: ['[--json]'], does: '이 워크스페이스의 문서 점검 결과: 문서마다 글자 수와 예산, 허락한 꼴, PLAN의 세 절과 끝남 표시, HEAD보다 커짐. 막지 않는다. 문서는 지휘 세션이 고치고 워커는 바꿀 문장을 done 보고에 적는다', out: ['on', 'dir', 'rows', 'total', 'problems', 'lead'] },
  // P211: 구독 사용량(보드가 로컬 출처에서 모은 마지막 값. 읽기만)
  { name: 'usage', args: ['[--json]'], does: '구독 사용량(Claude, Codex, AGY): 한도 창(5시간·주간 등)마다 사용률과 리셋까지 남은 시간, 크레딧, 요금제, 받은 때. 보드가 이 PC의 로컬 출처에서 모은 마지막 값이고 모르면 모름. 일을 크게 나누기 전에 남은 양을 볼 때', out: ['providers', 'alertsOn', 'at'] },
  // P284: 결정 카드(사람에게 글로 묻는 질문을 판에 따로 남긴다. 대화를 갈음하지 않는다)
  { name: 'ask', args: ['"<질문 한 줄>"', '[--option "<보기>"]…', '[--why "<맥락 한 줄>"]', '[--no-wait | --wait]', '| --done <번호>', '| --list', '[--json]'], does: `사람이 정해야 할 질문("이대로 마무리할까요?", "이 방향으로 갈까요?")을 대화에 글로 묻고 이것으로 보드에도 결정 카드로 남긴다(질문 ${ASK_QUESTION_MAX}자, 보기 ${ASK_OPTIONS_MAX}개·각 ${ASK_OPTION_MAX}자, 맥락 ${ASK_WHY_MAX}자, 열린 카드 ${ASK_OPEN_MAX}장까지). 사람이 카드에서 답하면 "[결정] <질문> → <답>" 글로 들어오고, 무시하면 아무것도 오지 않는다. 권한·신뢰·하네스 질문은 아니다. 사람과 직접 일하는 세션만 쓰고 하위 워커는 부모에게 atrium prompt로 묻는다. --no-wait는 답을 기다리지 않는 질문(답이 너에게 다음 글이 갈 때 그 앞에 실려 온다), --wait는 답을 기다리며 멈추는 질문(곧바로 온다). 주지 않으면 보드가 정한다(질문한 턴 뒤로 쉬면 곧바로). --done <번호>는 사람이 다른 길로 답해 끝난 카드를 닫고, --list는 너의 열린 카드`, out: ['id', 'open', 'max', 'card', 'cards', 'closed', 'state'] },
  // P292: 사용자 몫(사람에게 넘기는 일·명령·확인·미룬 일. 결정 카드와 같은 목록)
  { name: 'todo', args: ['"<할 일 한 줄>"', '[--cmd "<명령>"]…', '[--check]', '[--later "<YYYY-MM-DD[ HH:MM] 또는 조건>"]', '[--why "<맥락 한 줄>"]', '[--tell]', '[--no-wait | --wait]', '| --done <번호>', '| --list', '[--json]'], does: `사람이 해야 할 일(터미널에 칠 명령, 해 줄 행동, 검증, 나중으로 미룬 일)을 대화에 쓰고 이것으로 보드의 "할 일 목록"에도 남긴다. 카드 종류는 결정·실행·확인·나중에. 기본은 실행(사람이 "했음"을 누르면 기록만, --tell이면 "[실행] <할 일> → 했음" 글이 온다). --cmd는 사람이 복사할 명령(${TODO_CMDS_MAX}개, 각 ${TODO_CMD_MAX}자). --check는 확인(사람이 "됐다/안 됐다: 메모"로 답하면 "[확인] <할 일> → 됐다: 메모" 글이 온다). --later는 나중에(날짜·시각이면 그때까지 숨겼다가 띄우고, 조건 글이면 사람이 꺼낼 때까지 "나중"에 둔다). 확인 결과와 --tell의 했음은 기본으로 너에게 다음 글이 갈 때 그 앞에 실려 온다(기다리며 멈출 거면 --wait). 열린 카드는 결정 카드와 합쳐 ${ASK_OPEN_MAX}장, 나중에는 따로 ${TODO_LATER_MAX}장까지. 사람과 직접 일하는 세션만 쓰고 하위 워커는 부모에게 atrium prompt로 넘긴다. --done <번호>는 끝난(쓸모없어진) 카드를 닫고, --list는 너의 열린 것과 나중 것`, out: ['id', 'kind', 'open', 'max', 'card', 'cards', 'closed', 'state'] },
  // P304: 리포별 목표·마일스톤 레인(워크스페이스 안에 여럿, 레인마다 관리자 세션)
  { name: 'plan', args: ['[show | list | new | goal | metric | ms | focus | item | check | owner | status | import | export | log]', '…', '[--plan <이름|번호>]', '[--json]'], does: '이 리포(워크스페이스)의 목표·마일스톤 레인. 레인마다 이름·목표·측정값·마일스톤(M1…)·focus·상태와 관리자 세션(만든 세션, owner로 넘김)이 있다. new로 만들고 list로 보고, 나머지는 --plan <이름|번호>로 레인을 고른다(빼면 네가 관리하는 레인이 하나일 때 그것). 관리자는 자기 레인을 지금 상태로 유지한다. 고치라는 지시가 없으면 남의 레인은 읽기만 한다(보드는 막지 않고 관리자 아님으로 남긴다). 마일스톤의 끝 기준에 드는 사람 몫은 item … --who user(사람의 할 일 목록에 뜬다), 일회성으로 사람에게 넘기는 것은 todo. 하위 낱말과 예: atrium help plan', out: ['ok', 'rev', 'changed', 'manager', 'plan', 'lanes', 'doc', 'summary', 'otherChanges', 'counts', 'rows'] },
];
// 종료 코드: 0 성공, 1 보드가 거절하거나 실패(이유는 stderr와 --json의 error), 2 명령을 잘못 씀, 3 기다리는 시간이 끝남(일은 계속된다. 다시 atrium wait)
export const EXIT = { ok: 0, refused: 1, usage: 2, timeout: 3 };
export const VERB_NAMES = VERBS.map((v) => v.name).filter((n) => n !== 'help');
// P116: atrium wait의 결과(status)
export const WAIT_STATUS = ['done', 'idle', 'waiting', 'timeout', 'failed', 'unconfirmed', 'closed', 'exited', 'sleeping', 'error'];

// P156: 띄울 때 관계를 고르는 안내(짧은 help, --long, 스킬, 판의 짧은 안내가 같은 뜻을 말한다)
export const RELATION_HELP = [
  '띄울 때 관계를 고른다: 사용자가 협력·동료·같이·파트너·나란히를 말하면 --peer(동료: 같은 위계, 사람에게 직접 답해도 된다). 워커·하위·맡겨·나눠·병렬을 말하면 기본(하위 워커: 끝나면 atrium done으로 너에게 보고, child-kill로 함께 꺼진다). 그 밖에는 첫 지시와 역할 이름으로 판단한다(같은 수준의 다른 일을 맡은 상대면 동료, 네 일의 한 조각이면 하위). 나중에 바꾸기: atrium relate <이름> sub|peer|none|auto.',
  PEER_RULE, // P204
];

// P296: 그 세션이 쓸 수 있는 동사만(allowed null = 모두). perm: { orchestrates, scope, allowed } | null
export const verbsFor = (allowed = null) => (allowed ? VERBS.filter((v) => allowed.includes(v.name)) : VERBS);
export function permHelpLine(perm) {
  if (!perm || !perm.allowed) return null;
  return perm.scope === 'sub'
    ? '이 세션은 자체 오케스트레이션 하네스이고 부모의 하위라 보드와는 부모하고만 말한다(atrium prompt는 부모에게만). 아래 동사만 있고 그 밖은 보드가 거절한다(not_permitted).'
    : '이 세션은 자체 오케스트레이션 하네스라 하위 세션 만들기·끄기·관계 바꾸기(child, child-kill, child-wait, relate)가 없다. 안의 일은 하네스가 나눈다. 아래 동사만 있고 그 밖은 보드가 거절한다(not_permitted).';
}
// 모델이 읽는 짧은 사용법(동사마다 한 줄). P296: perm을 주면 그 세션의 허용 동사만
export function shortHelp(perm = null) {
  const line = permHelpLine(perm);
  const orch = !!(perm && perm.allowed);
  return [
    `atrium(계약 ${CONTRACT_VERSION}): 보드가 띄운 세션이 보드와 말하는 명령. 옛 이름 mtask도 같다.`,
    ...(line ? [line] : []),
    ...verbsFor(perm && perm.allowed).map((v) => `  atrium ${v.name}${v.args.length ? ' ' + v.args.join(' ') : ''}\n      ${v.does}`),
    orch ? '이름은 보드의 세션 이름이다(@ 없이도 된다). atrium은 보드와 말할 때만 쓴다. 하네스 안의 하위 에이전트·위임·팀은 하네스의 방식대로 쓴다(보드를 거치지 않는다).' // P296·P297: 하네스 안 위임을 막지 않게
      : '이름은 보드의 세션 이름이다(@ 없이도 된다). 다른 에이전트에게는 atrium prompt로만 보낸다(터미널 명령으로 직접 보내면 보드가 연결을 남기지 못한다).',
    ...(orch ? [] : RELATION_HELP),
    '종료 코드: 0 성공, 1 보드가 거절·실패, 2 명령을 잘못 씀, 3 기다리는 시간이 끝남(다시 atrium wait). 기계용 계약: atrium help --json. 자세한 설명: atrium help --long',
  ].join('\n');
}
export const contractJson = (perm = null) => ({ contract: CONTRACT_VERSION, verbs: verbsFor(perm && perm.allowed), exit: EXIT, waitStatus: WAIT_STATUS, relations: ['sub', 'peer', 'none', 'auto'], relationHelp: RELATION_HELP.join('\n'), // P156
  ...(perm && perm.allowed ? { orchestrates: true, scope: perm.scope, allowed: [...perm.allowed] } : {}) }); // P296: 오케스트레이션 세션의 허용 동사
