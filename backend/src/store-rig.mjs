// 저장소(store.mjs)의 P182 표와 열: rig(하네스 정의) 켜기와 훅 실행 기록. 하네스 1단계(docs research harness-arch.md 13절). P183: 도구 실행 장부 tool_runs(2단계)
// - workspaces.rig_enabled·rig_enabled_at: 사람이 그 워크스페이스의 rig를 켰는가(판 API rig.enable·rig.disable만 바꾼다. 에이전트 명령으로는 못 바꾼다)
// - deliveries.origin·from_session: 전달의 출처(human | agent | board)와 보낸 세션(agent일 때). 옛 행은 비어 있다(board로 읽는다)
// - rig_hook_runs: 모든 훅 실행 한 줄(시각, 워크스페이스, 길목, 정의 안 훅 번호와 argv, 결정, 까닭, note, 고치기 전 글(바뀌었을 때), 정의 해시, 세션, 일, 시도, 걸린 ms, 실패 까닭)
// SQL은 store.mjs와 store-*.mjs에만 둔다(ARCH 5절 "저장소").

// decision: pass | rewrite | reject | failed(실패, onFail pass면 통과로 이어 간다) | blocked(실패, onFail block이라 거절)
export const RIG_SCHEMA = `
CREATE TABLE IF NOT EXISTS rig_hook_runs (id INTEGER PRIMARY KEY, t INTEGER NOT NULL, workspace_key TEXT, at TEXT NOT NULL, hook_index INTEGER NOT NULL, argv TEXT NOT NULL, decision TEXT NOT NULL, reason TEXT, note TEXT, before_text TEXT, rig_hash TEXT, session_id TEXT, unit_id TEXT, try_id TEXT, ms INTEGER, error TEXT) STRICT;
CREATE INDEX IF NOT EXISTS rig_hook_runs_t ON rig_hook_runs(t);
CREATE INDEX IF NOT EXISTS rig_hook_runs_ws ON rig_hook_runs(workspace_key, t);
`;
// P183: 도구 실행 장부(하네스 2단계, 13절 "도구"). 에이전트가 보고하지 않아도 판이 실행마다 한 줄을 쌓는다.
// status: running | done(끝남, exit_code에 종료 코드) | timeout(시간 제한으로 끔) | error(띄우지 못함) | lost(백엔드가 다시 뜰 때 돌던 실행)
// args: 실제로 붙인 인자(tool-before가 고친 뒤). args_given: 에이전트가 준 인자(고친 경우만). hooks: 이 실행의 훅 결정 요약(JSON 배열)
// out_sha256: 로그에 쓴 출력 바이트의 SHA-256. log_bytes: 쓴 바이트, log_cut: 50MB에서 자름. appended: tool-after가 덧붙인 글
export const TOOL_RUNS_SCHEMA = `
CREATE TABLE IF NOT EXISTS tool_runs (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, workspace_key TEXT, unit_id TEXT, try_id TEXT, tool TEXT NOT NULL, argv TEXT NOT NULL, args TEXT NOT NULL, args_given TEXT, cwd TEXT, rig_hash TEXT, status TEXT NOT NULL, exit_code INTEGER, started_at INTEGER NOT NULL, ended_at INTEGER, log_path TEXT, log_bytes INTEGER, log_cut INTEGER, out_sha256 TEXT, hooks TEXT, appended TEXT, error TEXT) STRICT;
CREATE INDEX IF NOT EXISTS tool_runs_session ON tool_runs(session_id, started_at);
CREATE INDEX IF NOT EXISTS tool_runs_unit ON tool_runs(unit_id);
`;
export const RIG_COLUMNS = {
  workspaces: { rig_enabled: 'INTEGER', rig_enabled_at: 'INTEGER' },
  deliveries: { origin: 'TEXT', from_session: 'TEXT' },
  rig_hook_runs: { tool_run_id: 'TEXT' }, // P183: 도구 훅이면 그 실행
};
const J = (s, d = null) => { if (s == null) return d; try { return JSON.parse(s); } catch { return d; } };
const toolRow = (r) => (r ? { id: r.id, sessionId: r.session_id, workspaceKey: r.workspace_key ?? null, unitId: r.unit_id ?? null, tryId: r.try_id ?? null, tool: r.tool, argv: J(r.argv, []), args: J(r.args, []), argsGiven: J(r.args_given), cwd: r.cwd ?? null, rigHash: r.rig_hash ?? null, status: r.status, exitCode: r.exit_code ?? null, startedAt: r.started_at, endedAt: r.ended_at ?? null, logPath: r.log_path ?? null, logBytes: r.log_bytes ?? null, logCut: !!r.log_cut, outSha256: r.out_sha256 ?? null, hooks: J(r.hooks, []), appended: r.appended ?? null, error: r.error ?? null } : null);
const TOOL_COLS = { status: 'status', exitCode: 'exit_code', endedAt: 'ended_at', logBytes: 'log_bytes', logCut: 'log_cut', outSha256: 'out_sha256', hooks: 'hooks', appended: 'appended', error: 'error', args: 'args', argv: 'argv' };

