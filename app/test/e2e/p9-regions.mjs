// P9 영역 겹침 창 시험(개발용 프로필, 시험 판 atrium-dev-p9):
// 1) 옛 판처럼 영역이 겹친 판을 만든다(P7 모양: a는 위아래로 긴 줄, b가 a 오른쪽 위를, c가 a 아래를 덮음) → 스크린숏
// 2) 백엔드를 다시 띄우면 펴진다(영역 안의 상대 자리는 그대로) → 스크린숏
// 3) 새 세션 여러 개, 판에 올린 패널(herdr pane split), 닫고 다시 열기, 하위 세션 4개(atrium child와 같은 HTTP 명령) 뒤에도 영역이 겹치지 않고 한 줄로 쌓이지 않는다
// 사용(app 폴더에서): npm run build && MT_E2E_OUT=p9 node test/e2e/p9-regions.mjs
import fs from 'node:fs';
import { DIRS, launchProfile, closeApp, shot, logger, sleep, until, writeJson, call, sessionBy, boardShape, atrium, herdr, branchChild } from './p9-lib.mjs';

const log = logger('p9-regions');
const result = { steps: [] };
for (const d of [DIRS.a, DIRS.b, DIRS.c]) fs.mkdirSync(d, { recursive: true });
const fit = async (page) => { await page.evaluate(() => window.__mt.getState().fitAll(0)); await sleep(1500); };
const nodeOf = (page, name) => page.evaluate((n) => { const st = window.__mt.getState(); const s = [...st.sessions.values()].find((x) => x.name === n); return s ? { ...st.nodes.get(s.sessionId) } : null; }, name);
const wsKey = async (page, dir) => (await call(page, 'workspace.list')).workspaces.find((w) => w.root.toLowerCase() === dir.replace(/\\/g, '/').toLowerCase()).key;
async function spawnShell(page, cwd, name) {
  await call(page, 'session.spawn', { cwd, name, kind: 'shell' });
  await until(async () => !!(await nodeOf(page, name)), 20000);
}
async function check(page, step, { maxColumnsRatio = true } = {}) {
  await sleep(800);
  const s = await boardShape(page);
  const narrow = Object.entries(s.shapes).filter(([, v]) => v.bbox && v.nodes >= 4 && v.bbox.h / v.bbox.w >= 3).map(([k]) => k);
  const rec = { step, overlaps: s.overlaps, narrow, shapes: Object.fromEntries(Object.entries(s.shapes).map(([k, v]) => [k, { nodes: v.nodes, columns: v.columns, w: v.bbox && v.bbox.w, h: v.bbox && v.bbox.h }])) };
  result.steps.push(rec);
  log(step, JSON.stringify(rec));
  return rec;
}

