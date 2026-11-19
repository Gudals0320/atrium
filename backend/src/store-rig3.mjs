// P241: rig 3 저장(세션이 맡은 역할). 역할의 장부는 rig_events(rig-ledger.mjs rigEvent), 정의 버전은 rig 2와 같은 rig_versions를 쓴다.
// sessions.rig_role: 판이 rig 3 역할을 위해 띄운 세션의 역할 이름(판이 다시 떠도 역할 세션을 알아본다)
export const RIG3_COLUMNS = { sessions: { rig_role: 'TEXT' } };
export function installRig3(Store) {
  Object.assign(Store.prototype, {
    setSessionRole(sessionId, role) { this.st('UPDATE sessions SET rig_role = ? WHERE session_id = ?').run(role || null, sessionId); },
  });
}
