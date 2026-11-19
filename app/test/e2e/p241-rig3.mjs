// P241 창 시험: rig 3(역할 조직) 판. 읽기만 하는 구조 보기(역할, 쥔 섹터, 세션 상태, 길)와 켜기 확인 한 번. ko·en 그림.
// 판: 따로 띄운 개발용 판(atrium-dev-p241, 48004, 창 9484)만. 시험 폴더 C:\Workspace\mtask-p241-rig(역할 data·ideas, haiku).
// 실행: sh backend/.dev/clean-env.sh env ATRIUM_TERMINAL_SESSION=atrium-dev-p241 ATRIUM_PORT=48004 ATRIUM_DATA_DIR=… ATRIUM_APP_USERDATA=… node app/test/e2e/p241-rig3.mjs [round]
//   결과는 experiments/p241/<round>/(저장소 밖)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const TAG = process.argv[2] || 'round-1';
const WS = process.env.P241_WS || 'C:/Workspace/mtask-p241-rig';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const OUT = path.join(REPO, 'experiments', 'p241', TAG);
if (process.env.ATRIUM_TERMINAL_SESSION !== 'atrium-dev-p241' || process.env.ATRIUM_PORT !== '48004') throw new Error('개발용 판(atrium-dev-p241, 48004) 환경에서만 돈다');
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
fs.mkdirSync(OUT, { recursive: true });
const { logger, sleep, launch, closeApp, until } = await import('./harness.mjs');
const log = logger(`p241-${TAG}`);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 120000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 1500)}` : ''}`); };
const ko = (await import('../../src/renderer/locales/ko.js')).default;
const en = (await import('../../src/renderer/locales/en.js')).default;
const st0 = call('rig.status', { workspace: WS });
const KEY = st0.workspace;
async function regionMenu(page, action, sel) {
  await page.click(`.mt-region[data-ws="${KEY}"] .mt-region-name`, { button: 'right' });
  await page.waitForSelector(`[data-role=region-menu] [data-action=${action}]`, { timeout: 8000 });
  await page.click(`[data-role=region-menu] [data-action=${action}]`);
  await page.waitForSelector(sel, { timeout: 10000 });
}
async function shotEl(page, sel, name) { await page.locator(sel).first().screenshot({ path: path.join(OUT, `${name}.png`) }); log(`스크린숏 ${name}.png`); }
async function lang(page, l) { call('settings.set', { key: 'language', value: l }); await page.waitForFunction((x) => document.documentElement.lang === x, l, { timeout: 10000 }).catch(() => {}); await sleep(400); }
if (st0.state === 'on') { call('rig.disable', { workspace: WS }); log('켜져 있던 rig를 끔(시험은 꺼진 판에서 시작)'); }
// 끈 rig의 역할 세션은 판이 그대로 둔다(설계). 시험은 세션 없는 판에서 시작한다
for (const r of (st0.rig3 && st0.rig3.roles) || []) if (r.session) { atrium('kill', r.session.name, '--yes'); log(`남은 역할 세션 @${r.session.name}을 닫음`); }

const { app, page } = await launch({ log, args: ['--remote-debugging-port=9484'] });
try {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1600, height: 1000 }).catch(() => {});
  await page.waitForFunction(() => !document.querySelector('[data-role=splash]'), null, { timeout: 30000 }).catch(() => log('splash 남음'));
  await lang(page, 'ko');
  // 1. 영역 메뉴의 rig 줄과 rig 판(꺼짐): 읽기만 하는 구조 보기
  await regionMenu(page, 'rig-panel', '[data-role=rig3-panel]');
  await page.waitForSelector('[data-role=rig3-roles] tr[data-role-name=ideas]', { timeout: 10000 });
  const off = await page.evaluate(() => ({
    status: document.querySelector('[data-role=rig3-panel]').dataset.status,
    roles: [...document.querySelectorAll('[data-role=rig3-roles] tbody tr')].map((tr) => [tr.dataset.roleName, tr.children[1].textContent, tr.dataset.state]),
    flows: [...document.querySelectorAll('[data-role=rig3-flows] li')].map((li) => li.textContent),
    editTables: document.querySelectorAll('[data-role=rig-seats], [data-role=rig-flow], [data-role=rig-results], [data-role=rig-say]').length,
    inputs: document.querySelectorAll('[data-role=rig3-panel] input, [data-role=rig3-panel] select, [data-role=rig3-panel] textarea').length,
  }));
  check('꺼진 rig 3 판: 역할 둘과 쥔 섹터, 세션 없음', off.status === 'off' && JSON.stringify(off.roles) === JSON.stringify([['data', 'data/ snapshots/', 'none'], ['ideas', 'hypotheses/', 'none']]), off.roles);
  check('길 셋(사람 창구는 "사람")', off.flows.length === 3 && off.flows[1].includes(ko.rig3.human), off.flows);
  check('편집 표·자리 표·흐름 표·말로 고치기가 없다(입력 칸 0)', off.editTables === 0 && off.inputs === 0, off);
  await shotEl(page, '[data-role=rig3-panel]', '01-rig3-off-ko');
  // 2. 켜기 확인(한 번)
  await page.click('[data-action=rig3-enable]');
  await page.waitForSelector('[data-role=rig3-confirm]');
  const line = await page.textContent('[data-role=rig3-confirm-line]');
  check('켜기 확인 한 줄(ko)', line === ko.rig3.confirmLine.replace('{n}', '2'), line);
  await shotEl(page, '[data-role=rig3-panel]', '02-rig3-confirm-ko');
  await lang(page, 'en');
  const lineEn = await page.textContent('[data-role=rig3-confirm-line]');
  check('켜기 확인 한 줄(en)', lineEn === en.rig3.confirmLine.replace('{n}', '2'), lineEn);
  await shotEl(page, '[data-role=rig3-panel]', '03-rig3-confirm-en');
  await lang(page, 'ko');
  // 3. 켜기 → 역할마다 세션
  await page.click('[data-action=rig3-confirm-on]');
  await until(() => { const r = call('rig.status', { workspace: WS }); return r.state === 'on' && r.rig3.roles.every((x) => x.session && x.session.state === 'ready'); }, 180000, 2000);
  const on = call('rig.status', { workspace: WS });
  check('켜면 역할마다 세션 하나(ready)', on.rig3.roles.map((r) => r.session && r.session.name).join(',') === 'data,ideas', on.rig3.roles.map((r) => r.session));
  await page.waitForFunction(() => [...document.querySelectorAll('[data-role=rig3-roles] tbody tr')].every((tr) => tr.dataset.state === 'ready'), null, { timeout: 20000 }).catch(() => log('판의 줄이 아직 ready가 아님'));
  await sleep(500);
  await shotEl(page, '[data-role=rig3-panel]', '04-rig3-on-ko');
  await lang(page, 'en');
  await sleep(300);
  await shotEl(page, '[data-role=rig3-panel]', '05-rig3-on-en');
  await page.click('[data-role=rig3-panel] [data-action=rig-panel-close]');
  await lang(page, 'ko');
  await sleep(500);
  await page.screenshot({ path: path.join(OUT, '06-board-ko.png') });
} catch (e) { check('시험 오류', false, e.stack || String(e)); }
finally {
  await closeApp(app, log).catch(() => {});
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  log(`끝: PASS ${results.filter((r) => r.ok).length} / ${results.length}`);
}
