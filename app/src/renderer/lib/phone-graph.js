// P89 → P95 → P100: 휴대폰 미션 맵(PhoneMission.jsx)의 배치. PC와 같은 엔진(lib/mission-layout.js boardLayout)을 휴대폰 크기로 쓴다. 순수 함수만 둔다(단위 시험 app/test/p100-lib.test.mjs, p89-lib.test.mjs).
// - 입력은 lib/phone-mission.js의 결과(무리, 깊이 우선 줄, 강조 등급, 역할). 자료는 그대로 mission.graph만이다.
// - 화면 폭을 칸(lane)으로 나눈다: 세로 휴대폰 2칸, 가로 4칸쯤(lanesFor). 칸 폭은 화면에 맞춰 배율 1에서 읽힌다.
// - 워크스페이스는 판(옅은 바탕 면, 테두리, 머리줄): 팀이 있는 판은 두 칸(왼쪽 칸 리드 → 오른쪽 칸 하위, PC와 같은 왼쪽 → 오른쪽), 혼자인 판은 한 칸으로 가장 낮은 칸부터 채운다.
//   그래서 워크스페이스가 많고 세션이 한두 개씩인 판도 세로 한 줄로 늘어서지 않는다. 가상 그룹은 판들을 감싸는 옅은 테.
// - 모든 세션은 테두리 있는 카드나 알약. 쉬는 하위가 많으면 테두리 있는 상자 안 동그라미로 접는다.
// - 보기(이동·배율): fitView(처음과 "맞추기": 폭에 맞추고 위에 붙인다), clampView, focusView(요약 칩의 등급으로 맞추기).
import { boardLayout } from './mission-layout.js';

// 크기(CSS px): 카드 58(제목 14px), 알약 32, 판 머리줄 32. PC 엔진의 이름 그대로
export const PG = { G: 10, pad: 8, head: 32, cardH: 58, pillH: 32, vgap: 6, gin: 26, gHead: 24, passH: 14, minC: 140, maxC: 320, capC: 320, foldKids: 5, foldRest: 4, dot: 20, dotGap: 5, dotsHead: 22, quietSpan: 200, LANE_MIN: 160, PAD: 0, GAP: 10 };
export const VIEW = { PAD: 10, ZMIN: 0.25, ZMAX: 2.5, FIT_MAX: 1.25, MARGIN: 72, FOCUS_MAX: 1.2 };

// 그래프 폭(px) → 칸 수: 세로 휴대폰 2, 가로 4, 넓으면 6까지(짝수: 팀 판이 두 칸씩)
export const lanesFor = (width) => { const n = Math.floor(((width || 0) + PG.G) / (PG.LANE_MIN + PG.G)); return Math.max(2, Math.min(6, n > 2 && n % 2 ? n - 1 : n)); };
const n2 = (v) => Math.round(v * 10) / 10;
const keyOf = (k) => (k == null ? '-' : k);

// 깊이 우선 줄(depth) → 무리 안 나무 부모. 줄 순서가 곧 자리 순서다(띄운 순서, 상태가 바뀌어도 자리 그대로)
function parentsOf(rows, into) {
  const stack = [];
  for (const r of rows) {
    while (stack.length && stack[stack.length - 1].depth >= r.depth) stack.pop();
    const p = stack.length ? stack[stack.length - 1] : null;
    if (p && r.depth > 0) into.set(r.id, p.id);
    stack.push(r);
  }
}

// pm: phoneMission 결과, width: 그래프 폭(화면 폭에서 보기 여백을 뺀 것)
// → { nodes: [{ id, row, group, x, y, w, h, kind: 'card'|'pill'|'dot', cross }], edges: [{ id, from, to, kind: 'tree'|'link', rel, d, tier, active }],
//     groups: [{ key, x, y, w, h, folded, count, work, turn, vg, wide }], frames, dots: [{ id, x, y, w, h, n }], lanes, laneW, width, height }
export function phoneGraph(pm, { width = 373 } = {}) {
  const lanes = lanesFor(width);
  const laneW = n2((width + PG.G) / lanes - PG.G);
  const groupsIn = (pm && pm.groups) || [];
  const rowOf = new Map(), parent = new Map(), nodes = [], links = [], counts = new Map(), collapsed = new Set(), vg = new Map();
  for (const g of groupsIn) {
    const k = keyOf(g.key);
    if (g.vg) vg.set(k, g.vg);
    if (g.folded) { collapsed.add(k); counts.set(k, { count: g.count, work: g.work, turn: g.turn }); }
    parentsOf(g.rows || [], parent);
    for (const r of g.rows || []) rowOf.set(r.id, r);
  }
  for (const g of groupsIn) for (const r of g.rows || []) {
    if (r.fromId && rowOf.has(r.fromId)) parent.set(r.id, r.fromId); // 다른 무리의 부모(P89)
    nodes.push({ id: r.id, ws: keyOf(g.key), tier: r.tier, row: r, order: null, createdAt: null, via: parent.has(r.id) ? { id: `${parent.get(r.id)}>${r.id}`, from: parent.get(r.id), to: r.id, kinds: ['spawn'], primary: 'spawn', rel: r.rel || 'spawn', active: !!r.active } : null });
  }
  for (const n of nodes) if (!n.via) delete n.via;
  for (const n of nodes) for (const l of n.row.links || []) if (rowOf.has(l.toId)) links.push({ id: `l:${n.id}>${l.toId}`, from: n.id, to: l.toId, kinds: [l.kind || 'role'], primary: l.kind || 'role', rel: l.rel || 'role', active: !!l.active });
  const keys = groupsIn.map((g) => keyOf(g.key));
  const lay = boardLayout({ keys, vg, nodes, parent, links, collapsed, counts }, { S: PG, N: lanes, C: laneW });
  const out = { nodes: [], edges: [], groups: [], frames: lay.frames, dots: [], lanes, laneW };
  for (const b of lay.boxes.values()) {
    if (b.kind === 'dots') out.dots.push({ id: b.id, parent: b.parent, x: b.x, y: b.y, w: b.w, h: b.h, n: b.node.ids.length });
    else if (b.kind === 'card' || b.kind === 'pill' || b.kind === 'dot') out.nodes.push({ id: b.id, row: b.node.row, group: b.ws === '-' ? null : b.ws, x: b.x, y: b.y, w: b.w, h: b.h, kind: b.kind, cross: false });
  }
  for (const e of lay.edges) {
    if (e.quiet) continue; // 휴대폰은 가리키기가 없어 되돌아가거나 멀리 가는 나무 밖 선은 긋지 않는다
    const to = lay.boxes.get(e.to);
    out.edges.push({ id: `${e.tree ? 't' : 'l'}:${e.from}>${e.to}`, from: e.from, to: e.to, kind: e.tree ? 'tree' : 'link', rel: e.rel || 'spawn', d: e.d, cross: !!e.cross, tier: to && to.node && to.node.row ? to.node.row.tier : 'rest', active: !!e.active || !!(to && to.node && to.node.row && to.node.row.tier === 'work') });
  }
  for (const g of lay.groups) out.groups.push({ key: g.key === '-' ? null : g.key, x: g.x, y: g.y, w: g.w, h: g.h, folded: g.collapsed, count: g.count, work: g.work, turn: g.needs, vg: g.vg, wide: g.span > 1 });
  out.width = n2(Math.max(width, lay.width));
  out.height = n2(Math.max(lay.height, 2));
  return out;
}

