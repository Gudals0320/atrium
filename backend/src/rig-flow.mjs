// P185: rig 3단계 — 자리(seat), 건(case), 자리로 보내기, done 값에 따른 넘김, 되돌아감 상한(docs research harness-arch.md 14절).
// rig를 "훅과 도구 묶음"에서 "흐름"으로 만든다. 정의 검사는 rig.mjs validateFlow, 표는 store-rig.mjs(rig_cases, rig_case_items, rig_seat_counters, sessions.rig_seat, work_units.case_id·seat·via).
// - 자리는 세션의 속성이다(sessions.rig_seat). 사람이 판 API rig.seat(이 PC의 창만)로 정하거나, 판이 자리를 위해 띄운다. 에이전트는 정하지 못한다.
//   켜진 rig의 정의에 그 자리가 있을 때만 자리 세션이다. 자리 없는 세션과 rig가 꺼진 워크스페이스는 0~2단계 그대로다.
// - keep 자리: 열린 세션 하나가 앉는다(없으면 판이 <자리> 이름으로 띄운다. 그 이름을 다른 열린 세션이 쓰면 <자리>-<n>).
//   fresh 자리: 일마다 새 세션 <자리>-<n>(n은 워크스페이스·자리마다 DB의 셈, 다시 쓰지 않는다). worktree면 일마다 <자리>-<일 ID> 워크트리.
//   max_live: 열린 시도를 쥔 그 자리 세션 수. 넘으면 일이 자리 줄에 선다(work_units.to_session ''). 끝난 fresh 세션은 판에 남고 수에 들지 않는다.
// - 자리 세션의 atrium prompt: 흐름에 { from: 내 자리, on: assign, to } 줄이 있으면 받는 자리에 일을 만들고(건이 이어진다), may에 있으면 일 없이 글만,
//   둘 다 아니면 거절하고 쓸 수 있는 자리를 알린다. 0단계의 이어지는 지시(내가 맡긴 열린 시도를 가진 세션에 다시 보냄)는 그대로다.
// - 자리 세션의 atrium done <값>: results의 낱말만 받는다. { from: 그 자리, on: 값 } 줄마다 받는 자리에 같은 건의 새 일(갈라짐). 넘김 글은 판이 만들고
//   deliver 훅(from flow)을 지난다. 맞는 줄이 없으면 done 값이 건의 주인에게 간다(0단계 보고와 같은 꼴).
// - 흐름이 만든 일의 상위(멈춤 알림을 받는 곳, work_units.from)는 건의 주인이고, 판이 자리를 위해 띄운 세션도 건의 주인의 하위로 띄운다(잠재우기 묶음·child-kill이 0단계 그대로).
// - 되돌아감 상한: 줄의 max를 건 안에서 센다(rig_cases.edge_counts). 넘으면 else → manager → 건 blocked + 건 주인에게 판 알림. 올릴 때 넘김 글에 건의 이력을 붙인다.
// - 건: 자리 세션이 일을 처음 맡기는 순간 생기고(그 세션이 어떤 건의 열린 시도를 쥐고 있으면 그 건을 잇는다), 열린 일이 없으면 done, 주인 세션이 닫히면 cancelled.
//   건이 띄운 세션과 워크트리를 rig_case_items에 적는다(판은 지우지 않는다. 5단계 관리자 자리가 정리한다).
// P188(5단계, 15절): 건은 만들어질 때의 정의 버전(rig_cases.version_n)을 쥐고 그 건의 자리·흐름·상한은 그 버전을 따른다(seatCtx·defOfCase).
//   느린 고리(cycles): 주기마다 받는 자리(보통 manager)에 새 건의 일 하나(판의 장부 요약 + run 출력). 다음 시각은 rig_cycles.
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { shownName } from './session-label.mjs';
import { clip } from './text.mjs';
import { SEAT_KINDS } from './rig.mjs';
import { spawnPlan, killTree } from './hook-runner.mjs'; // P188: 느린 고리의 run
import { rootedRun } from './tool-runs.mjs';
import { cleanEnv } from './proc-env.mjs';
import { SEAT_SPAWN } from './rig-amp.mjs'; // P189

function apiError(code, message, extra = {}) { return Object.assign(new Error(message), { code }, extra); }
const newId = (p, n = 3) => p + crypto.randomBytes(n).toString('hex');
const firstLine = (t, n = 100) => clip(String(t || '').split('\n').find((x) => x.trim()) || '', n);
export const CASE_STATES = ['open', 'done', 'blocked', 'waiting_owner', 'cancelled'];
// P194: 아직 끝나지 않은 건(흐름이 이어지고, 주인이 닫히면 cancelled). waiting_owner: 상한을 넘어 주인에게 보고로 올라가 주인의 다음 맡기기를 기다린다
const LIVE_CASE = new Set(['open', 'blocked', 'waiting_owner']);
const SPEC_HEAD_LINES = 6; // 넘김 글에 붙이는 건의 첫 할 일 줄 수

// 자리 세션의 일 머리(관계 줄 꼴이라 카드에는 아래 할 일만 지시로 보인다). 0단계 unitHeader 대신
// P188: 판 줄 세 줄 이하(15절). done 값과 보낼 수 있는 자리의 자세한 목록은 `atrium me`·`atrium guide`로 보내고 머리에는 가리킴만 남긴다
//   (머리가 길면 Claude Code가 첫 지시를 붙여 넣은 자료로 감싸는 경계를 더 자주 넘는다)
// guide: 그 자리의 안내 파일이 있으면 일을 시작하기 전에 읽으라고 한다(P185 개발용 판: 안내를 읽지 않은 모델이 자리의 일과 다르게 닫았다)
export function seatHeader({ seat, unitId, caseId, by, guide = false }) {
  return [
    `[Atrium 보드] 관계: 너는 rig의 ${seat} 자리다. 아래 일은 건 ${caseId}의 일 ${unitId}이다(${by}).`,
    '[Atrium 보드] 끝나면 `atrium done <값> "<보고>"`로 닫고 쉰다(값과 보낼 수 있는 자리는 `atrium me`). 보고는 done 글에만 넣는다.',
    `[Atrium 보드] 사람이 직접 다르게 시키면 그것을 따른다. ${guide ? '일을 시작하기 전에 `atrium guide`로 이 자리의 안내를 먼저 읽는다.' : '안내: `atrium guide`.'}`,
  ].join('\n');
}
// P193: 세션이 자리를 얻는 순간(사람의 rig.seat, rig.spawnSeat) 한 번 넣는 판 알림. 일 머리와 같이 세 줄 이하이고 모두 판 줄이라 카드의 지시가 되지 않는다.
//   흐름이 띄운 자리 세션은 첫 일의 머리(seatHeader)가 같은 것을 알려 이 알림을 받지 않는다. P191: 머리 없이 앉은 keep 자리(main)가
//   rig 흐름 대신 atrium child로 맡겨 건이 생기지 않았다
export function seatNotice({ seat, assign = [], may = [], results = [], guide = false }) {
  const where = [assign.length ? `일 맡기기: ${assign.join(', ')}` : null, may.length ? `글만: ${may.join(', ')}` : null].filter(Boolean).join(' · ');
  return [
    `[Atrium 보드] 관계: 사람이 너를 rig의 ${seat} 자리에 앉혔다. 이 워크스페이스의 일은 rig 흐름(자리와 건)으로 나눈다.`,
    where
      ? `[Atrium 보드] 일을 맡길 때는 \`atrium child\` 대신 \`atrium prompt <자리> "<할 일>"\`로 자리에 보낸다(${where}). 받는 자리의 세션은 보드가 띄운다.`
      : '[Atrium 보드] 이 자리는 다른 자리에 일을 맡기지 않는다.',
    `[Atrium 보드] 자리로 받은 일은 \`atrium done <값> "<보고>"\`로 닫는다(값: ${results.join(', ') || 'ok, failed'}). ${guide ? '먼저 `atrium guide`로 이 자리의 안내를 읽는다.' : '안내: `atrium guide`.'}`,
  ].join('\n');
}
export const seatLeftNotice = (seat) => `[Atrium 보드] 관계: 사람이 너를 rig의 ${seat} 자리에서 뺐다. 이제 자리 없는 세션이다(\`atrium child\`·\`atrium prompt <세션>\`이 rig 밖 규칙대로 된다).`;

