// P217: rig 장부(F0-2, docs research harness-arch.md 18.1·18.2). 표 rig_events 하나에 rig의 모든 사건을 한 꼴로 쌓는다.
// - 쓰는 길은 이 파일의 rigEvent(b, row) 하나다(store.insertRigEvent는 여기서만 부른다. p217 시험이 소스를 검사한다).
// - 흩어진 기록(events의 rig_* 이름, tool_runs)은 그대로 두고 장부 줄이 ref로 가리킨다.
// - kind는 닫힌 낱말 목록(RIG_EVENT_KINDS)이다. 모르는 kind는 거절한다. 1단계 기능은 목록에 하나를 더하는 것으로 들어온다.
// - 쓸 때마다 판 이벤트 rig.events { ws, seq }를 창에 보낸다(구조 지도와 건 기록 패널이 다시 읽는다).
// - 보관: 워크스페이스마다 RIG_EVENTS_MAX 줄을 넘으면 오래된 것부터 지운다(PRUNE_EVERY 줄마다 본다).
import { clip } from './text.mjs';
import { shownName } from './session-label.mjs';

// rig의 켜기·판(버전) 사건. P249: 옛 rig(1·2)의 건·일·관문·고리·문서·제안 종류는 걷어냈다(옛 판 DB의 줄은 그대로 읽힌다)
export const RIG_EVENT_KINDS = ['rig_enabled', 'rig_disabled', 'rig_version', 'rig_invalid', 'rig_rollback'];
// P241: rig 역할 장부 종류(역할 세션).
//   role_spawn(켜기가 띄움), role_respawn(닫히거나 끝나 다시 띄움, data.prev), role_gave_up(다시 띄우기 상한), role_write_denied(섹터 밖 쓰기·셸 안의 셸 거절, value writes | nested_shell), role_slept(쉬어 판이 재움)
// P242: 항목·길·받음(rig-items.mjs). item_put(value new | redo | intake), item_accept, item_return(value receiver | late), item_pass(value item | turn), item_drop,
//   role_woke(rig를 켜 잠든 역할 세션을 깨움. 끌 때 재우는 것은 role_slept value rig_off),
//   item_nudge(답하지 않고 멈춘 역할을 한 번 일깨움), item_stalled(일깨운 뒤에도 그대로), item_changed(낸 파일이 바뀜, value changed | missing)
//   P249: role_removed(정의에서 빠진 역할의 세션을 rig에서 뗌, value slept | asleep | kept)
export const RIG_ROLE_KINDS = ['role_spawn', 'role_respawn', 'role_gave_up', 'role_write_denied', 'role_slept', 'item_put', 'item_accept', 'item_return', 'item_pass', 'item_drop', 'item_nudge', 'item_stalled', 'item_changed', 'role_woke', 'role_removed'];
// P243: rig 남의 쓰기 되돌리기(rig-guard.mjs). role_foreign_write(value restored | quarantined | revived | unrestorable | failed, data.candidates), role_guard_base(처음 기준 목록, data.ms)
export const RIG_GUARD_KINDS = ['role_foreign_write', 'role_guard_base'];
// P244: rig 박자·도구·사이클 요약(rig-beat.mjs). cycle_open(value enable | clock | late | human, n), cycle_entry(value ai | numbers, n, ref 변경 기록 파일),
//   role_tool(value done | failed | alarm, ref 실행 ID, data.by clock | role, data.tool·exit·alarm·log), role_beat(역할 칸 beat가 그 역할을 깨움)
export const RIG_BEAT_KINDS = ['cycle_open', 'cycle_entry', 'role_tool', 'role_beat'];
// P245: rig 조정과 되돌리기(rig-tune.mjs): 조정 턴, 조정(applied | rejected | none), 빌더에게 올림, 사람의 바로잡음, 사람의 되돌리기
export const RIG_TUNE_KINDS = ['tune_turn', 'role_tune', 'role_raise', 'role_heard', 'role_rollback'];
// P247: rig 빌더(rig-builder.mjs). builder_spawn(사람이 "빌더에게 말하기"로 빌더 세션을 띄움)
export const RIG_BUILDER_KINDS = ['builder_spawn'];
const KINDS = new Set([...RIG_EVENT_KINDS, ...RIG_ROLE_KINDS, ...RIG_GUARD_KINDS, ...RIG_BEAT_KINDS, ...RIG_TUNE_KINDS, ...RIG_BUILDER_KINDS]);
export const RIG_EVENT_ACTORS = ['agent', 'human', 'board', 'hook', 'cycle'];
export const RIG_EVENTS_MAX = 100000;
const PRUNE_EVERY = 500;
const TEXT_MAX = 200;
// 장부의 열(store-rig.mjs RIG_EVENTS_SCHEMA와 같다)
const COLS = ['ws', 'defN', 'kind', 'caseId', 'unitId', 'tryId', 'seat', 'session', 'fromSeat', 'toSeat', 'line', 'value', 'n', 'max', 'actor', 'ref', 'text', 'data'];

function apiError(code, message, extra = {}) { return Object.assign(new Error(message), { code }, extra); }

