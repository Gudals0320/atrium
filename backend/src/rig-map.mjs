// P217: 구조 지도 데이터(F0-3, docs research harness-arch.md 18.3). 판 API rig.map { workspace, case? } → { ws, state, def, overlay, cases, others }.
// - 정의 그래프(def)는 정의에서(건을 주면 그 건이 쥔 버전의 정의), 오버레이·건·다른 건은 장부(rig_events)와 지금 세션 상태로만 만든다(다른 기록을 뒤지지 않는다).
// - 마디·변·관문·now 상태의 종류는 아래 닫힌 목록이다. 1단계 기능은 목록에 하나를 더하고 그 종류를 여기서 만든다.
// - 계산은 (워크스페이스, 정의 해시, 마지막 seq, 보는 건)으로 담아 둔다. 세션 상태(앉은 세션, 사람 차례)는 부를 때마다 위에 얹는다.
// - 창은 판 이벤트 rig.events를 받으면 다시 부른다. 에이전트는 이 API를 쓰지 않는다(에이전트의 길은 atrium rig log --events).
import path from 'node:path';
import { shownName } from './session-label.mjs';
import { seatColumns } from './rig-flow.mjs';
import { OWNER, HUMAN } from './rig-ledger.mjs';

export const MAP_NODE_TYPES = ['seat', 'tool', 'cycle', 'file', 'human', 'builder', 'def'];
export const MAP_EDGE_TYPES = ['assign', 'result', 'else', 'report', 'may', 'uses', 'writes', 'cycle', 'edits'];
export const MAP_NOW_STATES = ['working', 'idle_no_done', 'human_turn', 'queued', 'stopped', 'waiting_owner'];
const LIVE = new Set(['open', 'blocked', 'waiting_owner']);
const STEP_KINDS = new Set(['assign', 'handoff', 'report', 'escalate', 'cycle']); // 넘김 차례(passed.steps)에 드는 kind
const HUMAN_STATES = new Set(['waiting', 'trust_wait']);
const NOW_LABEL = { working: '일하는 중', idle_no_done: '보고 없이 쉼', human_turn: '사람 차례', queued: '자리 줄 대기', stopped: '멈춤', waiting_owner: '주인 차례' };

// ---------- id ----------
export const seatId = (n) => `seat:${n}`;
export const E = {
  assign: (line) => `e:assign:${line}`,
  result: (line, to) => `e:result:${line}:${to}`,
  else: (line) => `e:else:${line}`,
  report: (seat) => `e:report:${seat}`,
  may: (from, to) => `e:may:${from}:${to}`,
  uses: (seat, tool) => `e:uses:${seat}:${tool}`,
  writes: (seat, p) => `e:writes:${seat}:${p}`,
  cycle: (i) => `e:cycle:${i}`,
  edits: () => 'e:edits',
};
const hookLabel = (h) => { const w = (h.run || []).slice(-1)[0] || ''; return `${h.at} · ${path.basename(String(w)) || h.at}`; };
// 건 주인이 앉는 자리(정의만으로): manager, 없으면 assign 줄의 첫 출발 자리, 없으면 사람
export function ownerSeatOf(def) {
  if (!def || !def.seats) return null;
  if (def.manager) return def.manager;
  const a = (def.flow || []).find((l) => l.on === 'assign');
  return a ? a.from : null;
}

