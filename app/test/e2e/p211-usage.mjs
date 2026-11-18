// P211 창 시험: 구독 사용량. PC 위 막대 알약(메모리 알약 옆)과 펼침, 레일 호출자 옆 남은 양, 새 세션 창, 설정의 알림 끄기(ko·en, 움직임 줄임),
// 휴대폰 390×844 목록 위쪽 줄 알약과 펼침(ko·en). 사용률 숫자는 그림에 보여도 되고, 판에는 시험 세션만 있다(실제 대화 없음).
// 판: 따로 띄운 개발용 판(atrium-dev-p211, 47985, 데이터 %LOCALAPPDATA%\atrium-dev-p211)만 쓴다. 휴대폰은 흉내 프록시 47986과 가짜 tailscale.
// 실행: node backend/.dev/mt.cjs node app/test/e2e/p211-usage.mjs <pc|phone> [round]   (mt.cjs가 실제 판 변수를 지우고 개발용 판 값을 넣는다)
// 결과는 워크트리의 experiments/p211/<round>/(저장소 밖).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const WHAT = process.argv[2] || 'pc';
const TAG = process.argv[3] || 'round-1';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const OUT = path.join(REPO, 'experiments', 'p211', TAG);
if (process.env.ATRIUM_TERMINAL_SESSION !== 'atrium-dev-p211' || process.env.ATRIUM_PORT !== '47985') throw new Error('개발용 판(atrium-dev-p211, 47985) 환경에서만 돈다');
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
fs.mkdirSync(OUT, { recursive: true });
const { logger, sleep, launch, closeApp } = await import('./harness.mjs');
const log = logger(`p211-${WHAT}-${TAG}`);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 120000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 1200)}` : ''}`); };
const clipOf = async (pg, sel, pad = 8) => { const b = await pg.locator(sel).first().boundingBox(); return b ? { x: Math.max(0, b.x - pad), y: Math.max(0, b.y - pad), width: b.width + pad * 2, height: b.height + pad * 2 } : undefined; };

