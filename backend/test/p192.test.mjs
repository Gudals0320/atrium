// P192: AGY(Antigravity CLI) 종류(어댑터, 대화 ID 알기, 신뢰 질문, 모델 목록, 호출자)와 pi 어댑터 회귀
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ADAPTERS, adapterOf, harnessLaunch, reservedArg, resumable, harnessResumable, agySessionOf, agyWorkspaceUri, AGY_APPROVAL, HARNESS_PROMPT, piExtensionText, providerIdOf } from '../src/harness.mjs';
import { normalizeLauncher, resolveLauncher, previewLauncher, harnessOptionArgs, normalizeStartCommand, describeHarnesses, HARNESSES, parseCommandLine } from '../src/launchers.mjs';
import { approvalArgsOf, hasApprovalArgs, otherKindPlan } from '../src/branch.mjs';
import { parseAgyModels, AgyModels } from '../src/agy-models.mjs';
import { isAgyTrustDialog, trustDialogOf, isTrustDialog } from '../src/screen.mjs';
import { kindOfApp, KIND_COMMAND } from '../src/hc/model.mjs';
import { newRuntime, deriveState } from '../src/state.mjs';
import { buildCatalog, resolveModel } from '../src/models.mjs';
import { sleepTarget } from '../src/sleep.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'p192-'));
const SID = '3f6c2a10-5b7e-4d21-9c8a-1e2f3a4b5c6d';
const CONV = '0dbe3f48-b092-4307-9a8b-7f1c5485032b';
const INSTR = { file: 'C:/d/plugin/harness-system-prompt.md', text: HARNESS_PROMPT };

test('P192 어댑터: agy는 --model, 안내문 폴더(--add-dir <데이터>/harness/agy, 그 안 AGENTS.md), 추가 인자. 이어 가기는 --conversation <ID>(모르면 새로)', () => {
  const a = ADAPTERS.agy.build({ sessionId: SID, model: 'gemini-3.8-flash-low', launcherArgs: ['--effort', 'low'], instructions: INSTR, filesDir: 'C:\\d\\harness' });
  assert.deepEqual(a.args, ['--model', 'gemini-3.8-flash-low', '--add-dir', 'C:/d/harness/agy', '--effort', 'low']);
  assert.deepEqual(a.files, [{ file: 'C:/d/harness/agy/AGENTS.md', text: `${HARNESS_PROMPT}\n` }]);
  assert.equal(a.harnessSessionId, null); assert.equal(a.resumed, false);
  const r = ADAPTERS.agy.build({ sessionId: SID, resume: true, harnessSessionId: CONV, model: 'm', instructions: INSTR, filesDir: 'C:/d/harness' });
  assert.deepEqual(r.args.slice(0, 2), ['--conversation', CONV]);
  assert.ok(r.args.includes('--add-dir'), '이어 갈 때도 안내문 폴더를 다시 준다(mustRePass)');
  assert.equal(r.resumed, true); assert.equal(r.harnessSessionId, CONV);
  assert.equal(ADAPTERS.agy.build({ sessionId: SID, resume: true, harnessSessionId: null }).resumed, false, '대화 ID를 모르면 새로');
  assert.deepEqual(ADAPTERS.agy.build({ sessionId: SID }).args, [], '안내문·모델이 없으면 인자 없음');
  assert.equal(ADAPTERS.agy.sessionIdFrom, 'learned');
  assert.deepEqual(ADAPTERS.agy.mustRePass, ['instructions']);
  assert.ok(ADAPTERS.agy.isBoardLine(['agy', '--add-dir', 'C:/d/harness/agy']));
  assert.equal(ADAPTERS.agy.isBoardLine(['agy', '--conversation', CONV]), false);
  assert.ok(resumable('agy'));
  assert.ok(harnessResumable({ origin: 'board', kind: 'agy', harnessPlan: { model: null } }));
});

