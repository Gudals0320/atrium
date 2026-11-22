// P309 단위 시험: 감싼 호출자 omh(OMH Native TUI = Hermes + OMH 플러그인)를 hermes 계열로 다룬다.
// 화면(omhStateOf·입력 칸·노력 수준 표시, 끝난 뒤 남은 머리글은 OMH 화면이 아님), 띄우기(omh --new·--resume, env 안내문·모델·바탕색 끄기),
// 명령 한 줄 런처의 하네스 계열(자동 omh → hermes, 셸, 그 밖의 에이전트)·붙여 넣기·미리보기·하위 런처, 오케스트레이션 안내문 문장,
// 셸에서 화면을 차지한 조용한 프로그램(일하는 중으로 세지 않음), 셸 터미널의 흉내 상태가 지워지면 에이전트가 떠남, 잠재우기 전 입력 칸 읽개. OMH·hc 없이 돈다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { hermesStateOf, omhStateOf, omhInputBox, hermesInputBox, hermesReasoningShown, isOmhScreen } from '../src/screen.mjs';
import { harnessLaunch, reservedArg, wrapperOf, wrapperInfo, ADAPTERS, OMH_BOARD_ENV, HARNESS_WRAPPERS } from '../src/harness.mjs';
import { normalizeLauncher, resolveLauncher, previewLauncher, parseCommandLine, familyOf, agentLauncherOf, flavorOf, commandAgent, COMMAND_FAMILIES } from '../src/launchers.mjs';
import { orchPromptLines } from '../src/orchestration.mjs';
import { newRuntime, deriveState } from '../src/state.mjs';
import { HcModel } from '../src/hc/model.mjs';
import { readDraftBox } from '../src/draft-aside.mjs';

const RULE = '────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────';
const INFO = (right = 'gpt-x · effort medium') => '  [⚚ OMH Native v5.0.0]' + ' '.repeat(80) + right;
// OMH Native 화면 표본(실측 모양을 줄여 만든 것). tail: 입력 칸 위 꼬리 줄들
const omh = ({ tail = [], box = '❯ Ask Hermes anything', right, below = [] } = {}) => ['', '⚚ OH-MY-HERMES v5.0.0 · C:\\x', '', ...tail, RULE, box, RULE, INFO(right), ...below].join('\n');

test('P309 OMH 화면: 쉼·일함·끊는 중·턴 사이 기다림(쉼)', () => {
  assert.equal(omhStateOf(omh()), 'idle');
  assert.equal(omhStateOf(omh({ tail: ['✢ Deliberating… (3s · thinking with medium effort · esc to interrupt)', '  ⎿  Tip: ctrl+o shows the whole transcript'] })), 'working');
  assert.equal(omhStateOf(omh({ tail: ['✶ Reading files… (1m 2s · ↓75 tokens)'] })), 'working'); // 좁아서 끊기 안내가 빠져도 동사가 기다림이 아니면 일함
  assert.equal(omhStateOf(omh({ tail: ['✻ interrupting… (4s)'] })), 'working');
  assert.equal(omhStateOf(omh({ tail: ['✻ Waiting… (12s · 1 agent)'] })), 'idle'); // 하위 에이전트를 기다리는 턴 사이(바쁨 읽개가 본다)
  assert.equal(omhStateOf(omh({ tail: ['✳ Running nightly-dag… (2m 3s · 2/3 done)'] })), 'idle');
  assert.equal(hermesStateOf(omh()), 'idle'); // Hermes Ink 모양이 아니면 OMH로 읽는다
  assert.equal(isOmhScreen(omh()), true);
});

test('P309 OMH 화면: 사람이 답할 창은 막힘', () => {
  assert.equal(omhStateOf(omh({ tail: ['? waiting for your approval (5s)'] })), 'blocked');
  assert.equal(omhStateOf(omh({ tail: ['? waiting for your answer'] })), 'blocked');
  assert.equal(omhStateOf(omh({ right: '↑↓ pick · enter confirms · esc denies and stops' })), 'blocked');
  assert.equal(omhStateOf(omh({ right: 'esc cancels' })), 'blocked');
  assert.equal(omhStateOf(omh({ tail: ['  Enter to select · ↑↓ to navigate · Esc to cancel'] })), 'blocked');
});