// P193: 그 워크스페이스의 켜진 rig에 이 이름의 자리가 있으면 그 자리 이름(없으면 null). 자리 이름은 소문자·숫자·_라 <이름>-<n>은 겹치지 않는다
export function seatNamed(rig, key, name) {
  const r = rig && typeof rig.active === 'function' && key && name ? rig.active(key) : null;
  const n = String(name || '').toLowerCase();
  return r && r.def && r.def.seats && Object.prototype.hasOwnProperty.call(r.def.seats, n) ? n : null;
}
// P194: 흐름 줄의 받는 곳이 건 주인 세션 자신일 때 일 대신 넣는 보고(0단계 done 보고 doneNotice와 같은 판 알림 꼴).
//   haiku 메인이 주인에게 돌아온 넘김 일을 done으로 닫지 않아 건이 열린 채 남았다(P193). 주인에게 가는 것은 일이 아니라 보고다
//   머리에는 건의 첫 할 일을 인용한다(닫은 일의 글은 판이 만든 넘김 글이라 주인이 알아보기 어렵다)
export function ownerReportText({ caseId, fromSeat, fromName, unitId, firstSpec, result, doneText, escalated = null, history = [] }) {
  const lines = [`[Atrium 보드] rig 건 ${caseId}("${clip(String(firstSpec || '').replace(/\s+/g, ' '), 60)}"): ${fromSeat} 자리(@${fromName})가 일 ${unitId}을 닫았다: ${result}`];
  lines.push(escalated
    ? `[Atrium 보드] 이것은 보고다(atrium done으로 닫을 일이 아니다). 되돌아감 상한을 넘어 너에게 올라왔다: flow[${escalated.line}]은 이 건에서 이미 ${escalated.max}번 지났다. 건은 waiting_owner다. 다음 \`atrium prompt <자리> "<할 일>"\`이 이 건을 잇는다(건이 여럿이면 --case ${caseId}).`
    : '[Atrium 보드] 이것은 보고다(atrium done으로 닫을 일이 아니다). 건에 열린 일이 없으면 건은 done이다.');
  lines.push(String(doneText || '').replace(/\s+$/, ''));
  if (escalated && history.length) lines.push('', '--- 건의 이력(자리, 세션, 값, done 글 첫 줄) ---', ...history.map((h, i) => `${i + 1}. ${h.seat || '-'}(@${h.name}) ${h.result || h.status}${h.text ? `: ${h.text}` : ''}`));
  return lines.join('\n');
}
// 넘김 글(판이 만든다): 보낸 자리와 세션, 값, done 글, 건의 첫 할 일 앞 몇 줄, 올릴 때는 건의 이력
export function handoffText({ fromSeat, fromName, result, doneText, firstSpec, escalated = null, history = [] }) {
  const lines = [`${fromSeat} 자리(@${fromName})가 done ${result}로 넘긴 일이다.`];
  if (escalated) lines.push(`되돌아감 상한을 넘어 이 자리로 올라왔다: flow[${escalated.line}]은 이 건에서 이미 ${escalated.max}번 지났다.`);
  lines.push('', '--- 넘긴 done 글 ---', String(doneText || '').replace(/\s+$/, ''));
  if (firstSpec) {
    const head = String(firstSpec).split('\n');
    lines.push('', `--- 건의 첫 할 일(앞 ${Math.min(head.length, SPEC_HEAD_LINES)}줄) ---`, ...head.slice(0, SPEC_HEAD_LINES), ...(head.length > SPEC_HEAD_LINES ? ['…'] : []));
  }
  if (escalated && history.length) lines.push('', '--- 건의 이력(자리, 세션, 값, done 글 첫 줄) ---', ...history.map((h, i) => `${i + 1}. ${h.seat || '-'}(@${h.name}) ${h.result || h.status}${h.text ? `: ${h.text}` : ''}`));
  return lines.join('\n');
}

export class RigFlow {
  // b: 백엔드(store, sessions, rig, queue, log, linkEvent). branch: Branch(spawnChild, units, verbs)
  constructor(b, branch) {
    this.b = b; this.branch = branch;
    this.spawning = new Map(); // `${워크스페이스}|${자리}` → 띄우는 중인 수(max_live를 함께 넘지 않게)
    this.pumping = false;
    b.bus.on('closed', (s) => { try { this.onClosed(s); } catch (e) { b.log('rig flow closed error', e.stack); } });
    // 백엔드가 다시 뜬 뒤: 자리 줄(max_live)에 선 일을 다시 본다(세션이 다 붙은 뒤)
    if (b.store.seatWaitingAll && b.store.seatWaitingAll().length) { const t = setTimeout(() => this.pumpSoon(), 5000); if (t.unref) t.unref(); }
    // P188: 느린 고리. 다음 시각은 DB(rig_cycles)에 있고, 판이 꺼져 있던 동안 놓친 회는 한 번만 돈다
    this.cycleBusy = new Set(); this.cycleSkipNoted = new Set();
    const tickMs = Math.max(1000, Math.min(30000, Math.floor((b.rig && b.rig.cycleMin ? b.rig.cycleMin() : 3600000) / 4)));
    if (b.cfg && b.cfg.rigCycles !== false) { this.cycleTimer = setInterval(() => { this.cycleTick().catch((e) => b.log('rig cycle error', e.stack)); }, tickMs); if (this.cycleTimer.unref) this.cycleTimer.unref(); }
  }
  store() { return this.b.store; }
  units() { return this.branch.units; }
  nameOf(id) { return this.units().nameOf(id); }

  // ---------- 자리 ----------
  // 세션의 자리 맥락. 켜진 rig 정의에 그 자리가 있을 때만 → { key, r, def, seat, name } | null
  // P188: 건은 만들어질 때의 정의 버전을 쥔다. 그 건의 자리·흐름·상한은 그 버전을 따른다(훅과 도구는 지금 정의).
  //   o.caseId: 그 건의 버전(null이면 지금 정의). 주지 않으면 세션이 쥔 열린 시도의 건
  seatCtx(s, o = {}) {
    if (!s || !s.rigSeat || !this.b.rig) return null;
    const r = this.b.rig.active(s.workspaceKey);
    if (!r) return null;
    const caseId = o.caseId !== undefined ? o.caseId : this.openCaseOf(s);
    const c = caseId ? this.store().getCase(caseId) : null;
    const def = this.defOfCase(c, r);
    if (!def.seats || !def.seats[s.rigSeat]) return null;
    return { key: s.workspaceKey, r, def, seat: def.seats[s.rigSeat], name: s.rigSeat, versionN: c && c.versionN != null ? c.versionN : r.n ?? null };
  }
  openCaseOf(s) { const st = this.store(); const tr = st.openTryOf(s.sessionId); const u = tr ? st.getUnit(tr.unitId) : null; return u && u.caseId ? u.caseId : null; }
  // 건의 버전 정의(없거나 읽지 못하면 지금 정의)
  defOfCase(c, r = null) {
    const rr = r || (c && this.b.rig ? this.b.rig.active(c.workspaceKey) : null);
    if (!c || c.versionN == null || !this.b.rig) return rr ? rr.def : null;
    return this.b.rig.versionDef(c.workspaceKey, c.versionN) || (rr ? rr.def : null);
  }
  assignTargets(ctx) { return [...new Set(ctx.def.flow.filter((l) => l.from === ctx.name && l.on === 'assign').map((l) => l.to[0]))]; }
  resultsFor(s) { const ctx = this.seatCtx(s); return ctx ? ctx.def.results : null; }
  seatedOf(key, seat) { return [...this.b.sessions.values()].filter((x) => x.workspaceKey === key && x.rigSeat === seat); }
  liveCount(key, seat) {
    const st = this.store();
    return this.seatedOf(key, seat).filter((x) => st.openTryOf(x.sessionId)).length + (this.spawning.get(`${key}|${seat}`) || 0);
  }

