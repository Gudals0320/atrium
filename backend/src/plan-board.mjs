// P304: 리포(워크스페이스)별 목표·마일스톤 레인(설계 experiments/p301/p301-design.md, 고침 p301-design-v2.md). 문서·연산은 plan.mjs, 표는 store-plan.mjs.
// - 레인: 워크스페이스 안에 몇 개든. 레인마다 이름, 번호(#1…), 상태(active 진행 | paused 멈춤 | done 끝 | archived 보관), 목표·측정값·마일스톤(M1…, 레인마다 따로)·focus.
// - 관리자: 레인마다 세션 하나(만든 세션이 처음 관리자, atrium plan owner로 넘긴다). 관리자가 닫혀도 레인은 남고 "관리자 없음"으로 보인다.
//   관리자는 자기 레인을 지금 상태로 유지할 책임을 진다. 워크스페이스의 다른 세션은 레인에 묶이지 않는다(판 안내문에도 넣지 않는다).
// - 권한(설계 v2 4): 느슨하게. 관리자가 아닌 세션의 쓰기도 막지 않고 바뀜 기록과 출력에 "관리자 아님"을 남긴다(plan_log.manager 0).
//   자체 오케스트레이션 하위(P296 sub)는 동사 표에 plan이 없어 Branch.refusalOf가 막는다. 스킬 문장: 고치라는 지시가 없으면 남의 레인은 읽기만.
// - 레인 고르기: --plan <이름|번호>. 빼면 부른 세션이 관리하는 레인(보관 아닌 것)이 하나면 그것, 아니면 고르라는 오류(pick_plan). 보기(show)는 고를 수 없으면 레인 목록.
// - 에이전트: atrium plan …(POST /branch/plan { action, plan?, … }). action: show | list | new | op | owner | status | import | export | log.
// - 사람(창·휴대폰): 판 API plan.list | plan.get | plan.op(HUMAN_OPS만) | plan.owner | plan.status | plan.import | plan.export | plan.log. 레인은 planId로 준다.
// - 바뀔 때마다 창에 plan.changed { planId, wsKey, workspace, no, name, status, rev, doc, summary, owner, manager, updatedAt, updatedBy, by, via, at, changes }.
// - atrium plan show는 관리자에게 지난번 본 뒤 남(사람 또는 다른 세션)이 바꾼 것을 한 줄로 보이고 본 자리를 옮긴다(meta planSeen:<세션 ID>).
import { shownName } from './session-label.mjs';
import { workspaceNames } from './workspaces.mjs';
import { PLAN, HUMAN_OPS, emptyPlan, applyPlanOps, planSummary, validatePlanDoc, importCounts, planMarkdown, focusUserItems } from './plan.mjs';

export const LANE_STATUSES = ['active', 'paused', 'done', 'archived'];
export const LANE_NAME_MAX = 40;
const err = (code, message, extra = {}) => Object.assign(new Error(message), { code }, extra);
const oneLine = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

