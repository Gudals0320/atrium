// P212 단위 시험: 위 바의 폴더(묶음) 칩은 폴더 이름만 보인다. 켜져도 › 안의 워크스페이스 이름을 붙이지 않고, 누르면 지금처럼 그 폴더로 간다
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { wsTabs, groupPick, groupChipView, memberLabel } from '../src/renderer/lib/ws-tabs.js';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/renderer');
const W = (key, extra = {}) => ({ key, name: key.split('/').pop(), root: `E:/work/${key}`, kind: 'folder', ...extra });
const WS = [W('a1'), W('proj/web', { label: 'web' }), W('proj/web/collector', { label: 'web/collector-with-a-long-name' }), W('proj/api', { label: 'api' })];
const GROUPS = [{ id: 'g1', name: 'proj', auto: true, root: 'e:/work/proj', members: ['proj/api', 'proj/web', 'proj/web/collector'] }];
const tabs = wsTabs(WS, GROUPS);
const proj = tabs.find((t) => t.type === 'group');

test('켜진 폴더 칩의 글은 폴더 이름뿐이다', () => {
  const v = groupChipView(proj, 'proj/web/collector');
  assert.equal(v.on, true);
  assert.equal(v.text, 'proj');
  assert.ok(!v.text.includes('collector'));
  assert.equal(memberLabel(v.cur), 'web/collector-with-a-long-name', '지금 워크스페이스는 title용으로만 남는다');
  // 안에서 무엇을 골라도 칩 글은 같다(길이가 바뀌지 않는다)
  for (const k of proj.keys) assert.equal(groupChipView(proj, k).text, 'proj');
});

test('꺼진 폴더 칩도 폴더 이름뿐이고 cur가 없다', () => {
  const v = groupChipView(proj, 'a1');
  assert.deepEqual([v.on, v.cur, v.text], [false, null, 'proj']);
  assert.deepEqual(groupChipView(null, 'a1'), { on: false, cur: null, text: '' });
});

test('폴더 칩을 누르면 그 폴더로 간다(지금 것, 마지막에 보던 것, 첫 구성 순)', () => {
  assert.equal(groupPick(proj, 'proj/web'), 'proj/web');
  assert.equal(groupPick(proj, 'a1', 'proj/web/collector'), 'proj/web/collector');
  assert.equal(groupPick(proj, 'a1'), proj.keys[0]);
});

test('Chrome.jsx의 묶음 칩은 안의 이름 칸을 그리지 않는다(P294: 위 워크스페이스 줄째 없앴다)', () => {
  const src = fs.readFileSync(path.join(SRC, 'Chrome.jsx'), 'utf8');
  assert.ok(!src.includes('ws-group-current'));
  assert.ok(!src.includes('mt-wsgrp-sub'));
  assert.ok(!src.includes('GroupChip') && !src.includes('data-role="workspaces"'));
  const css = fs.readFileSync(path.join(SRC, 'styles.css'), 'utf8');
  assert.ok(!css.includes('.mt-wsgrp-sub'));
});
