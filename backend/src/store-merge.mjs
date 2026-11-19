// 저장소(store.mjs)의 P37 메서드: 워크스페이스 키 옮기기(폴더 워크스페이스가 저장소가 되면 합치기). 새 표는 없다.
// store.mjs가 이 파일을 불러 Store에 메서드를 붙인다. 저장소 모듈의 일부라 SQL은 store*.mjs에만 둔다(ARCH 5절 "저장소").
// 무엇을 옮기는지와 줄을 어떻게 합치는지는 workspace-merge.mjs(순수 함수 rekeyBoard, mergedWorkspaceRow)와 같다.
import { mergedWorkspaceRow, rekeyKey, rekeyList } from './workspace-merge.mjs';

export function installMerge(Store) {
  Object.assign(Store.prototype, {
    // from 키의 워크스페이스를 ws({ key, kind, root })로 옮긴다. 한 트랜잭션. 옮긴 수를 돌려준다. from 줄이 없으면 null(여러 번 불러도 같다)
    // - 세션 행(닫힌 세션도), 덩어리, 메모, 칸반, 대화 노드의 workspace_key. 노드 자리와 area는 그대로
    // - 워크트리 상자 자리: 저장소로 가면 함께(대상에 같은 상자가 있으면 대상 것), 폴더로 가면 지운다
    // - 워크스페이스 줄: 대상 줄이 없으면 옛 줄의 자리·순서·뷰포트로 새로 만들고, 있으면 합친다. 옛 줄은 지운다
    // - meta: 지금 워크스페이스, 저절로 열지 않을 목록. 영역 정리 되돌리기(arrangeUndo:<키>)는 둘 다 지운다(안의 것이 바뀌었다)
    rekeyWorkspace(from, ws) {
      const fromRow = this.getWorkspace(from);
      if (!fromRow || from === ws.key) return null;
      const toRow = this.getWorkspace(ws.key);
      const row = mergedWorkspaceRow(fromRow, toRow, ws);
      const n = {};
      const rigFrom = this.st('SELECT rig_enabled, rig_enabled_at FROM workspaces WHERE workspace_key = ?').get(from); // P195: 옛 줄을 지우기 전에 읽는다
      const upd = (table) => { n[table] = Number(this.db.prepare(`UPDATE ${table} SET workspace_key = ? WHERE workspace_key = ?`).run(ws.key, from).changes); };
      this.tx(() => {
        if (toRow) {
          this.st('UPDATE workspaces SET kind = ?, root = ?, x = ?, y = ?, viewport = ?, created_at = ?, auto_opened = ?, updated_at = ? WHERE workspace_key = ?')
            .run(row.kind, row.root, row.x, row.y, row.viewport ? JSON.stringify(row.viewport) : null, row.createdAt, row.auto ? 1 : null, Date.now(), ws.key);
        } else {
          this.st('INSERT INTO workspaces (workspace_key, kind, root, viewport, created_at, updated_at, x, y, auto_opened) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
            .run(row.key, row.kind, row.root, row.viewport ? JSON.stringify(row.viewport) : null, row.createdAt, Date.now(), row.x, row.y, row.auto ? 1 : null);
        }
        // P195: rig 켜짐도 새 줄로. 대상 줄이 이미 켜져 있으면 대상 것을 둔다
        if (rigFrom) {
          const rigTo = toRow ? this.st('SELECT rig_enabled, rig_enabled_at FROM workspaces WHERE workspace_key = ?').get(ws.key) : null;
          const on = (rigTo && rigTo.rig_enabled) ? rigTo : rigFrom.rig_enabled ? rigFrom : rigTo || rigFrom;
          this.st('UPDATE workspaces SET rig_enabled = ?, rig_enabled_at = ? WHERE workspace_key = ?').run(on.rig_enabled ?? null, on.rig_enabled_at ?? null, ws.key);
        }
        for (const t of ['sessions', 'docks', 'memos', 'kanbans', 'convo_nodes']) upd(t);
        if (ws.kind === 'repo') n.worktree_areas = Number(this.st('UPDATE OR IGNORE worktree_areas SET workspace_key = ? WHERE workspace_key = ?').run(ws.key, from).changes);
        this.st('DELETE FROM worktree_areas WHERE workspace_key = ?').run(from);
        this.st('DELETE FROM workspaces WHERE workspace_key = ?').run(from);
        const cur = this.getMeta('currentWorkspace');
        if (cur === from) this.setMeta('currentWorkspace', rekeyKey(cur, from, ws.key));
        const declined = this.getMeta('autoOpenDeclined');
        if (Array.isArray(declined) && declined.includes(from)) this.setMeta('autoOpenDeclined', rekeyList(declined, from, ws.key).filter((k) => k !== ws.key));
        for (const k of [from, ws.key]) if (this.getMeta(`arrangeUndo:${k}`)) this.setMeta(`arrangeUndo:${k}`, null);
        n.rig = this.rekeyRigRows(from, ws.key, !!toRow);
      });
      return { from, to: ws.key, merged: !!toRow, ...n };
    },
    // P195: rig 표의 workspace_key를 옮긴다(rekeyWorkspace의 트랜잭션 안에서 부른다). P249: 옛 rig 표는 옮기지 않는다(쓰지 않는다)
    // - 판(rig_versions): 대상에 판이 있으면 옮겨 오는 번호를 대상 마지막 번호 뒤로 민다(장부의 def_n도 함께). 내용 파일 경로는 Rig.rekey가 고친다
    rekeyRigRows(from, to, merged = true) {
      const n = {};
      const run = (k, sql, ...a) => { n[k] = (n[k] || 0) + Number(this.db.prepare(sql).run(...a).changes); };
      const off = merged ? Number(this.st('SELECT COALESCE(MAX(n), 0) AS n FROM rig_versions WHERE workspace_key = ?').get(to).n) : 0;
      if (off) {
        run('rig_events_def', 'UPDATE rig_events SET def_n = def_n + ? WHERE ws = ? AND def_n IS NOT NULL', off, from); // P217: 장부의 판 번호도 민다
        // 번호를 미는 동안 PK가 겹치지 않게 음수로 한 번 거친다
        run('rig_versions_tmp', 'UPDATE rig_versions SET n = -(n + ?) WHERE workspace_key = ?', off, from);
        run('rig_versions', 'UPDATE rig_versions SET workspace_key = ?, n = -n WHERE workspace_key = ?', to, from);
        delete n.rig_versions_tmp;
      } else run('rig_versions', 'UPDATE OR IGNORE rig_versions SET workspace_key = ? WHERE workspace_key = ?', to, from);
      run('tool_runs', 'UPDATE tool_runs SET workspace_key = ? WHERE workspace_key = ?', to, from);
      run('rig_events', 'UPDATE rig_events SET ws = ? WHERE ws = ?', to, from); // P217: 장부
      this.st('DELETE FROM rig_versions WHERE workspace_key = ?').run(from);
      return n;
    },
    // P195: 버전 내용 파일 경로의 폴더 앞부분을 바꾼다(Rig.rekey가 rigs/<옛 폴더>/를 옮긴 뒤)
    retargetRigVersionFiles(key, fromPrefix, toPrefix) {
      return Number(this.st("UPDATE rig_versions SET file = ? || substr(file, ?) WHERE workspace_key = ? AND file LIKE ? ESCAPE '\\'").run(toPrefix, fromPrefix.length + 1, key, fromPrefix.replace(/[\\%_]/g, (c) => `\\${c}`) + '%').changes);
    },
  });
}
