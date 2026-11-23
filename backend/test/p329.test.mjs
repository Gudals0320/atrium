// P329: omo(OmO) 하네스. 어댑터 build(새로·이어 가기·모델·노력·안내문), 예약 인자 거절, 런처(칸·미리보기·노력 옮기기·명령줄 붙여 넣기),
//   입력 칸 읽기, 세션 파일의 모델 기록(서비스 등급 확장), Codex 모델 목록, 오케스트레이션 기본값
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ADAPTERS, harnessLaunch, reservedArg, omoEffortOf, thinkingIn, piLike, resumable } from '../src/harness.mjs';
import { HARNESSES, normalizeLauncher, resolveLauncher, previewLauncher, effortArgsOf, effortIgnoredLine, parseCommandLine } from '../src/launchers.mjs';
import { omoInputBox } from '../src/screen.mjs';
import { lineModel, refreshModel, findPiSession, readPiLastAnswer, resumeModel } from '../src/model-now.mjs';
import { parseOmoModels } from '../src/omo-models.mjs';
import { orchOf, launcherOrch } from '../src/orchestration.mjs';
import { innerWork, procsCpuMs } from '../src/inner-work.mjs';
import { KIND_COMMAND } from '../src/hc/model.mjs';

const SID = '6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b';
const INSTR = { file: 'C:/board/harness/prompt.md', text: '보드 안내' };

test('P329 어댑터: 새로 띄우기는 --session-id·--model·--thinking·--append-system-prompt(파일)·호출자 인자 차례', () => {
  const r = ADAPTERS.omo.build({ sessionId: SID, model: 'chatgpt-subscription/gpt-6-luna-fast', effort: 'low', instructions: INSTR, launcherArgs: ['--name', 'x'] });
  assert.deepEqual(r.args, ['--session-id', SID, '--model', 'chatgpt-subscription/gpt-6-luna-fast', '--thinking', 'low', '--append-system-prompt', INSTR.file, '--name', 'x']);
  assert.equal(r.harnessSessionId, SID);
  assert.equal(r.resumed, false);
  assert.deepEqual(r.env, {});
});

test('P329 어댑터: 이어 가기도 같은 ID(--session-id는 있으면 이어 간다)와 안내문을 다시 준다(mustRePass)', () => {
  const r = ADAPTERS.omo.build({ sessionId: SID, resume: true, harnessSessionId: SID, model: 'chatgpt-subscription/gpt-6.2-sol', effort: 'high', instructions: INSTR });
  assert.deepEqual(r.args, ['--session-id', SID, '--model', 'chatgpt-subscription/gpt-6.2-sol', '--thinking', 'high', '--append-system-prompt', INSTR.file]);
  assert.equal(r.resumed, true);
  assert.ok(ADAPTERS.omo.mustRePass.includes('instructions'));
  assert.equal(ADAPTERS.omo.sessionIdFrom, 'board');
  assert.ok(resumable('omo'));
  assert.ok(ADAPTERS.omo.isBoardLine(r.args));
});

test('P329 어댑터: 모델·노력·안내문이 없으면 그 인자도 없다. 호출자 인자의 --thinking이 노력 칸을 이긴다. 받지 않는 노력 값은 뺀다', () => {
  assert.deepEqual(ADAPTERS.omo.build({ sessionId: SID }).args, ['--session-id', SID]);
  assert.deepEqual(ADAPTERS.omo.build({ sessionId: SID, effort: 'high', launcherArgs: ['--thinking', 'max'] }).args, ['--session-id', SID, '--thinking', 'max']);
  assert.deepEqual(ADAPTERS.omo.build({ sessionId: SID, effort: 'ultra' }).args, ['--session-id', SID]);
  assert.deepEqual(ADAPTERS.omo.build({ sessionId: SID, effort: 'none' }).args, ['--session-id', SID, '--thinking', 'off']);
});

test('P329 harnessLaunch: 명령은 omo(실행 명령이 있으면 그것), 판 env와 PATH 앞 bin, 하네스 env 없음', () => {
  const r = harnessLaunch({ kind: 'omo', sessionId: SID, model: 'chatgpt-subscription/gpt-6-luna', effort: 'low', instructions: INSTR, boardEnv: { ATRIUM_SESSION_ID: SID }, binDir: 'C:/board/bin' });
  assert.deepEqual(r.command, ['omo']);
  assert.equal(r.env.ATRIUM_SESSION_ID, SID);
  assert.deepEqual(r.pathFirst, ['C:/board/bin']);
  assert.equal(r.harnessSessionId, SID);
  const w = harnessLaunch({ kind: 'omo', startWords: ['mywrap', 'omo'], sessionId: SID });
  assert.deepEqual(w.command, ['mywrap', 'omo']);
  assert.equal(KIND_COMMAND.omo, 'omo');
});