// ---------- 정의 그래프 ----------
// def: validateRig의 def. o: { n, hash, protectedFiles: [경로] } → { n, hash, nodes, edges, gates }
export function defGraph(def, { n = null, hash = null, protectedFiles = [] } = {}) {
  const nodes = []; const edges = []; const gates = [];
  if (!def) return { n, hash, nodes, edges, gates };
  const seats = def.seats || {}; const flow = def.flow || []; const tools = def.tools || {};
  const amp = def.amp || null; const ampSeats = (amp && amp.seats) || {};
  const results = def.results || [];
  const ownerSeat = ownerSeatOf(def);
  const files = new Map();
  const fileNode = (p, meta) => { const id = `file:${p}`; const f = files.get(id) || { id, type: 'file', label: p, meta: { path: p, writes: [], protected: false } }; Object.assign(f.meta, meta, { writes: [...new Set([...f.meta.writes, ...(meta.writes || [])])] }); files.set(id, f); return id; };
  // 마디: 자리(열 차례), 도구, 주기, 파일, 사람, 제작 세션, 정의 카드
  for (const name of seatColumns(def)) {
    const x = seats[name]; const a = ampSeats[name] || {};
    nodes.push({ id: seatId(name), type: 'seat', label: name, meta: { session: x.session, launcher: x.launcher, model: x.model || null, effort: x.effort || null, maxLive: x.maxLive ?? null, worktree: !!x.worktree, writes: a.writes === undefined ? null : a.writes, tools: x.tools || null, may: x.may || [], guide: x.guide || null, manager: def.manager === name, human: false, sessions: [] } });
  }
  for (const t of Object.values(tools)) nodes.push({ id: `tool:${t.name}`, type: 'tool', label: t.name, meta: { desc: t.desc || '', run: t.run, timeoutMs: t.timeoutMs, parallel: !!t.parallel } });
  for (const cy of def.cycles || []) nodes.push({ id: `cycle:${cy.index}`, type: 'cycle', label: cy.every, meta: { every: cy.every, to: cy.to, run: cy.run || null } });
  for (const p of protectedFiles) fileNode(p, { protected: true });
  nodes.push({ id: 'human', type: 'human', label: 'human', meta: {} });
  nodes.push({ id: 'builder', type: 'builder', label: 'builder', meta: { sessions: [] } });
  nodes.push({ id: 'def', type: 'def', label: def.name || 'rig', meta: { n, hash, seats: Object.keys(seats).length, hooks: (def.hooks || []).length, tools: Object.keys(tools).length, cycles: (def.cycles || []).length, flow: flow.length, results, manager: def.manager || null } });
  // 변
  for (const l of flow) {
    if (l.on === 'assign') { edges.push({ id: E.assign(l.index), type: 'assign', from: seatId(l.from), to: seatId(l.to[0]), meta: { line: l.index } }); continue; }
    for (const t of l.to) edges.push({ id: E.result(l.index, t), type: 'result', from: seatId(l.from), to: seatId(t), meta: { line: l.index, value: l.on, max: l.max ?? null, else: l.else ?? null } });
    if (l.max != null) { const alt = l.else || def.manager || null; edges.push({ id: E.else(l.index), type: 'else', from: seatId(l.from), to: alt ? seatId(alt) : 'human', meta: { line: l.index, of: l.to.map((t) => E.result(l.index, t)), max: l.max, manager: !l.else } }); }
  }
  // 주인 보고: 받는 자리마다 정의에 줄이 없는 값들을 한 변으로(건 주인 자리, 없으면 사람)
  const receives = new Set([...flow.flatMap((l) => l.to), ...(def.cycles || []).map((c) => c.to)]);
  for (const name of seatColumns(def)) {
    if (!receives.has(name) || name === ownerSeat) continue;
    const values = results.filter((v) => !flow.some((l) => l.from === name && l.on === v));
    if (values.length) edges.push({ id: E.report(name), type: 'report', from: seatId(name), to: ownerSeat ? seatId(ownerSeat) : 'human', meta: { values } });
  }
  for (const [name, x] of Object.entries(seats)) {
    for (const m of x.may || []) {
      const outside = m === '*' || m.startsWith('@');
      edges.push({ id: E.may(name, m), type: 'may', from: seatId(name), to: outside ? m : seatId(m), meta: outside ? { outside: true } : {} });
    }
    const use = x.tools || Object.keys(tools);
    for (const t of use) if (tools[t]) edges.push({ id: E.uses(name, t), type: 'uses', from: seatId(name), to: `tool:${t}`, meta: {} });
    const w = (ampSeats[name] || {}).writes;
    if (Array.isArray(w)) for (const p of w) edges.push({ id: E.writes(name, p), type: 'writes', from: seatId(name), to: fileNode(p, { writes: [name] }), meta: {} });
  }
  for (const cy of def.cycles || []) edges.push({ id: E.cycle(cy.index), type: 'cycle', from: `cycle:${cy.index}`, to: seatId(cy.to), meta: { every: cy.every } });
  edges.push({ id: E.edits(), type: 'edits', from: 'builder', to: 'def', meta: {} });
  nodes.push(...files.values());
  // 관문: 훅이 걸리는 변(또는 마디)
  const ids = (t) => edges.filter((e) => e.type === t).map((e) => e.id);
  for (const h of def.hooks || []) {
    let on = [];
    if (h.at === 'deliver') {
      const flowEdges = [...ids('assign'), ...ids('result'), ...ids('else')];
      on = h.from === 'flow' ? [...ids('result'), ...ids('else')] : h.from === 'agent' ? ids('assign') : h.from === 'human' ? ['human'] : [...flowEdges, 'human'];
    } else if (h.at === 'done') on = [...ids('result'), ...ids('report')];
    else if (h.at === 'tool-before' || h.at === 'tool-after') on = edges.filter((e) => e.type === 'uses' && (!h.tool || e.to === `tool:${h.tool}`)).map((e) => e.id);
    else if (h.at === 'pre-tool') { const p = amp && (amp.preTool || []).find((x) => x.index === h.index); const ss = p && p.seats && p.seats.length ? p.seats : Object.keys(seats); on = ss.map(seatId); }
    gates.push({ hook: h.index, at: h.at, on, label: hookLabel(h), meta: { run: h.run, onFail: h.onFail, ...(h.at === 'deliver' ? { from: h.from } : {}), ...(h.tool ? { tool: h.tool } : {}) } });
  }
  if (amp) {
    const sv = Object.keys(seats).filter((nm) => { const a = ampSeats[nm] || {}; return a.stopVerify != null ? a.stopVerify : amp.stopVerify; });
    if (sv.length) gates.push({ hook: null, at: 'stop-verify', on: sv.map(seatId), label: 'stop-verify', meta: {} });
  }
  return { n, hash, nodes, edges, gates };
}

