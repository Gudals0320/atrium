// P46 시험: 덩어리 안 연결 글의 배율별 모양(lib/dock-links.js), 작업 관계도의 워크스페이스 무리 배치(lib/mission-layout.js)
import test from 'node:test';
import assert from 'node:assert/strict';
import { dockLabelLevel, fitDockLabel, labelSpot, dockLabelParts, dockRoutes, DOCK_LABEL_ZOOM, DOCK_LABEL_MIN, DOCK_LABEL_MAX } from '../src/renderer/lib/dock-links.js';
import { missionLayout, MISSION } from '../src/renderer/lib/mission-layout.js';

// ---------- 연결 글 ----------
test('P46: 배율별 모양 — 0.4 아래는 화살표 블록, 0.4부터 역할, 0.8부터 방향·역할·상태', () => {
  assert.equal(dockLabelLevel(0.1), 'mini');
  assert.equal(dockLabelLevel(0.3), 'mini');
  assert.equal(dockLabelLevel(DOCK_LABEL_ZOOM.short - 0.001), 'mini');
  assert.equal(dockLabelLevel(DOCK_LABEL_ZOOM.short), 'short');
  assert.equal(dockLabelLevel(0.6), 'short');
  assert.equal(dockLabelLevel(DOCK_LABEL_ZOOM.full), 'full');
  assert.equal(dockLabelLevel(1), 'full');
  assert.equal(dockLabelLevel(2.5), 'full');
});

test('P46: 자리에 맞추기 — 모자라면 한 단계씩 내리고, 글 길이는 자리의 70%와 상한 안', () => {
  // 1600 × 900 덩어리의 가로 반반: 경계 900px
  assert.deepEqual(fitDockLabel(0.3, 900).level, 'mini');
  assert.equal(fitDockLabel(0.6, 900).level, 'short');
  const f = fitDockLabel(1, 900);
  assert.equal(f.level, 'full');
  assert.ok(f.max * 1 <= DOCK_LABEL_MAX + 1e-9 && f.max <= 900 * 0.7, '상한');
  // 짧은 경계: 배율 1이라도 full 자리가 없으면 short, 그것도 없으면 mini
  const roomFor = (px) => px / 0.7; // 화면 px만큼의 글 자리가 나는 경계 길이(배율 1)
  assert.equal(fitDockLabel(1, roomFor(DOCK_LABEL_MIN.full - 1)).level, 'short');
  assert.equal(fitDockLabel(1, roomFor(DOCK_LABEL_MIN.short - 1)).level, 'mini');
  assert.equal(fitDockLabel(1, roomFor(DOCK_LABEL_MIN.full)).level, 'full');
  // 판 px로 돌려준다: 배율 0.5면 화면 상한 340px은 판 680px
  const h = fitDockLabel(0.9, 4000);
  assert.ok(Math.abs(h.max * 0.9 - DOCK_LABEL_MAX) < 1e-6);
  // 배율을 올려도 모양은 내려가지 않는다(같은 경계)
  const lv = ['mini', 'short', 'full'];
  let prev = 0;
  for (let z = 0.1; z <= 2; z += 0.05) { const i = lv.indexOf(fitDockLabel(z, 600).level); assert.ok(i >= prev, `배율 ${z.toFixed(2)}`); prev = i; }
});

test('P46: 다리는 경계 길이(같은 쌍 여럿이면 나눈 몫)를 span으로, 바깥 길 글 자리는 가장 긴 바깥 선분', () => {
  const rects = { a: { x: 0, y: 0, w: 800, h: 900 }, b: { x: 800, y: 0, w: 800, h: 900 } };
  const one = dockRoutes(rects, [{ linkId: 'l1', from: 'a', to: 'b' }]);
  assert.equal(one.bridges[0].span, 900);
  assert.equal(one.bridges[0].axis, 'v');
  const two = dockRoutes(rects, [{ linkId: 'l1', from: 'a', to: 'b' }, { linkId: 'l2', from: 'b', to: 'a' }]);
  assert.deepEqual(two.bridges.map((b) => b.span), [450, 450]);
  // 2 × 2 대각선: 둘레 길
  const q = { tl: { x: 0, y: 0, w: 800, h: 450 }, tr: { x: 800, y: 0, w: 800, h: 450 }, bl: { x: 0, y: 450, w: 800, h: 450 }, br: { x: 800, y: 450, w: 800, h: 450 } };
  const r = dockRoutes(q, [{ linkId: 'd', from: 'tl', to: 'br' }]).routes[0];
  const s = labelSpot(r.points);
  assert.ok(s.len > 0);
  const segs = r.points.slice(1, -1).map((p, i, a) => (i ? Math.hypot(p.x - a[i - 1].x, p.y - a[i - 1].y) : 0));
  assert.equal(s.len, Math.max(...segs));
  assert.equal(labelSpot([{ x: 0, y: 0 }, { x: 0, y: -10 }, { x: 0, y: 300 }, { x: 0, y: 290 }]).vertical, true);
  assert.equal(labelSpot([{ x: 0, y: 0 }, { x: 0, y: -10 }, { x: 300, y: -10 }, { x: 300, y: 0 }]).vertical, false);
});

