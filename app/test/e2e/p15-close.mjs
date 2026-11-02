// P15 창 시험: 노드의 X를 누르면 보관, 삭제, 취소가 뜬다. 삭제는 claude를 끄고 대화 기록을 휴지통으로 보내며 판에서 지운다(닫힌 목록, 대화 노드로 다시 뜨지 않음).
// 보관은 끄고 보관함에 둔다. 판: herdr 세션 atrium-dev-p15, 포트 47830, backend/.dev/p15. 시험 폴더는 새로 만든 C:\Workspace\mtask-p15-ws\demo 하나,
// 시험 claude는 haiku에 한 마디 지시. 대화 목록은 그 폴더의 대화만 읽는다. 사용: MT_E2E_OUT=p15 node test/e2e/p15-close.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { _electron as electron } from 'playwright';
import { APP_ROOT, REPO, OUT, sleep, until, shot, logger, closeApp, e2eBoard } from './harness.mjs';
import { assertTestBoard } from './p9-guard.mjs';

const B = e2eBoard({ session: 'atrium-dev-p15', port: '47830', dev: path.join(REPO, 'backend', '.dev', 'p15'), dir: 'C:\\Workspace\\mtask-p15-ws\\demo' }); // P18: 다른 판에서 다시 돌릴 수 있게
if (!['p15', 'p18', 'p21'].includes(process.env.MT_E2E_OUT)) throw new Error('MT_E2E_OUT=p15를 명령줄에서 준다');
const DEV = B.dev;
const DIR = B.dir;
const PROJECT = path.join(os.homedir(), '.claude', 'projects', DIR.replace(/[^A-Za-z0-9]/g, '-'));
const ENV = {
  ATRIUM_HERDR_SESSION: B.session, ATRIUM_PORT: B.port,
  ATRIUM_DATA_DIR: path.join(DEV, 'data'), ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  ATRIUM_CLAUDE_PROJECTS: PROJECT, ATRIUM_CLAUDE_DESKTOP: 'none',
};
assertTestBoard(ENV, { root: DEV });
fs.mkdirSync(DEV, { recursive: true });
fs.mkdirSync(DIR, { recursive: true });

const log = logger('p15-close');
const cleanEnv = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(CLAUDECODE|CLAUDE_CODE_|CLAUDE_EFFORT|CLAUDE_PID|CLAUDE_AGENT_SDK|ELECTRON_RUN_AS_NODE)/.test(k)));
const env = { ...cleanEnv(), ...ENV };
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env });
const call = (page, m, p = {}) => page.evaluate(([mm, pp]) => window.__mt.api.call(mm, pp), [m, p]);
const sessionBy = (page, name) => page.evaluate((n) => { const s = [...window.__mt.getState().sessions.values()].find((x) => x.name === n); return s ? { id: s.sessionId, state: s.state } : null; }, name);
const transcriptOf = (id) => path.join(PROJECT, `${id}.jsonl`);

const results = [];
const step = (name, ok, detail) => { results.push({ name, ok: !!ok, detail }); log(`${ok ? '통과' : '실패'} ${name}`, detail ?? ''); };

// 이름 n인 haiku claude를 띄워 한 마디 답을 받을 때까지(대화 기록이 생기게)
async function spawnTalked(page, n) {
  atrium('spawn', DIR, '--name', n, '--model', 'haiku', '--prompt', 'Reply with the single word OK.');
  const s = await until(() => sessionBy(page, n), 60000);
  await until(async () => { const x = await sessionBy(page, n); return x && x.state === 'ready' && fs.existsSync(transcriptOf(x.id)) ? x : null; }, 120000);
  return s;
}
async function openClose(page, n) {
  await page.evaluate((nn) => { const s = [...window.__mt.getState().sessions.values()].find((x) => x.name === nn); window.__mt.getState().navigateTo(s.sessionId); }, n);
  await sleep(600);
  await page.click(`.mt-node[data-name="${n}"] [data-action="kill"]`);
  await page.waitForSelector(`.mt-node[data-name="${n}"] [data-role="kill-confirm"] [data-action="close-delete"]`, { timeout: 10000 });
  await page.waitForFunction((nn) => { const k = document.querySelector(`.mt-node[data-name="${nn}"] [data-role="kill-confirm"]`); return k && k.getAttribute('data-loading') === '0'; }, n); // P16: 글이 아니라 표시로
}