// ---------- 장부 접기 ----------
// 장부 줄(seq 차례, 여러 건) → Map 건 → { id, owner, ownerSeat, state, defN, createdAt, lastAt, lastStepSeq, steps: [{ n, kind, edge, seq, t, value }], units: Map, gates: [{ edge|node, hook, value, t, at }], blocked }
export function foldCases(events) {
  const out = new Map();
  for (const e of events) {
    if (!e.caseId) continue;
    let c = out.get(e.caseId);
    if (!c) { c = { id: e.caseId, owner: null, ownerSeat: null, state: 'open', defN: e.defN ?? null, createdAt: e.t, lastAt: e.t, lastStepSeq: 0, steps: [], units: new Map(), gates: [], blocked: null, stateAt: e.t }; out.set(e.caseId, c); }
    c.lastAt = e.t;
    const k = e.kind;
    if (k === 'case_open') { c.owner = e.session; c.ownerSeat = e.seat; c.createdAt = e.t; c.defN = e.defN ?? c.defN; c.state = 'open'; c.stateAt = e.t; continue; }
    if (k.startsWith('case_')) {
      c.state = k === 'case_resumed' ? 'open' : k.slice(5); c.stateAt = e.t;
      c.blocked = k === 'case_blocked' ? e.text : k === 'case_resumed' ? null : c.blocked;
      if (k === 'case_done' || k === 'case_cancelled') c.units.clear();
      continue;
    }
    if (STEP_KINDS.has(k)) {
      const edge = stepEdge(e);
      c.steps.push({ n: c.steps.length + 1, kind: k, edge, seq: e.seq, t: e.t, value: e.value, from: e.fromSeat, to: e.toSeat });
      c.lastStepSeq = e.seq;
      const to = k === 'cycle' ? e.toSeat || e.seat : e.toSeat;
      if (e.unitId && to && to !== OWNER && k !== 'report') c.units.set(e.unitId, { unit: e.unitId, seat: to, session: (e.data && e.data.to) || (k === 'cycle' ? e.session : null), state: e.data && e.data.queued ? 'queued' : 'assigned', since: e.t, reason: null });
      continue;
    }
    const u = e.unitId ? c.units.get(e.unitId) : null;
    if (k === 'seat_queue' && e.unitId) { const x = u || { unit: e.unitId, seat: e.toSeat || e.seat, session: null }; c.units.set(e.unitId, { ...x, state: 'queued', since: e.t, reason: null }); continue; }
    if (k === 'try_start' && e.unitId) { const x = u || { unit: e.unitId, seat: e.seat }; c.units.set(e.unitId, { ...x, seat: x.seat || e.seat, session: e.session, state: 'working', since: e.t, reason: null }); continue; }
    if (k === 'done' && e.unitId) { c.units.delete(e.unitId); continue; }
    if (k === 'try_stopped' && u) { const st = e.value === 'idle_no_done' ? 'idle_no_done' : e.value === 'needs_human' ? 'human_turn' : 'stopped'; c.units.set(e.unitId, { ...u, state: st, since: e.t, reason: st === 'stopped' ? e.value : null }); continue; }
    if (k === 'retried' && u) { c.units.set(e.unitId, { ...u, session: (e.data && e.data.to_session) || e.session, state: 'working', since: e.t, reason: null }); continue; }
    if (k === 'gate') { const where = gateWhere(e); if (where) c.gates.push({ ...where, hook: e.data ? e.data.hook ?? null : null, at: e.data ? e.data.at : null, value: e.value, t: e.t, seq: e.seq }); continue; }
  }
  return out;
}
// 넘김 사건이 지난 변
export function stepEdge(e) {
  if (e.kind === 'assign') return e.line != null ? E.assign(e.line) : null;
  if (e.kind === 'handoff') return e.line != null && e.toSeat ? E.result(e.line, e.toSeat) : null;
  if (e.kind === 'escalate') return e.line != null && e.toSeat ? E.else(e.line) : null;
  if (e.kind === 'report') { if (e.line != null) { const to = e.data && e.data.ownerSeat; return to ? E.result(e.line, to) : null; } return e.fromSeat ? E.report(e.fromSeat) : null; }
  if (e.kind === 'cycle') { const i = e.data && e.data.cycle != null ? e.data.cycle : e.ref; return i != null ? E.cycle(i) : null; }
  return null;
}
// 관문 줄이 걸린 변이나 마디 → { edge } | { node } | null
function gateWhere(e) {
  const at = e.data && e.data.at;
  if (at === 'deliver') return e.line != null && e.toSeat ? { edge: E.result(e.line, e.toSeat) } : e.data && e.data.from === 'human' && e.seat ? { node: 'human' } : null;
  if (at === 'done') return e.seat ? { seat: e.seat, result: e.data && e.data.result } : null;
  if ((at === 'tool-before' || at === 'tool-after') && e.seat && e.data && e.data.tool) return { edge: E.uses(e.seat, e.data.tool) };
  if ((at === 'pre-tool' || at === 'stop-verify') && e.seat) return { node: seatId(e.seat) };
  return null;
}

