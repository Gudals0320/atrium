// P353: 휴대폰 전용 간소 페이지(MobileApp.jsx)의 순수 함수(단위 시험 app/test/p353-lib.test.mjs).
// - 줄 모음: phone.subscribe의 답(모두 또는 차이), phone.row·phone.gone 이벤트를 Map(sessionId → 줄)에 넣는다
// - 홈: 응답 필요(오래 기다린 순), 작업 중·작업 완료 수, 작업 완료 목록
// - 세션 목록: 찾기, 고정(이 기기 localStorage), 워크스페이스 묶음(살아 있는 세션 먼저, 잠든 세션은 접어 둔다)
// - 맵: 세션 관계를 들여쓰기 나무로(부모가 다른 워크스페이스에 있으면 그 워크스페이스에서는 뿌리)
// - 빠른 키: 백엔드 session.keys의 허용 키(keys.mjs KEY_NAMES)만
// - P355: 세션 화면의 키 줄(늘 보이는 한 줄 + 펼치는 두 줄), 화면 높이(pageBox)
// - P358: 세션 화면은 터미널만. 응답(기다리는 요청·할 일 카드)은 오른쪽 아래 작은 단추(overlayButton) → 겹친 카드 넘기기(overlayPages)
import { needsYou, isBusy, toneOf, lastLineOf, screenBox, kbOpenOf, TALL_GAP_MAX } from './phone.js';

// P355: 키 줄. 늘 보이는 한 줄(KEY_MAIN, 앞에 펼침 단추)과 펼치면 보이는 두 줄(KEY_MORE). 모두 session.keys 이름으로 보낸다
// (판이 패널 바이트로 바꾼다. 터미널을 붙이지 않은 답 보기에서도 된다). 숫자는 응답 필요일 때 노랗게
export const KEY_MAIN = ['esc', 'enter', 'up', 'down', '1', '2', '3'];
export const KEY_MORE = ['ctrl+c', 'tab', 'shift+tab', 'left', 'right', '4', 'backspace', 'y', 'n', 'slash', 'space'];
export const MOBILE_KEYS = [...KEY_MAIN, ...KEY_MORE];
export const KEY_GLYPH = { esc: 'Esc', enter: '⏎', up: '↑', down: '↓', left: '←', right: '→', 'ctrl+c': 'Ctrl C', tab: 'Tab', 'shift+tab': '⇧Tab', backspace: '⌫', slash: '/', space: 'Space' };
export const KEY_WIDE = { backspace: 2, space: 3 }; // 여러 칸을 쓰는 키
export const keyId = (k) => String(k).replace(/\+/g, '_'); // 사전 열쇠(mobile.key_ctrl_c)
export const isNumKey = (k) => /^[0-9]$/.test(k);
export const KEYS_OPEN_KEY = 'mt.mobileKeysOpen'; // 키 줄을 펼쳐 둘까(이 기기)
// 터미널을 붙일 수 있는 세션(잠들었거나 끝났으면 터미널 대신 깨우기·끝남 안내)
export const isLive = (s) => !!s && s.state !== 'sleeping' && s.state !== 'exited';

// P358: 오른쪽 아래 작은 단추. 기다리는 요청(권한·질문)이 있으면 노란 "응답 필요", 할 일 카드만 있으면 하늘색 "할 일 n", 둘 다 없으면 없음
export function overlayButton({ need = false, todos = 0 } = {}) {
  const n = Math.max(0, todos | 0);
  if (need) return { kind: 'need', n: n + 1 };
  if (n > 0) return { kind: 'todo', n };
  return null;
}
// 겹친 카드의 차례: 기다리는 요청이 맨 앞, 그 뒤 할 일 카드(받은 차례). 넘기기(‹ i/n ›)의 쪽 수
export function overlayPages({ need = false, todos = [] } = {}) {
  return [...(need ? [{ kind: 'ask', key: 'ask' }] : []), ...(todos || []).map((d) => ({ kind: 'todo', key: 'todo-' + d.id, d }))];
}
// 지금 쪽 번호를 쪽 수 안으로(카드가 줄면 앞으로)
export const clampPage = (i, n) => (n > 0 ? Math.min(Math.max(0, i | 0), n - 1) : 0);
// 겹친 카드 높이 상한: 터미널 칸 높이의 절반(넘으면 카드 안에서 스크롤)
export const OVERLAY_MAX_FRAC = 0.5;
export const overlayMaxPx = (areaH) => Math.max(120, Math.floor((areaH || 0) * OVERLAY_MAX_FRAC));
// 겹친 카드의 보기 단추 글: 짧게(두 줄 안에 들어가게, 전체 글은 title)
export const OVERLAY_CHOICE_CHARS = 16;
export function readFlag(st, key) { try { return !!st && st.getItem(key) === '1'; } catch { return false; } }

