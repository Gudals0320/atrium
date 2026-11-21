// P287: 설정 › 합치기의 승인 방식 칸(lib/merger.js). 목록은 호출자 창의 승인 방식과 같고, 빈 값은 맡긴 세션 따름
import test from 'node:test';
import assert from 'node:assert/strict';
import { MERGER_PERMISSIONS, MERGER_DEFAULTS, mergerSettingsOf, mergerValueOf } from '../src/renderer/lib/merger.js';
import { PERMISSION_MODES } from '../src/renderer/lib/launchers.js';
import en from '../src/renderer/locales/en.js';
import ko from '../src/renderer/locales/ko.js';

test('P287 승인 방식 목록과 기본값', () => {
  assert.deepEqual(MERGER_PERMISSIONS, ['', ...PERMISSION_MODES]);
  assert.equal(MERGER_DEFAULTS.mergerPermission, '');
});

test('P287 설정 값 → 칸: 없음·inherit·모르는 값은 빈 값(맡긴 세션 따름)', () => {
  assert.equal(mergerSettingsOf({ mergerMode: 'on' }).mergerPermission, '');
  assert.equal(mergerSettingsOf({ mergerMode: 'on', mergerPermission: 'inherit' }).mergerPermission, '');
  assert.equal(mergerSettingsOf({ mergerMode: 'on', mergerPermission: 'yolo' }).mergerPermission, '');
  assert.equal(mergerSettingsOf({ mergerMode: 'on', mergerPermission: 'bypassPermissions' }).mergerPermission, 'bypassPermissions');
});

test('P287 칸 → 보낼 값', () => {
  assert.deepEqual(mergerValueOf('mergerPermission', 'dontAsk'), { value: 'dontAsk' });
  assert.deepEqual(mergerValueOf('mergerPermission', ''), { value: '' });
  assert.deepEqual(mergerValueOf('mergerPermission', 'yolo'), { error: 'permission' });
});

test('P287 사전: ko·en 둘 다', () => {
  for (const d of [en, ko]) {
    for (const k of ['permission', 'permissionHint', 'permissionInherit']) assert.ok(d.merger[k], k);
    assert.ok(d.merger.bad.permission);
  }
});
