// P259 창 시험: 캔버스 rig 선이 보통 연결과 같은 곡선 가족, 모서리 중앙 기준 등간격 끝점, 뚜렷한 화살촉, 켤 때 넓힌 2D 배치.
// 판: 개발용 판(atrium-dev-p259, 48009, 창 9489)만. 준비는 작업 기록(시험 폴더에 rig 정의, rig.enable, rig.builder, 셸 둘).
// 실행: sh backend/.dev/dev.sh node app/test/e2e/p259-rig-curves.mjs <round> <시험 폴더> [prefix]
// 일함·대기·반려·올림은 창 안에서 rig.map 자료와 세션 상태를 바꿔 흉내 낸다(그리는 길은 같다). 보통 연결 하나도 창 안에서 흉내 낸다(셸 둘 사이).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const TAG = process.argv[2] || 'round-1';
const WS = process.argv[3];
const PRE = process.argv[4] || 'tri';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const OUT = path.join(REPO, 'experiments', 'p259', TAG);
if (process.env.ATRIUM_TERMINAL_SESSION !== 'atrium-dev-p259' || process.env.ATRIUM_PORT !== '48009') throw new Error('개발용 판(atrium-dev-p259, 48009) 환경에서만 돈다');
if (!WS) throw new Error('시험 폴더를 준다');
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
fs.mkdirSync(OUT, { recursive: true });
const { logger, sleep, launch, closeApp } = await import('./harness.mjs');
const log = logger('p259-' + PRE + '-' + TAG);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 120000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 1500) : '')); };
const KEY = call('rig.status', { workspace: WS }).workspace;
async function lang(page, l) { call('settings.set', { key: 'language', value: l }); await page.waitForFunction((x) => document.documentElement.lang === x, l, { timeout: 10000 }).catch(() => {}); await sleep(600); }
const shot = async (page, name) => { await page.screenshot({ path: path.join(OUT, name + '.png') }); log('그림 ' + name + '.png'); };

// 창 안: 상태 흉내(일함·대기·반려·올림)와 보통 연결 하나
const inject = (page, o) => page.evaluate(({ key, working, waiting, open, raises, link }) => {
  const st = window.__mt.getState();
  const m = st.rigMaps.get(key);
  if (m) {
    const flows = (m.flows || []).map((f) => ({ ...f, waiting: waiting.includes(f.item) ? 1 : 0, openReturns: open.includes(f.item) ? 1 : 0 }));
    st.rigMaps = new Map(st.rigMaps).set(key, { ...m, flows, raises: raises.map((role, i) => ({ id: 'raise-' + (i + 1), role, reason: 'test', t: Date.now() })) });
  }
  for (const s of st.sessions.values()) if (s.workspaceKey === key && s.rigRole) window.__mt.api.emit('session.updated', { ...s, state: working.includes(s.rigRole) ? 'working' : 'ready' });
  if (link) window.__mt.api.emit('link.updated', link);
  else window.__mt.api.emit('link.removed', { linkId: 'p259-test-link' });
}, o);

