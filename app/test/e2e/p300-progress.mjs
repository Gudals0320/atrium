// P300 창 시험: 자체 오케스트레이션 세션(Hermes + OMH dag-ulw)의 안 진행 칩. 진짜 Hermes 하위(h1)가 DAG를 도는 동안
//   판 카드 칩·갈래 목록 겉판·세션 맵 칩(PC)과 휴대폰 맵 칩을 ko·en으로 찍고, 끝난 뒤 "끝" 칩을 찍는다. 진행 값의 바뀜(0/N → N/N)을 기록한다.
// 판: 따로 띄운 개발용 판(atrium-dev-p300, 48050, 이 워크트리의 backend/.dev)만. 창 9531, 휴대폰 흉내 프록시 48351. 한 번에 창 하나(메모리).
//   판의 백엔드는 가짜 tailscale(P49_FAKE_TS_PORT)과 ATRIUM_WEB_HOSTS로 미리 띄워 두고, h1은 이 시험 밖에서 띄운다(기록 docs log p300).
// 실행: node app/test/e2e/p300-progress.mjs <h1 이름> [round] [emit]   결과는 experiments/p300/<round>/(저장소 밖).
//   emit: 진짜 진행이 끝난 뒤, 그 갈래 값을 도는 중(1/5, 하위 3)으로 바꿔 창 안에 session.updated로 넣고 세션 맵·휴대폰 카드만 다시 찍는다(배치를 고친 뒤 다시 찍기)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const NAME_H = process.argv[2] || 'h1';
const TAG = process.argv[3] || 'round-1';
const MODE = process.argv[4] || 'live';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', '..');
const DEV = path.join(REPO, 'backend', '.dev');
const OUT = path.join(REPO, 'experiments', 'p300', TAG);
const BOARD = 'atrium-dev-p300', PORT = '48050', DEBUG = '9531', SIM = 48351;
for (const k of Object.keys(process.env)) if (/^(ATRIUM_|MTASK_|HERDR_|HC_)/.test(k)) delete process.env[k];
for (const k of Object.keys(process.env)) if (/^(CLAUDECODE|CLAUDE_CODE_|CLAUDE_EFFORT|CLAUDE_PID|CLAUDE_AGENT_SDK|ELECTRON_RUN_AS_NODE)/.test(k)) delete process.env[k];
const ENV = {
  ATRIUM_TERMINAL_SESSION: BOARD, ATRIUM_HERDR_SESSION: BOARD, ATRIUM_PORT: PORT,
  ATRIUM_DATA_DIR: path.join(DEV, 'data'), ATRIUM_APP_USERDATA: path.join(DEV, 'app'),
  ATRIUM_CLAUDE_PROJECTS: path.join(DEV, 'projects'), ATRIUM_CLAUDE_DESKTOP: 'none', MT_E2E_OUT: path.join('p300', TAG),
};
Object.assign(process.env, ENV);
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(ENV.ATRIUM_CLAUDE_PROJECTS, { recursive: true });
const { logger, sleep, launch, closeApp } = await import('./harness.mjs');
const { assertTestBoard } = await import('./p9-guard.mjs');
const L59 = await import('./p59-lib.mjs');
assertTestBoard(ENV, { root: DEV });
const log = logger(`p300-${TAG}`);
const atrium = (...a) => execFileSync(process.execPath, [path.join(REPO, 'backend', 'bin', 'atrium.mjs'), '--dev', ...a], { encoding: 'utf8', env: process.env, timeout: 120000 });
const call = (m, p = {}) => JSON.parse(atrium('--json', 'call', m, JSON.stringify(p)));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 1600)}` : ''}`); };
const AWAKE = ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'];
const shot = (pg, name, clip) => pg.screenshot({ path: path.join(OUT, `${name}.png`), ...(clip ? { clip } : {}) }).then(() => log(`그림 ${name}.png`)).catch((e) => log(`스크린숏 실패 ${name} ${e.message.slice(0, 80)}`));
async function awayWin(app) { return app.evaluate(({ BrowserWindow, screen }) => { const w = BrowserWindow.getAllWindows()[0]; if (!w) return null; const ds = screen.getAllDisplays(); const left = Math.min(...ds.map((d) => d.bounds.x)); const b = w.getBounds(); w.setPosition(left - b.width - 200, 40); return w.getBounds(); }).catch((e) => ({ err: e.message })); }
const rectOf = (pg, sel, pad = 6) => pg.evaluate(([s, p]) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.max(0, Math.round(r.x) - p), y: Math.max(0, Math.round(r.y) - p), width: Math.round(r.width) + p * 2, height: Math.round(Math.min(r.height, 900)) + p * 2 }; }, [sel, pad]);
const until = async (fn, ms = 5000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await sleep(150); } return false; };

