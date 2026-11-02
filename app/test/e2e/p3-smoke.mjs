// P3 첫 확인: 창이 뜨고, 새 요소(자원, 경고)가 오류 없이 그려지는가. MT_E2E_OUT=p3로 돈다.
import { launch, shot, logger, sleep, closeApp } from './harness.mjs';

const log = logger('p3-smoke');
const { app, page } = await launch({ log });
await sleep(4000);
const st = await page.evaluate(() => {
  const s = window.__mt.getState();
  return { sessions: s.sessions.size, groups: s.groups.size, res: s.resources && { sessionsMB: s.resources.sessionsMB, controllers: s.resources.controllers.count }, clients: s.clients && s.clients.attached };
});
log('창 상태', st);
log('사건', await page.evaluate(() => window.__mt.perf.events.filter((e) => /error|uncaught|caught/.test(e.kind))));
await page.evaluate(() => window.__mt.getState().setViewport({ x: 1100, y: 80, zoom: 0.55 }));
await sleep(1500);
await shot(page, 'p3-smoke', log);
await closeApp(app);
process.exit(0);
