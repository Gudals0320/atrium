// P242 창 시험: rig 3 판의 길마다 수와 입력 창구(창에서 글을 넣으면 받는 역할에게 항목으로 간다). ko·en 그림.
// 판: 따로 띄운 개발용 판(atrium-dev-p242, 48004, 창 9484)만. 시험 폴더 C:\Workspace\mtask-p242-rig(역할 data·ideas·verify, haiku), rig는 켜진 채로 시작한다.
// 실행: sh backend/.dev/clean-env.sh env ATRIUM_TERMINAL_SESSION=atrium-dev-p242 ATRIUM_PORT=48004 ATRIUM_DATA_DIR=… ATRIUM_APP_USERDATA=… node app/test/e2e/p242-rig3-items.mjs [round]
//   결과는 experiments/p242/<round>/(저장소 밖)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const TAG = process.argv[2] || 'round-1';
const WS = process.env.P242_WS || 'C:/Workspace/mtask-p242-rig';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const OUT = path.join(REPO, 'experiments', 'p242', TAG);
if (process.env.ATRIUM_TERMINAL_SESSION !== 'atrium-dev-p242' || process.env.ATRIUM_PORT !== '48004') throw new Error('개발용 판(atrium-dev-p242, 48004) 환경에서만 돈다');
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
fs.mkdirSync(OUT, { recursive: true });
const { logger, sleep, launch, closeApp, until } = await import('./harness.mjs');
const log = logger(`p242-${TAG}`);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 120000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 1500)}` : ''}`); };
const ko = (await import('../../src/renderer/locales/ko.js')).default;
const en = (await import('../../src/renderer/locales/en.js')).default;
const st0 = call('rig.status', { workspace: WS });
const KEY = st0.workspace;
if (st0.state !== 'on') throw new Error('rig가 켜진 판에서 돈다');
async function regionMenu(page, action, sel) {
  await page.click(`.mt-region[data-ws="${KEY}"] .mt-region-name`, { button: 'right' });
  await page.waitForSelector(`[data-role=region-menu] [data-action=${action}]`, { timeout: 8000 });
  await page.click(`[data-role=region-menu] [data-action=${action}]`);
  await page.waitForSelector(sel, { timeout: 10000 });
}
async function shotEl(page, sel, name) { await page.locator(sel).first().screenshot({ path: path.join(OUT, `${name}.png`) }); log(`스크린숏 ${name}.png`); }
async function lang(page, l) { call('settings.set', { key: 'language', value: l }); await page.waitForFunction((x) => document.documentElement.lang === x, l, { timeout: 10000 }).catch(() => {}); await sleep(400); }
const fill = (s, v) => Object.entries(v).reduce((a, [k, x]) => a.split(`{${k}}`).join(String(x)), s);

const { app, page } = await launch({ log, args: ['--remote-debugging-port=9484'] });
try {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1600, height: 1000 }).catch(() => {});
  await page.waitForFunction(() => !document.querySelector('[data-role=splash]'), null, { timeout: 30000 }).catch(() => log('splash 남음'));
  await lang(page, 'ko');
  await regionMenu(page, 'rig-panel', '[data-role=rig3-panel]');
  await page.waitForSelector('[data-role=rig3-flow-counts]', { timeout: 10000 });
  const st = call('rig.status', { workspace: WS });
  const v = await page.evaluate(() => ({
    counts: [...document.querySelectorAll('[data-role=rig3-flows] li')].map((li) => [li.dataset.item, (li.querySelector('[data-role=rig3-flow-counts]') || {}).textContent || null]),
    intake: !!document.querySelector('[data-role=rig3-intake] [data-role=rig3-intake-text]'),
    kinds: [...document.querySelectorAll('[data-intake-item]')].map((b) => b.dataset.intakeItem),
  }));
  const hyp = st.rig3.flows.find((f) => f.item === 'hypothesis').counts;
  check('길마다 수(ko): 화면이 판의 수와 같다', v.counts.find((x) => x[0] === 'hypothesis')[1] === fill(ko.rig3Items.counts, hyp), v.counts);
  check('입력 창구: 사람 길(request)만, 글 칸 하나', v.intake && JSON.stringify(v.kinds) === '["request"]', v);
  await shotEl(page, '[data-role=rig3-panel]', '01-rig3-items-ko');
  // 창에서 입력 창구로 넣는다 → request 항목이 data에게
  const before = st.rig3.flows.find((f) => f.item === 'request').counts.put;
  await page.fill('[data-role=rig3-intake-text]', '토요일과 일요일 방문자 수도 표로(2행).');
  await page.click('[data-action=rig3-intake-send]');
  await until(() => call('rig.status', { workspace: WS }).rig3.flows.find((f) => f.item === 'request').counts.put === before + 1, 15000, 500);
  const ev = call('rig.events', { workspace: WS, limit: 50 });
  const put = (ev.rows || ev).filter((r) => r.kind === 'item_put' && r.value === 'intake').at(-1);
  check('창의 입력 창구 → 항목(human, intake)이 data에게', put && put.toSeat === 'data' && put.actor === 'human', put);
  const cleared = await page.inputValue('[data-role=rig3-intake-text]');
  check('넣은 뒤 글 칸이 비워진다', cleared === '', cleared);
  // 받는 역할이 받기를 기다렸다가(사람 손 없이) 다시 그림
  await until(() => { const rs = call('rig.events', { workspace: WS, limit: 100 }); return (rs.rows || rs).some((r) => r.kind === 'item_accept' && r.ref === put.ref); }, 120000, 3000).then(() => check('data가 창에서 넣은 요청을 받았다(사람 손 없이)', true), () => check('data가 창에서 넣은 요청을 받았다', false));
  await sleep(1500);
  await shotEl(page, '[data-role=rig3-panel]', '02-rig3-intake-sent-ko');
  await lang(page, 'en');
  await sleep(500);
  const ven = await page.evaluate(() => [...document.querySelectorAll('[data-role=rig3-flow-counts]')].map((x) => x.textContent));
  check('길마다 수(en)', ven.length >= 4 && ven.every((x) => x.startsWith('put ')), ven);
  await shotEl(page, '[data-role=rig3-panel]', '03-rig3-items-en');
  await page.click('[data-role=rig3-panel] [data-action=rig-panel-close]');
  await lang(page, 'ko');
} catch (e) { check('시험 오류', false, e.stack || String(e)); }
finally {
  await closeApp(app, log).catch(() => {});
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  log(`끝: PASS ${results.filter((r) => r.ok).length} / ${results.length}`);
}
