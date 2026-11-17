// P186: 하네스 4단계 — 세션 맵에 rig의 자리, 흐름 줄, 건 목록(docs research harness-arch.md 14절 "4단계: 세션 맵"). 순수 함수만 둔다(단위 시험 test/p186-lib.test.mjs).
// 그래프 모양은 판 mission.graph의 rig 칸(backend rig-flow.mjs graph): { <워크스페이스 키>: { seats, flow, manager, results, cases } }, 세션 노드의 rigSeat.
// - 자리 이름표: 켜진 rig의 정의에 있는 자리에 앉은 세션만(rigIndex). rig가 없는 판은 빈 표라 맵이 전과 같다.
// - P198: 자리 세션의 얇은 줄과 흐름 줄(P186 seatThin·seatReps·flowLines·flowPaths)은 rig 띠(lib/rig-band.js, 17절)가 대신한다.
// - 건 목록: 열린 건 · blocked 건 · 최근 끝난 건(caseGroups). P198: 누르면 그 건의 띠 행 머리로(row), go는 지금 일이 있는 카드(휴대폰 알약·강조).

// 정의 자리 이름 → 자리 정보(keep·fresh 등)
const seatDefOf = (R, name) => ((R && R.seats) || []).find((x) => x.name === name) || null;

// 그래프 → { byNode: Map(노드 id → { ws, seat, mode: 'keep'|'fresh', busy }), rigs: Map(워크스페이스 키 → R) }
export function rigIndex(graph) {
  const byNode = new Map(), rigs = new Map();
  const rig = (graph && graph.rig) || {};
  for (const [k, R] of Object.entries(rig)) if (R && Array.isArray(R.seats) && R.seats.length) rigs.set(k, R);
  if (!rigs.size) return { byNode, rigs };
  const busyOf = new Map();
  for (const R of rigs.values()) for (const s of R.seats) for (const x of s.sessions || []) busyOf.set(x.sessionId, !!x.busy);
  for (const n of (graph.nodes || [])) {
    if (!n || n.kind !== 'session' || !n.rigSeat) continue;
    const ws = n.workspaceKey || '';
    const R = rigs.get(ws), d = R && seatDefOf(R, n.rigSeat);
    if (!d) continue; // rig가 꺼졌거나 정의에 없는 자리: 이름표 없음
    byNode.set(n.id, { ws, seat: n.rigSeat, mode: d.session === 'keep' ? 'keep' : 'fresh', busy: busyOf.has(n.sessionId) ? busyOf.get(n.sessionId) : false });
  }
  return { byNode, rigs };
}

// 자리 이름표 글(카드에 작게): { seat, mode }
export const seatTag = (info) => (info ? { seat: info.seat, mode: info.mode } : null);

// 건 목록 묶음(요약 열): 열린 건 · blocked 건 · 최근 끝난 건(done·cancelled). rig가 없는 판은 null.
// nodeOf(ws, sessionId) → 노드 id | null, repOf(ws, seat) → 노드 id | null(keep 자리의 머리 카드)
// 건마다 { id, ws, row(띠 행 열쇠 `${ws}|${id}`), state, owner, seats(일이 있는 자리), handoffs, reason, go(지금 일이 있는 카드), at }
export function caseGroups(graph, nodeOf = () => null, repOf = () => null) {
  const rig = (graph && graph.rig) || {};
  const all = [];
  for (const [ws, R] of Object.entries(rig)) {
    for (const c of (R && R.cases) || []) {
      const open = (c.units || []).filter((u) => u.status === 'open');
      // 갈 카드: 열린 일을 받은 세션(가장 늦은 일) → 일이 줄에 서 있으면 그 자리의 대표 → 건 주인
      let go = null;
      for (let i = open.length - 1; i >= 0 && !go; i--) if (open[i].sessionId && !open[i].queued) go = nodeOf(ws, open[i].sessionId);
      for (let i = open.length - 1; i >= 0 && !go; i--) if (open[i].seat) go = repOf(ws, open[i].seat);
      if (!go) go = nodeOf(ws, c.ownerSessionId);
      all.push({ id: c.id, ws, row: `${ws}|${c.id}`, cycle: c.cycle != null, state: c.state, owner: c.owner, seats: c.activeSeats || [], handoffs: c.handoffs || 0, reason: c.blockedReason || null, go, at: c.closedAt || c.createdAt || 0, lines: c.lines || [] });
    }
  }
  if (!Object.keys(rig).length) return null;
  const by = (a, b) => b.at - a.at;
  return {
    open: all.filter((c) => c.state === 'open' || c.state === 'waiting_owner').sort(by), // P194: waiting_owner(상한을 넘어 주인에게 보고로 올라감)도 끝나지 않은 건
    blocked: all.filter((c) => c.state === 'blocked').sort(by),
    done: all.filter((c) => c.state === 'done' || c.state === 'cancelled').sort(by).slice(0, 5),
    total: all.length,
  };
}

// 노드 메뉴 "자리 정하기": 켜진 rig(rig.status state on)에 자리가 있는 워크스페이스의 에이전트 세션만, 이 PC의 창만(원격 기기에는 없다).
// status: rig.status 답, s: 세션 요약(sessionId, kind, rigSeat, workspaceKey), others: 같은 판의 세션들(keep 자리를 다른 세션이 쥐었나)
// → null | { current, seats: [{ name, mode, current, taken(다른 세션 이름) }], clear(뗄 수 있나) }
export function seatMenu(status, s, others = [], { remote = false } = {}) {
  if (remote || !status || !s || status.state !== 'on' || !Array.isArray(status.seats) || !status.seats.length) return null;
  if ((s.kind || 'claude') === 'shell') return null;
  const current = s.rigSeat || null;
  return {
    current,
    seats: status.seats.map((x) => {
      const holder = x.session === 'keep' ? others.find((o) => o.sessionId !== s.sessionId && o.rigSeat === x.name && (o.workspaceKey || '') === (s.workspaceKey || '') && o.state !== 'exited') : null;
      return { name: x.name, mode: x.session === 'keep' ? 'keep' : 'fresh', current: current === x.name, taken: holder ? holder.name : null };
    }),
    clear: !!current,
  };
}

// 미리 보기의 rig 줄(판 API rig.recent 답): 최근 훅 판정과 도구 실행을 시각 차례로 섞어 n줄.
// → [{ kind: 'hook'|'tool', at, text, sub, bad(거절·실패) }]
export function recentLines(rec, n = 5) {
  if (!rec) return [];
  const hooks = (rec.hooks || []).map((h) => ({ kind: 'hook', at: h.t || 0, text: `${h.at} · ${h.decision}`, sub: h.reason || h.error || h.note || h.run || '', bad: ['reject', 'blocked', 'failed'].includes(h.decision) }));
  const tools = (rec.tools || []).map((x) => ({ kind: 'tool', at: x.endedAt || x.startedAt || 0, text: `${x.tool} · ${x.status}${x.exitCode != null ? ` (${x.exitCode})` : ''}`, sub: x.error || (x.args || []).join(' '), bad: x.status === 'failed' || x.status === 'lost' || (x.exitCode != null && x.exitCode !== 0) }));
  return [...hooks, ...tools].sort((a, b) => b.at - a.at).slice(0, n);
}
