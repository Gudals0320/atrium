// P202: 세션 맵 폴더 차례(오늘 일한 폴더 먼저, 각각 이름순)와 PC 두 열, 휴대폰 구분 줄(lib/mission-lineage.js)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lineageLayout, nameCmp, dayStart, msToMidnight, sessionToday, todayWorkspaces, folderOrder, pickColumns, relationDrop, COLS2 } from '../src/renderer/lib/mission-lineage.js';
import { stepCard } from '../src/renderer/lib/mission-terr.js';
import en from '../src/renderer/locales/en.js';
import ko from '../src/renderer/locales/ko.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, '..', 'src', 'renderer');

// ---- 오늘 판단 ----
const NOON = new Date(2026, 10, 17, 12, 0, 0).getTime();
const MID = new Date(2026, 10, 17, 0, 0, 0).getTime();
test('오늘 판단: 이 PC 자정 이후 활동이면 오늘, 자정 바로 앞은 아님', () => {
  assert.equal(dayStart(NOON), MID);
  assert.equal(sessionToday({ activeAt: MID + 60e3 }, null, 'rest', NOON), true);
  assert.equal(sessionToday({ activeAt: MID - 60e3 }, null, 'rest', NOON), false);
  assert.equal(sessionToday({ activeAt: MID }, null, 'rest', MID + 1), true, '자정 정각은 오늘');
  // 자정 1분 뒤에 보면 1분 전(어제 23:59) 활동은 어제
  assert.equal(sessionToday({ activeAt: MID - 60e3 }, null, 'sleep', MID + 60e3), false);
  assert.equal(sessionToday({ activeAt: new Date(MID + 3600e3).toISOString() }, null, 'rest', NOON), true, 'ISO 글 시각도 읽는다');
});
test('오늘 판단: activeAt이 없으면 live lastActivityAt, 둘 다 없으면 아님, 일하는 중이면 늘 오늘', () => {
  assert.equal(sessionToday({}, { lastActivityAt: MID + 5 }, 'rest', NOON), true);
  assert.equal(sessionToday({}, { lastActivityAt: MID - 5 }, 'rest', NOON), false);
  assert.equal(sessionToday({}, null, 'rest', NOON), false);
  assert.equal(sessionToday({ activeAt: MID - 86400e3 }, null, 'work', NOON), true, '등급 work');
  assert.equal(sessionToday({}, { state: 'working' }, 'rest', NOON), true, 'live working');
  assert.equal(sessionToday({ activeAt: MID + 5 }, { lastActivityAt: MID - 5 }, 'rest', NOON), true, 'activeAt이 먼저');
});
test('자정까지 남은 시간', () => {
  assert.equal(msToMidnight(MID + 86400e3 - 5000), 5000);
  assert.ok(msToMidnight(NOON) === 12 * 3600e3);
});
test('todayWorkspaces: 오늘 활동한 세션이 하나라도 있는 워크스페이스', () => {
  const ns = [{ kind: 'session', workspaceKey: 'a', activeAt: MID + 1 }, { kind: 'session', workspaceKey: 'b', activeAt: MID - 1 }, { kind: 'session', workspaceKey: 'b', activeAt: MID - 9 }, { kind: 'session', workspaceKey: 'c', activeAt: 0, id: 'w' }];
  assert.deepEqual([...todayWorkspaces(ns, { now: NOON })].sort(), ['a']);
  assert.deepEqual([...todayWorkspaces(ns, { now: NOON, tierOf: (n) => (n.id === 'w' ? 'work' : 'rest') })].sort(), ['a', 'c']);
});

