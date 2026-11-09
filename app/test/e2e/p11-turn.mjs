// P11 창 시험(완료 기준 2): 내 차례 흐름이 그대로다. 기다리는 세션(rev)이 위 오른쪽 "내 차례" 알약과 노드 빛으로 보이고,
// 알약 목록이나 N으로 그 노드에 가며, 콘솔 아래쪽 승인 줄로 허용·거부한다. p11-scene.mjs setup 뒤의 판(rev가 Bash 권한을 묻고 기다림)에서 돈다.
// 사용(app 폴더에서): MT_E2E_BOARD=p11 MT_E2E_OUT=p11 node test/e2e/p11-turn.mjs
import path from 'node:path';
import { launch, closeApp, logger, sleep, until, call, state, writeJson, atrium, OUT } from './p10-lib.mjs';

const log = logger('p11-turn');
const result = { steps: [] };
const step = (name, ok, data = {}) => { result.steps.push({ name, ok, ...data }); log(`${ok ? '통과' : '실패'}: ${name}`, data); };
const shot = async (page, name) => { const f = path.join(OUT, `${name}.png`); await page.screenshot({ path: f }); log('찍음', f); };
const rev = async (page) => (await state(page)).sessions.find((x) => x.name === 'rev');
const away = (page) => page.evaluate(() => window.__mt.getState().setViewport({ x: 1400, y: 900, zoom: 0.3 }));
const looks = (page) => page.evaluate(() => {
  const pill = document.querySelector('[data-role="inbox"]');
  const node = document.querySelector('.mt-node[data-name="rev"]');
  const cs = node && getComputedStyle(node);
  return { pill: pill && { count: pill.dataset.count, hot: pill.classList.contains('hot'), text: pill.innerText.replace(/\s+/g, ' '), border: getComputedStyle(pill).borderColor },
    node: node && { face: node.dataset.face, border: cs.borderTopColor, shadow: cs.boxShadow, outline: cs.outlineStyle !== 'none' ? cs.outlineColor : null, anim: cs.animationName } };
});

const { app, page } = await launch({ log });
try {
  await call(page, 'settings.set', { key: 'language', value: 'ko' }); // P16: 이 시험은 화면 글을 한국어로 본다(기본은 영어)
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1528, 960));
  if (await page.$('[data-role="sidebar"]')) await page.click('[data-action="sidebar"]');
  let r = await rev(page);
  if (!r || r.state !== 'waiting') {
    if (r) { try { atrium('send', '@rev', 'Use the Bash tool to run exactly this command and nothing else: npm test -- pay'); } catch (e) { log('send', e.message.split('\n')[0]); } }
    await until(async () => { const x = await rev(page); return x && x.state === 'waiting'; }, 120000, 1500);
  }
  // 1. 위 오른쪽 알약과 노드 빛
  await away(page); await sleep(1200);
  let v = await looks(page);
  step('내 차례 알약이 주황(hot)이고 1을 센다', v.pill.hot && v.pill.count === '1', v.pill);
  step('멀리서도 기다리는 노드는 주황 고리(깜빡임)', !!v.node.outline && v.node.anim === 'mt-wait', v.node);
  await shot(page, 'p11-turn-1-away');

  // 2. 알약을 눌러 목록에서 rev로 간다
  await page.click('[data-role="inbox"]');
  await page.waitForSelector('[data-role="inbox-list"] .mt-chip.need[data-name="rev"]', { timeout: 5000 });
  const row = await page.$eval('[data-role="inbox-list"] .mt-chip.need[data-name="rev"]', (e) => e.innerText.replace(/\s+/g, ' '));
  step('목록 줄에 무엇을 묻는지와 기다린 시간', /권한/.test(row) && /(초|분)/.test(row), { row });
  await shot(page, 'p11-turn-2-list');
  await page.click('[data-role="inbox-list"] .mt-chip.need[data-name="rev"]');
  await sleep(1500);
  let s = await state(page);
  v = await looks(page);
  step('목록 줄을 누르면 rev로 간다(초점, 가까이 얼굴)', s.focus === 'rev' && v.node.face === 'close', { focus: s.focus, face: v.node.face });
  step('가까이서 기다리는 노드는 응답 필요 색(P93: 노랑) 테두리와 빛', /255, 224, 61/.test(v.node.border) && /255, 224, 61/.test(v.node.shadow), v.node);
  await sleep(1500);
  await shot(page, 'p11-turn-3-at-rev');

  // 3. 멀리 갔다가 N으로 다시 간다
  await away(page); await sleep(800);
  await page.mouse.click(760, 600); // 캔버스 빈 곳(초점을 입력칸 밖으로)
  await page.keyboard.press('n'); // 내 차례가 하나면 N은 늘 그 세션으로 간다(lib/faces.js nextTarget)
  await sleep(1500);
  s = await state(page);
  step('N을 누르면 rev로 간다', s.focus === 'rev', { focus: s.focus });

  // 4. 허용. P104: 판의 승인 줄은 없다(사람은 터미널에서 답한다). 시험은 CLI와 같은 session.answer로 답한다
  const bars = await page.$$eval('.mt-node[data-name="rev"] [data-role="approval"], .mt-node[data-name="rev"] .mt-answer', (l) => l.length);
  step('P104: rev 노드에 승인 줄이 없다', bars === 0, { bars });
  await shot(page, 'p11-turn-4-bar');
  await page.evaluate(() => { const s = [...window.__mt.getState().sessions.values()].find((x) => x.name === 'rev'); return window.__mt.api.call('session.answer', { session: s.sessionId, toolUseId: s.ask && s.ask.toolUseId, choice: 1 }); });
  await until(async () => { const x = await rev(page); return x && x.state !== 'waiting'; }, 30000, 500);
  r = await rev(page);
  step('허용을 누르면 rev가 기다림을 벗어난다', r.state !== 'waiting', { state: r.state });
  await until(async () => { const x = await rev(page); return x && (x.state === 'ready' || x.state === 'waiting'); }, 120000, 1000);
  await sleep(1000);
  v = await looks(page);
  step('기다림이 풀리면 알약이 차분해진다(0)', v.pill.count === '0' && !v.pill.hot, v.pill);
  await shot(page, 'p11-turn-5-allowed');

  // 5. 다시 묻게 하고 "거부"
  r = await rev(page);
  if (r.state !== 'waiting') atrium('send', '@rev', 'Use the Bash tool to run exactly this command and nothing else: npm test -- pay --again');
  await until(async () => { const x = await rev(page); return x && x.state === 'waiting'; }, 120000, 1000);
  await sleep(1500);
  await shot(page, 'p11-turn-6-asked-again');
  await page.evaluate(() => { const s = [...window.__mt.getState().sessions.values()].find((x) => x.name === 'rev'); return window.__mt.api.call('session.answer', { session: s.sessionId, toolUseId: s.ask && s.ask.toolUseId, choice: 'reject' }); });
  await until(async () => { const x = await rev(page); return x && x.state !== 'waiting'; }, 30000, 500);
  r = await rev(page);
  step('거부를 누르면 rev가 기다림을 벗어난다', r.state !== 'waiting', { state: r.state });
  await sleep(2500);
  await shot(page, 'p11-turn-7-rejected');
} finally { await closeApp(app); }
result.ok = result.steps.every((x) => x.ok);
writeJson('p11-turn.json', result);
log(result.ok ? '모두 통과' : `실패 ${result.steps.filter((x) => !x.ok).map((x) => x.name).join(', ')}`);
process.exit(result.ok ? 0 : 1);
