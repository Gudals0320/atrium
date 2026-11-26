#!/usr/bin/env node
// 하위 세션 명령(P8, ARCH 4절 K): 판이 띄운 세션 안에서 부른다. 판 플러그인의 bin/atrium(옛 이름 bin/mtask)이 이 파일을 부른다.
// 판의 API 토큰(backend.json)을 읽지 않는다. 세션 설정 파일의 env(ATRIUM_PORT, ATRIUM_SESSION_ID, ATRIUM_SESSION_TOKEN 등. P18 전에 띄운 세션은 MTASK_*)로 그 판의 POST /branch/*만 부른다.
// 사용: atrium prompt <이름> "<글>" [--wait | --now] [--raw] [--timeout ms] [--file 경로] [--json]   (P116: 다른 에이전트에게 일 시키기. 판의 전달 규칙으로 넣는다. P380: --raw는 판 머리 없이 글을 맨 앞에)
//       atrium wait <이름> [--timeout ms] [--json]   (P116: 그 세션의 지금 턴이 끝날 때까지, 마지막 답)
//       atrium read <이름> [--lines n] [--json]   (P116: 그 세션 화면의 최근 줄)
//       atrium relate <이름> sub|peer|none|auto [--json]   (P156: 나와 그 세션의 일 관계)
//       atrium child [이름] [--peer] [--prompt 글] [--role 역할] [--cwd 폴더] [--worktree 이름] [--model 모델] [--launcher 호출자] [--effort 노력] [--kind 종류] [--head] [--no-wait] [--json]
//       atrium me [--json]   (P81: 너의 지금 연결 — 부모, 하위 세션, 역할 연결, 마지막 지시)
//       atrium models [--json]   (P41: 띄울 수 있는 호출자와 모델, 그 명령)
//       atrium child-wait <이름> [--json]   (P36: 신뢰 관문을 지나 지시를 받을 수 있게 될 때까지)
//       atrium children [--all] [--json]
//       atrium child-kill <이름> [--only] [--json]
//       atrium wake <이름> [--json]   (P21: 잠든 세션 깨우기, P24: 그 리포째, P111: 혼자 잠든 세션은 그 세션만)
//       atrium done ok|failed "<보고>" [--file 경로] [--record 파일]… [--json]   (P180: 보드가 맡긴 지금 일을 닫는다. P334: 기록 파일)
//       atrium item [--json] · atrium items [--json]   (P180: 지금 일, 네가 맡긴 일들)
//       atrium log "<한 줄>" [--json] · atrium news [<이름>] [--all] [--json]   (P204: 동료 소식)
//       atrium guide [merger] [--json]   (P182: 자세한 사용법. P267: merger 안내)
//       atrium docs [init [--dir 폴더] [--only brief,arch,plan] | on [--dir 폴더] | off] [--json]   (P257: 이 워크스페이스의 문서 점검 결과. P346: 문서 시작·켜기·끄기, 지휘 세션만)
//       atrium ask "<질문>" [--option "<보기>"]… [--why "<맥락>"] [--no-wait | --wait] | --done <번호> | --list [--json]   (P284: 결정 카드. P295: 보내는 때)
//       atrium todo "<할 일>" [--cmd "<명령>"]… [--check] [--later "<날짜 또는 조건>"] [--why "<맥락>"] [--tell] [--no-wait | --wait] | --done <번호> | --list [--json]   (P292: 사용자 몫. P295: 보내는 때)
//       atrium revive <이름|ID> [--json] · atrium fork <이름|ID> [--launcher 런처] [--name 새 이름] [--model m] [--effort e] [--peer] [--json]   (P360: 되살리기·갈라 열기, 사람이 시킬 때만)
//       atrium plan [show|list|new|goal|metric|ms|focus|item|check|owner|status|import|export|log] … [--plan <이름|번호>] [--json]   (P304: 리포별 목표·마일스톤 레인. 사용법 atrium help plan)
//       atrium know "<물음>" [-k N] [--kind 종류] [--before 시각|커밋] [--self] [--json] | know open <포인터> [--context n] | know unit <PNNN> | know build [--full] | know --usage [--since 날짜|7d]   (P364: 작업 지식 찾기)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { envVar, terminalSessionVar } from '../src/config.mjs';
import { shortHelp, contractJson, VERB_NAMES, RELATION_HELP, PEER_RULE_SHORT, NEWS_LOG_MAX, ASK_QUESTION_MAX, ASK_OPTIONS_MAX, ASK_OPTION_MAX, ASK_WHY_MAX, ASK_OPEN_MAX, TODO_CMDS_MAX, TODO_CMD_MAX, TODO_LATER_MAX } from '../src/cli-contract.mjs'; // P292: 사용자 몫 상한 // P284: 결정 카드 상한 // P204: 동료 소식 // P115: 계약(atrium help --json). P156: 관계 고르기 안내
import { usageLines } from '../src/usage-text.mjs'; // P211: atrium usage
import { dropRiskyWords, riskyKind } from '../src/risky-words.mjs'; // P380: OmO 세션이 부르면 출력에서 위험 낱말을 뺀다
import { PLAN_HELP, parsePlanArgs, showLines, listLines, writeLines, importLines, logLines, meLines as planMeLines } from '../src/plan-cli.mjs'; // P304: atrium plan

