// 저장소(store.mjs)의 P8 열(ARCH 4절 K): 판의 명령(atrium child)으로 만든 하위 세션의 기록.
// store.mjs가 이 파일을 불러 열을 만들고 Store에 메서드를 붙인다. 저장소 모듈의 일부라 SQL은 store.mjs와 이 파일에만 둔다(ARCH 5절 "저장소").
// sessions.branch(JSON): { role, depth, by(부모 세션 ID), at, worktree, kind, inherited, via }. 부모는 P4의 parent_session_id 그대로다.
// 옮기기: P7까지의 board.db에는 이 열이 ALTER TABLE로 빈 채 더해진다(store.mjs의 ADDED_COLUMNS와 같은 방법). 그 전의 세션은 하위 세션이 아니다.
// 판에 올린 에이전트(F3)의 parent_session_id는 그대로 두고, 깊이를 셀 때만 같이 따라간다. backend/test/p8.test.mjs가 P7 모양의 board.db로 확인한다.

export const BRANCH_COLUMNS = { sessions: { branch: 'TEXT' } };

const P = (s) => { if (s == null) return null; try { return JSON.parse(s); } catch { return null; } };

export function installBranch(Store) {
  Object.assign(Store.prototype, {
    setBranch(sessionId, info) { this.st('UPDATE sessions SET branch = ? WHERE session_id = ?').run(info == null ? null : JSON.stringify(info), sessionId); },
    // 세션마다 부모와 하위 세션 기록(닫힌 세션 포함). 깊이와 자손을 셀 때 닫힌 중간 세션도 따라가야 한다
    branchRows() {
      return this.st('SELECT session_id, name, parent_session_id, branch, closed_at, origin FROM sessions').all()
        .map((r) => ({ sessionId: r.session_id, name: r.name, parentSessionId: r.parent_session_id ?? null, branch: P(r.branch), closedAt: r.closed_at ?? null, origin: r.origin || 'board' }));
    },
  });
}
