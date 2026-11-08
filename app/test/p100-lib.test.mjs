// P100 단위 시험: 미션 맵을 워크스페이스 판으로 다시 그림(lib/mission-layout.js boardLayout·missionLayout, lib/phone-graph.js).
// 겹침 없음, 모든 세션에 테두리 있는 모양(카드·알약·상자 안 동그라미), 세션은 자기 워크스페이스 판 안, 이어진 판(다른 워크스페이스 하위·가상 그룹)은 이웃,
// 선은 다른 카드·판 머리줄 뒤로 지나지 않는다, 화면이 크면 확대해 채운다, 휴대폰은 세로 한 줄로 늘어서지 않는다, 글자 크기 하한, 두 사전
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { missionLayout, boardLayout, gridFor, MISSION } from '../src/renderer/lib/mission-layout.js';
import { phoneMission } from '../src/renderer/lib/phone-mission.js';
import { phoneGraph, PG, VIEW, fitView } from '../src/renderer/lib/phone-graph.js';
import { restTier } from '../src/renderer/lib/mission-model.js';
import en from '../src/renderer/locales/en.js';
import ko from '../src/renderer/locales/ko.js';

let clock = 0;
const node = (id, ws, o = {}) => ({ id: `s:${id}`, kind: 'session', sessionId: id, name: id, agentKind: 'claude', state: 'ready', category: 'idle', workspaceKey: ws, parentId: null, role: null, order: null, createdAt: ++clock, loops: 0, ...o });
const kid = (id, ws, parent, o = {}) => node(id, ws, { parentId: `s:${parent}`, order: ++clock, ...o });
const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const overlap = (bs) => { for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) if (hit(bs[i], bs[j])) return `${bs[i].id || bs[i].key}×${bs[j].id || bs[j].key}`; return null; };
// 두 판이 붙어 있다(한 축 틈이 G(+그룹 이름 자리) 안이고 다른 축으로 겹친다)
const touching = (a, b, S) => { const gx = Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w), gy = Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h); return (gx <= S.G + 1 && gx >= -0.5 && gy < 0) || (gy <= S.G + S.gHead + 9 && gy >= -0.5 && gx < 0); };
function pathPoints(d, n = 24) {
  const tok = d.match(/[MCLVHQ]|-?[\d.]+/g); const out = []; let x = 0, y = 0, i = 0, cmd = null;
  const num = () => Number(tok[i++]);
  while (i < tok.length) {
    if (/[A-Z]/.test(tok[i])) cmd = tok[i++];
    if (cmd === 'M') { x = num(); y = num(); out.push([x, y]); }
    else if (cmd === 'L') { const x2 = num(), y2 = num(); for (let k = 1; k <= n; k++) out.push([x + (x2 - x) * k / n, y + (y2 - y) * k / n]); x = x2; y = y2; }
    else if (cmd === 'V') { const y2 = num(); for (let k = 1; k <= n; k++) out.push([x, y + (y2 - y) * k / n]); y = y2; }
    else if (cmd === 'H') { const x2 = num(); for (let k = 1; k <= n; k++) out.push([x + (x2 - x) * k / n, y]); x = x2; }
    else if (cmd === 'Q') { const cx = num(), cy = num(), x2 = num(), y2 = num(); for (let k = 1; k <= n; k++) { const t = k / n, u = 1 - t; out.push([u * u * x + 2 * u * t * cx + t * t * x2, u * u * y + 2 * u * t * cy + t * t * y2]); } x = x2; y = y2; }
    else if (cmd === 'C') { const a = num(), b = num(), c = num(), e = num(), x2 = num(), y2 = num(); for (let k = 1; k <= n; k++) { const t = k / n, u = 1 - t; out.push([u * u * u * x + 3 * u * u * t * a + 3 * u * t * t * c + t * t * t * x2, u * u * u * y + 3 * u * u * t * b + 3 * u * t * t * e + t * t * t * y2]); } x = x2; y = y2; }
    else i++;
  }
  return out;
}
// 선이 지나는 점이 끝 상자가 아닌 카드·판 머리줄 안에 들지 않는다
function wiresClear(edges, boxes, heads, label) {
  const solid = [...boxes].filter((b) => b.kind !== 'dot');
  for (const e of edges) {
    const obs = [...solid.filter((o) => o.id !== e.from && o.id !== e.to), ...heads];
    for (const [x, y] of pathPoints(e.d)) for (const o of obs) assert.ok(!(x > o.x + 1 && x < o.x + o.w - 1 && y > o.y + 1 && y < o.y + o.h - 1), `${label}: ${e.id}가 ${o.id || '머리줄'} 뒤로 지난다(${Math.round(x)},${Math.round(y)})`);
  }
}

