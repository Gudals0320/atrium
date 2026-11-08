// P89 → P95: 휴대폰 미션 맵(PhoneMission.jsx)의 배치. PC(lib/mission-layout.js)와 같은 시각 언어를 화면 폭에 맞춘다. 순수 함수만 둔다(단위 시험 app/test/p95-lib.test.mjs, p89-lib.test.mjs).
// - 입력은 lib/phone-mission.js의 결과(무리, 깊이 우선 줄, 강조 등급, 역할). 자료는 그대로 mission.graph만이다.
// - 화면 폭을 칸(lane)으로 나눈다: 세로 휴대폰 2칸, 가로 4칸쯤(lanesFor). 칸 폭은 화면에 맞춰 배율 1에서 읽힌다.
// - 팀이 있는 워크스페이스는 두 칸 덩어리: 왼쪽 칸에 리드, 오른쪽 칸에 그 하위 세션(손자는 조금 들여)을 놓고 리드 오른쪽 한 점에서 가는 곡선이 나간다(PC와 같은 왼쪽 → 오른쪽).
//   다른 워크스페이스의 하위 세션도 부모 팀 안에 놓는다. 하위가 많고 쉬는 것이 많으면 쉬는 하위는 동그라미 줄로 접는다.
// - 팀이 없는 워크스페이스(혼자인 세션뿐)는 한 칸 덩어리로, 가장 낮은 칸부터 채운다. 그래서 워크스페이스가 많고 세션이 한두 개씩인 판도 세로 한 줄로 늘어서지 않는다.
// - 세션은 카드(일함·응답 필요·오류·결과, 하위가 있는 세션) 또는 한 줄(쉼·잠듦·끝남). 상자·띠·범례는 없다. 워크스페이스는 옅은 머리 글(누르면 접기).
// - 보기(이동·배율): fitView(처음과 "맞추기": 폭에 맞추고 위에 붙인다), clampView, focusView(요약 칩의 등급으로 맞추기).
export const PG = { PAD: 2, GAP: 10, LANE_MIN: 168, CARD_H: 58, ROW_H: 30, VGAP: 6, HEAD: 22, BLOCK_GAP: 14, INDENT: 12, DOT: 16, DOT_GAP: 6, DOTS_MIN: 6, DOTS_FOLD: 3, R: 6, TEAM_IN: 16, LINK_SPAN: 200 }; // TEAM_IN: 팀 덩어리의 하위 칸을 들여 리드 → 하위 곡선이 펼쳐질 자리
export const VIEW = { PAD: 10, ZMIN: 0.25, ZMAX: 2.5, FIT_MAX: 1.25, MARGIN: 72, FOCUS_MAX: 1.2 };

// 그래프 폭(px) → 칸 수: 세로 휴대폰 2, 가로 4, 넓으면 6까지
export const lanesFor = (width) => { const n = Math.floor(((width || 0) - 2 * PG.PAD + PG.GAP) / (PG.LANE_MIN + PG.GAP)); return Math.max(2, Math.min(6, n > 2 && n % 2 ? n - 1 : n)); }; // 짝수(넓은 덩어리가 두 칸씩)
const n2 = (v) => Math.round(v * 10) / 10;
const REST = ['rest', 'sleep', 'done'];

// 깊이 우선 줄(depth) → 무리 안 나무 자식. 줄 순서가 곧 자리 순서다(띄운 순서, 상태가 바뀌어도 자리 그대로)
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

