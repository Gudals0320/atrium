// P115: 하네스 어댑터 표. 판이 띄우는 Claude Code 밖의 에이전트 하네스(codex, opencode, pi, 터미널이 아는 그 밖의 종류)를
// 판과 말하게(env, PATH의 atrium, 안내문) 띄우고, 이어 가기·되살리기에서 같은 값으로 돌아오게 한다.
// 모양은 터미널 백엔드와 상관없다: 판은 { command, args, env, pathFirst, files }를 만들고, 터미널 백엔드가 env와 PATH를 준다
// (herdr-core: terminal.run의 env. 실험은 docs/log/p115-harness-common.md 1단계).
// Claude Code는 이 표를 쓰지 않는다. 세션 설정 파일(--settings)·플러그인·hook 길(launch.mjs)이 그대로다.
// 이어 갈 때 다시 줄 것(mustRePass)은 실험에서 빠지면 무엇이 깨지는지 본 목록이다. 판은 이어 가기·되살리기마다 처음과 같은 값을 다시 준다.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { codexHomeOf } from './codex-models.mjs';
import { REVIVE_RULE_SHORT, KNOW_RULE_PLAIN, KNOW_HINT_RULE } from './cli-contract.mjs'; // P360. P364: KNOW_RULE_PLAIN. P368: KNOW_HINT_RULE
import { dshLaunchFiles } from './dsh.mjs';

// 하네스와 상관없는 안내문(한 줄). 줄바꿈·큰따옴표 없이: Codex는 -c 값으로 받고, 판은 이것을 패널에 한 줄로 친다
// P116: 일 시키기·기다리기·읽기는 판의 atrium 명령이다(터미널 백엔드와 상관없다). 터미널 명령을 직접 쓰라고 하지 않는다
export const HARNESS_PROMPT = [
  '너는 Atrium 보드가 띄운 세션 안에서 돈다.',
  '보드와 말할 때는 셸에서 atrium 명령을 쓴다. 자세한 사용법이 필요할 때만 `atrium help`를 본다(기계용 계약은 `atrium help --json`).', // P169: 시작하자마자 help를 치지 않게(맥락 약 2,700토큰)
  '일을 맡길 때는 `atrium prompt <이름> <따옴표로 묶은 할 일>`로 맡기고 턴을 끝낸다. 하위가 `atrium done`으로 닫으면 보드가 그 보고를 가져다주고 보고 없이 멈추면 알린다. 화면은 `atrium read <이름>`(이름은 보드의 세션 이름). 다른 에이전트에게는 이 명령으로만 보낸다. 맡은 일은 끝나면 `atrium done ok|failed <보고>`로 닫고 쉰다. 조사·감사·제안·인계 결과는 커밋하지 않고 `--record <파일>`로 done에 붙인다(문서는 지금 상태만, 날짜별 결정 로그 없음). 사람이 결과를 물어도 폴링하지 말고 보고가 오면 전한다(--wait·`atrium wait`는 꼭 필요할 때만).', // P143, P181: 맡기고 턴을 끝낸다
  '계속 대화할 하위 일은 `atrium child`, 결과만 받을 일은 하네스 서브에이전트, 연결 기록은 `atrium me`, 모델은 `atrium models`.', // P318: 세션·서브에이전트 나눔
  '[Atrium 보드]로 시작하는 글은 보드 알림이다. 잇거나 끊은 역할 연결은 알리지 않는다(`atrium me`).', // P263: 연결 알림을 넣지 않는다
  KNOW_RULE_PLAIN, // P364: 작업 지식 찾기(줄바꿈·큰따옴표 없음)
  KNOW_HINT_RULE, // P368: 맡기기 전 know로 힌트 찾기(줄바꿈·큰따옴표 없음)
  REVIVE_RULE_SHORT, // P360: 되살리기·갈라 열기(사람이 시킬 때만, 줄바꿈·큰따옴표 없음)
  '사람에게 답을 받아야 하는 질문(결정)으로 턴을 끝낼 때는 글로 묻고 그 질문을 `atrium ask <따옴표로 묶은 질문>`로 남긴다(보기가 있으면 `--option <보기>`. 권한·하네스 질문은 아니다. 하위 워커는 부모에게 묻는다. 사람에게 넘기는 일·명령·확인·미룬 일은 `atrium todo`로. 기다리지 않는 질문·확인은 `--no-wait`).', // P284: 결정 카드(줄바꿈·큰따옴표 없이). P286: 턴을 끝낼 때마다로 더 분명하게. P292: 사용자 몫(atrium todo) 몇 낱말. P295: --no-wait 몇 낱말
].join(' ');

