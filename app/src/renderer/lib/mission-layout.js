// 미션 맵 배치(I6, P32 → P95 → P100에서 다시 그림). 순수 함수만 둔다(단위 시험 test/p100-lib.test.mjs 등).
// - 워크스페이스마다 판(panel) 하나: 옅은 바탕 면, 머리줄(이름·세션 수·일함 수·응답 필요 수), 그 안은 왼쪽 → 오른쪽 나무(리드 → 하위 → 그 아래).
//   판 안에서 연결 없는 세션은 판의 열들에 고르게 채운다. 모든 세션은 테두리 있는 모양이다: 카드(일함·응답 필요·오류·결과·하위가 있는 세션) 또는 알약(쉼·잠듦·끝남).
//   쉬는 하위가 아주 많으면 그 하위들은 한 상자(dots) 안의 동그라미로 접는다(동그라미도 테두리와 종류 기호가 있다).
// - 판들은 열 격자(N열, 열 폭 C)에 하늘선으로 채운다(가장 낮은 자리부터). 팀이 있는 판은 나무 깊이만큼 열을 차지한다. 그래서 지도가 화면 폭을 채운다.
// - 다른 워크스페이스로 가는 하위 세션·연결이 있는 판, 같은 가상 그룹(P44·P91 폴더 묶음)의 판은 한 사슬로 붙여 놓는다(오른쪽 옆, 안 되면 왼쪽 옆, 그다음 아래).
//   가상 그룹은 그 판들을 감싸는 옅은 테(frame)와 그룹 이름으로 판 위 단계를 보인다.
// - 다른 워크스페이스의 하위로 가는 선이 같은 판의 다음 열 카드 뒤로 지나지 않게, 부모의 다음 열에 빈 통로(pass)를 비워 둔다.
// - 선은 이름표 없는 곡선: 부모 오른쪽 가운데 → 받는 쪽 왼쪽 가운데. 같은 열로 되돌아가는 나무 밖 선과 멀리 가는 나무 밖 선은 quiet(가리킬 때만).
// - PC는 확대하지 않는다(zooms [1], 사용자: "확대가 너무 심하다"). 큰 화면은 판 열을 더 넓고 많이 놓아 폭을 채운다. 배율 셈(missionLayout의 fit)은 남겨 둔다. 휴대폰(lib/phone-graph.js)도 같은 엔진(boardLayout)을 쓴다.
// - 거르기는 배치를 바꾸지 않는다(창이 맞지 않는 세션을 흐리게 한다). 접은 워크스페이스는 머리줄만 남고 그 세션들로 가는 선은 머리줄(대리 상자)로 모인다.
import { EDGE_ORDER, mergeEdges, missionTree, relOf, groupedOrder, nodeTier, restTier } from './mission-model.js';

// 크기(CSS px). PC 카드 제목 16px·둘째 줄 13.5px·메타 12px(P95는 13·12·10.5). 근거는 P100 작업 기록
export const MISSION = { G: 20, pad: 12, head: 44, cardH: 88, pillH: 44, vgap: 10, gin: 44, gHead: 30, passH: 18, minC: 250, maxC: 360, capC: 420, foldKids: 7, foldRest: 5, dot: 24, dotGap: 6, dotsHead: 26, quietSpan: 260, margin: 24, zooms: [1] };
export { EDGE_ORDER, mergeEdges }; // P94: 공용 모델(lib/mission-model.js)로 옮겼다
const rank = (k) => { const i = EDGE_ORDER.indexOf(k); return i < 0 ? EDGE_ORDER.length : i; };
const r1 = (v) => Math.round(v * 10) / 10;
const NEEDS = new Set(['turn', 'alert']);

// 열 격자: 폭(width)에 열 폭이 [minC, maxC]인 열 N개. need(판들이 바라는 열 수 합)가 적으면 N을 줄이고 열을 capC까지 넓힌다
export function gridFor(width, S = MISSION, need = Infinity) {
  let N = Math.max(1, Math.ceil((width + S.G) / (S.maxC + S.G)));
  let C = (width + S.G) / N - S.G;
  while (C < S.minC && N > 1) { N--; C = (width + S.G) / N - S.G; }
  if (need < N) { N = Math.max(1, need); C = Math.min(S.capC, (width + S.G) / N - S.G); }
  return { N, C: r1(Math.max(C, 1)) };
}

// 곡선들
const bez = (x1, y1, x2, y2) => { const dx = Math.max(12, (x2 - x1) * 0.5); return `C${r1(x1 + dx)},${r1(y1)} ${r1(x2 - dx)},${r1(y2)} ${r1(x2)},${r1(y2)}`; };
const midY = (b) => b.y + b.h / 2;