const app = await electron.launch({ args: ['.', '--dev'], cwd: APP_ROOT, env, timeout: 60000 });
const page = await app.firstWindow();
page.on('pageerror', (e) => log(`[pageerror] ${e.message}`));
try {
  await page.waitForFunction(() => window.__mt && window.__mt.getState().boardLoaded, null, { timeout: 90000 });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1584, 921));
  await call(page, 'workspace.open', { path: DIR });

  // 1. X → 보관, 삭제, 취소. 취소하면 그대로
  const a = await spawnTalked(page, 'del1');
  await openClose(page, 'del1');
  const labels = await page.evaluate(() => [...document.querySelectorAll('.mt-node[data-name="del1"] [data-role="kill-confirm"] button')].map((b) => b.getAttribute('data-action'))); // P16: 글 대신 data-action
  const text = await page.textContent('.mt-node[data-name="del1"] [data-role="kill-confirm"]');
  step('X를 누르면 보관, 삭제, 취소가 뜬다', labels.join(',') === 'close-archive,close-delete,close-cancel', { labels, text: text.slice(0, 120) });
  await shot(page, 'p15-close-confirm', log);
  await page.click('.mt-node[data-name="del1"] [data-action="close-cancel"]');
  await sleep(500);
  step('취소하면 그대로', !(await page.$('.mt-node[data-name="del1"] [data-role="kill-confirm"]')) && !!(await sessionBy(page, 'del1')));

  // 2. 삭제: 꺼지고, 대화 기록이 휴지통으로 가고, 닫힌 목록과 대화 노드에 없다
  await openClose(page, 'del1');
  await page.click('.mt-node[data-name="del1"] [data-action="close-delete"]');
  await until(async () => !(await sessionBy(page, 'del1')), 60000);
  await until(() => !fs.existsSync(transcriptOf(a.id)), 30000).catch(() => {});
  await sleep(2000);
  await call(page, 'convo.scan').catch(() => {});
  const closed1 = (await call(page, 'session.closed').catch(() => null)) || (await call(page, 'recall.list')).workspaces.flatMap((w) => w.closed);
  const nodes1 = await call(page, 'convo.nodes').catch(() => []);
  const arch1 = (await call(page, 'archive.list')).workspaces.flatMap((w) => [...(w.closed || []), ...(w.convos || [])]);
  step('삭제: 대화 기록이 휴지통으로 가고 닫힌 목록·보관함·대화 노드에 없다', !fs.existsSync(transcriptOf(a.id)) && !closed1.some((x) => x.sessionId === a.id) && !arch1.some((x) => x.sessionId === a.id || x.convId === a.id) && !JSON.stringify(nodes1).includes(a.id), { transcript: fs.existsSync(transcriptOf(a.id)), closed: closed1.length });

  // 3. 보관: 꺼지고 보관함에 있고, 기본 닫힌 목록과 캔버스에는 없다
  const b = await spawnTalked(page, 'arc1');
  await openClose(page, 'arc1');
  await page.click('.mt-node[data-name="arc1"] [data-action="close-archive"]');
  await until(async () => !(await sessionBy(page, 'arc1')), 60000);
  await sleep(1500);
  const list2 = await call(page, 'recall.list');
  const closed2 = list2.workspaces.flatMap((w) => w.closed);
  const arch2 = (await call(page, 'archive.list')).workspaces.flatMap((w) => w.closed || []);
  step('보관: 기본 닫힌 목록에는 없고 보관함에 있다, 대화 기록은 남는다', !closed2.some((x) => x.sessionId === b.id) && arch2.some((x) => x.sessionId === b.id) && fs.existsSync(transcriptOf(b.id)), { closed: closed2.map((x) => x.name), archived: arch2.map((x) => x.name) });
  await shot(page, 'p15-close-after', log);
} catch (e) {
  step('시험 중 오류', false, e.message);
  await shot(page, 'p15-close-error', log).catch(() => {});
} finally {
  try { for (const n of ['del1', 'arc1']) { try { atrium('kill', n, '--yes'); } catch {} } } catch {}
  await closeApp(app);
}
fs.writeFileSync(path.join(OUT, 'p15-close.json'), JSON.stringify(results, null, 2));
log(`결과 ${results.filter((r) => r.ok).length}/${results.length}`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
