// P6a 완료 기준 2·3(H2·H3·H4): 아래쪽 워크스페이스 단추와 검색으로 영역과 노드에 간다(이름, 질문, 요청, 답).
// 전체를 줄여 보아도 질문과 마지막 요청이 읽힌다. 노드를 누르면 바로 들어가 터미널에 입력할 수 있다(붙기 전에 친 글도). MT_E2E_OUT=p6a
import { logger, closeApp } from './harness.mjs';
import { launch, atrium, sessionBy, rectOf, vp, fitAll, nodeScreen, regions, until, sleep, shot } from './p6a-lib.mjs';

const log = logger('p6a-h234');
const { app, page } = await launch({ log });
await sleep(1500);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const centered = async (name) => { const r = await nodeScreen(page, name); const c = await page.evaluate(() => { const b = document.querySelector('.mt-canvas').getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }); return r && Math.abs(r.cx - c.x) < 40 && Math.abs(r.cy - c.y) < 40; };

for (const n of ['rev', 'help']) log(`@${n}`, (await sessionBy(page, n)).state, JSON.stringify((await sessionBy(page, n)).ask || null).slice(0, 160));

// ---- H2: 아래쪽 워크스페이스 단추 ----
await fitAll(page);
for (const name of ['r1', 'two', 'multitask']) {
  await page.click(`.mt-wsbtn[data-name="${name}"]`);
  await sleep(900);
  const reg = (await regions(page)).find((r) => r.name === name);
  const canvas = await page.evaluate(() => { const b = document.querySelector('.mt-canvas').getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; });
  const inside = reg.rect.x >= canvas.x - 2 && reg.rect.y >= canvas.y - 30 && reg.rect.x + reg.rect.w <= canvas.x + canvas.w + 2 && reg.rect.y + reg.rect.h <= canvas.y + canvas.h + 2;
  log(`워크스페이스 단추 ${name}`, '영역이 화면 안', inside, '배율', +(await vp(page)).zoom.toFixed(3));
  await shot(page, `h2-1-wsbutton-${name}`, log);
}

// ---- H2: 검색(Ctrl+F) ----
async function search(q, { enter = true, shotName = null } = {}) {
  await page.keyboard.press('Escape');
  await page.click('.react-flow__pane', { position: { x: 5, y: 5 } }).catch(() => {});
  await page.keyboard.press('Control+f');
  await page.waitForSelector('[data-role=search] input');
  await page.fill('[data-role=search] input', q);
  await sleep(700);
  const res = await page.evaluate(() => [...document.querySelectorAll('.mt-search-item')].map((e) => ({ name: e.dataset.name, field: e.dataset.field, kind: e.dataset.kind, text: e.innerText.replace(/\s+/g, ' ').slice(0, 120) })));
  if (shotName) await shot(page, shotName, log);
  if (enter) { await page.keyboard.press('Enter'); await sleep(900); }
  return res;
}
const cases = [
  ['이름', 'name', 'hel', 'help'],
  ['질문', 'ask', 'merge into', 'rev'],
  ['요청', 'prompt', 'deploy', 'far'],
  ['답', 'answer', 'help-ok', 'help'],
  ['워크스페이스', 'workspace', 'two', null],
];
for (const [what, file, q, want] of cases) {
  const res = await search(q, { shotName: `h2-2-search-${file}` });
  const ok = want ? await centered(want) : (await vp(page)) && true;
  log(`검색 ${what} "${q}"`, res.map((r) => `${r.kind === 'workspace' ? '[ws]' : '@'}${r.name}:${r.field}`), want ? `Enter → @${want} 가운데 ${ok}` : 'Enter → 영역');
}
// 화살표로 고르기
await page.keyboard.press('Control+f');
await page.fill('[data-role=search] input', 'p6a');
await sleep(700);
await page.keyboard.press('ArrowDown');
const picked = await page.evaluate(() => (document.querySelector('.mt-search-item.on') || {}).dataset);
log('화살표 아래로 고른 결과', picked && picked.name, picked && picked.field);
await page.keyboard.press('Escape');

