// P230 창 시험(rig2-design 11.12): 대화상자의 정기 점검 경고(저장소 아님)와 막힌 fresh 옆 까닭, rig 판의 고리 카드와 [지금 돌리기](열린 회면 건너뜀),
// 관리자 자리 없는 rig의 상한 카드(마지막 반려 까닭, [그대로 받기] [한 번 더] [회 멈추기]). ko·en 그림.
// 판: 따로 띄운 개발용 판(atrium-dev-p230, 48004, 창 9484)만. 시험 폴더 C:\Workspace\mtask-p230-a(손으로 쓴 rig: main keep + reviewer fresh, 상한 0, 관리자 없음, tidy 1d 고리)와
// mtask-p230-b(rig 없음, 대화상자만), git 없음. 런처 Claude haiku.
// 실행: node backend/.dev/mt.cjs node app/test/e2e/p230-run-now.mjs [round]   결과는 experiments/p230/<round>/(저장소 밖)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const TAG = process.argv[2] || 'round-1';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const OUT = path.join(REPO, 'experiments', 'p230', TAG);
const A = 'c:/workspace/mtask-p230-a';
const B = 'c:/workspace/mtask-p230-b';
if (process.env.ATRIUM_TERMINAL_SESSION !== 'atrium-dev-p230' || process.env.ATRIUM_PORT !== '48004') throw new Error('개발용 판(atrium-dev-p230, 48004) 환경에서만 돈다');
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
fs.mkdirSync(OUT, { recursive: true });
const { logger, sleep, launch, closeApp, until } = await import('./harness.mjs');
const log = logger(`p230-${TAG}`);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 120000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 1500)}` : ''}`); };
const ko = (await import('../../src/renderer/locales/ko.js')).default;
const en = (await import('../../src/renderer/locales/en.js')).default;
const D = { ko, en };
const fill = (s, v) => String(s).replace(/\{(\w+)\}/g, (m, k) => (v[k] != null ? String(v[k]) : m));
const loopsOf = () => call('rig.loops', { workspace: A }).loops;
const limitAsk = () => call('rig.asks', {}).asks.find((x) => x.kind === 'run_limit') || null;

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
const lastToast = (page) => page.$$eval('.mt-toast', (xs) => (xs.length ? xs[xs.length - 1].textContent : null)).catch(() => null);

// 준비: rig 켜기, main 자리 세션(haiku keep) 띄우기
const st0 = call('rig.status', { workspace: A });
if (st0.state !== 'on') call('rig.enable', { workspace: A, confirm: true });
const seated = call('rig.get', { workspace: A }).seated || {};
if (!(seated.main || []).length) { call('rig.spawnSeat', { workspace: A, seat: 'main' }); log('main 자리 세션 띄움'); }
await until(() => (loopsOf().find((l) => l.name === 'tidy') || {}).state === 'waiting', 60000);

