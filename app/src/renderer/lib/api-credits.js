// P361: API 크레딧 장부(백엔드 credit-book.mjs의 usage.get apiCredits)를 창에서 보이는 순수 함수. 사용량 팝업, 설정, 노드·맵 카드, 휴대폰이 쓴다.
const num = (v) => typeof v === 'number' && Number.isFinite(v);
const two = (n) => String(n).padStart(2, '0');

// 달러 글: 127.11 → $127.11, -4.33 → -$4.33. 1센트보다 작은 양수는 <$0.01
export function usd(v, { small = false } = {}) {
  if (!num(v)) return '—';
  if (small && v > 0 && v < 0.01) return '<$0.01';
  return `${v < 0 ? '-' : ''}$${Math.abs(v).toFixed(2)}`;
}
// 11/27 09:00 (이 PC 시간대). 시각이 없던 날짜는 11/27
export function whenShort(ms, hasTime = true) {
  if (!num(ms)) return '';
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()}${hasTime ? ` ${two(d.getHours())}:${two(d.getMinutes())}` : ''}`;
}
// 'YYYY-MM-DD' → 11/24
export const dayShort = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '')); return m ? `${Number(m[2])}/${Number(m[3])}` : ''; };
// 남은 때 → 글 열쇠 { key, vars }
export function leftOf(expiresAt, now = Date.now()) {
  if (!num(expiresAt)) return { key: 'apiCredits.noExpiry', vars: {} };
  const ms = expiresAt - now;
  if (ms <= 0) return { key: 'apiCredits.expired', vars: {} };
  const h = Math.floor(ms / 3600000);
  if (h < 48) return { key: 'apiCredits.leftHours', vars: { n: Math.max(1, h) } };
  return { key: 'apiCredits.leftDays', vars: { n: Math.floor(h / 24) } };
}
// 적용 대상 줄임: 앞 둘 + n개 더
export function targetsShort(list) {
  const a = Array.isArray(list) ? list.filter(Boolean) : [];
  if (a.length <= 2) return { text: a.join(', '), more: 0 };
  return { text: a.slice(0, 2).join(', '), more: a.length - 2 };
}
// 막대 너비(잔액 / 총액, 0~100)
export const barPct = (g) => (g && num(g.total) && g.total > 0 && num(g.left) ? Math.max(0, Math.min(100, (g.left / g.total) * 100)) : 0);
// 막대 색 단계: 바닥·곧 만료는 주의
export const grantLevel = (g) => (!g || g.expired || g.left <= 0.005 ? 'gone' : g.soon ? 'warn' : 'ok');
// 세션 하나가 쓴 금액(추정, 중계기 기록 × 가격표) | null
export function sessionCost(view, sessionId) {
  const c = view && view.apiCredits ? view.apiCredits : view;
  const v = c && c.sessions ? c.sessions[sessionId] : null;
  return num(v) ? v : null;
}
// 장부가 보일 값이 있는가(휴대폰·팝업 칸을 그릴지)
export const hasCredits = (c) => !!(c && (c.ledger || (c.spend && (c.spend.month > 0 || c.spend.today > 0))));
// 붙여 넣은 미리 보기 → 저장할 꼴(백엔드 credits.save)
export function saveBodyOf(pv, plan = undefined) {
  if (!pv) return null;
  return { grants: (pv.grants || []).map((g) => ({ name: g.name, kind: g.kind, plan: g.plan, total: g.total, remaining: g.remaining, appliesTo: g.appliesTo, expiresAt: g.expiresAt, hasTime: g.hasTime, grantedOn: g.grantedOn })), purchased: pv.purchased || null, autoReload: pv.autoReload ?? null, ...(plan !== undefined ? { plan } : {}) };
}
// <input type="datetime-local"> 값 ↔ ms(이 PC 시간대)
export function toLocalInput(ms) {
  if (!num(ms)) return '';
  const d = new Date(ms);
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}T${two(d.getHours())}:${two(d.getMinutes())}`;
}
export function fromLocalInput(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(String(s || ''));
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] || 0), Number(m[5] || 0)).getTime();
}
// 손 입력 금액: "$1,234.5" → 1234.5, 빈칸 → null, 틀리면 undefined
export function moneyInput(s) {
  const x = String(s ?? '').replace(/[,$\s]|US|USD/gi, '').replace(/[−–]/g, '-');
  if (!x) return null;
  const v = Number(x);
  return Number.isFinite(v) ? v : undefined;
}
// 나누기 규칙(툴팁 열쇠)
export const RULE_KEY = 'apiCredits.rule';
// 휴대폰 홈 칸의 줄들(slimView) → [{ id, name, kind, left, total, pct, level, when, leftKey }]
export function phoneRows(c, now = Date.now()) {
  return ((c && c.grants) || []).map((g) => ({ id: g.id, name: g.name, kind: g.kind, left: g.left, total: g.total, pct: barPct(g), level: grantLevel(g), when: whenShort(g.expiresAt), left2: leftOf(g.expiresAt, now) }));
}
