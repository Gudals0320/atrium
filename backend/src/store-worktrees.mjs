// 저장소(store.mjs)의 P27 표와 열: 워크트리 영역의 자리(worktree_areas)와 노드·대화 노드가 놓인 영역(area).
// store.mjs가 이 파일을 불러 표와 열을 만들고 Store에 메서드를 붙인다. 저장소 모듈의 일부라 SQL은 store*.mjs에만 둔다(ARCH 5절 "저장소").
// - worktree_areas: 리포 워크스페이스(workspace_key)의 살아 있는 워크트리(wt_key: 워크트리 폴더 경로 키)마다 영역 자리(x, y: 안이 비었을 때의 왼쪽 위).
//   moved_at은 사람이 옮긴 때. 워크트리가 없어지면(목록 읽기가 성공했을 때만) 행을 지운다.
// - nodes.area, convo_nodes.area: 그 노드가 놓인 워크트리 영역의 wt_key. 본 저장소 영역이면 ''(옛 행은 NULL이고 ''로 읽는다)
export const WORKTREE_SCHEMA = `
CREATE TABLE IF NOT EXISTS worktree_areas (workspace_key TEXT NOT NULL, wt_key TEXT NOT NULL, path TEXT NOT NULL, branch TEXT, x REAL NOT NULL, y REAL NOT NULL, created_at INTEGER NOT NULL, moved_at INTEGER, PRIMARY KEY (workspace_key, wt_key)) STRICT;
`;
export const WORKTREE_COLUMNS = { nodes: { area: 'TEXT' }, convo_nodes: { area: 'TEXT' } };

const areaRow = (r) => (r ? { wsKey: r.workspace_key, wt: r.wt_key, path: r.path, branch: r.branch ?? null, x: r.x, y: r.y, createdAt: r.created_at, movedAt: r.moved_at ?? null } : null);

export function installWorktrees(Store) {
  Object.assign(Store.prototype, {
    worktreeAreas() { return this.st('SELECT * FROM worktree_areas ORDER BY created_at, wt_key').all().map(areaRow); },
    putWorktreeArea(a) {
      this.st(`INSERT INTO worktree_areas (workspace_key, wt_key, path, branch, x, y, created_at, moved_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(workspace_key, wt_key) DO UPDATE SET path = excluded.path, branch = excluded.branch, x = excluded.x, y = excluded.y, moved_at = COALESCE(excluded.moved_at, worktree_areas.moved_at)`)
        .run(a.wsKey, a.wt, a.path, a.branch ?? null, Math.round(a.x), Math.round(a.y), a.createdAt || Date.now(), a.movedAt ?? null);
    },
    deleteWorktreeArea(wsKey, wt) { this.st('DELETE FROM worktree_areas WHERE workspace_key = ? AND wt_key = ?').run(wsKey, wt); },
    setNodeArea(sessionId, area) { this.st('UPDATE nodes SET area = ? WHERE session_id = ?').run(area || '', sessionId); },
    setConvoNodeArea(convId, area) { this.st('UPDATE convo_nodes SET area = ? WHERE convo_id = ?').run(area || '', String(convId).toLowerCase()); },
  });
}
