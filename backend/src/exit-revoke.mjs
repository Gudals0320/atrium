// P378: 잘못 끝남(exited)으로 둔 세션을 되살린다.
// 판은 터미널의 놓임(agent_released)으로 끝남을 정한다. 그 판정이 틀렸는데(신뢰 질문 단계의 상태 지움 등) 같은 세션의 hook(SessionEnd 밖)이나
// 터미널의 working이 오면, 터미널에 그 종류의 에이전트가 정말 있는지 보고 살아 있는 상태로 되돌린다. 그때 이미 나간 끝남 알림(일 멈춤, 휴대폰 알림)은
// 이벤트(exit_revoked)에 적는다. 판이 끈 것(requested·normal), 터미널 서버가 꺼진 것(terminal_stopped, 판이 되살린다), SessionEnd가 온 끝남은 그대로다.
import { applyExitRevoked, applyTermStatus } from './state.mjs';

export function revocable(s) {
  const rt = s && s.rt;
  const x = rt && rt.exit;
  if (!x || rt.sleep || rt.move || rt.boardExit || rt.exitRequested || rt.sessionEnd) return false;
  return !x.requested && x.kind !== 'terminal_stopped' && x.kind !== 'normal';
}

// 끝남 뒤에 나간 알림: 일 멈춤(unit_stop exited, 위 세션에게 간 알림), 휴대폰 알림(끝남 other는 알림 종류 exit, 알림을 켠 기기가 있을 때)
export function exitNotices(b, s, was) {
  const out = [];
  let evs = [];
  try { evs = b.store.events({ sessionId: s.sessionId, since: was.at || 0, limit: 500 }); } catch {}
  for (const e of evs) if (e.kind === 'unit_stop' && e.data && e.data.why === 'exited') out.push({ kind: 'unit_stop', unitId: e.data.unitId ?? null, tryId: e.data.tryId ?? null });
  let devices = 0;
  try { const p = b.web && b.web.push; devices = p && typeof p.records === 'function' ? p.records().filter((r) => r.endpoint).length : 0; } catch {}
  if (was.kind === 'other' && devices) out.push({ kind: 'push', devices });
  return out;
}

// by: 'hook:<이름>' | 'term:working'. 되살렸으면 true
export async function revokeExit(b, s, by) {
  if (!revocable(s) || s._revoking || !s.paneId || (b.killing && b.killing.has(s.sessionId))) return false;
  s._revoking = true;
  try {
    let a = null;
    try { a = await b.adapter.getAgent(s.paneId); } catch {}
    const alive = !!(a && a.paneId === s.paneId && (!a.agent || !s.kind || a.agent === s.kind) && a.status && a.status !== 'unknown');
    if (!alive || !b.sessions.has(s.sessionId) || !revocable(s)) {
      b.store.addEvent(s.sessionId, 'exit_revoke_skipped', { by, agent: a ? a.agent || null : null, status: a ? a.status || null : null });
      return false;
    }
    const now = Date.now();
    const was = applyExitRevoked(s.rt, now);
    if (!s.rt.term.status || s.rt.term.status === 'unknown') applyTermStatus(s.rt, a.status, now);
    const notices = exitNotices(b, s, was);
    b.store.addEvent(s.sessionId, 'exit_revoked', { by, exit: was, agent: a.agent || null, status: a.status, notices });
    b.log(`${s.name} was marked exited (${was.kind}) but its agent is alive (${by}): back to live${notices.length ? `; notices already sent: ${notices.map((n) => n.kind).join(', ')}` : ''}`);
    try { b.store.saveRuntime(s.sessionId, s.rt); } catch {}
    b.broadcastSession(s, { cause: `exit_revoked:${by}` });
    return true;
  } finally { s._revoking = false; }
}
