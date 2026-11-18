// P212 창 시험: 위 바의 폴더(묶음) 칩이 폴더 이름만 보인다(고치기 전·뒤 그림).
// 판: 터미널 세션 atrium-dev-p212, 포트 47986, 이 워크트리의 backend/.dev(data, app). 창의 원격 디버깅 포트 9466.
// P212_STAGE
//   shot: backend/.dev/dist-<P212_DIST>(before|after)를 app/dist로 바꿔 끼우고 위 왼쪽 묶음을 찍는다(ko).
//     장면: C:\Workspace\mtask-p212\ 아래 새 폴더를 빈 프로젝트로 연다. 저절로 만든 폴더 묶음 proj(proj\web, proj\web\collector-long-name, proj\api, 뿌리에 README.md).
//     지금 워크스페이스는 묶음 안의 collector-long-name. 세션 수는 창 안에서 흉내 낸다(session.updated).
//   clean: 판 멈추기, 시험 폴더 지우기.
// 결과는 experiments/p212/(git 밖). 실행(워크트리 루트): P212_STAGE=shot P212_DIST=before node app/test/e2e/p212-topbar.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const STAGE = process.env.P212_STAGE || 'shot';
const DIST = process.env.P212_DIST || 'after';
if (!['shot', 'clean'].includes(STAGE) || !['before', 'after'].includes(DIST)) throw new Error('P212_STAGE=shot|clean, P212_DIST=before|after');
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const DEV = path.join(REPO, 'backend', '.dev');
const OUT = path.join(REPO, 'experiments', 'p212');
const CONVOS = path.join(OUT, 'convos');
const ROOT = 'C:\\Workspace\\mtask-p212';
const BOARD = { session: 'atrium-dev-p212', port: 47986, cdp: 9466 };
const ENV = {
  ATRIUM_TERMINAL_SESSION: BOARD.session, ATRIUM_HERDR_SESSION: BOARD.session, ATRIUM_PORT: String(BOARD.port),
  ATRIUM_DATA_DIR: path.join(DEV, 'data'), ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  ATRIUM_CLAUDE_PROJECTS: CONVOS, ATRIUM_CLAUDE_DESKTOP: 'none', MT_E2E_OUT: 'p212',
};
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_|HC_)/.test(k)) delete process.env[k]; // 실제 판의 값을 물려받지 않는다
for (const k of Object.keys(process.env)) if (/^(CLAUDECODE|CLAUDE_CODE_|CLAUDE_EFFORT|CLAUDE_PID|CLAUDE_AGENT_SDK|ELECTRON_RUN_AS_NODE)/.test(k)) delete process.env[k];
Object.assign(process.env, ENV);
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(CONVOS, { recursive: true });
const { logger, sleep, until, APP_ROOT, closeApp, launch } = await import('./harness.mjs');
const { assertTestBoard } = await import('./p9-guard.mjs');
assertTestBoard(ENV, { root: DEV });
const { pathKey } = await import(pathToFileURL(path.join(REPO, 'backend', 'src', 'workspaces.mjs')).href);

const log = logger(`p212-${STAGE}-${DIST}`);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 180000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail !== '' ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 1600)}` : ''}`); };
const rmrf = (p) => { try { fs.rmSync(p, { recursive: true, force: true }); } catch (e) { log(`지우기 실패 ${p}: ${e.message.slice(0, 120)}`); } };

if (STAGE === 'clean') {
  try { log('터미널 멈춤', atrium('terminal', 'stop', '--yes').trim().slice(0, 200)); } catch (e) { log('터미널 멈춤 실패', e.message.slice(0, 200)); }
  try { log('백엔드 멈춤', atrium('backend', 'stop').trim().slice(0, 200)); } catch (e) { log('백엔드 멈춤 실패', e.message.slice(0, 200)); }
  rmrf(ROOT);
  process.exit(0);
}

