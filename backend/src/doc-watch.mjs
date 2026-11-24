// P257: 문서 점검을 판의 길목에 잇는다(doc-check.mjs가 점검 본체). 하네스를 가리지 않는다(hook이 아니라 판의 상태 변화와 전달로).
// - 언제: 지휘 세션의 턴 끝(일하는 중 → 쉼)과 하위의 done 보고가 올 때. 어기면 그 세션의 다음 지시(전달) 끝에 한 줄 경고를 붙인다. 막지 않는다.
//   턴 끝 경고는 문제 묶음이 바뀔 때만(같은 문제를 턴마다 되풀이하지 않는다). done 알림은 문제가 있으면 늘 붙는다.
//   done 알림을 넣는 동안 점검이 돌고 있으면 그 전달을 잠깐(waitMs) 붙잡아 경고가 그 알림에 실리게 한다.
// - 지휘 세션: .atrium/docs.json의 leads(사람이 정한 이름)가 있으면 그 세션만. 없으면 일을 맡긴 세션(맡긴 일이 있거나 일 하위가 있다) 가운데
//   자기는 일 상위가 없는 세션(하위의 하위를 둔 중간 세션은 위로 보고만 한다).
// - 짧은 규칙: 지휘 세션이 받는 done 알림 끝에 붙는다(백엔드가 뜬 뒤 처음 받는 done에는 규칙 묶음 docRules, 그 뒤는 한 줄 DOC_DONE_LINE).
//   일을 받는 쪽은 일 머리 셋째 줄 끝에 "문서는 고치지 않고 보고만" 한 마디(workerTail). 문서가 없는 워크스페이스에는 아무것도 싣지 않는다.
// - .atrium/: 첫 위임 때(git 워크스페이스) 또는 사람이 켤 때(docs.enable) 만들고 .git/info/exclude로 git 밖에 둔다.
// - P346 문서 시작 알림: git 워크스페이스에서 지휘 세션이 처음 일을 맡길 때 살아 있는 문서가 없으면(BRIEF·ARCH·PLAN, docs.json 모두 없음)
//   그 세션의 다음 전달 앞에 한 줄(DOC_START_LINE)을 한 번 붙인다(decisions.mjs attachFront, 판 명령 알림 다음). 워크스페이스마다 한 번(판 기록 meta docsStart:<키>).
//   실은 전달이 실패·취소되면 다음 전달에 다시 싣는다. 그새 문서가 생겼으면 싣지 않는다.
// - P346 atrium docs init|on|off(에이전트): 지휘 세션만(일 상위가 있는 워커는 거절). init은 doc-check.mjs initDocs(없는 파일만, 덮지 않음).
import { shownName } from './session-label.mjs';
import { LEAD_ONLY_SUBS } from './orchestration.mjs'; // P346: 지휘 세션만 쓰는 docs 낱말
import { checkDocs, docsOn, loadDocConfig, docPlace, problemSig, warnLine, DOC_DONE_LINE, docRules, workerTail, ensureAtriumDir, excludeFileOf, reportLines, DOCS_CONFIG, initDocs, setDocsOff, needsDocStart, DOC_START_LINE } from './doc-check.mjs';

export const DOC_WAIT_MS = 3000;
function apiError(code, message) { return Object.assign(new Error(message), { code }); }

