// P31: 판 전체 정리(board.arrange { all })에서 영역들을 다시 놓는 계산. 순수 함수만 둔다(단위 시험 있음).
// - 묶음(group): 맨 위 영역 하나(리포 영역은 P35부터 안의 워크트리 상자를 감싸므로 상자째, 또는 폴더 영역). 소속 없는 메모·칸반은 혼자 한 묶음이다.
//   P31의 "워크트리 위성은 리포 오른쪽 열" 규칙은 P35에서 뺐다(상자는 리포 영역 안에서 그 영역과 함께 움직인다).
// - 묶음끼리: 지금 읽는 순서(위에서 아래, 왼쪽에서 오른쪽)를 지켜 줄 단위로 왼쪽부터 채운다(선반 채우기).
//   안이 빈 영역은 안이 있는 영역 뒤에, 소속 없는 메모·칸반은 맨 뒤에 둔다. 줄 안에서는 위를 맞추고, 묶음 사이와 줄 사이는 REGION_GAP이다.
// - 시작점은 지금 모든 묶음의 왼쪽 위다(판이 멀리 튀지 않게).
// - P44: 가상 그룹(ws-groups.mjs)에 든 영역은 먼저 그룹마다 사람이 정한 순서로 한 덩어리(cluster)로 채우고, 그 덩어리를 영역 하나처럼 놓는다.
// - P91: 줄 너비를 하나로 정하지 않고 후보(가장 넓은 단위, 이어진 단위들의 너비 합 모두)를 다 놓아 본다. 결과 전체의 비율이 화면 비율(aspect, 창이 보내는
//   캔버스 비율, 기본 16:9)에 가까운 것과 빈 자리(줄마다 높이가 달라 생기는 빈 곳 포함)가 적은 것을 함께 점수로 골라(shelfBest) 한 줄·한 열로 길게 늘이지 않는다.
//   덩어리(그룹)는 캔버스에 테두리(canvas.mjs GROUP_PAD, GROUP_HEAD)가 그려지므로 그만큼 넓혀 놓는다. 덩어리 안도 같은 점수로 채운다.
import { bbox, REGION_GAP, GROUP_PAD, GROUP_HEAD } from './canvas.mjs';

export const DEFAULT_ASPECT = 16 / 9;
const WASTE_WEIGHT = 0.6; // 빈 자리 비율(0~1)의 무게. 비율 차이는 |ln(결과 비율 / 화면 비율)|
const CAND_MAX = 60; // 단위가 이보다 많으면 첫 단위부터 이어진 너비만 후보로(계산량)

// 선반 채우기: items([{ w, h }])를 줄 너비 rowW 안에서 왼쪽 위부터 놓는다 → [{ x, y }](x0, y0 기준)
function shelf(items, { gap, rowW, x0 = 0, y0 = 0 }) {
  let x = x0, y = y0, rowH = 0;
  return items.map((g) => {
    if (x > x0 && x - x0 + g.w > rowW + 1) { x = x0; y += rowH + gap; rowH = 0; }
    const at = { x, y };
    x += g.w + gap; rowH = Math.max(rowH, g.h);
    return at;
  });
}
// 줄 너비 후보마다 선반 채우기를 해 보고 점수가 가장 낮은 것 → { at, rowW, w, h, score }. 같은 점수면 좁은 줄
export function shelfBest(items, { gap, aspect = DEFAULT_ASPECT } = {}) {
  if (!items.length) return { at: [], rowW: 0, w: 0, h: 0, score: 0 };
  const maxW = Math.max(...items.map((g) => g.w));
  const cands = new Set([maxW]);
  const starts = items.length > CAND_MAX ? 1 : items.length;
  for (let i = 0; i < starts; i++) { let run = 0; for (let j = i; j < items.length; j++) { run += items[j].w + (j > i ? gap : 0); if (run >= maxW) cands.add(run); } }
  const area = items.reduce((s, g) => s + g.w * g.h, 0);
  let best = null;
  for (const rowW of [...cands].sort((a, b) => a - b)) {
    const at = shelf(items, { gap, rowW });
    const w = Math.max(...items.map((g, i) => at[i].x + g.w)), h = Math.max(...items.map((g, i) => at[i].y + g.h));
    const score = Math.abs(Math.log(w / h / aspect)) + WASTE_WEIGHT * (1 - area / (w * h));
    if (!best || score < best.score - 1e-9) best = { at, rowW, w, h, score };
  }
  return best;
}

