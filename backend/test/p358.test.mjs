// P358: 휴대폰 배치 값 화면별 기록(layOf의 새 칸, errorSummary.layoutBy, atrium remote errors 표의 화면별 줄)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { teleInfo, errorSummary, formatErrors, layLabel, layOf, LAY_SCREENS } from '../src/phone-errors.mjs';

const LAY = { iw: 393, ih: 852, ch: 793, vh: 852, vt: 0, sw: 393, sh: 852, st: 59, sr: 0, sb: 34, sl: 0, rb: 852, tb: 852, ph: 852, hh: 852, bh: 852, sd: true, kb: false, tl: true, on: 'input' };

test('layOf: 화면 이름(sc)과 뿌리·html·body 높이, 화면 높이로 늘렸나(tl)만 받는다', () => {
  assert.deepEqual(LAY_SCREENS, ['home', 'sessions', 'map', 'session', 'kb']);
  const x = layOf({ ...LAY, sc: 'session', junk: 1 });
  assert.equal(x.sc, 'session'); assert.equal(x.hh, 852); assert.equal(x.bh, 852); assert.equal(x.ph, 852); assert.equal(x.tl, true);
  assert.ok(!('junk' in x));
  assert.equal(layOf({ sc: '../x' }), null, '모르는 화면 이름은 버린다');
  assert.equal(layOf({ ...LAY, sc: 'other' }).sc, undefined);
});

test('요약: 기기·화면마다 마지막 배치 값, 표에 화면별 줄', () => {
  const entries = [
    { event: 'tele', at: 10, deviceName: 'iphone', tele: teleInfo({ k: 'lay', at: 10, lay: { ...LAY, sc: 'home' } }) },
    { event: 'tele', at: 20, deviceName: 'iphone', tele: teleInfo({ k: 'lay', at: 20, lay: { ...LAY, sc: 'session', hh: 793, bh: 793, tl: false } }) },
    { event: 'tele', at: 30, deviceName: 'iphone', tele: teleInfo({ k: 'lay', at: 30, lay: { ...LAY, sc: 'kb', vh: 460, ih: 460, kb: true } }) },
    { event: 'tele', at: 40, deviceName: 'old', tele: teleInfo({ k: 'lay', at: 40, lay: { iw: 390, ih: 844 } }) },
  ];
  const s = errorSummary(entries);
  assert.equal(s.layout.iphone.lay.sc, 'kb', '기기마다 마지막(P355 그대로)');
  assert.deepEqual(Object.keys(s.layoutBy.iphone), ['home', 'session', 'kb']);
  const text = formatErrors(s);
  assert.match(text, /배치\(iphone, 홈, [^)]*\): .*높이 뿌리 852 · html 852 · body 852 \(화면 높이로 늘림\)/);
  assert.match(text, /배치\(iphone, 세션 화면, [^)]*\): .*html 793 · body 793/);
  assert.match(text, /배치\(iphone, 키보드 열림, [^)]*\): .*키보드 열림/);
  assert.match(text, /배치\(old, [^)]*\): 창 390x844/, '화면 이름이 없는 옛 기록은 한 줄');
  assert.doesNotMatch(layLabel({ iw: 1 }), /높이 뿌리/);
});