export class DocWatch {
  // b: 백엔드(store, sessions, log). branch: Branch(일 관계)
  constructor(b, branch, { waitMs = DOC_WAIT_MS, checker = checkDocs } = {}) {
    this.b = b; this.branch = branch; this.waitMs = waitMs; this.checker = checker;
    this.prev = new Map(); // 세션 ID → 마지막으로 본 상태(턴 끝 판정)
    this.pending = new Map(); // 세션 ID → 다음 전달에 붙일 경고 한 줄
    this.warned = new Map(); // 세션 ID → 마지막으로 알린 문제 서명
    this.rulesSent = new Set(); // 규칙 묶음을 받은 지휘 세션
    this.inflight = new Map(); // 워크스페이스 뿌리 → 도는 점검
    this.waiting = new Map(); // 세션 ID → 그 세션을 위해 도는 점검 수
    this.ensured = new Set(); // .atrium/을 본 뿌리
    this.startPending = new Map(); // P346: 세션 ID → { root, line } 다음 전달 앞에 붙일 문서 시작 알림
    this.startRides = new Map(); // P346: 전달 ID → { sessionId, root, line }
    this.wireQueue(b.queue);
  }
  wireQueue(q) {
    if (!q || typeof q.on !== 'function' || this.wiredQueue === q) return;
    this.wiredQueue = q;
    q.on('delivery', (e) => { try { this.onDelivery(e); } catch (err) { this.b.log && this.b.log('doc start ride error', err && err.stack); } });
  }
  lang() { try { const f = this.b.features; const l = f && f.settings ? f.settings.get().language : null; return l === 'ko' ? 'ko' : 'en'; } catch { return 'en'; } }
  // P346: 문서를 시작·켜기·끄기 할 수 있는 세션(지휘 세션). leads가 있으면 그 세션만, 없으면 일 상위가 없는 세션
  mayWrite(s, root) {
    const { config } = loadDocConfig(root);
    if (config.leads.length) return config.leads.includes(s.name) || config.leads.includes(shownName(s));
    const idx = this.branch && this.branch.relIndex ? this.branch.relIndex() : null;
    return !(idx && idx.workParentOf(s.sessionId));
  }
  store() { return this.b.store; }
  rootOf(s) { const w = s && s.workspaceKey && this.store().getWorkspace ? this.store().getWorkspace(s.workspaceKey) : null; return w && w.root ? w.root : null; }
  // 점검하는 워크스페이스면 뿌리, 아니면 null
  onRoot(s) { const r = this.rootOf(s); try { return r && docsOn(r) ? r : null; } catch { return null; } }
  isLead(s, root) {
    if (!s) return false;
    const { config } = loadDocConfig(root);
    if (config.leads.length) return config.leads.includes(s.name) || config.leads.includes(shownName(s));
    const br = this.branch;
    const idx = br && br.relIndex ? br.relIndex() : null;
    if (idx && idx.workParentOf(s.sessionId)) return false;
    const st = this.store();
    if (st.unitsFrom && st.unitsFrom(s.sessionId, 1).length) return true;
    return !!(br && br.workChildren && br.workChildren(s.sessionId, idx || undefined).length);
  }
  check(root) {
    let p = this.inflight.get(root);
    if (!p) {
      p = Promise.resolve().then(() => this.checker(root)).catch((e) => { if (this.b.log) this.b.log('doc check error', e && e.stack); return null; }).finally(() => this.inflight.delete(root));
      this.inflight.set(root, p);
    }
    return p;
  }
  // 그 세션을 위해 점검하고 문제가 있으면 다음 전달에 붙일 줄을 둔다. force: 같은 문제여도 다시(done 알림)
  runFor(s, root, { force = false, why = 'turn' } = {}) {
    const sid = s.sessionId;
    this.waiting.set(sid, (this.waiting.get(sid) || 0) + 1);
    return this.check(root).then((res) => {
      if (!res) return null;
      const sig = problemSig(res);
      if (!sig) { this.warned.delete(sid); this.pending.delete(sid); return res; }
      if (!force && this.warned.get(sid) === sig) return res;
      this.warned.set(sid, sig);
      this.pending.set(sid, warnLine(res));
      try { this.store().addEvent(sid, 'doc_check', { why, problems: res.problems.map((p) => p.code + (p.file ? ':' + p.file : '')) }); } catch {}
      return res;
    }).finally(() => { const n = (this.waiting.get(sid) || 1) - 1; if (n > 0) this.waiting.set(sid, n); else this.waiting.delete(sid); });
  }

