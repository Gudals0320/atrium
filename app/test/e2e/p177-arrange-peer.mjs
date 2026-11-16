// P177 창 시험: 정리가 동료 세션을 하위처럼 작게 만들지 않는다.
// 판: 터미널 세션 atrium-dev-p177, 포트 47946, 이 워크트리의 backend/.dev(data, app). 창의 원격 디버깅 포트 9426.
// 장면(새로 만든 시험 폴더 C:\Workspace\mtask-p177-a, git 저장소가 아니다, 세션은 모두 셸):
//   lead, peer-b(lead가 띄운 계보 자식 + 동료 관계 = --peer와 같은 꼴), worker-c(lead의 하위), peer-d(따로 띄운 세션, 사람이 lead의 동료로 정한다)
// P177_STAGE=run(장면을 만들고 정리 전·뒤를 찍고 되돌린다) | clean(세션 끄기, 판 멈추기, 시험 폴더 지우기). P177_TAG: 그림 이름 앞붙이(before|after, 고치기 전·뒤 코드)
// 결과는 experiments/p177/(git 밖).
// 실행(워크트리 루트): sh backend/.dev/run-clean.sh env P177_STAGE=run P177_TAG=after node app/test/e2e/p177-arrange-peer.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const STAGE = process.env.P177_STAGE || 'run';
const TAG = process.env.P177_TAG || 'after';
if (!['run', 'clean'].includes(STAGE)) throw new Error('P177_STAGE=run|clean');
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const DEV = path.join(REPO, 'backend', '.dev');
const OUT = path.join(REPO, 'experiments', 'p177');
const FOLDER = 'C:\\Workspace\\mtask-p177-a';
const BOARD = { session: 'atrium-dev-p177', port: 47946, cdp: 9426 };
const ENV = {
  ATRIUM_TERMINAL_SESSION: BOARD.session, ATRIUM_HERDR_SESSION: BOARD.session, ATRIUM_PORT: String(BOARD.port),
  ATRIUM_DATA_DIR: path.join(DEV, 'data'), ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  ATRIUM_CLAUDE_PROJECTS: 'C:\\Workspace\\mtask-p177-none', ATRIUM_CLAUDE_DESKTOP: 'none', MT_E2E_OUT: 'p177',
};
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_|HC_)/.test(k)) delete process.env[k]; // 실제 판의 값을 물려받지 않는다
for (const k of Object.keys(process.env)) if (/^(CLAUDECODE|CLAUDE_CODE_|CLAUDE_EFFORT|CLAUDE_PID|CLAUDE_AGENT_SDK|ELECTRON_RUN_AS_NODE)/.test(k)) delete process.env[k];
Object.assign(process.env, ENV);
fs.mkdirSync(OUT, { recursive: true });
const { logger, sleep, APP_ROOT } = await import('./harness.mjs');
const { assertTestBoard } = await import('./p9-guard.mjs');
assertTestBoard(ENV, { root: DEV });
if (ENV.ATRIUM_TERMINAL_SESSION !== 'atrium-dev-p177' || ENV.ATRIUM_PORT !== '47946') throw new Error('P177 판(atrium-dev-p177, 47946)만');

