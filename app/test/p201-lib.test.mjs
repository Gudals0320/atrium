// P201 창 단위 시험: pi 호출자의 모델 목록(pi --list-models의 제공자/ID). 연결을 고른 pi는 목록을 보이지 않는다
import test from 'node:test';
import assert from 'node:assert/strict';
import { harnessModels, modelChoices } from '../src/renderer/lib/launchers.js';

const harnesses = [
  { id: 'claude', fields: ['model'], models: ['haiku'] },
  { id: 'pi', fields: ['startCommand', 'connection', 'model', 'args'], models: ['anthropic/claude-haiku-5-5', 'deepseek/deepseek-flash'], modelSource: 'pi' },
];

test('P201 pi 호출자 모델 목록: 연결 없이는 pi 목록, 연결을 고르면 빈 목록', () => {
  assert.deepEqual(harnessModels(harnesses, 'pi'), ['anthropic/claude-haiku-5-5', 'deepseek/deepseek-flash']);
  assert.deepEqual(harnessModels(harnesses, 'pi', { connection: '' }), ['anthropic/claude-haiku-5-5', 'deepseek/deepseek-flash']);
  assert.deepEqual(harnessModels(harnesses, 'pi', { connection: 'c1' }), []);
  assert.deepEqual(harnessModels(harnesses, 'claude', { connection: 'c1' }), ['haiku'], '다른 하네스는 그대로');
  assert.deepEqual(modelChoices(harnessModels(harnesses, 'pi'), {}, 'deep'), ['deepseek/deepseek-flash'], '친 글자로 거른다');
});
