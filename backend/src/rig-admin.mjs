// P188: rig 5단계 — 관리자 자리와 정의의 수명(docs research harness-arch.md 15절 "5단계").
// - atrium rig check [파일] | log | rollback <n> | cleanup <건>: 관리자 자리 세션(켜진 rig의 manager 자리에 앉은 세션)과 사람(판 API 토큰: 창, 사람의 atrium call)만.
//   P190: check(읽기만)는 rig가 꺼진 워크스페이스의 어느 판 세션이든, 켜진 rig에서는 사람이 맡긴 제작 일을 쥔 제작 세션도 쓴다.
//   P209: 그 워크스페이스의 제작 세션은 제작 일을 닫은 뒤에도 check·log(읽기만)를 쓴다.
//   그 밖 세션은 거절(종료 코드 1과 까닭). 정의의 버전 기록은 rig.mjs(adopt), 건의 버전 고정은 rig-flow.mjs(seatCtx·defOfCase)다.
// - check: 후보 정의(파일 내용 또는 지금 rig.json)를 적용하지 않고 검사한다(정의 검사 + 사람만 고치는 포인터).
// - log: 버전 목록과 버전마다 건 수, 반려(ok가 아닌 done 값) 수, 훅 거절 수, 상한 초과 수.
// - rollback <n>: 버전 n의 내용으로 rig.json을 다시 쓴다. 그것도 새 버전으로 적힌다(누가: 관리자 자리면 manager, 사람이면 human). 보호 포인터를 바꾸는 되돌리기도 쓰이지 않는다.
// - cleanup <건>: 끝난(done·cancelled) 건이 만든 fresh 자리 세션을 닫고(rig_case_items. 열린 일을 쥔 세션은 남긴다) 워크트리 목록만 돌려준다(지우지 않는다).
// - P216: retry <건> [<일>]: 종료된 자리 세션(exited)이 쥔 열린 일을 같은 자리의 새 세션으로 다시 맡긴다(rig-flow.mjs retry). 관리자 자리와 사람만.
// - 사람만 고치는 목록(workspaces.rig_protected): 판 API rig.protect·rig.unprotect(판 API 토큰만)와 창의 rig 메뉴. 포인터는 JSON 포인터, 파일은 저장소 기준 경로와
//   사람이 넣을 때의 SHA-256. 같은 파일을 다시 넣으면 다시 승인(새 해시). 보호 파일이 바뀌면 rig 도구가 돌지 않는다(tool-runs.mjs가 rig.changedFiles를 본다).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { RIG_FILE, validateRig, protectedHits, POINTER_RE, gitStateOf, worktreeWarnings, SEAT_KINDS, seatEffortError } from './rig.mjs';
import { harnessOf } from './launchers.mjs'; // P209: 런처 자리의 종류
import { shownName } from './session-label.mjs';
import { rigEvent, readEvents, eventLine } from './rig-ledger.mjs'; // P217: 장부
import { sectorsFor } from './rig-sectors.mjs'; // P222: 산출물 등록부
import { proposalsFor } from './rig-proposals.mjs'; // P224: 제안과 승인

function apiError(code, message, extra = {}) { return Object.assign(new Error(message), { code }, extra); }
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const inside = (root, f) => { const r = path.relative(root, f); return !!r && !r.startsWith('..') && !path.isAbsolute(r); };
export const RIG_ADMIN_OPS = ['check', 'log', 'rollback', 'cleanup', 'retry', 'status', 'pause', 'resume', 'name', 'artifacts', 'propose', 'proposals', 'approve', 'reject']; // P224: 제안과 승인 // P222: artifacts(산출물 등록부, 읽기만) // P216: retry. P221: status(고리와 회), pause·resume(고리|회), name(회 이름)
export const RIG_READ_OPS = ['check', 'log']; // P209: 읽기만(제작 세션도 쓴다)

export class RigAdmin {
  // b: 백엔드(store, rig, sessions, kill, log). branch: Branch(flow)
  constructor(b, branch) { this.b = b; this.branch = branch; }
  store() { return this.b.store; }
  rig() { if (!this.b.rig) throw apiError('rig_off', 'rig가 없다.'); return this.b.rig; }

