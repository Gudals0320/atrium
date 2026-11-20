// P277: Windows 작업 표시줄의 앱 정체(AppUserModelID)와 창의 다시 띄우기 정보.
// Electron 45는 알림을 처음 띄울 때 시작 메뉴에 "<exe 제품 이름>.lnk"(우리는 Electron.lnk)를 만들고, 거기에 프로세스 AUMID를 적는다
// (shell/browser/notifications/win/windows_toast_activator.cc EnsureShortcut). 아이콘은 적지 않아 electron.exe 아이콘이 된다.
// Windows는 작업 표시줄 단추의 아이콘을 그 AUMID를 가진 시작 메뉴 바로 가기에서 찾으므로, 실제 판과 개발용 판이 번갈아
// 그 바로 가기를 고쳐 쓰는 동안 마지막에 알림을 띄운 판의 창이 Electron 아이콘으로 보였다.
// 그래서 창에는 프로세스(알림)와 다른 AUMID를 준다. 이 AUMID를 가진 바로 가기는 없으므로 작업 표시줄은 창 아이콘과
// 창의 다시 띄우기 아이콘(System.AppUserModel.RelaunchIconResource)을 쓴다. 고정해도 Atrium 아이콘과 실행기로 고정된다.
import fs from 'node:fs';
import path from 'node:path';

// 알림(프로세스)의 AUMID. Electron이 Electron.lnk에 적는 값이다
export const processAppId = (appId, profile) => `${appId}.${profile}`;
// 창(작업 표시줄 단추)의 AUMID. 어떤 바로 가기도 이 값을 갖지 않는다
export const windowAppId = (appId, profile) => `${appId}.${profile}.board`;

// 설치 폴더(<dir>\<태그>\app)에서 돌면 설치 폴더의 실행기(backend/src/update.mjs LAUNCHER_CMD)로 다시 띄운다(업데이트 뒤에도 맞는 버전).
// 아니면(저장소에서 돈 창) 이 Electron과 이 app 폴더로 다시 띄운다
export const LAUNCHER_CMD = 'Atrium.cmd';
export function windowAppDetails({ appId, appName, profile, iconPath, appRoot, execPath, exists = fs.existsSync }) {
  const dir = path.resolve(appRoot, '..', '..');
  const launcher = path.join(dir, LAUNCHER_CMD);
  const installed = exists(launcher) && exists(path.join(dir, 'current.json'));
  const relaunchCommand = installed ? `"${launcher}"` : `"${execPath}" "${appRoot}"${profile === 'dev' ? ' --dev' : ''}`;
  return {
    appId: windowAppId(appId, profile),
    appIconPath: iconPath, appIconIndex: 0,
    // 둘은 함께 있어야 쓰인다(Electron setAppDetails)
    relaunchCommand, relaunchDisplayName: profile === 'real' ? appName : `${appName} (${profile})`,
  };
}
