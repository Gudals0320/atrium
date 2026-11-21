// P306: 사람이 레인을 바꾸면(체크·풀기·focus·항목·측정값 지금·마일스톤 끝내기·관리자·상태) 그 레인의 관리자에게 알린다(설계 experiments/p301/p301-design.md 5절, v2 7절).
// - 꼴: "[목표] <레인> <바뀜, 바뀜…>(사용자) · <focus> <체크>/<전체>". 레인마다 한 줄, 여러 레인이면 여러 줄을 한 덩어리로.
// - 보내는 때(판 설정 planNotify): next(기본, 다음 메시지와 = P295 실어 보내기), now(곧바로, 2초 안의 바뀜은 한 글로), off(알리지 않음).
//   next일 때도 마일스톤의 모든 항목이 이번에 체크되면(끝 기준 확인 차례) 그 관리자에게 모인 줄을 곧바로 한 번 보낸다.
// - 실어 보내기: 전달 대기열이 관리자에게 어떤 글이든 처음 보낼 때(decisions.mjs attachFront), 명령 바 글 앞(backend.mjs send)에 모인 줄을 붙인다.
//   실어 보낸 전달이 실패·취소되면 줄을 다시 붙잡는다.
// - 관리자가 없거나 닫혔으면 알리지 않는다(모인 줄도 버린다). 미루기(snooze)는 사람 자기 몫이라 알리지 않는다.
// - 모인 줄은 백엔드 메모리에만 둔다(백엔드를 다시 켜면 버린다. 레인의 바뀜 기록 plan_log와 atrium plan show의 "남이 바꾼 것"은 그대로).
import { planSummary } from './plan.mjs';

export const PLAN_NOTIFY = ['next', 'now', 'off'];
export const PLAN_NOTE_HEAD = '[목표]';
export const NOW_DEBOUNCE_MS = 2000;
const QUIET_OPS = new Set(['snooze']); // 알리지 않는 사람 연산

// 기록 한 줄(plan_log summary) → 알림 조각. 사람 표시는 줄 끝에 한 번
export function changeBit(l) { return String((l && l.summary) || '').replace(/\s+/g, ' ').trim(); }
// 이번 바뀜에서 새로 "모두 체크됨"이 된 마일스톤 코드들(전에는 아니었고 지금은 모두 체크)
export function newlyAllChecked(beforeDoc, afterDoc, now = Date.now()) {
  const b = planSummary(beforeDoc, now), a = planSummary(afterDoc, now);
  if (!a) return [];
  const was = new Map((b ? b.milestones : []).map((m) => [m.code, m.allChecked]));
  return a.milestones.filter((m) => m.allChecked && !was.get(m.code)).map((m) => m.code);
}
// 레인 한 줄: { name, bits: [...], focus: { code, done, total } | null } → "[목표] 수집 M2.4 체크, M2.6 체크(사용자) · M2 4/7"
export function noteLine({ name, bits, focus }) {
  const uniq = [...new Set((bits || []).filter(Boolean))];
  const tail = focus ? ' · ' + focus.code + ' ' + focus.done + '/' + focus.total : '';
  return PLAN_NOTE_HEAD + ' ' + name + ' ' + (uniq.length ? uniq.join(', ') : '바뀜') + '(사용자)' + tail;
}

