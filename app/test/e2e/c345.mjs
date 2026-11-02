// 완료 기준 3, 4, 5: 상태 필, 내 차례 줄과 N, 명령 바의 @이름 전달 상태, 승인 카드(권한 승인·거부, 단일 선택 질문)
// 세션 a~d가 판에 ready로 있어야 한다(c2-spawn.mjs, c1-canvas.mjs 뒤).
import { launch, shot, logger, sessionsOf, waitState, waitFor, sleep } from './harness.mjs';

const log = logger('c345');
const { app, page } = await launch({ log });
await page.evaluate(() => {
  window.__dlog = []; window.__slog = [];
  window.__mt.api.on('delivery', (d) => window.__dlog.push({ t: Date.now(), name: d.name, id: d.deliveryId, status: d.status, reason: d.reason }));
  window.__mt.api.on('session.state', (d) => window.__slog.push({ t: Date.now(), name: d.name, from: d.from, to: d.to, cause: d.cause }));
});
const fit = async () => { await page.locator('.react-flow__controls-fitview').click(); await sleep(1500); };
const pills = () => page.evaluate(() => [...document.querySelectorAll('.mt-node')].map((n) => `${n.dataset.name}:${n.querySelector('.mt-pill').dataset.state}${n.querySelector('[data-flag=unseen]') ? '+검토대기' : ''}`).join(' '));
async function command(text) {
  await page.click('[data-role=command]');
  await page.keyboard.type(text, { delay: 5 });
  await page.keyboard.press('Escape'); // @ 메뉴가 떠 있으면 닫힌다(글은 남는다)
  await page.click('[data-role=command]');
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
}
await fit();

// ---- 4. 명령 바에서 @a로 보내기: 전달 상태가 대기 → 보냄 → 제출 확인으로 바뀐다
await command('@a Reply with exactly: alpha-ok');
await waitFor(page, () => window.__dlog.some((d) => d.name === 'a' && d.status === 'confirmed'));
await shot(page, 'c4-delivery-confirmed', log);
await waitState(page, 'a', 'ready');
await waitFor(page, () => [...window.__mt.getState().sessions.values()].some((s) => s.name === 'a' && s.unseen));
log('a 전달 상태 차례', await page.evaluate(() => window.__dlog.filter((d) => d.name === 'a').map((d) => d.status + (d.reason ? `(${d.reason})` : ''))));
log('필', await pills());
await shot(page, 'c3-review-pending', log);

// ---- 3·5. 권한 요청 둘(b, c)과 질문 하나(d)로 waiting 만들기
await command('@b Use the Write tool to create perm-b.txt containing hi. Use no other tool.');
await sleep(300);
await command('@c Use the Write tool to create perm-c.txt containing hi. Use no other tool.');
await sleep(300);
await command('@d Use the AskUserQuestion tool to ask me which color I prefer, with exactly the options Red, Green and Blue. Use no other tool.');
for (const n of ['b', 'c', 'd']) { await waitState(page, n, 'waiting', 90000); log(`${n}: waiting`); }
await waitFor(page, () => ['b', 'c'].every((n) => [...window.__mt.getState().sessions.values()].find((s) => s.name === n).ask.choices));
await waitFor(page, () => [...window.__mt.getState().sessions.values()].filter((s) => s.state === 'waiting').every((s) => !s.estimate), null, 15000).catch(() => log('추정 표시가 남아 있다'));
// 막힌 b에 하나 더 보내면 대기열에 남는다(B1 규칙 2)
await command('@b Reply with exactly: queued-ok');
await waitFor(page, () => window.__dlog.some((d) => d.name === 'b' && d.status === 'queued' && d.reason === 'waiting'));
await sleep(500);
log('필', await pills());
log('내 차례 칩', await page.evaluate(() => [...document.querySelectorAll('.mt-chip.need')].map((c) => c.textContent)));
const sess = await sessionsOf(page);
for (const s of sess.filter((x) => x.state === 'waiting')) log(`${s.name} 묻는 내용`, { kind: s.ask.kind, tool: s.ask.tool, summary: s.ask.summary, question: s.ask.question, choices: s.ask.choices && s.ask.choices.map((c) => `${c.n}.${c.label}`), questions: s.ask.questions });
await shot(page, 'c3-needs-you-cards', log);

