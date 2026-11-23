// P294: 위 알약 두 무리의 접기 단계. 왼쪽 무리(사람이 볼 것)가 넓어도 오른쪽 무리(상태)를 덮지 않게 한다.
// 'full'    = 모두 글과 수
// 'compact' = 왼쪽 알약은 수만(글은 title에)
// 'tight'   = 오른쪽 알약의 흐린 글(메모리 등)도 숨긴다
// 'stack'   = 그래도 모자라면(사이드바를 연 좁은 창 등) 왼쪽 무리를 오른쪽 무리 아래 줄로 내린다(접은 모양 그대로)
// 잰 폭(px)이 아직 없으면(null) 그 단계를 먼저 그려 재게 한다: 펼친 폭을 모르면 'full', 펼쳐서 안 들어가고 접은 폭을 모르면 'compact',
// 접어서도 안 들어가고 오른쪽을 접은 폭을 모르면 'tight'.
// win: 창 폭, left: 왼쪽 무리의 왼쪽 끝(왼쪽 레일 자리), right: 오른쪽 무리 오른쪽 여백, gap: 두 무리 사이 최소 틈
// P302: 위 왼쪽 차례는 세션 · 작업 중 · 작업 완료 · 할 일(사용자 요청, P305 전 이름 내 몫), 그 뒤에 응답 필요 · 문제(사람이 답할 일을 놓치지 않게 남긴다)
export const PEOPLE_PILLS = ['sessions-pill', 'working', 'review', 'decisions', 'inbox', 'problems']; // 위 왼쪽(data-role)
export const STATUS_PILLS = ['conn', 'devices', 'resources', 'usage', 'changes', 'settings-open']; // 위 오른쪽(data-role 또는 data-action)

// P302: 위 왼쪽 알약 → 보일지. 세션은 늘 보이고, 나머지는 0이면 숨긴다(값이 생기면 나타난다, P214).
// 할 일은 지금 카드가 없어도 붙잡은 답이 있으면 흐리게 남는다(P295, total). n: { sessions, working, review, decisions, decisionsTotal, inbox, problems }
export function peoplePills(n = {}) {
  const num = (k) => Math.max(0, Number(n[k]) || 0);
  return PEOPLE_PILLS.map((role) => {
    if (role === 'sessions-pill') return { role, n: num('sessions'), show: true };
    if (role === 'decisions') { const total = Math.max(num('decisions'), num('decisionsTotal')); return { role, n: num('decisions'), show: total > 0 }; }
    return { role, n: num(role), show: num(role) > 0 };
  });
}

// P323: 위 알약 무리의 크기 지켜보기. 렌더마다 ResizeObserver를 새로 걸면 observe하는 순간 알림이 와서
// 렌더 → observe → 알림 → 다시 렌더 고리가 끝없이 돌았다(P319: 가만히 초당 ~170커밋). 그래서 관찰자는 하나만 두고,
// 새로 생긴 원소만 observe하며(빠진 원소는 놓는다), 처음 알림은 폭만 적어 두고 폭이 정말 바뀐 때만 kick(다시 재기)한다.
// ro: { observe(el), unobserve(el) }, kick: 다시 재라는 콜백
export function fitWatch(ro, kick) {
  const seen = new Map(); // 원소 → 마지막으로 본 폭(px, 반올림). undefined면 아직 알림 전
  return {
    sync(els) {
      const want = new Set(els.filter(Boolean));
      for (const el of [...seen.keys()]) if (!want.has(el)) { ro.unobserve(el); seen.delete(el); }
      for (const el of want) if (!seen.has(el)) { seen.set(el, undefined); ro.observe(el); }
    },
    onResize(entries) {
      let changed = false;
      for (const e of entries) {
        if (!seen.has(e.target)) continue;
        const w = Math.round((e.contentRect && e.contentRect.width) || 0);
        const prev = seen.get(e.target);
        seen.set(e.target, w);
        if (prev !== undefined && prev !== w) changed = true;
      }
      if (changed) kick();
      return changed;
    },
    size: () => seen.size,
  };
}

export function topFit({ win, left = 87, right = 15, gap = 16, fullL = null, compactL = null, fullR = null, compactR = null } = {}) {
  const room = (l, r) => left + l + gap + r + right <= win;
  if (fullL == null || fullR == null) return 'full';
  if (room(fullL, fullR)) return 'full';
  if (compactL == null) return 'compact';
  if (room(compactL, fullR)) return 'compact';
  if (compactR == null || room(compactL, compactR)) return 'tight';
  return 'stack';
}