test('P329 예약 인자: 세션·이어 가기·출력 방식·하위 명령은 호출자 인자에 둘 수 없다', () => {
  for (const a of ['--session', '--session-id', '-c', '--continue', '-r', '--resume', '--fork', '--rebind', '--no-session', '-p', '--mode', '--session-dir', 'update', 'login', 'thread']) assert.equal(reservedArg('omo', [a, 'x']), a, a);
  assert.equal(reservedArg('omo', ['--session-id=abc']), '--session-id=abc');
  assert.equal(reservedArg('omo', ['--thinking', 'low', '--name', 'x', '--tools', 'read']), null);
  assert.throws(() => normalizeLauncher({ name: 'OmO', harness: 'omo', args: '--session x' }), (e) => e.key === 'launchers.err.argsReserved');
});

test('P329 노력 수준 이름: omo --thinking 값과 흔한 다른 이름', () => {
  assert.equal(omoEffortOf('low'), 'low');
  assert.equal(omoEffortOf('XHigh'), 'xhigh');
  assert.equal(omoEffortOf('none'), 'off');
  assert.equal(omoEffortOf('x-high'), 'xhigh');
  assert.equal(omoEffortOf('ultra'), null);
  assert.equal(omoEffortOf(''), null);
  assert.equal(thinkingIn(['--thinking=high']), 'high');
  assert.equal(thinkingIn(['--model', 'm']), null);
  assert.ok(piLike('omo') && piLike('pi') && !piLike('codex'));
});

test('P329 런처: 칸(실행 명령·모델·노력·추가 인자), 노력 목록, 저장·띄울 값·미리보기', () => {
  const h = HARNESSES.omo;
  assert.deepEqual(h.fields, ['startCommand', 'model', 'effort', 'args']);
  assert.deepEqual(h.efforts, ['', 'off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']);
  assert.ok(h.freeModel);
  const l = normalizeLauncher({ name: 'OmO Codex', harness: 'omo', model: 'chatgpt-subscription/gpt-6-luna-fast', effort: 'low', args: '--name board' });
  assert.equal(l.effort, 'low');
  assert.throws(() => normalizeLauncher({ name: 'x', harness: 'omo', effort: 'ultra' }), (e) => e.key === 'launchers.err.effort');
  const r = resolveLauncher(l);
  assert.equal(r.kind, 'omo');
  assert.equal(r.model, 'chatgpt-subscription/gpt-6-luna-fast');
  assert.equal(r.effort, 'low');
  assert.deepEqual(r.args, ['--name', 'board']);
  assert.equal(resolveLauncher(l, { effort: 'high' }).effort, 'high');
  assert.equal(previewLauncher(l).line, 'omo --model chatgpt-subscription/gpt-6-luna-fast --thinking low --name board');
  assert.equal(previewLauncher({ ...l, args: '--thinking max' }).line, 'omo --model chatgpt-subscription/gpt-6-luna-fast --thinking max');
});

test('P329 atrium child --effort: omo는 인자를 바꾸지 않고 값만 맞춘다(어댑터가 --thinking). 받지 않는 값·런처 --thinking이면 무시', () => {
  assert.deepEqual(effortArgsOf('omo', 'low', ['--name', 'x']), { args: ['--name', 'x'], applied: true, effort: 'low' });
  const bad = effortArgsOf('omo', 'ultra', []);
  assert.equal(bad.ignored, true);
  assert.match(effortIgnoredLine('omo', 'ultra', bad.why), /omo는 off, minimal, low/);
  const own = effortArgsOf('omo', 'low', ['--thinking', 'max']);
  assert.equal(own.ignored, true);
  assert.match(effortIgnoredLine('omo', own.effort, own.why), /--thinking max/);
});

test('P329 명령줄 붙여 넣기: omo … → omo 하네스(모델·노력 칸), 판이 정하는 인자는 뺀다', () => {
  const r = parseCommandLine('omo --model chatgpt-subscription/gpt-6.2-sol --thinking medium -c --name t', { kinds: ['claude', 'codex', 'omo'] });
  assert.equal(r.launcher.harness, 'omo');
  assert.equal(r.launcher.model, 'chatgpt-subscription/gpt-6.2-sol');
  assert.equal(r.launcher.effort, 'medium');
  assert.equal(r.launcher.args, '--name t');
  assert.equal(r.recognized.as, 'kind');
  assert.ok(r.recognized.dropped.includes('-c'));
  const w = parseCommandLine('C:\\tools\\omo.exe --thinking weird', { kinds: ['omo'] });
  assert.equal(w.launcher.harness, 'omo');
  assert.equal(w.launcher.effort, '');
  assert.ok(w.recognized.dropped.includes('--thinking weird'));
});

const SCREEN = [' Settings: settings.json (JSON)', '', '─'.repeat(80), '❯ ', '─'.repeat(80), 'C:\\x • $0.000 (sub) • 0/500K (0.0%) (auto)        ⚡ gpt-6-luna • effort low (shift+tab)', '(😺 OmO Native by Q Kim) done'].join('\n');
test('P329 입력 칸: 두 가로줄 사이의 "❯ " 뒤 글(빈 칸이면 빈 글)', () => {
  const e = omoInputBox(SCREEN);
  assert.equal(e.found, true);
  assert.equal(e.text, '');
  assert.equal(e.rows, 0);
  const t = omoInputBox(SCREEN.replace('❯ ', '❯ hello board'));
  assert.equal(t.text, 'hello board');
  assert.equal(t.rows, 1);
  assert.equal(omoInputBox('no box here').found, false);
});

