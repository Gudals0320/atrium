// P329 창 시험: omo(OmO) 하네스. 런처 목록·런처 편집 틀(모델 칸의 Codex 목록, 노력 수준, 미리보기 --thinking), 런처로 띄운 omo 카드(om1)와
//   Claude 리드가 atrium child --kind omo로 띄운 하위 카드(o2)의 종류 표지(Om)·모델·상태. 모델 턴을 쓰지 않는다(그림을 찍고 화면 글을 읽는다).
// 판: 따로 띄운 개발용 판(atrium-dev-p329, 48079, 이 워크트리의 backend/.dev)만. 창의 원격 디버깅 포트 9560. 한 번에 한 창만(메모리).
//   판에는 미리 OmO 런처(하네스 omo)와 om1(그 런처로 띄움)·o2(리드 ld의 omo 하위)가 떠 있어야 한다(기록 docs log p329).
// 실행: node app/test/e2e/p329-omo.mjs [round]   결과는 워크트리의 experiments/p329/<round>/(저장소 밖).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const TAG = process.argv[2] || 'round-1';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const DEV = path.join(REPO, 'backend', '.dev');
const OUT = path.join(REPO, 'experiments', 'p329', TAG);
const BOARD = 'atrium-dev-p329', PORT = '48079', DEBUG = '9560';
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_|HC_)/.test(k)) delete process.env[k];
for (const k of Object.keys(process.env)) if (/^(CLAUDECODE|CLAUDE_CODE_|CLAUDE_EFFORT|CLAUDE_PID|CLAUDE_AGENT_SDK|ELECTRON_RUN_AS_NODE)/.test(k)) delete process.env[k];
const ENV = {
  ATRIUM_TERMINAL_SESSION: BOARD, ATRIUM_HERDR_SESSION: BOARD, ATRIUM_PORT: PORT,
  ATRIUM_DATA_DIR: path.join(DEV, 'data'), ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  ATRIUM_CLAUDE_PROJECTS: path.join(DEV, 'no-projects'), ATRIUM_CLAUDE_DESKTOP: 'none', MT_E2E_OUT: path.join('p329', TAG),
};
Object.assign(process.env, ENV);
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(ENV.ATRIUM_CLAUDE_PROJECTS, { recursive: true });
const { logger, sleep, launch, closeApp } = await import('./harness.mjs');
const { assertTestBoard } = await import('./p9-guard.mjs');
assertTestBoard(ENV, { root: DEV });
const log = logger(`p329-${TAG}`);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 120000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 1600)}` : ''}`); };
const AWAKE = ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'];
const shot = (pg, name, clip) => pg.screenshot({ path: path.join(OUT, `${name}.png`), ...(clip ? { clip } : {}) }).then(() => log(`그림 ${name}.png`)).catch((e) => log(`스크린숏 실패 ${name} ${e.message.slice(0, 80)}`));
async function awayWin(app) { return app.evaluate(({ BrowserWindow, screen }) => { const w = BrowserWindow.getAllWindows()[0]; if (!w) return null; const ds = screen.getAllDisplays(); const left = Math.min(...ds.map((d) => d.bounds.x)); const b = w.getBounds(); w.setPosition(left - b.width - 200, 40); return w.getBounds(); }).catch((e) => ({ err: e.message })); }
const rectOf = (pg, sel) => pg.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.max(0, Math.round(r.x) - 6), y: Math.max(0, Math.round(r.y) - 6), width: Math.round(r.width) + 12, height: Math.round(Math.min(r.height, 900)) + 12 }; }, sel);
const until = async (fn, ms = 5000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await sleep(250); } return false; };
const sessionOf = (name) => call('session.list').find((s) => s.name === name);
const nodeSel = (s) => `.react-flow__node[data-id="${s.sessionId}"]`;
const cardInfo = (pg, sel) => pg.evaluate((x) => { const e = document.querySelector(x); if (!e) return null; const k = e.querySelector('[data-kind]'); return { text: e.innerText.replace(/\s+/g, ' ').slice(0, 300), kind: k ? k.getAttribute('data-kind') : null }; }, sel);
const escAll = async (pg) => { for (let i = 0; i < 3; i++) { await pg.keyboard.press('Escape'); await sleep(200); } };
const fit = (pg) => pg.evaluate(() => window.__mtFlow && window.__mtFlow.fitView && window.__mtFlow.fitView()).catch(() => {});

const pre = call('session.list');
for (const n of ['om1', 'o2', 'ld']) if (!pre.find((s) => s.name === n)) throw new Error(`${n} 세션이 없다`);
const L = call('launcher.list', {});
const omoL = L.launchers.find((l) => l.harness === 'omo');
if (!omoL) throw new Error('omo 런처가 없다');

