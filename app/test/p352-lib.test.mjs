// P352 단위 시험: 가짜 충돌 판정(bootDecide: 가려진 채 죽음은 가벼운 보기를 잇지 않음, 빠른 죽음만 가볍게, 끝남, why),
// 휴대폰 이상 동작 기록(lib/phone-telemetry.js: 묶기, 줄·부팅 상한, 같은 것 횟수로 묶기, 내용 지우기, 상황 기록 조건)
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCrumbs, bootDecide, crumbAlive, crumbLeave, LITE_FAST_MS, LITE_MAX_MS, BOOT_WHY } from '../src/renderer/lib/crumbs.js';
import { TeleBuffer, scrub, srcOf, fitLine, TELE_LINE_MAX, TELE_BOOT_MAX, TELE_BATCH_MAX, SNAP_GAP_MS, SNAP_BOOT_MAX, API_REPEAT, WS_LOOP, TELE_BYTES_EVERY_MS } from '../src/renderer/lib/phone-telemetry.js';

const json = (s) => parseCrumbs(JSON.stringify(s));
const boot = (s, t) => bootDecide(s, t, { touch: true, phone: true });
// 휴대폰 페이지가 up ms 살다가 죽음(hidden이면 가려진 채)
const die = (state, t, up, { hidden = false, view = 'map' } = {}) => json(crumbAlive(state, { view, hidden }, t + up));

test('가려진 채 죽음은 가벼운 보기를 잇지 않는다(옛 규칙은 한 번 걸리면 풀리지 않았다)', () => {
  let t = 1e7;
  let d = boot(null, t); assert.equal(d.why, 'first');
  d = boot(die(d.state, t, 1500), t += 4000);
  assert.equal(d.lite, true); assert.equal(d.why, 'fast');
  // 가볍게 연 페이지가 몇 시간 뒤 뒤에서 내려감(iOS 정리) → 보통
  d = boot(die(d.state, t, 3 * 3600e3, { hidden: true }), t += 5 * 3600e3);
  assert.equal(d.hidden, true); assert.equal(d.lite, false); assert.equal(d.why, 'hidden');
  assert.equal(d.state.lite, false); assert.equal(d.state.liteSince, undefined);
  // 가려진 채 죽음이 이어져도 보통
  d = boot(die(d.state, t, 1000, { hidden: true }), t += 3600e3);
  assert.equal(d.lite, false); assert.equal(d.why, 'hidden');
});

test('빠른 죽음만 가볍게: 오래 산 뒤 죽음은 slow, 정상 떠남은 clean, 휴대폰 아닌 화면은 board', () => {
  let t = 2e7;
  let d = boot(null, t);
  d = boot(die(d.state, t, LITE_FAST_MS + 5000), t += 60_000);
  assert.equal(d.crashed, true); assert.equal(d.lite, false); assert.equal(d.why, 'slow');
  d = boot(json(crumbLeave(d.state, t + 3000)), t += 9000);
  assert.equal(d.crashed, false); assert.equal(d.why, 'clean');
  const tab = bootDecide(die(bootDecide(null, t, { touch: true }).state, t, 2000, { view: 'board' }), t + 5000, { touch: true });
  assert.equal(tab.why, 'board'); assert.equal(tab.lite, false);
  assert.equal(bootDecide(null, t, { touch: false }).why, 'pc');
  for (const w of ['first', 'clean', 'hidden', 'slow', 'fast', 'repeat', 'expired', 'board', 'pc']) assert.ok(BOOT_WHY.includes(w));
});

test('가볍게 연 페이지도 빠르게 죽으면 이어 가되(repeat), LITE_MAX_MS가 지나면 한 번 보통으로(expired)', () => {
  let t = 3e7;
  let d = boot(null, t);
  d = boot(die(d.state, t, 2000), t += 5000);
  assert.equal(d.why, 'fast'); const since = d.state.liteSince; assert.equal(since, t);
  d = boot(die(d.state, t, 2000), t += 5000);
  assert.equal(d.lite, true); assert.equal(d.why, 'repeat'); assert.equal(d.state.liteSince, since, '처음 가볍게 연 때를 잇는다');
  // 가볍게 연 페이지가 계속 빠르게 죽음(5초마다) → LITE_MAX_MS가 지나면 한 번 보통
  while (t - since < LITE_MAX_MS) { d = boot(die(d.state, t, 2000), t += 5000); if (t - since < LITE_MAX_MS) assert.equal(d.why, 'repeat'); }
  assert.equal(d.lite, false); assert.equal(d.why, 'expired');
  // 보통으로 연 페이지가 또 빠르게 죽으면 다시 가볍게(새로 센다)
  d = boot(die(d.state, t, 2000), t += 5000);
  assert.equal(d.lite, true); assert.equal(d.why, 'fast'); assert.equal(d.state.liteSince, t);
  // 가볍게 연 페이지가 살아남음 → 보통
  d = boot(json(crumbLeave(d.state, t + 60_000)), t += 70_000);
  assert.equal(d.lite, false); assert.equal(d.why, 'clean');
});

test('가벼운 화면 표시(light)도 휴대폰 페이지가 가려진 채 죽으면 푼다', () => {
  const t = 4e7;
  const s = json({ v: 1, cur: { boot: t - 9e6, alive: t - 8e6, clean: false, light: true, mode: 'light', hidden: true, phone: true }, crashes: [], light: true, retry: null, level: 2, ok: false, by: 'touch', lite: true });
  const d = boot(s, t);
  assert.equal(d.light, false); assert.equal(d.lite, false); assert.equal(d.why, 'hidden');
});

