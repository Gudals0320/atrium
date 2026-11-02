// P26 창 시험: 덩어리 안 연결선(진한 색과 어두운 테두리, 밝은 셸 화면 위), 초점 세션의 선은 테두리 가운데에서, 눌러서 보기(머리줄·본문·멀리·아이콘 얼굴,
// 85% 채우기, 이미 보면 그대로), 고른 노드 막대(맨 위 줄, 가로|세로 토글, 불 들어오는 크기 단추, 세션 수 2·3·4·6마다 다른 틀)를 본다.
// 판: herdr 세션 atrium-dev-p26, 포트 47845, backend/.dev(experiments/p26/tools/env.cjs). 시험 폴더는 새로 만든 C:\Workspace\mtask-p26-ws 하나, 셸만 띄운다.
// 사용: node experiments/p26/tools/e2e.cjs p26-dock.mjs
import fs from 'node:fs';
import path from 'node:path';
import { launch, closeApp, shot, logger, sleep, until, call, writeJson, DIRS, DEV, OUT } from './p10-lib.mjs';

if (process.env.MT_E2E_BOARD !== 'p26') throw new Error('MT_E2E_BOARD=p26으로 돌린다(experiments/p26/tools/e2e.cjs)');
const log = logger('p26-dock');
const result = { steps: [] };
const step = (name, ok, data = {}) => { result.steps.push({ name, ok: !!ok, ...data }); log(`${ok ? '통과' : '실패'}: ${name}`, data); };
for (const d of [DIRS.ws, path.join(DEV, 'fixture-projects-p26'), path.join(DEV, 'fixture-sessions-p26')]) fs.mkdirSync(d, { recursive: true });
const NAMES = ['s1', 's2', 's3', 's4', 's5', 's6'];
const AT = { s1: [0, 0], s2: [900, 0], s3: [0, 700], s4: [900, 700], s5: [1800, 0], s6: [1800, 700] };

