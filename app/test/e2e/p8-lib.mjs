// P8 창 시험 공통: 따로 띄운 개발용 판(herdr 세션 atrium-dev-p8, 포트 47820, 이 워크트리의 backend/.dev/)으로만 띄운다.
// 다른 판(atrium-dev, atrium, p5~p7)과 그 세션은 건드리지 않는다. 결과는 experiments/p8/(MT_E2E_OUT=p8)
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { launch as launchApp, REPO, OUT, sleep, until, shot, logger, closeApp, waitState } from './harness.mjs';
import { boardEnv, outName, dir } from './p11-board.mjs'; // P11: MT_E2E_BOARD=p11이면 P11 판에서

const DEV = path.join(REPO, 'backend', '.dev');
export const ENV = boardEnv({
  ATRIUM_HERDR_SESSION: 'atrium-dev-p8',
  ATRIUM_PORT: '47820',
  ATRIUM_DATA_DIR: path.join(DEV, 'data'),
  ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  MT_HERDR_SESSION: 'atrium-dev-p8',
});
export const PLAIN = dir('board', 'C:\\Workspace\\mtask-p8-plain'), PLAIN2 = dir('plain2', 'C:\\Workspace\\mtask-p8-plain2'), REPO_DIR = dir('repo', 'C:\\Workspace\\mtask-p8-repo'); // P11: lead·w1·w2는 목업 장면 폴더(board)에 있다

if ((process.env.ATRIUM_HERDR_SESSION ?? process.env.MTASK_HERDR_SESSION) && (process.env.ATRIUM_HERDR_SESSION ?? process.env.MTASK_HERDR_SESSION) !== ENV.ATRIUM_HERDR_SESSION) throw new Error(`이 시험은 ${ENV.ATRIUM_HERDR_SESSION}에서만`);
if (process.env.MT_E2E_OUT !== outName('p8')) throw new Error('MT_E2E_OUT=p8를 명령줄에서 준다(harness가 먼저 읽는다)');
Object.assign(process.env, ENV); // 이 스크립트가 부르는 atrium와 herdr 도구도 같은 판을 쓴다

export const launch = (o = {}) => launchApp({ ...o, env: { ...ENV, ...(o.env || {}) } });
export const atrium = (...args) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...args], { encoding: 'utf8', env: { ...process.env, ...ENV } });
export const call = (page, method, params = {}) => page.evaluate(([m, p]) => window.__mt.api.call(m, p), [method, params]);
export const sessionBy = (page, name) => page.evaluate((n) => [...window.__mt.getState().sessions.values()].find((s) => s.name === n) || null, name);
export const writeJson = (name, v) => fs.writeFileSync(path.join(OUT, name), JSON.stringify(v, null, 2));
// 노드 자리와 머리줄의 하위 세션 표시
export const treeView = (page) => page.evaluate(() => {
  const st = window.__mt.getState();
  return [...st.sessions.values()].map((s) => {
    const n = st.nodes.get(s.sessionId) || {};
    const el = document.querySelector(`.mt-node[data-session="${s.sessionId}"] [data-role="branch"]`);
    return { name: s.name, state: s.state, depth: s.branch && s.branch.depth, parent: s.branch && s.branch.parentName, role: s.branch && s.branch.role, badge: el ? el.textContent : null, x: n.x, y: n.y, w: n.w, h: n.h };
  });
});
// 둘레를 맞춰 보이기(이름들의 노드를 감싸는 사각형)
export async function fitNames(page, names, pad = 80) {
  await page.evaluate(([ns, p]) => {
    const st = window.__mt.getState();
    const rs = [...st.sessions.values()].filter((s) => ns.includes(s.name)).map((s) => st.nodes.get(s.sessionId)).filter(Boolean);
    const x0 = Math.min(...rs.map((r) => r.x)) - p, y0 = Math.min(...rs.map((r) => r.y)) - p, x1 = Math.max(...rs.map((r) => r.x + r.w)) + p, y1 = Math.max(...rs.map((r) => r.y + r.h)) + p;
    st.navigateToRect({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, 0);
  }, [names, pad]);
  await sleep(1500);
}
export { sleep, until, shot, logger, closeApp, waitState, OUT, REPO };
