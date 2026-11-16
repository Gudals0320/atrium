// P178 단위 시험: 세션 맵 폴더·워크스페이스 이름표가 배율 계단마다 화면에서 거의 같은 크기(글 크기·기둥 너비·줄 머리 자리),
// Tab으로 세션 맵 열고 닫기(터미널·다른 입력칸·대화상자·@ 완성 목록이면 아님), 오른쪽 상태 요약 칸 묶음.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lineageLayout, labelStep, labelPx, headBox, LABEL, LINE } from '../src/renderer/lib/mission-lineage.js';
import { mapTabKey } from '../src/renderer/lib/keys.js';
import { zoomStep } from '../src/renderer/lib/faces.js';
import en from '../src/renderer/locales/en.js';
import ko from '../src/renderer/locales/ko.js';

const R = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'renderer');
const read = (f) => fs.readFileSync(path.join(R, f), 'utf8');

const node = (name, ws, extra = {}) => ({ id: `s:${name}`, kind: 'session', sessionId: `x-${name}`, name, workspaceKey: ws, state: 'sleeping', parentId: null, createdAt: 1, ...extra });
const A = 'c:/w/browser/.git', B = 'c:/w/plasma-ic-pbl/.git', C = 'c:/w/loose/.git';
const graph = { nodes: [node('a1', A), node('a2', A, { parentId: 's:a1' }), node('b1', B), node('c1', C)], edges: [] };
const opts = { order: [A, B, C], vgroups: [{ id: 'g1', name: 'Marketsurfer', members: [A, B] }], spineText: (w, n) => [`Workspaces ${w}`, `Sessions ${n}`] };

test('이름표 계단: 가까우면 1(바뀜 없음), 멀면 배율 계단(1.1배마다), 가장 작은 배율에서 멈춘다', () => {
  assert.equal(labelStep(1), 1);
  assert.equal(labelStep(0.9), 1);
  assert.equal(labelStep(0.34), zoomStep(0.34));
  assert.ok(labelStep(0.34) < LABEL.ON);
  assert.equal(labelStep(0.01), LABEL.MIN);
  // 계단 안의 작은 배율 차이는 같은 값(움직이는 동안 다시 그리지 않는다)
  assert.equal(labelStep(0.340), labelStep(0.345));
});

test('이름표 글 크기: 화면 크기 = 세계 크기 × 배율이 목표(이름 14~15px) 안팎, 가까우면 바탕 크기', () => {
  const base = labelPx(1);
  assert.deepEqual(base, LABEL.BASE);
  for (const k of [0.6, 0.45, 0.34, 0.25, 0.2]) {
    const s = labelStep(k), px = labelPx(s);
    // 실제 배율 k에서 화면 글 크기(계단 반올림 ±5%)
    assert.ok(px.name * k >= 15 * 0.95 - 0.01 && px.name * k <= Math.max(15 * 1.06, LABEL.BASE.name * k) + 0.01, `name ${k} ${px.name * k}`);
    assert.ok(px.ws * k >= 14.5 * 0.95 - 0.01, `ws ${k} ${px.ws * k}`);
    assert.ok(px.chip * k >= 11 * 0.95 - 0.01 && px.stat * k >= 11.5 * 0.95 - 0.01);
  }
  // 계단이 작을수록 글이 커진다
  assert.ok(labelPx(labelStep(0.2)).ws > labelPx(labelStep(0.4)).ws);
  // 18%보다 멀면 세계 글은 더 커지지 않는다(화면 글은 배율과 함께 작아진다: 좁은 창에서 이름표가 카드 자리를 먹지 않게)
  assert.deepEqual(labelPx(labelStep(0.1)), labelPx(labelStep(0.15)));
  assert.equal(labelStep(0.12), LABEL.MIN);
});

