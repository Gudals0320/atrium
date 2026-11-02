// P7 창 시험 공통: 따로 띄운 개발용 판(herdr 세션 atrium-dev-p7, 포트 47817, 이 워크트리의 backend/.dev/)으로만 띄운다.
// 다른 판(atrium-dev, atrium, p6a~p6c)과 그 세션은 건드리지 않는다. 결과는 experiments/p7/(MT_E2E_OUT=p7)
// 판 밖 대화 목록은 실제 대화 기록에 더해 고정 자료(experiments/p7/tools/make-fixture.mjs)를 읽는다. 시험 판에는 시험 폴더만 연다
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { launch as launchApp, REPO, OUT, sleep, until, shot, logger, closeApp, waitState } from './harness.mjs';
import { boardEnv, outName, dir } from './p11-board.mjs'; // P11: MT_E2E_BOARD=p11이면 P11 판에서

const DEV = path.join(REPO, 'backend', '.dev');
export const ENV = boardEnv({
  ATRIUM_HERDR_SESSION: 'atrium-dev-p7',
  ATRIUM_PORT: '47817',
  ATRIUM_DATA_DIR: path.join(DEV, 'data'),
  ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  MT_HERDR_SESSION: 'atrium-dev-p7',
  ATRIUM_CLAUDE_PROJECTS: [path.join(os.homedir(), '.claude', 'projects'), path.join(DEV, 'fixture-projects')].join(';'),
});
export const PLAIN = dir('plain', 'C:\\Workspace\\mtask-p7-plain'), PLAIN2 = dir('plain2', 'C:\\Workspace\\mtask-p7-plain2'), REPO_DIR = dir('repo', 'C:\\Workspace\\mtask-p7-repo'), WT_DIR = `${REPO_DIR}-wt`;

if ((process.env.ATRIUM_HERDR_SESSION ?? process.env.MTASK_HERDR_SESSION) && (process.env.ATRIUM_HERDR_SESSION ?? process.env.MTASK_HERDR_SESSION) !== ENV.ATRIUM_HERDR_SESSION) throw new Error(`이 시험은 ${ENV.ATRIUM_HERDR_SESSION}에서만`);
if (process.env.MT_E2E_OUT !== outName('p7')) throw new Error('MT_E2E_OUT=p7를 명령줄에서 준다(harness가 먼저 읽는다)');
Object.assign(process.env, ENV); // 이 스크립트가 부르는 atrium와 herdr 도구도 같은 판을 쓴다

export const launch = (o = {}) => launchApp({ ...o, env: { ...ENV, ...(o.env || {}) } });
export const atrium = (...args) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...args], { encoding: 'utf8', env: { ...process.env, ...ENV } });
// P11: P11 판이면 그 판의 도구(experiments/p11/tools의 mt.cjs, herdr-ctl.mjs)를 쓴다. P7 도구는 P7 판 값이 박혀 있다
export const tool = (name, ...args) => execFileSync(process.execPath, [path.join(REPO, 'experiments', ENV.ATRIUM_HERDR_SESSION === 'atrium-dev-p11' ? 'p11' : 'p7', 'tools', name), ...args], { encoding: 'utf8', env: { ...process.env, ...ENV } });
export const call = (page, method, params = {}) => page.evaluate(([m, p]) => window.__mt.api.call(m, p), [method, params]);
export const sessionBy = (page, name) => page.evaluate((n) => [...window.__mt.getState().sessions.values()].find((s) => s.name === n) || null, name);
export const vp = (page) => page.evaluate(() => ({ ...window.__mt.getState().vpNow }));
export const writeJson = (name, v) => fs.writeFileSync(path.join(OUT, name), JSON.stringify(v, null, 2));
// 사이드바 안의 줄(이름, 칸, 묶인 곳)
export const sidebarRows = (page) => page.evaluate(() => [...document.querySelectorAll('.mt-sb-ws')].map((w) => ({
  ws: w.dataset.name, collapsed: w.classList.contains('collapsed'),
  sections: Object.fromEntries([...w.querySelectorAll('.mt-sb-sec')].map((s) => [s.dataset.sec, [...s.querySelectorAll('.mt-sb-row')].map((r) => ({ name: r.dataset.name || null, convo: r.dataset.convo ? r.dataset.convo.slice(0, 8) : null, bound: r.querySelector('.mt-sb-bound') ? r.querySelector('.mt-sb-bound').textContent : null, canOpen: !!r.querySelector('[data-action="open-convo"],[data-action="reopen"]') }))])),
  more: [...w.querySelectorAll('[data-action="more"]')].map((b) => b.textContent),
})));
export { sleep, until, shot, logger, closeApp, waitState, OUT, REPO };
