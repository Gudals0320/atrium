// P199 단위 시험: rig 띠 후속(docs research harness-arch.md 17절 "17절 구현 결과"의 후속 셋).
// 붙는 머리(lib/rig-band.js stickyHead), 휴대폰 자리 사슬을 카드 폭 안에서 꺾기와 keep 표시 폭, 휴대폰 "+n 끝남" 펴기. 견본은 P198과 같은 test/fixtures/rig-band-graph.json
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stickyHead, bandPhone, BAND_PHONE } from '../src/renderer/lib/rig-band.js';
import { lineageLayout } from '../src/renderer/lib/mission-lineage.js';
import en from '../src/renderer/locales/en.js';
import ko from '../src/renderer/locales/ko.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const R = path.join(HERE, '..', 'src', 'renderer');
const read = (f) => fs.readFileSync(path.join(R, f), 'utf8');
const FIX = JSON.parse(fs.readFileSync(path.join(HERE, 'fixtures', 'rig-band-graph.json'), 'utf8'));
const WS = 'C:/w/band';
const SESS = [
  { sid: 's-main', name: 'main', seat: 'main', state: 'idle', t: 1 },
  { sid: 's-mgr', name: 'manager', seat: 'manager', state: 'working', t: 2 },
  { sid: 's-t1', name: 'tester-1', seat: 'tester', state: 'idle', t: 3, parent: 's-main' },
  { sid: 's-w1', name: 'worker-1', seat: 'worker', state: 'idle', t: 4, parent: 's-main' },
  { sid: 's-r1', name: 'reviewer-1', seat: 'reviewer', state: 'sleeping', t: 5, parent: 's-main' },
  { sid: 's-r2', name: 'reviewer-2', seat: 'reviewer', state: 'idle', t: 6, parent: 's-main' },
  { sid: 's-d1', name: 'docs-1', seat: 'docs', state: 'working', t: 7, parent: 's-main' },
  { sid: 's-w2', name: 'worker-2', seat: 'worker', state: 'working', t: 8, parent: 's-main' },
  { sid: 's-old', name: 'worker-0', seat: 'worker', state: 'sleeping', t: 0.5, parent: 's-main' },
  { sid: 'h', name: 'helper', seat: null, state: 'idle', t: 9, parent: 's-main' },
];
const TIER = { working: 'work', idle: 'rest', sleeping: 'sleep' };
function graph(R0 = FIX) {
  const nodes = SESS.map((s) => ({ id: `s:${s.sid}`, kind: 'session', sessionId: s.sid, name: s.name, agentKind: 'claude', state: s.state, category: s.state, workspaceKey: WS, parentId: s.parent ? `s:${s.parent}` : null, lineageParent: s.parent ? `s:${s.parent}` : null, peers: [], createdAt: s.t, rigSeat: s.seat }));
  const edges = SESS.filter((s) => s.parent).map((s) => ({ from: `s:${s.parent}`, to: `s:${s.sid}`, kind: 'spawn', count: 0 }));
  return { nodes, edges, counts: {}, at: 0, rig: { [WS]: R0 } };
}
const tiersOf = (g) => new Map(g.nodes.map((n) => [n.id, TIER[n.state] || 'rest']));
const lay = (g, o = {}) => lineageLayout(g, { order: [WS], tiers: tiersOf(g), ...o });
const TOP = 86; // 고정 머리 막대 아래 변(MissionLineage TOPH + COLH)

