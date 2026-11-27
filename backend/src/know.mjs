// P364: 작업 지식 찾기(atrium know). 판 쪽 서비스: 부른 세션의 워크스페이스(리포)를 찾고, worker thread(know-worker.mjs)에 맡기고, 사용 기록을 남긴다.
// - 색인: <데이터 폴더>/know/<워크스페이스 키>.sqlite(저장소에 쓰지 않는다, 워크스페이스마다 따로). 처음 물을 때 짓고 묻기 전에 바뀐 것만 고친다.
//   done 뒤에는 이미 색인이 있는 워크스페이스만 뒤에서 고쳐 둔다(touch).
// - 사용 기록: <데이터 폴더>/know/usage.jsonl 한 줄씩(시각, 세션, 지금 일, 명령, 물음, 옵션, 돌려준 포인터와 글자 수, 전체 글자 수). 결과 본문은 남기지 않는다.
//   P388: 지금 일이 있는 세션이면 포인터마다 hinted('hint' 지시의 힌트 줄에 적힌 파일 | 'task' 지시의 다른 곳 | false 새로 찾음)와 hintFile(작업 파일).
//   지휘 세션·사람(지금 일 없음)은 hinted 칸이 없다
// - 판이 배정할 때 지식을 골라 붙이지 않는다(에이전트가 막혔을 때 스스로 묻는다). 결정 상태는 .atrium/know.json superseded 선언으로만 붙인다(know-text.mjs supersededOf).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Worker } from 'node:worker_threads';
import { redact, parseWhen, dayOf, KNOW_KINDS, selfUnitOf, taskFileOf, hintPathsOf, hintOf } from './know-text.mjs';

const kerr = (code, message) => Object.assign(new Error(message), { code });
export const KNOW_TIMEOUT_MS = 180000; // 처음 짓기가 큰 저장소에서 길 수 있다
export const TOUCH_DELAY_MS = 15000;
const QUESTION_LOG_MAX = 300;
const TASK_FILE_MAX = 512 * 1024; // P388: 힌트를 읽을 작업 파일 크기 상한

// P388: 세션의 지금 일 지시 → { file, hints: { hint, task } } | null. 일 spec 글과 그것이 가리키는 작업 파일(절대 경로, 없으면 워크스페이스 뿌리 기준)
export function hintsOfTask(spec, root) {
  if (!spec) return null;
  const ref = taskFileOf(spec);
  let body = ''; let file = null;
  if (ref) {
    const cands = path.isAbsolute(ref) ? [ref, ...(root ? [path.join(root, ref.replace(/^.*?[\\/](docs[\\/]log[\\/])/i, '$1'))] : [])] : root ? [path.join(root, ref)] : [];
    for (const c of cands) {
      try { const st = fs.statSync(c); if (st.isFile() && st.size <= TASK_FILE_MAX) { body = fs.readFileSync(c, 'utf8'); file = ref.replace(/\\/g, '/').replace(/^.*?\/(docs\/log\/)/i, '$1'); break; } } catch {}
    }
  }
  return { file, hints: hintPathsOf(`${spec}\n${body}`) };
}

// 워크스페이스 키 → 색인 파일 이름(읽을 수 있는 앞부분 + 짧은 해시)
export function indexName(key) {
  const k = String(key || '');
  const tail = k.split(/[\\/]/).filter(Boolean).slice(-2).join('-').replace(/\.git$/i, '').replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 40) || 'ws';
  return `${tail}-${crypto.createHash('sha1').update(k).digest('hex').slice(0, 10)}.sqlite`;
}

