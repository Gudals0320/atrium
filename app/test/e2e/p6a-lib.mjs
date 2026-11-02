// P6a 창 시험 공통: 따로 띄운 개발용 판(herdr 세션 atrium-dev-p6a, 포트 47813, backend/.dev/)으로만 띄운다.
// 다른 판(atrium-dev, atrium, atrium-dev-p6b·p6c)과 그 세션은 건드리지 않는다. 결과는 experiments/p6a/(MT_E2E_OUT=p6a)
// P6c 회귀: MT_E2E_BOARD=p6c MT_E2E_OUT=p6c/regress로 P6c 판에서 돌린다
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { launch as launchApp, REPO, sleep, until, shot } from './harness.mjs';
import { atriumEnv } from './p9-guard.mjs';

const DEV = path.join(REPO, 'backend', '.dev');
// P6c: MT_E2E_BOARD=p6c면 P6c 작업자의 판(atrium-dev-p6c, 47815)에서 같은 시험을 다시 돌린다(회귀 확인). 기본은 P6a 판
// P17: MT_E2E_BOARD=p17이면 P17 판(experiments/p17/tools/env.cjs, 대화 목록은 빈 고정 자료). 셸 워크스페이스는 저장소 대신 새 폴더(mtask-p17-h5)
const P17 = process.env.MT_E2E_BOARD === 'p17' ? createRequire(import.meta.url)(path.join(REPO, 'experiments', 'p17', 'tools', 'env.cjs')) : null;
const BOARD = P17 ? { session: 'multitask-dev-p17', port: '47833', plain: 'mtask-p17-plain' } : process.env.MT_E2E_BOARD === 'p6c' ? { session: 'atrium-dev-p6c', port: '47815', plain: 'mtask-p6c-plain' } : { session: 'atrium-dev-p6a', port: '47813', plain: 'mtask-p6a-plain' };
export const ENV = P17 ? atriumEnv(P17.P17_ENV) : {
  ATRIUM_HERDR_SESSION: BOARD.session,
  ATRIUM_PORT: BOARD.port,
  ATRIUM_DATA_DIR: path.join(DEV, 'data'),
  ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  MT_HERDR_SESSION: BOARD.session,
};
export const PROJ = P17 ? path.join('C:\\Workspace', 'mtask-p17-h5') : path.join(DEV, 'proj'); // multitask 저장소 쪽 워크스페이스(셸만: claude는 신뢰 대화상자가 뜬다)
export const PROJ_NAME = P17 ? 'mtask-p17-h5' : 'multitask'; // 저장소 폴더 이름(바꾸지 않음) // 그 워크스페이스 이름(아래쪽 단추)
export const PLAIN = path.join('C:\\Workspace', BOARD.plain); // git이 아닌 폴더(claude 세션)
export const PLAIN_NAME = BOARD.plain; // 그 워크스페이스 이름(영역 이름표, 아래쪽 단추)
export const TWO = path.join(PLAIN, 'two'); // 또 하나의 git이 아닌 폴더
export const R1 = path.join(DEV, 'repos', 'r1'); // 다른 저장소(셸만)

if ((process.env.ATRIUM_HERDR_SESSION ?? process.env.MTASK_HERDR_SESSION) && (process.env.ATRIUM_HERDR_SESSION ?? process.env.MTASK_HERDR_SESSION) !== ENV.ATRIUM_HERDR_SESSION) throw new Error(`이 시험은 ${ENV.ATRIUM_HERDR_SESSION}에서만`);
if (!process.env.MT_E2E_OUT) process.env.MT_E2E_OUT = 'p6a';
Object.assign(process.env, ENV); // 이 스크립트가 부르는 atrium와 herdr 도구도 같은 판을 쓴다

export const launch = (o = {}) => launchApp({ ...o, env: { ...ENV, ...(o.env || {}) } });
export const atrium = (...args) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...args], { encoding: 'utf8', env: { ...process.env, ...ENV } });
export const atriumJson = (...args) => JSON.parse(atrium('--json', ...args));
export const herdr = (m, p = {}) => JSON.parse(execFileSync(process.execPath, [path.join(REPO, 'experiments', 'p4', 'tools', 'h.mjs'), m, JSON.stringify(p)], { encoding: 'utf8', env: { ...process.env, ...ENV } }));
export const call = (page, method, params = {}) => page.evaluate(([m, p]) => window.__mt.api.call(m, p), [method, params]);

// 창 안의 값
export const sessionBy = (page, name) => page.evaluate((n) => [...window.__mt.getState().sessions.values()].find((s) => s.name === n) || null, name);
export const idOf = async (page, name) => (await sessionBy(page, name)).sessionId;
export const rectOf = (page, name) => page.evaluate((n) => { const st = window.__mt.getState(); const s = [...st.sessions.values()].find((x) => x.name === n); return s ? { ...st.nodes.get(s.sessionId) } : null; }, name);
export const vp = (page) => page.evaluate(() => ({ ...window.__mt.getState().vpNow }));
// 화면에 보이는 영역(이름표)과 세는 값
export const regions = (page) => page.evaluate(() => [...document.querySelectorAll('.mt-region')].map((e) => { const r = e.getBoundingClientRect(); return { name: e.dataset.name, warn: e.classList.contains('warn'), head: (e.querySelector('.mt-region-head') || {}).innerText?.replace(/\s+/g, ' '), rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } }; }));
// 노드의 화면 사각형(판 영역 안인가)
export const nodeScreen = (page, name) => page.evaluate((n) => { const e = document.querySelector(`.mt-node[data-name="${n}"]`); if (!e) return null; const r = e.getBoundingClientRect(); const c = document.querySelector('.mt-canvas').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2, inside: r.left >= c.left - 1 && r.top >= c.top - 1 && r.right <= c.right + 1 && r.bottom <= c.bottom + 1, face: e.dataset.face }; }, name);
export const nodeText = (page, name) => page.evaluate((n) => { const e = document.querySelector(`.mt-node[data-name="${n}"]`); return e ? e.innerText.replace(/\s+/g, ' ').slice(0, 400) : null; }, name);
// 화면 좌표 끌기(사람처럼 여러 걸음). opts.alt: Alt를 누른 채
export async function dragBy(page, sel, dx, dy, { alt = false, steps = 12, at = null } = {}) {
  const box = at || await page.locator(sel).first().boundingBox();
  const x0 = box.x + (at ? 0 : Math.min(60, box.width / 2)), y0 = box.y + (at ? 0 : box.height / 2);
  await page.mouse.move(x0, y0);
  if (alt) await page.keyboard.down('Alt');
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) { await page.mouse.move(x0 + (dx * i) / steps, y0 + (dy * i) / steps); await sleep(16); }
  await sleep(120);
  await page.mouse.up();
  if (alt) await page.keyboard.up('Alt');
  await sleep(600);
}
export const setView = async (page, v) => { await page.evaluate((x) => window.__mt.getState().setViewport(x), v); await sleep(500); };
export const fitAll = async (page) => { await page.evaluate(() => window.__mt.getState().fitAll(0)); await sleep(600); };
export const perfTail = (page, kinds) => page.evaluate((k) => window.__mt.perf.events ? window.__mt.perf.events.filter((e) => !k || k.includes(e.kind)).slice(-20) : null, kinds);
export { sleep, until, shot };
