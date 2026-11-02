// P6a: P5의 워크스페이스별 판을 캔버스 하나로 옮긴다(ARCH 4절 H1). 백엔드가 뜰 때마다 부르고, 이미 옮겼으면(meta canvas = single) 아무것도 하지 않는다.
// - P5는 워크스페이스마다 판이 따로라 노드 자리가 서로 겹친다. 워크스페이스마다 노드를 통째로 옮겨 영역이 겹치지 않게 늘어놓는다.
//   안의 상대 자리는 지킨다. 처음 생긴 워크스페이스는 제자리에 두고, 나머지는 그 옆(가로가 넓은 쪽)에 차례로 둔다.
// - 세션이 없는 워크스페이스는 빈 영역 자리를 정한다. 그룹은 P22에서 뺐다(옛 판의 그룹은 이보다 먼저 store.dropGroups가 지운다).
// - 뷰포트는 비운다. 창이 처음 열 때 모두 보이게 맞춘다.
import { regionRect, packRegions, newRegionSlot, EMPTY_REGION } from './canvas.mjs';

export function migrateSingleCanvas(store) {
  if (store.getMeta('canvas') === 'single') return null;
  const open = store.openSessions();
  const wsOf = new Map(open.map((s) => [s.sessionId, s.workspaceKey]));
  const nodes = store.nodes();
  const list = store.workspaces();
  const itemsOf = (key) => nodes.filter((n) => wsOf.get(n.session_id) === key);
  const blocks = list.map((w) => ({ key: w.key, rect: regionRect(itemsOf(w.key)) }));
  const shift = packRegions(blocks);
  let moved = 0;
  for (const n of nodes) {
    const d = shift.get(wsOf.get(n.session_id));
    if (!d || (!d.dx && !d.dy)) continue;
    store.setNode({ ...n, x: n.x + d.dx, y: n.y + d.dy });
    moved++;
  }
  // 영역 자리: 안이 있으면 옮긴 영역의 왼쪽 위, 비었으면 다른 영역과 겹치지 않는 곳
  const placed = [];
  for (const b of blocks) { if (!b.rect) continue; const d = shift.get(b.key); placed.push({ key: b.key, x: b.rect.x + d.dx, y: b.rect.y + d.dy, w: b.rect.w, h: b.rect.h }); }
  for (const p of placed) store.setWorkspaceAnchor(p.key, p.x, p.y);
  for (const b of blocks) {
    if (b.rect) continue;
    const at = newRegionSlot(placed, EMPTY_REGION);
    store.setWorkspaceAnchor(b.key, at.x, at.y);
    placed.push({ key: b.key, ...at, ...EMPTY_REGION });
  }
  store.setMeta('viewport', null);
  store.setMeta('canvas', 'single');
  return { workspaces: list.length, moved, shifts: Object.fromEntries([...shift].filter(([, d]) => d.dx || d.dy)) };
}
