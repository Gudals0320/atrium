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
