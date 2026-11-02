// P7 J5 창 시험: 사이드바가 평소에 닫혀 있고, 위쪽 단추·Ctrl+Shift+E로 열고 닫으며, 리포 묶음 아래 판 세션·닫힌 세션·판 밖 대화가 보이고,
// 누르면 그 노드·영역으로 간다. 캔버스 자리와 배율은 그대로다. 대화가 많아도(고정 자료 400개) 느려지지 않는다. 창을 다시 열어도 연 상태와 접힘이 남는다.
// 사용(app 폴더에서): npm run build && MT_E2E_OUT=p7 node test/e2e/p7-j5.mjs
import { launch, closeApp, shot, logger, sleep, until, call, sessionBy, vp, writeJson, sidebarRows } from './p7-lib.mjs';

const log = logger('p7-j5');
const result = {};
let { app, page } = await launch({ log });
try {
  // 처음 상태(사이드바 기록 지우기): 닫혀 있다
  await page.evaluate(() => { localStorage.removeItem('mt.sidebar'); location.reload(); });
  await page.waitForFunction(() => window.__mt && window.__mt.getState().boardLoaded, null, { timeout: 60000 });
  await page.evaluate(() => window.__mt.getState().fitAll(0));
  await sleep(1200);
  result.closedByDefault = (await page.locator('.mt-sidebar').count()) === 0;
  await shot(page, 'j5-1-closed-by-default', log);
  const vp0 = await vp(page);
  const canvas0 = await page.locator('.mt-canvas').boundingBox();

  // 단추로 연다
  const t0 = Date.now();
  await page.click('[data-action="sidebar"]');
  await page.waitForSelector('.mt-sb-row[data-sb="convo"]', { timeout: 30000 });
  result.openMs = Date.now() - t0;
  await sleep(800);
  const vp1 = await vp(page);
  const canvas1 = await page.locator('.mt-canvas').boundingBox();
  result.viewportKept = vp0.x === vp1.x && vp0.y === vp1.y && vp0.zoom === vp1.zoom;
  result.canvasShrunk = { before: Math.round(canvas0.width), after: Math.round(canvas1.width), left: Math.round(canvas1.x) };
  result.rowsOpen = await sidebarRows(page);
  await shot(page, 'j5-2-open-repos-sessions-closed-convos', log);
  log('open', result.openMs, 'ms', JSON.stringify(result.canvasShrunk), 'viewportKept', result.viewportKept);

  // 판 세션을 누르면 그 노드로 들어간다(H4)
  const s2 = await sessionBy(page, 's2');
  await page.click(`.mt-sb-row[data-sb="session"][data-name="s2"]`);
  await until(async () => (await page.evaluate(() => window.__mt.getState().focusId)) === s2.sessionId, 8000);
  await sleep(900);
  result.clickSessionFocus = (await page.evaluate(() => window.__mt.getState().focusId)) === s2.sessionId;
  await shot(page, 'j5-3-click-session-goes-to-node', log);

  // 리포 이름을 누르면 그 영역으로
  const before = await vp(page);
  await page.click('.mt-sb-ws[data-name="mtask-p7-repo"] [data-action="go-ws"]');
  await sleep(900);
  const after = await vp(page);
  result.clickRepoMoved = before.x !== after.x || before.y !== after.y || before.zoom !== after.zoom;
  result.currentWs = await page.evaluate(() => window.__mt.getState().currentWs);
  await shot(page, 'j5-4-click-repo-goes-to-region', log);

  // 많은 대화: plain2 묶음의 "더 보기"를 여러 번, 거르기 글을 빠르게 친다
  const more = page.locator('.mt-sb-ws[data-name="mtask-p7-plain2"] .mt-sb-sec[data-sec="convos"] [data-action="more"]');
  const tm = Date.now();
  for (let i = 0; i < 10 && (await more.count()); i++) await more.click();
  result.more10Ms = Date.now() - tm;
  result.plain2ConvoRows = await page.locator('.mt-sb-ws[data-name="mtask-p7-plain2"] .mt-sb-row[data-sb="convo"]').count();
  const tf = Date.now();
  await page.fill('[data-role="sidebar-filter"]', '');
  await page.type('[data-role="sidebar-filter"]', '많은 대화 시험 39', { delay: 15 });
  result.typeFilterMs = Date.now() - tf;
  await sleep(300);
  result.filtered = await sidebarRows(page);
  await shot(page, 'j5-5-filter', log);
  // 거르기 동안의 긴 작업(50ms 넘는 프레임)
  result.longFrames = await page.evaluate(async () => {
    let worst = 0, n = 0, last = performance.now();
    const stop = performance.now() + 1500;
    const el = document.querySelector('[data-role="sidebar-filter"]');
    const words = ['워크트리', '데스크톱', '가짜', '', '@s', ''];
    let i = 0;
    const iv = setInterval(() => { const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(el, words[i++ % words.length]); el.dispatchEvent(new Event('input', { bubbles: true })); }, 100);
    await new Promise((res) => { const f = (t) => { const d = t - last; last = t; if (d > 50) n++; worst = Math.max(worst, d); if (t < stop) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
    clearInterval(iv);
    return { worstFrameMs: Math.round(worst), over50: n };
  });
  await page.fill('[data-role="sidebar-filter"]', '워크트리');
  await sleep(300);
  result.filterWorktree = await sidebarRows(page);
  await page.fill('[data-role="sidebar-filter"]', '');

  // 접기와 Ctrl+Shift+E(터미널 밖에서), 다시 열기
  await page.click('.mt-sb-ws[data-name="mtask-p7-plain2"] [data-action="fold"]');
  await sleep(200);
  await page.keyboard.press('Control+Shift+E');
  await sleep(300);
  result.shortcutCloses = (await page.locator('.mt-sidebar').count()) === 0;
  await page.keyboard.press('Control+Shift+E');
  await page.waitForSelector('.mt-sidebar');
  result.shortcutOpens = true;
  await sleep(500);
  await shot(page, 'j5-6-folded-plain2', log);
} finally { await closeApp(app); }

// 창을 다시 연다: 사이드바가 열린 채, plain2가 접힌 채
({ app, page } = await launch({ log }));
try {
  await page.waitForSelector('.mt-sidebar', { timeout: 20000 });
  await sleep(1500);
  result.reopenedState = await sidebarRows(page);
  result.reopenedOpen = true;
  result.reopenedPlain2Collapsed = result.reopenedState.find((w) => w.ws === 'mtask-p7-plain2').collapsed;
  await shot(page, 'j5-7-reopened-window-keeps-sidebar', log);
} finally { await closeApp(app); }
writeJson('p7-j5.json', result);
log('결과', JSON.stringify({ closedByDefault: result.closedByDefault, openMs: result.openMs, viewportKept: result.viewportKept, clickSessionFocus: result.clickSessionFocus, clickRepoMoved: result.clickRepoMoved, plain2ConvoRows: result.plain2ConvoRows, more10Ms: result.more10Ms, typeFilterMs: result.typeFilterMs, longFrames: result.longFrames, shortcut: [result.shortcutCloses, result.shortcutOpens], reopenedPlain2Collapsed: result.reopenedPlain2Collapsed }));
process.exit(0);
