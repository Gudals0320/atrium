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
// 10(P346): docs 동사에 init·on·off 낱말(문서 시작, 점검 켜기·끄기, 지휘 세션만 = 워커는 not_lead로 거절)과 응답의 action·created·skipped·next 칸을 더했다.
//   에이전트가 저장소에 파일과 설정을 쓰는 새 약속이라 올렸다
// 11(P360): revive 동사(닫힘·보관·사람이 끝냄·잠듦·판 밖 대화를 같은 세션 ID로 되살림, 관계 되찾기)와 fork 동사(Claude Code 대화를 이어받는 새 세션,
//   --launcher claude-sdk면 API 크레딧)를 더했다. 에이전트가 사람의 말로 세션을 되살리고 과금이 다른 세션을 띄우는 새 약속이라 올렸다
// 12(P364): know 동사(작업 지식 찾기: 이 리포의 지우지 않은 원문을 전문 검색해 위치와 짧은 발췌, open·unit·build, --usage)를 더했다.
//   막혔을 때 판이 아니라 에이전트가 스스로 묻는 새 약속(안내문 한 줄)이라 올렸다. 자체 오케스트레이션 하위 세션도 쓴다(읽기만)
// P371: know의 --self(부른 세션 자기 단위의 것도 넣기)와 결과의 line·copies·also 칸, 응답의 self 칸을 더했다. 순위·포인터·발췌가 절 단위다(더하기만이라 12 그대로)
// 13(P380): prompt --raw(보드 머리 줄과 앞에 붙는 사람의 답 없이 글을 그대로 맨 앞에. 하위에게 새 일이면 일은 만들고 머리는 판 기록에만)를 더했다.
//   부른 세션이 OmO(omo)면 사람 글 출력에서 홀로 선 위험 낱말(risky-words.mjs)을 다른 표기로 바꾸고(--json·경로·플래그 값은 그대로), child --kind는 대소문자를 가리지 않는다. 보내는 글의 모양을 바꾸는 새 약속이라 올렸다
// 14(P384): answer 동사(하위의 질문 창에 부모가 번호·글로 답한다, 일 부모만 = 그 밖은 not_parent)를 더하고, 하위 세션의 질문 창은 사람 대신 부모에게 판 알림으로 간다.
//   부모가 사람 대신 하위의 질문에 답하는 새 약속이라 올렸다. wait의 ask에 answer 칸(답하는 명령)
export const CONTRACT_VERSION = 14;
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
  { name: 'prompt', args: ['<이름>', '"<할 일>"', '[--wait | --steer]', '[--raw]', '[--timeout ms]', '[--json]'], does: '다른 에이전트에게 일을 맡긴다. 보드가 받는 쪽 차례에 맞춰 넣고(일하는 중·응답 대기면 끝난 뒤, 잠들었으면 깨운 뒤) 연결을 판에 남긴다. 하위에게 맡겼으면 턴을 끝낸다: 하위가 atrium done으로 닫으면 보드가 그 보고를 너에게 넣고, 보고 없이 멈추면 알린다. --wait면 그 턴(또는 done)까지 기다려 답을 돌려준다(기본 100초, 지금 답이 꼭 필요할 때만). 기본은 대기열이다: 받는 쪽이 지금 하는 일이 끝난 뒤 들어가면 될 글은 그냥 보낸다. 받는 쪽이 지금 하고 있는 일의 방향에 대한 추가 정보·정정이면 --steer(스티어링, 옛 이름 --now): 일하는 중인 Claude Code에 기다리지 않고 대기 메시지로 넣는다(다른 종류는 대기열, --wait와 함께 쓰지 않는다). done 보고와 판 알림은 늘 대기열이다. --raw는 보드 머리 줄(관계·일·약속) 없이 글을 그대로 맨 앞에 넣는다: 슬래시 명령(/ulw-plan 등)은 입력 맨 앞이어야 하네스가 명령으로 받는다(하위에게 새 일이면 일은 그대로 만들어지고 머리는 판 기록에만 남는다. 머리가 빠지므로 그 하위는 자기 일을 atrium item으로 안다. --raw는 슬래시 명령용이고 보통 지시는 --raw 없이 보낸다)', out: ['name', 'agentName', 'kind', 'state', 'woke', 'deliveryId', 'delivery', 'turn', 'next', 'unit'] },
  { name: 'wait', args: ['<이름>', '[--timeout ms]', '[--json]'], does: '그 세션이 지금 턴(너의 글이 대기열에 있으면 그 글의 턴)을 끝낼 때까지 기다려 마지막 답을 돌려준다(기본 100초). 사람의 답을 기다리면 바로 돌아온다. 맡긴 일의 보고는 보드가 가져다주므로 되풀이해 치지 않는다', out: ['name', 'agentName', 'kind', 'status', 'state', 'ms', 'answer', 'ask', 'error', 'delivery', 'next', 'unit'] },
  { name: 'read', args: ['<이름>', '[--lines n]', '[--json]'], does: '그 세션 화면의 최근 줄(기본 80줄). 잠든 세션은 마지막 답. omo는 기록 요약(record: 열린 질문·할 일 단계·하위 작업·goal)도', out: ['name', 'agentName', 'kind', 'state', 'lines', 'source', 'text', 'answer', 'record', 'next'] },
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
  // P346: init·on·off(지휘 세션만)
  { name: 'docs', args: ['[init [--dir 폴더] [--only brief,arch,plan] | on [--dir 폴더] | off]', '[--json]'], does: '이 워크스페이스의 문서 점검 결과: 문서마다 글자 수와 예산, 허락한 꼴, PLAN의 세 절과 끝남 표시, HEAD보다 커짐. 막지 않는다. 문서는 지휘 세션이 고치고 워커는 바꿀 문장을 done 보고에 적는다. init은 살아 있는 문서가 없는 저장소에 BRIEF(왜·무엇·정한 것)·ARCH(지금 구조)·PLAN(지금 / 다음 / 열린 결정) 틀을 만들고(없는 파일만, 있는 파일은 덮지 않는다) .atrium/docs.json에 예산을 적어 점검을 켠다(--only로 고르고 --dir로 자리를 정한다). on·off는 점검을 켜고 끈다. init·on·off는 지휘 세션만(워커는 not_lead로 거절)', out: ['on', 'dir', 'rows', 'total', 'problems', 'lead', 'action', 'created', 'skipped', 'next', 'off'] },
  // P211: 구독 사용량(보드가 로컬 출처에서 모은 마지막 값. 읽기만)
  { name: 'usage', args: ['[--json]'], does: '구독 사용량(Claude, Codex, AGY): 한도 창(5시간·주간 등)마다 사용률과 리셋까지 남은 시간, 크레딧, 요금제, 받은 때. 보드가 이 PC의 로컬 출처에서 모은 마지막 값이고 모르면 모름. 일을 크게 나누기 전에 남은 양을 볼 때', out: ['providers', 'alertsOn', 'at'] },
  // P284: 결정 카드(사람에게 글로 묻는 질문을 판에 따로 남긴다. 대화를 갈음하지 않는다)
  { name: 'ask', args: ['"<질문 한 줄>"', '[--option "<보기>"]…', '[--why "<맥락 한 줄>"]', '[--no-wait | --wait]', '| --done <번호>', '| --reopen <번호>', '| --list', '[--json]'], does: `사람이 정해야 할 질문("이대로 마무리할까요?", "이 방향으로 갈까요?")을 대화에 글로 묻고 이것으로 보드에도 결정 카드로 남긴다(질문 ${ASK_QUESTION_MAX}자, 보기 ${ASK_OPTIONS_MAX}개·각 ${ASK_OPTION_MAX}자, 맥락 ${ASK_WHY_MAX}자, 열린 카드 ${ASK_OPEN_MAX}장까지). 사람이 카드에서 답하면 "[결정] <질문> → <답>" 글로 들어오고, 무시하면 아무것도 오지 않는다. 권한·신뢰·하네스 질문은 아니다. 사람과 직접 일하는 세션만 쓰고 하위 워커는 부모에게 atrium prompt로 묻는다. --no-wait는 답을 기다리지 않는 질문(답이 너에게 다음 글이 갈 때 그 앞에 실려 온다), --wait는 답을 기다리며 멈추는 질문(곧바로 온다). 주지 않으면 보드가 정한다(질문한 턴 뒤로 쉬면 곧바로). --done <번호>는 사람이 다른 길로 답해 끝난 카드를 닫고, --reopen <번호>는 끝난 카드를 다시 연다(사람이 터미널에 친 글로 보드가 닫았는데 답이 아니었을 때), --list는 너의 열린 카드`, out: ['id', 'open', 'max', 'card', 'cards', 'closed', 'state'] },
  // P292: 사용자 몫(사람에게 넘기는 일·명령·확인·미룬 일. 결정 카드와 같은 목록)
  { name: 'todo', args: ['"<할 일 한 줄>"', '[--cmd "<명령>"]…', '[--check]', '[--later "<YYYY-MM-DD[ HH:MM] 또는 조건>"]', '[--why "<맥락 한 줄>"]', '[--tell]', '[--no-wait | --wait]', '| --done <번호>', '| --reopen <번호>', '| --list', '[--json]'], does: `사람이 해야 할 일(터미널에 칠 명령, 해 줄 행동, 검증, 나중으로 미룬 일)을 대화에 쓰고 이것으로 보드의 "할 일 목록"에도 남긴다. 카드 종류는 결정·실행·확인·나중에. 기본은 실행(사람이 "했음"을 누르면 기록만, --tell이면 "[실행] <할 일> → 했음" 글이 온다). --cmd는 사람이 복사할 명령(${TODO_CMDS_MAX}개, 각 ${TODO_CMD_MAX}자). --check는 확인(사람이 "됐다/안 됐다: 메모"로 답하면 "[확인] <할 일> → 됐다: 메모" 글이 온다). --later는 나중에(날짜·시각이면 그때까지 숨겼다가 띄우고, 조건 글이면 사람이 꺼낼 때까지 "나중"에 둔다). 확인 결과와 --tell의 했음은 기본으로 너에게 다음 글이 갈 때 그 앞에 실려 온다(기다리며 멈출 거면 --wait). 열린 카드는 결정 카드와 합쳐 ${ASK_OPEN_MAX}장, 나중에는 따로 ${TODO_LATER_MAX}장까지. 사람과 직접 일하는 세션만 쓰고 하위 워커는 부모에게 atrium prompt로 넘긴다. --done <번호>는 끝난(쓸모없어진) 카드를 닫고, --reopen <번호>는 끝난 카드를 다시 열고, --list는 너의 열린 것과 나중 것`, out: ['id', 'kind', 'open', 'max', 'card', 'cards', 'closed', 'state'] },
  // P304: 리포별 목표·마일스톤 레인(워크스페이스 안에 여럿, 레인마다 관리자 세션)
  { name: 'plan', args: ['[show | list | new | goal | metric | ms | focus | item | check | owner | status | import | export | log]', '…', '[--plan <이름|번호>]', '[--json]'], does: '이 리포(워크스페이스)의 목표·마일스톤 레인. 레인마다 이름·목표·측정값·마일스톤(M1…)·focus·상태와 관리자 세션(만든 세션, owner로 넘김)이 있다. new로 만들고 list로 보고, 나머지는 --plan <이름|번호>로 레인을 고른다(빼면 네가 관리하는 레인이 하나일 때 그것). 관리자는 자기 레인을 지금 상태로 유지한다. 고치라는 지시가 없으면 남의 레인은 읽기만 한다(보드는 막지 않고 관리자 아님으로 남긴다). 마일스톤의 끝 기준에 드는 사람 몫은 item … --who user(사람의 할 일 목록에 뜬다), 일회성으로 사람에게 넘기는 것은 todo. 하위 낱말과 예: atrium help plan', out: ['ok', 'rev', 'changed', 'manager', 'plan', 'lanes', 'doc', 'summary', 'otherChanges', 'counts', 'rows'] },
  // P360: 되살리기·갈라 열기(사람이 세션 이름이나 ID를 말하며 시킬 때만)
  { name: 'revive', args: ['<이름|세션 ID|대화 ID>', '[--json]'], does: '닫힌·보관된·사람이 끝낸·잠든 세션을 같은 세션 ID(같은 대화)로 다시 띄운다(잠듦은 깨우기, 보관은 꺼내며 연다, 판 밖 Claude Code 대화 ID면 판으로 연다. 다른 곳에서 쓰는 대화는 거절). 이름·자리·계보 부모·닫힐 때 뗀 역할 선을 되찾고 못 되찾은 것을 적는다. 이름이 겹치면 -2. 살아 있는 세션은 거절하고 그 이름을 돌려준다. 사람이 세션 이름이나 ID를 말하며 되살리라고 할 때만', out: ['name', 'sessionId', 'from', 'state', 'billing', 'relations', 'lines'] },
  { name: 'fork', args: ['<이름|세션 ID|대화 ID>', '[--launcher 런처]', '[--name 새 이름]', '[--model 모델]', '[--effort 수준]', '[--peer]', '[--json]'], does: 'Claude Code 세션(살아 있든 닫혔든)의 대화를 이어받는 새 세션을 원래 세션 곁에 띄운다(원래 세션은 그대로). 기본 런처는 원래 세션의 것, --launcher claude-sdk면 SDK 세션(API 크레딧 과금, 키가 없으면 거절). 모델·노력은 원래 세션의 지금 값이 기본. 관계는 기본 독립(--peer면 너의 동료). 응답에 과금과 대화 크기(첫 턴에 대화 전체를 캐시에 새로 쓴다). 사람이 갈라 열라고 할 때만', out: ['name', 'sessionId', 'from', 'billing', 'sdk', 'model', 'effort', 'relation', 'size', 'lines'] },
  // P364: 작업 지식 찾기(읽기만)
  { name: 'know', args: ['"<물음>"', '[-k N]', '[--kind doc|log|record|review|code|db]', '[--before <시각|커밋>]', '[--self]', '| open <포인터> [--context n]', '| unit <PNNN>', '| build [--full]', '| --usage [--since <날짜|7d>]', '[--json]'], does: '작업 지식 찾기: 이 워크스페이스(리포)의 지우지 않은 원문(문서, docs/log·experiments·.atrium/records 기록, 코드 주석, 판의 일 spec·done 보고·결정·할 일 카드)을 전문 검색(trigram BM25)해 상위 N개(기본 5)의 위치(경로:줄-줄 또는 db:<표>/<행>)·날짜·단위 번호·종류와 짧은 발췌를 돌려준다. 첫 줄은 돌려준 글자 수. 결과 하나는 한 파일에서 맞은 낱말이 가장 몰린 절(제목 경계)이고 발췌 앞 L<줄>은 맞은 줄이다. 같은 파일의 다른 맞은 절(다른 절)과 같은 글의 다른 자리(같은 글)는 꼬리표로 붙는다. 부른 세션 단위(세션 이름·지금 일의 PNNN)의 작업 파일·기록·판 일·done은 빼고 --self면 넣는다. 시작할 때 건드릴 부분을 한 번 찾고 막히면 다시 찾고, 필요한 파일만 연다. 하위에게 맡기기 전에는 그 일이 건드릴 부분을 1~3번 찾아 지시의 힌트로 적는다. open <포인터>는 원문(--context n줄 더), unit <PNNN>은 그 단위의 작업 파일·기록·검토·판 일·코드 주석·커밋을 순위와 상관없이. --kind로 종류를, --before <시각|커밋>으로 그 뒤에 생긴 원천을 뺀다. 걷어낸 기능의 것이면 걷어냄, 대체된 결정이면 대체됨 → 지금: <문장>(<포인터>) 표시와 status 칸(둘 다 저장소의 .atrium/know.json 선언대로). build [--full]은 색인 다시 짓기, --usage [--since]는 사용 집계. 읽기만', out: ['total_chars', 'mode', 'results', 'pointer', 'kind', 'date', 'unit', 'flags', 'status', 'excerpt', 'line', 'copies', 'also', 'self', 'text', 'usage'] },
  // P384: 하위의 질문 창에 답하기(일 부모만)
  { name: 'answer', args: ['<이름>', '<번호|"글">', '[<번호|"글">]…', '[--json]'], does: '너의 하위가 띄운 질문 창(Claude Code AskUserQuestion, OmO ask_user_question)에 답한다. 보드가 사람 대신 너에게 질문 본문·번호 붙인 보기·추천을 판 알림으로 보낸다. 번호는 그 보기, 보기 밖의 답은 따옴표로 묶은 글, 여러 개 고르기는 1,3, 질문이 여럿이면 차례로 하나씩. 보드가 그 답을 질문 창에 치고 질문이 닫혔는지(answered)를 돌려준다. 일상적인 구현·설계 질문은 네가 정해 답하고, 기능을 없앰·입력이나 기본값을 바꿈·범위나 비용이 바뀜·되돌리기 어려움·BRIEF 결정과 다름이면 atrium ask로 사람에게 묻고 그 답으로 답한다. 정해진 시간(보드 설정, 기본 10분) 안에 답하지 않으면 보드가 그 질문을 사람에게 올린다. 일 부모만 쓴다(그 밖은 not_parent). 권한 승인·신뢰 질문은 사람이 답한다', out: ['name', 'answered', 'label', 'state', 'next'] },
];
// 종료 코드: 0 성공, 1 보드가 거절하거나 실패(이유는 stderr와 --json의 error), 2 명령을 잘못 씀, 3 기다리는 시간이 끝남(일은 계속된다. 다시 atrium wait)
export const EXIT = { ok: 0, refused: 1, usage: 2, timeout: 3 };
export const VERB_NAMES = VERBS.map((v) => v.name).filter((n) => n !== 'help');
// P116: atrium wait의 결과(status)
export const WAIT_STATUS = ['done', 'idle', 'waiting', 'timeout', 'failed', 'unconfirmed', 'closed', 'exited', 'sleeping', 'error'];

