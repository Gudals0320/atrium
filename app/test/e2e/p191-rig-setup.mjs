// P191 창 시험: 판 안에서 rig 만들기(대화상자)와 보기·고치기(rig 판). JSON을 열지 않고 창으로만 한다.
// 판: 따로 띄운 개발용 판(P191_BOARD, P191_PORT, P191_DATA)만. 창 원격 디버깅 포트 P191_DEBUG. 런처 P191_LAUNCHER(haiku 런처 id).
// 실행: node app/test/e2e/p191-rig-setup.mjs <template|describe|panel|phone> [워크스페이스 키]   (실제 판 변수를 지운 셸에서)
//   template: 틀(메인 + 워커)로 만들기 → 런처 → 미리보기 → 켜기 → main 새로 띄워 앉히기
//   describe: 말로 설명 → 제작 세션(만드는 중) → 정의가 생기면 미리보기 → 켜기 → main 앉히기
//   panel: rig 판에서 런처(P191_LAUNCHER2)와 max를 바꿔 저장 → 새 버전
//   phone: 휴대폰 폭에서 rig 판 보기만(원격 흉내 __mtViewOnly)
// 그림은 단계마다 ko·en 하나씩. 결과는 워크트리의 experiments/p191/shots/<단계>/(저장소 밖).
import fs from 'node:fs';
import path from 'node:path';

const WHAT = process.argv[2] || 'template';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const OUT = path.join(REPO, 'experiments', 'p191', 'shots', WHAT);
const BOARD = process.env.P191_BOARD || 'atrium-dev-p191', PORT = process.env.P191_PORT || '47960', DEBUG = process.env.P191_DEBUG || '9440';
const DATA = process.env.P191_DATA || path.join(process.env.LOCALAPPDATA || '', 'atrium-dev-p191');
const WS = process.argv[3] || (WHAT === 'template' ? 'c:/workspace/mtask-p191-a' : 'c:/workspace/mtask-p191-b');
const LAUNCHER = process.env.P191_LAUNCHER || 'claude';
const LAUNCHER2 = process.env.P191_LAUNCHER2 || LAUNCHER;
const DESCRIBE = process.env.P191_TEXT || 'I want two seats. main is one kept session that takes my requests and hands each task to a worker. worker is a new session per task; when it finishes ok or failed the result goes back to main. Results: ok, failed.';
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_|HC_)/.test(k)) delete process.env[k];
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
const ENV = {
  ATRIUM_TERMINAL_SESSION: BOARD, ATRIUM_HERDR_SESSION: BOARD, ATRIUM_PORT: PORT, ATRIUM_DATA_DIR: DATA, ATRIUM_APP_USERDATA: path.join(DATA, 'app'),
  ATRIUM_CLAUDE_PROJECTS: path.join(DATA, 'no-projects'), ATRIUM_CLAUDE_DESKTOP: 'none', ATRIUM_TEST_PREFIX: 'p191-none-',
};
Object.assign(process.env, ENV);
fs.mkdirSync(OUT, { recursive: true });
const { logger, sleep, launch, closeApp } = await import('./harness.mjs');
const { assertTestBoard } = await import('./p9-guard.mjs');
assertTestBoard(ENV);
const log = logger(`p191-${WHAT}`);
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 1200)}` : ''}`); };
const until = async (fn, ms = 8000, step = 250) => { const t0 = Date.now(); for (;;) { const v = await fn().catch(() => null); if (v) return v; if (Date.now() - t0 > ms) return null; await sleep(step); } };

const { app, page } = await launch({ log, env: { ...ENV }, args: [`--remote-debugging-port=${DEBUG}`] });
const call = (m, p) => page.evaluate(([m, p]) => window.__mt.api.call(m, p), [m, p]);
const lang = async (l) => { await page.evaluate((l) => window.__mt.api.call('settings.set', { key: 'language', value: l }), l); await sleep(500); };
// 창 안만 찍는다. ko·en 하나씩
let n = 0;
const shot2 = async (name, sel = null) => {
  n++;
  for (const l of ['ko', 'en']) {
    await lang(l);
    const file = path.join(OUT, `${String(n).padStart(2, '0')}-${name}-${l}.png`);
    const el = sel ? await page.$(sel) : null;
    if (el) await el.screenshot({ path: file }); else await page.screenshot({ path: file });
  }
  await lang('ko');
  log(`shot ${name}`);
};
const openMenu = async () => {
  await page.keyboard.press('Escape').catch(() => {});
  await page.click(`.mt-region[data-ws="${WS}"] .mt-region-name`, { button: 'right' });
  return until(() => page.$('[data-role=region-menu]'), 4000);
};
const menuItems = () => page.$$eval('[data-role=region-menu] [data-action]', (bs) => bs.map((b) => b.dataset.action));
const step = () => page.$eval('[data-role=rig-create]', (x) => x.dataset.step).catch(() => null);
const next = () => page.click('[data-role=rig-create] [data-action=rig-setup-next]');

