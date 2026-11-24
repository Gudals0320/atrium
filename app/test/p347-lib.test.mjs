// P347 단위 시험: 화면 정리 다섯 가지.
// 1) Hermes 사용량(설정 줄·사전·Codex 칸 합침)을 걷었다, 2) 변경 내역(명령 줄 위 알약, 위 오른쪽 단추, 복귀 요약 창)을 걷었다,
// 3) 세션 맵 단추는 점 + "세션 맵" 글, 4) 세션 맵 오른쪽 아래는 선 모양 견본 범례(하위·역할·요청·다른 워크스페이스·동료·독립), 5) 쉼 · 끝남 묶음 없음
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import en from '../src/renderer/locales/en.js';
import ko from '../src/renderer/locales/ko.js';
import { navOf, searchItems } from '../src/renderer/lib/settings-nav.js';
import { STATUS_PILLS } from '../src/renderer/lib/top-pills.js';
import * as attention from '../src/renderer/lib/attention.js';

const R = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'renderer');
const read = (f) => fs.readFileSync(path.join(R, f), 'utf8');
const css = () => read('styles.css');

test('1) Hermes 사용량: 설정 줄·찾기 항목·사전 열쇠가 없다', () => {
  const nav = JSON.stringify(navOf ? navOf() : null) + read('lib/settings-nav.js');
  assert.doesNotMatch(nav, /usageHermes/);
  assert.doesNotMatch(read('Settings.jsx'), /usageHermes|usage-hermes-setting|hermesName/);
  for (const d of [ko, en]) {
    for (const k of ['hermesName', 'hermesHint', 'hermesSetOn', 'hermesSetOff', 'mergedWith']) assert.equal(k in d.usageProbe, false, k);
    assert.doesNotMatch(d.usageProbe.hint, /Hermes/);
  }
  assert.doesNotMatch(read('Usage.jsx'), /mergedInto|usage-merged|hermesProvider/);
});

test('2) 변경 내역: 명령 줄 위 알약·위 오른쪽 단추·복귀 요약 창과 그 사전·아이콘이 없다', () => {
  const chrome = read('Chrome.jsx');
  assert.doesNotMatch(chrome, /chip-changes|data-action="changes"|showChanges|top\.changes|chips\.changes/);
  assert.equal(fs.existsSync(path.join(R, 'ReturnSummary.jsx')), false);
  assert.doesNotMatch(read('main.jsx'), /ReturnSummary/);
  assert.doesNotMatch(read('store.js'), /boardSeenAt|showChanges/);
  assert.ok(!STATUS_PILLS.includes('changes'));
  for (const k of ['awayLongEnough', 'DEFAULT_AWAY_MS', 'CHANGE_LABEL']) assert.equal(k in attention, false, k);
  for (const d of [ko, en]) {
    for (const k of ['returnSummary', 'change', 'changeSys']) assert.equal(k in d, false, k);
    assert.equal('changes' in d.top, false); assert.equal('changes' in d.chips, false); assert.equal('changesTitle' in d.chips, false);
  }
  assert.doesNotMatch(css(), /\.mt-return[ -{]/);
  assert.doesNotMatch(read('phone.css'), /data-action=changes/);
  assert.doesNotMatch(read('lib/icons.jsx'), /\bhistory:/);
});

test('3) 세션 맵 단추: 점은 두고 옆에 늘 "세션 맵"(en "Session map") 글, 점만 두던 dot-only는 없다', () => {
  const c = read('Chrome.jsx');
  const conn = c.slice(c.indexOf('function ConnPill('), c.indexOf('function ResourcePill('));
  assert.match(conn, /className=\{`mt-dot /);
  assert.match(conn, /<span className="mt-conn-label" data-role="conn-label">\{t\('mapPill\.label'\)\}<\/span>/);
  assert.doesNotMatch(conn, /dot-only/);
  assert.doesNotMatch(css(), /dot-only/);
  assert.equal(ko.mapPill.label, '세션 맵');
  assert.equal(en.mapPill.label, 'Session map');
  // 좁은 창 접기(tight)는 .dim 글만 숨긴다: 세션 맵 글(.mt-conn-label)은 dim이 아니라 남는다
  assert.match(css(), /\.mt-cluster\.tr\.compact \.mt-cp \.dim \{ display: none; \}/);
  assert.doesNotMatch(conn, /mt-conn-label dim|className="dim"[^>]*conn-label/);
});

test('4) 세션 맵 범례: 여섯 선 종류(맵 선과 같은 k-*), 한두 낱말, 수 줄·긴 문단 대신', () => {
  const ln = read('MissionLineage.jsx');
  const m = ln.match(/const LEGEND = (\[[^\n]*\]);/);
  assert.ok(m, 'LEGEND');
  const legend = JSON.parse(m[1].replace(/'/g, '"'));
  assert.deepEqual(legend.map(([k]) => k), ['spawn', 'role', 'prompt', 'cross', 'peer', 'lineage']);
  // 맵이 그리는 선 종류와 같다(.mt-sm .mt-ta-edge.k-*에 색이 있다)
  for (const [k] of legend) assert.match(css(), new RegExp(`\\.mt-sm \\.mt-ta-edge\\.k-${k}`), k);
  for (const d of [ko, en]) {
    assert.deepEqual(Object.keys(d.mmLegend).sort(), legend.map(([k]) => k).sort());
    for (const v of Object.values(d.mmLegend)) assert.ok(v.length <= 16 && v.split(' ').length <= 2, v);
  }
  assert.deepEqual(Object.values(ko.mmLegend), ['하위', '역할', '요청', '다른 워크스페이스', '동료', '독립']);
  assert.match(ln, /legend=\{LEGEND\.map/);
  assert.match(ln, /legendTip=\{t\('mmSum\.hint'\)\}/); // 긴 풀이는 마우스를 올리면
  assert.doesNotMatch(ln, /teams=|nTeams/);
  const col = read('SummaryColumn.jsx');
  assert.match(col, /data-role="mm-legend-item" data-kind=\{k\}/);
  assert.match(col, /className=\{`mt-ta-edge k-\$\{k\}`\}/);
  assert.doesNotMatch(col, /mmFoot|sum\.counts/);
});

test('5) 쉼 · 끝남 묶음과 이름 목록이 없다', () => {
  const col = read('SummaryColumn.jsx');
  assert.doesNotMatch(col, /mm-sum-rest|mm-sum-split|restShown|restSplit|sumRest/);
  assert.doesNotMatch(css(), /\.mt-mm-rest|\.mt-mm-rn|\.mt-mm-split/);
});

test('사전: 새 열쇠(mapPill, mmLegend)는 두 사전 끝에, 같은 키', () => {
  for (const k of ['mapPill', 'mmLegend']) assert.deepEqual(Object.keys(ko[k]).sort(), Object.keys(en[k]).sort());
  const kk = Object.keys(ko), ek = Object.keys(en);
  assert.deepEqual(kk.slice(-2), ['mapPill', 'mmLegend']);
  assert.deepEqual(ek.slice(-2), ['mapPill', 'mmLegend']);
  assert.ok(searchItems);
});
