// P330: 하네스 계약(harness-contract.mjs). 사용자 런처 여섯(지어낸 이름)을 표본으로 풀기·미리보기·칸으로 옮기기·하네스 런처로 바꾸기·점검·하위 세션·atrium models 인자
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLauncher, resolveLauncher, previewLauncher, launcherContract, fixLauncher, convertCommandLauncher, checkPlanOf, parseCommandLine, effortArgsOf, harnessOptionArgs, HARNESSES } from '../src/launchers.mjs';
import { argOverlaps, contractOf, harnessOfCommand, checkFlags, flagInHelp, runCheck, contractLines, modelArgsFor, takesModel, approvalArgsFor, CONTRACTS } from '../src/harness-contract.mjs';
import { approvalArgsOf, otherKindPlan, APPROVAL_ARGS } from '../src/branch.mjs';
import { harnessLaunch } from '../src/harness.mjs';

// 표본: 이름은 지어냈다. 값의 모양은 실제로 쓰이는 런처 여섯
const SAMPLE = {
  main: { name: 'Main Opus', harness: 'claude', model: 'claude-opus-5-5', effort: '', permissionMode: 'bypassPermissions' },
  sh: { name: 'Plain shell', harness: 'shell' },
  cx: { name: 'Codex fast', harness: 'codex', model: 'gpt-6-astra', args: '--approve-for-me -c model_reasoning_effort="high"' },
  ag: { name: 'Gem', harness: 'agy', model: '', effort: '', permissionMode: 'bypassPermissions', args: '--model gemini-4-hydrogen --effort high' },
  ds: { name: 'DS', harness: 'command', command: 'dsh-tui' },
  hm: { name: 'Herm', harness: 'command', command: 'omh' },
};
const N = (x) => normalizeLauncher(x);

test('P330 표본: 바꾸기 전 풀기·미리보기는 지금과 같다(사람이 단추를 누르기 전에는 판이 바꾸지 않는다)', () => {
  assert.equal(previewLauncher(N(SAMPLE.main)).line, 'claude --permission-mode bypassPermissions --model claude-opus-5-5');
  assert.equal(previewLauncher(N(SAMPLE.sh)).shell, true);
  const cx = N(SAMPLE.cx);
  assert.equal(cx.permissionMode, 'manual'); assert.equal(cx.effort, '');
  assert.deepEqual(resolveLauncher(cx).args, ['--approve-for-me', '-c', 'model_reasoning_effort=high'], '추가 인자 그대로, 칸은 비어 덧붙이지 않는다');
  assert.equal(previewLauncher(N(SAMPLE.ag)).line, 'agy --model gemini-4-hydrogen --effort high --dangerously-skip-permissions', '추가 인자의 --effort가 이기고 승인만 붙는다');
  assert.equal(previewLauncher(N(SAMPLE.ds)).line, 'dsh-tui'); assert.equal(previewLauncher(N(SAMPLE.ds)).typed, true);
  assert.equal(previewLauncher(N(SAMPLE.hm)).family, 'hermes');
});

test('P330 계약 점검: 겹치는 추가 인자, 바꾸기 권함, 칸 안내', () => {
  assert.equal(launcherContract(N(SAMPLE.sh)), null);
  const c = launcherContract(N(SAMPLE.cx));
  assert.deepEqual(c.overlaps.map((x) => [x.field, x.value, x.movable]), [['permissionMode', 'auto', true], ['effort', 'high', true]]);
  assert.equal(c.hint.effortHow, '-c model_reasoning_effort="<v>"'); assert.equal(c.hint.source, 'codex');
  const a = launcherContract(N(SAMPLE.ag));
  assert.deepEqual(a.overlaps.map((x) => [x.field, x.value]), [['model', 'gemini-4-hydrogen'], ['effort', 'high']]);
  assert.deepEqual(a.hint.approval, ['--dangerously-skip-permissions']);
  assert.deepEqual(launcherContract(N(SAMPLE.ds)).convert, { harness: 'dsh', startCommand: '' });
  assert.deepEqual(launcherContract(N(SAMPLE.hm)).convert, { harness: 'hermes', startCommand: 'omh' });
  assert.equal(launcherContract(N(SAMPLE.main)).overlaps.length, 0);
  assert.deepEqual(launcherContract(N(SAMPLE.main)).hint.approval, ['--permission-mode', 'bypassPermissions']);
  // 그 하네스가 받지 않는 인자: Hermes TUI의 --reasoning(옮기면 /reasoning), 모르는 인자
  const h = launcherContract(N({ name: 'H', harness: 'hermes', args: '--reasoning high --wat' }));
  assert.deepEqual(h.rejected, [{ arg: '--reasoning', why: 'effortNotArg' }]); assert.deepEqual(h.unknown, ['--wat']);
  assert.equal(h.overlaps[0].movable, true);
  // omh는 -m을 받지 않는다(모델 칸 → env HERMES_MODEL)
  const o = launcherContract(N({ name: 'O', harness: 'hermes', startCommand: 'omh', args: '-m x/y' }));
  assert.deepEqual(o.rejected, [{ arg: '-m', why: 'modelNotArg' }]); assert.equal(o.hint.modelHow, 'HERMES_MODEL=<model>');
  // 계약 밖 값은 옮길 수 없다
  const bad = launcherContract(N({ name: 'A', harness: 'agy', args: '--effort ultra' }));
  assert.deepEqual(bad.overlaps.map((x) => [x.value, x.ok, x.movable]), [['ultra', false, false]]);
});

