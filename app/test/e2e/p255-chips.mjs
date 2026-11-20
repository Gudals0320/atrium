// P255 창 시험: 위 오른쪽 칩(작업 완료 모두 읽기, 메모리 칩의 CPU, Codex 크레딧), 설정 탭 목록(연결 없음). ko·en 그림.
// 판: 따로 띄운 개발용 판(atrium-dev-p255, 48005, 창 9485)만. 시험 폴더의 haiku 세션 둘(한 번 답함 → 작업 완료)과 셸 하나는 이 시험 밖에서 띄운다.
// Codex 크레딧은 창 안 usage.updated로 흉내 낸다(실제 rollout은 읽지 않는다). 실행: sh backend/.dev/dev.sh node app/test/e2e/p255-chips.mjs [round]
// 결과는 experiments/p255/<round>/(저장소 밖)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const TAG = process.argv[2] || 'round-1';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const OUT = path.join(REPO, 'experiments', 'p255', TAG);
if (process.env.ATRIUM_TERMINAL_SESSION !== 'atrium-dev-p255' || process.env.ATRIUM_PORT !== '48005') throw new Error('개발용 판(atrium-dev-p255, 48005) 환경에서만 돈다');
process.env.MT_E2E_OUT = path.relative(path.join(REPO, 'experiments'), OUT);
fs.mkdirSync(OUT, { recursive: true });
const { logger, sleep, launch, closeApp, sessionsOf } = await import('./harness.mjs');
const log = logger('p255-' + TAG);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 120000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 1200) : '')); };
async function lang(page, l) { call('settings.set', { key: 'language', value: l }); await page.waitForFunction((x) => document.documentElement.lang === x, l, { timeout: 10000 }).catch(() => {}); await sleep(500); }
const shot = async (page, name, clip) => { await page.screenshot({ path: path.join(OUT, name + '.png'), ...(clip ? { clip } : {}) }); log('그림 ' + name + '.png'); };
// 위 오른쪽 칩과 펼침을 함께 담는 상자
const dropClip = (page, sel) => page.evaluate((s) => {
  const els = [document.querySelector('[data-role=top-right]'), document.querySelector(s)].filter(Boolean);
  const rs = els.map((e) => e.getBoundingClientRect());
  const x = Math.max(0, Math.min(...rs.map((r) => r.left)) - 12), y = 0;
  const r = Math.max(...rs.map((r) => r.right)) + 12, b = Math.max(...rs.map((r) => r.bottom)) + 12;
  return { x, y, width: Math.min(window.innerWidth, r) - x, height: Math.min(window.innerHeight, b) - y };
}, sel);
const NOW = Date.now();
const fakeUsage = (credits) => ({ providers: {
  claude: { provider: 'claude', source: 'statusline', at: NOW, windows: [{ id: '5h', minutes: 300, usedPct: 34, resetsAt: NOW + 2 * 3600000 }, { id: 'week', minutes: 10080, usedPct: 61, resetsAt: NOW + 3 * 86400000 }], credits: null, plan: null, model: null },
  codex: { provider: 'codex', source: 'rollout', at: NOW, windows: [{ id: '5h', minutes: 300, usedPct: 100, resetsAt: NOW + 3600000 }, { id: 'week', minutes: 10080, usedPct: 72, resetsAt: NOW + 4 * 86400000 }], credits, plan: 'plus', model: null },
  agy: null }, alertsOn: true, at: NOW });

// CPU: 두 번 재야 앞 값이 생긴다
call('resources.get', { fresh: true }); await sleep(4000); const r2 = call('resources.get', { fresh: true });
check('자원 표본에 CPU(세션들·PC 전체)', r2 && r2.cpu && r2.cpu.systemPct != null && r2.cpu.sessionsPct != null && r2.sessions.some((x) => x.cpuPct != null), r2 && r2.cpu);

