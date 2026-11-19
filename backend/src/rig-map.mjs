// P251: rig를 눈으로 보기(docs research rig3-map.md). 세션 맵의 구조 지도와 캔버스의 길 선에 줄 자료 한 벌과, 켤 때 한 번 역할 노드를 길 차례로 놓기.
// - 판 API rig.map { workspace? } → { maps: [지도 자료] }(workspace를 주면 그 하나, 없으면 rig 정의가 있는 워크스페이스 모두). 읽기만 한다(창, 휴대폰).
//   자료는 rig.status의 rig3 보기(rig-roles.mjs view)를 바탕으로 이번 사이클의 길 수(rig-beat collectCycle), 길마다 열린 반려·최근 항목,
//   섹터마다 최근 항목, 도구의 마지막 실행, 기다리는 raise, 사이클 항목 순서, 최근 변경 기록 꼭지, 머리 띠 수를 더한다.
// - 갱신: 창은 rig.roles·rig.events 판 이벤트 때 다시 읽는다(자주 바뀌는 세션 상태는 창의 세션 값이 이긴다).
// - 기다리는 raise: 역할이 빌더에게 올린 것(rig3_tunes kind raise) 뒤에 빌더나 사람이 고친 판(rig_versions by builder | human)이 아직 없으면 기다림.
//   다뤄지면(그 뒤 판이 생기면) 사라진다(설계 4절 "다뤄지면 사라진다"를 판이 아는 사실로 옮긴 것).
//   P252: 빌더나 사람이 고치지 않고 답해도(atrium rig answer, 판 API rig.raiseAnswer) 사라진다. 셈은 rig-tune.mjs raiseStates 하나다.
// - 켤 때 놓기(placeRoles): rig를 켠 뒤 역할 노드를 길 차례(rig-map-layout.mjs roleOrder)로 나란히 놓는다. 켤 때마다 한 번이고 그 뒤에는 사람이 옮긴 자리를 지킨다.
import { collectCycle } from './rig-beat.mjs';
import { waitingRaises, raiseStates } from './rig-tune.mjs';
import { HUMAN, BUILDER_ROLE } from './rig-def-names.mjs';
import { roleOrder } from './rig-map-layout.mjs';

export const MAP_RECENT = 3; // 섹터마다 보이는 최근 항목 수(더 있으면 +n)
export const FLOW_RECENT = 4; // 길마다 마우스를 올리면 뜨는 최근 항목 수
export const CYCLE_ITEMS = 12; // 사이클 띠의 항목 수(앞에서부터)
// P253: 머리 띠 "사람이 볼 것" 수 = 이번 사이클의 사람이 볼 것(collectCycle decide) 가운데 아직 열린 것.
//   올림(raise)은 답했거나(answered) 고친 판으로 닫힌(fixed) 것을 뺀다(raiseStates). id 없는 옛 올림은 그대로 센다.
//   변경 기록 꼭지는 그대로 남긴다(기록이다). 수만 바뀐다.
export function openDecide(decide, states) {
  const closed = new Set((states || []).filter((x) => x.state !== 'waiting').map((x) => x.id));
  return (decide || []).filter((d) => !(d && d.what === 'raise' && d.id && closed.has(d.id)));
}
export const PLACE = { GX: 360, GY: 240 }; // 켤 때 놓는 역할 노드 사이(길 선과 그 글이 노드 밖에 보일 만큼)

const low = (p) => String(p || '').replace(/\\/g, '/').toLowerCase();
const RANK = { returned: 5, waiting: 4, accepted: 3, passed: 2, superseded: 1, dropped: 1 };

// 항목 한 판의 보이는 상태: 끝난 판(superseded·dropped) → 그 값, 받음 줄 가운데 반려 > 기다림 > 받음 > 넘김, 없으면 live
export function itemState(it, recs) {
  if (!it) return 'live';
  if (it.state === 'superseded' || it.state === 'dropped') return it.state;
  let best = null;
  for (const r of recs || []) if (RANK[r.state] && (!best || RANK[r.state] > RANK[best])) best = r.state;
  return best || 'live';
}

