// P313 창 시험: 설정 › 에이전트 › 병합(옛 합치기 탭). ko·en 그림, 탭·칸 이름, 할 일 정리는 숨김, 칸을 바꾸면 판 설정(옛 키 merger*)이 바뀌고 되돌린다.
// 판: 따로 띄운 개발용 판(atrium-dev-p313, 48063, 창 디버깅 9544)만. 판 변수를 지운 셸에서 그 판의 환경으로 부른다.
// 결과는 experiments/p313/<round>/(저장소 밖)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const TAG = process.argv[2] || 'round-1';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const OUT = path.join(REPO, 'experiments', 'p313', TAG);
if (process.env.ATRIUM_TERMINAL_SESSION !== 'atrium-dev-p313' || process.env.ATRIUM_PORT !== '48063') throw new Error('개발용 판(atrium-dev-p313, 48063) 환경에서만 돈다');
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
fs.mkdirSync(OUT, { recursive: true });
const { logger, sleep, launch, closeApp } = await import('./harness.mjs');
const log = logger('p313-' + TAG);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 120000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + JSON.stringify(detail).slice(0, 800) : '')); };
const boxOf = (page, sel, pad = 8) => page.evaluate(([s, p]) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); const x = Math.max(0, r.left - p), y = Math.max(0, r.top - p); return { x, y, width: Math.min(window.innerWidth - x, r.width + 2 * p), height: Math.min(window.innerHeight - y, r.height + 2 * p) }; }, [sel, pad]);
async function openAgents(page) {
  await page.evaluate(() => { const b = document.querySelector('[data-action=settings-open]') || document.querySelector('[data-action=settings-rail]'); if (b) b.click(); else window.__mt.getState().openDialog({ kind: 'settings' }); });
  await page.waitForSelector('[data-role=settings]', { timeout: 10000 });
  await page.click('[data-role=settings-tabs] [data-tab=agents]');
  await page.waitForSelector('[data-role=merger-settings]', { timeout: 10000 });
  await sleep(300);
}

const { app, page } = await launch({ log, args: ['--remote-debugging-port=9544'] });
try {
  await page.setViewportSize({ width: 1500, height: 960 }).catch(() => {});
  const got = call('settings.get');
  check('판 settings.get에 보조 에이전트 표(병합 ready, 할 일 정리 자리)', Array.isArray(got.agents) && got.agents.some((a) => a.id === 'merge' && a.ready && a.fields.length === 5) && got.agents.some((a) => a.id === 'todoTidy'), got.agents); // P316: 할 일 정리도 ready
  for (const l of ['en', 'ko']) {
    call('settings.set', { key: 'language', value: l });
    await page.waitForFunction((x) => document.documentElement.lang === x, l, { timeout: 10000 }).catch(() => {});
    await sleep(600);
    await openAgents(page);
    const tabs = await page.$$eval('[data-role=settings-tabs] [data-tab]', (xs) => xs.map((x) => [x.dataset.tab, x.innerText.trim()]));
    const body = await page.$eval('[data-role=settings]', (x) => x.innerText);
    const fields = await page.$$eval('[data-role=merger-settings] [data-field]', (xs) => xs.map((x) => x.dataset.field));
    const agents = await page.$$eval('[data-role=agents-settings] [data-agent]', (xs) => xs.map((x) => x.dataset.agent));
    check(l + ' 탭: 에이전트, 옛 merger 탭 없음', tabs.some(([k, n]) => k === 'agents' && n === (l === 'ko' ? '에이전트' : 'Agents')) && !tabs.some(([k]) => k === 'merger'), tabs);
    check(l + ' 병합 칸 머리·칸 이름', l === 'ko' ? /병합/.test(body) && /하네스/.test(body) && /승인 방식/.test(body) : /Merge/.test(body) && /Harness/.test(body) && /Permission mode/.test(body), body.slice(0, 600));
    check(l + ' "합치기" 글 없음', !/합치기/.test(body), body.slice(0, 300));
    check(l + ' 칸 차례(옛 키)', JSON.stringify(fields) === JSON.stringify(['setting-mergerMode', 'setting-mergerKind', 'setting-mergerModel', 'setting-mergerEffort', 'setting-mergerPermission']), fields);
    check(l + ' 병합 다음 할 일 정리(P316)', JSON.stringify(agents) === JSON.stringify(['merge', 'todoTidy']), agents);
    await page.screenshot({ path: path.join(OUT, 'settings-agents-' + l + '.png'), clip: await boxOf(page, '[data-role=settings]') });
    await page.click('[data-action=settings-close]');
    await sleep(300);
  }
  await openAgents(page);
  const before = call('settings.get').settings;
  await page.click('[data-field=setting-mergerMode] [data-mode=on]');
  await sleep(800);
  const v1 = call('settings.get').settings.mergerMode;
  await page.selectOption('[data-field=setting-mergerEffort]', 'low');
  await sleep(800);
  const e1 = call('settings.get').settings.mergerEffort;
  await page.screenshot({ path: path.join(OUT, 'settings-agents-ko-on.png'), clip: await boxOf(page, '[data-role=settings]') });
  await page.click('[data-field=setting-mergerMode] [data-mode=' + before.mergerMode + ']');
  await page.selectOption('[data-field=setting-mergerEffort]', before.mergerEffort);
  await sleep(800);
  const after = call('settings.get').settings;
  check('칸을 바꾸면 판 설정(mergerMode·mergerEffort)이 바뀌고 되돌린다', v1 === 'on' && e1 === 'low' && after.mergerMode === before.mergerMode && after.mergerEffort === before.mergerEffort, { v1, e1, before: [before.mergerMode, before.mergerEffort], after: [after.mergerMode, after.mergerEffort] });
  await page.click('[data-action=settings-close]');
  // 옛 탭 이름으로 열어도 에이전트 탭
  const opened = await page.evaluate(() => { const st = window.__mt.getState(); if (!st.openDialog) return false; st.openDialog({ kind: 'settings', tab: 'merger' }); return true; });
  if (opened) { await sleep(500); const tab = await page.$eval('[data-role=settings]', (x) => x.dataset.tab).catch(() => null); check('옛 탭 이름(merger)으로 열면 에이전트 탭', tab === 'agents', tab); }
} catch (e) { check('예외 없이', false, e.message); }
finally {
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  await closeApp(app);
  log('결과 ' + results.filter((r) => r.ok).length + '/' + results.length);
  process.exit(results.every((r) => r.ok) ? 0 : 1);
}