// 화면에서 잰다: 선(곡선 d, 모서리), 끝점 등간격, 칩 겹침(노드·칩·보통 연결 글·화살촉), 화살촉
const facts = (page, ids) => page.evaluate((ids) => {
  const st = window.__mt.getState();
  const box = (e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; };
  const nodeEl = (sid) => document.querySelector(`.react-flow__node[data-id="${sid}"]`);
  const nodes = Object.entries(ids).map(([role, sid]) => { const e = nodeEl(sid); return e ? { role, sid, ...box(e) } : null; }).filter(Boolean);
  const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const lines = [...document.querySelectorAll('[data-role=rig-line]')].map((e) => {
    const d = e.getAttribute('d'); const nums = d.match(/-?[\d.]+/g).map(Number);
    return { line: e.dataset.line, from: e.dataset.from, to: e.dataset.to, sp: e.dataset.sp, tp: e.dataset.tp, s: [nums[0], nums[1]], t: [nums[6], nums[7]], curve: /C/.test(d), marker: e.getAttribute('marker-end') || '' };
  });
  // 끝점 등간격(세계 좌표): 노드·모서리마다 나감·들어옴 함께
  const rid = (role) => ids[role === '@builder' ? 'builder' : role];
  const groups = new Map();
  for (const l of lines) for (const [role, side, p] of [[l.from, l.sp, l.s], [l.to, l.tp, l.t]]) { const k = role + '|' + side; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p); }
  const ports = [...groups].map(([k, ps]) => {
    const [role, side] = k.split('|'); const n = st.nodes.get(rid(role)); if (!n) return { k, bad: 'no node' };
    const v = side === 'l' || side === 'r', mid = v ? n.y + n.h / 2 : n.x + n.w / 2;
    const xs = ps.map((p) => (v ? p[1] : p[0])).sort((a, b) => a - b);
    const steps = xs.slice(1).map((x, i) => Math.round((x - xs[i]) * 10) / 10);
    const centered = Math.abs((xs[0] + xs[xs.length - 1]) / 2 - mid) < 0.6;
    const even = steps.every((s) => Math.abs(s - steps[0]) < 0.6);
    const onEdge = ps.every((p) => (side === 'r' ? Math.abs(p[0] - n.x - n.w) < 0.6 : side === 'l' ? Math.abs(p[0] - n.x) < 0.6 : side === 't' ? Math.abs(p[1] - n.y) < 0.6 : Math.abs(p[1] - n.y - n.h) < 0.6));
    return { k, n: ps.length, steps, centered, even, onEdge };
  });
  const chipsEl = [...document.querySelectorAll('[data-role=rig-edge-label], [data-role=rig-raise-label]')];
  const chips = chipsEl.map((e) => ({ text: e.textContent, ...box(e), free: e.dataset.free }));
  const linkLabs = [...document.querySelectorAll('.mt-edge-label[data-link]')].map(box);
  const tips = [...document.querySelectorAll('marker.mt-rigc-tip')].length;
  const onNode = chips.filter((c) => nodes.some((n) => hit(c, n))).map((c) => c.text);
  const overlap = chips.filter((a, i) => chips.some((b, j) => j > i && hit(a, b)) || linkLabs.some((b) => hit(a, b))).map((c) => c.text);
  const zoom = window.__mtFlow ? window.__mtFlow.getZoom() : null;
  const chipH = chips.length ? Math.round(Math.min(...chips.map((c) => c.h))) : 0;
  const lit = [...document.querySelectorAll('[data-role=rig-path]')].map((e) => [e.dataset.a, e.dataset.b, e.dataset.lit]);
  return { lines, ports, chips: chips.map((c) => [c.text, c.free]), onNode, overlap, tips, zoom, chipH, lit, dots: document.querySelectorAll('[data-role=rig-open-return]').length, waits: document.querySelectorAll('[data-role=rig-wait]').length, normal: document.querySelectorAll('.react-flow__edge-path.mt-edge.role').length };
}, ids);

