// P127 단위 시험: 판 움직임 비용 줄이기.
// 1) 판을 움직이는 동안 작업 중 둘레 멈춤(lib/work-light.js motionPauser, zoom-var.js useBoardMotion, styles.css P127 덩어리)
// 2) 터미널 노드 머리줄(노드 뿌리 --inv)과 영역·워크트리 상자·그룹 틀 이름표 글자도 배율 계단(lib/faces.js zoomStep)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { motionPauser, MOTION_REST_MS } from '../src/renderer/lib/work-light.js';
import { zoomStep, ZOOM_STEP } from '../src/renderer/lib/faces.js';

const R = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'renderer');
const read = (f) => fs.readFileSync(path.join(R, f), 'utf8');
const noComments = (s) => s.replace(/\/\*[^]*?\*\//g, '');

// 가짜 시계와 타이머
function clock() {
  let t = 0, id = 0;
  const timers = new Map();
  return {
    now: () => t,
    setT: (fn, ms) => { id++; timers.set(id, { fn, at: t + ms }); return id; },
    clearT: (h) => { timers.delete(h); },
    advance(ms) {
      const end = t + ms;
      for (;;) {
        let next = null;
        for (const [h, x] of timers) if (x.at <= end && (!next || x.at < next[1].at)) next = [h, x];
        if (!next) break;
        timers.delete(next[0]); t = next[1].at; next[1].fn();
      }
      t = end;
    },
    get pending() { return timers.size; },
  };
}

test('움직임 멈춤: 움직이면 data-board-moving을 달고, 마지막 움직임 뒤 MOTION_REST_MS가 지나면 뗀다', () => {
  const doc = { documentElement: { dataset: {} } };
  const c = clock();
  const p = motionPauser({ doc, now: c.now, setT: c.setT, clearT: c.clearT });
  const ds = doc.documentElement.dataset;
  assert.ok(MOTION_REST_MS >= 200 && MOTION_REST_MS <= 1000, '휠 칸 사이(50~150ms)보다 넉넉하고 1초 안');
  assert.equal(p.moving, false); assert.ok(!('boardMoving' in ds));
  p.moved();
  assert.equal(ds.boardMoving, '1'); assert.equal(p.moving, true);
  // 매 프레임(7ms) 움직임이 1초 이어져도 타이머는 하나뿐이고 계속 멈춘 채
  for (let i = 0; i < 140; i++) { c.advance(7); p.moved(); assert.ok(c.pending <= 1, '타이머 하나'); }
  assert.equal(ds.boardMoving, '1');
  // 휠 칸 사이(150ms) 쉬어도 멈춘 채
  c.advance(150); p.moved(); assert.equal(ds.boardMoving, '1');
  // 멈춘 뒤 MOTION_REST_MS 직전까지는 멈춘 채, 지나면 다시 돈다
  c.advance(MOTION_REST_MS - 10); assert.equal(ds.boardMoving, '1');
  c.advance(20); assert.ok(!('boardMoving' in ds), '다시 돈다'); assert.equal(p.moving, false); assert.equal(c.pending, 0);
  // 다시 움직이면 다시 멈춘다
  p.moved(); assert.equal(ds.boardMoving, '1');
  p.dispose(); assert.ok(!('boardMoving' in ds), '정리하면 뗀다'); assert.equal(c.pending, 0);
  // 문서가 없어도 던지지 않는다
  const q = motionPauser({ doc: null, now: c.now, setT: c.setT, clearT: c.clearT });
  q.moved(); q.dispose(); assert.equal(q.moving, false);
});

test('움직임 멈춤 CSS: 회전판만 paused(모양·색 그대로), 미션 맵 카드 빛은 건드리지 않음, 판이 변환을 구독해 부른다', () => {
  const css = noComments(read('styles.css'));
  const i = css.indexOf('html[data-board-moving="1"]');
  assert.ok(i >= 0, '규칙이 있다');
  const rules = css.slice(i).split('}').filter((r) => r.includes('data-board-moving'));
  assert.equal(rules.length, 1);
  assert.match(rules[0], /\.mt-node-run > i \{ animation-play-state: paused; $/);
  assert.ok(!/data-board-moving[^{]*mt-mm-light/.test(css), '미션 맵 카드 빛은 그대로');
  // workLight 끔·움직임 줄이기 따름은 animation: none이라 paused와 겹쳐도 그대로 멈춘 고리
  assert.match(css, /html\[data-work-light="off"\] \.mt-node-run > i \{ animation: none;/);
  const zv = read('zoom-var.js');
  assert.match(zv, /export function useBoardMotion\(\)/);
  assert.match(zv, /motionPauser\(\)/);
  assert.match(read('Canvas.jsx'), /useBoardMotion\(\);/);
});

test('글자 계단: 계단 위 배율에서는 지금과 같고(멈춘 화면), 그 사이에서는 ±5% 안, 계단은 1.1배마다', () => {
  assert.equal(ZOOM_STEP, 1.1);
  // 멈춘 화면(계단 위): 머리줄 글자 13px/배율이 그대로
  for (let k = -30; k <= 5; k++) {
    const z = ZOOM_STEP ** k;
    assert.ok(Math.abs(zoomStep(z) - z) < 1e-9 * Math.max(1, z), `계단 위 ${z}`);
    assert.ok(Math.abs(13 / zoomStep(z) - 13 / z) < 1e-6, '같은 글자 크기');
  }
  // 그 사이: 차이 ±5% 안, 배율 쪽으로 단조(계단만 바뀜)
  let prev = 0, changes = 0;
  for (let z = 0.05; z <= 1.6; z *= 1.004) {
    const s = zoomStep(z);
    assert.ok(Math.abs(s / z - 1) <= 0.0489, `±5% 안 ${z}`);
    assert.ok(s >= prev); if (s !== prev) changes++; prev = s;
  }
  assert.ok(changes <= Math.ceil(Math.log(1.6 / 0.05) / Math.log(1.1)) + 1, '계단이 바뀌는 수는 1.1배마다 한 번');
});

test('글자 계단: 터미널 노드 뿌리 --inv, 영역·워크트리 상자·그룹 틀 이름표가 계단 값으로 쓰인다(터미널 안 글자는 --inv를 쓰지 않는다)', () => {
  const zv = read('zoom-var.js');
  assert.match(zv, /export function useZoomStyle\(styleOf, stepped = false\)/);
  assert.match(zv, /const z = stepped \? zoomStep\(st\.transform\[2\]\) : st\.transform\[2\];/);
  assert.match(zv, /\}, \[flow, stepped\]\);/);
  const rg = read('Regions.jsx');
  for (const f of ['regionHead', 'wtHead', 'groupHead']) assert.match(rg, new RegExp(`useZoomStyle\\(${f}, true\\)`), f);
  assert.ok(!/useZoomStyle\((regionHead|wtHead|groupHead)\)/.test(rg), '부드러운 것이 남지 않았다');
  const sn = read('SessionNode.jsx');
  assert.match(sn, /const invRef = useInvRef\(0\.02, id, true\);/, '모든 얼굴(터미널 포함) 노드 뿌리 --inv는 계단');
  assert.ok(!/face !== 'close';/.test(sn));
  // 터미널 칸 안은 --inv를 고정해 둔다(P112): 배율 계단이 터미널 글자에 닿지 않는다
  assert.match(noComments(read('styles.css')), /\.mt-term-wrap[^{]*\{[^}]*--inv: 1/);
});
