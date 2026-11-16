// P176: 음성 입력이 보이게. 녹음 중 아래 바 고정(lib/bottom.js), 녹음 알약 판정·지난 시간·창 숨김 멈춤·멈춘 까닭 문구(lib/voice-text.js)
import test from 'node:test';
import assert from 'node:assert/strict';
import { holdReason, bottomNext, HIDE_DELAY_MS } from '../src/renderer/lib/bottom.js';
import { pillWanted, voiceElapsed, stopOnHide, voiceErrorKey } from '../src/renderer/lib/voice-text.js';
import en from '../src/renderer/locales/en.js';
import ko from '../src/renderer/locales/ko.js';

test('녹음 중에는 아래 바가 숨지 않는다: 마우스가 밖에 있어도 붙잡고, 숨은 바는 바로 나타난다', () => {
  assert.equal(holdReason({ voice: true }), 'voice');
  assert.equal(holdReason({ voice: false }), null);
  assert.deepEqual(bottomNext({ shown: true, zone: 'out', voice: true }), { shown: true, delay: 0 });
  assert.deepEqual(bottomNext({ shown: false, zone: 'out', voice: true }), { shown: true, delay: 0 });
  // 녹음이 끝나면 평소대로 잠시 뒤 숨는다
  assert.deepEqual(bottomNext({ shown: true, zone: 'out', voice: false }), { shown: false, delay: HIDE_DELAY_MS });
  // 시험 고정이 먼저
  assert.equal(holdReason({ pinned: true, voice: true }), 'pinned');
});

test('녹음 알약: 녹음 중 마이크 단추가 숨거나, 가리거나, 화면 밖이면 보인다', () => {
  const view = { w: 1200, h: 800 };
  const rect = { left: 100, top: 740, right: 130, bottom: 770, width: 30, height: 30 };
  assert.equal(pillWanted({ active: false, rect, view, hit: false }), false, '녹음이 없으면 없다');
  assert.equal(pillWanted({ active: true, rect, view, hit: true }), false, '단추가 보이면 없다');
  assert.equal(pillWanted({ active: true, rect, view, hit: false }), true, '덮개(세션 맵·대화상자·검색)에 가림');
  assert.equal(pillWanted({ active: true, rect, view, hit: true, hidden: true }), true, '숨은 바 안');
  assert.equal(pillWanted({ active: true, rect: { ...rect, width: 0, height: 0 }, view, hit: true }), true, 'display none');
  assert.equal(pillWanted({ active: true, rect: { left: 100, right: 130, top: 820, bottom: 850, width: 30, height: 30 }, view, hit: true }), true, '창 아래 밖');
  assert.equal(pillWanted({ active: true, rect: null, view }), true, '단추가 없다');
});

test('지난 시간: 분:초', () => {
  assert.equal(voiceElapsed(0), '0:00');
  assert.equal(voiceElapsed(7400), '0:07');
  assert.equal(voiceElapsed(65000), '1:05');
  assert.equal(voiceElapsed(600000), '10:00');
  assert.equal(voiceElapsed(-5), '0:00');
});

test('창 숨김(최소화·트레이): 연결 중·듣는 중이면 멈춘다', () => {
  assert.equal(stopOnHide('hidden', 'listening'), true);
  assert.equal(stopOnHide('hidden', 'connecting'), true);
  assert.equal(stopOnHide('hidden', 'stopping'), false);
  assert.equal(stopOnHide('hidden', 'idle'), false);
  assert.equal(stopOnHide('visible', 'listening'), false);
});

test('멈춘 까닭 문구: 말 없음·창 숨김, 두 사전에 있다', () => {
  assert.equal(voiceErrorKey('silence'), 'voice.silence');
  assert.equal(voiceErrorKey('hidden'), 'voice.hidden');
  assert.equal(voiceErrorKey('limit'), 'voice.limit');
  for (const d of [en, ko]) for (const k of ['silence', 'hidden', 'pillStop', 'pillStopShort']) assert.ok(d.voice[k], k);
  assert.match(ko.voice.silence, /30초/);
});
