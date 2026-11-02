// P27 창 시험: 워크트리 영역과 브랜치 화살표. 판: herdr 세션 atrium-dev-p27, 포트 47846, 이 워크트리의 backend/.dev(experiments/p27/tools/env.cjs).
// 시험 저장소 C:\Workspace\mtask-p27-repo를 새로 git init하고 워크트리 둘(저장소 안 .claude\worktrees\feat-a, 저장소 밖 mtask-p27-wt-b)을 만든다.
// 세션은 셸 노드만 쓰고(신뢰 대화상자가 없다), 판 밖 대화는 고정 자료(backend/.dev/p27-projects)로 둔다. claude는 띄우지 않는다.
// 사용: node experiments/p27/tools/e2e.cjs p27-worktrees.mjs [--fresh]
// 차례: 1 워크트리 둘 → 영역 둘과 화살표 → 2 셸·대화 노드가 그 영역에 → 3 리포 영역을 끌면 함께, 워크트리 영역만 끌면 그것만
//       → 4 다시 켜도(창과 백엔드) 같은 자리 → 5 워크트리 하나를 지우면 그 영역과 화살표가 사라진다
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { _electron as electron } from 'playwright';
import { APP_ROOT, REPO, OUT, sleep, until, logger, closeApp } from './harness.mjs';
import { assertTestBoard } from './p9-guard.mjs';

if (process.env.MT_E2E_OUT !== 'p27') throw new Error('MT_E2E_OUT=p27를 명령줄에서 준다');
const T = createRequire(import.meta.url)(path.join(REPO, 'experiments', 'p27', 'tools', 'env.cjs'));
const ENV = Object.fromEntries(Object.entries(T.P27_ENV).filter(([k]) => k.startsWith('ATRIUM_')));
assertTestBoard(ENV, { root: T.DEV });
if (ENV.ATRIUM_HERDR_SESSION !== 'atrium-dev-p27' || ENV.ATRIUM_PORT !== '47846') throw new Error('P27 판(atrium-dev-p27, 47846)만');
for (const d of [T.REPO, T.WT_B]) if (!/^C:\\Workspace\\mtask-p27-/.test(d)) throw new Error(`시험 폴더는 C:\\Workspace\\mtask-p27-*만: ${d}`);
fs.mkdirSync(OUT, { recursive: true });

const log = logger('p27-worktrees');
const cleanEnv = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(CLAUDECODE|CLAUDE_CODE_|CLAUDE_EFFORT|CLAUDE_PID|CLAUDE_AGENT_SDK|ELECTRON_RUN_AS_NODE)/.test(k)));
const env = { ...cleanEnv(), ...ENV, MT_HERDR_SESSION: ENV.ATRIUM_HERDR_SESSION };
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env, timeout: 120000 });
const git = (cwd, ...a) => execFileSync('git', ['-C', cwd, ...a], { encoding: 'utf8', windowsHide: true });
const results = [];
const step = (name, ok, detail) => { results.push({ name, ok: !!ok, detail }); log(`${ok ? '통과' : '실패'} ${name}`, detail ?? ''); };
const shot = async (page, name) => { const f = path.join(OUT, `${name}.png`); await page.screenshot({ path: f }); log('스크린숏', path.relative(REPO, f)); };
const call = (page, m, p = {}) => page.evaluate(([mm, pp]) => window.__mt.api.call(mm, pp), [m, p]);
const norm = (p) => p.replace(/\\/g, '/');
const keyOf = (p) => norm(p).toLowerCase();

