// P147: 미션 맵 "부대(squads)" 배치. 순수 함수만 둔다(단위 시험 test/p147-lib.test.mjs). 그리기는 MissionSquads.jsx.
// 지킬 의미(P147 작업 파일): 팀 나무와 관계 종류, 나를 기다리는 것, 폴더 > 워크스페이스, 세션의 정체, 이동. 모양은 옛 지도(lib/mission-layout.js)와 다르다:
// - 위 "기다리는 일" 줄(dockOf): 응답 필요·오류를 먼저, 그다음 작업 완료(확인할 결과). 지도 칸 밖이라 늘 보인다.
// - 아래는 신문처럼 세로 기둥 여럿(columns). 읽는 차례(위 → 아래, 왼쪽 → 오른쪽)는 폴더 차례 그대로이고, 기둥 높이가 고르도록 워크스페이스 경계에서만 나눈다
//   (선형 분할: 가장 높은 기둥을 가장 낮게 하는 높이를 이분 탐색). 폴더가 두 기둥에 걸치면 다음 기둥에 폴더 머리를 다시 단다(cont).
// - 폴더(사이드바 가상 그룹)는 테두리 있는 틀, 그 안에 워크스페이스 판. 폴더 밖 워크스페이스는 판만.
// - 워크스페이스 판 안: 팀마다 한 장의 "부대" 카드(머리 = 리드: 번호·이름·지금 하는 일·팀 구성 막대, 아래 = 하위 세션 줄, 깊이마다 들여쓰고 나무 선),
//   그다음 혼자인 세션 줄. 쉬는(쉼·잠듦·끝남) 잎 하위가 foldMin개 이상이면 알약 묶음 한 줄(fold)로 접는다. 혼자인 쉬는 세션도 같다.
// - 나무 선(guides): 부모 동그라미 아래에서 내려와 하위 줄로 꺾인다. 관계 종류(rel: spawn 띄움 / role 역할 / prompt 시킴)는 선 모양, 다른 워크스페이스는 cross.
// - 나무 밖 연결(links: 시킴·역할 연결 등)은 줄의 작은 칩(→ 이름, ← 이름)과, 가리킬 때만 그리는 곡선(창이 links의 from·to 줄 자리로 그린다).
// - 모든 줄의 자리(x, y, w, h)가 여기서 정해진다(창은 그대로 놓기만). 거르기는 자리를 바꾸지 않는다.
// → { width, height, cols, colW, folders: [틀], blocks: [워크스페이스 판], squads: [부대 카드], rows: [줄], byId: Map id → 줄, guides: [선], links: [나무 밖 연결], order: [id](읽는 차례), teamNo: Map 뿌리 id → 번호, tree }
import { missionTree, relOf, groupedOrder, bySpawn, nodeTier, restTier } from './mission-model.js';

// 4·8 단위. head = 부대 머리(리드 두 줄), row = 하위 줄, fold = 알약 묶음 한 줄 높이, chipW = 알약 폭(이름은 줄임표), indent = 깊이 한 단
export const ROSTER = { colMin: 400, colMax: 600, gap: 16, pad: 16, fHead: 30, fPad: 8, fGap: 14, wsHead: 28, wsPad: 8, head: 52, row: 30, fold: 30, chipW: 112, chipGap: 6, squadGap: 8, blockGap: 10, indent: 20, foldMin: 3 };

const sum = (a) => a.reduce((s, x) => s + x, 0);

// 접은 알약 묶음의 높이: 한 줄에 들어가는 알약 수로 줄 수를 센다
export function foldHeight(n, width, R = ROSTER) {
  const per = Math.max(1, Math.floor((width + R.chipGap) / (R.chipW + R.chipGap)));
  return Math.ceil(Math.max(1, n) / per) * R.fold;
}

// 위 "기다리는 일" 줄: ids(읽는 차례)에서 응답 필요·오류를 먼저, 그다음 작업 완료
export function dockOf(ids, tierOfId) {
  const first = ids.filter((id) => { const t = tierOfId(id); return t === 'turn' || t === 'alert'; });
  const done = ids.filter((id) => tierOfId(id) === 'review');
  return [...first, ...done];
}

