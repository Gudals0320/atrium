// P89: 휴대폰 작업 관계도(PhoneMission.jsx)를 노드와 선으로 된 그래프로 놓는다. 순수 함수만 둔다(단위 시험 app/test/p89-lib.test.mjs).
// - 입력은 lib/phone-mission.js의 결과(무리, 깊이 우선 줄, 강조 등급, 나무 밖 연결). 자료는 그대로 mission.graph만이다.
// - 무리(워크스페이스)마다 머리띠가 있는 배경 상자. 상자는 위에서 아래로 쌓고 폭은 가장 넓은 무리에 맞춘다.
// - 나무는 위 → 아래. 부모 아래 하위 세션을 놓는 방법은 셋이다(화면 폭 안에 들게):
//   row: 하위 세션 블록들이 폭(maxW) 안에 들면 나란히, 부모는 그 가운데 위. 선은 부모 아래에서 하위 위로 내려가는 부드러운 곡선
//   bus: 들지 않고 하위가 모두 잎이면 두 줄 격자, 부모 아래 가운데 등뼈에서 좌우 카드로 둥근 꺾임 선
//   col: 그 밖(하위에 또 하위가 있음)이면 하위 블록을 한 칸 들여 세로로 쌓고, 왼쪽 등뼈에서 각 카드 왼쪽으로 둥근 꺾임 선
// - 무리 안의 뿌리 블록들은 폭 안에서 줄을 바꿔 흘린다. 나무 밖 연결(역할 선·알아챈 지시)과 다른 무리 부모는 점선(오른쪽 통로로 돌거나 같은 높이면 위로 휜다).
// - 카드는 모두 같은 크기라 겹치지 않는다. 화면 크기(세로·가로)에 따라 열 수(cols)만 바뀐다.
// - 보기(이동·배율): fitView(처음과 "맞추기"), clampView(그래프가 화면 밖으로 사라지지 않게), focusView(요약 칩을 누른 등급으로 맞추기).
export const PG = { W: 150, H: 74, GUTTER: 14, GX: 12, GY: 36, INDENT: 26, VGAP: 10, BUSGAP: 24, BUS_TOP: 16, COL_TOP: 14, ROOT_GAP: 18, GROUP_HEAD: 34, GROUP_PAD: 10, GROUP_GAP: 14, PAD: 10, R: 9 }; // 세로 휴대폰(393px)에 카드 둘이 배율 1로 든다
export const VIEW = { PAD: 12, ZMIN: 0.25, ZMAX: 2.5, FIT_MAX: 1.25, READ_MIN: 0.6, MARGIN: 72, FOCUS_MAX: 1.2 };

// 화면 폭(px) → 한 줄에 놓을 카드 수. 세로 휴대폰은 2, 가로는 4쯤
export const colsFor = (width) => Math.max(2, Math.min(6, Math.floor(((width || 0) - 2 * VIEW.PAD - 2 * (PG.PAD + PG.GROUP_PAD) + PG.GX) / (PG.W + PG.GX))));
export const maxWOf = (cols) => cols * PG.W + (cols - 1) * PG.GX;

const n2 = (v) => Math.round(v * 10) / 10;
const sum = (a) => a.reduce((x, y) => x + y, 0);

// 깊이 우선 줄(depth) → 나무 자식. 줄 순서가 곧 자리 순서다(띄운 순서, 상태가 바뀌어도 자리 그대로)
function treeOf(rows) {
  const kids = new Map(), roots = [], stack = [];
  for (const r of rows) {
    while (stack.length && stack[stack.length - 1].depth >= r.depth) stack.pop();
    const p = stack.length ? stack[stack.length - 1] : null;
    if (p && r.depth > 0) { if (!kids.has(p.id)) kids.set(p.id, []); kids.get(p.id).push(r); } else roots.push(r);
    stack.push(r);
  }
  return { kids, roots };
}

