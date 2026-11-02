// P5 첫 확인: 옮긴 판이 워크스페이스로 보이는가(워크스페이스 단추, 판, 연결). MT_E2E_OUT=p5
// P6a: 캔버스가 하나라 다른 워크스페이스로 가는 연결도 선으로 그린다(노드 가장자리 표시는 없어졌다)
import { shot, logger, closeApp } from './harness.mjs';
import { launch, view, wsBar, allInside, clickWs, sleep } from './p5-lib.mjs';

const log = logger('p5-smoke');
const { app, page } = await launch({ log });
await sleep(1500);
log('워크스페이스 줄', await wsBar(page));
log('지금 판', await view(page));
log('모든 노드가 화면 안', await allInside(page));
log('연결선 글', await page.evaluate(() => [...document.querySelectorAll('.mt-edge-label')].map((e) => e.innerText.replace(/\s+/g, ' '))));
await shot(page, 'smoke-1-multitask', log);
await clickWs(page, 'mtask-p5-plain');
log('판 바꿈', await view(page));
await shot(page, 'smoke-2-plain', log);
const errs = await page.evaluate(() => window.__mt.perf.events ? window.__mt.perf.events.filter((e) => /error|uncaught/.test(e.kind)).length : null);
log('오류 사건', errs);
await closeApp(app);
process.exit(0);