// ---------- 준비: 시험 저장소, 고정 자료 대화 ----------
const fresh = process.argv.includes('--fresh');
if (fresh) {
  try { log('백엔드 멈춤', atrium('backend', 'stop').trim()); } catch (e) { log('백엔드 멈춤', e.message.slice(0, 120)); } // 판 데이터 폴더를 지우기 전에
  await sleep(800);
  for (const d of [path.join(T.DEV, 'data'), path.join(T.DEV, 'app'), T.PROJECTS, T.SESSIONS]) fs.rmSync(d, { recursive: true, force: true });
  if (fs.existsSync(T.WT_B)) { try { git(T.REPO, 'worktree', 'remove', '--force', T.WT_B); } catch {} fs.rmSync(T.WT_B, { recursive: true, force: true }); }
  fs.rmSync(T.REPO, { recursive: true, force: true });
}
fs.mkdirSync(T.SESSIONS, { recursive: true });
if (!fs.existsSync(path.join(T.REPO, '.git'))) {
  fs.mkdirSync(T.REPO, { recursive: true });
  git(T.REPO, 'init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(T.REPO, 'README.md'), 'p27 test repo\n');
  fs.writeFileSync(path.join(T.REPO, '.gitignore'), '.claude/\n');
  git(T.REPO, 'add', '.');
  git(T.REPO, '-c', 'user.email=p27@test', '-c', 'user.name=p27', 'commit', '-q', '-m', 'init');
}
const NOW = Date.now();
const iso = (ms) => new Date(ms).toISOString();
const CID = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-00000000a027`;
function convo(cwd, id, at, text) {
  const dir = path.join(T.PROJECTS, path.resolve(cwd).replace(/[^A-Za-z0-9]/g, '-'));
  fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, `${id}.jsonl`);
  const line = (type, content, t) => JSON.stringify({ type, uuid: `${type[0]}${id}${t}`, sessionId: id, cwd, entrypoint: 'cli', timestamp: iso(t), message: { role: type, content } });
  fs.writeFileSync(f, [line('user', text, at), line('assistant', [{ type: 'text', text: `${text} — 답` }], at + 2000)].join('\n') + '\n');
  const tt = new Date(at + 6000); fs.utimesSync(f, tt, tt);
}
// 본 저장소 대화 하나, 워크트리 feat-a 대화 둘(폴더는 워크트리를 만든 뒤 생긴다. 대화 기록은 미리 둔다)
convo(T.REPO, CID(1), NOW - 3 * 3600000, '본 저장소에서 한 일');
convo(T.WT_A, CID(2), NOW - 2 * 3600000, 'feat-a 워크트리에서 한 일 하나');
convo(T.WT_A, CID(3), NOW - 1 * 3600000, 'feat-a 워크트리에서 한 일 둘');

let app = null, page = null;
async function open() {
  app = await electron.launch({ args: ['.', '--dev'], cwd: APP_ROOT, env, timeout: 60000 });
  page = await app.firstWindow();
  page.on('pageerror', (e) => log(`[pageerror] ${e.message}`));
  await page.waitForFunction(() => window.__mt && window.__mt.getState().boardLoaded, null, { timeout: 90000 });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1584, 921));
  await sleep(500);
}
const repoKey = keyOf(path.join(T.REPO, '.git'));
const areaK = (wt) => `${repoKey}#wt=${keyOf(wt)}`;
// 판 상태: 워크트리 영역, 노드 자리, DOM의 영역·화살표
const snap = () => page.evaluate(([rk]) => {
  const st = window.__mt.getState();
  const w = st.workspaces.find((x) => x.key === rk);
  const sess = [...st.sessions.values()].filter((s) => s.workspaceKey === rk).map((s) => ({ name: s.name, id: s.sessionId, cwd: s.cwdNow, ...(st.nodes.get(s.sessionId) || {}) }));
  const convos = [...st.convoNodes.values()].filter((c) => c.workspaceKey === rk).map((c) => ({ id: c.convId, x: c.x, y: c.y, w: c.w, h: c.h, area: c.area, block: c.block, title: c.title }));
  const flow = (sel) => [...document.querySelectorAll(sel)].map((e) => { const r = e.getBoundingClientRect(); return { id: e.getAttribute('data-id'), x: r.x, y: r.y, w: r.width, h: r.height, text: e.innerText.replace(/\s+/g, ' ').trim() }; });
  return { areas: w ? w.worktrees || [] : null, sess, convos, regions: flow('.react-flow__node-region'), wtareas: flow('.react-flow__node-wtarea'), arrows: flow('.react-flow__node-wtarrow'), vp: st.vpNow };
}, [repoKey]);
// 화면 사각형 안인가(판 좌표 → 화면은 DOM으로 본다)
const boxOf = (s, id) => s.wtareas.find((a) => a.id === `wa:${id}`) || s.regions.find((a) => a.id === `ws:${id}`) || null;
const domNode = (id) => page.evaluate((nid) => { const e = document.querySelector(`.react-flow__node[data-id="${nid}"]`); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }, id);
const within = (r, q, pad = 1) => !!(r && q) && r.x >= q.x - pad && r.y >= q.y - pad && r.x + r.w <= q.x + q.w + pad && r.y + r.h <= q.y + q.h + pad;
const fitRepo = async () => { await page.evaluate((k) => window.__mt.getState().fitWorkspace(k), repoKey); await sleep(800); };
async function dragBy(sel, dx, dy) {
  const h = await page.$(sel);
  const b = await h.boundingBox();
  const sx = b.x + Math.min(40, b.width / 2), sy = b.y + b.height / 2;
  await page.mouse.move(sx, sy); await page.mouse.down();
  for (let i = 1; i <= 12; i++) { await page.mouse.move(sx + (dx * i) / 12, sy + (dy * i) / 12); await sleep(25); }
  await page.mouse.up();
  await sleep(1200);
}
const shells = [];
try {
  await open();
  await call(page, 'settings.set', { language: 'ko' });
  await call(page, 'workspace.open', { path: T.REPO });
  await page.waitForSelector('.react-flow__node-region');
  // 본 저장소 셸
  log(atrium('spawn', T.REPO, '--kind', 'shell', '--name', 'main-sh').trim().split('\n').slice(-1)[0]);
  shells.push('main-sh');
  await until(async () => (await snap()).sess.some((s) => s.name === 'main-sh'), 20000);
  await fitRepo();
  let s0 = await snap();
  step('처음에는 워크트리 영역이 없다', s0.areas && s0.areas.length === 0 && s0.wtareas.length === 0 && s0.arrows.length === 0, { areas: s0.areas, wt: s0.wtareas.length });
  await shot(page, 'p27-0-before');

  // 1. 워크트리 둘
  git(T.REPO, 'worktree', 'add', '-q', '-b', 'feat-a', T.WT_A);
  git(T.REPO, 'worktree', 'add', '-q', '-b', 'fix-b', T.WT_B);
  const s1 = await until(async () => { const s = await snap(); return s.areas.length === 2 && s.wtareas.length === 2 && s.arrows.length === 2 ? s : null; }, 30000, 500).catch(async () => snap());
  step('워크트리 둘을 만들면(10초 주기 안에) 영역 둘과 화살표 둘이 생긴다', s1.areas.length === 2 && s1.wtareas.length === 2 && s1.arrows.length === 2, { areas: s1.areas.map((a) => [a.branch, a.path]), dom: s1.wtareas.map((a) => a.text), arrows: s1.arrows.map((a) => a.text) });
  const main1 = boxOf(s1, repoKey), a1 = boxOf(s1, areaK(T.WT_A)), b1 = boxOf(s1, areaK(T.WT_B));
  step('워크트리 영역은 본 영역 오른쪽(또는 아래)에 겹치지 않게 놓인다', main1 && a1 && b1 && a1.x >= main1.x + main1.w && b1.x >= main1.x + main1.w && (b1.y >= a1.y + a1.h || b1.x >= a1.x + a1.w), { main1, a1, b1 });
  step('영역 이름표는 ⎇ 브랜치 이름과 세는 값', /⎇ feat-a/.test(a1.text) && /세션 0/.test(a1.text) && /⎇ fix-b/.test(b1.text), [a1.text, b1.text]);
  step('화살표 글은 브랜치 이름', s1.arrows.some((x) => /feat-a/.test(x.text)) && s1.arrows.some((x) => /fix-b/.test(x.text)), s1.arrows.map((x) => x.text));
  await fitRepo();
  await shot(page, 'p27-1-two-areas');

  // 2. 워크트리 폴더의 셸 노드와 대화 노드가 그 영역에
  log(atrium('spawn', T.WT_A, '--kind', 'shell', '--name', 'a-sh').trim().split('\n').slice(-1)[0]); shells.push('a-sh');
  log(atrium('spawn', T.WT_B, '--kind', 'shell', '--name', 'b-sh').trim().split('\n').slice(-1)[0]); shells.push('b-sh');
  await call(page, 'recall.list', {}).catch(() => null); // 대화 목록 훑기(고정 자료)
  const s2 = await until(async () => { const s = await snap(); const c = s.convos.filter((x) => x.area === keyOf(T.WT_A)); return s.sess.length === 3 && c.length === 2 && c.every((x) => x.title) ? s : null; }, 40000, 500).catch(async () => snap());
  await fitRepo();
  const s2b = await snap();
  const inArea = async (nid, ak) => within(await domNode(nid), boxOf(s2b, ak));
  const aSh = s2b.sess.find((x) => x.name === 'a-sh'), bSh = s2b.sess.find((x) => x.name === 'b-sh'), mSh = s2b.sess.find((x) => x.name === 'main-sh');
  step('워크트리 폴더의 셸 노드가 그 워크트리 영역 안에 놓인다', aSh && bSh && aSh.area === keyOf(T.WT_A) && bSh.area === keyOf(T.WT_B) && (await inArea(aSh.id, areaK(T.WT_A))) && (await inArea(bSh.id, areaK(T.WT_B))), { aSh: aSh && { area: aSh.area, cwd: aSh.cwd }, bSh: bSh && { area: bSh.area } });
  step('본 저장소 셸은 본 영역에 그대로', mSh && !mSh.area && (await inArea(mSh.id, repoKey)), mSh && { area: mSh.area });
  const cA = s2b.convos.filter((x) => x.area === keyOf(T.WT_A));
  const cIn = await Promise.all(cA.map((c) => inArea(`convo:${c.id}`, areaK(T.WT_A))));
  step('판 밖 대화 노드(feat-a 폴더의 대화 둘)가 feat-a 영역 안에, 워크트리 배경 블록 없이', cA.length === 2 && cIn.every(Boolean) && cA.every((c) => !c.block && c.title), { convos: s2.convos.map((c) => [c.id.slice(0, 8), c.area, c.block, c.title]) });
  const cMain = s2b.convos.find((x) => x.id === CID(1));
  step('본 저장소 대화 노드는 본 영역', cMain && !cMain.area && (await inArea(`convo:${cMain.id}`, repoKey)), cMain && { area: cMain.area });
  const ab = boxOf(s2b, areaK(T.WT_A));
  step('세는 값이 바뀐다(세션 1, 대화 2)', /세션 1/.test(ab.text) && /대화 2/.test(ab.text), ab.text);
  await shot(page, 'p27-2-nodes-in-areas');

  // 2b. 지금 폴더가 바뀌면(셸에서 cd, claude는 hook cwd) 그 영역으로 옮기고, 본 저장소로 돌아오면 본 영역으로
  const areaOfName = async (n) => ((await snap()).sess.find((x) => x.name === n) || {}).area;
  atrium('input', 'main-sh', `cd ${norm(T.WT_A)}\\r`); // atrium input은 \e \r \n \t \xNN을 풀므로 경로는 슬래시로
  const went = await until(async () => ((await areaOfName('main-sh')) === keyOf(T.WT_A) ? true : null), 40000, 500).catch(() => false);
  await fitRepo();
  const s2c = await snap();
  const mNow = s2c.sess.find((x) => x.name === 'main-sh');
  step('본 저장소 셸이 워크트리 폴더로 cd하면 그 워크트리 영역으로 옮긴다', went && within(await domNode(mNow.id), boxOf(s2c, areaK(T.WT_A))), { area: mNow.area, cwd: mNow.cwd });
  await shot(page, 'p27-2b-cd-into-worktree');
  atrium('input', 'main-sh', `cd ${norm(T.REPO)}\\r`);
  const back = await until(async () => ((await areaOfName('main-sh')) === '' ? true : null), 40000, 500).catch(() => false);
  const s2d = await snap();
  const mBack = s2d.sess.find((x) => x.name === 'main-sh');
  step('본 저장소로 cd하면 본 영역으로 돌아온다', back && within(await domNode(mBack.id), boxOf(s2d, repoKey)), { area: mBack.area, cwd: mBack.cwd });

  // 3. 리포 영역을 끌면 워크트리 영역도 함께
  const before = await call(page, 'worktree.list', { workspace: repoKey });
  const nodesBefore = Object.fromEntries((await snap()).sess.map((x) => [x.name, { x: x.x, y: x.y }]));
  const z = (await snap()).vp.zoom;
  await dragBy(`.react-flow__node-region[data-id="ws:${repoKey}"] .mt-rdrag`, -120, 90);
  const after = await call(page, 'worktree.list', { workspace: repoKey });
  const nodesAfter = Object.fromEntries((await snap()).sess.map((x) => [x.name, { x: x.x, y: x.y }]));
  const dx = Math.round(nodesAfter['main-sh'].x - nodesBefore['main-sh'].x), dy = Math.round(nodesAfter['main-sh'].y - nodesBefore['main-sh'].y);
  const same = (p, q) => Math.abs(p - q) <= 1;
  step('리포 영역을 끌면 워크트리 영역 자리와 그 안의 셸이 같은 만큼 움직인다', Math.abs(dx) > 20 && before.every((a, i) => same(after[i].x - a.x, dx) && same(after[i].y - a.y, dy)) && ['a-sh', 'b-sh'].every((n) => same(nodesAfter[n].x - nodesBefore[n].x, dx) && same(nodesAfter[n].y - nodesBefore[n].y, dy)), { zoom: z, dx, dy, areas: after.map((a, i) => [a.x - before[i].x, a.y - before[i].y]) });
  await shot(page, 'p27-3-moved-with-repo');
  // 워크트리 영역 B만 끌면 그것만(자리를 저장한다)
  const bBefore = after.find((a) => a.branch === 'fix-b'), aBefore = after.find((a) => a.branch === 'feat-a');
  await dragBy(`.react-flow__node-wtarea[data-id="wa:${areaK(T.WT_B)}"] .mt-wadrag`, 160, 60);
  const after2 = await call(page, 'worktree.list', { workspace: repoKey });
  const bAfter = after2.find((a) => a.branch === 'fix-b'), aAfter = after2.find((a) => a.branch === 'feat-a');
  const n2 = Object.fromEntries((await snap()).sess.map((x) => [x.name, { x: x.x, y: x.y }]));
  step('워크트리 영역만 끌면 그 영역과 안의 셸만 움직이고 자리를 저장한다', bAfter.x !== bBefore.x && bAfter.movedAt && aAfter.x === aBefore.x && aAfter.y === aBefore.y && same(n2['b-sh'].x - nodesAfter['b-sh'].x, bAfter.x - bBefore.x) && same(n2['main-sh'].x, nodesAfter['main-sh'].x), { b: [bAfter.x - bBefore.x, bAfter.y - bBefore.y], a: [aAfter.x - aBefore.x, aAfter.y - aBefore.y] });
  await fitRepo();
  await shot(page, 'p27-4-moved-one-area');

  // 4. 다시 켜도 같은 자리(창과 백엔드를 끄고 다시 띄운다. herdr 서버와 셸은 그대로)
  const keep = { areas: after2, nodes: n2, convos: Object.fromEntries((await snap()).convos.map((c) => [c.id, [c.x, c.y]])) };
  await closeApp(app); app = null;
  log(atrium('backend', 'stop').trim());
  await sleep(1500);
  await open();
  const s4 = await until(async () => { const s = await snap(); return s.wtareas.length === 2 && s.sess.length === 3 && s.convos.length === 3 ? s : null; }, 40000, 500).catch(async () => snap());
  const again = await call(page, 'worktree.list', { workspace: repoKey });
  step('다시 켜도 워크트리 영역, 셸 노드, 대화 노드의 자리가 같다', JSON.stringify(again.map((a) => [a.wt, a.x, a.y])) === JSON.stringify(keep.areas.map((a) => [a.wt, a.x, a.y])) && s4.sess.every((x) => same(x.x, keep.nodes[x.name].x) && same(x.y, keep.nodes[x.name].y)) && s4.convos.every((c) => keep.convos[c.id] && same(c.x, keep.convos[c.id][0]) && same(c.y, keep.convos[c.id][1])), { areas: again.map((a) => [a.branch, a.x, a.y]) });
  await fitRepo();
  await shot(page, 'p27-5-after-restart');

  // 5. 워크트리 하나를 지우면 그 영역과 화살표가 사라진다. 그 폴더의 셸은 먼저 끈다(셸이 폴더를 쥐고 있으면 지우지 못한다)
  log(atrium('kill', 'b-sh', '--yes').trim().split('\n').slice(-1)[0]); shells.splice(shells.indexOf('b-sh'), 1);
  await sleep(1500);
  git(T.REPO, 'worktree', 'remove', '--force', T.WT_B);
  const s5 = await until(async () => { const s = await snap(); return s.wtareas.length === 1 && s.arrows.length === 1 ? s : null; }, 30000, 500).catch(async () => snap());
  step('워크트리 하나를 지우면 그 영역과 화살표가 사라진다(다른 하나는 남는다)', s5.areas.length === 1 && s5.areas[0].branch === 'feat-a' && s5.wtareas.length === 1 && s5.arrows.length === 1 && /feat-a/.test(s5.arrows[0].text), { areas: s5.areas.map((a) => a.branch), dom: s5.wtareas.map((a) => a.text) });
  await fitRepo();
  await shot(page, 'p27-6-one-removed');
} catch (e) {
  log('오류', e.stack);
  step('시험이 끝까지 돌았다', false, e.message);
} finally {
  for (const n of shells) { try { log(atrium('kill', n, '--yes').trim().split('\n').slice(-1)[0]); } catch (e) { log('kill', n, e.message.slice(0, 200)); } }
  if (app) await closeApp(app);
  const pass = results.filter((r) => r.ok).length;
  log(`결과 ${pass}/${results.length}`);
  fs.writeFileSync(path.join(OUT, 'p27-worktrees.json'), JSON.stringify({ at: new Date().toISOString(), pass, total: results.length, results }, null, 2));
  process.exit(pass === results.length ? 0 : 1);
}
