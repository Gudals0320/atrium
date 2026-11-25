// P356: 휴대폰 페이지 맵 탭(MobileMap.jsx)의 순수 함수(단위 시험 app/test/p356-lib.test.mjs).
// 맵 탭은 PC 세션 맵과 같은 배치(lib/mission-lineage.js lineageLayout, 휴대폰 배치)와 카드(MapCard.jsx Card·cardFacts)로 그린다.
// 자료는 둘: 맵을 열 때 받는 구조 답(phone.map, 자주 바뀌는 값 없음)과 늘 받는 휴대폰 줄(phone.subscribe·phone.row).
// - liveFromRow: 휴대폰 줄 → 판 세션 요약 모양(카드 사실·등급이 읽는 칸만)
// - graphOf: 구조 답 + 줄 → 판 세션 맵 그래프(mission.graph와 같은 모양)
// - structKey: 줄 가운데 구조(세션, 이름, 워크스페이스, 부모)만의 열쇠. 바뀌면 구조 답을 다시 묻는다
// - visibleIds: 보기(시점·배율)와 화면 크기 → 그릴 카드(화면 밖 카드는 자리만 있고 그리지 않는다)
import { nodeTier } from './mission-model.js';
import { centerOn, clampK } from './mission-terr.js';
import { sizeKey } from './phone-map.js';

// 휴대폰 줄 → 판 세션 요약 모양
export function liveFromRow(row) {
  if (!row) return null;
  const l = row.line || {};
  const live = { sessionId: row.sessionId, name: row.name, kind: row.kind || 'claude', state: row.state, lastActivityAt: row.lastActivityAt || null, createdAt: row.createdAt || 0, workspaceKey: row.workspaceKey || null };
  if (row.flavor) live.flavor = row.flavor;
  if (row.billing === 'api' || row.billing === 'sdk') live.billing = row.billing; // P359. P363: sdk
  if (row.unseen) live.unseen = true;
  if (row.model) live.model = row.model;
  if (row.effort) live.effort = row.effort;
  if (row.turnAt) live.turn = { startedAt: row.turnAt };
  if (row.shell) {
    live.shell = { atPrompt: row.shell.atPrompt, program: row.shell.program ? true : null };
    if (row.shell.atPrompt === false && l.kind === 'shell' && l.text) live.shell.command = l.text;
  }
  if (row.state === 'working' && l.kind === 'prompt' && l.text) live.lastPrompt = l.text;
  if (row.ask) live.ask = { kind: row.ask.kind, summary: (l.kind === 'ask' && l.text) || row.ask.question || null };
  if (l.kind === 'error' && l.text) live.error = { message: l.text };
  if (row.branch) live.git = { isWorktree: true, branch: row.branch };
  return live;
}

// 판 미션 그래프의 분류(backend mission.mjs categoryOf와 같다)
export function categoryOf(s) {
  if (s.state === 'waiting' || s.state === 'trust_wait' || s.state === 'error') return 'needs_you';
  if (s.state === 'working' || s.state === 'shell_running') return 'working';
  if (s.state === 'exited') return 'exited';
  if (s.unseen) return 'done';
  return 'idle';
}

// 구조 답(backend phone.mjs mapOf: 참조는 nodes 차례 번호, 짧은 이름) + 줄 → 판 그래프(mission.graph 모양).
// 줄이 없는 세션(지워졌는데 구조 답이 아직 옛것)은 뺀다. 이름·워크스페이스·상태는 줄에서(늘 새것)
export function graphOf(map, rows) {
  if (!map || !rows) return null;
  const list = map.nodes || [];
  const idOf = (i) => (Number.isInteger(i) && list[i] ? `s:${list[i].s}` : null);
  const nodes = [];
  for (const x of list) {
    const r = rows.get(x.s);
    if (!r) continue;
    const { s, t, k, p, lp, peers, bg, ...rest } = x;
    const n = { ...rest, id: `s:${s}`, kind: 'session', sessionId: s, agentKind: k || 'claude', createdAt: t || null, name: r.name, workspaceKey: r.workspaceKey || null, state: r.state, category: categoryOf(r), activeAt: r.lastActivityAt || null, turnAt: r.turnAt || null };
    n.parentId = idOf(p); n.lineageParent = idOf(lp); n.peers = (peers || []).map(idOf).filter(Boolean);
    if (bg) n.background = { n: bg.n, kinds: bg.kinds || [], items: [] };
    nodes.push(n);
  }
  const ids = new Set(nodes.map((n) => n.id));
  for (const n of nodes) { if (n.parentId && !ids.has(n.parentId)) n.parentId = null; if (n.lineageParent && !ids.has(n.lineageParent)) n.lineageParent = null; n.peers = n.peers.filter((x) => ids.has(x)); }
  const edges = [];
  for (const y of map.edges || []) {
    const from = idOf(y.f), to = idOf(y.t);
    if (!from || !to || !ids.has(from) || !ids.has(to)) continue;
    const e = { id: `${y.k}:${from}>${to}`, from, to, kind: y.k, label: y.label || null, relation: y.r || null, relationSource: y.rs || null, relationUp: idOf(y.up) };
    edges.push(e);
  }
  return { nodes, edges, counts: null };
}