// P355: 페이지 높이. screenBox(P83: 홈 화면 앱이 창 높이를 짧게 주면 화면 높이)에 더해, 보이는 높이(분수 px, dpr 3)는
// 반올림하지 않고 내린다(올리면 아래 끝이 보이는 영역 밖으로 0.5px까지 밀린다). 보이는 높이가 창 높이보다 크면 창 높이를 쓴다
// P358: 홈 화면 앱(standalone)은 브라우저 막대가 없다. 키보드가 닫혀 있으면(이 방향에서 본 가장 큰 높이 tallest로 판단, kbOpenOf)
//   창·보이는 높이·보이는 위치(offsetTop)가 어떻게 오든 화면 높이를 쓴다. 실기기(iPhone 15 홈 화면 앱)는 창 852, 문서 793을 주고
//   키보드를 닫은 뒤에는 보이는 위치가 0이 아닌 채 남거나 창이 793으로 줄어 P355 규칙이 화면 높이를 놓쳤다.
//   보이는 위치(offsetTop)가 남아 있으면 그만큼 내려 그린다(top). 페이지는 그 스크롤을 0으로 되돌린다(MobileApp.jsx fit)
export function pageBox({ vv, innerHeight, innerWidth, screenW, screenH, standalone = false, tallest = 0 }) {
  if (standalone && screenW > 0 && screenH > 0) {
    const vh = vv && vv.height > 0 ? vv.height : innerHeight || 0;
    const full = Math.round((innerHeight || 0) >= (innerWidth || 0) ? Math.max(screenW, screenH) : Math.min(screenW, screenH));
    const kb = kbOpenOf({ vvHeight: vh, innerHeight, tallest: Math.max(tallest || 0, full) });
    const short = full - Math.min(Math.floor(vh), Math.round(innerHeight || vh));
    if (!kb && short >= 0 && short <= TALL_GAP_MAX) return { height: full, top: Math.max(0, Math.round((vv && vv.offsetTop) || 0)), ...(short > 0 ? { tall: short } : {}), full: true };
    if (kb) return { height: Math.max(0, Math.floor(vh)), top: Math.max(0, Math.round((vv && vv.offsetTop) || 0)), kb: true };
  }
  const b = screenBox({ vv, innerHeight, innerWidth, screenW, screenH, standalone });
  if (b.tall) return b;
  const raw = vv && vv.height > 0 ? Math.min(vv.height, innerHeight > 0 ? innerHeight : vv.height) : innerHeight || 0;
  return { height: Math.max(0, Math.floor(raw)), top: b.top };
}
export const PINS_KEY = 'mt.mobilePins';
export const TAB_KEY = 'mt.mobileTab';
export const OPEN_GROUPS_KEY = 'mt.mobileGroups';
export const TREE_LIMIT = 12; // 워크스페이스 나무에서 접기 전에 보이는 줄
export { needsYou, isBusy, toneOf };

// 줄 모음에 phone.subscribe 답을 넣는다 → { rows, rev, boot }
export function applySync(prev, r) {
  const rows = r.full || !prev ? new Map() : new Map(prev.rows);
  for (const row of r.rows || []) rows.set(row.sessionId, row);
  if (!r.full) for (const id of r.gone || []) rows.delete(id);
  return { rows, rev: r.rev, boot: r.boot };
}
// 이벤트 하나(phone.row {rev, row}, phone.gone {rev, sessionId}). 옛 rev(이미 받은 것)는 버린다
export function applyRow(prev, ev) {
  if (!ev || !ev.row || (prev.rev != null && ev.rev <= prev.rev)) return prev;
  const rows = new Map(prev.rows);
  rows.set(ev.row.sessionId, ev.row);
  return { ...prev, rows, rev: Math.max(prev.rev || 0, ev.rev) };
}
export function applyGone(prev, ev) {
  if (!ev || !prev.rows.has(ev.sessionId)) return { ...prev, rev: Math.max(prev.rev || 0, (ev && ev.rev) || 0) };
  const rows = new Map(prev.rows); rows.delete(ev.sessionId);
  return { ...prev, rows, rev: Math.max(prev.rev || 0, ev.rev || 0) };
}