  // 관리자 자리 세션인가(지금 정의의 manager 자리에 앉음)
  isManager(s) {
    const rig = this.b.rig;
    const r = rig && s && s.rigSeat ? rig.active(s.workspaceKey) : null;
    return !!(r && r.def.manager && r.def.manager === s.rigSeat && r.def.seats && r.def.seats[s.rigSeat]);
  }
  // /branch/rig: 에이전트 세션은 관리자 자리만
  async verb(s, o = {}) {
    const op = String(o.op || '');
    if (!RIG_ADMIN_OPS.includes(op)) throw apiError('bad_request', `atrium rig: ${RIG_ADMIN_OPS.join(' | ')} 가운데 하나다: ${op || '(없음)'}`);
    if (op === 'log' && o.events) return this.eventsVerb(s, o); // P217: 장부(18.2)
    // P221: status는 읽기만이라 그 워크스페이스의 어느 판 세션이든. name은 관리자 자리와 그 회의 주인(입구 자리 세션)
    if (op === 'status') { if (!s.workspaceKey) throw apiError('forbidden', 'atrium rig status는 워크스페이스의 세션만 쓴다.'); return this.status(s.workspaceKey); }
    // P222: artifacts도 읽기만이라 그 워크스페이스의 어느 판 세션이든
    if (op === 'artifacts') { if (!s.workspaceKey) throw apiError('forbidden', 'atrium rig artifacts는 워크스페이스의 세션만 쓴다.'); return this.artifacts(s.workspaceKey, o); }
    // P224: propose는 켜진 rig의 자리 세션(보통 개선 고리의 입구), proposals는 읽기라 그 워크스페이스의 어느 세션이든.
    //   approve·reject는 관리자 자리가 관리자 승인 길(정의 제안)만 정한다. 사람 승인 제안은 보드 창·휴대폰의 응답 필요 목록에서
    if (op === 'propose') return proposalsFor(this.b).propose(s, { target: o.target, text: o.text, file: o.file, why: o.why });
    if (op === 'proposals') { if (!s.workspaceKey) throw apiError('forbidden', 'atrium rig proposals는 워크스페이스의 세션만 쓴다.'); return this.proposals(s.workspaceKey, o); }
    if (op === 'name' && !this.isManager(s)) {
      const c = this.store().getCase(String(o.caseId || o.case || '').trim());
      if (!c || c.workspaceKey !== s.workspaceKey || c.owner !== s.sessionId) throw apiError('forbidden', `atrium rig name은 관리자 자리와 그 회의 주인(입구 자리 세션)이 쓴다${c && c.workspaceKey === s.workspaceKey ? `: 회 ${c.id}의 주인은 @${this.branch.units.nameOf(c.owner)}다` : ''}.`);
      return this.branch.flow.loops.name(s.workspaceKey, c.id, o.name, { by: 'owner', who: s });
    }
    // P190(16절): check는 읽기만이라 rig가 꺼진(또는 없는) 워크스페이스의 어느 판 세션이든 쓴다. 켜진 rig에서는 관리자 자리와 사람,
    //   그리고 사람이 맡긴 제작 일(rig.describe의 "말로 고치기")을 쥔 제작 세션
    // P209: 제작 세션(그 워크스페이스의 rig.describe 일을 받은 세션)은 제작 일을 닫은 뒤에도, rig가 켜져 있어도 읽기만 하는 check·log를 쓴다.
    //   rollback·cleanup(바꾸는 것)은 관리자 자리와 사람만
    if (RIG_READ_OPS.includes(op) && !this.isManager(s)) {
      const rig = this.b.rig;
      const builder = this.b.rigSetup && this.b.rigSetup.isWorkspaceBuilder(s);
      if (rig && (builder || (op === 'check' && !rig.enabled(s.workspaceKey)))) return op === 'check' ? this.check(s.workspaceKey, o) : this.log(s.workspaceKey, o);
    }
    if (!this.isManager(s)) {
      const r = this.b.rig ? this.b.rig.active(s.workspaceKey) : null;
      const why = !r ? '이 워크스페이스에는 켜진 rig가 없다' : !r.def.manager ? 'rig 정의에 manager(관리자 자리)가 없다' : `관리자 자리(${r.def.manager})에 앉은 세션만 쓴다${s.rigSeat ? `(너는 ${s.rigSeat} 자리)` : '(너는 자리 없는 세션)'}`;
      throw apiError('forbidden', `atrium rig ${op}는 관리자 자리 세션과 사람만 쓴다: ${why}.${RIG_READ_OPS.includes(op) ? ' check·log(읽기만)는 그 워크스페이스의 rig 제작 세션도 쓴다.' : ''}`);
    }
    return this.run(s.workspaceKey, op, o, { by: 'manager', who: s });
  }
  async run(key, op, o = {}, { by = 'human', who = null } = {}) {
    if (op === 'check') return this.check(key, o);
    if (op === 'log') return this.log(key, o);
    if (op === 'rollback') return this.rollback(key, o.n, { by, who });
    if (op === 'cleanup') return this.cleanup(key, o.caseId || o.case, { by, who });
    if (op === 'retry') return this.branch.flow.retry(key, o.caseId || o.case, o.unitId || o.unit || null, { by, who }); // P216
    if (op === 'status') return this.status(key); // P221
    if (op === 'artifacts') return this.artifacts(key, o); // P222
    if (op === 'pause') return this.branch.flow.loops.pause(key, o.target, { by, who });
    if (op === 'resume') return this.branch.flow.loops.resume(key, o.target, { by, who });
    if (op === 'name') return this.branch.flow.loops.name(key, o.caseId || o.case, o.name, { by, who });
    if (op === 'proposals') return this.proposals(key, o); // P224
    if (op === 'approve' || op === 'reject') return proposalsFor(this.b).decide(key, o.id, op, { by, who, reason: o.reason }); // P224
    throw apiError('bad_request', `모르는 일: ${op}`);
  }

