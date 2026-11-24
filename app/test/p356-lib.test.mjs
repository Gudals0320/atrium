// P356: 휴대폰 맵 탭(lib/mobile-map.js, MobileMap.jsx)과 홈·세션 목록의 얼굴이 판 세션 맵과 같은 함수에서 나오는지, 맵 CSS 고르기(scripts/css-pick.mjs)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';
import { liveFromRow, graphOf, structKey, tiersOf, visibleIds, visibleEdges, worldRect, sameList, todoCounts, categoryOf, MV, loadMapView, saveMapView, firstCard, cardView, openMapView, bandFitView } from '../src/renderer/lib/mobile-map.js';
import { lineageLayout } from '../src/renderer/lib/mission-lineage.js';
import { missionTree, nodeTier } from '../src/renderer/lib/mission-model.js';
import { pickCss, MAP_KEEP, splitSelectors } from '../scripts/css-pick.mjs';
import { mapOf, rowOf } from '../../backend/src/phone.mjs';
import { missionGraph } from '../../backend/src/mission.mjs';
import en from '../src/renderer/locales/en.js';
import ko from '../src/renderer/locales/ko.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const R = path.join(ROOT, 'src', 'renderer');
const read = (f) => fs.readFileSync(path.join(R, f), 'utf8');
const P = 'aaaaaaaa-bbbb-cccc-dddddddddddd';
const sid = (i) => 'id-' + String(i).padStart(4, '0') + '-' + P;
// 판 세션 요약 흉내(세 워크스페이스, 리드 둘과 하위들, 셸, 잠든 세션, 묻는 세션)
function sum(i, over = {}) {
  const lead = i === 1 || i === 20;
  const parent = i > 1 && i < 8 ? sid(1) : i > 20 && i < 24 ? sid(20) : null;
  return {
    sessionId: sid(i), name: 's' + i, workspaceKey: 'c:/w/ws' + (i < 10 ? 1 : i < 20 ? 2 : 3), kind: i % 5 === 0 ? 'shell' : 'claude', state: i === 3 ? 'waiting' : i === 4 ? 'working' : i % 3 === 0 ? 'sleeping' : 'ready',
    createdAt: 1e12 + i, lastActivityAt: 1e12 + i * 1000, lastPrompt: 'prompt ' + i, lastAnswer: 'answer ' + i, parentSessionId: parent, lineageParentSessionId: parent,
    model: 'claude-haiku-5-5', effort: 'low', turn: i === 4 ? { startedAt: 1e12 } : null, ask: i === 3 ? { kind: 'permission', tool: 'Bash', summary: 'Bash: mkdir x' } : null,
    branch: parent ? { child: true, role: 'worker', order: i, depth: 2 } : null, unseen: i === 6, shell: i % 5 === 0 ? { atPrompt: true } : null, ...(lead ? {} : {}), ...over,
  };
}
const sums = Array.from({ length: 30 }, (_, i) => sum(i + 1));
const links = sums.filter((s) => s.parentSessionId).map((s) => ({ from: s.parentSessionId, to: s.sessionId, linkId: 'l' + s.name, spawned: true, role: 'worker' }));
const full = missionGraph({ sessions: sums, links, thread: [], loops: [] });
const rows = new Map(sums.map((s) => { const r = rowOf(s); return [r.sessionId, r]; }));
const small = JSON.parse(JSON.stringify(mapOf(full, [{ id: 'g', name: 'F', members: ['c:/w/ws1', 'c:/w/ws2'] }])));

test('구조 답 + 휴대폰 줄 → 판 세션 맵과 같은 나무(부모·하위·동료)', () => {
  const g = graphOf(small, rows);
  const a = missionTree(full), b = missionTree(g);
  assert.equal(b.nodes.length, 30);
  assert.deepEqual([...b.parent.entries()].sort(), [...a.parent.entries()].sort());
  const n = g.nodes.find((x) => x.sessionId === sid(5));
  assert.equal(n.name, 's5'); assert.equal(n.workspaceKey, 'c:/w/ws1'); assert.equal(n.parentId, 's:' + sid(1)); assert.equal(n.role, 'worker');
});

