// P284: 결정 카드의 창 쪽 셈(판 쪽 backend/src/decisions.mjs, API decision.list | decision.answer | decision.ignore, 이벤트 decision.changed { cards }).
// 카드: { id, sessionId, name, workspaceKey, question, options: [], why, createdAt }. 목록은 오래 기다린 것 먼저.
// P292: 사용자 몫. 카드에 kind(decide | do | check | later), cmds(복사할 명령), tell, later(날짜·조건 글), wakeAt, cond, deferred(나중 줄)가 더해졌다.

// 판이 준 열린 카드(틀린 줄은 버린다) → 오래 기다린 것 먼저
export function decisionsOf(cards) {
  if (!Array.isArray(cards)) return [];
  return cards.filter((d) => d && Number.isInteger(Number(d.id)) && d.sessionId && typeof d.question === 'string')
    .map((d) => ({ ...d, id: Number(d.id), options: Array.isArray(d.options) ? d.options.map(String) : [], auto: !!d.auto, kind: KINDS.includes(d.kind) ? d.kind : 'decide', cmds: Array.isArray(d.cmds) ? d.cmds.map(String) : [], tell: !!d.tell, later: d.later || null, wakeAt: Number(d.wakeAt) || null, cond: d.cond || null, deferred: !!d.deferred, timing: TIMINGS.includes(d.timing) ? d.timing : null })) // P292. P295: timing
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0) || a.id - b.id);
}
// P286: 세션마다 모아 둔 답 수(판의 held { sessionId: n }) → 0보다 큰 것만
export function heldOf(held) {
  const out = {};
  if (!held || typeof held !== 'object') return out;
  for (const [k, v] of Object.entries(held)) { const n = Number(v); if (k && Number.isInteger(n) && n > 0) out[k] = n; }
  return out;
}
// P286: 목록에서 세션마다 첫 카드의 ID(모은 답 줄을 그 카드 위에 한 번 보인다)
export function firstCardIds(cards) {
  const seen = new Set(); const out = new Set();
  for (const d of cards || []) if (!seen.has(d.sessionId)) { seen.add(d.sessionId); out.add(d.id); }
  return out;
}
// P286: 한 세션의 카드가 모두 자동 카드인가(표식을 자동으로 보인다)
export const allAuto = (cards, sessionId) => { const mine = (cards || []).filter((d) => d.sessionId === sessionId); return mine.length > 0 && mine.every((d) => d.auto); };
// 세션마다 열린 카드 수
export function countBySession(cards) {
  const m = new Map();
  for (const d of cards || []) m.set(d.sessionId, (m.get(d.sessionId) || 0) + 1);
  return m;
}
// 한 줄 답 칸의 글이 보낼 만한가(빈 글은 아니다)
export const answerReady = (text) => typeof text === 'string' && text.trim().length > 0;
// 카드 하나를 목록에서 뺀다(답·무시 직후, 이벤트를 기다리지 않고 바로 지운다)
export const withoutCard = (cards, id) => (cards || []).filter((d) => d.id !== id);

// ---------- P292: 사용자 몫 ----------
export const KINDS = ['decide', 'do', 'check', 'later', 'guard']; // P341: guard = 판이 만든 폭주 카드(Guard.jsx GuardBody)
// P357: 종류 꼬리표의 사전 열쇠 하나(PC 할 일 목록·세션 맵 미니 창·휴대폰 카드가 같은 말: 결정·실행·확인·나중에·폭주)
export const kindWord = (k) => `userTasks.kind.${KINDS.includes(k) ? k : 'decide'}`;
// P357: 알림을 눌러 갈 카드가 지금 어디 있나 → 'active'(지금 목록) | 'later'(나중 묶음) | 'gone'(이미 답했거나 닫힘)
export function cardPlace(cards, id) { const d = (cards || []).find((x) => Number(x.id) === Number(id)); return !d ? 'gone' : d.deferred ? 'later' : 'active'; }
// 지금 목록(나중 줄이 아닌 카드)과 나중 줄(때가 이른 것 먼저, 조건 글은 끝)
export const activeCards = (cards) => (cards || []).filter((d) => !d.deferred);
export function laterCards(cards) {
  return (cards || []).filter((d) => d.deferred).sort((a, b) => (a.wakeAt || Infinity) - (b.wakeAt || Infinity) || a.id - b.id);
}
// 카드의 단추 모양: decide(보기·답), do(했음: do와 띄워진 later), check(됐다·안 됐다)
export const actionOf = (d) => (d.kind === 'check' ? 'check' : d.kind === 'decide' ? 'decide' : 'do');
// 미루기 때: 한 시간 뒤, 내일 아침 9시(이 기기 시간대)
export function snoozeTimes(now = Date.now()) {
  const m = new Date(now); m.setDate(m.getDate() + 1); m.setHours(9, 0, 0, 0);
  return { hour: now + 3600 * 1000, morning: m.getTime() };
}
// 날짜 고르기 칸(datetime-local "YYYY-MM-DDTHH:MM") → ms(지금보다 뒤가 아니면 null)
export function pickedTime(value, now = Date.now()) {
  const m = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return null;
  const t = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5])).getTime();
  return Number.isFinite(t) && t > now ? t : null;
}
// datetime-local 칸의 기본값(지금부터 한 시간 뒤, 분은 0)
export function pickDefault(now = Date.now()) {
  const d = new Date(now + 3600 * 1000); d.setMinutes(0, 0, 0);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
// 나중 줄의 때 글: "11/21 15:00"(올해가 아니면 연도 붙임)
export function whenText(at, now = Date.now()) {
  if (!at) return '';
  const d = new Date(at); const n = new Date(now); const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear() !== n.getFullYear() ? d.getFullYear() + '/' : ''}${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
// 확인 메모 칸이 보낼 만한가(빈 메모도 된다, 길이만 본다)
export const noteOk = (text) => typeof text === 'string' && text.trim().length <= 300;
// 카드 하나를 나중 줄로(미루기 직후) / 지금 목록으로(꺼내기 직후)
export const withDeferred = (cards, id, on, wakeAt = null) => (cards || []).map((d) => (d.id === id ? { ...d, deferred: on, wakeAt: on ? wakeAt : null, cond: on ? d.cond : null } : d));

// ---------- P295: 보내는 때(답 실어 보내기) ----------
export const TIMINGS = ['now', 'next'];
// 답하면 세션에 무언가 가는 카드인가(결정·확인·--tell 할 일). 보내는 때 표시는 이 카드에만 단다
export const sendsAnswer = (d) => !!d && (d.kind === 'decide' || d.kind === 'check' || !!d.tell);
// 지금 보일 보내는 때: 사람이 바꾼 값 → 판이 정한 값(카드의 timing) → now
export const timingOf = (d, picked = null) => (TIMINGS.includes(picked) ? picked : d && TIMINGS.includes(d.timing) ? d.timing : 'now');
export const flipTiming = (t) => (t === 'next' ? 'now' : 'next');
// 붙잡은 답만 있고 지금 목록에 카드가 없는 세션(목록 맨 위에 그 줄만 보인다)
export function heldOnly(held, cards) {
  const has = new Set((cards || []).map((d) => d.sessionId));
  return Object.keys(held || {}).filter((sid) => held[sid] > 0 && !has.has(sid));
}
export const heldTotal = (held) => Object.values(held || {}).reduce((a, n) => a + (Number(n) || 0), 0);
