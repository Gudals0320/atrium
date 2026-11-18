// P180: 일 단위(work unit)와 시도(try). 하네스 0단계(docs research harness-arch.md 9·12절). 표는 store-units.mjs.
// - 일을 만드는 것: atrium child --prompt(하위로 띄울 때), 일 관계의 하위에게 가는 atrium prompt(--now가 아닐 때), 잠든 하위를 깨우며 맡긴 일(child 이름이 잠든 하위일 때).
//   동료·독립·관계없는 세션이 보낸 글, --now, 사람이 명령줄로 보낸 글은 일을 만들지 않는다.
// - 이어지는 지시: 위 세션이 자기에게서 열린 시도를 가진 하위에게 다시 보내면 새 일이 아니라 그 시도에 붙는 보통 글이다(하위의 질문에 답하는 글이 줄 서서 교착하지 않게).
// - 한 세션에 열린 시도는 하나다. 다른 위 세션의 일은 앞 시도가 done으로 닫히거나, 세션이 끝나거나, 그 시도의 턴이 done 없이 끝나 쉬게 될 때까지 판이 붙잡아 둔다.
// - 첫 요청 머리: 판 알림 줄 묶음(관계, 일, 약속) + 빈 줄 + 할 일. text.mjs promptTask가 묶음을 떼고 할 일만 카드의 지시로 보인다.
// - atrium done ok|failed "<글>": 부르는 세션의 열린 시도를 닫는다. 값과 글은 시도마다 정확히 한 번, 먼저 가져가는 길로 위 세션에 간다
//   (그 하위를 atrium wait·prompt --wait로 기다리던 기다림이 받거나, 전달 대기열로 한 번). 어느 길로 갔는지 시도(claimed_by)에 적는다.
//   대기열 것이 아직 들어가지 않았을 때 위 세션이 atrium wait를 치면 기다림이 가져가고 대기열 것은 취소한다. 들어간 뒤의 wait는 "이미 전함"을 붙여 돌려준다.
// - 머리 없이 도는 세션(옛 세션)의 동작은 그대로다. 멈춤 알림(보고 없이 쉼, L4)은 P181 unit-stops.mjs가 이 표의 stop_reason·notified_at으로 한다.
import crypto from 'node:crypto';
import { shownName } from './session-label.mjs';
import { clip, startsAsBoardNotice } from './text.mjs';
import { UnitStops } from './unit-stops.mjs'; // P181: 보고 없이 멈춤 알림
import { RIG_HEADER_TAIL } from './rig.mjs'; // P182. P188: 세 줄 머리의 셋째 줄 끝
import { seatHeader } from './rig-flow.mjs'; // P185: 자리 세션의 일 머리
import { HUMAN_FROM, BUILDER_ORIGIN, builderHeader } from './rig-templates.mjs'; // P190: 사람이 맡긴 rig 제작 일(상위 세션 없음)
import { rigEvent } from './rig-ledger.mjs'; // P217: 장부
import { seatDocsOf, docLoadEvent } from './rig-docs.mjs'; // P219: 머리의 문서 목록

// P216: 에이전트만 끝나고 셸 패널이 남은 것을 멈춤(exited)으로 보는가. 판이 끄라고 한 것(잠재우기·끄기·child-kill·옮기기·다시 띄우기: normal),
//   사람이 끝낸 것(/exit·Ctrl+C·종료 코드 0·130: user), 신뢰 거부(trust_declined), 터미널 서버가 꺼짐(terminal_stopped, 판이 되살린다)은 아니다.
//   남는 것은 other(충돌, 프로세스가 죽음, 까닭 모를 끝남)다. 종류(Claude Code·Codex·AGY·pi·opencode)와 상관없이 hc의 놓임(agent_released)과 종료 코드로 정한다
export const agentExited = (exit) => !!exit && exit.kind === 'other' && !exit.requested;

function apiError(code, message, extra = {}) { return Object.assign(new Error(message), { code }, extra); }
const newId = (p, n = 3) => p + crypto.randomBytes(n).toString('hex');
export const DONE_RESULTS = ['ok', 'failed'];
const DONE_TEXT_MAX = 100000;