// P299: Hermes 노력 수준(값은 hermes --help의 --reasoning LEVEL). 판의 노력 값(low·medium·high·xhigh·max)은 이름이 같고,
//   흔한 다른 이름(off, min, x-high 등)은 맞춰 바꾼다. 받지 않는 값은 null(빼고 판 로그에 한 줄은 부르는 쪽이 쓴다).
//   hermes --tui는 --reasoning을 받지 않는다(Hermes 0.23.3: "Unsupported --tui options: --reasoning", 종료 코드 2, 세션을 만들지 않음).
//   그래서 판은 인자로 넘기지 않고, TUI가 준비되면 입력 칸에 /reasoning <값>(그 세션만, --global이 아니면 config.yaml을 쓰지 않는다)을 한 번 넣는다.
//   값은 Hermes 세션 기록(model_config)에 남아 --resume 때 되살아나지만, 판은 이어 갈 때도 다시 넣는다(같은 값이라 해가 없다)
export const HERMES_EFFORTS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'];
const HERMES_EFFORT_ALIASES = { off: 'none', min: 'minimal', 'x-high': 'xhigh', 'extra-high': 'xhigh', extra_high: 'xhigh', x_high: 'xhigh' };
export function hermesEffortOf(e) {
  const v = String(e || '').trim().toLowerCase();
  if (!v) return null;
  const m = HERMES_EFFORT_ALIASES[v] || v;
  return HERMES_EFFORTS.includes(m) ? m : null;
}
// 인자에 든 --reasoning 값(--reasoning X, --reasoning=X). 없으면 null
export function reasoningIn(args = []) {
  const a = (args || []).map(String);
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--reasoning') return a[i + 1] != null ? a[i + 1] : '';
    if (a[i].startsWith('--reasoning=')) return a[i].slice('--reasoning='.length);
  }
  return null;
}
// 인자에서 --reasoning(값 포함)을 뺀다(--tui가 받지 않아 넘기면 Hermes가 뜨지 않는다)
export function withoutReasoning(args = []) {
  const a = (args || []).map(String), out = [];
  for (let i = 0; i < a.length; i++) { if (a[i] === '--reasoning') { i++; continue; } if (a[i].startsWith('--reasoning=')) continue; out.push(a[i]); }
  return out;
}
// 띄운 뒤 넣을 노력 수준. 호출자 추가 인자에 --reasoning이 있으면 그 값을 따른다(판 값보다 먼저). 받지 않는 값이면 null
export function hermesReasoningOf(effort, launcherArgs = []) {
  const own = reasoningIn(launcherArgs);
  return hermesEffortOf(own != null ? own : effort);
}
// 그 노력 수준을 TUI에 넣을 글(입력 칸에 치고 Enter)
export const hermesReasoningInput = (e) => (e ? `/reasoning ${e}` : null);

// P329: omo(OmO, oh-my-openagent의 senpi(pi 계열) 엔진 실행 파일) 생각 수준. omo --thinking 값(off, minimal, low, medium, high, xhigh, max).
//   판의 노력 값(low·medium·high·xhigh·max)은 이름이 같고, none은 off로 바꾼다. 받지 않는 값은 null(빼고 판 로그에 한 줄은 부르는 쪽이 쓴다)
export const OMO_EFFORTS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
const OMO_EFFORT_ALIASES = { none: 'off', min: 'minimal', 'x-high': 'xhigh', 'extra-high': 'xhigh', extra_high: 'xhigh', x_high: 'xhigh' };
export function omoEffortOf(e) {
  const v = String(e || '').trim().toLowerCase();
  if (!v) return null;
  const m = OMO_EFFORT_ALIASES[v] || v;
  return OMO_EFFORTS.includes(m) ? m : null;
}
// 인자에 든 --thinking 값(--thinking X, --thinking=X). 없으면 null
export function thinkingIn(args = []) {
  const a = (args || []).map(String);
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--thinking') return a[i + 1] != null ? a[i + 1] : '';
    if (a[i].startsWith('--thinking=')) return a[i].slice('--thinking='.length);
  }
  return null;
}
// P329: pi 계열(세션 파일 꼴·마지막 답·모델 기록이 같은 종류). 세션 폴더만 다르다(pi ~/.pi/agent/sessions, omo ~/.omo/agent/sessions)
export const PI_FAMILY = new Set(['pi', 'omo']);
export const piLike = (kind) => PI_FAMILY.has(String(kind || ''));

