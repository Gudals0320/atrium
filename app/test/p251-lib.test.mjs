// P251 창 단위 시험: rig 구조 지도 배치(mapLayout·placeMaps), 세션 맵 트리에서 빼기(hideRigSessions, keepKeys 줄), 캔버스 길 선(rigEdges)·꼬리표(rigTag)·테두리, 6절 넷의 뒤집기 자리, 휴대폰 카드, 두 사전의 rigMap 글
import test from 'node:test';
import assert from 'node:assert/strict';
import { mapLayout, placeMaps, hideRigSessions, rigEdges, rigTag, rigFrames, roleSessions, pathText, flowText, untilText, phoneRig, stackHeight, RIG_VIEW, RM, BUILDER_ROLE } from '../src/renderer/lib/rig-map.js';
import { lineageLayout } from '../src/renderer/lib/mission-lineage.js';
import ko from '../src/renderer/locales/ko.js';
import en from '../src/renderer/locales/en.js';

const tt = (k, v = {}) => k + JSON.stringify(v);
const role = (name, o = {}) => ({ name, launcher: 'claude', model: 'haiku', session: o.sid ? { sessionId: o.sid, name, state: 'ready', asleep: false } : null, received: 0, sectors: o.sectors || [{ path: name + '/', items: o.items || [], more: o.more || 0 }], tools: o.tools || [], intake: o.intake || [], beat: o.beat || null, docN: o.docN ?? 2 });
const MAP = (o = {}) => ({
  workspace: o.ws || 'C:/w/trade', status: o.status || 'on', enabled: (o.status || 'on') === 'on', name: 'trade', versionN: 7,
  head: { cycle: 12, nextAt: null, attention: 1, stalled: 0, raises: 1 },
  builder: o.builder === false ? null : { sessionId: 'b1', name: 'builder', state: 'ready', asleep: false },
  raises: o.raises || [{ role: 'verify', reason: '기준이 없다', t: 1 }],
  roles: [
    role('data', { sid: 's-data', beat: { every: '1d', at: '07:00', cycle: true }, tools: [{ name: 'fetch', every: '1h', last: null, alarms: 0 }], items: [{ id: 'snapshot-2', state: 'waiting' }, { id: 'snapshot-1', state: 'accepted' }], more: 3 }),
    role('ideas', { sid: 's-ideas', intake: ['hint'] }),
    role('news', { sid: 's-news' }),
    role('verify', { sid: 's-verify' }),
  ],
  flows: [
    { i: 0, item: 'snapshot', from: ['data'], to: ['ideas', 'news'], waiting: 2, openReturns: 0, cycle: { put: 2, accepted: 1, returned: 0 }, last: [] },
    { i: 1, item: 'hypothesis', from: ['ideas'], to: ['verify'], waiting: 0, openReturns: 1, cycle: { put: 3, accepted: 2, returned: 1 }, last: [{ id: 'hypothesis-1', state: 'returned', t: 5, reason: '미래 참조' }] },
    { i: 2, item: 'result', from: ['verify'], to: ['ideas'], for: 'hypothesis', waiting: 0, openReturns: 0, cycle: null, last: [] },
    { i: 3, item: 'data-request', from: ['verify'], to: ['data'], waiting: 0, openReturns: 0, cycle: null, last: [] },
    { i: 4, item: 'hint', from: ['human'], to: ['ideas'], human: true, waiting: 0, openReturns: 0, cycle: null, last: [] },
  ],
  intake: [{ item: 'hint', to: ['ideas'] }],
  cycleItems: [], entry: { n: 11, text: '## 사이클 11\n\n요령을 고쳤다' },
});