// ---- 이름순 ----
test('이름순: 대소문자를 가리지 않고 숫자는 자연 순, 한글·영문이 섞여도 늘 같은 차례', () => {
  const xs = ['beta', 'Alpha', 'item10', 'item2', '가나', 'alpha', 'Zeta', '다라', 'ITEM1'];
  const a = xs.slice().sort(nameCmp), b = xs.slice().reverse().sort(nameCmp);
  assert.deepEqual(a, b, '입력 차례와 무관');
  assert.deepEqual(a, ['Alpha', 'alpha', 'beta', 'ITEM1', 'item2', 'item10', 'Zeta', '가나', '다라']);
  assert.ok(nameCmp('alpha', 'Alpha') !== 0, '같다고 나와도 한 번 더 가른다');
});
test('folderOrder: 오늘 묶음(이름순) → 나머지(이름순), 폴더 없음은 자기 칸 맨 끝', () => {
  const gs = [{ id: null, name: 'No folder', keys: ['x'] }, { id: 'g2', name: 'beta', keys: ['b'] }, { id: 'g1', name: 'Alpha', keys: ['a'] }, { id: 'g3', name: 'Carrot', keys: ['c', 'c2'] }];
  assert.deepEqual(folderOrder(gs, null).map((g) => g.id), ['g1', 'g2', 'g3', null]);
  assert.deepEqual(folderOrder(gs, new Set(['c2', 'b'])).map((g) => g.id), ['g2', 'g3', 'g1', null]);
  assert.deepEqual(folderOrder(gs, new Set(['x', 'a'])).map((g) => [g.id, g.today]), [['g1', true], [null, true], ['g2', false], ['g3', false]]);
});

// ---- 배치 ----
// 폴더 다섯(한글·영문 섞임) + 폴더 없음. 오늘 일한 곳: 'zeta'(z1), '나무'(n1), 폴더 없음(loose1)
const FOLDERS = [
  { id: 'gz', name: 'zeta', members: ['d:/w/z1', 'd:/w/z2'] },
  { id: 'ga', name: 'Alpha', members: ['d:/w/a2', 'd:/w/a10', 'd:/w/a1'] },
  { id: 'gn', name: '나무', members: ['d:/w/n1'] },
  { id: 'gb', name: 'beta', members: ['d:/w/b1'] },
  { id: 'gk', name: '가람', members: ['d:/w/k1'] },
];
const OLD = MID - 3 * 86400e3;
// [이름, 워크스페이스, 부모, activeAt, 상태]
const S = [
  ['z-lead', 'd:/w/z1', null, MID + 3600e3], ['z-kid', 'd:/w/z1', 'z-lead', OLD], ['z2-solo', 'd:/w/z2', null, OLD],
  ['a1', 'd:/w/a1', null, OLD], ['a2', 'd:/w/a2', null, OLD], ['a10-lead', 'd:/w/a10', null, OLD], ['a10-kid', 'd:/w/a10', 'a10-lead', OLD], ['a10-kid2', 'd:/w/a10', 'a10-lead', OLD],
  ['n1', 'd:/w/n1', null, OLD, 'working'], ['n1-peer', 'd:/w/n1', null, OLD],
  ['b1', 'd:/w/b1', null, OLD], ['b1-x', 'd:/w/b1', 'z-lead', OLD],
  ['k1', 'd:/w/k1', null, OLD], ['k1-2', 'd:/w/k1', null, OLD], ['k1-3', 'd:/w/k1', null, OLD],
  ['loose1', 'd:/w/loose', null, MID + 10], ['old-loose', 'd:/w/old', null, OLD],
];
function graph() {
  const nodes = S.map(([name, ws, parent, activeAt, state], i) => ({ id: `s:${name}`, kind: 'session', sessionId: `x-${name}`, name, workspaceKey: ws, state: state || 'sleeping', parentId: parent ? `s:${parent}` : null, createdAt: i + 1, activeAt }));
  const edges = S.filter((x) => x[2]).map(([name, , parent]) => ({ from: `s:${parent}`, to: `s:${name}`, kind: 'spawn', count: 1 }));
  return { nodes, edges };
}
const G = graph();
const TODAY = todayWorkspaces(G.nodes, { now: NOON, tierOf: (n) => (n.state === 'working' ? 'work' : 'rest') });
const lay = (o = {}) => lineageLayout(G, { vgroups: FOLDERS, today: TODAY, noFolder: 'No folder', ...o });
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