const { app, page } = await launch({ log, args: ['--remote-debugging-port=9484'] });
try {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1600, height: 1000 }).catch(() => {});
  await page.waitForFunction(() => !document.querySelector('[data-role=splash]'), null, { timeout: 30000 }).catch(() => log('splash 남음'));
  await page.waitForSelector(`.mt-region[data-ws="${B}"]`, { timeout: 20000 });

  // 1) 대화상자(mtask-p230-b, git 아님): 정기 점검 경고, 요청 계기의 fresh 까닭
  for (const lang of ['ko', 'en']) {
    const d = D[lang];
    await setLang(page, lang);
    await regionMenu(page, B, 'rig-create', '[data-role=rig-create]');
    await page.waitForSelector('[data-role=rig-ask]', { timeout: 10000 });
    check(`[${lang}] 바로가기 전에는 경고 없음`, !(await page.$('[data-role=rig-check-norepo]')));
    await page.click('[data-action=rig-shortcut][data-shortcut=check]');
    const warn = await page.$eval('[data-role=rig-check-norepo]', (x) => x.textContent).catch(() => null);
    check(`[${lang}] 정기 점검 + 저장소 아님 → "점검할 git 저장소가 없다"`, warn === d.rigP230.noRepo, warn);
    check(`[${lang}] 정기 점검(every)은 fresh 까닭 없음`, !(await page.$('[data-role=rig-fresh-why]')));
    await shotEl(page, '[data-role=rig-shortcuts]', `01-check-norepo-${lang}`);
    await page.click('[data-action=rig-shortcut][data-shortcut=grow]');
    check(`[${lang}] 다른 바로가기면 경고가 사라진다`, !(await page.$('[data-role=rig-check-norepo]')));
    const why = await page.$eval('[data-role=rig-fresh-why]', (x) => x.textContent).catch(() => null);
    const off = await page.$eval('input[data-field=session][value=fresh]', (x) => x.disabled);
    check(`[${lang}] 요청 계기: fresh 막힘과 그 옆 까닭`, off && why === d.rigP230.freshWhy, why);
    await shotEl(page, 'fieldset[data-q=who]', `02-fresh-why-${lang}`);
    await page.click('[data-role=rig-create] [data-action=rig-setup-close]');
    await page.waitForSelector('[data-role=rig-create]', { state: 'detached', timeout: 5000 }).catch(() => {});
  }

  // 2) rig 판의 고리 카드와 지금 돌리기(mtask-p230-a)
  await setLang(page, 'ko');
  await regionMenu(page, A, 'rig-panel', '[data-role=rig-panel]');
  await page.waitForSelector('[data-role=rig-loops] [data-loop=tidy]', { timeout: 15000 });
  const cards = await page.$$eval('[data-role=rig-loop]', (xs) => xs.map((x) => ({ loop: x.dataset.loop, state: x.dataset.state, run: !!x.querySelector('[data-action=rig-loop-run]') })));
  check('고리 카드 둘: work(요청, 단추 없음)와 tidy(every, 지금 돌리기)', JSON.stringify(cards.map((c) => [c.loop, c.run])) === '[["work",false],["tidy",true]]', cards);
  await shotEl(page, '[data-role=rig-loops]', '03-loop-cards-before-ko');
  await page.click('[data-action=rig-loop-run][data-loop=tidy]');
  await until(async () => (await lastToast(page)) !== null, 10000);
  const t1 = await lastToast(page);
  check('[ko] 지금 돌리기 → 회를 열었다는 알림', /^회 tidy \d{4}-\d\d-\d\d \d\d:\d\d을 열었습니다\.$/.test(t1 || ''), t1);
  await until(() => (loopsOf().find((l) => l.name === 'tidy') || {}).state === 'running', 10000).catch(() => {});
  const tidy = loopsOf().find((l) => l.name === 'tidy');
  check('tidy 고리 돎(회 열림)', tidy.state === 'running' && tidy.lastRun, tidy.lastRun);
  await page.click('[data-action=rig-loop-run][data-loop=tidy]'); // 바로 한 번 더(haiku가 회를 닫기 전에)
  await until(async () => /건너뜀/.test((await lastToast(page)) || ''), 10000).catch(() => {});
  const t2 = await lastToast(page);
  check('[ko] 열린 회가 있으면 건너뛰고 까닭', t2 === fill(ko.rigP230.skip.running, { list: tidy.lastRun.id }), t2);
  await shotEl(page, '[data-role=rig-panel]', '04-run-now-skip-ko');
  // en: 첫 회가 닫힌 뒤 다시 두 번 연달아(연다 → 건너뜀)
  await until(() => { const l = loopsOf().find((x) => x.name === 'tidy'); return l.state !== 'running'; }, 180000, 1000);
  await setLang(page, 'en');
  await page.click('[data-action=rig-loop-run][data-loop=tidy]');
  await until(async () => /^Opened run/.test((await lastToast(page)) || ''), 10000).catch(() => {});
  const t3a = await lastToast(page);
  const tidy2 = loopsOf().find((l) => l.name === 'tidy');
  check('[en] Run now → opened toast', /^Opened run tidy /.test(t3a || ''), t3a);
  await page.click('[data-action=rig-loop-run][data-loop=tidy]');
  await until(async () => /^Skipped/.test((await lastToast(page)) || ''), 10000).catch(() => {});
  const t3 = await lastToast(page);
  check('[en] skip toast', t3 === fill(en.rigP230.skip.running, { list: tidy2.lastRun.id }), t3);
  await shotEl(page, '[data-role=rig-panel]', '05-run-now-skip-en');
  // main(haiku)이 tidy 회를 닫을 때까지
  await until(() => { const l = loopsOf().find((x) => x.name === 'tidy'); return l.state !== 'running' && l.lastRun && l.lastRun.state === 'done'; }, 180000, 2000);
  check('tidy 회가 main의 done으로 닫힘', loopsOf().find((x) => x.name === 'tidy').lastRun.state === 'done');
  await shotEl(page, '[data-role=rig-loops]', '06-loop-cards-after-en');
  await page.click('[data-role=rig-panel] [data-action=rig-panel-close]');

  // 3) 관리자 없는 rig의 상한 카드: main에 요청 → ok → reviewer 반려(상한 0) → 사람 카드
  atrium('send', '@main', 'Write one short sentence about spring.');
  await until(() => !!limitAsk(), 300000, 3000);
  const a = limitAsk();
  check('상한 카드(rig.asks run_limit): 마지막 반려 까닭', a && /second paragraph is too long/i.test(a.run.reason) && a.run.seat === 'reviewer' && a.run.max === 0, a);
  for (const lang of ['ko', 'en']) {
    const d = D[lang];
    await setLang(page, lang);
    await page.waitForSelector('[data-role=inbox]', { timeout: 20000 });
    if (!(await page.$('[data-role=inbox-list]'))) await page.click('[data-role=inbox]');
    await page.waitForSelector('[data-role=rig-ask][data-kind=run_limit]', { timeout: 15000 });
    const card = await page.$eval('[data-role=rig-ask][data-kind=run_limit]', (x) => ({ title: x.querySelector('.mt-rigask-title').textContent, why: x.querySelector('[data-role=rig-ask-why]').textContent, btns: [...x.querySelectorAll('button')].map((b) => b.textContent) }));
    check(`[${lang}] 상한 카드: 제목·까닭·단추 셋`, card.title === fill(d.rigP230.limitTitle, { name: a.run.name || a.run.id }) && /second paragraph is too long/i.test(card.why) && JSON.stringify(card.btns) === JSON.stringify([d.rigP230.accept, d.rigP230.again, d.rigP230.pause]), card);
    await shotEl(page, '[data-role=rig-ask][data-kind=run_limit]', `07-limit-card-${lang}`);
    await page.click('[data-role=inbox]');
  }
  // [회 멈추기] → 카드가 숨고, 잇기에 다시 뜬다. 마지막에 [그대로 받기]로 닫는다
  await setLang(page, 'ko');
  await page.click('[data-role=inbox]');
  await page.click('[data-role=rig-ask][data-kind=run_limit] [data-action=rig-ask-limit-pause]');
  await until(() => !limitAsk(), 10000);
  check('[회 멈추기] → 회 멈춤, 카드 숨음', call('rig.status', { workspace: A }).state === 'on' && !limitAsk());
  atrium('call', 'rig.resume', JSON.stringify({ workspace: A, target: a.run.id }));
  await until(() => !!limitAsk(), 10000);
  check('잇기 → 카드가 다시 뜬다', !!limitAsk());
  if (!(await page.$('[data-role=inbox-list]'))) await page.click('[data-role=inbox]');
  await page.waitForSelector('[data-role=rig-ask][data-kind=run_limit] [data-action=rig-ask-limit-accept]', { timeout: 15000 });
  await page.click('[data-role=rig-ask][data-kind=run_limit] [data-action=rig-ask-limit-accept]');
  await until(() => !limitAsk(), 10000);
  const t4 = await lastToast(page);
  check('[그대로 받기] → 회 닫힘(알림)', t4 === ko.rigP230.accepted, t4);
  const ev = call('rig.events', { workspace: A, case: a.run.id, kinds: 'case_done' });
  check('장부 case_done(value human)', JSON.stringify(ev).includes('"human"'), JSON.stringify(ev).slice(0, 400));
} catch (e) {
  log(`오류 ${e.stack || e}`);
  await page.screenshot({ path: path.join(OUT, 'error.png') }).catch(() => {});
  check('오류 없이 끝남', false, String(e.message || e));
} finally {
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  log(`결과 ${results.filter((r) => r.ok).length}/${results.length} 통과`);
  await closeApp(app);
  process.exit(results.every((r) => r.ok) ? 0 : 1);
}
