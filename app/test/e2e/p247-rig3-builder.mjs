// P247 창 시험: rig 판의 "빌더에게 말하기"(rig가 없는 워크스페이스, rig 3 판), ko·en 그림.
// 판: 따로 띄운 개발용 판(atrium-dev-p247, 48004, 창 9484)만. 시험 폴더 C:\Workspace\mtask-p247-rig.
// 실행: sh backend/.dev/dev.sh node app/test/e2e/p247-rig-builder.mjs <talk|shots> [round] ["말"]   결과는 backend/.dev/p247-exp/<round>/(저장소 밖)
//   talk: rig 판(rig 없음)에서 빌더 줄을 찍고 말하기로 글을 넣는다. shots: rig 3 판의 빌더 줄과 역할 표(ko·en)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const MODE = process.argv[2] || 'shots';
const TAG = process.argv[3] || 'round-1';
const SAY = process.argv[4] || '';
const WS = process.env.P247_WS || 'C:/Workspace/mtask-p247-rig';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const OUT = path.join(REPO, 'backend', '.dev', 'p247-exp', TAG);
if (process.env.ATRIUM_TERMINAL_SESSION !== 'atrium-dev-p247' || process.env.ATRIUM_PORT !== '48004') throw new Error('개발용 판(atrium-dev-p247, 48004) 환경에서만 돈다');
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
fs.mkdirSync(OUT, { recursive: true });
const { logger, sleep, launch, closeApp } = await import('./harness.mjs');
const log = logger('p247-' + MODE + '-' + TAG);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 120000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 800)) : '')); };
const ko = (await import('../../src/renderer/locales/ko.js')).default;
const en = (await import('../../src/renderer/locales/en.js')).default;
const st0 = call('rig.get', { workspace: WS });
const KEY = st0.workspace;
async function regionMenu(page, action, sel) {
  await page.click('.mt-region[data-ws="' + KEY + '"] .mt-region-name', { button: 'right' });
  await page.waitForSelector('[data-role=region-menu] [data-action=' + action + ']', { timeout: 8000 });
  await page.click('[data-role=region-menu] [data-action=' + action + ']');
  await page.waitForSelector(sel, { timeout: 10000 });
}
async function shotEl(page, sel, name) { await page.locator(sel).first().screenshot({ path: path.join(OUT, name + '.png') }); log('스크린숏 ' + name + '.png'); }
async function lang(page, l) { call('settings.set', { key: 'language', value: l }); await page.waitForFunction((x) => document.documentElement.lang === x, l, { timeout: 10000 }).catch(() => {}); await sleep(400); }

const { app, page } = await launch({ log, args: ['--remote-debugging-port=9484'] });
try {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1600, height: 1100 }).catch(() => {});
  await page.waitForFunction(() => !document.querySelector('[data-role=splash]'), null, { timeout: 30000 }).catch(() => log('splash 남음'));
  if (MODE === 'talk') {
    await lang(page, 'ko');
    const panel = st0.status === 'none' ? '[data-role=rig-panel]' : '[data-role=rig-panel]';
    await regionMenu(page, st0.status === 'none' ? 'rig-builder' : 'rig-panel', panel);
    await page.waitForSelector('[data-role=rig-builder]', { timeout: 10000 });
    const line = await page.locator('[data-role=rig-builder]').innerText();
    check('rig 판에 빌더 줄과 말하기 단추', line.includes(ko.rigBuilder.h) && (await page.locator('[data-action=rig-builder-talk]').count()) === 1, line);
    await shotEl(page, panel, '01-builder-' + (st0.status === 'none' ? 'norig' : 'rig3') + '-ko');
    await page.click('[data-action=rig-builder-talk]');
    await page.fill('[data-role=rig-builder-text]', SAY);
    await shotEl(page, '[data-role=rig-builder]', '02-builder-say-ko');
    await page.click('[data-action=rig-builder-go]');
    await page.waitForSelector(panel, { state: 'detached', timeout: 10000 }).catch(() => {});
    await sleep(1500);
    const sel = await page.evaluate(() => window.__mt.getState().focusId).catch(() => null);
    check('말하기 뒤 창이 닫히고 빌더로 간다', !(await page.locator(panel).count()), { focus: sel });
  } else if (MODE === 'switch-on') {
    await lang(page, 'ko');
    await regionMenu(page, 'rig-panel', '[data-role=rig-panel]');
    await page.waitForSelector('[data-action=rig-enable]', { timeout: 10000 });
    await page.click('[data-action=rig-enable]');
    await page.waitForSelector('[data-role=rig-confirm]', { timeout: 5000 });
    await shotEl(page, '[data-role=rig-panel]', '03-rig3-enable-confirm-ko');
    await page.click('[data-action=rig-confirm-on]');
    let roles = [];
    for (let i = 0; i < 60; i++) { await sleep(1000); const s = call('rig.status', { workspace: WS }); roles = (s.rig3 ? s.rig3.roles : []).map((r) => [r.name, r.session && r.session.name]); if (s.state === 'on' && roles.length && roles.every((r) => r[1])) break; }
    check('켜기 한 번으로 역할 세션이 모두 뜬다', roles.length >= 2 && roles.every((r) => r[1]), roles);
  } else {
    for (const l of ['ko', 'en']) {
      await lang(page, l);
      await regionMenu(page, 'rig-panel', '[data-role=rig-panel]');
      await page.waitForSelector('[data-role=rig-builder-session]', { timeout: 10000 });
      const t = await page.locator('[data-role=rig-builder]').innerText();
      const D = l === 'ko' ? ko : en;
      check('rig 3 판의 빌더 줄(' + l + ')', t.includes(D.rig3Builder.h) && t.includes('@builder') && t.includes(D.rig3Builder.talk), t);
      await shotEl(page, '[data-role=rig-panel]', '04-rig3-panel-builder-' + l);
      await page.click('[data-action=rig-panel-close]');
      await sleep(300);
    }
    await lang(page, 'ko');
  }
} finally {
  fs.writeFileSync(path.join(OUT, 'results-' + MODE + '.json'), JSON.stringify(results, null, 2));
  await closeApp(app).catch(() => {});
}
const bad = results.filter((r) => !r.ok);
log(bad.length ? 'FAIL ' + bad.length + '/' + results.length : 'ALL PASS ' + results.length);
process.exit(bad.length ? 1 : 0);
