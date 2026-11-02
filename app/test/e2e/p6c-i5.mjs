// P6c 창 시험 I5: 노드 ⋯ 메뉴의 "루프 만들기" 대화상자(지시, 주기, 횟수, 확인 → 만들기), 노드 배지(돌고 있음, 남은 횟수, 다음 시각),
// 멈춤·이어 가기·끝남·지우기, Thread의 "루프" 줄, 그룹 머리줄의 "루프"(쉴 때, 1회). 셸의 ⋯ 메뉴에는 루프가 없다.
// 주기 1분, 2회. 끝나면 루프와 그룹을 지운다. 실행: cd app && npm run build && MT_E2E_OUT=p6c node test/e2e/p6c-i5.mjs
import { launch, logger, closeApp, shot, sleep, until, call, idOf, st, waitState } from './p6c-lib.mjs';

const log = logger('p6c-i5');
const { app, page } = await launch({ log });
const loops = () => st(page, () => [...window.__mt.getState().loops.values()].map((l) => ({ id: l.loopId, status: l.status, runs: l.runs, target: l.target.kind, stopReason: l.stopReason })));
const badge = (id) => page.locator(`.mt-node[data-session="${id}"] [data-role="loop-badge"]`);
let groupId = null;
try {
  const s1 = await idOf(page, 's1'), s2 = await idOf(page, 's2'), sh1 = await idOf(page, 'sh1');
  await waitState(page, 's1', ['ready']);
  for (const l of await loops()) await call(page, 'loop.delete', { loop: l.id }); // 앞 시험이 남긴 것

  // 셸 노드의 ⋯ 메뉴에는 "루프 만들기"가 없다
  await page.evaluate((id) => window.__mt.getState().navigateTo(id), sh1);
  await sleep(700);
  await page.locator(`.mt-node[data-session="${sh1}"] [data-action="node-menu"]`).click();
  log('셸 ⋯ 메뉴의 루프 만들기', await page.locator(`.mt-node[data-session="${sh1}"] [data-action="loop-new"]`).count());
  await page.locator(`.mt-node[data-session="${sh1}"] [data-action="node-menu"]`).click();

  // s1: ⋯ → 루프 만들기
  await page.evaluate((id) => window.__mt.getState().navigateTo(id), s1);
  await sleep(700);
  await page.locator(`.mt-node[data-session="${s1}"] [data-action="node-menu"]`).click();
  await page.locator(`.mt-node[data-session="${s1}"] [data-action="loop-new"]`).click();
  const dlg = page.locator('[data-role="loop-dialog"]');
  await dlg.waitFor();
  await dlg.locator('[data-field="loop-prompt"]').fill('Reply with exactly: TICK');
  await dlg.locator('[data-field="loop-every"]').fill('1m');
  await dlg.locator('[data-field="loop-max-runs"]').fill('2');
  await dlg.locator('[data-action="loop-check"]').click();
  await dlg.locator('[data-role="loop-confirm"]').waitFor();
  log('만들 때 확인 글', await dlg.locator('[data-role="loop-confirm"]').innerText());
  log('확인 전 루프 수', (await loops()).length);
  await shot(page, 'i5-1-loop-dialog-confirm', log);
  await dlg.locator('[data-action="loop-create"]').click();
  await until(async () => (await loops()).length === 1, 10000, 200);
  const loopId = (await loops())[0].id;
  await until(async () => (await loops())[0].runs === 1, 30000, 300);
  await badge(s1).waitFor();
  log('배지(첫 차례 뒤)', await badge(s1).innerText());
  await until(async () => (await st(page, () => [...window.__mt.getState().thread.values()].some((x) => x.source === 'loop'))), 15000, 300);
  log('Thread의 루프 줄', await st(page, () => { const x = [...window.__mt.getState().thread.values()].filter((t) => t.source === 'loop').at(-1); return { text: x.text, loopId: x.loopId, phase: x.phase, results: x.results.map((r) => `${r.name}:${r.phase}:${r.report ? r.report.text : ''}`) }; }));
  await shot(page, 'i5-2-node-loop-badge', log);

  // 배지 → 목록 → 멈춤 → 이어 가기
  await badge(s1).click();
  const list = page.locator(`.mt-node[data-session="${s1}"] [data-role="loop-list"]`);
  await list.waitFor();
  await list.locator('[data-action="loop-pause"]').click();
  await until(async () => (await loops())[0].status === 'paused', 10000, 200);
  await sleep(1200);
  log('멈춘 배지', await badge(s1).innerText(), '목록', (await list.locator('[data-role="loop-row"]').innerText()).replace(/\s+/g, ' '));
  await shot(page, 'i5-3-loop-paused-list', log);
  await list.locator('[data-action="loop-resume"]').click();
  await until(async () => (await loops())[0].status === 'active', 10000, 200);
  log('이어 간 배지', await badge(s1).innerText());

  // 둘째 차례(1분 주기) → 횟수에 닿아 끝남
  await until(async () => (await loops())[0].status === 'done', 150000, 1000);
  log('끝난 루프', (await loops())[0]);
  await sleep(500);
  log('끝난 배지', await badge(s1).innerText());
  await shot(page, 'i5-4-loop-done', log);
  // 지우기
  if (!(await list.count())) await badge(s1).click();
  await list.locator(`[data-loop="${loopId}"] [data-action="loop-delete"]`).click();
  await until(async () => (await loops()).length === 0, 10000, 200);
  log('지운 뒤 배지 수', await badge(s1).count());

  // 그룹 머리줄의 "루프": s1·s2를 묶고 쉴 때 1회
  await waitState(page, 's1', ['ready']); await waitState(page, 's2', ['ready']);
  const g = await call(page, 'group.create', { members: [s1, s2], name: 'gl' });
  groupId = g.groupId;
  await sleep(800);
  await page.evaluate((r) => window.__mt.getState().navigateToRect(r), { x: g.x, y: g.y, w: g.w, h: g.h });
  await sleep(700);
  await page.locator(`.mt-group[data-group="${groupId}"] [data-action="group-loop"]`).click();
  await dlg.waitFor();
  log('그룹 대화상자 제목', await dlg.locator('h3').innerText());
  await dlg.locator('[data-field="loop-prompt"]').fill('Reply with exactly: GROUP');
  await dlg.locator('[data-field="trig-idle"]').check();
  await dlg.locator('[data-field="loop-max-runs"]').fill('1');
  await dlg.locator('[data-action="loop-check"]').click();
  await dlg.locator('[data-role="loop-confirm"]').waitFor();
  log('그룹 확인 글', await dlg.locator('[data-role="loop-confirm"]').innerText());
  await dlg.locator('[data-action="loop-create"]').click();
  await until(async () => (await loops()).some((l) => l.target === 'group' && l.status === 'done'), 60000, 500);
  log('그룹 루프', (await loops()).find((l) => l.target === 'group'));
  await sleep(500);
  log('그룹 배지', await page.locator(`.mt-group[data-group="${groupId}"] [data-role="group-loop-badge"]`).innerText().catch(() => null));
  await shot(page, 'i5-5-group-loop', log);
  for (const l of await loops()) await call(page, 'loop.delete', { loop: l.id });
  log('남은 루프', (await loops()).length);
  log('끝');
} catch (e) { log('실패', e.stack || e.message); await shot(page, 'i5-fail', log).catch(() => {}); process.exitCode = 1; }
finally {
  try { for (const l of await loops()) await call(page, 'loop.delete', { loop: l.id }); } catch {}
  if (groupId) await call(page, 'group.ungroup', { group: groupId }).catch(() => {});
}
await closeApp(app);
process.exit();
