// P355: 휴대폰 세션 화면(MobileSession.jsx)의 키 줄·보기 기억·터미널 늦게 읽기, 페이지 높이(pageBox), 배치 값 기록(layoutLine)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { KEY_MAIN, KEY_MORE, MOBILE_KEYS, KEY_GLYPH, KEY_WIDE, keyId, isNumKey, viewOf, readView, readFlag, VIEW_KEY, KEYS_OPEN_KEY, pageBox, isLive } from '../src/renderer/lib/mobile.js';
import { KEY_NAMES } from '../../backend/src/keys.mjs';
import { keysToBytes } from '../../backend/src/hc/model.mjs';
import { layoutLine, LAY_FIELDS, TELE_KINDS } from '../src/renderer/lib/phone-telemetry.js';
import { TELE_KINDS as BACK_KINDS } from '../../backend/src/phone-errors.mjs';
import { swRoute } from '../src/renderer/lib/sw-rules.js';
import en from '../src/renderer/locales/en.js';
import ko from '../src/renderer/locales/ko.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = (f) => fs.readFileSync(path.join(ROOT, 'src', 'renderer', f), 'utf8');

test('키 줄: 사용자가 말한 키가 모두 있고(Esc Enter ⌫ Tab ⇧Tab Ctrl+C ← ↑ ↓ → 1 2 3 4 y n Space /), 모두 session.keys 허용 키', () => {
  for (const k of ['esc', 'enter', 'backspace', 'tab', 'shift+tab', 'ctrl+c', 'left', 'up', 'down', 'right', '1', '2', '3', '4', 'y', 'n', 'space', 'slash']) assert.ok(MOBILE_KEYS.includes(k), k);
  assert.equal(new Set(MOBILE_KEYS).size, MOBILE_KEYS.length, '겹치지 않는다');
  for (const k of MOBILE_KEYS) assert.ok(KEY_NAMES.includes(k), k);
  assert.ok(keysToBytes(MOBILE_KEYS), '모든 키에 패널 바이트가 있다');
  assert.deepEqual(KEY_MAIN, ['esc', 'enter', 'up', 'down', '1', '2', '3'], '늘 보이는 줄은 P353 빠른 키 자리 그대로');
});

test('키 줄 배치: 8칸 격자에 늘 한 줄(펼침 + 7), 펼치면 꼭 두 줄(넓은 키 포함, 글자 크기 둘)', () => {
  const span = (k) => KEY_WIDE[k] || 1;
  assert.equal(1 + KEY_MAIN.reduce((n, k) => n + span(k), 0), 8);
  assert.equal(KEY_MORE.reduce((n, k) => n + span(k), 0) + 2, 16);
  // 칸 폭: 393px 화면에서 양옆 10px, 칸 사이 4px → 40px 이상
  assert.ok((393 - 10 - 7 * 4) / 8 >= 40); assert.ok((390 - 10 - 7 * 4) / 8 >= 40);
  for (const k of MOBILE_KEYS) assert.ok(KEY_GLYPH[k] || /^[0-9yn]$/.test(k), k);
  assert.ok(isNumKey('4') && !isNumKey('y'));
});

test('키 이름의 사전 열쇠(+ → _), 두 사전에 다 있다', () => {
  assert.equal(keyId('ctrl+c'), 'ctrl_c'); assert.equal(keyId('shift+tab'), 'shift_tab');
  for (const k of MOBILE_KEYS) assert.ok(en.mobile['key_' + keyId(k)] && ko.mobile['key_' + keyId(k)], k);
  for (const k of ['viewAnswer', 'viewTerm', 'typeDirect', 'typeDirectOff', 'termLoading', 'termFailed', 'askHide', 'keysMore', 'keysLess']) assert.ok(en.mobile[k] && ko.mobile[k], k);
});

test('보기 기억: 마지막에 고른 쪽(이 기기). 터미널은 살아 있는 세션만', () => {
  const mem = new Map();
  const st = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)) };
  assert.equal(readView(st), 'answer', '처음은 답');
  st.setItem(VIEW_KEY, 'term');
  assert.equal(readView(st), 'term');
  st.setItem(VIEW_KEY, 'weird');
  assert.equal(readView(st), 'answer');
  assert.equal(readView({ getItem: () => { throw new Error('denied'); } }), 'answer');
  assert.equal(viewOf('term', { state: 'working' }), 'term');
  assert.equal(viewOf('term', { state: 'waiting' }), 'term');
  assert.equal(viewOf('term', { state: 'sleeping' }), 'answer');
  assert.equal(viewOf('term', { state: 'exited' }), 'answer');
  assert.equal(viewOf('answer', { state: 'working' }), 'answer');
  assert.ok(isLive({ state: 'ready' }) && !isLive(null));
  assert.equal(readFlag(st, KEYS_OPEN_KEY), false); st.setItem(KEYS_OPEN_KEY, '1'); assert.equal(readFlag(st, KEYS_OPEN_KEY), true);
});

