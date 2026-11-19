// 저장소(store.mjs)의 rig 표와 열(P182·P183·P188·P217). P249: 옛 rig(1·2)의 표(rig_hook_runs, rig_cases, rig_case_items, rig_seat_counters,
// rig_case_reports, rig_cycles, rig_loops, rig_loop_requests, rig_permits, rig_run_close, rig_artifacts, rig_proposals, rig_doc_marks 등)는 옛 판 DB에 그대로 두고
// 만들지도 쓰지도 않는다. 열(sessions.rig_seat, work_units.case_id·seat·via, workspaces.rig_protected, deliveries.park_loop 등)도 같다.
// - workspaces.rig_enabled·rig_enabled_at: 사람이 그 워크스페이스의 rig를 켰는가(판 API rig.enable·rig.disable만 바꾼다)
// - deliveries.origin·from_session: 전달의 출처(human | agent | board)와 보낸 세션(agent일 때). 옛 행은 비어 있다(board로 읽는다)
// - tool_runs: 판이 돌린 도구 실행 한 줄(rig-beat.mjs). status: running | done | timeout | error | lost
// - rig_versions: 판(버전). 켜진 rig의 정의·목적·정의서 묶음 해시가 바뀔 때마다 한 줄(n은 워크스페이스마다 1부터). 내용은 데이터 폴더 rigs/<워크스페이스>/<n>-<해시>.json
// - rig_events: rig 장부(rig-ledger.mjs rigEvent만 쓴다)
// SQL은 store.mjs와 store-*.mjs에만 둔다(ARCH 5절 "저장소").

export const TOOL_RUNS_SCHEMA = `
CREATE TABLE IF NOT EXISTS tool_runs (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, workspace_key TEXT, unit_id TEXT, try_id TEXT, tool TEXT NOT NULL, argv TEXT NOT NULL, args TEXT NOT NULL, args_given TEXT, cwd TEXT, rig_hash TEXT, status TEXT NOT NULL, exit_code INTEGER, started_at INTEGER NOT NULL, ended_at INTEGER, log_path TEXT, log_bytes INTEGER, log_cut INTEGER, out_sha256 TEXT, hooks TEXT, appended TEXT, error TEXT) STRICT;
CREATE INDEX IF NOT EXISTS tool_runs_session ON tool_runs(session_id, started_at);
CREATE INDEX IF NOT EXISTS tool_runs_unit ON tool_runs(unit_id);
`;
export const RIG_ADMIN_SCHEMA = `
CREATE TABLE IF NOT EXISTS rig_versions (workspace_key TEXT NOT NULL, n INTEGER NOT NULL, hash TEXT NOT NULL, t INTEGER NOT NULL, by TEXT NOT NULL, note TEXT, file TEXT, PRIMARY KEY (workspace_key, n)) STRICT;
`;
export const RIG_EVENTS_SCHEMA = `
CREATE TABLE IF NOT EXISTS rig_events (seq INTEGER PRIMARY KEY AUTOINCREMENT, t INTEGER NOT NULL, ws TEXT NOT NULL, def_n INTEGER, kind TEXT NOT NULL, case_id TEXT, unit_id TEXT, try_id TEXT, seat TEXT, session TEXT, from_seat TEXT, to_seat TEXT, line INTEGER, value TEXT, n INTEGER, max INTEGER, actor TEXT, ref TEXT, text TEXT, data TEXT) STRICT;
CREATE INDEX IF NOT EXISTS rig_events_ws ON rig_events(ws, seq);
CREATE INDEX IF NOT EXISTS rig_events_case ON rig_events(case_id, seq);
`;

export const RIG_COLUMNS = {
  workspaces: { rig_enabled: 'INTEGER', rig_enabled_at: 'INTEGER' },
  deliveries: { origin: 'TEXT', from_session: 'TEXT' },
};

const J = (s, d = null) => { if (s == null) return d; try { return JSON.parse(s); } catch { return d; } };

