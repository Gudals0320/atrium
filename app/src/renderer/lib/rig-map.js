// P251: rig를 눈으로 보기(docs research rig3-map.md 3·4절). P253: 세션 맵 지도는 8절(쌍마다 선 하나, 한 줄 차례, 카드가 다 담음, 트리 위 고정된 rig 띠)로 다시 그렸다.
// P254: 사용자의 시안 V7("새 rig · 캔버스의 길 선")을 그대로 옮겼다. 캔버스와 세션 맵 모두 쌍마다 방향별 두 줄, 줄마다 글, "대기 n", 붉은 점, 밝기, 빌더로 올림 점선.
//   세션 맵의 rig는 맨 위 띠가 아니라 그 워크스페이스 줄 안의 묶음이다(v7Layout, mission-lineage.js lineageLayout rigBlocks).
// 세션 맵의 구조 지도와 캔버스의 길 선의 순수 함수(단위 시험 test/p251-lib.test.mjs, test/p253-lib.test.mjs).
// 자료는 판 API rig.map(backend rig-map.mjs), 역할 차례는 공유 배치(backend rig-map-layout.mjs roleOrder·rolePairs).
// 6절 "설계 쪽이 고른 넷"은 RIG_VIEW 한 곳에서 뒤집는다(값 하나씩).
import { roleOrder, rolePairs, rowOrder } from '../../../../backend/src/rig-map-layout.mjs';
import { HUMAN, BUILDER_ROLE } from '../../../../backend/src/rig-def-names.mjs';

export { roleOrder, rolePairs, rowOrder, HUMAN, BUILDER_ROLE };

// ---- 뒤집기 자리(설정 값 하나씩). 기본값이 설계 쪽이 고른 것이다 ----
// hideInTree:   역할 세션과 빌더를 세션 맵 트리에서 빼고 지도에만 | false = 트리에도 둔다(P253: 지도는 트리와 따로라 둘을 잇는 선은 없다)
// canvasExtras: 캔버스에는 길 선과 꼬리표만 | true = 꼬리표에 섹터와 박자도 붙인다
// canvasFrame:  캔버스에서 역할 묶음에 테두리를 두르지 않는다 | true = 옅은 테두리로 rig를 묶는다
// (P251의 sectorsUnder는 P253에서 없앴다: 섹터·도구는 늘 역할 카드 안 줄이다. 설계 8.2-5)
export const RIG_VIEW = { hideInTree: true, canvasExtras: false, canvasFrame: false };

// ---- P254: 사용자의 시안 V7 "새 rig · 캔버스의 길 선"(experiments/rig-map-ref/project/V7.dc.html)을 그대로 옮긴 치수와 색 ----
// 캔버스와 세션 맵이 같은 값을 쓴다(px, 시안 1240×544 판의 값 그대로).
// CW·CH 역할 카드, BH 빌더 카드 높이, GAP 카드 사이, BGAP 카드 아래 → 빌더 위, DY 두 줄이 가운데에서 떨어진 거리(위 줄 -8, 아래 줄 +8),
// LAB 가운데 → 줄 글 가운데(위 줄 글은 위로, 아래 줄 글은 아래로), WAIT 가운데 → "대기 n" 가운데(아래), LABW·LABH 줄 글 칸, WAITW 대기 칸,
// DOT 붉은 점 지름(줄 시작에서 DOTAT 안쪽), W1·W2 위 줄·아래 줄 굵기, RAISEW 올림 점선 굵기, RAISEDASH 점선, RAISELX 올림 글이 선에서 떨어진 거리, RAISELW 올림 글 칸,
// LANE·LANEBOT 이웃하지 않은 쌍이 카드 위로 도는 높이(세션 맵만, 시안에 없는 경우), SCALE 세션 맵 세계에 놓는 배율(트리 카드 글과 맞춘다)
export const V7 = {
  CW: 184, CH: 96, BH: 80, GAP: 104, BGAP: 104, DY: 8, LAB: 28, WAIT: 48, LABW: 88, LABH: 16, WAITW: 56, DOT: 8, DOTAT: 8,
  W1: 2, W2: 1.5, RAISEW: 2, RAISEDASH: [2, 6], RAISELX: 12, RAISELW: 40, LANE: 104, LANEBOT: 72, SCALE: 1.5,
  C: { dim: '#8E8B83', lit: '#ECE9E1', text: '#A9A69D', red: '#E5484D', raise: '#F0B652', card: '#1A1A18', border: '#3B3A36', borderHot: '#8E8B83', tag: '#22221F', tagText: '#A9A69D', btag: '#3A2E17', work: '#A8D08D' },
};

