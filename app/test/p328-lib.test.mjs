// P328: 할 일 목록(위쪽 알약 목록도)에서 세션 이름을 누를 때 — 세션 맵이 열려 있으면 맵을 닫고 움직임 없이 한 번에, 캔버스에서는 그대로
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { goSession, MAP_CLOSE_WAIT } from '../src/renderer/lib/go-session.js';

const fake = (missionOpen) => {
  const calls = []; const timers = [];
  const st = { missionOpen, navigateTo: (id, o) => calls.push([id, o]) };
  const closeMap = () => { st.missionOpen = false; calls.push(['close']); };
  const later = (fn, ms) => timers.push([fn, ms]);
  return { st, calls, timers, closeMap, later };
};

test('세션 맵이 열려 있으면: 맵을 닫고, 잠깐 뒤 instant로 그 세션에(날아가기 없음)', () => {
  const f = fake(true);
  assert.equal(goSession('s1', { st: f.st, closeMap: f.closeMap, later: f.later }), 'map');
  assert.deepEqual(f.calls, [['close']]);
  assert.equal(f.st.missionOpen, false);
  assert.equal(f.timers.length, 1);
  assert.equal(f.timers[0][1], MAP_CLOSE_WAIT);
  f.timers[0][0]();
  assert.deepEqual(f.calls, [['close'], ['s1', { instant: true }]]);
});

test('캔버스에서는 지금처럼 navigateTo 기본(움직임 있음, 맵 닫기 없음)', () => {
  const f = fake(false);
  assert.equal(goSession('s2', { st: f.st, closeMap: f.closeMap, later: f.later }), 'canvas');
  assert.deepEqual(f.calls, [['s2', {}]]);
  assert.equal(f.timers.length, 0);
});

test('갈 수 없으면 아무것도 하지 않는다', () => {
  assert.equal(goSession(null, { st: { navigateTo() {} } }), null);
  assert.equal(goSession('x', { st: {} }), null);
  assert.equal(goSession('x', {}), null);
});

test('할 일 목록·위쪽 알약 목록이 goSession을 쓴다(휴대폰 시트는 그대로)', () => {
  const dj = fs.readFileSync(new URL('../src/renderer/Decisions.jsx', import.meta.url), 'utf8');
  assert.match(dj, /const go = \(id\) => \{ setOpen\(false\); goSession\(id, \{ st: getState\(\), closeMap: \(\) => setMissionOpen\(false\) \}\); \};/);
  assert.match(dj, /<DecisionList onGo=\{\(id\) => \{ setOpen\(false\); if \(onOpen\) onOpen\(id\); \}\} \/>/);
  const ch = fs.readFileSync(new URL('../src/renderer/Chrome.jsx', import.meta.url), 'utf8');
  assert.match(ch, /const go = \(id\) => goSession\(id, \{ st: getState\(\), closeMap: \(\) => setMissionOpen\(false\) \}\);/);
});
