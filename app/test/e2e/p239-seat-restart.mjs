// P239 창 시험(rig2-design 11.18 2단계): rig 판 자리 표의 "권한 바뀜: 다음 시작부터"(stale), 응답 필요의 권한 모드 카드(drift). ko·en 그림.
// 판: 따로 띄운 개발용 판(atrium-dev-p239, 48004, 창 9484)만. 시험 폴더 C:\Workspace\mtask-p239-a(손으로 쓴 rig: main keep scoped haiku), git 없음.
// 에이전트 쪽 걸음(요청 보내기, 정의 바꾸기, Shift+Tab)은 시험하는 쪽이 CLI로 하고, 이 스크립트는 그 상태를 창에서 본다.
// 실행: node backend/.dev/mt.cjs node app/test/e2e/p239-seat-restart.mjs <stale|drift|drift-gone> [round]   결과는 experiments/p239/<round>/(저장소 밖)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const STAGE = process.argv[2] || 'stale';
const TAG = process.argv[3] || 'round-1';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const OUT = path.join(REPO, 'experiments', 'p239', TAG);
const A = 'c:/workspace/mtask-p239-a';
if (process.env.ATRIUM_TERMINAL_SESSION !== 'atrium-dev-p239' || process.env.ATRIUM_PORT !== '48004') throw new Error('개발용 판(atrium-dev-p239, 48004) 환경에서만 돈다');
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
fs.mkdirSync(OUT, { recursive: true });
const { logger, sleep, launch, closeApp } = await import('./harness.mjs');
const log = logger(`p239-${STAGE}-${TAG}`);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 120000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 1500)}` : ''}`); };
const ko = (await import('../../src/renderer/locales/ko.js')).default;
const en = (await import('../../src/renderer/locales/en.js')).default;
const D = { ko, en };
const fill = (s, v) => String(s).replace(/\{(\w+)\}/g, (m, k) => (v[k] != null ? String(v[k]) : m));

async function setLang(page, lang) {
  call('settings.set', { key: 'language', value: lang });
  await page.waitForFunction((l) => document.documentElement.lang === l, lang, { timeout: 10000 }).catch(() => {});
  await sleep(400);
}
async function regionMenu(page, ws, action, sel) {
  await page.click(`.mt-region[data-ws="${ws}"] .mt-region-name`, { button: 'right' });
  await page.waitForSelector(`[data-role=region-menu] [data-action=${action}]`, { timeout: 8000 });
  await page.click(`[data-role=region-menu] [data-action=${action}]`);
  await page.waitForSelector(sel, { timeout: 10000 });
}
async function shotEl(page, sel, name) { await page.locator(sel).first().screenshot({ path: path.join(OUT, `${name}.png`) }); log(`스크린숏 ${name}.png`); }

