// P75: 하위 세션 줄(ARCH K4, H7). 순수 함수만 둔다. 창(renderer)도 그대로 묶어 쓸 수 있다(node 모듈을 부르지 않는다).
// - 한 방향: 판의 나무는 왼쪽에서 오른쪽으로 자란다. 부모의 하위 세션은 부모 오른쪽 한 열에 위에서 아래로 띄운 순서대로 선다. 손자는 그 하위 세션 오른쪽 열.
//   P200: 새 하위가 설 칸이 부모 아래 끝 + LINE_REACH보다 아래면(형제 줄이 길거나 다른 것에 막혀서) 오른쪽에 새 열을 연다(정리 P91이 긴 열을 나누는 것과 같은 뜻).
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
// 새 하위 세션 블록의 자리(왼쪽 위). parent: 부모 블록 사각형(줄의 x와 시작 높이), bands: 이미 줄에 선 형제들의 띠(자기 나무까지 감싼 사각형),
// size: 새 블록 크기, obstacles: 피할 사각형(노드, 메모·칸반, 상자 …). 다른 노드는 옮기지 않는다.
// P200: 첫 열(부모 오른쪽 + gapX)에서 부모 위 끝부터 아래로 새 블록이 들어가는 가장 위 빈 칸을 고른다(형제 띠 사이의 빈 곳도 칸이다. 부모 위 끝보다 위는 보지 않는다).
//   칸의 위 끝이 부모 아래 끝 + reach보다 아래면 막힌 열로 보고(형제 줄이 길어서 그런 것도 같다: 정리 P91처럼 긴 열은 나눈다), 그 열의 세로 창(부모 위 끝 ~ 그 상한)에 걸친 것들 오른쪽에 새 열을 연다(cols 열까지).
//   P350: 끝내 없으면 첫 열의 줄 끝(형제 띠 맨 아래 다음)에 선다. 그 자리의 것은 띄운 뒤 줄 밀기(reflowLines, 뿌리 줄까지)가 아래로 민다.
//   전에는 그 자리에서 다른 것에 닿지 않을 때까지 아래로 내려가(slideDown) 판 끝(수천~만 px 아래)에 서곤 했다
// P350(2단계, keep): 정리 모양 지키기. 1) 줄 안의 빈 칸(닫힌 하위가 비운 자리, 줄 끝보다 위) 2) 줄의 마지막 열 끝(정리가 접은 열 순서, 부모 아래 끝 + reach 안이면, push)
//   3) P200 새 열 4) 첫 열 줄 끝(push). 2)에서 그 자리의 것(아래 나무)은 띄운 쪽의 줄 밀기가 나무째 민다
export function lineSlot({ parent, bands = [], size, obstacles = [], gapX = LINE_GAP_X, gapY = LINE_GAP_Y, gap = gapY, reach = LINE_REACH, cols = LINE_COLS, keep = false, pinned = [] }) {
  if (!parent || !size) return null;
  // P350: 밀어 자리를 내는 자리(push)라도 핀 꽂힌 노드(사람이 옮긴 것, 밀지 않는다)와는 겹치지 않게. 겹치면 그 아래로
  const ps = pinned.filter(finite);
  const clearPins = (c) => { let y = c.y; for (let i = 0; i < 1000; i++) { const hit = ps.filter((r) => overlaps({ x: c.x, y, w: size.w, h: size.h }, r, gap - 1)); if (!hit.length) break; y = Math.max(...hit.map((r) => r.y + r.h)) + gap; } return { ...c, y: Math.round(y) }; };
  const x = Math.round(parent.x + parent.w + gapX);
  const bs = bands.filter(finite);
  const os = obstacles.filter(finite);
  // 형제 띠도 피한다(띠는 줄 밀기 pushLine이 보는 사각형이라, 그 안에 서면 다음 줄 밀기에 밀린다)
  const rects = [...bs.map((r) => ({ r, gap: gapY })), ...os.map((r) => ({ r, gap }))];
  if (keep && bs.length) {
    const lastX = Math.max(...bs.map((r) => r.x));
    const lineEnd = Math.max(...bs.map((r) => r.y + r.h));
    for (const cx of [...new Set(bs.map((r) => Math.round(r.x)))].sort((p, q) => p - q)) { const y = topFree(cx, size, rects, parent.y, lineEnd - size.h); if (y != null) return { x: cx, y: Math.round(y) }; }
    const col = bs.filter((r) => Math.round(r.x) === Math.round(lastX));
    const y = Math.max(...col.map((r) => r.y + r.h)) + gapY;
    const c = clearPins({ x: Math.round(lastX), y: Math.round(y), push: true });
    if (c.y <= parent.y + parent.h + reach) return c;
  }
  const at = searchColumns({ x0: x, size, rects, top: parent.y, limit: parent.y + parent.h + reach, winTop: parent.y, gapX, cols, reach });
  if (at) return { x: at.x, y: at.y };
  const y = bs.length ? Math.max(...bs.map((r) => r.y + r.h)) + gapY : parent.y;
  return clearPins({ x, y: Math.round(y), push: true });
}

