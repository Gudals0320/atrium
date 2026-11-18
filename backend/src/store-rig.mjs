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
CREATE INDEX IF NOT EXISTS rig_hook_runs_session ON rig_hook_runs(session_id, id);
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
// P185: 건(rig_cases)과 건이 만든 세션·워크트리(rig_case_items). 하네스 3단계(14절 "건").
// rig_cases.state: open | done | blocked | waiting_owner | cancelled(P194: waiting_owner = 상한을 넘어 주인에게 보고로 올라감, 주인의 다음 맡기기가 잇는다.
//   P209: 흐름 줄이 주인에게 보고를 넣고 열린 일이 없을 때도 waiting_owner(owner_wait report). 그 보고를 받은 주인의 턴이 맡기기 없이 끝나면 done). edge_counts: 흐름 줄마다 이 건에서 지난 횟수 JSON { "<줄 번호>": n }. blocked_reason: blocked의 까닭
// rig_case_items: 흐름이 그 건을 위해 띄운 세션(자리, 워크트리 이름·경로). 판은 지우지 않는다(5단계 관리자 자리가 정리한다)
// P197: rig_case_reports: 판이 건 주인에게 보낸 보고마다 한 줄(보낼 때 적는다, 세션 맵 rig 띠의 "보고 받음" 표시. 17절 "자료"). seat: 보낸 자리, session_id: 보낸 세션,
//   unit_id: 닫힌 일, result: done 값, line: 흐름 줄 번호(맞는 줄 없이 주인에게 간 보고는 null), escalated: 상한을 넘어 올라옴
// rig_seat_counters: fresh 자리 세션 이름 <자리>-<n>의 n(워크스페이스·자리마다, 다시 쓰지 않는다)
export const RIG_FLOW_SCHEMA = `
CREATE TABLE IF NOT EXISTS rig_cases (id TEXT PRIMARY KEY, workspace_key TEXT NOT NULL, owner_session TEXT NOT NULL, state TEXT NOT NULL, created_at INTEGER NOT NULL, closed_at INTEGER, edge_counts TEXT, blocked_reason TEXT) STRICT;
CREATE INDEX IF NOT EXISTS rig_cases_ws ON rig_cases(workspace_key, created_at);
CREATE TABLE IF NOT EXISTS rig_case_items (id INTEGER PRIMARY KEY, case_id TEXT NOT NULL, session_id TEXT NOT NULL, seat TEXT NOT NULL, worktree TEXT, worktree_path TEXT, created_at INTEGER NOT NULL) STRICT;
CREATE INDEX IF NOT EXISTS rig_case_items_case ON rig_case_items(case_id);
CREATE TABLE IF NOT EXISTS rig_seat_counters (workspace_key TEXT NOT NULL, seat TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (workspace_key, seat)) STRICT;
CREATE TABLE IF NOT EXISTS rig_case_reports (id INTEGER PRIMARY KEY, case_id TEXT NOT NULL, seat TEXT, session_id TEXT, unit_id TEXT, result TEXT, line INTEGER, escalated INTEGER NOT NULL DEFAULT 0, delivery_id TEXT, t INTEGER NOT NULL) STRICT;
CREATE INDEX IF NOT EXISTS rig_case_reports_case ON rig_case_reports(case_id, id);
`;
// P188: 정의의 수명(5단계, 15절). rig_versions: 판이 맞는 정의로 처음 읽은 rig.json의 새 해시마다 한 줄(n은 워크스페이스마다 1부터).
//   내용은 데이터 폴더 rigs/<워크스페이스>/<n>-<해시>.json(file). by: manager(관리자 자리) | human | unknown. note: 한 줄 메모
// rig_cycles: 느린 고리(정의 cycles의 줄)마다 다음 시각(next_at). sig는 그 줄의 모양(every·to·run)이라 줄이 바뀌면 다시 센다
export const RIG_ADMIN_SCHEMA = `
CREATE TABLE IF NOT EXISTS rig_versions (workspace_key TEXT NOT NULL, n INTEGER NOT NULL, hash TEXT NOT NULL, t INTEGER NOT NULL, by TEXT NOT NULL, note TEXT, file TEXT, PRIMARY KEY (workspace_key, n)) STRICT;
CREATE TABLE IF NOT EXISTS rig_cycles (workspace_key TEXT NOT NULL, line INTEGER NOT NULL, next_at INTEGER NOT NULL, last_at INTEGER, sig TEXT, PRIMARY KEY (workspace_key, line)) STRICT;
`;
// P221(rig 2 R2): 고리. rig_loops: 고리마다 멈춤(paused_at·paused_by)과 every 계기의 다음·마지막 시각(next_at·last_at, sig는 계기의 모양).
//   cycles에서 읽은 고리(정의에 loops가 없음)의 시각은 그대로 rig_cycles에 있고 여기에는 멈춤만 둔다.
//   rig_loop_requests: 고리가 멈춘 동안 입구 자리에 온 요청(잇기에 그 차례대로 회를 연다). state: held | opened | dropped
export const RIG_LOOPS_SCHEMA = `
CREATE TABLE IF NOT EXISTS rig_loops (workspace_key TEXT NOT NULL, loop TEXT NOT NULL, paused_at INTEGER, paused_by TEXT, next_at INTEGER, last_at INTEGER, sig TEXT, PRIMARY KEY (workspace_key, loop)) STRICT;
CREATE TABLE IF NOT EXISTS rig_loop_requests (id INTEGER PRIMARY KEY, workspace_key TEXT NOT NULL, loop TEXT NOT NULL, session_id TEXT NOT NULL, from_kind TEXT NOT NULL, from_session TEXT, text TEXT NOT NULL, t INTEGER NOT NULL, state TEXT NOT NULL, case_id TEXT) STRICT;
CREATE INDEX IF NOT EXISTS rig_loop_requests_ws ON rig_loop_requests(workspace_key, loop, state, id);
CREATE TABLE IF NOT EXISTS rig_permits (workspace_key TEXT NOT NULL, seat TEXT NOT NULL, t INTEGER NOT NULL, by TEXT NOT NULL, PRIMARY KEY (workspace_key, seat)) STRICT;
`;
// P223: rig_permits = 사람이 unattended(묻지 않음)를 승인한 자리(워크스페이스·자리마다 한 줄, by: enable | human).
//   rig_loop_requests.delivery_id = 멈춘 고리에 붙잡은 전달(대기열의 loop_paused 전달, 잇기에 그 전달로 넣는다)
// P222(rig 2 R5): 산출물 섹터의 등록부. 한 줄이 산출물 하나(섹터 폴더 안의 파일·폴더, path는 저장소 기준). state: new | accepted | superseded
//   state_why: accepted는 run_done, superseded는 same_path(같은 경로의 새것, superseded_by) | keep(섹터의 keep을 넘음). 파일은 지우지 않는다. source: agent(--artifact) | hook(done 훅)
export const RIG_ARTIFACTS_SCHEMA = `
CREATE TABLE IF NOT EXISTS rig_artifacts (id INTEGER PRIMARY KEY, workspace_key TEXT NOT NULL, sector TEXT NOT NULL, path TEXT NOT NULL, dir INTEGER NOT NULL DEFAULT 0, sha256 TEXT, size INTEGER, loop TEXT, case_id TEXT, unit_id TEXT, try_id TEXT, seat TEXT, session_id TEXT, source TEXT NOT NULL, state TEXT NOT NULL, state_at INTEGER, state_why TEXT, superseded_by INTEGER, t INTEGER NOT NULL) STRICT;
CREATE INDEX IF NOT EXISTS rig_artifacts_ws ON rig_artifacts(workspace_key, sector, id);
CREATE INDEX IF NOT EXISTS rig_artifacts_case ON rig_artifacts(case_id);
CREATE INDEX IF NOT EXISTS rig_artifacts_path ON rig_artifacts(workspace_key, path);
`;
// P224(rig 2 R6): 제안과 승인. rig_proposals: 제안 하나(대상 문서 이름 | definition, 저장소 기준 경로, 제안 때 대상의 SHA-256과 내용, 새 내용, 까닭,
//   승인 길 route: human(사람: 응답 필요 목록) | manager(관리자 자리나 사람), 상태 pending | applied | rejected | failed(충돌 등), 결정한 쪽·까닭, 반영된 버전).
//   rig_doc_marks: 정본 문서마다 승인된 내용(SHA-256, 내용)과 승인 안 된 바뀜(unapproved_sha·at·by). 보드가 처음 본 내용이 승인된 내용이다
export const RIG_PROPOSALS_SCHEMA = `
CREATE TABLE IF NOT EXISTS rig_proposals (id TEXT PRIMARY KEY, workspace_key TEXT NOT NULL, target TEXT NOT NULL, kind TEXT NOT NULL, path TEXT NOT NULL, base_sha TEXT, base_text TEXT, new_text TEXT NOT NULL, new_sha TEXT NOT NULL, why TEXT, route TEXT NOT NULL, state TEXT NOT NULL, loop TEXT, case_id TEXT, unit_id TEXT, seat TEXT, session_id TEXT, artifact_id INTEGER, file TEXT, t INTEGER NOT NULL, decided_at INTEGER, decided_by TEXT, reason TEXT, version_n INTEGER) STRICT;
CREATE INDEX IF NOT EXISTS rig_proposals_ws ON rig_proposals(workspace_key, state, t);
CREATE TABLE IF NOT EXISTS rig_doc_marks (workspace_key TEXT NOT NULL, doc TEXT NOT NULL, path TEXT NOT NULL, approved_sha TEXT, approved_text TEXT, approved_at INTEGER, approved_by TEXT, unapproved_sha TEXT, unapproved_at INTEGER, unapproved_by TEXT, PRIMARY KEY (workspace_key, doc)) STRICT;
`;
const proposalRow = (r) => (r ? { id: r.id, workspaceKey: r.workspace_key, target: r.target, kind: r.kind, path: r.path, baseSha: r.base_sha ?? null, baseText: r.base_text ?? null, newText: r.new_text, newSha: r.new_sha, why: r.why ?? null, route: r.route, state: r.state, loop: r.loop ?? null, caseId: r.case_id ?? null, unitId: r.unit_id ?? null, seat: r.seat ?? null, sessionId: r.session_id ?? null, artifactId: r.artifact_id ?? null, file: r.file ?? null, t: r.t, decidedAt: r.decided_at ?? null, decidedBy: r.decided_by ?? null, reason: r.reason ?? null, versionN: r.version_n ?? null } : null);
const markRow = (r) => (r ? { workspaceKey: r.workspace_key, doc: r.doc, path: r.path, approvedSha: r.approved_sha ?? null, approvedText: r.approved_text ?? null, approvedAt: r.approved_at ?? null, approvedBy: r.approved_by ?? null, unapprovedSha: r.unapproved_sha ?? null, unapprovedAt: r.unapproved_at ?? null, unapprovedBy: r.unapproved_by ?? null } : null);
const artifactRow = (r) => (r ? { id: Number(r.id), workspaceKey: r.workspace_key, sector: r.sector, path: r.path, dir: !!r.dir, sha256: r.sha256 ?? null, size: r.size ?? null, loop: r.loop ?? null, caseId: r.case_id ?? null, unitId: r.unit_id ?? null, tryId: r.try_id ?? null, seat: r.seat ?? null, sessionId: r.session_id ?? null, source: r.source, state: r.state, stateAt: r.state_at ?? null, stateWhy: r.state_why ?? null, supersededBy: r.superseded_by ?? null, t: r.t, branch: r.branch ?? null, worktree: r.worktree ?? null, forkSha: r.fork_sha ?? null } : null); // P224: 워크트리 산출물(branch·worktree·fork_sha)
// P217: rig 장부(18.1). 추가만 하는 표. seq는 AUTOINCREMENT라 지운 뒤에도 다시 쓰지 않는다(읽은 자리 커서의 기준).
//   쓰는 곳은 rig-ledger.mjs rigEvent 하나(insertRigEvent). 지우는 곳은 보관 정리(pruneRigEvents) 하나
export const RIG_EVENTS_SCHEMA = `
CREATE TABLE IF NOT EXISTS rig_events (seq INTEGER PRIMARY KEY AUTOINCREMENT, t INTEGER NOT NULL, ws TEXT NOT NULL, def_n INTEGER, kind TEXT NOT NULL, case_id TEXT, unit_id TEXT, try_id TEXT, seat TEXT, session TEXT, from_seat TEXT, to_seat TEXT, line INTEGER, value TEXT, n INTEGER, max INTEGER, actor TEXT, ref TEXT, text TEXT, data TEXT) STRICT;
CREATE INDEX IF NOT EXISTS rig_events_ws ON rig_events(ws, seq);
CREATE INDEX IF NOT EXISTS rig_events_case ON rig_events(case_id, seq);
`;
const eventRow = (r) => ({ seq: Number(r.seq), t: r.t, ws: r.ws, defN: r.def_n ?? null, kind: r.kind, caseId: r.case_id ?? null, unitId: r.unit_id ?? null, tryId: r.try_id ?? null, seat: r.seat ?? null, session: r.session ?? null, fromSeat: r.from_seat ?? null, toSeat: r.to_seat ?? null, line: r.line ?? null, value: r.value ?? null, n: r.n ?? null, max: r.max ?? null, actor: r.actor ?? null, ref: r.ref ?? null, text: r.text ?? null, data: r.data ? J(r.data, null) : null });
export const RIG_COLUMNS = {
  sessions: { rig_seat: 'TEXT' }, // P185: 세션이 맡은 rig 자리(사람이 정하거나 판이 자리를 위해 띄움)
  // P185: 일의 건(case_id), 받는 자리(seat), 보낸 쪽 기록(via JSON: { by, fromSeat, result, line, escalated }). max_live 줄에 선 일은 to_session이 ''다
  work_units: { case_id: 'TEXT', seat: 'TEXT', via: 'TEXT' },
  workspaces: { rig_enabled: 'INTEGER', rig_enabled_at: 'INTEGER', rig_protected: 'TEXT' }, // P188: rig_protected(사람만 고치는 목록)
  deliveries: { origin: 'TEXT', from_session: 'TEXT' },
  rig_loop_requests: { delivery_id: 'TEXT' }, // P223
  rig_artifacts: { branch: 'TEXT', worktree: 'TEXT', fork_sha: 'TEXT' }, // P224(11.7의 6): 워크트리 자리의 산출물(브랜치, 워크트리 폴더, 갈라진 커밋). state pending_merge → new | accepted | lost
  rig_hook_runs: { tool_run_id: 'TEXT' }, // P183: 도구 훅이면 그 실행
  rig_cases: { version_n: 'INTEGER', owner_wait: 'TEXT', owner_wait_delivery: 'TEXT', loop: 'TEXT', name: 'TEXT', name_by: 'TEXT', paused_at: 'INTEGER', paused_by: 'TEXT', held: 'TEXT' }, // P221(rig 2 R2): 회의 고리(loop), 회 이름(name·name_by: auto | human | owner | manager), 회 멈춤(paused_at·paused_by), 멈춘 동안 붙잡은 넘김(held JSON [{ unitId, session, seat, result, text }]) // P188: 건이 만들어질 때의 정의 버전(자리·흐름·상한은 이 버전을 따른다). P209: 주인 기다림의 종류(report | escalated)와 보고 전달 ID
  // P188: 사람만 고치는 목록. JSON { pointers: ["/seats/reviewer", …], files: [{ path, sha256, at }] } | null
};
const J = (s, d = null) => { if (s == null) return d; try { return JSON.parse(s); } catch { return d; } };
const toolRow = (r) => (r ? { id: r.id, sessionId: r.session_id, workspaceKey: r.workspace_key ?? null, unitId: r.unit_id ?? null, tryId: r.try_id ?? null, tool: r.tool, argv: J(r.argv, []), args: J(r.args, []), argsGiven: J(r.args_given), cwd: r.cwd ?? null, rigHash: r.rig_hash ?? null, status: r.status, exitCode: r.exit_code ?? null, startedAt: r.started_at, endedAt: r.ended_at ?? null, logPath: r.log_path ?? null, logBytes: r.log_bytes ?? null, logCut: !!r.log_cut, outSha256: r.out_sha256 ?? null, hooks: J(r.hooks, []), appended: r.appended ?? null, error: r.error ?? null } : null);
const TOOL_COLS = { status: 'status', exitCode: 'exit_code', endedAt: 'ended_at', logBytes: 'log_bytes', logCut: 'log_cut', outSha256: 'out_sha256', hooks: 'hooks', appended: 'appended', error: 'error', args: 'args', argv: 'argv' };

