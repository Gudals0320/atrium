// P251: rig 구조 지도와 캔버스 길 선의 순수 배치(창 lib/rig-map.js와 백엔드 rig-map.mjs가 같이 쓴다. 판 상태·fs를 모른다).
// - 역할 차례(roleOrder): 길(flows)의 앞뒤로 역할을 칸(layer)에 놓는다. 답으로 돌아오는 길(for)은 차례에 넣지 않는다.
//   고리(되돌아오는 길)는 받는 길이 없는 역할부터, 그다음 (내는 길 - 받는 길)이 큰 역할, 사람 입력을 받는 역할, 정의 차례로 깊이 우선으로 걸어 뒤로 가는 선(back)으로 떼고, 남은 길의 가장 긴 경로로 칸을 정한다.
//   한 칸에 역할이 여럿이면(가지) 위에서 아래로 쌓는다(앞 칸에서 받는 역할의 줄 평균 → 정의 차례). 길이 없는 역할은 0칸.
//   칸이 maxCols를 넘으면 줄을 바꾼다(line = 칸 / maxCols, col = 칸 % maxCols). 선이 줄을 건너면 꺾여 내려간다(화면 쪽이 그린다).
// - 역할 쌍(rolePairs): 길을 함께 쓰는 역할 한 쌍마다 하나. a는 차례가 앞인 쪽, fwd는 a → b 길의 항목 종류, back은 b → a.
import { HUMAN } from './rig-def-names.mjs';

export const RIG_LAYOUT = { MAXCOLS: 4 };

const list = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

// roles: 역할 이름 배열(정의 차례), flows: [{ item, from, to, for }]
// → { layer: Map 이름 → 칸, row: Map 이름 → 칸 안 줄, line: Map, col: Map, cols: [[이름…]](칸마다), lines: 줄 수, back: [[a, b]](떼어 낸 고리 선) }
export function roleOrder(roles, flows = [], { maxCols = RIG_LAYOUT.MAXCOLS } = {}) {
  const names = [...new Set((roles || []).filter(Boolean))];
  const known = new Set(names);
  const out = new Map(names.map((n) => [n, []]));
  for (const f of flows || []) {
    if (!f || f.for) continue;
    for (const a of list(f.from)) if (known.has(a)) for (const b of list(f.to)) if (known.has(b) && b !== a && !out.get(a).includes(b)) out.get(a).push(b);
  }
  const fed = names.filter((n) => (flows || []).some((f) => f && list(f.from).includes(HUMAN) && list(f.to).includes(n)));
  const hasIn = new Set([...out.values()].flat());
  const srcs = names.filter((n) => !hasIn.has(n));
  // 받는 길이 없는 역할(시작) → (모두 받으면) 내는 길 수 - 받는 길 수가 큰 역할 → 사람 입력을 받는 역할 → 정의 차례
  const score = (n) => out.get(n).length - [...out.values()].filter((bs) => bs.includes(n)).length;
  const rest = names.filter((n) => !hasIn.has(n) ? false : true).sort((a, b) => score(b) - score(a) || (fed.includes(b) - fed.includes(a)) || names.indexOf(a) - names.indexOf(b));
  const starts = [...srcs, ...rest];
  const mark = new Map(); const keep = new Map(names.map((n) => [n, []])); const back = [];
  const dfs = (a, g) => {
    mark.set(a, 1);
    for (const b of out.get(a)) {
      if (mark.get(b) === 1 || g > 200) { back.push([a, b]); continue; }
      keep.get(a).push(b);
      if (!mark.get(b)) dfs(b, g + 1);
    }
    mark.set(a, 2);
  };
  for (const s of starts) if (!mark.get(s)) dfs(s, 0);
  // 가장 긴 경로(Kahn 차례)
  const indeg = new Map(names.map((n) => [n, 0]));
  for (const [, bs] of keep) for (const b of bs) indeg.set(b, indeg.get(b) + 1);
  const layer = new Map(names.map((n) => [n, 0]));
  const q = names.filter((n) => !indeg.get(n));
  for (let i = 0; i < q.length; i++) { const a = q[i]; for (const b of keep.get(a)) { layer.set(b, Math.max(layer.get(b), layer.get(a) + 1)); indeg.set(b, indeg.get(b) - 1); if (!indeg.get(b)) q.push(b); } }
  const nL = names.length ? Math.max(...layer.values()) + 1 : 0;
  const cols = Array.from({ length: nL }, () => []);
  const row = new Map();
  const preds = (n) => names.filter((a) => keep.get(a).includes(n));
  const defIdx = new Map(names.map((n, i) => [n, i]));
  for (let L = 0; L < nL; L++) {
    const here = names.filter((n) => layer.get(n) === L);
    const key = (n) => { const p = preds(n).filter((a) => row.has(a)); return p.length ? p.reduce((s, a) => s + row.get(a), 0) / p.length : -1; };
    here.sort((a, b) => key(a) - key(b) || defIdx.get(a) - defIdx.get(b));
    here.forEach((n, i) => row.set(n, i));
    cols[L] = here;
  }
  const mc = Math.max(1, maxCols | 0);
  const line = new Map(), col = new Map();
  for (const n of names) { line.set(n, Math.floor(layer.get(n) / mc)); col.set(n, layer.get(n) % mc); }
  return { layer, row, line, col, cols, lines: nL ? Math.floor((nL - 1) / mc) + 1 : 0, maxCols: mc, back };
}

