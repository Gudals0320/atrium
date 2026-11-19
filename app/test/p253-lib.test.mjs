// P253 창 단위 시험: 세션 맵 rig 지도 2차(docs research rig3-map.md 8절). 쌍마다 선 하나·이름표 줄·화살촉 쪽·0이면 수 없음·붉은 점,
// 이웃한 쌍이 가장 많은 한 줄 차례(rig-trade: 곧은 선 셋, 위로 도는 선 하나), 사람·빌더 선 없음, 카드 줄과 같은 크기,
// 트리 위 고정된 rig 띠(트리와 따로, 접기 기억), 줌(이름표 계단)에 따라 열이 바뀌지 않음(창 크기만).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mapLayout, placeMaps, cardLines, pairRows, rowText, rowOrder, foldedOf, periodText, RM, RIG_VIEW, hideRigSessions, BUILDER_ROLE } from '../src/renderer/lib/rig-map.js';
import { lineageLayout, pickColumns, todayWorkspaces } from '../src/renderer/lib/mission-lineage.js';
import ko from '../src/renderer/locales/ko.js';
import en from '../src/renderer/locales/en.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, '..', 'src', 'renderer');

// rig-trade 모양(역할 넷, 길 아홉, 사람 입력 셋, 박자 data, trade는 따로 박자). 이름만 같고 모델 등은 시험 값
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
const role = (name, o = {}) => ({ name, launcher: 'claude', model: 'haiku', docN: 1, session: { sessionId: 's-' + name, name: 'trade-' + name, state: 'sleeping', asleep: true }, received: o.received || 0, unanswered: o.unanswered || 0, sectors: (o.owns || [name + '/']).map((p) => ({ path: p, items: o.items || [], more: 0 })), tools: o.tools || [], intake: o.intake || [], beat: o.beat || null });
const TRADE = (o = {}) => ({
  workspace: o.ws || 'C:/w/trade', status: o.status || 'on', enabled: true, name: o.name || 'rig-trade', versionN: 1,
  head: { cycle: 2, nextAt: null, beat: { every: '1d', at: '07:30', role: 'data' }, attention: 0, stalled: 0, raises: 1 },
  builder: { sessionId: 'b1', name: 'trade-builder', state: 'sleeping', asleep: true },
  raises: o.raises || [{ id: 'r1', role: 'verify', reason: '기준이 없다', t: 1 }],
  roles: [
    role('data', { beat: { every: '1d', at: '07:30', cycle: true }, tools: [{ name: 'fetch', every: '1h', last: null, alarms: 0 }], intake: ['data_request'] }),
    role('ideas', { intake: ['seed'], items: [{ id: 'hypothesis-2', state: 'returned', t: 9 }, { id: 'hypothesis-1', state: 'accepted', t: 5 }], unanswered: 1 }),
    role('verify', { owns: ['verify/', 'strategies/'], tools: [{ name: 'holdout', every: null, last: null, alarms: 0 }], received: 1 }),
    role('trade', { beat: { every: '1d', at: '08:30' }, tools: [{ name: 'executor', every: '5m', last: { status: 'done', at: 1 }, alarms: 0 }], intake: ['halt'] }),
  ],
  flows: FLOWS.map((f, i) => ({ i, ...f, for: f.for || null, human: f.from.includes('human'), waiting: f.item === 'result' ? 1 : 0, openReturns: f.item === 'hypothesis' ? 1 : 0, cycle: f.item === 'hypothesis' ? { put: 2, accepted: 1, returned: 1 } : f.item === 'dataset' ? { put: 0 } : null, last: [] })),
  intake: [], cycleItems: [], entry: null,
});