export class PlanNotes {
  // b: 백엔드(sessions, store, queue, features?, log). opts: { mode?: () => 'next'|'now'|'off', now? }
  constructor(b, { mode = null, now = null, debounceMs = NOW_DEBOUNCE_MS } = {}) {
    this.b = b; this.modeFn = mode; this.now = now || (() => Date.now()); this.debounceMs = debounceMs;
    this.pending = new Map(); // 관리자 세션 ID → Map(planId → { bits: [] })
    this.timers = new Map(); // 관리자 세션 ID → 곧바로 보내기 타이머
    this.rides = new Map(); // 전달 ID → { sessionId, pend: Map }(실패·취소되면 되돌린다)
    this.wireQueue(b.queue);
  }
  wireQueue(q) {
    if (!q || typeof q.on !== 'function' || this.wiredQueue === q) return;
    this.wiredQueue = q;
    q.on('delivery', (e) => { try { this.onDelivery(e); } catch (err) { this.b.log && this.b.log('plan note ride error', err && err.stack); } });
  }
  mode() {
    if (this.modeFn) return this.modeFn();
    try { const f = this.b.features; const v = f && f.settings ? f.settings.get().planNotify : null; if (PLAN_NOTIFY.includes(v)) return v; } catch {}
    return 'next';
  }
  ownerOpen(id) { return !!(id && this.b.sessions && this.b.sessions.has(id)); }
  // Plans.commit이 사람의 바뀜마다 부른다. before·after: 레인 줄(plans 표), logs: [{ op, ref, summary }]
  onHuman(before, after, logs) {
    const mode = this.mode();
    if (mode === 'off') return { sent: false, why: 'off' };
    const bits = (logs || []).filter((l) => !QUIET_OPS.has(l.op)).map(changeBit).filter(Boolean);
    if (!bits.length) return { sent: false, why: 'quiet' };
    const owner = after.owner;
    if (!this.ownerOpen(owner)) { if (before && before.owner) this.drop(before.owner, after.planId); return { sent: false, why: 'no_owner' }; }
    // 관리자가 바뀌었으면 옛 관리자에게 모인 이 레인의 줄은 새 관리자에게 옮긴다
    if (before && before.owner && before.owner !== owner) { const moved = this.drop(before.owner, after.planId); if (moved) bits.unshift(...moved.bits); }
    const m = this.pending.get(owner) || new Map();
    const p = m.get(after.planId) || { bits: [] };
    p.bits.push(...bits);
    m.set(after.planId, p); this.pending.set(owner, m);
    const done = newlyAllChecked(before && before.doc, after.doc, this.now());
    if (mode === 'now') { this.later(owner); return { sent: false, queued: true, why: 'now' }; }
    if (done.length) { const f = this.flush(owner, 'all_checked'); return { sent: !!f, why: 'all_checked', allChecked: done, deliveryId: f ? f.deliveryId : null }; }
    return { sent: false, queued: true, why: 'next' };
  }
  drop(owner, planId) {
    const m = this.pending.get(owner); if (!m) return null;
    const p = m.get(planId) || null; m.delete(planId); if (!m.size) this.pending.delete(owner);
    return p;
  }
  later(owner) {
    if (this.timers.has(owner)) return;
    const t = setTimeout(() => { this.timers.delete(owner); try { this.flush(owner, 'now'); } catch (e) { this.b.log && this.b.log('plan note flush error', e && e.stack); } }, this.debounceMs);
    if (t.unref) t.unref();
    this.timers.set(owner, t);
  }
  // 모인 줄 글(레인마다 지금 focus 진행을 붙인다) → { text, pend } | null. 꺼내면 모인 줄은 비운다
  take(owner) {
    const m = this.pending.get(owner);
    if (!m || !m.size) return null;
    this.pending.delete(owner);
    if (this.timers.has(owner)) { clearTimeout(this.timers.get(owner)); this.timers.delete(owner); }
    if (!this.ownerOpen(owner)) return null;
    const lines = [];
    for (const [planId, p] of m) {
      let r = null; try { r = this.b.store.getPlan(planId); } catch {}
      if (!r || r.deletedAt || r.owner !== owner) continue; // 지운 레인, 그새 관리자가 바뀐 레인은 뺀다
      const s = planSummary(r.doc, this.now());
      lines.push(noteLine({ name: r.name, bits: p.bits, focus: s && s.focus ? { code: s.focus.code, done: s.focus.done, total: s.focus.total } : null }));
    }
    if (!lines.length) return null;
    return { text: lines.join('\n'), pend: m, lanes: lines.length };
  }
  // 전달에 실어 보냄(attachFront·명령 바 글 앞) → 글 | null
  attach(owner, deliveryId, why = 'ride') {
    const h = this.take(owner);
    if (!h) return null;
    if (deliveryId) this.rides.set(deliveryId, { sessionId: owner, pend: h.pend });
    try { this.b.store.addEvent(owner, 'plan_note', { why, deliveryId: deliveryId || null, lanes: h.lanes }); } catch {}
    return h.text;
  }
  // 곧바로 보통 메시지(대기열)로 → { deliveryId } | null
  flush(owner, why = 'now') {
    const h = this.take(owner);
    if (!h || !this.b.queue) return null;
    const d = this.b.queue.enqueue(owner, h.text, { origin: { kind: 'human' } });
    this.rides.set(d.deliveryId, { sessionId: owner, pend: h.pend });
    try { this.b.store.addEvent(owner, 'plan_note', { why, deliveryId: d.deliveryId, lanes: h.lanes }); } catch {}
    return { deliveryId: d.deliveryId };
  }
  onDelivery(e) {
    if (!e || !this.rides.has(e.deliveryId)) return;
    if (e.status === 'confirmed' || e.status === 'unconfirmed') { this.rides.delete(e.deliveryId); return; }
    if (e.status !== 'failed' && e.status !== 'cancelled') return;
    const r = this.rides.get(e.deliveryId); this.rides.delete(e.deliveryId);
    if (!this.ownerOpen(r.sessionId)) return;
    const m = this.pending.get(r.sessionId) || new Map();
    for (const [planId, p] of r.pend) { const cur = m.get(planId); m.set(planId, { bits: [...p.bits, ...(cur ? cur.bits : [])] }); }
    this.pending.set(r.sessionId, m);
    try { this.b.store.addEvent(r.sessionId, 'plan_note_back', { deliveryId: e.deliveryId, status: e.status }); } catch {}
  }
  // 세션이 닫혔다: 모인 줄을 버린다
  onClosed(s) { const id = s && (s.sessionId || s); this.pending.delete(id); if (this.timers.has(id)) { clearTimeout(this.timers.get(id)); this.timers.delete(id); } }
  pendingCount(owner) { const m = this.pending.get(owner); return m ? m.size : 0; }
  stop() { for (const t of this.timers.values()) clearTimeout(t); this.timers.clear(); }
}