  // P224: 제안 목록(atrium rig proposals [--id <제안>]) → { workspace, proposals } | { proposal }(diff 포함)
  proposals(key, o = {}) {
    this.rig();
    const P = proposalsFor(this.b);
    if (o.id) { const r = this.store().getProposal(String(o.id)); if (!r || r.workspaceKey !== key) throw apiError('not_found', `그런 제안이 없다: ${o.id}`); return { workspace: key, proposal: P.view(r) }; }
    return P.list(key, { limit: o.limit });
  }
  // P222: 산출물 등록부(atrium rig artifacts [--sector] [--run]) → rig-sectors list
  artifacts(key, o = {}) { this.rig(); return sectorsFor(this.b).list(key, { sector: o.sector != null ? String(o.sector) : null, run: o.run != null ? String(o.run) : null, limit: o.limit }); }
  // P221: 고리와 끝나지 않은 회(atrium rig status, 판 API rig.loops보다 넓게) → { workspace, state, version, loops, runs }
  status(key) {
    const rig = this.rig(); const st = this.store(); const flow = this.branch.flow;
    const r = rig.read(key);
    const on = rig.enabled(key);
    const runs = st.liveCasesOf ? st.liveCasesOf(key, 50).rows.map((c) => { const p = flow.loops.pauseOf(c); return { id: c.id, name: c.name || null, loop: c.loop || null, state: c.state, owner: this.branch.units.nameOf(c.owner), createdAt: c.createdAt, paused: p ? { by: p.by, loop: p.loop || null, who: p.who || null, at: p.at || null } : null, held: (c.held || []).length, blockedReason: c.blockedReason || null }; }) : [];
    return { workspace: key, state: !r.present ? 'none' : !r.def ? 'invalid' : on ? 'on' : 'off', version: r.n ?? null, format: r.def ? r.def.version || 1 : null, loops: flow.loops.view(key, r.def), runs };
  }

