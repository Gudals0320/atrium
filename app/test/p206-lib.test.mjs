// P206 단위 시험: 터미널 힌트 지우기(lib/term-hint.js), 세션 맵 두 열에서 열 사이 선이 열 머리 칸을 지나지 않음(lib/mission-lineage.js)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeHint, hintNext, hintText, INPUT_FAIL_MS, FLASH_MS } from '../src/renderer/lib/term-hint.js';
import { translate, errText } from '../src/renderer/lib/i18n.js';
import { lineageLayout, todayWorkspaces } from '../src/renderer/lib/mission-lineage.js';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'renderer');

// ---- 1. 터미널 힌트 ----
const fail = () => makeHint('inputFail', 'terminal.inputFail', { err: { code: 'X', message: 'Not connected to the backend' } });

test('입력 실패 힌트: 다음 입력이 성공하면 지운다', () => {
  const h = hintNext(null, { type: 'show', hint: fail() });
  assert.equal(h.kind, 'inputFail');
  assert.equal(hintNext(h, { type: 'input-ok' }), null);
});

test('입력 실패 힌트: 다시 연결되면 지운다', () => {
  const h = hintNext(null, { type: 'show', hint: fail() });
  assert.equal(hintNext(h, { type: 'connected' }), null);
});

test('입력 실패 힌트: 아무 일 없어도 정한 시간 뒤 사라진다(제 id의 타이머만)', () => {
  const h = fail();
  assert.equal(h.ms, INPUT_FAIL_MS);
  assert.ok(INPUT_FAIL_MS > 0 && INPUT_FAIL_MS <= 15000);
  assert.equal(hintNext(h, { type: 'expire', id: h.id }), null);
  const h2 = fail();
  assert.equal(hintNext(h2, { type: 'expire', id: h.id }), h2, '옛 힌트의 늦은 타이머는 새 힌트를 지우지 않는다');
});

test('짧은 알림(복사됨)은 입력 성공·다시 연결로 지우지 않고 제 시간에 사라진다', () => {
  const f = makeHint('flash', 'terminal.copied');
  assert.equal(f.ms, FLASH_MS);
  assert.equal(hintNext(f, { type: 'input-ok' }), f);
  assert.equal(hintNext(f, { type: 'connected' }), f);
  assert.equal(hintNext(f, { type: 'expire', id: f.id }), null);
});

test('힌트 글은 그릴 때 번역해 지금 언어를 따른다', () => {
  const h = fail();
  const en = hintText(h, (k, v) => translate('en', k, v), errText);
  const ko = hintText(h, (k, v) => translate('ko', k, v), errText);
  assert.match(en, /^Input failed: /);
  assert.match(ko, /^터미널에 입력을 보내지 못했습니다: /);
  assert.equal(hintText(makeHint('flash', 'upload.done', { vars: { n: 2 } }), (k, v) => translate('en', k, v), errText), translate('en', 'upload.done', { n: 2 }));
  assert.equal(hintText(null, () => 'x', errText), '');
});