  // 판 API rig.seat(사람만, 이 PC의 창): 세션의 자리를 정하거나(seat) 뗀다(null)
  // P193: notify면 자리를 얻을 때 판 알림 한 번(seatNotice), 비울 때 한 줄(seatLeftNotice). 같은 자리로 다시 정하면 알리지 않는다.
  //   notify 'spawned'(rig.spawnSeat): 판이 띄울 때 이미 자리를 적었으므로(backend.spawn의 SEAT_SPAWN) 같은 자리여도 알린다
  setSeat(s, seat, { by = 'human', notify = false } = {}) {
    const b = this.b; const st = this.store();
    const r = b.rig ? b.rig.active(s.workspaceKey) : null;
    if (!r) throw apiError('rig_off', `@${shownName(s)}의 워크스페이스에는 켜진 rig가 없다. 자리는 rig가 켜진 워크스페이스에서만 정한다.`);
    if ((s.kind || 'claude') === 'shell') throw apiError('not_agent', '셸에는 자리를 정하지 않는다.');
    const want = seat == null || seat === '' ? null : String(seat);
    if (want) {
      if (!r.def.seats || !r.def.seats[want]) throw apiError('bad_request', `rig에 자리 ${want}가 없다. 자리: ${r.def.seats ? Object.keys(r.def.seats).join(', ') : '(없음)'}`);
      if (r.def.seats[want].session === 'keep') {
        const other = this.seatedOf(s.workspaceKey, want).find((x) => x.sessionId !== s.sessionId);
        if (other) throw apiError('seat_taken', `keep 자리 ${want}에는 이미 @${shownName(other)}가 앉아 있다. 먼저 그 세션의 자리를 뗀다.`);
      }
    }
    const before = s.rigSeat || null;
    st.setSessionSeat(s.sessionId, want);
    s.rigSeat = want;
    st.addEvent(s.sessionId, 'rig_seat', { workspace: s.workspaceKey, seat: want, before, by });
    b.log(`rig seat ${s.name}: ${before || '-'} → ${want || '-'} (${by})`);
    if (b.broadcastSession) b.broadcastSession(s, { cause: 'rig_seat' });
    let noticeId = null;
    if (notify && (want !== before || (notify === 'spawned' && want)) && (want || before)) {
      const text = want ? this.seatNoticeOf(r.def, want) : seatLeftNotice(before);
      const d = b.queue.enqueue(s.sessionId, text);
      noticeId = d.deliveryId;
      st.addEvent(s.sessionId, 'rig_seat_notice', { seat: want, before, deliveryId: d.deliveryId });
    }
    return { session: shownName(s), sessionId: s.sessionId, seat: want, before, workspace: s.workspaceKey, ...(noticeId ? { noticeId } : {}) };
  }
  seatNoticeOf(def, seat) {
    const x = def.seats[seat] || {};
    return seatNotice({ seat, assign: [...new Set(def.flow.filter((l) => l.from === seat && l.on === 'assign').map((l) => l.to[0]))], may: x.may || [], results: def.results || [], guide: !!x.guide });
  }

  // ---------- 건 ----------
  newCase(key, owner) {
    const c = { id: newId('c'), workspaceKey: key, owner: owner.sessionId, state: 'open', createdAt: Date.now(), edgeCounts: {}, versionN: this.b.rig ? this.b.rig.currentN(key) : null }; // P188: 건이 쥐는 버전
    this.store().insertCase(c);
    this.store().addEvent(owner.sessionId, 'rig_case_open', { caseId: c.id, workspace: key, version: c.versionN });
    this.b.log(`rig case ${c.id} open by ${owner.name}`);
    return this.store().getCase(c.id);
  }
  // 보낸 세션이 어떤 건의 열린 시도를 쥐고 있으면 그 건(blocked·waiting_owner였으면 다시 open).
  // P194: 아니면 보낸 세션이 주인인 waiting_owner 건이 정확히 하나일 때 그 건, 그 밖은 새 건.
  //   caseId(atrium prompt --case): 그 건을 고른다(이 워크스페이스, 끝나지 않은 건, 주인이거나 그 건의 열린 시도를 쥔 세션)
  caseFor(caller, key, { caseId = null } = {}) {
    const st = this.store();
    if (caseId) {
      const want = String(caseId).trim();
      const c = st.getCase(want);
      if (!c || c.workspaceKey !== key) throw apiError('rig_case', `이 워크스페이스에 건 ${want}이 없다. 내 건 보기: atrium me`);
      if (!LIVE_CASE.has(c.state)) throw apiError('rig_case', `건 ${c.id}은 이미 ${c.state}다. 새 건은 --case 없이 보낸다.`);
      if (c.owner !== caller.sessionId && this.openCaseOf(caller) !== c.id) throw apiError('rig_case', `건 ${c.id}의 주인(@${this.nameOf(c.owner)})이 아니라 이 건을 고를 수 없다.`);
      return this.resumeCase(c, caller, 'case');
    }
    const tr = st.openTryOf(caller.sessionId);
    const u = tr ? st.getUnit(tr.unitId) : null;
    const c = u && u.caseId ? st.getCase(u.caseId) : null;
    if (c && LIVE_CASE.has(c.state)) return this.resumeCase(c, caller, 'held');
    const waiting = st.waitingCasesOfOwner ? st.waitingCasesOfOwner(caller.sessionId, key) : [];
    if (waiting.length === 1) return this.resumeCase(waiting[0], caller, 'waiting_owner');
    return this.newCase(key, caller);
  }
  // 끝나지 않은 건을 다시 open으로(blocked·waiting_owner였으면 기록)
  resumeCase(c, caller, why) {
    const st = this.store();
    if (c.state !== 'open') {
      st.updateCase(c.id, { state: 'open', blockedReason: null });
      st.addEvent(caller.sessionId, 'rig_case_resume', { caseId: c.id, from: c.state, why });
      this.b.log(`rig case ${c.id} resumed (${c.state} → open, ${why}) by ${caller.name}`);
      this.changed(c.workspaceKey);
    }
    return st.getCase(c.id);
  }
  // 열린 일이 없으면 done
  caseCheck(caseId) {
    const st = this.store(); const c = st.getCase(caseId);
    if (!c || c.state !== 'open') return c;
    if (st.openUnitsOfCaseCount(caseId) > 0) return c;
    st.updateCase(caseId, { state: 'done', closedAt: Date.now() });
    st.addEvent(c.owner, 'rig_case_done', { caseId });
    this.b.log(`rig case ${caseId} done`);
    this.changed(c.workspaceKey);
    return st.getCase(caseId);
  }
  block(c, reason) {
    const b = this.b; const st = this.store();
    st.updateCase(c.id, { state: 'blocked', blockedReason: reason });
    st.addEvent(c.owner, 'rig_case_blocked', { caseId: c.id, reason });
    b.log(`rig case ${c.id} blocked: ${reason}`);
    if (b.sessions.has(c.owner)) {
      const hist = this.history(c.id).map((h, i) => `${i + 1}. ${h.seat || '-'}(@${h.name}) ${h.result || h.status}${h.text ? `: ${h.text}` : ''}`);
      b.queue.enqueue(c.owner, [`[Atrium 보드] rig 건 ${c.id}이 막혔다(blocked): ${reason}`, ...(hist.length ? ['건의 이력:', ...hist] : []), '다음을 정해 일을 다시 맡기거나(atrium prompt <자리> "…") 사람에게 알린다.'].join('\n'));
    }
    this.changed(c.workspaceKey);
  }
  // 건의 이력: 일마다 받은 자리·세션·값·done 글 첫 줄
  history(caseId) {
    const st = this.store();
    return st.unitsOfCase(caseId).map((u) => {
      const tr = u.to ? st.lastTryOfUnit(u.id) : null;
      return { unit: u.id, seat: u.seat, sessionId: u.to || null, name: u.to ? this.nameOf(u.to) : '(줄)', status: u.status, result: tr ? tr.result : null, text: tr && tr.doneText ? firstLine(tr.doneText, 100) : null, via: u.via };
    });
  }
  changed(key) { if (this.b.api && this.b.api.broadcast) try { this.b.api.broadcast('rig.cases', { workspace: key }); } catch {} }