// 공용 엔진. input: { keys: [ws 키(차례)], vg: Map 키 → { id, name }, nodes: [{ id, ws, tier, node }], parent: Map id → 부모 id(나무), links: [{ id, from, to, ... }](나무 밖),
//   collapsed: Set(키), counts: Map 키 → { count, work, turn }(접혀 세션이 없는 판의 수) }
// opt: { width, S(크기), N, C(주면 격자를 셈하지 않는다), rank: 키 → 차례 }
// → { N, C, groups(판), frames(가상 그룹 테), boxes: Map id → 상자, passes, edges(선: from·to·d·tree·cross·back·quiet·via), width, height, order(놓은 차례) }
export function boardLayout(input, { width = 1300, S = MISSION, N: N0 = null, C: C0 = null } = {}) {
  const { keys: keys0 = [], vg = new Map(), nodes = [], parent = new Map(), links = [], collapsed = new Set(), counts = new Map() } = input;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const idx = new Map(nodes.map((n, i) => [n.id, i]));
  const cmp = (a, b) => (a.order ?? Infinity) - (b.order ?? Infinity) || (a.createdAt || 0) - (b.createdAt || 0) || String(a.name || '').localeCompare(String(b.name || '')) || idx.get(a.id) - idx.get(b.id); // 띄운 차례, 이름(P75), 들어온 차례
  const kids = new Map();
  for (const n of nodes) { const p = parent.get(n.id); if (p && byId.has(p)) { if (!kids.has(p)) kids.set(p, []); kids.get(p).push(n); } }
  for (const list of kids.values()) list.sort(cmp);
  const wsOf = (id) => (byId.get(id) || {}).ws;
  const kidsOf = (id) => kids.get(id) || [];
  const localKids = (id) => kidsOf(id).filter((k) => k.ws === wsOf(id));
  const crossKids = (id) => kidsOf(id).filter((k) => k.ws !== wsOf(id));
  const isRest = (n) => restTier(n.tier) && !kidsOf(n.id).length;
  const keys = keys0.filter((k) => collapsed.has(k) || nodes.some((n) => n.ws === k));
  const depthOf = (id, i = 0) => { let d = 0; if (i > 200) return d; for (const k of localKids(id)) d = Math.max(d, 1 + depthOf(k.id, i + 1)); return d; };
  const shapes = keys.map((k) => {
    const ns = nodes.filter((n) => n.ws === k);
    const roots = ns.filter((n) => { const p = parent.get(n.id); return !p || !byId.has(p) || wsOf(p) !== k; });
    const teams = roots.filter((r) => localKids(r.id).length), loose = roots.filter((r) => !localKids(r.id).length);
    const shut = collapsed.has(k);
    const want = shut ? 1 : teams.length ? Math.max(...teams.map((r) => depthOf(r.id))) + 1 : loose.length > 5 ? 2 : 1;
    return { key: k, ns, teams, loose, want, shut };
  });
  const need = shapes.reduce((a, p) => a + p.want, 0);
  const { N, C } = N0 ? { N: N0, C: C0 } : gridFor(width, S, need);
  const cw = r1(Math.max(40, C - 2 * S.pad));
  const groups = [], seq = [];
  // 판 안 놓기(판 왼쪽 위 기준)
  for (const P of shapes) {
    const span = Math.min(N, P.want);
    const local = [];
    const colX = (c) => r1(S.pad + c * (cw + S.gin));
    let y = S.head;
    const put = (n, c, yy, kind) => { const b = { id: n.id, x: colX(c), y: r1(yy), w: cw, h: kind === 'pill' ? S.pillH : S.cardH, kind, col: c, node: n }; local.push(b); seq.push(n.id); return b; };
    const place = (n, d) => {
      const c = Math.min(d, span - 1), cc = Math.min(d + 1, span - 1);
      const ch = localKids(n.id);
      const kind = isRest(n) ? 'pill' : 'card';
      const h = kind === 'pill' ? S.pillH : S.cardH;
      if (!ch.length) { const b = put(n, c, y, kind); b.depth = d; y += h + S.vgap; return b; }
      if (cc === c) { // 열이 모자라면 부모 아래로 들여 놓는다(둥근 꺾임 선)
        const b = put(n, c, y, kind); b.depth = d; y += h + S.vgap;
        for (const k of ch) { const kb = place(k, d + 1); if (kb.x === b.x) { kb.x = r1(kb.x + 14); kb.w = r1(kb.w - 14); } }
        return b;
      }
      const start = y;
      const at = seq.length; // 부모는 하위들보다 먼저(놓은 차례): 자리를 잡아 두고 끝에 채운다
      seq.push(null);
      const rest = ch.filter(isRest);
      const fold = ch.length >= S.foldKids && rest.length >= S.foldRest ? rest : [];
      let top = null, bottom = null;
      const span2 = (b) => { if (top === null) top = b.y; bottom = Math.max(bottom ?? -Infinity, b.y + b.h); };
      for (const k of ch.filter((z) => !fold.includes(z))) span2(place(k, d + 1));
      if (fold.length) {
        const per = Math.max(1, Math.floor((cw - 16 + S.dotGap) / (S.dot + S.dotGap)));
        const rows = Math.ceil(fold.length / per);
        const th = r1(S.dotsHead + rows * (S.dot + S.dotGap) - S.dotGap + 10);
        const gid = `dots:${n.id}`;
        const t = { id: gid, x: colX(cc), y: r1(y), w: cw, h: th, kind: 'dots', col: cc, node: { id: gid, kind: 'dots', ids: fold.map((k) => k.id) }, parent: n.id, depth: d + 1 };
        local.push(t);
        fold.forEach((k, i) => { seq.push(k.id); local.push({ id: k.id, x: r1(t.x + 8 + (i % per) * (S.dot + S.dotGap)), y: r1(t.y + S.dotsHead + Math.floor(i / per) * (S.dot + S.dotGap)), w: S.dot, h: S.dot, kind: 'dot', col: cc, node: k, tray: gid, depth: d + 1 }); });
        span2(t);
        y += th + S.vgap;
      }
      // 다른 워크스페이스 하위: 다음 열에 빈 통로(그 자리로 선이 지나간다. 하위 판이 오른쪽에 놓이지 않으면 비어 있을 뿐)
      if (N > 2) for (const k of crossKids(n.id)) { const pb = { id: `pass:${n.id}>${k.id}`, x: colX(cc), y: r1(y), w: cw, h: S.passH, kind: 'pass', col: cc, node: null }; local.push(pb); span2(pb); y += S.passH + S.vgap; }
      const yy = Math.max(start, r1((top + bottom) / 2 - h / 2));
      const b = put(n, c, yy, kind); b.depth = d;
      seq.pop(); seq[at] = n.id;
      y = Math.max(y, yy + h + S.vgap);
      return b;
    };
    if (!P.shut) {
      for (const r of [...P.teams].sort(cmp)) place(r, 0);
      const sky = Array(span).fill(y);
      for (const n of [...P.loose].sort(cmp)) { const c = sky.indexOf(Math.min(...sky)); const b = put(n, c, sky[c], isRest(n) ? 'pill' : 'card'); b.depth = 0; b.loose = true; sky[c] = r1(sky[c] + b.h + S.vgap); }
      y = Math.max(y, ...sky);
    }
    const ns = P.ns;
    const cnt = P.shut && !ns.length ? counts.get(P.key) || { count: 0, work: 0, turn: 0 } : { count: ns.length, work: ns.filter((n) => n.tier === 'work').length, turn: ns.filter((n) => NEEDS.has(n.tier)).length };
    groups.push({ key: P.key, span, w: r1(span * C + (span - 1) * S.G), h: P.shut ? S.head : r1(y - S.vgap + S.pad), local, vg: vg.get(P.key) || null, collapsed: P.shut, count: cnt.count, work: cnt.work, needs: cnt.turn, team: P.teams.length > 0 });
  }
  // 사슬: 다른 워크스페이스로 가는 나무 선·연결, 같은 가상 그룹으로 이어진 판들
  const gk = new Map(groups.map((g) => [g.key, g]));
  const adj = new Map(keys.map((k) => [k, new Set()])), flow = new Map(keys.map((k) => [k, new Set()]));
  const tie = (a, b, f) => { if (!adj.has(a) || !adj.has(b) || a === b) return; adj.get(a).add(b); adj.get(b).add(a); if (f) flow.get(a).add(b); };
  for (const n of nodes) { const p = parent.get(n.id); if (p && byId.has(p)) tie(wsOf(p), n.ws, true); }
  for (const l of links) if (byId.has(l.from) && byId.has(l.to)) tie(wsOf(l.from), wsOf(l.to), false);
  const members = new Map();
  for (const k of keys) { const v = vg.get(k); if (v) { if (!members.has(v.id)) members.set(v.id, []); members.get(v.id).push(k); } }
  const rankOf = (k) => keys.indexOf(k);
  const seen = new Set(), chains = [];
  for (const k of keys) {
    if (seen.has(k)) continue;
    const comp = [], q = [k];
    seen.add(k);
    while (q.length) { const x = q.shift(); comp.push(x); const nb = [...adj.get(x)]; const v = vg.get(x); if (v) nb.push(...members.get(v.id)); for (const z of nb) if (!seen.has(z)) { seen.add(z); q.push(z); } }
    // 차례: 흐름(부모 판 먼저)을 지키며 판 차례로, 같은 가상 그룹은 이어서
    const out = [], done = new Set();
    while (out.length < comp.length) {
      const left = comp.filter((x) => !done.has(x));
      let ready = left.filter((x) => !left.some((p) => p !== x && flow.get(p).has(x)));
      if (!ready.length) ready = left;
      const near = (x) => { for (let i = out.length - 1; i >= 0; i--) if (adj.get(out[i]).has(x)) return out.length - i; return Infinity; }; // 방금 놓은 판과 이어진 것 먼저
      ready.sort((a, b) => near(a) - near(b) || rankOf(a) - rankOf(b));
      const last = out[out.length - 1], lv = last && vg.get(last);
      const same = lv ? left.filter((x) => vg.get(x) && vg.get(x).id === lv.id).sort((a, b) => rankOf(a) - rankOf(b)) : [];
      const x = same.length ? same[0] : ready[0];
      out.push(x); done.add(x);
    }
    chains.push({ keys: out, team: out.some((x) => gk.get(x).team), rank: Math.min(...out.map(rankOf)) });
  }
  chains.sort((a, b) => (b.team - a.team) || a.rank - b.rank);
  // 격자 채우기(열마다 하늘선)
  const sky = Array(N).fill(0);
  const topOf = (c, s) => Math.max(...sky.slice(c, c + s));
  const setSky = (c, s, v) => { for (let i = c; i < c + s; i++) sky[i] = v; };
  const colLeft = (c) => r1(c * (C + S.G));
  const frames = [], packOrder = [];
  for (const ch of chains) {
    let run = null; // run: 지금 놓는 가상 그룹의 판들
    const placed = []; // 이 사슬에서 놓은 판 { key, c, s, y, h }
    // 가상 그룹 띠: 같은 줄(같은 위 y)에 놓인 그룹 판들 위에 그룹 이름과 선(판 위 단계). 판들 아래는 막지 않는다(이어진 판이 그 아래에 붙을 수 있다)
    const closeRun = () => {
      if (!run || !run.list.length) { run = null; return; }
      const rows = new Map();
      for (const g of run.list) { const k = Math.round(g.y); if (!rows.has(k)) rows.set(k, []); rows.get(k).push(g); }
      [...rows.entries()].sort((a, b) => a[0] - b[0]).forEach(([y, L], i) => {
        const x0 = Math.min(...L.map((g) => g.x)), x1 = Math.max(...L.map((g) => g.x + g.w));
        frames.push({ id: run.id, name: run.name, keys: L.map((g) => g.key), x: r1(x0), y: r1(y - S.gHead), w: r1(x1 - x0), h: r1(S.gHead - 6), first: i === 0 });
      });
      run = null;
    };
    for (const k of ch.keys) {
      const g = gk.get(k), s = g.span, v = vg.get(k);
      if (run && (!v || v.id !== run.id)) closeRun();
      const lift = v ? S.gHead : 0; // 가상 그룹 판은 위에 그룹 이름 자리
      // 기준 판: 가장 최근에 놓은, 이 판과 이어진 판(같은 가상 그룹도). 없으면 바로 앞 판
      let prev = null;
      for (let i = placed.length - 1; i >= 0 && !prev; i--) { const o = placed[i], ov = vg.get(o.key); if (adj.get(o.key).has(k) || (v && ov && ov.id === v.id)) prev = o; }
      if (!prev && placed.length) prev = placed[placed.length - 1];
      const opts = [];
      if (!prev) for (let c = 0; c + s <= N; c++) opts.push({ c, y: topOf(c, s) + lift, d: c });
      else {
        const right = prev.c + prev.s, leftC = prev.c - s;
        if (right + s <= N) opts.push({ c: right, y: Math.max(topOf(right, s) + lift, prev.y), d: 0 });
        if (leftC >= 0) opts.push({ c: leftC, y: Math.max(topOf(leftC, s) + lift, prev.y), d: 1 });
        for (let c = Math.max(0, prev.c - s + 1); c <= Math.min(N - s, prev.c + prev.s - 1); c++) opts.push({ c, y: Math.max(topOf(c, s) + lift, prev.y + prev.h + S.G), d: 2 + Math.abs(c - prev.c) });
        if (!opts.length) for (let c = 0; c + s <= N; c++) opts.push({ c, y: topOf(c, s) + lift, d: 9 + c });
      }
      opts.sort((a, b) => a.y - b.y || a.d - b.d);
      const best = opts[0];
      g.c = best.c; g.x = colLeft(best.c); g.y = r1(best.y);
      setSky(best.c, s, r1(g.y + g.h + S.G));
      placed.push({ key: k, c: best.c, s, y: g.y, h: g.h });
      packOrder.push(k);
      if (v) { if (!run) run = { id: v.id, name: v.name, list: [] }; run.list.push(g); }
    }
    closeRun();
  }
  // 판 자리로 옮긴다
  const boxes = new Map(), passes = new Map(), proxyOf = new Map();
  for (const g of groups) {
    if (g.collapsed) { const gid = `g:${g.key}`; boxes.set(gid, { id: gid, x: g.x, y: g.y, w: g.w, h: S.head, kind: 'group', node: { id: gid, kind: 'group', key: g.key }, ws: g.key, proxy: true }); for (const n of nodes) if (n.ws === g.key) proxyOf.set(n.id, gid); }
    for (const b of g.local) {
      const a = { ...b, x: r1(g.x + b.x), y: r1(g.y + b.y), ws: g.key };
      if (b.kind === 'pass') passes.set(b.id.slice(5), { ...a, right: g.x + g.w });
      else boxes.set(b.id, a);
    }
    delete g.local;
  }
  const solid = [...boxes.values()].filter((b) => b.kind !== 'dot' && b.kind !== 'group');
  const heads = groups.filter((g) => !g.collapsed).map((g) => ({ x: g.x, y: g.y, w: g.w, h: S.head, ws: g.key, head: true }));
  const gutters = new Map(); // 판 사이 골목 x → 쓴 선 수
  const off = (x) => { const k = gutters.get(x) || 0; return [0, -5, 5, -8, 8][k % 5]; }; // 같은 골목을 여러 선이 쓰면 비켜 긋는다
  const useGutter = (x) => gutters.set(x, (gutters.get(x) || 0) + 1);
  // 가로·세로 선분이 카드·판 머리줄(a, b 빼고)을 지나는가
  const obsOf = (a, b) => [...solid, ...heads].filter((o) => o !== a && o !== b);
  const hitH = (obs, y, x1, x2) => obs.some((o) => y > o.y - 3 && y < o.y + o.h + 3 && Math.max(x1, x2) > o.x && Math.min(x1, x2) < o.x + o.w); // 테두리에 붙어 따라가는 것도 걸린 것으로
  const hitV = (obs, x, y1, y2) => obs.some((o) => x > o.x - 3 && x < o.x + o.w + 3 && Math.max(y1, y2) > o.y && Math.min(y1, y2) < o.y + o.h);
  // 골목 길(둥근 꺾임): (x1, y1) → 골목 x → (x2, y2). M 없이
  const elbowVia = (x1, y1, xg, x2, y2) => {
    const R = Math.min(8, Math.abs(y2 - y1) / 2, Math.abs(xg - x1), Math.abs(x2 - xg)), s = y2 >= y1 ? 1 : -1, h1 = xg >= x1 ? -1 : 1, h2 = x2 >= xg ? 1 : -1;
    return `H${r1(xg + h1 * R)} Q${r1(xg)},${r1(y1)} ${r1(xg)},${r1(y1 + s * R)} V${r1(y2 - s * R)} Q${r1(xg)},${r1(y2)} ${r1(xg + h2 * R)},${r1(y2)} H${r1(x2)}`;
  };
  // (x1, y1)에서 b의 왼쪽 가운데까지의 꼬리(M 없이). skip: 빼는 상자(보통 a)
  // 곡선(sx, sy) → (ex, ey)이 list의 상자를 지나는가
  const bezHits = (list, sx, sy, ex, ey) => { const dx = Math.max(12, (ex - sx) * 0.5); for (let i = 1; i < 24; i++) { const t = i / 24, u = 1 - t; const X = u * u * u * sx + 3 * u * u * t * (sx + dx) + 3 * u * t * t * (ex - dx) + t * t * t * ex, Y = u * u * u * sy + 3 * u * u * t * sy + 3 * u * t * t * ey + t * t * t * ey; if (list.some((o) => X > o.x && X < o.x + o.w && Y > o.y - 2 && Y < o.y + o.h + 2)) return true; } return false; };
  const tail = (x1, y1, b, skip) => {
    const x2 = b.x, y2 = midY(b);
    const all = obsOf(skip, b);
    const plain = bez(x1, y1, x2, y2);
    if (!bezHits(all, x1, y1, x2, y2)) return { t: plain };
    // 다른 판으로 가면: 받는 판 왼쪽 골목으로 내려가 옆으로 들어간다(받는 판 머리줄을 스치지 않는다)
    const pb = gk.get(b.ws), cross = pb && (!skip || skip.ws !== b.ws);
    const xg0 = cross ? r1(pb.x - S.G / 2) : null, xg = cross ? r1(xg0 + off(xg0)) : null;
    if (cross && xg - x1 >= 6 && !hitH(all, y1, x1, xg) && !hitV(all, xg, y1, y2) && !hitH(all, y2, xg, x2)) { useGutter(xg0); return { t: elbowVia(x1, y1, xg, x2, y2), routed: true }; }
    // 사이 열의 빈 틈(y*)으로 건넌다. 사이 = 받는 카드의 판 여백 앞까지(받는 열의 다른 판은 빼고), 두 끝의 판 머리줄도 빼고
    const edgeX = cross ? pb.x : x2 - S.pad;
    const obs = all.filter((o) => o.x < edgeX - 1 && o.x + o.w > x1 + 2 && !(o.head && (o.ws === b.ws || (skip && o.ws === skip.ws))));
    if (!obs.length) return { t: plain };
    const ox0 = Math.min(...obs.map((o) => o.x)), ox1 = Math.max(...obs.map((o) => o.x + o.w));
    const inBand = obs.filter((o) => o.x < ox1 && o.x + o.w > ox0).sort((p, q) => p.y - q.y);
    const cands = [];
    for (let i = 0; i + 1 < inBand.length; i++) { const g0 = inBand[i].y + inBand[i].h, g1 = inBand[i + 1].y; if (g1 - g0 >= 6) cands.push((g0 + g1) / 2); }
    cands.push(Math.max(...inBand.map((o) => o.y + o.h)) + S.pad + S.G / 2); // 맨 아래: 판 여백을 지나 판 사이 틈 가운데(판 테두리 위를 따라가지 않게)
    const free = (yy) => !inBand.some((o) => yy > o.y - 2 && yy < o.y + o.h + 2);
    const yy = cands.filter(free).sort((p, q) => Math.abs(p - y1) + Math.abs(p - y2) - Math.abs(q - y1) - Math.abs(q - y2))[0];
    if (yy === undefined || ox0 - x1 < 10 || x2 - ox1 < 10) return { t: plain };
    const sx = r1(ox1 + 2);
    // 마지막 구간: 곧장 가면 걸리면 받는 판 왼쪽 골목으로 꺾어 들어간다
    const last = cross && xg > sx + 2 && bezHits(all, sx, yy, x2, y2) && !hitV(all, xg, yy, y2) && !hitH(all, y2, xg, x2) ? elbowVia(sx, yy, xg, x2, y2) : bez(sx, yy, x2, y2);
    return { t: `${bez(x1, y1, ox0 - 2, yy)} L${sx},${r1(yy)} ${last}`, routed: true };
  };
  // 앞으로 가는 곡선. 사이 카드(또는 판 머리줄)를 지나면 그 열의 빈 틈으로 돈다
  const forward = (a, b) => { const x1 = a.x + a.w, y1 = midY(a); const c = tail(x1, y1, b, a); return { d: `M${r1(x1)},${r1(y1)} ${c.t}`, back: false, routed: !!c.routed }; };
  const curve = (a, b, pass) => {
    if (pass && b.x >= pass.right) { // 통로로 판 오른쪽 끝까지 나온 뒤 받는 쪽으로(그 사이 판도 피한다)
      const x1 = a.x + a.w, y1 = midY(a), py = midY(pass), px = r1(pass.right + 2);
      return { d: `M${r1(x1)},${r1(y1)} ${bez(x1, y1, pass.x, py)} L${px},${r1(py)} ${tail(px, py, b, a).t}`, back: false, via: 'pass' };
    }
    if (b.x >= a.x + a.w - 1) return forward(a, b);
    const pa = gk.get(a.ws), pb = gk.get(b.ws);
    if (pa && pb && pa !== pb && (b.y >= a.y + a.h || a.y >= b.y + b.h)) { // 위·아래 다른 판: 판 바깥 골목(판 사이 틈)으로 가 받는 쪽 옆으로 들어간다. 왼쪽·오른쪽 중 카드·머리줄을 뚫지 않는 쪽
      const ya = midY(a), yb = midY(b), obs = obsOf(a, b);
      const xl0 = r1(Math.min(pa.x, pb.x) - S.G / 2), xr0 = r1(Math.max(pa.x + pa.w, pb.x + pb.w) + S.G / 2);
      const xl = r1(xl0 + off(xl0)), xr = r1(xr0 + off(xr0));
      const left = !hitH(obs, ya, a.x, xl) && !hitV(obs, xl, ya, yb) && !hitH(obs, yb, xl, b.x);
      const right = !hitH(obs, ya, a.x + a.w, xr) && !hitV(obs, xr, ya, yb) && !hitH(obs, yb, xr, b.x + b.w);
      const useLeft = left || (!right && Math.abs(a.x - xl) + Math.abs(b.x - xl) <= Math.abs(xr - a.x - a.w) + Math.abs(xr - b.x - b.w));
      if (useLeft) { useGutter(xl0); return { d: `M${r1(a.x)},${r1(ya)} ${elbowVia(a.x, ya, xl, b.x, yb)}`, back: false, down: true, via: 'gutter', blocked: !left }; }
      useGutter(xr0);
      return { d: `M${r1(a.x + a.w)},${r1(ya)} ${elbowVia(a.x + a.w, ya, xr, b.x + b.w, yb)}`, back: false, down: true, via: 'gutter', blocked: !right };
    }
    if (b.y >= a.y + a.h && b.x < a.x + a.w && b.x + b.w > a.x) { // 아래로(같은 판: 들여 놓은 하위)
      if (b.x - a.x >= 10) { const x = r1(a.x + (b.x - a.x) / 2), R = Math.min(6, (b.x - a.x) / 2); return { d: `M${x},${r1(a.y + a.h)} V${r1(midY(b) - R)} Q${x},${r1(midY(b))} ${r1(x + R)},${r1(midY(b))} H${r1(b.x)}`, back: false }; }
      const x1 = a.x + Math.min(28, a.w / 5), x2 = b.x + Math.min(28, b.w / 5), y1 = a.y + a.h, y2 = b.y, dy = Math.max(10, (y2 - y1) / 2);
      const between = solid.some((o) => o !== a && o !== b && o.y >= y1 - 1 && o.y + o.h <= y2 + 1 && o.x < Math.max(x1, x2) && o.x + o.w > Math.min(x1, x2));
      return { d: `M${r1(x1)},${r1(y1)} C${r1(x1)},${r1(y1 + dy)} ${r1(x2)},${r1(y2 - dy)} ${r1(x2)},${r1(y2)}`, back: between, down: true }; // 사이에 카드가 끼면 back(나무 밖이면 가리킬 때만)
    }
    // 같은 열이거나 뒤로: 오른쪽으로 둥글게 돌아 받는 쪽 오른쪽으로
    const x1 = a.x + a.w, y1 = midY(a), x2 = b.x + b.w, y2 = midY(b), bx = Math.max(x1, x2) + Math.min(S.pad + S.G / 2, 10 + Math.abs(y2 - y1) / 8);
    return { d: `M${r1(x1)},${r1(y1)} C${r1(bx)},${r1(y1)} ${r1(bx)},${r1(y2)} ${r1(x2)},${r1(y2)}`, back: true };
  };
  const endOf = (id, isTree) => proxyOf.get(id) || (boxes.has(id) ? (isTree && boxes.get(id).tray ? boxes.get(id).tray : id) : null);
  const shown = new Map();
  const add = (p, isTree) => {
    const a = endOf(p.from, false), b = endOf(p.to, isTree);
    if (!a || !b || a === b) return;
    const cross = wsOf(p.from) !== wsOf(p.to);
    if (a === p.from && b === p.to) { shown.set(p.id, { ...p, tree: isTree, cross }); return; }
    const k = `${a}>${b}`;
    const q = shown.get(k) || { ...p, id: k, from: a, to: b, kinds: [], members: [], count: 0, lastAt: 0, active: false, folded: true, tree: isTree, cross: false, text: null, role: null };
    for (const kd of p.kinds || []) if (!q.kinds.includes(kd)) q.kinds.push(kd);
    q.members.push(p.id);
    q.role = q.role || p.role; if (p.text && (p.lastAt || 0) >= q.lastAt) q.text = p.text;
    q.count += p.count || 0; q.lastAt = Math.max(q.lastAt, p.lastAt || 0); q.active = q.active || p.active; q.cross = q.cross || cross; q.tree = q.tree && isTree;
    q.kinds.sort((x, z) => rank(x) - rank(z)); q.primary = q.kinds[0];
    shown.set(k, q);
  };
  for (const n of nodes) { const p = parent.get(n.id); if (p && byId.has(p)) add(n.via || { id: `${p}>${n.id}`, from: p, to: n.id, kinds: ['spawn'], primary: 'spawn' }, true); }
  for (const l of links) add(l, false);
  const edges = [...shown.values()].map((p) => {
    const a = boxes.get(p.from), b = boxes.get(p.to);
    const c = curve(a, b, p.tree && !p.folded ? passes.get(`${p.from}>${p.to}`) : null);
    const far = !p.tree && (c.back || c.blocked || Math.abs(midY(b) - midY(a)) > S.quietSpan); // 나무 밖 선이 되돌아가거나, 골목이 막혔거나, 멀리 가면 가리킬 때만
    return { ...p, ...c, quiet: !!p.quiet || far };
  });
  const all = [...groups, ...frames];
  const right = all.length ? Math.max(...all.map((g) => g.x + g.w)) : 0;
  const bottom = all.length ? Math.max(...all.map((g) => g.y + g.h)) : 0;
  return { N, C, groups, frames, boxes, passes, edges, width: r1(right), height: r1(bottom), order: seq.filter((id) => boxes.has(id)), packOrder };
}