const log = logger(`p177-${STAGE}-${TAG}`);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 180000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const sessions = () => call('session.list');
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail !== '' ? ` — ${JSON.stringify(detail).slice(0, 800)}` : ''}`); };

if (STAGE === 'clean') {
  try { for (const s of sessions()) { try { log('끄기', atrium('kill', s.sessionId, '--yes', '--delete').trim().split('\n').slice(-1)[0]); } catch (e) { log('끄기 실패', s.name, e.message.slice(0, 160)); } } } catch (e) { log('목록 실패', e.message.slice(0, 160)); }
  try { log('터미널 멈춤', atrium('terminal', 'stop', '--yes').trim().slice(0, 200)); } catch (e) { log('터미널 멈춤 실패', e.message.slice(0, 200)); }
  try { log('백엔드 멈춤', atrium('backend', 'stop').trim().slice(0, 200)); } catch (e) { log('백엔드 멈춤 실패', e.message.slice(0, 200)); }
  try { fs.rmSync(FOLDER, { recursive: true, force: true }); } catch (e) { log('폴더 지우기 실패', e.message.slice(0, 120)); }
  process.exit(0);
}

const shell = (name, extra = {}) => { const r = call('session.spawn', { cwd: FOLDER, name, kind: 'shell', ...extra }); log(`띄움 ${name} ${r.sessionId}`); return r.sessionId; };
async function setupScene() {
  fs.mkdirSync(FOLDER, { recursive: true });
  for (const s of sessions()) { try { atrium('kill', s.sessionId, '--yes', '--delete'); } catch {} }
  await sleep(1000);
  const lead = shell('lead');
  await sleep(800);
  const pb = shell('peer-b', { parentSessionId: lead });
  shell('worker-c', { parentSessionId: lead });
  const pd = shell('peer-d');
  await sleep(1000);
  // --peer 꼴: 계보 자식 + 동료. 사람이 정한 동료: 따로 띄운 세션
  call('relation.set', { a: lead, b: pb, relation: 'peer' });
  call('relation.set', { a: lead, b: pd, relation: 'peer' });
  await sleep(800);
}

let app = null, page = null;
const shot = async (name) => { await page.screenshot({ path: path.join(OUT, `${TAG}-${name}.png`) }); log(`스크린숏 experiments/p177/${TAG}-${name}.png`); };
const nodesNow = () => { const by = new Map(sessions().map((s) => [s.sessionId, s.name])); return call('board.get').nodes.filter((n) => by.has(n.session_id)).map((n) => ({ name: by.get(n.session_id), x: Math.round(n.x), y: Math.round(n.y), w: Math.round(n.w), h: Math.round(n.h), size: n.size || null })).sort((a, b) => a.name.localeCompare(b.name)); };

try {
  log(atrium('backend', 'start').trim().slice(0, 300));
  try { atrium('settings', 'set', 'tray', 'off'); } catch {}
  try { atrium('settings', 'set', 'language', 'ko'); } catch {}
  const have = sessions().map((s) => s.name);
  if (process.env.P177_FRESH === '1' || !['lead', 'peer-b', 'worker-c', 'peer-d'].every((n) => have.includes(n))) await setupScene();
  const ws = call('workspace.list');
  const key = (ws.workspaces || ws).find((w) => String(w.root || '').toLowerCase().includes('mtask-p177-a')).key;

  const { _electron: electron } = await import('playwright');
  app = await electron.launch({ args: ['.', '--dev', `--remote-debugging-port=${BOARD.cdp}`], cwd: APP_ROOT, env: process.env, timeout: 60000 });
  page = await app.firstWindow();
  page.on('pageerror', (e) => log(`[pageerror] ${e.message}`));
  await page.waitForFunction(() => window.__mt && window.__mt.getState().boardLoaded, null, { timeout: 90000 });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1584, 891));
  await page.waitForFunction(() => !document.querySelector('[data-role=splash]'), null, { timeout: 15000 }).catch(() => {});
  await sleep(2500);
  const fit = async () => { await page.evaluate((k) => window.__mt.getState().fitWorkspace && window.__mt.getState().fitWorkspace(k), key); await sleep(1200); };

  await fit();
  await shot('1-before-arrange');
  const n0 = nodesNow();
  log('정리 전', n0);
  await page.evaluate((k) => window.__mt.api.call('board.arrange', { workspace: k, apply: true }), key);
  await sleep(2000);
  await fit();
  await shot('2-after-arrange');
  const n1 = nodesNow();
  log('정리 뒤', n1);
  fs.writeFileSync(path.join(OUT, `${TAG}-nodes.json`), JSON.stringify({ before: n0, after: n1 }, null, 2));
  const g = Object.fromEntries(n1.map((n) => [n.name, n]));
  const lv = (n) => String(n.size || '').split('-').pop();
  check('lead 크게', lv(g.lead) === 'large', g.lead);
  check('peer-b(--peer 꼴)는 lead와 같은 단계', lv(g['peer-b']) === lv(g.lead), g['peer-b']);
  check('peer-d(사람이 정한 동료)는 lead와 같은 단계', lv(g['peer-d']) === lv(g.lead), g['peer-d']);
  check('worker-c(하위)는 작게, lead 오른쪽 열', lv(g['worker-c']) === 'small' && g['worker-c'].x > g.lead.x + g.lead.w, g['worker-c']);
  check('동료는 하위 열이 아니라 lead와 같은 열', g['peer-b'].x === g.lead.x && g['peer-d'].x === g.lead.x, [g['peer-b'].x, g['peer-d'].x, g.lead.x]);
  await page.evaluate((k) => window.__mt.api.call('board.arrange', { workspace: k, undo: true }), key);
  await sleep(1000);
} catch (e) {
  log('오류', e.stack || e.message);
  check('시험이 끝까지 돌았다', false, e.message);
} finally {
  if (app) { try { await app.close(); } catch {} }
  const fails = results.filter((r) => !r.ok);
  fs.writeFileSync(path.join(OUT, `${TAG}-result.json`), JSON.stringify({ stage: STAGE, results }, null, 2));
  log(`결과 ${results.length - fails.length}/${results.length}`);
  process.exit(fails.length ? 1 : 0);
}
