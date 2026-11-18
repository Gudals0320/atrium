// P217: rig 장부(F0-2, docs research harness-arch.md 18.1·18.2). 표 rig_events 하나에 rig의 모든 사건을 한 꼴로 쌓는다.
// - 쓰는 길은 이 파일의 rigEvent(b, row) 하나다(store.insertRigEvent는 여기서만 부른다. p217 시험이 소스를 검사한다).
// - 흩어진 기록(events의 rig_*·unit_*·tool_* 이름, rig_hook_runs, tool_runs, rig_cases)은 그대로 두고 장부 줄이 ref로 가리킨다.
// - kind는 닫힌 낱말 목록(RIG_EVENT_KINDS)이다. 모르는 kind는 거절한다. 1단계 기능은 목록에 하나를 더하는 것으로 들어온다.
// - 쓸 때마다 판 이벤트 rig.events { ws, seq }를 창에 보낸다(구조 지도와 건 기록 패널이 다시 읽는다).
// - 보관: 워크스페이스마다 RIG_EVENTS_MAX 줄을 넘으면 열린 건이 아닌 줄의 오래된 것부터 지운다(PRUNE_EVERY 줄마다 본다).
import { clip } from './text.mjs';
import { shownName } from './session-label.mjs';

export const RIG_EVENT_KINDS = [
  // 건
  'case_open', 'case_waiting_owner', 'case_resumed', 'case_blocked', 'case_done', 'case_cancelled',
  // 일
  'assign', 'handoff', 'report', 'escalate', 'try_start', 'done', 'try_stopped', 'retried',
  // 관문·도구
  'gate', 'tool_start', 'tool_end',
  // 자리·사람
  'seat_spawn', 'seat_queue', 'seat_set', 'human_message',
  // rig
  'rig_enabled', 'rig_disabled', 'rig_version', 'rig_invalid', 'rig_protected', 'rig_rollback', 'cycle', 'cleanup',
  // P219: rig 2 문서(rig2-design 5절). doc_stale은 목록에만 있다(stale은 지금 표시만, 알림은 뒤)
  'doc_load', 'doc_changed', 'doc_foreign_write', 'doc_stale',
  // P221: rig 2 고리(rig2-design 5절). 회 열림·끝남은 case_open·case_done에 data.loop(run_open·run_end를 따로 두지 않는다)
  //   loop_trigger(계기가 걸림, value request | every), loop_skip(건너뜀·붙잡음, value paused | running | no_session | spawn_failed), loop_next(다음 실행 시각),
  //   loop_paused·loop_resumed(고리 멈춤·잇기), run_paused·run_resumed(회 멈춤·잇기), run_named(회 이름 붙임·고침, value auto | human | owner | manager)
  'loop_trigger', 'loop_skip', 'loop_next', 'loop_paused', 'loop_resumed', 'run_paused', 'run_resumed', 'run_named',
  // P222: rig 2 산출물 섹터(rig2-design 5절). artifact_filed(섹터에 등록, value 섹터), artifact_superseded(밀려남, value same_path | keep),
  //   artifact_accepted(회가 done으로 닫혀 받아들임), artifact_warning(value produces_none: produces 고리의 회가 아무것도 내지 않음 | hook_path: done 훅이 준 경로가 틀림)
  'artifact_filed', 'artifact_superseded', 'artifact_accepted', 'artifact_warning',
  // P223: 자리 권한 결정(value: scoped | unattended | approved). 자리 세션을 띄울 때와 사람이 unattended를 승인할 때
  'seat_permission',
  // P224: rig 2 R6 제안과 승인(rig2-design 5절). proposal_made(value 대상), proposal_decided(value approved | rejected, actor 누가), proposal_applied(value applied | conflict | failed)
  //   정본 지키기(11.5의 4): doc_unapproved(승인 없이 정본이 바뀜), doc_reverted·doc_accepted(사람이 되돌림·받아들임)
  //   워크트리 산출물(11.7의 6): artifact_merged(pending_merge → new·accepted, value same_hash | merged), artifact_lost(합치지 않고 워크트리가 지워짐)
  'proposal_made', 'proposal_decided', 'proposal_applied', 'doc_unapproved', 'doc_reverted', 'doc_accepted', 'artifact_merged', 'artifact_lost',
];
const KINDS = new Set(RIG_EVENT_KINDS);
export const RIG_EVENT_ACTORS = ['agent', 'human', 'board', 'hook', 'cycle'];
// try_stopped의 value(18.1). P216이 exited를 더한다
// P225: auto_closed(회 저절로 닫기가 열린 시도를 닫음, rig2-design 11.8의 5)
export const TRY_STOP_VALUES = ['idle_no_done', 'turn_error', 'needs_human', 'closed', 'exited', 'auto_closed'];
export const GATE_ATS = ['deliver', 'done', 'tool-before', 'tool-after', 'pre-tool', 'stop-verify'];
export const OWNER = '@owner';
export const HUMAN = '@human';
export const RIG_EVENTS_MAX = 100000;
const PRUNE_EVERY = 500;
const TEXT_MAX = 200;
// 장부의 열(store-rig.mjs RIG_EVENTS_SCHEMA와 같다)
const COLS = ['ws', 'defN', 'kind', 'caseId', 'unitId', 'tryId', 'seat', 'session', 'fromSeat', 'toSeat', 'line', 'value', 'n', 'max', 'actor', 'ref', 'text', 'data'];