test('P330 칸으로 옮기기·하네스 런처로 바꾸기: 표본 여섯의 바꾼 뒤 값', () => {
  const cx = fixLauncher(N(SAMPLE.cx), 'fields').launcher;
  assert.deepEqual([cx.model, cx.effort, cx.permissionMode, cx.args], ['gpt-6-astra', 'high', 'auto', '']);
  assert.deepEqual(resolveLauncher(N(cx)).args, ['-c', 'model_reasoning_effort="high"', '--approve-for-me']);
  const ag = fixLauncher(N(SAMPLE.ag), 'fields').launcher;
  assert.deepEqual([ag.model, ag.effort, ag.permissionMode, ag.args], ['gemini-4-hydrogen', 'high', 'bypassPermissions', '']);
  assert.equal(previewLauncher(N(ag)).line, 'agy --model gemini-4-hydrogen --effort high --dangerously-skip-permissions');
  const ds = fixLauncher(N(SAMPLE.ds), 'harness').launcher;
  assert.deepEqual([ds.harness, ds.startCommand, ds.args, ds.name, ds.command], ['dsh', '', '', 'DS', '']);
  assert.equal(previewLauncher(N(ds)).line, 'dsh-tui'); assert.equal(previewLauncher(N(ds)).board, true);
  const hm = fixLauncher(N(SAMPLE.hm), 'harness').launcher;
  assert.deepEqual([hm.harness, hm.startCommand, hm.args, hm.name, hm.permissionMode], ['hermes', 'omh', '', 'Herm', 'manual']);
  assert.equal(previewLauncher(N({ ...hm, model: 'p/m' })).line, 'omh'); assert.deepEqual(previewLauncher(N({ ...hm, model: 'p/m' })).env, ['HERMES_MODEL']);
  // 다른 셋은 그대로
  assert.deepEqual(fixLauncher(N(SAMPLE.main), 'fields').moved, []);
  assert.throws(() => fixLauncher(N({ name: 'x', harness: 'command', command: 'mywrap' }), 'harness'), (e) => e.key === 'launchers.err.notConvertible');
  assert.equal(convertCommandLauncher(N({ name: 'x', harness: 'command', command: 'npm run dev' })), null);
});

test('P330 명령줄 붙여 넣기도 같은 결과(dsh-tui → dsh, omh → hermes + omh, 겹치는 인자는 칸으로)', () => {
  const p = (s) => parseCommandLine(s).launcher;
  assert.deepEqual([p('dsh-tui').harness, p('dsh-tui').startCommand], ['dsh', '']);
  assert.deepEqual([p('omh').harness, p('omh').startCommand], ['hermes', 'omh']);
  const cx = p('codex -m gpt-6-astra --approve-for-me -c model_reasoning_effort="high"');
  assert.deepEqual([cx.model, cx.effort, cx.permissionMode, cx.args], ['gpt-6-astra', 'high', 'auto', '']);
  const ag = p('agy --model gemini-4-hydrogen --effort high');
  assert.deepEqual([ag.model, ag.effort, ag.args], ['gemini-4-hydrogen', 'high', '']);
  const hm = p('hermes -m a/b --reasoning x-high --yolo');
  assert.deepEqual([hm.model, hm.effort, hm.permissionMode, hm.args], ['a/b', 'xhigh', 'bypassPermissions', '']);
  const pi = p('pi --model a/b --thinking low --no-mcp');
  assert.deepEqual([pi.model, pi.effort, pi.args], ['a/b', 'low', '--no-mcp']);
});