  // 후보 정의 검사. o.text: 후보 내용(없으면 지금 rig.json). 적용하지 않는다
  check(key, o = {}) {
    const rig = this.rig();
    const root = rig.rootOf(key);
    if (!root) throw apiError('not_found', `워크스페이스를 찾을 수 없다: ${key}`);
    let text = o.text != null ? String(o.text) : null;
    const from = text != null ? (o.file || '(준 내용)') : RIG_FILE;
    if (text == null) { try { text = fs.readFileSync(path.join(root, RIG_FILE), 'utf8'); } catch { return { ok: false, from, reason: `${RIG_FILE}이 없다` }; } }
    const hash = sha(Buffer.from(text, 'utf8'));
    let raw;
    try { raw = JSON.parse(text.replace(/^﻿/, '')); } catch (e) { return { ok: false, from, hash, reason: `JSON이 아니다: ${e.message}` }; }
    const v = validateRig(raw, { root, cycleMinMs: rig.cycleMin() });
    const cur = rig.read(key);
    const c = rig.cache.get(key);
    const base = (c && c.good) || rig.lastGood(key);
    const prot = rig.rigProtected(key);
    const hits = base && prot ? protectedHits(raw, base.raw, prot.pointers) : [];
    const out = { ok: v.ok && !hits.length, from, hash, current: { n: cur.n ?? null, hash: cur.hash || null }, same: !!(base && base.hash === hash), warnings: v.ok ? [...(v.def.warnings || []), ...(v.def.seats && Object.values(v.def.seats).some((x) => x.worktree) ? worktreeWarnings(v.def.seats, gitStateOf(root)) : [])] : [] }; // P195: 워크트리 자리의 저장소 조건
    if (!v.ok) return { ...out, reason: v.reason };
    // P209: 자리 effort·model. 런처 이름 자리는 그 런처의 종류로 effort를 다시 보고, 앉은 keep 자리 세션에는 다음에 띄울 때부터 먹는다고 적는다
    const sn = this.seatNotes(key, v.def.seats);
    out.warnings.push(...sn.warnings, ...(rig.permitWarnings ? rig.permitWarnings(key, v.def) : [])); // P223: 승인 전 unattended 자리
    if (sn.reason) return { ...out, ok: false, reason: sn.reason };
    if (hits.length) return { ...out, protectedHits: hits, reason: `사람만 고치는 자리를 바꾼다: ${hits.join(', ')}. 이대로 쓰면 보드가 이 정의를 쓰지 않는다(지금 버전을 그대로 쓴다).` };
    return { ...out, summary: { seats: v.def.seats ? Object.keys(v.def.seats) : [], flow: (v.def.flow || []).length, hooks: v.def.hooks.length, tools: v.def.tools ? Object.keys(v.def.tools) : [], cycles: (v.def.cycles || []).map((x) => `${x.every} → ${x.to}`), loops: Object.values(v.def.loops || {}).map((l) => ({ name: l.name, kind: l.kind, implicit: !!l.implicit, trigger: l.trigger.type === 'request' ? `request → ${l.entry}` : l.trigger.type === 'every' ? `every ${l.trigger.every} → ${l.entry}` : `event ${l.trigger.event}`, entry: l.entry, lines: l.lines.length, holds: l.holds, ...(l.task ? { task: l.task } : {}) })), manager: v.def.manager, format: v.def.version || 1, docs: v.def.docs ? Object.values(v.def.docs).map((d) => ({ name: d.name, role: d.role, layer: d.layer, path: d.rel || d.path, watch: d.watch })) : [] } }; // P219: 문서
  }

