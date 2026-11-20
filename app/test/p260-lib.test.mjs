// P260 단위 시험: 세션 맵 칸 머리 띠 없음, 나무 칸 x는 그대로(보이지 않는 칸), 솔로는 시작 칸에서 나무 아래로 쌓기, rig 묶음 자리, 두 열 판단, 휴대폰, 놓기 판정.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lineageLayout, pickColumns, relationDrop, LINE, PHONE } from '../src/renderer/lib/mission-lineage.js';
import ko from '../src/renderer/locales/ko.js';
import en from '../src/renderer/locales/en.js';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/renderer');
const read = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');
const A = 'd:/w/app', B = 'd:/w/lib';
// A: lead → w1 → w2(2단계), lead → w3, 동료 둘(p1·p2), 솔로 셋(s1·s2·s3, 만든 차례가 나무 사이에 섞임). B: A의 lead가 띄운 away, 솔로 하나
const S = [
  ['s2', A, null, {}], ['lead', A, null, {}], ['w1', A, 'lead', {}], ['s1', A, null, {}], ['w2', A, 'w1', {}], ['w3', A, 'lead', {}],
  ['p1', A, null, { peers: ['s:p2'] }], ['p2', A, null, { peers: ['s:p1'] }], ['s3', A, null, {}], ['away', B, 'lead', {}], ['bs', B, null, {}],
];
const G = { nodes: S.map(([name, ws, parent, x], i) => ({ id: 's:' + name, kind: 'session', sessionId: 'x-' + name, name, workspaceKey: ws, state: 'sleeping', parentId: parent ? 's:' + parent : null, createdAt: i + 1, peers: [], ...x })),
  edges: S.filter((x) => x[2]).map(([name, , parent]) => ({ from: 's:' + parent, to: 's:' + name, kind: 'spawn', count: 1 })) };
const OPT = { order: [A, B], noFolder: 'No folder', routing: false };
const lay = lineageLayout(G, OPT);
const c = (n) => lay.cards.get('s:' + n);

test('P260 칸 머리 띠·솔로 칸·구분선이 없다(창·휴대폰·CSS·두 사전)', () => {
  const ml = read('MissionLineage.jsx'), pm = read('PhoneMap.jsx'), css = read('styles.css'), pcss = read('phone.css');
  for (const s of ['ln-cols', 'colh', 'COLH', 'colsRef', 'mt-sm-div', 'colLabel']) assert.ok(!ml.includes(s), 'MissionLineage.jsx: ' + s);
  assert.ok(!pm.includes('pm-solo-div') && !pm.includes('colSolo'), 'PhoneMap.jsx');
  assert.ok(!/mt-sm-cols|\.colh|mt-sm-div/.test(css) && !/mt-pmap-div/.test(pcss), 'CSS');
  for (const k of ['colWs', 'colRoot', 'colLevel', 'colSolo']) assert.ok(!(k in ko.mmLine) && !(k in en.mmLine), k);
  assert.equal(lay.divs, undefined);
  assert.ok(lay.cols.every((x) => x.key === 'lv'), '칸 x는 나무 단계만(워크스페이스·솔로 칸 없음)');
  assert.ok(!('SOLOGAP' in LINE) && !('SGX' in LINE) && !('SOLOGAP' in PHONE));
});

test('P260 나무 배치는 그대로: 깊이마다 같은 칸 x, 칸 x = 머리 오른쪽 + 깊이 × (카드 폭 + GX)', () => {
  const base = LINE.HEADX + Math.max(LINE.HEADW + 208, lay.headW + 80) + (lay.spine - LINE.SPINE);
  lay.cols.forEach((x, i) => assert.equal(x.x, base + i * (lay.cw + LINE.GX), 'lv' + i));
  for (const [n, d] of [['lead', 0], ['w1', 1], ['w3', 1], ['w2', 2], ['p1', 0], ['p2', 0], ['away', 1]]) { assert.equal(c(n).depth, d, n); assert.equal(c(n).x, lay.cols[d].x, n); }
  assert.equal(lay.W, lay.cols.at(-1).x + lay.cw + 60, '폭은 가장 깊은 칸까지(솔로 두 줄 자리 없음)');
});

