// 세션 사이 일 관계(P156, ARCH 4절 K): 계보(누가 누구를 띄웠나, parent_session_id, 사실)와 일 관계(하위·동료·독립, 의도)를 나눈다.
// 순수 함수만 둔다(창과 휴대폰도 같은 뜻으로 쓸 수 있게 node 모듈을 부르지 않는다).
//
// 저장(표 relations, store-branch.mjs): 두 세션 사이 한 줄 { a, b, relation, source, at }. "b는 a의 relation"이다.
//   sub = b가 a의 하위, peer = 동료, none = 독립. 줄이 없으면 자동이다.
//   source = agent(에이전트의 atrium child --peer·atrium relate) | user(사람이 판·세션 맵에서). 자동은 줄이 없는 것이라 저장하지 않는다(auto).
// 자동 규칙(옛 판과 같다): 띄움(계보 부모 → 하위)·역할 선 = 하위. 그 밖에 이어진 쌍(알아챈 지시만 오간 선)은 독립.
// 일 부모(work parent): 그 세션을 하위로 둔 세션. 명시한 하위 줄이 이기고(여럿이면 가장 늦게 정한 것), 없으면 계보 부모(그 쌍에 명시한 관계가 없을 때).
//   하위 끄기 연쇄(child-kill), atrium children, 세션 맵의 나무, 잠재우기 묶음, 닫힘 알림, 작업 완료 세기(P159)는 일 부모를 따른다.

export const RELATIONS = ['sub', 'peer', 'none'];
export const RELATION_SET = [...RELATIONS, 'auto']; // POST relation.set·atrium relate가 받는 값(auto = 명시한 관계를 지운다)
export const RELATION_SOURCES = ['auto', 'agent', 'user'];
export const PEER_ROLE = '동료'; // atrium child --peer의 기본 역할 이름(창이 지금 언어로 바꿔 보인다)

const key = (x, y) => (x < y ? `${x}|${y}` : `${y}|${x}`);

// rows: 저장한 관계 줄들. lineageOf(id) → 계보 부모 ID | null. links: [{ from, to, role, spawned }](자동 규칙의 역할 선)
export function relationIndex({ rows = [], lineageOf = () => null, links = [] } = {}) {
  const pair = new Map(); // 쌍 키 → 줄(쌍마다 하나. 같은 쌍에 둘이면 늦은 것)
  for (const r of rows) {
    if (!r || !r.a || !r.b || r.a === r.b || !RELATIONS.includes(r.relation)) continue;
    const k = key(r.a, r.b);
    const old = pair.get(k);
    if (!old || (r.at || 0) >= (old.at || 0)) pair.set(k, r);
  }
  const roleLinks = new Set();
  for (const l of links) if (l && (l.role || l.spawned)) roleLinks.add(`${l.from}>${l.to}`);
  const explicitOf = (x, y) => pair.get(key(x, y)) || null;

  // 두 세션 사이 지금 관계. { relation, source, up(하위면 위 세션 ID), a, b } | null(아무 사이도 아님)
  function between(x, y) {
    if (!x || !y || x === y) return null;
    const r = explicitOf(x, y);
    if (r) return { relation: r.relation, source: r.source || 'agent', up: r.relation === 'sub' ? r.a : null, a: r.a, b: r.b, at: r.at || null };
    if (lineageOf(y) === x) return { relation: 'sub', source: 'auto', up: x, a: x, b: y, at: null };
    if (lineageOf(x) === y) return { relation: 'sub', source: 'auto', up: y, a: y, b: x, at: null };
    if (roleLinks.has(`${x}>${y}`)) return { relation: 'sub', source: 'auto', up: x, a: x, b: y, at: null };
    if (roleLinks.has(`${y}>${x}`)) return { relation: 'sub', source: 'auto', up: y, a: y, b: x, at: null };
    return null;
  }
  // 선 하나(from → to)의 관계. 이어진 쌍인데 위 규칙에 걸리지 않으면 독립(자동)
  function ofEdge(from, to) {
    return between(from, to) || { relation: 'none', source: 'auto', up: null, a: from, b: to, at: null };
  }
  // 일 부모: 명시한 하위 줄(가장 늦은 것), 없으면 계보 부모(그 쌍에 명시한 관계가 없을 때)
  function workParentOf(id) {
    let best = null;
    for (const r of pair.values()) if (r.relation === 'sub' && r.b === id && (!best || (r.at || 0) > (best.at || 0))) best = r;
    if (best) return best.a;
    const p = lineageOf(id);
    if (p && !explicitOf(p, id)) return p;
    return null;
  }
  // 이 세션과 명시한 관계(동료·독립)로 이어진 세션들
  function withRelation(id, relation) {
    const out = [];
    for (const r of pair.values()) if (r.relation === relation && (r.a === id || r.b === id)) out.push({ id: r.a === id ? r.b : r.a, source: r.source || 'agent', at: r.at || null });
    return out;
  }
  // x가 y의 일 자손인가(일 부모를 따라 올라가 y를 만나면). 고리는 끊는다
  function isWorkDescendant(x, y) {
    if (!x || !y || x === y) return false;
    const seen = new Set([x]);
    let cur = workParentOf(x);
    while (cur && !seen.has(cur)) { if (cur === y) return true; seen.add(cur); cur = workParentOf(cur); }
    return false;
  }
  return { between, ofEdge, workParentOf, peersOf: (id) => withRelation(id, 'peer'), independentOf: (id) => withRelation(id, 'none'), isWorkDescendant, explicitOf };
}