const hexOf = (id) => String(id || '').toLowerCase().replace(/[^0-9a-f]/g, '');
// 하네스 어댑터. build(ctx) → { args(명령 낱말 뒤), env, files: [{ file, text }], harnessSessionId, resumed }
// ctx: { sessionId(판 세션 ID), resume, harnessSessionId(알면), model, launcherArgs, instructions: { file, text }, filesDir }
// P255: 모델 연결(P115)은 걷어 냈다. 하네스는 자기 로그인·설정으로 돈다
// reserved: 판이 정하므로 호출자 추가 인자·실행 명령에 두지 못하는 것. sessionIdFrom: board(판이 정한 ID로 만들고 이어 간다) | learned(뜬 뒤에 안다)
export const ADAPTERS = {
  codex: {
    command: 'codex',
    sessionIdFrom: 'learned', // 터미널이 아는 agent_session 또는 Codex rollout 파일(codexSessionOf)
    mustRePass: ['instructions'], // 지시문은 rollout에 남지만 다시 준다(실험 E2·E3)
    reserved: { flags: ['resume', 'fork'], configKeys: ['developer_instructions', 'check_for_update_on_startup', 'model_provider', 'model_providers'] },
    modelArgs: (m) => ['-m', m],
    build(ctx) {
      const resumed = !!(ctx.resume && ctx.harnessSessionId);
      const fork = !resumed && ctx.forkFrom ? ctx.forkFrom : null; // P133: Codex 앱 대화를 갈라 연다(원본은 그대로, 새 대화 ID는 뜬 뒤에 안다)
      // 시작할 때 업데이트 확인을 끈다(새 버전이 있으면 "Update now" 선택 창이 떠서 판의 첫 요청과 Enter가 그 창에 들어간다. 1단계 뒤 확인)
      const args = [...(resumed ? ['resume', ctx.harnessSessionId] : fork ? ['fork', fork] : []), '-c', 'check_for_update_on_startup=false', ...(ctx.model ? ['-m', ctx.model] : []), ...(ctx.instructions ? ['-c', `developer_instructions=${ctx.instructions.text}`] : []), ...(ctx.launcherArgs || []), ...(resumed && ctx.effort ? ['-c', `model_reasoning_effort=${ctx.effort}`] : [])]; // P227: 이어 갈 때 지금 노력 수준(호출자 인자 뒤: 뒤의 -c가 이긴다)
      return { args, env: {}, files: [], harnessSessionId: resumed ? ctx.harnessSessionId : null, resumed };
    },
    // 판의 인자 없이 뜬 이어 가기(`codex resume <id>`, 옛 터미널이 스스로 띄움)인가. 판이 친 줄인가
    isBoardLine: (argv) => argv.some((a) => String(a).startsWith('developer_instructions=')),
  },
  opencode: {
    command: 'opencode',
    sessionIdFrom: 'board', // -s <id>는 없으면 그 ID로 만든다(1단계 뒤 확인)
    mustRePass: ['instructions'], // 지시문은 세션에 저장되지만 다시 준다. 설정은 env(OPENCODE_CONFIG_CONTENT)로만 들어간다
    reserved: { flags: ['--standalone', '--server', '-s', '--session', '-c', '--continue', '--fork', '--prompt'] },
    modelArgs: () => [], // 대화형에는 --model이 없다. 설정(OPENCODE_CONFIG_CONTENT)의 model로 준다
    build(ctx) {
      const sid = `ses_${hexOf(ctx.sessionId)}`;
      const model = ctx.model || null;
      const config = { ...(ctx.instructions ? { instructions: [ctx.instructions.file] } : {}), ...(model ? { model } : {}) };
      // 판이 띄우는 opencode는 늘 --standalone(세션마다 설정과 env. 사용자의 공유 서버는 쓰지 않는다)
      return { args: ['--standalone', '-s', sid, ...(ctx.launcherArgs || [])], env: Object.keys(config).length ? { OPENCODE_CONFIG_CONTENT: JSON.stringify(config) } : {}, files: [], harnessSessionId: sid, resumed: !!ctx.resume };
    },
    isBoardLine: (argv) => argv.includes('--standalone'),
  },
  pi: {
    command: 'pi',
    sessionIdFrom: 'board', // --session-id <id>는 이 폴더에 그 ID가 있으면 이어 가고 없으면 만든다(1단계 뒤 확인)
    mustRePass: ['instructions'], // 이어 갈 때 --append-system-prompt를 빼면 안내문이 빠진다(실험 E2)
    reserved: { flags: ['--session', '--session-id', '-c', '--continue', '-r', '--resume', '--fork', '--no-session', '--session-dir', '-p', '--print', '--mode', '--provider'] },
    modelArgs: (m) => ['--model', m],
    build(ctx) {
      const sid = ctx.sessionId;
      const model = ctx.model || null;
      const args = ['--session-id', sid, ...(model ? ['--model', model] : []), ...(ctx.instructions ? ['--append-system-prompt', ctx.instructions.file] : []), ...(ctx.launcherArgs || [])];
      return { args, env: {}, files: [], harnessSessionId: sid, resumed: !!ctx.resume };
    },
    isBoardLine: (argv) => argv.includes('--session-id'),
  },
  // P329: omo(OmO 5.1.x, 엔진 senpi = pi 계열). 명령줄은 pi와 같다: --session-id <id>(이 폴더에 그 ID가 있으면 이어 가고 없으면 만든다),
  //   --model <제공자/ID>(Codex 구독은 chatgpt-subscription/<모델>), --thinking <수준>, --append-system-prompt <글|파일>.
  //   세션 파일은 ~/.omo/agent/sessions/<폴더>/<시각>_<id>.jsonl(pi와 같은 꼴), 상태는 omo가 스스로 OSC 7501(앱 이름 omo)로 알린다.
  //   노력 수준(ctx.effort)은 --thinking으로 넘긴다(호출자 추가 인자에 --thinking이 있으면 그 값이 이긴다). 이어 갈 때도 다시 준다(세션 파일의 지금 값, resumeModel)
  omo: {
    command: 'omo',
    sessionIdFrom: 'board',
    mustRePass: ['instructions'], // pi와 같다: --append-system-prompt는 그 실행에만 든다
    reserved: { flags: ['--session', '--session-id', '-c', '--continue', '-r', '--resume', '--fork', '--rebind', '--spawned-by', '--no-session', '--session-dir', '-p', '--print', '--mode', '--provider', '--export', '--list-models', 'setup', 'doctor', 'update', 'daemon', 'thread', 'remote', 'login', 'logout', 'whoami', 'sync', 'account', 'install', 'remove', 'uninstall', 'list', 'config'] },
    modelArgs: (m) => ['--model', m],
    build(ctx) {
      const sid = ctx.sessionId;
      const thinking = thinkingIn(ctx.launcherArgs) == null ? omoEffortOf(ctx.effort) : null;
      const args = ['--session-id', sid, ...(ctx.model ? ['--model', ctx.model] : []), ...(thinking ? ['--thinking', thinking] : []), ...(ctx.instructions ? ['--append-system-prompt', ctx.instructions.file] : []), ...(ctx.launcherArgs || [])];
      return { args, env: {}, files: [], harnessSessionId: sid, resumed: !!ctx.resume };
    },
    isBoardLine: (argv) => argv.includes('--session-id'),
  },
  // P192: AGY(Antigravity CLI, 실행 파일 agy). 대화 ID는 뜬 뒤에 안다(agySessionOf), 이어 가기는 --conversation <ID>.
  // 안내문: --settings에는 지시문 키가 없다(1.5.9: 모르는 키는 "unknown setting"으로 거부). AGY는 작업 공간 폴더의 AGENTS.md를 규칙으로 읽으므로
  //   판 데이터 폴더에 안내문만 든 폴더(harness/agy/AGENTS.md)를 만들어 --add-dir로 더한다(사용자 폴더·~/.gemini 설정은 건드리지 않는다).
  //   --add-dir은 그 폴더를 AGY 작업 공간에 더한다(그 폴더에는 안내문 파일 하나뿐이다)
  // 노력 수준(--effort)과 승인 방식(--mode, --dangerously-skip-permissions)은 호출자 칸에서 추가 인자로 붙인다(launchers.mjs harnessOptionArgs, 계약 표 harness-contract.mjs)
  agy: {
    command: 'agy',
    sessionIdFrom: 'learned', // 대화 기록 폴더의 새 대화(agySessionOf)
    mustRePass: ['instructions'], // --add-dir은 그 세션에만 든다. 이어 갈 때도 다시 준다
    reserved: { flags: ['--conversation', '-c', '--continue', '-p', '--print', '--prompt', '-i', '--prompt-interactive', '--input-format', '--output-format', '--json-schema', '--print-timeout', '--remote-agent', '--new-project'] },
    modelArgs: (m, args = []) => ['--model', agyModelArg(m, args)], // P330: 노력 인자가 있으면 단계 없는 이름
    // atrium 명령과 승인(P192 개발용 판 시험, 1.5.9): AGY Auto 모드(이 PC 사용자 기본)는 명령을 터미널 샌드박스에서 먼저 돌리는데, 샌드박스는
    //   판 데이터 폴더의 bin/·sessions/와 127.0.0.1 연결을 막는다. 그래서 atrium은 샌드박스 밖에서만 되고, 그때 AGY가 사람에게 묻는다(판은 waiting,
    //   하위면 상위에 needs_human). accept-edits도 묻는다. 묻지 않고 되는 것은 --dangerously-skip-permissions(판의 dontAsk·bypassPermissions)뿐이다.
    //   --settings의 permissions.allow는 명령 글 전체가 같을 때만 먹어(command(mkdir)·command(mkdir *)·command(node -e)는 안 먹음) atrium 허용 목록으로 쓸 수 없다
    build(ctx) {
      const resumed = !!(ctx.resume && ctx.harnessSessionId);
      const files = [];
      let rules = [];
      if (ctx.instructions && ctx.filesDir) {
        const dir = path.join(ctx.filesDir, 'agy').split('\\').join('/');
        files.push({ file: `${dir}/AGENTS.md`, text: `${ctx.instructions.text}\n` });
        rules = ['--add-dir', dir];
      }
      const args = [...(resumed ? ['--conversation', ctx.harnessSessionId] : []), ...(ctx.model ? ['--model', agyModelArg(ctx.model, ctx.launcherArgs || [])] : []), ...rules, ...agySettingsArgs(ctx.launcherArgs || [], AGY_BOARD_SETTINGS, undefined, ctx.statusLine || null)]; // P203: 판 설정(대체 화면)과 사용자 --settings를 합친다. P211: 판의 상태 줄 명령
      return { args, env: {}, files, harnessSessionId: resumed ? ctx.harnessSessionId : null, resumed };
    },
    isBoardLine: (argv) => argv.some((a) => /[\\/]agy$/.test(String(a))),
  },
  // P270: dsh(DeepSeek Harness). 공식 dsh에는 터미널 대화 화면이 없어 커뮤니티 dsh-TUI(dsh-tui)로 띄운다. 상태는 dsh-TUI가 스스로 OSC 7501(앱 이름 dsh-tui)로 알린다.
  //   세션 ID는 dsh가 정해 뜬 뒤에 안다(dsh.mjs dshSessionOf), 이어 가기는 --resume <ID>(dsh-tui가 env DSH_TUI_RESUME_SESSION으로 넘긴다). 판의 것은 세션마다 쓴 덧씌움(--patch)으로 준다: 안내문(시스템 프롬프트 조각을 더하는 플러그인, dsh.mjs),
  //   session-log-deepseek 끄기(세션 기록을 DeepSeek에 올리지 않는다). dsh-tui는 앞에 둔 dsh 옵션(--patch)을 dsh에 그대로 넘긴다. 런치패드(첫 화면)는 끈다(DSH_TUI_NO_LAUNCHPAD=1: 첫 요청이 바로 대화로).
  //   모델·노력 수준은 dsh의 /model·/effort(~/.dsh-tui에 전역으로 남는다)가 정하고 판은 주지 않는다. 키는 dsh 자기 저장소(~/.dsh/.credentials.yaml)
  dsh: {
    command: 'dsh-tui',
    sessionIdFrom: 'learned',
    mustRePass: ['instructions'], // 덧씌움은 그 실행에만 든다. 이어 갈 때도 다시 준다
    reserved: { flags: ['--profile', '--patch', '--from-default-profile', '--resume', '-c', '--continue', '--backend', 'run', '-p', '--print', 'cli', 'dsh', 'update', 'migrate', 'safe'] },
    modelArgs: () => [],
    build(ctx) {
      const resumed = !!(ctx.resume && ctx.harnessSessionId);
      const l = ctx.filesDir ? dshLaunchFiles({ dir: path.join(ctx.filesDir, 'dsh'), sessionId: ctx.sessionId, prompt: ctx.instructions ? ctx.instructions.text : '' }) : null;
      const args = [...(l ? ['--patch', l.patch] : []), ...(resumed ? ['--resume', ctx.harnessSessionId] : []), ...(ctx.launcherArgs || [])];
      return { args, env: { DSH_TUI_NO_LAUNCHPAD: '1' }, files: l ? l.files : [], harnessSessionId: resumed ? ctx.harnessSessionId : null, resumed };
    },
    isBoardLine: (argv) => argv.some((a) => /[\\/]dsh[\\/][^\\/]+\.patch\.yml$/.test(String(a))),
  },
  // P298: Hermes(+OMH, 실행 파일 hermes). 대화 화면은 --tui(Ink)로 고정한다. 세션·도구·하위 에이전트는 프로필의 공용 gateway 데몬에서 돌아(P297)
  //   패널 env는 허용 목록(PATH, HERMES_EPHEMERAL_SYSTEM_PROMPT 등)만 도구까지 간다. 그래서 안내문은 env HERMES_EPHEMERAL_SYSTEM_PROMPT(저장되지 않고 API 호출 때만 들어간다,
  //   config의 개성·시스템 프롬프트를 대신한다)로, atrium은 세션별 감싸개(pathWrapper: PATH 맨 앞 폴더의 atrium이 판 env를 담아 부른다)로 준다.
  //   세션 ID는 뜬 뒤에 state.db에서 안다(hermes.mjs hermesSessionOf), 이어 가기는 --resume <ID>. 상태는 7501이 없어 화면 상태 줄(screen.mjs hermesStateOf)
  hermes: {
    command: 'hermes',
    sessionIdFrom: 'learned',
    mustRePass: ['instructions'], // env라 그 실행에만 든다. 이어 가기에도 다시 준다
    pathWrapper: true,
    // P309: --new·--onboard는 omh(감싼 호출자)의 것이다(판이 새로 띄울 때 --new를 붙인다)
    reserved: { flags: ['--resume', '-r', '--continue', '-c', '-z', '--oneshot', '--tui', '--cli', '--native', '--tui-native', '--in', '--no-restore-cwd', '--safe-mode', '--ignore-rules', '--new', '--onboard', 'chat', 'gateway', 'acp', 'sessions', 'setup', 'update', 'config', 'auth', 'plugins', 'usage'] },
    modelArgs: (m) => ['-m', m],
    build(ctx) {
      if (wrapperOf(ctx.startWords) === 'omh') return omhBuild(ctx); // P309: 실행 명령이 omh(OMH Native)
      const resumed = !!(ctx.resume && ctx.harnessSessionId);
      // P299: 노력 수준(ctx.effort, 호출자 추가 인자의 --reasoning이 이긴다)은 인자가 아니라 준비된 뒤 넣을 글(readyInput: /reasoning <값>)로. 이어 가기에도
      const reasoning = hermesReasoningOf(ctx.effort, ctx.launcherArgs);
      const args = ['--tui', ...(resumed ? ['--resume', ctx.harnessSessionId] : []), ...(ctx.model ? ['-m', ctx.model] : []), ...withoutReasoning(ctx.launcherArgs)];
      return { ...(reasoning ? { readyInput: hermesReasoningInput(reasoning), reasoning } : {}), args, env: ctx.instructions ? { HERMES_EPHEMERAL_SYSTEM_PROMPT: ctx.instructions.text } : {}, files: [], harnessSessionId: resumed ? ctx.harnessSessionId : null, resumed };
    },
    isBoardLine: (argv) => argv.includes('--tui') || argv.includes('--new'), // P309: omh는 --tui 대신 --new(이어 가기는 --resume)
  },
};

