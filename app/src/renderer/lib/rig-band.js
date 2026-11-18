// P198: 세션 맵의 rig 띠(docs research harness-arch.md 17절). P186의 자리 얇은 줄·흐름 줄(seatThin·seatReps·flowLines·flowPaths)을 대신한다.
// 순수 함수만 둔다(단위 시험 test/p198-lib.test.mjs). 맞춤 배율을 맞추는 동안 여러 번 불리므로 싸게: 건·일 수에 비례하는 한 번 훑기.
// - 켜진 rig가 있는 워크스페이스 줄에서 자리가 있는 세션은 나무에서 빠져 띠로 간다(bandIndex). 띠는 줄 맨 위, 나무는 띠 아래.
// - 열 = 자리(bandColumns: assign 줄의 출발 자리 → 흐름 줄 너비 우선 → 나머지 → 보이는 건이 부르는 옛 자리). 행 = 건(caseOrder: 주인 대기·막힘 → 열림 → 최근 끝난 3 → "+n 끝남" 접힌 줄).
// - 칸 안은 위 → 아래 시간 순. 칩(쉼·잠듦·확인한 끝남)과 카드는 모두 lay.cards 항목(chip·folded 표시). keep 세션은 열 머리 카드 하나이고 행 칸에는 표시(일 있음·보고·주인 대기).
// - 그래프 모양(P197, 판 mission.graph의 rig 칸): { <워크스페이스>: { seats[{ name, session, launcher, maxLive, sessions[{ sessionId, busy }] }], flow[{ index, from, on, to, max, else }],
//   cases[{ id, firstTask, state, createdAt, lastHandoffAt, closedAt, owner, ownerSessionId, cycle(줄 번호|null), lines[{ index, on, max, passed(지금 셈), escalated(올린 횟수) }],
//   units[{ unit, seat, sessionId, name('(줄)'), status, result, queued, createdAt, closedAt, via{ prevUnit, line, escalated, fromSeat, result } }], reports[{ seat, sessionId, name, unit, result, line, escalated, at }] }], openCount, openMore, doneCount } }
//   견본: test/fixtures/rig-band-graph.json(P197 backend/test/fixtures/rig-band/graph-rig.json과 같은 파일)

// PAD = 띠 안 여백, SH = 자리 머리 높이, GX = 자리 열 사이, KG = keep 머리 카드 아래 틈, CH = 행 머리 높이, CP = 행 칸 위아래 여백, ARC = 되돌아감 호 한 층 높이,
// CHIP = 칩 높이(얇은 줄과 같다), MARK = 표시 높이, IGY = 칸 안 항목 사이, RGY = 행 사이, FOLD = 접힌 줄 높이, BELOW = 띠와 아래 나무 사이(옅은 선이 지난다)
export const BAND = { PAD: 14, SH: 54, GX: 64, KG: 16, CH: 52, CP: 12, ARC: 20, CHIP: 30, MARK: 28, IGY: 10, RGY: 12, FOLD: 34, BELOW: 48, TASK: 80 };
// 휴대폰: HEAD = 건 머리(두 줄), LINK = 자리 사슬 한 줄 높이, LGAP = 사슬 칩 사이(화살표 자리)
export const BAND_PHONE = { PAD: 10, HEAD: 56, LINK: 26, LGY: 6, LGAP: 18, GY: 12 };

const LIVE = new Set(['open', 'waiting_owner', 'blocked']);
const num = (x) => Number(x) || 0;
const CHIP_TIERS = new Set(['rest', 'sleep', 'done']); // 칩이 되는 등급: 쉼·잠듦·끝남(봤음). 일하는 중·응답 필요·오류·안 본 끝남(review)은 카드
export const isChipTier = (tier) => CHIP_TIERS.has(tier);
const atOf = (c) => num(c.lastHandoffAt || c.createdAt);
const closedAt = (c) => num(c.closedAt || c.lastHandoffAt || c.createdAt);
const unitsOf = (c) => (c.units || []).slice().sort((a, b) => num(a.createdAt) - num(b.createdAt) || String(a.unit).localeCompare(String(b.unit)));

