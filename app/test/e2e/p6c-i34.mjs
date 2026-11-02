// P6c 창 시험 I3·I4: 메모 노드(만들기, 마크다운 편집과 보기, 할 일 상자, 옮겨 영역 소속, 크기, 지우기)와 칸반 노드(열과 카드, 끌어 옮기기,
// 이름 바꾸기, 세션 잇기와 상태, 누르면 그 세션으로). 둘 다 검색에 나오고, 영역 이름표를 끌면 함께 움직이고, 새 세션이 그 위에 놓이지 않는다.
// 준비: s1, s2(claude haiku, mtask-p6c-plain), sh1(셸, proj). 실행: cd app && npm run build && MT_E2E_OUT=p6c node test/e2e/p6c-i34.mjs
import { launch, logger, closeApp, shot, sleep, until, call, idOf, st, fitAll, setView, regionOf, wsKeyByName, toScreen, allRects, overlaps, atrium, PLAIN, writeJson } from './p6c-lib.mjs';

const log = logger('p6c-i34');
const { app, page } = await launch({ log });
const canvasSize = () => page.evaluate(() => { const r = document.querySelector('.mt-canvas').getBoundingClientRect(); return { w: r.width, h: r.height }; });
// 판 좌표 spot이 화면 가운데에 오게
async function centerOn(spot, zoom = 0.8) { const c = await canvasSize(); await setView(page, { x: c.w / 2 - spot.x * zoom, y: c.h / 2 - spot.y * zoom, zoom }); }
const bboxOfRegions = () => page.evaluate(() => { const st = window.__mt.getState(); const rs = st.workspaces.map((w) => st.regionOf(w.key)).filter(Boolean); const x0 = Math.min(...rs.map((r) => r.x)), y0 = Math.min(...rs.map((r) => r.y)); return { x: x0, y: y0, w: Math.max(...rs.map((r) => r.x + r.w)) - x0, h: Math.max(...rs.map((r) => r.y + r.h)) - y0 }; });
const memoOf = (id) => st(page, (i) => ({ ...window.__mt.getState().memos.get(i) }), id);
const kanbanOf = (id) => st(page, (i) => structuredClone(window.__mt.getState().kanbans.get(i)), id);
// 판 좌표로 끌기: 머리줄의 화면 점을 잡아 판 좌표 (dx, dy)만큼. rect(끌 것의 판 사각형)를 주면 먼저 시작과 끝 자리가 함께 화면 안쪽에 오게 맞춘다
// (끄는 점이 캔버스 가장자리에 닿으면 React Flow가 화면을 저절로 밀어 더 멀리 옮겨진다)
async function dragBoard(sel, dx, dy, rect = null) {
  if (rect) {
    const x0 = Math.min(rect.x, rect.x + dx), y0 = Math.min(rect.y, rect.y + dy), x1 = Math.max(rect.x, rect.x + dx) + rect.w, y1 = Math.max(rect.y, rect.y + dy) + rect.h;
    const pad = Math.max(x1 - x0, y1 - y0) * 0.35;
    await page.evaluate((r) => window.__mt.getState().navigateToRect(r, 0), { x: x0 - pad, y: y0 - pad, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad });
    await sleep(500);
  }
  const box = await page.locator(sel).first().boundingBox();
  const z = (await st(page, () => window.__mt.getState().vpNow)).zoom;
  const x0 = box.x + Math.min(40, box.width / 3), y0 = box.y + box.height / 2;
  await page.mouse.move(x0, y0); await page.mouse.down();
  for (let i = 1; i <= 16; i++) { await page.mouse.move(x0 + (dx * z * i) / 16, y0 + (dy * z * i) / 16); await sleep(16); }
  await sleep(150); await page.mouse.up(); await sleep(800);
}

