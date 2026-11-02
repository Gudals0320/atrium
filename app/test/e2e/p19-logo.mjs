// P19 창 시험: Atrium 로고. 창 아이콘(WM_GETICON으로 저장), 트레이(평소 로고 → 내 차례면 주황 점 → 돌아옴), 바로가기 아이콘.
// 판: herdr 세션 atrium-dev-p19, 포트 47835, backend/.dev/p19. 시험 폴더는 새로 만든 C:\Workspace\mtask-p19-ws\demo 하나, 시험 claude는 haiku.
// 내 차례는 claude에게 AskUserQuestion으로 묻게 해서 만든다(권한 manual). 사용: MT_E2E_OUT=p19 node test/e2e/p19-logo.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { _electron as electron } from 'playwright';
import { APP_ROOT, REPO, OUT, sleep, until, logger, closeApp } from './harness.mjs';
import { assertTestBoard } from './p9-guard.mjs';

if (process.env.MT_E2E_OUT !== 'p19') throw new Error('MT_E2E_OUT=p19를 명령줄에서 준다');
const DEV = path.join(REPO, 'backend', '.dev', 'p19');
const DIR = 'C:\\Workspace\\mtask-p19-ws\\demo';
const PROJECT = path.join(os.homedir(), '.claude', 'projects', DIR.replace(/[^A-Za-z0-9]/g, '-'));
const ENV = {
  ATRIUM_HERDR_SESSION: 'atrium-dev-p19', ATRIUM_PORT: '47835',
  ATRIUM_DATA_DIR: path.join(DEV, 'data'), ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  ATRIUM_CLAUDE_PROJECTS: PROJECT, ATRIUM_CLAUDE_DESKTOP: 'none',
};
assertTestBoard(ENV, { root: DEV });
fs.mkdirSync(DIR, { recursive: true });

const log = logger('p19-logo');
const env = { ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(CLAUDECODE|CLAUDE_CODE_|CLAUDE_EFFORT|CLAUDE_PID|CLAUDE_AGENT_SDK|ELECTRON_RUN_AS_NODE)/.test(k))), ...ENV };
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env });
const ps = (file, ...a) => execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', file, ...a], { encoding: 'utf8' }).trim();
const results = [];
const step = (name, ok, detail) => { results.push({ name, ok: !!ok, detail }); log(`${ok ? '통과' : '실패'} ${name}`, detail ?? ''); };

const app = await electron.launch({ args: ['.', '--dev'], cwd: APP_ROOT, env, timeout: 60000 });
const tray = () => app.evaluate(() => global.__mtTray.state());
const saveTray = async (kind) => { for (const sf of [1, 2]) { const b64 = await app.evaluate((_e, [k, s]) => global.__mtTray.iconPng(k, s), [kind, sf]); if (b64) fs.writeFileSync(path.join(OUT, `p19-tray-${kind}@${sf}x.png`), Buffer.from(b64, 'base64')); } };
try {
  const page = await app.firstWindow();
  await page.waitForFunction(() => window.__mt && window.__mt.getState().boardLoaded, null, { timeout: 90000 });

  // 1. 창 아이콘: 창 핸들의 아이콘을 저장해 본다
  const hwnd = await app.evaluate(({ BrowserWindow }) => { const b = BrowserWindow.getAllWindows()[0].getNativeWindowHandle(); return b.length >= 8 ? b.readBigUInt64LE(0).toString() : String(b.readUInt32LE(0)); });
  const wi = ps(path.join(REPO, 'experiments', 'p19', 'tools', 'window-icon.ps1'), hwnd, OUT);
  step('창 아이콘이 붙어 있다(작은·큰 아이콘을 저장)', /small: \d+x\d+/.test(wi) && /big: \d+x\d+/.test(wi), wi.split(/\r?\n/));

  // 2. 트레이: 평소 로고
  await until(async () => (await tray()).connected, 20000);
  const t0 = await tray();
  step('트레이는 평소 로고다', t0.hasTray && t0.icon === 'idle', { icon: t0.icon });
  await saveTray('idle'); await saveTray('turn');

  // 3. 내 차례가 되면 주황 점 로고, 끝나면 돌아온다
  await page.evaluate((d) => window.__mt.api.call('workspace.open', { path: d }), DIR);
  atrium('spawn', DIR, '--name', 'c1', '--model', 'haiku');
  // 첫 지시는 준비된 뒤 명령 바와 같은 길(send --wait)로 보낸다(spawn --prompt는 막 준비된 입력칸에 글만 남는 때가 있었다)
  await until(() => page.evaluate(() => [...window.__mt.getState().sessions.values()].some((s) => s.name === 'c1' && s.state === 'ready')), 90000);
  await sleep(1500);
  log('send', atrium('send', '@c1', 'Use the AskUserQuestion tool to ask me one question: Continue? with the options Yes and No. Do nothing else.', '--wait').trim().replace(/\s+/g, ' ').slice(0, 200));
  const turn = await until(async () => { const t = await tray(); return t.icon === 'turn' ? t : null; }, 150000).catch(() => null);
  step('내 차례가 되면 트레이가 주황 점 로고로 바뀐다', turn, turn ? { icon: turn.icon, needsYou: turn.needsYou, tooltip: turn.tooltip } : await tray());
  atrium('answer', 'c1', '1');
  const back = await until(async () => { const t = await tray(); return t.icon === 'idle' ? t : null; }, 60000).catch(() => null);
  step('차례가 끝나면 평소 로고로 돌아온다', back, back ? { icon: back.icon, needsYou: back.needsYou } : await tray());

  // 4. 바로가기: 시험 폴더에 만든 바로가기의 아이콘이 새 로고(app\assets\icon.ico)
  const lnkDir = path.join(DEV, 'shortcut');
  fs.mkdirSync(lnkDir, { recursive: true });
  const lnk = ps(path.join(APP_ROOT, 'scripts', 'make-shortcut.ps1'), '-Dest', lnkDir);
  const iconLoc = execFileSync('powershell.exe', ['-NoProfile', '-Command', `(New-Object -ComObject WScript.Shell).CreateShortcut('${lnk}').IconLocation`], { encoding: 'utf8' }).trim();
  step('바로가기 아이콘이 app\\assets\\icon.ico', path.resolve(iconLoc.replace(/,\d+$/, '')).toLowerCase() === path.join(APP_ROOT, 'assets', 'icon.ico').toLowerCase(), { lnk, iconLoc });
} catch (e) {
  step('시험 중 오류', false, e.message);
} finally {
  try { atrium('kill', 'c1', '--yes', '--delete'); } catch {}
  await closeApp(app);
}
fs.writeFileSync(path.join(OUT, 'p19-logo.json'), JSON.stringify(results, null, 2));
log(`결과 ${results.filter((r) => r.ok).length}/${results.length}`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