test('P251 mapLayout: 역할을 길 차례로 칸에(가지는 같은 칸 아래로), 섹터·도구는 주인 아래, 선 종류(곧은·위 길·답·사람·올림·고침), 열린 반려 붉은 점', () => {
  const g = mapLayout(MAP());
  assert.equal(g.folded, false);
  const b = (n) => g.roles.get(n);
  assert.ok(b('data').x < b('ideas').x && b('ideas').x === b('news').x && b('verify').x > b('ideas').x);
  assert.ok(b('news').y >= b('ideas').y + stackHeight(MAP().roles[1]));
  assert.ok(g.out.x + g.out.w <= g.zone.x); // rig 밖 칸이 왼쪽
  const sec = g.sectors.find((s) => s.role === 'data');
  assert.equal(sec.x, b('data').x + 18); assert.ok(sec.y >= b('data').y + RM.RH);
  assert.equal(g.tools.find((x) => x.role === 'data').name, 'fetch');
  const kinds = (k) => g.lines.filter((l) => l.kind === k).map((l) => `${l.from}>${l.to}`).sort();
  assert.deepEqual(kinds('direct'), ['data>ideas', 'data>news', 'ideas>verify']);
  assert.deepEqual(kinds('answer'), ['verify>ideas']);
  assert.deepEqual(kinds('lane'), ['verify>data']);
  assert.deepEqual(kinds('intake'), ['human>ideas']);
  assert.deepEqual(kinds('raise'), ['verify>' + BUILDER_ROLE]);
  assert.equal(kinds('fix').length, 1);
  const hyp = g.lines.find((l) => l.flow === 1);
  assert.deepEqual(hyp.openEnd, hyp.pts[0]); // 낸 쪽 끝
  assert.equal(g.lines.find((l) => l.from === 'data' && l.to === 'ideas').hot, true);
  // 위 길은 카드 위로 지나간다(카드를 덮지 않게)
  const lane = g.lines.find((l) => l.kind === 'lane');
  assert.ok(Math.min(...lane.pts.map((p) => p[1])) < b('data').y);
  assert.ok(g.cycle && g.entry && g.h > g.entry.y);
});

test('P251 mapLayout: 꺼진 rig는 접힌 카드, 펴면 흐린 지도. 역할이 MAXCOLS칸을 넘으면 줄을 바꾼다', () => {
  const off = mapLayout(MAP({ status: 'off' }));
  assert.deepEqual([off.folded, off.w, off.h], [true, RM.FOLDW, RM.FOLDH]);
  const open = mapLayout(MAP({ status: 'off' }), { open: true });
  assert.equal(open.folded, false); assert.equal(open.dim, true);
  const chain = ['a', 'b', 'c', 'd', 'e', 'f'];
  const m = { ...MAP(), roles: chain.map((n) => role(n)), flows: chain.slice(1).map((n, i) => ({ i, item: 'k' + i, from: [chain[i]], to: [n], waiting: 0, openReturns: 0 })), raises: [], intake: [] };
  const g = mapLayout(m);
  assert.equal(g.roles.get('e').line, 1); assert.equal(g.roles.get('e').col, 0);
  assert.ok(g.roles.get('e').y > g.roles.get('a').y + RM.RH);
  // 줄을 건너는 d → e는 곧은 선이 아니라 위 길
  assert.equal(g.lines.find((l) => l.from === 'd' && l.to === 'e').kind, 'lane');
});

test('P251 6절 뒤집기 자리: RIG_VIEW 기본값과 섹터 오른쪽 칸', () => {
  assert.deepEqual(RIG_VIEW, { sectorsUnder: true, hideInTree: true, canvasExtras: false, canvasFrame: false });
  const g = mapLayout(MAP(), { sectorsUnder: false });
  assert.ok(g.side && g.side.x > g.zone.x + g.zone.w);
  assert.ok(g.sectors.every((s) => s.side && s.x === g.side.x));
  assert.equal(g.roles.get('ideas').stack, RM.RH);
});

