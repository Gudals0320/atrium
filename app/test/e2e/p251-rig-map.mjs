// P251 창 시험: rig 구조 지도(세션 맵 오른쪽 rig 영역)와 캔버스 길 선·꼬리표를 ko·en 그림으로. 참고 시안 2판과 같은 크기(1880×1312) 그림 하나, 세션 맵 성능 한 번.
// 판: 따로 띄운 개발용 판(atrium-dev-p251, 48004, 창 9484)만. 시험 폴더 C:\Workspace\mtask-p251-rig(rig: 역할 넷, 가지 하나), -base(셸 하나).
// 준비(판에 역할을 띄우고 한 바퀴·반려·raise를 만드는 것)는 이 시험 밖에서 한다(작업 기록). 실행: sh backend/.dev/dev.sh node app/test/e2e/p251-rig-map.mjs [round] [perf]
// 결과는 experiments/p251/<round>/(저장소 밖)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const TAG = process.argv[2] || 'round-1';
const PERF = process.argv[3] === 'perf';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const OUT = path.join(REPO, 'experiments', 'p251', TAG);
if (process.env.ATRIUM_TERMINAL_SESSION !== 'atrium-dev-p251' || process.env.ATRIUM_PORT !== '48004') throw new Error('개발용 판(atrium-dev-p251, 48004) 환경에서만 돈다');
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
fs.mkdirSync(OUT, { recursive: true });
const { logger, sleep, launch, closeApp } = await import('./harness.mjs');
const log = logger('p251-' + TAG);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 120000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 900) : '')); };
const WS = 'C:/Workspace/mtask-p251-rig';
const KEY = call('rig.status', { workspace: WS }).workspace;
async function lang(page, l) { call('settings.set', { key: 'language', value: l }); await page.waitForFunction((x) => document.documentElement.lang === x, l, { timeout: 10000 }).catch(() => {}); await sleep(500); }
const shot = async (page, name) => { await page.screenshot({ path: path.join(OUT, name + '.png') }); log('스크린숏 ' + name + '.png'); };

