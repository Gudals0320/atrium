// P22 창 단위 시험: Delete 키로 닫을 대상, 그룹·한 줄 메모 사전 열쇠가 남지 않았는지
import test from 'node:test';
import assert from 'node:assert/strict';
import en from '../src/renderer/locales/en.js';
import ko from '../src/renderer/locales/ko.js';
import { closeKeyTargets } from '../src/renderer/lib/keys.js';
import { WAIT_REASON_LABEL } from '../src/renderer/lib/labels.js';
import { STOP_REASON } from '../src/renderer/lib/items.js';

const sessions = new Map([['a', {}], ['b', {}], ['c', {}]]);
const key = (k, extra = {}) => ({ key: k, ctrlKey: false, altKey: false, metaKey: false, shiftKey: false, isComposing: false, ...extra });

test('Delete: 하나를 고르면 그 노드, 여럿이면 한 확인창에 모두. 세션이 아닌 것과 판에 없는 것은 뺀다', () => {
  assert.deepEqual(closeKeyTargets(key('Delete'), { selected: ['a'], sessions }), { one: 'a' });
  assert.deepEqual(closeKeyTargets(key('Delete'), { selected: ['a', 'gone', 'c'], sessions }), { many: ['a', 'c'] });
  assert.deepEqual(closeKeyTargets(key('Delete'), { selected: ['gone', 'b'], sessions }), { one: 'b' });
  assert.equal(closeKeyTargets(key('Delete'), { selected: [], sessions }), null, '메모·칸반만 골랐으면 selected가 비어 있다');
});

test('Delete: 다른 키, 조합 키, 한글 조합 중, 대화상자가 열려 있으면 닫지 않는다', () => {
  const st = { selected: ['a', 'b'], sessions };
  assert.equal(closeKeyTargets(key('Backspace'), st), null);
  for (const m of ['ctrlKey', 'altKey', 'metaKey', 'shiftKey', 'isComposing']) assert.equal(closeKeyTargets(key('Delete', { [m]: true }), st), null, m);
  assert.equal(closeKeyTargets(key('Delete'), { ...st, dialog: { kind: 'settings' } }), null);
});

test('사전: 그룹·묶음·한 줄 메모 열쇠가 없고 닫기 확인 열쇠가 있다(고른 노드 막대의 열쇠는 P23까지 남긴다)', () => {
  for (const d of [en, ko]) {
    assert.equal(d.group, undefined);
    assert.equal(d.app.leaveMemo, undefined);
    for (const k of ['notes', 'memoSaved', 'memoFail', 'memoLabel', 'memoPlaceholder', 'memoSave']) assert.equal(d.extras[k], undefined, k);
    assert.equal(d.node.memoTitle, undefined);
    assert.equal(d.rail.group, undefined);
    assert.equal(d.mission.colGroups, undefined);
    assert.equal(d.search.field.note, undefined);
    assert.equal(d.waitReason.batch_limit, undefined);
    for (const k of ['titleOne', 'titleMany', 'many', 'progress', 'manyArchived', 'manyDeleted']) assert.ok(d.close[k], k);
  }
  assert.equal(WAIT_REASON_LABEL.batch_limit, undefined);
  assert.equal(STOP_REASON.group_deleted, undefined);
});
