// P196 창 시험: Antigravity(agy) 로고·이름과 호출자 드롭다운. 따로 띄운 개발용 판(P196_BOARD, P196_PORT, P196_DATA)만, 창 원격 디버깅 포트 P196_DEBUG.
// 실행: node app/test/e2e/p196-agy.mjs <시험 폴더>   (실제 판 변수를 지운 셸에서, 백엔드는 CLI로 먼저 띄운다)
//   1) 호출자 목록: Antigravity 호출자 줄에 agy 로고 그림
//   2) 호출자 편집 틀: 하네스 드롭다운에 Antigravity(agy), 아이콘 드롭다운에 Antigravity
//   3) 새 세션 창: 호출자 드롭다운에 Antigravity 호출자, 직접 고르기 종류 드롭다운에 Antigravity
//   4) 레일 단추·노드 아이콘(어두운 판): agy 로고 그림. 노드는 agy를 띄우지 않고 셸 호출자(아이콘 agy)로 띄운다
// 그림은 ko·en 하나씩. 결과는 워크트리의 experiments/p196/shots/(저장소 밖).
import fs from 'node:fs';
import path from 'node:path';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const OUT = path.join(REPO, 'experiments', 'p196', 'shots');
const BOARD = process.env.P196_BOARD || 'atrium-dev-p196', PORT = process.env.P196_PORT || '47965', DEBUG = process.env.P196_DEBUG || '9445';
const DATA = process.env.P196_DATA || path.join(process.env.LOCALAPPDATA || '', 'atrium-dev-p196');
const DIR = process.argv[2] || 'C:/Workspace/mtask-p196-a';
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_|HC_)/.test(k)) delete process.env[k];
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
const ENV = {
  ATRIUM_TERMINAL_SESSION: BOARD, ATRIUM_HERDR_SESSION: BOARD, ATRIUM_PORT: PORT, ATRIUM_DATA_DIR: DATA, ATRIUM_APP_USERDATA: path.join(DATA, 'app'),
  ATRIUM_CLAUDE_PROJECTS: path.join(DATA, 'no-projects'), ATRIUM_CLAUDE_DESKTOP: 'none', ATRIUM_TEST_PREFIX: 'p196-none-',
};
Object.assign(process.env, ENV);
fs.mkdirSync(OUT, { recursive: true });
const { logger, sleep, launch, closeApp } = await import('./harness.mjs');
const { assertTestBoard } = await import('./p9-guard.mjs');
assertTestBoard(ENV);
const log = logger('p196-agy');
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 1200)}` : ''}`); };
const until = async (fn, ms = 8000, step = 250) => { const t0 = Date.now(); for (;;) { const v = await fn().catch(() => null); if (v) return v; if (Date.now() - t0 > ms) return null; await sleep(step); } };

const { app, page } = await launch({ log, env: { ...ENV }, args: [`--remote-debugging-port=${DEBUG}`] });
const call = (m, p) => page.evaluate(([m, p]) => window.__mt.api.call(m, p), [m, p]);
const lang = async (l) => { await call('settings.set', { key: 'language', value: l }); await sleep(500); };
const shot = async (name, l, sel = null) => {
  const file = path.join(OUT, `${name}-${l}.png`);
  const el = sel ? await page.$(sel) : null;
  if (el) await el.screenshot({ path: file }); else await page.screenshot({ path: file });
  log(`shot ${name}-${l}`);
};
const esc = async () => { for (let i = 0; i < 3; i++) { await page.keyboard.press('Escape').catch(() => {}); await sleep(150); } };
const imgLoaded = (sel) => page.$$eval(sel, (xs) => xs.map((x) => ({ src: x.getAttribute('src'), ok: x.complete && x.naturalWidth > 0, alt: x.alt })));

