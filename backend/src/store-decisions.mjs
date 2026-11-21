// 저장소(store.mjs)의 P284 표: 결정 카드(decisions).
// 결정 카드: 사람과 직접 일하는 세션(일 상위가 없는 세션)이 atrium ask로 판에 남긴 "사람이 정할 질문" 한 장(decisions.mjs).
// state: open(기다림) | answered(사람이 답함: 카드에서, 또는 세션에 직접 글을 보냄) | ignored(사람이 무시, 세션에 아무것도 보내지 않음) | closed(에이전트가 --done으로, 또는 세션이 닫힘)
// via(어디서 끝났나): pc | remote(카드: PC 창 | 원격 기기) | session(세션에 직접 보낸 글) | agent(atrium ask --done) | closed(세션 닫힘·보관)
// P286: auto(1 = 판이 마지막 답에서 만든 자동 카드, decisions.mjs onSession). via에 replaced(다음 자동 카드로 바뀜)가 더해졌다.
// 옮기기: CREATE TABLE IF NOT EXISTS라 옛 board.db에는 빈 표가 생긴다. P284 판의 표에는 auto 열을 ALTER TABLE로 더한다(DECISIONS_COLUMNS). SQL은 store.mjs와 store-*.mjs에만 둔다(ARCH 5절 "저장소").

export const DECISIONS_KEEP_MS = 30 * 24 * 3600 * 1000; // 끝난 카드는 30일 뒤 지운다(넣을 때)

export const DECISIONS_SCHEMA = `
CREATE TABLE IF NOT EXISTS decisions (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL, name TEXT, question TEXT NOT NULL, options TEXT, why TEXT, created_at INTEGER NOT NULL, state TEXT NOT NULL, answer TEXT, answered_at INTEGER, via TEXT, auto INTEGER) STRICT;
CREATE INDEX IF NOT EXISTS decisions_open ON decisions(state, session_id);
`;

// P286: held(1 = 사람이 답했지만 그 세션의 다른 열린 카드가 남아 아직 보내지 않은 답). 그 세션의 열린 카드가 모두 끝나면 한 글로 보내고 비운다
export const DECISIONS_COLUMNS = { decisions: { auto: 'INTEGER', held: 'INTEGER' } }; // P286

const parse = (s) => { try { const v = JSON.parse(s); return Array.isArray(v) ? v.map(String) : []; } catch { return []; } };
export const decisionRow = (r) => (r ? { id: Number(r.id), sessionId: r.session_id, name: r.name ?? null, question: r.question, options: r.options ? parse(r.options) : [], why: r.why ?? null, createdAt: r.created_at, state: r.state, answer: r.answer ?? null, answeredAt: r.answered_at ?? null, via: r.via ?? null, auto: !!r.auto, held: !!r.held } : null);

export function installDecisions(Store) {
  Object.assign(Store.prototype, {
    // 카드 한 장을 넣는다 → 넣은 줄
    addDecision(d, { keepMs = DECISIONS_KEEP_MS } = {}) {
      const r = this.st('INSERT INTO decisions (session_id, name, question, options, why, created_at, state, auto) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(d.sessionId, d.name ?? null, d.question, d.options && d.options.length ? JSON.stringify(d.options) : null, d.why ?? null, d.createdAt, 'open', d.auto ? 1 : null);
      this.st("DELETE FROM decisions WHERE state != 'open' AND COALESCE(answered_at, created_at) < ?").run(d.createdAt - keepMs);
      return decisionRow(this.st('SELECT * FROM decisions WHERE id = ?').get(r.lastInsertRowid));
    },
    getDecision(id) { return decisionRow(this.st('SELECT * FROM decisions WHERE id = ?').get(Number(id))); },
    // 열린 카드(오래 기다린 것 먼저). sessionId를 주면 그 세션의 것만
    openDecisions(sessionId = null) {
      return (sessionId ? this.st("SELECT * FROM decisions WHERE state = 'open' AND session_id = ? ORDER BY id").all(sessionId) : this.st("SELECT * FROM decisions WHERE state = 'open' ORDER BY id").all()).map(decisionRow);
    },
    // P286: 모아 둔 답(보낼 차례를 기다리는 answered 카드, 답한 차례대로). sessionId를 주지 않으면 모두
    heldAnswers(sessionId = null) { return (sessionId ? this.st("SELECT * FROM decisions WHERE held = 1 AND session_id = ? ORDER BY answered_at, id").all(sessionId) : this.st('SELECT * FROM decisions WHERE held = 1 ORDER BY answered_at, id').all()).map(decisionRow); },
    setHeld(id, on) { this.st('UPDATE decisions SET held = ? WHERE id = ?').run(on ? 1 : null, Number(id)); },
    // P286: 한 세션이 t 뒤에 만든 카드(열림·끝남 모두). 그 턴에 손 카드(atrium ask)를 만들었는지 본다
    decisionsSince(sessionId, t) { return this.st('SELECT * FROM decisions WHERE session_id = ? AND created_at >= ? ORDER BY id').all(sessionId, Number(t) || 0).map(decisionRow); },
    // 열린 카드 하나를 끝낸다(이미 끝났으면 null) → 끝낸 줄
    endDecision(id, { state, answer = null, via = null, at = Date.now() }) {
      const r = this.st("UPDATE decisions SET state = ?, answer = ?, answered_at = ?, via = ? WHERE id = ? AND state = 'open'").run(state, answer, at, via, Number(id));
      return r.changes ? this.getDecision(id) : null;
    },
  });
}