// 첫 요청 머리(세 줄). 맨 위 관계 줄은 text.mjs RELATION_LINE과 같은 꼴이라 카드에는 아래 할 일만 지시로 보인다
// P182: rig가 켜진 워크스페이스면 rig 한 줄을 더한다(rig.mjs RIG_HEADER_LINE)
// P208: Codex(Windows PowerShell 5.1)는 글 안의 큰따옴표를 빼먹으므로 둘째 줄 끝에 --file 길을 붙인다
export const PS_DONE_TAIL = '여러 줄이나 큰따옴표가 든 보고는 파일에 쓰고 `atrium done ok --file <경로>`로 준다.';
export function unitHeader({ parent, unitId, rig = false, kind = null }) {
  return [
    `[Atrium 보드] 관계: 너는 @${parent}의 하위 워커다. 아래 일은 @${parent}가 맡긴 일 ${unitId}이다(지금 일 보기: \`atrium item\`).`,
    `[Atrium 보드] 끝나면 \`atrium done ok "<보고>"\`(못 했으면 \`atrium done failed "<까닭>"\`)로 닫고 쉰다. 일이 보고하라는 것은 done 글에 넣고 다른 길로 따로 보내지 않는다.${kind === 'codex' ? ` ${PS_DONE_TAIL}` : ''}`,
    `[Atrium 보드] 사람이 직접 다르게 시키면 그것을 따른다.${rig ? ` ${RIG_HEADER_TAIL}` : ''}`, // P188: 판 줄은 세 줄 이하라 rig 안내는 셋째 줄 끝에
  ].join('\n');
}
// 위 세션이 받는 done 글(판 알림 꼴이라 위 세션 카드의 마지막 지시가 되지 않는다)
export function doneNotice({ child, unitId, result, text, spec }) {
  return `[Atrium 보드] @${child}가 일 ${unitId}("${clip(String(spec || '').replace(/\s+/g, ' '), 60)}")을 닫았다: ${result}\n${text}`;
}
// 에이전트가 보내는 글은 판 알림 꼴로 시작할 수 없다(판 알림을 흉내 내 다른 세션의 머리·알림처럼 보이지 않게)
export function checkAgentText(text, what = '보낼 글') {
  if (startsAsBoardNotice(text)) throw apiError('board_prefix', `${what}은 보드 알림 머리("[Atrium 보드]" 등)로 시작할 수 없다. 그 머리는 보드만 붙인다. 머리를 빼고 다시 보낸다.`);
}

export class WorkUnits {
  // b: 백엔드(sessions, store, queue, linkEvent, ensureLink, log). branch: Branch(일 관계)
  constructor(b, branch, { noticeBatchMs } = {}) {
    this.b = b; this.branch = branch;
    this.waiters = new Map(); // `${위}>${하위}` → Set<{ got }>(그 하위를 기다리는 atrium wait·prompt --wait)
    this.prev = new Map(); // 세션 ID → 마지막으로 본 상태(턴 끝 판정)
    this.queued = new Set(b.store.queuedUnitSessions ? b.store.queuedUnitSessions() : []); // 판이 붙잡아 둔 일이 있는 세션
    this.onDispatch = null; // (unit, delivery, header) → 붙잡아 둔 일을 나중에 넣을 때(연결 기록)
    this.stops = new UnitStops(b, this, noticeBatchMs != null ? { batchMs: noticeBatchMs } : {}); // P181
  }
  store() { return this.b.store; }
  nameOf(id) { if (id === HUMAN_FROM) return 'human'; const s = this.b.sessions.get(id); if (s) return shownName(s) || s.name; const r = this.branch && this.branch.rowOf ? this.branch.rowOf(id) : null; return r ? r.name : '?'; }
  // 그 세션이 caller의 일 하위인가(일 관계 P156 workParentOf)
  isWorkSub(callerId, targetId) { return !!this.branch && this.branch.relIndex().workParentOf(targetId) === callerId; }

