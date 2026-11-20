// P261 단위 시험: 세션 맵 rig 묶음을 보통 세션 카드·선과 한 가족으로.
// 카드 꼴(보통 카드 폭·높이 체계, 역할마다 같은 크기, 세계 배율 1), 줄 말투(세션 맵 선 클래스·작은 글 칩), 배치 구조 그대로(역할 한 줄, 이웃한 쌍만, 빌더는 오른쪽 끝 아래).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { v7Layout, twoLines, RIG_MAP, mapLabW, textW13, lineText, V7, BUILDER_ROLE, hideRigSessions } from '../src/renderer/lib/rig-map.js';
import { lineageLayout, mapCardW, rigCardH, rigMapOpts, rigCardBoxes, LINE } from '../src/renderer/lib/mission-lineage.js';
import { cardHeight, CARD_MIN } from '../src/renderer/lib/mission-terr.js';
import ko from '../src/renderer/locales/ko.js';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'renderer');
const read = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');

const FLOWS = [
  { item: 'seed', from: ['human'], to: ['ideas'] }, { item: 'hypothesis', from: ['ideas'], to: ['verify'] }, { item: 'result', from: ['verify'], to: ['ideas'], for: 'hypothesis' },
  { item: 'data_request', from: ['ideas', 'human'], to: ['data'] }, { item: 'data_reply', from: ['data'], to: ['ideas'], for: 'data_request' }, { item: 'dataset', from: ['data'], to: ['verify'] },
  { item: 'strategy', from: ['verify'], to: ['trade'] }, { item: 'live_report', from: ['trade'], to: ['verify'], for: 'strategy' }, { item: 'halt', from: ['human'], to: ['trade'] },
];
const role = (name, docN = 1) => ({ name, docN, session: { sessionId: 's-' + name, name: 'trade-' + name, state: 'ready', asleep: false }, sectors: [], tools: [], intake: [] });
const TRADE = (o = {}) => ({
  workspace: 'C:/w/trade', status: o.status || 'on', name: 'rig-trade', versionN: 1, head: { cycle: 2, beat: { every: '1d', at: '07:30', role: 'data' } },
  builder: { sessionId: 'b1', name: 'trade-builder', state: 'sleeping', asleep: true }, raises: o.raises || [{ id: 'r1', role: 'trade', reason: 'x', t: 1 }],
  roles: [role('data', 2), role('ideas', 4), role('verify', 3), role('trade', 1)],
  flows: FLOWS.map((f, i) => ({ i, ...f, for: f.for || null, waiting: f.item === 'strategy' ? 1 : 0, openReturns: f.item === 'hypothesis' ? 1 : 0, cycle: null, last: [] })), intake: [], cycleItems: [], entry: null,
});
const GRAPH = () => ({
  nodes: [
    { id: 's:lead', kind: 'session', sessionId: 'lead', name: 'lead-session', workspaceKey: 'C:/w/trade', state: 'working', peers: [], lastPrompt: 'Merge the workers' },
    { id: 's:w1', kind: 'session', sessionId: 'w1', name: 'w1', workspaceKey: 'C:/w/trade', state: 'ready', parentId: 's:lead', peers: [] },
    { id: 's:data', kind: 'session', sessionId: 's-data', name: 'trade-data', workspaceKey: 'C:/w/trade', state: 'working', rigRole: 'data', peers: [], lastPrompt: 'Pull the daily snapshot', model: 'claude-haiku-5-5' },
    { id: 's:bld', kind: 'session', sessionId: 'b1', name: 'trade-builder', workspaceKey: 'C:/w/trade', state: 'sleeping', rigRole: BUILDER_ROLE, peers: [] },
  ],
  edges: [{ from: 's:lead', to: 's:w1', kind: 'spawn' }],
});
const t = (k, v = {}) => String(k.split('.').reduce((a, x) => a[x], ko)).replace(/\{(\w+)\}/g, (_, x) => v[x]);

