// 덧붙인 확인: 노드 터미널에서 Ctrl+G를 막는다(P2에서 막기로 정함, E9 2.4: 누르면 메모장이 뜬다). 명령 바의 @ 대상 메뉴.
import { execFileSync } from 'node:child_process';
import { launch, shot, logger, sessionsOf, sleep } from './harness.mjs';

const log = logger('misc');
const notepads = () => (execFileSync('tasklist', ['/FI', 'IMAGENAME eq notepad.exe', '/FO', 'CSV', '/NH'], { encoding: 'utf8' }).match(/notepad\.exe/gi) || []).length;
const { app, page } = await launch({ log });
const A = (await sessionsOf(page)).find((s) => s.name === 'a').id;
await page.evaluate(() => { window.__sent = []; const o = window.__mt.api.call.bind(window.__mt.api); window.__mt.api.call = (m, p) => { if (m === 'terminal.input') window.__sent.push(p.data); return o(m, p); }; });
await page.evaluate((id) => window.__mt.getState().navigateTo(id, { focusTerminal: true }), A);
await sleep(2000);
await page.click('.mt-node[data-name="a"] .mt-term');
const n0 = notepads();
await page.keyboard.press('Control+g');
await sleep(1500);
log('Ctrl+G', { 보낸것: await page.evaluate(() => window.__sent), 안내: await page.evaluate(() => document.querySelector('.mt-term-hint')?.textContent || null), 메모장_전: n0, 메모장_후: notepads() });
await shot(page, 'misc-ctrl-g-blocked', log);

await page.click('[data-role=command]');
await page.keyboard.type('@');
await sleep(300);
log('@ 메뉴', await page.evaluate(() => [...document.querySelectorAll('.mt-mention-item')].map((x) => x.textContent)));
await page.keyboard.type('b');
await sleep(200);
log('@b 메뉴', await page.evaluate(() => [...document.querySelectorAll('.mt-mention-item')].map((x) => x.textContent)));
await shot(page, 'misc-mention-menu', log);
await page.keyboard.press('Tab');
log('Tab 뒤 입력칸', JSON.stringify(await page.inputValue('[data-role=command]')));
await page.fill('[data-role=command]', '');
await app.close();
