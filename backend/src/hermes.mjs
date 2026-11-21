// P298: Hermes(+OMH) 하네스의 상태 파일 읽기. Hermes는 세션·모델 호출·도구·하위 에이전트를 프로필의 공용 gateway 데몬에서 돌리고
//   그 기록을 Hermes 홈의 state.db(SQLite, WAL)에 둔다(P297 조사). 판은 이 파일을 읽기 전용(node:sqlite readOnly)으로만 연다.
//   - 세션 ID: 판이 정할 수 없어(--session-id 없음) 띄운 뒤 sessions에서 찾는다(맨 위 세션, tui·cli, 그 폴더, 띄운 뒤)
//   - 마지막 답: messages의 마지막 assistant 글(도구 호출만 있는 줄은 건너뛴다)
//   - 모델·토큰: sessions의 model, input/output/cache_read/reasoning_tokens, api_call_count
//   - 바쁨: async_delegations에서 이 세션이 띄운 하위 에이전트가 끝나지 않았거나 결과를 아직 넘기지 않았다, 또는 턴 임대(session_turn_leases)가 살아 있다
// 스키마가 다르거나(Hermes 업데이트) 파일이 없으면 조용히 null을 돌려준다(판은 화면으로 물러선다). 사용자 Hermes 설정 파일(config.yaml, auth.json, .env)은 읽지 않는다
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let DatabaseSync = null;
try { ({ DatabaseSync } = await import('node:sqlite')); } catch { DatabaseSync = null; }

// Hermes 홈: ATRIUM_HERMES_HOME(시험) → HERMES_HOME → Windows %LOCALAPPDATA%\hermes → ~/.hermes. 프로필(-p 이름)이면 <홈>/profiles/<이름>
export function hermesHomeOf(env = process.env, { profile = null } = {}) {
  const root = env.ATRIUM_HERMES_HOME ? path.resolve(env.ATRIUM_HERMES_HOME)
    : env.HERMES_HOME ? path.resolve(env.HERMES_HOME)
    : process.platform === 'win32' && env.LOCALAPPDATA ? path.join(env.LOCALAPPDATA, 'hermes')
    : path.join(os.homedir(), '.hermes');
  return profile && profile !== 'default' ? path.join(root, 'profiles', String(profile)) : root;
}
export const hermesDbOf = (home) => path.join(home, 'state.db');

// state.db를 읽기 전용으로 열어 fn(db)을 돌린다. 열지 못하거나 fn이 실패하면(스키마가 다름 등) null
export function withHermesDb(home, fn) {
  if (!DatabaseSync || !home) return null;
  const file = hermesDbOf(home);
  if (!fs.existsSync(file)) return null;
  let db = null;
  try {
    db = new DatabaseSync(file, { readOnly: true });
    try { db.exec('PRAGMA busy_timeout = 500'); } catch {}
    return fn(db);
  } catch { return null; }
  finally { try { if (db) db.close(); } catch {} }
}

const normDir = (p) => path.resolve(String(p || '')).toLowerCase().replace(/[\\/]+$/, '');
const sec = (ms) => Number(ms || 0) / 1000;

// 세션 ID: 그 폴더(cwd)에서 since(ms) 뒤에 생긴 맨 위 tui·cli 세션 가운데 가장 이른 것. exclude: 판의 다른 Hermes 세션이 가진 ID
export function hermesSessionOf({ cwd, since = 0, exclude = [], home = hermesHomeOf(), slackMs = 10000 } = {}) {
  const want = normDir(cwd);
  const ex = new Set((exclude || []).filter(Boolean).map((x) => String(x)));
  return withHermesDb(home, (db) => {
    const rows = db.prepare("SELECT id, cwd, started_at FROM sessions WHERE parent_session_id IS NULL AND (created_source IN ('tui', 'cli') OR source IN ('tui', 'cli')) AND started_at >= ? ORDER BY started_at ASC LIMIT 200").all(sec(since - slackMs));
    const hit = rows.find((r) => r.cwd && normDir(r.cwd) === want && !ex.has(String(r.id)));
    return hit ? String(hit.id) : null;
  });
}