let sid = null;
try {
  await app.evaluate(({ BrowserWindow, screen }) => { const w = BrowserWindow.getAllWindows()[0]; const left = Math.min(...screen.getAllDisplays().map((d) => d.bounds.x)); const b = w.getBounds(); w.setPosition(left - b.width - 200, 40); }).catch(() => {});
  await page.setViewportSize({ width: 1584, height: 921 }).catch(() => {});
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' });
  await sleep(2000);
  await call('workspace.open', { path: DIR }).catch((e) => log(`workspace.open ${e.message}`));
  await sleep(800);
  // 시험 호출자: Antigravity(agy 하네스, 아이콘 비움)와 셸(아이콘 agy, 노드 그림용)
  let L = await call('launcher.list', {});
  const mk = async (launcher) => (L.launchers.find((l) => l.name === launcher.name) || (await call('launcher.create', { launcher, favorite: true })).launcher || {}).id;
  await mk({ name: 'Antigravity', harness: 'agy', icon: '', model: '', effort: '', permissionMode: 'manual', args: '', env: '', command: '', connection: '', startCommand: '' });
  await mk({ name: 'agy-shell', harness: 'shell', icon: 'agy', model: '', effort: '', permissionMode: 'manual', args: '', env: '', command: '', connection: '', startCommand: '' });
  await sleep(600);
  L = await call('launcher.list', {});
  const agyL = L.launchers.find((l) => l.name === 'Antigravity');
  const shL = L.launchers.find((l) => l.name === 'agy-shell');
  check('하네스 표에 agy가 Antigravity로', (L.harnesses || []).some((h) => h.id === 'agy' && h.label === 'Antigravity'), (L.harnesses || []).map((h) => `${h.id}:${h.label}`));

  // 노드: 셸 호출자(아이콘 agy)로 띄운다
  const r = await call('session.spawn', { cwd: DIR, launcher: shL.id, name: 'p196-node' });
  sid = r.sessionId;
  await sleep(2500);

  for (const l of ['ko', 'en']) {
    await lang(l);
    await esc();
    // ---------- 4) 레일과 노드 ----------
    const rail = await imgLoaded(`[data-action=launch][data-launcher="${agyL.id}"] img.mt-kind-icon`);
    check(`[${l}] 레일 단추에 agy 로고`, rail.length === 1 && rail[0].ok && /agy\.png$/.test(rail[0].src) && rail[0].alt === 'Antigravity', rail);
    await page.click('[data-action=chip-fit]').catch(() => {}); await sleep(900);
    const node = await until(async () => { const v = await imgLoaded('.react-flow__node img.mt-kind-icon[data-kind=agy]'); return v.length ? v : null; }, 6000);
    check(`[${l}] 노드 아이콘에 agy 로고(어두운 판)`, node && node.every((x) => x.ok && /agy\.png$/.test(x.src)), node);
    await shot('04-board', l);
    const nodeEl = await page.$('.react-flow__node:has(img.mt-kind-icon[data-kind=agy])');
    if (nodeEl) { await nodeEl.screenshot({ path: path.join(OUT, `04-node-${l}.png`) }); log(`shot 04-node-${l}`); }
    const railEl = await page.$('.mt-rail, [data-role=rail]');
    if (railEl) { await railEl.screenshot({ path: path.join(OUT, `04-rail-${l}.png`) }); log(`shot 04-rail-${l}`); }

    // ---------- 1) 호출자 목록 ----------
    await page.click('[data-action=settings-open]');
    await until(() => page.$('[data-role=settings]'), 5000);
    await page.click('[data-role=settings] [data-tab=launchers]');
    await until(() => page.$('[data-role=launchers-list]'), 5000);
    await sleep(500);
    const row = await imgLoaded(`[data-role=launcher-row][data-launcher="${agyL.id}"] img.mt-kind-icon`);
    check(`[${l}] 호출자 목록 줄에 agy 로고`, row.length === 1 && row[0].ok && /agy\.png$/.test(row[0].src), row);
    await shot('01-launchers', l, '[data-role=settings]');

    // ---------- 2) 편집 틀 ----------
    await page.click(`[data-role=launcher-row][data-launcher="${agyL.id}"] [data-action=launcher-edit]`);
    await until(() => page.$('[data-role=launcher-form]'), 5000);
    await sleep(600);
    const hopts = await page.$$eval('[data-field=launcher-harness] option', (xs) => xs.map((x) => ({ v: x.value, t: x.textContent })));
    const hsel = await page.$eval('[data-field=launcher-harness]', (x) => x.options[x.selectedIndex].textContent);
    check(`[${l}] 하네스 드롭다운에 Antigravity(agy), 고른 값도 Antigravity`, hopts.filter((o) => o.v === 'agy').length === 1 && hopts.find((o) => o.v === 'agy').t === 'Antigravity' && hsel === 'Antigravity' && !hopts.some((o) => /\bAGY\b/.test(o.t)), hopts);
    const iopts = await page.$$eval('[data-field=launcher-icon] option', (xs) => xs.map((x) => ({ v: x.value, t: x.textContent })));
    check(`[${l}] 아이콘 드롭다운에 Antigravity`, (iopts.find((o) => o.v === 'agy') || {}).t === 'Antigravity', iopts);
    await shot('02-form', l, '[data-role=settings]');
    // 드롭다운 펼친 모양은 OS 그림이라 찍히지 않는다. 대신 목록 글을 결과에 남긴다
    fs.writeFileSync(path.join(OUT, `02-options-${l}.json`), JSON.stringify({ harness: hopts, icon: iopts }, null, 2));
    await page.click('[data-action=launcher-cancel]');
    await esc();

    // ---------- 3) 새 세션 창 ----------
    await page.click(`[data-action=launch][data-launcher="${agyL.id}"]`, { modifiers: ['Shift'] });
    await until(() => page.$('[data-role=spawn]'), 5000);
    await sleep(500);
    const lopts = await page.$$eval('[data-role=spawn] [data-field=launcher] option', (xs) => xs.map((x) => ({ v: x.value, t: x.textContent })));
    const lsel = await page.$eval('[data-role=spawn] [data-field=launcher]', (x) => x.options[x.selectedIndex].textContent);
    check(`[${l}] 새 세션 창 호출자 드롭다운에 Antigravity(고른 값)`, lopts.some((o) => o.v === agyL.id) && /Antigravity/.test(lsel), lopts);
    await shot('03-spawn', l, '[data-role=spawn]');
    await page.selectOption('[data-role=spawn] [data-field=launcher]', '');
    await sleep(800);
    const kopts = await page.$$eval('[data-role=spawn] [data-field=kind] option', (xs) => xs.map((x) => ({ v: x.value, t: x.textContent, dis: x.disabled })));
    check(`[${l}] 직접 고르기 종류 드롭다운에 Antigravity`, kopts.some((o) => o.v === 'agy' && /^Antigravity/.test(o.t)), kopts);
    await page.selectOption('[data-role=spawn] [data-field=kind]', 'agy').catch(() => {});
    await sleep(300);
    await shot('03-spawn-kind', l, '[data-role=spawn]');
    await esc();
  }
} catch (e) {
  check('시험 중 오류 없음', false, String(e && e.stack || e));
} finally {
  if (sid) await call('session.kill', { sessionId: sid }).catch(() => {});
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  const bad = results.filter((x) => !x.ok);
  log(`결과 ${results.length - bad.length}/${results.length} 통과`);
  await closeApp(app);
  process.exit(bad.length ? 1 : 0);
}
