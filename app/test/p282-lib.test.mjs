// P282: 판 업데이트 뒤 원격 웹 화면 다시 불러오기(lib/shell-reload.js)와 키보드 열림 판단(lib/phone.js kbOpenOf)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { shellReloadPlan, reloadReady, packDraft, takeDraft, validMark, DRAFT_TTL_MS } from '../src/renderer/lib/shell-reload.js';
import { kbOpenOf, screenBox } from '../src/renderer/lib/phone.js';

const A = 'a'.repeat(16), B = 'b1'.repeat(8);

test('표식이 다르면 다시 불러오고, 같으면 하지 않는다', () => {
  assert.equal(shellReloadPlan({ mine: A, server: B, tried: null }), 'reload');
  assert.equal(shellReloadPlan({ mine: A, server: A, tried: null }), 'none');
});
test('같은 표식으로는 한 번만(다시 불러와도 옛 코드면 그만)', () => {
  assert.equal(shellReloadPlan({ mine: A, server: B, tried: B }), 'none');
  assert.equal(shellReloadPlan({ mine: A, server: 'c'.repeat(16), tried: B }), 'reload'); // 그 뒤 또 새 판이면 한 번 더
});
test('표식이 없거나 깨졌으면 아무것도 하지 않는다(옛 판, 빌드 없음)', () => {
  for (const [mine, server] of [[null, B], [A, null], [A, undefined], ['__ATRIUM_SHELL__', B], [A, '<script>'], [A, 42]]) assert.equal(shellReloadPlan({ mine, server, tried: null }), 'none', String([mine, server]));
  assert.equal(validMark(A), true); assert.equal(validMark('zz'), false);
});
test('쓰는 중이면 기다리고, 글이 비었거나 화면이 숨으면 곧바로', () => {
  assert.equal(reloadReady({ hidden: false, typing: true }), false);
  assert.equal(reloadReady({ hidden: false, typing: false }), true);
  assert.equal(reloadReady({ hidden: true, typing: true }), true);
});
test('보내지 않은 글 되살리기: 같은 세션만, 빈 글·오래된 글·깨진 값은 없음', () => {
  const now = 1_000_000;
  const v = packDraft('s1', '아직 안 보낸 글\n둘째 줄', now);
  assert.equal(takeDraft(v, 's1', now + 5000), '아직 안 보낸 글\n둘째 줄');
  assert.equal(takeDraft(v, 's2', now + 5000), null);
  assert.equal(takeDraft(v, 's1', now + DRAFT_TTL_MS + 1), null);
  assert.equal(packDraft('s1', '   ', now), null);
  assert.equal(packDraft(null, 'x', now), null);
  assert.equal(takeDraft('{oops', 's1', now), null);
  assert.equal(takeDraft(null, 's1', now), null);
});
test('키보드 열림: iOS 홈 화면 앱처럼 창 높이도 함께 줄어도 열림으로 본다', () => {
  // 보통 브라우저: 창 높이는 그대로, 보이는 높이만 준다
  assert.equal(kbOpenOf({ vvHeight: 470, innerHeight: 844, tallest: 844 }), true);
  // iOS 홈 화면 앱: 창 높이도 470으로 준다(옛 판단은 닫힘으로 보아 아래 홈 막대 여백이 남았다)
  assert.equal(kbOpenOf({ vvHeight: 470, innerHeight: 470, tallest: 0 }), false); // 기준이 없으면 옛 판단과 같다
  assert.equal(kbOpenOf({ vvHeight: 470, innerHeight: 470, tallest: 844 }), true);
  // 닫힘, 작은 흔들림(24px)은 닫힘
  assert.equal(kbOpenOf({ vvHeight: 844, innerHeight: 844, tallest: 844 }), false);
  assert.equal(kbOpenOf({ vvHeight: 820, innerHeight: 820, tallest: 844 }), false);
  assert.equal(kbOpenOf({ vvHeight: 0, innerHeight: 844, tallest: 844 }), false);
});
test('키보드 열림에서 홈 화면 앱 높이 바로잡기(P83)는 보이는 높이 그대로', () => {
  const b = screenBox({ vv: { height: 470, offsetTop: 0 }, innerHeight: 470, innerWidth: 390, screenW: 390, screenH: 844, standalone: true });
  assert.deepEqual(b, { height: 470, top: 0 });
});
test('키보드 열림이면 입력 줄 아래 여백이 없다(phone.css)', () => {
  const css = fs.readFileSync(new URL('../src/renderer/phone.css', import.meta.url), 'utf8');
  assert.match(css, /html\.mt-kb-open \.mt-ph-input \{ padding-bottom: 8px; \}/);
  assert.match(css, /\.mt-ph-input \{[^}]*padding: 6px calc\(env\(safe-area-inset-right\) \+ 10px\) calc\(env\(safe-area-inset-bottom\) \+ 8px\)/); // 닫히면 홈 막대 여백
  assert.match(css, /\.mt-ph-topfill \{[^}]*height: env\(safe-area-inset-top, 0px\);[^}]*background: var\(--chrome-bg\)/);
});
test('index.html theme-color = 머리줄 색(--chrome-bg)', () => {
  const html = fs.readFileSync(new URL('../src/renderer/index.html', import.meta.url), 'utf8');
  const tok = fs.readFileSync(new URL('../src/renderer/tokens.css', import.meta.url), 'utf8');
  const chrome = /--chrome-bg:\s*(#[0-9a-fA-F]{6})/.exec(tok)[1];
  assert.match(html, new RegExp(`<meta name="theme-color" content="${chrome}">`));
});
