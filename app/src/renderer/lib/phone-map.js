// P166: 휴대폰 세션 맵(PhoneMap.jsx) = PC 세션 맵과 같은 무한 캔버스. 손가락 판정과 시점 셈·기억만 둔다(순수 함수, 단위 시험 test/p166-lib.test.mjs).
// 배치는 PC와 같은 lib/mission-lineage.js lineageLayout(phone: true, 세로 화면 배치)을 쓴다.
import { zoomAt, panBy, fitView, centerOn, clampK } from './mission-terr.js';

// LONG_MS 동안 SLOP 안에 머물면 길게 누르기(미리 보기). 그 전에 SLOP을 넘으면 끌기(시점 이동), 그 전에 떼면 누르기(세션 열기)
// DOCK = 맞춤에서 아래 줌 단추 자리로 비우는 높이
// P280: PEEK = 두 열 맞춤에서 오른쪽 끝에 보이게 남기는 이전 칸 폭(화면 px, 이전 카드 왼쪽 가장자리부터)
// P293: EARLY_MS = 첫 그리기 뒤 이전 칸을 그리기까지, CALM_MS = 첫 그리기 뒤 움직임(일하는 빛)을 켜기까지
export const PM = { LONG_MS: 480, SLOP: 10, PAD: 12, DOCK: 58, FIT_MAX: 1, GO_K: 1.1, SAVE_MS: 250, PEEK: 34, EARLY_MS: 700, CALM_MS: 3000 };
export const VIEW_KEY = 'atrium.phoneMap.view';

// 손가락 판정. n = 닿아 있는 손가락 수(이번 손짓에서 가장 많았던 수), dx·dy = 처음 자리에서 움직인 거리, dt = 누른 뒤 지난 시간, lifted = 뗐는가
// → 'pinch'(두 손가락 확대·축소) | 'pan'(끌기) | 'long'(길게 누르기) | 'tap'(누르기) | 'wait'(아직 모름)
export function touchIntent({ n = 1, dx = 0, dy = 0, dt = 0, lifted = false, moved = false } = {}) {
  if (n >= 2) return 'pinch';
  if (moved || Math.hypot(dx, dy) > PM.SLOP) return 'pan';
  if (dt >= PM.LONG_MS) return 'long';
  return lifted ? 'tap' : 'wait';
}

// 두 손가락: 처음 보기 v0, 처음 가운데 m0·거리 d0 → 지금 가운데 m·거리 d. 처음 가운데 아래 세계 점이 손가락 가운데를 따라간다
export function pinchView(v0, m0, d0, m, d) {
  const z = zoomAt(v0, m0.x, m0.y, v0.k * (Math.max(1, d) / Math.max(1, d0)));
  return panBy(z, m.x - m0.x, m.y - m0.y);
}

// 맞춤: 세계 전체를 보이는 칸(vw × vh, 아래 줌 단추 자리 빼고)에. 가까이 단계 위로는 키우지 않는다.
// P256: 폭에 맞춰 높이가 남으면 가운데가 아니라 위에 붙인다(맵 위가 비어 보이지 않게, 남는 칸은 아래 줌 단추 쪽)
export const phoneFit = (bounds, vw, vh) => { const f = fitView(bounds, vw, vh, { pad: PM.PAD, bottom: PM.DOCK, max: PM.FIT_MAX }); return { ...f, y: PM.PAD - bounds.y * f.k }; };
// P280: 세션 맵 맞춤. 두 열(오늘 | 이전)이면 오늘 칸 폭에 맞추고 위에 붙이되, 이전 칸 머리와 카드 가장자리가 오른쪽 끝에 PEEK만큼 보이게(옆에 더 있다는 표시).
//   lay = lineageLayout 결과(ncol, colDx, bounds). 한 열이면 전과 같은 phoneFit
export function mapFit(lay, vw, vh, padx = 20) {
  if (!lay || lay.ncol !== 2) return phoneFit(lay.bounds, vw, vh);
  const k = clampK(Math.min(PM.FIT_MAX, Math.max(0.01, (vw - PM.PEEK - PM.PAD) / Math.max(1, lay.colDx + padx))));
  return { k, x: PM.PAD - lay.bounds.x * k, y: PM.PAD - lay.bounds.y * k };
}
// 카드로 가기(위 알약): 카드 폭이 화면 폭에 거의 차게(지금 배율이 더 크면 그대로)
export function goView(b, v, vw, vh) {
  const k = Math.max(v ? v.k : 0, Math.min(PM.GO_K, (vw - 32) / Math.max(1, b.w)));
  return centerOn(b.x + b.w / 2, b.y + b.h / 2, k, vw, vh);
}

