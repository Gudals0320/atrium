// P17 창 시험: 붙여 묶기의 분할 나무. 셸 노드 넷(s1~s4)으로 Ctrl+끌기 붙이기(가로 덩어리 아래, 덩어리 안 노드의 아래·오른쪽), 3분할(끌기와 틀),
// 2 × 2 틀, 분할선과 바깥 크기 손잡이(비율 저장, 백엔드를 다시 켜도 같음, 터미널 칸 수가 노드 크기에 맞음), 떼기(Ctrl+끌기와 메뉴), 덩어리 안 노드 닫기,
// 옛 한 줄 덩어리 행이 있는 판 기록을 띄웠을 때 같은 모양의 나무로 바뀌는지.
// 판: herdr 세션 multitask-dev-p17, 포트 47833, backend/.dev(experiments/p17/tools/env.cjs). 시험 폴더는 새로 만든 C:\Workspace\mtask-p17-ws 하나, 셸만 띄운다.
// 사용: node experiments/p17/tools/e2e.cjs p17-dock.mjs
import fs from 'node:fs';
import path from 'node:path';
import { launch, closeApp, shot, logger, sleep, until, call, writeJson, atrium, DIRS, DEV, REPO } from './p10-lib.mjs';

// P23: P23 판(experiments/p23/tools/e2e.cjs)에서도 돌린다
if (!['p17', 'p23'].includes(process.env.MT_E2E_BOARD)) throw new Error('MT_E2E_BOARD=p17로 돌린다(experiments/p17/tools/e2e.cjs)');
const B = process.env.MT_E2E_BOARD;
const log = logger('p17-dock');
const result = { steps: [] };
const step = (name, ok, data = {}) => { result.steps.push({ name, ok: !!ok, ...data }); log(`${ok ? '통과' : '실패'}: ${name}`, data); };
for (const d of [DIRS.ws, path.join(DEV, `fixture-projects-${B}`), path.join(DEV, `fixture-sessions-${B}`)]) fs.mkdirSync(d, { recursive: true });
const NAMES = ['s1', 's2', 's3', 's4'];

// ---------- 창 안의 값 ----------
const sid = (page, name) => page.evaluate((n) => { const s = [...window.__mt.getState().sessions.values()].find((x) => x.name === n); return s ? s.sessionId : null; }, name);
const rects = (page) => page.evaluate(() => { const s = window.__mt.getState(); return Object.fromEntries([...s.sessions.values()].map((x) => [x.name, s.nodes.get(x.sessionId)]).filter(([, r]) => r).map(([n, r]) => [n, { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) }])); });
// 나무를 이름으로(비율은 소수 셋째 자리)
const trees = (page) => page.evaluate(() => {
  const s = window.__mt.getState();
  const nm = (t) => (typeof t === 'string' ? (s.sessions.get(t) || { name: t }).name : { dir: t.dir, kids: t.kids.map(nm), ratios: t.ratios.map((r) => Math.round(r * 1000) / 1000) });
  return [...s.docks.values()].map((d) => ({ dockId: d.dockId, tree: nm(d.tree) }));
});
const shape = (t) => (typeof t === 'string' ? t : `${t.dir}[${t.kids.map(shape).join(',')}]`);
const shapes = async (page) => (await trees(page)).map((d) => shape(d.tree));
const tiled = (rs) => { // 겹치지 않고 bbox를 꽉 채우는가
  const a = rs.reduce((x, r) => x + r.w * r.h, 0);
  const x0 = Math.min(...rs.map((r) => r.x)), y0 = Math.min(...rs.map((r) => r.y)), x1 = Math.max(...rs.map((r) => r.x + r.w)), y1 = Math.max(...rs.map((r) => r.y + r.h));
  return a === (x1 - x0) * (y1 - y0) && !rs.some((p, i) => rs.some((q, j) => j > i && p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h));
};
// 판 좌표 → 화면 좌표
// React Flow가 실제로 그린 변환(.react-flow__viewport의 transform)을 쓴다. 창의 vpNow와 다르면 기록에 남긴다
const toScreen = (page, p) => page.evaluate((pt) => {
  const s = window.__mt.getState();
  const r = document.querySelector('.mt-canvas').getBoundingClientRect();
  const m = new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.react-flow__viewport')).transform);
  const v = { x: m.e, y: m.f, zoom: m.a };
  const n = s.vpNow || {};
  return { x: r.left + v.x + pt.x * v.zoom, y: r.top + v.y + pt.y * v.zoom, drift: Math.abs((n.x ?? v.x) - v.x) + Math.abs((n.y ?? v.y) - v.y) > 2 || Math.abs((n.zoom ?? v.zoom) - v.zoom) > 0.001 ? { vpNow: n, actual: v } : null };
}, p);
const zoomNow = (page) => page.evaluate(() => window.__mt.getState().vpNow.zoom);
// 화면을 판 사각형에 맞춘다(여유 margin, 판 좌표)
async function frame(page, rect, margin = 200) {
  await page.evaluate(([r, m]) => window.__mt.getState().navigateToRect({ x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.h + 2 * m }, 0), [rect, margin]);
  await sleep(500);
}
const bboxOf = (rs) => { const x0 = Math.min(...rs.map((r) => r.x)), y0 = Math.min(...rs.map((r) => r.y)); return { x: x0, y: y0, w: Math.max(...rs.map((r) => r.x + r.w)) - x0, h: Math.max(...rs.map((r) => r.y + r.h)) - y0 }; };