// 한 세션과 그 아래를 놓은 블록(왼쪽 위가 0,0): { w, h, rootX, items: [{ row, x, y }], edges: [{ from, to, d, mode }] }
function block(r, kids, maxW) {
  const { W, H, GX, GY, INDENT, VGAP, BUSGAP, BUS_TOP, COL_TOP, R } = PG;
  const ch = kids.get(r.id) || [];
  if (!ch.length) return { w: W, h: H, rootX: 0, items: [{ row: r, x: 0, y: 0 }], edges: [] };
  const bs = ch.map((c) => block(c, kids, maxW));
  const items = [], edges = [];
  const put = (b, ox, oy) => { for (const it of b.items) items.push({ row: it.row, x: it.x + ox, y: it.y + oy }); for (const e of b.edges) edges.push({ ...e, d: shift(e.d, ox, oy) }); };
  const total = sum(bs.map((b) => b.w)) + GX * (bs.length - 1);
  if (total <= maxW || bs.length === 1) { // row
    const w = Math.max(W, total);
    let x = (w - total) / 2;
    const cy = H + GY, centers = [];
    bs.forEach((b) => { put(b, x, cy); centers.push(x + b.rootX + W / 2); x += b.w + GX; });
    const rootX = Math.max(0, Math.min(w - W, (centers[0] + centers[centers.length - 1]) / 2 - W / 2));
    const sx = rootX + W / 2, k = GY * 0.55;
    bs.forEach((b, i) => edges.push({ from: r.id, to: ch[i].id, mode: 'row', d: `M${n2(sx)} ${H}C${n2(sx)} ${n2(H + k)} ${n2(centers[i])} ${n2(cy - k)} ${n2(centers[i])} ${cy}` }));
    items.unshift({ row: r, x: rootX, y: 0 });
    return { w, h: H + GY + Math.max(...bs.map((b) => b.h)), rootX, items, edges };
  }
  if (bs.every((b) => b.items.length === 1)) { // bus: 잎 여럿을 두 줄로
    const w = 2 * W + BUSGAP, rootX = (w - W) / 2, sx = w / 2;
    bs.forEach((b, i) => {
      const right = i % 2 === 1, x = right ? W + BUSGAP : 0, y = H + BUS_TOP + Math.floor(i / 2) * (H + VGAP), my = y + H / 2;
      put(b, x, y);
      const ex = right ? x : x + W, s = right ? 1 : -1;
      edges.push({ from: r.id, to: ch[i].id, mode: 'bus', d: `M${n2(sx)} ${H}V${n2(my - R)}Q${n2(sx)} ${n2(my)} ${n2(sx + s * R)} ${n2(my)}H${n2(ex)}` });
    });
    items.unshift({ row: r, x: rootX, y: 0 });
    return { w, h: H + BUS_TOP + Math.ceil(bs.length / 2) * (H + VGAP) - VGAP, rootX, items, edges };
  }
  // col: 들여 세로로
  const sx = INDENT / 2;
  let y = H + COL_TOP;
  bs.forEach((b, i) => {
    put(b, INDENT, y);
    const my = y + H / 2;
    edges.push({ from: r.id, to: ch[i].id, mode: 'col', d: `M${n2(sx)} ${H}V${n2(my - R)}Q${n2(sx)} ${n2(my)} ${n2(sx + R)} ${n2(my)}H${n2(INDENT + b.rootX)}` });
    y += b.h + VGAP;
  });
  items.unshift({ row: r, x: 0, y: 0 });
  return { w: Math.max(W, INDENT + Math.max(...bs.map((b) => b.w))), h: y - VGAP, rootX: 0, items, edges };
}
// 경로의 숫자 쌍을 옮긴다(M, C, Q, V, H만 쓴다: V는 y, H는 x 하나)
function shift(d, ox, oy) {
  if (!ox && !oy) return d;
  return d.replace(/([MCQVH])([^MCQVH]*)/g, (_, c, args) => {
    const v = args.trim().split(/[\s,]+/).filter(Boolean).map(Number);
    const out = c === 'V' ? v.map((y) => n2(y + oy)) : c === 'H' ? v.map((x) => n2(x + ox)) : v.map((n, i) => n2(i % 2 ? n + oy : n + ox));
    return c + out.join(' ');
  });
}