test('P46: 글의 낱말 — 사용자가 붙인 역할 그대로, 없으면 띄움·작업 요청, 방향은 @시킨 쪽 → @받는 쪽', () => {
  const names = { a: 'lead', b: 'api-tests' };
  const w = { spawned: '세션 생성', directed: '작업 요청' };
  assert.deepEqual(dockLabelParts({ from: 'a', to: 'b', role: 'P31 worker' }, names, w), { role: 'P31 worker', dir: '@lead → @api-tests', spawnTag: false });
  assert.equal(dockLabelParts({ from: 'a', to: 'b', role: 'reviewer', spawned: true }, names, w).spawnTag, true);
  assert.equal(dockLabelParts({ from: 'a', to: 'b', spawned: true }, names, w).role, '세션 생성');
  assert.equal(dockLabelParts({ from: 'a', to: 'b', observed: true }, names, w).role, '작업 요청');
  assert.equal(dockLabelParts({ from: 'b', to: 'x' }, names, w).dir, '@api-tests → @?');
});

// ---------- 작업 관계도 무리 ----------
const H = { id: 'human', kind: 'human' };
const S = (id, ws, o = {}) => ({ id: `s:${id}`, kind: 'session', name: id, category: 'idle', workspaceKey: ws, ...o });
const E = (from, to, kind, o = {}) => ({ id: `${kind}:${from}>${to}`, from: from === 'human' ? 'human' : `s:${from}`, to: `s:${to}`, kind, ...o });
const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const headOf = (g) => ({ x: g.x, y: g.y, w: g.w, h: MISSION.head }); // P100: 판 머리줄
const inside = (b, g) => b.x >= g.x - 0.5 && b.y >= g.y + MISSION.head - 0.5 && b.x + b.w <= g.x + g.w + 0.5 && b.y + b.h <= g.y + g.h + 0.5;
// 두 판이 붙어 있다: 한 축으로 틈이 G 안이고 다른 축으로 겹친다
const touching = (a, b) => { const gx = Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w), gy = Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h); return (gx <= MISSION.G + 1 && gx >= -0.5 && gy < 0) || (gy <= MISSION.G + MISSION.gHead + 1 && gy >= -0.5 && gx < 0); };
// 선의 점들(M·C·L·V·H·Q를 잘게 나눈다)
function pathPoints(d, n = 12) {
  const tok = d.match(/[MCLVHQ]|-?[\d.]+/g); const out = []; let x = 0, y = 0, i = 0, cmd = null;
  const num = () => Number(tok[i++]);
  while (i < tok.length) {
    if (/[A-Z]/.test(tok[i])) cmd = tok[i++];
    if (cmd === 'M') { x = num(); y = num(); out.push([x, y]); }
    else if (cmd === 'L') { const x2 = num(), y2 = num(); for (let k = 1; k <= n; k++) out.push([x + (x2 - x) * k / n, y + (y2 - y) * k / n]); x = x2; y = y2; }
    else if (cmd === 'V') { const y2 = num(); for (let k = 1; k <= n; k++) out.push([x, y + (y2 - y) * k / n]); y = y2; }
    else if (cmd === 'H') { const x2 = num(); for (let k = 1; k <= n; k++) out.push([x + (x2 - x) * k / n, y]); x = x2; }
    else if (cmd === 'Q') { const cx = num(), cy = num(), x2 = num(), y2 = num(); for (let k = 1; k <= n; k++) { const t = k / n, u = 1 - t; out.push([u * u * x + 2 * u * t * cx + t * t * x2, u * u * y + 2 * u * t * cy + t * t * y2]); } x = x2; y = y2; }
    else if (cmd === 'C') { const c1x = num(), c1y = num(), c2x = num(), c2y = num(), x2 = num(), y2 = num(); for (let k = 1; k <= n; k++) { const t = k / n, u = 1 - t; out.push([u * u * u * x + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * x2, u * u * u * y + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * y2]); } x = x2; y = y2; }
    else i++;
  }
  return out;
}