test('터미널 붙이고 떼기: xterm·TerminalView는 mterm 묶음에만, 세션 화면은 글 주소로 늦게 읽고 터미널 보기일 때만 그린다', () => {
  const ms = src('MobileSession.jsx');
  assert.doesNotMatch(ms, /from '\.\/(TerminalView\.jsx|mterm\.jsx)'/);
  assert.match(ms, /new URL\('mterm\.js', import\.meta\.url\)/);
  assert.match(ms, /view === 'term' \? \(\s*<div className="mt-ms-termarea"/, '터미널 칸은 터미널 보기일 때만(답 보기로 바꾸면 내려가 떼고 버린다)');
  const mt = src('mterm.jsx');
  assert.match(mt, /<TerminalView [^>]*webgl=\{false\}[^>]*touchSelect/);
  assert.match(mt, /terminal\.focus/);
  assert.match(mt, /touchWheelDelta/);
  const tv = src('TerminalView.jsx');
  assert.doesNotMatch(tv, /@xyflow/, 'TerminalView는 xyflow를 읽지 않는다(판 배율은 term-flow.js)');
  assert.match(tv, /'terminal\.detach'/, '내려가면 뗀다');
  assert.match(tv, /term\.dispose\(\)/, '내려가면 버린다');
  assert.match(src('main.jsx'), /<FlowBridge>/, '판 화면은 xyflow 스토어를 넘긴다');
  const build = fs.readFileSync(path.join(ROOT, 'scripts', 'build.mjs'), 'utf8');
  assert.match(build, /mterm: path\.join\(ROOT, 'src', 'renderer', 'mterm\.jsx'\)/);
  for (const p of ['/mterm.js', '/mterm.css']) assert.equal(swRoute({ url: 'http://x' + p, origin: 'http://x' }), 'shell', p);
});

test('남은 부하: 휴대폰 페이지가 붙을 때 판 store.js가 merger.status·plan.list를 부르지 않는다', () => {
  const st = src('store.js');
  assert.match(st, /api\.on\('\$open', \(r\) => \{ if \(r && r\.phone\) return; loadMerger\(0\); \}\)/);
  assert.match(st, /api\.on\('\$open', \(r\) => \{ if \(r && r\.phone\) return; loadPlans\(\); \}\)/);
});

test('페이지 높이: 보이는 높이(분수)는 내리고, 창 높이를 넘지 않는다. 홈 화면 앱의 짧은 창은 화면 높이(P83)', () => {
  assert.deepEqual(pageBox({ vv: { height: 792.67, offsetTop: 0 }, innerHeight: 793, innerWidth: 393, screenW: 393, screenH: 852 }), { height: 792, top: 0 });
  assert.deepEqual(pageBox({ vv: { height: 800.4, offsetTop: 0 }, innerHeight: 793, innerWidth: 393, screenW: 393, screenH: 852 }), { height: 793, top: 0 });
  assert.deepEqual(pageBox({ vv: null, innerHeight: 844.5 }), { height: 844, top: 0 });
  assert.deepEqual(pageBox({ vv: { height: 420.5, offsetTop: 12 }, innerHeight: 793, innerWidth: 393, screenW: 393, screenH: 852 }), { height: 420, top: 12 }, '키보드');
  const tall = pageBox({ vv: { height: 793, offsetTop: 0 }, innerHeight: 793, innerWidth: 393, screenW: 393, screenH: 852, standalone: true });
  assert.equal(tall.height, 852); assert.equal(tall.tall, 59);
});

test('배치 값 기록 모양: 숫자는 소수 한 자리, 아는 칸만, 판이 받는 종류', () => {
  assert.ok(TELE_KINDS.includes('lay') && BACK_KINDS.includes('lay'));
  const l = layoutLine({ iw: 393, ih: 793, vh: 792.6667, vt: 0, sw: 393, sh: 852, st: 59, sr: 0, sb: 34, sl: 0, rb: 793, tb: 792.99, ch: 793, sd: false, kb: false, on: 'tabs', secret: 'x', extra: 5 }, 7);
  assert.equal(l.k, 'lay'); assert.equal(l.at, 7);
  assert.equal(l.lay.vh, 792.7); assert.equal(l.lay.tb, 793); assert.equal(l.lay.on, 'tabs'); assert.equal(l.lay.sd, false);
  assert.ok(!('secret' in l.lay) && !('extra' in l.lay));
  for (const k of Object.keys(l.lay)) assert.ok([...LAY_FIELDS, 'sd', 'kb', 'on'].includes(k), k);
  assert.deepEqual(layoutLine({ iw: NaN, on: 'x' }, 1).lay, {});
});
