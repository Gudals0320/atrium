// P206 시험: 줄 밀기(pushLine)가 P200이 접어 연 다른 열의 형제는 실제 블록이 겹칠 때만 민다. 같은 열은 예전처럼 띠로 민다
import test from 'node:test';
import assert from 'node:assert/strict';
import { pushLine, LINE_GAP_Y } from '../src/tree-line.mjs';
import { bbox } from '../src/canvas.mjs';

const R = (x, y, w = 1440, h = 810) => ({ x, y, w, h });
// 형제 단위: own = 블록, parts = 자기 나무 블록들, rect = 띠
const unit = (id, own, kids = []) => { const parts = [own, ...kids]; return { id, own, parts, rect: bbox(parts) }; };
const X1 = 920, X2 = X1 + 1440 + 200;

test('접힌 둘째 열: 첫 열 형제의 손자가 둘째 열 x의 빈 칸에 서면 둘째 열 형제를 밀지 않는다', () => {
  const w1 = unit('w1', R(X1, 0));
  const w2 = unit('w2', R(X1, 890), [R(X2, 1780)]); // 손자 g1: 둘째 열 x, w4 아래 빈 칸
  const w3 = unit('w3', R(X2, 0));
  const w4 = unit('w4', R(X2, 890));
  assert.deepEqual([...pushLine([w1, w2, w3, w4])], [], '밀린 것 없음');
  // 띠만 보는 옛 방식(own·parts 없음)이면 w4가 밀렸다
  const old = pushLine([w1, w2, w3, w4].map(({ id, rect }) => ({ id, rect })));
  assert.equal(old.get('w4'), 1780 + 810 + LINE_GAP_Y - 890);
});

test('다른 열이라도 실제 블록이 겹치면(손자가 커지는 등) 그 아래로 민다', () => {
  const w2 = unit('w2', R(X1, 890), [R(X2, 1000)]); // 손자가 w4와 겹침
  const w4 = unit('w4', R(X2, 890));
  const s = pushLine([w2, w4]);
  assert.equal(s.get('w4'), 1000 + 810 + LINE_GAP_Y - 890);
});

test('같은 열은 예전처럼 띠로 민다(앞 형제 나무 아래로)', () => {
  const w1 = unit('w1', R(X1, 0), [R(X2, 0), R(X2, 2000)]); // 손자 둘로 띠가 길다
  const w2 = unit('w2', R(X1, 890)); // 블록끼리는 안 겹치지만 w1 띠 안
  const s = pushLine([w1, w2]);
  assert.equal(s.get('w2'), 2000 + 810 + LINE_GAP_Y - 890);
});

test('민 형제 나무도 함께 내려간 자리로 다음 형제를 본다', () => {
  const w1 = unit('w1', R(X1, 0, 1440, 2000));
  const w2 = unit('w2', R(X1, 890), [R(X2, 3000)]); // w1에 밀려 내려가면 손자도 함께 내려간다
  const w4 = unit('w4', R(X2, 4200));
  const s = pushLine([w1, w2, w4]);
  const dy = s.get('w2');
  assert.equal(dy, 2000 + LINE_GAP_Y - 890);
  assert.equal(s.get('w4'), 3000 + dy + 810 + LINE_GAP_Y - 4200, '내려간 손자와 겹쳐 w4도 밀림');
});