// Ctrl을 누른 채 name의 머리줄을 잡아 판 좌표 to(끄는 점)까지 끈다. before(page)를 주면 놓기 전에 부른다(미리 보기 스크린숏)
async function ctrlDrag(page, name, to, before = null) {
  const head = await page.locator(`.mt-node[data-name="${name}"] .mt-node-head`).boundingBox();
  const x0 = head.x + Math.min(120, head.width / 3), y0 = head.y + head.height / 2;
  const end = await toScreen(page, to);
  if (end.drift) log('vpNow가 실제 화면과 다르다', end.drift);
  await page.mouse.move(x0, y0);
  await page.keyboard.down('Control');
  await page.mouse.down();
  for (let i = 1; i <= 16; i++) { await page.mouse.move(x0 + ((end.x - x0) * i) / 16, y0 + ((end.y - y0) * i) / 16); await sleep(16); }
  await sleep(250);
  const ghost = await page.evaluate(() => { const g = document.querySelector('[data-role=dock-ghost]'); return g ? { kind: g.dataset.kind, side: g.dataset.side } : null; });
  if (before) await before(page);
  await page.mouse.up();
  await page.keyboard.up('Control');
  await sleep(1300);
  const ev = await page.evaluate(() => (window.__mt.perf.events || []).filter((e) => e.kind === 'drag_stop').slice(-1)[0]);
  log(`Ctrl+끌기 ${name} → 판 (${Math.round(to.x)}, ${Math.round(to.y)})`, { ghost, stop: ev || null });
  return ghost;
}
async function ctrlClick(page, name) {
  const head = await page.locator(`.mt-node[data-name="${name}"] .mt-node-head`).boundingBox();
  await page.keyboard.down('Control');
  await page.mouse.click(head.x + Math.min(120, head.width / 3), head.y + head.height / 2);
  await page.keyboard.up('Control');
  await sleep(250);
}
// 처음 자리: 덩어리를 모두 풀고 넷을 떨어뜨려 둔다(s1 자리 기준)
async function reset(page, base) {
  for (const d of await call(page, 'dock.list')) await call(page, 'dock.remove', { dock: d.dockId });
  const at = { s1: [0, 0], s2: [900, 0], s3: [0, 700], s4: [900, 700] };
  for (const n of NAMES) { const id = await sid(page, n); if (id) await call(page, 'board.setNode', { session: id, x: base.x + at[n][0], y: base.y + at[n][1], w: 720, h: 460, z: 0, cause: 'p17 test reset' }); }
  // board.setNode는 창에 알리지 않는다(창이 먼저 바꾸고 부르는 API). 창이 판을 다시 읽게 board.changed를 창 안에서 낸다
  await page.evaluate(() => { window.__mt.api.emit('board.changed', { why: 'p17 test reset' }); if (window.__mt.getState().clearSelection) window.__mt.getState().clearSelection(); });
  await sleep(900);
  await frame(page, { x: base.x, y: base.y, w: 1620, h: 1160 }, 260);
}
// 터미널 칸 수가 노드 크기에 맞는가: xterm 화면이 노드 몸통 안에 들어가고 남는 폭·높이가 한 칸보다 작다. 판이 받은 크기(perf.terminals)와 같은가
const termFit = (page, names) => page.evaluate((ns) => ns.map((n) => {
  const s = [...window.__mt.getState().sessions.values()].find((x) => x.name === n);
  const el = document.querySelector(`.mt-node[data-name="${n}"]`);
  const scr = el && el.querySelector('.xterm-screen'), host = el && el.querySelector('.xterm');
  const t = s && window.__mt.perf.perf.terminals.get(s.sessionId);
  if (!scr || !host || !t) return { n, attached: false };
  const zs = el.getBoundingClientRect().width / window.__mt.getState().nodes.get(s.sessionId).w; // 화면 px / 판 px
  const sw = scr.getBoundingClientRect().width / zs, sh = scr.getBoundingClientRect().height / zs;
  const hw = host.parentElement.getBoundingClientRect().width / zs, hh = host.parentElement.getBoundingClientRect().height / zs;
  const cw = sw / t.cols, ch = sh / t.rows;
  return { n, attached: true, cols: t.cols, rows: t.rows, node: { w: window.__mt.getState().nodes.get(s.sessionId).w, h: window.__mt.getState().nodes.get(s.sessionId).h }, spareW: Math.round(hw - sw), spareH: Math.round(hh - sh), cell: [+cw.toFixed(1), +ch.toFixed(1)], ok: sw <= hw + 1 && sh <= hh + 1 && hw - sw < cw * 2 + 24 && hh - sh < ch * 2 + 24 };
}), names);