// ---- H3: 전체를 줄여 보아도 질문과 요청이 읽힌다 ----
await fitAll(page);
await sleep(800);
const z = (await vp(page)).zoom;
const far = await page.evaluate(() => [...document.querySelectorAll('.mt-node')].map((e) => {
  const ask = e.querySelector('[data-role=far-ask]'), pr = e.querySelector('[data-role=far-prompt]'), an = e.querySelector('[data-role=far-answer]');
  const px = (el) => (el ? Math.round(el.getBoundingClientRect().height / Math.max(1, Math.round(el.getBoundingClientRect().height / (parseFloat(getComputedStyle(el).lineHeight) || parseFloat(getComputedStyle(el).fontSize) * 1.25))) ) : null);
  const scale = e.getBoundingClientRect().width / e.offsetWidth;
  return { name: e.dataset.name, face: e.dataset.face, ask: ask ? ask.innerText.slice(0, 80) : null, askPx: ask ? +(parseFloat(getComputedStyle(ask).fontSize) * scale).toFixed(1) : null, prompt: pr ? pr.innerText.slice(0, 60) : null, promptPx: pr ? +(parseFloat(getComputedStyle(pr).fontSize) * scale).toFixed(1) : null, answer: an ? an.innerText.slice(0, 40) : null, outline: getComputedStyle(e).outlineStyle !== 'none' ? getComputedStyle(e).outlineWidth : null, dim: e.classList.contains('idle'), _px: px(null) };
}));
log('전체 보기 배율', +z.toFixed(3));
for (const f of far) log(`  @${f.name} 얼굴 ${f.face}`, f.ask ? `질문(화면 ${f.askPx}px) "${f.ask}"` : '', f.prompt ? `요청(화면 ${f.promptPx}px) "${f.prompt}"` : '', f.answer ? `답 "${f.answer}"` : '', f.outline ? `기다림 테두리 ${f.outline}` : '');
await shot(page, 'h3-1-overview-questions-readable', log);
// 더 줄여서(배율 0.12)
const fitV = await vp(page);
await page.evaluate((v) => window.__mt.getState().setViewport({ x: v.x * 0.5 + 300, y: v.y * 0.5 + 150, zoom: 0.12 }), fitV);
await sleep(900);
const tiny = await page.evaluate(() => { const e = document.querySelector('.mt-node[data-name="rev"] [data-role=ask-callout]') || document.querySelector('.mt-node[data-name="rev"] [data-role=far-ask]'); if (!e) return null; const n = e.closest('.mt-node'); const scale = n.getBoundingClientRect().width / n.offsetWidth; return { text: e.innerText.slice(0, 60), px: +(parseFloat(getComputedStyle(e).fontSize) * scale).toFixed(1) }; });
log('배율 0.12에서 @rev 질문', tiny);
await shot(page, 'h3-2-overview-zoom-0.12', log);

// ---- H4: 노드를 누르면 들어가 터미널에 입력. 붙기 전에 친 글도 들어간다 ----
await fitAll(page);
const before = await rectOf(page, 'sh2');
const s2 = await nodeScreen(page, 'sh2');
log('sh2 누르기 전 얼굴', s2.face);
await page.mouse.click(s2.cx, s2.cy + 20);
await page.keyboard.type('echo p6a-typed-h4', { delay: 15 }); // 바로 친다(터미널이 아직 붙지 않았다)
await page.keyboard.press('Enter');
await sleep(2500);
const s2b = await nodeScreen(page, 'sh2');
const screenText = atrium('screen', 'sh2', '--text');
const hasEcho = /p6a-typed-h4/.test(screenText);
const focusIn = await page.evaluate(() => !!(document.activeElement && document.activeElement.closest('.mt-node[data-name="sh2"] .xterm')));
const pend = await page.evaluate(() => window.__mt.perf.events.filter((e) => e.kind === 'pending_input').slice(-2));
log('누른 뒤 얼굴', s2b.face, '가운데', await centered('sh2'), '터미널 초점', focusIn, '화면에 친 글', hasEcho, '모아 둔 입력', pend, '노드 자리 그대로', JSON.stringify(before) === JSON.stringify(await rectOf(page, 'sh2')));
log('sh2 화면 끝', screenText.split('\n').filter((l) => l.trim()).slice(-4));
await shot(page, 'h4-1-click-enter-typed', log);
// claude 노드(멀리 얼굴의 질문 위)를 눌러도 들어간다
await fitAll(page);
const rv = await nodeScreen(page, 'rev');
await page.mouse.click(rv.cx, rv.cy);
await sleep(1800);
log('@rev 누른 뒤', (await nodeScreen(page, 'rev')).face, '가운데', await centered('rev'));
await shot(page, 'h4-2-click-enter-claude-card', log);

log('창 오류', errors);
await closeApp(app);
process.exit(0);
