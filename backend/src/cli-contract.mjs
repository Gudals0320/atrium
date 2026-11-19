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
// P242: rig put|accept|return|pass|drop|inbox(rig 3 역할 세션의 항목 명령)를 더했다(더하기만이라 4 그대로)
// P244: rig tool(rig 3 역할의 도구)과 rig beat(사람만, 역할 세션은 거절)를 더했다(더하기만이라 4 그대로)
// P245: rig tune|raise|heard(rig 3 역할의 조정)와 rig role(정의서와 조정 기록 보기)을 더했다(더하기만이라 4 그대로)
// P248: prompt --steer(스티어링, --now와 같은 길)를 더했다(더하기만이라 4 그대로)
// P237: prompt --talk(rig 자리에 회 없이 글만)와 prompt 응답의 talk 칸, 거절 까닭 rig_run_open을 더했다(더하기만이라 4 그대로)
export const CONTRACT_VERSION = 4;
// P204: 동료 소식. atrium log 한 줄의 상한, atrium news가 한 번에 보이는 줄
export const NEWS_LOG_MAX = 300;
export const NEWS_LINES = 20;
// P204: 동료에게 보낼 때와 안 보낼 때(한 원본. 스킬·help·관계 알림·띄움 답이 이 글을 쓴다. 판 안내문은 짧은 PEER_RULE_SHORT)
export const PEER_RULE = '동료에게 `atrium prompt`로 보내는 것은 다섯 경우뿐이다: (1) 상대만 답하거나 정할 수 있는 질문, (2) 일·소유권 넘기기나 받기(넘길 때는 지금 상태와 다음 할 일을 함께), (3) 내 변경이 상대가 맡은 것(파일·설계·결정)이나 상대가 지금 하는 일을 깨거나 바꿀 때(바꾸기 전에), (4) 상대가 기다리는 답, (5) 사람이 전하라고 할 때. 끝날 때마다 결과 보고, 진행 알림, "받았다/알겠다" 답장, 상대 일과 상관없는 일은 보내지 않는다. 한 일은 보드가 동료 소식에 남긴다: 상대 일과 닿는 일을 시작할 때, 상대에게 묻기 전, 일을 넘겨받을 때 `atrium news`로 본다(남길 결정은 `atrium log "<한 줄>"`).';
export const PEER_RULE_SHORT = '동료에게는 다섯 경우(상대만 답할 질문, 일 넘기기·받기, 상대 일을 깨기 전, 기다리는 답, 사람이 시킨 전달)만 보내고 결과 보고·진행·답장은 안 보낸다. 최신 상태는 `atrium news`';

