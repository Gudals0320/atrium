// P280: 휴대폰 세션 맵은 오늘 | 이전 탭(P207) 대신 PC 두 열처럼 오늘 칸 오른쪽에 이전 칸(lib/mission-lineage.js lineageLayout phone + columns: 2),
//   처음 보기·맞춤은 오늘 칸 폭 + 이전 칸 가장자리(lib/phone-map.js mapFit). 휴대폰 입력 칸 안내 글은 이름 없는 짧은 고정 글
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ML from '../src/renderer/lib/mission-lineage.js';
import * as PMAP from '../src/renderer/lib/phone-map.js';
import en from '../src/renderer/locales/en.js';
import ko from '../src/renderer/locales/ko.js';

const { lineageLayout, todayWorkspaces, dayStart, PHONE } = ML;
const { PM, mapFit, phoneFit, openView, saveView, loadView, VIEW_KEY } = PMAP;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, '..', 'src', 'renderer');
const NOON = new Date(2026, 10, 18, 12, 0, 0).getTime();
const MID = dayStart(NOON), OLD = MID - 3 * 86400e3;

// 폴더 다섯 + 폴더 없음. 오늘: zeta(z1), 나무(n1), 폴더 없음(loose). b1-x(이전 beta)의 부모는 z-lead(오늘)
const FOLDERS = [
  { id: 'gz', name: 'zeta', members: ['d:/w/z1', 'd:/w/z2'] },
  { id: 'ga', name: 'Alpha', members: ['d:/w/a2', 'd:/w/a10', 'd:/w/a1'] },
  { id: 'gn', name: '나무', members: ['d:/w/n1'] },
  { id: 'gb', name: 'beta', members: ['d:/w/b1'] },
  { id: 'gk', name: '가람', members: ['d:/w/k1'] },
];
const S = [
  ['z-lead', 'd:/w/z1', null, MID + 3600e3], ['z-kid', 'd:/w/z1', 'z-lead', OLD], ['z2-solo', 'd:/w/z2', null, OLD],
  ['a1', 'd:/w/a1', null, OLD], ['a2', 'd:/w/a2', null, OLD], ['a10-lead', 'd:/w/a10', null, OLD], ['a10-kid', 'd:/w/a10', 'a10-lead', OLD], ['a10-kid2', 'd:/w/a10', 'a10-lead', OLD],
  ['n1', 'd:/w/n1', null, OLD, 'working'], ['n1-peer', 'd:/w/n1', null, OLD],
  ['b1', 'd:/w/b1', null, OLD], ['b1-x', 'd:/w/b1', 'z-lead', OLD],
  ['k1', 'd:/w/k1', null, OLD], ['k1-2', 'd:/w/k1', null, OLD], ['k1-3', 'd:/w/k1', null, OLD],
  ['loose1', 'd:/w/loose', null, MID + 10], ['old-loose', 'd:/w/old', null, OLD],
];
const nodes = S.map(([name, ws, parent, activeAt, state], i) => ({ id: `s:${name}`, kind: 'session', sessionId: `x-${name}`, name, workspaceKey: ws, state: state || 'sleeping', parentId: parent ? `s:${parent}` : null, createdAt: i + 1, activeAt }));
const G = { nodes, edges: S.filter((x) => x[2]).map(([name, , parent]) => ({ from: `s:${parent}`, to: `s:${name}`, kind: 'spawn', count: 1 })) };
const tierFor = (n) => (n.state === 'working' ? 'work' : 'rest');
const TODAY = todayWorkspaces(G.nodes, { now: NOON, tierOf: tierFor });
const TIERS = new Map(G.nodes.map((n) => [n.id, tierFor(n)]));
const lay = (o = {}) => lineageLayout(G, { vgroups: FOLDERS, today: TODAY, tiers: TIERS, noFolder: 'No folder', phone: true, view: { w: 390, h: 640 }, ...o });
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const memStore = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m }; };
const badStore = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };


const lay2 = (o = {}) => lay({ columns: 2, ...o });

