// 미션 맵 배치(I6, P32): 왼쪽에서 오른쪽으로 펼치는 나무. 순수 함수만 둔다(단위 시험: test/p32-lib.test.mjs).
// - 0열은 사람(명령 바). 세션은 "지시하는 쪽" 오른쪽에 놓인다(부모 → 자식). 부모는 자식들의 가운데 높이에 온다(정돈된 나무라 상자가 겹치지 않는다).
// - 한 쌍(A → B) 사이의 선 여럿(역할, 지시, 띄움, 명령 바, 루프)은 선 하나로 모은다. 모양은 가장 앞선 종류(역할 > 지시 > 띄움 > 명령 바 > 루프)를 따른다.
// - 나무 부모: 하위 세션의 부모(parentId) > 역할 > 띄움 > 지시 > 사람(명령 바, 루프). 고리가 생기는 부모는 고르지 않는다.
//   지시를 내리지만 받지는 않는 세션은 사람 아래(선 없이) 1열에 둔다. 선이 하나도 없는 세션은 아래 "연결 없음" 칸에 격자로 놓는다.
// - 나무에 들지 못한 선(두 번째 지시자, 같은 열, 뒤로 가는 선)도 긋되 이름표 없이 점만 둔다(올리면 풀이).
// - 이름표는 받는 상자 바로 왼쪽, 선의 끝 높이에 둔다. 받는 쪽마다 끝 높이를 나눠(최대 maxPorts) 이름표끼리 겹치지 않는다.
// - 거르기(filter)를 받으면 그 분류의 세션과 그 조상(흐리게, ghost)만 남긴다.
// → { boxes: Map id → { x, y, w, h, node, ghost, depth }, edges: [...], loose: [id], section: { y } | null, width, height, columns }

export const MISSION = { boxW: 236, boxH: 56, colGap: 156, rowGap: 12, pad: 28, sectionGap: 40, sectionHead: 28, gridGap: 20, portGap: 18, maxPorts: 3, labelW: 116, minGridCols: 3 };
export const EDGE_ORDER = ['role', 'prompt', 'spawn', 'bar', 'loop'];
const PARENT_RANK = { parent: 0, role: 1, spawn: 2, prompt: 3, bar: 4, loop: 5 };
const byName = (a, b) => String(a.name || '').localeCompare(String(b.name || '')) || String(a.id).localeCompare(String(b.id));

// 한 쌍의 선들을 하나로: { id, from, to, kinds, primary, role, text, count, lastAt, active, status }
export function mergeEdges(edges, has = () => true) {
  const pairs = new Map();
  for (const e of edges || []) {
    if (!e || e.from === e.to || !has(e.from) || !has(e.to)) continue;
    const k = `${e.from}>${e.to}`;
    const p = pairs.get(k) || { id: k, from: e.from, to: e.to, kinds: [], parts: [], role: null, text: null, count: 0, lastAt: 0, active: false };
    if (!p.kinds.includes(e.kind)) p.kinds.push(e.kind);
    p.parts.push(e);
    if (e.kind === 'role' && e.label) p.role = e.label;
    if ((e.kind === 'prompt' || e.kind === 'bar' || e.kind === 'loop') && e.label && (e.lastAt || 0) >= p.lastAt) p.text = e.label;
    if (e.kind !== 'spawn') p.count += e.count || 0;
    p.lastAt = Math.max(p.lastAt, e.lastAt || 0);
    if (e.active) p.active = true;
    pairs.set(k, p);
  }
  for (const p of pairs.values()) {
    p.kinds.sort((a, b) => rank(a) - rank(b));
    p.primary = p.kinds[0];
  }
  return [...pairs.values()];
}
const rank = (k) => { const i = EDGE_ORDER.indexOf(k); return i < 0 ? EDGE_ORDER.length : i; };