// 차례가 앞인가(칸, 그다음 줄)
const before = (o, a, b) => (o.layer.get(a) - o.layer.get(b)) || (o.row.get(a) - o.row.get(b)) || (a < b ? -1 : 1);

// 길을 함께 쓰는 역할 쌍 → [{ key, a, b, fwd: [종류], back: [종류], forBack: 종류 중 답 길, flows: [길 번호] }]
//   사람(입력 창구)이 낸 길은 쌍이 아니다(역할 둘 사이만). 한 길에 받는 역할이 여럿이면 쌍도 여럿
export function rolePairs(roles, flows = [], order = null) {
  const o = order || roleOrder(roles, flows);
  const known = new Set(roles || []);
  const m = new Map();
  (flows || []).forEach((f, i) => {
    if (!f) return;
    for (const x of list(f.from)) for (const y of list(f.to)) {
      if (!known.has(x) || !known.has(y) || x === y) continue;
      const [a, b] = before(o, x, y) <= 0 ? [x, y] : [y, x];
      const key = a + '|' + b;
      const p = m.get(key) || { key, a, b, fwd: [], back: [], forBack: [], flows: [] };
      const side = x === a ? p.fwd : p.back;
      if (!side.includes(f.item)) side.push(f.item);
      if (f.for && !p.forBack.includes(f.item)) p.forBack.push(f.item);
      if (!p.flows.includes(i)) p.flows.push(i);
      m.set(key, p);
    }
  });
  return [...m.values()];
}

