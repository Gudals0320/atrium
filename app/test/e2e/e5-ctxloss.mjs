// E5 2.5 다시 보기(P3): WebGL 컨텍스트를 일부러 잃게 했을 때 모든 터미널이 놓이는 일이 다시 나는가, 나면 왜인가.
// 창을 새로 띄워 8개 노드를 가까이 얼굴로 맞추고, 터미널 하나의 컨텍스트를 잃게 한 뒤 판 상태와 창 안 사건 기록을 모은다. 이것을 여러 번 한다.
// 사용: MT_E2E_OUT=p3 node test/e2e/e5-ctxloss.mjs <횟수> <배율> [같은 창에서 잃게 할 횟수]
import fs from 'node:fs';
import path from 'node:path';
import { launch, shot, logger, sleep, until, OUT, REPO } from './harness.mjs';

const runs = Number(process.argv[2] || 10);
const zoom = Number(process.argv[3] || 0.5);
const perWindow = Number(process.argv[4] || 1);
// P2(E5 2.5)와 같은 조건: 주소에 질의를 붙이지 않는다(질의를 붙이면 창이 한 번 다시 읽힌다). 추적은 localStorage로 켠다.
const query = process.env.MT_CTX_QUERY ?? '';
// MT_CTX_LOAD=1: 컨텍스트를 잃는 동안 E4에서 기록한 프레임(120×40, 135KB)을 8개 터미널에 쉬지 않고 넣는다(크기 바꾸기도 함께 일어난다)
const load = process.env.MT_CTX_LOAD === '1';
const recorded = load ? JSON.parse(fs.readFileSync(path.join(REPO, 'experiments', 'e4-frames-fullscreen.json'), 'utf8')) : null;
const log = logger(`e5-ctxloss-z${zoom}`);
const appLog = path.join(REPO, 'backend', '.dev', 'data', 'logs', 'app-main.log');

async function fit(page) {
  const nodes = await page.evaluate(() => [...window.__mt.getState().nodes.values()]);
  const minX = Math.min(...nodes.map((n) => n.x)), maxX = Math.max(...nodes.map((n) => n.x + n.w)), minY = Math.min(...nodes.map((n) => n.y)), maxY = Math.max(...nodes.map((n) => n.y + n.h));
  const area = await page.evaluate(() => { const r = document.querySelector('.mt-canvas').getBoundingClientRect(); return { w: r.width, h: r.height }; });
  await page.evaluate((vp) => window.__mt.getState().setViewport(vp), { x: (area.w - (maxX - minX) * zoom) / 2 - minX * zoom, y: (area.h - (maxY - minY) * zoom) / 2 - minY * zoom, zoom });
}
const snap = (page) => page.evaluate(() => {
  const st = window.__mt.getState();
  return {
    used: window.__mt.budget.used, lost: window.__mt.budget.lost, terms: window.__mt.terms.size, attached: st.attached.length,
    faces: [...document.querySelectorAll('.mt-node')].map((n) => n.dataset.face).join(''),
    viewport: document.querySelector('.react-flow__viewport') ? document.querySelector('.react-flow__viewport').style.transform : null,
    renderers: Object.values(window.__mt.perf.snapshot().terminals).map((t) => t.renderer).join(','),
    boundary: document.querySelectorAll('[data-error-boundary]').length,
  };
});

const summary = [];
for (let i = 0; i < runs; i++) {
  const logStart = fs.existsSync(appLog) ? fs.statSync(appLog).size : 0;
  const { app, page } = await launch({ log, query });
  try {
    if (i === 0 && !query) await page.evaluate(() => localStorage.setItem('mt.trace', '1')); // 다음 창부터 켜진다
    await fit(page);
    await until(() => page.evaluate(() => window.__mt.terms.size >= 8 && window.__mt.budget.used >= 8), 30000);
    await sleep(2500);
    const before = await snap(page);
    const t0 = await page.evaluate(() => Date.now());
    const ids = await page.evaluate(() => [...window.__mt.terms.keys()]);
    const results = [];
    if (load) {
      const tg = (await page.evaluate(() => window.__mt.api.call('backend.status'))).relay.map((x) => ({ sessionId: x.sessionId, controllerPid: x.controllerPid }));
      await page.evaluate(([frames, targets]) => {
        let i = 0;
        const step = () => {
          const f = frames[i++ % frames.length];
          for (const x of targets) window.__mt.api.emit('terminal.frame', { sessionId: x.sessionId, controllerPid: x.controllerPid, seq: i, full: f.full, width: f.w, height: f.h, bytes: f.b });
          if (i < frames.length * 3) setTimeout(step, 2);
        };
        step();
      }, [recorded.frames, tg]);
      await sleep(300);
    }
    for (let k = 0; k < perWindow; k++) {
      const target = ids[(i + k) % ids.length];
      const lost = await page.evaluate((id) => {
        for (const canvas of document.querySelectorAll(`.mt-term[data-session="${id}"] canvas`)) {
          const gl = canvas.getContext('webgl2');
          const ext = gl && gl.getExtension('WEBGL_lose_context');
          if (ext) { ext.loseContext(); return true; }
        }
        return false;
      }, target).catch((e) => `evaluate failed: ${e.message}`);
      await sleep(4500);
      const after = await snap(page).catch((e) => ({ error: e.message }));
      results.push({ target: target.slice(0, 8), lost, after });
    }
    const events = await page.evaluate((t) => window.__mt.perf.events.filter((e) => e.t >= t && e.kind !== 'notify').map((e) => ({ ...e, t: e.t - t })), t0).catch(() => null);
    const bad = results.some((r) => !r.after || r.after.error || r.after.terms < 8 || r.after.attached < 8);
    const rec = { run: i + 1, zoom, before, results, bad };
    summary.push(rec);
    log(`run ${i + 1}`, rec);
    if (bad) {
      log('  사건 기록', events);
      await shot(page, `e5-ctxloss-bad-run${i + 1}`, log).catch(() => {});
    }
  } catch (e) {
    log(`run ${i + 1} 실패`, e.message);
    summary.push({ run: i + 1, zoom, failed: e.message, bad: true });
  }
  await app.close().catch(() => {});
  const tail = fs.existsSync(appLog) ? fs.readFileSync(appLog, 'utf8').slice(logStart).split('\n').filter((l) => /navigation|loaded|gone|unresponsive|error|uncaught|caught|context/.test(l)) : [];
  if (tail.length) log(`  창 로그(run ${i + 1})`, tail.map((l) => l.slice(11, 200)));
  await sleep(1000);
}
const bad = summary.filter((s) => s.bad).length;
log(`끝: ${runs}번 중 ${bad}번 터미널이 놓임(배율 ${zoom}, 창마다 ${perWindow}번)`);
fs.writeFileSync(path.join(OUT, `e5-ctxloss-z${zoom}.json`), JSON.stringify(summary, null, 1));
