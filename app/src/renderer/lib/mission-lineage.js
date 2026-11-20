// P153 r7: 세션 맵 PC = 시안 B "Lineage"(experiments/mm-concepts/project/B.dc.html) 배치. 순수 함수만 둔다(단위 시험 test/p153-lib.test.mjs).
// - 폴더(사이드바 가상 그룹) = 가로 띠(왼쪽 기둥 SPINE에 이름·세션 수·상태 비율 막대). 차례는 사이드바: 폴더들(사이드바 차례), 그 뒤 "폴더 없음" 띠(폴더 밖 워크스페이스, 판 차례).
// - 워크스페이스 = 띠 안의 줄. 줄마다 고정 칸: 워크스페이스 머리(HEADW) · 시작(COL[0]) · 1단계(COL[1]) · n단계(COL[2] 이후, 나무 깊이만큼).
//   P260: 칸은 배치 규칙일 뿐 화면에 칸 머리·구분선을 그리지 않는다. 관계 없는 세션(솔로)은 시작 칸에서 나무 아래로 쌓는다(나무 → 다른 워크스페이스에서 온 것 → 솔로).
// - 팀 = 같은 워크스페이스 안의 나무(lib/mission-model.js missionTree: 부모 > 역할 > 띄움 > 시킴). 왼 → 오른으로 자란다. 하위는 위 → 아래로 쌓고 부모는 하위 묶음의 세로 가운데.
//   부모가 다른 워크스페이스에 있으면 자기 줄의 워커 칸(COL[1])에 놓고(그 하위는 다음 칸), 부모와는 다른 워크스페이스 선(cross)으로 잇는다. 부모가 닫힌 세션은 뿌리.
// - 선: 나무 선은 부모 오른쪽 가운데 → 칸 사이 틈의 줄기 → 하위 왼쪽 가운데(화살촉). 다른 워크스페이스 선은 격자 길 찾기(lib/mission-terr.js routeOrtho)로 카드·줄 머리·기둥을 피해 받는 카드의 왼쪽(또는 위)으로.
// - 카드 폭은 이 판의 가장 긴 이름이 멀리 타일에서 한 줄에 들게(lib/mission-terr.js cardWidth), 높이는 내용(cardHeight).
// → { cards: Map id → { x, y, w, h, node, ws, depth(솔로 -1), solo, fold, thin(P163 얇은 줄) }, bands, rows, cols(칸 x, 화면에 그리지 않는다), edges, bounds, order, tree, cw, seq(줄 키 → { roots, away, solos }), vkids(id → 보이는 하위 id들),
//     }
import { keepCard } from './bg-work.js'; // P164
import { missionTree, relOf, bySpawn, nodeTier } from './mission-model.js';
import { chipCounts, normKey, keyName, cardWidth, cardHeight, routeOrtho } from './mission-terr.js';
import { zoomStep } from './faces.js'; // P178: 이름표 배율 계단
import { RIG_MAP, mapLabW, roleSessions, BUILDER_ROLE } from './rig-map.js'; // P261: 세션 맵 rig 묶음 치수·카드

// SPINE = 폴더 기둥 최소 폭(P157: 가장 긴 폴더 이름에 맞춰 넓어진다, spineWidth), BANDMIN = 폴더 띠 최소 높이(P157: 워크스페이스 하나인 폴더도 기둥 글이 잘리지 않게), HEADX·HEADW = 워크스페이스 머리 자리, GX = 칸 사이(줄기가 지난다), GY = 형제 사이, RT·RB = 줄 위아래 여백, ROWMIN = 줄 최소 높이,
// MINCOLS = 늘 있는 나무 칸 수(시작·1단계)
export const LINE = { BANDMIN: 330, SPINE: 210, HEADX: 232, HEADW: 300, GX: 110, GY: 22, RT: 26, RB: 30, ROWMIN: 170, MINCOLS: 2, ASPECT: 1.8, NAME_PX: 30, BANDGAP: 36, RING: 12, EDGEGAP: 4, FOLD: 4, PGY: 46, THIN: 30, TGY: 8, THINMIN: 3, RIGGAP: 60 }; // P254: RIGGAP = 줄 안 나무·솔로 아래 → rig 묶음 위 // P163: THIN = 얇은 줄 높이, TGY = 얇은 줄끼리 간격, THINMIN = 하위가 이만큼 이상일 때 절전 하위를 얇은 줄로 // FOLD: 이 단계(시작 = 0)보다 깊은 가지는 접는다 // BANDGAP: 폴더 띠 사이 빈 칸. RING·EDGEGAP: 선 끝을 카드 강조 고리 바깥에(작업 중 빛 고리, 그 밖은 테두리 바로 밖) // NAME_PX: 멀리 타일 이름 세계 글 크기(처음 화면 폭 맞춤 배율 0.35~0.4에서 화면 11~12px)

// P261: 세션 맵 카드 폭(그 판의 가장 긴 이름이 멀리 타일 한 줄에 들게). rig 묶음 카드도 같은 폭을 쓴다(rigMapOpts)
export const mapCardW = (graph, tree = missionTree(graph)) => cardWidth(tree.nodes.map((n) => n.name), LINE.NAME_PX);
// P261: rig 묶음 카드 높이 = 보통 카드 높이 셈(cardHeight)으로 가장 긴 내용(일 세 줄, 또는 오류 두 줄)이 드는 높이. 역할마다 같은 크기(내용이 바뀌어도 묶음이 흔들리지 않는다)
export const rigCardH = (cw) => Math.max(cardHeight({ lastPrompt: 'x'.repeat(400) }, 'work', false, cw), cardHeight({ lastPrompt: 'x', error: 'x'.repeat(400) }, 'alert', false, cw));
// P261: 세션 맵 rig 묶음(lib/rig-map.js v7Layout)의 카드 꼴 = 보통 세션 카드(폭 cw, 높이 rigCardH), 틈·줄 글 = 세션 맵 선 말투(RIG_MAP)
export const rigMapOpts = (cw) => { const ch = rigCardH(cw); return { cw, ch, bh: ch, gap: RIG_MAP.GAP, bgap: RIG_MAP.BGAP, geo: RIG_MAP, labW: (s) => mapLabW(s) + 2 * RIG_MAP.LABM }; };

// P261: rig 묶음의 카드 상자(세계 자리) → Map id → { x, y, w, h, node, ws, depth: -1, fold: 0, rig: { kind, name, chip, extra, none, dim } }.
//   node = 판 그래프의 그 세션 노드(트리에서는 뺀 것, hideRigSessions 전 그래프). 그래프에 없으면(세션 없음·아직 안 읽힘) 지도 자료로 만든다
export function rigCardBoxes(lay, rigList, rigGeo, graph, sessions, t) {
  const out = new Map();
  if (!lay || !lay.rigs || !lay.rigs.length) return out;
  const bySid = new Map(((graph && graph.nodes) || []).filter((n) => n.kind === 'session' && n.sessionId).map((n) => [n.sessionId, n]));
  for (const it of lay.rigs) {
    const m = rigList.find((x) => x.workspace === it.key), g = rigGeo.get(it.key);
    if (!m || !g || !g.order.length) continue;
    const sid = roleSessions(m, sessions);
    const nRaise = (m.raises || []).length;
    const add = (kind, name, box, r) => {
      const rs = r && r.session, s = sid.get(name) || (rs && rs.sessionId) || null;
      const lv = s && sessions ? sessions.get(s) : null;
      const node = (s && bySid.get(s)) || { id: `rig:${it.key}:${name}`, kind: 'session', sessionId: s, name: (lv && lv.name) || (rs && rs.name) || (kind === 'builder' ? t('rigV7.builderName') : name), state: lv ? lv.state : rs ? (rs.asleep ? 'sleeping' : rs.state) : 'exited', agentKind: (lv && lv.kind) || (rs && rs.kind) || 'claude', workspaceKey: it.key, lastPrompt: (lv && lv.lastPrompt) || null, model: (lv && lv.model) || null, effort: (lv && lv.effort) || null };
      const chip = kind === 'builder' ? t('rigMap.tagBuilder') : r && r.docN != null ? t('rigV7.tagRoleV', { name, n: r.docN }) : t('rigMap.tagRole', { name });
      out.set(node.id, { x: it.x + box.x, y: it.y + box.y, w: box.w, h: box.h, node, ws: it.key, depth: -1, fold: 0, rig: { kind, name, chip, extra: kind === 'builder' && nRaise ? t('rigMap.raises', { n: nRaise }) : null, none: !s, dim: !!g.dim } });
    };
    for (const n of g.order) add('role', n, g.roles.get(n), (m.roles || []).find((r) => r.name === n));
    add('builder', BUILDER_ROLE, g.builder, m.builder ? { session: m.builder } : null);
  }
  return out;
}

