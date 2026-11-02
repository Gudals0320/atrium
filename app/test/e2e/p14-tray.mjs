// P14 창 시험: 트레이 아이콘은 늘 있고(트레이 상주 기본 켜짐), 메뉴로 백엔드를 다시 띄우고, 끄고(창을 닫음), 켜고, herdr까지 끄고(확인), 백엔드도 끄고 끝낸다.
// 판: herdr 세션 atrium-dev-p14, 포트 47829, backend/.dev/p14. 세션은 띄우지 않는다. 대화 목록은 빈 폴더만 읽는다(실제 기록으로 영역을 열지 않게).
// 사용: MT_E2E_OUT=p14 node test/e2e/p14-tray.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { _electron as electron } from 'playwright';
import { APP_ROOT, REPO, OUT, sleep, until, shot, logger, e2eBoard } from './harness.mjs';
import { assertTestBoard } from './p9-guard.mjs';

const B = e2eBoard({ session: 'atrium-dev-p14', port: '47829', dev: path.join(REPO, 'backend', '.dev', 'p14') }); // P18: 다른 판에서 다시 돌릴 수 있게
if (!['p14', 'p18'].includes(process.env.MT_E2E_OUT)) throw new Error('MT_E2E_OUT=p14를 명령줄에서 준다');
const DEV = B.dev;
const EMPTY = path.join(DEV, 'no-projects');
const ENV = {
  ATRIUM_HERDR_SESSION: B.session, ATRIUM_PORT: B.port,
  ATRIUM_DATA_DIR: path.join(DEV, 'data'), ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  ATRIUM_CLAUDE_PROJECTS: EMPTY, ATRIUM_CLAUDE_DESKTOP: 'none',
};
assertTestBoard(ENV, { root: DEV });
fs.mkdirSync(EMPTY, { recursive: true });

const log = logger('p14-tray');
const cleanEnv = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(CLAUDECODE|CLAUDE_CODE_|CLAUDE_EFFORT|CLAUDE_PID|CLAUDE_AGENT_SDK|ELECTRON_RUN_AS_NODE)/.test(k)));
const env = { ...cleanEnv(), ...ENV };
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env });
const backendFile = path.join(ENV.ATRIUM_DATA_DIR, 'backend.json');
const backendPid = () => { try { return JSON.parse(fs.readFileSync(backendFile, 'utf8')).pid; } catch { return null; } };
const healthy = async () => { try { const r = await fetch(`http://127.0.0.1:${ENV.ATRIUM_PORT}/health`); return r.ok; } catch { return false; } };
const herdrRunning = () => { const out = execFileSync('herdr', ['session', 'list'], { encoding: 'utf8' }); const line = out.split('\n').find((l) => l.startsWith(`${ENV.ATRIUM_HERDR_SESSION} `)); return !!line && /\brunning\b/.test(line); };

const results = [];
const step = (name, ok, detail) => { results.push({ name, ok: !!ok, detail }); log(`${ok ? '통과' : '실패'} ${name}`, detail ?? ''); };

