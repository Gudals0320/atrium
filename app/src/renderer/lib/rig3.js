// P241: rig 3(역할 조직) 판의 보기 자료. rig.get·rig.status의 rig3(백엔드 rig3-roles.mjs view)를 화면 줄로 바꾼다.
// 화면은 읽기만 하는 구조 보기와 켜기만 있다(편집 표·자리 표·흐름 표는 없다). 단위 시험 test/p241-lib.test.mjs
export const isRig3 = (st) => !!(st && (st.format === 3 || st.rig3));

// 역할 줄: { name, owns, tools, session: { name, state } | null, stateKey, gaveUp, docMissing }
//   stateKey: 사전 state.<값>(세션 없음은 none, 다시 띄우기를 멈춤은 gaveUp)
//   live: 창의 세션 목록(Map: sessionId → 요약). 있으면 그 상태가 이긴다(rig.get을 다시 읽기 전에도 따라간다)
export function roleRows(r3, live = null) {
  if (!r3 || !Array.isArray(r3.roles)) return [];
  return r3.roles.map((r) => {
    const cur = r.session && live && live.get ? live.get(r.session.sessionId) : null;
    const s = r.session ? (cur ? { ...r.session, state: cur.state || r.session.state, asleep: cur.state === 'sleeping' || (!cur.state && r.session.asleep) } : r.session) : null;
    const stateKey = r.gaveUp && !s ? 'gaveUp' : !s ? 'none' : s.asleep ? 'sleeping' : s.state || 'unknown';
    return { name: r.name, owns: r.owns || [], tools: r.tools || [], launcher: r.launcher || 'claude', model: r.model || null, session: s, stateKey, gaveUp: !!r.gaveUp, docMissing: r.docMissing || [] };
  });
}
// 길 줄: "snapshot: data → ideas", human은 사람(창구)
export function flowRows(r3) {
  if (!r3 || !Array.isArray(r3.flows)) return [];
  return r3.flows.map((f, i) => ({ key: `${i}`, item: f.item, from: f.from || [], to: f.to || [], human: (f.from || []).includes('human'), for: f.for || null }));
}
// 켜기 확인 줄의 역할 수
export const roleCount = (st) => (st && st.rig3 && Array.isArray(st.rig3.roles) ? st.rig3.roles.length : 0);
// 켜기를 보일까(이 PC의 창, 꺼짐, 맞는 정의)
export const canEnable3 = (st, { remote = false } = {}) => !remote && !!st && st.status === 'off' && !st.why;