test('P192 harnessLaunch: agy는 판 env·PATH의 bin·실행 명령(래퍼) 그대로, 연결은 받지 않는다', () => {
  const r = harnessLaunch({ kind: 'agy', startWords: ['mywrap', 'agy'], sessionId: SID, model: 'gemini-3.8-flash-medium', launcherArgs: ['--dangerously-skip-permissions'], instructions: INSTR, boardEnv: { ATRIUM_SESSION_ID: SID }, binDir: 'C:/d/bin', filesDir: 'C:/d/harness' });
  assert.deepEqual(r.command, ['mywrap', 'agy']);
  assert.deepEqual(r.args, ['--model', 'gemini-3.8-flash-medium', '--add-dir', 'C:/d/harness/agy', '--dangerously-skip-permissions']);
  assert.deepEqual(r.env, { ATRIUM_SESSION_ID: SID });
  assert.deepEqual(r.pathFirst, ['C:/d/bin']);
  assert.equal(r.files.length, 1);
  assert.throws(() => harnessLaunch({ kind: 'agy', sessionId: SID, connection: { id: 'c1', name: 'x', protocol: 'openai-chat', baseUrl: 'http://x' } }), (e) => e.code === 'connection_protocol');
  assert.equal(KIND_COMMAND.agy, 'agy');
});

test('P192 판이 정하는 인자: agy의 --conversation·--continue·-c·-p·--print·-i는 호출자 추가 인자·실행 명령에 못 둔다. --model·--effort·--mode는 된다', () => {
  for (const w of ['--conversation', '-c', '--continue', '-p', '--print', '--prompt', '-i', '--prompt-interactive', '--output-format']) assert.equal(reservedArg('agy', [w, 'x']), w, w);
  assert.equal(reservedArg('agy', ['--mode', 'plan', '--effort', 'high', '--sandbox']), null);
  assert.throws(() => normalizeStartCommand('agy --conversation x', 'agy'), (e) => e.key === 'launcherStart.reserved');
  assert.equal(normalizeStartCommand('agy', 'agy'), '', '기본 명령 하나면 비운다');
  assert.equal(normalizeStartCommand('mywrap agy', 'agy'), 'mywrap agy');
});

test('P192 승인 방식: 판의 권한 모드 → AGY 인자(manual 없음, plan·acceptEdits·auto는 --mode, dontAsk·bypassPermissions는 --dangerously-skip-permissions). 호출자 인자에 있으면 호출자 것', () => {
  assert.deepEqual(approvalArgsOf('agy', 'manual'), { args: [], from: 'harness' });
  assert.deepEqual(approvalArgsOf('agy', 'plan').args, ['--mode', 'plan']);
  assert.deepEqual(approvalArgsOf('agy', 'acceptEdits').args, ['--mode', 'accept-edits']);
  assert.deepEqual(approvalArgsOf('agy', 'auto').args, ['--mode', 'auto']);
  assert.deepEqual(approvalArgsOf('agy', 'bypassPermissions'), { args: ['--dangerously-skip-permissions'], from: 'parent' });
  assert.deepEqual(approvalArgsOf('agy', 'dontAsk').args, ['--dangerously-skip-permissions']);
  assert.deepEqual(approvalArgsOf('agy', 'bypassPermissions', ['--mode', 'plan']), { args: [], from: 'launcher' });
  assert.ok(hasApprovalArgs('agy', ['--dangerously-skip-permissions']));
  assert.ok(hasApprovalArgs('agy', ['--mode=auto']));
  assert.equal(hasApprovalArgs('agy', ['--effort', 'low']), false);
  assert.equal(hasApprovalArgs('codex', ['--mode', 'plan']), false, 'codex 표는 그대로');
  assert.deepEqual(AGY_APPROVAL.manual, []);
});