// 실제 판 모양(사용자 판과 같은 꼴, 이름은 가짜): 워크스페이스 11개, 리드 둘(지휘 세션과 블로그 리드), 워커·리뷰어, 다른 워크스페이스 하위,
// 잠든 세션 넷, 쉬는·끝난 세션, 셸, 가상 그룹 writing(blog, artex-ko)
function realBoard() {
  clock = 0;
  const nodes = [{ id: 'human', kind: 'human', name: 'you' },
    node('conductor', 'multitask', { state: 'working', model: 'claude-fable-5-1', effort: 'high' }),
    kid('p96', 'multitask', 'conductor', { state: 'working', role: 'codex child', agentKind: 'codex' }), kid('p97', 'multitask', 'conductor', { state: 'working', role: 'launchers' }),
    kid('p98', 'multitask', 'conductor', { state: 'ready', category: 'done', role: 'top bar' }), kid('p99', 'multitask', 'conductor', { state: 'working', role: 'arrange links' }),
    kid('p100', 'multitask', 'conductor', { state: 'working', role: 'mission map' }), kid('reviewer', 'multitask', 'conductor', { role: 'reviewer' }), kid('p95', 'multitask', 'conductor', { state: 'exited', category: 'exited' }),
    node('blog-lead', 'blog'), kid('writer', 'blog', 'blog-lead', { state: 'working' }), kid('artex-port', 'artex-ko', 'blog-lead', { state: 'waiting', category: 'needs_you', ask: 'Overwrite?' }),
    node('artex', 'artex-ko', { state: 'sleeping' }), node('artex-copy', 'artex-ko', { category: 'done' }),
    node('notes', 'notes', { state: 'waiting', category: 'needs_you', ask: 'Delete this file?' }),
    node('scraper', 'scraper', { state: 'working' }), node('scraper-sh', 'scraper', { agentKind: 'shell', state: 'working' }),
    node('infra', 'infra', { agentKind: 'shell' }), node('dotfiles', 'dotfiles', { state: 'sleeping' }), node('paper', 'research', { state: 'sleeping' }), node('paper-codex', 'research', { agentKind: 'codex' }),
    node('api', 'api', { state: 'sleeping' }), node('site', 'site', { agentKind: 'shell' }), node('landing', 'landing', { state: 'exited', category: 'exited' })];
  const edges = [{ from: 'human', to: 's:conductor', kind: 'bar', count: 4 }, { from: 's:reviewer', to: 's:p98', kind: 'role', label: 'review' }];
  return { nodes, edges };
}
const ORDER = ['multitask', 'blog', 'artex-ko', 'notes', 'scraper', 'infra', 'dotfiles', 'research', 'api', 'site', 'landing'];
const VG = [{ id: 'g1', name: 'writing', members: ['blog', 'artex-ko'] }];
const sessionsOf = (g) => g.nodes.filter((n) => n.kind === 'session');
const headsOf = (lay, S = MISSION) => lay.groups.filter((g) => !g.collapsed).map((g) => ({ x: g.x, y: g.y, w: g.w, h: S.head }));