// 그래프 → { rigs: Map(워크스페이스 → R), member: Map(노드 id → { ws, seat, mode, old }) }
// 띠 세션 = 켜진 rig 워크스페이스의 세션 가운데 rigSeat가 있거나(정의에 없는 옛 자리도) 보이는 건의 일을 받은 세션. rig가 없는 판은 빈 표라 맵이 전과 같다
export function bandIndex(graph) {
  const rigs = new Map(), member = new Map();
  for (const [k, R] of Object.entries((graph && graph.rig) || {})) if (R && Array.isArray(R.seats) && R.seats.length) rigs.set(k, R);
  if (!rigs.size) return { rigs, member };
  const last = new Map(); // `${ws}|${sid}` → 가장 늦은 일의 자리
  for (const [ws, R] of rigs) for (const c of R.cases || []) for (const u of c.units || []) {
    if (!u.sessionId) continue;
    const k = `${ws}|${u.sessionId}`, p = last.get(k);
    if (!p || num(u.createdAt) >= p.at) last.set(k, { seat: u.seat, at: num(u.createdAt) });
  }
  for (const n of (graph.nodes || [])) {
    if (!n || n.kind !== 'session') continue;
    const ws = n.workspaceKey || '', R = rigs.get(ws);
    if (!R) continue;
    const u = last.get(`${ws}|${n.sessionId}`);
    const seat = n.rigSeat || (u && u.seat) || null;
    if (!seat) continue;
    const d = R.seats.find((s) => s.name === seat);
    member.set(n.id, { ws, seat, mode: d && d.session === 'keep' ? 'keep' : 'fresh', old: !d || !!d.old });
  }
  return { rigs, member };
}

// 열 순서 → [{ name, old }]. 판(P197)이 seats를 이미 규격 차례로 준다: assign 줄의 출발 자리 → 흐름 줄 너비 우선 → 나머지 → 보이는 건이 부르는 옛 자리(old).
// 그 밖에 건·세션이 부르는 자리(옛 자리)가 seats에 없으면 맨 오른쪽에 더한다
export function bandColumns(R, cases = [], extra = []) {
  const out = [], seen = new Set();
  for (const s of (R && R.seats) || []) if (s && s.name != null && !seen.has(s.name)) { seen.add(s.name); out.push({ name: s.name, old: !!s.old }); }
  const old = (s) => { if (s && !seen.has(s)) { seen.add(s); out.push({ name: s, old: true }); } };
  for (const c of cases) for (const u of unitsOf(c)) old(u.seat);
  for (const s of extra) old(s);
  return out;
}

// 끝난 건 가운데 그래프에 담기지 않은 수. doneCount = 워크스페이스의 끝난·취소된 건 전부(P197)
export const moreDone = (R, closedShown) => Math.max(0, num(R && R.doneCount) - closedShown);
// 행 순서: 주인 대기·막힘 → 열림(마지막 넘김이 최근인 것부터) → 끝난·취소된 건 가운데 최근 3개 → 나머지는 접힌 줄 { rows, hidden, more(접힌 건 수) }
export function caseOrder(R) {
  const cs = ((R && R.cases) || []).slice();
  const recent = (a, b) => atOf(b) - atOf(a);
  const urgent = cs.filter((c) => c.state === 'waiting_owner' || c.state === 'blocked').sort(recent);
  const open = cs.filter((c) => c.state === 'open').sort(recent);
  const closed = cs.filter((c) => !LIVE.has(c.state)).sort((a, b) => closedAt(b) - closedAt(a));
  const hidden = closed.slice(3);
  return { rows: [...urgent, ...open, ...closed.slice(0, 3)], hidden, more: hidden.length + moreDone(R, closed.length) };
}