const asleep = (s) => s.state === 'sleeping' || s.state === 'exited';
export const isDone = (s) => !!s && !!s.unseen && s.state === 'ready';
const waitAt = (s) => s.waitingSince || (s.ask && s.ask.since) || s.lastActivityAt || s.createdAt || 0;
const byName = (a, b) => String(a.name).localeCompare(String(b.name));
const byStart = (a, b) => (a.createdAt || 0) - (b.createdAt || 0) || byName(a, b);
const byRecent = (a, b) => (b.lastActivityAt || 0) - (a.lastActivityAt || 0) || byName(a, b);

// 홈: 응답 필요·작업 중·작업 완료
export function homeOf(rows) {
  const all = [...rows.values()];
  const needs = all.filter(needsYou).sort((a, b) => waitAt(a) - waitAt(b) || byName(a, b));
  const working = all.filter((s) => !needsYou(s) && isBusy(s)).sort(byStart);
  const done = all.filter((s) => !needsYou(s) && isDone(s)).sort(byRecent);
  return { needs, working, done, counts: { need: needs.length, work: working.length, done: done.length } };
}

// 찾기: 이름·워크스페이스 이름·마지막 한 줄(대소문자 무시)
export function matches(s, q, wsName = () => '') {
  const t = String(q || '').trim().toLowerCase();
  if (!t) return true;
  return [s.name, wsName(s.workspaceKey), s.line && s.line.text, s.model].some((x) => String(x || '').toLowerCase().includes(t));
}
export const FILTERS = { need: needsYou, work: (s) => !needsYou(s) && isBusy(s), done: (s) => !needsYou(s) && isDone(s) };

// 세션 목록 → { pinned, groups: [{ key, name, live, sleeping, total }] }. 워크스페이스는 판 순서, 모르는 키는 그 뒤, 키가 없는 것은 맨 끝
export function listOf(rows, workspaces = [], { query = '', pins = [], filter = null } = {}) {
  const names = new Map(workspaces.map((w) => [w.key, w.name]));
  const wsName = (k) => names.get(k) || (k ? String(k).split('/').filter(Boolean).slice(-1)[0] : '');
  const f = filter && FILTERS[filter];
  const all = [...rows.values()].filter((s) => matches(s, query, wsName) && (!f || f(s)));
  const pinSet = new Set(pins);
  const pinned = pins.map((id) => all.find((s) => s.sessionId === id)).filter(Boolean);
  const order = new Map(workspaces.map((w, i) => [w.key, i]));
  const by = new Map();
  for (const s of all) { const k = s.workspaceKey || null; if (!by.has(k)) by.set(k, []); by.get(k).push(s); }
  const rank = (s) => (needsYou(s) ? 0 : isBusy(s) ? 1 : isDone(s) ? 2 : 3);
  const groups = [...by.entries()].map(([key, list]) => {
    const live = list.filter((s) => !asleep(s)).sort((a, b) => rank(a) - rank(b) || byStart(a, b));
    const sleeping = list.filter(asleep).sort(byRecent);
    return { key, name: key ? wsName(key) : null, live, sleeping, total: list.length, need: list.filter(needsYou).length };
  }).sort((a, b) => (a.key == null) - (b.key == null) || (order.get(a.key) ?? 1e9) - (order.get(b.key) ?? 1e9) || String(a.name).localeCompare(String(b.name)));
  return { pinned, groups, total: all.length, pinSet };
}

