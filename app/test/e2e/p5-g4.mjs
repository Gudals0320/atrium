// P5 완료 기준 4(G4): 내 차례 칩, N, OS 알림이 다른 워크스페이스의 세션으로 데려간다(워크스페이스를 바꾸고 노드로 감).
// 다른 워크스페이스로 가는 연결이 노드에 표시되고 누르면 그쪽으로 간다. @all은 지금 워크스페이스의 에이전트 세션에만 간다. MT_E2E_OUT=p5
// P6a: 캔버스가 하나라 4)는 선(연결선 글을 누르면 오간 기록)으로, 5)의 @all은 캔버스 전체의 에이전트로 바뀌었다(p6a-h67.mjs가 본다)
import { shot, logger, closeApp } from './harness.mjs';
import { launch, view, clickWs, sessionBy, atrium, until, sleep } from './p5-lib.mjs';

const log = logger('p5-g4');
const { app, page } = await launch({ log });
await sleep(1200);
const where = async (name) => page.evaluate((n) => {
  const st = window.__mt.getState();
  const s = [...st.sessions.values()].find((x) => x.name === n);
  const el = s && document.querySelector(`.react-flow__node[data-id="${s.sessionId}"]`);
  const c = document.querySelector('.mt-canvas').getBoundingClientRect();
  const r = el && el.getBoundingClientRect();
  return { current: (st.workspaces.find((w) => w.key === st.currentWs) || {}).name, rendered: !!el, centered: !!r && Math.abs(r.left + r.width / 2 - (c.left + c.width / 2)) < 40 && Math.abs(r.top + r.height / 2 - (c.top + c.height / 2)) < 40, focus: st.focusId === (s && s.sessionId) };
}, name);

// 다른 워크스페이스(mtask-p5-plain)의 c가 내 답을 기다리게 한다(권한 요청)
await clickWs(page, 'multitask');
atrium('send', '@c', 'Run exactly this shell command and nothing else: echo p5 > p5-g4.txt');
await until(async () => { const s = await sessionBy(page, 'c'); return s.state === 'waiting'; }, 60000, 500);
const c = await sessionBy(page, 'c');
log('c 내 차례', c.ask && c.ask.summary);
await sleep(2500); // 알림을 정하는 시간(1.2초)
const chip = await page.evaluate(() => [...document.querySelectorAll('.mt-chip.need')].map((e) => e.innerText.replace(/\s+/g, ' ')));
log('지금 판', (await view(page)).current, '내 차례 칩', chip);
await shot(page, 'g4-1-chip-other-workspace', log);

// 1) 칩을 누르면 그 워크스페이스로 바꾸고 노드로 간다
await page.click(`.mt-chip.need[data-name="c"]`);
await sleep(1200);
log('칩 누른 뒤', await where('c'));
await shot(page, 'g4-2-chip-navigated', log);

// 2) N
await clickWs(page, 'multitask');
log('N 전', await where('c'));
await page.click('.mt-canvas', { position: { x: 30, y: 30 } });
await page.keyboard.press('n');
await sleep(1200);
log('N 뒤', await where('c'));

// 3) OS 알림(main의 알림 객체에 click을 낸다)
await clickWs(page, 'multitask');
const notes = await app.evaluate(({}, id) => global.__mtNotifications.filter((n) => n.sessionId === id).map((n) => ({ key: n.key, shown: n.shown })), c.sessionId);
log('c 알림', notes, '창 쪽 기록', await page.evaluate((id) => window.__mt.notifyLog.filter((x) => x.sessionId === id).map((x) => ({ notify: x.notify, why: x.why })), c.sessionId));
if (notes.length) {
  await app.evaluate(({}, id) => { const n = global.__mtNotifications.filter((x) => x.sessionId === id).pop(); n.note.emit('click'); }, c.sessionId);
  await sleep(1200);
  log('알림 누른 뒤', await where('c'));
  await shot(page, 'g4-3-notification-navigated', log);
}
atrium('answer', 'c', 'reject'); // 파일은 만들지 않는다
await until(async () => (await sessionBy(page, 'c')).state !== 'waiting', 30000, 500);

// 4) 다른 워크스페이스로 가는 연결(a → c 도우미): 노드 가장자리 표시 → 누르면 그쪽으로
await clickWs(page, 'multitask');
const a = await sessionBy(page, 'a');
await page.evaluate((id) => window.__mt.getState().navigateTo(id), a.sessionId);
await sleep(1200);
log('그린 선(a→c도 선이다)', await page.evaluate(() => [...document.querySelectorAll('.mt-edge-label')].map((e) => e.innerText.replace(/\s+/g, ' '))));
await shot(page, 'g4-4-cross-link-line', log);

// 5) @all: P6a부터 캔버스 전체의 에이전트 세션(셸 cdsh는 빼고, 다른 워크스페이스의 c도 받는다)
await clickWs(page, 'multitask');
const before = await page.evaluate(() => new Set(window.__mt.getState().deliveries.keys()).size);
await page.click('[data-role=command]');
await page.keyboard.type('@al');
await sleep(300);
log('@ 메뉴', await page.evaluate(() => [...document.querySelectorAll('.mt-mention-item')].map((e) => e.innerText)));
await page.fill('[data-role=command]', '@all Reply with exactly: p5all');
await page.keyboard.press('Enter');
await sleep(1500);
const ds = await page.evaluate(() => [...window.__mt.getState().deliveries.values()].slice(-4).map((d) => ({ name: d.name, status: d.status })));
log('@all 전달', ds, '전 개수', before);
await shot(page, 'g4-6-all-current-workspace', log);
await until(async () => { const x = await page.evaluate(() => [...window.__mt.getState().deliveries.values()].filter((d) => /p5all/.test(d.text || '') || true).slice(-2).every((d) => ['confirmed', 'unconfirmed', 'failed'].includes(d.status))); return x; }, 60000, 1000).catch(() => {});
log('@all 끝', await page.evaluate(() => [...window.__mt.getState().deliveries.values()].slice(-2).map((d) => ({ name: d.name, status: d.status }))));
log('atrium 전달 기록', atrium('deliveries').split('\n').slice(0, 3));
await closeApp(app);
process.exit(0);