test('P330 런처로 띄우기: 칸 값이 계약대로 인자가 된다(Codex·pi·Hermes·opencode)', () => {
  const r = (x) => resolveLauncher(N(x));
  assert.deepEqual(r({ name: 'c', harness: 'codex', effort: 'low', permissionMode: 'bypassPermissions' }).args, ['-c', 'model_reasoning_effort="low"', '--dangerously-bypass-approvals-and-sandbox']);
  assert.deepEqual(r({ name: 'c', harness: 'codex', effort: 'low', args: '-c model_reasoning_effort=max --approve-for-me', permissionMode: 'dontAsk' }).args, ['-c', 'model_reasoning_effort=max', '--approve-for-me'], '추가 인자가 이긴다');
  assert.deepEqual(r({ name: 'p', harness: 'pi', model: 'a/b', effort: 'minimal' }).args, ['--thinking', 'minimal']);
  assert.deepEqual(r({ name: 'h', harness: 'hermes', effort: 'low', permissionMode: 'bypassPermissions' }).args, ['--yolo']);
  assert.equal(r({ name: 'h', harness: 'hermes', effort: 'low', permissionMode: 'bypassPermissions' }).effort, 'low');
  assert.deepEqual(r({ name: 'o', harness: 'hermes', startCommand: 'omh', permissionMode: 'bypassPermissions' }).args, [], 'omh는 승인 인자를 받지 않는다');
  assert.deepEqual(r({ name: 'oc', harness: 'opencode', permissionMode: 'bypassPermissions' }).args, ['--auto']);
  assert.throws(() => N({ name: 'p', harness: 'pi', effort: 'ultra' }), (e) => e.key === 'launchers.err.effort');
  assert.deepEqual(HARNESSES.codex.efforts, ['', 'none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra']);
  // 어댑터까지: Hermes TUI 인자(--yolo는 --tui가 받는다), pi --thinking
  const hl = harnessLaunch({ kind: 'hermes', sessionId: 's1', launcherArgs: ['--yolo'], effort: 'low' });
  assert.deepEqual(hl.args, ['--tui', '--yolo']); assert.equal(hl.readyInput, '/reasoning low');
  assert.deepEqual(harnessLaunch({ kind: 'pi', sessionId: 's2', launcherArgs: ['--thinking', 'low'] }).args, ['--session-id', 's2', '--thinking', 'low']);
});

test('P330 atrium child --kind X --model Y --effort Z: 하네스마다 계약대로, 받지 않는 값은 한 줄', () => {
  assert.deepEqual(effortArgsOf('pi', 'high', ['--thinking', 'low', '-x']), { args: ['-x', '--thinking', 'high'], applied: true, effort: 'high' });
  assert.throws(() => effortArgsOf('pi', 'ultra'), (e) => e.key === 'launchers.err.effort');
  assert.equal(effortArgsOf('dsh', 'high').ignored, true);
  assert.deepEqual(effortArgsOf('codex', 'xhigh', ['-c', 'model_reasoning_effort=low']).args, ['-c', 'model_reasoning_effort="xhigh"']);
  assert.deepEqual(effortArgsOf('agy', 'max').args, ['--effort', 'max']);
  assert.equal(effortArgsOf('hermes', 'x-high').effort, 'xhigh');
  // 모델 모양: codex -m, agy·pi --model, opencode 설정, omh env, dsh는 받지 않는다
  assert.deepEqual(modelArgsFor('codex', 'm'), ['-m', 'm']); assert.deepEqual(modelArgsFor('agy', 'm'), ['--model', 'm']);
  assert.deepEqual(modelArgsFor('pi', 'm'), ['--model', 'm']); assert.deepEqual(modelArgsFor('opencode', 'a/b'), []);
  assert.deepEqual(modelArgsFor('hermes', 'm', 'omh'), []); assert.deepEqual(modelArgsFor('hermes', 'm'), ['-m', 'm']);
  assert.equal(takesModel('dsh'), false); assert.equal(takesModel('codex'), true); assert.equal(takesModel('grok'), true);
  // 승인: 부모 모드 → 그 하네스 인자(Codex auto = --approve-for-me), omh는 옮기지 않는다
  assert.deepEqual(approvalArgsOf('codex', 'auto'), { args: ['--approve-for-me'], from: 'parent' });
  assert.deepEqual(approvalArgsOf('hermes', 'bypassPermissions'), { args: ['--yolo'], from: 'parent' });
  assert.deepEqual(approvalArgsOf('hermes', 'bypassPermissions', [], 'omh'), { args: [], from: null });
  assert.deepEqual(approvalArgsOf('opencode', 'dontAsk', ['--auto']), { args: [], from: 'launcher' });
  assert.deepEqual(approvalArgsOf('pi', 'bypassPermissions'), { args: [], from: null });
  assert.ok(APPROVAL_ARGS.hermes && APPROVAL_ARGS.opencode);
  // 하위 세션 기록의 argv는 그 하네스 모양
  const lists = { items: [{ id: 'a1', name: 'AGY', harness: 'agy', model: 'g-1', effort: '', permissionMode: 'manual', args: '' }], favorites: ['a1'] };
  assert.deepEqual(otherKindPlan({ route: { type: 'plain', kind: 'agy' }, permissionMode: 'manual', lists }).argv, ['--model', 'g-1', '--dangerously-skip-permissions']);
  const hl = { items: [{ id: 'h1', name: 'Herm', harness: 'hermes', startCommand: 'omh', model: 'p/m', effort: '', permissionMode: 'manual', args: '' }], favorites: ['h1'] };
  assert.deepEqual(otherKindPlan({ route: { type: 'plain', kind: 'hermes' }, permissionMode: 'bypassPermissions', lists: hl }).argv, [], 'omh: 모델은 env, 승인 인자 없음');
});

