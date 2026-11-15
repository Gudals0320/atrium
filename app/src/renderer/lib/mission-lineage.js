// P153 r7: 세션 맵 PC = 시안 B "Lineage"(experiments/mm-concepts/project/B.dc.html) 배치. 순수 함수만 둔다(단위 시험 test/p153-lib.test.mjs).
// - 폴더(사이드바 가상 그룹) = 가로 띠(왼쪽 기둥 SPINE에 이름·세션 수·상태 비율 막대). 차례는 사이드바: 폴더들(사이드바 차례), 그 뒤 "폴더 없음" 띠(폴더 밖 워크스페이스, 판 차례).
// - 워크스페이스 = 띠 안의 줄. 줄마다 고정 칸: 워크스페이스 머리(HEADW) · 리드(COL[0]) · 워커(COL[1]) · 다음 단계(COL[2] 이후, 나무 깊이만큼) · 혼자(구분선 오른쪽 두 줄 격자).
// - 팀 = 같은 워크스페이스 안의 나무(lib/mission-model.js missionTree: 부모 > 역할 > 띄움 > 시킴). 왼 → 오른으로 자란다. 하위는 위 → 아래로 쌓고 부모는 하위 묶음의 세로 가운데.
//   부모가 다른 워크스페이스에 있으면 자기 줄의 워커 칸(COL[1])에 놓고(그 하위는 다음 칸), 부모와는 다른 워크스페이스 선(cross)으로 잇는다. 부모가 닫힌 세션은 뿌리.
// - 선: 나무 선은 부모 오른쪽 가운데 → 칸 사이 틈의 줄기 → 하위 왼쪽 가운데(화살촉). 다른 워크스페이스 선은 격자 길 찾기(lib/mission-terr.js routeOrtho)로 카드·줄 머리·기둥을 피해 받는 카드의 왼쪽(또는 위)으로.
// - 카드 폭은 이 판의 가장 긴 이름이 멀리 타일에서 한 줄에 들게(lib/mission-terr.js cardWidth), 높이는 내용(cardHeight).
// → { cards: Map id → { x, y, w, h, node, ws, depth }, bands, rows, cols, divs, edges, bounds, order, tree, cw }
import { missionTree, relOf, bySpawn, nodeTier } from './mission-model.js';
import { chipCounts, normKey, keyName, cardWidth, cardHeight, routeOrtho } from './mission-terr.js';

// SPINE = 폴더 기둥 폭, HEADX·HEADW = 워크스페이스 머리 자리, GX = 칸 사이(줄기가 지난다), GY = 형제 사이, RT·RB = 줄 위아래 여백, ROWMIN = 줄 최소 높이,
// SOLOGAP = 마지막 나무 칸과 혼자 칸 사이(구분선이 가운데), SGX = 혼자 칸 두 줄 사이, MINCOLS = 늘 보이는 나무 칸 수(리드·워커·다음 단계)
export const LINE = { SPINE: 210, HEADX: 232, HEADW: 300, GX: 110, GY: 22, RT: 26, RB: 30, ROWMIN: 170, SOLOGAP: 120, SGX: 24, MINCOLS: 3, ASPECT: 1.8, NAME_PX: 30, BANDGAP: 36, RING: 12, EDGEGAP: 4 }; // BANDGAP: 폴더 띠 사이 빈 칸. RING·EDGEGAP: 선 끝을 카드 강조 고리 바깥에(작업 중 빛 고리, 그 밖은 테두리 바로 밖) // NAME_PX: 멀리 타일 이름 세계 글 크기(처음 화면 폭 맞춤 배율 0.35~0.4에서 화면 11~12px)

