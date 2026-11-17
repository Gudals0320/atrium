// P198 단위 시험: 세션 맵 rig 띠(docs research harness-arch.md 17절, lib/rig-band.js)와 배치(lib/mission-lineage.js)에 든 띠, 휴대폰 갈래, 요약 열 건, Alt 끌기 제외, rig 없는 판 그대로.
// 그래프 rig 자료는 P197과 같이 쓰는 견본(test/fixtures/rig-band-graph.json = backend/test/fixtures/rig-band/graph-rig.json)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bandIndex, bandColumns, caseOrder, moreDone, bandLayout, bandPhone, caseHistory, inBandBox, isChipTier, BAND } from '../src/renderer/lib/rig-band.js';
import { lineageLayout, relationDrop, LINE } from '../src/renderer/lib/mission-lineage.js';
import { caseGroups, rigIndex } from '../src/renderer/lib/rig-map.js';
import en from '../src/renderer/locales/en.js';
import ko from '../src/renderer/locales/ko.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const R = path.join(HERE, '..', 'src', 'renderer');
const read = (f) => fs.readFileSync(path.join(R, f), 'utf8');
const FIX = JSON.parse(fs.readFileSync(path.join(HERE, 'fixtures', 'rig-band-graph.json'), 'utf8'));
const WS = 'C:/w/band';

// 견본 rig의 세션들 + 자리 없는 세션(main이 띄운 도우미 helper, 나무의 lead와 그 하위)
// state: working → work, idle → rest, sleeping → sleep
const SESS = [
  { sid: 's-main', name: 'main', seat: 'main', state: 'idle', t: 1 },
  { sid: 's-mgr', name: 'manager', seat: 'manager', state: 'working', t: 2 },
  { sid: 's-t1', name: 'tester-1', seat: 'tester', state: 'idle', t: 3, parent: 's-main' },
  { sid: 's-w1', name: 'worker-1', seat: 'worker', state: 'idle', t: 4, parent: 's-main' },
  { sid: 's-r1', name: 'reviewer-1', seat: 'reviewer', state: 'sleeping', t: 5, parent: 's-main' },
  { sid: 's-r2', name: 'reviewer-2', seat: 'reviewer', state: 'idle', t: 6, parent: 's-main' },
  { sid: 's-d1', name: 'docs-1', seat: 'docs', state: 'working', t: 7, parent: 's-main' },
  { sid: 's-w2', name: 'worker-2', seat: 'worker', state: 'working', t: 8, parent: 's-main' },
  { sid: 'h', name: 'helper', seat: null, state: 'idle', t: 9, parent: 's-main' },
  { sid: 'lead', name: 'lead', seat: null, state: 'idle', t: 10 },
  { sid: 'kid', name: 'kid', seat: null, state: 'working', t: 11, parent: 'lead' },
];
const TIER = { working: 'work', idle: 'rest', sleeping: 'sleep' };
function graph({ rig = true, sess = SESS, R0 = FIX } = {}) {
  const nodes = sess.map((s) => ({ id: `s:${s.sid}`, kind: 'session', sessionId: s.sid, name: s.name, agentKind: 'claude', state: s.state, category: s.state, workspaceKey: WS, parentId: s.parent ? `s:${s.parent}` : null, lineageParent: s.parent ? `s:${s.parent}` : null, peers: [], createdAt: s.t, rigSeat: s.seat }));
  const edges = sess.filter((s) => s.parent).map((s) => ({ from: `s:${s.parent}`, to: `s:${s.sid}`, kind: 'spawn', count: 0 }));
  return { nodes, edges, counts: {}, at: 0, rig: rig ? { [WS]: R0 } : {} };
}
const tiersOf = (g) => new Map(g.nodes.map((n) => [n.id, TIER[n.state] || 'rest']));
const lay = (g, o = {}) => lineageLayout(g, { order: [WS], tiers: tiersOf(g), ...o });

