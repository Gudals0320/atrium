// P377 단위 시험: 세션 맵 이름표(폴더 기둥·워크스페이스 줄 머리·구분 줄)와 카드 꼬리표의 자리는 배율과 상관없이 고정(LABEL.ROOM),
// 글은 매 프레임 그 자리 안에서 transform으로 연속 맞춤(labelFit). 멈춘 뒤 계단 바꾸기·배치 다시 세기·보기 옮기기(P178 checkStep·settle 반복)는 없다.
// 사람 원문(2026-11-26): "이동하고 약간의 지연 후에 폰트 크기가 맞춰지니까 … 확대하고 갑자기 그거에 맞춰서 축소되는 등" → 1번(자리는 고정, 글자만 연속으로), 자리 기준 0.30(사람 결정)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lineageLayout, labelFit, labelGrow, labelPx, LABEL, TAG, tagScale, tagRoom, mapPlan, headBox } from '../src/renderer/lib/mission-lineage.js';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'renderer');
const read = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');

// 폴더 7(띠 높이가 제각각) + 폴더 없음. 하위 7개(절전 5) 하나, 깊은 사슬 하나
function board({ extra = [] } = {}) {
  const nodes = [], edges = [], groups = [];
  let i = 0;
  const add = (name, ws, parent = null, state = 'sleeping') => { nodes.push({ id: 's:' + name, kind: 'session', sessionId: 'x-' + name, name, workspaceKey: ws, state, parentId: parent ? 's:' + parent : null, createdAt: ++i }); if (parent) edges.push({ from: 's:' + parent, to: 's:' + name, kind: 'spawn', count: 1 }); };
  const sizes = [1, 3, 2, 4, 1, 2, 3];
  sizes.forEach((nw, gi) => {
    const members = [];
    for (let w = 0; w < nw; w++) { const ws = 'd:/w/f' + gi + 'w' + w; members.push(ws); add('l' + gi + w, ws, null, w === 0 && gi % 3 === 0 ? 'working' : 'sleeping'); if ((gi + w) % 2) add('k' + gi + w, ws, 'l' + gi + w); }
    groups.push({ id: 'f' + gi, name: 'Folder ' + gi, members });
  });
  add('lone', 'd:/w/loose0'); add('lone2', 'd:/w/loose1');
  add('lead', 'd:/w/f1w0', null, 'ready');
  for (let j = 1; j <= 7; j++) add('w' + j, 'd:/w/f1w0', 'lead', j <= 2 ? 'working' : 'sleeping');
  const chain = ['d0', 'd1', 'd2', 'd3', 'd4', 'd5'];
  chain.forEach((n, j) => add(n, 'd:/w/f3w1', j ? chain[j - 1] : null));
  for (const x of extra) { add(x.name, x.ws, x.parent || null, x.state || 'sleeping'); if (x.folder) { let gr = groups.find((q) => q.id === x.folder.id); if (!gr) { gr = { id: x.folder.id, name: x.folder.name, members: [] }; groups.push(gr); } if (!gr.members.includes(x.ws)) gr.members.push(x.ws); } }
  return { graph: { nodes, edges }, groups };
}
const B = board();
const VIEW = { w: 1620, h: 860 };
const base = (b = B, o = {}) => ({ vgroups: b.groups, noFolder: 'No folder', view: VIEW, spineText: (w, n) => [w + ' workspaces', n + ' sessions'], chipText: (t, n) => n + ' ' + t, ...o });
const arr = (L) => { const cols = []; for (const b of [...L.bands].sort((p, q) => (p.col || 0) - (q.col || 0) || p.y - q.y)) (cols[b.col || 0] ||= []).push(b.id == null ? '' : b.id); return JSON.stringify(cols); };
// 배율 0.15~1.5 촘촘히
const KS = []; for (let k = 0.15; k <= 1.5001; k += 0.01) KS.push(Math.round(k * 100) / 100);

test('자리 기준 계단은 0.30(사람 결정), 자리 글 크기는 화면 목표 / 0.30', () => {
  assert.equal(LABEL.ROOM, 0.3);
  const px = labelPx(LABEL.ROOM);
  for (const k of Object.keys(LABEL.SCREEN)) assert.ok(Math.abs(px[k] - Math.round((LABEL.SCREEN[k] / LABEL.ROOM) * 10) / 10) < 0.01, k);
});

