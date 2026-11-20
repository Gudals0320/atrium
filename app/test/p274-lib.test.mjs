// P274 시험: 명령 바 위 띠(lib/cmd-head.js), 글 칸 높이 상한과 긴 줄 꺾기(styles.css), 바 배치(CommandBar.jsx), 옛 rig 글 흔적 없음
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cmdHead, HEAD_CHIPS } from '../src/renderer/lib/cmd-head.js';
import { steerTargets } from '../src/renderer/lib/steer.js';
import { recipients, maxFieldHeight, fieldHeight } from '../src/renderer/lib/cmd-input.js';
import { deliveryText } from '../src/renderer/lib/labels.js';
import { setLanguage } from '../src/renderer/lib/i18n.js';
import ko from '../src/renderer/locales/ko.js';
import en from '../src/renderer/locales/en.js';

const R = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'renderer');
const read = (f) => fs.readFileSync(path.join(R, f), 'utf8');
const S = (name, f = {}) => ({ sessionId: 'id-' + name, name, state: 'working', kind: 'claude', hooked: true, ...f });
const list = [S('a'), S('b'), S('c'), S('d'), S('cx', { kind: 'gemini' }), S('sh', { kind: 'shell' })];
const head = (text, steer = false) => { const to = recipients(text, list); return cmdHead({ recipients: to, steerTo: steerTargets(to, list), steer, hasText: !!text.trim() }); };

test('띠: 받는 세션이 없으면 숨는다', () => {
  assert.deepEqual(head(''), { show: false, chips: [], more: 0, steer: null });
  assert.equal(head('그냥 글').show, false);
});
test('띠: 받는 세션 칩은 앞 셋과 나머지 수', () => {
  const h = head('@a @b @c @d 글');
  assert.equal(h.chips.length, HEAD_CHIPS);
  assert.deepEqual(h.chips.map((x) => x.name), ['a', 'b', 'c']);
  assert.equal(h.more, 1);
});
test('띠: 스티어링할 수 있으면 꺼진 동안 Ctrl+Enter 안내, 켜면 켬 표시', () => {
  assert.equal(head('@a 글').steer, 'key');
  assert.equal(head('@a ').steer, 'key'); // 태그 뒤 빈칸만 있어도 글로 본다(trim 전 글이 있다)
  assert.equal(head('@a 글', true).steer, 'on');
});
test('띠: 스티어링할 수 없는 받는 세션만이면 안내도 켬 표시도 없다', () => {
  assert.equal(head('@cx 글').steer, null);
  assert.equal(head('@cx 글', true).steer, null);
  assert.equal(head('@sh 글', true).steer, null);
});

test('글 칸 높이: 상한(18줄, 창 높이의 42%)에 닿으면 안쪽 스크롤', () => {
  const max = maxFieldHeight({ lineHeight: 22, viewportHeight: 1000 });
  assert.equal(max, 396);
  assert.deepEqual(fieldHeight({ contentHeight: 22, lineHeight: 22, maxHeight: max }), { height: 22, scroll: false });
  assert.deepEqual(fieldHeight({ contentHeight: 5000, lineHeight: 22, maxHeight: max }), { height: max, scroll: true });
  assert.equal(maxFieldHeight({ lineHeight: 22, viewportHeight: 600 }), 252);
});

test('CSS: 공백 없는 긴 줄을 글 칸 안에서 꺾고, 위 띠와 아이콘 토글이 있다', () => {
  const css = read('styles.css');
  assert.match(css, /\.mt-cmd-field > \.mt-cmd-input, \.mt-cmd-mirror \{ overflow-wrap: anywhere; \}/);
  assert.match(css, /\.mt-cmd-head \{ position: absolute;/);
  assert.match(css, /\.mt-cmd > \.mt-cmd-steer \{[^}]*width: 30px; height: 30px;/);
  assert.match(css, /\.mt-thread \{ max-height: [^}]*var\(--mt-cmd-grow/); // 바가 자라도 Thread가 창 위로 넘치지 않는다
  const pcss = read('phone.css');
  assert.match(pcss, /\.mt-ph-input \.mt-ph-steer \{[^}]*width: 44px;/);
  assert.match(pcss, /\.mt-ph-input textarea \{ overflow-wrap: anywhere; \}/);
});

test('배치: 받는 세션 칩은 위 띠 안, 스티어링 단추는 글자 없이 아이콘', () => {
  const src = read('CommandBar.jsx');
  const at = src.indexOf('className="mt-cmd-head"');
  assert.ok(at > 0 && src.indexOf('data-role="cmd-to"') > at, '칩은 띠 안');
  const btn = src.slice(src.indexOf('data-action="cmd-steer"'));
  assert.match(btn.slice(0, btn.indexOf('</button>')), /<Icon name="steer" \/>$/);
  const phone = read('Phone.jsx');
  const pb = phone.slice(phone.indexOf('data-action="phone-steer"'));
  assert.doesNotMatch(pb.slice(0, pb.indexOf('</button>')), /\{t\('cmdSteer\.label'\)\}<\/button>/);
});

test('사전: 두 언어에 새 글이 있고 옛 rig 글이 없다', () => {
  for (const d of [ko, en]) {
    for (const k of ['steerOn', 'steerKey', 'phoneSteerOn', 'oldHoldDropped']) assert.ok(d.cmdHead && d.cmdHead[k], k);
    assert.equal(d.rigLoopHold, undefined);
  }
  for (const f of ['locales/ko.js', 'locales/en.js', 'lib/labels.js']) assert.doesNotMatch(read(f), /rigLoopHold|\brig\b/i, f);
});

test('옛 흐름에서 취소된 전달(loop_dropped)은 보통 말로 보인다', () => {
  setLanguage('ko');
  const k = deliveryText({ status: 'cancelled', reason: 'loop_dropped' });
  assert.match(k, /옛 대기 줄/);
  setLanguage('en');
  assert.match(deliveryText({ status: 'cancelled', reason: 'loop_dropped' }), /old held queue/);
  setLanguage('ko');
});