test('견본 모양: P197 견본의 열쇠가 그대로 있다(바뀌면 맞춰야 한다)', () => {
  for (const k of ['seats', 'flow', 'cases', 'doneCount', 'openCount']) assert.ok(k in FIX, k);
  const c = FIX.cases.find((x) => x.id === 'c-open');
  for (const k of ['firstTask', 'state', 'createdAt', 'lastHandoffAt', 'owner', 'ownerSessionId', 'cycle', 'lines', 'units', 'reports']) assert.ok(k in c, k);
  for (const k of ['unit', 'seat', 'sessionId', 'name', 'status', 'result', 'queued', 'createdAt', 'via']) assert.ok(k in c.units[1], k);
  for (const k of ['prevUnit', 'line', 'escalated', 'fromSeat']) assert.ok(k in c.units[1].via, k);
  for (const k of ['seat', 'sessionId', 'unit', 'result', 'escalated', 'at']) assert.ok(k in FIX.cases[0].reports[0], k);
});

test('bandIndex: 켜진 rig 워크스페이스의 rigSeat 세션(옛 자리 포함)만 띠, keep·fresh·old. rig가 없으면 빈 표', () => {
  const ix = bandIndex(graph());
  assert.deepEqual(ix.member.get('s:s-main'), { ws: WS, seat: 'main', mode: 'keep', old: false });
  assert.deepEqual(ix.member.get('s:s-w2'), { ws: WS, seat: 'worker', mode: 'fresh', old: false });
  assert.deepEqual(ix.member.get('s:s-t1'), { ws: WS, seat: 'tester', mode: 'fresh', old: true }); // 정의에서 빠진 자리
  assert.equal(ix.member.has('s:h'), false);
  assert.equal(bandIndex(graph({ rig: false })).member.size, 0);
  // rigSeat가 지워졌어도 보이는 건의 일을 받은 세션은 띠에 남는다(나무로 떨어지지 않는다)
  const g = graph(); g.nodes.find((n) => n.sessionId === 's-r1').rigSeat = null;
  assert.equal(bandIndex(g).member.get('s:s-r1').seat, 'reviewer');
});

test('bandColumns: 판이 준 자리 차례 그대로(assign 출발 → 너비 우선 → 나머지 → 옛 자리), 건이 부르는 모르는 자리는 맨 오른쪽 옛 자리', () => {
  assert.deepEqual(bandColumns(FIX, FIX.cases).map((c) => [c.name, c.old]), [['main', false], ['worker', false], ['reviewer', false], ['docs', false], ['manager', false], ['tester', true]]);
  const extra = { units: [{ unit: 'x', seat: 'ghost', createdAt: 1 }] };
  assert.deepEqual(bandColumns(FIX, [extra]).slice(-1), [{ name: 'ghost', old: true }]);
});

test('caseOrder: 주인 대기·막힘 → 열림(마지막 넘김 최근부터) → 끝난 최근 3 → 접힌 줄 수 = doneCount - 그린 끝난 건', () => {
  const o = caseOrder(FIX);
  assert.deepEqual(o.rows.map((c) => c.id), ['c-wait', 'c-open', 'c-cycle', 'c-cancel']);
  assert.equal(o.more, 3); // doneCount 4, 그린 끝난 건 1
  assert.equal(moreDone({ doneCount: 2 }, 2), 0);
  const many = { cases: [1, 2, 3, 4, 5].map((i) => ({ id: `d${i}`, state: 'done', closedAt: i })), doneCount: 9 };
  const m = caseOrder(many);
  assert.deepEqual(m.rows.map((c) => c.id), ['d5', 'd4', 'd3']);
  assert.deepEqual(m.hidden.map((c) => c.id), ['d2', 'd1']);
  assert.equal(m.more, 6);
  const live = caseOrder({ cases: [{ id: 'a', state: 'open', lastHandoffAt: 1 }, { id: 'b', state: 'open', lastHandoffAt: 5 }, { id: 'c', state: 'blocked', lastHandoffAt: 0 }] });
  assert.deepEqual(live.rows.map((c) => c.id), ['c', 'b', 'a']);
});

