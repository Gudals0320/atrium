// P316 창 시험: 설정 › 에이전트 › 할 일 정리 칸(ko·en 그림, 켬/끔·하네스 고르기가 판 설정을 바꾸고 되돌림)과
// 할 일 정리가 만든 카드들(사례 꼴 답 → 확인 1장 + 결정 1장)의 할 일 목록 그림.
// 판: 따로 띄운 개발용 판(atrium-dev-p316, 48066, 창 디버깅 9547)만. 판 변수를 지운 셸에서 그 판의 환경으로 부른다(backend/.dev/mt.cjs와 같은 값).
// 결과는 experiments/p316/<round>/(저장소 밖). 카드는 미리 haiku 리드가 만들어 둔다(작업 기록 참고).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const TAG = process.argv[2] || 'round-1';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const OUT = path.join(REPO, 'experiments', 'p316', TAG);
if (process.env.ATRIUM_TERMINAL_SESSION !== 'atrium-dev-p316' || process.env.ATRIUM_PORT !== '48066') throw new Error('개발용 판(atrium-dev-p316, 48066) 환경에서만 돈다');
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
fs.mkdirSync(OUT, { recursive: true });
const { logger, sleep, launch, closeApp } = await import('./harness.mjs');
const log = logger('p316-' + TAG);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 120000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + JSON.stringify(detail).slice(0, 800) : '')); };
const boxOf = (page, sel, pad = 8) => page.evaluate(([s, p]) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); const x = Math.max(0, r.left - p), y = Math.max(0, r.top - p); return { x, y, width: Math.min(window.innerWidth - x, r.width + 2 * p), height: Math.min(window.innerHeight - y, r.height + 2 * p) }; }, [sel, pad]);
async function openAgents(page) {
  await page.evaluate(() => { const b = document.querySelector('[data-action=settings-open]') || document.querySelector('[data-action=settings-rail]'); if (b) b.click(); else window.__mt.getState().openDialog({ kind: 'settings' }); });
  await page.waitForSelector('[data-role=settings]', { timeout: 10000 });
  await page.click('[data-role=settings-tabs] [data-tab=agents]');
  await page.waitForSelector('[data-role=todoTidy-settings]', { timeout: 10000 });
  await page.$eval('[data-role=todoTidy-settings]', (e) => e.scrollIntoView({ block: 'start' }));
  await sleep(400);
}