const F = {
  alpha: path.join(ROOT, 'alpha'), notes: path.join(ROOT, 'notes'),
  web: path.join(ROOT, 'proj', 'web'), collector: path.join(ROOT, 'proj', 'web', 'collector-long-name'), api: path.join(ROOT, 'proj', 'api'),
};
const COUNTS = { alpha: 1, notes: 2, web: 1, collector: 2, api: 0 };
const key = (n) => pathKey(F[n]);
for (const f of Object.values(F)) fs.mkdirSync(f, { recursive: true });
fs.writeFileSync(path.join(ROOT, 'proj', 'README.md'), '# p212 test project root\n');
const src = path.join(DEV, `dist-${DIST}`), dst = path.join(APP_ROOT, 'dist');
if (!fs.existsSync(src)) throw new Error(`빌드 없음: ${src}`);
rmrf(dst); fs.cpSync(src, dst, { recursive: true });
log(`app/dist ← backend/.dev/dist-${DIST}`);
atrium('backend', 'start');
call('settings.set', { key: 'language', value: 'ko' });
for (const n of Object.keys(F)) { atrium('ws', 'open', F[n]); await sleep(150); }
const auto = await until(() => { const r = call('workspace.list'); return (r.groups || []).find((x) => x.auto && /mtask-p212\/proj$/i.test(x.root)); }, 60000, 1500).catch(() => null);
log('저절로 만든 묶음', auto && { name: auto.name, members: auto.members });
atrium('ws', 'select', key('collector'));

const { app, page } = await launch({ log, args: [`--remote-debugging-port=${BOARD.cdp}`] });
let code = 1;
try {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1584, 891));
  await page.waitForFunction(() => !document.querySelector('[data-role=splash]'), null, { timeout: 30000 }).catch(() => {});
  const fake = [];
  let i = 0;
  for (const n of Object.keys(F)) for (let j = 0; j < COUNTS[n]; j++) fake.push({ sessionId: `fake-${++i}`, name: `${n}-${j + 1}`, workspaceKey: key(n), kind: 'shell', state: 'shell_idle', createdAt: Date.now() - 60000, lastActivityAt: Date.now() });
  await page.evaluate((list) => { for (const s of list) window.__mt.api.emit('session.updated', s); }, fake);
  await sleep(1500);
  const chip = await page.evaluate(() => { const c = document.querySelector('.mt-wsgrp'); if (!c) return null; const r = c.getBoundingClientRect(); return { on: c.classList.contains('on'), name: c.dataset.name, text: c.innerText.replace(/\s+/g, ' ').trim(), sub: !!c.querySelector('[data-role="ws-group-current"]'), width: Math.round(r.width), title: c.title.split('\n').find((l) => l.startsWith('지금')) || null }; });
  log('폴더 칩', chip);
  if (DIST === 'after') {
    check('켜진 폴더 칩은 폴더 이름만(안의 이름 없음)', chip && chip.on && !chip.sub && !/collector/.test(chip.text), chip);
    check('title에는 지금 워크스페이스가 남는다', chip && /collector/.test(chip.title || ''), chip && chip.title);
    // 다른 워크스페이스로 갔다가 폴더 칩을 누르면 마지막에 보던 것으로 간다
    await page.click(`.mt-wsbtn[data-ws="${key('alpha')}"]`);
    await sleep(600);
    await page.click('.mt-wsgrp .mt-ws-name');
    await sleep(800);
    const cur = await page.evaluate(() => { const st = window.__mt.getState(); return st.viewWs || st.currentWs; });
    check('폴더 칩을 누르면 그 폴더(마지막에 보던 워크스페이스)로 간다', cur === key('collector'), cur);
  } else check('[전] 켜진 폴더 칩에 안의 이름이 붙는다', chip && chip.sub, chip);
  const b = await page.locator('[data-role=top-left]').boundingBox();
  await page.screenshot({ path: path.join(OUT, `folder-chip-${DIST}-ko.png`), clip: { x: Math.max(0, b.x - 8), y: Math.max(0, b.y - 8), width: b.width + 16, height: b.height + 16 } });
  await page.screenshot({ path: path.join(OUT, `folder-chip-${DIST}-ko-full.png`) });
  log(`스크린숏 experiments/p212/folder-chip-${DIST}-ko.png`);
  code = results.every((r) => r.ok) ? 0 : 1;
} catch (e) { log('오류', e.stack); }
await closeApp(app);
fs.writeFileSync(path.join(OUT, `p212-${DIST}.json`), JSON.stringify(results, null, 2));
process.exit(code);
