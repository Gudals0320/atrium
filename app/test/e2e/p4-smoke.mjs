// P4 첫 확인: 창이 뜨고, 읽기 전용 카드 없이 연결선과 판에 올린 노드가 오류 없이 그려지는가. MT_E2E_OUT=p4로 돈다.
import { launch, shot, logger, sleep, closeApp } from './harness.mjs';
import { linksOf, frame } from './p4-lib.mjs';

const log = logger('p4-smoke');
const { app, page } = await launch({ log });
await sleep(3000);
log('세션', await page.evaluate(() => [...window.__mt.getState().sessions.values()].map((s) => `${s.name}:${s.state}:${s.kind}:${s.origin}${s.parentSessionId ? ':parent' : ''}`)));
log('연결', await linksOf(page));
log('그린 선', await page.evaluate(() => [...document.querySelectorAll('.mt-edge-label')].map((e) => `${e.dataset.kind || 'repo'} ${e.textContent}`)));
log('읽기 전용 카드', await page.evaluate(() => document.querySelectorAll('.react-flow__node-desktop, .react-flow__node-other, [data-ext]').length));
log('사건', await page.evaluate(() => window.__mt.perf.events.filter((e) => /error|uncaught|caught/.test(e.kind))));
const names = await page.evaluate(() => [...window.__mt.getState().sessions.values()].filter((s) => s.name !== 's1').map((s) => s.name));
await frame(page, names, { maxZoom: 0.5 });
await shot(page, 'p4-smoke', log);
await closeApp(app);
process.exit(0);
