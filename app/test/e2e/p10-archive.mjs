// P10 창 시험(완료 기준 1): 판 밖 대화와 닫힌 세션을 사이드바에서 손으로 보관하고, 보관함에서 찾아(거르기) 꺼낸다.
// 기간(14일)이 지난 대화는 기본 목록과 거르기에 나오지 않고 보관함에 "저절로"로 있다. "오래된 것 보관"은 수를 보이고 한 번 더 눌러야 보관한다.
// 대화 기록 파일과 판 기록은 지워지지 않는다. p10-discover.mjs 뒤의 판에서 돈다(cli 워크스페이스가 열려 있어야 한다).
// 사용: MT_E2E_OUT=p10 node test/e2e/p10-archive.mjs
import fs from 'node:fs';
import path from 'node:path';
import { launch, closeApp, shot, logger, sleep, until, call, state, openSidebar, writeJson, DIRS, FIXTURE } from './p10-lib.mjs';
import { pathKey } from '../../../backend/src/workspaces.mjs';

const log = logger('p10-archive');
const result = { steps: [] };
const step = (name, ok, data = {}) => { result.steps.push({ name, ok, ...data }); log(`${ok ? '통과' : '실패'}: ${name}`, data); };
const CLI = pathKey(DIRS.cli);
// P13: P13 판의 made.json은 { made: [...] }이고 P13 자료(a013)도 들어 있다. 이 시험은 P10 자료(a010)만 본다(P13 시험이 missed 자료를 휴지통으로 보낸다)
const madeAll = JSON.parse(fs.readFileSync(path.join(FIXTURE, 'made.json'), 'utf8'));
const made = (Array.isArray(madeAll) ? madeAll : madeAll.made).filter((m) => m.cid.endsWith('a010'));
const idOf = (title) => made.find((m) => m.title === title).cid;
const files = () => made.map((m) => fs.existsSync(path.join(FIXTURE, m.cwd.replace(/[^A-Za-z0-9]/g, '-'), `${m.cid}.jsonl`)));
const group = (page) => `.mt-sb-ws[data-ws="${CLI}"]`;
const rowsOf = (page, sel) => page.$$eval(`${group(page)} ${sel}`, (els) => els.map((e) => e.dataset.convo || e.dataset.name));
const cliData = async (page) => (await call(page, 'recall.list')).workspaces.find((w) => w.key === CLI);

