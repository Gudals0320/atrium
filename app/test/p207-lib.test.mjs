// P207: 휴대폰 세션 맵 탭(오늘 | 이전). 고른 칸만 배치(lib/mission-lineage.js phoneTabs·tabPick·tabOfId, lineageLayout tab), 탭 기억·탭마다 시점(lib/phone-map.js)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lineageLayout, todayWorkspaces, dayStart, phoneTabs, tabPick, tabOfId } from '../src/renderer/lib/mission-lineage.js';
import { loadTab, saveTab, TAB_KEY, loadView, saveView, openView, VIEW_KEY, phoneFit } from '../src/renderer/lib/phone-map.js';
import en from '../src/renderer/locales/en.js';
import ko from '../src/renderer/locales/ko.js';

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

test('탭 기본값: 오늘 칸에 세션이 있으면 오늘, 탭 수 = 그 칸의 세션 수', () => {
  const L = lay({ tab: 'auto' });
  assert.equal(L.tabs.split, true);
  assert.equal(L.tabs.pick, 'today');
  assert.equal(L.tabs.today.n, 7, 'zeta 3 + 나무 2 + 폴더 없음 2');
  assert.equal(L.tabs.earlier.n, 10, 'Alpha 5 + beta 2 + 가람 3');
  assert.equal(L.tabs.today.n + L.tabs.earlier.n, S.length);
  assert.equal(tabPick('earlier', L.tabs), 'earlier');
  assert.equal(tabPick(null, L.tabs), 'today');
  assert.equal(tabPick('auto', L.tabs), 'today');
  assert.equal(tabPick('earlier', { today: { n: 3 }, earlier: { n: 0 } }), 'today', '고른 칸이 비면 기본');
  assert.equal(tabPick(null, { today: { n: 0 }, earlier: { n: 4 } }), 'earlier', '오늘이 비면 이전');
});
test('한 칸뿐이면 탭이 없고 지금처럼 한 칸을 다 놓는다(구분 줄 없음)', () => {
  for (const today of [new Set(), null, new Set(G.nodes.map((n) => n.workspaceKey))]) {
    const L = lay({ tab: 'auto', today });
    assert.equal(L.tabs.split, false); assert.equal(L.tabs.pick, null);
    assert.equal(L.cards.size, S.length, '모든 카드');
    assert.equal(L.sections.length, 0);
  }
  const L = lay({ tab: 'earlier', today: new Set() });
  assert.equal(L.cards.size, S.length, '고른 탭이 남아 있어도 칸이 하나면 다 놓는다');
});
test('고른 칸만 배치: 오늘 탭은 오늘 폴더, 이전 탭은 이전 폴더. 구분 줄 없음, 카드 겹침 없음', () => {
  const T = lay({ tab: 'today' }), E = lay({ tab: 'earlier' });
  assert.deepEqual(T.bands.map((b) => b.id), ['gz', 'gn', null]);
  assert.deepEqual(E.bands.map((b) => b.id), ['ga', 'gb', 'gk']);
  assert.equal(T.sections.length, 0); assert.equal(E.sections.length, 0);
  assert.equal(T.cards.size, 7); assert.equal(E.cards.size, 10);
  for (const [, b] of T.cards) assert.equal(T.tabs.ofWs.get(b.ws), 'today');
  for (const [, b] of E.cards) assert.equal(E.tabs.ofWs.get(b.ws), 'earlier');
  for (const L of [T, E]) {
    const cs = [...L.cards.values()];
    for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) assert.ok(!overlap(cs[i], cs[j]));
    for (const e of L.edges) assert.ok(L.cards.has(e.from) && L.cards.has(e.to), '선은 놓인 카드 사이만');
  }
  assert.ok(!E.edges.some((e) => e.to === 's:b1-x'), '다른 칸 부모(z-lead)로 가는 선은 없다');
  // 탭 없이(tab 안 줌) 부르면 P202처럼 한 열에 구분 줄
  assert.equal(lay().sections.length, 1);
  assert.equal(lay().tabs, null);
  // 칸마다 순서는 칸 안 폴더 차례
  assert.deepEqual(T.tabs.today.ids.slice(0, 3), ['s:z-lead', 's:z-kid', 's:z2-solo']);
});
test('다른 칸 주의 표시: 칸마다 응답 필요·오류 수', () => {
  const tiers = new Map(TIERS); tiers.set('s:b1', 'turn'); tiers.set('s:a1', 'alert'); tiers.set('s:z-kid', 'turn'); tiers.set('s:k1', 'review');
  const L = lay({ tab: 'today', tiers });
  assert.equal(L.tabs.today.attn, 1);
  assert.equal(L.tabs.earlier.attn, 2);
  const L2 = lay({ tab: 'earlier', tiers });
  assert.equal(L2.tabs.today.attn, 1, '고른 탭이 바뀌어도 수는 같다');
  // 순수 함수로도
  const t = phoneTabs([{ keys: ['a'], today: true }, { keys: ['b'], today: false }], [{ id: 1 }, { id: 2 }, { id: 3 }], (id) => (id === 1 ? 'a' : 'b'), (id) => (id === 3 ? 'alert' : 'rest'), 'earlier');
  assert.deepEqual([t.today.n, t.today.attn, t.earlier.n, t.earlier.attn, t.pick], [1, 0, 2, 1, 'earlier']);
});
test('다른 칸 카드로 가기: tabOfId가 그 카드의 칸을 알려 주고, goTo는 탭을 바꾼 뒤 간다', () => {
  const T = lay({ tab: 'today' });
  assert.equal(tabOfId(T, 's:b1-x'), 'earlier');
  assert.equal(tabOfId(T, 's:z-lead'), 'today');
  assert.equal(tabOfId(T, 's:none'), null);
  assert.equal(tabOfId(lay({ tab: 'auto', today: new Set() }), 's:b1'), null, '탭이 없으면 null');
  assert.ok(!T.cards.has('s:b1-x'));
  const E = lay({ tab: tabOfId(T, 's:b1-x') });
  assert.ok(E.cards.has('s:b1-x'), '탭을 바꾸면 그 카드가 놓인다');
  const pm = fs.readFileSync(path.join(SRC, 'PhoneMap.jsx'), 'utf8');
  assert.ok(/const k = tabOfId\(L, id\); if \(k && k !== L\.tabs\.pick\) \{ switchTab\(k, id\); return true; \}/.test(pm), 'goTo: 다른 칸이면 탭 바꾸기');
  assert.ok(/pendingGo\.current = goId/.test(pm) && /if \(go && lay\.cards\.has\(go\)\) \{ pendingGo\.current = null; goTo\(go\); \}/.test(pm), '탭을 연 뒤 그 카드로');
  assert.ok(/const allIds = tb \?/.test(pm) && /const attn = allIds\.filter/.test(pm) && /const list = allIds\.filter/.test(pm), '위 알약은 두 칸 모두');
  assert.ok(/tabOfId\(lay, `s:\$\{sid\}`\)/.test(pm), 'rig 건 알약도 다른 칸 카드로');
  assert.ok(/tab: tabSel \|\| 'auto'/.test(pm), '휴대폰 맵은 늘 탭 모드');
});
test('탭 기억: 같은 날이면 기억한 탭, 날이 바뀌면 잊는다(자정 뒤 기본 규칙), 저장소가 없거나 막혀도 된다', () => {
  const st = memStore();
  assert.equal(loadTab(st, MID), null);
  assert.equal(saveTab(st, 'earlier', MID), true);
  assert.equal(loadTab(st, MID), 'earlier');
  assert.equal(loadTab(st, MID + 86400e3), null, '자정 뒤');
  assert.equal(saveTab(st, 'bogus', MID), false);
  st.setItem(TAB_KEY, '{broken'); assert.equal(loadTab(st, MID), null);
  st.setItem(TAB_KEY, JSON.stringify({ tab: 'x', day: MID })); assert.equal(loadTab(st, MID), null);
  assert.equal(loadTab(badStore, MID), null); assert.equal(saveTab(badStore, 'today', MID), false);
  assert.equal(loadTab(null, MID), null); assert.equal(saveTab(null, 'today', MID), false);
  // 자정 뒤: 오늘 판단도 다시 센다(어제 오늘이던 z1은 이전)
  const next = todayWorkspaces(G.nodes, { now: NOON + 86400e3, tierOf: () => 'rest' });
  assert.equal(next.size, 0);
  const L = lay({ tab: loadTab(st, MID + 86400e3) || 'auto', today: next });
  assert.equal(L.tabs.split, false, '오늘 칸이 비면 탭 없음');
});
test('탭마다 시점을 따로 기억하고, 처음 연 탭은 맞춤. 탭 없는 열쇠는 전과 같다', () => {
  const st = memStore(), size = { w: 390, h: 700 };
  saveView(st, size, { k: 0.5, x: 10, y: 20 }, 'today');
  saveView(st, size, { k: 0.8, x: -30, y: 40 }, 'earlier');
  assert.deepEqual(loadView(st, size, 'today'), { k: 0.5, x: 10, y: 20 });
  assert.deepEqual(loadView(st, size, 'earlier'), { k: 0.8, x: -30, y: 40 });
  assert.equal(loadView(st, size), null, '탭 없는 보기는 따로');
  const b = { x: 0, y: 0, w: 400, h: 3000 };
  const st2 = memStore(); saveView(st2, size, { k: 0.5, x: 1, y: 2 }, 'today');
  assert.deepEqual(openView(st2, size, b, 'earlier'), phoneFit(b, size.w, size.h), '처음 연 탭은 맞춤');
  saveView(st, size, { k: 1, x: 0, y: 0 });
  assert.ok(Object.keys(JSON.parse(st.getItem(VIEW_KEY))).includes('400x700'), '탭 없는 열쇠');
  assert.equal(saveView(badStore, size, { k: 1, x: 0, y: 0 }, 'today'), false);
  assert.equal(loadView(badStore, size, 'today'), null);
});
test('문구·CSS: 두 사전에 탭 문구, 움직임 없음, PC 세션 맵은 탭을 쓰지 않는다', () => {
  for (const d of [en, ko]) { assert.ok(d.pmTab.label && /\{n\}/.test(d.pmTab.attn)); assert.ok(d.mmSec.today && d.mmSec.earlier); }
  assert.equal(ko.pmTab.attn.replace('{n}', 2), '응답 필요·오류 2개');
  const css = fs.readFileSync(path.join(SRC, 'phone.css'), 'utf8');
  const blk = css.slice(css.indexOf('/* P207'));
  assert.ok(blk.includes('.mt-pmap-tab') && !/transition|animation/.test(blk), '탭 CSS는 움직임 없음');
  const ml = fs.readFileSync(path.join(SRC, 'MissionLineage.jsx'), 'utf8');
  assert.ok(!/phoneTabs|tabOfId/.test(ml), 'PC 맵은 그대로');
});
