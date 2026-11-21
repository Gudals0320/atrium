// P298: Hermes(+OMH) 하네스의 상태 파일 읽기. Hermes는 세션·모델 호출·도구·하위 에이전트를 프로필의 공용 gateway 데몬에서 돌리고
//   그 기록을 Hermes 홈의 state.db(SQLite, WAL)에 둔다(P297 조사). 판은 이 파일을 읽기 전용(node:sqlite readOnly)으로만 연다.
//   - 세션 ID: 판이 정할 수 없어(--session-id 없음) 띄운 뒤 sessions에서 찾는다(맨 위 세션, tui·cli, 그 폴더, 띄운 뒤)
//   - 마지막 답: messages의 마지막 assistant 글(도구 호출만 있는 줄은 건너뛴다)
//   - 모델·토큰: sessions의 model, input/output/cache_read/reasoning_tokens, api_call_count
//   - 바쁨: async_delegations에서 이 세션이 띄운 하위 에이전트가 끝나지 않았거나 결과를 아직 넘기지 않았다, 또는 턴 임대(session_turn_leases)가 살아 있다
// 스키마가 다르거나(Hermes 업데이트) 파일이 없으면 조용히 null을 돌려준다(판은 화면으로 물러선다). 사용자 Hermes 설정 파일(config.yaml, auth.json, .env)은 읽지 않는다
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
