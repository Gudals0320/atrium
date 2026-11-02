// P13 창 시험(완료 기준 1·2): 판을 켜면 고정 자료 대화가 리포마다 저절로 열린 영역에 대화 노드로 보인다.
// 워크트리 묶음, 띄움 선, 하위 에이전트 수(누르면 목록), 도는 중 표시, 띄운 곳 글, 얼굴(카드·멀리·아이콘), "판으로 열기"(그 자리에서 세션 노드).
// missed 함: 지워진 폴더와 시험 폴더의 대화가 폴더별로 보이고, 폴더 지우기와 모두 지우기가 확인창을 거쳐 고정 자료 복사본을 휴지통으로 보내고 목록과 색인에서 뺀다.
// 사용: node experiments/p13/tools/e2e.cjs p13-convos.mjs [--fresh] [--no-open]
//   --fresh: 고정 자료를 다시 만들고(make-fixture), 이 시험 판의 데이터·창 프로필·herdr 세션을 지우고 시작(reset)
//   판으로 열기는 이 시험이 판 밖 herdr 세션에서 새로 만든 대화(experiments/p13/tools/outside.mjs, mtask-p13-open 폴더)로만 한다
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { launch, closeApp, shot, logger, sleep, until, atrium, call, convos, openSidebar, lookAt, writeJson, DIRS, GONE, FIXTURE, REPO, BOARD, TOOLS } from './p13-lib.mjs'; // TOOLS: 판에 맞는 도구(P16). P27: p27 판은 experiments/p27/tools/p13
import { pathKey } from '../../../backend/src/workspaces.mjs';

