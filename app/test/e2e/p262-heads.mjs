// P262 창 시험: rig 화살촉 가까이 보기(전·후 그림)와 화살촉 방향 = 그린 선 끝 방향 재기.
// 실행: sh backend/.dev/dev.sh node app/test/e2e/p262-heads.mjs <round> <시험 폴더> <역할> [raise]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const TAG = process.argv[2] || 'heads', WS = process.argv[3], ROLE = process.argv[4] || 'verify', RAISE = process.argv[5] === 'raise';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const OUT = path.join(REPO, 'experiments', 'p262', TAG);
if (process.env.ATRIUM_TERMINAL_SESSION !== 'atrium-dev-p262' || process.env.ATRIUM_PORT !== '48012') throw new Error('개발용 판(atrium-dev-p262, 48012) 환경에서만 돈다');
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
fs.mkdirSync(OUT, { recursive: true });
const { logger, sleep, launch, closeApp } = await import('./harness.mjs');
const log = logger('p262-heads-' + TAG);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 120000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const KEY = call('rig.status', { workspace: WS }).workspace;
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log((ok ? 'PASS ' : 'FAIL ') + name + ' — ' + JSON.stringify(detail).slice(0, 1200)); };
const { app, page } = await launch({ log, args: ['--remote-debugging-port=9493'] });
try {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1600, height: 1000 }).catch(() => {});
  await page.waitForFunction((k) => window.__mt.getState().rigMaps.has(k), KEY, { timeout: 30000 });
  await sleep(1500);
  if (RAISE) await page.evaluate((key) => { const st = window.__mt.getState(); const m = st.rigMaps.get(key); st.rigMaps = new Map(st.rigMaps).set(key, { ...m, raises: [{ id: 'raise-1', role: (m.roles[0] || {}).name, reason: 'test', t: Date.now() }] }); }, KEY);
  await sleep(1200);
  for (const z of [0.55, 0.2]) {
    await page.evaluate(({ key, role, z }) => { const st = window.__mt.getState(); const s = [...st.sessions.values()].find((x) => x.workspaceKey === key && x.rigRole === role); const n = st.nodes.get(s.sessionId); window.__mtFlow.setViewport({ x: 800 - (n.x + n.w / 2) * z, y: 480 - (n.y + n.h * 0.1) * z, zoom: z }, { duration: 0 }); }, { key: KEY, role: ROLE, z });
    await sleep(1800);
    // 화살촉 방향(그린 화살촉의 꼭짓점 → 밑변 가운데)과 그린 선 끝 방향(마지막 짧은 구간)
    const f = await page.evaluate(() => [...document.querySelectorAll('[data-role=rig-head]')].map((h) => {
      const line = h.parentElement.querySelector('[data-role=rig-line]');
      const pts = (h.getAttribute('d').match(/-?[\d.]+/g) || []).map(Number); // M tip L b1 L b2 Z
      const tip = [pts[0], pts[1]], base = [(pts[2] + pts[4]) / 2, (pts[3] + pts[5]) / 2];
      const L = line.getTotalLength(), e = line.getPointAtLength(L), q = line.getPointAtLength(Math.max(0, L - 1.5));
      const ah = Math.atan2(tip[1] - base[1], tip[0] - base[0]) * 180 / Math.PI, al = Math.atan2(e.y - q.y, e.x - q.x) * 180 / Math.PI;
      let d = Math.abs(ah - al) % 360; if (d > 180) d = 360 - d;
      const gap = Math.hypot(base[0] - e.x, base[1] - e.y);
      return { from: line.dataset.from, to: line.dataset.to, ah: Math.round(ah), al: Math.round(al), diff: Math.round(d * 10) / 10, gap: Math.round(gap * 10) / 10 };
    }));
    if (f.length) check('배율 ' + z + ': 화살촉이 그린 선 끝 방향을 따른다(차이 ≤ 3도, 선 끝이 화살촉 밑변에 닿는다)', f.every((x) => x.diff <= 3 && x.gap <= 1.5), f);
    await shot(page, 'heads-' + ROLE + '-z' + String(z).replace('.', ''));
  }
} catch (e) { check('예외 없음', false, String(e && e.stack || e)); }
finally {
  fs.writeFileSync(path.join(OUT, 'results-heads-' + ROLE + '.json'), JSON.stringify(results, null, 2));
  log('결과 ' + results.filter((r) => r.ok).length + '/' + results.length);
  try { await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach((w) => w.close())); } catch {}
  await sleep(1500); await closeApp(app);
  process.exit(results.every((r) => r.ok) ? 0 : 1);
}
async function shot(page, name) { await page.screenshot({ path: path.join(OUT, name + '.png') }); log('그림 ' + name + '.png'); }
