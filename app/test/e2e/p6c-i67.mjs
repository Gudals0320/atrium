// P6c 창 시험 I6·I7: 미션 맵 덮개(M과 위쪽 단추, 세 열, 선, 거르기, 노드를 누르면 덮개를 닫고 그 노드로)와 설정의 트레이 상주 켜고 끄기.
// 준비: s1, s2(claude haiku), sh1(셸). 판에서 s1 → s2 역할 연결(리뷰어)을 만들고 끝나면 끊는다. 그룹 g6(s1, s2)도 만들고 푼다.
// 실행: cd app && npm run build && MT_E2E_OUT=p6c node test/e2e/p6c-i67.mjs
import { launch, logger, closeApp, shot, sleep, until, call, idOf, st, waitState } from './p6c-lib.mjs';

const log = logger('p6c-i67');
const { app, page } = await launch({ log });
const trayState = () => app.evaluate(() => global.__mtTray && global.__mtTray.state());
let linkId = null, groupId = null;
try {
  const s1 = await idOf(page, 's1'), s2 = await idOf(page, 's2');
  await waitState(page, 's1', ['ready']);
  // 관계: 판에서 정한 역할(s1 → s2 리뷰어)과 그룹. 명령 바 전달은 앞 시험들의 Thread에 있다
  const l = await call(page, 'link.create', { from: 's1', to: 's2', role: '리뷰어' });
  linkId = l.linkId || (l.link && l.link.linkId);
  const g = await call(page, 'group.create', { members: [s1, s2], name: 'g6' });
  groupId = g.groupId;
  await sleep(1500);

  // M으로 연다
  await page.locator('.mt-canvas').click({ position: { x: 20, y: 20 } });
  await page.keyboard.press('m');
  const mm = page.locator('[data-role="mission"]');
  await mm.waitFor();
  await page.locator('[data-role="mm-node"][data-kind="session"]').first().waitFor();
  await sleep(400);
  const boxes = await page.locator('[data-role="mm-node"]').evaluateAll((es) => es.map((e) => { const r = e.getBoundingClientRect(); return { kind: e.dataset.kind, name: e.dataset.name || '사람', cat: e.dataset.category, x: Math.round(r.x), y: Math.round(r.y) }; }));
  log('미션 맵 노드', boxes);
  const edges = await page.locator('[data-role="mm-edge"]').evaluateAll((es) => es.map((e) => `${e.dataset.kind}:${e.querySelector('text') ? e.querySelector('text').textContent : ''}`));
  log('미션 맵 선', edges);
  const cols = [...new Set(boxes.map((b) => b.x))].sort((a, b) => a - b);
  log('열 x', cols, '사람 열', boxes.find((b) => b.kind === 'human').x, 's1 열', boxes.find((b) => b.name === 's1').x, '그룹 열', (boxes.find((b) => b.kind === 'group') || {}).x, 's2 열', boxes.find((b) => b.name === 's2').x);
  await shot(page, 'i6-1-mission-map', log);
  // 거르기
  await mm.locator('[data-filter="idle"]').click();
  await sleep(300);
  log('쉼으로 거르기', await page.locator('[data-role="mm-node"]').evaluateAll((es) => es.map((e) => e.dataset.name || e.dataset.kind)));
  await shot(page, 'i6-2-mission-filter-idle', log);
  await mm.locator('[data-filter="all"]').click();
  // 연 동안 바뀌면 다시 읽는다: s2에게 보내면 사람 → s2 선(명령 바)의 횟수가 는다
  const barBefore = await page.locator('[data-role="mm-edge"][data-kind="bar"]').evaluateAll((es) => es.map((e) => e.querySelector('text').textContent));
  await call(page, 'session.send', { target: ['s2'], text: 'Reply with exactly: MAP' });
  await until(async () => JSON.stringify(await page.locator('[data-role="mm-edge"][data-kind="bar"]').evaluateAll((es) => es.map((e) => e.querySelector('text').textContent))) !== JSON.stringify(barBefore), 15000, 300).catch(() => {});
  log('명령 바 선(전, 후)', barBefore, await page.locator('[data-role="mm-edge"][data-kind="bar"]').evaluateAll((es) => es.map((e) => e.querySelector('text').textContent)));
  await sleep(500);
  await shot(page, 'i6-3-mission-live-update', log);
  // 노드를 누르면 덮개를 닫고 그 노드로
  await page.locator('[data-role="mm-node"][data-name="s2"]').click();
  await sleep(900);
  log('누른 뒤 덮개', await mm.count(), '초점', await st(page, () => { const s = window.__mt.getState(); return s.sessions.get(s.focusId)?.name; }));
  await shot(page, 'i6-4-mission-click-goes-to-s2', log);
  // 위쪽 단추로도 열고 Esc로 닫는다
  await page.locator('[data-action="mission-open"]').click();
  await mm.waitFor();
  await page.keyboard.press('Escape');
  await sleep(300);
  log('단추로 열고 Esc', await mm.count());

  // ---------- I7 설정 ----------
  log('트레이(처음)', await trayState(), '창 설정', await st(page, () => window.__mt.getState().settings));
  await page.locator('[data-action="settings-open"]').click();
  const box = page.locator('[data-field="setting-tray"]');
  await box.waitFor();
  await box.check();
  await until(async () => (await trayState())?.hasTray === true, 10000, 300);
  log('켠 뒤', await trayState(), '판 설정', (await call(page, 'settings.get')).settings);
  await shot(page, 'i7-1-settings-tray-on', log);
  await box.uncheck();
  await until(async () => (await trayState())?.hasTray === false, 10000, 300);
  log('끈 뒤', await trayState(), '판 설정', (await call(page, 'settings.get')).settings);
  await page.keyboard.press('Escape');
  log('끝');
} catch (e) { log('실패', e.stack || e.message); await shot(page, 'i67-fail', log).catch(() => {}); process.exitCode = 1; }
finally {
  await call(page, 'settings.set', { tray: false }).catch(() => {});
  if (linkId) await call(page, 'link.delete', { link: linkId, confirm: true }).catch((e) => log('연결 끊기', e.message));
  if (groupId) await call(page, 'group.ungroup', { group: groupId }).catch(() => {});
}
await closeApp(app);
process.exit();