const { app, page } = await launch({ log });
try {
  await openSidebar(page);
  await page.evaluate(() => { const s = window.__mt.getState(); s.fitAll(0); });
  // 닫힌 세션 하나(셸)를 만든다
  if (!(await state(page)).sessions.some((x) => x.name === 'shx')) {
    await call(page, 'session.spawn', { cwd: DIRS.cli, kind: 'shell', name: 'shx' });
    await until(async () => (await state(page)).sessions.some((x) => x.name === 'shx'), 30000, 500);
    await call(page, 'session.kill', { session: 'shx', confirm: true });
  }
  await until(async () => (await cliData(page)).closed.some((c) => c.name === 'shx'), 30000, 500);
  await until(async () => (await rowsOf(page, '[data-sb="closed"]')).includes('shx'), 30000, 500);
  const d0 = await cliData(page);
  step('처음: 판 밖 대화 6개(기간 안), 보관 3개(20·30·60일), 닫힌 세션 shx', d0.convos.length === 6 && d0.archived === 3, { convos: d0.convos.length, archived: d0.archived, closed: d0.closed.map((c) => c.name) });
  // 기간이 지난 대화는 거르기에도 나오지 않는다
  await page.fill('[data-role="sidebar-filter"]', '설계 메모');
  await sleep(500);
  step('기간이 지난 대화("옛 설계 메모")는 거르기에 나오지 않는다', (await rowsOf(page, '[data-sb="convo"]')).length === 0, {});
  await page.fill('[data-role="sidebar-filter"]', '');
  await sleep(300);

  // 손으로 보관: 닫힌 세션 shx, 대화 "로그 회전 설정"
  await page.click(`${group(page)} [data-sb="closed"][data-name="shx"] [data-action="archive"]`);
  const logId = idOf('로그 회전 설정');
  await page.click(`${group(page)} [data-sb="convo"][data-convo="${logId}"] [data-action="archive"]`);
  await until(async () => { const d = await cliData(page); return d.archived === 5 && !d.closed.some((c) => c.name === 'shx'); }, 20000, 500);
  await sleep(800);
  const d1 = await cliData(page);
  step('손으로 보관하면 기본 목록에서 빠진다', !d1.convos.some((c) => c.convId === logId) && !d1.closed.length && d1.archived === 5, { archived: d1.archived });
  await shot(page, 'p10-1-1-archived-by-hand', log);

  // 보관함: 펼치고 리포별로, 거르기, 꺼내기
  await page.click('[data-action="archive-box"]');
  // P13: 보관함은 모든 리포를 보인다. cli 리포 묶음만 센다(다른 판의 자료가 더 있어도 되게)
  const IN_BOX = `[data-role="archive-box"] .mt-sb-archive-ws[data-ws="${CLI}"] [data-sb="archived"]`;
  await until(async () => (await page.$$(IN_BOX)).length >= 5, 20000, 500);
  const box = await page.$$eval(IN_BOX, (els) => els.map((e) => ({ name: e.dataset.name || e.querySelector('.mt-sb-title').textContent, why: e.querySelector('.mt-sb-sub').textContent.split('·')[0].trim() })));
  step('보관함에 손으로 둘, 저절로 셋', box.length === 5 && box.filter((b) => b.why.startsWith('손으로')).length === 2 && box.filter((b) => b.why.startsWith('저절로')).length === 3, { box });
  await shot(page, 'p10-1-2-archive-box', log);
  await page.fill('[data-role="archive-filter"]', '회전');
  await sleep(400);
  const filtered = await page.$$eval('[data-role="archive-box"] [data-sb="archived"]', (els) => els.map((e) => e.dataset.convo));
  step('보관함 거르기', filtered.length === 1 && filtered[0] === logId, { filtered });
  await shot(page, 'p10-1-3-archive-filter', log);
  await page.click(`[data-role="archive-box"] [data-sb="archived"][data-convo="${logId}"] [data-action="restore"]`);
  await page.fill('[data-role="archive-filter"]', '');
  const oldId = idOf('옛 설계 메모');
  await until(async () => (await page.$$(`[data-role="archive-box"] [data-convo="${oldId}"]`)).length === 1, 10000, 300);
  await page.click(`[data-role="archive-box"] [data-sb="archived"][data-convo="${oldId}"] [data-action="restore"]`); // 저절로 보관된 것도 꺼낸다
  await until(async () => { const d = await cliData(page); return d.convos.some((c) => c.convId === logId) && d.convos.some((c) => c.convId === oldId); }, 20000, 500);
  const d2 = await cliData(page);
  step('꺼낸 것은 기본 목록에 다시 나온다(저절로 보관된 것도 꺼낸 뒤로 다시 센다)', d2.archived === 3, { archived: d2.archived, convos: d2.convos.length });
  await sleep(800);
  await shot(page, 'p10-1-4-restored', log);

  // 오래된 것 보관: 수를 보이고, 한 번 더 눌러야 보관
  await page.click(`${group(page)} [data-action="archive-old"]`);
  await page.waitForSelector(`${group(page)} [data-role="old-ask"]`);
  const ask = await page.$eval(`${group(page)} [data-role="old-ask"] span`, (e) => e.textContent);
  const before = (await cliData(page)).archived;
  step('오래된 것 보관: 먼저 수를 보이고 아직 보관하지 않는다', /\d+개/.test(ask) && before === 3, { ask, before });
  await shot(page, 'p10-1-5-old-ask', log);
  await page.click(`${group(page)} [data-action="old-confirm"]`);
  await until(async () => (await cliData(page)).archived > 3, 20000, 500);
  await sleep(800);
  const d3 = await cliData(page);
  step('하루보다 오래된 대화를 보관(남은 것은 하루 안의 것과 방금 꺼낸 것. 꺼낸 것은 꺼낸 시각부터 센다)', d3.convos.every((c) => Date.now() - c.lastAt < 86400000 || c.convId === oldId) && d3.convos.some((c) => c.convId === oldId) && d3.archived >= 6, { convos: d3.convos.map((c) => c.title), archived: d3.archived });
  await shot(page, 'p10-1-6-old-archived', log);

  // 지우지 않았다
  const fl = files();
  step('대화 기록 파일은 모두 그대로', fl.every(Boolean), { files: fl.length });
  const ab = await call(page, 'archive.list', { workspace: CLI });
  step('닫힌 세션의 판 기록도 그대로(보관함에 있다)', ab.workspaces[0].closed.some((c) => c.name === 'shx'), {});
  // 판에 열려 있는 세션은 보관하지 않는다
  const err = await page.evaluate(() => window.__mt.api.call('archive.add', { session: 'sh1' }).then(() => null, (e) => e.code));
  step('열려 있는 세션은 보관하지 않는다(open_session)', err === 'open_session', { err });
  // 되돌려 두기: 다음 시험이 같은 판을 쓴다
  await call(page, 'archive.restore', { items: ab.workspaces[0].convos.filter((c) => c.archive.why === 'manual').map((c) => ({ convo: c.convId })) });
  await page.click('[data-action="archive-box"]');
} finally { await closeApp(app); }
result.ok = result.steps.every((x) => x.ok);
writeJson('p10-archive.json', result);
log(result.ok ? '모두 통과' : `실패 ${result.steps.filter((x) => !x.ok).map((x) => x.name).join(', ')}`);
process.exit(result.ok ? 0 : 1);
