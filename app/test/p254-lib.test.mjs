// P254 창 단위 시험: 사용자의 시안 V7 "새 rig · 캔버스의 길 선"을 그대로 옮긴 것.
// 쌍마다 방향별 두 줄(한쪽 길만 있으면 한 줄), 줄 글과 자리, 대기 n, 붉은 점, 밝기, 올림 점선, 꼬리표 셋,
// 세션 맵에서 rig가 그 워크스페이스 줄(폴더) 안에 있고 맨 위 띠가 없음, 열 머리 고정.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pairLines, lineText, twoLines, v7Layout, rigEdges, rigTag, hideRigSessions, V7, BUILDER_ROLE } from '../src/renderer/lib/rig-map.js';
import { lineageLayout } from '../src/renderer/lib/mission-lineage.js';
import ko from '../src/renderer/locales/ko.js';
import en from '../src/renderer/locales/en.js';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'renderer');
const read = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');

// rig-trade 모양(역할 넷, 길 아홉)
const FLOWS = [
  { item: 'seed', from: ['human'], to: ['ideas'] },
  { item: 'hypothesis', from: ['ideas'], to: ['verify'] },
  { item: 'result', from: ['verify'], to: ['ideas'], for: 'hypothesis' },
  { item: 'data_request', from: ['ideas', 'human'], to: ['data'] },
  { item: 'data_reply', from: ['data'], to: ['ideas'], for: 'data_request' },
  { item: 'dataset', from: ['data'], to: ['verify'] },
  { item: 'strategy', from: ['verify'], to: ['trade'] },
  { item: 'live_report', from: ['trade'], to: ['verify'], for: 'strategy' },
  { item: 'halt', from: ['human'], to: ['trade'] },
];
const role = (name, docN = 1) => ({ name, docN, session: { sessionId: 's-' + name, name: 'trade-' + name, state: 'ready', asleep: false }, sectors: [], tools: [], intake: [] });
const TRADE = (o = {}) => ({
  workspace: o.ws || 'C:/w/trade', status: o.status || 'on', name: 'rig-trade', versionN: 1,
  head: { cycle: 2, beat: { every: '1d', at: '07:30', role: 'data' } },
  builder: { sessionId: 'b1', name: 'trade-builder', state: 'sleeping', asleep: true },
  raises: o.raises || [{ id: 'r1', role: 'trade', reason: '기준이 없다', t: 1 }],
  roles: [role('data', 2), role('ideas', 4), role('verify', 3), role('trade', 1)],
  flows: FLOWS.map((f, i) => ({ i, ...f, for: f.for || null, waiting: f.item === 'strategy' ? 1 : 0, openReturns: f.item === 'hypothesis' ? 1 : 0, cycle: null, last: [] })),
  intake: [], cycleItems: [], entry: null,
});

test('P254 pairLines: 방향마다 한 줄(위 = 왼쪽 → 오른쪽, 아래 = 돌아오는 길), 한쪽 길만 있으면 한 줄, 대기 수, 밝기, 끝나지 않은 반려', () => {
  const fl = TRADE().flows;
  const iv = pairLines('ideas', 'verify', fl);
  assert.deepEqual(iv.top.items, ['hypothesis']); assert.deepEqual(iv.bottom.items, ['result']);
  assert.equal(iv.top.open, true, 'hypothesis 반려가 열렸다 → 위 줄 시작에 붉은 점');
  assert.equal(iv.bottom.open, false);
  assert.equal(iv.lit, false);
  const dv = pairLines('data', 'verify', fl);
  assert.deepEqual(dv.top.items, ['dataset']); assert.equal(dv.bottom, null, '돌아오는 길이 없으면 아래 줄을 긋지 않는다');
  const vt = pairLines('verify', 'trade', fl);
  assert.deepEqual([vt.waiting, vt.lit], [1, true], '기다리는 항목이 있는 쌍(지금 오가는 쌍)이 밝다');
  // 사람이 낸 길은 쌍이 아니다(data_request는 ideas → data만)
  assert.deepEqual(pairLines('data', 'ideas', fl).bottom.items, ['data_request']);
  assert.equal(lineText(iv.top, 'top'), 'hypothesis →');
  assert.equal(lineText(iv.bottom, 'bottom'), '← result');
  assert.equal(lineText({ items: ['a', 'b'] }, 'top'), 'a · b →');
});

