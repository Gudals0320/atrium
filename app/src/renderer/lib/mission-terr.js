// P152: 미션 맵 A "Territories"(영토 지도) 배치와 무한 캔버스 셈. 순수 함수만 둔다(단위 시험 test/p152-lib.test.mjs).
// 그리는 쪽은 MissionTerr.jsx(PC 창·PC 웹)와 PhoneMission.jsx(휴대폰, phoneTerr).
// - 폴더(사이드바 가상 그룹, P44) = 색 점선 영토, 워크스페이스 = 영토 안의 섬(머리에 이름과 상태 수 칩), 폴더 밖 워크스페이스 = 영토 없는 점선 섬.
// - 팀(같은 워크스페이스 안에서 하위가 있는 뿌리) = 섬 안의 점선 무리. 리드가 위, 하위가 아래로 내려가는 나무(가운데 맞춤).
//   하위가 없는 하위(잎)는 한 줄에 KCOLS개까지 놓고 넘으면 다음 줄로 접는다(하위 20개 팀이 7000px로 늘어나지 않게). 둘째 줄부터는 잎 묶음 왼쪽의 줄기를 타고 내려간다.
//   하위가 있는 하위(가지)는 첫 줄에 먼저 놓고 그 아래로 다시 나무를 편다.
// - 혼자인 세션(그 워크스페이스 안에 부모도 하위도 없는 세션) = 무리 오른쪽 기둥(한 기둥에 rows개, 무리 높이에 맞춘다).
//   다른 워크스페이스의 하위는 자기 워크스페이스 섬에 놓고(혼자이거나 그 섬 무리의 리드), 부모와는 점선 곡선(cross)으로 잇는다. 부모 쪽 무리 머리에 "k는 다른 곳에서 일함".
// - 겹침 없음: 무리·기둥은 섬 안에서, 섬은 영토 안에서, 영토와 폴더 밖 섬은 세계에서 선반 쌓기(shelf: 왼→오 놓다가 목표 폭을 넘으면 다음 줄)로 놓는다.
//   목표 폭은 넓이의 제곱근에 화면 비율(가로가 넓다)을 곱한 값이라 판 규모가 커져도 한쪽으로만 늘어나지 않는다.
// - 선: 같은 섬 안의 나무 선은 꺾인 선(부모 아래 가운데 → 버스 → 하위 위 가운데), 다른 섬으로 가는 선과 나무 밖 연결은 곡선. 종류는 rel(spawn·role·prompt)과 cross.
// → { cards: Map id → { x, y, w, h, node, ws }, rings, isles, terrs, edges, bounds, order(키보드 차례), tree }
import { missionTree, relOf, groupedOrder, bySpawn, nodeTier } from './mission-model.js';

// 카드 340×184(보통 단계에서 이름·상태·시간 / 역할·하네스·모델 / 일 두 줄 / 오류 두 줄, 가까이 단계에서 관계 한 줄이 더 들어간다).
// GH·GV = 카드 사이 가로·세로 틈(세로 틈에 버스 선이 지난다), PAD = 섬 안 여백, HEAD = 섬 머리(이름·칩) 높이, RP·RH = 무리 안 여백·무리 머리 높이,
// RGAP = 무리 사이, SGAP·SVG = 혼자인 기둥의 가로·세로 틈, KCOLS = 잎 한 줄 수, PT·HT = 영토 안 여백·영토 머리, IGAP = 섬 사이, WGAP = 영토 사이
export const TERR = { CW: 340, CH: 184, GH: 28, GV: 76, PAD: 36, HEAD: 84, RP: 24, RH: 46, RGAP: 32, SGAP: 24, SVG: 20, KCOLS: 4, SOLO_ROWS: 3, PT: 48, HT: 116, IGAP: 44, WGAP: 140, ISLE_MIN: 420, RING_ROW: 2600, ASPECT: 1.7 };
// 확대 단계: 멀리 < 0.6 ≤ 보통 ≤ 1.2 < 가까이. 범위 0.08 ~ 2.4
export const ZOOM = { min: 0.08, max: 2.4, far: 0.6, near: 1.2, step: 1.25, wheel: 0.0016 };
export const LEVEL_K = { far: 0.42, mid: 0.85, near: 1.5 };
// 영토 색(폴더 차례대로 돈다). CSS .mt-ta-terr.c0 ~ c5
export const TERR_COLORS = 6;
// 상태 칩 차례(섬 머리): 응답 필요, 오류, 작업 중, 작업 완료, 쉼, 잠듦, 끝남
export const CHIP_ORDER = ['turn', 'alert', 'work', 'review', 'rest', 'sleep', 'done'];