// 나무 밖 선(점선): 카드 a → 카드 b. 같은 높이면 위로 휘고, 아니면 무리 상자 오른쪽 통로(gx)로 돌아 카드 사이를 가로지르지 않는다.
// 이름표는 통로에 세로로, 받는 쪽 끝 가까이 단다(rot). → { d, ex, ey, lx, ly, rot }
function linkPath(a, b, gx) {
  const { W, H, R } = PG;
  if (Math.abs(a.y - b.y) < H) {
    const x1 = a.x + W / 2, x2 = b.x + W / 2, y = Math.min(a.y, b.y), bow = 22 + Math.min(30, Math.abs(x2 - x1) * 0.1);
    const c = y - bow;
    return { d: `M${n2(x1)} ${n2(a.y)}C${n2(x1)} ${n2(c)} ${n2(x2)} ${n2(c)} ${n2(x2)} ${n2(b.y)}`, ex: n2(x2), ey: n2(b.y), lx: n2((x1 + x2) / 2), ly: n2(c + bow * 0.25), rot: false };
  }
  const x1 = a.x + W, y1 = a.y + H / 2, x2 = b.x + W, y2 = b.y + H / 2, s = y2 > y1 ? 1 : -1;
  return { d: `M${n2(x1)} ${n2(y1)}H${n2(gx - R)}Q${n2(gx)} ${n2(y1)} ${n2(gx)} ${n2(y1 + s * R)}V${n2(y2 - s * R)}Q${n2(gx)} ${n2(y2)} ${n2(gx - R)} ${n2(y2)}H${n2(x2)}`, ex: n2(x2), ey: n2(y2), lx: n2(gx), ly: n2(Math.abs(y2 - y1) > 4 * R + 60 ? y2 - s * (R + 34) : (y1 + y2) / 2), rot: true }; // 이름표는 받는 쪽 끝 가까이(같은 통로의 이름표끼리 덜 겹친다)
}

// pm: phoneMission 결과, cols: 한 줄 카드 수
// → { nodes: [{ id, row, group, x, y }], edges: [{ id, from, to, kind: 'tree'|'link'|'cross', mode, d, tier, active, role, ex, ey, lx, ly }], groups: [{ key, x, y, w, h, folded, count, work, turn }], width, height }
export function phoneGraph(pm, { cols = 2 } = {}) {
  const { W, GX, PAD, GROUP_HEAD, GROUP_PAD, GROUP_GAP, ROOT_GAP, GUTTER } = PG;
  const maxW = maxWOf(Math.max(1, cols));
  // 무리마다 뿌리 블록을 폭 안에서 줄을 바꿔 흘린다
  const laid = ((pm && pm.groups) || []).map((g) => {
    const { kids, roots } = treeOf(g.rows || []);
    const blocks = roots.map((r) => block(r, kids, maxW));
    const lines = [];
    for (const b of blocks) {
      const ln = lines[lines.length - 1];
      if (ln && ln.w + GX + b.w <= maxW) { ln.blocks.push(b); ln.w += GX + b.w; ln.h = Math.max(ln.h, b.h); } else lines.push({ blocks: [b], w: b.w, h: b.h });
    }
    return { g, lines, w: Math.max(0, ...lines.map((l) => l.w)), h: lines.length ? sum(lines.map((l) => l.h)) + ROOT_GAP * (lines.length - 1) : 0 };
  });
  const inner = Math.max(W, ...laid.map((l) => l.w));
  const nodes = [], edges = [], groups = [], at = new Map();
  let y = PAD;
  for (const { g, lines, h } of laid) {
    const gh = GROUP_HEAD + (g.folded || !lines.length ? 0 : h + GROUP_PAD);
    groups.push({ key: g.key, x: PAD, y, w: inner + 2 * GROUP_PAD, h: gh, folded: !!g.folded, count: g.count, work: g.work, turn: g.turn });
    if (!g.folded) {
      let ly = y + GROUP_HEAD;
      for (const ln of lines) {
        let lx = PAD + GROUP_PAD + (inner - ln.w) / 2;
        for (const b of ln.blocks) {
          for (const it of b.items) { const nd = { id: it.row.id, row: it.row, group: g.key, x: n2(lx + it.x), y: n2(ly + it.y) }; nodes.push(nd); at.set(nd.id, nd); }
          for (const e of b.edges) edges.push({ id: `t:${e.from}>${e.to}`, from: e.from, to: e.to, kind: 'tree', mode: e.mode, d: shift(e.d, lx, ly) });
          lx += b.w + GX;
        }
        ly += ln.h + ROOT_GAP;
      }
    }
    y += gh + GROUP_GAP;
  }
  // 나무 선의 강조: 받는 쪽 등급, 역할 선이 일하는 중이면 active
  for (const e of edges) { const r = at.get(e.to).row; e.tier = r.tier; e.active = !!r.active; e.role = r.role || null; }
  // 나무 밖: 다른 무리 부모(cross)와 두 번째 지시자 등(link). 접은 무리의 카드로 가는 선은 긋지 않는다
  // 통로는 무리 상자 오른쪽 바깥. 선이 여럿이면 세 갈래로 나눠 겹치지 않게
  const right = PAD + inner + 2 * GROUP_PAD;
  let lane = 0;
  const gx = () => right + 4 + (lane++ % 3) * 4;
  for (const nd of nodes) {
    const r = nd.row;
    if (r.fromId && at.has(r.fromId)) edges.push({ id: `c:${r.fromId}>${r.id}`, from: r.fromId, to: r.id, kind: 'cross', tier: r.tier, active: !!r.active, role: r.role || null, ...linkPath(at.get(r.fromId), nd, gx()) });
    for (const l of r.links || []) if (l.toId && at.has(l.toId)) edges.push({ id: `l:${r.id}>${l.toId}`, from: r.id, to: l.toId, kind: 'link', tier: at.get(l.toId).row.tier, active: !!l.active, role: l.role || null, ...linkPath(nd, at.get(l.toId), gx()) });
  }
  const width = n2(2 * PAD + inner + 2 * GROUP_PAD + GUTTER);
  const height = n2(groups.length ? y - GROUP_GAP + PAD : 2 * PAD);
  return { nodes, edges, groups, width, height };
}

