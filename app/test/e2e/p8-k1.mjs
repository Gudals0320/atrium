// P8 K1 창 시험: 판이 띄운 lead가 판의 명령으로 만든 하위 세션(w1, w2)이 나무 모양으로 보이고, 정식 판 세션이다(상태, 마지막 답, 승인 카드).
// 앞 단계(mt.cjs send @lead "워커 둘을 만들어…")가 끝난 판에서 돈다. 승인 카드는 w1에게 파일 쓰기를 시켜 띄우고 카드의 1번을 누른다.
// 사용(app 폴더에서): npm run build && MT_E2E_OUT=p8 node test/e2e/p8-k1.mjs
import fs from 'node:fs';
import { launch, closeApp, shot, logger, sleep, until, atrium, sessionBy, writeJson, treeView, fitNames, waitState, PLAIN } from './p8-lib.mjs';

const log = logger('p8-k1');
const result = {};
const { app, page } = await launch({ log });
try {
  await page.evaluate(() => window.__mt.getState().fitAll(0));
  await sleep(1500);
  await fitNames(page, ['lead', 'w1', 'w2']);
  result.tree = await treeView(page);
  log('tree', JSON.stringify(result.tree));
  await shot(page, 'k1-1-two-workers-tree', log);
  result.links = await page.evaluate(() => [...window.__mt.getState().links.values()].map((l) => ({ from: l.fromName, to: l.toName, role: l.role, spawned: l.spawned, observed: l.observed, lastText: l.lastText })));
  log('links', JSON.stringify(result.links));

  // 승인 카드: 하위 세션도 판의 hook이 붙은 세션이라 묻는 내용이 카드로 온다
  const file = `${PLAIN}\\note-w1.txt`;
  fs.rmSync(file, { force: true });
  atrium('send', '@w1', 'Use the Write tool (not Bash) to create a file named note-w1.txt in the current folder containing exactly: hi. Then reply with exactly: WROTE');
  await waitState(page, 'w1', 'waiting', 90000);
  await fitNames(page, ['w1'], 30);
  await page.waitForSelector('.mt-node[data-name="w1"] [data-choice="1"]', { timeout: 20000 });
  const w1 = await sessionBy(page, 'w1');
  result.ask = w1.ask;
  log('w1 ask', JSON.stringify(w1.ask));
  await shot(page, 'k1-2-child-approval-card', log);
  await page.click('.mt-node[data-name="w1"] [data-choice="1"]');
  await waitState(page, 'w1', 'ready', 90000);
  await until(async () => /WROTE/.test(((await sessionBy(page, 'w1')) || {}).lastAnswer || ''), 30000);
  result.fileWritten = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  result.w1LastAnswer = (await sessionBy(page, 'w1')).lastAnswer;
  log('file', JSON.stringify(result.fileWritten), 'w1 answer', result.w1LastAnswer);
  await sleep(800);
  await shot(page, 'k1-3-card-answered', log);
  writeJson('p8-k1.json', result);
} catch (e) { log('FAIL', e.stack); await shot(page, 'k1-fail', log).catch(() => {}); process.exitCode = 1; }
await closeApp(app);
process.exit(process.exitCode || 0);
