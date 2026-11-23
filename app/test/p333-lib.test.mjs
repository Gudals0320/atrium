// P333: 세션 맵 카드의 할 일 배지와 작업 완료 꼬리표를 오른쪽 위 한 무리(.mt-sm-tags)로 쌓는다. 원본 글로 본다(창 시험은 e2e/p333-map-tags.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const jsx = read('../src/renderer/MissionLineage.jsx');
const css = read('../src/renderer/styles.css');

test('PC 세션 맵 카드: [할 일][작업 완료] 차례로 한 무리, 휴대폰 맵(todo 없음)은 작업 완료 꼬리표 그대로', () => {
  assert.match(jsx, /\{todo \? \(\s*<span className="mt-sm-tags" data-role="map-tags"><TodoBadge sessionId=\{n\.sessionId\} \/>\{done && <span className="mt-mm-donetag" data-role="mm-done">/);
  assert.match(jsx, /\) : done && <span className="mt-mm-donetag" data-role="mm-done"><DoneMark \/>/);
  assert.doesNotMatch(jsx, /\{todo && <TodoBadge/, '배지가 무리 밖에 따로 있지 않다');
});

test('무리는 오른쪽 위 테두리에 걸치고, 안의 꼬리표는 제자리(static)·19px·11.5px', () => {
  assert.match(css, /\.mt-sm-tags \{ position: absolute; top: -10px; right: 18px;[^}]*display: inline-flex;[^}]*gap: 5px;/);
  assert.match(css, /\.mt-sm-tags \.mt-sm-todo, \.mt-sm-tags \.mt-mm-donetag \{ position: static; height: 19px;[^}]*font: 700 11\.5px\/19px/);
  assert.match(css, /\.mt-sm-tags:empty \{ display: none; \}/);
});

test('멀리 배율: 무리째 오른쪽 위 기준으로 키우고 안의 작업 완료 꼬리표는 따로 키우지 않는다', () => {
  assert.match(css, /\.mt-sm \.mt-ta-world\.lv-far \.mt-sm-tags \{ transform: scale\(clamp\(1\.6, calc\(var\(--ik, 1\) \* 0\.85\), 3\.2\)\); transform-origin: right top; \}/);
  assert.match(css, /\.mt-sm \.mt-ta-world\.lv-far \.mt-sm-tags \.mt-mm-donetag \{ transform: none; \}/);
  assert.doesNotMatch(css, /\.mt-sm-todo \{[^}]*left: 18px/, '옛 왼쪽 위 자리 없음');
  assert.doesNotMatch(css, /lv-far \.mt-sm-todo \{[^}]*transform-origin: left top/);
});