  // ---------- atrium prompt(자리 세션) ----------
  // → null(자리 세션이 아님: 0단계 그대로) | { kind: 'followup', t, tryRow, unit } | { kind: 'plain', t } | { kind: 'unit', ctx, seatName, t | null }
  planPrompt(caller, o, verbs) {
    const ctx = this.seatCtx(caller);
    if (!ctx) return null;
    const st = this.store();
    const ref = String(o.name ?? '').trim().replace(/^@/, '');
    const assign = this.assignTargets(ctx); const may = ctx.seat.may;
    let t = null, seatName = null;
    if (ref && Object.prototype.hasOwnProperty.call(ctx.def.seats, ref.toLowerCase())) seatName = ref.toLowerCase(); // P193: 자리 이름이 같은 이름의 세션보다 먼저
    else {
      t = verbs.target(caller, ref);
      const open = st.openTryOf(t.sessionId); const ou = open ? st.getUnit(open.unitId) : null;
      if (ou && (ou.from === caller.sessionId || (ou.via && ou.via.by === caller.sessionId))) return { kind: 'followup', t, tryRow: open, unit: ou };
      if (t.rigSeat && t.workspaceKey === ctx.key && ctx.def.seats[t.rigSeat]) seatName = t.rigSeat;
    }
    if (seatName && assign.includes(seatName) && !o.now) return { kind: 'unit', ctx, seatName, t };
    if (seatName && may.includes(seatName)) {
      if (!t) {
        const sat = this.seatedOf(ctx.key, seatName).filter((x) => x !== caller);
        const myCase = (() => { const tr = st.openTryOf(caller.sessionId); const u = tr ? st.getUnit(tr.unitId) : null; return u ? u.caseId : null; })();
        const inCase = myCase ? sat.find((x) => { const tr = st.openTryOf(x.sessionId); const u = tr ? st.getUnit(tr.unitId) : null; return u && u.caseId === myCase; }) : null;
        t = inCase || sat.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0] || null;
        if (!t) throw apiError('rig_no_seat', `rig: ${seatName} 자리에 앉은 세션이 없다. 글만 보내는 자리(may)는 앉은 세션에게만 간다.`, { seat: seatName });
      }
      if (t === caller) throw apiError('self', '자기 자신에게는 보낼 수 없다.');
      return { kind: 'plain', t };
    }
    const where = `일 맡기기: ${assign.length ? assign.join(', ') : '없음'} · 글만: ${may.length ? may.join(', ') : '없음'}`;
    const what = seatName ? `${seatName} 자리` : `@${ref}${t && !t.rigSeat ? '(자리 없는 세션)' : ''}`;
    const why = seatName && assign.includes(seatName) && o.now ? ' --now는 일을 만들지 않는다. --now 없이 보낸다.' : '';
    throw apiError('rig_refused', `rig: ${ctx.name} 자리는 ${what}에 보낼 수 없다(보드가 넣지 않았다).${why} 쓸 수 있는 자리 — ${where}. 정의: .atrium/rig.json의 flow·may.`, { assign, may });
  }

  // 받는 자리에 일을 만든다(자리 세션의 prompt와 흐름의 넘김). → { unit, t, made } | { unit, t: null, seatWait: true, ahead }
  //   c: 건, by: 보낸 세션(이어지는 지시 판정·기록), t: 이름으로 고른 받는 세션(없으면 자리로)
  async assign({ ctx, c, by, seatName, t = null, spec, origin, via = null }) {
    const b = this.b; const st = this.store(); const U = this.units();
    const owner = b.sessions.get(c.owner);
    if (!owner) throw apiError('closed', `건 ${c.id}의 주인 세션이 닫혀 일을 만들지 않는다.`);
    const seat = ctx.def.seats[seatName];
    const id = newId('u');
    const extra = { id, fromId: owner.sessionId, caseId: c.id, seat: seatName, via: { by: by.sessionId, fromSeat: this.seatCtx(by) ? by.rigSeat : null, ...(via || {}) } };
    if (!t && seat.session === 'keep') t = this.seatedOf(ctx.key, seatName)[0] || null;
    if (!t && seat.session === 'fresh' && this.liveCount(ctx.key, seatName) >= seat.maxLive) {
      const unit = { id, from: owner.sessionId, to: '', origin, spec: String(spec), status: 'open', createdAt: Date.now(), caseId: c.id, seat: seatName, via: extra.via };
      st.insertUnit(unit);
      st.addEvent(owner.sessionId, 'unit_open', { unitId: id, from: by.name, origin, seat: seatName, seatWait: true, caseId: c.id, chars: unit.spec.length });
      b.log(`unit ${id} → seat ${seatName} waits (max_live ${seat.maxLive})`);
      this.changed(ctx.key);
      return { unit: st.getUnit(id), t: null, seatWait: true, ahead: st.seatWaitingUnits(ctx.key, seatName).length - 1 };
    }
    if (!t) t = await this.spawnSeat(ctx, seatName, owner, c, id);
    const made = U.create(by, t, spec, origin, extra);
    this.changed(ctx.key);
    return { unit: made.unit, t, made };
  }

  // 자리를 위해 세션을 띄운다(건 주인의 하위로, atrium child와 같은 길: 런처·종류의 승인 방식, worktree면 claude -w)
  async spawnSeat(ctx, seatName, owner, c, unitId) {
    const b = this.b; const st = this.store();
    const seat = ctx.def.seats[seatName];
    const taken = new Set([...b.sessions.values()].flatMap((x) => [x.name, shownName(x)]).filter(Boolean).map((x) => String(x).toLowerCase()));
    for (const n of this.branch.pendingNames || []) taken.add(String(n).toLowerCase());
    let name = seat.session === 'keep' && !taken.has(seatName) ? seatName : null;
    for (let i = 0; !name && i < 1000; i++) { const n = `${seatName}-${st.nextSeatN(ctx.key, seatName)}`; if (!taken.has(n)) name = n; }
    const worktree = seat.worktree ? `${seatName}-${unitId}` : null;
    const o = { name, role: seatName, cwd: ctx.r.root, wait: false, ...this.seatRoute(seat, seatName, owner), ...(worktree ? { worktree } : {}), [SEAT_SPAWN]: seatName }; // P189: 띄울 때부터 자리의 증폭(설정 파일·Codex 인자)
    const k = `${ctx.key}|${seatName}`;
    this.spawning.set(k, (this.spawning.get(k) || 0) + 1);
    let r;
    try { r = await this.branch.spawnChild(owner, o); }
    finally { const n = (this.spawning.get(k) || 1) - 1; if (n > 0) this.spawning.set(k, n); else this.spawning.delete(k); }
    const s = b.sessions.get(r.sessionId);
    if (!s) throw apiError('spawn_failed', `${seatName} 자리 세션이 보드에 등록되지 않았다.`);
    st.setSessionSeat(s.sessionId, seatName); s.rigSeat = seatName;
    st.insertCaseItem({ caseId: c.id, sessionId: s.sessionId, seat: seatName, worktree, worktreePath: worktree ? path.join(ctx.r.root, '.claude', 'worktrees', worktree) : null });
    st.addEvent(s.sessionId, 'rig_seat_spawn', { seat: seatName, caseId: c.id, unitId, owner: owner.name, worktree, launcher: seat.launcher, session: seat.session });
    b.log(`rig seat ${seatName} spawned ${s.name} for case ${c.id}${worktree ? ` (worktree ${worktree})` : ''}`);
    if (b.broadcastSession) b.broadcastSession(s, { cause: 'rig_seat' });
    return s;
  }

  // P187: 자리 세션을 무엇으로 띄우는가(spawnChild에 넘길 launcher·kind).
  //   종류 이름(claude·codex·opencode·pi)이 먼저다. 새 판은 런처 목록에 id가 claude·codex인 런처를 만들어 두므로,
  //   런처를 먼저 찾으면 종류 이름이 그 런처(모델 없음 = 사용자 기본 모델, manual)로 풀려 건 주인의 것을 물려받지 않았다(P186).
  //   종류 이름이면 atrium child와 같이 건 주인에게서 물려받는다: 주인과 같은 종류면 --kind 없이(Claude Code는 주인의 모델·노력·권한 모드·연결,
  //   Codex 등은 주인의 호출자·모델·추가 인자(승인 인자 포함)), 다른 종류면 --kind(주인의 권한 모드를 그 하네스의 승인 인자로 옮긴다).
  //   런처 이름이면 그 런처의 모델·노력·승인 방식 그대로
  seatRoute(seat, seatName, owner) {
    const want = String(seat.launcher || '');
    if (SEAT_KINDS.includes(want)) return (owner.kind || 'claude') === want ? {} : { kind: want };
    const L = this.branch.findLauncher ? this.branch.findLauncher(want) : null;
    if (!L) throw apiError('rig_launcher', `rig ${seatName} 자리의 launcher "${want}"를 보드의 런처에서 찾지 못했다(런처 이름이나 ${SEAT_KINDS.join(', ')}).`);
    return { launcher: want };
  }

  // ---------- atrium done(자리 세션) ----------
  // 그 done이 흐름으로 넘어가는가 → { ctx, c, lines } | null(자리 세션이 아니거나, 건이 아니거나, 건이 끝났다)
  routeFor(caller, unit, result) {
    const ctx = this.seatCtx(caller);
    if (!ctx || !unit || !unit.caseId) return null;
    const c = this.store().getCase(unit.caseId);
    if (!c || !LIVE_CASE.has(c.state)) return null;
    return { ctx, c, lines: ctx.def.flow.filter((l) => l.from === ctx.name && l.on === result) };
  }
  // done이 닫힌 뒤: 맞는 줄마다 넘김(상한), 건 확인, 자리 줄 넣기
  async afterDone(caller, unit, result, doneText, route) {
    const st = this.store();
    const { ctx } = route;
    let c = st.getCase(route.c.id);
    const firstSpec = (st.unitsOfCase(c.id)[0] || {}).spec || '';
    const reports = []; // P194: 건 주인에게 간 보고(일이 아니다)
    for (const line of route.lines) {
      c = st.getCase(c.id);
      let targets = line.to; let escalated = null;
      if (line.max != null) {
        const k = String(line.index); const counts = { ...c.edgeCounts };
        const n = counts[k] || 0;
        if (n >= line.max) {
          const alt = line.else || ctx.def.manager || null;
          counts[`${k}>else`] = (counts[`${k}>else`] || 0) + 1;
          st.updateCase(c.id, { edgeCounts: counts });
          escalated = { line: line.index, max: line.max, to: alt };
          st.addEvent(caller.sessionId, 'rig_escalate', { caseId: c.id, line: line.index, max: line.max, to: alt });
          if (!alt) { this.block(st.getCase(c.id), `flow[${line.index}](${line.from} ${line.on} → ${line.to.join(', ')})이 상한 ${line.max}번을 넘었고 else도 manager도 없다`); continue; }
          targets = [alt];
        } else { counts[k] = n + 1; st.updateCase(c.id, { edgeCounts: counts }); }
      }
      for (const to of targets) { const rep = await this.handoff({ ctx, c: st.getCase(c.id), caller, unit, result, doneText, line, to, escalated, firstSpec }); if (rep && rep.report) reports.push(rep); }
    }
    this.caseCheck(c.id);
    this.pumpSoon();
    return { reports };
  }
  async handoff({ ctx, c, caller, unit, result, doneText, line, to, escalated, firstSpec }) {
    const b = this.b; const st = this.store();
    const history = escalated ? this.history(c.id) : [];
    const text = handoffText({ fromSeat: ctx.name, fromName: shownName(caller), result, doneText, firstSpec, escalated, history });
    const tSeat = ctx.def.seats[to];
    const seated = tSeat.session === 'keep' ? this.seatedOf(ctx.key, to)[0] || null : null;
    // P194: 받는 곳이 건 주인 세션 자신이면 일이 아니라 보고다. 주인이 아닌 keep 자리로 가는 줄은 그대로 일이다
    if (seated && seated.sessionId === c.owner) return this.ownerReport({ ctx, c, caller, unit, result, doneText, line, to, escalated, owner: seated, firstSpec });
    const h = await b.rig.deliver({ target: seated || { workspaceKey: ctx.key, name: to, kind: null, model: null, cwd: ctx.r.root }, workspaceKey: ctx.key, from: { kind: 'flow', seat: ctx.name, session: caller }, text });
    const rowIds = (h.runs || []).map((x) => x.rowId).filter((x) => x != null);
    if (h.action === 'reject') return this.block(c, `넘김 글(${ctx.name} ${result} → ${to})을 deliver 훅이 거절했다: ${h.reason}`);
    let a;
    try { a = await this.assign({ ctx, c, by: caller, seatName: to, spec: h.text, origin: 'flow', via: { result, line: line.index, prevUnit: unit.id, ...(escalated ? { escalated: true } : {}) } }); }
    catch (e) { return this.block(st.getCase(c.id), `${to} 자리로 넘기지 못했다: ${e.message}`); }
    // P187: 훅은 받을 세션을 띄우기 전에 돌았다. 그 행에 받은 세션(자리 줄에 섰으면 pump가 띄운 뒤)과 이 일을 적는다(세션 맵 미리 보기)
    if (rowIds.length && st.fillHookRuns) st.fillHookRuns(rowIds, { sessionId: a.t ? a.t.sessionId : null, unitId: a.unit ? a.unit.id : null });
    st.addEvent(caller.sessionId, 'rig_handoff', { caseId: c.id, from: ctx.name, result, to, line: line.index, unitId: a.unit.id, target: a.t ? a.t.name : null, seatWait: !!a.seatWait, escalated: !!escalated });
    b.log(`rig handoff ${ctx.name}(${caller.name}) ${result} → ${to}${a.t ? ` @${a.t.name}` : ' (seat wait)'} case ${c.id}`);
    if (a.t) {
      const l = this.branch.verbs.link(caller, a.t);
      b.linkEvent(l, 'prompt', text, { via: 'flow', tag: 'flow', unitId: a.unit.id, caseId: c.id, result, ...(a.made && a.made.d ? { deliveryId: a.made.d.deliveryId } : {}) });
    }
  }

  // P194: 주인에게 보고(일을 만들지 않는다). 상한을 넘어 올라온 것이면 건을 waiting_owner로 둔다(주인의 다음 맡기기가 잇는다)
  ownerReport({ ctx, c, caller, unit, result, doneText, line, to, escalated, owner, firstSpec }) {
    const b = this.b; const st = this.store();
    if (escalated) {
      st.updateCase(c.id, { state: 'waiting_owner' });
      st.addEvent(c.owner, 'rig_case_waiting_owner', { caseId: c.id, line: line.index, max: escalated.max, from: ctx.name, result });
    }
    const text = ownerReportText({ caseId: c.id, fromSeat: ctx.name, fromName: shownName(caller), unitId: unit.id, firstSpec, result, doneText, escalated, history: escalated ? this.history(c.id) : [] });
    const d = b.queue.enqueue(owner.sessionId, text);
    const tr = st.lastTryOfUnit(unit.id);
    if (tr) st.updateTry(tr.id, { noticeDeliveryId: d.deliveryId });
    // 연결 기록: 위(주인) → 하위 선에 보고(답)로(0단계 done과 같다). 선이 없으면 보낸 쪽 → 주인 선
    const l0 = st.linkByPair(unit.from, unit.to);
    if (l0 && !l0.removedAt) b.linkEvent(l0, 'reply', doneText, { via: 'flow', verb: 'done', tag: 'report', result, unitId: unit.id, caseId: c.id, deliveryId: d.deliveryId });
    else { const l = this.branch.verbs.link(caller, owner); b.linkEvent(l, 'prompt', text, { via: 'flow', tag: 'report', unitId: unit.id, caseId: c.id, result, deliveryId: d.deliveryId }); }
    st.addEvent(caller.sessionId, 'rig_handoff', { caseId: c.id, from: ctx.name, result, to, line: line.index, unitId: null, report: true, target: owner.name, deliveryId: d.deliveryId, escalated: !!escalated });
    b.log(`rig report ${ctx.name}(${caller.name}) ${result} → owner @${owner.name} case ${c.id}${escalated ? ' (waiting_owner)' : ''}`);
    this.changed(ctx.key);
    return { report: true, seat: to, to: shownName(owner), deliveryId: d.deliveryId, escalated: !!escalated };
  }

  // ---------- 자리 줄(max_live) ----------
  pumpSoon() { if (this.pumpTimer) return; this.pumpTimer = setImmediate(() => { this.pumpTimer = null; this.pump().catch((e) => this.b.log('rig pump error', e.stack)); }); }
  async pump() {
    if (this.pumping) { this.again = true; return; }
    this.pumping = true;
    try {
      do {
        this.again = false;
        const st = this.store(); const b = this.b;
        for (const u of st.seatWaitingAll()) {
          const c = st.getCase(u.caseId);
          const owner = c ? b.sessions.get(c.owner) : null;
          const r = b.rig ? b.rig.active(u.workspaceKey) : null;
          const cdef = r ? this.defOfCase(c, r) : null; // P188: 건의 버전
          const seat = cdef && cdef.seats ? cdef.seats[u.seat] : null;
          if (!c || !owner || !seat || !LIVE_CASE.has(c.state)) { st.updateUnit(u.id, { status: 'cancelled', closedAt: Date.now() }); st.addEvent(c ? c.owner : null, 'unit_cancelled', { unitId: u.id, why: !seat ? 'seat gone' : 'case closed' }); if (c) this.caseCheck(c.id); continue; }
          if (this.liveCount(u.workspaceKey, u.seat) >= seat.maxLive) continue;
          const ctx = { key: u.workspaceKey, r, def: cdef, seat, name: u.seat };
          let s;
          try { s = await this.spawnSeat(ctx, u.seat, owner, c, u.id); }
          catch (e) { st.updateUnit(u.id, { status: 'cancelled', closedAt: Date.now() }); this.block(st.getCase(c.id), `${u.seat} 자리 세션을 띄우지 못했다: ${e.message}`); continue; }
          st.setUnitTarget(u.id, s.sessionId);
          if (st.fillHookRunsOfUnit) st.fillHookRunsOfUnit(u.id, s.sessionId); // P187: 줄에 설 때 돈 훅 행에 세션
          const unit = st.getUnit(u.id);
          if (st.openTryOf(s.sessionId)) { this.units().queued.add(s.sessionId); continue; }
          this.units().dispatch(unit, { later: true });
          st.addEvent(s.sessionId, 'rig_seat_dequeue', { unitId: u.id, seat: u.seat, caseId: c.id });
        }
      } while (this.again);
    } finally { this.pumping = false; }
  }

  // 세션이 닫혔다: 주인인 건은 cancelled(자리 줄에 선 일도 취소), 그 세션의 건은 확인, 자리 줄
  onClosed(s) {
    const st = this.store(); const now = Date.now();
    for (const c of st.liveCasesOfOwner(s.sessionId)) {
      for (const u of st.unitsOfCase(c.id)) if (u.status === 'open' && !u.to) st.updateUnit(u.id, { status: 'cancelled', closedAt: now });
      st.updateCase(c.id, { state: 'cancelled', closedAt: now });
      st.addEvent(s.sessionId, 'rig_case_cancelled', { caseId: c.id, why: 'owner closed' });
      this.changed(c.workspaceKey);
    }
    // 닫힌 세션의 일이 취소되었다(WorkUnits.onClosed가 먼저 돈다) → 그 건 확인
    for (const c of st.casesOf(s.workspaceKey || '', 200)) if (c.state === 'open') this.caseCheck(c.id);
    this.pumpSoon();
  }

  // ---------- P188: 느린 고리(cycles, 15절) ----------
  // 정의의 cycles 줄마다: 다음 시각이 지났으면 그 자리(보통 관리자)에 일을 하나 만든다. 글은 판의 장부 요약 + run 출력.
  //   줄이 새로 생기거나 모양(every·to·run)이 바뀌면 지금부터 한 주기 뒤가 다음 시각이다. 돈 뒤에는 지금 + 주기(놓친 회는 한 번)
  stopCycles() { if (this.cycleTimer) clearInterval(this.cycleTimer); this.cycleTimer = null; }
  async cycleTick(now = Date.now()) {
    const b = this.b; const st = this.store();
    if (!b.rig || !st.workspaces || !st.getCycle) return [];
    const fired = [];
    for (const w of st.workspaces()) {
      const r = b.rig.active(w.key);
      if (!r) continue;
      const cycles = r.def.cycles || [];
      st.dropCyclesFrom(w.key, cycles.length);
      for (const cy of cycles) {
        const sig = JSON.stringify([cy.everyMs, cy.to, cy.run]);
        const row = st.getCycle(w.key, cy.index);
        if (!row || row.sig !== sig) { st.setCycle(w.key, cy.index, { nextAt: now + cy.everyMs, lastAt: row ? row.lastAt : null, sig }); continue; }
        if (now < row.nextAt) continue;
        const k = `${w.key}|${cy.index}`;
        if (this.cycleBusy.has(k)) continue;
        this.cycleBusy.add(k);
        try {
          const x = await this.fireCycle(w.key, r, cy, { since: row.lastAt || row.nextAt - cy.everyMs, now }); // 첫 회는 줄을 처음 본 때부터
          if (x) { st.setCycle(w.key, cy.index, { nextAt: now + cy.everyMs, lastAt: now, sig }); fired.push(x); this.cycleSkipNoted.delete(k); }
        } finally { this.cycleBusy.delete(k); }
      }
    }
    return fired;
  }
  // 한 회: 받는 자리 세션에 새 건의 일. 앉은 세션이 없으면 돌지 않고(다음 시각은 그대로라 앉으면 돈다) 한 번 기록한다
  async fireCycle(key, r, cy, { since, now }) {
    const b = this.b; const st = this.store();
    const seat = r.def.seats[cy.to];
    const t = this.seatedOf(key, cy.to).sort((a, c) => (a.createdAt || 0) - (c.createdAt || 0))[0] || null;
    const k = `${key}|${cy.index}`;
    if (!t) {
      if (!this.cycleSkipNoted.has(k)) { this.cycleSkipNoted.add(k); st.addEvent(null, 'rig_cycle_skip', { workspace: key, line: cy.index, seat: cy.to, why: 'no seated session' }); b.log(`rig cycle ${key}[${cy.index}] skipped: no session at seat ${cy.to}`); }
      return null;
    }
    let text = this.cycleSummary(key, r, cy, { since, now });
    if (cy.run) {
      const out = await runCapture(cy.run, { root: r.root, env: cleanEnv(process.env), input: { v: 1, at: 'cycle', workspace: { key, root: r.root }, line: cy.index, since, until: now, rigHash: r.hash }, timeoutMs: cy.timeoutMs });
      text += `\n\n## run 출력(${cy.run.join(' ')})\n${out.ok ? out.text || '(출력 없음)' : `돌지 못했다: ${out.error}${out.text ? `\n${out.text}` : ''}`}`;
    }
    const c = this.newCase(key, t);
    const ctx = { key, r, def: this.defOfCase(c, r), seat, name: cy.to };
    const made = this.units().create(t, t, text, 'cycle', { caseId: c.id, seat: cy.to, via: { by: t.sessionId, cycle: cy.index } });
    st.addEvent(t.sessionId, 'rig_cycle', { workspace: key, line: cy.index, caseId: c.id, unitId: made.unit.id, since, until: now, chars: text.length });
    b.log(`rig cycle ${key}[${cy.index}] → ${t.name} case ${c.id} unit ${made.unit.id}`);
    this.changed(key);
    return { line: cy.index, caseId: c.id, unitId: made.unit.id, to: t.name, seat: ctx.name };
  }
  // 판의 장부 요약(그 기간): 건 결과, 상한 초과, 훅 판정 수와 거절 까닭 상위, 도구 실패, 사람이 rig 자리에 보낸 글, 오래 열린 건
  cycleSummary(key, r, cy, { since, now }) {
    const st = this.store();
    const P = st.rigPeriod(key, since, now);
    const when = (t) => new Date(t).toISOString().replace('T', ' ').slice(0, 16);
    const ago = (ms) => (ms >= 86400000 ? `${Math.floor(ms / 86400000)}일` : ms >= 3600000 ? `${Math.floor(ms / 3600000)}시간` : `${Math.max(1, Math.floor(ms / 60000))}분`);
    const L = [`보드의 느린 고리(cycles[${cy.index}], ${cy.every}마다)가 만든 일이다. ${when(since)}부터 ${when(now)}까지(UTC)의 rig 장부 요약을 읽고, 정의(.atrium/rig.json)·안내·정본에 고칠 것이 있으면 고친다(고친 정의는 버전으로 남는다: atrium rig log, atrium rig check). 오래 열린 건은 닫거나 사람에게 묻는다. 끝나면 done으로 한 일을 보고한다.`];
    // 건 결과
    const byState = {}; for (const c of P.casesClosed) byState[c.state] = (byState[c.state] || 0) + 1;
    L.push('', '## 건 결과', `새 건 ${P.casesOpened.length}, 닫힌 건 ${P.casesClosed.length}${Object.keys(byState).length ? `(${Object.entries(byState).map(([k, v]) => `${k} ${v}`).join(', ')})` : ''}`);
    for (const c of P.casesClosed.slice(-10)) { const h = this.history(c.id); L.push(`- ${c.id} ${c.state}: 일 ${h.length}, 넘김 ${h.filter((u) => u.via && u.via.result).length}${c.blockedReason ? `, ${c.blockedReason}` : ''}`); }
    // 상한 초과
    const esc = [...new Map([...P.casesOpened, ...P.casesClosed, ...st.liveCasesWithLast(key)].map((c) => [c.id, c])).values()].map((c) => ({ c, n: Object.entries(c.edgeCounts || {}).filter(([kk]) => kk.endsWith('>else')).reduce((a, [, v]) => a + (Number(v) || 0), 0) })).filter((x) => x.n || x.c.state === 'blocked');
    L.push('', '## 상한 초과', esc.length ? esc.map((x) => `- ${x.c.id}: 올림 ${x.n}${x.c.state === 'blocked' ? `, blocked(${x.c.blockedReason || '?'})` : ''}`).join('\n') : '없음');
    // 훅 판정
    L.push('', '## 훅 판정', P.hooks.length ? P.hooks.map((h) => `${h.decision} ${h.n}`).join(', ') : '없음');
    if (P.rejectReasons.length) L.push('거절·실패 까닭 상위:', ...P.rejectReasons.map((x) => `- ${x.n}회: ${clip(x.reason.replace(/\s+/g, ' '), 160) || '(까닭 없음)'}`));
    // 도구
    L.push('', '## 도구 실패', `실행 ${P.toolRuns}, 실패 ${P.toolFails.length}`);
    for (const f of P.toolFails.slice(0, 10)) L.push(`- ${f.tool} ${f.status}${f.exitCode != null ? ` 종료 코드 ${f.exitCode}` : ''}${f.error ? `: ${clip(String(f.error).replace(/\s+/g, ' '), 120)}` : ''}`);
    // 사람이 rig 자리에 보낸 글
    L.push('', '## 사람이 rig 자리에 보낸 글', P.human.length ? P.human.slice(-20).map((x) => `- @${x.name}(${x.seat} 자리): ${clip(String(x.text).replace(/\s+/g, ' '), 200)}`).join('\n') : '없음');
    // 오래 열린 건
    const stale = st.liveCasesWithLast(key).filter((c) => now - (c.lastAt || c.createdAt) >= cy.staleMs);
    L.push('', `## 오래 열린 건(마지막 넘김 뒤 ${ago(cy.staleMs)} 넘음)`, stale.length ? stale.map((c) => { const open = this.history(c.id).filter((u) => u.status === 'open'); return `- ${c.id} ${c.state}: 주인 @${this.nameOf(c.owner)}, 마지막 넘김 ${ago(now - (c.lastAt || c.createdAt))} 전${open.length ? `, 열린 일 ${open.map((u) => `${u.seat || '-'}(@${u.name})`).join(', ')}` : ''}${c.blockedReason ? `, ${c.blockedReason}` : ''}`; }).join('\n') : '없음');
    return L.join('\n');
  }

  // ---------- 보이기 ----------
  // 판 API rig.cases: 워크스페이스의 건(최근 것부터). 건마다 일(자리·세션·상태·값), 줄마다 지난 횟수, 띄운 세션·워크트리
  cases(key, { limit = 50 } = {}) {
    const st = this.store();
    const r = this.b.rig ? this.b.rig.read(key) : null;
    const def = r && r.def ? r.def : null;
    return st.casesOf(key, limit).map((c) => this.caseView(c, def));
  }
  caseView(c, def0 = null) {
    const st = this.store();
    const def = (c.versionN != null ? this.defOfCase(c) : null) || def0; // P188: 건의 버전
    const units = this.history(c.id);
    const open = units.filter((u) => u.status === 'open');
    return {
      id: c.id, version: c.versionN ?? null, workspace: c.workspaceKey, owner: this.nameOf(c.owner), ownerSessionId: c.owner, ownerOpen: this.b.sessions.has(c.owner), state: c.state, createdAt: c.createdAt, closedAt: c.closedAt, blockedReason: c.blockedReason,
      handoffs: units.filter((u) => u.via && u.via.result).length, edgeCounts: c.edgeCounts,
      lines: def ? def.flow.filter((l) => l.max != null).map((l) => ({ index: l.index, from: l.from, on: l.on, to: l.to, max: l.max, passed: c.edgeCounts[String(l.index)] || 0, escalated: c.edgeCounts[`${l.index}>else`] || 0 })) : [],
      activeSeats: [...new Set(open.map((u) => u.seat).filter(Boolean))],
      units, items: st.caseItems(c.id).map((x) => ({ ...x, name: this.nameOf(x.sessionId), open: this.b.sessions.has(x.sessionId) })),
    };
  }
  // 세션 맵 그래프의 rig 칸: 켜진 rig마다 { seats, flow, cases }(P186이 그린다)
  graph() {
    const out = {};
    const b = this.b;
    if (!b.rig || !b.store.workspaces) return out;
    for (const w of b.store.workspaces()) {
      const r = b.rig.active(w.key);
      if (!r || !r.def.seats) continue;
      const cases = this.store().casesOf(w.key, 20).filter((c) => LIVE_CASE.has(c.state) || Date.now() - (c.closedAt || 0) < 3600000);
      const live = cases.find((c) => LIVE_CASE.has(c.state)) || null;
      out[w.key] = {
        seats: Object.values(r.def.seats).map((x) => ({ name: x.name, launcher: x.launcher, session: x.session, worktree: x.worktree, maxLive: x.maxLive, may: x.may,
          sessions: this.seatedOf(w.key, x.name).map((s) => ({ sessionId: s.sessionId, name: shownName(s), open: true, busy: !!this.store().openTryOf(s.sessionId) })),
          waiting: this.store().seatWaitingUnits(w.key, x.name).length })),
        flow: r.def.flow.map((l) => ({ index: l.index, from: l.from, on: l.on, to: l.to, max: l.max, else: l.else, passed: live ? live.edgeCounts[String(l.index)] || 0 : 0 })),
        manager: r.def.manager, results: r.def.results,
        cases: cases.map((c) => { const v = this.caseView(c, r.def); return { id: v.id, owner: v.owner, ownerSessionId: v.ownerSessionId, state: v.state, activeSeats: v.activeSeats, handoffs: v.handoffs, blockedReason: v.blockedReason, createdAt: v.createdAt, closedAt: v.closedAt, lines: v.lines, units: v.units.map((u) => ({ unit: u.unit, seat: u.seat, sessionId: u.sessionId, name: u.name, status: u.status, result: u.result })) }; }),
      };
    }
    return out;
  }
  // atrium me의 rig 칸
  meOf(s) {
    const ctx = this.seatCtx(s);
    if (!ctx) return s.rigSeat ? { seat: s.rigSeat, active: false } : null;
    const st = this.store();
    const tr = st.openTryOf(s.sessionId); const u = tr ? st.getUnit(tr.unitId) : null;
    const c = u && u.caseId ? st.getCase(u.caseId) : null;
    return { seat: ctx.name, active: true, version: ctx.versionN ?? null, manager: !!(ctx.def.manager && ctx.def.manager === ctx.name), session: ctx.seat.session, worktree: ctx.seat.worktree, results: ctx.def.results, assign: this.assignTargets(ctx), may: ctx.seat.may, tools: ctx.seat.tools,
      case: c ? { id: c.id, state: c.state, owner: this.nameOf(c.owner) } : null,
      owned: st.casesOf(ctx.key, 50).filter((x) => x.owner === s.sessionId && LIVE_CASE.has(x.state)).map((x) => ({ id: x.id, state: x.state })), // P194: 내가 주인인 끝나지 않은 건(--case로 고른다)
      next: ctx.def.flow.filter((l) => l.from === ctx.name && l.on !== 'assign').map((l) => ({ on: l.on, to: l.to, max: l.max, else: l.else })) };
  }
  // atrium guide: 자리 안내 파일
  seatGuide(s) {
    const ctx = this.seatCtx(s);
    if (!ctx || !ctx.seat.guide) return ctx ? { seat: ctx.name, text: null } : null;
    try {
      const text = fs.readFileSync(path.resolve(ctx.r.root, ctx.seat.guide), 'utf8').replace(/^﻿/, '');
      return { seat: ctx.name, path: ctx.seat.guide, text: text.length > 20000 ? text.slice(0, 20000) : text, clipped: text.length > 20000 };
    } catch (e) { return { seat: ctx.name, path: ctx.seat.guide, text: null, error: e.message }; }
  }
}

