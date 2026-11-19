// P241: rig 3(역할 조직) 판의 보기 자료. rig.get·rig.status의 rig3(백엔드 rig3-roles.mjs view)를 화면 줄로 바꾼다.
// 화면은 읽기만 하는 구조 보기와 켜기만 있다(편집 표·자리 표·흐름 표는 없다). 단위 시험 test/p241-lib.test.mjs
export const isRig3 = (st) => !!(st && (st.format === 3 || st.rig3));
// P247: 빌더 세션 보기(rig.get의 builder3, 또는 rig.status rig3.builder). live: 창의 세션 목록 → { session: { sessionId, name, stateKey } | null, canTalk }
//   canTalk: rig 3 정의이거나 rig가 없는 워크스페이스(rig 2 정의에서는 빌더를 쓰지 않는다)
export function builderInfo(st, live = null) {
  if (!st) return { session: null, canTalk: false };
  const b = st.builder3 || (st.rig3 && st.rig3.builder) || null;
  const s = b && b.session ? b.session : null;
  const cur = s && live && live.get ? live.get(s.sessionId) : null;
  const state = cur ? cur.state : s ? (s.asleep ? 'sleeping' : s.state) : null;
  return { session: s ? { sessionId: s.sessionId, name: s.name, stateKey: state || 'unknown' } : null, canTalk: isRig3(st) || st.status === 'none' };
}

// 역할 줄: { name, owns, tools, session: { name, state } | null, stateKey, gaveUp, docMissing }
//   stateKey: 사전 state.<값>(세션 없음은 none, 다시 띄우기를 멈춤은 gaveUp)
//   live: 창의 세션 목록(Map: sessionId → 요약). 있으면 그 상태가 이긴다(rig.get을 다시 읽기 전에도 따라간다)
export function roleRows(r3, live = null) {
  if (!r3 || !Array.isArray(r3.roles)) return [];
  return r3.roles.map((r) => {
    const cur = r.session && live && live.get ? live.get(r.session.sessionId) : null;
    const s = r.session ? (cur ? { ...r.session, state: cur.state || r.session.state, asleep: cur.state === 'sleeping' || (!cur.state && r.session.asleep) } : r.session) : null;
    const stateKey = r.gaveUp && !s ? 'gaveUp' : !s ? 'none' : s.asleep ? 'sleeping' : s.state || 'unknown';
    return { name: r.name, owns: r.owns || [], tools: r.tools || [], launcher: r.launcher || 'claude', model: r.model || null, session: s, stateKey, gaveUp: !!r.gaveUp, docMissing: r.docMissing || [], tune: r.tune || null };
  });
}
// 길 줄: "snapshot: data → ideas", human은 사람(창구)
export function flowRows(r3) {
  if (!r3 || !Array.isArray(r3.flows)) return [];
  return r3.flows.map((f, i) => ({ key: `${i}`, item: f.item, from: f.from || [], to: f.to || [], human: (f.from || []).includes('human'), for: f.for || null, counts: f.counts || null }));
}
// P242: 입력 창구 줄(from에 human이 있는 길): [{ item, to }]
export function intakeRows(r3) {
  if (!r3 || !Array.isArray(r3.flows)) return [];
  return r3.flows.filter((f) => (f.from || []).includes('human')).map((f) => ({ item: f.item, to: f.to || [] }));
}
// P242: 받은 것에 답하지 않고 멈춘 역할: [{ role, items }]
export function stalledRows(r3) {
  if (!r3 || !Array.isArray(r3.roles)) return [];
  return r3.roles.filter((r) => r.items && r.items.stalled && r.items.stalled.length).map((r) => ({ role: r.name, items: r.items.stalled }));
}
// P242: 반려된 입력(사람이 넣은 항목): [{ id, by, reason }]
export function returnedIntake(r3) {
  const list = r3 && r3.intake && Array.isArray(r3.intake.returned) ? r3.intake.returned : [];
  return list.map((x) => ({ id: x.id, by: (x.by || []).map((b) => b.role).join(', '), reason: (x.by || []).map((b) => b.reason).filter(Boolean).join(' / ') }));
}
// P244: 사이클 보기(rig3.cycle): 지금 사이클, 다음 박자, every 도구, 최근 변경 기록 꼭지(새 것부터)
//   꼭지 글은 "## 머리\n\n몸"이다. 머리의 ## 를 떼어 제목으로, 나머지를 몸으로
export function entryParts(text) {
  const t = String(text || '').replace(/\r\n/g, '\n').trim();
  const i = t.indexOf('\n');
  const head = (i < 0 ? t : t.slice(0, i)).replace(/^#+\s*/, '');
  return { title: head, body: i < 0 ? '' : t.slice(i + 1).trim() };
}
export function cycleInfo(r3) {
  const c = r3 && r3.cycle;
  if (!c) return null;
  return {
    n: c.n, openedAt: c.openedAt || null, nextAt: c.nextAt || null, beat: c.beat || null, writing: c.writing || [], changelog: c.changelog || null,
    tools: (c.tools || []).filter((t) => t.every).map((t) => ({ name: t.name, every: t.every, nextAt: t.nextAt || null, running: !!t.running })),
    entries: (c.entries || []).map((e) => ({ n: e.n, by: e.by, at: e.at, ...entryParts(e.text) })),
  };
}
// P245: 역할 줄의 정의서 판·조정 수(rig3.roles[].tune) → { n, tunes, material, open } | null
export function tuneBadge(t) {
  if (!t) return null;
  return { n: t.n ?? null, tunes: t.tunes || 0, rollbacks: t.rollbacks || 0, material: t.material || 0, open: !!t.open, lines: t.lines ?? null, budget: t.budget ?? null };
}
// P245: 조정 기록(판 API rig3.role의 log) → 화면 줄(새 것부터). undo: 되돌릴 판(반영된 조정·되돌림의 앞 판)
export function tuneLogRows(info) {
  const log = info && Array.isArray(info.log) ? info.log : [];
  return log.slice().reverse().map((x) => ({
    id: x.id, kind: x.kind, state: x.state, n: x.n ?? null, prevN: x.prevN ?? null, fromN: x.fromN ?? null, why: x.why || '', reason: x.reason || '', evidence: x.evidence || [], added: x.added ?? 0, removed: x.removed ?? 0, t: x.t || null,
    key: x.kind === 'tune' ? (x.state === 'rejected' ? 'rejected' : 'tune') : x.kind,
    undo: x.state === 'applied' && x.prevN != null ? x.prevN : null,
  }));
}
// 켜기 확인 줄의 역할 수
export const roleCount = (st) => (st && st.rig3 && Array.isArray(st.rig3.roles) ? st.rig3.roles.length : 0);
// 켜기를 보일까(이 PC의 창, 꺼짐, 맞는 정의)
export const canEnable3 = (st, { remote = false } = {}) => !remote && !!st && st.status === 'off' && !st.why;
