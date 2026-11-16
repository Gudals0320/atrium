// P186 단위 시험: 세션 맵의 rig 자리·흐름 줄·건 목록(lib/rig-map.js), 배치(lib/mission-lineage.js)에 든 자리 묶음, 노드 메뉴 조건, 미리 보기 줄, rig 없는 판은 그대로
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rigIndex, seatThin, seatReps, flowLines, flowPaths, caseGroups, seatMenu, recentLines } from '../src/renderer/lib/rig-map.js';
import { lineageLayout } from '../src/renderer/lib/mission-lineage.js';
import en from '../src/renderer/locales/en.js';
import ko from '../src/renderer/locales/ko.js';

const R = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'renderer');
const read = (f) => fs.readFileSync(path.join(R, f), 'utf8');
const WS = 'C:/w/flow';

// 견본 rig(rig-flow-sample 모양): main keep, worker fresh, reviewer fresh, reviewer rejected → worker max 2
const FLOW = [
  { index: 0, from: 'main', on: 'assign', to: ['worker'], max: null, else: null, passed: 0 },
  { index: 1, from: 'worker', on: 'ok', to: ['reviewer'], max: null, else: null, passed: 0 },
  { index: 2, from: 'reviewer', on: 'rejected', to: ['worker'], max: 2, else: 'main', passed: 1 },
  { index: 3, from: 'reviewer', on: 'ok', to: ['main'], max: null, else: null, passed: 0 },
];
function sample({ rig = true, busy = 'worker-2' } = {}) {
  const sess = [
    { sid: 'm', name: 'main', seat: 'main', t: 1 },
    { sid: 'w1', name: 'worker-1', seat: 'worker', t: 2, parent: 'm' },
    { sid: 'r1', name: 'reviewer-1', seat: 'reviewer', t: 3, parent: 'm' },
    { sid: 'w2', name: 'worker-2', seat: 'worker', t: 4, parent: 'm' },
    { sid: 'x', name: 'helper', seat: null, t: 5, parent: 'm' },
  ];
  const nodes = sess.map((s) => ({ id: `s:${s.sid}`, kind: 'session', sessionId: s.sid, name: s.name, agentKind: 'claude', state: s.sid === 'w2' ? 'working' : 'idle', category: 'idle', workspaceKey: WS, parentId: s.parent ? `s:${s.parent}` : null, lineageParent: s.parent ? `s:${s.parent}` : null, peers: [], createdAt: s.t, rigSeat: s.seat }));
  const edges = sess.filter((s) => s.parent).map((s) => ({ from: `s:${s.parent}`, to: `s:${s.sid}`, kind: 'spawn', count: 0 }));
  const seat = (name, mode, ids) => ({ name, session: mode, sessions: ids.map((id) => ({ sessionId: id, name: id, open: true, busy: id === ({ 'worker-2': 'w2' })[busy] })), waiting: 0 });
  const R = { seats: [seat('main', 'keep', ['m']), seat('worker', 'fresh', ['w1', 'w2']), seat('reviewer', 'fresh', ['r1'])], flow: FLOW, manager: 'main', results: ['ok', 'failed', 'rejected'],
    cases: [
      { id: 'c1', owner: 'main', ownerSessionId: 'm', state: 'open', activeSeats: ['worker'], handoffs: 3, blockedReason: null, createdAt: 100, closedAt: null, lines: [{ index: 2, from: 'reviewer', on: 'rejected', to: ['worker'], max: 2, passed: 1, escalated: 0 }], units: [{ unit: 'u1', seat: 'worker', sessionId: 'w1', status: 'done', result: 'ok' }, { unit: 'u3', seat: 'worker', sessionId: 'w2', status: 'open', result: null }] },
      { id: 'c0', owner: 'main', ownerSessionId: 'm', state: 'done', activeSeats: [], handoffs: 2, blockedReason: null, createdAt: 10, closedAt: 50, lines: [], units: [] },
      { id: 'c2', owner: 'main', ownerSessionId: 'm', state: 'blocked', activeSeats: [], handoffs: 5, blockedReason: 'limit', createdAt: 90, closedAt: null, lines: [], units: [{ unit: 'u9', seat: 'reviewer', sessionId: null, status: 'open' }] },
    ] };
  return { nodes, edges, counts: {}, at: 0, rig: rig ? { [WS]: R } : {} };
}
const tiersOf = (g) => new Map(g.nodes.map((n) => [n.id, n.state === 'working' ? 'work' : 'rest']));