// ---------- 창 안의 값 ----------
const sid = (page, name) => page.evaluate((n) => { const s = [...window.__mt.getState().sessions.values()].find((x) => x.name === n); return s ? s.sessionId : null; }, name);
const rects = (page) => page.evaluate(() => { const s = window.__mt.getState(); return Object.fromEntries([...s.sessions.values()].map((x) => [x.name, s.nodes.get(x.sessionId)]).filter(([, r]) => r).map(([n, r]) => [n, { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) }])); });
const bboxOf = (rs) => { const x0 = Math.min(...rs.map((r) => r.x)), y0 = Math.min(...rs.map((r) => r.y)); return { x: x0, y: y0, w: Math.max(...rs.map((r) => r.x + r.w)) - x0, h: Math.max(...rs.map((r) => r.y + r.h)) - y0 }; };
// 지금 화면 변환(React Flow가 실제로 그린 것)과 캔버스 크기
const vp = (page) => page.evaluate(() => {
  const el = document.querySelector('.mt-canvas');
  const m = new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.react-flow__viewport')).transform);
  const r = el.getBoundingClientRect();
  return { x: m.e, y: m.f, zoom: m.a, W: el.clientWidth, H: el.clientHeight, left: r.left, top: r.top };
});
// 판 사각형이 화면에서 차지하는 자리(캔버스 기준)
const onScreen = (v, r) => ({ x: r.x * v.zoom + v.x, y: r.y * v.zoom + v.y, w: r.w * v.zoom, h: r.h * v.zoom });
const fills = (v, r) => { const s = onScreen(v, r); return { fw: +(s.w / v.W).toFixed(3), fh: +(s.h / v.H).toFixed(3), inside: s.x >= -2 && s.y >= -2 && s.x + s.w <= v.W + 2 && s.y + s.h <= v.H + 2 }; };
// 85% 채우기: 너비나 높이 중 하나가 85%(±2%)이고 다 보이거나, 배율이 상한(1)
const filled85 = (v, r) => { const f = fills(v, r); return f.inside && (Math.abs(f.fw - 0.85) <= 0.02 || Math.abs(f.fh - 0.85) <= 0.02 || Math.abs(v.zoom - 1) < 0.01); };
async function setView(page, rect, zoom) {
  await page.evaluate(([r, z]) => { const el = document.querySelector('.mt-canvas'); window.__mt.getState().setViewport({ x: el.clientWidth / 2 - (r.x + r.w / 2) * z, y: el.clientHeight / 2 - (r.y + r.h / 2) * z, zoom: z }); }, [rect, zoom]);
  await sleep(800);
}
async function frame(page, rect, margin = 200) {
  await page.evaluate(([r, m]) => window.__mt.getState().navigateToRect({ x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.h + 2 * m }, 0), [rect, margin]);
  await sleep(700);
}
async function ctrlClick(page, name) {
  const head = await page.locator(`.mt-node[data-name="${name}"] .mt-node-head`).boundingBox();
  await page.keyboard.down('Control');
  await page.mouse.click(head.x + Math.min(120, head.width / 3), head.y + head.height / 2);
  await page.keyboard.up('Control');
  await sleep(250);
}
const clearSel = (page) => page.evaluate(() => { const s = window.__mt.getState(); if (s.clearSelection) s.clearSelection(); });
async function reset(page, base) {
  for (const d of await call(page, 'dock.list')) await call(page, 'dock.remove', { dock: d.dockId });
  for (const l of await call(page, 'link.list').catch(() => [])) if (!l.removedAt) await call(page, 'link.delete', { link: l.linkId, confirm: true }).catch(() => {});
  await dropDeliveries(page);
  for (const n of NAMES) { const id = await sid(page, n); if (id) await call(page, 'board.setNode', { session: id, x: base.x + AT[n][0], y: base.y + AT[n][1], w: 720, h: 460, z: 0, cause: 'p26 test reset' }); }
  await page.evaluate(() => { window.__mt.api.emit('board.changed', { why: 'p26 test reset' }); });
  await clearSel(page);
  await sleep(900);
  await frame(page, { x: base.x, y: base.y, w: 2520, h: 1160 }, 200);
}
// 셸 사이 연결의 알림(역할, 끊김)은 셸에 보내지 않고 거둔다
async function dropDeliveries(page) {
  for (const n of NAMES) for (const d of await call(page, 'delivery.list', { session: n, limit: 50 }).catch(() => [])) if (d.status === 'queued' || d.status === 'pending') await call(page, 'delivery.cancel', { deliveryId: d.deliveryId }).catch(() => {});
}
const barInfo = (page) => page.evaluate(() => {
  const el = document.querySelector('[data-role=selection]');
  if (!el) return null;
  const box = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), r: Math.round(r.right), b: Math.round(r.bottom) }; };
  return {
    row: el.dataset.row, level: +el.dataset.compact, bar: box(el), tl: box(document.querySelector('[data-role=top-left]')), tr: box(document.querySelector('[data-role=top-right]')),
    pill: box(document.querySelector('[data-role=top-right] .mt-cp')),
    dir: [...el.querySelectorAll('[data-role=size-dir] [data-dir]')].map((b) => ({ dir: b.dataset.dir, on: b.classList.contains('on') })),
    sizes: [...el.querySelectorAll('[data-size]')].map((b) => ({ k: b.dataset.size, on: b.classList.contains('on'), text: b.textContent })),
    presets: [...el.querySelectorAll('[data-preset]')].map((b) => ({ id: b.dataset.preset, rects: b.querySelectorAll('svg rect').length, title: b.title.split('\n')[0] })),
    count: +(el.querySelector('[data-role=presets]') || {}).dataset?.count,
  };
});
const cropBar = async (page, name) => { const el = await page.$('[data-role=selection]'); if (el) await el.screenshot({ path: path.join(OUT, `${name}.png`) }); };
// 가장 줄인 막대(단계 3)면 접은 배치 틀을 펼친다
async function openPresets(page) { if (await page.isVisible('[data-role=selection] [data-action=layout-more]')) { if (!(await page.isVisible('[data-role=selection] [data-role=presets]'))) await page.click('[data-role=selection] [data-action=layout-more]'); await sleep(300); return true; } return false; }
// 셸 화면을 흰 바탕으로 채운다(밝은 셸 화면 위에서 선이 보이는지 보려고). 터미널을 눌러 들어간 뒤 친다
async function paintWhite(page, name) {
  await page.locator(`.mt-node[data-name="${name}"] .mt-node-body`).click({ position: { x: 60, y: 60 } });
  await sleep(1500);
  await page.keyboard.type("cls; 1..30 | % { Write-Host (' ' * 160) -BackgroundColor White }", { delay: 4 });
  await page.keyboard.press('Enter');
  await sleep(1500);
}
const dlInfo = (page) => page.evaluate(() => {
  const root = document.querySelector('[data-role=dock-links]');
  if (!root) return null;
  return {
    focus: root.dataset.focus || null,
    lines: [...root.querySelectorAll('.mt-dl')].map((g) => {
      const line = g.querySelector('.mt-dl-line'), casing = g.querySelector('.mt-dl-casing');
      const cs = getComputedStyle(line), cc = casing ? getComputedStyle(casing) : null;
      return { link: g.dataset.link, anchored: g.dataset.anchored || null, a: [+g.dataset.ax, +g.dataset.ay], b: [+g.dataset.bx, +g.dataset.by], stroke: cs.stroke, op: +cs.opacity, width: +line.getAttribute('stroke-width'), casing: cc ? { stroke: cc.stroke, width: +casing.getAttribute('stroke-width') } : null, start: !!g.querySelector('.mt-dl-start') };
    }),
  };
});
const ROLE_BLUE = 'rgb(122, 167, 240)';
// 테두리 가운데(lib/dock-links.js borderAnchor와 같은 셈)
const anchor = (r, p) => {
  const c = { x: r.x + r.w / 2, y: r.y + r.h / 2 }, dx = p.x - c.x, dy = p.y - c.y;
  if (Math.abs(dx) * r.h >= Math.abs(dy) * r.w) return dx >= 0 ? [r.x + r.w, c.y] : [r.x, c.y];
  return dy >= 0 ? [c.x, r.y + r.h] : [c.x, r.y];
};
const center = (r) => [r.x + r.w / 2, r.y + r.h / 2];
const near = (p, q, tol = 2) => Math.abs(p[0] - q[0]) <= tol && Math.abs(p[1] - q[1]) <= tol;

