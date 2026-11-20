// P257: 문서 점검을 판의 길목에 잇는다(doc-check.mjs가 점검 본체). 하네스를 가리지 않는다(hook이 아니라 판의 상태 변화와 전달로).
// - 언제: 지휘 세션의 턴 끝(일하는 중 → 쉼)과 하위의 done 보고가 올 때. 어기면 그 세션의 다음 지시(전달) 끝에 한 줄 경고를 붙인다. 막지 않는다.
//   턴 끝 경고는 문제 묶음이 바뀔 때만(같은 문제를 턴마다 되풀이하지 않는다). done 알림은 문제가 있으면 늘 붙는다.
//   done 알림을 넣는 동안 점검이 돌고 있으면 그 전달을 잠깐(waitMs) 붙잡아 경고가 그 알림에 실리게 한다.
// - 지휘 세션: .atrium/docs.json의 leads(사람이 정한 이름)가 있으면 그 세션만. 없으면 일을 맡긴 세션(맡긴 일이 있거나 일 하위가 있다) 가운데
//   자기는 일 상위가 없는 세션(하위의 하위를 둔 중간 세션은 위로 보고만 한다).
// - 짧은 규칙: 지휘 세션이 받는 done 알림 끝에 붙는다(백엔드가 뜬 뒤 처음 받는 done에는 규칙 묶음 docRules, 그 뒤는 한 줄 DOC_DONE_LINE).
//   일을 받는 쪽은 일 머리 셋째 줄 끝에 "문서는 고치지 않고 보고만" 한 마디(workerTail). 문서가 없는 워크스페이스에는 아무것도 싣지 않는다.
// - .atrium/: 첫 위임 때(git 워크스페이스) 또는 사람이 켤 때(docs.enable) 만들고 .git/info/exclude로 git 밖에 둔다.
import fs from 'node:fs';
import path from 'node:path';
import { shownName } from './session-label.mjs';
import { checkDocs, docsOn, loadDocConfig, docPlace, problemSig, warnLine, DOC_DONE_LINE, docRules, workerTail, ensureAtriumDir, excludeFileOf, reportLines, DOCS_CONFIG } from './doc-check.mjs';

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
    if (!root || this.ensured.has(root)) return null;
    this.ensured.add(root);
    if (!excludeFileOf(root)) return null;
    try {
      const r = ensureAtriumDir(root);
      if (r.created || r.excluded) try { this.store().addEvent(null, 'atrium_dir', { workspace: caller.workspaceKey, created: r.created, excluded: r.excluded, by: 'delegate' }); } catch {}
      return r;
    } catch (e) { if (this.b.log) this.b.log('atrium dir error', e && e.stack); return null; }
  }

  // atrium docs(에이전트): 부르는 세션 워크스페이스의 점검 결과
  async verb(s) {
    const root = this.rootOf(s);
    if (!root) throw apiError('no_workspace', '이 세션의 워크스페이스를 모른다.');
    const res = await this.checker(root);
    const lead = res.on ? this.isLead(s, root) : false;
    const lines = reportLines(res);
    if (res.on && res.problems.length) lines.push(lead ? '너는 이 워크스페이스의 지휘 세션이다: 틀린 문장을 고친다(그 코드와 같은 커밋에).' : '너는 지휘 세션이 아니다: 문서는 고치지 않고 바꿀 문장을 done 보고에 적는다.');
    return { ...res, lead, lines };
  }
}

// 판 API(사람·창). 켜기·끄기는 이 PC의 판 API 토큰으로 붙은 연결만
export function docHandlers(b) {
  const local = (c) => { if (!c || !c.auth || c.auth.kind !== 'local') throw apiError('forbidden', '문서 점검 켜기·끄기는 이 PC의 보드에서 한다(판 API 토큰).'); };
  const rootOf = async (p) => { const ws = await b.resolveWorkspace(p && p.workspace); const w = ws && b.store.getWorkspace(ws.key); if (!w || !w.root) throw apiError('not_found', '워크스페이스를 모른다.'); return { key: ws.key, root: w.root }; };
  const setOff = (root, off, dir) => {
    const file = path.join(root, DOCS_CONFIG);
    let cur = {};
    try { cur = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')); } catch { cur = {}; }
    const next = { ...cur, ...(dir ? { dir } : {}), off };
    if (!off) delete next.off;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(next, null, 2) + '\n');
  };
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
    'docs.disable': async (p, c) => {
      local(c);
      const { key, root } = await rootOf(p);
      ensureAtriumDir(root);
      setOff(root, true, null);
      return { workspace: key, off: true };
    },
  };
}
