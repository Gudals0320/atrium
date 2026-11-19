// P237 창 시험(rig2-design 11.18의 둘째): 보내기 칸의 "회 없이". 받는 세션에 rig 자리가 있을 때만 보이고, 켜고 보내면 회를 열지 않는다. ko·en 그림.
// 판: 따로 띄운 개발용 판(atrium-dev-p237, 48005, 창 9485)만. 시험 폴더 C:\Workspace\mtask-p237-a(rig: main keep haiku, request 고리 work, 관리자 main)와
// mtask-p237-b(rig 없음, outsider 세션), git 없음.
// 실행: node backend/.dev/mt.cjs node app/test/e2e/p237-talk.mjs [round]   결과는 experiments/p237/<round>/(저장소 밖)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const TAG = process.argv[2] || 'round-1';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const OUT = path.join(REPO, 'experiments', 'p237', TAG);
const A = 'c:/workspace/mtask-p237-a';
if (process.env.ATRIUM_TERMINAL_SESSION !== 'atrium-dev-p237' || process.env.ATRIUM_PORT !== '48005') throw new Error('개발용 판(atrium-dev-p237, 48005) 환경에서만 돈다');
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
fs.mkdirSync(OUT, { recursive: true });
const { logger, sleep, launch, closeApp, until } = await import('./harness.mjs');
const log = logger(`p237-${TAG}`);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 120000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 1500)}` : ''}`); };
const ko = (await import('../../src/renderer/locales/ko.js')).default;
const en = (await import('../../src/renderer/locales/en.js')).default;
const D = { ko, en };
const talkRows = () => call('rig.events', { workspace: A }).rows.filter((r) => r.kind === 'loop_skip' && r.value === 'talk');
const casesN = () => call('rig.events', { workspace: A }).rows.filter((r) => r.kind === 'case_open').length;

async function setLang(page, lang) {
  call('settings.set', { key: 'language', value: lang });
  await page.waitForFunction((l) => document.documentElement.lang === l, lang, { timeout: 10000 }).catch(() => {});
  await sleep(400);
}
async function typeBar(page, text) {
  await page.focus('[data-role=command]');
  await page.fill('[data-role=command]', text);
  await sleep(250);
}

const { app, page } = await launch({ log, args: ['--remote-debugging-port=9485'] });
try {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1600, height: 1000 }).catch(() => {});
  await page.waitForFunction(() => !document.querySelector('[data-role=splash]'), null, { timeout: 30000 }).catch(() => log('splash 남음'));
  await page.waitForSelector(`.mt-region[data-ws="${A}"]`, { timeout: 20000 });
  for (const lang of ['ko', 'en']) {
    const d = D[lang];
    await setLang(page, lang);
    await typeBar(page, '@outsider hello');
    check(`[${lang}] rig 밖 세션에는 "회 없이"가 없다`, !(await page.$('[data-action=cmd-talk]')));
    await typeBar(page, '@main rig 정의에서 검사 자리를 빼자');
    const label = await page.$eval('[data-action=cmd-talk]', (x) => x.textContent).catch(() => null);
    check(`[${lang}] rig 자리(@main)를 고르면 "${d.cmdTalk.label}"`, label === d.cmdTalk.label, label);
    const title = await page.$eval('[data-action=cmd-talk]', (x) => x.title).catch(() => null);
    check(`[${lang}] 단추 설명에 받는 자리`, !!title && title.includes('@main'), title);
    await page.locator('.mt-bottom .mt-cmd').screenshot({ path: path.join(OUT, `01-talk-off-${lang}.png`) });
    await page.click('[data-action=cmd-talk]');
    const pressed = await page.$eval('[data-action=cmd-talk]', (x) => x.getAttribute('aria-pressed'));
    check(`[${lang}] 누르면 켜짐(aria-pressed)`, pressed === 'true', pressed);
    await page.locator('.mt-bottom .mt-cmd').screenshot({ path: path.join(OUT, `02-talk-on-${lang}.png`) });
    await page.click('[data-action=cmd-talk]');
    await typeBar(page, '');
  }
  // 켜고 보내기(ko): 회가 열리지 않고 장부 loop_skip talk
  await setLang(page, 'ko');
  const t0 = talkRows().length, c0 = casesN();
  await typeBar(page, '@main 창 시험: 한 낱말 GRAPE로만 답해 줘');
  await page.click('[data-action=cmd-talk]');
  await page.click('[data-action=send]');
  await until(() => talkRows().length > t0, 20000).catch(() => {});
  check('창에서 "회 없이"로 보내면 장부 loop_skip talk(사람)', talkRows().length === t0 + 1 && talkRows().slice(-1)[0].actor === 'human');
  check('회가 열리지 않는다', casesN() === c0);
  await typeBar(page, '@main 다음 글');
  const after = await page.$eval('[data-action=cmd-talk]', (x) => x.getAttribute('aria-pressed')).catch(() => null);
  check('보낸 뒤 "회 없이"는 꺼진다', after === 'false', after);
  await typeBar(page, '');
} finally {
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  await closeApp(app).catch((e) => log('닫기 오류', e.message));
}
const fails = results.filter((r) => !r.ok);
log(`결과: ${results.length - fails.length}/${results.length}`);
process.exit(fails.length ? 1 : 0);