test('P254 twoLines: 시안 V7 자리 그대로(카드 변 사이 위 줄 -8·아래 줄 +8, 글 -28·+28, 대기 +48, 붉은 점은 줄 시작 8 안쪽), k배', () => {
  // 시안: 데이터 관리 카드 오른쪽 변 x 248, 패턴 카드 왼쪽 변 x 352, 카드 가운데 y 248
  const g = twoLines([248, 248], [352, 248], 1);
  assert.deepEqual(g.top.from, [248, 240]); assert.deepEqual(g.top.to, [348, 240], '화살촉 끝이 카드 변에 닿게 4 짧게(시안 99/103)');
  assert.deepEqual(g.bottom.from, [352, 256]); assert.deepEqual(g.bottom.to, [251, 256]);
  assert.deepEqual(g.topLab, [300, 220], '시안 글 칸 위 212, 높이 16');
  assert.deepEqual(g.botLab, [300, 276], '시안 글 칸 위 268');
  assert.deepEqual(g.wait, [300, 296], '시안 "대기 n" 칸 위 288');
  assert.deepEqual(g.dotTop, [256, 240], '시안 붉은 점 가운데 = 줄 시작 + 8');
  // 캔버스: 배율 0.5면 세계 크기 2배(화면에서는 같은 크기)
  const h = twoLines([0, 0], [1000, 0], 2);
  assert.deepEqual([h.top.from[1], h.bottom.from[1], h.topLab[1], h.wait[1]], [-16, 16, -56, 96]);
  // 세로로 놓인 두 노드: 위 노드 → 아래 노드가 위 줄(오른쪽으로 비킨다)
  const v = twoLines([0, 0], [0, 100], 1);
  assert.equal(v.top.from[0], 8); assert.equal(v.bottom.from[0], -8);
  assert.deepEqual([V7.W1, V7.W2, V7.C.lit, V7.C.dim, V7.C.text, V7.C.red, V7.C.raise], [2, 1.5, '#ECE9E1', '#8E8B83', '#A9A69D', '#E5484D', '#F0B652']);
});

test('P254 v7Layout(세션 맵 묶음): 카드 184×96 한 줄, 이웃한 쌍은 곧은 두 줄, 이웃하지 않은 쌍은 카드 위로, 빌더는 오른쪽 끝 역할 아래, 올림 점선', () => {
  const g = v7Layout(TRADE());
  assert.deepEqual(g.order, ['data', 'ideas', 'verify', 'trade']);
  const R = (n) => g.roles.get(n);
  assert.deepEqual([R('data').w, R('data').h, R('ideas').x - R('data').x], [184, 96, 288], '시안 카드 184×96, 칸 간격 288');
  assert.equal(new Set([...g.roles.values()].map((r) => r.y)).size, 1);
  const st = g.pairs.filter((p) => p.straight).map((p) => p.key).sort();
  assert.deepEqual(st, ['data|ideas', 'ideas|verify', 'verify|trade'].sort());
  const di = g.pairs.find((p) => p.key === 'data|ideas');
  const y = R('data').y + 48;
  assert.equal(di.top.d, `M184 ${y - 8} L284 ${y - 8}`); assert.equal(di.bottom.d, `M288 ${y + 8} L187 ${y + 8}`);
  assert.deepEqual(di.topLab, [236, y - 28]); assert.deepEqual(di.botLab, [236, y + 28]);
  const lane = g.pairs.find((p) => p.key === 'data|verify');
  assert.equal(lane.straight, false);
  assert.ok(lane.top.pts.every((p) => p[1] <= R('data').y), '카드 위로 돈다');
  assert.equal(lane.lines.bottom, null);
  // 붉은 점: hypothesis(ideas → verify, 위 줄) 시작
  const iv = g.pairs.find((p) => p.key === 'ideas|verify');
  assert.ok(iv.lines.top.open && iv.dotTop[0] === R('ideas').x + 184 + 8);
  // 빌더: 오른쪽 끝(trade) 아래 104, 높이 80. trade가 올렸으니 곧게 내려가는 점선
  assert.deepEqual([g.builder.x, g.builder.y, g.builder.w, g.builder.h], [R('trade').x, R('trade').y + 96 + 104, 184, 80]);
  assert.equal(g.raises.length, 1);
  const cx = R('trade').x + 92;
  assert.deepEqual(g.raises[0].pts, [[cx, R('trade').y + 96], [cx, g.builder.y - 4]]);
  assert.deepEqual(g.raises[0].lab, [cx + 12, R('trade').y + 96 + 52]);
  // 다른 역할이 올리면 내려가서 빌더 왼쪽 변으로 꺾는다
  const g2 = v7Layout(TRADE({ raises: [{ role: 'verify' }, { role: 'verify' }] }));
  assert.equal(g2.raises[0].pts.length, 3); assert.equal(g2.raises[0].n, 2);
  assert.equal(g2.raises[0].pts[2][0], g2.builder.x - 4);
  assert.equal(v7Layout(TRADE({ raises: [] })).raises.length, 0);
  assert.equal(g.h, g.builder.y + 80);
  assert.equal(v7Layout(TRADE({ status: 'off' })).dim, true);
});

