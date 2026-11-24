// P179 단위 시험: 세션 맵 오른쪽 칸을 옛 열 지도의 요약 열 모양으로(공용 부품 SummaryColumn.jsx, 묶기 summaryColumn)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as mmodel from '../src/renderer/lib/mission-model.js';
import { summaryColumn } from '../src/renderer/lib/mission-model.js';
import en from '../src/renderer/locales/en.js';
import ko from '../src/renderer/locales/ko.js';

const R = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'renderer');
const read = (f) => fs.readFileSync(path.join(R, f), 'utf8');

test('묶음: 응답 필요(응답 필요 먼저, 오류 뒤) · 작업 중 · 작업 완료 · 쉼·절전·종료는 rest(쉼 → 절전 → 종료, 같은 등급은 맵 차례)', () => {
  const tiers = new Map([['a', 'sleep'], ['b', 'alert'], ['c', 'work'], ['d', 'turn'], ['e', 'review'], ['f', 'rest'], ['g', 'sleep'], ['h', 'done'], ['i', undefined]]);
  const s = summaryColumn([...tiers.keys()], (id) => tiers.get(id));
  assert.deepEqual(s.turn, ['d', 'b']);
  assert.deepEqual(s.work, ['c']);
  assert.deepEqual(s.review, ['e']);
  assert.deepEqual(s.rest, ['f', 'i', 'a', 'g', 'h']);
  // P347: 쉼 · 끝남 묶음(이름 목록, 절전·종료 구분, "외 n개")은 걷었다
  for (const k of ['restShown', 'restHidden', 'restSplit']) assert.equal(k in s, false, k);
  assert.equal('REST_MAX' in mmodel, false);
});

test('수(counts): 작업 중·세션(모든 세션) 수, 빈 판', () => {
  const tiers = { a: 'work', b: 'work', c: 'sleep', d: 'turn' };
  const s = summaryColumn(Object.keys(tiers), (id) => tiers[id]);
  assert.equal(s.counts.work, 2);
  assert.equal(s.counts.all, 4);
  const empty = summaryColumn([], () => 'rest');
  assert.deepEqual([empty.turn, empty.work, empty.review, empty.rest, empty.counts.all], [[], [], [], [], 0]);
});

test('두 지도가 같은 부품: ClassicMission과 세션 맵이 SummaryColumn을 쓴다, 선 안내 문구는 두 사전에(P347: 쉼 · 끝남·바닥 수 줄 없음)', () => {
  const col = read('SummaryColumn.jsx');
  for (const r of ['mm-sum-turn', 'mm-sum-work', 'mm-sum-review', 'mm-sum-foot', 'mm-legend', 'mm-legend-item']) assert.match(col, new RegExp(`data-role="${r}"`), r);
  for (const r of ['mm-sum-rest', 'mm-sum-rest-item', 'mm-sum-rest-more', 'mm-sum-split']) assert.doesNotMatch(col, new RegExp(`data-role="${r}"`), r);
  assert.doesNotMatch(col, /mmFoot\./);
  assert.match(read('Mission.jsx'), /<SummaryColumn /);
  const ln = read('MissionLineage.jsx');
  assert.match(ln, /<SummaryColumn role="ln-summary"/);
  assert.match(ln, /data-action=\{sumOpen \? 'ln-sum-hide' : 'ln-sum-show'\}/);
  assert.ok(!/"By state"|mmSum\.group/.test(ln), '떠 있는 상자 제목·옛 P178 묶음 없음');
  for (const d of [en, ko]) {
    for (const k of ['hint', 'hide', 'show', 'itemTip', 'title']) assert.ok(d.mmSum[k], k);
    for (const k of ['sumTurn', 'sumWork', 'sumReview', 'sumNow', 'sumNone']) assert.ok(d.mmMap[k], k);
    for (const k of ['splitSleep', 'splitDone']) assert.equal(k in d.mmSum, false, k);
    for (const k of ['sumRest', 'restHidden']) assert.equal(k in d.mmMap, false, k);
    assert.equal(d.mmSum.group, undefined);
  }
  const css = read('styles.css');
  assert.match(css, /\.mt-sm \.mt-sm-sum \{ display: flex; right: 0; top: 112px; bottom: 0;/);
  assert.match(css, /body:has\(\.mt-sm-sum\) \.mt-bottom\[data-mission="1"\]/);
});
