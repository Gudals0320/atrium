// 워크트리 영역(P27, BRIEF "워크스페이스"). 순수 함수만 둔다. 창(renderer)도 이 파일을 그대로 묶어 쓴다(node 모듈을 부르지 않는다).
// - 같은 리포의 살아 있는 워크트리(폴더가 있는 것)마다 본 저장소 영역 옆에 작은 영역을 따로 둔다. 워크스페이스(키, 탭, 사이드바, 내 차례, 잠재우기)는 그대로 하나다.
// - 영역 키(area key): 본 저장소 영역은 워크스페이스 키 그대로, 워크트리 영역은 `<워크스페이스 키>#wt=<워크트리 경로 키>`.
//   영역 계산(canvas.mjs regionsOf, slotInRegion, separateRegions)은 이 키를 워크스페이스 키처럼 다룬다.
// - 노드가 어느 영역에 있는지는 놓을 때 정해 저장한다(nodes.area, convo_nodes.area: 워크트리 경로 키, 본 저장소는 '').
//   지금 폴더가 든 살아 있는 워크트리(가장 긴 경로)가 저장한 영역과 다르면 그 영역의 빈자리로 옮긴다(worktrees.mjs).
// - 본 저장소 영역에서 워크트리 영역으로 브랜치 화살표(테두리에서 테두리로)를 긋는다(branchArrow).
import { pathKey, normPath } from './workspaces.mjs';
import { overlaps, bbox, REGION_GAP } from './canvas.mjs';

export const WT_SEP = '#wt=';
export const WT_EMPTY = { w: 480, h: 200 }; // 안이 빈 워크트리 영역
export const WT_GAP = 200; // 본 영역과 워크트리 영역 사이(화살표가 지나갈 자리)

export const areaKey = (wsKey, wt) => (wt ? `${wsKey}${WT_SEP}${wt}` : wsKey);
// 영역 키 → { ws, wt }(본 저장소 영역이면 wt '')
export function parseArea(k) {
  const s = String(k || '');
  const i = s.indexOf(WT_SEP);
  return i < 0 ? { ws: s || null, wt: '' } : { ws: s.slice(0, i), wt: s.slice(i + WT_SEP.length) };
}
export const wsOfArea = (k) => parseArea(k).ws;

// 창이 쓰는 영역 자리 목록. workspaces: [{ key, x, y, auto, worktrees: [{ wt, area, x, y, branch, path }] }](backend workspaceList)
// → 워크스페이스(그대로)와 워크트리 영역 { key: 영역 키, x, y, empty: WT_EMPTY, wsKey, wt, branch, path }
export function areaAnchorList(workspaces) {
  const out = [];
  for (const w of workspaces || []) {
    out.push(w);
    for (const a of w.worktrees || []) out.push({ key: areaKey(w.key, a.wt), x: a.x, y: a.y, empty: WT_EMPTY, wsKey: w.key, wt: a.wt, branch: a.branch || null, path: a.path || null });
  }
  return out;
}
// (워크스페이스 키, 저장한 area) → 영역 키. 그 워크트리 영역이 없으면(지워진 워크트리) 본 저장소 영역
export function areaResolverOf(workspaces) {
  const live = new Set();
  for (const w of workspaces || []) for (const a of w.worktrees || []) live.add(areaKey(w.key, a.wt));
  return (ws, wt) => { if (!ws || !wt) return ws || null; const k = areaKey(ws, wt); return live.has(k) ? k : ws; };
}