test('화면 글 크기는 배율에 대해 줄지 않는다(확대하면 커지기만), 배수는 1 이하', () => {
  const px = labelPx(LABEL.ROOM);
  let prev = null;
  for (const k of KS) {
    const f = labelFit(k);
    for (const key of ['spine', 'head']) assert.ok(f[key] > 0 && f[key] <= 1, key + ' ' + k);
    assert.ok(f.tag >= 1 && f.tag <= tagScale(LABEL.ROOM) + 1e-9, 'tag ' + k);
    const s = { name: k * px.name * f.spine, ws: k * px.ws * f.head, tag: k * TAG.FONT * f.tag };
    if (prev) for (const key of Object.keys(s)) assert.ok(s[key] >= prev.s[key] - 0.02, key + ' ' + prev.k + '→' + k + ': ' + prev.s[key] + '→' + s[key]);
    prev = { k, s };
  }
});

test('화면 글: 가까이(68% 이상) 바탕 22px, 30~68% 화면 목표 15px, 30%보다 멀면 배율과 함께', () => {
  const px = labelPx(LABEL.ROOM), name = (k) => Math.round(k * px.name * labelFit(k).spine * 10) / 10, ws = (k) => Math.round(k * px.ws * labelFit(k).head * 10) / 10;
  assert.equal(name(1), 22); assert.equal(ws(1), 18);
  for (const k of [0.3, 0.4, 0.5, 0.6, 0.68]) assert.ok(Math.abs(name(k) - 15) < 0.11, 'name ' + k + ' ' + name(k));
  for (const k of [0.3, 0.5, 0.8]) assert.ok(Math.abs(ws(k) - 14.5) < 0.11, 'ws ' + k + ' ' + ws(k));
  assert.ok(Math.abs(name(0.18) - 9) < 0.11 && Math.abs(name(0.24) - 12) < 0.11, name(0.18) + ' ' + name(0.24));
  assert.equal(labelGrow(0.01, 'name'), 1 / LABEL.ROOM);
});

test('불변식: 창이 쓰는 배치(label = LABEL.ROOM)는 배율을 받지 않는다 — 배율 0.15~1.5 어디서든 기둥 폭·줄 머리 폭·띠 높이·배열이 같고, 글은 자리 안에 든다', () => {
  const plan = mapPlan(null, B.graph, base());
  const L = lineageLayout(B.graph, { ...base(), plan, columns: 1, label: LABEL.ROOM, routing: false });
  const want = { spine: L.spine, headW: L.headW, bands: L.bands.map((b) => [b.id, b.h, b.y]), rows: L.rows.map((r) => [r.key, r.h]), arr: arr(L) };
  // 배치는 배율과 상관없다(창은 label만 준다): 같은 입력이면 같은 값
  const again = lineageLayout(B.graph, { ...base(), plan, columns: 1, label: LABEL.ROOM, routing: false });
  assert.deepEqual({ spine: again.spine, headW: again.headW, bands: again.bands.map((b) => [b.id, b.h, b.y]), rows: again.rows.map((r) => [r.key, r.h]), arr: arr(again) }, want);
  // 기억한 배열(P376)은 그대로
  assert.equal(arr(L), arr(lineageLayout(B.graph, { ...base(), plan, columns: 1, routing: false })));
  // 어느 배율이든 줄인 글은 자리 안: 보이는 폭 = 자리 폭(폭/배수 × 배수), 보이는 높이 ≤ 자리 높이(배수 ≤ 1)
  const minBand = Math.min(...L.bands.map((b) => b.h));
  for (const k of KS) { const f = labelFit(k); assert.ok(f.spine <= 1 && f.head <= 1); assert.ok(L.px.name * 1.2 * f.spine <= minBand); }
  for (const [key, hb] of L.heads) { const row = L.rows.find((r) => r.key === key); if (row) assert.ok(hb.h + 10 <= row.h + 0.5, key); }
});

