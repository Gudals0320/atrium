// P171: 일시 연결. 판의 선은 실제 일 관계만 오래 남긴다.
// - atrium read·wait는 선을 새로 만들지 않는다(이미 있는 선에만 기록을 붙이고, 기록은 세션 사건 atrium_read·atrium_wait에 남는다).
// - atrium prompt는 두 세션 사이에 일 관계(띄움 계보·역할 선·명시한 하위·동료, 사람이 판에서 이은 선)가 있을 때만 영구 연결을 만든다.
//   그 밖(관계 없음·독립)은 일시 연결(transient)이다: 보낸 때부터 그 글의 턴이 끝날 때까지와 짧은 여운(LINGER_MS) 동안 보이고 판에서 빠진다.
//   오간 글은 전달 기록·Thread·세션 사건·연결 기록(link_events)에 그대로 남는다.
// - 같은 쌍이 관계를 얻거나(atrium relate, --role, 사람이 이음) 사람이 선 메뉴에서 "연결 유지"를 누르면 영구 연결이 된다.
// - 판이 뜰 때 한 번: 역할·띄움·명시 관계가 없고 기록이 읽기·기다리기뿐인 옛 연결(P116~P170의 atrium read·wait가 만든 선)을 지운다.

import crypto from 'node:crypto';

export const LINGER_MS = 2 * 60 * 1000; // 턴이 끝난 뒤 일시 선이 남는 시간
export const TEMP_MAX_MS = 30 * 60 * 1000; // 턴 끝을 못 보면 이만큼 뒤 빠진다(F1의 OPEN_PROMPT_MS와 같다). 일하는 중이면 늘린다
export const SWEEP_MS = 15 * 1000;

// 일시 선의 수명을 바꾸는 연결 기록: 턴이 열리면 늘리고, 끝나면 여운만 남긴다
const OPEN_KINDS = new Set(['prompt', 'target_submitted', 'target_working']);
const END_KINDS = new Set(['target_done', 'target_exited']);
export function tempUntilAfter(kind, data, now = Date.now()) {
  if (OPEN_KINDS.has(kind)) return now + TEMP_MAX_MS;
  if (END_KINDS.has(kind)) return now + LINGER_MS;
  if (kind === 'prompt_result' && data && data.ok === false) return now + LINGER_MS; // 글이 들어가지 못했다
  return null;
}

// ensureLink가 할 일(순수 함수). l: 지금 줄(없으면 null). patch.transient: 일시 연결로 열기(관계 없는 쌍의 prompt)
// → { insert: 새 줄 } | { update: 고칠 칸들(빈 객체면 그대로) }
export function linkPatch(l, patch = {}, now = Date.now(), newId = () => 'l' + crypto.randomBytes(5).toString('hex')) {
  const temp = patch.transient === true;
  if (!l) return { insert: { linkId: newId(), from: patch.from, to: patch.to, role: patch.role ?? null, spawned: !!patch.spawned, observed: !!patch.observed, createdAt: now, transient: temp, tempUntil: temp ? now + TEMP_MAX_MS : null } };
  const f = {};
  if (l.removedAt) {
    // 지운 연결에 새 일이 오가면 다시 연다. 일시로 지워진 쌍에 또 일시 글이면 다시 일시로
    f.removedAt = null;
    if (temp) { if (!l.transient) f.transient = true; f.tempUntil = now + TEMP_MAX_MS; }
    else if (l.transient) { f.transient = false; f.tempUntil = null; }
  } else if (l.transient) {
    if (temp) f.tempUntil = now + TEMP_MAX_MS; // 열린 일시 선에 또 보냄: 수명을 늘린다
    else { f.transient = false; f.tempUntil = null; } // 관계를 얻었다(역할·띄움·관계·연결 유지): 영구로
  }
  // 열린 영구 선에 일시 글은 그대로 영구다
  if (patch.spawned && !l.spawned) f.spawned = true;
  if (patch.observed && !l.observed) f.observed = true;
  if (patch.role !== undefined && patch.role !== l.role) f.role = patch.role;
  return { update: f };
}

