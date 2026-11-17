// P205 창 단위 시험: 새 호출자 틀에서 AGY를 고르면 승인 방식 기본값이 권한 생략, 노력 수준 빈 값의 하네스 이름표(두 사전)
import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultPermission, withHarness, blankLauncher, agySandboxNote, harnessName } from '../src/renderer/lib/launchers.js';
import en from '../src/renderer/locales/en.js';
import ko from '../src/renderer/locales/ko.js';

const H = [{ id: 'claude', kind: 'claude', label: 'Claude Code' }, { id: 'agy', kind: 'agy', label: 'Antigravity' }, { id: 'codex', kind: 'codex', label: 'Codex' }];

test('P205 승인 방식 기본값: AGY는 권한 생략, 나머지는 manual(하네스 목록을 받기 전에도 id로)', () => {
  assert.equal(defaultPermission(H, 'agy'), 'bypassPermissions');
  assert.equal(defaultPermission([], 'agy'), 'bypassPermissions');
  assert.equal(defaultPermission(H, 'claude'), 'manual');
  assert.equal(defaultPermission(H, 'codex'), 'manual');
});

test('P205 새 호출자 틀에서 하네스 바꾸기: 기본값 그대로면 새 하네스의 기본값, 사람이 고른 값과 고치는 호출자는 그대로', () => {
  const a = withHarness(blankLauncher('claude'), 'agy', H);
  assert.equal(a.harness, 'agy'); assert.equal(a.permissionMode, 'bypassPermissions');
  assert.equal(agySandboxNote(H, a.harness, a.permissionMode), false, '기본값이면 샌드박스 안내가 숨는다');
  assert.equal(withHarness(a, 'claude', H).permissionMode, 'manual', '다시 Claude Code로 돌리면 manual');
  const picked = withHarness({ ...blankLauncher('claude'), permissionMode: 'acceptEdits' }, 'agy', H);
  assert.equal(picked.permissionMode, 'acceptEdits', '사람이 고른 값은 둔다');
  assert.equal(agySandboxNote(H, picked.harness, picked.permissionMode), true, '고른 값이 샌드박스 방식이면 안내는 그대로(P203)');
  const editing = withHarness({ ...blankLauncher('claude'), id: 'l1' }, 'agy', H);
  assert.equal(editing.permissionMode, 'manual', '이미 있는 호출자를 고칠 때는 바꾸지 않는다');
});

test('P205 노력 수준 빈 값: 그 하네스 이름의 기본값(두 사전)', () => {
  const fill = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => v[k]);
  assert.equal(fill(en.launcherEffort.harnessDefault, { harness: harnessName(H, 'agy') }), 'Antigravity default');
  assert.equal(fill(ko.launcherEffort.harnessDefault, { harness: harnessName(H, 'agy') }), 'Antigravity 기본값');
  assert.equal(fill(en.launcherEffort.harnessDefault, { harness: harnessName(H, 'claude') }), 'Claude Code default', 'Claude Code는 예전 글과 같다');
  assert.equal(fill(ko.launcherEffort.harnessDefault, { harness: harnessName(H, 'claude') }), 'Claude Code 기본값');
});
