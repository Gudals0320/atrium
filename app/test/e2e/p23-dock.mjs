// P23 창 시험: 덩어리 다듬기. 셸 노드 넷(s1~s4)으로 고른 노드 막대(그룹 단추 없음, 가로·세로 크기 여섯, 배치 틀 도형 단추),
// 붙은 노드 테두리 끌기(안쪽은 분할선, 바깥은 그 쪽으로 커지고 줄기), 배율 0.3·1에서 분할선 잡기(화면 8px), 엇갈리는 점 손잡이, 두 번 눌러 반반,
// 덩어리 안 점끼리 잇기와 겹친 선(연결이 없으면 점이 보이지 않음)을 본다.
// 판: herdr 세션 atrium-dev-p23, 포트 47841, backend/.dev(experiments/p23/tools/env.cjs). 시험 폴더는 새로 만든 C:\Workspace\mtask-p23-ws 하나, 셸만 띄운다.
// 사용: node experiments/p23/tools/e2e.cjs p23-dock.mjs
// P26: 막대가 가로|세로 토글과 크기 단추 셋, 세션 수(넷)에 맞는 틀 여섯으로 바뀌었고 겹친 선이 진해졌다. P26 판(MT_E2E_BOARD=p26)에서도 돈다
import fs from 'node:fs';
import path from 'node:path';
import { launch, closeApp, shot, logger, sleep, until, call, writeJson, DIRS, DEV, OUT } from './p10-lib.mjs';

const BOARD = process.env.MT_E2E_BOARD;
if (!['p23', 'p26'].includes(BOARD)) throw new Error('MT_E2E_BOARD=p23이나 p26으로 돌린다(experiments/p23·p26/tools/e2e.cjs)');
const log = logger('p23-dock');
const result = { steps: [] };
const step = (name, ok, data = {}) => { result.steps.push({ name, ok: !!ok, ...data }); log(`${ok ? '통과' : '실패'}: ${name}`, data); };
for (const d of [DIRS.ws, path.join(DEV, `fixture-projects-${BOARD}`), path.join(DEV, `fixture-sessions-${BOARD}`)]) fs.mkdirSync(d, { recursive: true });
const NAMES = ['s1', 's2', 's3', 's4'];
const SIZES = { 'wide-large': [1440, 810], 'wide-normal': [1040, 585], 'wide-small': [720, 405], 'tall-large': [720, 1120], 'tall-normal': [600, 920], 'tall-small': [480, 740] };