test('P253 rowOrder: 이웃한 쌍이 가장 많은 한 줄 차례, 같은 값이면 박자 역할 앞(rig-trade = data, ideas, verify, trade)', () => {
  const names = ['data', 'ideas', 'verify', 'trade'];
  assert.deepEqual(rowOrder(names, FLOWS, { beatRole: 'data' }), ['data', 'ideas', 'verify', 'trade']);
  // 정의 차례가 달라도 같다
  assert.deepEqual(rowOrder(['trade', 'verify', 'ideas', 'data'], FLOWS, { beatRole: 'data' }), ['data', 'ideas', 'verify', 'trade']);
  // 앞으로 가는 길이 왼쪽 → 오른쪽: 사슬 a → b → c는 박자 없이도 a, b, c
  assert.deepEqual(rowOrder(['c', 'b', 'a'], [{ item: 'x', from: ['a'], to: ['b'] }, { item: 'y', from: ['b'], to: ['c'] }]), ['a', 'b', 'c']);
});

test('P253 mapLayout(rig-trade): 쌍마다 선 하나, 곧은 선 셋과 위로 도는 선 하나, 사람·빌더 선 없음', () => {
  const g = mapLayout(TRADE());
  assert.deepEqual(g.order, ['data', 'ideas', 'verify', 'trade']);
  assert.equal(g.pairs.length, 4, '길 아홉, 쌍 넷');
  const st = g.pairs.filter((p) => p.straight).map((p) => p.key).sort();
  assert.deepEqual(st, ['data|ideas', 'ideas|verify', 'trade|verify'.split('|').reverse().join('|')].sort());
  const lane = g.pairs.filter((p) => !p.straight);
  assert.deepEqual(lane.map((p) => p.key), ['data|verify']);
  // 위로 도는 선은 카드 위로 지나간다
  assert.ok(Math.max(...lane[0].pts.slice(1, 3).map((p) => p[1])) < g.roles.get('data').y);
  // 사람·빌더에게 가는 선은 없다
  assert.ok(g.pairs.every((p) => !['human', BUILDER_ROLE].includes(p.a) && !['human', BUILDER_ROLE].includes(p.b)));
  // 곧은 선은 카드 가운데 높이, 이웃 카드 사이
  const di = g.pairs.find((p) => p.key === 'data|ideas'), D = g.roles.get('data'), I = g.roles.get('ideas');
  assert.equal(di.pts[0][1], D.y + D.h / 2); assert.ok(di.pts[0][0] >= D.x + D.w && di.pts[1][0] <= I.x);
  // 이름표는 선 위(가운데), 틈 안
  assert.ok(di.label.x >= D.x + D.w && di.label.x + di.label.w <= I.x);
  assert.ok(di.label.y < di.pts[0][1] && di.label.y + di.label.h > di.pts[0][1]);
});

test('P253 이름표 줄: 방향마다 한 줄(fwd "종류 →", back "← 종류"), 화살촉은 그 방향 길이 있는 쪽에만, 수는 0이 아닐 때만, 끝나지 않은 반려는 붉은 점', () => {
  const g = mapLayout(TRADE());
  const P = (k) => g.pairs.find((p) => p.key === k);
  const iv = P('ideas|verify');
  assert.deepEqual(iv.rows.map(rowText), ['hypothesis 2 →', '← result']);
  assert.deepEqual(iv.rows.map((r) => r.open), [true, false]);
  assert.deepEqual([iv.tipA, iv.tipB], [true, true]);
  const dv = P('data|verify');
  assert.deepEqual(dv.rows.map(rowText), ['dataset →'], '이번 사이클 수 0이면 붙이지 않는다');
  assert.deepEqual([dv.tipA, dv.tipB], [false, true], '한 방향 길: 받는 쪽에만 화살촉');
  assert.deepEqual(P('data|ideas').rows.map(rowText), ['data_reply →', '← data_request']);
  assert.deepEqual(P('verify|trade').rows.map(rowText), ['strategy →', '← live_report']);
  // 사람이 낸 data_request는 이름표에 들어가지 않는다(ideas → data 길만)
  assert.deepEqual(pairRows('data', 'ideas', TRADE().flows).find((r) => r.item === 'data_request').dir, 'back');
  // 기다림이 있으면 그 쌍이 밝다
  assert.ok(iv.rows.some((r) => r.waiting));
});