// 시점 기억: 기기(브라우저 저장소)에 화면 크기마다 하나. 세로·가로 돌리면 따로. 저장소가 없거나 깨져도 맞춤으로 연다
export const sizeKey = (s) => (s ? `${Math.round(s.w / 20) * 20}x${Math.round(s.h / 20) * 20}` : '');
const ok = (v) => !!v && [v.k, v.x, v.y].every((x) => typeof x === 'number' && Number.isFinite(x)) && v.k > 0;
export function loadView(store, size) {
  try {
    const all = JSON.parse((store && store.getItem(VIEW_KEY)) || '{}');
    const v = all && all[sizeKey(size)];
    return ok(v) ? { k: clampK(v.k), x: v.x, y: v.y } : null;
  } catch { return null; }
}
export function saveView(store, size, v) {
  if (!store || !ok(v) || !size) return false;
  try {
    let all = {};
    try { all = JSON.parse(store.getItem(VIEW_KEY) || '{}') || {}; } catch { all = {}; }
    const key = sizeKey(size);
    const keys = Object.keys(all).filter((k) => k !== key && !k.includes('|')).slice(-4); // 화면 크기는 몇 개만 기억(P280: 옛 탭 열쇠 "크기|탭"은 버린다)
    const next = Object.fromEntries(keys.map((k) => [k, all[k]]));
    next[key] = { k: Math.round(v.k * 1e4) / 1e4, x: Math.round(v.x), y: Math.round(v.y) };
    store.setItem(VIEW_KEY, JSON.stringify(next));
    return true;
  } catch { return false; }
}
export const clearView = (store, size) => { try { const all = JSON.parse(store.getItem(VIEW_KEY) || '{}') || {}; delete all[sizeKey(size)]; store.setItem(VIEW_KEY, JSON.stringify(all)); } catch { /* 지우지 못해도 된다 */ } };
// 처음 보기: 이 화면 크기에서 기억한 보기, 없으면 맞춤(P280: lay를 주면 두 열 맞춤 mapFit, 상자를 주면 phoneFit)
export const openView = (store, size, layOrBounds) => loadView(store, size) || (layOrBounds && layOrBounds.bounds ? mapFit(layOrBounds, size.w, size.h) : phoneFit(layOrBounds, size.w, size.h));

// ---------- P293: 휴대폰 맵 열기 다이어트와 가볍게 열기 ----------
// 열기 계획. stage = 첫 그리기 뒤 지난 단계(0: 막 그림, 1: EARLY_MS 지남, 2: CALM_MS 지남), lite = 가볍게 열림이고 "전부 보기"를 아직 누르지 않았다.
// → { earlier: 이전 칸을 그린다, motion: 움직임(일하는 빛)을 켠다, tiles: 먼 타일을 그린다, marks: 결정 표식·알약을 그린다, lite }
// 보통 열기: 오늘 칸과 표식 → (EARLY_MS) 이전 칸 → (CALM_MS) 움직임. 가볍게: 오늘 칸만, 움직임·먼 타일·표식 없이(전부 보기를 누르면 보통과 같다)
export function openPlan({ lite = false, stage = 0 } = {}) {
  if (lite) return { earlier: false, motion: false, tiles: false, marks: false, lite: true };
  return { earlier: stage >= 1, motion: stage >= 2, tiles: true, marks: true, lite: false };
}
// 두 칸 배치(lay.ncol 2)에서 이전 칸(오른쪽)에 놓인 카드 id. 한 칸이면 빈 Set(가릴 것이 없다)
export function earlierIds(lay) {
  const out = new Set();
  if (!lay || lay.ncol !== 2 || !lay.cards) return out;
  for (const [id, b] of lay.cards) if (b.x >= lay.colDx) out.add(id);
  return out;
}
// 그래프를 다시 받을 까닭의 열쇠(Map 객체가 바뀐 것이 아니라 내용이 바뀐 것만). 처음 불러오기로 같은 내용이 다시 채워지면 열쇠가 같아 다시 받지 않는다
// (연결 직후 thread.list·loop.list가 채워지며 mission.graph를 한 번 더 받던 것, 실제 판 기록 2.1초의 119KB). 연결·루프는 내용, Thread는 마지막 줄
export function graphDepsKey({ links, thread, loops } = {}) {
  const vals = (m) => (m && typeof m.values === 'function' ? [...m.values()] : Array.isArray(m) ? m : []);
  const lk = vals(links).map((l) => JSON.stringify(l)).sort().join('\n');
  const lp = vals(loops).map((l) => JSON.stringify(l)).sort().join('\n');
  const th = vals(thread);
  const tl = th.length ? th[th.length - 1] : null;
  return [lk, lp, tl ? `${tl.itemId}:${tl.seq}` : ''].join('|');
}
