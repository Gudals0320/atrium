// P251: rig를 눈으로 보기(docs research rig3-map.md 3·4절). P253: 세션 맵 지도는 8절(쌍마다 선 하나, 한 줄 차례, 카드가 다 담음, 트리 위 고정된 rig 띠)로 다시 그렸다.
// P254: 사용자의 시안 V7("새 rig · 캔버스의 길 선")을 그대로 옮겼다. 캔버스와 세션 맵 모두 쌍마다 방향별 두 줄, 줄마다 글, "대기 n", 붉은 점, 밝기, 빌더로 올림 점선.
//   세션 맵의 rig는 맨 위 띠가 아니라 그 워크스페이스 줄 안의 묶음이다(v7Layout, mission-lineage.js lineageLayout rigBlocks).
// 세션 맵의 구조 지도와 캔버스의 길 선의 순수 함수(단위 시험 test/p251-lib.test.mjs, test/p253-lib.test.mjs).
// 자료는 판 API rig.map(backend rig-map.mjs), 역할 차례는 공유 배치(backend rig-map-layout.mjs roleOrder·rolePairs).
// 6절 "설계 쪽이 고른 넷"은 RIG_VIEW 한 곳에서 뒤집는다(값 하나씩).
import { roleOrder, rolePairs, rowOrder, faceEnds, segHitsRect, gridPlace } from '../../../../backend/src/rig-map-layout.mjs';
import { HUMAN, BUILDER_ROLE } from '../../../../backend/src/rig-def-names.mjs';

export { roleOrder, rolePairs, rowOrder, faceEnds, segHitsRect, gridPlace, HUMAN, BUILDER_ROLE };

// ---- 뒤집기 자리(설정 값 하나씩). 기본값이 설계 쪽이 고른 것이다 ----
// hideInTree:   역할 세션과 빌더를 세션 맵 트리에서 빼고 지도에만 | false = 트리에도 둔다(P253: 지도는 트리와 따로라 둘을 잇는 선은 없다)
// canvasExtras: 캔버스에는 길 선과 꼬리표만 | true = 꼬리표에 섹터와 박자도 붙인다
// canvasFrame:  캔버스에서 역할 묶음에 테두리를 두르지 않는다 | true = 옅은 테두리로 rig를 묶는다
// (P251의 sectorsUnder는 P253에서 없앴다: 섹터·도구는 늘 역할 카드 안 줄이다. 설계 8.2-5)
export const RIG_VIEW = { hideInTree: true, canvasExtras: false, canvasFrame: false };

// ---- P254: 사용자의 시안 V7 "새 rig · 캔버스의 길 선"(experiments/rig-map-ref/project/V7.dc.html)을 그대로 옮긴 치수와 색 ----
// 캔버스와 세션 맵이 같은 값을 쓴다(px, 시안 1240×544 판의 값 그대로).
// CW·CH 역할 카드, BH 빌더 카드 높이, GAP 카드 사이, BGAP 카드 아래 → 빌더 위, DY 두 줄이 가운데에서 떨어진 거리(위 줄 -8, 아래 줄 +8),
// LAB 가운데 → 줄 글 가운데(위 줄 글은 위로, 아래 줄 글은 아래로), WAIT 가운데 → "대기 n" 가운데(아래), LABW·LABH 줄 글 칸, WAITW 대기 칸,
// DOT 붉은 점 지름(줄 시작에서 DOTAT 안쪽), W1·W2 위 줄·아래 줄 굵기, RAISEW 올림 점선 굵기, RAISEDASH 점선, RAISELX 올림 글이 선에서 떨어진 거리, RAISELW 올림 글 칸,
// SCALE 세션 맵 세계에 놓는 배율(트리 카드 글과 맞춘다)
export const V7 = {
  CW: 184, CH: 96, BH: 80, GAP: 104, BGAP: 104, DY: 8, LAB: 28, WAIT: 48, LABW: 88, LABH: 16, WAITW: 56, DOT: 8, DOTAT: 8,
  W1: 2, W2: 1.5, RAISEW: 2, RAISEDASH: [2, 6], RAISELX: 12, RAISELW: 40, SCALE: 1.5,
  C: { dim: '#8E8B83', lit: '#ECE9E1', text: '#A9A69D', red: '#E5484D', raise: '#F0B652', card: '#1A1A18', border: '#3B3A36', borderHot: '#8E8B83', tag: '#22221F', tagText: '#A9A69D', btag: '#3A2E17', work: '#A8D08D' },
};