const graph = () => ({
  nodes: [
    { id: 's:lead', kind: 'session', sessionId: 'lead', name: 'lead', workspaceKey: 'C:/w/app', state: 'ready', peers: [] },
    { id: 's:w1', kind: 'session', sessionId: 'w1', name: 'w1', workspaceKey: 'C:/w/app', state: 'ready', parentId: 's:lead', peers: [] },
    { id: 's:data', kind: 'session', sessionId: 's-data', name: 'data', workspaceKey: 'C:/w/trade', state: 'ready', rigRole: 'data', peers: [] },
    { id: 's:bld', kind: 'session', sessionId: 'b1', name: 'builder', workspaceKey: 'C:/w/trade', state: 'ready', rigRole: BUILDER_ROLE, peers: [] },
    { id: 's:kid', kind: 'session', sessionId: 'kid', name: 'kid', workspaceKey: 'C:/w/trade', state: 'ready', parentId: 's:data', lineageParent: 's:data', peers: [] },
  ],
  edges: [{ from: 's:lead', to: 's:w1', kind: 'spawn' }, { from: 's:data', to: 's:kid', kind: 'spawn' }],
});

test('P251 hideRigSessions: 역할·빌더 세션과 그 선을 트리에서 빼고 그 하위의 부모를 뗀다. 끄면 그대로', () => {
  const g = hideRigSessions(graph(), true);
  assert.deepEqual(g.nodes.map((n) => n.id), ['s:lead', 's:w1', 's:kid']);
  assert.equal(g.nodes.find((n) => n.id === 's:kid').parentId, null);
  assert.equal(g.edges.length, 1);
  const same = graph();
  assert.equal(hideRigSessions(same, false), same);
});

test('P251 세션 맵 rig 영역: 역할만 있는 워크스페이스도 줄이 남고(keepKeys), 지도는 트리 오른쪽에 그 줄과 위를 맞추며 겹치면 아래로', () => {
  const g = hideRigSessions(graph(), true);
  const lay = lineageLayout(g, { keepKeys: ['C:/w/trade', 'C:/w/other'] });
  const keys = lay.rows.map((r) => r.key);
  assert.ok(keys.includes('C:/w/trade') && keys.includes('C:/w/other'));
  const m1 = MAP({ ws: 'C:/w/trade' }), m2 = MAP({ ws: 'C:/w/other' });
  const geo = new Map([[m1.workspace, mapLayout(m1)], [m2.workspace, mapLayout(m2)]]);
  const p = placeMaps(lay, [m1, m2], geo);
  const it1 = p.items.find((x) => x.key === m1.workspace), it2 = p.items.find((x) => x.key === m2.workspace);
  const r1 = lay.rows.find((r) => r.key === m1.workspace), r2 = lay.rows.find((r) => r.key === m2.workspace);
  assert.ok(p.x >= lay.bounds.w + RM.AREAGAP - 1);
  const [first, second] = it1.y < it2.y ? [it1, it2] : [it2, it1];
  const rowOf = (it) => (it === it1 ? r1 : r2);
  assert.equal(first.y, rowOf(first).y + 12); // 위를 줄에 맞춘다
  assert.ok(second.y >= first.y + first.h + RM.MAPGAP); // 겹치면 아래로 민다(트리 줄 높이는 그대로)
  assert.equal(lay.rows.find((r) => r.key === m1.workspace).h >= 0, true);
  assert.ok(p.bounds.w > lay.bounds.w && p.bounds.h >= second.y + second.h);
  assert.equal(it1.link.pts[0][0], r1.x + r1.w); // 줄 오른쪽 끝에서 지도로 가는 선 하나
  assert.equal(it1.link.pts.at(-1)[0], it1.x);
  assert.equal(placeMaps(lay, [], geo), null);
});

