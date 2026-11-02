// P6b 창 시험: I7 트레이 상주. 따로 띄운 개발용 판(atrium-dev-p6b, 47814, backend/.dev/data, 창 프로필 backend/.dev/app)으로만 띄운다.
// A. 설정을 켜면 창을 닫아도 앱이 트레이에 남고, 내 차례가 되면 main이 알림을 띄우고, 누르면 창을 다시 열고 그 노드로 간다. 끄면 창을 닫을 때 앱이 끝난다.
// B. 트레이로 남은 동안 설정을 끄면 앱이 끝난다.
// 세션 s3(haiku)이 판에 있어야 한다(experiments/p6b/live-2-loops.mjs가 만든다). 결과: experiments/p6b/(MT_E2E_OUT=p6b)
// P6c 회귀: MT_E2E_BOARD=p6c MT_E2E_OUT=p6c/regress로 P6c 판(atrium-dev-p6c, 47815)에서 돌린다
const P6C = process.env.MT_E2E_BOARD === 'p6c';
if (!P6C || !process.env.MT_E2E_OUT) process.env.MT_E2E_OUT = 'p6b';
const path = await import('node:path');
const { execFileSync } = await import('node:child_process');
const { launch, logger, shot, sleep, until, closeApp, REPO } = await import('./harness.mjs');

const DEV = path.join(REPO, 'backend', '.dev');
const ENV = { ATRIUM_HERDR_SESSION: P6C ? 'atrium-dev-p6c' : 'atrium-dev-p6b', ATRIUM_PORT: P6C ? '47815' : '47814', ATRIUM_DATA_DIR: path.join(DEV, 'data'), ATRIUM_APP_USERDATA: path.join(DEV, 'app') };
if ((process.env.ATRIUM_HERDR_SESSION ?? process.env.MTASK_HERDR_SESSION) && (process.env.ATRIUM_HERDR_SESSION ?? process.env.MTASK_HERDR_SESSION) !== ENV.ATRIUM_HERDR_SESSION) throw new Error(`이 시험은 ${ENV.ATRIUM_HERDR_SESSION}에서만`);
Object.assign(process.env, ENV);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: { ...process.env, ...ENV } });
const atriumJson = (...a) => JSON.parse(atrium('--json', ...a));
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };

const log = logger('i7-tray');
const trayState = (app) => app.evaluate(() => global.__mtTray && global.__mtTray.state());
const windows = (app) => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);
const s3 = () => atriumJson('ls').find((s) => s.name === 's3');

log('=== A. 트레이 켜기 → 창 닫기 → 알림 → 누르기 → 끄기');
atrium('settings', 'set', 'tray', 'off');
let { app, page, mainPid } = await launch({ log, env: ENV });
await until(async () => (await trayState(app)).connected, 20000);
log('처음(기본 꺼짐)', await trayState(app));
log('settings set tray on', atrium('settings', 'set', 'tray', 'on').trim().replace(/\s+/g, ' '));
await until(async () => (await trayState(app)).hasTray, 10000);
log('켠 뒤', await trayState(app));
await shot(page, 'i7-1-window-with-tray-on', log);

await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
await sleep(2500);
log('창 닫은 뒤: 창 수', await windows(app), 'main 살아 있음', alive(mainPid), 'tray', await trayState(app));

// s3을 내 차례로 만든다(Write 권한 요청. 끝에 거부한다)
if (!s3()) throw new Error('s3이 없다. live-2-loops.mjs를 먼저 돌린다');
if (s3().state !== 'ready') throw new Error(`s3이 ready가 아니다: ${s3().state}`);
atrium('send', '@s3', 'Use the Write tool to create a file named p6b-tray.txt containing the word hi. Do nothing else.');
await until(() => s3().state === 'waiting', 90000);
log('s3 내 차례', s3().ask.summary);
const note = await until(async () => app.evaluate(() => { const r = global.__mtNotifications.filter((x) => x.source === 'tray').at(-1); return r ? { key: r.key, shown: r.shown, sessionId: r.sessionId, title: r.note.title, body: r.note.body } : null; }), 15000);
log('트레이 알림(창 없음)', note);
await sleep(800);
log('알림 뜸(show 이벤트)', await app.evaluate(() => global.__mtNotifications.filter((x) => x.source === 'tray').at(-1).shown));
log('트레이 메뉴', (await trayState(app)).menu, (await trayState(app)).tooltip);
await sleep(3000);
log('같은 대기에 한 번만: 트레이 알림 수', await app.evaluate(() => global.__mtNotifications.filter((x) => x.source === 'tray').length));

// 알림 누르기(알림 센터 누르기를 흉내 낸다: main의 알림 객체에 click)
const winP = app.waitForEvent('window', { timeout: 30000 });
await app.evaluate(() => global.__mtNotifications.filter((x) => x.source === 'tray').at(-1).note.emit('click'));
page = await winP;
await page.waitForFunction(() => window.__mt && window.__mt.getState().boardLoaded, null, { timeout: 60000 });
const focus = await until(async () => page.evaluate(() => { const st = window.__mt.getState(); const s = st.sessions.get(st.focusId); return s ? s.name : null; }), 20000);
log('누른 뒤: 창 수', await windows(app), '초점 노드', focus);
await sleep(800);
await shot(page, 'i7-2-reopened-at-s3', log);
log('창이 다시 열린 뒤 창의 알림 기록(같은 대기에 다시 띄우지 않음)', await page.evaluate((k) => { try { return Object.keys(JSON.parse(localStorage.getItem('mt.notified') || '{}')).includes(k); } catch (e) { return String(e); } }, note.key));

log('s3 거부', atrium('answer', 's3', 'reject').trim().replace(/\s+/g, ' '));
log('settings set tray off', atrium('settings', 'set', 'tray', 'off').trim().replace(/\s+/g, ' '));
await until(async () => !(await trayState(app)).enabled, 10000); // P14: 아이콘은 늘 있고, 상주만 꺼진다
log('끈 뒤', await trayState(app));
const exited = new Promise((r) => app.process().once('exit', (code) => r({ code })));
await page.evaluate(() => window.close());
const ex = await Promise.race([exited, sleep(10000).then(() => null)]);
log('트레이 끈 채 창 닫기: 앱 끝남', ex, 'main 살아 있음', alive(mainPid));

log('=== B. 트레이로 남은 동안 설정을 끄면 앱이 끝난다');
atrium('settings', 'set', 'tray', 'on');
({ app, page, mainPid } = await launch({ log, env: ENV }));
await until(async () => (await trayState(app)).hasTray, 20000);
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
await sleep(2000);
log('창 닫은 뒤 창 수', await windows(app), 'main 살아 있음', alive(mainPid));
const exited2 = new Promise((r) => app.process().once('exit', (code) => r({ code })));
atrium('settings', 'set', 'tray', 'off');
const ex2 = await Promise.race([exited2, sleep(10000).then(() => null)]);
log('창 없이 트레이를 끔: 앱 끝남', ex2, 'main 살아 있음', alive(mainPid));
await closeApp(app, 3000);
log('=== 끝');
process.exit(0);