test('배치 차례: 오늘 폴더(이름순) → 폴더 없음(오늘) → 이전 폴더(이름순) → 폴더 없음(이전 칸 없음: 폴더 없음은 한 묶음)', () => {
  assert.deepEqual([...TODAY].sort(), ['d:/w/loose', 'd:/w/n1', 'd:/w/z1']);
  const L = lay();
  // 폴더 없음 묶음은 하나다(오늘 loose와 이전 old가 같은 묶음 → 오늘 칸)
  assert.deepEqual(L.bands.map((b) => [b.id, b.today]), [['gz', true], ['gn', true], [null, true], ['ga', false], ['gb', false], ['gk', false]]);
  assert.equal(L.ncol, 1);
  assert.deepEqual(L.rows.filter((r) => r.band === 'ga').map((r) => r.key), ['d:/w/a1', 'd:/w/a2', 'd:/w/a10'], '폴더 안 워크스페이스는 이름순(숫자 자연 순), 사이드바 차례가 아니다');
  assert.deepEqual(L.rows.filter((r) => r.band === 'gz').map((r) => r.key), ['d:/w/z1', 'd:/w/z2'], '오늘 여부로 폴더 안을 다시 나누지 않는다');
  // 한 열 구분 줄: 오늘 칸 마지막 띠 아래, 이전 칸 첫 띠 위
  assert.equal(L.sections.length, 1);
  const s = L.sections[0], lastToday = L.bands[2], firstOld = L.bands[3];
  assert.equal(s.mode, 'line');
  assert.ok(s.y >= lastToday.y + lastToday.h - 0.01 && s.y + s.h <= firstOld.y + 0.01, '구분 줄은 두 칸 사이');
});
test('오늘 칸이나 이전 칸이 없으면 구분 줄도 없다', () => {
  assert.equal(lay({ today: new Set() }).sections.length, 0);
  assert.equal(lay({ today: null }).sections.length, 0);
  const all = new Set(G.nodes.map((n) => n.workspaceKey));
  const L = lay({ today: all });
  assert.equal(L.sections.length, 0);
  assert.equal(lay({ today: all, columns: 2 }).ncol, 1, '칸이 하나면 두 열도 없다');
  assert.equal(lay({ today: new Set() }).bands.at(-1).id, null, '폴더 없음은 맨 끝');
});
test('사이드바 손 차례(order)와 사이드바 폴더 차례는 맵 차례에 쓰지 않는다', () => {
  const a = lay(), b = lay({ order: ['d:/w/old', 'd:/w/a10'], vgroups: FOLDERS.slice().reverse().map((g) => ({ ...g, members: g.members.slice().reverse() })) });
  assert.deepEqual(a.rows.map((r) => r.key), b.rows.map((r) => r.key));
});

test('pickColumns: 두 열 맞춤 배율이 한 열보다 GAIN배 넘게 크면 2', () => {
  const m = { W: 2000, today: 3000, earlier: 3000, h: 6110, head: 96 };
  assert.equal(pickColumns(m, { w: 1600, h: 900 }), 2, '긴 판, 넓은 창');
  assert.equal(pickColumns(m, { w: 600, h: 1600 }), 1, '좁고 긴 창: 폭이 모자라 한 열');
  assert.equal(pickColumns({ ...m, today: 0 }, { w: 1600, h: 900 }), 1, '오늘 칸이 없으면 한 열');
  assert.equal(pickColumns(m, null), 1);
  // 경계: 두 열 k2 = k1 × GAIN 바로 위·아래
  const short = { W: 2000, today: 500, earlier: 500, h: 1110, head: 96 };
  assert.equal(pickColumns(short, { w: 1600, h: 900 }), 1, '짧은 판은 폭 맞춤이라 두 열 이득이 없다');
  assert.equal(COLS2.GAIN, 1.15);
});

