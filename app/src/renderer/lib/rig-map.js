// P251: rig를 눈으로 보기(docs research rig3-map.md 3·4절). 세션 맵의 구조 지도와 캔버스의 길 선의 순수 함수(단위 시험 test/p251-lib.test.mjs).
// 자료는 판 API rig.map(backend rig-map.mjs), 역할 차례는 공유 배치(backend rig-map-layout.mjs roleOrder·rolePairs).
// 6절 "설계 쪽이 고른 넷"은 RIG_VIEW 한 곳에서 뒤집는다(값 하나씩).
import { roleOrder, rolePairs, RIG_LAYOUT } from '../../../../backend/src/rig-map-layout.mjs';
import { HUMAN, BUILDER_ROLE } from '../../../../backend/src/rig-def-names.mjs';

export { roleOrder, rolePairs, HUMAN, BUILDER_ROLE };

// ---- 6절 넷의 뒤집기 자리(설정 값 하나씩). 기본값이 설계 쪽이 고른 것이다 ----
// sectorsUnder: 섹터와 도구를 주인 역할 아래에 매단다 | false = 시안처럼 오른쪽 끝에 따로 칸
// hideInTree:   역할 세션과 빌더를 세션 맵 트리에서 빼고 지도에만 | false = 트리에도 두고 지도와 선으로 잇는다
// canvasExtras: 캔버스에는 길 선과 꼬리표만 | true = 꼬리표에 섹터와 박자도 붙인다
// canvasFrame:  캔버스에서 역할 묶음에 테두리를 두르지 않는다 | true = 옅은 테두리로 rig를 묶는다
export const RIG_VIEW = { sectorsUnder: true, hideInTree: true, canvasExtras: false, canvasFrame: false };

// ---- 지도 치수(세계 px) ----
export const RM = {
  HEAD: 64, PAD: 24, OUTW: 250, OUTGAP: 70, RW: 300, RGX: 210, RH: 156, RGY: 46, LINEGAP: 70,
  LANE: 24, LANETOP: 18, SECH: 36, ITEMH: 26, MOREH: 24, TOOLH: 54, STACKGAP: 10, SIDEW: 300,
  CYCLEH: 74, ENTRYH: 72, ENTRYOPEN: 220, BANDGAP: 14, FOLDW: 420, FOLDH: 72, HUMANH: 120, BUILDERH: 120,
  MAXCOLS: RIG_LAYOUT.MAXCOLS, AREAGAP: 160, MAPGAP: 48,
};