// ---------- 창 안의 값 ----------
const sid = (page, name) => page.evaluate((n) => { const s = [...window.__mt.getState().sessions.values()].find((x) => x.name === n); return s ? s.sessionId : null; }, name);
const rects = (page) => page.evaluate(() => { const s = window.__mt.getState(); return Object.fromEntries([...s.sessions.values()].map((x) => [x.name, s.nodes.get(x.sessionId)]).filter(([, r]) => r).map(([n, r]) => [n, { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) }])); });
const trees = (page) => page.evaluate(() => {
  const s = window.__mt.getState();
  const nm = (t) => (typeof t === 'string' ? (s.sessions.get(t) || { name: t }).name : { dir: t.dir, kids: t.kids.map(nm), ratios: t.ratios.map((r) => Math.round(r * 1000) / 1000) });
  return [...s.docks.values()].map((d) => ({ dockId: d.dockId, tree: nm(d.tree) }));
});
const bboxOf = (rs) => { const x0 = Math.min(...rs.map((r) => r.x)), y0 = Math.min(...rs.map((r) => r.y)); return { x: x0, y: y0, w: Math.max(...rs.map((r) => r.x + r.w)) - x0, h: Math.max(...rs.map((r) => r.y + r.h)) - y0 }; };
const outerOf = async (page) => { const r = await rects(page); return bboxOf(NAMES.filter((n) => r[n]).map((n) => r[n])); };
const tiled = (rs) => {
  const a = rs.reduce((x, r) => x + r.w * r.h, 0);
  const b = bboxOf(rs);
  return a === b.w * b.h && !rs.some((p, i) => rs.some((q, j) => j > i && p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h));
};
// 판 좌표 → 화면 좌표(React Flow가 실제로 그린 변환)
const toScreen = (page, p) => page.evaluate((pt) => {
  const r = document.querySelector('.mt-canvas').getBoundingClientRect();
  const m = new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.react-flow__viewport')).transform);
  return { x: r.left + m.e + pt.x * m.a, y: r.top + m.f + pt.y * m.a, zoom: m.a };
}, p);
async function frame(page, rect, margin = 200) {
  await page.evaluate(([r, m]) => window.__mt.getState().navigateToRect({ x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.h + 2 * m }, 0), [rect, margin]);
  await sleep(600);
}
// 판 사각형의 가운데를 화면 가운데에 두고 배율 zoom으로
async function zoomOn(page, rect, zoom) {
  await page.evaluate(([r, z]) => { const el = document.querySelector('.mt-canvas'); window.__mt.getState().setViewport({ x: el.clientWidth / 2 - (r.x + r.w / 2) * z, y: el.clientHeight / 2 - (r.y + r.h / 2) * z, zoom: z }); }, [rect, zoom]);
  await sleep(700);
}
// 화면 점 p에서 (dx, dy) 화면 px만큼 끈다
async function dragAt(page, p, dx, dy, steps = 10) {
  await page.mouse.move(p.x, p.y); await sleep(120);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) { await page.mouse.move(p.x + (dx * i) / steps, p.y + (dy * i) / steps); await sleep(16); }
  await page.mouse.up(); await sleep(1300);
}
// 화면 점에 무엇이 있는가(맨 위 요소)
const hitAt = (page, p) => page.evaluate((pt) => { const e = document.elementFromPoint(pt.x, pt.y); if (!e) return null; const c = e.closest('[data-role], .mt-divider, .mt-node'); return c ? { cls: String(c.className).slice(0, 60), role: c.dataset.role || null, side: c.dataset.side || null, path: c.dataset.path ?? null } : { cls: String(e.className).slice(0, 60) }; }, p);
async function ctrlClick(page, name) {
  const head = await page.locator(`.mt-node[data-name="${name}"] .mt-node-head`).boundingBox();
  await page.keyboard.down('Control');
  await page.mouse.click(head.x + Math.min(120, head.width / 3), head.y + head.height / 2);
  await page.keyboard.up('Control');
  await sleep(250);
}
// P26: 크기 단추는 토글한 쪽의 셋만 보인다. 없으면 그 쪽으로 토글한 뒤 누른다
async function clickSize(page, k) {
  if (!(await page.$(`[data-role=selection] [data-size="${k}"]`))) { await page.click(`[data-role=selection] [data-role=size-dir] [data-dir="${k.split('-')[0]}"]`); await sleep(1500); }
  await page.click(`[data-role=selection] [data-size="${k}"]`);
}
const clearSel = (page) => page.evaluate(() => { const s = window.__mt.getState(); if (s.clearSelection) s.clearSelection(); });
async function reset(page, base) {
  for (const d of await call(page, 'dock.list')) await call(page, 'dock.remove', { dock: d.dockId });
  for (const l of await call(page, 'link.list').catch(() => [])) if (!l.removedAt) await call(page, 'link.delete', { link: l.linkId, confirm: true }).catch(() => {});
  // 셸 사이 연결의 알림(역할, 끊김)은 셸에 보내지 않고 거둔다(전달 목록이 화면 아래를 가리지 않게)
  for (const n of NAMES) for (const d of await call(page, 'delivery.list', { session: n, limit: 50 }).catch(() => [])) if (d.status === 'queued' || d.status === 'pending') await call(page, 'delivery.cancel', { deliveryId: d.deliveryId }).catch(() => {});
  const at = { s1: [0, 0], s2: [900, 0], s3: [0, 700], s4: [900, 700] };
  for (const n of NAMES) { const id = await sid(page, n); if (id) await call(page, 'board.setNode', { session: id, x: base.x + at[n][0], y: base.y + at[n][1], w: 720, h: 460, z: 0, cause: 'p23 test reset' }); }
  await page.evaluate(() => { window.__mt.api.emit('board.changed', { why: 'p23 test reset' }); });
  await clearSel(page);
  await sleep(900);
  await frame(page, { x: base.x, y: base.y, w: 1620, h: 1160 }, 260);
}
// 2 × 2 덩어리(칸마다 720×460)
async function grid(page, base) {
  await reset(page, base);
  await call(page, 'dock.layout', { members: await Promise.all(NAMES.map((n) => sid(page, n))), preset: 'grid' });
  await sleep(1200);
  await frame(page, await outerOf(page), 200);
}
// 요소의 ::after 배경색
const afterBg = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return e ? getComputedStyle(e, '::after').backgroundColor : null; }, sel);
const ACCENT = 'rgb(28, 182, 109)';