// 블록 높이들(hs, 앞 머리 비용 headOf(i, first))을 기둥 cols개 이하로 차례대로 나눈다. 가장 높은 기둥을 가장 낮게 → [[블록 번호]]
export function partition(items, cols, costOf) {
  const n = items.length;
  if (!n) return [];
  const place = (H) => {
    const out = [[]]; let h = 0;
    for (let i = 0; i < n; i++) {
      const cur = out[out.length - 1];
      const add = costOf(i, cur.length === 0, cur.length ? cur[cur.length - 1] : -1);
      if (cur.length && h + add > H) {
        out.push([i]); h = costOf(i, true, -1);
      } else { cur.push(i); h += add; }
    }
    return out;
  };
  const total = sum(items.map((_, i) => costOf(i, true, -1)));
  let lo = Math.max(...items.map((_, i) => costOf(i, true, -1))), hi = total;
  while (hi - lo > 1) { const mid = Math.floor((lo + hi) / 2); if (place(mid).length <= cols) hi = mid; else lo = mid; }
  const a = place(lo);
  return a.length <= cols ? a : place(hi);
}

// opt: collapsed(접은 워크스페이스 키), order(판의 워크스페이스 차례), vgroups(P44 가상 그룹 = 사이드바 폴더), tiers(Map id → 등급), width(지도 칸 폭)
export function rosterLayout(graph, { collapsed = [], order: order0 = [], vgroups = [], tiers = null, width = 1300, fit = 0 } = {}, R = ROSTER) {
  const { order, groupOf: vgOf } = groupedOrder(order0, vgroups);
  const tree = missionTree(graph);
  const { byId } = tree;
  const tierOf = (id) => (tiers && tiers.has(id) ? tiers.get(id) : nodeTier(byId.get(id)));
  const kidsOf = (id) => tree.kids.get(id) || [];
  const wsOf = (id) => (byId.get(id) || {}).workspaceKey || '';
  const shut = new Set(collapsed);

  // 워크스페이스 차례: 판 차례(폴더끼리 붙인 것), 없는 키는 이름 순, '' 는 끝
  const rankOf = (k) => { const i = order.indexOf(k); return i < 0 ? order.length : i; };
  const roots = tree.nodes.filter((n) => !tree.parent.has(n.id)).sort(bySpawn);
  const keys = [...new Set(roots.map((n) => n.workspaceKey || ''))].sort((a, b) => rankOf(a) - rankOf(b) || (a === '') - (b === '') || a.localeCompare(b));

  // 기둥 수와 폭: 블록이 적으면 기둥도 적게(한 기둥이 colMax보다 넓어지지 않는다)
  const inner = Math.max(R.colMin, width - R.pad * 2);
  const maxCols = Math.max(1, Math.floor((inner + R.gap) / (R.colMin + R.gap)));
  const cols = Math.max(1, Math.min(maxCols, keys.length || 1));
  const colW = Math.min(R.colMax, Math.floor((inner - (cols - 1) * R.gap) / cols));

  // 워크스페이스 판의 줄 목록(자리 없이): 부대마다 { root, rows: [{ id, depth, kind, ids?, h }] }, 혼자인 줄
  const teamNo = new Map();
  let teamN = 0;
  const cardW = (inF) => colW - (inF ? R.fPad * 2 : 0) - R.wsPad * 2;
  const blocks0 = keys.map((key) => {
    const vg = vgOf.get(key) || null;
    const mine = roots.filter((n) => (n.workspaceKey || '') === key);
    const teams = mine.filter((n) => kidsOf(n.id).length);
    for (const t of teams) teamNo.set(t.id, ++teamN);
    const solo = mine.filter((n) => !kidsOf(n.id).length);
    const w = cardW(!!vg);
    const squads = teams.map((root) => {
      const rows = [];
      const walk = (pid, depth) => {
        const kids = kidsOf(pid);
        const leafRest = kids.filter((k) => !kidsOf(k.id).length && restTier(tierOf(k.id)));
        const fold = leafRest.length >= R.foldMin ? new Set(leafRest.map((k) => k.id)) : new Set();
        for (const k of kids) {
          if (fold.has(k.id)) continue;
          rows.push({ id: k.id, depth, kind: 'row', parent: pid, h: R.row });
          walk(k.id, depth + 1);
        }
        if (fold.size) rows.push({ id: `fold:${pid}`, depth, kind: 'fold', parent: pid, ids: [...fold], h: foldHeight(fold.size, w - 12 - depth * R.indent - 8, R) });
      };
      walk(root.id, 1);
      return { root: root.id, rows };
    });
    const live = solo.filter((n) => !restTier(tierOf(n.id)));
    const rest = solo.filter((n) => restTier(tierOf(n.id)));
    const solos = live.map((n) => ({ id: n.id, depth: 0, kind: 'solo', h: R.row }));
    if (rest.length >= R.foldMin) solos.push({ id: `fold:ws:${key}`, depth: 0, kind: 'fold', ids: rest.map((n) => n.id), h: foldHeight(rest.length, w - 8, R) });
    else for (const n of rest) solos.push({ id: n.id, depth: 0, kind: 'solo', h: R.row });
    const ids = mine.flatMap((r) => [r.id, ...descIds(tree, r.id)]);
    const needs = ids.filter((id) => { const t = tierOf(id); return t === 'turn' || t === 'alert'; }).length;
    const closed = shut.has(key);
    const body = closed ? 0 : sum(squads.map((s) => R.head + sum(s.rows.map((r) => r.h)) + 4 + R.squadGap)) + sum(solos.map((r) => r.h)) + (solos.length ? 0 : -R.squadGap);
    const h = R.wsHead + (closed ? 0 : Math.max(0, body) + R.wsPad);
    return { key, vg, squads, solos, count: ids.length, needs, collapsed: closed, h };
  });

  // 기둥 나누기: 블록 앞 비용 = 틀 머리(그 기둥에서 폴더가 처음이면) + 틈
  const costOf = (i, first, prev) => {
    const b = blocks0[i], p = prev >= 0 ? blocks0[prev] : null;
    const sameF = p && b.vg && p.vg && p.vg.id === b.vg.id;
    let c = b.h;
    if (b.vg && !sameF) c += R.fHead + R.fPad; // 새 틀: 머리와 아래 여백
    if (!first) c += sameF ? R.blockGap : R.fGap;
    return c;
  };
  // 지도 칸 높이(fit)가 주어지면, 그 안에 드는 나눔 중 폴더를 가장 적게 가르는 것(같으면 기둥이 많은 것: 한눈에 더 보인다)을 쓴다.
  // 넓은 화면에서 폴더 하나를 쓸데없이 두 기둥에 나누지 않으면서, 기둥 하나로 길게 쌓지도 않는다
  let parts = partition(blocks0, cols, costOf);
  if (fit > 0) {
    const tall = (p) => Math.max(...p.map((l) => l.reduce((s, i, j) => s + costOf(i, j === 0, j ? l[j - 1] : -1), 0))) + R.pad * 2 + R.fPad * 2;
    const splits = (p) => p.slice(1).filter((l, c) => { const a = blocks0[p[c][p[c].length - 1]], b = blocks0[l[0]]; return a.vg && b.vg && a.vg.id === b.vg.id; }).length;
    let best = null;
    for (let k = 1; k <= cols; k++) {
      const p = partition(blocks0, k, costOf);
      if (tall(p) > fit) continue;
      const score = splits(p) * 1000 - p.length;
      if (!best || score < best.score) best = { p, score };
    }
    if (best) parts = best.p;
  }

  // 자리 매기기
  const folders = [], blocks = [], squads = [], rows = [], guides = [];
  const byIdRow = new Map();
  const seenF = new Set();
  let height = 0;
  parts.forEach((list, c) => {
    const x0 = R.pad + c * (colW + R.gap);
    let y = R.pad, frame = null;
    const closeFrame = () => { if (frame) { frame.h = y + R.fPad - frame.y; y += R.fPad; frame = null; } };
    list.forEach((bi, j) => {
      const b = blocks0[bi];
      const prev = j ? blocks0[list[j - 1]] : null;
      const sameF = prev && b.vg && prev.vg && prev.vg.id === b.vg.id;
      if (!sameF) closeFrame();
      if (j) y += sameF ? R.blockGap : R.fGap;
      if (b.vg && !sameF) {
        frame = { id: b.vg.id, name: b.vg.name, x: x0, y, w: colW, h: 0, cont: seenF.has(b.vg.id), count: 0, needs: 0 };
        seenF.add(b.vg.id);
        folders.push(frame);
        y += R.fHead;
      }
      const inF = !!b.vg;
      const bx = x0 + (inF ? R.fPad : 0), bw = colW - (inF ? R.fPad * 2 : 0);
      const block = { key: b.key, folder: b.vg ? b.vg.id : null, x: bx, y, w: bw, h: b.h, count: b.count, needs: b.needs, collapsed: b.collapsed, col: c };
      blocks.push(block);
      let yy = y + R.wsHead;
      const cx = bx + R.wsPad, cw = bw - R.wsPad * 2;
      if (!b.collapsed) {
        for (const s of b.squads) {
          const sh = R.head + sum(s.rows.map((r) => r.h)) + 4;
          const sq = { root: s.root, no: teamNo.get(s.root), x: cx, y: yy, w: cw, h: sh, ws: b.key };
          squads.push(sq);
          const head = { id: s.root, kind: 'head', depth: 0, x: cx, y: yy, w: cw, h: R.head, ws: b.key, squad: s.root };
          rows.push(head); byIdRow.set(s.root, head);
          let ry = yy + R.head;
          for (const r of s.rows) {
            const ix = cx + 10 + r.depth * R.indent;
            const row = { ...r, x: ix, y: ry, w: cx + cw - ix - 6, ws: b.key, squad: s.root, cross: r.kind === 'row' && wsOf(r.id) !== b.key };
            delete row.h; row.h = r.h;
            rows.push(row);
            if (r.kind === 'row') byIdRow.set(r.id, row); else for (const id of r.ids) byIdRow.set(id, row);
            ry += r.h;
          }
          yy += sh + R.squadGap;
        }
        for (const r of b.solos) {
          const row = { ...r, x: cx + 2, y: yy, w: cw - 4, ws: b.key, squad: null, cross: false };
          rows.push(row);
          if (r.kind === 'fold') for (const id of r.ids) byIdRow.set(id, row); else byIdRow.set(r.id, row);
          yy += r.h;
        }
      }
      y += b.h;
      if (frame) { frame.count += b.count; frame.needs += b.needs; }
    });
    closeFrame();
    height = Math.max(height, y + R.pad);
  });

  // 나무 선: 부모의 상태 동그라미 아래에서 내려와 하위 줄의 동그라미 앞으로 꺾인다. 같은 부모의 하위들은 한 세로줄을 같이 쓴다
  const dotX = (row) => (row.kind === 'head' ? row.x + 10 + 9 : row.x + 9); // 동그라미 가운데(머리는 안쪽 여백 10, 줄은 줄 왼쪽)
  for (const r of rows) {
    if (r.kind !== 'row' && !(r.kind === 'fold' && r.parent)) continue;
    const p = byIdRow.get(r.parent);
    if (!p) continue;
    const vx = dotX(p), y1 = p.kind === 'head' ? p.y + 28 : p.y + p.h - 6, ym = r.y + Math.min(r.h, R.row) / 2;
    const via = r.kind === 'row' ? tree.via.get(r.id) : null;
    const rel = via ? relOf(via, tree) : 'spawn';
    guides.push({ id: `${r.parent}>${r.id}`, from: r.parent, to: r.kind === 'row' ? r.id : null, ids: r.ids || null, rel, cross: !!r.cross, d: `M${vx} ${y1} V${ym - 6} Q${vx} ${ym} ${vx + 6} ${ym} H${r.x - 2}` });
  }

  // 나무 밖 연결(시킴·역할 연결 등): 줄의 칩과 가리킬 때 곡선
  const links = tree.pairs.filter((p) => !tree.treeEdge.has(p.id)).map((p) => ({ id: p.id, from: p.from, to: p.to, rel: relOf(p, tree), kinds: p.kinds, count: p.count, text: p.text, lastAt: p.lastAt, role: p.role, active: p.active, cross: wsOf(p.from) !== wsOf(p.to) }));

  // 읽는 차례(키보드): 줄 차례, 접은 묶음은 그 안 차례
  const order1 = [];
  for (const r of rows) { if (r.kind === 'fold') order1.push(...r.ids); else order1.push(r.id); }
  const width1 = parts.length ? R.pad * 2 + parts.length * colW + (parts.length - 1) * R.gap : R.pad * 2;
  return { width: width1, height: Math.max(height, R.pad * 2), cols: parts.length, colW, folders, blocks, squads, rows, byId: byIdRow, guides, links, order: order1, teamNo, tree };
}