// 선 모양(세계 좌표). a·b = 상자 { x, y, w, h }
const r1 = (v) => Math.round(v * 10) / 10;
function fwdPath(a, b) {
  const xa = a.x + a.w, ya = a.y + Math.min(a.h / 2, 22), xb = b.x, yb = b.y + Math.min(b.h / 2, 22);
  const dx = Math.max(24, (xb - xa) * 0.5);
  return { d: `M${r1(xa)} ${r1(ya)} C${r1(xa + dx)} ${r1(ya)} ${r1(xb - dx)} ${r1(yb)} ${r1(xb)} ${r1(yb)}`, lx: r1((xa + xb) / 2), ly: r1((ya + yb) / 2) };
}
// 열을 건너뛰는 앞 선: 사이 칸의 항목을 가로지르지 않게 앞 항목 오른쪽 틈 → 행 칸 위 통로(lane) → 받는 항목 왼쪽 틈 → 받는 항목 왼 변
function skipPath(a, b, lane, gx) {
  const ya = a.y + Math.min(a.h / 2, 22), yb = b.y + Math.min(b.h / 2, 22);
  const x1 = a.x + a.w + gx / 2, x2 = b.x - gx / 2;
  const pts = [[a.x + a.w, ya], [x1, ya], [x1, lane], [x2, lane], [x2, yb], [b.x, yb]];
  return { d: pts.map((q, i) => `${i ? 'L' : 'M'}${r1(q[0])} ${r1(q[1])}`).join(' '), lx: r1((x1 + x2) / 2), ly: r1(lane) };
}
// 되돌아감 호: 칸 맨 위 항목이면 위 변 가운데, 아니면 위쪽 옆 변에서 나가 행 칸 위 호 자리(apex)로 솟았다가 받는 쪽으로 내려간다
function backPath(a, b, aTop, bTop, apex) {
  const p = aTop ? [a.x + a.w / 2, a.y] : [a.x, a.y + 8];
  const q = bTop ? [b.x + b.w / 2, b.y] : [b.x + b.w, b.y + 8];
  const yc = (apex - 0.25 * (p[1] + q[1]) / 2) / 0.75; // 3차 곡선 꼭대기가 apex에 오게
  return { d: `M${r1(p[0])} ${r1(p[1])} C${r1(p[0])} ${r1(yc)} ${r1(q[0])} ${r1(yc)} ${r1(q[0])} ${r1(q[1])}`, lx: r1((p[0] + q[0]) / 2), ly: r1(apex) };
}
function samePath(a, b, n) {
  const x = a.x + a.w + 4, k = 30 + n * 16, ya = a.y + Math.min(a.h / 2, 20), yb = b.y + Math.min(b.h / 2, 20);
  return { d: `M${r1(x)} ${r1(ya)} C${r1(x + k)} ${r1(ya)} ${r1(x + k)} ${r1(yb)} ${r1(x)} ${r1(yb)}`, lx: r1(x + k * 0.75), ly: r1((ya + yb) / 2) };
}

