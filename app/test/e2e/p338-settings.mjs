// P338 창 시험: 설정 창 v2(왼쪽 목록·설정 찾기·딸린 칸 흐려짐·ⓘ)와 봇 탭(런처 고르기, 상태 줄, 고급, 저장소별 merge.json 표).
// 판: 따로 띄운 개발용 판(atrium-dev-p338, 48088, backend/.dev)만 쓴다. 셸 세션 둘(p338-a, p338-b, 시험 폴더 C:\Workspace\mtask-p338-a·b)만 띄운다.
// 실행: node app/test/e2e/p338-settings.mjs <setup|shot|stop> [before|after]
//   shot before: 고치기 전 커밋으로 빌드한 dist를 끼워 찍는다(그림만). shot after: 지금 빌드로 찍고 검사한다.
//   상태 줄의 "일하는 중" 그림(bots-status-mock)은 창 안에서 bots.status 답을 흉내 낸 것이다(새 판은 오늘 한 것이 0이라).
// 결과는 워크트리의 experiments/p338/<before|after>/(저장소 밖). 창 1600×1000.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const WHAT = process.argv[2] || 'setup';
const TAG = process.argv[3] || 'after';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const DEV = path.join(REPO, 'backend', '.dev');
const OUT = path.join(REPO, 'experiments', 'p338', TAG);
const CONVOS = path.join(REPO, 'experiments', 'p338', 'convos');
const DIRS = { a: 'C:\\Workspace\\mtask-p338-a', b: 'C:\\Workspace\\mtask-p338-b' };
const BOARD = 'atrium-dev-p338', PORT = '48088', DEBUG = 9569;
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_|HC_)/.test(k)) delete process.env[k];
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
const ENV = {
  ATRIUM_TERMINAL_SESSION: BOARD, ATRIUM_HERDR_SESSION: BOARD, ATRIUM_PORT: PORT,
  ATRIUM_DATA_DIR: path.join(DEV, 'data'), ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  ATRIUM_CLAUDE_PROJECTS: CONVOS, ATRIUM_CLAUDE_DESKTOP: 'none', ATRIUM_TEST_PREFIX: 'p338-none-',
};
Object.assign(process.env, ENV);
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(CONVOS, { recursive: true });
const { logger, sleep, launch, closeApp } = await import('./harness.mjs');
const { assertTestBoard } = await import('./p9-guard.mjs');
assertTestBoard(ENV, { root: DEV });

const log = logger(`p338-${WHAT}-${TAG}`);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 120000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${JSON.stringify(detail).slice(0, 1200)}` : ''}`); };
const shotTo = (pg, name, clip) => pg.screenshot({ path: path.join(OUT, `${name}.png`), ...(clip ? { clip } : {}) });
const modalClip = (pg) => pg.$eval('[data-role="settings"]', (e) => { const b = e.getBoundingClientRect(); return { x: Math.max(0, b.x - 4), y: Math.max(0, b.y - 4), width: Math.min(innerWidth, b.width + 8), height: Math.min(innerHeight, b.height + 8) }; });
const shotModal = async (pg, name) => shotTo(pg, name, await modalClip(pg));

async function openSettings(pg, tab) {
  if (!(await pg.$('[data-role="settings"]'))) await pg.click('[data-role="top-right"] [data-action="settings-open"]');
  await pg.waitForSelector('[data-role="settings-tabs"]', { timeout: 8000 });
  if (tab) await pg.click(`[data-role="settings-tabs"] [data-tab="${tab}"]`);
  await sleep(600);
}
const closeSettings = async (pg) => { if (await pg.$('[data-role="settings"]')) { await pg.click('[data-action="settings-close"]').catch(() => {}); await sleep(300); } };
const wsOf = (dir) => { const c = call('merger.configs'); const w = c.workspaces.find((x) => path.resolve(x.root).toLowerCase() === path.resolve(dir).toLowerCase()); return w ? w.workspace : null; };