// pm: phoneMission 결과, width: 그래프 폭(화면 폭에서 보기 여백을 뺀 것)
// → { nodes: [{ id, row, group, x, y, w, h, kind: 'card'|'row'|'dot', cross }], edges: [{ id, from, to, kind: 'tree'|'link', rel, d, tier, active }],
//     groups: [{ key, x, y, w, folded, count, work, turn, vg, wide }], dots: [{ id, x, y, n }], lanes, laneW, width, height }
export function phoneGraph(pm, { width = 373 } = {}) {
  const { PAD, GAP, CARD_H, ROW_H, VGAP, HEAD, BLOCK_GAP, INDENT, DOT, DOT_GAP, DOTS_MIN, DOTS_FOLD } = PG;
  const lanes = lanesFor(width);
  const laneW = Math.floor((width - 2 * PAD - (lanes - 1) * GAP) / lanes);
  const laneX = (i) => PAD + i * (laneW + GAP);
  const groupsIn = (pm && pm.groups) || [];
  // 모든 줄과 무리 안 나무. 다른 무리 부모(fromId)가 보이면 그 팀 아래로 옮긴다
  const rowOf = new Map(), kids = new Map(), rootsOf = new Map(), groupOfRow = new Map();
  for (const g of groupsIn) for (const r of g.rows || []) { rowOf.set(r.id, r); groupOfRow.set(r.id, g.key); }
  for (const g of groupsIn) {
    const t = treeOf(g.rows || []);
    for (const [k, v] of t.kids) kids.set(k, [...v]);
    rootsOf.set(g.key, t.roots);
  }
  for (const g of groupsIn) {
    const keep = [];
    for (const r of rootsOf.get(g.key) || []) {
      if (r.fromId && rowOf.has(r.fromId)) { if (!kids.has(r.fromId)) kids.set(r.fromId, []); kids.get(r.fromId).push(r); } else keep.push(r);
    }
    rootsOf.set(g.key, keep);
  }
  const kidsOf = (id) => kids.get(id) || [];
  const isRest = (r) => REST.includes(r.tier) && !kidsOf(r.id).length;
  const kindFor = (r) => (isRest(r) ? 'row' : 'card');
  const hOf = (k) => (k === 'card' ? CARD_H : ROW_H);
  const nodes = [], edges = [], groups = [], dots = [], at = new Map();
  const put = (row, group, x, y, w, kind) => { const nd = { id: row.id, row, group, x: n2(x), y: n2(y), w: n2(w), h: kind === 'dot' ? DOT : hOf(kind), kind, cross: groupOfRow.get(row.id) !== group }; nodes.push(nd); at.set(row.id, nd); return nd; }; // cross: 다른 무리의 하위 세션을 부모 팀 안에 놓았다
  const sky = Array(lanes).fill(PAD);
  const curve = (a, b) => { const x1 = a.x + a.w, y1 = a.y + a.h / 2, x2 = b.x, y2 = b.y + b.h / 2, dx = Math.max(10, (x2 - x1) * 0.5); return `M${n2(x1)} ${n2(y1)}C${n2(x1 + dx)} ${n2(y1)} ${n2(x2 - dx)} ${n2(y2)} ${n2(x2)} ${n2(y2)}`; };
  const elbow = (a, b) => { const x = a.x + 8, y1 = a.y + a.h, y2 = b.y + b.h / 2, R = PG.R; return `M${n2(x)} ${n2(y1)}V${n2(y2 - R)}Q${n2(x)} ${n2(y2)} ${n2(x + R)} ${n2(y2)}H${n2(b.x)}`; };
  const edge = (a, b, d) => edges.push({ id: `t:${a.id}>${b.id}`, from: a.id, to: b.id, kind: 'tree', rel: b.row.rel || 'spawn', d, tier: b.row.tier, active: !!b.row.active || b.row.tier === 'work' });

  for (const g of groupsIn) {
    const roots = rootsOf.get(g.key) || [];
    if (!g.folded && !roots.length) continue; // 세션이 모두 다른 팀 안에 놓였다
    const team = !g.folded && roots.some((r) => kidsOf(r.id).length);
    const span = team ? Math.min(2, lanes) : 1;
    // 자리: 가장 낮은 칸(넓은 덩어리는 짝수 칸에서 시작하는 두 칸)
    let c = 0, best = Infinity;
    for (let i = 0; i + span <= lanes; i += span === 2 ? 2 : 1) { const top = Math.max(...sky.slice(i, i + span)); if (top < best - 0.5) { best = top; c = i; } }
    let y = best;
    const x = laneX(c);
    groups.push({ key: g.key, x: n2(x), y: n2(y), w: n2(span * laneW + (span - 1) * GAP), folded: !!g.folded, count: g.count, work: g.work, turn: g.turn, vg: g.vg || null, wide: team });
    y += HEAD;
    if (g.folded || !roots.length) { for (let i = c; i < c + span; i++) sky[i] = y + BLOCK_GAP - 6; continue; }
    if (team) {
      const x2 = laneX(c + 1) + PG.TEAM_IN, kw = laneW - PG.TEAM_IN; // 하위 칸
      for (const r of roots) {
        const ch = kidsOf(r.id);
        if (!ch.length) { const nd = put(r, g.key, x, y, laneW, kindFor(r)); y += nd.h + VGAP; continue; }
        // 하위 세션들(오른쪽 칸): 깊이 우선, 손자는 들여. 쉬는 하위가 많으면 동그라미 줄
        const start = y;
        let cy = y;
        const placeKids = (p, depth) => {
          const list = kidsOf(p.id);
          const rest = list.filter(isRest);
          const fold = list.length >= DOTS_MIN && rest.length >= DOTS_FOLD ? rest : [];
          for (const k of list.filter((z) => !fold.includes(z))) {
            const ind = Math.min(depth, 3) * INDENT;
            const nd = put(k, g.key, x2 + ind, cy, kw - ind, kindFor(k));
            cy += nd.h + VGAP;
            placeKids(k, depth + 1);
          }
          if (fold.length) {
            const ind = Math.min(depth, 3) * INDENT, per = Math.max(1, Math.floor((kw - ind - 8) / (DOT + DOT_GAP)) - 2);
            const id = `dots:${p.id}`, rows = Math.ceil(fold.length / per);
            dots.push({ id, parent: p.id, x: n2(x2 + ind), y: n2(cy), w: n2(kw - ind), h: rows * (DOT + DOT_GAP) - DOT_GAP + 4, n: fold.length, per });
            fold.forEach((k, i) => put(k, g.key, x2 + ind + 2 + (i % per) * (DOT + DOT_GAP), cy + 2 + Math.floor(i / per) * (DOT + DOT_GAP), DOT, 'dot'));
            cy += rows * (DOT + DOT_GAP) - DOT_GAP + 4 + VGAP;
          }
        };
        placeKids(r, 0);
        const lh = hOf(kindFor(r));
        const ly = Math.max(start, (start + cy - VGAP) / 2 - lh / 2);
        const lead = put(r, g.key, x, ly, laneW, kindFor(r));
        // 선: 리드 → 하위(곡선), 하위 → 손자(같은 칸, 둥근 꺾임), 동그라미 줄은 한 선
        const link = (p) => {
          const pn = at.get(p.id);
          for (const k of kidsOf(p.id)) {
            const kn = at.get(k.id);
            if (!kn) continue;
            if (kn.kind === 'dot') continue;
            edge(pn, kn, pn.x + pn.w <= kn.x ? curve(pn, kn) : elbow(pn, kn));
            link(k);
          }
          const dg = dots.find((d) => d.parent === p.id);
          if (dg) { const box = { id: dg.id, x: dg.x, y: dg.y, w: dg.w, h: dg.h, row: { tier: 'rest', rel: 'spawn' } }; edges.push({ id: `t:${p.id}>${dg.id}`, from: p.id, to: dg.id, kind: 'tree', rel: 'spawn', d: pn.x + pn.w <= box.x ? curve(pn, box) : elbow(pn, box), tier: 'rest', active: false }); }
        };
        link(r);
        y = Math.max(cy, lead.y + lead.h + VGAP);
      }
    } else {
      for (const r of roots) { const nd = put(r, g.key, x, y, laneW, kindFor(r)); y += nd.h + VGAP; }
    }
    for (let i = c; i < c + span; i++) sky[i] = y - VGAP + BLOCK_GAP;
  }
  // 나무 밖 연결(두 번째 지시자, 역할 선): 옅은 점선. 받는 쪽 오른쪽으로 돈다
  for (const nd of nodes) for (const l of nd.row.links || []) {
    const b = at.get(l.toId);
    if (!b || edges.some((e) => e.from === nd.id && e.to === l.toId)) continue;
    const x1 = nd.x + nd.w, y1 = nd.y + nd.h / 2, x2 = b.x + b.w, y2 = b.y + b.h / 2, bx = Math.min(width - 1, Math.max(x1, x2) + 8);
    if (Math.abs(y2 - y1) > PG.LINK_SPAN) continue; // 멀리 가는 나무 밖 선은 지도를 세로로 가르므로 긋지 않는다(휴대폰은 가리키기가 없다. PC는 가리킬 때만)
    edges.push({ id: `l:${nd.id}>${l.toId}`, from: nd.id, to: l.toId, kind: 'link', rel: l.rel || 'role', d: `M${n2(x1)} ${n2(y1)}C${n2(bx)} ${n2(y1)} ${n2(bx)} ${n2(y2)} ${n2(x2)} ${n2(y2)}`, tier: b.row.tier, active: !!l.active });
  }
  for (const g of groups) if (!g.folded) { const ns = nodes.filter((n) => n.group === g.key); g.count = ns.length; g.work = ns.filter((n) => n.row.tier === 'work').length; g.turn = ns.filter((n) => n.row.tier === 'turn' || n.row.tier === 'alert').length; } // 머리 글의 수는 그 아래 놓인 세션(PC와 같다)
  const height = n2(Math.max(PAD, ...sky) - BLOCK_GAP + PAD);
  return { nodes, edges, groups, dots, lanes, laneW, width: n2(width), height: Math.max(height, PAD * 2) };
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