// P181: 하위에게 일을 맡긴 뒤의 안내(폴링하지 않고 턴을 끝낸다)
const HAND_OFF = '기다리지 않고 턴을 끝낸다. 끝나면 보드가 done 보고를 가져다주고, 보고 없이 멈추면 한 번 알린다.';
const HELP = `atrium(보드가 띄운 세션의 명령. 옛 이름 mtask도 같다)
  atrium prompt <이름> "<할 일>" [--wait | --steer] [--raw] [--timeout ms] [--file 경로]
      다른 에이전트에게 일을 맡긴다. 이름은 보드의 세션 이름이다(@ 없이도). 보드가 받는 쪽 차례에 맞춰 넣는다: 일하는 중이거나 사람의 답을 기다리면 끝난 뒤,
      사람이 그 터미널에 치는 중이면 3초 뒤, 잠들었으면 깨운 뒤. 보낸 쪽 → 받는 쪽 연결과 오간 기록이 판에 남는다.
      하위에게 맡겼으면 턴을 끝낸다: 하위가 atrium done으로 닫으면 보드가 그 값과 보고를 네 차례에 한 번 넣고, 보고 없이 멈추면(쉼, 오류, 사람의 답 기다림, 닫힘) 한 번 알린다. 폴링하지 않는다.
      --wait면 그 글로 시작한 턴(또는 done)까지 기다려 답을 돌려준다(지금 답이 꼭 필요할 때만. 기본 100초. 더 길게는 --timeout 600000과 셸 도구의 시간 제한을 함께 늘린다).
      기본은 대기열이다: 받는 쪽이 지금 하는 일이 끝난 뒤 들어가면 될 글은 그냥 보낸다.
      --steer(스티어링, 옛 이름 --now)는 받는 쪽이 지금 하고 있는 일의 방향에 대한 추가 정보·정정일 때 쓴다. 받는 쪽이 일하는 중인 Claude Code면 끝나기를 기다리지 않고
      그 세션의 대기 메시지로 바로 넣는다(지금 턴 안에서 읽는다). --now는 받는 쪽이 일하는 중인 Claude Code면 같은 길이다.
      그 밖(쉬는 중, 다른 종류, 사람의 답을 기다림, 잠듦)은 위와 같다(다른 종류는 일하는 중 입력을 받지 못해 대기열로 간다). --wait와 함께 쓰지 않는다. done 보고와 판 알림은 늘 대기열이다.
      --file은 글을 파일에서 읽는다(긴 글, 따옴표가 많은 글).
      --raw는 보드 머리 줄(관계·일·약속)과 앞에 붙는 사람의 답 없이 글을 그대로 맨 앞에 넣는다. 슬래시 명령(/ulw-plan, /handoff 등)은 입력 맨 앞이어야 하네스가 명령으로 받는다.
      하위에게 새 일이면 일은 그대로 만들어지고(atrium item, done 연결) 머리는 판 기록에만 남는다. 머리가 빠지므로 그 하위는 자기 일을 atrium item으로 안다. --raw는 슬래시 명령용이다(보통 지시는 --raw 없이).
  atrium wait <이름> [--timeout ms]
      그 세션이 지금 턴(너의 글이 대기열에 있으면 그 글의 턴)을 끝낼 때까지 기다려 마지막 답을 돌려준다(Claude Code는 hook의 답, 다른 종류는 보드가 화면에서 고른 답).
      사람의 답을 기다리면 바로 돌아온다(waiting). 시간이 끝나면 종료 코드 3이고 일은 계속된다. 맡긴 일의 보고는 보드가 가져다주므로 되풀이해 치지 않는다
  atrium read <이름> [--lines n]   그 세션 화면의 최근 줄(기본 80줄). 잠든 세션은 마지막 답
  atrium child [이름] [--peer] [--prompt "첫 요청"] [--role 역할] [--cwd 폴더] [--worktree 이름] [--model 모델] [--launcher 런처] [--effort 노력] [--kind 종류] [--no-wait]
      세션을 띄운다. 너의 폴더·모델·추론 수준·승인 방식·그룹을 물려받고(준 값이 덮는다), 너와 역할 선(기본 "워커", --peer면 "동료")으로 이어진다.
      관계: 기본은 하위 워커다(--prompt의 일을 끝내면 atrium done으로 너에게 보고한다. atrium children에 보이고 child-kill로 함께 꺼진다).
      --peer는 동료다(같은 위계의 협력자. 질문·넘기기·상대 일을 바꾸는 변경 때만 서로 보내고, 한 일은 보드의 동료 소식에 남는다(atrium news). 사람에게 직접 답해도 된다. child-kill 연쇄에서 빠진다).
      누가 띄웠는지(계보)는 둘 다 남는다. 보드가 첫 요청 앞에 관계 한 줄을 붙이고, 응답 첫 줄에 관계를 쓴다.
      --model은 말로 한 이름도 받는다("glm flash", opus). 보드가 아는 목록에서 풀고, 여럿이 맞거나 없으면 띄우지 않고 후보를 돌려준다.
      --launcher는 그 런처(도구 모음의 단추)의 하네스·모델·옵션·환경 변수 그대로 띄운다.
      --effort는 Codex면 -c model_reasoning_effort로 옮겨 런처 인자의 같은 값을 덮는다(low, medium, high, xhigh 등). Hermes면 준비된 뒤 보드가 /reasoning <값>을 넣는다(--tui가 --reasoning을 받지 않는다. 런처 인자의 --reasoning이 있으면 그 값을 따른다). omo면 --thinking으로 넘긴다(off, minimal, low, medium, high, xhigh, max. 런처 인자의 --thinking이 있으면 그 값을 따른다). 노력 수준을 받지 않는 종류면 무시했다고 알린다.
      --kind codex(다른 종류)는 보드 레일의 그 종류 런처 설정(추가 인자·모델, --model이 모델만 덮는다)으로 띄우고, 너의 승인 방식을 그 종류의 승인 인자로 옮긴다.
      준비될 때까지 기다린 뒤 워커 이름과 일 맡기기·읽기 명령을 돌려준다. --prompt로 맡겼으면 턴을 끝낸다(보고는 보드가 가져다준다). 수와 깊이에 상한은 없다.
      --worktree <이름>은 브랜치 worktree-<이름>의 워크트리에서 띄운다. Claude Code는 claude -w가 만들고(자리는 Claude Code·사용자 hook이 정한다), 다른 종류(omo, codex 등)는 보드가 git worktree add로
      <리포>/.claude/worktrees/<이름>에 만든 뒤 그 폴더에서 띄운다(그 브랜치의 워크트리가 이미 있으면 다시 쓴다). 신뢰를 받지 않은 저장소·폴더면 신뢰 질문에서 멈추고(needs_trust) 사람에게 할 한 문장을 돌려준다.
      omo(OMO)는 체크아웃된 브랜치에 파동 워크트리를 직접 합친다. 코드를 고치는 일은 --worktree로 띄운다(주 체크아웃에서 띄우면 보드가 경고한다).
      --head는 너의 워커가 아니라 따로 일을 이끄는 세션(헤드)으로 띄운다. 첫 요청 뒤 보드가 부모 관계를 뗀다. 그 뒤로 일을 시키거나 기다리지 않는다(--worktree와 함께 쓰지 않는다).
  atrium relate <이름> sub|peer|none|auto
      나와 그 세션의 관계를 바꾼다: 그 세션이 나의 sub(하위), peer(동료), none(독립: 서로 보고하거나 맡기지 않음), auto(자동: 띄움·역할 선 = 하위).
      너와 이어진 세션(띄움, 역할 선, 지시, 정한 관계)만 바꾼다. 사람이 판에서 정한 관계는 바꾸지 않는다(사람에게 묻는다). 상대에게 보드가 짧게 알린다.
  atrium me                     너의 지금 연결: 상위(너를 하위로 둔 세션)·동료·하위·독립, 역할 연결, 상대마다 종류와 마지막 지시. 보드의 지금 기록이라 예전 알림과 다르면 이것을 믿는다. 사람이 판에서 잇거나 끊은 역할 연결은 알림 없이 여기에만 보인다
  atrium child-wait <이름>      그 하위 세션이 지시를 받을 수 있게 될 때까지 기다린다(신뢰 질문에 사람이 답한 뒤 워크트리에서 다시 뜰 때까지. 한 번에 100초)
  atrium children [--all]       너의 하위 세션(--all이면 그 아래까지) 상태와 마지막 응답. 하위 관계만 보이고 동료는 따로 한 줄
  atrium models                 띄울 수 있는 런처와 모델(하네스 모델, 별칭, 게이트웨이 모델)과 각각을 띄우는 atrium child 명령
  atrium child-kill <이름> [--only]   너의 하위 세션을 끈다(하위 관계로만 그 아래도 함께. --only면 그것만). 동료·독립은 끄지 않고 남긴 이름을 적는다. 사람이 끄라고 할 때만 쓴다
  atrium wake <이름>   잠든(sleeping) 세션을 깨운다. 혼자 잠든 세션은 그 세션만, 리포째 잠들었으면 그 리포에서 리포째 잠든 세션을 모두 깨운다. 같은 대화로 이어 가고 그 세션이 준비되면 돌려준다. atrium prompt는 잠든 세션을 깨운 뒤 넣으므로 미리 깨울 때만 쓴다
  atrium done ok|failed "<보고>" [--file 경로] [--record 파일]…
      보드가 맡긴 지금 일(첫 요청 앞에 "[Atrium 보드] … 맡긴 일 u…" 머리가 붙은 일)을 닫는다. ok는 끝냈다, failed는 못 했다.
      값과 보고는 맡긴 세션에게 한 번 간다(그 세션이 atrium wait로 기다리는 중이면 그 기다림이 받고, 아니면 보드가 그 세션 차례에 넣는다).
      일이 보고하라는 것은 이 글에 넣고 다른 길로 따로 보내지 않는다. 닫은 뒤 쉰다. 열린 일이 없으면 종료 코드 1
      --record: 조사·감사·제안·측정·인계 같은 일의 결과 파일(여럿이면 되풀이)은 커밋하지 않고 붙인다. 보드가 주 체크아웃의 .atrium/records/<이름>-<일>/(git 밖)로 복사하고 보고에 경로를 붙인다(저장소 안 파일만, 파일 2MB·20개까지, 비밀 같은 이름은 거절)
  atrium item                   너의 지금 일(맡긴 세션, 할 일, 시작, 뒤에 줄 선 일 수)
  atrium log "<한 줄>"          동료 소식에 너의 한 줄을 남긴다(${NEWS_LOG_MAX}자까지). 누구에게도 보내지 않고 누구도 깨우지 않는다. 동료가 알아 둘 결정·변경·상태를 남길 때
  atrium news [<이름>] [--all]  동료 소식: 보드가 남긴 동료의 턴 끝 한 줄(받은 일 + 답 첫 줄), done, atrium log.
      기본은 너의 동료가 네가 마지막으로 본 뒤 남긴 것을 오래된 것부터 20줄(읽은 자리를 옮긴다). <이름>이면 판의 어느 세션이든 그 세션의 최근 것(읽기만), --all은 동료의 최근 것(읽기만).
      상대 일과 닿는 일을 시작할 때, 동료에게 묻기 전, 일을 넘겨받을 때 본다. 동료가 끝날 때마다 결과를 보내오지 않는 대신이다
  atrium items                  네가 맡긴 일들(맡은 세션, 상태, 결과와 보고)
  atrium ask "<질문 한 줄>" [--option "<보기>"]… [--why "<맥락 한 줄>"] [--no-wait | --wait]
      사람이 정해야 할 질문("이대로 마무리할까요?", "이 방향으로 갈까요?")을 대화에 글로 묻고 이것으로 보드에도 결정 카드로 남긴다. 카드 번호를 돌려준다.
      대화를 갈음하지 않는다. 남긴 뒤 턴을 끝낸다. 사람이 카드에서 답하면 "[결정] <질문> → <답>" 글이 들어오고, 무시하면 아무것도 오지 않는다(되묻지 않는다).
      사람이 대화로 직접 답하면 보드가 카드를 닫는다. 권한·신뢰·모델·하네스 질문은 카드가 아니다.
      --no-wait는 답을 기다리지 않는 질문: 답이 곧바로 오지 않고 너에게 다음 글이 갈 때 그 앞에 실려 온다(턴을 아낀다). --wait는 답을 기다리며 멈추는 질문(곧바로 온다).
      주지 않으면 보드가 정한다: 질문한 턴 뒤로 쉬고 있으면 곧바로, 그 사이 다른 일을 했으면 다음 글에 실어.
      상한: 질문 ${ASK_QUESTION_MAX}자, 보기 ${ASK_OPTIONS_MAX}개(각 ${ASK_OPTION_MAX}자), 맥락 ${ASK_WHY_MAX}자, 열린 카드 ${ASK_OPEN_MAX}장. 사람과 직접 일하는 세션만 쓴다(하위 워커는 부모에게 atrium prompt로 묻는다).
  atrium ask --done <번호>      사람이 다른 길로 답해 끝난(쓸모없어진) 너의 카드를 닫는다
  atrium ask --list             너의 열린 결정 카드
  atrium todo "<할 일 한 줄>" [--cmd "<명령>"]… [--check] [--later "<YYYY-MM-DD[ HH:MM] 또는 조건>"] [--why "<맥락 한 줄>"] [--tell] [--no-wait | --wait]
      사람이 해야 할 일(터미널에 칠 명령, 해 줄 행동, 검증, 나중으로 미룬 일)을 대화에 쓰고 이것으로 보드의 "할 일 목록"에도 남긴다. 카드 번호를 돌려준다.
      기본은 실행: 사람이 "했음"을 누르면 기록만 된다(--tell이면 "[실행] <할 일> → 했음" 글이 온다). --cmd는 사람이 복사할 명령(${TODO_CMDS_MAX}개, 각 ${TODO_CMD_MAX}자).
      --check는 확인: 사람이 됐다/안 됐다와 한 줄 메모로 답하면 "[확인] <할 일> → 됐다: 메모" 글이 온다.
      확인 결과와 --tell의 했음은 기본으로 너에게 다음 글이 갈 때 그 앞에 실려 온다. 그 답을 기다리며 멈출 거면 --wait(곧바로 온다).
      --later는 나중에: 날짜·시각이면 그때까지 숨겼다가 띄우고(날짜만이면 그날 9시), 조건 글이면 사람이 꺼낼 때까지 "나중"에 둔다(따로 ${TODO_LATER_MAX}장까지).
      열린 카드는 결정 카드와 합쳐 ${ASK_OPEN_MAX}장까지. 사람과 직접 일하는 세션만 쓴다(하위 워커는 부모에게 atrium prompt로 넘긴다).
  atrium todo --done <번호>     끝났거나 쓸모없어진 너의 카드를 닫는다
  atrium todo --list            너의 열린 카드와 나중 카드
  atrium plan list · atrium plan new "<이름>" · atrium plan [show] [--plan <이름|번호>]
      이 리포의 목표·마일스톤 레인(한 리포에 여럿, 레인마다 관리자 세션). 고치라는 지시가 없으면 남의 레인은 읽기만 한다.
      사람 몫 항목은 item <코드> "<글>" --who user(사람의 할 일 목록에 뜬다). 하위 낱말과 예: atrium help plan
  atrium know "<물음>" [-k N] [--kind doc|log|record|review|code|db] [--before <시각|커밋>] [--self]
      작업 지식 찾기(P364). 이 워크스페이스(리포)의 지우지 않은 원문(문서, docs/log·experiments·.atrium/records 기록, 코드 주석, 판의 일 spec·done 보고·결정·할 일 카드)을
      전문 검색(trigram BM25, 두 글자 이하 낱말은 부분 문자열)해 상위 N개(기본 5)의 위치(경로:줄-줄 또는 db:<표>/<행>)·날짜·단위 번호·종류와 짧은 발췌를 돌려준다. 첫 줄은 돌려준 글자 수.
      시작할 때 건드릴 부분을 한 번 찾고 막히면 다시 찾는다. 위치를 찾으면 필요한 파일만 연다. 하위에게 맡기기 전에는 그 일이 건드릴 부분을 1~3번 찾아 지시의 힌트로 적는다. 처음 물을 때 색인을 짓고 그 뒤에는 바뀐 것만 고친다.
      --before는 그 시각(또는 커밋) 뒤에 생긴 원천을 뺀다(그 뒤에 고친 원천은 지금 글이라 "뒤에 바뀜" 표시). 걷어낸 기능의 것이면 "걷어냄", 대체된 결정이면 "대체됨 → 지금: …"(저장소의 .atrium/know.json 선언)
      결과 하나는 한 파일에서 맞은 낱말이 가장 몰린 절(제목 경계)이고, 발췌 앞 L<줄>은 맞은 줄이다. 같은 파일의 다른 맞은 절은 "다른 절", 같은 글의 다른 자리(기록 사본 등)는 "같은 글"로 붙는다.
      네 단위(세션 이름·지금 일의 PNNN)의 작업 파일·기록·판 일·done은 이미 가진 글이라 뺀다. --self면 넣는다
  atrium know open <포인터> [--context n]   원문(색인에 든 원천만, 사람 대화 인용은 가림)
  atrium know unit <PNNN>       그 단위의 작업 파일·기록·검토·판 일(spec·done 보고)·코드 주석·커밋을 순위와 상관없이
  atrium know build [--full]    색인 다시 짓기(--full은 처음부터) · atrium know --usage [--since <날짜|7d>]  사용 집계(세션·날짜별 호출 수와 글자 수)
  atrium guide                  이 사용법
  atrium guide merger           병합 merger의 안내(P267: 보드가 브랜치 워커의 병합을 맡기는 세션)
  atrium docs [init [--dir 폴더] [--only brief,arch,plan] | on [--dir 폴더] | off]
      문서 점검 결과(P257). init은 살아 있는 문서가 없는 저장소에 BRIEF·ARCH·PLAN 틀을 만들고(있는 파일은 덮지 않는다) .atrium/docs.json에 예산을 적어 점검을 켠다.
      on·off는 점검을 켜고 끈다. init·on·off는 지휘 세션만(P346)
  PowerShell 셸(Codex 등)은 0이 아닌 종료 코드를 모두 1로 바꿀 수 있다. 결과는 종료 코드보다 출력의 첫 줄 글로 판단한다
  PowerShell에서 atrium은 atrium.exe로 여러 줄·< > | & %를 그대로 넘긴다. Windows PowerShell 5.1(Codex)은 글 안의 큰따옴표를 빼먹고, cmd를 거치면(atrium.cmd) 여러 줄이 첫 줄만 간다. 그런 글은 --file로 준다
${RELATION_HELP.join('\n')}
이 명령은 보드가 띄운 세션에서만 된다. 다른 보드 명령은 없다. 다른 에이전트에게는 atrium prompt로만 보낸다(터미널 명령으로 직접 보내면 보드가 연결을 남기지 못한다).`;

