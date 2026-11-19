// P253 창 시험: 세션 맵 rig 지도 2차(설계 rig3-map.md 8절)와 줌 열 고정. 실제 정의 rig-trade를 옮긴 시험 폴더로 찍는다.
// 판: 따로 띄운 개발용 판(atrium-dev-p253, 48005, 창 9485)만. 시험 폴더 C:\Workspace\mtask-p253-trade(rig-trade 정의, haiku, 빈 도구), -base(셸 하나).
// 준비(켜기, 씨앗·박자, 반려·올림)는 이 시험 밖에서 한다(작업 기록). 실행: sh backend/.dev/dev.sh node app/test/e2e/p253-rig-map.mjs [round]
// 결과는 experiments/p253/<round>/(저장소 밖)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const TAG = process.argv[2] || 'round-1';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const OUT = path.join(REPO, 'experiments', 'p253', TAG);
if (process.env.ATRIUM_TERMINAL_SESSION !== 'atrium-dev-p253' || process.env.ATRIUM_PORT !== '48005') throw new Error('개발용 판(atrium-dev-p253, 48005) 환경에서만 돈다');
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
fs.mkdirSync(OUT, { recursive: true });
const { logger, sleep, launch, closeApp } = await import('./harness.mjs');
const log = logger('p253-' + TAG);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 120000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 1200) : '')); };
const WS = 'C:/Workspace/mtask-p253-trade';
const KEY = call('rig.status', { workspace: WS }).workspace;
async function lang(page, l) { call('settings.set', { key: 'language', value: l }); await page.waitForFunction((x) => document.documentElement.lang === x, l, { timeout: 10000 }).catch(() => {}); await sleep(500); }
const shot = async (page, name, clip) => { await page.screenshot({ path: path.join(OUT, name + '.png'), ...(clip ? { clip } : {}) }); log('그림 ' + name + '.png'); };
const openMap = async (page) => { if (!(await page.$('[data-role=mission]'))) await page.click('[data-action="mission-rail"]'); await page.waitForSelector('[data-role="rig-map"]', { timeout: 20000 }); await sleep(900); };
const closeMap = async (page) => { await page.keyboard.press('Escape'); await sleep(600); };
// 지도 한 장(세계 상자)을 화면 왼쪽 위에 폭 w로
const fitMap = (page, box, w, top = 100) => page.evaluate(([m, w, top]) => { const k = w / m.w; window.__mtTa.set({ k, x: 32 - m.x * k, y: top - m.y * k }); }, [box, w, top]);
const mapBox = (page) => page.evaluate((k) => { const L = window.__mtTa.lay(); const it = L.rig && L.rig.items.find((x) => x.key === k); return it ? { x: it.x, y: it.y, w: it.w, h: it.h } : null; }, KEY);
const facts = (page) => page.evaluate((k) => {
  const L = window.__mtTa.lay();
  const it = L.rig && L.rig.items.find((x) => x.key === k);
  const cards = [...L.cards.values()];
  const treeTop = Math.min(...L.bands.map((b) => b.y), ...cards.map((c) => c.y));
  const q = (s) => [...document.querySelectorAll(s)];
  const roles = q('[data-role=rm-role]').map((e) => { const r = e.getBoundingClientRect(); return { name: e.dataset.name, x: Math.round(r.x), w: Math.round(r.width), h: Math.round(r.height), lines: e.dataset.lines, rows: [...e.querySelectorAll('.ln')].map((x) => x.dataset.row) }; });
  return {
    map: it ? { x: it.x, y: it.y, w: it.w, h: it.h } : null, band: L.rig ? L.rig.band : null, treeTop, treeX: L.bounds.x, tree: cards.map((c) => c.node.name), ncol: L.ncol,
    roles, lines: q('[data-role=rm-line]').map((e) => [e.dataset.a, e.dataset.b, e.dataset.kind, e.dataset.tipA, e.dataset.tipB]),
    labels: q('[data-role=rm-line-label]').map((e) => [e.dataset.a + '|' + e.dataset.b, [...e.querySelectorAll('[data-role=rm-label-row]')].map((r) => (r.dataset.open === '1' ? '● ' : '') + r.textContent)]),
    open: q('[data-role=rm-open-return]').length, head: (document.querySelector('[data-role=rm-head]') || {}).textContent, builder: (document.querySelector('[data-role=rm-builder]') || {}).textContent,
    intake: q('[data-role=rm-intake]').map((e) => e.textContent), raiseRows: q('[data-role=rm-role-raise]').map((e) => e.closest('[data-role=rm-role]').dataset.name),
    cycle: (document.querySelector('[data-role=rm-cycle]') || {}).textContent, link: !!document.querySelector('[data-role=rm-link]'),
  };
}, KEY);