// PC 미션 맵. graph: mission.graph. opt: collapsed(접은 워크스페이스 키들), order(워크스페이스 차례), vgroups(P44·P91 가상 그룹), tiers(Map id → 강조 등급),
//   width(지도 칸 폭), height(지도 칸 높이: 주면 확대해 채운다), S(크기)
// → boardLayout 결과 + { tree, teamNo: Map 리드 id → 번호, loose: [연결 없는 세션], zoom, columns }
export function missionLayout(graph, { collapsed = [], order: order0 = [], vgroups = [], tiers = null, width = 1300, height = null, S = MISSION } = {}) {
  const { order, groupOf: vgOf } = groupedOrder(order0, vgroups);
  const tree = missionTree(graph);
  const { byId } = tree;
  const tierOf = (id) => (tiers && tiers.has(id) ? tiers.get(id) : nodeTier(byId.get(id)));
  const nodes = tree.nodes.map((n) => ({ id: n.id, ws: n.workspaceKey || '', tier: tierOf(n.id), node: n, order: n.order, createdAt: n.createdAt, name: n.name, via: tree.via.get(n.id) }));
  const rankOf = (k) => { const i = order.indexOf(k); return i < 0 ? order.length : i; };
  const keys = [...new Set(nodes.map((n) => n.ws))].sort((a, b) => rankOf(a) - rankOf(b) || (a === '') - (b === '') || a.localeCompare(b));
  const links = tree.pairs.filter((p) => !tree.treeEdge.has(p.id)).map((p) => ({ ...p, rel: relOf(p, tree) }));
  for (const n of nodes) if (n.via) n.via = { ...n.via, rel: relOf(n.via, tree) };
  const input = { keys, vg: new Map(keys.filter((k) => vgOf.has(k)).map((k) => [k, vgOf.get(k)])), nodes, parent: tree.parent, links, collapsed: new Set(collapsed || []) };
  // 확대(zoom)는 캔버스 여백(margin)까지 키우므로, 배율 z에서 쓸 수 있는 폭·높이는 칸 / z − 여백 둘
  const room = (len, z) => Math.max(200, len / z - 2 * MISSION.margin);
  let lay = null, zoom = 1;
  for (const z of height ? S.zooms : [1]) { const l = boardLayout(input, { width: room(width, z), S }); const fits = height && l.height <= room(height, z); if (!lay || fits || z === 1) { lay = l; zoom = z; if (fits) break; } }
  // 리드(하위가 있는 맨 위 세션) 번호: 놓은 차례
  const teamNo = new Map();
  for (const id of lay.order) if (!tree.parent.has(id) && (tree.kids.get(id) || []).length) teamNo.set(id, teamNo.size + 1);
  const touched = new Set();
  for (const p of tree.pairs) { touched.add(p.from); touched.add(p.to); }
  const loose = tree.nodes.filter((n) => !tree.parent.has(n.id) && !(tree.kids.get(n.id) || []).length && !touched.has(n.id) && lay.boxes.has(n.id)).map((n) => n.id);
  for (const b of lay.boxes.values()) if (b.node && b.node.node) b.node = b.node.node; // 상자의 node는 그래프 노드
  const depths = [...lay.boxes.values()].filter((b) => Number.isFinite(b.depth)).map((b) => b.depth);
  return { ...lay, tree, teamNo, loose, zoom, columns: depths.length ? Math.max(...depths) + 1 : 0 };
}

// 지도 차례(요약 열이 쓴다): 판 놓은 차례, 판 안에서는 부모 먼저
export const mapOrder = (lay) => lay.order.filter((id) => lay.boxes.has(id));

// 선 풀이 글(사전 함수 t): "하위 세션 · 역할: reviewer", 다른 워크스페이스, 마지막 지시, 횟수
export function edgeLabel(e, t) {
  const base = e.role || t(`mission.edge.${e.primary}`);
  return e.count > 1 && e.primary !== 'role' ? `${base} ×${e.count}` : base;
}