test('rigIndex: 켜진 rig 정의에 있는 자리 세션만, busy는 판의 seats.sessions에서. rig가 없으면 빈 표', () => {
  const ix = rigIndex(sample());
  assert.deepEqual(ix.byNode.get('s:m'), { ws: WS, seat: 'main', mode: 'keep', busy: false });
  assert.deepEqual(ix.byNode.get('s:w2'), { ws: WS, seat: 'worker', mode: 'fresh', busy: true });
  assert.equal(ix.byNode.has('s:x'), false);
  const off = rigIndex(sample({ rig: false }));
  assert.equal(off.byNode.size, 0); // rigSeat가 남아 있어도 rig가 꺼졌으면 이름표가 없다
  const g = sample(); g.nodes[1].rigSeat = 'nope';
  assert.equal(rigIndex(g).byNode.has('s:w1'), false); // 정의에 없는 자리
});

test('seatThin: 끝난 fresh 세션은 같은 자리의 일하는 카드 바로 뒤 얇은 줄, 일하는 세션이 없으면 가장 늦은 세션이 대표', () => {
  const ix = rigIndex(sample());
  const r = seatThin(['s:w1', 's:r1', 's:w2', 's:x'], ix);
  assert.deepEqual([...r.thin], ['s:w1']);
  assert.deepEqual(r.order, ['s:r1', 's:w2', 's:w1', 's:x']);
  // 아무도 바쁘지 않으면 가장 늦은 worker-2가 대표, worker-1은 그 뒤 얇은 줄
  const ix2 = rigIndex(sample({ busy: null }));
  const r2 = seatThin(['s:w1', 's:r1', 's:w2'], ix2);
  assert.deepEqual([...r2.thin], ['s:w1']);
  assert.deepEqual(r2.order, ['s:r1', 's:w2', 's:w1']);
  // can이 막으면(응답 필요 등) 카드로 남는다. 혼자인 자리·keep 자리는 줄이지 않는다
  assert.equal(seatThin(['s:w1', 's:w2'], ix, () => false).thin.size, 0);
  assert.equal(seatThin(['s:m', 's:r1'], ix).thin.size, 0);
  // rig 없음 = 그대로
  const same = ['s:w1', 's:w2'];
  assert.equal(seatThin(same, rigIndex(sample({ rig: false }))).order, same);
});

test('seatReps와 flowLines: keep = 앉은 세션, fresh = 일하는 세션(없으면 가장 늦은), 줄 값 이름과 n/max', () => {
  const g = sample(), ix = rigIndex(g), Rg = g.rig[WS];
  const reps = seatReps(Rg, WS, g.nodes, ix);
  assert.deepEqual(Object.fromEntries(reps), { main: 's:m', worker: 's:w2', reviewer: 's:r1' });
  const ls = flowLines(Rg, reps);
  assert.deepEqual(ls.map((l) => [l.from, l.to, l.label]), [['s:m', 's:w2', 'assign'], ['s:w2', 's:r1', 'ok'], ['s:r1', 's:w2', 'rejected 1/2'], ['s:r1', 's:m', 'ok']]);
  // 대표 카드가 없는 자리(그 자리 세션이 없다)의 줄은 뺀다
  const r2 = new Map(reps); r2.delete('reviewer');
  assert.deepEqual(flowLines(Rg, r2).map((l) => l.on), ['assign']);
  // has로 맵에 없는 카드(접힌 가지)는 대표가 되지 않는다
  assert.equal(seatReps(Rg, WS, g.nodes, ix, (id) => id !== 's:w2').get('worker'), 's:w1');
});