test('PC: 실제 판 모양 — 겹침 없음, 모든 세션에 테두리 있는 모양, 세션은 자기 워크스페이스 판 안, 판은 여러 열', () => {
  for (const [w, h] of [[1580, 968], [2172, 1290], [1200, 800]]) {
    const g = realBoard();
    const lay = missionLayout(g, { order: ORDER, vgroups: VG, width: w, height: h });
    const bs = [...lay.boxes.values()];
    assert.equal(overlap(bs), null, `${w}: 상자`);
    assert.equal(overlap(lay.groups), null, `${w}: 판`);
    for (const n of sessionsOf(g)) {
      const b = lay.boxes.get(n.id);
      assert.ok(b && b.w > 20 && b.h >= 20, `${w}: ${n.name}에 모양`);
      assert.ok(['card', 'pill', 'dot'].includes(b.kind), `${w}: ${n.name} ${b.kind}`);
      const p = lay.groups.find((x) => x.key === n.workspaceKey);
      assert.equal(b.ws, n.workspaceKey, `${n.name}은 자기 워크스페이스`);
      assert.ok(b.x >= p.x && b.x + b.w <= p.x + p.w + 0.5 && b.y >= p.y + MISSION.head - 0.5 && b.y + b.h <= p.y + p.h + 0.5, `${w}: ${n.name}은 판 안`);
    }
    // 쉼·잠듦·끝남은 알약(하위가 없으면), 일함·응답 필요·결과는 카드
    const by = (k) => lay.boxes.get(`s:${k}`);
    for (const k of ['artex', 'dotfiles', 'paper', 'api', 'landing', 'infra', 'reviewer', 'p95']) assert.equal(by(k).kind, 'pill', k);
    for (const k of ['conductor', 'p96', 'notes', 'artex-port', 'p98', 'artex-copy', 'scraper-sh']) assert.equal(by(k).kind, 'card', k);
    assert.ok(new Set(lay.groups.map((x) => x.x)).size >= 2, `${w}: 판이 여러 열`);
  }
});

test('PC: 워크스페이스는 판으로 묶이고, 다른 워크스페이스 하위가 있는 판·가상 그룹 판은 이웃, 가상 그룹은 판들 위 띠', () => {
  const lay = missionLayout(realBoard(), { order: ORDER, vgroups: VG, width: 1580, height: 968 });
  const P = (k) => lay.groups.find((x) => x.key === k);
  assert.equal(lay.groups.length, 11);
  assert.deepEqual([P('multitask').count, P('multitask').work, P('multitask').needs], [8, 5, 0]);
  assert.deepEqual([P('artex-ko').count, P('artex-ko').needs], [3, 1]);
  assert.ok(P('multitask').span >= 2, '팀 판은 두 열 이상');
  assert.ok(touching(P('blog'), P('artex-ko'), MISSION), 'blog → artex-ko(다른 워크스페이스 하위, 같은 그룹)는 이웃');
  assert.ok(lay.frames.length >= 1 && lay.frames.every((f) => f.name === 'writing'));
  const keys = lay.frames.flatMap((f) => f.keys).sort();
  assert.deepEqual(keys, ['artex-ko', 'blog']);
  for (const k of keys) { const f = lay.frames.find((x) => x.keys.includes(k)), p = P(k); assert.ok(p.x >= f.x && p.x + p.w <= f.x + f.w + 0.5 && f.y + f.h <= p.y && p.y - (f.y + f.h) <= 8, `${k}는 그룹 띠 바로 아래`); }
  for (const f of lay.frames) for (const p of lay.groups) assert.ok(!hit(p, f), `띠가 ${p.key} 판을 덮지 않는다`);
  // 팀 판이 먼저(왼쪽 위), 판 차례는 사슬(이어진 판끼리) 차례
  assert.equal(lay.packOrder[0], 'multitask');
  assert.ok(lay.packOrder.indexOf('artex-ko') === lay.packOrder.indexOf('blog') + 1);
  const e = lay.edges.find((x) => x.from === 's:blog-lead' && x.to === 's:artex-port');
  assert.ok(e && e.tree && e.cross, '다른 워크스페이스 하위로 가는 나무 선');
});

test('PC: 선은 다른 카드·판 머리줄 뒤로 지나지 않는다(여러 폭, 큰 판)', () => {
  for (const w of [1580, 2172, 1200, 900]) {
    const lay = missionLayout(realBoard(), { order: ORDER, vgroups: VG, width: w });
    wiresClear(lay.edges.filter((e) => !e.quiet), lay.boxes.values(), headsOf(lay), `실제 판 ${w}`);
  }
  // 큰 판(세션 36개): 리드 하나에 하위 9개(쉬는 것 여럿)
  const g = realBoard();
  for (let i = 0; i < 13; i++) g.nodes.push(i === 0 ? node('big-00', 'big', { state: 'working' }) : i <= 9 ? kid(`big-${i}`, 'big', 'big-00', { state: ['working', 'ready', 'sleeping', 'exited'][i % 4] }) : node(`big-${i}`, ORDER[i % 11], { agentKind: 'shell' }));
  const lay = missionLayout(g, { order: [...ORDER, 'big'], vgroups: VG, width: 1580 });
  assert.equal(sessionsOf(g).length, 36);
  assert.equal(overlap([...lay.boxes.values()].filter((b) => b.kind !== 'dots')), null);
  assert.ok(sessionsOf(g).every((n) => lay.boxes.has(n.id)), '36개 모두 모양');
  wiresClear(lay.edges.filter((e) => !e.quiet), lay.boxes.values(), headsOf(lay), '큰 판');
});

