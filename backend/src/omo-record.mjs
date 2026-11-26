// P381: omo(OmO) 세션 기록(JSONL) 읽기. 판은 omo 상태를 터미널(OSC 7501)로 보고, 이 기록으로 그 위를 채운다:
//   열린 질문(ask_user_question: 본문·선택지·추천·마감, 답하면 닫힘), 할 일 단계(senpi.todo-state), goal(create_goal·update_goal),
//   생명 주기(session-lifecycle: running·waiting_human·waiting_children·done, 하위 작업 수).
// 기록 파일은 ~/.omo/agent/sessions/<폴더>/<시각>_<세션 ID>.jsonl(pi와 같은 꼴, model-now findPiSession)이고 마지막 답·모델도 같은 파일에서 읽는다.
// 읽기 상태(st)를 세션마다 두고 덧붙은 줄만 접는다(refreshModel과 같은 방식). 기록 꼴은 omo 버전마다 바뀔 수 있어,
// 머리 줄(type session)이 없거나 줄 대부분이 JSON이 아니면 ok=false로 두고 판은 지금처럼 화면으로 물러난다.
// 이 모듈은 파일을 읽기만 한다(omo 기록을 고치지 않는다).
import fs from 'node:fs';

const QUESTION_TOOLS = new Set(['ask_user_question']);
const GOAL_TOOLS = new Set(['create_goal', 'update_goal']);
const CHUNK = 4 * 1024 * 1024;
const MAX_LINE_CHECK = 50; // 꼴 판정에 쓰는 첫 줄 수
// 선택지 꼬리표의 추천 표시: "(추천)", "(권장)", "(Recommended)"
export const RECOMMENDED_RE = /[(（[]\s*(추천|권장|recommended)\s*[)）\]]/i;