test('같은 등급·같은 보기에서 맵 탭 배치 = 판 세션 맵 배치(카드 자리·선)', () => {
  const g = graphOf(small, rows);
  const tiersA = new Map(full.nodes.filter((n) => n.kind === 'session').map((n) => [n.id, nodeTier(n, sums.find((s) => s.sessionId === n.sessionId))]));
  const tiersB = tiersOf(g, rows);
  assert.deepEqual([...tiersB.entries()].sort(), [...tiersA.entries()].sort(), '등급(휴대폰 줄로 셈) = 판 요약으로 셈');
  const opt = { vgroups: small.groups, tiers: tiersA, phone: true, view: { w: 390, h: 700 }, columns: 2 };
  const A = lineageLayout(full, opt), B = lineageLayout(g, { ...opt, tiers: tiersB });
  const box = (L) => [...L.cards.entries()].map(([id, c]) => [id, c.x, c.y, c.w, c.h]).sort();
  assert.deepEqual(box(B), box(A));
  assert.deepEqual(B.edges.map((e) => e.d).sort(), A.edges.map((e) => e.d).sort());
});

test('휴대폰 줄 → 판 세션 요약 모양(카드 사실이 읽는 칸)', () => {
  const w = liveFromRow(rows.get(sid(4)));
  assert.equal(w.state, 'working'); assert.equal(w.lastPrompt, 'prompt 4'); assert.deepEqual(w.turn, { startedAt: 1e12 }); assert.equal(w.model, 'haiku-5-5');
  const a = liveFromRow(rows.get(sid(3)));
  assert.equal(a.ask.kind, 'permission'); assert.equal(a.ask.summary, 'mkdir x');
  const sh = liveFromRow(rowOf(sum(10, { shell: { atPrompt: false, command: 'npm test', program: false } })));
  assert.equal(sh.shell.command, 'npm test'); assert.equal(sh.shell.atPrompt, false);
  assert.equal(liveFromRow(rows.get(sid(6))).unseen, true);
  assert.equal(categoryOf({ state: 'ready', unseen: true }), 'done');
});

test('구조 열쇠: 상태가 바뀌어도 같고 부모·이름이 바뀌면 다르다', () => {
  const k = structKey(rows);
  const r2 = new Map(rows); r2.set(sid(2), { ...rows.get(sid(2)), state: 'working', lastActivityAt: 5 });
  assert.equal(structKey(r2), k);
  const r3 = new Map(rows); r3.set(sid(2), { ...rows.get(sid(2)), parentSessionId: sid(20) });
  assert.notEqual(structKey(r3), k);
});

test('보이는 카드만: 화면(여유 포함)에 닿는 카드와 선만 고른다', () => {
  const cards = new Map([['a', { x: 0, y: 0, w: 100, h: 50 }], ['b', { x: 1000, y: 0, w: 100, h: 50 }], ['c', { x: 0, y: 3000, w: 100, h: 50 }], ['d', { x: 5000, y: 5000, w: 100, h: 50 }]]);
  const v = { x: 0, y: 0, k: 1 }, size = { w: 400, h: 800 };
  assert.deepEqual(visibleIds(cards, ['a', 'b', 'c'], v, size, 0), ['a']);
  assert.deepEqual(visibleIds(cards, ['a', 'b', 'c'], v, size, 700), ['a', 'b']);
  assert.deepEqual(visibleIds(cards, ['a', 'b', 'c'], { x: 0, y: 0, k: 0.1 }, size, 0), ['a', 'b', 'c'], '멀리(배율 0.1)는 세계 4000×8000');
  assert.deepEqual(visibleIds(cards, ['a', 'b', 'c'], { x: -950, y: 0, k: 1 }, size, 0), ['b'], '옮기면 그 자리 카드');
  assert.deepEqual(worldRect({ x: -100, y: -50, k: 2 }, { w: 200, h: 100 }), { x0: 50, y0: 25, x1: 150, y1: 75 });
  const edges = [{ id: 'ab', from: 'a', to: 'b' }, { id: 'ac', from: 'a', to: 'c' }, { id: 'bd', from: 'b', to: 'd' }, { id: 'cd', from: 'c', to: 'd' }];
  assert.deepEqual(visibleEdges(edges, cards, v, size, 0).map((e) => e.id), ['ab', 'ac'], '두 끝을 감싼 사각형이 화면에 닿는 선만(화면 밖끼리는 뺀다)');
  assert.ok(sameList(['a'], ['a'])); assert.ok(!sameList(['a'], ['b']));
});

