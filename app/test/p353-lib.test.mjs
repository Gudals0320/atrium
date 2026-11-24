// P353: 휴대폰 전용 페이지의 순수 함수(lib/mobile.js)와 묶음 나누기(sw-rules, boot)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applySync, applyRow, applyGone, homeOf, listOf, treeOf, togglePin, readList, detailStale, mergeHistory, choiceButtons, shortChoice, uiFactor, QUICK_KEYS, matches } from '../src/renderer/lib/mobile.js';
import { KEY_NAMES } from '../../backend/src/keys.mjs';
import { swRoute, shellList } from '../src/renderer/lib/sw-rules.js';
import en from '../src/renderer/locales/en.js';
import ko from '../src/renderer/locales/ko.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const row = (id, o = {}) => ({ sessionId: id, name: id, workspaceKey: 'w1', kind: 'claude', state: 'ready', createdAt: Number(id.replace(/\D/g, '')) || 0, line: { kind: 'answer', text: '' }, ...o });

test('줄 모음: 처음은 모두, 다시 붙으면 차이(바뀐 줄 + 지운 세션), 옛 버전 이벤트는 버린다', () => {
  let s = applySync(null, { full: true, rev: 5, boot: 'b', rows: [row('a1'), row('a2'), row('a3')] });
  assert.equal(s.rows.size, 3);
  s = applySync(s, { full: false, rev: 7, boot: 'b', rows: [row('a2', { state: 'working' })], gone: ['a3'] });
  assert.deepEqual([...s.rows.keys()], ['a1', 'a2']); assert.equal(s.rows.get('a2').state, 'working'); assert.equal(s.rev, 7);
  const same = applyRow(s, { rev: 6, row: row('a1', { state: 'error' }) });
  assert.equal(same, s, '이미 받은 버전');
  s = applyRow(s, { rev: 8, row: row('a4') });
  assert.equal(s.rows.size, 3); assert.equal(s.rev, 8);
  s = applyGone(s, { rev: 9, sessionId: 'a4' });
  assert.equal(s.rows.has('a4'), false); assert.equal(s.rev, 9);
  s = applySync(s, { full: true, rev: 2, boot: 'c', rows: [row('z9')] });
  assert.deepEqual([...s.rows.keys()], ['z9'], '백엔드가 다시 떴으면 모두 바꾼다');
});

test('홈: 응답 필요는 오래 기다린 순, 작업 중·작업 완료 수', () => {
  const rows = new Map([
    ['n1', row('n1', { state: 'waiting', waitingSince: 30 })], ['n2', row('n2', { state: 'waiting', waitingSince: 10 })], ['t1', row('t1', { state: 'trust_wait', waitingSince: 20 })],
    ['w1', row('w1', { state: 'working' })], ['d1', row('d1', { state: 'ready', unseen: true, lastActivityAt: 5 })], ['r1', row('r1')], ['z1', row('z1', { state: 'sleeping' })],
  ]);
  const h = homeOf(rows);
  assert.deepEqual(h.needs.map((x) => x.sessionId), ['n2', 't1', 'n1']);
  assert.deepEqual(h.counts, { need: 3, work: 1, done: 1 });
});

test('세션 목록: 찾기, 고정은 위에, 묶음 안 살아 있는 세션(응답 필요 → 작업 중 → 나머지) 먼저, 잠든 세션은 따로', () => {
  const rows = new Map([
    ['a1', row('a1', { state: 'sleeping', lastActivityAt: 1 })], ['a2', row('a2')], ['a3', row('a3', { state: 'working' })], ['a4', row('a4', { state: 'waiting' })],
    ['b1', row('b1', { workspaceKey: 'w2' })], ['c1', row('c1', { workspaceKey: null })],
  ]);
  const ws = [{ key: 'w2', name: 'two' }, { key: 'w1', name: 'one' }];
  const v = listOf(rows, ws, { pins: ['b1', 'gone'] });
  assert.deepEqual(v.pinned.map((s) => s.sessionId), ['b1']);
  assert.deepEqual(v.groups.map((g) => g.name), ['two', 'one', null], '판 순서, 키 없는 묶음은 끝');
  const one = v.groups[1];
  assert.deepEqual(one.live.map((s) => s.sessionId), ['a4', 'a3', 'a2']);
  assert.deepEqual(one.sleeping.map((s) => s.sessionId), ['a1']);
  assert.equal(one.need, 1);
  assert.deepEqual(listOf(rows, ws, { query: 'TWO' }).groups.map((g) => g.name), ['two'], '워크스페이스 이름으로도 찾는다');
  assert.deepEqual(listOf(rows, ws, { filter: 'work' }).groups.flatMap((g) => g.live.map((s) => s.sessionId)), ['a3']);
  assert.ok(matches(row('x', { line: { text: 'Merge parser' } }), 'parser'));
});

test('고정: 앞에 넣고 다시 누르면 뺀다, 저장 값이 깨졌으면 빈 목록', () => {
  assert.deepEqual(togglePin(['a'], 'b'), ['b', 'a']);
  assert.deepEqual(togglePin(['b', 'a'], 'b'), ['a']);
  assert.deepEqual(readList({ getItem: () => '{bad' }, 'k'), []);
  assert.deepEqual(readList({ getItem: () => '["x",1]' }, 'k'), ['x']);
});

