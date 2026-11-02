// P10 창 시험(완료 기준 4): 빈 판을 처음 켜면 터미널(cli) 대화가 있는 시험 폴더가 워크스페이스로 열리고 그 대화가 사이드바에 보인다.
// 데스크톱 출처만 있는 폴더(desk)와 기간 밖의 폴더(old)는 열리지 않는다. 다른 herdr 세션의 claude가 연 대화(live)는 "터미널 · pid n"이다.
// 사람이 닫은 워크스페이스(closed)는 판을 끄고 켜도 다시 열리지 않는다. 판(창, 백엔드, herdr)을 끄고 켜도 워크스페이스, 노드 자리, 덩어리, 세션이 그대로다.
// 사용: MT_E2E_OUT=p10 node test/e2e/p10-discover.mjs [--fresh] [--live-pid n]   (--fresh: 이 시험 판의 데이터, 창 프로필, herdr 세션을 지우고 시작)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { launch, closeApp, shot, logger, sleep, until, atrium, call, state, openSidebar, writeJson, DIRS, DEV, ENV } from './p10-lib.mjs';
import { pathKey } from '../../../backend/src/workspaces.mjs';

const log = logger('p10-discover');
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const livePid = Number(arg('--live-pid')) || null;
if (process.argv.includes('--fresh')) {
  // 이 시험 판(atrium-dev-p10)의 herdr와 백엔드가 떠 있으면 먼저 끈다(데이터 파일을 쥐고 있다). 다른 판은 건드리지 않는다
  try { log(atrium('herdr', 'stop', '--yes').trim().replace(/\s+/g, ' ')); } catch (e) { log('herdr stop:', e.message.split('\n')[0]); }
  try { log(atrium('backend', 'stop').trim().replace(/\s+/g, ' ')); } catch (e) { log('backend stop:', e.message.split('\n')[0]); }
  await sleep(1500);
  // herdr 세션도 지운다. 남기면 다시 뜬 herdr가 지난 패널을 되살리고 판이 그 패널을 셸로 올린다(G2)
  const herdrExe = path.join(process.env.USERPROFILE, '.herdr', 'packages', 'standalone', 'releases', '0.9.5-x86_64-pc-windows-msvc', 'herdr.exe');
  try { log(execFileSync(herdrExe, ['session', 'delete', ENV.ATRIUM_HERDR_SESSION], { encoding: 'utf8' }).trim()); } catch (e) { log('herdr session delete:', String(e.stderr || e.message).split('\n')[0]); }
  for (const d of [ENV.ATRIUM_DATA_DIR, ENV.ATRIUM_APP_USERDATA]) { if (!d.startsWith(DEV)) throw new Error(`시험 판 밖: ${d}`); fs.rmSync(d, { recursive: true, force: true }); }
  log('시험 판 데이터, 창 프로필, herdr 세션을 지웠다(빈 판)');
}
const key = (d) => pathKey(d);
const result = { steps: [] };
const step = (name, ok, data = {}) => { result.steps.push({ name, ok, ...data }); log(`${ok ? '통과' : '실패'}: ${name}`, data); };