// 띠 하나(PC). o: { ws, nodes(이 워크스페이스의 띠 세션 노드, 만든 차례), member, sidOf(Map sessionId → 노드 id), tierOf, H(카드 높이), CW, x0, y0, foldOpen }
// → { box, seats, cards(Map id → 카드 항목), marks, heads, lines, fold, rowOf(Map 건 id → 머리 상자), w, h }
export function bandLayout(R, o) {
  const { ws, nodes, member, sidOf, tierOf, H, CW, x0, y0, foldOpen = false } = o;
  const B = BAND;
  const order = caseOrder(R);
  const rows = order.rows, hidden = foldOpen ? order.hidden : [];
  const all = [...rows, ...hidden];
  const nodeOf = (sid) => (sid && sidOf.get(sid)) || null;
  const inBand = (id) => !!id && member.has(id) && member.get(id).ws === ws;
  const modeOf = (seat) => { const d = (R.seats || []).find((s) => s.name === seat); return d && d.session === 'keep' ? 'keep' : 'fresh'; };
  // fresh 세션의 집 = 보이는 일 가운데 가장 늦은 일(한 세션 = 한 카드). 다른 일 칸에는 그 카드를 가리키는 표시
  const home = new Map();
  for (const c of all) for (const u of unitsOf(c)) { const id = nodeOf(u.sessionId); if (id && inBand(id) && member.get(id).mode !== 'keep') { const h = home.get(id); if (!h || num(u.createdAt) >= h.at) home.set(id, { c: c.id, unit: u.unit, at: num(u.createdAt) }); } }
  const keeps = nodes.filter((n) => member.get(n.id).mode === 'keep');
  const loose = [], orphans = []; // 건 밖 카드(일하는 중 등)와 접힌 줄로 가는 칩
  for (const n of nodes) if (member.get(n.id).mode !== 'keep' && !home.has(n.id)) (isChipTier(tierOf(n.id)) ? orphans : loose).push(n);
  const cols = bandColumns(R, all, [...loose, ...(foldOpen ? orphans : []), ...keeps].map((n) => member.get(n.id).seat));
  const ci = new Map(cols.map((c, i) => [c.name, i]));
  const colX = (i) => x0 + B.PAD + i * (CW + B.GX);
  const w = B.PAD * 2 + Math.max(1, cols.length) * CW + Math.max(0, cols.length - 1) * B.GX;
  const cards = new Map(), marks = [], heads = [], lines = [], rowOf = new Map();
  const seatInfo = (name) => (R.seats || []).find((s) => s.name === name) || null;
  const seats = cols.map((c, i) => {
    const d = seatInfo(c.name);
    const ss = d ? d.sessions || [] : [];
    return { name: c.name, old: c.old, mode: d ? (d.session === 'keep' ? 'keep' : 'fresh') : null, launcher: d ? d.launcher || null : null, busy: ss.filter((x) => x.busy).length, exited: ss.filter((x) => x.exited).length /* P216: 종료 세션은 busy(한도)에 들지 않고 따로 센다 */, max: d && d.maxLive != null ? num(d.maxLive) : null, waiting: d ? num(d.waiting) : 0, x: colX(i), y: y0 + B.PAD, w: CW, h: B.SH };
  });
  const entry = (n, x, y, extra = {}) => {
    const m = member.get(n.id), chip = !!extra.chip;
    const e = { x, y, w: CW, h: chip ? B.CHIP : H(n.id), node: n, ws, depth: -2, fold: 0, band: true, chip, thin: chip, folded: false, seat: { seat: m.seat, mode: m.mode }, caseId: null, ...extra };
    cards.set(n.id, e);
    return e;
  };
  // keep 머리 카드: 그 자리 열 맨 위(한 세션 = 한 카드, 늘 온전한 카드)
  const ky = y0 + B.PAD + B.SH + 8;
  let zone = 0;
  const stack = new Map();
  for (const n of keeps) {
    const i = ci.get(member.get(n.id).seat);
    if (i == null) continue;
    const yy = ky + (stack.get(i) || 0);
    const e = entry(n, colX(i), yy, { keepHead: true });
    stack.set(i, (stack.get(i) || 0) + e.h + B.IGY);
    zone = Math.max(zone, stack.get(i) - B.IGY);
  }
  let cy = ky + zone + (zone ? B.KG : 0);
  const ownerCol = (c) => { const id = nodeOf(c.ownerSessionId); return id && inBand(id) ? ci.get(member.get(id).seat) : null; };

  // 행 하나(건). 칸마다 항목을 시간 순으로 쌓고 일 사이를 잇는다
  const layCase = (c, top, { hiddenRow = false } = {}) => {
    const us = unitsOf(c);
    const cells = new Map(); // 열 → [{ at, kind, … }]
    const push = (i, it) => { if (i == null) return; if (!cells.has(i)) cells.set(i, []); cells.get(i).push(it); };
    for (const u of us) {
      const i = ci.get(u.seat);
      const id = nodeOf(u.sessionId);
      // P216: 종료된 자리 세션이 쥔 열린 일(u.retry)은 "종료됨" 표시와 [다시 띄우기](keep 자리는 일 있음 대신, 그 밖은 카드·가리킴 아래에 하나 더)
      if (modeOf(u.seat) === 'keep' && !(id && inBand(id) && member.get(id).mode !== 'keep')) push(i, { kind: u.retry ? 'exited' : u.status === 'open' ? 'holds' : 'did', unit: u.unit, at: num(u.createdAt), seat: u.seat, result: u.result || null, target: id && inBand(id) ? id : null, name: u.name || null, ...(u.retry ? { retryUnit: u.unit } : {}) });
      else if (u.queued || !u.sessionId) push(i, { kind: 'queue', unit: u.unit, at: num(u.createdAt), seat: u.seat, status: u.status });
      else if (id && inBand(id) && home.get(id) && home.get(id).c === c.id && home.get(id).unit === u.unit) push(i, { kind: 'card', id, unit: u.unit, at: num(u.createdAt) });
      else if (id && inBand(id)) push(i, { kind: 'ref', unit: u.unit, at: num(u.createdAt), target: id, name: u.name || id, result: u.result || null });
      else push(i, { kind: 'past', unit: u.unit, at: num(u.createdAt), name: u.name || null, result: u.result || null, status: u.status });
      if (u.retry && modeOf(u.seat) !== 'keep' && u.sessionId) push(i, { kind: 'exited', key: `x${u.unit}`, retryUnit: u.unit, at: num(u.createdAt) + 0.5, seat: u.seat, name: u.name || null, target: id && inBand(id) ? id : null });
    }
    const oc = ownerCol(c);
    (c.reports || []).forEach((r, k) => push(oc, { kind: 'report', key: `r${k}`, at: num(r.at), value: r.result != null ? r.result : r.value, up: !!r.escalated, from: r.sessionId || null, seat: r.seat || null, target: nodeOf(c.ownerSessionId) }));
    if (c.state === 'waiting_owner') push(oc, { kind: 'wait', key: 'wait', at: Infinity, target: nodeOf(c.ownerSessionId) });
    // 되돌아감 호 층 수(행 칸 위에 자리를 둔다)
    const box = new Map(); // 일 id(또는 r0·wait) → { 상자, top(칸 맨 위인가), i }
    const colOfUnit = new Map(us.map((u) => [u.unit, ci.get(u.seat)]));
    const backs = us.filter((u) => u.via && u.via.prevUnit && colOfUnit.has(u.via.prevUnit) && colOfUnit.get(u.unit) != null && colOfUnit.get(u.unit) < colOfUnit.get(u.via.prevUnit));
    const levels = Math.min(3, backs.length);
    const head = { ws, id: c.id, x: x0 + B.PAD, y: top, w: w - B.PAD * 2, h: B.CH, c, hidden: hiddenRow };
    heads.push(head); rowOf.set(c.id, head);
    const cellsTop = top + B.CH + B.CP + levels * B.ARC;
    let bottom = cellsTop;
    for (const [i, items] of cells) {
      items.sort((a, b) => a.at - b.at);
      let yy = cellsTop;
      items.forEach((it, k) => {
        const x = colX(i);
        let bx;
        if (it.kind === 'card') {
          const n = cards.get(it.id) ? null : nodes.find((q) => q.id === it.id);
          const e = n ? entry(n, x, yy, { chip: isChipTier(tierOf(it.id)), caseId: c.id }) : cards.get(it.id);
          bx = e;
        } else {
          bx = { x, y: yy, w: CW, h: B.MARK };
          marks.push({ ...it, ws, caseId: c.id, x, y: yy, w: CW, h: B.MARK, id: `${c.id}:${it.unit || it.key}` });
        }
        box.set(it.unit || it.key, { b: { x: bx.x, y: bx.y, w: bx.w, h: bx.h }, top: k === 0, i });
        yy += bx.h + B.IGY;
      });
      bottom = Math.max(bottom, yy - B.IGY);
    }
    // 선: 일마다 앞 일(via.prevUnit)에서. 같은 prevUnit이면 같은 앞 항목에서 갈라진다. 되돌아감은 호, 올림(via.escalated)은 up
    const lineBy = new Map((c.lines || []).map((l) => [String(l.index), l]));
    const lastArc = new Map(); // 줄 번호 → 마지막 호(지금 셈 이름표는 그 줄의 마지막 호에만)
    let lv = 0, same = 0;
    for (const u of us) {
      const v = u.via || {};
      const a = box.get(v.prevUnit), b = box.get(u.unit);
      if (!a || !b) continue;
      const base = { id: `${ws}|${c.id}|${v.prevUnit}>${u.unit}`, ws, caseId: c.id, from: v.prevUnit, to: u.unit, up: !!v.escalated, line: v.line != null ? String(v.line) : null };
      if (a.i === b.i) { lines.push({ ...base, kind: 'same', ...samePath(a.b, b.b, same++) }); continue; }
      if (b.i > a.i + 1) { lines.push({ ...base, kind: 'fwd', skip: true, ...skipPath(a.b, b.b, cellsTop - Math.max(4, B.CP / 2), B.GX) }); continue; }
      if (b.i > a.i) { lines.push({ ...base, kind: 'fwd', ...fwdPath(a.b, b.b) }); continue; }
      const apex = cellsTop - 6 - (lv++ % Math.max(1, levels)) * B.ARC;
      const ln = { ...base, kind: 'back', ...backPath(a.b, b.b, a.top, b.top, apex) };
      lines.push(ln);
      if (base.line != null) lastArc.set(base.line, ln);
    }
    for (const [k, ln] of lastArc) { const l = lineBy.get(k); if (l && l.max != null) { ln.count = { n: num(l.passed), max: num(l.max), up: num(l.escalated) }; } }
    // 주인 보고 선: 보고한 세션의 이 행 마지막 항목 → 보고 표시
    (c.reports || []).forEach((r, k) => {
      const t = box.get(`r${k}`);
      if (!t) return;
      const src = (r.unit && box.has(r.unit) ? us.find((u) => u.unit === r.unit) : null) || us.filter((u) => (r.sessionId ? u.sessionId === r.sessionId : u.seat === r.seat) && box.has(u.unit)).pop();
      const a = src && box.get(src.unit);
      if (!a || a.i === t.i) return;
      const base = { id: `${ws}|${c.id}|${src.unit}>r${k}`, ws, caseId: c.id, from: src.unit, to: `r${k}`, up: !!r.escalated, report: true };
      if (t.i > a.i + 1) lines.push({ ...base, kind: 'fwd', skip: true, ...skipPath(a.b, t.b, cellsTop - Math.max(4, B.CP / 2), B.GX) });
      else if (t.i > a.i) lines.push({ ...base, kind: 'fwd', ...fwdPath(a.b, t.b) });
      else lines.push({ ...base, kind: 'back', ...backPath(a.b, t.b, a.top, t.top, cellsTop - 6) });
    });
    return Math.max(bottom, cellsTop) + B.CP - top;
  };
  for (const c of rows) cy += layCase(c, cy) + B.RGY;
  // 건 밖 카드(일하는 중인데 보이는 건에 일이 없다): 머리 하나와 자리 칸에 만든 차례로
  if (loose.length) {
    const top = cy, cellsTop = top + B.CH + B.CP;
    heads.push({ ws, id: null, loose: true, x: x0 + B.PAD, y: top, w: w - B.PAD * 2, h: B.CH, n: loose.length });
    const ys = new Map();
    let bottom = cellsTop;
    for (const n of loose) { const i = ci.get(member.get(n.id).seat); const yy = cellsTop + (ys.get(i) || 0); const e = entry(n, colX(i), yy); ys.set(i, (ys.get(i) || 0) + e.h + B.IGY); bottom = Math.max(bottom, yy + e.h); }
    cy = bottom + B.CP + B.RGY;
  }
  // 접힌 줄 "+n 끝남": 그 안의 세션은 folded 카드 항목(하나하나 그리지 않음). 펴면 숨은 건 행과 건 없는 칩
  let fold = null;
  if (order.more > 0 || orphans.length) {
    fold = { ws, x: x0 + B.PAD, y: cy, w: w - B.PAD * 2, h: B.FOLD, n: order.more, sessions: orphans.length + order.hidden.reduce((s, c) => s + (c.units || []).filter((u) => u.sessionId).length, 0), open: foldOpen };
    cy += B.FOLD + B.RGY;
    if (foldOpen) {
      for (const c of hidden) cy += layCase(c, cy, { hiddenRow: true }) + B.RGY;
      if (orphans.length) {
        const ys = new Map(), top = cy;
        let bottom = top;
        for (const n of orphans) { const i = ci.get(member.get(n.id).seat); const yy = top + (ys.get(i) || 0); entry(n, colX(i), yy, { chip: true }); ys.set(i, (ys.get(i) || 0) + B.CHIP + B.IGY); bottom = Math.max(bottom, yy + B.CHIP); }
        cy = bottom + B.RGY;
      }
    } else {
      for (const n of orphans) entry(n, fold.x, fold.y, { chip: true, folded: true, w: fold.w, h: fold.h });
      // 숨은 건의 띠 세션(집이 숨은 건에만 있는 세션)은 위 orphans에 이미 들었다(home은 보이는 건만 본다)
    }
  }
  const h = Math.max(cy - B.RGY, y0 + B.PAD + B.SH) + B.PAD - y0;
  return { ws, box: { x: x0, y: y0, w, h }, seats, cards, marks, heads, lines, fold, rowOf, w, h, cols };
}

