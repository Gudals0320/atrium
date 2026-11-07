// P87: 휴대폰 미션 맵(PhoneMission.jsx)의 배치. 순수 함수만 둔다(단위 시험 app/test/p87-lib.test.mjs).
// - 자료는 mission.graph(이름, 역할, 상태, 부모·하위, 연결)만 쓴다. 대화(session.messages)와 터미널은 받지 않는다.
// - 세로 휴대폰에 맞게 워크스페이스 무리(접기)마다 위 → 아래 나무로 쌓는다. 하위 세션은 부모 아래 들여 놓고, 줄마다 나무 선(guides)과 역할 이름표.
// - 나무 부모: 하위 세션의 부모(parentId) > 역할 > 띄움 > 지시. 고리가 생기는 부모는 고르지 않는다. 다른 무리의 부모는 그 무리에서 뿌리가 되고 "← @부모"를 단다(cross).
// - 나무에 들지 못한 세션 사이 연결(두 번째 지시자 등)은 보내는 줄에 "→ @받는 쪽 · 역할"로 단다.
// - 강조 등급은 P85(lib/overview.js tierOf): 일함(work)은 눈에 띄게, 내 차례(turn)·오류(alert)는 따로, 쉼·잠듦·끝남은 물러나게.
//   판의 세션 요약(live, 이미 받은 것)이 있으면 그 상태를 쓴다(mission.graph를 다시 받기 전에도 상태가 맞다).
// - 순서는 띄운 순서(order, createdAt, 이름)로 고정한다. 상태가 바뀌어도 줄이 자리를 옮기지 않는다(돌아오면 자리가 그대로).
import { tierOf } from './overview.js';
import { mergeEdges } from './mission-layout.js';

export const PM_INDENT_MAX = 4; // 이보다 깊으면 들여쓰기를 멈추고 깊이 숫자를 단다(390px 폭에 카드가 남게)
export const PM_FOLD_KEY = 'mt.phoneMissionFolded';
const PARENT_RANK = { parent: 0, role: 1, spawn: 2, prompt: 3 };
const SESSION_KINDS = ['role', 'prompt', 'spawn'];
const byName = (a, b) => String(a.name || '').localeCompare(String(b.name || '')) || String(a.id).localeCompare(String(b.id));
const bySpawn = (a, b) => (a.order ?? Infinity) - (b.order ?? Infinity) || (a.createdAt || 0) - (b.createdAt || 0) || byName(a, b);

// 줄 하나의 강조 등급. live: 판의 세션 요약(없으면 그래프 노드의 상태)
export function phoneTier(node, live) {
  const s = live || { state: node && node.state, unseen: node && node.category === 'done', kind: node && node.agentKind };
  if (s.kind === 'shell' && s.shell && s.shell.atPrompt === false && s.state !== 'exited' && s.state !== 'sleeping' && s.state !== 'error') return 'work'; // 명령이 도는 셸
  return tierOf(s);
}
// 무리 머리줄과 위쪽 요약에 세는 것
const tally = (rows) => ({ count: rows.length, work: rows.filter((r) => r.tier === 'work').length, turn: rows.filter((r) => r.tier === 'turn' || r.tier === 'alert').length });