// 글 꼴: 보통 문자열. 조각 배열(JSON [{ type: 'text', text }])이면 글 조각만 잇는다
export function messageText(content) {
  const s = content == null ? '' : String(content);
  const t = s.trim();
  if (t.startsWith('[') && t.endsWith(']')) {
    try { const a = JSON.parse(t); if (Array.isArray(a)) return a.map((x) => (typeof x === 'string' ? x : x && typeof x.text === 'string' ? x.text : '')).join('').trim(); } catch {}
  }
  return t;
}
// 마지막 답 → { text, at(ms), id } | null. 비어 있지 않은 마지막 assistant 글(도구 호출만 있는 줄은 글이 비어 건너뛴다)
export function hermesLastAnswer({ id, home = hermesHomeOf() } = {}) {
  if (!id) return null;
  return withHermesDb(home, (db) => {
    const rows = db.prepare("SELECT id, content, timestamp FROM messages WHERE session_id = ? AND role = 'assistant' ORDER BY id DESC LIMIT 20").all(String(id));
    for (const r of rows) { const text = messageText(r.content); if (text) return { text, at: Math.round(Number(r.timestamp || 0) * 1000), id: Number(r.id) }; }
    return null;
  });
}
// 모델·토큰 → { model, input, output, cacheRead, reasoning, apiCalls } | null
export function hermesUsageOf({ id, home = hermesHomeOf() } = {}) {
  if (!id) return null;
  return withHermesDb(home, (db) => {
    const r = db.prepare('SELECT model, input_tokens, output_tokens, cache_read_tokens, reasoning_tokens, api_call_count FROM sessions WHERE id = ?').get(String(id));
    return r ? { model: r.model || null, input: r.input_tokens || 0, output: r.output_tokens || 0, cacheRead: r.cache_read_tokens || 0, reasoning: r.reasoning_tokens || 0, apiCalls: r.api_call_count || 0 } : null;
  });
}

// 하위 에이전트(async_delegations)의 끝난 상태와 결과를 넘긴 상태. 그 밖(pending, running, dispatched …)은 도는 중
export const DELEGATION_DONE = new Set(['completed', 'complete', 'done', 'failed', 'error', 'errored', 'cancelled', 'canceled', 'timeout', 'timed_out', 'interrupted', 'aborted', 'expired', 'orphaned']);
export const DELIVERY_PENDING = new Set(['pending', 'claimed', 'delivering', 'in_flight']);
export const DELEGATION_STALE_MS = 6 * 3600 * 1000; // 이보다 오래된 줄은 버려진 것으로 본다(gateway가 죽어 끝을 적지 못함)
// 바쁨 → { busy, running(도는 하위 수), undelivered(끝났지만 결과를 아직 넘기지 않은 수), lease(턴 임대가 살아 있음) } | null(못 읽음)
export function hermesBusyOf({ id, home = hermesHomeOf(), now = Date.now(), staleMs = DELEGATION_STALE_MS } = {}) {
  if (!id) return null;
  return withHermesDb(home, (db) => {
    const sid = String(id);
    const rows = db.prepare('SELECT state, delivery_state, dispatched_at FROM async_delegations WHERE (parent_session_id = ? OR origin_session = ?) AND dispatched_at >= ?').all(sid, sid, sec(now - staleMs));
    let running = 0, undelivered = 0;
    for (const r of rows) {
      const st = String(r.state || '').toLowerCase();
      if (!DELEGATION_DONE.has(st)) running++;
      else if (DELIVERY_PENDING.has(String(r.delivery_state || '').toLowerCase())) undelivered++;
    }
    let lease = false;
    try { lease = !!db.prepare('SELECT 1 AS x FROM session_turn_leases WHERE conversation_id = ? AND expires_at > ?').get(sid, sec(now)); } catch {}
    return { busy: running > 0 || undelivered > 0 || lease, running, undelivered, lease };
  });
}

// ---------- P300: 안 진행(읽기 전용) ----------
// 자체 오케스트레이션 세션의 안에서 도는 일을 판 카드에 작은 칩으로 보이려고 읽는다. 두 원천:
//   (1) OMH dag-ulw 실행 기록: <OMH 홈>/runtime/dag/<세션 열쇠>/<run>.json(omh_dag/v1, OMH의 omh_dag 도구만 쓴다).
//       갈래(node)의 상태는 기록에 저장되지 않고 읽을 때마다 기록의 시도(attempts)와 위임 원장
//       <OMH 홈>/runtime/delegation/<세션 열쇠>.json(delegation_ledger/v1, 하위 시작·끝 hook이 적음)의 children으로 센다(OMH dag_run.derive와 같은 규칙을 줄였다)
//   (2) Hermes 자체 위임(OMH DAG가 아닐 때): state.db async_delegations의 task_json(goal·goals)·result_json(results[].status)
// 진행 꼴: { kind: 'dag' | 'delegations', key, label, done, total, running, failed, finished, items: [{ name, state, startedAt, endedAt }], updatedAt }
//   state: pending | running | done | failed | cancelled. 시각은 ms. 못 읽으면 null(조용히)
export const PROGRESS_RECENT_MS = 6 * 3600 * 1000; // 이보다 오래 손대지 않은 실행·위임은 보이지 않는다
export const PROGRESS_ITEMS_MAX = 48; // OMH MAX_NODES와 같다
const NAME_MAX = 80;
const ms = (s) => (Number.isFinite(Number(s)) && Number(s) > 0 ? Math.round(Number(s) * 1000) : null);
const oneLine = (s) => { const t = String(s || '').split(/\r?\n/).map((x) => x.trim()).find(Boolean) || ''; return t.length > NAME_MAX ? t.slice(0, NAME_MAX - 1) + '…' : t; };

