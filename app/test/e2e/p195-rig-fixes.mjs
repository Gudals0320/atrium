// P195 창 시험: rig를 처음 써 본 보고에서 고친 것과 "Git 저장소로 시작". 따로 띄운 개발용 판(P195_BOARD, P195_PORT, P195_DATA)만, 창 원격 디버깅 포트 P195_DEBUG.
// 실행: node app/test/e2e/p195-rig-fixes.mjs <단계> [인자…]   (실제 판 변수를 지운 셸에서)
//   pre <rig 워크스페이스(git 아님, 틀 3 정의, 꺼짐)> <정의 없는 워크스페이스(git 아님)> <새 폴더(git 아님)> <저장소 안 폴더>
//     1) rig 판: 워크트리 자리 경고, 켜기 단계에도 경고  2) 만들기 대화상자: 워크트리 틀이 까닭과 함께 막힘  3) 프로젝트 열기: Git 저장소로 시작 확인란(켤 수 있음 / 저장소 안이면 막힘)
//   remote <rig 워크스페이스(켜짐)>   4) 원격 보기(창의 보기 전용 흉내)의 rig 판: 안내 한 줄, 끄기 단추만, 고치기 없음
// 그림은 ko·en 하나씩. 결과는 워크트리의 experiments/p195/shots/(저장소 밖).
import fs from 'node:fs';
import path from 'node:path';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const OUT = path.join(REPO, 'experiments', 'p195', 'shots');
const BOARD = process.env.P195_BOARD || 'atrium-dev-p195', PORT = process.env.P195_PORT || '47964', DEBUG = process.env.P195_DEBUG || '9444';
const DATA = process.env.P195_DATA || path.join(process.env.LOCALAPPDATA || '', 'atrium-dev-p195');
const [STEP, ...ARGS] = process.argv.slice(2);
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_|HC_)/.test(k)) delete process.env[k];
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
const ENV = {
  ATRIUM_TERMINAL_SESSION: BOARD, ATRIUM_HERDR_SESSION: BOARD, ATRIUM_PORT: PORT, ATRIUM_DATA_DIR: DATA, ATRIUM_APP_USERDATA: path.join(DATA, 'app'),
  ATRIUM_CLAUDE_PROJECTS: path.join(DATA, 'no-projects'), ATRIUM_CLAUDE_DESKTOP: 'none', ATRIUM_TEST_PREFIX: 'p195-none-',
};
Object.assign(process.env, ENV);
fs.mkdirSync(OUT, { recursive: true });
const { logger, sleep, launch, closeApp } = await import('./harness.mjs');
const { assertTestBoard } = await import('./p9-guard.mjs');
assertTestBoard(ENV);
const log = logger(`p195-${STEP}`);
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 1200)}` : ''}`); };
const until = async (fn, ms = 8000, step = 250) => { const t0 = Date.now(); for (;;) { const v = await fn().catch(() => null); if (v) return v; if (Date.now() - t0 > ms) return null; await sleep(step); } };

const { app, page } = await launch({ log, env: { ...ENV }, args: [`--remote-debugging-port=${DEBUG}`] });
const call = (m, p) => page.evaluate(([m, p]) => window.__mt.api.call(m, p), [m, p]);
const lang = async (l) => { await page.evaluate((l) => window.__mt.api.call('settings.set', { key: 'language', value: l }), l); await sleep(500); };
const shot = async (name, l, sel = null) => {
  const file = path.join(OUT, `${name}-${l}.png`);
  const el = sel ? await page.$(sel) : null;
  if (el) await el.screenshot({ path: file }); else await page.screenshot({ path: file });
  log(`shot ${name}-${l}`);
};
const openMenu = async (ws) => {
  await page.keyboard.press('Escape').catch(() => {});
  if (!(await page.$(`.mt-region[data-ws="${ws}"] .mt-region-name`))) { await call('workspace.select', { workspace: ws }).catch(() => {}); await until(() => page.$(`.mt-region[data-ws="${ws}"] .mt-region-name`), 5000); }
  await page.click('[data-action=chip-fit]').catch(() => {}); await sleep(700);
  await page.click(`.mt-region[data-ws="${ws}"] .mt-region-name`, { button: 'right' });
  return until(() => page.$('[data-role=region-menu]'), 4000);
};
const text = (sel) => page.$eval(sel, (x) => x.textContent).catch(() => null);