const list = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const r1 = (v) => Math.round(v * 10) / 10;
export const pathD = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${r1(p[0])} ${r1(p[1])}`).join(' ');

// 역할 기둥 높이(카드 + 매단 섹터·도구)
export function stackHeight(role, { sectorsUnder = RIG_VIEW.sectorsUnder } = {}) {
  if (!sectorsUnder || !role) return RM.RH;
  let h = RM.RH;
  for (const s of role.sectors || []) h += RM.STACKGAP + RM.SECH + Math.max(1, (s.items || []).length) * RM.ITEMH + (s.more ? RM.MOREH : 0);
  h += (role.tools || []).length * (RM.STACKGAP + RM.TOOLH);
  return h;
}
// 길 글: "가설 3 · 받음 2 · 반려 1"(이번 사이클). 수가 없으면 종류만. 답 길은 "결과 (가설의 답)"
export function flowText(f, t) {
  if (!f) return '';
  const c = f.cycle || {};
  const parts = [f.for ? t('rigMap.forText', { item: f.item, of: f.for }) : f.item];
  if (c.put) parts[0] += ' ' + c.put;
  if (c.accepted) parts.push(t('rigMap.accepted', { n: c.accepted }));
  if (c.returned) parts.push(t('rigMap.returned', { n: c.returned }));
  if (f.waiting) parts.push(t('rigMap.waiting', { n: f.waiting }));
  return parts.join(' · ');
}

// 지도 한 장의 그림(지도 왼쪽 위 = 0, 0) → { w, h, folded, head, out: { x, y, w, h }, zone: { x, y, w, h }, human, builder, roles: Map 이름 → 카드 상자,
//   sectors: [{ role, x, y, w, h, path, items, more }], tools: [...], side(오른쪽 칸), lines: [{ id, kind, flow, d, pts, label: { x, y, text? }, from, to, hot, openEnd }],
//   cycle: { y, h }, entry: { y, h } }
// opts: { folded, open(꺼진 rig를 펼침), entryOpen, sectorsUnder }
export function mapLayout(m, opts = {}) {
  const sectorsUnder = opts.sectorsUnder ?? RIG_VIEW.sectorsUnder;
  if (!m) return null;
  const off = m.status !== 'on';
  if (off && !opts.open) return { w: RM.FOLDW, h: RM.FOLDH, folded: true, lines: [], roles: new Map(), sectors: [], tools: [] };
  const names = (m.roles || []).map((r) => r.name);
  const byName = new Map((m.roles || []).map((r) => [r.name, r]));
  const flows = m.flows || [];
  const o = roleOrder(names, flows, { maxCols: RM.MAXCOLS });
  const zoneX = RM.PAD + RM.OUTW + RM.OUTGAP;
  // 길 분류: 같은 줄 바로 옆 칸 앞으로 = 곧은(direct), 그 밖(뒤로·건너뜀·같은 칸·답 길·사람 입력·올림) = 위 길(lane)
  const conns = [];
  flows.forEach((f) => {
    for (const a of list(f.from)) for (const b of list(f.to)) {
      if (!byName.has(b)) continue;
      if (a === HUMAN) { conns.push({ kind: 'intake', a, b, f }); continue; }
      if (!byName.has(a) || a === b) continue;
      const direct = !f.for && o.line.get(a) === o.line.get(b) && o.layer.get(b) === o.layer.get(a) + 1;
      conns.push({ kind: direct ? 'direct' : f.for ? 'answer' : 'lane', a, b, f });
    }
  });
  const raised = new Map();
  for (const x of m.raises || []) if (byName.has(x.role)) raised.set(x.role, (raised.get(x.role) || 0) + 1);
  for (const [role, n] of raised) conns.push({ kind: 'raise', a: role, b: BUILDER_ROLE, n });
  // 줄마다 위 길 칸 수
  const laneOf = new Map(); const laneN = new Map();
  for (const c of conns) {
    if (c.kind === 'direct') continue;
    const l = c.kind === 'intake' || c.kind === 'raise' ? o.line.get(c.kind === 'intake' ? c.b : c.a) : Math.min(o.line.get(c.a), o.line.get(c.b));
    const i = laneN.get(l) || 0; laneN.set(l, i + 1); laneOf.set(c, { line: l, i });
  }
  // 줄·칸·기둥 자리
  const stackH = (n) => stackHeight(byName.get(n), { sectorsUnder });
  const roles = new Map(); const lines = [];
  let y = RM.HEAD + RM.PAD;
  const lineTop = [];
  for (let l = 0; l < Math.max(1, o.lines); l++) {
    const lanes = laneN.get(l) || 0;
    lineTop.push(y);
    const cardsY = y + (lanes ? RM.LANETOP + lanes * RM.LANE + RM.LANETOP : RM.LANETOP);
    let maxH = 0;
    for (let c = 0; c < RM.MAXCOLS; c++) {
      const L = l * RM.MAXCOLS + c;
      const here = o.cols[L] || [];
      let cy = cardsY;
      for (const n of here) { roles.set(n, { x: zoneX + RM.PAD + c * (RM.RW + RM.RGX), y: cy, w: RM.RW, h: RM.RH, stack: stackH(n), line: l, col: c, row: o.row.get(n) }); cy += stackH(n) + RM.RGY; }
      maxH = Math.max(maxH, cy - RM.RGY - cardsY);
    }
    y = cardsY + Math.max(RM.RH, maxH) + RM.LINEGAP;
  }
  const nCols = Math.max(1, Math.min(RM.MAXCOLS, o.cols.length));
  let zoneW = RM.PAD * 2 + nCols * RM.RW + (nCols - 1) * RM.RGX;
  // 섹터·도구: 역할 아래(기본) 또는 오른쪽 칸
  const sectors = [], tools = [];
  let side = null;
  if (sectorsUnder) {
    for (const [n, b] of roles) {
      let sy = b.y + RM.RH;
      const r = byName.get(n);
      for (const s of r.sectors || []) { const h = RM.SECH + Math.max(1, (s.items || []).length) * RM.ITEMH + (s.more ? RM.MOREH : 0); sectors.push({ role: n, x: b.x + 18, y: sy + RM.STACKGAP, w: RM.RW - 18, h, path: s.path, items: s.items || [], more: s.more || 0 }); sy += RM.STACKGAP + h; }
      for (const t of r.tools || []) { tools.push({ role: n, x: b.x + 18, y: sy + RM.STACKGAP, w: RM.RW - 18, h: RM.TOOLH, ...t }); sy += RM.STACKGAP + RM.TOOLH; }
    }
  } else {
    const sx = zoneX + zoneW + RM.OUTGAP;
    let sy = RM.HEAD + RM.PAD + RM.LANETOP;
    for (const n of names) {
      const r = byName.get(n);
      for (const s of r.sectors || []) { const h = RM.SECH + Math.max(1, (s.items || []).length) * RM.ITEMH + (s.more ? RM.MOREH : 0); sectors.push({ role: n, x: sx, y: sy, w: RM.SIDEW, h, path: s.path, items: s.items || [], more: s.more || 0, side: true }); sy += h + RM.STACKGAP; }
      for (const t of r.tools || []) { tools.push({ role: n, x: sx, y: sy, w: RM.SIDEW, h: RM.TOOLH, side: true, ...t }); sy += RM.TOOLH + RM.STACKGAP; }
    }
    side = { x: sx, y: RM.HEAD + RM.PAD, w: RM.SIDEW, h: Math.max(0, sy - RM.HEAD - RM.PAD) };
    y = Math.max(y, sy + RM.LINEGAP);
  }
  const bodyH = y - RM.LINEGAP + RM.PAD - (RM.HEAD + RM.PAD);
  const zone = { x: zoneX, y: RM.HEAD + RM.PAD, w: zoneW, h: Math.max(bodyH, RM.HUMANH + RM.BUILDERH + 80) };
  const out = { x: RM.PAD, y: zone.y, w: RM.OUTW, h: zone.h };
  const human = (m.intake || []).length ? { x: out.x + 16, y: out.y + 40, w: out.w - 32, h: RM.HUMANH } : null;
  const builder = { x: out.x + 16, y: out.y + out.h - RM.BUILDERH - 20, w: out.w - 32, h: RM.BUILDERH };
  // 선
  const mid = (b) => b.y + b.h / 2;
  const sameCount = new Map();
  for (const c of conns) {
    const A = c.kind === 'intake' ? human : roles.get(c.a);
    const B = c.kind === 'raise' ? builder : roles.get(c.b);
    if (!A || !B) continue;
    let pts, label;
    if (c.kind === 'direct') {
      const k = c.a + '>' + c.b; const n = sameCount.get(k) || 0; sameCount.set(k, n + 1);
      const ay = mid(A) - 16 + n * 22, by = mid(B) - 16 + n * 22, mx = A.x + A.w + RM.RGX / 2;
      pts = ay === by ? [[A.x + A.w, ay], [B.x, by]] : [[A.x + A.w, ay], [mx, ay], [mx, by], [B.x, by]];
      label = { x: A.x + A.w + RM.RGX / 2, y: ay - 4, w: RM.RGX - 16 };
    } else {
      const ln = laneOf.get(c);
      const ly = lineTop[ln.line] + RM.LANETOP + ln.i * RM.LANE + RM.LANE / 2;
      if (c.kind === 'intake') {
        const ex = zone.x - 26;
        pts = [[A.x + A.w, mid(A)], [ex, mid(A)], [ex, ly], [B.x + 40, ly], [B.x + 40, B.y]];
        label = { x: (ex + B.x + 40) / 2, y: ly - 2, w: Math.max(120, B.x + 40 - ex - 16) };
      } else if (c.kind === 'raise') {
        const sx0 = A.x + 24, ex = zone.x - 12;
        pts = [[sx0, A.y], [sx0, ly], [ex, ly], [ex, mid(B)], [B.x + B.w, mid(B)]];
        label = { x: (sx0 + ex) / 2, y: ly - 2, w: Math.max(100, sx0 - ex - 16) };
      } else {
        const ax = A.x + A.w - 40 - (ln.i % 3) * 14, bx = B.x + 40 + (ln.i % 3) * 14;
        pts = [[ax, A.y], [ax, ly], [bx, ly], [bx, B.y]];
        label = { x: (ax + bx) / 2, y: ly - 2, w: Math.max(120, Math.abs(bx - ax) - 24) };
      }
    }
    const f = c.f;
    lines.push({
      id: c.kind + ':' + (f ? f.i : 'r') + ':' + c.a + '>' + c.b, kind: c.kind, flow: f ? f.i : null, from: c.a, to: c.b, n: c.n || 0,
      pts, d: pathD(pts), label, hot: !!(f && f.waiting > 0), openEnd: f && f.openReturns > 0 ? pts[0] : null,
    });
  }
  // 빌더의 고침: 점선, 빌더에서 rig 칸 테두리로(역할마다 긋지 않는다)
  lines.push({ id: 'builder-fix', kind: 'fix', from: BUILDER_ROLE, to: null, pts: [[builder.x + builder.w, builder.y + 30], [zone.x, builder.y + 30]], d: pathD([[builder.x + builder.w, builder.y + 30], [zone.x, builder.y + 30]]), label: { x: (builder.x + builder.w + zone.x) / 2, y: builder.y + 26, w: zone.x - builder.x - builder.w - 8 }, hot: false, openEnd: null });
  const w = Math.max(zone.x + zone.w, side ? side.x + side.w : 0) + RM.PAD;
  let by = zone.y + zone.h + RM.BANDGAP;
  const cycle = { x: RM.PAD, y: by, w: w - RM.PAD * 2, h: RM.CYCLEH }; by += RM.CYCLEH + RM.BANDGAP;
  const entry = m.entry ? { x: RM.PAD, y: by, w: w - RM.PAD * 2, h: opts.entryOpen ? RM.ENTRYOPEN : RM.ENTRYH } : null;
  if (entry) by += entry.h + RM.BANDGAP;
  return { w, h: by + RM.PAD - RM.BANDGAP, folded: false, dim: off, head: { x: 0, y: 0, w, h: RM.HEAD }, out, zone, human, builder, roles, sectors, tools, side, lines, cycle, entry, order: o };
}

// ---- 세션 맵 안 자리: 트리 오른쪽 rig 영역. 지도 위를 그 워크스페이스 줄에 맞추고, 겹치면 아래로 민다 ----
// lay: lineageLayout 결과(rows, bounds), maps: [자료], geo: 키 → mapLayout. → { x, items: [{ key, x, y, w, h, link: { d } }], bounds }
export function placeMaps(lay, maps, geo) {
  if (!lay || !maps || !maps.length) return null;
  const x = (lay.bounds.x || 0) + lay.bounds.w + RM.AREAGAP;
  const items = [];
  let bottom = -Infinity;
  const rowOf = new Map(lay.rows.map((r) => [r.key, r]));
  const sorted = maps.filter((m) => rowOf.has(m.workspace) && geo.get(m.workspace)).sort((a, b) => rowOf.get(a.workspace).y - rowOf.get(b.workspace).y || (rowOf.get(a.workspace).ox || 0) - (rowOf.get(b.workspace).ox || 0));
  for (const m of sorted) {
    const r = rowOf.get(m.workspace), g = geo.get(m.workspace);
    const y = Math.max(r.y + 12, bottom + RM.MAPGAP);
    const sx = r.x + r.w, sy = r.y + 40, ty = y + Math.min(40, g.h / 2);
    const mx = x - RM.AREAGAP / 2;
    const pts = Math.abs(sy - ty) < 0.5 ? [[sx, sy], [x, ty]] : [[sx, sy], [mx, sy], [mx, ty], [x, ty]];
    items.push({ key: m.workspace, x, y, w: g.w, h: g.h, link: { pts, d: pathD(pts) } });
    bottom = y + g.h;
  }
  if (!items.length) return null;
  const right = Math.max(...items.map((i) => i.x + i.w));
  const b0 = lay.bounds;
  const bounds = { x: b0.x || 0, y: b0.y || 0, w: right - (b0.x || 0) + RM.PAD, h: Math.max(b0.y + b0.h, bottom) - (b0.y || 0) };
  return { x, items, bounds };
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
      out.push({ id: `rig:${m.workspace}:${p.key}`, kind: 'path', ws: m.workspace, source: sa, target: sb, a: p.a, b: p.b, fwd: p.fwd, back: p.back, forBack: p.forBack, waiting, openA, openB, flows: p.flows });
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
// 노드 꼬리표: 역할 세션 → { kind: 'role', role, docN, intake: [종류], beat, sectors }, 빌더 → { kind: 'builder' }, 아니면 null
export function rigTag(s, mapOf) {
  if (!s || !s.rigRole) return null;
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