test('flowPaths: 같은 칸 줄은 오른쪽으로 부푼 곡선(차례로 더 크게), 칸이 다르면 관계 선(가운데)과 다른 높이', () => {
  const cards = new Map([['a', { x: 0, y: 0, w: 100, h: 80 }], ['b', { x: 300, y: 0, w: 100, h: 80 }], ['c', { x: 300, y: 200, w: 100, h: 80 }]]);
  const ps = flowPaths([{ id: '1', from: 'a', to: 'b' }, { id: '2', from: 'b', to: 'c' }, { id: '3', from: 'c', to: 'b' }, { id: '4', from: 'c', to: 'a' }], cards);
  assert.equal(ps.length, 4);
  assert.match(ps[0].d, /^M106 60 C/); // 왼 카드 오른 변 3/4 높이(관계 선은 1/2)
  assert.ok(ps[1].same && ps[2].same);
  assert.ok(ps[2].lx > ps[1].lx); // 둘째 같은 칸 줄은 더 크게 부푼다
  assert.ok(ps[1].lx > 400);
  assert.match(ps[3].d, /^M294 /); // 돌아오는 줄은 오른 카드 왼 변에서
});

test('caseGroups: 막힌 건 · 열린 건 · 최근 끝난 건, 누르면 열린 일을 받은 세션 → 자리 대표 → 주인. rig 없는 판은 null', () => {
  const g = sample();
  const nodeOf = (ws, sid) => (sid ? `s:${sid}` : null);
  const cg = caseGroups(g, nodeOf, (ws, seat) => `rep:${seat}`);
  assert.deepEqual(cg.open.map((c) => [c.id, c.go, c.seats.join(), c.handoffs]), [['c1', 's:w2', 'worker', 3]]);
  assert.deepEqual(cg.blocked.map((c) => [c.id, c.go, c.reason]), [['c2', 'rep:reviewer', 'limit']]);
  assert.deepEqual(cg.done.map((c) => [c.id, c.go]), [['c0', 's:m']]);
  assert.equal(cg.total, 3);
  assert.equal(caseGroups(sample({ rig: false })), null);
  assert.equal(caseGroups(null), null);
});

test('seatMenu: 켜진 rig에 자리가 있을 때 에이전트 세션만, 원격 기기는 없음, keep 자리를 다른 세션이 쥐면 막음', () => {
  const st = { state: 'on', seats: [{ name: 'main', session: 'keep' }, { name: 'worker', session: 'fresh' }] };
  const s = { sessionId: 'a', name: 'a', kind: 'claude', rigSeat: null, workspaceKey: WS };
  const others = [{ sessionId: 'b', name: 'lead', rigSeat: 'main', workspaceKey: WS, state: 'idle' }];
  const m = seatMenu(st, s, others);
  assert.deepEqual(m.seats, [{ name: 'main', mode: 'keep', current: false, taken: 'lead' }, { name: 'worker', mode: 'fresh', current: false, taken: null }]);
  assert.equal(m.clear, false);
  assert.equal(seatMenu(st, { ...s, rigSeat: 'worker' }, others).clear, true);
  assert.equal(seatMenu(st, { ...s, rigSeat: 'worker' }, others).seats[1].current, true);
  assert.equal(seatMenu(st, { ...s, workspaceKey: 'other' }, others).seats[0].taken, null); // 다른 워크스페이스의 앉은 세션은 상관없다
  assert.equal(seatMenu({ ...st, state: 'off' }, s, others), null);
  assert.equal(seatMenu({ state: 'on', seats: [] }, s, others), null);
  assert.equal(seatMenu(st, s, others, { remote: true }), null);
  assert.equal(seatMenu(st, { ...s, kind: 'shell' }, others), null);
  assert.equal(seatMenu(null, s, others), null);
});

test('recentLines: 훅 판정과 도구 실행을 최근 것부터 섞어 n줄, 거절·실패는 bad', () => {
  const ls = recentLines({ hooks: [{ t: 30, at: 'deliver', decision: 'reject', reason: 'too long' }, { t: 10, at: 'done', decision: 'pass', run: 'node a.mjs' }], tools: [{ tool: 'test', status: 'done', exitCode: 1, startedAt: 15, endedAt: 20, args: ['--x'] }] }, 5);
  assert.deepEqual(ls.map((x) => [x.kind, x.text, x.bad]), [['hook', 'deliver · reject', true], ['tool', 'test · done (1)', true], ['hook', 'done · pass', false]]);
  assert.equal(ls[0].sub, 'too long');
  assert.deepEqual(recentLines(null), []);
  assert.equal(recentLines({ hooks: Array.from({ length: 9 }, (_, i) => ({ t: i, at: 'deliver', decision: 'pass' })), tools: [] }, 5).length, 5);
});

