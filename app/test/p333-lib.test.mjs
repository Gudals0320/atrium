// P333: 세션 맵 카드의 할 일 배지와 작업 완료 꼬리표를 오른쪽 위 한 무리(.mt-sm-tags)로 쌓는다. 원본 글로 본다(창 시험은 e2e/p333-map-tags.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const jsx = read('../src/renderer/MissionLineage.jsx');
const css = read('../src/renderer/styles.css');

test('PC 세션 맵 카드: [할 일][작업 완료] 차례로 한 무리, 휴대폰 맵(todo 없음)은 작업 완료 꼬리표 그대로', () => {
  assert.match(jsx, /\{todo \? \(\s*<span className="mt-sm-tags" data-role="map-tags">(?:<GuardBadge sessionId=\{n\.sessionId\} where="map" \/>)?<TodoBadge sessionId=\{n\.sessionId\} \/>\{done && <span className="mt-mm-donetag" data-role="mm-done">/);
  assert.match(jsx, /\) : done && <span className="mt-mm-donetag" data-role="mm-done"><DoneMark \/>/);
  assert.doesNotMatch(jsx, /\{todo && <TodoBadge/, '배지가 무리 밖에 따로 있지 않다');
});

test('무리는 오른쪽 위에 세로로(P335), 안의 꼬리표는 제자리(static)·22px·14px', () => {
  assert.match(css, /\.mt-sm-tags \{ position: absolute; right: 18px; bottom: calc\(100% - 11px\);[^}]*flex-direction: column; align-items: flex-end;/);
  assert.match(css, /\.mt-sm-tags \.mt-sm-todo, \.mt-sm-tags \.mt-mm-donetag \{ position: static; height: 22px;[^}]*font: 700 14px\/22px/);
  assert.match(css, /\.mt-sm-tags:empty \{ display: none; \}/);
});

test('멀리 배율: 무리째 키우고(P335: --tk, 무리 오른쪽 아래 기준) 안의 작업 완료 꼬리표는 따로 키우지 않는다', () => {
  assert.match(css, /\.mt-sm-tags \{[^}]*transform: scale\(var\(--tk, 1\)\); transform-origin: right bottom;/);
  assert.match(css, /\.mt-sm \.mt-ta-world\.lv-far \.mt-sm-tags \.mt-mm-donetag \{ transform: none; \}/);
  assert.doesNotMatch(css, /\.mt-sm-todo \{[^}]*left: 18px/, '옛 왼쪽 위 자리 없음');
  assert.doesNotMatch(css, /lv-far \.mt-sm-todo \{[^}]*transform-origin: left top/);
});
