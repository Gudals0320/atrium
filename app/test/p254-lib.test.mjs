// P254 창 단위 시험: 사용자의 시안 V7 "새 rig · 캔버스의 길 선"을 그대로 옮긴 것.
// 쌍마다 방향별 두 줄(한쪽 길만 있으면 한 줄), 줄 글과 자리, 대기 n, 붉은 점, 밝기, 올림 점선, 꼬리표 셋,
// 세션 맵에서 rig가 그 워크스페이스 줄(폴더) 안에 있고 맨 위 띠가 없음, 열 머리 고정.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gridPlace, faceEnds, segHitsRect, rigRoute, polyLines, ROUTE, textW13, pairLines, pairLit, lineText, twoLines, v7Layout, rigEdges, rigTag, hideRigSessions, V7, BUILDER_ROLE } from '../src/renderer/lib/rig-map.js';
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

test('P254 pairLines: 방향마다 한 줄(위 = 왼쪽 → 오른쪽, 아래 = 돌아오는 길), 한쪽 길만 있으면 한 줄, 대기 수, 끝나지 않은 반려. 밝기 = 일하는 역할에 닿은 쌍', () => {
  const fl = TRADE().flows;
  const iv = pairLines('ideas', 'verify', fl);
  assert.deepEqual(iv.top.items, ['hypothesis']); assert.deepEqual(iv.bottom.items, ['result']);
  assert.equal(iv.top.open, true, 'hypothesis 반려가 열렸다 → 위 줄 시작에 붉은 점');
  assert.equal(iv.bottom.open, false);
  const dv = pairLines('data', 'verify', fl);
  assert.deepEqual(dv.top.items, ['dataset']); assert.equal(dv.bottom, null, '돌아오는 길이 없으면 아래 줄을 긋지 않는다');
  const vt = pairLines('verify', 'trade', fl);
  assert.equal(vt.waiting, 1);
  // 밝기: 두 끝 중 하나가 일하면 밝다(기다림 수와 상관없다)
  const work = (s) => (n) => s.includes(n);
  assert.equal(pairLit('verify', 'trade', work([])), false, '기다림이 있어도 아무도 일하지 않으면 흐림');
  assert.equal(pairLit('ideas', 'verify', work(['ideas'])), true);
  assert.equal(pairLit('data', 'ideas', work(['ideas'])), true);
  assert.equal(pairLit('verify', 'trade', work(['ideas'])), false);
  assert.equal(pairLit('a', 'b', null), false);
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

test('P254 v7Layout(세션 맵 묶음): 카드 184×96 한 줄, 이웃한 쌍만 곧은 두 줄(이웃하지 않은 쌍은 그리지 않는다), 빌더는 오른쪽 끝 역할 아래, 올림 점선', () => {
  const g = v7Layout(TRADE());
  assert.deepEqual(g.order, ['data', 'ideas', 'verify', 'trade']);
  const R = (n) => g.roles.get(n);
  assert.deepEqual([R('data').w, R('data').h], [184, 96], '시안 카드 184×96');
  // 시안 글(한글 짧은 이름)이면 칸 간격 288(카드 184 + 틈 104)
  const ko7 = v7Layout({ ...TRADE(), flows: [{ item: '스냅숏', from: ['data'], to: ['ideas'] }, { item: '데이터 요청', from: ['ideas'], to: ['data'] }, { item: '가설', from: ['ideas'], to: ['verify'] }, { item: '전략', from: ['verify'], to: ['trade'] }] });
  assert.deepEqual(['ideas', 'verify', 'trade'].map((n) => ko7.roles.get(n).x), [288, 576, 864]);
  // 글이 시안 틈(104)보다 길면 그 틈만 넓힌다
  const long = v7Layout({ ...TRADE(), flows: [{ item: 'a_very_long_item_name', from: ['data'], to: ['ideas'] }, { item: 'x', from: ['ideas'], to: ['verify'] }] });
  const gl = long.roles.get('ideas').x - (long.roles.get('data').x + 184);
  assert.ok(gl > 104 && gl >= textW13('a_very_long_item_name →') + 16, String(gl));
  assert.equal(long.roles.get('verify').x - (long.roles.get('ideas').x + 184), 104);
  assert.equal(new Set([...g.roles.values()].map((r) => r.y)).size, 1);
  assert.deepEqual(g.pairs.map((p) => p.key).sort(), ['data|ideas', 'ideas|verify', 'verify|trade'].sort(), 'data|verify(dataset)는 이웃하지 않아 그리지 않는다');
  assert.equal(R('data').y, 0);
  const di = g.pairs.find((p) => p.key === 'data|ideas');
  const y = R('data').y + 48, bx = R('ideas').x, mx = (184 + bx) / 2;
  assert.equal(di.top.d, `M184 ${y - 8} L${bx - 4} ${y - 8}`); assert.equal(di.bottom.d, `M${bx} ${y + 8} L187 ${y + 8}`);
  assert.deepEqual(di.topLab, [mx, y - 28]); assert.deepEqual(di.botLab, [mx, y + 28]);
  assert.ok(bx - 184 >= textW13('← data_request') + 16, '영어 항목 이름이 틈 안에 든다');
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
  assert.deepEqual([vt.lines.top.items, vt.lines.bottom.items, vt.lines.waiting], [['strategy'], ['live_report'], 1]);
  const dv = es.find((e) => e.kind === 'path' && e.a === 'data' && e.b === 'verify');
  assert.equal(dv.lines.bottom, null, '캔버스에는 이웃하지 않은 쌍도 두 줄 꼴로 그린다(한쪽 길이면 한 줄)');
  assert.deepEqual(es.filter((e) => e.kind === 'raise').map((e) => [e.source, e.target]), [['s-trade', 'b1']]);
  // 캔버스 선은 시안 꼴: 두 줄(굵기 2·1.5), 화살촉은 선이 그린다(옛 RIG_TIP 없음), 글 위·아래, 대기, 붉은 점, 노랑 점선
  const src = read('RigLines.jsx');
  for (const s of ['pairLit(', 'V7.W1 * k', 'V7.W2 * k', 'data-line="top"', 'data-line="bottom"', 'rig-wait', 'rig-open-return', 'V7.RAISEDASH', "t('rigV7.wait'"]) assert.ok(src.includes(s), s);
  assert.ok(!/RIG_TIP/.test(read('Canvas.jsx')));
});

test('P254 꼬리표: "역할 · <역할> · v<판>", "rig 빌더"(노랑), 일반 세션에는 꼬리표가 없다', () => {
  const m = TRADE();
  assert.deepEqual(rigTag({ rigRole: 'data', workspaceKey: m.workspace }, () => m).docN, 2);
  assert.deepEqual(rigTag({ rigRole: BUILDER_ROLE }, () => m), { kind: 'builder' });
  assert.equal(rigTag({ name: 'multitask-1', workspaceKey: m.workspace }, () => m), null, 'rig 워크스페이스의 일반 세션도 새 꼬리표 없음');
  const tk = (k, v = {}) => String(k.split('.').reduce((a, x) => a[x], ko)).replace(/\{(\w+)\}/g, (_, x) => v[x]);
  assert.equal(tk('rigV7.tagRoleV', { name: 'data', n: 2 }), '역할 · data · v2');
  assert.equal(tk('rigMap.tagBuilder'), 'rig 빌더');
  assert.ok(!('tagGeneral' in ko.rigV7) && !('tagGeneral' in en.rigV7));
  assert.ok(!/general/.test(read('RigLines.jsx')));
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
  // 솔로 칸 구분선은 rig 묶음을 가로지르지 않는다
  for (const d of lay.divs) for (const r of lay.rigs) assert.ok(!(d.x >= r.x && d.x <= r.x + r.w && d.y + d.h > r.y && d.y < r.y + r.h), '구분선이 rig 위를 지난다');
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

// ---- 캔버스 2D 자리와 돌리기(사용자 결정 2026-11-20) ----
const FL = FLOWS.map((f) => ({ ...f }));
const cellRect = (g, n, W = 1440, H = 810, GX = 360, GY = 240) => { const c = g.cells.get(n); return { x: c.c * (W + GX), y: c.r * (H + GY), w: W, h: H }; };

test('P254 gridPlace(rig-trade): 역할과 빌더를 2D 칸에, 선이 노드를 지나지 않고 엇갈리지 않으며 짧다', () => {
  const g = gridPlace(['data', 'ideas', 'verify', 'trade'], FL, { W: 1440, H: 810, beatRole: 'data' });
  const names = ['data', 'ideas', 'verify', 'trade', '@builder'];
  const rs = Object.fromEntries(names.map((n) => [n, cellRect(g, n)]));
  assert.equal(new Set(names.map((n) => g.cells.get(n).c + ',' + g.cells.get(n).r)).size, 5, '칸이 겹치지 않는다');
  assert.ok(g.rows > 1, '한 줄이 아니다(2D)');
  const pairs = [['data', 'ideas'], ['ideas', 'verify'], ['data', 'verify'], ['verify', 'trade']];
  for (const [a, b] of pairs) {
    const [p, q] = faceEnds(rs[a], rs[b]);
    for (const n of names) if (n !== a && n !== b) assert.ok(!segHitsRect(p, q, rs[n], 1), `${a}-${b} 선이 ${n}을 지난다`);
    assert.ok(Math.hypot(q[0] - p[0], q[1] - p[1]) < 1800, `${a}-${b}는 이웃한 칸(짧은 선)`);
  }
  assert.deepEqual(g.cells.get('data'), { c: 0, r: 0 }, '박자 역할이 왼쪽 위');
  // 같은 입력이면 같은 자리(켤 때마다 같다)
  assert.deepEqual([...gridPlace(['data', 'ideas', 'verify', 'trade'], FL, { W: 1440, H: 810, beatRole: 'data' }).cells], [...g.cells]);
  // 역할이 많으면(정확히 견주지 않는 크기) 옮기기·바꾸기로 낮춘다: 사슬은 노드를 지나지 않는다
  const big = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const gb = gridPlace(big, big.slice(1).map((x, i) => ({ item: 'i' + i, from: [big[i]], to: [x] })), {});
  const rb = Object.fromEntries([...big, '@builder'].map((n) => [n, cellRect(gb, n, 600, 400)]));
  for (let i = 0; i + 1 < big.length; i++) { const [p, q] = faceEnds(rb[big[i]], rb[big[i + 1]]); for (const n of Object.keys(rb)) if (n !== big[i] && n !== big[i + 1]) assert.ok(!segHitsRect(p, q, rb[n], 1)); }
});

test('P254 rigRoute: 곧은 선이 다른 노드를 지나면 직각으로 돌고(노드를 지나지 않음), 같은 통로에 두 선을 겹치지 않는다. polyLines는 두 줄을 나란히', () => {
  const R = (c, r) => ({ x: c * 1800, y: r * 1050, w: 1440, h: 810 });
  const taken = [];
  assert.equal(rigRoute(R(0, 0), R(1, 0), [R(2, 0)], taken), null, '막는 노드가 없으면 곧은 선');
  const k = 2;
  const r1 = rigRoute(R(0, 0), R(2, 0), [R(1, 0)], taken, k);
  assert.ok(r1 && r1.pts.length >= 3);
  for (let i = 0; i + 1 < r1.pts.length; i++) assert.ok(!segHitsRect(r1.pts[i], r1.pts[i + 1], R(1, 0), 0), '가운데 노드를 지나지 않는다');
  for (let i = 1; i + 2 < r1.pts.length; i++) for (const r of [R(0, 0), R(2, 0)]) assert.ok(!segHitsRect(r1.pts[i], r1.pts[i + 1], r, 0), '제 노드도 가로지르지 않는다');
  // 돌아가는 선과 노드 사이에 아래 줄 글·대기 칸이 들어간다(화면 px × k)
  const ys = r1.pts.slice(1, -1).map((p) => p[1]);
  assert.ok(Math.min(...ys) <= -ROUTE.M * k || Math.max(...ys) >= 810 + ROUTE.M * k);
  const r2 = rigRoute(R(0, 0), R(2, 0), [R(1, 0)], taken, k);
  const mid = (r) => r.pts[1][1];
  assert.ok(Math.abs(mid(r2) - mid(r1)) >= ROUTE.NEAR * k, '둘째 선은 다른 통로');
  const g = polyLines([[0, 0], [0, -200], [1000, -200], [1000, 0]], 1);
  assert.equal(g.top.pts[1][0], -8); assert.equal(g.top.pts[1][1], -208, '모서리에서 두 법선을 더해 나란히(위 줄은 바깥)');
  assert.equal(g.bottom.pts[1][0], 992); assert.equal(g.bottom.pts[1][1], -192);
  assert.deepEqual(g.topLab, [500, -228]); assert.deepEqual(g.botLab, [500, -172]); assert.deepEqual(g.wait, [500, -152]);
  // 캔버스가 쓴다
  assert.ok(/rigRoute\(/.test(read('Canvas.jsx')) && /polyLines\(route, k\)/.test(read('RigLines.jsx')));
});
