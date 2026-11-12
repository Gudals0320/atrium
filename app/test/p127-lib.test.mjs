// P127 단위 시험: 판 움직임 비용 줄이기.
// 1) 판을 움직이는 동안 작업 중 둘레 멈춤(lib/work-light.js motionPauser, zoom-var.js useBoardMotion, styles.css P127 덩어리)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { motionPauser, MOTION_REST_MS } from '../src/renderer/lib/work-light.js';

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