// 진행 값 기록(바뀔 때마다 한 줄)
const seen = [];
let lastSig = '';
const progOf = () => { try { const s = call('session.list').find((x) => x.name === NAME_H); return s ? { sid: s.sessionId, state: s.state, p: s.orch ? s.orch.progress || null : null, orch: !!s.orch } : null; } catch (e) { log('목록 실패', e.message.slice(0, 80)); return null; } };
function note(x) {
  const p = x && x.p;
  const sig = p ? `${p.key} ${p.done}/${p.total} run${p.running} fail${p.failed}${p.finished ? ' finished' : ''} [${p.items.map((i) => i.state[0]).join('')}]` : 'none';
  if (sig !== lastSig) { lastSig = sig; seen.push({ at: new Date().toISOString(), state: x ? x.state : null, sig }); log(`진행 ${x ? x.state : '?'} ${sig}`); }
}
let ticker = setInterval(() => note(progOf()), 2000);

// emit: 끝난 진짜 진행 → 도는 중 흉내(첫 갈래 끝, 가운데 셋 도는 중, 마지막 기다림)
let FAKE = null;
function fakeRunning() {
  const s = call('session.list').find((x) => x.name === NAME_H);
  const p = s && s.orch && s.orch.progress;
  const base = p || { kind: 'dag', key: 'dag:textkit', label: 'textkit', items: [{ name: 'Record untouched baseline' }, { name: 'Build slugify and package scaffold' }, { name: 'Build word_count and tests' }, { name: 'Build wrap_lines and tests' }, { name: 'Verify package and full suite' }] };
  const now = Date.now();
  const items = base.items.map((it, i) => ({ name: it.name, state: i === 0 ? 'done' : i < base.items.length - 1 ? 'running' : 'pending', startedAt: i === 0 ? now - 150000 : i < base.items.length - 1 ? now - 62000 : null, endedAt: i === 0 ? now - 95000 : null }));
  return { ...s, state: 'working', orch: { ...(s.orch || { on: true, scope: 'sub' }), progress: { ...base, done: 1, total: items.length, running: items.length - 2, failed: 0, finished: false, items } } };
}
const inject = (pg) => (FAKE ? pg.evaluate((v) => window.__mt.api.emit('session.updated', v), FAKE).then(() => sleep(600)) : Promise.resolve());