const { app, page } = await launch({ log, env: { ...ENV }, args: [`--remote-debugging-port=${DEBUG}`, ...AWAKE] });
try {
  await awayWin(app);
  await page.setViewportSize({ width: 1600, height: 1000 }).catch(() => {});
  for (const lang of ['ko', 'en']) {
    call('settings.set', { key: 'language', value: lang }); await sleep(1500);
    await escAll(page); await fit(page); await sleep(1000);
    await shot(page, `board-${lang}`);
    // 1) 카드: 런처로 띄운 om1, 리드의 하위 o2
    for (const n of ['om1', 'o2']) {
      const s = sessionOf(n);
      await page.waitForSelector(nodeSel(s), { timeout: 30000 }).catch(() => log(`${n} 노드를 못 찾음`));
      await escAll(page); await fit(page); await sleep(800);
      await page.click(nodeSel(s)).catch(() => {}); await sleep(1500);
      if (await page.$(`${nodeSel(s)} .xterm-screen`)) { await page.click(`${nodeSel(s)} .xterm-screen`).catch(() => {}); await sleep(1500); }
      const r = await rectOf(page, nodeSel(s)); if (r) await shot(page, `card-${n}-${lang}`, r);
      const info = await cardInfo(page, nodeSel(s));
      log(`[${lang}] ${n}: ${JSON.stringify(info)} state=${s.state} kind=${s.kind} model=${s.model} effort=${s.effort}`);
      check(`[${lang}] ${n} 카드: 종류 omo(표지 Om)·준비 완료·모델 gpt-6-luna-fast`, s.kind === 'omo' && info && info.kind === 'omo' && s.state === 'ready' && /gpt-6-luna/.test(info.text), info);
    }
    // 2) 설정 › 런처: 목록과 OmO 런처 편집 틀
    await escAll(page);
    await page.click('[data-action=settings-open]');
    await until(() => page.$('[data-role=settings]'));
    await page.click('[data-role=settings] [data-tab=launchers]');
    await until(() => page.$('[data-role=launchers-list]'));
    await sleep(600);
    await shot(page, `launchers-${lang}`, await rectOf(page, '[data-role=settings]'));
    await page.click(`[data-role=launcher-row][data-launcher="${omoL.id}"] [data-action=launcher-edit]`).catch((e) => log('편집 단추 실패', e.message.slice(0, 80)));
    await until(() => page.$('[data-role=launcher-form]'));
    await sleep(1200);
    const form = await page.evaluate(() => { const f = document.querySelector('[data-role=launcher-form]'); if (!f) return null; const eff = f.querySelector('[data-field=launcher-effort]'); const hs = f.querySelector('[data-field=launcher-harness]'); return { harness: f.getAttribute('data-harness'), harnessText: hs ? hs.options[hs.selectedIndex].textContent : null, effort: eff ? eff.value : null, efforts: eff ? [...eff.options].map((o) => o.value) : [], effortDefault: eff ? eff.options[0].textContent : null, orch: !!(f.querySelector('[data-field=launcher-orchestrates]') || {}).checked, preview: (f.querySelector('[data-role=launcher-form-preview]') || {}).innerText || '' }; });
    log(`[${lang}] 편집 틀: ${JSON.stringify(form)}`);
    await shot(page, `launcher-form-${lang}`, await rectOf(page, '[data-role=settings]'));
    check(`[${lang}] OmO 런처 편집 틀: 하네스 OmO·노력 low(omo --thinking 값)·오케스트레이션 켬·미리보기 omo --model … --thinking low`, form && form.harness === 'omo' && form.harnessText === 'OmO' && form.effort === 'low' && form.efforts.join(',') === ',off,minimal,low,medium,high,xhigh,max' && form.orch && /omo --model chatgpt-subscription\/gpt-6-luna-fast --thinking low/.test(form.preview), form);
    // 모델 칸: Codex 목록(드롭다운을 연다)
    const mi = await page.$('[data-role=launcher-form] [data-field=launcher-model], [data-role=launcher-form] input[list], [data-role=launcher-form] .mt-model-input input');
    // 모델 칸을 비우면(저장하지 않는다) 목록 전체가 보인다
    if (mi) { await mi.click().catch(() => {}); await page.keyboard.press('Control+A'); await page.keyboard.press('Backspace'); await sleep(800); await shot(page, `launcher-model-${lang}`, await rectOf(page, '[data-role=settings]')); }
    const opts = await page.evaluate(() => [...document.querySelectorAll('[data-role=launcher-models] [data-model]')].map((e) => e.getAttribute('data-model')));
    log(`[${lang}] 모델 목록 ${opts.length}: ${opts.slice(0, 5).join(', ')}`);
    check(`[${lang}] 모델 칸 목록: Codex 구독 모델(chatgpt-subscription/…)`, opts.length >= 5 && opts.every((m) => m.startsWith('chatgpt-subscription/')), opts.slice(0, 8));
    await page.click('[data-action=launcher-cancel]').catch(() => {});
    for (let i = 0; i < 3 && (await page.$('[data-role=settings]')); i++) { await page.keyboard.press('Escape'); await sleep(400); }
  }
} finally {
  call('settings.set', { key: 'language', value: 'ko' });
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  log(`결과 ${results.filter((r) => r.ok).length}/${results.length}`);
  await closeApp(app).catch(() => {});
}