// OMH 홈: ATRIUM_OMH_HOME(시험) → OMH_HOME → ~/.omh(OMH runtime_paths의 standalone 기본). 프로필 설정(settings.omh_home)은 config.yaml이라 읽지 않는다
export function omhHomeOf(env = process.env, { home = os.homedir() } = {}) {
  if (env.ATRIUM_OMH_HOME) return path.resolve(env.ATRIUM_OMH_HOME);
  if (env.OMH_HOME) return path.resolve(String(env.OMH_HOME).replace(/^~(?=$|[\\/])/, home));
  return path.join(home, '.omh');
}
// OMH delegation_ledger.ledger_key와 같다: 읽기 쉬운 앞부분(48자) + 정확한 ID의 sha256 앞 16자
export function omhLedgerKey(sessionId) {
  const ref = String(sessionId || '').slice(0, 160);
  const slug = ref.replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^[_-]+|[_-]+$/g, '').slice(0, 48);
  const digest = crypto.createHash('sha256').update(ref, 'utf8').digest('hex').slice(0, 16);
  return slug ? `${slug}-${digest}` : digest;
}
const readJson = (file, max = 2 * 1024 * 1024) => { try { const st = fs.lstatSync(file); if (!st.isFile() || st.size > max) return null; return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } };

// 진행 꼴 맞추기(읽개마다 다른 원천을 판 안 공통 꼴로). 모르는 상태는 pending
export const PROGRESS_STATES = ['pending', 'running', 'done', 'failed', 'cancelled'];
export function shapeProgress({ kind, key, label = null, items = [], finished = null, updatedAt = null } = {}) {
  const list = (items || []).slice(0, PROGRESS_ITEMS_MAX).map((x) => ({ name: oneLine(x.name) || '?', state: PROGRESS_STATES.includes(x.state) ? x.state : 'pending', startedAt: x.startedAt || null, endedAt: x.endedAt || null }));
  if (!list.length) return null;
  const n = (st) => list.filter((x) => x.state === st).length;
  const done = n('done'), running = n('running'), failed = n('failed');
  const open = list.some((x) => x.state === 'pending' || x.state === 'running');
  return { kind, key: String(key || ''), label: label ? oneLine(label) : null, done, total: list.length, running, failed, finished: finished == null ? !open : !!finished, items: list, updatedAt: updatedAt || null };
}

