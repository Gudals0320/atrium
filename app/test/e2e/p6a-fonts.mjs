// P6a 함께 고칠 것: 승인 카드의 고정폭 글꼴에서 경로의 \가 ₩로 보이던 문제(한글 글꼴 대체). 카드 글을 실제로 그린 글꼴을 CDP로 본다. MT_E2E_OUT=p6a
import { logger, closeApp } from './harness.mjs';
import { launch, atrium, sessionBy, idOf, until, sleep, shot } from './p6a-lib.mjs';

const log = logger('p6a-fonts');
const { app, page } = await launch({ log });
await sleep(1500);
atrium('send', '@help', "Run exactly this one shell command with the Bash tool: echo hi > 'C:\\Workspace\\mtask-p6a-plain\\p6a-font.txt'"); // 쓰기라 권한을 묻는다. 작은따옴표 안이라 \는 그대로
await until(async () => (await sessionBy(page, 'help')).state === 'waiting', 90000, 1000);
await page.evaluate((id) => window.__mt.getState().navigateTo(id), await idOf(page, 'help'));
await sleep(2500);
const cdp = await page.context().newCDPSession(page);
await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
const { root } = await cdp.send('DOM.getDocument', { depth: -1 });
for (const sel of ['.mt-node[data-name="help"] .mt-card-text', '.mt-node[data-name="help"] .mt-card-plan', '.mt-node[data-name="help"] .mt-card-sub']) {
  const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: sel });
  if (!nodeId) { log(sel, '없음'); continue; }
  const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
  const text = await page.evaluate((s) => (document.querySelector(s) || {}).innerText, sel);
  const fam = await page.evaluate((s) => getComputedStyle(document.querySelector(s)).fontFamily, sel);
  log(sel, { text: String(text).slice(0, 120), fontFamily: fam, platformFonts: fonts });
}
// 고치기 전 .mt-card-plan(글꼴 지정 없는 pre = 브라우저 기본 고정폭)과 고친 뒤를 나란히 그려 본다
await page.evaluate(() => { const d = document.createElement('div'); d.id = 'fonttest'; d.style.cssText = 'position:fixed;left:10px;top:60px;z-index:99;background:#222;padding:8px;font-size:16px'; d.innerHTML = '<pre id="old" style="font-family: monospace">old: C:\\Workspace\\multitask</pre><pre id="new" class="mt-card-plan">new: C:\\Workspace\\multitask</pre>'; document.body.appendChild(d); });
await sleep(400);
const { root: root2 } = await cdp.send('DOM.getDocument', { depth: -1 });
for (const sel of ['#old', '#new']) { const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root2.nodeId, selector: sel }); const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId }); log(sel, fonts); }
const box = await page.locator('#fonttest').boundingBox();
await page.screenshot({ path: '../experiments/p6a/fix-3-backslash-old-vs-new.png', clip: box });
await page.evaluate(() => document.getElementById('fonttest').remove());
const card = await page.locator('.mt-node[data-name="help"] .mt-card').boundingBox();
if (card) await page.screenshot({ path: '../experiments/p6a/fix-1-backslash-card.png', clip: card });
await shot(page, 'fix-2-backslash-card-node', log);
atrium('answer', 'help', 'reject');
await closeApp(app);
process.exit(0);
