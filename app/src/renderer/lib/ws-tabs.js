// P98: 위 바의 워크스페이스 칩. 묶음(사람이 만든 가상 그룹 P44, 저절로 만든 폴더 묶음 P91)에 든 워크스페이스는 대표 칩 하나로 모은다.
// 순수 함수만 둔다(단위 시험 app/test/p98-lib.test.mjs).
// - 칩 순서는 워크스페이스 목록 순서이고, 묶음 칩은 그 묶음의 첫 구성이 있던 자리에 놓는다.
// - 판에 있는 구성이 둘 이상인 묶음만 모은다. 하나뿐이면 그 워크스페이스 칩 그대로다(펼칠 것이 없다).
// - 묶음 안 순서는 그룹의 구성 순서(사람이 정한 순서, 저절로 만든 묶음은 상대 경로 순)다.
import { workspaceCounts } from '../../../../backend/src/workspaces.mjs';

// workspaces: [{ key, … }], groups: [{ id, name, members, auto?, root? }]
// → [{ type: 'ws', key, w } | { type: 'group', id, name, auto, root, keys: [워크스페이스 키], ws: [워크스페이스] }]
export function wsTabs(workspaces, groups) {
  const list = (workspaces || []).filter((w) => w && w.key);
  const byKey = new Map(list.map((w) => [w.key, w]));
  const groupOf = new Map();
  for (const g of groups || []) {
    if (!g || !Array.isArray(g.members)) continue;
    const keys = g.members.filter((k) => byKey.has(k) && !groupOf.has(k));
    if (keys.length < 2) continue;
    const tab = { type: 'group', id: g.id, name: g.name, auto: !!g.auto, root: g.root || null, keys, ws: keys.map((k) => byKey.get(k)) };
    for (const k of keys) groupOf.set(k, tab);
  }
  const out = [];
  const placed = new Set();
  for (const w of list) {
    const g = groupOf.get(w.key);
    if (!g) { out.push({ type: 'ws', key: w.key, w }); continue; }
    if (placed.has(g.id)) continue;
    placed.add(g.id);
    out.push(g);
  }
  return out;
}

// 이전·다음 워크스페이스(←·→)의 순서: 칩 순서 그대로, 묶음 칩 자리에는 그 구성을 묶음 안 순서로 편다
export const tabKeys = (tabs) => (tabs || []).flatMap((t) => (t.type === 'group' ? t.keys : [t.key]));

// 워크스페이스 여럿의 세는 값 합(workspaceCounts와 같은 칸)
export function sumCounts(sessions, keys) {
  const c = { sessions: 0, working: 0, needsYou: 0, review: 0, shells: 0 };
  for (const k of keys || []) { const x = workspaceCounts(sessions, k); for (const f of Object.keys(c)) c[f] += x[f]; }
  return c;
}

// 지금 고른 워크스페이스가 든 칩(묶음 칩이면 그 묶음). 없으면 null
export const tabOf = (tabs, key) => (tabs || []).find((t) => (t.type === 'group' ? t.keys.includes(key) : t.key === key)) || null;

// 묶음 칩을 누르면 고를 워크스페이스: 지금 고른 것이 묶음 안이면 그대로, 아니면 그 묶음에서 마지막으로 고른 것, 그것도 없으면 첫 구성
export function groupPick(tab, current, last = null) {
  if (!tab || tab.type !== 'group' || !tab.keys.length) return null;
  if (tab.keys.includes(current)) return current;
  if (last && tab.keys.includes(last)) return last;
  return tab.keys[0];
}

// 묶음 안 워크스페이스의 이름(펼친 목록과 칩 title에 쓴다): 저절로 만든 묶음은 뿌리에서의 상대 경로(label), 그 밖은 워크스페이스 이름
export const memberLabel = (w) => (w && (w.label || w.name)) || '';

// P212: 묶음 칩이 보일 것. 칩 글은 묶음(폴더) 이름뿐이고, 지금 워크스페이스(cur)는 켜짐과 title에만 쓴다(칩이 그 이름만큼 길어지지 않게)
export function groupChipView(tab, current) {
  const on = !!(tab && tab.type === 'group' && tab.keys.includes(current));
  const cur = on ? tab.ws.find((w) => w.key === current) || null : null;
  return { on, cur, text: (tab && tab.name) || '' };
}

