// P367: SDK 세션(claude -p stream-json)의 백그라운드 일 지키기와 노드 얼굴 값. 순수 함수만(rt만 바꾼다).
// 백그라운드 일 신호(P367 실험, Claude Code 2.1.332 -p):
//   - stream system/background_tasks_changed: 지금 도는 백그라운드 일 전체 목록(서브에이전트 local_agent, 셸 local_bash …). 바뀔 때마다 온다(가장 믿을 만함)
//   - stream system/task_started(is_backgrounded)·task_notification(끝남, tool_use_id)·task_progress(서브에이전트의 마지막 도구)
//   - hook Stop·SubagentStop의 background_tasks(P92, rt.bg). hook이 늦거나 빠지면 이것만으로는 모른다
//   - 도구 결과 글("Async agent launched", "Command running in background with ID"): 위 신호가 없을 때를 위한 안전한 기본. 끝남(task_notification)을 볼 때까지 일로 센다
//   백그라운드 일이 끝나면 Claude Code가 그 알림으로 스스로 새 턴(init → assistant → result)을 돈다. 판은 init을 턴 시작으로 본다.
// 얼굴 값: 지금 하는 일 한 줄(마지막 도구·생각 중·답 쓰는 중, 시작 시각), 턴마다 토큰(입력·캐시 읽기·캐시 쓰기·출력)과 금액(추정, 가격표), 세션 누계.
import { priceOf } from './api-credits.mjs'; // 가격표(공식 가격 페이지를 옮긴 것). P366이 이 표를 sdk-cost.mjs로 옮기면 그쪽에서 읽는다
import { clip } from './text.mjs';

export const SDK_BG_MAX_MS = 6 * 3600000; // 안전한 기본(끝남을 못 본 백그라운드 일)도 마지막 소식 뒤 이만큼 지나면 더 기다리지 않는다
const BG_TYPE = { local_agent: 'subagent', local_bash: 'shell', local_monitor: 'monitor', remote_agent: 'subagent' };
const oneLine = (s, n = 80) => clip(String(s || '').replace(/\s+/g, ' ').trim(), n);

// ---------- 도구 요점 ----------
// 도구 이름과 입력 → 한 줄 요점(읽은·고친 파일 경로, 돌린 명령 앞부분, 서브에이전트 설명, 찾은 글, 주소)
export function toolGist(name, input) {
  const i = input && typeof input === 'object' ? input : {};
  let v;
  if (/^(Agent|Task)$/.test(name)) v = i.description || i.prompt;
  else if (i.command) v = i.command;
  else if (i.file_path || i.notebook_path) v = i.file_path || i.notebook_path;
  else if (i.pattern) v = i.path ? `${i.pattern} @ ${i.path}` : i.pattern;
  else v = i.url || i.query || i.skill || i.description || i.prompt
    || (Array.isArray(i.todos) ? `${i.todos.length} todos` : '') || (Array.isArray(i.questions) ? i.questions.map((q) => q && q.question).filter(Boolean).join(' / ') : '');
  return oneLine(v, 120);
}
// 도구 결과 글이 "백그라운드로 띄웠다"인가 → 'subagent' | 'shell' | null
export function bgLaunchOf(text) {
  const t = String(text || '');
  if (/^\s*Async agent launched successfully/i.test(t)) return 'subagent';
  if (/Command running in background with ID/i.test(t)) return 'shell';
  if (/^\s*Monitor started/i.test(t)) return 'monitor';
  return null;
}