test('배치: 띠는 줄 맨 위, 나무는 그 아래. 자리 세션은 나무에서 빠지고 자리 없는 하위(helper)는 나무 뿌리 + 띠 가장자리 옅은 선', () => {
  const g = graph(), l = lay(g);
  assert.equal(l.rb.list.length, 1);
  const band = l.rb.list[0], row = l.rows[0];
  assert.equal(band.box.y, row.y + LINE.RT);
  for (const id of ['s:s-main', 's:s-w2', 's:s-d1', 's:s-mgr']) assert.ok(l.cards.get(id).band, id);
  const helper = l.cards.get('s:h'), lead = l.cards.get('s:lead');
  assert.equal(helper.depth, 0); // 띠 세션의 자리 없는 하위 = 나무 뿌리
  assert.ok(!helper.band && helper.y >= band.box.y + band.box.h + BAND.BELOW - 0.5);
  assert.ok(lead.y >= band.box.y + band.box.h);
  const be = l.edges.find((e) => e.from === 's:s-main' && e.to === 's:h');
  assert.ok(be && be.bandEdge, '띠 → 나무 뿌리 옅은 선');
  assert.equal(be.pts[0][1], band.box.y + band.box.h); // 띠 가장자리에서 시작(띠 안을 지나지 않는다)
  // 띠 안끼리의 나무 선(main → worker-2 띄움)은 없다
  assert.ok(!l.edges.some((e) => e.from === 's:s-main' && e.to === 's:s-w2'));
  // 솔로 칸은 나무 너비와 띠 너비 가운데 넓은 쪽 뒤
  const solo = l.cols.find((c) => c.key === 'solo').x;
  assert.ok(solo >= band.box.x + band.box.w + LINE.SOLOGAP - 0.5);
});

test('배치: 열 = 자리(세계 좌표의 자리 머리), keep은 열 머리 카드 하나 + 행 칸 표시, 칸 안 위 → 아래 시간 순', () => {
  const l = lay(graph()), band = l.rb.list[0];
  assert.deepEqual(band.seats.map((s) => s.name), ['main', 'worker', 'reviewer', 'docs', 'manager', 'tester']);
  const colX = Object.fromEntries(band.seats.map((s) => [s.name, s.x]));
  assert.equal(band.seats.find((s) => s.name === 'tester').old, true);
  assert.deepEqual([band.seats[1].busy, band.seats[1].max], [1, 1]); // worker 1/1
  const main = l.cards.get('s:s-main');
  assert.ok(main.keepHead && !main.chip && main.x === colX.main);
  assert.ok(main.y < Math.min(...band.heads.map((h) => h.y))); // 머리 카드는 행들 위
  const mgr = l.cards.get('s:s-mgr');
  assert.ok(mgr.keepHead && mgr.x === colX.manager);
  // c-wait: 보고(올림) 표시 + 주인 대기 표시가 main 열에, 위 → 아래 시간 순
  const wm = band.marks.filter((m) => m.caseId === 'c-wait' && m.x === colX.main);
  assert.deepEqual(wm.map((m) => m.kind), ['report', 'wait']);
  assert.ok(wm[0].y < wm[1].y && wm[0].up && wm[0].value === 'rejected');
  // c-cycle: manager(keep)가 일을 쥠
  assert.ok(band.marks.some((m) => m.caseId === 'c-cycle' && m.kind === 'holds' && m.x === colX.manager));
  // c-open worker 칸: worker-1(u10) 위, worker-2(u13) 아래, 줄 선 일(u14) 맨 아래
  const w1 = l.cards.get('s:s-w1'), w2 = l.cards.get('s:s-w2'), q = band.marks.find((m) => m.caseId === 'c-open' && m.kind === 'queue');
  assert.equal(w1.caseId, 'c-open'); assert.equal(w2.caseId, 'c-open');
  assert.ok(w1.x === colX.worker && w2.x === colX.worker && q.x === colX.worker);
  assert.ok(w1.y < w2.y && w2.y < q.y);
  // 한 세션 = 한 카드: c-wait의 worker-1(u1)·reviewer-1(u2)은 c-open(늦은 일)·c-wait에 집. 다른 칸은 가리키는 표시(ref)
  assert.equal(l.cards.get('s:s-r1').caseId, 'c-wait');
  assert.ok(band.marks.some((m) => m.caseId === 'c-wait' && m.kind === 'ref' && m.target === 's:s-w1'));
});

