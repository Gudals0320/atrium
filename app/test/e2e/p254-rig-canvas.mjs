// P254 창 시험(캔버스 2차): 켤 때 2D로 놓인 rig-trade 역할·빌더의 V7 두 줄, 다른 노드를 지나는 선의 직각 돌리기.
// 판: 개발용 판(atrium-dev-p254, 48004, 창 9484)만. 준비는 작업 기록. 실행: sh backend/.dev/dev.sh node app/test/e2e/p254-rig-canvas.mjs [round]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const TAG = process.argv[2] || 'canvas-1';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const OUT = path.join(REPO, 'experiments', 'p254', TAG);
if (process.env.ATRIUM_TERMINAL_SESSION !== 'atrium-dev-p254' || process.env.ATRIUM_PORT !== '48004') throw new Error('개발용 판(atrium-dev-p254, 48004) 환경에서만 돈다');
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
fs.mkdirSync(OUT, { recursive: true });
const { logger, sleep, launch, closeApp } = await import('./harness.mjs');
const { gridPlace } = await import('../../../backend/src/rig-map-layout.mjs');
const DEF = JSON.parse(fs.readFileSync('C:/Workspace/mtask-p254-trade/.atrium/rig.json', 'utf8'));
const log = logger('p254-' + TAG);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 120000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 1500) : '')); };
const WS = 'C:/Workspace/mtask-p254-trade';
const KEY = call('rig.status', { workspace: WS }).workspace;
async function lang(page, l) { call('settings.set', { key: 'language', value: l }); await page.waitForFunction((x) => document.documentElement.lang === x, l, { timeout: 10000 }).catch(() => {}); await sleep(600); }
const shot = async (page, name) => { await page.screenshot({ path: path.join(OUT, name + '.png') }); log('그림 ' + name + '.png'); };
// 화면에서: rig 선 글 칸이 노드 위에 앉지 않았나, 선 줄이 다른 노드를 지나지 않나(줄을 따라 점을 찍어 노드 사각형 안인지 본다)
const facts = (page, ids) => page.evaluate((ids) => {
  const nodeEl = (sid) => document.querySelector(`.react-flow__node[data-id="${sid}"]`);
  const box = (e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; };
  const nodes = Object.entries(ids).map(([role, sid]) => { const e = nodeEl(sid); return e ? { role, ...box(e) } : null; }).filter(Boolean);
  const inside = (p, r) => p.x > r.x + 2 && p.x < r.x + r.w - 2 && p.y > r.y + 2 && p.y < r.y + r.h - 2;
  const meet = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const lines = [...document.querySelectorAll('[data-role=rig-line]')].map((e) => {
    const len = e.getTotalLength(), m = e.getScreenCTM(), hit = new Set();
    for (let s = 0; s <= 60; s++) { const p = e.getPointAtLength(len * s / 60); const q = new DOMPoint(p.x, p.y).matrixTransform(m); for (const n of nodes) if (n.role !== e.dataset.from && n.role !== e.dataset.to && inside(q, n)) hit.add(n.role); }
    const p0 = e.getPointAtLength(0), p1 = e.getPointAtLength(len);
    const ang = Math.round(Math.atan2(Math.abs(p1.y - p0.y), Math.abs(p1.x - p0.x)) * 1800 / Math.PI) / 10;
    return { line: e.dataset.line, from: e.dataset.from, to: e.dataset.to, routed: e.dataset.routed, stroke: e.getAttribute('stroke'), through: [...hit], ang };
  });
  // 돌린 글은 실제 돌린 사각형(바깥 사각형에서 거꾸로 구한 네 꼭짓점)으로 잰다. 겹침은 분리축 검사
  const polyOf = (e) => {
    const b = box(e), d = Number(e.dataset.rot || 0) * Math.PI / 180, c = Math.abs(Math.cos(d)), s = Math.abs(Math.sin(d));
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    if (s < 1e-3) return [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]];
    const den = c * c - s * s, w = (b.w * c - b.h * s) / den, h = (b.h * c - b.w * s) / den;
    const ux = [Math.cos(d), Math.sin(d)], uy = [-Math.sin(d), Math.cos(d)];
    return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => [cx + ux[0] * w / 2 * i + uy[0] * h / 2 * j, cy + ux[1] * w / 2 * i + uy[1] * h / 2 * j]);
  };
  const rectPoly = (r) => [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]];
  const sat = (A, B) => { for (const P of [A, B]) for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length], ax = [q[1] - p[1], p[0] - q[0]]; const pr = (Q) => Q.map((v) => v[0] * ax[0] + v[1] * ax[1]); const a = pr(A), b2 = pr(B); if (Math.max(...a) <= Math.min(...b2) || Math.max(...b2) <= Math.min(...a)) return false; } return true; };
  const labels = [...document.querySelectorAll('[data-role=rig-edge-label], [data-role=rig-wait], [data-role=rig-raise-label]')].map((e) => { const pg = polyOf(e); return { text: e.textContent, on: nodes.filter((n) => sat(pg, rectPoly(n))).map((n) => n.role), pg }; });
  const lab2 = labels.filter((a, i) => labels.some((c, j) => j > i && sat(a.pg, c.pg))).map((a) => a.text);
  const rots = [...document.querySelectorAll('[data-role=rig-edge-label]')].map((e) => [e.textContent, Number(e.dataset.rot || 0)]);
  return { lines, rots, labels: labels.map(({ text, on }) => ({ text, on })), labelOverlap: lab2, dots: document.querySelectorAll('[data-role=rig-open-return]').length, tags: [...document.querySelectorAll('[data-role=rig-tag]')].map((e) => e.textContent) };
}, ids);