// `git worktree list --porcelain` 출력 → [{ path, key, head, branch, bare, detached, prunable, main }]. 첫 항목이 본 저장소다
export function parseWorktreeList(out) {
  const list = [];
  let cur = null;
  for (const raw of String(out || '').split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (!line) { if (cur) list.push(cur); cur = null; continue; }
    const sp = line.indexOf(' ');
    const k = sp < 0 ? line : line.slice(0, sp), v = sp < 0 ? '' : line.slice(sp + 1);
    if (k === 'worktree') { if (cur) list.push(cur); cur = { path: normPath(v), key: pathKey(v), head: null, branch: null, bare: false, detached: false, prunable: false, locked: false }; continue; }
    if (!cur) continue;
    if (k === 'HEAD') cur.head = v;
    else if (k === 'branch') cur.branch = v.replace(/^refs\/heads\//, '');
    else if (k === 'bare') cur.bare = true;
    else if (k === 'detached') cur.detached = true;
    else if (k === 'prunable') cur.prunable = true;
    else if (k === 'locked') cur.locked = true;
  }
  if (cur) list.push(cur);
  return list.map((w, i) => ({ ...w, main: i === 0 }));
}

// 영역을 따로 둘 워크트리: 본 저장소가 아니고, 맨 저장소(bare)가 아니고, 폴더가 있는 것(exists(path) → bool)
export function liveWorktrees(list, exists = () => true) {
  return list.filter((w) => !w.main && !w.bare && !w.prunable && exists(w.path));
}

// 폴더가 든 워크트리의 키(가장 긴 경로가 이긴다. 본 저장소 안의 .claude/worktrees/<이름>도 워크트리 쪽). 워크트리 밖이면 ''
// wts: [{ key }](살아 있는 워크트리), mainKey: 본 저장소 폴더 키(있으면 그 경로가 워크트리보다 길 때 본 저장소로)
export function worktreeOfPath(cwd, wts, mainKey = null) {
  if (!cwd || !wts || !wts.length) return '';
  const c = pathKey(cwd);
  const inside = (root) => c === root || c.startsWith(root + '/');
  let best = '', len = -1;
  for (const w of wts) if (inside(w.key) && w.key.length > len) { best = w.key; len = w.key.length; }
  if (best && mainKey && inside(mainKey) && mainKey.length > len) return '';
  return best;
}

// 이름표 글: ⎇ 브랜치(브랜치가 없으면 폴더 이름). 폴더 이름이 브랜치와 다르면 함께 보인다
export function worktreeLabel(w) {
  const folder = normPath(w.path || '').split('/').filter(Boolean).pop() || '';
  const branch = w.branch || (w.detached ? (w.head ? w.head.slice(0, 7) : 'detached') : '') || folder;
  return { branch, folder: folder && folder !== branch && !branch.endsWith('/' + folder) && !branch.endsWith('-' + folder) ? folder : '' };
}

// 새 워크트리 영역의 자리. main: 본 저장소 영역(사각형), sats: 이 리포의 다른 워크트리 영역들, others: 다른 모든 영역(사각형)
// 본 영역 오른쪽 열을 위부터(이미 있는 워크트리 영역 아래), 그다음 그 열 오른쪽, 그다음 본 영역 아래. 다른 영역과 REGION_GAP/2 넘게 띄운다.
// 빈자리가 없으면 오른쪽 열 맨 아래(겹침은 부르는 쪽이 settleRegions로 푼다)
export function areaSlot({ main, sats = [], others = [], size = WT_EMPTY, gap = WT_GAP }) {
  if (!main) return { x: 0, y: 0 };
  const all = [...sats, ...others, main].filter(Boolean);
  const free = (c) => !all.some((r) => overlaps({ ...c, w: size.w, h: size.h }, r, REGION_GAP / 2 - 1));
  const colX = main.x + main.w + gap;
  const cands = [{ x: colX, y: main.y }];
  const col = sats.filter((s) => s.x >= main.x + main.w).sort((a, b) => a.y - b.y);
  for (const s of col) cands.push({ x: s.x, y: s.y + s.h + REGION_GAP / 2 });
  for (const s of col) cands.push({ x: s.x + s.w + REGION_GAP / 2, y: s.y });
  cands.push({ x: main.x, y: main.y + main.h + gap });
  for (const s of sats.filter((q) => q.y >= main.y + main.h)) cands.push({ x: s.x + s.w + REGION_GAP / 2, y: s.y });
  for (const c of cands) if (free(c)) return { x: Math.round(c.x), y: Math.round(c.y) };
  const low = bbox([main, ...col]);
  return { x: Math.round(colX), y: Math.round(low.y + low.h + REGION_GAP / 2) };
}

// 브랜치 화살표의 끝점. from: 본 저장소 영역, to: 워크트리 영역(둘 다 테두리 사각형). → { x1, y1, x2, y2, dir: 'h' | 'v' }
// 워크트리 영역이 오른쪽(가로 틈이 세로 틈보다 크다)이면 본 영역 오른쪽 테두리에서 워크트리 영역 왼쪽 테두리로, 아래면 아래 테두리에서 위 테두리로.
// 끝은 워크트리 영역의 이름표 쪽(위에서 head 만큼)에 닿고, 시작은 그 높이(너비)를 본 영역 안으로 맞춘 곳. 왼쪽·위면 반대 테두리
export function branchArrow(from, to, { head = 48, inset = 24 } = {}) {
  if (!from || !to) return null;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const gx = Math.max(to.x - (from.x + from.w), from.x - (to.x + to.w));
  const gy = Math.max(to.y - (from.y + from.h), from.y - (to.y + to.h));
  if (gx >= gy) {
    const right = to.x + to.w / 2 >= from.x + from.w / 2;
    const y2 = to.y + Math.min(head, to.h / 2);
    const y1 = clamp(y2, from.y + inset, from.y + from.h - inset);
    return right ? { x1: from.x + from.w, y1, x2: to.x, y2, dir: 'h' } : { x1: from.x, y1, x2: to.x + to.w, y2, dir: 'h' };
  }
  const down = to.y + to.h / 2 >= from.y + from.h / 2;
  const x2 = to.x + Math.min(head * 2, to.w / 2);
  const x1 = clamp(x2, from.x + inset, from.x + from.w - inset);
  return down ? { x1, y1: from.y + from.h, x2, y2: to.y, dir: 'v' } : { x1, y1: from.y, x2, y2: to.y + to.h, dir: 'v' };
}

// 화살표 곡선(SVG path d)과 화살촉(끝점에서 들어오는 방향). ox, oy: 그리는 상자의 왼쪽 위(판 좌표)
export function arrowPath(a, ox = 0, oy = 0, { tip = 18 } = {}) {
  const x1 = a.x1 - ox, y1 = a.y1 - oy, x2 = a.x2 - ox, y2 = a.y2 - oy;
  const sx = Math.sign(x2 - x1) || 1, sy = Math.sign(y2 - y1) || 1;
  // 화살촉 길이만큼 덜 가서 곡선을 끝내고, 화살촉이 테두리에 닿는다
  const ex = a.dir === 'h' ? x2 - sx * tip : x2, ey = a.dir === 'h' ? y2 : y2 - sy * tip;
  const k = a.dir === 'h' ? Math.max(40, Math.abs(ex - x1) / 2) : Math.max(40, Math.abs(ey - y1) / 2);
  const d = a.dir === 'h' ? `M ${x1} ${y1} C ${x1 + sx * k} ${y1}, ${ex - sx * k} ${ey}, ${ex} ${ey}` : `M ${x1} ${y1} C ${x1} ${y1 + sy * k}, ${ex} ${ey - sy * k}, ${ex} ${ey}`;
  const w = tip * 0.55;
  const head = a.dir === 'h' ? `M ${x2} ${y2} L ${ex} ${ey - w} L ${ex} ${ey + w} Z` : `M ${x2} ${y2} L ${ex - w} ${ey} L ${ex + w} ${ey} Z`;
  return { d, head, mid: { x: (x1 + x2) / 2, y: (y1 + y2) / 2 } };
}