test('PC: 큰 화면은 확대하지 않고 판 열로 폭을 채운다(배율 1), 작은 판은 열을 넓히고 확대, 넘치면 1에서 아래로 옮겨 본다', () => {
  const real = (w, h) => missionLayout(realBoard(), { order: ORDER, vgroups: VG, width: w, height: h });
  const fhd = real(1580, 968), qhd = real(2172, 1290);
  const M2 = 2 * MISSION.margin; // 확대는 캔버스 여백도 키운다
  assert.ok(fhd.zoom === 1 && fhd.height + M2 <= 968 + 0.5, `1920×1080: 1배로 한 화면(${fhd.zoom})`);
  assert.equal(qhd.zoom, 1, `2560×1440: 배율 1(${qhd.zoom})`);
  assert.ok((qhd.height + M2) * qhd.zoom <= 1290 + 0.5 && (qhd.width + M2) * qhd.zoom <= 2172 + 0.5, '칸 안(여백 포함)');
  // 화면 칸의 폭을 넉넉히 쓴다(1920: 지도 폭의 85% 넘게)
  assert.ok(fhd.width * fhd.zoom >= (1580 - 2 * MISSION.margin) * 0.85, `폭 ${fhd.width}`);
  // 작은 판(세션 셋)
  clock = 0;
  const small = { nodes: [node('lead', 'app', { state: 'working' }), kid('worker', 'app', 'lead', { state: 'working' }), kid('reviewer', 'app', 'lead')], edges: [] };
  const s = missionLayout(small, { order: ['app'], width: 1580, height: 968 });
  assert.equal(s.zoom, MISSION.zooms[0]); assert.deepEqual(MISSION.zooms, [1], "확대하지 않는다(사용자: 확대가 너무 심하다)"); assert.equal(s.groups[0].span, 2);
  assert.ok(s.C > MISSION.maxC, '판이 바라는 열이 적으면 열을 넓힌다');
  // 넘치는 판: 배율 1
  const g = realBoard();
  for (let i = 0; i < 40; i++) g.nodes.push(node(`x${i}`, `x${i}`, { state: 'working' }));
  assert.equal(missionLayout(g, { order: ORDER, width: 1580, height: 968 }).zoom, 1);
  // 열 격자
  assert.deepEqual(gridFor(1532), { N: 5, C: 290.4 });
  assert.equal(gridFor(1532, MISSION, 2).N, 2);
});

test('PC: 쉬는 하위가 아주 많으면 테두리 있는 상자 안 동그라미, 선은 상자로 하나', () => {
  clock = 0;
  const nodes = [node('lead', 'w', { state: 'working' }), kid('busy', 'w', 'lead', { state: 'working' }), ...Array.from({ length: 8 }, (_, i) => kid(`r${i}`, 'w', 'lead', { state: i % 2 ? 'sleeping' : 'ready' }))];
  const lay = missionLayout({ nodes, edges: [] }, { width: 1580 });
  const tray = lay.boxes.get('dots:s:lead');
  assert.ok(tray && tray.kind === 'dots' && tray.node.ids.length === 8);
  for (let i = 0; i < 8; i++) { const d = lay.boxes.get(`s:r${i}`); assert.equal(d.kind, 'dot'); assert.ok(d.x >= tray.x && d.y >= tray.y && d.x + d.w <= tray.x + tray.w && d.y + d.h <= tray.y + tray.h, `r${i}는 상자 안`); }
  assert.equal(lay.edges.filter((e) => e.to === 'dots:s:lead').length, 1);
  assert.equal(lay.boxes.get('s:busy').kind, 'card');
});