// ---- 보기(이동·배율). v: { x, y, zoom }(화면 px = 월드 × zoom + x), size: 그래프 { width, height }, vp: 화면 { w, h } ----
// 처음과 "맞추기": 폭에 맞추고(그래프 폭은 화면에 맞춰 놓았으므로 보통 배율 1) 위에 붙인다. 아래는 옮겨 본다
export function fitView(size, vp) {
  const { PAD, FIT_MAX } = VIEW;
  const w = Math.max(1, size.width);
  const zoom = Math.max(0.01, Math.min((vp.w - 2 * PAD) / w, FIT_MAX)); // 아주 넓으면 ZMIN 아래로도(범위는 zoomRange가 넓힌다)
  const x = (vp.w - w * zoom) / 2;
  return { x: n2(x), y: PAD, zoom: Math.round(zoom * 1000) / 1000 };
}
// 배율 범위: [min(ZMIN, 맞춘 배율), ZMAX]
export const zoomRange = (size, vp) => ({ minZoom: Math.min(VIEW.ZMIN, fitView(size, vp).zoom), maxZoom: VIEW.ZMAX });
// 그래프가 화면 밖으로 사라지지 않게: 그래프의 MARGIN px 이상이 늘 화면 안에 남는다(그래프가 그보다 작으면 그래프 전체)
export function clampView(v, size, vp) {
  const { minZoom, maxZoom } = zoomRange(size, vp);
  const zoom = Math.min(maxZoom, Math.max(minZoom, Number.isFinite(v.zoom) ? v.zoom : 1));
  const keep = (len, screen) => Math.min(VIEW.MARGIN, len, screen);
  const cw = size.width * zoom, ch = size.height * zoom;
  const kx = keep(cw, vp.w), ky = keep(ch, vp.h);
  const x = Math.min(vp.w - kx, Math.max(kx - cw, Number.isFinite(v.x) ? v.x : 0));
  const y = Math.min(vp.h - ky, Math.max(ky - ch, Number.isFinite(v.y) ? v.y : 0));
  return { x, y, zoom };
}
// 고른 카드들(요약 칩의 등급)이 한 화면에 들게. 카드가 없으면 null
export function focusView(nodes, vp) {
  if (!nodes || !nodes.length) return null;
  const P = 24;
  const x0 = Math.min(...nodes.map((n) => n.x)) - P, y0 = Math.min(...nodes.map((n) => n.y)) - P;
  const x1 = Math.max(...nodes.map((n) => n.x + n.w)) + P, y1 = Math.max(...nodes.map((n) => n.y + n.h)) + P;
  const zoom = Math.max(VIEW.ZMIN, Math.min(VIEW.FOCUS_MAX, (vp.w - 2 * VIEW.PAD) / (x1 - x0), (vp.h - 2 * VIEW.PAD) / (y1 - y0)));
  return { x: n2(vp.w / 2 - ((x0 + x1) / 2) * zoom), y: n2(vp.h / 2 - ((y0 + y1) / 2) * zoom), zoom: Math.round(zoom * 1000) / 1000 };
}
// 요약 칩의 등급에 드는 카드인가(응답 필요 칩은 오류도 센다, phone-mission.js tally와 같다)
export const inFocus = (focus, tier) => !focus || (focus === 'work' ? tier === 'work' : tier === 'turn' || tier === 'alert');
// 화면 크기 키(돌아오면 같은 키일 때만 마지막 보기를 다시 쓴다)
export const vpKey = (vp) => `${Math.round(vp.w)}x${Math.round(vp.h)}`;
// 카드의 브랜치 표시: 워크트리에서 도는 세션이면 그 브랜치(없으면 워크트리 이름). live: 판의 세션 요약(이미 받은 것)
export const branchOf = (live) => (live && live.git && live.git.isWorktree && live.git.branch) || (live && live.branch && live.branch.worktree) || null;
