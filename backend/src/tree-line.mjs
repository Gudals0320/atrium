// P75: 하위 세션 줄(ARCH K4, H7). 순수 함수만 둔다. 창(renderer)도 그대로 묶어 쓸 수 있다(node 모듈을 부르지 않는다).
// - 한 방향: 판의 나무는 왼쪽에서 오른쪽으로 자란다. 부모의 하위 세션은 부모 오른쪽 한 열에 위에서 아래로 띄운 순서대로 선다. 손자는 그 하위 세션 오른쪽 열.
//   열이 길어져도 격자로 접지 않는다(화면에 맞추는 것은 사람이 확대·축소로 한다).
// - 블록: 줄에 서는 단위. 노드 하나, 붙여 묶은 덩어리, 워크트리 상자(상자째) 가운데 하나다. 블록 사각형은 바깥 테두리(상자면 이름표와 여백까지)다.
// - 형제 블록은 저마다 자기 아래 나무(자손 블록)까지 감싼 띠(subtree)를 차지한다. 다음 형제는 앞 형제들 띠의 맨 아래 다음에 선다(정리 arrangeTree와 같은 모양).
import { overlaps, bbox, REGION_PAD, REGION_HEAD } from './canvas.mjs';

export const LINE_GAP_X = 200; // 부모와 하위 세션 열 사이. 선 위의 역할·상태 글이 접히지 않는 너비(창 labelFit 172 이상, P8)
export const LINE_GAP_Y = 80; // 줄 안 형제(의 띠) 사이

// 워크트리 상자 사각형: 안의 노드 하나를 감싼 영역(canvas.mjs regionRect와 같은 여백)
export const boxFrame = (r) => ({ x: r.x - REGION_PAD, y: r.y - REGION_PAD - REGION_HEAD, w: r.w + 2 * REGION_PAD, h: r.h + 2 * REGION_PAD + REGION_HEAD });
// P78: 상자 틀이 노드 둘레에 더하는 테두리(정리 arrangeTree의 pad)
export const BOX_PAD = { l: REGION_PAD, t: REGION_PAD + REGION_HEAD, r: REGION_PAD, b: REGION_PAD };
// 상자 사각형(왼쪽 위)에 든 노드 자리
export const frameInner = (f) => ({ x: f.x + REGION_PAD, y: f.y + REGION_PAD + REGION_HEAD });

// P200: 열 끝이 막혔을 때 아래로 끝없이 내려가지 않는다. 부모에게 가까운 빈 칸을 먼저 쓰고, 없으면 오른쪽에 새 열을 연다.
export const LINE_REACH = 1200; // 고른 칸의 위 끝이 부모(짝 나무) 아래 끝에서 이만큼보다 더 아래면 그 열은 막힌 것으로 본다(판 단위, 화면 한 장쯤)
export const LINE_COLS = 4; // 막혔을 때 오른쪽으로 열어 볼 열 수(첫 열 포함)

const finite = (r) => r && Number.isFinite(r.x) && Number.isFinite(r.y) && Number.isFinite(r.w) && Number.isFinite(r.h);
// 한 열(x)에서 [top, maxY] 안의 가장 위 빈 칸(y). rects: [{ r, gap }]. 빈 칸 후보는 top 아니면 어떤 사각형 아래 끝 + 그 간격이다
function topFree(x, size, rects, top, maxY) {
  const ys = [top];
  for (const { r, gap } of rects) if (r.x < x + size.w + gap && x < r.x + r.w + gap) ys.push(r.y + r.h + gap);
  ys.sort((p, q) => p - q);
  for (const y of ys) {
    if (y < top) continue;
    if (y > maxY) break;
    const c = { x, y, w: size.w, h: size.h };
    if (!rects.some(({ r, gap }) => overlaps(c, r, gap - 1))) return y;
  }
  return null;
}
// 열 x에서 세로 창 [y0, y1]에 걸친 것들의 오른쪽 끝 + gapX(다음 열의 x)
function nextColumn(x, size, rects, y0, y1, gapX) {
  let right = x; // 막은 것은 이 열과 가로로 겹치므로 오른쪽 끝이 x보다 크다(늘 오른쪽으로 나아간다)
  for (const { r, gap } of rects) if (r.x < x + size.w + gap && x < r.x + r.w + gap && r.y < y1 && r.y + r.h > y0) right = Math.max(right, r.x + r.w);
  return Math.round(right + gapX);
}
// 열 여럿을 차례로 본다: 첫 열(x0)부터 [top, limit] 안의 가장 위 칸, 없으면 오른쪽 새 열. 끝내 없으면 null.
// limit - top 높이 창은 reach로 잡혀 있고, 새 열로 건너는 너비도 열 너비 + gapX + reach까지만 본다
function searchColumns({ x0, size, rects, top, limit, winTop, gapX, cols, reach }) {
  let x = x0;
  for (let i = 0; i < cols; i++) {
    const y = topFree(x, size, rects, top, limit);
    if (y != null) return { x: Math.round(x), y: Math.round(y), col: i };
    const nx = nextColumn(x, size, rects, winTop, limit + size.h, gapX);
    if (nx - x > size.w + gapX + reach) return null; // 막은 것이 오른쪽으로도 화면 한 장 넘게 길면 그 너머로 건너지 않는다(아래로 멀리 가는 것과 같은 문제)
    x = nx;
  }
  return null;
}
// 옛 규칙(P75): y부터 그 자리에 다른 것이 있으면 그 아래로 잇는다. 모든 열이 막혔을 때만 쓴다
function slideDown(x, y, size, os, gap) {
  for (let i = 0; i < 10000; i++) {
    const c = { x, y, w: size.w, h: size.h };
    const hit = os.filter((r) => overlaps(c, r, gap - 1));
    if (!hit.length) break;
    y = Math.max(...hit.map((r) => r.y + r.h)) + gap;
  }
  return { x: Math.round(x), y: Math.round(y) };
}