test('맵 나무: 워크스페이스마다 깊이 우선, 갈래 표시, 다른 워크스페이스의 부모는 뿌리로, 잠든 뿌리는 뒤로', () => {
  const rows = new Map([
    ['p1', row('p1')], ['c2', row('c2', { parentSessionId: 'p1' })], ['c3', row('c3', { parentSessionId: 'p1' })], ['g4', row('g4', { parentSessionId: 'c2' })],
    ['s5', row('s5', { state: 'sleeping', createdAt: 0 })], ['x6', row('x6', { workspaceKey: 'w2', parentSessionId: 'p1' })],
  ]);
  const t = treeOf(rows, [{ key: 'w1', name: 'one' }, { key: 'w2', name: 'two' }]);
  const one = t[0].items.map((x) => [x.s.sessionId, x.guides.join('|')]);
  assert.deepEqual(one, [['p1', ''], ['c2', 'elbow'], ['g4', 'line|elbow end'], ['c3', 'elbow end'], ['s5', '']]);
  assert.deepEqual(t[1].items.map((x) => [x.s.sessionId, x.depth]), [['x6', 0]]);
  // 고리(서로 부모)도 빠지지 않는다
  const loop = treeOf(new Map([['a1', row('a1', { parentSessionId: 'b2' })], ['b2', row('b2', { parentSessionId: 'a1' })]]), []);
  assert.equal(loop[0].items.length, 2);
});

test('세션 화면을 다시 받을 때: 상태·답·활동·요청이 바뀌면', () => {
  const a = row('a1', { lastActivityAt: 1, lastAnswerAt: 1 });
  assert.equal(detailStale(a, { ...a }), false);
  assert.equal(detailStale(a, { ...a, lastActivityAt: 2 }), true);
  assert.equal(detailStale(a, { ...a, state: 'working' }), true);
  assert.equal(detailStale({ ...a, ask: { toolUseId: 'x' } }, { ...a, ask: { toolUseId: 'y' } }), true);
  assert.equal(detailStale(a, { ...a, line: { text: 'changed only the line' } }), false);
});

test('기록 더 보기는 앞에 붙이고 겹친 seq는 한 번', () => {
  assert.deepEqual(mergeHistory([{ seq: 5 }, { seq: 6 }], [{ seq: 3 }, { seq: 5 }]).map((x) => x.seq), [3, 5, 6]);
});

test('빠른 키(Esc Enter ↑ ↓ 1 2 3 y n)는 모두 백엔드 session.keys 허용 키', () => {
  assert.deepEqual(QUICK_KEYS, ['esc', 'enter', 'up', 'down', '1', '2', '3', 'y', 'n']);
  for (const k of QUICK_KEYS) assert.ok(KEY_NAMES.includes(k), k);
});

test('홈 카드 번호 단추: 요청 보기가 있으면 그 번호와 짧은 글, 없으면 1·2·3', () => {
  assert.deepEqual(choiceButtons(null).map((b) => b.key), ['1', '2', '3']);
  const b = choiceButtons({ choices: [{ n: 1, label: 'Yes' }, { n: 2, label: 'Yes, and always allow access' }, { n: 3, label: 'No' }] });
  assert.deepEqual(b.map((x) => x.key), ['1', '2', '3']);
  assert.ok(b[1].short.length <= 14 && b[1].short.endsWith('…'));
  assert.equal(shortChoice('Yes'), 'Yes');
});

test('글자 크기: 옛 휴대폰 값(기본 0.8)을 페이지 배율로, 0.75~1.5', () => {
  assert.equal(uiFactor(0.8), 1); assert.equal(uiFactor(1.2), 1.5); assert.equal(uiFactor(0.4), 0.75); assert.equal(uiFactor(undefined), 1);
});

test('묶음 나누기: 서비스 워커가 새 묶음과 조각을 껍데기로 본다, 첫 스크립트는 boot.js', () => {
  for (const p of ['/boot.js', '/mobile.js', '/mobile.css', '/fullmap.js', '/fullmap.css', '/chunk-AB12CD34.js', '/renderer.js']) assert.equal(swRoute({ url: 'http://x' + p, origin: 'http://x' }), 'shell', p);
  assert.equal(swRoute({ url: 'http://x/chunk-../x.js', origin: 'http://x' }), 'pass');
  assert.ok(shellList(['boot.js', 'mobile.js', 'chunk-XY.js', 'chunk-XY.js.map']).includes('./chunk-XY.js'));
  const html = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'index.html'), 'utf8');
  assert.match(html, /src="boot\.js"/);
  assert.doesNotMatch(html, /renderer\.css/, 'CSS는 boot.js가 고른다');
});

test('휴대폰 페이지 묶음은 판 화면의 무거운 모듈(캔버스, xterm, 세션 맵)을 들이지 않는다', () => {
  const src = (f) => fs.readFileSync(path.join(ROOT, 'src', 'renderer', f), 'utf8');
  for (const f of ['MobileApp.jsx', 'mobile.jsx', 'mobile-store.js']) {
    const s = src(f);
    for (const bad of ['@xyflow', '@xterm', './Canvas.jsx', './TerminalView.jsx', './PhoneMission.jsx', './Phone.jsx', './Settings.jsx', './RemoteBar.jsx', './main.jsx']) assert.ok(!s.includes("from '" + bad), f + ' ← ' + bad);
  }
});

test('사전: 휴대폰 페이지 글은 영어·한국어 열쇠가 같다', () => {
  assert.deepEqual(Object.keys(ko.mobile).sort(), Object.keys(en.mobile).sort());
  for (const k of QUICK_KEYS) assert.ok(en.mobile['key_' + k] && ko.mobile['key_' + k], k);
});