try {
  await app.evaluate(({ BrowserWindow, screen }) => { const w = BrowserWindow.getAllWindows()[0]; const left = Math.min(...screen.getAllDisplays().map((d) => d.bounds.x)); const b = w.getBounds(); w.setPosition(left - b.width - 200, 40); }).catch(() => {});
  await page.setViewportSize({ width: 1584, height: 921 }).catch(() => {});
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await sleep(3000);

  if (STEP === 'pre') {
    const [WS, WS2, FRESH, INREPO] = ARGS;
    // ---------- 1) rig 판: 워크트리 자리 경고와 켜기 단계 ----------
    for (const l of ['ko', 'en']) {
      await lang(l);
      await openMenu(WS);
      await page.click('[data-role=region-menu] [data-action=rig-panel]');
      await until(() => page.$('[data-role=rig-panel] [data-role=rig-seats]'), 8000);
      await sleep(600);
      const w = await text('[data-role=rig-panel] [data-role=rig-worktree-warn]');
      check(`[${l}] rig 판에 워크트리 자리 경고`, !!w && (l === 'ko' ? /git 저장소가 아닙니다/ : /not a git repository/).test(w), w);
      await shot('01-panel-warn', l, '[data-role=rig-panel]');
      await page.click('[data-action=rig-panel-setup]');
      await until(() => page.$('[data-role=rig-panel-setup][data-step=enable]'), 4000);
      const w2 = await page.$$eval('[data-role=rig-panel-setup] [data-role=rig-worktree-warn]', (xs) => xs.map((x) => x.textContent));
      check(`[${l}] 켜기 단계에도 경고`, w2.length === 1, w2);
      await shot('02-enable-warn', l, '[data-role=rig-panel]');
      await page.click('[data-action=rig-panel-close]');
      await sleep(300);
    }
    // ---------- 2) 만들기 대화상자: 워크트리 틀 막힘 ----------
    for (const l of ['ko', 'en']) {
      await lang(l);
      await openMenu(WS2);
      await page.click('[data-role=region-menu] [data-action=rig-create]');
      await until(() => page.$('[data-role=rig-create] [data-action=rig-template][data-template="main-worker-reviewer-worktree"][data-blocked]'), 8000);
      const st = await page.$$eval('[data-role=rig-create] [data-action=rig-template]', (xs) => xs.map((x) => ({ id: x.dataset.template, disabled: x.disabled, why: (x.querySelector('[data-role=rig-template-blocked]') || {}).textContent || null })));
      const t3 = st.find((x) => x.id === 'main-worker-reviewer-worktree');
      check(`[${l}] 워크트리 틀은 까닭과 함께 막힌다, 다른 틀은 열림`, t3 && t3.disabled && (l === 'ko' ? /git init과 첫 커밋/ : /git init/).test(t3.why || '') && st.filter((x) => x.id !== t3.id).every((x) => !x.disabled), st);
      await shot('03-create-blocked', l, '[data-role=rig-create]');
      await page.keyboard.press('Escape').catch(() => {});
      await sleep(300);
    }
    // ---------- 3) 프로젝트 열기: Git 저장소로 시작 ----------
    for (const l of ['ko', 'en']) {
      await lang(l);
      await page.keyboard.press('Escape').catch(() => {});
      await page.click('[data-action=ws-open]');
      await until(() => page.$('[data-role=ws-open]'), 4000);
      await page.fill('[data-role=ws-open] [data-field=path]', FRESH);
      await sleep(900);
      const a = await page.$eval('[data-role=ws-open] [data-field=git-init]', (x) => ({ disabled: x.disabled, checked: x.checked }));
      check(`[${l}] git 아닌 새 폴더: 확인란은 켤 수 있고 기본 끔`, !a.disabled && !a.checked, a);
      await page.check('[data-role=ws-open] [data-field=git-init]');
      await shot('04-wsopen-git', l, '[data-role=ws-open]');
      await page.fill('[data-role=ws-open] [data-field=path]', INREPO);
      await sleep(900);
      const b = await page.$eval('[data-role=ws-open] [data-field=git-init]', (x) => ({ disabled: x.disabled, checked: x.checked }));
      const hint = await text('[data-role=ws-open] [data-role=ws-git-hint]');
      check(`[${l}] 저장소 안 폴더: 확인란이 까닭과 함께 막힌다`, b.disabled && !b.checked && (l === 'ko' ? /이미 Git 저장소 안/ : /already inside a git repository/).test(hint || ''), { b, hint });
      await shot('05-wsopen-inrepo', l, '[data-role=ws-open]');
      await page.keyboard.press('Escape').catch(() => {});
      await sleep(300);
    }
    // 새 폴더를 확인란을 켜고 연다(ko): 처음부터 저장소 키, 첫 커밋
    await lang('ko');
    await page.click('[data-action=ws-open]');
    await until(() => page.$('[data-role=ws-open]'), 4000);
    await page.fill('[data-role=ws-open] [data-field=path]', FRESH);
    await sleep(900);
    await page.check('[data-role=ws-open] [data-field=git-init]');
    await page.click('[data-action=ws-open-submit]');
    const toast = await until(async () => { const ts = await page.$$eval('.mt-toast', (xs) => xs.map((x) => x.textContent)); return ts.find((x) => /git init/.test(x)) || null; }, 10000);
    check('확인란을 켜고 열면 git init과 빈 첫 커밋을 알린다', !!toast && /git init과 빈 첫 커밋을 했습니다/.test(toast), toast);
    await sleep(300);
    await shot('06-wsopen-done', 'ko');
    const list = await call('workspace.list', {});
    const w = (list.workspaces || list).find((x) => String(x.root).toLowerCase() === FRESH.toLowerCase().replace(/\\/g, '/'));
    check('새 워크스페이스는 처음부터 저장소 키', !!w && w.kind === 'repo' && /\/\.git$/.test(w.key), w);
  }

  if (STEP === 'remote') {
    const [WS] = ARGS;
    await page.evaluate(() => { window.__mtViewOnly = true; });
    for (const l of ['ko', 'en']) {
      await lang(l);
      await openMenu(WS);
      await page.click('[data-role=region-menu] [data-action=rig-panel]');
      await until(() => page.$('[data-role=rig-panel][data-remote="1"]'), 8000);
      await sleep(600);
      const note = await text('[data-role=rig-panel] [data-role=rig-remote-note]');
      const btn = { off: !!(await page.$('[data-action=rig-panel-off]')), save: !!(await page.$('[data-action=rig-save]')), say: !!(await page.$('[data-role=rig-say]')), setup: !!(await page.$('[data-action=rig-panel-setup]')) };
      check(`[${l}] 원격 rig 판: 안내 한 줄, 끄기 단추만`, !!note && (l === 'ko' ? /판을 띄운 PC의 창에서만/ : /board window on the PC/).test(note) && btn.off && !btn.save && !btn.say && !btn.setup, { note, btn });
      await shot('07-remote-panel', l, '[data-role=rig-panel]');
      await page.click('[data-action=rig-panel-close]');
      await sleep(300);
    }
  }
} catch (e) { check('시험이 끝까지 돌았다', false, e.stack); }
finally { await closeApp(app).catch(() => {}); }
fs.writeFileSync(path.join(OUT, `results-${STEP}.json`), JSON.stringify(results, null, 2));
const bad = results.filter((r) => !r.ok);
log(`${results.length - bad.length}/${results.length} PASS`);
process.exit(bad.length ? 1 : 0);