const toolRow = (r) => (r ? { id: r.id, sessionId: r.session_id, workspaceKey: r.workspace_key ?? null, unitId: r.unit_id ?? null, tryId: r.try_id ?? null, tool: r.tool, argv: J(r.argv, []), args: J(r.args, []), argsGiven: J(r.args_given), cwd: r.cwd ?? null, rigHash: r.rig_hash ?? null, status: r.status, exitCode: r.exit_code ?? null, startedAt: r.started_at, endedAt: r.ended_at ?? null, logPath: r.log_path ?? null, logBytes: r.log_bytes ?? null, logCut: !!r.log_cut, outSha256: r.out_sha256 ?? null, hooks: J(r.hooks, []), appended: r.appended ?? null, error: r.error ?? null } : null);

const TOOL_COLS = { status: 'status', exitCode: 'exit_code', endedAt: 'ended_at', logBytes: 'log_bytes', logCut: 'log_cut', outSha256: 'out_sha256', hooks: 'hooks', appended: 'appended', error: 'error', args: 'args', argv: 'argv' };

const versionRow = (r) => (r ? { workspaceKey: r.workspace_key, n: r.n, hash: r.hash, t: r.t, by: r.by, note: r.note ?? null, file: r.file ?? null } : null);

const eventRow = (r) => ({ seq: Number(r.seq), t: r.t, ws: r.ws, defN: r.def_n ?? null, kind: r.kind, caseId: r.case_id ?? null, unitId: r.unit_id ?? null, tryId: r.try_id ?? null, seat: r.seat ?? null, session: r.session ?? null, fromSeat: r.from_seat ?? null, toSeat: r.to_seat ?? null, line: r.line ?? null, value: r.value ?? null, n: r.n ?? null, max: r.max ?? null, actor: r.actor ?? null, ref: r.ref ?? null, text: r.text ?? null, data: r.data ? J(r.data, null) : null });