// 일 자손(ids: 판에 열린 세션 ID들). 깊은 것부터(끄는 순서). rel은 rootId에서 몇 단계 아래인지
export function workDescendantsOf(rootId, ids, idx) {
  const kids = new Map();
  for (const id of ids) { const p = idx.workParentOf(id); if (!p) continue; if (!kids.has(p)) kids.set(p, []); kids.get(p).push(id); }
  const out = []; const seen = new Set([rootId]);
  const walk = (id, rel) => { for (const k of kids.get(id) || []) { if (seen.has(k)) continue; seen.add(k); out.push({ sessionId: k, rel }); walk(k, rel + 1); } };
  walk(rootId, 1);
  return out.sort((a, b) => b.rel - a.rel);
}

// 계보 자손 가운데 일 관계로는 내려가지 않는 것(동료·독립으로 갈라진 가지). child-kill 응답에 남긴 이름으로 보인다
export function lineageKept(rootId, ids, lineageOf, workSet) {
  const out = [];
  for (const id of ids) {
    if (id === rootId || workSet.has(id)) continue;
    let cur = lineageOf(id); const seen = new Set([id]);
    while (cur && !seen.has(cur)) { if (cur === rootId || workSet.has(cur)) { out.push(id); break; } seen.add(cur); cur = lineageOf(cur); }
  }
  return out;
}

// 보낸 쪽과 받는 쪽 관계로 본 지시의 꼬리표(선·Thread에서 하위의 보고와 동료의 공유를 가른다)
// assign(위 → 하위 지시), report(하위 → 위 보고), share(동료끼리), null(독립·관계 없음)
export function promptTag(rel, fromId) {
  if (!rel) return null;
  if (rel.relation === 'peer') return 'share';
  if (rel.relation === 'sub') return rel.up === fromId ? 'assign' : 'report';
  return null;
}

// P175: 판에서 A → B를 이을 때 상자에서 고르는 관계(하위·동료). 기본은 하위(옛 판처럼 역할 선 = 하위)
export const LINK_CHOICES = ['sub', 'peer'];
// 고른 값과 지금 관계(between(a, b), 잇기 전) → 저장할 관계(relation.set 값) | null(자동 규칙 그대로 둔다)
// - 하위: 지금 관계가 없거나 이미 "b는 a의 하위"면 자동 규칙(역할 선 = 하위)에 맡긴다. 동료·독립·거꾸로 된 하위면 사람이 정한 하위로 바꾼다
// - 동료: 이미 동료가 아니면 사람이 정한 동료
export function linkRelationPlan(choice, cur, aId) {
  const c = LINK_CHOICES.includes(choice) ? choice : 'sub';
  if (c === 'peer') return cur && cur.relation === 'peer' ? null : 'peer';
  if (!cur || (cur.relation === 'sub' && cur.up === aId)) return null;
  return 'sub';
}
// 고른 관계의 기본 역할 이름(저장하는 말. 창은 지금 언어로 바꿔 보인다). 역할을 비워 보내면 이 이름을 쓴다
export const linkDefaultRole = (choice) => (choice === 'peer' ? PEER_ROLE : null);
