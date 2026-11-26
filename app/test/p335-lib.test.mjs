// P335: 세션 맵 카드의 할 일 배지·작업 완료 꼬리표를 오른쪽 위에 세로로 쌓고(작업 완료가 위 테두리, 할 일이 그 위), 배율이 작으면 키우고, 배치가 그 위를 비운다.
// 창 시험은 e2e/p335-map-tags.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { TAG, tagScale, tagRoom, lineageLayout } from '../src/renderer/lib/mission-lineage.js';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const css = read('../src/renderer/styles.css');
const jsx = read('../src/renderer/MissionLineage.jsx');

test('tagScale: 계단 1 이상은 1, 작아지면 화면 글 SCREEN px를 지키게 키우고 CAP배까지', () => {
  assert.equal(tagScale(1), 1);
  assert.equal(tagScale(2), 1);
  for (const s of [0.8, 0.6, 0.42, 0.3]) assert.ok(Math.abs(TAG.FONT * tagScale(s) * s - TAG.SCREEN) < 0.05, String(s));
  assert.equal(tagScale(0.1), TAG.CAP);
  assert.equal(tagScale(0), 1);
});

test('tagRoom: 하나는 반 높이, 둘은 반 + 틈 + 하나, 키우면 위로만(카드 안 걸침 H/2 그대로), 얇은 줄은 무리 전체가 위', () => {
  assert.equal(tagRoom(0), 0);
  assert.equal(tagRoom(1), Math.ceil(TAG.H / 2 + TAG.PAD));
  assert.equal(tagRoom(2), Math.ceil(TAG.H / 2 + TAG.GAP + TAG.H + TAG.PAD));
  assert.equal(tagRoom(1, 1, true), Math.ceil(TAG.H + 2 + TAG.PAD));
  const s = tagScale(0.3);
  assert.equal(tagRoom(2, 0.3), Math.ceil(s * (2 * TAG.H + TAG.GAP) - TAG.H / 2 + TAG.PAD));
  assert.ok(tagRoom(2, 0.3) > tagRoom(2, 1) * 2);
});

const now = 1e12;
const S = (name, o = {}) => ({ id: 's:' + name, kind: 'session', sessionId: 'fk-' + name, name, agentKind: 'claude', state: 'sleeping', category: 'idle', workspaceKey: 'd:/x/.git', parentId: null, lineageParent: null, peers: [], createdAt: now, activeAt: now, ...o });
const kids = ['a', 'b', 'c', 'd', 'e'].map((n, i) => S(n, { parentId: 's:lead', lineageParent: 's:lead', createdAt: now + i }));
const graph = { nodes: [{ id: 'human', kind: 'human', name: 'you' }, S('lead', { state: 'ready' }), ...kids], edges: kids.map((k) => ({ from: 's:lead', to: k.id, kind: 'spawn', count: 1 })) };
const gapAbove = (L, id) => { const b = L.cards.get(id); let f = -Infinity; for (const [x, o] of L.cards) if (x !== id && o.x === b.x && o.y < b.y) f = Math.max(f, o.y + o.h); return b.y - f; };

test('배치: 꼬리표가 있는 카드 위를 tagRoom만큼 비우고 그 아래를 함께 내린다(없으면 그대로)', () => {
  const base = lineageLayout(graph, { label: 0.42 });
  const tagged = lineageLayout(graph, { label: 0.42, tags: new Map([['s:c', 2]]) });
  assert.ok(!base.cards.get('s:c').thin, 'P374: PC는 얇은 줄 없이 카드');
  assert.ok(gapAbove(base, 's:c') < tagRoom(2, 0.42, false));
  assert.ok(gapAbove(tagged, 's:c') >= tagRoom(2, 0.42, false), String(gapAbove(tagged, 's:c')));
  for (const id of ['s:d', 's:e']) assert.ok(gapAbove(tagged, id) === gapAbove(base, id), id + ' 아래 줄 사이는 그대로');
  assert.equal(tagged.cards.get('s:a').y, base.cards.get('s:a').y, '위는 그대로');
  assert.ok(tagged.bounds.h > base.bounds.h, '줄이 늘어난다');
  const none = lineageLayout(graph, { label: 0.42, tags: new Map() });
  assert.deepEqual([...none.cards.values()].map((b) => b.y), [...base.cards.values()].map((b) => b.y));
});

test('창: 맵이 카드마다 꼬리표 수를 배치에 주고, 무리 배수 --tk를 배치 계단에서 쓴다', () => {
  assert.match(jsx, /mergers, tags: tagRows \}\), \[[^\]]*tagRows\]\)/);
  assert.match(jsx, /setProperty\('--tk', v\)/);
  assert.match(jsx, /tagScale\(lay\.label\)/);
});

test('CSS: 세로 무리(작업 완료 아래, 할 일 위, 오른쪽 끝 맞춤), 얇은 줄은 테두리 위', () => {
  assert.match(css, /\.mt-sm-tags \{ position: absolute; right: 18px; bottom: calc\(100% - 11px\); z-index: 2; display: flex; flex-direction: column; align-items: flex-end; gap: 4px;/);
  assert.match(css, /\.mt-sm \.mt-ta-slot\.thin \.mt-sm-tags \{ right: 12px; bottom: calc\(100% \+ 2px\); transform-origin: right bottom; \}/);
  assert.doesNotMatch(css, /lv-far \.mt-sm-tags \{ transform: scale\(clamp/, '옛 멀리 키우기 없음');
});