test('P309 OMH 화면: 끝난 뒤 남은 머리글·셸 프롬프트·다른 화면은 OMH가 아니다', () => {
  const exited = ['⚚ OH-MY-HERMES v5.0.0 · C:\\x', '', 'omh: nothing was said in this session, so there is nothing to resume.', 'PS C:\\x>'].join('\n');
  assert.equal(omhStateOf(exited), null);
  assert.equal(hermesStateOf(exited), null);
  assert.equal(isOmhScreen(exited), false);
  assert.equal(omhStateOf(['PS C:\\x> omh', 'loading'].join('\n')), null);
  // Hermes TUI(Ink) 모양은 그대로
  assert.equal(hermesStateOf([' ─ ready │ gpt │ 2s │ voice off  ─ C:\\x', ' ❯ Try "explain this codebase"'].join('\n')), 'idle');
});

test('P309 OMH 입력 칸과 노력 수준 확인 줄', () => {
  assert.deepEqual([omhInputBox(omh()).found, omhInputBox(omh()).text], [true, '']);
  const b = hermesInputBox(omh({ box: '❯ hello paste test' }));
  assert.equal(b.found, true); assert.equal(b.text, 'hello paste test');
  assert.equal(hermesInputBox(omh({ box: ['❯ first line', '  second line'].join('\n') })).text, 'first line second line');
  assert.equal(hermesReasoningShown(omh({ right: 'gpt-x · effort high' }), 'high'), true);
  assert.equal(hermesReasoningShown(omh({ right: 'gpt-x · effort medium' }), 'high'), false);
  // 잠재우기 전 입력 칸 읽개(P309 전에는 Claude Code 읽개가 안내 글을 쓰다 만 글로 읽었다)
  const d = readDraftBox(omh(), 'hermes');
  assert.equal(d.found, true); assert.equal(d.text, '');
  assert.equal(readDraftBox(omh({ box: '❯ draft' }), 'hermes').text, 'draft');
});

test('P309 감싼 호출자 표: omh → hermes 계열(경로·확장자 무시), 그 밖은 null', () => {
  assert.equal(HARNESS_WRAPPERS.omh.family, 'hermes');
  assert.equal(wrapperOf('omh'), 'omh'); assert.equal(wrapperOf(['omh.cmd']), 'omh'); assert.equal(wrapperOf('C:\\tools\\omh.exe --new'), 'omh');
  assert.equal(wrapperOf('hermes'), null); assert.equal(wrapperOf(''), null); assert.equal(wrapperOf([]), null);
  assert.deepEqual(wrapperInfo('omh'), { id: 'omh', family: 'hermes', flavor: 'omh', label: 'OMH' });
});

test('P309 OMH 띄우기: omh --new / --resume <ID>, 안내문·모델·바탕색 끄기는 env, 노력 수준은 준비된 뒤 /reasoning', () => {
  const base = { kind: 'hermes', startWords: ['omh'], sessionId: 'S1', instructions: { file: 'x', text: '안내문' }, boardEnv: { ATRIUM_PORT: '1' } };
  const a = harnessLaunch({ ...base, model: 'gpt-x', effort: 'high' });
  assert.deepEqual(a.command, ['omh']); assert.deepEqual(a.args, ['--new']);
  assert.equal(a.env.HERMES_EPHEMERAL_SYSTEM_PROMPT, '안내문'); assert.equal(a.env.HERMES_MODEL, 'gpt-x'); assert.equal(a.env.OMH_TUI_WALLPAPER, '0'); assert.equal(a.env.ATRIUM_PORT, '1');
  assert.equal(a.readyInput, '/reasoning high');
  const r = harnessLaunch({ ...base, resume: true, harnessSessionId: 'local-abc', launcherArgs: ['--reasoning', 'low', '-p', 'bot'] });
  assert.deepEqual(r.args, ['--resume', 'local-abc', '-p', 'bot']); assert.equal(r.resumed, true); assert.equal(r.readyInput, '/reasoning low');
  assert.equal(r.env.HERMES_MODEL, undefined);
  // 보통 hermes는 그대로(--tui, -m)
  const h = harnessLaunch({ ...base, startWords: [], model: 'gpt-x' });
  assert.deepEqual(h.args, ['--tui', '-m', 'gpt-x']); assert.equal(h.env.OMH_TUI_WALLPAPER, undefined);
  assert.equal(reservedArg('hermes', ['--new']), '--new'); assert.equal(reservedArg('hermes', ['--onboard']), '--onboard');
  assert.equal(ADAPTERS.hermes.isBoardLine(['omh', '--new']), true);
  assert.deepEqual(OMH_BOARD_ENV, { OMH_TUI_WALLPAPER: '0' });
});