test('할 일 수: 미룬 카드는 빼고 세션마다', () => {
  assert.deepEqual([...todoCounts([{ sessionId: 'x' }, { sessionId: 'x' }, { sessionId: 'y', deferred: true }, { sessionId: 'z' }]).entries()], [['x', 2], ['z', 1]]);
});

test('맵 탭·홈 얼굴은 판 세션 맵 카드와 같은 모듈(MapCard.jsx Card·cardFacts)을 쓴다', () => {
  const pc = read('MissionLineage.jsx'), mm = read('MobileMap.jsx'), ma = read('MobileApp.jsx'), ph = read('PhoneMap.jsx');
  assert.match(pc, /from '\.\/MapCard\.jsx'/);
  assert.match(mm, /import \{ Card, cardFacts \} from '\.\/MapCard\.jsx'/);
  assert.match(ma, /import \{ cardFacts, DoneMark, ST \} from '\.\/MapCard\.jsx'/);
  assert.match(ph, /import \{ Card, Peek, cardFacts \} from '\.\/MissionLineage\.jsx'/, '옛 휴대폰 맵은 그대로(판 표식 포함 Card)');
  assert.ok(!/function cardFacts/.test(pc), 'PC 파일에 따로 된 cardFacts가 없다');
  // 맵 탭 조각은 판 store·캔버스·xterm·세션 화면을 들이지 않는다
  for (const bad of ['./store.js', 'xterm', './Canvas.jsx', './MissionLineage.jsx', './Phone.jsx', './api.js']) assert.ok(!mm.includes(`'${bad}'`) && !read('MapCard.jsx').includes(`'${bad}'`), bad);
  // 맵 탭은 늦게 읽는다(맨 위 import가 아님)
  assert.ok(!/^import .*MobileMap\.jsx/m.test(ma) && /import\('\.\/MobileMap\.jsx'\)/.test(ma));
});

test('카드 사실: 휴대폰 줄로 셈한 것 = 판 요약으로 셈한 것(상태 글·시간·모델·지금 일)', async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'mtask-run-p356-'));
  try {
    const file = path.join(out, 'card.mjs');
    await esbuild.build({ entryPoints: [path.join(R, 'MapCard.jsx')], outfile: file, bundle: true, format: 'esm', platform: 'node', jsx: 'automatic', loader: { '.js': 'jsx' }, logLevel: 'silent', define: { 'process.env.NODE_ENV': '"production"' } });
    const { cardFacts } = await import(pathToFileURL(file).href);
    const t = (k, p = {}) => k + JSON.stringify(p);
    const g = graphOf(small, rows);
    for (const i of [3, 4, 6, 9, 10]) {
      const n = g.nodes.find((x) => x.sessionId === sid(i)), s = sums.find((x) => x.sessionId === sid(i));
      const nf = full.nodes.find((x) => x.sessionId === sid(i));
      const tier = nodeTier(nf, s);
      const a = cardFacts(nf, s, null, tier, t, 2e12), b = cardFacts(n, liveFromRow(rows.get(sid(i))), null, tier, t, 2e12);
      for (const k of ['stateText', 'age', 'model', 'harness', 'taskKind', 'shell']) assert.deepEqual(b[k], a[k], i + ' ' + k);
    }
  } finally { fs.rmSync(out, { recursive: true, force: true }); }
});