test('P261 카드 꼴: rig 역할·빌더 카드는 보통 카드 폭(mapCardW)·같은 높이(rigCardH), 모두 같은 크기', () => {
  const g2 = hideRigSessions(GRAPH(), true);
  const cw = mapCardW(g2);
  const lay = lineageLayout(g2, { routing: false });
  assert.equal(cw, lay.cw, '트리 카드 폭과 같다');
  const g = v7Layout(TRADE(), rigMapOpts(cw));
  const boxes = [...g.roles.values(), g.builder];
  for (const b of boxes) assert.deepEqual([b.w, b.h], [cw, rigCardH(cw)]);
  // 높이는 보통 카드 셈으로 가장 긴 내용(일 세 줄·오류 두 줄)이 드는 높이: 어떤 보통 카드보다 작지 않다
  const ch = rigCardH(cw);
  assert.ok(ch >= CARD_MIN);
  for (const [n, tier] of [[{ lastPrompt: 'y'.repeat(900) }, 'work'], [{ lastPrompt: 'a', error: 'e'.repeat(900) }, 'alert'], [{ ask: 'q'.repeat(300) }, 'turn'], [{}, 'rest']]) assert.ok(cardHeight(n, tier, false, cw) <= ch, tier);
  // 보통 카드 체계: 옛 시안 184×96 × 1.5배가 아니다
  assert.notEqual(cw, V7.CW * V7.SCALE);
});

test('P261 배치 구조 그대로: 역할 한 줄(rowOrder 차례), 이웃한 쌍만, 빌더는 오른쪽 끝 역할 아래, 올림 점선', () => {
  const cw = 300;
  const a = v7Layout(TRADE()), b = v7Layout(TRADE(), rigMapOpts(cw));
  assert.deepEqual(b.order, a.order);
  assert.deepEqual(b.pairs.map((p) => p.key), a.pairs.map((p) => p.key));
  assert.equal(new Set([...b.roles.values()].map((r) => r.y)).size, 1, '한 줄');
  const last = b.roles.get(b.order[b.order.length - 1]);
  assert.equal(b.builder.x, last.x);
  assert.equal(b.builder.y, last.y + last.h + RIG_MAP.BGAP);
  assert.deepEqual(b.raises.map((r) => r.role), a.raises.map((r) => r.role));
  assert.equal(b.h, b.builder.y + b.builder.h);
  // 카드 사이 틈: 적어도 나무 칸 사이(LINE.GX), 줄 글 칩(11.5px)과 양옆 빈칸이 든다
  assert.equal(RIG_MAP.GAP, LINE.GX);
  for (let i = 0; i + 1 < b.order.length; i++) {
    const A = b.roles.get(b.order[i]), B = b.roles.get(b.order[i + 1]), gap = B.x - (A.x + A.w);
    assert.ok(gap >= RIG_MAP.GAP, String(gap));
    const p = b.pairs.find((x) => x.a === b.order[i] && x.b === b.order[i + 1]);
    if (p) for (const [side, w] of [[p.lines.top, 'top'], [p.lines.bottom, 'bottom']]) if (side) assert.ok(gap >= mapLabW(lineText(side, w)) + 2 * RIG_MAP.LABM, w + ' ' + gap);
  }
  // 줄 글은 옛 13px이 아니라 세션 맵 선 이름표 크기(11.5px)로 잰다
  assert.equal(RIG_MAP.LABPX, 11.5);
  assert.ok(mapLabW('data_request →') < textW13('data_request →') + 18 + 1);
});