test('P192 호출자: AGY는 모델·노력 수준·승인 방식·추가 인자 칸. 노력·승인은 AGY 인자로 붙고 추가 인자에 같은 것이 있으면 붙이지 않는다', () => {
  assert.deepEqual(HARNESSES.agy.fields, ['startCommand', 'model', 'effort', 'permissionMode', 'args']);
  const l = normalizeLauncher({ name: 'AGY flash', harness: 'agy', model: 'gemini-3.8-flash-low', effort: 'high', permissionMode: 'bypassPermissions', args: '--sandbox' });
  assert.equal(l.effort, 'high'); assert.equal(l.permissionMode, 'bypassPermissions');
  const r = resolveLauncher(l);
  assert.equal(r.kind, 'agy'); assert.equal(r.model, 'gemini-3.8-flash-low'); assert.equal(r.permissionMode, 'bypassPermissions');
  assert.deepEqual(r.args, ['--sandbox', '--effort', 'high', '--dangerously-skip-permissions']);
  assert.equal(previewLauncher(l).line, 'agy --model gemini-3.8-flash-low --sandbox --effort high --dangerously-skip-permissions');
  // 함께 준 값이 호출자 값을 덮는다(atrium spawn --mode plan)
  assert.deepEqual(resolveLauncher(l, { permissionMode: 'plan', effort: 'low' }).args, ['--sandbox', '--effort', 'low', '--mode', 'plan']);
  // 추가 인자에 같은 인자가 있으면 그것이 이긴다
  const m = normalizeLauncher({ name: 'AGY m', harness: 'agy', effort: 'high', permissionMode: 'acceptEdits', args: '--effort max --mode auto' });
  assert.deepEqual(resolveLauncher(m).args, ['--effort', 'max', '--mode', 'auto']);
  // manual·빈 노력은 아무것도 붙이지 않는다
  assert.deepEqual(resolveLauncher(normalizeLauncher({ name: 'AGY', harness: 'agy' })).args, []);
  assert.deepEqual(harnessOptionArgs('codex', { effort: 'high', permissionMode: 'plan' }), [], '다른 하네스는 그대로');
  // codex 호출자는 그대로(노력·승인 칸이 없다)
  const c = resolveLauncher(normalizeLauncher({ name: 'Codex', harness: 'codex', model: 'gpt-6-astra', args: '--search' }));
  assert.deepEqual(c.args, ['--search']); assert.equal(c.permissionMode, undefined);
});

test('P192 다른 종류 하위(atrium child --kind agy): 레일의 AGY 호출자를 바탕으로, 부모 권한 모드를 AGY 인자로', () => {
  const lists = { items: [{ id: 'a1', name: 'AGY', harness: 'agy', model: 'gemini-3.8-flash-medium', effort: '', permissionMode: 'manual', args: '' }], favorites: ['a1'] };
  const p = otherKindPlan({ route: { type: 'kind', kind: 'agy' }, permissionMode: 'bypassPermissions', lists });
  assert.equal(p.model, 'gemini-3.8-flash-medium');
  assert.deepEqual(p.args, ['--dangerously-skip-permissions']);
  assert.equal(p.record.approvalFrom, 'parent');
  const q = otherKindPlan({ route: { type: 'kind', kind: 'agy' }, permissionMode: 'manual', lists });
  assert.deepEqual(q.args, []); assert.equal(q.record.approvalFrom, 'harness');
  // 부모의 승인 인자가 붙으면 호출자 칸(manual)은 그 위에 붙지 않는다
  assert.deepEqual(resolveLauncher({ ...lists.items[0], args: p.args.join(' ') }, { permissionMode: 'bypassPermissions' }).args, ['--dangerously-skip-permissions']);
});

test('P192 명령줄 붙여 넣기: agy 줄은 agy 하네스(모델은 추가 인자), 판이 정하는 인자는 뺀다', () => {
  const r = parseCommandLine('agy --model gemini-3.8-flash-low --conversation abc --sandbox', { kinds: ['claude', 'codex', 'agy'] });
  assert.equal(r.launcher.harness, 'agy');
  assert.ok(r.recognized.dropped.includes('--conversation'));
  assert.ok(!r.launcher.args.includes('--conversation'));
});