const list = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const r1 = (v) => Math.round(v * 10) / 10;
export const pathD = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${r1(p[0])} ${r1(p[1])}`).join(' ');

// 두 역할 사이 길(방향마다): a → b 줄과 b → a 줄. 사람이 낸 길은 쌍이 아니다(from에 역할이 있어야 한다)
//   → [{ dir: 'fwd'|'back', item, n(이번 사이클에 낸 수), open(끝나지 않은 반려), waiting, for }]
export function pairRows(a, b, flows) {
  const rows = [];
  const add = (dir, x, y) => {
    for (const f of flows || []) {
      if (!f || !list(f.from).includes(x) || !list(f.to).includes(y)) continue;
      let r = rows.find((q) => q.dir === dir && q.item === f.item);
      if (!r) { r = { dir, item: f.item, n: 0, open: false, waiting: 0, for: f.for || null }; rows.push(r); }
      r.n += (f.cycle && f.cycle.put) || 0;
      r.open = r.open || (f.openReturns || 0) > 0;
      r.waiting += f.waiting || 0;
    }
  };
  add('fwd', a, b); add('back', b, a);
  return rows;
}
// V7 한 쌍의 두 줄: top = 왼쪽(a) → 오른쪽(b) 길, bottom = b → a 길. 그 방향 길이 없으면 그 줄은 null(긋지 않는다).
//   waiting = 두 방향 기다림 합("대기 n"), lit = 지금 오가는 쌍(기다리는 항목이 있다, 시안의 검증 창구–매매)
export function pairLines(a, b, flows) {
  const rows = pairRows(a, b, flows);
  const side = (dir) => { const rs = rows.filter((r) => r.dir === dir); return rs.length ? { items: rs.map((r) => r.item), open: rs.some((r) => r.open), waiting: rs.reduce((s, r) => s + r.waiting, 0) } : null; };
  const top = side('fwd'), bottom = side('back');
  const waiting = (top ? top.waiting : 0) + (bottom ? bottom.waiting : 0);
  return { a, b, top, bottom, waiting, lit: waiting > 0 };
}
// 줄 글: 위 줄 "스냅숏 →", 아래 줄 "← 데이터 요청"(시안). 한 방향에 종류가 여럿이면 " · "로 잇는다
export const lineText = (side, which) => (!side ? '' : which === 'top' ? `${side.items.join(' · ')} →` : `← ${side.items.join(' · ')}`);

// 곧은 두 줄의 자리(시안 그대로). P = 왼쪽(a) 끝, Q = 오른쪽(b) 끝, k = 화면 px 하나의 세계 크기(캔버스 1/배율, 세션 맵 1).
//   위 줄 P → Q(끝 화살촉, 굵기 W1), 아래 줄 Q → P(끝 화살촉, 굵기 W2). 화살촉 끝이 카드 변에 닿게 줄을 화살촉 길이만큼 짧게 끝낸다(시안 99/103).
//   → { top: { d, from, to }, bottom: {...}, topLab, botLab, wait: [x, y](가운데), dotTop, dotBot: [x, y], u, n }
export function twoLines(P, Q, k = 1) {
  const dx = Q[0] - P[0], dy = Q[1] - P[1], L = Math.hypot(dx, dy) || 1;
  const ux = dx / L, uy = dy / L, nx = uy, ny = -ux; // n = 위쪽(왼 → 오른 기준)
  const o = V7.DY * k, at = (p, s, t = 0) => [p[0] + nx * s + ux * t, p[1] + ny * s + uy * t];
  const tf = at(P, o), tt = at(Q, o, -2 * V7.W1 * k), bf = at(Q, -o), bt = at(P, -o, 2 * V7.W2 * k);
  const mid = [(P[0] + Q[0]) / 2, (P[1] + Q[1]) / 2];
  return {
    top: { from: tf, to: tt, d: pathD([tf, tt]) }, bottom: { from: bf, to: bt, d: pathD([bf, bt]) },
    topLab: at(mid, V7.LAB * k), botLab: at(mid, -V7.LAB * k), wait: at(mid, -V7.WAIT * k),
    dotTop: at(P, o, V7.DOTAT * k), dotBot: at(Q, -o, -V7.DOTAT * k), u: [ux, uy], n: [nx, ny],
  };
}

// ---- P254 세션 맵: 그 워크스페이스 줄 안의 rig 묶음(V7 꼴). 역할 카드 한 줄(rowOrder), 이웃한 쌍은 곧은 두 줄,
//   이웃하지 않은 쌍은 카드 위로 도는 두 줄(시안에 없는 경우: 같은 굵기·색·글 자리), 빌더는 가장 오른쪽 역할 아래, 올린 역할에서 빌더로 노랑 점선.
//   → { w, h, dim, order, roles: Map 이름 → { x, y, w, h }, builder: { x, y, w, h }, pairs: [{ key, a, b, lines(pairLines), straight, top: { d, pts }, bottom, topLab, botLab, wait, dotTop, dotBot }], raises: [{ role, n, d, lab }] }
export function v7Layout(m) {
  if (!m) return null;
  const roleList = m.roles || [];
  const flows = m.flows || [];
  const beatRole = (m.head && m.head.beat && m.head.beat.role) || null;
  const order = rowOrder(roleList.map((r) => r.name), flows, { beatRole });
  const pos = new Map(order.map((n, i) => [n, i]));
  const pairs0 = rolePairs(order, flows).map((p) => { const [a, b] = pos.get(p.a) <= pos.get(p.b) ? [p.a, p.b] : [p.b, p.a]; return { key: a + '|' + b, a, b, lines: pairLines(a, b, flows) }; }).filter((p) => p.lines.top || p.lines.bottom);
  const far = pairs0.filter((p) => pos.get(p.b) - pos.get(p.a) > 1).sort((p, q) => (pos.get(p.b) - pos.get(p.a)) - (pos.get(q.b) - pos.get(q.a)) || pos.get(p.a) - pos.get(q.a));
  const y0 = far.length ? V7.LANEBOT + (far.length - 1) * V7.LANE + V7.LAB + V7.LABH : 0;
  const roles = new Map(order.map((n, i) => [n, { x: i * (V7.CW + V7.GAP), y: y0, w: V7.CW, h: V7.CH }]));
  const pairs = pairs0.map((p) => {
    const A = roles.get(p.a), B = roles.get(p.b);
    if (pos.get(p.b) - pos.get(p.a) === 1) {
      const y = A.y + A.h / 2, g = twoLines([A.x + A.w, y], [B.x, y], 1);
      return { ...p, straight: true, top: g.top, bottom: g.bottom, topLab: g.topLab, botLab: g.botLab, wait: g.wait, dotTop: g.dotTop, dotBot: g.dotBot };
    }
    // 카드 위로 돈다: 위 줄은 바깥(왼쪽 카드 가운데 - DY에서 올라 오른쪽 카드 가운데 + DY로 내려온다), 아래 줄은 안쪽(되돌아온다)
    const li = far.indexOf(p), ly = y0 - V7.LANEBOT - li * V7.LANE;
    const ax = A.x + A.w / 2, bx = B.x + B.w / 2, o = V7.DY;
    const tp = [[ax - o, y0], [ax - o, ly - o], [bx + o, ly - o], [bx + o, y0 - 2 * V7.W1]];
    const bp = [[bx - o, y0], [bx - o, ly + o], [ax + o, ly + o], [ax + o, y0 - 2 * V7.W2]];
    const mx = (ax + bx) / 2;
    return { ...p, straight: false, lane: li, top: { d: pathD(tp), pts: tp }, bottom: { d: pathD(bp), pts: bp }, topLab: [mx, ly - o - (V7.LAB - V7.DY)], botLab: [mx, ly + o + (V7.LAB - V7.DY)], wait: [mx, ly + o + (V7.WAIT - V7.DY)], dotTop: [ax - o, y0 - V7.DOTAT], dotBot: [bx - o, y0 - V7.DOTAT] };
  });
  const last = order.length ? roles.get(order[order.length - 1]) : { x: 0, y: y0, w: V7.CW, h: V7.CH };
  const builder = { x: last.x, y: y0 + V7.CH + V7.BGAP, w: V7.CW, h: V7.BH };
  // 올림: 기다리는 올림이 있는 역할마다 하나. 빌더 바로 위 역할은 곧게 내려가고, 다른 역할은 내려가서 빌더 왼쪽 변으로 꺾는다
  const counts = new Map();
  for (const x of m.raises || []) if (roles.has(x.role)) counts.set(x.role, (counts.get(x.role) || 0) + 1);
  const raises = [...counts].map(([role, n]) => {
    const R = roles.get(role), cx = R.x + R.w / 2, y1 = R.y + R.h;
    const pts = R.x === builder.x ? [[cx, y1], [cx, builder.y - 2 * V7.RAISEW]] : [[cx, y1], [cx, builder.y + builder.h / 2], [builder.x - 2 * V7.RAISEW, builder.y + builder.h / 2]];
    return { role, n, pts, d: pathD(pts), lab: [cx + V7.RAISELX, (y1 + (R.x === builder.x ? builder.y : builder.y + builder.h / 2)) / 2] };
  });
  const w = Math.max(V7.CW, ...[...roles.values()].map((r) => r.x + r.w), builder.x + builder.w);
  return { w, h: builder.y + builder.h, dim: m.status !== 'on', order, roles, builder, pairs, raises };
}

// ---- 세션 맵 트리에서 rig 역할·빌더 세션 빼기(RIG_VIEW.hideInTree) ----
export function hideRigSessions(graph, on = RIG_VIEW.hideInTree) {
  if (!graph || !on) return graph;
  const gone = new Set(graph.nodes.filter((n) => n.kind === 'session' && n.rigRole).map((n) => n.id));
  if (!gone.size) return graph;
  return { ...graph, nodes: graph.nodes.filter((n) => !gone.has(n.id)).map((n) => (gone.has(n.parentId) || gone.has(n.lineageParent) || (n.peers || []).some((p) => gone.has(p)) ? { ...n, parentId: gone.has(n.parentId) ? null : n.parentId, lineageParent: gone.has(n.lineageParent) ? null : n.lineageParent, peers: (n.peers || []).filter((p) => !gone.has(p)) } : n)), edges: graph.edges.filter((e) => !gone.has(e.from) && !gone.has(e.to)) };
}

// ---- 캔버스 ----
// 지도 자료에서 역할 이름 → 지금 세션 ID(창의 세션 값이 이긴다: rigRole·워크스페이스가 맞는 열린 세션)
export function roleSessions(m, sessions) {
  const out = new Map();
  if (!m) return out;
  for (const s of sessions && sessions.values ? sessions.values() : sessions || []) if (s && s.rigRole && (s.workspaceKey || null) === m.workspace && !out.has(s.rigRole)) out.set(s.rigRole, s.sessionId);
  for (const r of m.roles || []) if (!out.has(r.name) && r.session && r.session.sessionId) out.set(r.name, r.session.sessionId);
  if (!out.has(BUILDER_ROLE) && m.builder && m.builder.sessionId) out.set(BUILDER_ROLE, m.builder.sessionId);
  return out;
}
// 켜진 rig의 길 선: 역할 쌍마다 하나(정의에서 나온다, 연결 기록이 아니다, 끊을 수 없다). 올림은 기다리는 동안만 빌더로 점선.
// here(sessionId) → 캔버스에 그 노드가 있나. → [{ id, kind: 'path' | 'raise', ws, source, target, a, b, fwd, back, forBack, waiting, openA, openB, flows }]
export function rigEdges(maps, sessions, here = () => true) {
  const out = [];
  for (const m of maps || []) {
    if (!m || m.status !== 'on') continue;
    const names = (m.roles || []).map((r) => r.name);
    const sid = roleSessions(m, sessions);
    const flows = m.flows || [];
    for (const p of rolePairs(names, flows)) {
      const sa = sid.get(p.a), sb = sid.get(p.b);
      if (!sa || !sb || !here(sa) || !here(sb)) continue;
      const fl = p.flows.map((i) => flows[i]).filter(Boolean);
      const waiting = fl.reduce((s, f) => s + (f.waiting || 0), 0);
      const openA = fl.some((f) => f.openReturns > 0 && list(f.from).includes(p.a));
      const openB = fl.some((f) => f.openReturns > 0 && list(f.from).includes(p.b));
      // P254: lines = V7 두 줄(a → b, b → a). 캔버스가 노드 자리를 보고 왼쪽 노드 → 오른쪽 노드 줄을 위에 둔다(RigLines.jsx)
      out.push({ id: `rig:${m.workspace}:${p.key}`, kind: 'path', ws: m.workspace, source: sa, target: sb, a: p.a, b: p.b, fwd: p.fwd, back: p.back, forBack: p.forBack, waiting, openA, openB, flows: p.flows, lines: pairLines(p.a, p.b, flows) });
    }
    const bsid = sid.get(BUILDER_ROLE);
    if (bsid && here(bsid)) {
      const seen = new Set();
      for (const x of m.raises || []) {
        const s = sid.get(x.role);
        if (!s || seen.has(x.role) || !here(s)) continue;
        seen.add(x.role);
        out.push({ id: `rig:${m.workspace}:raise:${x.role}`, kind: 'raise', ws: m.workspace, source: s, target: bsid, a: x.role, b: BUILDER_ROLE, n: (m.raises || []).filter((y) => y.role === x.role).length });
      }
    }
  }
  return out;
}
// 길 선 글: "가설 → · ← 검증 결과", 기다리면 " · 3"
export function pathText(e, t) {
  if (!e) return '';
  const a = (e.fwd || []).map((x) => x + ' →'), b = (e.back || []).map((x) => '← ' + x);
  const s = [...a, ...b].join(' · ');
  return e.waiting ? s + ' · ' + t('rigMap.waitingShort', { n: e.waiting }) : s;
}
// 노드 꼬리표: 역할 세션 → { kind: 'role', role, docN, intake: [종류], beat, sectors }, 빌더 → { kind: 'builder' },
//   P254: rig가 켜진 워크스페이스의 다른 세션 → { kind: 'general' }(시안 V7 "일반 세션"), 아니면 null
export function rigTag(s, mapOf) {
  if (!s) return null;
  if (!s.rigRole) { const g = mapOf ? mapOf(s.workspaceKey || null) : null; return g && g.status === 'on' && g.workspace === (s.workspaceKey || null) ? { kind: 'general' } : null; }
  if (s.rigRole === BUILDER_ROLE) return { kind: 'builder' };
  const m = mapOf ? mapOf(s.workspaceKey || null) : null;
  const r = m && (m.roles || []).find((x) => x.name === s.rigRole);
  return { kind: 'role', role: s.rigRole, docN: r ? r.docN ?? null : null, intake: r ? r.intake || [] : [], beat: r ? r.beat || null : null, sectors: r ? (r.sectors || []).map((x) => x.path) : [], ws: m ? m.workspace : null };
}
// 캔버스 rig 테두리(RIG_VIEW.canvasFrame): 켜진 rig마다 역할 노드 사각형을 감싼 상자
export function rigFrames(maps, sessions, rectOf, pad = 40) {
  const out = [];
  for (const m of maps || []) {
    if (!m || m.status !== 'on') continue;
    const rs = [...roleSessions(m, sessions).entries()].filter(([k]) => k !== BUILDER_ROLE).map(([, sid]) => rectOf(sid)).filter(Boolean);
    if (!rs.length) continue;
    const x0 = Math.min(...rs.map((r) => r.x)), y0 = Math.min(...rs.map((r) => r.y)), x1 = Math.max(...rs.map((r) => r.x + r.w)), y1 = Math.max(...rs.map((r) => r.y + r.h));
    out.push({ ws: m.workspace, x: x0 - pad, y: y0 - pad, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2 });
  }
  return out;
}

// ---- 머리 띠·휴대폰 ----
// 다음 박자까지 남은 때(분·시간) → { n, unit } | null
export function untilText(at, now = Date.now()) {
  if (!at) return null;
  const ms = Math.max(0, at - now);
  if (ms < 3600000) return { n: Math.max(1, Math.round(ms / 60000)), unit: 'm' };
  if (ms < 86400000 * 2) return { n: Math.round(ms / 3600000), unit: 'h' };
  return { n: Math.round(ms / 86400000), unit: 'd' };
}
// 휴대폰 rig 카드 줄: 역할 목록(상태)·길 목록(수)·최근 꼭지
export function phoneRig(m, live = null) {
  if (!m) return null;
  const roles = (m.roles || []).map((r) => {
    const cur = r.session && live && live.get ? live.get(r.session.sessionId) : null;
    const state = cur ? cur.state : r.session ? (r.session.asleep ? 'sleeping' : r.session.state) : r.gaveUp ? 'gaveUp' : 'none';
    return { name: r.name, sessionId: r.session ? r.session.sessionId : null, state, received: r.received || 0 };
  });
  const flows = (m.flows || []).map((f) => ({ item: f.item, from: list(f.from).join(', '), to: list(f.to).join(', '), put: f.cycle ? f.cycle.put : 0, waiting: f.waiting || 0, open: f.openReturns || 0 }));
  return { key: m.workspace, status: m.status, name: m.name, versionN: m.versionN, cycle: m.head ? m.head.cycle : null, attention: m.head ? m.head.attention : 0, stalled: m.head ? m.head.stalled : 0, roles, flows, entry: m.entry };
}

// P252: 박자·도구 주기를 사람 말로(사전 rigPeriod). every: 정의 값("1d", "6h", "30m", "1.5h"), at: "07:00" | null
//   → "매일 07:00", "6시간마다", "every day 07:00", "every 6 hours". 하루 단위가 아닌 주기의 at은 기준 시각("6시간마다(07:00 기준)").
//   꼴을 모르는 값은 원래 값 그대로(at이 있으면 뒤에 붙인다)
const PERIOD_RE = /^(\d+(?:\.\d+)?)\s*([smhd])$/;
export function periodText(every, at, t) {
  const raw = every == null ? '' : String(every).trim();
  const m = PERIOD_RE.exec(raw);
  if (!m) return [raw, at].filter(Boolean).join(' ');
  const base = Number(m[1]) === 1 ? t(`rigPeriod.single.${m[2]}`) : t(`rigPeriod.multi.${m[2]}`, { n: m[1] });
  return at ? t(m[2] === 'd' ? 'rigPeriod.at' : 'rigPeriod.from', { period: base, at }) : base;
}