const USERS_KEEP = 20;
const USER_TEXT_MAX = 4000;
const textOf = (c) => (typeof c === 'string' ? c : Array.isArray(c) ? c.filter((x) => x && x.type === 'text' && typeof x.text === 'string').map((x) => x.text).join('\n') : '').trim();
const clip = (s, n) => { const t = String(s ?? ''); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
const tsOf = (o) => { const t = Date.parse(o && o.timestamp); return Number.isFinite(t) ? t : null; };

export function newOmoRecord(file = null) {
  return { file, pos: 0, size: 0, ok: null, header: false, sessionId: null, lines: 0, bad: 0, calls: {}, asks: {}, resolved: null, lifecycle: null, todo: null, goal: null, children: null, at: null, users: [], failure: null, okAt: null }; // P383: users(최근 user 메시지), failure(실패한 턴), okAt(마지막 성공 답)
}

// 질문 도구 인자 → 보일 질문들. 선택지는 꼬리표 글(창이 이미 그렇게 그린다), 설명은 notes, 추천은 꼬리표에 추천 표시가 든 첫 선택지
export function questionsOf(args) {
  const qs = Array.isArray(args && args.questions) ? args.questions : [];
  return qs.slice(0, 8).map((q) => {
    const opts = Array.isArray(q && q.options) ? q.options.slice(0, 12) : [];
    const labels = opts.map((o) => clip(typeof o === 'string' ? o : (o && o.label) || '', 200));
    const notes = opts.map((o) => (o && typeof o === 'object' && o.description ? clip(o.description, 300) : null));
    return { question: clip((q && q.question) || '', 2000), header: (q && q.header) || null, multiSelect: !!(q && q.multiSelect), options: labels, notes, recommended: labels.find((l) => RECOMMENDED_RE.test(l)) || null };
  });
}

// 마감(ms 시각). 이 omo 판(5.1.8x)의 기록에는 없다(TUI의 남은 시간만). 인자나 생명 주기에 생기면 읽는다
export function deadlineOf(args = {}, human = null, at = null) {
  const abs = (v) => { if (v == null) return null; if (typeof v === 'number') return v > 1e12 ? v : v > 1e9 ? v * 1000 : null; const t = Date.parse(v); return Number.isFinite(t) ? t : null; };
  for (const src of [human, args]) {
    if (!src || typeof src !== 'object') continue;
    for (const k of ['deadline', 'deadlineAt', 'expiresAt', 'dueAt']) { const t = abs(src[k]); if (t) return t; }
    if (at != null) {
      if (Number.isFinite(Number(src.timeoutMs)) && Number(src.timeoutMs) > 0) return at + Number(src.timeoutMs);
      if (Number.isFinite(Number(src.timeoutSeconds)) && Number(src.timeoutSeconds) > 0) return at + Number(src.timeoutSeconds) * 1000;
    }
  }
  return null;
}

// 한 줄 접기
export function foldOmoLine(st, o) {
  if (!o || typeof o !== 'object') return;
  const at = tsOf(o);
  if (at) st.at = at;
  if (o.type === 'session') { st.header = true; if (o.id) st.sessionId = String(o.id); return; }
  if (o.type === 'message' && o.message && typeof o.message === 'object') {
    const m = o.message;
    const mat = (typeof m.timestamp === 'number' ? m.timestamp : null) || at;
    // P383: user 메시지(사람·판이 넣은 글, 스티어링 포함)는 최근 USERS_KEEP개만 남긴다(판의 제출 확인이 본다)
    if (m.role === 'user') { const text = textOf(m.content); if (text) st.users = [...(st.users || []), { text: text.slice(0, USER_TEXT_MAX), at: mat }].slice(-USERS_KEEP); }
    // P383: assistant 끝 까닭. error면 그 턴이 실패했다(errorMessage), stop·length·toolUse면 성공한 답이다
    if (m.role === 'assistant' && m.stopReason) {
      if (m.stopReason === 'error') st.failure = { type: 'error', message: m.errorMessage ? clip(m.errorMessage, 300) : null, at: mat, via: 'message' };
      else if (m.stopReason !== 'aborted' && m.stopReason !== 'pending') st.okAt = mat;
    }
    if (m.role === 'assistant' && Array.isArray(m.content)) {
      for (const c of m.content) {
        if (!c || c.type !== 'toolCall') continue;
        if (QUESTION_TOOLS.has(c.name) && c.id) {
          const args = c.arguments || {};
          st.calls[c.id] = { id: String(c.id), at, questions: questionsOf(args), waitForAnswer: args.waitForAnswer !== false, deadline: deadlineOf(args, null, at) };
        } else if (GOAL_TOOLS.has(c.name)) {
          const args = c.arguments || {};
          if (c.name === 'create_goal') st.goal = { status: 'active', objective: clip(args.objective, 300), at };
          else if (args.status) st.goal = { ...(st.goal || {}), status: String(args.status), at };
        }
      }
    } else if (m.role === 'toolResult' && QUESTION_TOOLS.has(m.toolName) && m.toolCallId) {
      const id = String(m.toolCallId);
      const d = m.details || {};
      delete st.calls[id]; delete st.asks[id];
      st.resolved = { id, status: d.status || (m.isError ? 'error' : 'answered'), by: d.resolvedBy || null, at };
    }
    return;
  }
  if (o.type !== 'custom') return;
  const data = o.data || {};
  if (o.customType === 'ask-user:question' && data.requestId) {
    st.asks[String(data.requestId)] = { id: String(data.requestId), headers: Array.isArray(data.headers) ? data.headers.map((h) => clip(h, 80)) : [], at };
  } else if (o.customType === 'session-lifecycle' && data.state) {
    if (st.sessionId && data.sessionId && String(data.sessionId) !== st.sessionId) return; // 다른 세션(하위)의 생명 주기
    const w = data.waitingOn || {};
    const human = (Array.isArray(w.human) ? w.human : []).filter((h) => h && h.requestId).map((h) => ({ id: String(h.requestId), kind: h.kind || null, since: Date.parse(h.since) || null, raw: h }));
    st.lifecycle = { state: String(data.state), at, human };
    if (data.state === 'failed') st.failure = { type: (data.error && (data.error.code || data.error.type)) || 'failed', message: data.error ? clip(data.error.message || data.error, 300) : (st.failure && st.failure.at >= (at || 0) - 5000 ? st.failure.message : null), at: at || Date.now(), via: 'lifecycle' }; // P383: 제공자 오류로 끝난 생명 주기(P381 실측)
    const sources = Array.isArray(w.childSources) ? w.childSources : [];
    st.children = { count: Number(w.children) || 0, sources: sources.slice(0, 6).map((x) => ({ source: (x && x.source) || null, active: Number(x && x.activeCount) || 0, items: (Array.isArray(x && x.items) ? x.items : []).slice(0, 6).map((i) => clip(i.label || i.description || i.id || '', 120)) })) };
  } else if (o.customType === 'senpi.todo-state' && Array.isArray(data.phases)) {
    st.todo = { at, phases: data.phases.slice(0, 20).map((p) => ({ name: clip(p && p.name, 80), tasks: (Array.isArray(p && p.tasks) ? p.tasks : []).slice(0, 40).map((t) => ({ content: clip(t && t.content, 200), status: (t && t.status) || null })) })) };
  }
}

function readRange(file, from, to) {
  const fd = fs.openSync(file, 'r');
  try { const buf = Buffer.alloc(to - from); fs.readSync(fd, buf, 0, buf.length, from); return buf; } finally { fs.closeSync(fd); }
}

// 꼴 판정: 머리 줄이 있고 줄 대부분이 JSON이다. 아직 줄이 없으면 null(모른다)
function judge(st) {
  if (!st.lines) return null;
  if (!st.header) return false;
  return st.bad * 2 <= st.lines;
}

// 기록 파일 → 새 읽기 상태(st가 같은 파일이면 덧붙은 줄만 접는다). 파일이 없으면 st 그대로(같은 파일일 때)나 null
export function readOmoRecord(file, st = null) {
  let stat; try { stat = fs.statSync(file); } catch { return st && st.file === file ? st : null; }
  let cur = st && st.file === file && stat.size >= st.pos ? { ...st, calls: { ...st.calls }, asks: { ...st.asks }, users: [...(st.users || [])] } : newOmoRecord(file);
  if (stat.size === cur.size && cur.pos === cur.size) return cur;
  let pos = cur.pos;
  while (pos < stat.size) {
    const end = Math.min(stat.size, pos + CHUNK);
    const buf = readRange(file, pos, end);
    let nl = buf.lastIndexOf(10);
    if (nl < 0) { if (end < stat.size) { pos = end; continue; } break; } // 아주 긴 줄(덩어리보다 긴): 건너뛴다
    for (const line of buf.subarray(0, nl).toString('utf8').split('\n')) {
      const l = line.trim();
      if (!l) continue;
      cur.lines++;
      let o; try { o = JSON.parse(l); } catch { if (cur.lines <= MAX_LINE_CHECK || !cur.header) cur.bad++; continue; }
      foldOmoLine(cur, o);
    }
    pos += nl + 1;
  }
  cur.pos = pos; cur.size = stat.size;
  cur.ok = judge(cur);
  return cur;
}

// 열린 질문 ID들(새것 끝). 질문 도구를 불렀고 결과가 아직 없다. 생명 주기가 그 질문 뒤에 적혔으면 그 목록(waitingOn.human)에 있는 것만 연다
export function openQuestionIds(st) {
  if (!st) return [];
  const ids = [...new Set([...Object.keys(st.calls), ...Object.keys(st.asks)])];
  const lc = st.lifecycle;
  const atOf = (id) => Math.max((st.calls[id] && st.calls[id].at) || 0, (st.asks[id] && st.asks[id].at) || 0);
  const open = ids.filter((id) => {
    if (!lc || lc.at == null) return true;
    if (lc.at < atOf(id)) return true; // 생명 주기가 아직 이 질문을 모른다
    return lc.human.some((h) => h.id === id);
  });
  return open.sort((a, b) => atOf(a) - atOf(b));
}

// 판의 응답 필요 ask(state.mjs deriveState가 쓴다) | null. waitingHuman: 생명 주기가 사람을 기다린다(턴이 쉬어도 응답 필요로 볼 근거)
export function omoAskOf(st) {
  if (!st || st.ok === false) return null;
  const ids = openQuestionIds(st);
  if (!ids.length) return null;
  const id = ids[ids.length - 1];
  const call = st.calls[id] || null, ask = st.asks[id] || null;
  const human = st.lifecycle ? st.lifecycle.human.find((h) => h.id === id) : null;
  const since = (human && human.since) || (ask && ask.at) || (call && call.at) || null;
  const questions = call ? call.questions : (ask ? ask.headers : []).map((h) => ({ question: h, header: h, multiSelect: false, options: [], notes: [], recommended: null }));
  const deadline = (call && call.deadline) || deadlineOf({}, human && human.raw, since);
  const waitingHuman = !!(st.lifecycle && st.lifecycle.state === 'waiting_human' && human);
  return { kind: 'question', tool: 'ask_user_question', toolUseId: id, since, notifiedAt: null, questions, deadline: deadline || null, async: call ? !call.waitForAnswer : false, more: ids.length - 1, source: 'record', waitingHuman };
}

// atrium read --json에 싣는 기록 요약
export function omoRecordView(st) {
  if (!st) return { ok: null };
  if (st.ok === false) return { ok: false };
  const ask = omoAskOf(st);
  const phases = st.todo ? st.todo.phases.map((p) => {
    const done = p.tasks.filter((t) => t.status === 'completed').length;
    const now = p.tasks.find((t) => t.status === 'in_progress');
    return { name: p.name, done, total: p.tasks.length, now: now ? now.content : null };
  }) : null;
  const cur = phases ? phases.find((p) => p.done < p.total) || null : null;
  return {
    ok: st.ok, state: st.lifecycle ? st.lifecycle.state : null, at: st.at,
    question: ask ? { id: ask.toolUseId, since: ask.since, deadline: ask.deadline, async: ask.async, more: ask.more, questions: ask.questions } : null,
    lastQuestion: st.resolved ? { id: st.resolved.id, status: st.resolved.status, at: st.resolved.at } : null,
    todo: phases ? { phases, current: cur ? cur.name : null, now: cur ? cur.now : null } : null,
    subtasks: st.children || null,
    goal: st.goal ? { status: st.goal.status || null, objective: st.goal.objective || null } : null,
  };
}

// 멈춤 알림 한 줄에 붙일 질문 글(에이전트가 읽는다): 질문 본문, 보기(추천 표시), 마감
export function askDetailText(ask, { max = 440, maxOptions = 6 } = {}) {
  if (!ask || ask.kind !== 'question' || !Array.isArray(ask.questions) || !ask.questions.length) return null;
  const q = ask.questions[0];
  const opts = (q.options || []).map((o) => (typeof o === 'string' ? o : (o && o.label) || '')).filter(Boolean);
  // 알림은 한 줄로 짧게: 질문 160자, 보기는 6개까지 하나에 30자(더 있으면 "외 n개"), 전체 max자
  const parts = [`질문: ${clip(String(q.question || q.header || '').replace(/\s+/g, ' '), 160)}`];
  const one = (o) => clip(String(o).replace(/\s+/g, ' '), 30);
  if (opts.length) parts.push(`보기: ${opts.slice(0, maxOptions).map(one).join(' / ')}${opts.length > maxOptions ? ` 외 ${opts.length - maxOptions}개` : ''}`);
  const rec = q.recommended || opts.find((o) => RECOMMENDED_RE.test(o));
  if (rec) parts.push(`추천: ${one(rec)}`);
  if (ask.deadline) parts.push(`마감: ${new Date(ask.deadline).toISOString()}`);
  if (ask.questions.length > 1) parts.push(`질문 ${ask.questions.length}개 중 첫째`);
  return clip(parts.join('; '), max);
}

// P383: 판이 넣은 글이 기록에 user 메시지로 들어갔나. since(보낸 시각) - 2초 뒤에 적힌 것 가운데 같은 글(앞부분)이 있으면 true
export function promptInRecord(st, text, since = 0, match = null) {
  if (!st || st.ok === false || !Array.isArray(st.users)) return false;
  const want = String(text || '').replace(/\s+/g, ' ').trim();
  if (!want) return false;
  const same = match || ((a, b) => { const x = String(b || '').replace(/\s+/g, ' ').trim(); const n = Math.min(80, want.length); return x.includes(want.slice(0, n)) || (x.length >= 8 && want.includes(x.slice(0, 80))); });
  return st.users.some((u) => (u.at == null || u.at >= (since || 0) - 2000) && same(text, u.text));
}

// P383: 그 턴(since 뒤)이 실패로 끝났나 → { type, message, via } | null. 실패 뒤에 성공한 답이 있으면(다시 시도가 됐다) 실패가 아니다
export function omoTurnFailure(st, since = 0) {
  if (!st || st.ok === false || !st.failure) return null;
  const f = st.failure;
  if ((f.at || 0) < (since || 0) - 1000) return null;
  if (st.okAt && st.okAt > f.at) return null;
  return { type: f.type || 'error', message: f.message || null, via: f.via || 'record' };
}
