// P228 창 시험: Rig 만들기 대화상자(rig2-design 11.2·11.3·11.11). 세 질문, 바로가기 둘, "질문 없이 돌리기" 경고, 말로 설명하기,
// 켜기 전 요약과 자리 권한 줄(ko·en), 켜기 단계의 권한. 정기 점검을 대화상자로 만들어 켠다(회는 이 스크립트 밖에서 haiku로 한 번 돌린다).
// 판: 따로 띄운 개발용 판(atrium-dev-p228, 48002, 창 9482)만. 시험 폴더 C:\Workspace\mtask-p228-check(정기 점검, 켬)와 mtask-p228-grow(무인 요약만, 켜지 않음), git 없음.
// 실행: node backend/.dev/mt.cjs node app/test/e2e/p228-create-dialog.mjs [round]   결과는 experiments/p228/<round>/(저장소 밖)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const TAG = process.argv[2] || 'round-1';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const OUT = path.join(REPO, 'experiments', 'p228', TAG);
const CHECK = 'c:/workspace/mtask-p228-check';
const GROW = 'c:/workspace/mtask-p228-grow';
if (process.env.ATRIUM_TERMINAL_SESSION !== 'atrium-dev-p228' || process.env.ATRIUM_PORT !== '48002') throw new Error('개발용 판(atrium-dev-p228, 48002) 환경에서만 돈다');
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
fs.mkdirSync(OUT, { recursive: true });
const { logger, sleep, launch, closeApp, until } = await import('./harness.mjs');
const log = logger(`p228-${TAG}`);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 120000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 1500)}` : ''}`); };
const ko = (await import('../../src/renderer/locales/ko.js')).default;
const en = (await import('../../src/renderer/locales/en.js')).default;
const D = { ko, en };
const HAIKU = (call('launcher.list').launchers.find((l) => l.name === 'Claude haiku') || {}).id;
if (!HAIKU) throw new Error('개발용 판에 Claude haiku 런처가 없다');

async function setLang(page, lang) {
  call('settings.set', { key: 'language', value: lang });
  await page.waitForFunction((l) => document.documentElement.lang === l, lang, { timeout: 10000 }).catch(() => {});
  await sleep(400);
}
async function openCreate(page, ws) {
  await page.click(`.mt-region[data-ws="${ws}"] .mt-region-name`, { button: 'right' });
  await page.waitForSelector('[data-role=region-menu] [data-action=rig-create]', { timeout: 8000 });
  await page.click('[data-role=region-menu] [data-action=rig-create]');
  await page.waitForSelector('[data-role=rig-create]', { timeout: 10000 });
}
const step = (page) => page.$eval('[data-role=rig-create]', (x) => x.dataset.step).catch(() => null);
// 대화상자 전체를 찍는다(질문 칸의 스크롤을 잠깐 풀어 한 장에)
async function shotDialog(page, name) {
  await page.addStyleTag({ content: '.mt-rigq { max-height: none !important; overflow: visible !important; } .mt-modal-bg { align-items: flex-start !important; overflow: auto; } .mt-modal.mt-rigsetup { max-height: none !important; }' });
  await page.setViewportSize({ width: 1600, height: 1900 }).catch(() => {}); // 긴 대화상자가 창 밖으로 잘리지 않게
  await sleep(250);
  await page.locator('[data-role=rig-create]').screenshot({ path: path.join(OUT, `${name}.png`) });
  await page.setViewportSize({ width: 1600, height: 1000 }).catch(() => {});
  log(`스크린숏 ${name}.png`);
}
async function shotEl(page, sel, name) { await page.locator(sel).first().screenshot({ path: path.join(OUT, `${name}.png`) }); log(`스크린숏 ${name}.png`); }
const close = async (page) => { await page.click('[data-role=rig-create] [data-action=rig-setup-close]'); await page.waitForSelector('[data-role=rig-create]', { state: 'detached', timeout: 5000 }).catch(() => {}); };