// 워크스페이스 셋(app, api, docs)에 걸친 세션 12개. lead(app)가 api·docs의 워커에게도 시킨다
const three = () => ({
  nodes: [H,
    S('lead', 'C:/w/app/', { category: 'working' }), S('ui', 'C:/w/app/', { parentId: 's:lead' }), S('ui-tests', 'C:/w/app/', { category: 'needs_you', parentId: 's:ui' }), S('app-notes', 'C:/w/app/'),
    S('api-lead', 'C:/w/api/'), S('api-tests', 'C:/w/api/', { category: 'needs_you', parentId: 's:lead' }), S('schema', 'C:/w/api/', { parentId: 's:api-lead' }), S('perf', 'C:/w/api/', { category: 'working' }),
    S('ko-copy', 'C:/w/docs/', { parentId: 's:lead' }), S('reviewer', 'C:/w/docs/', { parentId: 's:ko-copy' }), S('en-copy', 'C:/w/docs/'), S('glossary', 'C:/w/docs/', { category: 'needs_you' })],
  edges: [E('human', 'lead', 'bar', { count: 3 }), E('human', 'api-lead', 'bar'), E('lead', 'ui', 'role', { label: 'P31 worker' }), E('ui', 'ui-tests', 'role', { label: 'test worker' }),
    E('lead', 'api-tests', 'role', { label: 'api tests' }), E('api-lead', 'schema', 'spawn'), E('lead', 'ko-copy', 'role', { label: 'ko copy' }), E('ko-copy', 'reviewer', 'role', { label: 'reviewer' }),
    E('api-lead', 'en-copy', 'prompt', { label: 'translate' })],
});
const ORDER = ['C:/w/app/', 'C:/w/api/', 'C:/w/docs/'];

test('P46 → P100: 워크스페이스 판 — 세션은 자기 워크스페이스 판 안, 수(세션·응답 필요), 이어진 판은 붙어 있다, 겹치지 않음', () => {
  const lay = missionLayout(three(), { order: ORDER, width: 1600 });
  assert.deepEqual(lay.groups.map((g) => g.key), ORDER);
  assert.deepEqual(lay.groups.map((g) => [g.count, g.needs, g.work]), [[4, 1, 1], [4, 1, 1], [4, 1, 0]]);
  const bs = [...lay.boxes.values()];
  for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) assert.ok(!hit(bs[i], bs[j]), `${bs[i].node.id} × ${bs[j].node.id}`);
  for (let i = 0; i < lay.groups.length; i++) for (let j = i + 1; j < lay.groups.length; j++) assert.ok(!hit(lay.groups[i], lay.groups[j]), `판 ${lay.groups[i].key} × ${lay.groups[j].key}`);
  for (const b of bs) {
    const g = lay.groups.find((x) => x.key === b.node.workspaceKey);
    assert.equal(b.ws, b.node.workspaceKey, `${b.node.id}는 자기 워크스페이스 판`);
    assert.ok(inside(b, g), `${b.node.id}는 판 안(머리줄 아래)`);
    for (const h of lay.groups.map(headOf)) assert.ok(!hit(h, b), `머리줄 × ${b.node.id}`);
  }
  assert.ok(!lay.boxes.has('human'), 'P100: 나 동그라미 없음');
  // 판 안 나무: lead 0열 → ui 1열 → ui-tests 2열. 다른 워크스페이스 하위(api-tests, ko-copy)는 자기 판의 맨 위
  assert.deepEqual(['lead', 'ui', 'ui-tests', 'api-tests', 'ko-copy', 'reviewer'].map((k) => lay.boxes.get(`s:${k}`).depth), [0, 1, 2, 0, 0, 1]);
  assert.equal(lay.groups[0].span, 3, '팀 판은 나무 깊이만큼 열');
  // 이어진 판(app → api, app → docs, api ⇢ docs)은 붙어 있다
  const ps = lay.packOrder.map((k) => lay.groups.find((g) => g.key === k));
  for (let i = 1; i < ps.length; i++) assert.ok(touching(ps[i - 1], ps[i]), `${ps[i - 1].key} — ${ps[i].key}`);
  assert.deepEqual(lay.loose.sort(), ['s:app-notes', 's:glossary', 's:perf']);
  assert.ok(lay.boxes.get('s:app-notes').y > lay.boxes.get('s:ui-tests').y - 1 || lay.boxes.get('s:app-notes').x !== lay.boxes.get('s:ui-tests').x, '연결 없는 세션은 팀 아래 열에');
  // 순서를 모르면 키 이름 순
  assert.deepEqual(missionLayout(three()).groups.map((g) => g.key), ['C:/w/api/', 'C:/w/app/', 'C:/w/docs/']);
});

