// P6c 창 시험 I1·I2: 명령 바로 보낸 글이 Thread에 대상·전달 상태·완료 보고로 남는다. 긴 답이면 노드 머리줄에 "출력 보기",
// 마크다운 문서로 보고, 지난 턴으로 넘기고, .md로 저장하고, 바로 답장한다(답장은 Thread에 "출력 답장"으로).
// 준비: s1(claude haiku, mtask-p6c-plain). 실행: cd app && npm run build && MT_E2E_OUT=p6c node test/e2e/p6c-i12.mjs
import fs from 'node:fs';
import { launch, logger, closeApp, shot, sleep, until, call, idOf, sessionBy, waitState, st } from './p6c-lib.mjs';

const log = logger('p6c-i12');
const { app, page } = await launch({ log });
try {
  await page.setViewportSize?.({ width: 1600, height: 1000 }).catch(() => {});
  const s1 = await idOf(page, 's1');
  await waitState(page, 's1', ['ready']);
  await page.evaluate((id) => window.__mt.getState().navigateTo(id), s1);
  await sleep(800);

  // I2: 명령 바에서 보낸다(사람처럼 친다)
  const bar = page.locator('[data-role="command"]');
  await bar.click();
  await bar.fill('@s1 Reply with exactly: ALPHA');
  await page.keyboard.press('Enter');
  await page.locator('[data-action="thread-toggle"]').click();
  await page.locator('[data-role="thread"]').waitFor();
  const itemSel = '[data-role="thread-item"]:last-child';
  await until(async () => (await page.locator(itemSel).getAttribute('data-phase')) === 'done', 90000, 500);
  const item1 = await page.locator(itemSel).innerText();
  log('Thread 줄(ALPHA)', item1.replace(/\s+/g, ' '));
  await shot(page, 'i2-1-thread-done-report', log);

  // I1: 긴 답(마크다운)
  const md = 'Reply with exactly this markdown and nothing else:\n# P6c report\n\n- first item with `code`\n- second item with **bold**\n\n| k | v |\n|---|---|\n| a | 1 |\n\nThe end of the long answer for the output viewer.';
  await call(page, 'session.send', { target: ['s1'], text: md });
  await until(async () => { const s = await sessionBy(page, 's1'); return s.state === 'ready' && s.output && s.output.long; }, 120000, 500);
  await sleep(500);
  const btn = page.locator(`.mt-node[data-session="${s1}"] [data-action="output-open"]`);
  log('출력 보기 단추', await btn.count());
  await shot(page, 'i1-1-node-output-button', log);
  await btn.click();
  await page.locator('[data-role="output"] .mt-output-doc').waitFor();
  await sleep(500);
  const doc = await page.evaluate(() => { const d = document.querySelector('[data-role="output"]'); return { turn: d.dataset.turn, h1: (d.querySelector('.mt-output-doc h1') || {}).innerText, li: [...d.querySelectorAll('.mt-output-doc li')].map((x) => x.innerText), table: !!d.querySelector('.mt-output-doc table'), code: (d.querySelector('.mt-output-doc code') || {}).innerText, prompt: (d.querySelector('[data-role="output-prompt"]') || {}).innerText?.slice(0, 60) }; });
  log('출력 문서', doc);
  await shot(page, 'i1-2-output-markdown', log);

  // 지난 턴으로(◀) → ALPHA, 턴 목록
  await page.locator('[data-action="turn-prev"]').click();
  await until(async () => (await page.locator('[data-role="output"]').getAttribute('data-turn')) === String(Number(doc.turn) - 1), 10000, 200);
  log('지난 턴 답', (await page.locator('[data-role="output"] .mt-output-doc').innerText()).trim());
  await page.locator('[data-action="turn-list"]').click();
  await shot(page, 'i1-3-previous-turn-and-list', log);
  await page.locator(`[data-role="turn-list"] [data-turn="${doc.turn}"]`).click();
  await until(async () => (await page.locator('[data-role="output"]').getAttribute('data-turn')) === doc.turn, 10000, 200);

  // .md 저장
  await page.locator('[data-action="output-save"]').click();
  await page.locator('[data-role="output-saved"]').waitFor();
  const savedText = await page.locator('[data-role="output-saved"]').innerText();
  const file = savedText.replace(/^저장함:\s*/, '').replace(/\s*\(\d+ bytes\)$/, '');
  log('저장', savedText, '있음', fs.existsSync(file), '머리', fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').slice(0, 4).join(' | ') : null);

  // 바로 답장 → Thread에 "출력 답장"과 보고
  const n0 = await st(page, () => window.__mt.getState().thread.size);
  await page.locator('[data-field="output-reply"]').fill('Reply with exactly: BETA');
  await page.locator('[data-action="output-send"]').click();
  await until(async () => (await st(page, () => window.__mt.getState().thread.size)) > n0, 10000, 200);
  await until(async () => (await page.locator(itemSel).getAttribute('data-phase')) === 'done', 90000, 500);
  const item2 = { source: await page.locator(itemSel).getAttribute('data-source'), text: (await page.locator(itemSel).innerText()).replace(/\s+/g, ' ') };
  log('Thread 줄(답장)', item2);
  // 출력 창이 마지막 턴을 보고 있었으므로 새 턴으로 바뀐다
  await until(async () => (await page.locator('[data-role="output"]').getAttribute('data-turn')) === String(Number(doc.turn) + 1), 10000, 300).catch(() => {});
  log('출력 창이 새 턴으로', await page.locator('[data-role="output"]').getAttribute('data-turn'), (await page.locator('[data-role="output"] .mt-output-doc').innerText()).trim().slice(0, 40));
  await shot(page, 'i1-4-reply-from-output-in-thread', log);
  await page.locator('[data-action="output-close"]').click();

  // Thread 결과의 @이름을 누르면 그 세션으로 간다
  await page.evaluate(() => window.__mt.getState().fitAll(0));
  await sleep(500);
  await page.locator(`${itemSel} [data-role="thread-result"] .mt-thread-to`).first().click();
  await sleep(900);
  log('Thread에서 누른 뒤 초점', await st(page, () => { const s = window.__mt.getState(); return s.sessions.get(s.focusId)?.name; }));
  await shot(page, 'i2-2-thread-click-goes-to-session', log);
  log('끝');
} catch (e) { log('실패', e.stack || e.message); await shot(page, 'i12-fail', log).catch(() => {}); process.exitCode = 1; }
await closeApp(app);
process.exit();
