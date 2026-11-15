// P160: 휴대폰 세션 맵 = PC 세션 맵(시안 B "Lineage", lib/mission-lineage.js)과 같은 판정을 세로 목록으로 편 배치. 순수 함수만 둔다(단위 시험 test/p160-lib.test.mjs).
// - 소속: 폴더(사이드바 가상 그룹) > 워크스페이스 > 세션. 차례는 PC 띠·줄 차례 그대로(사이드바 차례, 폴더 밖은 끝).
// - 관계: 워크스페이스 안은 PC가 놓은 차례(lineageLayout seq·vkids)를 깊이 우선으로 펴서 단계마다 들여 쓴다(시작 = 0, 1단계 = 1, …).
//   PC와 같은 판정이라 동료는 짝 바로 다음(곁)에, 독립은 시작 단계, 솔로는 그 워크스페이스 끝, 다른 워크스페이스의 위 세션에서 온 세션은 1단계에서 시작한다.
//   PC가 FOLD 단계보다 깊은 가지를 접으면(카드 fold = 접힌 단계 수) 휴대폰도 같은 카드에 "+n단계" 칩을 단다(편 카드 = expanded).
// - 레일(꺾인 선)은 창이 그린 카드 자리를 재서 긋는다(PhoneLineage.jsx). 여기서는 누가 누구의 위인지(up)와 관계 종류(rel)만 준다.
// → { folders: [{ id, name, loose, nWs, sessions, bar, ws: [{ key, name, chips, count, items, peers }] }], order: [id…], counts: { turn, alert, work, review, all } }
//   item: { id, depth, ind, kind: 'tree'|'away'|'solo', up(같은 워크스페이스의 위 세션 id), rel(spawn|role|prompt), active, fold, thin(P163: PC와 같은 판정의 얇은 줄), from({ id, name, ws }), lead, away(다른 워크스페이스 하위 수) }
import { nodeTier } from './mission-model.js';

export const PL = { INDENT: 22, MAXIND: 4 }; // 단계마다 들여 쓰는 폭(px, 시안 B-phone과 같다)과 들여쓰기를 멈추는 단계(PC FOLD와 같다. 390px 폭에서 카드가 250px 넘게 남게)

