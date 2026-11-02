// P3 완료 기준 10(D3): 판 전용 herdr 세션에 다른 클라이언트(herdr 화면)가 붙으면 경고한다.
// 시험: 자기 개발용 세션(atrium-dev)에 herdr 화면을 붙인다. 화면이 필요하므로 다른 시험 세션(atrium-dev-other)의 셸 패널 안에서 띄운다.
// 알아내는 법: (1) herdr 서버 로그의 "client connected"(화면)와 "client disconnected", (2) herdr.exe 명령줄(하위 명령 없는 --session atrium-dev)
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { launch, shot, logger, sleep, until } from './harness.mjs';

const OTHER = process.env.MT_OTHER_SCRIPT; // experiments/p3/tools/tui-host.mjs(P4에서 other.mjs를 D3용으로 줄임)
const other = (...a) => execFileSync(process.execPath, [OTHER, ...a], { encoding: 'utf8' });
const HERDR = process.env.ATRIUM_HERDR || path.join(os.homedir(), '.herdr', 'packages', 'standalone', 'releases', '0.9.5-x86_64-pc-windows-msvc', 'herdr.exe');
const log = logger('d3-clients');
const { app, page } = await launch({ log });
const clients = () => page.evaluate(() => window.__mt.getState().clients);
const banner = () => page.evaluate(() => { const b = document.querySelector('[data-role="d3-warning"]'); return b ? b.textContent : null; });
log('붙이기 전', await clients(), await banner());

const t0 = Date.now();
other('text', 'w1:p1', `Get-ChildItem Env:HERDR* | ForEach-Object { Remove-Item "Env:$($_.Name)" }; & '${HERDR}' --session atrium-dev`);
other('keys', 'w1:p1', 'enter');
await until(async () => !!(await banner()), 20000);
log(`경고까지 ${Date.now() - t0}ms`, await clients());
log('경고 글', await banner());
await shot(page, 'd3-1-warning-tui-attached', log);
// 프로세스 쪽 신호는 자원 감시(약 30초마다)에 실린다. 바로 재 본다
const res = await page.evaluate(() => window.__mt.api.call('resources.get', { fresh: true }));
await sleep(500);
log('프로세스로 찾은 화면', res.tuiProcesses, '판의 제어기', res.controllers.pids);
const c = await page.evaluate(() => window.__mt.api.call('herdr.clients'));
log('herdr.clients', c);

// 화면을 닫으면(직접 띄운 화면 프로세스만 PID로 끈다) 경고가 사라진다
const pid = (c.viaProcess[0] || {}).pid;
if (pid) execFileSync('taskkill', ['/PID', String(pid), '/F']);
log('화면 프로세스 끔', pid);
await page.evaluate(() => window.__mt.api.call('resources.get', { fresh: true }));
await until(async () => !(await banner()), 20000);
log('끈 뒤', await clients());
await shot(page, 'd3-2-warning-cleared', log);
await app.close();
