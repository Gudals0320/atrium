// 저장소(store.mjs)의 P182 표와 열: rig(하네스 정의) 켜기와 훅 실행 기록. 하네스 1단계(docs research harness-arch.md 13절).
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
export const RIG_COLUMNS = {
  workspaces: { rig_enabled: 'INTEGER', rig_enabled_at: 'INTEGER' },
  deliveries: { origin: 'TEXT', from_session: 'TEXT' },
};

const runRow = (r) => (r ? { id: r.id, t: r.t, workspaceKey: r.workspace_key ?? null, at: r.at, hookIndex: r.hook_index, argv: JSON.parse(r.argv), decision: r.decision, reason: r.reason ?? null, note: r.note ?? null, beforeText: r.before_text ?? null, rigHash: r.rig_hash ?? null, sessionId: r.session_id ?? null, unitId: r.unit_id ?? null, tryId: r.try_id ?? null, ms: r.ms ?? null, error: r.error ?? null } : null);

export function installRig(Store) {
  Object.assign(Store.prototype, {
    rigState(key) {
      const r = this.st('SELECT rig_enabled, rig_enabled_at FROM workspaces WHERE workspace_key = ?').get(key);
      return r ? { enabled: !!r.rig_enabled, enabledAt: r.rig_enabled_at ?? null } : null;
    },
    setRigEnabled(key, on) { this.st('UPDATE workspaces SET rig_enabled = ?, rig_enabled_at = ?, updated_at = ? WHERE workspace_key = ?').run(on ? 1 : 0, on ? Date.now() : null, Date.now(), key); },
    insertHookRun(x) {
      const r = this.st('INSERT INTO rig_hook_runs (t, workspace_key, at, hook_index, argv, decision, reason, note, before_text, rig_hash, session_id, unit_id, try_id, ms, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(x.t ?? Date.now(), x.workspaceKey ?? null, x.at, x.hookIndex, JSON.stringify(x.argv || []), x.decision, x.reason ?? null, x.note ?? null, x.beforeText ?? null, x.rigHash ?? null, x.sessionId ?? null, x.unitId ?? null, x.tryId ?? null, x.ms ?? null, x.error ?? null);
      return Number(r.lastInsertRowid);
    },
    hookRuns({ workspaceKey = null, limit = 50 } = {}) {
      const rows = workspaceKey ? this.st('SELECT * FROM rig_hook_runs WHERE workspace_key = ? ORDER BY id DESC LIMIT ?').all(workspaceKey, limit) : this.st('SELECT * FROM rig_hook_runs ORDER BY id DESC LIMIT ?').all(limit);
      return rows.map(runRow);
    },
  });
}
