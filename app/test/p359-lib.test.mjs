// P359: API 런처·API 세션 구분, 중계기 상태 줄, 휴대폰 줄의 billing, 사전 두 벌, 키 칸이 키를 창 상태에 남기지 않음
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isApiLauncher, isApiSession, relayLine, lastErrorKind, RELAY_PLACEHOLDER } from '../src/renderer/lib/auth-relay.js';
import { liveFromRow } from '../src/renderer/lib/mobile-map.js';
import ko from '../src/renderer/locales/ko.js';
import en from '../src/renderer/locales/en.js';

const here = path.dirname(fileURLToPath(import.meta.url));

test('API 런처와 API 세션 가르기', () => {
  assert.equal(isApiLauncher({ harness: 'claude', env: { ANTHROPIC_BASE_URL: RELAY_PLACEHOLDER } }), true);
  assert.equal(isApiLauncher({ harness: 'claude', env: { ANTHROPIC_BASE_URL: 'http://127.0.0.1:9' } }), false);
  assert.equal(isApiLauncher({ harness: 'codex', env: {} }), false);
  assert.equal(isApiSession({ billing: 'api' }), true);
  assert.equal(isApiSession({ billing: null }), false);
});

test('중계기 상태 줄', () => {
  assert.equal(relayLine(null).key, 'authRelay.statusUnknown');
  assert.equal(relayLine({ keyPresent: false }).key, 'authRelay.statusNoKey');
  assert.deepEqual(relayLine({ keyPresent: true, running: true, port: 5, requests: 3 }), { key: 'authRelay.statusRunning', vars: { port: 5, n: 3 } });
  assert.equal(relayLine({ keyPresent: true, running: false }).key, 'authRelay.statusStopped');
  assert.equal(lastErrorKind({ lastError: { kind: 'http_401:authentication_error', at: 1 } }), 'http_401:authentication_error');
  assert.equal(lastErrorKind({}), null);
});

test('휴대폰 줄 → 카드 값에 billing이 실린다', () => {
  assert.equal(liveFromRow({ sessionId: 'a', name: 'a', state: 'ready', billing: 'api' }).billing, 'api');
  assert.equal(liveFromRow({ sessionId: 'a', name: 'a', state: 'ready' }).billing, undefined);
});

test('사전 두 벌에 같은 열쇠', () => {
  const keys = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v, `${p}${k}.`) : [`${p}${k}`]));
  assert.deepEqual(keys(ko.authRelay).sort(), keys(en.authRelay).sort());
  for (const k of ['noKey', 'keyShape', 'protect', 'start', 'down']) assert.ok(ko.authRelay.err[k] && en.authRelay.err[k], k);
});

test('키 칸: 비밀번호 칸, 보내는 즉시 비운다, 키를 전역 상태(store)에 두지 않는다', () => {
  const src = fs.readFileSync(path.join(here, '..', 'src', 'renderer', 'AuthRelay.jsx'), 'utf8');
  assert.match(src, /type="password"/);
  assert.match(src, /const k = val; setVal\(''\)/);
  assert.ok(!/getState|setState\(\s*\{[^}]*key/.test(src), 'store에 넣지 않는다');
  assert.ok(!/console\.(log|info|debug)/.test(src), '로그에 남기지 않는다');
});
