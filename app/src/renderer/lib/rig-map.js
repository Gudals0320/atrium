// P251: rig를 눈으로 보기(docs research rig3-map.md 3·4절). P253: 세션 맵 지도는 8절(쌍마다 선 하나, 한 줄 차례, 카드가 다 담음, 트리 위 고정된 rig 띠)로 다시 그렸다.
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

// ---- P253 지도 치수(세계 px, 참고 그림 experiments/rig-map/map-v2-rig-trade 와 같은 비율) ----
// PAD 테두리 안 여백, HEADH 머리 띠, CW 카드 폭, GAP 카드 사이(이름표가 길면 넓힌다), LABW 이름표 최소 폭, LABROW 이름표 한 줄, CHAR 이름표 글 한 자 폭(12px 고정폭)
// LANE 위로 도는 선 사이 높이, LANETOP 머리 띠 아래 첫 선까지, LANEBOT 가장 낮은 선에서 카드 위까지, TITLEH 카드 첫 줄, LINEH 카드 줄, CPADY 카드 위아래 여백
// BANDH 사이클·변경 기록 띠, ENTRYOPEN 펼친 변경 기록 띠, BANDGAP 띠 사이, FOLDH 접힌 지도(머리 띠 한 줄), RIGGAP 지도 띠와 트리 사이(세계 px), MAPGAP 지도 사이(세계 px)
export const RM = {
  PAD: 32, HEADH: 56, CW: 264, GAP: 216, LABW: 168, LABROW: 20, LABPADY: 4, CHAR: 7.4, LANE: 44, LANETOP: 36, LANEBOT: 72, LANESTEP: 18,
  TITLEH: 28, LINEH: 22, CPADY: 14, CARDTOP: 40, BANDH: 40, ENTRYOPEN: 200, BANDGAP: 12, FOLDH: 56, RIGGAP: 160, MAPGAP: 48, MINW: 900,
  SCALE: 1.5, // 지도 한 장을 세션 맵 세계에 놓는 배율(트리 카드 글과 맞춘다). mapLayout은 배율 1, placeMaps가 곱한다
};