test('P254 rigEdges(캔버스): 쌍마다 두 줄 자료(lines), 밝기는 기다림, 올림은 빌더로', () => {
  const sessions = new Map(['s-data', 's-ideas', 's-verify', 's-trade', 'b1'].map((id) => [id, { sessionId: id, workspaceKey: 'C:/w/trade', rigRole: id === 'b1' ? BUILDER_ROLE : id.slice(2) }]));
  const es = rigEdges([TRADE()], sessions);
  const vt = es.find((e) => e.kind === 'path' && e.a === 'verify' && e.b === 'trade');
  assert.deepEqual([vt.lines.top.items, vt.lines.bottom.items, vt.lines.lit], [['strategy'], ['live_report'], true]);
  const dv = es.find((e) => e.kind === 'path' && e.a === 'data' && e.b === 'verify');
  assert.equal(dv.lines.bottom, null);
  assert.deepEqual(es.filter((e) => e.kind === 'raise').map((e) => [e.source, e.target]), [['s-trade', 'b1']]);
  // 캔버스 선은 시안 꼴: 두 줄(굵기 2·1.5), 화살촉은 선이 그린다(옛 RIG_TIP 없음), 글 위·아래, 대기, 붉은 점, 노랑 점선
  const src = read('RigLines.jsx');
  for (const s of ['V7.W1 * k', 'V7.W2 * k', 'data-line="top"', 'data-line="bottom"', 'rig-wait', 'rig-open-return', 'V7.RAISEDASH', "t('rigV7.wait'"]) assert.ok(src.includes(s), s);
  assert.ok(!/RIG_TIP/.test(read('Canvas.jsx')));
});

test('P254 꼬리표 셋: "역할 · <역할> · v<판>", "rig 빌더"(노랑), rig가 켜진 워크스페이스의 다른 세션은 "일반 세션"', () => {
  const m = TRADE();
  assert.deepEqual(rigTag({ rigRole: 'data', workspaceKey: m.workspace }, () => m).docN, 2);
  assert.deepEqual(rigTag({ rigRole: BUILDER_ROLE }, () => m), { kind: 'builder' });
  assert.deepEqual(rigTag({ name: 'multitask-1', workspaceKey: m.workspace }, () => m), { kind: 'general' });
  assert.equal(rigTag({ name: 'x', workspaceKey: 'C:/w/else' }, () => null), null, 'rig 없는 워크스페이스는 꼬리표 없음');
  assert.equal(rigTag({ name: 'x', workspaceKey: m.workspace }, () => ({ ...m, status: 'off' })), null, '꺼진 rig는 일반 세션 꼬리표 없음');
  const tk = (k, v = {}) => String(k.split('.').reduce((a, x) => a[x], ko)).replace(/\{(\w+)\}/g, (_, x) => v[x]);
  assert.equal(tk('rigV7.tagRoleV', { name: 'data', n: 2 }), '역할 · data · v2');
  assert.equal(tk('rigMap.tagBuilder'), 'rig 빌더');
  assert.equal(tk('rigV7.tagGeneral'), '일반 세션');
  assert.deepEqual(['ready', 'working', 'sleeping'].map((s) => tk('rigV7.state.' + s)), ['쉼', '일함', '잠']);
  assert.equal(tk('rigV7.wait', { n: 1 }), '대기 1');
  const keys = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v, p + k + '.') : [p + k]));
  assert.deepEqual(keys(ko.rigV7).sort(), keys(en.rigV7).sort());
  const css = read('styles.css');
  assert.ok(/\.mt-badge\.rig\.builder \{[^}]*background: #3A2E17; color: #F0B652/.test(css));
});