test('TerminalView는 힌트를 열쇠로 두고 다시 연결·입력 성공·시간으로 지운다', () => {
  const src = fs.readFileSync(path.join(SRC, 'TerminalView.jsx'), 'utf8');
  assert.ok(!/setHint\(t\(/.test(src), '번역한 글을 상태에 두지 않는다');
  assert.ok(src.includes("hintEv({ type: 'input-ok' })"));
  assert.ok(src.includes("hintEv({ type: 'connected' })"));
  assert.ok(src.includes("hintEv({ type: 'expire', id: hint.id })"));
  assert.ok(src.includes('hintText(hint, t, errText)'));
});

// ---- 2. 두 열의 열 사이 선 ----
const MID = new Date(2026, 10, 17, 0, 0, 0).getTime(), NOON = MID + 12 * 3600e3, OLD = MID - 3 * 86400e3;
const FOLDERS = [
  { id: 'gz', name: 'zeta', members: ['d:/w/z1', 'd:/w/z2'] },
  { id: 'ga', name: 'Alpha', members: ['d:/w/a2', 'd:/w/a10', 'd:/w/a1'] },
  { id: 'gn', name: '나무', members: ['d:/w/n1'] },
  { id: 'gb', name: 'beta', members: ['d:/w/b1'] },
  { id: 'gk', name: '가람', members: ['d:/w/k1'] },
];
// [이름, 워크스페이스, 부모, activeAt, 상태, 동료]
const S = [
  ['z-lead', 'd:/w/z1', null, MID + 3600e3], ['z-kid', 'd:/w/z1', 'z-lead', OLD], ['z2-solo', 'd:/w/z2', null, OLD],
  ['a1', 'd:/w/a1', null, OLD], ['a2', 'd:/w/a2', null, OLD], ['a10-lead', 'd:/w/a10', null, OLD], ['a10-kid', 'd:/w/a10', 'a10-lead', OLD],
  ['n1', 'd:/w/n1', null, OLD, 'working', ['k1']], ['b1', 'd:/w/b1', null, OLD], ['b1-x', 'd:/w/b1', 'z-lead', OLD], ['b1-y', 'd:/w/b1', 'z2-solo', OLD],
  ['k1', 'd:/w/k1', null, OLD], ['k1-2', 'd:/w/k1', 'z-lead', OLD],
  ['loose1', 'd:/w/loose', null, MID + 10], ['old-loose', 'd:/w/old', null, OLD],
];
function graph() {
  const nodes = S.map(([name, ws, parent, activeAt, state, peers], i) => ({ id: `s:${name}`, kind: 'session', sessionId: `x-${name}`, name, workspaceKey: ws, state: state || 'sleeping', parentId: parent ? `s:${parent}` : null, createdAt: i + 1, activeAt, peers: (peers || []).map((p) => `s:${p}`) }));
  const edges = S.filter((x) => x[2]).map(([name, , parent]) => ({ from: `s:${parent}`, to: `s:${name}`, kind: 'spawn', count: 1 }));
  return { nodes, edges };
}
const G = graph();
const TODAY = todayWorkspaces(G.nodes, { now: NOON, tierOf: (n) => (n.state === 'working' ? 'work' : 'rest') });
// 선 토막이 사각형 안을 지나는가
const segHits = (pts, r) => pts.slice(1).some(([bx, by], i) => {
  const [ax, ay] = pts[i];
  const x1 = Math.min(ax, bx), x2 = Math.max(ax, bx), y1 = Math.min(ay, by), y2 = Math.max(ay, by);
  return x1 < r.x + r.w && x2 > r.x && y1 < r.y + r.h && y2 > r.y;
});

test('P374 열 흘리기: 열 사이를 건너는 선은 받는 카드 곁에서 끝나고, 열 머리 칸은 없다', () => {
  const L = lineageLayout(G, { vgroups: FOLDERS, today: TODAY, noFolder: 'No folder', columns: 2 });
  assert.equal(L.ncol, 2);
  assert.equal(L.sections.filter((s) => s.mode === 'head').length, 0);
  const cross = L.edges.filter((e) => e.pts && L.cards.get(e.from) && L.cards.get(e.to) && L.cards.get(e.from).x < L.colDx !== L.cards.get(e.to).x < L.colDx);
  assert.ok(cross.length >= 2, `열 사이 선 ${cross.length}`);
  for (const e of cross) {
    const b = L.cards.get(e.to), last = e.pts[e.pts.length - 1];
    assert.ok(last[0] >= b.x - 24 && last[0] <= b.x + b.w + 24 && last[1] >= b.y - 24 && last[1] <= b.y + b.h + 24, `${e.id} 끝(화살촉 틈까지)`);
    for (const sp of L.bands) assert.ok(!segHits(e.pts.slice(1, -1).length > 1 ? e.pts.slice(1, -1) : [], { x: sp.x + 4, y: sp.y + 4, w: L.spine - 8, h: sp.h - 8 }), `${e.id} 폴더 기둥을 지남`);
  }
});

test('한 열은 그대로(머리 칸 막기는 두 열에서만)', () => {
  const a = lineageLayout(G, { vgroups: FOLDERS, today: TODAY, noFolder: 'No folder', columns: 1 });
  assert.equal(a.ncol, 1);
  assert.ok(a.edges.some((e) => e.from === 's:z-lead' && e.to === 's:b1-x'));
  const src = fs.readFileSync(path.join(SRC, 'lib', 'mission-lineage.js'), 'utf8');
  assert.ok(/if \(two\) blocks\.push\(/.test(src));
});