// ---------- 백그라운드 일 ----------
const bgState = (rt) => (rt.sdkBg && typeof rt.sdkBg === 'object' ? rt.sdkBg : (rt.sdkBg = { list: null, listAt: 0, pending: {}, at: 0 }));
// stream 사건 하나로 백그라운드 일 상태를 고친다
export function applyBgEvent(rt, ev, now = Date.now()) {
  const b = bgState(rt);
  if (ev.kind === 'bg') { b.list = ev.tasks; b.listAt = now; b.at = now; return; }
  if (ev.kind === 'task' && ev.background) {
    if (ev.toolUseId) b.pending[ev.toolUseId] = { id: ev.id || null, type: ev.type, label: ev.label || null, at: now, owner: ev.owner || null };
    b.at = now; return;
  }
  if (ev.kind === 'taskDone') {
    for (const [k, p] of Object.entries(b.pending)) if (k === ev.toolUseId || (ev.id && p.id === ev.id)) delete b.pending[k];
    b.at = now; return;
  }
  if (ev.kind === 'toolResults') {
    for (const r of ev.results) if (r.bg && r.id && !b.pending[r.id]) { b.pending[r.id] = { id: null, type: r.bg, label: r.label || null, at: now }; b.at = now; }
  }
}
// 지금 도는 백그라운드 일 목록 [{ id, type: 'subagent'|'shell'|…, label }]. 가장 새 목록(stream 또는 hook)에 끝남을 못 본 띄운 일(안전한 기본)을 더한다
export function sdkBackground(rt, now = Date.now()) {
  const b = rt.sdkBg || null;
  const hook = rt.bg && Array.isArray(rt.bg.tasks) ? rt.bg : null;
  let list = [];
  if (b && b.list && (!hook || b.listAt >= (hook.at || 0))) list = b.list;
  else if (hook) list = hook.tasks.map((t) => ({ id: t.id || null, type: t.type || 'other', label: t.label || null }));
  const seen = new Set(list.map((t) => t.id).filter(Boolean));
  const fresh = b && now - (b.at || 0) <= SDK_BG_MAX_MS;
  const listFresh = (b && b.list && now - (b.listAt || 0) <= SDK_BG_MAX_MS) || (hook && now - (hook.at || 0) <= SDK_BG_MAX_MS);
  const out = listFresh ? [...list] : [];
  if (fresh) for (const [tu, p] of Object.entries(b.pending || {})) {
    if (p.id && seen.has(p.id)) continue;
    // 목록 신호가 띄운 뒤에 왔고 그 목록에 없으면 이미 끝난 것(task_notification을 놓쳤다)
    if (b.list && b.listAt > p.at && p.id) continue;
    out.push({ id: p.id || tu, type: p.type || 'other', label: p.label || null, guess: !p.id || !b.list });
  }
  return out;
}
// 프로세스가 끝나면 백그라운드 일도 끝난다
export function clearBg(rt) { rt.sdkBg = null; }
// 세션 맵·푸시가 쓰는 꼴(sleep.mjs backgroundList와 같은 꼴) | null
export function bgView(rt, now = Date.now()) {
  const list = sdkBackground(rt, now);
  if (!list.length) return null;
  const KIND = { subagent: 'agent', shell: 'shell' };
  const items = list.map((t) => ({ kind: KIND[t.type] || 'other', label: t.label || null }));
  return { n: items.length, kinds: [...new Set(items.map((x) => x.kind))], items: items.slice(0, 20), at: (rt.sdkBg && rt.sdkBg.at) || (rt.bg && rt.bg.at) || null, via: 'sdk' };
}

// ---------- stream 줄 읽기(얼굴·백그라운드) ----------
// readStreamEvent(sdk-session.mjs)가 모르는 system·user 줄 → 사건 | null
export function readFaceEvent(j) {
  if (!j || typeof j !== 'object') return null;
  if (j.type === 'system') {
    if (j.subtype === 'background_tasks_changed') return { kind: 'bg', tasks: (Array.isArray(j.tasks) ? j.tasks : []).slice(0, 40).map((t) => ({ id: String(t.task_id || '').slice(0, 40) || null, type: BG_TYPE[t.task_type] || 'other', label: oneLine(t.description || t.subagent_type, 80) || null })) };
    if (j.subtype === 'task_started') return { kind: 'task', id: j.task_id || null, toolUseId: j.tool_use_id || null, background: !!j.is_backgrounded, type: BG_TYPE[j.task_type] || 'other', label: oneLine(j.description, 80) || null, owner: j.parent_task_id || null };
    if (j.subtype === 'task_notification') return { kind: 'taskDone', id: j.task_id || null, toolUseId: j.tool_use_id || null, status: j.status || null };
    if (j.subtype === 'task_progress') return { kind: 'taskProgress', id: j.task_id || null, tool: j.last_tool_name || null, label: oneLine(j.description, 80) || null };
    if (j.subtype === 'thinking_tokens') return { kind: 'thinking' };
    return null;
  }
  if (j.type === 'user' && j.message && Array.isArray(j.message.content) && !j.parent_tool_use_id) {
    const results = j.message.content.filter((c) => c && c.type === 'tool_result').map((c) => {
      const text = typeof c.content === 'string' ? c.content : Array.isArray(c.content) ? c.content.filter((x) => x && x.type === 'text').map((x) => x.text).join('\n') : '';
      return { id: c.tool_use_id || null, error: !!c.is_error, bg: bgLaunchOf(text) };
    });
    return results.length ? { kind: 'toolResults', results } : null;
  }
  return null;
}

// ---------- 지금 하는 일 ----------
// rt.sdkNow = { kind: 'tool' | 'thinking' | 'writing' | 'agent', tool, gist, since } | null(쉼)
export function applyNow(rt, ev, now = Date.now()) {
  if (ev.kind === 'turnStart') { rt.sdkNow = { kind: 'thinking', tool: null, gist: null, since: now }; rt.sdkTurn = { startedAt: now, tools: 0 }; return; }
  if (ev.kind === 'thinking') { if (!rt.sdkNow || rt.sdkNow.kind !== 'thinking') rt.sdkNow = { kind: 'thinking', tool: null, gist: null, since: now }; return; }
  if (ev.kind === 'assistant') {
    const uses = ev.uses || [];
    if (uses.length) {
      const u = uses[uses.length - 1];
      rt.sdkNow = { kind: 'tool', tool: u.name, gist: u.gist || null, since: now, n: uses.length };
      if (rt.sdkTurn) rt.sdkTurn.tools = (rt.sdkTurn.tools || 0) + uses.length;
    } else if (ev.text) rt.sdkNow = { kind: 'writing', tool: null, gist: null, since: now };
    return;
  }
  if (ev.kind === 'toolResults') { if (rt.sdkNow && rt.sdkNow.kind === 'tool') rt.sdkNow = { kind: 'thinking', tool: null, gist: null, since: now }; return; }
  if (ev.kind === 'result') { rt.sdkNow = null; if (rt.sdkTurn) rt.sdkTurn.endedAt = now; }
}