test('긴 이름: 자리 계단에서 기둥·줄 머리 폭은 상한까지만(넘치면 말줄임), 말줄임되는 이름만 표시(창은 그때만 title)', () => {
  const longF = 'A very long folder name that keeps going past the column';
  const longW = 'd:/w/an-extremely-long-workspace-name-for-the-quarterly-planning-notes';
  const g = board({ extra: [{ name: 'x1', ws: longW, folder: { id: 'fl', name: longF } }] });
  const L = lineageLayout(g.graph, { ...base(g), columns: 1, label: LABEL.ROOM, routing: false });
  assert.equal(L.spine, LABEL.SPINEMAX);
  assert.ok(L.cutBands.has(longF) && !L.cutBands.has('Folder 0'));
  const hb = L.heads.get(longW);
  assert.ok(hb.w <= LABEL.HEADMAX && hb.cut, JSON.stringify(hb));
  assert.ok(!L.heads.get('d:/w/f0w0').cut);
  // 바탕(label 1) 배치는 상한 없이 예전 그대로(P157·P178)
  const L1 = lineageLayout(g.graph, { ...base(g), columns: 1, label: 1, routing: false });
  assert.ok(L1.spine > LABEL.SPINEMAX && L1.cutBands.size === 0);
  assert.ok(!headBox('short', [], labelPx(1)).cut);
});

test('꼬리표: 자리(tagRoom)는 자리 계단으로 고정, 배수는 연속(tagScale(k)를 자리 배수에서 멈춘다)', () => {
  assert.equal(labelFit(1).tag, 1);
  assert.equal(labelFit(0.1).tag, Math.round(tagScale(LABEL.ROOM) * 1000) / 1000);
  for (const k of [0.4, 0.6, 0.8]) assert.ok(Math.abs(labelFit(k).tag - tagScale(k)) < 0.001, String(k));
  // 무리가 가장 클 때(자리 배수)도 배치가 비운 자리 안
  for (const n of [1, 2]) assert.ok(tagRoom(n, LABEL.ROOM) >= tagScale(LABEL.ROOM) * (TAG.H + (n > 1 ? TAG.GAP + TAG.H : 0)) - TAG.H / 2);
});

test('휴대폰 배치는 그대로(바탕 글, 상한 없음)', () => {
  const a = lineageLayout(B.graph, { ...base(), phone: true, label: LABEL.ROOM });
  const b = lineageLayout(B.graph, { ...base(), phone: true });
  assert.deepEqual(a.px, b.px);
  assert.equal(a.cutBands.size, 0);
});

test('창: 멈춘 뒤 계단 바꾸기·배치 다시 세기·닻 보기 옮김이 없고, paint가 매 프레임 이름표를 맞춘다', () => {
  const src = read('MissionLineage.jsx');
  assert.ok(!/checkStep|anchorRef|pendingView|layForRef|lstep|labelStep/.test(src), '옛 계단 길이 남았다');
  assert.match(src, /lineageLayout\(g2, \{ \.\.\.layOpts, label: LABEL\.ROOM \}\)\) : null\)\), \[g2, layOpts\]\)/);
  assert.match(src, /w\.style\.transform = `translate\(\$\{v\.x\}px, \$\{v\.y\}px\) scale\(\$\{v\.k\}\)`;\s*fitLabels\(v\.k\);/);
  assert.match(src, /const settle = \(mk, opts\) => \{ const s = sizeRef\.current, L = layRef\.current; if \(!L \|\| !s\) return; paint\(mk\(L, s\), opts\); \};/);
  assert.match(src, /moveTimer\.current = setTimeout\(\(\) => \{ delete root\.dataset\.moving; setIk\(\); \}, 160\)/);
  // 이름표 요소: 기둥 글 덩어리·줄 머리(폭 = 자리 폭/배수)·구분 줄 글
  assert.match(src, /className="mt-sm-lq" data-lq="spine" data-w=\{lay\.spine - 32\}/);
  assert.match(src, /data-lq="head" data-w=\{lay\.headW\}/);
  assert.equal((src.match(/data-lq="sec"/g) || []).length, 3);
  assert.match(src, /el\.style\.transform = `scale\(\$\{r\}\)`/);
});

test('CSS: 이름표 덩어리는 왼쪽 위 기준으로 줄고, 폴더 이름은 말줄임, 미끄러지기 규칙은 P164 블록 앞', () => {
  const css = read('styles.css');
  assert.match(css, /\.mt-sm-lq \{[^}]*transform-origin: 0 0;/);
  assert.match(css, /\.mt-sm-head\[data-lq\] \{ transform-origin: 0 0; \}/);
  assert.match(css, /\.mt-sm-lq \.fn \{ overflow: hidden; text-overflow: ellipsis; \}/);
  const g = css.indexOf('.mt-ta-world.glide [data-lq]'), p164 = css.indexOf('/* P164');
  assert.ok(g > 0 && g < p164);
});
