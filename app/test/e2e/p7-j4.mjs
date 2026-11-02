// P7 J4 창 시험: 다른 터미널(별도 herdr 세션 atrium-dev-p7-outside의 claude)이 열고 있는 판 밖 대화는 "터미널 · pid n"으로 보이고 열 수 없다.
// 그 claude를 끄면 열 수 있게 되고, "판으로 열기"로 같은 대화 ID로 이어 가는 판 세션이 된다. 데스크톱 앱(고정 자료)은 "데스크톱 앱"으로만 보인다.
// 시험 내내 시험 폴더의 대화 ID 수가 늘지 않는다(갈라 열기 없음). 사용(app 폴더에서): MT_E2E_OUT=p7 node test/e2e/p7-j4.mjs <outside 에이전트 이름> <대화 ID>
import { launch, closeApp, shot, logger, sleep, until, atrium, tool, call, sessionBy, writeJson, sidebarRows } from './p7-lib.mjs';

const [agent = 'o2', convId] = process.argv.slice(2);
if (!convId) throw new Error('대화 ID를 준다');
const log = logger('p7-j4');
const count = () => JSON.parse(tool('count-convos.mjs')).total;
const result = { convId, countBefore: count() };
const row = (page) => page.evaluate((id) => { const r = document.querySelector(`.mt-sb-row[data-convo="${id}"]`); return r ? { bound: r.dataset.bound || null, label: r.querySelector('.mt-sb-bound') ? r.querySelector('.mt-sb-bound').textContent : null, canOpen: !!r.querySelector('[data-action="open-convo"]') } : null; }, convId);
const { app, page } = await launch({ log });
try {
  if (!(await page.locator('.mt-sidebar').count())) await page.click('[data-action="sidebar"]');
  for (const b of await page.locator('.mt-sb-ws.collapsed [data-action="fold"]').all()) await b.click();
  await page.waitForSelector(`.mt-sb-row[data-convo="${convId}"]`, { timeout: 30000 });
  result.whileOpen = await row(page);
  result.outside = JSON.parse(tool('outside.mjs', 'pids')).find((x) => x.name === agent) || null; // 다른 터미널의 claude pid(줄의 pid와 같아야 한다)
  // 열려 하면 거부된다(API로도 확인)
  result.openWhileBound = await call(page, 'convo.open', { convo: convId }).then(() => 'opened', (e) => `${e.code}: ${e.message}`);
  // 데스크톱 앱(고정 자료)의 줄
  result.desktopRow = await page.evaluate(() => { const r = document.querySelector('.mt-sb-row[data-bound="desktop"]'); return r ? { label: r.querySelector('.mt-sb-bound').textContent, canOpen: !!r.querySelector('[data-action="open-convo"]') } : null; });
  await page.locator(`.mt-sb-row[data-convo="${convId}"]`).scrollIntoViewIfNeeded();
  await shot(page, 'j4-1-terminal-bound-cannot-open', log);
  // 다른 터미널의 claude를 끈다 → 묶임이 풀린다(방금 기록됨 30초 뒤)
  log(tool('outside.mjs', 'exit', agent).replace(/\s+/g, ' '));
  const t0 = Date.now();
  await until(async () => { const r = await row(page); return r && r.canOpen; }, 90000, 1000);
  result.freedAfterMs = Date.now() - t0;
  result.afterExit = await row(page);
  await shot(page, 'j4-2-free-after-terminal-exit', log);
  // 판으로 연다
  await page.click(`.mt-sb-row[data-convo="${convId}"] [data-action="open-convo"]`);
  await until(async () => { const st = await page.evaluate((id) => { const s = window.__mt.getState().sessions.get(id); return s ? s.state : null; }, convId); return st === 'ready' || st === 'waiting'; }, 90000);
  const s = await page.evaluate((id) => window.__mt.getState().sessions.get(id), convId);
  result.boardSession = { name: s.name, sessionIdIsConvId: s.sessionId === convId, state: s.state, focus: (await page.evaluate(() => window.__mt.getState().focusId)) === convId };
  result.rowGone = !(await row(page));
  await sleep(1200);
  await shot(page, 'j4-3-opened-as-board-session', log);
  log(atrium('send', `@${s.name}`, 'Reply with exactly: continued-from-board', '--wait').replace(/\s+/g, ' ').slice(-120));
  await until(async () => { const x = await sessionBy(page, s.name); return x && /continued-from-board/i.test(x.lastAnswer || ''); }, 90000);
  const g = await call(page, 'session.get', { session: s.name, screen: false });
  result.transcript = g.transcriptPath.split(/[\\/]/).slice(-1)[0];
  // 이미 판 세션인 대화를 다시 열면 그 노드로 갈 뿐
  result.openAgain = await call(page, 'convo.open', { convo: convId });
  result.countAfter = count();
  result.noFork = result.countAfter === result.countBefore;
  await shot(page, 'j4-4-continued-same-conversation', log);
} finally { await closeApp(app); }
writeJson('p7-j4.json', result);
log('결과', JSON.stringify(result));
process.exit(0);