test('scrub: 주소·경로·토큰·긴 따옴표 글·숫자 덩어리를 지우고 자른다', () => {
  const s = scrub('Failed to fetch https://host.example/api?token=abc at C:\\Users\\me\\x.js and /home/me/a.txt "this is a fairly long quoted user text here" eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9 1234567');
  assert.ok(!/https|token|Users|home|quoted|eyJ|1234567/.test(s), s);
  assert.match(s, /<url>/); assert.match(s, /<path>/); assert.match(s, /<id>/); assert.match(s, /<n>/);
  assert.equal(scrub("Cannot read properties of undefined (reading 'name')"), "Cannot read properties of undefined (reading 'name')");
  assert.ok(scrub('x'.repeat(10) + ' ' + 'word '.repeat(80)).length <= 160);
  assert.equal(srcOf('https://h.ts.net/assets/index-abc.js?v=1', 12, 34), 'index-abc.js:12:34');
  assert.equal(srcOf('', null, null), null);
});

test('TeleBuffer: 같은 것은 횟수로 묶고, 받은 크기는 메서드별 합, 한 번에 TELE_BATCH_MAX줄', () => {
  let now = 1000;
  const b = new TeleBuffer({ now: () => now });
  for (let i = 0; i < 5; i++) b.note('err', { msg: 'boom', src: 'a.js:1:2' });
  b.note('err', { msg: 'other' });
  b.addBytes('board.get', 70000); b.addBytes('board.get', 1000); b.addBytes('events.subscribe', 160000);
  const lines = b.drain({ force: true });
  const boom = lines.find((l) => l.msg === 'boom');
  assert.equal(boom.n, 5); assert.equal(lines.filter((l) => l.k === 'err').length, 2);
  const bytes = lines.find((l) => l.k === 'bytes');
  assert.deepEqual(bytes.bytes, { 'events.subscribe': 160000, 'board.get': 71000 });
  assert.deepEqual(b.drain(), [], '새 것이 없으면 빈 묶음');
  b.addBytes('x', 5); assert.deepEqual(b.drain(), [], '받은 크기 줄은 TELE_BYTES_EVERY_MS에 한 번');
  now += TELE_BYTES_EVERY_MS; assert.equal(b.drain()[0].k, 'bytes');
  for (let i = 0; i < 70; i++) b.note('api', { m: `m${i}`, code: 'x' });
  const first = b.drain(); assert.equal(first.length, TELE_BATCH_MAX);
  assert.equal(b.drain().length, 30, '남은 것은 다음 묶음');
});

test('TeleBuffer: 부팅마다 TELE_BOOT_MAX줄, 넘치면 cap 줄 하나. 못 보낸 줄은 되돌린다', () => {
  let now = 0;
  const b = new TeleBuffer({ now: () => now });
  let total = 0, cap = null;
  for (let r = 0; r < 10; r++) {
    for (let i = 0; i < 40; i++) b.note('api', { m: `r${r}m${i}`, code: 'x' });
    for (const l of b.drain()) { total++; if (l.k === 'cap') cap = l; }
  }
  assert.equal(total, TELE_BOOT_MAX); assert.ok(cap && cap.n > 0, 'cap 줄');
  const c = new TeleBuffer({ now: () => now });
  c.note('err', { msg: 'a' });
  const l = c.drain(); c.requeue(l);
  assert.deepEqual(c.drain(), l);
});

test('fitLine: 줄 하나 TELE_LINE_MAX 바이트 안으로(큰 것부터 버림)', () => {
  const big = { k: 'snap', why: 'send', steps: Array.from({ length: 8 }, (_, i) => ({ s: 'msg', t: i, k: 'x'.repeat(30) })), errs: ['e'.repeat(100), 'f'.repeat(100), 'g'.repeat(100), 'h'.repeat(100), 'i'.repeat(100)], bytes: Object.fromEntries(Array.from({ length: 16 }, (_, i) => [`method.name.${i}`, 1e6 + i])), prev: { view: 'map', steps: Array.from({ length: 14 }, (_, i) => ({ s: 'msg', t: i, k: 'y'.repeat(30), b: 1e5 })) } };
  const f = fitLine(big);
  assert.ok(JSON.stringify(f).length <= TELE_LINE_MAX); assert.equal(f.why, 'send');
  assert.equal(fitLine({ k: 'err', msg: 'x'.repeat(5000) }, 200).msg.length, 60);
});

test('상황 기록: 같은 API 반복 실패, 다시 연결 고리, 오래 끊김 판단과 SNAP_GAP_MS·SNAP_BOOT_MAX', () => {
  let now = 0;
  const b = new TeleBuffer({ now: () => now });
  let hit = false;
  for (let i = 0; i < API_REPEAT; i++) { hit = b.apiFail('board.get', 'timeout', 50); now += 1000; }
  assert.equal(hit, true);
  assert.equal(b.apiFail('ping', 'disconnected', 0), false, '끊김은 고리가 맡는다');
  assert.equal(b.apiFail('web.telemetry', 'x', 0), false, '자기 보내기는 세지 않는다');
  let loop = null;
  for (let i = 0; i < WS_LOOP; i++) { loop = b.wsClose(1006); now += 1000; }
  assert.equal(loop, 'loop');
  now += 60_000; assert.ok(b.wsOpen() >= 60_000); assert.equal(b.wsOpen(), null);
  assert.ok(b.snap('api', { view: 'map' })); assert.equal(b.snap('send'), null, 'SNAP_GAP_MS 안에 한 번');
  for (let i = 1; i < SNAP_BOOT_MAX + 3; i++) { now += SNAP_GAP_MS; b.snap('send'); }
  const snaps = b.drain().filter((l) => l.k === 'snap');
  assert.equal(snaps.length, SNAP_BOOT_MAX);
  assert.ok(snaps[0].errs.length > 0, '최근 오류 열쇠를 함께');
  assert.ok(!JSON.stringify(snaps).includes('undefined'));
});