async function pcShots(stage) {
  const { app, page } = await launch({ log, env: { ...ENV }, args: [`--remote-debugging-port=${DEBUG}`, ...AWAKE] });
  try {
    await awayWin(app);
    await page.setViewportSize({ width: 1600, height: 1000 }).catch(() => {});
    for (const lang of ['ko', 'en']) {
      call('settings.set', { key: 'language', value: lang }); await sleep(1500);
      await inject(page);
      const x = progOf(); note(x);
      if (!x) { log('h1 없음'); continue; }
      const sel = `.react-flow__node[data-id="${x.sid}"]`;
      await page.waitForSelector(sel, { timeout: 30000 }).catch(() => log('노드를 못 찾음'));
      const ok = await until(() => page.$(`${sel} [data-role=progress-chip]`), 15000);
      if (FAKE) await inject(page);
      const chip = await page.evaluate((s) => { const e = document.querySelector(s); return e ? { text: e.textContent, done: e.dataset.done, total: e.dataset.total, finished: e.dataset.finished, title: e.title } : null; }, `${sel} [data-role=progress-chip]`);
      check(`[${lang}·${stage}] 판 카드 머리에 안 진행 칩`, ok && chip, chip);
      const head = await rectOf(page, `${sel} .mt-node-head`, 4) || await rectOf(page, sel);
      if (head) await shot(page, `card-${stage}-${lang}`, { ...head, height: Math.min(head.height, 60) });
      if (chip) {
        if (FAKE) await inject(page);
        await page.click(`${sel} [data-role=progress-chip]`);
        const popOk = await until(() => page.$('[data-role=progress-pop]'), 3000);
        const rows = await page.evaluate(() => [...document.querySelectorAll('[data-role=progress-row]')].map((r) => r.innerText.replace(/\s+/g, ' ')));
        check(`[${lang}·${stage}] 칩을 누르면 갈래 목록(이름·상태·걸린 시간)`, popOk && rows.length === Number(chip.total), rows);
        const pr = await rectOf(page, '[data-role=progress-pop]', 8);
        const hr = head || pr;
        if (pr) await shot(page, `pop-${stage}-${lang}`, { x: Math.min(hr.x, pr.x), y: Math.min(hr.y, pr.y), width: Math.max(hr.x + hr.width, pr.x + pr.width) - Math.min(hr.x, pr.x), height: Math.max(hr.y + hr.height, pr.y + pr.height) - Math.min(hr.y, pr.y) });
        await page.keyboard.press('Escape'); await sleep(300);
        check(`[${lang}·${stage}] Esc로 겉판이 닫힌다`, !(await page.$('[data-role=progress-pop]')));
      }
      // 세션 맵
      for (let i = 0; i < 3 && (await page.$('[data-role="mission"]')); i++) { await page.keyboard.press('Escape'); await sleep(400); }
      await page.click('[data-action="mission-rail"]').catch((e) => log('맵 단추 실패', e.message.slice(0, 80)));
      await page.waitForSelector('[data-role="mission"] .mt-ta-card', { timeout: 20000 }).catch(() => log('맵 카드 없음'));
      await sleep(1500); await inject(page);
      const mc = await page.evaluate(() => { const e = document.querySelector('[data-role="mission"] [data-role=ta-progress]'); return e ? { text: e.textContent, finished: e.dataset.finished } : null; });
      check(`[${lang}·${stage}] 세션 맵 카드에 같은 칩`, mc && chip && mc.text === chip.text, { mc, chip: chip && chip.text });
      const card = await page.evaluate((id) => { const e = document.querySelector(`[data-role="mission"] .mt-ta-card[data-name="${id}"]`); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.max(0, r.x - 30), y: Math.max(0, r.y - 30), width: r.width + 60, height: r.height + 60 }; }, NAME_H);
      if (card) await shot(page, `map-${stage}-${lang}`, card);
      await shot(page, `mapfull-${stage}-${lang}`);
      for (let i = 0; i < 3 && (await page.$('[data-role="mission"]')); i++) { await page.keyboard.press('Escape'); await sleep(400); }
    }
  } finally { await closeApp(app); }
}