test('P260 솔로는 시작 칸: 나무(동료 뿌리 포함)와 다른 워크스페이스에서 온 것 아래, 만든 차례로 GY 간격', () => {
  const solos = ['s2', 's1', 's3'];
  for (const n of solos) { assert.equal(c(n).x, lay.cols[0].x, n); assert.equal(c(n).depth, -1); assert.equal(c(n).solo, true); }
  const tree = [...lay.cards.values()].filter((x) => x.ws === A && !x.solo);
  const treeBottom = Math.max(...tree.map((x) => x.y + x.h));
  assert.equal(c('s2').y, treeBottom + LINE.GY * 2, '첫 솔로는 나무 아래 GY*2');
  for (let i = 1; i < solos.length; i++) assert.equal(c(solos[i]).y, c(solos[i - 1]).y + c(solos[i - 1]).h + LINE.GY, solos[i]);
  assert.deepEqual(lay.seq.get(A).solos, solos.map((n) => 's:' + n));
  // B: away(1단계 칸) 아래 시작 칸에 솔로
  assert.ok(c('bs').y >= c('away').y + c('away').h && c('bs').x === lay.cols[0].x);
  // 차례(↑↓ 이동)는 줄 → x → y: 시작 칸 나무 뿌리 다음에 솔로
  const ord = lay.order.filter((id) => lay.cards.get(id).ws === A).map((id) => id.slice(2));
  assert.deepEqual(ord.filter((n) => lay.cards.get('s:' + n).x === lay.cols[0].x), ['lead', 'p1', 'p2', 's2', 's1', 's3']);
  for (const r of lay.rows) for (const x of lay.cards.values()) if (x.ws === r.key) assert.ok(x.y + x.h <= r.y + r.h, '줄 안');
});

test('P260 rig 묶음은 그 줄 시작 칸에서 솔로까지 쌓은 것 아래(RIGGAP)', () => {
  const l = lineageLayout(G, { ...OPT, rigBlocks: new Map([[A, { w: 900, h: 300 }]]) });
  const r = l.rigs[0], last = l.cards.get('s:s3');
  assert.equal(r.x, l.cols[0].x);
  assert.equal(r.y, last.y + last.h + LINE.RIGGAP);
  const row = l.rows.find((x) => x.key === A);
  assert.ok(r.y + r.h <= row.y + row.h);
  // 넓은 묶음은 줄 폭을 늘린다
  const wide = lineageLayout(G, { ...OPT, rigBlocks: new Map([[A, { w: 5000, h: 300 }]]) });
  assert.equal(wide.W, wide.cols[0].x + 5000 + 60);
});

test('P260 두 열 판단은 새 폭(measure.W)으로: 넓고 낮은 창은 두 열, 좁은 창은 한 열', () => {
  const today = new Set([A]);
  const one = lineageLayout(G, { ...OPT, order: undefined, vgroups: [{ id: 'g1', name: 'one', members: [A] }, { id: 'g2', name: 'two', members: [B] }], today, columns: 1 });
  assert.equal(one.measure.W, one.W);
  const k1 = pickColumns(one.measure, { w: 3200, h: 700 }), k2 = pickColumns(one.measure, { w: 700, h: 1800 });
  assert.equal(k1, 2); assert.equal(k2, 1);
  const two = lineageLayout(G, { ...OPT, order: undefined, vgroups: [{ id: 'g1', name: 'one', members: [A] }, { id: 'g2', name: 'two', members: [B] }], today, columns: 'auto', view: { w: 3200, h: 700 } });
  assert.equal(two.ncol, 2);
  const bs = two.cards.get('s:bs');
  assert.equal(bs.x, two.cols.find((x) => x.c === 1 && x.level === 0).x, '오른쪽 열 솔로도 그 열 시작 칸');
});

test('P260 휴대폰도 같은 규칙: 솔로는 시작 칸(PADX)에서 나무 아래로, 가름 점선 없음', () => {
  const ph = lineageLayout(G, { ...OPT, phone: true });
  assert.equal(ph.divs, undefined);
  const p = (n) => ph.cards.get('s:' + n);
  for (const n of ['s2', 's1', 's3', 'bs']) assert.equal(p(n).x, PHONE.PADX, n);
  const tree = [...ph.cards.values()].filter((x) => x.ws === A && !x.solo);
  assert.equal(p('s2').y, Math.max(...tree.map((x) => x.y + x.h)) + LINE.GY * 2);
  assert.ok(p('s1').y >= p('s2').y + p('s2').h && p('s3').y >= p('s1').y + p('s1').h);
});

test('P260 놓기: 시작 칸 솔로의 오른쪽(1단계 자리)은 그 솔로의 하위 자리', () => {
  const s = c('s1');
  const d = relationDrop(lay, 's:w3', s.x + s.w + LINE.GX + 20, s.y + s.h / 2);
  assert.equal(d && d.kind, 'sub'); assert.equal(d.target, 's:s1');
});
