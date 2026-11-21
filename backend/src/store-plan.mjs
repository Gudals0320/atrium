// 저장소(store.mjs)의 P304 표: 리포(워크스페이스)별 목표·마일스톤 레인(plan.mjs, plan-board.mjs). 설계 v2: 워크스페이스 안에 레인이 몇 개든 있다.
// plans: 레인 한 줄. no(워크스페이스 안 번호, 1부터), name(워크스페이스 안에서 하나), status(active | paused | done | archived),
//   doc(목표·측정값·focus·마일스톤 JSON, plan.mjs 꼴), rev(쓰기마다 +1), owner_session(관리자 세션 ID, 없을 수 있다), created_by(만든 세션 ID),
//   deleted_at(판에서 워크스페이스를 지운 때. 30일 남겼다가 지운다. 다시 열면 되살아난다).
// plan_log: 바뀜 기록(누가 user | 세션 이름, 어디서 pc | remote | agent | foryou | import, 무엇 op, 대상 ref, 요약, manager 1 관리자 | 0 관리자 아닌 세션 | 비어 있음 사람).
//   레인마다 최근 keep줄.
// 옮기기: CREATE TABLE IF NOT EXISTS라 옛 board.db에는 빈 표가 생긴다. SQL은 store.mjs와 store-*.mjs에만 둔다(ARCH 5절 "저장소").
export const PLAN_KEEP_MS = 30 * 24 * 3600 * 1000;

export const PLAN_SCHEMA = `
CREATE TABLE IF NOT EXISTS plans (plan_id INTEGER PRIMARY KEY AUTOINCREMENT, ws_key TEXT NOT NULL, no INTEGER NOT NULL, name TEXT NOT NULL, status TEXT NOT NULL, doc TEXT NOT NULL, rev INTEGER NOT NULL, owner_session TEXT, created_by TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, updated_by TEXT, deleted_at INTEGER) STRICT;
CREATE UNIQUE INDEX IF NOT EXISTS plans_ws_no ON plans(ws_key, no);
CREATE TABLE IF NOT EXISTS plan_log (id INTEGER PRIMARY KEY AUTOINCREMENT, plan_id INTEGER NOT NULL, ws_key TEXT NOT NULL, at INTEGER NOT NULL, by TEXT NOT NULL, via TEXT, op TEXT NOT NULL, ref TEXT, summary TEXT NOT NULL, rev INTEGER NOT NULL, manager INTEGER) STRICT;
CREATE INDEX IF NOT EXISTS plan_log_plan ON plan_log(plan_id, id);
`;

const planRow = (r) => (r ? { planId: Number(r.plan_id), wsKey: r.ws_key, no: Number(r.no), name: r.name, status: r.status, doc: JSON.parse(r.doc), rev: Number(r.rev), owner: r.owner_session ?? null, createdBy: r.created_by ?? null, createdAt: r.created_at, updatedAt: r.updated_at, updatedBy: r.updated_by ?? null, deletedAt: r.deleted_at ?? null } : null);
const logRow = (r) => ({ id: Number(r.id), planId: Number(r.plan_id), wsKey: r.ws_key, at: r.at, by: r.by, via: r.via ?? null, op: r.op, ref: r.ref ?? null, summary: r.summary, rev: Number(r.rev), manager: r.manager == null ? null : !!r.manager });