const { app, page } = await launch({ log, args: ['--remote-debugging-port=9484'] });
try {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1600, height: 1000 }).catch(() => {});
  await page.waitForFunction(() => !document.querySelector('[data-role=splash]'), null, { timeout: 30000 }).catch(() => log('splash 남음'));
  await page.waitForSelector(`.mt-region[data-ws="${A}"]`, { timeout: 20000 });
  if (STAGE === 'stale') {
    // rig 판 자리 표: 떠 있는 keep 자리 main의 권한이 정의와 달라 "권한 바뀜: 다음 시작부터"
    for (const lang of ['ko', 'en']) {
      await setLang(page, lang);
      await regionMenu(page, A, 'rig-panel', '[data-role=rig-panel]');
      await page.waitForSelector('[data-role=rig-seats] [data-role=rig-perm-stale]', { timeout: 15000 });
      const x = await page.$eval('[data-role=rig-seats] [data-role=rig-perm-stale]', (e) => ({ text: e.textContent, tip: e.getAttribute('title') }));
      check(`[${lang}] 권한 바뀜 표시`, x.text === D[lang].rigP239.stale && x.tip === D[lang].rigP239.staleTip, x);
      await shotEl(page, '[data-role=rig-seats]', `01-seats-stale-${lang}`);
      await shotEl(page, '[data-role=rig-panel]', `02-panel-stale-${lang}`);
      await page.click('[data-role=rig-panel] [data-action=rig-panel-close]');
    }
  } else if (STAGE === 'stale-gone') {
    await setLang(page, 'ko');
    await regionMenu(page, A, 'rig-panel', '[data-role=rig-panel]');
    await page.waitForSelector('[data-role=rig-seats] .mt-rigpanel-sess', { timeout: 15000 });
    await sleep(1000);
    check('다시 뜬 뒤 권한 바뀜 표시 없음', !(await page.$('[data-role=rig-perm-stale]')));
    await shotEl(page, '[data-role=rig-seats]', '03-seats-after-restart-ko');
    await page.click('[data-role=rig-panel] [data-action=rig-panel-close]');
  } else {
    // 응답 필요: 권한 모드 카드(drift) 하나, 또는 default로 돌아와 사라짐(drift-gone)
    const asks = call('rig.asks', {}).asks.filter((a) => a.kind === 'mode_drift');
    for (const lang of ['ko', 'en']) {
      await setLang(page, lang);
      if (STAGE !== 'drift' && !(await page.waitForSelector('[data-role=inbox]', { timeout: 5000 }).catch(() => null))) { // 차례가 하나도 없으면 "내 차례" 단추가 없다
        check(`[${lang}] default로 돌아와 카드 없음(내 차례 단추도 없음)`, !asks.length);
        await page.screenshot({ path: path.join(OUT, `06-board-after-${lang}.png`) });
        continue;
      }
      await page.waitForSelector('[data-role=inbox]', { timeout: 20000 });
      if (!(await page.$('[data-role=inbox-list]'))) await page.click('[data-role=inbox]');
      if (STAGE === 'drift') {
        check(`[${lang}] 판의 카드 하나`, asks.length === 1, asks);
        await page.waitForSelector('[data-role=rig-ask][data-kind=mode_drift]', { timeout: 15000 });
        const n = await page.$$eval('[data-role=rig-ask][data-kind=mode_drift]', (xs) => xs.length);
        const c = await page.$eval('[data-role=rig-ask][data-kind=mode_drift]', (x) => ({ title: x.querySelector('.mt-rigask-title').textContent, btns: x.querySelectorAll('button').length, tip: x.getAttribute('title') }));
        check(`[${lang}] 카드 글`, n === 1 && c.title === fill(D[lang].rigP239.modeDrift, { seat: 'main', mode: asks[0] && asks[0].mode }) && c.btns === 0 && c.tip === D[lang].rigP239.modeTip, c);
        await shotEl(page, '[data-role=rig-ask][data-kind=mode_drift]', `04-mode-card-${lang}`);
        await shotEl(page, '[data-role=inbox-list]', `05-inbox-mode-${lang}`);
      } else {
        await sleep(1000);
        check(`[${lang}] default로 돌아와 카드 없음`, !asks.length && !(await page.$('[data-role=rig-ask][data-kind=mode_drift]')));
        if (await page.$('[data-role=inbox-list]')) await shotEl(page, '[data-role=inbox-list]', `06-inbox-after-${lang}`);
      }
      await page.click('[data-role=inbox]');
    }
  }
} catch (e) {
  check('예외 없음', false, e.stack);
  await page.screenshot({ path: path.join(OUT, `error-${STAGE}.png`) }).catch(() => {});
} finally {
  call('settings.set', { key: 'language', value: 'ko' });
  fs.writeFileSync(path.join(OUT, `results-${STAGE}.json`), JSON.stringify(results, null, 2));
  await closeApp(app).catch(() => {});
}
const bad = results.filter((r) => !r.ok);
log(`${STAGE}: ${results.length - bad.length}/${results.length} PASS`);
process.exit(bad.length ? 1 : 0);