// 새 하위 세션 블록의 자리(왼쪽 위). parent: 부모 블록 사각형(줄의 x와 시작 높이), bands: 이미 줄에 선 형제들의 띠(자기 나무까지 감싼 사각형),
// size: 새 블록 크기, obstacles: 피할 사각형(노드, 메모·칸반, 상자 …). 다른 노드는 옮기지 않는다.
// P200: 첫 열(부모 오른쪽 + gapX)에서 부모 위 끝부터 아래로 새 블록이 들어가는 가장 위 빈 칸을 고른다(형제 띠 사이의 빈 곳도 칸이다. 부모 위 끝보다 위는 보지 않는다).
//   칸의 위 끝이 max(부모 아래 끝, 줄 끝) + reach보다 아래면 막힌 열로 보고, 그 열의 세로 창(부모 위 끝 ~ 그 상한)에 걸친 것들 오른쪽에 새 열을 연다(cols 열까지).
//   끝내 없으면 옛 자리(첫 열의 줄 끝, 그 자리에 다른 것이 있으면 그 아래로)
export function lineSlot({ parent, bands = [], size, obstacles = [], gapX = LINE_GAP_X, gapY = LINE_GAP_Y, gap = gapY, reach = LINE_REACH, cols = LINE_COLS }) {
  if (!parent || !size) return null;
  const x = Math.round(parent.x + parent.w + gapX);
  const bs = bands.filter(finite);
  const os = obstacles.filter(finite);
  // 형제 띠도 피한다(띠는 줄 밀기 pushLine이 보는 사각형이라, 그 안에 서면 다음 줄 밀기에 밀린다)
  const rects = [...bs.map((r) => ({ r, gap: gapY })), ...os.map((r) => ({ r, gap }))];
  // 상한은 부모 아래 끝과 줄 끝(형제 띠 아래 끝) 가운데 아래쪽부터 잰다. 다른 것에 막히지 않은 긴 줄은 접지 않는다(P9·P75: 격자로 접지 않는다)
  const end = bs.length ? Math.max(...bs.map((r) => r.y + r.h)) : -Infinity;
  const at = searchColumns({ x0: x, size, rects, top: parent.y, limit: Math.max(parent.y + parent.h, end) + reach, winTop: parent.y, gapX, cols, reach });
  if (at) return { x: at.x, y: at.y };
  const y = bs.length ? end + gapY : parent.y;
  return slideDown(x, y, size, os, gap);
}

// P175: 동료로 띄운 세션(atrium child --peer)의 자리(왼쪽 위). 정리(arrangeTree P177)와 같은 자리: 짝(partner)과 같은 x, 짝의 나무 띠(band) 바로 아래.
// gap: 짝이 누군가의 하위면 같은 줄의 형제 사이(LINE_GAP_Y), 짝이 뿌리면 나무 사이(정리의 gapY * 2). 다른 노드는 옮기지 않는다.
// P200: 짝 나무 아래(띠 아래 끝 + gap)부터 가장 위 빈 칸. line: 짝 아래에 이미 선 동료들. 칸의 위 끝이 max(띠 아래 끝, 동료 줄 끝) + reach보다 아래면 막힌 것으로 보고, 짝 나무 아래 창에 걸친 것들 오른쪽에 새 열을 연다
//   (여전히 짝 나무 아래 높이라서 짝의 하위 줄에 끼어들지 않는다. 정리를 누르면 짝과 같은 x로 돌아간다). 끝내 없으면 옛 자리(짝 x, 그 아래로 잇기)
export function peerSlot({ partner, band = null, line = [], size, obstacles = [], gap = LINE_GAP_Y, gapX = LINE_GAP_X, reach = LINE_REACH, cols = LINE_COLS }) {
  if (!partner || !size) return null;
  const x = Math.round(partner.x);
  const top = band || partner;
  const bottom = top.y + top.h;
  const os = obstacles.filter(finite);
  const rects = os.map((r) => ({ r, gap: LINE_GAP_Y }));
  const ls = line.filter(finite); // 짝 나무 아래에 이미 선 동료들. 상한은 그 줄 끝부터 잰다(다른 것에 막히지 않은 동료 줄은 접지 않는다)
  const end = Math.max(bottom, ...ls.map((r) => r.y + r.h));
  const at = searchColumns({ x0: x, size, rects, top: bottom + gap, limit: end + reach, winTop: bottom, gapX, cols, reach });
  if (at) return { x: at.x, y: at.y };
  return slideDown(x, bottom + gap, size, os, LINE_GAP_Y);
}