async function phoneShots(stage, langs = ['ko', 'en']) {
  const pw = await import('playwright');
  const toUrl = (p) => 'file:///' + p.replace(/\\/g, '/');
  const { startTsSim } = await import(toUrl(path.join(REPO, 'backend', 'tools', 'ts-sim-proxy.mjs')));
  const sim = startTsSim({ listen: SIM, target: Number(PORT), name: L59.NAME, login: L59.LOGIN, keepOrigin: true }); sim.cfg.ip = L59.LAPTOP_A;
  await sim.ready;
  const pwDir = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright');
  const chromeExe = (() => { try { return fs.readdirSync(pwDir).filter((x) => /^chromium-\d+$/.test(x)).sort().reverse().map((x) => path.join(pwDir, x, 'chrome-win64', 'chrome.exe')).find((f) => fs.existsSync(f)); } catch { return null; } })();
  const SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
  const browser = await pw.chromium.launch({ headless: true, ...(chromeExe ? { executablePath: chromeExe } : {}) });
  try {
    for (const lang of langs) {
      call('settings.set', { key: 'language', value: lang });
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: SAFARI, locale: lang === 'ko' ? 'ko-KR' : 'en-US', reducedMotion: 'reduce' });
      const pg = await ctx.newPage();
      pg.on('pageerror', (e) => log(`[phone pageerror] ${e.message}`));
      await pg.goto(`http://localhost:${SIM}/`);
      await pg.waitForSelector('[data-role=pair]', { timeout: 30000 });
      await pg.fill('[data-field=pair-code]', call('device.code').code);
      await pg.click('[data-action=pair-submit]');
      await pg.waitForFunction(() => window.__mt && window.__mt.getState().boardLoaded && window.__mt.api.conn.phase === 'open', null, { timeout: 60000 });
      await sleep(2500); await inject(pg);
      const ok = await until(() => pg.$('[data-role=ta-progress]'), 15000);
      const tile = await pg.evaluate(() => { const e = document.querySelector('[data-role=ta-progress-tile]'); if (!e) return null; const r = e.getBoundingClientRect(); return { text: e.textContent, shown: r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden' }; });
      check(`[${lang}·${stage}] 휴대폰 맵 타일(멀리 단계)에 짧은 칩이 보인다`, tile && tile.shown, tile);
      const t = await pg.evaluate(() => { const e = document.querySelector('[data-role=ta-progress]'); return e ? { text: e.textContent, finished: e.dataset.finished } : null; });
      check(`[${lang}·${stage}] 휴대폰 맵 카드에 칩`, ok && t, t);
      const x = progOf();
      const card = x ? await pg.evaluate((id) => { const e = document.querySelector(`.mt-ta-card[data-name="${id}"]`); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.max(0, r.x - 16), y: Math.max(0, r.y - 16), width: Math.min(390, r.width + 32), height: r.height + 32 }; }, NAME_H) : null;
      if (card) await shot(pg, `phone-card-${stage}-${lang}`, card);
      await shot(pg, `phone-${stage}-${lang}`);
      await ctx.close();
    }
  } finally { await browser.close().catch(() => {}); try { sim.close && sim.close(); } catch {} }
}

try {
  if (MODE === 'emit') {
    FAKE = fakeRunning(); log('흉내 진행', JSON.stringify(FAKE.orch.progress).slice(0, 400));
    await pcShots('run'); await phoneShots('run');
    throw Object.assign(new Error('emit 끝'), { emitDone: true });
  }
  log('진행이 나타나기를 기다린다');
  let x = null;
  const t0 = Date.now();
  while (Date.now() - t0 < 25 * 60e3) { x = progOf(); note(x); if (x && x.p && !x.p.finished && x.p.running > 0) break; await sleep(2000); }
  if (!(x && x.p && !x.p.finished)) throw new Error('도는 진행이 나타나지 않았다');
  await pcShots('run');
  x = progOf(); note(x);
  if (x && x.p && !x.p.finished) await phoneShots('run');
  log('끝을 기다린다');
  const t1 = Date.now();
  while (Date.now() - t1 < 40 * 60e3) { x = progOf(); note(x); if (!x || !x.p || x.p.finished) break; await sleep(2000); }
  check('도는 진행을 본 뒤 끝난 진행(N/N 끝)이 남는다', x && x.p && x.p.finished && x.p.done === x.p.total, x && x.p);
  if (x && x.p && x.p.finished) { await pcShots('done'); await phoneShots('done', ['ko']); }
  check('진행이 0에서 시작해 끝까지 바뀌었다', seen.length >= 3, seen.map((s) => s.sig));
} catch (e) { if (!e.emitDone) { log('오류', e.stack || e.message); check('시험이 끝까지 돌았다', false, e.message); } }
finally {
  clearInterval(ticker);
  fs.writeFileSync(path.join(OUT, 'progress-log.json'), JSON.stringify(seen, null, 2));
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  log(`결과 ${results.filter((r) => r.ok).length}/${results.length}`);
  process.exit(0);
}