const MULTI = new Set(['option', 'cmd', 'record']); // P284: ask --option 여럿. P292: todo --cmd 여럿. P334: done --record 여럿
const BOOL = new Set(['no-wait', 'json', 'all', 'only', 'help', 'head', 'long', 'wait', 'now', 'steer', 'peer', 'list', 'check', 'tell', 'full', 'usage', 'self', 'raw']); // P380: prompt --raw // P371: know --self // P364: know build --full, know --usage // P292: todo --check·--tell // P284: ask --list // P248: prompt --steer(= --now) // P156: child --peer // P116: prompt --wait, P143: prompt --now
// P208: PowerShell 꾸러미(atrium.ps1)는 인자를 JSON으로 env에 실어 준다(cmd를 거치지 않아 여러 줄·따옴표·<>|&%가 그대로 온다). 읽고 지운다
function argvOf() {
  const j = process.env.ATRIUM_ARGV_JSON; const f = process.env.ATRIUM_ARGV_FILE;
  delete process.env.ATRIUM_ARGV_JSON; delete process.env.ATRIUM_ARGV_FILE;
  if (process.argv.length > 2 || (j == null && f == null)) return process.argv.slice(2);
  try { const a = JSON.parse(j != null ? j : fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); return Array.isArray(a) ? a.map(String) : [String(a)]; } catch { return process.argv.slice(2); }
}
const argv = argvOf();
const flags = {}; const pos = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) { const k = a.slice(2); if (BOOL.has(k)) flags[k] = true; else if (MULTI.has(k)) { (flags[k] || (flags[k] = [])).push(argv[i + 1]); i++; } else { flags[k] = argv[i + 1]; i++; } }
  else pos.push(a);
}
const [cmd, ...rest] = pos;
const E = (name) => envVar(name);
// P115: 세션 토큰. Claude Code는 세션 설정 파일의 env, 다른 하네스는 판 데이터 폴더의 sessions/<세션 ID>.token(친 줄에 토큰을 싣지 않는다)
function sessionToken() {
  if (E('SESSION_TOKEN')) return E('SESSION_TOKEN');
  if (!E('DATA_DIR') || !E('SESSION_ID')) return null;
  try { return fs.readFileSync(path.join(E('DATA_DIR'), 'sessions', `${E('SESSION_ID')}.token`), 'utf8').trim() || null; } catch { return null; }
}
let TOKEN = null;
// P380: 부른 세션이 OmO(omo)면 보드 응답이 그 종류를 알려 준다(caller). 그 뒤의 사람 글 출력(오류 포함)에서 홀로 선 위험 낱말을 뺀다(risky-words.mjs).
//   --json 출력은 그대로 둔다(종류 값 등을 읽는 쪽이 대소문자를 가린다)
let RISKY = false;
const noteCaller = (j) => { if (j && j.caller && (riskyKind(j.caller.kind) || riskyKind(j.caller.flavor))) RISKY = true; };
for (const st of [process.stdout, process.stderr]) { const w = st.write.bind(st); st.write = (c, ...a) => w(RISKY && !flags.json && typeof c === 'string' ? dropRiskyWords(c) : c, ...a); }
const say = (s) => process.stdout.write(s + '\n');
const fail = (msg, code = 1) => { process.stderr.write(`atrium: ${msg}\n`); process.exit(code); };

function call(op, body, timeoutMs) {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(JSON.stringify(body));
    const req = http.request({ host: '127.0.0.1', port: Number(E('PORT')), path: `/branch/${op}`, method: 'POST', timeout: timeoutMs,
      headers: { 'content-type': 'application/json', 'content-length': data.length, authorization: `Bearer ${TOKEN}`, 'x-mt-session': E('SESSION_ID') } }, (res) => {
      let b = ''; res.setEncoding('utf8'); res.on('data', (d) => (b += d));
      res.on('end', () => { try { const j = JSON.parse(b); noteCaller(j); resolve(j); } catch { reject(new Error(`보드의 응답을 읽지 못했습니다 (HTTP ${res.statusCode})`)); } });
    });
    req.on('timeout', () => { req.destroy(new Error('보드 응답 시간이 초과되었습니다.')); });
    req.on('error', (e) => reject(new Error(e.code === 'ECONNREFUSED' ? `보드 백엔드가 실행 중이 아닙니다 (포트 ${E('PORT')})` : e.message)));
    req.end(data);
  });
}

// P296: 이 세션의 실제 권한 | null(판 세션이 아니거나 보드가 답하지 않음)
async function permNow() {
  TOKEN = sessionToken();
  if (!E('PORT') || !E('SESSION_ID') || !TOKEN) return null;
  try { const r = await call('perm', {}, 3000); return r && r.result ? r.result : null; } catch { return null; }
}
function counts(c) { return c ? `너의 하위 세션 ${c.children}개${c.peers ? `, 동료 ${c.peers}명` : ''}, 판 전체 ${c.total}개(상한 없음)` : ''; } // P156: 하위는 하위 관계만
// P36: 신뢰 질문에서 멈춘 하위 세션. 사람에게 할 말은 한 문장이다(판 밖 터미널을 열라고 하지 않는다)
function trustLines(x) {
  say(`  상태: needs_trust. 신뢰 질문에서 멈췄다. 보드는 대신 답하지 않고, 너도 키를 보내 답하지 않는다.`);
  say(`  사용자에게 이 한 문장만 말한다: "${x.tellHuman}"`);
  if (x.gate || x.gated) say(`  사람이 답하면 보드가 그 카드에서 워크트리로 다시 띄운다${x.firstPrompt ? '. 첫 요청는 그 뒤에 들어간다' : ''}. 그동안 따로 시키지 말고 기다린다: atrium child-wait ${x.name}`);
  else say(`  사람이 답한 뒤 기다리기: atrium child-wait ${x.name}`);
}