// P157: 글 폭 어림(px). 한글·한자·가나는 글자 크기만큼, 대문자·숫자는 조금 넓게, 그 밖은 0.6
export const glyphW = (s, px) => { let w = 0; for (const ch of String(s || '')) { const c = ch.codePointAt(0); w += (c >= 0x1100 && c <= 0x11ff) || (c >= 0x2e80 && c <= 0xa4cf) || (c >= 0xac00 && c <= 0xd7af) || (c >= 0xf900 && c <= 0xfaff) || (c >= 0xff00 && c <= 0xffef) ? 1 : /[A-Z0-9@#%&MW]/.test(ch) ? 0.7 : 0.6; } return w * px; };
// P157: 폴더 기둥 폭 = 가장 긴 폴더 이름(멀리 단계 글 32px·굵게)과 두 줄 수 글(멀리 24px)이 말줄임 없이 드는 폭. 좌우 여백 16씩 + 여유 12
export const SPINE_PX = { NAME: 32, STAT: 24, KIND: 26, PAD: 44 };
export function spineWidth(names = [], stats = [], px = SPINE_PX) {
  const need = Math.max(0, ...names.map((x) => glyphW(x, px.NAME) * 1.06), ...stats.map((x) => glyphW(x, px.STAT)));
  return Math.max(LINE.SPINE, Math.ceil(need + SPINE_PX.PAD));
}

// P178: 폴더 기둥 글(이름·종류·수·상태 막대)과 워크스페이스 줄 머리 글(이름·상태 알약·Alt 안내)은 배율이 작아져도 화면에서 거의 같은 크기로 읽힌다.
// 세계 글 크기 = max(바탕 크기, 화면 목표 / 배율 계단). 배율 계단(lib/faces.js zoomStep, 1.1배마다)으로만 바뀌어 끌기·확대 중 매 프레임 다시 그리지 않는다.
// 계단이 ON 이상이면(모든 글이 바탕 크기) 1(바뀜 없음). MIN = 글이 더 커지지 않는 계단(18%보다 멀면 글도 배율과 함께 작아진다: 좁은 창에서 이름표가 카드 자리를 다 먹지 않게)
export const LABEL = { ON: 0.88, MIN: 0.18, SCREEN: { name: 15, kind: 10.5, stat: 11.5, ws: 14.5, chip: 11, hint: 10.5, bar: 4 }, BASE: { name: 22, kind: 12, stat: 13.5, ws: 18, chip: 12.5, hint: 12, bar: 6 } };
export const labelStep = (k) => { const s = zoomStep(k); return s >= LABEL.ON ? 1 : Math.max(LABEL.MIN, s); };
// 배율 계단 s → 세계 글 크기(px, 소수 한 자리)
export function labelPx(s = 1) {
  const out = {};
  for (const k of Object.keys(LABEL.BASE)) out[k] = Math.round(Math.max(LABEL.BASE[k], LABEL.SCREEN[k] / (s > 0 ? s : 1)) * 10) / 10;
  return out;
}
// 줄 머리 상태 알약 한 개의 폭(글 + 점·틈·안 여백, em은 알약 글 크기)과 줄 머리 높이(위 여백 22 + 이름 줄 + 틈 + 알약 줄들)
const chipW = (text, px) => glyphW(text, px) + px * 2.3;
export function headBox(name, chips, px, minW = LINE.HEADW) {
  const ws = px.ws, cp = px.chip, gap = Math.max(9, ws * 0.45), cgap = Math.max(5, cp * 0.4);
  const nameW = ws * 1.5 + glyphW(name, ws) * 1.04;
  const ws2 = chips.map((c) => chipW(c, cp));
  // 알약 줄은 이름 폭 또는 알약 글 24자 폭까지만 넓히고, 넘치면 다음 줄로(알약이 많아도 카드를 멀리 밀지 않게)
  const w = Math.ceil(Math.max(minW, nameW, Math.min(ws2.reduce((a, b, i) => a + b + (i ? cgap : 0), 0), Math.max(nameW, cp * 24))));
  let lines = ws2.length ? 1 : 0, x = 0;
  for (const cw of ws2) { if (x && x + cgap + cw > w) { lines++; x = cw; } else x += (x ? cgap : 0) + cw; }
  const h = Math.ceil(22 + ws * 1.3 + (lines ? gap + lines * cp * 1.6 + (lines - 1) * cgap : 0));
  return { w, h, gap, cgap };
}

// expanded: 깊이 접기를 편 카드 id들(Set). FOLD 단계보다 깊은 가지는 접는다
// spineText(nWs, nSessions) → [윗줄, 아랫줄](P157: 기둥 폭을 셀 때 수 글도 넣는다. 창은 지금 언어 글을 준다)
// P166: phone = 휴대폰 세로 배치(PHONE 위 설명). view = 맵이 보이는 칸 { w, h }(주면 그 비율에 맞춰 단을 나눈다), pages = 단 수를 정해서(그림 비교·시험용)
// P202: today = 오늘 일한 워크스페이스 키들(Set·배열, todayWorkspaces). 폴더 차례는 오늘 일한 폴더들(이름순) → 나머지 폴더들(이름순), 사이드바 손 차례(order)는 쓰지 않는다.
//   columns = 1 | 2 | 'auto'(PC만: view = 맞춤 칸 { w, h }에서 두 열 맞춤 배율이 한 열보다 COLS2.GAIN배 넘게 크면 두 열). → sections(오늘·이전 이름표 자리), ncol, colDx, measure
export function lineageLayout(graph, opts = {}) {
  const { vgroups = [], tiers = null, names = null, routing = true, noFolder = 'No folder', expanded = new Set(), spineText = null, phone = false, view = null, pages = 0, label = 1, chipText = null, foldOpen = null, today = null, columns = 1, tab = null, keepKeys = null, rigBlocks = null } = opts; // P251: keepKeys = 세션이 없어도 줄을 둘 워크스페이스. P254: rigBlocks = 워크스페이스 키 → rig 묶음 크기 { w, h }(세계 px, 그 줄 안에 놓는다)
  if (!phone && columns === 'auto') {
    // P253: 열 판단은 이름표 계단(label, 배율에 따라 바뀐다)과 상관없이 바탕 글 크기(label 1)의 한 열 배치로 한다.
    //   전에는 그 계단의 배치로 재서, 줌인·줌아웃으로 계단이 바뀌면 열이 하나·둘로 바뀌며 밀렸다. 이제 열 수는 그래프와 보기 칸(창 크기)으로만 바뀐다
    const one = lineageLayout(graph, { ...opts, columns: 1, routing: false, label: 1 });
    if (pickColumns(one.measure, view) === 2) return lineageLayout(graph, { ...opts, columns: 2 });
    return routing || label !== 1 ? lineageLayout(graph, { ...opts, columns: 1 }) : one;
  }
  const tree = missionTree(graph);
  const { byId } = tree;
  const sidOf = new Map(tree.nodes.map((n) => [n.sessionId, n.id]));
  const L = { ...LINE, CW: mapCardW(graph, tree) };
  if (phone) { L.CW = Math.min(PHONE.CW_MAX, Math.max(PHONE.CW_MIN, Math.round(L.CW * PHONE.CW_K))); L.GX = PHONE.GX; L.FOLD = PHONE.FOLD; }
  const tierOf = (id) => (tiers && tiers.has(id) ? tiers.get(id) : nodeTier(byId.get(id)));
  const wsOf = (id) => (byId.get(id) || {}).workspaceKey || '';
  const nameOf = (key) => (names && names.get(key)) || (key ? keyName(key) : '');
  // P178: 이름표 글 크기(배율 계단 label). 휴대폰은 지금대로(바탕 크기)
  const px = labelPx(phone ? 1 : label);
  const chipStr = (c) => (chipText ? chipText(c.tier, c.n) : `${c.n} ${c.tier}`);

  // ---- 소속(사이드바와 같다)과 차례(P202: 오늘 일한 폴더 → 나머지, 각각 이름순. 폴더 안 워크스페이스도 이름순) ----
  const folderOf = new Map();
  (vgroups || []).forEach((g, gi) => (g.members || []).forEach((m, mi) => { const k = normKey(m); if (k && !folderOf.has(k)) folderOf.set(k, { g, gi, mi }); }));
  const present = [...new Set([...tree.nodes.map((n) => wsOf(n.id)), ...(keepKeys || []).filter(Boolean), ...(rigBlocks && !phone ? [...rigBlocks.keys()] : []).filter(Boolean)])]; // P251: rig 역할만 있는 워크스페이스도 줄이 남는다. P254: rig 묶음이 있는 워크스페이스도
  const byWsName = (a, b) => (!a) - (!b) || nameCmp(nameOf(a), nameOf(b)) || nameCmp(a, b);
  const groups0 = [];
  for (const [gi, g] of (vgroups || []).entries()) {
    const keys = present.filter((k) => k && folderOf.has(normKey(k)) && folderOf.get(normKey(k)).gi === gi).sort(byWsName);
    if (keys.length) groups0.push({ id: g.id, name: g.name, keys });
  }
  const loose = present.filter((k) => !k || !folderOf.has(normKey(k))).sort(byWsName);
  if (loose.length) groups0.push({ id: null, name: noFolder, keys: loose });
  const allGroups = folderOrder(groups0, today);
  // P207: 휴대폰 탭(오늘 | 이전). tab = 'today' | 'earlier' | 'auto'(기본 규칙)를 주고 두 칸이 다 있으면 고른 칸의 폴더만 놓는다(구분 줄 없음).
  //   tab을 주지 않으면 P202처럼 두 칸을 한 열에 구분 줄로 놓는다(PhoneMap.jsx는 늘 준다)
  const tabs = phone && tab ? phoneTabs(allGroups, tree.nodes, wsOf, tierOf, tab) : null;
  const groups = tabs && tabs.pick ? allGroups.filter((g) => g.today === (tabs.pick === 'today')) : allGroups;
  const nToday = groups.filter((g) => g.today).length;
  const split = nToday > 0 && nToday < groups.length; // 오늘 칸과 이전 칸이 둘 다 있다
  const two = !phone && split && columns === 2;

  // P157: 기둥 폭은 가장 긴 폴더 이름에 맞춘다. 워크스페이스 머리부터 오른쪽은 늘어난 만큼 민다
  const stats = spineText ? groups.flatMap((g) => spineText(g.keys.length, tree.nodes.filter((n) => g.keys.includes(wsOf(n.id))).length)) : [];
  // P178: 글이 커지면 기둥도 넓어진다(옛 멀리 단계 글 32·24px보다 좁아지지는 않는다). 줄 머리 폭·높이와 띠 최소 높이도 글을 따른다
  L.SPINE = phone ? 0 : spineWidth(groups.map((g) => g.name), stats, { NAME: Math.max(SPINE_PX.NAME, px.name), STAT: Math.max(SPINE_PX.STAT, px.stat) });
  L.HEADX = phone ? PHONE.PADX : LINE.HEADX + (L.SPINE - LINE.SPINE);
  L.BANDMIN = Math.max(LINE.BANDMIN, Math.ceil(52 + px.kind * 1.3 + px.name * 1.2 + px.stat * 2.6 + 2 + 7 * 3 + 6 + px.bar + 24));
  // P202: 오늘·이전 이름표 자리. 두 열은 열마다 위 머리(SECH), 한 열은 두 칸 사이 구분 줄 칸(SEP, 줄 위아래에 이름표 한 줄씩). 글은 기둥 이름 글 크기를 따른다
  const SEC = phone ? { SECH: 0, SEP: PHONE.SEP } : { SECH: Math.ceil(Math.max(COLS2.HD, px.name * 2.2 + 36)), SEP: Math.ceil(Math.max(COLS2.SEP, px.name * 3.4 + 40)) };
  const heads = new Map();
  if (!phone) for (const g of groups) for (const key of g.keys) heads.set(key, headBox(key ? nameOf(key) : '', chipCounts(tree.nodes.filter((n) => wsOf(n.id) === key).map((n) => tierOf(n.id))).map(chipStr), px));
  L.HEADW2 = Math.max(LINE.HEADW, ...[...heads.values()].map((h) => h.w));
  // P198: 띠 세션은 나무 밖. 부모가 띠에 있는 세션은 나무 뿌리(띠 가장자리에서 옅은 선)
  const parentIn = (id) => { const p = tree.parent.get(id); return p && wsOf(p) === wsOf(id) ? p : null; };
  const crossIn = (id) => { const p = tree.parent.get(id); return !!p && wsOf(p) !== wsOf(id); };
  const kidsIn = (id) => (tree.kids.get(id) || []).filter((c) => wsOf(c.id) === wsOf(id));
  const own = new Map(tree.nodes.map((n) => [n.id, cardHeight(n, tierOf(n.id), crossIn(n.id), L.CW)]));
  const H = (id) => own.get(id) || 150;

  // P153 r11(P156 계약): 동료(node.peers)는 같은 칸에 곁에. 일 부모가 없는 동료는 그 동료의 부모 아래 바로 다음에 놓는다(배치만: 위계 선은 긋지 않는다)
  const peersOf = (id) => [...new Set(((byId.get(id) || {}).peers || []))].filter((p) => p !== id && byId.has(p) && wsOf(p) === wsOf(id));
  const layKids = new Map(tree.nodes.map((n) => [n.id, kidsIn(n.id).slice().sort(bySpawn).map((c) => c.id)]));
  const attached = new Set();
  const isAnc = (a, x) => { for (let i = 0; x && i < 100; i++) { if (x === a) return true; x = parentIn(x); } return false; };
  for (const n of tree.nodes) {
    if (parentIn(n.id) || crossIn(n.id)) continue;
    for (const p of peersOf(n.id)) {
      const pp = parentIn(p);
      if (!pp || attached.has(n.id) || isAnc(n.id, pp)) continue;
      const list = layKids.get(pp);
      if (!list.includes(n.id)) { list.splice(list.indexOf(p) + 1, 0, n.id); attached.add(n.id); }
    }
  }
  // 깊이 접기: 시작(0)부터 FOLD 단계까지 보이고, 그보다 깊은 가지는 FOLD 단계 카드의 '+n단계' 칩으로 접는다(expanded에 든 카드는 편다)
  const below = (id, g = 0) => { const ks = layKids.get(id) || []; return !ks.length || g > 50 ? 0 : 1 + Math.max(...ks.map((k) => below(k, g + 1))); };
  const folded = new Map();
  // 편 카드 아래 가지는 끝까지 편다(그 가지만)
  const opened = new Set();
  const openWalk = (id, g) => { if (opened.has(id) || g > 50) return; opened.add(id); for (const k of layKids.get(id) || []) openWalk(k, g + 1); };
  for (const id of expanded) if (layKids.has(id)) openWalk(id, 0);
  const visKids = (id, depth) => { const ks = layKids.get(id) || []; if (ks.length && depth >= L.FOLD && !opened.has(id)) { folded.set(id, below(id)); return []; } return ks; };

  let maxDepth = 0;
  const depthWalk = (id, d, g) => { maxDepth = Math.max(maxDepth, d); if (g > 50) return; for (const c of visKids(id, d)) depthWalk(c, d + 1, g + 1); };
  const isRoot = (n, key) => !parentIn(n.id) && !crossIn(n.id) && !attached.has(n.id);
  const leadsAway = (n) => (tree.kids.get(n.id) || []).some((c) => wsOf(c.id) !== wsOf(n.id));
  // 독립으로 정했어도 계보 부모가 맵에 있으면 시작 칸(옅은 계보 선이 이어진다)
  const lineageOnly = (n) => !!n.lineageParent && n.lineageParent !== tree.parent.get(n.id) && byId.has(n.lineageParent);
  // P157: 지금 하위가 없어도 하위를 불렀던 세션(닫힌 하위·최근 assign 지시, mission.mjs CALLED_MS)과 상위가 닫힌 세션은 시작 칸. 솔로는 어떤 관계도 없고 누구도 부르지 않은 세션만
  const calledBefore = (n) => (n.closedKids || 0) > 0 || !!n.assignAt || !!n.parentClosed;
  // 동료는 다른 워크스페이스에 있어도 솔로가 아니다(peersOf는 같은 줄 배치용이라 같은 워크스페이스만 본다). 사람·에이전트가 정한 관계(하위·동료·독립)가 맵 위 세션과 있으면 역시 솔로가 아니다
  const anyPeer = (n) => (n.peers || []).some((p) => p !== n.id && byId.has(p));
  const relTouch = new Set();
  for (const e of graph.edges || []) if (e.relation && e.relationSource && e.relationSource !== 'auto' && byId.has(e.from) && byId.has(e.to)) { relTouch.add(e.from); relTouch.add(e.to); }
  const treeRoot = (n) => isRoot(n) && ((layKids.get(n.id) || []).length || leadsAway(n) || peersOf(n.id).length || anyPeer(n) || relTouch.has(n.id) || lineageOnly(n) || calledBefore(n));
  for (const n of tree.nodes) { if (treeRoot(n)) depthWalk(n.id, 0, 0); else if (crossIn(n.id)) depthWalk(n.id, 1, 0); }
  const nCols = Math.max(L.MINCOLS, maxDepth + 1);
  const COL = Array.from({ length: nCols }, (_, i) => (phone ? PHONE.PADX : L.HEADX + Math.max(L.HEADW + 208, L.HEADW2 + 80)) + i * (L.CW + L.GX)); // 시안: 리드 칸 740 = 232 + 300 + 208. P178: 머리 글이 커지면 머리 폭 + 80
  // P166: 휴대폰 폭 = 나무 칸 수(적어도 MINCOLS)만큼. P260: 솔로도 시작 칸이라 PC와 같다
  const PCOLS = Math.max(L.MINCOLS, nCols);
  // P254: 줄 안 rig 묶음은 시작 칸에서 오른쪽으로 놓는다. 넓으면 줄 폭을 늘린다
  const blockOf = (key) => (!phone && rigBlocks ? rigBlocks.get(key) || null : null);
  const blockW = Math.max(0, ...present.map((k) => (blockOf(k) ? blockOf(k).w : 0)));
  const W = phone ? PHONE.PADX * 2 + PCOLS * L.CW + (PCOLS - 1) * L.GX : Math.max(COL[nCols - 1] + L.CW + 60, blockW ? COL[0] + blockW + 60 : 0);
  const DX = two ? W + COLS2.GAP : 0; // P202: 오른쪽(이전) 열의 x
  let ox = 0, ci = 0; // 지금 놓는 열의 x와 번호
  const sections = [];

  const cards = new Map(), bands = [], rows = [], rigs = [];
  // P160: 휴대폰 목록이 같은 판정을 쓰도록 남긴 줄마다 놓은 차례(시작 칸 뿌리·다른 워크스페이스에서 온 것·솔로)와 보이는 하위 차례를 남긴다(PC 배치는 그대로)
  const seq = new Map(), vkids = new Map();
  const put = (id, depth, y, ws) => cards.set(id, { x: ox + COL[Math.min(depth, nCols - 1)], y, w: L.CW, h: H(id), node: byId.get(id), ws, depth, fold: folded.get(id) || 0, thin: thin.has(id) });
  // P163: 한 세션 아래 보이는 하위(곁에 붙은 동료 포함)가 THINMIN개 이상이면 절전 중인 하위만 얇은 줄(높이 THIN)로 줄이고 깨어 있는 카드 아래로 모은다(그 안은 지금 차례 = 만든 차례).
  // 줄이지 않는 것: 절전이 아닌 것(작업 중·응답 필요·오류·완료 미확인 등), 뒤 일이 도는 것(P164), 자기 아래 보이는 하위가 있거나 깊이 접기 칩이 붙는 것(카드로 둔다), 형제 중 동료가 있는 것(동료 붙이기가 먼저라 제자리 카드)
  const thin = new Set();
  const thinOrder = (ks, d) => {
    if (ks.length < L.THINMIN) return ks;
    const slim = ks.filter((k) => tierOf(k) === 'sleep' && !keepCard(byId.get(k)) && !visKids(k, d).length && !folded.get(k) && !peersOf(k).some((p) => ks.includes(p)));
    if (!slim.length) return ks;
    for (const k of slim) { thin.add(k); own.set(k, L.THIN); }
    const ss = new Set(slim);
    return [...ks.filter((k) => !ss.has(k)), ...slim];
  };
  // align: 하위 묶음 안에서 카드 자리. mid = 가운데, bottom = 아래 끝(바로 다음이 동료일 때), top = 위 끝(바로 앞이 동료일 때). 동료끼리 바로 위아래에 붙게
  const alignOf = (list, i) => (i + 1 < list.length && peersOf(list[i]).includes(list[i + 1]) ? 'bottom' : i > 0 && peersOf(list[i]).includes(list[i - 1]) ? 'top' : 'mid');
  const place = (id, depth, top, ws, align = 'mid') => {
    const ks = depth > 50 ? [] : thinOrder(visKids(id, depth), depth + 1);
    vkids.set(id, ks);
    if (!ks.length) { put(id, depth, top, ws); return H(id); }
    let t = top;
    ks.forEach((k, i) => { t += place(k, depth + 1, t, ws, alignOf(ks, i)) + (i + 1 < ks.length && peersOf(k).includes(ks[i + 1]) ? L.PGY : thin.has(k) && thin.has(ks[i + 1]) ? L.TGY : L.GY); }); // 동료 사이는 조금 더 띄워 양끝 점 선이 보이게, 얇은 줄끼리는 좁게
    const h = t - L.GY - top;
    const my = Math.max(h, H(id));
    put(id, depth, align === 'bottom' ? top + my - H(id) : align === 'top' ? top : top + (my - H(id)) / 2, ws);
    // 하위 묶음이 부모보다 낮으면 하위를 가운데로 내린다
    if (h < H(id)) { const dy = (H(id) - h) / 2; const shift = (x) => { for (const c of visKids(x, 0)) { const b = cards.get(c); if (b) b.y += dy; shift(c); } }; shift(id); }
    return my;
  };
  let y = two ? SEC.SECH : 0;
  if (two) sections.push({ kind: 'today', mode: 'head', x: 0, y: 0, w: W, h: SEC.SECH, col: 0 }, { kind: 'earlier', mode: 'head', x: DX, y: 0, w: W, h: SEC.SECH, col: 1 });
  // measure: 한 열 배치의 칸 높이(두 열 판단 pickColumns가 쓴다)
  const measure = { W, today: 0, earlier: 0, h: 0, sep: SEC.SEP, head: Math.ceil(Math.max(COLS2.HD, px.name * 2.2 + 36)) };
  let secTop = y;
  groups.forEach((g, gi) => {
    const turn = split && gi === nToday; // P202: 오늘 칸 → 이전 칸으로 넘어가는 자리
    if (turn) {
      measure.today = y - secTop;
      if (two) { ox = DX; ci = 1; y = SEC.SECH; } // 두 열: 이전 칸은 오른쪽 열 맨 위부터
      else { sections.push({ kind: 'split', mode: 'line', x: 0, y, w: W, h: SEC.SEP, col: 0, before: g.keys[0] }); y += SEC.SEP; }
      secTop = y;
    } else if (gi) y += phone ? PHONE.BANDGAP : L.BANDGAP; // P153 r8: 폴더 사이를 띄운다
    const by = y;
    if (phone) y += PHONE.FH; // P166: 휴대폰은 폴더 이름이 띠 위 머리(왼쪽 기둥 대신)
    g.keys.forEach((key, wi) => {
      const all = tree.nodes.filter((n) => wsOf(n.id) === key).sort(bySpawn);
      const nodes = all;
      // 시작 칸: 이 줄에 하위가 있는 뿌리, 하위가 다른 워크스페이스에만 있는 뿌리, 동료가 있는 뿌리. 뿌리끼리 동료면 바로 아래에 붙인다
      const roots0 = nodes.filter(treeRoot), roots = [], done = new Set();
      for (const r of roots0) { if (done.has(r.id)) continue; roots.push(r); done.add(r.id); for (const p of peersOf(r.id)) { const pn = byId.get(p); if (!done.has(p) && roots0.includes(pn)) { roots.push(pn); done.add(p); } } }
      const away = nodes.filter((n) => crossIn(n.id)); // 부모가 다른 워크스페이스(1단계 칸에서 시작)
      const solos = nodes.filter((n) => isRoot(n) && !treeRoot(n));
      seq.set(key, { roots: roots.map((r) => r.id), away: away.map((n) => n.id), solos: solos.map((n) => n.id) });
      const chips = chipCounts(all.map((n) => tierOf(n.id)));
      if (phone) { y += phoneRow(key, g, wi, chips, all.length); return; }
      const end = stack(key, y + L.RT), stackH = end == null ? 0 : end - y;
      // P254: 그 워크스페이스의 rig 묶음(역할·빌더 세션은 트리에서 빠져 여기에만 나온다). P260: 나무·솔로 쌓음 아래, 시작 칸부터
      const blk = blockOf(key);
      let rigH = 0;
      if (blk) { const rigTop = y + (stackH ? stackH + L.RIGGAP : L.RT); rigs.push({ key, x: ox + COL[0], y: rigTop, w: blk.w, h: blk.h }); rigH = rigTop - y + blk.h; }
      const h = Math.max(stackH, rigH, L.ROWMIN, heads.get(key).h + 10) + L.RB;
      rows.push({ key, name: nameOf(key), band: g.id, first: wi === 0, y, h, x: ox + L.SPINE, w: W - L.SPINE, chips, count: all.length, ox, col: ci, today: !!g.today });
      y += h;
    });
    // P157: 띠 최소 높이. 모자라면 마지막 줄을 늘린다(기둥 글이 잘리지 않게). P166: 휴대폰은 머리가 위라 없다
    if (!phone && y - by < L.BANDMIN) { const r = rows[rows.length - 1], dy = L.BANDMIN - (y - by); r.h += dy; y += dy; }
    const ids = tree.nodes.filter((n) => g.keys.includes(wsOf(n.id))).map((n) => n.id);
    bands.push({ id: g.id, name: g.name, loose: g.id == null, odd: gi % 2 === 1, y: by, h: y - by, nWs: g.keys.length, sessions: ids.length, bar: chipCounts(ids.map(tierOf)), today: !!g.today, ...(phone ? { x: 0, w: W, gi, cont: false, page: 0 } : { x: ox, col: ci }) });
  });
  if (split) measure.earlier = y - secTop; else if (nToday) measure.today = y - secTop; else measure.earlier = y - secTop;
  measure.h = y;
  // P166: 휴대폰은 보이는 칸 비율에 맞춰 줄들을 단(page)으로 나눌 수 있다(신문처럼 위 → 아래, 왼 → 오른)
  let nPages = 1;
  if (phone) { nPages = flowPages(); y = Math.max(1, ...bands.map((b) => b.y + b.h)); }

  // ---- 선 ----
  const r1 = (v) => Math.round(v * 10) / 10;
  const poly = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${r1(p[0])} ${r1(p[1])}`).join(' ');
  const edges = [], cross = [];
  // 선 끝과 카드 사이 틈: 작업 중 카드는 빛 고리 바깥(RING), 그 밖은 테두리 바로 밖(EDGEGAP). 화살촉이 고리를 덮지 않는다
  const gap = (id) => (tierOf(id) === 'work' ? L.RING : L.EDGEGAP);
  // 꺾인 선의 처음(또는 끝) 점이 카드 변 위에 있으면 그 변의 바깥쪽으로 g만큼 민다(토막 방향 그대로라 직각은 유지된다)
  const pushOut = (pts, box, g, first) => {
    const out = pts.map((p) => [...p]), p = out[first ? 0 : out.length - 1]; // 첫·끝 토막은 늘 변에 수직이라 바깥으로 밀어도 직각
    if (Math.abs(p[0] - box.x) < 0.5) p[0] -= g; else if (Math.abs(p[0] - (box.x + box.w)) < 0.5) p[0] += g; else if (Math.abs(p[1] - box.y) < 0.5) p[1] -= g; else if (Math.abs(p[1] - (box.y + box.h)) < 0.5) p[1] += g;
    return out;
  };
  for (const [child, via] of tree.via) {
    const parent = tree.parent.get(child);
    const a = cards.get(parent), b = cards.get(child);
    if (!a || !b) continue;
    const rel = relOf(via, tree);
    const base = { id: via.id, from: parent, to: child, rel, role: via.role || null, text: via.text || null, active: !!via.active, tree: true };
    if (wsOf(parent) !== wsOf(child)) { cross.push({ base, a, b }); continue; }
    const ay = a.y + a.h / 2, byy = b.y + b.h / 2, mx = a.x + a.w + L.GX / 2;
    const pts = ay === byy ? [[a.x + a.w + gap(parent), ay], [b.x - gap(child), byy]] : [[a.x + a.w + gap(parent), ay], [mx, ay], [mx, byy], [b.x - gap(child), byy]];
    const label = null; // P153 r8: 선 이름표는 없앴다(역할은 카드 둘째 줄, 다른 워크스페이스에서 온 것은 카드 맨 아래 줄이 말한다)
    edges.push({ ...base, cross: false, pts, d: poly(pts), label });
  }
  // P153 r11: 동료 = 같은 칸에서 위아래로 곁에 놓고 무채색 양방향 선(위계 화살촉 없음). 칸이 다르면(다른 줄 등) 길 찾기
  const peerSeen = new Set();
  for (const n of tree.nodes) for (const p of ((n.peers || []).filter((x) => byId.has(x)))) {
    const k = [n.id, p].sort().join('|');
    if (peerSeen.has(k)) continue;
    peerSeen.add(k);
    const a = cards.get(n.id), b = cards.get(p);
    if (!a || !b || a.folded || b.folded) continue;
    const base = { id: `peer:${k}`, from: n.id, to: p, rel: 'peer', peer: true, tree: false };
    if (Math.abs(a.x - b.x) < 0.5) {
      const [u, d] = a.y < b.y ? [a, b] : [b, a];
      const pts = peerPts(u, d, L.EDGEGAP); // P159: 두 카드의 가로 가운데
      edges.push({ ...base, cross: false, pts, d: poly(pts), label: null });
    } else cross.push({ base, a, b, kind: 'peer' });
  }
  // 독립(일 부모 없음)이나 동료로 정했어도 계보(띄운 세션)는 옅은 선으로만 남긴다(화살촉 없음)
  for (const n of tree.nodes) {
    const lp = n.lineageParent;
    if (!lp || lp === tree.parent.get(n.id) || !cards.get(lp) || !cards.get(n.id) || (n.peers || []).includes(lp)) continue;
    if (cards.get(lp).folded || cards.get(n.id).folded) continue;
    cross.push({ base: { id: `lineage:${lp}>${n.id}`, from: lp, to: n.id, rel: 'lineage', lineage: true, tree: false }, a: cards.get(lp), b: cards.get(n.id), kind: 'lineage' });
  }
  if (cross.length) {
    const blocks = [...cards.values()].map((c) => ({ x: c.x, y: c.y, w: c.w, h: c.h }));
    if (phone) { // P166: 휴대폰 머리(위 띠)는 이름·칩 자리만 막는다(선이 줄 사이를 위아래로 지날 수 있게)
      for (const r of rows) blocks.push({ x: r.x + PHONE.PADX - 6, y: r.y + 8, w: Math.min(r.w - PHONE.PADX * 2, L.CW * 1.3), h: PHONE.WH - 16 });
      for (const b of bands) blocks.push({ x: b.x + PHONE.PADX - 6, y: b.y + 8, w: Math.min(b.w - PHONE.PADX * 2, L.CW * 1.3), h: PHONE.FH - 16 });
    } else {
      for (const r of rows) blocks.push({ x: (r.ox || 0) + L.HEADX - 8, y: r.y + 12, w: Math.max(L.HEADW, L.HEADW2) + 16, h: Math.max(96, heads.get(r.key).h) }); // 줄 머리(이름·칩)
      for (const b of bands) blocks.push({ x: b.x || 0, y: b.y, w: L.SPINE, h: b.h }); // 폴더 기둥
      for (const r of rigs) blocks.push({ x: r.x, y: r.y, w: r.w, h: r.h }); // P254: 줄 안 rig 묶음
      // P206: 두 열이면 열 위 머리(오늘·이전 이름표 칸)와 그 위를 막는다. 열 사이 선은 머리 아래 열 사이 틈으로 건넌다
      if (two) blocks.push({ x: -L.SPINE, y: -240, w: W * 2 + COLS2.GAP + L.SPINE * 2, h: SEC.SECH + 240 });
    }
    const routes = routing && cross.length <= 60 ? routeOrtho(cross.map((c) => ({ a: c.a, b: c.b, sides: c.kind === 'peer' ? ['left', 'top', 'right'] : ['left', 'top'] })), blocks, edges.map((e) => e.pts), { G: 16 }) : null;
    cross.forEach((c, i) => {
      let pts = routes && routes[i];
      if (!pts) { const ay = c.a.y + c.a.h / 2, by2 = c.b.y + c.b.h / 2, mx = c.a.x + c.a.w + 70; pts = [[c.a.x + c.a.w, ay], [mx, ay], [mx, by2], [c.b.x, by2]]; }
      pts = pushOut(pts, c.a, gap(c.base.from), true); pts = pushOut(pts, c.b, gap(c.base.to), false);
      edges.push({ ...c.base, cross: !c.kind, pts, d: poly(pts), label: null });
    });
  }


  // 칸 x: 시작(0) · 1단계 · 2단계 · …(보이는 가장 깊은 단계까지). P260: 화면에 칸 머리를 그리지 않는다(놓기 판정 relationDrop·줄 머리 잡이 폭이 읽는다)
  const cols0 = COL.map((x, i) => ({ key: 'lv', level: i, x }));
  // P202: 두 열이면 열마다 둔다(c = 열 번호)
  const cols = two ? [...cols0.map((c) => ({ ...c, c: 0 })), ...cols0.map((c) => ({ ...c, x: c.x + DX, c: 1 }))] : cols0.map((c) => ({ ...c, c: 0 }));
  const rowIdx = new Map(rows.map((r, i) => [r.key, i]));
  const order = [...cards.entries()].sort((p, q) => rowIdx.get(p[1].ws) - rowIdx.get(q[1].ws) || p[1].x - q[1].x || p[1].y - q[1].y).map(([id]) => id);
  const BW = phone ? nPages * W + (nPages - 1) * PHONE.PGAP : two ? W * 2 + COLS2.GAP : W;
  const BH = two ? Math.max(1, ...bands.map((b) => b.y + b.h)) : Math.max(1, y);
  return { cards, bands, rows, cols, edges, rigs, bounds: { x: 0, y: 0, w: BW, h: BH }, sections, ncol: two ? 2 : 1, colDx: DX, measure, order, tree, cw: L.CW, W, spine: L.SPINE, headx: L.HEADX, seq, vkids, label: phone ? 1 : label, px, headW: L.HEADW2 || LINE.HEADW, heads, ...(phone ? { phone: true, pages: nPages, tabs } : {}) };

  // ---- P260: 줄 안 쌓기(PC·휴대폰 같은 규칙). 시작 칸 뿌리의 나무 → 다른 워크스페이스에서 온 것(1단계 칸) → 솔로(시작 칸, 차례 = 만든 차례).
  //   나무 사이는 GY*2(동료 뿌리끼리는 PGY), 솔로끼리는 GY. 쌓은 것이 없으면 null, 있으면 마지막 카드 아래 끝 y ----
  function stack(key, top) {
    const { roots: rs, away: aw, solos: ss } = seq.get(key);
    let cy = top, last = null;
    rs.forEach((r, i) => { const peerNext = i + 1 < rs.length && peersOf(r).includes(rs[i + 1]); cy += place(r, 0, cy, key, alignOf(rs, i)) + (last = peerNext ? L.PGY : L.GY * 2); });
    for (const s of aw) cy += place(s, 1, cy, key) + (last = L.GY * 2);
    for (const s of ss) { cards.set(s, { x: ox + COL[0], y: cy, w: L.CW, h: H(s), node: byId.get(s), ws: key, depth: -1, solo: true, fold: 0 }); cy += H(s) + (last = L.GY); }
    return last == null ? null : cy - last;
  }

  // ---- P166: 휴대폰 줄 하나(머리 = 위 띠, 그 아래 쌓음). 줄 높이를 돌려준다 ----
  function phoneRow(key, g, wi, chips, count) {
    const top = y + PHONE.WH + PHONE.RT;
    const bottom = stack(key, top) ?? top;
    const h = Math.max(bottom, top) + PHONE.RB - y;
    rows.push({ key, name: nameOf(key), band: g.id, first: wi === 0, y, h, x: 0, w: W, chips, count, head: PHONE.WH, page: 0, today: !!g.today });
    return h;
  }

  // ---- P166: 단 나누기. 줄(워크스페이스)째로 옮긴다. 단마다 폴더 머리를 다시 단다(앞 단에서 이어지는 폴더는 cont) ----
  function flowPages() {
    if (!rows.length) return 1;
    const bandOf = rows.map((r) => groups.findIndex((g) => (g.id || null) === (r.band || null)));
    // P202: 오늘 칸 → 이전 칸 구분 줄은 이전 칸 첫 줄 앞(폴더 사이 틈 대신 SEP). 단 맨 위여도 둔다
    const sepAt = nToday > 0 && nToday < groups.length ? rows.findIndex((r) => !r.today) : -1;
    const headOf = (col, j) => (j === 0 ? PHONE.FH + (col[j] === sepAt ? PHONE.SEP : 0) : bandOf[col[j]] !== bandOf[col[j - 1]] ? PHONE.FH + (col[j] === sepAt ? PHONE.SEP : PHONE.BANDGAP) : 0);
    // n단으로 나눈 줄 차례(높이가 고르게): 지금 단에 이 줄을 더하면 목표 높이를 절반 넘게 넘길 때 다음 단으로
    const split = (n) => {
      const all = rows.map((_, i) => i);
      const target = all.reduce((h, i, j) => h + rows[i].h + headOf(all, j), 0) / n;
      const out = [[]];
      let acc = 0;
      for (const i of all) {
        const cur = out[out.length - 1];
        const add = rows[i].h + headOf([...cur, i], cur.length);
        if (cur.length && out.length < n && acc + add / 2 > target) { out.push([i]); acc = rows[i].h + PHONE.FH; continue; }
        cur.push(i); acc += add;
      }
      return out;
    };
    const heightOf = (col) => col.reduce((h, i, j) => h + rows[i].h + headOf(col, j), 0);
    const plan = (n) => { const cs = split(n); return { cs, w: cs.length * W + (cs.length - 1) * PHONE.PGAP, h: Math.max(...cs.map(heightOf)) }; };
    const kOf = (p) => Math.min(view.w / p.w, view.h / p.h);
    let best = plan(1);
    if (pages > 0) best = plan(Math.min(pages, rows.length));
    else if (view && view.w > 0 && view.h > 0) {
      for (let n = 2; n <= Math.min(PHONE.MAXPAGES, rows.length); n++) { const p = plan(n); if (p.cs.length === n && kOf(p) > kOf(best) * PHONE.GAIN) best = p; }
    }
    if (best.cs.length === 1) return 1;
    // 다시 놓기: 단 c의 x = c × (W + PGAP), 단 안은 위에서부터
    const segs = [];
    best.cs.forEach((col, c) => {
      const x0 = c * (W + PHONE.PGAP);
      let cy = 0, seg = null;
      col.forEach((i, j) => {
        const r = rows[i], bi = bandOf[i], b0 = bands[bi];
        const sep = i === sepAt && sections.find((x) => x.mode === 'line');
        if (sep) { sep.x = x0; sep.y = cy; sep.page = c; cy += PHONE.SEP; }
        if (headOf(col, j)) {
          if (j && !sep) cy += PHONE.BANDGAP;
          seg = { ...b0, x: x0, y: cy, h: PHONE.FH, cont: segs.some((s) => s.gi === b0.gi), page: c };
          segs.push(seg);
          cy += PHONE.FH;
        }
        const dx = x0 - r.x, dy = cy - r.y;
        for (const cd of cards.values()) if (cd.ws === r.key) { cd.x += dx; cd.y += dy; }
        r.x += dx; r.y += dy; r.first = !!headOf(col, j); r.page = c;
        cy += r.h; seg.h = cy - seg.y;
      });
    });
    bands.length = 0;
    bands.push(...segs);
    return best.cs.length;
  }
}

// P166: 휴대폰(짧은 변 430 이하) 세션 맵 배치. PC와 같은 판정·카드·선을 세로로 긴 화면에 맞춰 놓는다(lineageLayout phone: true).
// - 폴더 이름: 왼쪽 기둥 대신 띠 위 머리(FH). 워크스페이스 이름·칩: 왼쪽 칸 대신 줄 위 머리(WH). 솔로: 오른쪽 두 줄 대신 나무 아래 격자(나무 칸 수만큼, 가로 점선으로 가른다).
// - 카드 폭은 PC의 CW_K배(CW_MIN~CW_MAX), 단계 사이 GX(PC 110). 맞춤 보기에서 시작·1단계 두 칸이 화면 폭에 들게.
// - 보이는 칸(view)을 주면 전체가 그 비율에 더 크게 들어가는 단 수(1~MAXPAGES)를 고른다(앞 단 수보다 GAIN배 이상 커질 때만). 단 사이 PGAP
// ---- P207: 휴대폰 세션 맵 탭(오늘 | 이전). 한 번에 한 칸만 놓고 그린다 ----
// groups = folderOrder 결과(g.today), nodes = 세션 노드. want = 고른 탭('today' | 'earlier' | null)
// → { split(두 칸 다 있음), pick(놓는 칸, split 아니면 null), today·earlier: { n(세션 수), attn(응답 필요·오류 수), ids(폴더 차례) }, ofWs: 워크스페이스 키 → 칸 }
export function phoneTabs(groups, nodes, wsOf, tierOf, want = null) {
  const ofWs = new Map();
  for (const g of groups || []) for (const k of g.keys) ofWs.set(k, g.today ? 'today' : 'earlier');
  const sec = () => ({ n: 0, attn: 0, ids: [] });
  const out = { today: sec(), earlier: sec(), ofWs };
  const byWs = new Map();
  for (const n of nodes || []) { const k = wsOf(n.id); if (!byWs.has(k)) byWs.set(k, []); byWs.get(k).push(n.id); }
  for (const g of groups || []) for (const k of g.keys) for (const id of byWs.get(k) || []) {
    const s = out[g.today ? 'today' : 'earlier'];
    s.n++; s.ids.push(id);
    const tr = tierOf(id);
    if (tr === 'turn' || tr === 'alert') s.attn++;
  }
  out.split = out.today.n > 0 && out.earlier.n > 0;
  out.pick = out.split ? tabPick(want, out) : null;
  return out;
}
// 고를 칸: 고른 탭에 세션이 있으면 그것, 아니면 기본(오늘에 세션이 있으면 오늘, 없으면 이전)
export const tabPick = (want, tabs) => (want && tabs[want] && tabs[want].n > 0 ? want : tabs.today.n > 0 ? 'today' : 'earlier');
// 카드 id가 든 칸(탭이 없으면 null)
export const tabOfId = (lay, id) => { const tb = lay && lay.tabs, n = tb && tb.split && lay.tree.byId.get(id); return n ? tb.ofWs.get(n.workspaceKey || '') || null : null; };

export const PHONE = { FOLD: 4, PADX: 20, GX: 56, FH: 84, WH: 68, RT: 8, RB: 26, BANDGAP: 30, PGAP: 90, CW_K: 0.82, CW_MIN: 264, CW_MAX: 340, MAXPAGES: 3, GAIN: 1.2, SEP: 78 }; // P202: SEP = 오늘·이전 구분 줄 칸 높이

// ---- P202: 세션 맵 폴더 차례(오늘 일한 폴더 먼저, 각각 이름순)와 두 열 ----
// 이름순: 대소문자를 가리지 않고 숫자는 자연 순(localeCompare numeric·sensitivity base). 지역 설정에 따라 한글·영문 차례가 바뀌지 않게 언어를 'en'으로 못 박고(라틴 → 한글),
// 같다고 나오면(대소문자만 다름 등) 글자 코드 순으로 한 번 더 가른다(늘 같은 차례)
const COLLATE = (() => { try { return new Intl.Collator('en', { numeric: true, sensitivity: 'base' }); } catch { return null; } })();
export function nameCmp(a, b) {
  const x = String(a == null ? '' : a), y = String(b == null ? '' : b);
  const c = COLLATE ? COLLATE.compare(x, y) : x.localeCompare(y, 'en', { numeric: true, sensitivity: 'base' });
  return c || (x < y ? -1 : x > y ? 1 : 0);
}
// 이 PC 시각 자정(ms)
export const dayStart = (now = Date.now()) => { const d = new Date(now); d.setHours(0, 0, 0, 0); return d.getTime(); };
// 다음 자정까지 ms(맵을 연 채 자정이 지나면 차례를 다시 센다)
export const msToMidnight = (now = Date.now()) => { const d = new Date(now); d.setHours(24, 0, 0, 0); return Math.max(1000, d.getTime() - now); };
const atMs = (v) => (typeof v === 'number' ? v : v ? Date.parse(v) || 0 : 0);
// 세션이 오늘 활동했나: 지금 일하는 중(등급 work·live working)이면 오늘, 아니면 활동 시각(node.activeAt과 live lastActivityAt 중 늦은 것)이 오늘 자정 이후.
// P210: 그래프는 활동 시각만 바뀌면 다시 읽지 않으므로(graphKey) 창이 가진 세션 값의 더 늦은 시각도 본다
export function sessionToday(n, live, tier, now = Date.now()) {
  if (tier === 'work' || (live && live.state === 'working')) return true;
  const at = Math.max(atMs(n && n.activeAt), atMs(live && live.lastActivityAt));
  return at > 0 && at >= dayStart(now);
}
// 오늘 활동한 세션이 하나라도 있는 워크스페이스 키들(그래프 세션 노드에서). liveOf(node) → live 세션, tierOf(node) → 등급
export function todayWorkspaces(nodes, { liveOf = () => null, tierOf = () => null, now = Date.now() } = {}) {
  const out = new Set();
  for (const n of nodes || []) if (n && n.kind !== 'workspace' && sessionToday(n, liveOf(n), tierOf(n), now)) out.add(n.workspaceKey || '');
  return out;
}
// 폴더 묶음 차례: 오늘 일한 묶음(이름순) → 나머지(이름순). "폴더 없음"(id null)은 자기 칸 맨 끝. today = 워크스페이스 키 Set·배열(없으면 모두 나머지)
export function folderOrder(groups, today = null) {
  const set = today ? new Set([...today].map((k) => normKey(k))) : null;
  const isToday = (g) => !!set && g.keys.some((k) => set.has(normKey(k)));
  const cmp = (a, b) => (b.today - a.today) || ((a.id == null) - (b.id == null)) || nameCmp(a.name, b.name) || nameCmp(a.id, b.id);
  return (groups || []).map((g) => ({ ...g, today: isToday(g) })).sort(cmp);
}
// 두 열 판단: 한 열 배치의 칸 높이(measure: W, today, earlier, h, sep, head)로 맞춤 배율을 견준다.
// 두 열(왼쪽 오늘, 오른쪽 이전, 폭 2W + GAP, 높이 머리 + 긴 칸)의 맞춤 배율이 한 열보다 GAIN배 넘게 크면 2. 오늘·이전 칸이 둘 다 있어야 한다
// GAIN 1.15: 1.1 아래 차이는 눈에 띄지 않고 열이 둘로 갈려 읽는 차례만 바뀐다. 한 열이 두 열보다 15% 넘게 작아질 때(긴 판을 넓은 창에서 볼 때)만 나눈다
export const COLS2 = { GAIN: 1.15, GAP: 200, HD: 96, SEP: 110, PAD: 16 };
export function pickColumns(m, view, gain = COLS2.GAIN) {
  if (!m || !m.today || !m.earlier || !view || !(view.w > 0) || !(view.h > 0)) return 1;
  const fitK = (w, h) => Math.min((view.w - COLS2.PAD * 2) / w, (view.h - COLS2.PAD * 2) / h);
  const k1 = fitK(m.W, m.h), k2 = fitK(m.W * 2 + COLS2.GAP, (m.head || COLS2.HD) + Math.max(m.today, m.earlier));
  return k2 > k1 * gain ? 2 : 1;
}

// P159: 같은 칸에 위아래로 붙은 동료 카드 사이 선. 양끝은 각 카드의 가로 가운데(u 아래 변 → d 위 변, 틈 g).
// 폭이 같으면 세로 한 줄, 다르면 두 카드 사이 틈의 가운데에서 꺾는다(직각 유지). 옛 선은 카드 왼쪽 + 28에 서서 왼쪽으로 치우쳤다
export function peerPts(u, d, g = 0) {
  const ux = u.x + u.w / 2, dx = d.x + d.w / 2, y1 = u.y + u.h + g, y2 = d.y - g;
  if (Math.abs(ux - dx) < 0.5) return [[ux, y1], [ux, y2]];
  const my = (u.y + u.h + d.y) / 2;
  return [[ux, y1], [ux, my], [dx, my], [dx, y2]];
}

// P155: 세션 맵에서 누른 자리와 Alt로 끌기 종류를 정한다(단위 시험 test/p155-lib.test.mjs).
// 줄 머리 옮기기(group.move)는 Alt를 누른 채 마우스 왼쪽 단추로 줄 머리를 누를 때만. 그 밖은 어디서 시작하든 시점 이동.
// 손가락·펜은 옮기기가 없다(휴대폰은 PhoneMap.jsx라 여기 오지 않지만 터치 PC도 같게). 끄기가 시작된 뒤에는 Alt를 떼도 놓을 때까지 옮기기다
export function headDrag({ onHead = false, altKey = false, button = 0, pointerType = 'mouse' } = {}) {
  return onHead && altKey && button === 0 && pointerType === 'mouse' ? 'row' : 'pan';
}

// P153 r11: Alt+끌기로 세션 관계 바꾸기(단위 시험 test/p153-lib.test.mjs). 끄는 카드 dragId를 세계 점 (wx, wy)에 놓으면:
// - 다른 카드의 오른쪽(그 다음 칸 자리) → 그 카드의 하위(sub)
// - 같은 칸의 다른 카드 바로 위·아래 → 동료(peer)
// - 줄의 빈 시작 칸 → 독립(none)
// - 제자리(처음 카드 자리) 또는 그 밖 → 취소(null)
// 끄는 카드와 그 일 하위들은 대상이 되지 않는다(고리). → { kind: 'sub'|'peer'|'none', target(카드 id, none은 null), row(줄 키), box(미리 보기 상자) } | null
export function relationDrop(lay, dragId, wx, wy) {
  const me = lay.cards.get(dragId);
  if (!me) return null;
  if (wx >= me.x && wx <= me.x + me.w && wy >= me.y && wy <= me.y + me.h) return null; // 제자리 = 취소
  const desc = new Set([dragId]);
  const walk = (id, g) => { if (g > 100) return; for (const c of lay.tree.kids.get(id) || []) { desc.add(c.id); walk(c.id, g + 1); } };
  walk(dragId, 0);
  const GX = LINE.GX, PEERY = 56;
  // 동료: 같은 칸 카드 바로 위·아래 빈 틈(PEERY 안). 하위 자리(오른쪽 칸)와 겹치면 동료가 먼저(하위 칸 카드 바로 아래에 놓으면 그 카드의 동료)
  // P163: 얇은 줄 묶음 안의 좁은 틈은 동료 자리가 아니다(묶음 위·아래 끝만). 동료 자리는 같은 칸의 얇은 줄 안으로 뻗지 않는다(얇은 줄 위·아래 끝에서 멈춘다).
  // 틈에 놓으면 아래 하위 판정(부모 오른쪽 = 그 부모의 하위)으로 간다
  const thins = [...lay.cards.values()].filter((o) => o.thin);
  const thinNear = (c, up) => c.thin && thins.some((o) => o !== c && Math.abs(o.x - c.x) < 0.5 && (up ? o.y + o.h <= c.y && o.y + o.h > c.y - PEERY : o.y >= c.y + c.h && o.y < c.y + c.h + PEERY));
  const col = (c) => thins.filter((o) => o !== c && Math.abs(o.x - c.x) < 0.5);
  const upTo = (c) => Math.max(c.y - PEERY, ...col(c).filter((o) => o.y + o.h <= c.y).map((o) => o.y + o.h));
  const downTo = (c) => Math.min(c.y + c.h + PEERY, ...col(c).filter((o) => o.y >= c.y + c.h).map((o) => o.y));
  for (const [id, c] of lay.cards) {
    if (desc.has(id) || wx < c.x || wx > c.x + c.w) continue;
    if (wy >= upTo(c) && wy < c.y && !thinNear(c, true)) return { kind: 'peer', target: id, row: c.ws, box: { x: c.x, y: c.y - 10 - me.h, w: c.w, h: me.h } };
    if (wy > c.y + c.h && wy <= downTo(c) && !thinNear(c, false)) return { kind: 'peer', target: id, row: c.ws, box: { x: c.x, y: c.y + c.h + 10, w: c.w, h: me.h } };
  }
  let best = null;
  for (const [id, c] of lay.cards) {
    if (desc.has(id)) continue;
    // 하위: 오른쪽 칸 자리(카드 오른쪽 끝 ~ 다음 칸 카드 폭의 80%), 위아래로 조금 여유
    if ((c.depth >= 0 || c.solo) && wx >= c.x + c.w && wx <= c.x + c.w + GX + c.w * 0.8 && wy >= c.y - 24 && wy <= c.y + c.h + 24) {
      const d = Math.abs(wy - (c.y + c.h / 2));
      if (!best || d < best.d) best = { kind: 'sub', target: id, row: c.ws, d, box: { x: c.x + c.w + GX, y: c.y, w: c.w, h: c.h } };
    }
  }
  if (best) return { kind: best.kind, target: best.target, row: best.row, box: best.box };
  // P202: 두 열이면 줄은 x로도 가르고(같은 높이에 두 열의 줄이 있다), 시작 칸은 그 줄의 열 x를 더한다
  const row = lay.rows.find((r) => wy >= r.y && wy <= r.y + r.h && (lay.ncol > 1 ? wx >= (r.ox || 0) && wx <= (r.ox || 0) + lay.W : true));
  const col00 = (lay.cols.find((c) => c.key === 'lv' && c.level === 0) || {}).x;
  const col0 = col00 != null && row ? col00 + (row.ox || 0) : col00;
  if (row && col0 != null && wx >= col0 && wx <= col0 + lay.cw) {
    const busy = [...lay.cards.entries()].some(([id, c]) => !desc.has(id) && c.ws === row.key && Math.abs(c.x - col0) < 0.5 && wy >= c.y - 8 && wy <= c.y + c.h + 8);
    if (!busy) return { kind: 'none', target: null, row: row.key, box: { x: col0, y: Math.max(row.y + 8, wy - me.h / 2), w: lay.cw, h: me.h } };
  }
  return null;
}
// 놓은 자리 → 판 API relation.set 인자(P156 계약: "b는 a의 relation", a·b = 세션 id). 독립은 지금 일 부모(없으면 계보 부모)와의 관계를 none으로. 바꿀 것이 없으면 null
export function relationCall(lay, dragId, drop) {
  if (!drop) return null;
  const sid = (id) => (lay.tree.byId.get(id) || {}).sessionId || String(id).replace(/^s:/, '');
  const b = sid(dragId);
  if (drop.kind === 'sub' || drop.kind === 'peer') {
    if (drop.kind === 'sub' && lay.tree.parent.get(dragId) === drop.target) return null; // 이미 그 하위
    return { a: sid(drop.target), b, relation: drop.kind };
  }
  if (drop.kind === 'none') {
    const n = lay.tree.byId.get(dragId) || {};
    const p = lay.tree.parent.get(dragId) || n.lineageParent || null;
    return p ? { a: sid(p), b, relation: 'none' } : null;
  }
  return null;
}
// P156이 dev에 들어오기 전 흉내: 창에서 정한 관계 목록(sets: [{ a, b, relation }], 세션 id)을 그래프에 P156 계약 그대로 덮어씌운다.
// 선마다 relation·relationSource·relationUp, 세션마다 parentId(일 부모: 정한 하위가 이김, 정한 동료·독립 쌍의 계보 부모는 빠짐), lineageParent, peers
export function applyRelationStub(graph, sets) {
  if (!graph || !sets || !sets.length) return graph;
  const nodes = graph.nodes.map((n) => ({ ...n, peers: [...(n.peers || [])], lineageParent: n.lineageParent !== undefined ? n.lineageParent : n.parentId || null }));
  const byS = new Map(nodes.filter((n) => n.kind === 'session').map((n) => [n.sessionId, n]));
  const edges = graph.edges.map((e) => ({ ...e }));
  for (const { a, b, relation } of sets) {
    const A = byS.get(a), B = byS.get(b);
    if (!A || !B) continue;
    const pair = (e) => (e.from === A.id && e.to === B.id) || (e.from === B.id && e.to === A.id);
    for (const e of edges) if (pair(e)) { e.relation = relation === 'auto' ? undefined : relation; e.relationSource = relation === 'auto' ? 'auto' : 'user'; e.relationUp = relation === 'sub' ? A.id : undefined; }
    A.peers = A.peers.filter((x) => x !== B.id); B.peers = B.peers.filter((x) => x !== A.id);
    if (relation === 'sub') B.parentId = A.id;
    if (relation === 'peer' || relation === 'none') { if (B.parentId === A.id) B.parentId = null; if (A.parentId === B.id) A.parentId = null; }
    if (relation === 'peer') { A.peers.push(B.id); B.peers.push(A.id); }
    if (relation !== 'auto' && !edges.some(pair)) edges.push({ from: A.id, to: B.id, kind: 'relation', relation, relationSource: 'user', relationUp: relation === 'sub' ? A.id : undefined, count: 0 });
  }
  return { ...graph, nodes, edges };
}

// ---- P210: 세션 맵 성능. 배치(선 길 찾기 포함)·카드 그리기는 그 값이 바뀔 때만 다시 한다 ----
// 등급 표(카드 id → 등급): 같은 내용이면 앞 표(같은 객체)를 돌려준다. 일하는 세션의 활동 시각만 바뀌는 갱신에는 배치·역할 모델이 다시 돌지 않는다
export function keepSameMap(prev, next) {
  if (!prev || !next || prev.size !== next.size) return next;
  for (const [k, v] of next) if (!prev.has(k) || prev.get(k) !== v) return next;
  return prev;
}
// 그래프를 다시 읽을 세션 바뀜의 열쇠(글). 판 그래프(backend mission.mjs missionGraph)가 세션 요약에서 담는 값 중 자주 바뀌는 활동 시각(lastActivityAt)·턴 진행은 뺀다.
// 그 값은 창이 가진 세션 값(live)으로 카드가 바로 보인다(cardFacts). 세션이 생기거나 닫히면 열쇠가 바뀐다
const qText = (a) => (a ? [a.kind, a.summary, a.questions && a.questions[0] && a.questions[0].question].join('') : '');
const errText0 = (e) => (e ? (typeof e === 'string' ? e : e.message || '') : '');
export function graphKey(sessions) {
  const out = [];
  for (const s of (sessions && sessions.values ? sessions.values() : sessions || [])) {
    if (!s) continue;
    const br = s.branch || {};
    out.push([s.sessionId, s.name, s.kind, s.flavor, s.state, s.unseen ? 1 : 0, s.workspaceKey, s.lineageParentSessionId, s.parentSessionId, br.parentSessionId, br.depth, br.role, br.order, br.child ? 1 : 0,
      s.model, s.effort, s.state === 'working' && s.turn ? s.turn.startedAt : '', s.git && s.git.isWorktree ? s.git.branch : '', s.background ? JSON.stringify({ ...s.background, at: 0 }) : '',
      s.lastPrompt, qText(s.ask), s.waitingSince, errText0(s.error), s.loops, s.createdAt].join('\u0001'));
  }
  return out.join('\u0002');
}
// 새 그래프가 앞 그래프와 시각 값(at, activeAt, since, lastAt, count)만 다르면 앞 그래프(같은 객체)를 쓴다(배치를 다시 세지 않는다)
const VOLATILE = new Set(['at', 'activeAt', 'since', 'lastAt', 'count']);
export const graphSig = (g) => JSON.stringify(g, (k, v) => (VOLATILE.has(k) ? undefined : v));
export function keepSameGraph(prev, next) {
  if (!prev || !next || prev === next) return next;
  return graphSig(prev) === graphSig(next) ? prev : next;
}
// 카드 사실(cardFacts 결과)이 같은가. 글·수는 그대로, 객체(종류 k, 뒤 일 bg)는 내용으로 견준다
export function sameFacts(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    const x = a[k], y = b[k];
    if (x === y) continue;
    if (x && y && typeof x === 'object' && typeof y === 'object' && JSON.stringify(x) === JSON.stringify(y)) continue;
    return false;
  }
  return true;
}
// 새 배치의 카드 상자가 앞 배치의 것과 같으면 앞 상자(같은 객체)로 바꿔 둔다(카드 memo가 바뀐 카드만 다시 그린다). lay를 돌려준다
export function keepCardBoxes(prev, lay) {
  if (!prev || !lay || prev === lay) return lay;
  for (const [id, b] of lay.cards) { const pb = prev.cards.get(id); if (pb && pb !== b && sameFacts(pb, b)) lay.cards.set(id, pb); }
  return lay;
}
// 카드 사실 담기: id마다 앞 사실을 두고 같으면 앞 객체를 돌려준다(카드 memo가 다시 그리지 않는다)
export function factsKeeper() {
  const m = new Map();
  return (id, f) => { const old = m.get(id); if (old && sameFacts(old, f)) return old; m.set(id, f); return f; };
}
