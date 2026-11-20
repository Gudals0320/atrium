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

// ---- P261: 세션 맵 rig 묶음의 선·글 치수(세계 px). 카드는 보통 세션 카드(크기는 mission-lineage.js rigMapOpts), 선은 세션 맵 나무·동료 선 말투 ----
// DY 두 줄이 가운데에서 떨어진 거리, BACK 줄 끝을 카드 변에서 띄우는 거리(나무 선 LINE.EDGEGAP과 같다, 화살촉은 marker), LAB 가운데 → 줄 글 가운데,
// WAIT 가운데 → "대기 n" 가운데, DOTAT 붉은 점이 줄 시작에서 안쪽, DOT 붉은 점 지름, RAISELX 올림 글이 선에서 떨어진 거리(글 칩 왼쪽 끝),
// LABPX 줄 글 크기(세션 맵 선 이름표 .mt-sm .mt-ta-elab 11.5px), LABPAD 글 칩 안쪽 여백 + 테두리, LABM 칩 양옆 최소 빈칸, GAP 카드 사이 최소 틈(나무 칸 사이 LINE.GX와 같다), BGAP 역할 → 빌더 틈
export const RIG_MAP = { DY: 9, BACK: 4, LAB: 22, WAIT: 44, DOTAT: 10, DOT: 7, RAISELX: 10, LABPX: 11.5, LABPAD: 18, LABM: 22, GAP: 110, BGAP: 72, W1: 1.6, W2: 1.6, RAISEW: 1.6 };
// 세션 맵 줄 글 칩 폭(세계 px): 11.5px 글 + 안쪽 여백·테두리
export const mapLabW = (s) => Math.ceil(textW13(s) * RIG_MAP.LABPX / 13 + RIG_MAP.LABPAD);

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
//   G = 치수(기본 V7 = 캔버스 시안 값, 세션 맵은 RIG_MAP). G.BACK이 있으면 화살촉 대신 줄 끝을 그만큼 짧게(세션 맵 선의 화살촉은 marker가 줄 끝에 단다)
export function twoLines(P, Q, k = 1, G = V7) {
  const dx = Q[0] - P[0], dy = Q[1] - P[1], L = Math.hypot(dx, dy) || 1;
  const ux = dx / L, uy = dy / L, nx = uy, ny = -ux; // n = 위쪽(왼 → 오른 기준)
  const o = G.DY * k, at = (p, s, t = 0) => [p[0] + nx * s + ux * t, p[1] + ny * s + uy * t];
  const b1 = G.BACK != null ? G.BACK : 2 * G.W1, b2 = G.BACK != null ? G.BACK : 2 * G.W2;
  const tf = at(P, o), tt = at(Q, o, -b1 * k), bf = at(Q, -o), bt = at(P, -o, b2 * k);
  const mid = [(P[0] + Q[0]) / 2, (P[1] + Q[1]) / 2];
  return {
    mid, n: [nx, ny],
    top: { from: tf, to: tt, d: pathD([tf, tt]) }, bottom: { from: bf, to: bt, d: pathD([bf, bt]) },
    topLab: at(mid, G.LAB * k), botLab: at(mid, -G.LAB * k), wait: at(mid, -G.WAIT * k),
    dotTop: at(P, o, G.DOTAT * k), dotBot: at(Q, -o, -G.DOTAT * k), u: [ux, uy],
  };
}