// 지울 일시 연결들. busy(link) → true면(받는 쪽이 아직 그 글의 턴을 하는 중) 지우지 않고 늘린다
export function expiredTemps(links, now = Date.now(), busy = () => false) {
  const gone = [], extend = [];
  for (const l of links) {
    if (!l || !l.transient || l.removedAt || !l.tempUntil || l.tempUntil > now) continue;
    (busy(l) ? extend : gone).push(l);
  }
  return { gone, extend };
}

// 읽기·기다리기만 남은 연결인가(판이 뜰 때 정리). events: 그 연결의 기록들. related(from, to) → 일 관계가 있으면 true
const READ_ONLY_KINDS = new Set(['wait_result']);
export function readOnlyLink(l, events, related = () => false) {
  if (!l || l.removedAt || l.role || l.spawned) return false;
  if (!events || !events.length) return false;
  if (related(l.from, l.to)) return false;
  return events.every((e) => READ_ONLY_KINDS.has(e.kind) || (e.kind === 'reply' && e.data && (e.data.verb === 'read' || e.data.verb === 'wait')));
}

// 판(backend)에 붙는 부분: 일시 선 쓸기, 연결 유지, 읽기 선 정리
export class TempLinks {
  constructor(b, { sweepMs = SWEEP_MS } = {}) { this.b = b; this.sweepMs = sweepMs; this.timer = null; }
  start() {
    this.cleanupReadLinks();
    this.sweep();
    this.timer = setInterval(() => { try { this.sweep(); } catch (e) { this.b.log('temp link sweep error', e.stack); } }, this.sweepMs);
    if (this.timer.unref) this.timer.unref();
  }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }
  // 받는 쪽이 그 연결로 온 글의 턴을 아직 하는 중인가
  busy(l) {
    const t = this.b.sessions.get(l.to);
    if (!t || !t.openPromptFrom || t.openPromptFrom.linkId !== l.linkId) return false;
    const st = this.b.summary ? this.b.summary(t).state : null;
    return st === 'working' || st === 'starting' || st === 'waiting' || st === 'trust_wait';
  }
  sweep(now = Date.now()) {
    const b = this.b;
    const { gone, extend } = expiredTemps(b.store.links(), now, (l) => this.busy(l));
    for (const l of extend) b.store.updateLink(l.linkId, { tempUntil: now + TEMP_MAX_MS });
    for (const l of gone) {
      b.store.updateLink(l.linkId, { removedAt: now });
      b.api.broadcast('link.removed', { linkId: l.linkId, reason: 'temporary' });
    }
    if (gone.length) b.log(`temp links removed: ${gone.length}`);
    return gone.length;
  }
  // 사람이 선 메뉴에서 "연결 유지": 일시 선을 영구로
  keep(p = {}) {
    const b = this.b;
    const l = b.store.getLink(p.link);
    if (!l) { const e = new Error(`연결을 찾을 수 없습니다: ${p.link}`); e.code = 'not_found'; throw e; }
    if (!l.transient) return { link: b.linkView(l), kept: false };
    const nl = b.ensureLink(l.from, l.to, {});
    b.store.addEvent(l.from, 'link_kept', { to: (b.sessions.get(l.to) || {}).name || null, linkId: l.linkId });
    return { link: b.linkView(nl), kept: true };
  }
  // 판이 뜰 때 한 번: 읽기·기다리기만 오간 연결을 지운다(지시가 한 번이라도 오간 연결은 남는다)
  cleanupReadLinks(now = Date.now()) {
    const b = this.b;
    const idx = b.branch && b.branch.relIndex ? b.branch.relIndex() : null;
    const related = (x, y) => !!(idx && idx.between(x, y));
    let n = 0;
    for (const l of b.store.links()) {
      if (!readOnlyLink(l, b.store.linkEvents(l.linkId, 1000), related)) continue;
      b.store.updateLink(l.linkId, { removedAt: now });
      n++;
    }
    b.log(`read-only links removed at start: ${n}`);
    return n;
  }
}