let { app, page } = await launch({ log });
try {
  const before = await state(page);
  step('창이 판을 처음 받았을 때(--fresh면 빈 데이터 폴더로 뜬 백엔드가 첫 훑기에서 이미 열었다)', true, { workspaces: before.workspaces.map((w) => w.name) });
  // 첫 훑기(300ms 뒤) 뒤에 저절로 열린다
  await until(async () => { const s = await state(page); return s.workspaces.some((w) => w.key === key(DIRS.cli)); }, 60000, 500);
  await sleep(1500);
  let s = await state(page);
  const names = s.workspaces.map((w) => w.name);
  step('cli 폴더가 저절로 열림', s.workspaces.some((w) => w.key === key(DIRS.cli) && w.auto), { workspaces: s.workspaces });
  step('live 폴더(다른 herdr 세션의 claude)가 저절로 열림', s.workspaces.some((w) => w.key === key(DIRS.live)), {});
  step('데스크톱 출처만 있는 폴더는 열리지 않음', !s.workspaces.some((w) => w.key === key(DIRS.desk)), {});
  step('기간 밖(40일)의 폴더는 열리지 않음', !s.workspaces.some((w) => w.key === key(DIRS.old)), {});
  step('저절로 연 영역에는 노드가 없다', s.sessions.length === 0, { sessions: s.sessions.length });
  await page.evaluate(() => window.__mt.getState().fitAll(0));
  await sleep(600);
  await shot(page, 'p10-4-1-first-start-canvas', log);
  const regions = await page.evaluate(() => [...document.querySelectorAll('.react-flow__node-region')].map((n) => { const r = n.getBoundingClientRect(); return { ws: n.querySelector('[data-name]') && n.querySelector('[data-name]').dataset.name, w: Math.round(r.width), h: Math.round(r.height) }; }));
  step('저절로 연 빈 영역(판 좌표 520×200)', true, { regions, names });

  // 사이드바: 그 리포의 대화가 보인다. 오래된 것(20·30·60일)은 보관함으로
  await openSidebar(page);
  await until(async () => (await page.$$(`[data-ws="${key(DIRS.cli)}"] [data-sb="convo"]`)).length >= 5, 30000, 500); // 칸마다 5개, 나머지는 "더 보기"
  const rows = await page.$$eval(`[data-ws="${key(DIRS.cli)}"] [data-sb="convo"]`, (els) => els.map((e) => e.querySelector('.mt-sb-title').textContent));
  const data = await call(page, 'recall.list');
  const cliData = data.workspaces.find((w) => w.key === key(DIRS.cli));
  step('사이드바에 cli 리포의 대화(기간 안 6개)', cliData && cliData.convos.length === 6 && cliData.archived === 3, { rows, convos: cliData && cliData.convos.length, archived: cliData && cliData.archived });
  const live = data.workspaces.find((w) => w.key === key(DIRS.live));
  const lc = live && live.convos[0];
  step('다른 판(herdr 세션)의 claude가 연 대화는 "터미널 · pid n"', !!(lc && lc.binding.bound && lc.binding.where === 'terminal' && (!livePid || lc.binding.pid === livePid)), { binding: lc && lc.binding, livePid });
  await shot(page, 'p10-4-2-sidebar-discovered', log);

  // 사람이 닫는다(빈 워크스페이스만 닫힌다)
  const closedKey = key(DIRS.closed);
  const cl = await call(page, 'workspace.close', { workspace: closedKey, confirm: true });
  step('closed 워크스페이스를 사람이 닫음', !!cl.closed, cl);
  // 판 세션 셋(셸, 토큰을 쓰지 않는다)을 띄우고 덩어리로 붙인다
  for (const n of ['sh1', 'sh2', 'sh3']) await call(page, 'session.spawn', { cwd: DIRS.cli, kind: 'shell', name: n });
  await until(async () => (await state(page)).sessions.filter((x) => /^sh[123]$/.test(x.name)).length === 3, 30000, 500);
  const ids = (await state(page)).sessions.filter((x) => /^sh[123]$/.test(x.name)).sort((a, b) => a.name.localeCompare(b.name)).map((x) => x.id);
  await call(page, 'dock.create', { members: ids, dir: 'row' });
  await sleep(1500);
  const pre = await state(page);
  writeJson('p10-4-before-restart.json', pre);
  await page.evaluate(() => window.__mt.getState().fitAll(0)); await sleep(500);
  await shot(page, 'p10-4-3-before-restart', log);
  result.before = pre;
} finally { await closeApp(app); }

// 판을 끄고 켠다: 창 → herdr → 백엔드(p7-j1 graceful과 같은 순서)
await sleep(1500);
log(atrium('herdr', 'stop', '--yes').trim().replace(/\s+/g, ' '));
log(atrium('backend', 'stop').trim().replace(/\s+/g, ' '));
await sleep(2000);
({ app, page } = await launch({ log }));
try {
  await until(async () => (await state(page)).sessions.filter((x) => /^sh[123]$/.test(x.name) && x.state !== 'starting').length === 3, 90000, 1000);
  await sleep(20000); // 훑기 한 번 이상(15초) 지나도 닫은 워크스페이스가 다시 열리지 않는지
  const post = await state(page);
  writeJson('p10-4-after-restart.json', post);
  const b = result.before;
  step('다시 켜도 워크스페이스가 그대로', JSON.stringify(post.workspaces.map((w) => w.key).sort()) === JSON.stringify(b.workspaces.map((w) => w.key).sort()), { before: b.workspaces.map((w) => w.name), after: post.workspaces.map((w) => w.name) });
  step('사람이 닫은 워크스페이스는 다시 열리지 않음', !post.workspaces.some((w) => w.key === key(DIRS.closed)), {});
  step('노드 자리가 그대로', JSON.stringify(post.nodes) === JSON.stringify(b.nodes), { before: b.nodes, after: post.nodes });
  step('덩어리가 그대로', JSON.stringify(post.docks) === JSON.stringify(b.docks), { docks: post.docks });
  step('세션이 그대로', JSON.stringify(post.sessions.map((x) => x.id).sort()) === JSON.stringify(b.sessions.map((x) => x.id).sort()), { states: post.sessions.map((x) => `${x.name}:${x.state}`) });
  await page.evaluate(() => window.__mt.getState().fitAll(0)); await sleep(500);
  await shot(page, 'p10-4-4-after-restart', log);
  await openSidebar(page); await sleep(1500);
  await shot(page, 'p10-4-5-after-restart-sidebar', log);
} finally { await closeApp(app); }
result.ok = result.steps.every((x) => x.ok);
writeJson('p10-discover.json', result);
log(result.ok ? '모두 통과' : `실패 ${result.steps.filter((x) => !x.ok).map((x) => x.name).join(', ')}`);
process.exit(result.ok ? 0 : 1);