// ---- P259 캔버스: rig 선을 보통 연결과 같은 곡선·같은 구성으로(사용자 요청 2026-11-20) ----
// P254의 직각 길(rigRoute)·위아래 두 줄(polyLines·labelSpots)·끝점 나누기(spreadEnds)를 걷어 냈다.
// - 선: 방향마다 한 선(쌍에 길이 두 방향이면 선 둘). 보통 연결(Links.jsx getBezierPath)과 같은 베지어(아래 rigCurve가 같은 식), 굵기·글 칩도 같은 가족(세계 크기).
// - 끝점(rigPorts): 상대 노드를 향한 모서리(facingSides와 같은 규칙)의 중앙이 기준. 한 모서리를 n개 선이 쓰면(나감·들어옴 함께) 중앙이 가운데가 되게 같은 간격으로 놓는다.
//   차례는 상대 노드 가운데의 그 모서리 방향 자리, 같은 상대면 rank(앞 길 0, 돌아오는 길 1, 올림 2)라 마주 보는 두 모서리에서 같은 차례 → 선끼리 엇갈리지 않는다.
// - 화살표: 도착 끝에 채운 화살촉(보통 연결보다 뚜렷하게), 출발 끝에 보통 연결과 같은 작은 점, 글 칩 안에 그 자리 선 방향 화살.
// - 글 칩(rigLabelSpots): 곡선 위 가운데에서 시작해 노드·다른 칩·화살촉과 겹치지 않는 자리를 곡선을 따라 찾는다.
// - 배율: 선·칩은 세계 크기(보통 연결과 같다). 다만 멀리 보면 칩·화살촉·선 굵기가 화면에서 CHIP_MIN배(1 = 배율 100%의 크기)보다 작아지지 않게 키운다(cs = max(1, CHIP_MIN / 배율)).
// PORT 모서리 길이에 대한 끝점 간격 비(n이 많으면 길이 / (n + 1)), ARROW·ARROW_W 화살촉 길이·폭, DOT 출발 점 반지름, W·WLIT 선 굵기(보통 연결 2.6, 밝은 쌍 3.4),
// SIB_T 두 방향 쌍의 칩을 놓아 볼 자리(각자 출발 쪽 1/3쯤이라 두 칩이 곡선이 갈라지는 가운데에서 비켜 엇갈려 놓인다), SIB_GAP 같은 쌍 두 칩 사이 최소 틈(칩 높이 배),
// ACTIVE_MS 선이 흐르는(움직이는) 때: 받는 역할이 일하고 그 방향 길로 이만큼 안에 항목이 오갔을 때(보통 연결의 ACTIVE_MS와 같다),
// CHIP_H 칩 높이, COMPACT_W 작은 칩 폭(P262: 화살만, 붉은 점이 있으면 + 12), CHIP_FONT 칩 글 크기, CHIP_MIN 칩 화면 최소 배율, LAB_T 칩을 놓아 볼 곡선 자리 차례, NODE_PAD 노드 둘레 여백, GAP 칩 사이 틈
export const RIG_EDGE = { SIB_T: [0.36, 0.3, 0.42, 0.26, 0.48, 0.22, 0.56, 0.18, 0.64, 0.72, 0.8], SIB_GAP: 0.75, ACTIVE_MS: 30 * 60 * 1000, PORT: 0.18, ARROW: 16, ARROW_W: 12, DOT: 4.5, W: 2.6, WLIT: 3.4, CHIP_H: 24, CHIP_FONT: 12, CHIP_MIN: 1, COMPACT_W: 30, LAB_T: [0.5, 0.42, 0.58, 0.34, 0.66, 0.26, 0.74, 0.18, 0.82], NODE_PAD: 8, GAP: 6 };
const POS = { t: 'top', r: 'right', b: 'bottom', l: 'left' };
// 보통 연결의 손잡이 고르기(backend links.mjs facingSides)와 같은 규칙: 가로 틈이 세로 틈보다 크거나 같으면 왼·오른 모서리
export function rigSides(a, b) {
  const dx = (b.x + b.w / 2) - (a.x + a.w / 2), dy = (b.y + b.h / 2) - (a.y + a.h / 2);
  const gapX = Math.abs(dx) - (a.w + b.w) / 2, gapY = Math.abs(dy) - (a.h + b.h) / 2;
  if (gapX >= gapY) return dx >= 0 ? ['r', 'l'] : ['l', 'r'];
  return dy >= 0 ? ['b', 't'] : ['t', 'b'];
}
// 모서리 위 자리: 중앙에서 off만큼(왼·오른 모서리는 y, 위·아래 모서리는 x)
const sidePoint = (r, side, off = 0) => (side === 'r' ? [r.x + r.w, r.y + r.h / 2 + off] : side === 'l' ? [r.x, r.y + r.h / 2 + off] : side === 't' ? [r.x + r.w / 2 + off, r.y] : [r.x + r.w / 2 + off, r.y + r.h]);
// 끝점 간격: 모서리 길이 len, 그 모서리를 쓰는 선 n개
export const portStep = (len, n) => (n < 2 ? 0 : Math.min(len * RIG_EDGE.PORT, len / (n + 1)));
// lines: [{ id, from, to, rank }](노드 ID, from → to 방향). rectOf(id) → 사각형
// → Map id → { s: [x, y], sp: 't'|'r'|'b'|'l', t, tp, sIdx, tIdx, sN, tN }(모서리의 몇째 자리·몇 개)
export function rigPorts(lines, rectOf) {
  const out = new Map(), groups = new Map();
  for (const ln of lines || []) {
    const ra = rectOf(ln.from), rb = rectOf(ln.to);
    if (!ra || !rb || ln.from === ln.to) continue;
    const [sa, sb] = rigSides(ra, rb);
    const o = { ...ln, sp: sa, tp: sb };
    out.set(ln.id, o);
    for (const [node, r, side, other, end] of [[ln.from, ra, sa, rb, 's'], [ln.to, rb, sb, ra, 't']]) {
      const k = node + '|' + side;
      if (!groups.has(k)) groups.set(k, { r, side, list: [] });
      const v = side === 'l' || side === 'r';
      groups.get(k).list.push({ o, end, along: v ? other.y + other.h / 2 : other.x + other.w / 2 });
    }
  }
  for (const g of groups.values()) {
    const v = g.side === 'l' || g.side === 'r', len = v ? g.r.h : g.r.w, n = g.list.length, step = portStep(len, n);
    g.list.sort((x, y) => x.along - y.along || (x.o.rank || 0) - (y.o.rank || 0) || String(x.o.id).localeCompare(String(y.o.id)));
    g.list.forEach((x, i) => { const off = (i - (n - 1) / 2) * step; x.o[x.end] = sidePoint(g.r, g.side, off); x.o[x.end + 'Idx'] = i; x.o[x.end + 'N'] = n; });
  }
  return out;
}
// 보통 연결과 같은 베지어(@xyflow getBezierPath, 굽음 0.25): 손잡이 쪽으로 두 끝 사이 거리의 반만큼 뻗은 조절점. 뒤로 가면 25·0.25·√거리
const ctlOff = (d, c = 0.25) => (d >= 0 ? 0.5 * d : c * 25 * Math.sqrt(-d));
const ctl = (side, p, q) => (side === 'l' ? [p[0] - ctlOff(p[0] - q[0]), p[1]] : side === 'r' ? [p[0] + ctlOff(q[0] - p[0]), p[1]] : side === 't' ? [p[0], p[1] - ctlOff(p[1] - q[1])] : [p[0], p[1] + ctlOff(q[1] - p[1])]);
// → { d(SVG 길, getBezierPath와 같은 글), P: [s, c1, c2, t] }
export function rigCurve(s, sp, t, tp) {
  const c1 = ctl(sp, s, t), c2 = ctl(tp, t, s);
  return { d: `M${s[0]},${s[1]} C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${t[0]},${t[1]}`, P: [s, c1, c2, t] };
}
export const POSITION = POS;
// 곡선 위 자리와 방향(단위 벡터)
export function bezAt(P, u) {
  const v = 1 - u, [a, b, c, d] = P;
  const p = [0, 1].map((i) => v * v * v * a[i] + 3 * v * v * u * b[i] + 3 * v * u * u * c[i] + u * u * u * d[i]);
  let g = [0, 1].map((i) => 3 * v * v * (b[i] - a[i]) + 6 * v * u * (c[i] - b[i]) + 3 * u * u * (d[i] - c[i]));
  const L = Math.hypot(g[0], g[1]) || 1; g = [g[0] / L, g[1] / L];
  return { p, u: g };
}
// 칩 글: 항목 이름(" · "로 잇는다). 방향은 칩 안 화살과 선의 화살촉이 보인다
export const chipText = (side) => (side ? side.items.join(' · ') : '');
// 칩 크기(세계, cs 곱하기 전): 글(12px) + 안쪽 여백 18 + 테두리 2 + 방향 화살 14 + 붉은 점 12 + "대기 n" 알약
export const chipSize = (text, { open = false, wait = '' } = {}) => ({ w: Math.ceil(textW13(text) * RIG_EDGE.CHIP_FONT / 13 + 20 + 14 + (open ? 12 : 0) + (wait ? textW13(wait) * 11 / 13 + 16 : 0)), h: RIG_EDGE.CHIP_H });
const boxHit = (a, b, gap = 0) => a.x - gap < b.x + b.w && b.x - gap < a.x + a.w && a.y - gap < b.y + b.h && b.y - gap < a.y + a.h;
// 글 칩 자리. items: [{ id, P(곡선), w, h(cs 곱한 세계 크기), prio, ts(놓아 볼 곡선 자리, 없으면 LAB_T), sib(같은 쌍 열쇠), sibGap(같은 쌍 칩 사이 최소 틈) }], nodes: 노드 사각형(모든 노드, 제 끝 노드도), tips: 화살촉·점 사각형
// → Map id → { p: [x, y](칩 가운데), u(그 자리 선 방향), t(곡선 자리), free(겹침 없이 놓였나) }
export function rigLabelSpots(items, nodes = [], tips = [], gap = RIG_EDGE.GAP) {
  const out = new Map(), placed = [];
  const pad = RIG_EDGE.NODE_PAD;
  const at = (it, t) => { const { p, u } = bezAt(it.P, t); return { p, u, t, box: { x: p[0] - it.w / 2, y: p[1] - it.h / 2, w: it.w, h: it.h, sib: it.sib || null } }; };
  const badOf = (c, extra = []) => nodes.filter((r) => boxHit(c.box, { x: r.x - pad, y: r.y - pad, w: r.w + 2 * pad, h: r.h + 2 * pad })).length * 4 + [...placed, ...extra].filter((q) => boxHit(c.box, q, gap)).length * 2 + tips.filter((q) => boxHit(c.box, q)).length;
  const put = (it, c, bad) => { placed.push(c.box); out.set(it.id, { p: c.p, u: c.u, t: c.t, free: bad === 0 }); };
  // 같은 쌍 두 칩(sib)은 한 번에: 두 자리 조합 가운데 둘 다 겹치지 않고 둘 사이가 sibGap 넘게 떨어진 것(ts 차례가 앞인 것부터)
  const groups = new Map();
  for (const it of items || []) { const k = it.sib ? 'sib:' + it.sib : 'one:' + it.id; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(it); }
  const prio = (g) => Math.max(...g.map((x) => x.prio || 0));
  const order = [...groups.values()].sort((a, b) => prio(b) - prio(a) || String(a[0].id).localeCompare(String(b[0].id)));
  for (const g of order) {
    if (g.length === 2) {
      const [A, B] = g, ta = A.ts || RIG_EDGE.LAB_T, tb = B.ts || RIG_EDGE.LAB_T;
      const combos = [];
      ta.forEach((x, i) => tb.forEach((y, j) => combos.push([i + j, x, y])));
      combos.sort((p, q) => p[0] - q[0]);
      // 둘 사이 틈 sibGap은 될 수 있으면 지키고(못 지키면 0.5 감점, 그때는 가장 멀리 떨어진 조합), 맞닿음(gap 안)은 겹침으로 친다
      let best = null;
      const dist = (p, q) => Math.max(Math.max(p.x, q.x) - Math.min(p.x + p.w, q.x + q.w), Math.max(p.y, q.y) - Math.min(p.y + p.h, q.y + q.h));
      for (const [, x, y] of combos) {
        const ca = at(A, x), cb = at(B, y);
        const d = dist(ca.box, cb.box);
        const touch = d < gap ? 2 : 0, soft = d < (A.sibGap || 0) ? 0.5 : 0;
        const ba = badOf(ca) + touch, bb = badOf(cb) + touch, bad = ba + bb + soft;
        if (!best || bad < best.bad || (bad === best.bad && d > best.d)) best = { ca, cb, bad, ba, bb, d };
        if (!bad) break;
      }
      put(A, best.ca, best.ba); put(B, best.cb, best.bb);
      continue;
    }
    for (const it of g) {
      let best = null;
      for (const t of it.ts || RIG_EDGE.LAB_T) { const c = at(it, t); const bad = badOf(c); if (!best || bad < best.bad) best = { c, bad }; if (!bad) break; }
      put(it, best.c, best.bad);
    }
  }
  return out;
}
// P259(2차): 선이 흐르는가(보통 연결 .mt-edge.active와 같은 움직임·같은 규칙). 보통 연결은 받는 쪽이 일하고 마지막 지시가 ACTIVE_MS 안이면 흐른다.
//   rig 선은 받는 역할(to)이 일하고, 그 방향 길(from → to)로 ACTIVE_MS 안에 항목이 오갔으면(길의 last 시각) 흐른다.
//   line: { from, to }(역할 이름), flows: 지도 길 목록, toState: 받는 세션 상태
export function rigLineActive(line, flows, toState, now = Date.now()) {
  if (!line || toState !== 'working') return false;
  let at = 0;
  for (const f of flows || []) if (f && list(f.from).includes(line.from) && list(f.to).includes(line.to)) for (const x of f.last || []) at = Math.max(at, x.t || 0);
  return at > 0 && now - at < RIG_EDGE.ACTIVE_MS;
}
export function rigCanvasLines(edges, rectOf, { nodes = [], cs = 1, waitText = (n) => 'wait ' + n } = {}) {
  const lines = [];
  for (const e of edges || []) {
    if (e.kind === 'raise') { lines.push({ id: e.id + '#raise', edge: e.id, which: 'raise', from: e.source, to: e.target, rank: 2, roleFrom: e.a, roleTo: e.b, items: [], open: false, waiting: 0, n: e.n || 1 }); continue; }
    const L = e.lines || {};
    if (L.top) lines.push({ id: e.id + '#top', edge: e.id, which: 'top', from: e.source, to: e.target, rank: 0, roleFrom: e.a, roleTo: e.b, items: L.top.items, open: L.top.open, waiting: L.top.waiting || 0 });
    if (L.bottom) lines.push({ id: e.id + '#bottom', edge: e.id, which: 'bottom', from: e.target, to: e.source, rank: 1, roleFrom: e.b, roleTo: e.a, items: L.bottom.items, open: L.bottom.open, waiting: L.bottom.waiting || 0 });
  }
  const ports = rigPorts(lines, rectOf);
  const A = RIG_EDGE.ARROW * cs, tips = [];
  const drawn = [];
  for (const ln of lines) {
    const o = ports.get(ln.id); if (!o) continue;
    const c = rigCurve(o.s, o.sp, o.t, o.tp);
    const end = bezAt(c.P, 1);
    tips.push({ x: o.t[0] - end.u[0] * A / 2 - A / 2, y: o.t[1] - end.u[1] * A / 2 - A / 2, w: A, h: A });
    const text = chipText(ln);
    const wait = ln.waiting ? waitText(ln.waiting) : '';
    const sz = ln.which === 'raise' ? { w: Math.ceil(textW13(text || 'raise') + 40), h: RIG_EDGE.CHIP_H } : chipSize(text, { open: ln.open, wait });
    drawn.push({ ...ln, ...c, s: o.s, t: o.t, sp: o.sp, tp: o.tp, text, wait, w: sz.w * cs, h: sz.h * cs });
  }
  const pairN = new Map(); for (const x of drawn) pairN.set(x.edge, (pairN.get(x.edge) || 0) + 1);
  // P262: 칩이 들어갈 자리가 없으면(멀리 볼 때 최소 화면 크기 칩이 노드 사이 틈보다 커지는 등) 보통 연결처럼 줄인다(Links.jsx fit.compact·linkLabelHidden).
  //   1차: 온 칩으로 놓는다. 겹치는 칩은 작은 칩(방향 화살과 붉은 점만, 마우스를 올리면 글)으로 바꿔 다시 놓고, 그래도 겹치면 칩 없이 선만(hidden).
  //   화살촉·출발 점은 그대로(cs). 자리가 남는 칩은 그대로 온 칩이다
  const place = () => rigLabelSpots(drawn.filter((x) => !x.hidden).map((x) => { const two = x.which !== 'raise' && pairN.get(x.edge) > 1; return { id: x.id, P: x.P, w: x.w, h: x.h, prio: x.which === 'raise' ? 0 : x.waiting ? 2 : 1, ...(two ? { ts: RIG_EDGE.SIB_T, sib: x.edge, sibGap: RIG_EDGE.CHIP_H * cs * RIG_EDGE.SIB_GAP } : {}) }; }), nodes, tips);
  let spots = place();
  for (let round = 0; round < 6; round++) {
    const bad = drawn.filter((x) => !x.hidden && spots.get(x.id) && !spots.get(x.id).free);
    if (!bad.length) break;
    for (const x of bad) {
      if (!x.compact) { x.compact = true; x.w = (RIG_EDGE.COMPACT_W + (x.open ? 12 : 0)) * cs; }
      else x.hidden = true;
    }
    spots = place();
  }
  const out = new Map();
  for (const x of drawn) {
    if (!out.has(x.edge)) out.set(x.edge, { cs, lines: [] });
    out.get(x.edge).lines.push({ key: x.id, which: x.which, fit: x.hidden ? 'hidden' : x.compact ? 'compact' : 'full', from: x.roleFrom, to: x.roleTo, d: x.d, P: x.P, s: x.s, t: x.t, sp: x.sp, tp: x.tp, items: x.items, text: x.text, open: x.open, waiting: x.waiting, wait: x.wait, n: x.n, lab: x.hidden ? null : spots.get(x.id), w: x.w, h: x.h });
  }
  return out;
}