// ---------- 오버레이 ----------
// c: foldCases의 한 건, graph: defGraph, live: { stateOf(sessionId) → 상태 | null } → { case, passed, now, next }
export function overlayOf(c, graph, def, live = {}) {
  const edgeIds = new Set(graph.edges.map((e) => e.id));
  const passed = new Map();
  for (const s of c.steps) {
    if (!s.edge) continue;
    const p = passed.get(s.edge) || { edge: s.edge, steps: [], count: 0, lastGate: null, known: edgeIds.has(s.edge) };
    p.steps.push(s.n); p.count++; passed.set(s.edge, p);
  }
  // 관문 판정을 변에 단다(done 훅은 그 자리에서 그 값으로 나가는 변). 거절된 넘김처럼 지나지 못한 변도 판정이 있으면 담는다(steps 빈 목록)
  const flow = (def && def.flow) || [];
  for (const g of c.gates) {
    let on = g.edge ? [g.edge] : [];
    if (g.seat) { const ls = flow.filter((l) => l.from === g.seat && l.on === g.result); on = ls.length ? ls.flatMap((l) => l.to.map((t) => E.result(l.index, t))) : [E.report(g.seat)]; }
    for (const id of on) {
      const p = passed.get(id) || { edge: id, steps: [], count: 0, lastGate: null, known: edgeIds.has(id) };
      p.lastGate = { hook: g.hook, at: g.at, value: g.value, t: g.t }; passed.set(id, p);
    }
  }
  const now = [];
  for (const u of c.units.values()) {
    let state = u.state === 'assigned' ? 'working' : u.state;
    const ls = u.session && live.stateOf ? live.stateOf(u.session) : null;
    if ((state === 'working' || state === 'idle_no_done') && HUMAN_STATES.has(ls)) state = 'human_turn';
    now.push({ node: seatId(u.seat), state, session: u.session || null, sessionName: u.session && live.nameOf ? live.nameOf(u.session) : null, unit: u.unit, since: u.since, ...(u.reason ? { reason: u.reason } : {}) });
  }
  const ownerNode = c.ownerSeat ? seatId(c.ownerSeat) : 'human';
  if (c.state === 'waiting_owner') now.push({ node: ownerNode, state: 'waiting_owner', session: c.owner, sessionName: c.owner && live.nameOf ? live.nameOf(c.owner) : null, since: c.stateAt });
  if (c.state === 'blocked') now.push({ node: ownerNode, state: 'stopped', session: c.owner, sessionName: c.owner && live.nameOf ? live.nameOf(c.owner) : null, since: c.stateAt, reason: `blocked: ${c.blocked || '?'}` });
  // 다음: 지금 일이 있는 자리(줄에 선 일과 멈춘 것 제외)에서 나갈 수 있는 변
  const next = []; const seen = new Set();
  for (const x of now) {
    if (x.state === 'queued' || !x.node.startsWith('seat:')) continue;
    for (const e of graph.edges) {
      if (e.from !== x.node || !['assign', 'result', 'report'].includes(e.type) || seen.has(e.id)) continue;
      seen.add(e.id);
      const to = e.to.replace(/^seat:/, '');
      next.push({ edge: e.id, label: e.type === 'assign' ? `assign → ${to}` : e.type === 'report' ? `${e.meta.values.join('·')} → 주인` : `${e.meta.value} → ${to}${e.meta.max != null ? ` (max ${e.meta.max})` : ''}` });
    }
  }
  return { case: c.id, passed: [...passed.values()].sort((a, b) => (a.steps[0] || 1e9) - (b.steps[0] || 1e9)), now, next };
}

