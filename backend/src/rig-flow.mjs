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
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { shownName } from './session-label.mjs';
import { clip } from './text.mjs';
import { SEAT_KINDS, RIG_HEADER_LINE } from './rig.mjs';

function apiError(code, message, extra = {}) { return Object.assign(new Error(message), { code }, extra); }
const newId = (p, n = 3) => p + crypto.randomBytes(n).toString('hex');
const firstLine = (t, n = 100) => clip(String(t || '').split('\n').find((x) => x.trim()) || '', n);
export const CASE_STATES = ['open', 'done', 'blocked', 'cancelled'];
const SPEC_HEAD_LINES = 6; // 넘김 글에 붙이는 건의 첫 할 일 줄 수

// 자리 세션의 일 머리(관계 줄 꼴이라 카드에는 아래 할 일만 지시로 보인다). 0단계 unitHeader 대신
// guide: 그 자리의 안내 파일이 있으면 일을 시작하기 전에 읽으라고 한다(P185 개발용 판: 안내를 읽지 않은 모델이 자리의 일과 다르게 닫았다)
export function seatHeader({ seat, unitId, caseId, by, results, assign = [], may = [], guide = false }) {
  return [
    `[Atrium 보드] 관계: 너는 rig의 ${seat} 자리다. 아래 일은 건 ${caseId}의 일 ${unitId}이다(${by}. 지금 일 보기: \`atrium item\`).`,
    `[Atrium 보드] 끝나면 \`atrium done <값> "<보고>"\`로 닫고 쉰다. 값: ${results.join(', ')}. 다음 자리는 보드가 값에 따라 정한다. 일이 보고하라는 것은 done 글에 넣고 다른 길로 따로 보내지 않는다.`,
    `[Atrium 보드] 보낼 수 있는 자리: 일 맡기기 ${assign.length ? assign.join(', ') : '없음'} · 글만 ${may.length ? may.join(', ') : '없음'}(\`atrium prompt <자리> "…"\`). 그 밖은 보드가 거절한다. 내 자리: \`atrium me\`.`,
    '[Atrium 보드] 사람이 직접 다르게 시키면 그것을 따른다.',
    guide ? '[Atrium 보드] 이 자리의 안내(할 일과 값을 고르는 법)가 있다. 일을 시작하기 전에 `atrium guide`로 먼저 읽는다.' : RIG_HEADER_LINE,
  ].join('\n');
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
  }
  store() { return this.b.store; }
  units() { return this.branch.units; }
  nameOf(id) { return this.units().nameOf(id); }

  // ---------- 자리 ----------
  // 세션의 자리 맥락. 켜진 rig 정의에 그 자리가 있을 때만 → { key, r, def, seat, name } | null
  seatCtx(s) {
    if (!s || !s.rigSeat || !this.b.rig) return null;
    const r = this.b.rig.active(s.workspaceKey);
    if (!r || !r.def.seats || !r.def.seats[s.rigSeat]) return null;
    return { key: s.workspaceKey, r, def: r.def, seat: r.def.seats[s.rigSeat], name: s.rigSeat };
  }
  assignTargets(ctx) { return [...new Set(ctx.def.flow.filter((l) => l.from === ctx.name && l.on === 'assign').map((l) => l.to[0]))]; }
  resultsFor(s) { const ctx = this.seatCtx(s); return ctx ? ctx.def.results : null; }
  seatedOf(key, seat) { return [...this.b.sessions.values()].filter((x) => x.workspaceKey === key && x.rigSeat === seat); }
  liveCount(key, seat) {
    const st = this.store();
    return this.seatedOf(key, seat).filter((x) => st.openTryOf(x.sessionId)).length + (this.spawning.get(`${key}|${seat}`) || 0);
  }

  // 판 API rig.seat(사람만, 이 PC의 창): 세션의 자리를 정하거나(seat) 뗀다(null)
  setSeat(s, seat, { by = 'human' } = {}) {
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
    return { session: shownName(s), sessionId: s.sessionId, seat: want, before, workspace: s.workspaceKey };
  }

  // ---------- 건 ----------
  newCase(key, owner) {
    const c = { id: newId('c'), workspaceKey: key, owner: owner.sessionId, state: 'open', createdAt: Date.now(), edgeCounts: {} };
    this.store().insertCase(c);
    this.store().addEvent(owner.sessionId, 'rig_case_open', { caseId: c.id, workspace: key });
    this.b.log(`rig case ${c.id} open by ${owner.name}`);
    return this.store().getCase(c.id);
  }
  // 보낸 세션이 어떤 건의 열린 시도를 쥐고 있으면 그 건(blocked였으면 다시 open), 아니면 새 건
  caseFor(caller, key) {
    const st = this.store();
    const tr = st.openTryOf(caller.sessionId);
    const u = tr ? st.getUnit(tr.unitId) : null;
    const c = u && u.caseId ? st.getCase(u.caseId) : null;
    if (c && (c.state === 'open' || c.state === 'blocked')) {
      if (c.state === 'blocked') { st.updateCase(c.id, { state: 'open', blockedReason: null }); st.addEvent(caller.sessionId, 'rig_case_resume', { caseId: c.id }); }
      return st.getCase(c.id);
    }
    return this.newCase(key, caller);
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
    if (ref && Object.prototype.hasOwnProperty.call(ctx.def.seats, ref)) seatName = ref;
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
    const o = { name, role: seatName, cwd: ctx.r.root, wait: false, ...this.seatRoute(seat, seatName, owner), ...(worktree ? { worktree } : {}) };
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
    if (!c || (c.state !== 'open' && c.state !== 'blocked')) return null;
    return { ctx, c, lines: ctx.def.flow.filter((l) => l.from === ctx.name && l.on === result) };
  }
  // done이 닫힌 뒤: 맞는 줄마다 넘김(상한), 건 확인, 자리 줄 넣기
  async afterDone(caller, unit, result, doneText, route) {
    const st = this.store();
    const { ctx } = route;
    let c = st.getCase(route.c.id);
    const firstSpec = (st.unitsOfCase(c.id)[0] || {}).spec || '';
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
      for (const to of targets) await this.handoff({ ctx, c: st.getCase(c.id), caller, unit, result, doneText, line, to, escalated, firstSpec });
    }
    this.caseCheck(c.id);
    this.pumpSoon();
  }
  async handoff({ ctx, c, caller, unit, result, doneText, line, to, escalated, firstSpec }) {
    const b = this.b; const st = this.store();
    const history = escalated ? this.history(c.id) : [];
    const text = handoffText({ fromSeat: ctx.name, fromName: shownName(caller), result, doneText, firstSpec, escalated, history });
    const tSeat = ctx.def.seats[to];
    const seated = tSeat.session === 'keep' ? this.seatedOf(ctx.key, to)[0] || null : null;
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
          const seat = r && r.def.seats ? r.def.seats[u.seat] : null;
          if (!c || !owner || !seat || (c.state !== 'open' && c.state !== 'blocked')) { st.updateUnit(u.id, { status: 'cancelled', closedAt: Date.now() }); st.addEvent(c ? c.owner : null, 'unit_cancelled', { unitId: u.id, why: !seat ? 'seat gone' : 'case closed' }); if (c) this.caseCheck(c.id); continue; }
          if (this.liveCount(u.workspaceKey, u.seat) >= seat.maxLive) continue;
          const ctx = { key: u.workspaceKey, r, def: r.def, seat, name: u.seat };
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

  // ---------- 보이기 ----------
  // 판 API rig.cases: 워크스페이스의 건(최근 것부터). 건마다 일(자리·세션·상태·값), 줄마다 지난 횟수, 띄운 세션·워크트리
  cases(key, { limit = 50 } = {}) {
    const st = this.store();
    const r = this.b.rig ? this.b.rig.read(key) : null;
    const def = r && r.def ? r.def : null;
    return st.casesOf(key, limit).map((c) => this.caseView(c, def));
  }
  caseView(c, def = null) {
    const st = this.store();
    const units = this.history(c.id);
    const open = units.filter((u) => u.status === 'open');
    return {
      id: c.id, workspace: c.workspaceKey, owner: this.nameOf(c.owner), ownerSessionId: c.owner, ownerOpen: this.b.sessions.has(c.owner), state: c.state, createdAt: c.createdAt, closedAt: c.closedAt, blockedReason: c.blockedReason,
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
      const cases = this.store().casesOf(w.key, 20).filter((c) => c.state === 'open' || c.state === 'blocked' || Date.now() - (c.closedAt || 0) < 3600000);
      const live = cases.find((c) => c.state === 'open' || c.state === 'blocked') || null;
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
    return { seat: ctx.name, active: true, session: ctx.seat.session, worktree: ctx.seat.worktree, results: ctx.def.results, assign: this.assignTargets(ctx), may: ctx.seat.may, tools: ctx.seat.tools,
      case: c ? { id: c.id, state: c.state, owner: this.nameOf(c.owner) } : null,
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
      return b.branch.flow.setSeat(s, p.seat ?? null, { by: 'human' });
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