const list = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const r1 = (v) => Math.round(v * 10) / 10;
export const pathD = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${r1(p[0])} ${r1(p[1])}`).join(' ');

// 역할 카드의 줄(차례: 세션 / 박자 / 쥔 것 / 최근 항목 / 도구(하나씩) / 입력 / 받은 것·답 없음 / 올림). 해당 없는 줄은 뺀다(설계 8.2-5)
//   → [{ k: 'session'|'beat'|'owns'|'recent'|'tool'|'intake'|'counts'|'raise', ... }]
export function cardLines(r, m) {
  if (!r) return [];
  const out = [];
  if (r.launcher || r.model) out.push({ k: 'session', launcher: r.launcher || null, model: r.model || null });
  if (r.beat) out.push({ k: 'beat', every: r.beat.every || null, at: r.beat.at || null, cycle: !!r.beat.cycle });
  const sectors = r.sectors || [];
  if (sectors.length) out.push({ k: 'owns', paths: sectors.map((s) => s.path) });
  const items = sectors.flatMap((s) => s.items || []).sort((a, b) => (b.t || 0) - (a.t || 0));
  const more = sectors.reduce((s, x) => s + (x.more || 0), 0);
  if (items.length) out.push({ k: 'recent', items, more }); // 몇 개가 통째로 드는지는 recentFit이 정한다(그 밖은 +n)
  for (const x of r.tools || []) out.push({ k: 'tool', tool: x });
  if ((r.intake || []).length) out.push({ k: 'intake', items: r.intake });
  if (r.received || r.unanswered || r.material || r.foreign) out.push({ k: 'counts', received: r.received || 0, unanswered: r.unanswered || 0, material: r.material || 0, foreign: r.foreign || 0 });
  const nr = ((m && m.raises) || []).filter((x) => x.role === r.name).length;
  if (nr) out.push({ k: 'raise', n: nr });
  return out;
}

// 카드 "최근" 줄: 통째로 드는 항목만, 남은 것과 섹터 밖 더 있는 수는 +n. label(state) = 상태 글
export const RECENT_W = 264 - 32 - 48; // 카드 폭 - 좌우 여백 - 줄 이름 칸
export function recentFit(line, label = (s) => s, maxW = RECENT_W) {
  const texts = line.items.map((it) => it.id + ' ' + label(it.state));
  const f = fitRow(texts, maxW, { gap: 6, moreW: 30, ascii: 7.3, cjk: 12 });
  return { items: line.items.slice(0, f.n), more: f.more + (line.more || 0) };
}
// 사이클 띠: 통째로 드는 항목 사건만(까닭 글은 빼고 풍선에), 남은 것 +n. → { items, more }
export function cycleFit(items, maxW, what = (w) => w, extra = 0) {
  const CIRC = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';
  const texts = (items || []).map((c) => (CIRC[c.k - 1] || c.k + '.') + ' ' + c.id + ' ' + what(c.what));
  const f = fitRow(texts, maxW, { gap: 14, moreW: 64, ascii: 7, cjk: 13 });
  return { items: (items || []).slice(0, f.n), more: f.more + (extra || 0) };
}

// 두 역할 사이 이름표 줄(쌍마다 하나, 설계 8.2-1·2): a가 왼쪽. 방향마다 항목 종류 한 줄, 수는 이번 사이클에 낸 수가 0이 아닐 때만, 끝나지 않은 반려가 있으면 붉은 점
//   → [{ dir: 'fwd'|'back', item, n, open, for }]
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
export const rowText = (r) => (r.dir === 'fwd' ? `${r.item}${r.n ? ' ' + r.n : ''} →` : `← ${r.item}${r.n ? ' ' + r.n : ''}`);
const labelBox = (rows) => ({ w: Math.max(RM.LABW, Math.ceil(Math.max(...rows.map((r) => rowText(r).length + (r.open ? 2 : 0))) * RM.CHAR + 28)), h: rows.length * RM.LABROW + RM.LABPADY * 2 + 2 });

// 지도 한 장의 그림(지도 왼쪽 위 = 0, 0, 설계 8.2)
//   → { w, h, folded, dim, head: { x, y, w, h }, order: [이름], roles: Map 이름 → { x, y, w, h, lines },
//       pairs: [{ key, a, b, straight, lane, pts, d, label: { x, y, w, h }, rows, tipA, tipB }], cycle, entry }
// opts: { folded(머리 띠만), entryOpen }
export function mapLayout(m, opts = {}) {
  if (!m) return null;
  const off = m.status !== 'on';
  const roleList = m.roles || [];
  const byName = new Map(roleList.map((r) => [r.name, r]));
  const flows = m.flows || [];
  const beatRole = (m.head && m.head.beat && m.head.beat.role) || null;
  const order = rowOrder(roleList.map((r) => r.name), flows, { beatRole });
  const pos = new Map(order.map((n, i) => [n, i]));
  // 쌍(사람·빌더는 쌍이 아니다): a = 왼쪽
  const pairs = rolePairs(order, flows).map((p) => { const [a, b] = pos.get(p.a) <= pos.get(p.b) ? [p.a, p.b] : [p.b, p.a]; return { key: a + '|' + b, a, b, rows: pairRows(a, b, flows) }; }).filter((p) => p.rows.length);
  // 카드 사이 틈: 이웃한 쌍의 이름표가 들어갈 만큼
  const gaps = order.slice(1).map((_, i) => { const p = pairs.find((q) => pos.get(q.a) === i && pos.get(q.b) === i + 1); return p ? Math.max(RM.GAP, labelBox(p.rows).w + 48) : RM.GAP; });
  const xs = []; let x = RM.PAD;
  order.forEach((n, i) => { xs.push(x); x += RM.CW + (gaps[i] || 0); });
  const cardsW = order.length ? x - RM.PAD : 0;
  const w = Math.max(RM.MINW, RM.PAD * 2 + cardsW);
  const head = { x: 0, y: 0, w, h: opts.folded ? RM.FOLDH : RM.HEADH };
  if (opts.folded) return { w, h: RM.FOLDH, folded: true, dim: off, head, order, roles: new Map(), pairs: [], cycle: null, entry: null };
  // 위로 도는 쌍: 걸친 폭이 짧은 것이 아래(카드에 가까이)
  const far = pairs.filter((p) => pos.get(p.b) - pos.get(p.a) > 1).sort((p, q) => (pos.get(p.b) - pos.get(p.a)) - (pos.get(q.b) - pos.get(q.a)) || pos.get(p.a) - pos.get(q.a));
  const nLane = far.length;
  const cardsY = RM.HEADH + (nLane ? RM.LANETOP + (nLane - 1) * RM.LANE + RM.LANEBOT : RM.CARDTOP);
  const lines = new Map(order.map((n) => [n, cardLines(byName.get(n), m)]));
  const maxL = Math.max(0, ...[...lines.values()].map((l) => l.length));
  const ch = RM.CPADY * 2 + RM.TITLEH + maxL * RM.LINEH;
  const roles = new Map(order.map((n, i) => [n, { x: xs[i], y: cardsY, w: RM.CW, h: ch, lines: lines.get(n) }]));
  const out = [];
  // 곧은 선: 카드 가운데 높이, 왼쪽 카드 오른쪽 변 → 오른쪽 카드 왼쪽 변. 이름표는 틈 가운데
  for (const p of pairs) {
    const A = roles.get(p.a), B = roles.get(p.b);
    const fwd = p.rows.some((r) => r.dir === 'fwd'), back = p.rows.some((r) => r.dir === 'back');
    const lb = labelBox(p.rows);
    let pts, label;
    if (pos.get(p.b) - pos.get(p.a) === 1) {
      const y = A.y + A.h / 2;
      pts = [[A.x + A.w + 2, y], [B.x - 2, y]];
      label = { x: (A.x + A.w + B.x) / 2 - lb.w / 2, y: y - lb.h / 2, w: lb.w, h: lb.h };
      out.push({ ...p, straight: true, lane: null, pts, d: pathD(pts), label, tipA: back, tipB: fwd });
    } else {
      const li = far.indexOf(p);
      const ly = cardsY - RM.LANEBOT - li * RM.LANE;
      // 한 카드에서 여러 선이 오르면 겹치지 않게 자리를 비킨다
      const k = far.slice(0, li).filter((q) => q.a === p.a || q.b === p.a).length, k2 = far.slice(0, li).filter((q) => q.a === p.b || q.b === p.b).length;
      const ax = A.x + Math.round(A.w * 2 / 3) - k * RM.LANESTEP, bx = B.x + Math.round(B.w / 3) + k2 * RM.LANESTEP;
      pts = [[ax, A.y - 2], [ax, ly], [bx, ly], [bx, B.y - 2]];
      label = { x: (ax + bx) / 2 - lb.w / 2, y: ly - lb.h / 2, w: lb.w, h: lb.h };
      out.push({ ...p, straight: false, lane: li, pts, d: pathD(pts), label, tipA: back, tipB: fwd });
    }
  }
  let by = cardsY + ch + RM.CARDTOP;
  const cycle = { x: RM.PAD, y: by, w: w - RM.PAD * 2, h: RM.BANDH }; by += RM.BANDH + RM.BANDGAP;
  const entry = { x: RM.PAD, y: by, w: w - RM.PAD * 2, h: m.entry && opts.entryOpen ? RM.ENTRYOPEN : RM.BANDH }; by += entry.h;
  return { w, h: by + RM.PAD, folded: false, dim: off, head, order, roles, pairs: out, cycle, entry, lanes: nLane };
}

// ---- P253 띠·카드 줄의 글(자르지 않고 통째로 든 것만, 남은 수는 +n) ----
// 글 폭 어림(px): 한글·한자·가나는 cjk, 그 밖은 ascii(글꼴마다 다르게 준다)
export function textW(s, { ascii = 7.3, cjk = 12 } = {}) {
  let w = 0;
  for (const ch of String(s || '')) { const c = ch.codePointAt(0); w += (c >= 0x1100 && c <= 0x11ff) || (c >= 0x2460 && c <= 0x24ff) || (c >= 0x2e80 && c <= 0xa4cf) || (c >= 0xac00 && c <= 0xd7af) || (c >= 0xff00 && c <= 0xffef) ? cjk : ascii; }
  return w;
}
// texts를 앞에서부터 폭 maxW 안에 통째로 든 만큼 → { n: 보이는 수, more: 남은 수 }. 남는 것이 있으면 "+n" 자리(moreW)를 비워 둔다. 하나도 안 들어가면 0과 +전체
export function fitRow(texts, maxW, { gap = 6, moreW = 30, ...wopt } = {}) {
  const ws = (texts || []).map((s) => textW(s, wopt));
  let used = 0, n = 0;
  for (let i = 0; i < ws.length; i++) {
    const need = (n ? gap : 0) + ws[i];
    const rest = ws.length - i - 1;
    if (used + need + (rest ? gap + moreW : 0) > maxW) break;
    used += need; n++;
  }
  return { n, more: ws.length - n };
}
// 변경 기록 꼭지 → 한 줄 맨 글: 마크다운 표시(머리 #, **, __, `, 목록 머리, [글](주소))를 빼고 줄을 이어, maxChars 안에서 문장 끝에서 잘라 "…"
export function plainEntry(text, maxChars = 200) {
  let s = String(text || '').replace(/\r\n/g, '\n');
  s = s.replace(/^\s{0,3}#{1,6}\s*/gm, '').replace(/^\s*(?:[-*+]|\d+[.)])\s+/gm, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
  s = s.replace(/\*\*|__|`/g, '').replace(/(^|\s)[*_](\S[^*_]*?)[*_](?=\s|[.,!?]|$)/g, '$1$2');
  s = s.replace(/\s+/g, ' ').trim();
  if (s.length <= maxChars) return s;
  const cut = s.slice(0, maxChars);
  let end = -1;
  const re = /[.!?。](?=\s|$)|다\.(?=\s|$)/g; let m;
  while ((m = re.exec(cut))) end = m.index + m[0].length;
  return (end > maxChars * 0.3 ? cut.slice(0, end) : cut.replace(/\s+\S*$/, '')).trim() + ' …';
}

// 접힘: 사람이 접거나 편 것(mem: 워크스페이스 키 → true 접힘 | false 펼침)을 지키고, 없으면 꺼진 rig만 접는다
export const foldedOf = (m, mem) => (m && mem && Object.prototype.hasOwnProperty.call(mem, m.workspace) ? !!mem[m.workspace] : !!m && m.status !== 'on');

// ---- 세션 맵 안 자리(설계 8.3): 트리 위 고정된 rig 띠. 트리 bounds 왼쪽 위에 맞추고 위로 쌓는다(여럿이면 이름 차례로 위에서 아래).
//   트리 배치(열·줄)를 읽기만 하고 바꾸지 않는다. 트리도 지도를 모른다. → { items: [{ key, x, y, w, h, scale }](세계 px, RM.SCALE를 곱한 크기), band: { x, y, w, h }, bounds } | null
export function placeMaps(lay, maps, geo) {
  if (!lay || !maps || !maps.length) return null;
  const ms = maps.filter((m) => geo.get(m.workspace)).sort((a, b) => String(a.name || a.workspace).localeCompare(String(b.name || b.workspace)) || String(a.workspace).localeCompare(String(b.workspace)));
  if (!ms.length) return null;
  const b0 = lay.bounds;
  const x = b0.x || 0;
  const S = RM.SCALE;
  const total = ms.reduce((s, m) => s + geo.get(m.workspace).h * S, 0) + RM.MAPGAP * (ms.length - 1);
  let y = (b0.y || 0) - RM.RIGGAP - total;
  const top = y;
  const items = ms.map((m) => { const g = geo.get(m.workspace); const it = { key: m.workspace, x, y, w: g.w * S, h: g.h * S, scale: S }; y += g.h * S + RM.MAPGAP; return it; });
  const bw = Math.max(...items.map((i) => i.w));
  const band = { x, y: top, w: bw, h: total };
  const right = Math.max(x + bw, (b0.x || 0) + b0.w);
  const bounds = { x: Math.min(x, b0.x || 0), y: top, w: right - Math.min(x, b0.x || 0), h: (b0.y || 0) + b0.h - top };
  return { items, band, bounds };
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