async function setup() {
  for (const d of Object.values(DIRS)) fs.mkdirSync(d, { recursive: true });
  log(atrium('backend', 'start').trim().slice(0, 300));
  const have = new Set(call('session.list').map((s) => s.name));
  for (const [k, d] of Object.entries(DIRS)) if (!have.has('p338-' + k)) log(atrium('--json', 'spawn', d, '--kind', 'shell', '--name', 'p338-' + k).slice(0, 160));
  await sleep(2000);
  const names = new Set((call('launcher.list').launchers || []).map((l) => l.name));
  const mk = (name, harness, model, effort, permissionMode) => { if (!names.has(name)) call('launcher.create', { launcher: { name, harness, icon: '', model, effort, permissionMode, args: '', env: '', command: '', startCommand: '' }, favorite: true }); };
  mk('Sonnet medium', 'claude', 'claude-sonnet-5-5', 'medium', 'acceptEdits');
  mk('Haiku low', 'claude', 'haiku', 'low', 'manual');
  mk('Opus high', 'claude', 'claude-opus-5-5', 'high', 'manual');
  mk('Codex', 'codex', '', 'medium', 'auto');
  for (const [key, value] of [['mergerMode', 'ask'], ['mergerKind', 'claude'], ['mergerModel', 'claude-sonnet-5-5'], ['mergerEffort', 'medium'], ['todoTidyMode', 'on'], ['todoTidyKind', 'claude'], ['todoTidyModel', 'haiku'], ['todoTidyEffort', 'low'], ['usageProbe', true], ['language', 'en']]) call('settings.set', { key, value });
  const wa = wsOf(DIRS.a);
  if (wa) { call('merger.config.set', { workspace: wa, patch: { target: 'dev', push: true } }); call('merger.answer', { workspace: wa, answer: 'on' }); }
  fs.mkdirSync(path.join(DIRS.b, '.atrium'), { recursive: true });
  fs.writeFileSync(path.join(DIRS.b, '.atrium', 'merge.json'), JSON.stringify({ where: 'elsewhere' }));
  log('setup done ws a=' + wa);
}

const STATUS_MOCK = { at: 0, since: 0, merge: { mode: 'ask', state: 'working', mergers: [{ name: 'merger-mtask-p338-a-dev', sessionId: 'none', workspace: 'x', target: 'dev', jobs: 2, jobsMax: 5 }], open: { merging: 1, queued: 1 }, today: { merged: 4, failed: 1, discarded: 0 }, problem: null }, todoTidy: { mode: 'on', state: 'idle', hour: 6, perHour: 30, today: { calls: 11, cards: 7, dropped: 2, fallback: 1 }, autoDecisions: true } };

async function shotBefore(page) {
  for (const lang of ['en', 'ko']) {
    call('settings.set', { key: 'language', value: lang }); await sleep(800);
    await openSettings(page, null);
    const tabs = await page.$$eval('[data-role="settings-tabs"] [data-tab]', (els) => els.map((e) => e.dataset.tab));
    for (const t of tabs) { await openSettings(page, t); await shotModal(page, `before-${t}-${lang}`); }
    await closeSettings(page);
  }
}