test('P330 atrium models 줄: 하네스마다 --model·--effort가 넘어가는 길', () => {
  const lines = Object.fromEntries(contractLines().map((c) => [c.id, c.text]));
  assert.match(lines.codex, /-c model_reasoning_effort=/); assert.match(lines.pi, /--thinking/);
  assert.match(lines.dsh, /--model 받지 않음/); assert.match(lines.omh, /HERMES_MODEL/); assert.match(lines.hermes, /\/reasoning/);
  assert.match(lines.opencode, /--effort 받지 않음/);
});

test('P330 점검: 도움말 표본에서 판이 붙일 인자를 찾는다(없는 인자는 빨간 줄), 실행 명령을 못 찾으면 notFound', async () => {
  const help = 'Usage: codex [OPTIONS]\n  -c, --config <key=value>\n  -m, --model <MODEL>\n  resume   Resume a previous session\n      --approve-for-me\n';
  assert.deepEqual(checkFlags(help, ['-c', '-m', 'resume', '--approve-for-me', '--yolo']).map((f) => f.ok), [true, true, true, true, false]);
  assert.equal(flagInHelp('  --model-x', '--model'), false);
  const plan = checkPlanOf(N(fixLauncher(N(SAMPLE.cx), 'fields').launcher));
  assert.deepEqual(plan.words, ['codex']); assert.deepEqual(plan.flags, ['-c', '-m', 'resume', '--approve-for-me']);
  assert.deepEqual(checkPlanOf(N(SAMPLE.hm)).words, ['omh']); assert.deepEqual(checkPlanOf(N(SAMPLE.hm)).flags, ['--new', '--resume']);
  assert.deepEqual(checkPlanOf(N(SAMPLE.ds)).flags, ['--patch', '--resume']);
  assert.equal(checkPlanOf(N(SAMPLE.sh)), null);
  const calls = [];
  const run = async (w, arg) => { calls.push([...w, arg].join(' ')); return arg === '--version' ? { code: 0, out: 'codex-cli 9.9.9\n' } : { code: 0, out: help }; };
  const r = await runCheck({ words: ['codex'], flags: plan.flags, run });
  assert.deepEqual(calls.sort(), ['codex --help', 'codex --version']);
  assert.equal(r.version, 'codex-cli 9.9.9'); assert.equal(r.ok, true);
  const miss = await runCheck({ words: ['nope'], flags: ['-x'], run: async () => ({ code: 1, out: "'nope' is not recognized as an internal or external command" }) });
  assert.equal(miss.error, 'notFound');
  const old = await runCheck({ words: ['codex'], flags: ['--approve-for-me'], run: async (w, a) => ({ code: 0, out: a === '--help' ? '  -m, --model\n' : 'codex-cli 0.1' }) });
  assert.equal(old.ok, false); assert.deepEqual(old.flags, [{ flag: '--approve-for-me', ok: false }]);
});

test('P330 계약 표: 명령 이름 → 하네스, omh는 hermes 계열', () => {
  assert.deepEqual(harnessOfCommand('C:/x/dsh-tui.cmd'), { harness: 'dsh', startCommand: '' });
  assert.deepEqual(harnessOfCommand('dst'), { harness: 'dsh', startCommand: 'dst' });
  assert.deepEqual(harnessOfCommand('omh'), { harness: 'hermes', startCommand: 'omh' });
  assert.equal(harnessOfCommand('npm'), null);
  assert.equal(contractOf('hermes', 'omh').id, 'omh'); assert.equal(contractOf('hermes', '').id, 'hermes');
  assert.deepEqual(approvalArgsFor('agy', 'plan'), ['--mode', 'plan']);
  assert.deepEqual(argOverlaps('codex', ['-mgpt-x']).items.map((x) => x.value), ['gpt-x']);
  for (const c of Object.values(CONTRACTS)) assert.ok(c.boardFlags.length && c.command, c.id);
  assert.deepEqual(harnessOptionArgs('pi', { effort: 'low' }, ['--thinking', 'high']), [], '추가 인자의 --thinking이 이긴다');
});