// 장부에 한 줄. b: 백엔드(store, rig, api, log). row: { kind, ws, caseId?, … }(열 이름은 위 COLS, 카멜 꼴)
//   → { seq } | null(쓰지 못함: 저장소가 장부를 모름, 워크스페이스 없음). 모르는 kind는 던진다(프로그램 잘못)
//   def_n: 주지 않으면 지금 판(정의 캐시만 본다. 읽기를 새로 하면 rig_version을 다시 부를 수 있다)
export function rigEvent(b, row) {
  if (!row || !KINDS.has(row.kind)) throw apiError('bad_kind', `rig 장부에 모르는 kind다: ${row && row.kind}. 목록: ${RIG_EVENT_KINDS.join(', ')}`);
  if (row.actor != null && !RIG_EVENT_ACTORS.includes(row.actor)) throw apiError('bad_kind', `rig 장부의 actor는 ${RIG_EVENT_ACTORS.join(', ')} 가운데 하나다: ${row.actor}`);
  const st = b && b.store;
  if (!st || typeof st.insertRigEvent !== 'function') return null;
  try {
    const ws = row.ws || null;
    let defN = row.defN ?? null;
    if (!ws) return null;
    if (defN == null && b.rig && typeof b.rig.cachedN === 'function') defN = b.rig.cachedN(ws);
    const x = { t: row.t ?? Date.now(), ...Object.fromEntries(COLS.map((k) => [k, row[k] ?? null])), ws, defN };
    if (x.text != null) x.text = clip(String(x.text).replace(/\s+/g, ' ').trim(), TEXT_MAX - 1); // 200자(…포함)
    if (x.ref != null) x.ref = String(x.ref);
    if (x.value != null) x.value = String(x.value);
    if (x.data != null && typeof x.data === 'object') x.data = Object.fromEntries(Object.entries(x.data).filter(([, v]) => v !== undefined));
    const seq = st.insertRigEvent(x);
    pruneMaybe(b, ws, seq);
    if (b.api && b.api.broadcast) try { b.api.broadcast('rig.events', { ws, seq, kind: x.kind }); } catch {}
    return { seq };
  } catch (e) { if (b.log) b.log('rig event error', e && e.stack ? e.stack : String(e)); return null; }
}
const counters = new WeakMap();
function pruneMaybe(b, ws, seq) {
  const st = b.store;
  const max = (b.cfg && Number(b.cfg.rigEventsMax)) || RIG_EVENTS_MAX;
  const every = Math.min(PRUNE_EVERY, Math.max(1, Math.floor(max / 10)));
  const m = counters.get(st) || new Map(); counters.set(st, m);
  const n = (m.get(ws) || 0) + 1; m.set(ws, n);
  if (n % every !== 0 || typeof st.pruneRigEvents !== 'function') return;
  try { const gone = st.pruneRigEvents(ws, max); if (gone && b.log) b.log(`rig events pruned ${ws}: ${gone}`); } catch (e) { if (b.log) b.log('rig events prune error', e.message); }
}

// ---------- 읽기(18.2) ----------
// --since: 수(1e11보다 작으면 seq, 크면 ms 시각) 또는 날짜 글 → { sinceSeq } | { sinceT } | {}
export function parseSince(v) {
  if (v == null || v === '') return {};
  const s = String(v).trim();
  if (/^\d+$/.test(s)) { const n = Number(s); return n < 1e11 ? { sinceSeq: n } : { sinceT: n }; }
  const t = Date.parse(s);
  if (!Number.isFinite(t)) throw apiError('bad_request', `--since는 seq 번호나 시각(예: 2026-11-18T10:00)이다: ${s}`);
  return { sinceT: t };
}
export function parseKinds(v) {
  if (v == null || v === '') return null;
  const list = (Array.isArray(v) ? v : String(v).split(',')).map((x) => String(x).trim()).filter(Boolean);
  const bad = list.filter((k) => !KINDS.has(k));
  if (bad.length) throw apiError('bad_request', `모르는 kind: ${bad.join(', ')}. 목록: ${[...RIG_EVENT_KINDS, ...RIG_ROLE_KINDS].join(', ')}`);
  return list;
}
// 장부 읽기. o: { since, kinds, limit } → { workspace, rows, last, more }
export function readEvents(b, key, o = {}) {
  const st = b.store;
  const limit = Math.min(Math.max(Number(o.limit) || 200, 1), 2000);
  const q = { ws: key, kinds: parseKinds(o.kinds), ...parseSince(o.since), limit: limit + 1 };
  const rows = st.rigEvents(q);
  const more = rows.length > limit;
  // P247: 커서 없이 부르면 가게가 최근 limit+1줄을 오래된 것부터 준다. 꼬리는 뒤에서 limit줄(가장 새 줄을 빠뜨리지 않는다), 커서 뒤 읽기는 앞에서 limit줄
  const tail = q.sinceSeq == null && q.sinceT == null;
  const out = tail ? rows.slice(-limit) : rows.slice(0, limit);
  const name = (sid) => { if (!sid) return null; const s = b.sessions && b.sessions.get(sid); if (s) return shownName(s) || s.name; const r = st.getSession ? st.getSession(sid) : null; return r ? shownName(r) || r.name : null; };
  return { workspace: key, rows: out.map((r) => ({ ...r, sessionName: name(r.session) })), last: st.lastRigSeq(key), more };
}
// 한 줄을 사람이 읽는 글로(atrium rig log --events)
export function eventLine(r) {
  const parts = [`#${r.seq}`, new Date(r.t).toISOString().slice(11, 19), r.kind];
  const seat = r.seat ? `${r.seat}${r.sessionName ? `(@${r.sessionName})` : ''}` : r.sessionName ? `@${r.sessionName}` : null;
  if (seat) parts.push(seat);
  if (r.fromSeat || r.toSeat) parts.push(`${r.fromSeat || '-'} → ${r.toSeat || '-'}`);
  if (r.value != null) parts.push(`= ${r.value}`);
  if (r.n != null) parts.push(`${r.n}${r.max != null ? `/${r.max}` : ''}번`);
  if (r.ref) parts.push(`ref ${r.ref}`);
  return parts.join(' · ') + (r.text ? `: ${r.text}` : '');
}
