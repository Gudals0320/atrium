// P153 단위 시험: 세션 맵 다듬기. 무리 묶기(역할·주고받은 연결, 닫힌 부모, 다른 워크스페이스의 부모, 큰 무리), 폴더 소속이 사이드바와 같음(키 정규화),
// 직각 선이 카드를 지나지 않음, 화면 비율에 맞춘 세계, 누르기 = 명령줄 태그(살펴보기 띠 없음), 더블클릭 = 판으로, 휴대폰 한 번 누르기, 이름(세션 맵).
// 모양은 실제 판과 같은 짜임의 지어낸 이름(폴더 3, 워크스페이스 11, 세션 32).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { territoryLayout, TERR, normKey, keyName, bestShelf, shelf, routeOrtho, longestMid, phoneTerr, tileTap } from '../src/renderer/lib/mission-terr.js';
import { groupLayout } from '../src/renderer/lib/sidebar-tree.js';
import { leadTags, toggleTag } from '../src/renderer/lib/cmd-input.js';
import en from '../src/renderer/locales/en.js';
import ko from '../src/renderer/locales/ko.js';

const R = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'renderer');
const read = (f) => fs.readFileSync(path.join(R, f), 'utf8');

// ---- 실제 판과 같은 짜임(지어낸 이름) ----
const FOLDERS = [
  { id: 'g1', name: 'Market', members: ['d:/work/market/web', 'd:/work/market/quant/.git'] },
  { id: 'g2', name: 'Hub', members: ['d:/hub/core/.git'] },
  { id: 'g3', name: 'Campus', members: ['c:/work/library/.git', 'd:/work/campus', 'c:/work/lab/robot/.git', 'd:/work/campus/pbl/.git'] },
];
const WS = ['c:/work/atrium/.git', 'd:/work/campus', 'd:/work/market/web', 'd:/hub/core/.git', 'd:/work/garden/.git', 'c:/work/library/.git', 'c:/work/notes/.git', 'c:/work/lab/robot/.git', 'd:/work/campus/pbl/.git', 'd:/work/campus/exam/.git', 'd:/work/market/quant/.git'];
// [이름, 워크스페이스, 부모(판에 있는 것만), 상태]
const S = [
  ['conductor', 0, null, 'working'], ['c1', 1], ['m1', 2], ['hub-head', 3], ['g1', 4], ['lib-1', 5], ['notes-2', 6], ['atrium-old', 0], ['robot-1', 7], ['robot-codex', 7], ['scribe', 5], ['exam-init', 9, null, 'error'], ['reviewer', 6],
  ['deck-lead', 8], ['deck-writer', 8], ['deck-reader', 8, null, 'waiting'], ['deck-reader-2', 8], ['exam-lead', 9],
  ...['ex-notes', 'ex-set-03', 'ex-set-04', 'ex-set-05', 'ex-qa-a', 'ex-qa-b', 'ex-qa-c'].map((n) => [n, 9, 'exam-lead']),
  ['media', 4, 'g1'], ['trial', 4, 'g1'], ['researcher', 10, 'm1'], ...['coin-feed', 'level-sets', 'signal-scan', 'band-model'].map((n) => [n, 10, 'researcher', 'working']),
];
const L = (src, dst, o = {}) => ({ src, dst, role: null, spawned: false, observed: true, ...o });
const LINKS = [
  L('robot-1', 'robot-codex', { role: 'worker-1-codex' }), L('robot-codex', 'robot-1'), L('lib-1', 'scribe', { role: 'writer' }),
  L('deck-writer', 'deck-reader', { role: 'reader1' }), L('deck-writer', 'deck-reader-2', { role: 'reader' }), L('deck-lead', 'deck-writer', { role: 'writer' }), L('deck-lead', 'deck-reader'), L('deck-lead', 'deck-reader-2'),
  ...['ex-notes', 'ex-set-03', 'ex-set-04', 'ex-set-05', 'ex-qa-a', 'ex-qa-b', 'ex-qa-c'].flatMap((n) => [L('exam-lead', n, { role: 'worker', spawned: true }), L(n, 'exam-lead')]),
  L('g1', 'media', { role: 'worker', spawned: true }), L('g1', 'trial', { role: 'worker', spawned: true, observed: false }), L('trial', 'g1'), L('media', 'g1'),
  L('m1', 'researcher', { role: 'researcher', spawned: true }), L('researcher', 'm1'),
  ...['coin-feed', 'level-sets', 'signal-scan', 'band-model'].flatMap((n) => [L('researcher', n, { role: 'worker', spawned: true }), L(n, 'researcher')]),
];
function graph() {
  const nodes = S.map(([name, w, parent, state], i) => ({ id: `s:${name}`, kind: 'session', sessionId: `x-${name}`, name, workspaceKey: WS[w], state: state || 'sleeping', parentId: parent ? `s:${parent}` : null, createdAt: i + 1 }));
  const edges = [];
  for (const l of LINKS) {
    const b = { from: `s:${l.src}`, to: `s:${l.dst}`, count: 3 };
    if (l.role) edges.push({ ...b, kind: 'role', label: l.role });
    if (l.observed) edges.push({ ...b, kind: 'prompt', label: 'report' });
    if (l.spawned) edges.push({ ...b, kind: 'spawn' });
  }
  return { nodes, edges };
}
const lay0 = (o = {}) => territoryLayout(graph(), { order: WS, vgroups: FOLDERS, ...o });
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (a, b) => a.x >= b.x - 0.01 && a.y >= b.y - 0.01 && a.x + a.w <= b.x + b.w + 0.01 && a.y + a.h <= b.y + b.h + 0.01;
const ringOf = (lay, id) => lay.rings.find((r) => r.lead === lay.tree.byId.get(id) && false) || lay.rings.find((r) => { const c = lay.cards.get(id); return c && inside(c, r); });

