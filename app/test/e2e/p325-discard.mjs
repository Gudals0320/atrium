// P325 창 시험: 워크트리 치우기(카드 ⋯ 메뉴 "워크트리 치우기…" → 확인 상자 → merger 또는 판이 지움).
// 판: 따로 띄운 개발용 판(atrium-dev-p325, 48075, 창 디버깅 9556)만. 판 변수를 지운 셸에서 그 판의 환경으로 부른다.
// 미리: 시험 저장소(이미 신뢰된 빈 폴더에 git init, 커밋한 .claude/settings.json으로 git·atrium 허용)를 워크스페이스로 열어 둔다.
// 단계: off(merger 끔: 빠른 창 세션 → 커밋 → 치우기, 판이 직접 지움, 브랜치 남김), on(merger 켬: 세션 → 커밋+변경 → 치우기(force, 브랜치 지움), merger가 지움).
// 결과는 experiments/p325/<단계>/(저장소 밖).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const STEP = process.argv[2] || 'off';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const OUT = path.join(REPO, 'experiments', 'p325', STEP);
if (process.env.ATRIUM_TERMINAL_SESSION !== 'atrium-dev-p325' || process.env.ATRIUM_PORT !== '48075') throw new Error('개발용 판(atrium-dev-p325, 48075) 환경에서만 돈다');
const TREPO = process.env.P325_REPO;
if (!TREPO) throw new Error('P325_REPO(시험 저장소)를 준다');
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
fs.mkdirSync(OUT, { recursive: true });
const { logger, sleep, launch, closeApp } = await import('./harness.mjs');
const log = logger('p325-' + STEP);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 120000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const git = (...a) => { try { return execFileSync('git', ['-C', TREPO, ...a], { encoding: 'utf8', windowsHide: true }).trim(); } catch { return null; } };
const gw = (dir, ...a) => execFileSync('git', ['-C', dir, '-c', 'user.name=p325', '-c', 'user.email=p325@example.invalid', '-c', 'commit.gpgsign=false', ...a], { encoding: 'utf8', windowsHide: true });
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + JSON.stringify(detail).slice(0, 800) : '')); };
const boxOf = (page, sel, pad = 8) => page.evaluate(([s, p]) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); const x = Math.max(0, r.left - p), y = Math.max(0, r.top - p); return { x, y, width: Math.min(window.innerWidth - x, r.width + 2 * p), height: Math.min(window.innerHeight - y, r.height + 2 * p) }; }, [sel, pad]);
const until = async (fn, ms, what) => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error('시간 초과: ' + what); await sleep(1000); } };
const wsKey = (page) => page.evaluate((root) => { const w = window.__mt.getState().workspaces.find((x) => String(x.root).toLowerCase() === root.toLowerCase()); return w ? w.key : null; }, TREPO.split(path.sep).join('/'));
const sess = (page) => page.evaluate(() => [...window.__mt.getState().sessions.values()].map((s) => ({ id: s.sessionId, name: s.name, state: s.state, kind: s.kind, git: s.git || null })));
const worktrees = () => (git('worktree', 'list', '--porcelain') || '').split('\n').filter((l) => l.startsWith('worktree ')).map((l) => l.slice(9).toLowerCase());
const hasBranch = (b) => !!git('rev-parse', '--verify', '--quiet', 'refs/heads/' + b);
async function fit(page, key) { await page.evaluate((k) => { const st = window.__mt.getState(); if (st.fitWorkspace) st.fitWorkspace(k); }, key); await sleep(900); }
async function lang(page, l) { call('settings.set', { key: 'language', value: l }); await page.waitForFunction((x) => document.documentElement.lang === x, l, { timeout: 10000 }).catch(() => {}); await sleep(600); }
async function emptyInRegion(page, key) {
  return page.evaluate((k) => {
    const box = document.querySelector('.mt-region[data-ws="' + CSS.escape(k) + '"] .mt-region-box');
    if (!box) return null;
    const r = box.getBoundingClientRect();
    const nodes = [...document.querySelectorAll('.react-flow__node-session, .react-flow__node-wtarea')].map((n) => n.getBoundingClientRect());
    for (const [fx, fy] of [[0.97, 0.97], [0.03, 0.97], [0.97, 0.5], [0.5, 0.97], [0.03, 0.5]]) {
      const x = r.left + r.width * fx, y = r.top + r.height * fy;
      if (!nodes.some((n) => x >= n.left - 4 && x <= n.right + 4 && y >= n.top - 4 && y <= n.bottom + 4) && x > 0 && y > 0 && x < innerWidth && y < innerHeight) return { x, y };
    }
    return { x: r.left + 6, y: r.bottom - 6 };
  }, key);
}
async function cardMenu(page, sid) {
  await page.evaluate((id) => { const st = window.__mt.getState(); if (st.navigateTo) st.navigateTo(id, { viewOnly: true }); }, sid);
  await sleep(900);
  await page.click('.react-flow__node[data-id="' + sid + '"] [data-action=node-menu]');
  await page.waitForSelector('[data-role=node-menu] [data-action=wt-discard]', { timeout: 8000 });
  await page.waitForFunction(() => { const h = document.querySelector('[data-role=merge-hint]'); return h && /→/.test(h.textContent); }, null, { timeout: 10000 }).catch(() => {});
  await sleep(300);
}
async function openDialog(page, sid) {
  await cardMenu(page, sid);
  await page.click('[data-role=node-menu] [data-action=wt-discard]');
  await page.waitForSelector('[data-role=wt-discard] [data-role=wtd-facts]', { timeout: 15000 });
  await sleep(400);
}
const dialogVals = (page) => page.evaluate(() => {
  const d = document.querySelector('[data-role=wt-discard]'); const f = (k) => (d.querySelector('[data-field=' + k + ']') || {}).textContent || null;
  const cb = (k) => { const e = d.querySelector('[data-field=' + k + ']'); return e ? e.checked : null; };
  return { via: d.dataset.via, branch: f('branch'), ahead: f('ahead'), dirty: f('dirty'), path: f('path'), warn: !!d.querySelector('[data-role=wtd-warn]'), keep: cb('wtd-keep'), force: cb('wtd-force'), goDisabled: d.querySelector('[data-action=wtd-go]').disabled, how: (d.querySelector('[data-role=wtd-how]') || {}).textContent || null, title: d.querySelector('h3').textContent };
});
async function makeSession(page, key, name, viaUi) {
  if (viaUi) {
    const p = await emptyInRegion(page, key);
    await page.mouse.move(p.x, p.y); await page.mouse.click(p.x, p.y, { button: 'right' });
    await page.waitForSelector('[data-role=pane-menu]', { timeout: 5000 });
    await page.click('[data-action=pane-worktree]');
    await page.waitForSelector('[data-role=quick-worktree]', { timeout: 5000 });
    await page.waitForFunction(() => { const i = document.querySelector('[data-field=qwt-name]'); return i && i.value; }, null, { timeout: 8000 });
    await page.fill('[data-field=qwt-name]', name);
    await page.click('[data-action=qwt-go]');
  } else call('session.worktree', { workspace: key, name, kind: 'claude', model: 'haiku' });
  const s = await until(async () => (await sess(page)).find((x) => x.name === name), 60000, '새 세션');
  const inWt = await until(async () => { const x = (await sess(page)).find((y) => y.name === name); return x && x.git && x.git.isWorktree ? x : null; }, 120000, '워크트리 안').catch(() => null);
  check(name + ': claude -w 세션이 워크트리(worktree-' + name + ')에서 돈다', inWt && inWt.git.branch === 'worktree-' + name, inWt && inWt.git);
  await until(async () => (await sess(page)).find((y) => y.name === name && y.state === 'ready'), 90000, '세션 준비').catch(() => {});
  return s;
}
function commitIn(name) {
  const wt = path.join(TREPO, '.claude', 'worktrees', name);
  const f = 'work-' + name + '-' + Date.now().toString(36) + '.txt';
  fs.writeFileSync(path.join(wt, f), 'p325\n'); gw(wt, 'add', f); gw(wt, 'commit', '-q', '-m', 'p325 ' + name);
  return wt;
}