test('P329 세션 파일: 모델·생각 수준, 서비스 등급 확장이 바꿔 적은 줄은 띄운 이름(-fast)을 지킨다, 마지막 답', () => {
  const lines = [
    '{"type":"session","version":3,"id":"' + SID + '","cwd":"C:\\\\t"}',
    '{"type":"model_change","provider":"chatgpt-subscription","modelId":"gpt-6-luna-fast"}',
    '{"type":"thinking_level_change","thinkingLevel":"low"}',
    '{"type":"model_change","provider":"chatgpt-subscription","modelId":"gpt-6-luna","originalProvider":"chatgpt-subscription","originalModelId":"gpt-6-luna-fast","source":"extension","actor":"<builtin:service-tier>"}',
    '{"type":"message","message":{"role":"user","content":[{"type":"text","text":"hi"}]}}',
    '{"type":"message","message":{"role":"assistant","content":[{"type":"text","text":"pong"}]},"timestamp":"2026-11-23T05:30:00.000Z"}',
  ];
  assert.deepEqual(lineModel('omo', lines[3]), { model: 'chatgpt-subscription/gpt-6-luna-fast' });
  assert.deepEqual(lineModel('omo', '{"type":"model_change","provider":"chatgpt-subscription","modelId":"gpt-6.2-sol"}'), { model: 'chatgpt-subscription/gpt-6.2-sol' });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'p329-'));
  try {
    const sub = path.join(dir, '--C--t--'); fs.mkdirSync(sub);
    const file = path.join(sub, `2026-11-23T05-22-44-294Z_${SID}.jsonl`);
    fs.writeFileSync(file, lines.join('\n') + '\n');
    assert.equal(findPiSession(dir, SID), file);
    const st = refreshModel('omo', file);
    assert.equal(st.model, 'chatgpt-subscription/gpt-6-luna-fast');
    assert.equal(st.effort, 'low');
    assert.equal(readPiLastAnswer(file).text, 'pong');
    // 이어 갈 때: 지금 값(세션 파일)이 띄운 값과 같으면 띄운 값, 노력은 지금 값
    assert.deepEqual(resumeModel('omo', { model: 'chatgpt-subscription/gpt-6-luna-fast' }, { model: st.model, effort: st.effort }), { model: 'chatgpt-subscription/gpt-6-luna-fast', effort: 'low', from: { model: 'launched', effort: 'now' } });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('P329 Codex 모델 목록: omo --list-models chatgpt-subscription 표 → 그 제공자 줄만', () => {
  const t = ['provider              model                  context  max-out  thinking  images', 'chatgpt-subscription  gpt-6-luna-fast        922K     128K     yes       yes', 'chatgpt-subscription  gpt-6.2-sol            500K     128K     yes       yes', 'openrouter            openai/gpt-x           1M       1M       yes       yes'].join('\n');
  assert.deepEqual(parseOmoModels(t), { ok: true, models: ['chatgpt-subscription/gpt-6-luna-fast', 'chatgpt-subscription/gpt-6.2-sol'], labels: {} });
  assert.equal(parseOmoModels('nothing').ok, false);
});

test('P329 바쁨 CPU 단위: 프로세스 표의 CPU(100ns)를 ms로 바꿔 잰다(쉬는 omo의 1% 미만은 조용, 10%는 바쁨)', () => {
  const now = 1_000_000_000;
  const table = (ticks) => new Map([[10, { pid: 10, ppid: 1, name: 'omo.exe', created: now - 600000, cpu: ticks }]]);
  assert.equal(procsCpuMs(table(25_000_000)).get(10).cpu, 2500);
  const p0 = innerWork({ procs: procsCpuMs(table(1_000_000)), root: 10, now: now - 10000, signals: ['cpu'] });
  // 10초에 0.08초(0.8%, 이 PC에서 쉬는 omo를 잰 값)
  assert.equal(innerWork({ procs: procsCpuMs(table(1_800_000)), root: 10, now, prev: p0, signals: ['cpu'] }).busy, false);
  // 10초에 1초(10%)
  assert.deepEqual(innerWork({ procs: procsCpuMs(table(11_000_000)), root: 10, now, prev: p0, signals: ['cpu'] }).why, ['cpu']);
  assert.equal(procsCpuMs(null), null);
});

test('P329 자체 오케스트레이션 기본: omo는 켬, 마지막 답으로 보고 물러섬, 바쁨은 기본(proctree·cpu). 런처 칸이 이긴다', () => {
  assert.deepEqual(orchOf('omo', null), { on: true, via: 'kind', reportFallback: 'last_answer', busy: ['proctree', 'cpu'] });
  assert.equal(orchOf('omo', { orchestrates: false }), null);
  assert.deepEqual(launcherOrch({}, 'omo'), { orchestrates: true, via: 'kind' });
});