// P156: 띄울 때 관계를 고르는 안내(짧은 help, --long, 스킬, 판의 짧은 안내가 같은 뜻을 말한다)
// P360: 되살리기·갈라 열기는 사람이 시킬 때만(스킬·판 안내문·help가 같은 뜻)
export const REVIVE_RULE = '사람이 세션 이름이나 ID를 말하며 되살리거나 SDK(API 크레딧)로 갈라 열라고 하면 `atrium revive <이름|ID>`·`atrium fork <이름|ID> --launcher claude-sdk`를 쓴다(사람이 시킬 때만).';
// P364: 막혔을 때 스스로 찾기(판 안내문·help·스킬이 같은 뜻. 하네스 안내문은 큰따옴표 없는 꼴)
// P368: 시작할 때 한 번 찾고 막히면 다시(사용자 결정 2026-11-26: 시작 전에 찾은 쪽이 같은 품질에 시간·토큰을 약 15% 덜 썼다)
export const KNOW_RULE = '시작할 때 네가 건드릴 부분을 `atrium know "<물음>"`로 한 번 찾고, 막히면 다시 찾는다(위치와 짧은 발췌, 필요한 파일만 연다).';
export const KNOW_RULE_PLAIN = '시작할 때 네가 건드릴 부분을 `atrium know <따옴표로 묶은 물음>`로 한 번 찾고, 막히면 다시 찾는다(위치와 짧은 발췌, 필요한 파일만 연다).';
// P368: 맡기는 쪽(판·하네스 안내문, help, 스킬). 자체 오케스트레이션 하네스에는 주지 않는다(판이 하위를 주지 않는다). 줄바꿈·큰따옴표 없음
export const KNOW_HINT_RULE = '하위에게 맡기기 전에 그 일이 건드릴 부분을 `atrium know`로 1~3번 찾고, 쓸 만한 위치를 지시의 힌트로 적는다.';
export const REVIVE_RULE_SHORT = '사람이 세션 이름·ID로 되살리거나 SDK로 갈라 열라고 할 때만 `atrium revive`·`atrium fork`.'; // 판·하네스 안내문의 짧은 꼴
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
    ...(orch ? [] : [REVIVE_RULE]), // P360
    KNOW_RULE, // P364
    ...(orch ? [] : [KNOW_HINT_RULE]), // P368: 맡기는 쪽(자체 오케스트레이션 하네스는 빼기)
    '종료 코드: 0 성공, 1 보드가 거절·실패, 2 명령을 잘못 씀, 3 기다리는 시간이 끝남(다시 atrium wait). 기계용 계약: atrium help --json. 자세한 설명: atrium help --long',
  ].join('\n');
}
export const contractJson = (perm = null) => ({ contract: CONTRACT_VERSION, verbs: verbsFor(perm && perm.allowed), exit: EXIT, waitStatus: WAIT_STATUS, relations: ['sub', 'peer', 'none', 'auto'], relationHelp: RELATION_HELP.join('\n'), // P156
  ...(perm && perm.allowed ? { orchestrates: true, scope: perm.scope, allowed: [...perm.allowed] } : {}) }); // P296: 오케스트레이션 세션의 허용 동사