export function installRig(Store) {
  Object.assign(Store.prototype, {
    rigState(key) {
      const r = this.st('SELECT rig_enabled, rig_enabled_at FROM workspaces WHERE workspace_key = ?').get(key);
      return r ? { enabled: !!r.rig_enabled, enabledAt: r.rig_enabled_at ?? null } : null;
    },
    setRigEnabled(key, on) { this.st('UPDATE workspaces SET rig_enabled = ?, rig_enabled_at = ?, updated_at = ? WHERE workspace_key = ?').run(on ? 1 : 0, on ? Date.now() : null, Date.now(), key); },
    insertToolRun(x) {
      this.st('INSERT INTO tool_runs (id, session_id, workspace_key, unit_id, try_id, tool, argv, args, args_given, cwd, rig_hash, status, exit_code, started_at, ended_at, log_path, log_bytes, log_cut, out_sha256, hooks, appended, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(x.id, x.sessionId, x.workspaceKey ?? null, x.unitId ?? null, x.tryId ?? null, x.tool, JSON.stringify(x.argv || []), JSON.stringify(x.args || []), x.argsGiven ? JSON.stringify(x.argsGiven) : null, x.cwd ?? null, x.rigHash ?? null, x.status, x.exitCode ?? null, x.startedAt, x.endedAt ?? null, x.logPath ?? null, x.logBytes ?? null, x.logCut ? 1 : 0, x.outSha256 ?? null, JSON.stringify(x.hooks || []), x.appended ?? null, x.error ?? null);
    },
    updateToolRun(id, fields) {
      const sets = []; const vals = [];
      for (const [k, v] of Object.entries(fields)) {
        if (!TOOL_COLS[k]) throw new Error('unknown field ' + k);
        sets.push(`${TOOL_COLS[k]} = ?`);
        vals.push(['hooks', 'args', 'argv'].includes(k) ? JSON.stringify(v || []) : k === 'logCut' ? (v ? 1 : 0) : v ?? null);
      }
      if (sets.length) this.st(`UPDATE tool_runs SET ${sets.join(', ')} WHERE id = ?`).run(...vals, id);
    },
    getToolRun(id) { return toolRow(this.st('SELECT * FROM tool_runs WHERE id = ?').get(id)); },
    // P251: 워크스페이스의 도구마다 마지막 실행(구조 지도의 도구 카드)
    lastToolRuns(ws) { return this.st('SELECT * FROM tool_runs t WHERE workspace_key = ? AND started_at = (SELECT MAX(started_at) FROM tool_runs u WHERE u.workspace_key = t.workspace_key AND u.tool = t.tool) ORDER BY tool').all(ws).map(toolRow); },
    insertRigEvent(x) {
      const r = this.st('INSERT INTO rig_events (t, ws, def_n, kind, case_id, unit_id, try_id, seat, session, from_seat, to_seat, line, value, n, max, actor, ref, text, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(x.t, x.ws, x.defN ?? null, x.kind, x.caseId ?? null, x.unitId ?? null, x.tryId ?? null, x.seat ?? null, x.session ?? null, x.fromSeat ?? null, x.toSeat ?? null, x.line ?? null, x.value ?? null, x.n ?? null, x.max ?? null, x.actor ?? null, x.ref ?? null, x.text ?? null, x.data != null ? JSON.stringify(x.data) : null);
      return Number(r.lastInsertRowid);
    },
    lastRigSeq(ws) { const r = this.st('SELECT MAX(seq) AS s FROM rig_events WHERE ws = ?').get(ws); return r && r.s != null ? Number(r.s) : 0; },
    insertRigVersion(x) {
      const n = Number(this.st('SELECT COALESCE(MAX(n), 0) AS n FROM rig_versions WHERE workspace_key = ?').get(x.workspaceKey).n) + 1;
      this.st('INSERT INTO rig_versions (workspace_key, n, hash, t, by, note, file) VALUES (?, ?, ?, ?, ?, ?, ?)').run(x.workspaceKey, n, x.hash, x.t ?? Date.now(), x.by || 'unknown', x.note ?? null, x.file ?? null);
      return n;
    },
    setRigVersionFile(key, n, file) { this.st('UPDATE rig_versions SET file = ? WHERE workspace_key = ? AND n = ?').run(file, key, n); },
    rigVersions(key) { return this.st('SELECT * FROM rig_versions WHERE workspace_key = ? ORDER BY n').all(key).map(versionRow); },
    rigVersion(key, n) { return versionRow(this.st('SELECT * FROM rig_versions WHERE workspace_key = ? AND n = ?').get(key, n)); },
    lastRigVersion(key) { return versionRow(this.st('SELECT * FROM rig_versions WHERE workspace_key = ? ORDER BY n DESC LIMIT 1').get(key)); },
    rigEvents(q = {}) {
      const where = ['ws = ?']; const vals = [q.ws];
      if (q.kinds && q.kinds.length) { where.push(`kind IN (${q.kinds.map(() => '?').join(',')})`); vals.push(...q.kinds); }
      if (q.sinceSeq != null) { where.push('seq > ?'); vals.push(Number(q.sinceSeq)); }
      if (q.sinceT != null) { where.push('t >= ?'); vals.push(Number(q.sinceT)); }
      const lim = Math.max(1, Number(q.limit) || 200);
      // 커서 없이 부르면 최근 limit줄(오래된 것부터 돌려준다). 커서가 있으면 그 뒤에서 limit줄
      const tail = q.sinceSeq == null && q.sinceT == null;
      const rows = this.db.prepare(`SELECT * FROM rig_events WHERE ${where.join(' AND ')} ORDER BY seq ${tail ? 'DESC' : 'ASC'} LIMIT ?`).all(...vals, lim).map(eventRow);
      return tail ? rows.reverse() : rows;
    },
    pruneRigEvents(ws, max) {
      const n = Number(this.st('SELECT COUNT(*) AS n FROM rig_events WHERE ws = ?').get(ws).n);
      if (n <= max) return 0;
      const r = this.db.prepare('DELETE FROM rig_events WHERE seq IN (SELECT seq FROM rig_events WHERE ws = ? ORDER BY seq LIMIT ?)').run(ws, n - max);
      return Number(r.changes);
    },
  });
}
