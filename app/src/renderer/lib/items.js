// P6c 창 쪽 순수 규칙: 메모·칸반 노드의 워크스페이스 소속(놓은 자리), 루프 배지 글, Thread 결과 글(미션 맵 배치는 P32부터 lib/mission-layout.js). 단위 시험이 있다(test/p6c-lib.test.mjs).
import { t as tr } from './i18n.js';

// 열쇠 → 글(P16). 객체처럼 읽되 그때의 언어로 돌려준다(LOOP_STATUS[l.status])
const labelMap = (ns, keys) => new Proxy({}, {
  get: (_, k) => (typeof k === 'string' && keys.includes(k) ? tr(`${ns}.${k}`) : undefined),
  has: (_, k) => keys.includes(k),
  ownKeys: () => keys,
  getOwnPropertyDescriptor: (_, k) => (keys.includes(k) ? { enumerable: true, configurable: true, value: tr(`${ns}.${k}`) } : undefined),
});

// 놓은 노드의 워크스페이스. regions: Map key → 영역(그 노드를 빼고 계산한 것).
// 가운데가 든 영역. 없으면 margin 안으로 가장 가까운 영역(영역은 안의 노드를 바짝 감싸 빈 안쪽이 거의 없으므로, 영역 바로 옆에 놓아도 그 소속으로 본다). 둘 다 없으면 null
export function wsAt(rect, regions, margin = 0) {
  const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
  let best = null;
  for (const [key, r] of regions) {
    const inside = cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h;
    const gap = Math.max(0, r.x - (rect.x + rect.w), rect.x - (r.x + r.w), r.y - (rect.y + rect.h), rect.y - (r.y + r.h)); // 사각형 사이 거리(겹치면 0)
    if (!inside && gap > margin) continue;
    const score = inside ? -1 / (r.w * r.h) : gap; // 가운데가 든 영역이 먼저(겹치면 작은 영역), 그다음 가까운 영역
    if (!best || score < best.score) best = { key, score };
  }
  return best ? best.key : null;
}

// 시간(밀리초) → "1분 5초", "2시간 3분"
export function dur(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return tr('time.s', { s });
  const m = Math.floor(s / 60);
  if (m < 60) return s % 60 ? tr('time.ms', { m, s: s % 60 }) : tr('items.durM', { m });
  return m % 60 ? tr('time.hm', { h: Math.floor(m / 60), m: m % 60 }) : tr('items.durH', { h: Math.floor(m / 60) });
}

export const LOOP_STATUS = labelMap('loops.status', ['active', 'paused', 'done', 'stopped']);
export const STOP_REASON = labelMap('loops.stopReason', ['max_runs', 'max_time', 'goal_text', 'session_closed']);

export function triggerText(t) {
  if (!t) return '';
  if (t.type === 'interval') return tr(t.immediate === false ? 'loops.trigEvery' : 'loops.trigEveryNow', { d: dur(t.everyMs) });
  if (t.type === 'idle') return tr('loops.trigIdle');
  if (t.type === 'text') return tr('loops.trigText', { where: tr(t.source === 'screen' ? 'loops.srcScreen' : t.source === 'any' ? 'loops.srcAny' : 'loops.srcAnswer'), text: t.text });
  return t.type;
}
export function stopText(s) {
  const out = [];
  if (s && s.maxRuns) out.push(tr('loops.stopRuns', { n: s.maxRuns }));
  if (s && s.maxMs) out.push(tr('loops.stopTime', { d: dur(s.maxMs) }));
  if (s && s.untilText) out.push(tr('loops.stopUntil', { text: s.untilText }));
  return out.length ? out.join(' · ') : tr('loops.stopManual');
}

// 노드 배지 한 줄: 상태, 남은 횟수, 다음 시각. now를 받는다(시험)
export function loopBadge(l, now = Date.now()) {
  const parts = [];
  if (l.status === 'active') parts.push('⟳');
  else if (l.status === 'paused') parts.push('⏸');
  else parts.push('■');
  if (l.stop && l.stop.maxRuns) parts.push(tr('loops.badgeLeft', { n: Math.max(0, l.stop.maxRuns - (l.runs || 0)) }));
  else parts.push(tr('loops.badgeRuns', { n: l.runs || 0 }));
  if (l.status === 'active' && l.trigger && l.trigger.type === 'interval' && l.nextAt) parts.push(tr('loops.badgeNext', { d: dur(Math.max(0, l.nextAt - now)) }));
  else if (l.status === 'active' && l.trigger && l.trigger.type !== 'interval') parts.push(tr(l.trigger.type === 'idle' ? 'loops.badgeIdle' : 'loops.badgeText'));
  else if (l.status === 'paused' && l.trigger && l.trigger.type === 'interval') {
    // 멈춘 루프는 다음 차례까지 남은 시간을 기록(history의 paused)에 둔다
    const p = [...(l.history || [])].reverse().find((h) => h.kind === 'paused');
    if (p && p.nextInMs != null) parts.push(tr('loops.badgeResume', { d: dur(p.nextInMs) }));
  }
  return parts.join(' ');
}

// 이 세션을 대상으로 하는 루프. 끝난 것은 빼지 않는다(배지에서 고른다)
export function loopsOfSession(loops, sessionId) {
  return [...loops].filter((l) => (l.target.kind === 'session' && l.target.id === sessionId) || (l.targets || []).some((t) => t.sessionId === sessionId));
}

// Thread 결과 단계 글(thread.mjs resultPhase)
export const RESULT_PHASE = labelMap('items.resultPhase', ['delivering', 'running', 'done', 'failed', 'abandoned', 'cancelled']);
export const ITEM_PHASE = labelMap('items.itemPhase', ['active', 'done', 'partial', 'failed']);
export const SOURCE_LABEL = labelMap('items.source', ['bar', 'output', 'loop', 'atrium', 'mtask']);

// 미션 맵 배치는 lib/mission-layout.js(P32)
