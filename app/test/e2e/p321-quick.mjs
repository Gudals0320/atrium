// P321 창 시험: 빠른 워크트리 세션(판 빈 곳 우클릭 메뉴, 빠른 창, 단축키 W, 영역 이름표 메뉴)과 병합 맡기기(카드 ⋯ 메뉴).
// 판: 따로 띄운 개발용 판(atrium-dev-p321, 48071, 창 디버깅 9552)만. 판 변수를 지운 셸에서 그 판의 환경으로 부른다.
// 미리: 시험 저장소(이미 신뢰된 빈 폴더에 git init, 커밋한 .claude/settings.json으로 git·atrium 허용)를 워크스페이스로 열고 haiku 리드(lead)를 띄워 둔다.
// 단계: shots(ko·en 그림만), run(Claude Code 워크트리 세션을 띄워 커밋 → 병합 맡기기 → merger 병합 확인), codex(빠른 창에서 Codex로 띄우기).
// 결과는 experiments/p321/<단계>/(저장소 밖).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const STEP = process.argv[2] || 'shots';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const OUT = path.join(REPO, 'experiments', 'p321', STEP);
if (process.env.ATRIUM_TERMINAL_SESSION !== 'atrium-dev-p321' || process.env.ATRIUM_PORT !== '48071') throw new Error('개발용 판(atrium-dev-p321, 48071) 환경에서만 돈다');
const TREPO = process.env.P321_REPO;
if (!TREPO) throw new Error('P321_REPO(시험 저장소)를 준다');
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
fs.mkdirSync(OUT, { recursive: true });
const { logger, sleep, launch, closeApp } = await import('./harness.mjs');
const log = logger('p321-' + STEP);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 120000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const git = (...a) => { try { return execFileSync('git', ['-C', TREPO, ...a], { encoding: 'utf8', windowsHide: true }).trim(); } catch { return null; } };
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + JSON.stringify(detail).slice(0, 800) : '')); };
const boxOf = (page, sel, pad = 8) => page.evaluate(([s, p]) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); const x = Math.max(0, r.left - p), y = Math.max(0, r.top - p); return { x, y, width: Math.min(window.innerWidth - x, r.width + 2 * p), height: Math.min(window.innerHeight - y, r.height + 2 * p) }; }, [sel, pad]);
const until = async (fn, ms, what) => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error('시간 초과: ' + what); await sleep(1000); } };
const wsKey = (page) => page.evaluate((root) => { const w = window.__mt.getState().workspaces.find((x) => String(x.root).toLowerCase() === root.toLowerCase()); return w ? w.key : null; }, TREPO.split(path.sep).join('/'));
const sess = (page) => page.evaluate(() => [...window.__mt.getState().sessions.values()].map((s) => ({ id: s.sessionId, name: s.name, state: s.state, kind: s.kind, git: s.git || null, cwd: s.cwdNow || s.cwd, peers: (s.branch && s.branch.peers) || [] })));
// 리포 영역 안 빈 곳(노드가 없는 곳). 영역 테두리 안쪽 왼쪽 아래 귀퉁이
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
async function fit(page, key) { await page.evaluate((k) => { const st = window.__mt.getState(); if (st.fitWorkspace) st.fitWorkspace(k); }, key); await sleep(900); }
async function lang(page, l) { call('settings.set', { key: 'language', value: l }); await page.waitForFunction((x) => document.documentElement.lang === x, l, { timeout: 10000 }).catch(() => {}); await sleep(600); }
async function paneMenu(page, key) {
  const p = await emptyInRegion(page, key);
  await page.mouse.move(p.x, p.y);
  await page.mouse.click(p.x, p.y, { button: 'right' });
  await page.waitForSelector('[data-role=pane-menu]', { timeout: 5000 });
  return p;
}
async function quick(page, key) {
  await paneMenu(page, key);
  await page.click('[data-action=pane-worktree]');
  await page.waitForSelector('[data-role=quick-worktree]', { timeout: 5000 });
  await page.waitForFunction(() => { const i = document.querySelector('[data-field=qwt-name]'); return i && i.value; }, null, { timeout: 8000 });
  await sleep(300);
}
async function cardMenu(page, sid) {
  await page.evaluate((id) => { const st = window.__mt.getState(); if (st.navigateTo) st.navigateTo(id, { viewOnly: true }); }, sid);
  await sleep(900);
  await page.click('.react-flow__node[data-id="' + sid + '"] [data-action=node-menu]');
  await page.waitForSelector('[data-role=node-menu] [data-action=merge-ask]', { timeout: 8000 });
  await page.waitForFunction(() => { const h = document.querySelector('[data-role=merge-hint]'); return h && /→/.test(h.textContent); }, null, { timeout: 10000 }).catch(() => {});
  await sleep(300);
}

