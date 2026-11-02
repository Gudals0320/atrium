// P18 창 시험: 이름 옮기기(multitask → Atrium). 시험 이름으로 옛 판을 만들고, 새 코드를 실제 판 프로필 경로로 띄워 같은 옮기기를 돈다.
// 옛 판: P18 전 코드(main f82d36e를 backend/.dev/p18/oldcode에 풀어 둔 것)의 백엔드, herdr 세션 atrium-dev-p18-old, 포트 47834, backend/.dev/p18/old.
//        판이 띄운 claude(haiku) 둘(c1, c2)과 셸 하나(sh1), 노드 자리, 덩어리, 그룹, 메모, 한 줄 메모, 보관한 닫힌 세션(sh2), 창 프로필(backend/.dev/p18/oldapp).
// 새 판: 같은 포트 47834(실제처럼 옛 백엔드가 포트를 쥐고 있다), herdr 세션 atrium-dev-p18-new, backend/.dev/p18/new, 창 프로필 backend/.dev/p18/newapp.
//        ATRIUM_LEGACY_*로 옛 판을 가리킨다. 옛 백엔드는 떠 있는 채로 둔다(새 백엔드가 끄는지 본다).
// 실제 판(multitask, atrium, 47800)과 다른 판은 건드리지 않는다(assertLegacyTestBoard). 시험 폴더는 새로 만든 C:\Workspace\mtask-p18-ws\demo 하나.
// 사용: MT_E2E_OUT=p18 node test/e2e/p18-migrate.mjs   (정리는 p18-clean.mjs)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { _electron as electron } from 'playwright';
import { APP_ROOT, REPO, OUT, sleep, until, shot, logger, closeApp } from './harness.mjs';
import { assertTestBoard, assertLegacyTestBoard } from './p9-guard.mjs';
import { loadConfig } from '../../../backend/src/config.mjs';

if (process.env.MT_E2E_OUT !== 'p18') throw new Error('MT_E2E_OUT=p18을 명령줄에서 준다');
export const DEV = path.join(REPO, 'backend', '.dev', 'p18');
export const DIR = 'C:\\Workspace\\mtask-p18-ws\\demo';
const PROJECT = path.join(os.homedir(), '.claude', 'projects', DIR.replace(/[^A-Za-z0-9]/g, '-'));
const OLD_CLI = path.join(DEV, 'oldcode', 'backend', 'bin', 'mtask.mjs');
const PORT = '47834';
const COMMON = { CLAUDE_PROJECTS: PROJECT, CLAUDE_DESKTOP: 'none' };
// 옛 코드는 MTASK_*만 읽는다
const OLD_ENV = { MTASK_HERDR_SESSION: 'atrium-dev-p18-old', MTASK_PORT: PORT, MTASK_DATA_DIR: path.join(DEV, 'old'), MTASK_CLAUDE_PROJECTS: PROJECT, MTASK_CLAUDE_DESKTOP: 'none' };
// 옛 판에 붙는 창(새 코드, 옛 창 프로필을 만든다). 판 값을 덮었고 옛 판 값이 없으니 옮기지 않는다
const OLDWIN_ENV = { ATRIUM_HERDR_SESSION: 'atrium-dev-p18-old', ATRIUM_PORT: PORT, ATRIUM_DATA_DIR: path.join(DEV, 'old'), ATRIUM_APP_USERDATA: path.join(DEV, 'oldapp'), ...Object.fromEntries(Object.entries(COMMON).map(([k, v]) => [`ATRIUM_${k}`, v])) };
export const NEW_ENV = {
  ATRIUM_HERDR_SESSION: 'atrium-dev-p18-new', ATRIUM_PORT: PORT, ATRIUM_DATA_DIR: path.join(DEV, 'new'), ATRIUM_APP_USERDATA: path.join(DEV, 'newapp'),
  ATRIUM_LEGACY_HERDR_SESSION: 'atrium-dev-p18-old', ATRIUM_LEGACY_DATA_DIR: path.join(DEV, 'old'), ATRIUM_LEGACY_APP_USERDATA: path.join(DEV, 'oldapp'),
  ...Object.fromEntries(Object.entries(COMMON).map(([k, v]) => [`ATRIUM_${k}`, v])),
};
assertTestBoard(OLDWIN_ENV, { root: DEV });
assertLegacyTestBoard(NEW_ENV, { root: DEV });
for (const d of [path.join(DEV, 'old'), path.join(DEV, 'new'), path.join(DEV, 'oldapp'), path.join(DEV, 'newapp')]) if (fs.existsSync(d)) throw new Error(`시험 판이 남아 있다: ${d}. p18-clean.mjs를 먼저 돌린다`);
if (!fs.existsSync(OLD_CLI)) throw new Error(`옛 코드가 없다: ${OLD_CLI}`);
fs.mkdirSync(DIR, { recursive: true });

