// P238 단위 시험: 띄운 지 곧바로 종료 코드 2로 끝난 하네스는 띄우기 인자 오류로 의심하고 그 명령 줄을 알린다(launchArgsSuspect).
// P249: 옛 rig 자리의 Codex 인자(codexArgsAmp) 시험은 걷어냈다(새 rig의 무인 인자는 p249.test.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { launchArgsSuspect, commandLine, badArgsText, QUICK_EXIT_MS } from '../src/unit-stops.mjs';

test('P238 launchArgsSuspect: 띄운 지 곧바로 종료 코드 2만. 명령 줄은 빈칸 있는 낱말을 따옴표로', () => {
  const rt = { agentStartedAt: 10000, launchArgv: ['codex', '--approve-for-me', '-c', 'model_reasoning_effort=high', '--sandbox', 'workspace-write', 'a b'] };
  const x = launchArgsSuspect(rt, { kind: 'other', code: 2, at: 10800 });
  assert.equal(x.code, 2); assert.equal(x.ms, 800);
  assert.equal(x.line, 'codex --approve-for-me -c model_reasoning_effort=high --sandbox workspace-write "a b"');
  assert.match(badArgsText(x), /^띄우기 인자가 잘못됐을 수 있다\(launch arguments may be invalid\): 띄운 지 0\.8초 만에 종료 코드 2\. 명령 줄: codex --approve-for-me/);
  assert.equal(launchArgsSuspect(rt, { kind: 'other', code: 1, at: 10800 }), null, '코드 1');
  assert.equal(launchArgsSuspect(rt, { kind: 'other', code: 2, at: 10000 + QUICK_EXIT_MS + 1 }), null, '오래 돈 뒤');
  assert.equal(launchArgsSuspect(rt, { kind: 'other', at: 10800 }), null, '코드 모름');
  assert.equal(launchArgsSuspect({ launchedAt: 10000 }, { code: 2, at: 10500 }).line, null, '명령 줄을 모르면 글만');
  assert.equal(commandLine(['x', 'say "hi"']), 'x "say \\"hi\\""');
});
