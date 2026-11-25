// P363: SDK 세션 표시(세션·런처), 쓸 수 없는 옛 API 런처, 입력칸 글, 휴대폰 줄의 billing, 사전 두 벌
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSdkSession, isSdkLauncher, isUnusableLauncher, sdkDraft } from '../src/renderer/lib/auth-relay.js';
import { liveFromRow } from '../src/renderer/lib/mobile-map.js';
import en from '../src/renderer/locales/en.js';
import ko from '../src/renderer/locales/ko.js';

test('SDK 세션·런처 판별과 쓸 수 없는 옛 API 런처', () => {
  assert.equal(isSdkSession({ billing: 'sdk' }), true);
  assert.equal(isSdkSession({ billing: 'api' }), false);
  assert.equal(isSdkLauncher({ harness: 'claude-sdk' }), true);
  assert.equal(isSdkLauncher({ harness: 'claude' }), false);
  assert.equal(isUnusableLauncher({ harness: 'claude', unusable: 'authRelay' }), true);
  assert.equal(isUnusableLauncher({ harness: 'claude', env: { ANTHROPIC_BASE_URL: '{{authRelay}}' } }), true);
  assert.equal(isUnusableLauncher({ harness: 'claude', env: {} }), false);
});

test('입력칸 글: 끝 공백만 떼고 빈 글은 보내지 않는다', () => {
  assert.equal(sdkDraft('  hi\n'), '  hi');
  assert.equal(sdkDraft('a\nb'), 'a\nb');
  assert.equal(sdkDraft('   \n'), null);
});

test('휴대폰 줄 → 카드 값에 billing sdk가 실린다', () => {
  assert.equal(liveFromRow({ sessionId: 'a', name: 'a', state: 'ready', billing: 'sdk' }).billing, 'sdk');
});

test('사전: sdkSession 열쇠가 en·ko 같고 오류 글이 있다', () => {
  const keys = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v, p + k + '.') : [p + k]));
  assert.deepEqual(keys(ko.sdkSession).sort(), keys(en.sdkSession).sort());
  for (const k of ['relayGone', 'reopen']) assert.ok(ko.sdkSession.err[k] && en.sdkSession.err[k], k);
  assert.ok(!/Claude Code \(API\)/.test(en.authRelay.note) && !/Claude Code \(API\)/.test(ko.authRelay.note), '키 안내는 SDK 런처를 말한다');
});
