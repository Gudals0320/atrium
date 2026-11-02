// 저장소(store.mjs)의 P6b 표(ARCH 4절 I): 명령 바 대화 기록(Thread), 메모 노드, 칸반 노드, 루프. 설정은 meta 표의 `settings` 한 줄이다.
// store.mjs가 이 파일을 불러 표를 만들고 Store에 메서드를 붙인다. 저장소 모듈의 일부라 SQL은 store.mjs와 이 파일에만 둔다(ARCH 5절 "저장소").
// 모두 새 표라 P5까지의 board.db에는 CREATE TABLE IF NOT EXISTS로 빈 표가 생길 뿐 옮길 것이 없다(backend/test/p6b.test.mjs).

export const RECORDS_SCHEMA = `
CREATE TABLE IF NOT EXISTS thread_items (
  seq INTEGER PRIMARY KEY, item_id TEXT NOT NULL UNIQUE, t INTEGER NOT NULL, source TEXT NOT NULL, text TEXT NOT NULL,
  targets TEXT, loop_id TEXT, updated_at INTEGER NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS thread_results (
  delivery_id TEXT PRIMARY KEY, item_id TEXT NOT NULL, session_id TEXT NOT NULL, name TEXT,
  status TEXT NOT NULL, reason TEXT, sent_at INTEGER, confirmed_at INTEGER, report TEXT, report_at INTEGER, report_state TEXT, report_source TEXT,
  report_clipped INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL
) STRICT;
CREATE INDEX IF NOT EXISTS thread_results_item ON thread_results(item_id);
CREATE INDEX IF NOT EXISTS thread_results_open ON thread_results(session_id, report_at);
CREATE TABLE IF NOT EXISTS memos (
  memo_id TEXT PRIMARY KEY, workspace_key TEXT, x REAL NOT NULL, y REAL NOT NULL, w REAL NOT NULL, h REAL NOT NULL,
  text TEXT NOT NULL, color TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS kanbans (
  kanban_id TEXT PRIMARY KEY, workspace_key TEXT, title TEXT NOT NULL, x REAL NOT NULL, y REAL NOT NULL, w REAL NOT NULL, h REAL NOT NULL,
  columns TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS loops (
  loop_id TEXT PRIMARY KEY, target_kind TEXT NOT NULL, target_id TEXT NOT NULL, prompt TEXT NOT NULL, trig TEXT NOT NULL, stop TEXT NOT NULL,
  status TEXT NOT NULL, runs INTEGER NOT NULL DEFAULT 0, skips INTEGER NOT NULL DEFAULT 0, elapsed_ms INTEGER NOT NULL DEFAULT 0,
  next_at INTEGER, last_run_at INTEGER, stop_reason TEXT, per TEXT, history TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
) STRICT;
`;

const J = (v) => (v == null ? null : JSON.stringify(v));
const P = (s, d = null) => { if (s == null) return d; try { return JSON.parse(s); } catch { return d; } };