test('P192 하네스 표: agy는 연결 프로토콜이 없고, 읽어 온 모델 목록(agy models)을 쓴다', () => {
  const hs = describeHarnesses({ agy: { models: ['gemini-4-argon-high'], hidden: [], labels: { 'gemini-4-argon-high': 'Gemini 4 Argon (High)' }, source: 'agy' } });
  const a = hs.find((h) => h.id === 'agy');
  assert.deepEqual(a.protocols, []);
  assert.deepEqual(a.models, ['gemini-4-argon-high']);
  assert.equal(a.modelLabels['gemini-4-argon-high'], 'Gemini 4 Argon (High)');
  const cat = buildCatalog({ launchers: [], harnessModels: { agy: ['gemini-4-argon-high', 'claude-opus-5-5-high'] } });
  const e = cat.entries.find((x) => x.harness === 'agy' && x.model === 'gemini-4-argon-high');
  assert.equal(e.command, 'atrium child <이름> --kind agy --model gemini-4-argon-high');
  const r = resolveModel('gemini 4 argon high', cat, { kind: 'agy' });
  assert.ok(r.ok); assert.equal(r.entry.model, 'gemini-4-argon-high');
});

test('P192 모델 목록: agy models 출력(첫 줄 안내, ID\\t이름) → 목록과 보이는 이름. 빈 출력은 실패', () => {
  const out = 'Fetching available models...\ngemini-4-argon-medium\tGemini 4 Argon (Medium)\ngemini-3.8-flash-low\tGemini 3.8 Flash (Low)\nclaude-opus-5-5-high\tClaude Opus 5.5 (High)\n\n';
  const r = parseAgyModels(out);
  assert.equal(r.ok, true);
  assert.deepEqual(r.models, ['gemini-4-argon-medium', 'gemini-3.8-flash-low', 'claude-opus-5-5-high']);
  assert.equal(r.labels['gemini-3.8-flash-low'], 'Gemini 3.8 Flash (Low)');
  assert.deepEqual(parseAgyModels('Fetching available models...\n'), { ok: false, why: 'empty' });
});

test('P192 모델 목록: 처음 읽기는 고정 목록을 주고 뒤에서 한 번 받는다(동시에 하나). TTL 안에서는 다시 띄우지 않고, 실패하면 고정 목록', async () => {
  let t = 1000, runs = 0;
  const m = new AgyModels({ fallback: ['fb'], now: () => t, ttlMs: 60000, failMs: 10000, run: async () => { runs++; return 'x-1\tX 1\nx-2\tX 2\n'; } });
  assert.deepEqual(m.read().models, ['fb']); assert.equal(m.read().source, 'default');
  await m.refresh();
  assert.equal(runs, 1, '읽기 두 번과 refresh가 띄운 것은 한 번');
  assert.deepEqual(m.read().models, ['x-1', 'x-2']); assert.equal(m.read().source, 'agy');
  t += 30000; m.read(); await m.refresh(); assert.equal(runs, 1, 'TTL 안');
  t += 40000; await m.refresh(); assert.equal(runs, 2, 'TTL 뒤');
  const bad = new AgyModels({ fallback: ['fb'], now: () => t, run: async () => { throw Object.assign(new Error('no'), { code: 'ENOENT' }); } });
  await bad.refresh();
  assert.deepEqual(bad.read(), { source: 'default', why: 'missing', models: ['fb'], hidden: [], labels: {} });
});