test('P309 명령 한 줄 런처의 하네스 계열: 자동(omh → Hermes, 카드 OMH, 오케스트레이션은 종류 기본)', () => {
  const l = normalizeLauncher({ name: 'OMH', harness: 'command', command: 'omh' });
  assert.equal(l.family, undefined); assert.equal(familyOf(l), 'hermes');
  const r = resolveLauncher(l);
  assert.equal(r.kind, 'hermes'); assert.equal(r.flavor, 'omh'); assert.equal(r.startCommand, 'omh'); assert.deepEqual(r.args, []); assert.equal(r.command, '');
  assert.equal(previewLauncher(l).line, 'omh'); assert.equal(previewLauncher(l).family, 'hermes'); assert.equal(previewLauncher(l).board, true);
  // 사람이 셸 명령으로 고르면 지금까지처럼 셸에 친다
  const s = normalizeLauncher({ name: 'S', harness: 'command', command: 'omh', family: 'shell' });
  assert.equal(resolveLauncher(s).kind, 'shell'); assert.equal(resolveLauncher(s).command, 'omh');
  // 모르는 명령은 셸 명령(자동)
  assert.equal(familyOf(normalizeLauncher({ name: 'V', harness: 'command', command: 'vim' })), 'shell');
  assert.deepEqual(COMMAND_FAMILIES, ['shell', 'hermes', 'agent']);
});

test('P309 그 밖의 에이전트 계열(omo): 그 이름의 종류, 오케스트레이션은 사람이 고른 대로, 인자는 추가 인자', () => {
  const l = normalizeLauncher({ name: 'omo', harness: 'command', command: 'omo --fast run', family: 'agent', orchestrates: true });
  assert.equal(l.family, 'agent'); assert.equal(l.orchestrates, true);
  const r = resolveLauncher(l);
  assert.equal(r.kind, 'omo'); assert.equal(r.orchestrates, true); assert.deepEqual(r.args, ['--fast', 'run']); assert.equal(r.flavor, null);
  assert.equal(previewLauncher(l).line, 'omo --fast run');
  assert.deepEqual(commandAgent('omh -p bot', 'hermes'), { kind: 'hermes', startCommand: 'omh', args: ['-p', 'bot'] });
});

test('P309 하네스 계열 런처의 확인: 환경 변수·경로·여러 줄·판이 정하는 인자·모르는 계열', () => {
  const key = (f) => { try { f(); return null; } catch (e) { return e.key; } };
  assert.equal(key(() => normalizeLauncher({ name: 'a', harness: 'command', command: 'omh', env: 'A=1' })), 'launcherFamily.errEnv');
  assert.equal(key(() => normalizeLauncher({ name: 'a', harness: 'command', command: 'C:\\x\\omo.exe', family: 'agent' })), 'launcherFamily.errCommand');
  assert.equal(key(() => normalizeLauncher({ name: 'a', harness: 'command', command: 'cd x; omh', family: 'hermes' })), 'launcherFamily.errCommand');
  assert.equal(key(() => normalizeLauncher({ name: 'a', harness: 'command', command: 'omh --resume x' })), 'launchers.err.argsReserved');
  assert.equal(key(() => normalizeLauncher({ name: 'a', harness: 'command', command: 'omh', family: 'zzz' })), 'launcherFamily.errFamily');
  // 셸 명령이면 환경 변수·경로를 그대로 받는다(지금까지와 같다)
  assert.equal(key(() => normalizeLauncher({ name: 'a', harness: 'command', command: 'C:\\x\\omh.cmd', env: 'A=1', family: 'shell' })), null);
});

