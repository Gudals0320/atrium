// P277 창 시험: 작업 표시줄 아이콘. 개발용 판 창을 띄우고 창 핸들의 속성(AUMID, 다시 띄우기 명령·아이콘)과 창 아이콘을 읽는다.
// 판: 터미널 세션 atrium-dev-p277, 포트 48027, 디버깅 포트 9508, backend/.dev/data·app. 사용: MT_E2E_OUT=p277 node test/e2e/p277-taskbar.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { _electron as electron } from 'playwright';
import { APP_ROOT, REPO, OUT, logger, closeApp } from './harness.mjs';
import { assertTestBoard } from './p9-guard.mjs';

if (process.env.MT_E2E_OUT !== 'p277') throw new Error('MT_E2E_OUT=p277를 명령줄에서 준다');
const DEV = path.join(REPO, 'backend', '.dev');
const WS = process.env.MT_E2E_DIR || path.join(path.dirname(REPO), 'mtask-p277-ws');
const ENV = {
  ATRIUM_TERMINAL_SESSION: 'atrium-dev-p277', ATRIUM_HERDR_SESSION: 'atrium-dev-p277', ATRIUM_PORT: '48027',
  ATRIUM_DATA_DIR: path.join(DEV, 'data'), ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  ATRIUM_CLAUDE_PROJECTS: path.join(WS, 'projects'), ATRIUM_CLAUDE_DESKTOP: 'none',
};
assertTestBoard(ENV, { root: DEV });
fs.mkdirSync(ENV.ATRIUM_CLAUDE_PROJECTS, { recursive: true });
const log = logger('p277-taskbar');
// 실제 판의 ATRIUM_*·HC_*와 부모 Claude Code 변수를 빼고 시험 판 값만 준다
const env = { ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(ATRIUM_|MTASK_|HC_|CLAUDECODE|CLAUDE_CODE_|CLAUDE_EFFORT|CLAUDE_PID|CLAUDE_AGENT_SDK|ELECTRON_RUN_AS_NODE)/.test(k))), ...ENV };

// 창 핸들의 속성 저장소(SHGetPropertyStoreForWindow)와 작은·큰 아이콘(WM_GETICON)을 읽는다
const PS = `param([long]$Hwnd, [string]$Out)
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
namespace P277 {
  [StructLayout(LayoutKind.Sequential)] public struct PK { public Guid f; public uint p; }
  [StructLayout(LayoutKind.Sequential)] public struct PV { public ushort vt; ushort a, b, c; public IntPtr p; IntPtr q; }
  [ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IPS { void GetCount(out uint n); void GetAt(uint i, out PK k); void GetValue(ref PK k, out PV v); void SetValue(ref PK k, ref PV v); void Commit(); }
  public static class W {
    [DllImport("shell32.dll")] static extern int SHGetPropertyStoreForWindow(IntPtr h, ref Guid iid, [MarshalAs(UnmanagedType.Interface)] out IPS ps);
    [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr h, int m, IntPtr w, IntPtr l);
    [DllImport("user32.dll")] public static extern IntPtr GetClassLongPtr(IntPtr h, int i);
    public static string Get(IntPtr h, uint pid) {
      Guid iid = new Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"); IPS ps;
      if (SHGetPropertyStoreForWindow(h, ref iid, out ps) != 0) return "(no store)";
      PK k = new PK { f = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"), p = pid }; PV v; ps.GetValue(ref k, out v);
      return v.vt == 31 ? Marshal.PtrToStringUni(v.p) : "(vt " + v.vt + ")";
    }
  }
}
'@
$h = [IntPtr]$Hwnd
foreach ($p in @(@{ n = 'AppUserModel.ID'; i = 5 }, @{ n = 'RelaunchCommand'; i = 2 }, @{ n = 'RelaunchIconResource'; i = 3 }, @{ n = 'RelaunchDisplayNameResource'; i = 4 })) { Write-Output ("prop {0}={1}" -f $p.n, [P277.W]::Get($h, $p.i)) }
foreach ($k in @(@{ n = 'small'; w = 0; cls = -34 }, @{ n = 'big'; w = 1; cls = -14 })) {
  $icon = [P277.W]::SendMessage($h, 0x7F, [IntPtr]$k.w, [IntPtr]::Zero)
  if ($icon -eq [IntPtr]::Zero) { $icon = [P277.W]::GetClassLongPtr($h, $k.cls) }
  if ($icon -eq [IntPtr]::Zero) { Write-Output "icon $($k.n): none"; continue }
  $bmp = ([System.Drawing.Icon]::FromHandle($icon)).ToBitmap(); $f = Join-Path $Out "p277-window-icon-$($k.n).png"
  $bmp.Save($f, [System.Drawing.Imaging.ImageFormat]::Png); Write-Output "icon $($k.n): $($bmp.Width)x$($bmp.Height)"
}`;
const psFile = path.join(OUT, 'p277-window-props.ps1');
fs.writeFileSync(psFile, PS);

const results = [];
const step = (name, ok, detail) => { results.push({ name, ok: !!ok, detail }); log(`${ok ? '통과' : '실패'} ${name}`, detail ?? ''); };
const app = await electron.launch({ args: ['.', '--dev', '--remote-debugging-port=9508'], cwd: APP_ROOT, env, timeout: 60000 });
try {
  const page = await app.firstWindow();
  await page.waitForFunction(() => window.__mt && window.__mt.getState().boardLoaded, null, { timeout: 90000 });
  const hwnd = await app.evaluate(({ BrowserWindow }) => { const b = BrowserWindow.getAllWindows()[0].getNativeWindowHandle(); return b.length >= 8 ? b.readBigUInt64LE(0).toString() : String(b.readUInt32LE(0)); });
  const details = await app.evaluate(() => global.__mtAppDetails);
  log('setAppDetails', details);
  const out = execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', psFile, hwnd, OUT], { encoding: 'utf8' }).trim().split(/\r?\n/);
  log('window', out);
  const prop = (n) => (out.find((l) => l.startsWith(`prop ${n}=`)) || '').slice(`prop ${n}=`.length);
  step('창 AUMID는 알림 AUMID(atrium.dev)가 아닌 atrium.dev.board다', prop('AppUserModel.ID') === 'atrium.dev.board', prop('AppUserModel.ID'));
  step('다시 띄우기 아이콘이 Atrium ico다', /app[\\/]assets[\\/]icon\.ico/i.test(prop('RelaunchIconResource')), prop('RelaunchIconResource'));
  step('다시 띄우기 명령은 이 Electron과 app 폴더(--dev)다', /electron\.exe" ".*app" --dev$/i.test(prop('RelaunchCommand')), prop('RelaunchCommand'));
  step('다시 띄우기 이름은 Atrium (dev)다', prop('RelaunchDisplayNameResource') === 'Atrium (dev)', prop('RelaunchDisplayNameResource'));
  step('창 아이콘(작은·큰)이 붙어 있다', out.some((l) => /^icon small: \d+x\d+/.test(l)) && out.some((l) => /^icon big: \d+x\d+/.test(l)));
  await page.screenshot({ path: path.join(OUT, 'p277-window.png') });
} catch (e) { step('시험 중 오류', false, String(e.stack || e).slice(0, 500)); }
finally { await closeApp(app); }
fs.writeFileSync(path.join(OUT, 'p277-taskbar.json'), JSON.stringify(results, null, 2));
const bad = results.filter((r) => !r.ok);
log(`결과 ${results.length - bad.length}/${results.length}`);
process.exit(bad.length ? 1 : 0);
