// P168 창 시험: 위 바 메모리 알약과 세션별 값이 그 판 세션들의 실제 합(PID 재사용을 거른 프로세스 나무)과 맞는가.
// 개발용 판(ATRIUM_TERMINAL_SESSION·ATRIUM_PORT·ATRIUM_DATA_DIR·ATRIUM_APP_USERDATA를 명령줄에서 준다)에 세션을 띄워 둔 뒤 돈다.
// 결과와 그림은 experiments/<MT_E2E_OUT>/(git 밖). 창 안만 찍는다
import { launch, closeApp, shot, logger, sleep } from './harness.mjs';
import { assertTestBoard } from './p9-guard.mjs';
import { readProcessTable, descendants, mb } from '../../../backend/src/resources.mjs';

assertTestBoard(process.env);
const log = logger('p168-mem');
const { app, page } = await launch({ log, env: {} });
let code = 0;
try {
  // 첫 자원 표본(뜬 뒤 3초)과 세션 표본이 올 때까지
  await page.waitForFunction(() => { const r = window.__mt.getState().resources; return r && r.sessions && r.sessions.length > 0 && r.sessions.every((x) => x.shellPid); }, null, { timeout: 90000, polling: 500 });
  await sleep(1500);
  const r = await page.evaluate(() => window.__mt.getState().resources);
  const table = await readProcessTable();
  let sum = 0;
  for (const x of r.sessions) {
    const tree = descendants(table.procs, x.shellPid);
    const real = mb(tree.reduce((a, p) => a + p.ws, 0));
    sum += real;
    const diff = Math.abs(real - (x.memMB || 0));
    log(`${x.name} shell=${x.shellPid} board=${x.memMB}MB procs=${x.procs} real-now=${real}MB procs=${tree.length} [${tree.map((p) => p.name).join(',')}] ${x.suspect ? 'SUSPECT ' + x.suspect : ''}`);
    if (x.memMB == null || diff > Math.max(30, real * 0.15)) { log(`  !! ${x.name}: 차이 ${diff}MB`); code = 1; }
    if (tree.some((p) => /^(wininit|services|lsass|csrss)\.exe$/i.test(p.name))) { log(`  !! ${x.name}: 시스템 프로세스가 든다`); code = 1; }
  }
  log(`board sessionsMB=${r.sessionsMB}MB real-now sum=${mb(sum * 1048576)}MB (표본 시각 ${new Date(r.at).toISOString()})`);
  const pill = await page.locator('[data-role="resources"]').innerText();
  log(`알약 글: ${pill.replace(/\s+/g, ' ')}`);
  await page.locator('[data-role="resources"]').click();
  await page.waitForSelector('[data-role="resources-list"]');
  const rows = await page.$$eval('[data-role="resources-list"] .mt-chip', (els) => els.map((e) => e.innerText.replace(/\s+/g, ' ')));
  log(`목록: ${JSON.stringify(rows)}`);
  await shot(page, 'p168-mem-list', log);
} catch (e) { log(`실패 ${e.stack}`); code = 1; } finally {
  await closeApp(app);
}
log(code ? '결과: 실패' : '결과: 통과');
process.exit(code);
