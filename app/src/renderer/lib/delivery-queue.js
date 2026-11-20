// P172: 전달 대기열 보이기(명령줄 위 칩, 휴대폰 세션 화면). 같은 받는 세션의 대기 글은 한 상자로 묶고 보낼 차례(seq)대로 늘어놓는다.
// 묶음이 없는 전달(바로 들어간 것, 끝난 것)은 전처럼 칩 하나씩. 순서 바꾸기(moveOrder)와 바로 보내기 단추의 켜짐·까닭(steerOf)도 여기서 정한다

export const FINAL = new Set(['confirmed', 'unconfirmed', 'failed', 'cancelled']);
export const ord = (d) => d.seq ?? d.createdAt ?? 0;

// 보일 전달. 아직 가는 중인 것은 늘, 끝난 것은 잠깐만(doneMs, 실패는 failedMs).
// → { groups: [{ sessionId, name, items, queued }], chips: [전달] }. groups는 대기 중(queued) 전달이 있는 세션마다 하나(먼저 넣은 묶음이 위),
//   items는 그 세션의 끝나지 않은 전달(보내는 중·보낸 것이 앞, 그 뒤 대기 차례), queued는 그중 대기 중 수
export function queueView(list, { now = Date.now(), doneMs = 6000, failedMs = 30000, limit = 6 } = {}) {
  const all = [...list];
  const open = all.filter((d) => !FINAL.has(d.status));
  const bySession = new Map();
  for (const d of open) { if (!bySession.has(d.sessionId)) bySession.set(d.sessionId, []); bySession.get(d.sessionId).push(d); }
  const groups = [];
  for (const [sessionId, items] of bySession) {
    const queued = items.filter((d) => d.status === 'queued').length;
    if (!queued) continue;
    items.sort((a, b) => ord(a) - ord(b));
    groups.push({ sessionId, name: items.find((d) => d.name)?.name || null, items, queued, first: Math.min(...items.map((d) => d.createdAt ?? ord(d))) });
  }
  groups.sort((a, b) => a.first - b.first);
  const inGroup = new Set(groups.flatMap((g) => g.items.map((d) => d.deliveryId)));
  const chips = all.filter((d) => !inGroup.has(d.deliveryId) && (!FINAL.has(d.status) || (d._at && now - d._at < (d.status === 'failed' || d.status === 'unconfirmed' ? failedMs : doneMs)))).slice(-limit).reverse();
  return { groups, chips };
}

// 묶음 안 대기 글 하나를 dir(-1 위, +1 아래)만큼 옮긴 대기 글 차례(ids). 옮길 수 없으면(맨 끝, 대기 글이 아님) null
export function moveOrder(items, id, dir) {
  const ids = items.filter((d) => d.status === 'queued').map((d) => d.deliveryId);
  const i = ids.indexOf(id), j = i + dir;
  if (i < 0 || j < 0 || j >= ids.length) return null;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  return ids;
}

// 바로 보내기 단추. 받는 세션 상태와 종류로 → { ok, key }(key: 풀이 사전 열쇠 deliveryQueue.now_<key>).
//   steer: 일하는 판의 Claude Code(hook 있음) → 입력 칸에 넣어 대기 메시지(스티어링)로. P271: 일하는 Codex → 입력 칸에 넣고 Enter(지금 턴에 끼워 넣는다).
//   일하는 다른 종류(opencode 등, hook 없는 Claude Code)는 입력을 받지 못해 끈다(kindBusy).
//   wake: 잠든 세션은 깨운 뒤 맨 먼저. afterBlock: 질문·시작 화면 중이면 그것이 끝나면 맨 먼저. now: 쉬는 중이면 곧바로
export function steerOf(s) {
  if (!s) return { ok: false, key: 'gone' };
  if (s.state === 'working') {
    const kind = s.kind || 'claude';
    return (kind === 'claude' && s.hooked !== false) || kind === 'codex' ? { ok: true, key: 'steer' } : { ok: false, key: 'kindBusy' };
  }
  if (s.state === 'sleeping') return { ok: true, key: 'wake' };
  if (s.state === 'waiting' || s.state === 'trust_wait' || s.state === 'starting') return { ok: true, key: 'afterBlock' };
  return { ok: true, key: 'now' };
}