test('붙는 머리: 띠의 자리 머리가 보이면 null(나무 칸 이름), 위로 지나가고 띠가 막대 선에 걸치면 그 띠의 자리 이름과 띠 열 화면 x', () => {
  const l = lay(graph()), band = l.rb.list[0], s0 = band.seats[0];
  const k = 0.8;
  // 띠 머리가 막대 아래에 다 보인다
  const vis = { k, x: 30, y: TOP + 40 - band.box.y * k };
  assert.equal(stickyHead(l.rb.list, vis, TOP), null);
  // 띠 위 변은 막대 위로 갔지만 자리 머리 아래 변은 아직 막대 아래(머리가 반쯤 보인다) → 아직 나무 칸 이름
  const half = { k, x: 30, y: TOP - (s0.y + s0.h / 2) * k };
  assert.equal(stickyHead(l.rb.list, half, TOP), null);
  // 자리 머리가 막대 위로 지나갔다(띠 가운데가 막대 선에 걸침)
  const mid = band.box.y + band.box.h / 2;
  const up = { k, x: 30, y: TOP - mid * k };
  const st = stickyHead(l.rb.list, up, TOP);
  assert.ok(st);
  assert.equal(st.ws, WS);
  assert.deepEqual(st.seats.map((s) => s.name), band.seats.map((s) => s.name));
  st.seats.forEach((s, i) => assert.equal(s.x, Math.round(band.seats[i].x * k + 30)));
  assert.equal(st.seats.find((s) => s.name === 'tester').old, true);
  assert.equal(st.seats.find((s) => s.name === 'main').mode, 'keep');
  // 레일 폭을 빼서 막대 안 x로
  assert.equal(stickyHead(l.rb.list, up, TOP, 10).seats[0].x, Math.round(band.seats[0].x * k + 30 - 10));
  // 띠가 다 위로 지나갔다(아래 나무만 보인다) → 나무 칸 이름
  const past = { k, x: 30, y: TOP - (band.box.y + band.box.h + 20) * k };
  assert.equal(stickyHead(l.rb.list, past, TOP), null);
  // 휴대폰 띠·빈 목록은 없음
  assert.equal(stickyHead(lay(graph(), { phone: true }).rb.list, up, TOP), null);
  assert.equal(stickyHead([], up, TOP), null);
});

test('붙는 머리: 띠가 여럿이면 막대 선에 걸친 띠의 것', () => {
  const l = lay(graph()), b = l.rb.list[0];
  const other = { ...b, ws: 'C:/w/two', box: { ...b.box, y: b.box.y + b.box.h + 400 }, seats: b.seats.map((s) => ({ ...s, name: `${s.name}2`, y: s.y + b.box.h + 400 })) };
  const list = [b, other], k = 1;
  const v1 = { k, x: 0, y: TOP - (b.box.y + b.box.h / 2) };
  assert.equal(stickyHead(list, v1, TOP).ws, WS);
  const v2 = { k, x: 0, y: TOP - (other.box.y + other.box.h / 2) };
  const st = stickyHead(list, v2, TOP);
  assert.equal(st.ws, 'C:/w/two');
  assert.equal(st.seats[0].name, 'main2');
});

test('휴대폰 사슬: 띠 폭 = 카드 폭, 칩은 그 폭 안에서 꺾고 꺾은 줄은 화살표 자리만큼 들여 시작, keep 표시·카드도 폭 안', () => {
  const l = lay(graph(), { phone: true }), band = l.rb.list[0];
  assert.equal(band.box.w, l.cw);
  const right = band.box.x + band.box.w;
  for (const c of band.chains) {
    assert.ok(c.x >= band.box.x - 0.5 && c.x + c.w <= right + 0.5, `${c.caseId} ${c.seat} 칩이 폭 밖`);
    if (c.arrow) assert.ok(c.x - BAND_PHONE.LGAP >= band.box.x - 0.5, '화살표가 띠 안');
  }
  const open = band.chains.filter((c) => c.caseId === 'c-open');
  assert.ok(new Set(open.map((c) => c.y)).size >= 2, 'c-open 사슬이 꺾인다');
  const wraps = open.filter((c) => c.wrap);
  assert.ok(wraps.length >= 1 && wraps.every((c) => c.x === band.box.x + BAND_PHONE.LGAP));
  for (const m of band.marks) assert.ok(m.x >= band.box.x && m.x + m.w <= right + 0.5, `${m.kind} 표시가 폭 밖`);
  assert.ok(band.marks.some((m) => m.kind === 'holds'));
  for (const h of band.heads) assert.ok(h.x + h.w <= right + 0.5);
  for (const [, c] of band.cards) if (!c.folded) assert.ok(c.x + c.w <= right + 0.5);
});