test('휴대폰: 같은 엔진 — 판, 모든 세션에 모양, 세로 한 줄이 아님(두 칸), 가로는 네 칸, 배율 1, 선은 카드 뒤로 지나지 않는다', () => {
  const vg = VG;
  for (const [W, lanes] of [[373, 2], [832, 4]]) {
    const g = realBoard();
    const pm = phoneMission(g, { order: ORDER, vgroups: vg });
    const pg = phoneGraph(pm, { width: W });
    assert.equal(pg.lanes, lanes);
    assert.equal(pg.nodes.length, sessionsOf(g).length, '모든 세션');
    assert.equal(overlap(pg.nodes), null);
    assert.equal(overlap(pg.groups.map((x) => ({ ...x, id: x.key }))), null, '판');
    for (const n of pg.nodes) { assert.ok(['card', 'pill', 'dot'].includes(n.kind) && n.w > 10, n.id); assert.ok(n.x + n.w <= pg.width + 0.5, `${n.id} 폭 안`); }
    for (const n of pg.nodes.filter((x) => x.kind !== 'dot')) assert.equal(n.kind === 'pill', restTier(n.row.tier) && !(n.row.team), `${n.row.name}: 쉬면 알약`);
    // 세로 한 줄이 아니다: 가장 긴 기둥이 전체의 2/3 아래, 판이 두 x 이상
    const m = new Map(); for (const n of pg.nodes) m.set(Math.round(n.x / 20), (m.get(Math.round(n.x / 20)) || 0) + 1);
    assert.ok(Math.max(...m.values()) <= Math.ceil(pg.nodes.length * 2 / 3), `가장 긴 기둥 ${Math.max(...m.values())}`);
    assert.ok(new Set(pg.groups.map((x) => x.x)).size >= 2);
    assert.ok(pg.frames.length >= 1 && pg.frames.every((f) => f.name === 'writing'));
    assert.equal(fitView(pg, { w: W + 2 * VIEW.PAD, h: 700 }).zoom, 1, '배율 1로 읽힌다');
    const boxes = [...pg.nodes, ...pg.dots.map((d) => ({ ...d, kind: 'dots' }))];
    wiresClear(pg.edges, boxes, pg.groups.filter((x) => !x.folded).map((x) => ({ x: x.x, y: x.y, w: x.w, h: PG.head })), `휴대폰 ${W}`);
  }
});

test('개발용 판 A 모양(역할 연결이 다른 워크스페이스 하위가 된다): PC·휴대폰 모두 선이 카드·머리줄 뒤로 지나지 않고, 다른 워크스페이스 하위가 있는 판은 이웃', () => {
  clock = 0;
  const g = { nodes: [node('lead', 'a', { state: 'waiting', category: 'needs_you' }), kid('rev', 'a', 'lead', { state: 'working', role: 'reviewer' }), node('ui', 'a', { agentKind: 'shell' }), node('tests', 'a', { agentKind: 'shell', state: 'working' }),
    node('lead2', 'b', { category: 'done' }), node('notes', 'b', { agentKind: 'shell' }), kid('port', 'c', 'lead2', { state: 'working', role: 'porter' }),
    node('old', 'd', { state: 'sleeping' }), node('e', 'e', { state: 'sleeping' }), node('f', 'f', { agentKind: 'shell' }), node('gg', 'g', { category: 'done' }), node('i', 'i', { state: 'sleeping' }), node('docs', 'j', { agentKind: 'shell' })],
  edges: [{ from: 's:lead', to: 's:ui', kind: 'role', label: 'ui worker' }, { from: 's:lead', to: 's:tests', kind: 'role', label: 'test runner' }, { from: 's:lead2', to: 's:notes', kind: 'role', label: 'notes' }, { from: 's:rev', to: 's:ui', kind: 'role', label: 'review' }, { from: 's:rev', to: 's:old', kind: 'role', label: 'archive' }] };
  const order = ['d', 'e', 'i', 'a', 'b', 'g', 'f', 'j', 'c'];
  const vg = [{ id: 'p', name: 'product', members: ['a', 'b'] }];
  for (const [w, h] of [[1532, 922], [2104, 1275], [1100, 700]]) {
    const lay = missionLayout(g, { order, vgroups: vg, width: w, height: h });
    assert.equal(overlap([...lay.boxes.values()]), null);
    wiresClear(lay.edges.filter((e) => !e.quiet), lay.boxes.values(), headsOf(lay), `PC ${w}`);
    const P = (k) => lay.groups.find((x) => x.key === k);
    assert.ok(touching(P('b'), P('c'), MISSION), `${w}: b — c 이웃`);
  }
  for (const W of [373, 832]) {
    const pg = phoneGraph(phoneMission(g, { order, vgroups: vg }), { width: W });
    assert.equal(overlap(pg.nodes), null);
    const boxes = [...pg.nodes, ...pg.dots.map((d) => ({ ...d, kind: 'dots' }))];
    wiresClear(pg.edges, boxes, pg.groups.filter((x) => !x.folded).map((x) => ({ x: x.x, y: x.y, w: x.w, h: PG.head })), `휴대폰 ${W}`);
  }
});