  // P209: 자리 effort·model 검사(정의 검사가 모르는 것: 런처의 종류, 지금 앉은 세션) → { reason | null, warnings }
  seatNotes(key, seats) {
    const warnings = []; let reason = null;
    if (!seats) return { reason, warnings };
    const setup = this.b.rigSetup;
    for (const x of Object.values(seats)) {
      if (x.effort && !SEAT_KINDS.includes(x.launcher)) {
        const l = setup && setup.findLauncher ? setup.findLauncher(x.launcher) : null;
        const h = l ? harnessOf(l.harness) : null;
        const why = h ? seatEffortError(h.kind, x.effort) : null;
        if (why && !reason) reason = `seats.${x.name}.effort: 런처 ${l.name || x.launcher}는 ${why}`;
      }
      if ((x.effort || x.model) && x.session === 'keep' && this.b.sessions) {
        // 앉은 세션이 띄울 때 받은 값(s.effort·s.model)과 다른 것만 알린다
        const sat = [...this.b.sessions.values()].find((t) => t.workspaceKey === key && t.rigSeat === x.name);
        const diff = sat ? [x.effort && sat.effort !== x.effort ? `effort ${x.effort}` : null, x.model && sat.model !== x.model ? `model ${x.model}` : null].filter(Boolean) : [];
        if (diff.length) warnings.push(`keep 자리 ${x.name}의 ${diff.join('·')}는 다음에 띄울 때부터 먹는다. 지금 앉은 @${shownName(sat) || sat.name}는 띄울 때의 값(${[sat.effort ? `effort ${sat.effort}` : null, sat.model ? `model ${sat.model}` : null].filter(Boolean).join('·') || '런처 기본'}) 그대로 돈다.`);
      }
    }
    return { reason, warnings };
  }

  // P217: atrium rig log --events(18.2). 읽는 쪽: 그 워크스페이스의 제작 세션(제작 일을 닫은 뒤에도), 관리자 자리 → 워크스페이스 전체.
  //   자리 세션 → 자기 건만(--case 없이 부르면 지금 쥔 건, 쥔 건이 없으면 자기 건 모두). 그 밖 세션은 거절
  eventsVerb(s, o = {}) {
    const key = s.workspaceKey;
    if (!key) throw apiError('forbidden', 'atrium rig log --events는 워크스페이스의 세션만 쓴다.');
    const builder = this.b.rigSetup && this.b.rigSetup.isWorkspaceBuilder(s);
    if (this.isManager(s) || builder) return this.events(key, o);
    const flow = this.branch && this.branch.flow;
    const ctx = flow ? flow.seatCtx(s) : null;
    if (!ctx) throw apiError('forbidden', 'atrium rig log --events는 그 워크스페이스의 rig 제작 세션, 관리자 자리, 자리 세션(자기 건만)이 쓴다. 너는 자리 없는 세션이다.');
    const mine = this.store().caseIdsOfSession(s.sessionId, key);
    let cases;
    if (o.case != null && String(o.case).trim()) {
      const want = String(o.case).trim();
      if (!mine.includes(want)) throw apiError('forbidden', `건 ${want}은 너의 건이 아니다(자리 세션은 자기가 받거나 주인인 건만 읽는다). 너의 건: ${mine.join(', ') || '(없음)'}`);
      cases = [want];
    } else { const held = flow.openCaseOf(s); cases = held ? [held] : mine; }
    return this.events(key, { ...o, case: null, cases });
  }
  // 장부 읽기(판 API rig.events도 이 길) → { workspace, rows(+shown: 사람이 읽는 한 줄), last, more }
  events(key, o = {}) {
    const x = readEvents(this.b, key, o);
    return { ...x, rows: x.rows.map((r) => ({ ...r, shown: eventLine(r) })) };
  }

  // 버전 목록과 버전마다 건 수, 반려 수, 훅 거절 수, 상한 초과 수
  log(key, o = {}) {
    const rig = this.rig(); const st = this.store();
    const cur = rig.read(key);
    const stats = st.caseStatsByVersion(key);
    const rejects = st.hookRejectsByHash(key);
    const notOk = st.notOkByVersion(key);
    const versions = st.rigVersions(key).map((v) => ({ n: v.n, hash: v.hash, t: v.t, by: v.by, note: v.note, current: v.n === cur.n, cases: (stats[v.n] || {}).cases || 0, open: (stats[v.n] || {}).open || 0, blocked: (stats[v.n] || {}).blocked || 0, escalations: (stats[v.n] || {}).escalations || 0, notOk: notOk[v.n] || 0, hookRejects: rejects[v.hash] || 0 }));
    const limit = Math.min(Math.max(Number(o.limit) || 50, 1), 500);
    return { workspace: key, current: cur.n ?? null, invalid: cur.invalid || null, protectedHits: cur.protectedHits || [], versions: versions.slice(-limit) };
  }