test('P309 런처: hermes 하네스 + 실행 명령 omh는 카드 OMH, 미리보기에 -m 대신 env 이름, 하위 런처 모양', () => {
  const l = normalizeLauncher({ name: 'h', harness: 'hermes', startCommand: 'omh', model: 'gpt-x' });
  assert.equal(flavorOf(l), 'omh'); assert.equal(resolveLauncher(l).flavor, 'omh');
  assert.deepEqual([previewLauncher(l).line, previewLauncher(l).env], ['omh', ['HERMES_MODEL']]);
  assert.equal(flavorOf(normalizeLauncher({ name: 'h2', harness: 'hermes' })), null);
  assert.equal(flavorOf(normalizeLauncher({ name: 'h3', harness: 'hermes', startCommand: 'omh', icon: 'claude' })), 'claude'); // 고른 아이콘이 이긴다
  const c = normalizeLauncher({ name: 'c', harness: 'command', command: 'omh' });
  const a = agentLauncherOf(c);
  assert.equal(a.harness, 'hermes'); assert.equal(a.startCommand, 'omh'); assert.equal(a.command, '');
  assert.equal(agentLauncherOf(normalizeLauncher({ name: 'v', harness: 'command', command: 'vim' })), null);
});

test('P309 붙여 넣기: omh(경로로 줘도)는 Hermes 하네스 + 실행 명령 omh', () => {
  const p = parseCommandLine('omh', { kinds: ['claude', 'codex', 'hermes'] });
  assert.equal(p.launcher.harness, 'hermes'); assert.equal(p.launcher.startCommand, 'omh'); assert.equal(p.recognized.as, 'kind');
  const q = parseCommandLine('C:\\Users\\me\\omh\\bin\\omh.cmd -p bot', { kinds: [] });
  assert.equal(q.launcher.harness, 'hermes'); assert.equal(q.launcher.startCommand, 'omh'); assert.equal(q.launcher.args, '-p bot');
});

test('P309 오케스트레이션 안내문: 하위 작업은 하네스가 서브에이전트로 나누고 판의 하위 세션은 필요 없다', () => {
  for (const sc of ['sub', 'free']) {
    const t = orchPromptLines(sc).join(' ');
    assert.match(t, /하위로 내려가는 작업은 네가 하네스 안에서 서브에이전트를 만들어 나눠 맡긴다/);
    assert.match(t, /보드에서 하위 세션을 만들 필요가 없다/);
    assert.ok(!/["\n]/.test(t));
  }
});

test('P309 셸에서 화면을 차지한 조용한 프로그램은 일하는 중으로 세지 않는다', () => {
  const rt = newRuntime({ kind: 'shell', hooked: false });
  rt.shell = { atPrompt: false, command: null, program: false };
  assert.equal(deriveState(rt).state, 'shell_running');
  rt.shell = { atPrompt: false, command: null, program: true };
  assert.equal(deriveState(rt).state, 'shell_idle');
  rt.shell = { atPrompt: true, command: null, program: false };
  assert.equal(deriveState(rt).state, 'shell_idle');
});

test('P309 셸 터미널의 화면 흉내 상태: 생기면 에이전트가 나타나고, 지우면 떠난다(판은 셸로 되돌린다)', () => {
  const m = new HcModel();
  m.load([{ address: 't1', state: 'live', labels: { 'atrium-board': '1' }, status: null }]);
  const on = m.apply({ type: 'status', terminal: 't1', data: { status: { app: 'hermes', state: 'idle', synthetic: true, screen: true }, reported: false } });
  assert.deepEqual(on.map((e) => e.type), ['agent_detected', 'status']); assert.equal(on[0].agent, 'hermes');
  const off = m.apply({ type: 'status', terminal: 't1', data: { status: null, reported: false } });
  assert.deepEqual(off.map((e) => e.type), ['agent_released']); assert.equal(off[0].agent, 'hermes');
});