// 구조 열쇠(세션 id·이름·워크스페이스·부모). 상태·활동이 바뀌어도 그대로
export function structKey(rows) {
  const parts = [];
  for (const r of rows.values()) parts.push(`${r.sessionId}|${r.name}|${r.workspaceKey || ''}|${r.parentSessionId || ''}`);
  return parts.sort().join('\n');
}

// 카드 등급(판 세션 맵과 같은 nodeTier). 그래프 노드 id → 등급
export function tiersOf(graph, rows) {
  const m = new Map();
  for (const n of (graph && graph.nodes) || []) m.set(n.id, nodeTier(n, liveFromRow(rows.get(n.sessionId))));
  return m;
}

// 보기 v = { x, y, k }(세계 → 화면: 화면 = 세계 × k + (x, y)), 화면 크기 size = { w, h }, margin = 화면 밖으로 미리 그릴 여유(화면 px)
// → 화면 안(여유 포함)에 드는 세계 사각형
export function worldRect(v, size, margin = 0) {
  const k = v && v.k > 0 ? v.k : 1;
  return { x0: (-v.x - margin) / k, y0: (-v.y - margin) / k, x1: (size.w - v.x + margin) / k, y1: (size.h - v.y + margin) / k };
}
const hit = (b, r) => b.x < r.x1 && b.x + b.w > r.x0 && b.y < r.y1 && b.y + b.h > r.y0;
// 그릴 카드 id(배치 차례 그대로). cards: Map id → { x, y, w, h }
export function visibleIds(cards, ids, v, size, margin = 240) {
  if (!cards || !v || !size) return [];
  const r = worldRect(v, size, margin);
  return (ids || [...cards.keys()]).filter((id) => { const b = cards.get(id); return b && hit(b, r); });
}
// 그릴 선: 두 끝 카드 상자를 감싼 사각형이 화면(여유 포함)에 닿는 것만. 끝을 모르는 선(merger 등)은 그린다
export function visibleEdges(edges, cards, v, size, margin = 240) {
  if (!edges || !v || !size) return edges || [];
  const r = worldRect(v, size, margin);
  return edges.filter((e) => {
    const a = cards.get(e.from), b = cards.get(e.to);
    if (!a || !b) return true;
    const box = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.max(a.x + a.w, b.x + b.w) - Math.min(a.x, b.x), h: Math.max(a.y + a.h, b.y + b.h) - Math.min(a.y, b.y) };
    return hit(box, r);
  });
}
// 보이는 카드 목록이 같은가(다시 그릴지)
export const sameList = (a, b) => a === b || (!!a && !!b && a.length === b.length && a.every((x, i) => x === b[i]));

// 할 일 수(세션마다, 미룬 카드 뺌). 휴대폰 홈과 같은 할 일 카드(phone.cards)
export function todoCounts(cards) {
  const m = new Map();
  for (const d of cards || []) if (d && d.sessionId && !d.deferred) m.set(d.sessionId, (m.get(d.sessionId) || 0) + 1);
  return m;
}