function apiError(code, message, extra = {}) { return Object.assign(new Error(message), { code }, extra); }

// 장부에 한 줄. b: 백엔드(store, rig, api, log). row: { kind, ws, caseId?, … }(열 이름은 위 COLS, 카멜 꼴)
//   → { seq } | null(쓰지 못함: 저장소가 장부를 모름, 워크스페이스 없음). 모르는 kind는 던진다(프로그램 잘못)
//   def_n: 주지 않으면 건이 쥔 버전, 건 밖이면 지금 버전(정의 캐시만 본다. 읽기를 새로 하면 rig_version을 다시 부를 수 있다)
export function rigEvent(b, row) {
  if (!row || !KINDS.has(row.kind)) throw apiError('bad_kind', `rig 장부에 모르는 kind다: ${row && row.kind}. 목록: ${RIG_EVENT_KINDS.join(', ')}`);
  if (row.actor != null && !RIG_EVENT_ACTORS.includes(row.actor)) throw apiError('bad_kind', `rig 장부의 actor는 ${RIG_EVENT_ACTORS.join(', ')} 가운데 하나다: ${row.actor}`);
  const st = b && b.store;
  if (!st || typeof st.insertRigEvent !== 'function') return null;
  try {
    let ws = row.ws || null;
    let defN = row.defN ?? null;
    if (row.caseId && (!ws || defN == null)) { const c = st.getCase ? st.getCase(row.caseId) : null; if (c) { ws = ws || c.workspaceKey; if (defN == null) defN = c.versionN ?? null; } }
    if (!ws) return null;
    if (defN == null && b.rig && typeof b.rig.cachedN === 'function') defN = b.rig.cachedN(ws);
    const x = { t: row.t ?? Date.now(), ...Object.fromEntries(COLS.map((k) => [k, row[k] ?? null])), ws, defN };
    if (x.text != null) x.text = clip(String(x.text).replace(/\s+/g, ' ').trim(), TEXT_MAX - 1); // 200자(…포함)
    if (x.ref != null) x.ref = String(x.ref);
    if (x.value != null) x.value = String(x.value);
    if (x.data != null && typeof x.data === 'object') x.data = Object.fromEntries(Object.entries(x.data).filter(([, v]) => v !== undefined));
    const seq = st.insertRigEvent(x);
    pruneMaybe(b, ws, seq);
    if (b.api && b.api.broadcast) try { b.api.broadcast('rig.events', { ws, seq, kind: x.kind, caseId: x.caseId }); } catch {}
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

// 사람이 rig 자리 세션에 보낸 글(human_message). 켜진 rig의 자리 세션일 때만 → { seq } | null
export function humanMessage(b, s, deliveryId, text) {
  if (!s || !s.rigSeat || !b.rig || !b.rig.active(s.workspaceKey)) return null;
  const st = b.store; const tr = st.openTryOf ? st.openTryOf(s.sessionId) : null; const u = tr ? st.getUnit(tr.unitId) : null;
  return rigEvent(b, { kind: 'human_message', ws: s.workspaceKey, caseId: u ? u.caseId || null : null, unitId: u ? u.id : null, tryId: tr ? tr.id : null, seat: s.rigSeat, session: s.sessionId, fromSeat: HUMAN, toSeat: s.rigSeat, actor: 'human', ref: deliveryId, text });
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
  if (bad.length) throw apiError('bad_request', `모르는 kind: ${bad.join(', ')}. 목록: ${RIG_EVENT_KINDS.join(', ')}`);
  return list;
}
// 장부 읽기. o: { case, cases(허락된 건 목록, 자리 세션), since, kinds, limit } → { workspace, rows, last, more }
export function readEvents(b, key, o = {}) {
  const st = b.store;
  const limit = Math.min(Math.max(Number(o.limit) || 200, 1), 2000);
  const q = { ws: key, caseIds: o.cases || (o.case ? [String(o.case)] : null), kinds: parseKinds(o.kinds), ...parseSince(o.since), limit: limit + 1 };
  const rows = st.rigEvents(q);
  const more = rows.length > limit;
  const out = rows.slice(0, limit);
  const name = (sid) => { if (!sid) return null; const s = b.sessions && b.sessions.get(sid); if (s) return shownName(s) || s.name; const r = st.getSession ? st.getSession(sid) : null; return r ? shownName(r) || r.name : null; };
  return { workspace: key, rows: out.map((r) => ({ ...r, sessionName: name(r.session) })), last: st.lastRigSeq(key), more };
}
// 한 줄을 사람이 읽는 글로(atrium rig log --events)
export function eventLine(r) {
  const parts = [`#${r.seq}`, new Date(r.t).toISOString().slice(11, 19), r.kind];
  if (r.caseId) parts.push(`건 ${r.caseId}`);
  const seat = r.seat ? `${r.seat}${r.sessionName ? `(@${r.sessionName})` : ''}` : r.sessionName ? `@${r.sessionName}` : null;
  if (seat) parts.push(seat);
  if (r.fromSeat || r.toSeat) parts.push(`${r.fromSeat || '-'} → ${r.toSeat || '-'}`);
  if (r.line != null) parts.push(`flow[${r.line}]`);
  if (r.value != null) parts.push(`= ${r.value}`);
  if (r.n != null) parts.push(`${r.n}${r.max != null ? `/${r.max}` : ''}번`);
  if (r.ref) parts.push(`ref ${r.ref}`);
  return parts.join(' · ') + (r.text ? `: ${r.text}` : '');
}
