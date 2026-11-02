// P11 창 시험(완료 기준 4): 네트워크를 끊고(Electron 네트워크 흉내 offline) 창을 다시 읽어도 글꼴 넷이 앱 안 파일에서 나온다.
// 사용: node experiments/p11/tools/e2e.cjs p11-offline.mjs
import path from 'node:path';
import { launch, closeApp, logger, sleep, writeJson, OUT } from './p10-lib.mjs';

const log = logger('p11-offline');
const { app, page } = await launch({ log });
const result = {};
try {
  await app.evaluate(async ({ session, BrowserWindow }) => {
    session.defaultSession.enableNetworkEmulation({ offline: true });
    BrowserWindow.getAllWindows()[0].webContents.session.enableNetworkEmulation({ offline: true });
  });
  await page.reload();
  await page.waitForFunction(() => window.__mt && window.__mt.getState().boardLoaded, null, { timeout: 90000 });
  await sleep(2500);
  Object.assign(result, await page.evaluate(async () => {
    const online = await fetch('https://fonts.googleapis.com/css2?family=Geist').then(() => 'reached', (e) => `blocked: ${e.message}`);
    const fonts = [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family);
    const files = performance.getEntriesByType('resource').map((e) => e.name).filter((n) => /\.woff2?($|\?)/.test(n));
    const sample = {
      ui: getComputedStyle(document.querySelector('.mt-cp') || document.body).fontFamily,
      check: ['13px "Geist Variable"', '13px "Pretendard Variable"', '14px "JetBrains Mono Variable"', '14px "Nanum Gothic Coding"'].map((f) => `${f}: ${document.fonts.check(f, f.includes('Pretendard') || f.includes('Nanum') ? '가' : 'A')}`),
    };
    return { online, fonts: [...new Set(fonts)], fontFiles: files.length, external: files.filter((n) => !n.startsWith('file:')), firstFiles: files.slice(0, 4), sample };
  }));
  await page.screenshot({ path: path.join(OUT, 'p11-offline.png') });
  log('결과', result);
} finally { await closeApp(app); }
writeJson('p11-offline.json', result);
process.exit(0);
