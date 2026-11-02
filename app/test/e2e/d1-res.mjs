// P3 완료 기준 9(D1): 판의 세션 수, 세션별 메모리(우리 패널의 프로세스, pane.process_info), 붙은 제어기 수, 동시 실행 수를 약 30초마다 잰다.
// P4에서 E1(데스크톱 앱 카드) 부분을 뺐다.
import { launch, shot, logger, sleep } from './harness.mjs';

const log = logger('d1-res');
const { app, page } = await launch({ log });
// 그룹 영역을 보이게 해 터미널(제어기)을 몇 개 붙이고, 자원 이벤트를 70초 동안 받는다
const g = await page.evaluate(() => [...window.__mt.getState().groups.values()][0]);
if (g) await page.evaluate((r) => window.__mt.getState().setViewport({ x: 20 - r.x * 0.6, y: 10 - r.y * 0.6, zoom: 0.6 }), g); // 그룹 안 노드 몇 개가 가까이 얼굴(터미널)
await page.evaluate(() => { window.__res = []; window.__mt.api.on('resources', (r) => window.__res.push(r)); });
await sleep(70000);
const res = await page.evaluate(() => window.__res.map((r) => ({ at: new Date(r.at).toISOString().slice(11, 19), ms: r.ms, sessionCount: r.sessionCount, sessionsMB: r.sessionsMB, running: r.running, waiting: r.waiting, controllers: r.controllers, herdrServer: r.herdrServer, backend: r.backend, perSession: r.sessions.map((s) => `${s.name} ${s.memMB}MB(claude ${s.claudeMB}MB, 프로세스 ${s.procs}개, shell ${s.shellPid}, claude ${s.claudePid})`) })));
log('자원 이벤트(70초)', res);
log('위쪽 줄', await page.evaluate(() => { const r = document.querySelector('[data-role="resources"]'); return { text: r.textContent, title: r.title }; }));
log('노드 머리줄 메모리', await page.evaluate(() => [...document.querySelectorAll('.mt-node')].map((n) => `${n.dataset.name}:${[...n.querySelectorAll('.mt-node-meta')].map((x) => x.textContent).join(' ')}`)));
await shot(page, 'd1-1-resources', log);
await app.close();