const { app, page } = await launch({ log, args: ['--remote-debugging-port=9547'] });
try {
  await page.setViewportSize({ width: 1500, height: 960 }).catch(() => {});
  const got = call('settings.get');
  check('판 settings.get: 할 일 정리 ready, 칸 넷', got.agents.some((a) => a.id === 'todoTidy' && a.ready && a.fields.length === 4), got.agents.map((a) => [a.id, a.ready, a.fields.length]));
  for (const l of ['ko', 'en']) {
    call('settings.set', { key: 'language', value: l });
    await page.waitForFunction((x) => document.documentElement.lang === x, l, { timeout: 10000 }).catch(() => {});
    await sleep(3000); // 창이 막 떴을 때의 "보드를 준비하고 있습니다" 가림막이 걷힐 때까지
    await openAgents(page);
    const agents = await page.$$eval('[data-role=agents-settings] [data-agent]', (xs) => xs.map((x) => x.dataset.agent));
    const fields = await page.$$eval('[data-role=todoTidy-settings] [data-field]', (xs) => xs.map((x) => x.dataset.field));
    const body = await page.$eval('[data-role=todoTidy-settings]', (x) => x.innerText);
    const kinds = await page.$$eval('[data-field=setting-todoTidyKind] option', (xs) => xs.map((x) => x.textContent));
    check(l + ' 에이전트 칸: 병합·할 일 정리', JSON.stringify(agents) === JSON.stringify(['merge', 'todoTidy']), agents);
    check(l + ' 할 일 정리 칸 차례', JSON.stringify(fields) === JSON.stringify(['setting-todoTidyMode', 'setting-todoTidyKind', 'setting-todoTidyModel', 'setting-todoTidyEffort', 'setting-todoTidyPerHour']), fields);
    check(l + ' 하네스 고르기(Claude Code·Codex)', JSON.stringify(kinds) === JSON.stringify(['Claude Code', 'Codex']), kinds);
    check(l + ' 이름·상한 글', l === 'ko' ? /할 일 정리/.test(body) && /시간당 상한/.test(body) : /To-do tidy/.test(body) && /Hourly cap/.test(body), body.slice(0, 400));
    await page.screenshot({ path: path.join(OUT, 'settings-todo-tidy-' + l + '.png'), clip: await boxOf(page, '[data-role=todoTidy-settings]') });
    await page.click('[data-action=settings-close]');
    await sleep(300);
  }
  // 칸을 바꾸면 판 설정이 바뀌고 되돌린다
  await openAgents(page);
  const before = call('settings.get').settings;
  await page.click('[data-field=setting-todoTidyMode] [data-mode=off]'); await sleep(800);
  const m1 = call('settings.get').settings.todoTidyMode;
  await page.selectOption('[data-field=setting-todoTidyKind]', 'codex'); await sleep(800);
  const k1 = call('settings.get').settings.todoTidyKind;
  await page.fill('[data-field=setting-todoTidyPerHour]', '12'); await page.press('[data-field=setting-todoTidyPerHour]', 'Enter'); await sleep(800);
  const h1 = call('settings.get').settings.todoTidyPerHour;
  await page.screenshot({ path: path.join(OUT, 'settings-todo-tidy-en-changed.png'), clip: await boxOf(page, '[data-role=todoTidy-settings]') });
  await page.click('[data-field=setting-todoTidyMode] [data-mode=' + before.todoTidyMode + ']');
  await page.selectOption('[data-field=setting-todoTidyKind]', before.todoTidyKind);
  await page.fill('[data-field=setting-todoTidyPerHour]', String(before.todoTidyPerHour)); await page.press('[data-field=setting-todoTidyPerHour]', 'Enter');
  await sleep(800);
  const after = call('settings.get').settings;
  check('칸을 바꾸면 판 설정(todoTidyMode·Kind·PerHour)이 바뀌고 되돌린다', m1 === 'off' && k1 === 'codex' && h1 === 12 && after.todoTidyMode === before.todoTidyMode && after.todoTidyKind === before.todoTidyKind && after.todoTidyPerHour === before.todoTidyPerHour, { m1, k1, h1, after: [after.todoTidyMode, after.todoTidyKind, after.todoTidyPerHour] });
  await page.click('[data-action=settings-close]');
  // 할 일 정리가 만든 카드들
  for (const l of ['ko', 'en']) {
    call('settings.set', { key: 'language', value: l });
    await sleep(800);
    await page.click('[data-role=decisions]'); await sleep(900);
    const rows = await page.$$eval('[data-role=decisions-list] [data-role=decision]', (xs) => xs.map((x) => ({ kind: x.dataset.kind, q: (x.querySelector('[data-role=decision-question]') || {}).textContent, auto: !!x.querySelector('[data-role=decision-auto]') })));
    check(l + ' 할 일 목록: 확인 1장 + 결정 1장(자동)', rows.length === 2 && rows.some((r) => r.kind === 'check') && rows.some((r) => r.kind === 'decide') && rows.every((r) => r.auto), rows);
    const clip = await boxOf(page, '[data-role=decisions-list]', 12);
    await page.screenshot({ path: path.join(OUT, 'cards-' + l + '.png'), ...(clip ? { clip } : {}) });
    await page.keyboard.press('Escape'); await sleep(400);
  }
} catch (e) { check('예외 없이', false, e.message); }
finally {
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  await closeApp(app);
  log('결과 ' + results.filter((r) => r.ok).length + '/' + results.length);
  process.exit(results.every((r) => r.ok) ? 0 : 1);
}