async function pc() {
  const { app, page } = await launch({ log, args: ['--remote-debugging-port=9465'] });
  try {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(() => !document.querySelector('[data-role=splash]'), null, { timeout: 30000 }).catch(() => log('splash 남음'));
    await page.setViewportSize({ width: 1600, height: 960 }).catch(() => {});
    const usage = call('usage.get');
    check('usage.get: Claude·Codex 값이 판에 있다', !!(usage.providers.claude && usage.providers.codex), Object.fromEntries(Object.entries(usage.providers).map(([k, v]) => [k, v ? v.windows.map((w) => `${w.id} ${w.usedPct}`) : null])));
    for (const lang of ['ko', 'en']) {
      call('settings.set', { key: 'language', value: lang });
      await page.waitForFunction((l) => document.documentElement.lang === l, lang, { timeout: 10000 }).catch(() => {});
      await page.waitForSelector('[data-role=usage]', { timeout: 20000 });
      await page.waitForFunction(() => !document.querySelector('[data-role=splash]'), null, { timeout: 30000 }).catch(() => log('splash 남음'));
      await sleep(500);
      const pill = await page.evaluate(() => { const b = document.querySelector('[data-role=usage]'); const res = document.querySelector('[data-role=resources]'); return { text: b.innerText.replace(/\s+/g, ' '), level: b.dataset.level, nextToMemory: !!res && res.closest('.mt-drop').nextElementSibling === b.closest('.mt-drop'), parts: [...b.querySelectorAll('[data-provider]')].map((x) => [x.dataset.provider, Number(x.dataset.pct)]) }; });
      check(`[${lang}] 위 막대 알약: 메모리 알약 바로 옆, 구독마다 가장 높은 창`, pill.nextToMemory && pill.parts.length >= 2, pill);
      const top = Math.max(...pill.parts.map((p) => p[1]));
      const want = top >= 85 ? 'high' : top >= 60 ? 'warn' : 'ok';
      check(`[${lang}] 알약 색은 가장 높은 값의 기준(${top}% → ${want})`, pill.level === want, pill.level);
      await page.screenshot({ path: path.join(OUT, `pc-pill-${lang}.png`), clip: await clipOf(page, '[data-role=top-right]', 10) });
      await page.click('[data-role=usage]');
      await page.waitForSelector('[data-role=usage-list]');
      const list = await page.evaluate(() => [...document.querySelectorAll('[data-role=usage-provider]')].map((p) => ({ k: p.dataset.provider, unknown: p.classList.contains('unknown'), wins: [...p.querySelectorAll('[data-role=usage-window]')].map((w) => [w.dataset.window, Number(w.dataset.pct)]), text: p.innerText.replace(/\s+/g, ' ').slice(0, 200) })));
      check(`[${lang}] 펼침: 구독 셋, 창별 막대·리셋·받은 때·출처(AGY는 값이 없으면 모름)`, list.length === 3 && list.find((x) => x.k === 'codex').wins.length >= 1, list);
      const box = await page.locator('[data-role=usage-list]').boundingBox();
      const tr = await page.locator('[data-role=top-right]').boundingBox();
      await page.screenshot({ path: path.join(OUT, `pc-dropdown-${lang}.png`), clip: { x: Math.min(box.x, tr.x) - 10, y: tr.y - 10, width: Math.max(box.x + box.width, tr.x + tr.width) - Math.min(box.x, tr.x) + 20, height: box.y + box.height - tr.y + 20 } });
      await page.keyboard.press('Escape');
      // 레일: 즐겨찾기 호출자 옆 남은 양
      const rail = await page.evaluate(() => [...document.querySelectorAll('[data-role=rail-favorites] [data-action=launch]')].map((b) => ({ name: b.dataset.name, left: b.querySelector('[data-role=usage-left]') ? Number(b.querySelector('[data-role=usage-left]').dataset.pct) : null, title: b.title.split('\n').pop() })));
      check(`[${lang}] 레일 호출자(Claude Code, Codex) 옆에 남은 양`, rail.filter((r) => r.left != null).length >= 2, rail);
      await page.screenshot({ path: path.join(OUT, `pc-rail-${lang}.png`), clip: await clipOf(page, '[data-role=rail-favorites]', 12) });
      // 새 세션 창: 호출자 드롭다운 줄과 미리보기 옆
      await page.click('[data-action=chip-spawn]');
      await page.waitForSelector('[data-role=spawn]');
      const sp = await page.evaluate(() => ({ options: [...document.querySelectorAll('[data-field=launcher] option')].map((o) => o.textContent), left: !!document.querySelector('[data-role=spawn] [data-role=usage-left]') }));
      check(`[${lang}] 새 세션 창: 호출자 이름 옆 남은 양`, sp.left && sp.options.some((o) => /%/.test(o)), sp);
      await page.screenshot({ path: path.join(OUT, `pc-spawn-${lang}.png`), clip: await clipOf(page, '[data-role=spawn]', 10) });
      await page.keyboard.press('Escape');
      await sleep(300);
      // 설정 › 일반: 사용량 알림 끄기
      await page.click('[data-action=settings-open]');
      await page.waitForSelector('[data-role=usage-alert-setting]', { timeout: 10000 });
      await page.locator('[data-role=usage-alert-setting]').scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(OUT, `pc-setting-${lang}.png`), clip: await clipOf(page, '[data-role=usage-alert-setting]', 10) });
      if (lang === 'ko') {
        await page.click('[data-field=setting-usageAlerts]');
        await sleep(800);
        check('[ko] 설정: 알림 끄기가 판 설정과 usage.get에 반영', call('settings.get').settings.usageAlerts === false && call('usage.get').alertsOn === false);
        await page.click('[data-field=setting-usageAlerts]');
        await sleep(800);
        check('[ko] 설정: 다시 켬', call('settings.get').settings.usageAlerts === true);
      }
      await page.keyboard.press('Escape');
      await sleep(300);
      // 90% 알림: 창 안의 알림 길(흉내 사건)이 OS 알림을 한 번 부른다
      if (lang === 'en') {
        const r = await page.evaluate(async () => { const n0 = (window.__mtUsageAlerts || []).length; window.__mt.api.emit('usage.alert', { key: 'claude|week|test', provider: 'claude', window: 'week', usedPct: 91, resetsAt: Date.now() + 3600000 }); await new Promise((r) => setTimeout(r, 400)); return null; });
        const shown = await app.evaluate(() => (global.__mtNotifications || []).filter((n) => String(n.key).startsWith('usage|')).map((n) => ({ key: n.key, shown: n.shown })));
        check('[en] usage.alert → 창의 알림 길(mt:notify) 한 번', shown.length === 1, shown);
      }
      // 판 전체(작게)
      await page.screenshot({ path: path.join(OUT, `pc-board-${lang}.png`) });
    }
  } finally { await closeApp(app); }
}

