// P326: Codex 세션의 이번 턴 서브에이전트(multi_agent spawn_agent로 띄운 하위 스레드) 진행(읽기 전용). P322 Claude Code 칩과 같은 꼴로 보인다.
// Codex는 하위 스레드도 $CODEX_HOME/sessions/YYYY/MM/DD/rollout-<시각>-<자식 ID>.jsonl로 남긴다(0.167.2 실측: 파일 이름에 부모 ID가 없다.
// 옛 꼴 rollout-…-<부모 ID>_<자식 ID>.jsonl도 받는다). 첫 줄 session_meta.payload:
//   id(자식), session_id(맨 위 스레드), parent_thread_id, thread_source 'subagent', agent_nickname, agent_path('/root/alpha'),
//   source.subagent.thread_spawn { parent_thread_id, depth, agent_path, agent_nickname, agent_role }, subagent_history_start_ordinal
// - 고르기: source.subagent.thread_spawn이 있고 parent_thread_id나 session_id가 판 세션의 Codex 스레드 ID인 것.
//   guardian(source.subagent.other 'guardian', thread_source 'guardian_review', Codex가 명령 승인 검토에 스스로 띄움)은 뺀다(사람이 부른 일이 아니다)
// - 이름: agent_path 끝 마디(부모가 정한 일 이름) + (agent_nickname). 첫 사용자 글은 암호화되어 있어 읽지 못한다. 중첩(depth > 1)은 앞에 ↳
// - 시작: session_meta timestamp. 끝: 자기 몫(subagent_history_start_ordinal 이후)의 마지막 task_started·task_complete·turn_aborted 가운데
//   task_complete면 끝, turn_aborted면 취소. 표시가 없으면 마지막 줄이 final_answer assistant 메시지이고 QUIET_MS 넘게 그대로일 때 끝(claude와 같은 규칙)
// - 찾기 비용: 오늘·어제(지역 날짜) 폴더만, .zst는 읽지 않는다. 파일 이름의 ID(UUIDv7)가 판 스레드보다 먼저 생긴 것과 오래 그대로인 것은 열지 않는다.
//   파일마다 머리는 한 번만 읽고(우리 것이 아닌 파일도 기억), 끝난 갈래는 다시 읽지 않는다
// 묶음(이번 턴)은 claude-subagents.mjs subagentGroup과 같다
import fs from 'node:fs';
import path from 'node:path';
import { subagentGroup, SUB_QUIET_MS, SUB_STALE_MS, TURN_SLACK_MS } from './claude-subagents.mjs';

const HEAD_BYTES = 256 * 1024;
const TAIL_BYTES = 64 * 1024;
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const NAME_RE = new RegExp(`^rollout-.*?(${UUID})(?:_(${UUID}))?\\.jsonl$`, 'i');
const parse = (line) => { try { return JSON.parse(line); } catch { return null; } };
function readSlice(fsx, file, start, len) {
  let fd = null;
  try { fd = fsx.openSync(file, 'r'); const b = Buffer.alloc(len); const n = fsx.readSync(fd, b, 0, len, start); return b.subarray(0, n).toString('utf8'); } catch { return ''; } finally { if (fd != null) try { fsx.closeSync(fd); } catch {} }
}
// UUIDv7 ID → 만든 때(ms) | null(v7이 아니면)
export function uuidTime(id) {
  const m = /^([0-9a-f]{8})-([0-9a-f]{4})-7/i.exec(String(id || ''));
  return m ? parseInt(m[1] + m[2], 16) : null;
}
// 오늘·어제(지역 날짜) sessions 폴더
export function codexDayDirs(home, now = Date.now()) {
  return [0, 1].map((d) => { const t = new Date(now - d * 86400000); return path.join(home, 'sessions', String(t.getFullYear()), String(t.getMonth() + 1).padStart(2, '0'), String(t.getDate()).padStart(2, '0')); });
}