export function phoneLineage(lay, { tiers = null } = {}) {
  const empty = { folders: [], order: [], counts: { turn: 0, alert: 0, work: 0, review: 0, all: 0 } };
  if (!lay) return empty;
  const { byId } = lay.tree;
  const wsOf = (id) => (byId.get(id) || {}).workspaceKey || '';
  const tierOf = (id) => (tiers && tiers.has(id) ? tiers.get(id) : nodeTier(byId.get(id)));
  // 같은 워크스페이스 나무 선(PC 선과 같다): 아래 세션 → { 위, 종류 }
  const treeUp = new Map();
  for (const e of lay.edges) if (e.tree && !e.cross && !e.peer && !e.lineage) treeUp.set(e.to, { from: e.from, rel: e.rel || 'spawn', active: !!e.active });
  const peerPairs = lay.edges.filter((e) => e.peer).map((e) => [e.from, e.to]);
  const folders = lay.bands.map((b) => ({ id: b.id, name: b.name, loose: !!b.loose, nWs: b.nWs, sessions: b.sessions, bar: b.bar, ws: [] }));
  const order = [];
  for (const row of lay.rows) {
    const f = folders.find((x) => (x.id || null) === (row.band || null));
    if (!f) continue;
    const s = (lay.seq && lay.seq.get(row.key)) || { roots: [], away: [], solos: [] };
    const items = [], seen = new Set();
    const walk = (id, depth, kind, g = 0) => {
      if (seen.has(id) || g > 60) return;
      seen.add(id);
      const card = lay.cards.get(id);
      if (!card) return;
      const up = treeUp.get(id);
      const p = lay.tree.parent.get(id);
      const from = p && wsOf(p) !== row.key ? { id: p, name: (byId.get(p) || {}).name || '', ws: wsOf(p) } : null;
      const vk = (lay.vkids && lay.vkids.get(id)) || [];
      const kidsAll = lay.tree.kids.get(id) || [];
      items.push({
        id, depth, ind: Math.min(depth, PL.MAXIND), kind,
        up: up && wsOf(up.from) === row.key && lay.cards.has(up.from) ? up.from : null, rel: up ? up.rel : null, active: !!(up && up.active),
        fold: card.fold || 0, thin: !!card.thin, from, lead: kidsAll.some((c) => wsOf(c.id) === row.key), away: kidsAll.filter((c) => wsOf(c.id) !== row.key).length,
      });
      for (const k of vk) walk(k, depth + 1, 'tree', g + 1);
    };
    for (const id of s.roots) walk(id, 0, 'tree');
    for (const id of s.away) walk(id, 1, 'away');
    for (const id of s.solos) walk(id, 0, 'solo');
    // 놓친 카드(고리 등)도 빠뜨리지 않는다
    for (const [id, c] of lay.cards) if (c.ws === row.key && !seen.has(id)) walk(id, 0, c.depth < 0 ? 'solo' : 'tree');
    const here = new Set(items.map((x) => x.id));
    const at = new Map(items.map((x, i) => [x.id, i]));
    // 동료 짝(같은 워크스페이스, 둘 다 보일 때): 목록 차례대로 [위, 아래]
    const peers = peerPairs.filter(([a, b]) => here.has(a) && here.has(b)).map(([a, b]) => (at.get(a) < at.get(b) ? [a, b] : [b, a])).sort((x, y) => at.get(x[0]) - at.get(y[0]));
    f.ws.push({ key: row.key, name: row.name, chips: row.chips, count: row.count, items, peers });
    for (const x of items) order.push(x.id);
  }
  const counts = { turn: 0, alert: 0, work: 0, review: 0, all: order.length };
  for (const id of order) { const t = tierOf(id); if (t in counts) counts[t] += 1; }
  return { folders: folders.filter((x) => x.ws.length), order, counts };
}

// 알약을 누를 때마다 그 등급의 다음 카드(목록 차례, 끝에서 처음으로). last: 지난번에 간 카드 id
export function nextOf(order, tierOf, want, last = null) {
  const list = order.filter((id) => want.includes(tierOf(id)));
  if (!list.length) return null;
  const i = list.indexOf(last);
  return list[(i + 1) % list.length];
}

// 레일 길(카드 자리를 잰 뒤). up·kids: 위 세션 상자와 그 하위들 상자(위 → 아래 차례), 상자는 { x, y, w, h }(워크스페이스 몸통 기준).
// 첫 하위는 위 카드 아래 변에서, 다음 하위는 앞 하위의 꺾인 자리에서 내려와 둥글게 꺾어 카드 왼쪽 변(틈 gap)으로 간다. 토막이 겹치지 않아 종류마다 모양이 섞이지 않는다
export function railPaths(up, kids, { inset = 8, r = 6, gap = 2 } = {}) {
  const x = up.x + inset;
  let y0 = up.y + up.h;
  return kids.map((b) => {
    const my = b.y + b.h / 2, x2 = b.x - gap;
    const rr = Math.max(0, Math.min(r, my - y0, x2 - x));
    const d = `M${x} ${y0} V${my - rr} Q${x} ${my} ${x + rr} ${my} H${x2}`;
    y0 = my - rr;
    return d;
  });
}

// 동료 괄호(카드 오른쪽 바깥, 양끝 점): 두 상자의 세로 가운데를 잇는다
export function peerPath(a, b, { out = 7 } = {}) {
  const x = Math.max(a.x + a.w, b.x + b.w) + out;
  const y1 = a.y + a.h / 2, y2 = b.y + b.h / 2;
  return { d: `M${a.x + a.w + 2} ${y1} H${x} V${y2} H${b.x + b.w + 2}`, ends: [[a.x + a.w + 2, y1], [b.x + b.w + 2, y2]] };
}
