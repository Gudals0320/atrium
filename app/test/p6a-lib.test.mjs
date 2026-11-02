// P6a 창 쪽 순수 규칙의 단위 시험: 들어가며 친 키를 터미널 입력으로(H4), 선 위 글을 노드 사이 틈에 맞추기(P4 6절 9번)
import test from 'node:test';
import assert from 'node:assert/strict';
import { keyToData } from '../src/renderer/lib/keys.js';
import { labelFit } from '../src/renderer/lib/labels.js';

test('H4: 터미널이 붙기 전에 친 키 → 터미널 입력', () => {
  assert.equal(keyToData({ key: 'a' }), 'a');
  assert.equal(keyToData({ key: '한' }), '한');
  assert.equal(keyToData({ key: 'Enter' }), '\r');
  assert.equal(keyToData({ key: 'Backspace' }), '\x7f');
  assert.equal(keyToData({ key: 'ArrowUp' }), '\x1b[A');
  assert.equal(keyToData({ key: 'c', ctrlKey: true }), null, 'Ctrl+C는 복사(판의 규칙)');
  assert.equal(keyToData({ key: 'u', ctrlKey: true }), '\x15');
  assert.equal(keyToData({ key: 'g', ctrlKey: true }), null, 'Ctrl+G는 막는다(P2)');
  assert.equal(keyToData({ key: 'f', ctrlKey: true }), null, 'Ctrl+F는 판의 검색');
  assert.equal(keyToData({ key: 'b', altKey: true }), '\x1bb');
  assert.equal(keyToData({ key: 'Process', isComposing: true }), null, '한글 조합 중');
  assert.equal(keyToData({ key: 'Shift' }), null);
  assert.equal(keyToData({ key: 'F5' }), null);
});

test('P4 6절 9번: 선 위 글 폭은 두 노드 사이 틈 안. 좁으면 짧은 표시', () => {
  assert.deepEqual(labelFit({ gap: 40, horizontal: true }), { maxWidth: 28, compact: true }, '노드 틈 40px(빈자리 간격)');
  assert.deepEqual(labelFit({ gap: 400, horizontal: true }), { maxWidth: 388, compact: false });
  assert.deepEqual(labelFit({ gap: 2000, horizontal: true }), { maxWidth: 460, compact: false });
  assert.deepEqual(labelFit({ gap: 20, horizontal: false }), { maxWidth: 160, compact: true }, '위아래 틈이 글 높이보다 좁다');
  assert.deepEqual(labelFit({ gap: 200, horizontal: false }), { maxWidth: 460, compact: false });
  assert.deepEqual(labelFit(undefined), { maxWidth: 460, compact: false });
});