  // 버전 n의 내용으로 rig.json을 다시 쓴다 → { n(새 버전), from, hash } | 거절
  rollback(key, n, { by = 'human', who = null } = {}) {
    const rig = this.rig(); const st = this.store();
    const want = Number(n);
    if (!Number.isInteger(want) || want < 1) throw apiError('bad_request', `되돌릴 버전 번호를 준다(atrium rig log): ${n}`);
    const x = rig.versionContent(key, want);
    if (!x) throw apiError('not_found', `버전 ${want}이 없다. 버전 목록: atrium rig log`);
    if (!x.buf) throw apiError('not_found', `버전 ${want}의 내용 파일을 읽지 못했다(데이터 폴더 rigs/).`);
    const root = rig.rootOf(key);
    const file = path.join(root, RIG_FILE);
    const before = rig.read(key);
    const hash = sha(x.buf);
    if (before.hash === hash && !before.invalid) return { workspace: key, n: before.n, from: want, hash, unchanged: true };
    // 다음 읽기가 이 내용을 그 누가로 적는다
    rig.pendingBy.set(key, { hash, by, note: `rollback ${want}` });
    const tmp = `${file}.atrium-rollback-${process.pid}`;
    fs.writeFileSync(tmp, x.buf);
    fs.renameSync(tmp, file);
    try { const t = new Date(); fs.utimesSync(file, t, t); } catch {}
    rig.cache.delete(key); // 같은 크기·같은 시각 칸이라도 다시 읽는다(마지막 맞은 정의는 버전 파일에서 다시 얻는다)
    const after = rig.read(key);
    st.addEvent(who ? who.sessionId : null, 'rig_rollback', { workspace: key, from: want, n: after.n, by, ok: after.hash === hash && !after.invalid, reason: after.invalid || null });
    rigEvent(this.b, { kind: 'rig_rollback', ws: key, defN: after.n ?? null, seat: who ? who.rigSeat || null : null, session: who ? who.sessionId : null, value: String(want), actor: by === 'manager' ? 'agent' : 'human', ref: after.n ?? null, text: `버전 ${want}으로 되돌림 → 버전 ${after.n ?? '?'}${after.invalid ? `: ${after.invalid}` : ''}`, data: { from: want, ok: after.hash === hash && !after.invalid } });
    this.b.log && this.b.log(`rig rollback ${key} to #${want} by ${by}${who ? ` (${who.name})` : ''}: now #${after.n}${after.invalid ? ` (${after.invalid})` : ''}`);
    if (after.invalid || after.hash !== hash) {
      rig.pendingBy.delete(key);
      throw apiError(after.protectedHits ? 'rig_protected' : 'rig_invalid', `버전 ${want}으로 rig.json을 다시 썼지만 보드가 쓰지 않는다: ${after.invalid || '?'}`, { n: after.n });
    }
    return { workspace: key, n: after.n, from: want, hash, by };
  }