  // atrium prompt·wake --prompt가 무엇이 되는가. → { kind: 'plain' } | { kind: 'followup', tryRow, unit } | { kind: 'unit', hold }
  plan(caller, t, { now = false } = {}) {
    const st = this.store();
    const open = st.openTryOf(t.sessionId);
    const ou = open ? st.getUnit(open.unitId) : null;
    if (ou && (ou.from === caller.sessionId || (ou.via && ou.via.by === caller.sessionId))) return { kind: 'followup', tryRow: open, unit: ou }; // P185: 흐름의 일은 보낸 세션(via.by)도
    if (now || !this.isWorkSub(caller.sessionId, t.sessionId)) return { kind: 'plain' };
    return { kind: 'unit', hold: !!open || st.queuedUnitsOf(t.sessionId).length > 0 };
  }
  // 일을 만든다. hold면 판이 붙잡아 두고(앞 시도가 끝나면 넣는다), 아니면 바로 머리를 붙여 대기열에 넣는다 → { unit, d, header } | { unit, held: true, ahead }
  // P185: extra { id, fromId(상위 = 건 주인), caseId, seat, via } — rig 흐름의 일(rig-flow.mjs assign)
  create(caller, t, spec, origin, extra = null) {
    const st = this.store();
    const hold = !!st.openTryOf(t.sessionId) || st.queuedUnitsOf(t.sessionId).length > 0;
    const unit = { id: (extra && extra.id) || newId('u'), from: (extra && extra.fromId) || caller.sessionId, to: t.sessionId, origin, spec: String(spec), status: 'open', createdAt: Date.now(), ...(extra ? { caseId: extra.caseId || null, seat: extra.seat || null, via: extra.via || null } : {}) };
    st.insertUnit(unit);
    st.addEvent(t.sessionId, 'unit_open', { unitId: unit.id, from: caller.name, origin, held: hold, chars: unit.spec.length, ...(unit.caseId ? { caseId: unit.caseId, seat: unit.seat } : {}) });
    this.b.log(`unit ${unit.id} ${caller.name} → ${t.name} (${origin}${hold ? ', held' : ''})`);
    // P217: 켜진 rig의 자리 세션이 일 하위에게 맡긴 일(건 밖. 건의 일은 rig-flow가 적는다)
    if (!unit.caseId && caller.rigSeat && this.b.rig && this.b.rig.active(caller.workspaceKey)) rigEvent(this.b, { kind: 'assign', ws: caller.workspaceKey, unitId: unit.id, seat: caller.rigSeat, session: caller.sessionId, fromSeat: caller.rigSeat, toSeat: t.rigSeat || null, value: 'assign', actor: 'agent', text: clip(unit.spec.replace(/\s+/g, ' '), 120), data: { to: t.sessionId, origin } });
    if (hold) { this.queued.add(t.sessionId); return { unit, held: true, ahead: st.queuedUnitsOf(t.sessionId).length - 1 + (st.openTryOf(t.sessionId) ? 1 : 0) }; }
    return { unit, ...this.dispatch(unit) };
  }
  // 일의 새 시도: 머리를 붙여 대기열에 넣고 시도를 적는다
  dispatch(unit, { later = false } = {}) {
    const b = this.b; const st = this.store();
    const header = this.headerOf(unit);
    const d = b.queue.enqueue(unit.to, `${header}\n\n${unit.spec}`, { origin: unit.from === HUMAN_FROM ? { kind: 'human' } : { kind: 'agent', session: unit.from } }); // P182: 출처(맡긴 세션). P190: 사람이 맡긴 제작 일
    const tr = { id: newId('t', 4), unitId: unit.id, sessionId: unit.to, header: true, deliveryId: d.deliveryId, startedAt: Date.now() };
    st.insertTry(tr);
    st.addEvent(unit.to, 'unit_try', { unitId: unit.id, tryId: tr.id, deliveryId: d.deliveryId, later });
    if (unit.caseId) { const t = b.sessions.get(unit.to); rigEvent(b, { kind: 'try_start', caseId: unit.caseId, unitId: unit.id, tryId: tr.id, seat: unit.seat || (t && t.rigSeat) || null, session: unit.to, actor: 'board', ref: d.deliveryId, data: { queued_ms: Math.max(0, tr.startedAt - (unit.createdAt || tr.startedAt)), ...(later ? { later: true } : {}) } }); } // P217
    // P219: 자리 머리에 문서 목록을 붙였으면 장부에 doc_load
    if (unit.caseId && unit.origin !== BUILDER_ORIGIN && this.branch && this.branch.flow) { const t = b.sessions.get(unit.to); const ctx = t ? this.branch.flow.seatCtx(t, { caseId: unit.caseId }) : null; if (ctx) docLoadEvent(b, { caseId: unit.caseId, unitId: unit.id, tryId: tr.id, seat: ctx.name, session: unit.to, docs: seatDocsOf(ctx.def, ctx.name), ref: d.deliveryId }); }
    if (!st.queuedUnitsOf(unit.to).length) this.queued.delete(unit.to);
    if (later && this.onDispatch) try { this.onDispatch(unit, d, header); } catch (e) { b.log('unit dispatch hook error', e.stack); }
    return { d, tryRow: st.getTry(tr.id), header };
  }
  // 일 머리. P185: 건의 일을 자리 세션이 받으면 자리 머리(자리, 건, done 값, 보낼 수 있는 자리)
  headerOf(unit) {
    const b = this.b;
    if (unit.origin === BUILDER_ORIGIN) return builderHeader({ unitId: unit.id }); // P190: rig 제작 세션의 일 머리
    const flow = this.branch && this.branch.flow;
    const t = b.sessions.get(unit.to);
    const ctx = flow && unit.caseId && t ? flow.seatCtx(t, { caseId: unit.caseId }) : null; // P188: 건의 버전
    if (ctx) {
      const v = unit.via || {};
      const by = v.loop ? `보드의 ${v.loop} 고리(${v.every}마다)가 연 회` : v.request ? `${v.request} 고리의 요청(${v.by === HUMAN_FROM ? '사람' : `@${this.nameOf(v.by)}`})이 연 회` : v.cycle != null ? `보드의 느린 고리 cycles[${v.cycle}]가 만듦` : v.result ? `@${this.nameOf(v.by)}${v.fromSeat ? `(${v.fromSeat} 자리)` : ''}가 done ${v.result}로 넘김${v.escalated ? ', 되돌아감 상한을 넘어 올라옴' : ''}` : `@${this.nameOf(v.by || unit.from)}가 맡김`;
      return seatHeader({ seat: ctx.name, unitId: unit.id, caseId: unit.caseId, by, guide: !!ctx.seat.guide, docs: seatDocsOf(ctx.def, ctx.name) }); // P188: 세 줄. 값과 자리 목록은 atrium me. P219: 문서 목록 꼬리
    }
    return unitHeader({ parent: this.nameOf(unit.from), unitId: unit.id, rig: !!(b.rig && b.rig.activeForSession(unit.to)), kind: t ? t.kind || 'claude' : null }); // P208
  }
  // 붙잡아 둔 일을 넣을 차례인가(열린 시도가 없을 때 먼저 온 것 하나)
  pump(sessionId) {
    const st = this.store();
    if (!this.b.sessions.has(sessionId) || st.openTryOf(sessionId)) return null;
    const q = st.queuedUnitsOf(sessionId);
    if (!q.length) { this.queued.delete(sessionId); return null; }
    return this.dispatch(q[0], { later: true });
  }
  // 이어지는 지시를 그 시도에 적는다
  noteFollowup(tryRow, caller, deliveryId, { now = false } = {}) {
    this.store().addEvent(tryRow.sessionId, 'unit_followup', { unitId: tryRow.unitId, tryId: tryRow.id, from: caller.name, deliveryId, ...(now ? { now: true } : {}) });
  }