// ---- 보기(이동·배율). v: { x, y, zoom }(화면 px = 월드 × zoom + x), size: 그래프 { width, height }, vp: 화면 { w, h } ----
// 처음과 "맞추기": 폭과 높이에 맞춘다. 높이에 맞추면 글이 너무 작아질 때는 READ_MIN까지만 줄이고(폭이 허락하면) 위에 붙여 아래로 옮겨 본다
export function fitView(size, vp) {
  const { PAD, FIT_MAX, READ_MIN } = VIEW;
  const w = Math.max(1, size.width), h = Math.max(1, size.height);
  const zw = (vp.w - 2 * PAD) / w, zh = (vp.h - 2 * PAD) / h;
  let zoom = Math.min(zw, zh, FIT_MAX);
  if (zoom < READ_MIN) zoom = Math.min(zw, READ_MIN, FIT_MAX);
  zoom = Math.max(zoom, Math.min(VIEW.ZMIN, zw));
  const x = (vp.w - w * zoom) / 2;
  const y = h * zoom <= vp.h - 2 * PAD ? Math.max(PAD, (vp.h - h * zoom) / 2) : PAD;
  return { x: n2(x), y: n2(y), zoom: Math.round(zoom * 1000) / 1000 };
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
  const { W, H } = PG, P = 24;
  const x0 = Math.min(...nodes.map((n) => n.x)) - P, y0 = Math.min(...nodes.map((n) => n.y)) - P;
  const x1 = Math.max(...nodes.map((n) => n.x + W)) + P, y1 = Math.max(...nodes.map((n) => n.y + H)) + P;
  const zoom = Math.max(VIEW.ZMIN, Math.min(VIEW.FOCUS_MAX, (vp.w - 2 * VIEW.PAD) / (x1 - x0), (vp.h - 2 * VIEW.PAD) / (y1 - y0)));
  return { x: n2(vp.w / 2 - ((x0 + x1) / 2) * zoom), y: n2(vp.h / 2 - ((y0 + y1) / 2) * zoom), zoom: Math.round(zoom * 1000) / 1000 };
}
// 요약 칩의 등급에 드는 카드인가(응답 필요 칩은 오류도 센다, phone-mission.js tally와 같다)
export const inFocus = (focus, tier) => !focus || (focus === 'work' ? tier === 'work' : tier === 'turn' || tier === 'alert');
// 화면 크기 키(돌아오면 같은 키일 때만 마지막 보기를 다시 쓴다)
export const vpKey = (vp) => `${Math.round(vp.w)}x${Math.round(vp.h)}`;
// 카드의 브랜치 표시: 워크트리에서 도는 세션이면 그 브랜치(없으면 워크트리 이름). live: 판의 세션 요약(이미 받은 것)
export const branchOf = (live) => (live && live.git && live.git.isWorktree && live.git.branch) || (live && live.branch && live.branch.worktree) || null;