let { app, page } = await launch({ log });
try {
  if (await page.$('[data-role="sidebar"]')) await page.click('[data-action="sidebar"]');
  // 0) 셸 넷
  for (const n of NAMES) if (!(await sid(page, n))) await call(page, 'session.spawn', { cwd: DIRS.ws, kind: 'shell', name: n });
  await until(async () => (await Promise.all(NAMES.map((n) => sid(page, n)))).every(Boolean), 40000, 500);
  await sleep(2000);
  const base = (await rects(page)).s1;
  log('기준 자리(s1)', base);

  // 1) 가로 덩어리 아래에 붙이기: s1|s2 가로 덩어리 바깥 아래 가장자리 쪽으로 s3를 Ctrl+끌기
  await reset(page, base);
  await call(page, 'dock.create', { members: [await sid(page, 's1'), await sid(page, 's2')], dir: 'row' });
  await sleep(900);
  let r = await rects(page);
  let z = await zoomNow(page);
  let g = await ctrlDrag(page, 's3', { x: r.s1.x + 1100, y: r.s1.y + 460 + 14 / z }, (p) => shot(p, 'p17-1-1-under-row-preview', log));
  let t = await trees(page); r = await rects(page);
  step('가로 덩어리 아래에 붙이기(Ctrl+끌기, 덩어리 전체 아래 새 칸)', g && g.kind === 'dock' && g.side === 'bottom' && (await shapes(page))[0] === 'col[row[s1,s2],s3]' && r.s3.w === 1440 && r.s3.y === r.s1.y + 460 && tiled([r.s1, r.s2, r.s3]), { ghost: g, tree: t[0] && t[0].tree, s3: r.s3 });
  await shot(page, 'p17-1-2-under-row-docked', log);

  // 2) 덩어리 안 노드 하나(s2)의 아래, 그다음 s1의 오른쪽
  z = await zoomNow(page);
  g = await ctrlDrag(page, 's4', { x: r.s2.x + r.s2.w / 2, y: r.s2.y + r.s2.h * 0.78 }, (p) => shot(p, 'p17-2-1-below-leaf-preview', log));
  r = await rects(page);
  step('덩어리 안 노드(s2)의 아래에 붙이기(s2를 위아래로 반)', g && g.kind === 'leaf' && g.side === 'bottom' && (await shapes(page))[0] === 'col[row[s1,col[s2,s4]],s3]' && r.s4.x === r.s2.x && r.s4.y === r.s2.y + r.s2.h && r.s2.h === 230 && tiled([r.s1, r.s2, r.s3, r.s4]), { ghost: g, shape: (await shapes(page))[0], s2: r.s2, s4: r.s4 });
  await shot(page, 'p17-2-2-below-leaf-docked', log);
  g = await ctrlDrag(page, 's3', { x: r.s1.x + r.s1.w * 0.85, y: r.s1.y + r.s1.h / 2 }, (p) => shot(p, 'p17-2-3-right-of-leaf-preview', log));
  r = await rects(page);
  const sh2 = (await shapes(page))[0];
  step('덩어리 안 노드(s1)의 오른쪽에 붙이기(같은 덩어리 안에서 옮김, 바깥 그대로)', g && g.kind === 'leaf' && g.side === 'right' && sh2 === 'row[s1,s3,col[s2,s4]]' && r.s3.x === r.s1.x + r.s1.w && bboxOf([r.s1, r.s2, r.s3, r.s4]).w === 1440 && tiled([r.s1, r.s2, r.s3, r.s4]), { ghost: g, shape: sh2, s1: r.s1, s3: r.s3 });
  await shot(page, 'p17-2-4-right-of-leaf-docked', log);

  // 3) 3분할(왼쪽 크게 + 오른쪽 위아래): 끌기로
  await reset(page, base);
  r = await rects(page); z = await zoomNow(page);
  g = await ctrlDrag(page, 's2', { x: r.s1.x + r.s1.w + 14 / z, y: r.s1.y + 200 });
  r = await rects(page);
  const g2 = await ctrlDrag(page, 's3', { x: r.s2.x + r.s2.w / 2, y: r.s2.y + r.s2.h * 0.8 }, (p) => shot(p, 'p17-3-1-three-way-drag-preview', log));
  r = await rects(page);
  step('3분할을 끌기로(s2를 s1 옆 새 칸, s3를 s2 아래 반)', g && g.kind === 'dock' && g2 && g2.kind === 'leaf' && (await shapes(page))[0] === 'row[s1,col[s2,s3]]' && r.s1.h === 460 && r.s2.h === 230 && r.s3.h === 230 && tiled([r.s1, r.s2, r.s3]), { first: g, second: g2, rects: { s1: r.s1, s2: r.s2, s3: r.s3 } });
  await shot(page, 'p17-3-2-three-way-by-drag', log);
  // 틀로: Ctrl+누르기로 s1, s2, s3 차례로 고르고 "1 + 2"
  await reset(page, base);
  for (const n of ['s1', 's2', 's3']) await ctrlClick(page, n);
  const picked = await page.evaluate(() => window.__mt.getState().selected.map((id) => window.__mt.getState().sessions.get(id).name));
  await shot(page, 'p17-3-3-selection-bar-presets', log);
  await page.click('[data-role=selection] [data-preset="main-left"]');
  await sleep(1500);
  t = await trees(page); r = await rects(page);
  step('3분할을 틀(1 + 2)로: 고른 순서대로 왼쪽 크게, 오른쪽 위아래', picked.join() === 's1,s2,s3' && (await shapes(page))[0] === 'row[s1,col[s2,s3]]' && t[0].tree.ratios.join() === '0.6,0.4' && r.s1.w === 864 && r.s1.h === 920 && r.s2.w === 576 && tiled([r.s1, r.s2, r.s3]), { picked, tree: t[0] && t[0].tree, s1: r.s1, s2: r.s2 });
  await frame(page, bboxOf([r.s1, r.s2, r.s3]), 160);
  await shot(page, 'p17-3-4-three-way-by-preset', log);

  // 4) 2 × 2 틀(덩어리 하나와 노드 하나를 고르면 덩어리 전체가 들어온다)
  await ctrlClick(page, 's1'); await ctrlClick(page, 's4');
  await page.click('[data-role=selection] [data-preset="grid"]');
  await sleep(1500);
  r = await rects(page);
  step('2 × 2 틀(덩어리 + s4)', (await shapes(page))[0] === 'col[row[s1,s2],row[s3,s4]]' && (await trees(page)).length === 1 && NAMES.every((n) => r[n].w === 720 && r[n].h === 460) && tiled(NAMES.map((n) => r[n])), { shape: (await shapes(page))[0], rects: r });
  await frame(page, bboxOf(NAMES.map((n) => r[n])), 160);
  await shot(page, 'p17-4-grid', log);

  // 5) 분할선 끌기: 위 줄 가운데 선(path 0)을 오른쪽으로, 위아래 선(뿌리)을 아래로. 바깥 크기 손잡이
  z = await zoomNow(page);
  // 누르는 자리 fx, fy(요소 안 비율). 뿌리 가로선은 세로선과 엇갈리는 가운데를 피해 누른다
  const dragEl = async (sel, dx, dy, fx = 0.5, fy = 0.5) => {
    const b = await page.locator(sel).first().boundingBox();
    const x0 = b.x + b.width * fx, y0 = b.y + b.height * fy;
    await page.mouse.move(x0, y0); await page.mouse.down();
    for (let i = 1; i <= 10; i++) { await page.mouse.move(x0 + (dx * i) / 10, y0 + (dy * i) / 10); await sleep(16); }
    await page.mouse.up(); await sleep(1300);
  };
  const before5 = await rects(page);
  await dragEl('.mt-divider[data-path="0"][data-index="0"]', 120, 0);
  await dragEl('.mt-divider[data-path=""][data-index="0"]', 0, 70, 0.25, 0.5);
  r = await rects(page); t = await trees(page);
  const dw = r.s1.w - before5.s1.w, dh = r.s1.h - before5.s1.h;
  step('분할선: 그 마디의 두 쪽만 함께 바뀐다(위 줄 s1·s2, 위아래 줄), 아래 줄 가운데 선은 그대로', dw > 100 && r.s1.w + r.s2.w === 1440 && r.s3.w === 720 && dh > 60 && r.s1.h + r.s3.h === 920 && tiled(NAMES.map((n) => r[n])), { dw, dh, tree: t[0].tree });
  // 바깥 크기 손잡이: 오른쪽 아래로 끌면 비율대로 커진다
  const ratiosBefore = JSON.stringify(t[0].tree);
  await frame(page, bboxOf(NAMES.map((n) => r[n])), 320);
  await dragEl('[data-role=dock-grip]', 160, 100);
  r = await rects(page); t = await trees(page);
  const out5 = bboxOf(NAMES.map((n) => r[n]));
  step('바깥 크기 손잡이: 덩어리가 커지고 비율은 그대로', out5.w > 1440 && out5.h > 920 && JSON.stringify(t[0].tree) === ratiosBefore && tiled(NAMES.map((n) => r[n])), { outer: out5, tree: t[0].tree });
  await shot(page, 'p17-5-1-dividers-and-grip', log);
  // 저장(백엔드 기록)과 같은가
  const stored = await call(page, 'dock.list');
  const sameStored = JSON.stringify(stored[0].tree) === JSON.stringify((await page.evaluate(() => [...window.__mt.getState().docks.values()][0].tree)));
  // 터미널 칸 수(붙은 노드만). 덩어리 안 노드 넷이 크기가 달라도 각자 맞는다
  await frame(page, out5, 60);
  await sleep(2500);
  const fit1 = await termFit(page, NAMES);
  step('덩어리 안 터미널의 칸 수가 노드 크기와 맞는다', fit1.filter((x) => x.attached).length >= 2 && fit1.filter((x) => x.attached).every((x) => x.ok), { fit: fit1 });
  // 백엔드를 껐다 켠다(창이 다시 띄운다)
  const treeBefore = JSON.stringify(stored[0].tree), rectsBefore = JSON.stringify(await rects(page));
  log('backend stop', atrium('backend', 'stop').trim().slice(0, 200));
  await sleep(1500);
  await until(async () => { try { return !!(await call(page, 'dock.list')); } catch { return false; } }, 60000, 1000);
  await sleep(4000);
  const after = await call(page, 'dock.list');
  const rectsAfter = JSON.stringify(await rects(page));
  step('백엔드를 껐다 켜도 덩어리 나무와 비율, 노드 자리가 같다', sameStored && after.length === 1 && JSON.stringify(after[0].tree) === treeBefore && rectsAfter === rectsBefore, { sameStored, before: treeBefore, after: after[0] && JSON.stringify(after[0].tree) });
  await sleep(2500);
  const fit2 = await termFit(page, NAMES);
  step('다시 켠 뒤에도 터미널 칸 수가 노드 크기와 맞는다', fit2.filter((x) => x.attached).length >= 2 && fit2.filter((x) => x.attached).every((x) => x.ok), { fit: fit2 });
  await shot(page, 'p17-5-2-after-backend-restart', log);

  // 6) 떼기: Ctrl+끌기로 s4를 덩어리 밖 빈 곳에, 메뉴로 s3
  r = await rects(page);
  const out6 = bboxOf(NAMES.map((n) => r[n]));
  await frame(page, { ...out6, w: out6.w + 1000 }, 120);
  g = await ctrlDrag(page, 's4', { x: out6.x + out6.w + 500, y: out6.y + 100 });
  r = await rects(page);
  const sh6 = (await shapes(page))[0];
  step('Ctrl+끌기로 덩어리 밖에 놓으면 뗀다(남은 나무 정리)', !g && sh6 === 'col[row[s1,s2],s3]' && r.s4.x > out6.x + out6.w && tiled([r.s1, r.s2, r.s3]), { ghost: g, shape: sh6, s4: r.s4 });
  await shot(page, 'p17-6-1-ctrl-drag-out', log);
  await frame(page, r.s3, 60); // ⋯ 단추는 작게 보일 때(z-small) 숨는다. s3로 가까이 간다
  await page.hover('.mt-node[data-name="s3"] .mt-node-head');
  await sleep(300);
  await page.click('.mt-node[data-name="s3"] [data-action=node-menu]');
  await sleep(300);
  await shot(page, 'p17-6-2-node-menu-undock', log);
  await page.click('.mt-node[data-name="s3"] [data-action=undock]');
  await sleep(1300);
  r = await rects(page);
  step('메뉴 "떼기"(뿌리 칸을 떼면 덩어리가 그만큼 준다)', (await shapes(page))[0] === 'row[s1,s2]' && bboxOf([r.s1, r.s2]).h === r.s1.h && tiled([r.s1, r.s2]), { shape: (await shapes(page))[0] });

  // 7) 덩어리 안 노드 닫기: 2 × 2에서 s4를 끄면 s3가 아래 줄 전체
  await reset(page, base);
  await call(page, 'dock.layout', { members: await Promise.all(NAMES.map((n) => sid(page, n))), preset: 'grid' });
  await sleep(1200);
  await call(page, 'session.kill', { session: await sid(page, 's4'), confirm: true });
  await until(async () => !(await sid(page, 's4')), 20000, 500);
  await sleep(1200);
  r = await rects(page);
  step('덩어리 안 노드를 닫으면 그 잎이 빠지고 이웃이 채운다', (await shapes(page))[0] === 'col[row[s1,s2],s3]' && r.s3.w === 1440 && tiled([r.s1, r.s2, r.s3]), { shape: (await shapes(page))[0], s3: r.s3 });
  await frame(page, bboxOf([r.s1, r.s2, r.s3]), 160);
  await shot(page, 'p17-7-close-in-dock', log);

  // 8) 옛 한 줄 덩어리 행: 창과 백엔드를 끄고 board.db에 P16까지의 행(tree 없음)을 넣은 뒤 다시 띄운다
  await reset(page, base);
  const id1 = await sid(page, 's1'), id2 = await sid(page, 's2'), id3 = await sid(page, 's3');
  await closeApp(app);
  log('backend stop', atrium('backend', 'stop').trim().slice(0, 200));
  await sleep(1500);
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(path.join(DEV, 'data', 'board.db'));
  db.exec('DELETE FROM docks');
  const put = (id, x, w) => db.prepare('UPDATE nodes SET x = ?, y = ?, w = ?, h = ? WHERE session_id = ?').run(base.x + x, base.y, w, 460, id);
  put(id1, 0, 600); put(id2, 600, 840); put(id3, 1440, 480);
  db.prepare("INSERT INTO docks (dock_id, workspace_key, dir, members, origin, created_at, updated_at) VALUES ('dlegacy', (SELECT workspace_key FROM sessions WHERE session_id = ?), 'row', ?, 'user', 1, 1)").run(id1, JSON.stringify([id1, id2, id3]));
  const legacyRow = db.prepare("SELECT dir, members, tree FROM docks WHERE dock_id = 'dlegacy'").get();
  db.close();
  log('옛 행', { ...legacyRow });
  ({ app, page } = await launch({ log }));
  if (await page.$('[data-role="sidebar"]')) await page.click('[data-action="sidebar"]');
  await until(async () => (await trees(page)).length === 1, 30000, 500);
  await sleep(1500);
  t = await trees(page); r = await rects(page);
  const legacyOk = (await shapes(page))[0] === 'row[s1,s2,s3]' && t[0].tree.ratios.join() === '0.313,0.438,0.25' && r.s1.x === base.x && r.s1.w === 600 && r.s2.x === base.x + 600 && r.s2.w === 840 && r.s3.x === base.x + 1440 && r.s3.w === 480;
  let evs = [];
  try { const rdb = new DatabaseSync(path.join(DEV, 'data', 'board.db'), { readOnly: true }); evs = rdb.prepare("SELECT data FROM events WHERE kind = 'docks_migrated' ORDER BY id").all().map((e) => JSON.parse(e.data)); rdb.close(); } catch (e) { log('events', e.message.slice(0, 200)); }
  step('옛 한 줄 덩어리 행을 띄우면 같은 모양의 나무로 바뀐다(첫 실행 때 한 번)', legacyOk && evs.length >= 1, { tree: t[0] && t[0].tree, rects: { s1: r.s1, s2: r.s2, s3: r.s3 }, migrated: evs.slice(-1) });
  await frame(page, bboxOf([r.s1, r.s2, r.s3]), 160);
  await shot(page, 'p17-8-legacy-row-migrated', log);
  // 바뀐 덩어리에서도 아래에 붙는다(사용자가 실제 판에서 못 하던 것)
  r = await rects(page); z = await zoomNow(page);
  await page.evaluate(() => window.__mt.getState().navigateToRect && null);
  const s4 = await call(page, 'session.spawn', { cwd: DIRS.ws, kind: 'shell', name: 's4' });
  await until(async () => !!(await sid(page, 's4')), 30000, 500);
  await sleep(1500);
  await call(page, 'board.setNode', { session: s4.sessionId || (await sid(page, 's4')), x: base.x + 300, y: base.y + 800, w: 720, h: 460, z: 0, cause: 'p17 test' });
  await sleep(800);
  await frame(page, { x: base.x, y: base.y, w: 1920, h: 1260 }, 160);
  r = await rects(page); z = await zoomNow(page);
  g = await ctrlDrag(page, 's4', { x: r.s2.x + r.s2.w / 2, y: r.s2.y + r.s2.h + 14 / z }, (p) => shot(p, 'p17-8-2-legacy-under-preview', log));
  step('옮긴 옛 덩어리 아래에도 붙는다', g && g.kind === 'dock' && (await shapes(page))[0] === 'col[row[s1,s2,s3],s4]', { ghost: g, shape: (await shapes(page))[0] });
  await shot(page, 'p17-8-3-legacy-under-docked', log);
} catch (e) {
  step('예외', false, { error: e.stack });
} finally { await closeApp(app); }
result.ok = result.steps.every((x) => x.ok);
writeJson('p17-dock.json', result);
log(result.ok ? '모두 통과' : `실패 ${result.steps.filter((x) => !x.ok).map((x) => x.name).join(', ')}`);
process.exit(result.ok ? 0 : 1);