test('P253 역할 카드: 자기 것을 다 담는다(세션·박자·쥔 것·최근·도구·입력·받음·올림), 해당 없는 줄은 빼고, 카드는 폭과 높이가 모두 같다', () => {
  const m = TRADE();
  const g = mapLayout(m);
  const ks = (n) => g.roles.get(n).lines.map((l) => l.k);
  assert.deepEqual(ks('data'), ['session', 'beat', 'owns', 'tool', 'intake']);
  assert.deepEqual(ks('ideas'), ['session', 'owns', 'recent', 'intake', 'counts']);
  assert.deepEqual(ks('verify'), ['session', 'owns', 'tool', 'counts', 'raise']);
  assert.deepEqual(ks('trade'), ['session', 'beat', 'owns', 'tool', 'intake']);
  assert.deepEqual(g.roles.get('verify').lines.find((l) => l.k === 'owns').paths, ['verify/', 'strategies/']);
  assert.equal(g.roles.get('data').lines.find((l) => l.k === 'beat').cycle, true);
  const sizes = new Set([...g.roles.values()].map((b) => b.w + 'x' + b.h));
  assert.equal(sizes.size, 1, '폭·높이 같음');
  const b = g.roles.get('data');
  assert.equal(b.h, RM.CPADY * 2 + RM.TITLEH + 5 * RM.LINEH, '가장 줄이 많은 카드에 맞춘다');
  // 카드들은 한 줄(같은 y), 지도 아래에 사이클 띠와 변경 기록 띠 한 줄씩
  assert.equal(new Set([...g.roles.values()].map((r) => r.y)).size, 1);
  assert.ok(g.cycle.y > b.y + b.h && g.entry.y > g.cycle.y && g.cycle.h === RM.BANDH && g.entry.h === RM.BANDH);
  assert.deepEqual(cardLines(null, m), []);
});

test('P253 접기: 접으면 머리 띠 한 줄, 기억한 값이 이기고 없으면 꺼진 rig만 접힌다', () => {
  const m = TRADE();
  const f = mapLayout(m, { folded: true });
  assert.deepEqual([f.folded, f.h, f.pairs.length], [true, RM.FOLDH, 0]);
  assert.equal(f.w, mapLayout(m).w, '접어도 폭은 같다');
  assert.equal(foldedOf(m, {}), false);
  assert.equal(foldedOf({ ...m, status: 'off' }, {}), true);
  assert.equal(foldedOf({ ...m, status: 'off' }, { [m.workspace]: false }), false);
  assert.equal(foldedOf(m, { [m.workspace]: true }), true);
});

// 세션 맵 트리(rig 역할·빌더는 뺀다)
const graph = () => ({
  nodes: [
    { id: 's:lead', kind: 'session', sessionId: 'lead', name: 'lead', workspaceKey: 'C:/w/app', state: 'ready', peers: [] },
    { id: 's:w1', kind: 'session', sessionId: 'w1', name: 'w1', workspaceKey: 'C:/w/app', state: 'ready', parentId: 's:lead', peers: [] },
    { id: 's:data', kind: 'session', sessionId: 's-data', name: 'trade-data', workspaceKey: 'C:/w/trade', state: 'ready', rigRole: 'data', peers: [] },
    { id: 's:bld', kind: 'session', sessionId: 'b1', name: 'trade-builder', workspaceKey: 'C:/w/trade', state: 'ready', rigRole: BUILDER_ROLE, peers: [] },
  ],
  edges: [{ from: 's:lead', to: 's:w1', kind: 'spawn' }],
});