// 첫 줄(session_meta) → 하위 스레드 정보 | null(하위가 아니거나 guardian)
export function codexSubMeta(text) {
  const nl = text.indexOf('\n');
  const o = parse(nl >= 0 ? text.slice(0, nl) : text);
  if (!o || o.type !== 'session_meta' || !o.payload) return null;
  const p = o.payload;
  const sub = p.source && typeof p.source === 'object' ? p.source.subagent : null;
  const spawn = sub && typeof sub === 'object' ? sub.thread_spawn : null;
  if (!spawn || typeof spawn !== 'object' || p.thread_source === 'guardian_review' || sub.other === 'guardian') return null;
  const at = Date.parse(p.timestamp || o.timestamp || '');
  const lc = (x) => (typeof x === 'string' && x ? x.toLowerCase() : null);
  const agentPath = spawn.agent_path || p.agent_path || '';
  return {
    id: lc(p.id), root: lc(p.session_id), parent: lc(spawn.parent_thread_id || p.parent_thread_id),
    depth: Number(spawn.depth) || 1, nickname: spawn.agent_nickname || p.agent_nickname || null,
    task: String(agentPath).split('/').filter(Boolean).slice(1).pop() || null, // '/root/alpha' → alpha
    startedAt: Number.isFinite(at) ? at : null, fromOrdinal: Number.isFinite(p.subagent_history_start_ordinal) ? p.subagent_history_start_ordinal : 0,
  };
}
// 끝 조각 → { state: 'done'|'cancelled'|null, answered(마지막 줄이 final_answer), lastAt }. fromOrdinal 앞(부모에게서 물려받은 기록)은 보지 않는다
export function codexSubTail(text, fromOrdinal = 0) {
  const lines = text.split('\n').filter((l) => l.trim());
  let lastAt = null, state = null, answered = null;
  for (let i = lines.length - 1; i >= 0; i--) {
    const o = parse(lines[i]);
    if (!o) continue; // 잘린 첫 줄
    if (Number.isFinite(o.ordinal) && o.ordinal < fromOrdinal) break;
    if (lastAt == null) { const t = Date.parse(o.timestamp || ''); if (Number.isFinite(t)) lastAt = t; }
    const p = o.payload || {};
    if (answered == null && o.type === 'response_item') answered = p.type === 'message' && p.role === 'assistant' && p.phase === 'final_answer';
    if (o.type === 'event_msg' && (p.type === 'task_complete' || p.type === 'turn_aborted' || p.type === 'task_started')) {
      state = p.type === 'task_complete' ? 'done' : p.type === 'turn_aborted' ? 'cancelled' : null;
      break;
    }
  }
  return { state, answered: !!answered, lastAt };
}

// 판 세션의 Codex 스레드 → 진행 | null. o: { threadId, home, turnStartedAt, now, cache(Map), fsx }
export function codexSubagentProgress({ threadId, home, turnStartedAt = 0, now = Date.now(), cache = new Map(), fsx = fs, quietMs = SUB_QUIET_MS, staleMs = SUB_STALE_MS } = {}) {
  if (!threadId || !home) return null;
  const me = String(threadId).toLowerCase();
  const born = uuidTime(me);
  const from = (turnStartedAt || 0) - TURN_SLACK_MS;
  const all = [];
  for (const dir of codexDayDirs(home, now)) {
    let names; try { names = fsx.readdirSync(dir); } catch { continue; }
    for (const f of names) {
      const m = NAME_RE.exec(f);
      if (!m) continue; // .zst(지난 기록)와 다른 파일
      const [a, b] = [m[1].toLowerCase(), m[2] ? m[2].toLowerCase() : null];
      if (b && a !== me) continue; // 옛 꼴 <부모>_<자식>: 다른 부모
      const child = b || a;
      if (child === me) continue;
      const ct = uuidTime(child);
      if (born != null && ct != null && ct < born) continue; // 판 스레드보다 먼저 생긴 스레드
      const file = path.join(dir, f);
      let c = cache.get(file);
      if (c === false) continue; // 우리 하위가 아닌 파일(머리를 읽어 둠)
      let st; try { st = fsx.statSync(file); } catch { continue; }
      if (!c && st.mtimeMs < from && now - st.mtimeMs > staleMs) continue; // 지난 턴에 끝났거나 오래 멈춘 스레드(열지 않는다)
      if (!c) {
        const h = codexSubMeta(readSlice(fsx, file, 0, Math.min(HEAD_BYTES, st.size)));
        if (!h && st.size < 64) continue; // 아직 쓰는 중인 머리: 다음에 다시 본다
        if (!h || (h.parent !== me && h.root !== me)) { cache.set(file, false); continue; }
        c = { id: h.id || child, startedAt: h.startedAt || Math.round(st.birthtimeMs || st.mtimeMs), name: [h.task, h.nickname].filter(Boolean).length === 2 ? `${h.task} (${h.nickname})` : h.task || h.nickname || child, depth: h.depth, fromOrdinal: h.fromOrdinal, state: 'running', endedAt: null };
        cache.set(file, c);
      }
      if (c.state === 'running') {
        const mt = Math.round(st.mtimeMs);
        const t = codexSubTail(readSlice(fsx, file, Math.max(0, st.size - TAIL_BYTES), Math.min(TAIL_BYTES, st.size)), c.fromOrdinal);
        if (t.state) { c.state = t.state; c.endedAt = t.lastAt || mt; }
        else if (t.answered && now - mt > quietMs) { c.state = 'done'; c.endedAt = t.lastAt || mt; }
      }
      all.push(c);
    }
  }
  if (cache.size > 2000) for (const k of [...cache.keys()].slice(0, 1000)) cache.delete(k);
  return subagentGroup(all, { from, now });
}