  // ---------- atrium wait가 done 값을 받는 길 ----------
  addWaiter(fromId, toId) {
    const k = `${fromId}>${toId}`;
    const w = { got: null };
    if (!this.waiters.has(k)) this.waiters.set(k, new Set());
    this.waiters.get(k).add(w);
    return w;
  }
  removeWaiter(fromId, toId, w) {
    const k = `${fromId}>${toId}`; const set = this.waiters.get(k);
    if (set) { set.delete(w); if (!set.size) this.waiters.delete(k); }
  }
  view(tr, { alreadyDelivered = false } = {}) {
    const u = this.store().getUnit(tr.unitId) || {};
    return { id: tr.unitId, tryId: tr.id, status: u.status || null, result: tr.result, text: tr.doneText, at: tr.endedAt, claimedBy: tr.claimedBy, alreadyDelivered };
  }
  // 위 세션이 atrium wait를 칠 때(기다리는 중 done이 오지 않았으면): 그 하위에게서 마지막으로 done이 닫은 시도.
  // 대기열 것이 아직 들어가지 않았으면 취소하고 기다림이 가져간다. 이미 들어갔거나 기다림이 가져갔으면 "이미 전함"
  //   after: 위 세션이 그 하위에게 마지막으로 보낸 글의 시각. 그 뒤에 닫힌 일만 본다(새 글의 턴을 기다리는데 옛 값을 붙이지 않게)
  claimForWait(caller, t, { after = 0 } = {}) {
    const b = this.b; const st = this.store();
    const tr = st.lastDoneTry(caller.sessionId, t.sessionId);
    if (!tr || (after && (tr.endedAt || 0) < after)) return null;
    if (tr.claimedBy === 'queue' && tr.noticeDeliveryId) {
      const row = st.getDelivery(tr.noticeDeliveryId);
      if (row && row.status === 'queued') {
        try {
          b.queue.cancel(tr.noticeDeliveryId);
          st.updateTry(tr.id, { claimedBy: 'wait' });
          st.addEvent(caller.sessionId, 'unit_claim', { unitId: tr.unitId, tryId: tr.id, by: 'wait', cancelled: tr.noticeDeliveryId });
          return this.view(st.getTry(tr.id));
        } catch { /* 그새 보내기 시작했다 → 이미 전함 */ }
      }
    }
    return this.view(tr, { alreadyDelivered: true });
  }