// entries: [{ key, ws, rect: { x, y, w, h }, empty?, group?, order? }]
//   ws: 워크스페이스 키(소속 없는 것은 null), rect: 지금 영역(또는 메모·칸반) 사각형, empty: 안이 빈 영역
//   group: 가상 그룹 ID(없으면 그룹 없음), order: 그룹 안 순서(사람이 정함)
// opts.aspect: 결과 전체가 맞출 화면 비율(너비 / 높이). opts.frame: 덩어리 둘레에 테두리 자리를 둔다(기본 둔다)
// → { shifts: Map key → { dx, dy }(옮길 것만), rects: Map key → 새 사각형, groups: [{ ws, keys, rect }], clusters: [{ group, keys, rect }], aspect, rect }
export function layoutRegions(entries, { gap = REGION_GAP, aspect = DEFAULT_ASPECT, origin = null, groupGap = null, frame = true } = {}) {
  const list = (entries || []).filter((e) => e && e.rect && Number.isFinite(e.rect.x) && Number.isFinite(e.rect.y));
  const want = Number.isFinite(aspect) && aspect > 0 ? aspect : DEFAULT_ASPECT;
  if (!list.length) return { shifts: new Map(), rects: new Map(), groups: [], clusters: [], aspect: want, rect: null };
  const padX = frame ? GROUP_PAD : 0, padTop = frame ? GROUP_PAD + GROUP_HEAD : 0, padBot = frame ? GROUP_PAD : 0;
  // 1. 단위: 그룹 없는 영역(또는 메모·칸반) 하나, 또는 가상 그룹 하나(안의 영역을 미리 채운 덩어리, 테두리 자리 포함)
  const units = [];
  const byGroup = new Map();
  for (const e of list) {
    if (e.ws && e.group != null && e.group !== '') { if (!byGroup.has(e.group)) byGroup.set(e.group, []); byGroup.get(e.group).push(e); continue; }
    units.push({ ws: e.ws || null, members: [{ e, dx: 0, dy: 0 }], free: !e.ws, w: e.rect.w, h: e.rect.h, now: e.rect, empty: !!e.ws && !!e.empty, key: String(e.key) });
  }
  for (const [id, es] of byGroup) {
    es.sort((a, b) => (a.order ?? 1e9) - (b.order ?? 1e9) || a.rect.y - b.rect.y || a.rect.x - b.rect.x || String(a.key).localeCompare(String(b.key)));
    const items = es.map((e) => ({ w: e.rect.w, h: e.rect.h }));
    const { at } = shelfBest(items, { gap, aspect: want });
    const box = bbox(es.map((e, i) => ({ x: at[i].x, y: at[i].y, w: e.rect.w, h: e.rect.h })));
    const now = bbox(es.map((e) => e.rect));
    units.push({ ws: es[0].ws, group: id, members: es.map((e, i) => ({ e, dx: at[i].x + padX, dy: at[i].y + padTop })), free: false, w: box.w + 2 * padX, h: box.h + padTop + padBot,
      now: { x: now.x - padX, y: now.y - padTop, w: now.w + 2 * padX, h: now.h + padTop + padBot }, empty: es.every((e) => e.empty), key: `group:${id}` });
  }
  // 2. 순서: 안이 있는 단위(지금 읽는 순서) → 빈 단위 → 소속 없는 메모·칸반
  const rank = (g) => (g.free ? 2 : g.empty ? 1 : 0);
  units.sort((a, b) => rank(a) - rank(b) || a.now.y - b.now.y || a.now.x - b.now.x || a.key.localeCompare(b.key));
  // 3. 줄 단위로 채운다. 줄 너비는 결과 비율과 빈 자리로 고른다. 그룹 테두리가 이미 단위 둘레를 띄우므로 단위 사이는 gap 그대로(frame이 아니면 그룹이 있을 때 두 배)
  const outer = groupGap ?? (byGroup.size && !frame ? gap * 2 : gap);
  const o = origin || bbox(units.map((g) => g.now));
  const best = shelfBest(units, { gap: outer, aspect: want });
  const at = best.at.map((p) => ({ x: p.x + o.x, y: p.y + o.y }));
  const rects = new Map();
  const shifts = new Map();
  const out = [];
  const clusters = [];
  units.forEach((g, i) => {
    for (const { e, dx, dy } of g.members) {
      const nr = { x: Math.round(at[i].x + dx), y: Math.round(at[i].y + dy), w: e.rect.w, h: e.rect.h };
      rects.set(e.key, nr);
      const sx = nr.x - e.rect.x, sy = nr.y - e.rect.y;
      if (sx || sy) shifts.set(e.key, { dx: Math.round(sx), dy: Math.round(sy) });
      out.push({ ws: e.ws || null, keys: [e.key], rect: { ...nr } });
    }
    if (g.group != null) clusters.push({ group: g.group, keys: g.members.map((m) => m.e.key), rect: { x: Math.round(at[i].x), y: Math.round(at[i].y), w: g.w, h: g.h } });
  });
  return { shifts, rects, groups: out, clusters, aspect: want, rect: { x: o.x, y: o.y, w: best.w, h: best.h } };
}
