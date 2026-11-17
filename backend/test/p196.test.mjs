// P196 백엔드 단위 시험: AGY 하네스는 화면 이름 Antigravity로 하네스 표(launcher.list의 harnesses)에 든다
import test from 'node:test';
import assert from 'node:assert/strict';
import { HARNESSES, describeHarnesses, harnessOf } from '../src/launchers.mjs';
import { KIND_COMMAND } from '../src/hc/model.mjs';

test('P196 하네스 표: agy가 이름 Antigravity로 들고, 터미널 종류 목록에도 있다', () => {
  assert.equal(HARNESSES.agy.label, 'Antigravity');
  assert.equal(harnessOf('agy').label, 'Antigravity');
  const d = describeHarnesses();
  const agy = d.find((h) => h.id === 'agy');
  assert.ok(agy, 'describeHarnesses에 agy');
  assert.equal(agy.label, 'Antigravity');
  assert.equal(KIND_COMMAND.agy, 'agy');
});