// 선반 쌓기. items: [{ w, h }] → 같은 차례의 [{ x, y }] 와 { w, h }. 한 줄이 target을 넘으면 다음 줄(한 줄에 하나는 늘 들어간다)
export function shelf(items, target, gapX, gapY = gapX) {
  const pos = [];
  let x = 0, y = 0, rowH = 0, W = 0;
  for (const it of items) {
    if (x > 0 && x + it.w > target) { y += rowH + gapY; x = 0; rowH = 0; }
    pos.push({ x, y });
    x += it.w + gapX;
    rowH = Math.max(rowH, it.h);
    W = Math.max(W, x - gapX);
  }
  return { pos, w: W, h: items.length ? y + rowH : 0 };
}
// 선반 목표 폭: 넓이의 제곱근 × 비율, 가장 넓은 것보다 좁지 않게
export const shelfTarget = (items, aspect, gap) => {
  if (!items.length) return 0;
  const area = items.reduce((a, it) => a + (it.w + gap) * (it.h + gap), 0);
  return Math.max(Math.max(...items.map((it) => it.w)), Math.sqrt(area * aspect));
};

// 상태 수 칩: tiers(등급 배열) → [{ tier, n }](0은 뺀다, CHIP_ORDER 차례)
export function chipCounts(tiers) {
  const c = new Map();
  for (const t of tiers) c.set(t, (c.get(t) || 0) + 1);
  return CHIP_ORDER.filter((t) => c.get(t)).map((t) => ({ tier: t, n: c.get(t) }));
}

// 머리 글 폭 어림(글자 수 × 크기). 섬·영토가 이름보다 좁지 않게
const nameW = (s, px) => String(s || '').length * px;