test('엔진: 접은 판은 머리줄만(수는 그대로), 판 차례·이웃은 입력 그대로, 빈 판 없음', () => {
  const nodes = [{ id: 'a', ws: 'x', tier: 'work' }, { id: 'b', ws: 'x', tier: 'rest' }, { id: 'c', ws: 'y', tier: 'turn' }];
  const lay = boardLayout({ keys: ['x', 'y', 'z'], nodes, parent: new Map([['b', 'a'], ['c', 'a']]), collapsed: new Set(['y', 'z']), counts: new Map([['z', { count: 2, work: 1, turn: 0 }]]) }, { width: 1200 });
  assert.deepEqual(lay.groups.map((g) => [g.key, g.collapsed, g.count]), [['x', false, 2], ['y', true, 1], ['z', true, 2]]);
  assert.ok(!lay.boxes.has('c') && lay.boxes.get('g:y').proxy);
  assert.ok(lay.edges.some((e) => e.from === 'a' && e.to === 'g:y'), '접은 판으로 모인다');
  assert.ok(touching(lay.groups[0], lay.groups[1], MISSION), '이어진 판(x → y)은 이웃');
  assert.equal(boardLayout({ keys: [], nodes: [] }).groups.length, 0);
});

test('글자 크기 하한(PC 카드 제목 16px, 둘째 줄 13.5px, 메타 12px, 알약 14.5px, 판 이름 14.5px), 색은 토큰만, 끝없는 움직임 없음', () => {
  const css = fs.readFileSync(new URL('../src/renderer/styles.css', import.meta.url), 'utf8');
  const block = css.slice(css.indexOf('/* ---------- P100: 미션 맵 다시 그림')).replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(block.length > 1000);
  const size = (sel) => { const m = block.match(new RegExp(`${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{[^}]*?(?:font-size: |font: [0-9]+ )([0-9.]+)px`)); return m ? Number(m[1]) : NaN; };
  assert.ok(size('.mt-mm-name') >= 16, 'PC 카드 제목');
  assert.ok(size('.mt-mm-c2') >= 13.5, '둘째 줄');
  assert.ok(size('.mt-mm-c3') >= 12, '메타');
  assert.ok(size('.mt-mm-pill .nm') >= 14.5, '알약 이름');
  assert.ok(size('.mt-mm-ws .hd .nm') >= 14.5, '판 이름');
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(block), 'P100 덩어리에 글자로 박은 색이 없다');
  assert.ok(!/infinite/.test(block));
  const phone = fs.readFileSync(new URL('../src/renderer/phone.css', import.meta.url), 'utf8');
  const pb = phone.slice(phone.indexOf('/* ---------- P100: 휴대폰 미션 맵')).replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(pb.length > 1000 && !/#[0-9a-fA-F]{3,8}\b/.test(pb) && !/infinite|backdrop-filter|will-change|box-shadow|filter:/.test(pb), '휴대폰 덩어리: 토큰만, 가볍게(P89)');
  const tokens = fs.readFileSync(new URL('../src/renderer/tokens.css', import.meta.url), 'utf8');
  for (const k of ['--mm-map', '--mm-ws', '--mm-ws-head', '--mm-ws-line', '--mm-card-bg', '--mm-edge', '--mm-edge-sleep', '--mm-line', '--mm-line-faint', '--mm-frame-line', '--mm-frame-text']) assert.ok(tokens.includes(`${k}:`), k);
});

test('사전: mmBoard 열쇠가 두 언어에 모두 있다', () => {
  assert.deepEqual(Object.keys(ko.mmBoard).sort(), Object.keys(en.mmBoard).sort());
  for (const k of ['pillSleep', 'pillDone', 'wsTitle', 'wsNeeds', 'wsWorking', 'frameTitle', 'dots', 'goAnswer', 'hint']) assert.ok(en.mmBoard[k] && ko.mmBoard[k], k);
  assert.match(ko.mmBoard.pillSleep, /\{age\}/); assert.match(en.mmBoard.wsTitle, /\{name\}/);
});