async function main() {
  // P115: help는 모델이 읽는 짧은 사용법, --json은 기계용 계약, --long은 예전의 긴 설명. 보드에 묻지 않는다
  // P296: 판이 띄운 세션이면 보드에 이 세션의 허용 동사를 묻는다(자체 오케스트레이션 세션은 허용 동사만 보인다). 묻지 못하면 전체
  if ((cmd === 'help' && rest[0] === 'plan') || (cmd === 'plan' && (flags.help || argv.includes('--help')))) return say(PLAN_HELP); // P304: atrium help plan
  if (!cmd || cmd === 'help' || flags.help) {
    const perm = await permNow();
    const orch = !!(perm && perm.allowed);
    return flags.json ? say(JSON.stringify(contractJson(orch ? perm : null), null, 2)) : say(flags.long && !orch ? HELP : shortHelp(orch ? perm : null));
  }
  if (!VERB_NAMES.includes(cmd)) fail(`알 수 없는 명령입니다: ${cmd}. 이 atrium은 ${VERB_NAMES.join(', ')}만 한다(다른 보드 명령은 사람의 atrium으로). 사용법: atrium help`, 2);
  TOKEN = sessionToken();
  if (!E('PORT') || !E('SESSION_ID') || !TOKEN) fail('보드에서 시작한 세션이 아닙니다 (보드가 준 환경 변수나 세션 토큰 파일 없음). 보드에서 시작한 세션 안에서 호출하세요.');
  let r;
  // P116: 일 시키기·기다리기·읽기
  if (cmd === 'prompt' || cmd === 'wait' || cmd === 'read') return verb(cmd);
  if (cmd === 'done' || cmd === 'item' || cmd === 'items') return unitVerb(cmd); // P180
  if (cmd === 'guide') return guideVerb(); // P182
  if (cmd === 'log' || cmd === 'news') return newsVerb(cmd); // P204
  if (cmd === 'ask') return askVerb(); // P284
  if (cmd === 'todo') return todoVerb(); // P292
  if (cmd === 'plan') return planVerb(); // P304
  if (cmd === 'revive' || cmd === 'fork') return reviveVerb(cmd); // P360
  if (cmd === 'know') return knowVerb(); // P364
  if (cmd === 'docs') { // P257: 문서 점검 결과. P346: init | on | off
    const action = rest[0] || 'status';
    if (!['status', 'init', 'on', 'off'].includes(action)) fail(`알 수 없는 docs 낱말: ${action}. 사용: atrium docs [init [--dir 폴더] [--only brief,arch,plan] | on [--dir 폴더] | off]`, 2);
    // --only는 child-kill의 켜기 낱말과 이름이 같아 값이 따로 온다(atrium docs init --only brief,plan)
    const only = typeof flags.only === 'string' ? flags.only : flags.only ? rest[1] : undefined;
    if (flags.only && !only) fail('--only에 brief, arch, plan을 쉼표로 준다', 2);
    const u = await call('docs', { action, ...(flags.dir ? { dir: flags.dir } : {}), ...(only ? { only } : {}) }, 30000);
    if (flags.json) { say(JSON.stringify(u.result ?? { error: u.error }, null, 2)); if (u.error) process.exit(1); return; }
    if (u.error) fail(`읽지 않았다(${u.error.code}): ${u.error.message}`);
    for (const line of u.result.lines || []) say(line);
    return;
  }
  if (cmd === 'usage') { // P211: 구독 사용량
    const u = await call('usage', {}, 20000);
    if (flags.json) { say(JSON.stringify(u.result ?? { error: u.error }, null, 2)); if (u.error) process.exit(1); return; }
    if (u.error) fail(`읽지 않았다(${u.error.code}): ${u.error.message}`);
    for (const line of usageLines(u.result, u.result.at || Date.now())) say(line); // 보드의 지금 시각으로
    return;
  }
  if (cmd === 'child') {
    // P41: 따옴표 없이 친 여러 낱말 모델 이름(--model glm flash)은 뒤 낱말이 이름 자리로 새므로 멈춘다
    if (rest.length > 1) fail(`이름 자리에 낱말이 여럿이다(${rest.join(' ')}). 여러 낱말 모델 이름은 따옴표로 묶는다: --model "glm flash"`, 2);
    const body = { name: rest[0] || null, prompt: flags.prompt ?? null, role: flags.role ?? null, cwd: flags.cwd ? path.resolve(flags.cwd) : null, worktree: flags.worktree || null, model: flags.model || null, launcher: flags.launcher || null, effort: flags.effort || null, kind: flags.kind || null, wait: !flags['no-wait'], ...(flags.head ? { head: true } : {}), ...(flags.peer ? { peer: true } : {}) };
    r = await call('child', body, 110000);
  } else if (cmd === 'me') r = await call('me', {}, 20000);
  else if (cmd === 'models') r = await call('models', {}, 20000); else if (cmd === 'children') r = await call('children', { all: !!flags.all }, 20000);
  else if (cmd === 'relate') {
    if (!rest[0] || !rest[1]) fail('사용법: atrium relate <이름> sub|peer|none|auto (그 세션이 나의 하위·동료·독립, auto는 자동으로 되돌림)', 2);
    if (!['sub', 'peer', 'none', 'auto'].includes(rest[1])) fail(`관계는 sub(하위), peer(동료), none(독립), auto(자동) 가운데 하나다: ${rest[1]}`, 2);
    r = await call('relate', { name: rest[0], relation: rest[1] }, 20000);
  }
  else if (cmd === 'child-wait') {
    if (!rest[0]) fail("대기할 하위 세션 이름을 지정하세요: atrium child-wait <이름>", 2);
    r = await call('wait', { name: rest[0] }, 110000);
  }
  else if (cmd === 'wake') {
    if (!rest[0]) fail("작업을 재개할 세션 이름을 지정하세요: atrium wake <이름>", 2);
    r = await call('wake', { name: rest[0] }, 110000);
  } else {
    if (!rest[0]) fail('끌 하위 세션 이름을 준다: atrium child-kill <이름>', 2);
    r = await call('kill', { name: rest[0], only: !!flags.only }, 110000);
  }
  // 판을 잘못 찾아가지 않았는지(설정 파일의 env와 응답한 판이 같은 터미널 세션인가)
  { const want = terminalSessionVar(); if (r.board && want && r.board.terminalSession !== want) fail(`다른 보드에서 응답했습니다 (${r.board.terminalSession}, 기대 ${want})`); }
  if (flags.json) { say(JSON.stringify(r.result ?? { error: r.error }, null, 2)); if (r.error) process.exit(1); return; }
  if (r.error) {
    const e = r.error;
    fail(`${cmd === 'child' ? '하위 세션을 생성하지 않았습니다.' : cmd === 'child-kill' ? '종료하지 않았습니다.' : cmd === 'wake' ? '작업을 재개하지 못했습니다.' : cmd === 'relate' ? '관계를 바꾸지 않았다.' : '실패'}(${e.code}): ${e.message}`);
  }
  const x = r.result;
  if (cmd === 'child-wait') {
    if (x.needsTrust) { say(`@${x.name}은 아직 신뢰 질문에서 멈춰 있다(${(x.ms / 1000).toFixed(0)}초 기다림).`); trustLines(x); return; }
    if (['exited', 'closed', 'error'].includes(x.state)) return say(`@${x.name}: ${x.state}. 하위 세션이 떠 있지 않다${x.state === 'exited' ? '(신뢰 질문에서 거절했거나 끝났다)' : ''}`);
    if (x.timeout) return say(`@${x.name}: 아직 ${x.state}${x.gated ? '(워크트리로 다시 띄우는 중)' : ''}. 다시 기다리기: atrium child-wait ${x.name}`);
    say(`@${x.name}: ${x.state}${x.worktree ? ` · 워크트리 ${x.worktree}` : ''}`);
    say(`일 맡기기: atrium prompt ${x.name} "<할 일>"(맡기고 턴을 끝낸다) · 화면 읽기: ${x.next.read}`); // P116, P181
    return;
  }
  if (cmd === 'wake' || (cmd === 'child' && x.woke !== undefined)) {
    say(x.woke ? `@${x.name}을 깨웠다(${((x.ms || 0) / 1000).toFixed(1)}초, 같은 대화로 이어 감): 상태 ${x.state}` : `@${x.name}은 이미 깨어 있다: 상태 ${x.state}`);
    if (x.firstPrompt) say(`지시를 보냈다(${x.firstPrompt.status}).${x.firstPrompt.unit ? ` 일 ${x.firstPrompt.unit}: ${HAND_OFF}` : ` 끝나기 기다리기: ${x.next.wait}`}`); else say(`일 맡기기: atrium prompt ${x.name} "<할 일>"`); // P181
    say(`화면 읽기: ${x.next.read}`);
    return;
  }
  if (cmd === 'models') return printModels(x);
  if (cmd === 'me') return printMe(x);
  if (cmd === 'relate') return printRelate(x);
  if (cmd === 'child') {
    if (x.resolved) say(`모델 "${x.resolved.from}" → ${x.resolved.to} (${{ exact: '정확한 이름', alias: '별칭', loose: '유사 이름 일치', 'as-is': '이름 그대로' }[x.resolved.how] || x.resolved.how})`);
    else if (x.launcher) say(`런처 ${x.launcher}로 실행했습니다.${x.gateway ? `(게이트웨이 경유 ${x.gateway})` : ''}`);
    else if (x.inheritedGateway) say(`너의 게이트웨이(${x.inheritedGateway})와 모델을 물려받았다`);
    if (x.head) say(`헤드로 띄웠다: @${x.name} (종류 ${x.kind}). 너의 워커가 아니다. 첫 요청 뒤 보드가 부모 관계를 ${x.head.detached ? '뗐다' : '뗀다'}. 그 뒤로 일을 시키거나 기다리지 않는다`);
    else if (x.relation === 'peer') { say(`관계: 동료. @${x.name}는 너의 하위 워커가 아니다(같은 위계의 협력자). ${PEER_RULE_SHORT}. child-kill 연쇄에서 빠진다`); say(`동료를 띄웠다: @${x.name} (종류 ${x.kind}, 역할 "${x.role}")`); }
    else { say(`관계: 하위 워커. @${x.name}는 너의 워커다. 맡긴 일은 끝나면 atrium done으로 너에게 보고하고, child-kill로 함께 꺼진다`); say(`하위 세션을 생성했습니다: @${x.name} (종류 ${x.kind}, 역할 "${x.role}", ${x.depth}단계)`); }
    if (x.harness) {
      // P96: 다른 종류(codex 등). 무엇을 물려받았는지: 바탕 호출자, 띄운 명령, 승인
      const H = x.harness;
      const base = H.base === 'bare' ? '런처 없음(맨 명령)' : `런처 ${H.launcher}${H.base === 'rail' ? '(보드 레일의 기본 설정)' : ''}`;
      const appr = { parent: `너의 승인 방식 ${H.parentPermissionMode}을 옮김`, launcher: '런처의 인자', harness: `${x.kind}의 사용자 설정(너의 승인 방식 ${H.parentPermissionMode}은 옮기지 않음)` }[H.approvalFrom] || '옮기지 않음';
      say(`  폴더 ${x.cwd}${x.worktreeVia === 'git' ? ` · 워크트리 ${x.worktree}(브랜치 ${x.worktreeBranch}, 보드가 git worktree ${x.worktreeReused ? '있던 것을 다시 씀' : 'add로 만듦'})` : ''}${x.model ? ` · 모델 ${x.model}` : ''} · ${base}`); // P382
      say(`  명령 ${[H.start || x.kind, ...H.argv].join(' ')} · 승인: ${appr}${H.effort ? ` · 노력 ${H.effort}${x.kind === 'hermes' ? `(준비되면 보드가 /reasoning ${H.effort}을 넣는다)` : x.kind === 'omo' ? `(--thinking ${H.effort}로 넘긴다)` : '(런처 인자의 같은 값을 덮음)'}` : ''}`); // P208. P299: Hermes
      say(`  ${x.kind}는 hook이 없다. 보드가 화면으로 끝과 답을 보고, atrium wait가 같은 모양으로 돌려준다`);
    } else say(`  폴더 ${x.cwd}${x.worktree ? ` · 워크트리 ${x.worktree}(claude -w${x.gate ? ', 신뢰를 받은 뒤' : ''})` : ''}${x.model ? ` · 모델 ${x.model}` : ''}${x.effort ? ` · 노력 ${x.effort}` : ''} · 승인 방식 ${x.permissionMode}`);
    if (x.effortNote) say(`  ${x.effortNote}`); // P208: 노력 수준을 받지 않는 종류
    if (x.warning) say(`  ${x.warning}`); // P382: omo가 주 체크아웃에서 뜸
    if (x.branchNote) say(`  ${x.branchNote}`); // P382: OMO가 쓰는 브랜치
    const w = x.waited;
    if (x.needsTrust) { trustLines(x); say(`응답 읽기: ${x.next.read}`); say(counts(x.counts)); return; }
    if (!w) say(`  상태: 기다리지 않음(--no-wait). 준비되면 보드가 첫 요청을 넣는다. 끝나기 기다리기: atrium wait ${x.name}`);
    else if (w.state === 'waiting') say('  상태: 승인을 기다린다. 사용자에게 보드의 승인 카드에 답해 달라고 알린다');
    else if (['error', 'exited', 'closed'].includes(w.state)) { say(`  상태: ${w.state}. 하위 세션이 제대로 뜨지 않았다${x.error ? `(${x.error.type}: ${x.error.message || ''})` : ''}`); if (x.exit && x.exit.error) say(`  화면의 오류: ${x.exit.error}`); } // P337: 끝 화면의 오류 문장을 그대로
    else if (w.timeout) say(`  상태: ${w.state}(아직 준비 중). atrium wait ${x.name}으로 기다린다`);
    else say(`  상태: ${w.state}${x.firstPrompt ? `, 첫 요청 ${w.delivery || x.firstPrompt.status}` : ''} (${(w.ms / 1000).toFixed(1)}초)`);
    // P79: 첫 요청이 들어갔다고 확인하지 못했으면 그 사실과 다음 명령
    const fp = x.firstPrompt ? (w && w.delivery) || x.firstPrompt.status : null;
    if (fp && fp !== 'confirmed') {
      if (['unconfirmed', 'failed', 'cancelled'].includes(fp)) say(`  첫 요청이 들어가지 않았다(${fp}). 화면 보기: atrium read ${x.name} --lines 40 · 다시 보내기: ${x.next.prompt}`);
      else say(`  첫 요청은 아직 확인되지 않았다(${fp}). 보드가 들어갈 때까지 보낸다. 확인: atrium children(들어가지 않으면 "첫 요청 안 들어감"이 보인다) · 다시 보내기: ${x.next.prompt}`);
    }
    if (x.head) { say(`화면 보기(필요할 때만): ${x.next.read}`); say('지금 연결: atrium me'); return; }
    if (x.relation === 'peer') say(`동료는 결과를 보내오지 않는다(한 일은 atrium news ${x.name}). 기다리지 않고 턴을 끝낸다. 보낼 때(질문·넘기기 등): atrium prompt ${x.name} "<글>"`); // P204
    else if (x.firstPrompt && x.firstPrompt.unit) say(HAND_OFF); // P181: 맡기고 턴을 끝낸다
    else if (x.firstPrompt) say(`끝나기 기다리기: ${x.next.wait}`); else say(`일 맡기기: atrium prompt ${x.name} "<할 일>"`);
    say(`화면 읽기: ${x.next.read}`);
    say(counts(x.counts));
    return;
  }
  if (cmd === 'children') {
    say(`@${x.parent}(${x.depth}단계)의 하위 세션 ${x.children.length}개. ${counts(x.counts)}`);
    // P156: 하위 관계만 나무로, 동료는 따로 한 줄. 들여쓰기는 부르는 세션에서 몇 단계 아래인지(level)
    for (const c of x.children) c.depth = x.depth + (c.level || Math.max(1, c.depth - x.depth));
    for (const c of x.children) {
      say(`${'  '.repeat(Math.max(1, c.depth - x.depth))}@${c.name} ("${c.role || '-'}", ${c.depth}단계${c.kind && c.kind !== 'claude' ? `, ${c.kind}` : ''}) ${c.state}${c.state === 'sleeping' ? ` — 절전 중. 시키기 전에 atrium wake ${c.name}` : ''}${c.state === 'trust_wait' ? ` — 신뢰 질문(사람이 답한다). 기다리기: atrium child-wait ${c.name}` : c.gated ? ` — 워크트리로 다시 띄울 차례. 기다리기: atrium child-wait ${c.name}` : ''}${c.ask ? ` — 묻는 중: ${c.ask}` : ''}${c.error ? ` — 오류 ${c.error.type}: ${(c.error.message || '').replace(/\s+/g, ' ')}` : ''}${c.model ? ` · 모델 ${c.model}` : ''}${c.children ? ` · 하위 ${c.children}` : ''}`);
      if (c.error && /model/i.test(c.error.type || '')) say(`${'  '.repeat(Math.max(1, c.depth - x.depth) + 1)}모델을 쓰지 못했다. 다른 모델로 다시 띄운다(atrium models). 끄기는 사람이 끄라고 할 때만`);
      if (c.firstPromptLost) say(`${'  '.repeat(Math.max(1, c.depth - x.depth) + 1)}첫 요청 안 들어감(${c.firstPromptLost.status}${c.firstPromptLost.reason ? `: ${c.firstPromptLost.reason}` : ''}). 화면 보기: atrium read ${c.name} --lines 40 · 다시 보내기: atrium prompt ${c.name} "<할 일>"`); // P79
      if (c.deliveryStuck) say(`${'  '.repeat(Math.max(1, c.depth - x.depth) + 1)}보낸 글이 ${Math.round((Date.now() - c.deliveryStuck.since) / 1000)}초째 들어가지 않음(${c.deliveryStuck.code || c.deliveryStuck.reason}, ${c.deliveryStuck.attempts}번 시도, 보드가 간격을 늘려 다시 보낸다). 화면 보기: atrium read ${c.name} --lines 40 · 취소는 사람이 보드에서 한다(전달 ${c.deliveryStuck.deliveryId})`); // P106. P116: 이 atrium에는 cancel이 없다
      if (c.lastAnswer) say(`${'  '.repeat(Math.max(1, c.depth - x.depth) + 1)}마지막 응답:${c.lastAnswer.replace(/\s+/g, ' ').slice(0, 400)}`);
    }
    if (x.peers && x.peers.length) say(`동료(하위가 아니다, 한 일은 atrium news): ${x.peers.map((p) => `@${p.name} ${p.state}`).join(', ')}`);
    return;
  }
  say(`껐다: ${x.killed.map((k) => `@${k.name}${k.closed ? '' : `(실패 ${k.error || ''})`}`).join(', ')}`);
  if (x.kept && x.kept.length) say(`남겼다(하위가 아니라 끄지 않음): ${x.kept.map((k) => `@${k.name}(${REL_WORD[k.relation] || k.relation})`).join(', ')}`); // P156
}
// ---------- P284: atrium ask ----------
// P295: 보내는 때. --no-wait면 답을 기다리지 않는 질문·확인(답은 너에게 다음 글이 갈 때 그 앞에 실려 온다), --wait면 답을 기다린다(곧바로 온다)
const timingFlags = () => (flags['no-wait'] ? { noWait: true } : flags.wait ? { wait: true } : {});
const TIMING_SAY = { next: ' 답은 곧바로 오지 않고 너에게 다음 글이 갈 때 그 앞에 실려 온다(--no-wait).', now: ' 사람이 답하면 곧바로 온다(--wait).' };
function cardLine(d, now) {
  const opts = d.options && d.options.length ? ` [${d.options.join(' | ')}]` : '';
  return `  #${d.id} · ${ago(d.createdAt, now)}: ${d.question}${opts}${d.why ? ` (맥락: ${d.why})` : ''}`;
}
async function askVerb() {
  let body;
  if (flags.list) { if (rest.length || flags.done != null) fail('사용법: atrium ask --list', 2); body = { list: true }; }
  else if (flags.done != null && flags.done !== true) { if (rest.length) fail('사용법: atrium ask --done <번호>', 2); body = { done: String(flags.done) }; }
  else if (flags.reopen != null) { if (flags.reopen === true || rest.length) fail('사용법: atrium ask --reopen <번호>', 2); body = { reopen: String(flags.reopen) }; } // P357
  else {
    if (flags.done != null) fail('닫을 카드 번호를 준다: atrium ask --done <번호>', 2);
    const question = rest.join(' ').replace(/\s+/g, ' ').trim();
    if (!question) fail('질문 한 줄을 준다: atrium ask "<질문>" [--option "<보기>"]… [--why "<맥락>"]', 2);
    if (question.length > ASK_QUESTION_MAX) fail(`질문이 너무 길다(${question.length}자, ${ASK_QUESTION_MAX}자까지). 한 줄로 줄이고 맥락은 --why에 쓴다`, 2);
    const options = (flags.option || []).filter((x) => x != null).map(String);
    if (options.length > ASK_OPTIONS_MAX) fail(`보기가 너무 많다(${options.length}개, ${ASK_OPTIONS_MAX}개까지)`, 2);
    if (flags.why === true) fail('맥락 한 줄을 준다: --why "<맥락>"', 2);
    if (flags.wait && flags['no-wait']) fail('--wait와 --no-wait는 함께 쓰지 않는다', 2);
    body = { question, options, ...(flags.why != null ? { why: String(flags.why) } : {}), ...timingFlags() }; // P295
  }
  const r = await call('ask', body, 20000);
  { const want = terminalSessionVar(); if (r.board && want && r.board.terminalSession !== want) fail(`다른 보드에서 응답했습니다 (${r.board.terminalSession}, 기대 ${want})`); }
  if (flags.json) { say(JSON.stringify(r.result ?? { error: r.error }, null, 2)); if (r.error) process.exit(r.error.code === 'bad_request' || r.error.code === 'too_long' ? 2 : 1); return; }
  if (r.error) fail(`결정 카드를 ${body.list ? '읽지' : body.done ? '닫지' : body.reopen ? '다시 열지' : '남기지'} 않았다(${r.error.code}): ${r.error.message}`, r.error.code === 'bad_request' || r.error.code === 'too_long' ? 2 : 1);
  const x = r.result; const now = Date.now();
  if (body.list) {
    if (!x.cards.length) return say('열린 결정 카드가 없다.');
    say(`너의 열린 결정 카드 ${x.cards.length}장(${x.max}장까지, 오래된 것부터):`);
    for (const d of x.cards) say(cardLine(d, now));
    return say('사람이 다른 길로 답했거나 쓸모없어진 카드는 atrium ask --done <번호>로 닫는다.');
  }
  if (body.done) return say(x.closed ? `결정 카드 #${x.id}를 닫았다.` : `결정 카드 #${x.id}는 이미 끝났다(${x.state}).`);
  if (body.reopen) return say(x.reopened ? `카드 #${x.id}를 다시 열었다. 사람이 카드에서 답하면 글로 들어온다.` : `카드 #${x.id}는 이미 열려 있다.`); // P357
  say(`결정 카드 #${x.id}를 보드에 남겼다(열린 카드 ${x.open}/${x.max}). 사람이 카드에서 답하면 "[결정] <질문> → <답>" 글로 들어온다. 무시하면 아무것도 오지 않는다.${(x.card && TIMING_SAY[x.card.timing]) || ''}`);
  say('대화에 쓴 질문은 그대로 두고 턴을 끝낸다. 사람이 터미널에 직접 답하면 보드가 닫고 한 줄로 알린다. 다른 길로 답을 받았으면 atrium ask --done ' + x.id + '로 닫는다.'); // P357: 터미널 글은 손 결정·확인 카드를 닫는다
}