test('P153: 역할 연결·주고받은 연결로만 이어진 세션도 한 무리(나무)로 붙는다', () => {
  const lay = lay0();
  // deck-lead → deck-writer → deck-reader·deck-reader-2(띄움 없이 역할·시킴만)
  const ring = lay.rings.find((r) => r.lead === 's:deck-lead');
  assert.ok(ring, '무리 deck-lead');
  assert.equal(ring.n, 4);
  for (const n of ['deck-writer', 'deck-reader', 'deck-reader-2']) assert.ok(inside(lay.cards.get(`s:${n}`), ring), `${n}가 무리 안`);
  assert.equal(lay.tree.parent.get('s:deck-reader'), 's:deck-writer', '리더는 작성자 아래(역할 연결이 시킴보다 먼저)');
  assert.ok(lay.cards.get('s:deck-writer').y > lay.cards.get('s:deck-lead').y + TERR.CH, '하위는 리드 아래');
  // 주고받은 짝(역할 + 거꾸로 보고)도 한 무리
  for (const [lead, kid] of [['robot-1', 'robot-codex'], ['lib-1', 'scribe']]) {
    const r = lay.rings.find((x) => x.lead === `s:${lead}`);
    assert.ok(r && r.n === 2 && inside(lay.cards.get(`s:${kid}`), r), `${lead} 무리`);
  }
  // 띄움·역할 선은 모양(종류)으로 갈린다
  assert.equal(lay.edges.find((e) => e.to === 's:deck-writer').rel, 'role');
  assert.equal(lay.edges.find((e) => e.to === 's:media').rel, 'spawn');
});

test('P153: 부모가 닫힌 세션은 뿌리, 부모가 다른 워크스페이스면 자기 섬에서 리드 + 다른 워크스페이스 선', () => {
  const lay = lay0();
  // hub-head: 부모가 판에 없다 → 혼자(무리 없음), 자기 섬 안
  assert.ok(!lay.rings.some((r) => inside(lay.cards.get('s:hub-head'), r)));
  assert.equal(lay.cards.get('s:hub-head').ws, WS[3]);
  // researcher: 부모 m1은 다른 워크스페이스. 자기 섬(quant)에서 워커 넷의 리드
  const r = lay.rings.find((x) => x.lead === 's:researcher');
  assert.ok(r && r.n === 5 && r.ws === WS[10]);
  const e = lay.edges.find((x) => x.from === 's:m1' && x.to === 's:researcher');
  assert.ok(e && e.cross && e.label, '다른 워크스페이스 선과 이름표');
});

test('P153: 큰 무리(리드 + 워커 7)는 네 개씩 접고 겹치지 않는다', () => {
  const lay = lay0();
  const ring = lay.rings.find((x) => x.lead === 's:exam-lead');
  assert.equal(ring.n, 8);
  const kids = ['ex-notes', 'ex-set-03', 'ex-set-04', 'ex-set-05', 'ex-qa-a', 'ex-qa-b', 'ex-qa-c'].map((n) => lay.cards.get(`s:${n}`));
  assert.equal(new Set(kids.map((c) => c.y)).size, 2, '두 줄');
  assert.ok(ring.w < TERR.CW * 4 + TERR.GH * 3 + TERR.RP * 2 + 1, '한 줄 넷까지');
  const cards = [...lay.cards.values()];
  for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) assert.ok(!overlap(cards[i], cards[j]), `카드 ${cards[i].node.name}×${cards[j].node.name}`);
  for (const r of lay.rings) assert.ok(inside(r, lay.isles.find((i) => i.key === r.ws)), `무리 ${r.lead}가 섬 안`);
});