let app, page;
try {
  ({ app, page } = await launchProfile({ profile: 'dev', log }));
  for (const d of [DIRS.a, DIRS.b, DIRS.c]) await call(page, 'workspace.open', { path: d });
  const A = await wsKey(page, DIRS.a), B = await wsKey(page, DIRS.b), C = await wsKey(page, DIRS.c);
  for (const [cwd, name] of [[DIRS.a, 'a1'], [DIRS.a, 'a2'], [DIRS.b, 'b1'], [DIRS.b, 'b2'], [DIRS.c, 'c1']]) await spawnShell(page, cwd, name);
  await check(page, '0-five-shells');

  // 1) 옛 판 만들기: a는 세로 한 줄(a2를 a1 아래로), b 영역을 a 오른쪽 위에 겹치게, c 영역을 a 아래쪽에 겹치게(force로 겹침 막기를 건너뜀)
  const a1 = await nodeOf(page, 'a1');
  await call(page, 'board.setNode', { session: 'a2', x: a1.x, y: a1.y + 1000, w: a1.w, h: a1.h, cause: 'p9 test: old board' });
  const b1 = await nodeOf(page, 'b1'), c1 = await nodeOf(page, 'c1');
  await call(page, 'workspace.move', { workspace: B, dx: a1.x + 400 - b1.x, dy: a1.y - 200 - b1.y, force: true });
  await call(page, 'workspace.move', { workspace: C, dx: a1.x + 300 - c1.x, dy: a1.y + 1300 - c1.y, force: true });
  await sleep(1000); await fit(page);
  const old = await check(page, '1-old-overlapped-board');
  result.old = old;
  await shot(page, 'regions-1-old-overlapped-board', log);
  const before = { a1: await nodeOf(page, 'a1'), a2: await nodeOf(page, 'a2'), b1: await nodeOf(page, 'b1'), b2: await nodeOf(page, 'b2') };

  // 2) 창을 닫고 백엔드를 다시 띄운다 → 뜰 때 편다
  await closeApp(app);
  log('backend stop', atrium('backend', 'stop').trim());
  ({ app, page } = await launchProfile({ profile: 'dev', log }));
  await fit(page);
  const spread = await check(page, '2-spread-on-start');
  const after = { a1: await nodeOf(page, 'a1'), a2: await nodeOf(page, 'a2'), b1: await nodeOf(page, 'b1'), b2: await nodeOf(page, 'b2') };
  const rel = (p, q) => ({ dx: q.x - p.x, dy: q.y - p.y });
  result.spread = { overlaps: spread.overlaps, aKept: JSON.stringify(rel(before.a1, before.a2)) === JSON.stringify(rel(after.a1, after.a2)), bKept: JSON.stringify(rel(before.b1, before.b2)) === JSON.stringify(rel(after.b1, after.b2)), aMoved: rel(before.a1, after.a1), bMoved: rel(before.b1, after.b1) };
  log('펴기', JSON.stringify(result.spread));
  await shot(page, 'regions-2-spread-on-start', log);

  // 3a) a에 새 셸 6개
  for (let i = 3; i <= 8; i++) { await spawnShell(page, DIRS.a, `a${i}`); await check(page, `3a-spawn-a${i}`); }
  await fit(page);
  await shot(page, 'regions-3-six-more-in-a', log);

  // 3b) 판에 올린 패널: a1, b1 패널을 herdr로 나눈다(판이 모르는 패널 → 셸 노드)
  for (const n of ['a1', 'b1']) {
    const s = await sessionBy(page, n);
    const before = (await call(page, 'session.list')).length;
    const r = herdr('pane.split', { target_pane_id: s.paneId, direction: 'right' });
    log(`${n} 나누기`, JSON.stringify(r).slice(0, 200));
    await until(async () => (await call(page, 'session.list')).length > before, 30000);
    await check(page, `3b-adopt-split-${n}`);
  }

  // 3c) 닫고 다시 열기: a3을 끄고, 그 사이 a 영역 쪽으로 c를 붙여 둔 뒤 다시 연다
  log('kill a3', JSON.stringify(await call(page, 'session.kill', { session: 'a3', confirm: true })));
  await until(async () => !(await sessionBy(page, 'a3')), 20000);
  await check(page, '3c-a3-closed');
  const re = await call(page, 'recall.reopen', { session: 'a3' });
  log('reopen a3', JSON.stringify({ place: re.place, name: re.name }));
  await until(async () => !!(await nodeOf(page, re.name)), 20000);
  await check(page, '3c-a3-reopened');

  // 3d) 하위 세션: a에 claude(haiku) 하나를 띄우고, 그 세션으로서 하위 세션 4개를 만든다(atrium child와 같은 HTTP 명령)
  await call(page, 'session.spawn', { cwd: DIRS.a, name: 'lead', model: 'haiku' });
  await until(async () => { const s = await sessionBy(page, 'lead'); return s && ['ready', 'trust_wait', 'error', 'exited'].includes(s.state) && s; }, 120000, 1000);
  const lead = await sessionBy(page, 'lead');
  log('lead', lead.state);
  if (lead.state === 'ready') {
    for (let i = 1; i <= 4; i++) {
      const r = await branchChild(lead.sessionId, { name: `w${i}`, role: '워커' });
      log(`child w${i}`, r.status, JSON.stringify(r.body).slice(0, 200));
      await until(async () => !!(await nodeOf(page, `w${i}`)), 60000);
      await check(page, `3d-child-w${i}`);
    }
    result.children = await page.evaluate(() => { const st = window.__mt.getState(); return [...st.sessions.values()].filter((s) => /^w\d$|^lead$/.test(s.name)).map((s) => ({ name: s.name, ...st.nodes.get(s.sessionId) })); });
  } else result.children = `lead ${lead.state}`;
  await fit(page);
  await shot(page, 'regions-4-after-adopt-reopen-children', log);
  const lw = await page.evaluate(() => { const st = window.__mt.getState(); const ns = [...st.sessions.values()].filter((s) => /^w\d$|^lead$/.test(s.name)).map((s) => st.nodes.get(s.sessionId)); const x0 = Math.min(...ns.map((r) => r.x)) - 80, y0 = Math.min(...ns.map((r) => r.y)) - 120, x1 = Math.max(...ns.map((r) => r.x + r.w)) + 80, y1 = Math.max(...ns.map((r) => r.y + r.h)) + 80; st.navigateToRect({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, 0); return ns.length; });
  if (lw) { await sleep(1500); await shot(page, 'regions-5-children-columns', log); }

  const final = result.steps[result.steps.length - 1];
  result.pass = {
    oldBoardOverlapped: old.overlaps.length > 0,
    spreadOnStart: spread.overlaps.length === 0 && result.spread.aKept && result.spread.bKept,
    neverOverlapAfterStart: result.steps.filter((s) => s.step >= '2').every((s) => s.overlaps.length === 0),
    noNarrowColumn: result.steps.filter((s) => s.step >= '3').every((s) => !s.narrow.length),
    childrenMade: Array.isArray(result.children) && result.children.length === 5,
  };
  log('판정', JSON.stringify(result.pass), 'final', JSON.stringify(final.shapes));
  if (Object.values(result.pass).some((v) => !v)) process.exitCode = 1;
} catch (e) { log('FAIL', e.stack); if (page) await shot(page, 'regions-fail', log).catch(() => {}); process.exitCode = 1; }
writeJson('p9-regions.json', result);
if (app) await closeApp(app);
setTimeout(() => process.exit(process.exitCode || 0), 500);
