// P3 완료 기준 6(E2): 오래 손대지 않은 세션에 들어가면 마지막 지시, 마지막 답, 지금 상태, 기다리는 질문, 남긴 메모를 먼저 보여준다.
// 떠날 때 한 줄 메모를 남긴다(note.add). 모델을 부르지 않고 대화 기록에서 뽑기만 한다.
// 시험은 "오래"를 20초로 줄여(?briefAfterSec=20) 본다. 기본값은 30분이다.
import { launch, shot, logger, sleep, until, sessionsOf } from './harness.mjs';

const log = logger('e2-brief');
const { app, page } = await launch({ log, query: '?briefAfterSec=20' });
const call = (m, p) => page.evaluate(([mm, pp]) => window.__mt.api.call(mm, pp), [m, p]);
const sum = (name) => page.evaluate((n) => [...window.__mt.getState().sessions.values()].find((s) => s.name === n), name);
const b0 = await sum('b');
log('b 마지막으로 손댄 시각', b0.touchedAt ? `${Math.round((Date.now() - b0.touchedAt) / 1000)}초 전` : '없음');
await until(async () => { const b = await sum('b'); return Date.now() - (b.touchedAt || b.createdAt) > 21000; }, 60000);

// 1) 칩·N·알림과 같은 길(navigateTo)로 b에 들어간다 → 브리핑
const bId = b0.sessionId;
await page.evaluate((id) => window.__mt.getState().navigateTo(id), bId);
await until(() => page.evaluate(() => !!document.querySelector('[data-role="briefing"]')), 10000);
await sleep(600);
const brief = await page.evaluate(() => [...document.querySelectorAll('[data-role="briefing"] .mt-brief-grid > div')].map((d) => d.textContent.slice(0, 120)));
log('브리핑(b)', brief);
const api = await call('session.briefing', { session: 'b' });
log('session.briefing', { state: api.state, lastPrompt: api.lastPrompt, lastAnswer: api.lastAnswer, notes: api.notes.length, touchedAt: api.touchedAt });
await shot(page, 'e2-1-briefing', log);
// 바로 다시 들어가면(방금 손댐) 브리핑을 다시 띄우지 않는다
await page.click('[data-role="briefing"] .mt-card-min');
await page.evaluate((id) => window.__mt.getState().navigateTo(id), bId);
await sleep(800);
log('방금 들어간 세션에 다시 들어감: 브리핑', await page.evaluate(() => !!document.querySelector('[data-role="briefing"]')));

// 2) 노드의 ✎로 한 줄 메모
await page.click(`.mt-node[data-name="b"] [data-action="memo"]`);
await page.fill('.mt-node[data-name="b"] [data-field="memo"]', '다음엔 a1-b.txt 권한 거부 이유부터 확인');
await page.click('.mt-node[data-name="b"] [data-role="memo"] button.primary');
await sleep(600);

// 3) b 터미널에 손대고(글자 하나 넣고 지움) c로 옮기면 "떠나며 한 줄 메모" 줄이 뜬다
await page.click('.mt-node[data-name="b"] .mt-term');
await page.keyboard.type('x'); await sleep(200); await page.keyboard.press('Backspace');
const cId = (await sum('c')).sessionId;
await page.evaluate((id) => window.__mt.getState().navigateTo(id), cId);
await until(() => page.evaluate(() => !!document.querySelector('[data-role="leave-memo"]')), 5000);
log('떠날 때 메모 줄', await page.evaluate(() => document.querySelector('[data-role="leave-memo"] .mt-memo-label').textContent));
await shot(page, 'e2-2-leave-memo-prompt', log);
await page.fill('[data-role="leave-memo"] [data-field="memo"]', '떠나며: 결과 파일은 아직 없음');
await page.click('[data-role="leave-memo"] button.primary');
await sleep(600);
const notes = await call('note.list', { session: 'b' });
log('b 메모', notes.map((n) => n.text));

// 4) b의 ⓘ로 브리핑을 다시 열면 메모가 보인다
await page.evaluate((id) => window.__mt.getState().navigateTo(id), bId);
await sleep(800);
log('ⓘ 단추', await page.locator('.mt-node[data-name="b"] .mt-x[title^="브리핑"]').count());
await page.click(`.mt-node[data-name="b"] .mt-x[title^="브리핑"]`);
await sleep(1000);
log('누른 뒤 store.briefing', await page.evaluate(() => { const b = window.__mt.getState().briefing; return b && { sessionId: b.sessionId.slice(0, 8), why: b.why }; }), await page.evaluate(() => window.__mt.perf.events.filter((e) => e.kind === 'briefing').slice(-3)));
await until(() => page.evaluate(() => !!document.querySelector('.mt-node[data-name="b"] [data-role="briefing"]')), 5000);
await sleep(500);
log('브리핑의 메모', await page.evaluate(() => [...document.querySelectorAll('.mt-node[data-name="b"] [data-role="briefing"] .mt-note')].map((d) => d.textContent)));
await shot(page, 'e2-3-briefing-with-notes', log);
await app.close();
