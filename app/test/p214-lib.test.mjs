// P214 단위 시험: 위 막대(목업 2차). 탭 줄 나누기(1행·2행·+n), 계단 모양 경로(줄 폭 → 경로, 22px 맞춤), 0인 알약 숨김,
// 사용량 한 줄 꼴(구독별 보이는 창만), AGY 묶음 거르기(Gemini 5시간·주간만), 위 막대에 검색 칸 없음과 Ctrl+F로 열림
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { wrapRows, fitTabs, stairPath } from '../src/renderer/lib/ws-tabs.js';
import { shownWindows, pillLine, pillOf, remainingOf, shortKey, topOf } from '../src/renderer/lib/usage.js';
import { boardShortcut } from '../src/renderer/lib/keys.js';
import { translate } from '../src/renderer/lib/i18n.js';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/renderer');
const read = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');

test('탭 줄 나누기: 한 줄 폭에 차례로 채운다(flex-wrap과 같음)', () => {
  assert.deepEqual(wrapRows([100, 100, 100], 304, 2), [[0, 1, 2]]);
  assert.deepEqual(wrapRows([100, 100, 100], 303, 2), [[0, 1], [2]]);
  assert.deepEqual(wrapRows([400, 50], 300, 2), [[0], [1]], '한 칸이 폭보다 넓어도 제 줄을 차지한다');
  assert.deepEqual(wrapRows([], 300), []);
});

test('fitTabs: 한 줄에 들면 1행, 넘치면 2행, 2행도 넘치면 끝에서부터(켜진 탭 빼고) 숨긴다', () => {
  // 탭 다섯(100px) + 끝의 + 26px, 폭 700 → 한 줄
  assert.deepEqual(fitTabs({ widths: [100, 100, 100, 100, 100], avail: 700 }), { hidden: [], rows: 1 });
  // 폭 400 → 2행, 숨김 없음
  assert.deepEqual(fitTabs({ widths: [100, 100, 100, 100, 100], avail: 400 }), { hidden: [], rows: 2 });
  // 탭 열둘(100px), 폭 400: 한 줄에 셋(100·3 + 2·2 = 304, 넷이면 406). 둘째 줄은 탭 셋 + "+n"(34) + +(26) = 368
  const r = fitTabs({ widths: Array(12).fill(100), avail: 400, moreW: 34, tailW: 26 });
  assert.equal(r.rows, 2);
  assert.deepEqual(r.hidden, [6, 7, 8, 9, 10, 11], '끝에서부터 숨기고 여섯이 남는다');
  // 켜진 탭(끝)은 숨기지 않는다
  const on = fitTabs({ widths: Array(12).fill(100), on: 11, avail: 400, moreW: 34, tailW: 26 });
  assert.ok(!on.hidden.includes(11));
  assert.equal(on.rows, 2);
  assert.deepEqual(on.hidden, [5, 6, 7, 8, 9, 10], '켜진 끝 탭 대신 그 앞을 하나 더 숨긴다');
});

test('stairPath: 줄 폭 → 계단 경로, 바깥 R 13 · 안쪽 오목 r 9, 두 줄 끝 차이가 22px보다 작으면 한 상자', () => {
  // 둘째 줄이 짧다(950 / 190): 첫 줄 오른쪽 아래가 볼록 R로 꺾이고 둘째 줄 끝에서 오목 r로 내려간다
  const a = stairPath([950, 190], [33.5], 67);
  assert.deepEqual(a.w, [950, 190]);
  assert.equal(a.d, 'M 13 0 H 937 A 13 13 0 0 1 950 13 V 21 A 13 13 0 0 1 937 34 H 199 A 9 9 0 0 0 190 43 V 54 A 13 13 0 0 1 177 67 H 13 A 13 13 0 0 1 0 54 V 13 A 13 13 0 0 1 13 0 Z');
  // 둘째 줄이 더 길다(812 / 981): 첫 줄 끝에서 오목 r로 나가고 둘째 줄 끝이 볼록 R
  const b = stairPath([812, 981], [33.5], 67);
  assert.ok(b.d.includes('A 9 9 0 0 0 821 34'), b.d);
  assert.ok(b.d.includes('A 13 13 0 0 1 981 47'), b.d);
  // 22px 맞춤: 차이 21 → 긴 쪽에 맞춘 둥근 사각형 하나, 22 → 계단
  const c = stairPath([388, 367], [33.5], 67);
  assert.deepEqual(c.w, [388, 388]);
  assert.equal(c.d, 'M 13 0 H 375 A 13 13 0 0 1 388 13 V 54 A 13 13 0 0 1 375 67 H 13 A 13 13 0 0 1 0 54 V 13 A 13 13 0 0 1 13 0 Z');
  assert.deepEqual(stairPath([388, 366], [33.5], 67).w, [388, 366]);
  assert.deepEqual(stairPath([], [], 0), { d: '', w: [] });
});

const NOW = Date.parse('2026-11-18T00:00:00Z');
const AGY = { provider: 'agy', at: NOW, windows: [
  { id: '3p-5h', usedPct: 0, resetsAt: NOW + 3600000 }, { id: 'gemini-weekly', usedPct: 13, resetsAt: NOW + 86400000 },
  { id: '3p-weekly', usedPct: 99, resetsAt: NOW + 86400000 }, { id: 'gemini-argon-wtu-weekly', usedPct: 97, resetsAt: NOW + 86400000 },
  { id: 'gemini-5h', usedPct: 41, resetsAt: NOW + 3600000 }, { id: 'exp-5h', usedPct: 90, resetsAt: NOW + 3600000 },
] };