export function lineageLayout(graph, { order: order0 = [], vgroups = [], tiers = null, names = null, routing = true, noFolder = 'No folder' } = {}) {
  const tree = missionTree(graph);
  const { byId } = tree;
  const L = { ...LINE, CW: cardWidth(tree.nodes.map((n) => n.name), LINE.NAME_PX) };
  const tierOf = (id) => (tiers && tiers.has(id) ? tiers.get(id) : nodeTier(byId.get(id)));
  const wsOf = (id) => (byId.get(id) || {}).workspaceKey || '';
  const nameOf = (key) => (names && names.get(key)) || (key ? keyName(key) : '');

  // ---- 소속과 차례(사이드바와 같다) ----
  const folderOf = new Map();
  (vgroups || []).forEach((g, gi) => (g.members || []).forEach((m, mi) => { const k = normKey(m); if (k && !folderOf.has(k)) folderOf.set(k, { g, gi, mi }); }));
  const present = [...new Set(tree.nodes.map((n) => wsOf(n.id)))];
  const ord = new Map((order0 || []).map((k, i) => [normKey(k), i]));
  const wsRank = (k) => (ord.has(normKey(k)) ? ord.get(normKey(k)) : 1e6);
  const byWsOrder = (a, b) => (!a) - (!b) || wsRank(a) - wsRank(b) || String(nameOf(a)).localeCompare(String(nameOf(b))) || String(a).localeCompare(String(b));
  const groups = [];
  for (const [gi, g] of (vgroups || []).entries()) {
    const keys = present.filter((k) => k && folderOf.has(normKey(k)) && folderOf.get(normKey(k)).gi === gi).sort((a, b) => folderOf.get(normKey(a)).mi - folderOf.get(normKey(b)).mi);
    if (keys.length) groups.push({ id: g.id, name: g.name, keys });
  }
  const loose = present.filter((k) => !k || !folderOf.has(normKey(k))).sort(byWsOrder);
  if (loose.length) groups.push({ id: null, name: noFolder, keys: loose });

  const parentIn = (id) => { const p = tree.parent.get(id); return p && wsOf(p) === wsOf(id) ? p : null; };
  const crossIn = (id) => { const p = tree.parent.get(id); return !!p && wsOf(p) !== wsOf(id); };
  const kidsIn = (id) => (tree.kids.get(id) || []).filter((c) => wsOf(c.id) === wsOf(id));
  const own = new Map(tree.nodes.map((n) => [n.id, cardHeight(n, tierOf(n.id), crossIn(n.id), L.CW)]));
  const H = (id) => own.get(id) || 150;

  // 나무 깊이(칸 수): 리드 0, 부모가 다른 워크스페이스면 1에서 시작
  let maxDepth = 0;
  const depthWalk = (id, d, g) => { maxDepth = Math.max(maxDepth, d); if (g > 50) return; for (const c of kidsIn(id)) depthWalk(c.id, d + 1, g + 1); };
  for (const n of tree.nodes) if (!parentIn(n.id) && (kidsIn(n.id).length || crossIn(n.id))) depthWalk(n.id, crossIn(n.id) ? 1 : 0, 0);
  const nCols = Math.max(L.MINCOLS, maxDepth + 1);
  const COL = Array.from({ length: nCols }, (_, i) => L.HEADX + L.HEADW + 208 + i * (L.CW + L.GX)); // 시안: 리드 칸 740 = 232 + 300 + 208
  const DIV = COL[nCols - 1] + L.CW + L.SOLOGAP / 2;
  const SOLO = COL[nCols - 1] + L.CW + L.SOLOGAP;
  const W = SOLO + (L.CW + L.SGX) * 2 + 60;

  const cards = new Map(), bands = [], rows = [], divs = [];
  const place = (id, depth, top, ws) => {
    const ks = depth > 50 ? [] : kidsIn(id).slice().sort(bySpawn);
    if (!ks.length) { cards.set(id, { x: COL[Math.min(depth, nCols - 1)], y: top, w: L.CW, h: H(id), node: byId.get(id), ws, depth }); return H(id); }
    let t = top;
    for (const k of ks) t += place(k.id, depth + 1, t, ws) + L.GY;
    const h = t - L.GY - top;
    const my = Math.max(h, H(id));
    cards.set(id, { x: COL[Math.min(depth, nCols - 1)], y: top + (my - H(id)) / 2, w: L.CW, h: H(id), node: byId.get(id), ws, depth });
    // 하위 묶음이 부모보다 낮으면 하위를 가운데로 내린다
    if (h < H(id)) { const dy = (H(id) - h) / 2; const shift = (x) => { for (const c of kidsIn(x)) { const b = cards.get(c.id); if (b) b.y += dy; shift(c.id); } }; shift(id); }
    return my;
  };
  let y = 0;
  groups.forEach((g, gi) => {
    if (gi) y += L.BANDGAP; // P153 r8: 폴더 사이를 띄운다
    const by = y;
    g.keys.forEach((key, wi) => {
      const nodes = tree.nodes.filter((n) => wsOf(n.id) === key).sort(bySpawn);
      // 리드 칸: 이 줄에 하위가 있는 뿌리, 그리고 하위가 다른 워크스페이스에만 있는 뿌리(이끄는 세션이라 혼자 칸에 두지 않는다)
      const leadsAway = (n) => (tree.kids.get(n.id) || []).some((c) => wsOf(c.id) !== key);
      const roots = nodes.filter((n) => !parentIn(n.id) && !crossIn(n.id) && (kidsIn(n.id).length || leadsAway(n)));
      const away = nodes.filter((n) => crossIn(n.id)); // 부모가 다른 워크스페이스(워커 칸에서 시작)
      const solos = nodes.filter((n) => !parentIn(n.id) && !crossIn(n.id) && !kidsIn(n.id).length && !leadsAway(n));
      let cy = y + L.RT;
      for (const r of roots) cy += place(r.id, 0, cy, key) + L.GY * 2;
      for (const s of away) cy += place(s.id, 1, cy, key) + L.GY * 2;
      const treeH = cy - y - L.GY * 2;
      let sy = y + L.RT;
      const soloH = [];
      solos.forEach((s, i) => {
        if (i % 2 === 0 && i) sy += Math.max(H(solos[i - 2].id), H(solos[i - 1].id)) + L.GY;
        cards.set(s.id, { x: SOLO + (i % 2) * (L.CW + L.SGX), y: sy, w: L.CW, h: H(s.id), node: s, ws: key, depth: -1 });
        soloH.push(sy + H(s.id) - y);
      });
      const h = Math.max(treeH, soloH.length ? Math.max(...soloH) : 0, L.ROWMIN) + L.RB;
      const chips = chipCounts(nodes.map((n) => tierOf(n.id)));
      rows.push({ key, name: nameOf(key), band: g.id, first: wi === 0, y, h, x: L.SPINE, w: W - L.SPINE, chips, count: nodes.length });
      divs.push({ x: DIV, y: y + 16, h: h - 32 });
      y += h;
    });
    const ids = tree.nodes.filter((n) => g.keys.includes(wsOf(n.id))).map((n) => n.id);
    bands.push({ id: g.id, name: g.name, loose: g.id == null, odd: gi % 2 === 1, y: by, h: y - by, nWs: g.keys.length, sessions: ids.length, bar: chipCounts(ids.map(tierOf)) });
  });

  // ---- 선 ----
  const r1 = (v) => Math.round(v * 10) / 10;
  const poly = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${r1(p[0])} ${r1(p[1])}`).join(' ');
  const edges = [], cross = [];
  // 선 끝과 카드 사이 틈: 작업 중 카드는 빛 고리 바깥(RING), 그 밖은 테두리 바로 밖(EDGEGAP). 화살촉이 고리를 덮지 않는다
  const gap = (id) => (tierOf(id) === 'work' ? L.RING : L.EDGEGAP);
  // 꺾인 선의 처음(또는 끝) 점이 카드 변 위에 있으면 그 변의 바깥쪽으로 g만큼 민다(토막 방향 그대로라 직각은 유지된다)
  const pushOut = (pts, box, g, first) => {
    const out = pts.map((p) => [...p]), p = out[first ? 0 : out.length - 1]; // 첫·끝 토막은 늘 변에 수직이라 바깥으로 밀어도 직각
    if (Math.abs(p[0] - box.x) < 0.5) p[0] -= g; else if (Math.abs(p[0] - (box.x + box.w)) < 0.5) p[0] += g; else if (Math.abs(p[1] - box.y) < 0.5) p[1] -= g; else if (Math.abs(p[1] - (box.y + box.h)) < 0.5) p[1] += g;
    return out;
  };
  for (const [child, via] of tree.via) {
    const parent = tree.parent.get(child);
    const a = cards.get(parent), b = cards.get(child);
    if (!a || !b) continue;
    const rel = relOf(via, tree);
    const base = { id: via.id, from: parent, to: child, rel, role: via.role || null, text: via.text || null, active: !!via.active, tree: true };
    if (wsOf(parent) !== wsOf(child)) { cross.push({ base, a, b }); continue; }
    const ay = a.y + a.h / 2, byy = b.y + b.h / 2, mx = a.x + a.w + L.GX / 2;
    const pts = ay === byy ? [[a.x + a.w + gap(parent), ay], [b.x - gap(child), byy]] : [[a.x + a.w + gap(parent), ay], [mx, ay], [mx, byy], [b.x - gap(child), byy]];
    const label = null; // P153 r8: 선 이름표는 없앴다(역할은 카드 둘째 줄, 다른 워크스페이스에서 온 것은 카드 맨 아래 줄이 말한다)
    edges.push({ ...base, cross: false, pts, d: poly(pts), label });
  }
  if (cross.length) {
    const blocks = [...cards.values()].map((c) => ({ x: c.x, y: c.y, w: c.w, h: c.h }));
    for (const r of rows) blocks.push({ x: L.HEADX - 8, y: r.y + 12, w: L.HEADW + 16, h: 96 }); // 줄 머리(이름·칩)
    for (const b of bands) blocks.push({ x: 0, y: b.y, w: L.SPINE, h: b.h }); // 폴더 기둥
    const routes = routing && cross.length <= 60 ? routeOrtho(cross.map((c) => ({ a: c.a, b: c.b, sides: ['left', 'top'] })), blocks, edges.map((e) => e.pts), { G: 16 }) : null;
    cross.forEach((c, i) => {
      let pts = routes && routes[i];
      if (!pts) { const ay = c.a.y + c.a.h / 2, by2 = c.b.y + c.b.h / 2, mx = c.a.x + c.a.w + 70; pts = [[c.a.x + c.a.w, ay], [mx, ay], [mx, by2], [c.b.x, by2]]; }
      pts = pushOut(pts, c.a, gap(c.base.from), true); pts = pushOut(pts, c.b, gap(c.base.to), false);
      edges.push({ ...c.base, cross: true, pts, d: poly(pts), label: null });
    });
  }

  const cols = [{ key: 'ws', x: L.HEADX }, ...COL.map((x, i) => ({ key: i === 0 ? 'lead' : i === 1 ? 'workers' : 'next', x })), { key: 'solo', x: SOLO }];
  const rowIdx = new Map(rows.map((r, i) => [r.key, i]));
  const order = [...cards.entries()].sort((p, q) => rowIdx.get(p[1].ws) - rowIdx.get(q[1].ws) || p[1].x - q[1].x || p[1].y - q[1].y).map(([id]) => id);
  return { cards, bands, rows, cols, divs, edges, bounds: { x: 0, y: 0, w: W, h: Math.max(1, y) }, order, tree, cw: L.CW, W };
}