// P175: 동료로 띄운 세션(atrium child --peer)의 자리(왼쪽 위). 정리(arrangeTree P177)와 같은 자리: 짝(partner)과 같은 x, 짝의 나무 띠(band) 바로 아래.
// gap: 짝이 누군가의 하위면 같은 줄의 형제 사이(LINE_GAP_Y), 짝이 뿌리면 나무 사이(정리의 gapY * 2). 다른 노드는 옮기지 않는다.
// P200: 짝 나무 아래(띠 아래 끝 + gap)부터 가장 위 빈 칸. 칸의 위 끝이 띠 아래 끝 + reach보다 아래면 막힌 것으로 보고, 짝 나무 아래 창에 걸친 것들 오른쪽에 새 열을 연다
//   (여전히 짝 나무 아래 높이라서 짝의 하위 줄에 끼어들지 않는다. 정리를 누르면 짝과 같은 x로 돌아간다).
//   P350: 끝내 없으면 짝 나무 바로 아래(짝 x)에 선다(push: 띄운 쪽이 뿌리 줄 밀기로 자리를 낸다). 전에는 아래로 끝없이 내려갔다(slideDown)
export function peerSlot({ partner, band = null, size, obstacles = [], gap = LINE_GAP_Y, gapX = LINE_GAP_X, reach = LINE_REACH, cols = LINE_COLS }) {
  if (!partner || !size) return null;
  const x = Math.round(partner.x);
  const top = band || partner;
  const bottom = top.y + top.h;
  const os = obstacles.filter(finite);
  const rects = os.map((r) => ({ r, gap: LINE_GAP_Y }));
  const at = searchColumns({ x0: x, size, rects, top: bottom + gap, limit: bottom + reach, winTop: bottom, gapX, cols, reach });
  if (at) return { x: at.x, y: at.y };
  return { x, y: Math.round(bottom + gap), push: true };
}

// 줄 밀기: units([{ id, rect }], 띄운 순서)를 차례로 보며, 앞의 것과 겹치면(gap 안) 그 아래로만 민다. 당기지 않는다(자리가 갑자기 움직이지 않게).
// → Map id → dy(민 것만). 줄의 순서는 바뀌지 않는다(뒤의 것만 아래로 간다)
// P206: unit에 own(블록 자기 사각형)과 parts(자기 나무의 블록 사각형들)가 있으면, 블록끼리 가로로 겹치지 않는 형제(P200이 접어 연 다른 열)는
//   띠(나무를 감싼 사각형)가 아니라 실제 블록이 겹칠 때만 민다. 앞 열 형제의 손자가 다음 열과 같은 x에 서도(빈 칸이라 겹치지 않으면) 다음 열 형제를 밀지 않는다
const sameColumn = (a, b) => !a.own || !b.own || (a.own.x < b.own.x + b.own.w && b.own.x < a.own.x + a.own.w);
const shiftY = (r, dy) => ({ ...r, y: r.y + dy });
export function pushLine(units, { gap = LINE_GAP_Y } = {}) {
  const out = new Map();
  const placed = [];
  for (const u of units || []) {
    if (!u || !u.rect) continue;
    if (u.pinned) { placed.push({ rect: u.rect, own: u.own || null, parts: u.parts || null }); continue; } // P350: 핀 꽂힌 나무는 그대로(뒤의 것이 그 아래로 피한다)
    let dy = 0;
    for (let i = 0; i < 10000; i++) {
      const r = shiftY(u.rect, dy);
      let need = 0;
      for (const p of placed) {
        if (sameColumn(u, p)) { if (overlaps(r, p.rect, gap - 1)) need = Math.max(need, p.rect.y + p.rect.h + gap - r.y); continue; }
        // 다른 열: 실제 블록끼리만
        for (const q of u.parts || [u.rect]) {
          const qq = shiftY(q, dy);
          for (const o of p.parts || [p.rect]) if (overlaps(qq, o, gap - 1)) need = Math.max(need, o.y + o.h + gap - qq.y);
        }
      }
      if (need <= 0) break;
      dy += need;
    }
    placed.push({ rect: shiftY(u.rect, dy), own: u.own ? shiftY(u.own, dy) : null, parts: u.parts ? u.parts.map((q) => shiftY(q, dy)) : null });
    if (dy) out.set(u.id, Math.round(dy));
  }
  return out;
}

