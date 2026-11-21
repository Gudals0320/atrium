// P298: Hermes 하네스의 창 쪽 순수 함수(종류 아이콘, 런처 목록, 보고 물러섬 칸의 종류 기본값)
import test from 'node:test';
import assert from 'node:assert/strict';
import { KINDS, kindOf } from '../src/renderer/lib/kinds.js';
import { ICONS, AGENT_HARNESSES, harnessName, harnessOptions } from '../src/renderer/lib/launchers.js';
import { fallbackDefault, launcherFallback, fallbackValue, orchBody, launcherOrchestrates } from '../src/renderer/lib/orch.js';

const H = [{ id: 'claude', label: 'Claude Code', orchDefault: false, fallbackDefault: null }, { id: 'hermes', label: 'Hermes', orchDefault: true, fallbackDefault: 'last_answer' }];

test('P298 종류: hermes는 아이콘·하네스 목록에 있다(P302부터 로고는 OMH 아이콘)', () => {
  assert.equal(kindOf('hermes'), KINDS.hermes);
  assert.equal(KINDS.hermes.mark, 'H'); assert.equal(KINDS.hermes.logo, 'assets/kinds/hermes.png'); assert.equal(KINDS.hermes.label, 'Hermes');
  assert.ok(ICONS.includes('hermes')); assert.ok(AGENT_HARNESSES.includes('hermes'));
  assert.equal(harnessName(H, 'hermes'), 'Hermes'); assert.equal(harnessName([], 'hermes'), 'Hermes');
  assert.ok(harnessOptions([], []).includes('hermes'));
});

test('P298 보고 물러섬 칸: 종류 기본(hermes last_answer)을 보이고, 끄면 none, 기본과 같으면 칸을 두지 않는다', () => {
  assert.equal(fallbackDefault(H, 'hermes'), 'last_answer'); assert.equal(fallbackDefault(H, 'claude'), null);
  assert.equal(launcherFallback(H, { harness: 'hermes' }), true);
  assert.equal(launcherFallback(H, { harness: 'hermes', reportFallback: 'none' }), false);
  assert.equal(launcherFallback(H, { harness: 'claude' }), false);
  assert.equal(launcherFallback(H, { harness: 'claude', reportFallback: 'last_answer' }), true);
  assert.equal(fallbackValue(H, 'hermes', false), 'none'); assert.equal(fallbackValue(H, 'hermes', true), '');
  assert.equal(fallbackValue(H, 'claude', true), 'last_answer'); assert.equal(fallbackValue(H, 'claude', false), '');
  assert.equal(launcherOrchestrates(H, { harness: 'hermes' }), true);
  assert.deepEqual(orchBody(H, { harness: 'hermes', reportFallback: 'none' }), { reportFallback: 'none' });
});