// graph: mission.graph, opt: order(워크스페이스 차례), vgroups(가상 그룹), tiers(Map id → 등급), names(Map 워크스페이스 키 → 보일 이름, 폭 어림용)
export function territoryLayout(graph, { order: order0 = [], vgroups = [], tiers = null, names = null } = {}) {
  const L = TERR;
  const tree = missionTree(graph);
  const { byId } = tree;
  const tierOf = (id) => (tiers && tiers.has(id) ? tiers.get(id) : nodeTier(byId.get(id)));
  const wsOf = (id) => (byId.get(id) || {}).workspaceKey || '';
  const nameOf = (key) => (names && names.get(key)) || key || '';
  const { order: grouped, groupOf } = groupedOrder(order0, vgroups);
  // 워크스페이스 차례: 판 차례(가상 그룹끼리 붙임) + 차례에 없는 키(이름 차례) + 워크스페이스 없음('') 맨 끝
  const present = new Set(tree.nodes.map((n) => wsOf(n.id)));
  const keys = grouped.filter((k) => present.has(k));
  for (const k of [...present].filter((k) => k && !keys.includes(k)).sort()) keys.push(k);
  if (present.has('')) keys.push('');

  const parentIn = (id) => { const p = tree.parent.get(id); return p && wsOf(p) === wsOf(id) ? p : null; };
  const kidsIn = (id) => (tree.kids.get(id) || []).filter((c) => wsOf(c.id) === wsOf(id));
  const kidsAway = (id) => (tree.kids.get(id) || []).filter((c) => wsOf(c.id) !== wsOf(id));

  // ---- 무리 하나(나무)의 크기 재기와 놓기 ----
  const size = new Map(); // id → { w, h, kw(하위 묶음 폭) }
  const measure = (id, depth = 0) => {
    const kids = depth > 50 ? [] : kidsIn(id);
    if (!kids.length) { const s = { w: L.CW, h: L.CH, kw: 0 }; size.set(id, s); return s; }
    const branch = kids.filter((c) => kidsIn(c.id).length), leaf = kids.filter((c) => !kidsIn(c.id).length);
    let kw = 0, kh = 0;
    for (const c of branch) { const s = measure(c.id, depth + 1); kw += s.w + L.GH; kh = Math.max(kh, s.h); }
    if (leaf.length) {
      for (const c of leaf) measure(c.id, depth + 1);
      const cols = Math.min(L.KCOLS, leaf.length), rows = Math.ceil(leaf.length / cols);
      kw += cols * L.CW + (cols - 1) * L.GH + L.GH;
      kh = Math.max(kh, rows * L.CH + (rows - 1) * L.GV);
    }
    kw -= L.GH;
    const s = { w: Math.max(L.CW, kw), h: L.CH + L.GV + kh, kw };
    size.set(id, s);
    return s;
  };
  const local = new Map(); // id → { x, y } (섬 안 자리)
  const route = new Map(); // 하위 id → { parent, row, trunk(둘째 줄부터 줄기 x), bus0(첫 줄 버스 y) }
  const place = (id, x, y, depth = 0) => {
    const s = size.get(id);
    local.set(id, { x: x + (s.w - L.CW) / 2, y });
    const kids = depth > 50 ? [] : kidsIn(id);
    if (!kids.length) return;
    const branch = kids.filter((c) => kidsIn(c.id).length), leaf = kids.filter((c) => !kidsIn(c.id).length);
    const ky = y + L.CH + L.GV, bus0 = ky - L.GV / 2;
    let cx = x + (s.w - s.kw) / 2;
    for (const c of branch) { place(c.id, cx, ky, depth + 1); route.set(c.id, { parent: id, row: 0, trunk: null, bus0 }); cx += size.get(c.id).w + L.GH; }
    if (leaf.length) {
      const cols = Math.min(L.KCOLS, leaf.length);
      leaf.forEach((c, i) => {
        const row = Math.floor(i / cols);
        place(c.id, cx + (i % cols) * (L.CW + L.GH), ky + row * (L.CH + L.GV), depth + 1);
        route.set(c.id, { parent: id, row, trunk: row ? cx - L.GH / 2 : null, bus0 });
      });
    }
  };

  // ---- 섬(워크스페이스) ----
  const isleOf = new Map(); // 키 → { key, w, h, rings: [], ids }
  for (const key of keys) {
    const ids = tree.nodes.filter((n) => wsOf(n.id) === key).map((n) => n.id);
    const nodes = ids.map((id) => byId.get(id)).sort(bySpawn);
    const roots = nodes.filter((n) => !parentIn(n.id) && kidsIn(n.id).length);
    const solos = nodes.filter((n) => !parentIn(n.id) && !kidsIn(n.id).length);
    // 무리들: 선반 쌓기(한 줄 RING_ROW까지)
    const rs = roots.map((r) => { const s = measure(r.id); return { id: r.id, w: s.w + L.RP * 2, h: s.h + L.RH + L.RP }; });
    const rp = shelf(rs, Math.max(L.RING_ROW, ...rs.map((r) => r.w)), L.RGAP);
    const rings = [];
    rs.forEach((r, i) => {
      const x = L.PAD + rp.pos[i].x, y = L.HEAD + rp.pos[i].y;
      place(r.id, x + L.RP, y + L.RH);
      const team = [];
      const walk = (id, d) => { if (d > 50) return; for (const c of kidsIn(id)) { team.push(c.id); walk(c.id, d + 1); } };
      walk(r.id, 0);
      const away = [r.id, ...team].reduce((a, id) => a + kidsAway(id).length, 0);
      rings.push({ id: r.id, x, y, w: r.w, h: r.h, lead: r.id, n: team.length + 1, away });
    });
    // 혼자인 세션 기둥: 무리가 있으면 무리 높이만큼(적어도 SOLO_ROWS), 없으면 거의 정사각(세 줄까지, 많으면 제곱근)
    const sx0 = rs.length ? L.PAD + rp.w + L.RGAP : L.PAD;
    const sy0 = L.HEAD + (rs.length ? L.RH : 0);
    const n = solos.length;
    const rows = !n ? 0 : rs.length ? Math.max(L.SOLO_ROWS, Math.floor((rp.h - L.RH + L.SVG) / (L.CH + L.SVG))) : n <= 9 ? Math.min(L.SOLO_ROWS, n) : Math.ceil(Math.sqrt(n));
    solos.forEach((s, i) => local.set(s.id, { x: sx0 + Math.floor(i / rows) * (L.CW + L.SGAP), y: sy0 + (i % rows) * (L.CH + L.SVG) }));
    const cols = rows ? Math.ceil(n / rows) : 0;
    const right = cols ? sx0 + cols * (L.CW + L.SGAP) - L.SGAP : L.PAD + rp.w;
    const bottom = Math.max(rs.length ? L.HEAD + rp.h : 0, rows ? sy0 + Math.min(rows, n) * (L.CH + L.SVG) - L.SVG : 0, L.HEAD);
    const chips = chipCounts(ids.map(tierOf));
    const headW = 36 * 2 + 50 + nameW(nameOf(key), 16) + chips.length * 112;
    isleOf.set(key, { key, w: Math.max(L.ISLE_MIN, right + L.PAD, headW), h: bottom + L.PAD, rings, ids, chips, loose: !groupOf.get(key) });
  }

  // ---- 영토(폴더)와 세계 ----
  const items = []; // 세계에 놓을 것: { kind: 'terr'|'isle', ... } (워크스페이스 차례, 영토는 처음 나온 자리)
  const terrById = new Map();
  for (const key of keys) {
    const g = groupOf.get(key);
    if (!g) { items.push({ kind: 'isle', key }); continue; }
    if (!terrById.has(g.id)) { const t = { kind: 'terr', id: g.id, name: g.name, keys: [], color: terrById.size % TERR_COLORS }; terrById.set(g.id, t); items.push(t); }
    terrById.get(g.id).keys.push(key);
  }
  for (const t of terrById.values()) {
    const is = t.keys.map((k) => isleOf.get(k));
    const p = shelf(is, shelfTarget(is, L.ASPECT, L.IGAP), L.IGAP);
    t.inner = p;
    const sessions = is.reduce((a, i) => a + i.ids.length, 0);
    t.sessions = sessions;
    t.w = Math.max(L.PT * 2 + p.w, L.PT + nameW(t.name, 36) + 340);
    t.h = L.HT + p.h + L.PT;
  }
  const sized = items.map((it) => (it.kind === 'terr' ? it : { ...it, w: isleOf.get(it.key).w, h: isleOf.get(it.key).h }));
  const world = shelf(sized, shelfTarget(sized, L.ASPECT, L.WGAP), L.WGAP);
  const cards = new Map(), rings = [], isles = [], terrs = [];
  const putIsle = (key, x, y, folder) => {
    const I = isleOf.get(key);
    isles.push({ key, x, y, w: I.w, h: I.h, loose: !folder, folder: folder ? folder.id : null, color: folder ? folder.color : null, chips: I.chips, count: I.ids.length });
    for (const r of I.rings) rings.push({ ...r, x: x + r.x, y: y + r.y, ws: key });
    for (const id of I.ids) { const p = local.get(id); cards.set(id, { x: x + p.x, y: y + p.y, w: L.CW, h: L.CH, node: byId.get(id), ws: key }); }
  };
  sized.forEach((it, i) => {
    const { x, y } = world.pos[i];
    if (it.kind === 'isle') { putIsle(it.key, x, y, null); return; }
    terrs.push({ id: it.id, name: it.name, x, y, w: it.w, h: it.h, color: it.color, nWs: it.keys.length, sessions: it.sessions });
    it.keys.forEach((k, j) => putIsle(k, x + L.PT + it.inner.pos[j].x, y + L.HT + it.inner.pos[j].y, it));
  });

  // ---- 선 ----
  const edges = [];
  const cx = (b) => b.x + b.w / 2, cy = (b) => b.y + b.h / 2;
  const r1 = (v) => Math.round(v * 10) / 10;
  const poly = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${r1(p[0])} ${r1(p[1])}`).join(' ');
  // 곡선: 두 상자의 마주 보는 가장자리 사이(가로가 멀면 옆, 아니면 위·아래)
  const curve = (a, b) => {
    const dx = cx(b) - cx(a), dy = cy(b) - cy(a);
    let p, q, c1, c2;
    if (Math.abs(dx) > Math.abs(dy) * 1.4) {
      const s = Math.sign(dx) || 1;
      p = [s > 0 ? a.x + a.w : a.x, cy(a)]; q = [s > 0 ? b.x : b.x + b.w, cy(b)];
      const k = Math.max(60, Math.abs(q[0] - p[0]) / 2.2);
      c1 = [p[0] + s * k, p[1]]; c2 = [q[0] - s * k, q[1]];
    } else {
      const s = Math.sign(dy) || 1;
      p = [cx(a), s > 0 ? a.y + a.h : a.y]; q = [cx(b), s > 0 ? b.y : b.y + b.h];
      const k = Math.max(60, Math.abs(q[1] - p[1]) / 2.2);
      c1 = [p[0], p[1] + s * k]; c2 = [q[0], q[1] - s * k];
    }
    // 가운데 점(t = 0.5)은 이름표 자리
    const mid = [(p[0] + 3 * c1[0] + 3 * c2[0] + q[0]) / 8, (p[1] + 3 * c1[1] + 3 * c2[1] + q[1]) / 8];
    return { d: `M${r1(p[0])} ${r1(p[1])} C${r1(c1[0])} ${r1(c1[1])} ${r1(c2[0])} ${r1(c2[1])} ${r1(q[0])} ${r1(q[1])}`, mid };
  };
  const treePairs = new Set(tree.treeEdge);
  for (const [child, via] of tree.via) {
    const parent = tree.parent.get(child);
    const a = cards.get(parent), b = cards.get(child);
    if (!a || !b) continue;
    const rel = relOf(via, tree);
    const base = { id: via.id, from: parent, to: child, rel, role: via.role || null, text: via.text || null, active: !!via.active, tree: true };
    if (wsOf(parent) !== wsOf(child)) {
      const c = curve(a, b);
      edges.push({ ...base, cross: true, d: c.d, label: { x: c.mid[0], y: c.mid[1] } });
      continue;
    }
    const r = route.get(child);
    const pcx = cx(a), ccx = cx(b), top = b.y, busY = top - L.GV / 2;
    const pts = !r || !r.row ? [[pcx, a.y + a.h], [pcx, busY], [ccx, busY], [ccx, top]]
      : [[pcx, a.y + a.h], [pcx, r.bus0], [r.trunk, r.bus0], [r.trunk, busY], [ccx, busY], [ccx, top]];
    edges.push({ ...base, cross: false, d: poly(pts), label: rel === 'spawn' ? null : { x: ccx, y: top - 20 } });
  }
  // 나무 밖 연결(나무 선의 거꾸로 짝은 뺀다): 옅은 곡선, 이름표 없음
  for (const p of tree.pairs) {
    if (treePairs.has(p.id) || treePairs.has(`${p.to}>${p.from}`)) continue;
    const a = cards.get(p.from), b = cards.get(p.to);
    if (!a || !b) continue;
    const c = curve(a, b);
    edges.push({ id: p.id, from: p.from, to: p.to, rel: relOf(p, tree), role: p.role || null, text: p.text || null, active: !!p.active, tree: false, cross: wsOf(p.from) !== wsOf(p.to), link: true, d: c.d, label: null });
  }

  // ---- 둘레와 키보드 차례 ----
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const r of [...terrs, ...isles]) { x1 = Math.min(x1, r.x); y1 = Math.min(y1, r.y); x2 = Math.max(x2, r.x + r.w); y2 = Math.max(y2, r.y + r.h); }
  const bounds = Number.isFinite(x1) ? { x: x1, y: y1 - 60, w: x2 - x1, h: y2 - y1 + 60 } : { x: 0, y: 0, w: 1, h: 1 };
  const order = [...cards.entries()].sort((a, b) => {
    const ia = isles.findIndex((i) => i.key === a[1].ws), ib = isles.findIndex((i) => i.key === b[1].ws);
    return ia - ib || a[1].y - b[1].y || a[1].x - b[1].x;
  }).map(([id]) => id);
  return { cards, rings, isles, terrs, edges, bounds, order, tree };
}

// ---- 무한 캔버스 셈. 보기 v = { k, x, y }: 세계 점 w는 화면에서 w·k + (x, y) ----
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const clampK = (k) => clamp(k, ZOOM.min, ZOOM.max);
export const levelOf = (k) => (k < ZOOM.far ? 'far' : k <= ZOOM.near ? 'mid' : 'near');
// 화면 점 (mx, my)를 중심으로 배율 k2로: 그 점 아래 세계 점이 그대로 남는다
export function zoomAt(v, mx, my, k2) {
  const k = clampK(k2), r = k / v.k;
  return { k, x: mx - (mx - v.x) * r, y: my - (my - v.y) * r };
}
// 휠 한 칸의 배율(deltaMode 1 = 줄 단위)
export const wheelK = (k, deltaY, deltaMode = 0) => clampK(k * Math.exp(-(deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * 400 : deltaY) * ZOOM.wheel));
export const panBy = (v, dx, dy) => ({ k: v.k, x: v.x + dx, y: v.y + dy });
// 맞춤: 둘레를 화면(vw × vh, 위 top만큼 뜬 줄을 비우고 pad 여백)에 넣는다. 가까이 단계 위로는 키우지 않는다
export function fitView(b, vw, vh, { top = 0, pad = 60, bottom = 0, max = 1 } = {}) {
  const aw = Math.max(1, vw - pad * 2), ah = Math.max(1, vh - top - bottom - pad * 2);
  const k = clamp(Math.min(aw / Math.max(1, b.w), ah / Math.max(1, b.h)), ZOOM.min, max);
  return { k, x: (vw - b.w * k) / 2 - b.x * k, y: top + (vh - top - bottom - b.h * k) / 2 - b.y * k };
}
// 세계 점 (wx, wy)를 화면 가운데(위 줄 아래 남은 칸의 가운데)로
export const centerOn = (wx, wy, k, vw, vh, { top = 0, bottom = 0 } = {}) => { const kk = clampK(k); return { k: kk, x: vw / 2 - wx * kk, y: top + (vh - top - bottom) / 2 - wy * kk }; };
// 상자 하나를 화면에 맞춘다(섬으로 날아가기)
export const fitBox = (r, vw, vh, opt = {}) => fitView(r, vw, vh, { pad: 40, max: ZOOM.max, ...opt });
// 지금 보이는 세계 사각형
export const viewRect = (v, vw, vh) => ({ x: -v.x / v.k, y: -v.y / v.k, w: vw / v.k, h: vh / v.k });
// 미니맵: 둘레 b를 MW × MH에 넣는 배율과 원점, 사각형 바꾸기(r → 미니맵 좌표), 지금 보이는 틀
export function miniMap(b, v, vw, vh, MW, MH) {
  const s = Math.min(MW / Math.max(1, b.w), MH / Math.max(1, b.h));
  const ox = (MW - b.w * s) / 2, oy = (MH - b.h * s) / 2;
  const map = (r) => ({ x: ox + (r.x - b.x) * s, y: oy + (r.y - b.y) * s, w: r.w * s, h: r.h * s });
  return { s, ox, oy, map, frame: map(viewRect(v, vw, vh)) };
}
// 미니맵의 한 점을 누르면 그 세계 점을 가운데로(배율은 그대로)
export function miniToWorld(b, MW, MH, px, py) {
  const s = Math.min(MW / Math.max(1, b.w), MH / Math.max(1, b.h));
  const ox = (MW - b.w * s) / 2, oy = (MH - b.h * s) / 2;
  return { x: b.x + (px - ox) / s, y: b.y + (py - oy) / s };
}
// 누르고 뗀 것의 뜻: 조금(slop) 넘게 움직였으면 끌기, 카드 위면 고르기, 빈 곳이면 고름 풀기. 빈 곳을 눌러도 닫지 않는다(닫기는 단추·Esc·M만)
export const DRAG_SLOP = 5;
export function pressIntent({ dx = 0, dy = 0, onCard = false } = {}) {
  if (Math.abs(dx) + Math.abs(dy) >= DRAG_SLOP) return 'drag';
  return onCard ? 'pick' : 'clear';
}
// 키: + − 0(맞춤), 화살표(끌기), 그 밖은 null
export const PAN_STEP = 120;
export function viewKey(key, { shift = false } = {}) {
  const s = shift ? PAN_STEP * 3 : PAN_STEP;
  switch (key) {
    case '+': case '=': return { zoom: ZOOM.step };
    case '-': case '_': return { zoom: 1 / ZOOM.step };
    case '0': return { fit: true };
    case 'ArrowLeft': return { pan: [s, 0] };
    case 'ArrowRight': return { pan: [-s, 0] };
    case 'ArrowUp': return { pan: [0, s] };
    case 'ArrowDown': return { pan: [0, -s] };
    default: return null;
  }
}
// 카드 차례로 다음·앞: 지금 id에서 d만큼(끝에서 돈다). 카드에 초점이 있으면 ↑↓가 카드를 다니고(그 카드로 날아간다), 없으면 화살표는 끌기다
export function stepCard(order, id, d) {
  if (!order.length) return null;
  const i = order.indexOf(id);
  if (i < 0) return d > 0 ? order[0] : order[order.length - 1];
  return order[(i + d + order.length) % order.length];
}

// ---- 휴대폰(멀리 단계 지도): 섬마다 세션 타일 ----
// 타일 TILE, 틈 TGAP, 한 줄 TCOLS개. 섬 머리 IHEAD, 섬 안 여백 IPAD, 영토 머리 THEAD·여백 TPAD, 섬 사이 IG, 영토 사이 WG
export const PTERR = { TILE: 22, TGAP: 6, TCOLS: 6, IPAD: 8, IHEAD: 22, ISLE_MIN: 96, THEAD: 26, TPAD: 10, IG: 8, WG: 14, ASPECT: 1.3, TAP_MIN: 24 }; // ASPECT: 지도 칸(393×430 안팎)이 조금 가로로 길다
// lay: territoryLayout 결과 → { tiles: [{ id, x, y, s, ws }], isles, terrs, bounds }. 타일 차례는 섬 안 카드 차례(위 → 아래, 왼 → 오른)
export function phoneTerr(lay, { names = null } = {}) {
  const P = PTERR;
  const nameOf = (k) => (names && names.get(k)) || k || '';
  const byIsle = new Map(lay.isles.map((i) => [i.key, []]));
  for (const id of lay.order) { const c = lay.cards.get(id); if (byIsle.has(c.ws)) byIsle.get(c.ws).push(id); }
  const isleSize = (key) => {
    const n = byIsle.get(key).length, cols = Math.min(P.TCOLS, Math.max(1, n)), rows = Math.ceil(n / cols);
    const w = Math.max(P.ISLE_MIN, Math.min(nameW(nameOf(key), 6.6) + P.IPAD * 2, 150), P.IPAD * 2 + cols * P.TILE + (cols - 1) * P.TGAP);
    return { w, h: P.IPAD + P.IHEAD + rows * P.TILE + (rows - 1) * P.TGAP + P.IPAD, cols };
  };
  const items = [];
  const seenT = new Set();
  for (const i of lay.isles) {
    if (!i.folder) { items.push({ kind: 'isle', key: i.key }); continue; }
    if (seenT.has(i.folder)) continue;
    seenT.add(i.folder);
    const t = lay.terrs.find((x) => x.id === i.folder);
    items.push({ kind: 'terr', id: t.id, name: t.name, color: t.color, keys: lay.isles.filter((x) => x.folder === t.id).map((x) => x.key) });
  }
  for (const it of items) {
    if (it.kind === 'isle') { Object.assign(it, isleSize(it.key)); continue; }
    const is = it.keys.map(isleSize);
    it.inner = shelf(is, shelfTarget(is, P.ASPECT, P.IG), P.IG);
    it.sizes = is;
    it.w = Math.max(P.TPAD * 2 + it.inner.w, nameW(it.name, 9) + P.TPAD * 2);
    it.h = P.THEAD + it.inner.h + P.TPAD;
  }
  const world = shelf(items, shelfTarget(items, P.ASPECT, P.WG), P.WG);
  const tiles = [], isles = [], terrs = [];
  const putIsle = (key, x, y, s, color) => {
    isles.push({ key, x, y, w: s.w, h: s.h, loose: color == null, color });
    byIsle.get(key).forEach((id, j) => tiles.push({ id, ws: key, s: P.TILE, x: x + P.IPAD + (j % s.cols) * (P.TILE + P.TGAP), y: y + P.IPAD + P.IHEAD + Math.floor(j / s.cols) * (P.TILE + P.TGAP) }));
  };
  items.forEach((it, i) => {
    const { x, y } = world.pos[i];
    if (it.kind === 'isle') { putIsle(it.key, x, y, it, null); return; }
    terrs.push({ id: it.id, name: it.name, color: it.color, x, y, w: it.w, h: it.h });
    it.keys.forEach((k, j) => putIsle(k, x + P.TPAD + it.inner.pos[j].x, y + P.THEAD + it.inner.pos[j].y, it.sizes[j], it.color));
  });
  return { tiles, isles, terrs, bounds: { x: 0, y: 0, w: Math.max(1, world.w), h: Math.max(1, world.h) } };
}
// 휴대폰 타일 누르기: 화면에서 타일이 TAP_MIN보다 작으면 그 섬으로 날아가고, 크면 그 세션을 연다
export const tileTap = (zoom) => (PTERR.TILE * zoom >= PTERR.TAP_MIN ? 'open' : 'isle');

// 숨은 설정 missionStyle(판 설정, 설정 화면에 줄 없음): territories(기본, 이 영토 지도) / classic(P149까지의 열 지도, Mission.jsx ClassicMission·옛 PhoneMission).
// 바꾸려면 atrium CLI의 설정 바꾸기로 missionStyle을 classic으로 둔다
export const MISSION_STYLES = ['territories', 'classic'];
export const missionStyleOf = (settings) => (settings && settings.missionStyle === 'classic' ? 'classic' : 'territories');
