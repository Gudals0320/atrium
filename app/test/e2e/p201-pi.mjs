// P201 창 시험: pi 호출자의 모델 드롭다운(pi --list-models 목록)과 답한 pi 카드. 따로 띄운 개발용 판(P201_BOARD, P201_PORT, P201_DATA)만, 창 원격 디버깅 포트 P201_DEBUG.
// 실행: node app/test/e2e/p201-pi.mjs <시험 폴더>   (실제 판 변수를 지운 셸에서, 백엔드는 CLI로 먼저 띄운다. 판에 pi 세션이 하나 이상 답해 있어야 카드 그림이 뜻있다)
//   1) 호출자 편집 틀: pi 호출자의 모델 칸을 누르면 pi 모델 목록(제공자/ID)이 뜬다. 연결을 고르면 목록이 없다
//   2) 판: pi 카드(답한 모습)
// 그림은 ko·en 하나씩. 결과는 워크트리의 experiments/p201/shots/(저장소 밖).
import fs from 'node:fs';
import path from 'node:path';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const OUT = path.join(REPO, 'experiments', 'p201', 'shots');
const BOARD = process.env.P201_BOARD || 'atrium-dev-p201', PORT = process.env.P201_PORT || '47970', DEBUG = process.env.P201_DEBUG || '9450';
const DATA = process.env.P201_DATA || path.join(REPO, 'backend', '.dev', 'data');
const DIR = process.argv[2] || 'C:/Workspace/mtask-p201-pi';
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_|HC_)/.test(k)) delete process.env[k];
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
const ENV = {
  ATRIUM_TERMINAL_SESSION: BOARD, ATRIUM_HERDR_SESSION: BOARD, ATRIUM_PORT: PORT, ATRIUM_DATA_DIR: DATA, ATRIUM_APP_USERDATA: process.env.P201_APP || path.join(REPO, 'backend', '.dev', 'app'),
  ATRIUM_CLAUDE_PROJECTS: path.join(REPO, 'backend', '.dev', 'noprojects'), ATRIUM_CLAUDE_DESKTOP: 'none', ATRIUM_AGY: 'none', ATRIUM_TEST_PREFIX: 'p201-none-',
};
Object.assign(process.env, ENV);
fs.mkdirSync(OUT, { recursive: true });
const { logger, sleep, launch, closeApp } = await import('./harness.mjs');
const { assertTestBoard } = await import('./p9-guard.mjs');
assertTestBoard(ENV);
const log = logger('p201-pi');
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 1200)}` : ''}`); };
const until = async (fn, ms = 8000, step = 250) => { const t0 = Date.now(); for (;;) { const v = await fn().catch(() => null); if (v) return v; if (Date.now() - t0 > ms) return null; await sleep(step); } };

const { app, page } = await launch({ log, env: { ...ENV }, args: [`--remote-debugging-port=${DEBUG}`] });
const call = (m, p) => page.evaluate(([m, p]) => window.__mt.api.call(m, p), [m, p]);
const lang = async (l) => { await call('settings.set', { key: 'language', value: l }); await sleep(500); };
const shot = async (name, l, sel = null) => {
  const file = path.join(OUT, `${name}-${l}.png`);
  const el = sel ? await page.$(sel) : null;
  if (el) await el.screenshot({ path: file }); else await page.screenshot({ path: file });
  log(`shot ${name}-${l}`);
};
const esc = async () => { for (let i = 0; i < 3; i++) { await page.keyboard.press('Escape').catch(() => {}); await sleep(150); } };