// (1) OMH dag-ulw 실행 하나 → 진행. children: 위임 원장의 children
export const DAG_DONE = new Set(['accepted', 'carried']);
export const DAG_FAILED = new Set(['failed', 'blocked']);
export function omhDagProgress(record, children = [], { now = Date.now() } = {}) {
  if (!record || typeof record !== 'object' || record.schema_version !== 'omh_dag/v1' || !Array.isArray(record.nodes)) return null;
  const run = String(record.run || '');
  const bound = new Map();
  for (const c of children || []) {
    const d = c && c.dag;
    if (d && String(d.run) === run && typeof d.node === 'string') { if (!bound.has(d.node)) bound.set(d.node, []); bound.get(d.node).push(c); }
  }
  for (const l of bound.values()) l.sort((a, b) => (Number(a.started_at) || 0) - (Number(b.started_at) || 0));
  const cancelled = record.cancelled_at != null;
  const base = new Map();
  for (const node of record.nodes) {
    const id = String(node.id);
    const att = Array.isArray(node.attempts) ? node.attempts : [];
    const last = att.length ? att[att.length - 1] : null;
    let state = 'pending', startedAt = null, endedAt = null;
    const childOf = (a) => { const out = Number(a.handed_out_at) || 0; const slack = a.resume_handle ? 0 : 2; const m = (bound.get(id) || []).filter((c) => (Number(c.started_at) || 0) >= out - slack); return m.length ? m[m.length - 1] : null; };
    if (!last || last.outcome === 'retry' || last.outcome === 'escalated') state = 'pending';
    else if (DAG_DONE.has(last.outcome)) { state = 'done'; endedAt = ms(last.settled_at); const c = childOf(last); startedAt = ms(c && c.started_at) || ms(last.handed_out_at); }
    else if (DAG_FAILED.has(last.outcome)) { state = 'failed'; endedAt = ms(last.settled_at); const c = childOf(last); startedAt = ms(c && c.started_at) || ms(last.handed_out_at); }
    else if (last.outcome === 'parked') { state = 'pending'; startedAt = ms(last.handed_out_at); }
    else {
      // 나가 있다(handed out): 묶인 하위가 돌거나, 돌아와 부모의 settle을 기다리거나, 아직 하위가 뜨지 않았다. 모두 도는 중으로 센다. lost면 다시 나눠 줄 차례
      const c = childOf(last);
      if (c && c.lost) state = 'pending';
      else { state = 'running'; startedAt = ms(c && c.started_at) || ms(last.handed_out_at); }
    }
    base.set(id, { node, state, startedAt, endedAt });
  }
  // 고침 묶음(repairs): 뿌리의 마지막 묶음이 모두 받아들여졌으면 뿌리는 고쳐진 것(done), 예전 묶음의 받지 못한 갈래는 밀려남(뺀다)
  const superseded = new Set();
  for (const [root, groups] of Object.entries(record.repairs || {})) {
    if (!base.has(root) || !Array.isArray(groups) || !groups.length) continue;
    const latest = groups[groups.length - 1] || [];
    const r = base.get(root);
    if (r.state === 'failed' && latest.length && latest.every((m) => base.get(String(m)) && base.get(String(m)).state === 'done')) {
      const verify = /verif/i.test(String(r.node.role || '')) || latest.some((m) => base.get(String(m)) && base.get(String(m)).node.reruns_root);
      if (!verify) r.state = 'done'; else { r.state = 'pending'; r.endedAt = null; }
    }
    for (const older of groups.slice(0, -1)) for (const m of older || []) { const x = base.get(String(m)); if (x && x.state !== 'done') superseded.add(String(m)); }
  }
  const items = [];
  for (const [id, x] of base) {
    if (superseded.has(id)) continue;
    const state = cancelled && (x.state === 'pending' || x.state === 'running') ? 'cancelled' : x.state;
    items.push({ name: x.node.label || id, state, startedAt: x.startedAt, endedAt: x.endedAt });
  }
  const p = shapeProgress({ kind: 'dag', key: `dag:${run}`, label: record.name || run, items, updatedAt: ms(record.updated_at) });
  if (p && cancelled) p.finished = true;
  return p;
}
// 그 세션의 OMH dag-ulw 실행들 → [{ record, at }](최근 것 먼저)
export function omhDagRuns({ id, omhHome = omhHomeOf(), now = Date.now(), recentMs = PROGRESS_RECENT_MS } = {}) {
  if (!id || !omhHome) return [];
  const dir = path.join(omhHome, 'runtime', 'dag', omhLedgerKey(id));
  let names = [];
  try { names = fs.readdirSync(dir).filter((n) => n.endsWith('.json') && !n.startsWith('.')); } catch { return []; }
  const out = [];
  for (const n of names.slice(0, 64)) {
    const r = readJson(path.join(dir, n));
    if (!r || r.schema_version !== 'omh_dag/v1' || String(r.session_id || '') !== String(id)) continue;
    const at = ms(r.updated_at) || ms(r.defined_at) || 0;
    if (now - at > recentMs) continue;
    out.push({ record: r, at });
  }
  return out.sort((a, b) => b.at - a.at);
}
export function omhLedgerChildren({ id, omhHome = omhHomeOf() } = {}) {
  const r = id && omhHome ? readJson(path.join(omhHome, 'runtime', 'delegation', `${omhLedgerKey(id)}.json`)) : null;
  return r && r.schema_version === 'delegation_ledger/v1' && String(r.session_id || '') === String(id) && Array.isArray(r.children) ? r.children : [];
}