export class KnowService {
  // b: 판(backend). o: { dataDir, dbFile, worker: false면 같은 스레드에서 돌린다(시험) }
  constructor(b, o = {}) {
    this.b = b;
    this.dataDir = o.dataDir || (b && b.cfg && b.cfg.dataDir);
    this.dbFile = o.dbFile || (b && b.cfg && b.cfg.dbFile) || null;
    this.dir = path.join(this.dataDir, 'know');
    this.useWorker = o.worker !== false;
    this.worker = null; this.seq = 0; this.waiting = new Map(); this.touches = new Map();
  }
  get usageFile() { return path.join(this.dir, 'usage.jsonl'); }
  indexFile(key) { return path.join(this.dir, indexName(key)); }
  ctxOf(ws) { return { root: ws.root, key: ws.key, dbFile: this.dbFile, indexFile: this.indexFile(ws.key) }; }

  // ---------- worker ----------
  ensureWorker() {
    if (this.worker) return this.worker;
    const w = new Worker(new URL('./know-worker.mjs', import.meta.url));
    w.unref();
    w.on('message', (m) => { const p = this.waiting.get(m.id); if (!p) return; this.waiting.delete(m.id); clearTimeout(p.timer); if (m.ok) p.resolve(m.result); else p.reject(kerr(m.error.code, m.error.message)); });
    const fail = (e) => { for (const p of this.waiting.values()) { clearTimeout(p.timer); p.reject(kerr('know_failed', `색인 작업이 끝났다: ${e && e.message ? e.message : e}`)); } this.waiting.clear(); if (this.worker === w) this.worker = null; };
    w.on('error', fail);
    w.on('exit', (code) => fail(new Error(`worker 종료 ${code}`)));
    this.worker = w;
    return w;
  }
  async run(op, args) {
    if (!this.useWorker) { const { runOp } = await import('./know-core.mjs'); return runOp(op, args); }
    const w = this.ensureWorker();
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.waiting.delete(id); reject(kerr('timeout', '색인 작업이 오래 걸린다. 잠시 뒤 다시 묻는다')); }, KNOW_TIMEOUT_MS);
      this.waiting.set(id, { resolve, reject, timer });
      w.postMessage({ id, op, args });
    });
  }
  async close() {
    for (const t of this.touches.values()) clearTimeout(t);
    this.touches.clear();
    const w = this.worker; this.worker = null;
    if (w) { try { await w.terminate(); } catch {} }
  }

  // ---------- 워크스페이스 ----------
  wsOfSession(s) {
    const key = s && s.workspaceKey;
    const w = key && this.b.store.getWorkspace ? this.b.store.getWorkspace(key) : null;
    if (!w || !w.root) throw kerr('no_workspace', '이 세션의 워크스페이스(리포)를 모른다');
    return { key, root: w.root };
  }
  // done 뒤 등: 이미 색인이 있으면 뒤에서 고쳐 둔다(묻기 전 고침이 짧아지게). 없으면 짓지 않는다(처음 물을 때 짓는다)
  touch(key) {
    if (!key || !this.b || !this.b.store || !this.b.store.getWorkspace) return;
    const w = this.b.store.getWorkspace(key);
    if (!w || !w.root || !fs.existsSync(this.indexFile(key))) return;
    clearTimeout(this.touches.get(key));
    const t = setTimeout(() => { this.touches.delete(key); this.run('refresh', { ctx: this.ctxOf({ key, root: w.root }) }).catch(() => {}); }, TOUCH_DELAY_MS);
    if (t.unref) t.unref();
    this.touches.set(key, t);
  }

  // ---------- 동사 ----------
  // body: { action: search|open|unit|build|usage, q, k, kind, before, self, pointer, context, unit, full, json, since }. who: { session?, unit?, selfUnit?, workspace, task? }(task: hintsOfTask)
  async handle(body = {}, who = {}) {
    const action = body.action || 'search';
    const t0 = Date.now();
    if (action === 'usage') return this.usageVerb(body);
    if (!['search', 'open', 'unit', 'build'].includes(action)) throw kerr('bad_request', `알 수 없는 know 낱말: ${action}`);
    if (body.kind != null && body.kind !== '' && !KNOW_KINDS.includes(String(body.kind))) throw kerr('bad_request', `--kind는 ${KNOW_KINDS.join('|')}`);
    const ws = who.workspace;
    const args = { ctx: this.ctxOf(ws), json: !!body.json, q: body.q, k: body.k, kind: body.kind || null, before: body.before || null, self: !!body.self, selfUnit: who.selfUnit || null, pointer: body.pointer, context: body.context, unit: body.unit, full: !!body.full };
    const rec = { t: new Date(t0).toISOString(), session: who.session ? { name: who.session.name, id: who.session.sessionId } : null, unit: who.unit || null, workspace: ws.key, cmd: action,
      q: body.q ? redact(String(body.q)).slice(0, QUESTION_LOG_MAX) : action === 'open' ? String(body.pointer || '') : action === 'unit' ? String(body.unit || '') : null,
      opts: Object.fromEntries(Object.entries({ k: body.k, kind: body.kind, before: body.before, self: body.self, context: body.context, full: body.full, json: body.json }).filter(([, v]) => v != null && v !== '' && v !== false)),
      ...(who.task && who.task.file ? { hintFile: who.task.file } : {}) };
    const task = who.task || null;
    try {
      const r = await this.run(action, args);
      Object.assign(rec, { pointers: (r.pointers || []).map((p) => ({ p: p.pointer, chars: p.chars, ...(task ? { hinted: hintOf(p.pointer, task.hints) } : {}) })), total: r.total ?? (r.out || '').length, ms: Date.now() - t0 });
      return { out: r.out, total: r.total, pointers: r.pointers, ...(r.result ? { result: r.result } : {}), ...(r.stats ? { stats: r.stats } : {}) };
    } catch (e) { Object.assign(rec, { error: e.code || 'error', pointers: [], total: 0, ms: Date.now() - t0 }); throw e; }
    finally { this.log(rec); }
  }
  // 에이전트(atrium know). s: 부른 세션. P371: 그 세션의 단위(세션 이름, 없으면 판의 지금 일 글의 PNNN)를 찾기에 넘겨 자기 파일을 뺀다
  async verb(s, body = {}) {
    let unit = null; let spec = null; let task = null;
    try {
      const tr = this.b.store.openTryOf ? this.b.store.openTryOf(s.sessionId) : null; unit = tr ? tr.unitId : null;
      const u = unit && this.b.store.getUnit ? this.b.store.getUnit(unit) : null; spec = u ? u.spec : null;
    } catch {}
    if (body.action === 'usage') return this.usageVerb(body);
    const workspace = this.wsOfSession(s);
    try { task = unit ? hintsOfTask(spec, workspace.root) : null; } catch {}
    return this.handle(body, { session: s, unit, selfUnit: selfUnitOf(s && s.name, spec), workspace, task });
  }
  log(rec) {
    try { fs.mkdirSync(this.dir, { recursive: true }); fs.appendFileSync(this.usageFile, JSON.stringify(rec) + '\n'); } catch (e) { if (this.b && this.b.log) this.b.log(`know usage log failed: ${e.message}`); }
  }

  // ---------- 사용 집계(사람이 본다: atrium know --usage [--since]) ----------
  usage({ since = null } = {}) {
    const from = since ? sinceOf(since) : 0;
    let text = ''; try { text = fs.readFileSync(this.usageFile, 'utf8'); } catch {}
    const bySession = new Map(); const byDay = new Map(); const byCmd = new Map();
    const total = { calls: 0, chars: 0, errors: 0 };
    // P388: 돌려준 위치의 출처 — hint(지시의 힌트 줄), task(지시의 다른 곳), fresh(새로 찾음), none(지금 일 없음·P388 전 기록)
    const places = { pointers: 0, hint: 0, task: 0, fresh: 0, none: 0 };
    const placeOf = (p) => (p.hinted === 'hint' || p.hinted === true ? 'hint' : p.hinted === 'task' ? 'task' : p.hinted === false ? 'fresh' : 'none');
    const add = (m, k, r) => {
      const v = m.get(k) || { calls: 0, chars: 0, hint: 0, task: 0, fresh: 0 }; v.calls++; v.chars += r.total || 0;
      for (const p of r.pointers || []) { const w = placeOf(p); if (w !== 'none') v[w]++; }
      m.set(k, v);
    };
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      let r; try { r = JSON.parse(line); } catch { continue; }
      const t = Date.parse(r.t);
      if (!(t >= from)) continue;
      total.calls++; total.chars += r.total || 0; if (r.error) total.errors++;
      for (const p of r.pointers || []) { places.pointers++; places[placeOf(p)]++; }
      add(bySession, r.session ? r.session.name : '(사람)', r);
      add(byDay, dayOf(t), r);
      add(byCmd, r.cmd || 'search', r);
    }
    const list = (m) => [...m.entries()].map(([k, v]) => ({ key: k, ...v }));
    return { since: from ? new Date(from).toISOString() : null, total, places, bySession: list(bySession).sort((a, b) => b.calls - a.calls), byDay: list(byDay).sort((a, b) => (a.key < b.key ? -1 : 1)), byCmd: list(byCmd) };
  }
  usageVerb(body = {}) {
    const u = this.usage({ since: body.since || null });
    const lines = [`know 사용${u.since ? `(${u.since.slice(0, 16).replace('T', ' ')} 뒤)` : ''}: 호출 ${u.total.calls}번, 돌려준 글 ${u.total.chars.toLocaleString('en-US')}자${u.total.errors ? `, 실패 ${u.total.errors}번` : ''}`,
      `명령별: ${u.byCmd.map((x) => `${x.key} ${x.calls}번`).join(' · ') || '없음'}`,
      // P388: 지휘 세션이 넘긴 위치와 워커가 새로 찾은 위치
      `돌려준 위치 ${u.places.pointers}곳: 지시의 힌트에 있던 것 ${u.places.hint} · 지시의 다른 곳 ${u.places.task} · 새로 찾은 것 ${u.places.fresh}${u.places.none ? ` · 가르지 않음(지금 일 없음·옛 기록) ${u.places.none}` : ''}`,
      '세션별:', ...u.bySession.map((x) => `  ${x.key}  ${x.calls}번  ${x.chars.toLocaleString('en-US')}자${x.hint + x.task + x.fresh ? `  힌트 ${x.hint} · 지시 ${x.task} · 새로 ${x.fresh}` : ''}`),
      '날짜별:', ...u.byDay.map((x) => `  ${x.key}  ${x.calls}번  ${x.chars.toLocaleString('en-US')}자`)];
    const out = body.json ? JSON.stringify(u) + '\n' : lines.join('\n') + '\n';
    return { out, total: out.length, usage: u };
  }
}
// '2026-11-20' | ISO | '7d' | '12h' → 밀리초
export function sinceOf(s) {
  const v = String(s || '').trim();
  const m = /^(\d+)([dh])$/i.exec(v);
  if (m) return Date.now() - Number(m[1]) * (m[2].toLowerCase() === 'd' ? 86400000 : 3600000);
  const t = parseWhen(v);
  if (t == null) throw kerr('bad_request', `--since에는 날짜(2026-11-20)나 7d·12h를 준다: ${v}`);
  return t;
}

// 판 API(사람·창): know.query·know.open·know.unit·know.build·know.usage
export function knowHandlers(b) {
  const ws = async (p) => { const w = await b.resolveWorkspace(p && p.workspace); const row = w && b.store.getWorkspace(w.key); if (!row || !row.root) throw kerr('not_found', '워크스페이스를 모른다(workspace를 준다)'); return { key: w.key, root: row.root }; };
  const call = async (action, p = {}) => b.know.handle({ ...p, action }, { workspace: await ws(p) });
  return {
    'know.query': (p) => call('search', p),
    'know.open': (p) => call('open', p),
    'know.unit': (p) => call('unit', p),
    'know.build': (p) => call('build', p),
    'know.usage': (p = {}) => b.know.usageVerb(p),
  };
}