test('P46 → P100: 무리를 건너는 지시 — cross로 표시, 나무 선, 선은 다른 카드·판 머리줄 뒤로 지나지 않는다', () => {
  for (const width of [1600, 1100, 2400]) {
    const lay = missionLayout(three(), { order: ORDER, width });
    const cross = lay.edges.filter((e) => e.cross).map((e) => `${e.from}>${e.to}`).sort();
    assert.deepEqual(cross, ['s:api-lead>s:en-copy', 's:lead>s:api-tests', 's:lead>s:ko-copy']);
    assert.ok(lay.edges.find((e) => e.to === 's:ko-copy').tree, '나무 선');
    assert.ok(!lay.edges.find((e) => e.to === 's:ui').cross);
    const solid = [...lay.boxes.values()].filter((b) => b.kind !== 'dot');
    for (const e of lay.edges.filter((x) => !x.quiet)) {
      const obs = [...solid.filter((o) => o.id !== e.from && o.id !== e.to), ...lay.groups.map(headOf)];
      for (const [x, y] of pathPoints(e.d)) for (const o of obs) assert.ok(!(x > o.x + 1 && x < o.x + o.w - 1 && y > o.y + 1 && y < o.y + o.h - 1), `${width}: ${e.id}가 ${o.id || o.key || '머리줄'} 뒤로 지난다(${Math.round(x)},${Math.round(y)})`);
    }
  }
});

test('P46 → P100: 접은 워크스페이스 — 머리줄만, 그 세션들로 가는 선은 머리줄(대리 상자)로 모인다, 다른 판은 그대로', () => {
  const open = missionLayout(three(), { order: ORDER, width: 1600 });
  const lay = missionLayout(three(), { order: ORDER, width: 1600, collapsed: ['C:/w/app/'] });
  const app = lay.groups.find((g) => g.key === 'C:/w/app/');
  assert.equal(app.collapsed, true);
  assert.equal(app.count, 4, '접어도 수는 그대로');
  assert.equal(app.h, MISSION.head, '머리줄만');
  for (const k of ['lead', 'ui', 'ui-tests', 'app-notes']) assert.ok(!lay.boxes.has(`s:${k}`), k);
  const px = lay.boxes.get('g:C:/w/app/');
  assert.ok(px && px.proxy && px.y === app.y);
  assert.ok(lay.edges.some((e) => e.from === 'g:C:/w/app/' && e.to === 's:api-tests'), '접은 판 → 다른 판의 하위');
  assert.ok(lay.edges.every((e) => e.from !== e.to));
  assert.ok(lay.height <= open.height);
  // 혼자인 세션이 있는 판을 접어도 다른 판의 자리는 그대로(앞에 놓인 판)
  const d = missionLayout(three(), { order: ORDER, width: 1600, collapsed: ['C:/w/docs/'] });
  assert.ok(!d.boxes.has('s:glossary') && d.boxes.get('g:C:/w/docs/').proxy);
  assert.equal(d.boxes.get('s:ui').y, open.boxes.get('s:ui').y, '다른 워크스페이스는 그대로');
});

test('P46: 워크스페이스가 없는 세션은 맨 끝 \'\' 머리 글', () => {
  const g = missionLayout({ nodes: [H, S('a', 'C:/w/app/'), S('b', null)], edges: [] }, { order: ORDER });
  assert.deepEqual(g.groups.map((x) => x.key), ['C:/w/app/', '']);
});
