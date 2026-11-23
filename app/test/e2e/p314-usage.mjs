// P314 창 시험: 사용량 직접 묻기. 위 알약을 펼치면 낡은 값을 하네스에 묻고(묻는 중 표시), 펼침에 출처(직접 물음)·Claude 모델별 주간·
// 같은 계정 Hermes 합침 줄이 보인다. 흉내 값(usage.updated)으로 Hermes 따로 줄과 키로 읽는 잔액 줄(펼침 아래쪽)도 찍는다. 설정 › 일반의 사용량 직접 묻기 줄(ko·en)
// 판: 따로 띄운 개발용 판(atrium-dev-p314, 48064)만. 실행: node backend/.dev/mt.cjs node app/test/e2e/p314-usage.mjs [round]
// 결과는 experiments/p314/<round>/(저장소 밖)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const TAG = process.argv[2] || 'round-1';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const OUT = path.join(REPO, 'experiments', 'p314', TAG);
if (process.env.ATRIUM_TERMINAL_SESSION !== 'atrium-dev-p314' || process.env.ATRIUM_PORT !== '48064') throw new Error('개발용 판(atrium-dev-p314, 48064) 환경에서만 돈다');
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
fs.mkdirSync(OUT, { recursive: true });
const { logger, sleep, launch, closeApp } = await import('./harness.mjs');
const log = logger(`p314-${TAG}`);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 120000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 1500)}` : ''}`); };
const clipOf = async (pg, sel, pad = 8) => { const b = await pg.locator(sel).first().boundingBox(); return b ? { x: Math.max(0, b.x - pad), y: Math.max(0, b.y - pad), width: b.width + pad * 2, height: b.height + pad * 2 } : undefined; };
const dropClip = async (page) => { const box = await page.locator('[data-role=usage-list]').boundingBox(); const tr = await page.locator('[data-role=top-right]').boundingBox(); return { x: Math.min(box.x, tr.x) - 10, y: tr.y - 10, width: Math.max(box.x + box.width, tr.x + tr.width) - Math.min(box.x, tr.x) + 20, height: box.y + box.height - tr.y + 20 }; };

