// P186: 하네스 4단계 — 세션 맵에 rig의 자리, 흐름 줄, 건 목록(docs research harness-arch.md 14절 "4단계: 세션 맵"). 순수 함수만 둔다(단위 시험 test/p186-lib.test.mjs).
// 그래프 모양은 판 mission.graph의 rig 칸(backend rig-flow.mjs graph): { <워크스페이스 키>: { seats, flow, manager, results, cases } }, 세션 노드의 rigSeat.
// - 자리 이름표: 켜진 rig의 정의에 있는 자리에 앉은 세션만(rigIndex). rig가 없는 판은 빈 표라 맵이 전과 같다.
// - 끝난 fresh 자리 세션(열린 시도 없음 = busy false)은 같은 자리의 일하는(또는 가장 늦은) 카드 아래 얇은 줄로 모은다(seatThin, P163 규칙의 자리 묶음).
// - 흐름 줄: 자리마다 대표 카드(seatReps: keep = 앉은 세션, fresh = 일하는 세션 또는 가장 늦은 세션) 사이에 정의의 줄(flowLines), 그림은 flowPaths.
// - 건 목록: 열린 건 · blocked 건 · 최근 끝난 건(caseGroups). 누르면 지금 일이 있는 자리의 카드로.

// 정의 자리 이름 → 자리 정보(keep·fresh 등)
const seatDefOf = (R, name) => ((R && R.seats) || []).find((x) => x.name === name) || null;

// 그래프 → { byNode: Map(노드 id → { ws, seat, mode: 'keep'|'fresh', busy }), rigs: Map(워크스페이스 키 → R) }
export function rigIndex(graph) {
  const byNode = new Map(), rigs = new Map();
  const rig = (graph && graph.rig) || {};
  for (const [k, R] of Object.entries(rig)) if (R && Array.isArray(R.seats) && R.seats.length) rigs.set(k, R);
  if (!rigs.size) return { byNode, rigs };
  const busyOf = new Map();
  for (const R of rigs.values()) for (const s of R.seats) for (const x of s.sessions || []) busyOf.set(x.sessionId, !!x.busy);
  for (const n of (graph.nodes || [])) {
    if (!n || n.kind !== 'session' || !n.rigSeat) continue;
    const ws = n.workspaceKey || '';
    const R = rigs.get(ws), d = R && seatDefOf(R, n.rigSeat);
    if (!d) continue; // rig가 꺼졌거나 정의에 없는 자리: 이름표 없음
    byNode.set(n.id, { ws, seat: n.rigSeat, mode: d.session === 'keep' ? 'keep' : 'fresh', busy: busyOf.has(n.sessionId) ? busyOf.get(n.sessionId) : false });
  }
  return { byNode, rigs };
}

// 자리 이름표 글(카드에 작게): { seat, mode }
export const seatTag = (info) => (info ? { seat: info.seat, mode: info.mode } : null);

