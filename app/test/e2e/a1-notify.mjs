// P3 완료 기준 2(A1): 세션이 waiting이 되면 Windows 알림을 띄우고, 누르면 창이 그 노드로 간다. 같은 대기에 거듭 띄우지 않는다.
// 창에 초점이 있고 그 노드가 보이면 띄우지 않는다. OS 알림은 꼭 필요한 만큼(1개)만 띄운다.
// 사용자 화면의 초점을 빼앗지 않으려고 "초점이 있다"는 document.hasFocus를 바꿔 흉내 낸다(규칙 자체는 단위 시험).
import { launch, shot, logger, sleep, until, sessionsOf } from './harness.mjs';

const log = logger('a1-notify');
const { app, page } = await launch({ log });
const call = (m, p) => page.evaluate(([mm, pp]) => window.__mt.api.call(mm, pp), [m, p]);
const S = async (name) => (await sessionsOf(page)).find((s) => s.name === name);
const mainNotes = () => app.evaluate(() => global.__mtNotifications.map((n) => ({ sessionId: n.sessionId, key: n.key, shown: n.shown, clicked: n.clicked })));
const notifyLog = () => page.evaluate(() => window.__mt.notifyLog.map((x) => ({ name: x.name, key: x.key, notify: x.notify, why: x.why, result: x.result })));
const idOf = async (name) => (await S(name)).id;

// 1) b가 화면 밖에 있을 때 내 차례가 되면 알림을 띄운다
await page.evaluate(() => window.__mt.getState().setViewport({ x: 1200, y: 200, zoom: 0.5 })); // 세션 노드는 화면 밖(왼쪽 카드만 보임)
await sleep(800);
log('창 초점(실제)', await page.evaluate(() => document.hasFocus()));
await call('session.send', { text: '@b Use the Write tool to create a1-b.txt containing hi. Use no other tool.' });
await until(async () => (await S('b')).state === 'waiting', 90000);
await until(async () => (await notifyLog()).some((x) => x.name === 'b'), 10000);
await until(async () => (await mainNotes()).some((n) => n.shown), 10000).catch(() => {});
log('알림 판단(b)', (await notifyLog()).filter((x) => x.name === 'b'));
log('main 알림 기록', await mainNotes());
await shot(page, 'a1-1-before-click', log);

// 2) 알림을 누른다(main의 알림 객체에 click을 낸다) → 창이 b로 간다
const bId = await idOf('b');
await app.evaluate(({}, id) => { const n = global.__mtNotifications.find((x) => x.sessionId === id); n.note.emit('click'); }, bId);
await sleep(1200);
const after = await page.evaluate((id) => { const el = document.querySelector(`.react-flow__node[data-id="${id}"]`); const r = el.getBoundingClientRect(); const c = document.querySelector('.mt-canvas').getBoundingClientRect(); return { focusId: window.__mt.getState().focusId === id, nodeRect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], canvas: [Math.round(c.width), Math.round(c.height)], card: !!el.querySelector('.mt-card') }; }, bId);
log('누른 뒤', after, 'main', await mainNotes());
await shot(page, 'a1-2-after-click-navigated', log);

// 3) 같은 대기에 다시 띄우지 않는다: 상태가 여러 번 갱신돼도 b의 판단은 한 번
await call('session.markSeen', { session: 'b' }); await sleep(1500);
log('같은 대기 판단 횟수(b)', (await notifyLog()).filter((x) => x.name === 'b').length, 'main 알림 수', (await mainNotes()).length);
await call('session.answer', { session: 'b', choice: 'reject', toolUseId: (await S('b')).ask.toolUseId });
await until(async () => (await S('b')).state !== 'waiting', 30000);

// 4) 창에 초점이 있고 노드가 보이면 띄우지 않는다
await page.evaluate(() => { document.hasFocus = () => true; }); // 흉내
const cId = await idOf('c');
await page.evaluate((id) => window.__mt.getState().navigateTo(id), cId);
await sleep(1000);
await call('session.send', { text: '@c Use the Write tool to create a1-c.txt containing hi. Use no other tool.' });
await until(async () => (await S('c')).state === 'waiting', 90000);
await until(async () => (await notifyLog()).some((x) => x.name === 'c'), 10000);
await sleep(800);
log('알림 판단(c, 초점 있고 보임)', (await notifyLog()).filter((x) => x.name === 'c'), 'main 알림 수', (await mainNotes()).length);
await shot(page, 'a1-3-visible-no-notification', log);
await call('session.answer', { session: 'c', choice: 'reject', toolUseId: (await S('c')).ask.toolUseId });
await until(async () => (await S('c')).state !== 'waiting', 30000);
await sleep(500);
await app.close();

// 5) 창을 다시 열어도 이미 알린 대기에는 다시 띄우지 않는다(localStorage). 지금은 기다리는 세션이 없으므로 기록만 확인한다.
const r2 = await launch({ log });
log('다시 연 창의 알린 대기 기록', await r2.page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('mt.notified') || '{}'))));
await r2.app.close();
