// P36 단위 시험: 상한을 없앤 뒤 미션 맵(lib/mission-layout.js)이 형제 30개 넘게, 깊이 6단계 넘게도 겹치지 않고 읽히는지.
import test from 'node:test';
import assert from 'node:assert/strict';
import { missionLayout, MISSION } from '../src/renderer/lib/mission-layout.js';
import en from '../src/renderer/locales/en.js';
import ko from '../src/renderer/locales/ko.js';

const ov = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

test('미션 맵: 하위 세션 32개와 8단계 사슬이 겹치지 않고, 단계마다 한 열씩 오른쪽, 부모는 하위들 가운데(P95: 쉬는 하위가 많으면 동그라미 줄)', () => {
  const nodes = [{ id: 'h', kind: 'human', name: '사람' }, { id: 'lead', kind: 'session', name: 'lead' }];
  const edges = [{ from: 'h', to: 'lead', kind: 'bar', count: 1 }];
  for (let i = 1; i <= 32; i++) nodes.push({ id: `w${i}`, kind: 'session', name: `w${String(i).padStart(2, '0')}`, parentId: 'lead', role: '워커', depth: 2 });
  let p = 'lead';
  for (let d = 2; d <= 8; d++) { nodes.push({ id: `d${d}`, kind: 'session', name: `zz${d}`, parentId: p, role: '워커', depth: d }); p = `d${d}`; }
  const L = missionLayout({ nodes, edges });
  const boxes = [...L.boxes.values()].filter((b) => b.kind !== 'dots');
  assert.equal(boxes.length, nodes.length, '세션마다 상자(동그라미도) 하나와 나');
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) assert.ok(!ov(boxes[i], boxes[j]), `${boxes[i].node.id} ${boxes[j].node.id}`);
  const col = (id) => L.boxes.get(id).depth;
  assert.equal(col('lead'), 1); assert.equal(col('w1'), 2); assert.equal(col('d8'), 8);
  assert.equal(L.columns, 9);
  for (let d = 3; d <= 8; d++) assert.ok(L.boxes.get(`d${d}`).x > L.boxes.get(`d${d - 1}`).x);
  // 쉬는 하위 32개는 동그라미 줄(한 줄에 dotsPerRow개), 사슬의 첫 하위 d2는 카드
  assert.ok(Array.from({ length: 32 }, (_, i) => L.boxes.get(`w${i + 1}`).kind).every((k) => k === 'dot'));
  const g = L.boxes.get('dots:lead');
  assert.equal(new Set(Array.from({ length: 32 }, (_, i) => L.boxes.get(`w${i + 1}`).y)).size, Math.ceil(32 / MISSION.dotsPerRow));
  const top = L.boxes.get('d2').y, bottom = g.y + g.h, lead = L.boxes.get('lead');
  assert.equal(lead.y + lead.h / 2, (top + bottom) / 2, 'lead는 하위들의 세로 가운데');
  assert.ok(L.width >= 8 * MISSION.boxW);
  // 나무 선: 사슬(lead → d2 … d7 → d8) 7개, lead → 동그라미 줄 하나(32개를 모은다)
  const tree = L.edges.filter((e) => e.tree);
  assert.equal(tree.length, 7 + 1);
  assert.equal(tree.find((e) => e.to === 'dots:lead').members.length, 32);
});

test('사전(P36): 가지 펼치기 상한 글이 없다', () => {
  for (const d of [en, ko]) {
    assert.equal(d.branch.key, undefined); assert.equal(d.branch.range, undefined); assert.equal(d.branch.settingsHelp, undefined);
    assert.deepEqual(Object.keys(d.branch.refusedCode), ['not_parent']);
    assert.equal(d.settings.tab.branch, undefined);
  }
});