async function phone() {
  const pw = await import('playwright');
  const L = await import('./p59-lib.mjs');
  const { NAME, LOGIN, LAPTOP_A } = L;
  const SIM = 47986;
  const toUrl = (p) => 'file:///' + p.replace(/\\/g, '/');
  const { startTsSim } = await import(toUrl(path.join(REPO, 'backend', 'tools', 'ts-sim-proxy.mjs')));
  const sim = startTsSim({ listen: SIM, target: 47985, name: NAME, login: LOGIN, keepOrigin: true }); sim.cfg.ip = LAPTOP_A;
  await sim.ready;
  const pwDir = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright');
  const chromeExe = (() => { try { return fs.readdirSync(pwDir).filter((x) => /^chromium-\d+$/.test(x)).sort().reverse().map((x) => path.join(pwDir, x, 'chrome-win64', 'chrome.exe')).find((f) => fs.existsSync(f)); } catch { return null; } })();
  const SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
  const browser = await pw.chromium.launch({ headless: true, ...(chromeExe ? { executablePath: chromeExe } : {}) });
  try {
    for (const lang of ['ko', 'en']) {
      call('settings.set', { key: 'language', value: lang });
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, screen: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: SAFARI, locale: lang === 'ko' ? 'ko-KR' : 'en-US', reducedMotion: 'reduce' });
      const pg = await ctx.newPage();
      pg.on('pageerror', (e) => log(`[phone pageerror] ${e.message}`));
      await pg.goto(`http://localhost:${SIM}/`);
      await pg.waitForSelector('[data-role=pair]', { timeout: 30000 });
      await pg.fill('[data-field=pair-code]', call('device.code').code);
      await pg.click('[data-action=pair-submit]');
      await pg.waitForFunction(() => window.__mt && window.__mt.getState().boardLoaded && window.__mt.api.conn.phase === 'open', null, { timeout: 60000 });
      await pg.waitForSelector('[data-role=phone-list] [data-role=usage]', { timeout: 20000 });
      await pg.waitForFunction(() => !document.querySelector('[data-role=splash]'), null, { timeout: 30000 }).catch(() => log('splash 남음'));
      await sleep(800);
      const head = await pg.evaluate(() => { const b = document.querySelector('[data-role=phone-list] [data-role=usage]'); const kids = [...document.querySelector('.mt-ph-head').children].map((k) => k.getBoundingClientRect()); return { text: b.innerText.replace(/\s+/g, ' '), allInside: kids.every((r) => r.left >= -0.5 && r.right <= innerWidth + 0.5), rights: kids.map((r) => Math.round(r.right)), level: b.dataset.level }; });
      check(`[${lang}] 휴대폰 위쪽 줄에 알약(가장 높은 값), 줄의 단추가 모두 화면 안`, head.allInside && /^\d+%$/.test(head.text.trim()), head);
      await pg.screenshot({ path: path.join(OUT, `phone-list-${lang}.png`) });
      await pg.tap('[data-role=phone-list] [data-role=usage]');
      await pg.waitForSelector('[data-role=usage-list]');
      await sleep(300);
      const fit = await pg.evaluate(() => { const r = document.querySelector('[data-role=usage-list]').getBoundingClientRect(); return { left: r.left, right: r.right, w: innerWidth, n: document.querySelectorAll('[data-role=usage-provider]').length }; });
      check(`[${lang}] 휴대폰 펼침: 화면 안, 구독 셋`, fit.left >= 0 && fit.right <= fit.w && fit.n === 3, fit);
      await pg.screenshot({ path: path.join(OUT, `phone-dropdown-${lang}.png`) });
      await ctx.close();
    }
  } finally { await browser.close(); sim.close && sim.close(); }
}

try {
  if (WHAT === 'pc') await pc();
  else if (WHAT === 'phone') await phone();
} catch (e) {
  check('시험이 끝까지 돌았다', false, e.stack || e.message);
} finally {
  fs.writeFileSync(path.join(OUT, `p211-${WHAT}.json`), JSON.stringify({ results }, null, 2));
  const bad = results.filter((r) => !r.ok);
  log(`결과 ${results.length - bad.length}/${results.length} 통과${bad.length ? ` 실패: ${bad.map((b) => b.name).join(', ')}` : ''}`);
  process.exit(bad.length ? 1 : 0);
}