// P309: 감싼 호출자. 하네스 위에 자기 TUI를 얹은 명령(omh = Hermes + OMH 플러그인 + OMH Native TUI)을 판이 그 하네스 계열로 알아본다.
//   family: 어댑터(상태 읽기·마지막 답·이어 가기·안내문)를 고르는 종류, flavor: 카드에 보일 종류(lib/kinds.js), orchestrates: 종류 기본을 따른다
//   런처가 실행 명령으로 고르거나(하네스 hermes + 실행 명령 omh), 명령 한 줄 런처의 첫 낱말이 이것이거나, 셸에서 친 화면이 그 모양이면(P309 셸 안 TUI) 이 표를 본다
export const HARNESS_WRAPPERS = Object.freeze({ omh: Object.freeze({ family: 'hermes', flavor: 'omh', label: 'OMH' }) });
const exeBaseOf = (w) => String(w || '').replace(/^.*[\\/]/, '').replace(/\.(exe|cmd|ps1|bat)$/i, '').toLowerCase();
// 실행 명령 낱말(또는 한 줄 글) → 감싼 호출자 이름 | null
export function wrapperOf(words) {
  const first = Array.isArray(words) ? words[0] : String(words || '').trim().split(/\s+/)[0];
  const b = exeBaseOf(first);
  return b && HARNESS_WRAPPERS[b] ? b : null;
}
export const wrapperInfo = (words) => { const w = wrapperOf(words); return w ? { id: w, ...HARNESS_WRAPPERS[w] } : null; };
// P309: OMH Native를 띄울 값. omh는 bare 실행에 --tui·-m을 받지 않는다(argparse: setup 등 하위 명령과 -r/-c/-p/--new만).
//   새로 띄울 때 --new(그 터미널에서 끊긴 세션을 저절로 다시 여는 auto-resume을 막는다), 이어 갈 때 --resume <ID>(같은 Hermes 세션).
//   안내문은 Hermes와 같은 env HERMES_EPHEMERAL_SYSTEM_PROMPT(omh가 hermes --tui를 띄우고 Hermes 실행기가 허용 목록 env를 gateway 세션에 넘긴다),
//   모델은 env HERMES_MODEL(OMH gateway_attach의 launch_options가 읽는다), 노력 수준은 Hermes와 같이 준비된 뒤 /reasoning <값>(OMH도 그 세션의 effort로 받는다).
//   OMH_TUI_WALLPAPER=0: OMH TUI가 터미널 바탕색을 테마 색으로 바꾸지 않게(OSC 11. 판 카드 안에 다른 색 상자가 생긴다). 그 세션 env에만 준다(사용자 ~/.omh 설정은 그대로)
export const OMH_BOARD_ENV = Object.freeze({ OMH_TUI_WALLPAPER: '0' });
function omhBuild(ctx) {
  const resumed = !!(ctx.resume && ctx.harnessSessionId);
  const reasoning = hermesReasoningOf(ctx.effort, ctx.launcherArgs);
  const args = [...(resumed ? ['--resume', ctx.harnessSessionId] : ['--new']), ...withoutReasoning(ctx.launcherArgs)];
  const env = { ...OMH_BOARD_ENV, ...(ctx.instructions ? { HERMES_EPHEMERAL_SYSTEM_PROMPT: ctx.instructions.text } : {}), ...(ctx.model ? { HERMES_MODEL: ctx.model } : {}) };
  return { ...(reasoning ? { readyInput: hermesReasoningInput(reasoning), reasoning } : {}), args, env, files: [], harnessSessionId: resumed ? ctx.harnessSessionId : null, resumed };
}
// P330: AGY 모델 ID(agy models)는 끝에 추론 단계가 붙어 있다(gemini-3.8-flash-medium). 단계 붙은 ID와 --effort를 함께 주면 AGY 1.5.14는 모델을 버리고
//   기본 모델로 뜬다(개발용 판 시험: 상태 줄 "Gemini 4 Argon · medium"). 단계 없는 이름 + --effort(gemini-3.8-flash --effort low)나 단계 붙은 ID만은 먹는다.
//   그래서 인자에 --effort가 있으면 단계를 떼고 넘긴다(노력 칸·--effort가 단계를 정한다)
export const AGY_TIER_RE = /-(low|medium|high|xhigh|max)$/;
export function agyModelArg(model, args = []) {
  const m = String(model || '');
  const hasEffort = (args || []).some((a) => String(a) === '--effort' || String(a).startsWith('--effort='));
  return hasEffort && AGY_TIER_RE.test(m) ? m.replace(AGY_TIER_RE, '') : m;
}
// P192: AGY 승인 방식. 판의 권한 모드 → AGY 인자. manual은 덧붙이지 않는다(AGY 기본 Agent 모드: 묻는다)
// auto는 AGY Auto 모드(Windows 11 24H2 이상·개인 계정에서만, 안 되면 AGY가 기본 모드로 돌아간다). dontAsk·bypassPermissions는 묻지 않음
export const AGY_APPROVAL = {
  manual: [], plan: ['--mode', 'plan'], acceptEdits: ['--mode', 'accept-edits'], auto: ['--mode', 'auto'],
  dontAsk: ['--dangerously-skip-permissions'], bypassPermissions: ['--dangerously-skip-permissions'],
};
// P203: 판이 AGY에 주는 그 세션만의 설정(--settings, 저장되지 않는다). altScreenMode always: AGY 1.5.x 기본(인라인)은 대체 화면을 쓰지 않아
//   지난 대화가 터미널 기록으로 밀려 나가는데, 에이전트 노드는 판 안 기록이 없어(scrollback 0) 휠로 볼 수 없다. 대체 화면이면 AGY가 지난 대화를 스스로 굴린다
export const AGY_BOARD_SETTINGS = Object.freeze({ altScreenMode: 'always' });
// 호출자 추가 인자의 --settings(글 JSON 또는 파일 경로, --settings=값도)를 판의 것과 하나로 합친다. 같은 키는 사용자 값이 이긴다.
// 사용자 값을 읽지 못하면(JSON 객체가 아님, 파일 없음) 사용자 인자를 그대로 두고 판의 것은 넣지 않는다(AGY가 그 값을 판정한다)
// P211: statusLine(사용자 statusLine | null → 판의 statusLine | null, usage.mjs agyStatusLine)이 있으면 statusLine 키만은 사용자 값이 이기지 않고
//   판의 상태 줄 명령이 사용자 명령을 이어 부르게 합친다(사용자가 enabled false로 껐으면 사용자 값 그대로)
export function agySettingsArgs(args = [], board = AGY_BOARD_SETTINGS, readFile = (f) => fs.readFileSync(f, 'utf8'), statusLine = null) {
  const rest = [];
  const user = [];
  for (let i = 0; i < args.length; i++) {
    const a = String(args[i]);
    if (a === '--settings') { if (i + 1 < args.length) user.push(String(args[++i])); continue; } // 값 없는 마지막 --settings는 뺀다
    if (a.startsWith('--settings=')) { user.push(a.slice('--settings='.length)); continue; }
    rest.push(args[i]);
  }
  let merged = { ...board };
  for (const v of user) {
    let o = null;
    try { o = JSON.parse(v.trim().startsWith('{') ? v : readFile(v)); } catch {}
    if (!o || typeof o !== 'object' || Array.isArray(o)) return [...args];
    merged = { ...merged, ...o };
  }
  if (typeof statusLine === 'function') {
    const u = merged.statusLine && typeof merged.statusLine === 'object' && !Array.isArray(merged.statusLine) ? merged.statusLine : null;
    const sl = statusLine(u);
    if (sl) merged.statusLine = sl;
  }
  return [...rest, '--settings', JSON.stringify(merged)];
}
export const AGY_APPROVAL_FLAGS = new Set(['--mode', '--dangerously-skip-permissions']); // --sandbox(터미널 샌드박스)는 승인 방식과 따로다
// 표에 없는 종류(터미널이 아는 그 밖의 하네스): env와 PATH만 주고 지시문·이어 가기는 없다. 모델은 -m(P96과 같다)
const GENERIC = {
  command: null, sessionIdFrom: null, mustRePass: [], reserved: { flags: [] }, modelArgs: (m) => ['-m', m],
  build: (ctx) => ({ args: [...(ctx.model ? ['-m', ctx.model] : []), ...(ctx.launcherArgs || [])], env: {}, files: [], harnessSessionId: null, resumed: false }),
  isBoardLine: () => true,
};
export const adapterOf = (kind) => (kind && kind !== 'claude' && kind !== 'shell' ? ADAPTERS[kind] || { ...GENERIC, command: kind } : null);
// 판이 이어 갈 수 있는 종류인가(되살리기·다시 열기)
export const resumable = (kind) => !!(ADAPTERS[kind] && ADAPTERS[kind].sessionIdFrom);
// 판이 띄우고 다시 띄울 값을 남긴(P115 뒤) 하네스 세션인가
export const harnessResumable = (s) => !!s && (s.origin || 'board') === 'board' && resumable(s.kind) && !!s.harnessPlan;