export function installPlans(Store) {
  Object.assign(Store.prototype, {
    getPlan(planId) { return planRow(this.st('SELECT * FROM plans WHERE plan_id = ?').get(Number(planId))); },
    // 워크스페이스의 레인(번호 차례). deleted: 지움 표시한 것도
    plansIn(wsKey, { deleted = false } = {}) { return (deleted ? this.st('SELECT * FROM plans WHERE ws_key = ? ORDER BY no') : this.st('SELECT * FROM plans WHERE ws_key = ? AND deleted_at IS NULL ORDER BY no')).all(String(wsKey)).map(planRow); },
    plans() { return this.st('SELECT * FROM plans WHERE deleted_at IS NULL ORDER BY ws_key, no').all().map(planRow); },
    // 새 레인(번호는 그 워크스페이스의 다음 번호) → 줄
    createPlan({ wsKey, name, doc, status = 'active', owner = null, createdBy = null, at, by = null, log = [] }) {
      return this.tx(() => {
        const n = this.st('SELECT MAX(no) AS n FROM plans WHERE ws_key = ?').get(wsKey);
        const no = (n && n.n != null ? Number(n.n) : 0) + 1;
        const r = this.st('INSERT INTO plans (ws_key, no, name, status, doc, rev, owner_session, created_by, created_at, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)').run(wsKey, no, name, status, JSON.stringify(doc), owner, createdBy, at, at, by);
        const id = Number(r.lastInsertRowid);
        for (const l of log) this.addPlanLog(id, wsKey, at, 1, l);
        return planRow(this.st('SELECT * FROM plans WHERE plan_id = ?').get(id));
      });
    },
    addPlanLog(planId, wsKey, at, rev, l) {
      this.st('INSERT INTO plan_log (plan_id, ws_key, at, by, via, op, ref, summary, rev, manager) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(planId, wsKey, at, String(l.by ?? '?'), l.via ?? null, l.op, l.ref ?? null, String(l.summary).slice(0, 300), rev, l.manager == null ? null : l.manager ? 1 : 0);
    },
    // 레인을 고쳐 쓴다(rev는 부르는 쪽이 옛 rev + 1). fields: { doc?, name?, status?, owner?(undefined면 그대로) } → 쓴 줄
    savePlan({ planId, rev, at, by = null, log = [], keep = 500, ...fields }) {
      return this.tx(() => {
        const old = this.st('SELECT * FROM plans WHERE plan_id = ?').get(Number(planId));
        if (!old) return null;
        const doc = fields.doc !== undefined ? JSON.stringify(fields.doc) : old.doc;
        this.st('UPDATE plans SET doc = ?, rev = ?, name = ?, status = ?, owner_session = ?, updated_at = ?, updated_by = ?, deleted_at = NULL WHERE plan_id = ?')
          .run(doc, rev, fields.name ?? old.name, fields.status ?? old.status, fields.owner === undefined ? old.owner_session : fields.owner, at, by, Number(planId));
        for (const l of log) this.addPlanLog(Number(planId), old.ws_key, at, rev, l);
        const cut = this.st('SELECT id FROM plan_log WHERE plan_id = ? ORDER BY id DESC LIMIT 1 OFFSET ?').get(Number(planId), keep);
        if (cut) this.st('DELETE FROM plan_log WHERE plan_id = ? AND id <= ?').run(Number(planId), cut.id);
        return planRow(this.st('SELECT * FROM plans WHERE plan_id = ?').get(Number(planId)));
      });
    },
    // 최근 기록(새 것 먼저). afterId를 주면 그 뒤 것만
    planLog(planId, { limit = 20, afterId = 0 } = {}) { return this.st('SELECT * FROM plan_log WHERE plan_id = ? AND id > ? ORDER BY id DESC LIMIT ?').all(Number(planId), Number(afterId) || 0, Math.max(1, Math.min(500, Number(limit) || 20))).map(logRow); },
    lastPlanLogId(planId) { const r = this.st('SELECT MAX(id) AS id FROM plan_log WHERE plan_id = ?').get(Number(planId)); return r && r.id != null ? Number(r.id) : 0; },
    // 판에서 워크스페이스를 지웠다: 표시만(30일 뒤 prunePlans가 지운다). 다시 열면 restorePlans가 되살린다
    markPlansDeleted(wsKey, at = Date.now()) { this.st('UPDATE plans SET deleted_at = ? WHERE ws_key = ? AND deleted_at IS NULL').run(at, String(wsKey)); },
    restorePlans(wsKey) { return Number(this.st('UPDATE plans SET deleted_at = NULL WHERE ws_key = ? AND deleted_at IS NOT NULL').run(String(wsKey)).changes); },
    prunePlans(now = Date.now(), keepMs = PLAN_KEEP_MS) {
      const gone = this.st('SELECT plan_id FROM plans WHERE deleted_at IS NOT NULL AND deleted_at < ?').all(now - keepMs).map((r) => Number(r.plan_id));
      for (const id of gone) { this.st('DELETE FROM plans WHERE plan_id = ?').run(id); this.st('DELETE FROM plan_log WHERE plan_id = ?').run(id); }
      return gone;
    },
    // P37: 워크스페이스 키 옮기기(폴더가 저장소가 됨). 번호는 새 키의 뒤로 잇고, 같은 이름이 있으면 " (2)"를 붙인다
    movePlans(from, to) {
      if (!from || !to || from === to) return 0;
      const rows = this.st('SELECT plan_id, name FROM plans WHERE ws_key = ? ORDER BY no').all(from);
      for (const r of rows) {
        const n = this.st('SELECT MAX(no) AS n FROM plans WHERE ws_key = ?').get(to);
        let name = r.name, k = 2;
        while (this.st('SELECT 1 FROM plans WHERE ws_key = ? AND lower(name) = lower(?)').get(to, name)) name = r.name + ' (' + k++ + ')';
        this.st('UPDATE plans SET ws_key = ?, no = ?, name = ? WHERE plan_id = ?').run(to, (n && n.n != null ? Number(n.n) : 0) + 1, name, r.plan_id);
        this.st('UPDATE plan_log SET ws_key = ? WHERE plan_id = ?').run(to, r.plan_id);
      }
      return rows.length;
    },
  });
}