// ---------- P292: atrium todo ----------
const KIND_KO = { decide: '결정', do: '실행', check: '확인', later: '나중에' }; // P305: do는 "실행"(목록 이름 "할 일"과 겹치지 않게)
function todoLine(d, now) {
  const cmds = d.cmds && d.cmds.length ? ` 명령: ${d.cmds.map((c) => `\`${c}\``).join(', ')}` : '';
  const when = d.cond ? ` (조건: ${d.cond})` : d.wakeAt && d.wakeAt > now ? ` (${new Date(d.wakeAt).toLocaleString('sv-SE').slice(0, 16)}에 띄움)` : '';
  return `  #${d.id} [${KIND_KO[d.kind] || d.kind}${d.auto ? '·자동' : ''}] · ${ago(d.createdAt, now)}: ${d.question}${cmds}${when}${d.tell ? ' (했음을 알림)' : ''}`;
}
async function todoVerb() {
  let body;
  if (flags.list) { if (rest.length || flags.done != null) fail('사용법: atrium todo --list', 2); body = { list: true }; }
  else if (flags.done != null && flags.done !== true) { if (rest.length) fail('사용법: atrium todo --done <번호>', 2); body = { done: String(flags.done) }; }
  else if (flags.reopen != null) { if (flags.reopen === true || rest.length) fail('사용법: atrium todo --reopen <번호>', 2); body = { reopen: String(flags.reopen) }; } // P357
  else {
    if (flags.done != null) fail('닫을 카드 번호를 준다: atrium todo --done <번호>', 2);
    const text = rest.join(' ').replace(/\s+/g, ' ').trim();
    if (!text) fail('할 일 한 줄을 준다: atrium todo "<할 일>" [--cmd "<명령>"]… [--check] [--later "<날짜 또는 조건>"] [--why "<맥락>"] [--tell]', 2);
    if (text.length > ASK_QUESTION_MAX) fail(`할 일이 너무 길다(${text.length}자, ${ASK_QUESTION_MAX}자까지). 한 줄로 줄이고 맥락은 --why에 쓴다`, 2);
    const cmds = (flags.cmd || []).filter((x) => x != null && x !== true).map(String);
    if (cmds.length > TODO_CMDS_MAX) fail(`명령이 너무 많다(${cmds.length}개, ${TODO_CMDS_MAX}개까지)`, 2);
    if (flags.why === true) fail('맥락 한 줄을 준다: --why "<맥락>"', 2);
    if (flags.later === true) fail('언제·어떤 조건에 할지 준다: --later "YYYY-MM-DD[ HH:MM]" 또는 --later "<조건>"', 2);
    if (flags.check && flags.later != null) fail('--check와 --later는 함께 쓰지 않는다', 2);
    if (flags.wait && flags['no-wait']) fail('--wait와 --no-wait는 함께 쓰지 않는다', 2);
    body = { text, cmds, ...timingFlags(), ...(flags.check ? { check: true } : {}), ...(flags.tell ? { tell: true } : {}), ...(flags.later != null ? { later: String(flags.later) } : {}), ...(flags.why != null ? { why: String(flags.why) } : {}) };
  }
  const r = await call('todo', body, 20000);
  { const want = terminalSessionVar(); if (r.board && want && r.board.terminalSession !== want) fail(`다른 보드에서 응답했습니다 (${r.board.terminalSession}, 기대 ${want})`); }
  if (flags.json) { say(JSON.stringify(r.result ?? { error: r.error }, null, 2)); if (r.error) process.exit(r.error.code === 'bad_request' || r.error.code === 'too_long' ? 2 : 1); return; }
  if (r.error) fail(`할 일 카드를 ${body.list ? '읽지' : body.done ? '닫지' : body.reopen ? '다시 열지' : '남기지'} 않았다(${r.error.code}): ${r.error.message}`, r.error.code === 'bad_request' || r.error.code === 'too_long' ? 2 : 1);
  const x = r.result; const now = Date.now();
  if (body.list) {
    if (!x.cards.length) return say('열린 카드가 없다.');
    const act = x.cards.filter((d) => !d.deferred); const lat = x.cards.filter((d) => d.deferred);
    if (act.length) { say(`열린 카드 ${act.length}장(오래된 것부터):`); for (const d of act) say(todoLine(d, now)); }
    if (lat.length) { say(`나중 ${lat.length}장:`); for (const d of lat) say(todoLine(d, now)); }
    return say('끝났거나 쓸모없어진 카드는 atrium todo --done <번호>로 닫는다.');
  }
  if (body.done) return say(x.closed ? `카드 #${x.id}를 닫았다.` : `카드 #${x.id}는 이미 끝났다(${x.state}).`);
  if (body.reopen) return say(x.reopened ? `카드 #${x.id}를 다시 열었다.` : `카드 #${x.id}는 이미 열려 있다.`); // P357
  const c = x.card || {};
  const what = x.kind === 'check' ? '사람이 됐다/안 됐다로 답하면 "[확인] <할 일> → 됐다: 메모" 글로 들어온다.'
    : c.cond ? '사람이 꺼낼 때까지 "나중"에 둔다.'
    : c.wakeAt ? `${new Date(c.wakeAt).toLocaleString('sv-SE').slice(0, 16)}까지 숨겼다가 띄운다.`
    : c.tell ? '사람이 했음을 누르면 "[실행] <할 일> → 했음" 글로 들어온다.' : '사람이 했음을 누르면 기록만 된다(알아야 하면 --tell).';
  say(`${KIND_KO[x.kind] || x.kind} 카드 #${x.id}를 보드의 "할 일 목록"에 남겼다(${x.kind === 'later' ? '나중' : '열린'} 카드 ${x.open}/${x.max}). ${what}${(c.timing && (x.kind === 'check' || c.tell) && TIMING_SAY[c.timing]) || ''}`);
  say('대화에 쓴 글은 그대로 두고 턴을 끝낸다. 끝났거나 쓸모없어지면 atrium todo --done ' + x.id + '.');
}

// ---------- P204: atrium log | news ----------
const KIND_WORD = { turn: '턴', done: 'done', log: 'log', merge: '병합' }; // P267: merger의 합침 한 줄
function newsLine(r, now) {
  const head = `  @${r.name} · ${ago(r.at, now)} · ${KIND_WORD[r.kind] || r.kind}`;
  if (r.kind === 'turn') return `${head}: "${r.task}" → ${r.text}`;
  if (r.kind === 'done') return `${head} ${r.result}${r.task ? ` "${r.task}"` : ''}: ${r.text}`;
  return `${head}: ${r.text}`;
}
// P360: atrium revive <이름|ID> · atrium fork <이름|ID> [--launcher 런처] [--name 새 이름] [--model m] [--effort e] [--peer]
async function reviveVerb(cmd) {
  if (!rest[0]) fail(cmd === 'revive' ? '되살릴 세션의 이름이나 세션 ID를 준다: atrium revive <이름|ID>' : '갈라 열 세션의 이름이나 세션 ID를 준다: atrium fork <이름|ID> [--launcher claude-sdk]', 2);
  if (rest.length > 1) fail(`이름 자리에 낱말이 여럿이다(${rest.join(' ')}). 사용법: atrium help`, 2);
  if (cmd === 'revive' && (flags.launcher || flags.name || flags.model || flags.effort || flags.peer)) fail('revive는 이름(또는 ID)만 받는다. 새 세션으로 띄우려면 atrium fork', 2);
  const body = cmd === 'revive' ? { name: rest[0] } : { name: rest[0], launcher: flags.launcher || null, as: flags.name || null, model: flags.model || null, effort: flags.effort || null, ...(flags.peer ? { peer: true } : {}) };
  const r = await call(cmd, body, 180000);
  { const want = terminalSessionVar(); if (r.board && want && r.board.terminalSession !== want) fail(`다른 보드에서 응답했습니다 (${r.board.terminalSession}, 기대 ${want})`); }
  if (flags.json) { say(JSON.stringify(r.result ?? { error: r.error }, null, 2)); if (r.error) process.exit(1); return; }
  if (r.error) fail(`${cmd === 'revive' ? '되살리지 않았다' : '갈라 열지 않았다'}(${r.error.code}): ${r.error.message}`);
  for (const line of r.result.lines || []) say(line);
}
async function newsVerb(cmd) {
  let r;
  if (cmd === 'log') {
    const text = rest.join(' ').replace(/\s+/g, ' ').trim();
    if (!text) fail('남길 한 줄을 준다: atrium log "<한 줄>"', 2);
    if (text.length > NEWS_LOG_MAX) fail(`한 줄이 너무 길다(${text.length}자, ${NEWS_LOG_MAX}자까지). 줄여서 다시 남긴다`, 2);
    r = await call('log', { text }, 20000);
  } else {
    if (rest.length > 1) fail('사용법: atrium news [<이름>] [--all]', 2);
    r = await call('news', { name: rest[0] || null, all: !!flags.all }, 20000);
  }
  { const want = terminalSessionVar(); if (r.board && want && r.board.terminalSession !== want) fail(`다른 보드에서 응답했습니다 (${r.board.terminalSession}, 기대 ${want})`); }
  if (flags.json) { say(JSON.stringify(r.result ?? { error: r.error }, null, 2)); if (r.error) process.exit(1); return; }
  if (r.error) fail(`${cmd === 'log' ? '남기지 않았다' : '읽지 않았다'}(${r.error.code}): ${r.error.message}`, r.error.code === 'too_long' || r.error.code === 'bad_request' ? 2 : 1);
  const x = r.result;
  if (cmd === 'log') return say(`동료 소식에 남겼다(${x.chars}자). 아무에게도 보내지 않았다. 너의 동료가 atrium news로 읽는다.`);
  const now = Date.now();
  if (x.name) {
    if (!x.rows.length) return say(`@${x.name}의 소식이 없다.`);
    say(`@${x.name}의 최근 소식 ${x.rows.length}줄(오래된 것부터):`);
  } else if (!x.peers.length) return say('동료가 없다. 다른 세션의 소식은 atrium news <이름>');
  else if (!x.rows.length) return say(`동료(${x.peers.map((p) => '@' + p).join(', ')})의 새 소식이 없다${flags.all ? '' : '. 최근 것: atrium news --all'}.`);
  else say(`${flags.all ? '동료의 최근 소식' : '동료의 새 소식'} ${x.rows.length}줄(오래된 것부터):`);
  for (const row of x.rows) say(newsLine(row, now));
  if (!x.name && !flags.all && x.more > 0) say(`…새 소식 ${x.more}줄이 더 있다(다시 atrium news).`);
}