// P298: 세션별 atrium 감싸개(어댑터 칸 pathWrapper). env가 도구까지 가지 않는 하네스(공용 데몬이 도구를 돌리는 Hermes)는 PATH만 간다.
//   그래서 세션마다 <판 데이터>/harness/<종류>/bin-<세션 ID>/에 판 env(토큰 없음: 토큰은 sessions/<ID>.token)를 담은 뒤 atrium-child를 부르는
//   atrium·mtask(sh, .cmd, .ps1)를 쓰고, 그 폴더를 PATH 맨 앞에 둔다. 세션을 지우면 폴더도 지운다(removeWrapperDir)
export const wrapperDirOf = (filesDir, kind, sessionId) => path.join(String(filesDir), String(kind), `bin-${String(sessionId).replace(/[^A-Za-z0-9_-]/g, '')}`);
const shQ = (v) => `'${String(v).replace(/'/g, `'\\''`)}'`;
const psQ = (v) => `'${String(v).replace(/'/g, "''")}'`;
const cmdV = (v) => String(v).replace(/%/g, '%%').replace(/"/g, '');
// → [{ file, text }]. env: 판 env(boardEnv), node·script: atrium-child를 부를 node와 스크립트
export function wrapperFiles({ dir, env = {}, node, script }) {
  const fwd = (p) => String(p).split('\\').join('/');
  const keys = Object.keys(env).filter((k) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(k) && env[k] != null);
  const out = [];
  for (const c of ['atrium', 'mtask']) {
    out.push({ file: path.join(dir, c), text: `#!/bin/sh\n# Atrium 보드(P298): 이 세션의 atrium(판 env를 담아 부른다)\n${keys.map((k) => `export ${k}=${shQ(env[k])}`).join('\n')}\nexec ${shQ(fwd(node))} ${shQ(fwd(script))} "$@"\n` });
    out.push({ file: path.join(dir, `${c}.cmd`), text: `@echo off\r\nrem Atrium 보드(P298): 이 세션의 atrium(판 env를 담아 부른다)\r\nsetlocal\r\n${keys.map((k) => `set "${k}=${cmdV(env[k])}"`).join('\r\n')}\r\n"${node}" "${script}" %*\r\n` });
    out.push({ file: path.join(dir, `${c}.ps1`), text: `# Atrium 보드(P298): 이 세션의 atrium(판 env를 담아 부른다)\r\n${keys.map((k) => `$env:${k} = ${psQ(env[k])}`).join('\r\n')}\r\n& ${psQ(node)} ${psQ(script)} @args\r\nexit $LASTEXITCODE\r\n` });
  }
  return out;
}
export function removeWrapperDir(filesDir, kind, sessionId) {
  if (!filesDir || !sessionId || !ADAPTERS[kind] || !ADAPTERS[kind].pathWrapper) return false;
  try { fs.rmSync(wrapperDirOf(filesDir, kind, sessionId), { recursive: true, force: true }); return true; } catch { return false; }
}

// 호출자 추가 인자·실행 명령에 판이 정하는 인자가 있는가 → 그 인자 | null
export function reservedArg(kind, words = []) {
  const a = adapterOf(kind);
  if (!a) return null;
  const flags = new Set(a.reserved.flags || []);
  const keys = a.reserved.configKeys || [];
  for (let i = 0; i < words.length; i++) {
    const w = String(words[i]); const flag = w.split('=')[0];
    if (flags.has(flag)) return w;
    if (keys.length && (w === '-c' || w === '--config') && keys.some((k) => String(words[i + 1] || '').trim().startsWith(`${k}=`))) return `${w} ${words[i + 1]}`;
    if (keys.length && (w.startsWith('--config=') || (w.startsWith('-c') && w.length > 2)) && keys.some((k) => w.replace(/^(--config=|-c)/, '').startsWith(`${k}=`))) return w;
  }
  return null;
}

// 띄울 값 → 터미널 백엔드에 넘길 값. o: { kind, startWords, sessionId, resume, harnessSessionId, model, launcherArgs, instructions, boardEnv, binDir, filesDir, wrapper }
// → { command: [낱말], args, env(판의 env + 하네스 env), pathFirst: [폴더], files, harnessSessionId, resumed }
export function harnessLaunch(o) {
  const a = adapterOf(o.kind);
  if (!a) throw Object.assign(new Error(`하네스가 아닙니다: ${o.kind}`), { code: 'bad_request' });
  const r = a.build({ startWords: o.startWords || [], sessionId: o.sessionId, resume: !!o.resume, harnessSessionId: o.harnessSessionId || null, model: o.model || null, effort: o.effort || null, launcherArgs: o.launcherArgs || [], instructions: a === GENERIC || !ADAPTERS[o.kind] ? null : o.instructions || null, filesDir: o.filesDir || null, forkFrom: o.forkFrom || null, statusLine: o.statusLine || null }); // P211: statusLine(AGY 상태 줄 명령 만들기)
  const command = o.startWords && o.startWords.length ? [...o.startWords] : [a.command];
  // P298: 세션별 atrium 감싸개(pathWrapper). o.wrapper = { node, script }(판의 atrium-child)
  const wrapDir = a.pathWrapper && o.wrapper && o.filesDir && o.sessionId ? wrapperDirOf(o.filesDir, o.kind, o.sessionId) : null;
  const files = wrapDir ? [...r.files, ...wrapperFiles({ dir: wrapDir, env: o.boardEnv || {}, node: o.wrapper.node, script: o.wrapper.script })] : r.files;
  return { command, args: r.args, env: { ...(o.boardEnv || {}), ...r.env }, pathFirst: [...(wrapDir ? [wrapDir] : []), ...(o.binDir ? [o.binDir] : [])], files, harnessSessionId: r.harnessSessionId, resumed: r.resumed, ...(r.readyInput ? { readyInput: r.readyInput, reasoning: r.reasoning } : {}) }; // P299: 준비된 뒤 넣을 글(Hermes /reasoning)
}
export function writeLaunchFiles(files = []) {
  for (const f of files) { fs.mkdirSync(path.dirname(f.file), { recursive: true }); fs.writeFileSync(f.file, f.text); }
}

// Codex 세션 ID: 그 폴더(cwd)에서 since 뒤에 생긴 rollout(첫 줄 session_meta의 id·cwd). 터미널이 세션 ID를 모를 때만
// 오늘·어제 폴더만 본다. 첫 줄 앞부분만 읽는다(첫 줄에 기본 지시문이 들어 길다). 읽기만 한다
// P133: exclude(갈라 연 원본·다른 판 세션이 가진 대화 ID)는 답에서 뺀다. forkedFrom: 문자열이면 그 대화를 갈라 연 rollout(session_meta의 forked_from_id)만,
//   null이면 갈라 연 것이 아닌 것만, undefined면 가리지 않는다. bornOnly: since 뒤에 생긴 파일만(그새 기록된 옛 대화는 빼고)
export function codexSessionOf({ cwd, since = 0, home = codexHomeOf(), now = Date.now(), exclude = [], forkedFrom = undefined, bornOnly = false } = {}) {
  const want = path.resolve(String(cwd || '')).toLowerCase().replace(/[\\/]+$/, '');
  const days = [0, 1].map((d) => new Date(now - d * 86400000));
  const found = [];
  for (const d of days) {
    const dir = path.join(home, 'sessions', String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0'));
    let names = [];
    try { names = fs.readdirSync(dir).filter((n) => /^rollout-.*\.jsonl$/.test(n)); } catch { continue; }
    for (const n of names) {
      const file = path.join(dir, n);
      let st; try { st = fs.statSync(file); } catch { continue; }
      if (st.birthtimeMs < since - 5000 && (bornOnly || st.mtimeMs < since)) continue;
      let head = '';
      try { const fd = fs.openSync(file, 'r'); try { const buf = Buffer.alloc(65536); head = buf.toString('utf8', 0, fs.readSync(fd, buf, 0, buf.length, 0)); } finally { fs.closeSync(fd); } } catch { continue; }
      const idm = /"payload":\{[^]*?"id":"([0-9a-f-]{36})"/.exec(head);
      const cwdm = /"cwd":"((?:[^"\\]|\\.)*)"/.exec(head);
      if (!idm || !cwdm) continue;
      if (/"thread_source":"(?:subagent|guardian_review)"/.test(head)) continue; // P326: 하위 스레드(spawn_agent·guardian)는 같은 폴더에서 나중에 생기지만 판 세션의 스레드가 아니다
      let c; try { c = JSON.parse(`"${cwdm[1]}"`); } catch { continue; }
      if (path.resolve(c).toLowerCase().replace(/[\\/]+$/, '') !== want) continue;
      if (exclude.some((x) => String(x).toLowerCase() === idm[1].toLowerCase())) continue;
      if (forkedFrom !== undefined) { const fm = /"forked_from_id":"([0-9a-f-]{36})"/.exec(head); const from = fm ? fm[1].toLowerCase() : null; if (from !== (forkedFrom ? String(forkedFrom).toLowerCase() : null)) continue; }
      found.push({ id: idm[1], at: st.birthtimeMs || st.mtimeMs });
    }
  }
  found.sort((x, y) => Math.abs(x.at - since) - Math.abs(y.at - since));
  return found.length ? found[0].id : null;
}