// P253: 지도 한 줄 차례(docs research rig3-map.md 8.2-3). 역할을 한 줄에 놓되 이웃한 쌍(길을 함께 쓰는 두 역할)이 가장 많아지는 차례.
//   같은 값이면 박자를 받는 역할(beatRole)이 앞에, 그다음 앞으로 가는 길(답 길·사람 입력 아님)이 왼쪽 → 오른쪽인 수가 많은 것, 그다음 정의 차례.
//   역할이 ROW_EXACT 이하이면 모든 차례를 견주고, 많으면 roleOrder(칸·줄) 차례를 그대로 쓴다.
export const ROW_EXACT = 8;
export function rowOrder(roles, flows = [], { beatRole = null } = {}) {
  const names = [...new Set((roles || []).filter(Boolean))];
  const known = new Set(names);
  const pairs = new Set(); const fwd = [];
  for (const f of flows || []) {
    if (!f) continue;
    for (const a of list(f.from)) for (const b of list(f.to)) {
      if (!known.has(a) || !known.has(b) || a === b) continue;
      pairs.add(a < b ? a + '|' + b : b + '|' + a);
      if (!f.for) fwd.push([a, b]);
    }
  }
  const pairList = [...pairs].map((k) => k.split('|'));
  const score = (p) => {
    const pos = new Map(p.map((n, i) => [n, i]));
    let adj = 0; for (const [a, b] of pairList) if (Math.abs(pos.get(a) - pos.get(b)) === 1) adj++;
    let right = 0; for (const [a, b] of fwd) if (pos.get(a) < pos.get(b)) right++;
    const bp = beatRole && pos.has(beatRole) ? pos.get(beatRole) : 0;
    return [adj, -bp, right];
  };
  const better = (s, t) => { for (let i = 0; i < s.length; i++) if (s[i] !== t[i]) return s[i] > t[i]; return false; };
  if (names.length > ROW_EXACT) {
    const o = roleOrder(names, flows, { maxCols: 1e9 });
    return names.slice().sort((a, b) => o.layer.get(a) - o.layer.get(b) || o.row.get(a) - o.row.get(b) || names.indexOf(a) - names.indexOf(b));
  }
  let best = null, bestS = null;
  // 정의 차례로 사전순 순열을 돌므로 먼저 찾은 것이 같은 값 가운데 정의 차례가 앞선 것이다
  const used = new Array(names.length).fill(false); const cur = [];
  const walk = () => {
    if (cur.length === names.length) { const s = score(cur); if (!best || better(s, bestS)) { best = cur.slice(); bestS = s; } return; }
    for (let i = 0; i < names.length; i++) { if (used[i]) continue; used[i] = true; cur.push(names[i]); walk(); cur.pop(); used[i] = false; }
  };
  walk();
  return best || [];
}

