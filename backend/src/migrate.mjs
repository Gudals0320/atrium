// P5: P4까지 쓰던 판(board.db)을 리포지토리 워크스페이스로 옮긴다(ARCH 4절 G1). 백엔드가 뜰 때마다 부르고, 옮길 것이 없으면 아무것도 하지 않는다.
// - 세션: 시작 폴더(sessions.cwd)의 워크스페이스. 노드 자리와 크기는 그대로 둔다(판이 워크스페이스마다 나뉘므로 겹치지 않는다)
// - 그룹은 P22에서 뺐다. 옛 판의 그룹은 이보다 먼저 store.dropGroups가 지운다
// - 연결(links)은 세션 ID 쌍이라 바꿀 것이 없다. 다른 워크스페이스로 가는 연결은 창이 노드 가장자리에 표시한다(G4)
// - 마지막에 본 워크스페이스가 없으면 세션이 가장 많은 워크스페이스로 정하고, 옛 판 하나의 뷰포트를 그 워크스페이스에 둔다
// resolve(cwd) → { key, kind, root }(git.mjs workspaceOf). 시험에서는 가짜를 넘긴다
export async function migrateWorkspaces(store, { resolve }) {
  const sessionKeys = new Map();
  const ensure = (ws, createdAt) => { if (!store.getWorkspace(ws.key)) store.insertWorkspace({ ...ws, createdAt }); };

  const rows = store.sessionsWithoutWorkspace();
  for (const r of rows) {
    const ws = await resolve(r.cwd);
    store.updateSession(r.sessionId, { workspaceKey: ws.key });
    sessionKeys.set(r.sessionId, ws.key);
    ensure(ws, r.createdAt); // 워크스페이스 줄의 순서는 처음 생긴 순서: 그 워크스페이스의 가장 오래된 세션 시각
  }
  // 키는 있는데 워크스페이스 줄이 없는 열린 세션(줄을 지운 뒤 남은 세션 등)은 줄을 다시 만든다
  const open = store.openSessions();
  for (const s of open) {
    if (!s.workspaceKey || store.getWorkspace(s.workspaceKey)) continue;
    const ws = await resolve(s.cwd);
    ensure(ws.key === s.workspaceKey ? ws : { key: s.workspaceKey, kind: ws.kind, root: ws.root }, s.createdAt);
  }

  const list = store.workspaces();
  let current = store.getMeta('currentWorkspace');
  if ((!current || !store.getWorkspace(current)) && list.length) {
    const n = new Map();
    for (const s of store.openSessions()) n.set(s.workspaceKey, (n.get(s.workspaceKey) || 0) + 1);
    current = [...list].sort((a, b) => (n.get(b.key) || 0) - (n.get(a.key) || 0))[0].key; // 같으면 먼저 생긴 쪽
    store.setMeta('currentWorkspace', current);
  }
  const vp = store.getMeta('viewport');
  if (rows.length && vp && current && !store.getWorkspace(current).viewport) store.setWorkspaceViewport(current, vp);
  return { sessions: rows.length, sessionKeys, report: { sessions: rows.length, workspaces: list.map((w) => w.key), current } };
}