test('P261 줄 말투: 두 줄은 가운데에서 DY 떨어지고 카드 변에서 BACK만큼 띄운다(화살촉은 marker), 글 칩 자리', () => {
  const g = v7Layout(TRADE(), rigMapOpts(300));
  const p = g.pairs.find((x) => x.key === 'data|ideas');
  const A = g.roles.get('data'), B = g.roles.get('ideas'), y = A.y + A.h / 2, mx = (A.x + A.w + B.x) / 2;
  assert.equal(p.top.d, `M${A.x + A.w} ${y - RIG_MAP.DY} L${B.x - RIG_MAP.BACK} ${y - RIG_MAP.DY}`);
  assert.equal(p.bottom.d, `M${B.x} ${y + RIG_MAP.DY} L${A.x + A.w + RIG_MAP.BACK} ${y + RIG_MAP.DY}`);
  assert.deepEqual(p.topLab, [mx, y - RIG_MAP.LAB]); assert.deepEqual(p.botLab, [mx, y + RIG_MAP.LAB]); assert.deepEqual(p.wait, [mx, y + RIG_MAP.WAIT]);
  // 캔버스·시안 기본값(twoLines 기본 G = V7)은 그대로
  const o = twoLines([0, 0], [100, 0]);
  assert.equal(o.top.d, `M0 -${V7.DY} L${100 - 2 * V7.W1} -${V7.DY}`);
  // 그리는 쪽: 세션 맵 선 클래스·화살촉, 인라인 색 없음, 글은 선 이름표 칩
  const rm = read('RigMap.jsx');
  for (const s of ['mt-ta-edge k-rig', 'mt-sm-tip', 'mt-ta-elab', 'k-raise', 'rm-line', 'rm-wait', 'rm-open-return', 'rm-raise', 'rm-line-label']) assert.ok(rm.includes(s), s);
  assert.ok(!/V7\.C\b|stroke=\{|fill=\{V7/.test(rm), '인라인 색 없음');
  assert.ok(!/scale\(/.test(rm), '확대 없음(세계 배율 1)');
  const css = read('styles.css');
  assert.ok(/\.mt-sm \.mt-ta-edge\.k-rig[^{]*\{ --ec: #8e8b83; \}/.test(css));
  assert.ok(/\.mt-sm \.mt-ta-edge\.k-raise \{ stroke-dasharray/.test(css), '노랑 점선은 올림에만');
  assert.ok(!/\.mt-rig7-card/.test(css), '옛 V7 카드 규칙은 걷었다');
  assert.ok(/\.mt-sm-rig \{[^}]*font-size: 10\.5px/.test(css), '꼬리표는 리드 꼬리표와 같은 크기');
});

test('P261 rigCardBoxes: 역할·빌더 카드 상자는 묶음 자리 + 배치 자리, 노드는 판 그래프의 그 세션(없으면 지도 자료), 꼬리표 글', () => {
  const graph = GRAPH(), g2 = hideRigSessions(graph, true), cw = mapCardW(g2);
  const m = TRADE();
  const geo = new Map([[m.workspace, v7Layout(m, rigMapOpts(cw))]]);
  const lay = lineageLayout(g2, { routing: false, rigBlocks: new Map([[m.workspace, { w: geo.get(m.workspace).w, h: geo.get(m.workspace).h }]]) });
  const it = lay.rigs[0];
  assert.equal(it.w, geo.get(m.workspace).w, '세계 배율 1');
  const live = new Map([['s-ideas', { sessionId: 's-ideas', name: 'trade-ideas', state: 'waiting', kind: 'claude', lastPrompt: 'Which window?' }]]);
  const boxes = rigCardBoxes(lay, [m], geo, graph, live, t);
  assert.equal(boxes.size, 5);
  const byName = new Map([...boxes.values()].map((b) => [b.rig.name, b]));
  const d = byName.get('data'), g = geo.get(m.workspace);
  assert.deepEqual([d.x, d.y, d.w, d.h], [it.x + g.roles.get('data').x, it.y + g.roles.get('data').y, cw, rigCardH(cw)]);
  assert.equal(d.node.id, 's:data', '판 그래프 노드(일·모델이 든다)');
  assert.equal(d.rig.chip, '역할 · data · v2');
  assert.equal(byName.get('ideas').node.state, 'waiting', '창의 세션 값');
  assert.equal(byName.get('verify').node.name, 'trade-verify', '지도 자료 이름');
  const b = byName.get(BUILDER_ROLE);
  assert.deepEqual([b.rig.kind, b.rig.chip, b.rig.extra, b.node.id], ['builder', 'rig 빌더', '올림 1', 's:bld']);
  assert.ok(!lay.cards.has('s:data') && !lay.cards.has('s:bld'), '트리에는 없다');
  // 세션 없는 역할
  const m2 = { ...m, roles: [...m.roles, { name: 'extra', docN: null, session: null }], flows: [] };
  const geo2 = new Map([[m.workspace, v7Layout(m2, rigMapOpts(cw))]]);
  const nb = [...rigCardBoxes(lay, [m2], geo2, graph, new Map(), t).values()].find((x) => x.rig.name === 'extra');
  assert.ok(nb.rig.none && nb.rig.chip === '역할 · extra');
  // 꺼진 rig는 흐리게
  const off = rigCardBoxes(lay, [{ ...m, status: 'off' }], new Map([[m.workspace, v7Layout({ ...m, status: 'off' }, rigMapOpts(cw))]]), graph, new Map(), t);
  assert.ok([...off.values()].every((x) => x.rig.dim));
});

test('P261 세션 맵: 카드는 보통 Card(rig 꼬리표·data-role rm-role·rm-builder), 옛 V7.SCALE 확대와 옛 카드 없음', () => {
  const src = read('MissionLineage.jsx');
  assert.ok(/rigMapOpts\(rigCw\)/.test(src) && /rigCardBoxes\(/.test(src));
  assert.ok(!/V7\.SCALE/.test(src), '1.5배 확대 없음');
  assert.ok(/data-role="rm-tag"/.test(src) && /'rm-builder' : 'rm-role'/.test(src));
  assert.ok(/\[\.\.\.rigCards\]\.map\(\(\[id, b\]\) => <Card /.test(src), '보통 Card로 그린다');
  assert.ok(!/mt-rig7-card/.test(read('RigMap.jsx')));
});