// ---------- P180: atrium done | item | items ----------
async function unitVerb(cmd) {
  let r;
  if (cmd === 'done') {
    const result = rest[0];
    if (!result || !/^[a-z][a-z0-9_]{0,23}$/.test(result)) fail('사용법: atrium done ok|failed "<보고>" (ok 끝냈다, failed 못 했다)', 2);
    let text = rest.slice(1).join(' ');
    if (flags.file) { if (text) fail('글은 인자나 --file 가운데 하나로 준다', 2); try { text = fs.readFileSync(path.resolve(String(flags.file)), 'utf8'); } catch (e) { fail(`--file을 읽지 못했다: ${e.message}`, 2); } }
    if (!text.trim()) fail('보고 글을 준다: atrium done ok|failed "<보고>"', 2);
    // P334: --record 파일(여럿)은 절대 경로로 보낸다. 보드가 검사해 주 체크아웃의 .atrium/records/로 복사한다
    const records = (flags.record || []).filter((x) => x != null && x !== true && String(x).trim()).map((x) => path.resolve(String(x)));
    if (flags.record && flags.record.some((x) => x == null)) fail('--record 뒤에 파일 경로를 준다: atrium done ok "<보고>" --record <파일>', 2);
    r = await call('done', { result, text, ...(records.length ? { records } : {}) }, 30000);
  } else r = await call(cmd, {}, 20000);
  { const want = terminalSessionVar(); if (r.board && want && r.board.terminalSession !== want) fail(`다른 보드에서 응답했습니다 (${r.board.terminalSession}, 기대 ${want})`); }
  if (flags.json) { say(JSON.stringify(r.result ?? { error: r.error }, null, 2)); if (r.error) process.exit(1); return; }
  if (r.error) fail(`${cmd === 'done' ? '닫지 않았다' : '읽지 않았다'}(${r.error.code}): ${r.error.message}`, cmd === 'done' && r.error.code === 'bad_request' ? 2 : 1); // 값을 잘못 씀은 2
  const x = r.result;
  if (cmd === 'done') {
    // P267: merger = 브랜치에서 일한 결과라 보드가 합치기를 merger에게 맡겼다. 합치기 일의 ok(retire 칸이 있음)는 부모를 깨우지 않는다
    const how = { wait: `@${x.parent}가 기다리던 atrium wait가 받았다`, queue: `보드가 @${x.parent} 차례에 한 번 넣는다`, merger: x.merge && x.merge.dup ? `같은 끝 커밋의 병합은 이미 ${x.merge.merger ? '@' + x.merge.merger : 'merger'}에게 맡겼다(일 ${x.merge.unit}). 새로 맡기지 않았다. 너는 이 턴이 끝나면 보드가 재운다` /* P369 */ : `보드가 병합을 ${x.merge && x.merge.merger ? '@' + x.merge.merger : 'merger'}에게 맡겼다(일 ${x.merge ? x.merge.unit : '?'}). 너는 이 턴이 끝나면 보드가 재운다`, record: x.retire != null && x.result === 'ok' ? `병합을 보드가 소식에 남기고 @${x.parent}의 items에 보인다(@${x.parent}를 깨우지 않는다)` : x.parentOpen ? '네가 너에게 맡긴 일이라 기록만 남겼다' : `@${x.parent}는 닫혀 있어 기록만 남겼다` }[x.claimedBy] || x.claimedBy;
    say(`일 ${x.unit}을 닫았다(${x.result}). ${how}. 다른 길로 따로 보고하지 않는다.`);
    if (x.records) say(`기록 ${x.records.files.length}개를 보드가 ${x.records.dir}/에 두었다(git 밖, 보고에 경로가 붙는다).`); // P334
    if (x.next) say(`줄 서 있던 다음 일 ${x.next.unit}을 보드가 넣는다.`); else if (x.retire) say('다섯 번째 병합 일이다. 이제 쉰다: 보드가 너를 닫고 남은 일은 새 merger가 받는다.'); else say('이제 쉰다.');
    return;
  }
  if (cmd === 'item') {
    if (!x.item) return say(`지금 보드가 맡긴 열린 일이 없다${x.queued ? `(줄 선 일 ${x.queued}개)` : ''}. 머리 없이 받은 일은 지시에 적힌 방법으로 보고한다.`);
    const it = x.item;
    say(`일 ${it.id}: @${it.from}가 맡김(${it.origin}) · ${ago(it.startedAt, Date.now())} 시작${x.queued ? ` · 뒤에 줄 선 일 ${x.queued}개` : ''}`);
    say('--- 할 일 ---'); say(it.spec.replace(/\s+$/, '')); say('---');
    say('끝나면: atrium done ok "<보고>" (못 했으면 atrium done failed "<까닭>")');
    return;
  }
  if (!x.items.length) return say('네가 맡긴 일이 없다.');
  say(`네가 맡긴 일 ${x.items.length}개(열림 ${x.open}):`);
  for (const it of x.items) {
    say(`  ${it.id} → @${it.to || '?'} · ${it.queued ? 'open(줄 서 있음)' : it.status}${it.result ? ` · ${it.result}` : ''}${it.stopReason && it.status === 'open' ? ` · 멈춤(${it.stopReason})` : ''} · ${ago(it.createdAt, Date.now())} · "${it.spec}"`);
    if (it.text) say(`      보고: ${it.text.replace(/\s+/g, ' ').slice(0, 400)}`);
    if (it.merge) say(`      병합: ${{ queued: '줄 서 있음', merging: '병합 중', merged: '병합됨', failed: '실패(알림을 본다)', cancelled: '취소' }[it.merge.state] || it.merge.state}${it.merge.merger ? ` · @${it.merge.merger}` : ''}${it.merge.hash ? ` · ${String(it.merge.hash).slice(0, 9)}` : ''}`); // P267
  }
}
// ---------- P182: atrium guide ----------
// ---------- P364: atrium know ----------
// atrium know "<물음>" [-k N] [--kind 종류] [--before 시각|커밋] [--self] | open <포인터> [--context n] | unit <PNNN> | build [--full] | --usage [--since 날짜|7d]
// 보드가 그대로 찍을 글(out)을 돌려준다(첫 줄에 돌려준 글자 수, --json이면 JSON 한 줄)
async function knowVerb() {
  let k = null; const words = [];
  for (let i = 0; i < rest.length; i++) { if (rest[i] === '-k') { k = rest[i + 1]; i++; } else words.push(rest[i]); }
  if (k == null && /^-k\d+$/.test(argv.find((a) => /^-k\d+$/.test(a)) || '')) k = argv.find((a) => /^-k\d+$/.test(a)).slice(2);
  const filtered = words.filter((w) => !/^-k\d+$/.test(w));
  let body;
  if (flags.usage) body = { action: 'usage', ...(flags.since ? { since: flags.since } : {}) };
  else if (filtered[0] === 'open' && filtered.length >= 2) body = { action: 'open', pointer: filtered.slice(1).join(' '), ...(flags.context != null ? { context: Number(flags.context) } : {}) };
  else if (filtered[0] === 'unit' && filtered.length === 2) body = { action: 'unit', unit: filtered[1] };
  else if (filtered[0] === 'build' && filtered.length === 1) body = { action: 'build', full: !!flags.full };
  else {
    const q = filtered.join(' ').trim();
    if (!q) fail('물음을 준다: atrium know "<물음>" [-k N] [--kind doc|log|record|review|code|db] [--before 시각|커밋] · know open <포인터> · know unit <PNNN> · know build [--full] · know --usage', 2);
    if (k != null && !(Number(k) >= 1)) fail('-k는 1 이상의 수다', 2);
    body = { action: 'search', q, ...(k != null ? { k: Number(k) } : {}), ...(flags.kind ? { kind: flags.kind } : {}), ...(flags.self ? { self: true } : {}) };
  }
  if (body.action !== 'usage' && flags.before) body.before = flags.before;
  if (flags.json) body.json = true;
  const r = await call('know', body, 200000);
  if (r.error) { if (flags.json) { say(JSON.stringify({ error: r.error })); process.exit(1); } fail(`찾지 못했다(${r.error.code}): ${r.error.message}`); }
  process.stdout.write(r.result.out);
}
async function guideVerb() {
  // P267: atrium guide merger(merger 안내)
  if (rest[0] === 'merger') {
    const m = await call('guide', { topic: 'merger' }, 20000);
    { const want = terminalSessionVar(); if (m.board && want && m.board.terminalSession !== want) fail(`다른 보드에서 응답했습니다 (${m.board.terminalSession}, 기대 ${want})`); }
    if (flags.json) { say(JSON.stringify(m.result ?? { error: m.error }, null, 2)); if (m.error) process.exit(1); return; }
    if (m.error) fail(`읽지 않았다(${m.error.code}): ${m.error.message}`);
    const g = (m.result && m.result.merger) || {};
    say(String(g.text || '').replace(/\s+$/, ''));
    return say(`\n이 프로젝트의 merger: ${g.enabled ? '켜짐' : '꺼짐'}(설정 ${g.mode || '?'}).`);
  }
  const r = await call('guide', {}, 20000);
  { const want = terminalSessionVar(); if (r.board && want && r.board.terminalSession !== want) fail(`다른 보드에서 응답했습니다 (${r.board.terminalSession}, 기대 ${want})`); }
  if (flags.json) { say(JSON.stringify(r.result ?? { error: r.error }, null, 2)); if (r.error) process.exit(1); return; }
  if (r.error) fail(`읽지 않았다(${r.error.code}): ${r.error.message}`);
  say(HELP);
}
// ---------- P116: atrium prompt | wait | read ----------
const secs = (ms) => `${((ms || 0) / 1000).toFixed(1)}초`;
const WAIT_HTTP_EXTRA = 20000;
async function verb(cmd) {
  const name = rest[0];
  if (!name) fail(`받을 세션 이름을 준다: atrium ${cmd} <이름>${cmd === 'prompt' ? ' "<할 일>"' : ''}`, 2);
  const timeoutMs = flags.timeout != null ? Number(flags.timeout) : null;
  if (flags.timeout != null && !(timeoutMs > 0)) fail(`--timeout은 밀리초 수다: ${flags.timeout}`, 2);
  let r;
  if (cmd === 'prompt') {
    let text = rest.slice(1).join(' ');
    if (flags.file) { if (text) fail('글은 인자나 --file 가운데 하나로 준다', 2); try { text = fs.readFileSync(path.resolve(String(flags.file)), 'utf8'); } catch (e) { fail(`--file을 읽지 못했다: ${e.message}`, 2); } }
    if (!text.trim()) fail('보낼 글을 준다: atrium prompt <이름> "<할 일>"', 2);
    if (flags.steer) flags.now = true; // P248: --steer는 --now의 뜻이 보이는 이름이다
    if (flags.now && flags.wait) fail('--steer·--now와 --wait는 함께 쓸 수 없다(--steer는 받는 쪽의 지금 턴에 넣어 짝지을 답이 없다). 답을 받으려면 --wait만, 일하는 중에도 바로 알리려면 --steer만 준다.', 2); // P143
    r = await call('prompt', { name, text, wait: !!flags.wait, ...(flags.now ? { now: true } : {}), ...(flags.raw ? { raw: true } : {}), timeoutMs }, flags.wait ? (timeoutMs || 100000) + WAIT_HTTP_EXTRA : 60000);
  } else if (cmd === 'wait') r = await call('turn', { name, timeoutMs }, (timeoutMs || 100000) + WAIT_HTTP_EXTRA);
  else {
    const lines = flags.lines != null ? Number(flags.lines) : null;
    if (flags.lines != null && !(lines > 0)) fail(`--lines는 줄 수다: ${flags.lines}`, 2);
    r = await call('read', { name, lines }, 30000);
  }
  { const want = terminalSessionVar(); if (r.board && want && r.board.terminalSession !== want) fail(`다른 보드에서 응답했습니다 (${r.board.terminalSession}, 기대 ${want})`); }
  const x = r.result;
  const turn = cmd === 'wait' ? x : x && x.turn;
  const code = r.error ? 1 : turn ? turnExit(turn.status) : x && x.delivery && ['failed', 'cancelled'].includes(x.delivery.status) ? 1 : 0;
  process.exitCode = code; // 출력을 다 쓴 뒤 끝나게 exit를 부르지 않는다(파이프 출력)
  if (flags.json) return say(JSON.stringify(x ?? { error: r.error }, null, 2));
  if (r.error) fail(`${cmd === 'prompt' ? '보내지 않았다' : cmd === 'wait' ? '기다리지 않았다' : '읽지 않았다'}(${r.error.code}): ${r.error.message}`);
  if (cmd === 'read') return printRead(x);
  if (cmd === 'prompt') printDelivery(x);
  if (cmd === 'prompt' && x.unit) say(x.unit.kind === 'followup' ? `@${x.name}가 맡은 일 ${x.unit.id}에 붙는 글로 보냈다(새 일이 아니다).` : `일 ${x.unit.id}로 맡겼다. @${x.name}는 끝나면 atrium done으로 닫고, 그 값이 너에게 한 번 온다.`); // P180
  if (turn) printTurn(x, turn);
  else if (cmd === 'prompt' && flags.now) say(`--${flags.steer ? 'steer' : 'now'}로 보냈으니 기다리지 않는다. 화면 보기: ${x.next.read}`); // P143: 밀어 넣기는 기다리지 않는다(한 길로)
  else if (cmd === 'prompt' && x.unit) say(`${HAND_OFF} 화면 보기: ${x.next.read}`); // P181: 맡기고 턴을 끝낸다
  else if (cmd === 'prompt') say(`끝나기 기다리기: ${x.next.wait} · 화면 보기: ${x.next.read}`);
}
// 기다린 결과의 종료 코드: 기다리는 시간이 끝남 3, 글이 들어가지 않음·받는 세션이 끝남 1
function turnExit(status) { return status === 'timeout' ? 3 : ['failed', 'closed', 'exited', 'aborted'].includes(status) ? 1 : 0; }
const REASON = {
  working: (n) => `@${n}는 일하는 중이다. 보드가 이번 턴이 끝나면 넣는다(대기열, 턴이 길어도 기다린다. 끝내 못 넣으면 보드가 너에게 알린다)`, // P215
  waiting: (n) => `@${n}는 사람의 답을 기다린다. 보드가 사람이 답한 뒤 넣는다. 대신 답하지 않는다. 사용자에게 "보드에서 @${n}에 답해 주세요"라고 알린다`,
  trust_wait: (n) => `@${n}는 신뢰 질문에서 멈춰 있다. 보드가 사람이 답한 뒤 넣는다. 사용자에게 "보드에서 @${n} 카드의 신뢰 질문에 답해 주세요"라고 알린다`,
  user_typing: (n) => `사람이 @${n}의 터미널에 치는 중이다. 보드가 멈춘 뒤 넣는다`,
  // P139: 쓰다 만 글은 비키고 보낸다. 이 까닭은 입력 칸을 아직 비우지 못했을 때(또는 일하는 중에 바로 넣기를 못 할 때)뿐이다
  draft: (n) => `@${n}의 입력 칸에 글이 있어 보드가 아직 넣지 못했다(지시가 그 글과 함께 제출되지 않게). 보드가 그 칸을 비키고 곧 넣는다. 다시 보내지 않는다`,
  sleeping: (n) => `@${n}는 잠들어 있다. 보드가 깨운 뒤 넣는다`,
  unit_wait: (n) => `@${n}는 다른 세션이 맡긴 일을 하는 중이다. 보드가 그 일이 끝나면 이 일을 넣는다`, // P180
  starting: (n) => `@${n}는 뜨는 중이다. 준비되면 보드가 넣는다`,
};
// P128: 받는 쪽 입력 칸에 사람이 쓰다 만 글이 있어 잠시 비키고 보냈다(되돌리기 결과는 전달 기록의 까닭)
const DRAFT_NOTE = {
  draft_moved: '입력 칸에 쓰다 만 글이 있어 잠시 비키고 지시만 제출했다. 보드가 그 글을 입력 칸에 되돌린다.',
  draft_restored: '입력 칸에 쓰다 만 글이 있어 잠시 비키고 지시만 제출한 뒤 되돌렸다.',
  draft_partial: '입력 칸에 쓰다 만 글이 있어 잠시 비키고 지시만 제출한 뒤 화면에 보이던 대로 되돌렸다(접힌 붙여넣기 같은 원래 글은 보드 기록 delivery_draft에 있다).', // P139
  draft_stashed: '입력 칸에 쓰다 만 글이 있어 잠시 비키고 지시만 제출했다. 그 글은 Claude Code가 쥐고 있다(빈 입력 칸에서 Ctrl+S로 꺼낸다).',
  draft_held: '입력 칸에 쓰다 만 글이 있어 잠시 비키고 지시만 제출했지만 되돌리지 못했다. 그 글은 보드 기록(delivery_draft)에 있다. 사용자에게 알린다.',
};
// P126: 받는 쪽 입력 칸에 다른 글이 남아 보낸 글이 제출되지 않았다(판은 사람의 글일 수 있어 지우지 않는다)
const boxOther = (n, next, id) => `@${n}의 입력 칸에 다른 글이 남아 있어 보낸 글이 제출되지 않았다${id ? `(${id})` : ''}. 보드가 그 글을 지우지 않는다. 사용자에게 "보드에서 @${n}의 입력 칸을 확인하고 Enter를 눌러 주세요"라고 알린다. 화면 보기: ${next.read}`;
function printDelivery(x) {
  const d = x.delivery || {};
  const id = `전달 ${x.deliveryId}`;
  if (x.woke) say(`@${x.name}는 잠들어 있어 보드가 깨웠다(같은 대화로 이어 간다).`);
  if (d.how === 'typed' && ['confirmed', 'sent', 'sending'].includes(d.status)) say(`@${x.name}는 일하는 중이라 Claude Code의 대기 메시지로 바로 넣었다(지금 턴 안에서 읽는다, ${d.status === 'confirmed' ? '들어감' : '들어갔는지 확인하는 중'}, ${id}).${DRAFT_NOTE[d.reason] ? ` ${DRAFT_NOTE[d.reason]}` : ''}`); // P143: --now
  else if (d.status === 'confirmed') say(`@${x.name}에게 보냈다(들어감, ${id}).${DRAFT_NOTE[d.reason] ? ` ${DRAFT_NOTE[d.reason]}` : ''}`);
  else if (d.status === 'sent' || d.status === 'sending') say(`@${x.name}에게 넣었다(들어갔는지 확인하는 중, ${id}).`);
  else if (d.status === 'queued') say(`${(REASON[d.reason] || ((n) => `아직 넣지 못했다(${d.reason || '대기'}). 보드가 다시 넣는다`))(x.name)} (${id}).${d.how === 'queue' && d.reason === 'working' ? ` --${flags.steer ? 'steer' : 'now'}로 바로 넣지 못했다(판이 띄운 Claude Code가 아니거나 입력 칸을 읽지 못했다). 판 대기열에 두었다.` : ''}`);
  else if (d.status === 'unconfirmed' && d.reason === 'input_box_other') fail(boxOther(x.name, x.next, id));
  else if (d.status === 'unconfirmed') say(`@${x.name}에게 넣었지만 들어갔는지 확인하지 못했다(${id}). 화면 보기: ${x.next.read}`);
  else if (d.status === 'failed' || d.status === 'cancelled') fail(`@${x.name}에게 보낸 글이 들어가지 않았다(${d.status}${d.reason ? `: ${d.reason}` : ''}, ${id}).`);
}
function printAnswer(x, a, label = '마지막 답') {
  if (!a || !a.text) return say(`  (${label} 없음. 화면 보기: ${x.next.read})`);
  say(`--- @${x.name}의 ${label}(${a.source === 'hook' ? 'Claude Code가 준 답' : '보드가 화면에서 고른 답'}${a.clipped ? ', 앞부분만' : ''}) ---`);
  say(a.text.replace(/\s+$/, ''));
  say('---');
}
function printTurn(x, t) {
  const n = x.name;
  // P180: done 값. 기다림이 받았으면 그것이 보고다. 이미 전한 값이면 그렇다고 적는다
  if (t.unit && t.unit.result) {
    if (t.unit.alreadyDelivered) say(`@${n}가 마지막으로 닫은 일 ${t.unit.id}: ${t.unit.result}(이미 전함. 앞서 받은 보고와 같다).`);
    else { say(`@${n}가 일 ${t.unit.id}을 닫았다: ${t.unit.result}(${secs(t.ms)} 기다림).`); say(`--- @${n}의 보고(atrium done) ---`); say(String(t.unit.text || '').replace(/\s+$/, '')); for (const l of t.unit.records || []) say(l); say('---'); } // P334: 기록 줄
    if (t.status === 'done' && !t.unit.alreadyDelivered) return;
  }
  switch (t.status) {
    case 'done': say(`@${n}: 턴이 끝났다(${secs(t.ms)} 기다림).`); printAnswer(x, t.answer); break;
    case 'error': say(`@${n}: 턴이 오류로 끝났다${t.error ? `(${t.error.type}: ${t.error.message || ''})` : ''}.`); printAnswer(x, t.answer); break;
    case 'idle': say(`@${n}: 지금 일하지 않는다(기다릴 턴 없음, 상태 ${t.state}).`); printAnswer(x, t.answer); break;
    case 'sleeping': say(`@${n}: 잠들어 있다(기다릴 턴 없음). 시키면 보드가 깨운 뒤 넣는다.`); printAnswer(x, t.answer); break;
    case 'waiting': say(`@${n}: 사람의 답을 기다린다${t.ask && t.ask.summary ? `(${t.ask.summary})` : ''}. 대신 답하지 않는다. 사용자에게 "보드에서 @${n}에 답해 주세요"라고 알린다. 답한 뒤 다시 기다리기: ${t.next.wait}`); break;
    case 'timeout': say(`@${n}: 아직 일하는 중이다(${secs(t.ms)} 기다림, 상태 ${t.state}). 일은 계속된다. 다시 기다리기: ${t.next.wait}`); break;
    case 'unconfirmed':
      if (t.delivery && t.delivery.reason === 'input_box_other') fail(boxOther(n, t.next, t.delivery.deliveryId ? `전달 ${t.delivery.deliveryId}` : ''));
      say(`@${n}: 넣은 글이 들어갔는지 확인하지 못했다. 화면 보기: ${t.next.read}`); printAnswer(x, t.answer); break;
    case 'failed': fail(`@${n}에게 보낸 글이 들어가지 않았다${t.delivery ? `(${t.delivery.status}${t.delivery.reason ? `: ${t.delivery.reason}` : ''})` : ''}.`); break;
    default: fail(`@${n}: ${t.status}(상태 ${t.state}). 받는 세션이 떠 있지 않다. 지금 연결: atrium me`);
  }
}
function printRead(x) {
  if (x.text != null) { say(`@${x.name} (${x.kind}, ${x.state}) 화면 최근 ${x.lines}줄:`); say(x.text); return; }
  say(`@${x.name} (${x.kind}, ${x.state}): ${x.why === 'sleeping' ? '잠들어 있어 화면이 없다' : `화면을 읽지 못했다(${x.why})`}.`);
  printAnswer(x, x.answer);
}