// 판 API 처리기(backend.mjs handlers에 펼친다). rig.seat은 판 API 토큰으로 붙은 연결(이 PC의 창·사람의 atrium 명령)만. rig.cases는 보기
export function rigFlowHandlers(b) {
  const local = (c) => { if (!c || !c.auth || c.auth.kind !== 'local') throw apiError('forbidden', '자리 정하기는 이 PC의 보드 창에서만 한다(판 API 토큰).'); };
  return {
    'rig.seat': (p, c) => {
      local(c);
      if (!p || !p.session) throw apiError('bad_request', 'session이 필요하다');
      const s = b.resolve(p.session);
      return b.branch.flow.setSeat(s, p.seat ?? null, { by: 'human', notify: true }); // P193: 자리를 얻으면 판 알림
    },
    // P186: 세션 맵 미리 보기의 최근 훅 판정과 도구 실행(보기만). rig 밖 세션은 둘 다 빈 목록
    'rig.recent': (p) => {
      if (!p || !p.session) throw apiError('bad_request', 'session이 필요하다');
      const s = b.resolve(p.session);
      return recentOf(b.store, s.sessionId, Math.min(Math.max(Number(p.limit) || 5, 1), 20));
    },
    'rig.cases': async (p) => {
      const key = (await b.resolveWorkspace(p && p.workspace)).key;
      return { workspace: key, cases: b.branch.flow.cases(key, { limit: Math.min(Math.max(Number(p && p.limit) || 50, 1), 200) }) };
    },
  };
}