// 줄 밀기: units([{ id, rect }], 띄운 순서)를 차례로 보며, 앞의 것과 겹치면(gap 안) 그 아래로만 민다. 당기지 않는다(자리가 갑자기 움직이지 않게).
// → Map id → dy(민 것만). 줄의 순서는 바뀌지 않는다(뒤의 것만 아래로 간다)
export function pushLine(units, { gap = LINE_GAP_Y } = {}) {
  const out = new Map();
  const placed = [];
  for (const u of units || []) {
    if (!u || !u.rect) continue;
    const r = { ...u.rect };
    let dy = 0;
    for (let i = 0; i < 10000; i++) {
      const hit = placed.filter((p) => overlaps(r, p, gap - 1));
      if (!hit.length) break;
      const need = Math.max(...hit.map((p) => p.y + p.h + gap)) - r.y;
      if (need <= 0) break;
      r.y += need; dy += need;
    }
    placed.push(r);
    if (dy) out.set(u.id, Math.round(dy));
  }
  return out;
}

// 블록 나무. blocks: [{ id, x, y, w, h, members: [sessionId] }], rowOf(sid) → { parentSessionId, createdAt } | null
// → { byId, blockOf: Map sid → 블록 ID, parent: Map 블록 → 부모 블록, kids: Map 블록 → [자식 블록](띄운 순서), rank: Map 블록 → 띄운 때 }
// 블록의 머리: 부모가 그 블록 밖에 있는 구성 세션. 머리가 여럿이면 먼저 띄운 것의 부모를 따른다. 고리는 끊는다
export function blockTree(blocks, rowOf) {
  const byId = new Map(blocks.map((x) => [x.id, x]));
  const blockOf = new Map();
  for (const x of blocks) for (const m of x.members || []) blockOf.set(m, x.id);
  const parent = new Map(), rank = new Map();
  for (const x of blocks) {
    const heads = (x.members || []).map((m) => ({ m, r: rowOf(m) || {} })).filter(({ r }) => !r.parentSessionId || blockOf.get(r.parentSessionId) !== x.id);
    heads.sort((a, c) => (a.r.createdAt || 0) - (c.r.createdAt || 0) || String(a.m).localeCompare(String(c.m)));
    const at = (x.members || []).map((m) => (rowOf(m) || {}).createdAt || 0);
    rank.set(x.id, heads.length ? heads[0].r.createdAt || 0 : at.length ? Math.min(...at) : 0);
    const h = heads.find(({ r }) => r.parentSessionId && blockOf.has(r.parentSessionId));
    if (h) parent.set(x.id, blockOf.get(h.r.parentSessionId));
  }
  // 고리 끊기
  for (const id of [...parent.keys()]) {
    const seen = new Set([id]);
    for (let p = parent.get(id); p; p = parent.get(p)) { if (seen.has(p)) { parent.delete(id); break; } seen.add(p); }
  }
  const kids = new Map();
  for (const [c, p] of parent) { if (!kids.has(p)) kids.set(p, []); kids.get(p).push(c); }
  for (const list of kids.values()) list.sort((a, c) => rank.get(a) - rank.get(c) || String(a).localeCompare(String(c)));
  return { byId, blockOf, parent, kids, rank };
}
// 블록과 그 아래 모든 블록의 ID
export function subtreeIds(tree, id) {
  const out = [];
  const seen = new Set();
  const walk = (x) => { if (seen.has(x)) return; seen.add(x); out.push(x); for (const k of tree.kids.get(x) || []) walk(k); };
  walk(id);
  return out;
}
// 블록이 차지하는 띠(자기 나무까지 감싼 사각형)
export const bandOf = (tree, id) => bbox(subtreeIds(tree, id).map((k) => tree.byId.get(k)));
// 줄에 선 형제: 부모 블록 오른쪽에 있는 자식 블록(사람이 부모 왼쪽으로 옮긴 것은 줄 밖으로 본다)
export function lineKids(tree, pid) {
  const p = tree.byId.get(pid);
  if (!p) return [];
  return (tree.kids.get(pid) || []).filter((k) => { const r = tree.byId.get(k); return r && r.x >= p.x + p.w - 1; });
}