// P192: AGY 대화 기록 폴더(~/.gemini/antigravity-cli). conversations/<대화 ID>.db(SQLite, 안은 protobuf)가 대화 하나다.
// cache/last_conversations.json은 { 폴더: 그 폴더의 마지막 대화 ID }다. 읽기만 한다
export const agyHomeOf = (env = process.env) => (env.ATRIUM_AGY_HOME ? path.resolve(env.ATRIUM_AGY_HOME) : path.join(os.homedir(), '.gemini', 'antigravity-cli'));
const AGY_DB = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.db$/i;
const normDir = (p) => path.resolve(String(p || '')).toLowerCase().replace(/[\\/]+$/, '');
// 폴더 → AGY가 대화 기록에 적는 작업 공간 주소(file:///C:/x/y)
export const agyWorkspaceUri = (cwd) => `file:///${path.resolve(String(cwd || '')).split('\\').join('/').replace(/\/+$/, '')}`;
// AGY 대화 ID: 그 폴더(cwd)에서 since 뒤에 생긴 대화. 터미널이 대화 ID를 모르므로 판이 기록 폴더에서 찾는다.
// 1) since 뒤에 생긴 conversations/*.db 가운데 그 폴더의 작업 공간 주소가 든 것(파일 앞 4MB. 주소 바로 뒤가 /면 하위 폴더라 뺀다)
// 2) 그 가운데 last_conversations.json이 그 폴더의 마지막 대화로 적은 것이 있으면 그것, 없으면 생긴 때가 since에 가장 가까운 것
// exclude: 다른 판 세션이 가진 대화 ID
export function agySessionOf({ cwd, since = 0, home = agyHomeOf(), exclude = [] } = {}) {
  let names = [];
  try { names = fs.readdirSync(path.join(home, 'conversations')); } catch { return null; }
  const uris = [...new Set([agyWorkspaceUri(cwd), encodeURI(agyWorkspaceUri(cwd))].map((u) => u.toLowerCase()))];
  const ex = new Set(exclude.filter(Boolean).map((x) => String(x).toLowerCase()));
  const hit = (text, u) => { for (let i = text.indexOf(u); i >= 0; i = text.indexOf(u, i + 1)) if (text[i + u.length] !== '/') return true; return false; };
  const found = [];
  for (const n of names) {
    const m = AGY_DB.exec(n);
    if (!m || ex.has(m[1].toLowerCase())) continue;
    const file = path.join(home, 'conversations', n);
    let st; try { st = fs.statSync(file); } catch { continue; }
    const born = st.birthtimeMs || st.mtimeMs;
    if (born < since - 5000) continue;
    let text = '';
    try { const fd = fs.openSync(file, 'r'); try { const buf = Buffer.alloc(Math.min(st.size, 4 * 1024 * 1024)); text = buf.toString('latin1', 0, fs.readSync(fd, buf, 0, buf.length, 0)).toLowerCase(); } finally { fs.closeSync(fd); } } catch { continue; }
    if (!uris.some((u) => hit(text, u))) continue;
    found.push({ id: m[1].toLowerCase(), at: born });
  }
  if (!found.length) return null;
  let last = null;
  try { const j = JSON.parse(fs.readFileSync(path.join(home, 'cache', 'last_conversations.json'), 'utf8')); for (const [k, v] of Object.entries(j || {})) if (normDir(k) === normDir(cwd) && typeof v === 'string') last = v.toLowerCase(); } catch {}
  if (last && found.some((f) => f.id === last)) return last;
  found.sort((x, y) => Math.abs(x.at - since) - Math.abs(y.at - since));
  return found[0].id;
}