const log = logger('p18-migrate');
const HERDR = loadConfig({ argv: ['--dev'], env: {} }).herdrPath;
const base = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(CLAUDECODE|CLAUDE_CODE_|CLAUDE_EFFORT|CLAUDE_PID|CLAUDE_AGENT_SDK|ELECTRON_RUN_AS_NODE|MTASK_|ATRIUM_)/.test(k)));
const run = (cli, env, args) => execFileSync(process.execPath, [cli, ...args], { encoding: 'utf8', env: { ...base(), ...env }, timeout: 180000 });
const old = (...a) => run(OLD_CLI, OLD_ENV, a);
const oldJson = (...a) => JSON.parse(old('--json', ...a));
const atrium = (...a) => run(path.join(REPO, 'backend', 'bin', 'atrium.mjs'), NEW_ENV, a);
const atriumJson = (...a) => JSON.parse(atrium('--json', ...a));
const herdrSessions = () => JSON.parse(execFileSync(HERDR, ['session', 'list', '--json'], { encoding: 'utf8' })).sessions.map((s) => ({ name: s.name, running: s.running }));
const results = [];
const step = (name, ok, detail) => { results.push({ name, ok: !!ok, detail }); log(`${ok ? '통과' : '실패'} ${name}`, detail ?? ''); };
const winTitle = (app) => app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; return w ? w.getTitle() : null; });
const call = (page, m, p = {}) => page.evaluate(([mm, pp]) => window.__mt.api.call(mm, pp), [m, p]);
const pick = (b) => ({
  nodes: Object.fromEntries(b.nodes.map((n) => [n.session_id, [n.x, n.y, n.w, n.h]])),
  groups: b.groups.map((g) => ({ name: g.name, members: (g.members || g.sessionIds || []).length, rect: [g.x, g.y, g.w, g.h] })),
  docks: b.docks.map((d) => ({ dir: d.dir, members: d.members })),
  memos: (b.memos || []).map((m) => ({ body: m.body, rect: [m.x, m.y, m.w, m.h] })),
});