function threadItemRow(r) { return r ? { seq: r.seq, itemId: r.item_id, t: r.t, source: r.source, text: r.text, targets: P(r.targets, []), loopId: r.loop_id ?? null, updatedAt: r.updated_at } : null; }
function threadResultRow(r) {
  if (!r) return null;
  return {
    deliveryId: r.delivery_id, itemId: r.item_id, sessionId: r.session_id, name: r.name, status: r.status, reason: r.reason ?? null,
    sentAt: r.sent_at ?? null, confirmedAt: r.confirmed_at ?? null, report: r.report == null ? null : { text: r.report, at: r.report_at, state: r.report_state, source: r.report_source, clipped: !!r.report_clipped }, updatedAt: r.updated_at,
  };
}
function memoRow(r) { return r ? { memoId: r.memo_id, workspaceKey: r.workspace_key ?? null, x: r.x, y: r.y, w: r.w, h: r.h, text: r.text, color: r.color ?? null, createdAt: r.created_at, updatedAt: r.updated_at } : null; }
function kanbanRow(r) { return r ? { kanbanId: r.kanban_id, workspaceKey: r.workspace_key ?? null, title: r.title, x: r.x, y: r.y, w: r.w, h: r.h, columns: P(r.columns, []), createdAt: r.created_at, updatedAt: r.updated_at } : null; }
function loopRow(r) {
  if (!r) return null;
  return {
    loopId: r.loop_id, target: { kind: r.target_kind, id: r.target_id }, prompt: r.prompt, trigger: P(r.trig, {}), stop: P(r.stop, {}), status: r.status,
    runs: r.runs, skips: r.skips, elapsedMs: r.elapsed_ms, nextAt: r.next_at ?? null, lastRunAt: r.last_run_at ?? null, stopReason: r.stop_reason ?? null,
    per: P(r.per, {}), history: P(r.history, []), createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

// Store 클래스에 붙일 메서드. this는 Store다(this.st(sql)는 준비한 문장을 다시 쓴다)
export const recordMethods = {
  // ---------- Thread(I2) ----------
  insertThreadItem(it) {
    const r = this.st('INSERT INTO thread_items (item_id, t, source, text, targets, loop_id, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(it.itemId, it.t, it.source, it.text, J(it.targets || []), it.loopId ?? null, it.t);
    return Number(r.lastInsertRowid);
  },
  touchThreadItem(itemId, t = Date.now()) { this.st('UPDATE thread_items SET updated_at = ? WHERE item_id = ?').run(t, itemId); },
  getThreadItem(itemId) { return threadItemRow(this.st('SELECT * FROM thread_items WHERE item_id = ?').get(itemId)); },
  // 최근 것부터 limit개를 고른 뒤 시간순으로 돌려준다. before(seq)를 주면 그보다 앞의 것
  threadItems({ before = null, limit = 50 } = {}) {
    const rows = before != null ? this.st('SELECT * FROM thread_items WHERE seq < ? ORDER BY seq DESC LIMIT ?').all(before, limit) : this.st('SELECT * FROM thread_items ORDER BY seq DESC LIMIT ?').all(limit);
    return rows.reverse().map(threadItemRow);
  },
  threadCount() { return this.st('SELECT COUNT(*) AS n FROM thread_items').get().n; },
  // 최근 keep개만 남긴다(I2: 최근 500개)
  pruneThread(keep) {
    const cut = this.st('SELECT seq FROM thread_items ORDER BY seq DESC LIMIT 1 OFFSET ?').get(keep);
    if (!cut) return 0;
    return this.tx(() => {
      this.st('DELETE FROM thread_results WHERE item_id IN (SELECT item_id FROM thread_items WHERE seq <= ?)').run(cut.seq);
      return Number(this.st('DELETE FROM thread_items WHERE seq <= ?').run(cut.seq).changes);
    });
  },
  insertThreadResult(r) {
    this.st('INSERT INTO thread_results (delivery_id, item_id, session_id, name, status, reason, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(delivery_id) DO NOTHING')
      .run(r.deliveryId, r.itemId, r.sessionId, r.name ?? null, r.status, r.reason ?? null, Date.now());
  },
  getThreadResult(deliveryId) { return threadResultRow(this.st('SELECT * FROM thread_results WHERE delivery_id = ?').get(deliveryId)); },
  threadResults(itemId) { return this.st('SELECT * FROM thread_results WHERE item_id = ? ORDER BY rowid').all(itemId).map(threadResultRow); },
  updateThreadResult(deliveryId, f) {
    this.st('UPDATE thread_results SET status = ?, reason = ?, sent_at = COALESCE(?, sent_at), confirmed_at = COALESCE(?, confirmed_at), updated_at = ? WHERE delivery_id = ?')
      .run(f.status, f.reason ?? null, f.sentAt ?? null, f.confirmedAt ?? null, Date.now(), deliveryId);
  },
  setThreadReport(deliveryId, rep) {
    this.st('UPDATE thread_results SET report = ?, report_at = ?, report_state = ?, report_source = ?, report_clipped = ?, updated_at = ? WHERE delivery_id = ?')
      .run(rep.text ?? '', rep.at, rep.state ?? null, rep.source ?? null, rep.clipped ? 1 : 0, Date.now(), deliveryId);
  },
  // 완료 보고를 기다리는 결과(제출됐고 아직 보고가 없음)
  openThreadResults(sessionId) { return this.st("SELECT * FROM thread_results WHERE session_id = ? AND report_at IS NULL AND status IN ('sent', 'confirmed', 'unconfirmed') ORDER BY rowid").all(sessionId).map(threadResultRow); },

  // ---------- 메모 노드(I3) ----------
  memos() { return this.st('SELECT * FROM memos ORDER BY created_at').all().map(memoRow); },
  getMemo(id) { return memoRow(this.st('SELECT * FROM memos WHERE memo_id = ?').get(id)); },
  insertMemo(m) {
    this.st('INSERT INTO memos (memo_id, workspace_key, x, y, w, h, text, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(m.memoId, m.workspaceKey ?? null, m.x, m.y, m.w, m.h, m.text, m.color ?? null, m.createdAt, m.createdAt);
  },
  updateMemo(id, f) {
    const map = { workspaceKey: 'workspace_key', x: 'x', y: 'y', w: 'w', h: 'h', text: 'text', color: 'color' };
    const sets = ['updated_at = ?']; const vals = [Date.now()];
    for (const [k, v] of Object.entries(f)) { if (!map[k]) throw new Error('unknown field ' + k); sets.push(`${map[k]} = ?`); vals.push(v ?? null); }
    this.db.prepare(`UPDATE memos SET ${sets.join(', ')} WHERE memo_id = ?`).run(...vals, id);
  },
  deleteMemo(id) { this.st('DELETE FROM memos WHERE memo_id = ?').run(id); },

  // ---------- 칸반 노드(I4). 열과 카드는 한 덩어리 JSON이다(노드 하나를 통째로 읽고 쓴다) ----------
  kanbans() { return this.st('SELECT * FROM kanbans ORDER BY created_at').all().map(kanbanRow); },
  getKanban(id) { return kanbanRow(this.st('SELECT * FROM kanbans WHERE kanban_id = ?').get(id)); },
  insertKanban(k) {
    this.st('INSERT INTO kanbans (kanban_id, workspace_key, title, x, y, w, h, columns, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(k.kanbanId, k.workspaceKey ?? null, k.title, k.x, k.y, k.w, k.h, J(k.columns), k.createdAt, k.createdAt);
  },
  updateKanban(id, f) {
    const map = { workspaceKey: 'workspace_key', title: 'title', x: 'x', y: 'y', w: 'w', h: 'h', columns: 'columns' };
    const sets = ['updated_at = ?']; const vals = [Date.now()];
    for (const [k, v] of Object.entries(f)) { if (!map[k]) throw new Error('unknown field ' + k); sets.push(`${map[k]} = ?`); vals.push(k === 'columns' ? J(v) : v ?? null); }
    this.db.prepare(`UPDATE kanbans SET ${sets.join(', ')} WHERE kanban_id = ?`).run(...vals, id);
  },
  deleteKanban(id) { this.st('DELETE FROM kanbans WHERE kanban_id = ?').run(id); },

  // ---------- 루프(I5) ----------
  loops() { return this.st('SELECT * FROM loops ORDER BY created_at').all().map(loopRow); },
  getLoop(id) { return loopRow(this.st('SELECT * FROM loops WHERE loop_id = ?').get(id)); },
  insertLoop(l) {
    this.st('INSERT INTO loops (loop_id, target_kind, target_id, prompt, trig, stop, status, next_at, per, history, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(l.loopId, l.target.kind, l.target.id, l.prompt, J(l.trigger), J(l.stop), l.status, l.nextAt ?? null, J(l.per || {}), J(l.history || []), l.createdAt, l.createdAt);
  },
  // 루프 한 줄을 통째로 저장한다(상태, 센 값, 세션별 상태, 최근 기록)
  saveLoop(l) {
    this.st('UPDATE loops SET status = ?, runs = ?, skips = ?, elapsed_ms = ?, next_at = ?, last_run_at = ?, stop_reason = ?, per = ?, history = ?, updated_at = ? WHERE loop_id = ?')
      .run(l.status, l.runs, l.skips, Math.round(l.elapsedMs), l.nextAt ?? null, l.lastRunAt ?? null, l.stopReason ?? null, J(l.per || {}), J(l.history || []), Date.now(), l.loopId);
  },
  deleteLoop(id) { this.st('DELETE FROM loops WHERE loop_id = ?').run(id); },
};

export function installRecords(Store) { Object.assign(Store.prototype, recordMethods); }
