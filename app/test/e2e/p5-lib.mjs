// P5 창 시험 공통: 따로 띄운 개발용 판(herdr 세션 atrium-dev-p5, 포트 47812, backend/.dev/p5/)으로만 띄운다.
// 기본 개발용 판(atrium-dev)과 그 안의 사용자 세션은 건드리지 않는다. 결과는 experiments/p5/(MT_E2E_OUT=p5)
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { launch as launchApp, REPO, sleep, until } from './harness.mjs';

export const P5 = path.join(REPO, 'backend', '.dev', 'p5');
export const ENV = {
  ATRIUM_HERDR_SESSION: 'atrium-dev-p5',
  ATRIUM_PORT: '47812',
  ATRIUM_DATA_DIR: path.join(P5, 'data'),
  ATRIUM_APP_USERDATA: path.join(P5, 'app'),
  MT_HERDR_SESSION: 'atrium-dev-p5',
};
export const PROJ = path.join(P5, 'proj'); // multitask 저장소 쪽 워크스페이스
export const INNER = path.join(PROJ, 'inner'); // proj 안에 따로 git init한 저장소(다른 저장소로 cd 시험)
export const PLAIN = 'C:\\Workspace\\mtask-p5-plain'; // git이 아닌 폴더
export const R1 = path.join(P5, 'repos', 'r1'); // 다른 저장소
export const R1WT = path.join(P5, 'repos', 'r1-wt'); // 그 워크트리

if ((process.env.ATRIUM_HERDR_SESSION ?? process.env.MTASK_HERDR_SESSION) && (process.env.ATRIUM_HERDR_SESSION ?? process.env.MTASK_HERDR_SESSION) !== ENV.ATRIUM_HERDR_SESSION) throw new Error('P5 시험은 atrium-dev-p5에서만');
Object.assign(process.env, ENV); // 이 스크립트가 부르는 atrium와 herdr 도구도 같은 판을 쓴다

export const launch = (o = {}) => launchApp({ ...o, env: { ...ENV, ...(o.env || {}) } });
export const atrium = (...args) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...args], { encoding: 'utf8', env: { ...process.env, ...ENV } });
export const atriumJson = (...args) => JSON.parse(atrium('--json', ...args));
export const herdr = (m, p = {}) => JSON.parse(execFileSync(process.execPath, [path.join(REPO, 'experiments', 'p4', 'tools', 'h.mjs'), m, JSON.stringify(p)], { encoding: 'utf8', env: { ...process.env, ...ENV } }));

// 창 안의 값. P6a: 캔버스가 하나라 워크스페이스 줄은 아래쪽 워크스페이스 단추(.mt-wsbtn)이고, 누르면 판을 바꾸는 대신 그 영역으로 간다.
// 세션 줄은 없어졌다(strip은 늘 빈 목록). current는 마지막에 고른 워크스페이스다
export const view = (page) => page.evaluate(() => {
  const st = window.__mt.getState();
  const ws = st.workspaces.find((w) => w.key === st.currentWs);
  const shown = [...document.querySelectorAll('.react-flow__node-session')].map((e) => e.getAttribute('data-id'));
  const name = (id) => (st.sessions.get(id) || {}).name;
  return { current: ws ? ws.name : st.currentWs, shownNodes: shown.map(name).sort(), viewport: st.vpNow, strip: [...document.querySelectorAll('.mt-strip-item')].map((e) => ({ name: e.dataset.name, off: e.dataset.off === '1', isNew: e.dataset.new === '1', text: e.innerText.replace(/\s+/g, ' ') })) };
});
export const wsBar = (page) => page.evaluate(() => [...document.querySelectorAll('.mt-wsbtn[data-ws]')].map((e) => ({ name: e.dataset.name, on: e.classList.contains('on'), text: e.innerText.replace(/\s+/g, ' ') })));
export const sessionBy = (page, name) => page.evaluate((n) => [...window.__mt.getState().sessions.values()].find((s) => s.name === n) || null, name);
export async function clickWs(page, name) { await page.click(`.mt-wsbtn[data-name="${name}"]`); await sleep(900); }
// 모든 노드가 화면 안에 있는가(노드 사각형이 판 영역 안)
export const allInside = (page) => page.evaluate(() => {
  const c = document.querySelector('.mt-canvas').getBoundingClientRect();
  return [...document.querySelectorAll('.react-flow__node-session')].map((e) => { const r = e.getBoundingClientRect(); return { id: e.dataset.id, inside: r.left >= c.left - 1 && r.top >= c.top - 1 && r.right <= c.right + 1 && r.bottom <= c.bottom + 1 }; });
});
// 새 세션 대화상자로 띄운다(kind: claude | shell | …)
export async function spawnDialog(page, { cwd, name, kind = 'claude', model = 'haiku' }, log = () => {}) {
  await page.click('[data-action=spawn]');
  await page.waitForSelector('[data-role=spawn]');
  const cwdNow = await page.inputValue('[data-field=cwd]');
  log(`새 세션 대화상자: 기본 폴더 ${cwdNow}`);
  await page.fill('[data-field=cwd]', cwd);
  await page.fill('[data-field=name]', name);
  await page.selectOption('[data-field=kind]', kind);
  if (kind === 'claude' && model) await page.fill('[data-field=model]', model);
  await page.click('[data-action=spawn-submit]');
  await page.waitForSelector('[data-role=spawn]', { state: 'detached', timeout: 30000 });
  await until(async () => !!(await sessionBy(page, name)), 20000);
  return cwdNow;
}
// 세션 노드의 머리줄과 표시
export const nodeText = (page, name) => page.evaluate((n) => { const e = document.querySelector(`.mt-node[data-name="${n}"]`); return e ? e.innerText.replace(/\s+/g, ' ').slice(0, 300) : null; }, name);
export { sleep, until };
