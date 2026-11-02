// P6c 창 시험(합칠 때 메모 4번): herdr를 다시 띄워 셸에서 돌던 명령이 끊기면, 셸 노드는 "끊긴 턴"이 아니라 "끊긴 명령"으로 보인다(P6b I8).
// sh1(셸, proj)에서 ping을 돌리는 중에 이 판의 herdr(atrium-dev-p6c)를 다시 띄운다. 판의 claude(s1, s2)는 이어 가기로 다시 뜬다.
// 실행: cd app && npm run build && MT_E2E_OUT=p6c node test/e2e/p6c-shell-interrupted.mjs
import { launch, logger, closeApp, shot, sleep, until, idOf, st, atrium } from './p6c-lib.mjs';

const log = logger('p6c-shell-interrupted');
const { app, page } = await launch({ log });
try {
  const sh1 = await idOf(page, 'sh1');
  const sum = () => st(page, (i) => { const s = window.__mt.getState().sessions.get(i); return { state: s.state, interrupted: s.interruptedTurn, command: s.shell && s.shell.command }; }, sh1);
  atrium('input', 'sh1', 'ping -n 300 127.0.0.1\\r');
  await until(async () => (await sum()).state === 'shell_running', 30000, 300);
  log('명령 도는 중', await sum());
  log('herdr 다시 띄우기', atrium('herdr', 'restart', '--yes').trim().split('\n').slice(-2).join(' | '));
  await until(async () => !!(await sum()).interrupted, 90000, 500);
  await until(async () => (await sum()).state === 'shell_idle', 60000, 500).catch(() => {});
  log('다시 뜬 뒤', await sum());
  await page.evaluate((id) => window.__mt.getState().navigateTo(id), sh1);
  await sleep(1200);
  const node = `.mt-node[data-session="${sh1}"]`;
  log('배지', await page.locator(`${node} [data-role="interrupted-badge"]`).innerText(), '띠 제목', await page.locator(`${node} [data-role="interrupted"] .mt-card-title`).innerText(), '띠 셸', await page.locator(`${node} [data-role="interrupted"]`).getAttribute('data-shell'));
  log('띠 글', (await page.locator(`${node} [data-role="interrupted"]`).innerText()).replace(/\s+/g, ' '));
  await shot(page, 'shell-1-interrupted-command', log);
  await page.locator(`${node} [data-role="interrupted"] button:has-text("확인함")`).click();
  await until(async () => !(await sum()).interrupted, 10000, 300);
  log('확인함 뒤', await sum());
  log('끝');
} catch (e) { log('실패', e.stack || e.message); await shot(page, 'shell-fail', log).catch(() => {}); process.exitCode = 1; }
await closeApp(app);
process.exit();