test('맵 CSS 고르기: 세션 맵 규칙만, :root는 색 토큰만, 쓰는 키프레임만, 빈 미디어 블록은 뺀다', () => {
  const src = `:root { --a: 1; color: red; }
.mt-tail { x: 1 }
.mt-ta-card, .mt-node { a: 1 }
/* 주석 .mt-ta-x { } */
@media (max-width: 9px) { .mt-node { b: 2 } .mt-sm-row { c: 3 } }
@media print { .mt-node { d: 4 } }
@keyframes mt-mm-spin { to { transform: rotate(1turn); } }
@keyframes other { to { opacity: 0; } }
.mt-mm-lspin::before { animation: mt-mm-spin 2s; }
.x:not(.a, .b) .mt-pmap-dock { e: 5 }`;
  const o = pickCss(src, MAP_KEEP);
  assert.match(o, /:root \{ --a: 1; \}/); assert.ok(!o.includes('color: red'));
  assert.ok(!o.includes('.mt-tail') && !o.includes('.mt-node') && !o.includes('주석'));
  assert.match(o, /\.mt-ta-card \{ a: 1 \}/);
  assert.match(o, /@media \(max-width: 9px\) \{\n\.mt-sm-row/); assert.ok(!o.includes('print'));
  assert.ok(o.includes('@keyframes mt-mm-spin') && !o.includes('@keyframes other'));
  assert.match(o, /\.x:not\(\.a, \.b\) \.mt-pmap-dock/);
  assert.deepEqual(splitSelectors('.a:not(.b, .c), .d'), ['.a:not(.b, .c)', '.d']);
  // 실제 판 화면 CSS: 세션 맵 카드·띠·꼬리표·알약이 들고, 판 전역 규칙(body·버튼)은 없다
  const real = pickCss(read('styles.css') + read('phone.css'), MAP_KEEP);
  for (const s of ['.mt-ta-card', '.mt-sm-band', '.mt-pmap-dock', '.mt-pl-pill', '.mt-mm-donetag', '.mt-sm-tags', '.mt-mm-light']) assert.ok(real.includes(s), s);
  assert.ok(!/(^|\n)(body|html|button)\s*[{,]/.test(real));
  assert.ok(real.length < 90000, String(real.length));
});

test('사전: 새 글 키가 두 사전에 다 있다', () => {
  for (const d of [en, ko]) { assert.ok(d.mapTodo.badge && d.userTasks.kind.decide && d.mmTerr.kind.last); }
});

test('보기: 기억한 보기 → 없으면 첫 응답 필요 카드(없으면 최근 세션)를 100%로, 맞춤은 보이는 폴더 띠 폭(0.26 아래로는 안 줄임)', () => {
  const mem = new Map(); const st = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  const size = { w: 390, h: 700 };
  const cards = new Map([['a', { x: 0, y: 0, w: 300, h: 100, node: {} }], ['b', { x: 0, y: 400, w: 300, h: 100, node: {} }], ['c', { x: 900, y: 0, w: 300, h: 100, node: {} }]]);
  const lay = { order: ['a', 'b', 'c'], cards, bounds: { x: 0, y: 0 }, bands: [{ id: 'f1', x: -20, y: -60, w: 640, h: 700 }, { id: 'f2', x: 860, y: -60, w: 3000, h: 700 }] };
  assert.equal(firstCard(lay, new Map([['b', 'turn']]), () => 0), 'b', '응답 필요');
  assert.equal(firstCard(lay, new Map([['c', 'alert']]), () => 0), 'c', '오류');
  assert.equal(firstCard(lay, new Map(), (id) => ({ a: 5, b: 9, c: 1 })[id]), 'b', '최근 세션');
  const v = openMapView(st, size, lay, new Map([['b', 'turn']]), () => 0);
  assert.equal(v.k, 1); assert.equal(v.x, 195 - 150); assert.equal(v.y, 350 - 450);
  assert.ok(cardView({ x: 0, y: 0, w: 900, h: 100 }, size).k < 0.5, '넓은 카드는 화면 폭에');
  assert.ok(saveMapView(st, size, { k: 0.5, x: 3, y: 4 }));
  assert.deepEqual(openMapView(st, size, lay, new Map([['b', 'turn']]), () => 0), { k: 0.5, x: 3, y: 4 }, '이 기기가 남긴 보기');
  assert.equal(loadMapView(st, { w: 800, h: 700 }), null, '화면 크기마다');
  const f = bandFitView(lay, { k: 1, x: 45, y: -100 }, size);
  assert.equal(f.band, 'f1'); assert.ok(Math.abs(f.k - (390 - 2 * MV.PAD) / 640) < 1e-9); assert.equal(f.x, MV.PAD + 20 * f.k);
  const g = bandFitView(lay, { k: 1, x: -900, y: 0 }, size);
  assert.equal(g.band, 'f2'); assert.equal(g.k, MV.READ_K, '넓은 띠는 읽히는 배율에서 왼쪽에 붙인다');
});
