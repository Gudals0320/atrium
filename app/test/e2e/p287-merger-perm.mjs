// P287 창 시험: 설정 › 합치기의 승인 방식 칸(mergerPermission). ko·en 그림, 칸을 바꾸면 판 설정이 바뀌고 되돌린다.
// 판: 따로 띄운 개발용 판(atrium-dev-p287, 48037, 창 디버깅 9518)만. 판 변수를 지운 셸에서 그 판의 환경으로 부른다.
// 결과는 experiments/p287/<round>/(저장소 밖)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const TAG = process.argv[2] || 'round-1';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const OUT = path.join(REPO, 'experiments', 'p287', TAG);
if (process.env.ATRIUM_TERMINAL_SESSION !== 'atrium-dev-p287' || process.env.ATRIUM_PORT !== '48037') throw new Error('개발용 판(atrium-dev-p287, 48037) 환경에서만 돈다');
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
fs.mkdirSync(OUT, { recursive: true });
const { logger, sleep, launch, closeApp } = await import('./harness.mjs');
const log = logger('p287-' + TAG);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 120000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + JSON.stringify(detail).slice(0, 800) : '')); };
const boxOf = (page, sel, pad = 8) => page.evaluate(([s, p]) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); const x = Math.max(0, r.left - p), y = Math.max(0, r.top - p); return { x, y, width: Math.min(window.innerWidth - x, r.width + 2 * p), height: Math.min(window.innerHeight - y, r.height + 2 * p) }; }, [sel, pad]);
async function openMerger(page) {
  await page.evaluate(() => { const b = document.querySelector('[data-action=settings-open]') || document.querySelector('[data-action=settings-rail]'); if (b) b.click(); else window.__mt.getState().openDialog({ kind: 'settings' }); });
  await page.waitForSelector('[data-role=settings]', { timeout: 10000 });
  await page.click('[data-role=settings-tabs] [data-tab=bots]'); // P338: 봇 쪽, 승인 방식은 병합 봇의 "▸ 고급"
  await page.click('[data-bot=merge] [data-action=bot-advanced]');
  await page.waitForSelector('[data-role=merger-permission-setting]', { timeout: 10000 });
}

const { app, page } = await launch({ log, args: ['--remote-debugging-port=9518'] });
try {
  await page.setViewportSize({ width: 1500, height: 900 }).catch(() => {});
  for (const l of ['en', 'ko']) {
    call('settings.set', { key: 'language', value: l });
    await page.waitForFunction((x) => document.documentElement.lang === x, l, { timeout: 10000 }).catch(() => {});
    await sleep(600);
    await openMerger(page);
    const row = await page.$eval('[data-role=merger-permission-setting]', (x) => x.innerText);
    const opts = await page.$$eval('[data-field=setting-mergerPermission] option', (xs) => xs.map((o) => o.value));
    const val = await page.$eval('[data-field=setting-mergerPermission]', (x) => x.value);
    check(l + ' 칸: 이름·설명·기본(맡긴 세션 따름)', (l === 'ko' ? /승인 방식/.test(row) && /맡긴 세션 따름/.test(row) : /Permission mode/.test(row) && /Same as assigner/.test(row)) && val === '', { row, val });
    check(l + ' 목록 = 빈 값 + 호출자 창의 승인 방식', JSON.stringify(opts) === JSON.stringify(['', 'manual', 'acceptEdits', 'plan', 'auto', 'dontAsk', 'bypassPermissions']), opts);
    await page.screenshot({ path: path.join(OUT, 'settings-merger-' + l + '.png'), clip: await boxOf(page, '[data-role=settings]') });
    await page.click('[data-action=settings-close]');
    await sleep(300);
  }
  await openMerger(page);
  await page.selectOption('[data-field=setting-mergerPermission]', 'bypassPermissions');
  await sleep(800);
  const v1 = call('settings.get').settings.mergerPermission;
  await page.screenshot({ path: path.join(OUT, 'settings-merger-ko-bypass.png'), clip: await boxOf(page, '[data-role=settings]') });
  await page.selectOption('[data-field=setting-mergerPermission]', '');
  await sleep(800);
  const v2 = call('settings.get').settings.mergerPermission;
  check('칸을 바꾸면 판 설정이 바뀌고 되돌린다', v1 === 'bypassPermissions' && v2 === '', { v1, v2 });
  check('merger.status settings에 mergerPermission', 'mergerPermission' in (call('merger.status').settings || {}));
} catch (e) { check('예외 없이', false, e.message); }
finally {
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  await closeApp(app);
  log('결과 ' + results.filter((r) => r.ok).length + '/' + results.length);
  process.exit(results.every((r) => r.ok) ? 0 : 1);
}