test('배치: 칩·카드 판정(쉼·잠듦·확인한 끝남만 칩), 행 머리 차례, 갈라짐·호·n/max·↑k, 보고 선', () => {
  const l = lay(graph()), band = l.rb.list[0];
  assert.equal(l.cards.get('s:s-w1').chip, true); // 쉼
  assert.equal(l.cards.get('s:s-r1').chip, true); // 잠듦
  assert.equal(l.cards.get('s:s-w2').chip, false); // 일하는 중
  assert.equal(l.cards.get('s:s-d1').chip, false);
  assert.ok(isChipTier('done') && !isChipTier('review') && !isChipTier('turn') && !isChipTier('alert'));
  assert.equal(l.cards.get('s:s-w1').h, BAND.CHIP);
  assert.deepEqual(band.heads.filter((h) => !h.loose).map((h) => h.id), ['c-wait', 'c-open', 'c-cycle', 'c-cancel']);
  const hy = band.heads.map((h) => h.y); assert.deepEqual(hy, [...hy].sort((a, b) => a - b));
  // 갈라짐: u10에서 u11(reviewer)·u12(docs) 두 선
  const fromU10 = band.lines.filter((x) => x.caseId === 'c-open' && x.from === 'u10');
  assert.deepEqual(fromU10.map((x) => x.to).sort(), ['u11', 'u12']);
  assert.ok(fromU10.every((x) => x.kind === 'fwd'));
  // 열을 건너뛰는 선(worker → docs)은 사이 칸(reviewer) 항목을 가로지르지 않고 칸 위 통로로 돈다
  const skip = fromU10.find((x) => x.to === 'u12');
  assert.ok(skip.skip);
  const rv = l.cards.get('s:s-r2'), lane = Number(skip.d.split(' L')[2].split(' ')[1]);
  assert.ok(lane < rv.y, '통로는 reviewer 칸 항목 위');
  // 되돌아감: u11(reviewer) → u13·u14(worker) 호. 마지막 호에만 지금 셈 2/2 ↑1
  const backs = band.lines.filter((x) => x.caseId === 'c-open' && x.kind === 'back');
  assert.deepEqual(backs.map((x) => x.to), ['u13', 'u14']);
  assert.deepEqual(backs.map((x) => x.count || null), [null, { n: 2, max: 2, up: 1 }]);
  // 보고 선: c-wait u2(reviewer) → main 열 보고 표시, 올림
  const rep = band.lines.find((x) => x.caseId === 'c-wait' && x.report);
  assert.ok(rep && rep.from === 'u2' && rep.up && rep.kind === 'back');
  // 행 높이: 호 자리를 띄운다(c-open 칸들은 머리 + 호 층 아래)
  const head = band.rowOf.get('c-open');
  assert.ok(l.cards.get('s:s-w1').y >= head.y + BAND.CH + BAND.CP + BAND.ARC * 2 - 0.5);
});

test('접힌 줄: "+n 끝남" 안 세션은 folded 카드 항목(그리지 않음), 펴면 칸에 칩. 주인이 닫힌 건(main-old)은 보고 열 없음', () => {
  const sess = [...SESS, { sid: 's-old', name: 'worker-0', seat: 'worker', state: 'sleeping', t: 0.5, parent: 's-main' }];
  const g = graph({ sess });
  const l = lay(g), band = l.rb.list[0];
  assert.equal(band.fold.n, 3);
  const old = l.cards.get('s:s-old');
  assert.ok(old.folded && old.chip);
  assert.ok(l.order.includes('s:s-old'), '접힌 세션도 카드 항목(요약 열·사이드바가 찾는다)');
  const open = lay(g, { foldOpen: new Set([WS]) });
  const o2 = open.cards.get('s:s-old');
  assert.ok(!o2.folded && o2.chip && o2.y > open.rb.list[0].fold.y);
  // 펴면 띠가 길어진다
  assert.ok(open.rb.list[0].box.h > band.box.h);
  // tester-1(옛 자리)은 c-cancel 행의 tester 열
  assert.equal(l.cards.get('s:s-t1').caseId, 'c-cancel');
});

