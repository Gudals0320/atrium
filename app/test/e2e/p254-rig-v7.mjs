// P254 창 시험: 시안 V7 "새 rig · 캔버스의 길 선"을 캔버스와 세션 맵에 그대로 옮긴 것을 찍는다. 실제 정의 rig-trade를 옮긴 시험 폴더.
// 판: 따로 띄운 개발용 판(atrium-dev-p254, 48004, 창 9484)만. 시험 폴더 C:\Workspace\mtask-p254-trade(rig-trade 정의, haiku, 빈 도구).
// 준비(켜기, 씨앗·박자, 반려·올림)는 이 시험 밖에서 한다(작업 기록). 실행: sh backend/.dev/dev.sh node app/test/e2e/p254-rig-v7.mjs [round]
// 결과는 experiments/p254/<round>/(저장소 밖)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const TAG = process.argv[2] || 'round-1';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const OUT = path.join(REPO, 'experiments', 'p254', TAG);
if (process.env.ATRIUM_TERMINAL_SESSION !== 'atrium-dev-p254' || process.env.ATRIUM_PORT !== '48004') throw new Error('개발용 판(atrium-dev-p254, 48004) 환경에서만 돈다');
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
fs.mkdirSync(OUT, { recursive: true });
const { logger, sleep, launch, closeApp } = await import('./harness.mjs');
const log = logger('p254-' + TAG);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 120000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 1500) : '')); };
const WS = 'C:/Workspace/mtask-p254-trade';
const KEY = call('rig.status', { workspace: WS }).workspace;
async function lang(page, l) { call('settings.set', { key: 'language', value: l }); await page.waitForFunction((x) => document.documentElement.lang === x, l, { timeout: 10000 }).catch(() => {}); await sleep(600); }
const shot = async (page, name, clip) => { await page.screenshot({ path: path.join(OUT, name + '.png'), ...(clip ? { clip } : {}) }); log('그림 ' + name + '.png'); };
const openMap = async (page) => { if (!(await page.$('[data-role=mission]'))) await page.click('[data-action="mission-rail"]'); await page.waitForSelector('[data-role="rig-map"]', { timeout: 20000 }); await sleep(900); };
const closeMap = async (page) => { await page.keyboard.press('Escape'); await sleep(600); };