export function missionLayout(graph, { filter = 'all' } = {}) {
  const L = MISSION;
  const all = graph.nodes || [];
  const human = all.find((n) => n.kind === 'human') || null;
  const sessions = all.filter((n) => n.kind === 'session');
  const byId = new Map(all.map((n) => [n.id, n]));
  const pairs = mergeEdges(graph.edges, (id) => byId.has(id));
  // 하위 세션인데 띄움 선이 없으면(옛 판) 부모 → 자식 쌍을 하나 만든다
  for (const s of sessions) if (s.parentId && byId.has(s.parentId) && !pairs.some((p) => p.from === s.parentId && p.to === s.id)) pairs.push({ id: `${s.parentId}>${s.id}`, from: s.parentId, to: s.id, kinds: ['spawn'], primary: 'spawn', parts: [], role: s.role || null, text: null, count: 0, lastAt: 0, active: false, synthetic: true });

  // 나무 부모 고르기(고리 막기)
  const parent = new Map();
  const ancestorOf = (a, b) => { for (let x = b, i = 0; x && i < 1000; x = parent.get(x), i++) if (x === a) return true; return false; };
  const incoming = new Map();
  for (const p of pairs) { if (!incoming.has(p.to)) incoming.set(p.to, []); incoming.get(p.to).push(p); }
  const pRank = (s, p) => (p.from === s.parentId ? PARENT_RANK.parent : Math.min(...p.kinds.map((k) => PARENT_RANK[k] ?? 9)));
  for (const s of [...sessions].sort(byName)) {
    const cands = (incoming.get(s.id) || []).slice().sort((a, b) => pRank(s, a) - pRank(s, b) || byName(byId.get(a.from), byId.get(b.from)));
    for (const c of cands) if (!ancestorOf(s.id, c.from)) { parent.set(s.id, c.from); break; }
  }
  const touched = new Set();
  for (const p of pairs) { touched.add(p.from); touched.add(p.to); }
  const hid = human ? human.id : '__human';
  // 지시만 내리는 세션(부모 없음)은 사람 아래에
  for (const s of sessions) if (!parent.has(s.id) && touched.has(s.id)) parent.set(s.id, hid);

  // 거르기: 맞는 세션과 그 조상
  const match = (n) => filter === 'all' || n.category === filter;
  const visible = new Set(), ghost = new Set();
  for (const s of sessions) {
    if (!match(s)) continue;
    visible.add(s.id);
    for (let x = parent.get(s.id), i = 0; x && x !== hid && i < 1000; x = parent.get(x), i++) if (!visible.has(x)) { visible.add(x); ghost.add(x); }
  }
  for (const g of ghost) if (match(byId.get(g))) ghost.delete(g);

  const kids = new Map();
  const tree = [], loose = [];
  for (const s of sessions) {
    if (!visible.has(s.id)) continue;
    if (parent.has(s.id)) { const p = parent.get(s.id); if (!kids.has(p)) kids.set(p, []); kids.get(p).push(s); tree.push(s); }
    else loose.push(s);
  }
  for (const k of kids.values()) k.sort(byName);
  loose.sort(byName);

  const boxes = new Map();
  const colX = (d) => L.pad + d * (L.boxW + L.colGap);
  const step = L.boxH + L.rowGap;
  let row = 0, maxDepth = 0;
  const top = L.pad;
  // 정돈된 나무: 잎은 다음 줄, 부모는 첫째와 끝 자식의 가운데
  const place = (id, node, depth, seen) => {
    if (seen.has(id)) return null; seen.add(id);
    maxDepth = Math.max(maxDepth, depth);
    const ch = (kids.get(id) || []);
    let y;
    if (!ch.length) { y = top + row * step; row++; }
    else {
      const ys = ch.map((c) => place(c.id, c, depth + 1, seen)).filter((v) => v != null);
      y = ys.length ? (ys[0] + ys[ys.length - 1]) / 2 : top + (row++) * step;
    }
    if (node) boxes.set(id, { x: colX(depth), y, w: L.boxW, h: L.boxH, node, ghost: ghost.has(id), depth });
    return y;
  };
  const showHuman = tree.length > 0 && human;
  if (tree.length) place(hid, showHuman ? human : null, 0, new Set());
  // 사람은 0열에 혼자다. 지시만 내리는 세션까지 다 모은 가운데보다, 실제로 선이 가는 세션들의 가운데에 둔다
  if (showHuman) {
    const ys = pairs.filter((p) => p.from === hid && boxes.has(p.to) && boxes.get(p.to).depth === 1).map((p) => boxes.get(p.to).y);
    if (ys.length) boxes.get(hid).y = (Math.min(...ys) + Math.max(...ys)) / 2;
  }
  const treeBottom = row ? top + row * step - L.rowGap : top;

  // 연결 없음 칸
  let section = null;
  const columns = tree.length ? maxDepth + 1 : 0;
  const treeW = columns ? L.pad * 2 + columns * L.boxW + (columns - 1) * L.colGap : 0;
  let gridW = 0, bottom = treeBottom;
  if (loose.length) {
    const fitCols = Math.max(L.minGridCols, Math.floor((Math.max(treeW, 0) - L.pad * 2 + L.gridGap) / (L.boxW + L.gridGap)));
    const cols = Math.min(loose.length, fitCols);
    const y0 = tree.length ? treeBottom + L.sectionGap : top;
    section = { y: y0, x: L.pad };
    loose.forEach((s, i) => {
      const c = i % cols, r = Math.floor(i / cols);
      boxes.set(s.id, { x: L.pad + c * (L.boxW + L.gridGap), y: y0 + L.sectionHead + r * step, w: L.boxW, h: L.boxH, node: s, ghost: false, depth: null, loose: true });
    });
    gridW = L.pad * 2 + cols * L.boxW + (cols - 1) * L.gridGap;
    bottom = y0 + L.sectionHead + Math.ceil(loose.length / cols) * step - L.rowGap;
  }

  // 선: 보이는 상자 사이만. 나무 선은 이름표, 나머지는 점
  const shown = pairs.filter((p) => boxes.has(p.from) && boxes.has(p.to));
  const isTree = (p) => parent.get(p.to) === p.from;
  const inPorts = new Map(), outPorts = new Map();
  for (const p of shown) {
    const a = boxes.get(p.from), b = boxes.get(p.to);
    if (b.x > a.x) { push(inPorts, p.to, p); push(outPorts, p.from, p); }
  }
  const cy = (id) => boxes.get(id).y + L.boxH / 2;
  const portY = new Map();
  for (const [id, list] of inPorts) {
    // 나무 선이 먼저(가운데), 나머지는 위아래로. 이름표는 앞 maxPorts개만
    list.sort((a, b) => (isTree(b) - isTree(a)) || cy(a.from) - cy(b.from));
    const n = Math.min(list.length, L.maxPorts);
    const order = list.slice(0, n).sort((a, b) => cy(a.from) - cy(b.from));
    order.forEach((p, i) => portY.set(`in:${p.id}`, cy(id) + (i - (n - 1) / 2) * L.portGap));
    list.slice(n).forEach((p) => portY.set(`in:${p.id}`, cy(id)));
    list.forEach((p, i) => { p._labelled = i < n; });
  }
  for (const [id, list] of outPorts) {
    list.sort((a, b) => cy(a.to) - cy(b.to));
    const span = Math.min(L.boxH - 16, (list.length - 1) * 8);
    list.forEach((p, i) => portY.set(`out:${p.id}`, cy(id) + (list.length > 1 ? -span / 2 + (span * i) / (list.length - 1) : 0)));
  }
  const edges = shown.map((p) => {
    const a = boxes.get(p.from), b = boxes.get(p.to);
    let d, lx, ly, label = false, back = false;
    if (b.x > a.x) {
      const x1 = a.x + a.w, y1 = portY.get(`out:${p.id}`), x2 = b.x, y2 = portY.get(`in:${p.id}`);
      const dx = Math.max(30, (x2 - x1) * 0.5);
      d = `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
      lx = x2 - 12; ly = y2;
      label = !!p._labelled && b.x - (a.x + a.w) >= L.labelW;
    } else if (b.x === a.x) {
      // 같은 열: 오른쪽으로 둥글게 돌아 받는 상자 오른쪽으로
      back = true;
      const x1 = a.x + a.w, y1 = cy(p.from) + 8, x2 = b.x + b.w, y2 = cy(p.to) - 8, bulge = 36 + Math.min(60, Math.abs(y2 - y1) / 5);
      d = `M${x1},${y1} C${x1 + bulge},${y1} ${x2 + bulge},${y2} ${x2},${y2}`;
      lx = x1 + bulge * 0.75; ly = (y1 + y2) / 2;
    } else {
      back = true;
      const x1 = a.x, y1 = cy(p.from) + 10, x2 = b.x + b.w, y2 = cy(p.to) + 10, dx = Math.max(40, (x1 - x2) / 2);
      d = `M${x1},${y1} C${x1 - dx},${y1 + 30} ${x2 + dx},${y2 + 30} ${x2},${y2}`;
      lx = (x1 + x2) / 2; ly = (y1 + y2) / 2 + 22;
    }
    const { parts, _labelled, ...rest } = p; // eslint-disable-line no-unused-vars
    return { ...rest, d, lx, ly, label, back, tree: isTree(p) };
  });
  const width = Math.max(treeW, gridW, L.pad * 2 + L.boxW);
  return { boxes, edges, loose: loose.map((s) => s.id), section, width, height: bottom + L.pad, columns };
}
function push(m, k, v) { if (!m.has(k)) m.set(k, []); m.get(k).push(v); }

// 이름표 글(사전 함수 t를 받는다): 역할이면 역할 이름, 아니면 종류 이름. 횟수가 둘 이상이면 ×n
export function edgeLabel(e, t) {
  const base = e.role || t(`mission.edge.${e.primary}`);
  return e.count > 1 && e.primary !== 'role' ? `${base} ×${e.count}` : base;
}