const { app, page } = await launch({ log, args: ['--remote-debugging-port=9484'] });
try {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1600, height: 1000 }).catch(() => {});
  await page.waitForFunction(() => !document.querySelector('[data-role=splash]'), null, { timeout: 30000 }).catch(() => log('splash 남음'));
  await page.waitForFunction((k) => window.__mt.getState().rigMaps.has(k), KEY, { timeout: 20000 });
  const roleIds = await page.evaluate((k) => [...window.__mt.getState().sessions.values()].filter((s) => s.workspaceKey === k && s.rigRole).map((s) => [s.rigRole, s.sessionId]), KEY);
  check('창의 세션 요약에 rigRole(역할 넷과 빌더 없음)', roleIds.length === 4, roleIds.map((x) => x[0]));
  for (const l of ['ko', 'en']) {
    await lang(page, l);
    // ---- 캔버스: 역할 노드를 한눈에(길 선·꼬리표) ----
    await page.evaluate((ids) => { const st = window.__mt.getState(); st.navigateTo && st.navigateTo(ids[0][1], { instant: true }); }, roleIds);
    await sleep(900);
    await page.evaluate((ids) => window.__mtFlow.fitView({ nodes: ids.map((x) => ({ id: x[1] })), padding: 0.08, duration: 0 }), roleIds);
    await sleep(1200);
    const cv = await page.evaluate(() => ({
      paths: [...document.querySelectorAll('[data-role=rig-edge-label]')].map((e) => [e.dataset.a, e.dataset.b, e.textContent]),
      raise: document.querySelectorAll('[data-role=rig-raise-label]').length,
      open: document.querySelectorAll('[data-role=rig-open-return]').length,
      tags: [...document.querySelectorAll('[data-role=rig-tag]')].map((e) => e.textContent),
      intake: document.querySelectorAll('[data-role=rig-intake]').length,
      links: window.__mt.getState().links.size,
    }));
    check('캔버스(' + l + '): 역할 쌍마다 길 선 하나(data|ideas, data|news, ideas|verify), 글, 열린 반려 붉은 점, 올림 점선, 꼬리표·입력 창구', cv.paths.length === 3 && cv.open >= 1 && cv.tags.length >= 4 && cv.intake === 1, cv);
    check('캔버스(' + l + '): 길 선은 연결 기록(link)이 아니다', cv.links === 0, { links: cv.links });
    await shot(page, '01-canvas-' + l);
    // 선 글을 누르면 그 길로 최근 오간 항목(끊기 없음)
    await page.click('[data-role=rig-edge-label][data-a=ideas][data-b=verify]');
    await sleep(500);
    const rec = await page.textContent('[data-role=rig-path-recent]').catch(() => '');
    check('캔버스(' + l + '): 길 선을 누르면 최근 항목, 끊기 단추 없음', /hypothesis-2/.test(rec) && !(await page.$('[data-role=rig-path-recent] [data-action=unlink]')), rec);
    await shot(page, '02-canvas-path-' + l);
    await page.click('[data-role=rig-edge-label][data-a=ideas][data-b=verify]');
    // ---- 세션 맵 ----
    await page.click('[data-action="mission-rail"]');
    await page.waitForSelector('[data-role="rig-map"]', { timeout: 20000 });
    await sleep(800);
    await page.evaluate(() => window.__mtTa.fit()); await sleep(900);
    const sm = await page.evaluate((k) => {
      const L = window.__mtTa.lay();
      const row = L.rows.find((r) => r.key === k), it = L.rig && L.rig.items.find((x) => x.key === k);
      const tree = [...L.cards.values()].map((c) => c.node.name);
      return { row: row ? { y: row.y } : null, map: it ? { y: it.y, x: it.x, w: it.w, h: it.h } : null, tree, roles: [...document.querySelectorAll('[data-role=rm-role]')].map((e) => e.dataset.name), lines: [...document.querySelectorAll('[data-role=rm-line]')].map((e) => e.dataset.kind), open: document.querySelectorAll('[data-role=rm-open-return]').length, head: document.querySelector('[data-role=rm-head]').textContent, cycle: document.querySelector('[data-role=rm-cycle]').textContent, link: !!document.querySelector('[data-role=rm-link]') };
    }, KEY);
    check('세션 맵(' + l + '): 역할·빌더 세션은 트리에 없고 지도에만, 지도 위가 워크스페이스 줄에 맞음, 줄에서 지도로 선', sm.map && sm.row && sm.map.y === sm.row.y + 12 && !sm.tree.some((n) => ['data', 'ideas', 'news', 'verify'].includes(n)) && sm.roles.length === 4 && sm.link, sm);
    check('세션 맵(' + l + '): 선 종류(곧은·답·사람·올림·고침)와 열린 반려 표시, 머리 띠, 사이클 띠', ['direct', 'answer', 'intake', 'raise', 'fix'].every((k) => sm.lines.includes(k)) && sm.open >= 1 && /hypothesis-2/.test(sm.cycle), { lines: sm.lines, open: sm.open, head: sm.head });
    await shot(page, '03-map-fit-' + l);
    // 지도만 크게
    await page.evaluate((m) => { const vw = window.innerWidth - window.__mtTa.sumW(), vh = window.innerHeight; const k = Math.min((vw - 40) / m.w, (vh - 240) / m.h); window.__mtTa.set({ k, x: 20 - m.x * k, y: 100 - m.y * k }); }, sm.map);
    await sleep(900);
    await shot(page, '04-map-' + l);
    await page.keyboard.press('Escape'); await sleep(600);
  }
  // ---- 참고 시안 2판과 같은 크기(1880×1312) ----
  await lang(page, 'ko');
  await page.setViewportSize({ width: 1880, height: 1312 }).catch(() => {});
  await sleep(800);
  await page.click('[data-action="mission-rail"]');
  await page.waitForSelector('[data-role="rig-map"]', { timeout: 20000 }); await sleep(800);
  const m2 = await page.evaluate((k) => { const it = window.__mtTa.lay().rig.items.find((x) => x.key === k); return { x: it.x, y: it.y, w: it.w, h: it.h }; }, KEY);
  await page.evaluate((m) => { const vw = window.innerWidth - window.__mtTa.sumW(), vh = window.innerHeight; const k = Math.min((vw - 40) / m.w, (vh - 200) / m.h); window.__mtTa.set({ k, x: 20 - m.x * k, y: 90 - m.y * k }); }, m2);
  await sleep(900);
  await shot(page, '05-map-1880x1312-ko');
  if (PERF) {
    // 세션 맵 성능(P210과 같은 뜻의 값을 창 안에서 간단히): 끌기(보기 옮김) 120프레임의 프레임 시간과 50ms 넘는 긴 작업, 배치 셈 수
    const perf = async (label) => page.evaluate(async (lb) => {
      const v0 = window.__mtTa.view(); const long = []; const po = new PerformanceObserver((l) => { for (const e of l.getEntries()) long.push(e.duration); }); try { po.observe({ type: 'longtask', buffered: false }); } catch {}
      const ts = []; let last = performance.now();
      for (let i = 0; i < 120; i++) { await new Promise((r) => requestAnimationFrame(r)); const now = performance.now(); ts.push(now - last); last = now; window.__mtTa.set({ k: v0.k, x: v0.x - i * 6, y: v0.y - i * 2 }); }
      po.disconnect(); window.__mtTa.set(v0);
      ts.sort((a, b) => a - b);
      return { label: lb, median: +ts[60].toFixed(2), p95: +ts[114].toFixed(2), max: +ts[119].toFixed(2), long: long.length, longMax: long.length ? Math.max(...long) : 0, stats: window.__mapStats ? JSON.parse(JSON.stringify(window.__mapStats)) : null };
    }, label);
    await page.evaluate(() => window.__mtTa.fit()); await sleep(1500);
    const a = await perf('rig on(지도 펼침)');
    await page.keyboard.press('Escape'); await sleep(400);
    call('rig.disable', { workspace: WS });
    await sleep(4000);
    await page.click('[data-action="mission-rail"]'); await page.waitForSelector('[data-role="rig-map"]', { timeout: 20000 }); await sleep(1500);
    await page.evaluate(() => window.__mtTa.fit()); await sleep(1500);
    const b = await perf('rig off(접힌 카드)');
    fs.writeFileSync(path.join(OUT, 'perf.json'), JSON.stringify({ a, b }, null, 2));
    check('세션 맵 성능: rig 지도가 있어도 끌기 프레임 중간값이 크게 나빠지지 않음', a.median < Math.max(b.median * 1.5, b.median + 6), { a, b });
    await shot(page, '06-map-off-folded-ko');
  }
  await page.keyboard.press('Escape');
} catch (e) { check('예외 없이 끝남', false, e.stack || String(e)); }
finally {
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  log('결과 ' + results.filter((r) => r.ok).length + '/' + results.length);
  await closeApp(app);
  process.exit(results.every((r) => r.ok) ? 0 : 1);
}
