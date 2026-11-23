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
import { UnitStops, launchArgsSuspect, badArgsText } from './unit-stops.mjs'; // P181: 보고 없이 멈춤 알림
import { checkRecordFiles, copyRecords, recordFolder, recordLines, recordBrief, mainCheckoutOf, readRecord } from './records.mjs'; // P334: done --record

// P216: 에이전트만 끝나고 셸 패널이 남은 것을 멈춤(exited)으로 보는가. 판이 끄라고 한 것(잠재우기·끄기·child-kill·옮기기·다시 띄우기: normal),
//   사람이 끝낸 것(/exit·Ctrl+C·종료 코드 0·130: user), 신뢰 거부(trust_declined), 터미널 서버가 꺼짐(terminal_stopped, 판이 되살린다)은 아니다.
//   남는 것은 other(충돌, 프로세스가 죽음, 까닭 모를 끝남)다. 종류(Claude Code·Codex·AGY·pi·opencode)와 상관없이 hc의 놓임(agent_released)과 종료 코드로 정한다
export const agentExited = (exit) => !!exit && exit.kind === 'other' && !exit.requested;

function apiError(code, message, extra = {}) { return Object.assign(new Error(message), { code }, extra); }
const newId = (p, n = 3) => p + crypto.randomBytes(n).toString('hex');
export const DONE_RESULTS = ['ok', 'failed'];
// 알림에 보이는 일 이름. P267: 합치기 일은 첫 줄("합치기: @하위 (브랜치 → 합칠 브랜치)")만
export const unitTitle = (u) => (u && (u.origin === 'merge' || u.origin === 'merge_request') ? String(u.spec || '').split('\n')[0] : u ? u.spec : ''); // P321: 병합 맡기기 일도 첫 줄
const DONE_TEXT_MAX = 100000;
// P296: 판이 마지막 답으로 닫을 때 턴의 답을 기다리는 상한과 보고 머리 표시
export const FALLBACK_ANSWER_MS = 20000;
export const FALLBACK_MARK = '[판이 마지막 답으로 닫음]';