// P304: atrium plan(리포별 목표·마일스톤). 인자는 따로 푼다(--done·--rm 같은 낱말이 다른 동사와 뜻이 다르다)
async function planVerb() {
  let req;
  try { req = parsePlanArgs(argv.slice(argv.indexOf('plan') + 1)); } catch (e) { if (e.usage) fail(e.message, 2); throw e; }
  if (req.action === 'help') return say(PLAN_HELP);
  const body = { action: req.action, ...(req.plan !== undefined ? { plan: req.plan } : {}) };
  if (req.action === 'show' || req.action === 'list') body.all = req.all;
  if (req.action === 'new') body.name = req.name;
  if (req.action === 'owner') body.owner = req.owner;
  if (req.action === 'status') body.status = req.status;
  if (req.action === 'op') body.ops = req.ops;
  if (req.action === 'export') body.format = req.format;
  if (req.action === 'log') body.lines = req.lines;
  if (req.action === 'import') {
    let text;
    try { text = req.file === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(path.resolve(req.file), 'utf8'); } catch (e) { fail(`가져올 파일을 읽지 못했다: ${req.file} (${e.code || e.message})`, 2); }
    Object.assign(body, { doc: text, replace: req.replace, dry: req.dry, ...(req.new !== undefined ? { new: req.new } : {}), ...(req.ifRev != null && !Number.isNaN(req.ifRev) ? { ifRev: req.ifRev } : {}) });
  }
  const r = await call('plan', body, 30000);
  { const want = terminalSessionVar(); if (r.board && want && r.board.terminalSession !== want) fail(`다른 보드에서 응답했습니다 (${r.board.terminalSession}, 기대 ${want})`); }
  if (req.json && !(req.action === 'export' && r.result)) { say(JSON.stringify(r.result ?? { error: r.error }, null, 2)); if (r.error) process.exit(1); return; } // export --json은 문서 그대로(import와 같은 꼴)
  if (r.error) {
    const e = r.error;
    if (e.problems && e.problems.length) { process.stderr.write(`atrium plan: ${e.message}\n`); for (const p of e.problems) process.stderr.write(`  - ${p}\n`); process.exit(1); }
    process.stderr.write(`atrium plan: ${e.message} (${e.code})\n`); process.exit(1);
  }
  const x = r.result;
  if (req.action === 'show') return showLines(x).forEach((l) => say(l));
  if (req.action === 'list') return listLines(x).forEach((l) => say(l));
  if (req.action === 'export') return say(x.format === 'md' ? x.text.replace(/\n$/, '') : JSON.stringify(x.doc, null, 2));
  if (req.action === 'log') return logLines(x).forEach((l) => say(l));
  if (req.action === 'import') return importLines(x).forEach((l) => say(l));
  return writeLines(x, req).forEach((l) => say(l));
}