export function togglePin(pins, id) { const list = [...(pins || [])]; const i = list.indexOf(id); if (i >= 0) list.splice(i, 1); else list.unshift(id); return list.slice(0, 30); }
export function readList(storage, key) { try { const v = JSON.parse(storage.getItem(key) || '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []; } catch { return []; } }

// 맵: 워크스페이스마다 깊이 우선 나무 → [{ key, name, items: [{ s, depth, guides }] }]
// guides: 깊이만큼의 칸. 'line'(위 갈래가 아래로 이어짐), 'blank', 마지막 칸은 'elbow'(형제가 더 있음) 또는 'elbow end'
export function treeOf(rows, workspaces = []) {
  const names = new Map(workspaces.map((w) => [w.key, w.name]));
  const order = new Map(workspaces.map((w, i) => [w.key, i]));
  const all = [...rows.values()];
  const by = new Map();
  for (const s of all) { const k = s.workspaceKey || null; if (!by.has(k)) by.set(k, []); by.get(k).push(s); }
  const out = [];
  for (const [key, list] of by) {
    const ids = new Set(list.map((s) => s.sessionId));
    const kids = new Map();
    const roots = [];
    for (const s of list) {
      const p = s.parentSessionId && s.parentSessionId !== s.sessionId && ids.has(s.parentSessionId) ? s.parentSessionId : null;
      if (p) { if (!kids.has(p)) kids.set(p, []); kids.get(p).push(s); } else roots.push(s);
    }
    const items = [];
    const seen = new Set();
    const walk = (s, depth, trail) => {
      if (seen.has(s.sessionId)) return; seen.add(s.sessionId);
      items.push({ s, depth, guides: trail });
      const ch = (kids.get(s.sessionId) || []).sort(byStart);
      ch.forEach((c, i) => { const last = i === ch.length - 1; walk(c, depth + 1, [...trail.map((g) => (g === 'elbow' ? 'line' : g === 'elbow end' ? 'blank' : g)), last ? 'elbow end' : 'elbow']); });
    };
    // 살아 있는 뿌리 먼저, 잠든 뿌리는 뒤로(나무 안의 차례는 띄운 순)
    roots.sort((a, b) => (asleep(a) ? 1 : 0) - (asleep(b) ? 1 : 0) || byStart(a, b)).forEach((r) => walk(r, 0, []));
    for (const s of list) if (!seen.has(s.sessionId)) walk(s, 0, []); // 고리(부모가 서로)는 뿌리로
    out.push({ key, name: key ? names.get(key) || String(key).split('/').filter(Boolean).slice(-1)[0] : null, items, need: list.filter(needsYou).length });
  }
  return out.sort((a, b) => (a.key == null) - (b.key == null) || (order.get(a.key) ?? 1e9) - (order.get(b.key) ?? 1e9));
}

// 세션 화면을 다시 받을까(줄이 바뀐 것 가운데 화면에 보이는 것)
export function detailStale(prev, next) {
  if (!prev || !next) return !!next;
  return prev.state !== next.state || prev.lastAnswerAt !== next.lastAnswerAt || prev.lastActivityAt !== next.lastActivityAt
    || ((prev.ask && prev.ask.toolUseId) || null) !== ((next.ask && next.ask.toolUseId) || null);
}

// 기록 더 보기: 앞에 붙인다(같은 seq는 한 번)
export function mergeHistory(cur, items) {
  const seen = new Set((cur || []).map((x) => x.seq));
  return [...(items || []).filter((x) => !seen.has(x.seq)), ...(cur || [])];
}

// 홈 카드의 번호 단추: 요청의 보기(choices)가 있으면 그 번호와 짧은 글, 없으면 1·2·3
export function choiceButtons(ask, max = 4) {
  const ch = ask && Array.isArray(ask.choices) && ask.choices.length ? ask.choices : null;
  if (!ch) return ['1', '2', '3'].map((k) => ({ key: k, label: k }));
  return ch.filter((c) => /^[1-9]$/.test(String(c.n))).slice(0, max).map((c) => ({ key: String(c.n), label: String(c.label || ''), short: shortChoice(c.label) }));
}
// 보기 글 줄이기: "Yes, and always allow …" → "Yes, and always…"(18자)
export function shortChoice(label, n = 14) { const t = String(label || '').trim(); return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t; }

// 휴대폰 글자 크기(옛 휴대폰 화면 mt.phoneTermScale, 기본 0.8) → 페이지 배율(0.75~1.5)
export const uiFactor = (scale, base = 0.8) => Math.min(1.5, Math.max(0.75, Math.round((Number(scale) || base) / base * 100) / 100));

export { lastLineOf };

// P358: 배치 값을 남길 화면 이름(화면마다 한 번: 홈 탭·세션 목록·맵·세션 화면·키보드 열림)
export const LAY_SCREENS = ['home', 'sessions', 'map', 'session', 'kb'];
export function layScreen({ view, kb = false } = {}) {
  if (kb) return 'kb';
  return LAY_SCREENS.includes(view) ? view : null;
}
