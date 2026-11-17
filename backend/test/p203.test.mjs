// P203: AGY 세션 설정(--settings)에 판의 대체 화면(altScreenMode always)을 넣고 사용자 --settings와 합친다
import test from 'node:test';
import assert from 'node:assert/strict';
import { ADAPTERS, agySettingsArgs, AGY_BOARD_SETTINGS, HARNESS_PROMPT } from '../src/harness.mjs';

const INSTR = { file: 'C:/d/plugin/harness-system-prompt.md', text: HARNESS_PROMPT };
const settingsOf = (args) => { const i = args.indexOf('--settings'); return i < 0 ? null : JSON.parse(args[i + 1]); };

test('P203 띄우기: agy 인자에 --settings {"altScreenMode":"always"}가 붙는다(처음과 이어 가기 모두)', () => {
  assert.deepEqual(AGY_BOARD_SETTINGS, { altScreenMode: 'always' });
  const a = ADAPTERS.agy.build({ model: 'm', launcherArgs: ['--effort', 'low'], instructions: INSTR, filesDir: 'C:/d/harness' });
  assert.deepEqual(a.args, ['--model', 'm', '--add-dir', 'C:/d/harness/agy', '--effort', 'low', '--settings', '{"altScreenMode":"always"}']);
  const r = ADAPTERS.agy.build({ resume: true, harnessSessionId: '0dbe3f48-b092-4307-9a8b-7f1c5485032b', model: 'm', launcherArgs: [], instructions: INSTR, filesDir: 'C:/d/harness' });
  assert.deepEqual(settingsOf(r.args), { altScreenMode: 'always' });
  assert.equal(r.args.filter((x) => x === '--settings').length, 1);
});

test('P203 합치기: 사용자 --settings(글 JSON)와 합쳐 하나로 준다. 같은 키는 사용자 값이 이긴다', () => {
  const out = agySettingsArgs(['--effort', 'high', '--settings', '{"enableTerminalSandbox":false}', '--mode', 'auto']);
  assert.deepEqual(out.slice(0, 4), ['--effort', 'high', '--mode', 'auto']);
  assert.deepEqual(settingsOf(out), { altScreenMode: 'always', enableTerminalSandbox: false });
  assert.equal(out.filter((x) => x === '--settings').length, 1);
  assert.deepEqual(settingsOf(agySettingsArgs(['--settings={"altScreenMode":"never","verbosity":"low"}'])), { altScreenMode: 'never', verbosity: 'low' });
  // 둘 이상이면 뒤의 것이 이긴다
  assert.deepEqual(settingsOf(agySettingsArgs(['--settings', '{"a":1,"b":1}', '--settings', '{"b":2}'])), { altScreenMode: 'always', a: 1, b: 2 });
});

test('P203 합치기: 파일 경로 --settings는 그 파일 JSON을 읽어 합친다. 못 읽거나 객체가 아니면 사용자 인자를 그대로 둔다', () => {
  const files = { 'C:/s.json': '{"allowNonWorkspaceAccess":true}' };
  const read = (f) => { if (!(f in files)) throw new Error('ENOENT'); return files[f]; };
  assert.deepEqual(settingsOf(agySettingsArgs(['--settings', 'C:/s.json'], undefined, read)), { altScreenMode: 'always', allowNonWorkspaceAccess: true });
  assert.deepEqual(agySettingsArgs(['--settings', 'C:/none.json'], undefined, read), ['--settings', 'C:/none.json']);
  assert.deepEqual(agySettingsArgs(['--settings', '{bad'], undefined, read), ['--settings', '{bad']);
  assert.deepEqual(agySettingsArgs(['--settings', '[1]'], undefined, read), ['--settings', '[1]']);
  // 값 없는 --settings(마지막 인자)는 빼고 판의 것만 준다
  assert.deepEqual(agySettingsArgs(['--settings']), ['--settings', '{"altScreenMode":"always"}']);
});
