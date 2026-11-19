// P244 창 시험: rig 3 판의 사이클(지금 번호, 다음 박자, 손 박자 단추)과 최근 변경 기록 꼭지. ko·en 그림.
// 판: 따로 띄운 개발용 판(atrium-dev-p244, 48004, 창 9484)만. 시험 폴더 C:\Workspace\mtask-p244-rig(역할 data·ideas·verify, haiku, 박자 1분), rig는 켜진 채로 시작한다.
// 실행: sh backend/.dev/dev.sh node app/test/e2e/p244-rig3-cycle.mjs [round]   결과는 backend/.dev/p244-exp/<round>/(저장소 밖)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const TAG = process.argv[2] || 'round-1';
const WS = process.env.P244_WS || 'C:/Workspace/mtask-p244-rig';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const OUT = path.join(REPO, 'backend', '.dev', 'p244-exp', TAG);
if (process.env.ATRIUM_TERMINAL_SESSION !== 'atrium-dev-p244' || process.env.ATRIUM_PORT !== '48004') throw new Error('개발용 판(atrium-dev-p244, 48004) 환경에서만 돈다');
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
fs.mkdirSync(OUT, { recursive: true });
const { logger, sleep, launch, closeApp, until } = await import('./harness.mjs');
const log = logger('p244-' + TAG);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 120000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 1500)) : '')); };
const ko = (await import('../../src/renderer/locales/ko.js')).default;
const en = (await import('../../src/renderer/locales/en.js')).default;
const st0 = call('rig.status', { workspace: WS });
const KEY = st0.workspace;
if (st0.state !== 'on') throw new Error('rig가 켜진 판에서 돈다');
async function regionMenu(page, action, sel) {
  await page.click('.mt-region[data-ws="' + KEY + '"] .mt-region-name', { button: 'right' });
  await page.waitForSelector('[data-role=region-menu] [data-action=' + action + ']', { timeout: 8000 });
  await page.click('[data-role=region-menu] [data-action=' + action + ']');
  await page.waitForSelector(sel, { timeout: 10000 });
}
async function shotEl(page, sel, name) { await page.locator(sel).first().screenshot({ path: path.join(OUT, name + '.png') }); log('스크린숏 ' + name + '.png'); }
async function lang(page, l) { call('settings.set', { key: 'language', value: l }); await page.waitForFunction((x) => document.documentElement.lang === x, l, { timeout: 10000 }).catch(() => {}); await sleep(400); }
const fill = (s, v) => Object.entries(v).reduce((a, [k, x]) => a.split('{' + k + '}').join(String(x)), s);

const { app, page } = await launch({ log, args: ['--remote-debugging-port=9484'] });
try {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1600, height: 1100 }).catch(() => {});
  await page.waitForFunction(() => !document.querySelector('[data-role=splash]'), null, { timeout: 30000 }).catch(() => log('splash 남음'));
  await lang(page, 'ko');
  await regionMenu(page, 'rig-panel', '[data-role=rig3-panel]');
  await page.waitForSelector('[data-role=rig3-cycle]', { timeout: 10000 });
  const c = call('rig.status', { workspace: WS }).rig3.cycle;
  const v = await page.evaluate(() => ({ n: document.querySelector('[data-role=rig3-cycle-n]').textContent, next: document.querySelector('[data-role=rig3-next-beat]').textContent, entries: [...document.querySelectorAll('[data-entry]')].map((d) => d.dataset.entry), btn: !!document.querySelector('[data-action=rig3-beat]') }));
  check('지금 사이클(ko): 판의 번호와 같다', v.n === fill(ko.rig3Cycle.now, { n: c.n }), v);
  check('다음 박자 줄(1m마다, data 깨움)', /1m마다/.test(v.next) && /data 깨움/.test(v.next), v.next);
  check('최근 꼭지(새 것부터)가 판과 같다', JSON.stringify(v.entries) === JSON.stringify(c.entries.map((e) => String(e.n))), { ui: v.entries, board: c.entries.map((e) => e.n) });
  check('손 박자 단추', v.btn);
  await shotEl(page, '[data-role=rig3-panel]', '01-rig3-cycle-ko');
  // 손 박자: 단추 → 사이클 n+1
  await page.click('[data-action=rig3-beat]');
  await until(() => call('rig.status', { workspace: WS }).rig3.cycle.n >= c.n + 1, 15000, 500);
  const n2 = call('rig.status', { workspace: WS }).rig3.cycle.n;
  await page.waitForFunction((t) => document.querySelector('[data-role=rig3-cycle-n]').textContent === t, fill(ko.rig3Cycle.now, { n: n2 }), { timeout: 10000 }).catch(() => {});
  const ev = call('rig.events', { workspace: WS, limit: 80 });
  const opened = (ev.rows || ev).filter((r) => r.kind === 'cycle_open' && r.value === 'human').at(-1);
  check('창의 "지금 박자" → 사람이 친 사이클(cycle_open human)', !!opened && opened.actor === 'human', opened);
  // 손 박자가 연 사이클의 앞 사이클 꼭지가 써질 때까지(AI 한 번)
  await until(() => call('rig.status', { workspace: WS }).rig3.cycle.entries.some((e) => e.n === n2 - 1), 90000, 1000);
  await sleep(1500);
  await shotEl(page, '[data-role=rig3-panel]', '02-rig3-cycle-after-beat-ko');
  await lang(page, 'en');
  await sleep(800);
  const ven = await page.evaluate(() => document.querySelector('[data-role=rig3-cycle] .mt-rigon-h').textContent);
  check('사전(en)', ven === en.rig3Cycle.h, ven);
  await shotEl(page, '[data-role=rig3-panel]', '03-rig3-cycle-en');
  await lang(page, 'ko');
} finally {
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  await closeApp(app).catch(() => {});
}
log('결과 ' + results.filter((r) => r.ok).length + '/' + results.length);
process.exit(results.every((r) => r.ok) ? 0 : 1);