  // 기다림이 가져갔지만 그 명령이 답을 받기 전에 끊겼다: 대기열로 보낸다(값을 잃지 않게)
  requeue(tryId) {
    const b = this.b; const st = this.store();
    const tr = st.getTry(tryId); const unit = tr ? st.getUnit(tr.unitId) : null;
    if (!tr || !unit || tr.claimedBy !== 'wait' || !b.sessions.has(unit.from)) return null;
    const d = b.queue.enqueue(unit.from, doneNotice({ child: this.nameOf(unit.to), unitId: unit.id, result: tr.result, text: tr.doneText, spec: unit.spec }));
    st.updateTry(tr.id, { claimedBy: 'queue', noticeDeliveryId: d.deliveryId });
    st.addEvent(unit.from, 'unit_claim', { unitId: unit.id, tryId: tr.id, by: 'queue', why: 'wait aborted' });
    return d;
  }

  // ---------- atrium done ok|failed "<글>" ----------
  // 검사(값, 글, 열린 시도) → { result, text, tr }
  doneCheck(caller, o = {}) {
    const result = String(o.result || '');
    // P185: 자리 세션은 rig 정의의 results 낱말만(없으면 ok, failed)
    const seatResults = this.branch && this.branch.flow ? this.branch.flow.resultsFor(caller) : null;
    if (seatResults && !seatResults.includes(result)) throw apiError('bad_request', `rig 자리 ${caller.rigSeat}의 done 값은 ${seatResults.join(', ')} 가운데 하나다: ${result || '(없음)'}. 사용: atrium done <값> "<보고>"`, { results: seatResults });
    if (!seatResults && !DONE_RESULTS.includes(result)) throw apiError('bad_request', `결과는 ok 또는 failed다: ${result || '(없음)'}. 사용: atrium done ok|failed "<보고>"`);
    const text = o.text == null ? '' : String(o.text);
    if (!text.trim()) throw apiError('bad_request', '보고 글을 준다: atrium done ok|failed "<보고>"');
    if (text.length > DONE_TEXT_MAX) throw apiError('bad_request', `글이 너무 길다(${text.length}자, ${DONE_TEXT_MAX}자까지). 파일에 쓰고 그 경로를 적는다.`);
    const tr = this.store().openTryOf(caller.sessionId);
    if (!tr) throw apiError('no_unit', '열린 일이 없다. atrium done은 보드가 맡긴 일(첫 요청 앞에 "[Atrium 보드] … 맡긴 일 u…" 머리가 붙은 일)을 닫는다. 지금 일 보기: atrium item. 머리 없이 받은 일은 지시에 적힌 방법으로 보고한다.');
    return { result, text, tr };
  }
  // P182: 명령(/branch/done)의 길. 켜진 rig의 done 훅이 시도를 닫기 전에 돈다. 거절이면 시도는 열린 채 rig_rejected(종료 코드 1과 까닭)
  async doneVerb(caller, o = {}) {
    const { result, text, tr } = this.doneCheck(caller, o);
    const rig = this.b.rig;
    if (rig) {
      const h = await rig.done({ caller, tryRow: tr, unit: this.store().getUnit(tr.unitId), result, text });
      if (h.action === 'reject') {
        this.store().addEvent(caller.sessionId, 'unit_done_rejected', { unitId: tr.unitId, tryId: tr.id, result, reason: h.reason });
        throw apiError('rig_rejected', `rig의 done 훅이 닫기를 거절했다(일 ${tr.unitId}은 열린 채다): ${h.reason}`);
      }
      const again = this.store().openTryOf(caller.sessionId);
      if (!again || again.id !== tr.id) throw apiError('no_unit', '훅이 도는 사이 그 일이 닫혔다. 지금 일 보기: atrium item');
    }
    // P185: 자리 세션의 done은 흐름 줄({ from: 자리, on: 값 })을 따라 넘어간다. 맞는 줄이 없으면 0단계처럼 건 주인(일의 상위)에게
    const flow = this.branch && this.branch.flow;
    const unit = this.store().getUnit(tr.unitId);
    const route = flow ? flow.routeFor(caller, unit, result) : null;
    const out = this.done(caller, o, { flowClaim: !!(route && route.lines.length) });
    if (route && route.lines.length) {
      const ar = await flow.afterDone(caller, unit, result, text, route);
      out.flow = this.store().unitsOfCase(unit.caseId).filter((u) => u.via && u.via.prevUnit === unit.id).map((u) => ({ unit: u.id, seat: u.seat, to: u.to ? this.nameOf(u.to) : null, waiting: !u.to }));
      if (ar && ar.reports && ar.reports.length) out.reports = ar.reports.map((x) => ({ seat: x.seat, to: x.to, escalated: x.escalated })); // P194: 건 주인에게 간 보고
      const c = this.store().getCase(unit.caseId);
      out.case = c ? { id: c.id, state: c.state, blockedReason: c.blockedReason } : null;
    } else if (route) { flow.caseCheck(unit.caseId); flow.pumpSoon(); if (flow.doneToOwner) flow.doneToOwner(caller, unit, result); const c = this.store().getCase(unit.caseId); out.case = c ? { id: c.id, state: c.state } : null; }
    return out;
  }
  // P185: opts.flowClaim — 흐름 줄이 값을 가져간다(상위에게 보내지 않는다, claimed_by flow)
  done(caller, o = {}, { flowClaim = false } = {}) {
    const b = this.b; const st = this.store();
    const { result, text, tr } = this.doneCheck(caller, o);
    const unit = st.getUnit(tr.unitId);
    const now = Date.now();
    st.updateTry(tr.id, { result, doneText: text, endedAt: now });
    st.updateUnit(unit.id, { status: result === 'failed' ? 'failed' : 'done', closedAt: now }); // P185: rig의 다른 값(rejected 등)도 닫힘(done)
    const parent = b.sessions.get(unit.from) || null;
    const val = { result, text };
    let claimedBy, noticeDeliveryId = null;
    const ws = this.waiters.get(`${unit.from}>${unit.to}`);
    const human = unit.from === HUMAN_FROM; // P190: 사람이 맡긴 rig 제작 일. 값은 판 이벤트(rig.builder)로 창에 간다
    if (flowClaim) claimedBy = 'flow';
    else if (human) claimedBy = 'human';
    else if (!parent || unit.from === unit.to) claimedBy = 'record'; // P185: 건 주인이 자기 일을 닫음(주인에게 다시 보내지 않는다)
    else if (ws && ws.size) { claimedBy = 'wait'; for (const w of ws) w.got = { ...val, tryId: tr.id }; }
    else {
      const d = b.queue.enqueue(parent.sessionId, doneNotice({ child: this.nameOf(caller.sessionId), unitId: unit.id, result, text, spec: unit.spec }));
      claimedBy = 'queue'; noticeDeliveryId = d.deliveryId;
    }
    st.updateTry(tr.id, { claimedBy, noticeDeliveryId });
    // 연결 기록: 위 → 하위 선에 보고(답)로
    const l = parent && !flowClaim && unit.from !== unit.to ? (st.linkByPair(unit.from, unit.to) || null) : null;
    if (l && !l.removedAt) b.linkEvent(l, 'reply', text, { via: 'atrium', verb: 'done', result, unitId: unit.id, claimedBy, ...(noticeDeliveryId ? { deliveryId: noticeDeliveryId } : {}) });
    st.addEvent(caller.sessionId, 'unit_done', { unitId: unit.id, tryId: tr.id, result, chars: text.length, claimedBy, noticeDeliveryId });
    if (unit.caseId) rigEvent(b, { kind: 'done', caseId: unit.caseId, unitId: unit.id, tryId: tr.id, seat: caller.rigSeat || unit.seat || null, session: caller.sessionId, value: result, actor: 'agent', ref: noticeDeliveryId, text: clip(text.replace(/\s+/g, ' '), 200), data: { chars: text.length, claimedBy, ms: now - (tr.startedAt || now) } }); // P217
    b.log(`unit ${unit.id} done ${result} by ${caller.name} → ${parent ? parent.name : '(closed)'} via ${claimedBy}`);
    if (this.branch && this.branch.news) this.branch.news.onDone(caller, unit, result, text); // P204: 동료 소식에 done 한 줄
    if (human && unit.origin === BUILDER_ORIGIN && b.rigSetup) try { b.rigSetup.onDone(unit, st.getTry(tr.id)); } catch (e) { b.log('rig builder done error', e.stack); }
    const next = this.pump(caller.sessionId);
    return { unit: unit.id, result, parent: this.nameOf(unit.from), parentOpen: !!parent, claimedBy, next: next ? { unit: next.tryRow.unitId } : null, queued: st.queuedUnitsOf(caller.sessionId).length, ...(unit.caseId ? { caseId: unit.caseId, seat: caller.rigSeat || null } : {}) };
  }