// ---------- P214: 탭 줄 나누기와 배경 모양 ----------
// 탭 묶음(.mt-seg)은 한 줄에 들어가면 1행, 넘칠 때만 2행으로 감싸고, 2행도 넘치면 끝에서부터(켜진 탭 빼고) 숨겨 "+n" 칩에 모은다.

// 폭 목록을 한 줄 폭(avail)에 차례대로 채워 줄로 나눈다(flex-wrap과 같음). → [[번호…], …]
export function wrapRows(widths, avail, gap = 2) {
  const rows = [];
  let row = null, used = 0;
  (widths || []).forEach((w, i) => {
    if (row && used + gap + w <= avail) { row.push(i); used += gap + w; return; }
    row = [i]; used = w; rows.push(row);
  });
  return rows;
}

// 숨길 탭 고르기. widths: 탭 칩 폭(순서대로), on: 켜진 탭 번호(-1 없음), avail: 탭 묶음 안쪽 폭, moreW: "+n" 칩 폭, tailW: 끝의 + 단추 폭
// → { hidden: [번호…](숨길 탭), rows: 줄 수 }. 켜진 탭은 숨기지 않는다. 0.5px 여유를 둔다(브라우저 반올림)
export function fitTabs({ widths = [], on = -1, avail = Infinity, gap = 2, moreW = 34, tailW = 26, maxRows = 2 } = {}) {
  const lim = avail - 0.5;
  const rowsOf = (hid) => {
    const ws = widths.filter((w, i) => !hid.has(i));
    if (hid.size) ws.push(moreW);
    ws.push(tailW);
    return wrapRows(ws, lim, gap).length;
  };
  const hid = new Set();
  let rows = rowsOf(hid);
  for (let i = widths.length - 1; i >= 0 && rows > maxRows; i--) {
    if (i === on) continue;
    hid.add(i);
    rows = rowsOf(hid);
  }
  return { hidden: [...hid].sort((a, b) => a - b), rows };
}

// 탭 줄 배경 모양(SVG 경로). rights: 줄마다 오른쪽 끝(묶음 왼쪽부터 px), ys: 줄 사이 경계 y(줄 수 − 1개), H: 높이.
// 바깥 모서리 반지름 R(알약과 같은 13), 두 줄이 만나는 안쪽 모서리는 오목하게 r(9). 이웃한 두 줄 끝 차이가 R + r(22px)보다 작으면
// 긴 쪽에 맞춰 한 상자로 그린다(작은 턱은 흠처럼 보인다). → { d, w: 맞춘 뒤 줄 폭 }
export function stairPath(rights, ys, H, { R = 13, r = 9 } = {}) {
  const w = (rights || []).map((x) => Math.round(x));
  if (!w.length) return { d: '', w };
  for (let i = 0; i < w.length - 1; i++) if (Math.abs(w[i] - w[i + 1]) < R + r) { const m = Math.max(w[i], w[i + 1]); w[i] = m; w[i + 1] = m; }
  // 앞에서 맞춘 값이 뒤에서 다시 바뀌었으면 한 번 더 맞춘다(3줄 이상일 때)
  for (let i = w.length - 2; i >= 0; i--) if (Math.abs(w[i] - w[i + 1]) < R + r) { const m = Math.max(w[i], w[i + 1]); w[i] = m; w[i + 1] = m; }
  const A = (rad, sweep, x, y) => ` A ${rad} ${rad} 0 0 ${sweep} ${x} ${y}`;
  let d = `M ${R} 0 H ${w[0] - R}${A(R, 1, w[0], R)}`;
  for (let i = 0; i < w.length - 1; i++) {
    const a = w[i], b = w[i + 1], y = Math.round(ys[i]);
    if (a === b) continue;
    if (b < a) d += ` V ${y - R}${A(R, 1, a - R, y)} H ${b + r}${A(r, 0, b, y + r)}`;
    else d += ` V ${y - r}${A(r, 0, a + r, y)} H ${b - R}${A(R, 1, b, y + R)}`;
  }
  const L = w[w.length - 1];
  d += ` V ${H - R}${A(R, 1, L - R, H)} H ${R}${A(R, 1, 0, H - R)} V ${R}${A(R, 1, R, 0)} Z`;
  return { d, w };
}
