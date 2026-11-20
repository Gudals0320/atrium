// P211: 구독 사용량(백엔드 usage.mjs의 usage.get·usage.updated 값)을 창에서 보이는 순수 함수. 위 막대 알약, 펼침, 호출자 옆 남은 양, 알림 글이 쓴다.
// 단위 시험 app/test/p211-lib.test.mjs
export const PROVIDERS = ['claude', 'codex', 'agy'];
export const PROVIDER_NAME = { claude: 'Claude', codex: 'Codex', agy: 'AGY' };
const num = (v) => typeof v === 'number' && Number.isFinite(v);

// 색 기준(사용자 상태 줄과 같다): 60% 미만 초록(ok), 60~84 노랑(warn), 85 이상 빨강(high). 모르면 none
export function levelOf(pct) {
  if (!num(pct)) return 'none';
  const r = Math.round(pct);
  return r >= 85 ? 'high' : r >= 60 ? 'warn' : 'ok';
}
const RANK = { none: 0, ok: 1, warn: 2, high: 3 };
// 리셋이 지난 창은 새 창이라 0%로 본다(그새 값을 받지 못했을 뿐)
export const livePct = (w, now = Date.now()) => (!w || !num(w.usedPct) ? null : w.resetsAt && w.resetsAt <= now ? 0 : w.usedPct);
// P214: 보이는 창. AGY는 Gemini 모델 묶음의 5시간·주간만 보인다(3p·실험용·모델별 세부 묶음은 알약에도 펼침에도 없다, 2026-11-18 사용자 결정).
// 그 밖 구독은 받은 창 그대로(Claude는 요금제마다 오는 창만). → [{ ...창, kind: '5h'|'day'|'week'|창 이름 }] 5시간·하루·주간·그 밖 순
const AGY_SHOWN = { 'gemini-5h': '5h', 'gemini-weekly': 'week' };
const KIND_ORDER = { '5h': 0, day: 1, week: 2 };
export function shownWindows(provider, entry) {
  const list = entry && Array.isArray(entry.windows) ? entry.windows : [];
  const p = provider || (entry && entry.provider);
  const out = [];
  for (const w of list) {
    if (!w) continue;
    if (p === 'agy') { const k = AGY_SHOWN[w.id]; if (k) out.push({ ...w, kind: k }); continue; }
    out.push({ ...w, kind: w.id });
  }
  return out.sort((a, b) => (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9));
}
// 구독 하나의 가장 높은 창(보이는 창 가운데) → { w, pct } | null
export function topOf(entry, now = Date.now(), provider = null) {
  if (!entry || !Array.isArray(entry.windows)) return null;
  let best = null;
  for (const w of shownWindows(provider, entry)) { const p = livePct(w, now); if (p != null && (!best || p > best.pct)) best = { w, pct: p }; }
  return best;
}
// 알약: 값을 아는 구독마다 { provider, name, pct(반올림), level }과 전체 색(가장 높은 값)
export function pillOf(view, now = Date.now()) {
  const p = (view && view.providers) || {};
  const parts = [];
  for (const k of PROVIDERS) { const top = topOf(p[k], now, k); if (top) parts.push({ provider: k, name: PROVIDER_NAME[k], pct: Math.round(top.pct), level: levelOf(top.pct), window: top.w.id }); }
  const level = parts.reduce((a, x) => (RANK[x.level] > RANK[a] ? x.level : a), 'none');
  return { parts, level, known: parts.length };
}
// 남은 양(%) = 100 − 가장 높은 창. 모르면 null
export function remainingOf(view, provider, now = Date.now()) {
  const top = topOf(view && view.providers && view.providers[provider], now, provider);
  return top ? { pct: Math.max(0, Math.round(100 - top.pct)), level: levelOf(top.pct), window: top.w.id } : null;
}
// 호출자 → 그 호출자가 쓰는 구독 | null. API 주소·키 환경 변수를 주는 호출자는 구독이 아니다. P255: 옛 연결 참조(connection)는 보지 않는다
const API_ENV = /^(ANTHROPIC_(BASE_URL|API_KEY|AUTH_TOKEN)|OPENAI_(BASE_URL|API_KEY)|CODEX_HOME)$/;
export function providerOfLauncher(l) {
  if (!l) return null;
  const names = [...Object.keys(l.env || {}), ...((l.preview && l.preview.env) || [])];
  if (names.some((n) => API_ENV.test(n))) return null;
  return PROVIDERS.includes(l.harness) ? l.harness : null;
}
// 시간 길이 → { key, vars }(사전 usage.span*). 분·시간·일
export function spanOf(ms) {
  const m = Math.max(0, Math.round((num(ms) ? ms : 0) / 60000));
  if (m < 60) return { key: 'usage.spanMin', vars: { m } };
  const h = Math.floor(m / 60);
  if (h < 48) return m % 60 ? { key: 'usage.spanHourMin', vars: { h, m: m % 60 } } : { key: 'usage.spanHour', vars: { h } };
  const d = Math.floor(h / 24);
  return h % 24 ? { key: 'usage.spanDayHour', vars: { d, h: h % 24 } } : { key: 'usage.spanDay', vars: { d } };
}
// 창 이름 → 사전 열쇠(5h·week·day는 사전, 그 밖은 이름 그대로)
export const windowKey = (id) => (id === '5h' || id === 'week' || id === 'day' ? `usage.win.${id}` : null);
// 창 이름 글: 5h·week·day는 사전, AGY의 "<무리>-5h|weekly|daily"는 "<무리 이름> <창>"(gemini-5h → Gemini 5시간), 그 밖은 이름 그대로
const GROUP = { gemini: 'Gemini', '3p': '3p' };
export function windowLabel(id, t = (k) => k) {
  const k = windowKey(id);
  if (k) return t(k);
  const m = /^(.+)-(5h|weekly|daily)$/.exec(String(id || ''));
  if (!m) return String(id || '');
  const g = GROUP[m[1]] || m[1].replace(/^gemini-/, 'Gemini ');
  return `${g} ${t(windowKey(m[2] === 'weekly' ? 'week' : m[2] === 'daily' ? 'day' : '5h'))}`;
}
// 크레딧 → { key, vars } | null
export function creditOf(c) {
  if (!c) return null;
  if (c.unlimited) return { key: 'usage.creditUnlimited', vars: {} };
  if (!c.hasCredits) return { key: 'usage.creditNone', vars: {} };
  const n = Number(c.balance);
  return { key: 'usage.credit', vars: { n: Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: n >= 100 ? 0 : 2 }) : String(c.balance ?? '') } };
}
// 알림 글 열쇠와 값(usage.alert 사건)
export function alertText(a, now = Date.now()) {
  return { title: { key: 'usage.alertTitle', vars: { name: PROVIDER_NAME[a.provider] || a.provider, pct: Math.round(a.usedPct) } }, window: a.window, reset: a.resetsAt && a.resetsAt > now ? spanOf(a.resetsAt - now) : null };
}

// P214: 위 막대 알약 한 줄 꼴. 구독마다 로고 하나 + 그 구독에 보이는 창만(예 [로고] 5h 42 · 주 88), 값마다 색, 알약 테두리는 가장 높은 값의 색
// → { parts: [{ provider, name, wins: [{ id, kind, pct, level }] }], level }
export function pillLine(view, now = Date.now()) {
  const p = (view && view.providers) || {};
  const parts = [];
  let level = 'none';
  for (const k of PROVIDERS) {
    const wins = [];
    for (const w of shownWindows(k, p[k])) {
      const v = livePct(w, now);
      if (v == null) continue;
      const lv = levelOf(v);
      wins.push({ id: w.id, kind: w.kind, pct: Math.round(v), level: lv });
      if (RANK[lv] > RANK[level]) level = lv;
    }
    if (wins.length) parts.push({ provider: k, name: PROVIDER_NAME[k], wins });
  }
  return { parts, level };
}
// 알약 안 짧은 창 이름(사전 usage.short.*: ko 5h·1W·하루, en 5h·1W·day). 모르는 창은 이름 그대로
export const shortKey = (kind) => (kind === '5h' || kind === 'week' || kind === 'day' ? `usage.short.${kind}` : null);