// ---- 3. N: 노드를 옮기지 않고 화면이 다음 세션으로
const boardBefore = await page.evaluate(() => window.__mt.api.call('board.get').then((b) => b.nodes));
await page.click('.react-flow__pane', { position: { x: 10, y: 10 } }); // 초점을 판으로
const visited = [];
for (let i = 0; i < 4; i++) {
  await page.keyboard.press('n');
  await sleep(900);
  const r = await page.evaluate(() => { const st = window.__mt.getState(); return { focus: st.sessions.get(st.focusId)?.name, vp: document.querySelector('.react-flow__viewport').style.transform }; });
  visited.push(r.focus);
  log(`N ${i + 1}번째 → ${r.focus}`, r.vp);
  if (i < 3) await shot(page, `c3-n-${i + 1}-${r.focus}`, log);
}
const boardAfter = await page.evaluate(() => window.__mt.api.call('board.get').then((b) => b.nodes));
log('N 순서', visited.join(' → '), '노드 자리 그대로', JSON.stringify(boardBefore) === JSON.stringify(boardAfter));

// ---- 5. 승인 카드에서 답하기: b 승인(1), c 거부(No → esc), d 단일 선택(2. Green)
await fit();
await page.click('.mt-node[data-name="b"] .mt-card button[data-choice="1"]');
log('b 승인 누름');
await page.click('.mt-node[data-name="c"] .mt-card button[data-choice="reject"]');
log('c 거부 누름');
await page.click('.mt-node[data-name="d"] .mt-card button[data-choice="2"]');
log('d 2번(Green) 누름');
await sleep(800);
await shot(page, 'c5-answered', log);
for (const n of ['b', 'c', 'd']) { await waitState(page, n, ['ready', 'working'], 60000); }
await waitFor(page, () => window.__dlog.some((d) => d.name === 'b' && d.status === 'confirmed' && window.__dlog.filter((x) => x.name === 'b' && x.status === 'confirmed').length >= 2), null, 90000).catch(() => log('b의 대기열 글이 아직 확인 안 됨'));
for (const n of ['b', 'c', 'd']) await waitState(page, n, 'ready', 60000);
const ev = await page.evaluate(async () => {
  const out = {};
  for (const n of ['b', 'c', 'd']) {
    const e = await window.__mt.api.call('session.events', { session: n, limit: 60 });
    out[n] = e.filter((x) => x.kind === 'answer' || (x.kind === 'hook' && ['PermissionRequest', 'PreToolUse', 'PostToolUse', 'Stop', 'UserPromptSubmit'].includes(x.data.ev)) || x.kind === 'state')
      .slice(-14).map((x) => (x.kind === 'answer' ? `answer ${x.data.label} keys=${x.data.steps.join(',')}` : x.kind === 'hook' ? `hook ${x.data.ev}${x.data.tool ? `(${x.data.tool})` : ''}${x.data.lastAnswer ? ` 답=${x.data.lastAnswer}` : ''}` : `state ${x.data.from}→${x.data.to} (${x.data.cause})`));
  }
  return out;
});
for (const [n, lines] of Object.entries(ev)) log(`${n} 기록`, lines);
log('b 전달 차례', await page.evaluate(() => window.__dlog.filter((d) => d.name === 'b').map((d) => `${d.id.slice(0, 6)} ${d.status}${d.reason ? `(${d.reason})` : ''}`)));
log('마지막 답', (await sessionsOf(page)).map((s) => `${s.name}: ${String(s.lastAnswer || '').replace(/\s+/g, ' ').slice(0, 80)}`));
log('필', await pills());
await shot(page, 'c5-after', log);
log('상태 변화', await page.evaluate(() => window.__slog.map((x) => `${x.name} ${x.from}→${x.to} (${x.cause})`)));
await app.close();