test('P192 대화 ID 알기: 띄운 뒤 생긴 conversations/<ID>.db 가운데 그 폴더 주소가 든 것. 하위 폴더·다른 폴더·옛 대화·다른 판 세션의 것은 아니다', () => {
  const home = tmp(); const conv = path.join(home, 'conversations'); fs.mkdirSync(conv);
  const cwd = path.join(home, 'work', 'proj');
  const uri = agyWorkspaceUri(cwd);
  assert.match(uri, /^file:\/\/\/.*\/work\/proj$/);
  const put = (id, body) => fs.writeFileSync(path.join(conv, `${id}.db`), Buffer.concat([Buffer.from('SQLite format 3\0'), Buffer.from(body, 'latin1')]));
  const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222', C = '33333333-3333-4333-8333-333333333333';
  put(A, `\x12<${uri.toUpperCase()}\x1a$`); // 대소문자는 가리지 않는다
  put(B, `\x12<${uri}/sub\x1a$`); // 하위 폴더
  put(C, `\x12<${agyWorkspaceUri(path.join(home, 'other'))}\x1a`);
  const since = Date.now() - 1000;
  assert.equal(agySessionOf({ cwd, since, home }), A);
  assert.equal(agySessionOf({ cwd, since, home, exclude: [A] }), null, '다른 판 세션이 가진 대화');
  assert.equal(agySessionOf({ cwd, since: Date.now() + 60000, home }), null, '띄우기 전에 생긴 대화');
  assert.equal(agySessionOf({ cwd: path.join(cwd, 'sub'), since, home }), B);
  assert.equal(agySessionOf({ cwd, since, home: path.join(home, 'none') }), null, '기록 폴더가 없다');
});

test('P192 대화 ID 알기: 같은 폴더에 새 대화가 둘이면 last_conversations.json이 적은 것, 없으면 띄운 때와 가까운 것', () => {
  const home = tmp(); const conv = path.join(home, 'conversations'); fs.mkdirSync(conv); fs.mkdirSync(path.join(home, 'cache'));
  const cwd = path.join(home, 'p');
  const A = 'aaaaaaaa-1111-4111-8111-111111111111', B = 'bbbbbbbb-2222-4222-8222-222222222222';
  for (const id of [A, B]) fs.writeFileSync(path.join(conv, `${id}.db`), `x${agyWorkspaceUri(cwd)}\x00`);
  const since = Date.now();
  assert.ok([A, B].includes(agySessionOf({ cwd, since, home })));
  fs.writeFileSync(path.join(home, 'cache', 'last_conversations.json'), JSON.stringify({ [cwd.toUpperCase()]: B.toUpperCase() }));
  assert.equal(agySessionOf({ cwd, since, home }), B);
  fs.writeFileSync(path.join(home, 'cache', 'last_conversations.json'), '{bad');
  assert.ok([A, B].includes(agySessionOf({ cwd, since, home })), '읽지 못하면 가까운 것');
});

test('P192 신뢰 질문: AGY 화면("Do you trust the contents of this project?" + "Yes, I trust this folder")은 trust_wait, Claude 신뢰 글과 섞지 않는다', () => {
  const scr = 'Accessing workspace:\n\nC:\\x\\mtask\n\nDo you trust the contents of this project?\n\nAntigravity CLI requires permission to read, edit, and execute files here.\n\n> Yes, I trust this folder\n  No, exit\n';
  assert.ok(isAgyTrustDialog(scr));
  assert.ok(trustDialogOf('agy', scr));
  assert.equal(trustDialogOf('claude', scr), false);
  assert.equal(trustDialogOf('codex', scr), false);
  assert.equal(isTrustDialog(scr), false);
  assert.equal(isAgyTrustDialog('Do you trust the contents of this project?'), false, '선택지까지 보여야');
  const rt = newRuntime({ kind: 'agy', hooked: false });
  rt.term.status = 'blocked';
  assert.equal(deriveState(rt).state, 'waiting', '화면을 보기 전에는 응답 필요');
  rt.trustScreen = { at: 1 };
  assert.deepEqual(deriveState(rt), { state: 'trust_wait', confirmedByScreen: true });
  const cx = newRuntime({ kind: 'codex', hooked: false }); cx.term.status = 'blocked'; cx.trustScreen = { at: 1 };
  assert.equal(deriveState(cx).state, 'waiting', 'codex는 그대로');
});