async function shotAfter(page) {
  for (const lang of ['en', 'ko']) {
    call('settings.set', { key: 'language', value: lang }); call('settings.set', { key: 'usageProbe', value: true }); await sleep(800);
    await openSettings(page, null);
    const nav = await page.evaluate(() => ({ groups: [...document.querySelectorAll('.mt-set-navgroup')].map((g) => g.dataset.group), tabs: [...document.querySelectorAll('[data-role="settings-tabs"] [data-tab]')].map((e) => e.dataset.tab), search: !!document.querySelector('[data-field="settings-search"]') }));
    check(`[${lang}] 왼쪽 목록: 묶음 6, 쪽 9, 찾기 칸`, nav.groups.length === 6 && nav.tabs.length === 9 && nav.search, nav);
    for (const t of nav.tabs) { await openSettings(page, t); await shotModal(page, `page-${t}-${lang}`); }
    // 봇: 카드 둘, 런처 고르기(지금 값과 맞는 런처), 묶음 두 개
    await openSettings(page, 'bots');
    const bots = await page.evaluate(() => [...document.querySelectorAll('[data-bot]')].map((c) => { const sel = c.querySelector('[data-field^="bot-launcher-"]'); return { id: c.dataset.bot, value: sel && sel.value, label: sel && sel.selectedOptions[0] && sel.selectedOptions[0].textContent, groups: sel ? sel.querySelectorAll('optgroup').length : 0, status: c.querySelector('[data-role="bot-status"]') && c.querySelector('[data-role="bot-status"]').dataset.state, model: !!c.querySelector('[data-role$="-model-setting"]'), effort: !!c.querySelector('[data-role$="-effort-setting"]') }; }));
    check(`[${lang}] 봇 카드 둘, 지금 값에 맞는 런처가 골라져 있다`, bots.length === 2 && bots[0].label === 'Sonnet medium' && bots[1].label === 'Haiku low' && bots.every((b) => b.groups === 2 && b.model && b.effort && b.status), bots);
    for (const b of await page.$$('[data-action="bot-advanced"]')) await b.click();
    await sleep(300);
    await shotModal(page, `bots-advanced-${lang}`);
    const adv = await page.evaluate(() => ({ perm: !!document.querySelector('[data-role="merger-permission-setting"]'), perHour: !!document.querySelector('[data-role="todoTidy-perHour-setting"]') }));
    check(`[${lang}] 고급: 병합 봇 승인 방식, 할 일 정리 봇 시간당 상한`, adv.perm && adv.perHour, adv);
    for (const b of await page.$$('[data-action="bot-advanced"]')) await b.click();
    await page.click('[data-action="bot-repos"]'); await sleep(800);
    await page.$eval('[data-role="merge-repos"]', (e) => e.scrollIntoView({ block: 'end' }));
    await sleep(200);
    await shotModal(page, `bots-repos-${lang}`);
    const rows = await page.evaluate(() => [...document.querySelectorAll('[data-role="merge-repos"] tbody tr')].map((r) => ({ name: r.querySelector('b').textContent, target: r.querySelector('[data-field="merge-target"]').value, where: r.querySelector('[data-field="merge-where"]').value, push: r.querySelector('[data-field="merge-push"]').checked, warn: !!r.querySelector('.mt-bot-warn') })));
    check(`[${lang}] 저장소별 표: 프로젝트 둘, a는 dev·올리기 켬, b는 문제 표시`, rows.length === 2 && rows.some((r) => r.target === 'dev' && r.push) && rows.some((r) => r.warn), rows);
    if (lang === 'en') {
      // 표에서 고치면 그 프로젝트의 .atrium/merge.json에 쓴다
      const inp = await page.$('[data-role="merge-repos"] tbody tr:has(.mt-bot-warn) [data-field="merge-target"]');
      await inp.fill('main'); await inp.press('Enter'); await sleep(1200);
      const j = JSON.parse(fs.readFileSync(path.join(DIRS.b, '.atrium', 'merge.json'), 'utf8'));
      check('표에서 고친 브랜치가 b의 merge.json에 쓰이고 잘못된 where는 기본값으로 빠진다', j.target === 'main' && !('where' in j), j);
      fs.writeFileSync(path.join(DIRS.b, '.atrium', 'merge.json'), JSON.stringify({ where: 'elsewhere' }));
    }
    // 상태 줄(흉내 낸 판 요약)
    await closeSettings(page);
    await page.evaluate((mock) => { const a = window.__mt.api; if (!a.__p338) { a.__p338 = a.call.bind(a); a.call = (m, p) => (m === 'bots.status' && window.__p338Mock ? Promise.resolve(window.__p338Mock) : a.__p338(m, p)); } window.__p338Mock = mock; }, STATUS_MOCK);
    await openSettings(page, 'bots'); await sleep(500);
    const st = await page.$$eval('[data-role="bot-status"]', (els) => els.map((e) => ({ state: e.dataset.state, text: e.textContent })));
    check(`[${lang}] 상태 줄: 일하는 중·오늘 병합, 이번 시간 n/상한`, st[0].state === 'working' && /4/.test(st[0].text) && /6\/30/.test(st[1].text), st);
    await shotModal(page, `bots-status-mock-${lang}`);
    await page.evaluate(() => { window.__p338Mock = null; });
    await closeSettings(page);
    // 찾기
    await openSettings(page, 'general');
    await page.fill('[data-field="settings-search"]', lang === 'ko' ? '사용량' : 'usage'); await sleep(400);
    const hits = await page.$$eval('[data-role="settings-search-results"] [data-hit]', (els) => els.map((e) => e.dataset.hit));
    check(`[${lang}] 찾기: 사용량 칸이 나온다`, hits.includes('usageAlerts') && hits.includes('usageProbeMin'), hits);
    await shotModal(page, `search-${lang}`);
    await page.click('[data-hit="usageProbeMin"]'); await sleep(300);
    const jumped = await page.evaluate(() => ({ tab: document.querySelector('[data-role="settings"]').dataset.tab, flash: !!document.querySelector('.mt-set-flash[data-set-id="usageProbeMin"]') }));
    check(`[${lang}] 찾기 결과를 누르면 그 쪽·그 칸으로 가서 밝힌다`, jumped.tab === 'alerts' && jumped.flash, jumped);
    await shotModal(page, `search-jump-${lang}`);
    await page.fill('[data-field="settings-search"]', ''); await sleep(200);
    // 딸린 칸 흐려짐
    call('settings.set', { key: 'usageProbe', value: false }); await sleep(800);
    await openSettings(page, 'alerts');
    const dim = await page.$$eval('.mt-set-row.child', (els) => els.map((e) => ({ id: e.dataset.setId, dim: e.classList.contains('dim') })));
    check(`[${lang}] 사용량 직접 묻기를 끄면 딸린 칸 둘이 흐리다`, dim.length === 2 && dim.every((d) => d.dim), dim);
    await shotModal(page, `dim-${lang}`);
    call('settings.set', { key: 'usageProbe', value: true }); await sleep(500);
    // ⓘ 펼침
    await openSettings(page, 'general');
    await page.click('[data-role="work-light-setting"] [data-action="set-info"]'); await sleep(300);
    check(`[${lang}] ⓘ를 누르면 긴 글이 펼쳐진다`, !!(await page.$('[data-role="set-info-text"]')));
    await shotModal(page, `info-${lang}`);
    await closeSettings(page);
  }
}