// 휴대폰 띠(17절 "휴대폰"): keep 자리 카드를 위에 한 번, 그 아래 건마다 블록(머리, 자리 사슬 칩을 꺾어 이은 줄, 지금 일하는 세션의 카드). 흐름 선은 없다.
// o: bandLayout과 같고 x0·W(띠 폭 = 카드 폭, P199: 카드 하나가 화면 폭에 드는 배율에서 사슬·표시가 잘리지 않게), textW(글, px) → 글 폭, foldOpen(P199: "+n 끝남"을 편다)
// 꺾은 줄은 화살표 자리(LGAP)만큼 들여 시작한다(화살표가 띠 밖으로 나가지 않게). 칩 하나가 폭보다 길면 폭에 맞춘다(글은 CSS가 줄임표로)
export function bandPhone(R, o) {
  const { ws, nodes, member, sidOf, tierOf, H, CW, x0, y0, W, textW = (s, px) => String(s || '').length * px * 0.62, foldOpen = false } = o;
  const P = BAND_PHONE;
  const order = caseOrder(R);
  const nodeOf = (sid) => (sid && sidOf.get(sid)) || null;
  const inBand = (id) => !!id && member.has(id) && member.get(id).ws === ws;
  const cards = new Map(), marks = [], heads = [], chains = [], rowOf = new Map();
  const entry = (n, x, y, extra = {}) => { const m = member.get(n.id); const e = { x, y, w: CW, h: H(n.id), node: n, ws, depth: -2, fold: 0, band: true, chip: false, thin: false, folded: false, seat: { seat: m.seat, mode: m.mode }, caseId: null, ...extra }; cards.set(n.id, e); return e; };
  let cy = y0 + P.PAD;
  for (const n of nodes) if (member.get(n.id).mode === 'keep') { const e = entry(n, x0, cy, { keepHead: true, w: Math.min(CW, W) }); cy += e.h + P.GY; }
  const placed = new Set(nodes.filter((n) => member.get(n.id).mode === 'keep').map((n) => n.id));
  const hideAt = (id, b, caseId = null) => { if (placed.has(id)) return; const n = nodes.find((q) => q.id === id); if (!n) return; placed.add(id); entry(n, b.x, b.y, { w: b.w, h: b.h, folded: true, chip: true, thin: true, caseId }); };
  const block = (c, hiddenRow = false) => {
    const head = { ws, id: c.id, x: x0, y: cy, w: W, h: P.HEAD, c, hidden: hiddenRow };
    heads.push(head); rowOf.set(c.id, head);
    cy += P.HEAD;
    // 자리 사슬: 일 차례대로 자리 이름 칩, 폭이 넘치면 다음 줄로(화살표 자리만큼 들여). 줄 선 일은 점선 칩
    let x = x0, ly = cy;
    const us = unitsOf(c);
    us.forEach((u, k) => {
      const label = u.seat || '?';
      const cw = Math.min(W - P.LGAP, Math.ceil(textW(label, 12) + 22));
      if (k && x + P.LGAP + cw > x0 + W) { x = x0 + P.LGAP; ly += P.LINK + P.LGY; }
      else if (k) x += P.LGAP;
      chains.push({ ws, caseId: c.id, unit: u.unit, seat: label, x, y: ly, w: cw, h: P.LINK, queue: !!u.queued || (!u.sessionId && u.status === 'open'), open: u.status === 'open', up: !!(u.via && u.via.escalated), arrow: k > 0, wrap: k > 0 && x === x0 + P.LGAP, result: u.result || null });
      x += cw;
    });
    cy = (us.length ? ly + P.LINK : cy) + P.GY;
    // 지금 일하는 세션의 카드(열린 일을 받은 fresh 세션). keep 자리가 일을 쥐면 표시 한 줄
    for (const u of us.filter((q) => q.status === 'open')) {
      const id = nodeOf(u.sessionId);
      if (id && inBand(id) && member.get(id).mode !== 'keep' && !placed.has(id)) { placed.add(id); const e = entry(nodes.find((q) => q.id === id), x0, cy, { caseId: c.id, w: Math.min(CW, W) }); cy += e.h + P.GY; }
      else if (id && inBand(id) && member.get(id).mode === 'keep') { marks.push({ kind: u.retry ? 'exited' : 'holds', ws, caseId: c.id, unit: u.unit, target: id, seat: u.seat, x: x0, y: cy, w: W, h: BAND.MARK, id: `${c.id}:${u.unit}`, ...(u.retry ? { retryUnit: u.unit } : {}) }); cy += BAND.MARK + P.GY; continue; }
      if (u.retry) { marks.push({ kind: 'exited', ws, caseId: c.id, key: `x${u.unit}`, retryUnit: u.unit, target: id && inBand(id) ? id : null, seat: u.seat, x: x0, y: cy, w: W, h: BAND.MARK, id: `${c.id}:x${u.unit}` }); cy += BAND.MARK + P.GY; } // P216
    }
    if (c.state === 'waiting_owner') { marks.push({ kind: 'wait', ws, caseId: c.id, key: 'wait', target: nodeOf(c.ownerSessionId), x: x0, y: cy, w: W, h: BAND.MARK, id: `${c.id}:wait` }); cy += BAND.MARK + P.GY; }
    // 이 건의 다른 세션은 머리 자리에 접힌 항목(요약 열·사이드바가 찾는다)
    for (const u of us) { const id = nodeOf(u.sessionId); if (id && inBand(id)) hideAt(id, head, c.id); }
    cy += P.GY;
  };
  for (const c of order.rows) block(c);
  // 건 밖에서 일하는 세션은 카드, 나머지는 접힌 줄
  for (const n of nodes) if (!placed.has(n.id) && !isChipTier(tierOf(n.id))) { placed.add(n.id); const e = entry(n, x0, cy, { w: Math.min(CW, W) }); cy += e.h + P.GY; }
  let fold = null;
  const restOf = () => nodes.filter((n) => !placed.has(n.id));
  if (order.more > 0 || restOf().length) {
    fold = { ws, x: x0, y: cy, w: W, h: BAND.FOLD, n: order.more, sessions: 0, open: !!foldOpen };
    cy += BAND.FOLD + P.GY;
    if (foldOpen) {
      // 편 줄: 숨은 건 블록(PC처럼), 그 뒤 건 없는 세션은 칩(얇은 카드) 한 줄씩
      for (const c of order.hidden) block(c, true);
      const rest = restOf();
      for (const n of rest) { placed.add(n.id); entry(n, x0, cy, { w: W, h: BAND.CHIP, chip: true, thin: true }); cy += BAND.CHIP + P.LGY; }
      if (rest.length) cy += P.GY - P.LGY;
      fold.sessions = rest.length + order.hidden.reduce((s, c) => s + (c.units || []).filter((u) => u.sessionId).length, 0);
    } else {
      const rest = restOf();
      fold.sessions = rest.length;
      for (const n of rest) hideAt(n.id, fold);
    }
  }
  const h = cy + P.PAD - y0;
  return { ws, box: { x: x0, y: y0, w: W, h }, seats: [], cards, marks, heads, lines: [], chains, fold, rowOf, w: W, h, phone: true };
}

