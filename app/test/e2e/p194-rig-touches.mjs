// P194 창 시험: rig 8단계 창 손질 셋. 따로 띄운 개발용 판(P194_BOARD, P194_PORT, P194_DATA)만, 창 원격 디버깅 포트 P194_DEBUG.
// 실행: node app/test/e2e/p194-rig-touches.mjs <워크스페이스 키(켜진 rig, 런처 id로 적힌 정의)> <새 워크스페이스 키(정의 없음)>   (실제 판 변수를 지운 셸에서)
//   1) rig 판: 자리 표의 워크트리 열 머리가 다 보인다(잘리지 않음), 미리보기·런처 칸이 런처 id가 아니라 이름
//   2) 만들기 대화상자의 미리보기: 런처 이름
//   3) 자리 이름과 같은 이름으로 사람이 띄우면(새 세션 창, 셸) 알림에 바뀐 이름 한 줄
// 그림은 ko·en 하나씩. 결과는 워크트리의 experiments/p194/shots/(저장소 밖).
import fs from 'node:fs';
import path from 'node:path';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const OUT = path.join(REPO, 'experiments', 'p194', 'shots');
const BOARD = process.env.P194_BOARD || 'atrium-dev-p194', PORT = process.env.P194_PORT || '47963', DEBUG = process.env.P194_DEBUG || '9443';
const DATA = process.env.P194_DATA || path.join(process.env.LOCALAPPDATA || '', 'atrium-dev-p194');
const WS = process.argv[2] || 'c:/workspace/mtask-p194-a';
const WS2 = process.argv[3] || 'c:/workspace/mtask-p194-c';
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_|HC_)/.test(k)) delete process.env[k];
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
const ENV = {
  ATRIUM_TERMINAL_SESSION: BOARD, ATRIUM_HERDR_SESSION: BOARD, ATRIUM_PORT: PORT, ATRIUM_DATA_DIR: DATA, ATRIUM_APP_USERDATA: path.join(DATA, 'app'),
  ATRIUM_CLAUDE_PROJECTS: path.join(DATA, 'no-projects'), ATRIUM_CLAUDE_DESKTOP: 'none', ATRIUM_TEST_PREFIX: 'p194-none-',
};
Object.assign(process.env, ENV);
fs.mkdirSync(OUT, { recursive: true });
const { logger, sleep, launch, closeApp } = await import('./harness.mjs');
const { assertTestBoard } = await import('./p9-guard.mjs');
assertTestBoard(ENV);
const log = logger('p194-rig-touches');
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 1200)}` : ''}`); };
const until = async (fn, ms = 8000, step = 250) => { const t0 = Date.now(); for (;;) { const v = await fn().catch(() => null); if (v) return v; if (Date.now() - t0 > ms) return null; await sleep(step); } };

const { app, page } = await launch({ log, env: { ...ENV }, args: [`--remote-debugging-port=${DEBUG}`] });
const call = (m, p) => page.evaluate(([m, p]) => window.__mt.api.call(m, p), [m, p]);
const lang = async (l) => { await page.evaluate((l) => window.__mt.api.call('settings.set', { key: 'language', value: l }), l); await sleep(500); };
const shot = async (name, l, sel = null) => {
  const file = path.join(OUT, `${name}-${l}.png`);
  const el = sel ? await page.$(sel) : null;
  if (el) await el.screenshot({ path: file }); else await page.screenshot({ path: file });
  log(`shot ${name}-${l}`);
};
const openMenu = async (ws) => {
  await page.keyboard.press('Escape').catch(() => {});
  if (!(await page.$(`.mt-region[data-ws="${ws}"] .mt-region-name`))) { await call('workspace.select', { workspace: ws }).catch(() => {}); await until(() => page.$(`.mt-region[data-ws="${ws}"] .mt-region-name`), 5000); }
  await page.click('[data-action=chip-fit]').catch(() => {}); await sleep(700); // 화면 밖이면(띄운 카드로 확대됨) 전체 보기
  await page.click(`.mt-region[data-ws="${ws}"] .mt-region-name`, { button: 'right' });
  return until(() => page.$('[data-role=region-menu]'), 4000);
};