try {
  // ---------- 1. 옛 판 ----------
  log('옛 판 만들기');
  log(old('backend', 'start').trim());
  log('신뢰 예상', old('trust', DIR).trim());
  old('spawn', DIR, '--name', 'c1', '--model', 'haiku', '--prompt', 'Reply with the single word ONE.');
  old('spawn', DIR, '--name', 'c2', '--model', 'haiku', '--prompt', 'Reply with the single word TWO.');
  old('spawn', DIR, '--name', 'sh1', '--kind', 'shell');
  old('spawn', DIR, '--name', 'sh2', '--kind', 'shell');
  await until(() => { const ls = oldJson('ls'); const s = (n) => ls.find((x) => x.name === n); return ['c1', 'c2'].every((n) => s(n) && s(n).state === 'ready' && s(n).lastAnswer); }, 150000, 2000);
  const oldLs = oldJson('ls');
  const ids = Object.fromEntries(oldLs.map((s) => [s.name, s.sessionId]));
  log('옛 세션', oldLs.map((s) => ({ name: s.name, id: s.sessionId, state: s.state, pane: s.paneId, answer: s.lastAnswer })));
  // 자리, 덩어리, 그룹, 메모, 한 줄 메모, 보관
  const oc = await oldCall();
  await oc.call('board.setNode', { session: 'c1', x: 100, y: 120, w: 720, h: 460, cause: 'p18-test' });
  log('dock', old('dock', 'c2', 'c1', '--side', 'right').trim());
  log('group', old('group', 'pick', 'c1', 'sh1', '--name', 'g18').trim());
  log('memo', old('memo', 'add', 'P18 메모: 옮겨도 남는다', '--x', '-600', '--y', '100', '--w', '320', '--h', '160').trim());
  log('note', old('note', 'c1', 'P18 한 줄 메모').trim());
  old('kill', 'sh2', '--yes');
  log('dismiss', old('dismiss', 'sh2').trim());
  const beforeBoard = await oc.call('board.get', {});
  const beforeNotes = await oc.call('note.list', { session: 'c1' }).catch(() => null);
  oc.close();
  const before = pick(beforeBoard);
  log('옛 판 배치', before);
  const archivedBefore = oldJson('archived');
  log('보관함', archivedBefore);

  // 옛 창 프로필: 옛 판에 붙는 창. 사이드바를 열고 demo 워크스페이스를 접는다
  {
    const app = await electron.launch({ args: ['.'], cwd: APP_ROOT, env: { ...base(), ...OLDWIN_ENV }, timeout: 60000 });
    const page = await app.firstWindow();
    await until(() => page.evaluate(() => !!(window.__mt && window.__mt.getState().boardLoaded)), 60000);
    await sleep(1500);
    if (!(await page.evaluate(() => JSON.parse(localStorage.getItem('mt.sidebar') || '{}').open))) await page.click('[data-action="sidebar"]');
    await sleep(500);
    await page.click('.mt-sb-ws[data-name="demo"] [data-action="fold"]');
    await sleep(500);
    const ls = await page.evaluate(() => localStorage.getItem('mt.sidebar'));
    log('옛 창 localStorage mt.sidebar', ls);
    globalThis.oldSidebar = JSON.parse(ls);
    log('옛 창 제목', await winTitle(app));
    await shot(page, 'p18-1-old-board', log);
    await closeApp(app);
    await sleep(1500);
  }
  step('옛 판을 만들었다(claude 둘, 셸 하나, 자리, 덩어리, 그룹, 메모, 보관)', ids.c1 && ids.c2 && ids.sh1 && before.docks.length && before.groups.length && before.memos.length && archivedBefore && JSON.stringify(archivedBefore).includes('sh2'), { ids });
  const oldBackend = JSON.parse(fs.readFileSync(path.join(DEV, 'old', 'backend.json'), 'utf8'));
  step('옛 백엔드와 옛 herdr가 떠 있다', herdrSessions().some((s) => s.name === 'atrium-dev-p18-old' && s.running), { oldBackendPid: oldBackend.pid, herdr: herdrSessions().filter((s) => s.name.startsWith('atrium-dev-p18')) });

  // ---------- 2. 새 코드를 실제 판 프로필 경로로 ----------
  const t0 = Date.now();
  let app = await electron.launch({ args: ['.'], cwd: APP_ROOT, env: { ...base(), ...NEW_ENV }, timeout: 90000 });
  let page = await app.firstWindow();
  page.on('pageerror', (e) => log(`[pageerror] ${e.message}`));
  await until(() => page.evaluate(() => !!(window.__mt && window.__mt.getState().boardLoaded)), 120000);
  log('새 창이 판을 읽었다', `${((Date.now() - t0) / 1000).toFixed(1)}초`);
  const back = (await until(async () => { const ls = atriumJson('ls'); const s = (n) => ls.find((x) => x.name === n); return ['c1', 'c2'].every((n) => s(n) && s(n).state === 'ready' && s(n).paneId && !s(n).paneId.startsWith('legacy:')) && s('sh1') && !s('sh1').paneId.startsWith('legacy:') ? ls : null; }, 180000, 2000));
  log('되살린 세션', back.map((s) => ({ name: s.name, id: s.sessionId, state: s.state, pane: s.paneId })));
  step('옛 백엔드가 꺼졌다', !alive(oldBackend.pid), { pid: oldBackend.pid });
  step('claude 둘이 같은 대화 ID로 새 herdr에서 이어 간다', ['c1', 'c2'].every((n) => back.find((s) => s.name === n).sessionId === ids[n]), back.map((s) => [s.name, s.sessionId]));
  step('셸도 새 패널로 돌아왔다', back.find((s) => s.name === 'sh1').sessionId === ids.sh1);
  const ev = await until(() => { const e = atriumJson('events', '--limit', '400'); return e.find((x) => x.kind === 'rename_herdr_migrated') ? e : null; }, 120000, 2000);
  const mig = ev.find((x) => x.kind === 'rename_migrated');
  const herdrMig = ev.find((x) => x.kind === 'rename_herdr_migrated');
  log('rename_migrated', mig && mig.data); log('rename_herdr_migrated', herdrMig && herdrMig.data);
  log('되살리기 이벤트', ev.filter((x) => /recover|resume_registered|pane_changed/.test(x.kind)).map((x) => [x.kind, x.sessionId && Object.entries(ids).find(([, v]) => v === x.sessionId)?.[0], x.data && (x.data.plan || x.data.why)]));
  step('옛 herdr 세션이 없어졌다', !herdrSessions().some((s) => s.name === 'atrium-dev-p18-old') && herdrMig.data.deleted && herdrMig.data.deleted.deleted, herdrSessions().filter((s) => s.name.startsWith('atrium-dev-p18')));
  step('옛 판 폴더는 표시 파일만 남고 새 백엔드를 가리킨다', fs.existsSync(path.join(DEV, 'old', 'MOVED-TO-ATRIUM.json')) && !fs.existsSync(path.join(DEV, 'old', 'board.db')) && JSON.parse(fs.readFileSync(path.join(DEV, 'old', 'backend.json'), 'utf8')).pid === JSON.parse(fs.readFileSync(path.join(DEV, 'new', 'backend.json'), 'utf8')).pid, fs.readdirSync(path.join(DEV, 'old')));
  // 기록
  const afterBoard = await call(page, 'board.get', {});
  const after = pick(afterBoard);
  log('새 판 배치', after);
  step('노드 자리, 덩어리, 그룹, 메모가 그대로', JSON.stringify(after) === JSON.stringify(before), { before, after });
  const afterNotes = await call(page, 'note.list', { session: 'c1' }).catch(() => null);
  step('한 줄 메모가 그대로', JSON.stringify(afterNotes) === JSON.stringify(beforeNotes), afterNotes);
  const archivedAfter = atriumJson('archived');
  step('보관이 그대로', JSON.stringify(archivedAfter) === JSON.stringify(archivedBefore));
  const c1 = atriumJson('get', 'c1');
  step('세션 설정 파일과 이어 가기 인자가 새 폴더를 가리킨다', c1.settingsPath.toLowerCase().includes('/p18/new/sessions/') && c1.resumeArgv.join(' ').includes('/p18/new/plugin/atrium-herdr') && !c1.resumeArgv.join(' ').includes('/p18/old/'), { settingsPath: c1.settingsPath, resumeArgv: c1.resumeArgv });
  const settings = JSON.parse(fs.readFileSync(c1.settingsPath, 'utf8'));
  step('세션 설정 파일의 env가 ATRIUM_*이고 새 폴더', settings.env.ATRIUM_DATA_DIR === path.join(DEV, 'new') && !Object.keys(settings.env).some((k) => k.startsWith('MTASK_')), settings.env && Object.keys(settings.env));
  // 대화가 이어지는가: 새 지시를 보내고 같은 대화 기록에 남는지
  log('send', atrium('send', '@c1', 'Reply with the single word THREE.', '--wait').trim());
  await until(() => /THREE/.test(atriumJson('get', 'c1').lastAnswer || ''), 120000, 2000);
  const tx = fs.readFileSync(path.join(PROJECT, `${ids.c1}.jsonl`), 'utf8');
  step('c1이 같은 대화로 이어 갔다(대화 기록 하나에 ONE과 THREE)', /ONE/.test(tx) && /THREE/.test(tx));
  // 창 프로필
  const ls = await page.evaluate(() => localStorage.getItem('mt.sidebar'));
  step('창 프로필: 사이드바 열림과 워크스페이스 접힘이 남았다', JSON.stringify(JSON.parse(ls)) === JSON.stringify(globalThis.oldSidebar), { old: globalThis.oldSidebar, now: ls });
  const appMig = await app.evaluate(() => global.__mtAppMigration);
  log('창 프로필 옮기기', appMig);
  const bounds = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds());
  log('창 크기(앱이 저장하지 않는다. 늘 1600×960으로 연다)', bounds);
  // 이름이 보이는 곳
  const title = await winTitle(app);
  const tray = await app.evaluate(() => global.__mtTray.state());
  step('창 제목과 트레이에 Atrium, multitask 없음', title === 'Atrium' && /^Atrium/.test(tray.tooltip) && !/multitask/i.test(`${title} ${tray.tooltip} ${(tray.menu || []).join(' ')}`), { title, tooltip: tray.tooltip, menu: tray.menu, migration: tray.migration });
  const note = await page.evaluate(() => window.mt.notify({ body: 'P18 알림 제목 확인', sessionId: null, key: 'p18' }));
  const noteTitle = await app.evaluate(() => { const n = global.__mtNotifications[global.__mtNotifications.length - 1]; return n && n.note && n.note.title; });
  step('알림 제목이 Atrium', noteTitle === 'Atrium', { note, noteTitle });
  await shot(page, 'p18-2-new-board', log);
  await page.click('[data-action="settings-open"]');
  await sleep(800);
  await shot(page, 'p18-3-settings', log);
  const text = await page.evaluate(() => document.body.innerText);
  step('창 글(판, 설정 화면)에 multitask가 없다', !/multitask/i.test(text), (text.match(/.{0,30}multitask.{0,30}/gi) || []).slice(0, 5));
  const plugin = fs.readFileSync(path.join(DEV, 'new', 'plugin', 'board-system-prompt.md'), 'utf8') + fs.readFileSync(path.join(DEV, 'new', 'plugin', 'atrium-herdr', 'skills', 'delegate', 'SKILL.md'), 'utf8');
  step('판 안내 글(짧은 안내, 일 맡기기 스킬)에 multitask가 없다', !/multitask/i.test(plugin) && /\[Atrium 판\]/.test(plugin), plugin.split('\n').slice(0, 6));
  // CLI 둘
  const st1 = atriumJson('status'), st2 = JSON.parse(run(path.join(REPO, 'backend', 'bin', 'mtask.mjs'), NEW_ENV, ['--json', 'status']));
  step('atrium CLI와 mtask 별칭이 같은 판에 붙는다', st1.pid === st2.pid && st1.pid > 0, { atrium: st1.pid, mtask: st2.pid });

  // ---------- 3. 다시 켜도 두 번 옮기지 않는다 ----------
  await closeApp(app);
  log('backend stop', atrium('backend', 'stop').trim());
  app = await electron.launch({ args: ['.'], cwd: APP_ROOT, env: { ...base(), ...NEW_ENV }, timeout: 90000 });
  page = await app.firstWindow();
  await until(() => page.evaluate(() => !!(window.__mt && window.__mt.getState().boardLoaded)), 120000);
  await until(() => { const ls2 = atriumJson('ls'); return ['c1', 'c2'].every((n) => (ls2.find((x) => x.name === n) || {}).state === 'ready') ? ls2 : null; }, 60000, 2000);
  const ev2 = atriumJson('events', '--limit', '800');
  const status = atriumJson('backend', 'status');
  const nMig = ev2.filter((x) => x.kind === 'rename_migrated').length, nHerdr = ev2.filter((x) => x.kind === 'rename_herdr_migrated').length;
  step('다시 켜도 두 번 옮기지 않는다', nMig === 1 && nHerdr === 1 && JSON.stringify(atriumJson('ls').map((s) => s.sessionId).sort()) === JSON.stringify(back.map((s) => s.sessionId).sort()), { nMig, nHerdr, migration: status.migration });
  const after2 = pick(await call(page, 'board.get', {}));
  step('다시 켠 뒤에도 배치가 그대로', JSON.stringify(after2) === JSON.stringify(before));
  await shot(page, 'p18-4-restarted', log);
  await closeApp(app);
} catch (e) {
  log('오류', e.stack);
  step('시험이 끝까지 돌았다', false, e.message);
}
fs.writeFileSync(path.join(OUT, 'p18-migrate.json'), JSON.stringify(results, null, 2));
log(`결과: ${results.filter((r) => r.ok).length}/${results.length} 통과`);
process.exit(results.every((r) => r.ok) ? 0 : 1);

function alive(pid) { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } }
async function oldCall() {
  const { ApiClient } = await import('../../../backend/src/client.mjs');
  const info = JSON.parse(fs.readFileSync(path.join(DEV, 'old', 'backend.json'), 'utf8'));
  const c = new ApiClient(info); await c.open(); return c;
}