// 건 하나의 지금 자리 한 곳(다른 건 이름표) → { on, label }
export function whereOf(c, ov) {
  const x = ov.now[0];
  const short = c.id;
  if (x) return { on: x.node, label: `건 ${short} · ${NOW_LABEL[x.state] || x.state}${x.node.startsWith('seat:') ? ` · ${x.node.slice(5)}` : ''}` };
  const last = [...c.steps].reverse().find((s) => s.edge);
  return { on: last ? last.edge : 'def', label: `건 ${short} · ${c.state}` };
}

// 장부 + 정의 → 지도(세션 상태 얹기 전). o: { ws, def, n, hash, caseId, protectedFiles, events, status }
export function buildRigMap({ ws, def, n = null, hash = null, caseId = null, protectedFiles = [], events = [], status = {}, live = {} }) {
  const graph = defGraph(def, { n, hash, protectedFiles });
  const folds = foldCases(events);
  const all = [...folds.values()];
  const open = all.filter((c) => LIVE.has(c.state));
  let pick = caseId ? folds.get(caseId) || null : null;
  if (!caseId) pick = open.slice().sort((a, b) => b.lastStepSeq - a.lastStepSeq || b.createdAt - a.createdAt)[0] || null;
  const overlay = pick ? overlayOf(pick, graph, def, live) : null;
  const ovs = new Map(all.map((c) => [c.id, c === pick ? overlay : overlayOf(c, graph, def, live)]));
  const cases = all.slice().sort((a, b) => b.createdAt - a.createdAt).map((c) => ({ id: c.id, name: null, state: c.state, owner: c.owner && live.nameOf ? live.nameOf(c.owner) : c.owner, ownerSession: c.owner, ownerSeat: c.ownerSeat, defN: c.defN, createdAt: c.createdAt, lastAt: c.lastAt, at: ovs.get(c.id).now.map((x) => x.node) }));
  const others = open.filter((c) => c !== pick).map((c) => ({ case: c.id, name: null, ...whereOf(c, ovs.get(c.id)) }));
  const nows = open.flatMap((c) => ovs.get(c.id).now);
  return {
    ws,
    state: { enabled: !!status.enabled, defN: status.defN ?? n, valid: status.valid !== false, ...(status.reason ? { reason: status.reason } : {}), openCases: open.length, humanTurns: nows.filter((x) => x.state === 'human_turn' || x.state === 'waiting_owner').length, stopped: nows.filter((x) => x.state === 'stopped' || x.state === 'idle_no_done').length },
    def: graph, overlay, cases, others,
  };
}

