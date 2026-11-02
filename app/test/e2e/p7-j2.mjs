// P7 J2 창 시험: 판에서 끈 세션이 사이드바에 "닫힘"으로 남고, "판으로 열기"로 claude는 같은 세션 ID(같은 대화)로, 셸은 같은 폴더에 다시 뜨며, "빼기"로 목록에서 빠진다.
// 사용(app 폴더에서): MT_E2E_OUT=p7 node test/e2e/p7-j2.mjs <claude 이름> <셸 이름> [뺄 닫힌 세션 이름]
import { launch, closeApp, shot, logger, sleep, until, atrium, call, sessionBy, writeJson, sidebarRows } from './p7-lib.mjs';

const [cName = 's2', shName = 'sh1', dropName] = process.argv.slice(2);
const log = logger('p7-j2');
const result = {};
const { app, page } = await launch({ log });
try {
  const c0 = await sessionBy(page, cName), sh0 = await sessionBy(page, shName);
  if (!c0 || !sh0) throw new Error(`${cName}, ${shName}이 판에 있어야 한다`);
  result.before = { [cName]: { id: c0.sessionId, state: c0.state }, [shName]: { id: sh0.sessionId, cwd: sh0.cwd } };
  if (!(await page.locator('.mt-sidebar').count())) await page.click('[data-action="sidebar"]');
  for (const b of await page.locator('.mt-sb-ws.collapsed [data-action="fold"]').all()) await b.click();
  // 판에서 끈다(atrium kill = 노드 메뉴의 끄기와 같은 API)
  for (const n of [cName, shName]) log(atrium('kill', n, '--yes').replace(/\s+/g, ' ').slice(0, 200));
  await until(async () => (await sidebarRows(page)).some((w) => (w.sections.closed || []).some((r) => r.name === cName)) && (await sidebarRows(page)).some((w) => (w.sections.closed || []).some((r) => r.name === shName)), 20000);
  await sleep(1000);
  result.closedRows = (await sidebarRows(page)).map((w) => ({ ws: w.ws, closed: w.sections.closed || [] }));
  await page.locator(`.mt-sb-row[data-sb="closed"][data-name="${cName}"]`).scrollIntoViewIfNeeded();
  await shot(page, 'j2-1-closed-in-sidebar', log);

  // claude 다시 열기
  await page.click(`.mt-sb-row[data-sb="closed"][data-name="${cName}"] [data-action="reopen"]`);
  await until(async () => { const s = await sessionBy(page, cName); return s && ['ready', 'waiting', 'trust_wait'].includes(s.state); }, 90000);
  const c1 = await sessionBy(page, cName);
  result.claude = { sameId: c1.sessionId === c0.sessionId, state: c1.state, focus: (await page.evaluate(() => window.__mt.getState().focusId)) === c1.sessionId, resume: c1.resume };
  await sleep(1500);
  await shot(page, 'j2-2-claude-reopened', log);
  // 셸 다시 열기(같은 폴더)
  await page.locator(`.mt-sb-row[data-sb="closed"][data-name="${shName}"] [data-action="reopen"]`).click();
  await until(async () => { const s = await sessionBy(page, shName); return s && s.state === 'shell_idle'; }, 60000).catch(async (e) => { log('toasts', JSON.stringify(await page.evaluate(() => window.__mt.getState().toasts.map((t) => t.text)))); await shot(page, 'j2-fail', log); throw e; });
  const sh1 = await sessionBy(page, shName);
  const g = await call(page, 'session.get', { session: sh1.sessionId, screen: false });
  result.shell = { sameId: sh1.sessionId === sh0.sessionId, cwd: g.cwdNow || g.cwd, sameCwd: String(g.cwd).toLowerCase() === String(sh0.cwd).toLowerCase(), newPane: sh1.paneId !== sh0.paneId };
  await sleep(1500);
  await shot(page, 'j2-3-shell-reopened', log);
  // 다시 연 claude에 한 턴: 같은 대화 기록에 이어진다
  log(atrium('send', `@${cName}`, 'Reply with exactly: reopened-ok', '--wait').replace(/\s+/g, ' ').slice(-160));
  await until(async () => { const s = await sessionBy(page, cName); return s && s.lastAnswer && /reopened-ok/i.test(s.lastAnswer); }, 90000);
  const ev = await call(page, 'session.get', { session: cName, screen: false });
  result.claude.transcript = ev.transcriptPath ? ev.transcriptPath.split(/[\\/]/).slice(-1)[0] : null;
  result.claude.transcriptIsSessionId = result.claude.transcript === `${c0.sessionId}.jsonl`;
  // 목록에서 빼기
  if (dropName) {
    await page.click(`.mt-sb-row[data-sb="closed"][data-name="${dropName}"] [data-action="dismiss"]`);
    await until(async () => !(await sidebarRows(page)).some((w) => (w.sections.closed || []).some((r) => r.name === dropName)), 15000);
    result.dismissed = dropName;
    await sleep(600);
    await shot(page, 'j2-4-dismissed', log);
  }
} finally { await closeApp(app); }
writeJson('p7-j2.json', result);
log('결과', JSON.stringify(result));
process.exit(0);