// P350(2단계): 부모 없이 띄운 세션의 자리. 정리가 혼자인 블록을 늘어놓는 줄(영역 아래 끝, 왼쪽부터 한 줄, 너비 maxW에서 줄 바꿈)의 끝.
// roots: [{ x, y, w, h, lone }](그 영역 본 저장소 쪽 뿌리 블록, lone: 하위가 없다), left: 줄의 왼쪽 끝 → { x, y }
export function looseSlot({ roots = [], size, left = null, maxW = 2400, gap = 40, gapY = LINE_GAP_Y, pinned = [] }) {
  const rs = roots.filter(finite);
  if (!rs.length) return null;
  const out = looseRaw({ rs, size, left, maxW, gap, gapY });
  // P350: 핀 꽂힌 노드(사람이 옮긴 것)와 겹치면 그 아래 왼쪽 끝으로
  const ps = pinned.filter(finite);
  let c = { ...out };
  for (let i = 0; i < 1000; i++) { const hit = ps.filter((r) => overlaps({ ...c, w: size.w, h: size.h }, r, gap - 1)); if (!hit.length) break; c = { x: Math.round(left ?? Math.min(...rs.map((r) => r.x))), y: Math.round(Math.max(...hit.map((r) => r.y + r.h)) + gapY) }; }
  return c;
}
function looseRaw({ rs, size, left, maxW, gap, gapY }) {
  const x0 = left ?? Math.min(...rs.map((r) => r.x));
  const lone = rs.filter((r) => r.lone);
  const bottom = Math.max(...rs.map((r) => r.y + r.h));
  if (lone.length) {
    const lastY = Math.max(...lone.map((r) => r.y));
    const row = lone.filter((r) => r.y === lastY);
    const right = Math.max(...row.map((r) => r.x + r.w));
    const rowBottom = Math.max(...row.map((r) => r.y + r.h));
    // 줄이 판 아래 끝에 있을 때만 그 줄에 잇는다(나무 사이에 낀 혼자인 블록 줄은 줄로 보지 않는다)
    if (rowBottom >= bottom - 1) {
      if (right + gap + size.w - x0 <= Math.max(maxW, size.w)) { const c = { x: right + gap, y: lastY, w: size.w, h: size.h }; if (!rs.some((r) => overlaps(c, r, gap - 1))) return { x: Math.round(c.x), y: Math.round(c.y) }; }
      return { x: Math.round(x0), y: Math.round(rowBottom + gapY) };
    }
  }
  return { x: Math.round(x0), y: Math.round(bottom + gapY * 2) };
}

// P350: 씨앗(seeds: 커지거나 새로 선 유닛 ID)에서 시작하는 줄 밀기. units는 pushLine과 같은 꼴이다.
// 씨앗과 이미 민 유닛에 겹치는(gap 안) 유닛만 그 아래로 민다. 씨앗보다 위(윗변이 씨앗 윗변보다 위)는 보지 않는다.
// 씨앗과 상관없이 전부터 겹쳐 있던 유닛끼리는 그대로 둔다(사람이 둔 자리를 건드리지 않는다). → Map id → dy(민 것만)
export function pushFrom(units, seeds, { gap = LINE_GAP_Y } = {}) {
  const list = (units || []).filter((u) => u && u.rect);
  const seedSet = new Set(seeds || []);
  // was: 밀기 전 사각형(씨앗은 지금 사각형. 씨앗이 커지기 전 자리는 모른다)
  const active = list.filter((u) => seedSet.has(u.id)).map((u) => ({ id: u.id, rect: u.rect, was: u.was || u.rect, own: u.own || null, parts: u.parts || null }));
  if (!active.length) return new Map();
  const top = Math.min(...active.map((a) => a.rect.y));
  const rest = list.filter((u) => !seedSet.has(u.id) && u.rect.y >= top).sort((p, q) => p.rect.y - q.rect.y || p.rect.x - q.rect.x);
  const out = new Map();
  const pins = rest.filter((u) => u.pinned).map((u) => ({ id: u.id, rect: u.rect, was: u.rect, own: u.own || null, parts: u.parts || null }));
  for (const u of rest) {
    if (u.pinned) continue; // P350: 핀 꽂힌 것(사람이 옮긴 것)은 밀지 않는다. 밀린 것이 그 위에 서면 그 아래로 더 간다
    let dy = 0;
    for (let i = 0; i < 10000; i++) {
      const r = shiftY(u.rect, dy);
      let need = 0;
      for (const p of dy > 0 ? [...active, ...pins] : active) {
        // 같은 열: 전에 그 아래에 있던 것은 전의 틈(gap 이상, gap × 4까지. 정리의 나무 사이 160)을 지킨다
        const keep = u.rect.y >= p.was.y + p.was.h ? Math.min(Math.max(gap, u.rect.y - (p.was.y + p.was.h)), gap * 4) : gap;
        if (sameColumn(u, p)) { if (overlaps(r, p.rect, keep - 1)) need = Math.max(need, p.rect.y + p.rect.h + keep - r.y); continue; }
        for (const q of u.parts || [u.rect]) {
          const qq = shiftY(q, dy);
          for (const o of p.parts || [p.rect]) if (overlaps(qq, o, gap - 1)) need = Math.max(need, o.y + o.h + gap - qq.y);
        }
      }
      if (need <= 0) break;
      dy += need;
    }
    if (dy) { out.set(u.id, Math.round(dy)); active.push({ id: u.id, rect: shiftY(u.rect, dy), was: u.rect, own: u.own ? shiftY(u.own, dy) : null, parts: u.parts ? u.parts.map((q) => shiftY(q, dy)) : null }); }
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