// (2) Hermes 자체 위임 → 진행. 묶음: 아직 끝나지 않은(또는 결과를 넘기지 않은) 위임이 있으면 그중 가장 이른 것부터, 없으면 가장 늦은 위임과 같은 무렵(clusterMs) 것
const DELEG_FAILED = new Set(['failed', 'error', 'errored', 'timeout', 'timed_out', 'interrupted', 'aborted', 'expired', 'orphaned', 'stalled', 'unknown']);
const DELEG_CANCELLED = new Set(['cancelled', 'canceled']);
const stateOfWord = (w) => { const s = String(w || '').toLowerCase(); return s === 'completed' || s === 'complete' || s === 'done' || s === 'success' || s === 'ok' ? 'done' : DELEG_FAILED.has(s) ? 'failed' : DELEG_CANCELLED.has(s) ? 'cancelled' : 'running'; };
const parse = (s) => { if (!s) return null; try { const v = JSON.parse(String(s)); return v && typeof v === 'object' ? v : null; } catch { return null; } };
export function delegationItems(row) {
  const task = parse(row.task_json) || {}, result = parse(row.result_json) || {};
  const goals = Array.isArray(task.goals) && task.goals.length ? task.goals : [task.goal || ''];
  const idx = Array.isArray(task.task_indexes) && task.task_indexes.length ? task.task_indexes : goals.map((_, i) => i);
  const results = Array.isArray(result.results) ? result.results : task.is_batch ? [] : (result.status ? [result] : []);
  const rowState = stateOfWord(row.state);
  const done = DELEGATION_DONE.has(String(row.state || '').toLowerCase());
  return idx.map((i, k) => {
    const res = results.find((x) => x && x.task_index === i) || (results.length === idx.length ? results[k] : null);
    const state = res && res.status ? stateOfWord(res.status) : done ? (rowState === 'running' ? 'done' : rowState) : 'running';
    const goal = goals[i] != null ? goals[i] : goals[0];
    return { name: String(goal || '').replace(/\[(?:dag:[^\]]+|omh-team:[^\]]+)\]/g, '').replace(/^\s*(?:TASK|Task)\s*:\s*/, ''), state, startedAt: ms(row.dispatched_at), endedAt: state === 'running' ? null : ms(row.completed_at) };
  });
}
export function hermesDelegationProgress({ id, home = hermesHomeOf(), now = Date.now(), recentMs = PROGRESS_RECENT_MS, clusterMs = 10 * 60 * 1000 } = {}) {
  if (!id) return null;
  return withHermesDb(home, (db) => {
    const sid = String(id);
    const rows = db.prepare('SELECT delegation_id, state, delivery_state, dispatched_at, completed_at, updated_at, task_json, result_json FROM async_delegations WHERE parent_session_id = ? AND dispatched_at >= ? ORDER BY dispatched_at ASC LIMIT 200').all(sid, (now - recentMs) / 1000);
    if (!rows.length) return null;
    const open = rows.filter((r) => !DELEGATION_DONE.has(String(r.state || '').toLowerCase()) || DELIVERY_PENDING.has(String(r.delivery_state || '').toLowerCase()));
    const from = open.length ? Number(open[0].dispatched_at) : Number(rows[rows.length - 1].dispatched_at) - clusterMs / 1000;
    const pick = rows.filter((r) => Number(r.dispatched_at) >= from);
    const items = pick.flatMap(delegationItems);
    const p = shapeProgress({ kind: 'delegations', key: `deleg:${pick[0].delegation_id}`, items, updatedAt: Math.max(...pick.map((r) => ms(r.updated_at) || 0)) || null });
    if (p && open.length) p.finished = false; // 결과를 아직 넘기지 않았으면 끝나지 않은 것(곧 부모 턴이 들어온다)
    return p;
  });
}

// 그 세션의 안 진행. 끝나지 않은 OMH 실행 → 끝나지 않은 위임 → 둘 가운데 최근 것
export function hermesProgressOf({ id, home = hermesHomeOf(), omhHome = omhHomeOf(), now = Date.now() } = {}) {
  if (!id) return null;
  let dag = null;
  try {
    const runs = omhDagRuns({ id, omhHome, now });
    if (runs.length) { const kids = omhLedgerChildren({ id, omhHome }); const all = runs.map((r) => ({ p: omhDagProgress(r.record, kids, { now }), at: r.at })).filter((x) => x.p); dag = all.find((x) => !x.p.finished) || all[0] || null; }
  } catch { dag = null; }
  if (dag && !dag.p.finished) return dag.p;
  const del = hermesDelegationProgress({ id, home, now });
  if (del && !del.finished) {
    // OMH 실행의 갈래도 Hermes 위임으로 돈다: 끝난 실행보다 그 뒤에 나간 위임만 따로 보인다
    return del;
  }
  if (dag && del) return (del.updatedAt || 0) > (dag.at || 0) + 1000 ? del : dag.p;
  return (dag && dag.p) || del || null;
}