// ---- P254 세션 맵: 그 워크스페이스 줄 안의 rig 묶음(V7 꼴). 역할 카드 한 줄(rowOrder), 이웃한 쌍만 곧은 두 줄
//   (이웃하지 않은 쌍은 그리지 않는다: 캔버스와 rig 판에 있다, 사용자 답 2026-11-20), 빌더는 가장 오른쪽 역할 아래, 올린 역할에서 빌더로 노랑 점선.
//   밝기는 세션 상태에 달려 그릴 때 정한다(pairLit).
//   → { w, h, dim, order, roles: Map 이름 → { x, y, w, h }, builder: { x, y, w, h }, pairs: [{ key, a, b, lines(pairLines), top: { d }, bottom, topLab, botLab, wait, dotTop, dotBot }], raises: [{ role, n, d, lab }] }
//   P261: opt = 세션 맵 카드 꼴(rigMapOpts: 카드 폭·높이 = 보통 세션 카드, 틈·줄 글 = 세션 맵 선 말투). 주지 않으면 시안 V7 값(184×96, 틈 104)
//     { cw, ch, bh(빌더 높이), gap(카드 사이 최소 틈), bgap(역할 → 빌더 틈), geo(twoLines 치수), labW(줄 글 → 그 글이 차지하는 폭, 틈은 이보다 좁지 않다) }
export function v7Layout(m, opt = {}) {
  if (!m) return null;
  const CW = opt.cw || V7.CW, CH = opt.ch || V7.CH, BH = opt.bh || V7.BH, GAP = opt.gap != null ? opt.gap : V7.GAP, BGAP = opt.bgap != null ? opt.bgap : V7.BGAP;
  const G = opt.geo || V7, labW = opt.labW || ((s) => textW13(s) + 16);
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
    const w = Math.max(0, ...[ln.top ? lineText(ln.top, 'top') : '', ln.bottom ? lineText(ln.bottom, 'bottom') : ''].filter(Boolean).map(labW));
    return Math.max(GAP, Math.ceil(w));
  };
  const xs = []; let xx = 0;
  order.forEach((n, i) => { xs.push(xx); xx += CW + gapOf(i); });
  const roles = new Map(order.map((n, i) => [n, { x: xs[i], y: y0, w: CW, h: CH }]));
  const pairs = rolePairs(order, flows)
    .map((p) => { const [a, b] = pos.get(p.a) <= pos.get(p.b) ? [p.a, p.b] : [p.b, p.a]; return { key: a + '|' + b, a, b, lines: pairLines(a, b, flows) }; })
    .filter((p) => (p.lines.top || p.lines.bottom) && pos.get(p.b) - pos.get(p.a) === 1)
    .map((p) => {
      const A = roles.get(p.a), B = roles.get(p.b);
      const y = A.y + A.h / 2, g = twoLines([A.x + A.w, y], [B.x, y], 1, G);
      return { ...p, top: g.top, bottom: g.bottom, topLab: g.topLab, botLab: g.botLab, wait: g.wait, dotTop: g.dotTop, dotBot: g.dotBot };
    });
  const last = order.length ? roles.get(order[order.length - 1]) : { x: 0, y: y0, w: CW, h: CH };
  const builder = { x: last.x, y: y0 + CH + BGAP, w: CW, h: BH };
  // 올림: 기다리는 올림이 있는 역할마다 하나. 빌더 바로 위 역할은 곧게 내려가고, 다른 역할은 내려가서 빌더 왼쪽 변으로 꺾는다
  const counts = new Map();
  for (const x of m.raises || []) if (roles.has(x.role)) counts.set(x.role, (counts.get(x.role) || 0) + 1);
  const raises = [...counts].map(([role, n]) => {
    const R = roles.get(role), cx = R.x + R.w / 2, y1 = R.y + R.h;
    const back = G.BACK != null ? G.BACK : 2 * (G.RAISEW || V7.RAISEW);
    const pts = R.x === builder.x ? [[cx, y1], [cx, builder.y - back]] : [[cx, y1], [cx, builder.y + builder.h / 2], [builder.x - back, builder.y + builder.h / 2]];
    return { role, n, pts, d: pathD(pts), lab: [cx + (G.RAISELX != null ? G.RAISELX : V7.RAISELX), (y1 + (R.x === builder.x ? builder.y : builder.y + builder.h / 2)) / 2] };
  });
  const w = Math.max(CW, ...[...roles.values()].map((r) => r.x + r.w), builder.x + builder.w);
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
    return { name: r.name, sessionId: r.session ? r.session.sessionId : null, session: cur ? cur.name : r.session ? r.session.name : null, state, received: r.received || 0 }; // P261: 세션 이름(세션 맵 카드와 같이)
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
