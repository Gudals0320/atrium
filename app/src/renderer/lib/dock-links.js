// 덩어리 안 연결선(P23 겹친 선, P26 초점 세션)의 순수 함수(단위 시험 app/test/p26-lib.test.mjs). 부르는 곳은 Docks.jsx DockLinks.
// - 보통은 두 세션 노드의 가운데 점끼리 잇는다.
// - 덩어리 안 한 세션이 초점이면(고름, 눌러 들어감, 화면 가운데에서 보는 중) 그 세션에 닿는 선은 그 세션 쪽 끝을
//   테두리 가운데(상대 쪽 방향의 위·아래·왼쪽·오른쪽 가운데)로 옮기고, 상대 쪽 끝은 상대의 가운데 점이다. 초점 세션의 터미널을 덜 가린다.

export const centerOf = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

// 사각형 r의 테두리 가운데 중 점 p 쪽(가운데에서 p로 가는 선이 지나는 쪽)
// → { x, y, side: 'left' | 'right' | 'top' | 'bottom' }
export function borderAnchor(r, p) {
  const c = centerOf(r);
  const dx = p.x - c.x, dy = p.y - c.y;
  // 가운데에서 p로 가는 선이 세로 테두리(좌우)를 먼저 지나는가: |dx| / (w/2) ≥ |dy| / (h/2)
  if (Math.abs(dx) * r.h >= Math.abs(dy) * r.w) return dx >= 0 ? { x: r.x + r.w, y: c.y, side: 'right' } : { x: r.x, y: c.y, side: 'left' };
  return dy >= 0 ? { x: c.x, y: r.y + r.h, side: 'bottom' } : { x: c.x, y: r.y, side: 'top' };
}

// 연결 하나의 두 끝. from·to: 사각형, focus: 'from' | 'to' | null(초점 세션이 어느 쪽인가)
// → { a(from 쪽 끝), b(to 쪽 끝), anchored: 'from' | 'to' | null }
export function linkEnds(from, to, focus = null) {
  const a = centerOf(from), b = centerOf(to);
  if (focus === 'from') return { a: borderAnchor(from, b), b, anchored: 'from' };
  if (focus === 'to') return { a, b: borderAnchor(to, a), anchored: 'to' };
  return { a, b, anchored: null };
}

// 선 글 자리. items: [{ a, b, w, h }](선의 두 끝, 글 상자 크기). 글은 시키는 쪽(a) 가까이(선의 0.36) 두고,
// 앞서 놓은 글과 겹치면 선을 따라 다른 자리(KS 차례)로 옮긴다. 다 겹치면 처음 자리 → [{ x, y, k }](글 가운데)
export const LABEL_KS = [0.36, 0.22, 0.5, 0.64, 0.12, 0.78];
export function placeLabels(items) {
  const placed = [];
  return items.map(({ a, b, w, h }) => {
    const at = (k) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, k });
    const hits = (p) => placed.some((q) => Math.abs(p.x - q.x) * 2 < w + q.w && Math.abs(p.y - q.y) * 2 < h + q.h);
    const p = LABEL_KS.map(at).find((c) => !hits(c)) || at(LABEL_KS[0]);
    placed.push({ ...p, w, h });
    return p;
  });
}

const inside = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
const meets = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// 덩어리의 초점 세션 하나. rects: { id: 사각형 }(같은 좌표계), selected: 고른 세션들(순서대로), focusId: 마지막에 눌러 들어간 세션,
// view: 화면에 보이는 판 사각형(같은 좌표계)이나 null.
// 차례: 고른 구성 노드(처음 것) > 눌러 들어간 구성 노드(화면에 보일 때) > 화면 가운데가 든 구성 노드 > 없음
export function dockFocus({ rects, selected = [], focusId = null, view = null }) {
  const has = (id) => id != null && Object.prototype.hasOwnProperty.call(rects, id);
  const sel = (selected || []).find(has);
  if (sel) return sel;
  if (has(focusId) && (!view || meets(rects[focusId], view))) return focusId;
  if (view) {
    const c = centerOf(view);
    for (const [id, r] of Object.entries(rects)) if (inside(c, r)) return id;
  }
  return null;
}