test('배치: 자리 이름표, 끝난 fresh 세션은 얇은 줄(일하는 카드 바로 아래), 흐름 줄 넷과 1/2. rig가 없으면 전과 같은 자리', () => {
  const g = sample();
  const lay = lineageLayout(g, { order: [WS], tiers: tiersOf(g) });
  assert.equal(lay.cards.get('s:m').seat.seat, 'main');
  assert.equal(lay.cards.get('s:x').seat, null);
  assert.equal(lay.cards.get('s:w1').thin, true);
  assert.equal(lay.cards.get('s:w2').thin, false);
  const w1 = lay.cards.get('s:w1'), w2 = lay.cards.get('s:w2');
  assert.ok(w1.y > w2.y && w1.y - (w2.y + w2.h) < 30); // 일하는 카드 바로 아래
  assert.deepEqual(lay.flows.map((f) => f.label), ['assign', 'ok', 'rejected 1/2', 'ok']);
  assert.equal(lay.reps.get(WS).get('worker'), 's:w2');
  // rig가 없으면(정의가 꺼짐) rigSeat가 남아 있어도 배치·선이 rigSeat 없는 판과 같다
  const off = sample({ rig: false });
  const bare = { ...off, nodes: off.nodes.map((n) => ({ ...n, rigSeat: null })) };
  const a = lineageLayout(off, { order: [WS], tiers: tiersOf(off) }), b = lineageLayout(bare, { order: [WS], tiers: tiersOf(bare) });
  assert.deepEqual([...a.cards].map(([id, c]) => [id, c.x, c.y, c.h, c.thin]), [...b.cards].map(([id, c]) => [id, c.x, c.y, c.h, c.thin]));
  assert.deepEqual(a.edges.map((e) => e.d), b.edges.map((e) => e.d));
  assert.equal(a.flows.length, 0);
  // 휴대폰 배치는 흐름 줄을 그리지 않는다(이름표·얇은 줄은 같다)
  const ph = lineageLayout(g, { order: [WS], tiers: tiersOf(g), phone: true });
  assert.equal(ph.flows.length, 0);
  assert.equal(ph.cards.get('s:w1').thin, true);
});

test('사전과 화면: rigMap 낱말은 두 사전에, 요약 열은 rigCases가 있을 때만 건 묶음, 맵은 PC 미리 보기에만 rig 기록', () => {
  for (const k of ['seatTip', 'peekSeat', 'peekRig', 'flowTip', 'seatMenu', 'seatNow', 'seatTaken', 'seatClear', 'seatSet', 'seatCleared', 'seatFail', 'cases', 'recentDone', 'noCases', 'caseName', 'caseAt', 'caseQueued', 'caseBlocked', 'caseDone', 'caseCancelled', 'handoffs', 'caseTip', 'blocked']) {
    assert.ok(en.rigMap[k], `en rigMap.${k}`); assert.ok(ko.rigMap[k], `ko rigMap.${k}`);
  }
  for (const k of ['keep', 'fresh']) { assert.ok(en.rigMap.mode[k]); assert.ok(ko.rigMap.mode[k]); }
  for (const k of ['hook', 'tool']) { assert.ok(en.rigMap.peekKind[k]); assert.ok(ko.rigMap.peekKind[k]); }
  const sc = read('SummaryColumn.jsx');
  assert.match(sc, /\{rigCases \? \(/);
  const ml = read('MissionLineage.jsx');
  assert.match(ml, /rig folder=/); // PC 미리 보기만 rig 기록을 읽는다
  assert.doesNotMatch(read('PhoneMap.jsx'), /<Peek[^>]* rig[ =>]/); // 휴대폰은 훅·도구를 그리지 않는다
  assert.match(read('SessionNode.jsx'), /<SeatPicker s=\{s\}/);
  assert.match(read('RigSeat.jsx'), /api\.call\('rig\.seat'/);
});
