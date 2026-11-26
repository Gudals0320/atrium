// P374 단위 시험: PC 세션 맵은 접지 않고(깊이 접기·얇은 줄 없음) 폴더 띠를 n열로 흘린 2D 판이다.
// 열 수는 판 비가 목표 비(SHEET.ASPECT 'view' = 보이는 칸 비, 4:3~16:9)에 가까운 수, 처음 화면은 읽히는 배율(OPEN_K 0.85), 휠은 끌기, 숨은 조정 열쇠.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lineageLayout, SHEET, sheetAspect, pickColumns } from '../src/renderer/lib/mission-lineage.js';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'renderer');
const read = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');

// 폴더 6 · 워크스페이스 12, 깊은 사슬 하나(6단계)와 하위 7개(절전 5) 하나
function board() {
  const nodes = [], edges = [], groups = [];
  let i = 0;
  const add = (name, ws, parent = null, state = 'sleeping') => { nodes.push({ id: 's:' + name, kind: 'session', sessionId: 'x-' + name, name, workspaceKey: ws, state, parentId: parent ? 's:' + parent : null, createdAt: ++i }); if (parent) edges.push({ from: 's:' + parent, to: 's:' + name, kind: 'spawn', count: 1 }); };
  for (let g = 0; g < 6; g++) {
    const members = [];
    for (let w = 0; w < 2; w++) { const ws = 'd:/w/g' + g + 'w' + w; members.push(ws); add('l' + g + w, ws); add('k' + g + w, ws, 'l' + g + w); add('m' + g + w, ws, 'l' + g + w); }
    groups.push({ id: 'g' + g, name: 'Folder ' + g, members });
  }
  const chain = ['d0', 'd1', 'd2', 'd3', 'd4', 'd5', 'd6'];
  chain.forEach((n, j) => add(n, 'd:/w/g0w0', j ? chain[j - 1] : null));
  add('lead', 'd:/w/g1w0', null, 'ready');
  for (let j = 1; j <= 7; j++) add('w' + j, 'd:/w/g1w0', 'lead', j <= 2 ? 'working' : 'sleeping');
  return { g: { nodes, edges }, groups };
}
const { g, groups } = board();
const lay = (o = {}) => lineageLayout(g, { vgroups: groups, noFolder: 'No folder', routing: false, ...o });

test('접지 않는다: 7단계 사슬과 하위 7개(절전 5)가 모두 카드, 접기 칩·얇은 줄 없음', () => {
  const L = lay();
  assert.equal(L.cards.size, g.nodes.length);
  for (const [id, c] of L.cards) { assert.equal(c.fold, 0, id); assert.ok(!c.thin, id); }
  assert.equal(L.cards.get('s:d6').depth, 6);
});

test('목표 비 기본은 보이는 칸 비(4:3~16:9로 좁힘), 판 비가 그에 가장 가까운 열 수', () => {
  assert.equal(SHEET.ASPECT, 'view');
  const one = lay({ columns: 1 });
  for (const view of [{ w: 1620, h: 860 }, { w: 1156, h: 690 }]) {
    const L = lay({ columns: 'auto', view }), want = sheetAspect('view', view);
    assert.equal(L.ncol, pickColumns(one.measure, view));
    const d = (n) => { const x = lay({ columns: n }); return Math.abs(Math.log((x.bounds.w / x.bounds.h) / want)); };
    for (let n = 1; n <= 4; n++) if (n !== L.ncol) assert.ok(d(L.ncol) <= d(n) + 1e-9, view.w + ': ' + L.ncol + '열이 ' + n + '열보다 목표에 가깝다');
  }
  // 4:3이면 화면 비보다 열이 많지 않다
  assert.ok(lay({ columns: 'auto', view: { w: 1620, h: 860 }, aspect: 4 / 3 }).ncol <= lay({ columns: 'auto', view: { w: 1620, h: 860 } }).ncol);
});

test('창: 처음 화면은 읽히는 배율(OPEN_K 0.85)로 응답 필요·오류·가장 바쁜 띠, 맞춤은 판 전체, 휠은 끌기, 숨은 조정 열쇠', () => {
  const ml = read('MissionLineage.jsx');
  assert.match(ml, /const OPEN_K = 0\.85;/);
  assert.ok(!/READ_K/.test(ml), '옛 폭 맞춤 하한 없음');
  assert.match(ml, /\['turn', 'alert'\]\.map\(\(t\) => L\.order\.find/);
  assert.match(ml, /const fitOf = /);
  assert.match(ml, /if \(e\.ctrlKey \|\| e\.metaKey\) \{ const p = local\(e\); paint\(zoomAt/, 'Ctrl·⌘+휠 = 확대');
  assert.match(ml, /paint\(panBy\(v, -dx, -dy\)\)/, '휠 = 끌기');
  assert.match(ml, /const ASPECT_KEY = 'atrium\.sessionMap\.aspect';/);
  assert.match(ml, /columns: 'auto', view: fitArea, aspect,/);
  assert.match(ml, /localStorage\.removeItem\('atrium\.sessionMap\.expanded'\)/);
  const css = read('styles.css');
  assert.match(css, /\.mt-sm\[data-layout="lineage"\] \.mt-ta-full \.cst, [^{]*\{ font-size: 13px; \}/);
});