// 형제 목록 ks(만든 차례)에서 fresh 자리의 끝난 세션을 얇은 줄로: 같은 자리의 카드로 남는 마지막 형제 바로 뒤로 옮긴다.
// can(id): 얇은 줄로 줄여도 되는가(바쁜 등급·뒤 일·보이는 하위·접기·동료가 아닌가). 대표(일하는 세션, 없으면 가장 늦은 세션)는 카드로 남는다.
// → { order, thin: Set }
export function seatThin(ks, index, can = () => true) {
  const thin = new Set();
  if (!index || !index.byNode.size) return { order: ks, thin };
  const groups = new Map(); // `${ws}|${seat}` → [id](차례대로)
  for (const id of ks) { const x = index.byNode.get(id); if (x && x.mode === 'fresh') { const k = `${x.ws}|${x.seat}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(id); } }
  const after = new Map(); // 카드로 남는 마지막 형제 → 그 뒤에 붙일 얇은 줄들
  for (const ids of groups.values()) {
    if (ids.length < 2) continue;
    const busy = ids.filter((id) => index.byNode.get(id).busy);
    const rep = busy.length ? null : ids[ids.length - 1]; // 일하는 세션이 없으면 가장 늦은 세션이 대표
    const slim = ids.filter((id) => id !== rep && !index.byNode.get(id).busy && can(id));
    if (!slim.length) continue;
    for (const id of slim) thin.add(id);
    const kept = ids.filter((id) => !thin.has(id));
    after.set(kept[kept.length - 1], slim);
  }
  if (!thin.size) return { order: ks, thin };
  const order = [];
  for (const id of ks) { if (thin.has(id)) continue; order.push(id); if (after.has(id)) order.push(...after.get(id)); }
  return { order, thin };
}

// 자리마다 대표 카드 → Map(자리 → 노드 id). keep = 앉은 세션, fresh = 일하는 세션(여럿이면 가장 늦은 것) 또는 가장 늦은 세션.
// nodes: 그 워크스페이스의 세션 노드(만든 차례). has(id): 맵에 카드가 있는가(접힌 가지·얇은 줄은 빼고 고른다)
export function seatReps(R, ws, nodes, index, has = () => true) {
  const out = new Map();
  if (!R) return out;
  for (const s of R.seats) {
    const mine = nodes.filter((n) => { const x = index.byNode.get(n.id); return x && x.ws === ws && x.seat === s.name && has(n.id); });
    if (!mine.length) continue;
    const busy = mine.filter((n) => index.byNode.get(n.id).busy);
    out.set(s.name, (busy.length ? busy[busy.length - 1] : mine[mine.length - 1]).id);
  }
  return out;
}

// 흐름 줄 자료: 정의의 줄마다(갈라짐은 받는 자리마다) { id, from, to(노드 id), fromSeat, toSeat, on, max, passed, label }. 대표 카드가 없는 자리의 줄은 뺀다.
// label: 값 이름, max가 있으면 "값 지난/상한"(지금 건 기준)
export function flowLines(R, reps) {
  const out = [];
  if (!R || !Array.isArray(R.flow)) return out;
  for (const l of R.flow) {
    for (const to of [].concat(l.to || [])) {
      const a = reps.get(l.from), b = reps.get(to);
      if (!a || !b || a === b) continue;
      const max = l.max == null ? null : Number(l.max);
      out.push({ id: `flow:${l.index}:${to}`, index: l.index, from: a, to: b, fromSeat: l.from, toSeat: to, on: l.on, max, passed: Number(l.passed) || 0, label: max != null ? `${l.on} ${Number(l.passed) || 0}/${max}` : l.on });
    }
  }
  return out;
}

// 흐름 줄 그림: 관계 선(가운데 높이, 직각)과 겹치지 않게 곡선으로.
// - 칸이 다르면(왼 → 오른, 오른 → 왼): 왼 카드 오른 변과 오른 카드 왼 변을 잇되 높이는 카드의 1/4·3/4 자리(관계 선은 1/2)
// - 같은 칸이면: 두 카드의 오른 변을 오른쪽으로 부푼 곡선으로(같은 칸 줄이 여럿이면 차례로 더 크게)
// → [{ ...line, d, lx, ly(이름표 가운데) }]
export function flowPaths(lines, cards, { gap = 6, bulge = 34, step = 26 } = {}) {
  const r1 = (v) => Math.round(v * 10) / 10;
  const same = new Map(); // 같은 칸 묶음(x) → 쓴 수
  const sides = new Map(); // 카드·변 → 쓴 수(같은 변에 여럿이 닿으면 높이를 비킨다)
  const slot = (id, side) => { const k = `${id}|${side}`; const n = sides.get(k) || 0; sides.set(k, n + 1); return n; };
  const out = [];
  for (const l of lines) {
    const a = cards.get(l.from), b = cards.get(l.to);
    if (!a || !b) continue;
    if (Math.abs(a.x - b.x) < 0.5) {
      const n = same.get(a.x) || 0; same.set(a.x, n + 1);
      const k = bulge + n * step;
      const x = a.x + a.w + gap;
      const ya = a.y + a.h * (0.35 + 0.1 * (n % 2)), yb = b.y + b.h * (0.65 - 0.1 * (n % 2));
      const d = `M${r1(x)} ${r1(ya)} C${r1(x + k * 1.35)} ${r1(ya)} ${r1(x + k * 1.35)} ${r1(yb)} ${r1(x)} ${r1(yb)}`;
      out.push({ ...l, d, lx: r1(x + k), ly: r1((ya + yb) / 2), same: true });
      continue;
    }
    const fwd = a.x < b.x;
    const L = fwd ? a : b, Rc = fwd ? b : a;
    // 앞으로 가는 줄은 왼 카드 아래쪽(3/4) → 오른 카드 위쪽(1/4), 돌아오는 줄은 오른 카드 아래쪽 → 왼 카드 위쪽
    const sa = slot(l.from, fwd ? 'r' : 'l'), sb = slot(l.to, fwd ? 'l' : 'r');
    const ya = a.y + a.h * (0.75 + 0.08 * sa);
    const yb = b.y + b.h * (0.25 - 0.08 * sb);
    const xa = fwd ? a.x + a.w + gap : a.x - gap, xb = fwd ? b.x - gap : b.x + b.w + gap;
    const dx = Math.max(40, Math.abs(xb - xa) * 0.45) * (fwd ? 1 : -1);
    const d = `M${r1(xa)} ${r1(ya)} C${r1(xa + dx)} ${r1(ya)} ${r1(xb - dx)} ${r1(yb)} ${r1(xb)} ${r1(yb)}`;
    out.push({ ...l, d, lx: r1((xa + xb) / 2), ly: r1((ya + yb) / 2), same: false, span: [L.x + L.w, Rc.x] });
  }
  return out;
}

// 건 목록 묶음(요약 열): 열린 건 · blocked 건 · 최근 끝난 건(done·cancelled). rig가 없는 판은 null.
// nodeOf(ws, sessionId) → 노드 id | null, repOf(ws, seat) → 노드 id | null(자리의 대표 카드)
// 건마다 { id, ws, state, owner, seats(일이 있는 자리), handoffs, reason, go(누르면 갈 카드), at }
export function caseGroups(graph, nodeOf = () => null, repOf = () => null) {
  const rig = (graph && graph.rig) || {};
  const all = [];
  for (const [ws, R] of Object.entries(rig)) {
    for (const c of (R && R.cases) || []) {
      const open = (c.units || []).filter((u) => u.status === 'open');
      // 갈 카드: 열린 일을 받은 세션(가장 늦은 일) → 일이 줄에 서 있으면 그 자리의 대표 → 건 주인
      let go = null;
      for (let i = open.length - 1; i >= 0 && !go; i--) if (open[i].sessionId) go = nodeOf(ws, open[i].sessionId);
      for (let i = open.length - 1; i >= 0 && !go; i--) if (open[i].seat) go = repOf(ws, open[i].seat);
      if (!go) go = nodeOf(ws, c.ownerSessionId);
      all.push({ id: c.id, ws, state: c.state, owner: c.owner, seats: c.activeSeats || [], handoffs: c.handoffs || 0, reason: c.blockedReason || null, go, at: c.closedAt || c.createdAt || 0, lines: c.lines || [] });
    }
  }
  if (!Object.keys(rig).length) return null;
  const by = (a, b) => b.at - a.at;
  return {
    open: all.filter((c) => c.state === 'open' || c.state === 'waiting_owner').sort(by), // P194: waiting_owner(상한을 넘어 주인에게 보고로 올라감)도 끝나지 않은 건
    blocked: all.filter((c) => c.state === 'blocked').sort(by),
    done: all.filter((c) => c.state === 'done' || c.state === 'cancelled').sort(by).slice(0, 5),
    total: all.length,
  };
}

// 노드 메뉴 "자리 정하기": 켜진 rig(rig.status state on)에 자리가 있는 워크스페이스의 에이전트 세션만, 이 PC의 창만(원격 기기에는 없다).
// status: rig.status 답, s: 세션 요약(sessionId, kind, rigSeat, workspaceKey), others: 같은 판의 세션들(keep 자리를 다른 세션이 쥐었나)
// → null | { current, seats: [{ name, mode, current, taken(다른 세션 이름) }], clear(뗄 수 있나) }
export function seatMenu(status, s, others = [], { remote = false } = {}) {
  if (remote || !status || !s || status.state !== 'on' || !Array.isArray(status.seats) || !status.seats.length) return null;
  if ((s.kind || 'claude') === 'shell') return null;
  const current = s.rigSeat || null;
  return {
    current,
    seats: status.seats.map((x) => {
      const holder = x.session === 'keep' ? others.find((o) => o.sessionId !== s.sessionId && o.rigSeat === x.name && (o.workspaceKey || '') === (s.workspaceKey || '') && o.state !== 'exited') : null;
      return { name: x.name, mode: x.session === 'keep' ? 'keep' : 'fresh', current: current === x.name, taken: holder ? holder.name : null };
    }),
    clear: !!current,
  };
}

// 미리 보기의 rig 줄(판 API rig.recent 답): 최근 훅 판정과 도구 실행을 시각 차례로 섞어 n줄.
// → [{ kind: 'hook'|'tool', at, text, sub, bad(거절·실패) }]
export function recentLines(rec, n = 5) {
  if (!rec) return [];
  const hooks = (rec.hooks || []).map((h) => ({ kind: 'hook', at: h.t || 0, text: `${h.at} · ${h.decision}`, sub: h.reason || h.error || h.note || h.run || '', bad: ['reject', 'blocked', 'failed'].includes(h.decision) }));
  const tools = (rec.tools || []).map((x) => ({ kind: 'tool', at: x.endedAt || x.startedAt || 0, text: `${x.tool} · ${x.status}${x.exitCode != null ? ` (${x.exitCode})` : ''}`, sub: x.error || (x.args || []).join(' '), bad: x.status === 'failed' || x.status === 'lost' || (x.exitCode != null && x.exitCode !== 0) }));
  return [...hooks, ...tools].sort((a, b) => b.at - a.at).slice(0, n);
}
