// P170 창 시험(ARCH 4절 D4): 보는 중의 시간 제한과 Codex 잠재우기·깨우기.
// 판: 터미널 세션 atrium-dev-p170, 포트 47939, 이 워크트리의 backend/.dev/data. 백엔드를 CLI로 먼저 띄우고 codex 세션 cx1(시험 폴더 C:\Workspace\mtask-p170-cx)을 둔다.
// 사용: backend/.dev/clean-env.sh 로 실제 판 변수를 지운 셸에서 ATRIUM_* 네 값과 MT_E2E_OUT=p170을 주고 node app/test/e2e/p170-view.mjs
// 차례: 0 절전 시간 1분, cx1을 깨워 화면 가까이 둔다 → 1 90초 동안 20초마다 키(Shift)를 누르면 잠들지 않는다
//       → 2 손을 떼면 잠든다(메모리 알약에 잠든 줄) → 3 노드를 눌러 깨우면 같은 대화(앞서 기억한 암호)를 잇는다
import fs from 'node:fs';
import path from 'node:path';
import { _electron as electron } from 'playwright';
import { APP_ROOT, OUT, sleep, until, logger, closeApp } from './harness.mjs';
import { assertTestBoard } from './p9-guard.mjs';

if (process.env.MT_E2E_OUT !== 'p170') throw new Error('MT_E2E_OUT=p170를 명령줄에서 준다');
const env = { ...process.env };
assertTestBoard(env);
fs.mkdirSync(OUT, { recursive: true });
const log = logger('p170-view');
const NAME = process.env.P170_NAME || 'cx1';
const call = (page, m, p = {}) => page.evaluate(([mm, pp]) => window.__mt.api.call(mm, pp), [m, p]);
const sess = (page, n) => page.evaluate((nn) => { const s = [...window.__mt.getState().sessions.values()].find((x) => x.name === nn); return s ? { id: s.sessionId, state: s.state, waking: !!s.waking, sleep: s.sleep, sleepable: s.sleepable, kind: s.kind } : null; }, n);
const results = [];
const step = (name, ok, detail) => { results.push({ name, ok: !!ok, detail }); log(`${ok ? '통과' : '실패'} ${name}`, detail ?? ''); };
const shot = async (page, name) => { const f = path.join(OUT, `${name}.png`); await page.screenshot({ path: f }); log('스크린숏', f); };
async function viewNode(page, n, px) {
  await page.evaluate(([nn, w]) => {
    const st = window.__mt.getState();
    const s = [...st.sessions.values()].find((x) => x.name === nn);
    const r = st.nodes.get(s.sessionId);
    const el = document.querySelector('.mt-canvas');
    const zoom = w / r.w;
    st.setViewport({ x: el.clientWidth / 2 - (r.x + r.w / 2) * zoom, y: el.clientHeight / 2 - (r.y + r.h / 2) * zoom, zoom });
  }, [n, px]);
  await sleep(900);
}

const app = await electron.launch({ args: ['.', '--dev'], cwd: APP_ROOT, env, timeout: 60000 });
const page = await app.firstWindow();
page.on('pageerror', (e) => log(`[pageerror] ${e.message}`));
try {
  await page.waitForFunction(() => window.__mt && window.__mt.getState().boardLoaded, null, { timeout: 90000 });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1584, 921));
  await call(page, 'settings.set', { key: 'language', value: 'ko' });
  await call(page, 'settings.set', { key: 'sleepAfterMin', value: 1 });
  await call(page, 'settings.set', { key: 'sessionSleepAfterMin', value: 1 });
  // 0. cx1을 깨워 화면 가까이 둔다
  let s = await sess(page, NAME);
  step('0 codex 세션이 판에 있다', s && s.kind === 'codex', s);
  if (s.state === 'sleeping') await call(page, 'session.wake', { session: NAME, why: 'e2e' });
  await until(async () => { const x = await sess(page, NAME); return x && x.state === 'ready' && !x.waking; }, 120000, 500);
  await viewNode(page, NAME, 900);
  s = await sess(page, NAME);
  step('0 깨어 있고 잠재울 수 있다(sleepable)', s.state === 'ready' && s.sleepable === true, s);
  await shot(page, 'p170-0-awake');

  // 1. 90초 동안 20초마다 손댄다(키 Shift: 터미널에 글을 넣지 않는다) → 잠들지 않는다
  const t1 = Date.now();
  let slept1 = false;
  while (Date.now() - t1 < 90000) {
    await page.keyboard.press('Shift');
    for (let i = 0; i < 20; i++) { await sleep(1000); const x = await sess(page, NAME); if (x.state === 'sleeping') slept1 = true; }
  }
  const st1 = await call(page, 'sleep.status');
  const each1 = st1.repos.flatMap((r) => r.each || []).find((x) => x.name === NAME);
  step('1 계속 손대면 1분이 지나도 잠들지 않는다(보는 중)', !slept1 && each1 && each1.why === 'viewing', { slept1, each1 });
  await shot(page, 'p170-1-touching');

  // 2. 손을 뗀다 → 마지막으로 손댄 때부터 1분쯤 뒤 잠든다
  const t2 = Date.now();
  const z = await until(async () => { const x = await sess(page, NAME); return x && x.state === 'sleeping' ? x : null; }, 180000, 1000).catch(() => null);
  const ms2 = Date.now() - t2;
  step('2 손대지 않으면 노드를 보는 채로 잠든다', !!z && ms2 < 150000, { ms: ms2, sleep: z && z.sleep });
  await shot(page, 'p170-2-asleep');
  await page.click('[data-role="resources"]').catch(() => {});
  await sleep(800);
  const line = await page.textContent('[data-role="res-asleep-line"]').catch(() => null);
  step('2 메모리 알약 목록에 잠든 줄', !!line && /1/.test(line), line);
  await shot(page, 'p170-2-mem-pill');
  await page.keyboard.press('Escape').catch(() => {});

  // 3. 노드를 눌러 깨우면 같은 대화를 잇는다
  const w = await call(page, 'session.wake', { session: NAME, why: 'click' });
  step('3 누르면 같은 대화로 깬다(resume)', w && w.woke && w.plan === 'resume', w);
  await until(async () => { const x = await sess(page, NAME); return x && x.state === 'ready' && !x.waking; }, 120000, 500);
  await shot(page, 'p170-3-woke');
} catch (e) {
  step('예외', false, e.stack);
} finally {
  fs.writeFileSync(path.join(OUT, 'p170-view.json'), JSON.stringify(results, null, 2));
  await closeApp(app);
  const bad = results.filter((r) => !r.ok);
  log(bad.length ? `실패 ${bad.length}` : `모두 통과 ${results.length}`);
  process.exit(bad.length ? 1 : 0);
}