// ---------- 보기(P356 go 지적: 휴대폰은 읽히는 배율로 연다) ----------
// READ_K: 판 세션 맵의 멀리 단계 규칙(MissionLineage.jsx READ_K). 이보다 멀면 멀리 타일 이름·상태가 화면 11.5px 아래라, 맞춤·처음 보기는 이 배율 아래로 가지 않는다(두 손가락으로 더 멀리는 된다)
// OPEN_K: 처음 보기 배율(카드 폭이 화면에 들면 100%), PAD: 화면 가장자리 여백
export const MV = { READ_K: 0.26, OPEN_K: 1, PAD: 12, KEY: 'atrium.mobileMap.view' };
const okView = (v) => !!v && [v.k, v.x, v.y].every((x) => typeof x === 'number' && Number.isFinite(x)) && v.k > 0;
// 이 기기(브라우저 저장소)에 화면 크기마다 마지막 보기
export function loadMapView(store, size) {
  try { const all = JSON.parse((store && store.getItem(MV.KEY)) || '{}'); const v = all && all[sizeKey(size)]; return okView(v) ? { k: clampK(v.k), x: v.x, y: v.y } : null; } catch { return null; }
}
export function saveMapView(store, size, v) {
  if (!store || !size || !okView(v)) return false;
  try {
    let all = {}; try { all = JSON.parse(store.getItem(MV.KEY) || '{}') || {}; } catch { all = {}; }
    const key = sizeKey(size);
    const next = Object.fromEntries(Object.keys(all).filter((k) => k !== key).slice(-4).map((k) => [k, all[k]]));
    next[key] = { k: Math.round(v.k * 1e4) / 1e4, x: Math.round(v.x), y: Math.round(v.y) };
    store.setItem(MV.KEY, JSON.stringify(next));
    return true;
  } catch { return false; }
}
// 처음 볼 카드: 첫 응답 필요(오류 포함, 배치 차례), 없으면 가장 최근에 움직인 세션
export function firstCard(lay, tiers, activeAt = () => 0) {
  if (!lay || !lay.order.length) return null;
  const ids = lay.order.filter((id) => lay.cards.has(id) && !lay.cards.get(id).folded);
  const need = ids.find((id) => tiers.get(id) === 'turn') || ids.find((id) => tiers.get(id) === 'alert');
  if (need) return need;
  let best = null, at = -1;
  for (const id of ids) { const a = activeAt(id) || 0; if (a > at) { at = a; best = id; } }
  return best;
}
// 그 카드 가운데, 카드 폭이 화면에 드는 배율(100%까지)
export function cardView(b, size, k = MV.OPEN_K) {
  const kk = Math.max(MV.READ_K, Math.min(k, (size.w - 2 * MV.PAD) / Math.max(1, b.w)));
  return centerOn(b.x + b.w / 2, b.y + b.h / 2, kk, size.w, size.h);
}
// 처음 보기: 기억한 보기, 없으면 첫 카드(firstCard), 카드가 없으면 배치 왼쪽 위
export function openMapView(store, size, lay, tiers, activeAt) {
  const saved = loadMapView(store, size);
  if (saved) return saved;
  const id = firstCard(lay, tiers, activeAt);
  if (id) return cardView(lay.cards.get(id), size);
  const b = lay && lay.bounds ? lay.bounds : { x: 0, y: 0 };
  return { k: MV.OPEN_K, x: MV.PAD - b.x, y: MV.PAD - b.y };
}
// 맞춤: 지금 보이는 폴더 띠의 폭을 화면 폭에(READ_K 아래로는 줄이지 않고 왼쪽에 붙인다), 세로 자리는 지금 가운데를 지킨다
export function bandFitView(lay, v, size) {
  const bands = (lay && lay.bands) || [];
  if (!bands.length || !v) return null;
  const cx = (size.w / 2 - v.x) / v.k, cy = (size.h / 2 - v.y) / v.k;
  const dist = (b) => (cx >= b.x && cx <= b.x + b.w ? 0 : Math.min(Math.abs(cx - b.x), Math.abs(cx - b.x - b.w))) + (cy >= b.y && cy <= b.y + b.h ? 0 : Math.min(Math.abs(cy - b.y), Math.abs(cy - b.y - b.h)));
  const band = [...bands].sort((a, b) => dist(a) - dist(b))[0];
  const k = clampK(Math.max(MV.READ_K, Math.min(MV.OPEN_K, (size.w - 2 * MV.PAD) / Math.max(1, band.w))));
  const wy = Math.min(Math.max(cy, band.y + (size.h / 2) / k - MV.PAD / k), band.y + band.h); // 띠 위 끝이 화면 위보다 내려가지 않게
  return { k, x: MV.PAD - band.x * k, y: size.h / 2 - wy * k, band: band.id || null };
}