function descIds(tree, id) {
  const out = [];
  const walk = (x, i) => { if (i > 1000) return; for (const c of tree.kids.get(x) || []) { out.push(c.id); walk(c.id, i + 1); } };
  walk(id, 0);
  return out;
}

// 줄 사이 곡선(나무 밖 연결): 두 줄의 오른쪽 끝(같은 기둥) 또는 마주 보는 옆(다른 기둥)을 잇는다
export function linkPath(a, b) {
  if (!a || !b) return null;
  const ay = a.y + Math.min(a.h, ROSTER.row) / 2, by = b.y + Math.min(b.h, ROSTER.row) / 2;
  if (Math.abs((a.x + a.w) - (b.x + b.w)) < 200 && !(a.x + a.w < b.x || b.x + b.w < a.x)) {
    const x = Math.max(a.x + a.w, b.x + b.w) + 2, bend = Math.min(60, 14 + Math.abs(by - ay) / 6);
    return `M${a.x + a.w} ${ay} C${x + bend} ${ay} ${x + bend} ${by} ${b.x + b.w} ${by}`;
  }
  const lr = a.x < b.x;
  const x1 = lr ? a.x + a.w : a.x, x2 = lr ? b.x : b.x + b.w, dx = Math.max(30, Math.abs(x2 - x1) / 2);
  return `M${x1} ${ay} C${x1 + (lr ? dx : -dx)} ${ay} ${x2 + (lr ? -dx : dx)} ${by} ${x2} ${by}`;
}
