// P115: 판이 띄운 세션의 atrium 명령 계약(atrium help --json). 동사, 인자, 출력 모양, 종료 코드, 계약 버전.
// 하네스마다 스킬·hook을 맞추지 않고, 모델은 `atrium help` 하나로 쓸 수 있어야 한다(이슈 #11 4.1 1층). 동사와 출력은 P8~P81 그대로다.
// 버전: 동사·인자·출력 모양을 바꾸거나 빼면 올린다. 더하기만 하면 그대로 둔다.
export const CONTRACT_VERSION = 1;

// out: --json일 때 result의 주요 칸. 사람이 읽는 출력(--json 없음)은 같은 내용의 글이다
export const VERBS = [
  { name: 'help', args: ['[--json]'], does: '이 사용법. --json은 이 계약(동사, 인자, 출력, 종료 코드, 버전)', out: ['contract', 'verbs', 'exit'] },
  { name: 'me', args: ['[--json]'], does: '너의 지금 연결(부모, 하위 세션, 역할 연결, 연결마다 마지막 지시). 보드의 지금 기록', out: ['name', 'parent', 'children', 'links'] },
  { name: 'child', args: ['[이름]', '[--prompt "첫 요청"]', '[--role 역할]', '[--cwd 폴더]', '[--worktree 이름]', '[--model 모델]', '[--launcher 런처]', '[--effort 수준]', '[--kind 종류]', '[--head]', '[--no-wait]', '[--json]'], does: '하위 세션(워커)을 만들고 준비될 때까지 기다린다. 응답에 herdr 이름과 다음에 칠 명령', out: ['name', 'agentName', 'paneId', 'kind', 'role', 'depth', 'state', 'status', 'next'] },
  { name: 'children', args: ['[--all]', '[--json]'], does: '너의 하위 세션(--all이면 그 아래까지) 상태와 마지막 응답', out: ['children'] },
  { name: 'child-kill', args: ['<이름>', '[--only]', '[--json]'], does: '너의 하위 세션을 끈다(그 아래도 함께, --only면 그것만). 사람이 끄라고 할 때만', out: ['killed'] },
  { name: 'child-wait', args: ['<이름>', '[--json]'], does: '그 하위 세션이 지시를 받을 수 있게 될 때까지 기다린다(한 번에 100초)', out: ['name', 'state', 'timeout', 'next'] },
  { name: 'wake', args: ['<이름>', '[--json]'], does: '잠든 세션을 깨운다(같은 대화로 이어 간다)', out: ['name', 'woke', 'state', 'next'] },
  { name: 'models', args: ['[--json]'], does: '띄울 수 있는 런처·모델과 각각을 띄우는 atrium child 명령', out: ['entries', 'gateways', 'parent'] },
];
// 종료 코드: 0 성공, 1 보드가 거절하거나 실패(이유는 stderr와 --json의 error), 2 명령을 잘못 씀
export const EXIT = { ok: 0, refused: 1, usage: 2 };
export const VERB_NAMES = VERBS.map((v) => v.name).filter((n) => n !== 'help');

// 모델이 읽는 짧은 사용법(동사마다 한 줄)
export function shortHelp() {
  return [
    `atrium(계약 ${CONTRACT_VERSION}): 보드가 띄운 세션이 보드와 말하는 명령. 옛 이름 mtask도 같다.`,
    ...VERBS.map((v) => `  atrium ${v.name}${v.args.length ? ' ' + v.args.join(' ') : ''}\n      ${v.does}`),
    '일 시키기·답 받기는 herdr 명령으로: herdr agent prompt <이름> "<할 일>" --wait --timeout 600000, herdr agent read <이름> --source recent-unwrapped --lines 80',
    '종료 코드: 0 성공, 1 보드가 거절·실패, 2 명령을 잘못 씀. 기계용 계약: atrium help --json. 자세한 설명: atrium help --long',
  ].join('\n');
}
export const contractJson = () => ({ contract: CONTRACT_VERSION, verbs: VERBS, exit: EXIT });