test('두 칸이 다 있으면 오늘 칸 오른쪽에 이전 칸(한 캔버스, 열마다 위 머리), 모든 카드가 놓인다', () => {
  const L = lay2();
  assert.equal(L.ncol, 2);
  assert.equal(L.cards.size, S.length, '두 칸의 모든 카드');
  assert.ok(!('tabs' in L), '탭 없음');
  assert.deepEqual(L.sections.map((s) => [s.kind, s.mode, s.col]), [['today', 'head', 0], ['earlier', 'head', 1]]);
  assert.equal(L.sections[1].x, L.colDx); assert.ok(L.colDx <= L.W + PHONE.CGAP, '오늘 칸 폭은 그 칸 카드까지');
  const tw = L.sections[0].w; assert.equal(L.colDx, tw + PHONE.CGAP);
  for (const r of L.rows.filter((x) => x.today)) assert.equal(r.w, tw);
  assert.equal(L.pages, 1, '두 열은 단을 나누지 않는다');
  const T = L.bands.filter((b) => b.col === 0).map((b) => b.id), E = L.bands.filter((b) => b.col === 1).map((b) => b.id);
  assert.deepEqual(T, ['gz', 'gn', null]); assert.deepEqual(E, ['ga', 'gb', 'gk']);
  for (const b of L.bands) assert.equal(b.y >= PHONE.SECH, true, '띠는 머리 아래');
  for (const [, c] of L.cards) {
    const today = L.rows.find((r) => r.key === c.ws).today; // 폴더째 오늘·이전
    assert.ok(today ? c.x + c.w <= L.colDx - PHONE.CGAP : c.x >= L.colDx, `${c.node.name}는 ${today ? '왼' : '오른'} 열`);
  }
  for (const r of L.rows) assert.equal(r.x, r.today ? 0 : L.colDx);
  const cs = [...L.cards.values()];
  for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) assert.ok(!overlap(cs[i], cs[j]), '카드 겹침 없음');
  assert.ok(L.edges.some((e) => e.to === 's:b1-x' && e.from === 's:z-lead'), '열을 건너는 부모 선(오늘 z-lead → 이전 b1-x)');
  assert.equal(L.bounds.w, L.colDx + L.W);
});
test('한쪽 칸만 있으면 지금처럼 한 열(머리·구분 줄 없음). columns를 주지 않으면 P202 한 열 구분 줄', () => {
  for (const today of [new Set(), null, new Set(G.nodes.map((n) => n.workspaceKey))]) {
    const L = lay2({ today });
    assert.equal(L.ncol, 1); assert.equal(L.cards.size, S.length); assert.equal(L.sections.length, 0);
    assert.deepEqual(mapFit(L, 390, 640), phoneFit(L.bounds, 390, 640), '한 열 맞춤은 전과 같다');
  }
  const P = lay();
  assert.equal(P.ncol, 1); assert.equal(P.sections.length, 1); assert.equal(P.sections[0].mode, 'line');
});
test('처음 보기·맞춤: 오늘 칸 폭에 맞추고 위에 붙이며, 이전 칸 머리와 카드 가장자리가 오른쪽 끝에 보인다', () => {
  for (const [w, h] of [[390, 640], [320, 560]]) {
    const L = lay2({ view: { w, h } }), f = mapFit(L, w, h, PHONE.PADX);
    const sx = (x) => x * f.k + f.x;
    assert.equal(f.y, PM.PAD, '위에 붙인다');
    const tr = Math.max(...[...L.cards.values()].filter((c) => c.x < L.colDx).map((c) => c.x + c.w));
    assert.ok(sx(0) >= 0 && sx(tr) <= w - PM.PEEK, '오늘 칸 카드가 다 보인다');
    assert.ok(sx(tr) > w * 0.75, '오늘 칸 폭에 맞춘다(작게 줄이지 않는다)');
    const ec = Math.min(...[...L.cards.values()].filter((c) => c.x >= L.colDx).map((c) => c.x));
    assert.ok(Math.abs(sx(ec) - (w - PM.PEEK)) < 1, '이전 카드 왼쪽 가장자리가 오른쪽 끝에서 PEEK만큼 보인다');
    assert.ok(sx(L.sections[1].x) < w - PM.PEEK && sx(L.sections[1].x) > w - 80, '이전 머리 글 시작도 오른쪽 끝에 보인다');
    // 처음 보기(기억 없음) = 맞춤
    const m = new Map(), st = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
    assert.deepEqual(openView(st, { w, h }, L), f);
    saveView(st, { w, h }, { k: 0.3, x: -500, y: 0 });
    assert.deepEqual(openView(st, { w, h }, L), { k: 0.3, x: -500, y: 0 }, '옮긴 보기는 기억');
  }
});
test('탭은 걷어냈다: 탭 함수·탭 기억·탭 문구·탭 CSS 없음, 옛 탭 시점 열쇠는 읽지 않는다', () => {
  for (const k of ['phoneTabs', 'tabPick', 'tabOfId']) assert.ok(!(k in ML), k);
  for (const k of ['loadTab', 'saveTab', 'TAB_KEY']) assert.ok(!(k in PMAP), k);
  for (const d of [en, ko]) assert.ok(!d.pmTab, 'pmTab 사전 없음');
  const pm = fs.readFileSync(path.join(SRC, 'PhoneMap.jsx'), 'utf8');
  assert.ok(!/pendingGo|switchTab|tabSel|tabRef|mt-pmap-tab|pmTab/.test(pm), 'PhoneMap에 탭 흔적 없음');
  assert.match(pm, /columns: 2/); assert.match(pm, /mapFit\(L, s\.w, s\.h/);
  assert.match(pm, /const allIds = ids;/, '알약은 모든 카드(두 칸)에서');
  const css = fs.readFileSync(path.join(SRC, 'phone.css'), 'utf8');
  assert.ok(!/\.mt-pmap-tab\b|P207/.test(css));
  // 옛 탭 열쇠("크기|탭")가 남아 있어도 읽지 않고, 다음 저장 때 버린다
  const m = new Map(), st = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
  m.set(VIEW_KEY, JSON.stringify({ '400x700|today': { k: 0.5, x: 1, y: 2 } }));
  assert.equal(loadView(st, { w: 390, h: 700 }), null);
  saveView(st, { w: 390, h: 700 }, { k: 1, x: 0, y: 0 });
  assert.deepEqual(Object.keys(JSON.parse(m.get(VIEW_KEY))), ['400x700']);
  const ml = fs.readFileSync(path.join(SRC, 'MissionLineage.jsx'), 'utf8');
  assert.ok(!/mapFit|PHONE\.CGAP/.test(ml), 'PC 맵은 그대로');
});
test('휴대폰 입력 칸 안내 글: 이름 없는 짧은 고정 글(ko·en), 한 줄 말줄임 CSS', () => {
  for (const d of [en, ko]) {
    for (const v of [d.phone.inputAgent, d.phoneBoard.fullType, d.cmdHead.phoneSteerOn]) { assert.ok(!/\{name\}/.test(v), v); assert.ok(v.length <= 16, v); }
  }
  assert.equal(ko.phone.inputAgent, '메시지'); assert.equal(ko.cmdHead.phoneSteerOn, '지금 일에 넣기'); assert.equal(ko.phoneBoard.fullType, '입력');
  assert.equal(en.phone.inputAgent, 'Message'); assert.equal(en.cmdHead.phoneSteerOn, 'Into this turn'); assert.equal(en.phoneBoard.fullType, 'Type');
  const ph = fs.readFileSync(path.join(SRC, 'Phone.jsx'), 'utf8'), pf = fs.readFileSync(path.join(SRC, 'PhoneFull.jsx'), 'utf8');
  assert.match(ph, /t\('phone\.inputAgent'\)/); assert.match(pf, /t\('phoneBoard\.fullType'\)/);
  assert.ok(!/placeholder=\{t\([^)]*name:/.test(ph + pf), '안내 글에 이름을 끼우지 않는다');
  const css = fs.readFileSync(path.join(SRC, 'phone.css'), 'utf8');
  assert.match(css, /\.mt-ph-input textarea::placeholder, \.mt-full-line textarea::placeholder \{ white-space: nowrap; overflow: hidden; text-overflow: ellipsis; \}/);
});