// out: --json일 때 result의 주요 칸. 사람이 읽는 출력(--json 없음)은 같은 내용의 글이다
export const VERBS = [
  { name: 'help', args: ['[--json]'], does: '이 사용법. --json은 이 계약(동사, 인자, 출력, 종료 코드, 버전)', out: ['contract', 'verbs', 'exit'] },
  { name: 'prompt', args: ['<이름>', '"<할 일>"', '[--wait | --steer]', '[--timeout ms]', '[--case 건]', '[--talk]', '[--json]'], does: '다른 에이전트에게 일을 맡긴다(rig 자리 세션이면 받는 자리를 정의가 정한다: assign 줄 → 일, may → 글만, 그 밖 거절. <이름>에 자리 이름을 주면 그 자리로. --case는 이을 건을 고른다: 없으면 쥔 일의 건, 아니면 너에게 올라와 기다리는 건(waiting_owner)이 하나면 그 건, 그 밖은 새 건). 보드가 받는 쪽 차례에 맞춰 넣고(일하는 중·응답 대기면 끝난 뒤, 잠들었으면 깨운 뒤) 연결을 판에 남긴다. 하위에게 맡겼으면 턴을 끝낸다: 하위가 atrium done으로 닫으면 보드가 그 보고를 너에게 넣고, 보고 없이 멈추면 알린다. --wait면 그 턴(또는 done)까지 기다려 답을 돌려준다(기본 100초, 지금 답이 꼭 필요할 때만). 기본은 대기열이다: 받는 쪽이 지금 하는 일이 끝난 뒤 들어가면 될 글은 그냥 보낸다. 받는 쪽이 지금 하고 있는 일의 방향에 대한 추가 정보·정정이면 --steer(스티어링, 옛 이름 --now): 일하는 중인 Claude Code에 기다리지 않고 대기 메시지로 넣는다(다른 종류는 대기열, --wait와 함께 쓰지 않는다). done 보고와 판 알림은 늘 대기열이다. --talk면 rig 자리에 회를 열지 않고 글만 넣는다(일·done 없음, 응답 talk 칸): rig를 고치자는 말은 관리자 자리에 --talk로 보낸다. 그 자리에 회의 일이 열려 있으면 섞이므로 넣지 않는다(rig_run_open, 종료 코드 1). rig 밖 세션에는 보통 prompt와 같다', out: ['name', 'agentName', 'kind', 'state', 'woke', 'deliveryId', 'delivery', 'turn', 'next', 'unit', 'talk'] },
  { name: 'wait', args: ['<이름>', '[--timeout ms]', '[--json]'], does: '그 세션이 지금 턴(너의 글이 대기열에 있으면 그 글의 턴)을 끝낼 때까지 기다려 마지막 답을 돌려준다(기본 100초). 사람의 답을 기다리면 바로 돌아온다. 맡긴 일의 보고는 보드가 가져다주므로 되풀이해 치지 않는다', out: ['name', 'agentName', 'kind', 'status', 'state', 'ms', 'answer', 'ask', 'error', 'delivery', 'next', 'unit'] },
  { name: 'read', args: ['<이름>', '[--lines n]', '[--json]'], does: '그 세션 화면의 최근 줄(기본 80줄). 잠든 세션은 마지막 답', out: ['name', 'agentName', 'kind', 'state', 'lines', 'source', 'text', 'answer', 'next'] },
  { name: 'me', args: ['[--json]'], does: '너의 지금 연결: 상위(너를 하위로 둔 세션), 동료, 하위, 독립, 역할 연결, 연결마다 마지막 지시, rig 자리(자리, 건, done 값, 보낼 수 있는 자리). 보드의 지금 기록', out: ['me', 'parent', 'peers', 'children', 'independent', 'lineage', 'roles', 'rig', 'news'] },
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
  { name: 'done', args: ['ok|failed|<rig 값>', '"<보고>"', '[--file 경로]', '[--artifact 경로]…', '[--json]'], does: '보드가 맡긴 지금 일을 닫는다(ok 끝냈다, failed 못 했다). 값과 보고는 맡긴 세션에게 한 번 간다(그 세션이 기다리는 중이면 그 기다림이 받는다). 닫은 뒤 쉰다. 열린 일이 없으면 종료 코드 1. rig 자리 세션은 정의의 results 낱말을 쓰고, 보드가 값에 따라 다음 자리로 넘긴다(flow, 맞는 줄이 없으면 건의 주인에게). --artifact <경로>(되풀이)는 산출물을 rig의 산출물 섹터에 등록한다(섹터 폴더 밖이면 닫지 않고 종료 코드 2)', out: ['unit', 'result', 'parent', 'claimedBy', 'next', 'queued', 'caseId', 'flow', 'reports', 'case', 'artifacts'] },
  { name: 'item', args: ['[--json]'], does: '너의 지금 일: 맡긴 세션, 할 일, 시작, 뒤에 줄 선 일 수', out: ['item', 'queued'] },
  { name: 'items', args: ['[--json]'], does: '네가 맡긴 일들: 맡은 세션, 상태(open·done·failed·cancelled), 결과와 보고', out: ['items', 'open', 'toolRuns'] },
  // P182: rig(워크스페이스의 작업 규칙)
  { name: 'guide', args: ['[주제 | rig]', '[--json]'], does: '자세한 사용법(help --long). 이 워크스페이스에 사람이 켠 rig(.atrium/rig.json)가 있으면 그 안내를 붙이고, 정의가 잘못됐으면 그 까닭을 보인다. guide rig는 보드 내장 rig 만들기 안내(정의 형식, 틀 셋의 예, atrium rig check로 검사하는 법)', out: ['rig', 'builtin'] },
  // P183: rig 도구
  { name: 'tool', args: ['[<이름> [인자…] | --wait <실행 ID> | --runs]', '[--json]'], does: '이 워크스페이스에 사람이 켠 rig의 도구. 이름 없이는 목록과 설명, 이름이면 실행(인자는 정의의 run 뒤에 붙는다. 보드가 띄워 쥐고 출력을 기록한다). 100초까지 기다려 종료 코드와 출력 꼬리를 돌려주고, 아직이면 종료 코드 3과 실행 ID(이어 기다리기 --wait <ID>). --runs는 최근 실행. 세션마다 한 번에 하나', out: ['tools', 'run', 'runs'] },
  // P188: rig 관리(관리자 자리 세션과 사람만. 그 밖 세션은 종료 코드 1과 까닭)
  { name: 'rig', args: ['check [파일] | log [--events [--case 건] [--since seq|시각] [--kinds a,b] [--limit n]] | rollback <n> | cleanup <건> | retry <건> [<일>] | status | pause <고리|회> | resume <고리|회> | name <회> "<이름>" | artifacts [--sector 섹터] [--run 회] [--limit n] | propose --target <정본|definition> --file <파일> [--why 까닭] | proposals [<제안>] | approve <제안> | reject <제안> "<까닭>" | run <고리> | put <종류> <파일> [--from <항목>] [--redo <항목>] | accept <항목> ["<메모>"] | return <항목> "<까닭>" | pass <항목> "<까닭>" | pass "<까닭>" | drop <항목> "<까닭>" | inbox | heard "<요지>" | tune --file <파일> --why "<한 줄>" --evidence <id…> | tune --none "<까닭>" | raise "<무엇>" | role [<역할>]', '[--json]'], does: 'P245(rig 3): heard는 역할이 사람의 바로잡음을 남기고(조정 재료), tune은 조정 턴의 답으로 정의서의 요령 칸만 고친다(고정 칸 그대로·줄 수 예산 안·근거가 그 역할의 재료에 있으면 보드가 반영하고 판을 올린다, 아니면 거절 까닭), tune --none은 고칠 것 없음, raise는 요령으로 풀 일이 아니라 빌더에게 올림, role은 정의서의 요령 칸과 판, 조정 기록을 보인다(되돌리기는 사람만). P242(rig 3 역할 세션만): put은 자기 섹터의 파일 하나를 항목으로 낸다(종류는 그 역할이 내는 길의 것, 보드가 길대로 받는 역할을 깨운다, 낸 파일은 고치지 않고 --redo로 다음 판), accept·return은 받은 항목의 받음·반려(반려는 낸 역할에게 돌아간다, 받음은 이어진 항목을 내기 전까지 뒤집을 수 있고 이어진 항목을 가진 역할도 반려한다), pass <항목>은 받은 것을 답 항목 없이 닫고 항목 없는 pass는 박자에 낼 것이 없다는 답(받은 것을 닫지 않는다), drop은 반려된 네 항목을 버림, inbox는 받아서 답하지 않은 것과 반려된 네 항목. P230: run <고리>는 관리자 자리가 every 고리의 회를 지금 한 번 연다(끝나지 않은 회가 있거나 고리가 멈췄으면 건너뛰고 까닭을 돌려준다). P224: propose는 자리 세션이 정본·정의 고침을 제안한다(정본은 사람 승인, 정의는 고리의 approve가 human이면 사람, 아니면 관리자 자리. 관리자 자리의 정의 제안은 바로 반영), proposals는 제안 목록·diff, approve|reject는 관리자 자리가 정의 제안을 정한다. rig 정의 관리. 켜진 rig의 관리자 자리(manager)에 앉은 세션만 쓴다(check는 읽기만이라 rig가 꺼진 워크스페이스면 어느 세션이든, 켜진 rig에서는 사람이 맡긴 제작 세션도 쓴다). check는 후보 정의(파일, 없으면 지금 .atrium/rig.json)를 적용하지 않고 검사하고(사람만 고치는 자리를 바꾸면 알린다), log는 정의 버전 목록과 버전마다 건·반려·훅 거절·상한 초과 수, rollback <n>은 버전 n의 내용으로 rig.json을 다시 쓰며(새 버전으로 적힌다), cleanup <건>은 끝난 건이 만든 fresh 세션을 닫고 워크트리 목록을 돌려준다(지우지 않는다). retry <건> [<일>]은 에이전트가 끝나 셸만 남은(exited) 자리 세션이 쥔 열린 일을 같은 자리의 새 세션에 다시 맡긴다(일을 주지 않으면 그 건의 그런 일 모두, fresh 자리가 한도면 자리 줄에 선다). log --events는 rig 장부(한 꼴의 사건 줄, seq 커서)를 읽는다: 관리자 자리와 그 워크스페이스의 제작 세션은 전체, 자리 세션은 자기 건만. status는 고리(작업·개선, 계기, 상태 돎·기다림·멈춤·쉼, 마지막 회, 다음 실행)와 끝나지 않은 회(이름, 멈춤·막힘)를 보이고 그 워크스페이스의 어느 세션이든 쓴다. pause|resume <고리|회>는 관리자 자리만: 고리를 멈추면 새 회·넘김·자리 띄우기를 막고(일하는 세션은 그대로, 멈춘 동안 온 요청은 줄에 서고 잇기에 회가 열린다), 회를 멈추면 그 회의 새 넘김만 막는다. name <회> "<이름>"은 관리자 자리와 그 회의 주인이 회 이름을 고친다. artifacts는 산출물 등록부(섹터, 경로, 해시, 고리·회·자리, 상태 새것·받아들임·밀려남)를 보이고 그 워크스페이스의 어느 세션이든 쓴다', out: ['proposal', 'proposals', 'applied', 'autoApplied', 'sectors', 'artifacts', 'ok', 'reason', 'versions', 'current', 'n', 'closed', 'kept', 'worktrees', 'retried', 'case', 'rows', 'last', 'more', 'loops', 'runs', 'loop', 'paused', 'released', 'opened', 'name'] },
  // P211: 구독 사용량(보드가 로컬 출처에서 모은 마지막 값. 읽기만)
  { name: 'usage', args: ['[--json]'], does: '구독 사용량(Claude, Codex, AGY): 한도 창(5시간·주간 등)마다 사용률과 리셋까지 남은 시간, 크레딧, 요금제, 받은 때. 보드가 이 PC의 로컬 출처에서 모은 마지막 값이고 모르면 모름. 일을 크게 나누기 전에 남은 양을 볼 때', out: ['providers', 'alertsOn', 'at'] },
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

// 모델이 읽는 짧은 사용법(동사마다 한 줄)
export function shortHelp() {
  return [
    `atrium(계약 ${CONTRACT_VERSION}): 보드가 띄운 세션이 보드와 말하는 명령. 옛 이름 mtask도 같다.`,
    ...VERBS.map((v) => `  atrium ${v.name}${v.args.length ? ' ' + v.args.join(' ') : ''}\n      ${v.does}`),
    '이름은 보드의 세션 이름이다(@ 없이도 된다). 다른 에이전트에게는 atrium prompt로만 보낸다(터미널 명령으로 직접 보내면 보드가 연결을 남기지 못한다).',
    ...RELATION_HELP,
    '종료 코드: 0 성공, 1 보드가 거절·실패, 2 명령을 잘못 씀, 3 기다리는 시간이 끝남(다시 atrium wait). 기계용 계약: atrium help --json. 자세한 설명: atrium help --long',
  ].join('\n');
}
export const contractJson = () => ({ contract: CONTRACT_VERSION, verbs: VERBS, exit: EXIT, waitStatus: WAIT_STATUS, relations: ['sub', 'peer', 'none', 'auto'], relationHelp: RELATION_HELP.join('\n') }); // P156
