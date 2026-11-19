// P241: rig 3 저장(세션이 맡은 역할). 역할의 장부는 rig_events(rig-ledger.mjs rigEvent), 정의 버전은 rig 2와 같은 rig_versions를 쓴다.
// sessions.rig_role: 판이 rig 3 역할을 위해 띄운 세션의 역할 이름(판이 다시 떠도 역할 세션을 알아본다)
// P242: rig 3 항목과 받음(2단계, rig3-items.mjs).
//   rig3_items: 항목의 판(rev)마다 한 줄. id는 <종류>-<n>(워크스페이스·종류마다 n), --redo는 같은 id의 다음 rev(앞 rev는 superseded).
//     role은 낸 역할(입력 창구는 human), path는 워크스페이스 기준 상대 경로, sha256·size는 낼 때의 파일, from_id는 어느 항목에서 나왔나,
//     cycle은 3단계(박자)가 채운다, state live | superseded | dropped, changed는 낸 뒤 파일이 바뀐 것을 판이 본 때의 값(changed | missing).
//   rig3_receipts: 받는 역할마다 한 줄(그 항목의 rev). state waiting | accepted | returned | passed | superseded | dropped.
//     late는 받는 역할이 아니라 이어진 항목을 가진 역할의 늦은 반려, flow는 정의 flows의 번호, nudged_at·stalled_at은 멈춘 역할 일깨움(한 번)과 그 뒤 장부에 남긴 때.
export const RIG3_COLUMNS = { sessions: { rig_role: 'TEXT' } };
export const RIG3_SCHEMA = `
CREATE TABLE IF NOT EXISTS rig3_items (ws TEXT NOT NULL, id TEXT NOT NULL, rev INTEGER NOT NULL, kind TEXT NOT NULL, n INTEGER NOT NULL, role TEXT NOT NULL, session_id TEXT, path TEXT NOT NULL, sha256 TEXT, size INTEGER, from_id TEXT, cycle INTEGER, state TEXT NOT NULL, state_why TEXT, state_at INTEGER, changed TEXT, t INTEGER NOT NULL, PRIMARY KEY (ws, id, rev)) STRICT;
CREATE INDEX IF NOT EXISTS rig3_items_kind ON rig3_items (ws, kind, n);
CREATE TABLE IF NOT EXISTS rig3_receipts (id INTEGER PRIMARY KEY, ws TEXT NOT NULL, item_id TEXT NOT NULL, rev INTEGER NOT NULL, role TEXT NOT NULL, flow INTEGER, state TEXT NOT NULL, late INTEGER NOT NULL DEFAULT 0, note TEXT, t INTEGER NOT NULL, answered_at INTEGER, nudged_at INTEGER, stalled_at INTEGER) STRICT;
CREATE INDEX IF NOT EXISTS rig3_receipts_role ON rig3_receipts (ws, role, state);
CREATE INDEX IF NOT EXISTS rig3_receipts_item ON rig3_receipts (ws, item_id);
CREATE TABLE IF NOT EXISTS rig3_cycles (ws TEXT NOT NULL, n INTEGER NOT NULL, opened_at INTEGER NOT NULL, by TEXT NOT NULL, due_at INTEGER, open_seq INTEGER, entry_state TEXT, entry TEXT, entry_by TEXT, entry_at INTEGER, entry_meta TEXT, PRIMARY KEY (ws, n)) STRICT;
CREATE TABLE IF NOT EXISTS rig3_clock (ws TEXT NOT NULL, who TEXT NOT NULL, last_at INTEGER NOT NULL, PRIMARY KEY (ws, who)) STRICT;
`;
// P244: rig 3 사이클과 시계(rig3-beat.mjs).
//   rig3_cycles: 사이클마다 한 줄. n 0은 켤 때(첫 채움), 그 뒤 박자마다 n+1. by enable | clock | late | human, due_at은 친 박자의 칸 시각,
//     open_seq는 그 사이클을 연 장부 줄(cycle_open)의 seq(사이클 구간은 seq로 자른다: 같은 ms의 줄도 갈린다).
//     entry_state null(아직) | writing | done | empty(첫 채움에 아무 일도 없었음), entry는 변경 기록 꼭지(마크다운), entry_by ai | numbers, entry_meta는 한 번짜리 실행의 값(JSON: model, ms, 토큰, 비용, error).
//   rig3_clock: 시계마다 마지막 친 때. who는 beat(사이클 박자), role:<역할>(역할 칸 beat), tool:<도구>(every 도구).
const cycleRow = (r) => (r ? { ws: r.ws, n: r.n, openedAt: r.opened_at, by: r.by, dueAt: r.due_at, openSeq: r.open_seq ?? null, entryState: r.entry_state, entry: r.entry, entryBy: r.entry_by, entryAt: r.entry_at, entryMeta: r.entry_meta ? JSON.parse(r.entry_meta) : null } : null);
const itemRow = (r) => (r ? { ws: r.ws, id: r.id, rev: r.rev, kind: r.kind, n: r.n, role: r.role, sessionId: r.session_id, path: r.path, sha256: r.sha256, size: r.size, fromId: r.from_id, cycle: r.cycle, state: r.state, stateWhy: r.state_why, stateAt: r.state_at, changed: r.changed, t: r.t } : null);
const recRow = (r) => (r ? { id: r.id, ws: r.ws, itemId: r.item_id, rev: r.rev, role: r.role, flow: r.flow, state: r.state, late: !!r.late, note: r.note, t: r.t, answeredAt: r.answered_at, nudgedAt: r.nudged_at, stalledAt: r.stalled_at } : null);
export function installRig3(Store) {
  Object.assign(Store.prototype, {
    setSessionRole(sessionId, role) { this.st('UPDATE sessions SET rig_role = ? WHERE session_id = ?').run(role || null, sessionId); },
    // ---------- P242: 항목 ----------
    nextItemN(ws, kind) { const r = this.st('SELECT MAX(n) AS n FROM rig3_items WHERE ws = ? AND kind = ?').get(ws, kind); return (r && r.n != null ? Number(r.n) : 0) + 1; },
    insertItem(x) {
      this.st('INSERT INTO rig3_items (ws, id, rev, kind, n, role, session_id, path, sha256, size, from_id, cycle, state, t) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(x.ws, x.id, x.rev, x.kind, x.n, x.role, x.sessionId || null, x.path, x.sha256 || null, x.size ?? null, x.fromId || null, x.cycle ?? null, x.state || 'live', x.t);
    },
    // 항목의 마지막 rev(없으면 null)
    getItem(ws, id) { return itemRow(this.st('SELECT * FROM rig3_items WHERE ws = ? AND id = ? ORDER BY rev DESC LIMIT 1').get(ws, id)); },
    itemRevs(ws, id) { return this.st('SELECT * FROM rig3_items WHERE ws = ? AND id = ? ORDER BY rev').all(ws, id).map(itemRow); },
    // 항목 목록(마지막 rev만). q: { role, kind, fromId, path, states }
    items(ws, q = {}) {
      const where = ['i.ws = ?', 'i.rev = (SELECT MAX(rev) FROM rig3_items j WHERE j.ws = i.ws AND j.id = i.id)']; const vals = [ws];
      if (q.role) { where.push('i.role = ?'); vals.push(q.role); }
      if (q.kind) { where.push('i.kind = ?'); vals.push(q.kind); }
      if (q.fromId) { where.push('i.from_id = ?'); vals.push(q.fromId); }
      if (q.path) { where.push('lower(i.path) = lower(?)'); vals.push(q.path); }
      if (q.states && q.states.length) { where.push(`i.state IN (${q.states.map(() => '?').join(',')})`); vals.push(...q.states); }
      return this.db.prepare(`SELECT * FROM rig3_items i WHERE ${where.join(' AND ')} ORDER BY i.t, i.id`).all(...vals).map(itemRow);
    },
    // 모든 rev(길마다 낸 수를 센다)
    allItemRevs(ws) { return this.st('SELECT * FROM rig3_items WHERE ws = ? ORDER BY t').all(ws).map(itemRow); },
    setItemState(ws, id, rev, state, why = null, t = Date.now()) { this.st('UPDATE rig3_items SET state = ?, state_why = ?, state_at = ? WHERE ws = ? AND id = ? AND rev = ?').run(state, why, t, ws, id, rev); },
    setItemChanged(ws, id, rev, changed) { this.st('UPDATE rig3_items SET changed = ? WHERE ws = ? AND id = ? AND rev = ?').run(changed, ws, id, rev); },
    // ---------- P242: 받음 ----------
    insertReceipt(x) {
      const r = this.st('INSERT INTO rig3_receipts (ws, item_id, rev, role, flow, state, late, note, t, answered_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(x.ws, x.itemId, x.rev, x.role, x.flow ?? null, x.state || 'waiting', x.late ? 1 : 0, x.note || null, x.t, x.answeredAt ?? null);
      return Number(r.lastInsertRowid);
    },
    // q: { role, itemId, rev, states }
    receipts(ws, q = {}) {
      const where = ['ws = ?']; const vals = [ws];
      if (q.role) { where.push('role = ?'); vals.push(q.role); }
      if (q.itemId) { where.push('item_id = ?'); vals.push(q.itemId); }
      if (q.rev != null) { where.push('rev = ?'); vals.push(q.rev); }
      if (q.states && q.states.length) { where.push(`state IN (${q.states.map(() => '?').join(',')})`); vals.push(...q.states); }
      return this.db.prepare(`SELECT * FROM rig3_receipts WHERE ${where.join(' AND ')} ORDER BY t, id`).all(...vals).map(recRow);
    },
    // ---------- P244: 사이클과 시계 ----------
    insertRig3Cycle(x) { this.st('INSERT INTO rig3_cycles (ws, n, opened_at, by, due_at, open_seq) VALUES (?, ?, ?, ?, ?, ?)').run(x.ws, x.n, x.openedAt, x.by, x.dueAt ?? null, x.openSeq ?? null); },
    getRig3Cycle(ws, n) { return cycleRow(this.st('SELECT * FROM rig3_cycles WHERE ws = ? AND n = ?').get(ws, n)); },
    lastRig3Cycle(ws) { return cycleRow(this.st('SELECT * FROM rig3_cycles WHERE ws = ? ORDER BY n DESC LIMIT 1').get(ws)); },
    firstRig3Cycle(ws) { return cycleRow(this.st('SELECT * FROM rig3_cycles WHERE ws = ? ORDER BY n LIMIT 1').get(ws)); },
    // 닫혔는데(다음 사이클이 열림) 꼭지가 없는 사이클
    rig3CyclesNeedingEntry(ws) { return this.st("SELECT * FROM rig3_cycles c WHERE ws = ? AND (entry_state IS NULL OR entry_state = 'writing') AND EXISTS (SELECT 1 FROM rig3_cycles d WHERE d.ws = c.ws AND d.n > c.n) ORDER BY n").all(ws).map(cycleRow); },
    rig3CycleEntries(ws, limit = 5) { return this.st("SELECT * FROM rig3_cycles WHERE ws = ? AND entry_state = 'done' ORDER BY n DESC LIMIT ?").all(ws, limit).map(cycleRow); },
    setRig3CycleEntry(ws, n, f = {}) {
      const cols = { entryState: 'entry_state', entry: 'entry', entryBy: 'entry_by', entryAt: 'entry_at', entryMeta: 'entry_meta' };
      const sets = []; const vals = [];
      for (const [k, c] of Object.entries(cols)) if (f[k] !== undefined) { sets.push(`${c} = ?`); vals.push(k === 'entryMeta' ? (f[k] == null ? null : JSON.stringify(f[k])) : f[k]); }
      if (sets.length) this.st(`UPDATE rig3_cycles SET ${sets.join(', ')} WHERE ws = ? AND n = ?`).run(...vals, ws, n);
    },
    rig3ClockLast(ws, who) { const r = this.st('SELECT last_at FROM rig3_clock WHERE ws = ? AND who = ?').get(ws, who); return r ? Number(r.last_at) : null; },
    setRig3Clock(ws, who, t) { this.st('INSERT INTO rig3_clock (ws, who, last_at) VALUES (?, ?, ?) ON CONFLICT (ws, who) DO UPDATE SET last_at = excluded.last_at').run(ws, who, t); },
    setReceipt(id, f = {}) {
      const cols = { state: 'state', note: 'note', answeredAt: 'answered_at', nudgedAt: 'nudged_at', stalledAt: 'stalled_at', late: 'late' };
      const sets = []; const vals = [];
      for (const [k, c] of Object.entries(cols)) if (f[k] !== undefined) { sets.push(`${c} = ?`); vals.push(k === 'late' ? (f[k] ? 1 : 0) : f[k]); }
      if (sets.length) this.st(`UPDATE rig3_receipts SET ${sets.join(', ')} WHERE id = ?`).run(...vals, id);
    },
  });
}