  // ---------- atrium item | items ----------
  item(caller) {
    const st = this.store();
    const tr = st.openTryOf(caller.sessionId);
    const queued = st.queuedUnitsOf(caller.sessionId).length;
    if (!tr) return { item: null, queued };
    const u = st.getUnit(tr.unitId);
    const flow = this.branch && this.branch.flow;
    const ctx = flow && u.caseId ? flow.seatCtx(caller) : null; // P185
    return { item: { id: u.id, from: this.nameOf(u.from), origin: u.origin, spec: u.spec, createdAt: u.createdAt, startedAt: tr.startedAt, tries: st.triesOfUnit(u.id).length, stopReason: tr.stopReason, ...(u.caseId ? { caseId: u.caseId, seat: u.seat, by: u.via && u.via.by ? this.nameOf(u.via.by) : null, results: ctx ? ctx.def.results : null, docs: ctx ? seatDocsOf(ctx.def, ctx.name) : null } : {}) }, queued }; // P219: docs(머리의 문서 목록)
  }
  items(caller, o = {}) {
    const st = this.store();
    const limit = Math.min(Math.max(Number(o.limit) || 30, 1), 200);
    const units = st.unitsFrom(caller.sessionId, limit);
    const toolCounts = st.toolRunCounts ? st.toolRunCounts(units.map((u) => u.id)) : {}; // P183: 일마다 도구 실행 수
    const rows = units.map((u) => {
      const tr = st.lastTryOfUnit(u.id);
      return { id: u.id, to: u.to ? this.nameOf(u.to) : null, status: u.status, origin: u.origin, spec: clip(u.spec.replace(/\s+/g, ' '), 120), createdAt: u.createdAt, closedAt: u.closedAt,
        ...(u.caseId ? { caseId: u.caseId, seat: u.seat, waiting: !u.to } : {}), // P185
        queued: !tr && u.status === 'open', result: tr ? tr.result : null, text: tr && tr.doneText ? clip(tr.doneText, 1500) : null, stopReason: tr ? tr.stopReason : null, claimedBy: tr ? tr.claimedBy : null, toolRuns: toolCounts[u.id] || 0 };
    });
    return { items: rows, open: rows.filter((r) => r.status === 'open').length };
  }