const caseRow = (r) => (r ? { id: r.id, workspaceKey: r.workspace_key, owner: r.owner_session, state: r.state, createdAt: r.created_at, closedAt: r.closed_at ?? null, edgeCounts: J(r.edge_counts, {}) || {}, blockedReason: r.blocked_reason ?? null, versionN: r.version_n ?? null, ownerWait: r.owner_wait ?? null, ownerWaitDelivery: r.owner_wait_delivery ?? null, loop: r.loop ?? null, name: r.name ?? null, nameBy: r.name_by ?? null, pausedAt: r.paused_at ?? null, pausedBy: r.paused_by ?? null, held: J(r.held, []) || [] } : null);
const versionRow = (r) => (r ? { workspaceKey: r.workspace_key, n: r.n, hash: r.hash, t: r.t, by: r.by, note: r.note ?? null, file: r.file ?? null } : null);
// P185: 일 행 + 건 칸(store-units.mjs의 unitRow와 같은 모양). 자리 줄에 선 일은 to가 null
const flowUnitRow = (r) => (r ? { id: r.id, from: r.from_session, to: r.to_session || null, origin: r.origin, spec: r.spec, status: r.status, createdAt: r.created_at, closedAt: r.closed_at ?? null, caseId: r.case_id ?? null, seat: r.seat ?? null, via: J(r.via) } : null);
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
    // P187: 띄우기 전에 돈 deliver 훅 행(세션·일이 비어 있음)에 띄운 뒤의 세션과 일을 적는다. 이미 적힌 칸은 두고 빈 칸만
    fillHookRuns(ids, { sessionId = null, unitId = null } = {}) {
      const q = this.st('UPDATE rig_hook_runs SET session_id = COALESCE(session_id, ?), unit_id = COALESCE(unit_id, ?) WHERE id = ?');
      for (const id of ids || []) if (id != null) q.run(sessionId, unitId, id);
    },
    // P187: 자리 줄에 섰다가 세션을 얻은 일의 훅 행(세션 칸이 비어 있음)
    fillHookRunsOfUnit(unitId, sessionId) { if (unitId && sessionId) this.st('UPDATE rig_hook_runs SET session_id = ? WHERE unit_id = ? AND session_id IS NULL').run(sessionId, unitId); },
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
    // ---------- P217: 장부(rig_events) ----------
    // rig-ledger.mjs rigEvent만 부른다 → seq
    insertRigEvent(x) {
      const r = this.st('INSERT INTO rig_events (t, ws, def_n, kind, case_id, unit_id, try_id, seat, session, from_seat, to_seat, line, value, n, max, actor, ref, text, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(x.t, x.ws, x.defN ?? null, x.kind, x.caseId ?? null, x.unitId ?? null, x.tryId ?? null, x.seat ?? null, x.session ?? null, x.fromSeat ?? null, x.toSeat ?? null, x.line ?? null, x.value ?? null, x.n ?? null, x.max ?? null, x.actor ?? null, x.ref ?? null, x.text ?? null, x.data != null ? JSON.stringify(x.data) : null);
      return Number(r.lastInsertRowid);
    },
    // 장부 읽기(seq 차례). q: { ws, caseIds?, kinds?, sinceSeq?(그 뒤), sinceT?(그 시각부터), limit, desc? }
    rigEvents(q = {}) {
      const where = ['ws = ?']; const vals = [q.ws];
      if (q.caseIds) { if (!q.caseIds.length) return []; where.push(`case_id IN (${q.caseIds.map(() => '?').join(',')})`); vals.push(...q.caseIds); }
      if (q.kinds && q.kinds.length) { where.push(`kind IN (${q.kinds.map(() => '?').join(',')})`); vals.push(...q.kinds); }
      if (q.sinceSeq != null) { where.push('seq > ?'); vals.push(Number(q.sinceSeq)); }
      if (q.sinceT != null) { where.push('t >= ?'); vals.push(Number(q.sinceT)); }
      const lim = Math.max(1, Number(q.limit) || 200);
      // 커서 없이 부르면 최근 limit줄(오래된 것부터 돌려준다). 커서가 있으면 그 뒤에서 limit줄
      const tail = q.sinceSeq == null && q.sinceT == null;
      const rows = this.db.prepare(`SELECT * FROM rig_events WHERE ${where.join(' AND ')} ORDER BY seq ${tail ? 'DESC' : 'ASC'} LIMIT ?`).all(...vals, lim).map(eventRow);
      return tail ? rows.reverse() : rows;
    },
    // P217: 세션이 받았거나 주인인 건(그 워크스페이스)
    caseIdsOfSession(sessionId, ws) { return this.st("SELECT id FROM rig_cases WHERE workspace_key = ? AND (owner_session = ? OR id IN (SELECT case_id FROM work_units WHERE to_session = ? AND case_id IS NOT NULL)) ORDER BY created_at").all(ws, sessionId, sessionId).map((r) => r.id); },
    lastRigSeq(ws) { const r = this.st('SELECT MAX(seq) AS s FROM rig_events WHERE ws = ?').get(ws); return r && r.s != null ? Number(r.s) : 0; },
    // 구조 지도의 재료: 최근 건(case_open이 있는 것) n개와 그 건들의 모든 줄, 건 밖 줄은 빼고. want: 반드시 담을 건
    rigEventsForMap(ws, { cases = 50, want = null } = {}) {
      const ids = this.st("SELECT case_id FROM rig_events WHERE ws = ? AND kind = 'case_open' ORDER BY seq DESC LIMIT ?").all(ws, cases).map((r) => r.case_id);
      if (want && !ids.includes(want)) ids.push(want);
      if (!ids.length) return [];
      return this.db.prepare(`SELECT * FROM rig_events WHERE ws = ? AND case_id IN (${ids.map(() => '?').join(',')}) ORDER BY seq`).all(ws, ...ids).map(eventRow);
    },
    // 보관(18.1): 워크스페이스의 줄이 max를 넘으면 열린 건이 아닌 줄(건 밖 줄 포함)의 오래된 것부터 지운다 → 지운 수
    pruneRigEvents(ws, max) {
      const n = Number(this.st('SELECT COUNT(*) AS n FROM rig_events WHERE ws = ?').get(ws).n);
      if (n <= max) return 0;
      const r = this.db.prepare(`DELETE FROM rig_events WHERE seq IN (SELECT seq FROM rig_events WHERE ws = ? AND (case_id IS NULL OR case_id NOT IN (SELECT id FROM rig_cases WHERE workspace_key = ? AND state IN ('open', 'blocked', 'waiting_owner'))) ORDER BY seq LIMIT ?)`).run(ws, ws, n - max);
      return Number(r.changes);
    },
    // ---------- P185: 자리와 건 ----------
    setSessionSeat(sessionId, seat) { this.st('UPDATE sessions SET rig_seat = ? WHERE session_id = ?').run(seat || null, sessionId); },
    insertCase(c) { this.st('INSERT INTO rig_cases (id, workspace_key, owner_session, state, created_at, closed_at, edge_counts, blocked_reason, version_n, loop, name, name_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(c.id, c.workspaceKey, c.owner, c.state || 'open', c.createdAt, c.closedAt ?? null, JSON.stringify(c.edgeCounts || {}), c.blockedReason ?? null, c.versionN ?? null, c.loop ?? null, c.name ?? null, c.nameBy ?? null); },
    getCase(id) { return caseRow(this.st('SELECT * FROM rig_cases WHERE id = ?').get(id)); },
    updateCase(id, fields) {
      const cols = { state: 'state', closedAt: 'closed_at', edgeCounts: 'edge_counts', blockedReason: 'blocked_reason', ownerWait: 'owner_wait', ownerWaitDelivery: 'owner_wait_delivery', loop: 'loop', name: 'name', nameBy: 'name_by', pausedAt: 'paused_at', pausedBy: 'paused_by', held: 'held' }; // P221
      const sets = []; const vals = [];
      for (const [k, v] of Object.entries(fields)) { if (!cols[k]) throw new Error('unknown field ' + k); sets.push(`${cols[k]} = ?`); vals.push(k === 'edgeCounts' ? JSON.stringify(v || {}) : k === 'held' ? (v && v.length ? JSON.stringify(v) : null) : v ?? null); }
      if (sets.length) this.st(`UPDATE rig_cases SET ${sets.join(', ')} WHERE id = ?`).run(...vals, id);
    },
    casesOf(workspaceKey, limit = 50) { return this.st('SELECT * FROM rig_cases WHERE workspace_key = ? ORDER BY created_at DESC, rowid DESC LIMIT ?').all(workspaceKey, limit).map(caseRow); },
    // P194: 주인 세션이 쥔 waiting_owner 건(그 워크스페이스)
    waitingCasesOfOwner(sessionId, key) { return this.st("SELECT * FROM rig_cases WHERE owner_session = ? AND workspace_key = ? AND state = 'waiting_owner' ORDER BY created_at").all(sessionId, key).map(caseRow); },
    liveCasesOfOwner(sessionId) { return this.st("SELECT * FROM rig_cases WHERE owner_session = ? AND state IN ('open', 'blocked', 'waiting_owner')").all(sessionId).map(caseRow); },
    insertCaseItem(x) { this.st('INSERT INTO rig_case_items (case_id, session_id, seat, worktree, worktree_path, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(x.caseId, x.sessionId, x.seat, x.worktree ?? null, x.worktreePath ?? null, x.createdAt ?? Date.now()); },
    caseItems(caseId) { return this.st('SELECT * FROM rig_case_items WHERE case_id = ? ORDER BY id').all(caseId).map((r) => ({ caseId: r.case_id, sessionId: r.session_id, seat: r.seat, worktree: r.worktree ?? null, worktreePath: r.worktree_path ?? null, createdAt: r.created_at })); },
    // ---------- P197: 세션 맵 rig 띠 자료(17절) ----------
    insertCaseReport(x) { this.st('INSERT INTO rig_case_reports (case_id, seat, session_id, unit_id, result, line, escalated, delivery_id, t) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(x.caseId, x.seat ?? null, x.sessionId ?? null, x.unitId ?? null, x.result ?? null, x.line ?? null, x.escalated ? 1 : 0, x.deliveryId ?? null, x.t ?? Date.now()); },
    // 건 여럿의 보고(한 번에) → { [건]: [{ seat, sessionId, unit, result, line, escalated, at, deliveryId }] }
    reportsOfCases(caseIds) {
      const out = {}; if (!caseIds.length) return out;
      const rows = this.db.prepare(`SELECT * FROM rig_case_reports WHERE case_id IN (${caseIds.map(() => '?').join(',')}) ORDER BY t, id`).all(...caseIds);
      for (const r of rows) (out[r.case_id] || (out[r.case_id] = [])).push({ seat: r.seat ?? null, sessionId: r.session_id ?? null, unit: r.unit_id ?? null, result: r.result ?? null, line: r.line ?? null, escalated: !!r.escalated, at: r.t, deliveryId: r.delivery_id ?? null });
      return out;
    },
    // 건 여럿의 일과 일마다 마지막 시도의 값·done 글(한 질의, lastTryOfUnit을 일마다 부르지 않는다) → { [건]: [일 + { tryResult, tryDoneText }] }(만든 차례)
    unitsOfCasesWithTry(caseIds) {
      const out = {}; if (!caseIds.length) return out;
      const rows = this.db.prepare(`SELECT u.*, t.result AS t_result, t.done_text AS t_done, t.stop_reason AS t_stop, t.ended_at AS t_ended, t.id AS t_id FROM work_units u LEFT JOIN unit_tries t ON t.id = (SELECT t2.id FROM unit_tries t2 WHERE t2.unit_id = u.id ORDER BY t2.started_at DESC LIMIT 1) WHERE u.case_id IN (${caseIds.map(() => '?').join(',')}) ORDER BY u.created_at, u.rowid`).all(...caseIds);
      for (const r of rows) (out[r.case_id] || (out[r.case_id] = [])).push({ ...flowUnitRow(r), tryResult: r.t_result ?? null, tryDoneText: r.t_done ?? null, tryStop: r.t_stop ?? null, tryEnded: r.t_ended ?? null, tryId: r.t_id ?? null });
      return out;
    },
    // 끝나지 않은 건(open·blocked·waiting_owner), 최근 것부터 limit개와 전체 수
    liveCasesOf(key, limit = 50) {
      const rows = this.st("SELECT * FROM rig_cases WHERE workspace_key = ? AND state IN ('open', 'blocked', 'waiting_owner') ORDER BY created_at DESC, rowid DESC LIMIT ?").all(key, limit).map(caseRow);
      return { rows, total: rows.length < limit ? rows.length : this.liveCasesCount(key) };
    },
    // 끝난(done·cancelled) 건, 나이와 상관없이 최근에 닫힌 것부터 n개와 전체 수
    closedCasesOf(key, n = 3) {
      const rows = this.st("SELECT * FROM rig_cases WHERE workspace_key = ? AND state NOT IN ('open', 'blocked', 'waiting_owner') ORDER BY COALESCE(closed_at, created_at) DESC, rowid DESC LIMIT ?").all(key, n).map(caseRow);
      const total = Number(this.st("SELECT COUNT(*) AS n FROM rig_cases WHERE workspace_key = ? AND state NOT IN ('open', 'blocked', 'waiting_owner')").get(key).n);
      return { rows, total };
    },
    // 건의 일들(만든 차례)
    unitsOfCase(caseId) { return this.st('SELECT * FROM work_units WHERE case_id = ? ORDER BY created_at, rowid').all(caseId).map(flowUnitRow); },
    openUnitsOfCaseCount(caseId) { return Number(this.st("SELECT COUNT(*) AS n FROM work_units WHERE case_id = ? AND status = 'open'").get(caseId).n); },
    // max_live 줄에 선 일(받을 세션이 아직 없다), 먼저 온 것부터
    seatWaitingUnits(workspaceKey, seat) { return this.st("SELECT u.* FROM work_units u JOIN rig_cases c ON c.id = u.case_id WHERE u.to_session = '' AND u.status = 'open' AND u.seat = ? AND c.workspace_key = ? ORDER BY u.created_at, u.rowid").all(seat, workspaceKey).map(flowUnitRow); },
    seatWaitingAll() { return this.st("SELECT u.*, c.workspace_key AS ws FROM work_units u JOIN rig_cases c ON c.id = u.case_id WHERE u.to_session = '' AND u.status = 'open'").all().map((r) => ({ ...flowUnitRow(r), workspaceKey: r.ws })); },
    setUnitTarget(id, sessionId) { this.st('UPDATE work_units SET to_session = ? WHERE id = ?').run(sessionId, id); },
    // fresh 자리 세션 이름의 다음 n(다시 쓰지 않는다)
    nextSeatN(workspaceKey, seat) {
      this.st('INSERT INTO rig_seat_counters (workspace_key, seat, n) VALUES (?, ?, 1) ON CONFLICT(workspace_key, seat) DO UPDATE SET n = n + 1').run(workspaceKey, seat);
      return Number(this.st('SELECT n FROM rig_seat_counters WHERE workspace_key = ? AND seat = ?').get(workspaceKey, seat).n);
    },
    // P186: 한 세션의 최근 훅 실행(세션 맵 미리 보기)
    hookRunsOfSession(sessionId, limit = 5) { return this.st('SELECT * FROM rig_hook_runs WHERE session_id = ? ORDER BY id DESC LIMIT ?').all(sessionId, limit).map(runRow); },
    hookRuns({ workspaceKey = null, limit = 50 } = {}) {
      const rows = workspaceKey ? this.st('SELECT * FROM rig_hook_runs WHERE workspace_key = ? ORDER BY id DESC LIMIT ?').all(workspaceKey, limit) : this.st('SELECT * FROM rig_hook_runs ORDER BY id DESC LIMIT ?').all(limit);
      return rows.map(runRow);
    },
    // ---------- P188: 정의 버전, 사람만 고치는 목록, 느린 고리 ----------
    insertRigVersion(x) {
      const n = Number(this.st('SELECT COALESCE(MAX(n), 0) AS n FROM rig_versions WHERE workspace_key = ?').get(x.workspaceKey).n) + 1;
      this.st('INSERT INTO rig_versions (workspace_key, n, hash, t, by, note, file) VALUES (?, ?, ?, ?, ?, ?, ?)').run(x.workspaceKey, n, x.hash, x.t ?? Date.now(), x.by || 'unknown', x.note ?? null, x.file ?? null);
      return n;
    },
    setRigVersionFile(key, n, file) { this.st('UPDATE rig_versions SET file = ? WHERE workspace_key = ? AND n = ?').run(file, key, n); },
    rigVersions(key) { return this.st('SELECT * FROM rig_versions WHERE workspace_key = ? ORDER BY n').all(key).map(versionRow); },
    rigVersion(key, n) { return versionRow(this.st('SELECT * FROM rig_versions WHERE workspace_key = ? AND n = ?').get(key, n)); },
    lastRigVersion(key) { return versionRow(this.st('SELECT * FROM rig_versions WHERE workspace_key = ? ORDER BY n DESC LIMIT 1').get(key)); },
    // 사람만 고치는 목록 → { pointers, files } | null
    rigProtected(key) {
      const r = this.st('SELECT rig_protected FROM workspaces WHERE workspace_key = ?').get(key);
      const v = r ? J(r.rig_protected) : null;
      return v && typeof v === 'object' ? { pointers: Array.isArray(v.pointers) ? v.pointers : [], files: Array.isArray(v.files) ? v.files : [] } : null;
    },
    setRigProtected(key, v) {
      const empty = !v || (!(v.pointers || []).length && !(v.files || []).length);
      this.st('UPDATE workspaces SET rig_protected = ?, updated_at = ? WHERE workspace_key = ?').run(empty ? null : JSON.stringify({ pointers: v.pointers || [], files: v.files || [] }), Date.now(), key);
    },
    // 버전마다 건 수, 상한 초과(edge_counts의 '<줄>>else' 합), blocked·open 수
    caseStatsByVersion(key) {
      const out = {};
      for (const r of this.st('SELECT version_n, state, edge_counts FROM rig_cases WHERE workspace_key = ?').all(key)) {
        const k = r.version_n ?? 0; const o = out[k] || (out[k] = { cases: 0, escalations: 0, blocked: 0, open: 0 });
        o.cases++; if (r.state === 'blocked') o.blocked++; if (r.state === 'open') o.open++;
        const ec = J(r.edge_counts, {}) || {};
        for (const [kk, v] of Object.entries(ec)) if (kk.endsWith('>else')) o.escalations += Number(v) || 0;
      }
      return out;
    },
    // 해시마다 훅 거절 수(reject·blocked)
    hookRejectsByHash(key) {
      const rows = this.st("SELECT rig_hash, COUNT(*) AS n FROM rig_hook_runs WHERE workspace_key = ? AND decision IN ('reject', 'blocked') GROUP BY rig_hash").all(key);
      return Object.fromEntries(rows.map((r) => [r.rig_hash, Number(r.n)]));
    },
    // 버전마다 done 값이 ok가 아닌 시도 수(반려·실패 등)
    notOkByVersion(key) {
      const rows = this.st("SELECT c.version_n AS v, COUNT(*) AS n FROM unit_tries t JOIN work_units u ON u.id = t.unit_id JOIN rig_cases c ON c.id = u.case_id WHERE c.workspace_key = ? AND t.result IS NOT NULL AND t.result != 'ok' GROUP BY c.version_n").all(key);
      return Object.fromEntries(rows.map((r) => [r.v ?? 0, Number(r.n)]));
    },
    getCycle(key, line) { const r = this.st('SELECT * FROM rig_cycles WHERE workspace_key = ? AND line = ?').get(key, line); return r ? { workspaceKey: r.workspace_key, line: r.line, nextAt: r.next_at, lastAt: r.last_at ?? null, sig: r.sig ?? null } : null; },
    setCycle(key, line, { nextAt, lastAt = null, sig = null }) { this.st('INSERT INTO rig_cycles (workspace_key, line, next_at, last_at, sig) VALUES (?, ?, ?, ?, ?) ON CONFLICT(workspace_key, line) DO UPDATE SET next_at = excluded.next_at, last_at = excluded.last_at, sig = excluded.sig').run(key, line, nextAt, lastAt, sig); },
    // ---------- P222: 산출물(rig_artifacts) ----------
    insertArtifact(x) {
      return Number(this.st('INSERT INTO rig_artifacts (workspace_key, sector, path, dir, sha256, size, loop, case_id, unit_id, try_id, seat, session_id, source, state, state_at, t, branch, worktree, fork_sha) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(x.workspaceKey, x.sector, x.path, x.dir ? 1 : 0, x.sha256 ?? null, x.size ?? null, x.loop ?? null, x.caseId ?? null, x.unitId ?? null, x.tryId ?? null, x.seat ?? null, x.sessionId ?? null, x.source || 'agent', x.state || 'new', x.t ?? Date.now(), x.t ?? Date.now(), x.branch ?? null, x.worktree ?? null, x.forkSha ?? null).lastInsertRowid);
    },
    getArtifact(id) { return artifactRow(this.st('SELECT * FROM rig_artifacts WHERE id = ?').get(id)); },
    setArtifactState(id, state, { why = null, by = null } = {}) { this.st('UPDATE rig_artifacts SET state = ?, state_at = ?, state_why = ?, superseded_by = COALESCE(?, superseded_by) WHERE id = ?').run(state, Date.now(), why, by, id); },
    // 같은 경로의 살아 있는(new·accepted) 줄
    liveArtifactsAt(ws, p) { return this.st("SELECT * FROM rig_artifacts WHERE workspace_key = ? AND path = ? AND state IN ('new', 'accepted', 'pending_merge') ORDER BY id").all(ws, p).map(artifactRow); },
    // 최근 것부터. q: { ws, sector?, caseId?, states?, limit }
    artifacts(q = {}) {
      const where = ['workspace_key = ?']; const vals = [q.ws];
      if (q.sector != null) { where.push('sector = ?'); vals.push(q.sector); }
      if (q.caseId != null) { where.push('case_id = ?'); vals.push(q.caseId); }
      if (q.states && q.states.length) { where.push(`state IN (${q.states.map(() => '?').join(',')})`); vals.push(...q.states); }
      return this.db.prepare(`SELECT * FROM rig_artifacts WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT ?`).all(...vals, Math.max(1, Number(q.limit) || 50)).map(artifactRow);
    },
    // 섹터마다 { total, live }
    artifactCounts(ws) {
      const out = {};
      for (const r of this.st("SELECT sector, COUNT(*) AS n, SUM(CASE WHEN state IN ('new', 'accepted', 'pending_merge') THEN 1 ELSE 0 END) AS live FROM rig_artifacts WHERE workspace_key = ? GROUP BY sector").all(ws)) out[r.sector] = { total: Number(r.n), live: Number(r.live || 0) };
      return out;
    },
    // 회마다 산출물 수(rig.map의 회 목록)
    artifactCountsByCase(ws) { return Object.fromEntries(this.st('SELECT case_id, COUNT(*) AS n FROM rig_artifacts WHERE workspace_key = ? AND case_id IS NOT NULL GROUP BY case_id').all(ws).map((r) => [r.case_id, Number(r.n)])); },
    // P224: 워크트리에서 합치기를 기다리는 산출물(모든 워크스페이스, 오래된 것부터)
    pendingMergeArtifacts(ws = null) { return (ws ? this.st("SELECT * FROM rig_artifacts WHERE state = 'pending_merge' AND workspace_key = ? ORDER BY id").all(ws) : this.st("SELECT * FROM rig_artifacts WHERE state = 'pending_merge' ORDER BY id").all()).map(artifactRow); },
    // P224: 사람이 받아들일 산출물(받아들임 human 섹터의 new). sectors: [섹터 이름]
    newArtifactsIn(ws, sectors) { if (!sectors.length) return []; return this.db.prepare(`SELECT * FROM rig_artifacts WHERE workspace_key = ? AND state = 'new' AND source != 'proposal' AND sector IN (${sectors.map(() => '?').join(',')}) ORDER BY id`).all(ws, ...sectors).map(artifactRow); },
    // ---------- P224: 제안(rig_proposals)과 정본 표시(rig_doc_marks) ----------
    insertProposal(x) {
      this.st('INSERT INTO rig_proposals (id, workspace_key, target, kind, path, base_sha, base_text, new_text, new_sha, why, route, state, loop, case_id, unit_id, seat, session_id, artifact_id, file, t) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(x.id, x.workspaceKey, x.target, x.kind, x.path, x.baseSha ?? null, x.baseText ?? null, x.newText, x.newSha, x.why ?? null, x.route, 'pending', x.loop ?? null, x.caseId ?? null, x.unitId ?? null, x.seat ?? null, x.sessionId ?? null, x.artifactId ?? null, x.file ?? null, x.t ?? Date.now());
      return this.getProposal(x.id);
    },
    getProposal(id) { return proposalRow(this.st('SELECT * FROM rig_proposals WHERE id = ?').get(id)); },
    setProposal(id, f) {
      const cols = { state: 'state', decidedAt: 'decided_at', decidedBy: 'decided_by', reason: 'reason', versionN: 'version_n', artifactId: 'artifact_id', file: 'file' };
      const keys = Object.keys(f).filter((k) => cols[k]);
      if (!keys.length) return;
      this.db.prepare(`UPDATE rig_proposals SET ${keys.map((k) => `${cols[k]} = ?`).join(', ')} WHERE id = ?`).run(...keys.map((k) => f[k] ?? null), id);
    },
    // q: { ws?, states?, route?, limit } 최근 것부터
    proposals(q = {}) {
      const where = []; const vals = [];
      if (q.ws != null) { where.push('workspace_key = ?'); vals.push(q.ws); }
      if (q.states && q.states.length) { where.push(`state IN (${q.states.map(() => '?').join(',')})`); vals.push(...q.states); }
      if (q.route != null) { where.push('route = ?'); vals.push(q.route); }
      if (q.since != null) { where.push('COALESCE(decided_at, t) > ?'); vals.push(q.since); } // 정해진(또는 낸) 때가 since 뒤
      return this.db.prepare(`SELECT * FROM rig_proposals ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY t DESC, rowid DESC LIMIT ?`).all(...vals, Math.max(1, Number(q.limit) || 50)).map(proposalRow);
    },
    docMark(ws, doc) { return markRow(this.st('SELECT * FROM rig_doc_marks WHERE workspace_key = ? AND doc = ?').get(ws, doc)); },
    docMarks(ws = null) { return (ws ? this.st('SELECT * FROM rig_doc_marks WHERE workspace_key = ?').all(ws) : this.st('SELECT * FROM rig_doc_marks').all()).map(markRow); },
    setDocMark(ws, doc, f) {
      const cur = this.docMark(ws, doc) || { path: f.path || '', approvedSha: null, approvedText: null, approvedAt: null, approvedBy: null, unapprovedSha: null, unapprovedAt: null, unapprovedBy: null };
      const x = { ...cur, ...f };
      this.st('INSERT INTO rig_doc_marks (workspace_key, doc, path, approved_sha, approved_text, approved_at, approved_by, unapproved_sha, unapproved_at, unapproved_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(workspace_key, doc) DO UPDATE SET path = excluded.path, approved_sha = excluded.approved_sha, approved_text = excluded.approved_text, approved_at = excluded.approved_at, approved_by = excluded.approved_by, unapproved_sha = excluded.unapproved_sha, unapproved_at = excluded.unapproved_at, unapproved_by = excluded.unapproved_by')
        .run(ws, doc, x.path || '', x.approvedSha ?? null, x.approvedText ?? null, x.approvedAt ?? null, x.approvedBy ?? null, x.unapprovedSha ?? null, x.unapprovedAt ?? null, x.unapprovedBy ?? null);
    },
    // ---------- P221: 고리(rig_loops, rig_loop_requests) ----------
    getLoopRow(key, loop) { const r = this.st('SELECT * FROM rig_loops WHERE workspace_key = ? AND loop = ?').get(key, loop); return r ? { loop: r.loop, pausedAt: r.paused_at ?? null, pausedBy: r.paused_by ?? null, nextAt: r.next_at ?? null, lastAt: r.last_at ?? null, sig: r.sig ?? null } : null; },
    setLoopRow(key, loop, f) {
      const cur = this.getLoopRow(key, loop) || { pausedAt: null, pausedBy: null, nextAt: null, lastAt: null, sig: null };
      const x = { ...cur, ...f };
      this.st('INSERT INTO rig_loops (workspace_key, loop, paused_at, paused_by, next_at, last_at, sig) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(workspace_key, loop) DO UPDATE SET paused_at = excluded.paused_at, paused_by = excluded.paused_by, next_at = excluded.next_at, last_at = excluded.last_at, sig = excluded.sig').run(key, loop, x.pausedAt ?? null, x.pausedBy ?? null, x.nextAt ?? null, x.lastAt ?? null, x.sig ?? null);
    },
    insertLoopRequest(x) { return Number(this.st('INSERT INTO rig_loop_requests (workspace_key, loop, session_id, from_kind, from_session, text, t, state) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(x.workspaceKey, x.loop, x.sessionId, x.fromKind, x.fromSession ?? null, x.text, x.t ?? Date.now(), 'held').lastInsertRowid); },
    setLoopRequestDelivery(id, deliveryId) { this.st('UPDATE rig_loop_requests SET delivery_id = ? WHERE id = ?').run(deliveryId, id); }, // P223
    heldLoopRequests(key, loop) { return this.st("SELECT * FROM rig_loop_requests WHERE workspace_key = ? AND loop = ? AND state = 'held' ORDER BY id").all(key, loop).map((r) => ({ id: Number(r.id), workspaceKey: r.workspace_key, loop: r.loop, sessionId: r.session_id, fromKind: r.from_kind, fromSession: r.from_session ?? null, text: r.text, t: r.t, deliveryId: r.delivery_id ?? null })); },
    // P223: unattended 승인
    rigPermitted(key, seat) { return !!this.st('SELECT 1 FROM rig_permits WHERE workspace_key = ? AND seat = ?').get(key, seat); },
    setRigPermit(key, seat, by) { this.st('INSERT INTO rig_permits (workspace_key, seat, t, by) VALUES (?, ?, ?, ?) ON CONFLICT(workspace_key, seat) DO UPDATE SET t = excluded.t, by = excluded.by').run(key, seat, Date.now(), by); },
    setLoopRequest(id, state, caseId = null) { this.st('UPDATE rig_loop_requests SET state = ?, case_id = ? WHERE id = ?').run(state, caseId, id); },
    // 고리의 회(건): 끝나지 않은 수, 전체 수, 마지막 회
    loopRunStats(key) {
      const out = {};
      for (const r of this.st("SELECT loop, COUNT(*) AS n, SUM(CASE WHEN state IN ('open', 'blocked', 'waiting_owner') THEN 1 ELSE 0 END) AS live FROM rig_cases WHERE workspace_key = ? GROUP BY loop").all(key)) out[r.loop ?? ''] = { total: Number(r.n), live: Number(r.live || 0) };
      for (const k of Object.keys(out)) { const c = this.st('SELECT * FROM rig_cases WHERE workspace_key = ? AND ' + (k === '' ? 'loop IS NULL' : 'loop = ?') + ' ORDER BY created_at DESC, rowid DESC LIMIT 1').get(...(k === '' ? [key] : [key, k])); out[k].last = caseRow(c); }
      return out;
    },
    liveCasesOfLoop(key, loop) { return this.st("SELECT * FROM rig_cases WHERE workspace_key = ? AND loop = ? AND state IN ('open', 'blocked', 'waiting_owner') ORDER BY created_at").all(key, loop).map(caseRow); },
    casesWithHeld(key) { return this.st("SELECT * FROM rig_cases WHERE workspace_key = ? AND held IS NOT NULL ORDER BY created_at").all(key).map(caseRow); },
    dropCyclesFrom(key, line) { this.st('DELETE FROM rig_cycles WHERE workspace_key = ? AND line >= ?').run(key, line); },
    // 느린 고리 요약의 재료(그 기간 [since, until))
    rigPeriod(key, since, until) {
      const casesOpened = this.st('SELECT * FROM rig_cases WHERE workspace_key = ? AND created_at >= ? AND created_at < ? ORDER BY created_at').all(key, since, until).map(caseRow);
      const casesClosed = this.st('SELECT * FROM rig_cases WHERE workspace_key = ? AND closed_at >= ? AND closed_at < ? ORDER BY closed_at').all(key, since, until).map(caseRow);
      const hooks = this.st('SELECT decision, COUNT(*) AS n FROM rig_hook_runs WHERE workspace_key = ? AND t >= ? AND t < ? GROUP BY decision ORDER BY n DESC').all(key, since, until).map((r) => ({ decision: r.decision, n: Number(r.n) }));
      const rejectReasons = this.st("SELECT COALESCE(reason, error, '') AS why, COUNT(*) AS n FROM rig_hook_runs WHERE workspace_key = ? AND t >= ? AND t < ? AND decision IN ('reject', 'blocked', 'failed') GROUP BY why ORDER BY n DESC LIMIT 5").all(key, since, until).map((r) => ({ reason: r.why, n: Number(r.n) }));
      const toolFails = this.st("SELECT tool, status, exit_code, error, started_at FROM tool_runs WHERE workspace_key = ? AND started_at >= ? AND started_at < ? AND status != 'running' AND NOT (status = 'done' AND exit_code = 0) ORDER BY started_at DESC LIMIT 50").all(key, since, until).map((r) => ({ tool: r.tool, status: r.status, exitCode: r.exit_code ?? null, error: r.error ?? null, at: r.started_at }));
      const toolRuns = Number(this.st('SELECT COUNT(*) AS n FROM tool_runs WHERE workspace_key = ? AND started_at >= ? AND started_at < ?').get(key, since, until).n);
      // 사람이 rig 자리 세션에 보낸 글(전달 출처 human)
      const human = this.st("SELECT d.session_id, d.text, d.created_at, s.name, s.rig_seat FROM deliveries d JOIN sessions s ON s.session_id = d.session_id WHERE d.origin = 'human' AND s.rig_seat IS NOT NULL AND s.workspace_key = ? AND d.created_at >= ? AND d.created_at < ? ORDER BY d.created_at LIMIT 100").all(key, since, until).map((r) => ({ sessionId: r.session_id, name: r.name, seat: r.rig_seat, text: r.text, at: r.created_at }));
      return { casesOpened, casesClosed, hooks, rejectReasons, toolFails, toolRuns, human };
    },
    // 열린(open·blocked) 건과 그 건의 마지막 일 시각(마지막 넘김)
    liveCasesWithLast(key) {
      return this.st("SELECT c.*, (SELECT MAX(u.created_at) FROM work_units u WHERE u.case_id = c.id) AS last_at FROM rig_cases c WHERE c.workspace_key = ? AND c.state IN ('open', 'blocked', 'waiting_owner') ORDER BY c.created_at").all(key).map((r) => ({ ...caseRow(r), lastAt: r.last_at ?? r.created_at }));
    },
    // ---------- P190: 판 안에서 rig 만들기(16절) ----------
    // 그 워크스페이스의 제작 일(사람이 맡긴 rig.describe 일, origin rig_builder), 최근 것부터. 받는 세션의 워크스페이스로 고른다
    builderUnits(key, origin, limit = 20) {
      return this.st('SELECT u.* FROM work_units u JOIN sessions s ON s.session_id = u.to_session WHERE u.origin = ? AND s.workspace_key = ? ORDER BY u.created_at DESC, u.rowid DESC LIMIT ?').all(origin, key, limit).map(flowUnitRow);
    },
    // 최근에 띄운 세션의 spawn 이벤트(워크스페이스·런처 이름. 기본 런처 고르기)
    recentSpawns(limit = 500) { return this.st("SELECT data FROM events WHERE kind = 'spawn' ORDER BY id DESC LIMIT ?").all(limit).map((r) => J(r.data, {}) || {}); },
    liveCasesCount(key) { return Number(this.st("SELECT COUNT(*) AS n FROM rig_cases WHERE workspace_key = ? AND state IN ('open', 'blocked', 'waiting_owner')").get(key).n); },
    // 그 세션의 그 시각 상태(마지막 state 이벤트의 to). 관리자 자리가 일하는 턴 중이었나를 본다
    stateAt(sessionId, t) { const r = this.st("SELECT data FROM events WHERE session_id = ? AND kind = 'state' AND t <= ? ORDER BY id DESC LIMIT 1").get(sessionId, t); const d = r ? J(r.data) : null; return d ? d.to || null : null; },
  });
}