// 세션 맵: 역할·빌더 세션은 트리에서 빠지고 그 워크스페이스 줄 안 rig 묶음으로만 나온다
const graph = () => ({
  nodes: [
    { id: 's:lead', kind: 'session', sessionId: 'lead', name: 'lead', workspaceKey: 'C:/w/app', state: 'ready', peers: [] },
    { id: 's:w1', kind: 'session', sessionId: 'w1', name: 'w1', workspaceKey: 'C:/w/app', state: 'ready', parentId: 's:lead', peers: [] },
    { id: 's:gen', kind: 'session', sessionId: 'gen', name: 'gen', workspaceKey: 'C:/w/trade', state: 'ready', peers: [] },
    { id: 's:data', kind: 'session', sessionId: 's-data', name: 'trade-data', workspaceKey: 'C:/w/trade', state: 'ready', rigRole: 'data', peers: [] },
    { id: 's:bld', kind: 'session', sessionId: 'b1', name: 'trade-builder', workspaceKey: 'C:/w/trade', state: 'ready', rigRole: BUILDER_ROLE, peers: [] },
    { id: 's:only', kind: 'session', sessionId: 's-only', name: 'only-role', workspaceKey: 'C:/w/onlyrig', state: 'ready', rigRole: 'x', peers: [] },
  ],
  edges: [{ from: 's:lead', to: 's:w1', kind: 'spawn' }],
});

test('P254 세션 맵: rig는 그 워크스페이스 줄(폴더) 안에 있고 맨 위 띠가 없다, 트리와 두 번 나오지 않는다', () => {
  const g = hideRigSessions(graph(), true);
  const geo = v7Layout(TRADE());
  const blocks = new Map([['C:/w/trade', { w: geo.w * V7.SCALE, h: geo.h * V7.SCALE }], ['C:/w/onlyrig', { w: 400, h: 300 }]]);
  const folders = [{ id: 'f1', name: 'Work', members: ['C:/w/app', 'C:/w/trade'] }];
  const lay = lineageLayout(g, { vgroups: folders, rigBlocks: blocks, routing: false });
  assert.ok(!lay.cards.has('s:data') && !lay.cards.has('s:bld'), '역할·빌더 카드는 트리에 없다');
  assert.ok(lay.cards.has('s:gen'));
  assert.deepEqual(lay.rigs.map((r) => r.key).sort(), ['C:/w/onlyrig', 'C:/w/trade']);
  for (const r of lay.rigs) {
    const row = lay.rows.find((x) => x.key === r.key);
    assert.ok(row, '역할만 있는 워크스페이스도 줄이 있다: ' + r.key);
    assert.ok(r.y >= row.y && r.y + r.h <= row.y + row.h, '묶음이 그 줄 안: ' + r.key);
    assert.ok(r.x >= row.x, '줄 머리 오른쪽');
    const band = lay.bands.find((b) => (b.id || null) === (row.band || null));
    assert.ok(r.y >= band.y && r.y + r.h <= band.y + band.h, '그 폴더 띠 안');
  }
  // 줄 안 다른 카드(일반 세션)와 겹치지 않는다
  const tr = lay.rigs.find((r) => r.key === 'C:/w/trade'), gen = lay.cards.get('s:gen');
  assert.ok(gen.y + gen.h <= tr.y || gen.x >= tr.x + tr.w || gen.x + gen.w <= tr.x);
  assert.equal(lay.bounds.y, 0, '맨 위 띠가 없어 트리가 세계 위에서 시작한다');
  assert.equal(lay.rig, undefined);
  assert.equal(lay.rigs.find((r) => r.key === 'C:/w/trade').w, geo.w * V7.SCALE);
  // rig 없으면 rigs 빈 목록(배치 그대로)
  const plain = lineageLayout(g, { vgroups: folders, routing: false });
  assert.deepEqual(plain.rigs, []);
  // 묶음은 시작 칸에서 시작한다(나무 뿌리 카드와 같은 x)
  assert.equal(tr.x, lay.cards.get('s:lead').x);
});

test('P254 열 머리 고정과 띠 걷어냄: 칸 머리 띠를 rig 아래로 내리지 않고, 맨 위 rig 띠·접기·변경 기록 띠가 없다', () => {
  const src = read('MissionLineage.jsx');
  assert.ok(!/translateY\(\$\{dy\}px\)/.test(src), '칸 머리 띠 내리기 없음');
  assert.ok(!/L\.rig\b|lay\.rig\b/.test(src));
  assert.ok(!/placeMaps|rigFold|rig-band|RigArea/.test(src));
  assert.ok(/rigBlocks/.test(src) && /RigBlocks/.test(src));
  const rm = read('RigMap.jsx');
  for (const s of ['rm-cycle', 'rm-entry', 'rm-head', 'rm-sector', 'rm-tool', 'rm-beat']) assert.ok(!rm.includes(s), '시안에 없는 것: ' + s);
  for (const s of ['rm-line', 'rm-wait', 'rm-open-return', 'rm-raise', 'rm-builder', 'rm-tag']) assert.ok(rm.includes(s), s);
});
