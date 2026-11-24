// P358: 휴대폰 세션 화면은 터미널만, 오른쪽 아래 작은 단추(응답 필요/할 일), 겹친 카드 크기 상한·넘기기, 홈 화면 앱 아래 잘림(pageBox),
// 배치 값 화면별 기록, 붙기 전 입력 모으기
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { overlayButton, overlayPages, clampPage, OVERLAY_MAX_FRAC, overlayMaxPx, OVERLAY_CHOICE_CHARS, pageBox, layScreen, LAY_SCREENS, shortChoice } from '../src/renderer/lib/mobile.js';
import { layoutLine, LAY_FIELDS, LAY_SCREENS as TELE_SCREENS } from '../src/renderer/lib/phone-telemetry.js';
import { teleInfo, layOf, layLabel, errorSummary, formatErrors, LAY_SCREENS as BACK_SCREENS } from '../../backend/src/phone-errors.mjs';
import { earlyInput, EARLY_MAX } from '../src/renderer/lib/term-early.js';
import en from '../src/renderer/locales/en.js';
import ko from '../src/renderer/locales/ko.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = (f) => fs.readFileSync(path.join(ROOT, 'src', 'renderer', f), 'utf8');

test('세션 화면은 터미널만: 보기 고르기·답 보기가 없고, 터미널 묶음은 세션 화면을 열 때 늦게 읽는다', () => {
  const ms = src('MobileSession.jsx');
  for (const gone of ['mp-viewpick', 'mp-view-answer', 'mp-view-term', 'data-sview', 'mp-answer', 'mp-history', 'mp-tail', 'VIEW_KEY', 'viewOf']) assert.ok(!ms.includes(gone), gone);
  assert.match(ms, /\{live && <TermPane /, '살아 있는 세션이면 바로 터미널');
  assert.match(ms, /new URL\('mterm\.js', import\.meta\.url\)/, '글 주소 import(첫 열기 묶음에 넣지 않는다)');
  assert.doesNotMatch(src('mobile.jsx'), /mterm/, '첫 열기 묶음에는 mterm이 없다');
  assert.match(ms, /data-action="mp-type-direct"/, '바로 치기는 머리줄 단추(한 번 누르기)');
  assert.match(ms, /brief: true/, '세션 화면의 갱신은 짧게(화면을 읽지 않는다)');
  assert.doesNotMatch(src('mobile.css'), /data-sview|\.mt-ms-seg\b|\.mt-ms-askpill|\.mt-ms-todopill/, '옛 보기 고르기·알약 규칙이 남지 않는다');
});

test('오른쪽 아래 작은 단추: 요청이 있으면 노란 응답 필요, 할 일만이면 할 일 n, 없으면 없음', () => {
  assert.deepEqual(overlayButton({ need: true, todos: 0 }), { kind: 'need', n: 1 });
  assert.deepEqual(overlayButton({ need: true, todos: 2 }), { kind: 'need', n: 3 });
  assert.deepEqual(overlayButton({ need: false, todos: 2 }), { kind: 'todo', n: 2 });
  assert.equal(overlayButton({ need: false, todos: 0 }), null);
  assert.equal(overlayButton(), null);
  const ms = src('MobileSession.jsx');
  assert.match(ms, /useState\(false\); \/\/ P358: 겹친 카드는 기본으로 접는다/);
  const css = src('mobile.css');
  assert.match(css, /\.mt-ms-overbtn\.need \{ background: var\(--attn\)/, '응답 필요는 노랑');
  assert.match(css, /\.mt-ms-overbtn\.todo \{ background: var\(--todo-sky\)/, '할 일은 지금 색');
  assert.match(css, /\.mt-ms-overbtn \{ position: absolute;[^}]*bottom: 8px; right:/, '오른쪽 아래');
  assert.match(src('MobileSession.jsx'), /<KeyBar need=\{need\}/, '권한 질문이면 숫자 키가 노랗다(그대로)');
});

test('겹친 카드: 요청 먼저, 그 뒤 할 일. 넘기기 쪽 번호는 쪽 수 안', () => {
  const p = overlayPages({ need: true, todos: [{ id: 4 }, { id: 9 }] });
  assert.deepEqual(p.map((x) => x.key), ['ask', 'todo-4', 'todo-9']);
  assert.deepEqual(overlayPages({ need: false, todos: [] }), []);
  assert.equal(clampPage(5, 3), 2); assert.equal(clampPage(-1, 3), 0); assert.equal(clampPage(2, 0), 0);
  const ms = src('MobileSession.jsx');
  assert.match(ms, /data-role="mp-over-pager"/); assert.match(ms, /\{page \+ 1\}\/\{pages\.length\}/);
});

test('겹친 카드 크기 상한: 터미널 칸의 절반, 넘으면 카드 안 스크롤, 작은 글(질문 14px, 단추 13px), 보기 글은 짧게', () => {
  assert.equal(OVERLAY_MAX_FRAC, 0.5);
  assert.equal(overlayMaxPx(600), 300); assert.equal(overlayMaxPx(100), 120);
  const css = src('mobile.css');
  assert.match(css, /\.mt-ms-over \{[^}]*max-height: 50%;/);
  assert.match(css, /\.mt-ms-overbody \{[^}]*overflow-y: auto;/);
  assert.match(css, /\.mt-ms-over \.mt-mp-q \{[^}]*font-size: 0\.875rem;/, '질문 14px(16px × 글자 크기 배율)');
  assert.match(css, /\.mt-ms-over \.mt-mp-btn \{[^}]*min-height: 32px;[^}]*font-size: 0\.8125rem;/, '단추 13px');
  assert.match(css, /html\.mt-mp-on \{ font-size: calc\(16px \* var\(--mp-fs, 1\)\); \}/, 'rem은 글자 크기 설정(A−/A+)을 따른다');
  assert.ok(shortChoice('범위를 고친 뒤 진행하고 결과를 보고', OVERLAY_CHOICE_CHARS).length <= OVERLAY_CHOICE_CHARS);
  assert.match(src('MobileApp.jsx'), /compact \? shortChoice\(o, OVERLAY_CHOICE_CHARS\) : o/);
});

test('홈 화면 앱 아래 잘림: 키보드가 닫혀 있으면 창·보이는 높이·위치가 어떻게 오든 화면 높이', () => {
  const base = { innerWidth: 393, screenW: 393, screenH: 852, standalone: true };
  // 실기기 홈 탭: 창 852, 보이는 852(문서 793은 따르지 않는다)
  assert.equal(pageBox({ ...base, vv: { height: 852, offsetTop: 0 }, innerHeight: 852 }).height, 852);
  // 창이 상태 표시줄만큼 짧다(P83)
  assert.equal(pageBox({ ...base, vv: { height: 793, offsetTop: 0 }, innerHeight: 793 }).height, 852);
  // 창은 852인데 보이는 높이만 793
  assert.deepEqual(pageBox({ ...base, vv: { height: 793, offsetTop: 0 }, innerHeight: 852 }), { height: 852, top: 0, tall: 59, full: true });
  // 키보드를 닫은 뒤 보이는 위치가 0이 아닌 채 남음(P355 규칙은 이때 793에 머물렀다): 화면 높이로, 남은 위치만큼 내려 그린다
  assert.deepEqual(pageBox({ ...base, vv: { height: 793, offsetTop: 59 }, innerHeight: 793, tallest: 852 }), { height: 852, top: 59, tall: 59, full: true });
  // 키보드가 열리면 보이는 높이와 위치
  assert.deepEqual(pageBox({ ...base, vv: { height: 420.6, offsetTop: 10 }, innerHeight: 793, tallest: 852 }), { height: 420, top: 10, kb: true });
  // iOS 홈 화면 앱은 키보드가 열리면 창 높이도 함께 준다(P282)
  assert.equal(pageBox({ ...base, vv: { height: 460, offsetTop: 0 }, innerHeight: 460, tallest: 852 }).kb, true);
  // 브라우저 탭은 P355 그대로(보이는 높이 내림, 창 높이 안)
  assert.deepEqual(pageBox({ vv: { height: 792.67, offsetTop: 0 }, innerHeight: 793, innerWidth: 393, screenW: 393, screenH: 852 }), { height: 792, top: 0 });
  // 화면과 너무 다르면(가로, 다른 기기) 화면 높이로 늘리지 않는다
  assert.ok(!pageBox({ ...base, vv: { height: 600, offsetTop: 0 }, innerHeight: 600, tallest: 600 }).full);
  const ma = src('MobileApp.jsx');
  assert.match(ma, /--mt-page-h/, 'html·body·#root를 페이지 높이로');
  assert.match(ma, /document\.addEventListener\('focusout', later\)/, '키보드를 닫은 뒤 다시 잰다');
  assert.match(ma, /if \(b\.full && b\.top > 0\) \{ try \{ window\.scrollTo\(0, 0\); \} catch \{\} \}/, '남은 스크롤을 되돌린다');
  assert.match(src('mobile.css'), /html\.mt-mp-on, html\.mt-mp-on body, html\.mt-mp-on #root \{ height: var\(--mt-page-h, 100%\); \}/);
});

test('배치 값 화면별 기록: 홈·세션 목록·맵·세션 화면·키보드 열림마다 한 번, 판이 화면별로 보인다', () => {
  assert.deepEqual(LAY_SCREENS, TELE_SCREENS); assert.deepEqual(LAY_SCREENS, BACK_SCREENS);
  assert.equal(layScreen({ view: 'session' }), 'session'); assert.equal(layScreen({ view: 'home', kb: true }), 'kb'); assert.equal(layScreen({ view: 'x' }), null);
  for (const f of ['ph', 'hh', 'bh']) assert.ok(LAY_FIELDS.includes(f), f);
  const l = layoutLine({ iw: 393, ih: 852, ch: 793, vh: 852, sw: 393, sh: 852, rb: 852, ph: 852, hh: 852, bh: 852, tl: true, sc: 'session', on: 'input' }, 1).lay;
  assert.equal(l.sc, 'session'); assert.equal(l.tl, true); assert.equal(l.ph, 852);
  assert.equal(layoutLine({ sc: 'weird' }, 1).lay.sc, undefined);
  const back = layOf(l);
  assert.equal(back.sc, 'session'); assert.equal(back.hh, 852); assert.equal(back.tl, true);
  assert.match(layLabel(back), /높이 뿌리 852 · html 852 · body 852 \(화면 높이로 늘림\)/);
  const s = errorSummary([
    { event: 'tele', at: 1, deviceName: 'iphone', tele: teleInfo({ k: 'lay', at: 1, lay: { ...back, sc: 'home', rb: 852 } }) },
    { event: 'tele', at: 2, deviceName: 'iphone', tele: teleInfo({ k: 'lay', at: 2, lay: back }) },
  ]);
  assert.equal(s.layout.iphone.lay.sc, 'session', '기기마다 마지막(그대로)');
  assert.deepEqual(Object.keys(s.layoutBy.iphone).sort(), ['home', 'session']);
  const text = formatErrors(s);
  assert.match(text, /배치\(iphone, 홈,/); assert.match(text, /배치\(iphone, 세션 화면,/);
  const tel = src('lib/phone-telemetry.js');
  assert.match(tel, /rt\.layoutNoted\.has\(key\)/, '화면마다 한 번');
  const ma = src('MobileApp.jsx');
  assert.match(ma, /noteLayout\(layScreen\(\{ view: layView \}\)\)/); assert.match(ma, /noteLayout\('kb'\)/);
});

test('붙기 전 입력: 모았다가 붙은 뒤 한 번에 보낸다(넘치면 받지 않는다), 휴대폰 페이지만', () => {
  const q = earlyInput(10);
  assert.equal(q.push('ab'), true); assert.equal(q.push(''), false); assert.equal(q.push('cdefghij'), true); assert.equal(q.push('k'), false);
  assert.equal(q.size, 10); assert.equal(q.take(), 'abcdefghij'); assert.equal(q.take(), ''); assert.equal(q.size, 0);
  assert.equal(EARLY_MAX, 4096);
  const tv = src('TerminalView.jsx');
  assert.match(tv, /if \(infoRef\.current && !st\.ready\) \{ st\.early\.push\(data\);/, '붙기 전이면 모은다(판 화면은 그대로)');
  assert.match(tv, /st\.ready = true;\s*\{ const early = st\.early\.take\(\); if \(early\)/, '붙으면 보낸다');
  assert.match(tv, /'mobileOver\.termConnecting'/);
});

test('두 사전: 새 말이 다 있고 옛 보기 고르기 말은 없다', () => {
  for (const k of ['need', 'todo', 'prev', 'next', 'termConnecting']) assert.ok(en.mobileOver[k] && ko.mobileOver[k], k);
  for (const k of ['viewLabel', 'viewAnswer', 'viewTerm']) assert.ok(!(k in en.mobile) && !(k in ko.mobile), k);
});