test('배치: 계단 1이면 지금과 같고, 멀면 기둥·줄 머리·줄 높이가 조금씩 넓어진다(카드는 오른쪽으로 민다)', () => {
  const l0 = lineageLayout(graph, opts);
  const l1 = lineageLayout(graph, { ...opts, label: 1 });
  assert.equal(l1.spine, l0.spine);
  assert.equal(l1.cards.get('s:a1').x, l0.cards.get('s:a1').x);
  assert.equal(l1.bounds.w, l0.bounds.w);
  assert.equal(l1.bounds.h, l0.bounds.h);
  let prev = l1;
  for (const k of [0.4, 0.25, 0.15, 0.1]) {
    const L = lineageLayout(graph, { ...opts, label: labelStep(k) });
    assert.ok(L.spine >= prev.spine, `spine ${k}`);
    assert.ok(L.headW >= prev.headW, `headW ${k}`);
    assert.ok(L.cards.get('s:a1').x >= prev.cards.get('s:a1').x, `card x ${k}`);
    // 줄 머리(글)가 리드 칸 카드에 닿지 않는다
    const col0 = L.cols.find((c) => c.key === 'lv' && c.level === 0).x;
    assert.ok(L.headx + L.headW <= col0 - 40, `head clears cards ${k}`);
    // 기둥 폭에 가장 긴 폴더 이름(지금 글 크기, 굵게)이 든다
    assert.ok(L.spine >= 'Marketsurfer'.length * 0.6 * L.px.name, `spine fits ${k}`);
    // 줄 높이는 줄 머리 높이보다 크다
    for (const r of L.rows) assert.ok(r.h >= L.heads.get(r.key).h, `row ${r.key} ${k}`);
    // 띠는 기둥 글이 들 만큼 높다
    for (const b of L.bands) assert.ok(b.h >= LINE.BANDMIN);
    prev = L;
  }
  // 아주 멀면 화면에서 기둥이 차지하는 폭은 적당하다(글 화면 크기에 맞춘 것이라 배율과 함께 줄지 않는다)
  const far = lineageLayout(graph, { ...opts, label: LABEL.MIN });
  assert.ok(far.spine * LABEL.MIN > 100 && far.spine * LABEL.MIN < 400, `${far.spine * LABEL.MIN}`);
});

test('휴대폰 배치는 이름표 계단을 따르지 않는다(지금대로)', () => {
  const p0 = lineageLayout(graph, { ...opts, phone: true });
  const p1 = lineageLayout(graph, { ...opts, phone: true, label: 0.2 });
  assert.equal(p1.label, 1);
  assert.equal(p1.bounds.w, p0.bounds.w);
  assert.equal(p1.bounds.h, p0.bounds.h);
});

test('줄 머리 상자: 이름과 알약이 들 만큼 넓고, 알약이 넘치면 줄을 바꿔 높아진다', () => {
  const px = labelPx(labelStep(0.2));
  const one = headBox('ws', ['1 working'], px);
  const many = headBox('ws', ['3 working', '2 needs you', '5 asleep', '1 done', '4 ready', '2 exited'], px, 100);
  assert.ok(one.w >= LINE.HEADW);
  assert.ok(many.h > one.h);
  const long = headBox('a-very-long-workspace-name-here', [], px);
  assert.ok(long.w >= 'a-very-long-workspace-name-here'.length * 0.6 * px.ws);
});

test('창: 기둥·줄 머리 글 크기는 배치(lay.px)에서, 계단은 움직임이 멈춘 뒤에 바꾸고 닻 카드를 제자리에', () => {
  const src = read('MissionLineage.jsx');
  assert.match(src, /lineageLayout\(g2, \{ \.\.\.layOpts, label: lstep \}\)/);
  assert.match(src, /fontSize: lay\.px\.name/);
  assert.match(src, /fontSize: lay\.px\.ws/);
  assert.match(src, /delete root\.dataset\.moving; setIk\(\); checkStep\(\);/);
  assert.match(src, /anchorRef\.current/);
});

const ev = (target, extra = {}) => ({ key: 'Tab', type: 'keydown', target, ...extra });
const el = (tagName, { cls = [], inside = [] } = {}) => ({ tagName, classList: { contains: (c) => cls.includes(c) }, closest: (sel) => (sel.split(',').some((s) => inside.includes(s.trim())) ? {} : null) });

