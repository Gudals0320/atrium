// P262 창 시험: 캔버스 자동 정렬이 rig를 한 덩어리로(rig 2D 칸, 같은 크기), 보통 세션은 덩어리와 넉넉히 떨어지게. 정리 전·후 그림.
// 판: 개발용 판(atrium-dev-p262, 48012, 창 9493)만. 준비는 작업 기록(시험 폴더에 rig 정의, rig.enable, rig.builder, 셸 lead·w1·w2·lone, lead → w1·w2 연결).
// 실행: sh backend/.dev/dev.sh node app/test/e2e/p262-rig-arrange.mjs <round> <시험 폴더> <prefix> [ws|all]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const TAG = process.argv[2] || 'round-1';
const WS = process.argv[3];
const PRE = process.argv[4] || 'tri';
const MODE = process.argv[5] || 'ws';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const OUT = path.join(REPO, 'experiments', 'p262', TAG);
if (process.env.ATRIUM_TERMINAL_SESSION !== 'atrium-dev-p262' || process.env.ATRIUM_PORT !== '48012') throw new Error('개발용 판(atrium-dev-p262, 48012) 환경에서만 돈다');
if (!WS) throw new Error('시험 폴더를 준다');
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
fs.mkdirSync(OUT, { recursive: true });
const { logger, sleep, launch, closeApp } = await import('./harness.mjs');
const log = logger('p262-' + PRE + '-' + TAG);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 120000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 1500) : '')); };
const KEY = call('rig.status', { workspace: WS }).workspace;
async function lang(page, l) { call('settings.set', { key: 'language', value: l }); await page.waitForFunction((x) => document.documentElement.lang === x, l, { timeout: 10000 }).catch(() => {}); await sleep(600); }
const shot = async (page, name) => { await page.screenshot({ path: path.join(OUT, name + '.png') }); log('그림 ' + name + '.png'); };

// 판 상태(세계 좌표)와 화면에서 잰다: 겹침, rig 크기, rig 덩어리와 보통 세션 틈, 선이 노드를 지나는가(곡선 위 점), 칩이 노드에 걸리는가
const measure = (page, keys) => page.evaluate((keys) => {
  const st = window.__mt.getState();
  const ss = [...st.sessions.values()].filter((s) => keys.includes(s.workspaceKey) && st.nodes.get(s.sessionId));
  const R = (s) => { const n = st.nodes.get(s.sessionId); return { id: s.sessionId, name: s.name, rig: !!s.rigRole, ws: s.workspaceKey, x: n.x, y: n.y, w: n.w, h: n.h }; };
  const rs = ss.map(R);
  const hit = (a, b, m = 0) => a.x < b.x + b.w - m && b.x < a.x + a.w - m && a.y < b.y + b.h - m && b.y < a.y + a.h - m;
  const over = [];
  for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) if (hit(rs[i], rs[j], 1)) over.push([rs[i].name, rs[j].name]);
  const sizes = {};
  for (const k of keys) sizes[k] = [...new Set(rs.filter((r) => r.rig && r.ws === k).map((r) => r.w + 'x' + r.h))];
  const bb = (xs) => xs.length ? { x: Math.min(...xs.map((r) => r.x)), y: Math.min(...xs.map((r) => r.y)), x1: Math.max(...xs.map((r) => r.x + r.w)), y1: Math.max(...xs.map((r) => r.y + r.h)) } : null;
  const gaps = {};
  for (const k of keys) { const a = bb(rs.filter((r) => r.rig && r.ws === k)), b = bb(rs.filter((r) => !r.rig && r.ws === k)); if (a && b) gaps[k] = Math.max(b.x - a.x1, a.x - b.x1, b.y - a.y1, a.y - b.y1); }
  // rig 선(세계 좌표 path d)의 곡선 위 점이 끝 노드가 아닌 노드 안(여백 4)에 드는가
  const byRole = new Map();
  for (const s of ss) if (s.rigRole) byRole.set(s.workspaceKey + '|' + s.rigRole, s.sessionId);
  const through = [];
  for (const e of document.querySelectorAll('[data-role=rig-line]')) {
    const nums = (e.getAttribute('d').match(/-?[\d.]+/g) || []).map(Number);
    if (nums.length < 8) continue;
    const [x0, y0, c1x, c1y, c2x, c2y, x1, y1] = nums;
    const pts = []; for (let t = 0.04; t < 0.97; t += 0.04) { const u = 1 - t; pts.push([u*u*u*x0 + 3*u*u*t*c1x + 3*u*t*t*c2x + t*t*t*x1, u*u*u*y0 + 3*u*u*t*c1y + 3*u*t*t*c2y + t*t*t*y1]); }
    for (const r of rs) {
      if (pts.some(([x, y]) => x > r.x + 4 && x < r.x + r.w - 4 && y > r.y + 4 && y < r.y + r.h - 4)) {
        const ends = [e.dataset.from, e.dataset.to];
        const inEnds = rs.filter((q) => q.rig).some((q) => q.id === r.id && ends.some((role) => [...byRole].some(([k, sid]) => sid === r.id && k.endsWith('|' + role))));
        if (!inEnds) through.push([e.dataset.from, e.dataset.to, r.name]);
      }
    }
  }
  const box = (el) => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; };
  const nodeBoxes = rs.map((r) => { const el = document.querySelector('.react-flow__node[data-id="' + r.id + '"]'); return el ? { name: r.name, ...box(el) } : null; }).filter(Boolean);
  const chips = [...document.querySelectorAll('[data-role=rig-edge-label], [data-role=rig-raise-label]')].map((el) => ({ text: el.textContent, free: el.dataset.free, fit: el.dataset.fit, ...box(el) }));
  const fits = chips.map((c) => c.fit);
  const chipOnNode = chips.filter((c) => nodeBoxes.some((n) => hit(c, n))).map((c) => c.text);
  const linkLabs = [...document.querySelectorAll('.mt-edge-label[data-link]')].map(box);
  const labOnNode = linkLabs.filter((c) => nodeBoxes.some((n) => hit(c, n))).length;
  const regions = [...document.querySelectorAll('[data-role=region], .mt-region')].length;
  return { n: rs.length, over, sizes, gaps, through, chips: chips.map((c) => [c.text, c.free]), chipOnNode, labOnNode, fits, rigLines: document.querySelectorAll('[data-role=rig-line]').length, regions, rects: rs.map((r) => [r.name, r.x, r.y, r.w, r.h]) };
}, keys);