let { app, page } = await launch({ log });
try {
  if (await page.$('[data-role="sidebar"]')) await page.click('[data-action="sidebar"]');
  for (const n of NAMES) if (!(await sid(page, n))) await call(page, 'session.spawn', { cwd: DIRS.ws, kind: 'shell', name: n });
  await until(async () => (await Promise.all(NAMES.map((n) => sid(page, n)))).every(Boolean), 40000, 500);
  await sleep(2000);
  const base = (await rects(page)).s1;
  log('기준 자리(s1)', base);

  // 1) 고른 노드 막대: 그룹 단추 없음, 가로·세로 크기 두 줄, 배치 틀 도형
  await reset(page, base);
  for (const n of NAMES) await ctrlClick(page, n);
  await page.waitForSelector('[data-role=selection]');
  const bar = await page.evaluate(() => {
    const el = document.querySelector('[data-role=selection]');
    return {
      group: !!el.querySelector('[data-action=group-selected], [data-action=ungroup-selected]'),
      dirs: [...el.querySelectorAll('[data-role=size-dir] [data-dir]')].map((b) => b.dataset.dir),
      sizes: [...el.querySelectorAll('[data-size]')].map((b) => b.dataset.size),
      presets: [...el.querySelectorAll('[data-preset]')].map((b) => ({ id: b.dataset.preset, rects: b.querySelectorAll('svg rect').length, text: b.textContent.trim(), title: b.title })),
    };
  });
  const want = { grid: 4, 'main-left-3': 4, 'main-right-3': 4, 'main-top-3': 4, row: 4, col: 4 }; // P26: 넷을 고르면 넷짜리 틀만
  step('막대에 그룹 단추가 없다', !bar.group, {});
  step('크기(P26): 가로|세로 토글 하나와 크게·보통·작게 셋', bar.dirs.join() === 'wide,tall' && bar.sizes.join() === 'wide-large,wide-normal,wide-small', { dirs: bar.dirs, sizes: bar.sizes });
  step('배치 틀: 글자 없이 사각형 도형(칸 수가 틀과 같다), 풀이 글이 있다', bar.presets.length === 6 && bar.presets.every((p) => p.rects === want[p.id] && p.text === '' && p.title.length > 6), { presets: bar.presets });
  await shot(page, 'p23-1-1-selection-bar', log);
  await page.locator('[data-role=selection]').screenshot({ path: path.join(OUT, 'p23-1-2-selection-bar-crop.png') });

  // 2) 혼자인 노드의 크기(고른 둘 모두)
  await clickSize(page, 'tall-normal');
  await sleep(1500);
  let r = await rects(page);
  step('혼자인 노드는 그 노드가 그 크기(세로 보통 600×920)', NAMES.every((n) => r[n].w === 600 && r[n].h === 920), { s1: r.s1, s4: r.s4 });

  // 3) 덩어리 크기 여섯: 2 × 2 덩어리의 노드 하나만 골라도 덩어리 전체 바깥이 그 크기
  await grid(page, base);
  await ctrlClick(page, 's2');
  for (const [k, [w, h]] of Object.entries(SIZES)) {
    await clickSize(page, k);
    await sleep(1500);
    const o = await outerOf(page);
    r = await rects(page);
    step(`막대 크기 ${k}: 덩어리 바깥 ${w}×${h}, 비율 그대로(2 × 2 고르게)`, o.w === w && o.h === h && tiled(NAMES.map((n) => r[n])) && Math.abs(r.s1.w - r.s2.w) <= 1 && Math.abs(r.s1.h - r.s3.h) <= 1, { outer: o });
    await frame(page, o, 120);
    await shot(page, `p23-2-size-${k}`, log);
    if (!(await page.$('[data-role=selection]'))) await ctrlClick(page, 's2');
  }
  await clearSel(page);

  // 4) 붙은 노드 테두리 끌기
  await grid(page, base);
  let o = await outerOf(page);
  r = await rects(page);
  // 4-1 안쪽: s1의 오른쪽 테두리(이웃 s2와 맞닿음) = 위 줄 분할선
  let p = await toScreen(page, { x: r.s1.x + r.s1.w, y: r.s1.y + r.s1.h / 2 });
  let hit = await hitAt(page, { x: p.x + 3, y: p.y });
  await page.mouse.move(p.x + 3, p.y); await sleep(250);
  const hoverDiv = await afterBg(page, '.mt-divider[data-path="0"][data-index="0"]:hover');
  await shot(page, 'p23-3-1-inner-edge-hover', log);
  await dragAt(page, { x: p.x + 3, y: p.y }, 100, 0);
  let r2 = await rects(page);
  step('안쪽 테두리(s1 오른쪽) 끌기: 그 사이 분할선이 움직인다(s1 넓어지고 s2 좁아짐, 아래 줄 그대로), 올리면 초록', hit && /mt-divider/.test(hit.cls) && r2.s1.w > r.s1.w + 60 && r2.s1.w + r2.s2.w === r.s1.w + r.s2.w && r2.s3.w === r.s3.w && hoverDiv === ACCENT, { hit, hoverDiv, s1: r2.s1, s2: r2.s2 });
  await shot(page, 'p23-3-2-inner-edge-dragged', log);
  // 4-2 바깥: s2의 오른쪽 테두리를 밖으로
  r = r2; o = await outerOf(page);
  p = await toScreen(page, { x: r.s2.x + r.s2.w, y: r.s2.y + r.s2.h / 2 });
  hit = await hitAt(page, { x: p.x - 3, y: p.y });
  await page.mouse.move(p.x - 3, p.y); await sleep(250);
  const hoverEdge = await afterBg(page, '[data-role=dock-edge][data-side=right]:hover');
  await shot(page, 'p23-3-3-outer-edge-hover', log);
  await dragAt(page, { x: p.x - 3, y: p.y }, 120, 0);
  r2 = await rects(page);
  let o2 = await outerOf(page);
  step('바깥 테두리(s2 오른쪽) 끌기: 오른쪽으로 덩어리가 커지고 s1은 그대로, 아래 줄은 비율대로', hit && hit.role === 'dock-edge' && hit.side === 'right' && o2.w > o.w + 80 && o2.x === o.x && r2.s1.w === r.s1.w && r2.s2.w > r.s2.w + 80 && tiled(NAMES.map((n) => r2[n])) && hoverEdge === ACCENT, { hit, hoverEdge, before: o, after: o2, s1: r2.s1, s2: r2.s2 });
  await shot(page, 'p23-3-4-outer-edge-right', log);
  // 4-3 바깥: s3의 아래 테두리를 안으로(줄이기), s1의 왼쪽을 밖으로
  r = r2; o = o2;
  await frame(page, { ...o, h: o.h + 700 }, 150); // 아래 테두리가 아래쪽 칩 줄·명령 바·전달 목록(.mt-deliveries)에 가리지 않게 덩어리를 화면 위쪽에
  p = await toScreen(page, { x: r.s3.x + r.s3.w / 2, y: r.s3.y + r.s3.h });
  const hitB = await hitAt(page, { x: p.x, y: p.y - 3 });
  await dragAt(page, { x: p.x, y: p.y - 3 }, 0, -80);
  r2 = await rects(page); o2 = await outerOf(page);
  const shrinkOk = o2.h < o.h - 40 && o2.y === o.y && r2.s1.h === r.s1.h && r2.s3.h < r.s3.h - 40;
  p = await toScreen(page, { x: r2.s1.x, y: r2.s1.y + r2.s1.h / 2 });
  const hitL = await hitAt(page, { x: p.x + 3, y: p.y });
  log('바깥 테두리 아래·왼쪽 잡은 것', { hitB, hitL });
  const o3b = o2, r3b = r2;
  await dragAt(page, { x: p.x + 3, y: p.y }, -90, 0);
  r2 = await rects(page); o2 = await outerOf(page);
  step('바깥 테두리: s3 아래를 안으로 끌면 덩어리가 줄고(위 줄 그대로), s1 왼쪽을 밖으로 끌면 왼쪽으로 커진다(오른쪽 칸 그대로)', shrinkOk && o2.x < o3b.x - 50 && o2.x + o2.w === o3b.x + o3b.w && r2.s2.w === r3b.s2.w && r2.s1.w > r3b.s1.w + 50 && tiled(NAMES.map((n) => r2[n])), { shrinkOk, before: o3b, after: o2 });
  await frame(page, o2, 160);
  await shot(page, 'p23-3-5-outer-edges', log);
  // 저장과 같은가
  const stored = await call(page, 'dock.list');
  const local = await page.evaluate(() => [...window.__mt.getState().docks.values()][0].tree);
  step('끈 결과가 저장된다(dock.list의 나무와 창의 나무가 같다)', JSON.stringify(stored[0].tree) === JSON.stringify(local), {});

  // 5) 배율 0.3·1에서 분할선 잡기: 잡는 띠가 화면 8px 안팎, 선에서 3px 떨어진 곳을 잡아도 끈다
  for (const z of [0.3, 1]) {
    await grid(page, base);
    o = await outerOf(page);
    await zoomOn(page, o, z);
    r = await rects(page);
    const sel = '.mt-divider[data-path=""][data-index="0"]'; // 위아래 줄 사이 가로선
    const box = await page.locator(sel).boundingBox();
    p = await toScreen(page, { x: r.s3.x + r.s3.w / 4, y: r.s3.y });
    hit = await hitAt(page, { x: p.x, y: p.y + 3 });
    await page.mouse.move(p.x, p.y + 3); await sleep(250);
    const hov = await afterBg(page, `${sel}:hover`);
    await shot(page, `p23-4-zoom-${z}-hover`, log);
    await dragAt(page, { x: p.x, y: p.y + 3 }, 0, 40);
    r2 = await rects(page);
    const moved = r2.s1.h - r.s1.h;
    step(`배율 ${z}: 분할선 잡는 띠가 화면 약 8px, 선 옆 3px을 잡아도 끈다(올리면 초록)`, box && Math.abs(box.height - 8) <= 1.5 && hit && /mt-divider/.test(hit.cls) && hit.path === '' && Math.abs(moved - Math.round(40 / z)) <= 3 && hov === ACCENT, { thick: box && +box.height.toFixed(2), hit, moved, want: Math.round(40 / z), hov });
    await shot(page, `p23-4-zoom-${z}-dragged`, log);
  }

  // 6) 엇갈리는 점 손잡이와 두 번 눌러 반반
  await grid(page, base);
  r = await rects(page);
  const jn = await page.$$('[data-role=dock-junction]');
  const jb = jn.length ? await jn[0].boundingBox() : null;
  p = jb ? { x: jb.x + jb.width / 2, y: jb.y + jb.height / 2 } : null;
  hit = p ? await hitAt(page, p) : null;
  if (p) { await page.mouse.move(p.x, p.y); await sleep(250); }
  await shot(page, 'p23-5-1-junction-hover', log);
  const zj = (await toScreen(page, { x: 0, y: 0 })).zoom;
  if (p) await dragAt(page, p, 80, 50);
  r2 = await rects(page);
  const jdx = r2.s1.w - r.s1.w, jdy = r2.s1.h - r.s1.h;
  step('엇갈리는 점: 2 × 2 가운데에 손잡이 하나, 끌면 세로선 둘과 가로선이 같이 움직인다', jn.length === 1 && hit && hit.role === 'dock-junction' && Math.abs(jdx - 80 / zj) <= 3 && Math.abs(jdy - 50 / zj) <= 3 && r2.s3.w === r2.s1.w && r2.s2.h === r2.s1.h && tiled(NAMES.map((n) => r2[n])), { n: jn.length, hit, jdx, jdy, zoom: zj });
  await shot(page, 'p23-5-2-junction-dragged', log);
  // 위 줄 세로선만 따로 옮기면 엇갈리지 않는다(손잡이 없음)
  r = r2;
  p = await toScreen(page, { x: r.s1.x + r.s1.w, y: r.s1.y + r.s1.h / 2 });
  await dragAt(page, { x: p.x, y: p.y }, -60, 0);
  const jn2 = (await page.$$('[data-role=dock-junction]')).length;
  // 두 번 누르기: 위 줄 세로선 → s1 = s2
  r = await rects(page);
  p = await toScreen(page, { x: r.s1.x + r.s1.w, y: r.s1.y + r.s1.h / 3 });
  await page.mouse.dblclick(p.x, p.y); await sleep(1500);
  r2 = await rects(page);
  const evenRow = Math.abs(r2.s1.w - r2.s2.w) <= 1 && r2.s3.w === r.s3.w;
  await shot(page, 'p23-5-3-divider-dblclick-even', log);
  step('위 줄 세로선만 옮기면 엇갈리는 점이 없어지고, 그 선을 두 번 누르면 그 두 칸이 반반', r.s1.w !== r.s3.w && jn2 === 0 && evenRow, { jn2, s1: r2.s1.w, s2: r2.s2.w, s3: r2.s3.w });
  // 엇갈리는 점 두 번 누르기: 다시 맞춘 뒤 옮기고 두 번 → 모두 반반
  await grid(page, base);
  const jb2 = await page.locator('[data-role=dock-junction]').first().boundingBox();
  p = { x: jb2.x + jb2.width / 2, y: jb2.y + jb2.height / 2 };
  await dragAt(page, p, 70, -40);
  const jb3 = await page.locator('[data-role=dock-junction]').first().boundingBox();
  await page.mouse.dblclick(jb3.x + jb3.width / 2, jb3.y + jb3.height / 2); await sleep(1500);
  r2 = await rects(page);
  step('엇갈리는 점을 두 번 누르면 가로·세로 모두 반반', NAMES.every((n) => Math.abs(r2[n].w - 720) <= 1 && Math.abs(r2[n].h - 460) <= 1), { rects: r2 });

  // 7) 덩어리 안 점끼리 잇기와 겹친 선
  await grid(page, base);
  const dots = () => page.evaluate(() => [...document.querySelectorAll('.mt-node.docked .mt-handle.h-c')].map((h) => ({ name: h.closest('.mt-node').dataset.name, op: +getComputedStyle(h).opacity, pe: getComputedStyle(h).pointerEvents })));
  let ds = await dots();
  const overlay0 = await page.$$('[data-role=dock-links]');
  step('연결이 없으면 점이 보이지 않고 겹친 선도 없다', ds.length === 4 && ds.every((d) => d.op === 0 && d.pe === 'none') && overlay0.length === 0, { dots: ds });
  await shot(page, 'p23-6-1-no-links-no-dots', log);
  await page.click('[data-action=link-mode]'); await sleep(500);
  ds = await dots();
  const linkModeDots = ds.every((d) => d.op > 0.5 && d.pe !== 'none');
  await shot(page, 'p23-6-2-link-mode-dots', log);
  const from = await page.locator('.mt-node[data-name="s1"] .mt-handle.h-c').boundingBox();
  const to = await page.locator('.mt-node[data-name="s4"] .mt-handle.h-c').boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2); await sleep(150);
  await page.mouse.down();
  for (let i = 1; i <= 14; i++) { await page.mouse.move(from.x + from.width / 2 + ((to.x - from.x) * i) / 14, from.y + from.height / 2 + ((to.y - from.y) * i) / 14); await sleep(20); }
  await sleep(200);
  await shot(page, 'p23-6-3-dragging-dot', log);
  await page.mouse.up(); await sleep(700);
  const roleDlg = await page.$('[data-role=link-role]');
  if (roleDlg) { await page.fill('[data-role=link-role] [data-field=role]', 'p23 리뷰'); await page.click('[data-action=link-submit]'); await sleep(1500); }
  step('잇기 모드에서 s1 점을 끌어 s4 점에 놓으면 역할을 묻고 잇는다', linkModeDots && !!roleDlg, { dots: ds });
  await page.click('[data-action=link-mode]'); await sleep(600);
  ds = await dots();
  const lines = await page.evaluate(() => [...document.querySelectorAll('[data-role=dock-links] .mt-dl')].map((g) => g.dataset.link));
  const plain = await page.evaluate((ls) => ls.filter((id) => document.querySelector(`.react-flow__edge[data-id="${id}"], .react-flow__edge[data-testid="rf__edge-${id}"]`)).length, lines);
  const overStyle = await page.evaluate(() => { const l = document.querySelector('[data-role=dock-links] .mt-dl-line'); const n = document.querySelector('.react-flow__node-docklinks'); return l ? { op: +getComputedStyle(l).opacity, casing: !!document.querySelector('[data-role=dock-links] .mt-dl-casing'), z: n && +getComputedStyle(n).zIndex } : null; });
  step('덩어리 안 연결은 두 점을 잇는 겹친 선(P26: 진한 색에 어두운 테두리, 세션 위), 일반 선은 없다, 점은 연결이 있으면 보인다', lines.length === 1 && plain === 0 && overStyle && overStyle.op >= 0.9 && overStyle.casing && overStyle.z >= 1000 && ds.every((d) => d.op > 0 && d.pe === 'none'), { lines, plain, overStyle, dots: ds });
  await shot(page, 'p23-6-4-overlay-line', log);
  // 선의 글을 누르면 오간 기록
  await page.click('[data-role=dock-links] .mt-dl-label'); await sleep(800);
  const panel = await page.$('[data-role=link-panel]');
  await shot(page, 'p23-6-5-link-panel', log);
  step('겹친 선의 글을 누르면 오간 기록과 끊기', !!panel, {});
  if (panel) { await page.click('[data-action=unlink]'); await sleep(500); if (await page.$('[data-action=unlink-confirm]')) await page.click('[data-action=unlink-confirm]'); await sleep(1500); }
  ds = await dots();
  const overlay1 = await page.$$('[data-role=dock-links]');
  step('끊으면 점과 겹친 선이 다시 보이지 않는다', ds.every((d) => d.op === 0) && overlay1.length === 0, { dots: ds });
  // 덩어리 밖 노드와의 연결은 지금 선 그대로: s4를 떼고 s1 → s4
  await call(page, 'dock.remove', { session: await sid(page, 's4'), x: base.x + 1700, y: base.y });
  await sleep(1000);
  const l2 = await call(page, 'link.create', { from: await sid(page, 's1'), to: await sid(page, 's4'), role: 'p23 밖' });
  await sleep(1200);
  const outEdge = await page.evaluate((id) => !!document.querySelector(`.react-flow__edge[data-id="${id}"], .react-flow__edge[data-testid="rf__edge-${id}"]`), l2.link.linkId);
  const overlay2 = await page.$$('[data-role=dock-links]');
  await frame(page, await outerOf(page), 160);
  await shot(page, 'p23-6-6-outside-link-plain-edge', log);
  step('덩어리 밖 노드와의 연결은 일반 선 그대로(겹친 선 없음)', outEdge && overlay2.length === 0, { outEdge });
  await call(page, 'link.delete', { link: l2.link.linkId, confirm: true });
  await reset(page, base);
} catch (e) {
  log('오류', e.stack || String(e));
  step('시험이 끝까지 돈다', false, { error: String(e).slice(0, 300) });
} finally { await closeApp(app); }
result.ok = result.steps.every((x) => x.ok);
writeJson('p23-dock.json', result);
log(result.ok ? `모두 통과 ${result.steps.length}/${result.steps.length}` : `실패 ${result.steps.filter((x) => !x.ok).map((x) => x.name).join(', ')}`);
process.exit(result.ok ? 0 : 1);