// ---------- 토큰·금액 ----------
const ZERO = () => ({ in: 0, cacheR: 0, cacheW: 0, out: 0, cost: 0, unpriced: 0 });
const r6 = (v) => Math.round(v * 1e6) / 1e6;
// 모델 하나의 쓴 양 → 달러 | null(가격을 모르는 모델). 턴 합이라 긴 프롬프트 값(요청마다 정함)은 쓰지 않는다
export function usageCost(model, u) {
  const p = priceOf(model);
  if (!p) return null;
  const cw = u.cacheW || 0, cw1h = Math.min(cw, u.cacheW1h || 0);
  return r6(((u.in || 0) * p[0] + (cw - cw1h) * p[1] + cw1h * p[2] + (u.cacheR || 0) * p[3] + (u.out || 0) * p[4]) / 1e6);
}
// result 줄 → 이번 턴 { in, cacheR, cacheW, out, cost, unpriced, models } | null. 서브에이전트까지 모델별로 든 model_usage_since_last_result가 있으면 그것, 없으면 usage와 모델
export function turnUsage(j, model = null) {
  if (!j || typeof j !== 'object') return null;
  const per = j.model_usage_since_last_result && typeof j.model_usage_since_last_result === 'object' ? j.model_usage_since_last_result : null;
  const sum = ZERO(); const models = [];
  if (per && Object.keys(per).length) {
    for (const [m, x] of Object.entries(per)) {
      if (!x || typeof x !== 'object') continue;
      const u = { in: Number(x.inputTokens) || 0, cacheR: Number(x.cacheReadInputTokens) || 0, cacheW: Number(x.cacheCreationInputTokens) || 0, cacheW1h: Number(x.cacheCreationEphemeral1hInputTokens) || 0, out: Number(x.outputTokens) || 0 };
      add(sum, u, usageCost(m, u)); models.push(m);
    }
  } else if (j.usage && typeof j.usage === 'object') {
    const x = j.usage;
    const u = { in: Number(x.input_tokens) || 0, cacheR: Number(x.cache_read_input_tokens) || 0, cacheW: Number(x.cache_creation_input_tokens) || 0, cacheW1h: Number(x.cache_creation && x.cache_creation.ephemeral_1h_input_tokens) || 0, out: Number(x.output_tokens) || 0 };
    add(sum, u, usageCost(model, u)); if (model) models.push(model);
  } else return null;
  sum.models = models;
  return sum;
}
function add(sum, u, cost) {
  sum.in += u.in || 0; sum.cacheR += u.cacheR || 0; sum.cacheW += u.cacheW || 0; sum.out += u.out || 0;
  if (cost == null) { if (u.in || u.out || u.cacheR || u.cacheW) sum.unpriced = (sum.unpriced || 0) + 1; } else sum.cost = r6((sum.cost || 0) + cost);
}
// 세션 누계에 턴 하나를 더한다 → rt.sdkUsage = { last, total, turns }
export function addTurnUsage(rt, u, now = Date.now()) {
  if (!u) return;
  const cur = rt.sdkUsage && typeof rt.sdkUsage === 'object' ? rt.sdkUsage : { total: ZERO(), turns: 0, last: null };
  const total = { ...ZERO(), ...cur.total };
  add(total, u, u.unpriced && !u.cost ? null : u.cost);
  if (u.unpriced && u.cost) total.unpriced = (total.unpriced || 0) + u.unpriced;
  rt.sdkUsage = { total, turns: (cur.turns || 0) + 1, last: { ...u, at: now } };
}

// 창이 그릴 SDK 얼굴 값(summary.sdkFace)
export function faceView(rt, now = Date.now()) {
  const bg = sdkBackground(rt, now);
  return {
    now: rt.sdkNow || null,
    turn: rt.sdkTurn || null,
    bg: bg.length ? { n: bg.length, agents: bg.filter((t) => t.type === 'subagent').length, shells: bg.filter((t) => t.type === 'shell').length, items: bg.slice(0, 8).map((t) => ({ type: t.type, label: t.label })) } : null,
    usage: rt.sdkUsage || null,
    denied: rt.sdkDenied || null,
  };
}
