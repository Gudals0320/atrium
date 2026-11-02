// P31: 판 전체 정리(board.arrange { all })에서 영역들을 다시 놓는 계산. 순수 함수만 둔다(단위 시험 있음).
// - 묶음(group): 리포(또는 폴더) 영역 하나와 그 옆의 워크트리 위성 영역들(P27). 소속 없는 메모·칸반은 혼자 한 묶음이다.
// - 묶음 안: 본 영역 오른쪽(WT_GAP) 열에 위성 영역을 지금의 위아래 순서대로 쌓는다(틈 REGION_GAP/2). 본 영역이 정리로 커지거나 줄어도 화살표가 짧고 곧다.
// - 묶음끼리: 지금 읽는 순서(위에서 아래, 왼쪽에서 오른쪽)를 지켜 줄 단위로 왼쪽부터 채운다(선반 채우기). 줄 너비는 전체가 화면 비율(1.6)에 가깝게.
//   안이 빈 영역은 안이 있는 영역 뒤에, 소속 없는 메모·칸반은 맨 뒤에 둔다. 줄 안에서는 위를 맞추고, 묶음 사이와 줄 사이는 REGION_GAP이다.
// - 시작점은 지금 모든 묶음의 왼쪽 위다(판이 멀리 튀지 않게).
import { bbox, REGION_GAP } from './canvas.mjs';
import { WT_GAP } from './worktree-areas.mjs';

// entries: [{ key, ws, wt, rect: { x, y, w, h }, empty? }]
//   ws: 워크스페이스 키(소속 없는 것은 null), wt: 워크트리 키(본 영역은 ''), rect: 지금 영역(또는 메모·칸반) 사각형, empty: 안이 빈 영역
// → { shifts: Map key → { dx, dy }(옮길 것만), rects: Map key → 새 사각형, groups: [{ ws, keys, rect }] }
export function layoutRegions(entries, { gap = REGION_GAP, satGap = WT_GAP, satStack = REGION_GAP / 2, aspect = 1.6, origin = null } = {}) {
  const list = (entries || []).filter((e) => e && e.rect && Number.isFinite(e.rect.x) && Number.isFinite(e.rect.y));
  if (!list.length) return { shifts: new Map(), rects: new Map(), groups: [] };
  // 1. 묶음으로 나눈다. 본 영역이 없는 위성(있을 수 없지만)은 혼자 묶음이 된다
  const mains = new Map();
  for (const e of list) if (e.ws && !e.wt) mains.set(e.ws, e);
  const groups = [];
  const byWs = new Map();
  for (const e of list) {
    if (e.ws && e.wt && mains.has(e.ws)) continue;
    const g = { ws: e.ws || null, main: e, sats: [], free: !e.ws };
    groups.push(g);
    if (e.ws && !e.wt) byWs.set(e.ws, g);
  }
  for (const e of list) if (e.ws && e.wt && byWs.has(e.ws)) byWs.get(e.ws).sats.push(e);
  // 2. 묶음 안의 자리(본 영역 왼쪽 위가 0,0)
  for (const g of groups) {
    g.local = new Map([[g.main.key, { x: 0, y: 0, w: g.main.rect.w, h: g.main.rect.h }]]);
    const sats = [...g.sats].sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x || String(a.key).localeCompare(String(b.key)));
    let y = 0;
    for (const s of sats) { g.local.set(s.key, { x: g.main.rect.w + satGap, y, w: s.rect.w, h: s.rect.h }); y += s.rect.h + satStack; }
    const lb = bbox([...g.local.values()]);
    g.w = lb.w; g.h = lb.h;
    g.now = bbox([g.main.rect, ...g.sats.map((s) => s.rect)]);
    g.empty = !g.free && !!g.main.empty && g.sats.every((s) => s.empty);
  }
  // 3. 순서: 안이 있는 묶음(지금 읽는 순서) → 빈 묶음 → 소속 없는 메모·칸반
  const rank = (g) => (g.free ? 2 : g.empty ? 1 : 0);
  groups.sort((a, b) => rank(a) - rank(b) || a.now.y - b.now.y || a.now.x - b.now.x || String(a.main.key).localeCompare(String(b.main.key)));
  // 4. 줄 단위로 채운다. 줄 너비는 넓이 합으로 정한 목표(화면 비율)와 가장 넓은 묶음 중 큰 쪽
  const area = groups.reduce((s, g) => s + (g.w + gap) * (g.h + gap), 0);
  const rowW = Math.max(...groups.map((g) => g.w), Math.sqrt(area * aspect));
  const o = origin || bbox(groups.map((g) => g.now));
  let x = o.x, y = o.y, rowH = 0;
  const rects = new Map();
  const shifts = new Map();
  const out = [];
  for (const g of groups) {
    if (x > o.x && x - o.x + g.w > rowW + 1) { x = o.x; y += rowH + gap; rowH = 0; }
    const keys = [];
    for (const [k, r] of g.local) {
      const e = k === g.main.key ? g.main : g.sats.find((s) => s.key === k);
      const nr = { x: Math.round(x + r.x), y: Math.round(y + r.y), w: r.w, h: r.h };
      rects.set(k, nr);
      keys.push(k);
      const dx = nr.x - e.rect.x, dy = nr.y - e.rect.y;
      if (dx || dy) shifts.set(k, { dx: Math.round(dx), dy: Math.round(dy) });
    }
    out.push({ ws: g.ws, keys, rect: { x: Math.round(x), y: Math.round(y), w: g.w, h: g.h } });
    x += g.w + gap; rowH = Math.max(rowH, g.h);
  }
  return { shifts, rects, groups: out };
}