test('건 밖 카드: 보이는 건에 일이 없는데 일하는 자리 세션은 "건 밖" 행의 카드(접히지 않는다)', () => {
  const sess = [...SESS, { sid: 's-x', name: 'docs-9', seat: 'docs', state: 'working', t: 12, parent: 's-main' }];
  const l = lay(graph({ sess })), band = l.rb.list[0];
  const x = l.cards.get('s:s-x');
  assert.ok(x && !x.folded && !x.chip);
  assert.ok(band.heads.some((h) => h.loose));
});

test('Alt 끌기: 띠 카드는 끌기 시작이 아니고, 띠 사각형은 놓을 곳이 아니다. 나무 카드끼리는 그대로', () => {
  const l = lay(graph()), band = l.rb.list[0];
  const m = l.cards.get('s:s-main');
  assert.equal(relationDrop(l, 's:s-w2', m.x + m.w + 40, m.y + 10), null); // 띠 카드를 끌 수 없다
  const kid = l.cards.get('s:kid');
  assert.equal(relationDrop(l, 's:kid', band.box.x + 20, band.box.y + 20), null); // 띠 안에 놓기 = 취소
  assert.ok(inBandBox(l.rb.list, band.box.x + 1, band.box.y + 1));
  const helper = l.cards.get('s:h');
  const d = relationDrop(l, 's:kid', helper.x + helper.w + 40, helper.y + helper.h / 2);
  assert.equal(d && d.kind, 'sub'); assert.equal(d.target, 's:h');
  // 띠 카드는 하위 자리 대상도 아니다
  const r = relationDrop(l, 's:kid', m.x + m.w + 30, m.y + m.h / 2);
  assert.ok(!r || r.target !== 's:s-main');
  assert.ok(kid);
});

test('요약 열 건: 누르면 행 머리(row), go는 열린 일을 받은 카드(줄 선 일 빼고), 주기 건 표시', () => {
  const g = graph(), l = lay(g);
  const cg = caseGroups(g, (ws, sid) => (sid && l.cards.has(`s:${sid}`) ? `s:${sid}` : null));
  const open = cg.open.find((c) => c.id === 'c-open');
  assert.equal(open.row, `${WS}|c-open`);
  assert.equal(open.go, 's:s-w2'); // u14(줄)이 늦지만 세션이 없다 → worker-2
  assert.equal(cg.open.find((c) => c.id === 'c-cycle').cycle, true);
  assert.ok(l.rb.list[0].rowOf.has('c-open'));
});

test('caseHistory: 넘김 이력(일·보고 시간 순, 앞 자리, 올림, 줄)', () => {
  const h = caseHistory(FIX.cases.find((c) => c.id === 'c-wait'));
  assert.deepEqual(h.map((x) => [x.kind, x.seat, x.from || null]), [['unit', 'worker', null], ['unit', 'reviewer', 'worker'], ['report', 'reviewer', null]]);
  assert.equal(h[2].escalated, true);
  assert.equal(caseHistory(FIX.cases.find((c) => c.id === 'c-open')).filter((x) => x.queue).length, 1);
});