  // 판의 상태 변화(bus session). 지휘 세션의 턴 끝이면 점검한다
  onSession(s, sum) {
    if ((s.kind || 'claude') === 'shell') return null;
    const sid = s.sessionId;
    const prev = this.prev.get(sid);
    this.prev.set(sid, sum.state);
    if (prev !== 'working' || (sum.state !== 'ready' && sum.state !== 'error')) return null;
    const root = this.onRoot(s);
    if (!root || !this.isLead(s, root)) return null;
    return this.runFor(s, root, { why: 'turn' });
  }
  // 전달 직전(delivery.mjs pump). 'wait'면 이번에는 보내지 않는다. 붙일 경고가 있으면 글 끝에 한 줄을 더한다
  beforeDeliver(d) {
    if (!d || d.typeNow || d.attempts) return undefined;
    const sid = d.sessionId;
    if (this.waiting.has(sid)) {
      if (d.docWaitAt == null) d.docWaitAt = Date.now();
      if (Date.now() - d.docWaitAt < this.waitMs) return 'wait';
    }
    const line = this.pending.get(sid);
    if (!line) return undefined;
    this.pending.delete(sid);
    d.text = d.text + '\n\n' + line;
    const st = this.store();
    if (st.updateDeliveryText) try { st.updateDeliveryText(d.deliveryId, d.text); } catch {}
    try { st.addEvent(sid, 'doc_warn', { deliveryId: d.deliveryId, line }); } catch {}
    return undefined;
  }
  // done 알림 끝에 붙일 줄(지휘 세션이 받을 때만). 점검을 다시 돌려 경고가 그 알림에 실리게 한다
  doneLines(parent) {
    const root = this.onRoot(parent);
    if (!root || !this.isLead(parent, root)) return [];
    this.runFor(parent, root, { force: true, why: 'done' });
    const first = !this.rulesSent.has(parent.sessionId);
    this.rulesSent.add(parent.sessionId);
    return [first ? docRules(loadDocConfig(root).config.dir) : DOC_DONE_LINE];
  }
  // 일 머리 셋째 줄 끝(일을 받는 세션)
  headerTail(t) { const root = t ? this.onRoot(t) : null; return root ? workerTail(loadDocConfig(root).config.dir) : null; }
  // 첫 위임: 맡긴 세션의 워크스페이스에 .atrium/(git 워크스페이스만)
  onDelegate(caller) {
    const root = this.rootOf(caller);
    try { this.maybeStart(caller, root); } catch (e) { if (this.b.log) this.b.log('doc start error', e && e.stack); } // P346
    if (!root || this.ensured.has(root)) return null;
    this.ensured.add(root);
    if (!excludeFileOf(root)) return null;
    try {
      const r = ensureAtriumDir(root);
      if (r.created || r.excluded) try { this.store().addEvent(null, 'atrium_dir', { workspace: caller.workspaceKey, created: r.created, excluded: r.excluded, by: 'delegate' }); } catch {}
      return r;
    } catch (e) { if (this.b.log) this.b.log('atrium dir error', e && e.stack); return null; }
  }

  // P346: 문서 시작 알림을 둘 때인가(지휘 세션의 위임, git, 문서 없음, 이 워크스페이스에 처음)
  maybeStart(caller, root) {
    if (!root || !caller || !caller.workspaceKey) return false;
    const st = this.store();
    const key = 'docsStart:' + caller.workspaceKey;
    if (!st.getMeta || st.getMeta(key)) return false;
    if (!needsDocStart(root) || !this.isLead(caller, root)) return false;
    st.setMeta(key, { at: Date.now(), session: caller.name });
    this.startPending.set(caller.sessionId, { root, line: DOC_START_LINE });
    try { st.addEvent(caller.sessionId, 'doc_start', { workspace: caller.workspaceKey }); } catch {}
    return true;
  }
  // P346: 전달 대기열이 그 세션에 글을 처음 보내기 직전(decisions.mjs attachFront) → 앞에 붙일 한 줄 | null
  attachFront(sessionId, deliveryId = null) {
    const p = this.startPending.get(sessionId);
    if (!p) return null;
    this.startPending.delete(sessionId);
    if (!needsDocStart(p.root)) return null; // 그새 문서가 생겼거나 꺼졌다
    if (deliveryId) this.startRides.set(deliveryId, { sessionId, ...p });
    try { this.store().addEvent(sessionId, 'doc_start_sent', { deliveryId }); } catch {}
    return p.line;
  }
  onDelivery(e) {
    if (!e || !this.startRides.has(e.deliveryId)) return;
    if (e.status === 'confirmed' || e.status === 'unconfirmed') { this.startRides.delete(e.deliveryId); return; }
    if (e.status !== 'failed' && e.status !== 'cancelled') return;
    const r = this.startRides.get(e.deliveryId); this.startRides.delete(e.deliveryId);
    if (this.b.sessions && this.b.sessions.has(r.sessionId) && !this.startPending.has(r.sessionId)) this.startPending.set(r.sessionId, { root: r.root, line: r.line });
  }

