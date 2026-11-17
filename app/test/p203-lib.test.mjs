// P203 창 단위 시험: AGY 호출자 승인 방식 안내(샌드박스가 atrium을 막는다)와 두 사전 문구
import test from 'node:test';
import assert from 'node:assert/strict';
import { agySandboxNote } from '../src/renderer/lib/launchers.js';
import en from '../src/renderer/locales/en.js';
import ko from '../src/renderer/locales/ko.js';

const H = [{ id: 'claude', kind: 'claude' }, { id: 'agy', kind: 'agy' }, { id: 'codex', kind: 'codex' }];

test('P203 안내: AGY 승인 방식이 manual·acceptEdits·plan·auto면 보이고, 권한 생략(dontAsk·bypassPermissions)이면 숨는다', () => {
  for (const m of ['manual', 'acceptEdits', 'plan', 'auto', '', undefined]) assert.equal(agySandboxNote(H, 'agy', m), true, String(m));
  for (const m of ['dontAsk', 'bypassPermissions']) assert.equal(agySandboxNote(H, 'agy', m), false, m);
  assert.equal(agySandboxNote(H, 'claude', 'manual'), false);
  assert.equal(agySandboxNote(H, 'codex', 'manual'), false);
  assert.equal(agySandboxNote([], 'agy', 'manual'), true, '하네스 목록을 받기 전에도 id로 안다');
});

test('P203 문구: 두 사전에 agySandbox.note가 있고 atrium과 권한 생략 방식 이름이 든다', () => {
  for (const d of [en, ko]) {
    assert.match(d.agySandbox.note, /atrium/);
    assert.match(d.agySandbox.note, /bypassPermissions/);
  }
  assert.match(ko.agySandbox.note, /샌드박스/);
  assert.match(en.agySandbox.note, /sandbox/);
});