  // ---------- 상태 변화(L4 자리) ----------
  // 그 시도의 턴이 done 없이 끝나 쉬면 stop_reason을 적는다. 자기 아래에 열린 일이 있으면 하위를 기다리는 것이라 적지 않는다.
  // 붙잡아 둔 다른 일이 있으면 이 시도를 끝내고(일은 열린 채) 다음 일을 넣는다.
  // P181: 멈춤(보고 없이 쉼, 오류, 사람이 필요함)을 상위에게 한 번 알린다(unit-stops.mjs)
  onSession(s, sum) {
    const sid = s.sessionId; const st = this.store();
    const prev = this.prev.get(sid);
    this.prev.set(sid, sum.state);
    if (sum.state === 'exited' && this.onExited(s, sum)) return; // P216
    const tr = prev !== sum.state ? st.openTryOf(sid) : null;
    const why = this.stops.onState(s, sum, prev, tr);
    if (why) {
      st.updateTry(tr.id, { stopReason: why });
      st.addEvent(sid, 'unit_stop', { unitId: tr.unitId, tryId: tr.id, why });
      this.stopEvent(s, tr, why);
      if (why !== 'needs_human' && this.queued.has(sid)) { st.updateTry(tr.id, { endedAt: Date.now() }); this.pump(sid); }
    }
    if (this.queued.has(sid) && (sum.state === 'ready' || sum.state === 'sleeping')) this.pump(sid); // 백엔드가 다시 뜬 뒤 등
  }
  // P217: 건의 시도가 보고 없이 멈춤(try_stopped). tree_quiet는 나무 전체의 쉼이라 장부 kind가 아니다
  stopEvent(s, tr, why, detail = null) {
    if (!tr || why === 'tree_quiet') return;
    const u = this.store().getUnit(tr.unitId);
    if (!u || !u.caseId) return;
    rigEvent(this.b, { kind: 'try_stopped', caseId: u.caseId, unitId: u.id, tryId: tr.id, seat: s.rigSeat || u.seat || null, session: s.sessionId, value: why, actor: 'board', text: detail ? String(detail) : null });
  }
  // P216: 판이 띄운 세션의 에이전트가 끝나 셸만 남았다(exited). 열린 시도를 stop_reason exited로 닫고 위 세션(rig면 건 주인)에게 한 번 알린다.
  //   rig 건의 일은 열린 채 둔다(건은 blocked, 자리 한도에서 빠짐, `atrium rig retry`로 다시 맡긴다: rig-flow onTryExited). 그 밖의 일은 취소한다(다시 맡기기 대신 알리기만).
  //   백엔드가 다시 떴을 때 이미 끝나 있던 세션도 첫 방송에서 같은 길을 탄다. → 'exited' | null
  onExited(s, sum) {
    const b = this.b; const st = this.store(); const sid = s.sessionId;
    const exit = sum.exit || (s.rt && s.rt.exit) || null;
    if (!agentExited(exit) || (b.killing && b.killing.has(sid))) return null;
    const tr = st.openTryOf(sid);
    if (!tr) return null;
    const now = Date.now();
    const unit = st.getUnit(tr.unitId);
    st.updateTry(tr.id, { endedAt: now, stopReason: 'exited' });
    st.addEvent(sid, 'unit_stop', { unitId: tr.unitId, tryId: tr.id, why: 'exited', exit: { kind: exit.kind, code: exit.code ?? null } });
    b.log(`unit ${tr.unitId} try ${tr.id} stopped: ${this.nameOf(sid)} exited (${exit.kind}${exit.code != null ? ` code ${exit.code}` : ''})`);
    const flow = this.branch && this.branch.flow;
    let detail = null;
    if (unit && unit.caseId && flow) { try { detail = flow.onTryExited(s, unit, tr); } catch (e) { b.log('rig try exited error', e.stack); } }
    else if (unit && unit.status === 'open') { st.updateUnit(unit.id, { status: 'cancelled', closedAt: now }); detail = unit.from === HUMAN_FROM ? null : '다시 맡기려면 새 하위를 띄운다(atrium child)'; }
    this.stops.onExited(tr, unit, detail);
    return 'exited';
  }
  // 세션이 끝났다: 열린 시도는 closed로 끝나고 그 일과 붙잡아 둔 일은 취소된다.
  // P181: 상위에게 멈춤(closed)을 알린다(위 세션의 child-kill이면 알리지 않는다) → 알림을 건 상위 ID | null
  onClosed(s, { reason = null, byParent = false } = {}) {
    const st = this.store(); const now = Date.now();
    const tr = st.openTryOf(s.sessionId);
    const unit = tr ? st.getUnit(tr.unitId) : null;
    if (tr) { st.updateTry(tr.id, { endedAt: now, stopReason: 'closed' }); st.updateUnit(tr.unitId, { status: 'cancelled', closedAt: now }); this.stopEvent(s, tr, 'closed', reason); }
    for (const u of st.queuedUnitsOf(s.sessionId)) st.updateUnit(u.id, { status: 'cancelled', closedAt: now });
    this.queued.delete(s.sessionId);
    this.prev.delete(s.sessionId);
    return this.stops.onClosed(s, tr, unit, reason, { byParent });
  }
}