const { app, page } = await launch({ log, args: ['--remote-debugging-port=9482'] });
try {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1600, height: 1000 }).catch(() => {});
  await page.waitForFunction(() => !document.querySelector('[data-role=splash]'), null, { timeout: 30000 }).catch(() => log('splash 남음'));
  await page.waitForSelector(`.mt-region[data-ws="${CHECK}"]`, { timeout: 20000 });

  // 1) 세 질문·바로가기·경고·말로 설명하기(ko·en). 만들지 않고 닫는다
  for (const lang of ['ko', 'en']) {
    const d = D[lang];
    await setLang(page, lang);
    await openCreate(page, CHECK);
    await page.waitForSelector('[data-role=rig-ask]', { timeout: 10000 });
    const qs = await page.$$eval('[data-role=rig-ask] fieldset legend', (xs) => xs.map((x) => x.textContent));
    check(`[${lang}] 세 질문(언제 도나·누가 하나·덧붙임)`, qs.length === 3 && qs[0].includes(d.rigP228.qWhen) && qs[1].includes(d.rigP228.qWho) && qs[2].includes(d.rigP228.qAdds), qs);
    const sc = await page.$$eval('[data-action=rig-shortcut]', (xs) => xs.map((x) => x.dataset.shortcut));
    check(`[${lang}] 바로가기 둘(정기 점검, 규칙이 자라는 반복 작업), 3자리 틀 없음`, JSON.stringify(sc) === '["check","grow"]' && !(await page.$('[data-action=rig-template]')), sc);
    const offs = await page.$$eval('[data-add] input[type=checkbox][data-field$=".on"]', (xs) => xs.map((x) => x.checked));
    check(`[${lang}] 덧붙임 다섯은 모두 꺼진 채 시작`, offs.length === 5 && offs.every((x) => !x), offs);
    const evOpt = await page.$('[data-role=rig-ask] input[value=event]');
    check(`[${lang}] event 계기는 보이지 않는다`, !evOpt);
    await shotDialog(page, `01-ask-default-${lang}`);
    await page.click('[data-action=rig-shortcut][data-shortcut=check]');
    const a1 = await page.evaluate(() => ({ every: document.querySelector('[data-field=every]')?.value, fresh: document.querySelector('input[data-field=session][value=fresh]')?.checked, perm: document.querySelector('[data-field=permission]')?.value, adds: [...document.querySelectorAll('[data-add]')].filter((x) => x.classList.contains('on')).map((x) => x.dataset.add) }));
    check(`[${lang}] 정기 점검을 누르면 매주·fresh·scoped·산출물 폴더와 장부`, a1.every === '7d' && a1.fresh && a1.perm === 'scoped' && JSON.stringify(a1.adds) === '["ledger","sector"]', a1);
    await shotDialog(page, `02-ask-check-${lang}`);
    await page.click('[data-action=rig-shortcut][data-shortcut=grow]');
    const a2 = await page.evaluate(() => ({ req: document.querySelector('input[data-field=trigger][value=request]')?.checked, keep: document.querySelector('input[data-field=session][value=keep]')?.checked, freshOff: document.querySelector('input[data-field=session][value=fresh]')?.disabled, adds: [...document.querySelectorAll('[data-add]')].filter((x) => x.classList.contains('on')).map((x) => x.dataset.add), improve: document.querySelector('[data-field="ledger.improve"]')?.checked }));
    check(`[${lang}] 규칙이 자라는 일: 요청·keep(fresh 막힘)·정본과 장부·개선`, a2.req && a2.keep && a2.freshOff && JSON.stringify(a2.adds) === '["canon","ledger"]' && a2.improve, a2);
    // 바꾸기: 검토 자리를 켠다
    await page.click('[data-add=review] input[data-field="review.on"]');
    check(`[${lang}] 바로가기 뒤 바꾸기(검토 자리 켜기)`, await page.$eval('[data-add=review]', (x) => x.classList.contains('on')));
    await shotDialog(page, `03-ask-grow-review-${lang}`);
    await page.click('[data-add=review] input[data-field="review.on"]');
    // 질문 없이 돌리기 경고
    await page.click('[data-role=rig-unattended] input[data-field=unattended]');
    const warn = await page.$eval('[data-role=rig-unattended-warn]', (x) => x.textContent);
    check(`[${lang}] 질문 없이 돌리기 경고 문장(11.10)`, warn === d.rigPerm.unattended, warn);
    await shotEl(page, 'fieldset[data-q=who]', `04-unattended-${lang}`);
    await page.click('[data-role=rig-unattended] input[data-field=unattended]');
    // 말로 설명하기
    await page.click('[data-action=rig-describe]');
    check(`[${lang}] 말로 설명하기(제작 세션 길)`, (await step(page)) === 'describe');
    await shotDialog(page, `05-describe-${lang}`);
    await page.click('[data-action=rig-setup-back]');
    check(`[${lang}] 뒤로 → 세 질문`, (await step(page)) === 'ask');
    await close(page);
  }

  // 2) 규칙이 자라는 일 + 질문 없이 돌리기를 mtask-p228-grow에 만들고 요약·켜기 단계만 본다(켜지 않음)
  await setLang(page, 'ko');
  await openCreate(page, GROW);
  await page.click('[data-action=rig-shortcut][data-shortcut=grow]');
  await page.selectOption('fieldset[data-q=who] select[data-role=rig-launcher]', HAIKU);
  await page.selectOption('[data-field=permission]', 'scoped');
  await page.click('[data-role=rig-unattended] input[data-field=unattended]');
  await page.click('[data-role=rig-create] [data-action=rig-setup-next]');
  await until(async () => (await step(page)) === 'preview', 15000);
  for (const lang of ['ko', 'en']) {
    await setLang(page, lang);
    const perm = await page.$$eval('[data-role=rig-summary-seats] li', (xs) => xs.map((x) => ({ seat: x.dataset.seat, perm: x.dataset.permission, line: x.querySelector('[data-role=rig-perm-line]').textContent })));
    check(`[${lang}] 요약의 자리 권한 줄(unattended는 11.10 문장)`, perm.length === 1 && perm[0].perm === 'unattended' && perm[0].line === D[lang].rigPerm.unattended, perm);
    const loops = await page.$$eval('[data-role=rig-summary-loops] li', (xs) => xs.map((x) => x.dataset.loop + ':' + x.dataset.trigger));
    check(`[${lang}] 요약의 고리(work 요청, improve 매주)`, JSON.stringify(loops) === '["work:request","improve:every"]', loops);
    check(`[${lang}] 말로 다듬기 칸`, !!(await page.$('[data-role=rig-refine] [data-action=rig-refine]')));
    await shotDialog(page, `06-summary-grow-unattended-${lang}`);
  }
  await page.click('[data-role=rig-create] [data-action=rig-setup-next]');
  await until(async () => (await step(page)) === 'enable', 8000);
  for (const lang of ['ko', 'en']) {
    await setLang(page, lang);
    const un = await page.$eval('[data-role=rig-confirm-unattended]', (x) => x.textContent).catch(() => null);
    check(`[${lang}] 켜기 단계: 무인 자리 승인 경고(켜기 확인 길)`, un === D[lang].rigPerm.unattendedWarn, un);
    await shotDialog(page, `07-enable-grow-unattended-${lang}`);
  }
  await close(page);
  check('mtask-p228-grow는 켜지 않았다', call('rig.status', { workspace: GROW }).state === 'off');

  // 3) 정기 점검을 대화상자로 만들고 켠다(런처 Claude haiku)
  await setLang(page, 'ko');
  await openCreate(page, CHECK);
  await page.click('[data-action=rig-shortcut][data-shortcut=check]');
  await page.selectOption('fieldset[data-q=who] select[data-role=rig-launcher]', HAIKU);
  await page.click('[data-role=rig-create] [data-action=rig-setup-next]');
  await until(async () => (await step(page)) === 'preview', 15000);
  for (const lang of ['ko', 'en']) {
    await setLang(page, lang);
    const sum = await page.$eval('[data-role=rig-summary]', (x) => x.innerText);
    const perm = await page.$$eval('[data-role=rig-summary-seats] li', (xs) => xs.map((x) => x.dataset.permission));
    check(`[${lang}] 정기 점검 요약: 고리·계기·자리(scoped)·덧붙임·만든 파일`, JSON.stringify(perm) === '["scoped"]' && /reports\//.test(sum) && /ledger\/checks\.jsonl/.test(sum), sum.replace(/\s+/g, ' ').slice(0, 600));
    await shotDialog(page, `08-summary-check-${lang}`);
  }
  await page.click('[data-role=rig-create] [data-action=rig-setup-next]');
  await until(async () => (await step(page)) === 'enable', 8000);
  const perms = await page.$$eval('[data-role=rig-confirm-perms] li', (xs) => xs.map((x) => x.dataset.permission));
  check('[en] 켜기 단계: 자리 권한 줄(scoped)', JSON.stringify(perms) === '["scoped"]', perms);
  await shotDialog(page, '09-enable-check-en');
  await setLang(page, 'ko');
  await shotDialog(page, '09-enable-check-ko');
  await page.click('[data-role=rig-create] [data-action=rig-setup-next]');
  await until(async () => (await step(page)) === 'seat', 10000);
  check('켜짐 → 앉히기(keep 자리 없음)', !!(await page.$('[data-role=rig-seat-none]')));
  await close(page);
  const st = call('rig.status', { workspace: CHECK });
  check('정기 점검 rig 켜짐, 자리 checker scoped', st.state === 'on' && st.seats.some((x) => x.name === 'checker' && x.permission === 'scoped'), { state: st.state, warnings: st.warnings });
  fs.writeFileSync(path.join(OUT, 'check-rig.json'), fs.readFileSync('C:/Workspace/mtask-p228-check/.atrium/rig.json'));
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