const { app, page } = await launch({ log, args: ['--remote-debugging-port=9556'] });
try {
  await page.setViewportSize({ width: 1500, height: 960 }).catch(() => {});
  await sleep(2500);
  const key = await until(() => wsKey(page), 20000, '시험 리포 워크스페이스');
  await fit(page, key);
  await lang(page, 'ko');
  const name = STEP === 'off' ? 'dz-off-' + Date.now().toString(36).slice(-3) : 'dz-on-' + Date.now().toString(36).slice(-3);
  call('settings.set', { key: 'mergerMode', value: STEP === 'on' ? 'on' : 'off' });
  const s = await makeSession(page, key, name, STEP === 'off');
  const wt = commitIn(name);
  if (STEP === 'on') fs.writeFileSync(path.join(wt, 'wip.txt'), 'not committed\n');
  await sleep(12000); // 판의 git 다시 읽기
  await fit(page, key); await sleep(800);
  for (const l of ['ko', 'en']) {
    await lang(page, l);
    await cardMenu(page, s.id);
    const rows = await page.$$eval('[data-role=node-menu] [data-action]', (xs) => xs.map((x) => x.dataset.action));
    check(l + ' 카드 메뉴: 병합 맡기기 다음 워크트리 치우기…', rows.indexOf('wt-discard') === rows.indexOf('merge-ask') + 1, rows);
    await page.screenshot({ path: path.join(OUT, '01-card-menu-' + l + '.png') });
    await page.click('[data-role=node-menu] [data-action=menu-close]').catch(() => page.keyboard.press('Escape')); await sleep(300);
    await openDialog(page, s.id);
    const v = await dialogVals(page);
    check(l + ' 확인 상자: 브랜치·앞선 커밋 1·변경·경고·브랜치 남기기 켬', v.branch === 'worktree-' + name && v.ahead === '1' && v.warn && v.keep === true && v.via === (STEP === 'on' ? 'merger' : 'board'), v);
    if (STEP === 'on') check(l + ' 변경이 있으면 force 칸(끔)과 치우기 막힘', v.dirty === '1' && v.force === false && v.goDisabled, v);
    else check(l + ' 변경 없음: force 칸 없음, 치우기 누를 수 있음', v.dirty === '0' && v.force === null && !v.goDisabled, v);
    await page.screenshot({ path: path.join(OUT, '02-dialog-' + l + '.png'), clip: await boxOf(page, '[data-role=wt-discard]', 12) });
    if (l === 'ko') await page.screenshot({ path: path.join(OUT, '02-dialog-full-ko.png') });
    await page.click('[data-action=wtd-cancel]'); await sleep(400);
  }
  await lang(page, 'ko');
  await openDialog(page, s.id);
  if (STEP === 'on') { await page.click('[data-field=wtd-keep]'); await page.click('[data-field=wtd-force]'); await sleep(200); await page.screenshot({ path: path.join(OUT, '03-dialog-force-ko.png'), clip: await boxOf(page, '[data-role=wt-discard]', 12) }); }
  await page.click('[data-action=wtd-go]');
  log('치우기 누름');
  const closed = await until(async () => !(await sess(page)).some((y) => y.name === name), 120000, '세션 닫힘').catch(() => false);
  check('치우기 → 세션이 닫힌다', closed);
  const gone = await until(() => !worktrees().some((w) => w.endsWith('/.claude/worktrees/' + name)) && !fs.existsSync(wt), STEP === 'on' ? 600000 : 60000, '워크트리 지워짐').catch(() => false);
  check((STEP === 'on' ? 'merger가' : '판이') + ' 워크트리를 지웠다', gone, worktrees());
  await sleep(STEP === 'on' ? 5000 : 1500);
  if (STEP === 'on') check('브랜치 남기기를 끄면 브랜치도 지운다', !hasBranch('worktree-' + name));
  else check('브랜치 남기기(기본)면 브랜치는 남는다', hasBranch('worktree-' + name));
  const ev = JSON.parse(atrium('--json', 'events', '--limit', '200')); const evs = (ev.events || ev || []).filter((e) => /worktree_discard|discard_/.test(e.kind || e.type || ''));
  log('판 이벤트: ' + JSON.stringify(evs).slice(0, 1500));
  await fit(page, key); await sleep(1200);
  await page.screenshot({ path: path.join(OUT, '04-after-ko.png') });
} catch (e) { check('예외 없이', false, e.message); }
finally {
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  await closeApp(app);
  log('결과 ' + results.filter((r) => r.ok).length + '/' + results.length);
  process.exit(0);
}