const { app, page } = await launch({ log, args: ['--remote-debugging-port=9489'] });
try {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1600, height: 1000 }).catch(() => {});
  await page.waitForFunction(() => !document.querySelector('[data-role=splash]'), null, { timeout: 30000 }).catch(() => log('splash 남음'));
  await page.waitForFunction((k) => window.__mt.getState().rigMaps.has(k), KEY, { timeout: 20000 });
  const ids = await page.evaluate((k) => Object.fromEntries([...window.__mt.getState().sessions.values()].filter((s) => s.workspaceKey === k && s.rigRole).map((s) => [s.rigRole.replace('@', ''), s.sessionId])), KEY);
  const shells = await page.evaluate((k) => Object.fromEntries([...window.__mt.getState().sessions.values()].filter((s) => s.workspaceKey === k && !s.rigRole && s.kind === 'shell').map((s) => [s.name, s.sessionId])), KEY);
  const roles = Object.keys(ids).filter((r) => r !== 'builder');
  check('역할과 빌더', roles.length >= 3 && ids.builder, Object.keys(ids));
  const saved = await page.evaluate((ids) => Object.fromEntries(Object.entries(ids).map(([r, sid]) => { const n = window.__mt.getState().nodes.get(sid); return [r, n && { x: n.x, y: n.y, w: n.w, h: n.h }]; })), ids);
  log('켤 때 놓인 자리 ' + JSON.stringify(saved));
  // 켤 때 배치 간격: 겹치지 않고, 가로로 이웃하면 틈 ≥ 폭 × 0.75 - 1, 세로로 이웃하면 틈 ≥ 360
  const rs = Object.entries(saved).filter(([, r]) => r);
  const gaps = [];
  for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) { const [ia, a] = rs[i], [ib, b] = rs[j]; const gx = Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w), gy = Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h); gaps.push([ia, ib, gx, gy]); }
  check('켤 때 배치: 노드 사이 넓은 틈(가로 ≥ 폭 × 0.75 또는 세로 ≥ 360)', gaps.every(([, , gx, gy]) => gx >= rs[0][1].w * 0.75 - 1 || gy >= 360), gaps);
  const allIds = [...Object.values(ids), ...Object.values(shells)];
  const fit = async () => { await page.evaluate((ids) => { const st = window.__mt.getState(); st.navigateTo && st.navigateTo(ids[0], { instant: true }); }, allIds); await sleep(700); await page.evaluate((ids) => window.__mtFlow.fitView({ nodes: ids.map((id) => ({ id })), padding: 0.06, duration: 0 }), allIds); await sleep(1500); };
  const zoomTo = async (z) => { await page.evaluate(({ ids, z }) => { const st = window.__mt.getState(); const rs = ids.map((id) => st.nodes.get(id)).filter(Boolean); const x0 = Math.min(...rs.map((r) => r.x)), y0 = Math.min(...rs.map((r) => r.y)), x1 = Math.max(...rs.map((r) => r.x + r.w)), y1 = Math.max(...rs.map((r) => r.y + r.h)); const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2; window.__mtFlow.setViewport({ x: 800 - cx * z, y: 500 - cy * z, zoom: z }, { duration: 0 }); }, { ids: Object.values(ids), z }); await sleep(1500); };
  const judge = (f, name, wantLines) => {
    check(name + ': 선은 모두 곡선(보통 연결과 같은 C 베지어)이고 화살촉이 있다', f.lines.length === wantLines && f.lines.every((l) => l.curve && /url\(#/.test(l.marker)) && f.tips >= 1, { n: f.lines.length, want: wantLines });
    check(name + ': 끝점은 모서리 위, 모서리 중앙이 가운데인 등간격(나감·들어옴 함께)', f.ports.every((p) => p.centered && p.even && p.onEdge), f.ports);
    check(name + ': 글 칩이 노드·다른 칩·보통 연결 글과 겹치지 않는다', !f.onNode.length && !f.overlap.length && f.chips.every(([, free]) => free === '1'), { onNode: f.onNode, overlap: f.overlap, chips: f.chips });
    check(name + ': 칩 화면 높이가 읽힐 만하다(≥ 16px)', f.chipH >= 16, { zoom: f.zoom, chipH: f.chipH });
  };
  const ST = JSON.parse(process.env.P259_STATE || '{}');
  const now = Date.now();
  const link = shells.lead && shells.worker ? { linkId: 'p259-test-link', from: shells.lead, to: shells.worker, role: '리뷰', lastText: '화면 비교용 지시', lastKind: 'prompt', lastAt: now, promptAt: now, createdAt: now - 60000, count: 1, prompts: 1, toAgentName: 'worker', toPaneId: 't0' } : null;
  let familyRole = null;
  for (const l of ['ko', 'en']) {
    await lang(page, l);
    for (const [r, n] of Object.entries(saved)) if (n) call('board.setNode', { session: ids[r], ...n, cause: 'test' });
    // 셸 lead는 가장 오른쪽 역할 노드의 오른쪽(같은 줄), worker는 그 아래. 보통 연결(흉내)은 lead → 그 역할: 한 노드에 rig 선과 보통 연결이 함께 닿는다
    const W = saved[roles[0]].w, H = saved[roles[0]].h;
    const right = rs.filter(([r]) => r !== 'builder').sort((a, b) => (b[1].x + b[1].w) - (a[1].x + a[1].w) || b[1].y - a[1].y)[0];
    const bx = right[1].x + right[1].w + 1080, by = right[1].y;
    if (shells.lead) call('board.setNode', { session: shells.lead, x: bx, y: by, w: W, h: H, cause: 'test' });
    if (shells.worker) call('board.setNode', { session: shells.worker, x: bx, y: by + H + 787, w: W, h: H, cause: 'test' });
    familyRole = right[0];
    if (link) link.to = ids[right[0]];
    await sleep(1200);
    await inject(page, { key: KEY, working: ST.working || [], waiting: ST.waiting || [], open: ST.open || [], raises: ST.raises || [], link });
    await sleep(800);
    await fit();
    await inject(page, { key: KEY, working: ST.working || [], waiting: ST.waiting || [], open: ST.open || [], raises: ST.raises || [], link }); // 판의 세션 갱신이 흉내를 덮었을 수 있다
    await sleep(800);
    const want = await page.evaluate(() => document.querySelectorAll('[data-role=rig-line]').length);
    const f1 = await facts(page, ids);
    log('선 ' + JSON.stringify(f1.lines.map((x) => [x.line, x.from, x.to, x.sp + x.tp])) + ' 밝기 ' + JSON.stringify(f1.lit));
    judge(f1, `맞춤(${l})`, want);
    check(`맞춤(${l}): 일함·대기·반려·올림이 보인다`, (!ST.working || f1.lit.some((x) => x[2] === '1')) && (!ST.waiting || f1.waits >= 1) && (!ST.open || f1.dots >= 1) && (!ST.raises || f1.lines.some((x) => x.line === 'raise')), { lit: f1.lit, waits: f1.waits, dots: f1.dots });
    check(`맞춤(${l}): 보통 연결이 함께 그려진다`, !link || f1.normal >= 1, f1.normal);
    await shot(page, `01-${PRE}-fit-${l}`);
    await zoomTo(0.32);
    const f2 = await facts(page, ids);
    judge(f2, `배율 0.32(${l})`, want);
    await shot(page, `02-${PRE}-zoom032-${l}`);
    await zoomTo(0.6);
    const f3 = await facts(page, ids);
    judge(f3, `배율 0.6(${l})`, want);
    await shot(page, `03-${PRE}-zoom06-${l}`);
    // 한 가족인지: 셸 둘의 보통 연결과 가장 가까운 rig 역할 노드를 한 화면에
    if (shells.lead && shells.worker) {
      await inject(page, { key: KEY, working: ST.working || [], waiting: ST.waiting || [], open: ST.open || [], raises: ST.raises || [], link: { ...link, lastAt: Date.now(), promptAt: Date.now() } });
      await page.evaluate(({ id, z }) => { const n = window.__mt.getState().nodes.get(id); window.__mtFlow.setViewport({ x: 800 - (n.x + n.w) * z, y: 470 - (n.y + n.h * 0.7) * z, zoom: z }, { duration: 0 }); }, { id: ids[familyRole], z: 0.55 });
      await sleep(1500);
      const f4 = await facts(page, ids);
      check(`가족(${l}): 보통 연결과 rig 선이 한 화면, 칩 겹침 없음`, f4.normal >= 1 && !f4.onNode.length && !f4.overlap.length, { normal: f4.normal, zoom: f4.zoom, overlap: f4.overlap });
      await shot(page, `04-${PRE}-family-${l}`);
    }
  }
  await inject(page, { key: KEY, working: [], waiting: [], open: [], raises: [], link: null });
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