test('Tab: 판(몸통·캔버스·맵 카드)과 명령줄(완성 목록 없음)에서 맵을 열고 닫는다', () => {
  assert.equal(mapTabKey(ev(null)), true);
  assert.equal(mapTabKey(ev({ tagName: 'BODY' })), true);
  assert.equal(mapTabKey(ev(el('DIV', { inside: ['.mt-stage'] }))), true);
  assert.equal(mapTabKey(ev(el('DIV', { inside: ['.mt-mission'] }))), true);
  assert.equal(mapTabKey(ev(el('TEXTAREA', { cls: ['mt-cmd-input'] }))), true);
});

test('Tab: 터미널·다른 입력칸·대화상자·@ 완성 목록·조합 키는 원래 일', () => {
  assert.equal(mapTabKey(ev(el('TEXTAREA', { inside: ['.xterm'] }))), false, '터미널(셸 자동 완성)');
  assert.equal(mapTabKey(ev(el('TEXTAREA', { cls: ['mt-cmd-input'] })), { completing: true }), false, '@ 완성 목록');
  assert.equal(mapTabKey(ev(el('INPUT'))), false, '검색·설정·이름 바꾸기 입력칸');
  assert.equal(mapTabKey(ev(el('TEXTAREA'))), false);
  assert.equal(mapTabKey(ev(el('SELECT'))), false);
  assert.equal(mapTabKey(ev({ tagName: 'DIV', isContentEditable: true, closest: () => null })), false);
  assert.equal(mapTabKey(ev(el('BUTTON', { inside: ['[role="dialog"]'] }))), false, '대화상자 안');
  assert.equal(mapTabKey(ev(el('BUTTON', { inside: ['.mt-search'] }))), false);
  assert.equal(mapTabKey(ev(null), { dialog: { kind: 'close' } }), false);
  for (const m of ['shiftKey', 'ctrlKey', 'altKey', 'metaKey', 'isComposing', 'repeat']) assert.equal(mapTabKey(ev(null, { [m]: true })), false, m);
  assert.equal(mapTabKey({ key: 'm', target: null }), false, 'M은 더 이상 맵 키가 아니다');
});

test('main.jsx: M 대신 Tab(잡기 단계), 사전의 M 표기는 Tab', () => {
  const src = read('main.jsx');
  assert.ok(!/e\.key === 'm' \|\| e\.key === 'M'/.test(src));
  assert.match(src, /mapTabKey\(e, \{ dialog: getState\(\)\.dialog, completing: !!document\.querySelector\('\.mt-mention'\) \}\)/);
  for (const d of [en, ko]) {
    const s = JSON.stringify(d);
    assert.ok(!/\(M\)/.test(s), '(M) 표기 없음');
    assert.match(d.chrome ? JSON.stringify(d) : s, /\(Tab\)/);
    assert.match(d.mmTerr.close, /Tab/);
  }
});

test('상태 요약 칸 창: 누르면 그 카드로(사이드바와 같은 focusCard), 올리면 강조, 접힘 기억, 맞춤이 폭을 비운다', () => {
  const src = read('MissionLineage.jsx');
  assert.match(src, /role="ln-summary"/); // P179: SummaryColumn의 data-role
  assert.match(src, /onGo=\{\(id\) => focusCard\(id\)\}/); // P179: 공용 요약 열(SummaryColumn)
  assert.match(src, /session: \(sid\) => \{[^\n]*focusCard\(hit\[0\]\)/);
  assert.match(src, /onHot=\{sumHot\}/);
  assert.match(src, /atrium\.sessionMap\.summary/);
  assert.match(src, /fitView\(L\.bounds, s\.w - RAIL - sumW\(\)/);
  assert.match(read('styles.css'), /\.mt-sm \.mt-ta-slot\.sum-hot \.mt-ta-card \{/);
});
