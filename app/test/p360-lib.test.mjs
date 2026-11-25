// P360: 되살리기·갈라 열기 화면의 순수 함수(갈라 열 수 있는가, 단추 제목, 토큰 수 글, 갈라 온 계보 선)와 두 사전
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forkable, forkTitle, fmtTokens, forkLines } from '../src/renderer/lib/revive.js';
import en from '../src/renderer/locales/en.js';
import ko from '../src/renderer/locales/ko.js';

test('갈라 열 수 있는 것: Claude Code 세션(대화형·SDK)만', () => {
  assert.equal(forkable({ sessionId: 'a', kind: 'claude' }), true);
  assert.equal(forkable({ sessionId: 'a', kind: 'claude', billing: 'sdk' }), true);
  assert.equal(forkable({ sessionId: 'a' }), true, '종류가 없는 옛 줄은 claude');
  for (const kind of ['shell', 'codex', 'hermes']) assert.equal(forkable({ sessionId: 'a', kind }), false, kind);
  assert.equal(forkable(null), false);
});

test('단추 제목: 키가 없으면 까닭, 있거나 아직 모르면 설명. 토큰 수 글', () => {
  const t = (k) => k;
  assert.equal(forkTitle(t, false), 'revive.noKeyTitle');
  assert.equal(forkTitle(t, true), 'revive.forkTitle');
  assert.equal(forkTitle(t, null), 'revive.forkTitle');
  assert.deepEqual([fmtTokens(900), fmtTokens(2345), fmtTokens(23060), fmtTokens(1234567)], ['900', '2.3k', '23k', '1.2M']);
});

test('갈라 온 계보 선: 원래 세션과 갈라 연 세션이 둘 다 보일 때만 선 하나', () => {
  const m = new Map([
    ['a', { sessionId: 'a' }],
    ['b', { sessionId: 'b', forkFrom: { sessionId: 'a', name: 'a' } }],
    ['c', { sessionId: 'c', forkFrom: { sessionId: 'gone' } }],
    ['d', { sessionId: 'd', forkFrom: { sessionId: null, convId: 'x' } }],
  ]);
  assert.deepEqual(forkLines(m), [{ id: 'fork:b', source: 'a', target: 'b' }]);
  assert.deepEqual(forkLines(m, (id) => id !== 'a'), []);
});

test('사전: revive 절이 영어·한국어 둘 다 같은 열쇠', () => {
  const keys = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v, `${p}${k}.`) : [`${p}${k}`]));
  assert.deepEqual(keys(en.revive).sort(), keys(ko.revive).sort());
  for (const k of ['forkSdk', 'noKeyTitle', 'forkLine', 'doneArchived']) assert.ok(en.revive[k] && ko.revive[k], k);
  assert.match(ko.revive.forkSdk, /API 크레딧/);
});
