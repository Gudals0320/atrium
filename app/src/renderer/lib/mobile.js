// P353: 휴대폰 전용 간소 페이지(MobileApp.jsx)의 순수 함수(단위 시험 app/test/p353-lib.test.mjs).
// - 줄 모음: phone.subscribe의 답(모두 또는 차이), phone.row·phone.gone 이벤트를 Map(sessionId → 줄)에 넣는다
// - 홈: 응답 필요(오래 기다린 순), 작업 중·작업 완료 수, 작업 완료 목록
// - 세션 목록: 찾기, 고정(이 기기 localStorage), 워크스페이스 묶음(살아 있는 세션 먼저, 잠든 세션은 접어 둔다)
// - 맵: 세션 관계를 들여쓰기 나무로(부모가 다른 워크스페이스에 있으면 그 워크스페이스에서는 뿌리)
// - 빠른 키: 백엔드 session.keys의 허용 키(keys.mjs KEY_NAMES)만
import { needsYou, isBusy, toneOf, lastLineOf } from './phone.js';

export const QUICK_KEYS = ['esc', 'enter', 'up', 'down', '1', '2', '3', 'y', 'n'];
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