const { app, page } = await launch({ log, args: ['--remote-debugging-port=9493'] });
try {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1600, height: 1000 }).catch(() => {});
  await page.waitForFunction(() => !document.querySelector('[data-role=splash]'), null, { timeout: 30000 }).catch(() => log('splash 남음'));
  await page.waitForFunction((k) => window.__mt.getState().rigMaps.has(k), KEY, { timeout: 20000 });
  const keys = MODE === 'all' ? await page.evaluate(() => [...new Set([...window.__mt.getState().sessions.values()].map((s) => s.workspaceKey))]) : [KEY];
  const ids = await page.evaluate((keys) => [...window.__mt.getState().sessions.values()].filter((s) => keys.includes(s.workspaceKey)).map((s) => ({ id: s.sessionId, name: s.name, rig: s.rigRole || null, ws: s.workspaceKey })), keys);
  log('세션 ' + JSON.stringify(ids.map((x) => [x.name, x.rig])));
  // 맞춤 뒤 위 띠(머리줄)에 영역 이름표가 가리지 않게 조금 내린다
  const fit = async () => { await page.evaluate((ids) => window.__mtFlow.fitView({ nodes: ids.map((x) => ({ id: x.id })), padding: 0.12, duration: 0 }), ids); await sleep(600); await page.evaluate(() => { const v = window.__mtFlow.getViewport(); const z = v.zoom * 0.86; window.__mtFlow.setViewport({ zoom: z, x: 800 - (800 - v.x) / v.zoom * z, y: 455 - (500 - v.y) / v.zoom * z }, { duration: 0 }); }); await sleep(1400); }; // 아래 입력줄·단추에 가리지 않게 조금 줄여 위로
  // 다닥다닥: 사람이 이리저리 띄운 판처럼 겹치게, rig 노드 크기도 제각각
  // 워크스페이스마다 지금 자리의 왼쪽 위에서(다른 영역과 섞이지 않게)
  const base = await page.evaluate((ids) => { const st = window.__mt.getState(); const o = {}; for (const x of ids) { const n = st.nodes.get(x.id); if (!n) continue; const b = o[x.ws] || (o[x.ws] = { x: Infinity, y: Infinity }); b.x = Math.min(b.x, n.x); b.y = Math.min(b.y, n.y); } return o; }, ids);
  const mess = () => ids.forEach((x, i) => call('board.setNode', { session: x.id, x: Math.round(base[x.ws].x) + (i % 4) * 900 + (i * 37) % 120, y: Math.round(base[x.ws].y) + Math.floor((i % 12) / 4) * 520 + (i * 53) % 90, w: x.rig ? [1440, 1040, 1200, 1600][i % 4] : 1040, h: x.rig ? [810, 585, 900, 900][i % 4] : 585, cause: 'test' }));
  if (MODE === 'ws') {
    // 켤 때 놓기 다시 보기: rig 끄고 켜면 placeRoles가 같은 크기·같은 칸으로 놓는다
    mess(); await sleep(1500); // 흩뜨린 뒤 켜야 켤 때 놓기가 실제로 옮긴다
    call('rig.disable', { workspace: WS }); await sleep(3000);
    const before = JSON.stringify((await measure(page, keys)).rects.filter((r) => ids.find((x) => x.name === r[0] && x.rig)));
    call('rig.enable', { workspace: WS, confirm: true });
    // 역할을 깨우는 데 역할마다 몇 초 걸린다(깨운 뒤 놓는다). 자리가 바뀔 때까지 기다린다
    for (let i = 0; i < 60; i++) { await sleep(1000); const now = JSON.stringify((await measure(page, keys)).rects.filter((r) => ids.find((x) => x.name === r[0] && x.rig))); if (now !== before) break; }
    await sleep(2500);
    const rig = ids.filter((x) => x.rig);
    await page.evaluate((rig) => window.__mtFlow.fitView({ nodes: rig.map((x) => ({ id: x.id })), padding: 0.08, duration: 0 }), rig);
    await sleep(2000);
    const fe = await measure(page, keys);
    // 켤 때 놓기는 rig 노드만 옮긴다(보통 세션은 그대로라 흩뜨린 셸 위로 선이 지날 수 있다. 정리가 그것을 푼다)
    const rigNames = new Set(ids.filter((x) => x.rig).map((x) => x.name));
    const rigThrough = fe.through.filter((t) => rigNames.has(t[2]));
    check('켤 때 놓기: rig 노드 같은 크기, rig 선이 다른 rig 노드를 지나지 않는다', Object.values(fe.sizes).every((s) => s.length === 1) && !rigThrough.length, { sizes: fe.sizes, rigThrough, shells: fe.through.length });
    await shot(page, `00-${PRE}-enable-ko`);
  }
  for (const l of ['ko', 'en']) {
    await lang(page, l);
    mess(); await sleep(1500);
    await fit();
    const f0 = await measure(page, keys);
    log('정리 전 ' + JSON.stringify({ over: f0.over.length, sizes: f0.sizes }));
    await shot(page, `01-${PRE}-before-${l}`);
    const r = MODE === 'all' ? call('board.arrange', { all: true, apply: true, aspect: 1.6 }) : call('board.arrange', { workspace: KEY, apply: true });
    check(`정리(${l}) 적용`, r.applied, { edges: r.edges });
    await sleep(2000);
    await fit();
    const f1 = await measure(page, keys);
    log('정리 뒤 자리 ' + JSON.stringify(f1.rects));
    check(`정리(${l}): 노드 겹침 없음`, !f1.over.length, f1.over);
    check(`정리(${l}): rig 노드는 모두 같은 크기`, Object.values(f1.sizes).every((s) => s.length === 1), f1.sizes);
    check(`정리(${l}): rig 덩어리와 보통 세션 사이 넉넉한 틈(≥ 1000)`, Object.values(f1.gaps).every((g) => g >= 1000), f1.gaps);
    check(`정리(${l}): rig 선이 다른 노드를 지나지 않는다`, f1.rigLines > 0 && !f1.through.length, { lines: f1.rigLines, through: f1.through });
    check(`정리(${l}) 전체 맞춤: 보이는 글 칩이 노드·다른 칩에 걸리지 않는다(자리가 없으면 작은 칩이나 선만)`, !f1.chipOnNode.length && f1.chips.every(([, free]) => free === '1') && !f1.labOnNode, { onNode: f1.chipOnNode, chips: f1.chips, fit: f1.fits });
    await shot(page, `02-${PRE}-after-${l}`);
    // 칩은 rig 덩어리를 맞춘 배율에서 잰다(P259 창 시험과 같은 기준)
    for (const k of keys) {
      const rig = ids.filter((x) => x.rig && x.ws === k);
      await page.evaluate((rig) => window.__mtFlow.fitView({ nodes: rig.map((x) => ({ id: x.id })), padding: 0.08, duration: 0 }), rig);
      await sleep(1800);
      const f3 = await measure(page, keys);
      check(`정리(${l}) rig 맞춤 ${k.split('/').pop()}: 글 칩이 노드·다른 칩에 걸리지 않는다`, !f3.chipOnNode.length && f3.chips.every(([, free]) => free === '1') && !f3.labOnNode, { onNode: f3.chipOnNode, chips: f3.chips, lab: f3.labOnNode });
      await shot(page, `03-${PRE}-rig-${k.split('-').pop()}-${l}`);
    }
    // 되돌리기
    const u = MODE === 'all' ? call('board.arrange', { all: true, undo: true }) : call('board.arrange', { workspace: KEY, undo: true });
    await sleep(1500);
    const f2 = await measure(page, keys);
    check(`되돌리기(${l}): 정리 전 자리로`, u.undone && JSON.stringify(f2.rects) === JSON.stringify(f0.rects), { u });
    // 다시 정리해 둔다(다음 단계 그림과 사람이 보는 판)
    if (MODE === 'all') call('board.arrange', { all: true, apply: true, aspect: 1.6 }); else call('board.arrange', { workspace: KEY, apply: true });
    await sleep(1500);
  }
  await lang(page, 'ko');
} catch (e) { check('예외 없음', false, String(e && e.stack || e)); }
finally {
  fs.writeFileSync(path.join(OUT, `results-${PRE}.json`), JSON.stringify(results, null, 2));
  log(`결과 ${results.filter((r) => r.ok).length}/${results.length}`);
  try { await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach((w) => w.close())); } catch {}
  await sleep(1500);
  await closeApp(app);
  process.exit(results.every((r) => r.ok) ? 0 : 1);
}