test('P153: 폴더 소속과 차례가 사이드바와 같다(키 정규화, 폴더 목록에 없는 하위 경로는 폴더 밖)', () => {
  const lay = lay0();
  const side = groupLayout(WS.map((key) => ({ key })), FOLDERS);
  for (const g of side.groups) {
    const want = g.workspaces.map((w) => w.key);
    const got = lay.isles.filter((i) => i.folder === g.id).map((i) => i.key);
    assert.deepEqual(got, want, `폴더 ${g.name}`);
    for (const k of got) assert.ok(inside(lay.isles.find((i) => i.key === k), lay.terrs.find((t) => t.id === g.id)), `${k}가 영토 안`);
  }
  assert.deepEqual(lay.isles.filter((i) => i.loose).map((i) => i.key), side.ungrouped.map((w) => w.key), '폴더 밖은 사이드바의 그룹 없음과 같은 차례');
  assert.ok(lay.isles.find((i) => i.key === 'd:/work/campus/exam/.git').loose, '경로가 폴더 안이어도 목록에 없으면 폴더 밖');
  assert.deepEqual(lay.terrs.map((t) => t.name), ['Market', 'Hub', 'Campus'], '영토 차례 = 사이드바 폴더 차례');
  // 폴더 목록의 키를 다른 꼴(대문자·역슬래시·끝 슬래시)로 써도 같은 워크스페이스
  const odd = FOLDERS.map((g) => ({ ...g, members: g.members.map((k) => k.toUpperCase().replace(/\//g, '\\') + '\\') }));
  const lay2 = territoryLayout(graph(), { order: WS, vgroups: odd });
  assert.deepEqual(lay2.isles.map((i) => [i.key, i.folder]), lay.isles.map((i) => [i.key, i.folder]));
  assert.equal(normKey('C:\\Work\\A\\.git\\'), 'c:/work/a/.git');
  assert.equal(keyName('d:/work/campus/pbl/.git'), 'pbl');
  assert.equal(keyName('d:/work/campus'), 'campus', '폴더 워크스페이스(.git 없음)도 마지막 폴더 이름');
});

// 축에 나란한 토막이 상자 안을 지나는가(가장자리에 닿는 것은 괜찮다)
const segHits = (a, b, r) => {
  const x1 = Math.min(a[0], b[0]), x2 = Math.max(a[0], b[0]), y1 = Math.min(a[1], b[1]), y2 = Math.max(a[1], b[1]);
  return x1 < r.x + r.w - 1 && x2 > r.x + 1 && y1 < r.y + r.h - 1 && y2 > r.y + 1;
};
test('P153: 선은 모두 직각이고 카드를 지나지 않는다', () => {
  for (const aspect of [1.4, 1.8, 2.6]) {
    const lay = lay0({ aspect });
    assert.equal(lay.edges.length, 19); // 나무 선 18 + 다른 워크스페이스 선 1(나무 밖 연결은 그리지 않는다)
    for (const e of lay.edges) {
      for (let i = 1; i < e.pts.length; i++) {
        const [a, b] = [e.pts[i - 1], e.pts[i]];
        assert.ok(a[0] === b[0] || a[1] === b[1], `${e.id} 토막 ${i}가 직각이 아니다`);
        for (const c of lay.cards.values()) assert.ok(!segHits(a, b, c), `${e.id}가 카드 ${c.node.name}를 지난다`);
      }
      assert.ok(Math.abs(e.pts[0][0] - (lay.cards.get(e.from).x + TERR.CW / 2)) < 0.01, '부모 카드 가운데에서 나간다');
      assert.ok(Math.abs(e.pts[e.pts.length - 1][0] - (lay.cards.get(e.to).x + TERR.CW / 2)) < 0.01, '하위 카드 가운데로 들어간다');
    }
  }
});

test('P153: 길 찾기는 막힌 상자를 돌아가고 먼저 그은 선 옆으로 비켜 간다', () => {
  const a = { x: 0, y: 300, w: 100, h: 60 }, b = { x: 600, y: 300, w: 100, h: 60 }, wall = { x: 200, y: 0, w: 200, h: 700 };
  const [p] = routeOrtho([{ a, b }], [a, b, wall], [], { G: 16 });
  assert.ok(p && p.length >= 4);
  for (let i = 1; i < p.length; i++) { assert.ok(p[i - 1][0] === p[i][0] || p[i - 1][1] === p[i][1]); assert.ok(!segHits(p[i - 1], p[i], wall)); }
  // 같은 두 카드 사이를 두 번: 두 번째는 첫째와 다른 칸으로(겹치지 않게 나란히)
  const two = routeOrtho([{ a, b }, { a, b }], [a, b, wall], [], { G: 16 });
  const ys = (q) => q.filter((pt, i) => i && q[i - 1][1] === pt[1]).map((pt) => pt[1]);
  assert.notDeepEqual(ys(two[0]), ys(two[1]));
  assert.deepEqual(longestMid([[0, 0], [0, 50], [300, 50], [300, 80]]), { x: 150, y: 50 });
});

test('P153: 세계는 보기 칸 비율에 맞춰 짠다(가장 크게 보이는 선반)', () => {
  const items = Array.from({ length: 9 }, (_, i) => ({ w: 400 + (i % 3) * 100, h: 300 }));
  for (const aspect of [1, 2, 3]) {
    const best = bestShelf(items, 40, aspect);
    const score = (s) => Math.max(s.w / aspect, s.h);
    for (const t of [500, 1200, 2000, 5000]) assert.ok(score(best) <= score(shelf(items, t, 40)) + 0.5, `비율 ${aspect} 목표 ${t}`);
  }
  const wide = lay0({ aspect: 2.4 }).bounds, tall = lay0({ aspect: 1.2 }).bounds;
  assert.ok(wide.w / wide.h > tall.w / tall.h);
});

test('P153: 카드 누르기 = 명령줄 태그 넣기·빼기(여럿), 앞머리 태그만 받는 세션', () => {
  assert.equal(toggleTag('', 'a'), '@a ');
  assert.equal(toggleTag('@a ', 'b'), '@a @b ');
  assert.equal(toggleTag('@a @b hello', 'a'), '@b hello');
  assert.equal(toggleTag('@a hello', 'A'), 'hello', '대소문자 상관없이 같은 이름은 뺀다');
  assert.equal(toggleTag('hello @x', 'a'), '@a hello @x', '글 중간 태그는 앞머리가 아니다');
  assert.deepEqual(leadTags('@a @b hi @c'), ['a', 'b']);
  assert.deepEqual(leadTags('hi'), []);
});

test('P153: 세션 맵은 살펴보기 띠·단계·미니맵·범례가 없고, 누르기 = 태그, 더블클릭·Enter = 판으로, 섬 머리 끌기 = group.move', () => {
  const src = read('MissionTerr.jsx');
  for (const gone of ['ta-inspect', 'ta-minimap', 'ta-legend', 'ta-level-', 'ta-open', 'ta-message']) assert.ok(!src.includes(gone), `${gone}가 남았다`);
  assert.match(src, /onClick=\{\(\) => onTag\(id\)\}/);
  assert.match(src, /onDoubleClick=\{\(\) => onOpen\(id\)\}/);
  assert.match(src, /'group\.move'/);
  assert.match(src, /mt-mm-donetag/, '작업 완료 표식(옛 지도와 같은 것)');
  assert.match(read('CommandBar.jsx'), /addEventListener\('tag'/);
});

test('P153: 휴대폰 타일은 크기와 상관없이 한 번 누르면 연다', () => {
  for (const z of [0.2, 0.6, 1, 3]) assert.equal(tileTap(z), 'open');
  const pt = phoneTerr(territoryLayout(graph(), { order: WS, vgroups: FOLDERS, routing: false }));
  assert.equal(pt.tiles.length, S.length);
});

test('P153: 이름은 세션 맵(Session map), 사전 두 벌의 새 글', () => {
  assert.equal(en.mission.title, 'Session map');
  assert.equal(ko.mission.title, '세션 맵');
  const strings = (o) => Object.values(o).flatMap((v) => (typeof v === 'string' ? [v] : v && typeof v === 'object' ? strings(v) : []));
  assert.ok(!strings(ko).some((s) => s.includes('관계도')), '한국어에 관계도가 남았다');
  assert.ok(!strings(en).some((s) => /mission map/i.test(s)), '영어에 mission map이 남았다');
  for (const k of ['cardTip', 'cardTipShell', 'isleTip', 'movedTo', 'movedOut', 'moveFail', 'solo', 'hint']) { assert.ok(en.mmTerr[k], `en ${k}`); assert.ok(ko.mmTerr[k], `ko ${k}`); }
});