test('휴대폰 갈래: keep 카드 위에 한 번, 건마다 머리·자리 사슬 칩(꺾어 이음)·지금 일하는 세션 카드, 흐름 선 없음, 줄 선 일은 점선 칩', () => {
  const g = graph(), l = lay(g, { phone: true });
  const band = l.rb.list[0];
  assert.equal(band.phone, true);
  assert.equal(band.lines.length, 0);
  const main = l.cards.get('s:s-main'), mgr = l.cards.get('s:s-mgr');
  assert.ok(main.keepHead && mgr.keepHead && main.y < band.heads[0].y);
  const ch = band.chains.filter((c) => c.caseId === 'c-open');
  assert.deepEqual(ch.map((c) => c.seat), ['worker', 'reviewer', 'docs', 'worker', 'worker']);
  assert.equal(ch.filter((c) => c.queue).length, 1);
  assert.ok(ch.every((c) => c.x + c.w <= band.box.x + band.box.w + 0.5)); // 폭 안에서 꺾는다
  // 지금 일하는 세션(worker-2·docs-1)은 카드, 끝난 세션은 접힌 항목
  assert.ok(!l.cards.get('s:s-w2').folded && !l.cards.get('s:s-d1').folded);
  assert.ok(l.cards.get('s:s-w1').folded);
  // keep 자리가 일을 쥐면 표시(manager 카드를 되풀이하지 않는다)
  assert.ok(band.marks.some((m) => m.caseId === 'c-cycle' && m.kind === 'holds'));
  assert.ok(band.marks.some((m) => m.caseId === 'c-wait' && m.kind === 'wait'));
  // 나무(helper·lead)는 띠 아래
  assert.ok(l.cards.get('s:h').y > band.box.y + band.box.h);
});

test('rig 없는 판: rigSeat가 남아 있어도 배치·선이 rigSeat 없는 판과 같고 띠가 없다', () => {
  const off = graph({ rig: false });
  const bare = { ...off, nodes: off.nodes.map((n) => ({ ...n, rigSeat: null })) };
  const a = lay(off), b = lay(bare);
  assert.deepEqual([...a.cards].map(([id, c]) => [id, c.x, c.y, c.h, !!c.thin]), [...b.cards].map(([id, c]) => [id, c.x, c.y, c.h, !!c.thin]));
  assert.deepEqual(a.edges.map((e) => e.d), b.edges.map((e) => e.d));
  assert.equal(a.rb.list.length, 0);
  assert.deepEqual(a.cols, b.cols);
  assert.equal(rigIndex(off).byNode.size, 0);
  const pa = lay(off, { phone: true }), pb = lay(bare, { phone: true });
  assert.deepEqual([...pa.cards].map(([id, c]) => [id, c.x, c.y]), [...pb.cards].map(([id, c]) => [id, c.x, c.y]));
});

test('배치는 싼 순수 함수: 같은 입력이면 같은 답, 건 50개도 빠르다', () => {
  const g = graph();
  const a = lay(g), b = lay(g);
  assert.deepEqual([...a.cards].map(([id, c]) => [id, c.x, c.y]), [...b.cards].map(([id, c]) => [id, c.x, c.y]));
  const big = { ...FIX, cases: Array.from({ length: 50 }, (_, i) => ({ ...FIX.cases[1], id: `c${i}`, lastHandoffAt: i })) };
  const t0 = performance.now();
  for (let i = 0; i < 7; i++) lay(graph({ R0: big }), { routing: false });
  assert.ok(performance.now() - t0 < 1500);
});

test('화면과 사전: P186 흐름 줄은 걷었고, 맵은 rig.cases 이벤트를 듣고, 띠 낱말은 두 사전에', () => {
  const ml = read('MissionLineage.jsx');
  assert.doesNotMatch(ml, /lay\.flows|mt-sm-flow/);
  assert.match(ml, /api\.on\('rig\.cases'/);
  assert.match(ml, /data-band=/);
  assert.doesNotMatch(read('lib/rig-map.js'), /export function (seatThin|seatReps|flowLines|flowPaths)/);
  assert.doesNotMatch(read('styles.css'), /\.mt-sm-flow/);
  assert.match(read('PhoneMap.jsx'), /api\.on\('rig\.cases'/);
  for (const k of ['keep', 'fresh', 'old', 'live', 'cycle', 'handoffs', 'started', 'last', 'queued', 'holds', 'did', 'report', 'wait', 'ref', 'past', 'foldMore', 'foldHide', 'loose', 'markTip', 'headTip', 'history', 'histFrom', 'histReport', 'noHistory', 'up']) {
    assert.ok(en.rigBand[k], `en rigBand.${k}`); assert.ok(ko.rigBand[k], `ko rigBand.${k}`);
  }
  for (const k of ['open', 'waiting_owner', 'blocked', 'done', 'cancelled']) { assert.ok(en.rigBand.state[k]); assert.ok(ko.rigBand.state[k]); }
});
