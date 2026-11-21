// P300: 자체 오케스트레이션 세션의 안 진행(읽기 전용). 안에서 도는 갈래(DAG 갈래·하위 에이전트)를 판 카드에 칩으로 보인다.
// 안의 에이전트를 판 세션으로 비추지 않는다(만들지도, 고르지도, 메시지도 보내지 않는다). 하네스별 진행 읽개를 꽂는 자리는
// 바쁨 읽개(inner-work.mjs registerInnerReader)와 같은 busy 칸 { reader: '<이름>' }이다(P298: 'hermes').
// - 읽기: 세션이 일하는 중이거나 바쁨 신호가 켜졌거나 보이는 진행이 아직 끝나지 않았을 때만 POLL_MS 간격으로 읽는다(쉬는 세션은 읽지 않는다)
// - 보내기: 보일 값(stepProgress)이 바뀔 때만 세션 요약을 다시 보낸다
// - 끝: 도는 것을 본 진행이 끝나면 "끝"으로 남기고, 세션이 한 번 쉰 뒤 다음 턴이 시작되면 지운다. 도는 것을 보지 못한 끝난 진행(판을 다시 띄움 등)은 보이지 않는다
// 진행 꼴: { kind, key, label, done, total, running, failed, finished, items: [{ name, state, startedAt, endedAt }], updatedAt }
import { deriveState } from './state.mjs';

export const PROGRESS_POLL_MS = 3000;
export const PROGRESS_READERS = new Map();
export function registerProgressReader(name, fn) { PROGRESS_READERS.set(String(name), fn); return () => PROGRESS_READERS.delete(String(name)); }
// busy 칸의 읽개 가운데 꽂힌 것이 있는가
export const progressReadable = (busy = []) => (busy || []).some((x) => x && typeof x === 'object' && x.reader && PROGRESS_READERS.has(String(x.reader)));
// busy 칸의 읽개들 → 첫 진행 | null(읽개가 없거나 모두 실패·없음). 실패는 조용히
export function readProgress(busy = [], ctx = {}) {
  for (const x of busy || []) {
    if (!x || typeof x !== 'object' || !x.reader) continue;
    const fn = PROGRESS_READERS.get(String(x.reader));
    if (!fn) continue;
    try { const p = fn(ctx); if (p && Number.isFinite(p.total) && p.total > 0 && Array.isArray(p.items)) return p; } catch {}
  }
  return null;
}
// 창에 보낼 값이 바뀌었는지 보는 열쇠(updatedAt은 빼고, 갈래의 상태·시각은 넣는다)
export const progressSig = (p) => (p ? JSON.stringify([p.key, p.label, p.done, p.total, p.running, p.failed, !!p.finished, p.items.map((x) => [x.name, x.state, x.startedAt, x.endedAt])]) : '');

// 보일 값의 한 걸음(순수). st: { shown, seen: Set(도는 것을 본 열쇠), idleSeen(끝난 뒤 쉼을 봤나), dismissed(지운 열쇠) }
// read: 이번에 읽은 진행 | null | undefined(읽지 않았다), working: 세션이 지금 일하는 중인가
export function stepProgress(st0, read, { working = false } = {}) {
  const st = { shown: null, seen: new Set(), idleSeen: false, dismissed: null, ...(st0 || {}) };
  st.seen = new Set(st.seen);
  if (read !== undefined) {
    if (!read) { if (!(st.shown && st.shown.finished)) st.shown = null; }
    else if (!read.finished) {
      st.seen.add(read.key);
      if (!st.shown || st.shown.key !== read.key) st.idleSeen = false;
      if (st.dismissed === read.key) st.dismissed = null;
      st.shown = read;
    } else if (st.seen.has(read.key) && st.dismissed !== read.key) {
      if (!st.shown || st.shown.key !== read.key || !st.shown.finished) st.idleSeen = false;
      st.shown = read;
    } else if (!(st.shown && st.shown.finished && st.shown.key !== read.key)) st.shown = null; // 다른 끝난 진행이 보이는 중이면 둔다
  }
  if (st.shown && st.shown.finished) {
    if (!working) st.idleSeen = true;
    else if (st.idleSeen) { st.dismissed = st.shown.key; st.shown = null; st.idleSeen = false; }
  }
  if (st.seen.size > 32) st.seen = new Set([...st.seen].slice(-16));
  return st;
}

// 판에 붙는 감시. b: 판(sessions, sleeper, broadcastSession, log)
export class ProgressWatcher {
  constructor(b, { pollMs = PROGRESS_POLL_MS } = {}) { this.b = b; this.pollMs = pollMs; this.st = new Map(); this.timer = null; this._busy = false; }
  start() { if (!this.timer && this.pollMs > 0) { this.timer = setInterval(() => this.poll(), this.pollMs); if (this.timer.unref) this.timer.unref(); } return this; }
  stop() { clearInterval(this.timer); this.timer = null; }
  busy(s) { const sl = this.b.sleeper; return !!(sl && sl.innerBusy && sl.innerBusy(s)); }
  wants(s) {
    if (!s || !s.orch || !s.orch.on || !s.paneId || (s.rt && s.rt.sleep) || (s.kind || 'claude') === 'shell') return false;
    return progressReadable(s.orch.busy);
  }
  // 한 번 돌기. now: 시험용
  poll(now = Date.now()) {
    if (this._busy) return;
    this._busy = true;
    try {
      const b = this.b;
      for (const id of [...this.st.keys()]) { const s = b.sessions.get(id); if (!s || !this.wants(s)) { const had = this.st.get(id).shown; this.st.delete(id); if (had && s) this.send(s); } }
      for (const s of b.sessions.values()) {
        if (!this.wants(s)) continue;
        const prev = this.st.get(s.sessionId) || null;
        const working = deriveState(s.rt).state === 'working';
        const open = !!(prev && prev.shown && !prev.shown.finished);
        const read = working || open || this.busy(s) ? readProgress(s.orch.busy, { session: s, now }) : undefined;
        if (read === undefined && !(prev && prev.shown)) continue; // 쉬고 보일 것도 없다: 읽지 않는다
        const next = stepProgress(prev, read, { working });
        this.st.set(s.sessionId, next);
        if (progressSig(prev && prev.shown) !== progressSig(next.shown)) {
          if (next.shown && (!prev || !prev.shown || prev.shown.key !== next.shown.key)) b.log(`inner progress ${s.name}: ${next.shown.key} ${next.shown.done}/${next.shown.total}`);
          this.send(s);
        }
      }
    } finally { this._busy = false; }
  }
  send(s) { if (this.b.broadcastSession && this.b.sessions.has(s.sessionId)) this.b.broadcastSession(s, { cause: 'progress' }); }
  // 요약에 실을 값 | null
  view(s) { const x = s ? this.st.get(s.sessionId) : null; return x && x.shown ? x.shown : null; }
}
