// P249 창 시험: 옛 rig를 걷어낸 뒤의 rig 판과 영역 메뉴(이름에 3이 없음), 옛 꼴 정의의 한 줄 오류. ko·en 그림.
// 판: 따로 띄운 개발용 판(atrium-dev-p249, 48004, 창 9484)만. 시험 폴더 C:\Workspace\mtask-p249-rig(rig), -base(rig 없음), -old(version 2 정의).
// 실행: sh backend/.dev/dev.sh node app/test/e2e/p249-rig.mjs [round]. 결과는 experiments/p249/<round>/(저장소 밖)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const TAG = process.argv[2] || 'round-1';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const OUT = path.join(REPO, 'experiments', 'p249', TAG);
if (process.env.ATRIUM_TERMINAL_SESSION !== 'atrium-dev-p249' || process.env.ATRIUM_PORT !== '48004') throw new Error('개발용 판(atrium-dev-p249, 48004) 환경에서만 돈다');
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
fs.mkdirSync(OUT, { recursive: true });
const { logger, sleep, launch, closeApp } = await import('./harness.mjs');
const log = logger(`p249-${TAG}`);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 120000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ''}`); };
const RIG = call('rig.status', { workspace: 'C:/Workspace/mtask-p249-rig' }).workspace;
const BASE = call('rig.status', { workspace: 'C:/Workspace/mtask-p249-base' }).workspace;
const OLD = call('rig.status', { workspace: 'C:/Workspace/mtask-p249-old' }).workspace;
async function openMenu(page, key) {
  await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
  await page.evaluate((k) => window.__mt.selectWorkspace && window.__mt.selectWorkspace(k), key).catch(() => {});
  await sleep(800);
  await page.click(`.mt-region[data-ws="${key}"] .mt-region-name`, { button: 'right' });
  await page.waitForSelector('[data-role=region-menu] [data-role=rig-status]:not([data-rig=loading])', { timeout: 10000 });
  await sleep(300);
}
const no3 = (s) => !/rig ?3/i.test(s);
async function shotEl(page, sel, name) { await page.locator(sel).first().screenshot({ path: path.join(OUT, `${name}.png`) }); log(`스크린숏 ${name}.png`); }
async function lang(page, l) { call('settings.set', { key: 'language', value: l }); await page.waitForFunction((x) => document.documentElement.lang === x, l, { timeout: 10000 }).catch(() => {}); await sleep(400); }
const { app, page } = await launch({ log, args: ['--remote-debugging-port=9484'] });
try {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1600, height: 1000 }).catch(() => {});
  await page.waitForFunction(() => !document.querySelector('[data-role=splash]'), null, { timeout: 30000 }).catch(() => log('splash 남음'));
  for (const l of ['ko', 'en']) {
    await lang(page, l);
    await openMenu(page, RIG);
    const m = await page.textContent('[data-role=region-menu]');
    check(`영역 메뉴(rig 있음, ${l}): rig 줄과 rig 판 단추, 3 없음, 옛 만들기 없음`, no3(m) && !!(await page.$('[data-role=region-menu] [data-action=rig-panel]')) && !(await page.$('[data-role=region-menu] [data-action=rig-create]')), m);
    await shotEl(page, '[data-role=region-menu]', `01-menu-rig-${l}`);
    await page.click('[data-role=region-menu] [data-action=rig-panel]');
    await page.waitForSelector('[data-role=rig-panel] [data-role=rig-roles]', { timeout: 10000 });
    const pt = await page.textContent('[data-role=rig-panel]');
    check(`rig 판(${l}): 역할 표, 3 없음, 편집 표 없음`, no3(pt) && !(await page.$('[data-role=rig-seats], [data-role=rig-flow], [data-role=rig-results]')), pt.slice(0, 300));
    await shotEl(page, '[data-role=rig-panel]', `02-panel-rig-${l}`);
    await page.click('[data-role=rig-panel] [data-action=rig-panel-close]').catch(() => page.keyboard.press('Escape'));
    await sleep(500);
    await openMenu(page, BASE);
    const m2 = await page.textContent('[data-role=region-menu]');
    check(`영역 메뉴(rig 없음, ${l}): 빌더에게 말하기, 3 없음`, no3(m2) && !!(await page.$('[data-role=region-menu] [data-action=rig-builder]')), m2);
    await shotEl(page, '[data-role=region-menu]', `03-menu-none-${l}`);
    await page.keyboard.press('Escape'); await sleep(300);
    await openMenu(page, OLD);
    const m3 = await page.textContent('[data-role=region-menu] [data-role=rig-status]');
    check(`영역 메뉴(옛 꼴 정의, ${l}): 한 줄 오류`, /version 2/.test(m3), m3);
    await page.click('[data-role=region-menu] [data-action=rig-panel]');
    await page.waitForSelector('[data-role=rig-panel]', { timeout: 10000 });
    await sleep(800);
    await shotEl(page, '[data-role=rig-panel]', `04-panel-old-${l}`);
    await page.click('[data-role=rig-panel] [data-action=rig-panel-close]').catch(() => page.keyboard.press('Escape'));
    await sleep(500);
  }
  await lang(page, 'ko');
} catch (e) { check('예외 없이 끝남', false, e.stack || String(e)); }
finally {
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  log(`결과 ${results.filter((r) => r.ok).length}/${results.length}`);
  await closeApp(app);
  process.exit(results.every((r) => r.ok) ? 0 : 1);
}