try {
  const plainKey = await wsKeyByName(page, 'mtask-p6c-plain');
  const s2 = await idOf(page, 's2');
  await fitAll(page);
  let all = await bboxOfRegions();

  // ---------- I3 메모 ----------
  // 빈 곳(모든 영역의 오른쪽)을 화면 가운데에 두고 "+ 메모"
  await centerOn({ x: all.x + all.w + 900, y: all.y + 300 });
  const n0 = await st(page, () => window.__mt.getState().memos.size);
  await page.locator('[data-action="memo-new"]').click();
  await until(async () => (await st(page, () => window.__mt.getState().memos.size)) > n0, 10000, 200);
  const memoId = await st(page, () => [...window.__mt.getState().memos.values()].at(-1).memoId);
  const mSel = `.mt-memo-node[data-memo="${memoId}"]`;
  const m0 = await memoOf(memoId);
  log('새 메모', { x: m0.x, y: m0.y, ws: m0.workspaceKey, editing: await page.locator(`${mSel} [data-field="memo-text"]`).count() });
  const ta = page.locator(`${mSel} [data-field="memo-text"]`);
  await ta.click();
  await page.keyboard.type('# merge check memo\n- [ ] 리뷰 받기\n- **굵게** 와 `code`');
  await page.keyboard.press('Control+Enter');
  await until(async () => (await memoOf(memoId)).text.startsWith('# merge check memo'), 10000, 200);
  const view = await page.evaluate((s) => { const e = document.querySelector(s); return { h1: e.querySelector('.mt-md h1')?.innerText, task: e.querySelectorAll('input[type=checkbox]').length, strong: e.querySelector('.mt-md strong')?.innerText, code: e.querySelector('.mt-md code')?.innerText, ws: e.querySelector('[data-role=memo-ws]')?.innerText }; }, mSel);
  log('메모 보기', view);
  await shot(page, 'i3-1-memo-markdown-free', log);
  await page.locator(`${mSel} input[data-task="0"]`).click();
  await until(async () => (await memoOf(memoId)).text.includes('- [x] 리뷰 받기'), 10000, 200);
  log('할 일 상자 → 글', JSON.stringify((await memoOf(memoId)).text.split('\n')[1]));

  // 옮겨 plain 영역 바로 오른쪽에 놓으면 그 소속(영역이 감싼다)
  await fitAll(page);
  let reg = await regionOf(page, plainKey);
  const m1 = await memoOf(memoId);
  await dragBoard(`${mSel} .mt-memo-head`, reg.x + reg.w + 60 - m1.x, reg.y + 120 - m1.y, m1);
  await until(async () => (await memoOf(memoId)).workspaceKey === plainKey, 10000, 200);
  const m2 = await memoOf(memoId);
  const reg2 = await regionOf(page, plainKey);
  log('영역 옆에 놓은 메모', { x: m2.x, y: m2.y, ws: m2.workspaceKey, regionBefore: reg, regionAfter: reg2, wraps: m2.x + m2.w <= reg2.x + reg2.w && m2.y >= reg2.y });
  await shot(page, 'i3-2-memo-joined-region', log);

  // 크기 바꾸기: 고르고 오른쪽 아래 손잡이
  await centerOn({ x: m2.x + m2.w / 2, y: m2.y + m2.h / 2 }, 1);
  await page.locator(`${mSel} .mt-memo-head`).click({ position: { x: 40, y: 10 } });
  await sleep(300);
  const h = await page.locator(`${mSel} .react-flow__resize-control.handle.bottom.right`).boundingBox();
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2); await page.mouse.down();
  for (let i = 1; i <= 10; i++) { await page.mouse.move(h.x + h.width / 2 + 12 * i, h.y + h.height / 2 + 8 * i); await sleep(16); }
  await page.mouse.up(); await sleep(800);
  const m3 = await memoOf(memoId);
  const saved = (await call(page, 'memo.list', {})).find((x) => x.memoId === memoId);
  log('크기', { before: [m2.w, m2.h], after: [m3.w, m3.h], saved: [saved.w, saved.h] });
  await shot(page, 'i3-3-memo-resized', log);

  // 영역 이름표를 끌면 메모도 함께
  await fitAll(page);
  const s1Before = await st(page, () => { const s = window.__mt.getState(); const x = [...s.sessions.values()].find((v) => v.name === 's1'); return { ...s.nodes.get(x.sessionId) }; });
  const mB = await memoOf(memoId);
  await dragBoard(`.mt-region[data-ws="${plainKey}"] .mt-region-head`, 0, 400, await regionOf(page, plainKey));
  await until(async () => (await memoOf(memoId)).y !== mB.y, 10000, 200).catch(() => {});
  const s1After = await st(page, () => { const s = window.__mt.getState(); const x = [...s.sessions.values()].find((v) => v.name === 's1'); return { ...s.nodes.get(x.sessionId) }; });
  const mA = await memoOf(memoId);
  const back = (await call(page, 'memo.list', {})).find((x) => x.memoId === memoId);
  log('영역 옮기기', { s1dy: s1After.y - s1Before.y, memoDy: mA.y - mB.y, savedDy: back.y - mB.y });
  await shot(page, 'i3-4-region-drag-moves-memo', log);

  // 검색 → 메모로 간다
  await page.keyboard.press('Control+f');
  await page.locator('[data-field="search"]').fill('merge check');
  await page.locator('.mt-search-item[data-kind="memo"]').first().waitFor({ timeout: 10000 });
  const results = await page.locator('.mt-search-item').evaluateAll((es) => es.map((e) => `${e.dataset.kind}:${e.dataset.name}:${e.dataset.field}`));
  log('검색 merge check', results);
  await page.keyboard.press('Enter');
  await sleep(600);
  const vpm = await st(page, () => window.__mt.getState().vpNow);
  const c = await canvasSize();
  const center = { x: (c.w / 2 - vpm.x) / vpm.zoom, y: (c.h / 2 - vpm.y) / vpm.zoom };
  log('검색으로 간 화면 가운데(판)', center, '메모 가운데', { x: mA.x + mA.w / 2, y: mA.y + mA.h / 2 }, '빛남', await page.locator(`.react-flow__node.flash ${mSel}`).count());
  await shot(page, 'i3-5-search-memo', log);

  // ---------- I4 칸반 ----------
  all = await bboxOfRegions();
  await centerOn({ x: all.x + all.w + 1100, y: all.y + 300 });
  const k0 = await st(page, () => window.__mt.getState().kanbans.size);
  await page.locator('[data-action="kanban-new"]').click();
  await until(async () => (await st(page, () => window.__mt.getState().kanbans.size)) > k0, 10000, 200);
  const kId = await st(page, () => [...window.__mt.getState().kanbans.values()].at(-1).kanbanId);
  const kSel = `.mt-kanban-node[data-kanban="${kId}"]`;
  const col = (i) => `${kSel} .mt-kcol:nth-child(${i})`;
  await page.locator(`${col(1)} [data-action="add-card"]`).click();
  for (const t of ['review task', 'merge PR 41']) { await page.locator(`${col(1)} [data-field="add-card"]`).fill(t); await page.keyboard.press('Enter'); await sleep(400); }
  await page.keyboard.press('Escape');
  await until(async () => (await kanbanOf(kId)).columns[0].cards.length === 2, 10000, 200);
  // 열 이름 바꾸기
  await page.locator(`${col(2)} [data-field="column-name"]`).dblclick();
  await page.locator(`${col(2)} [data-field="column-name-input"]`).fill('진행');
  await page.keyboard.press('Enter');
  await until(async () => (await kanbanOf(kId)).columns[1].name === '진행', 10000, 200);
  // 카드 끌어 "끝"으로
  const card = await page.locator(`${kSel} .mt-kcard[data-text="review task"]`).boundingBox();
  const end = await page.locator(`${col(3)} .mt-kcards`).boundingBox();
  await page.mouse.move(card.x + 20, card.y + card.height / 2); await page.mouse.down();
  for (let i = 1; i <= 14; i++) { await page.mouse.move(card.x + 20 + ((end.x + 30 - card.x - 20) * i) / 14, card.y + card.height / 2 + ((end.y + 20 - card.y - card.height / 2) * i) / 14); await sleep(20); }
  await shot(page, 'i4-1-card-drag-drop-line', log);
  await page.mouse.up();
  await until(async () => (await kanbanOf(kId)).columns[2].cards.some((x) => x.text === 'review task'), 10000, 200);
  const kv = await kanbanOf(kId);
  log('칸반 열', kv.columns.map((cc) => `${cc.name}: ${cc.cards.map((x) => x.text).join(', ')}`));
  // 세션 잇기
  const prCard = `${kSel} .mt-kcard[data-text="merge PR 41"]`;
  await page.locator(prCard).hover();
  await page.locator(`${prCard} [data-action="card-link"]`).click();
  await page.locator(`${prCard} [data-field="card-link"]`).selectOption(s2);
  await page.locator(`${prCard} [data-role="card-session"]`).waitFor({ timeout: 10000 });
  log('이은 카드', (await page.locator(`${prCard} [data-role="card-session"]`).innerText()).replace(/\s+/g, ' '), await page.locator(`${prCard} [data-role="card-session"]`).getAttribute('data-state'));
  await shot(page, 'i4-2-kanban-linked-card', log);
  // 이은 세션 상태가 따라 바뀐다: s2에게 짧은 턴
  await call(page, 'session.send', { target: ['s2'], text: 'Reply with exactly: KANBAN' });
  const seen = new Set();
  await until(async () => { const v = await page.locator(`${prCard} [data-role="card-session"]`).getAttribute('data-state'); seen.add(v); return seen.has('working') && v === 'ready'; }, 90000, 150).catch(() => {});
  log('카드에 보인 s2 상태', [...seen]);
  await page.locator(`${prCard} [data-role="card-session"]`).click();
  await sleep(900);
  log('카드를 누른 뒤 초점', await st(page, () => { const s = window.__mt.getState(); return s.sessions.get(s.focusId)?.name; }));

  // 칸반도 plain 영역 옆으로(메모 아래)
  await fitAll(page);
  reg = await regionOf(page, plainKey);
  const kk = await kanbanOf(kId);
  await dragBoard(`${kSel} .mt-kanban-head`, reg.x + reg.w + 60 - kk.x, reg.y + reg.h - 380 - kk.y, kk);
  await until(async () => (await kanbanOf(kId)).workspaceKey === plainKey, 10000, 200).catch(() => {});
  log('칸반 소속', (await kanbanOf(kId)).workspaceKey === plainKey ? 'plain' : (await kanbanOf(kId)).workspaceKey);

  // 새 세션은 메모·칸반 위에 놓이지 않는다
  atrium('spawn', PLAIN, '--kind', 'shell', '--name', 'sh2');
  await until(async () => (await allRects(page)).some((r) => r.name === 'sh2'), 30000, 300);
  await sleep(500);
  const rects = await allRects(page);
  const sh2 = rects.find((r) => r.name === 'sh2');
  const hits = rects.filter((r) => r !== sh2 && overlaps(sh2, r, 0)).map((r) => r.kind + ':' + (r.name || r.id));
  log('새 셸 sh2 자리', { x: sh2.x, y: sh2.y, ws: sh2.ws === plainKey ? 'plain' : sh2.ws, 겹침: hits });
  writeJson('i34-rects.json', rects);
  await fitAll(page);
  await shot(page, 'i34-1-canvas-with-memo-kanban-new-shell', log);

  // 검색 → 칸반 카드
  await page.keyboard.press('Control+f');
  await page.locator('[data-field="search"]').fill('merge PR');
  await page.locator('.mt-search-item[data-kind="kanban"]').first().waitFor({ timeout: 10000 });
  log('검색 merge PR', await page.locator('.mt-search-item').evaluateAll((es) => es.map((e) => `${e.dataset.kind}:${e.dataset.name}:${e.dataset.field}`)));
  await page.keyboard.press('Enter');
  await sleep(500);
  log('빛나는 카드', await page.locator(`${kSel} .mt-kcard.flash`).getAttribute('data-text').catch(() => null));
  await shot(page, 'i4-3-search-kanban-card', log);

  // 지우기(글·카드가 있으면 한 번 더 묻는다)
  await page.keyboard.press('Escape');
  await page.evaluate((i) => window.__mt.getState().navigateToItem(`memo:${i}`), memoId);
  await sleep(600);
  await page.locator(`${mSel} [data-action="memo-delete"]`).click();
  await page.locator(`${mSel} [data-role="item-confirm"]`).waitFor();
  log('메모 지우기 확인 글', (await page.locator(`${mSel} [data-role="item-confirm"]`).innerText()).replace(/\s+/g, ' '));
  await page.locator(`${mSel} [data-action="confirm-yes"]`).click();
  await until(async () => !(await st(page, (i) => window.__mt.getState().memos.has(i), memoId)), 10000, 200);
  await page.evaluate((i) => window.__mt.getState().navigateToItem(`kanban:${i}`), kId);
  await sleep(600);
  await page.locator(`${kSel} [data-action="kanban-delete"]`).click();
  await page.locator(`${kSel} [data-role="item-confirm"]`).waitFor();
  log('칸반 지우기 확인 글', (await page.locator(`${kSel} [data-role="item-confirm"]`).innerText()).replace(/\s+/g, ' '));
  await page.locator(`${kSel} [data-action="confirm-yes"]`).click();
  await until(async () => !(await st(page, (i) => window.__mt.getState().kanbans.has(i), kId)), 10000, 200);
  log('지움', { memos: await st(page, () => window.__mt.getState().memos.size), kanbans: await st(page, () => window.__mt.getState().kanbans.size) });
  atrium('kill', 'sh2', '--yes');
  log('끝');
} catch (e) { log('실패', e.stack || e.message); await shot(page, 'i34-fail', log).catch(() => {}); process.exitCode = 1; }
await closeApp(app);
process.exit();