const list = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const r1 = (v) => Math.round(v * 10) / 10;
export const pathD = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${r1(p[0])} ${r1(p[1])}`).join(' ');

// 두 역할 사이 길(방향마다): a → b 줄과 b → a 줄. 사람이 낸 길은 쌍이 아니다(from에 역할이 있어야 한다)
//   → [{ dir: 'fwd'|'back', item, n(이번 사이클에 낸 수), open(끝나지 않은 반려), waiting, for }]
export function pairRows(a, b, flows) {
  const rows = [];
  const add = (dir, x, y) => {
    for (const f of flows || []) {
      if (!f || !list(f.from).includes(x) || !list(f.to).includes(y)) continue;
      let r = rows.find((q) => q.dir === dir && q.item === f.item);
      if (!r) { r = { dir, item: f.item, n: 0, open: false, waiting: 0, for: f.for || null }; rows.push(r); }
      r.n += (f.cycle && f.cycle.put) || 0;
      r.open = r.open || (f.openReturns || 0) > 0;
      r.waiting += f.waiting || 0;
    }
  };
  add('fwd', a, b); add('back', b, a);
  return rows;
}
// V7 한 쌍의 두 줄: top = 왼쪽(a) → 오른쪽(b) 길, bottom = b → a 길. 그 방향 길이 없으면 그 줄은 null(긋지 않는다).
//   waiting = 두 방향 기다림 합("대기 n")
export function pairLines(a, b, flows) {
  const rows = pairRows(a, b, flows);
  const side = (dir) => { const rs = rows.filter((r) => r.dir === dir); return rs.length ? { items: rs.map((r) => r.item), open: rs.some((r) => r.open), waiting: rs.reduce((s, r) => s + r.waiting, 0) } : null; };
  const top = side('fwd'), bottom = side('back');
  const waiting = (top ? top.waiting : 0) + (bottom ? bottom.waiting : 0);
  return { a, b, top, bottom, waiting };
}
// 밝은 쌍(#ECE9E1): 두 끝 중 하나가 일하는 역할(사용자 답, 2026-11-20). working(역할 이름) → true | false
export const pairLit = (a, b, working) => !!(working && (working(a) || working(b)));
// 줄 글: 위 줄 "스냅숏 →", 아래 줄 "← 데이터 요청"(시안). 한 방향에 종류가 여럿이면 " · "로 잇는다
export const lineText = (side, which) => (!side ? '' : which === 'top' ? `${side.items.join(' · ')} →` : `← ${side.items.join(' · ')}`);

// 13px 글 폭 어림(px): 한글·화살표 13, 빈칸 3.6, 그 밖 7.2
export const textW13 = (s) => { let w = 0; for (const ch of String(s || '')) { const c = ch.codePointAt(0); w += (c >= 0x1100 && c <= 0x11ff) || (c >= 0x2e80 && c <= 0xa4cf) || (c >= 0xac00 && c <= 0xd7af) || (c >= 0x2190 && c <= 0x21ff) ? 13 : ch === ' ' ? 3.6 : 7.2; } return w; };
// 곧은 두 줄의 자리(시안 그대로). P = 왼쪽(a) 끝, Q = 오른쪽(b) 끝, k = 화면 px 하나의 세계 크기(캔버스 1/배율, 세션 맵 1).
//   위 줄 P → Q(끝 화살촉, 굵기 W1), 아래 줄 Q → P(끝 화살촉, 굵기 W2). 화살촉 끝이 카드 변에 닿게 줄을 화살촉 길이만큼 짧게 끝낸다(시안 99/103).
//   → { top: { d, from, to }, bottom: {...}, topLab, botLab, wait: [x, y](가운데), dotTop, dotBot: [x, y], u, n }
export function twoLines(P, Q, k = 1) {
  const dx = Q[0] - P[0], dy = Q[1] - P[1], L = Math.hypot(dx, dy) || 1;
  const ux = dx / L, uy = dy / L, nx = uy, ny = -ux; // n = 위쪽(왼 → 오른 기준)
  const o = V7.DY * k, at = (p, s, t = 0) => [p[0] + nx * s + ux * t, p[1] + ny * s + uy * t];
  const tf = at(P, o), tt = at(Q, o, -2 * V7.W1 * k), bf = at(Q, -o), bt = at(P, -o, 2 * V7.W2 * k);
  const mid = [(P[0] + Q[0]) / 2, (P[1] + Q[1]) / 2];
  return {
    mid, n: [nx, ny],
    top: { from: tf, to: tt, d: pathD([tf, tt]) }, bottom: { from: bf, to: bt, d: pathD([bf, bt]) },
    topLab: at(mid, V7.LAB * k), botLab: at(mid, -V7.LAB * k), wait: at(mid, -V7.WAIT * k),
    dotTop: at(P, o, V7.DOTAT * k), dotBot: at(Q, -o, -V7.DOTAT * k), u: [ux, uy], n: [nx, ny],
  };
}

// ---- P254 캔버스: 길 선이 다른 노드를 지나면 직각으로 돌린다(사용자 결정 2026-11-20) ----
// ra·rb = 두 역할 노드 사각형, others = 그 밖 노드 사각형, taken = 앞 선들이 쓴 통로([{ dir: 'h'|'v', at, from, to }], 같은 자리에 겹치지 않게).
// 곧은 선(마주 보는 변 가운데끼리)이 아무 노드도 지나지 않으면 null(곧은 두 줄 그대로). 지나면 직각 길 후보(가운데 꺾기, 위·아래 또는 왼·오른쪽으로 돌기)
// 가운데 노드를 지나지 않는 가장 짧은 것 → { pts: [[x, y]…](a 쪽에서 b 쪽으로) }. 다 막히면 가장 덜 지나는 것.
// 여백은 화면 px 기준(글이 화면 크기라서): k = 세계 크기 / 화면 px(캔버스 1/배율). 돌아가는 선과 노드 사이에 아래 줄 글과 "대기 n"이 들어갈 만큼
export const ROUTE = { PAD: 16, M: 96, LANE: 140, NEAR: 120 };
const hitsOf = (pts, rects, pad) => { let n = 0; for (let i = 0; i + 1 < pts.length; i++) for (const r of rects) if (segHitsRect(pts[i], pts[i + 1], { x: r.x - pad, y: r.y - pad, w: r.w + 2 * pad, h: r.h + 2 * pad }, 0)) n++; return n; };
const polyLen = (pts) => pts.slice(1).reduce((s, p, i) => s + Math.abs(p[0] - pts[i][0]) + Math.abs(p[1] - pts[i][1]), 0);
const corridors = (pts) => pts.slice(1, -2).map((p, i) => { const a = pts[i + 1], b = pts[i + 2]; return a[1] === b[1] ? { dir: 'h', at: a[1], from: Math.min(a[0], b[0]), to: Math.max(a[0], b[0]) } : { dir: 'v', at: a[0], from: Math.min(a[1], b[1]), to: Math.max(a[1], b[1]) }; });
const clash = (cs, taken, near) => cs.some((c) => taken.some((t) => t.dir === c.dir && Math.abs(t.at - c.at) < near && t.from < c.to && c.from < t.to));
export function rigRoute(ra, rb, others = [], taken = [], k = 1, ends = null) {
  const [P0, Q0, sa] = faceEnds(ra, rb);
  const P = ends ? ends[0] : P0, Q = ends ? ends[1] : Q0;
  const PAD = ROUTE.PAD * k, M = ROUTE.M * k, LANE = ROUTE.LANE * k, NEAR = ROUTE.NEAR * k;
  const diag = !(ra.x < rb.x + rb.w && rb.x < ra.x + ra.w) && !(ra.y < rb.y + rb.h && rb.y < ra.y + ra.h); // 비스듬히 놓인 두 노드: 돌아야 하면 ㄱ자 후보도 본다
  if (!others.some((r) => segHitsRect(P, Q, { x: r.x - PAD, y: r.y - PAD, w: r.w + 2 * PAD, h: r.h + 2 * PAD }, 0))) return null; // 지나는 노드가 없으면 곧은 선(비스듬해도 짧고 깨끗하다)
  const cx = (r) => r.x + r.w / 2, cy = (r) => r.y + r.h / 2;
  const cands = [];
  if (diag) { // ㄱ자 둘(세로 먼저, 가로 먼저)
    const ay = rb.y > ra.y ? ra.y + ra.h : ra.y, by = ra.y > rb.y ? rb.y + rb.h : rb.y, ax = rb.x > ra.x ? ra.x + ra.w : ra.x, bx = ra.x > rb.x ? rb.x + rb.w : rb.x;
    cands.push([[cx(ra), ay], [cx(ra), cy(rb)], [bx, cy(rb)]]);
    cands.push([[ax, cy(ra)], [cx(rb), cy(ra)], [cx(rb), by]]);
  }
  for (let lane = 0; lane < 4; lane++) {
    const d = lane * LANE;
    if (sa === 'r' || sa === 'l') {
      const mx = (P[0] + Q[0]) / 2 + (lane % 2 ? d : -d);
      cands.push([P, [mx, P[1]], [mx, Q[1]], Q]);
    } else {
      const my = (P[1] + Q[1]) / 2 + (lane % 2 ? d : -d);
      cands.push([P, [P[0], my], [Q[0], my], Q]);
    }
    // 위로·아래로 돌기(두 노드 위·아래 변 가운데에서 나가고 들어온다)
    const x0 = Math.min(ra.x, rb.x), x1 = Math.max(ra.x + ra.w, rb.x + rb.w);
    const inX = [ra, rb, ...others].filter((r) => r.x < x1 && x0 < r.x + r.w);
    const yT = Math.min(...inX.map((r) => r.y)) - M - d, yB = Math.max(...inX.map((r) => r.y + r.h)) + M + d;
    cands.push([[cx(ra), ra.y], [cx(ra), yT], [cx(rb), yT], [cx(rb), rb.y]]);
    cands.push([[cx(ra), ra.y + ra.h], [cx(ra), yB], [cx(rb), yB], [cx(rb), rb.y + rb.h]]);
    // 왼쪽·오른쪽으로 돌기
    const y0 = Math.min(ra.y, rb.y), y1 = Math.max(ra.y + ra.h, rb.y + rb.h);
    const inY = [ra, rb, ...others].filter((r) => r.y < y1 && y0 < r.y + r.h);
    const xL = Math.min(...inY.map((r) => r.x)) - M - d, xR = Math.max(...inY.map((r) => r.x + r.w)) + M + d;
    cands.push([[ra.x, cy(ra)], [xL, cy(ra)], [xL, cy(rb)], [rb.x, cy(rb)]]);
    cands.push([[ra.x + ra.w, cy(ra)], [xR, cy(ra)], [xR, cy(rb)], [rb.x + rb.w, cy(rb)]]);
  }
  let best = null;
  for (const pts of cands) {
    // 가운데 토막은 두 역할 노드도 지나면 안 된다(첫·끝 토막은 제 노드 변에서 나간다)
    const mid = pts.slice(1, -1);
    const hits = hitsOf(pts, others, PAD) + hitsOf(mid, [ra, rb], 0) + (clash(corridors(pts), taken, NEAR) ? 0.5 : 0);
    const s = hits * 1e7 + polyLen(pts);
    if (!best || s < best.s) best = { s, pts };
  }
  for (const c of corridors(best.pts)) taken.push(c);
  return { pts: best.pts };
}
// P254: 글 칸 자리(가운데). 줄에서 글 칸의 가까운 변까지 12px(시안: 위 줄 글 칸 아래 변이 줄 위 12). 칸 크기(w × LABH)를 법선 방향으로 재어
//   세로·비스듬한 줄에서도 글이 줄을 덮지 않고 줄 바깥에 붙는다(가로 줄이면 시안의 ±28, 대기 +48과 같다). "대기 n"은 아래 줄 글 바깥.
export function labelSpots(mid, n, k, { topW = 88, botW = 88, waitW = 56 } = {}) {
  const sup = (w) => Math.abs(n[0]) * w / 2 + Math.abs(n[1]) * V7.LABH / 2;
  const gap = V7.DY + 12;
  const at = (s) => [mid[0] + n[0] * s * k, mid[1] + n[1] * s * k];
  const b = gap + sup(botW);
  const vertical = Math.abs(n[0]) > 0.7;
  const bot = at(-b);
  return { topLab: at(gap + sup(topW)), botLab: bot, wait: vertical ? [bot[0] + (waitW - botW) / 2 * Math.sign(-n[0]) * k, bot[1] + (V7.LABH + 4) * k] : at(-(b + sup(botW) + 4 + sup(waitW))) };
}
// P254: 한 노드의 같은 변을 여러 rig 선이 쓰면 끝점을 그 변을 따라 나눈다(선 끝이 겹치지 않게). 차례는 선이 나가는 쪽(왼·오른 변이면 y, 위·아래 변이면 x).
//   곧은 가로·세로 선은 맞은편 끝도 같이 옮겨 곧게 두고, 꺾은선은 첫(끝) 모서리를 같이 옮겨 직각을 지킨다.
//   items: [{ id, a, b, pts }](pts = a 쪽 → b 쪽, 세계 좌표), rectOf(id) → { id: pts }
const sideOf = (r, p) => { const d = [['l', Math.abs(p[0] - r.x)], ['r', Math.abs(p[0] - r.x - r.w)], ['t', Math.abs(p[1] - r.y)], ['b', Math.abs(p[1] - r.y - r.h)]]; return d.sort((x, y) => x[1] - y[1])[0][0]; };
export function spreadEnds(items, rectOf) {
  const out = {}, groups = new Map();
  for (const e of items) {
    const ra = rectOf(e.a), rb = rectOf(e.b);
    if (!ra || !rb || !e.pts || e.pts.length < 2) continue;
    const pts = e.pts.map((p) => [...p]); out[e.id] = pts;
    const last = pts.length - 1;
    for (const [node, r, i, j] of [[e.a, ra, 0, 1], [e.b, rb, last, last - 1]]) {
      const side = sideOf(r, pts[i]); const k = node + '|' + side;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push({ id: e.id, i, j, side, r, other: i === 0 ? rb : ra, straight: pts.length === 2 });
    }
  }
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    const v = g[0].side === 'l' || g[0].side === 'r', ax = v ? 1 : 0;
    g.sort((x, y) => out[x.id][x.j][ax] - out[y.id][y.j][ax]);
    g.forEach((x, n) => {
      const pts = out[x.id], at = (v ? x.r.y + x.r.h * (n + 1) / (g.length + 1) : x.r.x + x.r.w * (n + 1) / (g.length + 1));
      const was = pts[x.i][ax];
      pts[x.i][ax] = at;
      if (!x.straight) { if (Math.abs(pts[x.j][ax] - was) < 0.5) pts[x.j][ax] = at; return; }
      // 곧은 선: 축에 나란했으면 맞은편 끝도 같이(그 노드 변 안에서)
      if (Math.abs(pts[x.j][ax] - was) < 0.5) { const o = x.other, lo = (v ? o.y : o.x) + 8, hi = (v ? o.y + o.h : o.x + o.w) - 8; pts[x.j][ax] = Math.min(hi, Math.max(lo, at)); }
    });
  }
  return out;
}
// 꺾인 길의 두 줄(곧은 두 줄 twoLines와 같은 꼴). pts = 왼쪽(a) 쪽 → 오른쪽(b) 쪽. 모서리는 두 토막의 법선을 더해 나란히 비킨다
export function polyLines(pts, k = 1) {
  const segs = pts.slice(1).map((q, i) => { const p = pts[i], L = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1; const u = [(q[0] - p[0]) / L, (q[1] - p[1]) / L]; return { p, q, L, u, n: [u[1], -u[0]] }; });
  const off = (o) => pts.map((p, i) => { const a = segs[Math.max(0, i - 1)].n, b = segs[Math.min(segs.length - 1, i)].n; const n = i === 0 ? b : i === pts.length - 1 ? a : [a[0] + b[0], a[1] + b[1]]; return [p[0] + n[0] * o, p[1] + n[1] * o]; });
  const cut = (ps, by) => { const a = ps[ps.length - 2], b = ps[ps.length - 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [...ps.slice(0, -1), [b[0] - (b[0] - a[0]) / L * by, b[1] - (b[1] - a[1]) / L * by]]; };
  const o = V7.DY * k;
  const top = cut(off(o), 2 * V7.W1 * k), bottom = cut(off(-o).reverse(), 2 * V7.W2 * k);
  const j = segs.reduce((bi, s, i) => (s.L > segs[bi].L ? i : bi), 0), S = segs[j];
  const mid = [(S.p[0] + S.q[0]) / 2, (S.p[1] + S.q[1]) / 2], at = (s) => [mid[0] + S.n[0] * s, mid[1] + S.n[1] * s];
  const u0 = segs[0].u, uz = segs[segs.length - 1].u;
  return {
    mid, n: S.n,
    top: { d: pathD(top), pts: top }, bottom: { d: pathD(bottom), pts: bottom },
    topLab: at(V7.LAB * k), botLab: at(-V7.LAB * k), wait: at(-V7.WAIT * k),
    dotTop: [top[0][0] + u0[0] * V7.DOTAT * k, top[0][1] + u0[1] * V7.DOTAT * k], dotBot: [bottom[0][0] - uz[0] * V7.DOTAT * k, bottom[0][1] - uz[1] * V7.DOTAT * k],
  };
}

// ---- P254 세션 맵: 그 워크스페이스 줄 안의 rig 묶음(V7 꼴). 역할 카드 한 줄(rowOrder), 이웃한 쌍만 곧은 두 줄
//   (이웃하지 않은 쌍은 그리지 않는다: 캔버스와 rig 판에 있다, 사용자 답 2026-11-20), 빌더는 가장 오른쪽 역할 아래, 올린 역할에서 빌더로 노랑 점선.
//   밝기는 세션 상태에 달려 그릴 때 정한다(pairLit).
//   → { w, h, dim, order, roles: Map 이름 → { x, y, w, h }, builder: { x, y, w, h }, pairs: [{ key, a, b, lines(pairLines), top: { d }, bottom, topLab, botLab, wait, dotTop, dotBot }], raises: [{ role, n, d, lab }] }
export function v7Layout(m) {
  if (!m) return null;
  const roleList = m.roles || [];
  const flows = m.flows || [];
  const beatRole = (m.head && m.head.beat && m.head.beat.role) || null;
  const order = rowOrder(roleList.map((r) => r.name), flows, { beatRole });
  const pos = new Map(order.map((n, i) => [n, i]));
  const y0 = 0;
  // 카드 사이 틈은 시안 값(104). 줄 글이 그보다 길면(영어 항목 이름 등) 그 틈만 글이 들어가게 넓힌다
  const gapOf = (i) => {
    const a = order[i], b = order[i + 1];
    if (!b) return 0;
    const ln = pairLines(a, b, flows);
    const w = Math.max(0, ...[lineText(ln.top, 'top'), lineText(ln.bottom, 'bottom')].map((s) => textW13(s)));
    return Math.max(V7.GAP, Math.ceil(w) + 16);
  };
  const xs = []; let xx = 0;
  order.forEach((n, i) => { xs.push(xx); xx += V7.CW + gapOf(i); });
  const roles = new Map(order.map((n, i) => [n, { x: xs[i], y: y0, w: V7.CW, h: V7.CH }]));
  const pairs = rolePairs(order, flows)
    .map((p) => { const [a, b] = pos.get(p.a) <= pos.get(p.b) ? [p.a, p.b] : [p.b, p.a]; return { key: a + '|' + b, a, b, lines: pairLines(a, b, flows) }; })
    .filter((p) => (p.lines.top || p.lines.bottom) && pos.get(p.b) - pos.get(p.a) === 1)
    .map((p) => {
      const A = roles.get(p.a), B = roles.get(p.b);
      const y = A.y + A.h / 2, g = twoLines([A.x + A.w, y], [B.x, y], 1);
      return { ...p, top: g.top, bottom: g.bottom, topLab: g.topLab, botLab: g.botLab, wait: g.wait, dotTop: g.dotTop, dotBot: g.dotBot };
    });
  const last = order.length ? roles.get(order[order.length - 1]) : { x: 0, y: y0, w: V7.CW, h: V7.CH };
  const builder = { x: last.x, y: y0 + V7.CH + V7.BGAP, w: V7.CW, h: V7.BH };
  // 올림: 기다리는 올림이 있는 역할마다 하나. 빌더 바로 위 역할은 곧게 내려가고, 다른 역할은 내려가서 빌더 왼쪽 변으로 꺾는다
  const counts = new Map();
  for (const x of m.raises || []) if (roles.has(x.role)) counts.set(x.role, (counts.get(x.role) || 0) + 1);
  const raises = [...counts].map(([role, n]) => {
    const R = roles.get(role), cx = R.x + R.w / 2, y1 = R.y + R.h;
    const pts = R.x === builder.x ? [[cx, y1], [cx, builder.y - 2 * V7.RAISEW]] : [[cx, y1], [cx, builder.y + builder.h / 2], [builder.x - 2 * V7.RAISEW, builder.y + builder.h / 2]];
    return { role, n, pts, d: pathD(pts), lab: [cx + V7.RAISELX, (y1 + (R.x === builder.x ? builder.y : builder.y + builder.h / 2)) / 2] };
  });
  const w = Math.max(V7.CW, ...[...roles.values()].map((r) => r.x + r.w), builder.x + builder.w);
  return { w, h: builder.y + builder.h, dim: m.status !== 'on', order, roles, builder, pairs, raises };
}

// ---- 세션 맵 트리에서 rig 역할·빌더 세션 빼기(RIG_VIEW.hideInTree) ----
export function hideRigSessions(graph, on = RIG_VIEW.hideInTree) {
  if (!graph || !on) return graph;
  const gone = new Set(graph.nodes.filter((n) => n.kind === 'session' && n.rigRole).map((n) => n.id));
  if (!gone.size) return graph;
  return { ...graph, nodes: graph.nodes.filter((n) => !gone.has(n.id)).map((n) => (gone.has(n.parentId) || gone.has(n.lineageParent) || (n.peers || []).some((p) => gone.has(p)) ? { ...n, parentId: gone.has(n.parentId) ? null : n.parentId, lineageParent: gone.has(n.lineageParent) ? null : n.lineageParent, peers: (n.peers || []).filter((p) => !gone.has(p)) } : n)), edges: graph.edges.filter((e) => !gone.has(e.from) && !gone.has(e.to)) };
}

// ---- 캔버스 ----
// 지도 자료에서 역할 이름 → 지금 세션 ID(창의 세션 값이 이긴다: rigRole·워크스페이스가 맞는 열린 세션)
export function roleSessions(m, sessions) {
  const out = new Map();
  if (!m) return out;
  for (const s of sessions && sessions.values ? sessions.values() : sessions || []) if (s && s.rigRole && (s.workspaceKey || null) === m.workspace && !out.has(s.rigRole)) out.set(s.rigRole, s.sessionId);
  for (const r of m.roles || []) if (!out.has(r.name) && r.session && r.session.sessionId) out.set(r.name, r.session.sessionId);
  if (!out.has(BUILDER_ROLE) && m.builder && m.builder.sessionId) out.set(BUILDER_ROLE, m.builder.sessionId);
  return out;
}
// 켜진 rig의 길 선: 역할 쌍마다 하나(정의에서 나온다, 연결 기록이 아니다, 끊을 수 없다). 올림은 기다리는 동안만 빌더로 점선.
// here(sessionId) → 캔버스에 그 노드가 있나. → [{ id, kind: 'path' | 'raise', ws, source, target, a, b, fwd, back, forBack, waiting, openA, openB, flows }]
export function rigEdges(maps, sessions, here = () => true) {
  const out = [];
  for (const m of maps || []) {
    if (!m || m.status !== 'on') continue;
    const names = (m.roles || []).map((r) => r.name);
    const sid = roleSessions(m, sessions);
    const flows = m.flows || [];
    for (const p of rolePairs(names, flows)) {
      const sa = sid.get(p.a), sb = sid.get(p.b);
      if (!sa || !sb || !here(sa) || !here(sb)) continue;
      const fl = p.flows.map((i) => flows[i]).filter(Boolean);
      const waiting = fl.reduce((s, f) => s + (f.waiting || 0), 0);
      const openA = fl.some((f) => f.openReturns > 0 && list(f.from).includes(p.a));
      const openB = fl.some((f) => f.openReturns > 0 && list(f.from).includes(p.b));
      // P254: lines = V7 두 줄(a → b, b → a). 캔버스가 노드 자리를 보고 왼쪽 노드 → 오른쪽 노드 줄을 위에 둔다(RigLines.jsx)
      out.push({ id: `rig:${m.workspace}:${p.key}`, kind: 'path', ws: m.workspace, source: sa, target: sb, a: p.a, b: p.b, fwd: p.fwd, back: p.back, forBack: p.forBack, waiting, openA, openB, flows: p.flows, lines: pairLines(p.a, p.b, flows) });
    }
    const bsid = sid.get(BUILDER_ROLE);
    if (bsid && here(bsid)) {
      const seen = new Set();
      for (const x of m.raises || []) {
        const s = sid.get(x.role);
        if (!s || seen.has(x.role) || !here(s)) continue;
        seen.add(x.role);
        out.push({ id: `rig:${m.workspace}:raise:${x.role}`, kind: 'raise', ws: m.workspace, source: s, target: bsid, a: x.role, b: BUILDER_ROLE, n: (m.raises || []).filter((y) => y.role === x.role).length });
      }
    }
  }
  return out;
}
// 길 선 글: "가설 → · ← 검증 결과", 기다리면 " · 3"
export function pathText(e, t) {
  if (!e) return '';
  const a = (e.fwd || []).map((x) => x + ' →'), b = (e.back || []).map((x) => '← ' + x);
  const s = [...a, ...b].join(' · ');
  return e.waiting ? s + ' · ' + t('rigMap.waitingShort', { n: e.waiting }) : s;
}
// 노드 꼬리표: 역할 세션 → { kind: 'role', role, docN, intake: [종류], beat, sectors }, 빌더 → { kind: 'builder' },
//   아니면 null(일반 세션에는 꼬리표를 달지 않는다, 사용자 답 2026-11-20)
export function rigTag(s, mapOf) {
  if (!s || !s.rigRole) return null;
  if (s.rigRole === BUILDER_ROLE) return { kind: 'builder' };
  const m = mapOf ? mapOf(s.workspaceKey || null) : null;
  const r = m && (m.roles || []).find((x) => x.name === s.rigRole);
  return { kind: 'role', role: s.rigRole, docN: r ? r.docN ?? null : null, intake: r ? r.intake || [] : [], beat: r ? r.beat || null : null, sectors: r ? (r.sectors || []).map((x) => x.path) : [], ws: m ? m.workspace : null };
}
// 캔버스 rig 테두리(RIG_VIEW.canvasFrame): 켜진 rig마다 역할 노드 사각형을 감싼 상자
export function rigFrames(maps, sessions, rectOf, pad = 40) {
  const out = [];
  for (const m of maps || []) {
    if (!m || m.status !== 'on') continue;
    const rs = [...roleSessions(m, sessions).entries()].filter(([k]) => k !== BUILDER_ROLE).map(([, sid]) => rectOf(sid)).filter(Boolean);
    if (!rs.length) continue;
    const x0 = Math.min(...rs.map((r) => r.x)), y0 = Math.min(...rs.map((r) => r.y)), x1 = Math.max(...rs.map((r) => r.x + r.w)), y1 = Math.max(...rs.map((r) => r.y + r.h));
    out.push({ ws: m.workspace, x: x0 - pad, y: y0 - pad, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2 });
  }
  return out;
}

// ---- 머리 띠·휴대폰 ----
// 다음 박자까지 남은 때(분·시간) → { n, unit } | null
export function untilText(at, now = Date.now()) {
  if (!at) return null;
  const ms = Math.max(0, at - now);
  if (ms < 3600000) return { n: Math.max(1, Math.round(ms / 60000)), unit: 'm' };
  if (ms < 86400000 * 2) return { n: Math.round(ms / 3600000), unit: 'h' };
  return { n: Math.round(ms / 86400000), unit: 'd' };
}
// 휴대폰 rig 카드 줄: 역할 목록(상태)·길 목록(수)·최근 꼭지
export function phoneRig(m, live = null) {
  if (!m) return null;
  const roles = (m.roles || []).map((r) => {
    const cur = r.session && live && live.get ? live.get(r.session.sessionId) : null;
    const state = cur ? cur.state : r.session ? (r.session.asleep ? 'sleeping' : r.session.state) : r.gaveUp ? 'gaveUp' : 'none';
    return { name: r.name, sessionId: r.session ? r.session.sessionId : null, state, received: r.received || 0 };
  });
  const flows = (m.flows || []).map((f) => ({ item: f.item, from: list(f.from).join(', '), to: list(f.to).join(', '), put: f.cycle ? f.cycle.put : 0, waiting: f.waiting || 0, open: f.openReturns || 0 }));
  return { key: m.workspace, status: m.status, name: m.name, versionN: m.versionN, cycle: m.head ? m.head.cycle : null, attention: m.head ? m.head.attention : 0, stalled: m.head ? m.head.stalled : 0, roles, flows, entry: m.entry };
}

// P252: 박자·도구 주기를 사람 말로(사전 rigPeriod). every: 정의 값("1d", "6h", "30m", "1.5h"), at: "07:00" | null
//   → "매일 07:00", "6시간마다", "every day 07:00", "every 6 hours". 하루 단위가 아닌 주기의 at은 기준 시각("6시간마다(07:00 기준)").
//   꼴을 모르는 값은 원래 값 그대로(at이 있으면 뒤에 붙인다)
const PERIOD_RE = /^(\d+(?:\.\d+)?)\s*([smhd])$/;
export function periodText(every, at, t) {
  const raw = every == null ? '' : String(every).trim();
  const m = PERIOD_RE.exec(raw);
  if (!m) return [raw, at].filter(Boolean).join(' ');
  const base = Number(m[1]) === 1 ? t(`rigPeriod.single.${m[2]}`) : t(`rigPeriod.multi.${m[2]}`, { n: m[1] });
  return at ? t(m[2] === 'd' ? 'rigPeriod.at' : 'rigPeriod.from', { period: base, at }) : base;
}