const log = logger('p13-convos');
if (process.argv.includes('--fresh')) {
  log(execFileSync(process.execPath, [path.join(TOOLS, 'reset.mjs')], { encoding: 'utf8' }).trim().replace(/\s+/g, ' '));
  log(execFileSync(process.execPath, [path.join(TOOLS, 'make-fixture.mjs')], { encoding: 'utf8' }).trim().replace(/\s+/g, ' '));
}
const made = JSON.parse(fs.readFileSync(path.join(FIXTURE, 'made.json'), 'utf8'));
const byTitle = (t) => made.made.find((x) => x.title === t).cid;
const ID = { parent: byTitle('작업 나누기(부모)'), featx: byTitle('기능 x 구현'), fixy: byTitle('버그 y 고치기'), deskChild: byTitle('릴리스 노트 요약'), desk: byTitle('데스크톱에서 한 일') || null, running: made.running, archived: byTitle('20일 전 대화(보관)') };
const fixtureFile = (cwd, id) => path.join(FIXTURE, cwd.replace(/[^A-Za-z0-9]/g, '-'), `${id}.jsonl`);
const result = { steps: [], ids: ID };
const step = (name, ok, data = {}) => { result.steps.push({ name, ok, ...data }); log(`${ok ? '통과' : '실패'}: ${name}`, data); };
const key = (d) => pathKey(d);
const recycleNames = () => { try { return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', "$rb = (New-Object -ComObject Shell.Application).Namespace(10); @($rb.Items() | ForEach-Object { $_.Name }) -join \"`n\""], { encoding: 'utf8' }).split(/\r?\n/).filter(Boolean); } catch { return []; } };
const regionOf = (page, dir) => page.evaluate((k) => window.__mt.getState().regionOf(k), key(dir));

const { app, page, t0 } = await launch({ log });
try {
  await call(page, 'settings.set', { key: 'language', value: 'ko' }); // P16: 이 시험은 화면 글을 한국어로 본다(기본은 영어)
  // ---------- 1. 켜면 리포마다 대화 노드 ----------
  await until(async () => (await convos(page)).length >= 74, 90000, 500);
  const firstMs = Date.now() - t0;
  await sleep(1500);
  const cs = await convos(page);
  const wss = await page.evaluate(() => window.__mt.getState().workspaces.map((w) => ({ key: w.key, name: w.name, auto: w.auto })));
  const per = Object.fromEntries(wss.map((w) => [w.name, cs.filter((c) => c.ws === w.key).length]));
  step('켜면 대화 노드가 리포마다 저절로 열린 영역에 보인다', cs.length >= 74 && ['repoA', 'repoB', 'r3', 'r4', 'r5', 'r6'].every((k) => wss.some((w) => w.key === key(DIRS[k]) && w.auto)), { nodes: cs.length, perWorkspace: per, firstNodesMs: firstMs });
  step('missed 폴더(시험 폴더, 판 코드 저장소 .dev, 임시 폴더, 없어진 폴더)와 데스크톱만 있는 폴더는 영역을 열지 않는다', !['xtest', 'code', 'tmp', 'desk'].some((k) => wss.some((w) => w.key === key(DIRS[k]))) && !GONE.some((g) => wss.some((w) => w.key === key(g))), { workspaces: wss.map((w) => w.name) });
  step('보관(20일 전)과 데스크톱 대화는 노드가 없다', !cs.some((c) => c.id === ID.archived) && !cs.some((c) => c.title === '데스크톱에서 한 지휘'), {});
  await page.evaluate(() => window.__mt.getState().fitAll(0));
  await sleep(900);
  await shot(page, 'p13-1-1-all', log);

  // 워크트리 묶음과 띄움 선(repoA)
  const ra = await regionOf(page, DIRS.repoA);
  await lookAt(page, ra);
  await sleep(500);
  const boxes = await page.$$eval('.mt-wtbox', (els) => els.map((e) => ({ wt: e.dataset.worktree, ws: e.dataset.ws })));
  const blocks = cs.filter((c) => c.ws === key(DIRS.repoA)).map((c) => [c.title, c.block]);
  step('같은 리포의 워크트리 대화는 워크트리마다 묶여 보인다(feat-x, fix-y)', ['feat-x', 'fix-y'].every((w) => boxes.some((b) => b.wt === w && b.ws === key(DIRS.repoA))), { boxes, blocks });
  const edges = await page.evaluate(() => window.__mt.getState().convoEdges);
  const drawn = await page.$$eval('[data-spawn-edge]', (els) => els.map((e) => e.dataset.spawnEdge));
  const want = [`spawn:${ID.parent}:${ID.featx}`, `spawn:${ID.parent}:${ID.fixy}`];
  step('띄움 선: 부모 → feat-x(claude -w), 부모 → fix-y(herdr agent start + prompt)', want.every((w) => edges.some((e) => e.id === w)) && want.every((w) => drawn.includes(w)), { edges: edges.map((e) => [e.via, e.name, e.by]), drawn });
  const parentCard = await page.$eval(`[data-convo="${ID.parent}"]`, (e) => e.querySelector('[data-role="children"]') && e.querySelector('[data-role="children"]').textContent);
  step('부모 카드에 띄운 대화 수', /2/.test(parentCard || ''), { parentCard });
  await shot(page, 'p13-1-2-repoA-worktrees-spawn', log);

  // 하위 에이전트 수와 목록
  const sub = await page.$eval(`[data-convo="${ID.featx}"] [data-action="subagents"]`, (e) => e.dataset.count);
  await page.click(`[data-convo="${ID.featx}"] [data-action="subagents"]`);
  await page.waitForSelector(`[data-convo="${ID.featx}"] [data-role="subagent-list"] [data-subagent]`, { timeout: 10000 });
  const subs = await page.$$eval(`[data-convo="${ID.featx}"] [data-subagent] .mt-cv-sub-d`, (els) => els.map((e) => e.textContent));
  step('하위 에이전트 수(3)와 누르면 목록(설명, 시각)', sub === '3' && subs.length === 3, { count: sub, list: subs });
  await shot(page, 'p13-1-3-subagents', log);
  await page.click(`[data-convo="${ID.featx}"] [data-role="subagent-list"] .mt-x`);

  // 도는 중 표시, 띄운 곳 글(repoB)
  await lookAt(page, await regionOf(page, DIRS.repoB));
  const run = await page.$eval(`[data-convo="${ID.running}"]`, (e) => ({ flag: (e.querySelector('[data-role="running"]') || {}).textContent || null, open: !!e.querySelector('[data-action="open-convo"]') }));
  step('도는 대화는 "터미널 · pid n에서 도는 중"이고 판으로 열기가 없다', /터미널 · pid \d+에서 도는 중/.test(run.flag || '') && !run.open && run.flag.includes(String(made.sleeper)), run);
  const from = await page.$eval(`[data-convo="${ID.deskChild}"] [data-role="spawned-by"]`, (e) => e.textContent).catch(() => null);
  step('부모가 판에 없는(데스크톱 앱) 대화는 "띄운 곳"만 글로', from === '띄운 곳: 데스크톱 앱 대화', { from });
  await shot(page, 'p13-1-4-repoB-running-spawnedby', log);

  // 얼굴: 카드(가까이·중간), 멀리, 아이콘 — 세션 노드와 같은 너비 기준(360·200·140px)
  const faces = {};
  for (const z of [1, 0.75, 0.55, 0.3, 0.12]) {
    await lookAt(page, ra, z);
    await sleep(400);
    faces[z] = await page.$$eval(`.mt-cv[data-ws="${key(DIRS.repoA)}"]`, (els) => [...new Set(els.map((e) => e.dataset.face))]);
    await shot(page, `p13-1-5-face-${String(z).replace('.', '_')}`, log);
  }
  step('줌 얼굴: 320px 카드는 1·0.75에서 카드, 0.55(176px)에서 멀리, 0.3·0.12에서 아이콘', faces[1].join() === 'card' && faces[0.75].join() === 'card' && faces[0.55].join() === 'far' && faces[0.3].join() === 'icon' && faces[0.12].join() === 'icon', { faces });

  // 판으로 열기: 이 시험이 만든 실제 cli 대화(mtask-p13-open). 묶여 있지 않으면(30초 지나면) 그 자리에서 세션 노드가 된다
  if (!process.argv.includes('--no-open')) {
    const oc = await until(async () => (await convos(page)).find((c) => c.ws === key(DIRS.open) && c.canOpen), 90000, 1000).catch(() => null);
    if (!oc) step('판으로 열기: 시험 대화(mtask-p13-open)가 캔버스에 없다(outside.mjs로 먼저 만든다)', false, {});
    else {
      await lookAt(page, await regionOf(page, DIRS.open));
      await shot(page, 'p13-1-6-before-open', log);
      await page.click(`[data-convo="${oc.id}"] [data-action="open-convo"]`);
      await until(() => page.evaluate((id) => { const s = window.__mt.getState(); return s.sessions.has(id) && s.nodes.has(id) && !s.convoNodes.has(id); }, oc.id), 60000, 300);
      const n = await page.evaluate((id) => ({ ...window.__mt.getState().nodes.get(id), name: window.__mt.getState().sessions.get(id).name }), oc.id);
      step('판으로 열기: 같은 대화 ID의 판 세션이 되고, 대화 노드가 그 자리에서 세션 노드가 된다', n.x === oc.x && n.y === oc.y, { card: { x: oc.x, y: oc.y, w: oc.w, h: oc.h }, node: n });
      await sleep(2500);
      await shot(page, 'p13-1-7-opened-in-place', log);
      // 끄고(시험 세션) 닫힌 세션으로 남긴다
      try { log(atrium('kill', n.name, '--yes').trim().replace(/\s+/g, ' ')); } catch (e) { log('kill:', e.message.split('\n')[0]); }
      await until(() => page.evaluate((id) => !window.__mt.getState().sessions.has(id), oc.id), 60000, 500).catch(() => {});
    }
  }

  // ---------- 2. missed 함과 한꺼번에 지우기 ----------
  await openSidebar(page);
  await page.click('[data-action="missed-box"]');
  await page.waitForSelector('[data-role="missed-box"] .mt-sb-missed-ws', { timeout: 20000 });
  await sleep(500);
  const groups = await page.$$eval('[data-role="missed-box"] .mt-sb-missed-ws', (els) => els.map((e) => ({ folder: e.dataset.folder, why: e.dataset.why, n: Number(e.querySelector('[data-count="folder"]').textContent.replace(/\D/g, '')) })));
  const total = groups.reduce((a, g) => a + g.n, 0);
  const fk = (d) => groups.find((g) => pathKey(g.folder) === key(d));
  step('missed 함: 시험 폴더 3, 판 코드 저장소 .dev 2, 임시 폴더 1, 지워진 폴더 2·1(폴더별 수, 크기, 마지막 활동)', total === 9 && fk(DIRS.xtest).n === 3 && fk(DIRS.code).n === 2 && fk(DIRS.tmp).n === 1 && fk(GONE[0]).n === 2 && fk(GONE[1]).n === 1, { groups });
  const ml = await call(page, 'missed.list');
  step('missed는 캔버스에 없다', !(await convos(page)).some((c) => ml.folders.some((g) => g.items.some((x) => x.convId === c.id))), {});
  await page.$eval('[data-role="missed-box"]', (e) => e.scrollIntoView({ block: 'start' }));
  await shot(page, 'p13-2-1-missed-box', log);

  // 폴더 하나 지우기(시험 폴더 xtest): 확인창에 수, 크기, 폴더
  const xIds = ml.folders.find((g) => pathKey(g.folder) === key(DIRS.xtest)).items.map((x) => x.convId);
  const xFiles = xIds.map((id) => fixtureFile(DIRS.xtest, id));
  await page.click(`[data-role="missed-box"] .mt-sb-missed-ws[data-folder="${fk(DIRS.xtest).folder}"] [data-action="missed-folder"]`);
  await page.waitForSelector('[data-role="missed-confirm"]');
  const ask = await page.$eval('[data-role="missed-confirm"]', (e) => ({ count: e.querySelector('[data-count="confirm-count"]').textContent, bytes: e.querySelector('[data-count="confirm-bytes"]').textContent, folders: [...e.querySelectorAll('[data-folder]')].map((x) => x.dataset.folder) }));
  step('폴더 지우기 확인창: 수 3, 크기, 폴더 하나', ask.count === '3개' && ask.folders.length === 1, ask);
  await shot(page, 'p13-2-2-confirm-folder', log);
  await page.click('[data-action="missed-confirm"]');
  await until(async () => (await call(page, 'missed.list')).count === 6, 60000, 500);
  const rb1 = recycleNames();
  step('폴더 지우기: 대화 기록과 옆의 하위 에이전트 폴더가 휴지통으로 가고 목록과 색인에서 빠진다', xFiles.every((f) => !fs.existsSync(f)) && !fs.existsSync(xFiles[0].slice(0, -6)) && xIds.every((id) => rb1.some((n) => n.startsWith(id))) && !fs.existsSync(path.dirname(xFiles[0])), { files: xFiles.map((f) => path.basename(f)), inRecycleBin: xIds.filter((id) => rb1.some((n) => n.startsWith(id))).length, classify: await call(page, 'convo.classify') });

  // 모두 지우기
  const rest = (await call(page, 'missed.list')).folders.flatMap((g) => g.items.map((x) => ({ id: x.convId, folder: g.folder })));
  await page.click('[data-action="missed-all"]');
  await page.waitForSelector('[data-role="missed-confirm"]');
  const ask2 = await page.$eval('[data-role="missed-confirm"]', (e) => ({ count: e.querySelector('[data-count="confirm-count"]').textContent, folders: [...e.querySelectorAll('[data-folder]')].map((x) => x.dataset.folder) }));
  step('모두 지우기 확인창: 수 6, 폴더 넷', ask2.count === '6개' && ask2.folders.length === 4, ask2);
  await shot(page, 'p13-2-3-confirm-all', log);
  await page.click('[data-action="missed-confirm"]');
  await until(async () => (await call(page, 'missed.list')).count === 0, 60000, 500);
  await sleep(800);
  const rb2 = recycleNames();
  const cls = await call(page, 'convo.classify');
  step('모두 지우기: 남은 6개가 휴지통으로 가고 목록과 색인에서 빠진다(판에 올린 대화는 그대로)', rest.every((r) => rb2.some((n) => n.startsWith(r.id))) && !cls.byClass.missed && cls.byClass.board >= 74, { inRecycleBin: rest.filter((r) => rb2.some((n) => n.startsWith(r.id))).length, classify: cls });
  await shot(page, 'p13-2-4-after-all', log);
  step('판에 올린 고정 자료 대화 파일은 그대로', [ID.parent, ID.featx, ID.running].every((id) => made.made.some((x) => x.cid === id && fs.existsSync(fixtureFile(x.cwd, id)))), {});
} catch (e) {
  step('예외', false, { error: e.stack });
  await shot(page, 'p13-error', log).catch(() => {});
} finally {
  writeJson('p13-convos.json', result);
  log(`결과: ${result.steps.filter((s) => s.ok).length}/${result.steps.length} 통과`);
  await closeApp(app);
  process.exit(result.steps.every((s) => s.ok) ? 0 : 1);
}