async function shot() {
  const { app, page } = await launch({ log, env: { ...ENV }, args: [`--remote-debugging-port=${DEBUG}`] });
  try {
    await page.setViewportSize({ width: 1600, height: 1000 }).catch(() => {});
    await sleep(2000);
    if (TAG === 'before') await shotBefore(page); else await shotAfter(page);
  } finally {
    call('settings.set', { key: 'language', value: 'en' });
    await closeApp(app);
  }
}

async function stop() {
  for (const k of Object.keys(DIRS)) { try { const s = call('session.list').find((x) => x.name === 'p338-' + k); if (s) log(atrium('kill', s.sessionId || s.id || 'p338-' + k, '--yes').trim()); } catch (e) { log('kill', e.message.split('\n')[0]); } }
  try { log(atrium('terminal', 'stop', '--yes').trim()); } catch (e) { log('terminal stop', e.message.split('\n')[0]); }
  try { log(atrium('backend', 'stop').trim()); } catch (e) { log('backend stop', e.message.split('\n')[0]); }
}

if (WHAT === 'setup') await setup();
else if (WHAT === 'shot') await shot();
else if (WHAT === 'stop') await stop();
const fail = results.filter((r) => !r.ok);
fs.writeFileSync(path.join(OUT, `${WHAT}-results.json`), JSON.stringify(results, null, 2));
log(`끝: ${results.length - fail.length}/${results.length} 통과`);
process.exit(fail.length && TAG === 'after' ? 1 : 0);