export function laneName(v) {
  const s = oneLine(v).replace(/^#/, '');
  if (!s) throw err('bad_request', '레인 이름을 준다: atrium plan new "<이름>"');
  if (s.length > LANE_NAME_MAX) throw err('too_long', '레인 이름은 ' + LANE_NAME_MAX + '자까지다(' + s.length + '자).');
  if (/^\d+$/.test(s)) throw err('bad_request', '레인 이름은 숫자만으로 짓지 않는다(번호와 헷갈린다): ' + s);
  if (/["\n]/.test(s)) throw err('bad_request', '레인 이름에 큰따옴표·줄바꿈을 쓰지 않는다.');
  return s;
}

export class Plans {
  // b: 백엔드(sessions, store, api, log, resolveWorkspace?). branch: Branch(verbs.target)
  constructor(b, branch, { now = null } = {}) {
    this.b = b; this.branch = branch;
    this.now = now || (() => Date.now());
    try { b.store.prunePlans(this.now()); } catch {}
  }
  store() { return this.b.store; }
  wsName(key) { if (!key) return null; try { return workspaceNames(this.store().workspaces()).get(key) || key; } catch { return key; } }
  viaOf(c) { return c && (c.remote || (c.auth && c.auth.device)) ? 'remote' : 'pc'; }
  nameOf(id) { if (!id) return null; const s = this.b.sessions.get(id); if (s) return shownName(s) || s.name; const r = this.store().getSession ? this.store().getSession(id) : null; return r ? shownName(r) || r.name : null; }
  async keyOf(ref) {
    if (!ref) throw err('bad_request', 'workspace를 준다.');
    if (this.b.resolveWorkspace) return (await this.b.resolveWorkspace(ref)).key;
    const w = this.store().getWorkspace(String(ref)); if (!w) throw err('not_found', '보드에서 프로젝트를 찾을 수 없다: ' + ref); return w.key;
  }
  // 워크스페이스의 레인(다시 연 워크스페이스면 되살린다)
  lanes(wsKey) {
    try { if (this.store().getWorkspace(wsKey) && this.store().plansIn(wsKey, { deleted: true }).some((r) => r.deletedAt)) this.store().restorePlans(wsKey); } catch {}
    return this.store().plansIn(wsKey);
  }
  laneText(r) { return '#' + r.no + ' ' + r.name + (r.owner ? '(@' + (this.nameOf(r.owner) || '?') + ')' : '(관리자 없음)'); }
  // 이름·번호(#3, 3)로 찾기
  findLane(wsKey, ref) {
    const list = this.lanes(wsKey);
    const s = oneLine(ref);
    const m = s.match(/^#?(\d+)$/);
    const r = m ? list.find((x) => x.no === Number(m[1])) : list.find((x) => x.name === s) || list.find((x) => x.name.toLowerCase() === s.toLowerCase());
    if (!r) throw err('not_found', '레인이 없다: ' + s + '. ' + (list.length ? '이 워크스페이스의 레인: ' + list.map((x) => this.laneText(x)).join(', ') : '이 워크스페이스에는 아직 레인이 없다: atrium plan new "<이름>"'), { lanes: list.map((x) => ({ no: x.no, name: x.name })) });
    return r;
  }
  // 부른 세션의 레인: --plan을 주면 그것, 아니면 관리하는 레인(보관 아닌 것)이 하나일 때 그것 → 줄 | 오류(pick_plan)
  laneFor(s, ref) {
    if (ref != null && ref !== '') return this.findLane(s.workspaceKey, ref);
    const list = this.lanes(s.workspaceKey);
    const mine = list.filter((r) => r.owner === s.sessionId && r.status !== 'archived');
    if (mine.length === 1) return mine[0];
    const why = !list.length ? '이 워크스페이스에는 아직 레인이 없다. 만들기: atrium plan new "<이름>"(만든 세션이 관리자)'
      : (mine.length ? '네가 관리하는 레인이 ' + mine.length + '개다' : '네가 관리하는 레인이 없다') + '. --plan <이름|번호>로 고른다. 레인: ' + list.map((x) => this.laneText(x)).join(', ');
    throw err('pick_plan', why, { lanes: list.map((x) => ({ no: x.no, name: x.name, owner: this.nameOf(x.owner) })) });
  }
  // 창·CLI가 보는 꼴
  view(r, { log = PLAN.logShow } = {}) {
    const owner = r.owner ? { sessionId: r.owner, name: this.nameOf(r.owner), open: this.b.sessions.has(r.owner) } : null;
    return { planId: r.planId, wsKey: r.wsKey, workspace: this.wsName(r.wsKey), no: r.no, name: r.name, status: r.status, rev: r.rev, doc: r.doc, summary: planSummary(r.doc, this.now()), owner, createdAt: r.createdAt, updatedAt: r.updatedAt, updatedBy: r.updatedBy, ...(log ? { log: this.store().planLog(r.planId, { limit: log }) } : {}) };
  }
  brief(r) { const v = this.view(r, { log: 0 }); const { doc, ...rest } = v; return { ...rest, userItems: r.status === 'active' ? focusUserItems(r.doc, this.now()) : [] }; }
  emit(r, extra = {}) {
    const v = this.view(r, { log: 0 });
    try { this.b.api.broadcast('plan.changed', { ...v, ...extra }); } catch (e) { this.b.log && this.b.log('plan broadcast error', e && e.stack); }
    return v;
  }
  // actor: { by, via, sessionId? }. 관리자인가(사람은 null)
  managerFlag(r, actor) { return actor.sessionId ? r.owner === actor.sessionId : null; }
  commit(r, fields, logs, actor, extraEvent = {}) {
    const at = this.now();
    const manager = this.managerFlag(r, actor);
    const rev = r.rev + 1;
    const nr = this.store().savePlan({ planId: r.planId, rev, at, by: actor.by, keep: PLAN.logKeep, ...fields, log: logs.map((l) => ({ ...l, by: actor.by, via: actor.via, manager })) });
    try { this.store().addEvent(actor.sessionId || null, 'plan_op', { planId: r.planId, ws: r.wsKey, rev, ops: logs.map((l) => l.op), by: actor.sessionId ? 'agent' : 'user', via: actor.via, manager, ...extraEvent }); } catch {}
    const v = this.emit(nr, { by: actor.by, via: actor.via, at, manager, changes: logs.map((l) => ({ op: l.op, ref: l.ref ?? null, summary: l.summary })) });
    // P306: 사람이 바꾸면 그 레인의 관리자에게 알린다(plan-notify.mjs. 다음 메시지와 | 곧바로 | 끔, 마일스톤이 모두 체크되면 곧바로)
    let note = null;
    if (!actor.sessionId && this.b.planNotes) { try { note = this.b.planNotes.onHuman(r, nr, logs); } catch (e) { this.b.log && this.b.log('plan note error', e && e.stack); } }
    return { nr, v, manager, note };
  }
  // 연산 여럿을 원자로
  write(r, ops, actor) {
    if (!Array.isArray(ops) || !ops.length) throw err('bad_request', '연산을 준다.');
    const { doc, results, log } = applyPlanOps(r.doc, ops, { now: this.now(), actor: { by: actor.by, via: actor.via } });
    const { v, manager, note } = this.commit(r, { doc }, log, actor);
    return { ok: true, rev: v.rev, changed: results, log: log.map((l) => l.summary), manager, plan: v, ...(note ? { note } : {}) };
  }
  create(wsKey, name, actor, doc = emptyPlan()) {
    const nm = laneName(name);
    const list = this.lanes(wsKey);
    if (list.some((x) => x.name.toLowerCase() === nm.toLowerCase())) throw err('exists', '이 워크스페이스에 같은 이름의 레인이 있다: ' + nm);
    const at = this.now();
    const r = this.store().createPlan({ wsKey, name: nm, doc, owner: actor.sessionId || null, createdBy: actor.sessionId || null, at, by: actor.by, log: [{ op: 'new', ref: null, summary: '레인 만듦: ' + nm, by: actor.by, via: actor.via, manager: actor.sessionId ? true : null }] });
    try { this.store().addEvent(actor.sessionId || null, 'plan_new', { planId: r.planId, ws: wsKey }); } catch {}
    const v = this.emit(r, { by: actor.by, via: actor.via, at, manager: actor.sessionId ? true : null, changes: [{ op: 'new', ref: null, summary: '레인 만듦: ' + nm }] });
    return { ok: true, created: true, rev: r.rev, plan: v };
  }
  setOwner(r, ownerId, actor) {
    const from = r.owner;
    const summary = '관리자 ' + (from ? '@' + (this.nameOf(from) || '?') : '없음') + ' → ' + (ownerId ? '@' + (this.nameOf(ownerId) || '?') : '없음');
    const { v, manager } = this.commit(r, { owner: ownerId }, [{ op: 'owner', ref: null, summary }], actor);
    return { ok: true, rev: v.rev, from: from ? this.nameOf(from) : null, owner: v.owner, manager, log: [summary], plan: v };
  }
  setStatus(r, status, actor) {
    const st = String(status || '').trim();
    if (!LANE_STATUSES.includes(st)) throw err('bad_request', '레인 상태는 ' + LANE_STATUSES.join(', ') + ' 가운데 하나다: ' + status);
    const summary = '상태 ' + r.status + ' → ' + st;
    const { v, manager } = this.commit(r, { status: st }, [{ op: 'status', ref: null, summary }], actor);
    return { ok: true, rev: v.rev, status: st, manager, log: [summary], plan: v };
  }
  // 가져오기(그 레인에). o: { doc, replace, ifRev, dry }
  importDoc(r, o, actor) {
    const doc = validatePlanDoc(o.doc);
    const counts = importCounts(doc);
    const has = !!(r.doc.goal || r.doc.metrics.length || r.doc.milestones.length);
    if (o.ifRev != null && o.ifRev !== '' && Number(o.ifRev) !== r.rev) throw err('stale_rev', '레인이 바뀌었다(지금 rev ' + r.rev + ', 준 값 ' + o.ifRev + '). atrium plan export로 다시 받고 고쳐 가져온다.', { rev: r.rev });
    if (o.dry) return { dry: true, counts, current: has ? { rev: r.rev, ...importCounts(r.doc) } : null, wouldReplace: has, replace: !!o.replace, plan: { planId: r.planId, no: r.no, name: r.name } };
    if (has && !o.replace) throw err('plan_exists', '레인 ' + this.laneText(r) + '에 이미 계획이 있다(rev ' + r.rev + '). 덮어쓰려면 --replace(먼저 atrium plan export로 받아 둔다). 새 레인으로는 --new "<이름>".', { rev: r.rev });
    const summary = '가져옴: 마일스톤 ' + counts.milestones + ', 항목 ' + counts.items + (has ? '(덮어씀)' : '');
    const { v, manager } = this.commit(r, { doc }, [{ op: 'import', ref: null, summary }], actor, counts);
    return { ok: true, rev: v.rev, counts, replaced: has, manager, plan: v };
  }
  // 새 레인으로 가져오기(이름은 --new, 없으면 JSON의 name)
  importNew(wsKey, name, raw, o, actor) {
    const doc = validatePlanDoc(raw);
    let nm = name;
    if (!nm) { try { const j = typeof raw === 'string' ? JSON.parse(raw.replace(/^﻿/, '')) : raw; nm = j && j.name; } catch {} }
    if (!nm) throw err('bad_request', '새 레인 이름을 준다: --new "<이름>"(JSON에 name이 없다)');
    const counts = importCounts(doc);
    if (o.dry) { laneName(nm); return { dry: true, counts, current: null, wouldReplace: false, newLane: laneName(nm) }; }
    const r = this.create(wsKey, nm, actor, doc);
    return { ok: true, rev: r.rev, counts, replaced: false, created: true, plan: r.plan };
  }
  exportDoc(r, format = 'json') {
    if (format === 'md') return { format: 'md', rev: r.rev, text: planMarkdown(r.doc, { name: (this.wsName(r.wsKey) || '') + ' · ' + r.name }) };
    return { format: 'json', rev: r.rev, doc: { name: r.name, ...r.doc } };
  }
  listOf(wsKey, { all = false } = {}) { return this.lanes(wsKey).filter((r) => all || r.status !== 'archived').map((r) => this.brief(r)); }

  // ---------- 판 API(사람) ----------
  laneById(id) { const r = this.store().getPlan(id); if (!r || r.deletedAt) throw err('not_found', '레인이 없다: ' + id); return r; }
  async laneOfApi(p) {
    if (p.plan != null && /^\d+$/.test(String(p.plan)) && !p.workspace) return this.laneById(p.plan);
    if (p.planId != null) return this.laneById(p.planId);
    return this.findLane(await this.keyOf(p.workspace), p.plan);
  }
  handlers() {
    const human = (p, c) => ({ by: 'user', via: p.via === 'foryou' ? 'foryou' : this.viaOf(c) });
    return {
      // p: { workspace?, all? } → { plans: [레인 요약(문서 없이) + userItems] }
      'plan.list': async (p = {}) => {
        const rows = p.workspace ? this.lanes(await this.keyOf(p.workspace)) : this.store().plans();
        return { plans: rows.filter((r) => p.all || r.status !== 'archived').map((r) => this.brief(r)) };
      },
      'plan.get': async (p) => this.view(await this.laneOfApi(p), { log: p.log == null ? PLAN.logShow : Number(p.log) || 0 }),
      // p: { planId | workspace+plan, op | ops, via?: foryou }. 사람은 HUMAN_OPS만(목표 문장과 마일스톤 구조는 관리자 명령으로)
      'plan.op': async (p, c) => {
        const r = await this.laneOfApi(p);
        const ops = [...(p.op ? [typeof p.op === 'string' ? { ...p, op: p.op } : p.op] : []), ...(Array.isArray(p.ops) ? p.ops : [])].map((o) => { const { workspace, via, plan, planId, ...rest } = o; return rest; });
        const no = ops.find((o) => !HUMAN_OPS.includes(o.op));
        if (no) throw err('not_permitted', '창에서는 체크·focus·항목·측정값 지금만 고친다. 목표 문장과 마일스톤 구조는 그 레인의 관리자가 atrium plan으로 고친다: ' + no.op);
        return this.write(r, ops, human(p, c));
      },
      // p: { planId, session | null }(사람이 관리자를 넘김)
      'plan.owner': async (p, c) => { const r = await this.laneOfApi(p); const sid = p.session ? this.resolveSession(null, p.session).sessionId : null; return this.setOwner(r, sid, human(p, c)); },
      'plan.status': async (p, c) => this.setStatus(await this.laneOfApi(p), p.status, human(p, c)),
      'plan.import': async (p, c) => (p.new ? this.importNew(await this.keyOf(p.workspace), p.new, p.doc, p, human(p, c)) : this.importDoc(await this.laneOfApi(p), { doc: p.doc, replace: !!p.replace, ifRev: p.ifRev, dry: !!p.dry }, human(p, c))),
      'plan.export': async (p) => this.exportDoc(await this.laneOfApi(p), p.format === 'md' ? 'md' : 'json'),
      'plan.log': async (p) => ({ rows: this.store().planLog((await this.laneOfApi(p)).planId, { limit: p.limit || PLAN.logShow }) }),
    };
  }
  // 세션 이름 → 세션(@ 없이도). caller가 있으면 Branch의 이름 풀기를 쓴다
  resolveSession(caller, ref) {
    const name = String(ref || '').replace(/^@/, '').trim();
    if (caller && this.branch && this.branch.verbs && this.branch.verbs.target) return this.branch.verbs.target(caller, name);
    const s = [...this.b.sessions.values()].find((x) => x.name === name || shownName(x) === name || x.sessionId === name);
    if (!s) throw err('not_found', '보드에서 세션을 찾을 수 없다: ' + ref);
    return s;
  }

  // ---------- atrium plan(에이전트) ----------
  // body: { action, plan?, all?, name?, ops?, owner?, status?, doc?, new?, replace?, ifRev?, dry?, format?, lines? }
  verb(s, body = {}) {
    const wsKey = s.workspaceKey;
    if (!wsKey) throw err('no_workspace', '이 세션은 보드의 워크스페이스(리포)에 속하지 않아 레인이 없다.');
    const action = body.action || 'show';
    const actor = { by: shownName(s) || s.name, via: 'agent', sessionId: s.sessionId };
    if (action === 'list') return { wsKey, workspace: this.wsName(wsKey), me: s.sessionId, lanes: this.listOf(wsKey, { all: !!body.all }).map((l) => ({ ...l, mine: !!(l.owner && l.owner.sessionId === s.sessionId) })) };
    if (action === 'new') return this.create(wsKey, body.name, actor);
    if (action === 'show') {
      let r;
      try { r = this.laneFor(s, body.plan); } catch (e) {
        if (e.code !== 'pick_plan') throw e;
        return { pick: true, why: e.message, wsKey, workspace: this.wsName(wsKey), lanes: this.listOf(wsKey).map((l) => ({ ...l, mine: !!(l.owner && l.owner.sessionId === s.sessionId) })) };
      }
      return this.showFor(s, r, body);
    }
    if (action === 'import' && body.new) return { ...this.importNew(wsKey, body.new, body.doc, body, actor) };
    const r = this.laneFor(s, body.plan);
    if (action === 'export') return this.exportDoc(r, body.format === 'md' ? 'md' : 'json');
    if (action === 'log') return { planId: r.planId, no: r.no, name: r.name, rows: this.store().planLog(r.planId, { limit: body.lines || PLAN.logShow }) };
    const withOwner = (x) => ({ ...x, lane: { no: r.no, name: r.name, owner: r.owner ? this.nameOf(r.owner) : null } });
    if (action === 'import') return withOwner(this.importDoc(r, body, actor));
    if (action === 'op') return withOwner(this.write(r, Array.isArray(body.ops) ? body.ops : [body.op].filter(Boolean), actor));
    if (action === 'owner') {
      const to = body.owner == null || /^(none|-|없음)$/i.test(String(body.owner)) ? null : body.owner === 'me' ? s : this.resolveSession(s, body.owner);
      return withOwner(this.setOwner(r, to ? to.sessionId : null, actor));
    }
    if (action === 'status') return withOwner(this.setStatus(r, body.status, actor));
    throw err('bad_request', '알 수 없는 atrium plan 동작이다: ' + action);
  }
  // atrium plan [show]: 그 레인 + 관리자면 지난번 본 뒤 남이 바꾼 것
  showFor(s, r, body = {}) {
    const v = this.view(r, { log: 0 });
    const manager = r.owner === s.sessionId;
    const me = shownName(s) || s.name;
    let otherChanges = [];
    if (manager) {
      const key = 'planSeen:' + s.sessionId;
      const seen = this.store().getMeta(key) || {};
      const after = Number(seen[r.planId]) || 0;
      if (after) otherChanges = this.store().planLog(r.planId, { limit: 50, afterId: after }).filter((l) => l.by !== me).reverse();
      const last = this.store().lastPlanLogId(r.planId);
      if (last !== after) this.store().setMeta(key, { ...seen, [r.planId]: last });
    }
    return { ...v, manager, all: !!body.all, otherChanges, at: this.now() };
  }
  // atrium me: 내가 관리하는 레인(보관 아닌 것)
  meLines(s) {
    if (!s.workspaceKey) return [];
    return this.lanes(s.workspaceKey).filter((r) => r.owner === s.sessionId && r.status !== 'archived').map((r) => {
      const f = planSummary(r.doc, this.now()).focus;
      return { planId: r.planId, no: r.no, name: r.name, status: r.status, rev: r.rev, focus: f ? f.code : null, title: f ? f.title : null, done: f ? f.done : 0, total: f ? f.total : 0, userLeft: f ? f.userLeft : 0 };
    });
  }
}
