// 새 세션 기본값 단위 시험: 설정의 claude*, codexArgs 값 확인. session.spawn이 이 값을 쓰는지는 개발용 판에서 본다(herdr와 claude가 필요)
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePatch, DEFAULTS, Settings } from '../src/settings.mjs';

test('새 세션 기본값: 처음에는 비어 있고 권한은 manual', () => {
  assert.equal(DEFAULTS.claudeModel, '');
  assert.equal(DEFAULTS.claudeEffort, '');
  assert.equal(DEFAULTS.claudePermissionMode, 'manual');
  assert.equal(DEFAULTS.claudeAllowHerdr, false);
  assert.equal(DEFAULTS.codexArgs, '');
});

test('새 세션 기본값: 모델 이름, 노력 수준, 권한 모드, Codex 인자를 확인한다', () => {
  assert.deepEqual(normalizePatch({ claudeModel: ' claude-opus-5-5[1m] ' }), { claudeModel: 'claude-opus-5-5[1m]' });
  assert.deepEqual(normalizePatch({ claudeModel: '' }), { claudeModel: '' });
  assert.throws(() => normalizePatch({ claudeModel: 'opus --dangerously-skip-permissions' }), /claudeModel/);
  assert.deepEqual(normalizePatch({ claudeEffort: 'high' }), { claudeEffort: 'high' });
  assert.deepEqual(normalizePatch({ claudeEffort: '' }), { claudeEffort: '' });
  assert.throws(() => normalizePatch({ claudeEffort: 'huge' }), /claudeEffort/);
  assert.deepEqual(normalizePatch({ claudePermissionMode: 'acceptEdits' }), { claudePermissionMode: 'acceptEdits' });
  assert.throws(() => normalizePatch({ claudePermissionMode: 'yolo' }), /claudePermissionMode/);
  assert.deepEqual(normalizePatch({ claudeAllowHerdr: 'on' }), { claudeAllowHerdr: true });
  assert.deepEqual(normalizePatch({ codexArgs: ' -m gpt-5 -c model_reasoning_effort=low ' }), { codexArgs: '-m gpt-5 -c model_reasoning_effort=low' });
  assert.throws(() => normalizePatch({ codexArgs: 'x'.repeat(301) }), /codexArgs/);
});

test('새 세션 기본값: 설정 화면이 고를 값을 describe로 받는다', () => {
  const meta = new Map();
  const s = new Settings({ store: { getMeta: (k) => meta.get(k), setMeta: (k, v) => meta.set(k, v) }, broadcast: () => {} });
  const d = s.describe();
  assert.deepEqual(d.claudeEffort.options, ['', 'low', 'medium', 'high', 'xhigh', 'max']);
  assert.ok(d.claudePermissionMode.options.includes('manual'));
  assert.equal(d.codexArgs.max, 300);
  assert.equal(s.set({ key: 'claudeModel', value: 'opus' }).claudeModel, 'opus');
  assert.equal(s.get().claudeModel, 'opus');
});
