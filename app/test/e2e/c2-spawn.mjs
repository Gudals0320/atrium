// 완료 기준 2: 창에서 claude 세션 4개를 시작하고, 노드마다 제어기 프레임을 xterm.js로 그리고, 노드에 글을 친다.
// 시험 세션은 --model haiku(새 세션 대화상자의 개발용 기본값). 노드에 친 글은 지운다(턴을 돌리지 않는다).
import { launch, shot, logger, sessionsOf, waitState, sleep } from './harness.mjs';

const log = logger('c2-spawn');
const NAMES = (process.argv[2] || 'a,b,c,d').split(',');
const { app, page } = await launch({ log });

for (const name of NAMES) {
  if ((await sessionsOf(page)).some((s) => s.name === name)) { log(`${name}: 이미 있음`); continue; }
  await page.click('[data-action=spawn]');
  await page.fill('[data-field=name]', name);
  log(`${name}: 대화상자 값`, await page.evaluate(() => ({ cwd: document.querySelector('[data-field=cwd]').value, model: document.querySelector('[data-field=model]').value })));
  if (name === NAMES[0]) await shot(page, 'c2-spawn-dialog', log);
  await page.click('[data-action=spawn-submit]');
  await page.waitForSelector(`.mt-node[data-name="${name}"]`, { timeout: 30000 });
  log(`${name}: 노드 생김`);
}
for (const name of NAMES) { await waitState(page, name, 'ready', 60000); log(`${name}: ready`); }

// 넷이 다 보이게(가까이 얼굴 기준 배율 0.5 이상) 화면을 맞춘다
await page.evaluate(() => window.__mt.getState().navigateTo && null);
await page.locator('.react-flow__controls-fitview').click();
await sleep(2500);
log('배율', await page.evaluate(() => document.querySelector('.react-flow__viewport').style.transform));
log('붙은 제어기', await page.evaluate(() => ({ attached: window.__mt.getState().attached.length, terminals: window.__mt.perf.snapshot().terminals })));
await shot(page, 'c2-four-nodes', log);

// 각 노드 터미널의 xterm 버퍼에 Claude Code 화면이 그려졌는지
const screens = await page.evaluate(() => {
  const out = {};
  for (const [id, t] of window.__mt.terms) {
    const b = t.buffer.active; const lines = [];
    for (let i = 0; i < t.rows; i++) { const l = b.getLine(i); if (l) lines.push(l.translateToString(true)); }
    const name = window.__mt.getState().sessions.get(id).name;
    out[name] = { cols: t.cols, rows: t.rows, text: lines.filter((l) => l.trim()).slice(0, 4).concat(lines.filter((l) => l.trim()).slice(-3)) };
  }
  return out;
});
log('xterm 화면', screens);

// 노드에 글 치기: 첫 노드 터미널을 눌러 초점을 주고 키보드로 친 뒤, 화면에 나타나는지 보고 지운다
const first = NAMES[0];
const id = (await sessionsOf(page)).find((s) => s.name === first).id;
await page.evaluate((i) => window.__mt.getState().navigateTo(i, { focusTerminal: true }), id);
await sleep(1500);
await page.click(`.mt-node[data-name="${first}"] .mt-term`);
await page.keyboard.type('typed-from-node 한글', { delay: 30 });
await sleep(800);
const typed = await page.evaluate((i) => { const t = window.__mt.terms.get(i); const b = t.buffer.active; const out = []; for (let r = 0; r < t.rows; r++) { const l = b.getLine(r).translateToString(true); if (l.includes('typed-from-node')) out.push(l.trim()); } return out; }, id);
log('노드에 친 글이 화면에', typed);
await shot(page, 'c2-typed-in-node', log);
for (let i = 0; i < 'typed-from-node 한글'.length; i++) await page.keyboard.press('Backspace');
await sleep(500);
log('지운 뒤', await page.evaluate((i) => { const t = window.__mt.terms.get(i); const b = t.buffer.active; for (let r = 0; r < t.rows; r++) if (b.getLine(r).translateToString(true).includes('typed-from-node')) return 'still there'; return 'cleared'; }, id));
log('세션', (await sessionsOf(page)).map((s) => `${s.name}=${s.state}`).join(' '));
await app.close();
