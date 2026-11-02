// 완료 기준 6: 터미널 입력 규칙(E4, ARCH 7.2)을 실제 Electron 창에서 본다.
//  (1) 붙여넣기를 괄호 붙여넣기로 감싸 여러 줄이 한 번에 제출된다
//  (2) 휠이 SGR 마우스 시퀀스로 바뀌어 Claude Code가 스스로 스크롤한다(herdr 화면과 같다)
//  (3) unicode11: 한글·이모지 줄이 herdr 화면 모델과 줄 단위로 같다
//  (4) 노드 크기를 바꾸면 패널 크기(프레임 w·h)와 xterm 크기가 맞는다
// 세션 a를 쓴다(턴 셋, 짧게).
import { launch, shot, logger, sessionsOf, waitState, until, sleep } from './harness.mjs';

const log = logger('c6-input');
const { app, page } = await launch({ log });
const A = (await sessionsOf(page)).find((s) => s.name === 'a').id;
const xtermLines = () => page.evaluate((id) => { const t = window.__mt.terms.get(id); const b = t.buffer.active; const out = []; for (let r = 0; r < t.rows; r++) out.push(b.getLine(b.viewportY + r).translateToString(true)); return out; }, A);
const herdrLines = () => page.evaluate((id) => window.__mt.api.call('terminal.snapshot', { session: id, format: 'text' }).then((r) => r.text.split('\n').map((l) => l.replace(/\s+$/, ''))), A);
const hooks = (ev) => page.evaluate(([id, e]) => window.__mt.api.call('session.events', { session: id, limit: 80 }).then((x) => x.filter((y) => y.kind === 'hook' && y.data.ev === e)), [A, ev]);
async function compare(label) {
  const [x, h] = [await xtermLines(), await herdrLines()];
  const n = Math.max(x.length, h.length);
  const diff = [];
  for (let i = 0; i < n; i++) if ((x[i] || '').replace(/\s+$/, '') !== (h[i] || '')) diff.push({ row: i, xterm: x[i], herdr: h[i] });
  log(`${label}: xterm ${x.length}줄, herdr ${h.length}줄, 다른 줄 ${diff.length}`, diff.slice(0, 4));
  return diff.length;
}
async function sendCmd(text) {
  await page.click('[data-role=command]');
  await page.fill('[data-role=command]', text);
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
}

await page.evaluate((id) => window.__mt.getState().navigateTo(id, { focusTerminal: true }), A);
await sleep(2000);

// (1) 붙여넣기
const before = (await hooks('UserPromptSubmit')).length;
log('시작 전 a의 제출 수', before);
const pasteText = 'Reply with exactly: paste-ok\nline two of the paste\nline three of the paste';
await app.evaluate(({ clipboard }, t) => clipboard.writeText(t), pasteText);
await page.click(`.mt-node[data-name="a"] .mt-term`);
await page.keyboard.press('Control+V');
await sleep(1200);
log('붙여 넣은 뒤 입력칸', (await xtermLines()).filter((l) => /paste|❯/.test(l)).map((l) => l.trim()));
log('붙여 넣은 뒤 제출 수(늘면 안 됨)', (await hooks('UserPromptSubmit')).length - before);
await shot(page, 'c6-paste-in-input', log);
await page.keyboard.press('Enter');
await until(async () => (await hooks('UserPromptSubmit')).length > before, 30000);
await sleep(2000); // ready → working으로 바뀔 시간
await waitState(page, 'a', 'ready', 60000);
const ups = (await hooks('UserPromptSubmit')).slice(before);
log('Enter 뒤 제출', ups.length, '번', ups.map((u) => u.data.prompt));
log('답', (await sessionsOf(page)).find((s) => s.name === 'a').lastAnswer);

// (2) 휠
await sendCmd('@a Output the integers from 1 to 120, one per line, and nothing else.');
await until(async () => (await hooks('UserPromptSubmit')).length > before + 1, 30000);
await sleep(2000); // ready → working으로 바뀔 시간
await waitState(page, 'a', 'ready', 90000);
await sleep(1000);
const nums = (lines) => lines.map((l) => l.trim()).filter((l) => /^\d+$/.test(l)).map(Number);
const r0 = nums(await xtermLines());
log('휠 전 보이는 숫자', r0[0], '~', r0[r0.length - 1]);
const tb = await page.locator('.mt-node[data-name="a"] .mt-term').boundingBox();
await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2);
await page.mouse.wheel(0, -500);
await sleep(1000);
const r1 = nums(await xtermLines());
log('휠 위로 5번 뒤', r1[0], '~', r1[r1.length - 1]);
await compare('휠 위로 뒤 xterm과 herdr 화면');
await shot(page, 'c6-wheel-up', log);
await page.mouse.wheel(0, 500);
await page.mouse.wheel(0, 500);
await sleep(1000);
const r2 = nums(await xtermLines());
log('휠 아래로 뒤', r2[0], '~', r2[r2.length - 1]);
log('판 배율은 그대로(휠이 판을 확대하지 않음)', await page.evaluate(() => document.querySelector('.react-flow__viewport').style.transform));

// (3) unicode11
await sendCmd('@a Reply with exactly this single line and nothing else: 한글 ✅ 🎉 끝|');
await until(async () => (await hooks('UserPromptSubmit')).length > before + 2, 30000);
await sleep(2000); // ready → working으로 바뀔 시간
await waitState(page, 'a', 'ready', 90000);
await sleep(1000);
log('이모지 줄', (await xtermLines()).filter((l) => l.includes('🎉')).map((l) => l.trim()));
await compare('unicode11 xterm과 herdr 화면');
log('unicode 버전', await page.evaluate((id) => window.__mt.terms.get(id).unicode.activeVersion, A));
await shot(page, 'c6-unicode11', log);

// (4) 노드 크기 바꾸기
const size = () => page.evaluate((id) => { const t = window.__mt.terms.get(id); const p = window.__mt.perf.snapshot().terminals[id]; return { xterm: `${t.cols}x${t.rows}`, asked: `${p.cols}x${p.rows}`, frame: `${p.frameW}x${p.frameH}` }; }, A);
log('크기 바꾸기 전', await size(), 'herdr 줄 수', (await herdrLines()).length);
await page.click('.mt-node[data-name="a"] .mt-node-head .mt-node-name');
const h = await page.locator('.react-flow__resize-control.bottom.right').first().boundingBox();
await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
await page.mouse.down();
await page.mouse.move(h.x + 180, h.y + 120, { steps: 12 });
await page.mouse.up();
await sleep(1500);
log('크기 바꾼 뒤', await size(), 'herdr 줄 수', (await herdrLines()).length, '저장된 노드', await page.evaluate((id) => window.__mt.api.call('board.get').then((b) => b.nodes.find((n) => n.session_id === id)), A));
await compare('크기 바꾼 뒤 xterm과 herdr 화면');
await shot(page, 'c6-resized', log);
await app.close();