  // atrium docs(에이전트): 부르는 세션 워크스페이스의 점검 결과. P346: init | on | off(지휘 세션만)
  async verb(s, body = {}) {
    const root = this.rootOf(s);
    if (!root) throw apiError('no_workspace', '이 세션의 워크스페이스를 모른다.');
    const action = body && body.action ? String(body.action) : 'status';
    if (action !== 'status') return this.write(s, root, action, body);
    const res = await this.checker(root);
    const lead = res.on ? this.isLead(s, root) : false;
    const lines = reportLines(res);
    if (res.on && res.problems.length) lines.push(lead ? '너는 이 워크스페이스의 지휘 세션이다: 틀린 문장을 고친다(그 코드가 합쳐진 뒤).' : '너는 지휘 세션이 아니다: 문서는 고치지 않고 바꿀 문장을 done 보고에 적는다.');
    return { ...res, lead, lines };
  }
  // P346: atrium docs init | on | off
  write(s, root, action, body = {}) {
    if (!LEAD_ONLY_SUBS.docs.includes(action)) throw apiError('bad_request', '알 수 없는 docs 낱말: ' + action + '. atrium docs [init|on|off]');
    if (!this.mayWrite(s, root)) throw apiError('not_lead', '문서 시작·켜기·끄기는 지휘 세션만 한다. 워커는 문서를 고치지 않고 바꿀 문장을 done 보고에 적는다.');
    const dir = body && typeof body.dir === 'string' && body.dir.trim() ? body.dir.trim() : null;
    const by = { by: 'agent', session: s.name };
    for (const [sid, p] of this.startPending) if (p.root === root) this.startPending.delete(sid); // 이제 알릴 까닭이 없다
    if (action === 'init') {
      const r = initDocs(root, { dir, only: body.only, lang: this.lang() });
      try { this.store().addEvent(s.sessionId, 'docs_init', { workspace: s.workspaceKey, created: r.created, skipped: r.skipped, dir: r.dir, ...by }); } catch {}
      return { action, ...r };
    }
    const off = action === 'off';
    const r = ensureAtriumDir(root);
    setDocsOff(root, off, off ? null : dir);
    try { this.store().addEvent(s.sessionId, off ? 'docs_off' : 'docs_on', { workspace: s.workspaceKey, ...by }); } catch {}
    const { config } = loadDocConfig(root);
    const present = docPlace(root, config).present;
    const lines = off ? ['문서 점검을 껐다(' + DOCS_CONFIG + ' off). 다시 켜기: atrium docs on']
      : ['문서 점검을 켰다(' + DOCS_CONFIG + ', 문서 자리 ' + config.dir + '/).' + (present ? '' : ' 아직 BRIEF·ARCH·PLAN이 없다: atrium docs init으로 틀을 만든다.')];
    return { action, off, dir: config.dir, present, ...r, lines };
  }
}

// 판 API(사람·창). 켜기·끄기는 이 PC의 판 API 토큰으로 붙은 연결만
export function docHandlers(b) {
  const local = (c) => { if (!c || !c.auth || c.auth.kind !== 'local') throw apiError('forbidden', '문서 점검 켜기·끄기는 이 PC의 보드에서 한다(판 API 토큰).'); };
  const rootOf = async (p) => { const ws = await b.resolveWorkspace(p && p.workspace); const w = ws && b.store.getWorkspace(ws.key); if (!w || !w.root) throw apiError('not_found', '워크스페이스를 모른다.'); return { key: ws.key, root: w.root }; };
  const setOff = (root, off, dir) => setDocsOff(root, off, dir); // P346: doc-check.mjs로 옮겼다(atrium docs on|off와 같이 쓴다)
  const langOf = () => { try { const l = b.features && b.features.settings ? b.features.settings.get().language : null; return l === 'ko' ? 'ko' : 'en'; } catch { return 'en'; } };
  return {
    'docs.status': async (p) => { const { root } = await rootOf(p); const res = await checkDocs(root); return { ...res, lines: reportLines(res) }; },
    // 켜기: .atrium/을 만들고 git 밖에 둔 뒤 docs.json(off 지움, dir을 주면 그 자리). 문서가 아직 없으면 점검은 문서가 생길 때 돈다
    'docs.enable': async (p, c) => {
      local(c);
      const { key, root } = await rootOf(p);
      const r = ensureAtriumDir(root);
      setOff(root, false, p && typeof p.dir === 'string' && p.dir.trim() ? p.dir.trim() : null);
      b.store.addEvent(null, 'atrium_dir', { workspace: key, created: r.created, excluded: r.excluded, by: 'human' });
      const { config } = loadDocConfig(root);
      return { workspace: key, ...r, dir: config.dir, present: docPlace(root, config).present };
    },
    // P346: 문서 시작(사람). 없는 파일만 만들고 있는 파일은 덮지 않는다
    'docs.init': async (p, c) => {
      local(c);
      const { key, root } = await rootOf(p);
      const r = initDocs(root, { dir: p && typeof p.dir === 'string' && p.dir.trim() ? p.dir.trim() : null, only: p && p.only, lang: p && (p.lang === 'ko' || p.lang === 'en') ? p.lang : langOf() });
      b.store.addEvent(null, 'docs_init', { workspace: key, created: r.created, skipped: r.skipped, dir: r.dir, by: 'human' });
      if (b.docs) for (const [sid, x] of b.docs.startPending) if (x.root === root) b.docs.startPending.delete(sid);
      return { workspace: key, ...r };
    },
    'docs.disable': async (p, c) => {
      local(c);
      const { key, root } = await rootOf(p);
      ensureAtriumDir(root);
      setOff(root, true, null);
      return { workspace: key, off: true };
    },
  };
}
