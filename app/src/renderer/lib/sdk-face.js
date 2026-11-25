// P367: SDK 세션 노드 얼굴의 순수 함수. 대화 기록(session.messages)을 그릴 항목으로 묶고(연속 도구 호출은 한 묶음, 도구 결과는 그 호출에),
// 지금 하는 일 한 줄·토큰과 금액 글을 만든다. 값은 백엔드 summary.sdkFace(backend/src/sdk-face.mjs faceView)
const oneLine = (s, n = 120) => { const v = String(s || '').replace(/\s+/g, ' ').trim(); return v.length > n ? `${v.slice(0, n)}…` : v; };

// 도구 요점(backend/src/sdk-face.mjs toolGist와 같은 규칙): 파일 경로, 명령 앞부분, 서브에이전트 설명, 찾은 글과 폴더, 주소
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

// 판·Claude Code가 대화 기록에 남기는 백그라운드 일 끝남 알림(<task-notification>) → { summary, status } | null
export function taskNote(text) {
  const t = String(text || '');
  if (!/^\s*<task-notification>/.test(t)) return null;
  const pick = (tag) => { const m = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(t); return m ? m[1].trim() : null; };
  return { summary: oneLine(pick('summary') || pick('result') || '', 160), status: pick('status') };
}

// 대화 기록 → 그릴 항목. 연속한 도구 호출(사이의 도구 결과 포함)은 { type: 'tools', calls } 한 묶음, 결과는 tool_use_id로 그 호출에 붙인다.
// max: 끝에서 이만큼만(긴 대화를 다 그리지 않는다). 앞을 잘랐으면 첫 항목이 { type: 'more', n }
export function buildItems(messages, { max = 40 } = {}) {
  const items = [];
  const byId = new Map();
  let group = null;
  for (const m of messages || []) {
    if (!m) continue;
    if (m.role === 'tool_use') {
      if (!group) { group = { type: 'tools', calls: [], seq: m.seq }; items.push(group); }
      const call = { id: m.toolUseId || `${m.seq}-${group.calls.length}`, tool: m.tool, gist: toolGist(m.tool, m.input), input: m.input, result: null };
      group.calls.push(call);
      if (m.toolUseId) byId.set(m.toolUseId, call);
      continue;
    }
    if (m.role === 'tool_result') { const c = byId.get(m.toolUseId); if (c) c.result = { text: m.text || '', isError: !!m.isError }; continue; }
    group = null;
    if (m.role === 'user') {
      const note = taskNote(m.text);
      if (note) items.push({ type: 'bgdone', seq: m.seq, ...note });
      else if (String(m.text || '').trim()) items.push({ type: 'user', seq: m.seq, text: m.text });
    } else if (m.role === 'assistant' && String(m.text || '').trim()) items.push({ type: 'assistant', seq: m.seq, text: m.text });
  }
  if (items.length <= max) return items;
  return [{ type: 'more', n: items.length - max + 1 }, ...items.slice(items.length - max + 1)];
}

// 묶음 한 줄 글: 도구 이름별 수와 첫 요점들("Read 2 · Bash 1 — README.md, git log …")
export function groupLine(calls) {
  const c = new Map();
  for (const x of calls) c.set(x.tool, (c.get(x.tool) || 0) + 1);
  const head = [...c.entries()].map(([k, n]) => (n > 1 ? `${k} ${n}` : k)).join(' · ');
  const gists = calls.map((x) => x.gist).filter(Boolean);
  return { head, gists: oneLine(gists.map((g) => g.split(/[\\/]/).pop()).join(', '), 140) };
}

// 펼친 도구 줄의 입력·결과 앞부분
export function inputHead(input, n = 600) {
  if (input == null) return '';
  if (typeof input === 'object' && typeof input.command === 'string') return input.command.slice(0, n);
  let s; try { s = JSON.stringify(input, null, 1); } catch { s = String(input); }
  return s.length > n ? `${s.slice(0, n)}…` : s;
}
export const resultHead = (r, n = 600) => { const s = String((r && r.text) || ''); return s.length > n ? `${s.slice(0, n)}…` : s; };

// 경과 시간 글: 12s, 3m 05s, 1h 02m
export function elapsed(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}
// 토큰 수 글: 950, 37.4k, 1.2M
export function tok(n) {
  const v = Number(n) || 0;
  if (v < 1000) return String(v);
  if (v < 1e6) return `${(v / 1000).toFixed(v < 10000 ? 1 : 0)}k`;
  return `${(v / 1e6).toFixed(1)}M`;
}
// 금액 글(추정): $0.012, $1.24. 1센트보다 작으면 소수 셋째 자리까지, 0.1센트보다 작은 양수는 <$0.001
export function money(v) {
  const x = Number(v) || 0;
  if (x > 0 && x < 0.001) return '<$0.001';
  return `$${x.toFixed(x < 0.1 ? 3 : 2)}`;
}

// 지금 하는 일 한 줄 { kind, text, since } | null. s = 세션 요약(sdkFace, state)
export function nowOf(s, t) {
  const f = s && s.sdkFace;
  if (!f) return null;
  const n = f.now;
  if (s.state === 'working' && n) {
    if (n.kind === 'tool') return { kind: 'tool', text: n.gist ? `${n.tool}: ${n.gist}` : n.tool, since: n.since };
    if (n.kind === 'writing') return { kind: 'writing', text: t('sdkFace.writing'), since: n.since };
    return { kind: 'thinking', text: t('sdkFace.thinking'), since: n.since };
  }
  if (s.state === 'working') return { kind: 'thinking', text: t('sdkFace.thinking'), since: (s.turn && s.turn.startedAt) || null };
  if (f.bg && f.bg.n) return { kind: 'bg', text: bgLine(f.bg, t), since: null };
  return null;
}
// 백그라운드 일 글: "백그라운드 2 (서브에이전트 1 · 셸 1)"
export function bgLine(bg, t) {
  if (!bg || !bg.n) return '';
  const parts = [bg.agents ? t('sdkFace.bgAgents', { n: bg.agents }) : null, bg.shells ? t('sdkFace.bgShells', { n: bg.shells }) : null, bg.n - (bg.agents || 0) - (bg.shells || 0) > 0 ? t('sdkFace.bgOther', { n: bg.n - (bg.agents || 0) - (bg.shells || 0) }) : null].filter(Boolean);
  return t('sdkFace.bg', { n: bg.n, kinds: parts.join(' · ') });
}
// 한 줄 글(세션 맵 카드·축소 단계): 지금 하는 일 + 경과
export function nowShort(s, t, now = Date.now()) {
  const x = nowOf(s, t);
  if (!x) return null;
  return x.since ? `${x.text} · ${elapsed(now - x.since)}` : x.text;
}
// 토큰 칸들(입력·캐시 읽기·캐시 쓰기·출력)
export const usageParts = (u) => (u ? [['in', u.in], ['cacheR', u.cacheR], ['cacheW', u.cacheW], ['out', u.out]] : []);