const { app, page } = await launch({ log, args: ['--remote-debugging-port=9552'] });
try {
  await page.setViewportSize({ width: 1500, height: 960 }).catch(() => {});
  await sleep(2500);
  const key = await until(() => wsKey(page), 20000, '시험 리포 워크스페이스');
  const lead = (await sess(page)).find((s) => s.name === 'lead');
  check('리드가 판에 있다', !!lead, (await sess(page)).map((s) => s.name));
  await fit(page, key);
  if (STEP === 'shots') {
    for (const l of ['ko', 'en']) {
      await lang(page, l); await fit(page, key);
      await paneMenu(page, key);
      const items = await page.$$eval('[data-role=pane-menu] [data-action]', (xs) => xs.map((x) => [x.dataset.action, x.textContent, x.disabled]));
      check(l + ' 빈 곳 메뉴: 리포 이름·워크트리 세션·세션 띄우기·정리·맞추기', items.map((x) => x[0]).join() === 'pane-worktree,pane-spawn,pane-arrange,pane-fit', items);
      await page.screenshot({ path: path.join(OUT, '01-pane-menu-' + l + '.png') });
      await page.click('[data-action=pane-worktree]');
      await page.waitForSelector('[data-role=quick-worktree]', { timeout: 5000 });
      await page.waitForFunction(() => { const i = document.querySelector('[data-field=qwt-name]'); return i && i.value; }, null, { timeout: 8000 });
      await sleep(400);
      const q = await page.evaluate(() => ({ name: document.querySelector('[data-field=qwt-name]').value, launcher: document.querySelector('[data-field=qwt-launcher]').selectedOptions[0].textContent, peer: (document.querySelector('[data-role=qwt-peer]') || {}).textContent || null, checked: !!(document.querySelector('[data-field=qwt-peer]') || {}).checked, preview: document.querySelector('[data-role=qwt-preview]').textContent, focus: document.activeElement && document.activeElement.dataset.field }));
      check(l + ' 빠른 창: 자동 이름, 기본 런처, @lead 동료 켬, 미리 보기, 이름 칸 초점', /^wt-\d{4}-[a-z]$/.test(q.name) && /Claude Code/.test(q.launcher) && /@lead/.test(q.peer || '') && q.checked && q.preview.includes('worktree-' + q.name) && q.preview.includes('.claude/worktrees/' + q.name) && q.focus === 'qwt-name', q);
      await page.fill('[data-field=qwt-prompt]', 'search results UI');
      await sleep(200);
      const renamed = await page.$eval('[data-field=qwt-name]', (i) => i.value);
      check(l + ' 첫 지시의 영문 낱말로 이름을 다시 짓는다', renamed === 'search-results-ui', renamed);
      await page.fill('[data-field=qwt-prompt]', '');
      await sleep(200);
      await page.screenshot({ path: path.join(OUT, '02-quick-worktree-' + l + '.png') });
      await page.keyboard.press('Escape');
      await sleep(300);
      check(l + ' Esc로 닫힌다', !(await page.$('[data-role=quick-worktree]')));
      // 단축키 W(마우스가 리포 영역 위)
      const p = await emptyInRegion(page, key);
      await page.mouse.move(p.x, p.y); await page.mouse.click(p.x, p.y); await sleep(200);
      await page.keyboard.press('w');
      await sleep(500);
      check(l + ' 리포 영역 위에서 W = 빠른 창', !!(await page.$('[data-role=quick-worktree]')));
      await page.keyboard.press('Escape'); await sleep(300);
      await page.mouse.move(5, 300); await sleep(100);
      // 영역 이름표 메뉴
      await page.click('.mt-region[data-ws="' + key + '"] .mt-region-head', { button: 'right' });
      await page.waitForSelector('[data-role=region-menu]', { timeout: 5000 });
      check(l + ' 영역 이름표 메뉴에 워크트리 세션…', !!(await page.$('[data-role=region-menu] [data-action=region-worktree]')));
      await page.screenshot({ path: path.join(OUT, '01b-region-menu-' + l + '.png'), clip: await boxOf(page, '[data-role=region-menu]', 40) });
      await page.keyboard.press('Escape'); await sleep(300);
    }
    await lang(page, 'ko');
  }
  if (STEP === 'run') {
    await lang(page, 'ko'); await fit(page, key);
    await quick(page, key);
    const name = await page.$eval('[data-field=qwt-name]', (i) => i.value);
    await page.click('[data-action=qwt-go]');
    const s = await until(async () => (await sess(page)).find((x) => x.name === name), 60000, '새 세션');
    check('빠른 창 → 세션이 뜬다', !!s, s);
    const inWt = await until(async () => { const x = (await sess(page)).find((y) => y.name === name); return x && x.git && x.git.isWorktree ? x : null; }, 120000, '워크트리 안').catch(() => null);
    check('Claude Code 세션이 claude -w로 워크트리(worktree-' + name + ')에서 돈다', inWt && inWt.git.branch === 'worktree-' + name, inWt && inWt.git);
    check('리드와 동료로 이어졌다', inWt && inWt.peers.includes(lead.id), inWt && inWt.peers);
    await until(async () => (await sess(page)).find((y) => y.name === name && y.state === 'ready'), 90000, '세션 준비');
    await fit(page, key); await sleep(1500);
    await page.screenshot({ path: path.join(OUT, '03-card-peer-ko.png') });
    // 작은 커밋 하나
    const file = 'hello-' + name + '-' + Date.now().toString(36) + '.txt';
    atrium('send', '@' + name, 'Create a new file named ' + file + ' with the single line hi, then run git add ' + file + ' and git commit -m "add ' + file + '" in this folder. Reply with the short commit hash only.');
    const tip = await until(() => { const b = git('rev-parse', '--verify', '--quiet', 'refs/heads/worktree-' + name); const d = git('rev-parse', 'dev'); return b && d && b !== d ? b : null; }, 240000, '세션의 커밋').catch(() => null);
    check('세션이 워크트리 브랜치에 커밋했다', !!tip, tip);
    await until(async () => (await sess(page)).find((y) => y.name === name && y.state === 'ready'), 120000, '커밋 턴 끝').catch(() => {});
    await cardMenu(page, s.id);
    const hint = await page.$eval('[data-role=merge-hint]', (x) => x.textContent);
    check('카드 메뉴: 병합 맡기기 + 브랜치 → 합칠 브랜치 (보고는 @lead)', /worktree-/.test(hint) && /→ dev/.test(hint) && /@lead/.test(hint), hint);
    check('카드 메뉴: 관계 동료 @lead 줄', !!(await page.$('[data-role=node-menu] [data-role=peer-row]')));
    await page.screenshot({ path: path.join(OUT, '04-card-menu-ko.png') });
    await page.click('[data-role=node-menu] [data-action=menu-close]'); await sleep(300);
    await lang(page, 'en');
    await cardMenu(page, s.id);
    await page.screenshot({ path: path.join(OUT, '04-card-menu-en.png') });
    await page.click('[data-role=node-menu] [data-action=menu-close]'); await sleep(300);
    await lang(page, 'ko');
    await cardMenu(page, s.id);
    await page.click('[data-role=node-menu] [data-action=merge-ask]').catch(async () => { await cardMenu(page, s.id); await page.click('[data-role=node-menu] [data-action=merge-ask]'); });
    log('병합 맡기기 누름');
    const merged = await until(() => { const d = git('rev-parse', 'dev'); return tip && d && git('merge-base', '--is-ancestor', tip, 'dev') !== null ? d : null; }, 600000, 'dev에 병합').catch(() => null);
    check('merger가 dev에 병합했다(세션의 끝 커밋이 dev에)', !!merged, { tip, dev: merged });
    const closed = await until(async () => !(await sess(page)).some((y) => y.name === name), 180000, '세션 닫힘·보관').catch(() => false);
    check('병합 뒤 그 세션은 닫히고 보관된다', closed);
    await fit(page, key); await sleep(1000);
    await page.screenshot({ path: path.join(OUT, '05-after-merge-ko.png') });
  }
  if (STEP === 'codex') {
    await lang(page, 'ko'); await fit(page, key);
    await quick(page, key);
    await page.fill('[data-field=qwt-name]', 'cx-p321');
    await page.selectOption('[data-field=qwt-launcher]', { label: '★ Codex' }).catch(async () => { const v = await page.$eval('[data-field=qwt-launcher]', (s) => [...s.options].find((o) => /Codex/.test(o.textContent)).value); await page.selectOption('[data-field=qwt-launcher]', v); });
    await page.screenshot({ path: path.join(OUT, '06-quick-codex-ko.png'), clip: await boxOf(page, '[data-role=quick-worktree]', 16) });
    await page.click('[data-action=qwt-go]');
    const s = await until(async () => (await sess(page)).find((x) => x.name === 'cx-p321'), 60000, 'Codex 세션').catch(() => null);
    check('빠른 창 → Codex 세션이 뜬다', !!s && s.kind === 'codex', s);
    const wt = path.join(TREPO, '.claude', 'worktrees', 'cx-p321');
    check('판이 git worktree add로 워크트리와 브랜치를 만들었다', fs.existsSync(wt) && git('rev-parse', '--verify', '--quiet', 'refs/heads/worktree-cx-p321'), wt);
    await sleep(15000);
    const x = (await sess(page)).find((y) => y.name === 'cx-p321');
    check('Codex 세션이 그 워크트리 폴더에서 돈다', x && String(x.cwd || '').toLowerCase().replace(/\\/g, '/').endsWith('.claude/worktrees/cx-p321'), x);
    await fit(page, key); await sleep(800);
    await page.screenshot({ path: path.join(OUT, '07-codex-card-ko.png') });
    log('Codex 화면: ' + atrium('screen', 'cx-p321', '--text').slice(-1200));
    // 카드 메뉴(Codex 워크트리 세션). 커밋은 시험이 직접 만든다(Codex 턴을 쓰지 않는다)
    fs.writeFileSync(path.join(wt, 'cx.txt'), 'cx\n');
    execFileSync('git', ['-C', wt, '-c', 'user.name=p321', '-c', 'user.email=p321@example.invalid', 'add', 'cx.txt'], { windowsHide: true });
    execFileSync('git', ['-C', wt, '-c', 'user.name=p321', '-c', 'user.email=p321@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'cx'], { windowsHide: true });
    await sleep(12000); // 판의 git 다시 읽기(pollCwd)
    for (const l of ['ko', 'en']) {
      await lang(page, l);
      await cardMenu(page, s.id);
      const hint = await page.$eval('[data-role=merge-hint]', (e) => e.textContent);
      check(l + ' Codex 카드 메뉴: 병합 맡기기 ' + hint, /worktree-cx-p321/.test(hint) && /dev/.test(hint), hint);
      await page.screenshot({ path: path.join(OUT, '08-codex-card-menu-' + l + '.png') });
      await page.click('[data-role=node-menu] [data-action=menu-close]'); await sleep(300);
    }
    await lang(page, 'ko');
  }
} catch (e) { check('예외 없이', false, e.message); }
finally {
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  await closeApp(app);
  log('결과 ' + results.filter((r) => r.ok).length + '/' + results.length);
  process.exit(results.every((r) => r.ok) ? 0 : 1);
}