// ---- P254: 켤 때 캔버스에 역할·빌더를 2D 칸에 놓는 자리 찾기(사용자 결정 2026-11-20) ----
// 점수 = 노드를 지나는 선 × 1000 + 선끼리 엇갈림 × 100 + 선 길이 합(칸 간격 단위) + 빌더까지 길이 × 0.2 + 앞 차례 역할이 앞 칸에(아주 작게).
// 선은 두 노드의 마주 보는 변 가운데를 잇는다(캔버스 facingSides와 같은 규칙). 6개(역할 + 빌더)까지는 모든 자리를 견주고, 많으면 옮기기·바꾸기로 낮춘다.
// → { cells: Map 이름 → { c, r }(빌더는 BUILDER 열쇠로), cols, rows, score }
export const GRID_BUILDER = '@builder';
export function faceEnds(a, b) {
  const dx = (b.x + b.w / 2) - (a.x + a.w / 2), dy = (b.y + b.h / 2) - (a.y + a.h / 2);
  const gapX = Math.abs(dx) - (a.w + b.w) / 2, gapY = Math.abs(dy) - (a.h + b.h) / 2;
  const mid = (r, s) => (s === 'r' ? [r.x + r.w, r.y + r.h / 2] : s === 'l' ? [r.x, r.y + r.h / 2] : s === 't' ? [r.x + r.w / 2, r.y] : [r.x + r.w / 2, r.y + r.h]);
  const [sa, sb] = gapX >= gapY ? (dx >= 0 ? ['r', 'l'] : ['l', 'r']) : (dy >= 0 ? ['b', 't'] : ['t', 'b']);
  return [mid(a, sa), mid(b, sb), sa, sb];
}
// 선분 p-q가 사각형 r(안쪽으로 pad만큼 줄인 것)을 지나는가
export function segHitsRect(p, q, r, pad = 0) {
  const x0 = r.x + pad, y0 = r.y + pad, x1 = r.x + r.w - pad, y1 = r.y + r.h - pad;
  if (x1 <= x0 || y1 <= y0) return false;
  let t0 = 0, t1 = 1; const dx = q[0] - p[0], dy = q[1] - p[1];
  for (const [pp, qq] of [[-dx, p[0] - x0], [dx, x1 - p[0]], [-dy, p[1] - y0], [dy, y1 - p[1]]]) {
    if (pp === 0) { if (qq < 0) return false; continue; }
    const t = qq / pp;
    if (pp < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return t1 - t0 > 1e-9;
}
const cross2 = (a, b, c, d) => {
  const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
};
// P259: 켤 때 놓는 노드 사이 간격(노드 크기에 비례, 사용자 요청 "의도적으로 공간을 더 벌려"). 선과 글 칩이 보통 연결처럼 세계 크기라
//   간격도 노드 크기에 비례한다. 가로 GX = 노드 폭 × FX: 마주 보는 왼·오른 모서리 사이에 두 방향 칩(멀리 볼 때 커진 칩까지)과 화살촉이 편히 든다.
//   세로 GY = 노드 높이 × FY이되 반 칸 비스듬한 선(아래 모서리 중앙 → 위 모서리 중앙)의 각도 atan(GY / ((W + GX) / 2))가 ANG도를 넘지 않게 줄인다(허용 각도 ANGLE.MAX 35도 안).
//   너무 작은 노드에서도 MIN 아래로 줄이지 않는다. 1440×810이면 1080×787(P254는 600×600), 600×400이면 450×360.
export const PLACE_GAP = { FX: 0.75, FY: 1, MIN: 360, ANG: 32 };
export function placeGap(W, H) {
  const GX = Math.max(PLACE_GAP.MIN, Math.round(W * PLACE_GAP.FX));
  const yMax = Math.floor(Math.tan(PLACE_GAP.ANG * Math.PI / 180) * (W + GX) / 2);
  const GY = Math.max(PLACE_GAP.MIN, Math.min(Math.round(H * PLACE_GAP.FY), yMax));
  return { GX, GY };
}
// P254(2차): 선 각도 허용 범위(사용자 결정 2026-11-20). 그린 선(마주 보는 변 가운데끼리)이 수평에서 0~ANGLE.MAX도이거나 세로(ANGLE.VERT도 이상)이면 읽기 좋다.
//   그 사이(가파른 비스듬한 선)는 점수에서 크게 깎는다(되도록 피하는 조건).
export const ANGLE = { MAX: 35, VERT: 89 };
export const lineAngle = (p, q) => Math.atan2(Math.abs(q[1] - p[1]), Math.abs(q[0] - p[0])) * 180 / Math.PI;
export const angleOk = (deg) => deg <= ANGLE.MAX + 1e-6 || deg >= ANGLE.VERT;
// 칸은 반 칸 단위(가로 h = 반 칸 수, 세로 r = 줄). 같은 줄의 두 노드는 h가 2 이상 떨어진다. 세 역할이 서로 다 이어지면(삼각형) 둘을 한 줄에, 하나를 그 가운데 아래·위에.
//   shape: 'flat'(기본, 줄 간격 = 노드 높이 + GY라 삼각형 변이 허용 각도 안) | 'equilateral'(줄 간격을 늘려 노드 가운데끼리 정삼각형. 그린 선은 약 40도로 허용 범위 밖이라 각도 항을 끈다)
export const GRID_TIDY = { LONG: 1, LONG_W: 4, ASPECT: 16 / 9, ASPECT_W: 1.5, COL_W: 0.2, EXACT: 7, B_STEEP: 3, B_THROUGH: 5 };
export function gridPlace(roles, flows = [], { W = 600, H = 400, GX = 600, GY = 600, beatRole = null, builder = true, exact = GRID_TIDY.EXACT, shape = 'flat', _eval = null } = {}) {
  const names = [...new Set((roles || []).filter(Boolean))];
  const order = rowOrder(names, flows, { beatRole });
  const items = builder ? [...order, GRID_BUILDER] : order;
  const n = items.length;
  if (!n) return { cells: new Map(), cols: 0, rows: 0, score: 0, shape };
  const pairs = rolePairs(order, flows).map((p) => [items.indexOf(p.a), items.indexOf(p.b)]);
  const has = new Set(pairs.map(([a, b]) => Math.min(a, b) + '|' + Math.max(a, b)));
  const tris = [];
  for (let a = 0; a < order.length; a++) for (let b = a + 1; b < order.length; b++) for (let c = b + 1; c < order.length; c++) if (has.has(a + '|' + b) && has.has(a + '|' + c) && has.has(b + '|' + c)) tris.push([a, b, c]);
  const bi = builder ? n - 1 : -1;
  // P262: 정확히 견주는 크기(n ≤ exact)는 칸을 한 열 넓게 둔다(3 위 2 엇갈림 + 빌더 같은 꼴이 들어가게)
  const C = Math.max(2, Math.ceil(Math.sqrt(n)) + (n > 4 && n > exact ? 0 : 1)), R = Math.max(2, Math.ceil(Math.sqrt(n)));
  const SX = W + GX;
  const SY = shape === 'equilateral' ? Math.max(H + GY, Math.round(SX * Math.sqrt(3) / 2)) : H + GY;
  const HN = 2 * C - 1; // 반 칸 자리 수
  const P = []; for (let r = 0; r < R; r++) for (let h = 0; h < HN; h++) P.push([h, r]);
  const RECT = P.map(([h, r]) => ({ x: h * SX / 2, y: r * SY, w: W, h: H }));
  const nbr = Array.from({ length: n }, () => []);
  for (const [a, b] of pairs) { nbr[a].push(b); nbr[b].push(a); }
  // ---- 점수(P254 + P262): 더하는 항(쌍마다·노드마다)과 끝에 한 번 재는 항(삼각형, 넓이·비율·열 맞춤)으로 나눈다.
  //   더하는 항: 노드를 지나는 선 × 1000 + 가파른 선 × 300 + 엇갈림 × 100 + 빌더 선(가장 가까운 역할 선 하나만: 가파름 × B_STEEP, 노드를 지남 × B_THROUGH. 올림이 있을 때만 그려진다) + 선 길이(칸 간격 단위)
  //     + P262 긴 선: 길이가 LONG(칸 간격 하나)을 넘는 만큼 × LONG_W(덩어리를 가로지르는 긴 곡선을 피한다) + 빌더까지 길이 + 차례(아주 작게)
  //   끝 항: 삼각형 × 50 + 넓이 × 0.05 + P262 바깥 비율이 16:9에서 먼 만큼(|log|) × ASPECT_W + 쓰인 반 칸 열 수 × COL_W(열이 맞을수록 낮다)
  const segOf = (ka, kb) => faceEnds(RECT[ka], RECT[kb]);
  const lineCost = (p, q) => {
    const l = Math.hypot(q[0] - p[0], q[1] - p[1]) / SX;
    return { c: l + Math.max(0, l - GRID_TIDY.LONG) * GRID_TIDY.LONG_W, steep: shape !== 'equilateral' && !angleOk(lineAngle(p, q)) ? 300 : 0 };
  };
  // 놓인 것(pos[0..i-1])에 i를 k에 더할 때 늘어나는 점수
  const segs = []; // [a, b, p, q, role]
  const addCost = (pos, i, k) => {
    let c = (n - i) * (P[k][1] * HN + P[k][0]) * 1e-4;
    const R0 = RECT[k];
    const added = [];
    const isB = i === bi;
    if (isB) {
      // 빌더 선(올림이 있을 때만 그려진다): 길이 합은 아주 작게, 가장 가까운 역할 한 선만 가파름·지남을 본다(빌더가 덩어리 가장자리 가까이에 깨끗한 선 하나로 붙게)
      let near = null;
      for (let j = 0; j < i; j++) {
        const [p, q] = segOf(pos[j], k);
        const l = Math.hypot(q[0] - p[0], q[1] - p[1]) / SX;
        c += l * (0.2 / Math.max(1, bi));
        if (!near || l < near.l) near = { j, p, q, l };
      }
      if (near) {
        if (!angleOk(lineAngle(near.p, near.q))) c += GRID_TIDY.B_STEEP;
        for (let m = 0; m < i; m++) if (m !== near.j && segHitsRect(near.p, near.q, RECT[pos[m]], 1)) { c += GRID_TIDY.B_THROUGH; break; }
      }
    }
    for (let j = 0; j < i && !isB; j++) {
      if (!nbr[i].includes(j)) continue;
      const [p, q] = segOf(pos[j], k);
      const lc = lineCost(p, q);
      c += lc.c + lc.steep;
      for (let m = 0; m < i; m++) if (m !== j && segHitsRect(p, q, RECT[pos[m]], 1)) c += 1000;
      for (const s of segs) if (s[0] !== j && s[1] !== j && cross2(p, q, s[2], s[3])) c += 100;
      added.push([j, i, p, q, true]);
    }
    // 이미 그은 선이 새 노드를 지나는가
    for (const s of segs) if (segHitsRect(s[2], s[3], R0, 1)) c += 1000;
    return { c, added };
  };
  const endCost = (pos) => {
    let tri = 0;
    for (const t of tris) {
      const ok = t.some((apex) => { const [u, v] = t.filter((x) => x !== apex); const A = P[pos[apex]], U = P[pos[u]], V = P[pos[v]]; return U[1] === V[1] && Math.abs(U[0] - V[0]) === 2 && Math.abs(A[1] - U[1]) === 1 && A[0] * 2 === U[0] + V[0]; }); // 밑변 한 칸, 꼭짓점은 그 가운데 위·아래
      if (!ok) tri++;
    }
    const hs = pos.map((k) => P[k][0]), rr = pos.map((k) => P[k][1]);
    const hw = (Math.max(...hs) - Math.min(...hs)) / 2, rh = Math.max(...rr) - Math.min(...rr);
    const box = (hw + 1) * (rh + 1) * 0.05;
    const bw = hw * SX + W, bh = rh * SY + H;
    const asp = Math.abs(Math.log(bw / bh / GRID_TIDY.ASPECT)) * GRID_TIDY.ASPECT_W;
    const colN = new Set(hs).size * GRID_TIDY.COL_W;
    return tri * 50 + box + asp + colN;
  };
  const fullScore = (pos) => { segs.length = 0; let c = 0; for (let i = 0; i < n; i++) { const x = addCost(pos, i, pos[i]); c += x.c; segs.push(...x.added); } return c + endCost(pos); };
  // 같은 줄 두 노드는 반 칸 2 이상 떨어져야 한다
  const fits = (pos, i, k) => { for (let j = 0; j < i; j++) { const a = P[pos[j]], b = P[k]; if (pos[j] === k || (a[1] === b[1] && Math.abs(a[0] - b[0]) < 2)) return false; } return true; };
  if (_eval) { const pos = items.map((k) => P.findIndex(([h, r]) => h === _eval[k][0] && r === _eval[k][1])); const tot = fullScore(pos); return { total: tot, end: endCost(pos) }; } // 시험·조율용: 주어진 자리([반 칸, 줄])의 점수
  let best = null, bestS = Infinity;
  if (n <= exact) {
    // P262: 가지치기 정확 찾기. 더하는 항은 놓을수록 늘기만 하므로 지금까지의 합이 가장 좋은 값 이상이면 그 가지를 버린다
    const pos = [];
    const walk = (i, acc) => {
      if (acc >= bestS) return;
      if (i === n) { const s = acc + endCost(pos); if (s < bestS - 1e-9) { bestS = s; best = pos.slice(); } return; }
      for (let k = 0; k < P.length; k++) {
        if (!fits(pos, i, k)) continue;
        const x = addCost(pos, i, k);
        if (acc + x.c >= bestS) continue;
        pos[i] = k; segs.push(...x.added);
        walk(i + 1, acc + x.c);
        segs.length -= x.added.length;
      }
      pos.length = i;
    };
    walk(0, 0);
    bestS = fullScore(best);
  } else {
    // 처음: 정의 차례로 온 칸(반 칸 0, 2, 4…)에 줄줄이. 그다음 한 노드 옮기기·두 노드 바꾸기로 낮춘다
    best = items.map((_, i) => P.findIndex(([h, r]) => r === Math.floor(i / C) && h === (i % C) * 2)); bestS = fullScore(best);
    const legal = (pos) => pos.every((k, i) => pos.every((m, j) => j === i || !(P[k][1] === P[m][1] && Math.abs(P[k][0] - P[m][0]) < 2)));
    for (let round = 0, better = true; better && round < 200; round++) {
      better = false;
      for (let i = 0; i < n; i++) for (let k = 0; k < P.length; k++) {
        const j = best.indexOf(k); if (j === i) continue;
        const nx = best.slice(); if (j >= 0) nx[j] = best[i]; nx[i] = k;
        if (!legal(nx)) continue;
        const s = fullScore(nx); if (s < bestS - 1e-9) { bestS = s; best = nx; better = true; }
      }
    }
  }
  const h0 = Math.min(...best.map((k) => P[k][0])), r0 = Math.min(...best.map((k) => P[k][1]));
  const cells = new Map(items.map((key, i) => [key, { c: (P[best[i]][0] - h0) / 2, r: P[best[i]][1] - r0 }]));
  return { cells, cols: Math.max(...[...cells.values()].map((x) => x.c)) + 1, rows: Math.max(...[...cells.values()].map((x) => x.r)) + 1, score: bestS, shape, rowStep: SY, colStep: SX };
}

// ---- P262: rig 덩어리(켤 때 놓기와 캔버스 자동 정렬이 같이 쓴다) ----
// 모든 rig 노드(역할·빌더)는 같은 크기 W×H다. 칸 간격은 placeGap(W, H), 자리는 gridPlace(빌더 칸은 빌더가 아직 없어도 비워 둔다. 켤 때와 같은 덩어리).
// → { at: Map 이름(빌더는 GRID_BUILDER) → { x, y }(덩어리 왼쪽 위 칸이 0, 0), GX, GY, SX, SY, grid }
export function rigCluster(roles, flows = [], { W = 1440, H = 810, beatRole = null } = {}) {
  const { GX, GY } = placeGap(W, H);
  const grid = gridPlace(roles, flows, { W, H, GX, GY, beatRole });
  const SX = grid.colStep || W + GX, SY = grid.rowStep || H + GY;
  const at = new Map([...grid.cells].map(([k, c]) => [k, { x: Math.round(c.c * SX), y: Math.round(c.r * SY) }]));
  return { at, GX, GY, SX, SY, grid };
}
// P262: 자동 정렬에서 rig 덩어리와 나머지(보통 세션 나무)를 어떻게 붙이는가.
//   SEP_F: 덩어리와 나머지 사이 = rig 칸 간격(GX·GY 가운데 큰 것) × SEP_F. 덩어리 안 간격보다 넓어야 눈이 두 무리로 나눠 읽는다.
//   ASPECT: 아래·오른쪽 가운데 합친 바깥이 이 비율(16:9, 캔버스 정리의 하위 열 접기 WRAP_ASPECT와 같은 값)에 가까운 쪽. 같으면 아래.
export const RIG_ARRANGE = { SEP_F: 1.25, ASPECT: 16 / 9 };
export const rigSep = (GX, GY) => Math.round(Math.max(GX, GY) * RIG_ARRANGE.SEP_F);
// rig: { w, h }(덩어리 바깥), rest: { w, h } | null, sep → { side: 'below' | 'right' | null, dx, dy }(나머지의 왼쪽 위를 덩어리 왼쪽 위에서 얼마나)
export function rigBeside(rig, rest, sep, aspect = RIG_ARRANGE.ASPECT) {
  if (!rest || !(rest.w > 0) || !(rest.h > 0)) return { side: null, dx: 0, dy: 0 };
  const cost = (w, h) => Math.abs(Math.log(w / h / aspect));
  const below = cost(Math.max(rig.w, rest.w), rig.h + sep + rest.h);
  const right = cost(rig.w + sep + rest.w, Math.max(rig.h, rest.h));
  return right < below - 1e-9 ? { side: 'right', dx: rig.w + sep, dy: 0 } : { side: 'below', dx: 0, dy: rig.h + sep };
}