// graph: mission.graph 결과. live: Map(sessionId → 판의 세션 요약), order: 무리 차례(워크스페이스 키들), folded: 접은 무리 키들(키가 없는 무리는 '-')
// → { groups: [{ key, folded, count, work, turn, rows }], counts: { all, work, turn } }
//   row: { id, sessionId, name, agentKind, state, tier, depth, indent, last, guides, role, from, links, ask, active, loops }
export function phoneMission(graph, { live = null, order = [], folded = [] } = {}) {
  const nodes = ((graph && graph.nodes) || []).filter((n) => n && n.kind === 'session');
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const pairs = mergeEdges((graph && graph.edges) || [], (id) => byId.has(id)).filter((p) => p.kinds.some((k) => SESSION_KINDS.includes(k)));
  for (const n of nodes) if (n.parentId && byId.has(n.parentId) && !pairs.some((p) => p.from === n.parentId && p.to === n.id)) pairs.push({ id: `${n.parentId}>${n.id}`, from: n.parentId, to: n.id, kinds: ['spawn'], primary: 'spawn', role: n.role || null, active: false });

  // 나무 부모 고르기(고리 막기)
  const parent = new Map(), via = new Map();
  const ancestorOf = (a, b) => { for (let x = b, i = 0; x && i < 1000; x = parent.get(x), i++) if (x === a) return true; return false; };
  const rankOf = (n, p) => (p.from === n.parentId ? PARENT_RANK.parent : Math.min(...p.kinds.map((k) => PARENT_RANK[k] ?? 9)));
  for (const n of [...nodes].sort(bySpawn).reverse()) { // 나중에 띄운 쪽부터 부모를 고른다(고리면 먼저 띄운 쪽이 뿌리)
    const cands = pairs.filter((p) => p.to === n.id).sort((a, b) => rankOf(n, a) - rankOf(n, b) || bySpawn(byId.get(a.from), byId.get(b.from)));
    for (const p of cands) { if (ancestorOf(n.id, p.from)) continue; parent.set(n.id, p.from); via.set(n.id, p); break; }
  }
  const groupOf = (n) => n.workspaceKey || null;
  const kids = new Map();
  for (const [c, p] of parent) if (groupOf(byId.get(c)) === groupOf(byId.get(p))) { if (!kids.has(p)) kids.set(p, []); kids.get(p).push(byId.get(c)); }
  for (const list of kids.values()) list.sort(bySpawn);
  const treeEdge = new Set([...via.values()].map((p) => p.id));

  const rowOf = (n, depth, last, guides) => {
    const l = live && n.sessionId ? live.get(n.sessionId) : null;
    const p = via.get(n.id);
    const pn = p ? byId.get(p.from) : null;
    const cross = !!pn && groupOf(pn) !== groupOf(n);
    return {
      id: n.id, sessionId: n.sessionId, name: (l && l.name) || n.name, agentKind: n.agentKind || 'claude', state: (l && l.state) || n.state, tier: phoneTier(n, l),
      depth, indent: Math.min(depth, PM_INDENT_MAX), last, guides: guides.slice(0, PM_INDENT_MAX),
      role: (p && p.role) || n.role || null, active: !!(p && p.active),
      from: cross ? { name: pn.name, key: groupOf(pn) } : null, // 다른 무리의 부모
      links: pairs.filter((x) => x.from === n.id && !treeEdge.has(x.id)).sort((a, b) => bySpawn(byId.get(a.to), byId.get(b.to))).map((x) => ({ to: byId.get(x.to).name, role: x.role || null, kind: x.primary, active: !!x.active })),
      ask: n.ask || null, loops: n.loops || 0,
    };
  };
  // 무리마다 뿌리(무리 안에 나무 부모가 없는 세션)부터 깊이 우선
  const groups = new Map();
  for (const n of nodes) { const k = groupOf(n); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(n); }
  const rank = new Map((order || []).map((k, i) => [k, i]));
  const shut = new Set((folded || []).map((k) => k || '-'));
  const out = [...groups.entries()].sort(([a], [b]) => (a == null) - (b == null) || (rank.get(a) ?? 1e9) - (rank.get(b) ?? 1e9) || String(a).localeCompare(String(b))).map(([key, list]) => {
    const roots = list.filter((n) => { const p = parent.get(n.id); return !p || groupOf(byId.get(p)) !== key; }).sort(bySpawn);
    const rows = [];
    const seen = new Set();
    const walk = (n, depth, last, guides) => {
      if (seen.has(n.id)) return;
      seen.add(n.id);
      rows.push(rowOf(n, depth, last, guides));
      const ch = kids.get(n.id) || [];
      ch.forEach((c, i) => walk(c, depth + 1, i === ch.length - 1, depth > 0 ? [...guides, !last] : guides));
    };
    roots.forEach((r) => walk(r, 0, true, []));
    for (const n of list.sort(bySpawn)) if (!seen.has(n.id)) walk(n, 0, true, []); // 고리 안에만 있는 세션(나무 밖)도 빠뜨리지 않는다
    const off = shut.has(key || '-');
    return { key, folded: off, ...tally(rows), rows: off ? [] : rows, all: rows };
  });
  const every = out.flatMap((g) => g.all);
  for (const g of out) delete g.all;
  const c = tally(every);
  return { groups: out, counts: { all: c.count, work: c.work, turn: c.turn } };
}