try {
  await app.evaluate(({ BrowserWindow, screen }) => { const w = BrowserWindow.getAllWindows()[0]; const left = Math.min(...screen.getAllDisplays().map((d) => d.bounds.x)); const b = w.getBounds(); w.setPosition(left - b.width - 200, 40); }).catch(() => {});
  await page.setViewportSize({ width: 1584, height: 921 }).catch(() => {});
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' });
  await sleep(2000);
  await call('workspace.open', { path: DIR }).catch((e) => log(`workspace.open ${e.message}`));
  await sleep(800);
  let L = await call('launcher.list', {});
  if (!L.launchers.some((l) => l.name === 'pi')) await call('launcher.create', { launcher: { name: 'pi', harness: 'pi', icon: '', model: 'anthropic/claude-haiku-4-5', effort: '', permissionMode: 'manual', args: '', env: '', command: '', connection: '', startCommand: '' }, favorite: true });
  // pi 목록은 처음 물을 때 뒤에서 받는다. 받을 때까지 다시 묻는다
  L = await until(async () => { const x = await call('launcher.list', {}); const h = x.harnesses.find((y) => y.id === 'pi'); return h && h.models.length ? x : null; }, 15000, 1000) || await call('launcher.list', {});
  const piH = L.harnesses.find((h) => h.id === 'pi');
  check('하네스 표의 pi 모델 목록(source pi, 제공자/ID)', piH && piH.modelSource === 'pi' && piH.models.length > 0 && piH.models.every((m) => /^[^/]+\/[^/]+$/.test(m)), piH && { n: piH.models.length, first: piH.models.slice(0, 3), source: piH.modelSource });
  const piL = L.launchers.find((l) => l.name === 'pi');

  for (const l of ['ko', 'en']) {
    await lang(l);
    await esc();
    // ---------- 2) 판의 pi 카드 ----------
    await page.click('[data-action=chip-fit]').catch(() => {}); await sleep(1200);
    await shot('02-board', l);
    const nodes = await page.$$('.react-flow__node:has(img.mt-kind-icon[data-kind=pi])');
    check(`[${l}] 판에 pi 카드`, nodes.length > 0, { n: nodes.length });
    if (nodes[0]) { await nodes[0].screenshot({ path: path.join(OUT, `02-node-${l}.png`) }); log(`shot 02-node-${l}`); }

    // ---------- 1) 호출자 편집 틀의 모델 드롭다운 ----------
    await page.click('[data-action=settings-open]');
    await until(() => page.$('[data-role=settings]'), 5000);
    await page.click('[data-role=settings] [data-tab=launchers]');
    await until(() => page.$('[data-role=launchers-list]'), 5000);
    await sleep(400);
    await page.click(`[data-role=launcher-row][data-launcher="${piL.id}"] [data-action=launcher-edit]`);
    await until(() => page.$('[data-role=launcher-form]'), 5000);
    await sleep(500);
    await page.fill('[data-field=launcher-model]', '');
    await page.click('[data-field=launcher-model]');
    const opts = await until(async () => { const v = await page.$$eval('[data-role=launcher-models] [data-model]', (xs) => xs.map((x) => x.getAttribute('data-model'))); return v.length ? v : null; }, 4000);
    check(`[${l}] 모델 칸 목록에 pi 모델(anthropic/…, deepseek/…)`, opts && opts.length === piH.models.length && opts.some((m) => m.startsWith('deepseek/')) && opts.some((m) => m.startsWith('anthropic/')), opts);
    await shot('01-model-dropdown', l, '[data-role=settings]');
    fs.writeFileSync(path.join(OUT, `01-options-${l}.json`), JSON.stringify(opts, null, 2));
    // 고르기: 누르면 칸에 들어간다
    await page.click('[data-role=launcher-models] [data-model="deepseek/deepseek-flash"]').catch(() => {});
    await sleep(300);
    const picked = await page.$eval('[data-field=launcher-model]', (x) => x.value);
    check(`[${l}] 목록에서 고른 값이 칸에 든다`, picked === 'deepseek/deepseek-flash', picked);
    await page.click('[data-action=launcher-cancel]');
    await esc();
  }
} catch (e) {
  check('시험 중 오류 없음', false, String(e && e.stack || e));
} finally {
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  const bad = results.filter((x) => !x.ok);
  log(`결과 ${results.length - bad.length}/${results.length} 통과`);
  await closeApp(app);
  process.exit(bad.length ? 1 : 0);
}