const { app, page } = await launch({ log, args: ['--remote-debugging-port=9484'] });
try {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1600, height: 1000 }).catch(() => {});
  await page.waitForFunction(() => !document.querySelector('[data-role=splash]'), null, { timeout: 30000 }).catch(() => log('splash 남음'));
  await page.waitForFunction((k) => window.__mt.getState().rigMaps.has(k), KEY, { timeout: 20000 });
  const ids = await page.evaluate((k) => Object.fromEntries([...window.__mt.getState().sessions.values()].filter((s) => s.workspaceKey === k && s.rigRole).map((s) => [s.rigRole.replace('@', ''), s.sessionId])), KEY);
  check('역할 넷과 빌더', ['data', 'ideas', 'verify', 'trade', 'builder'].every((r) => ids[r]), Object.keys(ids));
  const saved = await page.evaluate((ids) => Object.fromEntries(Object.entries(ids).map(([r, sid]) => { const n = window.__mt.getState().nodes.get(sid); return [r, n && { x: n.x, y: n.y, w: n.w, h: n.h }]; })), ids);
  log('켤 때 놓인 자리 ' + JSON.stringify(saved));
  const fit = async () => { await page.evaluate((ids) => { const st = window.__mt.getState(); st.navigateTo && st.navigateTo(ids.data, { instant: true }); }, ids); await sleep(700); await page.evaluate((ids) => window.__mtFlow.fitView({ nodes: Object.values(ids).map((id) => ({ id })), padding: 0.08, duration: 0 }), ids); await sleep(1500); };
  const judge = (f, name) => {
    check(name + ': 선이 다른 노드를 지나지 않는다', f.lines.every((x) => !x.through.length), f.lines.filter((x) => x.through.length));
    check(name + ': 글이 노드 위에 앉지 않고 서로 겹치지 않는다', f.labels.every((x) => !x.on.length) && !f.labelOverlap.length, { on: f.labels.filter((x) => x.on.length), overlap: f.labelOverlap });
    check(name + ': 쌍마다 방향별 두 줄(dataset은 한 줄)과 글, 꼬리표', f.lines.length === 7 && f.tags.length >= 5, { lines: f.lines.map((x) => [x.line, x.from, x.to, x.routed, x.stroke]), tags: f.tags, dots: f.dots });
  };
  for (const l of ['ko', 'en']) {
    await lang(page, l);
    for (const [r, n] of Object.entries(saved)) if (n) call('board.setNode', { session: ids[r], ...n, cause: 'test' });
    await sleep(1200);
    await fit();
    judge(await facts(page, ids), `2D(${l})`);
    await shot(page, `01-canvas-2d-${l}`);
    const fa = await facts(page, ids);
    check(`2D(${l}): 모든 선이 허용 각도(수평 0~35도 또는 세로)`, fa.lines.every((x) => x.routed === '1' || x.ang <= 35.5 || x.ang >= 89), fa.lines.map((x) => [x.from, x.to, x.ang]));
    check(`2D(${l}): 비스듬한 선의 글은 선과 나란히(돌림)`, fa.rots.some(([, r]) => r !== 0) && fa.rots.every(([, r]) => Math.abs(r) <= 45), fa.rots);
    // 정삼각형 꼴(노드 가운데끼리 같은 거리, 그린 선 약 40도: 허용 범위 밖이라 기본이 아니다)를 견주어 보인다
    const eq = gridPlace(['data', 'ideas', 'verify', 'trade'], DEF.flows.map((f) => ({ ...f, from: [].concat(f.from), to: [].concat(f.to) })), { W: saved.data.w, H: saved.data.h, GX: 600, GY: 600, beatRole: 'data', shape: 'equilateral' });
    const c0 = eq.cells.get('data'), gx0 = saved.data.x - c0.c * eq.colStep, gy0 = saved.data.y - c0.r * eq.rowStep;
    for (const r of ['data', 'ideas', 'verify', 'trade', 'builder']) { const c = eq.cells.get(r === 'builder' ? '@builder' : r); call('board.setNode', { session: ids[r], x: Math.round(gx0 + c.c * eq.colStep), y: Math.round(gy0 + c.r * eq.rowStep), w: saved.data.w, h: saved.data.h, cause: 'test' }); }
    await sleep(1200); await fit();
    const fe = await facts(page, ids);
    check(`정삼각형(${l}): 선이 노드를 지나지 않고 글이 노드·글에 앉지 않는다`, fe.lines.every((x) => !x.through.length) && fe.labels.every((x) => !x.on.length) && !fe.labelOverlap.length, { lines: fe.lines.map((x) => [x.from, x.to, x.ang, x.through]), on: fe.labels.filter((x) => x.on.length), overlap: fe.labelOverlap });
    await shot(page, `03-canvas-equilateral-${l}`);
    // 한 줄로 놓아 본다(사람이 옮긴 경우): data → verify가 ideas를 지나야 하므로 직각으로 돈다
    const W = saved.data.w, H = saved.data.h, x0 = saved.data.x, y0 = saved.data.y;
    ['data', 'ideas', 'verify', 'trade'].forEach((r, i) => call('board.setNode', { session: ids[r], x: x0 + i * (W + 600), y: y0, w: W, h: H, cause: 'test' }));
    call('board.setNode', { session: ids.builder, x: x0 + 3 * (W + 600), y: y0 + H + 600, w: W, h: H, cause: 'test' });
    await sleep(1200);
    await fit();
    const f2 = await facts(page, ids);
    judge(f2, `한 줄(${l})`);
    check(`한 줄(${l}): data → verify는 돌아간다`, f2.lines.some((x) => x.from === 'data' && x.to === 'verify' && x.routed === '1'), f2.lines.map((x) => [x.from, x.to, x.routed]));
    await shot(page, `02-canvas-row-routed-${l}`);
  }
  for (const [r, n] of Object.entries(saved)) if (n) call('board.setNode', { session: ids[r], ...n, cause: 'test' });
  await lang(page, 'ko');
} catch (e) { check('예외 없음', false, String(e && e.stack || e)); }
finally {
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  log(`결과 ${results.filter((r) => r.ok).length}/${results.length}`);
  try { await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach((w) => w.close())); } catch {}
  await sleep(1500);
  await closeApp(app);
  process.exit(results.every((r) => r.ok) ? 0 : 1);
}
