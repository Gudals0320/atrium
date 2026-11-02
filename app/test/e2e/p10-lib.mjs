// P10 창 시험 공통: 이 워크트리의 시험 판(herdr 세션 atrium-dev-p10, 포트 47822, backend/.dev/)으로만 띄운다.
// 판 밖 대화는 늘 고정 자료와 시험용으로 새로 만든 대화만 읽는다(experiments/p10/tools/env.cjs의 ATRIUM_CLAUDE_PROJECTS). 실제 ~/.claude/projects를 읽으면
// 리포 스스로 찾기가 사용자의 실제 리포를 이 판에 열기 때문이다. 다른 판(atrium, atrium-dev, p5~p9)과 그 세션은 건드리지 않는다. 결과는 experiments/p10/(MT_E2E_OUT=p10)
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { _electron as electron } from 'playwright';
import { APP_ROOT, REPO, OUT, sleep, until, shot, logger, closeApp } from './harness.mjs';
import { assertTestBoard, atriumEnv } from './p9-guard.mjs';

// P11: MT_E2E_BOARD=p11이면 P11 판(atrium-dev-p11, 47825, experiments/p11/tools/env.cjs)에서 같은 시험을 다시 돌린다(MT_E2E_OUT=p11)
// P13: MT_E2E_BOARD=p13이면 P13 판(atrium-dev-p13, 47827, experiments/p13/tools/env.cjs, MT_E2E_OUT=p13). 판 값 이름은 P11_ENV 그대로 받는다
// P16·P17: MT_E2E_BOARD=p16·p17이면 그 작업자의 판(experiments/p16·p17/tools/env.cjs)
export const BOARD = ['p11', 'p13', 'p16', 'p17', 'p21', 'p23', 'p26'].includes(process.env.MT_E2E_BOARD) ? process.env.MT_E2E_BOARD : null;
export const P11 = !!BOARD;
const T = createRequire(import.meta.url)(path.join(REPO, 'experiments', BOARD || 'p10', 'tools', 'env.cjs'));
export const { DEV, DIRS, FIXTURE, LIVE_PROJECT } = T;
export const ENV = atriumEnv(P11 ? T.P11_ENV : T.P10_ENV); // P18: env.cjs(기록)는 옛 이름 MTASK_*로 적혀 있다

if ((process.env.ATRIUM_HERDR_SESSION ?? process.env.MTASK_HERDR_SESSION) && (process.env.ATRIUM_HERDR_SESSION ?? process.env.MTASK_HERDR_SESSION) !== ENV.ATRIUM_HERDR_SESSION) throw new Error(`이 시험은 ${ENV.ATRIUM_HERDR_SESSION}에서만`);
if (process.env.MT_E2E_OUT !== (BOARD || 'p10')) throw new Error(`MT_E2E_OUT=${BOARD || 'p10'}을 명령줄에서 준다(harness가 먼저 읽는다)`);
assertTestBoard(ENV, { root: DEV });
if (ENV.ATRIUM_CLAUDE_PROJECTS.toLowerCase().split(';').some((p) => path.resolve(p).toLowerCase() === path.join(process.env.USERPROFILE || '', '.claude', 'projects').toLowerCase())) throw new Error('실제 대화 기록 폴더 전체를 읽게 띄우지 않는다');
fs.mkdirSync(DEV, { recursive: true });
Object.assign(process.env, ENV);

const cleanEnv = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(CLAUDECODE|CLAUDE_CODE_|CLAUDE_EFFORT|CLAUDE_PID|CLAUDE_AGENT_SDK|ELECTRON_RUN_AS_NODE)/.test(k)));
const envFor = () => ({ ...cleanEnv(), ...ENV });

export async function launch({ log = console.log } = {}) {
  const app = await electron.launch({ args: ['.', '--dev'], cwd: APP_ROOT, env: envFor(), timeout: 60000 });
  const page = await app.firstWindow();
  page.on('console', (m) => { if (m.type() === 'error') log(`[console.error] ${m.text().slice(0, 300)}`); });
  page.on('pageerror', (e) => log(`[pageerror] ${e.message}`));
  await page.waitForFunction(() => window.__mt && window.__mt.getState().boardLoaded, null, { timeout: 90000 });
  // P11: 이 PC의 지금 화면에서는 기본 창(1600×960)이 최소 크기(900×600)로 뜬다. P10 시험 때와 같은 창 안쪽 1584×921로 맞춘다
  if (P11) { await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1584, 921)); await sleep(500); }
  const pid = await app.evaluate(() => process.pid);
  log(`창 열림 main pid=${pid}`);
  return { app, page, pid };
}
export const atrium = (...args) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...args], { encoding: 'utf8', env: envFor() });
export const call = (page, method, params = {}) => page.evaluate(([m, p]) => window.__mt.api.call(m, p), [method, params]);
export const writeJson = (name, v) => fs.writeFileSync(path.join(OUT, name), JSON.stringify(v, null, 2));
export const state = (page) => page.evaluate(() => {
  const s = window.__mt.getState();
  return {
    workspaces: s.workspaces.map((w) => ({ key: w.key, name: w.name, auto: !!w.auto, x: w.x, y: w.y })),
    sessions: [...s.sessions.values()].map((x) => ({ id: x.sessionId, name: x.name, kind: x.kind, state: x.state, ws: x.workspaceKey })),
    nodes: Object.fromEntries([...s.nodes].filter(([id]) => s.sessions.has(id)).map(([id, r]) => [s.sessions.get(id).name, { x: r.x, y: r.y, w: r.w, h: r.h }])),
    docks: [...s.docks.values()].map((d) => ({ dir: d.dir, members: d.members.map((m) => (s.sessions.get(m) || {}).name) })),
    focus: s.focusId ? (s.sessions.get(s.focusId) || {}).name : null,
  };
});
export const openSidebar = async (page) => { if (!(await page.$('[data-role="sidebar"]'))) await page.click('[data-action="sidebar"]'); await page.waitForSelector('[data-role="sidebar"]'); };
export const sessionBy = (page, name) => page.evaluate((n) => [...window.__mt.getState().sessions.values()].find((s) => s.name === n) || null, name);
export const viewport = (page) => page.evaluate(() => { const s = window.__mt.getState(); const el = document.querySelector('.mt-canvas'); return { ...(s.vpNow || {}), width: el.clientWidth, height: el.clientHeight }; });
export { sleep, until, shot, logger, closeApp, OUT, REPO, APP_ROOT };