test('P253 rig 띠 자리: 트리 위 고정된 자리(왼쪽 정렬, 트리 위), 여럿이면 차례로, 트리 배치와 서로 영향 없음', () => {
  const g = hideRigSessions(graph(), RIG_VIEW.hideInTree);
  const lay = lineageLayout(g, {});
  assert.ok(!lay.rows.some((r) => r.key === 'C:/w/trade'), '역할만 있는 워크스페이스는 트리에 줄을 두지 않는다(지도와 따로)');
  const m1 = TRADE({ ws: 'C:/w/trade', name: 'rig-trade' }), m2 = TRADE({ ws: 'C:/w/alpha', name: 'alpha' });
  const geo = new Map([[m1.workspace, mapLayout(m1)], [m2.workspace, mapLayout(m2, { folded: true })]]);
  const p = placeMaps(lay, [m1, m2], geo);
  assert.deepEqual(p.items.map((i) => i.key), ['C:/w/alpha', 'C:/w/trade'], '이름 차례로 위에서 아래');
  const [a, b] = p.items;
  assert.equal(a.x, lay.bounds.x); assert.equal(b.x, lay.bounds.x);
  assert.equal(b.y, a.y + a.h + RM.MAPGAP);
  assert.equal(b.y + b.h + RM.RIGGAP, lay.bounds.y, '트리는 그 아래에서 시작');
  assert.equal(a.w, geo.get(a.key).w * RM.SCALE);
  assert.equal(p.bounds.y, a.y); assert.equal(p.bounds.y + p.bounds.h, lay.bounds.y + lay.bounds.h);
  // 지도가 있어도 트리 배치는 같다(트리는 지도를 모른다)
  const lay2 = lineageLayout(g, {});
  assert.deepEqual([...lay2.cards.entries()].map(([k, c]) => [k, c.x, c.y]), [...lay.cards.entries()].map(([k, c]) => [k, c.x, c.y]));
  // 지도의 크기가 바뀌어도(접기) 트리 카드는 그대로, 지도의 x는 트리 열과 상관없다
  const p2 = placeMaps(lay, [m1, m2], new Map([[m1.workspace, mapLayout(m1, { folded: true })], [m2.workspace, mapLayout(m2, { folded: true })]]));
  assert.equal(p2.items.at(-1).y + p2.items.at(-1).h + RM.RIGGAP, lay.bounds.y);
  assert.equal(placeMaps(lay, [], geo), null);
  // 세션 맵은 keepKeys를 더는 주지 않고, rig 띠와 워크스페이스 줄을 잇는 선이 없다
  const src = fs.readFileSync(path.join(SRC, 'MissionLineage.jsx'), 'utf8');
  assert.ok(!/keepKeys:/.test(src) && !/rm-link/.test(src));
  // 역할 세션만 있는 판(트리 카드 0)에서도 빈 트리 글(mission.empty)은 rig 띠가 있으면 띄우지 않는다(지도와 겹치지 않게)
  assert.ok(/lay\.cards\.size === 0 && !lay\.rig && <div className="mt-ta-loading">\{t\('mission\.empty'\)\}/.test(src));
  const empty = lineageLayout({ nodes: [], edges: [] }, {});
  const pe = placeMaps(empty, [m1], new Map([[m1.workspace, mapLayout(m1)]]));
  assert.ok(pe && pe.items[0].y + pe.items[0].h <= empty.bounds.y, '트리가 비어도 rig 띠는 트리 자리 위');
  // 접은 상태를 기억한다
  assert.ok(/atrium\.sessionMap\.rigFold/.test(src) && /saveRigFold\(/.test(src));
});

// ---- 줌에 따라 열이 바뀌지 않는다(창 크기만) ----
const MID = new Date(2026, 10, 17, 0, 0, 0).getTime(), NOON = MID + 12 * 3600e3, OLD = MID - 3 * 86400e3;
const FOLDERS = [
  { id: 'gz', name: 'zeta', members: ['d:/w/z1', 'd:/w/z2'] }, { id: 'ga', name: 'Alpha', members: ['d:/w/a2', 'd:/w/a10', 'd:/w/a1'] },
  { id: 'gn', name: '나무', members: ['d:/w/n1'] }, { id: 'gb', name: 'beta', members: ['d:/w/b1'] }, { id: 'gk', name: '가람', members: ['d:/w/k1'] },
];
const S = [
  ['z-lead', 'd:/w/z1', null, MID + 3600e3], ['z-kid', 'd:/w/z1', 'z-lead', OLD], ['z2-solo', 'd:/w/z2', null, OLD],
  ['a1', 'd:/w/a1', null, OLD], ['a2', 'd:/w/a2', null, OLD], ['a10-lead', 'd:/w/a10', null, OLD], ['a10-kid', 'd:/w/a10', 'a10-lead', OLD], ['a10-kid2', 'd:/w/a10', 'a10-lead', OLD],
  ['n1', 'd:/w/n1', null, OLD, 'working'], ['n1-peer', 'd:/w/n1', null, OLD], ['b1', 'd:/w/b1', null, OLD], ['b1-x', 'd:/w/b1', 'z-lead', OLD],
  ['k1', 'd:/w/k1', null, OLD], ['k1-2', 'd:/w/k1', null, OLD], ['k1-3', 'd:/w/k1', null, OLD], ['loose1', 'd:/w/loose', null, MID + 10], ['old-loose', 'd:/w/old', null, OLD],
];
const G = { nodes: S.map(([name, ws, parent, activeAt, state], i) => ({ id: 's:' + name, kind: 'session', sessionId: 'x-' + name, name, workspaceKey: ws, state: state || 'sleeping', parentId: parent ? 's:' + parent : null, createdAt: i + 1, activeAt })), edges: S.filter((x) => x[2]).map(([name, , parent]) => ({ from: 's:' + parent, to: 's:' + name, kind: 'spawn', count: 1 })) };
const TODAY = todayWorkspaces(G.nodes, { now: NOON, tierOf: (n) => (n.state === 'working' ? 'work' : 'rest') });
const BASE = { vgroups: FOLDERS, today: TODAY, noFolder: 'No folder', routing: false, columns: 'auto' };
const LABELS = [1, 0.6, 0.35, 0.18];

test('P253 줌 버그: 열 수는 이름표 계단(줌)으로 바뀌지 않고 보기 칸(창 크기)으로만 바뀐다', () => {
  // 고치기 전 판단(그 계단의 한 열 배치로 잼)은 이 창에서 줌에 따라 한 열·두 열이 바뀌었다
  const view = { w: 1600, h: 800 };
  const old = LABELS.map((label) => pickColumns(lineageLayout(G, { ...BASE, columns: 1, label }).measure, view));
  assert.ok(new Set(old).size > 1, '버그를 다시 만든다: ' + old.join(''));
  const now = LABELS.map((label) => lineageLayout(G, { ...BASE, label, view }).ncol);
  assert.equal(new Set(now).size, 1, '고친 뒤: ' + now.join(''));
  // 여러 창 크기에서 줌을 바꿔도 열 수가 같다
  for (let w = 700; w <= 2600; w += 300) for (let h = 400; h <= 1800; h += 350) {
    const ns = LABELS.map((label) => lineageLayout(G, { ...BASE, label, view: { w, h } }).ncol);
    assert.equal(new Set(ns).size, 1, `${w}x${h}: ${ns.join('')}`);
  }
  // 창 크기가 바뀌면 다시 정한다(넓고 낮은 창 = 두 열, 좁은 창 = 한 열)
  assert.equal(lineageLayout(G, { ...BASE, view: { w: 2600, h: 600 } }).ncol, 2);
  assert.equal(lineageLayout(G, { ...BASE, view: { w: 700, h: 1800 } }).ncol, 1);
});

test('P253 주기 말(P252 periodText와 같은 꼴)과 두 사전의 rigMap2·rigPeriod 열쇠', () => {
  const t = (k, v = {}) => { const o = k.split('.').reduce((a, x) => (a ? a[x] : undefined), ko); return String(o).replace(/\{(\w+)\}/g, (_, x) => v[x]); };
  assert.equal(periodText('1d', '07:30', t), '매일 07:30');
  assert.equal(periodText('5m', null, t), '5분마다');
  assert.equal(periodText('1h', null, t), '매시간');
  assert.equal(t('rigMap2.beatCycle', { period: periodText('1d', '07:30', t) }), '매일 07:30에 사이클을 연다');
  const keys = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' && !('one' in v) ? keys(v, p + k + '.') : [p + k]));
  assert.deepEqual(keys(ko.rigMap2).sort(), keys(en.rigMap2).sort());
  assert.deepEqual(keys(ko.rigPeriod).sort(), keys(en.rigPeriod).sort());
});