// P199: 붙는 머리. 띠의 자리 머리가 고정 머리 막대(화면 y = top) 위로 지나갔는데 띠가 아직 그 선에 걸쳐 있으면, 그 띠의 자리 이름과 화면 x를 준다.
// bands = lay.rb.list(PC), v = 보기 { x, y, k }, top = 고정 머리 막대 아래 변(보기 칸 기준), rail = 왼쪽 레일 폭. 없으면 null(나무 칸 이름 그대로)
// 띠가 여럿이면 그 선에 걸친 띠(줄은 위아래로 쌓여 겹치지 않는다)
export function stickyHead(bands, v, top, rail = 0) {
  if (!bands || !v) return null;
  for (const b of bands) {
    if (b.phone || !b.seats || !b.seats.length) continue;
    const headBottom = (b.seats[0].y + b.seats[0].h) * v.k + v.y;
    const bandTop = b.box.y * v.k + v.y, bandBottom = (b.box.y + b.box.h) * v.k + v.y;
    if (bandTop < top && headBottom <= top && bandBottom > top) return { ws: b.ws, seats: b.seats.map((s) => ({ name: s.name, old: !!s.old, mode: s.mode, x: Math.round(s.x * v.k + v.x - rail), w: s.w * v.k })) };
  }
  return null;
}

