// P176: 음성 입력이 보이게. 녹음 중 아래 바 고정(lib/bottom.js), 녹음 알약 판정·지난 시간·창 숨김 멈춤·멈춘 까닭 문구(lib/voice-text.js)
import test from 'node:test';
import assert from 'node:assert/strict';
import { holdReason, bottomNext, HIDE_DELAY_MS } from '../src/renderer/lib/bottom.js';
import { pillWanted, voiceElapsed, stopOnHide, voiceErrorKey } from '../src/renderer/lib/voice-text.js';
import en from '../src/renderer/locales/en.js';
import ko from '../src/renderer/locales/ko.js';
import { autoTag } from '../src/renderer/lib/cmd-input.js';

// 추가(2026-11-17): 판에서 세션을 누르면 빈 명령줄에 그 세션 태그(lib/cmd-input.js autoTag)
test('자동 태그: 빈 명령줄에서 세션을 누르면 @이름, 다른 세션을 누르면 옮겨 가고, 빈 판을 누르면 지운다', () => {
  let s = autoTag({ text: '', auto: null }, 'a');
  assert.deepEqual(s, { text: '@a ', auto: 'a' });
  s = autoTag(s, 'b');
  assert.deepEqual(s, { text: '@b ', auto: 'b' });
  s = autoTag(s, null);
  assert.deepEqual(s, { text: '', auto: null });
  assert.deepEqual(autoTag({ text: '', auto: null }, null), { text: '', auto: null });
});

test('자동 태그: 글이나 다른 태그가 있으면 손대지 않고, 사람이 고친 태그는 보통 태그가 된다', () => {
  assert.deepEqual(autoTag({ text: '안녕', auto: null }, 'a'), { text: '안녕', auto: null });
  assert.deepEqual(autoTag({ text: '@x ', auto: null }, 'a'), { text: '@x ', auto: null }, '손으로 넣은 태그');
  assert.deepEqual(autoTag({ text: ' ', auto: null }, 'a'), { text: ' ', auto: null }, '빈칸도 글이다');
  let s = autoTag({ text: '@a 할 일', auto: 'a' }, 'b'); // 저절로 넣은 @a 뒤에 글을 쳤다
  assert.deepEqual(s, { text: '@a 할 일', auto: null });
  assert.deepEqual(autoTag(s, null), { text: '@a 할 일', auto: null });
  assert.deepEqual(autoTag({ text: '@a @c ', auto: 'a' }, 'b'), { text: '@a @c ', auto: null }, '태그를 더했다');
  assert.deepEqual(autoTag({ text: '@a x', auto: 'a' }, null), { text: '@a x', auto: null }, '빈 판을 눌러도 고친 글은 그대로');
});

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
