// E5 덧붙임: (1) WebGL 컨텍스트를 잃으면 그 터미널이 DOM으로 돌아가고 화면이 그대로인지
//            (2) 제어기 상한: 가까이 보이는 노드가 상한보다 많으면 상한까지만 붙이고 나머지는 안내를 보인다
import { launch, shot, logger, sleep, until } from './harness.mjs';

const log = logger('e5-extra');
async function fitAll(page) {
  const nodes = await page.evaluate(() => [...window.__mt.getState().nodes.values()]);
  const minX = Math.min(...nodes.map((n) => n.x)), maxX = Math.max(...nodes.map((n) => n.x + n.w)), minY = Math.min(...nodes.map((n) => n.y)), maxY = Math.max(...nodes.map((n) => n.y + n.h));
  const area = await page.evaluate(() => { const r = document.querySelector('.mt-canvas').getBoundingClientRect(); return { w: r.width, h: r.height }; });
  await page.evaluate((vp) => window.__mt.getState().setViewport(vp), { x: (area.w - (maxX - minX) * 0.5) / 2 - minX * 0.5, y: (area.h - (maxY - minY) * 0.5) / 2 - minY * 0.5, zoom: 0.5 });
}
const diffRows = (page) => page.evaluate(async () => {
  let rows = 0, diff = 0;
  for (const [id, t] of window.__mt.terms) {
    const h = (await window.__mt.api.call('terminal.snapshot', { session: id, format: 'text' })).text.split('\n').map((l) => l.replace(/\s+$/, ''));
    for (let r = 0; r < t.rows; r++) { rows++; if (t.buffer.active.getLine(r).translateToString(true).replace(/\s+$/, '') !== (h[r] || '')) diff++; }
  }
  return { rows, diff };
});

// (1) 컨텍스트 잃기
{
  const { app, page } = await launch({ log });
  await fitAll(page);
  await until(() => page.evaluate(() => Object.keys(window.__mt.perf.snapshot().terminals).length >= 8), 30000);
  await sleep(2500);
  const target = await page.evaluate(() => { const [id] = window.__mt.terms.keys(); return { id, name: window.__mt.getState().sessions.get(id).name }; });
  log('잃기 전', await page.evaluate(() => Object.values(window.__mt.perf.snapshot().terminals).map((t) => t.renderer).join(',')), '예산 사용', await page.evaluate(() => window.__mt.budget.used));
  const lost = await page.evaluate((id) => {
    for (const canvas of document.querySelectorAll(`.mt-term[data-session="${id}"] canvas`)) {
      const gl = canvas.getContext('webgl2'); // 2d 캔버스면 null
      const ext = gl && gl.getExtension('WEBGL_lose_context');
      if (ext) { ext.loseContext(); return true; }
    }
    return false;
  }, target.id);
  await sleep(4500); // WebGL 애드온은 컨텍스트가 돌아오기를 3초 기다린 뒤 onContextLoss를 낸다
  const after = await page.evaluate((id) => ({ renderer: window.__mt.perf.snapshot().terminals[id], lost: window.__mt.budget.lost, used: window.__mt.budget.used, canvases: document.querySelectorAll(`.mt-term[data-session="${id}"] canvas`).length, domRows: document.querySelectorAll(`.mt-term[data-session="${id}"] .xterm-rows > div`).length }), target.id);
  log(`${target.name}의 WebGL 컨텍스트 잃기`, lost, '→', after);
  log('판 상태', await page.evaluate(() => ({ attached: window.__mt.getState().attached.length, terms: window.__mt.terms.size, faces: [...document.querySelectorAll('.mt-node')].map((n) => `${n.dataset.name}:${n.dataset.face}`).join(','), vp: document.querySelector('.react-flow__viewport').style.transform })));
  await page.evaluate((id) => window.__mt.api.call('terminal.input', { session: id, data: 'x' }), target.id);
  await sleep(500);
  await page.evaluate((id) => window.__mt.api.call('terminal.input', { session: id, data: '\x7f' }), target.id);
  await sleep(800);
  log('잃은 뒤 화면 비교(DOM으로 그린 터미널 포함)', await diffRows(page));
  await shot(page, 'e5-context-lost-dom-fallback', log);
  await app.close();
}

// (2) 제어기 상한 6
{
  const { app, page } = await launch({ log, query: '?maxControllers=6' });
  await fitAll(page);
  await until(() => page.evaluate(() => window.__mt.getState().attached.length >= 6), 30000);
  await sleep(3000);
  const st = await page.evaluate(() => window.__mt.api.call('backend.status'));
  const faces = await page.evaluate(() => [...document.querySelectorAll('.mt-node')].map((n) => `${n.dataset.name}:${n.dataset.face}:${n.querySelector('.mt-term') ? '터미널' : n.querySelector('.mt-placeholder') ? '안내' : '?'}`));
  log('상한 6', { maxControllers: await page.evaluate(() => window.__mt.maxControllers), attached: await page.evaluate(() => window.__mt.getState().attached.length), backendControllers: st.relay.length, faces });
  await shot(page, 'e5-max-controllers-6', log);
  await app.close();
}
