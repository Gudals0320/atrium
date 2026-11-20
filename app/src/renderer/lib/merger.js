// P268: 합치기 merger의 창 쪽 자료(판 쪽 P267 merger.mjs 계약). 판 API merger.status·merger.answer, 이벤트 merger.ask·merger.answered·merger.updated.
// 여기는 React 없는 순수 함수만 둔다(단위 시험 app/test/p268-lib.test.mjs).
export const MERGER_MODES = ['on', 'ask', 'off']; // 설정 mergerMode(기본 ask)
export const MERGER_EFFORTS = ['', 'low', 'medium', 'high', 'xhigh', 'max']; // 설정 mergerEffort(빈 값: 넘기지 않음)
export const MERGER_DEFAULTS = { mergerMode: 'ask', mergerKind: 'claude', mergerModel: 'claude-sonnet-5-5', mergerEffort: 'medium' };
// 판의 설정 schema와 같은 꼴 검사(백엔드 settings.mjs). 창에서 미리 걸러 잘못된 값을 보내지 않는다
const KIND_RE = /^[a-z][a-z0-9_-]{0,39}$/;
const MODEL_RE = /^[A-Za-z0-9][A-Za-z0-9._:\/\[\]-]{0,79}$/;

// 설정 값(settings.get) → 칸에 보일 넷. 판에 없는 키(옛 판)면 null
export function mergerSettingsOf(settings) {
  if (!settings || !('mergerMode' in settings)) return null;
  const out = {};
  for (const k of Object.keys(MERGER_DEFAULTS)) out[k] = settings[k] == null ? MERGER_DEFAULTS[k] : settings[k];
  if (!MERGER_MODES.includes(out.mergerMode)) out.mergerMode = MERGER_DEFAULTS.mergerMode;
  if (!MERGER_EFFORTS.includes(out.mergerEffort)) out.mergerEffort = MERGER_DEFAULTS.mergerEffort;
  return out;
}

// 칸에 친 값 → 보낼 값 또는 { error }. 빈 칸은 기본으로 되돌린다
export function mergerValueOf(key, raw) {
  const v = String(raw == null ? '' : raw).trim();
  if (key === 'mergerMode') return MERGER_MODES.includes(v) ? { value: v } : { error: 'mode' };
  if (key === 'mergerEffort') return MERGER_EFFORTS.includes(v) ? { value: v } : { error: 'effort' };
  if (key === 'mergerKind') { const x = (v || MERGER_DEFAULTS.mergerKind).toLowerCase(); return KIND_RE.test(x) ? { value: x } : { error: 'kind' }; }
  if (key === 'mergerModel') { const x = v || MERGER_DEFAULTS.mergerModel; return MODEL_RE.test(x) ? { value: x } : { error: 'model' }; }
  return { error: 'key' };
}

// merger.status 결과를 창의 상태로(빈 값·옛 판에도 같은 꼴)
export function mergerViewOf(r) {
  const x = r && typeof r === 'object' ? r : {};
  return {
    mode: x.mode || null,
    answers: x.answers && typeof x.answers === 'object' ? x.answers : {},
    asks: Array.isArray(x.asks) ? x.asks.filter((a) => a && a.workspace) : [],
    mergers: Array.isArray(x.mergers) ? x.mergers : [],
    jobs: Array.isArray(x.jobs) ? x.jobs : [],
    jobsMax: x.jobsMax || 5,
  };
}

// 묻는 카드: 사람이 "나중에"로 닫은 것(워크스페이스|물은 시각)을 뺀다. 오래된 것부터
export const askKey = (a) => `${a.workspace}|${a.at || 0}`;
export function askCards(view, dismissed = new Set()) {
  if (!view) return [];
  return view.asks.filter((a) => !dismissed.has(askKey(a))).sort((a, b) => (a.at || 0) - (b.at || 0));
}
// 이벤트로 온 카드 하나를 넣는다(같은 워크스페이스는 하나)
export function withAsk(view, card) {
  const v = view || mergerViewOf(null);
  if (!card || !card.workspace) return v;
  return { ...v, asks: [...v.asks.filter((a) => a.workspace !== card.workspace), card] };
}
// 답이 오면 그 워크스페이스 카드를 뺀다
export function withoutAsk(view, ws) {
  const v = view || mergerViewOf(null);
  return { ...v, asks: v.asks.filter((a) => a.workspace !== ws) };
}

// 지금 열린 merger 세션 id들(세션 카드·사이드바·세션 맵의 꼬리표)
export function mergerSessionIds(view) {
  const out = new Map();
  if (!view) return out;
  for (const m of view.mergers) if (m && m.open && m.sessionId) out.set(m.sessionId, m);
  return out;
}

// 캔버스의 하위 → merger 선: 열린 합치기 일의 childId → mergerId. 양끝이 다 판에 보일 때만(here). 한 쌍에 선 하나(가장 최근 일, 줄 선 수는 n)
const STATE_ORDER = { merging: 0, queued: 1, failed: 2, merged: 3, cancelled: 4 };
export function mergerLines(view, here = () => true) {
  if (!view) return [];
  const byPair = new Map();
  for (const j of view.jobs) {
    if (!j || !j.childId || !j.mergerId || j.childId === j.mergerId) continue;
    if (j.state === 'cancelled') continue;
    if (!here(j.childId) || !here(j.mergerId)) continue;
    const k = j.childId + '>' + j.mergerId;
    const cur = byPair.get(k);
    if (!cur) { byPair.set(k, { j, n: 1 }); continue; }
    cur.n += 1;
    const a = STATE_ORDER[j.state] ?? 9, b = STATE_ORDER[cur.j.state] ?? 9;
    if (a < b || (a === b && (j.createdAt || 0) > (cur.j.createdAt || 0))) cur.j = j;
  }
  return [...byPair.values()].map(({ j, n }) => ({ id: `merge:${j.childId}>${j.mergerId}`, source: j.childId, target: j.mergerId, unit: j.unit, state: j.state, branch: j.branch || '', target_branch: j.target || '', merger: j.merger || '', child: j.child || '', hash: j.hash || null, n }));
}
// merger를 띄우는 중인 일(mergerId 없음) 수: 워크스페이스별
export function pendingMerges(view) {
  const out = new Map();
  if (!view) return out;
  for (const j of view.jobs) if (j && !j.mergerId && j.state !== 'cancelled' && j.workspace) out.set(j.workspace, (out.get(j.workspace) || 0) + 1);
  return out;
}