const { app, page } = await launch({ log, args: ['--remote-debugging-port=9484'] });
try {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1600, height: 1000 }).catch(() => {});
  await page.waitForFunction(() => !document.querySelector('[data-role=splash]'), null, { timeout: 30000 }).catch(() => log('splash 남음'));
  await page.waitForFunction((k) => window.__mt.getState().rigMaps.has(k), KEY, { timeout: 20000 });
  const ids = await page.evaluate((k) => Object.fromEntries([...window.__mt.getState().sessions.values()].filter((s) => s.workspaceKey === k && s.rigRole).map((s) => [s.rigRole, s.sessionId])), KEY);
  check('역할 세션 넷과 빌더', ['data', 'ideas', 'verify', 'trade', '@builder'].every((r) => ids[r]), Object.keys(ids));
  // ---- 캔버스 노드를 시안 자리(카드 184, 칸 간격 288, 빌더는 trade 아래 104)로: 배율 k = 184 / 노드 폭 ----
  const nodeW = await page.evaluate((id) => { const n = window.__mt.getState().nodes.get(id); return n ? [n.w, n.h] : null; }, ids.data);
  const k = 184 / nodeW[0];
  const X0 = 0, Y0 = 0;
  const pos = { data: 0, ideas: 1, verify: 2, trade: 3 };
  for (const [r, i] of Object.entries(pos)) call('board.setNode', { session: ids[r], x: X0 + i * 288 / k, y: Y0, w: nodeW[0], h: nodeW[1], cause: 'test' });
  call('board.setNode', { session: ids['@builder'], x: X0 + 3 * 288 / k, y: Y0 + (96 + 104) / k, w: nodeW[0], h: nodeW[1], cause: 'test' });
  await sleep(1500);
  for (const l of ['ko', 'en']) {
    await lang(page, l);
    await page.evaluate((sid) => { const st = window.__mt.getState(); st.navigateTo && st.navigateTo(sid, { instant: true }); }, ids.data);
    await sleep(900);
    const box = await page.evaluate(() => { const r = document.querySelector('.react-flow').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
    // 시안 판 1240×544 안에서 데이터 관리 카드 왼쪽 위 = (64, 200). 잘라 낼 칸의 왼쪽 위 = 캔버스 칸 + (40, 40)
    const cx = box.x + 40, cy = box.y + 40;
    await page.evaluate(([k, x, y]) => window.__mtFlow.setViewport({ zoom: k, x, y }), [k, cx - box.x + 64 - X0 * k, cy - box.y + 200 - Y0 * k]);
    await sleep(1400);
    const cv = await page.evaluate(() => ({
      lines: [...document.querySelectorAll('[data-role=rig-line]')].map((e) => [e.dataset.line, e.dataset.from, e.dataset.to, e.getAttribute('stroke'), Math.round(e.getAttribute('stroke-width') * 1000) / 1000]),
      labels: [...document.querySelectorAll('[data-role=rig-edge-label]')].map((e) => [e.dataset.line, e.textContent]),
      wait: [...document.querySelectorAll('[data-role=rig-wait]')].map((e) => e.textContent),
      dots: document.querySelectorAll('[data-role=rig-open-return]').length, raise: [...document.querySelectorAll('[data-role=rig-raise-label]')].map((e) => e.textContent),
      tags: [...document.querySelectorAll('[data-role=rig-tag]')].map((e) => e.textContent),
    }));
    check(`캔버스(${l}): 쌍마다 방향별 두 줄(한쪽 길만이면 한 줄), 글, 올림, 꼬리표`, cv.lines.length >= 7 && cv.labels.length === cv.lines.length && cv.raise.length >= 1 && cv.tags.some((x) => /v\d/.test(x)), cv);
    await shot(page, `01-canvas-v7-${l}`, { x: cx, y: cy, width: 1240, height: 544 });
    // ---- 세션 맵: 그 워크스페이스 폴더 안 rig, 고정된 칸 머리 ----
    await openMap(page);
    await page.evaluate(() => window.__mtTa.fit()); await sleep(900);
    const f = await page.evaluate((key) => {
      const L = window.__mtTa.lay(); const r = (L.rigs || []).find((x) => x.key === key); const row = L.rows.find((x) => x.key === key);
      const q = (s) => [...document.querySelectorAll(s)];
      return { rig: r, row: row && { y: row.y, h: row.h, x: row.x }, band: !!document.querySelector('[data-role=rig-band]'), cols: (document.querySelector('[data-role=ln-cols]') || {}).style?.transform || '',
        roles: q('[data-role=rm-role]').map((e) => e.dataset.name), pairs: q('[data-role=rm-pair]').map((e) => e.dataset.a + '|' + e.dataset.b + (e.dataset.lit === '1' ? '*' : '')),
        labels: q('[data-role=rm-line-label]').map((e) => e.textContent), raise: q('[data-role=rm-raise]').length, builder: (document.querySelector('[data-role=rm-builder]') || {}).textContent, tree: [...L.cards.values()].map((c) => c.node.name) };
    }, KEY);
    check(`세션 맵(${l}): rig는 그 워크스페이스 줄 안, 맨 위 띠 없음, 칸 머리 고정, 이웃한 쌍만, 역할은 트리에 없음`, f.rig && f.row && f.rig.y >= f.row.y && f.rig.y + f.rig.h <= f.row.y + f.row.h && !f.band && !f.cols && f.pairs.length === 3 && !f.tree.some((n) => /^(data|ideas|verify|trade)$/.test(n)), f);
    await shot(page, `02-map-fit-${l}`);
    // rig 묶음을 크게(칸 머리가 보이게 위쪽 여백)
    await page.evaluate((r) => { const v = window.__mtTa; const k = 1300 / r.w; v.set({ k, x: 120 - r.x * k, y: v.top + 120 - r.y * k }); }, f.rig);
    await sleep(900);
    await shot(page, `03-map-rig-${l}`);
    await closeMap(page);
  }
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