let { app, page } = await launch({ log });
try {
  if (await page.$('[data-role="sidebar"]')) await page.click('[data-action="sidebar"]');
  for (const n of NAMES) if (!(await sid(page, n))) await call(page, 'session.spawn', { cwd: DIRS.ws, kind: 'shell', name: n });
  await until(async () => (await Promise.all(NAMES.map((n) => sid(page, n)))).every(Boolean), 60000, 500);
  await sleep(2500);
  const base = (await rects(page)).s1;
  log('기준 자리(s1)', base);

  // 1) 막대 자리와 크기 단추
  await reset(page, base);
  await ctrlClick(page, 's1'); await ctrlClick(page, 's2');
  await page.waitForSelector('[data-role=selection]');
  await sleep(500);
  let b = await barInfo(page);
  step('막대는 위 알약 묶음과 같은 맨 위 줄에 있고 두 묶음과 겹치지 않는다(좁으면 단계별로 줄인다)', b.row === 'top' && Math.abs(b.bar.y - b.tl.y) <= 3 && Math.abs(b.bar.h - b.pill.h) <= 3 && b.bar.x >= b.tl.r && b.bar.r <= b.tr.x, { level: b.level, bar: b.bar, tl: b.tl, tr: b.tr, pill: b.pill });
  step('크기: 가로|세로 토글 하나와 크게·보통·작게 셋, 720×460 둘이면 불 없음', b.dir.length === 2 && b.sizes.length === 3 && b.sizes.every((x) => !x.on) && b.dir.find((x) => x.on).dir === 'wide', { dir: b.dir, sizes: b.sizes });
  await page.click('[data-role=selection] [data-size="wide-normal"]'); await sleep(1500);
  b = await barInfo(page);
  let r = await rects(page);
  step('가로 보통을 누르면 둘 다 1040×585이고 그 단추에 불', r.s1.w === 1040 && r.s1.h === 585 && r.s2.w === 1040 && b.sizes.find((x) => x.on)?.k === 'wide-normal', { sizes: b.sizes, s1: r.s1 });
  await shot(page, 'p26-1-1-bar-top-lit', log);
  await cropBar(page, 'p26-1-2-bar-crop-wide-normal');
  await page.click('[data-role=selection] [data-role=size-dir] [data-dir="tall"]'); await sleep(1600);
  b = await barInfo(page);
  r = await rects(page);
  step('세로로 토글하면 같은 단계(보통)의 세로 크기 600×920이 되고 세로 보통에 불', r.s1.w === 600 && r.s1.h === 920 && b.dir.find((x) => x.on).dir === 'tall' && b.sizes.find((x) => x.on)?.k === 'tall-normal', { dir: b.dir, sizes: b.sizes, s1: r.s1 });
  await cropBar(page, 'p26-1-3-bar-crop-tall-normal');
  // 좁은 창: 자리가 모자라면 아래 줄로 접는다
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1000, 800)); await sleep(1200);
  const narrow = await barInfo(page);
  await shot(page, 'p26-1-4-narrow-window', log);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1584, 921)); await sleep(1200);
  const wide = await barInfo(page);
  step('좁은 창에서는 막대가 두 묶음과 겹치지 않게 접히고(아래 줄이나 사이에), 넓히면 맨 위 줄로 돌아온다', (narrow.row === 'below' ? narrow.bar.y > narrow.tl.b : narrow.bar.x >= narrow.tl.r && narrow.bar.r <= narrow.tr.x) && wide.row === 'top', { narrow: { row: narrow.row, bar: narrow.bar, tl: narrow.tl, tr: narrow.tr }, wide: { row: wide.row, bar: wide.bar } });

  // 2) 세션 수 2·3·4·6마다 다른 틀
  const per = {};
  for (const n of [2, 3, 4, 6]) {
    await reset(page, base);
    for (const name of NAMES.slice(0, n)) await ctrlClick(page, name);
    await sleep(500);
    b = await barInfo(page);
    per[n] = b.presets;
    per[n].level = b.level;
    await cropBar(page, `p26-2-presets-${n}-bar`);
    const folded = await openPresets(page);
    const pe = await page.$('[data-role=selection] [data-role=presets]');
    if (pe) await pe.screenshot({ path: path.join(OUT, `p26-2-presets-${n}.png`) });
    log(`세션 ${n}: 막대 단계 ${b.level}, 틀 ${folded ? '접어 펼침' : '막대 안'}`);
  }
  const sig = (n) => per[n].map((p) => p.id).join(',');
  step('틀: 세션 수 2·3·4·6마다 틀 모음이 다르고, 도형의 칸 수가 세션 수와 같고, 풀이 글이 있다',
    new Set([2, 3, 4, 6].map(sig)).size === 4 && [2, 3, 4, 6].every((n) => per[n].length >= 4 && per[n].every((p) => p.rects === n && p.title.length > 1)),
    { per: Object.fromEntries(Object.entries(per).map(([n, ps]) => [n, { level: ps.level, presets: ps.map((p) => `${p.id}(${p.rects}) ${p.title}`) }])) });
  // 여섯으로 틀 하나(1 + 5)를 눌러 실제로 짜인다
  await openPresets(page);
  await page.click('[data-role=selection] [data-preset="main-big5"]'); await sleep(1800);
  const docks6 = await call(page, 'dock.list');
  await frame(page, bboxOf(Object.values(await rects(page))), 120);
  await shot(page, 'p26-2-6-main-big5', log);
  step('여섯을 1 + 5 틀로 누르면 여섯이 한 덩어리', docks6.length === 1 && docks6[0].members.length === 6, { members: docks6[0] && docks6[0].members.length });

  // 3) 덩어리 안 연결선: 2 × 2에서 s1 → s4(역할), s2 → s3(띄움 없음, 역할). s1과 s4는 흰 화면
  await reset(page, base);
  const ids = Object.fromEntries(await Promise.all(NAMES.map(async (n) => [n, await sid(page, n)])));
  await call(page, 'dock.layout', { members: [ids.s1, ids.s2, ids.s3, ids.s4], preset: 'grid' });
  await sleep(1300);
  r = await rects(page);
  const outer = bboxOf(['s1', 's2', 's3', 's4'].map((n) => r[n]));
  await frame(page, outer, 80);
  await paintWhite(page, 's1');
  await paintWhite(page, 's4');
  await call(page, 'link.create', { from: ids.s1, to: ids.s4, role: 'p26 리뷰' });
  await call(page, 'link.create', { from: ids.s2, to: ids.s3, role: 'p26 짝' });
  await sleep(1200);
  await dropDeliveries(page);
  await clearSel(page);
  // 초점이 없게: 고름과 눌러 들어간 세션을 지우고, 화면 가운데가 덩어리 밖이게
  await page.evaluate(() => window.__mt.setFocus(null));
  await setView(page, { x: outer.x + outer.w / 2, y: outer.y - 300, w: 1, h: 1 }, 0.55); // 화면 가운데가 덩어리 위쪽 밖
  let dl = await dlInfo(page);
  const rel = (n) => ({ x: r[n].x - outer.x, y: r[n].y - outer.y, w: r[n].w, h: r[n].h });
  const l14 = dl && dl.lines.find((l) => near(l.a, center(rel('s1'))) || near(l.b, center(rel('s4'))));
  step('덩어리 안 연결선: 진한 색(역할 파랑, 불투명) 위에 어두운 테두리, 초점이 없으면 가운데 점끼리', dl && dl.lines.length === 2 && !dl.focus && l14 && l14.stroke === ROLE_BLUE && l14.op >= 0.99 && l14.casing && l14.casing.width > l14.width * 1.8 && near(l14.a, center(rel('s1'))) && near(l14.b, center(rel('s4'))) && !l14.anchored, { dl });
  await shot(page, 'p26-3-1-links-no-focus', log);
  // 흰 셸 위를 가까이서
  await setView(page, { x: r.s1.x + r.s1.w * 0.75, y: r.s1.y + r.s1.h * 0.75, w: 1, h: 1 }, 1.2);
  await shot(page, 'p26-3-2-link-over-white-shell', log);
  // 화면 그림에서 선 둘레의 어두운 테두리와 파랑이 흰 바탕 위에 있는지(선 가운데 점의 화소)
  const px = await page.evaluate(() => {
    const g = document.querySelector('[data-role=dock-links] .mt-dl.role .mt-dl-line');
    const r = g.getBoundingClientRect();
    return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
  });
  step('흰 셸 화면 위에서도 선이 보인다(스크린숏 p26-3-2)', !!px, { px });

  // 4) 초점 세션의 선은 테두리 가운데에서
  await frame(page, outer, 80);
  const headClick = async (n) => { const h = await page.locator(`.mt-node[data-name="${n}"] .mt-node-head`).boundingBox(); await page.mouse.click(h.x + Math.min(160, h.width / 2), h.y + h.height / 2); await sleep(900); };
  await headClick('s1');
  dl = await dlInfo(page);
  let l = dl && dl.lines.find((x) => near(x.b, center(rel('s4'))));
  step('s1 머리줄을 누르면(고름) s1이 초점이고, s1 → s4 선의 s1 쪽 끝이 s1 테두리 가운데(s4 쪽), s4 쪽 끝은 s4 가운데', dl && dl.focus === ids.s1 && l && l.anchored === 'from' && near(l.a, anchor(rel('s1'), { x: center(rel('s4'))[0], y: center(rel('s4'))[1] })) && l.start, { focus: dl && dl.focus, line: l, want: anchor(rel('s1'), { x: center(rel('s4'))[0], y: center(rel('s4'))[1] }) });
  const s2line = dl && dl.lines.find((x) => near(x.a, center(rel('s2'))));
  step('초점과 닿지 않는 선(s2 → s3)은 그대로 가운데 점끼리', s2line && !s2line.anchored, { line: s2line });
  const labels = await page.evaluate(() => [...document.querySelectorAll('[data-role=dock-links] .mt-dl-label')].map((e) => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, r: r.right, b: r.bottom, k: +e.dataset.k }; }));
  const overlap = labels.some((p, i) => labels.some((q, j) => j > i && p.x < q.r && q.x < p.r && p.y < q.b && q.y < p.b));
  step('엇갈린 두 선의 글이 겹치지 않는다(겹치면 선을 따라 옮긴다)', labels.length === 2 && !overlap, { labels });
  await shot(page, 'p26-4-1-focus-s1', log);
  await headClick('s4');
  dl = await dlInfo(page);
  l = dl && dl.lines.find((x) => near(x.a, center(rel('s1'))));
  step('s4를 고르면 같은 선의 s4 쪽 끝이 s4 테두리 가운데로 옮겨 간다', dl && dl.focus === ids.s4 && l && l.anchored === 'to' && near(l.b, anchor(rel('s4'), { x: center(rel('s1'))[0], y: center(rel('s1'))[1] })), { focus: dl && dl.focus, line: l });
  await shot(page, 'p26-4-2-focus-s4', log);
  await headClick('s3');
  dl = await dlInfo(page);
  l = dl && dl.lines.find((x) => x.anchored);
  step('s3을 고르면 s2 → s3 선의 s3 쪽 끝이 s3 위 테두리 가운데', dl && dl.focus === ids.s3 && l && l.anchored === 'to' && near(l.b, anchor(rel('s3'), { x: center(rel('s2'))[0], y: center(rel('s2'))[1] })), { line: l });
  await shot(page, 'p26-4-3-focus-s3', log);
  await clearSel(page);

  // 5) 눌러서 보기
  // 5-1 혼자인 노드 머리줄(멀리서): s5가 화면의 85%를 채우고, 고르기만 하고 터미널에 초점이 없다
  await setView(page, { x: base.x + 1260, y: base.y + 580, w: 1, h: 1 }, 0.42);
  await headClick('s5');
  await sleep(500);
  let v = await vp(page);
  r = await rects(page);
  const headState = await page.evaluate(() => { const a = document.activeElement; return { inXterm: !!(a && a.closest && a.closest('.xterm')), selected: window.__mt.getState().selected.length }; });
  step('혼자인 노드 머리줄을 누르면 그 노드가 화면을 85% 채우고(배율 1까지), 고르기만 하고 터미널에 초점이 없다', filled85(v, r.s5) && !headState.inXterm && headState.selected === 1, { zoom: +v.zoom.toFixed(3), fill: fills(v, r.s5), headState });
  await shot(page, 'p26-5-1-head-click-lone', log);
  // 5-2 이미 보고 있으면 터미널을 눌러도 화면이 그대로
  const before = await vp(page);
  await page.locator('.mt-node[data-name="s5"] .mt-term-wrap').click({ position: { x: 200, y: 150 } });
  await sleep(900);
  const after = await vp(page);
  const termFocus = await page.evaluate(() => { const a = document.activeElement; return !!(a && a.closest && a.closest('.xterm')); });
  step('이미 보는 노드의 터미널을 누르면 화면이 움직이지 않고 터미널에 초점', Math.abs(after.x - before.x) < 1 && Math.abs(after.y - before.y) < 1 && Math.abs(after.zoom - before.zoom) < 1e-4 && termFocus, { before, after, termFocus });
  // 5-3 덩어리 안 노드 본문(멀리 얼굴): 덩어리 전체가 85%
  await setView(page, { x: base.x + 1260, y: base.y + 580, w: 1, h: 1 }, 0.25);
  const faceS2 = await page.locator('.mt-node[data-name="s2"]').getAttribute('data-face');
  const bx = await page.locator('.mt-node[data-name="s2"] .mt-node-body').boundingBox();
  await page.mouse.click(bx.x + bx.width / 2, bx.y + bx.height / 2); await sleep(1200);
  v = await vp(page);
  r = await rects(page);
  const dk = bboxOf(['s1', 's2', 's3', 's4'].map((n) => r[n]));
  step(`덩어리 안 노드(${faceS2} 얼굴)를 누르면 덩어리 전체가 화면을 85% 채운다`, filled85(v, dk), { face: faceS2, zoom: +v.zoom.toFixed(3), fill: fills(v, dk) });
  await shot(page, 'p26-5-2-far-click-dock', log);
  // 5-4 덩어리를 보는 중에 다른 구성 노드의 터미널을 눌러도 그대로
  const b2 = await vp(page);
  await page.locator('.mt-node[data-name="s3"] .mt-term-wrap').click({ position: { x: 120, y: 90 } }).catch(() => {});
  await sleep(900);
  const a2 = await vp(page);
  step('덩어리를 보는 중에 다른 구성 노드의 터미널을 눌러도 화면이 그대로', Math.abs(a2.x - b2.x) < 1 && Math.abs(a2.y - b2.y) < 1 && Math.abs(a2.zoom - b2.zoom) < 1e-4, { b2, a2 });
  // 5-5 아이콘 얼굴(아주 멀리)을 누르면 그 노드가 85%
  await setView(page, { x: base.x + 1260, y: base.y + 580, w: 1, h: 1 }, 0.12);
  const faceS6 = await page.locator('.mt-node[data-name="s6"]').getAttribute('data-face');
  const ix = await page.locator('.mt-node[data-name="s6"]').boundingBox();
  await page.mouse.click(ix.x + ix.width / 2, ix.y + ix.height * 0.6); await sleep(1200);
  v = await vp(page);
  r = await rects(page);
  step(`아이콘 얼굴(${faceS6})을 누르면 그 노드가 화면을 85% 채운다`, faceS6 === 'icon' && filled85(v, r.s6), { face: faceS6, zoom: +v.zoom.toFixed(3), fill: fills(v, r.s6) });
  await shot(page, 'p26-5-3-icon-click', log);
  // 5-6 큰 덩어리(가로 셋 1440 크기)에서 터미널을 누르면 덩어리 전체(배율이 터미널 얼굴을 지키는 안에서)
  await reset(page, base);
  await clearSel(page);
} catch (e) {
  log('오류', e.stack || String(e));
  step('시험이 끝까지 돈다', false, { error: String(e).slice(0, 300) });
} finally { await closeApp(app); }
result.ok = result.steps.every((x) => x.ok);
writeJson('p26-dock.json', result);
log(result.ok ? `모두 통과 ${result.steps.length}/${result.steps.length}` : `실패 ${result.steps.filter((x) => !x.ok).map((x) => x.name).join(', ')}`);
process.exit(result.ok ? 0 : 1);