// P186: 세션의 최근 훅 판정(rig_hook_runs)과 도구 실행(tool_runs), 최근 것부터
export function recentOf(store, sessionId, limit = 5) {
  const hooks = (store.hookRunsOfSession ? store.hookRunsOfSession(sessionId, limit) : []).map((h) => ({ t: h.t, at: h.at, hookIndex: h.hookIndex, run: (h.argv || []).slice(0, 3).join(' '), decision: h.decision, reason: h.reason, note: h.note, error: h.error, ms: h.ms, unitId: h.unitId }));
  const tools = (store.toolRunsOf ? store.toolRunsOf(sessionId, limit) : []).map((x) => ({ id: x.id, tool: x.tool, args: x.args, status: x.status, exitCode: x.exitCode, startedAt: x.startedAt, endedAt: x.endedAt, error: x.error, unitId: x.unitId }));
  return { session: sessionId, hooks, tools };
}

// P188: 느린 고리의 run. 셸 없이 띄우고(hook-runner와 같은 길) stdin에 JSON 하나, stdout(2만 자까지)을 글로 돌려준다 → { ok, text, error }
export function runCapture(run, { root, env, input, timeoutMs = 60000, max = 20000 }) {
  return new Promise((resolve) => {
    let plan; let child; let out = ''; let done = false; let timer = null;
    const end = (x) => { if (done) return; done = true; clearTimeout(timer); resolve({ ...x, text: out.length > max ? out.slice(0, max) + '\n…(잘림)' : out.replace(/\s+$/, '') }); };
    try { plan = spawnPlan(rootedRun(run, root), { cwd: root, env }); child = spawn(plan.file, plan.args, { cwd: root, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], windowsVerbatimArguments: plan.verbatim }); }
    catch (e) { return end({ ok: false, error: `띄우지 못했다: ${e.message}` }); }
    timer = setTimeout(() => { killTree(child); end({ ok: false, error: `시간 제한(${timeoutMs}ms)을 넘었다` }); }, timeoutMs);
    child.stdout.setEncoding('utf8'); child.stdout.on('data', (d) => { if (out.length <= max) out += d; });
    child.stderr.on('data', () => {});
    child.on('error', (e) => end({ ok: false, error: `띄우지 못했다: ${e.message}` }));
    child.on('close', (code) => end(code === 0 ? { ok: true } : { ok: false, error: `종료 코드 ${code}` }));
    try { child.stdin.on('error', () => {}); child.stdin.end(JSON.stringify(input)); } catch {}
  });
}
