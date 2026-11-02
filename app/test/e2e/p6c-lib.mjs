// P6c 창 시험 공통: 따로 띄운 개발용 판(herdr 세션 atrium-dev-p6c, 포트 47815, 이 워크트리의 backend/.dev/)으로만 띄운다.
// 다른 판(atrium-dev, atrium, atrium-dev-p6a·p6b)과 그 세션은 건드리지 않는다. 결과는 experiments/p6c/(MT_E2E_OUT=p6c)
// P6a 도구(p6a-lib.mjs)의 노드·영역 읽기를 그대로 쓰되, 판 값은 여기서 강제한다.
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { launch as launchApp, REPO, OUT, sleep, until, shot, logger, closeApp, waitState } from './harness.mjs';
import { boardEnv, outName, dir } from './p11-board.mjs'; // P11: MT_E2E_BOARD=p11이면 P11 판에서

const DEV = path.join(REPO, 'backend', '.dev');
export const ENV = boardEnv({
  ATRIUM_HERDR_SESSION: 'atrium-dev-p6c',
  ATRIUM_PORT: '47815',
  ATRIUM_DATA_DIR: path.join(DEV, 'data'),
  ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  MT_HERDR_SESSION: 'atrium-dev-p6c',
});
export const PROJ = path.join(DEV, 'proj'); // 저장소 쪽(셸만: claude는 신뢰 대화상자가 뜬다)
export const PLAIN = dir('plain', 'C:\\Workspace\\mtask-p6c-plain'); // git이 아닌 폴더(claude 세션)

if ((process.env.ATRIUM_HERDR_SESSION ?? process.env.MTASK_HERDR_SESSION) && (process.env.ATRIUM_HERDR_SESSION ?? process.env.MTASK_HERDR_SESSION) !== ENV.ATRIUM_HERDR_SESSION) throw new Error(`이 시험은 ${ENV.ATRIUM_HERDR_SESSION}에서만`);
if (process.env.MT_E2E_OUT !== outName('p6c')) throw new Error('MT_E2E_OUT=p6c를 명령줄에서 준다(harness가 먼저 읽는다)');
Object.assign(process.env, ENV); // 이 스크립트가 부르는 atrium와 herdr 도구도 같은 판을 쓴다

export const launch = (o = {}) => launchApp({ ...o, env: { ...ENV, ...(o.env || {}) } });
export const atrium = (...args) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...args], { encoding: 'utf8', env: { ...process.env, ...ENV } });
export const call = (page, method, params = {}) => page.evaluate(([m, p]) => window.__mt.api.call(m, p), [method, params]);
export const st = (page, fn, arg) => page.evaluate(fn, arg);

export const sessionBy = (page, name) => page.evaluate((n) => [...window.__mt.getState().sessions.values()].find((s) => s.name === n) || null, name);
export const idOf = async (page, name) => (await sessionBy(page, name)).sessionId;
export const rectOf = (page, name) => page.evaluate((n) => { const st = window.__mt.getState(); const s = [...st.sessions.values()].find((x) => x.name === n); return s ? { ...st.nodes.get(s.sessionId) } : null; }, name);
export const vp = (page) => page.evaluate(() => ({ ...window.__mt.getState().vpNow }));
export const fitAll = async (page) => { await page.evaluate(() => window.__mt.getState().fitAll(0)); await sleep(600); };
export const setView = async (page, v) => { await page.evaluate((x) => window.__mt.getState().setViewport(x), v); await sleep(500); };
export const regions = (page) => page.evaluate(() => [...document.querySelectorAll('.mt-region')].map((e) => { const r = e.getBoundingClientRect(); return { name: e.dataset.name, ws: e.dataset.ws, warn: e.classList.contains('warn'), rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } }; }));
// 판 좌표의 영역(창이 계산한 것)
export const regionOf = (page, key) => page.evaluate((k) => window.__mt.getState().regionOf(k), key);
export const wsKeyByName = (page, name) => page.evaluate((n) => (window.__mt.getState().workspaces.find((w) => w.name === n) || {}).key || null, name);
// 화면 좌표 끌기(사람처럼 여러 걸음)
export async function dragBy(page, sel, dx, dy, { steps = 14, at = null } = {}) {
  const box = at || await page.locator(sel).first().boundingBox();
  const x0 = box.x + (at ? 0 : Math.min(60, box.width / 2)), y0 = box.y + (at ? 0 : box.height / 2);
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) { await page.mouse.move(x0 + (dx * i) / steps, y0 + (dy * i) / steps); await sleep(16); }
  await sleep(150);
  await page.mouse.up();
  await sleep(700);
}
// 판 좌표 → 화면 좌표
export const toScreen = (page, p) => page.evaluate((q) => { const st = window.__mt.getState(); const v = st.vpNow; const c = document.querySelector('.mt-canvas').getBoundingClientRect(); return { x: c.left + q.x * v.zoom + v.x, y: c.top + q.y * v.zoom + v.y }; }, p);
export const overlaps = (a, b, gap = 0) => a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;
// 모든 캔버스 사각형(세션 노드, 메모, 칸반) — 판 좌표
export const allRects = (page) => page.evaluate(() => {
  const st = window.__mt.getState();
  return [
    ...[...st.nodes].filter(([id]) => st.sessions.has(id)).map(([id, r]) => ({ id, kind: 'session', name: st.sessions.get(id).name, ws: st.sessions.get(id).workspaceKey, x: r.x, y: r.y, w: r.w, h: r.h })),
    ...[...st.memos.values()].map((m) => ({ id: m.memoId, kind: 'memo', ws: m.workspaceKey, x: m.x, y: m.y, w: m.w, h: m.h })),
    ...[...st.kanbans.values()].map((k) => ({ id: k.kanbanId, kind: 'kanban', ws: k.workspaceKey, x: k.x, y: k.y, w: k.w, h: k.h })),
  ];
});
export const writeJson = (name, v) => fs.writeFileSync(path.join(OUT, name), JSON.stringify(v, null, 2));
export { sleep, until, shot, logger, closeApp, waitState, OUT, REPO };
