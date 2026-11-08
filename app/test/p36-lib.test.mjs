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
  const L = missionLayout({ nodes, edges }, { width: 4000 }); // P100: 판이 나무 깊이만큼 열을 차지하도록 넓은 지도
  const boxes = [...L.boxes.values()].filter((b) => b.kind !== 'dots');
  assert.equal(boxes.length, nodes.length - 1, '세션마다 상자(동그라미도) 하나(P100: 나 동그라미 없음)');
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) assert.ok(!ov(boxes[i], boxes[j]), `${boxes[i].node.id} ${boxes[j].node.id}`);
  const col = (id) => L.boxes.get(id).depth;
  assert.equal(col('lead'), 0); assert.equal(col('w1'), 1); assert.equal(col('d8'), 7);
  assert.equal(L.columns, 8);
  for (let d = 3; d <= 8; d++) assert.ok(L.boxes.get(`d${d}`).x > L.boxes.get(`d${d - 1}`).x);
  // 쉬는 하위 32개는 테두리 있는 상자 안 동그라미(한 줄에 per개), 사슬의 첫 하위 d2는 카드
  assert.ok(Array.from({ length: 32 }, (_, i) => L.boxes.get(`w${i + 1}`).kind).every((k) => k === 'dot'));
  const g = L.boxes.get('dots:lead');
  const per = Math.floor((L.C - 2 * MISSION.pad - 16 + MISSION.dotGap) / (MISSION.dot + MISSION.dotGap));
  assert.equal(new Set(Array.from({ length: 32 }, (_, i) => L.boxes.get(`w${i + 1}`).y)).size, Math.ceil(32 / per));
  const top = L.boxes.get('d2').y, bottom = g.y + g.h, lead = L.boxes.get('lead');
  assert.ok(Math.abs(lead.y + lead.h / 2 - (top + bottom) / 2) < 0.2, 'lead는 하위들의 세로 가운데');
  assert.ok(L.width >= 8 * L.C);
  // 열이 모자라면(좁은 지도) 깊은 하위는 마지막 열에 들여 쌓인다. 그래도 겹치지 않는다
  const narrow = missionLayout({ nodes, edges }, { width: 1200 });
  const nb = [...narrow.boxes.values()].filter((b) => b.kind !== 'dots');
  for (let i = 0; i < nb.length; i++) for (let j = i + 1; j < nb.length; j++) assert.ok(!ov(nb[i], nb[j]), `좁은 지도 ${nb[i].node.id} ${nb[j].node.id}`);
  assert.ok(narrow.boxes.get('d8').y > narrow.boxes.get('d7').y, '마지막 열에서 아래로');
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
