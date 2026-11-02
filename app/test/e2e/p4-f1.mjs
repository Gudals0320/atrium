// P4 완료 기준 3(F1): 판이 띄운 세션 A에게 "B에게 이걸 시키고 답을 받아 와"라고 하면 A가 herdr 스킬로 B에게 일을 시킨다.
// 판에 A → B 선이 생기고, 선 위에 지시 앞부분과 B의 상태가 보인다. 선을 누르면 오간 기록이 나온다.
// 인자: A 이름, B 이름(기본 a, b). 둘 다 판이 띄운 haiku 세션이어야 한다. MT_E2E_OUT=p4
import { launch, shot, logger, sleep, closeApp } from './harness.mjs';
import { linksOf, frame, runUntilReady, sendBar, stateOf } from './p4-lib.mjs';

const [A = 'a', B = 'b'] = process.argv.slice(2);
const log = logger('p4-f1');
const { app, page } = await launch({ log });
await frame(page, [A, B], { maxZoom: 0.55 });
log('시작 전 연결', await linksOf(page));
await shot(page, 'f1-0-before', log);

const task = `Use herdr to ask the agent named ${B} to write the numbers from 1 to 40, one per line, with no other text. Wait for it, read ${B}'s answer, and then tell me only the last number ${B} wrote.`;
await sendBar(page, `@${A} ${task}`);
log(`@${A}에게 보냄: ${task}`);

let shotWorking = false;
await runUntilReady(page, A, log, {
  timeout: 240000,
  onTick: async () => {
    if (shotWorking) return;
    const bState = await stateOf(page, B);
    const l = (await linksOf(page)).find((x) => x.from === A && x.to === B);
    if (bState === 'working' && l) {
      shotWorking = true;
      await frame(page, [A, B], { maxZoom: 0.55 });
      log('B 작업 중일 때 선 위 글', await page.evaluate((id) => { const e = document.querySelector(`.mt-edge-label[data-link="${id}"]`); return e && e.textContent; }, l.id));
      await shot(page, 'f1-1-b-working-on-line', log);
    }
  },
});
await sleep(1500);
await frame(page, [A, B], { maxZoom: 0.55 });
const l = (await linksOf(page)).find((x) => x.from === A && x.to === B);
log('끝난 뒤 연결', l);
log('선 위 글', await page.evaluate((id) => { const e = document.querySelector(`.mt-edge-label[data-link="${id}"]`); return e && e.textContent; }, l && l.id));
log(`@${A} 마지막 답`, await page.evaluate((n) => { for (const s of window.__mt.getState().sessions.values()) if (s.name === n) return s.lastAnswer; }, A));
await shot(page, 'f1-2-done', log);

// 선을 누르면 오간 기록
await page.click(`.mt-edge-label[data-link="${l.id}"]`);
await page.waitForSelector('[data-role="link-panel"] .mt-linkev', { timeout: 10000 });
await sleep(600);
log('오간 기록', await page.evaluate(() => [...document.querySelectorAll('[data-role="link-panel"] .mt-linkev')].map((e) => `${e.dataset.kind}: ${(e.querySelector('pre') || {}).textContent || ''}`.replace(/\s+/g, ' ').slice(0, 160))));
await shot(page, 'f1-3-link-log', log);
await closeApp(app);
process.exit(0);