// 띠 사각형 안인가(Alt 끌기 놓을 곳·선 길에서 띠를 뺀다)
export const inBandBox = (bands, x, y) => (bands || []).some((b) => x >= b.box.x && x <= b.box.x + b.box.w && y >= b.box.y && y <= b.box.y + b.box.h);

// 띠 세션에서 아래 나무 뿌리(자리 없는 하위)로 가는 옅은 선: 띠 아래 가장자리 → 띠와 나무 사이 틈 → 하위 왼쪽 가운데. 선은 띠 안을 지나지 않는다
export function bandKidPts(parent, band, kid, gx) {
  const bottom = band.box.y + band.box.h;
  const px = Math.min(Math.max(parent.x + parent.w / 2, band.box.x + 8), band.box.x + band.box.w - 8);
  const mid = bottom + BAND.BELOW / 2, lx = kid.x - gx / 2, ky = kid.y + kid.h / 2;
  return [[px, bottom], [px, mid], [lx, mid], [lx, ky], [kid.x, ky]];
}
// 나무 세션에서 띠 세션으로 가는 선(띄운 부모가 나무에 있다): 부모 위 변 가운데 → 위로 띠 아래 가장자리에 붙는다
export function treeToBandPts(parent, band, child) {
  const bottom = band.box.y + band.box.h;
  const cx = Math.min(Math.max(child.x + child.w / 2, band.box.x + 8), band.box.x + band.box.w - 8);
  const px = parent.x + parent.w / 2, mid = bottom + BAND.BELOW / 2;
  return [[px, parent.y], [px, mid], [cx, mid], [cx, bottom]];
}