const runRow = (r) => (r ? { id: r.id, t: r.t, workspaceKey: r.workspace_key ?? null, at: r.at, hookIndex: r.hook_index, argv: JSON.parse(r.argv), decision: r.decision, reason: r.reason ?? null, note: r.note ?? null, beforeText: r.before_text ?? null, rigHash: r.rig_hash ?? null, sessionId: r.session_id ?? null, unitId: r.unit_id ?? null, tryId: r.try_id ?? null, ms: r.ms ?? null, error: r.error ?? null } : null);

export function installRig(Store) {
  Object.assign(Store.prototype, {
    rigState(key) {
      const r = this.st('SELECT rig_enabled, rig_enabled_at FROM workspaces WHERE workspace_key = ?').get(key);
      return r ? { enabled: !!r.rig_enabled, enabledAt: r.rig_enabled_at ?? null } : null;
    },
    setRigEnabled(key, on) { this.st('UPDATE workspaces SET rig_enabled = ?, rig_enabled_at = ?, updated_at = ? WHERE workspace_key = ?').run(on ? 1 : 0, on ? Date.now() : null, Date.now(), key); },
    insertHookRun(x) {
      const r = this.st('INSERT INTO rig_hook_runs (t, workspace_key, at, hook_index, argv, decision, reason, note, before_text, rig_hash, session_id, unit_id, try_id, ms, error, tool_run_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(x.t ?? Date.now(), x.workspaceKey ?? null, x.at, x.hookIndex, JSON.stringify(x.argv || []), x.decision, x.reason ?? null, x.note ?? null, x.beforeText ?? null, x.rigHash ?? null, x.sessionId ?? null, x.unitId ?? null, x.tryId ?? null, x.ms ?? null, x.error ?? null, x.toolRunId ?? null);
      return Number(r.lastInsertRowid);
    },
    // ---------- P183: 도구 실행 ----------
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
    toolRunsOf(sessionId, limit = 20) { return this.st('SELECT * FROM tool_runs WHERE session_id = ? ORDER BY started_at DESC, rowid DESC LIMIT ?').all(sessionId, limit).map(toolRow); },
    // 백엔드가 다시 뜰 때: 돌던 실행은 lost(그 프로세스는 판이 더 쥐지 않는다) → 바꾼 수
    loseRunningToolRuns(now = Date.now()) { return Number(this.st("UPDATE tool_runs SET status = 'lost', ended_at = ? WHERE status = 'running'").run(now).changes); },
    // 일마다 도구 실행 수(atrium items)
    toolRunCounts(unitIds) {
      if (!unitIds.length) return {};
      const rows = this.db.prepare(`SELECT unit_id, COUNT(*) AS n FROM tool_runs WHERE unit_id IN (${unitIds.map(() => '?').join(',')}) GROUP BY unit_id`).all(...unitIds);
      return Object.fromEntries(rows.map((r) => [r.unit_id, Number(r.n)]));
    },
    hookRuns({ workspaceKey = null, limit = 50 } = {}) {
      const rows = workspaceKey ? this.st('SELECT * FROM rig_hook_runs WHERE workspace_key = ? ORDER BY id DESC LIMIT ?').all(workspaceKey, limit) : this.st('SELECT * FROM rig_hook_runs ORDER BY id DESC LIMIT ?').all(limit);
      return rows.map(runRow);
    },
  });
}