test('두 열 배치: 왼쪽 오늘, 오른쪽 이전, 카드가 겹치지 않고 열 머리 이름표·칸 머리가 열마다', () => {
  const L = lay({ columns: 2 });
  assert.equal(L.ncol, 2);
  assert.equal(L.colDx, L.W + COLS2.GAP);
  assert.deepEqual(L.sections.map((s) => [s.kind, s.mode, s.x]), [['today', 'head', 0], ['earlier', 'head', L.colDx]]);
  for (const b of L.bands) assert.equal(b.x, b.today ? 0 : L.colDx, `${b.name} 열`);
  const top = L.sections[0].h;
  assert.equal(Math.min(...L.bands.filter((b) => b.today).map((b) => b.y)), top, '왼쪽 열은 머리 아래부터');
  assert.equal(Math.min(...L.bands.filter((b) => !b.today).map((b) => b.y)), top, '오른쪽 열도 머리 아래부터');
  for (const r of L.rows) { const b = L.bands.find((x) => x.id === r.band); assert.ok(r.x >= b.x && r.x + r.w <= b.x + L.W + 0.01, `${r.key} 줄은 자기 열 띠 안`); assert.equal(r.ox, b.x); }
  const cards = [...L.cards.values()];
  for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) assert.ok(!overlap(cards[i], cards[j]), `${cards[i].node.name}×${cards[j].node.name}`);
  for (const c of cards) { const r = L.rows.find((x) => x.key === c.ws); assert.ok(c.x >= r.ox && c.x + c.w <= r.ox + L.W && c.y >= r.y && c.y + c.h <= r.y + r.h + 0.01, `${c.node.name}는 자기 줄 안`); }
  // 같은 칸은 열이 달라도 같은 자리(오른쪽 열 = 왼쪽 열 + colDx)
  const lv0 = L.cols.filter((c) => c.key === 'lv' && c.level === 0);
  assert.deepEqual(lv0.map((c) => c.c), [0, 1]);
  assert.equal(lv0[1].x - lv0[0].x, L.colDx);
  assert.equal(L.cards.get('s:a10-lead').x, lv0[1].x, '오른쪽 열 시작 칸');
  assert.equal(L.cards.get('s:z-lead').x, lv0[0].x, '왼쪽 열 시작 칸');
  assert.equal(L.bounds.w, L.W * 2 + COLS2.GAP);
  assert.equal(L.bounds.h, Math.max(...L.bands.map((b) => b.y + b.h)));
});
test('두 열 ↑↓ 차례: 왼쪽 열 위에서 아래, 그다음 오른쪽 열', () => {
  const L = lay({ columns: 2 });
  const col = (id) => (L.cards.get(id).x >= L.colDx ? 1 : 0);
  const cs = L.order.map(col);
  assert.deepEqual(cs, cs.slice().sort((a, b) => a - b), '왼쪽 열 카드가 모두 먼저');
  const firstRight = L.order.find((id) => col(id) === 1), lastLeft = [...L.order].reverse().find((id) => col(id) === 0);
  assert.equal(stepCard(L.order, lastLeft, 1), firstRight);
  assert.equal(stepCard(L.order, firstRight, -1), lastLeft);
  // 줄 차례 = 띠 차례
  const rowsOrder = [...new Set(L.order.map((id) => L.cards.get(id).ws))];
  assert.deepEqual(rowsOrder, L.rows.filter((r) => [...L.cards.values()].some((c) => c.ws === r.key)).map((r) => r.key));
});
test('두 열: 열 사이를 건너는 선(다른 워크스페이스 하위)도 그린다, Alt 끌기 판정은 오른쪽 열에서도 맞다', () => {
  const L = lay({ columns: 2 });
  const e = L.edges.find((x) => x.from === 's:z-lead' && x.to === 's:b1-x');
  assert.ok(e && e.cross && e.pts.length >= 2, '열 사이 선');
  // 오른쪽 열 빈 시작 칸에 놓기 = 독립
  const r = L.rows.find((x) => x.key === 'd:/w/k1');
  const lv0 = L.cols.find((c) => c.key === 'lv' && c.level === 0 && c.c === 1).x;
  const bottom = Math.max(...[...L.cards.values()].filter((c) => c.ws === r.key).map((c) => c.y + c.h));
  const d = relationDrop(L, 's:b1-x', lv0 + 20, Math.min(r.y + r.h - 10, bottom + 60));
  assert.ok(!d || d.row === r.key, '줄은 오른쪽 열 줄');
  // 왼쪽 열 같은 높이에 놓으면 왼쪽 열 줄
  const ly = L.rows.find((x) => x.col === 0 && x.y <= r.y + 5 && x.y + x.h >= r.y + 5);
  if (ly) { const d2 = relationDrop(L, 's:b1-x', L.cols.find((c) => c.key === 'lv' && c.level === 0 && c.c === 0).x + 20, r.y + 5); assert.ok(!d2 || d2.row !== r.key); }
});
test('auto: 넓고 낮은 보기 칸이면 두 열, 좁은 칸이면 한 열(두 열 판단은 맞춤 배율 비교)', () => {
  const one = lay({ columns: 1 });
  const m = one.measure;
  assert.ok(m.today > 0 && m.earlier > 0 && m.h === one.bounds.h);
  const wide = { w: Math.round(m.W * 2.6), h: Math.round(Math.max(m.today, m.earlier) * 0.9) };
  assert.equal(lay({ columns: 'auto', view: wide }).ncol, pickColumns(m, wide));
  assert.equal(pickColumns(m, wide), 2);
  assert.equal(lay({ columns: 'auto', view: { w: 500, h: 4000 } }).ncol, 1);
  assert.equal(lay({ columns: 'auto', view: null }).ncol, 1);
});