test('P251 rigEdges: 켜진 rig만, 역할 쌍마다 하나(방향·기다림·열린 반려 끝), 연결 기록이 아니다. 올림은 빌더가 있을 때만 점선', () => {
  const sessions = new Map(['s-data', 's-ideas', 's-news', 's-verify', 'b1'].map((id) => [id, { sessionId: id, workspaceKey: 'C:/w/trade', rigRole: id === 'b1' ? BUILDER_ROLE : id.slice(2) }]));
  const es = rigEdges([MAP()], sessions);
  const paths = es.filter((e) => e.kind === 'path');
  assert.deepEqual(paths.map((e) => `${e.a}|${e.b}`).sort(), ['data|ideas', 'data|news', 'data|verify', 'ideas|verify']);
  const iv = paths.find((e) => e.a === 'ideas');
  assert.deepEqual([iv.source, iv.target, iv.fwd, iv.back, iv.openA, iv.openB], ['s-ideas', 's-verify', ['hypothesis'], ['result'], true, false]);
  assert.ok(paths.every((e) => e.id.startsWith('rig:') && !('linkId' in e)));
  const di = paths.find((e) => e.a === 'data' && e.b === 'ideas');
  assert.equal(di.waiting, 2); assert.equal(pathText(di, (k, v) => `${v.n}w`), 'snapshot → · 2w');
  assert.equal(pathText(iv, () => ''), 'hypothesis → · ← result');
  const raise = es.filter((e) => e.kind === 'raise');
  assert.deepEqual(raise.map((e) => [e.source, e.target]), [['s-verify', 'b1']]);
  assert.equal(rigEdges([MAP({ status: 'off' })], sessions).length, 0);
  assert.equal(rigEdges([MAP({ builder: false })], new Map([...sessions].filter(([k]) => k !== 'b1'))).filter((e) => e.kind === 'raise').length, 0);
  // 캔버스에 노드가 없는 역할은 빠진다
  assert.equal(rigEdges([MAP()], sessions, (sid) => sid !== 's-news').some((e) => e.b === 'news'), false);
});

test('P251 rigTag·roleSessions·rigFrames: 역할 꼬리표(정의서 판·입력 창구), 빌더 꼬리표, 창의 세션 값이 이긴다, 테두리 상자', () => {
  const m = MAP();
  assert.deepEqual(rigTag({ rigRole: 'ideas', workspaceKey: m.workspace }, () => m), { kind: 'role', role: 'ideas', docN: 2, intake: ['hint'], beat: null, sectors: ['ideas/'], ws: m.workspace });
  assert.deepEqual(rigTag({ rigRole: BUILDER_ROLE }, () => m), { kind: 'builder' });
  assert.equal(rigTag({ name: 'plain' }, () => m), null);
  const live = new Map([['new-data', { sessionId: 'new-data', workspaceKey: m.workspace, rigRole: 'data' }]]);
  assert.equal(roleSessions(m, live).get('data'), 'new-data');
  assert.equal(roleSessions(m, new Map()).get('ideas'), 's-ideas');
  const rects = { 's-data': { x: 0, y: 0, w: 100, h: 50 }, 's-ideas': { x: 300, y: 100, w: 100, h: 50 } };
  const fr = rigFrames([m], new Map(), (sid) => rects[sid] || null, 10);
  assert.deepEqual(fr, [{ ws: m.workspace, x: -10, y: -10, w: 420, h: 170 }]);
});

test('P251 글: flowText(이번 사이클 수), untilText, 휴대폰 rig 카드', () => {
  const t = (k, v = {}) => ({ 'rigMap.accepted': `받음 ${v.n}`, 'rigMap.returned': `반려 ${v.n}`, 'rigMap.waiting': `기다림 ${v.n}`, 'rigMap.forText': `${v.item}(${v.of}의 답)` })[k] || k;
  assert.equal(flowText(MAP().flows[1], t), 'hypothesis 3 · 받음 2 · 반려 1');
  assert.equal(flowText(MAP().flows[2], t), 'result(hypothesis의 답)');
  assert.deepEqual(untilText(1000 + 3 * 3600000, 1000), { n: 3, unit: 'h' });
  assert.equal(untilText(null), null);
  const c = phoneRig(MAP(), new Map([['s-ideas', { state: 'working' }]]));
  assert.deepEqual(c.roles.map((r) => [r.name, r.state]), [['data', 'ready'], ['ideas', 'working'], ['news', 'ready'], ['verify', 'ready']]);
  assert.equal(c.flows[1].open, 1); assert.equal(c.cycle, 12);
});

test('P251 두 사전의 rigMap 글: 같은 열쇠', () => {
  const keys = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' && !('one' in v) ? keys(v, p + k + '.') : [p + k]));
  assert.deepEqual(keys(ko.rigMap).sort(), keys(en.rigMap).sort());
  assert.ok(ko.rigMap.tagRole.includes('{name}') && en.rigMap.tagRole.includes('{name}'));
});