const app = await electron.launch({ args: ['.', '--dev'], cwd: APP_ROOT, env, timeout: 60000 });
const tray = () => app.evaluate(() => global.__mtTray.state());
const run = (id) => app.evaluate((_e, a) => { global.__mtTray.run(a); }, id);
const idle = () => until(async () => !(await tray()).busy, 60000, 300);
const windows = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);
// 앱이 끝났는지는 main pid로 본다. 백엔드가 물려받은 출력 파이프 때문에 Playwright의 close 이벤트는 늦거나 오지 않는다(harness closeApp 참고)
const mainPid = await app.evaluate(() => process.pid);
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
let exited = false;
try {
  const page = await app.firstWindow();
  await page.waitForFunction(() => window.__mt && window.__mt.getState().boardLoaded, null, { timeout: 90000 });
  await until(async () => (await tray()).connected, 20000);
  const t0 = await tray();
  step('트레이 아이콘이 있고 상주가 기본으로 켜져 있다(메뉴는 기본 영어)', t0.hasTray && t0.enabled && t0.lang === 'en' && t0.menu.some((m) => m.startsWith('Backend on')), t0.menu);
  // P16: 판 설정 language를 바꾸면 트레이 메뉴도 곧바로 그 언어다. 시험의 나머지 글은 한국어로 본다
  await page.evaluate(() => window.__mt.api.call('settings.set', { key: 'language', value: 'ko' }));
  await until(async () => (await tray()).lang === 'ko', 5000).catch(() => {});
  const tk = await tray();
  step('언어를 한국어로 바꾸면 트레이 메뉴와 툴팁이 한국어', tk.menu.some((m) => m.startsWith('백엔드 켜짐')) && tk.menu.includes('열기') && /내 차례/.test(tk.tooltip), { menu: tk.menu, tooltip: tk.tooltip });

  // 1. 백엔드 다시 띄우기: pid가 바뀌고 창이 다시 붙는다
  const pid1 = backendPid();
  await run('backend-restart'); await sleep(300); await idle();
  await until(async () => (await tray()).connected, 30000);
  const pid2 = backendPid();
  const conn = await until(() => page.evaluate(() => window.__mt.api.status === 'open'), 30000).catch(() => false);
  step('백엔드 다시 띄우기: 새 pid, 트레이와 창이 다시 붙는다', pid1 && pid2 && pid1 !== pid2 && conn, { pid1, pid2, conn });

  // 2. 백엔드 끄기: 창을 닫고 백엔드를 끈다. 앱과 트레이는 남는다
  await run('backend-stop'); await sleep(300); await idle();
  await until(async () => !(await tray()).connected, 15000).catch(() => {});
  const t2 = await tray();
  step('백엔드 끄기: 창이 닫히고 백엔드가 꺼지며 앱은 트레이에 남는다', (await windows()) === 0 && !(await healthy()) && !exited && t2.menu.some((m) => m.startsWith('백엔드 꺼짐')) && t2.menu.includes('백엔드 켜기'), { windows: await windows(), menu: t2.menu });
  await sleep(4000);
  step('창이 없으면 꺼진 백엔드를 다시 띄우지 않는다', !(await healthy()));

  // 3. 백엔드 켜기
  await run('backend-start'); await sleep(300); await idle();
  await until(async () => (await tray()).connected, 30000);
  step('백엔드 켜기: 백엔드가 뜨고 트레이가 붙는다', await healthy(), (await tray()).menu);

  // 4. 열기: 창이 다시 뜨고 판을 읽는다
  const wp = app.waitForEvent('window');
  await run('open');
  const page2 = await wp;
  await page2.waitForFunction(() => window.__mt && window.__mt.getState().boardLoaded, null, { timeout: 90000 });
  step('열기: 창이 다시 뜬다', true);
  await shot(page2, 'p14-tray-reopened', log);

  // 5. herdr까지 모두 끄기: 확인에서 취소하면 그대로, 확인하면 창, herdr, 백엔드가 꺼진다
  await app.evaluate(() => { global.__mtTrayConfirm = () => false; });
  await run('herdr-stop'); await sleep(800);
  step('herdr까지 끄기를 취소하면 그대로다', herdrRunning() && (await healthy()) && (await windows()) === 1);
  await app.evaluate(() => { global.__mtTrayConfirm = (q) => { global.__mtTrayAsked = q; return true; }; });
  await run('herdr-stop'); await sleep(300); await idle();
  const asked = await app.evaluate(() => global.__mtTrayAsked || null);
  await until(async () => !herdrRunning(), 15000).catch(() => {});
  step('herdr까지 끄기: 확인을 묻고, 창, herdr, 백엔드가 꺼진다', asked && /herdr/.test(asked.message) && !herdrRunning() && !(await healthy()) && (await windows()) === 0, { asked: asked && asked.message, herdr: herdrRunning() });

  // 6. 다시 열면 백엔드와 herdr가 다시 뜬다
  const wp3 = app.waitForEvent('window');
  await run('open');
  const page3 = await wp3;
  await page3.waitForFunction(() => window.__mt && window.__mt.getState().boardLoaded, null, { timeout: 90000 });
  await until(() => herdrRunning(), 30000).catch(() => {});
  step('다시 열면 백엔드와 herdr가 다시 뜬다', (await healthy()) && herdrRunning());

  // 7. 백엔드도 끄고 끝내기
  await run('quit-all');
  await until(() => { exited = !alive(mainPid); return exited; }, 30000).catch(() => {});
  const h7 = await until(async () => !(await healthy()), 15000).then(() => false, () => true);
  step('백엔드도 끄고 끝내기: 앱이 끝나고 백엔드가 꺼진다', exited && !h7, { exited, backendUp: h7 });
} catch (e) {
  step('시험 중 오류', false, e.message);
} finally {
  if (!exited) await Promise.race([app.close().catch(() => {}), sleep(8000)]);
  try { if (await healthy()) atrium('backend', 'stop'); } catch {}
  try { execFileSync('herdr', ['--session', ENV.ATRIUM_HERDR_SESSION, 'server', 'stop'], { encoding: 'utf8' }); } catch {}
}
fs.writeFileSync(path.join(OUT, 'p14-tray.json'), JSON.stringify(results, null, 2));
log(`결과 ${results.filter((r) => r.ok).length}/${results.length}`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
