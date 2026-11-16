// P188 창 시험: 영역 이름표 메뉴의 rig 항목 아래 "사람만 고치는 목록" 창 — 포인터·파일 넣기·빼기, 바뀐 파일 다시 승인, 정의 버전, 최근 알림.
// 판: 따로 띄운 개발용 판(P188_BOARD, P188_PORT, P188_DATA)만. 창 원격 디버깅 포트 P188_DEBUG. 판에는 rig가 켜진 시험 폴더(P188_WS)가 있어야 한다.
// 실행: node app/test/e2e/p188-rig-protect.mjs   (실제 판 변수를 지운 셸에서) 결과는 워크트리의 experiments/p188/shots/(저장소 밖).
import fs from 'node:fs';
import path from 'node:path';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const OUT = path.join(REPO, 'experiments', 'p188', 'shots');
const BOARD = process.env.P188_BOARD || 'atrium-dev-p188', PORT = process.env.P188_PORT || '47957', DEBUG = process.env.P188_DEBUG || '9437';
const DATA = process.env.P188_DATA || path.join(process.env.LOCALAPPDATA || '', 'atrium-dev-p188');
const WS = process.env.P188_WS || 'c:/workspace/mtask-p188-a';
const FILE = process.env.P188_FILE || 'C:/Workspace/mtask-p188-a/.atrium/tools/summary.mjs';
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_|HC_)/.test(k)) delete process.env[k];
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
const ENV = {
  ATRIUM_TERMINAL_SESSION: BOARD, ATRIUM_HERDR_SESSION: BOARD, ATRIUM_PORT: PORT, ATRIUM_DATA_DIR: DATA, ATRIUM_APP_USERDATA: path.join(DATA, 'app'),
  ATRIUM_CLAUDE_PROJECTS: path.join(DATA, 'no-projects'), ATRIUM_CLAUDE_DESKTOP: 'none', ATRIUM_TEST_PREFIX: 'p188-none-',
};
Object.assign(process.env, ENV);
fs.mkdirSync(OUT, { recursive: true });
const { logger, sleep, launch, closeApp, shot: shot0 } = await import('./harness.mjs');
const { assertTestBoard } = await import('./p9-guard.mjs');
assertTestBoard(ENV);
const log = logger('p188-rig-protect');
const shot = (pg, n) => shot0(pg, n, log);
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 1200)}` : ''}`); };
const until = async (fn, ms = 8000) => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) return null; await sleep(200); } };

const { app, page } = await launch({ log, env: { ...ENV }, args: [`--remote-debugging-port=${DEBUG}`] });
try {
  await app.evaluate(({ BrowserWindow, screen }) => { const w = BrowserWindow.getAllWindows()[0]; const left = Math.min(...screen.getAllDisplays().map((d) => d.bounds.x)); const b = w.getBounds(); w.setPosition(left - b.width - 200, 40); }).catch(() => {});
  await page.setViewportSize({ width: 1584, height: 921 }).catch(() => {});
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await sleep(3000);
  const openMenu = async () => {
    await page.click(`.mt-region[data-ws="${WS}"] .mt-region-name`, { button: 'right' });
    return until(() => page.$('[data-role=region-menu]'), 4000);
  };
  // 파일을 바꿔 둔다(사람만 고치는 파일과 어긋남)
  fs.appendFileSync(FILE, '// p188 e2e change\n');
  const menu = await openMenu();
  const items = menu ? await page.$$eval('[data-role=region-menu] [data-action]', (bs) => bs.map((b) => [b.dataset.action, b.textContent])) : [];
  await sleep(600);
  await shot(page, 'menu');
  check('메뉴에 rig 끄기와 사람만 고치는 목록', items.some(([a]) => a === 'rig-off') && items.some(([a]) => a === 'rig-protect'), items);
  await page.click('[data-role=region-menu] [data-action=rig-protect]');
  await until(() => page.$('[data-role=rig-protect] [data-role=rig-protect-files] li'), 6000);
  await sleep(500);
  await shot(page, 'dialog-changed');
  const st1 = await page.evaluate(() => ({ ptr: [...document.querySelectorAll('[data-role=rig-protect-pointers] li code')].map((x) => x.textContent), files: [...document.querySelectorAll('[data-role=rig-protect-files] li')].map((x) => ({ ok: x.dataset.ok, text: x.innerText.replace(/\s+/g, ' ') })), alerts: document.querySelectorAll('[data-role=rig-protect-alerts] li').length, re: !!document.querySelector('[data-action=rig-reapprove]') }));
  check('포인터 목록과 바뀐 파일(다시 승인 단추), 최근 알림', st1.ptr.includes('/seats/reviewer') && st1.files.some((f) => f.ok === '0') && st1.re && st1.alerts > 0, st1);
  // 포인터 넣기·빼기
  await page.fill('[data-role=rig-protect-pointer-input]', '/flow');
  await page.click('[data-action=rig-protect-pointer]');
  await until(() => page.evaluate(() => [...document.querySelectorAll('[data-role=rig-protect-pointers] li code')].some((x) => x.textContent === '/flow')), 4000);
  const ptr2 = await page.$$eval('[data-role=rig-protect-pointers] li code', (xs) => xs.map((x) => x.textContent));
  check('포인터 넣기', ptr2.includes('/flow'), ptr2);
  const del = await page.$$('[data-action=rig-unprotect-pointer]');
  await del[del.length - 1].click();
  await until(async () => !(await page.$$eval('[data-role=rig-protect-pointers] li code', (xs) => xs.map((x) => x.textContent))).includes('/flow'), 4000);
  check('포인터 빼기', !(await page.$$eval('[data-role=rig-protect-pointers] li code', (xs) => xs.map((x) => x.textContent))).includes('/flow'));
  // 다시 승인
  await page.click('[data-action=rig-reapprove]');
  await until(() => page.evaluate(() => [...document.querySelectorAll('[data-role=rig-protect-files] li')].every((x) => x.dataset.ok === '1')), 4000);
  await sleep(400);
  await shot(page, 'dialog-approved');
  check('다시 승인하면 파일이 맞음으로', await page.evaluate(() => [...document.querySelectorAll('[data-role=rig-protect-files] li')].every((x) => x.dataset.ok === '1')));
  await page.click('[data-action=rig-protect-close]');
} catch (e) { check('예외 없음', false, e.stack); }
finally { await closeApp(app).catch(() => {}); }
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
log(`끝: ${results.filter((r) => r.ok).length}/${results.length}`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