test('휴대폰: 한 열 그대로, 차례는 같은 규칙, 오늘과 이전 사이 구분 이름표', () => {
  const P = lay({ phone: true, pages: 1 });
  assert.equal(P.ncol, 1);
  const pc = lay();
  assert.deepEqual(P.rows.map((r) => r.key), pc.rows.map((r) => r.key), 'PC와 같은 줄 차례');
  assert.equal(P.sections.length, 1);
  const s = P.sections[0];
  const lastToday = P.rows.filter((r) => r.today).at(-1), firstOld = P.rows.find((r) => !r.today);
  assert.ok(s.y >= lastToday.y + lastToday.h - 0.01 && s.y + s.h <= firstOld.y + 0.01, '구분 줄은 두 칸 사이');
  const cards = [...P.cards.values()];
  for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) assert.ok(!overlap(cards[i], cards[j]));
  // 단으로 나눠도 구분 줄은 이전 칸 첫 줄 바로 위
  const P2 = lay({ phone: true, pages: 2 });
  const s2 = P2.sections[0], f2 = P2.rows.find((r) => !r.today);
  assert.equal(s2.page, f2.page);
  assert.ok(s2.y + s2.h <= f2.y + 0.01 && s2.y + s2.h >= f2.y - 120, '구분 줄은 이전 첫 줄 바로 위');
  for (const r of P2.rows) for (const q of P2.rows) if (r !== q && r.page === q.page) assert.ok(r.y + r.h <= q.y + 0.01 || q.y + q.h <= r.y + 0.01, '줄이 겹치지 않는다');
});

test('문구·화면: 두 사전에 오늘·이전, 맵은 사이드바 손 차례를 넘기지 않고 자정에 다시 센다', () => {
  assert.equal(en.mmSec.today, 'Today'); assert.equal(en.mmSec.earlier, 'Earlier');
  assert.equal(ko.mmSec.today, '오늘'); assert.equal(ko.mmSec.earlier, '이전');
  const ml = fs.readFileSync(path.join(SRC, 'MissionLineage.jsx'), 'utf8'), pm = fs.readFileSync(path.join(SRC, 'PhoneMap.jsx'), 'utf8');
  for (const src of [ml, pm]) {
    assert.ok(!/lineageLayout\([^)]*\border\b/.test(src.replace(/\n/g, ' ').match(/useMemo\(\(\) => \(\{[^]*?\}\)/)?.[0] || ''), '맵 배치 옵션에 order 없음');
    assert.ok(/msToMidnight\(\)/.test(src) && /todayWorkspaces\(/.test(src), '자정 다시 세기·오늘 판단');
  }
  assert.ok(/columns: 'auto'/.test(ml), 'PC는 두 열 자동');
  const css = fs.readFileSync(path.join(SRC, 'styles.css'), 'utf8');
  const sec = css.slice(css.indexOf('/* P202: 세션 맵 오늘·이전 이름표'));
  assert.ok(sec.length > 10 && !/animation|transition/.test(sec), '이름표는 움직임에 기대지 않는다');
  assert.ok(/data-sticky0\] \.colh\[data-c="0"\]/.test(css) && /data-sticky1\] \.colh\[data-c="1"\]/.test(css), '붙는 머리는 열마다');
});