// 행 머리 미리 보기(넘김 이력, 그래프의 건에서. 따로 부르지 않는다): 일마다 { at, seat, name, status, result, prevSeat, escalated, queue }와 보고
export function caseHistory(c) {
  if (!c) return [];
  const us = unitsOf(c);
  const seatOf = new Map(us.map((u) => [u.unit, u.seat]));
  const out = us.map((u) => ({ kind: 'unit', at: num(u.createdAt), closedAt: u.closedAt ? num(u.closedAt) : null, seat: u.seat, name: u.name || null, status: u.status, result: u.result || null, from: (u.via && (u.via.fromSeat || seatOf.get(u.via.prevUnit))) || null, escalated: !!(u.via && u.via.escalated), queue: !!u.queued || (!u.sessionId && u.status === 'open') }));
  for (const r of c.reports || []) out.push({ kind: 'report', at: num(r.at), seat: r.seat || null, name: r.name || null, value: r.result != null ? r.result : r.value, escalated: !!r.escalated });
  return out.sort((a, b) => a.at - b.at);
}

// 행 머리 상태 열쇠: open·waiting_owner·blocked·done·cancelled
export const caseStateKey = (s) => (['open', 'waiting_owner', 'blocked', 'done', 'cancelled'].includes(s) ? s : 'open');