test('P192 7501: AGY는 앱 이름 antigravity로 상태를 알린다 → 판의 종류 agy', () => {
  assert.equal(kindOfApp('antigravity'), 'agy');
  assert.equal(kindOfApp('claude-code'), 'claude');
  assert.equal(kindOfApp('codex'), 'codex');
});

test('P192 잠재우기: 판이 띄운 AGY 세션은 대화 ID를 알면 잠재울 수 있다(codex와 같은 규칙)', () => {
  assert.equal(sleepTarget({ kind: 'agy', hooked: false, harness: true, convKnown: true, state: 'ready', idleSince: 0 }, { mode: 'hand' }), null);
  assert.notEqual(sleepTarget({ kind: 'agy', hooked: false, harness: false, convKnown: true, state: 'ready' }, { mode: 'hand' }), null);
});

test('P192 pi 회귀: 연결 확장(-e)·--session-id·--model <제공자>/<모델>·--append-system-prompt, 이어 가기도 같은 값. 연결 없으면 -e 없음', () => {
  const dir = tmp();
  const c = { id: 'c1', name: 'local', protocol: 'openai-chat', baseUrl: 'http://127.0.0.1:9/v1', auth: { env: 'LOCAL_KEY' } };
  const r = harnessLaunch({ kind: 'pi', sessionId: SID, model: 'glm-flash', instructions: INSTR, connection: c, connectionModels: ['glm-flash', 'glm-air'], filesDir: dir });
  const ext = path.join(dir, 'pi-c1.mjs').split('\\').join('/');
  assert.deepEqual(r.args, ['--session-id', SID, '-e', ext, '--model', `${providerIdOf(c)}/glm-flash`, '--append-system-prompt', INSTR.file]);
  assert.equal(r.harnessSessionId, SID);
  assert.match(r.files[0].text, /registerProvider\("atrium_c1"/);
  assert.match(piExtensionText(c, ['glm-flash']), /"apiKey": "\$LOCAL_KEY"/);
  assert.match(piExtensionText({ ...c, auth: null }, ['m']), /"apiKey": "atrium-no-key"/);
  const again = harnessLaunch({ kind: 'pi', sessionId: SID, resume: true, model: 'glm-flash', instructions: INSTR, connection: c, connectionModels: [], filesDir: dir });
  assert.deepEqual(again.args, r.args, '이어 가기도 같은 값(같은 세션 ID로 이어 간다)');
  assert.equal(again.resumed, true);
  const plain = harnessLaunch({ kind: 'pi', sessionId: SID, model: 'openai/gpt-x', instructions: INSTR });
  assert.deepEqual(plain.args, ['--session-id', SID, '--model', 'openai/gpt-x', '--append-system-prompt', INSTR.file]);
  assert.throws(() => harnessLaunch({ kind: 'pi', sessionId: SID, connection: c }), (e) => e.code === 'pi_extension_missing', '확장 파일 폴더가 없으면 띄우지 않는다');
  // 실행 명령으로 secret-run 감싸기(키는 grant가 넣는다): 첫 낱말은 secret-run, 판의 인자는 그 뒤
  assert.equal(normalizeStartCommand('secret-run mygrant -- pi', 'pi'), 'secret-run mygrant -- pi');
  const w = harnessLaunch({ kind: 'pi', startWords: ['secret-run', 'mygrant', '--', 'pi'], sessionId: SID, instructions: INSTR });
  assert.deepEqual(w.command, ['secret-run', 'mygrant', '--', 'pi']);
  assert.deepEqual(w.args.slice(0, 2), ['--session-id', SID]);
  assert.equal(reservedArg('pi', ['--session-id', 'x']), '--session-id');
  assert.equal(adapterOf('pi').command, 'pi');
});