// ---------- 판 쪽(담아 두기, 세션 상태 얹기) ----------
export class RigMap {
  constructor(b) { this.b = b; this.memo = new Map(); this.hits = 0; this.misses = 0; }
  // 판 API rig.map → 지도
  get(key, { caseId = null } = {}) {
    const b = this.b; const st = b.store; const rig = b.rig;
    const want = caseId ? String(caseId).trim() : null;
    const r = rig ? rig.read(key) : { present: false };
    const enabled = rig ? rig.enabled(key) : false;
    // 건을 주면 그 건이 쥔 버전의 정의
    let def = r.def || null; let n = r.n ?? null; let hash = r.hash || null;
    const c = want && st.getCase ? st.getCase(want) : null;
    if (want && (!c || c.workspaceKey !== key)) throw Object.assign(new Error(`이 워크스페이스에 건 ${want}이 없다`), { code: 'not_found' });
    if (c && c.versionN != null && c.versionN !== n && rig) { const v = st.rigVersion ? st.rigVersion(key, c.versionN) : null; const d = rig.versionDef(key, c.versionN); if (d) { def = d; n = c.versionN; hash = v ? v.hash : null; } }
    const last = st.lastRigSeq ? st.lastRigSeq(key) : 0;
    const prot = rig && rig.rigProtected ? rig.rigProtected(key) : null;
    const sig = `${key}|${hash || '-'}|${last}|${want || ''}|${enabled ? 1 : 0}|${r.invalid || ''}|${prot ? JSON.stringify(prot.files.map((f) => f.path)) : ''}`;
    let base = this.memo.get(key);
    if (!base || base.sig !== sig) {
      this.misses++;
      const events = st.rigEventsForMap ? st.rigEventsForMap(key, { want }) : [];
      base = { sig, events, def, n, hash, protectedFiles: prot ? prot.files.map((f) => f.path) : [], status: { enabled, defN: n, valid: !!(r.present && !r.invalid), reason: !r.present ? 'none' : r.invalid || null } };
      this.memo.set(key, base);
    } else this.hits++;
    // 세션 상태(부를 때마다): 이름, 지금 상태, 앉은 세션, 제작 세션
    const live = {
      stateOf: (sid) => { const s = b.sessions.get(sid); if (!s) return null; try { return b.summary ? b.summary(s).state : null; } catch { return null; } },
      nameOf: (sid) => { const s = b.sessions.get(sid); if (s) return shownName(s) || s.name; const row = st.getSession ? st.getSession(sid) : null; return row ? shownName(row) || row.name : null; },
    };
    const out = buildRigMap({ ws: key, def: base.def, n: base.n, hash: base.hash, caseId: want, protectedFiles: base.protectedFiles, events: base.events, status: base.status, live });
    for (const node of out.def.nodes) {
      if (node.type === 'seat') node.meta.sessions = [...b.sessions.values()].filter((s) => s.workspaceKey === key && s.rigSeat === node.label).map((s) => ({ sessionId: s.sessionId, name: shownName(s) || s.name, state: live.stateOf(s.sessionId) }));
      if (node.type === 'builder' && b.rigSetup && b.rigSetup.isWorkspaceBuilder) node.meta.sessions = [...b.sessions.values()].filter((s) => s.workspaceKey === key && (() => { try { return b.rigSetup.isWorkspaceBuilder(s); } catch { return false; } })()).map((s) => ({ sessionId: s.sessionId, name: shownName(s) || s.name, state: live.stateOf(s.sessionId) }));
    }
    out.seq = last;
    return out;
  }
}

// 판 API 처리기(backend.mjs handlers에 펼친다). 둘 다 보기라 판 API 토큰과 기기 토큰이 본다(에이전트 세션 토큰은 이 API에 붙지 못한다)
export function rigMapHandlers(b) {
  const keyOf = async (p) => (await b.resolveWorkspace(p && p.workspace)).key;
  const M = () => b.rigMap || (b.rigMap = new RigMap(b));
  return {
    'rig.events': async (p) => b.branch.rigAdmin.events(await keyOf(p), { case: p && p.case, since: p && p.since, kinds: p && p.kinds, limit: p && p.limit }),
    'rig.map': async (p) => M().get(await keyOf(p), { caseId: p && p.case }),
  };
}
