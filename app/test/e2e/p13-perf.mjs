// P13(완료 기준 5): 노드가 많은 판(고정 자료 대화 70개 넘게, 영역 여섯 넘게)에서 켜기와 줌이 느려지지 않는지 잰다.
// - 켜기: 창을 띄운 때부터 판을 받기까지, 모든 대화 노드가 DOM에 그려지기까지. 백엔드가 떠 있을 때(warm)와 백엔드·herdr를 끄고 창이 띄울 때(cold)
// - 줌: 전체 보기에서 휠로 들어갔다 나오는 동안 화면 프레임 간격(requestAnimationFrame). 같은 창에서 대화 노드를 잠시 뺀 판(기준)과 견준다
// 사용: node experiments/p13/tools/e2e.cjs p13-perf.mjs [--cold]
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { launch, closeApp, shot, logger, sleep, until, writeJson, REPO } from './p13-lib.mjs';

const log = logger('p13-perf');
const cold = process.argv.includes('--cold');
if (cold) log(execFileSync(process.execPath, [path.join(REPO, 'experiments', 'p13', 'tools', 'reset.mjs'), '--keep-data'], { encoding: 'utf8' }).trim().replace(/\s+/g, ' '));
const result = { cold };
const { app, page, t0, loadedMs } = await launch({ log });
try {
  await until(() => page.evaluate(() => { const s = window.__mt.getState(); return s.convoNodes.size >= 70 && document.querySelectorAll('.react-flow__node-convo').length >= s.convoNodes.size; }), 120000, 100);
  result.start = { boardLoadedMs: loadedMs, allConvoNodesMs: Date.now() - t0 };
  result.board = await page.evaluate(() => { const s = window.__mt.getState(); return { convoNodes: s.convoNodes.size, workspaces: s.workspaces.length, edges: s.convoEdges.length, domNodes: document.querySelectorAll('*').length, rfNodes: document.querySelectorAll('.react-flow__node').length }; });
  log('켜기', result.start, result.board);

  // 줌: 화면 가운데에서 휠 60번(들어가기 30, 나오기 30), 16ms 간격. 그동안의 프레임 간격을 모은다
  async function zoomRun(label) {
    await page.evaluate(() => window.__mt.getState().fitAll(0));
    await sleep(800);
    // 프레임 간격과 그때의 배율(React Flow 화면 변환의 scale)을 모은다
    await page.evaluate(() => { window.__frames = []; window.__zooms = []; const vpEl = document.querySelector('.react-flow__viewport'); let last = performance.now(); window.__rafOn = true; const tick = (t) => { window.__frames.push(t - last); last = t; const m = /scale\(([0-9.]+)\)/.exec(vpEl.style.transform || ''); if (m) window.__zooms.push(+m[1]); if (window.__rafOn) requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
    const box = await page.$eval('.mt-canvas', (e) => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    await page.mouse.move(box.x, box.y);
    const zoomNow = () => page.evaluate(() => { const m = /scale\(([0-9.]+)\)/.exec(document.querySelector('.react-flow__viewport').style.transform || ''); return m ? +m[1] : 0; });
    const z0 = Date.now();
    // 들어가기: 배율 1(카드가 모두 카드 얼굴)까지, 나오기: 0.12까지. 대화 노드의 얼굴이 아이콘 → 멀리 → 카드 → 멀리 → 아이콘으로 바뀐다
    for (let i = 0; i < 80 && (await zoomNow()) < 1; i++) { await page.mouse.wheel(0, -100); await sleep(16); }
    for (let i = 0; i < 80 && (await zoomNow()) > 0.12; i++) { await page.mouse.wheel(0, 100); await sleep(16); }
    await sleep(500);
    const ms = Date.now() - z0;
    const f = await page.evaluate(() => { window.__rafOn = false; return window.__frames.slice(1); });
    const zs = await page.evaluate(() => window.__zooms);
    const s = [...f].sort((a, b) => a - b);
    const q = (p) => +s[Math.min(s.length - 1, Math.floor(s.length * p))].toFixed(1);
    const vp = await page.evaluate(() => window.__mt.getState().vpNow);
    const r = { label, ms, frames: f.length, fps: +(f.length / (ms / 1000)).toFixed(1), p50: q(0.5), p95: q(0.95), max: +s[s.length - 1].toFixed(1), over50ms: f.filter((x) => x > 50).length, zoomEnd: vp && +vp.zoom.toFixed(3), zoomMin: +Math.min(...zs).toFixed(3), zoomMax: +Math.max(...zs).toFixed(3) };
    log('줌', r);
    return r;
  }
  result.zoomWith = await zoomRun('대화 노드 있음');
  await shot(page, `p13-5-perf-${cold ? 'cold' : 'warm'}`, log);
  // 기준: 같은 창에서 대화 노드와 띄움 선을 잠시 뺀다(백엔드가 다음 convo.nodes를 보내면 돌아온다)
  await page.evaluate(() => window.__mt.setConvoNodes([], []));
  await sleep(300);
  const without = await page.evaluate(() => document.querySelectorAll('.react-flow__node-convo').length);
  result.zoomWithout = { ...(await zoomRun('대화 노드 뺀 기준')), convoNodesInDom: without };
  writeJson(`p13-perf-${cold ? 'cold' : 'warm'}.json`, result);
} catch (e) {
  log('예외', e.stack);
  result.error = e.message;
  writeJson(`p13-perf-${cold ? 'cold' : 'warm'}.json`, result);
} finally { await closeApp(app); process.exit(result.error ? 1 : 0); }