// P81: atrium me. 보통 20줄 안. 하위 세션이 많으면 10개까지 보이고 나머지는 atrium children으로
function ago(at, now) {
  if (!at) return '';
  const s = Math.max(0, Math.round((now - at) / 1000));
  return s < 60 ? `${s}초 전` : s < 3600 ? `${Math.round(s / 60)}분 전` : s < 86400 ? `${Math.round(s / 3600)}시간 전` : `${Math.round(s / 86400)}일 전`;
}
const kindOf = (c) => (c && c.kind ? `${c.kind}, ` : ''); // P263: 상대의 종류(옛 연결 알림이 주던 것)
function printMe(x) {
  const last = (l) => (l ? ` · 마지막 지시 ${ago(l.at, x.at)}${l.text ? ` "${l.text}"` : ''}` : '');
  const m = x.me;
  // P116: 이름은 보드의 세션 이름(atrium prompt|wait|read가 받는다). 에이전트 주소·패널은 보이지 않는다(--json에는 남는다)
  const me2 = (c) => `${c.model ? ` · 모델 ${c.model}` : ''}${c.effort ? ` · 노력 ${c.effort}` : ''}`; // P299
  say(`나: @${m.name} (${m.kind})${me2(m)} · 워크스페이스 ${m.workspace || '-'}${m.worktree ? ` · 워크트리 ${m.worktree}` : ''}${m.branch ? ` · 브랜치 ${m.branch}` : ''}`);
  if (x.permissions && x.permissions.allowed) { // P296: 자체 오케스트레이션 세션(하위면 허용 동사가 줄어든다)
    const pv = x.permissions;
    say(`권한: 자체 오케스트레이션 세션${pv.scope === 'sub' ? `, @${pv.parent || '?'}의 하위라 부모하고만 말한다(atrium prompt는 부모에게만)` : '(child·child-kill·child-wait·relate 없음)'}. 쓸 수 있는 명령: ${pv.allowed.map((v) => `atrium ${v}`).join(', ')}${pv.reportFallback === 'last_answer' ? '. 보고를 못 하면 보드가 턴 끝 마지막 답으로 일을 닫는다' : ''}`);
  }
  const p = x.parent;
  const src = (s) => (s === 'user' ? ' · 사람이 정함' : s === 'agent' ? ' · 에이전트가 정함' : '');
  // P156: 상위(너를 하위로 둔 세션)·동료·하위·독립. 끝나면 상위에게 보고, 동료와는 공유
  if (!p) say('상위: 없음');
  else if (p.closed) say(`상위: @${p.name} (${p.kind ? `${p.kind}, ` : ''}닫힘)${p.role ? ` — 너는 @${p.name}의 ${p.role}${p.order ? ` ${p.order}` : ''}` : ''}`);
  else say(`상위: @${p.name} (${kindOf(p)}${p.state})${p.role ? ` — 너는 @${p.name}의 ${p.role}${p.order ? ` ${p.order}` : ''}` : ''}${src(p.source)}${p.head ? '. 너는 헤드로 떴다. 첫 요청 뒤 보드가 부모 관계를 뗀다' : ''}. 끝나면 @${p.name}에게 보고한다${last(p.last)}`);
  const peers = x.peers || [], indep = x.independent || [];
  if (peers.length) { say(`동료 ${peers.length}명(하위가 아니다. ${PEER_RULE_SHORT}):`); for (const c of peers.slice(0, 10)) say(`  @${c.name} · ${kindOf(c)}${c.state}${c.spawnedBy ? ' · 너를 띄운 세션' : c.spawned ? ' · 네가 띄움' : ''}${src(c.source)}${last(c.last)}`); }
  if (!x.children.length) say('하위 세션: 없음');
  else {
    say(`하위 세션 ${x.children.length}개:`);
    for (const c of x.children.slice(0, 10)) say(`  @${c.name} ${c.role || '-'}${c.order ? ` ${c.order}` : ''} · ${kindOf(c)}${c.state}${c.state === 'sleeping' ? '(atrium prompt하면 보드가 깨운다)' : ''}${c.worktree ? ` · 워크트리 ${c.worktree}` : ''}${last(c.last)}${me2(c)}`);
    if (x.children.length > 10) say(`  …외 ${x.children.length - 10}개(atrium children)`);
  }
  if (indep.length) say(`독립(서로 보고하거나 맡기지 않는다): ${indep.slice(0, 10).map((c) => `@${c.name} ${kindOf(c)}${c.state}${c.spawnedBy ? '(너를 띄운 세션)' : c.spawned ? '(네가 띄움)' : ''}`).join(', ')}`);
  if (x.roles.length) {
    say('역할 연결(사람이 "<역할>에게 맡겨"라고 하면 그 세션에 atrium prompt. 판에서 잇거나 끊을 때 알림은 오지 않는다):'); // P263
    for (const r of x.roles.slice(0, 8)) say(`  ${r.dir === 'out' ? `너의 ${r.role}은 @${r.name}` : `너는 @${r.name}의 ${r.role}`} (${kindOf(r)}${r.state})${last(r.last)}`);
  }
  for (const l of planMeLines(x.plans)) say(l); // P304: 내가 관리하는 레인
  if (x.news) say(`동료 소식: ${x.news.by.map((c) => `@${c.name} ${c.n}개`).join(', ')} 새로 → atrium news`); // P204: 읽지 않은 것이 있을 때만
  say(`일 맡기기: atrium prompt <이름> "<할 일>"(맡기고 턴을 끝내면 보드가 done 보고를 가져다준다) · 화면 읽기: ${x.commands.read}`); // P181
  say('이것이 보드의 지금 기록이다. 예전 알림과 다르면 이것을 믿는다.');
}
// P156: atrium relate
const REL_WORD = { sub: '하위', peer: '동료', none: '독립', auto: '자동' };
function printRelate(x) {
  const e = x.effective || {};
  const now = e.relation === 'sub' ? (e.up === x.a ? `@${x.b}는 너의 하위 워커다` : `너는 @${x.b}의 하위 워커다`) : e.relation === 'peer' ? `@${x.b}와 너는 동료다` : `@${x.b}와 너는 독립이다`;
  say(`관계를 바꿨다: ${x.before ? `${REL_WORD[x.before.relation]}(${x.before.source === 'auto' ? '자동' : x.before.source === 'user' ? '사람' : '에이전트'})` : '없음'} → ${REL_WORD[x.relation]}. 지금: ${now}${x.relation === 'auto' ? '(자동)' : ''}.`);
  say(`보드가 @${x.b}에게 짧게 알린다. 지금 연결: atrium me`);
}
// P41: atrium models
function printModels(x) {
  const by = (src) => x.entries.filter((e) => e.source === src);
  say(`띄울 수 있는 것(이 목록의 명령을 그대로 친다. <이름>은 워커 이름). 너(@${x.parent.name})의 모델: ${x.parent.model || '(기본)'}${x.parent.gateway ? `, 게이트웨이 ${x.parent.gateway}` : ''}`);
  say('');
  say('런처 (왼쪽 도구 모음과 동일):');
  for (const e of by('launcher')) say(`  ${e.text}
    ${e.command}`);
  say('');
  say('에이전트별 모델과 별칭:');
  for (const e of by('harness')) say(`  ${e.text}
    ${e.command}`);
  for (const g of x.gateways) {
    say('');
    const label = `연결 ${g.connection || g.url}(${g.url}${g.protocol ? `, ${g.protocol}` : ''})`; // P115: 연결마다
    if (!g.ok) { say(`${label}${g.host ? `, 런처 ${g.host}` : ''}: 닿지 않는다(${g.why}). 그 모델은 지금 띄우지 못한다`); continue; }
    const list = x.entries.filter((e) => e.source === 'gateway' && e.gateway === g.url && (e.connection || null) === (g.connection || null));
    say(`${label}의 모델 ${list.length}개${g.host ? `(런처 ${g.host}로 띄운다)` : ''}:`);
    for (const e of list) say(`  ${e.label || e.model}
    ${e.command}`);
  }
  for (const f of x.freeModels || []) { // P299: 모델 목록을 판이 모르는 하네스(Hermes)
    if (f.kind === 'omo') { say(`  ${f.label}: 위 목록(Codex 구독 chatgpt-subscription/…) 밖의 모델도 이름(제공자/모델)을 그대로 준다(--model). 노력 ${f.efforts.join(', ')}(--thinking으로 넘긴다)
    ${f.command}`); continue; } // P329
    say(`  ${f.label}: 모델 목록은 보드가 모른다. 모델 이름을 그대로 준다(-m)${f.efforts.length ? `. 노력 ${f.efforts.join(', ')}(준비되면 보드가 /reasoning으로 넣는다)` : ''}
    ${f.command}`);
  }
  if (x.contracts && x.contracts.length) { // P330: 하네스 계약(보드가 --model·--effort를 그 하네스에 넘기는 길. 받지 않는 값은 빼고 응답에 한 줄)
    say('');
    say('에이전트별로 --model·--effort가 넘어가는 길(atrium child --kind <종류> --model <이름> --effort <값>):');
    for (const c of x.contracts) say(`  ${c.text}`);
  }
  say('');
  say('사용자가 모델을 말로 하면(예: "glm flash") --model에 그 말을 그대로 줘도 보드가 이 목록에서 푼다. 여럿이 맞으면 보드가 후보를 돌려준다.');
}
main().catch((e) => fail(e.message));