// 첫 요청 머리(세 줄). 맨 위 관계 줄은 text.mjs RELATION_LINE과 같은 꼴이라 카드에는 아래 할 일만 지시로 보인다
// P208: Codex(Windows PowerShell 5.1)는 글 안의 큰따옴표를 빼먹으므로 둘째 줄 끝에 --file 길을 붙인다
export const PS_DONE_TAIL = '여러 줄이나 큰따옴표가 든 보고는 파일에 쓰고 `atrium done ok --file <경로>`로 준다.';
// P257: docs = 문서가 있는 워크스페이스면 셋째 줄 끝에 "문서는 고치지 않고 보고만"(doc-check.mjs workerTail)
// P267: merge = 브랜치에서 일하는 하위면 셋째 줄 끝에 합치기 한 마디(merger.mjs MERGE_CHILD_TAIL)
// P334: 둘째 줄 끝 한 마디(일 결과 파일은 커밋하지 않고 --record)
export const RECORD_TAIL = '조사·감사·제안·측정·인계 결과 파일은 커밋하지 않고 `--record <파일>`로 붙인다.';
export function unitHeader({ parent, unitId, kind = null, docs = null, merge = null }) {
  return [
    `[Atrium 보드] 관계: 너는 @${parent}의 하위 워커다. 아래 일은 @${parent}가 맡긴 일 ${unitId}이다(지금 일 보기: \`atrium item\`).`,
    `[Atrium 보드] 끝나면 \`atrium done ok "<보고>"\`(못 했으면 \`atrium done failed "<까닭>"\`)로 닫고 쉰다. 일이 보고하라는 것은 done 글에 넣고 다른 길로 따로 보내지 않는다. ${RECORD_TAIL}${kind === 'codex' ? ` ${PS_DONE_TAIL}` : ''}`,
    `[Atrium 보드] 사람이 직접 다르게 시키면 그것을 따른다.${docs ? ` ${docs}` : ''}${merge ? ` ${merge}` : ''}`, // 판 줄은 세 줄 이하라 덧붙임은 셋째 줄 끝에
  ].join('\n');
}
// 위 세션이 받는 done 글(판 알림 꼴이라 위 세션 카드의 마지막 지시가 되지 않는다)
// P257: extra = 글 끝에 붙는 판 줄(문서 규칙, doc-watch.mjs doneLines)
export function doneNotice({ child, unitId, result, text, spec, extra = [] }) {
  return `[Atrium 보드] @${child}가 일 ${unitId}("${clip(String(spec || '').replace(/\s+/g, ' '), 60)}")을 닫았다: ${result}\n${text}${extra.length ? `\n\n${extra.join('\n')}` : ''}`;
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
  nameOf(id) { const s = this.b.sessions.get(id); if (s) return shownName(s) || s.name; const r = this.branch && this.branch.rowOf ? this.branch.rowOf(id) : null; return r ? r.name : '?'; }
  // 그 세션이 caller의 일 하위인가(일 관계 P156 workParentOf)
  isWorkSub(callerId, targetId) { return !!this.branch && this.branch.relIndex().workParentOf(targetId) === callerId; }

  // atrium prompt·wake --prompt가 무엇이 되는가. → { kind: 'plain' } | { kind: 'followup', tryRow, unit } | { kind: 'unit', hold }
  plan(caller, t, { now = false } = {}) {
    const st = this.store();
    const open = st.openTryOf(t.sessionId);
    const ou = open ? st.getUnit(open.unitId) : null;
    if (ou && ou.from === caller.sessionId) return { kind: 'followup', tryRow: open, unit: ou };
    if (now || !this.isWorkSub(caller.sessionId, t.sessionId)) return { kind: 'plain' };
    return { kind: 'unit', hold: !!open || st.queuedUnitsOf(t.sessionId).length > 0 };
  }
  // 일을 만든다. hold면 판이 붙잡아 두고(앞 시도가 끝나면 넣는다), 아니면 바로 머리를 붙여 대기열에 넣는다 → { unit, d, header } | { unit, held: true, ahead }
  create(caller, t, spec, origin) {
    const st = this.store();
    const hold = !!st.openTryOf(t.sessionId) || st.queuedUnitsOf(t.sessionId).length > 0;
    const unit = { id: newId('u'), from: caller.sessionId, to: t.sessionId, origin, spec: String(spec), status: 'open', createdAt: Date.now() };
    st.insertUnit(unit);
    if (this.b.docs) this.b.docs.onDelegate(caller); // P257: 첫 위임 때 .atrium/(git 밖)
    st.addEvent(t.sessionId, 'unit_open', { unitId: unit.id, from: caller.name, origin, held: hold, chars: unit.spec.length });
    this.b.log(`unit ${unit.id} ${caller.name} → ${t.name} (${origin}${hold ? ', held' : ''})`);
    if (hold) { this.queued.add(t.sessionId); return { unit, held: true, ahead: st.queuedUnitsOf(t.sessionId).length - 1 + (st.openTryOf(t.sessionId) ? 1 : 0) }; }
    return { unit, ...this.dispatch(unit) };
  }
  // 일의 새 시도: 머리를 붙여 대기열에 넣고 시도를 적는다
  dispatch(unit, { later = false } = {}) {
    const b = this.b; const st = this.store();
    const header = this.headerOf(unit);
    const tail = unit.origin === 'merge' && b.merger ? b.merger.tailFor(unit) : ''; // P267: 그 merger의 처음 일이면 merger 안내를 붙인다
    const d = b.queue.enqueue(unit.to, `${header}\n\n${unit.spec}${tail}`, { origin: { kind: 'agent', session: unit.from } }); // P182: 출처(맡긴 세션)
    const tr = { id: newId('t', 4), unitId: unit.id, sessionId: unit.to, header: true, deliveryId: d.deliveryId, startedAt: Date.now() };
    st.insertTry(tr);
    st.addEvent(unit.to, 'unit_try', { unitId: unit.id, tryId: tr.id, deliveryId: d.deliveryId, later });
    if (!st.queuedUnitsOf(unit.to).length) this.queued.delete(unit.to);
    if (later && this.onDispatch) try { this.onDispatch(unit, d, header); } catch (e) { b.log('unit dispatch hook error', e.stack); }
    return { d, tryRow: st.getTry(tr.id), header };
  }
  // 일 머리
  headerOf(unit) {
    const b = this.b;
    const t = b.sessions.get(unit.to);
    if (unit.origin === 'merge' && b.merger) return b.merger.headerFor(unit); // P267: 합치기 일 머리
    if (unit.origin === 'merge_request' && b.wtSessions) return b.wtSessions.headerFor(unit); // P321: 사람이 판에서 맡긴 병합(worktree-session.mjs)
    return unitHeader({ merge: b.merger ? b.merger.childTail(t) : null, /* P267 */ parent: this.nameOf(unit.from), unitId: unit.id, kind: t ? t.kind || 'claude' : null, docs: b.docs ? b.docs.headerTail(t) : null }); // P208. P257: 문서 한 마디
  }
  // 붙잡아 둔 일을 넣을 차례인가(열린 시도가 없을 때 먼저 온 것 하나)
  pump(sessionId) {
    const st = this.store();
    if (!this.b.sessions.has(sessionId) || st.openTryOf(sessionId)) return null;
    if (this.b.merger && this.b.merger.retiring.has(sessionId)) return null; // P267: 닫을 merger에게는 넣지 않는다(새 merger가 받는다)
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
    return { id: tr.unitId, tryId: tr.id, status: u.status || null, result: tr.result, text: tr.doneText, at: tr.endedAt, claimedBy: tr.claimedBy, alreadyDelivered, ...(u.records ? { records: recordLines(u.records) } : {}) }; // P334
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
    const d = b.queue.enqueue(unit.from, doneNotice({ child: this.nameOf(unit.to), unitId: unit.id, result: tr.result, text: tr.doneText, spec: unitTitle(unit), extra: recordLines(unit.records) })); // P334: 기록 줄
    st.updateTry(tr.id, { claimedBy: 'queue', noticeDeliveryId: d.deliveryId });
    st.addEvent(unit.from, 'unit_claim', { unitId: unit.id, tryId: tr.id, by: 'queue', why: 'wait aborted' });
    return d;
  }

  // ---------- atrium done ok|failed "<글>" ----------
  // 검사(값, 글, 열린 시도) → { result, text, tr }
  doneCheck(caller, o = {}) {
    const result = String(o.result || '');
    if (!DONE_RESULTS.includes(result)) throw apiError('bad_request', `결과는 ok 또는 failed다: ${result || '(없음)'}. 사용: atrium done ok|failed "<보고>"`);
    const text = o.text == null ? '' : String(o.text);
    if (!text.trim()) throw apiError('bad_request', '보고 글을 준다: atrium done ok|failed "<보고>"');
    if (text.length > DONE_TEXT_MAX) throw apiError('bad_request', `글이 너무 길다(${text.length}자, ${DONE_TEXT_MAX}자까지). 파일에 쓰고 그 경로를 적는다.`);
    const tr = this.store().openTryOf(caller.sessionId);
    if (!tr) throw apiError('no_unit', '열린 일이 없다. atrium done은 보드가 맡긴 일(첫 요청 앞에 "[Atrium 보드] … 맡긴 일 u…" 머리가 붙은 일)을 닫는다. 지금 일 보기: atrium item. 머리 없이 받은 일은 지시에 적힌 방법으로 보고한다.');
    return { result, text, tr };
  }
  // 위 세션이 받는 done 글(합치기 갈래가 부모에게 돌려보낼 때도 쓴다)
  noticeOf({ unit, result, text, extra = [] }) {
    const parent = this.b.sessions.get(unit.from);
    const more = parent && this.b.docs ? this.b.docs.doneLines(parent) : [];
    return doneNotice({ child: this.nameOf(unit.to), unitId: unit.id, result, text, spec: unitTitle(unit), extra: [...extra, ...more] });
  }
  // 명령(/branch/done)의 길. P267: ok면 먼저 git을 읽어 합치기 갈래(merger.mjs planFor)를 본다
  async doneVerb(caller, o = {}) {
    let merge = null, mergeCheck = null, records = null;
    { // P334: --record 파일을 검사해 주 체크아웃의 .atrium/records/로 복사한다(일을 닫기 전에. 거절이면 닫지 않는다)
      const { tr } = this.doneCheck(caller, o);
      const paths = Array.isArray(o.records) ? o.records : o.records != null ? [o.records] : [];
      if (paths.length) records = this.saveRecords(caller, this.store().getUnit(tr.unitId), paths);
    }
    if (this.b.merger) {
      const { result, tr } = this.doneCheck(caller, o);
      const unit = this.store().getUnit(tr.unitId);
      if (result === 'ok' && unit && unit.origin === 'merge') {
        // P275: merger의 ok는 판이 git으로 합칠 브랜치에 하위 끝 커밋이 들어갔는지 본 뒤에만 합침으로 친다
        try { mergeCheck = { unitId: unit.id, ...(await this.b.merger.verifyMerge(unit)) }; } catch (e) { this.b.log('merge verify error', e.stack); mergeCheck = { unitId: unit.id, hash: null, contains: null }; }
      } else if (result === 'ok') {
        try { merge = await this.b.merger.planFor(caller, unit); } catch (e) { this.b.log('merge plan error', e.stack); merge = null; }
      }
    }
    return this.done(caller, o, { merge, mergeCheck, records });
  }
  // P334: 기록을 받는 폴더(그 세션의 작업 폴더, 워크스페이스 뿌리, 주 체크아웃)와 주 체크아웃
  recordPlaces(s) {
    const st = this.store();
    const w = s.workspaceKey && st.getWorkspace ? st.getWorkspace(s.workspaceKey) : null;
    const cwd = (s.rt && s.rt.cwd) || s.cwd || null;
    const root = (w && w.root) || cwd;
    const main = root ? mainCheckoutOf(root) : null;
    return { roots: [s.cwd, s.rt && s.rt.cwd, w && w.root, main].filter(Boolean), main };
  }
  saveRecords(caller, unit, paths) {
    const { roots, main } = this.recordPlaces(caller);
    if (!main) throw apiError('bad_request', '이 세션의 워크스페이스를 몰라 기록을 둘 곳이 없다.');
    const files = checkRecordFiles(paths, roots);
    let rec;
    try { rec = copyRecords(files, main, recordFolder(this.nameOf(caller.sessionId), unit.id)); } catch (e) { throw apiError('record_failed', `기록을 복사하지 못했다: ${e.message}`); }
    this.store().addEvent(caller.sessionId, 'unit_records', { unitId: unit.id, dir: rec.dir, files: rec.files });
    this.b.log(`unit ${unit.id} records ${rec.files.length} → ${rec.dir}`);
    return rec;
  }
  // P334: 창 요약의 기록(그 세션이 맡아 기록을 남긴 마지막 일). 판이 다시 떠도 표에서 읽는다
  recordsOf(sessionId) {
    if (!this.recCache) this.recCache = new Map();
    if (!this.recCache.has(sessionId)) { let u = null; try { u = this.store().lastRecordUnitTo ? this.store().lastRecordUnitTo(sessionId) : null; } catch {} this.recCache.set(sessionId, u ? recordBrief(u.id, u.records) : null); }
    return this.recCache.get(sessionId);
  }
  // P334: 창의 기록 보기(records.read { session?, unit?, file? }) → { unitId, session, dir, files, doc }
  readRecords(p = {}) {
    const st = this.store();
    const u = p.unit ? st.getUnit(String(p.unit)) : p.session ? st.lastRecordUnitTo(String(p.session)) : null;
    if (!u || !u.records) throw apiError('not_found', '남긴 기록이 없다.');
    return { unitId: u.id, session: this.nameOf(u.to), spec: clip(unitTitle(u).replace(/\s+/g, ' '), 120), dir: u.records.dir, files: u.records.files, at: u.records.at, doc: readRecord(u.records, p.file || null) };
  }
  done(caller, o = {}, { merge = null, mergeCheck = null, records = null } = {}) {
    const b = this.b; const st = this.store();
    const { result: said, text, tr } = this.doneCheck(caller, o);
    const unit = st.getUnit(tr.unitId);
    if (merge && merge.unitId && merge.unitId !== tr.unitId) merge = null; // P267: 그새 다른 일이 열렸다
    if (mergeCheck && mergeCheck.unitId !== tr.unitId) mergeCheck = null;
    // P267: 합치기 일(merger가 닫음)이면 ok는 부모를 깨우지 않고(record), failed는 하위를 재운 채 둔다는 줄을 붙여 부모에게.
    // P275: ok여도 판이 합칠 브랜치에서 하위 끝 커밋을 찾지 못하면 failed로 친다(result가 바뀐다)
    const mergeDone = unit.origin === 'merge' && b.merger ? b.merger.onMergeDone(caller, unit, said, text, mergeCheck) : null;
    const result = mergeDone && mergeDone.result ? mergeDone.result : said;
    const now = Date.now();
    st.updateTry(tr.id, { result, doneText: text, endedAt: now });
    st.updateUnit(unit.id, { status: result === 'failed' ? 'failed' : 'done', closedAt: now, ...(records ? { records } : {}) });
    const recLines = recordLines(records); // P334: 위 세션이 받는 글 끝 "기록 <경로>"
    if (records) { if (!this.recCache) this.recCache = new Map(); this.recCache.set(caller.sessionId, recordBrief(unit.id, records)); }
    const parent = b.sessions.get(unit.from) || null;
    const val = { result, text, ...(mergeDone && mergeDone.unverified ? { extra: mergeDone.extra } : {}), ...(recLines.length ? { records: recLines } : {}) };
    let claimedBy, noticeDeliveryId = null;
    const ws = this.waiters.get(`${unit.from}>${unit.to}`);
    // P267: 브랜치에서 일한 하위의 done ok → 부모 대신 merger에게 합치기 일로
    const taken = merge && merge.route && b.merger && unit.origin !== 'merge' ? b.merger.take(merge, caller, unit, recLines.length ? `${text}\n\n${recLines.join('\n')}` : text) : null; // P334: merger도 기록 줄을 본다
    const human = !!(unit.meta && unit.meta.human); // P321: 사람이 맡긴 병합(worktree-session.mjs). 부모 대신 사람에게 결정 카드로
    if (taken) { claimedBy = 'merger'; if (ws && ws.size) for (const w of ws) w.got = { ...val, tryId: tr.id, merge: taken }; }
    else if (human && unit.origin === 'merge' && result === 'failed') { claimedBy = 'record'; if (b.wtSessions) b.wtSessions.onMergeFailed(unit, text, mergeDone ? mergeDone.extra : []); }
    else if (human && unit.origin === 'merge_request') { claimedBy = 'record'; if (b.wtSessions) b.wtSessions.onUnrouted(caller, unit, result, text, merge); }
    else if (!parent || unit.from === unit.to || (mergeDone && result === 'ok')) claimedBy = 'record';
    else if (ws && ws.size) { claimedBy = 'wait'; for (const w of ws) w.got = { ...val, tryId: tr.id }; }
    else {
      const extra = [...recLines, ...(mergeDone ? mergeDone.extra : []), ...(b.docs ? b.docs.doneLines(parent) : [])]; // P334: 기록 줄이 먼저 // P257: 지휘 세션이면 문서 규칙 한 줄(점검 경고는 전달 직전에 붙는다)
      const d = b.queue.enqueue(parent.sessionId, doneNotice({ child: this.nameOf(caller.sessionId), unitId: unit.id, result, text, spec: unitTitle(unit), extra }));
      claimedBy = 'queue'; noticeDeliveryId = d.deliveryId;
    }
    st.updateTry(tr.id, { claimedBy, noticeDeliveryId });
    // 연결 기록: 위 → 하위 선에 보고(답)로
    const l = parent && unit.from !== unit.to ? (st.linkByPair(unit.from, unit.to) || null) : null;
    if (l && !l.removedAt) b.linkEvent(l, 'reply', text, { via: 'atrium', verb: 'done', result, unitId: unit.id, claimedBy, ...(noticeDeliveryId ? { deliveryId: noticeDeliveryId } : {}) });
    st.addEvent(caller.sessionId, 'unit_done', { unitId: unit.id, tryId: tr.id, result, chars: text.length, claimedBy, noticeDeliveryId, ...(records ? { records: records.files.length } : {}) });
    if (records && b.broadcastSession) try { b.broadcastSession(caller, { cause: 'records' }); } catch {} // P334: 카드의 기록 단추
    b.log(`unit ${unit.id} done ${result} by ${caller.name} → ${parent ? parent.name : '(closed)'} via ${claimedBy}`);
    if (this.branch && this.branch.news && !(mergeDone && result === 'ok')) this.branch.news.onDone(caller, unit, result, text); // P204: 동료 소식에 done 한 줄. P267: 합침은 merger.mjs가 "합침 <해시>" 한 줄로
    const next = mergeDone && mergeDone.retire ? null : this.pump(caller.sessionId); // P267: 다섯 번을 채운 merger에게는 더 넣지 않는다(새 merger가 받는다)
    return { unit: unit.id, result, parent: this.nameOf(unit.from), parentOpen: !!parent, claimedBy, next: next ? { unit: next.tryRow.unitId } : null, queued: st.queuedUnitsOf(caller.sessionId).length, ...(taken ? { merge: taken } : {}), ...(merge && merge.ask ? { mergeAsk: true } : {}), ...(mergeDone ? { retire: !!mergeDone.retire } : {}), ...(records ? { records: { dir: records.dir, files: records.files } } : {}) };
  }

  // ---------- atrium item | items ----------
  item(caller) {
    const st = this.store();
    const tr = st.openTryOf(caller.sessionId);
    const queued = st.queuedUnitsOf(caller.sessionId).length;
    if (!tr) return { item: null, queued };
    const u = st.getUnit(tr.unitId);
    return { item: { id: u.id, from: this.nameOf(u.from), origin: u.origin, spec: u.spec, createdAt: u.createdAt, startedAt: tr.startedAt, tries: st.triesOfUnit(u.id).length, stopReason: tr.stopReason }, queued };
  }
  items(caller, o = {}) {
    const st = this.store();
    const limit = Math.min(Math.max(Number(o.limit) || 30, 1), 200);
    const units = st.unitsFrom(caller.sessionId, limit);
    const rows = units.map((u) => {
      const tr = st.lastTryOfUnit(u.id);
      return { id: u.id, to: u.to ? this.nameOf(u.to) : null, status: u.status, origin: u.origin, spec: clip(unitTitle(u).replace(/\s+/g, ' '), 120), // P267: 합치기 일은 첫 줄 createdAt: u.createdAt, closedAt: u.closedAt,
        queued: !tr && u.status === 'open', result: tr ? tr.result : null, text: tr && tr.doneText ? clip(tr.doneText, 1500) : null, stopReason: tr ? tr.stopReason : null, claimedBy: tr ? tr.claimedBy : null,
        ...(u.records ? { records: { dir: u.records.dir, files: u.records.files.map((f) => f.name) } } : {}), // P334
        ...(this.b.merger ? { merge: this.b.merger.itemMerge(u) } : {}) }; // P267: 합치기 상태(queued·merging·merged·failed·cancelled)
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
      this.recordStop(s, tr, why);
      if (why !== 'needs_human' && this.queued.has(sid)) { st.updateTry(tr.id, { endedAt: Date.now() }); this.pump(sid); }
    }
    if (this.queued.has(sid) && (sum.state === 'ready' || sum.state === 'sleeping')) this.pump(sid); // 백엔드가 다시 뜬 뒤 등
  }
  // P296: 판이 마지막 답으로 닫기(런처 칸 reportFallback last_answer: 하네스가 atrium을 못 돌린다). 턴이 끝난 뒤 그 턴의 답(turnAt 뒤)을
  //   FALLBACK_ANSWER_MS까지 기다려 done ok로 닫는다(글 머리에 판이 닫았다는 표시). 그새 done이 왔거나 다시 일하면 닫지 않는다
  async fallbackDone(s, tr, turnAt = 0) {
    const b = this.b; const st = this.store(); const sid = s.sessionId;
    const t0 = Date.now();
    const fresh = () => !!(s.rt && s.rt.lastAnswer && (s.rt.lastAnswerAt || 0) >= (turnAt || t0) - 1000);
    while (!fresh() && Date.now() - t0 < (this.fallbackMs ?? FALLBACK_ANSWER_MS)) await new Promise((r) => setTimeout(r, 300));
    const cur = st.openTryOf(sid);
    if (!cur || cur.id !== tr.id || !b.sessions.has(sid) || this.prev.get(sid) === 'working') return null;
    const answer = s.rt && s.rt.lastAnswer ? String(s.rt.lastAnswer) : '';
    const body = answer.trim() ? clip(answer, DONE_TEXT_MAX - 200) : '(마지막 답을 읽지 못했다)';
    const text = `${FALLBACK_MARK} ${body}`;
    st.addEvent(sid, 'unit_done_fallback', { unitId: tr.unitId, tryId: tr.id, chars: body.length, fresh: fresh() });
    b.log(`unit ${tr.unitId} closed by board with last answer of ${this.nameOf(sid)}`);
    try { return await this.doneVerb(s, { result: 'ok', text, fallback: true }); } catch (e) { b.log(`fallback done failed: ${e.message}`); return null; }
  }
  // 시도의 멈춤을 적는다(stop_reason, 세션 이벤트, 장부). P235: unit-stops가 늦게 적을 때도 쓴다
  recordStop(s, tr, why) {
    const st = this.store();
    st.updateTry(tr.id, { stopReason: why });
    st.addEvent(s.sessionId, 'unit_stop', { unitId: tr.unitId, tryId: tr.id, why });
  }
  // P216: 판이 띄운 세션의 에이전트가 끝나 셸만 남았다(exited). 열린 시도를 stop_reason exited로 닫고 위 세션에게 한 번 알린다.
  //   일은 취소한다(다시 맡기기 대신 알리기만).
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
    const sus = launchArgsSuspect(s.rt, exit); // P238: 띄운 지 곧바로 종료 코드 2
    if (s.rt) s.rt.launchSuspect = sus;
    if (sus) b.log(`${this.nameOf(sid)} exited ${sus.ms}ms after launch with code ${sus.code}: launch arguments may be invalid`);
    let detail = null;
    if (unit && unit.status === 'open') { st.updateUnit(unit.id, { status: 'cancelled', closedAt: now }); detail = '다시 맡기려면 새 하위를 띄운다(atrium child)'; }
    if (sus) detail = detail ? `${badArgsText(sus)}. ${detail}` : badArgsText(sus);
    this.stops.onExited(tr, unit, detail);
    return 'exited';
  }
  // 세션이 끝났다: 열린 시도는 closed로 끝나고 그 일과 붙잡아 둔 일은 취소된다.
  // P181: 상위에게 멈춤(closed)을 알린다(위 세션의 child-kill이면 알리지 않는다) → 알림을 건 상위 ID | null
  onClosed(s, { reason = null, byParent = false } = {}) {
    const st = this.store(); const now = Date.now();
    if (this.b.merger) try { this.b.merger.onClosing(s); } catch (e) { this.b.log('merger closing error', e.stack); } // P267: 줄 선 합치기 일은 취소하지 않고 새 merger에게
    const tr = st.openTryOf(s.sessionId);
    const unit = tr ? st.getUnit(tr.unitId) : null;
    if (tr) { st.updateTry(tr.id, { endedAt: now, stopReason: 'closed' }); st.updateUnit(tr.unitId, { status: 'cancelled', closedAt: now }); }
    for (const u of st.queuedUnitsOf(s.sessionId)) st.updateUnit(u.id, { status: 'cancelled', closedAt: now });
    this.queued.delete(s.sessionId);
    this.prev.delete(s.sessionId);
    return this.stops.onClosed(s, tr, unit, reason, { byParent });
  }
}