const { app, page } = await launch({ log, args: ['--remote-debugging-port=9545'] });
try {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1600, height: 1000 }).catch(() => {});
  await page.waitForFunction(() => !document.querySelector('[data-role=splash]'), null, { timeout: 30000 }).catch(() => log('splash 남음'));
  // 1) 실제 탐침: Claude 값을 지우고(낡게) 펼치면 묻는 중 → 값이 온다
  call('settings.set', { key: 'usageProbeMin', value: 2 });
  // Claude 값이 간격(2분)보다 낡을 때까지 기다린다(묻는 중 표시를 찍으려고)
  const c0 = call('usage.get').providers.claude;
  if (c0 && Date.now() - c0.at < 125000) { log(`Claude 값이 낡기를 ${Math.round((125000 - (Date.now() - c0.at)) / 1000)}초 기다림`); await sleep(125000 - (Date.now() - c0.at)); }
  for (const lang of ['ko', 'en']) {
    call('settings.set', { key: 'language', value: lang });
    await page.waitForFunction((l) => document.documentElement.lang === l, lang, { timeout: 10000 }).catch(() => {});
    await page.waitForSelector('[data-role=usage]', { timeout: 20000 });
    await sleep(600);
    const before = call('usage.get');
    const t0 = Date.now();
    await page.click('[data-role=usage]');
    await page.waitForSelector('[data-role=usage-list]');
    const sawProbing = await page.waitForSelector('[data-role=usage-probing]', { timeout: 8000 }).then(() => true).catch(() => false);
    if (sawProbing) await page.screenshot({ path: path.join(OUT, `pc-probing-${lang}.png`), clip: await dropClip(page) });
    await page.waitForFunction(() => !document.querySelector('[data-role=usage-probing]'), null, { timeout: 120000 }).catch(() => log('묻는 중이 끝나지 않음'));
    const ms = Date.now() - t0;
    await sleep(500);
    const after = call('usage.get');
    const blocks = await page.evaluate(() => [...document.querySelectorAll('[data-role=usage-provider], [data-role=usage-extra]')].map((p) => ({ k: p.dataset.provider, role: p.dataset.role, wins: [...p.querySelectorAll('[data-role=usage-window]')].map((w) => w.dataset.window), merged: p.querySelector('[data-role=usage-merged]') ? p.querySelector('[data-role=usage-merged]').innerText : null, src: (p.querySelector('.mt-usage-src') || {}).innerText || '' })));
    check(`[${lang}] 펼침: 낡은 값은 하네스에 묻는다(${sawProbing ? '묻는 중 보임' : '이미 새 값'}, ${ms}ms)`, after.providers.claude && after.providers.codex, { before: Object.fromEntries(Object.entries(before.providers).map(([k, v]) => [k, v && v.source])), after: Object.fromEntries(Object.entries(after.providers).map(([k, v]) => [k, v && [v.source, v.sameAs]])) });
    check(`[${lang}] 펼침 블록: 출처 글·모델별 주간·합침 줄`, blocks.some((b) => b.k === 'claude' && b.wins.some((w) => w.startsWith('week:'))), blocks);
    await page.screenshot({ path: path.join(OUT, `pc-dropdown-${lang}.png`), clip: await dropClip(page) });
    const pill = await page.evaluate(() => [...document.querySelectorAll('[data-role=usage] [data-provider]')].map((x) => x.dataset.provider));
    check(`[${lang}] 알약은 세 대표만`, pill.every((k) => ['claude', 'codex', 'agy'].includes(k)), pill);
    await page.keyboard.press('Escape');
    // 2) 흉내: Hermes 따로(다른 계정) + DeepSeek 잔액 → 펼침 아래쪽
    const v = call('usage.get');
    const fake = { ...v, providers: { ...v.providers, hermes: { ...(v.providers.hermes || { provider: 'hermes', source: 'probe:hermes', hermesProvider: 'anthropic', plan: 'Max', windows: [{ id: '5h', usedPct: 41, resetsAt: Date.now() + 7200000 }] }), sameAs: null, at: Date.now() }, deepseek: { provider: 'deepseek', source: 'probe:balance', at: Date.now(), windows: [], balance: { total: 7.25, currency: 'USD' } } }, probing: [] };
    await page.evaluate((x) => { window.__mt.api.emit('usage.updated', x); }, fake);
    // 펼치면 refresh가 진짜 값을 다시 보낼 수 있다: 펼친 뒤 흉내를 한 번 더 넣는다
    await page.click('[data-role=usage]');
    await page.waitForSelector('[data-role=usage-list]');
    await sleep(300);
    await page.evaluate((x) => { window.__mt.api.emit('usage.updated', x); }, fake);
    await sleep(300);
    const extras = await page.evaluate(() => [...document.querySelectorAll('[data-role=usage-extra]')].map((p) => [p.dataset.provider, p.dataset.type, p.innerText.replace(/\s+/g, ' ').slice(0, 160)]));
    check(`[${lang}] 펼침 아래쪽: Hermes 따로(다른 계정)·DeepSeek 잔액`, extras.some((e) => e[0] === 'hermes') && extras.some((e) => e[0] === 'deepseek' && e[1] === 'balance'), extras);
    await page.screenshot({ path: path.join(OUT, `pc-extras-${lang}.png`), clip: await dropClip(page) });
    await page.keyboard.press('Escape');
    await page.evaluate((x) => { window.__mt.api.emit('usage.updated', x); }, call('usage.get'));
    // 3) 설정 › 일반
    await page.click('[data-action=settings-open]');
    await page.click('[data-role=settings-tabs] [data-tab=alerts]'); // P338: 알림·사용량 쪽(옛 일반)
    await page.waitForSelector('[data-role=usage-probe-setting]', { timeout: 10000 });
    await page.locator('[data-role=usage-probe-setting]').scrollIntoViewIfNeeded();
    await sleep(300);
    const a = await page.locator('[data-role=usage-probe-setting]').boundingBox();
    const b = await page.locator('[data-role=usage-hermes-setting]').boundingBox().catch(() => null);
    log(`설정 줄 상자 ${JSON.stringify({ a, b })}`);
    if (a && b) await page.screenshot({ path: path.join(OUT, `pc-setting-${lang}.png`), clip: { x: Math.min(a.x, b.x) - 10, y: a.y - 40, width: Math.max(a.width, b.width) + 20, height: b.y + b.height - a.y + 50 } });
    else await page.screenshot({ path: path.join(OUT, `pc-setting-${lang}-full.png`) });
    check(`[${lang}] 설정: 직접 묻기·간격·Hermes 줄`, !!(await page.$('[data-field=setting-usageProbe]')) && !!(await page.$('[data-field=setting-usageProbeMin]')) && !!(await page.$('[data-field=setting-usageHermes]')));
    await page.keyboard.press('Escape');
    await sleep(400);
  }
} catch (e) { check('예외 없이 끝', false, e.stack); } finally {
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  await closeApp(app);
  log(`끝: ${results.filter((r) => r.ok).length}/${results.length}`);
  process.exit(results.every((r) => r.ok) ? 0 : 1);
}
