// P13 창 시험 공통: 이 워크트리의 P13 시험 판(herdr 세션 atrium-dev-p13, 포트 47827, backend/.dev/)으로만 띄운다.
// 판 밖 대화는 고정 자료(experiments/p13/tools/make-fixture.mjs)와 이 시험이 새로 만든 대화만 읽는다. 실제 ~/.claude/projects 전체를 읽게 띄우지 않는다.
// MT_E2E_OUT=p13을 명령줄에서 준다(experiments/p13/tools/e2e.cjs가 넣는다). 결과는 experiments/p13/
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { _electron as electron } from 'playwright';
import { APP_ROOT, REPO, OUT, sleep, until, shot, logger, closeApp } from './harness.mjs';
import { assertTestBoard, atriumEnv } from './p9-guard.mjs';

// P16: MT_E2E_BOARD=p16이면 P16 판(experiments/p16/tools, P13 도구를 옮긴 것)에서 돈다
// P27: MT_E2E_BOARD=p27이면 P27 판(experiments/p27/tools/p13, P16 도구를 옮긴 것)에서 돈다
export const BOARD = ['p16', 'p27'].includes(process.env.MT_E2E_BOARD) ? process.env.MT_E2E_BOARD : 'p13';
export const TOOLS = BOARD === 'p27' ? path.join(REPO, 'experiments', 'p27', 'tools', 'p13') : path.join(REPO, 'experiments', BOARD, 'tools');
const T = createRequire(import.meta.url)(path.join(TOOLS, 'env.cjs'));
export const { DEV, DIRS, GONE, FIXTURE, SESSIONS, OPEN_PROJECT } = T;
export const ENV = atriumEnv(T.P13_ENV); // P18: env.cjs(기록)는 옛 이름 MTASK_*로 적혀 있다
if (process.env.MT_E2E_OUT !== BOARD) throw new Error('MT_E2E_OUT=p13을 명령줄에서 준다(experiments/p13/tools/e2e.cjs)');
if ((process.env.ATRIUM_HERDR_SESSION ?? process.env.MTASK_HERDR_SESSION) && (process.env.ATRIUM_HERDR_SESSION ?? process.env.MTASK_HERDR_SESSION) !== ENV.ATRIUM_HERDR_SESSION) throw new Error(`이 시험은 ${ENV.ATRIUM_HERDR_SESSION}에서만`);
assertTestBoard(ENV, { root: DEV });
if (ENV.ATRIUM_CLAUDE_PROJECTS.toLowerCase().split(';').some((p) => path.resolve(p).toLowerCase() === path.join(process.env.USERPROFILE || '', '.claude', 'projects').toLowerCase())) throw new Error('실제 대화 기록 폴더 전체를 읽게 띄우지 않는다');
Object.assign(process.env, ENV);

const cleanEnv = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(CLAUDECODE|CLAUDE_CODE_|CLAUDE_EFFORT|CLAUDE_PID|CLAUDE_AGENT_SDK|ELECTRON_RUN_AS_NODE)/.test(k)));
export const envFor = () => ({ ...cleanEnv(), ...ENV });

export async function launch({ log = console.log, size = { w: 1584, h: 921 } } = {}) {
  const t0 = Date.now();
  const app = await electron.launch({ args: ['.', '--dev'], cwd: APP_ROOT, env: envFor(), timeout: 60000 });
  const page = await app.firstWindow();
  page.on('console', (m) => { if (m.type() === 'error') log(`[console.error] ${m.text().slice(0, 300)}`); });
  page.on('pageerror', (e) => log(`[pageerror] ${e.message}`));
  await page.waitForFunction(() => window.__mt && window.__mt.getState().boardLoaded, null, { timeout: 90000 });
  await page.evaluate(() => window.__mt.pinBottom && window.__mt.pinBottom(true)); // P43: 아래 바를 늘 보이게(옛 창 시험은 바를 바로 누른다)
  const loadedMs = Date.now() - t0;
  if (size) { await app.evaluate(({ BrowserWindow }, s) => BrowserWindow.getAllWindows()[0].setContentSize(s.w, s.h), size); await sleep(500); }
  const pid = await app.evaluate(() => process.pid);
  log(`창 열림 main pid=${pid} (${loadedMs}ms)`);
  return { app, page, pid, t0, loadedMs };
}
export const atrium = (...args) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...args], { encoding: 'utf8', env: envFor() });
export const call = (page, method, params = {}) => page.evaluate(([m, p]) => window.__mt.api.call(m, p), [method, params]);
export const writeJson = (name, v) => fs.writeFileSync(path.join(OUT, name), JSON.stringify(v, null, 2));
export const convos = (page) => page.evaluate(() => [...window.__mt.getState().convoNodes.values()].map((c) => ({ id: c.convId, ws: c.workspaceKey, wsName: c.wsName, title: c.title, block: c.block, x: c.x, y: c.y, w: c.w, h: c.h, subagents: c.subagents, binding: c.binding, spawnedBy: c.spawnedBy, children: c.children, canOpen: c.canOpen })));
export const openSidebar = async (page) => { if (!(await page.$('[data-role="sidebar"]'))) await page.click('[data-action="sidebar"]'); await page.waitForSelector('[data-role="sidebar"]'); };
export const viewport = (page) => page.evaluate(() => { const s = window.__mt.getState(); const el = document.querySelector('.mt-canvas'); return { ...(s.vpNow || {}), width: el.clientWidth, height: el.clientHeight }; });
// 판 좌표 사각형이 화면에 들어오게(배율 zoom이면 그 배율로 가운데에)
export async function lookAt(page, r, zoom = null) {
  await page.evaluate(([rr, z]) => { const s = window.__mt.getState(); if (z) { const el = document.querySelector('.mt-canvas'); s.setViewport({ x: el.clientWidth / 2 - (rr.x + rr.w / 2) * z, y: el.clientHeight / 2 - (rr.y + rr.h / 2) * z, zoom: z }); } else s.navigateToRect(rr, 0); }, [r, zoom]);
  await sleep(700);
}
export { sleep, until, shot, logger, closeApp, OUT, REPO, APP_ROOT };