test('휴대폰 사슬: 좁은 폭에서도 칩 하나가 폭을 넘지 않고, 줄마다 폭 안', () => {
  const g = graph(), tiers = tiersOf(g);
  const nodes = g.nodes.filter((n) => n.rigSeat);
  const member = new Map(nodes.map((n) => [n.id, { ws: WS, seat: n.rigSeat, mode: ['main', 'manager'].includes(n.rigSeat) ? 'keep' : 'fresh', old: n.rigSeat === 'tester' }]));
  const sidOf = new Map(nodes.map((n) => [n.sessionId, n.id]));
  for (const W of [120, 180, 264]) {
    const b = bandPhone(FIX, { ws: WS, nodes, member, sidOf, tierOf: (id) => tiers.get(id), H: () => 120, CW: W, x0: 20, y0: 0, W });
    for (const c of b.chains) assert.ok(c.x + c.w <= 20 + W + 0.5 && c.w <= W, `W ${W}: ${c.seat}`);
  }
});

test('휴대폰 "+n 끝남": 처음은 접힘(안 세션은 folded), 펴면 건 없는 칩이 그 아래, 다시 접으면 그대로', () => {
  const g = graph();
  const l = lay(g, { phone: true }), band = l.rb.list[0];
  assert.ok(band.fold && !band.fold.open && band.fold.n > 0);
  assert.ok(l.cards.get('s:s-old').folded);
  const lo = lay(g, { phone: true, foldOpen: new Set([WS]) }), bo = lo.rb.list[0];
  assert.equal(bo.fold.open, true);
  const o2 = lo.cards.get('s:s-old');
  assert.ok(!o2.folded && o2.chip && o2.y > bo.fold.y, '건 없는 세션은 편 줄 아래 칩');
  assert.ok(o2.x + o2.w <= bo.box.x + bo.box.w + 0.5);
  assert.ok(bo.box.h > band.box.h, '펴면 띠가 길어진다');
  // 다시 접으면 처음과 같다
  const lc = lay(g, { phone: true, foldOpen: new Set() });
  assert.equal(lc.rb.list[0].box.h, band.box.h);
});

test('휴대폰 "+n 끝남" 숨은 건: 끝난 건이 셋 넘으면 펼 때 넷째부터 블록(머리·사슬)으로 접힌 줄 아래에 보인다', () => {
  const mk = (i) => ({ id: `c-x${i}`, firstTask: `old ${i}`, state: 'done', createdAt: 10 + i, lastHandoffAt: 10 + i, closedAt: 10 + i, owner: 'main', ownerSessionId: 's-main', cycle: null, lines: [], units: [{ unit: `ux${i}`, seat: 'worker', sessionId: 's-old', name: 'worker-0', status: 'done', createdAt: 10 + i, closedAt: 11 + i, via: null }], reports: [] });
  const R0 = { ...FIX, cases: [...FIX.cases, mk(1), mk(2), mk(3), mk(4)] };
  const g = graph(R0);
  const shut = lay(g, { phone: true }).rb.list[0];
  const open = lay(g, { phone: true, foldOpen: new Set([WS]) }).rb.list[0];
  const hid = open.heads.filter((h) => h.hidden);
  assert.ok(hid.length >= 1, '숨은 건 블록');
  assert.ok(hid.every((h) => !shut.heads.some((s) => s.id === h.id) && h.y > open.fold.y));
  assert.ok(open.chains.some((c) => hid.some((h) => h.id === c.caseId)), '숨은 건의 사슬');
});

test('화면: 휴대폰 접힌 줄 단추는 눌린다(PhoneMap이 foldOpen을 넘김), 맵은 붙는 머리를 막대에 그린다, 꺾은 줄 표시 CSS, 움직임 없음', () => {
  const pm = read('PhoneMap.jsx'), rb = read('RigBand.jsx'), ml = read('MissionLineage.jsx'), css = read('styles.css');
  assert.ok(/foldOpen(, tab: tabSel \|\| 'auto')? \}\)/.test(pm) && /onFold=\{onBandFold\}/.test(pm));
  assert.ok(!/disabled=\{phone\}/.test(rb));
  assert.ok(/stickyHead\(/.test(ml) && /data-role="ln-cols-rig"/.test(ml));
  const p199 = css.slice(css.indexOf('/* P199'));
  assert.ok(/data-sticky/.test(p199) && /\.mt-rb-link\.wrap/.test(p199));
  assert.ok(!/animation|transition/.test(p199), '줄임 움직임: P199 CSS에 움직임 없음');
  for (const d of [en, ko]) for (const k of ['foldMore', 'foldHide', 'foldOther', 'keep', 'fresh', 'old']) assert.ok(d.rigBand[k], k);
});
