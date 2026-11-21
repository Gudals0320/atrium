// P291: PC 브라우저는 페이지를 잃어도 0단계로 연다. 휴대폰·태블릿은 지금 규칙(P84·P86)
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCrumbs, bootDecide, crumbAlive, crumbStep, touchDevice, PC_FAST_MS, PC_FAST_CRASHES } from '../src/renderer/lib/crumbs.js';

const json = (s) => parseCrumbs(JSON.stringify(s));
// 보드를 열고(paint) upMs 살다가 정상으로 떠나지 못함
function die(state, t, upMs) { const s = crumbStep(state, 'paint', {}, t + 100); return json(crumbAlive(s, { view: 'board' }, t + upMs)); }

test('touchDevice: 손가락 포인터·휴대폰 UA·작은 터치 화면만', () => {
  assert.equal(touchDevice({ coarse: true }), true);
  assert.equal(touchDevice({ ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' }), true);
  assert.equal(touchDevice({ ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/157.0' }), false);
  assert.equal(touchDevice({ ua: 'Mozilla/5.0 (Windows NT 10.0)', maxTouch: 10, minScreen: 1080 }), false, '터치 노트북');
  assert.equal(touchDevice({ maxTouch: 5, minScreen: 768 }), true);
});

test('PC: 오래 살다가 잃은 페이지(잠자기·탭 버리기)는 단계 0', () => {
  let t = 1e6;
  let d = bootDecide(null, t, { touch: false });
  assert.equal(d.level, 0);
  const s = die(d.state, t, 3600_000); t += 3600_000 + 5000;
  d = bootDecide(s, t, { touch: false });
  assert.equal(d.crashed, true, '죽음은 알린다');
  assert.equal(d.level, 0); assert.equal(d.light, false);
  // 같은 기록이 휴대폰이면 한 단계 가볍게(지금 규칙)
  assert.equal(bootDecide(s, t, { touch: true }).level, 1);
});

test('PC: 휴대폰 규칙이 남긴 단계 기록은 무시', () => {
  const old = json({ v: 1, cur: { boot: 1, alive: 2, clean: true, level: 2, mode: 'board' }, crashes: [], light: true, retry: null, level: 2, ok: true });
  const d = bootDecide(old, 1e6, { touch: false });
  assert.equal(d.level, 0); assert.equal(d.light, false); assert.equal(d.state.by, 'pc');
  // 휴대폰은 그대로 2
  assert.equal(bootDecide(old, 1e6).level, 2);
});

test('PC: 열린 지 몇 초 안에 연이어 죽을 때만 한 단계', () => {
  let t = 1e6;
  let d = bootDecide(null, t, { touch: false });
  for (let i = 0; i < PC_FAST_CRASHES; i++) {
    const s = die(d.state, t, 3000); t += 5000;
    d = bootDecide(s, t, { touch: false });
    assert.equal(d.level, i === PC_FAST_CRASHES - 1 ? 1 : 0, `죽음 ${i + 1}`);
  }
  assert.equal(d.stepped, true);
  // 한 단계 올린 PC 기록은 그다음 정상 부팅에서도 그 단계(사람이 "한 단계 무겁게"로 내린다)
  const ok = json({ ...d.state, cur: { ...d.state.cur, clean: true } });
  assert.equal(bootDecide(ok, t + 1000, { touch: false }).level, 1);
  // 느린 죽음(PC_FAST_MS 넘게 산 페이지)은 세지 않는다
  let e = bootDecide(null, 5e6, { touch: false }); let u = 5e6;
  for (let i = 0; i < 5; i++) { const s = die(e.state, u, PC_FAST_MS + 1000); u += PC_FAST_MS + 3000; e = bootDecide(s, u, { touch: false }); }
  assert.equal(e.level, 0);
});