// 사이클 구간의 장부 줄(rig-beat facts와 같은 자르기)
function cycleRows(st, key, c) {
  if (!c) return [];
  const next = st.getRig3Cycle(key, c.n + 1);
  const to = next ? next.openedAt : Infinity;
  try {
    return c.openSeq != null
      ? st.rigEvents({ ws: key, sinceSeq: c.openSeq - 1, limit: 100000 }).filter((e) => !next || next.openSeq == null || e.seq < next.openSeq)
      : st.rigEvents({ ws: key, sinceT: c.openedAt, limit: 100000 }).filter((e) => e.t < to);
  } catch { return []; }
}
const ITEM_KINDS = { item_put: 'put', item_accept: 'accept', item_return: 'return', item_pass: 'pass', item_drop: 'drop' };

// 워크스페이스 하나의 지도 자료 → 자료 | null(정의 없음)
export function rigMapOf(b, key) {
  if (!b.rig || !b.rig3) return null;
  const r = b.rig.read(key);
  if (!r.present) return null;
  const st = b.store;
  const w = st.getWorkspace(key);
  const rs = b.rig.status(key);
  const def = r.def && r.def.v3 ? r.def : null;
  const base = { workspace: key, root: w ? w.root : null, status: rs.state, enabled: rs.enabled, invalid: rs.invalid || null, versionN: rs.version ?? null };
  if (!def) return { ...base, name: null, roles: [], flows: [], order: null };
  const r3 = def.rig3;
  const v = rs.rig3 || b.rig3.view(key, def);
  // 항목·받음
  let revs = [], recs = [];
  try { revs = st.allItemRevs(key) || []; recs = st.receipts(key, {}) || []; } catch { revs = []; recs = []; }
  const recsOf = new Map();
  for (const x of recs) { const k = x.itemId + '#' + x.rev; if (!recsOf.has(k)) recsOf.set(k, []); recsOf.get(k).push(x); }
  const lastRev = new Map();
  for (const it of revs) { const o = lastRev.get(it.id); if (!o || it.rev > o.rev) lastRev.set(it.id, it); }
  const latest = [...lastRev.values()].sort((a, b2) => b2.t - a.t);
  const viewItem = (it) => {
    const rr = recsOf.get(it.id + '#' + it.rev) || [];
    const ret = rr.find((x) => x.state === 'returned');
    return { id: it.id, rev: it.rev, kind: it.kind, role: it.role, path: it.path, state: itemState(it, rr), t: it.t, cycle: it.cycle ?? null, reason: ret ? ret.note || null : null, by: ret ? ret.role : null };
  };
  // 이번 사이클
  const cyc = (() => { try { return st.lastRig3Cycle(key); } catch { return null; } })();
  const rows = cycleRows(st, key, cyc);
  let facts = null;
  try { facts = cyc ? collectCycle(r3, rows, { n: cyc.n, from: cyc.openedAt, to: Date.now(), by: cyc.by }) : null; } catch { facts = null; }
  // 길
  const flows = r3.flows.map((f, i) => {
    const mine = latest.filter((it) => it.kind === f.item && f.from.includes(it.role));
    const open = mine.filter((it) => it.state === 'live' && (recsOf.get(it.id + '#' + it.rev) || []).some((x) => x.state === 'returned' && f.to.includes(x.role)));
    const fc = facts ? facts.flows[i] : null;
    const all = (v.flows && v.flows[i] && v.flows[i].counts) || null;
    return {
      i, item: f.item, from: f.from, to: f.to, for: f.for || null, human: f.from.includes(HUMAN),
      waiting: all ? all.waiting : 0,
      cycle: fc ? { put: fc.put, accepted: fc.accepted, returned: fc.returned, passed: fc.passed, dropped: fc.dropped } : null,
      total: all,
      openReturns: open.length,
      last: mine.slice(0, FLOW_RECENT).map(viewItem),
    };
  });
  // 도구: 마지막 실행과 이번 사이클 경보
  let runs = [];
  try { runs = st.lastToolRuns ? st.lastToolRuns(key) : []; } catch { runs = []; }
  const runOf = new Map(runs.map((x) => [x.tool, x]));
  const nextOf = new Map(((v.cycle && v.cycle.tools) || []).map((t) => [t.name, t]));
  const toolView = (name) => {
    const t = r3.tools[name] || { name };
    const run = runOf.get(name);
    const fx = facts && facts.tools[name];
    const nx = nextOf.get(name);
    return { name, every: t.every || null, nextAt: nx ? nx.nextAt || null : null, running: !!(nx && nx.running), last: run ? { status: run.status, exit: run.exitCode, at: run.endedAt || run.startedAt } : null, alarms: fx ? fx.alarms.length : 0 };
  };
  // 역할
  const foreign = new Map();
  for (const x of (facts && facts.foreign) || []) for (const c of x.candidates || []) foreign.set(c, (foreign.get(c) || 0) + 1);
  const roles = (v.roles || []).map((x) => {
    const sectors = (x.owns || []).map((p) => {
      const lp = low(p);
      const its = latest.filter((it) => low(it.path).startsWith(lp));
      return { path: p, items: its.slice(0, MAP_RECENT).map(viewItem), more: Math.max(0, its.length - MAP_RECENT) };
    });
    const rb = r3.roles[x.name] && r3.roles[x.name].beat;
    return {
      name: x.name, launcher: x.launcher, model: x.model, effort: x.effort, session: x.session, gaveUp: !!x.gaveUp,
      received: x.items ? x.items.pending : 0, unanswered: x.items ? x.items.unanswered : 0, returnedOwn: x.items ? x.items.returned : 0, stalled: x.items ? x.items.stalled || [] : [],
      docN: x.tune ? x.tune.n ?? null : null, material: x.tune ? x.tune.material || 0 : 0, foreign: foreign.get(x.name) || 0,
      beat: rb ? { every: rb.every || null, at: rb.at || null } : r3.beat && r3.beat.role === x.name ? { every: r3.beat.every || null, at: r3.beat.at || null, cycle: true } : null,
      sectors, tools: (x.tools || []).map(toolView),
      intake: flows.filter((f) => f.human && f.to.includes(x.name)).map((f) => f.item),
    };
  });
  // 기다리는 raise
  let raises = [];
  try { raises = waitingRaises(st, key); } catch { raises = []; } // P252: { id, role, reason, t }
  // 사이클 항목 순서(앞에서부터)
  const cycleItems = [];
  for (const e of rows) {
    const what = ITEM_KINDS[e.kind];
    if (!what || (e.kind === 'item_pass' && e.value === 'turn') || !e.ref) continue;
    cycleItems.push({ k: cycleItems.length + 1, id: e.ref, what, role: e.seat || (e.kind === 'item_put' ? e.fromSeat : null) || HUMAN, to: e.toSeat || null, reason: e.data && e.data.reason ? String(e.data.reason).slice(0, 160) : null, t: e.t });
  }
  const entries = (v.cycle && v.cycle.entries) || [];
  const stalledRoles = roles.filter((x) => x.stalled.length).length;
  let rstates = [];
  try { rstates = raiseStates(st.rig3Tunes(key, null) || [], st.rigVersions ? st.rigVersions(key) || [] : []); } catch { rstates = []; }
  const decide = facts ? openDecide(facts.decide, rstates).length : 0;
  return {
    ...base, name: def.name || null, purpose: r3.purpose || null,
    head: { cycle: v.cycle ? v.cycle.n : null, nextAt: v.cycle ? v.cycle.nextAt || null : null, beat: r3.beat ? { every: r3.beat.every || null, at: r3.beat.at || null, role: r3.beat.role || null } : null, attention: decide, stalled: stalledRoles + roles.filter((x) => x.gaveUp).length, raises: raises.length },
    builder: v.builder ? v.builder.session : null, raises,
    roles, flows, intake: flows.filter((f) => f.human).map((f) => ({ item: f.item, to: f.to })),
    cycleItems: cycleItems.slice(0, CYCLE_ITEMS), cycleMore: Math.max(0, cycleItems.length - CYCLE_ITEMS),
    entry: entries[0] ? { n: entries[0].n, at: entries[0].at || null, text: entries[0].text || '' } : null,
  };
}