test('AGY 묶음 거르기: Gemini 5시간·주간만(3p·실험용·모델별 세부는 빠진다), 5시간·주간 순', () => {
  assert.deepEqual(shownWindows('agy', AGY).map((w) => [w.id, w.kind]), [['gemini-5h', '5h'], ['gemini-weekly', 'week']]);
  // 구독 이름 없이 값의 provider로도 고른다
  assert.deepEqual(shownWindows(null, AGY).map((w) => w.id), ['gemini-5h', 'gemini-weekly']);
  // 3p·세부의 높은 값(99, 97, 90)은 알약 색·남은 양에도 끼지 않는다
  assert.equal(topOf(AGY, NOW, 'agy').pct, 41);
  const view = { providers: { agy: AGY } };
  assert.deepEqual(pillOf(view, NOW).parts.map((x) => [x.provider, x.pct, x.level]), [['agy', 41, 'ok']]);
  assert.deepEqual(remainingOf(view, 'agy', NOW), { pct: 59, level: 'ok', window: 'gemini-5h' });
  // Gemini 묶음이 없으면 보일 창이 없다
  assert.deepEqual(shownWindows('agy', { windows: [{ id: '3p-5h', usedPct: 3 }] }), []);
  // 그 밖 구독은 받은 창 그대로(순서만 5시간·주간)
  assert.deepEqual(shownWindows('claude', { windows: [{ id: 'week', usedPct: 1 }, { id: '5h', usedPct: 2 }] }).map((w) => w.kind), ['5h', 'week']);
});

test('사용량 한 줄 꼴: 구독마다 보이는 창만, 값마다 색, 테두리는 가장 높은 값', () => {
  const view = { providers: {
    claude: { provider: 'claude', windows: [{ id: 'week', usedPct: 89, resetsAt: NOW + 1000 }] }, // 요금제에 따라 주간만
    codex: { provider: 'codex', windows: [{ id: '5h', usedPct: 42 }, { id: 'week', usedPct: 88 }] },
    agy: AGY,
  } };
  const l = pillLine(view, NOW);
  assert.deepEqual(l.parts.map((p) => [p.provider, p.wins.map((w) => `${w.kind}:${w.pct}:${w.level}`)]), [
    ['claude', ['week:89:high']],
    ['codex', ['5h:42:ok', 'week:88:high']],
    ['agy', ['5h:41:ok', 'week:13:ok']],
  ]);
  assert.equal(l.level, 'high');
  assert.deepEqual(pillLine(null, NOW), { parts: [], level: 'none' });
  assert.equal(pillLine({ providers: { codex: { windows: [{ id: '5h', usedPct: 70 }] } } }, NOW).level, 'warn');
  // 짧은 이름(두 사전): ko 5h·주, en 5h·wk
  assert.equal(translate('ko', shortKey('5h')), '5h'); assert.equal(translate('ko', shortKey('week')), '주');
  assert.equal(translate('en', shortKey('week')), 'wk'); assert.equal(shortKey('odd'), null);
  assert.ok(translate('ko', 'usage.agyWhat').includes('Gemini')); assert.ok(translate('en', 'usage.agyWhat').includes('Gemini'));
  // 알약은 한 줄 꼴로 그린다(로고 + 짧은 이름 + 값). 휴대폰(compact)은 지금 모양 그대로
  const src = read('Usage.jsx');
  assert.ok(src.includes('pillLine(v, now)') && src.includes('mt-usage-logo') && src.includes('shortName(t, w.kind)'));
  assert.ok(src.includes('shownWindows(k, e)'), '펼침도 같은 규칙');
});

test('0인 응답 필요·작업 완료 알약은 숨긴다', () => {
  const src = read('Chrome.jsx');
  const turn = src.slice(src.indexOf('function TurnPill('), src.indexOf('function ListPill('));
  assert.ok(/if \(!n\) return null;/.test(turn));
  assert.ok(src.includes("{review.length > 0 && <ListPill list={review} label={t('top.review')}"));
});

test('위 막대에 검색 칸이 없고 Ctrl+F가 찾기 창을 연다', () => {
  const src = read('Chrome.jsx');
  assert.ok(!src.includes('data-action="search"'), '위 막대 검색 칩 없음');
  assert.ok(!src.includes('setSearchOpen'));
  assert.equal(translate('ko', 'top.search'), 'top.search', '옛 문구는 지웠다');
  const ev = (o) => ({ key: 'f', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false, ...o });
  assert.equal(boardShortcut(ev()), 'search');
  assert.equal(boardShortcut(ev({ shiftKey: true })), null);
  const main = read('main.jsx');
  assert.ok(/e\.key === 'f' \|\| e\.key === 'F'\)\) \{ e\.preventDefault\(\); setSearchOpen\(true\)/.test(main), 'main.jsx의 Ctrl+F가 찾기 창을 연다');
  // 찾기 창은 떠 있는 창(Esc·바깥 누르기로 닫힘)
  const s = read('Search.jsx');
  assert.ok(s.includes("e.key === 'Escape'") && s.includes('setSearchOpen(false)'));
});

test('새 문구는 두 사전에', () => {
  for (const k of ['topbar.moreHead', 'usage.agyWhat', 'usage.short.week']) {
    assert.notEqual(translate('ko', k), k, k); assert.notEqual(translate('en', k), k, k);
  }
  assert.equal(translate('ko', 'topbar.more', { n: 6 }), '나머지 프로젝트 6개 보기');
  assert.equal(translate('en', 'topbar.more', { n: 6 }), 'Show 6 more workspaces');
});