try {
  await app.evaluate(({ BrowserWindow, screen }) => { const w = BrowserWindow.getAllWindows()[0]; const left = Math.min(...screen.getAllDisplays().map((d) => d.bounds.x)); const b = w.getBounds(); w.setPosition(left - b.width - 200, 40); }).catch(() => {});
  await page.setViewportSize({ width: 1584, height: 921 }).catch(() => {});
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await sleep(3000);
  const L = await call('launcher.list', {});
  const ids = L.launchers.map((l) => l.id);
  const def = (await call('rig.get', { workspace: WS })).definition;
  const want = Object.fromEntries(Object.entries(def.seats).map(([k, s]) => [k, (L.launchers.find((l) => l.id === s.launcher) || {}).name]));
  check('시험 rig는 런처 id로 적혀 있다', Object.values(def.seats).every((s) => ids.includes(s.launcher)), def.seats);

  // ---------- 1) rig 판 ----------
  for (const l of ['ko', 'en']) {
    await lang(l);
    await openMenu(WS);
    await page.click('[data-role=region-menu] [data-action=rig-panel]');
    await until(() => page.$('[data-role=rig-panel] [data-role=rig-seats]'), 8000);
    await sleep(800);
    const th = await page.$eval('[data-role=rig-seats] th.mt-rigpanel-cbh', (x) => ({ text: x.textContent, sw: x.scrollWidth, cw: x.clientWidth, h: x.getBoundingClientRect().height, lh: parseFloat(getComputedStyle(x).lineHeight) || 18, ws: getComputedStyle(x).whiteSpace }));
    const range = await page.$eval('[data-role=rig-seats] th.mt-rigpanel-cbh', (x) => { const r = document.createRange(); r.selectNodeContents(x); const b = r.getBoundingClientRect(); const c = x.getBoundingClientRect(); return { textW: b.width, thW: c.width, rects: r.getClientRects().length }; });
    check(`[${l}] 워크트리 열 머리가 한 줄로 다 보인다`, th.text === (l === 'ko' ? '워크트리' : 'Worktree') && th.ws === 'nowrap' && th.sw <= th.cw + 1 && range.rects === 1 && range.textW <= range.thW, { th, range });
    const pv = await page.$$eval('[data-role=rig-panel] [data-role=rig-preview] .mt-rigpv-seat', (xs) => xs.map((x) => ({ seat: x.dataset.seat, sub: x.querySelector('.mt-rigpv-sub').textContent })));
    check(`[${l}] rig 판 미리보기에 런처 이름`, pv.length && pv.every((p) => want[p.seat] && p.sub.includes(want[p.seat]) && !ids.some((id) => p.sub.includes(id))), pv);
    const sel = await page.$$eval('[data-role=rig-seats] tr[data-seat] [data-role=rig-launcher]', (xs) => xs.map((x) => x.options[x.selectedIndex].textContent));
    check(`[${l}] 자리 표의 런처 칸에 이름`, sel.length && sel.every((s) => !ids.includes(s)), sel);
    await shot('01-panel', l, '[data-role=rig-panel]');
    await page.click('[data-action=rig-panel-close]');
    await sleep(300);
  }

  // ---------- 2) 만들기 대화상자의 미리보기 ----------
  const haiku = L.launchers.find((l) => l.name === 'Haiku') || L.launchers.find((l) => l.harness === 'claude');
  await lang('ko');
  await openMenu(WS2);
  await page.click('[data-role=region-menu] [data-action=rig-create]');
  await until(() => page.$('[data-role=rig-create] [data-action=rig-template]'), 8000);
  await page.click('[data-action=rig-template][data-template="main-worker"]');
  await until(async () => (await page.$eval('[data-role=rig-create]', (x) => x.dataset.step)) === 'launchers');
  for (const s of ['main', 'worker']) await page.selectOption(`[data-role=rig-launchers] [data-seat="${s}"] select`, haiku.id);
  await page.click('[data-role=rig-create] [data-action=rig-setup-next]');
  await until(async () => (await page.$eval('[data-role=rig-create]', (x) => x.dataset.step)) === 'preview', 10000);
  await sleep(600);
  for (const l of ['ko', 'en']) {
    await lang(l);
    const pv = await page.$$eval('[data-role=rig-create] .mt-rigpv-seat .mt-rigpv-sub', (xs) => xs.map((x) => x.textContent));
    check(`[${l}] 만들기 미리보기에 런처 이름`, pv.length === 2 && pv.every((t) => t.includes(haiku.name) && !t.includes(haiku.id)), pv);
    await shot('02-create-preview', l, '[data-role=rig-create]');
  }
  await page.keyboard.press('Escape').catch(() => {});
  await sleep(400);

  // ---------- 3) 이름 바뀜 알림 ----------
  for (const l of ['ko', 'en']) {
    await lang(l);
    // 띄운 뒤 판이 새 카드로 가므로 이름표 대신 아래 칩 "새 세션…"으로 연다(폴더는 시험 워크스페이스)
    await page.keyboard.press('Escape').catch(() => {});
    await page.click('[data-action=chip-spawn]');
    await until(() => page.$('[data-role=spawn]'), 4000);
    await page.fill('[data-role=spawn] [data-field=cwd]', (await call('rig.get', { workspace: WS })).root || 'C:/Workspace/mtask-p194-a');
    await page.selectOption('[data-role=spawn] [data-field=launcher]', '');
    await until(() => page.$('[data-role=spawn] [data-field=kind]'), 3000);
    await page.selectOption('[data-role=spawn] [data-field=kind]', 'shell');
    await page.fill('[data-role=spawn] [data-field=name]', 'worker');
    await page.click('[data-role=spawn] [data-action=spawn-submit]');
    const toast = await until(async () => { const ts = await page.$$eval('.mt-toast', (xs) => xs.map((x) => x.textContent)); return ts.find((x) => (l === 'ko' ? /겹쳐/ : /renamed/).test(x)) || null; }, 10000);
    const m = toast && toast.match(/@(worker-\d+)/);
    check(`[${l}] 자리 이름과 겹쳐 바뀐 이름을 알린다`, !!toast && (l === 'ko' ? /rig 자리 이름과 겹쳐 세션 이름을 바꿨습니다: worker → @worker-\d+/ : /renamed because worker is a rig seat name here: @worker-\d+/).test(toast), toast);
    await sleep(300);
    await shot('03-renamed-toast', l);
    await sleep(1500);
  }
} catch (e) { check('시험이 끝까지 돌았다', false, e.stack); }
finally { await closeApp(app).catch(() => {}); }
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
const bad = results.filter((r) => !r.ok);
log(`${results.length - bad.length}/${results.length} PASS`);
process.exit(bad.length ? 1 : 0);