try {
  await app.evaluate(({ BrowserWindow, screen }) => { const w = BrowserWindow.getAllWindows()[0]; const left = Math.min(...screen.getAllDisplays().map((d) => d.bounds.x)); const b = w.getBounds(); w.setPosition(left - b.width - 200, 40); }).catch(() => {});
  await page.setViewportSize({ width: 1584, height: 921 }).catch(() => {});
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await sleep(3000);
  await lang('ko');
  if (WHAT === 'template' || WHAT === 'describe') {
    await openMenu();
    const items = await menuItems();
    check('정의 없는 워크스페이스의 이름표 메뉴에 Rig 만들기', items.includes('rig-create') && !items.includes('rig-panel'), items);
    await shot2('menu', '[data-role=region-menu]').catch(() => {});
    if (!(await page.$('[data-role=region-menu]'))) await openMenu();
    await page.click('[data-role=region-menu] [data-action=rig-create]');
    await until(() => page.$('[data-role=rig-create] [data-action=rig-template]'), 8000);
    await shot2('paths', '[data-role=rig-create]');
    check('틀 카드 셋과 말로 설명', (await page.$$('[data-action=rig-template]')).length === 3 && !!(await page.$('[data-action=rig-describe]')));
    if (WHAT === 'template') {
      await page.click('[data-action=rig-template][data-template="main-worker"]');
      await until(async () => (await step()) === 'launchers');
      const defaults = await page.$$eval('[data-role=rig-launchers] [data-seat] select', (xs) => xs.map((x) => x.value));
      check('자리마다 런처 기본값', defaults.length === 2 && defaults.every(Boolean), defaults);
      for (const s of ['main', 'worker']) await page.selectOption(`[data-role=rig-launchers] [data-seat="${s}"] select`, LAUNCHER);
      await shot2('launchers', '[data-role=rig-create]');
      await next();
    } else {
      await page.click('[data-action=rig-describe]');
      await until(async () => (await step()) === 'describe');
      await page.fill('[data-role=rig-describe-text]', DESCRIBE);
      await page.selectOption('[data-role=rig-describe-form] select', LAUNCHER);
      await shot2('describe', '[data-role=rig-create]');
      await next();
      await until(async () => (await step()) === 'building', 15000);
      await sleep(1500);
      await shot2('building', '[data-role=rig-create]');
      const b = await page.$eval('[data-role=rig-builder]', (x) => ({ state: x.dataset.state, go: !!x.querySelector('[data-action=rig-builder-go]') })).catch(() => null);
      check('만드는 중과 그 세션으로 가기', b && b.state === 'working' && b.go, b);
      // 제작 세션이 끝나 정의가 생기면 미리보기로(최대 10분)
      const ok = await until(async () => (await step()) === 'preview', 600000, 2000);
      check('제작 세션이 끝나면 미리보기로', !!ok, await step());
      if (!ok) await shot2('building-stuck', '[data-role=rig-create]');
    }
    await until(async () => (await step()) === 'preview', 15000);
    await until(() => page.$('[data-role=rig-preview] [data-seat]'), 8000);
    await sleep(500);
    await shot2('preview', '[data-role=rig-create]');
    const pv = await page.evaluate(() => ({ seats: [...document.querySelectorAll('[data-role=rig-preview] [data-seat]')].map((x) => x.dataset.seat), labels: [...document.querySelectorAll('[data-role=rig-preview] .mt-rigpv-label')].map((x) => x.textContent) }));
    check('미리보기에 자리 상자와 흐름 값', pv.seats.includes('main') && pv.labels.some((x) => x.startsWith('assign')), pv);
    await next();
    await until(async () => (await step()) === 'enable');
    await shot2('enable', '[data-role=rig-create]');
    check('켜기 확인(사용자 계정 안내)', !!(await page.$('[data-role=rig-setup-enable] [data-role=rig-confirm-warn]')));
    await next();
    await until(async () => (await step()) === 'seat', 8000);
    await sleep(500);
    await shot2('seat', '[data-role=rig-create]');
    const seatOpts = await page.$$eval('[data-role=rig-seat-step] [data-seat="main"] select option', (os) => os.map((o) => o.value)).catch(() => []);
    check('main 앉히기: 새로 띄우기가 기본', seatOpts[0] === 'spawn', seatOpts);
    await next();
    await until(async () => !(await page.$('[data-role=rig-create]')), 15000);
    const g = await until(async () => { const r = await call('rig.get', { workspace: WS }); return r.seated && r.seated.main && r.seated.main.length ? r : null; }, 30000, 1000);
    check('켜지고 main이 앉았다', g && g.status === 'on' && g.seated.main.length === 1, g && { status: g.status, seated: g.seated, versionN: g.versionN });
    await openMenu();
    const items2 = await menuItems();
    check('정의가 생기면 이름표 메뉴가 Rig 보기·고치기', items2.includes('rig-panel') && !items2.includes('rig-create'), items2);
    await page.keyboard.press('Escape');
  }
  if (WHAT === 'panel') {
    await openMenu();
    await page.click('[data-role=region-menu] [data-action=rig-panel]');
    await until(() => page.$('[data-role=rig-panel] [data-role=rig-seats]'), 8000);
    await sleep(800);
    await shot2('panel', '[data-role=rig-panel]');
    const before = await call('rig.get', { workspace: WS });
    // 워커 자리의 런처와 첫 되돌아갈 수 있는 흐름 줄의 max를 바꾼다
    const worker = (before.definition && Object.keys(before.definition.seats || {}).find((x) => x !== 'main')) || 'worker';
    await page.selectOption(`[data-role=rig-seats] tr[data-seat="${worker}"] [data-role=rig-launcher]`, LAUNCHER2);
    const flowIdx = (before.definition.flow || []).findIndex((l) => l.from !== 'main');
    await page.fill(`[data-role=rig-flow] tr[data-flow="${flowIdx < 0 ? 0 : flowIdx}"] [data-field=max]`, '3');
    await sleep(400);
    await shot2('panel-edited', '[data-role=rig-panel]');
    await page.click('[data-action=rig-save]');
    const after = await until(async () => { const r = await call('rig.get', { workspace: WS }); return r.versionN !== before.versionN ? r : null; }, 10000);
    check('저장하면 새 버전', after && after.versionN > (before.versionN || 0), { before: before.versionN, after: after && after.versionN });
    check('런처와 max가 바뀌고 다른 칸은 그대로', after && after.definition.seats[worker].launcher === LAUNCHER2 && after.definition.flow[flowIdx < 0 ? 0 : flowIdx].max === 3 && JSON.stringify(after.definition.seats.main) === JSON.stringify(before.definition.seats.main), after && after.definition);
    const log1 = await call('rig.log', { workspace: WS }).catch((e) => ({ error: String(e) }));
    check('버전 기록에 누가 human', JSON.stringify(log1).includes('human'), JSON.stringify(log1).slice(0, 600));
    await sleep(600);
    await shot2('panel-saved', '[data-role=rig-panel]');
    // 잠금: 보호 포인터를 넣으면 그 줄이 잠긴다
    await call('rig.protect', { workspace: WS, pointer: '/seats/main' });
    await page.click('[data-action=rig-panel-close]');
    await openMenu();
    await page.click('[data-role=region-menu] [data-action=rig-panel]');
    await until(() => page.$('[data-role=rig-seats] tr[data-seat="main"][data-locked]'), 8000);
    const lk = await page.$eval('[data-role=rig-seats] tr[data-seat="main"]', (tr) => ({ locked: tr.dataset.locked, lock: !!tr.querySelector('[data-role=rig-lock]'), launcherDisabled: tr.querySelector('[data-role=rig-launcher]').disabled }));
    check('보호된 자리는 잠금 표시와 막힌 칸', lk.locked === '1' && lk.lock && lk.launcherDisabled, lk);
    await shot2('panel-locked', '[data-role=rig-panel]');
    await call('rig.unprotect', { workspace: WS, pointer: '/seats/main' });
  }
  if (WHAT === 'phone') {
    await page.evaluate(() => { window.__mtViewOnly = true; });
    await openMenu();
    const items = await menuItems();
    check('원격 흉내: 메뉴에 만들기 없음, 보기만', !items.includes('rig-create'), items);
    await page.click('[data-role=region-menu] [data-action=rig-panel]');
    await until(() => page.$('[data-role=rig-panel]'), 8000);
    await page.setViewportSize({ width: 390, height: 844 });
    await sleep(800);
    const v = await page.evaluate(() => ({ remote: document.querySelector('[data-role=rig-panel]').dataset.remote, save: !!document.querySelector('[data-action=rig-save]'), say: !!document.querySelector('[data-role=rig-say]'), add: !!document.querySelector('[data-action=rig-add-seat]'), off: !!document.querySelector('[data-action=rig-panel-off]'), inputsEnabled: [...document.querySelectorAll('[data-role=rig-panel] input, [data-role=rig-panel] select')].filter((x) => !x.disabled).length, overflowX: document.documentElement.scrollWidth > window.innerWidth }));
    check('휴대폰 폭 rig 판은 보기만(저장·말로 고치기·더하기·끄기 없음, 칸은 막힘)', v.remote === '1' && !v.save && !v.say && !v.add && !v.off && v.inputsEnabled === 0, v);
    await shot2('phone-panel');
  }
} catch (e) { check('예외 없음', false, e.stack); try { await page.screenshot({ path: path.join(OUT, 'error.png') }); } catch {} }
finally { await closeApp(app).catch(() => {}); }
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
log(`끝: ${results.filter((r) => r.ok).length}/${results.length}`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