// rig 정의가 있는 워크스페이스 모두 → [자료]
export function rigMaps(b) {
  const out = [];
  for (const w of (b.store.workspaces ? b.store.workspaces() : [])) {
    try { const m = rigMapOf(b, w.key); if (m) out.push(m); } catch (e) { b.log && b.log('rig map ' + w.key + ': ' + (e.stack || e.message)); }
  }
  return out;
}

// 켠 뒤 한 번: 역할 노드를 길 차례로 놓는다. 닻은 역할 노드들의 왼쪽 위(처음 띄운 자리 근처). → 옮긴 수
export function placeRoles(b, key) {
  const r = b.rig3 ? b.rig3.defOf(key) : null;
  if (!r) return 0;
  const r3 = r.def.rig3;
  const names = Object.keys(r3.roles);
  const o = roleOrder(names, r3.flows);
  const byS = new Map((b.store.nodes ? b.store.nodes() : []).map((n) => [n.session_id, n]));
  const nodes = new Map();
  for (const n of names) { const s = b.rig3.sessionsOf(key, n)[0]; const nd = s && byS.get(s.sessionId); if (nd) nodes.set(n, { s, nd }); }
  if (!nodes.size) return 0;
  const xs = [...nodes.values()].map((x) => x.nd);
  const x0 = Math.min(...xs.map((n) => n.x)), y0 = Math.min(...xs.map((n) => n.y));
  const W = Math.max(...xs.map((n) => n.w)), H = Math.max(...xs.map((n) => n.h));
  // 줄마다 높이 = 그 줄 칸들의 가장 많은 역할 수
  const rowsIn = new Map();
  for (const n of names) { const l = o.line.get(n); rowsIn.set(l, Math.max(rowsIn.get(l) || 0, o.row.get(n) + 1)); }
  const lineY = []; let acc = 0;
  for (let l = 0; l < o.lines; l++) { lineY.push(acc); acc += (rowsIn.get(l) || 1) * (H + PLACE.GY) + PLACE.GY; }
  let moved = 0;
  for (const [n, { s, nd }] of nodes) {
    const x = Math.round(x0 + o.col.get(n) * (W + PLACE.GX)), y = Math.round(y0 + lineY[o.line.get(n)] + o.row.get(n) * (H + PLACE.GY));
    if (x === nd.x && y === nd.y) continue;
    b.store.setNode({ ...nd, x, y });
    moved++;
    try { b.api && b.api.broadcast('board.node', { sessionId: s.sessionId, x, y, w: nd.w, h: nd.h, z: nd.z ?? 0, by: null }); } catch {}
  }
  if (moved) b.log && b.log('rig roles placed ' + key + ': ' + moved);
  return moved;
}

// 판 API(읽기만: 창·연결한 기기)
export function rigMapHandlers(b) {
  return {
    'rig.map': async (p) => {
      if (p && p.workspace) { const key = (await b.resolveWorkspace(p.workspace)).key; const m = rigMapOf(b, key); return { maps: m ? [m] : [] }; }
      return { maps: rigMaps(b) };
    },
  };
}

// 세션이 rig 역할·빌더인가(창의 세션 요약 rigRole과 같은 뜻)
export const isRigSession = (s) => !!(s && s.rigRole);
export const isBuilder = (s) => !!(s && s.rigRole === BUILDER_ROLE);