  // 끝난 건이 만든 fresh 자리 세션을 닫고 워크트리 목록만
  async cleanup(key, caseId, { by = 'human', who = null } = {}) {
    const b = this.b; const st = this.store();
    const id = String(caseId || '').trim();
    if (!id) throw apiError('bad_request', '건 ID를 준다: atrium rig cleanup <건>');
    const c = st.getCase(id);
    if (!c || c.workspaceKey !== key) throw apiError('not_found', `이 워크스페이스의 건이 아니다: ${id}`);
    if (c.state !== 'done' && c.state !== 'cancelled') throw apiError('case_open', `건 ${id}은 아직 끝나지 않았다(${c.state}). 끝난(done·cancelled) 건만 정리한다.`);
    const def = this.branch && this.branch.flow ? this.branch.flow.defOfCase(c) : null;
    const closed = []; const kept = [];
    for (const it of st.caseItems(id)) {
      const s = b.sessions.get(it.sessionId);
      const name = s ? shownName(s) || s.name : this.branch && this.branch.units ? this.branch.units.nameOf(it.sessionId) : it.sessionId;
      const seat = def && def.seats ? def.seats[it.seat] : null;
      if (!s) { kept.push({ name, seat: it.seat, why: 'closed' }); continue; }
      if (seat && seat.session === 'keep') { kept.push({ name, seat: it.seat, why: 'keep' }); continue; }
      if (st.openTryOf(s.sessionId) || (st.queuedUnitsOf && st.queuedUnitsOf(s.sessionId).length)) { kept.push({ name, seat: it.seat, why: 'busy' }); continue; }
      try { const r = await b.kill({ session: s.sessionId, confirm: true }); (r && r.closed === false ? kept : closed).push({ name, seat: it.seat, ...(r && r.closed === false ? { why: 'not closed' } : {}) }); }
      catch (e) { kept.push({ name, seat: it.seat, why: e.code || e.message }); }
    }
    const worktrees = st.caseItems(id).filter((x) => x.worktree).map((x) => ({ name: x.worktree, path: x.worktreePath, exists: !!(x.worktreePath && fs.existsSync(x.worktreePath)) }));
    st.addEvent(who ? who.sessionId : null, 'rig_cleanup', { workspace: key, caseId: id, by, closed: closed.map((x) => x.name), kept: kept.map((x) => `${x.name}:${x.why}`) });
    rigEvent(this.b, { kind: 'cleanup', ws: key, caseId: id, seat: who ? who.rigSeat || null : null, session: who ? who.sessionId : null, actor: by === 'manager' ? 'agent' : 'human', text: `닫음 ${closed.length} · 남김 ${kept.length} · 워크트리 ${worktrees.length}`, data: { closed: closed.map((x) => x.name), kept: kept.map((x) => `${x.name}:${x.why}`) } });
    b.log && b.log(`rig cleanup ${id} by ${by}: closed ${closed.length}, kept ${kept.length}, worktrees ${worktrees.length}`);
    return { workspace: key, caseId: id, closed, kept, worktrees };
  }

