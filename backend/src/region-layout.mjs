// P31: 판 전체 정리(board.arrange { all })에서 영역들을 다시 놓는 계산. 순수 함수만 둔다(단위 시험 있음).
// - 묶음(group): 맨 위 영역 하나(리포 영역은 P35부터 안의 워크트리 상자를 감싸므로 상자째, 또는 폴더 영역). 소속 없는 메모·칸반은 혼자 한 묶음이다.
//   P31의 "워크트리 위성은 리포 오른쪽 열" 규칙은 P35에서 뺐다(상자는 리포 영역 안에서 그 영역과 함께 움직인다).
// - 묶음끼리: 지금 읽는 순서(위에서 아래, 왼쪽에서 오른쪽)를 지켜 줄 단위로 왼쪽부터 채운다(선반 채우기). 줄 너비는 전체가 화면 비율(1.6)에 가깝게.
//   안이 빈 영역은 안이 있는 영역 뒤에, 소속 없는 메모·칸반은 맨 뒤에 둔다. 줄 안에서는 위를 맞추고, 묶음 사이와 줄 사이는 REGION_GAP이다.
// - 시작점은 지금 모든 묶음의 왼쪽 위다(판이 멀리 튀지 않게).
import { bbox, REGION_GAP } from './canvas.mjs';

// entries: [{ key, ws, rect: { x, y, w, h }, empty? }]
//   ws: 워크스페이스 키(소속 없는 것은 null), rect: 지금 영역(또는 메모·칸반) 사각형, empty: 안이 빈 영역
// → { shifts: Map key → { dx, dy }(옮길 것만), rects: Map key → 새 사각형, groups: [{ ws, keys, rect }] }
export function layoutRegions(entries, { gap = REGION_GAP, aspect = 1.6, origin = null } = {}) {
  const list = (entries || []).filter((e) => e && e.rect && Number.isFinite(e.rect.x) && Number.isFinite(e.rect.y));
  if (!list.length) return { shifts: new Map(), rects: new Map(), groups: [] };
  // 1. 묶음: 영역(또는 메모·칸반) 하나씩
  const groups = list.map((e) => ({ ws: e.ws || null, main: e, free: !e.ws, w: e.rect.w, h: e.rect.h, now: e.rect, empty: !!e.ws && !!e.empty }));
  // 2. 순서: 안이 있는 묶음(지금 읽는 순서) → 빈 묶음 → 소속 없는 메모·칸반
  const rank = (g) => (g.free ? 2 : g.empty ? 1 : 0);
  groups.sort((a, b) => rank(a) - rank(b) || a.now.y - b.now.y || a.now.x - b.now.x || String(a.main.key).localeCompare(String(b.main.key)));
  // 3. 줄 단위로 채운다. 줄 너비는 넓이 합으로 정한 목표(화면 비율)와 가장 넓은 묶음 중 큰 쪽
  const area = groups.reduce((s, g) => s + (g.w + gap) * (g.h + gap), 0);
  const rowW = Math.max(...groups.map((g) => g.w), Math.sqrt(area * aspect));
  const o = origin || bbox(groups.map((g) => g.now));
  let x = o.x, y = o.y, rowH = 0;
  const rects = new Map();
  const shifts = new Map();
  const out = [];
  for (const g of groups) {
    if (x > o.x && x - o.x + g.w > rowW + 1) { x = o.x; y += rowH + gap; rowH = 0; }
    const e = g.main;
    const nr = { x: Math.round(x), y: Math.round(y), w: g.w, h: g.h };
    rects.set(e.key, nr);
    const dx = nr.x - e.rect.x, dy = nr.y - e.rect.y;
    if (dx || dy) shifts.set(e.key, { dx: Math.round(dx), dy: Math.round(dy) });
    out.push({ ws: g.ws, keys: [e.key], rect: { x: Math.round(x), y: Math.round(y), w: g.w, h: g.h } });
    x += g.w + gap; rowH = Math.max(rowH, g.h);
  }
  return { shifts, rects, groups: out };
}