const { app, page } = await launch({ log, args: ['--remote-debugging-port=9485'] });
try {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1600, height: 1000 }).catch(() => {});
  await sleep(1500);
  for (const l of ['ko', 'en']) {
    await lang(page, l);
    // 1 작업 완료 펼침의 모두 읽기
    await page.click('[data-role=review]'); await page.waitForSelector('[data-role=review-list] [data-action=read-all]', { timeout: 10000 });
    const ra = await page.$eval('[data-role=review-list] [data-action=read-all]', (e) => e.textContent);
    check(`[${l}] 작업 완료 펼침 머리의 모두 읽기`, ra === (l === 'ko' ? '모두 읽기' : 'Mark all read'), ra);
    await shot(page, `done-readall-${l}`, await dropClip(page, '[data-role=review-list]'));
    await page.keyboard.press('Escape'); await page.click('[data-role=review]').catch(() => {}); await sleep(300);
    // 2 메모리 칩의 CPU
    await page.evaluate((v) => window.__mt.api.emit('resources', v), call('resources.get', { fresh: true }));
    await sleep(300);
    await page.click('[data-role=resources]'); await page.waitForSelector('[data-role=res-cpu]', { timeout: 10000 });
    const cpu = await page.$eval('[data-role=res-cpu]', (e) => e.textContent);
    check(`[${l}] 메모리 칩 펼침의 CPU 줄`, /CPU/.test(cpu) && !/\?/.test(cpu), cpu);
    await shot(page, `mem-cpu-${l}`, await dropClip(page, '[data-role=resources-list]'));
    await page.click('[data-role=resources]'); await sleep(300);
    // 3 Codex 크레딧(흉내)
    await page.evaluate((v) => window.__mt.api.emit('usage.updated', v), fakeUsage({ hasCredits: true, unlimited: false, balance: '46647.8239250000' }));
    await sleep(400);
    const pill = await page.$eval('[data-role=usage]', (e) => ({ text: e.textContent, title: e.title }));
    check(`[${l}] Codex 알약은 퍼센트 대신 남은 크레딧, 풍선에는 창 값`, /46,648/.test(pill.text) && /100%/.test(pill.title) && /72%/.test(pill.title), pill);
    await page.click('[data-role=usage]'); await sleep(400);
    await shot(page, `codex-credit-${l}`, await dropClip(page, '[data-role=usage-list]'));
    await page.click('[data-role=usage]'); await sleep(200);
    await page.evaluate((v) => window.__mt.api.emit('usage.updated', v), fakeUsage({ hasCredits: false, unlimited: true, balance: null }));
    await sleep(300);
    const un = await page.$eval('[data-role=usage]', (e) => e.textContent);
    check(`[${l}] 무제한 크레딧 글`, /(무제한|Unlimited)/.test(un), un);
    await shot(page, `codex-unlimited-${l}`, await dropClip(page, '[data-role=usage]'));
    // 4 설정 탭 목록
    await page.click('[data-action=settings-open]'); await page.waitForSelector('[data-role=settings-tabs]', { timeout: 10000 }); await sleep(500);
    const tabs = await page.$$eval('[data-role=settings-tabs] [data-tab]', (els) => els.map((e) => e.dataset.tab));
    check(`[${l}] 설정 탭에 연결이 없다`, !tabs.includes('connections') && tabs.includes('launchers'), tabs);
    await shot(page, `settings-tabs-${l}`, await page.evaluate(() => { const r = document.querySelector('[data-role=settings]').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }));
    // 런처 틀에 연결 칸이 없다
    await page.click('[data-role=settings-tabs] [data-tab=launchers]'); await sleep(400);
    await page.click('[data-role=launcher-row] [data-action=launcher-edit]').catch(() => {}); await sleep(600);
    const conn = await page.$('[data-field=launcher-connection]');
    check(`[${l}] 런처 틀에 연결 칸이 없다`, !conn && !!(await page.$('[data-role=launcher-form]')));
    await shot(page, `launcher-form-${l}`, await page.evaluate(() => { const r = document.querySelector('[data-role=settings]').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }));
    await page.click('[data-action=launcher-cancel]').catch(() => {}); await sleep(200);
    await page.click('[data-action=settings-close]'); await sleep(300);
  }
  // 5 모두 읽기 동작: 목록의 작업 완료가 모두 봤음으로 바뀌고 칩이 사라진다
  const before = (await sessionsOf(page)).filter((s) => s.unseen).map((s) => s.name);
  await page.click('[data-role=review]'); await page.click('[data-role=review-list] [data-action=read-all]');
  await sleep(2500);
  const after = (await sessionsOf(page)).filter((s) => s.unseen).map((s) => s.name);
  const chip = await page.$('[data-role=review]');
  check('모두 읽기: 작업 완료가 모두 봤음, 칩이 사라진다', before.length >= 2 && after.length === 0 && !chip, { before, after });
  await shot(page, 'after-readall');
} finally {
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  log(`끝: ${results.filter((r) => r.ok).length}/${results.length}`);
  await closeApp(app);
  process.exit(results.every((r) => r.ok) ? 0 : 1);
}