  // ---------- 사람만 고치는 목록 ----------
  protectedView(key) {
    const rig = this.rig();
    const root = rig.rootOf(key);
    const p = rig.rigProtected(key) || { pointers: [], files: [] };
    const changed = new Map(rig.changedFiles(key).map((x) => [x.path, x]));
    const cur = rig.read(key);
    return {
      workspace: key, root, pointers: p.pointers, version: cur.n ?? null, protectedHits: cur.protectedHits || [],
      files: p.files.map((f) => ({ ...f, ok: !changed.has(f.path), now: changed.has(f.path) ? changed.get(f.path).got : f.sha256, missing: changed.has(f.path) && !changed.get(f.path).got })),
      alerts: rig.alerts(key, 10),
    };
  }
  // o: { pointer } | { file }(다시 넣으면 다시 승인)
  protect(key, o = {}) {
    const rig = this.rig(); const st = this.store();
    const root = rig.rootOf(key);
    if (!root) throw apiError('not_found', `워크스페이스를 찾을 수 없다: ${key}`);
    const p = rig.rigProtected(key) || { pointers: [], files: [] };
    if (o.pointer != null) {
      const ptr = String(o.pointer).trim();
      if (!POINTER_RE.test(ptr)) throw apiError('bad_request', `JSON 포인터는 /로 시작한다(예: /seats/reviewer, /flow): ${ptr || '(없음)'}`);
      if (!p.pointers.includes(ptr)) p.pointers.push(ptr);
      st.setRigProtected(key, p);
      st.addEvent(null, 'rig_protect', { workspace: key, pointer: ptr });
    } else if (o.file != null) {
      const rel = String(o.file).trim().replace(/\\/g, '/').replace(/^\.\//, '');
      const abs = path.resolve(root, rel);
      if (!rel || !inside(root, abs)) throw apiError('bad_request', `저장소 안의 경로를 준다(저장소 기준): ${o.file}`);
      let buf; try { buf = fs.readFileSync(abs); } catch { throw apiError('not_found', `파일이 없다: ${rel}`); }
      const norm = path.relative(root, abs).split(path.sep).join('/');
      const entry = { path: norm, sha256: sha(buf), at: Date.now() };
      const i = p.files.findIndex((f) => f.path === norm);
      if (i >= 0) p.files[i] = entry; else p.files.push(entry);
      st.setRigProtected(key, p);
      st.addEvent(null, 'rig_protect', { workspace: key, file: norm, sha256: entry.sha256, again: i >= 0 });
    } else throw apiError('bad_request', 'pointer 또는 file을 준다');
    rig.alertMarks.delete(key);
    rig.cache.delete(key); // 보호 목록이 바뀌었으니 다음 읽기가 다시 본다
    this.b.log && this.b.log(`rig protect ${key}: ${o.pointer != null ? `pointer ${o.pointer}` : `file ${o.file}`}`);
    return this.protectedView(key);
  }
  unprotect(key, o = {}) {
    const rig = this.rig(); const st = this.store();
    const p = rig.rigProtected(key) || { pointers: [], files: [] };
    if (o.pointer != null) p.pointers = p.pointers.filter((x) => x !== String(o.pointer).trim());
    else if (o.file != null) { const rel = String(o.file).trim().replace(/\\/g, '/').replace(/^\.\//, ''); p.files = p.files.filter((f) => f.path !== rel); }
    else throw apiError('bad_request', 'pointer 또는 file을 준다');
    st.setRigProtected(key, p);
    st.addEvent(null, 'rig_unprotect', { workspace: key, ...(o.pointer != null ? { pointer: o.pointer } : { file: o.file }) });
    rig.alertMarks.delete(key);
    rig.cache.delete(key);
    return this.protectedView(key);
  }
}

// 판 API 처리기(backend.mjs handlers에 펼친다). 모두 판 API 토큰으로 붙은 연결(이 PC의 창·사람의 atrium call, auth.kind local)만.
// rig.protected는 보기라 기기 토큰도 본다
export function rigAdminHandlers(b) {
  const local = (c, what) => { if (!c || !c.auth || c.auth.kind !== 'local') throw apiError('forbidden', `${what}는 이 PC의 보드 창이나 사람의 atrium 명령에서만 한다(판 API 토큰).`); };
  const keyOf = async (p) => (await b.resolveWorkspace(p && p.workspace)).key;
  const A = () => b.branch.rigAdmin;
  const done = (r) => { if (b.broadcastWorkspaces) try { b.broadcastWorkspaces(); } catch {} return r; };
  return {
    'rig.check': async (p, c) => { local(c, 'rig check'); return A().check(await keyOf(p), p || {}); },
    'rig.log': async (p, c) => { local(c, 'rig log'); return A().log(await keyOf(p), p || {}); },
    'rig.rollback': async (p, c) => { local(c, 'rig rollback'); return done(A().rollback(await keyOf(p), p && p.n, { by: 'human' })); },
    'rig.cleanup': async (p, c) => { local(c, 'rig cleanup'); return A().cleanup(await keyOf(p), p && (p.caseId || p.case), { by: 'human' }); },
    'rig.retry': async (p, c) => { local(c, 'rig retry'); return b.branch.flow.retry(await keyOf(p), p && (p.caseId || p.case), p && (p.unitId || p.unit), { by: 'human' }); }, // P216: [다시 띄우기]
    'rig.protected': async (p) => A().protectedView(await keyOf(p)),
    'rig.protect': async (p, c) => { local(c, '사람만 고치는 목록 바꾸기'); return done(A().protect(await keyOf(p), p || {})); },
    'rig.unprotect': async (p, c) => { local(c, '사람만 고치는 목록 바꾸기'); return done(A().unprotect(await keyOf(p), p || {})); },
  };
}
