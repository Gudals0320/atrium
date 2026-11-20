// P277: 작업 표시줄 아이콘. 창은 알림(프로세스)과 다른 AUMID를 쓰고, 다시 띄우기 아이콘·명령을 Atrium 것으로 둔다
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { processAppId, windowAppId, windowAppDetails, LAUNCHER_CMD } from '../src/main/app-id.mjs';
import { LAUNCHER_CMD as BACKEND_LAUNCHER_CMD } from '../../backend/src/update.mjs';

const MAIN = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/main/main.mjs'), 'utf8');
const ICO = 'C:\\A\\app\\assets\\icon.ico';
const EXE = 'C:\\A\\app\\node_modules\\electron\\dist\\electron.exe';

test('창 AUMID는 알림 AUMID와 다르다(Electron.lnk가 알림 AUMID를 가져간다)', () => {
  for (const p of ['real', 'dev']) {
    assert.equal(processAppId('atrium', p), `atrium.${p}`);
    assert.notEqual(windowAppId('atrium', p), processAppId('atrium', p));
  }
  assert.notEqual(windowAppId('atrium', 'real'), windowAppId('atrium', 'dev'));
});

test('저장소에서 돈 창: 이 Electron과 app 폴더로 다시 띄운다, 아이콘은 Atrium ico', () => {
  const d = windowAppDetails({ appId: 'atrium', appName: 'Atrium', profile: 'dev', iconPath: ICO, appRoot: 'C:\\A\\app', execPath: EXE, exists: () => false });
  assert.equal(d.appId, 'atrium.dev.board');
  assert.equal(d.appIconPath, ICO);
  assert.equal(d.appIconIndex, 0);
  assert.equal(d.relaunchCommand, `"${EXE}" "C:\\A\\app" --dev`);
  assert.equal(d.relaunchDisplayName, 'Atrium (dev)');
  const r = windowAppDetails({ appId: 'atrium', appName: 'Atrium', profile: 'real', iconPath: ICO, appRoot: 'C:\\A\\app', execPath: EXE, exists: () => false });
  assert.equal(r.relaunchCommand, `"${EXE}" "C:\\A\\app"`);
  assert.equal(r.relaunchDisplayName, 'Atrium');
});

test('설치 폴더에서 돈 창: 설치 폴더의 실행기로 다시 띄운다(업데이트 뒤에도 맞는 버전)', () => {
  const root = path.join('C:\\inst', 'v1.0.0', 'app');
  const have = new Set([path.join('C:\\inst', 'Atrium.cmd'), path.join('C:\\inst', 'current.json')]);
  const d = windowAppDetails({ appId: 'atrium', appName: 'Atrium', profile: 'real', iconPath: ICO, appRoot: root, execPath: EXE, exists: (f) => have.has(f) });
  assert.equal(d.relaunchCommand, `"${path.join('C:\\inst', 'Atrium.cmd')}"`);
  assert.equal(LAUNCHER_CMD, BACKEND_LAUNCHER_CMD);
});

test('main: AUMID를 창보다 먼저 정하고, 창마다 setAppDetails를 부른다', () => {
  const aumid = MAIN.indexOf('app.setAppUserModelId(processAppId(');
  assert.ok(aumid > 0 && aumid < MAIN.indexOf('function createWindow'));
  assert.match(MAIN, /w\.setAppDetails\(.*windowAppDetails\(/);
  assert.equal((MAIN.match(/setAppUserModelId/g) || []).length, 1);
  assert.match(MAIN, /dialog\.showMessageBox\(parent, opts\)/);
});