const { app, page } = await launch({ log, args: ['--remote-debugging-port=9485'] });
try {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1600, height: 1000 }).catch(() => {});
  await page.waitForFunction(() => !document.querySelector('[data-role=splash]'), null, { timeout: 30000 }).catch(() => log('splash 남음'));
  await page.waitForFunction((k) => window.__mt.getState().rigMaps.has(k), KEY, { timeout: 20000 });
  await page.evaluate(() => localStorage.removeItem('atrium.sessionMap.rigFold'));
  const roleIds = await page.evaluate((k) => [...window.__mt.getState().sessions.values()].filter((s) => s.workspaceKey === k && s.rigRole && s.rigRole !== '@builder').map((s) => [s.rigRole, s.sessionId]), KEY);
  check('역할 세션 넷', roleIds.length === 4, roleIds.map((x) => x[0]));
  for (const l of ['ko', 'en']) {
    await lang(page, l);
    await openMap(page);
    await page.evaluate(() => window.__mtTa.fit()); await sleep(900);
    const f = await facts(page);
    check(`세션 맵(${l}): rig 띠는 트리 위(왼쪽 정렬, 트리와 잇는 선 없음), 역할은 트리에 없다`, f.map && f.band && f.band.y + f.band.h <= f.treeTop - 100 && f.map.x === f.treeX && !f.link && !f.tree.some((n) => /^(data|ideas|verify|trade)$/.test(n)), { map: f.map, band: f.band, treeTop: f.treeTop, tree: f.tree });
    check(`세션 맵(${l}): 한 줄 차례 data, ideas, verify, trade, 카드 크기 같음`, f.roles.map((r) => r.name).join() === 'data,ideas,verify,trade' && new Set(f.roles.map((r) => r.w + 'x' + r.h)).size === 1 && f.roles.every((r, i, a) => !i || r.x > a[i - 1].x), f.roles);
    const kinds = f.lines.map((x) => x.slice(0, 3).join(':')).sort();
    check(`세션 맵(${l}): 쌍마다 선 하나(곧은 셋, 위로 도는 하나), 사람·빌더 선 없음`, f.lines.length === 4 && f.lines.filter((x) => x[2] === 'straight').length === 3 && kinds.includes('data:verify:lane') && !f.lines.some((x) => /human|@builder/.test(x[0] + x[1])), kinds);
    const lab = Object.fromEntries(f.labels);
    check(`세션 맵(${l}): 이름표 줄(hypothesis n →, ← result n), 열린 반려 붉은 점, 한 방향 길(dataset)은 한 줄`, /^● hypothesis \d+ →$/.test(lab['ideas|verify'][0]) && /^← result( \d+)?$/.test(lab['ideas|verify'][1]) && /^dataset( \d+)? →$/.test(lab['data|verify'].join()) && f.open >= 1, lab);
    check(`세션 맵(${l}): 사람 입력은 카드 줄(data·ideas·trade), 올림은 올린 역할 카드와 머리 띠 빌더 칸`, f.intake.length === 3 && f.raiseRows.length >= 1 && /2|1/.test(f.builder || ''), { intake: f.intake, raise: f.raiseRows, builder: f.builder });
    await shot(page, `01-map-fit-${l}`);
    const box = await mapBox(page);
    await fitMap(page, box, 1540); await sleep(900);
    await shot(page, `02-map-${l}`);
    await closeMap(page);
    // 캔버스(길 선·꼬리표, 설계 4절 그대로)
    await page.evaluate((ids) => { const st = window.__mt.getState(); st.navigateTo && st.navigateTo(ids[0][1], { instant: true }); }, roleIds);
    await sleep(900);
    await page.evaluate((ids) => window.__mtFlow.fitView({ nodes: ids.map((x) => ({ id: x[1] })), padding: 0.08, duration: 0 }), roleIds);
    await sleep(1200);
    const cv = await page.evaluate(() => ({ paths: document.querySelectorAll('[data-role=rig-edge-label]').length, tags: document.querySelectorAll('[data-role=rig-tag]').length }));
    check(`캔버스(${l}): 길 선 넷과 꼬리표`, cv.paths === 4 && cv.tags >= 4, cv);
    await shot(page, `03-canvas-${l}`);
  }
  // ---- 참고 그림과 같은 비율(1832×612 안에 지도 1768 폭) ----
  await lang(page, 'ko');
  await page.setViewportSize({ width: 1900, height: 1100 }).catch(() => {});
  await sleep(800);
  await openMap(page);
  const sumOn = !!(await page.$('[data-action=ln-sum-hide]'));
  if (sumOn) { await page.click('[data-action=ln-sum-hide]'); await sleep(500); }
  const b2 = await mapBox(page);
  await fitMap(page, b2, 1768, 160); await sleep(900);
  const rect = await page.evaluate((k) => { const e = document.querySelector(`[data-role=rig-map][data-ws="${k}"]`); const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }, KEY);
  await shot(page, '04-map-ref-ratio-ko', { x: Math.max(0, rect.x - 32), y: Math.max(0, rect.y - 32), width: Math.round(rect.w + 64), height: Math.round(rect.h + 64) });
  if (sumOn) { await page.click('[data-action=ln-sum-show]'); await sleep(500); }
  // ---- 접기: 머리 띠를 누르면 접히고, 다시 열어도 기억한다 ----
  await page.click(`[data-role=rig-map][data-ws="${KEY}"] [data-role=rm-head]`, { position: { x: 400, y: 20 } }); await sleep(700);
  const folded1 = await page.$eval(`[data-role=rig-map][data-ws="${KEY}"]`, (e) => e.dataset.folded);
  await closeMap(page); await openMap(page);
  const folded2 = await page.$eval(`[data-role=rig-map][data-ws="${KEY}"]`, (e) => e.dataset.folded);
  const mem = await page.evaluate(() => localStorage.getItem('atrium.sessionMap.rigFold'));
  check('접기: 머리 띠를 누르면 머리 한 줄만, 닫았다 열어도 접힌 채(기억)', folded1 === '1' && folded2 === '1' && /true/.test(mem || ''), { folded1, folded2, mem });
  await page.evaluate(() => window.__mtTa.fit()); await sleep(900);
  await shot(page, '05-map-folded-ko');
  await page.click(`[data-role=rig-map][data-ws="${KEY}"] [data-role=rm-head]`, { position: { x: 400, y: 20 } }); await sleep(700);
  check('접기: 다시 누르면 펴진다', (await page.$eval(`[data-role=rig-map][data-ws="${KEY}"]`, (e) => e.dataset.folded)) === '0');
  await closeMap(page);
  // ---- 줌을 바꿔도 열 수가 그대로(오늘·이전 두 칸이 있게 지어낸 이전 세션을 그래프에 더한다) ----
  await page.setViewportSize({ width: 1600, height: 1000 }).catch(() => {});
  await sleep(600);
  await page.evaluate(() => {
    const api = window.__mt.api, st = window.__mt.getState();
    if (!api.__p253orig) api.__p253orig = api.call.bind(api);
    // 지어낸 이름: 오늘 일한 워크스페이스 여덟(today-*), 사흘 전 여덟(old-*), 각각 리드 하나와 하위 둘. 넓은 창에서 두 열이 되는 길이
    const oldAt = Date.now() - 3 * 86400e3, nowAt = Date.now() - 60e3;
    const ws = [...Array.from({ length: 8 }, (_, i) => ['d:/w/today-' + i, nowAt]), ...Array.from({ length: 8 }, (_, i) => ['d:/w/old-' + i, oldAt])];
    st.groups = [...(st.groups || []), { id: 'p253-today', name: 'today lab', members: ws.slice(0, 8).map((x) => x[0]) }, { id: 'p253-old', name: 'old lab', members: ws.slice(8).map((x) => x[0]) }];
    st.workspaces = [...st.workspaces, ...ws.map(([k], i) => ({ key: k, name: k.split('/').pop(), kind: 'folder', root: k, createdAt: 1e12 + i, counts: {}, worktrees: [] }))];
    const S = []; ws.forEach(([k, at], wi) => { S.push([`lead-${wi}`, k, null, at]); for (let j = 0; j < 2; j++) S.push([`kid-${wi}-${j}`, k, `lead-${wi}`, at]); });
    const fake = S.map(([name, k, parent, at], i) => ({ id: `s:${name}`, kind: 'session', sessionId: `fk-${name}`, name, agentKind: 'claude', state: 'sleeping', category: 'idle', workspaceKey: k, parentId: parent ? `s:${parent}` : null, lineageParent: parent ? `s:${parent}` : null, peers: [], createdAt: 1e12 + i, activeAt: at }));
    const fe = S.filter((s) => s[2]).map(([name, , parent]) => ({ from: `s:${parent}`, to: `s:${name}`, kind: 'spawn', count: 1 }));
    api.call = async (m, p) => { const r = await api.__p253orig(m, p); return m === 'mission.graph' ? { ...r, nodes: [...r.nodes, ...fake], edges: [...r.edges, ...fe] } : r; };
  });
  await openMap(page);
  await page.evaluate(() => window.__mtTa.fit()); await sleep(1200);
  const zs = [];
  for (const k of [0.12, 0.2, 0.35, 0.6, 1.0, 0.25]) {
    await page.evaluate((k) => { const v = window.__mtTa.view(); window.__mtTa.set({ k, x: v.x, y: v.y }); }, k);
    await sleep(1100); // 멈춘 뒤 이름표 계단이 바뀌면 배치를 다시 센다
    zs.push(await page.evaluate(() => ({ k: +window.__mtTa.view().k.toFixed(3), label: window.__mtTa.label(), ncol: window.__mtTa.lay().ncol })));
  }
  check('줌: 이름표 계단이 바뀌어도 열 수가 그대로(넓은 창이라 두 열)', new Set(zs.map((z) => z.ncol)).size === 1 && zs[0].ncol === 2 && new Set(zs.map((z) => z.label)).size > 1, zs);
  await page.evaluate(() => window.__mtTa.fit()); await sleep(1200);
  const za = await page.evaluate(() => ({ k: window.__mtTa.view().k, label: window.__mtTa.label(), ncol: window.__mtTa.lay().ncol }));
  await shot(page, '06-zoom-a-ko');
  await page.evaluate(() => { const v = window.__mtTa.view(); window.__mtTa.set({ k: v.k * 2.6, x: v.x * 2.6 - 300, y: v.y * 2.6 - 100 }); }); await sleep(1300);
  const zb = await page.evaluate(() => ({ k: window.__mtTa.view().k, label: window.__mtTa.label(), ncol: window.__mtTa.lay().ncol }));
  await shot(page, '07-zoom-b-ko');
  check('줌 그림 둘: 배율이 달라도 열 수 같음', za.ncol === zb.ncol && Math.abs(za.k - zb.k) > 0.05, { za, zb });
  fs.writeFileSync(path.join(OUT, 'zoom.json'), JSON.stringify({ steps: zs, za, zb }, null, 2));
  await closeMap(page);
  await page.evaluate(() => { const api = window.__mt.api; if (api.__p253orig) api.call = api.__p253orig; });
} catch (e) { check('예외 없이 끝남', false, e.stack || String(e)); }
finally {
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  log('결과 ' + results.filter((r) => r.ok).length + '/' + results.length);
  await closeApp(app);
  process.exit(results.every((r) => r.ok) ? 0 : 1);
}
